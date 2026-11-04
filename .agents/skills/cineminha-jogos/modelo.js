// MODELO de jogo do Cineminha. Copie para public/<nomedojogo>.js e troque: XX (chave da mensagem e prefixo das classes),
// criaModelo, NOME e as partes marcadas com "REGRAS" e "MESA". Toda a infraestrutura (rede, convite, saída, troca de host,
// sons, eventos) já funciona como nos outros jogos. Leia JOGOS.md na raiz do projeto antes.

const XX = 'xx' // chave da mensagem ({ xx: ... }), prefixo das classes (.xx-...) e do localStorage (xx.G)
const NOME = 'Nome do Jogo'
const SOM = n => `jogos/coup/sons/${n}.mp3` // sons Kenney (CC0) já no projeto
const SONS = ['embaralhar', 'desliza1', 'desliza2', 'desliza3', 'poe1', 'poe2', 'leque', 'carimbo', 'papel', 'vez', 'clique', 'tique']
const VOL = { embaralhar: .5, carimbo: .6, papel: .45, vez: .5, clique: .3, tique: .28 }
const SAIU_MS = 12000, HOST_MS = 10000, MIN_JOG = 2

const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n }
const embaralha = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]] } return a }
const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch {} } }

export function criaModelo(ctx) {
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

  /* ================================================================ host: estado completo */
  let G = null, restaurou = false
  const ausDesde = new Map()
  const jog = k => G?.js.find(j => j.key === k)
  const log = t => { G.log.push(t); if (G.log.length > 60) G.log.splice(0, G.log.length - 60) }
  const ev = e => { G.ev.push({ ...e, n: ++G.evN }); if (G.ev.length > 30) G.ev.splice(0, G.ev.length - 30) }

  function abrir() {
    const op = ls.get(`${XX}.op`) || {}
    G = { id: Math.random().toString(36).slice(2, 9), host: me.key, hostNome: me.name, fase: 'convite', op: { ...op },
      conv: Object.fromEntries(ctx.presentes().map(k => [k, k === me.key ? 'sim' : '?'])),
      js: [], vez: 0, rodada: 0, vencedor: null, log: [], ev: [], evN: 0, seq: 0, t: Date.now() }
    sysMsg(`${me.name} abriu uma mesa de ${NOME}`)
    difunde()
  }
  function comecar() {
    if (G?.fase !== 'convite') return
    const pres = new Set(ctx.presentes())
    const ks = embaralha(Object.keys(G.conv).filter(k => G.conv[k] === 'sim' && pres.has(k)))
    if (ks.length < MIN_JOG) return toast(`Precisa de pelo menos ${MIN_JOG} pessoas.`)
    ls.set(`${XX}.op`, G.op)
    G.js = ks.map(k => ({ key: k, nome: ctx.nomeDe(k), pontos: 0 /* REGRAS: mão, cartas… */ }))
    G.vez = rnd(ks.length); G.rodada = 1; G.fase = 'jogo'; G.log = []
    ev({ t: 'inicio' })
    sysMsg(`${NOME} começou: ${G.js.map(j => j.nome).join(', ')}`)
    difunde()
  }
  // REGRAS: cada jogada valida tudo antes de mudar G (fase, vez, posse da carta…). Nunca confie no cliente.
  function joga(key, { carta }) { // ATENÇÃO: nunca use um campo chamado "id" na intenção (sobrescreve o id da partida)
    const i = G.js.findIndex(j => j.key === key)
    if (G.fase !== 'jogo' || i !== G.vez) return
    ev({ t: 'jogou', key, carta })
    log(`${G.js[i].nome} jogou.`)
    G.vez = (G.vez + 1) % G.js.length
    difunde()
  }
  function revanche() {
    const ant = new Set(G.js.map(j => j.key))
    G.conv = Object.fromEntries(ctx.presentes().map(k => [k, ant.has(k) || k === me.key ? 'sim' : '?']))
    Object.assign(G, { id: Math.random().toString(36).slice(2, 9), fase: 'convite', js: [], vencedor: null, log: [], ev: [], evN: 0 })
    difunde()
  }
  // alguém saiu de vez: tira da mesa (REGRAS: devolva as cartas dela ao monte) e ajeita a vez
  function remove(key) {
    if (G.fase === 'convite') { if (key in G.conv) { delete G.conv[key]; difunde() } return }
    const i = G.js.findIndex(j => j.key === key)
    if (i < 0) return
    const j = G.js[i]
    G.js.splice(i, 1)
    if (i < G.vez) G.vez--
    if (G.vez >= G.js.length) G.vez = 0
    ausDesde.delete(key)
    ev({ t: 'saiu', key, nome: j.nome }); log(`${j.nome} saiu da mesa.`); sysMsg(`${j.nome} saiu do ${NOME}`)
    if (G.fase !== 'fim' && G.js.length < MIN_JOG) { G.fase = 'fim'; G.vencedor = G.js[0]?.key || null }
    difunde()
  }
  function hostRecebe(d, key) {
    if (!G || !key || d.id !== G.id) return
    switch (d.op) {
      case 'resp': if (G.fase === 'convite') { G.conv[key] = d.sim ? 'sim' : 'nao'; difunde() } break
      case 'joga': joga(key, d); break
      // REGRAS: outras intenções aqui
    }
  }
  // o que cada pessoa pode ver (REGRAS: esconda cartas dos outros, votos secretos etc.)
  function vista(k) {
    return {
      id: G.id, seq: G.seq, host: G.host, hostNome: G.hostNome, fase: G.fase, op: G.op, conv: G.conv,
      js: G.js.map(j => ({ key: j.key, nome: j.nome, pontos: j.pontos })), vez: G.js[G.vez]?.key || null,
      vencedor: G.vencedor, log: G.log.slice(-30), ev: G.ev,
    }
  }
  function difunde() {
    if (!G) return
    G.seq++; G.t = Date.now()
    ls.set(`${XX}.G`, G)
    const ks = new Set([...ctx.presentes(), ...G.js.map(j => j.key), ...Object.keys(G.conv || {})])
    for (const k of ks) if (k !== me.key) ctx.sendTo(k, { [XX]: { v: vista(k) } })
    // cópia completa para o sucessor assumir se o host cair
    const pres = new Set(ctx.presentes())
    G.sucessor = G.js.map(j => j.key).find(k => k !== me.key && pres.has(k)) || [...pres].find(k => k !== me.key) || null
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
      if (s && s.host === me.key && s.fase !== 'fim' && Date.now() - s.t < 3 * 3600e3) setTimeout(() => { if (G || (V && V.host !== me.key)) return ls.set(`${XX}.G`, null); G = s; difunde() }, 3000)
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
  const souHost = () => V && V.host === me.key
  const N = k => k === me.key ? 'Você' : (V?.js.find(j => j.key === k)?.nome || ctx.nomeDe(k))
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
      if (G && d.v.id === G.id && d.v.host !== me.key) { G = null; ls.set(`${XX}.G`, null) } // alguém assumiu no meu lugar
      if (d.v.id === dispensado) return
      if (V && d.v.id === V.id && d.v.seq <= V.seq) return
      if (ctx.outroJogo?.()) return
      aplica(d.v)
    }
  }
  function aplica(v) {
    const antes = V
    if (v && (!antes || antes.id !== v.id)) ultEv = Math.max(0, ...v.ev.map(e => e.n)) // mesa nova: não anima o passado
    V = v
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

  /* ---------- MESA: a interface (troque pelo visual do jogo) ---------- */
  const botao = (conteudo, fn, cls = '') => { const b = el('button', { type: 'button', className: `${XX}-btn ${cls}` }); b.append(...[conteudo].flat()); b.addEventListener('click', e => { e.stopPropagation(); b.blur(); som('clique'); fn(e) }); return b }
  function render() {
    tela.classList.toggle(`${XX}--on`, !!V)
    ctx.onAtivo?.(!!V)
    if (!V) { tela.replaceChildren(); return }
    const topo = el('header', { className: `${XX}-topo` }, el('b', { textContent: NOME }), el('span', { className: `${XX}-grow` }),
      souHost() ? botao(icon('x'), encerrar, `${XX}-btn--ic`) : botao(icon('x'), () => { dispensado = V.id; aplica(null) }, `${XX}-btn--ic`))
    let corpo
    if (V.fase === 'convite') corpo = convite()
    else if (V.fase === 'fim') corpo = el('div', { className: `${XX}-fim` }, el('b', { textContent: V.vencedor ? `${N(V.vencedor)} venceu` : 'Fim' }), souHost() ? botao('Nova partida', revanche) : '')
    else corpo = el('div', { className: `${XX}-mesa` }, el('p', { textContent: V.vez === me.key ? 'Sua vez' : `Vez de ${N(V.vez)}` }),
      V.vez === me.key ? botao('Jogar', () => manda({ op: 'joga', carta: 1 })) : '')
    const bilhete = V.fase === 'convite' && !souHost() && V.conv[me.key] === '?' ? el('div', { className: `${XX}-bilhete` },
      el('span', { textContent: `${V.hostNome} chamou você para ${NOME}` }), botao('Jogar', () => manda({ op: 'resp', sim: true })), botao('Só assistir', () => manda({ op: 'resp', sim: false }))) : ''
    tela.replaceChildren(topo, corpo, bilhete)
    ctx.hydrate(tela)
  }
  // página inicial: tutorial visual em 2–3 quadros animados + quem vai jogar + começar
  function convite() {
    const n = Object.entries(V.conv).filter(([k, v]) => v === 'sim' && ctx.presentes().includes(k)).length
    const ir = souHost() ? botao(n >= MIN_JOG ? `Começar · ${n}` : `Precisa de ${MIN_JOG}`, comecar) : el('small', { textContent: `${V.hostNome} vai começar` })
    if (souHost() && n < MIN_JOG) ir.disabled = true
    return el('div', { className: `${XX}-inicio` }, /* tutorial animado aqui */ ir)
  }
  function anima(evs) {
    for (const e of evs) {
      if (e.t === 'inicio') som('embaralhar')
      else if (e.t === 'jogou') som('poe')
      else if (e.t === 'saiu') toast(`${e.nome} saiu da mesa`, 3200)
    }
  }
  // quem caiu fica apagado até voltar ou sair
  ;(function loop() { if (V) { const pres = new Set(ctx.presentes()); for (const s of tela.querySelectorAll('[data-key]')) s.classList.toggle('caiu', !pres.has(s.dataset.key)) } setTimeout(loop, 1000) })()

  function iniciar() {
    carregaSons()
    if (V && !souHost()) return toast(`Já tem uma mesa aberta (de ${V.hostNome})`)
    if (G) return toast('A mesa já está aberta')
    abrir()
  }
  window[`__${XX}`] = () => ({ G, V, difunde })
  return {
    got: (d, k) => { carregaSons(); got(d, k) }, iniciar, ativo: () => !!V,
    entrouAlguem: key => { if (!G || G.host !== me.key) return; if (G.fase === 'convite' && !(key in G.conv)) { G.conv[key] = '?'; return difunde() } ctx.sendTo(key, { [XX]: { v: vista(key) } }) },
  }
}
