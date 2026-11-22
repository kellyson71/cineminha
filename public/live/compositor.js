/* Junta jogo + câmera num vídeo só, para os dois chegarem nela sempre colados.
   Lê os quadros direto das trilhas (MediaStreamTrackProcessor): não depende de requestAnimationFrame,
   então continua liso com a aba do estúdio escondida atrás do jogo.
   Leve de propósito: saída em 720p (ou 1080p), no máximo 30 quadros por segundo, câmera pequena.
   "atraso" segura o jogo (imagem e som) e o microfone para alinhar com a câmera, que vem do celular.
   Modos: 'jogo' (jogo + câmera na moldura) e 'cam' (só a câmera, tela cheia). */

import { camRect, camImagem } from './layout.js'
export const QUALIDADES = { 540: [960, 540], 720: [1280, 720], 1080: [1920, 1080] }

export function criaCompositor({ fps = 30, qualidade = 720 } = {}) {
  let [W, H] = QUALIDADES[qualidade] || QUALIDADES[720]
  const canvas = new OffscreenCanvas(W, H)
  const g = canvas.getContext('2d', { alpha: false, desynchronized: true })
  const giro = new OffscreenCanvas(2, 2), gg = giro.getContext('2d')       // câmera girada/espelhada
  const borrao = new OffscreenCanvas(64, 36), gb = borrao.getContext('2d')  // fundo desfocado barato
  const gerador = new MediaStreamTrackGenerator({ kind: 'video' })
  const escritor = gerador.writable.getWriter()

  let atraso = 0, camLigada = true, modo = 'jogo', parado = false
  // onde a câmera fica (no palco de 1920×1080); ao mudar, desliza junto com a moldura do palco
  let camDe = camImagem(camRect()), camPara = camDe, camT0 = 0
  const DUR = 450, suave = t => 1 - Math.pow(1 - t, 3)
  function camAgora() {
    const t = Math.min(1, (performance.now() - camT0) / DUR), k = suave(t)
    return t >= 1 ? camPara : Object.fromEntries(Object.keys(camPara).map(c => [c, camDe[c] + (camPara[c] - camDe[c]) * k]))
  }
  const ajuste = { rot: 0, espelho: false, zoom: 1, cx: .5, cy: .5, cheia: 'auto' } // enquadramento da câmera
  let camQuadro = null, leitorJogo = null, leitorCam = null, fila = [], ultimoTs = 0, ultimoSolto = 0, escrevendo = false
  let fundo = null
  fetch('assets/fundo-ocean.webp').then(r => r.blob()).then(createImageBitmap).then(b => { fundo = b }).catch(() => {})

  // a câmera já girada/espelhada (só gasta quando precisa)
  function fonteCam() {
    const q = camQuadro, w = q.displayWidth, h = q.displayHeight
    if (!ajuste.rot && !ajuste.espelho) return { src: q, w, h }
    const deitada = ajuste.rot % 180 !== 0, rw = deitada ? h : w, rh = deitada ? w : h
    if (giro.width !== rw || giro.height !== rh) { giro.width = rw; giro.height = rh }
    gg.setTransform(1, 0, 0, 1, 0, 0); gg.translate(rw / 2, rh / 2); gg.rotate(ajuste.rot * Math.PI / 180)
    if (ajuste.espelho) gg.scale(-1, 1)
    gg.drawImage(q, -w / 2, -h / 2)
    return { src: giro, w: rw, h: rh }
  }
  // pedaço da câmera que aparece: a maior área com a proporção do destino, dividida pelo zoom, no ponto escolhido
  function recorte(w, h, aspecto) {
    let rw = w, rh = w / aspecto
    if (rh > h) { rh = h; rw = h * aspecto }
    rw /= ajuste.zoom; rh /= ajuste.zoom
    const x = Math.min(w - rw, Math.max(0, ajuste.cx * w - rw / 2)), y = Math.min(h - rh, Math.max(0, ajuste.cy * h - rh / 2))
    return [x, y, rw, rh]
  }
  const fundoPadrao = () => { if (fundo) g.drawImage(fundo, 0, 0, W, H); else { g.fillStyle = '#1c0830'; g.fillRect(0, 0, W, H) } }
  function desenha(jogo) {
    if (modo === 'cam') return desenhaCamCheia()
    if (jogo) {
      // "contain": o jogo inteiro, com faixa preta se a proporção for outra
      const jw = jogo.displayWidth, jh = jogo.displayHeight, s = Math.min(W / jw, H / jh), dw = jw * s, dh = jh * s
      if (dw < W - 1 || dh < H - 1) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H) }
      g.drawImage(jogo, (W - dw) / 2, (H - dh) / 2, dw, dh)
    } else fundoPadrao()
    if (camQuadro && camLigada) {
      const k = W / 1920, CAM = camAgora(), { src, w, h } = fonteCam(), [sx, sy, sw, sh] = recorte(w, h, CAM.w / CAM.h)
      g.save(); g.beginPath(); g.roundRect(CAM.x * k, CAM.y * k, CAM.w * k, CAM.h * k, CAM.r * k); g.clip()
      g.drawImage(src, sx, sy, sw, sh, CAM.x * k, CAM.y * k, CAM.w * k, CAM.h * k)
      g.restore()
    }
  }
  function desenhaCamCheia() {
    if (!camQuadro) return fundoPadrao()
    const { src, w, h } = fonteCam()
    const inteira = ajuste.cheia === 'inteira' || (ajuste.cheia === 'auto' && h > w) // em pé: mostra inteira com fundo desfocado
    if (inteira) {
      gb.drawImage(src, 0, 0, 64, 36); g.drawImage(borrao, 0, 0, W, H)
      g.fillStyle = '#1c083066'; g.fillRect(0, 0, W, H)
      const [sx, sy, sw, sh] = ajuste.zoom > 1 ? recorte(w, h, w / h) : [0, 0, w, h]
      const s = Math.min(W / sw, H / sh), dw = sw * s, dh = sh * s
      g.drawImage(src, sx, sy, sw, sh, (W - dw) / 2, (H - dh) / 2, dw, dh)
    } else {
      const [sx, sy, sw, sh] = recorte(w, h, W / H)
      g.drawImage(src, sx, sy, sw, sh, 0, 0, W, H)
    }
  }
  // um quadro de cada vez: se a saída ainda está ocupada, esse quadro é pulado (nunca acumula)
  async function solta(ts) {
    if (escrevendo) return
    escrevendo = true
    ts = Math.max(ts, ultimoTs + 1); ultimoTs = ts
    const q = new VideoFrame(canvas, { timestamp: ts })
    try { await escritor.write(q) } catch { q.close() }
    escrevendo = false
  }

  // jogo: cada quadro entra na fila e sai depois do atraso; acima do fps da transmissão, pula
  async function lerJogo(trilha) {
    leitorJogo?.cancel().catch(() => {})
    fila.forEach(x => x.q.close()); fila = []
    if (!trilha) { leitorJogo = null; return }
    const leitor = leitorJogo = new MediaStreamTrackProcessor({ track: trilha, maxBufferSize: 2 }).readable.getReader()
    while (leitorJogo === leitor) {
      const { value: q, done } = await leitor.read().catch(() => ({ done: true }))
      if (done) break
      if (modo === 'cam') { q.close(); continue }
      fila.push({ q, t: performance.now() })
      while (fila.length && performance.now() - fila[0].t >= atraso) {
        const { q: velho } = fila.shift()
        const cedo = performance.now() - ultimoSolto < 1000 / fps - 4
        if (cedo || escrevendo || (fila.length && performance.now() - fila[0].t >= atraso)) { velho.close(); continue }
        ultimoSolto = performance.now()
        desenha(velho); const ts = velho.timestamp; velho.close(); solta(ts)
      }
      if (fila.length > 45) fila.splice(0, fila.length - 45).forEach(x => x.q.close())
    }
    if (leitorJogo === leitor) leitorJogo = null
  }
  async function lerCam(trilha) {
    leitorCam?.cancel().catch(() => {})
    camQuadro?.close(); camQuadro = null
    if (!trilha) { leitorCam = null; return }
    const leitor = leitorCam = new MediaStreamTrackProcessor({ track: trilha, maxBufferSize: 1 }).readable.getReader()
    while (leitorCam === leitor) {
      const { value: q, done } = await leitor.read().catch(() => ({ done: true }))
      if (done) break
      camQuadro?.close(); camQuadro = q
    }
    if (leitorCam === leitor) { camQuadro?.close(); camQuadro = null; leitorCam = null }
  }
  // sem jogo (ou na câmera em tela cheia), um relógio puxa os quadros
  let relogio = 0
  const ligaRelogio = () => { clearInterval(relogio); relogio = setInterval(() => { if (!parado && (!leitorJogo || modo === 'cam')) { desenha(null); solta(performance.now() * 1000) } }, 1000 / fps) }
  ligaRelogio()

  /* ---------- som: mixer com voz e jogo (o mesmo atraso nos dois) ----------
     fonte → atraso → compressor → volume (seu) → automático (nivelar + abaixar) → medidor → saída */
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'playback' })
  const destino = ctx.createMediaStreamDestination()
  const AJUSTE = { mic: { alvo: -20, thr: -26, ratio: 3.5 }, jogo: { alvo: -27, thr: -20, ratio: 2.5 } }
  function canal(nome) {
    const c = { nome, src: null, d: ctx.createDelay(2), comp: ctx.createDynamicsCompressor(), vol: ctx.createGain(), auto: ctx.createGain(), mudo: ctx.createGain(),
      meio: ctx.createAnalyser(), fim: ctx.createAnalyser(), autoGanho: 1 }
    c.comp.knee.value = 10; c.comp.attack.value = .004; c.comp.release.value = .25
    c.meio.fftSize = c.fim.fftSize = 1024
    c.d.connect(c.comp).connect(c.vol).connect(c.meio)
    c.vol.connect(c.auto).connect(c.mudo).connect(c.fim).connect(destino)
    c.buf = new Float32Array(1024)
    return c
  }
  const C = { mic: canal('mic'), jogo: canal('jogo') }
  // só o som do jogo, sem atraso e sem a sua voz: vai para o celular no modo TikTok (o microfone de lá já pega você)
  const destinoJogo = ctx.createMediaStreamDestination(), volSoJogo = ctx.createGain()
  volSoJogo.connect(destinoJogo)
  const liga = (c, trilha) => {
    c.src?.disconnect(); c.src = null
    if (trilha) { c.src = ctx.createMediaStreamSource(new MediaStream([trilha])); c.src.connect(c.d); if (c === C.jogo) c.src.connect(volSoJogo) }
  }
  const mede = (an, buf) => { an.getFloatTimeDomainData(buf); let s = 0, pk = 0; for (const x of buf) { s += x * x; const a = Math.abs(x); if (a > pk) pk = a } return { rms: Math.sqrt(s / buf.length), pico: pk } }
  const db = v => 20 * Math.log10(Math.max(v, 1e-6))
  let nivelar = false, abaixar = false, falando = false, falouEm = 0, aoAbaixar = () => {}
  function modoComp() {
    for (const c of Object.values(C)) {
      const a = AJUSTE[c.nome]
      c.comp.threshold.setTargetAtTime(nivelar ? a.thr : 0, ctx.currentTime, .1)
      c.comp.ratio.setTargetAtTime(nivelar ? a.ratio : 1, ctx.currentTime, .1)
      if (!nivelar) c.autoGanho = 1
    }
  }
  modoComp()
  // laço do automático: nivela devagar cada canal até o alvo e abaixa o jogo quando você fala
  setInterval(() => {
    const t = ctx.currentTime
    for (const c of Object.values(C)) {
      if (!c.src) continue
      const l = db(mede(c.meio, c.buf).rms)
      if (nivelar && l > -55) {
        const alvo = Math.min(4, Math.max(.25, 10 ** ((AJUSTE[c.nome].alvo - l) / 20) * c.autoGanho))
        c.autoGanho += (alvo - c.autoGanho) * .06
      }
    }
    const voz = C.mic.src ? db(mede(C.mic.meio, C.mic.buf).rms) : -100
    if (voz > -40) falouEm = performance.now()
    const agora = abaixar && performance.now() - falouEm < 450
    if (agora !== falando) { falando = agora; aoAbaixar(falando) }
    C.mic.auto.gain.setTargetAtTime(C.mic.autoGanho, t, .3)
    C.jogo.auto.gain.setTargetAtTime(C.jogo.autoGanho * (falando ? .5 : 1), t, falando ? .06 : .45)
  }, 120)

  const saida = new MediaStream([gerador, destino.stream.getAudioTracks()[0]])

  return {
    saida,
    soJogo: destinoJogo.stream.getAudioTracks()[0],
    jogo: trilha => lerJogo(trilha),
    cam: trilha => lerCam(trilha),
    somJogo: trilha => { ctx.resume(); liga(C.jogo, trilha) },
    mic: trilha => { ctx.resume(); liga(C.mic, trilha) },
    volume: (qual, v) => { C[qual === 'mic' ? 'mic' : 'jogo'].vol.gain.setTargetAtTime(v, ctx.currentTime, .05); if (qual !== 'mic') volSoJogo.gain.setTargetAtTime(v, ctx.currentTime, .05) },
    mudo: (qual, on) => { C[qual].mudo.gain.setTargetAtTime(on ? 0 : 1, ctx.currentTime, .02); if (qual === 'jogo') volSoJogo.gain.setTargetAtTime(on ? 0 : C.jogo.vol.gain.value, ctx.currentTime, .02) },
    atraso: ms => { atraso = Math.max(0, Math.min(1500, ms)); Object.values(C).forEach(c => c.d.delayTime.setTargetAtTime(atraso / 1000, ctx.currentTime, .05)) },
    automatico: ({ nivela, abaixa, aoAbaixar: f } = {}) => { if (nivela !== undefined) { nivelar = nivela; modoComp() } if (abaixa !== undefined) abaixar = abaixa; if (f) aoAbaixar = f },
    // nível do que sai para ela (0..1) e quanto o automático está mexendo
    niveis: () => Object.fromEntries(Object.entries(C).map(([k, c]) => { const m = c.src ? mede(c.fim, c.buf) : { rms: 0, pico: 0 }; return [k, { rms: m.rms, pico: m.pico, auto: c.autoGanho * (k === 'jogo' && falando ? .5 : 1), tem: !!c.src }] })),
    get falando() { return falando },
    camLigada: on => { camLigada = on },
    // modo leve: o vídeo não passa por aqui (vai direto), só o som; para de desenhar
    parar: on => { parado = !!on; if (parado) { lerJogo(null); lerCam(null) } },
    modo: m => { modo = m === 'cam' ? 'cam' : 'jogo' },
    ajusteCam: a => Object.assign(ajuste, a),
    posicaoCam: pos => { camDe = camAgora(); camPara = camImagem(camRect(pos)); camT0 = performance.now() },
    fps: n => { fps = Math.max(10, Math.min(30, n)); ligaRelogio() },
    qualidade: q => { [W, H] = QUALIDADES[q] || QUALIDADES[720]; canvas.width = W; canvas.height = H },
    retomar: () => ctx.resume(),
  }
}
