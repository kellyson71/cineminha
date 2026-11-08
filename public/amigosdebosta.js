// Amigos de Merda: a cada turno alguém compra uma pergunta e lê em voz alta. Todos votam ao mesmo tempo
// apontando para alguém (com a opção "vale em si", também em si mesmo). O mais votado fica com a carta; quem juntar a meta de cartas
// é coroado o Amigo de Bosta. Empate: quem não votou nos empatados pode trocar o voto; se persistir, vale o voto de quem leu.
// Se quem leu também está no empate (o voto dele não teria escolha de verdade), o desempate vai para a roleta: sorteio entre os empatados.
// Mesma estrutura dos outros jogos: o host guarda tudo e manda para cada um só o que pode ver ({ ab: ... }).
import { CARTAS, CARTAS_18 } from './jogos/amigosdebosta/cartas.js'

const SOM = n => `jogos/coup/sons/${n}.mp3`
const SONS = ['embaralhar', 'desliza1', 'desliza2', 'desliza3', 'poe1', 'poe2', 'leque', 'carimbo', 'papel', 'vez', 'clique', 'tique']
const VOL = { embaralhar: .5, carimbo: .6, papel: .45, vez: .5, clique: .3, tique: .4 }
const SAIU_MS = 12000, HOST_MS = 10000, EMPATE_MS = 25000, ROLETA_MS = 4600
const ABRE_MS = 1700 // o host só aceita votos depois da contagem 3-2-1
const CORES = ['#ff3d81', '#2f7bf5', '#26a65b', '#ff9f1a', '#8b5cf6', '#0aa5c0', '#e5484d', '#7cb518', '#d63fc4', '#0b84d6', '#d98a00', '#13a393']

// ícones desenhados
const IMG = n => `<img src="jogos/amigosdebosta/img/${n}.svg" alt="" draggable="false">`
const ICONE = { coco: IMG('1f4a9'), coroa: IMG('1f451'), dedo: IMG('1f447'), fogo: IMG('1f525'), mao: IMG('261d') }


const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n }
const embaralha = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]] } return a }
const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch {} } }
const NS = 'http://www.w3.org/2000/svg'
const META = [[4, 'rápida · 4'], [5, 'normal · 5'], [7, 'longa · 7']]
const TEMPO = [[0, 'sem limite'], [30, '30 s'], [60, '60 s']]
const SI = [[true, 'vale votar em si'], [false, 'não vale em si']]
const PICANTE = [[false, 'só cartas pretas'], [true, 'pretas + rosas 18+']]

