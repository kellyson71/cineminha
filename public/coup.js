// Coup na mesa da call (regras do jogo base, com a variante do Inquisidor).
// Quem abre a mesa é o host: guarda o estado completo (inclusive as cartas escondidas) e manda para cada
// pessoa só o que ela pode ver, pela action 'jogo' ({ coup: ... }). Os outros só mandam intenções.
// Tela: a tela do cinema vira a mesa. Você fica embaixo (seu boneco de costas), os outros em volta pela foto.
// Quem age "fala" num balão e levanta a carta que alega; os outros recebem um bilhete com tempo para duvidar.

const BASE = 'jogos/coup/'
const IMG = c => `${BASE}cartas/${c}.webp`
const PERS = {
  duque: { nome: 'Duque', art: 'o', cor: '#b4245f' },
  assassino: { nome: 'Assassino', art: 'o', cor: '#4a4a57' },
  capitao: { nome: 'Capitão', art: 'o', cor: '#2f7ea3' },
  embaixador: { nome: 'Embaixador', art: 'o', cor: '#2f8a5b' },
  inquisidor: { nome: 'Inquisidor', art: 'o', cor: '#b87a1f' },
  condessa: { nome: 'Condessa', art: 'a', cor: '#a3202f' },
}
const ACOES = {
  renda: { nome: 'Renda', fx: '+1 moeda', dica: 'Pega 1 moeda do Tesouro. Ninguém bloqueia.' },
  ajuda: { nome: 'Ajuda', fx: '+2 moedas', dica: 'Ajuda externa: pega 2 moedas. Quem diz ser Duque bloqueia.' },
  golpe: { nome: 'Golpe', fx: 'paga 7', custo: 7, alvo: true, dica: 'Golpe de Estado: paga 7 e o alvo perde uma influência. Não tem defesa.' },
  taxar: { nome: 'Taxar', fx: '+3 moedas', carta: 'duque', dica: 'Duque: pega 3 moedas.' },
  assassinar: { nome: 'Assassinar', fx: 'paga 3', custo: 3, alvo: true, carta: 'assassino', dica: 'Assassino: paga 3 e o alvo perde uma influência. A Condessa bloqueia.' },
  extorquir: { nome: 'Extorquir', fx: 'rouba 2', alvo: true, carta: 'capitao', dica: 'Capitão: pega 2 moedas de alguém. Capitão e Embaixador/Inquisidor bloqueiam.' },
  trocar: { nome: 'Trocar', fx: 'com a Corte', carta: 'embaixador', dica: 'Pega cartas da Corte e escolhe com quais ficar.' },
  investigar: { nome: 'Investigar', fx: 'vê 1 carta', alvo: true, carta: 'inquisidor', dica: 'Inquisidor: vê uma carta de alguém e pode obrigar a trocar.' },
}
// o que cada um "fala" ao agir
const FALA = {
  renda: () => 'Renda.', ajuda: () => 'Vou pedir ajuda externa.', golpe: a => `Golpe em ${a}!`,
  taxar: () => 'Vou taxar.', assassinar: a => `Vou assassinar ${a}.`, extorquir: a => `Vou extorquir ${a}.`,
  trocar: () => 'Vou trocar com a Corte.', investigar: a => `Vou investigar ${a}.`,
}
const TEMPOS = [5, 8, 12]
const DUVIDA_MS = 180000 // etapa de contestação: quem duvidou confirma ou desiste; vira sozinho só depois de 3 min
const SAIU_MS = 12000 // jogador sem conexão por esse tempo sai do jogo (cartas escondidas voltam para a Corte)
const HOST_MS = 10000 // quem abriu a mesa caiu: o sucessor assume depois disso
const SONS = ['tique', 'embaralhar', 'desliza1', 'desliza2', 'desliza3', 'poe1', 'poe2', 'descarta', 'leque', 'moeda', 'moedas', 'carimbo', 'punhal', 'golpe', 'papel', 'vez', 'clique']
const VOL = { tique: .28, embaralhar: .55, moeda: .5, moedas: .45, carimbo: .8, punhal: .55, golpe: .42, papel: .5, vez: .55, clique: .35 }

const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n }
const embaralha = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]] } return a }
const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch {} } }
const sou = c => `${PERS[c].art === 'a' ? 'a' : 'o'} ${PERS[c].nome}`

