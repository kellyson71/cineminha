// UNO clássico: vetores baseados na referência enviada pelo usuário.
// Algarismos em Liberation Sans Bold Italic (SIL Open Font License 1.1).
const GLIFOS = {
  "0": "M36.2 2.5Q55.95 2.5 55.95 25.8Q55.95 31.55 54.05 40.75Q46.85 75 23.9 75Q13.9 75 9.07 69.12Q4.25 63.25 4.25 51.3Q4.25 44.35 6.48 34.1Q8.7 23.85 12.65 16.8Q16.6 9.75 22.4 6.12Q28.2 2.5 36.2 2.5ZM24.85 63.95Q30.7 63.95 34.23 58.58Q37.75 53.2 40.03 41.25Q42.3 29.3 42.3 25.15Q42.3 13.5 34.7 13.5Q30.4 13.5 27.73 15.85Q25.05 18.2 23.18 23.42Q21.3 28.65 19.6 38.88Q17.9 49.1 17.9 53.25Q17.9 63.95 24.85 63.95Z",
  "1": "M1.65 74 3.8 62.45H21.25L30.2 16.4L11.15 27.1L13.5 15L33.3 3.55H46.8L35.3 62.45H51.45L49.25 74Z",
  "2": "M-1.6 74 0.25 64.25Q2.7 60 5.9 56.45Q9.1 52.9 12.88 49.67Q16.65 46.45 25.7 40.15Q33.1 34.95 35.8 32.25Q38.5 29.55 39.98 26.75Q41.45 23.95 41.45 20.85Q41.45 13.7 33.35 13.7Q28.95 13.7 26.25 15.9Q23.55 18.1 22.2 22.9L8.9 19.95Q11.55 11 17.95 6.75Q24.35 2.5 34.35 2.5Q44.85 2.5 50.38 6.88Q55.9 11.25 55.9 19.85Q55.9 24.65 53.8 29Q51.7 33.35 47.48 37.42Q43.25 41.5 33.8 47.85Q27.2 52.35 23.28 55.75Q19.35 59.15 17.15 62.45H49.85L47.65 74Z",
  "3": "M26.75 32.55Q34.2 32.55 37.88 29.65Q41.55 26.75 41.55 21.45Q41.55 17.85 39.62 15.77Q37.7 13.7 33.7 13.7Q24.4 13.7 21.85 22.9L8.5 20.3Q13.6 2.5 34.25 2.5Q44.4 2.5 50.1 7.05Q55.8 11.6 55.8 19.7Q55.8 27.5 50.95 32.25Q46.1 37 37.75 37.75L37.7 37.95Q44.45 39 47.98 42.92Q51.5 46.85 51.5 53.1Q51.5 59.3 48.25 64.38Q45 69.45 39.1 72.22Q33.2 75 25.55 75Q14.25 75 7.92 70.35Q1.6 65.7 0.8 56.85L14.9 54.95Q15.45 59.45 18.05 61.58Q20.65 63.7 26.2 63.7Q31.4 63.7 34.33 60.9Q37.25 58.1 37.25 53.2Q37.25 43.9 26.25 43.9H20.9L23.1 32.55Z",
  "4": "M43.7 59.7 41 74H27.6L30.3 59.7H-1.7L0.35 49.35L36.2 3.55H54.7L45.8 49.2H55.2L53.1 59.7ZM40 13.7Q37.7 17.6 34.15 22.2L12.95 49.2H32.4L37.5 23Q38.4 18.5 40 13.7Z",
  "5": "M15.8 3.55H58.15L56 15.1H26.3L21.95 31.8Q22.85 31 24.08 30.2Q25.3 29.4 26.85 28.75Q28.4 28.1 30.35 27.7Q32.3 27.3 34.7 27.3Q43.05 27.3 48.12 32.95Q53.2 38.6 53.2 48.1Q53.2 56.15 49.68 62.28Q46.15 68.4 39.55 71.7Q32.95 75 24.3 75Q14.35 75 8.38 70.58Q2.4 66.15 1 57.55L15.15 55.3Q16.05 59.95 18.43 61.83Q20.8 63.7 25.5 63.7Q31.75 63.7 35.33 59.88Q38.9 56.05 38.9 49.7Q38.9 44.45 36.43 41.55Q33.95 38.65 29.45 38.65Q23.3 38.65 19.35 43.2H5.65Z",
  "6": "M26.65 75Q16.15 75 10.45 68.35Q4.75 61.7 4.75 49.65Q4.75 36.2 8.93 25.32Q13.1 14.45 20.58 8.47Q28.05 2.5 37.25 2.5Q46.25 2.5 51.42 6.67Q56.6 10.85 57.5 18.7L44.2 20.75Q43.5 17.1 41.65 15.35Q39.8 13.6 36.5 13.6Q30.75 13.6 26.5 19.35Q22.25 25.1 20.3 36.7Q22.95 33.1 27.03 30.87Q31.1 28.65 36.25 28.65Q44.45 28.65 49.18 33.65Q53.9 38.65 53.9 47.35Q53.9 54.9 50.4 61.3Q46.9 67.7 40.68 71.35Q34.45 75 26.65 75ZM18.45 52.55Q18.45 57.8 20.9 60.9Q23.35 64 27.9 64Q33.25 64 36.42 59.92Q39.6 55.85 39.6 49.05Q39.6 44.2 37.23 41.6Q34.85 39 30.7 39Q27.35 39 24.5 40.7Q21.65 42.4 20.05 45.5Q18.45 48.6 18.45 52.55Z",
  "7": "M9.4 3.55H60.95L58.75 14.7L50.65 24.4Q37.7 39.7 31.95 50.55Q26.2 61.4 23.6 74H8.7Q10.45 64.9 13.88 57.23Q17.3 49.55 21.98 42.55Q26.65 35.55 32.43 28.87Q38.2 22.2 44.65 15.1H7.15Z",
  "8": "M35.35 2.55Q45.3 2.55 51.05 7.12Q56.8 11.7 56.8 19.45Q56.8 26.45 52.53 31.15Q48.25 35.85 41 36.85L40.95 37.05Q46.5 38.7 49.48 42.75Q52.45 46.8 52.45 52.4Q52.45 62.8 45.03 68.9Q37.6 75 24.65 75Q13.55 75 7.45 69.97Q1.35 64.95 1.35 56Q1.35 48.65 6.08 43.75Q10.8 38.85 19.3 37.15V36.95Q14.7 34.9 12.33 30.87Q9.95 26.85 9.95 21.4Q9.95 12.55 16.8 7.55Q23.65 2.55 35.35 2.55ZM32.4 32Q37.1 32 39.83 29.02Q42.55 26.05 42.55 20.8Q42.55 12.4 33.95 12.4Q29.2 12.4 26.5 15.17Q23.8 17.95 23.8 23Q23.8 27.35 26.05 29.67Q28.3 32 32.4 32ZM28.05 42Q22.25 42 19.05 45.55Q15.85 49.1 15.85 55.15Q15.85 59.9 18.53 62.5Q21.2 65.1 26 65.1Q31.4 65.1 34.7 61.5Q38 57.9 38 51.8Q38 47.05 35.35 44.52Q32.7 42 28.05 42Z",
  "9": "M40.85 41.35Q37.6 45.2 33.9 47.02Q30.2 48.85 25 48.85Q16.95 48.85 12.15 43.5Q7.35 38.15 7.35 29.35Q7.35 21.9 10.9 15.68Q14.45 9.45 20.73 5.98Q27 2.5 34.6 2.5Q44.6 2.5 50.55 8.92Q56.5 15.35 56.5 26.15Q56.5 34.75 54.08 44.38Q51.65 54 47.3 60.98Q42.95 67.95 37.05 71.47Q31.15 75 23.95 75Q14.85 75 9.3 70.7Q3.75 66.4 2.4 58.45L16.1 56.05Q17.55 63.9 24.9 63.9Q36.55 63.9 40.85 41.35ZM42.75 23.55Q42.75 19.2 40.25 16.35Q37.75 13.5 33.9 13.5Q28.2 13.5 24.9 17.7Q21.6 21.9 21.6 29Q21.6 33.25 24 35.88Q26.4 38.5 30.55 38.5Q36.25 38.5 39.5 34.5Q42.75 30.5 42.75 23.55Z",
  "+": "M37.5 45.55V65.95H26.2V45.55H6.25V34.35H26.2V13.95H37.5V34.35H57.6V45.55Z",
}

