// Faixa a Faixa: adivinhe a música. Começa só com a bateria; cada erro ou "pular" abre mais um instrumento,
// e a última linha é uma dica. Quanto antes acertar, mais pontos. Acertar só o artista vale metade.
// Dias: 5 músicas por dia (tools/faixa/diario.py). Dá para jogar um dia ou um combo de vários dias.
// O host (quem começou) guarda o estado e manda para todos pela action 'jogo'.

const BASE = 'jogos/faixa/'
const MODOS = {
  coletivo: { nome: 'Cooperativo', ic: 'users', dica: 'Todo mundo ouve o mesmo. Qualquer erro ou pulo abre o próximo instrumento para todos.' },
  individual: { nome: 'Cada um', ic: 'user', dica: 'Cada um no seu ritmo, vendo quem já acertou.' },
  cegas: { nome: 'Às cegas', ic: 'eye-off', dica: 'Cada um no seu ritmo, sem saber dos outros até a revelação.' },
}
// categorias: etiquetas da Deezer (generos, pais, ano) + do catálogo classificado pelo Antigravity (tg: generos, vibes, fama)
const GEN = (m, ...gs) => [...(m.generos || []), ...(m.tg?.generos || [])].some(g => gs.some(x => g.toLowerCase().includes(x)))
const VIBE = (m, ...vs) => (m.tg?.vibes || []).some(v => vs.includes(v))
const BR = m => m.pais === 'BR' || m.tg?.pais === 'BR' || GEN(m, 'mpb', 'sertanejo', 'pagode', 'samba', 'funk-br', 'forro', 'forró', 'axé', 'rock-nacional')
const ANO = m => m.ano || m.tg?.decada || 0
const CATEGORIAS = [
  { id: 'estudio', nome: 'Faixas de estúdio', ic: '🎚️', f: m => m.fonte === 'estudio' },
  { id: 'nacionais', nome: 'Nacionais', ic: '🇧🇷', f: BR },
  { id: 'gringas', nome: 'Gringas', ic: '🌎', f: m => !BR(m) && !!(m.pais || m.tg?.pais) },
  { id: 'hinos', nome: 'Pra cantar junto', ic: '🎙️', f: m => VIBE(m, 'hino') || (m.tg?.fama >= 5) },
  { id: 'rocknac', nome: 'Rock nacional', ic: '🤘', f: m => GEN(m, 'rock-nacional') || (BR(m) && GEN(m, 'rock')) },
  { id: 'rock', nome: 'Rock', ic: '🎸', f: m => GEN(m, 'rock', 'metal', 'alternativ', 'indie') },
  { id: 'mpb', nome: 'MPB e samba', ic: '🌴', f: m => GEN(m, 'mpb', 'pagode', 'samba') },
  { id: 'sertanejo', nome: 'Sertanejo e forró', ic: '🤠', f: m => GEN(m, 'sertanejo', 'forro', 'forró', 'axé') },
  { id: 'sofrencia', nome: 'Sofrência e românticas', ic: '💔', f: m => VIBE(m, 'sofrencia', 'romantica', 'triste') },
  { id: 'pop', nome: 'Pop', ic: '✨', f: m => GEN(m, 'pop') },
  { id: 'danca', nome: 'Pra dançar', ic: '🪩', f: m => VIBE(m, 'festa') || GEN(m, 'dance', 'disco', 'eletronica', 'funk', 'soul', 'r&b') },
  { id: 'rap', nome: 'Rap, trap e funk', ic: '🎧', f: m => GEN(m, 'rap', 'hip hop', 'trap', 'funk-br') },
  { id: 'emo', nome: 'Emo e anos 2000', ic: '🖤', f: m => VIBE(m, 'emo') },
  { id: 'virais', nome: 'Virais e memes', ic: '📱', f: m => VIBE(m, 'viral') || GEN(m, 'internet-meme') },
  { id: 'classicos', nome: 'Clássicos (até 1989)', ic: '📼', f: m => ANO(m) && ANO(m) < 1990 },
  { id: 'anos90', nome: 'Anos 90 e 2000', ic: '💿', f: m => ANO(m) >= 1990 && ANO(m) < 2010 },
  { id: 'recentes', nome: 'Recentes', ic: '🔥', f: m => ANO(m) >= 2015 },
]
const ICONE = { bateria: '1f941', baixo: '1f3b8', base: '1f3b8', guitarra: '1f3b8', violao: '1f3b8', piano: '1f3b9', teclado: '1f3b9', outros: '1f3b6', resto: '1f3b6', melodia: '1f3b7', voz: '1f3a4', mix: '1f3b9' }
const ANIMADO = new Set(['1f941', '1f3b8', '1f3b7', '1f3b6'])
const MAX_AUDIO = 5
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const semAcento = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const norm = t => semAcento(t).replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\b(feat|ft)\b.*$/, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
function dist(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 1; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[m][n]
}
export function confere(palpite, titulo) {
  const p = norm(palpite), t = norm(titulo)
  if (!p || p.length < 2) return false
  if (p === t) return true
  if (t.length >= 5 && p.includes(t)) return true
  return dist(p, t) <= Math.max(1, Math.floor(t.length * .2))
}
const mesmoArtista = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || (x.length > 3 && y.includes(x)) || (y.length > 3 && x.includes(y)) || confere(a, b)) }
const hojeStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function nomeDia(iso, curto) {
  const [y, m, d] = iso.split('-').map(Number), dt = new Date(y, m - 1, d)
  const dif = Math.round((new Date(hojeStr() + 'T00:00') - dt) / 864e5)
  if (dif === 0) return 'Hoje'
  if (dif === 1) return 'Ontem'
  return curto ? `${d} ${MESES[m - 1]}` : `${SEMANA[dt.getDay()]}, ${d} ${MESES[m - 1]}`
}
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
// esconde o nome do artista: "Tim Maia" -> "T__ M___"
const iniciais = a => String(a).split(/(\s+)/).map(w => /\s/.test(w) || !w ? w : w[0] + '_'.repeat(Math.max(0, w.length - 1))).join('')

