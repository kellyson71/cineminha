// Roda dentro da página da Netflix. Usa a API do próprio player (mexer no <video> direto para pular
// dá erro M7375), lê o que está passando e manda o estado uma vez por segundo.
(() => {
  if (window.__cineNfx) return
  window.__cineNfx = true
  let avisou = false, ultimoCmd = null
  const player = () => {
    try {
      const vp = window.netflix.appContext.state.playerApp.getAPI().videoPlayer
      const ids = vp.getAllPlayerSessionIds()
      const id = ids.find(s => s.startsWith('watch')) || ids[0]
      const p = id ? vp.getVideoPlayerBySessionId(id) : null
      if (p && !avisou) { avisou = true; console.info('[Cineminha] player da Netflix encontrado') }
      return p
    } catch { return null }
  }
  // sem a API (Netflix mudou algo): o <video> ainda pausa e continua; pular só pela API
  const video = () => document.querySelector('video')
  // título, temporada e episódio: metadados do player; se não der, o título na barra do player
  let ultimoDom = null
  function oQuePassa(p) {
    if (p) try {
      const id = p.getMovieId()
      const md = window.netflix.appContext.state.playerApp.getState().videoPlayer.videoMetadata[id]._metadata.video
      if (md.type === 'show') {
        for (const s of md.seasons || []) for (const ep of s.episodes || []) {
          if (ep.id === id || ep.episodeId === id) return { titulo: md.title, s: s.seq, e: ep.seq, epNome: ep.title || '', id }
        }
      }
      return { titulo: md.title, s: 0, e: 0, epNome: '', id }
    } catch {}
    const el = document.querySelector('[data-uia="video-title"]')
    if (el) {
      const h = el.querySelector('h4')?.textContent?.trim()
      const spans = [...el.querySelectorAll('span')].map(s => s.textContent.trim())
      const m = spans.join(' ').match(/[TS](\d+):E(\d+)/)
      ultimoDom = { titulo: h || el.textContent.trim(), s: m ? +m[1] : 0, e: m ? +m[2] : 0, epNome: spans.filter(s => !/^[TS]\d+:E\d+$/.test(s)).pop() || '' }
    }
    return ultimoDom
  }
  setInterval(() => {
    if (!/\/watch\//.test(location.pathname)) return
    const p = player(), v = video()
    try {
      if (p) window.postMessage({ cineNfx: 'estado', paused: p.isPaused(), t: p.getCurrentTime() / 1000, d: p.getDuration() / 1000, midia: oQuePassa(p) }, location.origin)
      else if (v) window.postMessage({ cineNfx: 'estado', paused: v.paused, t: v.currentTime, d: v.duration || 0, midia: oQuePassa(null) }, location.origin)
    } catch (e) { console.warn('[Cineminha]', e) }
  }, 1000)
  addEventListener('message', e => {
    if (e.source !== window || e.data?.cineNfx !== 'cmd') return
    const { op, d, id } = e.data
    if (id && id === ultimoCmd) return // mesmo comando chegando duas vezes: um toggle duplo não faria nada
    ultimoCmd = id
    const p = player(), v = video()
    console.info('[Cineminha] comando', op, d ?? '')
    try {
      if (!p) { if (v && op === 'toggle') v.paused ? v.play() : v.pause(); else if (v && op === 'play') v.play(); else if (v && op === 'pause') v.pause(); return }
      if (op === 'toggle') p.isPaused() ? p.play() : p.pause()
      else if (op === 'play') p.play()
      else if (op === 'pause') p.pause()
      else if (op === 'at' && Number.isFinite(+d)) p.seek(Math.max(0, +d) * 1000)
      else if (op === 'seek' && Number.isFinite(+d)) p.seek(Math.max(0, p.getCurrentTime() + Math.max(-120, Math.min(120, +d)) * 1000))
    } catch (e) { console.warn('[Cineminha]', e) }
  })
})()
