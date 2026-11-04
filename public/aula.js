// Motor de tutorial dos jogos ("aula"): passos curtos, cada um uma cena animada que ensina uma regra só.
// Cada cena é uma linha do tempo de batidas: o motor acrescenta as classes b1, b2, b3… na cena e o CSS do jogo anima a
// transição entre elas. Como o estado fica nas classes, a cena aguenta os re-renders do jogo sem recomeçar do zero.
// Um passo pode ser interativo (sem dur): a cena recebe { sub, de novo } e reage aos cliques.
//
// passos: [{ k, titulo, sub, batidas: [ms…], dur, sons: { b: 'nome' }, cena: api => [nós] }]

const VOLTAS = 2 // quantas vezes cada cena roda antes de passar sozinha para a próxima

export function criaAula({ el, icon, hydrate, som = () => {}, passos, cls = '' }) {
  const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches
  let i = 0, auto = true, timers = [], voltas = 0, pausada = false

  const titulo = el('h3', { className: 'au-titulo' })
  const sub = el('p', { className: 'au-sub' })
  const num = el('span', { className: 'au-num' })
  const cena = el('div', { className: 'au-cena' })
  const pontos = el('div', { className: 'au-pontos' }, ...passos.map((p, k) => {
    const b = el('button', { type: 'button', className: 'au-ponto', title: p.titulo }, el('i'))
    b.addEventListener('click', e => { e.stopPropagation(); auto = false; vai(k) })
    return b
  }))
  const seta = (dir, nome) => {
    const b = el('button', { type: 'button', className: `au-seta au-seta--${dir < 0 ? 'ant' : 'prox'}`, title: nome }, icon(dir < 0 ? 'chevron-left' : 'chevron-right'))
    b.addEventListener('click', e => { e.stopPropagation(); auto = false; vai(i + dir) })
    return b
  }
  const ant = seta(-1, 'Passo anterior'), prox = seta(1, 'Próximo passo')
  const raiz = el('section', { className: `au ${cls}` },
    el('div', { className: 'au-topo' }, num, titulo),
    el('div', { className: 'au-meio' }, ant, cena, prox),
    sub, pontos)
  raiz.addEventListener('pointerenter', () => { pausada = true })
  raiz.addEventListener('pointerleave', () => { pausada = false })
  hydrate?.(raiz)

  const limpa = () => { timers.forEach(clearTimeout); timers = [] }
  const depois = (ms, fn) => timers.push(setTimeout(fn, ms))
  function zera() {
    cena.classList.add('au-zera')
    for (let b = 1; b <= 12; b++) cena.classList.remove('b' + b)
    void cena.offsetWidth
    cena.classList.remove('au-zera')
  }
  function toca() {
    const p = passos[i]
    limpa(); zera()
    if (reduz) { p.batidas.forEach((_, b) => cena.classList.add('b' + (b + 1))); return }
    p.batidas.forEach((ms, b) => depois(ms, () => {
      if (!raiz.isConnected) return
      cena.classList.add('b' + (b + 1))
      const s = p.sons?.[b + 1]
      if (s) som(s, 0, .35)
    }))
    if (p.dur) depois(p.dur, () => {
      if (!raiz.isConnected) return limpa()
      voltas++
      if (auto && !pausada && voltas >= VOLTAS && i < passos.length - 1) return vai(i + 1)
      toca()
    })
  }
  function vai(k) {
    i = Math.max(0, Math.min(passos.length - 1, k)); voltas = 0
    const p = passos[i]
    raiz.dataset.passo = p.k
    raiz.dataset.fim = String(p.batidas.at(-1) || 0) // para os testes saberem quando a cena terminou
    titulo.textContent = p.titulo; sub.textContent = p.sub
    num.textContent = `${i + 1}/${passos.length}`
    cena.className = `au-cena au-cena--${p.k}`
    cena.replaceChildren(...p.cena({ sub: t => { sub.textContent = t }, denovo: () => vai(i), cena }).flat().filter(Boolean))
    hydrate?.(cena)
    pontos.querySelectorAll('.au-ponto').forEach((b, n) => {
      b.classList.toggle('feito', n < i); b.classList.toggle('agora', n === i)
      b.style.setProperty('--dur', `${(p.dur || 0) * VOLTAS}ms`)
    })
    // a barrinha do passo atual só enche quando ele vai passar sozinho
    pontos.classList.toggle('parado', !auto || !p.dur || i === passos.length - 1)
    ant.disabled = i === 0; prox.disabled = i === passos.length - 1
    toca()
  }

  vai(0)
  return {
    raiz,
    // a cada render do jogo: se a aula voltou para a tela com a linha do tempo parada, retoma
    acorda() { if (!timers.length && passos[i].dur) toca() },
    para() { limpa() },
    reinicia() { auto = true; vai(0) },
  }
}
