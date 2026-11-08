// Agentes de Boteco: jogo de dicas em dois times (mecânica de associação de palavras, nome, palavras e visual próprios).
// 25 cartas na mesa do bar; cada time tem seus agentes escondidos entre elas, há clientes inocentes e um dedo-duro.
// O chefe de cada time vê o mapa e dá uma dica (número sempre; a palavra pode ser digitada ou só falada na call).
// O time toca as cartas: acertou, continua; cliente ou agente rival, a vez passa; o dedo-duro, o time perde na hora.
// Mesma arquitetura dos outros jogos: o host guarda tudo e manda a cada um só o que pode ver ({ ag: ... }).

import { PALAVRAS } from './jogos/agentes/palavras.js'

const XX = 'ag'
const NOME = 'Agentes de Boteco'
const SOM = n => `jogos/coup/sons/${n}.mp3`
const SONS = ['embaralhar', 'desliza1', 'desliza2', 'desliza3', 'poe1', 'poe2', 'leque', 'carimbo', 'papel', 'vez', 'clique', 'tique', 'golpe', 'moedas']
const VOL = { embaralhar: .5, carimbo: .65, papel: .5, vez: .5, clique: .3, tique: .3, golpe: .7, moedas: .6, leque: .6 }
const SAIU_MS = 12000, HOST_MS = 10000
const TIMES = { r: 'Vermelho', b: 'Azul' }
const outro = t => t === 'r' ? 'b' : 'r'
const INF = 99 // dica "∞": palpites à vontade
const ADMIN = 'kellyson' // admin logado: um clique no logo mostra o mapa (as cores das cartas), mesmo sendo agente

const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n }
const embaralha = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]] } return a }
const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch {} } }
const sem = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()

// desenhos próprios
const SVG = {
  tampa: '<svg viewBox="0 0 40 40"><path d="M20 2l3.2 3.4 4.4-1.4 1.5 4.4 4.5.9-.6 4.6 3.6 2.9-2.6 3.8 2 4.2-4 2.2.2 4.6-4.6.5-1.7 4.3-4.3-1.6L20 38l-3.2-3.4-4.4 1.4-1.5-4.4-4.5-.9.6-4.6L3.4 23.2 6 19.4 4 15.2l4-2.2-.2-4.6 4.6-.5 1.7-4.3 4.3 1.6z" fill="currentColor"/><circle cx="20" cy="20" r="11.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.6"/><path d="M14 17.5c2-3.2 6-4.4 9.4-2.6" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.8" stroke-linecap="round"/></svg>',
  // cliente inocente: caneca de chope
  caneca: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14h22v26a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3z"/><path d="M32 19h4a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-4"/><path d="M10 14c0-4 3-7 7-6 1-3 6-4 8-1 4-1 7 2 7 7"/><path d="M17 22v14M25 22v14"/></svg>',
  // dedo-duro: olho no buraco da fechadura
  dedo: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24z"/><circle cx="24" cy="24" r="6"/><path d="M24 22v4"/><path d="M8 8l32 32" stroke-width="3.4"/></svg>',
  chefe: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9l4 3 5-6 5 6 4-3-2 10H5z"/><rect x="5" y="20" width="14" height="2" rx="1"/></svg>',
}

