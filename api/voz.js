import { createHash } from 'node:crypto'
import { json, readBody, redis } from './_redis.js'
import VOZES from '../public/live/vozes-ia.json' with { type: 'json' }

// Voz dos pix da live (ElevenLabs). A chave fica só aqui no servidor (ELEVENLABS_API_KEY).
// Só aceita as vozes criadas para a live (public/live/vozes-ia.json) e textos curtos, com limite de
// caracteres por dia para não gastar os créditos. O mesmo texto na mesma voz fica guardado 10 minutos:
// o estúdio e a página dela pedem o mesmo pix e a ElevenLabs só cobra uma vez.
const LIMITE_DIA = +(process.env.VOZ_LIMITE_DIA || 6000)

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'metodo' })
  const chave = process.env.ELEVENLABS_API_KEY
  if (!chave) return json(res, 503, { error: 'sem-chave' })
  const b = await readBody(req, 4000).catch(() => ({}))
  const voz = VOZES[String(b.voz || '')]
  const texto = String(b.texto || '').replace(/\s+/g, ' ').trim().slice(0, 240)
  if (!voz?.id || !texto) return json(res, 400, { error: 'pedido' })

  const id = 'vozcache:' + createHash('sha1').update(voz.id + '|' + texto).digest('hex')
  const guardado = await redis('GET', id).catch(() => null)
  if (guardado) return manda(res, Buffer.from(guardado, 'base64'))

  const dia = 'vozchars:' + new Date().toISOString().slice(0, 10)
  const usados = await redis('INCRBY', dia, texto.length).catch(() => 0)
  if (usados === texto.length) redis('EXPIRE', dia, 172800).catch(() => {})
  if (usados > LIMITE_DIA) return json(res, 429, { error: 'limite' })

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz.id}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': chave, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text: texto, model_id: voz.modelo || 'eleven_multilingual_v2', voice_settings: { stability: .35, similarity_boost: .8, style: .45, use_speaker_boost: true } }),
  }).catch(() => null)
  if (!r?.ok) return json(res, 502, { error: 'elevenlabs', status: r?.status || 0 })
  const audio = Buffer.from(await r.arrayBuffer())
  redis('SET', id, audio.toString('base64'), 'EX', 600).catch(() => {})
  return manda(res, audio)
}

function manda(res, audio) {
  res.statusCode = 200
  res.setHeader('content-type', 'audio/mpeg')
  res.setHeader('cache-control', 'private, max-age=600')
  res.end(audio)
}
