// Uno: jogo de cartas de descarte (combine cor ou número). Mesma estrutura do Coup:
// o host guarda o baralho e as mãos e manda para cada pessoa só o que ela pode ver, pela action 'jogo' ({ dc: ... }).
// Dá para jogar várias cartas iguais de uma vez (a última escolhida fica por cima).
// Regras opcionais: acumular +2/+4, comprar até poder jogar, penalidade por não avisar a última
// e o 7 do silêncio (depois de um 7, quem falar na call antes da próxima carta compra 2).

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

// ícone do botão de ordenar: três cartinhas (por cor: agrupadas por cor; por número: 1 2 3)
const ICONE_COR = '<svg viewBox="0 0 32 24"><rect x="2" y="4" width="11" height="16" rx="2" fill="#e5484d" transform="rotate(-10 7 12)"/><rect x="10.5" y="3" width="11" height="16" rx="2" fill="#e5484d" opacity=".75"/><rect x="19" y="4" width="11" height="16" rx="2" fill="#3a8ee6" transform="rotate(10 25 12)"/></svg>'
const ICONE_NUM = '<svg viewBox="0 0 32 24" font-family="Bricolage Grotesque, Inter, sans-serif" font-weight="800" font-size="8" text-anchor="middle"><g transform="rotate(-10 7 12)"><rect x="2" y="4" width="11" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><text x="7.5" y="15" fill="currentColor">1</text></g><rect x="10.5" y="3" width="11" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><text x="16" y="14" fill="currentColor">2</text><g transform="rotate(10 25 12)"><rect x="19" y="4" width="11" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><text x="24.5" y="15" fill="currentColor">3</text></g></svg>'

