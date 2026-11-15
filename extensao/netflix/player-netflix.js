// Roda dentro da página da Netflix. Usa a API do próprio player (mexer no <video> direto para pular
// dá erro M7375), lê o que está passando e manda o estado uma vez por segundo.
(() => {
  if (window.__cineNfx) return
  window.__cineNfx = true
  /* Legenda para o acompanhante de série: as falas até o ponto em que a sala está (nunca depois).
     A Netflix recebe as faixas de legenda no "manifest" do vídeo; pegamos os endereços quando ela faz
     JSON.parse dele e baixamos a faixa só quando o Cineminha pedir. Sem o manifest (extensão instalada com
     a aba já aberta), vale o que apareceu na tela com a legenda ligada. */
  const faixas = new Map() // movieId -> [{ lang, forcada, cc, urls: { formato: url } }]
  const baixadas = new Map() // url -> Promise<[[s, texto]]>
  const naTela = new Map() // movieId -> [[s, texto]] (legenda que passou na tela)
  const parse0 = JSON.parse
  const urlsDe = d => { const o = {}; for (const [f, v] of Object.entries(d || {})) { const u = v?.downloadUrls ? Object.values(v.downloadUrls)[0] : v?.urls?.[0]?.url; if (u) o[f] = u } return o }
  function guardaManifest(r) {
    const m = r?.result || r
    if (!m || !Array.isArray(m.timedtexttracks)) return
    const id = String(m.movieId ?? m.videoId ?? '')
    const lista = m.timedtexttracks.filter(t => !t.isNoneTrack && t.ttDownloadables).map(t => ({ lang: String(t.language || ''), forcada: !!t.isForcedNarrative, cc: t.rawTrackType === 'closedcaptions', urls: urlsDe(t.ttDownloadables) })).filter(t => Object.keys(t.urls).length)
    if (id && lista.length) faixas.set(id, lista)
  }
  JSON.parse = function (texto, ...resto) {
    const r = parse0.call(this, texto, ...resto)
    try { if (typeof texto === 'string' && texto.length > 2000 && texto.includes('timedtexttracks')) guardaManifest(r) } catch {}
    return r
  }
  const ent = s => s.replace(/&(#x?[\da-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (_, c) => c[0] === '#' ? String.fromCodePoint(c[1] === 'x' || c[1] === 'X' ? parseInt(c.slice(2), 16) : +c.slice(1)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[c.toLowerCase()])
  // TTML/IMSC da Netflix: <p begin="123456t">…<br/>…</p> (ticks) ou "00:01:02.345"
  function lerTtml(xml) {
    const tick = +(xml.match(/tickRate="(\d+)"/)?.[1] || 1e7)
    const seg = v => /t$/.test(v) ? +v.slice(0, -1) / tick : v.split(':').reduce((a, n) => a * 60 + +n, 0)
    const out = []
    for (const [, ini, corpo] of xml.matchAll(/<p\b[^>]*?\bbegin="([^"]+)"[^>]*>([\s\S]*?)<\/p>/g)) {
      const t = ent(corpo.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
      if (t) out.push([Math.round(seg(ini) * 10) / 10, t])
    }
    return out
  }
  function lerVtt(txt) {
    const seg = v => v.trim().split(':').reduce((a, n) => a * 60 + parseFloat(n), 0)
    return txt.replace(/\r/g, '').split(/\n\n+/).map(b => { const l = b.split('\n'), i = l.findIndex(x => x.includes('-->')); return i < 0 ? null : [Math.round(seg(l[i].split('-->')[0]) * 10) / 10, l.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim()] }).filter(c => c && c[1])
  }
  function escolheFaixa(id, p) {
    const lista = faixas.get(String(id)) || []
    let atual = ''
    try { const t = p?.getTimedTextTrack?.(); atual = String(t?.bcp47 || t?.language || '').toLowerCase() } catch {}
    const nota = f => { const l = f.lang.toLowerCase(); return (atual && l === atual ? 8 : 0) + (l.startsWith('pt') ? 4 : 0) + (l.startsWith('en') ? 2 : 0) + (f.forcada ? -10 : 0) + (f.cc ? 0 : 1) }
    return lista.slice().sort((a, b) => nota(b) - nota(a))[0]
  }
  async function falasDe(id, p) {
    const f = escolheFaixa(id, p)
    const fmt = f && (['imsc1.1', 'dfxp-ls-sdh', 'simplesdh', 'webvtt-lssdh-ios8'].find(k => f.urls[k]) || Object.keys(f.urls)[0])
    if (fmt) {
      const url = f.urls[fmt]
      if (!baixadas.has(url)) baixadas.set(url, fetch(url).then(r => r.ok ? r.text() : Promise.reject(r.status)).then(t => /-->/.test(t.slice(0, 2000)) && !/<tt\b/.test(t.slice(0, 2000)) ? lerVtt(t) : lerTtml(t)).catch(e => { baixadas.delete(url); console.warn('[Cineminha] legenda', e); return null }))
      const cues = await baixadas.get(url)
      if (cues?.length) return { cues, fonte: 'netflix', lang: f.lang }
    }
    const tela = naTela.get(String(id))
    return { cues: tela || [], fonte: tela?.length ? 'tela' : '', lang: '' }
  }
  // o que passa na tela com a legenda ligada (reserva quando não há manifest)
  let ultimaTela = ''
  setInterval(() => {
    const el = document.querySelector('.player-timedtext')
    const t = el?.innerText?.replace(/\s+/g, ' ').trim() || ''
    if (!t || t === ultimaTela) { if (!t) ultimaTela = ''; return }
    ultimaTela = t
    const p = player()
    try {
      const id = String(p?.getMovieId?.() ?? ''), s = (p ? p.getCurrentTime() / 1000 : video()?.currentTime) || 0
      if (!id) return
      const l = naTela.get(id) || []
      if (!l.some(c => c[1] === t && Math.abs(c[0] - s) < 8)) { l.push([Math.round(s * 10) / 10, t]); l.sort((a, b) => a[0] - b[0]) }
      naTela.set(id, l.slice(-3000))
    } catch {}
  }, 400)
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
        // o id pode vir como número ou texto, e às vezes só o currentEpisode aponta o episódio
        const alvo = new Set([id, md.currentEpisode].filter(x => x != null).map(String))
        for (const s of md.seasons || []) for (const ep of s.episodes || []) {
          if (alvo.has(String(ep.id)) || alvo.has(String(ep.episodeId))) return { titulo: md.title, s: s.seq, e: ep.seq, epNome: ep.title || '', id }
        }
        const dom = doDom()
        if (dom?.e) return { ...dom, titulo: md.title }
      }
      return { titulo: md.title, s: 0, e: 0, epNome: '', id }
    } catch {}
    return doDom()
  }
  // barra do player: "T5:E10", "T5 E10", "Temporada 5 Episódio 10", "Episódio 10"…
  const RE_T = /\b(?:T|S|Temp(?:orada)?\.?|Season)\s*(\d{1,2})\b/i, RE_E = /\b(?:E|Ep\.?|Epis[óo]dio|Episode)\s*(\d{1,3})\b/i
  function doDom() {
    const el = document.querySelector('[data-uia="video-title"]')
    if (el) {
      const h = el.querySelector('h4')?.textContent?.trim()
      const spans = [...el.querySelectorAll('span')].map(s => s.textContent.trim())
      const junto = spans.join(' '), mt = junto.match(RE_T), me = junto.match(/[TS]\s*\d+\s*[:.]?\s*E\s*(\d+)/i) || junto.match(RE_E)
      const soNumero = x => /^(?:[TS]\s*\d+\s*[:.]?\s*)?(?:E|Ep\.?|Epis[óo]dio|Episode)?\s*\d+$/i.test(x) || /^(?:T|Temp(?:orada)?\.?|Season)\s*\d+[,:]?\s*(?:E|Ep\.?|Epis[óo]dio|Episode)\s*\d+$/i.test(x)
      ultimoDom = { titulo: h || el.textContent.trim(), s: mt ? +mt[1] : 0, e: me ? +me[1] : 0, epNome: spans.filter(x => x && x !== h && !soNumero(x)).pop() || '' }
    }
    return ultimoDom
  }
  // Botões que a Netflix mostra por cima do vídeo: pular abertura/resumo e, no fim, próximo episódio
  const BOTOES = {
    abertura: ['[data-uia="player-skip-intro"]', /^(pular abertura|skip intro|saltar introdu)/i],
    resumo: ['[data-uia="player-skip-recap"]', /^(pular resumo|skip recap|saltar resumo)/i],
    proximo: ['[data-uia^="next-episode-seamless-button"]', /^(pr[óo]ximo epis[óo]dio|next episode)/i],
    creditos: ['[data-uia="watch-credits-seamless-button"]', /^(assistir aos cr[ée]ditos|watch credits|ver cr[ée]ditos)/i],
  }
  const acha = qual => {
    const [sel, re] = BOTOES[qual]
    const b = document.querySelector(sel)
    if (b) return b
    return [...document.querySelectorAll('button')].find(x => x.offsetParent && re.test(x.textContent.trim()))
  }
  const botoes = () => ({ pular: acha('resumo') ? 'resumo' : acha('abertura') ? 'abertura' : '', fim: !!acha('proximo') })
  setInterval(() => {
    if (!/\/watch\//.test(location.pathname)) return
    const p = player(), v = video()
    try {
      if (p) window.postMessage({ cineNfx: 'estado', paused: p.isPaused(), t: p.getCurrentTime() / 1000, d: p.getDuration() / 1000, midia: oQuePassa(p), ...botoes() }, location.origin)
      else if (v) window.postMessage({ cineNfx: 'estado', paused: v.paused, t: v.currentTime, d: v.duration || 0, midia: oQuePassa(null), ...botoes() }, location.origin)
    } catch (e) { console.warn('[Cineminha]', e) }
  }, 1000)
  addEventListener('message', e => {
    if (e.source !== window || e.data?.cineNfx !== 'cmd') return
    const { op, d, id } = e.data
    if (id && id === ultimoCmd) return // mesmo comando chegando duas vezes: um toggle duplo não faria nada
    ultimoCmd = id
    const p = player(), v = video()
    console.info('[Cineminha] comando', op, d ?? '')
    if (op === 'falas') { // o Cineminha pediu as falas (para o acompanhante): manda a faixa inteira do que está passando
      const id = (() => { try { return p?.getMovieId() } catch { return null } })()
      if (id != null) falasDe(id, p).then(r => window.postMessage({ cineNfx: 'falas', movieId: String(id), ...r }, location.origin))
      return
    }
    try {
      if (op === 'pular') { (acha('resumo') || acha('abertura'))?.click(); return }
      if (op === 'proximo') { acha('proximo')?.click(); return }
      if (op === 'creditos') { acha('creditos')?.click(); (p || v)?.pause?.(); return }
      if (!p) { if (v && op === 'toggle') v.paused ? v.play() : v.pause(); else if (v && op === 'play') v.play(); else if (v && op === 'pause') v.pause(); return }
      if (op === 'toggle') p.isPaused() ? p.play() : p.pause()
      else if (op === 'play') p.play()
      else if (op === 'pause') p.pause()
      else if (op === 'at' && Number.isFinite(+d)) p.seek(Math.max(0, +d) * 1000)
      else if (op === 'seek' && Number.isFinite(+d)) p.seek(Math.max(0, p.getCurrentTime() + Math.max(-120, Math.min(120, +d)) * 1000))
    } catch (e) { console.warn('[Cineminha]', e) }
  })
})()