export function criaCoup(ctx) {
  const { icon, toast, sysMsg, me } = ctx
  // como o el() do app, mas os data-* viram atributos de verdade (os seletores dependem deles)
  const el = (tag, props = {}, ...kids) => {
    const dados = {}, resto = {}
    for (const [k, v] of Object.entries(props)) (k.startsWith('data-') ? dados : resto)[k] = v
    const n = ctx.el(tag, resto, ...kids.flat())
    for (const [k, v] of Object.entries(dados)) n.setAttribute(k, v)
    return n
  }
  const tela = ctx.tela

  /* =================================================================== host: o estado completo */
  let G = null, timer = 0, restaurou = false
  const ausDesde = new Map()
  const jog = k => G?.js.find(j => j.key === k)
  const vivos = () => G.js.filter(j => !j.fora)
  const vivas = j => j.cartas.map((c, i) => c.viva ? i : -1).filter(i => i >= 0)
  const nome = k => jog(k)?.nome || ctx.nomeDe(k)
  const cartaDe = a => a === 'trocar' ? (G.op.inq ? 'inquisidor' : 'embaixador') : ACOES[a]?.carta || null
  const bloqueiosDe = a => a === 'ajuda' ? ['duque'] : a === 'assassinar' ? ['condessa'] : a === 'extorquir' ? ['capitao', G.op.inq ? 'inquisidor' : 'embaixador'] : []
  const log = t => { G.log.push(t); if (G.log.length > 80) G.log.splice(0, G.log.length - 80) }
  const ev = e => { G.ev.push({ ...e, n: ++G.evN }); if (G.ev.length > 30) G.ev.splice(0, G.ev.length - 30) }
  const moeda = (de, para, n) => { if (n > 0) ev({ t: 'moeda', de, para, qtd: n }) }

  function abrir() {
    const conv = {}
    for (const k of ctx.presentes()) conv[k] = k === me.key ? 'sim' : '?'
    const op = ls.get('coup.op') || {}
    const pl = ls.get('coup.placar')
    G = { id: Math.random().toString(36).slice(2, 9), host: me.key, hostNome: me.name, op: { inq: !!op.inq, tempo: TEMPOS.includes(op.tempo) ? op.tempo : 5, plateia: op.plateia !== false }, placar: pl && Date.now() - pl.t < 10 * 3600e3 ? pl.p : {}, fase: 'convite', conv, js: [], deck: [], vez: 0, p: null, log: [], ev: [], evN: 0, seq: 0, t: Date.now() }
    sysMsg(`${me.name} abriu uma mesa de Coup`)
    difunde()
  }
  function comecar() {
    if (G?.fase !== 'convite') return
    const pres = new Set(ctx.presentes())
    const ks = Object.keys(G.conv).filter(k => G.conv[k] === 'sim' && pres.has(k))
    if (ks.length < 2) return toast('Precisa de pelo menos 2 jogadores.')
    if (ks.length > 10) return toast('No máximo 10 jogadores.')
    ls.set('coup.op', G.op)
    embaralha(ks)
    const n = ks.length
    const chars = ['duque', 'assassino', 'capitao', G.op.inq ? 'inquisidor' : 'embaixador', 'condessa']
    const copias = n <= 6 ? 3 : n <= 8 ? 4 : 5
    G.deck = embaralha(chars.flatMap(c => Array(copias).fill(c)))
    G.js = ks.map(k => ({ key: k, nome: ctx.nomeDe(k), moedas: 2, cartas: [{ c: G.deck.pop(), viva: true }, { c: G.deck.pop(), viva: true }], fora: false }))
    const ult = ls.get('coup.vencedor')
    G.vez = ks.includes(ult) ? ks.indexOf(ult) : rnd(n)
    if (n === 2) G.js[G.vez].moedas = 1 // regra de 2 jogadores: quem começa leva só 1 moeda
    G.log = []; G.p = null; G.fase = 'acao'
    log(`Partida começou. ${G.js[G.vez].nome} começa.`)
    ev({ t: 'inicio' })
    sysMsg(`Coup começou: ${G.js.map(j => j.nome).join(', ')}`)
    difunde()
  }
  function proximo() {
    clearTimeout(timer)
    if (vivos().length <= 1) return fim()
    let i = G.vez
    do i = (i + 1) % G.js.length; while (G.js[i].fora)
    G.vez = i; G.fase = 'acao'; G.p = null
    difunde()
  }
  function fim() {
    clearTimeout(timer)
    const v = vivos()[0]
    G.fase = 'fim'; G.p = null; G.vencedor = v?.key || null
    if (v) { G.placar = G.placar || {}; G.placar[v.key] = (G.placar[v.key] || 0) + 1; ls.set('coup.placar', { t: Date.now(), p: G.placar }); ls.set('coup.vencedor', v.key); ev({ t: 'vence', key: v.key }); log(`${v.nome} venceu! Única família na corte.`); sysMsg(`🏆 ${v.nome} venceu o Coup`) }
    difunde()
  }

  // ação do turno
  function declarar(key, { acao, alvo }) {
    const j = jog(key), A = ACOES[acao]
    if (G.fase !== 'acao' || G.js[G.vez]?.key !== key || !A) return
    if (acao === 'investigar' && !G.op.inq) return
    if (j.moedas >= 10 && acao !== 'golpe') return
    if (j.moedas < (A.custo || 0)) return
    const t = A.alvo ? jog(alvo) : null
    if (A.alvo && (!t || t.fora || t.key === key)) return
    if (A.custo) { j.moedas -= A.custo; moeda(key, 'banco', A.custo) }
    G.p = { acao, ator: key, alvo: t?.key || null, carta: cartaDe(acao), custo: A.custo || 0, bloq: null, passou: [], soBloq: false, jan: 0 }
    ev({ t: 'declara', key, acao, carta: G.p.carta, alvo: t?.key || null })
    if (acao === 'renda') { j.moedas++; moeda('banco', key, 1); log(`${j.nome} pegou Renda (+1).`); return proximo() }
    if (acao === 'golpe') { log(`${j.nome} deu um Golpe de Estado em ${t.nome}.`); ev({ t: 'golpe', key, alvo: t.key }); return perder(t.key, 'golpe', 'proximo') }
    const c = G.p.carta
    log(c ? `${j.nome} diz ser ${sou(c)}: ${A.nome}${t ? ` em ${t.nome}` : ''}.` : `${j.nome} pediu Ajuda externa.`)
    abreJanela('reacao')
  }
  // quem pode reagir na janela aberta
  function eleg() {
    const p = G.p, outros = vivos().map(j => j.key).filter(k => k !== p.ator)
    if (G.fase === 'bloqueio') return vivos().map(j => j.key).filter(k => k !== p.bloq.key)
    if (G.fase !== 'reacao') return []
    const s = new Set()
    if (p.carta && !p.soBloq) outros.forEach(k => s.add(k))
    if (!p.bloq && bloqueiosDe(p.acao).length) {
      if (p.acao === 'ajuda') outros.forEach(k => s.add(k))
      else if (p.alvo && !jog(p.alvo)?.fora) s.add(p.alvo)
    }
    return [...s]
  }
  function armaJanela() {
    const p = G.p, jan = p.jan
    clearTimeout(timer)
    if (p.prazo) timer = setTimeout(() => { if (G?.p === p && p.jan === jan && (G.fase === 'reacao' || G.fase === 'bloqueio')) fechaJanela() }, p.prazo - Date.now() + 80)
  }
  function abreJanela(fase) {
    G.fase = fase
    const p = G.p
    p.passou = []; p.jan++
    p.prazo = G.op.tempo ? Date.now() + G.op.tempo * 1000 : 0
    if (!eleg().length) return fechaJanela()
    armaJanela()
    difunde()
  }
  function fechaJanela() {
    clearTimeout(timer)
    if (G.fase === 'reacao') return executa()
    if (G.fase === 'bloqueio') {
      log(`Ninguém duvidou: ${nome(G.p.bloq.key)} bloqueou.`)
      ev({ t: 'bloqueado', key: G.p.ator, por: G.p.bloq.key })
      return proximo()
    }
  }
  function reage(key, { tipo, carta }) {
    const p = G.p
    if ((G.fase !== 'reacao' && G.fase !== 'bloqueio') || !p || !eleg().includes(key) || p.passou.includes(key)) return
    if (tipo === 'passa') {
      p.passou.push(key); ev({ t: 'passa', key })
      if (eleg().every(k => p.passou.includes(k))) return fechaJanela()
      return difunde()
    }
    if (tipo === 'contesta') {
      if (G.fase === 'reacao' && p.carta && !p.soBloq) return iniciaDuvida(key, 'acao')
      if (G.fase === 'bloqueio') return iniciaDuvida(key, 'bloq')
      return
    }
    if (tipo === 'bloqueia' && G.fase === 'reacao' && !p.bloq && bloqueiosDe(p.acao).includes(carta) && (p.acao === 'ajuda' || key === p.alvo)) {
      p.bloq = { key, carta }
      log(`${nome(key)} diz ser ${sou(carta)} e bloqueia.`)
      ev({ t: 'bloqueia', key, carta })
      abreJanela('bloqueio')
    }
  }
  // etapa de contestação: "fulano duvida de fulano". Quem duvidou pode desistir antes de virar a carta.
  function iniciaDuvida(key, sobre) {
    const p = G.p
    clearTimeout(timer)
    p.duv = { key, sobre, volta: G.fase, resta: p.prazo ? Math.max(0, p.prazo - Date.now()) : 0, ate: Date.now() + DUVIDA_MS }
    G.fase = 'duvida'
    ev({ t: 'contesta', key, alvo: sobre === 'acao' ? p.ator : p.bloq.key })
    const d = p.duv
    timer = setTimeout(() => { if (G?.p === p && p.duv === d) confirmaDuvida() }, DUVIDA_MS)
    difunde()
  }
  function confirmaDuvida() {
    const p = G.p, d = p?.duv
    if (G.fase !== 'duvida' || !d) return
    p.duv = null
    if (d.sobre === 'acao') contestacao(d.key, p.ator, p.carta, 'acao')
    else contestacao(d.key, p.bloq.key, p.bloq.carta, 'bloq')
  }
  function cancelaDuvida() {
    const p = G.p, d = p?.duv
    if (G.fase !== 'duvida' || !d) return
    p.duv = null
    G.fase = d.volta; p.jan++
    p.prazo = G.op.tempo ? Date.now() + Math.max(d.resta, 3000) : 0
    ev({ t: 'desiste', key: d.key })
    if (eleg().every(k => p.passou.includes(k))) return fechaJanela()
    armaJanela()
    difunde()
  }
  function contestacao(desafiante, desafiado, c, sobre) {
    clearTimeout(timer)
    const j = jog(desafiado)
    const i = j.cartas.findIndex(x => x.viva && x.c === c)
    if (i >= 0) {
      log(`${nome(desafiante)} duvidou de ${j.nome}, mas era verdade: ${sou(c)}.`)
      ev({ t: 'prova', key: desafiado, por: desafiante, c, ok: true, i })
      G.deck.push(c); embaralha(G.deck); j.cartas[i].c = G.deck.pop()
      ev({ t: 'nova', key: desafiado, i })
      perder(desafiante, 'duvidou', sobre === 'acao' ? 'janela' : 'proximo')
    } else {
      log(`${nome(desafiante)} pegou o blefe de ${j.nome}: não era ${sou(c)}.`)
      ev({ t: 'prova', key: desafiado, por: desafiante, c, ok: false })
      if (sobre === 'acao' && G.p.custo) { jog(G.p.ator).moedas += G.p.custo; moeda('banco', G.p.ator, G.p.custo) }
      perder(desafiado, 'blefe', sobre === 'acao' ? 'proximo' : 'exec')
    }
  }
  function perder(key, motivo, depois) {
    const j = jog(key)
    if (!j || j.fora) return continua(depois)
    const vs = vivas(j)
    if (vs.length === 1) { mata(j, vs[0], motivo); return continua(depois) }
    G.fase = 'perde'; G.p.perde = { key, motivo, depois }
    clearTimeout(timer)
    difunde()
  }
  function mata(j, i, motivo) {
    j.cartas[i].viva = false
    ev({ t: 'perde', key: j.key, i, c: j.cartas[i].c, motivo })
    log(`${j.nome} perdeu ${sou(j.cartas[i].c)} (${motivo}).`)
    if (!vivas(j).length) {
      j.fora = true
      moeda(j.key, 'banco', j.moedas); j.moedas = 0
      ev({ t: 'elimina', key: j.key })
      log(`${j.nome} foi exilado.`)
    }
  }
  function continua(d) {
    if (vivos().length <= 1) return fim()
    if (d === 'exec') return executa()
    if (d === 'janela') {
      // provou a carta: o alvo ainda pode bloquear
      const p = G.p
      if (!p.bloq && p.alvo && bloqueiosDe(p.acao).length && !jog(p.alvo)?.fora && !jog(p.ator)?.fora) { p.soBloq = true; return abreJanela('reacao') }
      return executa()
    }
    proximo()
  }
  function executa() {
    clearTimeout(timer)
    const p = G.p, a = jog(p.ator)
    if (!a || a.fora) return proximo()
    const t = p.alvo ? jog(p.alvo) : null
    if (p.acao === 'ajuda') { a.moedas += 2; moeda('banco', a.key, 2); log(`${a.nome} recebeu Ajuda externa (+2).`) }
    else if (p.acao === 'taxar') { a.moedas += 3; moeda('banco', a.key, 3); log(`${a.nome} taxou (+3).`) }
    else if (p.acao === 'extorquir') { const n = Math.min(2, t?.moedas || 0); if (t) { t.moedas -= n; a.moedas += n; moeda(t.key, a.key, n) } log(`${a.nome} extorquiu ${n} de ${t?.nome}.`) }
    else if (p.acao === 'assassinar') { if (t && !t.fora) { log(`${a.nome} assassinou uma influência de ${t.nome}.`); ev({ t: 'golpe', key: a.key, alvo: t.key, punhal: true }); return perder(t.key, 'assassinato', 'proximo') } }
    else if (p.acao === 'trocar') {
      const vs = vivas(a), n = G.op.inq ? 1 : 2
      const tiradas = G.deck.splice(-Math.min(n, G.deck.length))
      p.troca = { opcoes: [...vs.map(i => a.cartas[i].c), ...tiradas], manter: vs.length, idx: vs }
      G.fase = 'troca'; ev({ t: 'compra', key: a.key, qtd: tiradas.length })
      return difunde()
    } else if (p.acao === 'investigar') {
      if (!t || t.fora) return proximo()
      G.fase = 'mostra'; return difunde()
    }
    proximo()
  }
  function escolhePerda(key, i) {
    const pp = G.p?.perde, j = jog(key)
    if (G.fase !== 'perde' || pp?.key !== key || !j?.cartas[i]?.viva) return
    G.p.perde = null
    mata(j, i, pp.motivo)
    continua(pp.depois)
  }
  function fazTroca(key, sel) {
    const p = G.p, a = jog(key)
    if (G.fase !== 'troca' || p.ator !== key || !Array.isArray(sel)) return
    const u = [...new Set(sel.map(Number))].filter(i => i >= 0 && i < p.troca.opcoes.length)
    if (u.length !== p.troca.manter) return
    const fica = u.map(i => p.troca.opcoes[i])
    p.troca.opcoes.forEach((c, i) => { if (!u.includes(i)) G.deck.push(c) })
    embaralha(G.deck)
    p.troca.idx.forEach((ci, k) => { a.cartas[ci].c = fica[k] })
    ev({ t: 'devolve', key, qtd: p.troca.opcoes.length - fica.length })
    log(`${a.nome} trocou cartas com a Corte.`)
    proximo()
  }
  function mostra(key, i) {
    const p = G.p, t = jog(key)
    if (G.fase !== 'mostra' || p.alvo !== key || !t?.cartas[i]?.viva) return
    p.inv = { i, c: t.cartas[i].c }
    G.fase = 'investiga'
    log(`${t.nome} mostrou uma carta para ${nome(p.ator)}.`)
    ev({ t: 'mostrou', key, para: p.ator, i })
    difunde()
  }
  function investiga(key, trocar) {
    const p = G.p, t = jog(p?.alvo)
    if (G.fase !== 'investiga' || p.ator !== key || !t) return
    if (trocar && t.cartas[p.inv.i]?.viva) {
      G.deck.push(p.inv.c); embaralha(G.deck); t.cartas[p.inv.i].c = G.deck.pop()
      ev({ t: 'nova', key: t.key, i: p.inv.i })
      log(`${nome(key)} obrigou ${t.nome} a trocar a carta.`)
    } else log(`${nome(key)} deixou ${t.nome} ficar com a carta.`)
    proximo()
  }
  function desiste(key, saiu) {
    const j = jog(key)
    if (!j || j.fora || ['convite', 'fim'].includes(G.fase)) return
    clearTimeout(timer)
    log(saiu ? `${j.nome} saiu da mesa.` : `${j.nome} desistiu.`)
    const p = G.p
    if (G.fase === 'duvida') { G.fase = p.duv.volta; p.duv = null }
    if (saiu) {
      // quem saiu: as cartas escondidas voltam para a Corte sem serem reveladas
      for (const i of vivas(j)) G.deck.push(j.cartas[i].c)
      embaralha(G.deck); j.cartas = j.cartas.filter(c => !c.viva)
      ev({ t: 'saiu', key, nome: j.nome }); sysMsg(`${j.nome} saiu do Coup`)
    } else for (const i of vivas(j)) { j.cartas[i].viva = false; ev({ t: 'perde', key, i, c: j.cartas[i].c }) }
    j.fora = true; moeda(key, 'banco', j.moedas); j.moedas = 0; ev({ t: 'elimina', key })
    if (vivos().length <= 1) return fim()
    const f = G.fase
    if (f === 'acao') return G.js[G.vez].key === key ? proximo() : difunde()
    if (f === 'perde' && p.perde?.key === key) { const d = p.perde.depois; p.perde = null; return continua(d) }
    if (p && (p.ator === key || (f === 'mostra' && p.alvo === key) || (f === 'bloqueio' && p.bloq?.key === key))) return proximo()
    if ((f === 'reacao' || f === 'bloqueio') && eleg().every(k => p.passou.includes(k))) return fechaJanela()
    if (f === 'reacao' || f === 'bloqueio') armaJanela()
    difunde()
  }

  function hostRecebe(d, key) {
    if (!G || !key || d.id !== G.id) return
    switch (d.op) {
      case 'resp': if (G.fase === 'convite') { G.conv[key] = d.sim ? 'sim' : 'nao'; difunde() } break
      case 'acao': declarar(key, d); break
      case 'reage': reage(key, d); break
      case 'duvida': if (G.p?.duv?.key === key) d.confirma ? confirmaDuvida() : cancelaDuvida(); break
      case 'perde': escolhePerda(key, d.i); break
      case 'troca': fazTroca(key, d.sel); break
      case 'mostra': mostra(key, d.i); break
      case 'investiga': investiga(key, !!d.trocar); break
      case 'desiste': desiste(key); break
    }
  }

  // o que cada pessoa pode ver
  function vista(k) {
    const p = G.p
    // plateia (quem só assiste ou já foi exilado) vê as cartas de todos, se a mesa permitir
    const veTudo = G.op.plateia && G.fase !== 'convite' && (!jog(k) || jog(k).fora)
    let pv = null
    if (p) {
      pv = { acao: p.acao, ator: p.ator, alvo: p.alvo, carta: p.carta, bloq: p.bloq, passou: p.passou || [], soBloq: p.soBloq, jan: p.jan, resta: p.prazo ? Math.max(0, p.prazo - Date.now()) : 0, perde: p.perde ? { key: p.perde.key, motivo: p.perde.motivo } : null }
      if (G.fase === 'reacao' || G.fase === 'bloqueio') pv.eleg = eleg()
      if (p.duv) pv.duv = { key: p.duv.key, sobre: p.duv.sobre, resta: Math.max(0, p.duv.ate - Date.now()) }
      if (p.troca) pv.troca = k === p.ator ? { opcoes: p.troca.opcoes, manter: p.troca.manter } : { n: p.troca.opcoes.length, manter: p.troca.manter }
      if (G.fase === 'investiga' && p.inv) pv.inv = k === p.ator ? { i: p.inv.i, c: p.inv.c } : { i: p.inv.i }
    }
    return {
      id: G.id, seq: G.seq, host: G.host, hostNome: G.hostNome, op: G.op, fase: G.fase, conv: G.conv,
      vez: G.js[G.vez]?.key || null, vencedor: G.vencedor || null, deck: G.deck.length,
      placar: G.placar || {},
      js: G.js.map(j => ({ key: j.key, nome: j.nome, moedas: j.moedas, fora: j.fora, cartas: j.cartas.map(c => ({ viva: c.viva, c: !c.viva || j.key === k || veTudo ? c.c : null })) })),
      p: pv, log: G.log.slice(-40), ev: G.ev,
    }
  }
  function difunde() {
    if (!G) return
    G.seq++; G.t = Date.now()
    ls.set('coup.G', G)
    const ks = new Set([...ctx.presentes(), ...G.js.map(j => j.key), ...Object.keys(G.conv || {})])
    for (const k of ks) if (k !== me.key) ctx.sendTo(k, { coup: { v: vista(k) } })
    // cópia completa para o sucessor (o próximo jogador conectado), para ele assumir se eu cair
    const pres = new Set(ctx.presentes())
    G.sucessor = G.js.filter(j => !j.fora).map(j => j.key).find(k => k !== me.key && pres.has(k)) || [...pres].find(k => k !== me.key) || null
    if (G.sucessor) ctx.sendTo(G.sucessor, { coup: { bk: G } })
    aplica(vista(me.key))
  }
  function remove(key) {
    if (G.fase === 'convite') { if (key in G.conv) { delete G.conv[key]; difunde() } return }
    ausDesde.delete(key)
    const j = jog(key)
    if (!j || j.fora) return
    desiste(key, true)
  }
  // quem abriu a mesa caiu: o sucessor assume e tira o antigo host do jogo
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
    sysMsg(`${nomeAntigo} caiu: ${me.name} assumiu a mesa do Coup`)
    const p = G.p
    if ((G.fase === 'reacao' || G.fase === 'bloqueio') && p) { p.prazo = G.op.tempo ? Date.now() + G.op.tempo * 1000 : 0; armaJanela() }
    if (G.fase === 'duvida' && p?.duv) { p.duv.ate = Date.now() + DUVIDA_MS; const d = p.duv; timer = setTimeout(() => { if (G?.p === p && p.duv === d) confirmaDuvida() }, DUVIDA_MS) }
    remove(antigo)
    if (G) difunde()
  }
  function encerrarHost() {
    if (!G) return
    clearTimeout(timer)
    ctx.send({ coup: { fim: G.id } })
    ls.set('coup.G', null)
    G = null
    aplica(null)
  }
  // host cuida de quem caiu: passa nas janelas na hora; nas escolhas, espera um pouco e decide pela pessoa
  setInterval(() => {
    if (!G && !restaurou && me.key) {
      restaurou = true
      const s = ls.get('coup.G')
      // volta só se ninguém assumiu a mesa no lugar
      if (s && s.host === me.key && !['fim', 'duvida'].includes(s.fase) && Date.now() - s.t < 3 * 3600e3) setTimeout(() => {
        if (G || (V && V.host !== me.key)) return ls.set('coup.G', null)
        G = s
        if ((G.fase === 'reacao' || G.fase === 'bloqueio') && G.p) { G.p.prazo = G.op.tempo ? Date.now() + G.op.tempo * 1000 : 0; armaJanela() }
        difunde()
      }, 3000)
    }
    assumeSePreciso()
    if (!G || G.host !== me.key || G.fase === 'fim') return
    const pres = new Set(ctx.presentes()), agora = Date.now()
    const quem = G.fase === 'convite' ? Object.keys(G.conv).filter(k => k !== me.key) : G.js.filter(j => !j.fora).map(j => j.key).filter(k => k !== me.key)
    for (const k of quem) { if (pres.has(k)) ausDesde.delete(k); else if (!ausDesde.has(k)) ausDesde.set(k, agora) }
    for (const [k, t] of ausDesde) if (agora - t > SAIU_MS) return remove(k)
    // enquanto não sai: nas janelas de duvidar/bloquear, quem está fora conta como "deixou passar"
    const p = G.p, f = G.fase
    if (f === 'reacao' || f === 'bloqueio') { for (const k of eleg()) if (!pres.has(k) && !p.passou.includes(k)) return reage(k, { tipo: 'passa' }) }
  }, 1500)

  /* =================================================================== cliente: a mesa */
  let V = null, ultEv = 0, dispensado = '', mira = null, sel = [], entregando = false
  const vistos = new Set() // o que já entrou animado (bilhetes, balões), para não animar de novo a cada atualização
  const novo = id => { if (vistos.has(id)) return false; vistos.add(id); return true }
  const souHost = () => V && V.host === me.key
  const eu = () => V?.js.find(j => j.key === me.key)
  const N = k => k === me.key ? 'Você' : (V?.js.find(j => j.key === k)?.nome || ctx.nomeDe(k))
  function manda(d) {
    if (!V) return
    const m = { id: V.id, ...d }
    if (souHost()) hostRecebe(m, me.key)
    else ctx.sendTo(V.host, { coup: { op: m } })
  }
  function got(d, deKey) {
    if (!d) return
    if (d.op) { if (G && G.host === me.key) hostRecebe(d.op, deKey); return }
    if (d.fim) { if (V?.id === d.fim) aplica(null); return }
    if (d.bk) { if (d.bk.host === deKey) backup = d.bk; return }
    if (d.v) {
      // eu caí e alguém assumiu: deixo de ser host
      if (G && d.v.id === G.id && d.v.host !== me.key) { clearTimeout(timer); G = null; ls.set('coup.G', null) }
      if (d.v.id === dispensado) return
      if (V && d.v.id === V.id && d.v.seq <= V.seq) return
      if (ctx.faixaAtiva?.()) return
      aplica(d.v)
    }
  }
  function aplica(v) {
    const antes = V
    if (v && (!antes || antes.id !== v.id)) {
      ultEv = Math.max(0, ...v.ev.map(e => e.n))
      const ini = v.ev.find(e => e.t === 'inicio')
      if (ini && v.fase !== 'convite' && v.ev.length < 6) ultEv = ini.n - 1 // chegou junto com o começo: anima a distribuição
      mira = null; sel = []
    }
    V = v
    if (v) v.recebido = Date.now()
    if (antes?.fase !== v?.fase || antes?.vez !== v?.vez) { mira = null; if (v?.fase !== 'troca') sel = [] }
    if (v && v.fase === 'acao' && v.vez === me.key && antes && antes.vez !== me.key) setTimeout(() => som('vez'), 500)
    const evs = v ? v.ev.filter(e => e.n > ultEv) : []
    if (v) ultEv = Math.max(ultEv, ...v.ev.map(e => e.n))
    if (evs.some(e => e.t === 'inicio')) entregando = true
    render(antes)
    if (v) anima(evs)
  }

  /* ---------- sons de verdade (Kenney, CC0), carregados uma vez ---------- */
  const buf = new Map()
  let carregando = null
  function carregaSons() {
    if (carregando) return carregando
    let ac; try { ac = ctx.audioCtx() } catch { return Promise.resolve() }
    carregando = Promise.all(SONS.map(n => fetch(`${BASE}sons/${n}.mp3`).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(d => buf.set(n, d)).catch(() => {})))
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
    s.playbackRate.value = .94 + Math.random() * .12
    const g = ac.createGain(); g.gain.value = (VOL[n] ?? .6) * vol
    s.connect(g).connect(ctx.saida())
    s.start(ac.currentTime + atraso / 1000)
    s.onended = () => g.disconnect()
  }

  /* ---------- posições em volta da mesa ---------- */
  // ângulos na tela (90 = embaixo, 180 = esquerda, 270 = em cima, 360 = direita), em sentido horário
  function angulos(n, comigo) {
    if (!comigo) return Array.from({ length: n }, (_, i) => 90 + 180 / n + i * 360 / n) // ninguém colado no seu boneco
    if (n === 1) return [270]
    const span = Math.min(220, 72 * (n - 1)), a0 = 270 - span / 2
    return Array.from({ length: n }, (_, i) => a0 + i * span / (n - 1))
  }
  const pos = (ang, rx, ry) => ({ x: 50 + rx * Math.cos(ang * Math.PI / 180), y: 50 + ry * Math.sin(ang * Math.PI / 180) })

  /* ---------- peças ---------- */
  const botao = (conteudo, fn, cls = '', title = '') => { const b = el('button', { type: 'button', className: `cp-btn ${cls}`, title }); b.append(...[conteudo].flat()); b.addEventListener('click', e => { e.stopPropagation(); b.blur(); som('clique'); fn(e) }); return b }
  function carta(c, { aberta, morta, cls = '' } = {}) {
    const frente = c ? el('img', { className: 'cp-carta__frente', src: IMG(c), alt: PERS[c]?.nome || '', draggable: false }) : el('span', { className: 'cp-carta__frente cp-carta__frente--x' })
    return el('div', { className: `cp-carta${aberta || morta ? ' aberta' : ''}${morta ? ' morta' : ''} ${cls}`, title: c && (aberta || morta) ? PERS[c].nome : '' },
      el('div', { className: 'cp-carta__in' }, el('img', { className: 'cp-carta__verso', src: IMG('verso'), alt: '', draggable: false }), frente))
  }
  // pilha de moedas de verdade: ouro vale 5, prata vale 1
  function pilha(n, key, cls = '') {
    const ouro = Math.floor(n / 5), prata = n % 5
    const ms = [...Array(ouro).fill('ouro'), ...Array(prata).fill('prata')]
    const dono = key === me.key ? 'Você tem' : `${N(key)} tem`
    return el('div', { className: `cp-pilha ${cls}`, 'data-moedas': key, 'data-info': `${dono} ${n} moeda${n === 1 ? '' : 's'}${n >= 10 ? '\nGolpe obrigatório' : n >= 7 ? '\nJá dá para dar um Golpe' : n >= 3 ? '\nJá dá para assassinar' : ''}` },
      el('div', { className: 'cp-pilha__ms', style: `--n:${Math.max(1, ms.length)}` }, ...ms.map((t, j) => el('img', { className: 'cp-pilha__m', src: IMG(`moeda-${t}`), alt: '', draggable: false, style: `--j:${j};--x:${j % 2}` }))),
      el('b', { className: 'cp-pilha__n', textContent: n }))
  }
  const MONTE = [[0, 0, 'ouro'], [2.2, .3, 'ouro'], [1.1, 1.3, 'ouro'], [3.4, 1.4, 'prata'], [-.9, 1.6, 'prata'], [2.4, 2.6, 'ouro'], [.6, 2.9, 'prata'], [1.6, .2, 'prata'], [3.6, -.1, 'prata']]
  const tesouro = () => el('div', { className: 'cp-pilha cp-tesouro', 'data-moedas': 'banco', 'data-info': 'Tesouro' }, el('div', { className: 'cp-pilha__ms' }, ...MONTE.map(([x, y, t], i) => el('img', { className: 'cp-pilha__m', src: IMG(`moeda-${t}`), alt: '', style: `left:${x * 1.6}cqh;bottom:${y * 1.3}cqh;z-index:${9 - Math.round(y)}`, draggable: false }))))
  // cartas perdidas ficam reveladas fora do jogo: um monte na mesa, com a conta do que ainda pode estar escondido
  function reveladas() {
    if (V.fase === 'convite') return ''
    const n = V.js.length, copias = n <= 6 ? 3 : n <= 8 ? 4 : 5
    const chars = ['duque', 'assassino', 'capitao', V.op.inq ? 'inquisidor' : 'embaixador', 'condessa']
    const mortas = V.js.flatMap(j => j.cartas.filter(c => !c.viva).map(c => c.c))
    const conta = c => mortas.filter(x => x === c).length
    const info = ['Cartas reveladas (fora do jogo)', ...chars.map(c => { const r = conta(c), f = copias - r; return `${PERS[c].nome}: ${r} revelada${r === 1 ? '' : 's'} · ${f ? `${f} ainda escondida${f === 1 ? '' : 's'}` : 'nenhuma sobrando'}` })].join('\n')
    const grupos = chars.filter(conta)
    return el('div', { className: 'cp-reveladas' + (grupos.length ? '' : ' vazio'), 'data-info': info },
      ...(grupos.length ? grupos.map(c => el('div', { className: 'cp-reveladas__g' }, ...Array.from({ length: conta(c) }, (_, i) => el('img', { src: IMG(c), alt: PERS[c].nome, style: `--i:${i}`, draggable: false })))) : [el('span', { className: 'cp-reveladas__vazio' })]))
  }
  const retrato = (k, nm, cls = '') => el('span', { className: `cp-retrato ${cls}` }, ctx.pfp(k, 64, nm))
  const nomeCarta = c => el('span', { className: 'cp-nomecarta', style: `--c:${PERS[c].cor}`, textContent: PERS[c].nome })

  /* ---------- render ---------- */
  function render(antes) {
    tela.classList.toggle('coup--on', !!V)
    ctx.onAtivo?.(!!V)
    tela.querySelector('.cp-ajuda')?.remove()
    if (!V) { tela.replaceChildren(); vistos.clear(); return }
    const naMesa = !!eu()
    const conv = V.fase === 'convite'
    baloes = []
    const lugares = conv ? Object.keys(V.conv).filter(k => k !== me.key).map(k => ({ key: k, nome: ctx.nomeDe(k), conv: V.conv[k] }))
      : (() => { const js = V.js; const i = js.findIndex(j => j.key === me.key); return i < 0 ? js : [...js.slice(i + 1), ...js.slice(0, i)] })()
    const angs = angulos(lugares.length, conv || naMesa)

    const plano = el('div', { className: 'cp-plano' }, el('div', { className: 'cp-feltro' }), conv ? '' : el('div', { className: 'cp-centro' }, reveladas(), corte(), tesouro()))
    lugares.forEach((j, n) => plano.append(...assento(j, angs[n], antes)))

    const topo = el('header', { className: 'cp-topo' },
      el('span', { className: 'cp-logo', textContent: 'Coup' }),
      el('span', { className: 'cp-grow' }),
      botao(icon('book-open'), abreAjuda, 'cp-btn--ic', 'Cartas de ajuda'),
      botao(icon('list-music'), () => tela.querySelector('.cp-log')?.classList.toggle('aberto'), 'cp-btn--ic', 'O que aconteceu'),
      naMesa && !eu().fora && !['fim', 'convite'].includes(V.fase) ? botao(icon('flag'), e => confirma(e.currentTarget, 'Desistir?', () => manda({ op: 'desiste' })), 'cp-btn--ic', 'Desistir da partida') : '',
      souHost() ? botao(icon('x'), e => confirma(e.currentTarget, 'Fechar a mesa?', encerrarHost), 'cp-btn--ic', 'Fechar a mesa para todos')
        : botao(icon('x'), () => { dispensado = V.id; aplica(null) }, 'cp-btn--ic', 'Sair da mesa (só para você)'))

    const kids = [el('div', { className: 'cp-palco' }, plano), topo, minhaArea(antes), cartasDeAcao(), meio(), bilhete(), logBox()]
    const mod = modal()
    if (mod) kids.push(mod)
    if (!conv && !ctx.presentes().includes(V.host)) kids.push(el('div', { className: 'cp-pausa' }, el('b', { textContent: 'Partida pausada' }), el('span', { textContent: `${V.hostNome} abriu a mesa e caiu. A partida continua de onde parou quando voltar.` })))
    tela.replaceChildren(...kids)
    baloes.forEach(b => poeBalao(b))
    tela.classList.toggle('mirando', !!mira)
    tela.classList.toggle('acabou', V.fase === 'fim')
    ctx.hydrate(tela)
    if (entregando) tela.querySelectorAll('.cp-mao-mesa .cp-carta, .cp-mao .cp-carta').forEach(n => n.classList.add('oculta'))
    tela.querySelector('.cp-log__lista')?.scrollTo(0, 1e6)
  }
  function confirma(btn, txt, fn) {
    if (btn.dataset.conf) return fn()
    btn.dataset.conf = '1'; btn.classList.add('confirma')
    const tip = el('span', { className: 'cp-tip', textContent: `${txt} Clique de novo.` }); btn.append(tip)
    setTimeout(() => { delete btn.dataset.conf; btn.classList.remove('confirma'); tip.remove() }, 2600)
  }
  function corte() {
    const n = V.fase === 'convite' ? 15 : V.deck
    const maos = V.js.reduce((s, j) => s + j.cartas.filter(c => c.viva).length, 0)
    return el('div', { className: 'cp-corte', 'data-info': `Baralho da Corte\n${n} cartas viradas aqui${V.fase === 'convite' ? '' : `\n${maos} escondidas nas mãos`}` },
      ...Array.from({ length: Math.min(6, Math.max(1, Math.ceil(n / 2.5))) }, (_, i) => el('img', { src: IMG('verso'), alt: '', style: `--i:${i}`, draggable: false })))
  }

  // a fala de cada um durante a jogada (balão + carta levantada), derivada do estado
  function falaDe(k) {
    const p = V.p
    if (!p) return null
    const aberto = ['reacao', 'bloqueio', 'duvida'].includes(V.fase)
    if (aberto && p.ator === k && (p.carta || p.acao === 'ajuda')) return { id: `${V.id}:${p.ator}:${p.acao}:${p.alvo}:a`, carta: p.carta, txt: p.carta ? `Sou ${sou(p.carta)}. ${FALA[p.acao](N(p.alvo))}` : FALA.ajuda() }
    if (aberto && p.bloq?.key === k) return { id: `${V.id}:${k}:bloq:${p.bloq.carta}`, carta: p.bloq.carta, txt: `Sou ${sou(p.bloq.carta)}. Bloqueio!` }
    return null
  }
  function assento(j, ang, antes) {
    const p = V.p
    const P = pos(ang, 45, 41), C = pos(ang, 29, 25.5), M = pos(ang + (ang < 270 ? 17 : -17), 31, 27)
    const rot = ang - 90
    const vez = !['convite', 'fim'].includes(V.fase) && V.vez === j.key
    const alvavel = mira && !j.fora && j.key !== me.key && !j.conv
    const fala = falaDe(j.key)
    const cls = ['cp-assento', vez ? 'vez' : '', j.fora ? 'fora' : '', alvavel ? 'alvo' : '', V.vencedor === j.key ? 'vencedor' : '',
      p?.alvo === j.key && ['reacao', 'bloqueio', 'duvida'].includes(V.fase) ? 'mirado' : '', P.y < 35 ? 'cima' : '']
    const s = el('div', { className: cls.filter(Boolean).join(' '), style: `left:${P.x}%;top:${P.y}%`, 'data-key': j.key },
      el('div', { className: 'cp-medalha' }, retrato(j.key, j.nome), statusDe(j.key), fala?.carta ? carta(fala.carta, { aberta: true, cls: 'cp-segura' + (novo(fala.id + ':c') ? ' entra' : '') }) : ''),
      el('span', { className: 'cp-placa' }, j.nome, V.placar?.[j.key] ? el('i', { className: 'cp-coroas', title: `${V.placar[j.key]} vitória${V.placar[j.key] > 1 ? 's' : ''} hoje`, textContent: `♛${V.placar[j.key]}` }) : ''),
      j.conv ? el('small', { className: `cp-conv cp-conv--${j.conv}`, textContent: j.conv === 'sim' ? 'vai jogar' : j.conv === 'nao' ? 'só assiste' : 'decidindo…' }) : '',
      fala ? '' : legenda(j.key))
    if (fala) baloes.push({ key: j.key, txt: fala.txt, id: fala.id, lado: P.x < 58 ? 'dir' : 'esq' })
    if (['reacao', 'bloqueio'].includes(V.fase) && p?.resta && (fala || (V.fase === 'reacao' && p.ator === j.key))) s.querySelector('.cp-medalha').append(el('i', { className: 'cp-anel', 'data-fim': String(V.recebido + p.resta), 'data-tot': String(V.op.tempo * 1000) }))
    if (alvavel) s.addEventListener('click', () => { const a = mira; mira = null; manda({ op: 'acao', acao: a, alvo: j.key }) })
    if (!j.cartas) return [s]
    const prev = antes?.id === V.id ? antes.js.find(x => x.key === j.key) : null
    const mao = el('div', { className: 'cp-mao-mesa', style: `left:${C.x}%;top:${C.y}%;--rot:${rot}deg`, 'data-mao': j.key },
      ...j.cartas.map((c, i) => {
        const n = carta(c.c, { morta: !c.viva, aberta: !!c.c, cls: (c.viva && c.c ? 'espiada ' : '') + (prev && prev.cartas[i]?.viva && !c.viva ? 'vira' : '') })
        n.dataset.i = i
        if (V.fase === 'investiga' && p?.alvo === j.key && p.inv?.i === i) n.classList.add('vista')
        return n
      }))
    const mo = el('div', { className: 'cp-mesa-moedas', style: `left:${M.x}%;top:${M.y}%;--rot:${rot}deg` }, pilha(j.moedas, j.key))
    return [mao, mo, s]
  }
  // texto pequeno sob a placa: o que a pessoa está fazendo agora
  function legenda(k) {
    const p = V.p, f = V.fase
    let t = ''
    if (f === 'acao' && V.vez === k) t = 'pensando…'
    else if (f === 'perde' && p?.perde?.key === k) t = 'escolhendo o que perder…'
    else if (f === 'troca' && p?.ator === k) t = 'trocando com a Corte…'
    else if (f === 'mostra' && p?.alvo === k) t = 'escolhendo o que mostrar…'
    else if (f === 'investiga' && p?.ator === k) t = 'olhando a carta…'
    return t ? el('small', { className: 'cp-legenda', textContent: t }) : ''
  }
  // balões ficam numa camada 2D por cima da mesa, ao lado da foto (ou acima do seu boneco)
  let baloes = []
  function poeBalao({ key, txt, id, lado }, rapido) {
    const alvo = key === me.key ? tela.querySelector('.cp-eu .cp-boneco') : tela.querySelector(`.cp-assento[data-key="${CSS.escape(key)}"] .cp-retrato`)
    if (!alvo) return
    if (rapido) tela.querySelector(`.cp-balao[data-key="${CSS.escape(key)}"]`)?.remove()
    const ld = key === me.key ? 'cima' : lado
    const b = el('div', { className: `cp-balao lado-${ld}` + (rapido || novo(id) ? ' entra' : '') }, txt)
    b.dataset.key = key
    tela.append(b)
    const r = noTela(alvo), w = b.offsetWidth, h = b.offsetHeight, W = tela.clientWidth
    let x, y
    if (ld === 'cima') { x = r.x - r.w * .05; y = r.y - r.h / 2 - h + r.h * .06 }
    else if (ld === 'dir') { x = r.x + r.w / 2 + 10; y = r.y - h / 2 }
    else { x = r.x - r.w / 2 - 10 - w; y = r.y - h / 2 }
    b.style.left = Math.max(6, Math.min(x, W - w - 6)) + 'px'; b.style.top = Math.max(6, y) + 'px'
    return b
  }
  function statusDe(k) {
    const p = V.p
    if (!p || !(V.fase === 'reacao' || V.fase === 'bloqueio') || !p.eleg?.includes(k)) return ''
    const ok = p.passou.includes(k)
    return el('span', { className: 'cp-st' + (ok ? ' ok' : ' pensa'), title: ok ? 'aceitou' : 'decidindo' }, ok ? icon('check') : el('i'))
  }

  // você: boneco de costas, sua mão e suas moedas na mesa
  function minhaArea(antes) {
    const j = eu(), conv = V.fase === 'convite'
    const bon = ctx.boneco?.(me.key)
    const area = el('div', { className: 'cp-eu' + (j?.fora ? ' fora' : '') + (V.vez === me.key && V.fase === 'acao' ? ' vez' : '') + (!j && !conv ? ' plateia' : '') + (V.vencedor === me.key ? ' vencedor' : ''), 'data-key': me.key },
      bon ? el('img', { className: 'cp-boneco', src: bon, alt: '', draggable: false }) : el('div', { className: 'cp-boneco cp-boneco--pfp' }, retrato(me.key, me.name)))
    const fala = falaDe(me.key)
    if (fala) baloes.push({ key: me.key, txt: fala.txt, id: fala.id })
    if (conv) { if (V.conv[me.key]) area.append(el('small', { className: `cp-conv cp-conv--${V.conv[me.key]}`, textContent: V.conv[me.key] === 'sim' ? 'você vai jogar' : V.conv[me.key] === 'nao' ? 'você só assiste' : 'decidindo…' })); return area }
    if (!j) { area.append(el('small', { className: 'cp-legenda cp-legenda--eu', textContent: 'assistindo' })); return area }
    const f = V.fase, p = V.p
    const escolhendo = (f === 'perde' && p?.perde?.key === me.key) || (f === 'mostra' && p?.alvo === me.key)
    const prev = antes?.id === V.id ? antes.js.find(x => x.key === me.key) : null
    const mao = el('div', { className: 'cp-mao' + (escolhendo ? ' escolhe' : '') },
      ...j.cartas.map((c, i) => {
        const n = carta(c.c, { aberta: true, morta: !c.viva, cls: prev && prev.cartas[i]?.viva && !c.viva ? 'cai' : prev && prev.cartas[i]?.c && prev.cartas[i].c !== c.c ? 'troca' : '' })
        n.dataset.i = i
        if (escolhendo && c.viva) {
          n.classList.add('clicavel'); n.title = f === 'perde' ? `Perder ${PERS[c.c].nome}` : `Mostrar ${PERS[c.c].nome}`
          n.addEventListener('click', () => manda({ op: f === 'perde' ? 'perde' : 'mostra', i }))
        }
        if (f === 'investiga' && p?.alvo === me.key && p.inv?.i === i) n.classList.add('vista')
        return n
      }))
    area.append(mao, pilha(j.moedas, me.key, 'cp-pilha--eu'))
    let dica = ''
    if (escolhendo) dica = f === 'perde' ? 'Escolha a influência que vai perder' : `Escolha a carta que ${N(p.ator)} vai ver`
    else if (f === 'acao' && V.vez === me.key) dica = mira ? `${ACOES[mira].nome}: clique em quem` : j.moedas >= 10 ? 'Com 10 moedas, o Golpe é obrigatório' : 'Sua vez'
    else if (j.fora) dica = 'Você foi exilado'
    if (dica) area.append(el('span', { className: 'cp-dica' + (escolhendo ? ' mal' : '') }, dica))
    return area
  }

  // as ações são cartas, no canto direito: sobem na sua vez
  function cartasDeAcao() {
    const j = eu()
    if (!j || j.fora || !['acao', 'reacao', 'bloqueio', 'duvida', 'perde', 'troca', 'mostra', 'investiga'].includes(V.fase)) return ''
    const minha = V.fase === 'acao' && V.vez === me.key
    const tenho = new Set(j.cartas.filter(c => c.viva).map(c => c.c))
    const lista = ['renda', 'ajuda', 'golpe', 'taxar', 'assassinar', 'extorquir', 'trocar', ...(V.op.inq ? ['investigar'] : [])]
    const ocupado = (V.p?.eleg?.includes(me.key) && !V.p.passou.includes(me.key)) || (V.fase === 'duvida' && V.p?.duv?.key === me.key)
    const leque = el('div', { className: 'cp-leque' + (minha ? ' ativo' : '') + (mira ? ' mirando' : '') + (ocupado ? ' some' : '') })
    lista.forEach((a, i) => {
      const A = ACOES[a], c = a === 'trocar' ? (V.op.inq ? 'inquisidor' : 'embaixador') : A.carta
      const pode = minha && j.moedas >= (A.custo || 0) && (j.moedas < 10 || a === 'golpe')
      const b = el('button', { type: 'button', className: `cp-ac cp-ac--${a}` + (c ? ' pers' : ' geral') + (c && tenho.has(c) ? ' tenho' : '') + (mira === a ? ' sel' : ''), disabled: !pode, style: `--k:${i - (lista.length - 1) / 2};${c ? `--c:${PERS[c].cor}` : ''}`, title: A.dica + (c ? (tenho.has(c) ? ' Você tem.' : ' Seria blefe.') : '') },
        c ? el('img', { className: 'cp-ac__arte', src: IMG(c), alt: '', draggable: false }) : el('span', { className: 'cp-ac__arte cp-ac__arte--geral' }, ...moedasDe(a)),
        el('span', { className: 'cp-ac__rotulo' }, el('b', { textContent: A.nome }), el('small', { textContent: A.fx })))
      b.addEventListener('click', () => {
        if (!pode) return
        som('poe', 0, .6)
        if (A.alvo) { mira = mira === a ? null : a; render() } else manda({ op: 'acao', acao: a })
      })
      leque.append(b)
    })
    return leque
  }
  function moedasDe(a) {
    if (a === 'golpe') return [el('span', { className: 'cp-coroa', textContent: '♛' })]
    const n = a === 'renda' ? 1 : 2
    return Array.from({ length: n }, (_, i) => el('img', { src: IMG('moeda-prata'), alt: '', style: `--i:${i}`, draggable: false }))
  }

  // o meio da mesa: convite, a contestação (fulano × fulano) e o fim
  function meio() {
    const f = V.fase, p = V.p
    if (f === 'convite') return convite()
    if (f === 'duvida' && p?.duv) {
      const alvo = p.duv.sobre === 'acao' ? p.ator : p.bloq.key, c = p.duv.sobre === 'acao' ? p.carta : p.bloq.carta
      return el('div', { className: 'cp-duelo' + (novo(`${V.id}:duv:${p.jan}:${p.duv.key}`) ? ' entra' : '') },
        el('div', { className: 'cp-duelo__lado' }, retrato(p.duv.key, N(p.duv.key)), el('b', { textContent: N(p.duv.key) })),
        el('div', { className: 'cp-duelo__meio' }, el('span', { className: 'cp-duelo__x', textContent: 'duvida de' }), carta(null, { cls: 'cp-duelo__carta' }), nomeCarta(c)),
        el('div', { className: 'cp-duelo__lado' }, retrato(alvo, N(alvo)), el('b', { textContent: N(alvo) })),
        el('i', { className: 'cp-pavio', 'data-fim': String(V.recebido + p.duv.resta), 'data-tot': String(DUVIDA_MS) }))
    }
    if (f === 'fim') {
      const v = V.vencedor
      return el('div', { className: 'cp-fim' },
        retrato(v, N(v), 'cp-retrato--grande'),
        el('b', { className: 'cp-fim__t', textContent: v === me.key ? 'Você venceu' : `${N(v)} venceu` }),
        el('small', { textContent: 'a última família na corte' }),
        placarDaNoite(),
        souHost() ? el('div', { className: 'cp-linha' }, botao('Nova partida', revanche, 'cp-btn--lacre'), botao('Fechar', encerrarHost, 'cp-btn--tinta')) : '')
    }
    return ''
  }
  function placarDaNoite() {
    const r = Object.entries(V.placar || {}).sort((a, b) => b[1] - a[1])
    if (!r.length) return ''
    return el('div', { className: 'cp-placar' }, el('small', { textContent: 'placar da noite' }), ...r.map(([k, n], i) => el('span', { className: i === 0 ? 'lider' : '' }, retrato(k, N(k)), el('b', { textContent: N(k) }), el('em', { textContent: n }))))
  }
  function convite() {
    const host = souHost(), op = V.op
    const escolhe = (inq, c) => {
      const n = carta(c, { aberta: true, cls: 'cp-opcarta' + (op.inq === inq ? ' on' : '') + (host ? ' clicavel' : '') })
      n.title = host ? `Jogar com ${PERS[c].nome}` : PERS[c].nome
      if (host) n.addEventListener('click', () => { if (G.op.inq !== inq) { G.op.inq = inq; som('poe'); difunde() } })
      return n
    }
    const reforma = el('div', { className: 'cp-opcarta cp-opcarta--breve', title: 'A expansão entra numa próxima versão' }, carta(null), el('span', { className: 'cp-selo', textContent: 'em breve' }))
    const n = Object.entries(V.conv).filter(([k, v]) => v === 'sim' && ctx.presentes().includes(k)).length
    const tempos = el('div', { className: 'cp-tempos', title: 'Tempo para duvidar ou bloquear' }, el('small', { textContent: 'tempo para duvidar' }),
      ...TEMPOS.map(t => host ? botao(`${t}s`, () => { G.op.tempo = t; difunde() }, op.tempo === t ? 'on' : '') : el('span', { className: op.tempo === t ? 'on' : '', textContent: `${t}s` })))
    const ir = host ? botao(n >= 2 ? `Começar · ${n}` : 'Esperando jogadores', comecar, 'cp-btn--lacre cp-btn--grande') : el('small', { className: 'cp-espera', textContent: `${V.hostNome} vai começar a partida` })
    if (host && n < 2) ir.disabled = true
    return el('div', { className: 'cp-convite' },
      el('div', { className: 'cp-opcoes' }, escolhe(false, 'embaixador'), el('span', { className: 'cp-ou', textContent: 'ou' }), escolhe(true, 'inquisidor'), reforma),
      el('div', { className: 'cp-linha' }, tempos, host ? botao([icon(op.plateia ? 'eye' : 'eye-off'), 'plateia vê as cartas'], () => { G.op.plateia = !G.op.plateia; difunde() }, 'cp-chave' + (op.plateia ? ' on' : ''), 'Quem só assiste ou já foi exilado vê as cartas de todos') : el('span', { className: 'cp-chave' + (op.plateia ? ' on' : '') }, icon(op.plateia ? 'eye' : 'eye-off'), op.plateia ? 'plateia vê as cartas' : 'plateia não vê as cartas')),
      placarDaNoite(),
      el('div', { className: 'cp-linha' }, host ? botao(V.conv[me.key] === 'sim' ? 'Eu jogo' : 'Eu só assisto', () => { G.conv[me.key] = G.conv[me.key] === 'sim' ? 'nao' : 'sim'; difunde() }, 'cp-btn--tinta', 'Você também joga?') : '', ir))
  }

  // bilhete: chega para quem pode reagir. Duvidar, bloquear ou aceitar; se ignorar, aceita sozinho no fim do tempo.
  function bilhete() {
    const f = V.fase, p = V.p, j = eu()
    if (f === 'convite' && !souHost() && V.conv[me.key] === '?') {
      return montaBilhete(`conv:${V.id}`, V.host, [el('b', { textContent: V.hostNome }), ' chamou você para a mesa'], 'Coup · blefe e intriga na corte', null,
        [botao('Jogar', () => manda({ op: 'resp', sim: true }), 'cp-btn--lacre'), botao('Só assistir', () => manda({ op: 'resp', sim: false }), 'cp-btn--tinta')])
    }
    if (!j || j.fora || !p) return ''
    if (f === 'duvida' && p.duv?.key === me.key) {
      const alvo = p.duv.sobre === 'acao' ? p.ator : p.bloq.key
      return montaBilhete(`duv:${V.id}:${p.jan}`, alvo, ['Você vai duvidar de ', el('b', { textContent: N(alvo) })], 'Se for verdade, quem perde é você', { fim: V.recebido + p.duv.resta, tot: DUVIDA_MS },
        [botao('Duvidar agora', () => manda({ op: 'duvida', confirma: true }), 'cp-btn--lacre'), botao('Cancelar', () => manda({ op: 'duvida', confirma: false }), 'cp-btn--tinta')], 'duvida')
    }
    if (!(f === 'reacao' || f === 'bloqueio') || !p.eleg?.includes(me.key) || p.passou.includes(me.key)) return ''
    const tenho = new Set(j.cartas.filter(c => c.viva).map(c => c.c))
    const bts = []
    let quem, frase, sub, c
    if (f === 'bloqueio') {
      quem = p.bloq.key; c = p.bloq.carta
      frase = [el('b', { textContent: N(quem) }), ' diz ser ', nomeCarta(c)]
      sub = `e bloqueia ${p.ator === me.key ? 'sua ação' : N(p.ator)}`
      bts.push(botao('Duvidar', () => manda({ op: 'reage', tipo: 'contesta' }), 'cp-btn--lacre'))
    } else {
      quem = p.ator; c = p.carta
      frase = c ? [el('b', { textContent: N(quem) }), ' diz ser ', nomeCarta(c)] : [el('b', { textContent: N(quem) }), ' pede ajuda externa']
      sub = c ? `${ACOES[p.acao].nome}${p.alvo ? (p.alvo === me.key ? ' em você' : ` em ${N(p.alvo)}`) : ''} · ${ACOES[p.acao].fx}` : '+2 moedas · quem é Duque bloqueia'
      if (p.soBloq) { frase = [el('b', { textContent: N(quem) }), ' era mesmo ', nomeCarta(c)]; sub = 'Ainda dá para bloquear' }
      if (c && !p.soBloq) bts.push(botao('Duvidar', () => manda({ op: 'reage', tipo: 'contesta' }), 'cp-btn--lacre'))
      if (!p.bloq && (p.acao === 'ajuda' || p.alvo === me.key)) {
        const bl = p.acao === 'ajuda' ? ['duque'] : p.acao === 'assassinar' ? ['condessa'] : p.acao === 'extorquir' ? ['capitao', V.op.inq ? 'inquisidor' : 'embaixador'] : []
        for (const b of bl) { const bt = botao([el('img', { src: IMG(b), alt: '' }), `Sou ${sou(b)}`], () => manda({ op: 'reage', tipo: 'bloqueia', carta: b }), 'cp-btn--bloq' + (tenho.has(b) ? ' tenho' : ''), tenho.has(b) ? 'Você tem essa carta' : 'Seria blefe'); bt.style.setProperty('--c', PERS[b].cor); bts.push(bt) }
      }
    }
    bts.push(botao(f === 'bloqueio' ? 'Aceitar' : 'Deixar', () => manda({ op: 'reage', tipo: 'passa' }), 'cp-btn--tinta', 'Aceitar (acontece sozinho quando o tempo acaba)'))
    return montaBilhete(`${f}:${V.id}:${p.jan}`, quem, frase, sub, p.resta ? { fim: V.recebido + p.resta, tot: V.op.tempo * 1000 } : null, bts, '', c)
  }
  function montaBilhete(id, k, frase, sub, tempo, bts, cls = '', c = null) {
    const entra = novo('b:' + id)
    if (entra) som('papel')
    const b = el('div', { className: `cp-bilhete ${cls}` + (entra ? ' entra' : '') },
      el('div', { className: 'cp-bilhete__topo' },
        el('span', { className: 'cp-bilhete__quem' }, retrato(k, N(k)), c ? carta(c, { aberta: true, cls: 'cp-bilhete__carta' }) : ''),
        el('div', { className: 'cp-bilhete__txt' }, el('span', { className: 'cp-bilhete__frase' }, ...frase), el('small', { textContent: sub }))),
      el('div', { className: 'cp-bilhete__bts' }, ...bts))
    if (tempo) { b.append(el('i', { className: 'cp-pavio', 'data-fim': String(tempo.fim), 'data-tot': String(tempo.tot) })); b.querySelector('.cp-bilhete__topo').append(el('span', { className: 'cp-segs', 'data-fim': String(tempo.fim), 'data-tot': String(tempo.tot) })) }
    return b
  }
  function revanche() {
    if (!G) return
    const ant = new Set(G.js.map(j => j.key))
    G.conv = Object.fromEntries(ctx.presentes().map(k => [k, ant.has(k) || k === me.key ? 'sim' : '?']))
    Object.assign(G, { id: Math.random().toString(36).slice(2, 9), fase: 'convite', js: [], deck: [], p: null, vencedor: null, log: [], ev: [], evN: 0 })
    difunde()
  }

  // bandeja no meio: troca com a Corte e o resultado da investigação
  function modal() {
    const p = V.p, f = V.fase
    if (f === 'troca' && p.ator === me.key && p.troca?.opcoes) {
      const ok = botao(`Ficar com ${p.troca.manter === 1 ? 'esta' : 'estas'}`, () => { manda({ op: 'troca', sel }); sel = [] }, 'cp-btn--lacre')
      ok.disabled = sel.length !== p.troca.manter
      const cs = p.troca.opcoes.map((c, i) => { const n = carta(c, { aberta: true, cls: 'clicavel' + (sel.includes(i) ? ' sel' : '') + (i >= p.troca.manter ? ' nova' : '') }); n.addEventListener('click', () => { som('poe', 0, .5); sel = sel.includes(i) ? sel.filter(x => x !== i) : [...sel, i].slice(-p.troca.manter); render() }); return n })
      return el('div', { className: 'cp-bandeja' + (novo(`tr:${V.id}:${p.jan}`) ? ' entra' : '') }, el('b', { className: 'cp-bandeja__t', textContent: `Fique com ${p.troca.manter}` }), el('small', { textContent: 'As outras voltam embaralhadas para a Corte.' }), el('div', { className: 'cp-escolha' }, ...cs), ok)
    }
    if (f === 'investiga' && p.ator === me.key && p.inv?.c) {
      return el('div', { className: 'cp-bandeja' + (novo(`inv:${V.id}:${V.seq}`) ? ' entra' : '') }, el('b', { className: 'cp-bandeja__t', textContent: `A carta de ${N(p.alvo)}` }),
        el('div', { className: 'cp-escolha' }, carta(p.inv.c, { aberta: true, cls: 'grande' })),
        el('div', { className: 'cp-linha' }, botao('Deixar', () => manda({ op: 'investiga', trocar: false }), 'cp-btn--tinta'), botao('Obrigar a trocar', () => manda({ op: 'investiga', trocar: true }), 'cp-btn--lacre')))
    }
    return null
  }
  function logBox() {
    return el('div', { className: 'cp-log' }, el('ol', { className: 'cp-log__lista' }, ...V.log.slice(-40).map(t => el('li', { textContent: t }))))
  }
  function abreAjuda() {
    if (tela.querySelector('.cp-ajuda')) return tela.querySelector('.cp-ajuda').remove()
    const a = el('div', { className: 'cp-ajuda' }, el('img', { src: IMG('ajuda-turno'), alt: 'Resumo de turno' }), el('img', { src: IMG('ajuda-personagens'), alt: 'Os personagens' }))
    a.addEventListener('click', () => a.remove())
    tela.append(a)
  }

  /* ---------- animações (só o que acabou de acontecer) ---------- */
  const noTela = n => { const r = n.getBoundingClientRect(), t = tela.getBoundingClientRect(); return { x: r.left - t.left + r.width / 2, y: r.top - t.top + r.height / 2, w: r.width, h: r.height } }
  const pilhaDe = k => tela.querySelector(`.cp-pilha[data-moedas="${CSS.escape(k)}"]`)
  const lugarDe = k => tela.querySelector(`.cp-assento[data-key="${CSS.escape(k)}"]`) || (k === me.key ? tela.querySelector('.cp-eu') : null)
  function voaMoedas(de, para, n, atraso = 0) {
    const a = pilhaDe(de), b = pilhaDe(para)
    if (!a || !b) return
    const A = noTela(a), B = noTela(b)
    setTimeout(() => som(n >= 3 ? 'moedas' : 'moeda'), atraso)
    for (let i = 0; i < Math.min(n, 7); i++) {
      setTimeout(() => {
        const m = el('img', { className: 'cp-voa', src: IMG('moeda-prata'), alt: '' }); tela.append(m)
        const meio = { x: (A.x + B.x) / 2 + (Math.random() - .5) * 30, y: Math.min(A.y, B.y) - 30 - Math.random() * 25 }
        m.animate([
          { transform: `translate(${A.x}px,${A.y}px) translate(-50%,-50%) scale(.7) rotateY(0)`, opacity: 0 },
          { transform: `translate(${meio.x}px,${meio.y}px) translate(-50%,-50%) scale(1.05) rotateY(360deg)`, opacity: 1, offset: .5 },
          { transform: `translate(${B.x}px,${B.y}px) translate(-50%,-50%) scale(.8) rotateY(720deg)`, opacity: 1 }],
        { duration: 560, easing: 'cubic-bezier(.45,.05,.3,1)' }).onfinish = () => { m.remove(); b.classList.remove('pula'); void b.offsetWidth; b.classList.add('pula') }
      }, atraso + i * 85)
    }
  }
  function anima(evs) {
    let t = 0
    for (const e of evs) {
      const at = t
      if (e.t === 'inicio') { distribui(); t += 2200 }
      else if (e.t === 'moeda') { voaMoedas(e.de, e.para, e.qtd, at); t += 140 }
      else if (e.t === 'declara') { som(e.carta ? 'poe' : 'clique', at); if (!e.carta && e.acao !== 'ajuda') falaRapida(e.key, FALA[e.acao](N(e.alvo)), at) }
      else if (e.t === 'bloqueia') som('poe', at)
      else if (e.t === 'contesta') som('carimbo', at)
      else if (e.t === 'desiste') falaRapida(e.key, 'Deixa pra lá.', at)
      else if (e.t === 'prova') { revela(e, at); t += 1500 }
      else if (e.t === 'perde') { if (e.motivo === 'assassinato') som('punhal', at); som('descarta', at + 120); t += 300 }
      else if (e.t === 'golpe') { if (!e.punhal) som('golpe', at); setTimeout(() => { const s = lugarDe(e.alvo); s?.classList.add('golpeado'); setTimeout(() => s?.classList.remove('golpeado'), 700) }, at) }
      else if (e.t === 'bloqueado') falaRapida(e.por, 'Bloqueado.', at)
      else if (e.t === 'vence') { som('leque', at + 300); som('moedas', at + 500) }
      else if (e.t === 'compra' || e.t === 'devolve' || e.t === 'nova') { som('desliza', at); setTimeout(() => { const c = tela.querySelector('.cp-corte'); c?.classList.remove('mexe'); void c?.offsetWidth; c?.classList.add('mexe') }, at) }
      else if (e.t === 'mostrou') som('desliza', at)
      else if (e.t === 'saiu') { toast(`${e.nome} saiu da mesa`, 3200); som('desliza', at) }
    }
  }
  function falaRapida(k, txt, at = 0) {
    setTimeout(() => {
      const s = lugarDe(k); if (!s) return
      const b = poeBalao({ key: k, txt, lado: noTela(s).x < tela.clientWidth * .58 ? 'dir' : 'esq' }, true); if (!b) return
      setTimeout(() => b.classList.add('sai'), 1900); setTimeout(() => b.remove(), 2300)
    }, at)
  }
  // resultado da dúvida: a carta vira no meio da mesa; verdade = volta para a Corte, blefe = lacre vermelho
  function revela(e, at) {
    setTimeout(() => {
      const box = el('div', { className: 'cp-revela' + (e.ok ? ' ok' : ' blefe') },
        e.ok ? carta(e.c, { cls: 'cp-revela__carta' }) : el('div', { className: 'cp-revela__fantasma' }, carta(e.c, { aberta: true })),
        el('span', { className: 'cp-carimbo', textContent: e.ok ? 'Verdade' : 'Blefe' }),
        el('small', { textContent: e.ok ? `${N(e.key)} ${e.key === me.key ? 'era' : 'era'} ${sou(e.c)} · ${N(e.por)} perde uma influência` : `${N(e.key)} não era ${sou(e.c)}` }))
      tela.append(box)
      if (e.ok) { som('leque'); requestAnimationFrame(() => requestAnimationFrame(() => box.querySelector('.cp-carta')?.classList.add('aberta'))) }
      setTimeout(() => som('carimbo'), 420)
      setTimeout(() => { box.classList.add('sai'); if (e.ok) som('desliza') }, 2100)
      setTimeout(() => box.remove(), 2600)
    }, at)
  }
  // começo: embaralha no meio e distribui duas para cada um
  function distribui() {
    const corte = tela.querySelector('.cp-corte')
    if (!corte) { entregando = false; return }
    const C = noTela(corte)
    const ma = el('div', { className: 'cp-embaralha', style: `left:${C.x}px;top:${C.y}px;--w:${C.w}px` },
      ...Array.from({ length: 8 }, (_, i) => el('img', { src: IMG('verso'), alt: '', style: `--i:${i}` })))
    tela.append(ma)
    som('embaralhar')
    const alvos = [...tela.querySelectorAll('.cp-mao-mesa .cp-carta, .cp-mao .cp-carta')]
    const ordem = [0, 1].flatMap(i => alvos.filter(n => n.dataset.i === String(i)))
    setTimeout(() => {
      ma.remove()
      ordem.forEach((n, k) => setTimeout(() => {
        if (!n.isConnected) return
        const B = noTela(n)
        const v = el('img', { className: 'cp-voa cp-voa--carta', src: IMG('verso'), alt: '', style: `width:${B.w}px;height:${B.h}px` }); tela.append(v)
        som('desliza')
        v.animate([{ transform: `translate(${C.x}px,${C.y}px) translate(-50%,-50%) rotate(${rnd(40) - 20}deg) scale(.7)` }, { transform: `translate(${B.x}px,${B.y}px) translate(-50%,-50%)` }], { duration: 380, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => {
          v.remove(); n.classList.remove('oculta')
          if (n.closest('.cp-mao')) { n.classList.remove('aberta'); requestAnimationFrame(() => requestAnimationFrame(() => { n.classList.add('aberta'); som('poe', 120, .7) })) }
        }
      }, k * 110))
      setTimeout(() => { entregando = false; tela.querySelectorAll('.cp-carta.oculta').forEach(n => n.classList.remove('oculta')) }, ordem.length * 110 + 500)
    }, 1500)
  }
  // timers (bilhete, anel de quem age, pavio da dúvida) sem re-render; e quem está falando
  ;(function loop() {
    if (V) {
      for (const tm of tela.querySelectorAll('[data-fim]')) {
        const r = Math.max(0, +tm.dataset.fim - Date.now()), tot = +tm.dataset.tot || 1
        tm.style.setProperty('--t', String(r / tot)); tm.classList.toggle('fim', r < 2000)
        if (tm.classList.contains('cp-segs') && r > 0 && r <= 3000) { const sx = Math.ceil(r / 1000); if (tm.dataset.tic !== String(sx)) { tm.dataset.tic = String(sx); som('tique', 0, sx === 1 ? 1.25 : 1) } }
        if (tm.classList.contains('cp-segs')) { const sx = Math.ceil(r / 1000); const t = sx > 99 ? `${Math.floor(sx / 60)}:${String(sx % 60).padStart(2, '0')}` : `${sx}s`; if (tm.textContent !== t) tm.textContent = t }
      }
      const pres = new Set(ctx.presentes())
      for (const s of tela.querySelectorAll('.cp-assento[data-key], .cp-eu[data-key]')) { s.classList.toggle('fala', !!ctx.falando?.(s.dataset.key)); s.classList.toggle('caiu', !pres.has(s.dataset.key)) }
    }
    setTimeout(() => requestAnimationFrame(loop), 80)
  })()
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && mira) { mira = null; render() } })
  // informação ao passar o mouse (moedas, Corte, cartas reveladas)
  const dica = el('div', { className: 'cp-info', hidden: true })
  tela.addEventListener('pointermove', e => {
    const a = e.target.closest?.('[data-info]')
    if (!a || !tela.contains(a)) { dica.hidden = true; return }
    if (dica.parentNode !== tela) tela.append(dica)
    const [t, ...rs] = a.getAttribute('data-info').split('\n')
    if (dica.dataset.txt !== a.getAttribute('data-info')) { dica.dataset.txt = a.getAttribute('data-info'); dica.replaceChildren(el('b', { textContent: t }), ...rs.map(r => el('span', { textContent: r }))) }
    dica.hidden = false
    const r = tela.getBoundingClientRect(), w = dica.offsetWidth, h = dica.offsetHeight
    dica.style.left = Math.min(e.clientX - r.left + 14, r.width - w - 8) + 'px'
    dica.style.top = Math.max(8, e.clientY - r.top - h - 12) + 'px'
  })
  tela.addEventListener('pointerleave', () => { dica.hidden = true })

  /* ---------- entrada ---------- */
  function iniciar() {
    carregaSons()
    if (V && !souHost()) return toast(`Já tem uma mesa de Coup aberta (de ${V.hostNome})`)
    if (G) return toast('A mesa já está aberta')
    abrir()
  }
  window.__coup = () => ({ G, V, render }) // diagnóstico/testes
  return {
    got: (d, k) => { carregaSons(); got(d, k) }, iniciar, ativo: () => !!V,
    entrouAlguem: key => { if (!G || G.host !== me.key) return; if (G.fase === 'convite' && !(key in G.conv)) { G.conv[key] = '?'; return difunde() } ctx.sendTo(key, { coup: { v: vista(key) } }) },
  }
}
