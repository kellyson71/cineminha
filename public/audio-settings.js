// Perfis locais: RNNoise sem empilhar a supressão nativa e sem portão por padrão.
// Ambiente ruidoso usa o GTCRN: nos testes com ventilador no microfone, foi o que mais limpou sem
// apagar a voz (STOI 0,92 contra 0,89 do RNNoise com vento forte). Corta acima de 8 kHz.
export const VOICE_PROFILES = {
  balanced: { label: 'Preservar minha voz', engine: 'rnnoise', echo: true, agc: true, highpass: 70, gate: false, threshold: -55, hold: 800, gain: 0 },
  strong: { label: 'Ambiente ruidoso', engine: 'gtcrn', echo: true, agc: true, highpass: 100, gate: true, threshold: -55, hold: 800, gain: 0 },
  raw: { label: 'Sem filtros', engine: 'off', echo: false, agc: false, highpass: 0, gate: false, threshold: -55, hold: 800, gain: 0 },
}
export const DEFAULT_VOICE = VOICE_PROFILES.balanced
const clamp = (v, lo, hi, fallback) => Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : fallback
export function cleanVoice(value = {}) {
  return { engine: ['rnnoise','gtcrn','browser','off'].includes(value.engine) ? value.engine : 'rnnoise', echo: value.echo ?? true, agc: value.agc ?? true, highpass: clamp(value.highpass,0,180,70), gate: !!value.gate, threshold: clamp(value.threshold,-75,-20,-55), hold: clamp(value.hold,150,1600,800), gain: clamp(value.gain,-12,18,0) }
}
export function normalizeAudioPrefs(value) {
  const saved = value || {}
  return { ...saved, spatial: saved.spatialVersion === 3 ? saved.spatial === true : false, spatialVersion: 3, // soundboard: até a v2 ficava baixo demais (limitador em -24 dB e volume 40%); a v3 começa em 85%
    ...(saved.boardVersion === 3 ? {} : { board: Math.max(saved.board ?? .85, .85), boardVersion: 3 }), voiceProfile: saved.voiceProfile || 'balanced', voiceSettings: cleanVoice(saved.voiceSettings || DEFAULT_VOICE), output: saved.output || '' }
}
// Usa a planta, não os pixels da janela: mantém a direção ao mudar de tela cheia.
export function spatialPosition(mine, other, perRow) {
  if (!Number.isInteger(mine) || !Number.isInteger(other) || mine < 0 || other < 0) return { x: 0, z: -2 }
  const width = Math.max(1, perRow)
  const dx = (other % width - mine % width) * .65
  const row = Math.floor(other / width) - Math.floor(mine / width)
  // Limita o ângulo lateral e mantém profundidade, mesmo na mesma fileira.
  return { x: Math.max(-1.2, Math.min(1.2, dx)), z: -2 - Math.min(3, Math.abs(row)) * .5 }
}
export function gateIsOpen({ live, pushToTalk, enabled, db, threshold, now, lastLoud, hold }) {
  return !!live && (pushToTalk || !enabled || db > threshold || now - lastLoud < hold)
}
export function createSpatialVoice(ac, source, destination) {
  const mono = ac.createGain(); mono.channelCount = 1; mono.channelCountMode = 'explicit'
  source.connect(mono)
  const pan = ac.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 3; pan.rolloffFactor = .1
  pan.positionZ.value = -2
  const direct = ac.createGain(), spatial = ac.createGain(), out = ac.createGain()
  // O centro assegura presença nos dois ouvidos; HRTF dá direção e profundidade.
  direct.gain.value = .3; spatial.gain.value = .7
  mono.connect(direct).connect(out); mono.connect(pan).connect(spatial).connect(out); out.connect(destination)
  return { pan, direct, spatial, mono, out, disconnect() { mono.disconnect(); pan.disconnect(); direct.disconnect(); spatial.disconnect(); out.disconnect() } }
}

// Teste da própria voz fica no centro, mesmo se a captura vier só em um canal.
export function createCenteredPlayback(ac, buffer, destination = ac.destination) {
  const mono = ac.createBuffer(1, buffer.length, buffer.sampleRate)
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)).filter(samples => samples.some(x => Math.abs(x) > 1e-7))
  const samples = mono.getChannelData(0)
  for (const channel of channels) for (let i = 0; i < samples.length; i++) samples[i] += channel[i] / channels.length
  const source = ac.createBufferSource(), merger = ac.createChannelMerger(2)
  source.buffer = mono
  source.connect(merger, 0, 0); source.connect(merger, 0, 1)
  merger.connect(destination)
  return { source, disconnect() { source.disconnect(); merger.disconnect() } }
}
