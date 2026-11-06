// Roda dentro da página da Netflix. Usa a API do próprio player (mexer no <video> direto para pular
// dá erro M7375), lê o que está passando e manda o estado uma vez por segundo.
(() => {
  const player = () => {
    try {
      const vp = window.netflix.appContext.state.playerApp.getAPI().videoPlayer
      const ids = vp.getAllPlayerSessionIds()
      const id = ids.find(s => s.startsWith('watch')) || ids[0]
      return id ? vp.getVideoPlayerBySessionId(id) : null
    } catch { return null }
  }
  // título, temporada e episódio: metadados do player; se não der, o título na barra do player
  let ultimoDom = null
  function oQuePassa(p) {
    try {
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
    const p = player()
    if (!p) return
    try {
      window.postMessage({ cineNfx: 'estado', paused: p.isPaused(), t: p.getCurrentTime() / 1000, d: p.getDuration() / 1000, midia: oQuePassa(p) }, location.origin)
    } catch {}
  }, 1000)
  addEventListener('message', e => {
    if (e.source !== window || e.data?.cineNfx !== 'cmd') return
    const p = player(); if (!p) return
    const { op, d } = e.data
    try {
      if (op === 'toggle') p.isPaused() ? p.play() : p.pause()
      else if (op === 'play') p.play()
      else if (op === 'pause') p.pause()
      else if (op === 'at' && Number.isFinite(+d)) p.seek(Math.max(0, +d) * 1000)
      else if (op === 'seek' && Number.isFinite(+d)) p.seek(Math.max(0, p.getCurrentTime() + Math.max(-120, Math.min(120, +d)) * 1000))
    } catch {}
  })
})()
