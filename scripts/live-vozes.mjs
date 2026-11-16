#!/usr/bin/env node
// Cria na sua conta da ElevenLabs as vozes de personagem dos pix da live (Voice Design: a voz nasce de uma
// descrição, não imita ninguém) e grava os ids em public/live/vozes-ia.json. Deixa uma amostra de cada
// voz em tmp/vozes-live/ para você ouvir.
//   node scripts/live-vozes.mjs            cria as que ainda não existem
//   node scripts/live-vozes.mjs vilao      recria só essa
// A chave vem de ELEVENLABS_API_KEY (ambiente ou .env.local) e precisa das permissões
// "Text to Speech" e "Voice Generation".
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const raiz = new URL('..', import.meta.url).pathname
if (!process.env.ELEVENLABS_API_KEY && existsSync(path.join(raiz, '.env.local')))
  for (const l of readFileSync(path.join(raiz, '.env.local'), 'utf8').split('\n')) { const m = l.match(/^ELEVENLABS_API_KEY="?(.*?)"?$/); if (m) process.env.ELEVENLABS_API_KEY = m[1] }
const chave = process.env.ELEVENLABS_API_KEY
if (!chave) { console.error('Falta ELEVENLABS_API_KEY (no .env.local).'); process.exit(1) }

const PERSONAGENS = {
  locutor: { nome: 'Locutor da rádio', descricao: 'Locutor de rádio brasileiro dos anos 80, homem adulto, voz grave, empolgada e teatral, fala português do Brasil como quem anuncia um prêmio ao vivo',
    texto: 'Atenção, atenção, ouvintes da rádio! Acabou de cair dinheiro na conta do streamer, e foi ela que mandou! Que coisa linda, gente, que coisa linda!' },
  desenho: { nome: 'Mascote de desenho', descricao: 'Mascote de desenho animado inventado, voz bem aguda, rápida, elétrica e engraçada, cheio de energia, fala português do Brasil rindo entre as frases',
    texto: 'Oba oba oba! Chegou pix, chegou pix! Eu tô muito feliz, muito feliz mesmo, olha esse dinheiro todo! Vamos comprar um monte de coisa, hihihi!' },
  vilao: { nome: 'Vilão de novela', descricao: 'Vilão dramático de novela brasileira, voz grave, lenta e ameaçadora, fala português do Brasil com pausas exageradas e tom de quem planeja algo',
    texto: 'Então você achou que eu não ia perceber esse pix... Muito bem. Muito bem mesmo. Agora o seu dinheiro é meu, e ninguém vai me impedir. Ha, ha, ha.' },
  vovo: { nome: 'Vovó fofoqueira', descricao: 'Vovó brasileira simpática e fofoqueira, voz idosa, carinhosa e animada, fala português do Brasil como quem conta uma novidade no portão',
    texto: 'Ai, meu filho, você não sabe da maior! A menina mandou um pix pra você, viu? Eu vi tudinho daqui da janela. Que moça boa, casa logo com ela!' },
  gala: { nome: 'Galã de novela', descricao: 'Galã romântico de novela das nove, homem adulto, voz suave, grave e exageradamente sedutora, fala português do Brasil devagar e com charme',
    texto: 'Meu amor... esse pix tocou o meu coração de um jeito que eu nem sei explicar. Cada centavo dele vale mais que todas as estrelas desse céu.' },
  narrador: { nome: 'Narrador de futebol', descricao: 'Narrador de futebol brasileiro na televisão, homem adulto, voz forte, rápida e empolgadíssima, fala português do Brasil gritando como em lance de gol',
    texto: 'Lá vem ela, lá vem ela, ajeitou, mandou o pix e é dinheiro! É dinheiro! É dinheiro na conta do streamer! Que lance espetacular, minha gente!' },
}

const API = 'https://api.elevenlabs.io/v1'
const pede = async (url, corpo) => {
  const r = await fetch(API + url, { method: 'POST', headers: { 'xi-api-key': chave, 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.detail?.message || `erro ${r.status}`)
  return j
}
const arq = path.join(raiz, 'public/live/vozes-ia.json')
const vozes = existsSync(arq) ? JSON.parse(readFileSync(arq, 'utf8')) : {}
const amostras = path.join(raiz, 'tmp/vozes-live'); mkdirSync(amostras, { recursive: true })
const so = process.argv[2]

for (const [k, p] of Object.entries(PERSONAGENS)) {
  if (so ? so !== k : vozes[k]?.id) continue
  process.stdout.write(`${p.nome}… `)
  try {
    const d = await pede('/text-to-voice/design', { voice_description: p.descricao, model_id: 'eleven_multilingual_ttv_v2', text: p.texto })
    const prev = d.previews?.[0]; if (!prev) throw new Error('sem prévia')
    writeFileSync(path.join(amostras, `${k}.mp3`), Buffer.from(prev.audio_base_64, 'base64'))
    const v = await pede('/text-to-voice', { voice_name: `Live · ${p.nome}`, voice_description: p.descricao, generated_voice_id: prev.generated_voice_id })
    vozes[k] = { id: v.voice_id, nome: p.nome }
    writeFileSync(arq, JSON.stringify(vozes, null, 2) + '\n')
    console.log('pronta')
  } catch (e) { console.log('falhou: ' + e.message) }
}
console.log(`\nVozes em ${path.relative(raiz, arq)}; amostras em ${path.relative(raiz, amostras)}/`)
