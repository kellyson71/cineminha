// Codnames: dois times, 25 palavras em comandas de bar, mapa secreto dos chefes e dicas de uma palavra.
// Mecânica de associação em dois times; interface, desenhos e palavras do Cineminha.
// Efeitos originais do Codenames Online em jogos/codnames/sons/ (ver créditos).
// As marcações do chefe (que cartas a dica liga) ficam privadas para o chefe do time.

import { PACOTES, sorteiaPalavras } from './jogos/codnames/pacotes.js'
import { criaSonsCodnames } from './jogos/codnames/audio.js'

const XX = 'ag'
const NOME = 'Codnames'
const SAIU_MS = 12000, HOST_MS = 10000
const TIMES = { r: 'Vermelho', b: 'Azul' }
const outro = t => t === 'r' ? 'b' : 'r'
const INF = 99 // dica "∞": palpites à vontade
const ABRIR_MS = 2100 // a carta sobe, cresce, faz suspense, vira e bate na mesa
const BATE = .84 // ponto da animação em que a carta bate de volta ("prá")
const DUPLO_MS = 500
const ADMIN = 'kellyson' // admin logado: um clique no logo mostra o mapa (as cores das cartas), mesmo sendo agente

const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n }
const embaralha = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]] } return a }
const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch {} } }
const sem = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
const palavraOk = s => /^[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*$/u.test(String(s || '').trim())

// desenhos próprios (viewBox 64): agente de chapéu e óculos, caneca do cliente, o X9 e os símbolos das caixas
const ARTE = {
  agente: '<path d="M7 31c9 4.5 41 4.5 50 0-4-2.4-10-3.4-12.5-3.4L41.4 13c-1-4.4-5.2-5.6-9.4-3.4C27.8 7.4 23.6 8.6 22.6 13l-3.1 14.6C17 27.6 11 28.6 7 31z"/><path class="ag-arte__fita" d="M18.4 24.6c9 2.2 18.2 2.2 27.2 0l-.9 4.2c-8.6 2-16.8 2-25.4 0z"/><path d="M20.5 35c0 12.4 5 20.5 11.5 20.5S43.5 47.4 43.5 35z"/><g class="ag-arte__oculos"><rect x="19" y="36" width="11.5" height="6.4" rx="2.4"/><rect x="33.5" y="36" width="11.5" height="6.4" rx="2.4"/><path d="M30 38.4h4" stroke-width="2"/></g><path d="M10 64l9.5-12.5L32 60l12.5-8.5L54 64z"/>',
  cliente: '<path d="M15 21h28v31a5 5 0 0 1-5 5H20a5 5 0 0 1-5-5z"/><path d="M43 27h5a6.5 6.5 0 0 1 6.5 6.5v5A6.5 6.5 0 0 1 48 45h-5" fill="none" stroke-width="4.5"/><path class="ag-arte__espuma" d="M12.5 22.5c-1-6.4 5.4-9 9.6-6.4 2.4-5 10.6-5 13 0 4.6-2.4 10.6.6 9.4 6.4z"/><path class="ag-arte__fita" d="M22 28v22M29 28v22M36 28v22" stroke-width="2.6" fill="none"/>',
  copo: '<path d="M18 12h28l-4 44H22z"/><path class="ag-arte__espuma" d="M16 13c0-5 5-7 9-5 3-4 11-4 14 0 4-2 9 0 9 5z"/><path class="ag-arte__fita" d="M21 30h22" stroke-width="3" fill="none"/>',
  globo: '<circle cx="32" cy="32" r="22"/><path class="ag-arte__fita" d="M10 32h44M32 10c-9 8-9 36 0 44M32 10c9 8 9 36 0 44M14 21h36M14 43h36" fill="none" stroke-width="2.6"/>',
  estrela: '<path d="M32 7l7.3 15.6 17 2-12.6 11.7 3.4 16.8L32 44.6 16.9 53.1l3.4-16.8L7.7 24.6l17-2z"/>',
  fala: '<path d="M9 12h46v30H30l-12 10V42H9z"/><path class="ag-arte__fita" d="M18 22h28M18 31h18" stroke-width="3.4" fill="none"/>',
  tela: '<rect x="7" y="11" width="50" height="34" rx="4"/><path d="M24 55h16M32 45v10" stroke-width="4" fill="none"/><path class="ag-arte__fita" d="M25 22l-7 6 7 6M39 22l7 6-7 6" stroke-width="3.2" fill="none"/>',
  predio: '<path d="M6 25L32 9l26 16z"/><path d="M8 54h48v5H8z"/><path class="ag-arte__fita" d="M13 29v21M23 29v21M33 29v21M43 29v21M52 29v21" stroke-width="4" fill="none"/>',
}
const arte = (tipo, cls = '') => `<svg class="ag-arte ${cls}" viewBox="0 0 64 64" aria-hidden="true">${ARTE[tipo] || ARTE.agente}</svg>`
const ICS = {
  x: '<path d="M6 6l12 12M18 6 6 18"/>', ajuda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.3-2.5 3.8M12 17h.01"/>',
  lista: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>', olho: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  dados: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01"/>', menos: '<path d="M6 12h12"/>', mais: '<path d="M6 12h12M12 6v12"/>',
  seta: '<path d="M5 12h14M13 6l6 6-6 6"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', relogio: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  tela: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>', copo: '<path d="M6 4h12l-1.6 16H7.6z"/><path d="M6.6 9h10.8"/>',
}
const ic = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICS[n] || ''}</svg>`

export function criaAgentes(ctx) {
  const { toast, sysMsg, me } = ctx
  const tela = ctx.tela
  const el = (tag, props = {}, ...kids) => {
    const dados = {}, resto = {}
    for (const [k, v] of Object.entries(props)) (k.startsWith('data-') || k.startsWith('aria-') ? dados : resto)[k] = v
    const n = ctx.el(tag, resto, ...kids.flat())
    for (const [k, v] of Object.entries(dados)) n.setAttribute(k, v)
    return n
  }
  const html = (tag, cls, h, props = {}) => { const n = el(tag, { className: cls, ...props }); n.innerHTML = h; return n }

  /* ================================================================ host */
  let G = null, restaurou = false
  const ausDesde = new Map()
  const log = t => { G.log.push(t); if (G.log.length > 80) G.log.splice(0, G.log.length - 80) }
  const ev = e => { G.ev.push({ ...e, n: ++G.evN }); if (G.ev.length > 40) G.ev.splice(0, G.ev.length - 40) }
  const nomeK = k => ctx.nomeDe(k)
  const timeDe = k => G.times[k] || null
  const membros = t => Object.keys(G.times).filter(k => G.times[k] === t)
  const faltam = t => G.cartas.filter(c => c.cor === t && !c.rev).length
  function normalizaEstado() {
    G.op = { pacotes: ['classico'], tempo: false, ...G.op }
    G.alvos ||= { r: [], b: [] }; G.bloqueio ||= 0; G.prazo ||= 0
    G.hist.forEach((h, i) => { h.id ??= i; h.alvos ||= []; h.acertos.forEach(a => { a.idx ??= G.cartas.findIndex(c => c.p === a.p) }) })
  }

  function abrir() {
    const salvo = ls.get(`${XX}.op`) || {}
    const pac = salvo.pacotes?.filter(k => PACOTES.some(p => p.id === k))
    const op = { pacotes: pac?.length ? pac : ['classico'], tempo: !!salvo.tempo }
    G = { id: Math.random().toString(36).slice(2, 9), host: me.key, hostNome: me.name, fase: 'convite', op,
      conv: Object.fromEntries(ctx.presentes().map(k => [k, 'sim'])), times: {}, chefe: { r: null, b: null },
      cartas: [], vez: 'r', comeca: rnd(2) ? 'r' : 'b', etapa: 'dica', dica: null, restam: 0, chutes: 0, marcas: {},
      alvos: { r: [], b: [] }, prazo: 0, bloqueio: 0, hist: [], placar: ls.get(`${XX}.placar`) || { r: 0, b: 0 }, vencedor: null, motivo: null,
      log: [], ev: [], evN: 0, seq: 0, t: Date.now() }
    // quem já jogou antes volta para o mesmo time
    const ant = ls.get(`${XX}.times`) || {}
    for (const k of Object.keys(G.conv)) if (ant[k] === 'r' || ant[k] === 'b') G.times[k] = ant[k]
    sysMsg(`${me.name} abriu uma mesa de ${NOME}`)
    difunde()
  }
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
  function sorteia() {
    if (G.fase !== 'convite') return
    const pres = new Set(ctx.presentes())
    const ks = embaralha(Object.keys(G.conv).filter(k => pres.has(k) && G.conv[k] !== 'nao'))
    G.times = {}; ks.forEach((k, i) => { G.times[k] = i % 2 ? 'b' : 'r' })
    for (const t of ['r', 'b']) { const m = membros(t); G.chefe[t] = m.length ? m[rnd(m.length)] : null }
    ev({ t: 'sorteio' })
    difunde()
  }
  const prontos = () => ['r', 'b'].every(t => G.chefe[t] && ctx.presentes().includes(G.chefe[t]) && membros(t).filter(k => ctx.presentes().includes(k)).length >= 2)
  function entra(key, { lado, papel }) {
    if (G.fase !== 'convite' || !['r', 'b'].includes(lado) || !['mestre', 'agente'].includes(papel)) return
    if (papel === 'mestre' && G.chefe[lado] && G.chefe[lado] !== key) return
    const era = G.times[key]
    if (era && G.chefe[era] === key) G.chefe[era] = null
    G.times[key] = lado
    if (papel === 'mestre') G.chefe[lado] = key
    difunde()
  }
  function configura(key, d) {
    if (key !== G.host || G.fase !== 'convite') return
    G.op ||= {}
    if (Array.isArray(d.pacotes)) {
      const ids = [...new Set(d.pacotes)].filter(k => PACOTES.some(p => p.id === k))
      if (!ids.length) return
      G.op.pacotes = ids
    }
    if (typeof d.tempo === 'boolean') G.op.tempo = d.tempo
    ls.set(`${XX}.op`, G.op); difunde()
  }
  function armaPrazo(extra = 0) { G.prazo = G.op?.tempo && G.fase === 'jogo' ? Date.now() + (G.etapa === 'dica' ? 180000 : 90000) + extra : 0 }
  function comecar() {
    if (G?.fase !== 'convite' || !prontos()) return
    ls.set(`${XX}.times`, G.times)
    const ws = sorteiaPalavras(G.op?.pacotes || ['classico'], embaralha)
    const c0 = G.comeca
    const cores = embaralha([...Array(9).fill(c0), ...Array(8).fill(outro(c0)), ...Array(7).fill('n'), 'x'])
    G.cartas = ws.map((p, i) => ({ p, cor: cores[i], rev: false, por: null }))
    G.vez = c0; G.etapa = 'dica'; G.dica = null; G.restam = 0; G.chutes = 0; G.marcas = {}; G.hist = []; G.alvos = { r: [], b: [] }; G.bloqueio = 0
    G.fase = 'jogo'; G.vencedor = null; G.motivo = null; G.log = []
    armaPrazo()
    log(`Partida começou. ${TIMES[c0]} começa (9 agentes; ${TIMES[outro(c0)]} tem 8).`)
    ev({ t: 'inicio', lado: c0 })
    sysMsg(`${NOME} começou: Vermelho (${membros('r').map(nomeK).join(', ')}) × Azul (${membros('b').map(nomeK).join(', ')})`)
    difunde()
  }
  function marcaDica(key, { idx }) {
    const c = G.cartas[idx]
    if (G.fase !== 'jogo' || G.etapa !== 'dica' || G.chefe[G.vez] !== key || !Number.isInteger(idx) || !c || c.rev || c.cor !== G.vez) return
    const a = G.alvos[G.vez] ||= []
    G.alvos[G.vez] = a.includes(idx) ? a.filter(i => i !== idx) : [...a, idx]
    difunde()
  }
  function daDica(key, { txt, num }) {
    if (G.fase !== 'jogo' || G.etapa !== 'dica' || G.chefe[G.vez] !== key) return
    const n = num === 'inf' ? INF : Number(num)
    if (n !== INF && !(Number.isInteger(n) && n >= 0 && n <= 9)) return
    const palavra = String(txt || '').trim().slice(0, 32)
    if (!palavraOk(palavra) || G.cartas.some(c => !c.rev && sem(c.p) === sem(palavra))) return
    const alvos = (G.alvos[G.vez] || []).filter(i => G.cartas[i] && !G.cartas[i].rev && G.cartas[i].cor === G.vez)
    G.dica = { txt: palavra, n, por: key, lado: G.vez }
    G.restam = n === 0 || n === INF ? INF : n + 1
    G.chutes = 0; G.etapa = 'palpite'; G.marcas = {}
    G.hist.push({ id: G.hist.length, lado: G.vez, txt: palavra, n, alvos: [...alvos], acertos: [] })
    ev({ t: 'dica', lado: G.vez, txt: palavra, num: n })
    log(`Chefe ${TIMES[G.vez].toLowerCase()} (${nomeK(key)}): "${palavra}" · ${n === INF ? '∞' : n}.`)
    armaPrazo(1800)
    difunde()
  }
  const podeChutar = key => G.fase === 'jogo' && G.etapa === 'palpite' && timeDe(key) === G.vez && G.chefe[G.vez] !== key && Date.now() >= (G.bloqueio || 0)
  function marca(key, { idx }) {
    const c = G.cartas[idx]
    if (!podeChutar(key) || !Number.isInteger(idx) || !c || c.rev) return
    const l = G.marcas[idx] || []
    G.marcas[idx] = l.includes(key) ? l.filter(k => k !== key) : [...l, key]
    if (!G.marcas[idx].length) delete G.marcas[idx]
    difunde()
  }
  function revela(key, { idx }) {
    const c = G.cartas[idx]
    if (!podeChutar(key) || !Number.isInteger(idx) || !c || c.rev) return
    G.bloqueio = Date.now() + ABRIR_MS
    c.rev = true; c.por = key
    delete G.marcas[idx]
    const lado = G.vez, h = G.hist[G.hist.length - 1]
    h?.acertos.push({ idx, p: c.p, cor: c.cor, previsto: !!h.alvos?.includes(idx) })
    ev({ t: 'revela', idx, cor: c.cor, key, lado })
    log(`${nomeK(key)} abriu ${c.p}: ${c.cor === 'x' ? 'o X9!' : c.cor === 'n' ? 'cliente.' : c.cor === lado ? 'agente do time!' : `agente do ${TIMES[c.cor]}.`}`)
    if (c.cor === 'x') return fim(outro(lado), 'x9')
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
    G.alvos[G.vez] = []
    armaPrazo(ABRIR_MS)
    ev({ t: 'vez', lado: G.vez })
    difunde()
  }
  function fim(lado, motivo) {
    G.fase = 'fim'; G.vencedor = lado; G.motivo = motivo
    G.prazo = 0
    G.placar[lado] = (G.placar[lado] || 0) + 1
    ls.set(`${XX}.placar`, G.placar)
    ev({ t: 'fim', lado, motivo })
    log(`${TIMES[lado]} venceu${motivo === 'x9' ? ': o outro time abriu o X9' : ''}.`)
    sysMsg(`${TIMES[lado]} venceu o ${NOME}${motivo === 'x9' ? ' (o outro time abriu o X9)' : ''}`)
    difunde()
  }
  // nova partida: mesmos times, palavras novas, o outro time começa; ou volta ao lobby para trocar
  function revanche(lobby) {
    Object.assign(G, { id: Math.random().toString(36).slice(2, 9), comeca: outro(G.comeca), cartas: [], marcas: {}, hist: [], dica: null, vencedor: null, motivo: null, log: [], ev: [], evN: 0, alvos: { r: [], b: [] } })
    G.fase = 'convite'
    if (lobby) { G.conv = Object.fromEntries(ctx.presentes().map(k => [k, 'sim'])); return difunde() }
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
    if (resto.length < 2) return fim(outro(t), 'abandono')
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
      case 'entra': entra(key, d); break
      case 'config': configura(key, d); break
      case 'alvo': marcaDica(key, d); break
      case 'time': escolheTime(key, d.lado ?? null); break
      case 'sorteia': if (key === G.host) sorteia(); break
      case 'zera': if (key === G.host && G.fase === 'convite') { G.times = {}; G.chefe = { r: null, b: null }; difunde() } break
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
      op: G.op || { pacotes: ['classico'], tempo: false }, prazo: G.prazo ? Math.max(0, G.prazo - Date.now()) : 0, bloqueio: Math.max(0, (G.bloqueio || 0) - Date.now()),
      alvos: chefe ? [...(G.alvos?.[G.times[k]] || [])] : [],
      cartas: G.cartas.map(c => ({ p: c.p, rev: c.rev, por: c.por, cor: c.rev || chefe || fim_ ? c.cor : null })),
      mapa: k === ADMIN && !chefe && !fim_ && G.cartas.length ? G.cartas.map(c => c.cor) : null, // só vai para o admin
      faltam: G.cartas.length ? { r: faltam('r'), b: faltam('b') } : null, total: G.cartas.length ? { r: G.cartas.filter(c => c.cor === 'r').length, b: G.cartas.filter(c => c.cor === 'b').length } : null,
      marcas: G.marcas,
      hist: G.hist.map(({ alvos, acertos, ...h }) => {
        const privado = G.chefe[h.lado] === k || fim_
        return { ...h, acertos: acertos.map(({ previsto, ...a }) => ({ ...a, ...(privado ? { previsto } : {}) })) }
      }),
      placar: G.placar, vencedor: G.vencedor, motivo: G.motivo, log: G.log.slice(-60), ev: G.ev,
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
    normalizaEstado()
    G.host = me.key; G.hostNome = me.name; G.seq += 5
    sysMsg(`${nomeAntigo} caiu: ${me.name} assumiu a mesa de ${NOME}`)
    remove(antigo)
    if (G) difunde()
  }
  setInterval(() => {
    if (!G && !restaurou && me.key) {
      restaurou = true
      const s = ls.get(`${XX}.G`)
      if (s && s.host === me.key && s.fase === 'jogo' && Date.now() - s.t < 3 * 3600e3) setTimeout(() => { if (G || (V && V.host !== me.key)) return ls.set(`${XX}.G`, null); G = s; normalizaEstado(); difunde() }, 3000)
    }
    assumeSePreciso()
    if (!G || G.host !== me.key) return
    const pres = new Set(ctx.presentes()), agora = Date.now()
    for (const k of Object.keys(G.conv)) { if (k === me.key) continue; if (pres.has(k)) ausDesde.delete(k); else if (!ausDesde.has(k)) ausDesde.set(k, agora) }
    for (const [k, t] of ausDesde) if (agora - t > SAIU_MS) return remove(k)
  }, 1500)
  setInterval(() => {
    if (G?.host !== me.key || G.fase !== 'jogo' || !G.prazo || Date.now() < G.prazo) return
    log(`O tempo do time ${TIMES[G.vez]} acabou.`); ev({ t: 'tempo', lado: G.vez }); passa(null, true)
  }, 250)

  /* ================================================================ sons originais */
  const sons = criaSonsCodnames(ctx), timersSom = new Set()
  let tokenPartida = 0
  function som(nome, atraso = 0) {
    const token = tokenPartida
    const toca = () => { if (V && token === tokenPartida) sons.tocar(nome).catch(() => {}) }
    if (!atraso) return toca()
    const timer = setTimeout(() => { timersSom.delete(timer); toca() }, atraso)
    timersSom.add(timer)
  }
  function paraSons() {
    tokenPartida++; sons.parar()
    for (const timer of timersSom) clearTimeout(timer)
    timersSom.clear()
  }

  /* ================================================================ cliente */
  let V = null, ultEv = 0, dispensado = '', txtDica = '', numDica = null, espiaAdmin = false
  let pacotesAberto = false, escolhaPacotes = [], regrasAbertas = false, passoAula = 0, logAberto = false
  let fimMin = false, estadoBloqueio = false, anuncio = null, entrada = 0, fimDepois = 0
  let ultClique = { idx: -1, t: 0 }
  let skin = ls.get('ag.skin') === 'bar' ? 'bar' : 'noir'
  const abrindo = new Map()
  const souHost = () => V?.host === me.key
  const meuTime = () => V?.times[me.key] || null
  const souChefe = () => !!V && (V.chefe.r === me.key || V.chefe.b === me.key)
  const souAdmin = () => me.key === ADMIN && me.admin && V?.mapa
  const N = k => k === me.key ? 'Você' : ctx.nomeDe(k)
  const bloqueado = () => V && Date.now() < V.recebido + V.bloqueio
  const possoChutar = () => V?.fase === 'jogo' && V.etapa === 'palpite' && meuTime() === V.vez && !souChefe() && !bloqueado()
  const possoDarDica = () => V?.fase === 'jogo' && V.etapa === 'dica' && V.chefe[V.vez] === me.key
  const numTxt = n => n === INF ? '∞' : String(n)
  const valorDica = () => numDica ?? Math.max(1, Math.min(9, V?.alvos.length || 1))
  const botao = (conteudo, fn, cls = '', title = '') => {
    const b = el('button', { type: 'button', className: `ag-btn ${cls}`, title })
    b.append(...[conteudo].flat().map(c => typeof c === 'string' && c.startsWith('<svg') ? html('span', 'ag-ic', c) : c))
    b.addEventListener('click', e => { e.stopPropagation(); som('click2'); fn(e) })
    return b
  }
  const retrato = (k, cls = '') => el('span', { className: `ag-retrato ${cls}`, title: N(k), 'data-key': k }, ctx.pfp(k, 64, N(k)))
  function manda(d) {
    if (!V) return
    const m = { id: V.id, ...d }
    if (souHost()) hostRecebe(m, me.key)
    else ctx.sendTo(V.host, { [XX]: { op: m } })
  }
  function got(d, deKey) {
    if (!d) return
    if (d.op) { if (G?.host === me.key) hostRecebe(d.op, deKey); return }
    if (d.fim) { if (V?.id === d.fim) aplica(null); return }
    if (d.bk) { if (d.bk.host === deKey) backup = d.bk; return }
    if (!d.v || d.v.id === dispensado) return
    if (G && d.v.id === G.id && d.v.host !== me.key) { G = null; ls.set(`${XX}.G`, null) }
    if (V?.id === d.v.id && d.v.seq <= V.seq) return
    aplica(d.v)
  }
  function aplica(v) {
    const antes = V, nova = v && v.id !== antes?.id
    if (nova) {
      paraSons(); abrindo.clear(); txtDica = ''; numDica = null; espiaAdmin = false; fimMin = false; anuncio = null
      ultEv = Math.max(0, ...v.ev.map(e => e.n))
      if (v.ev.some(e => e.t === 'inicio') && v.ev.length < 4) ultEv-- // quem acabou de entrar vê o início
      if (v.fase === 'convite' && ls.get('ag.tutorial') !== false) { regrasAbertas = true; passoAula = 0 }
    }
    if (v?.etapa === 'dica' && (antes?.etapa !== 'dica' || antes?.vez !== v.vez)) { txtDica = ''; numDica = null }
    if (v?.fase === 'jogo' && (nova || antes?.fase !== 'jogo')) entrada = Date.now()
    V = v
    if (v) v.recebido = Date.now()
    const evs = v ? v.ev.filter(e => e.n > ultEv) : []
    if (v) ultEv = Math.max(ultEv, ...v.ev.map(e => e.n))
    for (const e of evs) if (e.t === 'revela') abrindo.set(e.idx, Date.now())
    if (evs.some(e => e.t === 'fim')) {
      fimMin = false
      // o cartão do fim espera a carta que decidiu a partida terminar de virar
      if (evs.some(e => e.t === 'revela')) { fimDepois = Date.now() + ABRIR_MS + 500; setTimeout(render, ABRIR_MS + 550) }
    }
    if (!v) { paraSons(); abrindo.clear(); regrasAbertas = false; pacotesAberto = false; logAberto = false }
    if (v) prepara(evs)
    render()
    if (v) anima(evs)
  }
  // anúncios grandes no meio da tela: dica nova, vez do outro time, começo
  function prepara(evs) {
    for (const e of evs) {
      if (e.t === 'dica') anuncio = { t: 'dica', lado: e.lado, txt: e.txt, n: e.num, desde: Date.now(), dura: 2200 }
      else if (e.t === 'vez' && !evs.some(x => x.t === 'fim')) anuncio = { t: 'vez', lado: e.lado, desde: Date.now() + (evs.some(x => x.t === 'revela') ? ABRIR_MS + 150 : 300), dura: 1700 }
      else if (e.t === 'inicio') anuncio = { t: 'inicio', lado: e.lado || V.vez, desde: Date.now() + 300, dura: 2000 }
    }
    if (anuncio) { const a = anuncio; setTimeout(() => { if (anuncio === a) { anuncio = null; render() } }, a.desde - Date.now() + a.dura + 50) }
  }
  const trocaSkin = s => { skin = s; ls.set('ag.skin', skin); render() }
  function caixa(p, cls = '') {
    return el('span', { className: `ag-caixa ${cls}`, style: `--ag-pc:${p.cor};--ag-po:${p.outra}`, 'aria-hidden': 'true' },
      el('span', { className: 'ag-caixa__frente' }, el('span', { className: 'ag-caixa__marca' }, 'COD', el('b', { textContent: 'NAMES' })),
        html('span', 'ag-caixa__selo', arte(p.simbolo)), el('b', { className: 'ag-caixa__nome', textContent: p.nome }), el('small', { textContent: p.subtitulo })),
      el('span', { className: 'ag-caixa__lado' }, el('i'), el('b', { textContent: p.nome })),
      el('span', { className: 'ag-caixa__topo' }),
      el('span', { className: 'ag-caixa__sombra' }))
  }

  function render() {
    const foco = document.activeElement?.matches('.ag-dica__txt') ? { s: document.activeElement.selectionStart, e: document.activeElement.selectionEnd } : null
    tela.classList.toggle('ag--on', !!V); ctx.onAtivo?.(!!V)
    if (!V) { tela.replaceChildren(); return }
    const minhaVez = V.fase === 'jogo' && meuTime() === V.vez && (V.etapa === 'dica' ? souChefe() : !souChefe())
    Object.assign(tela.dataset, { vez: V.fase === 'jogo' ? V.vez : '', fase: V.fase, skin, eu: meuTime() || '', minha: minhaVez ? '1' : '' })
    estadoBloqueio = !!bloqueado()
    const logo = el('button', { className: 'ag-logo', type: 'button', 'aria-label': NOME }, el('span', {}, 'COD', el('b', { textContent: 'NAMES' })), el('i'))
    logo.onclick = () => { if (!souAdmin()) return; espiaAdmin = !espiaAdmin; ctx.logInterno?.(`mapa do admin ${espiaAdmin ? 'aberto' : 'fechado'}`); render() }
    const sair = botao(ic('x'), e => {
      if (souHost()) { const b = e.currentTarget; if (b.dataset.conf) return encerrar(); b.dataset.conf = '1'; b.title = 'Clique de novo para fechar a mesa'; b.classList.add('confirma'); return }
      manda({ op: 'sai' }); dispensado = V.id; aplica(null)
    }, 'ag-btn--ic', souHost() ? 'Fechar a mesa para todos' : 'Sair da mesa')
    const visual = el('div', { className: 'ag-visual', role: 'group', 'aria-label': 'Visual (só para você)' },
      ...[['noir', 'Escritório'], ['bar', 'Bar']].map(([s, t]) => { const b = botao(t, () => trocaSkin(s), skin === s ? 'on' : '', 'Muda o visual só para você'); b.setAttribute('aria-pressed', String(skin === s)); return b }))
    const topo = el('header', { className: 'ag-topo' }, logo, el('span', { className: 'ag-grow' }), visual,
      V.fase !== 'convite' ? botao(ic('lista'), () => { logAberto = !logAberto; render() }, 'ag-btn--ic' + (logAberto ? ' on' : ''), 'Tudo o que aconteceu') : '',
      botao(ic('ajuda'), () => { regrasAbertas = true; passoAula = 0; render() }, 'ag-btn--ic', 'Como jogar'), sair)
    const kids = [el('div', { className: 'ag-fundo' }, el('i'), el('b')), topo]
    if (V.fase === 'convite') kids.push(lobby())
    else kids.push(el('main', { className: 'ag-partida' }, painelTime('b'), centro(), painelTime('r')), V.fase === 'fim' && Date.now() >= fimDepois ? fimUI() : '')
    if (logAberto && V.fase !== 'convite') kids.push(logUI())
    if (anuncio) kids.push(anuncioUI())
    if (pacotesAberto) kids.push(pacotesModal())
    if (regrasAbertas) kids.push(tutorial())
    if (V.fase === 'jogo' && !ctx.presentes().includes(V.host)) kids.push(el('div', { className: 'ag-pausa', role: 'status' }, el('b', { textContent: 'Partida pausada' }), el('span', { textContent: 'Esperando o anfitrião voltar.' })))
    tela.replaceChildren(...kids); ctx.hydrate(tela)
    ajustaPalavras()
    if (foco) { const n = tela.querySelector('.ag-dica__txt'); if (n) { n.focus({ preventScroll: true }); n.setSelectionRange(foco.s, foco.e) } }
  }

  /* ---------------- lobby ---------------- */
  function lobby() {
    const pres = new Set(ctx.presentes())
    const pronto = t => V.chefe[t] && pres.has(V.chefe[t]) && Object.keys(V.times).filter(k => V.times[k] === t && pres.has(k)).length >= 2
    const ok = pronto('r') && pronto('b')
    const ativos = PACOTES.filter(p => (V.op.pacotes || ['classico']).includes(p.id))
    const prateleira = el('button', { type: 'button', className: 'ag-prateleira', disabled: !souHost(), title: souHost() ? 'Escolher os baralhos' : 'O anfitrião escolhe os baralhos' },
      el('span', { className: 'ag-prateleira__caixas' }, ...ativos.slice(0, 4).map((p, i) => caixa(p, `ag-caixa--mini ag-caixa--${i}`))),
      el('span', { className: 'ag-prateleira__txt' }, el('small', { textContent: 'Baralho' }), el('b', { textContent: ativos.map(p => p.nome).join(' + ') }),
        souHost() ? el('em', { textContent: 'Trocar ou misturar →' }) : ''))
    prateleira.onclick = () => { som('click2'); escolhaPacotes = [...(V.op.pacotes || ['classico'])]; pacotesAberto = true; render() }
    const tempo = el('button', { type: 'button', className: 'ag-chave' + (V.op.tempo ? ' on' : ''), disabled: !souHost(), 'aria-pressed': String(!!V.op.tempo) },
      html('span', 'ag-ic', ic('relogio')), el('span', {}, el('b', { textContent: 'Relógio' }), el('small', { textContent: V.op.tempo ? '3 min a dica · 90 s o palpite' : 'Sem pressa' })), el('i', { className: 'ag-chave__trilho' }, el('i')))
    tempo.onclick = () => { som('click2'); manda({ op: 'config', tempo: !V.op.tempo }) }
    const status = t => {
      const c = V.chefe[t], ag = Object.keys(V.times).filter(k => V.times[k] === t && k !== c && pres.has(k)).length
      return el('li', { className: `ag-check ag-check--${t}${pronto(t) ? ' ok' : ''}` }, el('i'), el('b', { textContent: TIMES[t] }),
        el('span', { textContent: !c ? 'falta o chefe' : ag < 1 ? 'falta um agente' : `chefe + ${ag} agente${ag > 1 ? 's' : ''}` }))
    }
    const comecar_ = botao([el('span', { textContent: 'Começar partida' }), ic('seta')], comecar, 'ag-btn--grande')
    comecar_.disabled = !souHost() || !ok
    const centro = el('section', { className: 'ag-mesa-lobby' },
      el('div', { className: 'ag-titulo' }, el('small', { textContent: 'Mesa aberta por ' + (souHost() ? 'você' : V.hostNome) }), el('h1', { textContent: 'Escolham seus lados' }),
        el('p', { textContent: 'Um chefe de cada time vê o mapa e dá dicas de uma palavra. Os agentes adivinham.' })),
      prateleira, tempo,
      el('ul', { className: 'ag-checks' }, status('b'), status('r')),
      el('div', { className: 'ag-acoes' },
        souHost() ? botao([ic('dados'), 'Sortear times e chefes'], () => manda({ op: 'sorteia' }), 'ag-btn--leve') : '',
        souHost() && Object.keys(V.times).length ? botao('Esvaziar', () => manda({ op: 'zera' }), 'ag-btn--leve ag-btn--peq') : ''),
      souHost() ? comecar_ : el('p', { className: 'ag-espera', textContent: ok ? `Tudo pronto. ${V.hostNome} vai começar.` : `${V.hostNome} começa quando os dois times estiverem completos.` }))
    const fora = ctx.presentes().filter(k => !V.times[k])
    return el('main', { className: 'ag-lobby' }, painelTime('b'), centro, painelTime('r'),
      el('footer', { className: 'ag-plateia' }, el('small', { textContent: fora.length ? 'Fora dos times' : 'Todo mundo escolheu um lado' }),
        ...fora.map(k => el('span', { className: 'ag-pessoa', 'data-key': k }, retrato(k), el('b', { textContent: N(k) }))),
        meuTime() ? botao('Só assistir', () => manda({ op: 'time', lado: null }), 'ag-btn--leve ag-btn--peq') : ''))
  }

  /* ---------------- times (lobby e partida) ---------------- */
  function painelTime(t) {
    const lobby_ = V.fase === 'convite', mestre = V.chefe[t]
    const ks = Object.keys(V.times).filter(k => V.times[k] === t && k !== mestre)
    const vez = V.fase === 'jogo' && V.vez === t
    const pessoa = (k, papel) => el('span', { className: `ag-pessoa${k === me.key ? ' eu' : ''}`, 'data-key': k }, retrato(k), el('b', { textContent: N(k) }), papel ? el('small', { textContent: papel }) : '')
    let chefe
    if (mestre) chefe = el('div', { className: 'ag-cadeira ocupada' }, pessoa(mestre, 'chefe · vê o mapa'))
    else if (lobby_) { chefe = botao([el('b', { textContent: '+' }), el('span', { textContent: 'Ser o chefe' })], () => manda({ op: 'entra', lado: t, papel: 'mestre' }), 'ag-cadeira vazia') }
    else chefe = el('div', { className: 'ag-cadeira vazia' }, el('span', { textContent: 'sem chefe' }))
    const estouAqui = meuTime() === t && mestre !== me.key
    const agentes = el('div', { className: 'ag-agentes' }, ...ks.map(k => pessoa(k)),
      lobby_ && !estouAqui ? botao('+ Entrar como agente', () => manda({ op: 'entra', lado: t, papel: 'agente' }), 'ag-entrar') : '',
      !ks.length && !lobby_ ? el('small', { className: 'ag-vazio', textContent: 'ninguém' }) : '')
    const head = el('header', { className: 'ag-time__topo' }, el('h2', {}, el('small', {}, meuTime() === t ? 'seu time' : 'time', vez ? el('span', { className: 'ag-time__navez', textContent: 'na vez' }) : ''), TIMES[t]),
      !lobby_ && V.faltam ? el('div', { className: 'ag-falta', title: 'Agentes que faltam encontrar' }, el('b', { textContent: String(V.faltam[t]) }), el('small', { textContent: V.faltam[t] === 1 ? 'falta' : 'faltam' })) :
        el('div', { className: 'ag-vitorias', title: 'Vitórias nesta call' }, el('b', { textContent: String(V.placar?.[t] || 0) }), el('small', { textContent: 'vitórias' })))
    const kids = [head]
    if (lobby_) kids.push(html('span', 'ag-time__sombra', arte('agente')))
    if (!lobby_ && V.total) {
      const tot = V.total[t], achou = tot - V.faltam[t]
      kids.push(el('div', { className: 'ag-tampinhas', 'aria-label': `${achou} de ${tot} encontrados` }, ...Array.from({ length: tot }, (_, i) => el('i', { className: i < achou ? 'achou' : '' }))))
    }
    kids.push(el('h3', { textContent: 'Chefe' }), chefe, el('h3', { textContent: 'Agentes' }), agentes)
    if (!lobby_) {
      const hs = V.hist.filter(h => h.lado === t)
      kids.push(el('h3', { textContent: 'Dicas' }), el('ol', { className: 'ag-dicas' }, ...hs.slice(-6).reverse().map((h, i) => el('li', { className: i === 0 && vez && V.etapa === 'palpite' ? 'atual' : '' },
        el('div', { className: 'ag-dicas__linha' }, el('b', { textContent: h.txt }), el('span', { textContent: numTxt(h.n) })),
        h.acertos.length ? el('div', { className: 'ag-dicas__abertas' }, ...h.acertos.map(a => el('i', { className: `ag-mini ag-mini--${a.cor}${a.previsto ? ' previsto' : ''}`, textContent: a.p, title: a.previsto ? 'Era uma das cartas pensadas pelo chefe' : '' }))) : el('small', { textContent: i === 0 && vez ? 'adivinhando…' : 'nada aberto' }))),
        !hs.length ? el('li', { className: 'ag-vazio' }, el('small', { textContent: 'nenhuma dica ainda' })) : ''))
      kids.push(el('footer', { className: 'ag-time__pe' }, `${V.placar?.[t] || 0} vitória${(V.placar?.[t] || 0) === 1 ? '' : 's'} na call`))
    }
    return el('aside', { className: `ag-time ag-time--${t}${vez ? ' vez' : ''}${meuTime() === t ? ' meu' : ''}`, 'data-time': t }, ...kids)
  }

  /* ---------------- partida ---------------- */
  // Ajusta pela largura real da palavra, inclusive depois que a fonte termina de carregar.
  const medidor = document.createElement('canvas').getContext('2d')
  function ajustaPalavras() {
    if (!V || !medidor) return
    for (const n of tela.querySelectorAll('.ag-carta__palavra, .ag-verso__palavra')) {
      const css = getComputedStyle(n), base = parseFloat(n.parentElement.dataset.base || 0) || Math.max(11, tela.clientHeight * (n.classList.contains('ag-verso__palavra') ? .019 : .03))
      medidor.font = `${css.fontWeight} ${base}px ${css.fontFamily}`
      const maior = Math.max(...n.textContent.split(/\s+/).map(p => medidor.measureText(p).width))
      const largura = Math.max(1, n.clientWidth - 4)
      n.style.fontSize = `${Math.max(8, Math.min(base, base * largura / Math.max(1, maior)))}px`
    }
  }
  new ResizeObserver(ajustaPalavras).observe(tela)
  document.fonts?.ready.then(ajustaPalavras)

  function faixaVez() {
    if (V.fase !== 'jogo') return el('div', { className: 'ag-faixa ag-faixa--fim' }, el('b', { textContent: `${TIMES[V.vencedor]} venceu` }), el('span', { textContent: 'O mapa inteiro está aberto.' }))
    const t = V.vez, chefe = V.chefe[t]
    let txt, sub
    if (V.etapa === 'dica') {
      if (chefe === me.key) { txt = 'Sua vez'; sub = 'pense numa palavra que ligue suas cartas' }
      else { txt = `Vez do ${TIMES[t]}`; sub = `${N(chefe)} está pensando na dica` }
    } else if (meuTime() === t && !souChefe()) { txt = 'Sua vez'; sub = 'clique para sugerir · clique duas vezes para abrir' }
    else { txt = `Vez do ${TIMES[t]}`; sub = souChefe() && meuTime() === t ? 'seu time está adivinhando — nada de dar dica!' : 'os agentes estão adivinhando' }
    return el('div', { className: `ag-faixa ag-faixa--${t}${txt === 'Sua vez' ? ' minha' : ''}`, role: 'status' }, el('i', { className: 'ag-faixa__luz' }),
      el('b', { textContent: txt }), el('span', { textContent: sub }),
      V.op.tempo ? el('span', { className: 'ag-relogio', 'data-prazo': String(V.recebido + V.prazo) }) : '')
  }
  function centro() {
    return el('section', { className: 'ag-centro' }, faixaVez(), mesa(), barra())
  }
  function cliqueCarta(i) {
    const agora = Date.now(), duplo = ultClique.idx === i && agora - ultClique.t < DUPLO_MS
    ultClique = { idx: i, t: duplo ? 0 : agora }
    if (possoDarDica()) { if (V.cartas[i].cor === meuTime()) { som('select'); numDica = null; manda({ op: 'alvo', idx: i }) } return }
    if (!possoChutar()) return
    if (duplo) { manda({ op: 'revela', idx: i }); return }
    som('select')
    manda({ op: 'marca', idx: i })
  }
  function mesa() {
    const espiao = souChefe() || V.fase === 'fim' || (espiaAdmin && souAdmin())
    const meuAlvo = new Set(V.alvos || [])
    const grade = el('div', { className: 'ag-grade' + (espiao ? ' ag-grade--mapa' : '') + (possoChutar() ? ' ag-grade--chute' : '') + (possoDarDica() ? ' ag-grade--dica' : '') }, ...V.cartas.map((c0, i) => {
      const cor = c0.cor || (espiaAdmin && souAdmin() ? V.mapa?.[i] : null)
      const marcas = V.marcas[i] || [], minha = marcas.includes(me.key)
      const desde = abrindo.get(i), abre = desde != null && Date.now() - desde < ABRIR_MS
      const alvo = meuAlvo.has(i) && !c0.rev
      const cls = ['ag-carta', cor ? `ag-c-${cor}` : '', c0.rev ? 'aberta' : '', espiao && !c0.rev ? 'espia' : '', alvo ? 'alvo' : '', minha ? 'minha' : '', marcas.length ? 'sugerida' : '', abre ? 'abrindo' : '',
        !c0.rev && possoDarDica() && cor === meuTime() ? 'clicavel' : '', !c0.rev && possoChutar() ? 'clicavel' : ''].filter(Boolean).join(' ')
      const frente = el('div', { className: 'ag-carta__frente' }, el('i', { className: 'ag-carta__num', textContent: String(i + 1).padStart(2, '0') }), el('b', { className: 'ag-carta__palavra', textContent: c0.p }))
      const giro = el('div', { className: 'ag-carta__giro' }, frente)
      if (c0.rev) giro.append(el('div', { className: `ag-carta__verso ag-v-${c0.cor}` }, html('span', 'ag-verso__arte', arte(c0.cor === 'n' ? 'cliente' : 'agente')),
        c0.cor === 'x' ? el('b', { className: 'ag-verso__x9', textContent: 'X9' }) : '', el('small', { className: 'ag-verso__palavra', textContent: c0.p })))
      const ent = Date.now() - entrada, rot = ((i * 37) % 7 - 3) * .22
      const n = el('article', { className: cls + (ent < 1600 ? ' entra' : ''), 'data-idx': String(i), style: `--ag-i:${i};--ag-ent:${-ent}ms;--ag-rot:${rot}deg;--ag-dec:${desde ? -(Date.now() - desde) : 0}ms;--ag-cx:${2 - i % 5};--ag-cy:${2 - Math.floor(i / 5)}` }, giro)
      if (!c0.rev) {
        if (alvo) n.append(html('span', 'ag-carta__alvo', ic('check'), { title: 'Na sua dica (só você vê)' }))
        if (marcas.length) n.append(el('div', { className: 'ag-carta__pinos' }, ...marcas.map(k => retrato(k))))
        if (n.classList.contains('clicavel')) {
          n.tabIndex = 0; n.setAttribute('role', 'button'); n.setAttribute('aria-label', c0.p)
          n.addEventListener('click', e => { e.stopPropagation(); cliqueCarta(i) })
          n.addEventListener('keydown', e => { if (e.key === 'Enter' && possoChutar()) { e.preventDefault(); manda({ op: 'revela', idx: i }) } else if (e.key === ' ') { e.preventDefault(); cliqueCarta(i) } })
        }
      } else if (c0.por) n.append(el('span', { className: 'ag-carta__por', title: `Aberta por ${N(c0.por)}` }, retrato(c0.por)))
      return n
    }))
    const ult = Math.max(0, ...abrindo.values())
    if (ult && Date.now() - ult < ABRIR_MS) { grade.classList.add('ag-grade--abrindo'); grade.style.setProperty('--ag-dec', `${-(Date.now() - ult)}ms`) }
    const tampo = el('div', { className: 'ag-tampo' }, grade)
    if (espiaAdmin && souAdmin()) tampo.append(el('span', { className: 'ag-espia-tag' }, html('span', 'ag-ic', ic('olho')), 'mapa'))
    return tampo
  }
  function enviaDica() {
    if (!possoDarDica() || !pistaValida()) return
    const n = numDica === INF ? 'inf' : valorDica()
    manda({ op: 'dica', txt: txtDica.trim(), num: n })
  }
  const pistaErro = () => {
    const t = txtDica.trim()
    if (!t) return ''
    if (!palavraOk(t)) return 'Só uma palavra, sem espaços'
    if (V.cartas.some(c => !c.rev && sem(c.p) === sem(t))) return 'Essa palavra está na mesa'
    return ''
  }
  const pistaValida = () => !!txtDica.trim() && !pistaErro()
  function barra() {
    if (V.fase !== 'jogo') return el('footer', { className: 'ag-barra' })
    if (possoDarDica()) {
      const input = el('input', { className: 'ag-dica__txt', placeholder: 'Sua dica…', type: 'text', value: txtDica, maxLength: 32, autocomplete: 'off', spellcheck: false, 'aria-label': 'Palavra da dica' })
      const envia = botao(['Mandar', ic('seta')], enviaDica, 'ag-btn--grande ag-dica__enviar'); envia.disabled = !pistaValida()
      const erro = el('small', { className: 'ag-dica__erro', textContent: pistaErro() })
      input.oninput = () => { txtDica = input.value.toUpperCase(); const p = input.selectionStart; input.value = txtDica; input.setSelectionRange(p, p); envia.disabled = !pistaValida(); erro.textContent = pistaErro() }
      input.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); enviaDica() } }
      const n = numDica === INF ? INF : valorDica()
      const muda = d => { const base = numDica === INF ? 1 : valorDica(); numDica = Math.max(0, Math.min(9, base + d)); render() }
      const menos = botao(ic('menos'), () => muda(-1), 'ag-passo', 'Menos'); menos.disabled = n !== INF && n <= 0
      const mais = botao(ic('mais'), () => muda(1), 'ag-passo', 'Mais'); mais.disabled = n !== INF && n >= 9
      const inf = botao('∞', () => { numDica = numDica === INF ? null : INF; render() }, 'ag-passo ag-passo--inf' + (n === INF ? ' on' : ''), 'Sem limite de palpites')
      const auto = numDica == null && V.alvos.length
      return el('footer', { className: 'ag-barra ag-barra--dica' },
        el('div', { className: 'ag-dica' }, el('label', { className: 'ag-dica__campo' }, input, erro),
          el('div', { className: 'ag-numero', role: 'group', 'aria-label': 'Quantas cartas' }, menos, el('output', { className: 'ag-numero__v', textContent: numTxt(n) }), mais, inf),
          envia),
        el('small', { className: 'ag-dica__ajuda' }, auto ? `${V.alvos.length} carta${V.alvos.length > 1 ? 's' : ''} marcada${V.alvos.length > 1 ? 's' : ''} — o número acompanha. ` : 'Toque nas suas cartas para marcar o que a dica liga (só você vê). ', '0 e ∞ deixam o time chutar à vontade.'))
    }
    if (V.etapa === 'dica') return el('footer', { className: 'ag-barra' }, el('div', { className: 'ag-espera-dica' }, retrato(V.chefe[V.vez]), el('span', {}, el('b', { textContent: N(V.chefe[V.vez]) }), ' está pensando…'), el('i', { className: 'ag-reticencias' }, el('i'), el('i'), el('i'))))
    const podePassar = meuTime() === V.vez && !souChefe()
    const passar = botao('Passar a vez', () => manda({ op: 'passa' }), 'ag-btn--leve'); passar.disabled = !possoChutar() || !V.chutes
    if (!V.chutes) passar.title = 'Abra pelo menos uma carta antes de passar'
    return el('footer', { className: 'ag-barra' },
      el('div', { className: `ag-lousa ag-lousa--${V.vez}` }, el('small', { textContent: 'dica' }), el('b', { className: 'ag-lousa__txt', textContent: V.dica?.txt || '' }), el('span', { className: 'ag-lousa__n', textContent: numTxt(V.dica?.n ?? 0) })),
      el('div', { className: 'ag-restam' }, el('b', { textContent: V.restam === INF ? '∞' : String(V.restam) }), el('small', { textContent: V.restam === INF ? 'palpites à vontade' : V.restam === 1 ? 'palpite (o bônus)' : 'palpites restantes' })),
      podePassar ? passar : '')
  }
  function anuncioUI() {
    const a = anuncio, dec = Date.now() - a.desde
    const st = `--ag-dec:${-dec}ms;--ag-dura:${a.dura}ms`
    if (a.t === 'dica') return el('div', { className: `ag-anuncio ag-anuncio--dica ag-anuncio--${a.lado}`, style: st, 'aria-hidden': 'true' },
      el('div', { className: 'ag-anuncio__cartao' }, el('small', { textContent: `dica do ${TIMES[a.lado]}` }), el('b', { textContent: a.txt }), el('span', { textContent: numTxt(a.n) })))
    return el('div', { className: `ag-anuncio ag-anuncio--vez ag-anuncio--${a.lado}`, style: st, 'aria-hidden': 'true' },
      el('div', { className: 'ag-anuncio__faixa' }, el('small', { textContent: a.t === 'inicio' ? 'começa' : 'agora é' }), el('b', { textContent: meuTime() === a.lado ? 'Seu time' : `Time ${TIMES[a.lado]}` })))
  }
  function logUI() {
    return el('aside', { className: 'ag-log', 'aria-label': 'Histórico' }, el('header', {}, el('b', { textContent: 'O que aconteceu' }), botao(ic('x'), () => { logAberto = false; render() }, 'ag-btn--ic')),
      el('ol', {}, ...V.log.slice().reverse().map(t => el('li', { textContent: t }))))
  }
  function fimUI() {
    const t = V.vencedor, ganhei = meuTime() === t
    const acoes = souHost() ? [botao(['Jogar de novo', ic('seta')], () => revanche(false), 'ag-btn--grande'), botao('Trocar times', () => revanche(true), 'ag-btn--leve')] : [el('small', { textContent: `Esperando ${V.hostNome}…` })]
    if (fimMin) return el('div', { className: `ag-fim-min ag-fim-min--${t}` }, el('b', { textContent: `${TIMES[t]} venceu` }), botao('Ver resultado', () => { fimMin = false; render() }, 'ag-btn--leve ag-btn--peq'), ...acoes)
    return el('section', { className: `ag-fim ag-fim--${t}`, role: 'status' },
      el('div', { className: 'ag-fim__cartao' },
        html('span', 'ag-fim__arte', arte('agente')),
        el('small', { textContent: meuTime() ? ganhei ? 'vocês venceram' : 'vocês perderam' : 'fim de jogo' }),
        el('h2', { textContent: `${TIMES[t]} venceu` }),
        el('p', { textContent: V.motivo === 'x9' ? `O ${TIMES[outro(t)]} abriu o X9.` : V.motivo === 'abandono' ? `O ${TIMES[outro(t)]} ficou sem gente.` : 'Todos os agentes foram encontrados.' }),
        el('div', { className: 'ag-fim__placar' }, el('span', { className: 'ag-fim__b' }, el('b', { textContent: String(V.placar.b || 0) }), 'Azul'), el('i', { textContent: '×' }), el('span', { className: 'ag-fim__r' }, el('b', { textContent: String(V.placar.r || 0) }), 'Vermelho')),
        el('div', { className: 'ag-fim__acoes' }, ...acoes, botao([ic('olho'), 'Ver o mapa'], () => { fimMin = true; render() }, 'ag-btn--leve'))))
  }

  /* ---------------- baralhos (caixas 3D) ---------------- */
  function pacotesModal() {
    const cards = PACOTES.map(p => {
      const sel = escolhaPacotes.includes(p.id)
      const b = el('button', { type: 'button', className: 'ag-pack' + (sel ? ' sel' : ''), 'aria-pressed': String(sel), 'data-pacote': p.id, style: `--ag-pc:${p.cor};--ag-po:${p.outra}` },
        el('span', { className: 'ag-pack__palco' }, caixa(p)), html('span', 'ag-pack__ok', ic('check')),
        el('b', { textContent: p.nome }), el('small', { textContent: p.descricao }))
      b.onclick = () => { som('select'); escolhaPacotes = sel ? escolhaPacotes.filter(k => k !== p.id) : [...escolhaPacotes, p.id]; render() }
      return b
    })
    const confirmar = botao(escolhaPacotes.length > 1 ? `Misturar ${escolhaPacotes.length} baralhos` : 'Usar este baralho', () => { manda({ op: 'config', pacotes: escolhaPacotes }); pacotesAberto = false; render() }, 'ag-btn--grande')
    confirmar.disabled = !escolhaPacotes.length
    return modal('Baralhos', el('div', { className: 'ag-packs' }, ...cards), () => { pacotesAberto = false; render() },
      el('footer', {}, el('small', { textContent: 'Escolha um ou misture vários: as 25 cartas são divididas entre eles.' }), confirmar), 'ag-modal--packs')
  }
  function modal(titulo, conteudo, fecha, pe = '', cls = '') {
    const fechar = botao(ic('x'), fecha, 'ag-btn--ic', 'Fechar')
    const n = el('div', { className: `ag-modal ${cls}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo }, el('section', { className: 'ag-modal__caixa' }, el('header', {}, el('h2', { textContent: titulo }), fechar), conteudo, pe))
    n.addEventListener('click', e => { if (e.target === n) fecha() })
    n.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fecha() } })
    setTimeout(() => { if (n.isConnected && !n.contains(document.activeElement)) fechar.focus({ preventScroll: true }) }, 0)
    return n
  }
  function tutorial() {
    const passos = [
      ['Dois times, dois chefes', 'Cada time tem um chefe. Só os chefes veem o mapa: de que time é cada carta.'],
      ['O chefe dá uma dica', 'Uma palavra e um número: quantas cartas ela liga. "PRAIA 2" pode ser AREIA e ONDA.'],
      ['Os agentes abrem as cartas', 'Clique para sugerir, clique duas vezes para abrir. Acertou, continua; errou, a vez passa.'],
      ['Cuidado com o X9', 'Quem achar todos os seus agentes primeiro vence. Abriu a carta preta, o X9, perdeu na hora.'],
    ]
    const [titulo, texto] = passos[passoAula]
    const mini = (p, cor, cls = '') => el('div', { className: `ag-aula-carta ag-c-${cor} ${cls}` }, el('b', { textContent: p }))
    const cenas = [
      () => el('div', { className: 'ag-aula__cena ag-aula__cena--0' }, html('span', 'ag-aula-chefe ag-aula-chefe--b', arte('agente')), el('div', { className: 'ag-aula__mapa' }, ...['b', 'n', 'r', 'r', 'b', 'x', 'n', 'b', 'r'].map(c => el('i', { className: `ag-c-${c}` }))), html('span', 'ag-aula-chefe ag-aula-chefe--r', arte('agente'))),
      () => el('div', { className: 'ag-aula__cena ag-aula__cena--1' }, mini('AREIA', 'r', 'liga'), mini('PIANO', 'n'), mini('ONDA', 'r', 'liga'), el('span', { className: 'ag-aula-pista' }, 'PRAIA', el('i', { textContent: '2' }))),
      () => el('div', { className: 'ag-aula__cena ag-aula__cena--2' }, mini('AREIA', 'r', 'vira'), mini('PIANO', 'n'), mini('ONDA', 'r'), html('span', 'ag-aula-mao', '<svg viewBox="0 0 24 24"><path d="M9 11V5a1.5 1.5 0 0 1 3 0v5.5V4a1.5 1.5 0 0 1 3 0v6.5-5a1.5 1.5 0 0 1 3 0V14c0 4-2.6 7-6.5 7-2.7 0-4.2-1.4-5.6-3.6L4 14.2a1.5 1.5 0 0 1 2.5-1.6L9 15z"/></svg>')),
      () => el('div', { className: 'ag-aula__cena ag-aula__cena--3' }, mini('LUA', 'b'), el('div', { className: 'ag-aula-carta ag-c-x vira' }, html('span', 'ag-verso__arte', arte('agente')), el('b', { textContent: 'X9' })), mini('MAR', 'n')),
    ]
    const fecha = () => { regrasAbertas = false; ls.set('ag.tutorial', false); render() }
    return modal('Como jogar', el('div', { className: 'ag-aula' }, cenas[passoAula](), el('h3', { textContent: titulo }), el('p', { textContent: texto })), fecha,
      el('footer', {}, el('span', { className: 'ag-aula__pontos' }, ...passos.map((_, i) => el('i', { className: i === passoAula ? 'on' : '' }))),
        passoAula ? botao('Voltar', () => { passoAula--; render() }, 'ag-btn--leve') : '',
        botao(passoAula === passos.length - 1 ? 'Bora jogar' : 'Próximo', () => { if (passoAula < passos.length - 1) { passoAula++; render() } else fecha() }, 'ag-btn--grande')), 'ag-modal--aula')
  }

  /* ---------------- sons e efeitos dos eventos ---------------- */
  function anima(evs) {
    for (const e of evs) {
      if (e.t === 'inicio') { som('notification', 100); som('deal', 1000) }
      else if (e.t === 'dica') som('sendClue')
      else if (e.t === 'revela') {
        // Acompanha a subida, a identidade exposta e o pouso da animação atual.
        som('revealCard')
        som(e.cor === 'x' ? 'assasin' : e.cor === e.lado ? 'goodGuess' : 'wrongGuess', 1180)
        som('dealCard', ABRIR_MS * BATE + 100)
        if (e.cor === 'x') {
          const token = tokenPartida
          setTimeout(() => { if (!V || token !== tokenPartida) return; tela.classList.remove('ag-treme'); void tela.offsetWidth; tela.classList.add('ag-treme') }, ABRIR_MS * BATE)
        }
      }
      else if (e.t === 'vez' && !evs.some(x => x.t === 'fim')) som('nextRound', evs.some(x => x.t === 'revela') ? ABRIR_MS + 150 : 300)
      else if (e.t === 'fim' && meuTime()) som(meuTime() === e.lado ? 'win' : 'loss', evs.some(x => x.t === 'revela') ? ABRIR_MS + 500 : 300)
      else if (e.t === 'novoChefe') toast(`${N(e.key)} é o novo chefe do ${TIMES[e.lado]}.`, 3000)
      else if (e.t === 'tempo') toast(`O tempo do ${TIMES[e.lado]} acabou.`, 2500)
    }
  }
  setInterval(() => {
    if (!V) return
    const pres = new Set(ctx.presentes())
    for (const n of tela.querySelectorAll('.ag-pessoa[data-key]')) { n.classList.toggle('caiu', !pres.has(n.dataset.key)); n.classList.toggle('fala', !!ctx.falando?.(n.dataset.key)) }
    for (const n of tela.querySelectorAll('[data-prazo]')) {
      const s = Math.max(0, Math.ceil((+n.dataset.prazo - Date.now()) / 1000))
      n.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; n.classList.toggle('acabando', s <= 10)
    }
    for (const [i, desde] of abrindo) if (Date.now() - desde >= ABRIR_MS) { abrindo.delete(i); tela.querySelector(`.ag-carta[data-idx="${i}"]`)?.classList.remove('abrindo') }
    if (!!bloqueado() !== estadoBloqueio) render()
  }, 200)
  document.addEventListener('keydown', e => { if (!V || e.key !== 'Escape') return; if (regrasAbertas || pacotesAberto || logAberto) { regrasAbertas = pacotesAberto = logAberto = false; render() } })
  function iniciar() { if (G) return toast('A mesa já está aberta.'); if (V && !souHost()) return toast('Já há uma mesa aberta.'); abrir() }
  window.__ag = () => ({ G, V, difunde, render, sons: () => sons })
  return {
    got, iniciar, ativo: () => !!V, lider: () => !!V && souHost(), encerra: () => { if (G?.host === me.key) encerrar() },
    sair: () => { if (!V) return; if (G?.host === me.key) return encerrar(); manda({ op: 'sai' }); dispensado = V.id; aplica(null) },
    jogadores: () => !V ? [] : Object.keys(V.times),
    entrouAlguem: key => { if (G?.host !== me.key) return; if (!(key in G.conv)) { G.conv[key] = 'sim'; return difunde() }; ctx.sendTo(key, { [XX]: { v: vista(key) } }) },
  }
}
