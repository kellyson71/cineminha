// Apenas metadados públicos de filmes. Nenhum vídeo ou fonte de reprodução.
import { json } from './_redis.js'
const BASE = 'https://v3-cinemeta.strem.io'
const https = value => typeof value === 'string' && /^https:\/\//.test(value) ? value.slice(0, 1500) : ''
function movie(m) {
  const rating = Number(m.imdbRating)
  return { id: m.id, filme: String(m.name || '').slice(0, 120), ano: String(m.releaseInfo || '').slice(0, 12), poster: https(m.poster), background: https(m.background), nota: m.imdbRating != null && Number.isFinite(rating) ? rating : null, fonteNota: 'IMDb', sinopse: String(m.description || '').slice(0, 1200) }
}
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'método' })
  const u = new URL(req.url, 'http://x').searchParams
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