const cache = new Map()
const em = (arte, x, y, tamanho) => `<g transform="translate(${x} ${y}) scale(${tamanho / 100})">${arte}</g>`
const contorno = arte => `<g fill="#fff" stroke="#141414" stroke-width="3" stroke-linejoin="round" paint-order="stroke fill">${arte}</g>`
const numero = (valor, x, y, altura) => {
  const escala = altura / 74
  const letras = [...valor].map((c, i) => `<path transform="translate(${i * 57.5} 0)" d="${GLIFOS[c]}"/>`).join('')
  const sublinha = valor === '6' || valor === '9' ? '<path d="M5 84h45" fill="none" stroke-linecap="square"/>' : ''
  return `<g transform="translate(${x - valor.length * 57.5 * escala / 2} ${y}) scale(${escala})" stroke-linejoin="round" paint-order="stroke fill">
    <g transform="translate(2 2)" fill="#141414" stroke="#141414" stroke-width="7">${letras}${sublinha}</g>
    <g fill="#fff" stroke="#141414" stroke-width="3.5">${letras}</g>
    ${sublinha ? `<g stroke="#fff" stroke-width="4">${sublinha}</g>` : ''}
  </g>`
}
const ovalColorido = (x, y, rx, ry, giro = 30, borda = 4) => `<g transform="translate(${x} ${y}) rotate(${giro})">
  <path d="M0 0H-${rx}A${rx} ${ry} 0 0 1 0-${ry}Z" fill="var(--r)"/>
  <path d="M0 0V-${ry}A${rx} ${ry} 0 0 1 ${rx} 0Z" fill="var(--b)"/>
  <path d="M0 0H${rx}A${rx} ${ry} 0 0 1 0 ${ry}Z" fill="var(--g)"/>
  <path d="M0 0V${ry}A${rx} ${ry} 0 0 1-${rx} 0Z" fill="var(--y)"/>
  <ellipse rx="${rx}" ry="${ry}" fill="none" stroke="#fff" stroke-width="${borda}"/>
</g>`
const elipse = preenchida => `<ellipse cx="100" cy="156" rx="64" ry="145" transform="rotate(30 100 156)" fill="${preenchida ? '#fff' : 'none'}" stroke="#fff" stroke-width="4.5"/>`
const pula = () => `<g fill="none" stroke-linecap="round">
  <g stroke="#141414" stroke-width="17"><circle cx="50" cy="50" r="34"/><path d="m26 74 48-48"/></g>
  <g stroke="#fff" stroke-width="10"><circle cx="50" cy="50" r="34"/><path d="m26 74 48-48"/></g>
</g>`
const inverte = () => contorno('<path transform="translate(-8 -8)" d="m33 51 31-31-9-9h31v31l-9-9-31 31z"/><path transform="translate(8 8)" d="M67 49 36 80l9 9H14V58l9 9 31-31z"/>')
const compra = quantidade => {
  const posicoes = quantidade === 2 ? [[46, 12, '#fff'], [24, 42, '#fff']]
    : [[6, 47, 'var(--g)'], [27, 27, 'var(--r)'], [48, 7, 'var(--b)'], [69, -13, 'var(--y)']]
  return `<g stroke="#141414" stroke-width="3" stroke-linejoin="round">${posicoes.map(([x, y, cor]) => `<rect x="${x}" y="${y}" width="28" height="48" rx="3" fill="${cor}"/>`).join('')}</g>`
}
const simbolo = valor => {
  switch (valor) {
    case 'pula': return pula()
    case 'inverte': return inverte()
    case '+2': return compra(2)
    case '+4': return compra(4)
    case 'pulaT': return pula() + '<path d="M11 50a39 39 0 0 1 78 0" fill="none" stroke="#141414" stroke-width="4"/>'
    case 'desc': return compra(2) + contorno('<path d="M58 72h20V61l18 18-18 18V86H58z"/>')
    case 'inv4': return em(inverte(), 0, 0, 83) + numero('+4', 77, 59, 28)
    case 'roleta': return ovalColorido(50, 50, 35, 43, 0, 2.5) + '<path d="M50 20v30l18 10m-25-32 7-8 7 8" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
    default: return ''
  }
}

