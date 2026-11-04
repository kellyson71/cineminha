// Soundboard: busca no MyInstants e repassa os MP3 (o site não libera CORS para o navegador)
//   GET ?q=texto           → lista de sons
//   GET ?f=/media/sounds/x.mp3 → o arquivo de som
import { json } from './_redis.js'

const BASE = 'https://www.myinstants.com'
const UA = { 'user-agent': 'Mozilla/5.0 (Cineminha)' }
const okFile = f => typeof f === 'string' && /^\/media\/sounds\/[\w.%()+-]{1,160}\.mp3$/i.test(f)
export default async function handler(req, res) {
  try {
    const u = new URL(req.url, 'http://x').searchParams
    const f = u.get('f')
    if (f != null) {
      if (!okFile(f)) return json(res, 400, { error: 'arquivo' })
      const r = await fetch(BASE + f, { headers: UA })
      if (!r.ok) return json(res, 404, { error: 'som' })
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > 2_500_000) return json(res, 413, { error: 'grande' })
      res.statusCode = 200
      res.setHeader('content-type', 'audio/mpeg')
      res.setHeader('cache-control', 'public, max-age=604800, immutable')
      return res.end(buf)
    }
    const q = String(u.get('q') || '').trim().slice(0, 60)
    const r = await fetch(`${BASE}/api/v1/instants/?format=json${q ? '&name=' + encodeURIComponent(q) : ''}`, { headers: UA })
    if (!r.ok) return json(res, 502, { error: 'myinstants' })
    const data = await r.json()
    const list = (data.results || []).slice(0, 30).map(s => {
      const path = String(s.sound || '').replace(BASE, '')
      return okFile(path) ? { n: String(s.name || '').slice(0, 40), f: path, c: /^[0-9a-f]{6}$/i.test(s.color || '') ? '#' + s.color : '' } : null
    }).filter(Boolean)
    res.statusCode = 200
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'public, max-age=600')
    return res.end(JSON.stringify({ list }))
  } catch (e) { json(res, 500, { error: String(e.message || e) }) }
}
