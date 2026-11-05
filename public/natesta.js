// Na Testa: cada um tem um post-it na testa (um famoso, personagem, bicho ou coisa) que todo mundo vê, menos a própria pessoa.
// Na sua vez, pergunte em voz alta algo de sim ou não ("eu sou um bicho?"). Os outros respondem nos botões. Se a maioria
// disser não, a vez passa. Quando achar que sabe, chute: acertou, ganha pontos pela ordem (3, 2, 1). Errou, a vez passa.
// Mesma estrutura dos outros jogos: o host guarda tudo e manda para cada um só o que pode ver ({ nt: ... }).
import { CATEGORIAS } from './jogos/natesta/nomes.js'

const SOM = n => `jogos/coup/sons/${n}.mp3`
const SONS = ['embaralhar', 'desliza1', 'desliza2', 'desliza3', 'poe1', 'poe2', 'leque', 'carimbo', 'papel', 'vez', 'clique', 'tique']
const VOL = { embaralhar: .5, carimbo: .6, papel: .5, vez: .5, clique: .3, tique: .3 }
const SAIU_MS = 12000, HOST_MS = 10000, MIN_JOG = 2
const PTS = [3, 2, 1] // pela ordem de quem acerta
const CORES = ['#ffe66d', '#ff9ebb', '#9fe3ff', '#b6f28f', '#ffc285', '#d5b8ff']
const RESP = { s: 'Sim', n: 'Não', t: 'Talvez' }

const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n }
const embaralha = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]] } return a }
const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch {} } }
// conferir o chute: sem acento, sem pontuação, tolerando erro de digitação
const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^(eu sou |sou |e o |e a |o |a |um |uma )+/, '').replace(/[^a-z0-9]+/g, ' ').trim()
function dist(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 1; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[m][n]
}
const bate = (chute, nomes) => { const p = norm(chute); if (p.length < 2) return false; return nomes.some(x => { const t = norm(x); return p === t || p.replace(/ /g, '') === t.replace(/ /g, '') || dist(p, t) <= Math.max(1, Math.floor(t.length * .25)) }) }