/** A arte contém a moldura: o contorno fica proporcional até nas cartas pequenas. */
export function arteClassica(valor, cor) {
  const chave = `${valor || 'verso'}:${cor || 'k'}`
  if (cache.has(chave)) return cache.get(chave)
  const fundo = `<rect width="200" height="312" rx="16" fill="#fff"/><rect x="8" y="8" width="184" height="296" rx="10" fill="${cor ? `var(--${cor})` : '#080808'}"/>`
  let arte
  if (!valor) {
    arte = '<image href="jogos/uno/logo.svg" x="20" y="90" width="160" height="132"/>'
  } else if (valor === 'cor') {
    const canto = ovalColorido(35, 37, 10, 22, 30, 1.8)
    arte = ovalColorido(100, 156, 64, 145) + canto + `<g transform="rotate(180 100 156)">${canto}</g>`
  } else {
    const digito = /^\d$/.test(valor), comprar = /^\+\d+$/.test(valor)
    const centro = digito ? numero(valor, 99, 101, 110)
      : valor === '+6' || valor === '+10' ? numero(valor, 100, 126, valor === '+10' ? 49 : 59)
      : em(simbolo(valor), 41, 98, 118)
    const canto = digito || comprar ? numero(valor, valor.length > 2 ? 49 : valor.length > 1 ? 40 : 29, 18, 29)
      : em(simbolo(valor), 15, 17, 33)
    arte = elipse(!cor) + centro + canto + `<g transform="rotate(180 100 156)">${canto}</g>`
  }
  const svg = `<svg class="dc-arte-classica" viewBox="0 0 200 312" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${fundo}${arte}</svg>`
  cache.set(chave, svg)
  return svg
}
