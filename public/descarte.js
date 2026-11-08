// Uno: jogo de cartas de descarte (combine cor ou número). Mesma estrutura do Coup:
// o host guarda o baralho e as mãos e manda para cada pessoa só o que ela pode ver, pela action 'jogo' ({ dc: ... }).
// Dá para jogar várias cartas iguais de uma vez (a última escolhida fica por cima).
// Regras opcionais: acumular +2/+4, comprar até poder jogar, penalidade por não avisar a última
// e o 7 do silêncio (depois de um 7, quem falar na call antes da próxima carta compra 2).

import { arteMinimalista } from './jogos/uno/minimalista.js'
import { arteClassica } from './jogos/uno/classico.js'
import { criaMesa } from './cartas-mesa.js'
import { criaBoteco, SKINS_BAR, qualidadeMesa, escolheQualidadeMesa } from './boteco3d.js'

const SOM = n => `jogos/coup/sons/${n}.mp3`
const CORES = { r: 'vermelho', y: 'amarelo', g: 'verde', b: 'azul' }
const OPCOES = [
  ['acumula', 'Acumular +2/+4', 'Quem recebe +2 pode devolver com +2 ou +4 e passar a soma adiante.'],
  ['ate3', 'Comprar até 3', 'Compra uma por vez, até 3. Sem jogada depois da 3ª, passa a vez. Desligado: compra só 1.'],
  ['penalidade', 'Avisar Uno', 'Quem fica com 1 carta e não aperta “Uno!” pode ser pego e compra 2.'],
  ['sete', '7 do silêncio', 'Depois de um 7, quem falar na call antes da próxima carta compra 2. Microfone mutado não conta. Com a troca do 7, o silêncio vale depois da troca.'],
  ['seteTroca', '7 troca de mão', 'Quem joga um 7 troca de mão com alguém que escolher.'],
  ['zero', '0 gira as mãos', 'Quando sai um 0, cada um passa a mão para o próximo, no sentido do jogo.'],
  ['trocaLivre', 'Troca opcional', 'No 7 e no 0, quem jogou escolhe se troca (ou gira) as mãos ou deixa tudo como está.'],
  ['semAcao', 'Não bate com ação', 'A última carta precisa ser um número: não dá para bater com Pular, Inverter, compra ou coringa.'],
  ['corte', 'Corte', 'Quem tem a carta idêntica à da mesa (mesma cor e mesmo número) pode jogar fora da vez e toma a vez.'],
  ['bate', '9 bate no monte', 'Quando sai um 9, todo mundo bate no monte (clique ou Espaço). O mais lento compra 2; quem não bater, também. Bater sem 9 compra 1.'],
  ['semPiedade', 'Sem Piedade', 'Entram Pula Todos, Descarta a Cor, Inverte +4, Roleta, +6 e +10; qualquer carta de compra empilha sobre outra. Sem limite de cartas.'],
]
const DESLIGADAS = ['seteTroca', 'zero', 'corte', 'semPiedade'] // regras da casa começam desligadas
// estilos prontos no lobby: cada um liga um conjunto de regras (o resto fica desligado)
const ESTILOS = [
  ['classico', 'Clássico', 'As regras da caixa, sem invenção.', [], [{ c: 'r', v: '7' }, { c: 'b', v: 'inverte' }, { c: null, v: '+4' }]],
  ['casa', 'Da casa', 'O jeito do grupo: acumula, avisa e bate no 9.', ['acumula', 'ate3', 'penalidade', 'sete', 'trocaLivre', 'semAcao', 'bate'], [{ c: 'y', v: '9' }, { c: 'g', v: '+2' }, { c: 'r', v: '7' }]],
  ['caos', 'Caos', 'Troca de mão, giro, corte e tudo da casa.', ['acumula', 'ate3', 'penalidade', 'sete', 'seteTroca', 'zero', 'trocaLivre', 'corte', 'bate'], [{ c: 'b', v: '0' }, { c: 'r', v: '7' }, { c: 'g', v: '9' }]],
  ['piedade', 'Sem Piedade', 'Cartas novas, +6, +10 e Roleta. Sem limite.', ['semPiedade', 'acumula', 'ate3', 'penalidade', 'seteTroca', 'zero', 'trocaLivre', 'semAcao'], [{ c: null, v: '+10' }, { c: null, v: 'roleta' }, { c: 'g', v: 'pulaT' }]],
]
// cada regra no lobby: grupo, texto curto e as cartinhas que ilustram
const REGRAS = {
  acumula: ['Compras', 'Devolva +2 com +2 ou +4: a soma passa adiante.', [{ c: 'g', v: '+2' }, { c: null, v: '+4' }]],
  ate3: ['Compras', 'Compre até 3 tentando jogar. Desligada: só 1.', [null, null, null]],
  penalidade: ['Voz', 'Com 1 carta, avise. Se pegarem você antes, +2.', [{ c: 'y', v: '5' }], 'Uno!'],
  sete: ['Voz', 'Depois de um 7, quem falar na call compra 2.', [{ c: 'b', v: '7' }], 'shh'],
  seteTroca: ['Trocas', 'Quem joga um 7 troca de mão com alguém.', [{ c: 'r', v: '7' }, null], 'troca'],
  zero: ['Trocas', 'Saiu um 0: as mãos giram no sentido do jogo.', [{ c: 'y', v: '0' }], 'gira'],
  trocaLivre: ['Trocas', 'No 7 e no 0, trocar ou girar é escolha de quem jogou.', [{ c: 'g', v: '7' }, { c: 'b', v: '0' }]],
  corte: ['Reflexo', 'A carta idêntica à da mesa entra fora da vez.', [{ c: 'r', v: '5' }, { c: 'r', v: '5' }]],
  bate: ['Reflexo', 'Saiu um 9: bata no monte. O mais lento compra 2.', [{ c: 'g', v: '9' }], 'mao'],
  semAcao: ['Final', 'A última carta precisa ser um número.', [{ c: 'b', v: 'pula' }], 'nao'],
  semPiedade: ['Baralho', 'Entram +6, +10, Roleta, Pula Todos e mais.', [{ c: null, v: '+6' }, { c: null, v: 'roleta' }, { c: null, v: '+10' }]],
}
const ORDEM_REGRAS = ['acumula', 'ate3', 'penalidade', 'sete', 'seteTroca', 'zero', 'trocaLivre', 'corte', 'bate', 'semAcao', 'semPiedade']
const TEMPOS = [0, 15, 20, 30] // tempo por vez (0 = sem limite)
const SONS = ['golpe', 'pular', 'inverter', 'embaralhar', 'desliza1', 'desliza2', 'desliza3', 'poe1', 'poe2', 'leque', 'carimbo', 'papel', 'vez', 'clique', 'tique']
const VOL = { golpe: .5, pular: .7, inverter: .7, desliza1: .9, desliza2: .9, desliza3: .9, leque: .7, embaralhar: .5, carimbo: .7, papel: .45, vez: .5, clique: .3, tique: .28 }
const GRACA_7 = 1400 // depois do 7, um respiro antes de valer o silêncio
const SAIU_MS = 12000 // jogador sem conexão por esse tempo sai do jogo
const HOST_MS = 10000 // quem abriu a mesa caiu: o sucessor assume depois disso
const BATE_MS = 4000 // a batida do 9 fica aberta por esse tempo
const BATE_LIM = 3000 // quem demora mais que isso (ou não bate) compra
const BATE_PEN_MS = 9000 // bater sem 9: no máximo uma penalidade por pessoa nesse intervalo
const SILENCIO_AMOSTRAS = 3 // 7 do silêncio: fala contínua (3 amostras de 150 ms seguidas)
const VALOR = { '+2': 2, '+4': 4, '+6': 6, '+10': 10, inv4: 4 } // cartas de compra
const ehCompra = v => v in VALOR
const COMPRA_COR = v => v === '+4' || v === '+6' || v === '+10' || v === 'inv4'
const ehNumero = v => /^\d$/.test(v)
const emJogo = f => f === 'jogo' || f === 'troca7' || f === 'gira0' // fases com a partida rolando
const ADMIN = 'kellyson' // modo admin (logado no painel Admin): escolhe as próximas cartas que vai comprar
// cartas que o admin pode pôr na fila (as do Sem Piedade só aparecem com ele ligado)
const FILA_BASE = ['+4', '+2', 'cor', 'pula', 'inverte']
const FILA_SP = ['+10', '+6', 'inv4', 'roleta', 'pulaT', 'desc']
const FILA_OK = new Set([...FILA_BASE, ...FILA_SP, ...'0123456789'])
const NOMES = { pula: 'Pular', inverte: 'Inverter', pulaT: 'Pula Todos', desc: 'Descarta a Cor', inv4: 'Inverte +4', roleta: 'Roleta', cor: 'Coringa' }

const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n }
const embaralha = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]] } return a }
const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch {} } }
const nomeCarta = c => c.c ? `${NOMES[c.v] || c.v} ${CORES[c.c]}` : NOMES[c.v] || `${c.v} coringa`
// cartas do Sem Piedade, para o guia
const GUIA = [
  [{ c: 'g', v: 'pulaT' }, 'Pula Todos', 'Pula todo mundo: quem jogou joga de novo.'],
  [{ c: 'b', v: 'desc' }, 'Descarta a Cor', 'Junto com ela saem da sua mão todas as cartas da mesma cor.'],
  [{ c: null, v: 'inv4' }, 'Inverte +4', 'Coringa: inverte o sentido e o próximo (no sentido novo) compra 4. Empilha com outras compras.'],
  [{ c: null, v: 'roleta' }, 'Roleta', 'Coringa: escolha uma cor. O próximo vira cartas do monte até sair essa cor, fica com todas e perde a vez.'],
  [{ c: 'r', v: '+2' }, '+2 que empilha', 'No Sem Piedade qualquer carta de compra vai em cima de outra, e a soma passa adiante.'],
  [{ c: null, v: '+6' }, '+6', 'Coringa: o próximo compra 6 (ou devolve com outra compra).'],
  [{ c: null, v: '+10' }, '+10', 'Coringa: o próximo compra 10 (ou devolve com outra compra).'],
]

function baralho(sp) {
  const d = []; let id = 0
  for (const c of 'rygb') {
    d.push({ id: id++, c, v: '0' })
    for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'pula', 'inverte', '+2']) for (let k = 0; k < 2; k++) d.push({ id: id++, c, v })
  }
  for (let k = 0; k < 4; k++) { d.push({ id: id++, c: null, v: 'cor' }); d.push({ id: id++, c: null, v: '+4' }) }
  if (sp) {
    for (const c of 'rygb') { d.push({ id: id++, c, v: 'pulaT' }); for (let k = 0; k < 2; k++) d.push({ id: id++, c, v: 'desc' }) }
    for (let k = 0; k < 4; k++) { d.push({ id: id++, c: null, v: '+6' }); d.push({ id: id++, c: null, v: 'inv4' }); d.push({ id: id++, c: null, v: 'roleta' }) }
    for (let k = 0; k < 2; k++) d.push({ id: id++, c: null, v: '+10' })
  }
  return embaralha(d)
}

// símbolos de linha fina (desenho próprio)
const SVG = {
  pula: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><circle cx="24" cy="24" r="15"/><path d="M13.5 34.5 34.5 13.5"/></svg>',
  inverte: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20a12 12 0 0 1 21-6l3 3"/><path d="M36 9v8h-8"/><path d="M36 28a12 12 0 0 1-21 6l-3-3"/><path d="M12 39v-8h8"/></svg>',
  pulaT: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 5h14l12 12v14L31 43H17L5 31V17z"/><path d="M16.5 16.5l15 15M31.5 16.5l-15 15"/></svg>',
  mao: '<svg viewBox="0 0 100 112" stroke-linejoin="round"><defs><g id="dc-mao-f"><rect x="21" y="26" width="13" height="46" rx="6.5"/><rect x="36" y="8" width="13" height="64" rx="6.5"/><rect x="51" y="14" width="13" height="58" rx="6.5"/><rect x="66" y="30" width="12" height="44" rx="6"/><rect x="8" y="56" width="13" height="40" rx="6.5" transform="rotate(-28 14.5 76)"/><path d="M20 62h58v22c0 15-11 26-29 26S20 100 20 84z"/></g></defs><use href="#dc-mao-f" fill="#f0c49a" stroke="#2a1d14" stroke-width="7"/><use href="#dc-mao-f" fill="#f0c49a"/><path d="M35 40v26M50 28v38M65 36v30" stroke="#d9a574" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  cor: '<svg viewBox="0 0 48 48" fill="none" stroke-width="4" stroke-linecap="round"><path d="M24 9a15 15 0 0 1 15 15" stroke="#3a8ee6"/><path d="M39 24a15 15 0 0 1-15 15" stroke="#3dbb6a"/><path d="M24 39A15 15 0 0 1 9 24" stroke="#f5c443"/><path d="M9 24A15 15 0 0 1 24 9" stroke="#e5484d"/></svg>',
  seta: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M40 24a16 16 0 1 1-5-11.6"/><path d="M36 5v8h-8"/></svg>',
  desc: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="15" width="17" height="24" rx="3" transform="rotate(-14 17 27)"/><rect x="17" y="11" width="17" height="24" rx="3"/><path d="M30 26h11M36 20l6 6-6 6"/></svg>',
  roleta: '<svg viewBox="0 0 48 48" fill="none" stroke-linecap="round"><path d="M24 10a14 14 0 0 1 14 14H24z" fill="#e5484d"/><path d="M38 24a14 14 0 0 1-14 14V24z" fill="#3a8ee6"/><path d="M24 38a14 14 0 0 1-14-14h14z" fill="#3dbb6a"/><path d="M10 24a14 14 0 0 1 14-14v14z" fill="#f5c443"/><circle cx="24" cy="24" r="14" stroke="#fff" stroke-width="2.4"/><circle cx="24" cy="24" r="3.4" fill="#fff"/><path d="M24 2.5l4 6.5h-8z" fill="#fff"/></svg>',
  shh: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M24 8v20"/><circle cx="24" cy="36" r="2.2" fill="currentColor"/></svg>',
}

// roda de escolha de cor do coringa
const RODA_SVG = '<svg viewBox="-90 -90 180 180"><g class="dc-cores__fatia" data-cor="r" tabindex="0" role="button" aria-label="vermelho" style="--hx:0.0px;--hy:-5.0px;--k:0;color:var(--r)"><title>vermelho</title><path d="M-52.2 -58.0A78 78 0 0 1 52.2 -58.0L25.5 -30.8A40 40 0 0 0 -25.5 -30.8Z" fill="currentColor"/><text x="0.0" y="-56.4" fill="#fff">vermelho</text></g><g class="dc-cores__fatia" data-cor="y" tabindex="0" role="button" aria-label="amarelo" style="--hx:5.0px;--hy:0.0px;--k:1;color:var(--y)"><title>amarelo</title><path d="M58.0 -52.2A78 78 0 0 1 58.0 52.2L30.8 25.5A40 40 0 0 0 30.8 -25.5Z" fill="currentColor"/><text x="59.0" y="2.6" fill="#3b3009">amarelo</text></g><g class="dc-cores__fatia" data-cor="g" tabindex="0" role="button" aria-label="verde" style="--hx:0.0px;--hy:5.0px;--k:2;color:var(--g)"><title>verde</title><path d="M52.2 58.0A78 78 0 0 1 -52.2 58.0L-25.5 30.8A40 40 0 0 0 25.5 30.8Z" fill="currentColor"/><text x="0.0" y="61.6" fill="#fff">verde</text></g><g class="dc-cores__fatia" data-cor="b" tabindex="0" role="button" aria-label="azul" style="--hx:-5.0px;--hy:0.0px;--k:3;color:var(--b)"><title>azul</title><path d="M-58.0 52.2A78 78 0 0 1 -58.0 -52.2L-30.8 -25.5A40 40 0 0 0 -30.8 25.5Z" fill="currentColor"/><text x="-59.0" y="2.6" fill="#fff">azul</text></g></svg>'
// anel do sentido: duas setas curvas opostas
const ANEL_SVG = '<svg viewBox="-62 -62 124 124" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><g stroke-width="6"><path d="M-32.8 -39.1A51 51 0 0 1 45 -23.9"/><path d="M32.8 39.1A51 51 0 0 1 -45 23.9"/></g><g fill="currentColor" stroke-width="2.5"><path d="M49.5 -12.3 52 -30 36.4 -21Z"/><path d="M-49.5 12.3 -52 30 -36.4 21Z"/></g></svg>'

