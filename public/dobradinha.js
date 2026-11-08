// Dobro: jogo de escalada numa mesa de boteco. Cada um joga uma carta (ou duas iguais) de valor igual ou maior que o
// da lousa; empatar o valor dobra. Quem não pode (ou não quer) subir leva as cartas da mesa para a comanda, e cartas na
// comanda são ruins: no fim da rodada, quem tem mais cartas faz menos pontos. Depois de jogar, a vez já passa e a pessoa
// tem 3 s de proteção e depois REPOR_MS para repor a mão clicando no monte (o jogo não espera); quem não repõe a tempo fica com o Esquecido
// (-1 ponto na rodada).
// Mesma arquitetura dos outros jogos: o host guarda tudo e manda para cada um só o que pode ver ({ db: ... }).

import { criaAula } from './aula.js'
import { passosDobradinha } from './dobradinha-aula.js'
import { criaMesa } from './cartas-mesa.js'
import { criaBoteco, SKINS_BAR, secaoBar } from './boteco3d.js'

const SOM = n => `jogos/coup/sons/${n}.mp3`
const CAPA = 'jogos/dobro/capa.webp', MARCA = 'jogos/dobro/marca.webp'
// Uma textura para o baralho inteiro (18 artes únicas, sem repetir as cópias do mod).
// A chave db e os nomes dos módulos continuam os mesmos para restaurar partidas salvas.
const ARTE = { passa: 0, inv: 1, cur: 2, ...Object.fromEntries(Array.from({ length: 11 }, (_, i) => [i + 2, i + 3])) }
const SONS = ['embaralhar', 'desliza1', 'desliza2', 'desliza3', 'poe1', 'poe2', 'leque', 'carimbo', 'papel', 'vez', 'clique', 'tique', 'pular', 'inverter', 'moedas', 'golpe']
const VOL = { embaralhar: .5, carimbo: .6, papel: .45, vez: .5, clique: .3, tique: .28, pular: .6, inverter: .6, moedas: .5, golpe: .45, leque: .7 }
const SAIU_MS = 12000, HOST_MS = 10000, MIN_JOG = 2, MAX_JOG = 6
const REPOR_MS = 9000 // depois de jogar: tempo para repor a mão (a vez já seguiu para o próximo)
const PROTECAO_MS = 3000 // antes da contagem, pode comprar sem receber o Esquecido de outra pessoa
const RODADAS = [[1, '1 rodada'], [3, '3 rodadas'], ['n', '1 por pessoa']]
// 50 cartas numeradas (valor: quantidade) + 3 curingas, 2 "passa" e 2 "inverte"
const ADMIN = 'kellyson' // modo admin (logado no painel Admin): escolhe as próximas cartas que vai comprar
const FILA_OK = new Set(['cur', 'passa', 'inv', ...Array.from({ length: 11 }, (_, i) => String(i + 2))])
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
  guarda: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="3" width="28" height="42" rx="4"/><path d="M24 12v16"/><circle cx="24" cy="36" r="1.6" fill="currentColor"/></svg>',
  seta: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M40 24a16 16 0 1 1-5-11.6"/><path d="M36 5v8h-8"/></svg>',
}