// agrupa as faixas separadas em até 5 passos de áudio (junta piano/outros/etc.) + 1 passo de dica
function passosDe(m) {
  const g = m.camadas.map((c, i) => ({ tipo: c.tipo, nome: c.nome, idx: [i] }))
  const juntaveis = ['piano', 'teclado', 'outros', 'resto', 'melodia', 'base', 'guitarra', 'mix']
  while (g.length > MAX_AUDIO) {
    const i = g.findIndex((x, k) => k < g.length - 1 && juntaveis.includes(x.tipo) && juntaveis.includes(g[k + 1].tipo))
    const k = i >= 0 ? i : g.length - 3
    const a = g[k], b = g[k + 1]
    const guit = a.tipo === 'base' && b.tipo === 'guitarra'
    g.splice(k, 2, { tipo: guit ? 'guitarra' : 'mix', nome: guit ? 'Guitarras' : 'Teclados e efeitos', idx: [...a.idx, ...b.idx] })
  }
  return [...g, { tipo: 'dica', nome: 'Dica', idx: [], dica: true }]
}

export function criaFaixa(ctx) {
  const { el, icon, toast, sysMsg, me } = ctx
  let S = null, seq = 0, dias = null
  const tela = ctx.tela
  const ehHost = () => S && S.host === me.key
  const euJog = () => S?.jog?.[me.key]
  const individual = () => S && S.modo !== 'coletivo'
  const atualDe = () => S?.musicas[S.i]
  const musica = () => { const a = atualDe(); return a && dias?.[a.d]?.find(m => m.n === a.n) }
  const pasta = () => { const a = atualDe(); return `${BASE}dias/${a.d}/${a.n}/` }
  const passos = () => { const m = musica(); return m ? passosDe(m) : [] }
  const total = () => passos().length || 6
  const valor = p => Math.max(100, (total() - p + 1) * 100)
  const passoDe = j => individual() ? j.n : S.camada

  async function carrega(forcar) {
    if (dias && !forcar) return
    dias = await fetch(BASE + 'dias.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : {}).catch(() => ({}))
  }

  /* ---------- estado (o host decide) ---------- */
  // o host também passa pelos avisos (era só quem recebia o estado: o histórico de quem abria a partida nunca era salvo)
  let anterior = null
  function manda() {
    S.seq = ++seq; ctx.send({ estado: S })
    avisos(anterior, S); anterior = JSON.parse(JSON.stringify(S))
    render(); prepara()
  }
  const novoJog = nome => ({ nome, n: 1, ok: 0, art: 0, fora: false, pts: 0, tent: [] })
  function got(d, deKey) {
    if (!d) return
    if (d.estado) {
      const e = d.estado
      if (e.fim) { if (!S || e.id === S.id) { S = null; parar(); render() } return }
      if (S && e.id === S.id && e.seq <= S.seq) return
      const antes = S
      S = e; seq = Math.max(seq, e.seq)
      carrega().then(() => { avisos(antes, S); render(); prepara() })
      return
    }
    if (d.dig !== undefined) { if (deKey && S && S.modo !== 'cegas') ctx.digitandoFaixa?.(deKey, !!d.dig); return }
    if (!ehHost() || !d.tent || !deKey) return
    const j = S.jog[deKey] || (S.jog[deKey] = novoJog(d.nome || deKey))
    if (S.fase !== 'tocando' || j.ok || j.fora) return
    const passo = passoDe(j)
    const t = { c: passo, tipo: String(d.tent.tipo), txt: String(d.tent.txt || '').slice(0, 80) }
    j.tent.push(t)
    const somar = pts => { if (pts > j.pts) { S.placar[deKey] = (S.placar[deKey] || 0) + pts - j.pts; j.pts = pts } }
    // cooperativo: um acerto vale para todo mundo da sessão (e a música acaba ali)
    const todos = S.modo === 'coletivo' ? Object.entries(S.jog) : [[deKey, j]]
    const soma = (x, k, pts) => { if (pts > x.pts) { S.placar[k] = (S.placar[k] || 0) + pts - x.pts; x.pts = pts } }
    if (t.tipo === 'certo') {
      const pts = valor(passo)
      for (const [k, x] of todos) { x.ok = passo; soma(x, k, pts) }
      if (S.modo === 'coletivo') { S.acertou = { key: deKey, nome: j.nome }; return revelar() }
    } else if (t.tipo === 'artista') {
      for (const [k, x] of todos) if (!x.art) { x.art = passo; soma(x, k, Math.floor(valor(passo) / 2)) }
    } else if (individual()) {
      if (j.n >= total()) j.fora = true; else j.n++
    } else {
      // coletivo: o erro/pulo de qualquer um abre a próxima camada para todos; na última, quem errou sai
      if (S.camada >= total()) j.fora = true; else S.camada++
    }
    if (Object.values(S.jog).every(x => x.ok || x.fora)) return revelar()
    manda()
  }
  function comecar({ lista, rotulo, modo }) {
    if (!lista.length) return toast('Nenhuma música para jogar aqui (você já respondeu todas?).', 3200)
    S = { id: Math.random().toString(36).slice(2, 9), host: me.key, hostNome: me.name, rotulo, modo, musicas: lista, i: 0, fase: 'tocando', camada: 1, jog: {}, placar: {}, seq: 0 }
    for (const k of ctx.presentes()) S.jog[k] = novoJog(ctx.nomeDe(k))
    sysMsg(`${me.name} começou o Faixa a Faixa: ${rotulo} (${MODOS[modo].nome})`)
    manda()
  }
  // trocar de modo no meio do jogo (só quem criou)
  function mudarModo(novo) {
    if (!ehHost() || !MODOS[novo] || novo === S.modo) return
    const vivos = Object.values(S.jog).filter(j => !j.ok && !j.fora)
    if (novo === 'coletivo') S.camada = Math.max(1, ...vivos.map(j => j.n))
    else if (S.modo === 'coletivo') for (const j of Object.values(S.jog)) j.n = S.camada
    S.modo = novo
    sysMsg(`Modo: ${MODOS[novo].nome}`)
    manda()
  }
  function proxima() {
    if (!ehHost()) return
    if (S.i + 1 >= S.musicas.length) { S.fase = 'fim'; return manda() }
    S.i++; S.fase = 'tocando'; S.camada = 1; S.acertou = null
    for (const j of Object.values(S.jog)) Object.assign(j, { n: 1, ok: 0, art: 0, fora: false, pts: 0, tent: [] })
    manda()
  }
  function revelar() { if (!ehHost() || S.fase !== 'tocando') return; S.fase = 'revela'; manda() }
  function encerrar() { if (!S) return; ctx.send({ estado: { id: S.id, fim: true } }); S = null; parar(); render() }
  const salvos = new Set()
  function avisos(a, b) {
    // anúncios só fora do modo às cegas
    if (b.modo !== 'cegas' && b.fase === 'tocando') for (const [k, j] of Object.entries(b.jog || {})) {
      const x = a?.i === b.i ? a?.jog?.[k] : null
      if (k === me.key || !x) continue
      if (j.ok && !x.ok) toast(`${j.nome} acertou a música!`, 2200)
      else if (j.art && !x.art) toast(`${j.nome} acertou o artista`, 1800)
    }
    // na revelação, cada um guarda o próprio resultado daquela música
    const eu = b.jog?.[me.key], at = b.musicas?.[b.i]
    if (b.fase === 'revela' && eu && at && !salvos.has(`${b.id}:${b.i}`)) {
      salvos.add(`${b.id}:${b.i}`)
      ctx.salvaRes({ data: at.d, n: at.n, r: eu.ok ? 'ok' : eu.art ? 'art' : 'fora', passo: eu.ok || eu.art || 0, pts: eu.pts })
    }
  }

  /* ---------- palpite (cada um confere o seu) ---------- */
  function chuta(g) {
    const m = musica(), j = euJog()
    if (!S || S.fase !== 'tocando' || !m || !j || j.ok || j.fora) return
    let tipo, txt = ''
    if (g.tipo === 'pular') tipo = 'pulou'
    else if (g.tipo === 'artista') {
      const certo = (m.dz && g.id === m.dz.a) || mesmoArtista(g.nome, m.a)
      if (certo && j.art) return toast('O artista você já acertou. Agora a música!', 1800)
      tipo = certo ? 'artista' : 'errou'; txt = g.nome
      if (certo) toast(`Artista certo! +${Math.floor(valor(passoDe(j)) / 2)} — agora a música vale o total.`, 2600)
    } else {
      const certo = (m.dz && g.id === m.dz.t) || (confere(g.t, m.t) && (!g.a || mesmoArtista(g.a, m.a)))
      tipo = certo ? 'certo' : 'errou'; txt = g.a ? `${g.t} — ${g.a}` : g.t
    }
    if (tipo === 'errou') erroVisual()
    const d = { tent: { tipo, txt }, nome: me.name }
    ctx.send(d); if (ehHost()) got(d, me.key)
  }

  /* ---------- áudio: todas as faixas juntas em loop; cada passo só aumenta o volume ---------- */
  let P = null
  async function prepara() {
    const m = musica()
    if (!S || !m || S.fase === 'fim') return parar()
    const id = S.id + ':' + S.i
    if (P?.id !== id) {
      parar()
      const ac = ctx.audioCtx()
      P = { id }
      const base = pasta()
      const bufs = await Promise.all(m.camadas.map(c => fetch(base + c.arq).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).catch(() => null)))
      if (P?.id !== id) return
      const mestre = ac.createGain(); mestre.gain.value = .9; mestre.connect(ctx.saida())
      const ganhos = bufs.map(() => { const g = ac.createGain(); g.gain.value = 0; g.connect(mestre); return g })
      P = { id, ac, bufs, ganhos, mestre, fontes: [], t0: 0, pos: 0, play: false, dur: Math.max(...bufs.filter(Boolean).map(b => b.duration), 1) }
      volumes(); tocar(0)
      return
    }
    volumes()
  }
  function tocar(de = 0) {
    if (!P?.bufs) return
    pararFontes()
    const ac = P.ac, quando = ac.currentTime + .04
    de = ((de % P.dur) + P.dur) % P.dur
    if (ac.state === 'suspended') ac.resume()
    P.fontes = P.bufs.map((b, i) => { if (!b) return null; const s = ac.createBufferSource(); s.buffer = b; s.loop = true; s.loopEnd = b.duration; s.connect(P.ganhos[i]); s.start(quando, Math.min(de, b.duration - .05)); return s })
    P.t0 = quando - de; P.play = true
    atualizaPlayer()
  }
  function pausar() { if (!P?.play) return; P.pos = posicao(); pararFontes(); P.play = false; atualizaPlayer() }
  const posicao = () => !P?.bufs ? 0 : P.play ? ((P.ac.currentTime - P.t0) % P.dur + P.dur) % P.dur : P.pos
  const pula = s => { if (P?.bufs) tocar(posicao() + s) }
  function pararFontes() { for (const s of P?.fontes || []) { try { s?.stop() } catch {} } if (P) P.fontes = [] }
  function abertas() {
    const ps = passos(); if (!ps.length || !S) return new Set()
    const j = euJog()
    const n = S.fase !== 'tocando' || j?.ok || j?.fora ? ps.length : passoDe(j || { n: 1 })
    return new Set(ps.slice(0, n).flatMap(p => p.idx))
  }
  function volumes() {
    if (!P?.ganhos) return
    const on = abertas(), t = P.ac.currentTime
    P.ganhos.forEach((g, i) => g.gain.setTargetAtTime(on.has(i) ? 1 : 0, t, .06))
  }
  function parar() { if (P?.ganhos) { pararFontes(); for (const g of P.ganhos) g.disconnect(); P.mestre.disconnect() } P = null }
  function atualizaPlayer() {
    const pl = tela.querySelector('.fx-player'); if (!pl || !P?.bufs) return
    const p = posicao()
    pl.querySelector('.fx-player__cab').style.width = `${(p / P.dur) * 100}%`
    pl.querySelector('.fx-player__t').textContent = `${fmt(p)} / ${fmt(P.dur)}`
    const b = pl.querySelector('.fx-player__play'); if (b.dataset.st !== String(P.play)) { b.dataset.st = String(P.play); b.replaceChildren(icon(P.play ? 'pause' : 'play')) }
  }
  ;(function loop() { if (S && P?.play) atualizaPlayer(); requestAnimationFrame(loop) })()
  document.addEventListener('keydown', e => {
    if (!S || S.fase === 'fim' || e.key !== ' ' || e.target.closest?.('input, textarea, select')) return
    e.preventDefault(); P?.play ? pausar() : tocar(P?.pos || 0)
  })

  /* ---------- busca do palpite: catálogo local na hora + Deezer com capa ---------- */
  let catalogo = null
  // catálogo da busca de palpites: só baixa quando alguém começa a palpitar
  let pedindoCatalogo = null
  const pedeCatalogo = () => pedindoCatalogo ||= fetch(BASE + 'catalogo.json').then(r => r.json()).then(c => { catalogo = c.map(([t, a]) => ({ t, a, nt: norm(t), na: norm(a) })) }).catch(() => { catalogo = [] })
  const cache = new Map()
  function locais(q) {
    const nq = norm(q), ws = nq.split(' ').filter(Boolean)
    if (!catalogo || !ws.length) return { musicas: [], artistas: [] }
    const pont = x => {
      if (!ws.every(w => x.nt.includes(w) || x.na.includes(w))) return 0
      return (x.nt.startsWith(nq) ? 4 : 0) + (x.na.startsWith(nq) ? 3 : 0) + (x.nt.includes(nq) ? 2 : 0) + 1
    }
    const ms = catalogo.map(x => [pont(x), x]).filter(([p]) => p).sort((a, b) => b[0] - a[0]).slice(0, 6).map(([, x]) => x)
    const arts = [...new Map(catalogo.filter(x => x.na.startsWith(nq) || ws.every(w => x.na.includes(w))).map(x => [x.na, x.a])).values()].slice(0, 2)
    return { musicas: ms.map(x => ({ t: x.t, a: x.a })), artistas: arts.map(nome => ({ nome })) }
  }
  const chute = (() => {
    const input = el('input', { placeholder: 'Qual é a música? (ou o artista)', autocomplete: 'off', spellcheck: false, enterKeyHint: 'send' })
    const lista = el('ul', { className: 'fx-busca__lista', hidden: true })
    const form = el('form', { className: 'fx-busca' }, el('span', { className: 'fx-busca__lupa' }, icon('search')), input, lista)
    let itens = [], sel = -1, timer = 0, ctrl = null, carregando = false, texto = ''
    const fecha = () => { lista.hidden = true }
    function junta(loc, rem) {
      const arts = new Map(), mus = new Map()
      for (const a of rem?.artistas || []) arts.set(norm(a.nome), { tipo: 'artista', id: a.id, nome: a.nome, titulo: a.nome, sub: a.fas ? `${a.fas.toLocaleString('pt-BR')} fãs` : 'Artista', img: a.foto })
      for (const a of loc.artistas) if (!arts.has(norm(a.nome))) arts.set(norm(a.nome), { tipo: 'artista', nome: a.nome, titulo: a.nome, sub: 'Artista' })
      for (const m of rem?.musicas || []) mus.set(norm(m.t) + '|' + norm(m.a), { tipo: 'musica', id: m.id, t: m.t, a: m.a, titulo: m.t, sub: m.album ? `${m.a} · ${m.album}` : m.a, img: m.capa })
      for (const m of loc.musicas) { const k = norm(m.t) + '|' + norm(m.a); if (!mus.has(k)) mus.set(k, { tipo: 'musica', t: m.t, a: m.a, titulo: m.t, sub: m.a }) }
      // as que você conhece (catálogo) primeiro
      const conhecidas = new Set(loc.musicas.map(m => norm(m.t) + '|' + norm(m.a)))
      const ms = [...mus.entries()].sort((a, b) => conhecidas.has(b[0]) - conhecidas.has(a[0])).map(([, x]) => x)
      return [...[...arts.values()].slice(0, 2), ...ms.slice(0, 7)]
    }
    function desenha() {
      const lis = itens.map((x, i) => {
        const li = el('li', { className: 'fx-busca__it' + (i === sel ? ' ativo' : '') + (x.tipo === 'artista' ? ' art' : '') },
          x.img ? el('img', { src: x.img, alt: '', referrerPolicy: 'no-referrer' }) : el('i', { className: 'fx-busca__ini', textContent: (x.titulo || '?')[0].toUpperCase() }),
          el('span', {}, el('b', { textContent: x.titulo }), el('small', { textContent: x.sub })),
          el('em', { textContent: x.tipo === 'artista' ? 'Artista · ½' : 'Música' }))
        li.addEventListener('pointerdown', e => e.preventDefault()) // não tira o foco do campo
        li.addEventListener('click', () => { if (!lista.hidden) escolhe(x) })
        return li
      })
      if (carregando) for (let i = 0; i < (itens.length ? 2 : 4); i++) lis.push(el('li', { className: 'fx-busca__it fx-busca__esq' }, el('i'), el('span', {}, el('b'), el('small'))))
      if (!carregando && !itens.length && texto.length >= 2) lis.push(el('li', { className: 'fx-busca__nada', textContent: `Nada encontrado. Enter chuta “${texto}” mesmo assim.` }))
      lista.replaceChildren(...lis)
      lista.hidden = !lis.length || document.activeElement !== input
    }
    function busca(q) {
      texto = q
      if (!q) { itens = []; carregando = false; return desenha() }
      const c = cache.get(norm(q))
      itens = junta(locais(q), c)
      sel = itens.length && norm(itens.find(x => x.tipo === 'musica')?.titulo || '').startsWith(norm(q)) ? itens.findIndex(x => x.tipo === 'musica') : -1
      carregando = !c && q.length >= 2
      desenha()
      clearTimeout(timer)
      if (!carregando) return
      timer = setTimeout(async () => {
        ctrl?.abort(); ctrl = new AbortController()
        const r = await fetch('api/musica?dz=' + encodeURIComponent(q), { signal: ctrl.signal }).then(r => r.json()).catch(() => null)
        if (texto !== q) return
        if (r) cache.set(norm(q), r)
        carregando = false
        itens = junta(locais(q), r); if (sel >= itens.length) sel = -1
        desenha()
      }, 140)
    }
    function escolhe(x) {
      input.value = ''; texto = ''; itens = []; fecha()
      chuta(x.tipo === 'artista' ? { tipo: 'artista', id: x.id, nome: x.nome } : { tipo: 'musica', id: x.id, t: x.t, a: x.a })
    }
    // avisa os outros que você está digitando um palpite (aparece em cima do seu boneco)
    let dig = false, digT = 0
    const avisaDig = on => { clearTimeout(digT); if (on) digT = setTimeout(() => avisaDig(false), 4000); if (on === dig || !S) return; dig = on; ctx.send({ dig: on }) }
    // quando o catálogo chega, refaz a busca do que já foi digitado
    const comCatalogo = () => { if (!catalogo) pedeCatalogo().then(() => { if (input.value.trim()) busca(input.value.trim()) }) }
    input.addEventListener('focus', comCatalogo)
    input.addEventListener('input', () => { comCatalogo(); busca(input.value.trim()); avisaDig(!!input.value.trim()) })
    input.addEventListener('blur', () => avisaDig(false))
    form.addEventListener('submit', () => avisaDig(false))
    input.addEventListener('focus', () => { if (input.value.trim()) busca(input.value.trim()) }) // volta a lista ao voltar o foco
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!itens.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length; desenha() }
      else if (e.key === 'Escape') fecha()
    })
    input.addEventListener('blur', () => setTimeout(fecha, 120))
    document.addEventListener('pointerdown', e => { if (!form.contains(e.target)) fecha() }, true)
    form.addEventListener('submit', e => {
      e.preventDefault()
      if (sel >= 0 && itens[sel] && !lista.hidden) return escolhe(itens[sel])
      const v = input.value.trim(); if (!v) return
      input.value = ''; texto = ''; itens = []; fecha(); chuta({ tipo: 'musica', t: v })
    })
    return { form, input }
  })()
  function erroVisual() { const f = tela.querySelector('.fx-filme'); if (!f) return; f.classList.remove('erro'); void f.offsetWidth; f.classList.add('erro') }

  /* ---------- tela ---------- */
  // logo: adesivo colado meio torto (mesmo no menu e no jogo)
  const marquee = () => el('div', { className: 'fx-logo', 'aria-label': 'Faixa a Faixa' }, el('b', { textContent: 'Faixa' }), el('i', { textContent: 'a' }), el('b', { textContent: 'Faixa' }))
  // ícones próprios dos atalhos (traço grosso, combinam com o resto)
  const ICONE_ATALHO = {
    dias: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M12 14h2M16 14h0M8 17h2"/></svg>',
    combo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c-4 0-7-2.7-7-6.6 0-3.1 2-5.2 3.6-7 .4 2 1.4 3 2.5 3.4C11 7.7 12.6 5 15.3 3c-.4 2.7.7 4.6 2 6.3 1.1 1.4 1.7 3 1.7 5 0 3.9-3 6.7-7 6.7z"/><path d="M12 21c-1.7 0-3-1.2-3-3 0-1.6 1.2-2.6 2-3.6.3 1 .9 1.5 1.6 1.7.4-1.2 1-2 1.8-2.6.2 1.5 1.6 2.4 1.6 4.4 0 1.8-1.4 3.1-4 3.1z"/></svg>',
    cats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.4 1.4 0 0 1 0 2l-7 7a1.4 1.4 0 0 1-2 0z"/><circle cx="8.3" cy="8.3" r="1.6"/></svg>',
  }
  function botao(ic, txt, fn, cls = '', title = '') { const b = el('button', { type: 'button', className: `fx-btn ${cls}`, title }, icon(ic), txt ? el('span', { textContent: txt }) : ''); b.addEventListener('click', e => { b.blur(); fn(e) }); return b }
  function iconeDe(tipo, vivo) {
    if (tipo === 'dica') return el('span', { className: 'fx-ic fx-ic--dica' }, icon('lightbulb'))
    const c = ICONE[tipo] || '1f3b6'
    return el('img', { className: 'fx-ic' + (tipo === 'baixo' ? ' fx-ic--baixo' : ''), src: `${BASE}icones/${c}.${vivo && ANIMADO.has(c) ? 'webp' : 'svg'}`, alt: '', draggable: false })
  }
  function render() {
    tela.classList.toggle('faixa--on', !!S)
    ctx.onAtivo?.(!!S)
    if (!S) { tela.querySelectorAll(':scope > :not(.fx-fundo)').forEach(n => n.remove()); return }
    const m = musica()
    if (!m && S.fase !== 'fim') { tela.replaceChildren(el('div', { className: 'fx-msg', textContent: 'Carregando…' })); return }
    const at = atualDe()
    const topo = el('header', { className: 'fx-topo' }, marquee(),
      el('div', { className: 'fx-topo__info' },
        S.fase === 'fim' ? el('small', { textContent: 'Placar final' }) : el('small', {}, el('b', { textContent: `${S.i + 1}/${S.musicas.length}` }), ` · ${S.rotulo || nomeDia(at.d)}`),
        (() => { const b = el('button', { type: 'button', className: 'fx-modo', title: ehHost() ? 'Trocar o modo' : MODOS[S.modo].dica, disabled: !ehHost() }, icon(MODOS[S.modo].ic), MODOS[S.modo].nome, ehHost() ? icon('chevron-down') : ''); b.addEventListener('click', e => escolheModo(S.modo, mudarModo, e.currentTarget)); return b })()),
      ehHost() ? botao('x', '', encerrar, 'fx-btn--x', 'Encerrar o jogo') : el('small', { className: 'fx-host', textContent: `host: ${S.hostNome}` }))
    const corpo = S.fase === 'fim' ? placarFinal() : S.fase === 'revela' ? revela(m) : rodada(m)
    tela.replaceChildren(topo, el('div', { className: 'fx-corpo' }, corpo, lado()))
    ctx.hydrate(tela)
    atualizaPlayer()
    if (S.fase === 'tocando' && tela.contains(chute.input) && !ctx.digitando()) chute.input.focus({ preventScroll: true })
  }
  function rodada(m) {
    const ps = passos(), j = euJog() || novoJog('')
    const passo = j.ok || j.fora ? ps.length : passoDe(j)
    const porPasso = {}; for (const t of j.tent) (porPasso[t.c] ||= []).push(t)
    const linhas = ps.map((p, i) => {
      const k = i + 1, aberta = k <= passo, atual = k === passo && !j.ok && !j.fora
      const res = (porPasso[k] || []).map(t => el('span', { className: `fx-tent fx-tent--${t.tipo}` },
        t.tipo === 'pulou' ? 'pulou' : t.tipo === 'artista' ? `artista ✓ ${t.txt}` : t.tipo === 'certo' ? `✓ ${t.txt}` : `✗ ${t.txt}`))
      let nome = aberta ? p.nome : ''
      if (p.dica && aberta) nome = [m.ano ? `Lançada em ${m.ano}` : '', `artista: ${iniciais(m.a)}`].filter(Boolean).join(' · ')
      return el('li', { className: 'fx-linha' + (aberta ? ' on' : '') + (atual ? ' atual' : '') + (j.ok === k ? ' certo' : '') + (p.dica ? ' dica' : '') },
        el('span', { className: 'fx-linha__n', textContent: k }),
        aberta ? iconeDe(p.tipo, atual) : el('span', { className: 'fx-ic fx-ic--fechado' }, icon(p.dica ? 'lightbulb' : 'lock')),
        el('b', { className: 'fx-linha__nome', textContent: nome || (p.dica ? 'Dica' : '') }),
        el('span', { className: 'fx-linha__res' }, ...res),
        el('span', { className: 'fx-linha__pts' + (atual ? ' atual' : ''), textContent: `${valor(k)}` }))
    })
    const filme = el('ol', { className: 'fx-filme' }, ...linhas)
    const player = el('div', { className: 'fx-player' },
      botao('rotate-ccw', '', () => tocar(0), 'fx-player__mini', 'Do começo'),
      botao('chevron-left', '5s', () => pula(-5), 'fx-player__mini fx-player__5', 'Voltar 5 s'),
      (() => { const b = el('button', { type: 'button', className: 'fx-player__play', title: 'Tocar / pausar' }, icon('play')); b.addEventListener('click', () => { b.blur(); P?.play ? pausar() : tocar(P?.pos || 0) }); return b })(),
      botao('chevron-right', '5s', () => pula(5), 'fx-player__mini fx-player__5', 'Avançar 5 s'),
      (() => {
        const tr = el('div', { className: 'fx-player__trilho' }, el('div', { className: 'fx-player__cab' }))
        tr.addEventListener('pointerdown', e => { if (!P?.bufs) return; const r = tr.getBoundingClientRect(); tocar(Math.max(0, Math.min(.999, (e.clientX - r.left) / r.width)) * P.dur) })
        return tr
      })(),
      el('span', { className: 'fx-player__t', textContent: '0:00 / 0:30' }))
    let topo
    if (j.ok) topo = el('div', { className: 'fx-status fx-status--ok' }, icon('check'), el('span', { textContent: `Acertou com ${j.ok} dica${j.ok > 1 ? 's' : ''}! +${j.pts}` }))
    else if (j.fora) topo = el('div', { className: 'fx-status', textContent: j.art ? `Acabaram as dicas — ficou com o artista (+${j.pts}).` : 'Acabaram as dicas. Espere a revelação.' })
    else {
      const ultimo = passo >= ps.length
      topo = el('div', { className: 'fx-chute' },
        el('div', { className: 'fx-vale', title: 'Pontos se acertar a música agora. Cada dica a mais tira 100.' }, el('small', { textContent: 'vale' }), el('b', { textContent: valor(passo) }), el('small', { textContent: j.art ? `já tem ${j.pts}` : 'pts' })),
        chute.form,
        botao(ultimo ? 'flag' : 'skip-forward', ultimo ? 'Desistir' : 'Pular', () => chuta({ tipo: 'pular' }), 'fx-btn--pular', ultimo ? '' : `Abre a próxima dica (passa a valer ${valor(passo + 1)})`))
    }
    return el('section', { className: 'fx-jogo' }, topo, filme, player)
  }
  function revela(m) {
    const quem = Object.entries(S.jog).sort((a, b) => b[1].pts - a[1].pts)
    return el('section', { className: 'fx-revela' },
      el('div', { className: 'fx-ingresso' },
        m.capa ? el('img', { className: 'fx-ingresso__capa', src: pasta() + m.capa, alt: '' }) : el('div', { className: 'fx-ingresso__capa' }, icon('music')),
        el('div', { className: 'fx-ingresso__main' },
          el('small', { className: 'fx-kicker', textContent: S.acertou ? `${S.acertou.key === me.key ? 'Você' : S.acertou.nome} acertou para todo mundo · era` : 'Era' }), el('b', { className: 'fx-ingresso__t', textContent: m.t }),
          el('span', { className: 'fx-ingresso__a', textContent: [m.a, m.album, m.ano].filter(Boolean).join(' · ') }),
          el('ul', { className: 'fx-ingresso__quem' }, ...quem.map(([k, j]) => el('li', {}, ctx.pfp(k, 20), el('b', { textContent: j.nome }),
            el('span', { textContent: j.ok ? `música com ${j.ok} dica${j.ok > 1 ? 's' : ''}` : j.art ? 'só o artista' : 'não acertou' }), el('em', { textContent: j.pts ? `+${j.pts}` : '' })))),
          ehHost() ? botao('skip-forward', S.i + 1 >= S.musicas.length ? 'Ver o placar' : 'Próxima música', proxima, 'fx-btn--ok') : el('small', { className: 'fx-esperando', textContent: `Esperando ${S.hostNome} seguir…` })),
        el('div', { className: 'fx-ingresso__canhoto' }, el('span', { textContent: `${S.i + 1}/${S.musicas.length}` }))))
  }
  function placarFinal() {
    const rank = Object.entries(S.jog).map(([k, j]) => [k, j.nome, S.placar[k] || 0]).sort((a, b) => b[2] - a[2])
    return el('section', { className: 'fx-final' },
      el('b', { className: 'fx-final__t', textContent: 'Placar final' }),
      el('ol', { className: 'fx-podio' }, ...rank.map(([k, nome, p], i) => el('li', { className: i === 0 ? 'top' : '' }, el('span', { className: 'fx-podio__pos', textContent: `${i + 1}º` }), ctx.pfp(k, 32), el('b', { textContent: nome }), el('em', { textContent: `${p}` })))),
      ehHost() ? el('div', { className: 'fx-final__ctl' }, botao('rotate-ccw', 'Jogar mais', () => abrirLobby()), botao('x', 'Fechar', encerrar)) : '')
  }
  function lado() {
    const cegas = S.modo === 'cegas' && S.fase === 'tocando'
    const rank = Object.entries(S.jog).sort((a, b) => (S.placar[b[0]] || 0) - (S.placar[a[0]] || 0))
    return el('aside', { className: 'fx-lado' },
      el('small', { className: 'fx-kicker', textContent: 'Jogadores' }),
      el('ul', { className: 'fx-jogs' }, ...rank.map(([k, j]) => {
        const esconde = cegas && k !== me.key
        const st = esconde ? (j.ok || j.fora ? 'pronto' : 'pensando…') : j.ok ? '✓ música' : j.art ? '½ artista' : j.fora ? 'sem dicas' : ''
        const bolas = !esconde && S.fase === 'tocando' && individual() ? Array.from({ length: total() }, (_, i) => el('i', { className: i < j.n ? (j.ok === i + 1 ? 'ok' : 'on') : '' })) : []
        return el('li', { className: !esconde && j.ok ? 'ok' : '' }, ctx.pfp(k, 26),
          el('span', { className: 'fx-jogs__nome' }, el('b', { textContent: j.nome }), el('span', { className: 'fx-jogs__passos' }, ...bolas, st ? el('small', { textContent: st }) : '')),
          el('em', { textContent: esconde ? '' : S.placar[k] || 0 }))
      })),
      ehHost() && S.fase === 'tocando' ? botao('eye', 'Revelar', revelar, 'fx-btn--sec') : '')
  }

  /* ---------- telinha de modo (lobby e durante o jogo) ---------- */
  function escolheModo(atual, fn, perto) {
    document.querySelector('.fx-modopop')?.remove()
    const pop = el('div', { className: 'fx-modopop' }, el('small', { className: 'fx-kicker', textContent: 'Modo de jogo' }),
      ...Object.entries(MODOS).map(([k, v]) => {
        const b = el('button', { type: 'button', className: 'fx-modocard' + (k === atual ? ' on' : '') }, el('span', { className: 'fx-modocard__ic' }, icon(v.ic)), el('span', {}, el('b', { textContent: v.nome }), el('small', { textContent: v.dica })), k === atual ? icon('check') : '')
        b.addEventListener('click', () => { pop.remove(); fn(k) })
        return b
      }))
    ctx.hydrate(pop)
    document.body.append(pop)
    const r = perto.getBoundingClientRect()
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8)) + 'px'
    pop.style.top = Math.min(r.bottom + 8, innerHeight - pop.offsetHeight - 8) + 'px'
    setTimeout(() => document.addEventListener('pointerdown', function fora(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown', fora) } }), 0)
  }

  /* ---------- tela inicial: jogar hoje em destaque; outros dias, combo e categorias ---------- */
  let modoEscolhido = 'coletivo'
  // menu inicial dentro da tela do cinema: aparece na hora e completa quando os dados chegam
  async function abrirLobby() {
    tela.querySelector('.fx-fundo')?.remove()
    const box = el('div', { className: 'fx-lobby' }, el('div', { className: 'fx-carregando' }, el('i'), el('i'), el('i')))
    const fundo = el('div', { className: 'fx-fundo' }, box)
    const fechar = () => { fundo.remove(); tela.classList.remove('faixa--lobby'); document.querySelector('.fx-modopop')?.remove() }
    fundo.addEventListener('click', e => { if (e.target === fundo) fechar() })
    tela.append(fundo); tela.classList.add('faixa--lobby')
    await carrega(true)
    const hoje = hojeStr()
    const datas = Object.keys(dias || {}).filter(d => d <= hoje).sort().reverse()
    const res = datas.length ? await ctx.verDias(datas) : {}
    const meu = d => res[d]?.[me.key]?.musicas || {}
    const feitas = new Set(datas.flatMap(d => Object.keys(meu(d)).map(n => `${d}#${n}`)))
    const todas = datas.flatMap(d => (dias[d] || []).map(m => ({ ...m, d })))
    const tudo = datas.flatMap(d => Object.values(meu(d)))
    const st = { jogadas: tudo.length, ok: tudo.filter(x => x.r === 'ok').length, art: tudo.filter(x => x.r === 'art').length, fora: tudo.filter(x => x.r === 'fora').length, pts: tudo.reduce((s, x) => s + (x.pts || 0), 0) }
    const listaDias = (ds, pular) => ds.slice().sort().flatMap(d => (dias[d] || []).filter(m => !pular || !feitas.has(`${d}#${m.n}`)).map(m => ({ d, n: m.n })))
    if (!fundo.isConnected) return
    const jogar = (lista, rotulo) => { fechar(); comecar({ lista, rotulo, modo: modoEscolhido }) }
    const bolas = d => el('span', { className: 'fx-dia__bolas' }, ...(dias[d] || []).map(m => { const x = meu(d)[m.n]; return el('i', { className: x ? x.r : '', title: x ? (x.r === 'ok' ? `acertou (+${x.pts})` : x.r === 'art' ? `só o artista (+${x.pts})` : 'errou') : 'não jogou' }) }))
    const ptsDia = d => Object.values(meu(d)).reduce((s, x) => s + (x.pts || 0), 0)
    function topo(voltar, titulo) {
      const modoBtn = el('button', { type: 'button', className: 'fx-modopill', title: 'Trocar o modo' }, icon(MODOS[modoEscolhido].ic), el('span', { textContent: MODOS[modoEscolhido].nome }), icon('chevron-down'))
      modoBtn.addEventListener('click', e => escolheModo(modoEscolhido, k => { modoEscolhido = k; voltar ? voltar() : inicio() }, e.currentTarget))
      box.dataset.tela = voltar ? 'sub' : 'inicio' // a tela inicial usa o layout em grade da tela toda
      return el('div', { className: 'fx-lobby__topo' },
        voltar ? botao('chevron-left', titulo, inicio, 'fx-voltar') : marquee(),
        el('span', { className: 'fx-grow' }), modoBtn, botao('x', '', fechar, 'fx-btn--x'))
    }
    // tela principal
    function inicio() {
      const d = datas.includes(hoje) ? hoje : datas[0]
      const ms = dias[d] || [], feito = Object.keys(meu(d)).length
      const falta = listaDias([d], true)
      const acao = !ms.length ? null : falta.length === ms.length ? 'Jogar' : falta.length ? 'Continuar' : 'De novo' // o progresso já aparece embaixo do dia
      const disco = el('div', { className: 'fx-disco', 'aria-hidden': 'true' }, el('i'))
      const heroi = d ? el('div', { className: 'fx-hero' }, disco,
        el('div', { className: 'fx-hero__txt' }, el('small', { className: 'fx-kicker', textContent: d === hoje ? 'Faixa do dia' : 'Último dia pronto' }), el('b', { className: 'fx-hero__dia', textContent: nomeDia(d) }),
          bolas(d), el('span', { className: 'fx-hero__info', textContent: feito ? `${ptsDia(d)} pts${feito < ms.length ? ` · faltam ${ms.length - feito}` : ' · completo'}` : `${ms.length} músicas novas` })),
        botao('play', acao, () => jogar(falta.length ? falta : listaDias([d], false), nomeDia(d)), 'fx-btn--ok fx-hero__btn fx-palheta')) : el('p', { className: 'fx-vazio', textContent: 'Nenhum dia pronto ainda.' })
      const atalho = (ic, nome, sub, fn) => { const i = el('span', { className: 'fx-atalho__ic' }); i.innerHTML = ICONE_ATALHO[ic]; const b = el('button', { type: 'button', className: `fx-atalho fx-atalho--${ic}` }, i, el('b', { textContent: nome }), el('small', { textContent: sub })); b.addEventListener('click', fn); return b }
      const pendentes = datas.filter(x => listaDias([x], true).length).length
      box.replaceChildren(topo(),
        heroi,
        el('div', { className: 'fx-atalhos' },
          atalho('dias', 'Outros dias', pendentes ? `${pendentes} com músicas novas` : `${datas.length} dias`, outrosDias),
          atalho('combo', 'Combo', 'vários dias seguidos', combo),
          atalho('cats', 'Categorias', 'nacionais, rock, anos 80…', categorias)),
        st.jogadas ? el('div', { className: 'fx-stats' },
          el('span', {}, el('b', { textContent: st.jogadas }), ' jogadas'), el('span', { className: 'ok' }, el('b', { textContent: st.ok }), ' acertos'),
          el('span', { className: 'art' }, el('b', { textContent: st.art }), ' só artista'), el('span', { className: 'fora' }, el('b', { textContent: st.fora }), ' derrotas'),
          el('span', { className: 'pts' }, el('b', { textContent: st.pts.toLocaleString('pt-BR') }), ' pts')) : '')
      ctx.hydrate(box)
    }
    function cartaoDia(d, on, fn) {
      const ms = dias[d] || [], feito = Object.keys(meu(d)).length
      const melhor = Object.values(res[d] || {}).map(v => [v.nome, Object.values(v.musicas || {}).reduce((s, x) => s + (x.pts || 0), 0)]).sort((a, b) => b[1] - a[1])[0]
      const b = el('button', { type: 'button', className: 'fx-dia' + (on ? ' on' : '') + (d === hoje ? ' hoje' : '') + (feito >= ms.length ? ' feito' : '') },
        el('b', { textContent: nomeDia(d, true) }), bolas(d),
        el('small', { textContent: feito ? `${ptsDia(d)} pts${feito < ms.length ? ` · ${feito}/${ms.length}` : ''}` : 'novo' }),
        melhor && melhor[1] ? el('em', { textContent: `🏆 ${melhor[0]}` }) : '')
      b.addEventListener('click', fn)
      return b
    }
    function outrosDias() {
      box.replaceChildren(topo(outrosDias, 'Outros dias'),
        el('div', { className: 'fx-dias' }, ...datas.map(d => cartaoDia(d, false, () => { const f = listaDias([d], true); jogar(f.length ? f : listaDias([d], false), nomeDia(d)) }))))
      ctx.hydrate(box)
    }
    const sel = new Set()
    function combo() {
      const rapidos = [['Últimos 3 dias', datas.slice(0, 3)], ['Última semana', datas.slice(0, 7)], ['Tudo que falta', datas]]
      const qtd = listaDias([...sel], true).length
      const ir = botao('play', sel.size ? `Jogar combo · ${sel.size} dia${sel.size > 1 ? 's' : ''} · ${qtd} músicas` : 'Escolha os dias', () => jogar(listaDias([...sel], true), `combo de ${sel.size} dias`), 'fx-btn--ok fx-btn--grande')
      ir.disabled = !qtd
      box.replaceChildren(topo(combo, 'Combo'),
        el('div', { className: 'fx-chips' }, ...rapidos.map(([nome, ds]) => { const b = el('button', { type: 'button', className: 'fx-chip', textContent: nome }); b.addEventListener('click', () => { sel.clear(); ds.forEach(x => sel.add(x)); combo() }); return b })),
        el('div', { className: 'fx-dias' }, ...datas.map(d => cartaoDia(d, sel.has(d), () => { sel.has(d) ? sel.delete(d) : sel.add(d); combo() }))),
        el('small', { className: 'fx-nota', textContent: 'As músicas que você já respondeu ficam de fora.' }),
        ir)
      ctx.hydrate(box)
    }
    // categorias: as principais em destaque, o resto em "mais categorias". Cada uma sorteia 5 que você ainda
    // não ouviu; quando acaba, deixa repetir. A barrinha mostra quantas já foram ouvidas e quantas faltam.
    const PRINCIPAIS = ['nacionais', 'gringas', 'hinos', 'rock', 'pop', 'recentes']
    let maisCats = false
    function categorias() {
      const cats = CATEGORIAS.map(c => ({ ...c, ms: todas.filter(c.f) })).filter(c => c.ms.length >= 3)
      const cartao = (c, mini) => {
        const novas = c.ms.filter(m => !feitas.has(`${m.d}#${m.n}`)), ouvidas = c.ms.length - novas.length
        const fim = !novas.length
        const b = el('button', { type: 'button', className: 'fx-cat' + (mini ? ' mini' : '') + (fim ? ' fim' : ''), title: fim ? 'Você já ouviu todas: o sorteio repete' : `Sorteia 5 das ${novas.length} que você ainda não ouviu` },
          el('span', { className: 'fx-cat__ic', textContent: c.ic }), el('b', { textContent: c.nome }),
          el('span', { className: 'fx-cat__barra' }, el('i', { style: `width:${Math.round(ouvidas / c.ms.length * 100)}%` })),
          el('small', { textContent: fim ? `todas as ${c.ms.length} ouvidas · repetir` : `${ouvidas} de ${c.ms.length} ouvidas · faltam ${novas.length}` }))
        b.addEventListener('click', () => { const base = (novas.length ? novas : c.ms).slice().sort(() => Math.random() - .5).slice(0, 5); jogar(base.map(m => ({ d: m.d, n: m.n })), c.nome) })
        return b
      }
      const prin = cats.filter(c => PRINCIPAIS.includes(c.id)), resto = cats.filter(c => !PRINCIPAIS.includes(c.id))
      const mais = el('button', { type: 'button', className: 'fx-maiscats' + (maisCats ? ' on' : '') }, `${maisCats ? 'Menos' : 'Mais'} categorias (${resto.length})`, icon('chevron-down'))
      mais.addEventListener('click', () => { maisCats = !maisCats; categorias() })
      box.replaceChildren(topo(categorias, 'Categorias'),
        cats.length ? el('p', { className: 'fx-catnota' }, icon('music'), el('span', {}, 'Cada categoria sorteia ', el('b', { textContent: '5 músicas que você ainda não ouviu' }), '. Quando todas forem ouvidas, dá para repetir.')) : '',
        el('div', { className: 'fx-cats' }, ...prin.map(c => cartao(c))),
        resto.length ? mais : '',
        maisCats ? el('div', { className: 'fx-cats fx-cats--mini' }, ...resto.map(c => cartao(c, true))) : '',
        cats.length ? '' : el('p', { className: 'fx-vazio', textContent: 'As categorias aparecem quando houver músicas suficientes.' }))
      ctx.hydrate(box)
    }
    inicio()
  }
  function iniciar() {
    if (S && !ehHost()) return toast(`Já tem um jogo rolando (host: ${S.hostNome})`)
    abrirLobby()
  }

  window.__faixa = () => ({ S, resp: musica()?.t, artista: musica()?.a }) // diagnóstico/testes
  return {
    got, iniciar, interceptaChat: () => false, ativo: () => !!S, volumes,
    onPeerJoin: id => { if (ehHost()) ctx.send({ estado: S }, id) },
    entrouAlguem: (key, nome) => { if (ehHost() && S.fase !== 'fim' && !S.jog[key]) { S.jog[key] = novoJog(nome); manda() } },
  }
}
