// Apenas metadados públicos de filmes. Nenhum vídeo ou fonte de reprodução.
import { json } from './_redis.js'
const BASE = 'https://v3-cinemeta.strem.io'
const https = value => typeof value === 'string' && /^https:\/\//.test(value) ? value.slice(0, 1500) : ''
function movie(m) {
  const rating = Number(m.imdbRating)
  return { id: m.id, filme: String(m.name || '').slice(0, 120), ano: String(m.releaseInfo || '').slice(0, 12), poster: https(m.poster), background: https(m.background), nota: m.imdbRating != null && Number.isFinite(rating) ? rating : null, fonteNota: 'IMDb', sinopse: String(m.description || '').slice(0, 1200) }
}
const UA = { 'user-agent': 'Cineminha/1.0 (github.com/kellyson71/cineminha)' }
const getJson = (url, h) => fetch(url, { headers: h, signal: AbortSignal.timeout(7000) }).then(r => r.ok ? r.json() : null).catch(() => null)
// "O que está passando": título como aparece na tela (pt ou original) → IMDb pelo Wikidata → Cinemeta.
// Com temporada/episódio procura série; sem, filme ou série.
async function midia(q, s, e) {
  const busca = await getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&limit=8&language=pt&uselang=pt&search=${encodeURIComponent(q)}`, UA)
  const ids = (busca?.search || []).map(x => x.id)
  let cands = []
  if (ids.length) {
    const ents = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${ids.join('|')}`, UA)
    cands = ids.map(id => ents?.entities?.[id]?.claims).filter(c => c?.P345).map(c => ({
      imdb: c.P345[0].mainsnak.datavalue?.value, tipos: (c.P31 || []).map(x => x.mainsnak.datavalue?.value?.id),
    })).filter(c => /^tt\d+$/.test(c.imdb || ''))
  }
  // reserva: a busca do próprio IMDb (a mesma do campo de busca do site) entende quase qualquer idioma
  if (!cands.length) {
    const sug = await getJson(`https://v2.sg.media-imdb.com/suggestion/${encodeURIComponent((q[0] || 'x').toLowerCase())}/${encodeURIComponent(q)}.json`)
    cands = (sug?.d || []).filter(x => /^tt\d+$/.test(x.id) && /movie|tvSeries|tvMiniSeries/.test(x.qid || '')).slice(0, 3)
      .map(x => ({ imdb: x.id, tipos: /tv/.test(x.qid) ? ['Q5398426'] : ['Q11424'] }))
  }
  const serie = c => c.tipos.some(t => ['Q5398426', 'Q581714', 'Q1259759', 'Q63952888', 'Q117467246'].includes(t))
  const ordem = s ? [...cands.filter(serie), ...cands.filter(c => !serie(c))] : cands
  for (const c of ordem.slice(0, 3)) {
    const tipo = serie(c) ? 'series' : 'movie'
    const m = (await getJson(`${BASE}/meta/${tipo}/${c.imdb}.json`))?.meta
    if (!m) continue
    const ep = tipo === 'series' && s ? (m.videos || []).find(v => +v.season === s && +(v.episode ?? v.number) === e) : null
    const notaEp = tipo === 'series' && s && e ? await notaEpisodio(c.imdb, s, e) : null
    return { tipo: tipo === 'series' ? 'serie' : 'filme', ...movie(m), ep: ep || notaEp ? { s, e, nome: String(ep?.name || notaEp?.nome || '').slice(0, 120), still: https(ep?.thumbnail), sinopse: String(ep?.overview || ep?.description || '').slice(0, 400), data: String(ep?.released || '').slice(0, 10), nota: notaEp?.nota ?? null, votos: notaEp?.votos || 0, imdb: notaEp?.imdb || '' } : null }
  }
  return null
}
// Nota do episódio no IMDb: a API GraphQL do próprio site (sem chave), só a temporada pedida
async function notaEpisodio(id, s, e) {
  const query = `query { title(id: "${id}") { episodes { episodes(first: 250, filter: { includeSeasons: ["${s}"] }) { edges { node { id titleText { text } ratingsSummary { aggregateRating voteCount } series { displayableEpisodeNumber { episodeNumber { text } } } } } } } } }`
  const r = await fetch('https://caching.graphql.imdb.com/', { method: 'POST', headers: { 'content-type': 'application/json', 'x-imdb-client-name': 'imdb-web-next' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(7000) }).then(r => r.ok ? r.json() : null).catch(() => null)
  const n = (r?.data?.title?.episodes?.episodes?.edges || []).map(x => x.node).find(x => +x.series?.displayableEpisodeNumber?.episodeNumber?.text === e)
  return n ? { imdb: n.id, nome: n.titleText?.text || '', nota: n.ratingsSummary?.aggregateRating ?? null, votos: n.ratingsSummary?.voteCount || 0 } : null
}
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'método' })
  const u = new URL(req.url, 'http://x').searchParams
  // capa pelo nosso domínio (a do catálogo não libera CORS): a retrospectiva desenha num canvas e exporta PNG
  if (u.has('capa')) {
    const c = u.get('capa') || ''
    if (!/^https:\/\/images\.metahub\.space\/poster\/(small|medium)\/tt\d{5,12}\/img$/.test(c)) return json(res, 400, { error: 'capa' })
    const r = await fetch(c, { signal: AbortSignal.timeout(7000) }).catch(() => null)
    if (!r?.ok) return json(res, 404, { error: 'capa' })
    res.statusCode = 200; res.setHeader('content-type', r.headers.get('content-type') || 'image/jpeg'); res.setHeader('cache-control', 'public, max-age=86400, s-maxage=604800')
    res.end(Buffer.from(await r.arrayBuffer())); return
  }
  if (u.has('midia')) {
    const q = (u.get('midia') || '').trim().slice(0, 100), s = +u.get('s') || 0, e = +u.get('e') || 0
    if (q.length < 2) return json(res, 200, { midia: null })
    const r = await midia(q, s, e).catch(() => null)
    res.statusCode = 200; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'public, max-age=3600, s-maxage=86400'); res.end(JSON.stringify({ midia: r })); return
  }
  const id = u.get('id'), q = (u.get('q') || '').trim()
  if (id && !/^tt\d{5,12}$/.test(id)) return json(res, 400, { error: 'filme' })
  if (!id && (q.length < 2 || q.length > 100)) return json(res, 200, { list: [] })
  try {
    const path = id ? `/meta/movie/${id}.json` : `/catalog/movie/top/search=${encodeURIComponent(q)}.json`
    const r = await fetch(BASE + path, { signal: AbortSignal.timeout(7000) })
    if (!r.ok) throw new Error('catálogo indisponível')
    const data = await r.json()
    const result = id ? { filme: data.meta ? movie(data.meta) : null } : { list: (data.metas || []).filter(m => /^tt\d+$/.test(m.id)).slice(0, 6).map(movie) }
    res.statusCode = 200; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'public, max-age=300, s-maxage=3600'); res.end(JSON.stringify(result))
  } catch { json(res, 502, { error: 'A busca está indisponível. Você pode digitar o título e convidar mesmo assim.' }) }
}