export function criaDobradinha(ctx) {
  const { icon, toast, sysMsg, me } = ctx
  const tela = ctx.tela
  // O ctx.el não transforma data-* e aria-* em atributos: os seletores e rótulos dependem deste wrapper.
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
    sysMsg(`${me.name} abriu uma mesa de Dobro`)
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
    sysMsg(`Dobro começou: ${G.js.map(j => j.nome).join(', ')}`)
    novaRodada(true)
  }
  function novaRodada(primeira) {
    G.rodada++
    G.monte = baralho(G.js.length)
    G.fora = G.js.length === 2 ? G.monte.splice(0, 10) : [] // com 2 pessoas, 10 cartas ficam de fora a cada rodada
    for (const j of G.js) { j.mao = puxa(j.key, maoMax()); j.conta = 0 }
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
    if (G.etapa === 'repor' && G.fase === 'jogo') { G.repor[G.js[G.vez].key] = Date.now() + PROTECAO_MS + REPOR_MS; G.etapa = 'joga'; G.vez = depois(G.vez, 1) }
    G.prazo = 0
  }
  // quem jogou e ainda não repôs: o jogo segue; acabou o tempo, fica com o Esquecido
  setInterval(() => {
    if (!G || G.host !== me.key || G.fase !== 'jogo' || !G.repor) return
    const agora = Date.now(), vencidos = Object.keys(G.repor).filter(k => agora >= G.repor[k])
    if (!vencidos.length) return
    for (const k of vencidos) esqueceu(k)
    difunde()
  }, 250)
  // Sem fila, a compra é aleatória (o topo do monte embaralhado). Com fila (admin): vem a próxima da fila que exista
  // no baralho de verdade, sem criar carta a mais (o baralho é contado): do monte ou, com 2 pessoas, das 10 cartas
  // fora da rodada (trocada por uma do monte, a contagem fica igual). A que não existe agora espera na fila.
  const naFila = (v, onde) => onde.flatMap((x, i) => String(x.v) === v ? [i] : [])
  function puxa(key, n) {
    const out = [], fila = G.fila?.[key]
    while (out.length < n && G.monte.length) {
      let c = null
      for (let i = 0; !c && fila && i < fila.length; i++) {
        const m = naFila(fila[i], G.monte)
        if (m.length) c = G.monte.splice(m[rnd(m.length)], 1)[0]
        else { const f = naFila(fila[i], G.fora || []); if (f.length) { c = G.fora.splice(f[0], 1)[0]; G.fora.push(G.monte.pop()) } }
        if (c) fila.splice(i, 1)
      }
      out.push(c || G.monte.pop())
    }
    return out
  }
  function esqueceu(key) {
    delete G.repor[key]
    const j = jog(key)
    if (!j || j.mao.length >= maoMax() || !G.monte.length) return
    G.esq = key
    ev({ t: 'esqueceu', key })
    log(`${j.nome} não repôs a mão a tempo e ficou com o Esquecido.`)
    // mão vazia não dá para jogar: compra o que falta mesmo assim
    if (!j.mao.length) { const n = Math.min(maoMax(), G.monte.length); j.mao.push(...puxa(key, n)); ev({ t: 'compra', key, qtd: n }) }
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
    if (G.monte.length && j.mao.length < maoMax()) (G.repor ||= {})[key] = Date.now() + PROTECAO_MS + REPOR_MS
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
    if (n > 0) { j.mao.push(...puxa(key, n)); ev({ t: 'compra', key, qtd: n }) }
    difunde()
  }
  function passar(key) {
    if (G.fase !== 'jogo' || !G.repor?.[key]) return
    esqueceu(key)
    difunde()
  }
  // quem está com o Esquecido pode jogá-lo em quem ainda não repôs a mão (contagem correndo)
  function arremessa(key, alvo) {
    const j = jog(alvo)
    if (G.fase !== 'jogo' || G.esq !== key || alvo === key || !j || !G.repor?.[alvo]) return
    const falta = G.repor[alvo] - Date.now()
    // Validado no host: cliques repetidos ou mensagens antigas não furam a proteção.
    if (falta > REPOR_MS || falta <= 0 || j.mao.length >= maoMax() || !G.monte.length) return
    delete G.repor[alvo]
    G.esq = alvo
    ev({ t: 'arremesso', de: key, para: alvo })
    log(`${jog(key)?.nome || 'Alguém'} jogou o Esquecido em ${j.nome}, que esqueceu de repor a mão.`)
    if (!j.mao.length && G.monte.length) { const n = Math.min(maoMax(), G.monte.length); j.mao.push(...puxa(alvo, n)); ev({ t: 'compra', key: alvo, qtd: n }) }
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
      sysMsg(`🏆 ${vs.map(j => j.nome).join(' e ')} ${vs.length > 1 ? 'venceram' : 'venceu'} o Dobro`)
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
      case 'guarda': arremessa(key, d.alvo); break
      case 'fila': if (key === ADMIN && Array.isArray(d.fila)) { (G.fila ||= {})[key] = d.fila.map(String).filter(v => FILA_OK.has(v)).slice(0, 20); difunde() } break
    }
  }
  function vista(k) {
    return {
      id: G.id, seq: G.seq, host: G.host, hostNome: G.hostNome, fase: G.fase, op: G.op, conv: G.conv,
      js: G.js.map(j => ({ key: j.key, nome: j.nome, n: j.mao.length, conta: j.conta, tot: j.tot, pts: j.pts })),
      mao: jog(k)?.mao.slice() || null, mesa: G.mesa.slice(-6), nMesa: nMesa(), valor: G.valor, monte: G.monte.length, max: G.js.length ? maoMax() : 6,
      vez: G.js[G.vez]?.key || null, etapa: G.etapa, esq: G.esq, dir: G.dir, rodada: G.rodada, nRodadas: G.nRodadas,
      resumo: G.resumo, vencedores: G.vencedores, log: G.log.slice(-40), ev: G.ev, prazo: 0,
      fila: k === ADMIN ? G.fila?.[k] || [] : null,
      filaTem: k === ADMIN ? (G.fila?.[k] || []).map(v => naFila(v, G.monte).length + naFila(v, G.fora || []).length > 0) : null,
      repor: Object.fromEntries(Object.entries(G.repor || {}).map(([k, t]) => [k, Math.max(0, t - Date.now())])), // quem ainda pode repor (ms que faltam)
    }
  }
  function difunde() {
    if (!G) return
    G.seq++; G.t = Date.now()
    ls.set('db.G', { ...G, fila: undefined }) // a fila do admin não fica salva em lugar nenhum
    const ks = new Set([...ctx.presentes(), ...G.js.map(j => j.key), ...Object.keys(G.conv || {})])
    for (const k of ks) if (k !== me.key) ctx.sendTo(k, { db: { v: vista(k) } })
    // cópia completa para o sucessor (o próximo jogador conectado), para ele assumir se eu cair
    const pres = new Set(ctx.presentes())
    G.sucessor = G.js.map(j => j.key).find(k => k !== me.key && pres.has(k)) || [...pres].find(k => k !== me.key) || null
    if (G.sucessor) ctx.sendTo(G.sucessor, { db: { bk: { ...G, fila: undefined } } })
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
    ev({ t: 'saiu', key, nome }); log(`${nome} saiu da mesa.`); sysMsg(`${nome} saiu do Dobro`)
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
    sysMsg(`${nomeAntigo} caiu: ${me.name} assumiu a mesa do Dobro`)
    armaTempo()
    remove(antigo)
    if (G) difunde()
  }

  /* =================================================================== cliente */
  let V = null, ultEv = 0, dispensado = '', sel = [], escolhe = false, entregando = false
  // motor compartilhado com o Uno: voos com arco e virada, batida, FLIP da mão, giro do sentido e facho da vez
  const M = criaMesa({ tela, carta: c => carta(c), cartaSel: '.db-carta', palco: '.db-palco' })
  const pousando = M.pousando, calmo = M.calmo
  let antesRender = null, ultFotos = new Map()
  const VEL_SENTIDO = 22 // graus por segundo
  // mesa de bar 3D com a esquina do boteco ao fundo (padrão); 'lata' volta para a mesa desenhada em CSS
  const MESAS_DB = [...SKINS_BAR.map(([k, nm, cor]) => [k, `Mesa de bar ${nm}`, cor]), ['lata', 'Mesa desenhada', '#e8a817']]
  let mesaDb = MESAS_DB.some(([k]) => k === ls.get('db.mesa')) ? ls.get('db.mesa') : 'skol'
  const boteco = criaBoteco({ tela, palco: '.db-palco', plano: '.db-plano', centro: [.5, .52], tamanho: [.54, .74] })
  const giroMesa = M.criaGiro({ anel: '.db-sentido', luz: '.db-luz', vel: () => VEL_SENTIDO, ativo: () => V?.fase === 'jogo' })
  const vistos = new Set()
  const novo = id => { if (vistos.has(id)) return false; vistos.add(id); return true }
  const souHost = () => V && V.host === me.key
  const eu = () => V?.js.find(j => j.key === me.key)
  const N = k => k === me.key ? 'Você' : (V?.js.find(j => j.key === k)?.nome || ctx.nomeDe(k))
  const minhaVez = () => V?.fase === 'jogo' && V.vez === me.key
  // estou com o Esquecido e alguém está com a contagem de repor correndo: posso jogar nele
  const reporRestante = k => Math.max(0, (V?.recebido || 0) + (V?.repor?.[k] || 0) - Date.now())
  const protegido = k => reporRestante(k) > REPOR_MS
  const faseRepor = () => Object.keys(V?.repor || {}).map(k => `${k}:${protegido(k) ? 'protegido' : reporRestante(k) > 0 ? 'contagem' : 'fim'}`).join('|')
  let reporUI = ''
  let arrastoGuarda = null
  const alvosGuarda = () => V?.fase === 'jogo' && V.esq === me.key && V.monte > 0 ? V.js.filter(j => j.key !== me.key && j.n < V.max && reporRestante(j.key) > 0 && !protegido(j.key)).map(j => j.key) : []
  function jogaGuarda(alvo) { if (!alvosGuarda().includes(alvo)) return; som('clique', 0, .6); manda({ op: 'guarda', alvo }) }
  const podeRepor = () => V?.fase === 'jogo' && reporRestante(me.key) > 0 && V.mao && V.mao.length < V.max && V.monte > 0
  function cancelaArrastoGuarda() {
    const a = arrastoGuarda
    arrastoGuarda = null
    a?.carta?.remove()
    if (a && tela.hasPointerCapture(a.id)) tela.releasePointerCapture(a.id)
    tela.classList.remove('db-arrastando')
    tela.querySelectorAll('.db-destino-guarda, .db-sobre-guarda').forEach(n => n.classList.remove('db-destino-guarda', 'db-sobre-guarda'))
  }
  function atualizaArrastoGuarda() {
    const a = arrastoGuarda
    if (!a?.ativo) return
    const r = tela.getBoundingClientRect(), alvos = alvosGuarda()
    a.carta.style.left = `${a.x - r.left}px`; a.carta.style.top = `${a.y - r.top}px`
    const sob = document.elementFromPoint(a.x, a.y)?.closest('[data-lugar]')
    a.alvo = sob && tela.contains(sob) && alvos.includes(sob.dataset.lugar) ? sob.dataset.lugar : null
    tela.classList.add('db-arrastando')
    tela.querySelectorAll('[data-lugar]').forEach(n => {
      n.classList.toggle('db-destino-guarda', alvos.includes(n.dataset.lugar))
      n.classList.toggle('db-sobre-guarda', n.dataset.lugar === a.alvo)
    })
  }
  function destacaDestinoMesa(ativo) {
    const n = tela.querySelector(`.db-comanda--mesa[data-conta="${CSS.escape(me.key)}"]`)
    n?.classList.toggle('db-recebe-mesa', ativo && minhaVez() && V.nMesa > 0)
  }
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
  let deGuarda = null
  function aplica(v) {
    const antes = V
    if (v && (!antes || antes.id !== v.id)) {
      ultEv = Math.max(0, ...v.ev.map(e => e.n))
      const ini = v.ev.find(e => e.t === 'inicio')
      if (ini && v.fase === 'jogo' && v.ev.length < 4) ultEv = ini.n - 1
      sel = []; escolhe = false
    }
    if (me.key === ADMIN && antes?.fila && v?.fila && antes.id === v.id && v.fila.length < antes.fila.length) ctx.logInterno?.(`fila do admin usada (restam ${v.fila.length}: ${v.fila.join(' ') || 'nada'})`)
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
    // o Esquecido vai ser arremessado: guarda de onde ele sai antes do render tirar ele do lugar
    const g = evs.find(e => e.t === 'arremesso')
    if (g) { const n = tela.querySelector(g.de === me.key ? '.db-eu .db-guarda' : `.db-assento[data-key="${CSS.escape(g.de)}"] .db-guarda`) || lugarDe(g.de); deGuarda = n ? noTela(n) : null }
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
  function carta(c, cls = '', esc = null) {
    const arte = c ? ARTE[c.v] : 14
    return el('div', { className: `db-carta db-arte db-arte-${arte}${c ? '' : ' db-costas'} ${cls}`, role: 'img',
      'aria-label': c ? `${nomeCarta(c)}${c.v === 'cur' && esc ? `, valeu ${esc}` : ''}` : 'Verso do Dobro',
      ...(c ? { 'data-id': String(c.id), 'data-v': String(c.v) } : {}) },
      c?.v === 'cur' && esc ? el('span', { className: 'db-valor-esc', textContent: `= ${esc}` }) : '')
  }
  const guarda = (cls = '') => el('div', { className: `db-guarda db-arte db-arte-15 ${cls}`, role: 'img', 'aria-label': 'Carta Esquecido', 'data-info': 'Carta Esquecido\nQuem não repõe a mão a tempo fica com ela: −1 ponto no fim da rodada' })
  const retrato = (k, nm, cls = '') => el('span', { className: `db-retrato ${cls}` }, ctx.pfp(k, 64, nm))
  // Cartas levadas ficam viradas numa pilha; mais cartas aumentam a altura e o espalhamento.
  function comanda(n, key, cls = '') {
    const k = Math.min(n, 16), abre = .1 + k * .012
    const bolo = el('span', { className: 'db-bolo', style: `--k:${k}` }, ...Array.from({ length: k }, (_, i) => {
      const c = carta(null, 'db-bolo__c')
      c.style.cssText = `--x:${(((i * 29) % 13) - 6) * abre}cqh;--y:${(((i * 17) % 5) - 2) * .14}cqh;--z:${i * .035}cqh;--r:${((i * 47) % 37) - 18}deg`
      return c
    }))
    return el('div', { className: `db-comanda ${n ? '' : 'vazia'} ${cls}`, 'data-conta': key, 'data-info': `Comanda: ${n} carta${n === 1 ? '' : 's'} levada${n === 1 ? '' : 's'}\nMais cartas, menos pontos no fim da rodada` },
      bolo, n ? el('b', { className: 'db-comanda__n', textContent: String(n) }) : el('span', { className: 'db-comanda__zero', textContent: 'limpa' }))
  }
  const giro = id => ((id * 37) % 13) - 6

  function angulos(n, comigo) {
    if (!comigo) return Array.from({ length: n }, (_, i) => 90 + 180 / n + i * 360 / n)
    if (n === 1) return [270]
    const span = Math.min(220, 72 * (n - 1)), a0 = 270 - span / 2
    return Array.from({ length: n }, (_, i) => a0 + i * span / (n - 1))
  }
  const pos = (ang, rx, ry) => ({ x: 50 + rx * Math.cos(ang * Math.PI / 180), y: 50 + ry * Math.sin(ang * Math.PI / 180) })

  function comandaNaMesa(j, ang) {
    // Mesmo plano do tampo, ao lado do lugar de cada pessoa; não acompanha o avatar em pé.
    const a = ang * Math.PI / 180, p = pos(ang, 16, 25)
    const n = comanda(j.conta, j.key, 'db-comanda--mesa')
    n.style.cssText = `left:${p.x + Math.sin(a) * 7}%;top:${p.y - Math.cos(a) * 8}%;--db-giro-pilha:${ang - 90}deg`
    n.dataset.info = `${N(j.key)} · ${n.dataset.info}`
    n.dataset.lugar = j.key
    if (j.key === me.key && minhaVez() && V.nMesa) n.append(el('b', { className: 'db-comanda__entrada', textContent: `+${V.nMesa}` }))
    return n
  }

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

  // painel de mesa: mesa de bar (textura, qualidade, fundo) ou a mesa desenhada de antes
  let mesaAberta = false
  function mesaPainel() {
    if (!mesaAberta) return ''
    const escolhe = k => { mesaDb = k; ls.set('db.mesa', k); som('clique'); render() }
    const fecha = () => { mesaAberta = false; render() }
    const lata = el('button', { type: 'button', className: 'cm-mesa-op' + (mesaDb === 'lata' ? ' atual' : ''), role: 'radio', 'aria-checked': String(mesaDb === 'lata'), title: 'A mesa desenhada de antes, sem fundo' },
      el('span', { className: 'db-prev-lata' }, el('div', { className: 'db-lata' })), el('b', { textContent: 'Mesa desenhada' }))
    lata.addEventListener('click', e => { e.stopPropagation(); escolhe('lata') })
    const caixa = el('section', { className: 'cm-dialogo__painel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mesa' },
      el('header', { className: 'cm-dialogo__topo' }, el('b', { textContent: 'Mesa' }), botao(icon('x'), fecha, 'db-btn--ic', 'Fechar')),
      secaoBar({ atual: mesaDb === 'lata' ? null : mesaDb, escolhe, redesenha: () => { som('clique'); render() } }),
      el('small', { className: 'cm-mesa-sub', textContent: 'Sem bar' }),
      el('div', { className: 'cm-mesa-grade' }, lata))
    const fundo = el('div', { className: 'cm-dialogo' }, caixa)
    fundo.addEventListener('click', e => { if (e.target === fundo) fecha() })
    fundo.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); fecha() } })
    return fundo
  }
  function render(antes) {
    antesRender = antes
    reporUI = faseRepor()
    const fotos = M.fotos('.db-mao')
    tela.classList.toggle('db--on', !!V)
    ctx.onAtivo?.(!!V)
    if (!V) { cancelaArrastoGuarda(); boteco.desliga(); tela.replaceChildren(); vistos.clear(); return }
    const conv = V.fase === 'convite', j = eu()
    const lugares = conv ? Object.keys(V.conv).filter(k => k !== me.key).map(k => ({ key: k, nome: ctx.nomeDe(k), conv: V.conv[k] }))
      : (() => { const js = V.js; const i = js.findIndex(x => x.key === me.key); return i < 0 ? js : [...js.slice(i + 1), ...js.slice(0, i)] })()
    const angs = angulos(lugares.length, conv || !!j)
    const plano = el('div', { className: 'db-plano' }, el('div', { className: 'db-lata' }), conv ? '' : el('i', { className: 'db-luz' }), conv ? '' : centro())
    lugares.forEach((x, n) => plano.append(...assento(x, angs[n])))
    if (!conv && j) plano.append(comandaNaMesa(j, 90))
    const topoBar = el('header', { className: 'db-topo' },
      el('img', { className: 'db-logo', src: MARCA, alt: 'Dobro', draggable: false }),
      !conv && V.rodada ? el('span', { className: 'db-rodada', textContent: `rodada ${V.rodada} de ${V.nRodadas}` }) : '',
      el('span', { className: 'db-grow' }),
      botao(el('i', { className: 'db-cor-mesa', style: `--cor:${MESAS_DB.find(m => m[0] === mesaDb)[2]}` }), () => { mesaAberta = !mesaAberta; render() }, 'db-btn--ic' + (mesaAberta ? ' on' : ''), `Mesa: ${MESAS_DB.find(m => m[0] === mesaDb)[1]}`),
      conv ? '' : botao(icon('lightbulb'), () => { aulaAberta = !aulaAberta; if (aulaAberta) pegaAula().reinicia(); else aula?.para(); render() }, 'db-btn--ic' + (aulaAberta ? ' on' : ''), 'Como jogar'),
      botao(icon('list-music'), () => tela.querySelector('.db-log')?.classList.toggle('aberto'), 'db-btn--ic', 'O que aconteceu'),
      souHost() ? botao(icon('x'), e => confirma(e.currentTarget, 'Fechar a mesa?', encerrar), 'db-btn--ic', 'Fechar a mesa para todos')
        : botao(icon('x'), () => { dispensado = V.id; aplica(null) }, 'db-btn--ic', 'Sair da mesa (só para você)'))
    // admin: sem botão; três cliques rápidos no logo abrem a fila (para os outros, o logo não faz nada)
    topoBar.querySelector('.db-logo')?.addEventListener('pointerdown', cliqueLogo)
    const kids = [el('div', { className: 'db-azulejos' }), el('div', { className: 'db-palco' }, plano), topoBar, mesaPainel(), status(), cola(), minhaArea(antes), controles(), meio(), filaUI(), bilhete(),
      el('div', { className: 'db-log' }, el('ol', {}, ...V.log.slice(-40).map(t => el('li', { textContent: t }))))]
    const am = aulaModal()
    if (am) kids.push(am)
    if (!conv && V.fase !== 'fim' && !ctx.presentes().includes(V.host)) kids.push(el('div', { className: 'db-pausa' }, el('b', { textContent: 'Partida pausada' }), el('span', { textContent: `${V.hostNome} abriu a mesa e caiu. Continua de onde parou quando voltar.` })))
    tela.replaceChildren(...kids)
    if (arrastoGuarda) {
      if (V.fase !== 'jogo' || V.esq !== me.key) cancelaArrastoGuarda()
      else if (arrastoGuarda.ativo) { tela.append(arrastoGuarda.carta); atualizaArrastoGuarda() }
    }
    tela.classList.toggle('acabou', V.fase === 'fim' || V.fase === 'placar')
    ctx.hydrate(tela)
    poeSetaVez()
    M.flip(fotos, '.db-mao'); ultFotos = fotos
    tela.dataset.mesa = mesaDb === 'lata' ? 'lata' : 'bar'
    if (mesaDb !== 'lata') { boteco.encaixa(); boteco.liga(mesaDb) } else boteco.desliga()
    const plano_ = tela.querySelector('.db-plano'), vez = V.fase === 'jogo' ? V.vez : null
    giroMesa.sincroniza(vez && plano_ ? M.anguloAte(plano_, vez === me.key ? null : tela.querySelector(`.db-assento[data-key="${CSS.escape(vez)}"]`)) : null)
    if (entregando) tela.querySelectorAll('.db-mao .db-carta, .db-leque-mesa .db-carta').forEach(n => n.classList.add('oculta'))
    tela.querySelector('.db-log ol')?.scrollTo(0, 1e6)
    if (aula?.raiz.isConnected) aula.acorda(); else aula?.para()
  }
  function status() {
    if (V.fase !== 'jogo') return ''
    const minha = V.vez === me.key, quem = N(V.vez)
    const txt = [el('b', { textContent: minha ? 'Sua vez' : quem }), V.nMesa ? ` · ${minha ? 'jogue ' : ''}${V.valor} ou mais` : ' · abra a escalada']
    const detalhe = V.nMesa ? `${V.valor} cravado dobra${minha ? ' · ou leve a mesa' : ''}` : minha ? 'Qualquer carta ou par' : ''
    const repor = podeRepor() ? el('span', { className: 'db-status__repor' + (protegido(me.key) ? ' protegida' : '') }, el('b', { textContent: 'Reponha a mão' }), ' · clique no monte', protegido(me.key) ? ' · 3 s de proteção' : '') : ''
    const alvos = alvosGuarda()
    const mira = alvos.length ? el('span', { className: 'db-status__mira' }, 'Esquecido: arraste até ', el('b', { textContent: alvos.map(N).join(' ou ') }), ' ou clique na foto') : ''
    return el('div', { className: 'db-status' + (minha ? ' minha' : '') }, el('span', { className: 'db-status__vez' }, ...txt), detalhe ? el('small', { className: 'db-status__detalhe', textContent: detalhe }) : '', repor, mira)
  }
  let colaAberta = ls.get('db.cola') === true, colaIndice = 0
  function cola() {
    if (V.fase === 'convite') return ''
    const dois = V.js.length === 2
    const item = (c, nome, txt, extra = '') => el('li', { className: `db-cola__it ${extra}` }, c, el('span', {}, el('b', { textContent: nome }), el('small', { textContent: txt })))
    const regras = [
      item(el('span', { className: 'db-cola__regra', textContent: '≥' }), 'Subir', 'jogue igual ou maior que a lousa'),
      item(el('span', { className: 'db-cola__regra db-cola__regra--x2', textContent: '×2' }), 'Cravou, dobrou', 'igual ao valor da lousa: ele dobra'),
      item(el('span', { className: 'db-cola__regra', textContent: '+' }), 'Par', 'duas iguais somam (5 + 5 = 10)'),
      item(carta({ id: 904, v: 'cur' }, 'db-micro'), 'Curinga', 'vale de 2 a 12; faz par com qualquer número'),
      item(carta({ id: 905, v: 'passa' }, 'db-micro'), 'Passa', 'a lousa fica como está e a vez segue'),
      item(carta({ id: 906, v: 'inv' }, 'db-micro'), 'Inverte', dois ? 'fora do baralho com 2 pessoas' : 'como o Passa, e o sentido da mesa vira', dois ? 'fora' : ''),
      item(guarda('db-micro-guarda'), 'Esquecido', '3 s protegido para comprar; depois, 9 s de contagem. Quem está com ele pode passar para quem não comprou após a proteção: −1'),
      item(comanda(3, '', 'db-micro-comanda'), 'Comanda', 'cartas levadas; quem tem mais faz menos pontos')]
    const muda = n => { colaIndice = (colaIndice + n + regras.length) % regras.length; render(); tela.querySelector(n < 0 ? '.db-cola__anterior' : '.db-cola__proxima')?.focus() }
    const box = el('aside', { className: 'db-cola' + (colaAberta ? ' aberta' : ''), 'aria-label': 'Regras do Dobro' },
      el('button', { type: 'button', className: 'db-cola__aba', 'aria-expanded': String(colaAberta), title: colaAberta ? 'Esconder a cola' : 'Mostrar a cola: o que cada carta faz' },
        el('span', { className: 'db-cola__leque' }, carta({ id: 901, v: 'cur' }, 'db-micro'), carta({ id: 902, v: 'passa' }, 'db-micro'), carta({ id: 903, v: 'inv' }, 'db-micro')), el('b', { textContent: 'cola' })),
      el('div', { className: 'db-cola__painel' }, el('ul', { className: 'db-cola__lista', 'aria-live': 'polite' }, regras[colaIndice]),
        el('nav', { className: 'db-cola__nav', 'aria-label': 'Navegar pelas regras' },
          el('button', { type: 'button', className: 'db-cola__anterior', textContent: '←', title: 'Regra anterior', onclick: () => muda(-1) }),
          el('span', { textContent: `${colaIndice + 1} / ${regras.length}` }),
          el('button', { type: 'button', className: 'db-cola__proxima', textContent: '→', title: 'Próxima regra', onclick: () => muda(1) }))))
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
      ...degraus.map(({ c, k, m, esc, cls }) => { const n = carta(c, `db-na-mesa ${cls}` + (pousando.has(c.id) ? ' oculta' : ''), esc); n.style.setProperty('--k', k); n.style.setProperty('--m', m); n.style.setProperty('--giro', giro(c.id) + 'deg'); return n }))
    if (pronta) esc.addEventListener('click', () => enviar())
    const esqLivre = !V.esq ? guarda('db-guarda--mesa') : ''
    const lo = lousa()
    if (pronta) { lo.classList.add('alvo'); lo.addEventListener('click', () => enviar()) }
    const direcao = V.js.length > 2 ? el('div', { className: `db-direcao db-arte db-arte-${V.dir > 0 ? 16 : 17}`, role: 'img',
      'aria-label': V.dir > 0 ? 'Sentido horário' : 'Sentido anti-horário', 'data-info': V.dir > 0 ? 'Sentido horário' : 'Sentido anti-horário' }) : ''
    return el('div', { className: 'db-centro' + (pronta ? ' pronta' : '') }, el('div', { className: `db-sentido ${V.dir > 0 ? 'hora' : 'anti'}` }, svg('seta')), el('div', { className: 'db-monte-col' }, monte, el('div', { className: 'db-monte-extras' }, direcao, esqLivre)), esc, lo)
  }
  // setinha amarela pulando em cima da cabeça de quem tem a vez
  const setaVez = (cls = '') => el('i', { className: `db-seta-vez ${cls}`, 'aria-hidden': 'true' }, el('b', { textContent: 'vez' }))
  // a seta fica numa camada por cima da mesa e das faixas, presa na cabeça (foto ou boneco) de quem joga
  function poeSetaVez() {
    tela.querySelector('.db-seta-vez')?.remove()
    if (V?.fase !== 'jogo' || !V.vez) return
    const eu = V.vez === me.key
    const alvo = eu ? tela.querySelector('.db-eu .db-mao') : tela.querySelector(`.db-assento[data-key="${CSS.escape(V.vez)}"] .db-retrato`)
    if (!alvo) return
    const seta = setaVez(eu ? 'db-seta-vez--eu' : ''); if (eu) seta.firstChild.textContent = 'sua vez'; tela.append(seta)
    const poe = () => {
      if (!seta.isConnected) return
      const r = alvo.getBoundingClientRect(), t = tela.getBoundingClientRect()
      if (!r.width) return
      seta.style.left = (r.left - t.left + r.width / 2) + 'px'; seta.style.top = (r.top - t.top - seta.offsetHeight - (eu ? r.height * .32 : 4)) + 'px'
    }
    poe(); requestAnimationFrame(poe)
    if (alvo.tagName === 'IMG' && !alvo.complete) alvo.addEventListener('load', poe, { once: true })
  }
  function assento(x, ang) {
    const P = pos(ang, 35, 37), C = pos(ang, 25, 26)
    const vez = V.fase === 'jogo' && V.vez === x.key
    const ven = V.vencedores?.includes(x.key)
    const s = el('div', { className: 'db-assento' + (vez ? ' vez' : '') + (ven ? ' vencedor' : ''), style: `left:${P.x}%;top:${P.y}%`, 'data-key': x.key, 'data-lugar': x.key },
      el('div', { className: 'db-medalha' }, retrato(x.key, x.nome), V.esq === x.key ? guarda('db-guarda--dono') : ''),
      el('span', { className: 'db-placa' }, x.nome, x.pts?.length ? el('i', { textContent: ` · ${x.tot} pt${x.tot === 1 ? '' : 's'}` }) : ''),
      x.conv ? el('small', { className: `db-conv db-conv--${x.conv}`, textContent: x.conv === 'sim' ? 'vai jogar' : x.conv === 'nao' ? 'só assiste' : 'decidindo…' }) : '')
    if (alvosGuarda().includes(x.key)) {
      s.classList.add('alvo-guarda'); s.title = `Jogar o Esquecido em ${x.nome}`
      s.setAttribute('role', 'button'); s.tabIndex = 0; s.setAttribute('aria-label', s.title)
      s.querySelector('.db-medalha').append(el('b', { className: 'db-mira' }, svg('guarda')))
      s.addEventListener('click', () => jogaGuarda(x.key))
      s.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); jogaGuarda(x.key) } })
    }
    if (V.repor?.[x.key]) s.querySelector('.db-medalha').append(el('i', { className: 'db-anel' + (protegido(x.key) ? ' protegido' : ''), 'data-fim': String(V.recebido + V.repor[x.key]), 'data-tot': String(REPOR_MS), title: 'ainda pode repor a mão' }))
    if (x.n == null) return [s]
    const eraN = antesRender?.id === V.id && antesRender.rodada === V.rodada ? antesRender.js?.find(y => y.key === x.key)?.n : x.n
    s.querySelector('.db-medalha').append(el('b', { className: 'db-qtd' + (eraN != null && eraN !== x.n ? (x.n > eraN ? ' pula sobe' : ' pula') : ''), textContent: x.n }))
    const n = Math.min(x.n, 8)
    const leque = el('div', { className: 'db-leque-mesa', style: `left:${C.x}%;top:${C.y}%;--yaw:${(-Math.cos(ang * Math.PI / 180) * 34).toFixed(1)}deg;--n:${n}`, 'data-mao': x.key, 'data-lugar': x.key, 'data-info': `${x.nome}: ${x.n} carta${x.n === 1 ? '' : 's'} na mão` },
      el('div', { className: 'db-leque-mesa__em-pe' }, ...Array.from({ length: n }, (_, i) => { const c = carta(null); c.style.setProperty('--i', i); c.style.setProperty('--o', (i - (n - 1) / 2).toFixed(2)); return c })))
    return [leque, comandaNaMesa(x, ang), s]
  }
  // ordem da mão: números crescentes, depois curinga, passa e inverte
  const ordemV = c => num(c) ? c.v : { cur: 13, passa: 14, inv: 15 }[c.v]
  function util(c) {
    if (c.v === 'passa' || c.v === 'inv') return true
    if (possivel([c], V.valor)) return true
    return V.mao.some(x => x.id !== c.id && (num(x) || x.v === 'cur') && possivel([c, x], V.valor))
  }
  // admin: painelzinho com as cartas de ação em destaque; clicar põe na fila das próximas compras
  let filaAberta = false
  let cliquesLogo = []
  function cliqueLogo() {
    const agora = Date.now(); cliquesLogo = [...cliquesLogo.filter(t => agora - t < 1200), agora]
    if (cliquesLogo.length < 3 || !souAdmin() || V.fase === 'fim') return
    cliquesLogo = []; filaAberta = !filaAberta; render()
  }
  const souAdmin = () => me.key === ADMIN && me.admin && V?.fila
  function filaUI() {
    if (!filaAberta || !souAdmin()) return ''
    const fila = V.fila || [], tem = V.filaTem || []
    const muda = f => { manda({ op: 'fila', fila: f }); ctx.logInterno?.(`fila do admin: ${f.join(' ') || 'vazia'}`) }
    const mini = v => carta({ id: -1, v: /^\d+$/.test(v) ? +v : v }, 'db-fila__c')
    const grade = el('div', { className: 'db-fila__ops' }, ...['cur', 'passa', 'inv', ...Array.from({ length: 11 }, (_, i) => String(12 - i))].map(v => {
      const b = el('button', { type: 'button', className: 'db-fila__op', title: `Pôr ${NOME_ACAO[v] || v} na fila` }, mini(v))
      b.addEventListener('click', () => muda([...fila, v])); return b
    }))
    const lista = el('div', { className: 'db-fila__lista' }, fila.length ? fila.map((v, i) => {
      const b = el('button', { type: 'button', className: 'db-fila__item' + (tem[i] === false ? ' falta' : ''), title: `${i + 1}ª compra: ${NOME_ACAO[v] || v}${tem[i] === false ? ' · não está no baralho agora (espera aparecer)' : ''} · clique para tirar` }, el('b', { textContent: `${i + 1}` }), mini(v))
      b.addEventListener('click', () => muda(fila.filter((_, k) => k !== i))); return b
    }) : el('small', { textContent: 'vazia: as compras vêm aleatórias' }))
    const limpar = el('button', { type: 'button', className: 'db-fila__limpa', textContent: 'Limpar' }); limpar.addEventListener('click', () => muda([]))
    const fechar = el('button', { type: 'button', className: 'db-fila__x', title: 'Fechar' }, icon('x')); fechar.addEventListener('click', () => { filaAberta = false; render() })
    return el('div', { className: 'db-fila' }, el('header', {}, el('b', { textContent: 'Próximas compras' }), fechar),
      el('small', { className: 'db-fila__k', textContent: 'Cartas' }), grade,
      el('small', { className: 'db-fila__k', textContent: `Fila (${fila.length}) · só sai carta que existe no baralho` }), lista, fila.length ? limpar : '')
  }

  function minhaArea(antes) {
    const j = eu(), conv = V.fase === 'convite'
    const bon = ctx.boneco?.(me.key)
    const minha = minhaVez()
    const chegouVez = minha && antes && antes.id === V.id && antes.vez !== me.key
    const area = el('div', { className: 'db-eu' + (minha ? ' vez' : '') + (chegouVez ? ' chegou-vez' : '') + (V.fase === 'jogo' ? ' em-jogo' : '') + (V.vencedores?.includes(me.key) ? ' vencedor' : ''), 'data-key': me.key },
      ctx.poseCartas?.(me.key) && j ? bonecoCartas(ctx.poseCartas(me.key), 'db') : bon ? el('img', { className: 'db-boneco', src: bon, alt: '', draggable: false }) : el('div', { className: 'db-boneco db-boneco--pfp' }, retrato(me.key, me.name)))
    if (conv) { if (V.conv[me.key]) area.append(el('small', { className: `db-conv db-conv--${V.conv[me.key]}`, textContent: V.conv[me.key] === 'sim' ? 'você vai jogar' : 'você só assiste' })); return area }
    if (!j || !V.mao) { area.append(el('small', { className: 'db-dica', textContent: 'assistindo' })); return area }
    const ids = new Set((antes?.mao || []).map(c => c.id))
    const ordenada = V.mao.slice().sort((a, b) => ordemV(a) - ordemV(b) || a.id - b.id)
    const joga = minha && V.etapa === 'joga'
    const mao = el('div', { className: 'db-mao', style: `--n:${ordenada.length}` },
      ...ordenada.map((c, i) => {
        const escolhida = sel.includes(c.id)
        const pode = joga && util(c)
        const n = carta(c, (escolhida ? 'escolhida' : pode ? 'pode' : joga ? 'nao' : '') + (pousando.has(c.id) ? ' oculta' : antes && antes.id === V.id && antes.rodada === V.rodada && !ids.has(c.id) ? ' chegou' : ''))
        // arco: as do meio mais altas, as pontas giram; o encaixe fica parado e recebe o hover, a carta é que sobe
        const tot = ordenada.length, off = i - (tot - 1) / 2, abre = Math.min(3.2, 26 / Math.max(tot, 1)), cai = Math.min(1.8, .3 + tot * .14) / Math.max(1, ((tot - 1) / 2) ** 2)
        const slot = el('div', { className: 'db-slot', style: `--i:${i};--off:${off.toFixed(2)};--rz:${(off * abre).toFixed(2)}deg;--ay:${(off * off * cai).toFixed(3)}cqh` }, n)
        n.addEventListener('click', () => clicaCarta(c))
        n.addEventListener('contextmenu', e => { if (sel.includes(c.id)) { e.preventDefault(); desmarca(c.id) } })
        return slot
      }))
    mao.addEventListener('click', e => { if (e.target === mao && sel.length) desmarca() })
    mao.dataset.lugar = me.key
    M.inclina(mao)
    if (joga && sel.length) area.append(el('small', { className: 'db-dica-sel', textContent: possivel(selCartas(), V.valor) ? 'clique de novo, na mesa ou em Jogar · botão direito tira' : sel.length === 1 ? 'escolha a outra do par' : 'esse par não chega' }))
    area.append(mao)
    if (V.esq === me.key) {
      const g = guarda('db-guarda--eu' + (alvosGuarda().length ? ' pronto' : ''))
      g.setAttribute('role', 'button'); g.tabIndex = 0
      g.setAttribute('aria-label', 'Esquecido: arraste até uma pessoa ou clique na foto destacada')
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); tela.querySelector('.db-assento.alvo-guarda')?.focus() } })
      area.append(g)
    }
    if (V.repor?.[me.key]) area.append(el('i', { className: 'db-pavio' + (protegido(me.key) ? ' protegido' : ''), 'data-fim': String(V.recebido + V.repor[me.key]), 'data-tot': String(REPOR_MS) }))
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
  function tremer(id) {
    tela.querySelector(`.db-mao .db-carta[data-id="${id}"]`)?.animate([{ translate: '0 0' }, { translate: '-1cqh 0' }, { translate: '1cqh 0' }, { translate: '-.6cqh 0' }, { translate: '.3cqh 0' }, { translate: '0 0' }], { duration: 340, easing: 'ease-out' })
  }
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
      bts.push(botao(`Comprar ${falta}`, () => { som('desliza'); manda({ op: 'compra' }) }, 'db-btn--forte db-btn--grande db-btn--repor', 'Repõe a mão antes do tempo acabar (senão fica com o Esquecido)'))
    }
    for (const k of alvosGuarda().slice(0, 3)) bts.push(botao([svg('guarda'), `Jogar em ${N(k)}`], () => jogaGuarda(k), 'db-btn--guarda', `${N(k)} esqueceu de repor a mão: passe o Esquecido (−1) para essa pessoa`))
    if (minhaVez()) {
      const cs = selCartas()
      if (cs.length) {
        const r = soCuringa(cs) ? null : calcula(cs, V.valor)
        const sozinha = cs.length === 1 && !possivel(cs, V.valor)
        const b = botao(sozinha ? 'Junte o par' : soCuringa(cs) ? 'Jogar · escolher valor' : r?.acao ? `Jogar ${NOME_ACAO[r.acao].toLowerCase()}` : `Jogar · ${r ? r.val : '–'}${r?.dobrou ? ' (dobrou!)' : ''}`, () => enviar(), 'db-btn--forte db-btn--grande')
        if (!possivel(cs, V.valor)) { b.disabled = true; b.title = 'Sozinha não chega no valor da lousa: escolha outra igual (ou um curinga)' }
        bts.push(b)
      }
      if (V.nMesa) {
        const levar = botao([`Levar a mesa · ${V.nMesa}`], () => { sel = []; manda({ op: 'pega' }) }, 'db-btn--levar' + (cs.length ? ' db-btn--leve' : ''), 'Põe as cartas da mesa na sua comanda e você abre a próxima escalada')
        levar.addEventListener('pointerenter', () => destacaDestinoMesa(true))
        levar.addEventListener('pointerleave', () => destacaDestinoMesa(false))
        levar.addEventListener('focus', () => destacaDestinoMesa(true))
        levar.addEventListener('blur', () => destacaDestinoMesa(false))
        bts.push(levar)
      }
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
            el('td', {}, r ? [`${r.pos}º · ${r.pts}`, r.esq ? el('span', { className: 'db-conta__esq', title: 'Carta Esquecido: −1' }, svg('guarda'), '−1') : ''] : '–'),
            el('td', { className: 'db-conta__tot', textContent: String(x.tot) }))
        }))),
      souHost() ? el('div', { className: 'db-linha' }, fim ? [botao('Nova partida', revanche, 'db-btn--forte'), botao('Fechar', encerrar)] : botao(`Rodada ${V.rodada + 1}`, () => novaRodada(false), 'db-btn--forte db-btn--grande'))
        : el('small', { className: 'db-espera', textContent: fim ? '' : `${V.hostNome} começa a próxima rodada` }))
  }
  // página inicial: a capa do jogo e a aula em passos (cada passo uma cena animada)
  function convite() {
    const host = souHost()
    const n = Object.entries(V.conv).filter(([k, v]) => v === 'sim' && ctx.presentes().includes(k)).length
    const capa = el('div', { className: 'db-capa' }, el('img', { src: CAPA, alt: 'Dobro', draggable: false }))
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
      el('div', { className: 'db-linha db-linha--esq' }, retrato(V.host, V.hostNome), el('span', {}, el('b', { textContent: V.hostNome }), ' chamou você para o Dobro')),
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
  // o Esquecido sai girando num arco de quem jogou até quem esqueceu, deixa rastro e cai com pancada
  function arremesso(e, at) {
    const A = deGuarda || (lugarDe(e.de) && noTela(lugarDe(e.de))); deGuarda = null
    const destino = () => tela.querySelector(e.para === me.key ? '.db-eu .db-guarda' : `.db-assento[data-key="${CSS.escape(e.para)}"] .db-guarda`)
    const medalha = () => e.para === me.key ? tela.querySelector('.db-eu .db-boneco') : tela.querySelector(`.db-assento[data-key="${CSS.escape(e.para)}"] .db-medalha`)
    const alvo0 = destino()
    if (!A || !alvo0) return 0
    const B = noTela(alvo0)
    alvo0.style.visibility = 'hidden'
    const T = tela.clientHeight, W = T * .065
    const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches
    const PREP = calmo ? 0 : 260, VOO = calmo ? 420 : 950
    const dist = Math.hypot(B.x - A.x, B.y - A.y)
    const C = { x: (A.x + B.x) / 2, y: Math.max(T * .02, Math.min(A.y, B.y) - Math.max(T * .16, dist * .38)) } // ponto alto do arco (sem sair da tela)
    const pt = t => ({ x: (1 - t) ** 2 * A.x + 2 * (1 - t) * t * C.x + t * t * B.x, y: (1 - t) ** 2 * A.y + 2 * (1 - t) * t * C.y + t * t * B.y })
    const voltas = B.x >= A.x ? 1 : -1
    const fim = B.w / W
    som('clique', at, .5)
    balao(e.de, e.de === me.key ? 'Toma!' : 'Toma, esqueceu!', 'leve', at)
    setTimeout(() => {
      const g = guarda('db-guarda--voa db-guarda--arremesso'); g.style.width = W + 'px'; tela.append(g)
      const sombra = el('i', { className: 'db-sombra-voo' }); tela.append(sombra)
      const tot = PREP + VOO, fr = []
      // preparo: recua, inclina e cresce, como quem pega impulso
      fr.push({ offset: 0, transform: `translate(${A.x}px,${A.y}px) translate(-50%,-50%) rotate(10deg) scale(${A.w / W})` })
      if (PREP) fr.push({ offset: PREP / tot, transform: `translate(${A.x - voltas * W * .5}px,${A.y + W * .25}px) translate(-50%,-50%) rotate(${-voltas * 40}deg) scale(1.25)`, easing: 'cubic-bezier(.5,0,.75,0)' })
      const PASSOS = 16
      for (let i = 1; i <= PASSOS; i++) {
        const t = i / PASSOS, p = pt(t)
        const esc = 1.25 + Math.sin(Math.PI * t) * .55 + (fim - 1.25) * t ** 3
        fr.push({ offset: (PREP + VOO * t) / tot, transform: `translate(${p.x}px,${p.y}px) translate(-50%,-50%) rotate(${voltas * 720 * (1 - (1 - t) ** 1.6) + 14 * t}deg) scale(${i === PASSOS ? fim : esc})` })
      }
      g.animate(fr, { duration: tot, easing: 'linear', fill: 'forwards' }).onfinish = () => g.remove()
      sombra.animate([
        { transform: `translate(${A.x}px,${A.y + A.h * .6}px) translate(-50%,-50%) scale(.9)`, opacity: .45 },
        { transform: `translate(${(A.x + B.x) / 2}px,${(A.y + B.y) / 2 + T * .06}px) translate(-50%,-50%) scale(.45)`, opacity: .18, offset: (PREP + VOO * .5) / tot },
        { transform: `translate(${B.x}px,${B.y + B.h * .6}px) translate(-50%,-50%) scale(.8)`, opacity: .4 },
      ], { duration: tot, easing: 'linear', fill: 'forwards' }).onfinish = () => sombra.remove()
      // rastro: guarda-chuvinhas fantasmas pelo caminho
      if (!calmo) for (let i = 1; i < 12; i++) setTimeout(() => {
        const p = pt(i / 12), r = el('i', { className: 'db-rastro' }, svg('guarda')); r.style.width = W * .7 + 'px'
        r.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%) rotate(${i * 60 * voltas}deg)`
        tela.append(r); setTimeout(() => r.remove(), 650)
      }, PREP + VOO * i / 12)
      som('desliza', PREP, .9)
    }, at)
    // pancada: o Esquecido aparece no lugar, a foto treme, um estalo de luz e o −1
    const pousa = at + PREP + VOO
    setTimeout(() => {
      const d = destino(); if (d) { d.style.visibility = ''; d.classList.add('chegou-guarda') }
      const m = medalha()
      if (m) { m.classList.remove('pancada'); void m.offsetWidth; m.classList.add('pancada'); setTimeout(() => m.classList.remove('pancada'), 700) }
      const bum = el('i', { className: 'db-impacto' }, ...Array.from({ length: 8 }, (_, i) => el('i', { style: `--a:${i * 45}deg` })))
      bum.style.left = B.x + 'px'; bum.style.top = B.y + 'px'; tela.append(bum); setTimeout(() => bum.remove(), 750)
      const menos = el('b', { className: 'db-menos1', textContent: '−1' }); menos.style.left = B.x + 'px'; menos.style.top = Math.max(B.y, T * .2) + 'px'; tela.append(menos); setTimeout(() => menos.remove(), 1300)
    }, pousa)
    som('golpe', pousa, .9)
    balao(e.para, e.para === me.key ? 'Esqueceu de repor! −1' : 'Pegou o Esquecido! −1', 'forte', pousa + 120)
    return PREP + VOO + 300
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
  function levaMesa(foto, key, at, qtd) {
    const para = comandaDe(key)
    if (!foto?.length || !para) return 0
    const B = noTela(para.querySelector('.db-bolo') || para)
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
    setTimeout(() => {
      const p = comandaDe(key); if (!p) return
      p.classList.remove('ganhou'); void p.offsetWidth; p.classList.add('ganhou')
      const mais = el('b', { className: 'db-comanda__chegaram', textContent: `+${qtd}` })
      p.append(mais); setTimeout(() => mais.remove(), 1400)
    }, at + 1450 + foto.length * 35)
    return 1500 + foto.length * 35
  }
  // jogada: a carta sai do lugar exato da mão (a dos outros, do leque, virando no ar) e sobe a escalada.
  // Dobrou, Passa, Inverte ou par: sobe alto e bate na mesa (onda, faíscas, a mesa sacode).
  function animaJogada(e, at, esc) {
    const h = M.cqh(), meu = e.key === me.key, cs = e.cartas
    const forte = !!(e.dobrou || e.acao || cs.length > 1), dur = forte ? 820 : 560, passo = forte ? 70 : 120
    const origem = meu ? null : M.ponto(lugarDe(e.key), 5 * h)
    let fimAt = 0
    cs.forEach((c, k) => {
      const n = esc?.querySelector(`.db-carta[data-id="${c.id}"]`)
      if (!n) return
      pousando.add(c.id); n.classList.add('oculta')
      const r = daMao.get(String(c.id)) || ultFotos.get(c.id); daMao.delete(String(c.id))
      const A = meu ? (r ? { x: r.x, y: r.y, w: r.w } : M.ponto(tela.querySelector('.db-mao'), 12 * h)) : origem
      const B = M.ponto(n), ultima = k === cs.length - 1
      M.voo(c, A, B, { atraso: at + k * passo, dur, alto: 6, lado: (k - (cs.length - 1) / 2) * 3.4, giro0: meu ? 0 : -giro(c.id) * 2, giro1: giro(c.id), vira: !meu, slam: forte, deita: 20,
        bate: ultima && forte ? () => { M.impacto(B, e.dobrou ? '#e8a817' : '#f3efe6', true); boteco.balanca(1); som('golpe', 0, .6) } : null,
        fim: () => { M.pousa(c.id, '.db-escalada'); boteco.balanca(.3); if (!forte) { M.impacto(B, '#f3efe6', false); som('poe', 0, .7) } } })
      fimAt = k * passo + dur * (forte ? .64 : .8)
    })
    if (cs.length > 1) som('leque', at, .8)
    return fimAt
  }
  // repor: as cartas descolam do monte em rajada; as minhas viram no ar e encaixam no lugar certo da mão
  function animaCompra(e, at, monte, ids) {
    const n = e.qtd || 1, eu_ = e.key === me.key, alvo = lugarDe(e.key), h = M.cqh()
    if (!monte || !alvo) { ids.forEach(id => M.pousa(id, '.db-mao')); return 0 }
    const topo = monte.querySelector('.db-carta:last-child') || monte, A = M.ponto(topo, topo.getBoundingClientRect().width)
    for (const id of ids) { pousando.add(id); const c = tela.querySelector(`.db-mao .db-carta[data-id="${id}"]`); c?.classList.add('oculta'); c?.classList.remove('chegou') }
    const voos = Math.max(n, ids.length), passo = 110, dur = 520
    if (!calmo()) setTimeout(() => topo.animate?.([{ translate: '0 0' }, { translate: '0 -1.2cqh' }, { translate: '0 0' }], { duration: 220, easing: 'ease-out' }), at)
    for (let i = 0; i < voos; i++) {
      const id = ids[i], slot = id != null ? tela.querySelector(`.db-mao .db-carta[data-id="${id}"]`) : null
      const c = id != null ? V.mao?.find(x => x.id === id) : null
      const B = slot ? M.ponto(slot, slot.offsetWidth) : M.ponto(alvo, eu_ ? 12 * h : 5 * h)
      M.voo(c || null, A, B, { atraso: at + i * passo, dur, alto: 5, giro0: (Math.random() * 20) - 10, giro1: slot ? parseFloat(slot.parentElement?.style.getPropertyValue('--rz')) || 0 : (Math.random() * 20) - 10, vira: !!c,
        fim: () => { if (id != null) M.pousa(id, '.db-mao') } })
      som('desliza', at + i * passo, eu_ ? .8 : .55)
    }
    return voos * passo + dur * .4
  }
  function anima(evs, antes, foto) {
    const esc = tela.querySelector('.db-escalada'), monte = tela.querySelector('.db-monte')
    // cartas que chegaram na minha mão (para voarem do monte até o lugar certo, virando no ar)
    const minhasNovas = antes && antes.id === V.id && antes.rodada === V.rodada && V.mao && antes.mao ? V.mao.map(c => c.id).filter(id => !antes.mao.some(c => c.id === id)) : []
    let t = 0
    for (const e of evs) {
      const at = t
      if (e.t === 'inicio') { balao(V.vez, 'Eu abro', 'leve', 3600); distribui(); t += 3200 }
      else if (e.t === 'joga') {
        if (e.key === me.key) poseJogaAte = Date.now() + 1000
        const d = animaJogada(e, at, esc)
        setTimeout(() => tela.querySelector('.db-lousa__v')?.classList.add('escreve'), at + d)
        if (e.dobrou) { carimbo('dobrou!', at + d + 80); som('carimbo', at + d + 80, .8) }
        else if (e.acao === 'passa') { som('pular', at + d); balao(e.key, 'Passa!', 'leve', at + 150) }
        if (e.esc && e.key !== me.key) balao(e.key, `Curinga vale ${e.esc}`, 'leve', at + 200)
        t += d + 200
      }
      else if (e.t === 'inverte') { som('inverter', at); setTimeout(() => giroMesa.inverte('.db-sentido'), at + 250); balao(e.key, 'Inverte!', 'leve', at) }
      else if (e.t === 'pegou') {
        const d = levaMesa(foto, e.key, at, e.qtd)
        som('leque', at, .8); som('desliza', at + 450, .8); som('papel', at + d - 100, .7)
        balao(e.key, e.key === me.key ? `+${e.qtd} na sua comanda` : `Levou ${e.qtd} carta${e.qtd === 1 ? '' : 's'}`, e.qtd >= 8 ? 'forte' : 'leve', at + d - 200)
        t += d
      }
      else if (e.t === 'compra') t += animaCompra(e, at, monte, e.key === me.key ? minhasNovas.splice(0, e.qtd || 1) : [])
      else if (e.t === 'esqueceu') {
        const g = guarda('db-guarda--voa')
        voa(tela.querySelector('.db-centro') || monte, e.key === me.key ? tela.querySelector('.db-eu .db-guarda') || tela.querySelector('.db-eu') : tela.querySelector(`.db-assento[data-key="${CSS.escape(e.key)}"] .db-medalha`), g, { atraso: at, dur: 600 })
        som('golpe', at + 450, .7)
        balao(e.key, e.key === me.key ? 'Esqueceu de comprar! −1' : 'Esqueceu de comprar!', 'forte', at + 500)
      }
      else if (e.t === 'arremesso') t += arremesso(e, at)
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
      const h = M.cqh()
      ordem.forEach((n, k) => {
        const minha = !!n.closest('.db-mao'), c = minha ? V.mao?.find(x => x.id === +n.dataset.id) : null
        M.voo(c, M.ponto(pilha, pilha.getBoundingClientRect().width), M.ponto(n, minha ? n.offsetWidth : 5 * h), { atraso: k * passo, dur: 420, alto: 4, giro0: (Math.random() * 30) - 15, vira: !!c,
          fim: () => { n.classList.remove('oculta'); if (k % 2 === 0) som('desliza', 0, .45) } })
      })
      setTimeout(() => { entregando = false; tela.querySelectorAll('.db-carta.oculta').forEach(n => { if (!pousando.has(+n.dataset.id)) n.classList.remove('oculta') }) }, ordem.length * passo + 700)
    }, dur + 120)
  }
  // poses de carta do boneco "você" (quem tem a pasta 'cartas' no config): mudam sem render, no laço
  const POSES_CARTAS = ['poucas', 'muitas', 'uma', 'dormindo', 'pensando', 'joga']
  let poseJogaAte = 0, ultimoGesto = Date.now(), posesCarregadas = false
  for (const t of ['pointerdown', 'keydown']) document.addEventListener(t, () => { ultimoGesto = Date.now() }, { passive: true })
  function poseAgora() {
    if (Date.now() < poseJogaAte) return 'joga'
    const minha = V?.fase === 'jogo' && V.vez === me.key, n = V?.mao?.length || 0
    if (!minha && Date.now() - ultimoGesto > 90000) return 'dormindo'
    if (n === 1) return 'uma'
    if (minha) return 'pensando'
    return n >= 10 ? 'muitas' : 'poucas'
  }
  function bonecoCartas(base, cls) {
    if (!posesCarregadas) { posesCarregadas = true; POSES_CARTAS.forEach(n => { new Image().src = `${base}${n}.webp` }) }
    const img = el('img', { className: `${cls}-boneco ${cls}-boneco--cartas`, src: `${base}${poseAgora()}.webp`, alt: '', draggable: false })
    img.dataset.base = base
    return img
  }
  function atualizaPose(cls) {
    const b = tela.querySelector(`.${cls}-boneco--cartas`); if (!b) return
    const src = `${b.dataset.base}${poseAgora()}.webp`
    if (!b.src.endsWith(src)) b.src = src
  }
  ;(function loop() {
    atualizaPose('db')
    if (V) {
      // A proteção termina mesmo sem nova mensagem de rede; mantém o prazo original ao redesenhar.
      if (faseRepor() !== reporUI) render()
      if (arrastoGuarda?.ativo) atualizaArrastoGuarda()
      const pres = new Set(ctx.presentes())
      for (const s of tela.querySelectorAll('.db-assento[data-key], .db-eu[data-key]')) { s.classList.toggle('fala', !!ctx.falando?.(s.dataset.key)); s.classList.toggle('caiu', !pres.has(s.dataset.key)) }
      for (const tm of tela.querySelectorAll('[data-fim]')) {
        const r = Math.max(0, +tm.dataset.fim - Date.now()), tot = +tm.dataset.tot || 1
        tm.classList.toggle('protegido', r > REPOR_MS)
        tm.style.setProperty('--t', String(Math.min(1, r / tot))); tm.classList.toggle('fim', r < 3000)
        if (tm.classList.contains('db-pavio') && r > 0 && r <= 3000) { const sx = Math.ceil(r / 1000); if (tm.dataset.tic !== String(sx)) { tm.dataset.tic = String(sx); som('tique', 0, sx === 1 ? 1.25 : 1) } }
      }
    }
    setTimeout(() => requestAnimationFrame(loop), 120)
  })()
  document.addEventListener('keydown', e => {
    if (!V || e.target.closest?.('input, textarea')) return
    if (e.key === 'Escape' && arrastoGuarda) { cancelaArrastoGuarda(); return }
    if (e.key === 'Escape' && (escolhe || sel.length)) { escolhe = false; sel = []; render() }
    else if (e.key === 'Enter' && sel.length && !escolhe) { e.preventDefault(); enviar() }
  })
  // Captura no contêiner estável: o estado pode redesenhar a mesa durante o gesto.
  tela.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !e.isPrimary || !e.target.closest('.db-eu .db-guarda--eu') || V?.fase !== 'jogo' || V.esq !== me.key) return
    e.preventDefault(); cancelaArrastoGuarda()
    arrastoGuarda = { id: e.pointerId, x: e.clientX, y: e.clientY, inicioX: e.clientX, inicioY: e.clientY, ativo: false, alvo: null }
    tela.setPointerCapture(e.pointerId)
  })
  tela.addEventListener('pointermove', e => {
    const a = arrastoGuarda
    if (a?.id === e.pointerId) {
      a.x = e.clientX; a.y = e.clientY
      if (!a.ativo && Math.hypot(a.x - a.inicioX, a.y - a.inicioY) >= 6) {
        a.ativo = true; a.carta = guarda('db-guarda--arrastando'); a.carta.setAttribute('aria-hidden', 'true'); tela.append(a.carta)
      }
      atualizaArrastoGuarda()
    }
    const lugar = !a && e.target.closest('[data-lugar]')?.dataset.lugar
    tela.querySelectorAll('[data-lugar]').forEach(n => n.classList.toggle('db-lugar-foco', n.dataset.lugar === lugar))
  })
  tela.addEventListener('pointerup', e => {
    if (arrastoGuarda?.id !== e.pointerId) return
    atualizaArrastoGuarda()
    const a = arrastoGuarda; cancelaArrastoGuarda()
    if (a.ativo && a.alvo) jogaGuarda(a.alvo)
    else if (!a.ativo) toast('Arraste o Esquecido até uma pessoa destacada ou clique na foto dela.')
  })
  tela.addEventListener('pointercancel', e => { if (arrastoGuarda?.id === e.pointerId) cancelaArrastoGuarda() })
  tela.addEventListener('lostpointercapture', e => { if (arrastoGuarda?.id === e.pointerId) cancelaArrastoGuarda() })
  window.addEventListener('blur', cancelaArrastoGuarda)
  // informação no hover
  const dica = el('div', { className: 'db-info', hidden: true })
  tela.addEventListener('pointermove', e => {
    if (arrastoGuarda?.ativo) { dica.hidden = true; return }
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
  tela.addEventListener('pointerleave', () => { dica.hidden = true; tela.querySelectorAll('.db-lugar-foco').forEach(n => n.classList.remove('db-lugar-foco')) })

  function iniciar(chamados) {
    carregaSons()
    if (V && !souHost()) return toast(`Já tem uma mesa de Dobro aberta (de ${V.hostNome})`)
    if (G) return toast('A mesa já está aberta')
    abrir(chamados)
  }
  window.__db = () => ({ G, V, render, difunde, boteco })
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
