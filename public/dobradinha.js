// Dobradinha: jogo de escalada numa mesa de boteco. Cada um joga uma carta (ou duas iguais) de valor igual ou maior que o
// da lousa; empatar o valor dobra. Quem não pode (ou não quer) subir leva as cartas da mesa para a comanda, e cartas na
// comanda são ruins: no fim da rodada, quem tem mais cartas faz menos pontos. Depois de jogar, a vez já passa e a pessoa
// tem REPOR_MS para repor a mão clicando no monte (o jogo não espera); quem não repõe a tempo fica com o guarda-chuva
// esquecido (-1 ponto na rodada).
// Mesma arquitetura dos outros jogos: o host guarda tudo e manda para cada um só o que pode ver ({ db: ... }).

import { criaAula } from './aula.js'
import { passosDobradinha } from './dobradinha-aula.js'

const SOM = n => `jogos/coup/sons/${n}.mp3`
const CAPA = 'jogos/dobradinha/capa.webp', MARCA = 'jogos/dobradinha/marca.webp'
const SONS = ['embaralhar', 'desliza1', 'desliza2', 'desliza3', 'poe1', 'poe2', 'leque', 'carimbo', 'papel', 'vez', 'clique', 'tique', 'pular', 'inverter', 'moedas', 'golpe']
const VOL = { embaralhar: .5, carimbo: .6, papel: .45, vez: .5, clique: .3, tique: .28, pular: .6, inverter: .6, moedas: .5, golpe: .45, leque: .7 }
const SAIU_MS = 12000, HOST_MS = 10000, MIN_JOG = 2, MAX_JOG = 6
const REPOR_MS = 9000 // depois de jogar: tempo para repor a mão (a vez já seguiu para o próximo)
const RODADAS = [[1, '1 rodada'], [3, '3 rodadas'], ['n', '1 por pessoa']]
// 50 cartas numeradas (valor: quantidade) + 3 curingas, 2 "passa" e 2 "inverte"
const QTD = { 2: 5, 3: 6, 4: 6, 5: 6, 6: 6, 7: 5, 8: 4, 9: 3, 10: 3, 11: 3, 12: 3 }
const NOME_ACAO = { cur: 'Curinga', passa: 'Passa', inv: 'Inverte' }

const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n }
const embaralha = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]] } return a }
const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch {} } }
const num = c => typeof c.v === 'number'
const nomeCarta = c => num(c) ? String(c.v) : NOME_ACAO[c.v]

function baralho(nJog) {
  const d = []; let id = 0
  for (const [v, q] of Object.entries(QTD)) for (let k = 0; k < q; k++) d.push({ id: id++, v: +v })
  for (let k = 0; k < 3; k++) d.push({ id: id++, v: 'cur' })
  for (let k = 0; k < 2; k++) d.push({ id: id++, v: 'passa' })
  if (nJog > 2) for (let k = 0; k < 2; k++) d.push({ id: id++, v: 'inv' }) // com 2 pessoas o inverte sai do baralho
  return embaralha(d)
}

// a jogada vale? devolve o novo valor da lousa (ou null). esc = valor escolhido quando só há curingas.
function calcula(cs, valor, esc) {
  if (!cs.length || cs.length > 2) return null
  if (cs.some(c => c.v === 'passa' || c.v === 'inv')) return cs.length === 1 ? { val: valor, dobrou: false, acao: cs[0].v } : null
  const nums = cs.filter(num)
  let v
  if (nums.length) { if (nums.some(c => c.v !== nums[0].v)) return null; v = nums[0].v }
  else { v = Math.round(+esc); if (!(v >= 2 && v <= 12)) return null }
  const soma = v * cs.length
  if (valor && soma < valor) return null
  const dobrou = soma === valor
  return { val: dobrou ? soma * 2 : soma, dobrou, base: v }
}
const soCuringa = cs => cs.length && cs.every(c => c.v === 'cur')
const ESCOLHAS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const possivel = (cs, valor) => soCuringa(cs) ? ESCOLHAS.some(e => calcula(cs, valor, e)) : !!calcula(cs, valor)

// desenhos próprios (linha e chapado, no estilo de azulejo pintado)
const SVG = {
  passa: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"><path d="M11 18h26M11 30h26"/></svg>',
  inv: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20a12 12 0 0 1 21-6l3 3"/><path d="M36 9v8h-8"/><path d="M36 28a12 12 0 0 1-21 6l-3-3"/><path d="M12 39v-8h8"/></svg>',
  guarda: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 23a18 16 0 0 1 36 0c-2.4-2-5-2-7.2 0-2.2-2-4.8-2-7.2 0-2.2-2-5-2-7.2 0-2.2-2-4.8-2-7.2 0-2.2-2-4.8-2-7.2 0z" fill="currentColor" fill-opacity=".18"/><path d="M24 7v1.6M24 23v14a4 4 0 0 1-8 0"/></svg>',
  seta: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M40 24a16 16 0 1 1-5-11.6"/><path d="M36 5v8h-8"/></svg>',
}

