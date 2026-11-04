// Red Flags: a cada rodada alguém é o solteiro. Os outros montam um pretendente com 2 qualidades,
// depois cada um estraga o pretendente do vizinho com 1 defeito. O solteiro escolhe com quem sairia: 1 ponto.
// Mesma estrutura dos outros jogos: o host guarda tudo e manda para cada um só o que pode ver ({ pp: ... }).
import { QUALIDADES, DEFEITOS } from './jogos/parperfeito/cartas.js'

const SOM = n => `jogos/coup/sons/${n}.mp3`
const SONS = ['embaralhar', 'desliza1', 'desliza2', 'desliza3', 'poe1', 'poe2', 'leque', 'carimbo', 'papel', 'vez', 'clique']
const VOL = { embaralhar: .5, carimbo: .6, papel: .45, vez: .5, clique: .3 }
const MAO_Q = 4, MAO_D = 3
const SAIU_MS = 12000, HOST_MS = 10000
const BRANCO = '___'
// ícones desenhados (o caractere ♥ da fonte fica torto no centro das cartas)
const ICONE = {
  q: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 20.6s-7.4-4.5-9.4-9C1.1 8.3 2.9 4.6 6.6 4.6c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.7 0 5.5 3.7 4 7-2 4.5-9.4 9-9.4 9z"/></svg>',
  d: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V3.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/><path fill="currentColor" d="M7 4h11.5l-2.8 4.2 2.8 4.3H7z"/></svg>',
}

const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n }
const embaralha = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]] } return a }
const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch {} } }
// texto da carta com o espaço preenchido
const texto = c => c.t.includes(BRANCO) ? c.t.replace(BRANCO, c.f ? c.f : '…') : c.t

