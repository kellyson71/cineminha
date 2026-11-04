import { json, redis } from './_redis.js'

// Rádio da sala: lê faixa, álbum ou playlist do Spotify pela página pública do player embutido
// e devolve a fila (nome, artista, duração), a capa e a cor de fundo que o Spotify usa.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'
const rgb = c => c && `rgb(${c.red},${c.green},${c.blue})`
const maior = arr => (arr || []).slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || ''

const BUSCAS = new Map() // cache das buscas do palpite (por instância)

export default async function handler(req, res) {
  try {
    const qs = new URL(req.url, 'http://x').searchParams
    const yt = qs.get('yt') || ''
    if (yt) {
      if (!/^[\w-]{11}$/.test(yt)) return json(res, 400, { error: 'link' })
      const o = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${yt}&format=json`).then(r => r.ok ? r.json() : null).catch(() => null)
      if (!o) return json(res, 404, { error: 'nada' })
      res.setHeader('cache-control', 'public, s-maxage=86400'); res.statusCode = 200; res.setHeader('content-type', 'application/json')
      return res.end(JSON.stringify({ titulo: o.title || '', artista: o.author_name || '' }))
    }
    // busca para o palpite do Faixa a Faixa: músicas e artistas da Deezer (com capa/foto)
    const dz = (qs.get('dz') || '').trim().slice(0, 80)
    if (dz) {
      const chave = dz.toLowerCase()
      let out = BUSCAS.get(chave)
      if (!out) {
        const q = encodeURIComponent(dz)
        const tempo = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))])
        const json1 = u => fetch(u).then(r => r.json()).then(j => j.error ? null : j).catch(() => null)
        // Deezer (tem ids para conferir o palpite) e iTunes (rápido) ao mesmo tempo; a Deezer tem até 1,5 s
        const itunes = json1(`https://itunes.apple.com/search?term=${q}&entity=song&limit=10&country=BR`)
        const [tr, ar] = await Promise.all([tempo(json1(`https://api.deezer.com/search?q=${q}&limit=8`), 900), tempo(json1(`https://api.deezer.com/search/artist?q=${q}&limit=3`), 900)])
        const visto = new Set()
        let musicas = (tr?.data || []).filter(x => { const k = (x.title_short || x.title) + '|' + x.artist?.name; if (visto.has(k)) return false; visto.add(k); return true })
          .map(x => ({ id: x.id, t: x.title_short || x.title, a: x.artist?.name || '', aid: x.artist?.id, capa: x.album?.cover_small || '', album: x.album?.title || '' }))
        let artistas = (ar?.data || []).map(x => ({ id: x.id, nome: x.name, foto: x.picture_small || '', fas: x.nb_fan || 0 }))
        if (!musicas.length || !artistas.length) {
          const it = (await tempo(itunes, 2500))?.results || []
          if (!musicas.length) musicas = it.filter(x => { const k = x.trackName + '|' + x.artistName; if (visto.has(k)) return false; visto.add(k); return true }).slice(0, 8)
            .map(x => ({ id: 'it' + x.trackId, t: x.trackName, a: x.artistName, capa: x.artworkUrl60 || '', album: x.collectionName || '' }))
          if (!artistas.length) artistas = [...new Map(it.map(x => [x.artistName, { id: 'it' + x.artistId, nome: x.artistName, foto: x.artworkUrl60 || '' }])).values()].slice(0, 2)
        }
        out = { musicas, artistas }
        if (musicas.length || artistas.length) { BUSCAS.set(chave, out); if (BUSCAS.size > 800) BUSCAS.delete(BUSCAS.keys().next().value) }
      }
      res.setHeader('cache-control', 'public, s-maxage=86400'); res.statusCode = 200; res.setHeader('content-type', 'application/json')
      return res.end(JSON.stringify(out))
    }
    // playlist ou Mix do YouTube (Mix = "modo rádio": músicas parecidas com um vídeo)
    const ytl = qs.get('ytlista') || ''
    if (ytl) {
      const v = qs.get('v') || ''
      if (!/^[\w-]{10,64}$/.test(ytl) || (v && !/^[\w-]{11}$/.test(v))) return json(res, 400, { error: 'link' })
      const itens = await listaDoYoutube(`https://www.youtube.com/watch?${v ? `v=${v}&` : ''}list=${ytl}`).catch(() => [])
      res.setHeader('cache-control', `public, s-maxage=${ytl.startsWith('RD') ? 600 : 3600}`); res.statusCode = 200; res.setHeader('content-type', 'application/json')
      return res.end(JSON.stringify({ lista: itens }))
    }
    // busca por nome no rádio: vídeos do YouTube
    const ytq = (qs.get('ytq') || '').trim().slice(0, 100)
    if (ytq) {
      let lista = await buscaYoutube(ytq).catch(() => [])
      if (!lista.length) lista = await buscaYoutube(ytq).catch(() => [])
      res.setHeader('cache-control', 'public, s-maxage=3600'); res.statusCode = 200; res.setHeader('content-type', 'application/json')
      return res.end(JSON.stringify({ lista }))
    }
    // música escolhida no catálogo (Deezer): acha a mesma no YouTube para tocar inteira
    if (qs.get('acha')) {
      const t = String(qs.get('t') || '').slice(0, 120), a = String(qs.get('a') || '').slice(0, 120), d = +qs.get('d') || 0
      if (!t) return json(res, 400, { error: 'titulo' })
      const chave = `ytq:${norm(a)}|${norm(t)}`
      const salvo = await redis('GET', chave).catch(() => null)
      if (salvo) return json(res, 200, { yt: salvo === '-' ? null : salvo })
      let yt = null
      try { yt = await achaNoYoutube(t, a, d) } catch {}
      if (!yt) { const l = await buscaYoutube(`${a} ${t}`).catch(() => []); yt = l[0]?.id || null }
      await redis('SET', chave, yt || '-', 'EX', yt ? 90 * 86400 : 600).catch(() => {})
      return json(res, 200, { yt })
    }
    // a mesma música no YouTube (toca inteira, sem login, com volume)
    const busca = qs.get('busca') || ''
    if (busca) {
      if (!/^spotify:(track|episode):[A-Za-z0-9]{22}$/.test(busca)) return json(res, 400, { error: 'link' })
      const salvo = await redis('GET', `ytm:${busca}`).catch(() => null)
      if (salvo) return json(res, 200, { yt: salvo === '-' ? null : salvo })
      const args = [String(qs.get('t') || '').slice(0, 120), String(qs.get('a') || '').slice(0, 120), +qs.get('d') || 0]
      let yt
      try { yt = await achaNoYoutube(...args) } catch { try { yt = await achaNoYoutube(...args) } catch { return json(res, 200, { yt: null, erro: 1 }) } }
      await redis('SET', `ytm:${busca}`, yt || '-', 'EX', yt ? 90 * 86400 : 86400).catch(() => {})
      return json(res, 200, { yt })
    }
    const u = qs.get('u') || ''
    const m = /^spotify:(track|album|playlist|episode|show):([A-Za-z0-9]{22})$/.exec(u)
    if (!m) return json(res, 400, { error: 'link' })
    const [, tipo, id] = m
    const [page, oe] = await Promise.all([
      fetch(`https://open.spotify.com/embed/${tipo}/${id}`, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR,pt;q=0.9' } }).then(r => r.text()),
      fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/${tipo}/${id}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ])
    const nd = /<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s.exec(page)
    if (!nd) return json(res, 502, { error: 'spotify' })
    const e = JSON.parse(nd[1])?.props?.pageProps?.state?.data?.entity
    if (!e) return json(res, 404, { error: 'nada' })
    const vi = e.visualIdentity || {}
    const capa = oe.thumbnail_url || maior(e.coverArt?.sources) || maior(e.visualIdentity?.image)
    const artista = e.subtitle || (e.artists || []).map(a => a.name).join(', ')
    const lista = e.trackList?.length
      ? e.trackList.filter(t => t.isPlayable !== false && /^spotify:(track|episode):/.test(t.uri)).slice(0, 200)
        .map(t => ({ k: 'sp', id: t.uri, t: String(t.title || '').slice(0, 120), a: String(t.subtitle || '').slice(0, 120), d: Math.round((t.duration || 0) / 1000) }))
      : [{ k: 'sp', id: e.uri || u, t: String(e.name || e.title || '').slice(0, 120), a: artista.slice(0, 120), d: Math.round((e.duration || 0) / 1000), c: capa }]
    // álbum: todas as faixas têm a mesma capa
    if (tipo === 'album') for (const t of lista) t.c = capa
    res.setHeader('cache-control', 'public, s-maxage=86400, stale-while-revalidate=604800')
    res.statusCode = 200; res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ tipo, titulo: e.name || e.title || '', artista, capa, cor: rgb(vi.backgroundBase), cor2: rgb(vi.backgroundTintedBase), lista }))
  } catch (err) { json(res, 500, { error: String(err.message || err) }) }
}

