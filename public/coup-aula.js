// Aula do Coup: as regras em oito cenas curtas, do mais simples (duas cartas, duas vidas) ao que confunde
// (blefe, duvidar e bloquear). A última cena é para decidir: Bia ameaça assassinar você, e cada escolha tem consequência.
// Peças com classes de batida (ver aula.css): eN entra, sN sai, vN/wN move, fN vira, mN morre, dN destaca, pN carimba.

export function passosCoup({ el, carta, IMG, PERS, voce, inq }) {
  const troca = inq ? 'inquisidor' : 'embaixador'
  const A = (n, x, y, cls = '', css = '') => { n.classList.add('au-a', ...cls.split(' ').filter(Boolean)); n.style.cssText += `left:${x}cqh;top:${y}cqh;${css}`; return n }
  // carta: aberta = você vê a frente desde o começo
  const k = (c, x, y, cls = '', w = 7, aberta = false, css = '') => A(carta(c, { aberta }), x, y, `cpa-carta ${cls}`, `width:${w}cqh;${css}`)
  const moeda = (x, y, cls = '', css = '', ouro = true) => A(el('img', { src: IMG(ouro ? 'moeda-ouro' : 'moeda-prata'), alt: '', draggable: false, className: 'cpa-moeda' }), x, y, cls, css)
  const fala = (txt, x, y, cls = '', css = '') => { const n = A(el('div', { className: 'au-fala' }), x, y, cls, css); n.append(...[txt].flat()); return n }
  const selo = (txt, x, y, cls = '', cor = '#9e1f2c') => A(el('span', { className: 'au-selo', textContent: txt }), x, y, cls, `color:${cor}`)
  const rot = (txt, x, y, cls = '', css = '') => { const n = A(el('span', { className: 'au-rotulo' }), x, y, cls, css); n.append(...[txt].flat()); return n }
  const gente = (nome, cor, x, y, cls = '') => A(el('div', { className: 'cpa-gente', style: `--cor:${cor}` }, el('span', { className: 'cpa-gente__rosto', textContent: nome[0] }), el('small', { textContent: nome })), x, y, cls)
  const eu = (x, y, cls = '') => A(el('div', { className: 'cpa-gente cpa-gente--eu' }, el('span', { className: 'cpa-gente__rosto' }, voce()), el('small', { textContent: 'Você' })), x, y, cls)
  const tesouro = (x, y) => A(el('div', { className: 'cpa-tesouro' }, ...[[0, 0], [1.6, .4], [.8, 1.4], [2.6, 1.6], [-.6, 1.8], [1.8, 2.8]].map(([a, b], i) => el('img', { src: IMG(i % 3 ? 'moeda-ouro' : 'moeda-prata'), alt: '', style: `left:${a * 1.4}cqh;bottom:${b * 1.1}cqh` })), el('small', { textContent: 'tesouro' })), x, y)
  const corte = (x, y) => A(el('div', { className: 'cpa-corte' }, ...[0, 1, 2].map(i => el('img', { src: IMG('verso'), alt: '', style: `--i:${i}` })), el('small', { textContent: 'Corte' })), x, y)
  const punhal = (x, y, cls) => A(el('span', { className: 'cpa-punhal', innerHTML: '<svg viewBox="0 0 64 24"><path d="M2 12 40 7l20 5-20 5z" fill="#d9d4c7" stroke="#2a2018" stroke-width="1.6" stroke-linejoin="round"/><path d="M40 7v10" stroke="#2a2018" stroke-width="1.6"/><rect x="36" y="3" width="4" height="18" rx="1.6" fill="#c49a4c" stroke="#2a2018" stroke-width="1.4"/><rect x="40" y="9.5" width="16" height="5" rx="2" fill="#5a2a1a"/></svg>' }), x, y, cls)
  const escudo = (x, y, cls) => A(el('span', { className: 'cpa-escudo', innerHTML: '<svg viewBox="0 0 48 56"><path d="M24 3 44 10v16c0 13-9 22-20 27C13 48 4 39 4 26V10z" fill="#a3202f" stroke="#ecd29a" stroke-width="3" stroke-linejoin="round"/><path d="M24 14v26M14 24h20" stroke="#ecd29a" stroke-width="3.4" stroke-linecap="round"/></svg>' }), x, y, cls)
  const coroa = (x, y, cls) => A(el('span', { className: 'cpa-coroa', innerHTML: '<svg viewBox="0 0 48 32"><path d="M4 28 2 8l12 9L24 2l10 15 12-9-2 20z" fill="#c49a4c" stroke="#ecd29a" stroke-width="2" stroke-linejoin="round"/></svg>' }), x, y, cls)
  const olho = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
  const n = c => PERS[c].nome
  // moedas voando de (x0,y0) para (x1,y1) na batida b, uma atrás da outra
  const voam = (q, x0, y0, x1, y1, cls) => Array.from({ length: q }, (_, i) => moeda(x0 + i * .5, y0, cls, `--dx:${x1 - x0 - i * .5 + (i % 3) * .8}cqh;--dy:${y1 - y0 - (i % 2) * .6}cqh;--atraso:${i * .09}s`))

  return [
    {
      k: 'vidas', titulo: 'Duas cartas, duas vidas', batidas: [300, 1100, 2100, 3200, 4300, 5300], dur: 7600, sons: { 1: 'leque', 2: 'desliza1', 4: 'descarta', 5: 'descarta', 6: 'moedas' },
      sub: 'Cada um recebe 2 cartas viradas: são suas influências. Perdeu as duas, está fora. O último com carta vence.',
      cena: () => [
        k('duque', 27, 6, 'e1 f2 m4 s6', 10), k('condessa', 39, 6, 'e1 f2 m5 s6', 10, false, '--atraso:.12s'),
        rot([el('span', { className: 'cpa-olho', innerHTML: olho }), ' só você vê as suas'], 24, 23, 'e3 s4', 'width:28cqh'),
        selo('perdeu uma', 20, 26, 'p4 s6', '#9e1f2c'), selo('fora do jogo', 40, 26, 'p5 s6', '#9e1f2c'),
        coroa(33, 9, 'p6', ''), rot('O último com carta vence', 22, 20, 'e6', 'width:34cqh;font-size:3cqh'),
      ],
    },
    {
      k: 'acoes', titulo: 'Na sua vez, faça uma ação', batidas: [400, 1500, 2700, 3800, 4600, 5600], dur: 8200, sons: { 1: 'moeda', 2: 'moedas', 4: 'moedas', 5: 'golpe' },
      sub: 'Renda: +1 moeda. Ajuda: +2. Com 7 moedas, o Golpe derruba uma carta de alguém (e com 10, ele é obrigatório).',
      cena: () => [
        A(el('div', { className: 'cpa-acao' }, el('b', { textContent: 'Renda' }), el('small', { textContent: '+1' })), 3, 3, 'd1'),
        A(el('div', { className: 'cpa-acao' }, el('b', { textContent: 'Ajuda' }), el('small', { textContent: '+2' })), 3, 12, 'd2'),
        A(el('div', { className: 'cpa-acao cpa-acao--golpe' }, el('b', { textContent: 'Golpe' }), el('small', { textContent: 'paga 7' })), 3, 21, 'd4 d5'),
        tesouro(31, 4), eu(32, 25),
        ...voam(1, 33, 6, 41, 25, 'v1 s3'), ...voam(2, 33, 6, 41, 25, 'v2 s3'),
        A(el('b', { className: 'cpa-conta', textContent: '1' }), 42, 30, 'e1 s2'), A(el('b', { className: 'cpa-conta', textContent: '3' }), 42, 30, 'e2 s3'),
        rot('algumas rodadas depois…', 26, 19, 'e3 s4', 'width:24cqh;font-style:italic'),
        A(el('b', { className: 'cpa-conta', textContent: '7' }), 42, 30, 'e3 s4'), A(el('b', { className: 'cpa-conta', textContent: '0' }), 42, 30, 'e4'),
        ...Array.from({ length: 7 }, (_, i) => moeda(40 + (i % 4) * 1.2, 24 - Math.floor(i / 4) * 1.4, 'e3 v4 s5', `--dx:${-8 - (i % 4)}cqh;--dy:-18cqh;--atraso:${i * .05}s`)),
        gente('Ana', '#2f7ea3', 62, 3), k('capitao', 58, 13, 'f5 m5', 6), k(null, 65, 13, '', 6),
        A(el('i', { className: 'cpa-raio' }), 50, 14, 'e5 s6'), selo('golpe!', 43, 19, 'p5'),
        rot('10 moedas? Golpe obrigatório', 46, 31, 'e6', 'width:30cqh'),
      ],
    },
    {
      k: 'personagens', titulo: 'Cada personagem tem um poder', batidas: [300, 1500, 2700, 3900, 5100], dur: 8000, sons: { 1: 'poe1', 2: 'poe2', 3: 'poe1', 4: 'poe2', 5: 'poe1' },
      sub: `Duque, Assassino, Capitão, ${n(troca)} e Condessa. Cada um libera uma ação ou um bloqueio.`,
      cena: () => [['duque', 'pega 3 moedas'], ['assassino', 'paga 3 e derruba uma carta'], ['capitao', 'rouba 2 moedas de alguém'], [troca, inq ? 'olha uma carta de alguém' : 'troca cartas com a Corte'], ['condessa', 'bloqueia o Assassino']].flatMap(([c, poder], i) => [
        k(c, 4.5 + i * 14.8, 3, `e${i + 1} d${i + 1}`, 10.6, true),
        rot([el('b', { textContent: n(c) }), el('br'), poder], 2.6 + i * 14.8, 20.6, `e${i + 1}`, 'width:14.4cqh;font-size:1.8cqh'),
      ]),
    },
    {
      k: 'blefe', titulo: 'Você pode mentir', batidas: [400, 1300, 2200, 3200, 4300], dur: 7200, sons: { 2: 'papel', 3: 'carimbo', 4: 'moedas' },
      sub: 'Diga que é qualquer personagem, tendo a carta ou não. Ninguém vê as suas cartas, então ninguém sabe.',
      cena: () => [
        gente('Ana', '#2f7ea3', 4, 3), gente('Bia', '#2f8a5b', 64, 3),
        A(el('b', { className: 'cpa-duvida', textContent: '?' }), 10, 1, 'e3'), A(el('b', { className: 'cpa-duvida', textContent: '?' }), 70, 1, 'e3', '--atraso:.1s'),
        tesouro(33, 3),
        k('capitao', 29, 20, 'e1', 7, true), k('condessa', 37, 20, 'e1', 7, true, '--atraso:.08s'),
        rot([el('span', { className: 'cpa-olho', innerHTML: olho }), ' suas cartas'], 28, 31.6, 'e1', 'width:18cqh'),
        eu(48, 23, 'e1'),
        fala(['Sou o ', el('b', { textContent: 'Duque' }), '. Vou taxar.'], 29, 13, 'e2', '--origem:80% 100%;--rabo:20cqh'),
        k('duque', 60, 14, 'e2 cpa-fantasma', 6.4, true), selo('blefe!', 60, 26, 'p3', '#9e1f2c'),
        ...voam(3, 35, 5, 55, 23, 'v4'),
        rot('ninguém duvidou: +3 moedas', 2, 30, 'e5', 'width:24cqh'),
      ],
    },
    {
      k: 'pego', titulo: 'Duvidou? Mostra a carta', batidas: [400, 1400, 2300, 3100, 3900, 4800], dur: 7400, sons: { 2: 'carimbo', 4: 'desliza2', 5: 'carimbo', 6: 'descarta' },
      sub: 'Qualquer um pode duvidar. Se a pessoa não tinha a carta, ela perde uma influência e a ação não vale.',
      cena: () => [
        gente('Ana', '#2f7ea3', 6, 3), k('capitao', 5, 14, 'v3 f4 m6', 6.4, false, '--dx:25cqh;--dy:-6cqh'), k(null, 12, 14, '', 6.4),
        fala(['Sou o ', el('b', { textContent: 'Duque' }), '. Vou taxar.'], 14, 3, 'e1 s3'),
        gente('Bia', '#2f8a5b', 63, 3), fala('Duvido!', 52, 4, 'p2 s4 cpa-fala--grito', '--origem:90% 100%;--rabo:9cqh'),
        selo('mentira!', 40, 20, 'p5', '#9e1f2c'),
        rot('Ana perde uma carta', 25, 30, 'e6', 'width:26cqh;font-size:2.3cqh'),
      ],
    },
    {
      k: 'verdade', titulo: 'E se for verdade?', batidas: [400, 1400, 2300, 3100, 3900, 4800, 5700, 6400], dur: 8800, sons: { 2: 'carimbo', 4: 'desliza2', 5: 'carimbo', 6: 'descarta', 7: 'desliza1' },
      sub: 'Quem duvidou perde uma carta. E quem provou embaralha a carta mostrada na Corte e pega outra.',
      cena: () => [
        gente('Ana', '#2f7ea3', 6, 3), k('duque', 5, 14, 'v3 f4 w7 s8', 6.4, false, '--dx:25cqh;--dy:-6cqh;--dx2:28cqh;--dy2:11cqh'), k(null, 12, 14, '', 6.4),
        k(null, 33, 25, 'e8 v8', 6.4, false, '--dx:-28cqh;--dy:-11cqh'),
        fala(['Sou o ', el('b', { textContent: 'Duque' }), '. Vou taxar.'], 14, 3, 'e1 s3'),
        gente('Bia', '#2f8a5b', 63, 3), k('assassino', 60, 14, 'f6 m6 t6', 6.4), k(null, 67, 14, '', 6.4),
        fala('Duvido!', 52, 4, 'p2 s4 cpa-fala--grito', '--origem:90% 100%;--rabo:9cqh'),
        selo('verdade!', 40, 20, 'p5 s7', '#1f6e44'),
        rot('Bia perde uma carta', 52, 30, 'e6', 'width:24cqh;font-size:2.3cqh'),
        corte(32, 24), rot('nova carta para Ana', 2, 30, 'e8', 'width:22cqh'),
      ],
    },
    {
      k: 'bloqueio', titulo: 'Bloqueie com o personagem certo', batidas: [400, 1300, 2000, 2800, 3500, 4600], dur: 8000, sons: { 1: 'papel', 2: 'moedas', 3: 'punhal', 4: 'carimbo', 5: 'golpe' },
      sub: `Ajuda: bloqueada pelo Duque. Assassinato: pela Condessa. Roubo: pelo Capitão ou ${n(troca)}. Um bloqueio também pode ser duvidado.`,
      cena: () => [
        gente('Bia', '#2f8a5b', 63, 3), fala(['Sou o ', el('b', { textContent: 'Assassino' }), '. Vou te assassinar.'], 22, 4, 'e1 s4', '--origem:90% 100%;--rabo:34cqh'),
        ...voam(3, 66, 12, 56, -4, 'v2 s3'), rot('paga 3', 56, 13, 'e2 s3', 'width:8cqh'),
        punhal(56, 14, 'e3 v3 w5 s6', '--dx:-28cqh;--dy:8cqh;--dx2:-10cqh;--dy2:-4cqh'),
        eu(8, 25), k('capitao', 15, 22, '', 6.4, true), k('condessa', 22, 22, 'v4', 6.4, true, '--dx:0cqh;--dy:-6cqh'),
        fala(['Sou a ', el('b', { textContent: 'Condessa' }), '. Bloqueio!'], 4, 9, 'e4', '--origem:20% 100%'),
        escudo(29, 14, 'p4'),
        A(el('div', { className: 'cpa-tabela' },
          ...[['Ajuda', 'duque'], ['Assassinar', 'condessa'], ['Roubar', 'capitao']].map(([a, c]) => el('span', {}, el('b', { textContent: a }), el('i', { textContent: '←' }), el('img', { src: IMG(c), alt: '' }), c === 'capitao' ? el('img', { src: IMG(troca), alt: '' }) : ''))), 49, 17, 'e6'),
      ],
    },
    {
      k: 'treino', titulo: 'Sua vez de decidir', batidas: [300], dur: 0, sons: {},
      sub: 'Bia diz ser o Assassino e vai te atacar. Você tem Capitão e Condessa. O que você faz?',
      cena: ({ sub, denovo, cena }) => {
        const minha1 = k('capitao', 26, 21, '', 7, true), minha2 = k('condessa', 34, 21, '', 7, true)
        const dela = k('assassino', 60, 14, '', 6.4)
        const pun = punhal(56, 12, 'e1')
        const esc = escudo(43, 14, '')
        const msg = rot('', 3, 4, 'cpa-msg', 'width:52cqh;font-size:2.8cqh;text-align:left')
        const opcoes = A(el('div', { className: 'cpa-opcoes' }), 2, 12, 'e1')
        let fim = false
        const fecha = (txt, cls) => {
          fim = true; cena.classList.add('fim', cls); msg.textContent = txt
          const b = el('button', { type: 'button', className: 'cpa-denovo', textContent: 'Tentar de novo' })
          b.addEventListener('click', e => { e.stopPropagation(); denovo() })
          opcoes.replaceChildren(b)
        }
        const op = (txt, dica, fn) => { const b = el('button', { type: 'button', className: 'cpa-opcao' }, el('b', { textContent: txt }), el('small', { textContent: dica })); b.addEventListener('click', e => { e.stopPropagation(); if (!fim) fn() }); return b }
        opcoes.append(
          op('Aceitar', 'perco uma carta', () => {
            minha1.classList.add('cpa-morre'); pun.classList.add('cpa-crava')
            fecha('Funciona, mas custou uma carta. E você tinha a Condessa!', 'aceitou')
            sub('Dica: quando você tem a carta certa, bloquear não tem risco.')
          }),
          op('Bloquear', 'sou a Condessa', () => {
            minha2.classList.add('cpa-sobe'); esc.classList.add('cpa-bate'); pun.classList.add('cpa-quica')
            fecha('Perfeito! Bia pagou 3 moedas à toa.', 'bloqueou')
            sub('Ela até podia duvidar do bloqueio, mas você tem a Condessa de verdade: quem perderia seria ela.')
          }),
          op('Duvidar', 'não acredito', () => {
            dela.classList.add('cpa-mostra'); setTimeout(() => { minha1.classList.add('cpa-morre'); minha2.classList.add('cpa-morre'); pun.classList.add('cpa-crava') }, 900)
            fecha('Ai! Ela tinha o Assassino.', 'duvidou')
            sub('Uma carta por duvidar errado e outra pelo ataque: duvidar de um assassinato pode te tirar do jogo de uma vez.')
          }))
        return [gente('Bia', '#2f8a5b', 64, 2), dela, k(null, 67, 14, '', 6.4), fala(['Sou o ', el('b', { textContent: 'Assassino' }), '. Vou te assassinar.'], 22, 3, 'e1', '--origem:90% 100%;--rabo:34cqh'),
          eu(44, 25), minha1, minha2, pun, esc, msg, opcoes]
      },
    },
  ]
}
