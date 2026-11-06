// Marca as categorias de cada filme do Quadro a Quadro (gênero, país, Oscar) pelo Wikidata.
//   node tools/quadro/categorias.mjs      (a coleta já chama no fim)
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ARQ = path.join(new URL('../../', import.meta.url).pathname, 'public/jogos/quadro/filmes.json')
const UA = 'CineminhaColeta/1.0 (jogo entre amigos; kellyson71/cineminha)'
const GENEROS = [
  ['animacao', /animat|anime/],
  ['terror', /horror|slasher|zombie/],
  ['acao', /action|adventure|superhero|martial arts|heist|disaster|war film|spy/],
  ['comedia', /comedy|parody|satir/],
  ['ficcao', /science fiction|fantasy|space opera|cyberpunk|dystopi/],
  ['romance', /romance|romantic/],
  ['suspense', /thriller|crime|mystery|noir|detective|psychological/],
]

export async function categorias(arq = ARQ) {
  const filmes = JSON.parse(readFileSync(arq, 'utf8'))
  for (let i = 0; i < filmes.length; i += 60) {
    const lote = filmes.slice(i, i + 60)
    const q = `SELECT ?imdb (GROUP_CONCAT(DISTINCT ?g; SEPARATOR="|") AS ?gs) (MAX(?br) AS ?brasil) (MAX(?osc) AS ?oscar) WHERE {
      VALUES ?imdb { ${lote.map(f => `"${f.imdb}"`).join(' ')} }
      ?item wdt:P345 ?imdb.
      OPTIONAL { ?item wdt:P136 ?gen. ?gen rdfs:label ?g FILTER(lang(?g)="en") }
      OPTIONAL { ?item wdt:P495 wd:Q155. BIND(1 AS ?br) }
      OPTIONAL { ?item wdt:P166 wd:Q102427. BIND(1 AS ?osc) }
    } GROUP BY ?imdb`
    const r = await fetch('https://query.wikidata.org/sparql?query=' + encodeURIComponent(q), { headers: { 'user-agent': UA, accept: 'application/sparql-results+json' } }).then(r => r.json()).catch(() => null)
    for (const b of r?.results?.bindings || []) {
      const f = filmes.find(x => x.imdb === b.imdb.value)
      const gs = (b.gs?.value || '').toLowerCase()
      const c = GENEROS.filter(([, re]) => re.test(gs)).map(([k]) => k)
      if (b.brasil) c.push('brasil')
      if (b.oscar) c.push('oscar')
      f.c = c
    }
  }
  for (const f of filmes) f.c ||= []
  writeFileSync(arq, JSON.stringify(filmes))
  const conta = {}
  for (const f of filmes) for (const k of f.c) conta[k] = (conta[k] || 0) + 1
  return conta
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(await categorias())