export function criaAmigosDeBosta(ctx) {
  const { icon, toast, sysMsg, me } = ctx
  const tela = ctx.tela
  // o ctx.el do app não transforma data-* em atributo; sem isso os seletores [data-...] quebram
  const el = (tag, props = {}, ...kids) => {
    const dados = {}, resto = {}
    for (const [k, v] of Object.entries(props)) (k.startsWith('data-') ? dados : resto)[k] = v
    const n = ctx.el(tag, resto, ...kids.flat())
    for (const [k, v] of Object.entries(dados)) n.setAttribute(k, v)
    return n
  }

  /* =================================================================== host */
  let G = null, restaurou = false
  const ausDesde = new Map()
  const jog = k => G?.js.find(j => j.key === k)
  const log = t => { G.log.push(t); if (G.log.length > 60) G.log.splice(0, G.log.length - 60) }
  const ev = e => { G.ev.push({ ...e, n: ++G.evN }); if (G.ev.length > 30) G.ev.splice(0, G.ev.length - 30) }
  const leitor = () => G.js[G.vez]?.key
  const novoId = () => Math.random().toString(36).slice(2, 9)

  function abrir(chamados) {
    const op = ls.get('ab.op') || {}
    const pl = ls.get('ab.placar')
    G = { id: novoId(), host: me.key, hostNome: me.name, fase: 'convite',
      op: { meta: [4, 5, 7].includes(op.meta) ? op.meta : 5, tempo: [0, 30, 60].includes(op.tempo) ? op.tempo : 0, picante: !!op.picante, si: op.si !== false },
      conv: Object.fromEntries(ctx.presentes().map(k => [k, k === me.key || chamados?.includes(k) ? 'sim' : '?'])),
      js: [], vez: 0, rodada: 0, carta: null, deck: [], desc: [], votos: {}, emp: null, abre: 0, fimVoto: 0,
      vencRodada: null, unanime: false, coroar: false, vencedor: null,
      placar: pl && Date.now() - pl.t < 10 * 3600e3 ? pl.p : {}, log: [], ev: [], evN: 0, seq: 0, t: Date.now() }
    sysMsg(`${me.name} abriu uma mesa de Amigos de Merda`)
    difunde()
  }
  function comecar() {
    if (G?.fase !== 'convite') return
    const pres = new Set(ctx.presentes())
    const ks = Object.keys(G.conv).filter(k => G.conv[k] === 'sim' && pres.has(k))
    if (ks.length < 3) return toast('Precisa de pelo menos 3 pessoas.')
    ls.set('ab.op', G.op)
    embaralha(ks)
    G.deck = embaralha([...CARTAS.map((t, i) => ({ id: `c${i}`, t, n: i })), ...(G.op.picante ? CARTAS_18.map((t, i) => ({ id: `p${i}`, t, n: i, p: 1 })) : [])]); G.desc = []
    G.js = ks.map(k => ({ key: k, nome: ctx.nomeDe(k), cartas: [] }))
    G.vez = rnd(ks.length); G.rodada = 1; G.log = []
    ev({ t: 'inicio' })
    sysMsg(`Amigos de Merda começou: ${G.js.map(j => j.nome).join(', ')}`)
    compraCarta()
  }
  // o jogador da vez compra a carta do monte
  function compraCarta() {
    if (!G.deck.length) { G.deck = embaralha(G.desc); G.desc = [] }
    G.carta = G.deck.pop() || null
    G.votos = {}; G.emp = null; G.vencRodada = null; G.unanime = false; G.coroar = false; G.abre = 0; G.fimVoto = 0
    G.fase = 'leitura'
    log(`Rodada ${G.rodada}: ${jog(leitor()).nome} lê a carta.`)
    ev({ t: 'carta', quem: leitor() })
    difunde()
  }
  function valendo(key) {
    if (G.fase !== 'leitura' || (key !== leitor() && key !== G.host)) return
    G.fase = 'votando'
    G.abre = Date.now() + ABRE_MS
    G.fimVoto = G.op.tempo ? Date.now() + 2300 + G.op.tempo * 1000 : 0
    ev({ t: 'valendo' })
    difunde()
  }
  function vota(key, alvo) {
    if (G.fase !== 'votando' || Date.now() < G.abre || !jog(key) || !jog(alvo) || (alvo === key && !G.op.si)) return
    G.votos[key] = alvo
    ev({ t: 'votou', key })
    if (G.js.every(j => G.votos[j.key])) return fechaVotacao()
    difunde()
  }
  const conta = () => {
    const c = {}
    for (const j of G.js) c[j.key] = 0
    for (const a of Object.values(G.votos)) if (a in c) c[a]++
    const max = Math.max(0, ...Object.values(c))
    return { c, max, tied: max ? Object.keys(c).filter(k => c[k] === max) : [] }
  }
  function fechaVotacao() {
    G.fimVoto = 0
    const { tied } = conta()
    if (!tied.length) { // ninguém votou (tempo esgotado): a carta volta para o descarte
      G.desc.push(G.carta); G.fase = 'resultado'; G.vencRodada = null
      ev({ t: 'nada' }); log('Ninguém votou.')
      return difunde()
    }
    ev({ t: 'revela' })
    avalia(tied)
  }
  function avalia(tied) {
    if (tied.length === 1) return ganhou(tied[0])
    // empate: quem não votou em nenhum dos empatados pode trocar o voto para um deles
    const elig = G.js.map(j => j.key).filter(k => !tied.includes(G.votos[k]))
    G.emp = { tied, elig, resp: {}, fim: Date.now() + EMPATE_MS }
    G.fase = 'empate'
    ev({ t: 'empate' }); log(`Empate entre ${tied.map(k => jog(k).nome).join(' e ')}.`)
    if (!elig.length) return resolveEmpate()
    difunde()
  }
  function respEmpate(key, alvo) {
    const e = G.emp
    if (G.fase !== 'empate' || !e.elig.includes(key) || key in e.resp) return
    if (alvo != null && (!e.tied.includes(alvo) || (alvo === key && !G.op.si))) return
    e.resp[key] = alvo ?? false
    if (e.elig.every(k => k in e.resp)) return resolveEmpate()
    difunde()
  }
  function resolveEmpate() {
    const e = G.emp
    for (const [k, a] of Object.entries(e.resp)) if (a && jog(k)) { G.votos[k] = a; ev({ t: 'troca', key: k, alvo: a }) }
    const { tied } = conta()
    if (tied.length <= 1) return tied.length ? ganhou(tied[0]) : fechaVotacao()
    // continua empatado: vale o voto de quem leu a carta
    const v = G.votos[leitor()]
    if (tied.includes(v)) { log('O voto de quem leu desempatou.'); return ganhou(v) }
    // quem leu está no empate: escolher "o outro" não é desempate de verdade, então vai no sorteio
    if (tied.includes(leitor())) return sorteia(tied)
    G.emp = { tied, elig: [], resp: {}, fim: Date.now() + EMPATE_MS }
    G.fase = 'minerva'
    ev({ t: 'minerva' })
    difunde()
  }
  function sorteia(tied) {
    G.emp = null
    G.roleta = { tied, vence: tied[rnd(tied.length)], fim: Date.now() + ROLETA_MS }
    G.fase = 'roleta'
    ev({ t: 'roleta' }); log(`Continua empatado: sorteio entre ${tied.map(k => jog(k).nome).join(' e ')}.`)
    difunde()
  }
  function minerva(key, alvo) {
    if (G.fase !== 'minerva' || key !== leitor() || !G.emp.tied.includes(alvo) || (alvo === key && !G.op.si)) return
    G.votos[key] = alvo; ev({ t: 'troca', key, alvo })
    ganhou(alvo)
  }
  function ganhou(k) {
    const j = jog(k), { c } = conta()
    j.cartas.push(G.carta)
    G.vencRodada = k; G.emp = null; G.roleta = null
    G.unanime = G.js.length > 2 && c[k] >= G.js.length - (G.op.si ? 0 : 1)
    G.fase = 'resultado'
    G.coroar = j.cartas.length >= G.op.meta
    ev({ t: 'ganhou', key: k, unanime: G.unanime })
    log(`${j.nome} ficou com a carta${G.unanime ? ' (unânime)' : ''}.`)
    difunde()
  }
  function proxima(key) {
    if (G.fase !== 'resultado' || (key !== leitor() && key !== G.host)) return
    if (G.coroar) return coroa()
    G.vez = (G.vez + 1) % G.js.length; G.rodada++
    compraCarta()
  }
  function coroa() {
    const max = Math.max(...G.js.map(j => j.cartas.length))
    const vs = G.js.filter(j => j.cartas.length === max)
    G.fase = 'fim'; G.vencedor = vs.map(j => j.key)
    for (const x of vs) G.placar[x.key] = (G.placar[x.key] || 0) + 1
    ls.set('ab.placar', { t: Date.now(), p: G.placar })
    ev({ t: 'coroa', keys: G.vencedor })
    sysMsg(`👑 ${vs.map(j => j.nome).join(' e ')} ${vs.length > 1 ? 'são' : 'é'} o Amigo de Bosta`)
    difunde()
  }
  function revanche() {
    const ant = new Set(G.js.map(j => j.key))
    G.conv = Object.fromEntries(ctx.presentes().map(k => [k, ant.has(k) || k === me.key ? 'sim' : '?']))
    Object.assign(G, { id: novoId(), fase: 'convite', js: [], carta: null, votos: {}, emp: null, vencRodada: null, vencedor: null, coroar: false, log: [], ev: [], evN: 0 })
    difunde()
  }
  // alguém saiu de vez: as cartas voltam para o monte e a pessoa sai da mesa
  function remove(key) {
    if (G.fase === 'convite') { if (key in G.conv) { delete G.conv[key]; difunde() } return }
    const i = G.js.findIndex(j => j.key === key)
    if (i < 0) return
    const j = G.js[i], eraLeitor = i === G.vez
    G.desc.push(...j.cartas)
    delete G.votos[key]
    for (const [k, a] of Object.entries(G.votos)) if (a === key) delete G.votos[k]
    G.js.splice(i, 1)
    ausDesde.delete(key)
    ev({ t: 'saiu', key, nome: j.nome }); log(`${j.nome} saiu da mesa.`); sysMsg(`${j.nome} saiu do Amigos de Merda`)
    if (G.fase === 'fim') return difunde()
    if (G.js.length < 3) {
      const max = Math.max(...G.js.map(x => x.cartas.length), 0)
      G.fase = 'fim'; G.vencedor = G.js.filter(x => x.cartas.length === max).map(x => x.key); return difunde()
    }
    if (i < G.vez) G.vez--
    else if (eraLeitor) G.vez = G.fase === 'resultado' ? (i - 1 + G.js.length) % G.js.length : i % G.js.length
    if (G.fase === 'resultado') {
      if (G.vencRodada === key) { G.vencRodada = null; G.coroar = false }
      return difunde()
    }
    if (eraLeitor) { if (G.carta) G.desc.push(G.carta); return compraCarta() }
    if (G.fase === 'votando') {
      if (G.js.every(x => G.votos[x.key])) return fechaVotacao()
    } else if (G.fase === 'empate' || G.fase === 'minerva' || G.fase === 'roleta') {
      G.roleta = null
      const { tied } = conta()
      if (!tied.length) return fechaVotacao()
      return avalia(tied)
    }
    difunde()
  }
  function hostRecebe(d, key) {
    if (!G || !key || d.id !== G.id) return
    switch (d.op) {
      case 'resp': if (G.fase === 'convite') { G.conv[key] = d.sim ? 'sim' : 'nao'; difunde() } break
      case 'sai': if (key !== G.host) remove(key); break // saiu para outra mesa
      case 'valendo': valendo(key); break
      case 'vota': vota(key, d.alvo); break
      case 'troca': respEmpate(key, d.alvo || null); break
      case 'minerva': minerva(key, d.alvo); break
      case 'proxima': proxima(key); break
    }
  }
  function vista(k) {
    const f = G.fase, agora = Date.now()
    const revelados = !['convite', 'leitura', 'votando'].includes(f)
    return {
      id: G.id, seq: G.seq, host: G.host, hostNome: G.hostNome, fase: f, op: G.op, conv: G.conv, placar: G.placar,
      js: G.js.map(x => ({ key: x.key, nome: x.nome, cartas: x.cartas.map(c => c.t) })), vez: G.js.length ? leitor() : null, rodada: G.rodada,
      carta: G.carta ? G.carta.t : null, cartaP: !!G.carta?.p, cartaNumero: G.carta?.n ?? null, monte: G.deck.length,
      // votos secretos até todos votarem
      votos: revelados ? G.votos : null, votou: f === 'votando' ? Object.keys(G.votos) : null, meuVoto: G.votos[k] || null,
      roleta: G.roleta && { tied: G.roleta.tied, vence: G.roleta.vence, restaMs: Math.max(0, G.roleta.fim - agora) },
      emp: G.emp && { tied: G.emp.tied, elig: G.emp.elig, resp: Object.keys(G.emp.resp), restaMs: Math.max(0, G.emp.fim - agora) },
      abreMs: f === 'votando' ? Math.max(0, G.abre - agora) : 0, restaMs: f === 'votando' && G.fimVoto ? Math.max(0, G.fimVoto - agora) : 0,
      vencRodada: G.vencRodada, unanime: G.unanime, coroar: G.coroar, vencedor: G.vencedor, log: G.log.slice(-30), ev: G.ev,
    }
  }
  function difunde() {
    if (!G) return
    G.seq++; G.t = Date.now()
    ls.set('ab.G', G)
    const ks = new Set([...ctx.presentes(), ...G.js.map(j => j.key), ...Object.keys(G.conv || {})])
    for (const k of ks) if (k !== me.key) ctx.sendTo(k, { ab: { v: vista(k) } })
    const pres = new Set(ctx.presentes())
    G.sucessor = G.js.map(j => j.key).find(k => k !== me.key && pres.has(k)) || [...pres].find(k => k !== me.key) || null
    if (G.sucessor) ctx.sendTo(G.sucessor, { ab: { bk: G } })
    aplica(vista(me.key))
  }
  function encerrar() {
    if (!G) return
    ctx.send({ ab: { fim: G.id } })
    ls.set('ab.G', null)
    G = null
    aplica(null)
  }
  let backup = null, hostSumiu = 0
  function assumeSePreciso() {
    if (G || !V || !backup || backup.id !== V.id || backup.sucessor !== me.key || souHost()) { hostSumiu = 0; return }
    if (ctx.presentes().includes(V.host)) { hostSumiu = 0; return }
    if (!hostSumiu) hostSumiu = Date.now()
    if (Date.now() - hostSumiu < HOST_MS) return
    const antigo = backup.host, nomeAntigo = backup.hostNome
    G = backup; backup = null; hostSumiu = 0
    G.host = me.key; G.hostNome = me.name; G.seq += 5
    sysMsg(`${nomeAntigo} caiu: ${me.name} assumiu a mesa do Amigos de Merda`)
    remove(antigo)
    if (G) difunde()
  }
  setInterval(() => {
    if (!G && !restaurou && me.key) {
      restaurou = true
      const s = ls.get('ab.G')
      if (s && s.host === me.key && s.fase !== 'fim' && Date.now() - s.t < 3 * 3600e3) setTimeout(() => { if (G || (V && V.host !== me.key)) return ls.set('ab.G', null); G = s; difunde() }, 3000)
    }
    assumeSePreciso()
    if (!G || G.host !== me.key) return
    const pres = new Set(ctx.presentes()), agora = Date.now()
    const quem = G.fase === 'convite' ? Object.keys(G.conv).filter(k => k !== me.key) : G.js.map(j => j.key).filter(k => k !== me.key)
    for (const k of quem) { if (pres.has(k)) ausDesde.delete(k); else if (!ausDesde.has(k)) ausDesde.set(k, agora) }
    for (const [k, t] of ausDesde) if (agora - t > SAIU_MS) return remove(k)
    // tempos esgotados
    if (G.fase === 'votando' && G.fimVoto && agora > G.fimVoto) fechaVotacao()
    else if (G.fase === 'empate' && agora > G.emp.fim) resolveEmpate()
    else if (G.fase === 'roleta' && agora > G.roleta.fim) { const v = G.roleta.vence; if (jog(v)) ganhou(v); else { G.roleta = null; avalia(conta().tied) } }
    else if (G.fase === 'minerva' && agora > G.emp.fim) { const op = G.emp.tied.filter(k => G.op.si || k !== leitor()); minerva(leitor(), op[rnd(op.length)]) }
  }, 1000)

  /* =================================================================== cliente */
  let V = null, ultEv = 0, dispensado = '', libera = 0, liberaId = ''
  const vistos = new Set()
  const novo = id => { if (vistos.has(id)) return false; vistos.add(id); return true }
  const souHost = () => V && V.host === me.key
  const eu = () => V?.js.find(j => j.key === me.key)
  const N = k => k === me.key ? 'Você' : (V?.js.find(j => j.key === k)?.nome || ctx.nomeDe(k))
  const corDe = k => CORES[Math.max(0, V?.js.findIndex(j => j.key === k)) % CORES.length]
  function manda(d) {
    if (!V) return
    const m = { id: V.id, ...d } // nunca usar um campo "id" dentro de d
    if (souHost()) hostRecebe(m, me.key)
    else ctx.sendTo(V.host, { ab: { op: m } })
  }
  function got(d, deKey) {
    if (!d) return
    if (d.op) { if (G && G.host === me.key) hostRecebe(d.op, deKey); return }
    if (d.fim) { if (V?.id === d.fim) aplica(null); return }
    if (d.bk) { if (d.bk.host === deKey) backup = d.bk; return }
    if (d.v) {
      if (G && d.v.id === G.id && d.v.host !== me.key) { G = null; ls.set('ab.G', null) }
      if (d.v.id === dispensado) return
      if (V && d.v.id === V.id && d.v.seq <= V.seq) return
      if (ctx.outroJogo?.()) return
      aplica(d.v)
    }
  }
  function aplica(v) {
    const antes = V
    if (v && (!antes || antes.id !== v.id)) ultEv = Math.max(0, ...v.ev.map(e => e.n), 0)
    V = v
    if (v) v.recebido = Date.now()
    if (v && v.fase === 'votando' && liberaId !== `${v.id}:${v.rodada}`) { liberaId = `${v.id}:${v.rodada}`; libera = Date.now() + v.abreMs + 350 }
    const evs = v ? v.ev.filter(e => e.n > ultEv) : []
    if (v) ultEv = Math.max(ultEv, ...v.ev.map(e => e.n), 0)
    render()
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
  const botao = (conteudo, fn, cls = '', title = '') => { const b = el('button', { type: 'button', className: `ab-btn ${cls}`, title }); b.append(...[conteudo].flat()); b.addEventListener('click', e => { e.stopPropagation(); b.blur(); som('clique'); fn(e) }); return b }
  const retrato = (k, nm, cls = '') => el('span', { className: `ab-foto ${cls}`, style: `--cor:${corDe(k)}` }, ctx.pfp(k, 64, nm))
  const ico = (tipo, cls) => { const s = el('span', { className: cls }); s.innerHTML = ICONE[tipo]; return s }

  /* ---------- render ---------- */
  let novosV = [], voaCarta = null
  function render() {
    tela.classList.toggle('ab--on', !!V)
    ctx.onAtivo?.(!!V)
    if (!V) { tela.replaceChildren(); vistos.clear(); return }
    novosV = []; voaCarta = null
    const topo = el('header', { className: 'ab-topo' },
      el('span', { className: 'ab-logo' }, el('img', { className: 'ab-logo__arte', src: 'jogos/amigosdebosta/verso-preto.png', alt: '' }), el('b', { textContent: 'Amigos de Merda' })),
      V.fase !== 'convite' && V.fase !== 'fim' ? el('span', { className: 'ab-rodada', textContent: `rodada ${V.rodada} · quem juntar ${V.op.meta} cartas leva a coroa` }) : '',
      el('span', { className: 'ab-grow' }),
      souHost() ? botao(icon('x'), e => confirma(e.currentTarget, 'Fechar a mesa?', encerrar), 'ab-btn--ic', 'Fechar a mesa para todos')
        : botao(icon('x'), () => { dispensado = V.id; aplica(null) }, 'ab-btn--ic', 'Sair da mesa (só para você)'))
    let corpo
    if (V.fase === 'convite') corpo = convite()
    else if (V.fase === 'fim') corpo = fim()
    else corpo = mesa()
    const barra = V.fase === 'votando' && V.restaMs && V.op.tempo ? el('div', { className: 'ab-tempo', style: `--dur:${V.op.tempo * 1000}ms;--ja:${Math.max(0, V.op.tempo * 1000 - V.restaMs)}ms` }, el('i')) : ''
    tela.replaceChildren(topo, barra, corpo, bilhete(), contagem())
    ctx.hydrate(tela)
    fazVotos()
    fazVooCarta()
    if (V.fase === 'votando' && Date.now() < libera) { const id = liberaId; setTimeout(() => { if (V && liberaId === id && V.fase === 'votando') render() }, libera - Date.now() + 30) }
  }
  function confirma(btn, txt, fn) {
    if (btn.dataset.conf) return fn()
    btn.dataset.conf = '1'; btn.classList.add('confirma')
    const tip = el('span', { className: 'ab-tip', textContent: `${txt} Clique de novo.` }); btn.append(tip)
    setTimeout(() => { delete btn.dataset.conf; btn.classList.remove('confirma'); tip.remove() }, 2600)
  }
  function contagem() {
    const falta = libera - Date.now()
    if (V.fase !== 'votando' || falta <= 0 || falta > 3000) return ''
    const dec = 2100 - Math.min(2100, falta) // quanto da animação já passou
    return el('div', { className: 'ab-contagem' }, ...['3', '2', '1', 'Já!'].map((t, i) => el('span', { textContent: t, style: `animation-delay:${i * 600 - dec}ms` })))
  }

  /* ---------- página inicial com tutorial ---------- */
  function convite() {
    const host = souHost()
    const n = Object.entries(V.conv).filter(([k, v]) => v === 'sim' && ctx.presentes().includes(k)).length
    const rosto = cls => el('i', { className: `ab-rosto ${cls}` }, el('u'), el('u'), el('s'))
    const mini = cls => el('i', { className: `ab-mc ${cls}` }, el('b'), el('b'), el('b'))
    const quadro = (num, cena, rotulo) => el('div', { className: 'ab-passo', style: `--d:${num * 120}ms` }, el('div', { className: `ab-cena ab-cena--${num}` }, ...cena), el('span', { className: 'ab-passo__rot' }, el('em', { textContent: num }), rotulo))
    const tutorial = el('div', { className: 'ab-tutorial' },
      quadro(1, [el('span', { className: 'ab-t-monte' }, mini('costas'), mini('costas'), mini('costas')), mini('virada'), el('span', { className: 'ab-t-fala' }, el('b'), el('b'), el('b')), rosto('leitor')], 'Leia a pergunta'),
      quadro(2, [rosto('f1'), rosto('f2'), rosto('f3'), rosto('f4'), ...[1, 2, 4].map(i => el('span', { className: `ab-t-seta s${i}` }, ico('dedo', 'ab-t-dedo')))], 'Apontem juntos'),
      quadro(3, [el('span', { className: 'ab-t-alvo' }, rosto('f3'), mini('g1'), mini('g2'), mini('g3')), ico('coroa', 'ab-t-coroa')], 'Mais votado leva a carta'))
    const seg = (lista, atual, campo) => el('div', { className: 'ab-seg' }, ...lista.map(([v, t]) => host
      ? botao(t, () => { G.op[campo] = v; difunde() }, atual === v ? 'on' : '')
      : el('span', { className: atual === v ? 'on' : '', textContent: t })))
    const pessoas = el('div', { className: 'ab-pessoas' }, ...Object.entries(V.conv).map(([k, v]) => el('span', { className: `ab-pessoa ab-pessoa--${v}`, title: v === 'sim' ? 'vai jogar' : v === 'nao' ? 'só assiste' : 'decidindo' }, retrato(k, ctx.nomeDe(k)), el('small', { textContent: k === me.key ? 'você' : ctx.nomeDe(k) }))))
    const ir = host ? botao(n >= 3 ? `Começar · ${n}` : `Precisa de 3 · ${n}`, comecar, 'ab-btn--forte ab-btn--grande') : el('small', { className: 'ab-espera', textContent: `${V.hostNome} vai começar` })
    if (host && n < 3) ir.disabled = true
    return el('div', { className: 'ab-inicio' }, tutorial,
      el('p', { className: 'ab-regra' }, ico('dedo', 'ab-regra__ic' + (V.op.si ? ' vale' : '')), V.op.si ? 'vale votar em você mesmo' : 'não vale votar em você mesmo'),
      pessoas,
      el('div', { className: 'ab-linha' }, seg(META, V.op.meta, 'meta'), seg(TEMPO, V.op.tempo, 'tempo'), seg(PICANTE, !!V.op.picante, 'picante'), seg(SI, V.op.si !== false, 'si'), host ? botao(V.conv[me.key] === 'sim' ? 'Eu jogo' : 'Eu só assisto', () => { G.conv[me.key] = G.conv[me.key] === 'sim' ? 'nao' : 'sim'; difunde() }, 'ab-btn--leve') : '', ir),
      el('span', { className: 'ab-selo', textContent: '86 cartas pretas · 22 rosas opcionais' }))
  }
  function bilhete() {
    if (V.fase !== 'convite' || souHost() || V.conv[me.key] !== '?') return ''
    if (novo('conv:' + V.id)) som('papel')
    return el('div', { className: 'ab-bilhete' },
      el('div', { className: 'ab-linha' }, retrato(V.host, V.hostNome), el('span', {}, el('b', { textContent: V.hostNome }), ' chamou você para o Amigos de Merda')),
      el('div', { className: 'ab-linha' }, botao('Jogar', () => manda({ op: 'resp', sim: true }), 'ab-btn--forte'), botao('Só assistir', () => manda({ op: 'resp', sim: false }), 'ab-btn--leve')))
  }

  /* ---------- a mesa ---------- */
  function mesa() {
    return el('div', { className: `ab-mesa ab-fase-${V.fase}` }, centro(), jogadores())
  }
  function centro() {
    const nv = Math.max(1, Math.min(5, Math.ceil(V.monte / 24)))
    const monte = el('div', { className: 'ab-monte', 'data-monte': '1', title: `${V.monte} cartas no monte` },
      ...Array.from({ length: nv }, (_, i) => el('i', { className: 'ab-costas', style: `--i:${i}` }, el('b', { className: 'ab-costas__ic', textContent: '?' }))), el('small', { textContent: V.monte }))
    // a carta: compra no começo do turno; depois da votação voa até quem ganhou
    const compra = V.carta && novo(`carta:${V.id}:${V.rodada}`)
    let cartaEl
    if (!V.carta || (V.fase === 'resultado' && V.vencRodada && !novo(`gan:${V.id}:${V.rodada}`) )) {
      cartaEl = el('div', { className: 'ab-carta ab-carta--vazia' })
    } else {
      cartaEl = el('div', { className: 'ab-carta' + (V.cartaP ? ' picante' : '') + (compra ? ' compra' : ''), 'data-carta': '1' },
        el('p', { className: 'ab-carta__txt' + (V.carta.length > 130 ? ' ab-carta__txt--longa' : ''), textContent: V.carta }),
        V.cartaNumero != null ? el('span', { className: 'ab-carta__numero', 'aria-label': `Carta ${V.cartaNumero}`, textContent: V.cartaNumero }) : '')
      if (V.fase === 'resultado' && V.vencRodada) voaCarta = cartaEl
    }
    return el('div', { className: 'ab-centro' }, monte, cartaEl, painel())
  }
  function painel() {
    const f = V.fase, souLeitor = V.vez === me.key, jogando = !!eu()
    const nota = (...k) => el('div', { className: 'ab-nota' }, ...k)
    const quem = k => el('span', { className: 'ab-nota__quem' }, retrato(k, N(k)), el('b', { textContent: N(k) }))
    if (f === 'leitura') {
      return nota(
        el('p', {}, souLeitor ? 'Sua vez! Leia a pergunta em voz alta.' : [quem(V.vez), ' está lendo a pergunta em voz alta…']),
        souLeitor || souHost() ? botao('Valendo!', () => manda({ op: 'valendo' }), 'ab-btn--forte ab-btn--grande') : '')
    }
    if (f === 'votando') {
      const faltam = V.js.length - V.votou.length
      const alvo = V.meuVoto
      return nota(
        el('p', {}, !jogando ? 'Só assistindo a votação.' : alvo ? ['Você apontou ', el('b', { textContent: alvo === me.key ? 'você mesmo' : N(alvo) }), '. Pode mudar até o último votar.'] : V.op.si ? 'Clique na foto de quem merece. Vale em você também!' : 'Clique na foto de quem merece. Não vale em você!'),
        el('small', { className: 'ab-nota__st', textContent: faltam > 0 ? `faltam ${faltam} votar` : 'todos votaram' }))
    }
    if (f === 'empate') {
      const e = V.emp, elig = e.elig.includes(me.key), resp = e.resp.includes(me.key)
      const escolhas = elig && !resp ? el('div', { className: 'ab-escolhas' }, ...e.tied.filter(k => V.op.si || k !== me.key).map(k => botaoPessoa(k, () => manda({ op: 'troca', alvo: k }))), botao('Manter meu voto', () => manda({ op: 'troca', alvo: '' }), 'ab-btn--leve')) : ''
      return nota(
        el('p', {}, el('b', { className: 'ab-grito', textContent: 'Empate!' }), ' ', elig ? (resp ? 'Aguardando os outros…' : 'Você não votou nos empatados: pode trocar o voto para um deles ou manter.') : 'Quem não votou nos empatados pode trocar o voto.'),
        escolhas)
    }
    if (f === 'roleta') {
      const r = V.roleta
      return nota(
        el('p', {}, el('b', { className: 'ab-grito', textContent: 'Continua empatado!' }), ' Quem leu está no empate, então vai na roleta:'),
        el('div', { className: 'ab-roleta', 'data-fim': String(V.recebido + r.restaMs), 'data-vence': r.vence }, ...r.tied.map(k => el('span', { className: 'ab-roleta__p', 'data-key': k }, retrato(k, N(k)), el('b', { textContent: N(k) })))))
    }
    if (f === 'minerva') {
      const e = V.emp
      return nota(
        el('p', {}, el('b', { className: 'ab-grito', textContent: 'Continua empatado!' }), ' ', souLeitor ? 'Vale o seu voto: desempate.' : [quem(V.vez), ' desempata com o voto dele.']),
        souLeitor ? el('div', { className: 'ab-escolhas' }, ...e.tied.filter(k => V.op.si || k !== me.key).map(k => botaoPessoa(k, () => manda({ op: 'minerva', alvo: k })))) : '')
    }
    if (f === 'resultado') {
      const vk = V.vencRodada
      const pode = souLeitor || souHost()
      return nota(
        vk ? el('p', {}, quem(vk), V.unanime ? ' ganhou por unanimidade!' : ' ficou com a carta!') : el('p', {}, 'Ninguém votou. A carta volta pro monte.'),
        V.coroar ? el('p', { className: 'ab-grito' }, `${V.op.meta} cartas! Hora da coroa.`) : '',
        pode ? botao(V.coroar ? 'Coroar!' : 'Próxima pergunta', () => manda({ op: 'proxima' }), 'ab-btn--forte') : el('small', { className: 'ab-nota__st', textContent: 'quem leu avança a rodada' }))
    }
    return nota()
  }
  const botaoPessoa = (k, fn) => botao([retrato(k, N(k)), el('span', { textContent: N(k) })], fn, 'ab-btn--pessoa')

  function jogadores() {
    const f = V.fase, vota = f === 'votando' && !!eu()
    const pode = vota && Date.now() >= libera
    const lider = (() => { const m = Math.max(...V.js.map(j => j.cartas.length)); const l = V.js.filter(j => j.cartas.length === m); return m > 0 && l.length === 1 ? l[0].key : null })()
    const pres = new Set(ctx.presentes())
    const tied = V.emp?.tied || []
    const grande = V.js.length > 7
    let ordemV = 0
    const tiles = V.js.map((j, i) => {
      const k = j.key, souEu = k === me.key
      const deles = V.votos ? Object.entries(V.votos).filter(([, a]) => a === k).map(([de]) => de) : []
      const venc = V.vencRodada === k
      const cls = ['ab-jog']
      if (souEu) cls.push('meu')
      const podeEm = !souEu || V.op.si
      if (vota && podeEm) cls.push('vota'); if (pode && podeEm) cls.push('pode')
      if (V.meuVoto === k && f === 'votando') cls.push('escolhido')
      if (V.vez === k) cls.push('leitor')
      if (tied.includes(k)) cls.push('empatado')
      if (venc) cls.push('venceu')
      if (f === 'resultado' && V.vencRodada && !venc) cls.push('perdeu')
      if (!pres.has(k) && k !== me.key) cls.push('caiu')
      const votos = deles.map(de => {
        const chave = `v:${V.id}:${V.rodada}:${de}:${k}`
        const anim = novo(chave)
        const idx = anim ? novosV.length : -1
        if (anim) novosV.push({ de, k, idx })
        return el('i', { className: 'ab-voto' + (anim ? ' chega' : ''), style: `--cor:${corDe(de)};--at:${idx >= 0 ? idx * 320 + 620 : 0}ms`, 'data-de': de, title: `${N(de)} votou` }, ctx.pfp(de, 32, N(de)))
      })
      const novaCarta = venc && f === 'resultado' && novo(`pil:${V.id}:${V.rodada}`)
      const atrasoCarta = (V.votos ? Object.keys(V.votos).length : 0) * 320 + 1500
      const pilha = el('div', { className: 'ab-pilha', title: `${j.cartas.length} carta(s)` },
        ...j.cartas.map((t, n) => el('i', { className: 'ab-mini' + (novaCarta && n === j.cartas.length - 1 ? ' nova' : ''), style: `--n:${n};--atraso:${atrasoCarta}ms`, title: t })),
        j.cartas.length ? el('b', { textContent: j.cartas.length }) : '')
      const coroaN = lider === k && V.fase !== 'convite' ? el('span', { className: 'ab-coroa' + (novo(`coroa:${V.id}:${k}:${j.cartas.length}`) ? ' cai' : ''), style: `--atraso:${atrasoCarta + 500}ms` }, ico('coroa', 'ab-coroa__ic')) : ''
      const t = el('div', { className: cls.join(' '), style: `--cor:${corDe(k)};--i:${i}`, 'data-key': k },
        coroaN,
        el('div', { className: 'ab-jog__foto' }, retrato(k, N(k)),
          f === 'votando' && V.votou.includes(k) ? el('span', { className: 'ab-visto', textContent: '✓' }) : '',
          V.vez === k && f !== 'resultado' ? el('span', { className: 'ab-lendo', textContent: 'lê' }) : '',
          venc ? el('span', { className: 'ab-ganhou', textContent: V.unanime ? 'unânime!' : 'levou!' }) : ''),
        el('b', { className: 'ab-jog__nome', textContent: souEu ? 'você' : j.nome }),
        pilha,
        el('div', { className: 'ab-votos' }, ...votos))
      t.addEventListener('click', () => {
        if (!vota || !podeEm || Date.now() < libera) return
        som('poe', 0, .6); manda({ op: 'vota', alvo: k })
      })
      return t
    })
    return el('div', { className: 'ab-jogs' + (grande ? ' muitos' : ''), style: `--n:${V.js.length}` }, ...tiles)
  }

  // setas e fichas indo do votante até a foto votada
  function fazVotos() {
    if (!novosV.length) return
    const tr = tela.getBoundingClientRect()
    if (!tr.width) return
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('class', 'ab-setas'); svg.setAttribute('viewBox', `0 0 ${tr.width} ${tr.height}`)
    const centro = k => { const n = tela.querySelector(`.ab-jog[data-key="${k}"] .ab-foto`); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.left - tr.left + r.width / 2, y: r.top - tr.top + r.height / 2, r: r.width / 2 } }
    for (const v of novosV) {
      const a = centro(v.de), b = centro(v.k)
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d
      const x1 = a.x + ux * a.r * .9, y1 = a.y + uy * a.r * .9, x2 = b.x - ux * (b.r + 6), y2 = b.y - uy * (b.r + 6)
      const cx = (x1 + x2) / 2 - uy * d * .18, cy = (y1 + y2) / 2 + ux * d * .18 - d * .06
      const cor = corDe(v.de), at = v.idx * 320
      const p = document.createElementNS(NS, 'path')
      p.setAttribute('d', `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`); p.setAttribute('pathLength', '1')
      p.setAttribute('fill', 'none'); p.setAttribute('stroke', cor); p.setAttribute('stroke-width', '5'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-dasharray', '1'); p.setAttribute('stroke-dashoffset', '1')
      const ang = Math.atan2(y2 - cy, x2 - cx), s = 15
      const h = document.createElementNS(NS, 'path')
      h.setAttribute('d', `M${x2 - Math.cos(ang - .5) * s} ${y2 - Math.sin(ang - .5) * s} L${x2} ${y2} L${x2 - Math.cos(ang + .5) * s} ${y2 - Math.sin(ang + .5) * s}`)
      h.setAttribute('fill', 'none'); h.setAttribute('stroke', cor); h.setAttribute('stroke-width', '5'); h.setAttribute('stroke-linecap', 'round'); h.setAttribute('stroke-linejoin', 'round'); h.setAttribute('opacity', '0')
      svg.append(p, h)
      p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 520, delay: at, easing: 'ease-out', fill: 'forwards' })
      h.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, delay: at + 440, fill: 'forwards' })
      som('poe', at + 480, .6)
    }
    tela.append(svg)
    const fim = novosV.length * 320 + 1700
    svg.animate([{ opacity: 1 }, { opacity: 1, offset: .75 }, { opacity: 0 }], { duration: fim, fill: 'forwards' }).onfinish = () => svg.remove()
  }
  // a carta, depois de contados os votos, voa até a pilha de quem ganhou
  function fazVooCarta() {
    if (!voaCarta || V.fase !== 'resultado') return
    const alvo = tela.querySelector(`.ab-jog[data-key="${V.vencRodada}"] .ab-pilha`)
    const c = tela.querySelector('.ab-carta[data-carta]')
    if (!alvo || !c) return
    const a = c.getBoundingClientRect(), b = alvo.getBoundingClientRect()
    const atraso = (V.votos ? Object.keys(V.votos).length : 0) * 320 + 1500
    const sx = Math.max(.08, 3.4 * (b.height || 20) / a.height)
    c.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(${Math.min(.16, sx)}) rotate(12deg)`, opacity: .9 }],
      { duration: 700, delay: atraso, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' })
    som('carimbo', atraso + 600, .8)
  }

  /* ---------- fim ---------- */
  function fim() {
    const vs = V.vencedor || []
    const r = V.js.slice().sort((a, b) => b.cartas.length - a.cartas.length)
    const cartasDele = vs.length === 1 ? V.js.find(j => j.key === vs[0])?.cartas || [] : []
    return el('div', { className: 'ab-fim' },
      el('div', { className: 'ab-fim__topo' },
        ico('coroa', 'ab-fim__coroa'),
        el('div', { className: 'ab-fim__fotos' }, ...vs.map(k => retrato(k, N(k), 'ab-foto--grande')))),
      el('small', { className: 'ab-fim__sub', textContent: 'o Amigo de Bosta é' }),
      el('b', { className: 'ab-fim__t', textContent: vs.includes(me.key) && vs.length === 1 ? 'VOCÊ!' : vs.map(N).join(' e ') }),
      cartasDele.length ? el('div', { className: 'ab-fim__cartas' }, ...cartasDele.map((t, i) => el('p', { className: 'ab-fim__carta', style: `--i:${i}`, textContent: t }))) : '',
      el('ol', { className: 'ab-fim__lista' }, ...r.map(j => el('li', {}, retrato(j.key, j.nome), el('span', { textContent: j.nome }), el('b', { textContent: `${j.cartas.length} ${j.cartas.length === 1 ? 'carta' : 'cartas'}` })))),
      souHost() ? el('div', { className: 'ab-linha' }, botao('Nova partida', revanche, 'ab-btn--forte'), botao('Fechar', encerrar, 'ab-btn--leve')) : '')
  }

  /* ---------- animações ---------- */
  function embaralha2() {
    tela.querySelectorAll('.ab-monte').forEach(m => { m.classList.remove('embaralhando'); void m.offsetWidth; m.classList.add('embaralhando') })
    som('embaralhar')
  }
  // roleta do desempate: o destaque passa de foto em foto, desacelera e para em quem foi sorteado (calculado pelo relógio,
  // então todo mundo vê a mesma coisa e um render no meio não reinicia nada)
  const TIQUES = (() => { const t = []; let soma = 0, i = 0; while (soma < ROLETA_MS - 650) { soma += 55 + 7 * i + .55 * i * i; t.push(soma); i++ } return t })()
  let roletaUlt = ''
  setInterval(() => {
    const r = tela.querySelector('.ab-roleta'); if (!r) return
    const ps = [...r.querySelectorAll('.ab-roleta__p')], n = ps.length; if (!n) return
    const fim = +r.dataset.fim, vi = Math.max(0, ps.findIndex(p => p.dataset.key === r.dataset.vence))
    const passou = Date.now() - (fim - ROLETA_MS)
    const j = TIQUES.filter(x => x <= passou).length, parou = j >= TIQUES.length
    const i = ((vi - (TIQUES.length - j)) % n + n) % n
    ps.forEach((p, k) => p.classList.toggle('on', k === i))
    r.classList.toggle('parou', parou)
    const marca = `${fim}:${j}`
    if (marca !== roletaUlt) { if (roletaUlt.split(':')[0] === String(fim)) som(parou ? 'carimbo' : 'tique', 0, parou ? .7 : .35); roletaUlt = marca }
  }, 30)
  function anima(evs, antes) {
    let t = 0
    if (evs.some(e => e.t === 'inicio')) { embaralha2(); t = 1100 }
    for (const e of evs) {
      if (e.t === 'carta') { som('leque', t + 100); som('desliza', t + 250, .6); if (e.quem === me.key) som('vez', t + 600) }
      else if (e.t === 'valendo') { som('tique', 0); som('tique', 600); som('tique', 1200) }
      else if (e.t === 'empate' || e.t === 'minerva') som('vez', 900)
      else if (e.t === 'roleta') som('embaralhar', 300, .5)
      else if (e.t === 'ganhou') som('leque', (V.votos ? Object.keys(V.votos).length : 0) * 320 + 1400)
      else if (e.t === 'coroa') som('leque', 200)
      else if (e.t === 'saiu') toast(`${e.nome} saiu da mesa`, 3200)
    }
  }

  function iniciar(chamados) {
    carregaSons()
    if (V && !souHost()) return toast(`Já tem uma mesa aberta (de ${V.hostNome})`)
    if (G) return toast('A mesa já está aberta')
    abrir(chamados)
  }
  window.__ab = () => ({ G, V, difunde })
  return {
    got: (d, k) => { carregaSons(); got(d, k) }, iniciar, ativo: () => !!V,
    // para o app: troca de jogo e mesas paralelas
    lider: () => !!V && souHost(),
    encerra: () => { if (G && G.host === me.key) encerrar() },
    sair: () => { if (!V) return; if (G && G.host === me.key) return encerrar(); manda({ op: 'sai' }); dispensado = V.id; aplica(null) },
    jogadores: () => !V ? [] : V.fase === 'convite' || !V.js?.length ? Object.keys(V.conv || {}).filter(k => V.conv[k] === 'sim') : V.js.filter(j => !j.fora).map(j => j.key),
    entrouAlguem: key => { if (!G || G.host !== me.key) return; if (G.fase === 'convite' && !(key in G.conv)) { G.conv[key] = '?'; return difunde() } ctx.sendTo(key, { ab: { v: vista(key) } }) },
  }
}
