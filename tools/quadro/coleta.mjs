// Coleta os dados do jogo "Quadro a Quadro" (adivinhe o filme pelo frame):
//  1. filmes famosos pelo Wikidata (quantas Wikipédias têm artigo), com títulos em português e IMDb id;
//  2. frames de cada filme no Film Grab (film-grab.com), espalhados pelo filme, sem letreiros do começo/fim;
//  3. grava public/jogos/quadro/filmes.json (os do jogo), catalogo.json (autocomplete, bem maior)
//     e os frames em webp (960 px) numa pasta com nome embaralhado (não entrega a resposta).
//
//   node tools/quadro/coleta.mjs [quantos filmes, padrão 160] [frames por filme, padrão 6]
// Roda de novo sem medo: filmes já baixados são pulados.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { categorias } from './categorias.mjs'
import { catalogoCurado } from './curadoria.mjs'

const RAIZ = new URL('../../', import.meta.url).pathname
const SAIDA = path.join(RAIZ, 'public/jogos/quadro')
const CACHE = path.join(RAIZ, 'tmp/quadro')
const QUANTOS = +process.argv[2] || 160, FRAMES = +process.argv[3] || 6
const UA = 'CineminhaColeta/1.0 (jogo entre amigos; kellyson71/cineminha)'
mkdirSync(path.join(SAIDA, 'f'), { recursive: true }); mkdirSync(CACHE, { recursive: true })

const sleep = ms => new Promise(r => setTimeout(r, ms))
const hash = s => createHash('sha1').update('quadro:' + s).digest('hex').slice(0, 12)
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&#8217;|&#8216;|['’‘`]/g, '').replace(/&amp;|&#038;/g, 'and').replace(/&[#a-z0-9]+;/g, ' ')
  .replace(/^(the|a|an) /, '').replace(/[^a-z0-9]+/g, ' ').trim()

async function pega(url, tipo = 'text', tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, accept: tipo === 'json' ? 'application/sparql-results+json' : '*/*' } })
      if (r.ok) return tipo === 'json' ? r.json() : tipo === 'bin' ? Buffer.from(await r.arrayBuffer()) : r.text()
      if (r.status === 404) return null
    } catch {}
    await sleep(1500 * (i + 1))
  }
  return null
}
const cacheTxt = async (nome, url) => {
  const p = path.join(CACHE, nome)
  if (existsSync(p)) return readFileSync(p, 'utf8')
  const t = await pega(url); if (t) writeFileSync(p, t)
  return t
}

/* ---------- 1. filmes famosos (Wikidata) ---------- */
async function wikidata(filtro) {
  const q = `SELECT ?imdb (SAMPLE(?en) AS ?en) (SAMPLE(?mul) AS ?mul) (SAMPLE(?pt) AS ?pt) (SAMPLE(?ptbr) AS ?ptbr)
    (GROUP_CONCAT(DISTINCT ?altbr; SEPARATOR="|") AS ?altsbr) (GROUP_CONCAT(DISTINCT ?altpt; SEPARATOR="|") AS ?altspt)
    (MIN(YEAR(?d)) AS ?ano) (SAMPLE(?links) AS ?links) (SAMPLE(?ptwiki) AS ?ptwiki) WHERE {
    ?item wdt:P31 wd:Q11424; wdt:P345 ?imdb; wikibase:sitelinks ?links. ${filtro}
    OPTIONAL{?item rdfs:label ?en FILTER(lang(?en)="en")} OPTIONAL{?item rdfs:label ?mul FILTER(lang(?mul)="mul")}
    OPTIONAL{?item rdfs:label ?pt FILTER(lang(?pt)="pt")} OPTIONAL{?item rdfs:label ?ptbr FILTER(lang(?ptbr)="pt-br")}
    OPTIONAL{?item skos:altLabel ?altbr FILTER(lang(?altbr)="pt-br")} OPTIONAL{?item skos:altLabel ?altpt FILTER(lang(?altpt)="pt")}
    OPTIONAL{?item wdt:P577 ?d}
    OPTIONAL{?pa schema:about ?item; schema:isPartOf <https://pt.wikipedia.org/>; schema:name ?ptwiki}
  } GROUP BY ?imdb ORDER BY DESC(?links)`
  const r = await pega('https://query.wikidata.org/sparql?query=' + encodeURIComponent(q), 'json')
  return (r?.results?.bindings || []).map(b => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])))
}
// títulos no Brasil e em Portugal pela ficha da Wikipédia em português (|título-bra = … |título-prt = …)
const limpaWiki = v => String(v || '').replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>|\{\{[^}]*\}\}|<!--[\s\S]*?-->/g, '').replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/'{2,}/g, '')
  .split(/<br\s*\/?\s*>|\s\/\s|\n/i).map(x => x.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim()).filter(x => x.length > 1 && x.length < 90)
