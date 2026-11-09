// Seleção manual de títulos conhecidos e de pistas do menos óbvio ao mais fácil.
// Os números em `ordem` são os arquivos existentes, não momentos do filme.
import { readFileSync } from 'node:fs'

export const CURADORIA = JSON.parse(readFileSync(new URL('./curadoria.json', import.meta.url), 'utf8'))

export function aplicaCuradoria(filmes) {
  for (const entrada of CURADORIA) {
    const f = filmes.find(f => f.imdb === entrada.imdb || f.imdb === entrada.substitui)
    if (!f) continue
    Object.assign(f, entrada.corrige)
    const cats = new Set(f.c || [])
    if (entrada.famoso) cats.add('famosos')
    if (entrada.animacao === true) cats.add('animacao')
    if (entrada.animacao === false) cats.delete('animacao')
    f.c = [...cats]
    if (entrada.ordem) {
      const ordem = entrada.ordem
      if (ordem.length !== f.n || new Set(ordem).size !== f.n || ordem.some(i => !Number.isInteger(i) || i < 0 || i >= f.n)) {
        throw new Error(`Ordem de frames inválida: ${f.t}`)
      }
      f.ordem = ordem.slice()
    }
  }
  return filmes
}

export function catalogoCurado(catalogo) {
  const porTitulo = new Map(catalogo.map(f => [JSON.stringify(f), f]))
  for (const entrada of CURADORIA) {
    const f = entrada.corrige || (entrada.frames ? entrada : null)
    if (!f?.ano) continue
    const item = [f.t, f.o, f.ano]
    porTitulo.set(JSON.stringify(item), item)
  }
  return [...porTitulo.values()]
}