export function criaDescarte(ctx) {
  const { icon, toast, sysMsg, me } = ctx
  const tela = ctx.tela
  const el = (tag, props = {}, ...kids) => {
    const dados = {}, resto = {}
    for (const [k, v] of Object.entries(props)) (k.startsWith('data-') ? dados : resto)[k] = v
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
    G.js = ks.map(k => ({ key: k, nome: ctx.nomeDe(k), mao: G.monte.splice(-7), avisou: false, pegavel: false }))
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
  function compra(j, n, semAviso) {
    const novas = []
    for (let k = 0; k < n; k++) { repoe(); const c = G.monte.pop(); if (!c) break; j.mao.push(c); novas.push(c) }
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
    }
  }
  function vista(k) {
    const t = G.descarte.slice(-5)
    return {
      id: G.id, seq: G.seq, host: G.host, hostNome: G.hostNome, fase: G.fase, op: G.op, conv: G.conv, placar: G.placar,
      js: G.js.map(j => ({ key: j.key, nome: j.nome, n: j.mao.length, avisou: j.avisou, pegavel: j.pegavel })),
      mao: jog(k)?.mao || null, descarte: t, cor: G.cor, dir: G.dir, vez: G.js[G.vez]?.key || null, monte: G.monte.length,
      bate: G.bate ? { k: G.bate.k, resta: Math.max(0, G.bate.ate - Date.now()), bateram: Object.keys(G.bate.rt) } : null,
      pend: G.pend, pendTipo: G.pendTipo, compradas: G.js[G.vez]?.key === k ? G.compradas || 0 : 0, lim: limite(),
      sil: G.sil ? { resta: Math.max(0, GRACA_7 - (Date.now() - G.sil.desde)), falaram: G.sil.falaram } : null,
      vencedor: G.vencedor || null, log: G.log.slice(-40), ev: G.ev, prazo: G.prazo ? Math.max(0, G.prazo - Date.now()) : 0,
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
  let V = null, ultEv = 0, dispensado = '', escolheCor = false, entregando = false, sel = [], ordem = ls.get('dc.ordem') || 'cor'
  const vistos = new Set()
  let guiaAberto = false, guiaAnima = false
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
  function simbolo(v) {
    if (v in SVG) return svg(v)
    return el('span', { className: 'dc-num' + (v.length > 1 ? ' dc-num--mais' : ''), textContent: v })
  }
  function carta(c, cls = '') {
    if (!c) return el('div', { className: `dc-carta costas ${cls}` }, el('span', { className: 'dc-marca', textContent: 'Uno' }), el('i', { className: 'dc-faixas' }))
    const cor = c.c || 'k'
    const canto = () => c.c ? simbolo(c.v) : c.v === 'roleta' ? svg('roleta') : svg('cor')
    const meio = c.v === 'inv4' ? [svg('inverte', 'dc-fundo'), el('span', { className: 'dc-num dc-num--mais', textContent: '+4' })]
      : COMPRA_COR(c.v) ? [svg('cor', 'dc-aro'), el('span', { className: 'dc-num dc-num--mais' + (c.v.length > 2 ? ' dc-num--dez' : ''), textContent: c.v })]
      : simbolo(c.v)
    return el('div', { className: `dc-carta dc-${cor} ${cls}`, 'data-v': c.v, 'data-id': c.id == null ? '' : String(c.id) },
      el('span', { className: 'dc-canto' }, canto()),
      el('span', { className: 'dc-meio' }, meio),
      el('span', { className: 'dc-canto dc-canto--b' }, canto()))
  }
  const retrato = (k, nm, cls = '') => el('span', { className: `dc-retrato ${cls}` }, ctx.pfp(k, 64, nm))
  const giro = id => ((id * 47) % 31) - 15 // rotação fixa de cada carta no monte

  function angulos(n, comigo) {
    if (!comigo) return Array.from({ length: n }, (_, i) => 90 + 180 / n + i * 360 / n)
    if (n === 1) return [270]
    const span = Math.min(220, 72 * (n - 1)), a0 = 270 - span / 2
    return Array.from({ length: n }, (_, i) => a0 + i * span / (n - 1))
  }
  const pos = (ang, rx, ry) => ({ x: 50 + rx * Math.cos(ang * Math.PI / 180), y: 50 + ry * Math.sin(ang * Math.PI / 180) })

  /* ---------- render ---------- */
  function render(antes) {
    tela.classList.toggle('dc--on', !!V)
    ctx.onAtivo?.(!!V)
    if (!V) { tela.replaceChildren(); vistos.clear(); return }
    const conv = V.fase === 'convite', j = eu()
    const lugares = conv ? Object.keys(V.conv).filter(k => k !== me.key).map(k => ({ key: k, nome: ctx.nomeDe(k), conv: V.conv[k] }))
      : (() => { const js = V.js; const i = js.findIndex(x => x.key === me.key); return i < 0 ? js : [...js.slice(i + 1), ...js.slice(0, i)] })()
    const angs = angulos(lugares.length, conv || !!j)
    const plano = el('div', { className: 'dc-plano' }, el('div', { className: 'dc-feltro' }), conv ? '' : centro())
    lugares.forEach((x, n) => plano.append(...assento(x, angs[n])))
    const topoBar = el('header', { className: 'dc-topo' },
      el('img', { className: 'dc-logo dc-logo--oficial', src: 'jogos/uno/logo.svg', alt: 'Uno' }),
      el('span', { className: 'dc-grow' }),
      botao(icon('list-music'), () => tela.querySelector('.dc-log')?.classList.toggle('aberto'), 'dc-btn--ic', 'O que aconteceu'),
      souHost() ? botao(icon('x'), e => confirma(e.currentTarget, 'Fechar a mesa?', encerrar), 'dc-btn--ic', 'Fechar a mesa para todos')
        : botao(icon('x'), () => { dispensado = V.id; aplica(null) }, 'dc-btn--ic', 'Sair da mesa (só para você)'))
    if (V.op.semPiedade) topoBar.insertBefore(botao(icon('book-open'), () => { guiaAberto = !guiaAberto; guiaAnima = guiaAberto; render() }, 'dc-btn--ic' + (guiaAberto ? ' on' : ''), 'Cartas do Sem Piedade'), topoBar.querySelector('.dc-grow').nextSibling)
    plano.classList.toggle('jogando', emJogo(V.fase))
    const kids = [el('div', { className: 'dc-palco' }, plano), topoBar, vezFaixa(antes), minhaArea(antes), controles(), meio(), silencio(), bilhete(), quadro(), ...bateUI(), guia(),
      el('div', { className: 'dc-log' }, el('ol', {}, ...V.log.slice(-40).map(t => el('li', { textContent: t }))))]
    if (!conv && V.fase !== 'fim' && !ctx.presentes().includes(V.host)) kids.push(el('div', { className: 'dc-pausa' }, el('b', { textContent: 'Partida pausada' }), el('span', { textContent: `${V.hostNome} abriu a mesa e caiu. Continua de onde parou quando voltar.` })))
    tela.replaceChildren(...kids)
    tela.classList.toggle('acabou', V.fase === 'fim')
    ctx.hydrate(tela)
    if (entregando) tela.querySelectorAll('.dc-mao .dc-carta, .dc-leque-mesa .dc-carta').forEach(n => n.classList.add('oculta'))
    tela.querySelector('.dc-log ol')?.scrollTo(0, 1e6)
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
    const monte = el('div', { className: 'dc-monte' + (podeComprar ? ' pode' : ''), 'data-info': `Monte: ${V.monte} cartas${podeComprar ? (V.pend ? `\nClique para comprar ${V.pend}` : '\nClique para comprar') : ''}` },
      ...Array.from({ length: Math.min(6, Math.max(1, Math.ceil(V.monte / 18))) }, (_, i) => carta(null, `dc-pilha-i`)).map((n, i) => { n.style.setProperty('--i', i); return n }))
    if (podeComprar) monte.addEventListener('click', () => { som('desliza'); manda({ op: 'compra' }) })
    const desc = el('div', { className: `dc-descarte dc-cor-${V.cor}`, 'data-info': `Mesa: ${CORES[V.cor]}${V.pend ? `\nAcumulado: +${V.pend}` : ''}` },
      el('i', { className: 'dc-aura' }),
      ...V.descarte.map((c, i) => { const n = carta(c, 'dc-no-monte'); n.style.setProperty('--giro', giro(c.id) + 'deg'); n.style.setProperty('--i', i); return n }),
      V.pend ? el('b', { className: 'dc-pend', textContent: `+${V.pend}` }) : '')
    if (minha) desc.addEventListener('click', () => enviar())
    return el('div', { className: 'dc-centro' }, el('div', { className: `dc-sentido ${V.dir > 0 ? 'hora' : 'anti'}` }, svg('seta')), monte, desc)
  }
  function assento(x, ang) {
    const P = pos(ang, 45, 41), C = pos(ang, 29, 25.5)
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
    const n = Math.min(x.n, 14)
    const leque = el('div', { className: 'dc-leque-mesa', style: `left:${C.x}%;top:${C.y}%;--rot:${ang - 90}deg;--n:${n}`, 'data-mao': x.key, 'data-info': `${x.nome}: ${x.n} carta${x.n === 1 ? '' : 's'}` },
      ...Array.from({ length: n }, (_, i) => { const c = carta(null); c.style.setProperty('--i', i); return c }),
      el('b', { className: 'dc-qtd', textContent: x.n }))
    return [leque, s]
  }
  function minhaArea(antes) {
    const j = eu(), conv = V.fase === 'convite'
    const bon = ctx.boneco?.(me.key)
    const minha = V.fase === 'jogo' && V.vez === me.key
    const area = el('div', { className: 'dc-eu' + (emJogo(V.fase) && V.vez === me.key ? ' vez' : '') + (V.vencedor === me.key ? ' vencedor' : '') + (V.fase === 'jogo' && V.mao?.length === 1 ? ' um' : ''), 'data-key': me.key },
      bon ? el('img', { className: 'dc-boneco', src: bon, alt: '', draggable: false }) : el('div', { className: 'dc-boneco dc-boneco--pfp' }, retrato(me.key, me.name)))
    if (conv) { if (V.conv[me.key]) area.append(el('small', { className: `dc-conv dc-conv--${V.conv[me.key]}`, textContent: V.conv[me.key] === 'sim' ? 'você vai jogar' : 'você só assiste' })); return area }
    if (!j || !V.mao) { area.append(el('small', { className: 'dc-dica', textContent: 'assistindo' })); return area }
    const ids = new Set((antes?.mao || []).map(c => c.id))
    const porCor = (a, b) => ('rygbk'.indexOf(a.c || 'k') - 'rygbk'.indexOf(b.c || 'k')) || ordemV(a.v) - ordemV(b.v)
    const ordenada = V.mao.slice().sort(ordem === 'cor' ? porCor : (a, b) => ordemV(a.v) - ordemV(b.v) || porCor(a, b))
    const duas = ordenada.length > 16, meio = Math.ceil(ordenada.length / 2)
    const mao = el('div', { className: 'dc-mao' + (duas ? ' duas' : ''), style: `--n:${duas ? meio : ordenada.length}` },
      ...ordenada.map((c, i) => {
        const ordem = sel.indexOf(c.id)
        const pode = minha && !sel.length && serveCli(c)
        const n = carta(c, (ordem >= 0 ? 'escolhida' : pode ? 'pode' : minha && !sel.length ? 'nao' : '') + (antes && antes.id === V.id && !ids.has(c.id) ? ' chegou' : ''))
        n.style.setProperty('--i', duas ? (i < meio ? i : i - meio) : i)
        if (duas && i < meio) n.classList.add('atras')
        if (minha || (V.op.corte && V.fase === 'jogo')) {
          n.addEventListener('click', () => clicaCarta(c))
          n.addEventListener('dblclick', () => { if (sel.length === 1 && sel[0] === c.id) enviar() })
        }
        return n
      }))
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
  function tremer(id) { const n = tela.querySelector(`.dc-mao .dc-carta[data-id="${id}"]`); n?.classList.remove('treme'); void n?.offsetWidth; n?.classList.add('treme') }
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
      return el('div', { className: 'dc-cores' }, el('small', { textContent: 'Escolha a cor' }),
        el('div', { className: 'dc-cores__cartas' }, ...Object.entries(CORES).map(([k, nm], i) => {
          const b = el('button', { type: 'button', className: `dc-carta dc-${k} dc-corcarta`, title: nm, style: `--i:${i - 1.5}` }, el('span', { className: 'dc-corcarta__nome', textContent: nm }))
          b.addEventListener('click', () => enviar(k))
          return b
        })),
        botao('Cancelar', () => { escolheCor = false; render() }, 'dc-btn--leve'))
    }
    return ''
  }
  // de quem é a vez: faixa no alto com a foto, o que a pessoa precisa fazer e quem vem depois
  function vezFaixa(antes) {
    if (!emJogo(V.fase) || !V.vez) return ''
    const minha = V.vez === me.key, i = V.js.findIndex(x => x.key === V.vez), n = V.js.length
    const prox = n > 1 ? V.js[((i + V.dir) % n + n) % n] : null
    const acao = V.fase === 'troca7' ? (minha ? 'escolha com quem trocar' : 'escolhendo com quem trocar')
      : V.fase === 'gira0' ? (minha ? 'gira as mãos ou não?' : 'decidindo se gira as mãos')
      : V.pend ? `+${V.pend} acumulado` : ''
    const mudou = antes?.vez !== V.vez || antes?.fase !== V.fase
    return el('div', { className: 'dc-vezfaixa' + (minha ? ' minha' : '') + (mudou ? ' entra' : '') + (V.pend && V.fase === 'jogo' ? ' perigo' : '') },
      retrato(V.vez, N(V.vez)),
      el('span', { className: 'dc-vezfaixa__txt' }, el('b', { textContent: minha ? 'Sua vez' : `Vez de ${N(V.vez)}` }), acao ? el('small', { textContent: acao }) : ''),
      prox && prox.key !== V.vez ? el('span', { className: 'dc-vezfaixa__prox', title: 'Quem joga depois' }, el('small', { textContent: 'depois' }), retrato(prox.key, N(prox.key)), el('em', { textContent: N(prox.key) })) : '')
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
  function convite() {
    const host = souHost()
    const n = Object.entries(V.conv).filter(([k, v]) => v === 'sim' && ctx.presentes().includes(k)).length
    const ops = el('div', { className: 'dc-ops' }, ...OPCOES.map(([k, nm, dica]) => {
      const on = V.op[k]
      const b = el('button', { type: 'button', className: 'dc-op' + (on ? ' on' : ''), title: dica, disabled: !host }, el('i'), el('span', { textContent: nm }))
      if (host) b.addEventListener('click', () => { G.op[k] = !G.op[k]; som('clique'); difunde() })
      return b
    }))
    if (V.op.semPiedade) ops.append(botao([icon('book-open'), 'Ver as cartas novas'], () => { guiaAberto = guiaAnima = true; render() }, 'dc-btn--leve dc-guia-btn'))
    const exemplo = el('div', { className: 'dc-exemplo' }, ...[{ id: 1, c: 'r', v: '7' }, { id: 2, c: 'b', v: 'inverte' }, { id: 3, c: null, v: '+4' }, { id: 4, c: 'y', v: '+2' }, { id: 5, c: 'g', v: 'pula' }].map((c, i) => { const x = carta(c); x.style.setProperty('--i', i - 2); return x }))
    const ir = host ? botao(n >= 2 ? `Começar · ${n}` : 'Esperando jogadores', comecar, 'dc-btn--forte dc-btn--grande') : el('small', { className: 'dc-espera', textContent: `${V.hostNome} vai começar` })
    if (host && n < 2) ir.disabled = true
    const tempos = el('div', { className: 'dc-tempos' }, el('small', { textContent: 'tempo por vez' }), ...TEMPOS.map(t => {
      const on = (V.op.tempo || 0) === t
      if (!host) return el('span', { className: on ? 'on' : '', textContent: t ? `${t}s` : 'sem' })
      return botao(t ? `${t}s` : 'sem', () => { G.op.tempo = t; difunde() }, on ? 'on' : '')
    }))
    return el('div', { className: 'dc-convite' }, exemplo, ops, tempos,
      el('div', { className: 'dc-linha' }, host ? botao(V.conv[me.key] === 'sim' ? 'Eu jogo' : 'Eu só assisto', () => { G.conv[me.key] = G.conv[me.key] === 'sim' ? 'nao' : 'sim'; difunde() }, 'dc-btn--leve') : '', ir))
  }
  function bilhete() {
    if (V.fase !== 'convite' || souHost() || V.conv[me.key] !== '?') return ''
    const entra = novo('conv:' + V.id)
    if (entra) som('papel')
    return el('div', { className: 'dc-bilhete' + (entra ? ' entra' : '') },
      el('div', { className: 'dc-linha dc-linha--esq' }, retrato(V.host, V.hostNome), el('span', {}, el('b', { textContent: V.hostNome }), ' chamou você para o Uno')),
      el('div', { className: 'dc-linha' }, botao('Jogar', () => manda({ op: 'resp', sim: true }), 'dc-btn--forte'), botao('Só assistir', () => manda({ op: 'resp', sim: false }), 'dc-btn--leve')))
  }
  function silencio() {
    if (!V.sil || V.fase !== 'jogo') return ''
    return el('div', { className: 'dc-silencio' + (novo(`sil:${V.id}:${V.descarte.at(-1)?.id}`) ? ' entra' : '') + (V.sil.resta > 0 ? ' graca' : '') },
      svg('shh'), el('b', { textContent: 'Silêncio' }), el('small', { textContent: 'quem falar compra 2 · mutado não conta' }))
  }

  /* ---------- animações ---------- */
  const noTela = n => { const r = n.getBoundingClientRect(), t = tela.getBoundingClientRect(); return { x: r.left - t.left + r.width / 2, y: r.top - t.top + r.height / 2, w: r.width, h: r.height } }
  const lugarDe = k => k === me.key ? tela.querySelector('.dc-mao') || tela.querySelector('.dc-eu') : tela.querySelector(`.dc-leque-mesa[data-mao="${CSS.escape(k)}"]`) || tela.querySelector(`.dc-assento[data-key="${CSS.escape(k)}"]`)
  function voa(de, para, conteudo, { dur = 420, atraso = 0, rot = 0, fim } = {}) {
    setTimeout(() => {
      if (!de || !para) return
      const A = noTela(de), B = noTela(para)
      const n = conteudo; n.classList.add('dc-voa'); tela.append(n)
      n.animate([{ transform: `translate(${A.x}px,${A.y}px) translate(-50%,-50%) rotate(${rot - 25}deg) scale(.8)` }, { transform: `translate(${B.x}px,${B.y}px) translate(-50%,-50%) rotate(${rot}deg) scale(1)` }], { duration: dur, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => { n.remove(); fim?.() }
    }, atraso)
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
    let t = 0
    for (const e of evs) {
      const at = t
      if (e.t === 'inicio') { distribui(); t += 1800 }
      else if (e.t === 'joga') {
        const cs = e.cartas || [e.carta]
        if (e.key !== me.key) {
          if (cs.length > 1) som('leque', at, .9)
          cs.forEach((c, k) => {
            som('poe', at + k * 130, .8)
            const n = desc?.querySelector(`.dc-carta[data-id="${c.id}"]`)
            if (n) { n.style.visibility = 'hidden'; voa(lugarDe(e.key), desc, carta(c), { atraso: at + k * 130, rot: giro(c.id), fim: () => { n.style.visibility = '' } }) }
          })
        } else cs.forEach((c, k) => { const n = desc?.querySelector(`.dc-carta[data-id="${c.id}"]`); if (n) { n.style.animationDelay = `${k * 90}ms`; n.classList.add('caiu') } })
        t += 120 + cs.length * 90
      }
      else if (e.t === 'compra') t += animaCompra(e, at, monte)
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
      else if (e.t === 'inverte') { som('inverter', at); tela.querySelector('.dc-sentido')?.classList.add('gira') }
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
  // compra: poucas cartas vão uma a uma; muitas viram uma chuva em arco com um contador que sobe a cada carta
  function animaCompra(e, at, monte) {
    const n = e.qtd || 1, alvo = lugarDe(e.key)
    if (!monte || !alvo) return 0
    const muitas = n >= 4, voos = Math.min(n, muitas ? 18 : n)
    const passo = muitas ? Math.max(45, Math.min(110, 1100 / voos)) : 150
    const dur = muitas ? 560 : 380
    if (muitas) setTimeout(() => apanha(e.key, n), at)
    for (let i = 0; i < voos; i++) {
      const k = Math.round((i + 1) * n / voos)
      voaArco(monte, alvo, carta(null), { atraso: at + i * passo, dur, alto: muitas ? 9 + (i % 4) * 2.5 : 4, espalha: muitas ? (i % 5 - 2) * 1.6 : 0, giro: muitas ? 540 : 180,
        fim: muitas ? () => contador(e.key, k, n, i === voos - 1) : null })
      if (e.key !== me.key || i > 0) som('desliza', at + i * passo, (e.key === me.key ? .9 : .7) * (muitas ? .8 : 1))
    }
    if (!muitas && n > 1) balao(e.key, `+${n}`, 'leve', at + voos * passo)
    return voos * passo + (muitas ? dur : 0)
  }
  function voaArco(de, para, n, { dur = 420, atraso = 0, alto = 6, espalha = 0, giro = 180, fim } = {}) {
    setTimeout(() => {
      if (!de?.isConnected || !para?.isConnected) return
      const A = noTela(de), B = noTela(para), h = tela.clientHeight / 100
      const bx = B.x + espalha * h, mx = (A.x + bx) / 2, my = Math.min(A.y, B.y) - alto * h
      n.classList.add('dc-voa'); tela.append(n)
      const r0 = rnd(30) - 15
      n.animate([
        { transform: `translate(${A.x}px,${A.y}px) translate(-50%,-50%) rotate(${r0}deg) scale(.85)`, opacity: .6 },
        { transform: `translate(${mx}px,${my}px) translate(-50%,-50%) rotate(${r0 + giro / 2}deg) scale(1.25)`, opacity: 1, offset: .45 },
        { transform: `translate(${bx}px,${B.y}px) translate(-50%,-50%) rotate(${r0 + giro}deg) scale(.9)`, opacity: 1 },
      ], { duration: dur, easing: 'cubic-bezier(.3,.6,.35,1)' }).onfinish = () => { n.remove(); fim?.() }
    }, atraso)
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
    const alvos = [...tela.querySelectorAll('.dc-mao .dc-carta, .dc-leque-mesa .dc-carta')]
    setTimeout(() => {
      monte.classList.remove('embaralhando')
      alvos.forEach((n, k) => voa(monte, n, carta(null), { atraso: k * 28, dur: 300, fim: () => { n.classList.remove('oculta'); if (k % 3 === 0) som('desliza', 0, .5) } }))
      setTimeout(() => { entregando = false; tela.querySelectorAll('.dc-carta.oculta').forEach(n => n.classList.remove('oculta')) }, alvos.length * 28 + 500)
    }, 1200)
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
    if (!V || e.target.closest?.('input, textarea, [contenteditable]')) return
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
  window.__descarte = () => ({ G, V, render, difunde })
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
