// Atualiza filmes da curadoria com seis pistas escolhidas por dificuldade.
// Reexecutável: node tools/quadro/atualiza-curadoria.mjs
// Imagens: `frames`; trailers: `video` e seis `tempos`, em segundos.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { CURADORIA, CREDITOS, aplicaCuradoria, catalogoCurado } from './curadoria.mjs'

const exec = promisify(execFile)
const RAIZ = new URL('../../', import.meta.url).pathname
const SAIDA = path.join(RAIZ, 'public/jogos/quadro')
const CACHE = path.join(RAIZ, 'tmp/quadro/curadoria-assets')
const hash = s => createHash('sha1').update('quadro:' + s).digest('hex').slice(0, 12)
const ler = nome => JSON.parse(readFileSync(path.join(SAIDA, nome), 'utf8'))
mkdirSync(CACHE, { recursive: true })
const filmes = ler('filmes.json')

for (const entrada of CURADORIA.filter(f => f.frames || f.video)) {
  const p = hash(entrada.imdb), dir = path.join(SAIDA, 'f', p)
  mkdirSync(dir, { recursive: true })
  const pistas = entrada.video ? entrada.tempos : entrada.frames
  if (!pistas || pistas.length !== 6) throw new Error(`São necessárias seis pistas: ${entrada.t}`)
  let video
  if (entrada.video) {
    video = path.join(CACHE, hash(entrada.video) + '.mp4')
    if (!existsSync(video)) await exec('yt-dlp', ['--no-warnings', '--no-playlist', '-f', 'b[height<=720]/bv[height<=720]', '-o', video, entrada.video], { timeout: 180000 })
  }
  for (const [i, pista] of pistas.entries()) {
    let cache
    if (entrada.video) {
      if (!Number.isFinite(pista) || pista < 0) throw new Error(`Instante inválido: ${entrada.t}`)
      cache = path.join(CACHE, `${hash(entrada.video)}-${pista}.png`)
      if (!existsSync(cache)) await exec('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(pista), '-i', video, '-frames:v', '1', cache])
    } else {
      const url = pista
      cache = path.join(CACHE, hash(url) + path.extname(new URL(url).pathname))
      if (!existsSync(cache)) {
        const r = await fetch(url, { headers: { 'user-agent': 'CineminhaColeta/1.0 (jogo entre amigos; kellyson71/cineminha)' }, signal: AbortSignal.timeout(45000) })
        if (!r.ok || !r.headers.get('content-type')?.startsWith('image/')) throw new Error(`Frame indisponível: ${url}`)
        writeFileSync(cache, Buffer.from(await r.arrayBuffer()))
      }
    }
    const destino = path.join(dir, `${i}.webp`), temporario = path.join(dir, `${i}.tmp.webp`)
    await exec('magick', [cache, '-resize', '960x540>', '-strip', '-quality', '66', temporario])
    renameSync(temporario, destino)
  }
  const f = { imdb: entrada.imdb, t: entrada.t, o: entrada.o, ano: entrada.ano, nomes: entrada.nomes, p, n: pistas.length }
  const antigo = filmes.find(x => x.imdb === f.imdb)
  if (antigo) Object.assign(antigo, f)
  else filmes.push(f)
  console.log(`${f.t} (${f.ano}): ${f.n} frames revisados`)
}
writeFileSync(path.join(SAIDA, 'filmes.json'), JSON.stringify(aplicaCuradoria(filmes)))
writeFileSync(path.join(SAIDA, 'catalogo.json'), JSON.stringify(catalogoCurado(ler('catalogo.json'))))
writeFileSync(path.join(SAIDA, 'CREDITOS.txt'), CREDITOS)
console.log(`${filmes.length} filmes; ${filmes.filter(f => f.c.includes('animacao')).length} animações; ${filmes.filter(f => f.c.includes('brasil')).length} brasileiros; ${filmes.filter(f => f.c.includes('famosos')).length} famosos`)