export function criaParPerfeito(ctx) {
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
  let G = null, restaurou = false
  const ausDesde = new Map()
  const jog = k => G?.js.find(j => j.key === k)
  const log = t => { G.log.push(t); if (G.log.length > 60) G.log.splice(0, G.log.length - 60) }
  const ev = e => { G.ev.push({ ...e, n: ++G.evN }); if (G.ev.length > 30) G.ev.splice(0, G.ev.length - 30) }
  const solteiro = () => G.js[G.solt]?.key
  // pretendentes na ordem da mesa, começando à esquerda do solteiro
  const ordem = () => { const n = G.js.length; return Array.from({ length: n - 1 }, (_, i) => G.js[(G.solt + 1 + i) % n].key) }
  const vizinho = k => { const o = ordem(); return o[(o.indexOf(k) + 1) % o.length] } // em quem cada um coloca o defeito

  function baralho(lista, pre) { return embaralha(lista.map((t, i) => ({ id: `${pre}${i}`, t }))) }
  function compra(deck, desc, n) {
    const out = []
    for (let i = 0; i < n; i++) {
      if (!G[deck].length) { G[deck] = embaralha(G[desc]); G[desc] = [] }
      const c = G[deck].pop(); if (!c) break; out.push(c)
    }
    return out
  }
  function abrir(chamados) {
    const op = ls.get('pp.op') || {}
    const pl = ls.get('pp.placar')
    G = { id: Math.random().toString(36).slice(2, 9), host: me.key, hostNome: me.name, fase: 'convite',
      op: { fim: op.fim === 'pontos' ? 'pontos' : 'voltas', alvo: 7 },
      conv: Object.fromEntries(ctx.presentes().map(k => [k, k === me.key || chamados?.includes(k) ? 'sim' : '?'])),
      js: [], solt: 0, rodada: 0, perfis: {}, vencRodada: null, vencedor: null,
      dq: [], dd: [], descQ: [], descD: [], placar: pl && Date.now() - pl.t < 10 * 3600e3 ? pl.p : {},
      log: [], ev: [], evN: 0, seq: 0, t: Date.now() }
    sysMsg(`${me.name} abriu uma mesa de Red Flags`)
    difunde()
  }
  function comecar() {
    if (G?.fase !== 'convite') return
    const pres = new Set(ctx.presentes())
    const ks = Object.keys(G.conv).filter(k => G.conv[k] === 'sim' && pres.has(k))
    if (ks.length < 3) return toast('Precisa de pelo menos 3 pessoas.')
    ls.set('pp.op', G.op)
    embaralha(ks)
    G.dq = baralho(QUALIDADES, 'q'); G.dd = baralho(DEFEITOS, 'd'); G.descQ = []; G.descD = []
    G.js = ks.map(k => ({ key: k, nome: ctx.nomeDe(k), pontos: 0, q: [], d: [] }))
    for (const j of G.js) { j.q = compra('dq', 'descQ', MAO_Q); j.d = compra('dd', 'descD', MAO_D) }
    G.solt = rnd(ks.length); G.rodada = 1; G.log = []
    ev({ t: 'inicio' })
    sysMsg(`Red Flags começou: ${G.js.map(j => j.nome).join(', ')}`)
    novaRodada(true)
  }
  function novaRodada(primeira) {
    if (!primeira) {
      // devolve o que foi jogado, completa as mãos e passa o solteiro adiante
      for (const p of Object.values(G.perfis)) { G.descQ.push(...p.q.map(({ f, ...c }) => c)); if (p.d) { const { f, ...c } = p.d; G.descD.push(c) } }
      G.solt = (G.solt + 1) % G.js.length; G.rodada++
    }
    for (const j of G.js) { j.q.push(...compra('dq', 'descQ', MAO_Q - j.q.length)); j.d.push(...compra('dd', 'descD', MAO_D - j.d.length)) }
    G.perfis = {}; G.vencRodada = null; G.fase = 'qualidades'
    log(`Rodada ${G.rodada}: ${jog(solteiro()).nome} é o solteiro.`)
    ev({ t: 'rodada', solt: solteiro() })
    difunde()
  }
  const limpaF = f => String(f || '').replace(/\s+/g, ' ').trim().slice(0, 40)
  function poeQualidades(key, { ids, fs }) {
    const j = jog(key)
    if (G.fase !== 'qualidades' || !j || key === solteiro() || G.perfis[key] || !Array.isArray(ids) || ids.length !== 2 || ids[0] === ids[1]) return
    const cs = ids.map(id => j.q.find(c => c.id === id))
    if (cs.some(c => !c)) return
    if (cs.some(c => c.t.includes(BRANCO) && !limpaF(fs?.[c.id]))) return
    j.q = j.q.filter(c => !ids.includes(c.id))
    G.perfis[key] = { q: cs.map(c => ({ ...c, f: c.t.includes(BRANCO) ? limpaF(fs[c.id]) : undefined })), d: null, dDe: null }
    ev({ t: 'montou', key })
    if (ordem().every(k => G.perfis[k])) { G.fase = 'defeitos'; ev({ t: 'defeitos' }); log('Hora dos defeitos.') }
    difunde()
  }
  function poeDefeito(key, { carta: id, f }) {
    const j = jog(key)
    if (G.fase !== 'defeitos' || !j || key === solteiro()) return
    const alvo = vizinho(key), p = G.perfis[alvo]
    if (!p || p.d) return
    const c = j.d.find(x => x.id === id)
    if (!c || (c.t.includes(BRANCO) && !limpaF(f))) return
    j.d = j.d.filter(x => x.id !== id)
    p.d = { ...c, f: c.t.includes(BRANCO) ? limpaF(f) : undefined }; p.dDe = key
    ev({ t: 'estragou', key, alvo })
    if (ordem().every(k => G.perfis[k]?.d)) { G.fase = 'escolha'; ev({ t: 'revela' }); log(`${jog(solteiro()).nome} vai escolher.`) }
    difunde()
  }
  function escolhe(key, alvo) {
    if (G.fase !== 'escolha' || key !== solteiro() || !G.perfis[alvo]) return
    const v = jog(alvo); v.pontos++
    G.vencRodada = alvo; G.fase = 'resultado'
    ev({ t: 'match', key: alvo, solt: key })
    log(`${jog(key).nome} escolheu o pretendente de ${v.nome}.`)
    // fim: duas voltas na mesa, ou alguém chegou na meta
    const acabou = G.op.fim === 'pontos' ? v.pontos >= G.op.alvo : G.rodada >= G.js.length * 2
    if (acabou) {
      const max = Math.max(...G.js.map(j => j.pontos))
      const vs = G.js.filter(j => j.pontos === max)
      G.fase = 'fim'; G.vencedor = vs.map(j => j.key)
      for (const x of vs) G.placar[x.key] = (G.placar[x.key] || 0) + 1
      ls.set('pp.placar', { t: Date.now(), p: G.placar })
      ev({ t: 'vence', keys: G.vencedor })
      sysMsg(`💘 ${vs.map(j => j.nome).join(' e ')} ${vs.length > 1 ? 'venceram' : 'venceu'} o Red Flags`)
    }
    difunde()
  }
  function proxima(key) {
    if (G.fase !== 'resultado' || (key !== solteiro() && key !== G.host)) return
    novaRodada(false)
  }
  function revanche() {
    const ant = new Set(G.js.map(j => j.key))
    G.conv = Object.fromEntries(ctx.presentes().map(k => [k, ant.has(k) || k === me.key ? 'sim' : '?']))
    Object.assign(G, { id: Math.random().toString(36).slice(2, 9), fase: 'convite', js: [], perfis: {}, vencedor: null, vencRodada: null, log: [], ev: [], evN: 0 })
    difunde()
  }
  // alguém saiu de vez: as cartas voltam para os montes e a pessoa sai da mesa
  function remove(key) {
    if (G.fase === 'convite') { if (key in G.conv) { delete G.conv[key]; difunde() } return }
    const i = G.js.findIndex(j => j.key === key)
    if (i < 0) return
    const j = G.js[i], eraSolt = i === G.solt
    G.descQ.push(...j.q); G.descD.push(...j.d)
    const p = G.perfis[key]
    if (p) { G.descQ.push(...p.q.map(({ f, ...c }) => c)); if (p.d) { const { f, ...c } = p.d; G.descD.push(c) } delete G.perfis[key] }
    // o defeito que ela tinha colocado volta para quem ia recebê-lo; quem a ia estragar escolhe de novo
    for (const x of Object.values(G.perfis)) if (x.dDe === key && G.fase === 'defeitos') { const { f, ...c } = x.d; G.descD.push(c); x.d = null; x.dDe = null }
    G.js.splice(i, 1)
    if (i < G.solt) G.solt--
    ausDesde.delete(key)
    ev({ t: 'saiu', key, nome: j.nome }); log(`${j.nome} saiu da mesa.`); sysMsg(`${j.nome} saiu do Red Flags`)
    if (G.fase === 'fim') return difunde()
    if (G.js.length < 3) { G.fase = 'fim'; const max = Math.max(...G.js.map(x => x.pontos), 0); G.vencedor = G.js.filter(x => x.pontos === max).map(x => x.key); return difunde() }
    if (eraSolt) { G.solt = G.solt % G.js.length; for (const x of Object.values(G.perfis)) { G.descQ.push(...x.q.map(({ f, ...c }) => c)); if (x.d) { const { f, ...c } = x.d; G.descD.push(c) } } G.perfis = {}; return novaRodada(true) }
    if (G.fase === 'defeitos') {
      // refaz quem estraga quem com a mesa nova
      for (const x of Object.values(G.perfis)) if (x.d) { const { f, ...c } = x.d; G.descD.push(c); x.d = null; x.dDe = null }
    }
    if (G.fase === 'qualidades' && ordem().every(k => G.perfis[k])) G.fase = 'defeitos'
    if (G.fase === 'defeitos' && ordem().every(k => G.perfis[k]?.d)) G.fase = 'escolha'
    if (G.fase === 'resultado' && !G.perfis[G.vencRodada]) return novaRodada(false)
    difunde()
  }
  function hostRecebe(d, key) {
    if (!G || !key || d.id !== G.id) return
    switch (d.op) {
      case 'resp': if (G.fase === 'convite') { G.conv[key] = d.sim ? 'sim' : 'nao'; difunde() } break
      case 'sai': if (key !== G.host) remove(key); break // saiu para outra mesa
      case 'q': poeQualidades(key, d); break
      case 'd': poeDefeito(key, d); break
      case 'escolhe': escolhe(key, d.alvo); break
      case 'proxima': proxima(key); break
    }
  }
  function vista(k) {
    const j = jog(k), f = G.fase
    // o que cada um vê dos perfis: as qualidades só aparecem quando todo mundo montou; os defeitos, só na revelação
    const perfis = {}
    for (const [a, p] of Object.entries(G.perfis)) {
      const verQ = f !== 'qualidades' || a === k, verD = ['escolha', 'resultado', 'fim'].includes(f) || p.dDe === k
      perfis[a] = { q: verQ ? p.q : p.q.map(() => null), d: p.d ? (verD ? p.d : null) : null, temD: !!p.d, dDe: verD ? p.dDe : null }
    }
    return {
      id: G.id, seq: G.seq, host: G.host, hostNome: G.hostNome, fase: f, op: G.op, conv: G.conv, placar: G.placar,
      js: G.js.map(x => ({ key: x.key, nome: x.nome, pontos: x.pontos })), solt: G.js.length ? solteiro() : null, rodada: G.rodada,
      ordem: G.js.length ? ordem() : [], alvo: j && f === 'defeitos' && k !== solteiro() ? vizinho(k) : null,
      mao: j ? { q: j.q, d: j.d } : null, perfis, montes: { q: G.dq.length, d: G.dd.length }, vencRodada: G.vencRodada, vencedor: G.vencedor, log: G.log.slice(-30), ev: G.ev,
    }
  }
  function difunde() {
    if (!G) return
    G.seq++; G.t = Date.now()
    ls.set('pp.G', G)
    const ks = new Set([...ctx.presentes(), ...G.js.map(j => j.key), ...Object.keys(G.conv || {})])
    for (const k of ks) if (k !== me.key) ctx.sendTo(k, { pp: { v: vista(k) } })
    const pres = new Set(ctx.presentes())
    G.sucessor = G.js.map(j => j.key).find(k => k !== me.key && pres.has(k)) || [...pres].find(k => k !== me.key) || null
    if (G.sucessor) ctx.sendTo(G.sucessor, { pp: { bk: G } })
    aplica(vista(me.key))
  }
  function encerrar() {
    if (!G) return
    ctx.send({ pp: { fim: G.id } })
    ls.set('pp.G', null)
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
    sysMsg(`${nomeAntigo} caiu: ${me.name} assumiu a mesa do Red Flags`)
    remove(antigo)
    if (G) difunde()
  }
  setInterval(() => {
    if (!G && !restaurou && me.key) {
      restaurou = true
      const s = ls.get('pp.G')
      if (s && s.host === me.key && s.fase !== 'fim' && Date.now() - s.t < 3 * 3600e3) setTimeout(() => { if (G || (V && V.host !== me.key)) return ls.set('pp.G', null); G = s; difunde() }, 3000)
    }
    assumeSePreciso()
    if (!G || G.host !== me.key) return
    const pres = new Set(ctx.presentes()), agora = Date.now()
    const quem = G.fase === 'convite' ? Object.keys(G.conv).filter(k => k !== me.key) : G.js.map(j => j.key).filter(k => k !== me.key)
    for (const k of quem) { if (pres.has(k)) ausDesde.delete(k); else if (!ausDesde.has(k)) ausDesde.set(k, agora) }
    for (const [k, t] of ausDesde) if (agora - t > SAIU_MS) return remove(k)
  }, 1500)

  /* =================================================================== cliente */
  let V = null, ultEv = 0, dispensado = '', selQ = [], selD = null, fills = {}
  const vistos = new Set()
  const novo = id => { if (vistos.has(id)) return false; vistos.add(id); return true }
  const souHost = () => V && V.host === me.key
  const eu = () => V?.js.find(j => j.key === me.key)
  const N = k => k === me.key ? 'Você' : (V?.js.find(j => j.key === k)?.nome || ctx.nomeDe(k))
  function manda(d) {
    if (!V) return
    const m = { id: V.id, ...d }
    if (souHost()) hostRecebe(m, me.key)
    else ctx.sendTo(V.host, { pp: { op: m } })
  }
  function got(d, deKey) {
    if (!d) return
    if (d.op) { if (G && G.host === me.key) hostRecebe(d.op, deKey); return }
    if (d.fim) { if (V?.id === d.fim) aplica(null); return }
    if (d.bk) { if (d.bk.host === deKey) backup = d.bk; return }
    if (d.v) {
      if (G && d.v.id === G.id && d.v.host !== me.key) { G = null; ls.set('pp.G', null) }
      if (d.v.id === dispensado) return
      if (V && d.v.id === V.id && d.v.seq <= V.seq) return
      if (ctx.outroJogo?.()) return
      aplica(d.v)
    }
  }
  function aplica(v) {
    const antes = V
    if (v && (!antes || antes.id !== v.id)) { ultEv = Math.max(0, ...v.ev.map(e => e.n)); selQ = []; selD = null; fills = {} }
    V = v
    if (antes?.rodada !== v?.rodada || antes?.fase !== v?.fase) { selQ = []; selD = null; fills = {} }
    const evs = v ? v.ev.filter(e => e.n > ultEv) : []
    if (v) ultEv = Math.max(ultEv, ...v.ev.map(e => e.n))
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
  const botao = (conteudo, fn, cls = '', title = '') => { const b = el('button', { type: 'button', className: `pp-btn ${cls}`, title }); b.append(...[conteudo].flat()); b.addEventListener('click', e => { e.stopPropagation(); b.blur(); som('clique'); fn(e) }); return b }
  const retrato = (k, nm, cls = '') => el('span', { className: `pp-foto ${cls}` }, ctx.pfp(k, 64, nm))
  const ico = (tipo, cls) => { const s = el('span', { className: cls }); s.innerHTML = ICONE[tipo]; return s }
  // carta: branca (qualidade) ou vermelha (defeito). Com espaço em branco, mostra o campo para preencher.
  function carta(c, tipo, { sel, onClick, editavel, cls = '' } = {}) {
    if (!c) return el('div', { className: `pp-carta pp-carta--${tipo} costas ${cls}` }, ico(tipo, 'pp-carta__marca'))
    const n = el('div', { className: `pp-carta pp-carta--${tipo}${sel ? ' sel' : ''}${onClick ? ' clicavel' : ''} ${cls}`, 'data-id': c.id },
      ico(tipo, 'pp-carta__tipo'))
    if (editavel && c.t.includes(BRANCO)) {
      const [a, b] = c.t.split(BRANCO)
      const inp = el('input', { className: 'pp-branco', value: fills[c.id] || '', placeholder: 'complete', maxLength: 40, spellcheck: false })
      inp.addEventListener('click', e => e.stopPropagation())
      inp.addEventListener('input', () => { fills[c.id] = inp.value; atualizaBotoes() })
      n.append(el('span', { className: 'pp-carta__txt' }, a, inp, b))
      setTimeout(() => { if (sel && !inp.value) inp.focus() }, 30)
    } else n.append(el('span', { className: 'pp-carta__txt', textContent: texto(c) }))
    if (onClick) n.addEventListener('click', onClick)
    return n
  }

  /* ---------- render ---------- */
  function render() {
    tela.classList.toggle('pp--on', !!V)
    ctx.onAtivo?.(!!V)
    if (!V) { tela.replaceChildren(); vistos.clear(); return }
    const topo = el('header', { className: 'pp-topo' },
      el('span', { className: 'pp-logo' }, el('img', { className: 'pp-logo__arte', src: 'jogos/parperfeito/verso-vermelho.png', alt: '' }), el('b', { textContent: 'Red Flags' })),
      V.fase !== 'convite' ? el('span', { className: 'pp-rodada', textContent: `rodada ${V.rodada}${V.op.fim === 'voltas' ? ` de ${V.js.length * 2}` : ` · até ${V.op.alvo} pontos`}` }) : '',
      el('span', { className: 'pp-grow' }),
      V.fase !== 'convite' ? placar() : '',
      souHost() ? botao(icon('x'), e => confirma(e.currentTarget, 'Fechar a mesa?', encerrar), 'pp-btn--ic', 'Fechar a mesa para todos')
        : botao(icon('x'), () => { dispensado = V.id; aplica(null) }, 'pp-btn--ic', 'Sair da mesa (só para você)'))
    let corpo
    if (V.fase === 'convite') corpo = convite()
    else if (V.fase === 'fim') corpo = fim()
    else corpo = mesa()
    // quem está digitando num espaço em branco não perde o cursor quando outra pessoa joga
    const ativo = document.activeElement?.classList?.contains('pp-branco') ? document.activeElement : null
    const foco = ativo && { id: ativo.closest('.pp-carta')?.dataset.id, ini: ativo.selectionStart, fim: ativo.selectionEnd }
    tela.replaceChildren(topo, corpo, bilhete())
    ctx.hydrate(tela)
    atualizaBotoes()
    fazVoo()
    if (foco?.id) { const i = tela.querySelector(`.pp-carta[data-id="${foco.id}"] .pp-branco`); if (i) { i.focus(); try { i.setSelectionRange(foco.ini, foco.fim) } catch {} } }
  }
  function confirma(btn, txt, fn) {
    if (btn.dataset.conf) return fn()
    btn.dataset.conf = '1'; btn.classList.add('confirma')
    const tip = el('span', { className: 'pp-tip', textContent: `${txt} Clique de novo.` }); btn.append(tip)
    setTimeout(() => { delete btn.dataset.conf; btn.classList.remove('confirma'); tip.remove() }, 2600)
  }
  function placar() {
    return el('div', { className: 'pp-placar' }, ...V.js.slice().sort((a, b) => b.pontos - a.pontos).map(j => el('span', { className: 'pp-placar__p' + (j.key === V.solt ? ' solt' : ''), title: `${j.nome}: ${j.pontos} ponto${j.pontos === 1 ? '' : 's'}` }, retrato(j.key, j.nome), el('b', { textContent: j.pontos }))))
  }

  // página inicial: tutorial em 3 quadrinhos animados, quase sem texto
  function convite() {
    const host = souHost()
    const n = Object.entries(V.conv).filter(([k, v]) => v === 'sim' && ctx.presentes().includes(k)).length
    // tutorial: três quadros com cartinhas no mesmo estilo do jogo, animadas em loop
    const tc = (tipo, cls = '') => el('i', { className: `pp-tc pp-tc--${tipo} ${cls}` }, ico(tipo, 'pp-tc__ic'), el('b'), el('b'), el('b'))
    const quadro = (num, cena, rotulo) => el('div', { className: 'pp-passo', style: `--d:${num * 120}ms` }, el('div', { className: `pp-cena pp-cena--${num}` }, ...cena), el('span', { className: 'pp-passo__rot' }, el('em', { textContent: num }), rotulo))
    const tutorial = el('div', { className: 'pp-tutorial' },
      quadro(1, [el('i', { className: 'pp-tc pp-tc--slot s1' }), el('i', { className: 'pp-tc pp-tc--slot s2' }), tc('q', 'm1'), tc('q', 'm2'), tc('q', 'm3')], 'Monte um par'),
      quadro(2, [tc('q', 'p1'), tc('q', 'p2'), tc('d', 'v')], 'Estrague o do vizinho'),
      quadro(3, [el('span', { className: 'pp-mini-pilha a' }, tc('q'), tc('q'), tc('d')), el('span', { className: 'pp-mini-pilha b' }, tc('q'), tc('q'), tc('d')), ico('q', 'pp-cena__coracao')], 'O solteiro escolhe'))
    const fimOp = el('div', { className: 'pp-seg' }, ...[['voltas', 'duas voltas'], ['pontos', 'até 7 pontos']].map(([k, t]) => host
      ? botao(t, () => { G.op.fim = k; difunde() }, V.op.fim === k ? 'on' : '')
      : el('span', { className: V.op.fim === k ? 'on' : '', textContent: t })))
    const pessoas = el('div', { className: 'pp-pessoas' }, ...Object.entries(V.conv).map(([k, v]) => el('span', { className: `pp-pessoa pp-pessoa--${v}`, title: v === 'sim' ? 'vai jogar' : v === 'nao' ? 'só assiste' : 'decidindo' }, retrato(k, ctx.nomeDe(k)), el('small', { textContent: k === me.key ? 'você' : ctx.nomeDe(k) }))))
    const ir = host ? botao(n >= 3 ? `Começar · ${n}` : `Precisa de 3 · ${n}`, comecar, 'pp-btn--forte pp-btn--grande') : el('small', { className: 'pp-espera', textContent: `${V.hostNome} vai começar` })
    if (host && n < 3) ir.disabled = true
    return el('div', { className: 'pp-inicio' }, tutorial,
      el('p', { className: 'pp-ponto' }, ico('q', 'pp-ponto__ic'), ' escolhido = 1 ponto'),
      pessoas, el('div', { className: 'pp-linha' }, fimOp, host ? botao(V.conv[me.key] === 'sim' ? 'Eu jogo' : 'Eu só assisto', () => { G.conv[me.key] = G.conv[me.key] === 'sim' ? 'nao' : 'sim'; difunde() }, 'pp-btn--leve') : '', ir))
  }
  function bilhete() {
    if (V.fase !== 'convite' || souHost() || V.conv[me.key] !== '?') return ''
    if (novo('conv:' + V.id)) som('papel')
    return el('div', { className: 'pp-bilhete' },
      el('div', { className: 'pp-linha' }, retrato(V.host, V.hostNome), el('span', {}, el('b', { textContent: V.hostNome }), ' chamou você para o Red Flags')),
      el('div', { className: 'pp-linha' }, botao('Jogar', () => manda({ op: 'resp', sim: true }), 'pp-btn--forte'), botao('Só assistir', () => manda({ op: 'resp', sim: false }), 'pp-btn--leve')))
  }

  // a mesa: o solteiro no alto, os pretendentes no meio, a sua mão embaixo
  function mesa() {
    const f = V.fase, solt = V.solt, souSolt = solt === me.key, j = eu()
    const cab = el('div', { className: 'pp-solteiro' }, retrato(solt, N(solt), 'pp-foto--grande'),
      el('div', {}, el('small', { textContent: souSolt ? 'você é' : 'solteiro(a) da vez' }), el('b', { textContent: souSolt ? 'o(a) solteiro(a)' : N(solt) })),
      el('span', { className: 'pp-fase', textContent: { qualidades: 'montando os pretendentes', defeitos: 'colocando os defeitos', escolha: souSolt ? 'escolha com quem sairia' : 'o solteiro está escolhendo', resultado: 'temos um par!' }[f] || '' }))
    const perfis = el('div', { className: 'pp-perfis' + (V.ordem.length > 5 ? ' muitos' : ''), style: `--n:${V.ordem.length}` }, ...V.ordem.map((k, i) => perfil(k, i)))
    return el('div', { className: `pp-mesa fase-${f}` }, montes(), cab, perfis, j && !souSolt ? minhaMao() : el('div', { className: 'pp-mao pp-mao--vazia' }, souSolt ? el('span', {}, 'Leia os pretendentes em voz alta e escolha um ', el('i', { textContent: '♥' })) : el('span', { textContent: 'assistindo' })))
  }
  // os dois montes: brancas (qualidades) e vermelhas (defeitos)
  function montes() {
    const monte = (tipo, n) => el('div', { className: `pp-monte pp-monte--${tipo}`, 'data-monte': tipo, title: `${tipo === 'q' ? 'Qualidades' : 'Defeitos'}: ${n} cartas` },
      ...Array.from({ length: Math.max(1, Math.min(6, Math.ceil(n / 12))) }, (_, i) => { const c = carta(null, tipo, { cls: 'monte' }); c.style.setProperty('--i', i); return c }),
      el('small', { textContent: n }))
    return el('div', { className: 'pp-montes' }, monte('q', V.montes?.q ?? 0), monte('d', V.montes?.d ?? 0))
  }
  // cada pretendente é uma pilha de cartas de verdade: duas qualidades e o defeito por cima, em cascata para ler rápido
  function perfil(k, i) {
    const p = V.perfis[k], f = V.fase
    const venc = V.vencRodada === k, escolhivel = f === 'escolha' && V.solt === me.key
    const alvoMeu = V.alvo === k
    const status = !p ? (f === 'qualidades' ? 'montando…' : '') : f === 'defeitos' && !p.temD ? (alvoMeu ? 'você estraga este' : 'esperando o defeito…') : ''
    const chega = id => novo(`c:${V.id}:${V.rodada}:${k}:${id}`) ? ' chega' : ''
    const cartas = p ? p.q.map((c, n) => c ? carta(c, 'q', { cls: 'pilha' + chega(c.id) }) : carta(null, 'q', { cls: 'pilha' + chega('q' + n) })) : [el('div', { className: 'pp-carta pilha slot' }), el('div', { className: 'pp-carta pilha slot' })]
    cartas.push(p?.d ? carta(p.d, 'd', { cls: 'pilha' + (f === 'escolha' && novo(`rev:${V.id}:${V.rodada}:${k}`) ? ' revela' : chega(p.d.id)) }) : p?.temD ? carta(null, 'd', { cls: 'pilha' + chega('d') }) : el('div', { className: 'pp-carta pp-carta--d pilha slot' }))
    const n = el('div', { className: 'pp-pilha' + (venc ? ' venceu' : '') + (escolhivel ? ' escolhivel' : '') + (alvoMeu ? ' alvo' : '') + (f === 'resultado' && !venc ? ' perdeu' : ''), style: `--i:${i}`, 'data-key': k },
      el('div', { className: 'pp-pilha__dono' }, retrato(k, N(k)), el('b', { textContent: N(k) })),
      el('div', { className: 'pp-pilha__cartas' }, ...cartas),
      status ? el('small', { className: 'pp-pilha__st', textContent: status }) : p?.dDe && p.d ? el('small', { className: 'pp-pilha__por', textContent: `defeito por ${N(p.dDe)}` }) : '',
      venc ? el('span', { className: 'pp-match' }, ico('q', 'pp-match__ic'), 'match') : '')
    if (escolhivel) n.addEventListener('click', () => { som('carimbo'); manda({ op: 'escolhe', alvo: k }) })
    return n
  }
  function minhaMao() {
    const f = V.fase, mao = V.mao, meu = V.perfis[me.key]
    const linha = el('div', { className: 'pp-mao' })
    if (f === 'qualidades' && !meu) {
      linha.append(el('div', { className: 'pp-mao__cartas' }, ...mao.q.map(c => carta(c, 'q', { sel: selQ.includes(c.id), editavel: selQ.includes(c.id), onClick: () => { selQ = selQ.includes(c.id) ? selQ.filter(x => x !== c.id) : [...selQ, c.id].slice(-2); som('poe', 0, .5); render() } }))),
        el('div', { className: 'pp-mao__acao' }, el('small', { className: 'pp-dica', textContent: 'escolha 2' }), botao('Montar', () => { guardaVoo(selQ); manda({ op: 'q', ids: selQ, fs: fills }) }, 'pp-btn--forte pp-ok')))
    } else if (f === 'defeitos' && V.alvo && !V.perfis[V.alvo]?.temD) {
      linha.append(el('div', { className: 'pp-mao__cartas' }, ...mao.d.map(c => carta(c, 'd', { sel: selD === c.id, editavel: selD === c.id, onClick: () => { selD = selD === c.id ? null : c.id; som('poe', 0, .5); render() } }))),
        el('div', { className: 'pp-mao__acao' }, el('small', { className: 'pp-dica' }, '⚑ no par de ', el('b', { textContent: N(V.alvo) })), botao('Estragar', () => { guardaVoo([selD]); manda({ op: 'd', carta: selD, f: fills[selD] }) }, 'pp-btn--vermelho pp-ok')))
    } else {
      linha.classList.add('pp-mao--espera')
      linha.append(el('div', { className: 'pp-mao__cartas pp-mao__cartas--quieta' }, ...mao.q.map(c => carta(c, 'q', { cls: 'quieta' })), ...mao.d.map(c => carta(c, 'd', { cls: 'quieta' }))),
        f === 'resultado' && (V.solt === me.key || souHost()) ? el('div', { className: 'pp-mao__acao' }, botao('Próxima rodada', () => manda({ op: 'proxima' }), 'pp-btn--forte')) : '')
    }
    return linha
  }
  // as cartas escolhidas voam da mão até a pilha no meio da mesa
  let voo = null
  function guardaVoo(ids) {
    const rects = new Map()
    for (const id of ids) { const n = tela.querySelector(`.pp-mao .pp-carta[data-id="${id}"]`); if (n) rects.set(id, n.getBoundingClientRect()) }
    voo = { rects, ate: Date.now() + 3000 }
    som('desliza')
  }
  function fazVoo() {
    if (!voo || Date.now() > voo.ate) { voo = null; return }
    let fez = false
    voo.rects.forEach((r, id) => {
      const n = tela.querySelector(`.pp-pilha .pp-carta[data-id="${id}"]`)
      if (!n) return
      const b = n.getBoundingClientRect()
      n.classList.remove('chega')
      n.animate([{ transform: `translate(${r.left - b.left}px, ${r.top - b.top}px) scale(${r.width / b.width})`, opacity: 1 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.2,.75,.25,1)' })
      voo.rects.delete(id); fez = true
    })
    if (fez) som('poe', 380, .7)
    if (!voo.rects.size) voo = null
  }
  function atualizaBotoes() {
    const ok = tela.querySelector('.pp-ok')
    if (!ok || !V?.mao) return
    if (V.fase === 'qualidades') ok.disabled = selQ.length !== 2 || selQ.some(id => { const c = V.mao.q.find(x => x.id === id); return c?.t.includes(BRANCO) && !String(fills[id] || '').trim() })
    else if (V.fase === 'defeitos') { const c = V.mao.d.find(x => x.id === selD); ok.disabled = !c || (c.t.includes(BRANCO) && !String(fills[selD] || '').trim()) }
  }
  function fim() {
    const vs = V.vencedor || []
    const r = V.js.slice().sort((a, b) => b.pontos - a.pontos)
    return el('div', { className: 'pp-fim' },
      el('div', { className: 'pp-fim__fotos' }, ...vs.map(k => retrato(k, N(k), 'pp-foto--grande'))),
      el('b', { className: 'pp-fim__t', textContent: vs.includes(me.key) ? 'Você é o par perfeito' : `${vs.map(N).join(' e ')} ${vs.length > 1 ? 'empataram' : 'venceu'}` }),
      el('ol', { className: 'pp-fim__lista' }, ...r.map(j => el('li', {}, retrato(j.key, j.nome), el('span', { textContent: j.nome }), el('b', { textContent: `${j.pontos} ♥` })))),
      souHost() ? el('div', { className: 'pp-linha' }, botao('Nova partida', revanche, 'pp-btn--forte'), botao('Fechar', encerrar, 'pp-btn--leve')) : '')
  }

  /* ---------- animações ---------- */
  // cartas que chegaram na sua mão saem voando do monte certo
  function distribui(novas, atraso = 0) {
    novas.forEach((id, k) => {
      const n = tela.querySelector(`.pp-mao .pp-carta[data-id="${id}"]`)
      const tipo = id[0] === 'd' ? 'd' : 'q'
      const m = tela.querySelector(`.pp-monte[data-monte="${tipo}"]`)
      if (!n || !m) return
      n.style.opacity = '0'
      setTimeout(() => {
        const a = m.getBoundingClientRect(), b = n.getBoundingClientRect()
        n.style.opacity = ''
        n.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}) rotate(-8deg)` }, { transform: 'none' }], { duration: 460, easing: 'cubic-bezier(.2,.75,.25,1)' })
        som('desliza', 0, .6)
      }, atraso + k * 120)
    })
  }
  function embaralha2() {
    tela.querySelectorAll('.pp-monte').forEach(m => { m.classList.remove('embaralhando'); void m.offsetWidth; m.classList.add('embaralhando') })
    som('embaralhar')
  }
  function anima(evs, antes) {
    let t = 0
    const idsAntes = new Set([...(antes?.mao?.q || []), ...(antes?.mao?.d || [])].map(c => c.id))
    const novas = V.mao ? [...V.mao.q, ...V.mao.d].map(c => c.id).filter(id => !idsAntes.has(id)) : []
    if (evs.some(e => e.t === 'inicio')) { embaralha2(); distribui(novas, 1300); t += 1300 }
    else if (antes && antes.id === V.id && novas.length) distribui(novas, 200)
    for (const e of evs) {
      const at = t
      if (e.t === 'inicio') { }
      else if (e.t === 'rodada') { som('leque', at); if (e.solt === me.key) som('vez', at + 400) }
      else if (e.t === 'montou' || e.t === 'estragou') som(e.t === 'estragou' ? 'poe' : 'desliza', at, .7)
      else if (e.t === 'revela') { tela.querySelectorAll('.pp-carta.revela').forEach((n, i) => { n.style.animationDelay = `${i * 500}ms`; som('poe', i * 500, .8) }) }
      else if (e.t === 'match') { som('carimbo', at); som('leque', at + 250) }
      else if (e.t === 'vence') som('leque', at + 300)
      else if (e.t === 'saiu') toast(`${e.nome} saiu da mesa`, 3200)
    }
  }
  ;(function loop() {
    if (V) { const pres = new Set(ctx.presentes()); for (const s of tela.querySelectorAll('.pp-perfil[data-key]')) s.classList.toggle('caiu', !pres.has(s.dataset.key)) }
    setTimeout(loop, 1000)
  })()

  function iniciar(chamados) {
    carregaSons()
    if (V && !souHost()) return toast(`Já tem uma mesa aberta (de ${V.hostNome})`)
    if (G) return toast('A mesa já está aberta')
    abrir(chamados)
  }
  window.__pp = () => ({ G, V, difunde })
  return {
    got: (d, k) => { carregaSons(); got(d, k) }, iniciar, ativo: () => !!V,
    // para o app: troca de jogo e mesas paralelas
    lider: () => !!V && souHost(),
    encerra: () => { if (G && G.host === me.key) encerrar() },
    sair: () => { if (!V) return; if (G && G.host === me.key) return encerrar(); manda({ op: 'sai' }); dispensado = V.id; aplica(null) },
    jogadores: () => !V ? [] : V.fase === 'convite' || !V.js?.length ? Object.keys(V.conv || {}).filter(k => V.conv[k] === 'sim') : V.js.filter(j => !j.fora).map(j => j.key),
    entrouAlguem: key => { if (!G || G.host !== me.key) return; if (G.fase === 'convite' && !(key in G.conv)) { G.conv[key] = '?'; return difunde() } ctx.sendTo(key, { pp: { v: vista(key) } }) },
  }
}
