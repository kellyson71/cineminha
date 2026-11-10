// Regressão: uma coprodução estrangeira não vira filme nacional por ter capital brasileiro.
// node tools/quadro/teste-categorias.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { categorias } from './categorias.mjs'

const dir = mkdtempSync(path.join(tmpdir(), 'quadro-categorias-'))
const arq = path.join(dir, 'filmes.json'), original = globalThis.fetch
try {
  writeFileSync(arq, JSON.stringify([
    { imdb: 'tt0133093', t: 'Matrix', n: 6, c: [] },
    { imdb: 'tt5726616', t: 'Me Chame Pelo Seu Nome', n: 6, c: ['brasil'] },
    { imdb: 'tt0317248', t: 'Cidade de Deus', n: 6, c: [] },
  ]))
  globalThis.fetch = async url => {
    const q = new URL(url).searchParams.get('query')
    assert.match(q, /wdt:P495 wd:Q155;\s*wdt:P364 wd:Q5146/)
    return { json: async () => ({ results: { bindings: [
      { imdb: { value: 'tt0133093' }, gs: { value: 'science fiction|action' }, brasil: { value: '0' }, oscar: { value: '0' } },
      // Uma resposta antiga ou divergente do Wikidata não desfaz a correção manual.
      { imdb: { value: 'tt5726616' }, gs: { value: 'romance' }, brasil: { value: '1' } },
      { imdb: { value: 'tt0317248' }, gs: { value: 'crime' }, brasil: { value: '1' } },
    ] } }) }
  }
  const conta = await categorias(arq)
  const filmes = JSON.parse(readFileSync(arq, 'utf8'))
  assert.equal(conta.brasil, 1)
  assert.equal(filmes[0].c.includes('brasil'), false)
  assert.equal(filmes[0].c.includes('oscar'), false)
  assert.equal(filmes[1].c.includes('brasil'), false)
  assert.equal(filmes[2].c.includes('brasil'), true)
  assert.deepEqual(filmes[2].ordem, [5, 4, 1, 3, 2, 0])
  console.log('OK: critério nacional, valores 0/1 e correções manuais preservados após reclassificar.')
} finally {
  globalThis.fetch = original
  rmSync(dir, { recursive: true, force: true })
}