async function titulosWiki(artigos) {
  const arq = path.join(CACHE, 'ptwiki.json')
  const cache = existsSync(arq) ? JSON.parse(readFileSync(arq, 'utf8')) : {}
  const faltam = [...new Set(artigos.filter(a => a && !(a in cache)))]
  for (let i = 0; i < faltam.length; i += 50) {
    const lote = faltam.slice(i, i + 50)
    const r = await pega('https://pt.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&redirects=1&titles=' + encodeURIComponent(lote.join('|')), 'json')
    const ida = new Map(lote.map(a => [a, a]))
    for (const x of [...(r?.query?.normalized || []), ...(r?.query?.redirects || [])]) for (const [a, b] of ida) if (b === x.from) ida.set(a, x.to)
    const txt = new Map((r?.query?.pages || []).map(p => [p.title, p.revisions?.[0]?.slots?.main?.content || '']))
    for (const a of lote) {
      const t = txt.get(ida.get(a)) || ''
      const campo = nome => limpaWiki(t.match(new RegExp(`\\|\\s*t[ií]tulo-${nome}\\s*=\\s*([^\\n]*)`, 'i'))?.[1])
      cache[a] = { bra: campo('bra'), prt: campo('prt') }
    }
    writeFileSync(arq, JSON.stringify(cache))
    await sleep(300)
  }
  return cache
}
function filmeDe(w, br) {
  const orig = w.mul || w.en || w.pt || w.ptbr
  const altsbr = (w.altsbr || '').split('|').filter(Boolean), altspt = (w.altspt || '').split('|').filter(Boolean)
  const dif = s => s && norm(s) !== norm(orig)
  // apelido que vale como título: tem palavra em comum com o original ou "cara de português"
  // (o Wikidata às vezes traz lixo nos apelidos, tipo o nome de uma pessoa)
  const palavras = s => norm(s).split(' ').filter(x => x.length > 2)
  const ok = s => s && (palavras(s).some(x => palavras(orig).includes(x)) || /[à-úçãõ]/i.test(s) || /(^|\s)(o|a|os|as|um|uma|de|da|do|das|dos|e|no|na|em|para|pra)(\s|$)/i.test(s))
  // título brasileiro: rótulo pt-BR, apelido pt-BR, rótulo pt, apelido pt (nessa ordem), senão o original
  const wk = TITULOS[w.ptwiki] || {}
  // título brasileiro: a ficha da Wikipédia (título-bra) vale mais que tudo; depois os rótulos do Wikidata
  const t = [...(wk.bra || []), w.ptbr, ...altsbr.filter(ok), w.pt, ...altspt.filter(ok)].find(dif) || orig
  const nomes = [...new Set([t, orig, w.en, w.mul, ...(wk.bra || []), ...(wk.prt || []), w.pt, w.ptbr, ...altsbr.filter(ok), ...altspt.filter(ok)].filter(Boolean))]
  return { imdb: w.imdb, t, o: orig, ano: +w.ano || 0, nomes, fama: +w.links + (br ? 40 : 0) }
}

