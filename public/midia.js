// "O que está passando": quem projeta a tela lê o texto da própria transmissão (OCR, no navegador)
// e reconhece a Netflix pela tela de pausa ("Você está assistindo a …") ou pela barra do player
// ("O Conto da Aia T1:E7 …"). Com o título, o servidor busca capa, nota e episódio.
// Carregado só quando alguém projeta uma tela; o OCR roda num worker e só a cada poucos segundos.
const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
const INTERVALO = 5000

let worker = null
function carregaScript(src) {
  return new Promise((ok, erro) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = erro; document.head.append(s) })
}
async function ocr(canvas) {
  if (!worker) {
    if (!window.Tesseract) await carregaScript(TESSERACT)
    worker = await window.Tesseract.createWorker(['por', 'eng'], 1, { logger: () => {} })
  }
  return (await worker.recognize(canvas)).data.text || ''
}

const limpa = s => s.replace(/[|_~«»"“”]+/g, '').replace(/\s+/g, ' ').trim()
// Texto da tela → { plat, titulo, s, e, epNome } ou null
const RE_TEMP = /\b(?:temporada|season|parte|part)\s*(\d{1,2})\b/i
const RE_EP = /\b(?:epis.{1,2}dio|episode)\s*(\d{1,3})\s*[:.\-–]?\s*(.*)$/i
export function lerTexto(texto) {
  const linhas = texto.normalize('NFC').split('\n').map(limpa).filter(l => l.length > 1)
  // tela de pausa: "Você está assistindo a" / título / "Temporada 1" / "Episódio 7: Nome"
  const i = linhas.findIndex(l => /(assistindo a|you.?re watching|est[áa]s a ver)\s*$/i.test(l))
  const iT = linhas.findIndex(l => RE_TEMP.test(l))
  const iE = linhas.findIndex(l => RE_EP.test(l))
  const tit = i >= 0 ? linhas[i + 1] : iT > 0 && iE > iT && iE - iT <= 2 ? linhas[iT - 1] : null
  if (tit) {
    const r = { plat: 'netflix', titulo: tit.slice(0, 100), s: iT >= 0 ? +linhas[iT].match(RE_TEMP)[1] : 0, e: 0, epNome: '' }
    if (iE >= 0) { const m = linhas[iE].match(RE_EP); r.e = +m[1]; r.epNome = m[2].length < 4 || /^\W*z?E\W*\d+\W*$/i.test(m[2]) ? '' : m[2].slice(0, 100) }
    if (r.e && !r.s) r.s = 1
    return r
  }
  // barra do player (aparece ao mexer o mouse): "Título T1:E7 Nome do episódio"
  for (const l of linhas) {
    const m = l.match(/^(.{2,80}?)\s+[TS]\s?(\d{1,2})\s?[:.]\s?E\s?(\d{1,3})\b\s*(.*)$/)
    if (m) return { plat: 'netflix', titulo: m[1], s: +m[2], e: +m[3], epNome: m[4].slice(0, 100) }
  }
  return null
}

// Recorta uma parte do quadro e deixa só o texto: o que é bem claro (letra branca da Netflix) vira preto,
// o resto (cena escurecida atrás) vira branco. Inverter só o quadro não basta: a cena atrás confunde o OCR.
function recorte(fonte, fw, fh, x, y, w, h) {
  const c = document.createElement('canvas'), k = Math.min(2, 1600 / (w * fw))
  c.width = Math.round(w * fw * k); c.height = Math.round(h * fh * k)
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(fonte, x * fw, y * fh, w * fw, h * fh, 0, 0, c.width, c.height)
  const img = g.getImageData(0, 0, c.width, c.height), D = img.data
  for (let i = 0; i < D.length; i += 4) D[i] = D[i + 1] = D[i + 2] = D[i] * .3 + D[i + 1] * .59 + D[i + 2] * .11 > 170 ? 0 : 255
  g.putImageData(img, 0, 0)
  return c
}

// Fica de olho na trilha de vídeo; chama aoAchar(info) quando reconhece algo novo.
export function criaDetector(vt, aoAchar) {
  let parado = false, vez = 0, ultimo = '', timer = null
  const cap = 'ImageCapture' in window ? new ImageCapture(vt) : null
  const passo = async () => {
    if (parado || vt.readyState !== 'live') return
    try {
      const quadro = await cap?.grabFrame()
      if (quadro) {
        const regs = [[0, .18, .62, .7], [0, .78, 1, .22]] // tela de pausa (esquerda) e barra do player (embaixo)
        const [x, y, w, h] = regs[vez++ % regs.length]
        const r = lerTexto(await ocr(recorte(quadro, quadro.width, quadro.height, x, y, w, h)))
        quadro.close?.()
        const chave = r && `${r.titulo.toLowerCase()}|${r.s}|${r.e}`
        if (r && chave !== ultimo) { ultimo = chave; aoAchar(r) }
      }
    } catch {}
    if (!parado) timer = setTimeout(passo, INTERVALO)
  }
  timer = setTimeout(passo, 1500)
  return { parar() { parado = true; clearTimeout(timer) } }
}

// Busca capa, nota e episódio. Guarda por sessão para não repetir a busca.
const cache = new Map()
export async function buscaMidia(r) {
  const chave = `${r.titulo}|${r.s}|${r.e}`
  if (!cache.has(chave)) cache.set(chave, fetch(`api/filmes?midia=${encodeURIComponent(r.titulo)}&s=${r.s}&e=${r.e}`).then(x => x.json()).then(x => x.midia).catch(() => null))
  return cache.get(chave)
}