const seg = t => String(t || '').split(':').reduce((s, n) => s * 60 + (+n || 0), 0)
const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const RUIM = /\b(live|ao vivo|cover|remix|mashup|karaoke|instrumental|8d|slowed|sped ?up|reverb|nightcore|traducao|legendado|lyrics? video|theatre version|tutorial|reaction|react|demo|acoustic|acustico|piano version|piano demo|unplugged|session|snippet|preview|teaser)\b/
async function achaNoYoutube(titulo, artista, dur) {
  if (!titulo) return null
  const art = artista.split(',')[0].trim()
  const h = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(`${art} ${titulo} audio`) + '&sp=EgIQAQ%253D%253D', { headers: { 'user-agent': UA, 'accept-language': 'pt-BR,pt;q=0.9' } }).then(r => r.text())
  const m = /var ytInitialData = (\{.+?\});<\/script>/s.exec(h)
  if (!m) return null
  const vids = []
  JSON.stringify(JSON.parse(m[1]), (k, v) => { if (k === 'videoRenderer' && v?.videoId) vids.push({ id: v.videoId, t: v.title?.runs?.[0]?.text || '', d: seg(v.lengthText?.simpleText), ch: v.ownerText?.runs?.[0]?.text || '' }); return v })
  const nt = norm(titulo).replace(/\s*[-(].*$/, '').trim(), na = norm(art), ruimNoOriginal = RUIM.test(norm(titulo))
  let melhor = null, nota = -Infinity
  vids.slice(0, 12).forEach((v, i) => {
    const t = norm(v.t), ch = norm(v.ch)
    if (!v.d) return
    let n = -i * 2
    if (nt && t.includes(nt)) n += 30
    if (na && (ch.includes(na) || t.includes(na))) n += 20
    if (/ - topic$/.test(ch)) n += 25
    if (/official audio|audio oficial|\(audio\)/.test(t)) n += 15
    if (/official (music )?video|clipe oficial/.test(t)) n -= 5
    if (!ruimNoOriginal && RUIM.test(t)) n -= 40
    if (dur) { const dif = Math.abs(v.d - dur); n += dif <= 3 ? 25 : dif <= 10 ? 12 : dif <= 30 ? 0 : -30 }
    if (n > nota) { nota = n; melhor = v }
  })
  return melhor && nota > 20 ? melhor.id : null
}