export function criaNaTesta(ctx) {
  const { icon, toast, sysMsg, me } = ctx
  const tela = ctx.tela
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
  const feito = j => !!(j.acertou || j.desistiu)

  function abrir(chamados) {
    const op = ls.get('nt.op') || {}
    G = { id: novoId(), host: me.key, hostNome: me.name, fase: 'convite', op: { cat: CATEGORIAS[op.cat] || op.cat === 'mistura' ? op.cat : 'mistura' },
      conv: Object.fromEntries(ctx.presentes().map(k => [k, k === me.key || chamados?.includes(k) ? 'sim' : '?'])),
      js: [], vez: 0, perg: null, acertos: 0, vencedor: null, log: [], ev: [], evN: 0, seq: 0, t: Date.now() }
    sysMsg(`${me.name} abriu uma mesa de Na Testa`)
    difunde()
  }
  function sorteia(n) {
    const cats = G.op.cat === 'mistura' ? Object.keys(CATEGORIAS) : [G.op.cat]
    const todos = cats.flatMap(c => CATEGORIAS[c].itens.map(it => ({ cat: c, nomes: it })))
    return embaralha(todos).slice(0, n)
  }
  function comecar() {
    if (G?.fase !== 'convite') return
    const pres = new Set(ctx.presentes())
    const ks = embaralha(Object.keys(G.conv).filter(k => G.conv[k] === 'sim' && pres.has(k)))
    if (ks.length < MIN_JOG) return toast(`Precisa de pelo menos ${MIN_JOG} pessoas.`)
    ls.set('nt.op', G.op)
    const quem = sorteia(ks.length)
    G.js = ks.map((k, i) => ({ key: k, nome: ctx.nomeDe(k), quem: quem[i].nomes, cat: quem[i].cat, cor: CORES[i % CORES.length], acertou: 0, desistiu: false, pontos: 0, hist: [], chutes: [] }))
    G.vez = 0; G.acertos = 0; G.log = []
    G.fase = 'jogo'
    novaPergunta()
    ev({ t: 'inicio' })
    sysMsg(`Na Testa começou: ${G.js.map(j => j.nome).join(', ')}`)
    difunde()
  }
  const novaPergunta = () => { G.perg = { n: (G.perg?.n || 0) + 1, resp: {} } }
  // quem responde: todo mundo da mesa que está na sala, menos quem está perguntando
  const respondem = () => { const pres = new Set(ctx.presentes()); return G.js.filter(j => j.key !== G.js[G.vez]?.key && pres.has(j.key)).map(j => j.key) }
  function responde(key, r) {
    if (G.fase !== 'jogo' || !RESP[r] || key === G.js[G.vez]?.key || !jog(key)) return
    G.perg.resp[key] = r
    ev({ t: 'resp', key, r })
    if (respondem().every(k => G.perg.resp[k])) return fechaPergunta()
    difunde()
  }
  // fecha a pergunta: maioria "não" passa a vez; senão continua perguntando
  function fechaPergunta() {
    const vs = Object.values(G.perg.resp)
    if (!vs.length) return
    const s = vs.filter(r => r === 's').length, n = vs.filter(r => r === 'n').length
    const res = n > s ? 'n' : s > n ? 's' : 't'
    const j = G.js[G.vez]
    j.hist.push(res)
    ev({ t: 'fechou', key: j.key, res, s, nn: n, tt: vs.length - s - n })
    novaPergunta()
    if (res === 'n') return passaVez()
    difunde()
  }
  function fecha(key) { if (G.fase === 'jogo' && (key === G.js[G.vez]?.key || key === G.host)) fechaPergunta() }
  function chuta(key, txt) {
    const j = G.js[G.vez]
    if (G.fase !== 'jogo' || !j || j.key !== key) return
    txt = String(txt || '').slice(0, 60).trim()
    if (!txt) return
    j.chutes.push(txt)
    if (bate(txt, j.quem)) {
      j.acertou = ++G.acertos; j.pontos += PTS[j.acertou - 1] ?? 1
      ev({ t: 'acertou', key, txt, quem: j.quem[0], pts: PTS[j.acertou - 1] ?? 1 })
      log(`${j.nome} era ${j.quem[0]} e acertou (${j.acertou}º).`)
    } else {
      j.hist.push('x')
      ev({ t: 'errou', key, txt })
      log(`${j.nome} chutou ${txt}. Não é.`)
    }
    novaPergunta()
    passaVez()
  }
  function desiste(key) {
    const j = G.js[G.vez]
    if (G.fase !== 'jogo' || !j || (j.key !== key && key !== G.host)) return
    j.desistiu = true
    ev({ t: 'desistiu', key: j.key, quem: j.quem[0] })
    log(`${j.nome} desistiu: era ${j.quem[0]}.`)
    novaPergunta()
    passaVez()
  }
  function passaVez() {
    if (G.js.every(feito)) return terminou()
    for (let s = 1; s <= G.js.length; s++) { const i = (G.vez + s) % G.js.length; if (!feito(G.js[i])) { G.vez = i; break } }
    ev({ t: 'vez', key: G.js[G.vez].key })
    difunde()
  }
  function terminou() {
    G.fase = 'fim'
    const max = Math.max(0, ...G.js.map(j => j.pontos))
    G.vencedor = max ? G.js.filter(j => j.pontos === max).map(j => j.key) : []
    ev({ t: 'fim' })
    difunde()
  }
  function revanche() {
    const ant = new Set(G.js.map(j => j.key))
    G.conv = Object.fromEntries(ctx.presentes().map(k => [k, ant.has(k) || k === me.key ? 'sim' : '?']))
    Object.assign(G, { id: novoId(), fase: 'convite', js: [], perg: null, acertos: 0, vencedor: null, log: [], ev: [], evN: 0 })
    difunde()
  }
  function remove(key) {
    if (G.fase === 'convite') { if (key in G.conv) { delete G.conv[key]; difunde() } return }
    const i = G.js.findIndex(j => j.key === key)
    if (i < 0) return
    const j = G.js[i], eraVez = i === G.vez
    G.js.splice(i, 1)
    ausDesde.delete(key)
    ev({ t: 'saiu', key, nome: j.nome }); log(`${j.nome} saiu da mesa.`); sysMsg(`${j.nome} saiu do Na Testa`)
    if (G.fase === 'fim') return difunde()
    if (G.js.length < MIN_JOG || G.js.every(feito)) return terminou()
    delete G.perg.resp[key]
    if (i < G.vez) G.vez--
    if (eraVez) { G.vez = (G.vez - 1 + G.js.length) % G.js.length; novaPergunta(); return passaVez() }
    if (G.vez >= G.js.length) G.vez = 0
    if (Object.keys(G.perg.resp).length && respondem().every(k => G.perg.resp[k])) return fechaPergunta()
    difunde()
  }
  function hostRecebe(d, key) {
    if (!G || !key || d.id !== G.id) return
    switch (d.op) {
      case 'resp': if (G.fase === 'convite') { G.conv[key] = d.sim ? 'sim' : 'nao'; difunde() } break
      case 'sai': if (key !== G.host) remove(key); break
      case 'r': responde(key, d.r); break
      case 'fecha': fecha(key); break
      case 'chuta': chuta(key, d.txt); break
      case 'desiste': desiste(key); break
    }
  }
  // o que cada um vê: o post-it dos outros, nunca o seu (até acertar ou desistir)
  function vista(k) {
    const f = G.fase
    return {
      id: G.id, seq: G.seq, host: G.host, hostNome: G.hostNome, fase: f, op: G.op, conv: G.conv,
      js: G.js.map(j => ({ key: j.key, nome: j.nome, cor: j.cor, cat: j.cat, quem: j.key !== k || feito(j) || f === 'fim' ? j.quem[0] : null,
        acertou: j.acertou, desistiu: j.desistiu, pontos: j.pontos, hist: j.hist, chutes: j.chutes.slice(-3) })),
      vez: G.js[G.vez]?.key || null, perg: G.perg, vencedor: G.vencedor, log: G.log.slice(-30),
      // o nome no evento de acerto só vai para quem já pode ver
      ev: G.ev.map(e => (e.t === 'acertou' || e.t === 'desistiu') && e.key === k ? e : e.quem && e.key === k ? { ...e, quem: null } : e),
    }
  }
  function difunde() {
    if (!G) return
    G.seq++; G.t = Date.now()
    ls.set('nt.G', G)
    const ks = new Set([...ctx.presentes(), ...G.js.map(j => j.key), ...Object.keys(G.conv || {})])
    for (const k of ks) if (k !== me.key) ctx.sendTo(k, { nt: { v: vista(k) } })
    const pres = new Set(ctx.presentes())
    G.sucessor = G.js.map(j => j.key).find(k => k !== me.key && pres.has(k)) || [...pres].find(k => k !== me.key) || null
    if (G.sucessor) ctx.sendTo(G.sucessor, { nt: { bk: G } })
    aplica(vista(me.key))
  }
  function encerrar() {
    if (!G) return
    ctx.send({ nt: { fim: G.id } })
    ls.set('nt.G', null)
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
    sysMsg(`${nomeAntigo} caiu: ${me.name} assumiu a mesa de Na Testa`)
    remove(antigo)
    if (G) difunde()
  }
  setInterval(() => {
    if (!G && !restaurou && me.key) {
      restaurou = true
      const s = ls.get('nt.G')
      if (s && s.host === me.key && s.fase !== 'fim' && Date.now() - s.t < 3 * 3600e3) setTimeout(() => { if (G || (V && V.host !== me.key)) return ls.set('nt.G', null); G = s; difunde() }, 3000)
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
  const N = k => k === me.key ? 'Você' : (V?.js.find(j => j.key === k)?.nome || ctx.nomeDe(k))
  function manda(d) {
    if (!V) return
    const m = { id: V.id, ...d }
    if (souHost()) hostRecebe(m, me.key)
    else ctx.sendTo(V.host, { nt: { op: m } })
  }
  function got(d, deKey) {
    if (!d) return
    if (d.op) { if (G && G.host === me.key) hostRecebe(d.op, deKey); return }
    if (d.fim) { if (V?.id === d.fim) aplica(null); return }
    if (d.bk) { if (d.bk.host === deKey) backup = d.bk; return }
    if (d.v) {
      if (G && d.v.id === G.id && d.v.host !== me.key) { G = null; ls.set('nt.G', null) }
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
    render()
    anima(evs)
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

  /* ---------- o mural ---------- */
  const botao = (conteudo, fn, cls = '', title = '') => { const b = el('button', { type: 'button', className: `nt-btn ${cls}`, title }); b.append(...[conteudo].flat()); b.addEventListener('click', e => { e.stopPropagation(); b.blur(); som('clique'); fn(e) }); return b }
  const retrato = (k, cls = '') => el('span', { className: `nt-foto ${cls}`, 'data-key': k }, ctx.pfp(k, 96, N(k)))
  const giro = k => ((([...k].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 9) - 4) * .9).toFixed(1) // cada um com o seu ângulo, sempre o mesmo
  // o chute que estou digitando sobrevive aos re-renders
  let rascunho = ''

  function render() {
    tela.classList.toggle('nt--on', !!V)
    ctx.onAtivo?.(!!V)
    if (!V) { tela.replaceChildren(); return }
    const ativo = document.activeElement?.classList?.contains('nt-chute__in') ? document.activeElement : null
    const sel = ativo && [ativo.selectionStart, ativo.selectionEnd]
    const topo = el('header', { className: 'nt-topo' },
      el('span', { className: 'nt-logo' }, el('b', { textContent: 'Na Testa' }), el('i', { textContent: '?' })),
      V.fase === 'jogo' ? el('span', { className: 'nt-cat', textContent: V.op.cat === 'mistura' ? 'tudo misturado' : CATEGORIAS[V.op.cat]?.nome }) : '',
      el('span', { className: 'nt-grow' }),
      souHost() ? botao(icon('x'), encerrar, 'nt-btn--ic', 'Encerrar a mesa para todo mundo')
        : botao(icon('x'), () => { dispensado = V.id; aplica(null) }, 'nt-btn--ic', 'Sair da mesa (só para você)'))
    let corpo
    if (V.fase === 'convite') corpo = convite()
    else if (V.fase === 'fim') corpo = fim()
    else corpo = mural()
    tela.replaceChildren(topo, corpo, bilhete())
    ctx.hydrate(tela)
    const inp = tela.querySelector('.nt-chute__in')
    if (inp && ativo) { inp.focus(); try { inp.setSelectionRange(...sel) } catch {} }
  }
  // o post-it: cor de cada um, levemente torto, com o nome escrito à mão
  function postit(j, grande) {
    const meu = j.key === me.key, escondido = !j.quem
    return el('div', { className: 'nt-postit' + (grande ? ' grande' : '') + (escondido ? ' escondido' : '') + (j.acertou ? ' certo' : '') + (j.desistiu ? ' desistiu' : ''), style: `--cor:${j.cor};--giro:${giro(j.key)}deg` },
      el('span', { className: 'nt-postit__txt', textContent: escondido ? '???' : j.quem }),
      j.acertou ? el('span', { className: 'nt-selo', textContent: `${j.acertou}º` }) : '',
      meu && escondido ? el('small', { textContent: 'só você não vê' }) : '')
  }
  function convite() {
    const host = souHost()
    const n = Object.entries(V.conv).filter(([k, v]) => v === 'sim' && ctx.presentes().includes(k)).length
    const quadro = (num, cena, rotulo) => el('div', { className: 'nt-passo', style: `--d:${num * 140}ms` }, el('div', { className: `nt-cena nt-cena--${num}` }, ...cena), el('span', { className: 'nt-passo__rot', textContent: rotulo }))
    const cabeca = () => el('i', { className: 'nt-mini-cabeca' })
    const tutorial = el('div', { className: 'nt-tutorial' },
      quadro(1, [cabeca(), el('span', { className: 'nt-mini-post a', textContent: 'Shrek' })], 'Um post-it na testa'),
      quadro(2, [el('span', { className: 'nt-mini-balao', textContent: 'Eu sou verde?' }), el('span', { className: 'nt-mini-resp s', textContent: 'Sim' }), el('span', { className: 'nt-mini-resp n', textContent: 'Não' })], 'Pergunte: sim ou não'),
      quadro(3, [cabeca(), el('span', { className: 'nt-mini-post b', textContent: 'Shrek!' }), el('span', { className: 'nt-mini-selo', textContent: '1º' })], 'Chute quem você é'))
    const cats = el('div', { className: 'nt-cats' }, ...[['mistura', { nome: 'Tudo misturado', ic: '🎲' }], ...Object.entries(CATEGORIAS)].map(([c, x]) => {
      const on = V.op.cat === c, conteudo = [el('span', { className: 'nt-cats__ic', textContent: x.ic }), el('span', { textContent: x.nome })]
      return host ? botao(conteudo, () => { G.op.cat = c; difunde() }, 'nt-cat-op' + (on ? ' nt-on' : '')) : el('span', { className: 'nt-cat-op' + (on ? ' nt-on' : '') }, ...conteudo)
    }))
    const pessoas = el('div', { className: 'nt-pessoas' }, ...Object.entries(V.conv).map(([k, v]) => el('span', { className: `nt-pessoa nt-pessoa--${v}`, title: v === 'sim' ? 'vai jogar' : v === 'nao' ? 'só assiste' : 'decidindo' }, retrato(k), el('small', { textContent: k === me.key ? 'você' : ctx.nomeDe(k) }))))
    const ir = host ? botao(n >= MIN_JOG ? `Colar os post-its · ${n}` : `Precisa de ${MIN_JOG}`, comecar, 'nt-btn--forte nt-btn--grande') : el('small', { className: 'nt-espera', textContent: `${V.hostNome} vai começar` })
    if (host && n < MIN_JOG) ir.disabled = true
    return el('div', { className: 'nt-inicio' }, tutorial,
      el('p', { className: 'nt-regra' }, 'Maioria disse ', el('b', { textContent: 'não' }), '? A vez passa. Acertou: ', el('b', { textContent: '3, 2 ou 1 ponto' }), ' pela ordem.'),
      cats, pessoas,
      el('div', { className: 'nt-linha' }, host ? botao(V.conv[me.key] === 'sim' ? 'Eu jogo' : 'Eu só assisto', () => { G.conv[me.key] = G.conv[me.key] === 'sim' ? 'nao' : 'sim'; difunde() }, 'nt-btn--leve') : '', ir))
  }
  function bilhete() {
    if (V.fase !== 'convite' || souHost() || V.conv[me.key] !== '?') return ''
    if (novo('conv:' + V.id)) som('papel')
    return el('div', { className: 'nt-bilhete' },
      el('div', { className: 'nt-linha' }, retrato(V.host), el('span', {}, el('b', { textContent: V.hostNome }), ' chamou você para o Na Testa')),
      el('div', { className: 'nt-linha' }, botao('Jogar', () => manda({ op: 'resp', sim: true }), 'nt-btn--forte'), botao('Só assistir', () => manda({ op: 'resp', sim: false }), 'nt-btn--leve')))
  }
  // histórico de cada um: bolinhas de sim, não, talvez e chute errado
  const historico = j => el('span', { className: 'nt-hist' }, ...j.hist.slice(-10).map(r => el('i', { className: `nt-hist__${r}`, title: r === 'x' ? 'chute errado' : RESP[r] })))
  function mural() {
    const vezK = V.vez, vez = V.js.find(j => j.key === vezK), minhaVez = vezK === me.key
    const jogando = V.js.some(j => j.key === me.key)
    // o mural: um cartão (foto + post-it) por pessoa; quem está perguntando fica em destaque no centro
    const cartoes = el('div', { className: 'nt-quadro' }, ...V.js.map(j => {
      const r = V.perg?.resp?.[j.key]
      return el('div', { className: 'nt-cartao' + (j.key === vezK ? ' vez' : '') + (j.acertou || j.desistiu ? ' feito' : '') + (j.key === me.key ? ' eu' : ''), 'data-key': j.key, style: `--giro:${giro(j.key)}deg` },
        el('i', { className: 'nt-tacha' }),
        postit(j), retrato(j.key),
        el('b', { className: 'nt-cartao__nome', textContent: j.key === me.key ? 'Você' : j.nome }),
        historico(j),
        j.pontos ? el('span', { className: 'nt-cartao__pts', textContent: `${j.pontos} pt${j.pontos > 1 ? 's' : ''}` }) : '',
        r && j.key !== vezK ? el('span', { className: `nt-resp-mini nt-resp-mini--${r}${novo(`rm:${V.id}:${V.perg.n}:${j.key}:${r}`) ? ' entra' : ''}`, textContent: RESP[r] }) : '')
    }))
    // painel de baixo: o que fazer agora
    let acao
    const resp = V.perg?.resp || {}
    const contagem = el('div', { className: 'nt-contagem' }, ...['s', 'n', 't'].map(r => {
      const q = Object.values(resp).filter(x => x === r).length
      return el('span', { className: `nt-contagem__${r}` + (q ? ' tem' : '') }, el('b', { textContent: q }), RESP[r])
    }))
    if (minhaVez) {
      const inp = el('input', { className: 'nt-chute__in', placeholder: 'Eu sou…', maxLength: 60, autocomplete: 'off', spellcheck: false, value: rascunho })
      inp.addEventListener('input', () => { rascunho = inp.value })
      const form = el('form', { className: 'nt-chute' }, inp, botao('Chutar', () => form.requestSubmit(), 'nt-btn--forte'))
      form.addEventListener('submit', e => { e.preventDefault(); const t = inp.value.trim(); if (!t) return inp.focus(); rascunho = ''; manda({ op: 'chuta', txt: t }) })
      acao = el('div', { className: 'nt-painel nt-painel--vez' + (novo(`vez:${V.id}:${vezK}:${vez?.hist.length}`) ? ' entra' : '') },
        el('p', { className: 'nt-painel__t' }, el('b', { textContent: 'Sua vez!' }), ' Pergunte em voz alta algo de sim ou não.'),
        contagem,
        el('div', { className: 'nt-linha' }, form,
          Object.keys(resp).length ? botao('Fechar resposta', () => manda({ op: 'fecha' }), 'nt-btn--leve', 'Conta as respostas que já vieram') : '',
          botao('Desistir', () => manda({ op: 'desiste' }), 'nt-btn--leve nt-btn--perigo', 'Mostra quem você é e passa a vez')))
    } else if (jogando || souHost()) {
      const minha = resp[me.key]
      acao = el('div', { className: 'nt-painel' },
        el('p', { className: 'nt-painel__t' }, retrato(vezK, 'nt-foto--mini'), el('span', {}, el('b', { textContent: N(vezK) }), ' pergunta. Responda pelo post-it ', el('b', { className: 'nt-painel__quem', textContent: vez?.quem || '???' }), ':')),
        el('div', { className: 'nt-linha nt-respostas' }, ...['s', 'n', 't'].map(r => botao(RESP[r], () => manda({ op: 'r', r }), `nt-resp nt-resp--${r}` + (minha === r ? ' nt-on' : ''), r === 't' ? 'Mais ou menos / depende' : ''))),
        el('div', { className: 'nt-linha' }, contagem, souHost() && Object.keys(resp).length ? botao('Fechar resposta', () => manda({ op: 'fecha' }), 'nt-btn--leve') : ''))
    } else acao = el('div', { className: 'nt-painel' }, el('p', { className: 'nt-painel__t' }, 'Só assistindo: ', el('b', { textContent: N(vezK) }), ' está perguntando.'))
    return el('div', { className: 'nt-mesa' }, cartoes, acao)
  }
  function fim() {
    const ord = V.js.slice().sort((a, b) => b.pontos - a.pontos || (a.acertou || 99) - (b.acertou || 99))
    return el('div', { className: 'nt-fim' },
      el('b', { className: 'nt-fim__t', textContent: V.vencedor?.length ? `${V.vencedor.map(N).join(' e ')} ${V.vencedor.length > 1 ? 'venceram' : 'venceu'}!` : 'Ninguém acertou!' }),
      el('div', { className: 'nt-quadro nt-quadro--fim' }, ...ord.map(j => el('div', { className: 'nt-cartao feito', 'data-key': j.key, style: `--giro:${giro(j.key)}deg` },
        el('i', { className: 'nt-tacha' }), postit(j), retrato(j.key), el('b', { className: 'nt-cartao__nome', textContent: j.key === me.key ? 'Você' : j.nome }),
        el('span', { className: 'nt-cartao__pts', textContent: j.acertou ? `${j.acertou}º · ${j.pontos} pt${j.pontos > 1 ? 's' : ''}` : 'não acertou' })))),
      souHost() ? el('div', { className: 'nt-linha' }, botao('Nova rodada', revanche, 'nt-btn--forte nt-btn--grande'), botao('Fechar', encerrar, 'nt-btn--leve')) : el('small', { className: 'nt-espera', textContent: `${V.hostNome} decide se tem outra rodada` }))
  }
  // efeitos: post-it voando para quem respondeu, carimbo no acerto
  function anima(evs) {
    for (const e of evs) {
      if (e.t === 'inicio') { som('embaralhar'); tela.querySelectorAll('.nt-cartao .nt-postit').forEach((n, i) => { n.style.animationDelay = `${300 + i * 180}ms`; n.classList.add('cola'); som('papel', 300 + i * 180, .6) }) }
      else if (e.t === 'resp') som('poe', 0, .6)
      else if (e.t === 'fechou') { som(e.res === 'n' ? 'desliza' : 'tique'); if (e.key === me.key) toast(e.res === 'n' ? `Maioria disse NÃO (${e.nn}×${e.s}). A vez passa.` : e.res === 's' ? `Maioria disse SIM (${e.s}×${e.nn}). Pergunte de novo!` : 'Empatou. Pergunte de novo!', 2600) }
      else if (e.t === 'acertou') { som('carimbo'); som('leque', 250); toast(e.key === me.key ? `Acertou! Você era ${e.quem}. +${e.pts}` : `${N(e.key)} acertou: era ${e.quem}! +${e.pts}`, 3200); tela.querySelector(`.nt-cartao[data-key="${e.key}"] .nt-postit`)?.classList.add('carimba') }
      else if (e.t === 'errou') { som('desliza'); toast(`${N(e.key)} chutou "${e.txt}". Não é!`, 2600); tela.querySelector(`.nt-cartao[data-key="${e.key}"]`)?.classList.add('treme') }
      else if (e.t === 'desistiu') toast(`${N(e.key)} desistiu${e.quem ? `: era ${e.quem}` : ''}`, 3000)
      else if (e.t === 'vez') { if (e.key === me.key) { som('vez', 300); setTimeout(() => tela.querySelector('.nt-chute__in')?.focus({ preventScroll: true }), 350) } }
      else if (e.t === 'fim') som('leque', 300)
      else if (e.t === 'saiu') toast(`${e.nome} saiu da mesa`, 3200)
    }
  }
  ;(function loop() {
    if (V) {
      const pres = new Set(ctx.presentes())
      for (const s of tela.querySelectorAll('[data-key]')) { s.classList.toggle('caiu', !pres.has(s.dataset.key)); s.classList.toggle('fala', s.classList.contains('nt-cartao') && !!ctx.falando(s.dataset.key)) }
    }
    setTimeout(loop, 400)
  })()

  function iniciar(chamados) {
    carregaSons()
    if (V && !souHost()) return toast(`Já tem uma mesa aberta (de ${V.hostNome})`)
    if (G) return toast('A mesa já está aberta')
    abrir(chamados)
  }
  window.__nt = () => ({ G, V, difunde })
  return {
    got: (d, k) => { carregaSons(); got(d, k) }, iniciar, ativo: () => !!V,
    lider: () => !!V && souHost(),
    encerra: () => { if (G && G.host === me.key) encerrar() },
    sair: () => { if (!V) return; if (G && G.host === me.key) return encerrar(); manda({ op: 'sai' }); dispensado = V.id; aplica(null) },
    jogadores: () => !V ? [] : V.fase === 'convite' || !V.js?.length ? Object.keys(V.conv || {}).filter(k => V.conv[k] === 'sim') : V.js.map(j => j.key),
    entrouAlguem: key => { if (!G || G.host !== me.key) return; if (G.fase === 'convite' && !(key in G.conv)) { G.conv[key] = '?'; return difunde() } ctx.sendTo(key, { nt: { v: vista(key) } }) },
  }
}