/* ---------- 2. Film Grab ---------- */
async function indiceFilmGrab() {
  const html = await cacheTxt('az.html', 'https://film-grab.com/movies-a-z/')
  const idx = new Map()
  for (const [, url, nome] of html.matchAll(/href="(https:\/\/film-grab\.com\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9-]+\/)"[^>]*>([^<]+)</g)) {
    const k = norm(nome)
    if (!idx.has(k)) idx.set(k, [])
    idx.get(k).push(url)
  }
  return idx
}
async function framesDe(url) {
  const html = await cacheTxt('p-' + hash(url) + '.html', url)
  if (!html) return null
  // O site usa espaço inseparável depois de "Year:"; sem isso um remake pode
  // receber os frames do desenho original com o mesmo nome.
  const ano = +(html.match(/Year:(?:\s|&nbsp;)*<a\b[^>]*>\s*(\d{4})\s*</i)?.[1] || 0)
  // nomes com espaço e parênteses ("01 (829).jpg") nos posts antigos: aceita e codifica a URL
  let imgs = [...html.matchAll(/https:\/\/film-grab\.com\/wp-content\/uploads\/photo-gallery\/[^"'<>\n]+?\.(?:jpg|jpeg|png)/gi)].map(m => encodeURI(m[0].replace(/&#0*39;|&#x0*27;/gi, "'").replace(/&amp;|&#0*38;/gi, '&')))
  imgs = [...new Set(imgs.filter(u => !/thumb|-\d+x\d+\./i.test(u)))]
  return { ano, imgs }
}

// frames espalhados entre 12% e 88% do filme (o começo e o fim costumam ter letreiro e créditos)
const espalha = (lista, n) => {
  const a = Math.floor(lista.length * 0.12), b = Math.ceil(lista.length * 0.88)
  const meio = lista.slice(a, b)
  if (meio.length <= n) return meio
  return Array.from({ length: n }, (_, i) => meio[Math.floor((i + 0.5) * meio.length / n)])
}
const webp = (ent, sai) => new Promise((ok, err) => execFile('magick', [ent, '-resize', '960x540>', '-strip', '-quality', '66', sai], e => (e ? err(e) : ok())))

/* ---------- 3. junta tudo ---------- */
const wdFamosos = await wikidata('FILTER(?links >= 35)'), wdBr = await wikidata('?item wdt:P495 wd:Q155. FILTER(?links >= 12)')
// filmes que a turma já viu (diário e calls do site): entram primeiro, mesmo se não forem tão famosos,
// para a categoria "Nossas sessões" do jogo ter o que mostrar
const SITE = process.env.CINE_SITE || 'https://cineminha-boo.vercel.app'
const vistos = new Set((await fetch(SITE + '/api/sessoes?vistos=1').then(r => r.json()).catch(() => ({})))?.imdb || [])
const wdVistos = vistos.size ? await wikidata(`VALUES ?imdb { ${[...vistos].map(i => `"${i}"`).join(' ')} }`) : []
console.log(`já vistos pela turma: ${vistos.size} (${wdVistos.length} no Wikidata)`)
const TITULOS = await titulosWiki([...wdFamosos, ...wdBr, ...wdVistos].map(w => w.ptwiki))
console.log(`títulos da Wikipédia: ${Object.values(TITULOS).filter(x => x.bra?.length).length} com nome no Brasil`)
const famosos = wdFamosos.map(w => filmeDe(w))
const brasileiros = wdBr.map(w => filmeDe(w, true))
const daTurma = wdVistos.map(w => ({ ...filmeDe(w), fama: 1e6 }))
const porImdb = new Map()
for (const f of [...famosos, ...brasileiros, ...daTurma]) if (!porImdb.has(f.imdb) || porImdb.get(f.imdb).fama < f.fama) porImdb.set(f.imdb, f)
const todos = [...porImdb.values()].filter(f => f.ano && f.ano >= 1930).sort((a, b) => b.fama - a.fama)
console.log(`${todos.length} filmes famosos no Wikidata`)

// catálogo do autocomplete: todos os famosos (bem mais que os do jogo, para a lista não entregar nada)
writeFileSync(path.join(SAIDA, 'catalogo.json'), JSON.stringify(catalogoCurado(todos.map(f => [f.t, f.o, f.ano]))))

const fg = await indiceFilmGrab()
const antigo = existsSync(path.join(SAIDA, 'filmes.json')) ? JSON.parse(readFileSync(path.join(SAIDA, 'filmes.json'), 'utf8')) : []
const jogo = new Map(antigo.map(f => [f.imdb, f]))
for (const f of todos) {
  if (jogo.size >= QUANTOS && !jogo.has(f.imdb) && !vistos.has(f.imdb)) continue
  if (jogo.has(f.imdb)) { Object.assign(jogo.get(f.imdb), { t: f.t, o: f.o, ano: f.ano, nomes: f.nomes }); continue } // títulos sempre atualizados
  const urls = [...new Set(f.nomes.flatMap(n => fg.get(norm(n)) || []))]
  if (!urls.length) continue
  let achou = null
  for (const u of urls) { const p = await framesDe(u); await sleep(400); if (p && (!p.ano || Math.abs(p.ano - f.ano) <= 1) && p.imgs.length >= FRAMES + 4) { achou = p; break } }
  if (!achou) continue
  const pasta = hash(f.imdb)
  const dir = path.join(SAIDA, 'f', pasta)
  mkdirSync(dir, { recursive: true })
  let n = 0
  for (const u of espalha(achou.imgs, FRAMES)) {
    const bin = await pega(u, 'bin'); await sleep(250)
    if (!bin || bin.length < 8000) continue
    const tmp = path.join(CACHE, 'x' + path.extname(u))
    writeFileSync(tmp, bin)
    try { await webp(tmp, path.join(dir, `${n}.webp`)); n++ } catch {}
  }
  if (n < 3) { rmSync(dir, { recursive: true, force: true }); continue }
  jogo.set(f.imdb, { imdb: f.imdb, t: f.t, o: f.o, ano: f.ano, nomes: f.nomes, p: pasta, n })
  console.log(`${jogo.size}/${QUANTOS}  ${f.t} (${f.ano}) · ${n} frames`)
  writeFileSync(path.join(SAIDA, 'filmes.json'), JSON.stringify([...jogo.values()]))
}
writeFileSync(path.join(SAIDA, 'filmes.json'), JSON.stringify([...jogo.values()]))
console.log('categorias:', await categorias(path.join(SAIDA, 'filmes.json')))
writeFileSync(path.join(SAIDA, 'CREDITOS.txt'), 'Frames: FILMGRAB (film-grab.com). Títulos: Wikidata (CC0).\nUso não comercial, num jogo entre amigos.\n')
console.log(`pronto: ${jogo.size} filmes no jogo, ${todos.length} no autocomplete`)