async function listaDoYoutube(url) {
  const h = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR,pt;q=0.9' } }).then(r => r.text())
  const m = /var ytInitialData = (\{.+?\});<\/script>/s.exec(h)
  if (!m) return []
  const out = [], visto = new Set()
  JSON.stringify(JSON.parse(m[1]), (k, v) => {
    if (k === 'playlistPanelVideoRenderer' && v?.videoId && !visto.has(v.videoId) && v.lengthText) {
      visto.add(v.videoId)
      out.push({ k: 'yt', id: v.videoId, t: String(v.title?.simpleText || v.title?.runs?.[0]?.text || '').slice(0, 120), a: String(v.longBylineText?.runs?.[0]?.text || v.shortBylineText?.runs?.[0]?.text || '').slice(0, 120), d: seg(v.lengthText?.simpleText), c: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` })
    }
    return v
  })
  return out.slice(0, 200)
}

async function buscaYoutube(q) {
  const h = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(q) + '&sp=EgIQAQ%253D%253D', { headers: { 'user-agent': UA, 'accept-language': 'pt-BR,pt;q=0.9' } }).then(r => r.text())
  const m = /var ytInitialData = (\{.+?\});<\/script>/s.exec(h)
  if (!m) return []
  const out = [], visto = new Set()
  JSON.stringify(JSON.parse(m[1]), (k, v) => {
    if (k === 'videoRenderer' && v?.videoId && !visto.has(v.videoId) && v.lengthText) {
      visto.add(v.videoId)
      out.push({ k: 'yt', id: v.videoId, t: String(v.title?.runs?.[0]?.text || '').slice(0, 120), a: String(v.ownerText?.runs?.[0]?.text || '').slice(0, 120), d: seg(v.lengthText?.simpleText), c: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` })
    }
    return v
  })
  return out.slice(0, 10)
}
