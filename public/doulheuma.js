// Dou-lhe Uma: leilão de listas. Sai um tema ("Filmes da Pixar") e cada um, na sua vez, sobe o lance de quantos itens
// consegue citar, ou passa. Quem fica com o maior lance cita em voz alta e a call conta os que valeram. Bateu o lance:
// +2 pontos para quem arrematou. Não bateu: +1 para cada um dos outros. Quem chegar à meta leva. Sem relógio.
// Mesma estrutura dos outros jogos: o host guarda tudo e manda a vista para cada um ({ du: ... }).
import { TEMAS, GRUPOS } from './jogos/doulheuma/temas.js'

const SOM = n => `jogos/coup/sons/${n}.mp3`
const SONS = ['embaralhar', 'desliza1', 'desliza2', 'desliza3', 'poe1', 'poe2', 'leque', 'carimbo', 'papel', 'vez', 'clique', 'tique']
const VOL = { embaralhar: .5, carimbo: .7, papel: .45, vez: .5, clique: .3, tique: .35 }
const SAIU_MS = 12000, HOST_MS = 10000, MIN_JOG = 2, MAX_LANCE = 60
const METAS = [[6, 'rápida · 6'], [10, 'normal · 10'], [15, 'longa · 15']]
const PTS_GANHA = 2, PTS_MICO = 1

const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n }
const embaralha = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]] } return a }
const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch {} } }
const SVG_MARTELO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 12.5-8 8a2.12 2.12 0 1 1-3-3l8-8"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/></svg>'