export function criaDobradinha(ctx) {
  const { icon, toast, sysMsg, me } = ctx
  const tela = ctx.tela
  // o ctx.el não transforma data-* em atributo: este wrapper faz (os seletores [data-...] dependem disso)
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
  const idx = k => G.js.findIndex(j => j.key === k)
  const log = t => { G.log.push(t); if (G.log.length > 80) G.log.splice(0, G.log.length - 80) }
  const ev = e => { G.ev.push({ ...e, n: ++G.evN }); if (G.ev.length > 40) G.ev.splice(0, G.ev.length - 40) }
  const depois = (i, passos) => ((i + passos * G.dir) % G.js.length + G.js.length) % G.js.length
  const maoMax = () => G.js.length >= 6 ? 5 : 6
  const nMesa = () => G.mesa.reduce((s, p) => s + p.cartas.length, 0)

  function abrir(chamados) {
    const op = ls.get('db.op') || {}
    G = { id: Math.random().toString(36).slice(2, 9), host: me.key, hostNome: me.name, fase: 'convite',
      op: { rodadas: RODADAS.some(([v]) => v === op.rodadas) ? op.rodadas : 3 },
      conv: Object.fromEntries(ctx.presentes().map(k => [k, k === me.key || chamados?.includes(k) ? 'sim' : '?'])),
      js: [], monte: [], fora: [], mesa: [], valor: 0, dir: 1, vez: 0, etapa: 'joga', esq: null, rodada: 0, nRodadas: 3,
      resumo: null, vencedores: [], ultFim: null, prazo: 0, repor: {}, log: [], ev: [], evN: 0, seq: 0, t: Date.now() }
    sysMsg(`${me.name} abriu uma mesa de Dobradinha`)
    difunde()
  }
  function comecar() {
    if (G?.fase !== 'convite') return
    const pres = new Set(ctx.presentes())
    const ks = embaralha(Object.keys(G.conv).filter(k => G.conv[k] === 'sim' && pres.has(k)))
    if (ks.length < MIN_JOG) return toast(`Precisa de pelo menos ${MIN_JOG} pessoas.`)
    if (ks.length > MAX_JOG) return toast(`No máximo ${MAX_JOG} pessoas.`)
    ls.set('db.op', G.op)
    G.js = ks.map(k => ({ key: k, nome: ctx.nomeDe(k), mao: [], conta: 0, pts: [], tot: 0 }))
    G.nRodadas = G.op.rodadas === 'n' ? ks.length : G.op.rodadas
    G.rodada = 0; G.dir = 1; G.vez = rnd(ks.length); G.log = []; G.vencedores = []; G.ultFim = null
    sysMsg(`Dobradinha começou: ${G.js.map(j => j.nome).join(', ')}`)
    novaRodada(true)
  }
  function novaRodada(primeira) {
    G.rodada++
    G.monte = baralho(G.js.length)
    G.fora = G.js.length === 2 ? G.monte.splice(0, 10) : [] // com 2 pessoas, 10 cartas ficam de fora a cada rodada
    for (const j of G.js) { j.mao = G.monte.splice(-maoMax()); j.conta = 0 }
    G.mesa = []; G.valor = 0; G.esq = null; G.etapa = 'joga'; G.resumo = null; G.prazo = 0; G.repor = {}
    if (!primeira) {
      // começa quem tem menos pontos; empate: o primeiro no sentido do jogo depois de quem fechou a rodada
      const i0 = Math.max(0, idx(G.ultFim))
      const ordem = Array.from({ length: G.js.length }, (_, s) => depois(i0, s + 1))
      const min = Math.min(...G.js.map(j => j.tot))
      G.vez = ordem.find(i => G.js[i].tot === min)
    }
    G.fase = 'jogo'
    log(`Rodada ${G.rodada} de ${G.nRodadas}. ${G.js[G.vez].nome} abre.`)
    ev({ t: 'inicio', rodada: G.rodada })
    difunde()
  }
  // partidas salvas no formato antigo (vez parada esperando repor): solta a vez
  function armaTempo() {
    clearTimeout(timer)
    G.repor ||= {}
    if (G.etapa === 'repor' && G.fase === 'jogo') { G.repor[G.js[G.vez].key] = Date.now() + REPOR_MS; G.etapa = 'joga'; G.vez = depois(G.vez, 1) }
    G.prazo = 0
  }
  // quem jogou e ainda não repôs: o jogo segue; acabou o tempo, fica com o guarda-chuva
  setInterval(() => {
    if (!G || G.host !== me.key || G.fase !== 'jogo' || !G.repor) return
    const agora = Date.now(), vencidos = Object.keys(G.repor).filter(k => agora >= G.repor[k])
    if (!vencidos.length) return
    for (const k of vencidos) esqueceu(k)
    difunde()
  }, 250)
  function esqueceu(key) {
    delete G.repor[key]
    const j = jog(key)
    if (!j || j.mao.length >= maoMax() || !G.monte.length) return
    G.esq = key
    ev({ t: 'esqueceu', key })
    log(`${j.nome} não repôs a mão a tempo e ficou com o guarda-chuva.`)
    // mão vazia não dá para jogar: compra o que falta mesmo assim
    if (!j.mao.length) { const n = Math.min(maoMax(), G.monte.length); j.mao.push(...G.monte.splice(-n)); ev({ t: 'compra', key, qtd: n }) }
  }
  function avanca() {
    clearTimeout(timer)
    G.vez = depois(G.vez, 1); G.etapa = 'joga'; G.prazo = 0
    difunde()
  }
  function jogar(key, { cartas, esc }) {
    const i = idx(key), j = G.js[i]
    if (G.fase !== 'jogo' || i !== G.vez || G.etapa !== 'joga' || !Array.isArray(cartas)) return
    const ids = [...new Set(cartas.map(Number))]
    const cs = ids.map(id => j.mao.find(c => c.id === id))
    if (!cs.length || cs.some(c => !c)) return
    const r = calcula(cs, G.valor, esc)
    if (!r) return
    j.mao = j.mao.filter(c => !ids.includes(c.id))
    const antes = G.valor
    const esc2 = cs.some(c => c.v === 'cur') ? r.base : null
    G.mesa.push({ por: key, cartas: cs, val: r.val, esc: esc2, dobrou: r.dobrou })
    G.valor = r.val
    ev({ t: 'joga', key, cartas: cs, val: r.val, antes, dobrou: r.dobrou, acao: r.acao || null, esc: esc2 })
    if (r.acao === 'inv') { G.dir *= -1; ev({ t: 'inverte', dir: G.dir, key }); log(`${j.nome} inverteu o sentido.`) }
    else if (r.acao === 'passa') log(`${j.nome} passou adiante (a lousa fica em ${G.valor}).`)
    else log(`${j.nome} jogou ${cs.map(nomeCarta).join(' + ')}${r.dobrou ? ` e dobrou: ${r.val}` : `: ${r.val}`}.`)
    if (!j.mao.length && !G.monte.length) return fimRodada(key)
    // a vez segue na hora; quem jogou repõe a mão quando quiser, dentro do tempo
    if (G.monte.length && j.mao.length < maoMax()) (G.repor ||= {})[key] = Date.now() + REPOR_MS
    avanca()
  }
  function pegar(key) {
    const i = idx(key), j = G.js[i]
    if (G.fase !== 'jogo' || i !== G.vez || G.etapa !== 'joga' || !G.mesa.length) return
    const n = nMesa()
    j.conta += n; G.mesa = []; G.valor = 0
    ev({ t: 'pegou', key, qtd: n })
    log(`${j.nome} levou ${n} carta${n === 1 ? '' : 's'} para a comanda e abre a próxima.`)
    difunde() // a vez continua com quem levou: abre a escalada nova
  }
  function comprar(key) {
    const j = jog(key)
    if (G.fase !== 'jogo' || !j || !G.repor?.[key]) return
    delete G.repor[key]
    const n = Math.min(maoMax() - j.mao.length, G.monte.length)
    if (n > 0) { j.mao.push(...G.monte.splice(-n)); ev({ t: 'compra', key, qtd: n }) }
    difunde()
  }
  function passar(key) {
    if (G.fase !== 'jogo' || !G.repor?.[key]) return
    esqueceu(key)
    difunde()
  }
  function fimRodada(key) {
    clearTimeout(timer)
    G.ultFim = key; G.prazo = 0; G.etapa = 'joga'; G.repor = {}
    // quem tem mais cartas fica em 1º e faz 1 ponto; empate divide a posição e pula as seguintes
    G.resumo = G.js.map(j => {
      const pos = 1 + G.js.filter(o => o.conta > j.conta).length
      const pts = pos - (G.esq === j.key ? 1 : 0)
      return { key: j.key, conta: j.conta, pos, pts, esq: G.esq === j.key }
    })
    for (const r of G.resumo) { const j = jog(r.key); j.pts.push(r.pts); j.tot += r.pts }
    ev({ t: 'rodada', key })
    log(`${jog(key).nome} jogou a última carta. Fim da rodada ${G.rodada}.`)
    if (G.rodada >= G.nRodadas) {
      const max = Math.max(...G.js.map(j => j.tot))
      let vs = G.js.filter(j => j.tot === max)
      if (vs.length > 1) { const mc = Math.min(...vs.map(j => j.conta)); vs = vs.filter(j => j.conta === mc) }
      G.vencedores = vs.map(j => j.key)
      G.fase = 'fim'
      ev({ t: 'vence', keys: G.vencedores })
      sysMsg(`🏆 ${vs.map(j => j.nome).join(' e ')} ${vs.length > 1 ? 'venceram' : 'venceu'} a Dobradinha`)
    } else G.fase = 'placar'
    difunde()
  }
  function revanche() {
    const ant = new Set(G.js.map(j => j.key))
    G.conv = Object.fromEntries(ctx.presentes().map(k => [k, ant.has(k) || k === me.key ? 'sim' : '?']))
    Object.assign(G, { id: Math.random().toString(36).slice(2, 9), fase: 'convite', js: [], monte: [], fora: [], mesa: [], valor: 0, esq: null, resumo: null, vencedores: [], log: [], ev: [], evN: 0, prazo: 0 })
    difunde()
  }
  function hostRecebe(d, key) {
    if (!G || !key || d.id !== G.id) return
    switch (d.op) {
      case 'resp': if (G.fase === 'convite') { G.conv[key] = d.sim ? 'sim' : 'nao'; difunde() } break
      case 'sai': if (key !== G.host) remove(key); break // saiu para outra mesa
      case 'joga': jogar(key, d); break
      case 'pega': pegar(key); break
      case 'compra': comprar(key); break
      case 'passa': passar(key); break
    }
  }
  function vista(k) {
    return {
      id: G.id, seq: G.seq, host: G.host, hostNome: G.hostNome, fase: G.fase, op: G.op, conv: G.conv,
      js: G.js.map(j => ({ key: j.key, nome: j.nome, n: j.mao.length, conta: j.conta, tot: j.tot, pts: j.pts })),
      mao: jog(k)?.mao || null, mesa: G.mesa.slice(-6), nMesa: nMesa(), valor: G.valor, monte: G.monte.length, max: G.js.length ? maoMax() : 6,
      vez: G.js[G.vez]?.key || null, etapa: G.etapa, esq: G.esq, dir: G.dir, rodada: G.rodada, nRodadas: G.nRodadas,
      resumo: G.resumo, vencedores: G.vencedores, log: G.log.slice(-40), ev: G.ev, prazo: 0,
      repor: Object.fromEntries(Object.entries(G.repor || {}).map(([k, t]) => [k, Math.max(0, t - Date.now())])), // quem ainda pode repor (ms que faltam)
    }
  }
  function difunde() {
    if (!G) return
    G.seq++; G.t = Date.now()
    ls.set('db.G', G)
    const ks = new Set([...ctx.presentes(), ...G.js.map(j => j.key), ...Object.keys(G.conv || {})])
    for (const k of ks) if (k !== me.key) ctx.sendTo(k, { db: { v: vista(k) } })
    // cópia completa para o sucessor (o próximo jogador conectado), para ele assumir se eu cair
    const pres = new Set(ctx.presentes())
    G.sucessor = G.js.map(j => j.key).find(k => k !== me.key && pres.has(k)) || [...pres].find(k => k !== me.key) || null
    if (G.sucessor) ctx.sendTo(G.sucessor, { db: { bk: G } })
    aplica(vista(me.key))
  }
  // alguém saiu de vez: a mão volta para o monte, a comanda vai embora com a pessoa
  function remove(key) {
    if (G.fase === 'convite') { if (key in G.conv) { delete G.conv[key]; difunde() } return }
    const i = idx(key)
    if (i < 0) return
    const j = G.js[i], nome = j.nome
    G.monte.push(...j.mao); embaralha(G.monte)
    if (G.esq === key) G.esq = null
    if (G.repor) delete G.repor[key]
    const eraVez = i === G.vez
    G.js.splice(i, 1)
    ausDesde.delete(key)
    ev({ t: 'saiu', key, nome }); log(`${nome} saiu da mesa.`); sysMsg(`${nome} saiu da Dobradinha`)
    if (G.fase === 'fim') return difunde()
    if (G.js.length < MIN_JOG) {
      clearTimeout(timer)
      if (!G.js.length) return encerrar()
      G.fase = 'fim'; G.vencedores = [G.js[0].key]; G.prazo = 0; G.resumo = null
      ev({ t: 'vence', keys: G.vencedores })
      return difunde()
    }
    const n = G.js.length
    if (eraVez) { G.vez = G.dir > 0 ? i % n : (i - 1 + n) % n; G.etapa = 'joga'; G.prazo = 0; clearTimeout(timer) }
    else if (i < G.vez) G.vez--
    difunde()
  }
  function encerrar() {
    if (!G) return
    clearTimeout(timer)
    ctx.send({ db: { fim: G.id } })
    ls.set('db.G', null)
    G = null
    aplica(null)
  }
  setInterval(() => {
    if (!G && !restaurou && me.key) {
      restaurou = true
      const s = ls.get('db.G')
      // volta só se ninguém assumiu a mesa no lugar
      if (s && s.host === me.key && (s.fase === 'jogo' || s.fase === 'placar') && Date.now() - s.t < 3 * 3600e3) setTimeout(() => { if (G || (V && V.host !== me.key)) return ls.set('db.G', null); G = s; armaTempo(); difunde() }, 3000)
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
    sysMsg(`${nomeAntigo} caiu: ${me.name} assumiu a mesa da Dobradinha`)
    armaTempo()
    remove(antigo)
    if (G) difunde()
  }

  /* =================================================================== cliente */
  let V = null, ultEv = 0, dispensado = '', sel = [], escolhe = false, entregando = false
  const vistos = new Set()
  const novo = id => { if (vistos.has(id)) return false; vistos.add(id); return true }
  const souHost = () => V && V.host === me.key
  const eu = () => V?.js.find(j => j.key === me.key)
  const N = k => k === me.key ? 'Você' : (V?.js.find(j => j.key === k)?.nome || ctx.nomeDe(k))
  const minhaVez = () => V?.fase === 'jogo' && V.vez === me.key
  const podeRepor = () => V?.fase === 'jogo' && V.repor?.[me.key] > 0 && V.mao && V.mao.length < V.max && V.monte > 0
  function manda(d) {
    if (!V) return
    const m = { id: V.id, ...d }
    if (souHost()) hostRecebe(m, me.key)
    else ctx.sendTo(V.host, { db: { op: m } })
  }
  function got(d, deKey) {
    if (!d) return
    if (d.op) { if (G && G.host === me.key) hostRecebe(d.op, deKey); return }
    if (d.fim) { if (V?.id === d.fim) aplica(null); return }
    if (d.bk) { if (d.bk.host === deKey) backup = d.bk; return }
    if (d.v) {
      // eu caí e alguém assumiu: deixo de ser host
      if (G && d.v.id === G.id && d.v.host !== me.key) { clearTimeout(timer); G = null; ls.set('db.G', null) }
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
      sel = []; escolhe = false
    }
    V = v
    if (v) v.recebido = Date.now()
    if (antes?.vez !== v?.vez || antes?.etapa !== v?.etapa || antes?.valor !== v?.valor) { sel = []; escolhe = false }
    if (v?.mao) sel = sel.filter(id => v.mao.some(c => c.id === id))
    if (v && v.fase === 'jogo' && v.vez === me.key && v.etapa === 'joga' && antes && (antes.vez !== me.key || antes.etapa !== 'joga')) setTimeout(() => som('vez'), 350)
    const evs = v ? v.ev.filter(e => e.n > ultEv) : []
    if (v) ultEv = Math.max(ultEv, ...v.ev.map(e => e.n))
    if (evs.some(e => e.t === 'inicio')) entregando = true
    // vai levar a mesa: guarda onde estava cada carta antes de o render apagar a escalada
    const foto = evs.some(e => e.t === 'pegou') ? fotoMesa(antes) : null
    render(antes)
    if (v) anima(evs, antes, foto)
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
  const botao = (conteudo, fn, cls = '', title = '') => { const b = el('button', { type: 'button', className: `db-btn ${cls}`, title }); b.append(...[conteudo].flat()); b.addEventListener('click', e => { e.stopPropagation(); b.blur(); som('clique'); fn(e) }); return b }
  const svg = (k, cls = '') => { const s = el('span', { className: `db-svg ${cls}` }); s.innerHTML = SVG[k]; return s }
  const grupo = v => v <= 4 ? 'baixo' : v <= 8 ? 'meio' : 'alto'
  function simbolo(c, canto) {
    if (num(c)) return el('span', { className: 'db-num', textContent: String(c.v) })
    if (c.v === 'cur') return el('span', { className: 'db-num', textContent: '?' })
    return svg(c.v)
  }
  function carta(c, cls = '', esc = null) {
    if (!c) return el('div', { className: `db-carta db-costas ${cls}` }, el('span', { className: 'db-costas__selo', textContent: 'Dobradinha' }))
    const tipo = num(c) ? `db-n db-g-${grupo(c.v)}` : `db-${c.v}`
    return el('div', { className: `db-carta ${tipo} ${cls}`, 'data-id': String(c.id), 'data-v': String(c.v) },
      el('i', { className: 'db-orn' }), el('i', { className: 'db-brilho' }),
      el('span', { className: 'db-canto' }, simbolo(c, true)),
      el('span', { className: 'db-meio' }, simbolo(c), c.v === 'cur' ? el('small', { className: 'db-sub', textContent: esc ? `valeu ${esc}` : '2 a 12' }) : c.v === 'passa' ? el('small', { className: 'db-sub', textContent: 'passa' }) : c.v === 'inv' ? el('small', { className: 'db-sub', textContent: 'inverte' }) : ''),
      el('span', { className: 'db-canto db-canto--b' }, simbolo(c, true)))
  }
  const guarda = (cls = '') => el('div', { className: `db-guarda ${cls}`, 'data-info': 'Guarda-chuva esquecido\nQuem não repõe a mão a tempo fica com ele: −1 ponto no fim da rodada' }, svg('guarda'))
  const retrato = (k, nm, cls = '') => el('span', { className: `db-retrato ${cls}` }, ctx.pfp(k, 64, nm))
  // comanda: os risquinhos de giz contam as cartas levadas (grupos de 5)
  function comanda(n, key, cls = '') {
    const grupos = Math.floor(n / 5), resto = n % 5
    const riscos = el('span', { className: 'db-riscos' },
      ...Array.from({ length: Math.min(grupos, 4) }, () => el('i', { className: 'db-cinco' })),
      ...Array.from({ length: grupos > 4 ? 0 : resto }, () => el('i', { className: 'db-um' })))
    return el('div', { className: `db-comanda ${cls}`, 'data-conta': key, 'data-info': `Comanda: ${n} carta${n === 1 ? '' : 's'} levada${n === 1 ? '' : 's'}\nMais cartas, menos pontos no fim da rodada` },
      el('b', { className: 'db-comanda__n', textContent: String(n) }), n ? riscos : el('span', { className: 'db-comanda__zero', textContent: 'limpa' }))
  }
  const giro = id => ((id * 37) % 13) - 6

  function angulos(n, comigo) {
    if (!comigo) return Array.from({ length: n }, (_, i) => 90 + 180 / n + i * 360 / n)
    if (n === 1) return [270]
    const span = Math.min(220, 72 * (n - 1)), a0 = 270 - span / 2
    return Array.from({ length: n }, (_, i) => a0 + i * span / (n - 1))
  }
  const pos = (ang, rx, ry) => ({ x: 50 + rx * Math.cos(ang * Math.PI / 180), y: 50 + ry * Math.sin(ang * Math.PI / 180) })

  /* ---------- render ---------- */
  /* ---------- aula: tutorial em passos (na página inicial e no botão Como jogar) ---------- */
  let aula = null, aulaDois = null, aulaAberta = false
  function pegaAula() {
    const dois = V?.fase !== 'convite' && V?.js?.length === 2
    if (!aula || aulaDois !== dois) {
      aula?.para(); aulaDois = dois
      aula = criaAula({ el, icon, hydrate: ctx.hydrate, som: (n, at, v) => som(n, at, v), cls: 'dba', passos: passosDobradinha({ el, carta, svg, guarda, dois }) })
    }
    return aula
  }
  function aulaModal() {
    if (!aulaAberta || V.fase === 'convite') return ''
    const fecha = () => { aulaAberta = false; aula?.para(); render() }
    const m = el('div', { className: 'db-aulamodal' }, pegaAula().raiz, botao(icon('x'), fecha, 'db-btn--ic db-aulamodal__x', 'Fechar'))
    m.addEventListener('click', e => { if (e.target === m) fecha() })
    return m
  }

  function render(antes) {
    tela.classList.toggle('db--on', !!V)
    ctx.onAtivo?.(!!V)
    if (!V) { tela.replaceChildren(); vistos.clear(); return }
    const conv = V.fase === 'convite', j = eu()
    const lugares = conv ? Object.keys(V.conv).filter(k => k !== me.key).map(k => ({ key: k, nome: ctx.nomeDe(k), conv: V.conv[k] }))
      : (() => { const js = V.js; const i = js.findIndex(x => x.key === me.key); return i < 0 ? js : [...js.slice(i + 1), ...js.slice(0, i)] })()
    const angs = angulos(lugares.length, conv || !!j)
    const plano = el('div', { className: 'db-plano' }, el('div', { className: 'db-lata' }), conv ? '' : centro())
    lugares.forEach((x, n) => plano.append(...assento(x, angs[n])))
    const topoBar = el('header', { className: 'db-topo' },
      el('img', { className: 'db-logo', src: MARCA, alt: 'Dobradinha', draggable: false }),
      !conv && V.rodada ? el('span', { className: 'db-rodada', textContent: `rodada ${V.rodada} de ${V.nRodadas}` }) : '',
      el('span', { className: 'db-grow' }),
      conv ? '' : botao(icon('lightbulb'), () => { aulaAberta = !aulaAberta; if (aulaAberta) pegaAula().reinicia(); else aula?.para(); render() }, 'db-btn--ic' + (aulaAberta ? ' on' : ''), 'Como jogar'),
      botao(icon('list-music'), () => tela.querySelector('.db-log')?.classList.toggle('aberto'), 'db-btn--ic', 'O que aconteceu'),
      souHost() ? botao(icon('x'), e => confirma(e.currentTarget, 'Fechar a mesa?', encerrar), 'db-btn--ic', 'Fechar a mesa para todos')
        : botao(icon('x'), () => { dispensado = V.id; aplica(null) }, 'db-btn--ic', 'Sair da mesa (só para você)'))
    const kids = [el('div', { className: 'db-azulejos' }), el('div', { className: 'db-palco' }, plano), topoBar, status(), cola(), minhaArea(antes), controles(), meio(), bilhete(),
      el('div', { className: 'db-log' }, el('ol', {}, ...V.log.slice(-40).map(t => el('li', { textContent: t }))))]
    const am = aulaModal()
    if (am) kids.push(am)
    if (!conv && V.fase !== 'fim' && !ctx.presentes().includes(V.host)) kids.push(el('div', { className: 'db-pausa' }, el('b', { textContent: 'Partida pausada' }), el('span', { textContent: `${V.hostNome} abriu a mesa e caiu. Continua de onde parou quando voltar.` })))
    tela.replaceChildren(...kids)
    tela.classList.toggle('acabou', V.fase === 'fim' || V.fase === 'placar')
    ctx.hydrate(tela)
    if (entregando) tela.querySelectorAll('.db-mao .db-carta, .db-leque-mesa .db-carta').forEach(n => n.classList.add('oculta'))
    tela.querySelector('.db-log ol')?.scrollTo(0, 1e6)
    if (aula?.raiz.isConnected) aula.acorda(); else aula?.para()
  }
  function status() {
    if (V.fase !== 'jogo') return ''
    const minha = V.vez === me.key, quem = N(V.vez)
    let txt
    if (!V.nMesa) txt = minha ? [el('b', { textContent: 'Sua vez' }), ': abra a escalada com qualquer carta ou par'] : [el('b', { textContent: quem }), ' abre a escalada']
    else txt = minha ? [el('b', { textContent: 'Sua vez' }), ': jogue ', el('b', { textContent: `${V.valor} ou mais` }), ` (${V.valor} cravado dobra) ou leve a mesa`] : [el('b', { textContent: quem }), ' precisa de ', el('b', { textContent: `${V.valor} ou mais` })]
    const ult = V.log[V.log.length - 1]
    const repor = podeRepor() ? el('span', { className: 'db-status__repor' }, 'Reponha a mão: ', el('b', { textContent: 'clique no monte' }), ' antes do tempo acabar') : ''
    return el('div', { className: 'db-status' + (minha ? ' minha' : '') }, el('span', { className: 'db-status__vez' }, ...txt), repor, ult ? el('small', { className: 'db-status__ult', textContent: ult }) : '')
  }
  let colaAberta = ls.get('db.cola') !== false
  function cola() {
    if (V.fase === 'convite') return ''
    const dois = V.js.length === 2
    const item = (c, nome, txt, extra = '') => el('li', { className: `db-cola__it ${extra}` }, c, el('span', {}, el('b', { textContent: nome }), el('small', { textContent: txt })))
    const box = el('aside', { className: 'db-cola' + (colaAberta ? ' aberta' : '') },
      el('button', { type: 'button', className: 'db-cola__aba', title: colaAberta ? 'Esconder a cola' : 'Mostrar a cola: o que cada carta faz' },
        el('span', { className: 'db-cola__leque' }, carta({ id: 901, v: 'cur' }, 'db-micro'), carta({ id: 902, v: 'passa' }, 'db-micro'), carta({ id: 903, v: 'inv' }, 'db-micro')), el('b', { textContent: 'cola' })),
      el('ul', { className: 'db-cola__lista' },
        item(el('span', { className: 'db-cola__regra', textContent: '≥' }), 'Subir', 'jogue igual ou maior que a lousa'),
        item(el('span', { className: 'db-cola__regra db-cola__regra--x2', textContent: '×2' }), 'Cravou, dobrou', 'igual ao valor da lousa: ele dobra'),
        item(el('span', { className: 'db-cola__regra', textContent: '+' }), 'Par', 'duas iguais somam (5 + 5 = 10)'),
        item(carta({ id: 904, v: 'cur' }, 'db-micro'), 'Curinga', 'vale o que você escolher, de 2 a 12; faz par com qualquer número'),
        item(carta({ id: 905, v: 'passa' }, 'db-micro'), 'Passa', 'a lousa fica como está e a vez segue'),
        item(carta({ id: 906, v: 'inv' }, 'db-micro'), 'Inverte', dois ? 'fora do baralho com 2 pessoas' : 'como o Passa, e o sentido da mesa vira', dois ? 'fora' : ''),
        item(guarda('db-micro-guarda'), 'Guarda-chuva', 'não repôs a mão a tempo? fica com ele: −1'),
        item(comanda(3, '', 'db-micro-comanda'), 'Comanda', 'cartas levadas; quem tem mais faz menos pontos')))
    box.querySelector('.db-cola__aba').addEventListener('click', () => { colaAberta = !colaAberta; ls.set('db.cola', colaAberta); som('papel', 0, .5); render() })
    return box
  }
  function confirma(btn, txt, fn) {
    if (btn.dataset.conf) return fn()
    btn.dataset.conf = '1'; btn.classList.add('confirma')
    const tip = el('span', { className: 'db-tip', textContent: `${txt} Clique de novo.` }); btn.append(tip)
    setTimeout(() => { delete btn.dataset.conf; btn.classList.remove('confirma'); tip.remove() }, 2600)
  }
  function lousa() {
    const abre = !V.valor && !V.nMesa
    return el('div', { className: 'db-lousa', 'data-info': abre ? 'Escalada nova\nQuem abre joga qualquer carta (ou duas iguais)' : `Valor em jogo: ${V.valor}\nJogue igual ou maior; igual dobra` },
      el('small', { className: 'db-lousa__k', textContent: abre ? 'escalada nova' : 'valor' }),
      el('b', { className: 'db-lousa__v' + (abre ? ' abre' : ''), textContent: abre ? 'abre' : String(V.valor) }),
      el('small', { className: 'db-lousa__p', textContent: V.nMesa ? `${V.nMesa} carta${V.nMesa === 1 ? '' : 's'} na mesa` : '' }))
  }
  function centro() {
    const minha = minhaVez()
    const repor = podeRepor()
    const monte = el('div', { className: 'db-monte' + (repor ? ' pode' : ''), 'data-info': `Monte: ${V.monte} carta${V.monte === 1 ? '' : 's'}${repor ? `\nClique para repor a mão (+${Math.min(V.max - V.mao.length, V.monte)})` : ''}` },
      ...Array.from({ length: V.monte ? Math.min(6, Math.max(1, Math.ceil(V.monte / 9))) : 0 }, (_, i) => { const n = carta(null); n.style.setProperty('--i', i); return n }),
      V.monte ? '' : el('span', { className: 'db-monte__vazio', textContent: 'acabou' }))
    if (repor) monte.addEventListener('click', () => { som('desliza'); manda({ op: 'compra' }) })
    // a escalada: cada jogada sobe um degrau
    const ult = V.mesa.length - 1
    const degraus = V.mesa.flatMap((p, k) => p.cartas.map((c, m) => ({ c, k, m, esc: p.esc, cls: k === ult ? (p.dobrou ? 'topo dobrou' : 'topo') : '' })))
    const pronta = minha && V.etapa === 'joga' && sel.length && possivel(selCartas(), V.valor)
    const esc = el('div', { className: 'db-escalada' + (pronta ? ' alvo' : ''), style: `--n:${V.mesa.length}`, title: pronta ? 'Clique para jogar as cartas escolhidas' : '' },
      ...degraus.map(({ c, k, m, esc, cls }) => { const n = carta(c, `db-na-mesa ${cls}`, esc); n.style.setProperty('--k', k); n.style.setProperty('--m', m); n.style.setProperty('--giro', giro(c.id) + 'deg'); return n }))
    if (pronta) esc.addEventListener('click', () => enviar())
    const esqLivre = !V.esq ? guarda('db-guarda--mesa') : ''
    const lo = lousa()
    if (pronta) { lo.classList.add('alvo'); lo.addEventListener('click', () => enviar()) }
    return el('div', { className: 'db-centro' + (pronta ? ' pronta' : '') }, el('div', { className: `db-sentido ${V.dir > 0 ? 'hora' : 'anti'}` }, svg('seta')), el('div', { className: 'db-monte-col' }, monte, esqLivre), esc, lo)
  }
  function assento(x, ang) {
    const P = pos(ang, 45, 41), C = pos(ang, 29, 25.5)
    const vez = V.fase === 'jogo' && V.vez === x.key
    const ven = V.vencedores?.includes(x.key)
    const s = el('div', { className: 'db-assento' + (vez ? ' vez' : '') + (ven ? ' vencedor' : ''), style: `left:${P.x}%;top:${P.y}%`, 'data-key': x.key },
      el('div', { className: 'db-medalha' }, retrato(x.key, x.nome), V.esq === x.key ? guarda('db-guarda--dono') : ''),
      el('span', { className: 'db-placa' }, x.nome, x.pts?.length ? el('i', { textContent: ` · ${x.tot} pt${x.tot === 1 ? '' : 's'}` }) : ''),
      x.conv ? el('small', { className: `db-conv db-conv--${x.conv}`, textContent: x.conv === 'sim' ? 'vai jogar' : x.conv === 'nao' ? 'só assiste' : 'decidindo…' }) : '',
      x.n != null ? comanda(x.conta, x.key) : '')
    if (V.repor?.[x.key]) s.querySelector('.db-medalha').append(el('i', { className: 'db-anel', 'data-fim': String(V.recebido + V.repor[x.key]), 'data-tot': String(REPOR_MS), title: 'ainda pode repor a mão' }))
    if (x.n == null) return [s]
    const n = Math.min(x.n, 8)
    const leque = el('div', { className: 'db-leque-mesa', style: `left:${C.x}%;top:${C.y}%;--rot:${ang - 90}deg;--n:${n}`, 'data-mao': x.key, 'data-info': `${x.nome}: ${x.n} carta${x.n === 1 ? '' : 's'} na mão` },
      ...Array.from({ length: n }, (_, i) => { const c = carta(null); c.style.setProperty('--i', i); return c }),
      el('b', { className: 'db-qtd', textContent: x.n }))
    return [leque, s]
  }
  // ordem da mão: números crescentes, depois curinga, passa e inverte
  const ordemV = c => num(c) ? c.v : { cur: 13, passa: 14, inv: 15 }[c.v]
  function util(c) {
    if (c.v === 'passa' || c.v === 'inv') return true
    if (possivel([c], V.valor)) return true
    return V.mao.some(x => x.id !== c.id && (num(x) || x.v === 'cur') && possivel([c, x], V.valor))
  }
  function minhaArea(antes) {
    const j = eu(), conv = V.fase === 'convite'
    const bon = ctx.boneco?.(me.key)
    const minha = minhaVez()
    const area = el('div', { className: 'db-eu' + (minha ? ' vez' : '') + (V.vencedores?.includes(me.key) ? ' vencedor' : ''), 'data-key': me.key },
      bon ? el('img', { className: 'db-boneco', src: bon, alt: '', draggable: false }) : el('div', { className: 'db-boneco db-boneco--pfp' }, retrato(me.key, me.name)))
    if (conv) { if (V.conv[me.key]) area.append(el('small', { className: `db-conv db-conv--${V.conv[me.key]}`, textContent: V.conv[me.key] === 'sim' ? 'você vai jogar' : 'você só assiste' })); return area }
    if (!j || !V.mao) { area.append(el('small', { className: 'db-dica', textContent: 'assistindo' })); return area }
    const ids = new Set((antes?.mao || []).map(c => c.id))
    const ordenada = V.mao.slice().sort((a, b) => ordemV(a) - ordemV(b) || a.id - b.id)
    const joga = minha && V.etapa === 'joga'
    const mao = el('div', { className: 'db-mao', style: `--n:${ordenada.length}` },
      ...ordenada.map((c, i) => {
        const escolhida = sel.includes(c.id)
        const pode = joga && util(c)
        const n = carta(c, (escolhida ? 'escolhida' : pode ? 'pode' : joga ? 'nao' : '') + (antes && antes.id === V.id && antes.rodada === V.rodada && !ids.has(c.id) ? ' chegou' : ''))
        n.style.setProperty('--i', i)
        n.addEventListener('click', () => clicaCarta(c))
        n.addEventListener('contextmenu', e => { if (sel.includes(c.id)) { e.preventDefault(); desmarca(c.id) } })
        return n
      }))
    mao.addEventListener('click', e => { if (e.target === mao && sel.length) desmarca() })
    if (joga && sel.length) area.append(el('small', { className: 'db-dica-sel', textContent: possivel(selCartas(), V.valor) ? 'clique de novo, na mesa ou em Jogar · botão direito tira' : sel.length === 1 ? 'escolha a outra do par' : 'esse par não chega' }))
    area.append(mao, comanda(j.conta, me.key, 'db-comanda--eu'))
    if (V.esq === me.key) area.append(guarda('db-guarda--eu'))
    if (V.repor?.[me.key]) area.append(el('i', { className: 'db-pavio', 'data-fim': String(V.recebido + V.repor[me.key]), 'data-tot': String(REPOR_MS) }))
    return area
  }
  function clicaCarta(c) {
    if (!minhaVez() || V.etapa !== 'joga') return tremer(c.id)
    if (sel.includes(c.id)) return enviar() // clicar de novo numa escolhida joga
    if (sel.length === 2) sel = []
    const acao = c.v === 'passa' || c.v === 'inv'
    if (sel.length === 1 && !acao) {
      const p = V.mao.find(x => x.id === sel[0])
      if (p && p.v !== 'passa' && p.v !== 'inv' && possivel([p, c], V.valor)) { sel.push(c.id); escolhe = false; som('poe', 0, .45); return render() }
    }
    if (!util(c)) return tremer(c.id)
    sel = [c.id]; escolhe = false
    som('poe', 0, .45)
    render()
  }
  const daMao = new Map()
  // tirar da seleção: botão direito na carta, Esc ou clicar no vazio perto da mão
  function desmarca(id) { sel = id == null ? [] : sel.filter(x => x !== id); escolhe = false; som('clique', 0, .6); render() }
  function tremer(id) { const n = tela.querySelector(`.db-mao .db-carta[data-id="${id}"]`); n?.classList.remove('treme'); void n?.offsetWidth; n?.classList.add('treme') }
  const selCartas = () => sel.map(id => V.mao.find(c => c.id === id)).filter(Boolean)
  function enviar(esc) {
    const cs = selCartas()
    if (!cs.length || !minhaVez() || V.etapa !== 'joga') return
    if (soCuringa(cs) && esc == null) { if (!possivel(cs, V.valor)) return; escolhe = true; return render() }
    if (!calcula(cs, V.valor, esc)) { cs.forEach(c => tremer(c.id)); return }
    // de onde as cartas saem, para voarem da mão até a mesa
    for (const id of sel) { const n = tela.querySelector(`.db-mao .db-carta[data-id="${id}"]`); if (n) daMao.set(String(id), noTela(n)) }
    manda({ op: 'joga', cartas: sel, esc })
    if (cs.length > 1) { som('leque', 0, .8); som('poe', 90, .7) } else som('poe', 0, .8)
    sel = []; escolhe = false
  }
  // botões do momento (canto direito)
  function controles() {
    const j = eu()
    if (!j || V.fase !== 'jogo') return ''
    const bts = []
    // repor a mão não depende da vez: o jogo já seguiu
    if (podeRepor()) {
      const falta = Math.min(V.max - V.mao.length, V.monte)
      bts.push(botao(`Comprar ${falta}`, () => { som('desliza'); manda({ op: 'compra' }) }, 'db-btn--forte db-btn--grande db-btn--repor', 'Repõe a mão antes do tempo acabar (senão fica com o guarda-chuva)'))
    }
    if (minhaVez()) {
      const cs = selCartas()
      if (cs.length) {
        const r = soCuringa(cs) ? null : calcula(cs, V.valor)
        const sozinha = cs.length === 1 && !possivel(cs, V.valor)
        const b = botao(sozinha ? 'Junte o par' : soCuringa(cs) ? 'Jogar · escolher valor' : r?.acao ? `Jogar ${NOME_ACAO[r.acao].toLowerCase()}` : `Jogar · ${r ? r.val : '–'}${r?.dobrou ? ' (dobrou!)' : ''}`, () => enviar(), 'db-btn--forte db-btn--grande')
        if (!possivel(cs, V.valor)) { b.disabled = true; b.title = 'Sozinha não chega no valor da lousa: escolha outra igual (ou um curinga)' }
        bts.push(b)
      }
      if (V.nMesa) bts.push(botao([`Levar a mesa · ${V.nMesa}`], () => { sel = []; manda({ op: 'pega' }) }, cs.length ? 'db-btn--leve' : 'db-btn--levar', 'Põe as cartas da mesa na sua comanda e você abre a próxima escalada'))
    }
    return el('div', { className: 'db-controles' }, ...bts)
  }
  function meio() {
    if (V.fase === 'convite') return convite()
    if (V.fase === 'placar' || V.fase === 'fim') return placar()
    if (escolhe) {
      const cs = selCartas()
      return el('div', { className: 'db-escolha' }, el('small', { textContent: cs.length > 1 ? 'Os dois curingas valem…' : 'O curinga vale…' }),
        el('div', { className: 'db-escolha__nums' }, ...ESCOLHAS.map(e => {
          const r = calcula(cs, V.valor, e)
          const b = el('button', { type: 'button', className: 'db-giz' + (r?.dobrou ? ' dobra' : ''), disabled: !r, title: r ? `Lousa vai para ${r.val}${r.dobrou ? ' (dobrou)' : ''}` : 'Não chega no valor da lousa' },
            el('b', { textContent: String(e) }), r ? el('small', { textContent: r.dobrou ? `×2 = ${r.val}` : cs.length > 1 ? `= ${r.val}` : '' }) : '')
          b.addEventListener('click', () => enviar(e))
          return b
        })),
        botao('Cancelar', () => { escolhe = false; render() }, 'db-btn--leve'))
    }
    return ''
  }
  function placar() {
    const fim = V.fase === 'fim'
    const res = V.resumo ? Object.fromEntries(V.resumo.map(r => [r.key, r])) : {}
    const linhas = V.js.slice().sort((a, b) => fim ? b.tot - a.tot : (res[a.key]?.pos ?? 9) - (res[b.key]?.pos ?? 9))
    const vs = V.vencedores || []
    const titulo = fim ? (vs.length > 1 ? `${vs.map(N).join(' e ')} empataram` : vs[0] === me.key ? 'Você venceu' : `${N(vs[0])} venceu`) : `Fechando a conta · rodada ${V.rodada}`
    return el('div', { className: 'db-conta' + (fim ? ' db-conta--fim' : '') },
      el('div', { className: 'db-conta__topo' }, el('b', { textContent: titulo }), el('small', { textContent: fim && !V.resumo ? 'os outros saíram da mesa' : fim ? `${V.nRodadas} rodada${V.nRodadas === 1 ? '' : 's'} · quem levou menos cartas pontuou mais` : 'quem levou mais cartas faz menos pontos' })),
      el('table', { className: 'db-conta__tab' },
        el('thead', {}, el('tr', {}, el('th', { textContent: '' }), el('th', { textContent: 'cartas' }), el('th', { textContent: 'rodada' }), el('th', { textContent: 'total' }))),
        el('tbody', {}, ...linhas.map(x => {
          const r = res[x.key]
          return el('tr', { className: vs.includes(x.key) ? 'ven' : '' },
            el('td', {}, el('span', { className: 'db-conta__quem' }, retrato(x.key, x.nome), el('span', { textContent: x.key === me.key ? `${x.nome} (você)` : x.nome }))),
            el('td', { textContent: r ? String(r.conta) : '–' }),
            el('td', {}, r ? [`${r.pos}º · ${r.pts}`, r.esq ? el('span', { className: 'db-conta__esq', title: 'Guarda-chuva esquecido: −1' }, svg('guarda'), '−1') : ''] : '–'),
            el('td', { className: 'db-conta__tot', textContent: String(x.tot) }))
        }))),
      souHost() ? el('div', { className: 'db-linha' }, fim ? [botao('Nova partida', revanche, 'db-btn--forte'), botao('Fechar', encerrar)] : botao(`Rodada ${V.rodada + 1}`, () => novaRodada(false), 'db-btn--forte db-btn--grande'))
        : el('small', { className: 'db-espera', textContent: fim ? '' : `${V.hostNome} começa a próxima rodada` }))
  }
  // página inicial: a capa do jogo e a aula em passos (cada passo uma cena animada)
  function convite() {
    const host = souHost()
    const n = Object.entries(V.conv).filter(([k, v]) => v === 'sim' && ctx.presentes().includes(k)).length
    const capa = el('div', { className: 'db-capa' }, el('img', { src: CAPA, alt: 'Dobradinha', draggable: false }))
    const ir = host ? botao(n > MAX_JOG ? `Máximo ${MAX_JOG}` : n >= MIN_JOG ? `Começar · ${n}` : 'Esperando jogadores', comecar, 'db-btn--forte db-btn--grande') : el('small', { className: 'db-espera', textContent: `${V.hostNome} vai começar` })
    if (host && (n < MIN_JOG || n > MAX_JOG)) ir.disabled = true
    const rodadas = el('div', { className: 'db-rodadas' }, el('small', { textContent: 'partida' }), ...RODADAS.map(([v, nm]) => {
      const on = V.op.rodadas === v
      if (!host) return el('span', { className: on ? 'on' : '', textContent: nm })
      return botao(nm, () => { G.op.rodadas = v; difunde() }, on ? 'on' : '')
    }))
    return el('div', { className: 'db-convite' }, capa, pegaAula().raiz, el('div', { className: 'db-convite__op' }, rodadas,
      el('div', { className: 'db-linha' }, host ? botao(V.conv[me.key] === 'sim' ? 'Eu jogo' : 'Eu só assisto', () => { G.conv[me.key] = G.conv[me.key] === 'sim' ? 'nao' : 'sim'; difunde() }, 'db-btn--leve') : '', ir)))
  }
  function bilhete() {
    if (V.fase !== 'convite' || souHost() || V.conv[me.key] !== '?') return ''
    const entra = novo('conv:' + V.id)
    if (entra) som('papel')
    return el('div', { className: 'db-bilhete' + (entra ? ' entra' : '') },
      el('div', { className: 'db-linha db-linha--esq' }, retrato(V.host, V.hostNome), el('span', {}, el('b', { textContent: V.hostNome }), ' chamou você para a Dobradinha')),
      el('div', { className: 'db-linha' }, botao('Jogar', () => manda({ op: 'resp', sim: true }), 'db-btn--forte'), botao('Só assistir', () => manda({ op: 'resp', sim: false }), 'db-btn--leve')))
  }

  /* ---------- animações ---------- */
  const noTela = n => { const r = n.getBoundingClientRect(), t = tela.getBoundingClientRect(); return { x: r.left - t.left + r.width / 2, y: r.top - t.top + r.height / 2, w: r.width, h: r.height } }
  const lugarDe = k => k === me.key ? tela.querySelector('.db-mao') || tela.querySelector('.db-eu') : tela.querySelector(`.db-leque-mesa[data-mao="${CSS.escape(k)}"]`) || tela.querySelector(`.db-assento[data-key="${CSS.escape(k)}"]`)
  const comandaDe = k => tela.querySelector(`.db-comanda[data-conta="${CSS.escape(k)}"]`) || lugarDe(k)
  function voa(de, para, conteudo, { dur = 420, atraso = 0, rot = 0, fim, escala = 1 } = {}) {
    setTimeout(() => {
      if (!de || !para) return
      const A = noTela(de), B = noTela(para)
      const n = conteudo; n.classList.add('db-voa'); tela.append(n)
      n.animate([{ transform: `translate(${A.x}px,${A.y}px) translate(-50%,-50%) rotate(${rot - 20}deg) scale(.85)` }, { transform: `translate(${B.x}px,${B.y}px) translate(-50%,-50%) rotate(${rot}deg) scale(${escala})` }], { duration: dur, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => { n.remove(); fim?.() }
    }, atraso)
  }
  function balao(k, txt, cls = '', at = 0) {
    setTimeout(() => {
      const alvo = k === me.key ? tela.querySelector('.db-eu .db-boneco') : tela.querySelector(`.db-assento[data-key="${CSS.escape(k)}"] .db-retrato`)
      if (!alvo) return
      const b = el('div', { className: `db-balao ${cls}` }, txt); tela.append(b)
      const r = noTela(alvo), W = tela.clientWidth
      const dir = r.x < W * .58
      b.style.left = Math.max(6, Math.min(dir ? r.x + r.w / 2 + 8 : r.x - r.w / 2 - 8 - b.offsetWidth, W - b.offsetWidth - 6)) + 'px'
      b.style.top = Math.max(6, r.y - b.offsetHeight / 2 - (k === me.key ? r.h * .3 : 0)) + 'px'
      setTimeout(() => b.classList.add('sai'), 1900); setTimeout(() => b.remove(), 2300)
    }, at)
  }
  function carimbo(txt, at = 0) {
    setTimeout(() => {
      const l = tela.querySelector('.db-lousa'); if (!l) return
      const r = noTela(l)
      const s = el('b', { className: 'db-carimbo', textContent: txt, style: `left:${r.x}px;top:${r.y - r.h * .1}px` })
      tela.append(s); setTimeout(() => s.remove(), 1400)
    }, at)
  }
  function fotoMesa(antes) {
    const cs = (antes?.mesa || []).flatMap(p => p.cartas.map(c => ({ c, esc: p.esc })))
    return [...tela.querySelectorAll('.db-escalada .db-carta')].map(n => {
      const x = cs.find(y => String(y.c.id) === n.dataset.id)
      return x ? { ...x, r: noTela(n), giro: parseFloat(n.style.getPropertyValue('--giro')) || 0 } : null
    }).filter(Boolean)
  }
  // as cartas da mesa se juntam num montinho e deslizam para a comanda de quem levou
  function levaMesa(foto, key, at) {
    const para = comandaDe(key)
    if (!foto?.length || !para) return 0
    const B = noTela(para)
    const cx = foto.reduce((s, x) => s + x.r.x, 0) / foto.length, cy = foto.reduce((s, x) => s + x.r.y, 0) / foto.length
    const W = foto[0].r.w
    foto.forEach((x, i) => setTimeout(() => {
      const n = carta(x.c, 'db-solta', x.esc); n.style.width = W + 'px'; n.style.setProperty('--w', W + 'px'); tela.append(n)
      const off = (i - (foto.length - 1) / 2) * 1.5
      n.animate([
        { transform: `translate(${x.r.x}px,${x.r.y}px) translate(-50%,-50%) rotate(${x.giro}deg)` },
        { transform: `translate(${cx + off}px,${cy - i * 1.2}px) translate(-50%,-50%) rotate(${off * 2}deg)`, offset: .38 },
        { transform: `translate(${cx + off}px,${cy - i * 1.2 - 6}px) translate(-50%,-50%) rotate(${off * 2}deg)`, offset: .5 },
        { transform: `translate(${B.x}px,${B.y}px) translate(-50%,-50%) rotate(${18 + off}deg) scale(.3)`, opacity: .35 },
      ], { duration: 1450, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' }).onfinish = () => n.remove()
    }, at + i * 35))
    setTimeout(() => { para.classList.remove('ganhou'); void para.offsetWidth; para.classList.add('ganhou') }, at + 1450 + foto.length * 35)
    return 1500 + foto.length * 35
  }
  function anima(evs, antes, foto) {
    const esc = tela.querySelector('.db-escalada'), monte = tela.querySelector('.db-monte')
    let t = 0
    for (const e of evs) {
      const at = t
      if (e.t === 'inicio') { balao(V.vez, 'Eu abro', 'leve', 3600); distribui(); t += 3200 }
      else if (e.t === 'joga') {
        e.cartas.forEach((c, k) => {
          const n = esc?.querySelector(`.db-carta[data-id="${c.id}"]`)
          if (e.key !== me.key) {
            som('poe', at + k * 140, .8)
            if (n) { n.style.visibility = 'hidden'; voa(lugarDe(e.key), n, carta(c), { atraso: at + k * 140, rot: giro(c.id), fim: () => { n.style.visibility = '' } }) }
          } else if (n && daMao.has(String(c.id))) {
            const r = daMao.get(String(c.id)); daMao.delete(String(c.id))
            const de = el('i', { style: `position:absolute;left:${r.x}px;top:${r.y}px;width:1px;height:1px` }); tela.append(de)
            n.style.visibility = 'hidden'
            voa(de, n, carta(c), { atraso: k * 90, dur: 480, rot: giro(c.id), fim: () => { n.style.visibility = ''; n.classList.add('caiu') } })
            setTimeout(() => de.remove(), 700)
          } else if (n) { n.style.animationDelay = `${k * 90}ms`; n.classList.add('caiu') }
        })
        setTimeout(() => tela.querySelector('.db-lousa__v')?.classList.add('escreve'), at + 260)
        if (e.dobrou) { carimbo('dobrou!', at + 380); som('carimbo', at + 380, .8) }
        else if (e.acao === 'passa') { som('pular', at + 200); balao(e.key, 'Passa!', 'leve', at + 150) }
        if (e.esc && e.key !== me.key) balao(e.key, `Curinga vale ${e.esc}`, 'leve', at + 200)
        t += 160 + e.cartas.length * 120
      }
      else if (e.t === 'inverte') { som('inverter', at); tela.querySelector('.db-sentido')?.classList.add('gira'); balao(e.key, 'Inverte!', 'leve', at) }
      else if (e.t === 'pegou') {
        const d = levaMesa(foto, e.key, at)
        som('leque', at, .8); som('desliza', at + 450, .8); som('papel', at + d - 100, .7)
        balao(e.key, e.key === me.key ? `+${e.qtd} na sua comanda` : `Levou ${e.qtd} carta${e.qtd === 1 ? '' : 's'}`, e.qtd >= 8 ? 'forte' : 'leve', at + d - 200)
        t += d
      }
      else if (e.t === 'compra') {
        const n = e.qtd || 1
        for (let i = 0; i < n; i++) { voa(monte, lugarDe(e.key), carta(null), { atraso: at + i * 120, dur: 360 }); som('desliza', at + i * 120, e.key === me.key ? .8 : .55) }
        t += n * 120
      }
      else if (e.t === 'esqueceu') {
        const g = guarda('db-guarda--voa')
        voa(tela.querySelector('.db-centro') || monte, e.key === me.key ? tela.querySelector('.db-eu .db-guarda') || tela.querySelector('.db-eu') : tela.querySelector(`.db-assento[data-key="${CSS.escape(e.key)}"] .db-medalha`), g, { atraso: at, dur: 600 })
        som('golpe', at + 450, .7)
        balao(e.key, e.key === me.key ? 'Esqueceu de comprar! −1' : 'Esqueceu de comprar!', 'forte', at + 500)
      }
      else if (e.t === 'tempo') balao(e.key, 'Tempo esgotado', 'leve', at)
      else if (e.t === 'saiu') { toast(`${e.nome} saiu da mesa`, 3200); som('desliza', at, .6) }
      else if (e.t === 'rodada') som('moedas', at + 300, .8)
      else if (e.t === 'vence') som('leque', at + 500)
    }
  }
  // começo da rodada: o baralho se abre em dois montes, é embaralhado no meio da mesa e sai uma carta por vez para cada um
  function distribui() {
    const monte = tela.querySelector('.db-monte'), centro = tela.querySelector('.db-escalada') || monte
    if (!monte) { entregando = false; return }
    const T = tela.clientHeight, A = { x: tela.clientWidth / 2, y: T * .47 }, W = T * .15
    const nMeio = 7, cartas = []
    for (let i = 0; i < nMeio * 2; i++) { const n = carta(null, 'db-solta'); n.style.width = W + 'px'; n.style.setProperty('--w', W + 'px'); n.style.zIndex = 30 + i; tela.append(n); cartas.push(n) }
    som('embaralhar')
    const dx = W * .85, dur = 1900
    cartas.forEach((n, i) => {
      const lado = i % 2 ? 1 : -1, k = Math.floor(i / 2), h = k * 2
      const ord = i / (nMeio * 2)
      n.animate([
        { transform: `translate(${A.x}px,${A.y - h}px) translate(-50%,-50%)` },
        { transform: `translate(${A.x + lado * dx}px,${A.y - h}px) translate(-50%,-50%) rotate(${lado * 10}deg)`, offset: .22 },
        { transform: `translate(${A.x + lado * dx * .9}px,${A.y - h - 4}px) translate(-50%,-50%) rotate(${lado * 14}deg)`, offset: .3 + ord * .35 },
        { transform: `translate(${A.x + lado * 3}px,${A.y - i * 1.2}px) translate(-50%,-50%) rotate(${lado * 2}deg)`, offset: .42 + ord * .38 },
        { transform: `translate(${A.x}px,${A.y - i * 1.2}px) translate(-50%,-50%)` },
      ], { duration: dur, easing: 'ease-in-out', fill: 'forwards' })
    })
    // alvos em rodízio: 1ª carta de cada um, depois a 2ª…
    const porPessoa = [...tela.querySelectorAll('.db-leque-mesa')].map(l => [...l.querySelectorAll('.db-carta')])
    const minhas = [...tela.querySelectorAll('.db-mao .db-carta')]
    if (minhas.length) porPessoa.push(minhas)
    const ordem = []
    for (let r = 0; r < 8; r++) for (const lista of porPessoa) if (lista[r]) ordem.push(lista[r])
    const passo = Math.max(45, Math.min(110, 1700 / Math.max(1, ordem.length)))
    setTimeout(() => {
      // o montinho embaralhado fica no meio e vai encolhendo enquanto as cartas saem
      const pilha = cartas[cartas.length - 1]
      cartas.slice(0, -1).forEach((n, i) => setTimeout(() => n.remove(), i * ordem.length * passo / cartas.length))
      setTimeout(() => pilha.remove(), ordem.length * passo + 360)
      ordem.forEach((n, k) => voa(pilha, n, carta(null), { atraso: k * passo, dur: 340, fim: () => { n.classList.remove('oculta'); if (k % 2 === 0) som('desliza', 0, .45) } }))
      setTimeout(() => { entregando = false; tela.querySelectorAll('.db-carta.oculta').forEach(n => n.classList.remove('oculta')) }, ordem.length * passo + 500)
    }, dur + 120)
  }
  ;(function loop() {
    if (V) {
      const pres = new Set(ctx.presentes())
      for (const s of tela.querySelectorAll('.db-assento[data-key], .db-eu[data-key]')) { s.classList.toggle('fala', !!ctx.falando?.(s.dataset.key)); s.classList.toggle('caiu', !pres.has(s.dataset.key)) }
      for (const tm of tela.querySelectorAll('[data-fim]')) {
        const r = Math.max(0, +tm.dataset.fim - Date.now()), tot = +tm.dataset.tot || 1
        tm.style.setProperty('--t', String(r / tot)); tm.classList.toggle('fim', r < 3000)
        if (tm.classList.contains('db-pavio') && r > 0 && r <= 3000) { const sx = Math.ceil(r / 1000); if (tm.dataset.tic !== String(sx)) { tm.dataset.tic = String(sx); som('tique', 0, sx === 1 ? 1.25 : 1) } }
      }
    }
    setTimeout(() => requestAnimationFrame(loop), 120)
  })()
  document.addEventListener('keydown', e => {
    if (!V || e.target.closest?.('input, textarea')) return
    if (e.key === 'Escape' && (escolhe || sel.length)) { escolhe = false; sel = []; render() }
    else if (e.key === 'Enter' && sel.length && !escolhe) { e.preventDefault(); enviar() }
  })
  // informação no hover
  const dica = el('div', { className: 'db-info', hidden: true })
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
    if (V && !souHost()) return toast(`Já tem uma mesa de Dobradinha aberta (de ${V.hostNome})`)
    if (G) return toast('A mesa já está aberta')
    abrir(chamados)
  }
  window.__db = () => ({ G, V, render, difunde })
  return {
    got: (d, k) => { carregaSons(); got(d, k) }, iniciar, ativo: () => !!V,
    // para o app: troca de jogo e mesas paralelas
    lider: () => !!V && souHost(),
    encerra: () => { if (G && G.host === me.key) encerrar() },
    sair: () => { if (!V) return; if (G && G.host === me.key) return encerrar(); manda({ op: 'sai' }); dispensado = V.id; aplica(null) },
    jogadores: () => !V ? [] : V.fase === 'convite' || !V.js?.length ? Object.keys(V.conv || {}).filter(k => V.conv[k] === 'sim') : V.js.filter(j => !j.fora).map(j => j.key),
    entrouAlguem: key => { if (!G || G.host !== me.key) return; if (G.fase === 'convite' && !(key in G.conv)) { G.conv[key] = '?'; return difunde() } ctx.sendTo(key, { db: { v: vista(key) } }) },
  }
}