// ícone do botão de ordenar: três cartinhas (por cor: agrupadas por cor; por número: 1 2 3)
const ICONE_COR = '<svg viewBox="0 0 32 24"><rect x="2" y="4" width="11" height="16" rx="2" fill="#e5484d" transform="rotate(-10 7 12)"/><rect x="10.5" y="3" width="11" height="16" rx="2" fill="#e5484d" opacity=".75"/><rect x="19" y="4" width="11" height="16" rx="2" fill="#3a8ee6" transform="rotate(10 25 12)"/></svg>'
const ICONE_NUM = '<svg viewBox="0 0 32 24" font-family="Bricolage Grotesque, Inter, sans-serif" font-weight="800" font-size="8" text-anchor="middle"><g transform="rotate(-10 7 12)"><rect x="2" y="4" width="11" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><text x="7.5" y="15" fill="currentColor">1</text></g><rect x="10.5" y="3" width="11" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><text x="16" y="14" fill="currentColor">2</text><g transform="rotate(10 25 12)"><rect x="19" y="4" width="11" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><text x="24.5" y="15" fill="currentColor">3</text></g></svg>'

export function criaDescarte(ctx) {
  const { icon, toast, sysMsg, me } = ctx
  const tela = ctx.tela
  const el = (tag, props = {}, ...kids) => {
    const dados = {}, resto = {}
    for (const [k, v] of Object.entries(props)) (k.startsWith('data-') || k.startsWith('aria-') ? dados : resto)[k] = v
    const n = ctx.el(tag, resto, ...kids.flat())
    for (const [k, v] of Object.entries(dados)) n.setAttribute(k, v)
    return n
  }

  /* =================================================================== host */
  let G = null, restaurou = false, timer = 0
  const ausDesde = new Map()
  const jog = k => G?.js.find(j => j.key === k)
  const topo = () => G.descarte[G.descarte.length - 1]
  const log = t => { G.log.push(t); if (G.log.length > 80) G.log.splice(0, G.log.length - 80) }
  const ev = e => { G.ev.push({ ...e, n: ++G.evN }); if (G.ev.length > 40) G.ev.splice(0, G.ev.length - 40) }
  const idx = k => G.js.findIndex(j => j.key === k)
  const depois = (i, passos) => ((i + passos * G.dir) % G.js.length + G.js.length) % G.js.length

  function abrir(chamados) {
    const op = ls.get('dc.op') || {}
    const pl = ls.get('dc.placar')
    G = { id: Math.random().toString(36).slice(2, 9), host: me.key, hostNome: me.name, fase: 'convite',
      op: { ...Object.fromEntries(OPCOES.map(([k]) => [k, DESLIGADAS.includes(k) ? op[k] === true : op[k] !== false])), tempo: TEMPOS.includes(op.tempo) ? op.tempo : 0 },
      conv: Object.fromEntries(ctx.presentes().map(k => [k, k === me.key || chamados?.includes(k) ? 'sim' : '?'])),
      js: [], monte: [], descarte: [], cor: null, dir: 1, vez: 0, pend: 0, pendTipo: null, compradas: 0, sil: null, bate: null, bateK: 0,
      placar: pl && pl.p && Date.now() - pl.t < 12 * 3600e3 ? pl.p : {}, log: [], ev: [], evN: 0, seq: 0, t: Date.now() }
    sysMsg(`${me.name} abriu uma mesa de Uno`)
    difunde()
  }
  function comecar() {
    if (G?.fase !== 'convite') return
    const pres = new Set(ctx.presentes())
    const ks = Object.keys(G.conv).filter(k => G.conv[k] === 'sim' && pres.has(k))
    if (ks.length < 2) return toast('Precisa de pelo menos 2 jogadores.')
    if (ks.length > 10) return toast('No máximo 10 jogadores.')
    ls.set('dc.op', G.op)
    embaralha(ks)
    G.monte = baralho(G.op.semPiedade)
    G.js = ks.map(k => ({ key: k, nome: ctx.nomeDe(k), mao: Array.from({ length: 7 }, () => tira(k)), avisou: false, pegavel: false }))
    // primeira carta: um número (coringas e ações voltam para o meio do monte)
    let i = G.monte.findLastIndex(c => /^\d$/.test(c.v))
    G.descarte = [G.monte.splice(i, 1)[0]]
    G.cor = topo().c; G.dir = 1; G.pend = 0; G.pendTipo = null; G.compradas = 0; G.sil = null; G.bate = null
    const ult = ls.get('dc.vencedor')
    G.vez = ks.includes(ult) ? ks.indexOf(ult) : rnd(ks.length)
    G.fase = 'jogo'; G.log = []; G.vencedor = null; G.turno = 0; G.estourou = []
    log(`Partida começou. ${G.js[G.vez].nome} começa.`)
    ev({ t: 'inicio' })
    sysMsg(`Uno começou: ${G.js.map(j => j.nome).join(', ')}`)
    armaTempo(3000)
    difunde()
  }
  function repoe() {
    if (G.monte.length) return
    const t = G.descarte.pop()
    G.monte = embaralha(G.descarte.map(({ esc, ...c }) => c)); G.descarte = [t]
    if (G.monte.length) ev({ t: 'embaralha' })
  }
  // tira uma carta do monte; o admin pode ter escolhido as próximas (vem a primeira da fila que ainda estiver no monte)
  function tira(key) {
    const fila = G.fila?.[key]
    while (fila?.length) {
      const v = fila.shift()
      const ok = G.monte.flatMap((c, i) => c.v === v ? [i] : [])
      if (ok.length) return G.monte.splice(ok[rnd(ok.length)], 1)[0]
    }
    return G.monte.pop()
  }
  function compra(j, n, semAviso) {
    const novas = []
    for (let k = 0; k < n; k++) { repoe(); const c = tira(j.key); if (!c) break; j.mao.push(c); novas.push(c) }
    j.avisou = false; j.pegavel = false
    if (novas.length && !semAviso) ev({ t: 'compra', key: j.key, qtd: novas.length })
    return novas
  }
  const serve = (c, j) => {
    if (G.pend > 0) return G.op.semPiedade ? ehCompra(c.v) : G.op.acumula && (c.v === '+2' || c.v === '+4') // +2 vale em cima de +4, de qualquer cor
    if (!c.c) return true
    return c.c === G.cor || c.v === topo().v
  }
  function avanca(passos) {
    G.vez = depois(G.vez, passos)
    G.compradas = 0
    armaTempo()
    difunde()
  }
  // tempo por vez: se acabar, compra (o acumulado, ou 1) e passa; na troca do 7, escolhe alguém
  function armaTempo(extra = 0) {
    clearTimeout(timer)
    G.turno = (G.turno || 0) + 1
    G.prazo = G.op.tempo && G.fase !== 'fim' ? Date.now() + G.op.tempo * 1000 + extra : 0
    if (!G.prazo) return
    const t = G.turno
    timer = setTimeout(() => { if (G && G.turno === t && G.fase !== 'fim') tempoAcabou() }, G.prazo - Date.now() + 60)
  }
  function tempoAcabou() {
    const j = G.js[G.vez]
    ev({ t: 'tempo', key: j.key })
    log(`O tempo de ${j.nome} acabou.`)
    // 7/0: com a troca opcional, o tempo esgotado deixa tudo como está; sem ela, troca com alguém ao acaso
    if (G.fase === 'troca7' || G.fase === 'gira0') { const outros = G.js.filter(x => x !== j); return decide(j.key, G.op.trocaLivre ? {} : { alvo: outros[rnd(outros.length)].key, gira: true }) }
    if (G.pend > 0) return comprar(j.key)
    if (!G.compradas) compra(j, 1)
    avanca(1)
  }
  function jogar(key, { cartas, cor }) {
    const i = idx(key), j = G.js[i]
    if (G.fase !== 'jogo' || !j || !Array.isArray(cartas) || !cartas.length) return
    const ids = [...new Set(cartas.map(Number))]
    const cs = ids.map(id => j.mao.find(c => c.id === id))
    if (cs.some(c => !c)) return
    // corte: fora da vez, só com a carta idêntica à da mesa
    let corte = false
    if (i !== G.vez) {
      const t = topo()
      if (!G.op.corte || G.pend > 0 || !t.c || cs.some(c => c.c !== t.c || c.v !== t.v)) return
      corte = true; G.vez = i; G.compradas = 0
    }
    if (cs.some(c => !c) || !serve(cs[0], j) || cs.some(c => c.v !== cs[0].v)) return
    const ult = cs[cs.length - 1]
    if (!ult.c && !CORES[cor]) return
    // Descarta a Cor: saem junto todas as cartas da cor da última
    const extras = ult.v === 'desc' ? j.mao.filter(c => !ids.includes(c.id) && c.c === ult.c) : []
    const resta = j.mao.filter(c => !ids.includes(c.id) && !extras.includes(c))
    if (!resta.length && G.op.semAcao && !ehNumero(ult.v)) return // não bate com carta de ação
    j.mao = resta
    G.descarte.push(...extras, ...cs.map(c => c.c ? c : { ...c, esc: ult.c || cor }))
    if (G.descarte.length > 60) G.monte.unshift(...G.descarte.splice(0, G.descarte.length - 60))
    G.cor = ult.c || cor
    for (const o of G.js) if (o !== j) o.pegavel = false
    if (j.mao.length === 1) { j.pegavel = G.op.penalidade && !j.avisou; j.avisou = j.avisou || !G.op.penalidade }
    else j.avisou = false
    // com a troca do 7 ligada, o silêncio só começa depois da troca
    const troca7 = ult.v === '7' && G.op.seteTroca && G.js.length > 1
    G.sil = G.op.sete && ult.v === '7' && !troca7 ? novoSil() : null
    if (corte) { ev({ t: 'corte', key }); log(`${j.nome} cortou!`) }
    ev({ t: 'joga', key, cartas: [...extras, ...cs], cor: G.cor })
    log(`${j.nome} jogou ${cs.length > 1 ? `${cs.length} cartas (${cs.map(nomeCarta).join(', ')})` : nomeCarta(ult)}${ult.c ? '' : ` e escolheu ${CORES[G.cor]}`}.`)
    if (extras.length) { ev({ t: 'descCor', key, qtd: extras.length, cor: ult.c }); log(`${j.nome} descartou mais ${extras.length} ${CORES[ult.c]}.`) }
    if (!j.mao.length) return fim(key)
    const k = cs.length, v = ult.v
    if (v === '0' && G.op.zero && G.js.length > 1) {
      if (G.op.trocaLivre) { G.fase = 'gira0'; armaTempo(); return difunde() }
      giraMaos()
    }
    if (troca7) { G.fase = 'troca7'; armaTempo(); return difunde() }
    if (v === 'pula' || (v === 'inverte' && G.js.length === 2)) {
      for (let s = 1; s <= k; s++) ev({ t: 'pula', key: G.js[depois(i, s)].key })
      return avanca(1 + k)
    }
    if (v === '9' && G.op.bate) abreBate()
    if (v === 'pulaT') { ev({ t: 'pulaT', key }); log(`${j.nome} pulou todo mundo e joga de novo.`); return avanca(0) }
    if (v === 'inverte') { if (k % 2) G.dir *= -1; ev({ t: 'inverte', dir: G.dir }); return avanca(1) }
    if (v === 'inv4' && k % 2 && G.js.length > 2) { G.dir *= -1; ev({ t: 'inverte', dir: G.dir }) }
    if (v === 'roleta') return roleta(i)
    if (ehCompra(v)) { G.pend += k * VALOR[v]; G.pendTipo = G.pendTipo === '+4' || COMPRA_COR(v) ? '+4' : '+2'; return avanca(1) }
    avanca(1)
  }
  function giraMaos() {
    const maos = G.js.map(j => j.mao)
    G.js.forEach((j, i) => { j.mao = maos[depois(i, -1)]; j.pegavel = false; j.avisou = j.mao.length === 1 })
    ev({ t: 'gira', dir: G.dir })
    log('O 0 girou as mãos.')
  }
  const novoSil = () => ({ desde: Date.now(), falaram: [], cont: {} })
  // depois do 7 (com quem trocar) ou do 0 (girar ou não): quem jogou decide
  function decide(key, d) {
    const j = jog(key)
    if ((G.fase !== 'troca7' && G.fase !== 'gira0') || !j || G.js[G.vez] !== j) return
    const era7 = G.fase === 'troca7'
    if (era7) {
      const t = d.alvo ? jog(d.alvo) : null
      if (t === j || (!t && (d.alvo || !G.op.trocaLivre))) return
      if (t) {
        ;[j.mao, t.mao] = [t.mao, j.mao]
        for (const x of [j, t]) { x.pegavel = false; x.avisou = x.mao.length === 1 }
        ev({ t: 'troca', key, alvo: t.key }); log(`${j.nome} trocou de mão com ${t.nome}.`)
      } else { ev({ t: 'fica', key, o: '7' }); log(`${j.nome} preferiu não trocar.`) }
    } else if (d.gira) giraMaos()
    else { ev({ t: 'fica', key, o: '0' }); log(`${j.nome} preferiu não girar as mãos.`) }
    G.fase = 'jogo'
    if (era7 && G.op.sete) G.sil = novoSil()
    avanca(1)
  }
  // Roleta: o próximo vira cartas até sair a cor escolhida, fica com todas e perde a vez
  function roleta(i) {
    const alvo = G.js[depois(i, 1)]
    let n = 0, achou = false
    while (n < 40) {
      const [c] = compra(alvo, 1, true)
      if (!c) break
      n++
      if (c.c === G.cor) { achou = true; break }
    }
    if (n) ev({ t: 'compra', key: alvo.key, qtd: n })
    ev({ t: 'roleta', key: alvo.key, qtd: n, cor: G.cor, achou })
    log(`Roleta: ${alvo.nome} virou ${n} carta${n === 1 ? '' : 's'} até sair ${CORES[G.cor]} e perdeu a vez.`)
    avanca(2)
  }
  function comprar(key) {
    const i = idx(key), j = G.js[i]
    if (G.fase !== 'jogo' || i !== G.vez) return
    if (G.pend > 0) {
      const n = G.pend
      compra(j, n); log(`${j.nome} comprou ${n}.`)
      G.pend = 0; G.pendTipo = null
      ev({ t: 'pula', key })
      return avanca(1)
    }
    // compra uma por vez; com "Comprar até 3", pode comprar de novo até 3 e jogar qualquer carta que sirva
    if ((G.compradas || 0) >= limite()) return
    const novas = compra(j, 1)
    G.compradas = (G.compradas || 0) + 1
    log(`${j.nome} comprou${limite() > 1 ? ` (${G.compradas}/${limite()})` : ''}.`)
    // monte e descarte vazios: não tem o que comprar, libera passar
    if (!novas.length) G.compradas = limite()
    // compra só 1 (regra desligada) e não serve: passa sozinho, como antes
    if (limite() === 1 && novas[0] && !servePuro(novas[0])) return avanca(1)
    difunde()
  }
  const limite = () => G.op.ate3 ? 3 : 1
  const servePuro = c => !c.c || c.c === G.cor || c.v === topo().v
  function passar(key) {
    if (G.fase !== 'jogo' || idx(key) !== G.vez || (G.compradas || 0) < limite()) return
    avanca(1)
  }
  function ultima(key) {
    const j = jog(key)
    if (G.fase !== 'jogo' || !j || j.mao.length > 2 || j.avisou) return
    j.avisou = true; j.pegavel = false
    ev({ t: 'ultima', key })
    difunde()
  }
  function pegar(por, alvo) {
    const j = jog(alvo)
    if (G.fase !== 'jogo' || !j || !j.pegavel || j.mao.length !== 1 || por === alvo || !jog(por)) return
    compra(j, 2)
    ev({ t: 'pegou', key: alvo, por })
    log(`${nome(por)} pegou ${j.nome} sem avisar: comprou 2.`)
    difunde()
  }
  const nome = k => jog(k)?.nome || ctx.nomeDe(k)
  function fim(key) {
    clearTimeout(timer)
    G.fase = 'fim'; G.vencedor = key; G.sil = null; G.bate = null
    G.placar[key] = (G.placar[key] || 0) + 1
    ls.set('dc.placar', { t: Date.now(), p: G.placar }); ls.set('dc.vencedor', key)
    ev({ t: 'vence', key })
    log(`${nome(key)} descartou tudo e venceu!`)
    sysMsg(`🏆 ${nome(key)} venceu o Uno`)
    difunde()
  }
  function revanche() {
    const ant = new Set([...G.js.map(j => j.key), ...(G.estourou || [])])
    G.conv = Object.fromEntries(ctx.presentes().map(k => [k, ant.has(k) || k === me.key ? 'sim' : '?']))
    Object.assign(G, { id: Math.random().toString(36).slice(2, 9), fase: 'convite', js: [], monte: [], descarte: [], vencedor: null, log: [], ev: [], evN: 0, sil: null, bate: null })
    difunde()
  }
  // ---- 9 bate no monte
  function abreBate() {
    if (G.bate) fechaBate()
    G.bateK = (G.bateK || 0) + 1
    G.bate = { k: G.bateK, ate: Date.now() + BATE_MS, rt: {} }
    ev({ t: 'bate', k: G.bateK })
  }
  const ativosBate = () => { const pres = new Set(ctx.presentes()); return G.js.filter(j => j.key === me.key || pres.has(j.key)) }
  function bateu(key, d) {
    const j = jog(key)
    if (!j || G.fase !== 'jogo' || !G.op.bate) return
    const b = G.bate
    if (d.k > 0) { // resposta a uma batida: só vale se ainda está aberta, uma vez por pessoa
      if (!b || b.k !== d.k || key in b.rt) return
      const rt = Number(d.rt)
      b.rt[key] = Number.isFinite(rt) ? Math.max(0, Math.min(60000, Math.round(rt))) : 99999
      if (ativosBate().every(x => x.key in b.rt)) fechaBate()
      else difunde()
      return
    }
    // bateu sem 9 (ignora se há batida aberta ou acabou de fechar: a mão pode ter sumido para a pessoa só agora)
    if (b || Date.now() - (G.bateFechou || 0) < 3000) return
    if (Date.now() - (j.penBate || 0) < BATE_PEN_MS) return
    j.penBate = Date.now()
    compra(j, 1)
    ev({ t: 'bateSem', key, qtd: 1 }); log(`${j.nome} bateu sem 9 e comprou 1.`)
    difunde()
  }
  function fechaBate() {
    const b = G.bate
    if (!b) return
    G.bate = null; G.bateFechou = Date.now()
    const ativos = ativosBate()
    const lista = Object.entries(b.rt).filter(([k]) => jog(k)).map(([key, rt]) => ({ key, rt })).sort((x, y) => x.rt - y.rt)
    const faltou = ativos.filter(j => !(j.key in b.rt)).map(j => j.key)
    const lentos = ativos.filter(j => b.rt[j.key] > BATE_LIM).map(j => j.key)
    let compram = [...faltou, ...lentos]
    if (!compram.length && ativos.length > 1) { const ult = lista.filter(x => ativos.some(a => a.key === x.key)).at(-1); if (ult) compram = [ult.key] }
    ev({ t: 'bateFim', k: b.k, lista, faltou, compram, qtd: 2 })
    for (const k of compram) { const j = jog(k); if (j) compra(j, 2) }
    log(compram.length ? `Batida do 9: ${compram.map(nome).join(', ')} comprou 2.` : 'Batida do 9: ninguém comprou.')
    difunde()
  }
  function hostRecebe(d, key) {
    if (!G || !key || d.id !== G.id) return
    switch (d.op) {
      case 'resp': if (G.fase === 'convite') { G.conv[key] = d.sim ? 'sim' : 'nao'; difunde() } break
      case 'sai': if (key !== G.host) remove(key); break // saiu para outra mesa
      case 'joga': jogar(key, d); break
      case 'compra': comprar(key); break
      case 'passa': passar(key); break
      case 'ultima': ultima(key); break
      case 'pega': pegar(key, d.alvo); break
      case 'troca': decide(key, d); break
      case 'bate': bateu(key, d); break
      case 'fila': if (key === ADMIN && Array.isArray(d.fila)) { (G.fila ||= {})[key] = d.fila.map(String).filter(v => FILA_OK.has(v)).slice(0, 20); difunde() } break
    }
  }
  function vista(k) {
    return {
      id: G.id, seq: G.seq, host: G.host, hostNome: G.hostNome, fase: G.fase, op: G.op, conv: G.conv, placar: G.placar,
      js: G.js.map(j => ({ key: j.key, nome: j.nome, n: j.mao.length, avisou: j.avisou, pegavel: j.pegavel })),
      mao: jog(k)?.mao.slice() || null, descarte: G.descarte.slice(-14), cor: G.cor, dir: G.dir, vez: G.js[G.vez]?.key || null, monte: G.monte.length,
      bate: G.bate ? { k: G.bate.k, resta: Math.max(0, G.bate.ate - Date.now()), bateram: Object.keys(G.bate.rt) } : null,
      pend: G.pend, pendTipo: G.pendTipo, compradas: G.js[G.vez]?.key === k ? G.compradas || 0 : 0, lim: limite(),
      sil: G.sil ? { resta: Math.max(0, GRACA_7 - (Date.now() - G.sil.desde)), falaram: G.sil.falaram } : null,
      fila: k === ADMIN ? G.fila?.[k] || [] : null, vencedor: G.vencedor || null, log: G.log.slice(-40), ev: G.ev, prazo: G.prazo ? Math.max(0, G.prazo - Date.now()) : 0,
    }
  }
  function difunde() {
    if (!G) return
    G.seq++; G.t = Date.now()
    ls.set('dc.G', G)
    const ks = new Set([...ctx.presentes(), ...G.js.map(j => j.key), ...Object.keys(G.conv || {})])
    for (const k of ks) if (k !== me.key) ctx.sendTo(k, { dc: { v: vista(k) } })
    // cópia completa para o sucessor (o próximo jogador conectado), para ele assumir se eu cair
    const pres = new Set(ctx.presentes())
    G.sucessor = G.js.map(j => j.key).find(k => k !== me.key && pres.has(k)) || [...pres].find(k => k !== me.key) || null
    if (G.sucessor) ctx.sendTo(G.sucessor, { dc: { bk: G } })
    aplica(vista(me.key))
  }
  // alguém saiu de vez: as cartas voltam para o monte e a pessoa sai da mesa
  function remove(key) {
    if (G.fase === 'convite') { if (key in G.conv) { delete G.conv[key]; difunde() } return }
    const i = idx(key)
    if (i < 0) return
    const j = G.js[i], nome = j.nome
    G.monte.push(...j.mao); embaralha(G.monte)
    const eraVez = i === G.vez
    G.js.splice(i, 1)
    ev({ t: 'saiu', key, nome }); log(`${nome} saiu da mesa.`); sysMsg(`${nome} saiu do Uno`)
    ausDesde.delete(key)
    if (G.fase === 'fim') return difunde()
    if (G.js.length <= 1) { if (G.js[0]) return fim(G.js[0].key); return encerrar() }
    const n = G.js.length
    if (eraVez) { G.vez = G.dir > 0 ? i % n : (i - 1 + n) % n; G.compradas = 0; if (G.fase !== 'jogo') G.fase = 'jogo'; armaTempo() }
    else if (i < G.vez) G.vez--
    if (G.bate && ativosBate().every(x => x.key in G.bate.rt)) return fechaBate()
    difunde()
  }
  function encerrar() {
    if (!G) return
    clearTimeout(timer)
    ctx.send({ dc: { fim: G.id } })
    ls.set('dc.G', null)
    G = null
    aplica(null)
  }
  // 7 do silêncio: o host ouve o indicador de voz de todo mundo
  setInterval(() => {
    if (!G || G.host !== me.key) return
    if (G.bate && G.fase !== 'convite' && Date.now() >= G.bate.ate) return fechaBate()
    if (G.fase !== 'jogo' || !G.sil) return
    if (Date.now() - G.sil.desde < GRACA_7) return
    // exige fala contínua (3 amostras seguidas); uma amostra solta não conta
    const cont = G.sil.cont || (G.sil.cont = {})
    let mudou = false
    for (const j of G.js) {
      if (G.sil.falaram.includes(j.key)) continue
      if (!ctx.falando?.(j.key)) { cont[j.key] = 0; continue }
      cont[j.key] = (cont[j.key] || 0) + 1
      if (cont[j.key] < SILENCIO_AMOSTRAS) continue
      G.sil.falaram.push(j.key); compra(j, 2); ev({ t: 'falou', key: j.key }); log(`${j.nome} falou no 7 e comprou 2.`); mudou = true
    }
    if (mudou) difunde()
  }, 150)
  // quem caiu: o host compra por ele depois de um tempo
  setInterval(() => {
    if (!G && !restaurou && me.key) {
      restaurou = true
      const s = ls.get('dc.G')
      // volta só se ninguém assumiu a mesa no lugar
      if (s && s.host === me.key && emJogo(s.fase) && Date.now() - s.t < 3 * 3600e3) setTimeout(() => { if (G || (V && V.host !== me.key)) return ls.set('dc.G', null); G = s; armaTempo(); difunde() }, 3000)
    }
    assumeSePreciso()
    if (!G || G.host !== me.key) return
    const pres = new Set(ctx.presentes()), agora = Date.now()
    const quem = G.fase === 'convite' ? Object.keys(G.conv).filter(k => k !== me.key) : G.js.map(j => j.key).filter(k => k !== me.key)
    for (const k of quem) { if (pres.has(k)) ausDesde.delete(k); else if (!ausDesde.has(k)) ausDesde.set(k, agora) }
    for (const [k, t] of ausDesde) if (agora - t > SAIU_MS) return remove(k)
  }, 1500)
  // quem abriu a mesa caiu: o sucessor (que tem a cópia) assume e tira o antigo host do jogo
  let backup = null, hostSumiu = 0
  function assumeSePreciso() {
    if (G || !V || !backup || backup.id !== V.id || backup.sucessor !== me.key || souHost()) { hostSumiu = 0; return }
    if (ctx.presentes().includes(V.host)) { hostSumiu = 0; return }
    if (!hostSumiu) hostSumiu = Date.now()
    if (Date.now() - hostSumiu < HOST_MS) return
    const antigo = backup.host, nomeAntigo = backup.hostNome
    G = backup; backup = null; hostSumiu = 0
    G.host = me.key; G.hostNome = me.name; G.seq += 5
    log(`${nomeAntigo} caiu; ${me.name} assumiu a mesa.`)
    sysMsg(`${nomeAntigo} caiu: ${me.name} assumiu a mesa do Uno`)
    if (emJogo(G.fase)) armaTempo()
    remove(antigo)
    if (G) difunde()
  }

  /* =================================================================== cliente */
  let antesRender = null, ultFotos = new Map()
  // motor compartilhado com o Dobro: voos, impacto, FLIP da mão, giro do anel e do facho
  const M = criaMesa({ tela, carta: c => carta(c), cartaSel: '.dc-carta', palco: '.dc-palco' })
  const pousando = M.pousando // cartas voando: ficam escondidas no destino até pousar
  const calmo = () => matchMedia('(prefers-reduced-motion: reduce)').matches
  let V = null, ultEv = 0, dispensado = '', escolheCor = false, entregando = false, sel = [], ordem = ls.get('dc.ordem') || 'cor'
  const vistos = new Set()
  let guiaAberto = false, guiaAnima = false
  let tema = ls.get('dc.tema') === 'classico' ? 'classico' : 'minimalista'
  let temaAberto = false
  let bateK = 0, bateT0 = 0, bateFeito = false, bateMs = 0, bateRes = null, semNove = 0
  const novo = id => { if (vistos.has(id)) return false; vistos.add(id); return true }
  const souHost = () => V && V.host === me.key
  const eu = () => V?.js.find(j => j.key === me.key)
  const N = k => k === me.key ? 'Você' : (V?.js.find(j => j.key === k)?.nome || ctx.nomeDe(k))
  function manda(d) {
    if (!V) return
    const m = { id: V.id, ...d }
    if (souHost()) hostRecebe(m, me.key)
    else ctx.sendTo(V.host, { dc: { op: m } })
  }
  function got(d, deKey) {
    if (!d) return
    if (d.op) { if (G && G.host === me.key) hostRecebe(d.op, deKey); return }
    if (d.fim) { if (V?.id === d.fim) aplica(null); return }
    if (d.bk) { if (d.bk.host === deKey) backup = d.bk; return }
    if (d.v) {
      // eu caí e alguém assumiu: deixo de ser host
      if (G && d.v.id === G.id && d.v.host !== me.key) { clearTimeout(timer); G = null; ls.set('dc.G', null) }
      if (d.v.id === dispensado) return
      if (V && d.v.id === V.id && d.v.seq <= V.seq) return
      if (ctx.outroJogo?.()) return
      aplica(d.v)
    }
  }
  function aplica(v) {
    const antes = V
    if (v && (!antes || antes.id !== v.id)) {
      ultEv = Math.max(0, ...v.ev.map(e => e.n))
      const ini = v.ev.find(e => e.t === 'inicio')
      if (ini && v.fase === 'jogo' && v.ev.length < 4) ultEv = ini.n - 1
      escolheCor = false; sel = []; bateK = 0; bateRes = null; bateFeito = false
    }
    // a mão do 9 apareceu: cada um mede o PRÓPRIO tempo de reação a partir de agora
    if (v?.bate && v.bate.k !== bateK) { bateK = v.bate.k; bateT0 = performance.now(); bateFeito = v.bate.bateram.includes(me.key); bateMs = 0 }
    V = v
    if (v) v.recebido = Date.now()
    if (antes?.vez !== v?.vez || antes?.descarte?.at(-1)?.id !== v?.descarte?.at(-1)?.id) { escolheCor = false; sel = [] }
    if (v?.mao) sel = sel.filter(id => v.mao.some(c => c.id === id))
    if (v && v.fase === 'jogo' && v.vez === me.key && antes && antes.vez !== me.key) setTimeout(() => som('vez'), 350)
    const evs = v ? v.ev.filter(e => e.n > ultEv) : []
    if (v) ultEv = Math.max(ultEv, ...v.ev.map(e => e.n))
    if (evs.some(e => e.t === 'inicio')) entregando = true
    render(antes)
    if (v) anima(evs, antes)
  }

  /* ---------- sons ---------- */
  const buf = new Map()
  let carregando = null
  function carregaSons() {
    if (carregando) return carregando
    let ac; try { ac = ctx.audioCtx() } catch { return Promise.resolve() }
    carregando = Promise.all(SONS.map(n => fetch(SOM(n)).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(d => buf.set(n, d)).catch(() => {})))
    return carregando
  }
  function som(n, atraso = 0, vol = 1) {
    if (n === 'desliza') n = `desliza${1 + rnd(3)}`
    if (n === 'poe') n = `poe${1 + rnd(2)}`
    let ac; try { ac = ctx.audioCtx() } catch { return }
    const b = buf.get(n)
    if (!ac || !b) { carregaSons(); return }
    if (ac.state === 'suspended') ac.resume()
    const s = ac.createBufferSource(); s.buffer = b
    s.playbackRate.value = .95 + Math.random() * .1
    const g = ac.createGain(); g.gain.value = (VOL[n] ?? .55) * vol
    s.connect(g).connect(ctx.saida())
    s.start(ac.currentTime + atraso / 1000)
    s.onended = () => g.disconnect()
  }

  /* ---------- peças ---------- */
  const botao = (conteudo, fn, cls = '', title = '') => { const b = el('button', { type: 'button', className: `dc-btn ${cls}`, title }); b.append(...[conteudo].flat()); b.addEventListener('click', e => { e.stopPropagation(); b.blur(); som('clique'); fn(e) }); return b }
  const svg = (k, cls = '') => { const s = el('span', { className: `dc-svg ${cls}` }); s.innerHTML = SVG[k]; return s }
  function carta(c, cls = '') {
    const n = el('div', { className: `dc-carta ${c ? `dc-${c.c || 'k'}` : 'costas'} ${cls}`,
      ...(c ? { 'data-v': c.v, 'data-id': c.id == null ? '' : String(c.id), 'aria-label': nomeCarta(c) } : { 'aria-label': 'Carta virada' }) })
    n.innerHTML = tema === 'classico' ? arteClassica(c?.v, c?.c) : arteMinimalista(c?.v)
    return n
  }
  const retrato = (k, nm, cls = '') => el('span', { className: `dc-retrato ${cls}` }, ctx.pfp(k, 64, nm))
  // pilha bagunçada: cada carta tem giro e deslocamento próprios, fixos pelo id (todo mundo vê a mesma pilha)
  const mistura = (id, s) => { let x = Math.imul((id + 7) * 2654435761 ^ s * 40503, 2246822519); x ^= x >>> 13; x = Math.imul(x, 3266489917); x ^= x >>> 16; return (x >>> 0) / 4294967296 }
  const giro = id => Math.round(mistura(id, 1) * 48 - 24)
  const desvio = id => [mistura(id, 2) * 2.6 - 1.3, mistura(id, 3) * 2.6 - 1.3] // em cqh

  function angulos(n, comigo) {
    if (!comigo) return Array.from({ length: n }, (_, i) => 90 + 180 / n + i * 360 / n)
    if (n === 1) return [270]
    const span = Math.min(220, 72 * (n - 1)), a0 = 270 - span / 2
    return Array.from({ length: n }, (_, i) => a0 + i * span / (n - 1))
  }
  const pos = (ang, rx, ry) => ({ x: 50 + rx * Math.cos(ang * Math.PI / 180), y: 50 + ry * Math.sin(ang * Math.PI / 180) })

  /* ---------- render ---------- */
  function fechaTemas() {
    temaAberto = false
    render()
    tela.querySelector('.dc-tema')?.focus({ preventScroll: true })
  }
  function trocaTema(novo) {
    tema = novo === 'classico' ? 'classico' : 'minimalista'
    ls.set('dc.tema', tema)
    // Seleção de cartas e escolha de cor continuam guardadas na própria partida.
    fechaTemas()
  }
  function teclaTemas(e) {
    if (e.key === 'Escape') { e.preventDefault(); fechaTemas() }
    else if (e.key === 'Tab') {
      const bts = [...tela.querySelectorAll('.dc-temas button')], primeiro = bts[0], ultimo = bts.at(-1)
      if (e.shiftKey && (document.activeElement === primeiro || !tela.querySelector('.dc-temas')?.contains(document.activeElement))) { e.preventDefault(); ultimo?.focus() }
      else if (!e.shiftKey && (document.activeElement === ultimo || !tela.querySelector('.dc-temas')?.contains(document.activeElement))) { e.preventDefault(); primeiro?.focus() }
    }
  }
  function seletorTema() {
    const b = botao([
      el('span', { className: `dc-tema__mini dc-tema__mini--${tema}`, 'aria-hidden': 'true', textContent: 'UNO' }),
      el('span', { className: `dc-tema__feltro dc-feltro-op__oval--${mesa}`, 'aria-hidden': 'true' }),
      el('span', { className: 'dc-tema__nome', textContent: tema === 'classico' ? 'Clássico' : 'Minimalista' }), icon('chevron-down'),
    ], () => {
      temaAberto = true
      render()
      tela.querySelector(`.dc-baralho[data-tema-opcao="${tema}"]`)?.focus({ preventScroll: true })
    }, 'dc-tema', 'Baralho e mesa')
    b.setAttribute('aria-label', 'Escolher o baralho e a mesa')
    b.setAttribute('aria-haspopup', 'dialog')
    b.setAttribute('aria-expanded', String(temaAberto))
    return b
  }
  function caixasTema() {
    if (!temaAberto) return ''
    const fundo = el('div', { className: 'dc-temas' },
      el('section', { className: 'dc-temas__painel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dc-temas-titulo' },
        el('header', { className: 'dc-temas__topo' },
          el('div', {}, el('small', { textContent: 'UNO' }), el('h2', { id: 'dc-temas-titulo', textContent: 'Baralho e mesa' })),
          botao(icon('x'), fechaTemas, 'dc-btn--ic', 'Fechar escolha de baralho')),
        el('div', { className: 'dc-temas__caixas' }, ...[['classico', 'Clássico'], ['minimalista', 'Minimalista']].map(([id, nome]) => {
          const caixa = el('span', { className: `dc-caixa dc-caixa--${id}`, 'aria-hidden': 'true' },
            el('span', { className: 'dc-caixa__frente' }, el('img', { src: `jogos/uno/caixa-${id}.webp`, alt: '', draggable: false })),
            el('span', { className: 'dc-caixa__lateral', textContent: 'UNO' }),
            el('span', { className: 'dc-caixa__tampa', textContent: 'UNO' }))
          const b = el('button', { type: 'button', className: `dc-baralho${tema === id ? ' atual' : ''}`, 'data-tema-opcao': id,
            'aria-label': `Usar UNO ${nome}`, 'aria-pressed': String(tema === id) },
            el('span', { className: 'dc-baralho__palco' }, el('i', { className: 'dc-baralho__sombra' }), caixa),
            el('b', { className: 'dc-baralho__nome', textContent: nome }),
            el('span', { className: 'dc-baralho__estado' }, tema === id ? icon('check') : '', tema === id ? 'Em uso' : 'Escolher'))
          b.addEventListener('click', () => trocaTema(id))
          b.addEventListener('pointermove', e => {
            if (e.pointerType !== 'mouse' || calmo()) return
            const r = b.getBoundingClientRect()
            caixa.style.setProperty('--dc-caixa-x', `${-18 - (e.clientY - r.top - r.height / 2) / r.height * 12}deg`)
            caixa.style.setProperty('--dc-caixa-y', `${-32 + (e.clientX - r.left - r.width / 2) / r.width * 24}deg`)
          })
          b.addEventListener('pointerleave', () => { caixa.style.removeProperty('--dc-caixa-x'); caixa.style.removeProperty('--dc-caixa-y') })
          return b
        })),
        secaoMesas()))
    fundo.addEventListener('click', e => { if (e.target === fundo) fechaTemas() })
    // O diálogo recebe Enter/Espaço; as teclas não acionam os atalhos da call ou da mão.
    fundo.addEventListener('keydown', e => { e.stopPropagation(); teclaTemas(e) })
    return fundo
  }
  // tema da mesa (só para quem escolhe): feltro e borda
  const MESAS = [['grafite', 'Grafite'], ['feltro', 'Feltro verde'], ['vinho', 'Vinho'], ['noite', 'Azul noite'], ['madeira', 'Madeira']]
  // mesa de bar em 3D com a esquina do boteco ao fundo (Three.js só quando escolhida)
  const BARES = SKINS_BAR.map(([k, nm, cor]) => [`bar-${k}`, nm, cor])
  let mesa = [...MESAS, ...BARES].some(([k]) => k === ls.get('dc.mesa')) ? ls.get('dc.mesa') : 'bar-skol'
  const boteco = criaBoteco({ tela, palco: '.dc-palco', plano: '.dc-plano', centro: [.5, .52], tamanho: [.62, .86] })
  const escolheMesa = k => { mesa = k; ls.set('dc.mesa', k); som('clique'); render(); tela.querySelector('.dc-feltro-op.atual, .dc-bar-op.atual')?.focus({ preventScroll: true }) }
  function secaoMesas() {
    return el('div', { className: 'dc-temas__mesas' },
      el('small', { className: 'dc-temas__sub', textContent: 'Mesa de bar · na calçada do Marcílio Bar' }),
      el('div', { className: 'dc-temas__bares', role: 'radiogroup', 'aria-label': 'Mesa de bar' }, ...BARES.map(([k, nm, cor]) => {
        const b = el('button', { type: 'button', className: 'dc-bar-op' + (mesa === k ? ' atual' : ''), role: 'radio', 'aria-checked': String(mesa === k), 'aria-label': `Mesa de bar ${nm}`, style: `--bar:${cor}` },
          el('span', { className: 'dc-bar-op__mesa' }, el('i')), el('b', { textContent: nm }))
        b.addEventListener('click', e => { e.stopPropagation(); escolheMesa(k) })
        return b
      })),
      el('div', { className: 'dc-temas__qual', role: 'radiogroup', 'aria-label': 'Qualidade da mesa de bar' },
        el('small', { textContent: 'Qualidade' }),
        ...[['3d', '3D', 'Mesa desenhada em 3D (uma vez só; leve depois de pronta)'], ['2d', 'Leve', 'Mesa plana, sem 3D: para computador mais fraco']].map(([q, nm, dica]) => {
          const b = el('button', { type: 'button', className: 'dc-temas__qop' + (qualidadeMesa() === q ? ' on' : ''), textContent: nm, title: dica, role: 'radio', 'aria-checked': String(qualidadeMesa() === q) })
          b.addEventListener('click', e => { e.stopPropagation(); escolheQualidadeMesa(q); som('clique'); render() })
          return b
        })),
      el('small', { className: 'dc-temas__sub', textContent: 'Feltro' }),
      el('div', { className: 'dc-temas__feltros', role: 'radiogroup', 'aria-label': 'Tema da mesa' }, ...MESAS.map(([k, nm]) => {
        const b = el('button', { type: 'button', className: 'dc-feltro-op' + (mesa === k ? ' atual' : ''), role: 'radio', 'aria-checked': String(mesa === k), 'aria-label': `Mesa ${nm}` },
          el('span', { className: `dc-feltro-op__oval dc-feltro-op__oval--${k}` }, el('i')), el('b', { textContent: nm }))
        b.addEventListener('click', e => { e.stopPropagation(); escolheMesa(k) })
        return b
      })))
  }
  function render(antes) {
    const focoTema = temaAberto ? document.activeElement?.closest?.('[data-tema-opcao]')?.dataset.temaOpcao : null
    antesRender = antes
    const fotos = fotoMao()
    tela.dataset.tema = tema
    tela.dataset.mesa = mesa.startsWith('bar-') ? 'bar' : mesa
    tela.classList.toggle('dc--on', !!V)
    ctx.onAtivo?.(!!V)
    if (!V) { temaAberto = false; boteco.desliga(); tela.replaceChildren(); vistos.clear(); return }
    const conv = V.fase === 'convite', j = eu()
    const lugares = conv ? Object.keys(V.conv).filter(k => k !== me.key).map(k => ({ key: k, nome: ctx.nomeDe(k), conv: V.conv[k] }))
      : (() => { const js = V.js; const i = js.findIndex(x => x.key === me.key); return i < 0 ? js : [...js.slice(i + 1), ...js.slice(0, i)] })()
    const angs = angulos(lugares.length, conv || !!j)
    const plano = el('div', { className: 'dc-plano' }, el('div', { className: 'dc-feltro' }), conv ? '' : centro())
    if (!conv) lugares.forEach((x, n) => plano.append(...assento(x, angs[n])))
    const topoBar = el('header', { className: 'dc-topo' },
      el('img', { className: 'dc-logo dc-logo--oficial', src: tema === 'minimalista' ? 'jogos/uno/logo-minimalista.svg' : 'jogos/uno/logo.svg', alt: 'Uno' }),
      el('span', { className: 'dc-grow' }),
      seletorTema(),
      botao(icon('list-music'), () => tela.querySelector('.dc-log')?.classList.toggle('aberto'), 'dc-btn--ic', 'O que aconteceu'),
      souHost() ? botao(icon('x'), e => confirma(e.currentTarget, 'Fechar a mesa?', encerrar), 'dc-btn--ic', 'Fechar a mesa para todos')
        : botao(icon('x'), () => { dispensado = V.id; aplica(null) }, 'dc-btn--ic', 'Sair da mesa (só para você)'))
    if (souAdmin() && V.fase !== 'fim') topoBar.insertBefore(botao(icon('zap'), () => { filaAberta = !filaAberta; render() }, 'dc-btn--ic dc-btn--admin' + (filaAberta ? ' on' : ''), 'Admin: escolher as próximas cartas que você compra'), topoBar.querySelector('.dc-grow').nextSibling)
    if (V.op.semPiedade) topoBar.insertBefore(botao(icon('book-open'), () => { guiaAberto = !guiaAberto; guiaAnima = guiaAberto; render() }, 'dc-btn--ic' + (guiaAberto ? ' on' : ''), 'Cartas do Sem Piedade'), topoBar.querySelector('.dc-grow').nextSibling)
    plano.classList.toggle('jogando', emJogo(V.fase))
    const kids = [el('div', { className: 'dc-palco' }, plano), topoBar, minhaArea(antes), controles(), meio(), silencio(), bilhete(), quadro(), ...bateUI(), guia(), filaUI(), caixasTema(),
      el('div', { className: 'dc-log' }, el('ol', {}, ...V.log.slice(-40).map(t => el('li', { textContent: t }))))]
    if (!conv && V.fase !== 'fim' && !ctx.presentes().includes(V.host)) kids.push(el('div', { className: 'dc-pausa' }, el('b', { textContent: 'Partida pausada' }), el('span', { textContent: `${V.hostNome} abriu a mesa e caiu. Continua de onde parou quando voltar.` })))
    tela.replaceChildren(...kids)
    tela.classList.toggle('acabou', V.fase === 'fim')
    ctx.hydrate(tela)
    if (focoTema) tela.querySelector(`.dc-baralho[data-tema-opcao="${focoTema}"]`)?.focus({ preventScroll: true })
    if (entregando) tela.querySelectorAll('.dc-mao .dc-carta, .dc-leque-mesa .dc-carta').forEach(n => n.classList.add('oculta'))
    tela.querySelector('.dc-log ol')?.scrollTo(0, 1e6)
    flip(fotos); ultFotos = fotos
    // mesa de bar 3D atrás do plano das cartas (sem WebGL, fica o feltro)
    if (mesa.startsWith('bar-')) { boteco.encaixa(); boteco.liga(mesa.slice(4)) } else boteco.desliga()
    posCores(); miraLuz()
    posBate()
    voz()
  }
  /* ---------- 9 bate no monte, placar da noite ---------- */
  function bater() {
    if (!V?.bate || bateFeito || !eu() || V.fase !== 'jogo') return
    bateFeito = true; bateMs = Math.max(1, Math.round(performance.now() - bateT0))
    som('carimbo', 0, .9)
    manda({ op: 'bate', k: V.bate.k, rt: bateMs })
    render()
  }
  function bateSemNove() {
    if (Date.now() - semNove < BATE_PEN_MS) return
    semNove = Date.now(); som('golpe', 0, .8)
    manda({ op: 'bate', k: 0 })
  }
  // quem já bateu: as fotos caem uma por cima da outra sobre o monte, como mãos empilhando
  const giroBate = k => ((k.length * 37 + k.charCodeAt(0) * 13) % 24) - 12
  function pilhaBate(ks, perdem = [], k = 0) {
    return el('span', { className: 'dc-bate__pilha' }, ...ks.map((key, i) => el('span', {
      className: 'dc-bate__foto' + (perdem.includes(key) ? ' perde' : '') + (novo(`bp:${V.id}:${k}:${key}`) ? ' cai' : ''),
      style: `--giro:${giroBate(key)}deg;--i:${i}`, title: N(key) }, ctx.pfp(key, 64, N(key)), perdem.includes(key) ? el('b', { textContent: '+2' }) : '')))
  }
  function bateUI() {
    const out = []
    if (V.bate && V.fase === 'jogo' && eu()) {
      const b = V.bate
      const bt = el('button', { type: 'button', className: 'dc-bate' + (bateFeito ? ' feito' : '') + (novo(`bate:${V.id}:${b.k}`) ? ' entra' : ''), title: 'Bata no monte! (clique ou Espaço)' },
        el('span', { className: 'dc-bate__onda' }), el('span', { className: 'dc-bate__onda d2' }),
        pilhaBate(b.bateram, [], b.k),
        el('span', { className: 'dc-bate__selo' }, el('b', { textContent: bateFeito ? 'Bateu!' : 'Bata!' }), el('small', { textContent: bateFeito ? 'esperando a mesa…' : 'clique ou espaço' })),
        bateFeito ? '' : el('i', { className: 'dc-bate__tempo', 'data-fim': String(V.recebido + b.resta - (BATE_MS - BATE_LIM)), 'data-tot': String(BATE_LIM) }))
      bt.addEventListener('click', e => { e.stopPropagation(); bt.blur(); bater() })
      out.push(bt)
    }
    if (bateRes && performance.now() < bateRes.ate) out.push(painelBate())
    return out
  }
  function painelBate() {
    const r = bateRes
    const ordem = [...r.lista.map(x => x.key), ...r.faltou]
    const frase = !r.compram.length ? 'Todo mundo bateu a tempo!'
      : r.faltou.length ? `${r.faltou.map(N).join(' e ')} não ${r.faltou.length > 1 ? 'bateram' : 'bateu'}: +${r.qtd}`
      : `${r.compram.map(N).join(' e ')} ${r.compram.includes(me.key) && r.compram.length === 1 ? 'foi' : r.compram.length > 1 ? 'foram' : 'foi'} ${r.compram.length > 1 ? 'os últimos' : 'o último'}: +${r.qtd}`
    return el('div', { className: 'dc-bateres' + (novo(`bateres:${V.id}:${r.k}`) ? ' entra' : '') + (r.compram.includes(me.key) ? ' eu' : '') },
      pilhaBate(ordem, r.compram, 'fim' + r.k), el('b', { textContent: frase }))
  }
  // a mão e o resultado ficam sobre o monte
  function posBate() {
    const monte = tela.querySelector('.dc-descarte') || tela.querySelector('.dc-monte')
    if (!monte) return
    const p = noTela(monte)
    const cp = noTela(tela.querySelector('.dc-centro') || monte)
    for (const n of tela.querySelectorAll('.dc-bate')) { n.style.left = p.x + 'px'; n.style.top = p.y + 'px' }
    for (const n of tela.querySelectorAll('.dc-bateres')) { n.style.left = cp.x + 'px'; n.style.top = cp.y + 'px' }
  }
  function quadro() {
    const r = Object.entries(V.placar || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 6)
    if (!r.length || V.fase === 'fim') return ''
    return el('div', { className: 'dc-quadro', title: 'Placar da noite (vitórias)' }, el('small', { textContent: 'Placar da noite' }),
      ...r.map(([k, n]) => el('span', { title: `${N(k)}: ${n} vitória${n === 1 ? '' : 's'}` }, retrato(k, N(k)), el('b', { textContent: n }))))
  }
  // "Uno!" também por voz: escuta só enquanto você pode precisar avisar (Chrome)
  let rec = null, recQuer = false
  function voz() {
    const j = eu()
    const quer = !!(V && V.fase === 'jogo' && V.op.penalidade && j && !j.avisou && V.mao?.length && V.mao.length <= 2 && !ctx.mudo?.())
    if (quer === recQuer) return
    recQuer = quer
    if (!quer) { try { rec?.stop() } catch {} return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    if (!rec) {
      rec = new SR(); rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = true
      rec.onresult = e => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
          if (/\b(uno|ultima)\b/.test(t) && recQuer) { recQuer = false; try { rec.stop() } catch {} manda({ op: 'ultima' }); return }
        }
      }
      rec.onend = () => { if (recQuer) setTimeout(() => { if (recQuer) try { rec.start() } catch {} }, 300) }
      rec.onerror = e => { if (/not-allowed|service-not-allowed/.test(e.error)) { recQuer = false; rec = null } }
    }
    try { rec.start() } catch {}
  }
  function confirma(btn, txt, fn) {
    if (btn.dataset.conf) return fn()
    btn.dataset.conf = '1'; btn.classList.add('confirma')
    const tip = el('span', { className: 'dc-tip', textContent: `${txt} Clique de novo.` }); btn.append(tip)
    setTimeout(() => { delete btn.dataset.conf; btn.classList.remove('confirma'); tip.remove() }, 2600)
  }
  function centro() {
    const minha = V.fase === 'jogo' && V.vez === me.key
    const podeComprar = minha && (V.pend > 0 || V.compradas < V.lim)
    // monte com volume: camadas empilhadas de verdade no eixo Z (mais cartas, mais alto)
    const camadas = V.monte ? Math.min(8, Math.max(2, Math.ceil(V.monte / 12))) : 0
    const monte = el('div', { className: 'dc-monte' + (podeComprar ? ' pode' : '') + (V.monte ? '' : ' vazio'), style: `--camadas:${camadas}`, 'data-info': `Monte: ${V.monte} cartas${podeComprar ? (V.pend ? `\nClique para comprar ${V.pend}` : '\nClique para comprar') : ''}` },
      el('i', { className: 'dc-monte__sombra' }),
      ...Array.from({ length: camadas }, (_, i) => { const n = carta(null, 'dc-camada'); n.style.setProperty('--i', i); return n }))
    if (podeComprar) monte.addEventListener('click', () => { som('desliza'); manda({ op: 'compra' }) })
    const desc = el('div', { className: `dc-descarte dc-cor-${V.cor}`, 'data-info': `Mesa: ${CORES[V.cor]}${V.pend ? `\nAcumulado: +${V.pend}` : ''}` },
      ...V.descarte.map((c, i) => {
        const n = carta(c, 'dc-no-monte'), [dx, dy] = desvio(c.id)
        n.style.cssText += `--giro:${giro(c.id)}deg;--dx:${dx.toFixed(2)}cqh;--dy:${dy.toFixed(2)}cqh;--i:${i}`
        if (pousando.has(c.id)) n.classList.add('oculta')
        return n
      }),
      V.pend ? el('b', { className: 'dc-pend', textContent: `+${V.pend}` }) : '')
    if (minha) desc.addEventListener('click', () => enviar())
    // anel de setas na cor da mesa (gira no sentido do jogo) e o facho de luz para quem tem a vez
    const anel = el('div', { className: `dc-anelvez dc-cor-${V.cor}` }, el('div', { className: 'dc-anelvez__giro' }))
    anel.firstChild.innerHTML = ANEL_SVG
    return el('div', { className: 'dc-centro' }, el('i', { className: `dc-luz dc-cor-${V.cor}` }), anel, monte, desc)
  }
  function assento(x, ang) {
    const P = pos(ang, 41, 41), C = pos(ang, 30, 27.5)
    const vez = emJogo(V.fase) && V.vez === x.key
    const alvoTroca = V.fase === 'troca7' && V.vez === me.key && x.key !== me.key && x.n != null
    const s = el('div', { className: 'dc-assento' + (vez ? ' vez' : '') + (alvoTroca ? ' alvo' : '') + (V.vencedor === x.key ? ' vencedor' : '') + (V.fase === 'jogo' && x.n === 1 ? ' um' : ''), style: `left:${P.x}%;top:${P.y}%`, 'data-key': x.key },
      el('div', { className: 'dc-medalha' }, retrato(x.key, x.nome), x.n === 1 && x.avisou ? el('b', { className: 'dc-selo', textContent: 'Uno' }) : ''),
      el('span', { className: 'dc-placa' }, x.nome, V.placar?.[x.key] ? el('i', { textContent: ` · ${V.placar[x.key]}` }) : ''),
      x.conv ? el('small', { className: `dc-conv dc-conv--${x.conv}`, textContent: x.conv === 'sim' ? 'vai jogar' : x.conv === 'nao' ? 'só assiste' : 'decidindo…' }) : '')
    if (alvoTroca) s.addEventListener('click', () => { som('leque'); manda({ op: 'troca', alvo: x.key }) })
    if (vez && V.fase === 'jogo') s.querySelector('.dc-medalha').append(el('i', { className: 'dc-seta-vez' }))
    if (vez && V.prazo) s.querySelector('.dc-medalha').append(el('i', { className: 'dc-anel', 'data-fim': String(V.recebido + V.prazo), 'data-tot': String(V.op.tempo * 1000) }))
    if (vez && V.fase !== 'jogo') s.append(el('small', { className: 'dc-conv dc-conv--escolhe', textContent: V.fase === 'troca7' ? 'escolhendo com quem trocar…' : 'decidindo se gira…' }))
    if (x.n == null) return [s]
    // contador de cartas no retrato: dá um pulo quando o número muda
    const eraN = antesRender?.id === V.id ? antesRender.js?.find(y => y.key === x.key)?.n : x.n
    s.querySelector('.dc-medalha').append(el('b', { className: 'dc-qtd' + (eraN != null && eraN !== x.n ? (x.n > eraN ? ' pula sobe' : ' pula') : ''), textContent: x.n }))
    // leque em pé, de costas para a gente e virado para o centro da mesa
    const n = Math.min(x.n, 12)
    const leque = el('div', { className: 'dc-leque-mesa', style: `left:${C.x}%;top:${C.y}%;--yaw:${(-Math.cos(ang * Math.PI / 180) * 34).toFixed(1)}deg;--n:${n}`, 'data-mao': x.key, 'data-info': `${x.nome}: ${x.n} carta${x.n === 1 ? '' : 's'}` },
      el('div', { className: 'dc-leque-mesa__em-pe' }, ...Array.from({ length: n }, (_, i) => { const c = carta(null); c.style.setProperty('--i', i); c.style.setProperty('--o', (i - (n - 1) / 2).toFixed(2)); return c })))
    return [leque, s]
  }
  // admin: painelzinho com as cartas fortes em destaque; clicar põe na fila das próximas compras
  let filaAberta = false
  const souAdmin = () => me.key === ADMIN && me.admin && V?.fila
  function filaUI() {
    if (!filaAberta || !souAdmin()) return ''
    const fila = V.fila || []
    const muda = f => manda({ op: 'fila', fila: f })
    const opcao = v => {
      const c = carta(FILA_SP.includes(v) || ['+4', 'cor'].includes(v) ? { id: -1, c: null, v } : { id: -1, c: 'r', v }, 'dc-fila__c')
      const b = el('button', { type: 'button', className: 'dc-fila__op', title: `Pôr ${NOMES[v] || v} na fila` }, c)
      b.addEventListener('click', () => muda([...fila, v])); return b
    }
    const nums = el('div', { className: 'dc-fila__nums' }, ...'0123456789'.split('').map(v => { const b = el('button', { type: 'button', textContent: v, title: `Pôr um ${v} na fila` }); b.addEventListener('click', () => muda([...fila, v])); return b }))
    const lista = el('div', { className: 'dc-fila__lista' }, fila.length ? fila.map((v, i) => { const b = el('button', { type: 'button', className: 'dc-fila__item', title: 'Tirar da fila' }, el('b', { textContent: `${i + 1}º` }), NOMES[v] || (v === 'cor' ? 'Coringa' : v)); b.addEventListener('click', () => muda(fila.filter((_, k) => k !== i))); return b }) : el('small', { textContent: 'vazia: as compras vêm normais' }))
    const limpar = el('button', { type: 'button', className: 'dc-fila__limpa', textContent: 'Limpar' }); limpar.addEventListener('click', () => muda([]))
    const fechar = el('button', { type: 'button', className: 'dc-fila__x', title: 'Fechar' }, icon('x')); fechar.addEventListener('click', () => { filaAberta = false; render() })
    return el('div', { className: 'dc-fila' },
      el('header', {}, el('b', {}, icon('zap'), 'Próximas compras'), fechar),
      el('div', { className: 'dc-fila__ops' }, ...[...(V.op.semPiedade ? FILA_SP : []), ...FILA_BASE].map(opcao)),
      nums, lista, fila.length ? limpar : '')
  }
  function minhaArea(antes) {
    const j = eu(), conv = V.fase === 'convite'
    const bon = ctx.boneco?.(me.key)
    const minha = V.fase === 'jogo' && V.vez === me.key
    const chegouVez = emJogo(V.fase) && V.vez === me.key && antes && antes.id === V.id && antes.vez !== me.key
    const area = el('div', { className: 'dc-eu' + (emJogo(V.fase) && V.vez === me.key ? ' vez' : '') + (chegouVez ? ' chegou-vez' : '') + (emJogo(V.fase) ? ' em-jogo' : '') + (V.vencedor === me.key ? ' vencedor' : '') + (V.fase === 'jogo' && V.mao?.length === 1 ? ' um' : ''), 'data-key': me.key },
      bon ? el('img', { className: 'dc-boneco', src: bon, alt: '', draggable: false }) : el('div', { className: 'dc-boneco dc-boneco--pfp' }, retrato(me.key, me.name)))
    if (conv) return ''
    if (!j || !V.mao) { area.append(el('small', { className: 'dc-dica', textContent: 'assistindo' })); return area }
    const ids = new Set((antes?.mao || []).map(c => c.id))
    const porCor = (a, b) => ('rygbk'.indexOf(a.c || 'k') - 'rygbk'.indexOf(b.c || 'k')) || ordemV(a.v) - ordemV(b.v)
    const ordenada = V.mao.slice().sort(ordem === 'cor' ? porCor : (a, b) => ordemV(a.v) - ordemV(b.v) || porCor(a, b))
    const duas = ordenada.length > 16, meio = Math.ceil(ordenada.length / 2)
    const mao = el('div', { className: 'dc-mao' + (duas ? ' duas' : ''), style: `--n:${duas ? meio : ordenada.length}` },
      ...ordenada.map((c, i) => {
        const ordem = sel.indexOf(c.id)
        const pode = minha && !sel.length && serveCli(c)
        const n = carta(c, (ordem >= 0 ? 'escolhida' : pode ? 'pode' : minha && !sel.length ? 'nao' : '') + (antes && antes.id === V.id && !ids.has(c.id) && !pousando.has(c.id) ? ' chegou' : '') + (pousando.has(c.id) ? ' oculta' : ''))
        // arco: as do meio ficam mais altas, as pontas descem e giram (menos giro quanto mais cartas)
        const k = duas ? (i < meio ? i : i - meio) : i, tot = duas ? (i < meio ? meio : ordenada.length - meio) : ordenada.length
        const off = k - (tot - 1) / 2, abre = Math.min(3.4, 30 / Math.max(tot, 1)), cai = Math.min(1.8, .3 + tot * .12) / Math.max(1, ((tot - 1) / 2) ** 2)
        // o encaixe fica parado no arco e recebe o hover; a carta dentro dele é que sobe (sem tremer na borda)
        const slot = el('div', { className: 'dc-slot' + (duas && i < meio ? ' atras' : ''), style: `--i:${k};--off:${off.toFixed(2)};--rz:${(off * abre).toFixed(2)}deg;--ay:${(off * off * cai).toFixed(3)}cqh` }, n)
        if (duas && i < meio) n.classList.add('atras')
        if (minha || (V.op.corte && V.fase === 'jogo')) {
          n.addEventListener('click', () => clicaCarta(c))
          n.addEventListener('dblclick', () => { if (sel.length === 1 && sel[0] === c.id) enviar() })
        }
        return slot
      }))
    M.inclina(mao)
    area.append(mao)
    // mão grande: o boneco se afasta para caber
    area.classList.toggle('cheia', ordenada.length > 11 && ordenada.length <= 16)
    area.classList.toggle('lotada', ordenada.length > 16)
    const ord = el('button', { type: 'button', className: 'dc-ordenar', title: ordem === 'cor' ? 'Mão ordenada por cor (clique para ordenar por número)' : 'Mão ordenada por número (clique para ordenar por cor)' })
    ord.innerHTML = ordem === 'cor' ? ICONE_COR : ICONE_NUM
    ord.addEventListener('click', () => { ordem = ordem === 'cor' ? 'num' : 'cor'; ls.set('dc.ordem', ordem); som('leque', 0, .5); render() })
    area.append(ord)
    if (minha && V.prazo) area.append(el('i', { className: 'dc-pavio', 'data-fim': String(V.recebido + V.prazo), 'data-tot': String(V.op.tempo * 1000) }))
    if (minha) area.append(el('span', { className: 'dc-dica dc-dica--vez', textContent: V.pend ? `+${V.pend} para você` : V.compradas >= V.lim ? (V.mao.some(serveCli) ? 'Jogue ou passe a vez' : 'Sem jogada: passe a vez') : V.compradas ? `Jogue ou compre de novo (${V.compradas}/${V.lim})` : 'Sua vez' }))
    return area
  }
  // clicar seleciona; dá para juntar outras cartas de mesmo valor (qualquer cor). A última clicada fica por cima.
  function clicaCarta(c) {
    if (escolheCor) return
    if (V.vez !== me.key) {
      // corte: a idêntica à da mesa, fora da vez, vai direto
      const t = V.descarte[V.descarte.length - 1]
      if (V.op.corte && !V.pend && t?.c && c.c === t.c && c.v === t.v) { if (bateComAcao([c.id])) { avisoAcao(); return tremer(c.id) } som('poe', 0, .9); manda({ op: 'joga', cartas: [c.id] }) }
      else tremer(c.id)
      return
    }
    if (V.fase !== 'jogo') return
    // a última selecionada de novo: joga; outra já selecionada: tira da seleção
    if (sel.includes(c.id)) { if (sel[sel.length - 1] === c.id) return enviar(); sel = sel.filter(x => x !== c.id); som('clique'); return render() }
    if (!sel.length) {
      if (!serveCli(c)) { if (bateComAcao([c.id])) avisoAcao(); return tremer(c.id) }
      sel = [c.id]
      // só segura a carta quando dá para juntar outra igual; senão joga na hora
      if (!V.mao.some(x => x.id !== c.id && x.v === c.v)) return enviar()
    }
    else {
      const p = V.mao.find(x => x.id === sel[0])
      if (!p || p.v !== c.v) return tremer(c.id)
      sel.push(c.id)
    }
    som('poe', 0, .45)
    render()
  }
  const avisoAcao = () => toast('Não dá para bater com carta de ação: termine com um número.', 2600)
  function tremer(id) {
    const n = tela.querySelector(`.dc-mao .dc-carta[data-id="${id}"]`)
    n?.animate([{ translate: '0 0' }, { translate: '-1cqh 0' }, { translate: '1cqh 0' }, { translate: '-.6cqh 0' }, { translate: '.3cqh 0' }, { translate: '0 0' }], { duration: 340, easing: 'ease-out' })
  }
  function enviar(cor) {
    if (!sel.length) return
    const ult = V.mao.find(x => x.id === sel[sel.length - 1])
    if (!ult) return
    if (bateComAcao(sel)) { avisoAcao(); const id = sel.at(-1); sel = []; escolheCor = false; render(); return tremer(id) }
    if (!ult.c && !cor) { escolheCor = true; return render() }
    const n = sel.length
    manda({ op: 'joga', cartas: sel, cor })
    sel = []; escolheCor = false
    if (n > 1) { som('leque', 0, .9); for (let i = 0; i < n; i++) som('poe', 80 + i * 90, .6) } else som('poe', 0, .8)
  }
  const ordemV = v => ehNumero(v) ? +v : { pula: 10, pulaT: 11, inverte: 12, desc: 12.5, '+2': 13, cor: 14, roleta: 14.5, '+4': 15, inv4: 15.5, '+6': 16, '+10': 17 }[v]
  // 'Não bate com ação': jogar essas cartas esvaziaria a mão com uma carta de ação?
  function bateComAcao(ids) {
    if (!V.op.semAcao) return false
    const cs = ids.map(id => V.mao.find(x => x.id === id)), ult = cs.at(-1)
    if (!ult || ehNumero(ult.v)) return false
    return !V.mao.some(x => !ids.includes(x.id) && !(ult.v === 'desc' && x.c === ult.c))
  }
  function serveCli(c) {
    if (V.pend > 0) return (V.op.semPiedade ? ehCompra(c.v) : V.op.acumula && (c.v === '+2' || c.v === '+4')) && !bateComAcao([c.id])
    const t = V.descarte[V.descarte.length - 1]
    return (!c.c || c.c === V.cor || c.v === t.v) && !bateComAcao([c.id])
  }
  // botões do momento (canto direito) e o aviso de última
  function controles() {
    const j = eu()
    if (!j || V.fase !== 'jogo') return ''
    const minha = V.vez === me.key
    const bts = []
    if (minha && sel.length) bts.push(botao(sel.length > 1 ? `Jogar ${sel.length}` : 'Jogar', () => enviar(), 'dc-btn--forte dc-btn--grande'))
    if (minha && V.pend) bts.push(botao(`Comprar ${V.pend}`, () => { som('desliza'); manda({ op: 'compra' }) }, sel.length ? '' : 'dc-btn--forte'))
    else if (minha && V.compradas >= V.lim) bts.push(botao('Passar a vez', () => manda({ op: 'passa' }), sel.length || V.mao.some(serveCli) ? '' : 'dc-btn--forte'))
    else if (minha && !sel.length) bts.push(botao(V.lim > 1 ? `Comprar ${V.compradas + 1}/${V.lim}` : 'Comprar', () => { som('desliza'); manda({ op: 'compra' }) }))
    if (V.op.penalidade && V.mao && V.mao.length <= 2 && !j.avisou) bts.push(botao('Uno!', () => manda({ op: 'ultima' }), 'dc-btn--ultima', 'Avise antes que alguém te pegue'))
    for (const x of V.js) if (x.pegavel && x.key !== me.key) bts.push(botao(['Pegou ', el('b', { textContent: x.nome }), '!'], () => manda({ op: 'pega', alvo: x.key }), 'dc-btn--pega', `${x.nome} está com 1 carta e não avisou`))
    return bts.length ? el('div', { className: 'dc-controles' }, ...bts) : ''
  }
  function meio() {
    if (V.fase === 'convite') return convite()
    if (V.fase === 'fim') {
      const v = V.vencedor
      const r = Object.entries(V.placar || {}).sort((a, b) => b[1] - a[1])
      return el('div', { className: 'dc-fim' }, retrato(v, N(v), 'dc-retrato--grande'),
        el('b', { className: 'dc-fim__t', textContent: v === me.key ? 'Você descartou tudo' : `${N(v)} descartou tudo` }),
        r.length ? el('div', { className: 'dc-placar' }, ...r.map(([k, n]) => el('span', {}, retrato(k, N(k)), el('b', { textContent: N(k) }), el('em', { textContent: n })))) : '',
        souHost() ? el('div', { className: 'dc-linha' }, botao('Nova partida', revanche, 'dc-btn--forte'), botao('Fechar', encerrar)) : '')
    }
    if ((V.fase === 'troca7' || V.fase === 'gira0') && V.vez === me.key && eu()) return escolha()
    if (escolheCor) {
      // roda de cores em volta da pilha: quatro pétalas, a cor escolhida já tinge o anel
      const roda = el('div', { className: 'dc-cores' + (novo(`cores:${V.id}:${V.descarte.at(-1)?.id}:${sel.join()}`) ? ' entra' : '') })
      roda.innerHTML = RODA_SVG
      roda.querySelector('svg').addEventListener('click', e => { const f = e.target.closest('[data-cor]'); if (f) { som('poe', 0, .6); enviar(f.getAttribute('data-cor')) } })
      roda.querySelector('svg').addEventListener('keydown', e => { const f = e.target.closest('[data-cor]'); if (f && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); enviar(f.getAttribute('data-cor')) } })
      const x = el('button', { type: 'button', className: 'dc-cores__x', title: 'Cancelar (Esc)' }, icon('x'))
      x.addEventListener('click', () => { escolheCor = false; render() })
      roda.append(el('div', { className: 'dc-cores__pe' }, el('small', { textContent: 'Escolha a cor' }), x))
      // passar o mouse numa cor já tinge o anel da mesa
      roda.addEventListener('pointerover', e => { const f = e.target.closest?.('[data-cor]'); const an = tela.querySelector('.dc-anelvez'); if (an) an.style.color = f ? corCss(f.getAttribute('data-cor')) : '' })
      roda.addEventListener('pointerleave', () => { const an = tela.querySelector('.dc-anelvez'); if (an) an.style.color = '' })
      return roda
    }
    return ''
  }
  // 7 / 0: menu de escolha para quem jogou
  function escolha() {
    const outros = V.js.filter(x => x.key !== me.key)
    if (V.fase === 'troca7') {
      const ns = outros.map(x => x.n), menor = ns.filter(n => n === Math.min(...ns)).length === 1 ? Math.min(...ns) : -1 // só destaca se for um só
      return el('div', { className: 'dc-escolha' + (novo(`esc:${V.id}:${V.descarte.at(-1)?.id}`) ? ' entra' : '') },
        el('div', { className: 'dc-escolha__topo' }, el('span', { className: 'dc-escolha__sete', style: `--cor-ult:var(--${V.cor})`, textContent: '7' }), el('span', {}, el('b', { textContent: 'Trocar de mão' }), el('small', { textContent: `Você tem ${V.mao.length} carta${V.mao.length === 1 ? '' : 's'}. Escolha com quem trocar.` }))),
        el('div', { className: 'dc-escolha__lista' }, ...outros.map(x => {
          const b = el('button', { type: 'button', className: 'dc-escolha__pessoa' + (x.n === menor ? ' menor' : '') },
            retrato(x.key, x.nome), el('b', { textContent: x.nome }),
            el('span', { className: 'dc-escolha__mini', style: `--n:${Math.min(x.n, 8)}` }, ...Array.from({ length: Math.min(x.n, 8) }, (_, k) => { const c = carta(null); c.style.setProperty('--i', k); return c })),
            el('em', { textContent: `${x.n} carta${x.n === 1 ? '' : 's'}` }), x.n === menor ? el('i', { className: 'dc-escolha__tag', textContent: 'menos cartas' }) : '')
          b.addEventListener('click', () => { som('leque'); manda({ op: 'troca', alvo: x.key }) })
          return b
        })),
        V.op.trocaLivre ? botao('Ficar com a minha mão', () => manda({ op: 'troca' }), 'dc-btn--leve') : '')
    }
    const i = V.js.findIndex(x => x.key === me.key), n = V.js.length
    const de = V.js[((i - V.dir) % n + n) % n]
    return el('div', { className: 'dc-escolha' + (novo(`esc:${V.id}:${V.descarte.at(-1)?.id}`) ? ' entra' : '') },
      el('div', { className: 'dc-escolha__topo' }, el('span', { className: 'dc-escolha__sete', style: `--cor-ult:var(--${V.cor})`, textContent: '0' }), el('span', {}, el('b', { textContent: 'Girar as mãos?' }), el('small', { textContent: `Cada um passa a mão para o próximo, ${V.dir > 0 ? 'no sentido horário' : 'no sentido anti-horário'}.` }))),
      el('div', { className: 'dc-escolha__gira' },
        el('span', { className: 'dc-escolha__lado' }, el('small', { textContent: 'agora' }), el('b', { textContent: `${V.mao.length}` }), el('em', { textContent: 'suas cartas' })),
        el('span', { className: `dc-escolha__seta ${V.dir > 0 ? 'hora' : 'anti'}` }, svg('seta')),
        el('span', { className: 'dc-escolha__lado' }, el('small', { textContent: 'se girar' }), el('b', { textContent: `${de.n}` }), el('em', { textContent: `a mão de ${de.nome}` }))),
      el('div', { className: 'dc-linha' }, botao('Girar', () => { som('leque'); manda({ op: 'troca', gira: true }) }, 'dc-btn--forte dc-btn--grande'), botao('Não girar', () => manda({ op: 'troca' }), 'dc-btn--leve')))
  }
  // guia das cartas do Sem Piedade
  function guia() {
    if (!guiaAberto) return ''
    const fecha = () => { guiaAberto = false; render() }
    const fundo = el('div', { className: 'dc-guia' + (guiaAnima ? ' entra' : '') },
      el('div', { className: 'dc-guia__caixa' },
        el('div', { className: 'dc-guia__topo' }, el('b', { textContent: 'Cartas do Sem Piedade' }), botao(icon('x'), fecha, 'dc-btn--ic', 'Fechar')),
        el('ul', {}, ...GUIA.map(([c, nm, txt], k) => el('li', { style: `--k:${k}` }, carta({ ...c, id: null }), el('span', {}, el('b', { textContent: nm }), el('small', { textContent: txt }))))),
        el('p', { className: 'dc-guia__pe', textContent: 'Sem limite de cartas: ninguém sai da mesa por ter muitas.' })))
    fundo.addEventListener('click', e => { if (e.target === fundo) fecha() })
    guiaAnima = false
    return fundo
  }
  // Lobby: estilos prontos no alto, regras como cartões ilustrados (ligada = acesa), e no rodapé tempo, quem joga e começar.
  // Só o host mexe; os outros veem tudo e a regra que mudou pisca.
  function estiloAtual() {
    const ligadas = OPCOES.map(([k]) => k).filter(k => V.op[k])
    return ESTILOS.find(([, , , on]) => on.length === ligadas.length && on.every(k => V.op[k]))?.[0] || null
  }
  function leque(cs, cls = '') {
    return el('span', { className: `dc-leque ${cls}`, style: `--n:${cs.length}` }, ...cs.map((c, i) => { const n = carta(c ? { id: null, ...c } : null); n.style.setProperty('--i', i); n.style.setProperty('--o', (i - (cs.length - 1) / 2).toFixed(2)); return n }))
  }
  const SELO = { 'Uno!': () => el('b', { className: 'dc-regra__selo dc-regra__selo--fala', textContent: 'Uno!' }), shh: () => el('b', { className: 'dc-regra__selo' }, svg('shh')),
    troca: () => el('b', { className: 'dc-regra__selo' }, icon('refresh-cw')), gira: () => el('b', { className: 'dc-regra__selo' }, icon('rotate-cw')),
    mao: () => el('b', { className: 'dc-regra__selo dc-regra__selo--mao' }, svg('mao')), nao: () => el('b', { className: 'dc-regra__selo dc-regra__selo--nao' }, icon('x')) }
  function convite() {
    const host = souHost(), op = V.op, era = antesRender?.id === V.id ? antesRender.op : null
    const pres = new Set(ctx.presentes())
    const jogam = Object.entries(V.conv).filter(([k, v]) => v === 'sim' && pres.has(k)).map(([k]) => k)
    const atual = estiloAtual()
    const aplicaEstilo = on => { for (const [k] of OPCOES) G.op[k] = on.includes(k); som('leque', 0, .6); difunde() }
    // estilos prontos
    const estilos = el('div', { className: 'dc-estilos', role: host ? 'radiogroup' : null, 'aria-label': 'Estilo de jogo' }, ...ESTILOS.map(([k, nm, txt, on, cs], i) => {
      const b = el('button', { type: 'button', className: 'dc-estilo' + (atual === k ? ' atual' : '') + (k === 'piedade' ? ' dc-estilo--piedade' : ''), disabled: !host, style: `--k:${i}`, role: 'radio', 'aria-checked': String(atual === k) },
        leque(cs, 'dc-leque--estilo'), el('span', { className: 'dc-estilo__txt' }, el('b', { textContent: nm }), el('small', { textContent: txt })),
        atual === k ? el('i', { className: 'dc-estilo__ok' }, icon('check')) : '')
      if (host) b.addEventListener('click', () => aplicaEstilo(on))
      return b
    }))
    // regras
    const ligadas = ORDEM_REGRAS.filter(k => op[k]).length
    const regras = el('div', { className: 'dc-regras' }, ...ORDEM_REGRAS.map((k, i) => {
      const [nm, longa] = OPCOES.find(o => o[0] === k).slice(1), [grupo, curta, cs, selo] = REGRAS[k]
      const preso = k === 'trocaLivre' && !op.seteTroca && !op.zero
      const b = el('button', { type: 'button', className: `dc-regra dc-regra--${grupo.toLowerCase()}` + (op[k] ? ' on' : '') + (preso ? ' presa' : '') + (era && era[k] !== op[k] ? ' mudou' : ''),
        disabled: !host || preso, title: preso ? 'Ligue o 7 troca de mão ou o 0 gira as mãos primeiro.' : longa, 'aria-pressed': String(!!op[k]), style: `--k:${i}` },
        el('span', { className: 'dc-regra__arte' }, leque(cs), selo ? SELO[selo]() : ''),
        el('span', { className: 'dc-regra__txt' }, el('small', { className: 'dc-regra__grupo', textContent: grupo }), el('b', { textContent: nm }), el('span', { textContent: preso ? 'Precisa do 7 ou do 0.' : curta })),
        el('i', { className: 'dc-regra__chave', 'aria-hidden': 'true' }))
      if (host && !preso) b.addEventListener('click', () => { G.op[k] = !G.op[k]; som(G.op[k] ? 'poe' : 'clique', 0, .6); difunde() })
      return b
    }))
    // tempo por vez
    const tempos = el('div', { className: 'dc-tempo', role: 'radiogroup', 'aria-label': 'Tempo por vez' }, el('span', { className: 'dc-tempo__ic' }, icon('clock')),
      ...TEMPOS.map(t => {
        const on = (op.tempo || 0) === t
        const b = el('button', { type: 'button', className: 'dc-tempo__op' + (on ? ' on' : ''), textContent: t ? `${t}s` : 'Livre', disabled: !host, role: 'radio', 'aria-checked': String(on), title: t ? `${t} segundos por vez; acabou, compra e passa` : 'Sem limite de tempo' })
        if (host) b.addEventListener('click', () => { G.op.tempo = t; som('clique'); difunde() })
        return b
      }))
    // quem está na mesa
    const ks = [...new Set([me.key, ...Object.keys(V.conv)])].filter(k => k === me.key || pres.has(k))
    const roda = el('div', { className: 'dc-roda' }, ...ks.map(k => {
      const st = V.conv[k] || '?'
      return el('span', { className: `dc-roda__p dc-roda__p--${st}`, title: `${N(k)}: ${st === 'sim' ? 'vai jogar' : st === 'nao' ? 'só assiste' : 'decidindo…'}` },
        retrato(k, N(k)), el('small', { textContent: k === me.key ? 'Você' : N(k) }), st === 'nao' ? el('i', {}, icon('eye')) : st === '?' ? el('i', { textContent: '…' }) : '')
    }))
    const euJogo = V.conv[me.key] === 'sim'
    // quem foi chamado e ainda não respondeu: as duas opções, bem visíveis
    const decide = !host && (V.conv[me.key] || '?') === '?'
    const eu_ = decide ? el('span', { className: 'dc-linha dc-lobby__decide' }, botao('Só assistir', () => manda({ op: 'resp', sim: false }), 'dc-btn--leve'), botao([icon('gamepad-2'), 'Jogar'], () => manda({ op: 'resp', sim: true }), 'dc-btn--forte dc-btn--grande'))
      : botao(euJogo ? [icon('eye'), 'Só assistir'] : [icon('gamepad-2'), 'Quero jogar'], () => {
      if (host) { G.conv[me.key] = euJogo ? 'nao' : 'sim'; difunde() } else manda({ op: 'resp', sim: !euJogo })
    }, 'dc-btn--leve dc-btn--peq', euJogo ? 'Sair da partida e só assistir' : 'Entrar na partida')
    const ir = host ? botao([icon('play'), jogam.length >= 2 ? `Começar com ${jogam.length}` : 'Faltam jogadores'], comecar, 'dc-btn--forte dc-btn--grande dc-comecar')
      : el('span', { className: 'dc-espera' }, retrato(V.host, V.hostNome), el('span', {}, el('b', { textContent: V.hostNome }), ' escolhe as regras e começa'))
    if (host && jogam.length < 2) ir.disabled = true
    const titulo = el('header', { className: 'dc-lobby__topo' },
      el('div', {}, el('small', { textContent: host ? 'Monte a mesa' : 'Mesa sendo montada' }), el('h2', { textContent: atual ? ESTILOS.find(e => e[0] === atual)[1] : 'Personalizado' })),
      el('span', { className: 'dc-lobby__resumo' }, el('b', { textContent: ligadas }), ` regra${ligadas === 1 ? '' : 's'} da casa`, op.tempo ? ` · ${op.tempo}s por vez` : ' · tempo livre'),
      op.semPiedade ? botao([icon('book-open'), 'Cartas novas'], () => { guiaAberto = guiaAnima = true; render() }, 'dc-btn--leve dc-btn--peq') : '')
    return el('div', { className: 'dc-lobby' + (host ? ' host' : '') + (novo('lobby:' + V.id) ? ' entra' : '') },
      titulo, estilos,
      el('div', { className: 'dc-lobby__sec' }, el('small', { textContent: host ? 'Regras: toque para ligar ou desligar' : 'Regras' })),
      regras,
      el('footer', { className: 'dc-lobby__pe' }, tempos, roda, el('span', { className: 'dc-grow' }), eu_, ir))
  }
  function bilhete() {
    // chamaram você: o lobby já mostra Jogar / Só assistir; aqui só o som do convite chegando
    if (V.fase === 'convite' && !souHost() && V.conv[me.key] === '?' && novo('conv:' + V.id)) som('papel')
    return ''
  }
  function silencio() {
    if (!V.sil || V.fase !== 'jogo') return ''
    return el('div', { className: 'dc-silencio' + (novo(`sil:${V.id}:${V.descarte.at(-1)?.id}`) ? ' entra' : '') + (V.sil.resta > 0 ? ' graca' : '') },
      svg('shh'), el('b', { textContent: 'Silêncio' }), el('small', { textContent: 'quem falar compra 2 · mutado não conta' }))
  }

  /* ---------- animações ---------- */
  const noTela = n => { const r = n.getBoundingClientRect(), t = tela.getBoundingClientRect(); return { x: r.left - t.left + r.width / 2, y: r.top - t.top + r.height / 2, w: r.width, h: r.height } }
  const lugarDe = k => k === me.key ? tela.querySelector('.dc-mao') || tela.querySelector('.dc-eu') : tela.querySelector(`.dc-leque-mesa[data-mao="${CSS.escape(k)}"]`) || tela.querySelector(`.dc-assento[data-key="${CSS.escape(k)}"]`)
  const cqh = () => tela.clientHeight / 100
  // ponto de um voo: centro na tela e largura que a carta tem ali
  const ponto = (n, larg) => n?.isConnected ? { ...noTela(n), ...(larg ? { w: larg } : {}) } : null
  const largMesa = () => 4.6 * cqh() // carta do leque de quem está na mesa
  const corCss = c => (c && getComputedStyle(tela).getPropertyValue('--' + c).trim()) || '#f4f2ee'
  const fotoMao = () => M.fotos('.dc-mao'), flip = f => M.flip(f, '.dc-mao')
  const voo = M.voo, tremeMesa = M.treme
  const pousa = (id, sel) => { M.pousa(id, sel); if (sel === '.dc-descarte') boteco.balanca(.3) } // a mesa sente a carta pousar
  const impacto = (p, cor, forte) => { M.impacto(p, corCss(cor), forte, cor ? null : ['r', 'y', 'g', 'b'].map(corCss)); if (forte) boteco.balanca(1) }
  // seletor de cor em volta da pilha
  function posCores() {
    const c = tela.querySelector('.dc-cores'), d = tela.querySelector('.dc-descarte')
    if (!c || !d) return
    const p = noTela(d); c.style.left = p.x + 'px'; c.style.top = p.y + 'px'
  }
  // anel e facho giram num laço próprio (o render refaz a tela inteira e não pode zerar o giro)
  const VEL_ANEL = 24 // graus por segundo
  const giroMesa = M.criaGiro({ anel: '.dc-anelvez__giro', luz: '.dc-luz', vel: () => VEL_ANEL * (V?.dir || 1), ativo: () => !!V && emJogo(V.fase) })
  const anelInverte = () => giroMesa.inverte('.dc-anelvez')
  function miraLuz() {
    // a cor nova entra por cima da antiga
    if (antesRender?.id === V.id && antesRender.cor && antesRender.cor !== V.cor && !calmo())
      for (const n of tela.querySelectorAll('.dc-anelvez')) n.animate([{ color: corCss(antesRender.cor) }, { color: corCss(V.cor) }], { duration: 450, easing: 'ease' })
    const plano = tela.querySelector('.dc-plano'), vez = emJogo(V.fase) ? V.vez : null
    giroMesa.sincroniza(vez && plano ? M.anguloAte(plano, vez === me.key ? null : tela.querySelector(`.dc-assento[data-key="${CSS.escape(vez)}"]`)) : null)
  }
  function balao(k, txt, cls = '', at = 0) {
    setTimeout(() => {
      const alvo = k === me.key ? tela.querySelector('.dc-eu .dc-boneco') : tela.querySelector(`.dc-assento[data-key="${CSS.escape(k)}"] .dc-retrato`)
      if (!alvo) return
      const b = el('div', { className: `dc-balao ${cls}` }, txt); tela.append(b)
      const r = noTela(alvo), W = tela.clientWidth
      const dir = r.x < W * .58
      b.style.left = Math.max(6, Math.min(dir ? r.x + r.w / 2 + 8 : r.x - r.w / 2 - 8 - b.offsetWidth, W - b.offsetWidth - 6)) + 'px'
      b.style.top = Math.max(6, r.y - b.offsetHeight / 2 - (k === me.key ? r.h * .3 : 0)) + 'px'
      setTimeout(() => b.classList.add('sai'), 1800); setTimeout(() => b.remove(), 2200)
    }, at)
  }
  function anima(evs, antes) {
    // alguém ficou com 1 carta: um som baixo, uma vez
    if (antes && antes.id === V.id && V.fase === 'jogo' && V.js.some(x => x.n === 1 && antes.js.some(y => y.key === x.key && y.n !== 1))) som('golpe', 250, .45)
    // acumulado subiu: o selo pula e um "+2"/"+4" sobe dele
    if (antes && antes.id === V.id && V.pend > (antes.pend || 0)) setTimeout(() => {
      const p = tela.querySelector('.dc-pend'); if (!p) return
      p.classList.add('cresce'); som('leque', 0, .8)
      if (V.pend > 8) { const pl = tela.querySelector('.dc-palco'); if (pl) { pl.classList.remove('treme-mesa'); void pl.offsetWidth; pl.classList.add('treme-mesa'); setTimeout(() => pl.classList.remove('treme-mesa'), 700) } }
      const r = noTela(p), f = el('b', { className: 'dc-soma', textContent: `+${V.pend - (antes.pend || 0)}`, style: `left:${r.x}px;top:${r.y}px` })
      tela.append(f); setTimeout(() => f.remove(), 1100)
    }, 380)
    const desc = tela.querySelector('.dc-descarte'), monte = tela.querySelector('.dc-monte')
    // cartas que chegaram na minha mão (para voarem do monte até o lugar certo, virando no ar)
    const minhasNovas = antes && antes.id === V.id && V.mao && antes.mao ? V.mao.map(c => c.id).filter(id => !antes.mao.some(c => c.id === id)) : []
    let t = 0
    for (const e of evs) {
      const at = t
      if (e.t === 'inicio') { distribui(); t += 1800 }
      else if (e.t === 'joga') t += animaJogada(e, at, desc)
      else if (e.t === 'compra') t += animaCompra(e, at, monte, e.key === me.key ? minhasNovas.splice(0, e.qtd || 1) : [])
      else if (e.t === 'roleta') { som('embaralhar', at, .5); balao(e.key, e.achou ? `Roleta: ${e.qtd} até sair ${CORES[e.cor]}` : `Roleta: ${e.qtd} cartas`, 'forte', at + 300) }
      else if (e.t === 'descCor') { som('leque', at, .9); balao(e.key, `Descartou mais ${e.qtd} ${CORES[e.cor]}!`, 'leve', at + 200) }
      else if (e.t === 'fica') balao(e.key, e.o === '7' ? 'Fiquei com a minha' : 'Não girou', 'leve', at)
      else if (e.t === 'pula') { som('pular', at); balao(e.key, 'Pulou a vez', 'leve', at) }
      else if (e.t === 'pulaT') { som('pular', at); balao(e.key, 'Pulou todo mundo!', 'forte', at) }
      else if (e.t === 'estourou') { som('carimbo', at); toast(`${e.nome} estourou: ${e.qtd} cartas`, 3800) }
      else if (e.t === 'bate') som('clique', at)
      else if (e.t === 'bateSem') { som('golpe', at, .7); balao(e.key, 'Bateu sem 9: compra 1', 'forte', at); if (e.key === me.key) toast('Bateu sem 9: compra 1', 2600) }
      else if (e.t === 'bateFim') {
        bateRes = { k: e.k, lista: e.lista, faltou: e.faltou, compram: e.compram, qtd: e.qtd, ate: performance.now() + 2400 }
        som('carimbo', at, .6)
        for (const k of e.compram || []) balao(k, `+${e.qtd}`, 'forte', at + 500)
        setTimeout(() => { if (bateRes && bateRes.k === e.k) { bateRes = null; tela.querySelector('.dc-bateres')?.remove() } }, 2400)
        if (!tela.querySelector('.dc-bateres')) { tela.append(painelBate()); posBate() }
      }
      else if (e.t === 'inverte') { som('inverter', at); setTimeout(anelInverte, at + 250) }
      else if (e.t === 'gira') { som('leque', at); som('inverter', at + 150, .6); tela.querySelectorAll('.dc-leque-mesa').forEach(n => n.classList.add('girou')); tela.querySelector('.dc-mao')?.classList.add('girou') }
      else if (e.t === 'troca') { som('leque', at); balao(e.key, `Troquei com ${N(e.alvo)}!`, 'leve', at) }
      else if (e.t === 'corte') { som('carimbo', at, .8); balao(e.key, 'Corte!', 'forte', at) }
      else if (e.t === 'tempo') balao(e.key, 'Tempo esgotado', 'leve', at)
      else if (e.t === 'saiu') { toast(`${e.nome} saiu da mesa`, 3200); som('desliza', at, .6) }
      else if (e.t === 'ultima') { som('carimbo', at, .8); balao(e.key, 'Uno!', 'ultima', at) }
      else if (e.t === 'pegou') { som('carimbo', at); balao(e.por, `Pegou ${N(e.key)}!`, 'forte', at); balao(e.key, '+2', 'forte', at + 300) }
      else if (e.t === 'falou') { som('carimbo', at); balao(e.key, 'Falou no 7! +2', 'forte', at); setTimeout(() => { const r = e.key === me.key ? tela.querySelector('.dc-eu') : tela.querySelector(`.dc-assento[data-key="${CSS.escape(e.key)}"] .dc-medalha`); if (!r) return; const x = el('span', { className: 'dc-shh' }, svg('shh')); r.append(x); setTimeout(() => x.remove(), 2200) }, at) }
      else if (e.t === 'embaralha') som('embaralhar', at, .6)
      else if (e.t === 'vence') som('leque', at + 200)
    }
  }
  // jogada: a carta sai de quem jogou (a minha, do lugar exato na mão; a dos outros, do leque, virando no ar)
  // e pousa na pilha no giro dela. Ação, compra e várias de uma vez sobem alto e batem na mesa.
  const BATE = new Set(['+2', '+4', '+6', '+10', 'inv4', 'pula', 'pulaT', 'inverte', 'roleta', 'desc'])
  function animaJogada(e, at, desc) {
    const cs = e.cartas || [e.carta]
    if (!desc || !cs.length) return 0
    const meu = e.key === me.key, h = cqh()
    const ult = cs[cs.length - 1], forte = BATE.has(ult.v) || cs.length > 1
    const B = noTela(desc), origem = meu ? null : ponto(lugarDe(e.key), largMesa())
    const dur = forte ? 820 : 560, passo = forte ? 70 : 110
    if (cs.length > 1) som('leque', at, .9)
    cs.forEach((c, k) => {
      pousando.add(c.id)
      desc.querySelector(`.dc-carta[data-id="${c.id}"]`)?.classList.add('oculta')
      const A = meu ? (ultFotos.get(c.id) || ponto(tela.querySelector('.dc-mao'), 12 * h)) : origem
      const [dx, dy] = desvio(c.id), alvo = { x: B.x + dx * h, y: B.y + dy * h * .8, w: B.w }
      const ultima = k === cs.length - 1
      voo(c, A, alvo, { atraso: at + k * passo, dur, alto: 6 + (k % 2) * 2, lado: (k - (cs.length - 1) / 2) * 3.4, giro0: meu ? 0 : -giro(c.id) / 2, giro1: giro(c.id),
        vira: !meu, slam: forte, deita: true,
        bate: ultima && forte ? () => { impacto(B, e.cor || ult.c, true); som('golpe', 0, .75) } : null,
        fim: () => { pousa(c.id, '.dc-descarte'); if (!forte) { impacto(alvo, c.c || e.cor, false); som('poe', 0, .75) } } })
    })
    return passo * (cs.length - 1) + (forte ? dur * .7 : dur * .5)
  }
  // compra: as cartas descolam do topo do monte em rajada e voam em arco. As minhas viram no ar e encaixam no
  // lugar certo da mão; muitas viram uma chuva com contador que sobe a cada carta.
  function animaCompra(e, at, monte, ids = []) {
    const n = e.qtd || 1, eu_ = e.key === me.key, alvoGeral = lugarDe(e.key)
    if (!monte || !alvoGeral) { ids.forEach(id => pousa(id, '.dc-mao')); return 0 }
    const h = cqh(), muitas = n >= 4
    const voos = eu_ ? Math.max(ids.length, Math.min(n, 18)) : Math.min(n, muitas ? 18 : n)
    const passo = muitas ? Math.max(45, Math.min(95, 1300 / voos)) : 110
    const dur = muitas ? 600 : 520
    const topo = monte.querySelector('.dc-camada:last-of-type') || monte
    const A = ponto(topo, topo.getBoundingClientRect().width)
    // as minhas ficam escondidas até a carta voando chegar
    for (const id of ids) { pousando.add(id); const c = tela.querySelector(`.dc-mao .dc-carta[data-id="${id}"]`); c?.classList.add('oculta'); c?.classList.remove('chegou') }
    if (muitas) setTimeout(() => apanha(e.key, n), at)
    for (let i = 0; i < voos; i++) {
      const k = Math.round((i + 1) * n / voos), id = ids[i]
      const slot = id != null ? tela.querySelector(`.dc-mao .dc-carta[data-id="${id}"]`) : null
      const B = slot ? ponto(slot, slot.offsetWidth) : ponto(alvoGeral, eu_ ? 12 * h : largMesa())
      if (B && !slot && muitas) B.x += (i % 5 - 2) * 1.6 * h
      const c = id != null ? V.mao?.find(x => x.id === id) : null
      // o topo do monte dá um saltinho antes de soltar a carta
      if (i === 0 && !calmo()) setTimeout(() => topo.animate?.([{ translate: '0 0' }, { translate: '0 -1.2cqh' }, { translate: '0 0' }], { duration: 220, easing: 'ease-out' }), at)
      voo(c || null, A, B, { atraso: at + i * passo, dur, alto: muitas ? 9 + (i % 4) * 2.5 : 5, lado: muitas ? (i % 3 - 1) * 3 : 0, giro0: rnd(20) - 10, giro1: slot ? parseFloat(slot.parentElement?.style.getPropertyValue('--rz')) || 0 : rnd(24) - 12, vira: !!c,
        fim: () => { if (id != null) pousa(id, '.dc-mao'); if (muitas) { contador(e.key, k, n, i === voos - 1); boteco.balanca(.22) } } })
      if (!eu_ || i > 0) som('desliza', at + i * passo, (eu_ ? .9 : .7) * (muitas ? .8 : 1))
    }
    // ids que sobraram (mais cartas que voos): aparecem junto com o último
    if (ids.length > voos) setTimeout(() => ids.slice(voos).forEach(id => pousa(id, '.dc-mao')), at + voos * passo + dur)
    if (!muitas && n > 1) balao(e.key, `+${n}`, 'leve', at + voos * passo)
    return voos * passo + (muitas ? dur : dur * .4)
  }
  // contador "+N" em cima de quem está comprando: sobe a cada carta que chega
  function contador(k, qtd, total, ultimo) {
    const alvo = k === me.key ? tela.querySelector('.dc-mao') || tela.querySelector('.dc-eu') : tela.querySelector(`.dc-assento[data-key="${CSS.escape(k)}"] .dc-retrato`)
    if (!alvo) return
    let c = tela.querySelector(`.dc-contador[data-key="${CSS.escape(k)}"]`)
    if (!c) {
      c = el('div', { className: 'dc-contador' + (total >= 10 ? ' enorme' : ''), 'data-key': k }); tela.append(c)
      const r = noTela(alvo)
      c.style.left = r.x + 'px'; c.style.top = Math.max(60, r.y - r.h * (k === me.key ? .55 : .75)) + 'px'
    }
    c.textContent = `+${qtd}`
    c.classList.remove('bate'); void c.offsetWidth; c.classList.add('bate')
    clearTimeout(c._t)
    if (ultimo) { c.classList.add('fim'); som('carimbo', 0, .7) }
    c._t = setTimeout(() => { c.classList.add('sai'); setTimeout(() => c.remove(), 400) }, ultimo ? 1500 : 900)
  }
  // quem vai comprar muito: a foto treme e acende em vermelho; com muitas, a mesa toda sacode
  function apanha(k, n) {
    const alvo = k === me.key ? tela.querySelector('.dc-eu') : tela.querySelector(`.dc-assento[data-key="${CSS.escape(k)}"]`)
    if (alvo) { alvo.classList.remove('apanha'); void alvo.offsetWidth; alvo.classList.add('apanha'); setTimeout(() => alvo.classList.remove('apanha'), 1600) }
    if (n >= 8) { const pl = tela.querySelector('.dc-palco'); if (pl) { pl.classList.remove('treme-mesa'); void pl.offsetWidth; pl.classList.add('treme-mesa'); setTimeout(() => pl.classList.remove('treme-mesa'), 700) } }
  }
  function distribui() {
    const monte = tela.querySelector('.dc-monte')
    if (!monte) { entregando = false; return }
    som('embaralhar')
    monte.classList.add('embaralhando')
    setTimeout(() => {
      monte.classList.remove('embaralhando')
      const topo = monte.querySelector('.dc-camada:last-of-type') || monte, A = ponto(topo, topo.getBoundingClientRect().width)
      // uma volta na mesa por vez, como quem dá as cartas
      const mao = [...tela.querySelectorAll('.dc-mao .dc-carta')], leques = [...tela.querySelectorAll('.dc-leque-mesa')].map(l => [...l.querySelectorAll('.dc-carta')])
      const filas = [mao, ...leques], ordem = []
      for (let r = 0; r < 7; r++) for (const f of filas) if (f[r]) ordem.push([f[r], f === mao])
      ordem.forEach(([n, minha], k) => {
        const id = minha ? +n.dataset.id : null, c = minha ? V.mao?.find(x => x.id === id) : null
        voo(c, A, ponto(n, minha ? n.offsetWidth : largMesa()), { atraso: k * 38, dur: 460, alto: 4, giro0: rnd(30) - 15, vira: !!c,
          fim: () => { n.classList.remove('oculta'); if (k % 3 === 0) som('desliza', 0, .5) } })
      })
      setTimeout(() => { entregando = false; tela.querySelectorAll('.dc-carta.oculta').forEach(n => { if (!pousando.has(+n.dataset.id)) n.classList.remove('oculta') }) }, ordem.length * 38 + 700)
    }, 1100)
  }
  ;(function loop() {
    if (V) {
      const pres = new Set(ctx.presentes())
      for (const s of tela.querySelectorAll('.dc-assento[data-key], .dc-eu[data-key]')) { s.classList.toggle('fala', !!ctx.falando?.(s.dataset.key)); s.classList.toggle('caiu', !pres.has(s.dataset.key)) }
      for (const tm of tela.querySelectorAll('[data-fim]')) {
        const r = Math.max(0, +tm.dataset.fim - Date.now()), tot = +tm.dataset.tot || 1
        tm.style.setProperty('--t', String(r / tot)); tm.classList.toggle('fim', r < 3000)
        // tique nos 3 s finais da sua vez
        if (tm.classList.contains('dc-pavio') && r > 0 && r <= 3000) { const sx = Math.ceil(r / 1000); if (tm.dataset.tic !== String(sx)) { tm.dataset.tic = String(sx); som('tique', 0, sx === 1 ? 1.25 : 1) } }
      }
    }
    setTimeout(() => requestAnimationFrame(loop), 120)
  })()
  document.addEventListener('keydown', e => {
    if (!V) return
    if (temaAberto) {
      teclaTemas(e)
      return
    }
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
    if (e.key === 'Escape' && (escolheCor || sel.length)) { escolheCor = false; sel = []; render() }
    else if (e.key === 'Enter' && sel.length && !escolheCor) { e.preventDefault(); enviar() }
    else if ((e.key === ' ' || e.code === 'Space') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && V.op.bate && V.fase === 'jogo' && eu() && tela.getClientRects().length && !e.target.closest?.('select, [contenteditable], button, a')) {
      e.preventDefault()
      if (V.bate) bater(); else bateSemNove()
    }
  })
  // informação no hover
  const dica = el('div', { className: 'dc-info', hidden: true })
  tela.addEventListener('pointermove', e => {
    const a = e.target.closest?.('[data-info]')
    if (!a || !tela.contains(a)) { dica.hidden = true; return }
    if (dica.parentNode !== tela) tela.append(dica)
    const txt = a.getAttribute('data-info')
    if (dica.dataset.txt !== txt) { dica.dataset.txt = txt; const [t, ...rs] = txt.split('\n'); dica.replaceChildren(el('b', { textContent: t }), ...rs.map(r => el('span', { textContent: r }))) }
    dica.hidden = false
    const r = tela.getBoundingClientRect()
    dica.style.left = Math.min(e.clientX - r.left + 14, r.width - dica.offsetWidth - 8) + 'px'
    dica.style.top = Math.max(8, e.clientY - r.top - dica.offsetHeight - 12) + 'px'
  })
  tela.addEventListener('pointerleave', () => { dica.hidden = true })

  function iniciar(chamados) {
    carregaSons()
    if (V && !souHost()) return toast(`Já tem uma mesa de Uno aberta (de ${V.hostNome})`)
    if (G) return toast('A mesa já está aberta')
    abrir(chamados)
  }
  window.__descarte = () => ({ G, V, render, difunde, boteco })
  return {
    got: (d, k) => { carregaSons(); got(d, k) }, iniciar, ativo: () => !!V,
    // para o app: troca de jogo e mesas paralelas
    lider: () => !!V && souHost(),
    encerra: () => { if (G && G.host === me.key) encerrar() },
    sair: () => { if (!V) return; if (G && G.host === me.key) return encerrar(); manda({ op: 'sai' }); dispensado = V.id; aplica(null) },
    jogadores: () => !V ? [] : V.fase === 'convite' || !V.js?.length ? Object.keys(V.conv || {}).filter(k => V.conv[k] === 'sim') : V.js.filter(j => !j.fora).map(j => j.key),
    entrouAlguem: key => { if (!G || G.host !== me.key) return; if (G.fase === 'convite' && !(key in G.conv)) { G.conv[key] = '?'; return difunde() } ctx.sendTo(key, { dc: { v: vista(key) } }) },
  }
}
