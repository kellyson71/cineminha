/* Som real desta aba. A rádio é um player do YouTube (outro site): o navegador não deixa ler o som dele direto,
   mas deixa capturar o áudio da própria aba, que é o que sai no seu fone. Com isso dá para medir a rádio de verdade. */
let stream = null, ctx = null, an = null, buf = null

export const somRealLigado = () => stream?.getAudioTracks()[0]?.readyState === 'live'

export async function ligaSomReal() {
  if (somRealLigado()) return
  const s = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 1, width: 320, height: 180 },
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false },
    preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', systemAudio: 'exclude',
  })
  const a = s.getAudioTracks()[0]
  s.getVideoTracks().forEach(t => t.stop()) // só o som interessa (o som continua sem o vídeo)
  if (!a) { s.getTracks().forEach(t => t.stop()); throw new Error('sem-som') }
  stream = s
  ctx ||= new AudioContext()
  await ctx.resume()
  an = ctx.createAnalyser(); an.fftSize = 2048; buf = new Float32Array(an.fftSize)
  ctx.createMediaStreamSource(new MediaStream([a])).connect(an)
  a.onended = () => { stream = null }
}

export const desligaSomReal = () => { stream?.getTracks().forEach(t => t.stop()); stream = null }

// potência (média do quadrado) do som da aba agora
export function potenciaReal() {
  if (!an) return 0
  an.getFloatTimeDomainData(buf)
  let s = 0; for (const x of buf) s += x * x
  return s / buf.length
}
