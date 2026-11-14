// Notas dos episódios no IMDb: a API GraphQL do próprio site (sem chave), a série inteira (até 1000 episódios)
const epsCache = new Map()
export async function episodiosImdb(id) {
  const ja = epsCache.get(id)
  if (ja && Date.now() - ja.t < 6 * 3600e3) return ja.eps
  const eps = []
  let depois = ''
  for (let pag = 0; pag < 4; pag++) {
    const query = `query { title(id: "${id}") { episodes { episodes(first: 250${depois ? `, after: "${depois}"` : ''}) { pageInfo { hasNextPage endCursor } edges { node { id titleText { text } ratingsSummary { aggregateRating voteCount } series { displayableEpisodeNumber { displayableSeason { text } episodeNumber { text } } } } } } } } }`
    const r = await fetch('https://caching.graphql.imdb.com/', { method: 'POST', headers: { 'content-type': 'application/json', 'x-imdb-client-name': 'imdb-web-next' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(7000) }).then(r => r.ok ? r.json() : null).catch(() => null)
    const lista = r?.data?.title?.episodes?.episodes
    if (!lista) break
    for (const { node: n } of lista.edges || []) {
      const num = n.series?.displayableEpisodeNumber, s = +num?.displayableSeason?.text, e = +num?.episodeNumber?.text
      if (s > 0 && e > 0) eps.push({ s, e, imdb: n.id, nome: String(n.titleText?.text || '').slice(0, 120), nota: n.ratingsSummary?.aggregateRating ?? null, votos: n.ratingsSummary?.voteCount || 0 })
    }
    if (!lista.pageInfo?.hasNextPage) break
    depois = lista.pageInfo.endCursor
  }
  if (eps.length) { epsCache.set(id, { t: Date.now(), eps }); if (epsCache.size > 200) epsCache.delete(epsCache.keys().next().value) }
  return eps
}