export function criaAgentes(ctx) {
  const { icon, toast, sysMsg, me } = ctx
  const tela = ctx.tela
  const el = (tag, props = {}, ...kids) => {
    const dados = {}, resto = {}
    for (const [k, v] of Object.entries(props)) (k.startsWith('data-') ? dados : resto)[k] = v
    const n = ctx.el(tag, resto, ...kids.flat())
    for (const [k, v] of Object.entries(dados)) n.setAttribute(k, v)
    return n
  }

  /* ================================================================ host */
  let G = null, restaurou = false
  const ausDesde = new Map()
  const log = t => { G.log.push(t); if (G.log.length > 80) G.log.splice(0, G.log.length - 80) }
  const ev = e => { G.ev.push({ ...e, n: ++G.evN }); if (G.ev.length > 40) G.ev.splice(0, G.ev.length - 40) }
  const nomeK = k => ctx.nomeDe(k)
  const timeDe = k => G.times[k] || null
  const membros = t => Object.keys(G.times).filter(k => G.times[k] === t)
  const faltam = t => G.cartas.filter(c => c.cor === t && !c.rev).length

  function abrir() {
    const op = ls.get(`${XX}.op`) || {}
    G = { id: Math.random().toString(36).slice(2, 9), host: me.key, hostNome: me.name, fase: 'convite', op,
      conv: Object.fromEntries(ctx.presentes().map(k => [k, 'sim'])), times: {}, chefe: { r: null, b: null },
      cartas: [], vez: 'r', comeca: rnd(2) ? 'r' : 'b', etapa: 'dica', dica: null, restam: 0, chutes: 0, marcas: {},
      hist: [], placar: ls.get(`${XX}.placar`) || { r: 0, b: 0 }, vencedor: null, motivo: null,
      log: [], ev: [], evN: 0, seq: 0, t: Date.now() }
    // quem já jogou antes volta para o mesmo time
    const ant = ls.get(`${XX}.times`) || {}
    for (const k of Object.keys(G.conv)) if (ant[k] === 'r' || ant[k] === 'b') G.times[k] = ant[k]
    sysMsg(`${me.name} abriu uma mesa de ${NOME}`)
    difunde()
  }
  // lobby: cada um escolhe o time e quem é chefe; ou sorteia tudo
  function escolheTime(key, lado) {
    if (G.fase === 'fim') return
    if (lado !== 'r' && lado !== 'b' && lado !== null) return
    if (G.fase === 'jogo' && (G.chefe.r === key || G.chefe.b === key)) return // chefe não troca no meio
    const era = G.times[key]
    if (lado) G.times[key] = lado; else delete G.times[key]
    if (era && era !== lado && G.chefe[era] === key) G.chefe[era] = null
    if (G.fase === 'jogo' && lado && era !== lado) { ev({ t: 'entrou', key, lado }); log(`${nomeK(key)} entrou no ${TIMES[lado]}.`) }
    difunde()
  }
  function viraChefe(key) {
    if (G.fase !== 'convite') return
    const t = G.times[key]; if (!t) return
    G.chefe[t] = G.chefe[t] === key ? null : key
    difunde()
  }
  function sorteia() {
    if (G.fase !== 'convite') return
    const pres = new Set(ctx.presentes())
    const ks = embaralha(Object.keys(G.conv).filter(k => pres.has(k) && G.conv[k] !== 'nao'))
    G.times = {}; ks.forEach((k, i) => { G.times[k] = i % 2 ? 'b' : 'r' })
    for (const t of ['r', 'b']) { const m = membros(t); G.chefe[t] = m.length ? m[rnd(m.length)] : null }
    ev({ t: 'sorteio' })
    difunde()
  }
  const prontos = () => ['r', 'b'].every(t => G.chefe[t] && membros(t).length >= 2)
  function comecar() {
    if (G?.fase !== 'convite' || !prontos()) return
    ls.set(`${XX}.times`, G.times)
    const ws = embaralha([...PALAVRAS]).slice(0, 25)
    const c0 = G.comeca
    const cores = embaralha([...Array(9).fill(c0), ...Array(8).fill(outro(c0)), ...Array(7).fill('n'), 'x'])
    G.cartas = ws.map((p, i) => ({ p, cor: cores[i], rev: false, por: null }))
    G.vez = c0; G.etapa = 'dica'; G.dica = null; G.restam = 0; G.chutes = 0; G.marcas = {}; G.hist = []
    G.fase = 'jogo'; G.vencedor = null; G.motivo = null; G.log = []
    log(`Partida começou. ${TIMES[c0]} começa (9 agentes; ${TIMES[outro(c0)]} tem 8).`)
    ev({ t: 'inicio' })
    sysMsg(`${NOME} começou: Vermelho (${membros('r').map(nomeK).join(', ')}) × Azul (${membros('b').map(nomeK).join(', ')})`)
    difunde()
  }
  function daDica(key, { txt, num }) {
    if (G.fase !== 'jogo' || G.etapa !== 'dica' || G.chefe[G.vez] !== key) return
    const n = num === 'inf' ? INF : Number(num)
    if (n !== INF && !(Number.isInteger(n) && n >= 0 && n <= 9)) return
    const palavra = String(txt || '').trim().slice(0, 24).replace(/\s+/g, ' ')
    if (palavra && G.cartas.some(c => !c.rev && sem(c.p) === sem(palavra))) return // não vale palavra da mesa
    G.dica = { txt: palavra || null, n, por: key, lado: G.vez }
    G.restam = n === 0 || n === INF ? INF : n + 1
    G.chutes = 0; G.etapa = 'palpite'; G.marcas = {}
    G.hist.push({ lado: G.vez, txt: palavra || null, n, acertos: [] })
    ev({ t: 'dica', lado: G.vez, txt: palavra || null, num: n })
    log(`Chefe ${TIMES[G.vez].toLowerCase()} (${nomeK(key)}): ${palavra ? `"${palavra}"` : 'dica falada'} · ${n === INF ? '∞' : n}.`)
    difunde()
  }
  const podeChutar = key => G.fase === 'jogo' && G.etapa === 'palpite' && timeDe(key) === G.vez && G.chefe[G.vez] !== key
  function marca(key, { idx }) {
    const c = G.cartas[idx]
    if (!podeChutar(key) || !c || c.rev) return
    const l = G.marcas[idx] || []
    G.marcas[idx] = l.includes(key) ? l.filter(k => k !== key) : [...l, key]
    if (!G.marcas[idx].length) delete G.marcas[idx]
    difunde()
  }
  function revela(key, { idx }) {
    const c = G.cartas[idx]
    if (!podeChutar(key) || !c || c.rev) return
    c.rev = true; c.por = key
    delete G.marcas[idx]
    const lado = G.vez, h = G.hist[G.hist.length - 1]
    h?.acertos.push({ p: c.p, cor: c.cor })
    ev({ t: 'revela', idx, cor: c.cor, key, lado })
    log(`${nomeK(key)} abriu ${c.p}: ${c.cor === 'x' ? 'o dedo-duro!' : c.cor === 'n' ? 'cliente.' : c.cor === lado ? 'agente do time!' : `agente do ${TIMES[c.cor]}.`}`)
    if (c.cor === 'x') return fim(outro(lado), 'dedo')
    if (!faltam('r')) return fim('r', 'agentes')
    if (!faltam('b')) return fim('b', 'agentes')
    if (c.cor === lado) {
      G.chutes++
      if (G.restam !== INF) G.restam--
      if (G.restam <= 0) return passa(null, true)
      return difunde()
    }
    passa(null, true)
  }
  function passa(key, forcado) {
    if (!forcado && (!podeChutar(key) || !G.chutes)) return
    if (!forcado) { ev({ t: 'passou', key, lado: G.vez }); log(`${nomeK(key)} passou a vez.`) }
    G.vez = outro(G.vez); G.etapa = 'dica'; G.dica = null; G.restam = 0; G.chutes = 0; G.marcas = {}
    ev({ t: 'vez', lado: G.vez })
    difunde()
  }
  function fim(lado, motivo) {
    G.fase = 'fim'; G.vencedor = lado; G.motivo = motivo
    G.placar[lado] = (G.placar[lado] || 0) + 1
    ls.set(`${XX}.placar`, G.placar)
    ev({ t: 'fim', lado, motivo })
    log(`${TIMES[lado]} venceu${motivo === 'dedo' ? ': o outro time abriu o dedo-duro' : ''}.`)
    sysMsg(`🍺 ${TIMES[lado]} venceu o ${NOME}${motivo === 'dedo' ? ' (dedo-duro!)' : ''}`)
    difunde()
  }
  // nova partida: mesmos times, palavras novas, o outro time começa; ou volta ao lobby para trocar
  function revanche(lobby) {
    Object.assign(G, { id: Math.random().toString(36).slice(2, 9), comeca: outro(G.comeca), cartas: [], marcas: {}, hist: [], dica: null, vencedor: null, motivo: null, log: [], ev: [], evN: 0 })
    if (lobby) { G.fase = 'convite'; G.conv = Object.fromEntries(ctx.presentes().map(k => [k, 'sim'])); return difunde() }
    G.fase = 'convite'
    if (prontos()) return comecar()
    difunde()
  }
  function remove(key) {
    const t = G.times[key]
    delete G.conv[key]; delete G.times[key]
    for (const l of Object.keys(G.marcas)) { G.marcas[l] = G.marcas[l].filter(k => k !== key); if (!G.marcas[l].length) delete G.marcas[l] }
    ausDesde.delete(key)
    if (G.fase !== 'jogo') { if (t && G.chefe[t] === key) G.chefe[t] = null; return difunde() }
    if (!t) return difunde()
    ev({ t: 'saiu', key, nome: nomeK(key) }); log(`${nomeK(key)} saiu da mesa.`); sysMsg(`${nomeK(key)} saiu do ${NOME}`)
    const resto = membros(t)
    if (!resto.length) return fim(outro(t), 'abandono')
    if (G.chefe[t] === key) {
      G.chefe[t] = resto[rnd(resto.length)]
      ev({ t: 'novoChefe', key: G.chefe[t], lado: t }); log(`${nomeK(G.chefe[t])} virou chefe do ${TIMES[t]}.`)
    }
    difunde()
  }
  function hostRecebe(d, key) {
    if (!G || !key || d.id !== G.id) return
    if (!(key in G.conv) && G.fase !== 'fim') G.conv[key] = 'sim'
    switch (d.op) {
      case 'time': escolheTime(key, d.lado ?? null); break
      case 'chefe': viraChefe(key); break
      case 'sorteia': if (key === G.host) sorteia(); break
      case 'dica': daDica(key, d); break
      case 'marca': marca(key, d); break
      case 'revela': revela(key, d); break
      case 'passa': passa(key); break
      case 'sai': if (key !== G.host) remove(key); break
    }
  }
  function vista(k) {
    const chefe = G.chefe.r === k || G.chefe.b === k, fim_ = G.fase === 'fim'
    return {
      id: G.id, seq: G.seq, host: G.host, hostNome: G.hostNome, fase: G.fase, conv: G.conv,
      times: G.times, chefe: G.chefe, vez: G.vez, comeca: G.comeca, etapa: G.etapa, dica: G.dica, restam: G.restam, chutes: G.chutes,
      cartas: G.cartas.map(c => ({ p: c.p, rev: c.rev, por: c.por, cor: c.rev || chefe || fim_ ? c.cor : null })),
      mapa: k === ADMIN && !chefe && !fim_ && G.cartas.length ? G.cartas.map(c => c.cor) : null, // só vai para o admin; só aparece com ele logado
      faltam: G.cartas.length ? { r: faltam('r'), b: faltam('b') } : null, marcas: G.marcas, hist: G.hist.slice(-12),
      placar: G.placar, vencedor: G.vencedor, motivo: G.motivo, log: G.log.slice(-40), ev: G.ev,
    }
  }
  function difunde() {
    if (!G) return
    G.seq++; G.t = Date.now()
    ls.set(`${XX}.G`, G)
    const ks = new Set([...ctx.presentes(), ...Object.keys(G.conv)])
    for (const k of ks) if (k !== me.key) ctx.sendTo(k, { [XX]: { v: vista(k) } })
    const pres = new Set(ctx.presentes())
    G.sucessor = Object.keys(G.times).find(k => k !== me.key && pres.has(k)) || [...pres].find(k => k !== me.key) || null
    if (G.sucessor) ctx.sendTo(G.sucessor, { [XX]: { bk: G } })
    aplica(vista(me.key))
  }
  function encerrar() {
    if (!G) return
    ctx.send({ [XX]: { fim: G.id } })
    ls.set(`${XX}.G`, null)
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
    sysMsg(`${nomeAntigo} caiu: ${me.name} assumiu a mesa de ${NOME}`)
    remove(antigo)
    if (G) difunde()
  }
  setInterval(() => {
    if (!G && !restaurou && me.key) {
      restaurou = true
      const s = ls.get(`${XX}.G`)
      if (s && s.host === me.key && s.fase === 'jogo' && Date.now() - s.t < 3 * 3600e3) setTimeout(() => { if (G || (V && V.host !== me.key)) return ls.set(`${XX}.G`, null); G = s; difunde() }, 3000)
    }
    assumeSePreciso()
    if (!G || G.host !== me.key) return
    const pres = new Set(ctx.presentes()), agora = Date.now()
    for (const k of Object.keys(G.conv)) { if (k === me.key) continue; if (pres.has(k)) ausDesde.delete(k); else if (!ausDesde.has(k)) ausDesde.set(k, agora) }
    for (const [k, t] of ausDesde) if (agora - t > SAIU_MS) return remove(k)
  }, 1500)

  /* ================================================================ cliente */
  let V = null, ultEv = 0, dispensado = '', antesV = null, distribuir = false
  let numDica = 1, txtDica = '', espiaAdmin = false
  const souAdmin = () => me.key === ADMIN && me.admin && V?.mapa
  const vistos = new Set()
  const novo = id => { if (vistos.has(id)) return false; vistos.add(id); return true }
  const souHost = () => V && V.host === me.key
  const meuTime = () => V?.times[me.key] || null
  const souChefe = () => !!V && (V.chefe.r === me.key || V.chefe.b === me.key)
  const N = k => k === me.key ? 'Você' : ctx.nomeDe(k)
  const possoChutar = () => V?.fase === 'jogo' && V.etapa === 'palpite' && meuTime() === V.vez && !souChefe()
  function manda(d) {
    if (!V) return
    const m = { id: V.id, ...d }
    if (souHost()) hostRecebe(m, me.key)
    else ctx.sendTo(V.host, { [XX]: { op: m } })
  }
  function got(d, deKey) {
    if (!d) return
    if (d.op) { if (G && G.host === me.key) hostRecebe(d.op, deKey); return }
    if (d.fim) { if (V?.id === d.fim) aplica(null); return }
    if (d.bk) { if (d.bk.host === deKey) backup = d.bk; return }
    if (d.v) {
      if (G && d.v.id === G.id && d.v.host !== me.key) { G = null; ls.set(`${XX}.G`, null) }
      if (d.v.id === dispensado) return
      if (V && d.v.id === V.id && d.v.seq <= V.seq) return
      aplica(d.v)
    }
  }
  function aplica(v) {
    const antes = V
    if (v && (!antes || antes.id !== v.id)) {
      ultEv = Math.max(0, ...v.ev.map(e => e.n))
      const ini = v.ev.find(e => e.t === 'inicio'); if (ini && v.ev.length < 4) ultEv = ini.n - 1
    }
    if (v?.etapa === 'dica' && antes?.etapa !== 'dica') { txtDica = ''; numDica = 1 }
    V = v; antesV = antes
    const evs = v ? v.ev.filter(e => e.n > ultEv) : []
    if (v) ultEv = Math.max(ultEv, ...v.ev.map(e => e.n))
    if (evs.some(e => e.t === 'inicio')) distribuir = true
    if (v && v.fase === 'jogo' && antes?.fase === 'jogo' && (antes.vez !== v.vez || antes.etapa !== v.etapa) && ((v.etapa === 'dica' && v.chefe[v.vez] === me.key) || (v.etapa === 'palpite' && possoChutar()))) setTimeout(() => som('vez'), 300)
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
  const botao = (conteudo, fn, cls = '', title = '') => { const b = el('button', { type: 'button', className: `ag-btn ${cls}`, title }); b.append(...[conteudo].flat()); b.addEventListener('click', e => { e.stopPropagation(); b.blur(); som('clique'); fn(e) }); return b }
  const svg = (k, cls = '') => { const s = el('span', { className: `ag-svg ${cls}` }); s.innerHTML = SVG[k]; return s }
  const retrato = (k, cls = '') => el('span', { className: `ag-retrato ${cls}`, 'data-key': k, title: N(k) }, ctx.pfp(k, 64, N(k)))
  const tampa = (t, cls = '') => svg('tampa', `ag-tampa ag-tampa--${t} ${cls}`)
  const numTxt = n => n === INF ? '∞' : String(n)

  /* ---------- render ---------- */
  function render() {
    tela.classList.toggle('ag--on', !!V)
    ctx.onAtivo?.(!!V)
    if (!V) { tela.replaceChildren(); vistos.clear(); return }
    tela.dataset.vez = V.fase === 'jogo' ? V.vez : ''
    tela.dataset.fase = V.fase
    const topo = el('header', { className: 'ag-topo' },
      (() => { const l = el('span', { className: 'ag-logo' }, tampa('r'), el('b', {}, 'Agentes', el('small', { textContent: 'de Boteco' })), tampa('b')); l.addEventListener('click', () => { if (!souAdmin()) return; espiaAdmin = !espiaAdmin; ctx.logInterno?.(`mapa do admin ${espiaAdmin ? 'aberto' : 'fechado'}`); render() }); return l })(),
      el('span', { className: 'ag-grow' }),
      V.fase !== 'convite' ? el('span', { className: 'ag-placar', title: 'Vitórias na noite' }, tampa('r'), el('b', { textContent: V.placar.r || 0 }), el('i', { textContent: '×' }), el('b', { textContent: V.placar.b || 0 }), tampa('b')) : '',
      botao(icon('list-music'), () => tela.querySelector('.ag-log')?.classList.toggle('aberto'), 'ag-btn--ic', 'O que aconteceu'),
      souHost() ? botao(icon('x'), e => confirma(e.currentTarget, 'Fechar a mesa?', encerrar), 'ag-btn--ic', 'Fechar a mesa para todos')
        : botao(icon('x'), () => { if (V.fase === 'convite' && meuTime()) manda({ op: 'time', lado: null }); dispensado = V.id; aplica(null) }, 'ag-btn--ic', 'Sair da mesa (só para você)'))
    const kids = [el('div', { className: 'ag-fundo' }), topo]
    if (V.fase === 'convite') kids.push(lobby())
    else kids.push(lado('r'), mesa(), lado('b'), barra(), V.fase === 'fim' ? fimUI() : '')
    kids.push(el('div', { className: 'ag-log' }, el('ol', {}, ...V.log.slice(-40).map(t => el('li', { textContent: t })))))
    if (V.fase !== 'convite' && V.fase !== 'fim' && !ctx.presentes().includes(V.host)) kids.push(el('div', { className: 'ag-pausa' }, el('b', { textContent: 'Partida pausada' }), el('span', { textContent: `${V.hostNome} abriu a mesa e caiu. Continua quando voltar.` })))
    const foco = document.activeElement?.classList?.contains('ag-dica__txt') ? { s: document.activeElement.selectionStart } : null
    tela.replaceChildren(...kids)
    ctx.hydrate(tela)
    tela.querySelector('.ag-log ol')?.scrollTo(0, 1e6)
    if (foco) { const i = tela.querySelector('.ag-dica__txt'); if (i) { i.focus({ preventScroll: true }); try { i.setSelectionRange(foco.s, foco.s) } catch {} } }
  }
  function confirma(btn, txt, fn) {
    if (btn.dataset.conf) return fn()
    btn.dataset.conf = '1'; btn.classList.add('confirma')
    const tip = el('span', { className: 'ag-tip', textContent: `${txt} Clique de novo.` }); btn.append(tip)
    setTimeout(() => { delete btn.dataset.conf; btn.classList.remove('confirma'); tip.remove() }, 2600)
  }

  /* ---------- lobby ---------- */
  function lobby() {
    const pres = new Set(ctx.presentes())
    const todos = [...new Set([me.key, ...Object.keys(V.conv)])].filter(k => pres.has(k))
    const semTime = todos.filter(k => !V.times[k])
    const coluna = t => {
      const m = todos.filter(k => V.times[k] === t), chefe = V.chefe[t]
      const entrar = meuTime() !== t ? botao([tampa(t), meuTime() ? `Mudar para o ${TIMES[t]}` : `Entrar no ${TIMES[t]}`], () => manda({ op: 'time', lado: t }), `ag-btn--time ag-btn--${t}`) : ''
      const souDaqui = meuTime() === t
      return el('section', { className: `ag-time ag-time--${t}` },
        el('header', {}, tampa(t, 'ag-tampa--grande'), el('b', { textContent: TIMES[t] }), el('small', { textContent: `${m.length} na equipe` })),
        el('div', { className: 'ag-time__chefe' + (chefe ? '' : ' vago') },
          svg('chefe', 'ag-coroa'),
          chefe ? [retrato(chefe), el('span', {}, el('b', { textContent: N(chefe) }), el('small', { textContent: 'chefe · vê o mapa e dá as dicas' }))]
            : el('span', {}, el('b', { textContent: 'Sem chefe' }), el('small', { textContent: 'alguém do time precisa ser' })),
          souDaqui ? botao(chefe === me.key ? 'Deixar de ser chefe' : chefe ? 'Ser chefe no lugar' : 'Ser chefe', () => manda({ op: 'chefe' }), 'ag-btn--leve ag-btn--peq') : ''),
        el('div', { className: 'ag-time__agentes' }, ...m.filter(k => k !== chefe).map(k => el('span', { className: 'ag-pessoa' }, retrato(k), el('small', { textContent: N(k) }))),
          m.filter(k => k !== chefe).length ? '' : el('small', { className: 'ag-vazio', textContent: 'nenhum agente ainda' })),
        entrar)
    }
    const ok = ['r', 'b'].every(t => V.chefe[t] && todos.filter(k => V.times[k] === t).length >= 2)
    const falta = ['r', 'b'].map(t => !V.chefe[t] ? `chefe no ${TIMES[t]}` : todos.filter(k => V.times[k] === t).length < 2 ? `mais um no ${TIMES[t]}` : '').filter(Boolean)
    const pe = el('footer', { className: 'ag-lobby__pe' },
      semTime.length ? el('div', { className: 'ag-sem' }, el('small', { textContent: 'Sem time' }), ...semTime.map(k => el('span', { className: 'ag-pessoa ag-pessoa--mini' }, retrato(k), el('small', { textContent: N(k) })))) : '',
      el('span', { className: 'ag-grow' }),
      meuTime() ? botao([icon('eye'), 'Só assistir'], () => manda({ op: 'time', lado: null }), 'ag-btn--leve') : '',
      souHost() ? botao([icon('refresh-cw'), 'Sortear times'], () => manda({ op: 'sorteia' }), 'ag-btn--leve', 'Times e chefes aleatórios') : '',
      souHost() ? (() => { const b = botao([icon('play'), ok ? 'Começar' : `Falta ${falta.join(' e ')}`], comecar, 'ag-btn--forte ag-btn--grande'); b.disabled = !ok; return b })()
        : el('small', { className: 'ag-espera', textContent: `${V.hostNome} começa quando os times estiverem prontos` }))
    return el('div', { className: 'ag-lobby' + (novo('lobby:' + V.id) ? ' entra' : '') }, tutorial(), el('div', { className: 'ag-times' }, coluna('r'), coluna('b')), pe)
  }
  // tutorial em três quadros animados
  function tutorial() {
    const mini = (p, cls = '') => el('span', { className: `ag-mini ${cls}` }, el('b', { textContent: p }))
    return el('div', { className: 'ag-tuto' },
      el('div', { className: 'ag-tuto__q' }, el('span', { className: 'ag-tuto__cena' }, el('span', { className: 'ag-tuto__lousa' }, el('b', { textContent: 'PRAIA' }), el('i', { textContent: '2' }))),
        el('small', {}, el('b', { textContent: 'O chefe' }), ' vê quem são os agentes e dá uma dica: uma palavra e quantas cartas ela liga')),
      el('div', { className: 'ag-tuto__q' }, el('span', { className: 'ag-tuto__cena ag-tuto__cena--grade' }, mini('AREIA', 'a1'), mini('PIANO'), mini('ONDA', 'a2'), mini('CUPIM')),
        el('small', {}, el('b', { textContent: 'O time' }), ' conversa e abre as cartas. Acertou, continua; errou, a vez passa')),
      el('div', { className: 'ag-tuto__q' }, el('span', { className: 'ag-tuto__cena' }, el('span', { className: 'ag-mini ag-mini--x' }, svg('dedo'))),
        el('small', {}, 'Ache todos os seus agentes primeiro. Abriu ', el('b', { textContent: 'o dedo-duro' }), ', perdeu na hora')))
  }

  /* ---------- mesa ---------- */
  function lado(t) {
    const m = Object.keys(V.times).filter(k => V.times[k] === t), chefe = V.chefe[t]
    const vez = V.fase === 'jogo' && V.vez === t
    const falt = V.faltam?.[t] ?? 0, tot = V.comeca === t ? 9 : 8
    return el('aside', { className: `ag-lado ag-lado--${t}` + (vez ? ' vez' : '') + (V.vencedor === t ? ' venceu' : '') },
      el('header', {}, el('b', { textContent: TIMES[t] }), vez ? el('em', { textContent: V.etapa === 'dica' ? 'pensando na dica' : 'chutando' }) : ''),
      el('div', { className: 'ag-lado__conta', title: `${falt} agente${falt === 1 ? '' : 's'} para achar` },
        el('b', { textContent: falt }), el('span', { className: 'ag-lado__tampas' }, ...Array.from({ length: tot }, (_, i) => tampa(t, i < tot - falt ? 'achada' : '')))),
      el('div', { className: 'ag-lado__chefe', 'data-key': chefe || '' }, chefe ? [retrato(chefe), el('span', {}, svg('chefe', 'ag-coroa'), el('b', { textContent: N(chefe) }))] : ''),
      el('div', { className: 'ag-lado__agentes' }, ...m.filter(k => k !== chefe).map(k => el('span', { className: 'ag-pessoa', 'data-key': k }, retrato(k), el('small', { textContent: N(k) })))),
      el('ol', { className: 'ag-lado__hist' }, ...V.hist.filter(h => h.lado === t).slice(-4).map(h => el('li', {},
        el('b', { textContent: h.txt || '(falada)' }), el('i', { textContent: numTxt(h.n) }),
        el('span', {}, ...h.acertos.map(a => el('i', { className: `ag-ponto ag-ponto--${a.cor}`, title: a.p })))))))
  }
  function mesa() {
    const espia = espiaAdmin && souAdmin()
    const chefe = souChefe() || espia, pode = possoChutar(), fim_ = V.fase === 'fim'
    const grade = el('div', { className: 'ag-grade' + (chefe && !fim_ ? ' chefe' : '') + (pode ? ' pode' : '') }, ...V.cartas.map((c0, i) => {
      const c = espia && !c0.rev ? { ...c0, cor: V.mapa[i] } : c0
      const virou = antesV?.id === V.id && c.rev && !antesV.cartas[i]?.rev
      const marcas = V.marcas[i] || [], minha = marcas.includes(me.key)
      const n = el('button', { type: 'button', className: `ag-carta` + (c.rev ? ` aberta ag-c-${c.cor}` + (virou ? ' vira' : '') : c.cor ? ` ag-c-${c.cor} espia` : '') + (minha ? ' minha' : '') + (marcas.length ? ' marcada' : ''),
        style: `--i:${i}`, 'data-idx': String(i), disabled: !pode || c.rev, title: c.rev ? `${c.p}: ${quemE(c.cor)}` : pode ? (minha ? 'Clique de novo para abrir' : 'Clique para marcar; de novo para abrir') : c.p },
        el('span', { className: 'ag-carta__giro' },
          el('span', { className: 'ag-carta__frente' }, el('b', { className: 'ag-carta__p' + (c.p.length > 9 ? ' longa' : ''), textContent: c.p }), el('i', { className: 'ag-carta__p ag-carta__p--inv', textContent: c.p })),
          el('span', { className: 'ag-carta__verso' }, c.rev ? verso(c) : '')),
        marcas.length ? el('span', { className: 'ag-carta__marcas' }, ...marcas.map(k => retrato(k, 'ag-retrato--pino'))) : '',
        minha && !c.rev ? el('span', { className: 'ag-carta__abre', textContent: 'abrir' }) : '')
      if (pode && !c.rev) n.addEventListener('click', () => { if (minha) { som('poe', 0, .8); manda({ op: 'revela', idx: i }) } else { som('clique', 0, .7); manda({ op: 'marca', idx: i }) } })
      return n
    }))
    const dist = distribuir; distribuir = false
    return el('div', { className: 'ag-palco' + (dist ? ' distribui' : '') }, el('div', { className: 'ag-tampo' }), grade)
  }
  const quemE = c => c === 'x' ? 'o dedo-duro' : c === 'n' ? 'cliente' : `agente ${TIMES[c].toLowerCase()}`
  function verso(c) {
    if (c.cor === 'r' || c.cor === 'b') return el('span', { className: 'ag-verso' }, tampa(c.cor, 'ag-tampa--verso'), el('small', { textContent: c.p }))
    if (c.cor === 'n') return el('span', { className: 'ag-verso' }, svg('caneca', 'ag-verso__ic'), el('small', { textContent: c.p }))
    return el('span', { className: 'ag-verso' }, svg('dedo', 'ag-verso__ic'), el('small', { textContent: 'DEDO-DURO' }))
  }
  // barra de baixo: dar dica (chefe da vez), a dica valendo, ou quem está pensando
  function barra() {
    if (V.fase !== 'jogo') return ''
    const t = V.vez, chefe = V.chefe[t]
    if (V.etapa === 'dica') {
      if (chefe !== me.key) return el('div', { className: `ag-barra ag-barra--${t}` }, retrato(chefe || ''), el('span', {}, el('b', { textContent: chefe ? N(chefe) : 'Chefe' }), ` (chefe ${TIMES[t].toLowerCase()}) está pensando na dica…`), el('i', { className: 'ag-pensa' }, el('i'), el('i'), el('i')))
      const input = el('input', { className: 'ag-dica__txt', type: 'text', maxLength: 24, placeholder: 'palavra (ou fale na call)', value: txtDica, autocomplete: 'off', spellcheck: false })
      const na = () => V.cartas.some(c => !c.rev && sem(c.p) === sem(input.value))
      input.addEventListener('input', () => { txtDica = input.value; input.classList.toggle('errada', na()) })
      input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') envia() })
      const envia = () => { if (na()) { toast('Não vale usar uma palavra que está na mesa.'); return } manda({ op: 'dica', txt: input.value, num: numDica }); som('papel') }
      const nums = el('div', { className: 'ag-dica__nums', role: 'radiogroup', 'aria-label': 'Quantas cartas' }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 'inf'].map(n => {
        const b = el('button', { type: 'button', className: 'ag-dica__n' + (numDica === n ? ' on' : ''), textContent: n === 'inf' ? '∞' : n, title: n === 0 ? 'Zero: nenhuma carta liga (palpites à vontade)' : n === 'inf' ? 'Palpites à vontade' : `${n} carta${n === 1 ? '' : 's'}` })
        b.addEventListener('click', () => { numDica = n; som('clique', 0, .5); render() }); return b
      }))
      return el('div', { className: `ag-barra ag-barra--${t} ag-barra--dica` }, svg('chefe', 'ag-coroa'), el('b', { className: 'ag-dica__k', textContent: 'Sua dica' }), input, nums, botao([icon('send'), 'Dar dica'], envia, 'ag-btn--forte'))
    }
    const d = V.dica
    const rest = V.restam === INF ? 'à vontade' : `${V.restam} palpite${V.restam === 1 ? '' : 's'}`
    return el('div', { className: `ag-barra ag-barra--${t} ag-barra--valendo` + (novo(`dica:${V.id}:${V.hist.length}`) ? ' entra' : '') },
      el('span', { className: 'ag-lousa' }, el('b', { textContent: d?.txt || 'dica falada' }), el('i', { textContent: numTxt(d?.n ?? 0) })),
      el('span', { className: 'ag-barra__info' }, el('small', { textContent: `chefe ${TIMES[t].toLowerCase()}: ${N(d?.por)}` }), el('b', { textContent: rest })),
      possoChutar() ? botao('Passar a vez', () => manda({ op: 'passa' }), 'ag-btn--leve' + (V.chutes ? '' : ' off'), V.chutes ? 'Encerra a vez do time' : 'Abra pelo menos uma carta antes') : '',
      possoChutar() ? el('small', { className: 'ag-barra__dica', textContent: 'clique numa carta para marcar; de novo para abrir' }) : '')
  }
  function fimUI() {
    const t = V.vencedor
    const frase = V.motivo === 'dedo' ? `o ${TIMES[outro(t)]} abriu o dedo-duro` : V.motivo === 'abandono' ? 'o outro time saiu da mesa' : 'achou todos os agentes'
    const meu = meuTime() === t
    return el('div', { className: `ag-fim ag-fim--${t}` + (novo('fim:' + V.id) ? ' entra' : '') },
      tampa(t, 'ag-tampa--fim'),
      el('b', { textContent: `${TIMES[t]} venceu!` }), el('small', { textContent: frase }),
      meuTime() ? el('em', { textContent: meu ? 'Saideira por conta do outro time 🍺' : 'Fica para a próxima rodada' }) : '',
      souHost() ? el('div', { className: 'ag-linha' }, botao([icon('refresh-cw'), 'Nova partida'], () => revanche(false), 'ag-btn--forte'), botao('Trocar times', () => revanche(true), 'ag-btn--leve'), botao('Fechar', encerrar, 'ag-btn--leve'))
        : el('small', { className: 'ag-espera', textContent: `${V.hostNome} decide a próxima` }))
  }

  /* ---------- animações ---------- */
  const calmo = () => matchMedia('(prefers-reduced-motion: reduce)').matches
  function respingo(n, cor) {
    if (!n || calmo()) return
    const r = n.getBoundingClientRect(), T = tela.getBoundingClientRect(), x = r.left - T.left + r.width / 2, y = r.top - T.top + r.height / 2
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 + Math.random() * .3, d = tela.clientHeight * (.06 + Math.random() * .07)
      const p = el('i', { className: `ag-faisca ag-faisca--${cor}` }); tela.append(p)
      p.animate([{ transform: `translate(${x}px,${y}px) translate(-50%,-50%) scale(1)`, opacity: 1 }, { transform: `translate(${x + Math.cos(a) * d}px,${y + Math.sin(a) * d}px) translate(-50%,-50%) rotate(${rnd(360)}deg) scale(.3)`, opacity: 0 }],
        { duration: 500 + rnd(250), easing: 'cubic-bezier(.12,.75,.3,1)' }).onfinish = () => p.remove()
    }
  }
  function chuvaTampas(t) {
    if (calmo()) return
    const W = tela.clientWidth, H = tela.clientHeight
    for (let i = 0; i < 34; i++) {
      const p = tampa(t, 'ag-chuva'); tela.append(p)
      const x = rnd(W), dx = (rnd(200) - 100) * H / 900
      p.animate([{ transform: `translate(${x}px,${-H * .1}px) rotate(0)`, opacity: 1 }, { transform: `translate(${x + dx}px,${H * 1.05}px) rotate(${rnd(900) - 450}deg)`, opacity: .9 }],
        { duration: 1400 + rnd(1300), delay: rnd(900), easing: 'cubic-bezier(.4,.1,.7,1)', fill: 'backwards' }).onfinish = () => p.remove()
    }
  }
  function treme(f = 1) {
    if (calmo()) return
    const p = tela.querySelector('.ag-palco'); if (!p) return
    const a = .9 * f
    p.animate([{ translate: '0 0' }, { translate: `${-a}cqh ${a * .5}cqh` }, { translate: `${a}cqh ${-a * .4}cqh` }, { translate: `${-a * .6}cqh ${a * .3}cqh` }, { translate: '0 0' }], { duration: 300 })
  }
  function anima(evs) {
    for (const e of evs) {
      if (e.t === 'inicio') { som('embaralhar'); for (let i = 0; i < 25; i += 3) som('desliza', 300 + i * 28, .5) }
      else if (e.t === 'sorteio') som('leque', 0, .8)
      else if (e.t === 'dica') { som('papel'); som('carimbo', 250, .7) }
      else if (e.t === 'revela') {
        const n = tela.querySelector(`.ag-carta[data-idx="${e.idx}"]`)
        if (e.cor === 'x') { som('golpe', 120); setTimeout(() => { treme(2); tela.classList.add('ag-dedoduro'); setTimeout(() => tela.classList.remove('ag-dedoduro'), 1400) }, 260) }
        else if (e.cor === e.lado) { som('carimbo', 120, .8); som('moedas', 260, .5); setTimeout(() => respingo(n, e.cor), 300) }
        else if (e.cor === 'n') { som('poe', 120, .9); setTimeout(() => treme(.4), 280) }
        else { som('golpe', 120, .55); setTimeout(() => { respingo(n, e.cor); treme(.6) }, 300) }
      }
      else if (e.t === 'vez') setTimeout(() => som('leque', 0, .5), 500)
      else if (e.t === 'passou') toast(`${N(e.key)} passou a vez`, 1800)
      else if (e.t === 'novoChefe') toast(`${N(e.key)} agora é chefe do ${TIMES[e.lado]}`, 3000)
      else if (e.t === 'entrou') toast(`${N(e.key)} entrou no ${TIMES[e.lado]}`, 2200)
      else if (e.t === 'fim') { som('moedas', 400); som('leque', 700); setTimeout(() => chuvaTampas(e.lado), 500) }
      else if (e.t === 'saiu') toast(`${e.nome} saiu da mesa`, 3200)
    }
  }
  ;(function loop() {
    if (V) {
      const pres = new Set(ctx.presentes())
      for (const s of tela.querySelectorAll('.ag-pessoa[data-key], .ag-lado__chefe[data-key]')) { s.classList.toggle('caiu', !!s.dataset.key && !pres.has(s.dataset.key)); s.classList.toggle('fala', !!ctx.falando?.(s.dataset.key)) }
    }
    setTimeout(loop, 400)
  })()

  function iniciar() {
    carregaSons()
    if (V && !souHost()) return toast(`Já tem uma mesa aberta (de ${V.hostNome})`)
    if (G) return toast('A mesa já está aberta')
    abrir()
  }
  window.__ag = () => ({ G, V, difunde })
  return {
    got: (d, k) => { carregaSons(); got(d, k) }, iniciar, ativo: () => !!V,
    lider: () => !!V && souHost(),
    encerra: () => { if (G && G.host === me.key) encerrar() },
    sair: () => { if (!V) return; if (G && G.host === me.key) return encerrar(); manda({ op: 'sai' }); dispensado = V.id; aplica(null) },
    jogadores: () => !V ? [] : Object.keys(V.times),
    entrouAlguem: key => { if (!G || G.host !== me.key) return; if (!(key in G.conv)) { G.conv[key] = 'sim'; return difunde() } ctx.sendTo(key, { [XX]: { v: vista(key) } }) },
  }
}
