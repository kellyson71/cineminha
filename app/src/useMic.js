import { useCallback, useEffect, useRef, useState } from 'react'

// Microfone: só abre na primeira vez que você desmuta; depois mutar só desliga a trilha
// (a conexão com os outros não precisa ser renegociada). Detecta fala para acender a poltrona:
// análise a 10 Hz, e o estado só muda quando a fala começa/termina.
export function useMic(deviceId, { gate = 0.02 } = {}) {
  const [muted, setMuted] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [devices, setDevices] = useState([])
  const [stream, setStream] = useState(null)
  const r = useRef({})
  const mutedRef = useRef(true)

  const close = useCallback(() => {
    const s = r.current
    clearInterval(s.iv)
    s.stream?.getTracks().forEach(t => t.stop())
    s.ac?.close().catch(() => {})
    r.current = {}
    setStream(null); setSpeaking(false)
  }, [])

  const open = useCallback(async () => {
    const novo = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    })
    close()
    const ac = new AudioContext({ latencyHint: 'interactive' })
    const an = ac.createAnalyser()
    an.fftSize = 512
    ac.createMediaStreamSource(novo).connect(an)
    const buf = new Float32Array(an.fftSize)
    let last = 0, on = false
    const iv = setInterval(() => {
      let now = false
      if (!mutedRef.current) {
        an.getFloatTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
        if (Math.sqrt(sum / buf.length) > gate) last = performance.now()
        now = performance.now() - last < 350
      }
      if (now !== on) { on = now; setSpeaking(now) }
    }, 100)
    r.current = { stream: novo, ac, iv }
    novo.getAudioTracks().forEach(t => { t.enabled = !mutedRef.current })
    setStream(novo)
    navigator.mediaDevices.enumerateDevices().then(d => setDevices(d.filter(x => x.kind === 'audioinput' && x.deviceId !== 'default'))).catch(() => {})
  }, [deviceId, close, gate])

  const setMute = useCallback(async m => {
    if (!m && !r.current.stream) await open()
    mutedRef.current = m
    r.current.stream?.getAudioTracks().forEach(t => { t.enabled = !m })
    setMuted(m)
  }, [open])
  const toggle = useCallback(() => setMute(!mutedRef.current), [setMute])

  // trocou de microfone com ele aberto: reabre no novo
  useEffect(() => { if (r.current.stream) open().catch(() => {}) }, [deviceId])
  useEffect(() => close, [close])

  return { muted, speaking, devices, stream, toggle, setMute, stop: () => { close(); mutedRef.current = true; setMuted(true) } }
}
