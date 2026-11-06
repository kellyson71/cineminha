/* Áudio da sala no app: vozes por pessoa (WebAudio, até 200%), efeitos sonoros e saída dos jogos. */
import { CFG } from '../data.js'
import { on, getSala } from './sala.js'

let ac = null, master = null, vozes = null, efeitos = null, jogo = null
export function audioCtx() {
  if (ac) return ac
  ac = new AudioContext({ latencyHint: 'interactive' })
  master = ac.createGain(); master.connect(ac.destination)
  vozes = ac.createGain(); vozes.connect(master)
  efeitos = ac.createGain(); efeitos.connect(master)
  jogo = ac.createGain(); jogo.connect(master)
  return ac
}
export const saidaJogo = () => { audioCtx(); return jogo }

const voz = new Map() // peerId -> { el, src, gain }
let cfg = { mix: { master: 1, voices: 1, sfx: 0.7 }, vols: {}, deaf: false }

function ganhoDe(peerId) {
  const key = getSala().peers[peerId]?.key
  const v = cfg.vols[key] || {}
  return cfg.deaf || v.voiceMute ? 0 : v.voice ?? 1
}
export function aplicarAudio(novo) {
  cfg = { ...cfg, ...novo }
  if (!ac) return
  master.gain.value = cfg.mix.master ?? 1
  vozes.gain.value = cfg.deaf ? 0 : cfg.mix.voices ?? 1
  efeitos.gain.value = cfg.deaf ? 0 : cfg.mix.sfx ?? 0.7
  voz.forEach((x, id) => { x.gain.gain.value = ganhoDe(id) })
}
// volume do filme de quem projeta (no <video>, máximo 1)
export function volumeTela(key) {
  const v = cfg.vols[key] || {}
  return cfg.deaf || v.movieMute ? 0 : Math.min(1, (cfg.mix.master ?? 1) * (cfg.mix.movie ?? 1) * (v.movie ?? 1))
}

on('voz', (peerId, stream) => {
  audioCtx(); ac.resume().catch(() => {})
  fim(peerId)
  // o Chrome só entrega áudio WebRTC ao WebAudio se a trilha também estiver num elemento (mudo)
  const el = new Audio(); el.muted = true; el.srcObject = stream; el.play().catch(() => {})
  const src = ac.createMediaStreamSource(stream)
  const gain = ac.createGain(); gain.gain.value = ganhoDe(peerId)
  src.connect(gain).connect(vozes)
  voz.set(peerId, { el, src, gain })
})
function fim(peerId) {
  const x = voz.get(peerId)
  if (!x) return
  x.src.disconnect(); x.gain.disconnect(); x.el.srcObject = null
  voz.delete(peerId)
}
on('voz-fim', fim)
on('saiu', () => [...voz.keys()].forEach(fim))

// sons de aviso (entrou, saiu, chat…), decodificados uma vez
const buf = new Map()
async function sfx(nome) {
  const url = CFG.sons?.[nome]
  if (!url || cfg.deaf) return
  audioCtx()
  try {
    if (!buf.has(url)) buf.set(url, fetch(url).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)))
    const s = ac.createBufferSource(); s.buffer = await buf.get(url); s.connect(efeitos); s.start()
  } catch {}
}
export const tocar = sfx
on('som', nome => sfx(nome))
