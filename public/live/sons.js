/* Sons e voz da live (tocam em cada lado, na hora em que a animação aparece). */
import LIVE from './config.js'
let ctx = null
const ac = () => (ctx ||= new AudioContext())

// som do pix: o arquivo do config (somPix) ou, sem ele, um "plim-plim" de caixa registradora
export async function somPix() {
  if (LIVE.somPix) try { const a = new Audio(LIVE.somPix); a.volume = .7; await a.play(); return } catch {}
  const c = ac(), t = c.currentTime
  ;[[1318.5, 0], [1760, .09], [2637, .18]].forEach(([f, d]) => {
    const o = c.createOscillator(), g = c.createGain()
    o.type = 'triangle'; o.frequency.value = f
    g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(.22, t + d + .01); g.gain.exponentialRampToValueAtTime(.001, t + d + .45)
    o.connect(g).connect(c.destination); o.start(t + d); o.stop(t + d + .5)
  })
}
export function somLinha(entrou) {
  const c = ac(), t = c.currentTime
  ;(entrou ? [660, 880] : [880, 520]).forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain()
    o.type = 'sine'; o.frequency.value = f
    g.gain.setValueAtTime(0, t + i * .12); g.gain.linearRampToValueAtTime(.12, t + i * .12 + .02); g.gain.exponentialRampToValueAtTime(.001, t + i * .12 + .3)
    o.connect(g).connect(c.destination); o.start(t + i * .12); o.stop(t + i * .12 + .35)
  })
}

// voz lendo o pix: prefere a voz do Google em português
let vozes = []
const carrega = () => { vozes = speechSynthesis.getVoices() }
try { carrega(); speechSynthesis.onvoiceschanged = carrega } catch {}
// vozes de personagem para o pix (só tom e velocidade da voz do navegador: não imitam ninguém)
export const VOZES = {
  normal: { nome: 'Normal', pitch: 1, rate: 1.04 },
  grossa: { nome: 'Voz grossa', pitch: .3, rate: .88 },
  esquilo: { nome: 'Esquilo', pitch: 2, rate: 1.3 },
  locutor: { nome: 'Locutor', pitch: .65, rate: 1.12 },
  robo: { nome: 'Robô', pitch: 0, rate: .82 },
  apressada: { nome: 'Apressada', pitch: 1.3, rate: 1.8 },
  sono: { nome: 'Com sono', pitch: .8, rate: .62 },
}
export function fala(txt, voz = 'normal') {
  try {
    const v = VOZES[voz] || VOZES.normal
    const u = new SpeechSynthesisUtterance(txt)
    u.lang = 'pt-BR'; u.rate = v.rate; u.pitch = v.pitch
    const pt = vozes.filter(v => /^pt(-|_)BR/i.test(v.lang))
    // as vozes "naturais" (quando o sistema tem) soam bem melhor que a do Google
    u.voice = pt.find(v => /natural|online/i.test(v.name)) || pt.find(v => /google/i.test(v.name)) || pt[0] || null
    speechSynthesis.speak(u)
  } catch {}
}
// abertura do pix: uma frase sorteada pelo estúdio (a mesma nos dois lados), lida pelo locutor;
// depois a mensagem dela, na voz que ela escolheu
export const ABERTURAS = [
  (e, v) => `Olha o pix! ${e} mandou ${v}!`,
  (e, v) => `Alerta de dinheiro na conta! ${v} da ${e}!`,
  (e, v) => `Pix na live! ${e} acabou de mandar ${v}.`,
  (e, v) => `Atenção, atenção! ${e} chegou com ${v}!`,
  (e, v) => `Plim! Caiu ${v} da ${e}.`,
  (e, v) => `Quem manda é ela: ${e} mandou ${v}!`,
  (e, v) => `Segura essa: ${v} da ${e} na conta do streamer!`,
]
const porExtenso = v => `${Number(v).toLocaleString('pt-BR')} ${v == 1 ? 'real' : 'reais'}`
// vozes de personagem da ElevenLabs (criadas com scripts/live-vozes.mjs): chave "ia:<nome>"
let IA = {}
export const vozesIA = fetch('vozes-ia.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : {}).then(j => (IA = j || {})).catch(() => ({}))
const ehIA = voz => typeof voz === 'string' && voz.startsWith('ia:') && !!IA[voz.slice(3)]?.id
export const vozValida = voz => !!VOZES[voz] || ehIA(voz)
// pede o áudio pronto ao servidor (o mesmo pix nos dois lados sai do mesmo áudio guardado)
const audioIA = (texto, voz) => fetch('../api/voz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto, voz }) })
  .then(r => r.ok ? r.blob() : Promise.reject(r.status))
// "vel" do personagem: mais rápido fica agudo (mascote), mais devagar fica grave (vilão, gigante)
export const tocaIA = (blob, vel = 1) => new Promise(ok => {
  const a = new Audio(URL.createObjectURL(blob))
  a.preservesPitch = false; a.playbackRate = vel
  a.onended = a.onerror = () => ok(); a.play().catch(ok)
})
const toca = tocaIA
export async function falaPix(ela, valor, msg, voz, abre = 0) {
  await vozesIA
  const abertura = (ABERTURAS[abre] || ABERTURAS[0])(ela, porExtenso(valor))
  const locutorIA = !!IA.locutor?.id, msgIA = ehIA(voz)
  // pede os dois áudios juntos (mais rápido) e toca em sequência; se algo falhar, a voz do navegador assume
  const pA = locutorIA ? audioIA(abertura, 'locutor').catch(() => null) : null
  const pM = msg && msgIA ? audioIA(msg, voz.slice(3)).catch(() => null) : null
  const a = await pA
  if (a) await toca(a, IA.locutor?.vel); else fala(abertura, 'locutor')
  if (!msg) return
  const m = await pM
  if (m) await toca(m, IA[voz.slice(3)]?.vel)
  else fala(msg, msgIA ? 'normal' : voz)
}

// nível da voz (0..1) de um stream, para o avatar da ligação
export function medidor(stream, aoMedir) {
  const c = ac(), src = c.createMediaStreamSource(stream), an = c.createAnalyser()
  an.fftSize = 512; src.connect(an)
  const buf = new Float32Array(an.fftSize)
  let vivo = true
  ;(function mede() {
    if (!vivo) return
    an.getFloatTimeDomainData(buf)
    let s = 0; for (const x of buf) s += x * x
    aoMedir(Math.min(1, Math.max(0, (Math.sqrt(s / buf.length) - .012) * 9)))
    setTimeout(mede, 60)
  })()
  return () => { vivo = false; try { src.disconnect() } catch {} }
}
export const retomaAudio = () => ac().resume()
