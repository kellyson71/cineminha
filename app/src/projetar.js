/* Projetar no app: tela/janela com o som certo, ou arquivo (qualquer formato, via ffmpeg). */
import * as sala from './sala/sala.js'
import { cine } from './desktop.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

// microfone "virtual" pelo rótulo (o monitor de uma saída do PipeWire/PulseAudio)
async function entradaPorRotulo(rotulo) {
  const devs = await navigator.mediaDevices.enumerateDevices()
  const d = devs.find(x => x.kind === 'audioinput' && x.label === rotulo) || devs.find(x => x.kind === 'audioinput' && x.label.startsWith(rotulo))
  if (!d) throw new Error('Não achei a saída de som para capturar')
  const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: d.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, sampleRate: 48000 } })
  return s.getAudioTracks()[0]
}

// som da projeção conforme a escolha: sistema, um programa só ou nenhum
async function somDaProjecao(fonte, trilhaDaTela) {
  if (fonte === 'nenhum') { trilhaDaTela?.stop(); return { at: null, fim: () => {} } }
  if (!cine || cine.plataforma !== 'linux') return { at: trilhaDaTela || null, fim: () => {} } // Windows: loopback do sistema
  trilhaDaTela?.stop()
  try {
    if (fonte.startsWith('app:')) {
      const { rotulo, nome } = await cine.separarSom(fonte.slice(4))
      await sleep(300) // o PipeWire leva um instante para listar a saída nova
      const at = await entradaPorRotulo(rotulo)
      sala.toast(`Som de ${nome} indo junto, sem as vozes`)
      return { at, fim: () => { at.stop(); cine.juntarSom() } }
    }
    const { rotulo } = await cine.somSistema()
    const at = await entradaPorRotulo(rotulo)
    return { at, fim: () => { at.stop(); cine.juntarSom() } }
  } catch (e) {
    sala.toast(e.message || 'Sem som na projeção')
    return { at: null, fim: () => {} }
  }
}

async function capturar({ game, audio }) {
  const fps = game ? 60 : 30
  const tela = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: fps, max: fps }, width: { max: game ? 1280 : 1920 }, height: { max: game ? 720 : 1080 } },
    audio: true, systemAudio: 'include',
  }).catch(() => null)
  if (!tela) return null
  const vt = tela.getVideoTracks()[0]
  vt.contentHint = game ? 'motion' : 'detail'
  const som = await somDaProjecao(audio, tela.getAudioTracks()[0])
  if (som.at) som.at.contentHint = 'music'
  return { vt, at: som.at, fim: som.fim }
}

export async function projetarTela({ game, audio }) {
  const cap = await capturar({ game, audio })
  if (!cap) return
  const stream = new MediaStream([cap.vt, ...(cap.at ? [cap.at] : [])])
  cap.vt.addEventListener('ended', () => { if (sala.minhaProjecao()?.stream === stream) sala.pararProjecao() })
  sala.projetar(stream, { kind: 'tela', game, titulo: cap.vt.label || '', cleanup: cap.fim })
}

// troca a tela/janela sem parar a transmissão
export async function trocarTela({ audio }) {
  const s = sala.minhaProjecao()
  if (s?.kind !== 'tela') return
  const cap = await capturar({ game: s.game, audio })
  if (!cap) return
  const velhaV = s.stream.getVideoTracks()[0], velhaA = s.stream.getAudioTracks()[0]
  sala.trocarTrilha(velhaV, cap.vt)
  if (velhaA && cap.at) sala.trocarTrilha(velhaA, cap.at)
  s.cleanup?.(); s.cleanup = cap.fim
}

// toca 1,5 s e vê se o Chromium decodifica vídeo e som de verdade
async function decodifica(v) {
  try { await v.play() } catch { return { video: false, audio: false } }
  await sleep(1500)
  const r = { video: v.videoWidth > 0 && v.webkitVideoDecodedByteCount > 0, audio: v.webkitAudioDecodedByteCount > 0 }
  v.pause(); v.currentTime = 0
  return r
}

export async function projetarArquivo(file, setBusy) {
  const nome = file.name.replace(/\.[a-z0-9]{2,4}$/i, '')
  const v = Object.assign(document.createElement('video'), { playsInline: true, controls: false, muted: true, preload: 'auto', className: 'filevideo' })
  v.crossOrigin = 'anonymous'
  let url = URL.createObjectURL(file), leg = null, revoga = true
  v.src = url
  let ok = await decodifica(v)
  if ((!ok.video || !ok.audio) && cine?.converter) {
    // formato que o Chromium não toca (MKV com AC3/DTS, HEVC…): o ffmpeg arruma
    URL.revokeObjectURL(url); revoga = false
    const caminho = cine.caminho(file)
    const off = cine.onProgresso(p => setBusy(`Preparando ${nome} · ${Math.round(p * 100)}%`))
    try {
      setBusy(`Preparando ${nome}…`)
      let r = await cine.converter(caminho, {})
      v.src = r.url; ok = await decodifica(v)
      if (!ok.video) { setBusy(`Convertendo o vídeo de ${nome} (demora mais)…`); r = await cine.converter(caminho, { forcarVideo: true }); v.src = r.url; ok = await decodifica(v) }
      leg = r.leg
      url = r.url
    } finally { off() }
  } else if (!ok.video && !ok.audio) throw new Error('Esse arquivo não abre. Use MP4 (H.264 + AAC).')
  if (!ok.video) throw new Error('Não consegui ler o vídeo desse arquivo')
  setBusy('')

  const cap = v.captureStream()
  for (let i = 0; i < 30 && !cap.getVideoTracks().length; i++) await sleep(100)
  if (!cap.getVideoTracks().length) throw new Error('Não consegui ler o vídeo desse arquivo')
  cap.getVideoTracks().forEach(t => { t.contentHint = 'motion' })
  cap.getAudioTracks().forEach(t => { t.contentHint = 'music' })
  v.muted = false

  // legenda embutida (MKV): manda o texto de cada fala para todos, como o site faz
  let subs = false
  if (leg) {
    const tr = Object.assign(document.createElement('track'), { kind: 'subtitles', src: leg, default: true })
    v.append(tr)
    tr.track.mode = 'hidden'
    tr.track.addEventListener('cuechange', () => sala.enviarLegenda([...(tr.track.activeCues || [])].map(c => c.text.replace(/<[^>]+>/g, '')).join('\n')))
    subs = true
  }
  sala.projetar(cap, { kind: 'arquivo', video: v, paused: true, subs, titulo: nome, cleanup: () => { v.pause(); v.removeAttribute('src'); v.load(); if (revoga) URL.revokeObjectURL(url) } })
  sala.toast(`Projetando ${file.name}${leg ? ' · com legenda' : ''}`)
}
