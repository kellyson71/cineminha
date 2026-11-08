// Aula do Dobro: oito cenas curtas, uma regra por cena, e no fim um treino (escolher a carta certa).
// Peças com classes de batida (ver aula.css): eN entra, sN sai, vN/wN move, mN apaga, dN destaca, pN carimba, tN treme.

const CURSOR = '<svg viewBox="0 0 32 32"><path d="M9 3.5c0-1.4 1.6-2.2 2.7-1.3l15 12.4c1.1.9.5 2.7-.9 2.8l-6.2.4 3.6 7.6c.5 1 0 2.2-1 2.6l-2.4 1.1c-1 .5-2.2 0-2.6-1l-3.6-7.7-4.4 4.3c-1 1-2.8.3-2.8-1.2z" fill="#fff" stroke="#1b1208" stroke-width="1.6" stroke-linejoin="round"/></svg>'

export function passosDobradinha({ el, carta, svg, guarda, dois }) {
  const A = (n, x, y, cls = '', css = '') => { n.classList.add('au-a', ...cls.split(' ').filter(Boolean)); n.style.cssText += `left:${x}cqh;top:${y}cqh;${css}`; return n }
  let uid = 600
  const c = (v, x, y, cls = '', w = 7.4, css = '') => A(carta(v === null ? null : { id: uid++, v }), x, y, `dba-carta ${cls}`, `--w:${w}cqh;${css}`)
  const lousa = (x, y, vals) => A(el('div', { className: 'dba-lousa' }, el('small', { textContent: 'lousa' }), ...vals.map(([v, cls]) => el('b', { className: `dba-lousa__v au-a ${cls}`, textContent: String(v) }))), x, y)
  const giz = (txt, x, y, cls = '', css = '') => A(el('span', { className: 'dba-giz', textContent: txt }), x, y, cls, css)
  const cursor = (x, y, cls, css) => A(el('span', { className: 'au-cursor', innerHTML: CURSOR }), x, y, cls, css)
  const selo = (txt, x, y, cls) => A(el('span', { className: 'dba-selo', textContent: txt }), x, y, cls)
  const comanda = (x, y, cls, riscos) => A(el('div', { className: 'dba-comanda' }, el('small', { textContent: 'comanda' }), el('span', { className: 'dba-comanda__r' }, ...riscos.map(r => A(el('i'), 0, 0, r)))), x, y, cls)
  const faisca = (x, y, cls) => A(el('i', { className: 'dba-faisca' }, ...Array.from({ length: 8 }, (_, i) => el('b', { style: `--k:${i}` }))), x, y, cls)
  const pessoa = (txt, cor, x, y, cls = '') => A(el('span', { className: 'dba-pessoa', style: `--cor:${cor}`, textContent: txt }), x, y, cls)
  // a mesma mão em todas as cenas: três cartas embaixo
  const mao = (vs, cls = []) => vs.map((v, i) => c(v, 13 + i * 10, 23, cls[i] || ''))

  return [
    {
      k: 'sobe', titulo: 'Jogue igual ou maior', batidas: [500, 1300, 2000, 2700, 3400], dur: 6400, sons: { 3: 'poe1', 4: 'tique' },
      sub: 'A lousa mostra o valor da mesa. Na sua vez, jogue uma carta que alcance esse valor.',
      cena: () => [c(4, 24, 4), lousa(52, 4, [[4, 's4'], [7, 'e4']]),
        c(2, 13, 23, 'm5'), c(7, 23, 23, 'v2 w3', 7.4, '--dy:-3cqh;--dx2:5cqh;--dy2:-17cqh'), c(10, 33, 23),
        giz('7 ≥ 4: vale!', 51, 20, 'e5'), giz('2 não alcança', 8, 18.4, 'e5', 'font-size:2.2cqh'),
        cursor(64, 34, 'v1 s3', '--dx:-36cqh;--dy:-6cqh')],
    },
    {
      k: 'par', titulo: 'Duas iguais somam', batidas: [500, 1300, 2100, 2900, 3500], dur: 6400, sons: { 4: 'poe2' },
      sub: 'Pode jogar duas cartas iguais juntas: elas se somam (e um curinga faz par com qualquer número).',
      cena: () => [c(7, 24, 4), lousa(52, 4, [[7, 's5'], [8, 'e5']]),
        c(4, 13, 23, 'v2 w4', 7.4, '--dy:-3cqh;--dx2:12cqh;--dy2:-17cqh'), c(4, 23, 23, 'v2 w4', 7.4, '--dy:-3cqh;--dx2:5cqh;--dy2:-18.5cqh;--atraso:.06s'), c(11, 33, 23),
        giz('4 + 4 = 8', 38, 13, 'p3 s5'), giz('8 ≥ 7: vale!', 51, 20, 'e5'),
        cursor(64, 34, 'v1 s3', '--dx:-46cqh;--dy:-6cqh')],
    },
    {
      k: 'dobra', titulo: 'Cravou? Dobra!', batidas: [500, 1200, 1900, 2500, 3100], dur: 6200, sons: { 3: 'poe1', 4: 'carimbo' },
      sub: 'Se a sua jogada der exatamente o valor da lousa, ele dobra. Daí o nome do jogo.',
      cena: () => [c(6, 24, 4, 'd4'), lousa(52, 4, [[6, 's5'], [12, 'e5']]),
        c(3, 13, 23), c(6, 23, 23, 'v2 w3 d4', 7.4, '--dy:-3cqh;--dx2:5cqh;--dy2:-17cqh'), c(9, 33, 23),
        selo('×2', 43, 3, 'p4'), faisca(31, 8, 'p4'), giz('6 = 6: dobrou!', 51, 20, 'e5'),
        cursor(64, 34, 'v1 s3', '--dx:-36cqh;--dy:-6cqh')],
    },
    {
      k: 'leva', titulo: 'Não dá? Leva a mesa', batidas: [500, 1400, 2100, 2900, 3600, 4300], dur: 7200, sons: { 1: 'tique', 3: 'desliza2', 4: 'papel' },
      sub: 'Sem carta (ou sem vontade) de subir, você leva as cartas da mesa para a sua comanda e começa uma escalada nova.',
      cena: () => [
        ...[[5, 14, 7], [8, 19, 5.6], [11, 24, 4.2]].map(([v, x, y], i) => c(v, x, y, 'v3 s4', 6.6, `--dx:${48 - x}cqh;--dy:${23 - y}cqh;--atraso:${i * .07}s`)),
        lousa(52, 4, [[11, 's5'], ['—', 'e5']]),
        ...mao([3, 4, 6], ['t1 m1', 't1 m1', 't1 m1']).map((n, i) => (n.style.cssText += `--atraso:${i * .06}s`, n)),
        giz('nenhuma alcança 11', 6, 17, 'e1 s3', 'font-size:2.2cqh'),
        comanda(48, 22, '', ['e4', 'e4', 'e4']), giz('+3 na comanda', 47, 31.6, 'e4', 'font-size:2.1cqh'),
        giz('e você abre a próxima', 8, 17, 'e6'),
        cursor(64, 34, 'v2 s4', '--dx:-40cqh;--dy:-22cqh')],
    },
    {
      k: 'especiais', titulo: 'As cartas especiais', batidas: [300, 1700, 3100], dur: 7400, sons: { 1: 'poe1', 2: 'pular', 3: 'inverter' },
      sub: dois ? 'Curinga vale o que você quiser. Passa pula a vez sem mexer na lousa. (Com 2 pessoas o Inverte fica de fora.)' : 'Curinga vale o que você quiser. Passa e Inverte pulam a vez sem mexer na lousa; o Inverte ainda vira o sentido da mesa.',
      cena: () => [
        c('cur', 7, 4, 'e1 d1', 9), A(el('div', { className: 'dba-roleta' }, ...[2, 5, 9, 12, 7].map(v => el('b', { textContent: String(v) }))), 18, 7, 'e1'), giz('vale de 2 a 12', 5, 27, 'e1', 'width:20cqh'),
        c('passa', 33, 4, 'e2 d2', 9), A(el('div', { className: 'dba-roda' }, pessoa('A', '#c2362c'), pessoa('B', '#1e6a45'), pessoa('C', '#1d4c9b'), el('i', { className: 'dba-vez' })), 30, 18, 'e2'), giz('a vez pula, a lousa fica', 27, 27, 'e2', 'width:22cqh'),
        c('inv', 57, 4, 'e3 d3', 9), A(el('span', { className: 'dba-giro' }, svg('seta')), 61, 18.4, 'e3'), giz('o sentido vira', 53, 27, 'e3', 'width:18cqh'),
      ],
    },
    {
      k: 'repor', titulo: 'Jogou? Reponha a mão', batidas: [400, 1100, 1500, 2200, 3800, 4600, 5600], dur: 8200, sons: { 3: 'desliza1', 6: 'pular' },
      sub: 'Depois de jogar, a vez já segue: clique no monte para completar a mão antes do tempo acabar. Esqueceu? Fica com o Esquecido: −1 ponto na rodada.',
      cena: () => [
        ...[3, 8, 5, 11].map((v, i) => c(v, 5 + i * 8, 23, '', 6.6)),
        A(el('i', { className: 'dba-vaga' }), 37, 23), A(el('i', { className: 'dba-vaga' }), 45, 23),
        A(el('div', { className: 'dba-monte' }, ...[0, 1, 2, 3].map(i => carta(null, 'dba-monte__c'))), 58, 5, 'd1 d2'),
        c(null, 58, 5, 'v3 s5', 6.6, '--dx:-21cqh;--dy:18cqh'), c(null, 58, 5, 'v3 s5', 6.6, '--dx:-13cqh;--dy:18cqh;--atraso:.1s'),
        giz('mão cheia!', 36, 14, 'e3 s5'),
        cursor(40, 33, 'v1 s4', '--dx:22cqh;--dy:-20cqh'),
        giz('e se esquecer…', 4, 6, 'e5', 'font-size:2.6cqh'), A(el('i', { className: 'dba-prazo' }), 4, 13, 'e5 s7'),
        A(guarda('dba-guarda'), 20, -10, 'v6', '--dx:0cqh;--dy:24cqh'), selo('−1', 28, 11, 'p7')],
    },
    {
      k: 'fim', titulo: 'Menos cartas, mais pontos', batidas: [400, 1300, 2200, 3000, 3800], dur: 6800, sons: { 3: 'moedas', 4: 'carimbo' },
      sub: 'Acabou o monte e alguém zerou a mão: fim da rodada. Quem levou menos cartas faz mais pontos. No fim, ganha quem somou mais.',
      cena: () => [['A', '#c2362c', 9], ['B', '#1e6a45', 5], ['Você', '#e8a817', 2]].flatMap(([nm, cor, q], k) => [
        A(el('div', { className: 'dba-pilha' }, ...Array.from({ length: q }, (_, j) => el('i', { style: `--q:${j}` }))), 10 + k * 22, 4, 'e1', `--atraso:${k * .1}s`),
        giz(`${q} carta${q > 1 ? 's' : ''}`, 7 + k * 22, 21, 'e2', 'width:16cqh'),
        selo(`+${k + 1}`, 20 + k * 22, 14, 'p3', ''),
        pessoa(nm, cor, nm === 'Você' ? 10.6 + k * 22 : 12.5 + k * 22, 27, nm === 'Você' ? 'dba-pessoa--eu' : ''),
      ]).concat([A(el('span', { className: 'dba-coroa', innerHTML: '<svg viewBox="0 0 48 32"><path d="M4 28 2 8l12 9L24 2l10 15 12-9-2 20z" fill="#e8a817" stroke="#7a4f05" stroke-width="2" stroke-linejoin="round"/></svg>' }), 55.5, 8, 'p4')]),
    },
    {
      k: 'treino', titulo: 'Sua vez!', batidas: [200], dur: 0,
      sub: 'A lousa está em 6. Clique numa carta da sua mão.',
      cena: ({ sub, denovo, cena }) => {
        const msg = giz('', 50, 21, 'dba-msg', 'width:24cqh')
        const x2 = selo('×2', 43, 3, 'dba-x2t'), fx = faisca(31, 8, 'dba-fxt')
        const lo = lousa(52, 4, [[6, 'dba-l6'], [9, 'dba-l9'], [12, 'dba-l12']])
        let fim = false
        const mao = [3, 6, 9].map((v, i) => {
          const n = c(v, 13 + i * 10, 23, 'dba-pode')
          n.addEventListener('click', e => {
            e.stopPropagation()
            if (fim) return
            if (v === 3) { n.classList.remove('dba-treme'); void n.offsetWidth; n.classList.add('dba-treme'); msg.textContent = '3 não alcança o 6'; msg.classList.add('nao'); return }
            fim = true; msg.classList.remove('nao')
            n.style.cssText += `--dx2:${24 - (13 + i * 10) + 4}cqh;--dy2:-18cqh`; n.classList.add('dba-jogou')
            cena.classList.add('fim', v === 6 ? 'cravou' : 'subiu')
            msg.textContent = v === 6 ? 'Cravou: 6 virou 12!' : 'Subiu para 9!'
            sub(v === 6 ? 'Isso! Igual à lousa dobra. Agora é só jogar.' : 'Boa! E se fosse o 6? Ele empata com a lousa e dobra para 12.')
            const b = el('button', { type: 'button', className: 'dba-denovo', textContent: 'De novo' })
            b.addEventListener('click', e2 => { e2.stopPropagation(); denovo() })
            cena.append(A(b, 4, 4, ''))
          })
          return n
        })
        return [c(6, 24, 4), lo, ...mao, msg, x2, fx]
      },
    },
  ]
}