export function criaDouLheUma(ctx) {
  const { icon, toast, sysMsg, me } = ctx
  const tela = ctx.tela
  // o ctx.el não transforma data-* em atributo: este wrapper faz
  const el = (tag, props = {}, ...kids) => {
    const dados = {}, resto = {}
    for (const [k, v] of Object.entries(props)) (k.startsWith('data-') ? dados : resto)[k] = v
    const n = ctx.el(tag, resto, ...kids.flat())
    for (const [k, v] of Object.entries(dados)) n.setAttribute(k, v)
    return n
  }

  /* ================================================================ host: estado completo */
  let G = null, restaurou = false
  const ausDesde = new Map()
  const jog = k => G?.js.find(j => j.key === k)
  const log = t => { G.log.push(t); if (G.log.length > 60) G.log.splice(0, G.log.length - 60) }
  const ev = e => { G.ev.push({ ...e, n: ++G.evN }); if (G.ev.length > 30) G.ev.splice(0, G.ev.length - 30) }
  const novoId = () => Math.random().toString(36).slice(2, 9)

  function abrir(chamados) {
    const op = ls.get('du.op') || {}
    G = { id: novoId(), host: me.key, hostNome: me.name, fase: 'convite',
      op: { meta: METAS.some(([m]) => m === op.meta) ? op.meta : 10, grupos: Array.isArray(op.grupos) && op.grupos.length ? op.grupos.filter(g => GRUPOS[g]) : Object.keys(GRUPOS) },
      conv: Object.fromEntries(ctx.presentes().map(k => [k, k === me.key || chamados?.includes(k) ? 'sim' : '?'])),
      js: [], abre: 0, lote: 0, tema: null, usados: [], lei: null, lista: null, res: null, vencedor: null,
      log: [], ev: [], evN: 0, seq: 0, t: Date.now() }
    sysMsg(`${me.name} abriu uma mesa de Dou-lhe Uma`)
    difunde()
  }
  function comecar() {
    if (G?.fase !== 'convite') return
    const pres = new Set(ctx.presentes())
    const ks = embaralha(Object.keys(G.conv).filter(k => G.conv[k] === 'sim' && pres.has(k)))
    if (ks.length < MIN_JOG) return toast(`Precisa de pelo menos ${MIN_JOG} pessoas.`)
    ls.set('du.op', G.op)
    G.js = ks.map(k => ({ key: k, nome: ctx.nomeDe(k), pontos: 0 }))
    G.abre = 0; G.lote = 0; G.usados = []; G.log = []
    ev({ t: 'inicio' })
    sysMsg(`Dou-lhe Uma começou: ${G.js.map(j => j.nome).join(', ')}`)
    novoLote()
  }
  // sorteia um tema que ainda não saiu nesta partida (dos grupos escolhidos)
  function sorteiaTema() {
    const ok = TEMAS.map((t, i) => [t, i]).filter(([t]) => G.op.grupos.includes(t[0]))
    let livres = ok.filter(([, i]) => !G.usados.includes(i))
    if (!livres.length) { G.usados = []; livres = ok }
    const [t, i] = livres[rnd(livres.length)]
    G.usados.push(i)
    return { grupo: t[0], txt: t[1] }
  }
  function novoLote() {
    G.lote++
    G.tema = sorteiaTema()
    const ks = G.js.map(j => j.key), r = G.abre % ks.length
    const ordem = [...ks.slice(r), ...ks.slice(0, r)]
    G.lei = { ordem, ativos: [...ordem], vez: ordem[0], lance: null, hist: [] }
    G.lista = null; G.res = null; G.fase = 'lance'
    ev({ t: 'lote', quem: ordem[0] })
    log(`Lote ${G.lote}: ${G.tema.txt}.`)
    difunde()
  }
  function trocaTema(key) {
    const L = G.lei
    if (G.fase !== 'lance' || L.lance || (key !== G.host && key !== L.ordem[0])) return
    G.tema = sorteiaTema()
    ev({ t: 'troca' })
    difunde()
  }
  function daLance(key, qtd) {
    const L = G.lei
    if (G.fase !== 'lance' || L.vez !== key) return
    qtd = Math.floor(Number(qtd))
    if (!(qtd > (L.lance?.qtd || 0) && qtd <= MAX_LANCE)) return
    L.lance = { key, qtd }; L.hist.push({ k: key, qtd })
    ev({ t: 'lance', key, qtd })
    proximoDaVez(key)
  }
  function passa(key) {
    const L = G.lei
    if (G.fase !== 'lance' || L.vez !== key) return
    if (L.ativos.length === 1 && !L.lance) return // o último não passa sem ninguém ter dado lance
    L.ativos = L.ativos.filter(k => k !== key); L.hist.push({ k: key, qtd: 0 })
    ev({ t: 'passou', key })
    proximoDaVez(key)
  }
  function proximoDaVez(de) {
    const L = G.lei, o = L.ordem, i = Math.max(0, o.indexOf(de))
    for (let s = 1; s <= o.length; s++) {
      const c = o[(i + s) % o.length]
      if (L.ativos.includes(c) && c !== L.lance?.key) { L.vez = c; return difunde() }
    }
    if (L.lance) return vendido()
    difunde()
  }
  function vendido() {
    const { key, qtd } = G.lei.lance
    G.lei.vez = null
    G.lista = { key, qtd, ok: 0, ult: null }
    G.fase = 'lista'
    ev({ t: 'vendido', key, qtd })
    log(`${jog(key).nome} arrematou: vai citar ${qtd}.`)
    difunde()
  }
  // a call conta os itens que valeram (quem está citando não conta os próprios)
  function conta(key, delta) {
    const l = G.lista
    if (G.fase !== 'lista' || !l || (key === l.key && key !== G.host) || !jog(key) && key !== G.host) return
    const d = delta > 0 ? 1 : -1
    const novo = Math.max(0, Math.min(l.qtd, l.ok + d))
    if (novo === l.ok) return
    l.ok = novo; l.ult = { key, d }
    ev({ t: d > 0 ? 'valeu' : 'tirou', key, ok: novo })
    if (l.ok >= l.qtd) return fechaLista(true)
    difunde()
  }
  function desiste(key) {
    if (G.fase !== 'lista' || (key !== G.lista.key && key !== G.host)) return
    fechaLista(false)
  }
  function fechaLista(ganhou) {
    const l = G.lista, j = jog(l.key)
    if (ganhou) { if (j) j.pontos += PTS_GANHA }
    else for (const x of G.js) if (x.key !== l.key) x.pontos += PTS_MICO
    G.res = { key: l.key, qtd: l.qtd, ok: l.ok, ganhou }
    G.fase = 'resultado'
    ev({ t: ganhou ? 'arrematou' : 'micou', key: l.key })
    log(ganhou ? `${j?.nome} citou ${l.qtd}: +${PTS_GANHA}.` : `${j?.nome} parou em ${l.ok} de ${l.qtd}: os outros ganham ${PTS_MICO}.`)
    difunde()
  }
  function proximo(key) {
    if (G.fase !== 'resultado' || (key !== G.host && key !== G.res?.key)) return
    const max = Math.max(...G.js.map(j => j.pontos))
    if (max >= G.op.meta) {
      G.fase = 'fim'; G.vencedor = G.js.filter(j => j.pontos === max).map(j => j.key)
      ev({ t: 'fim' }); log(`${G.vencedor.map(k => jog(k).nome).join(' e ')} venceu.`)
      return difunde()
    }
    G.abre = (G.abre + 1) % G.js.length
    novoLote()
  }
  function revanche() {
    const ant = new Set(G.js.map(j => j.key))
    G.conv = Object.fromEntries(ctx.presentes().map(k => [k, ant.has(k) || k === me.key ? 'sim' : '?']))
    Object.assign(G, { id: novoId(), fase: 'convite', js: [], lote: 0, tema: null, lei: null, lista: null, res: null, vencedor: null, log: [], ev: [], evN: 0 })
    difunde()
  }
  // alguém saiu de vez: tira da mesa e ajeita o leilão
  function remove(key) {
    if (G.fase === 'convite') { if (key in G.conv) { delete G.conv[key]; difunde() } return }
    const i = G.js.findIndex(j => j.key === key)
    if (i < 0) return
    const j = G.js[i]
    G.js.splice(i, 1)
    ausDesde.delete(key)
    ev({ t: 'saiu', key, nome: j.nome }); log(`${j.nome} saiu da mesa.`); sysMsg(`${j.nome} saiu do Dou-lhe Uma`)
    if (G.fase === 'fim') return difunde()
    if (G.js.length < MIN_JOG) { G.fase = 'fim'; const max = Math.max(0, ...G.js.map(x => x.pontos)); G.vencedor = G.js.filter(x => x.pontos === max).map(x => x.key); return difunde() }
    if (G.abre >= G.js.length) G.abre = 0
    if (G.fase === 'lance') {
      const L = G.lei
      if (L.lance?.key === key) { G.lote--; return novoLote() } // quem tinha o lance saiu: o lote recomeça
      const eraVez = L.vez === key, antes = L.ordem[(L.ordem.indexOf(key) - 1 + L.ordem.length) % L.ordem.length]
      L.ordem = L.ordem.filter(k => k !== key); L.ativos = L.ativos.filter(k => k !== key)
      if (eraVez) return proximoDaVez(L.ordem.includes(antes) ? antes : L.ordem[0])
      if (L.lance && !L.ativos.some(k => k !== L.lance.key)) return vendido()
    } else if (G.fase === 'lista' && G.lista.key === key) {
      G.res = { key, qtd: G.lista.qtd, ok: G.lista.ok, ganhou: false, cancelado: true }; G.fase = 'resultado'
    }
    difunde()
  }
  function hostRecebe(d, key) {
    if (!G || !key || d.id !== G.id) return
    switch (d.op) {
      case 'resp': if (G.fase === 'convite') { G.conv[key] = d.sim ? 'sim' : 'nao'; difunde() } break
      case 'sai': if (key !== G.host) remove(key); break
      case 'lance': daLance(key, d.qtd); break
      case 'passa': passa(key); break
      case 'troca': trocaTema(key); break
      case 'conta': conta(key, d.delta); break
      case 'desiste': desiste(key); break
      case 'proximo': proximo(key); break
    }
  }
  // tudo neste jogo é público
  function vista() {
    return {
      id: G.id, seq: G.seq, host: G.host, hostNome: G.hostNome, fase: G.fase, op: G.op, conv: G.conv,
      js: G.js.map(j => ({ key: j.key, nome: j.nome, pontos: j.pontos })), lote: G.lote, tema: G.tema,
      lei: G.lei, lista: G.lista, res: G.res, vencedor: G.vencedor, log: G.log.slice(-30), ev: G.ev,
    }
  }
  function difunde() {
    if (!G) return
    G.seq++; G.t = Date.now()
    ls.set('du.G', G)
    const v = vista()
    const ks = new Set([...ctx.presentes(), ...G.js.map(j => j.key), ...Object.keys(G.conv || {})])
    for (const k of ks) if (k !== me.key) ctx.sendTo(k, { du: { v } })
    const pres = new Set(ctx.presentes())
    G.sucessor = G.js.map(j => j.key).find(k => k !== me.key && pres.has(k)) || [...pres].find(k => k !== me.key) || null
    if (G.sucessor) ctx.sendTo(G.sucessor, { du: { bk: G } })
    aplica(vista())
  }
  function encerrar() {
    if (!G) return
    ctx.send({ du: { fim: G.id } })
    ls.set('du.G', null)
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
    sysMsg(`${nomeAntigo} caiu: ${me.name} assumiu a mesa de Dou-lhe Uma`)
    remove(antigo)
    if (G) difunde()
  }
  setInterval(() => {
    if (!G && !restaurou && me.key) {
      restaurou = true
      const s = ls.get('du.G')
      if (s && s.host === me.key && s.fase !== 'fim' && Date.now() - s.t < 3 * 3600e3) setTimeout(() => { if (G || (V && V.host !== me.key)) return ls.set('du.G', null); G = s; difunde() }, 3000)
    }
    assumeSePreciso()
    if (!G || G.host !== me.key) return
    const pres = new Set(ctx.presentes()), agora = Date.now()
    const quem = G.fase === 'convite' ? Object.keys(G.conv).filter(k => k !== me.key) : G.js.map(j => j.key).filter(k => k !== me.key)
    for (const k of quem) { if (pres.has(k)) ausDesde.delete(k); else if (!ausDesde.has(k)) ausDesde.set(k, agora) }
    for (const [k, t] of ausDesde) if (agora - t > SAIU_MS) return remove(k)
  }, 1500)

  /* ================================================================ cliente */
  let V = null, ultEv = 0, dispensado = ''
  const vistos = new Set()
  const novo = k => vistos.has(k) ? false : (vistos.add(k), true)
  const souHost = () => V && V.host === me.key
  const eu = () => V?.js.find(j => j.key === me.key)
  const N = k => k === me.key ? 'Você' : (V?.js.find(j => j.key === k)?.nome || ctx.nomeDe(k))
  function manda(d) {
    if (!V) return
    const m = { id: V.id, ...d }
    if (souHost()) hostRecebe(m, me.key)
    else ctx.sendTo(V.host, { du: { op: m } })
  }
  function got(d, deKey) {
    if (!d) return
    if (d.op) { if (G && G.host === me.key) hostRecebe(d.op, deKey); return }
    if (d.fim) { if (V?.id === d.fim) aplica(null); return }
    if (d.bk) { if (d.bk.host === deKey) backup = d.bk; return }
    if (d.v) {
      if (G && d.v.id === G.id && d.v.host !== me.key) { G = null; ls.set('du.G', null) }
      if (d.v.id === dispensado) return
      if (V && d.v.id === V.id && d.v.seq <= V.seq) return
      aplica(d.v)
    }
  }
  function aplica(v) {
    const antes = V
    if (v && (!antes || antes.id !== v.id)) ultEv = Math.max(0, ...v.ev.map(e => e.n))
    V = v
    const evs = v ? v.ev.filter(e => e.n > ultEv) : []
    if (v) ultEv = Math.max(ultEv, ...v.ev.map(e => e.n))
    anima(evs)
    render()
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

  /* ---------- a mesa ---------- */
  const botao = (conteudo, fn, cls = '', title = '') => { const b = el('button', { type: 'button', className: `du-btn ${cls}`, title }); b.append(...[conteudo].flat()); b.addEventListener('click', e => { e.stopPropagation(); b.blur(); som('clique'); fn(e) }); return b }
  const retrato = (k, cls = '') => el('span', { className: `du-foto ${cls}`, 'data-key': k }, ctx.pfp(k, 64, N(k)))
  const martelo = (cls = '') => el('span', { className: `du-martelo ${cls}`, innerHTML: SVG_MARTELO })
  // a animação do "dou-lhe uma, dou-lhe duas, vendido!" fica por cima mesmo se a tela for refeita no meio
  let fx = null
  let lanceSel = 0, lanceChave = ''

  function render() {
    tela.classList.toggle('du--on', !!V)
    ctx.onAtivo?.(!!V)
    if (!V) { tela.replaceChildren(); return }
    const topo = el('header', { className: 'du-topo' },
      el('span', { className: 'du-logo' }, martelo(), el('b', { textContent: 'Dou-lhe Uma' })),
      V.fase !== 'convite' && V.fase !== 'fim' ? el('span', { className: 'du-meta', textContent: `lote ${V.lote} · quem fizer ${V.op.meta} leva` }) : '',
      el('span', { className: 'du-grow' }),
      V.js.length ? placar() : '',
      souHost() ? botao(icon('x'), encerrar, 'du-btn--ic', 'Encerrar a mesa para todo mundo')
        : botao(icon('x'), () => { dispensado = V.id; aplica(null) }, 'du-btn--ic', 'Sair da mesa (só para você)'))
    let corpo
    if (V.fase === 'convite') corpo = convite()
    else if (V.fase === 'fim') corpo = fim()
    else corpo = mesa()
    tela.replaceChildren(topo, corpo, bilhete())
    if (fx && Date.now() < fx.ate) tela.append(fx.el)
    ctx.hydrate(tela)
  }
  function placar() {
    const ord = V.js.slice().sort((a, b) => b.pontos - a.pontos)
    return el('div', { className: 'du-placar' }, ...ord.map(j => el('span', { className: 'du-placar__p', title: `${j.nome}: ${j.pontos} ponto${j.pontos === 1 ? '' : 's'}` }, retrato(j.key), el('b', { textContent: j.pontos }))))
  }

  // página inicial: três quadrinhos animados (tema, lances subindo, a call contando)
  function convite() {
    const host = souHost()
    const n = Object.entries(V.conv).filter(([k, v]) => v === 'sim' && ctx.presentes().includes(k)).length
    const quadro = (num, cena, rotulo) => el('div', { className: 'du-passo', style: `--d:${num * 140}ms` }, el('div', { className: `du-cena du-cena--${num}` }, ...cena), el('span', { className: 'du-passo__rot' }, rotulo))
    const tutorial = el('div', { className: 'du-tutorial' },
      quadro(1, [el('span', { className: 'du-mini-placa' }, el('small', { textContent: 'lote 1' }), el('b', { textContent: 'Filmes da Pixar' }))], 'Sai um tema'),
      quadro(2, [el('span', { className: 'du-mini-plq a', textContent: '5' }), el('span', { className: 'du-mini-plq b', textContent: '7' }), el('span', { className: 'du-mini-plq c', textContent: '8' })], 'Quem cita mais?'),
      quadro(3, [el('span', { className: 'du-mini-slots' }, ...Array.from({ length: 8 }, (_, i) => el('i', { style: `--i:${i}` })))], 'A call conta'))
    const meta = el('div', { className: 'du-seg' }, ...METAS.map(([m, t]) => host
      ? botao(t, () => { G.op.meta = m; difunde() }, V.op.meta === m ? 'du-on' : '')
      : el('span', { className: V.op.meta === m ? 'du-on' : '', textContent: t })))
    const grupos = el('div', { className: 'du-chips' }, ...Object.entries(GRUPOS).map(([g, t]) => {
      const on = V.op.grupos.includes(g)
      if (!host) return el('span', { className: 'du-chip' + (on ? ' du-on' : ''), textContent: t })
      return botao(t, () => { const s = new Set(G.op.grupos); on ? s.delete(g) : s.add(g); if (!s.size) return toast('Deixe pelo menos um assunto.'); G.op.grupos = [...s]; difunde() }, 'du-chip' + (on ? ' du-on' : ''))
    }))
    const pessoas = el('div', { className: 'du-pessoas' }, ...Object.entries(V.conv).map(([k, v]) => el('span', { className: `du-pessoa du-pessoa--${v}`, title: v === 'sim' ? 'vai jogar' : v === 'nao' ? 'só assiste' : 'decidindo' }, retrato(k), el('small', { textContent: k === me.key ? 'você' : ctx.nomeDe(k) }))))
    const ir = host ? botao(n >= MIN_JOG ? `Começar · ${n}` : `Precisa de ${MIN_JOG}`, comecar, 'du-btn--forte du-btn--grande') : el('small', { className: 'du-espera', textContent: `${V.hostNome} vai começar` })
    if (host && n < MIN_JOG) ir.disabled = true
    return el('div', { className: 'du-inicio' }, tutorial,
      el('p', { className: 'du-regra' }, el('b', { textContent: `Bateu o lance: +${PTS_GANHA}` }), ' · ', el('span', { textContent: `micou: +${PTS_MICO} para cada um dos outros` }), ' · sem relógio'),
      grupos, pessoas,
      el('div', { className: 'du-linha' }, meta, host ? botao(V.conv[me.key] === 'sim' ? 'Eu jogo' : 'Eu só assisto', () => { G.conv[me.key] = G.conv[me.key] === 'sim' ? 'nao' : 'sim'; difunde() }, 'du-btn--leve') : '', ir))
  }
  function bilhete() {
    if (V.fase !== 'convite' || souHost() || V.conv[me.key] !== '?') return ''
    if (novo('conv:' + V.id)) som('papel')
    return el('div', { className: 'du-bilhete' },
      el('div', { className: 'du-linha' }, retrato(V.host), el('span', {}, el('b', { textContent: V.hostNome }), ' chamou você para o Dou-lhe Uma')),
      el('div', { className: 'du-linha' }, botao('Jogar', () => manda({ op: 'resp', sim: true }), 'du-btn--forte'), botao('Só assistir', () => manda({ op: 'resp', sim: false }), 'du-btn--leve')))
  }

  // a placa do lote: o tema em destaque
  function placa() {
    const base = `${V.id}:${V.lote}`
    const entra = novo(`placa:${base}:${V.tema?.txt}`)
    const podeTrocar = V.fase === 'lance' && !V.lei.lance && (souHost() || V.lei.ordem[0] === me.key)
    return el('div', { className: 'du-placa' + (entra ? ' entra' : '') },
      el('span', { className: 'du-placa__lote' }, el('small', { textContent: 'lote' }), el('b', { textContent: String(V.lote).padStart(2, '0') })),
      el('div', { className: 'du-placa__txt' }, el('small', { textContent: GRUPOS[V.tema.grupo] }), el('b', { textContent: V.tema.txt })),
      podeTrocar ? botao(icon('refresh-cw'), () => manda({ op: 'troca' }), 'du-btn--ic du-placa__troca', 'Sortear outro tema') : '')
  }
  // a tarja de TV com o lance atual
  function tarja() {
    const L = V.lei, l = V.lista
    const k = l?.key || L?.lance?.key, qtd = l?.qtd || L?.lance?.qtd
    if (!k) return el('div', { className: 'du-tarja du-tarja--vazia' }, el('span', { textContent: 'Sem lance ainda' }), el('b', { textContent: '—' }))
    const entra = novo(`tarja:${V.id}:${V.lote}:${qtd}:${k}`)
    return el('div', { className: 'du-tarja' + (entra ? ' entra' : '') },
      el('span', { className: 'du-tarja__rot', textContent: V.fase === 'lance' ? 'Maior lance' : 'Arrematado por' }),
      retrato(k, 'du-foto--tarja'), el('span', { className: 'du-tarja__nome', textContent: N(k) }),
      el('b', { className: 'du-tarja__n', textContent: qtd }), el('small', { textContent: qtd === 1 ? 'item' : 'itens' }))
  }
  function mesa() {
    const f = V.fase
    const corpo = f === 'lance' ? leilao() : f === 'lista' ? lista() : resultado()
    return el('div', { className: 'du-mesa du-mesa--' + f }, placa(), tarja(), corpo)
  }
  function leilao() {
    const L = V.lei, base = `${V.id}:${V.lote}`
    const ult = {}; L.hist.forEach((h, i) => { ult[h.k] = { qtd: h.qtd, i } })
    const fila = el('ul', { className: 'du-fila' }, ...L.ordem.map(k => {
      const u = ult[k], vez = L.vez === k, tem = L.lance?.key === k, passou = !L.ativos.includes(k)
      const plq = u?.qtd ? el('span', { className: 'du-plq' + (tem ? ' top' : '') + (novo(`${base}:p${u.i}`) ? ' entra' : '') }, el('b', { textContent: u.qtd }))
        : passou ? el('span', { className: 'du-carimbo' + (novo(`${base}:x:${k}`) ? ' entra' : ''), textContent: 'passou' }) : el('span', { className: 'du-plq du-plq--vazia' })
      return el('li', { className: 'du-licitante' + (vez ? ' vez' : '') + (tem ? ' tem' : '') + (passou ? ' passou' : '') + (k === me.key ? ' eu' : ''), 'data-key': k },
        plq, retrato(k), el('b', { textContent: N(k) }), el('small', { textContent: vez ? 'pensando…' : tem ? 'maior lance' : passou ? 'fora do lote' : u ? `disse ${u.qtd}` : 'esperando' }))
    }))
    let ctl
    if (L.vez === me.key) {
      const min = (L.lance?.qtd || 0) + 1
      const chave = `${base}:${L.hist.length}`
      if (lanceChave !== chave) { lanceChave = chave; lanceSel = min }
      lanceSel = Math.max(min, Math.min(MAX_LANCE, lanceSel))
      const num = el('b', { className: 'du-passo-n', textContent: lanceSel })
      const ajusta = d => { lanceSel = Math.max(min, Math.min(MAX_LANCE, lanceSel + d)); num.textContent = lanceSel; menos.disabled = lanceSel <= min; dar.querySelector('span').textContent = `Dar lance de ${lanceSel}`; som('tique', 0, .6) }
      const menos = botao(icon('chevron-left'), () => ajusta(-1), 'du-btn--ic du-btn--grande', 'Menos um')
      menos.disabled = lanceSel <= min
      const dar = botao([martelo(), el('span', { textContent: `Dar lance de ${lanceSel}` })], () => manda({ op: 'lance', qtd: lanceSel }), 'du-btn--forte du-btn--grande')
      const podePassar = !(L.ativos.length === 1 && !L.lance)
      ctl = el('div', { className: 'du-vez' + (novo(`vez:${chave}`) ? ' entra' : '') },
        el('small', { className: 'du-vez__k', textContent: L.lance ? `Sua vez: cubra o ${L.lance.qtd}` : 'Sua vez: abra o leilão' }),
        el('div', { className: 'du-stepper' }, menos, num, botao(icon('chevron-right'), () => ajusta(1), 'du-btn--ic du-btn--grande', 'Mais um'),
          botao('+5', () => ajusta(5), 'du-btn--leve', 'Mais cinco')),
        el('div', { className: 'du-linha' }, dar, podePassar ? botao('Passo', () => manda({ op: 'passa' }), 'du-btn--leve du-btn--grande', 'Sai deste lote') : el('small', { className: 'du-nota', textContent: 'Todos passaram: alguém tem que dar um lance.' })))
    } else ctl = el('p', { className: 'du-aguarda' }, retrato(L.vez), el('span', {}, el('b', { textContent: N(L.vez) }), L.lance ? ` vai cobrir o ${L.lance.qtd} ou passar…` : ' abre o leilão…'))
    return el('div', { className: 'du-leilao' }, fila, ctl)
  }
  // a hora da verdade: quem arrematou cita em voz alta e a call conta
  function lista() {
    const l = V.lista, souEu = l.key === me.key
    const slots = el('div', { className: 'du-slots', style: `--qtd:${l.qtd}` }, ...Array.from({ length: l.qtd }, (_, i) => {
      const ok = i < l.ok
      return el('i', { className: 'du-slot' + (ok ? ' ok' : '') + (ok && novo(`slot:${V.id}:${V.lote}:${i}:${l.ok > i}`) ? ' entra' : '') }, ok ? icon('thumbs-up') : el('span', { textContent: i + 1 }))
    }))
    const quem = l.ult ? el('small', { className: 'du-ult', textContent: `${l.ult.d > 0 ? '+1' : '−1'} de ${N(l.ult.key)}` }) : el('small', { className: 'du-ult', textContent: souEu ? 'A call vai contando enquanto você fala' : 'Conte cada item que valeu' })
    const falando = ctx.falando(l.key)
    const ctl = !souEu || souHost()
      ? el('div', { className: 'du-linha du-conta' },
        botao([icon('thumbs-up'), el('span', { textContent: 'Valeu! +1' })], () => manda({ op: 'conta', delta: 1 }), 'du-btn--verde du-btn--enorme', 'Esse item vale'),
        botao('−1', () => manda({ op: 'conta', delta: -1 }), 'du-btn--leve', 'Tirar um (contaram a mais)'),
        souHost() || souEu ? botao('Não conseguiu', () => manda({ op: 'desiste' }), 'du-btn--leve du-btn--perigo', 'Encerra: os outros ganham') : '')
      : el('div', { className: 'du-linha du-conta' }, el('p', { className: 'du-fala', textContent: 'Fale os itens em voz alta!' }), botao('Não consigo mais', () => manda({ op: 'desiste' }), 'du-btn--leve du-btn--perigo', 'Os outros ganham'))
    return el('div', { className: 'du-lista' },
      el('div', { className: 'du-lista__quem' + (falando ? ' fala' : '') }, retrato(l.key, 'du-foto--grande'),
        el('span', {}, el('b', { textContent: souEu ? 'Sua vez de citar' : `${N(l.key)} está citando` }), el('small', { textContent: `${l.ok} de ${l.qtd}` }))),
      slots, quem, ctl)
  }
  function resultado() {
    const r = V.res, j = V.js.find(x => x.key === r.key)
    const carimbo = el('div', { className: 'du-res' + (r.ganhou ? ' ganhou' : ' micou') + (novo(`res:${V.id}:${V.lote}`) ? ' entra' : '') },
      el('span', { className: 'du-res__selo', textContent: r.cancelado ? 'Cancelado' : r.ganhou ? 'Arrematou!' : 'Micou!' }),
      el('p', {}, r.cancelado ? `${j?.nome || 'Quem arrematou'} saiu da mesa. Próximo lote.` : r.ganhou ? `${N(r.key)} citou ${r.qtd} e leva +${PTS_GANHA}.` : `${N(r.key)} parou em ${r.ok} de ${r.qtd}. Os outros ganham +${PTS_MICO}.`))
    const pode = souHost() || r.key === me.key
    const max = Math.max(...V.js.map(x => x.pontos))
    return el('div', { className: 'du-resultado' }, carimbo,
      pode ? botao(max >= V.op.meta ? 'Ver quem levou' : 'Próximo lote', () => manda({ op: 'proximo' }), 'du-btn--forte du-btn--grande') : el('small', { className: 'du-espera', textContent: `${N(r.key)} ou ${V.hostNome} chama o próximo lote` }))
  }
  function fim() {
    const ord = V.js.slice().sort((a, b) => b.pontos - a.pontos)
    return el('div', { className: 'du-fim' },
      martelo('du-martelo--grande'),
      el('b', { className: 'du-fim__t', textContent: V.vencedor?.length ? `${V.vencedor.map(N).join(' e ')} ${V.vencedor.length > 1 ? 'levaram' : 'levou'}!` : 'Fim do leilão' }),
      el('ol', { className: 'du-podio' }, ...ord.map((j, i) => el('li', { className: V.vencedor?.includes(j.key) ? 'top' : '' }, el('i', { textContent: `${i + 1}º` }), retrato(j.key), el('b', { textContent: j.nome }), el('em', { textContent: j.pontos })))),
      souHost() ? el('div', { className: 'du-linha' }, botao('Nova partida', revanche, 'du-btn--forte du-btn--grande'), botao('Fechar', encerrar, 'du-btn--leve')) : el('small', { className: 'du-espera', textContent: `${V.hostNome} decide se tem revanche` }))
  }

  // "Dou-lhe uma… dou-lhe duas… VENDIDO!"
  function vendidoFx(e) {
    const n = el('div', { className: 'du-vendido' },
      el('span', { className: 'du-vendido__a', textContent: 'Dou-lhe uma…' }),
      el('span', { className: 'du-vendido__b', textContent: 'dou-lhe duas…' }),
      el('span', { className: 'du-vendido__c' }, martelo(), el('b', { textContent: 'Vendido!' }), el('small', { textContent: `${N(e.key)} · ${e.qtd} ${e.qtd === 1 ? 'item' : 'itens'}` })))
    fx = { el: n, ate: Date.now() + 2900 }
    som('tique', 0); som('tique', 650); som('carimbo', 1300); som('leque', 1500, .6)
    setTimeout(() => { if (fx?.el === n) { n.remove(); fx = null } }, 2900)
  }
  function anima(evs) {
    for (const e of evs) {
      if (e.t === 'inicio') som('embaralhar')
      else if (e.t === 'lote') { som('papel', 200); if (e.quem === me.key) som('vez', 600) }
      else if (e.t === 'troca') som('papel')
      else if (e.t === 'lance') som('poe')
      else if (e.t === 'passou') som('desliza', 0, .7)
      else if (e.t === 'vendido') vendidoFx(e)
      else if (e.t === 'valeu') som('poe', 0, .8)
      else if (e.t === 'tirou') som('desliza', 0, .6)
      else if (e.t === 'arrematou') { som('carimbo'); som('leque', 250) }
      else if (e.t === 'micou') som('carimbo', 0, .8)
      else if (e.t === 'fim') som('leque', 300)
      else if (e.t === 'saiu') toast(`${e.nome} saiu da mesa`, 3200)
    }
    // na minha vez de dar lance, aviso sonoro
    if (V?.fase === 'lance' && V.lei.vez === me.key && novo(`minhavez:${V.id}:${V.lote}:${V.lei.hist.length}`) && !evs.some(e => e.t === 'lote')) som('vez', 300)
  }
  // quem caiu fica apagado; quem está falando acende (na hora de citar)
  ;(function loop() {
    if (V) {
      const pres = new Set(ctx.presentes())
      for (const s of tela.querySelectorAll('[data-key]')) s.classList.toggle('caiu', !pres.has(s.dataset.key))
      const q = tela.querySelector('.du-lista__quem')
      if (q && V.lista) q.classList.toggle('fala', !!ctx.falando(V.lista.key))
    }
    setTimeout(loop, 400)
  })()

  function iniciar(chamados) {
    carregaSons()
    if (V && !souHost()) return toast(`Já tem uma mesa aberta (de ${V.hostNome})`)
    if (G) return toast('A mesa já está aberta')
    abrir(chamados)
  }
  window.__du = () => ({ G, V, difunde })
  return {
    got: (d, k) => { carregaSons(); got(d, k) }, iniciar, ativo: () => !!V,
    lider: () => !!V && souHost(),
    encerra: () => { if (G && G.host === me.key) encerrar() },
    sair: () => { if (!V) return; if (G && G.host === me.key) return encerrar(); manda({ op: 'sai' }); dispensado = V.id; aplica(null) },
    jogadores: () => !V ? [] : V.fase === 'convite' || !V.js?.length ? Object.keys(V.conv || {}).filter(k => V.conv[k] === 'sim') : V.js.map(j => j.key),
    entrouAlguem: key => { if (!G || G.host !== me.key) return; if (G.fase === 'convite' && !(key in G.conv)) { G.conv[key] = '?'; return difunde() } ctx.sendTo(key, { du: { v: vista() } }) },
  }
}
