/* Salas com tema próprio: entrar numa delas veste o Cineminha com o tema (sem recarregar a página).
   A troca de sala muda o ?sala= do endereço, então é só acompanhar ele. A sala de GTA VI é a "Vice City". */
const TEMAS = [[/^(vice-city|gta)/, 'gta6']]
let atual = ''
function confere() {
  const sala = new URLSearchParams(location.search).get('sala') || ''
  const tema = TEMAS.find(([re]) => re.test(sala))?.[1] || ''
  if (tema === atual) return
  if (atual) document.body.classList.remove('tema-' + atual)
  atual = tema
  if (!tema) return
  if (!document.querySelector(`link[data-tema-sala="${tema}"]`)) {
    const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `themes/${tema}/theme.css` })
    l.dataset.temaSala = tema; document.head.append(l)
  }
  document.body.classList.add('tema-' + tema)
}
confere()
setInterval(confere, 700)
