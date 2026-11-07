import { joinRoom, selfId } from './vendor/trystero.js'
import { FONTES, JOGOS, jogoDaMsg } from './core/jogos.js'
import { defaultLayout as coreDefaultLayout, cleanLayout as coreCleanLayout, canSitIn, seatPlan as coreSeatPlan } from './core/plateia.js'
import { ACOES, sha, roomIdDe, guestKey, api, apiStatus, turnServers, lerHello, helloDe, lerShare, criaFilmPC } from './core/rede.js'
import { VOICE_PROFILES, DEFAULT_VOICE, cleanVoice, normalizeAudioPrefs, spatialPosition, gateIsOpen, createSpatialVoice, createCenteredPlayback } from './audio-settings.js'
import BASE from './config.js'
import { ICONS } from './icons.js'
import { EMOJI, MEMES } from './reacoes/reacoes.js'
import { loadRnnoise, RnnoiseWorkletNode, loadGtcrn, GtcrnWorkletNode } from './vendor/nsup/index.js'
import { criaRadio, parseRadio } from './radio.js'
let faixa = null // minijogo Faixa a Faixa, ver faixa.js
let coup = null // Coup na mesa, ver coup.js
let descarte = null // Uno (cartas de cor e número), ver descarte.js
let dobradinha = null // Dobradinha (escalada de cartas no boteco), ver dobradinha.js
let douLheUma = null // Dou-lhe Uma (leilão de listas), ver doulheuma.js
let naTesta = null // Na Testa (quem sou eu?), ver natesta.js
let quadro = null // Quadro a Quadro (adivinhe o filme pelo frame), ver quadro.js
let parPerfeito = null // Red Flags (monte um pretendente), ver parperfeito.js
let amigosDeBosta = null // Amigos de Merda (votação entre amigos), ver amigosdebosta.js
let radio = null // rádio da sala (música de fundo), ver radio.js
// presença pelo servidor (ver heartbeat)
const srvPres = new Map() // key -> nome de quem o servidor vê, mas não está ligado direto
const ghostWarned = new Set()
let presTimer = 0, pollTimer = 0
let canal = '' // canal atual ('' = principal); vira o ?sala= da sala P2P
// assistir junto (ver parseMidia)
let midia = null, midiaEl = null, mplayer = null, mready = false, mquiet = 0, mrecv = 0, mseq = 0, mfim = -1, mbuf = 0, spState = null, spIFrame = null

/* ---------- Configuração + tema ---------- */
const params = new URLSearchParams(location.search)
// tema: ?tema= na URL, senão o tema da sessão do convite (/nome-do-filme), senão o do config
let temaConvite = ''
{
  const s0 = location.pathname.split('/').filter(Boolean)[0] || ''
  if (!params.get('tema') && /^[a-z0-9][a-z0-9-]*$/.test(s0)) {
    try { const r = await fetch('api/convite?s=' + s0 + '&p=x'); if (r.ok) temaConvite = (await r.json())?.convite?.tema || '' } catch {}
  }
}
const TEMA = params.get('tema') ?? (temaConvite || BASE.tema || '')
let THEME = {}
if (TEMA && /^[\w-]+$/.test(TEMA)) {
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `themes/${TEMA}/theme.css` }))
  document.body.classList.add('tema-' + TEMA)
  try { THEME = (await import(`./themes/${TEMA}/theme.js`)).default || {} } catch {}
}
// o que estiver preenchido no config vale mais que o padrão do tema
const CFG = { ...BASE }
for (const [k, v] of Object.entries(THEME)) if (!CFG[k]) CFG[k] = v
const PEOPLE = CFG.pessoas || []
document.title = CFG.nome + (CFG.subtitulo ? ' · ' + CFG.subtitulo : '')
document.querySelectorAll('[data-cfg]').forEach(e => {
  const v = CFG[e.dataset.cfg]
  if (e.tagName === 'IMG') { if (v) { e.src = v; e.hidden = false } }
  else { e.textContent = v || ''; if (!v) e.hidden = true }
})

/* ---------- Ícones ---------- */
function setIcon(svg, name) {
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.dataset.icon = name
  svg.innerHTML = ICONS[name] || ''
}
const icon = name => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); setIcon(s, name); return s }
document.querySelectorAll('svg[data-icon]').forEach(s => setIcon(s, s.dataset.icon))
const iconOf = btn => btn.querySelector('svg')

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s)
const theater = $('#theater')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('cine.' + k)) } catch { return null } },
  set(k, v) { try { localStorage.setItem('cine.' + k, JSON.stringify(v)) } catch {} },
  del(k) { try { localStorage.removeItem('cine.' + k) } catch {} },
}
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter(k => k !== '' && k != null)); return e }
const pct = v => `${Math.round(v * 100)}%`

// Pessoas: fixas (config) ou convidados ("g:nome")
const GUEST_COLORS = ['#7dd3fc', '#a7f3d0', '#fca5a5', '#fcd34d', '#c4b5fd', '#f9a8d4', '#fdba74', '#86efac']
function person(key, name) {
  const p = PEOPLE.find(x => x.id === key)
  if (p) return p
  const n = name || (key || '').slice(2) || 'Visitante'
  const h = [...n].reduce((a, c) => a + c.charCodeAt(0), 0)
  return { id: key, nome: n, cor: GUEST_COLORS[h % GUEST_COLORS.length], guest: true, ...(CFG.convidado || {}) }
}
function pfpImg(key, size, name) {
  const p = person(key, name)
  const txt = () => el('span', { className: 'pfp pfp--txt', textContent: (p.nome || '?')[0].toUpperCase(), style: `background:${p.cor};width:${size}px;height:${size}px;font-size:${Math.round(size * .45)}px` })
  if (!p.foto) return txt()
  const img = el('img', { className: 'pfp', alt: '', width: size, height: size, src: p.foto })
  img.onerror = () => img.replaceWith(txt())
  return img
}

let toastTimer
function toast(msg, ms = 2800) {
  const t = $('#toast')
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), ms)
}

/* ---------- Preferências (salvas no navegador e no servidor, por pessoa) ---------- */
const DEFAULT_PREFS = { vol: 1, vvol: 1, pvol: {}, tvol: {}, tmute: {}, nudges: true, spatial: false, spatialVersion: 3, board: .85, master: 1, mvol: .45, sonsRec: [], sfx: .6, vmode: 'open', pttKey: 'KeyV', pttLabel: 'V', mic: '', extra: '', chat: true, subs: true, t: 0, entryMuted: false, duck: false, pmute: {}, boardpvol: {}, boardmute: {}, fxpvol: {}, fxpmute: {}, jogoVol: 1, jogoMudo: false }
const prefs = Object.assign({}, DEFAULT_PREFS, normalizeAudioPrefs(store.get('prefs')))
let prefsTimer
function savePrefs() {
  prefs.t = Date.now()
  store.set('prefs', prefs)
  if (me.key) store.set('prefs:' + me.key, prefs)
  clearTimeout(prefsTimer)
  if (me.key) prefsTimer = setTimeout(() => api('prefs', { method: 'PUT', body: { k: me.key, prefs } }), 1500)
}
async function loadPrefs() {
  const r = await api('prefs?k=' + encodeURIComponent(me.key))
  if (r?.prefs && r.prefs.t > (prefs.t || 0)) { Object.assign(prefs, normalizeAudioPrefs(r.prefs)); store.set('prefs', prefs); store.set('prefs:' + me.key, prefs) }
  applyPrefs()
}

/* ---------- Mixer de áudio ----------
   Transmissões, vozes e avisos passam pelo Web Audio: até 200% e volume por pessoa. */
const mix = { ac: null, movie: null, voice: null, sfx: null, peer: new Map(), userSounds: new Set() }
let needGesture = false
function audioCtx() {
  if (!mix.ac) {
    mix.ac = new AudioContext({ latencyHint: 'interactive' })
    // volume geral: tudo passa por ele antes da saída
    mix.master = mix.ac.createGain(); mix.master.gain.value = prefs.master ?? 1; mix.master.connect(mix.ac.destination)
    mix.movie = mix.ac.createGain(); mix.movie.connect(mix.master)
    mix.voice = mix.ac.createGain()
    // canal de vozes: compressor + ganho de compensação. Iguala quem fala baixo com quem fala alto e deixa as vozes
    // na frente dos sons e da música (antes as vozes entravam cruas e ficavam baixas perto dos efeitos).
    mix.voiceComp = new DynamicsCompressorNode(mix.ac, { threshold: -28, knee: 10, ratio: 3.5, attack: .004, release: .22 })
    mix.voiceMakeup = mix.ac.createGain(); mix.voiceMakeup.gain.value = 1.9
    mix.voiceLim = new DynamicsCompressorNode(mix.ac, { threshold: -2, knee: 0, ratio: 20, attack: .001, release: .1 })
    mix.voice.connect(mix.voiceComp).connect(mix.voiceMakeup).connect(mix.voiceLim).connect(mix.master)
    mix.sfx = mix.ac.createGain(); mix.sfx.connect(mix.master)
    mix.jogo = mix.ac.createGain(); mix.jogo.gain.value = somJogo(); mix.jogo.connect(mix.master) // tudo que os jogos tocam passa por aqui
    mix.board = mix.ac.createGain(); mix.board.gain.value = prefs.board
    // limitador do soundboard: nenhum som passa do teto, mesmo dois tocando juntos
    mix.boardLim = new DynamicsCompressorNode(mix.ac, { threshold: -9, knee: 4, ratio: 10, attack: .002, release: .2 })
    mix.board.connect(mix.boardLim).connect(mix.master)
    mix.movieAn = mix.ac.createAnalyser(); mix.movieAn.fftSize = 2048; mix.movie.connect(mix.movieAn)
    mix.movie.gain.value = prefs.vol; mix.voice.gain.value = me.deaf ? 0 : prefs.vvol; mix.sfx.gain.value = prefs.sfx
    loadSfx()
    applyOutputDevice(prefs.output).catch(() => {})
  }
  if (mix.ac.state === 'suspended') {
    mix.ac.resume().catch(() => {})
    setTimeout(() => { if (mix.ac.state === 'suspended') { needGesture = true; toast('Clique em qualquer lugar para ligar o som', 60000) } }, 800)
  }
  return mix.ac
}
document.addEventListener('pointerdown', () => {
  if (mix.ac?.state === 'suspended') { mix.ac.resume(); $('#toast').classList.remove('show') }
  if (needGesture) { needGesture = false; document.querySelectorAll('video, audio').forEach(v => v.play().catch(() => {})) }
})
function applyPeerVols() {
  mix.peer.forEach(({ g }, id) => { g.gain.value = personGain(peers.get(id)?.key, 'voice') })
  mix.userSounds.forEach(({ g, key, kind }) => { g.gain.value = personGain(key, kind) })
}

const AUDIO_CHANNELS = {
  voice: { values: 'pvol', muted: 'pmute', label: 'Voz', icon: 'mic' },
  movie: { values: 'tvol', muted: 'tmute', label: 'Projeção', icon: 'film' },
  board: { values: 'boardpvol', muted: 'boardmute', label: 'Soundboard', icon: 'volume-2' },
  effects: { values: 'fxpvol', muted: 'fxpmute', label: 'Efeitos', icon: 'bell' },
}
function personGain(key, kind) {
  const ch = AUDIO_CHANNELS[kind]
  return prefs[ch.muted]?.[key] ? 0 : prefs[ch.values]?.[key] ?? 1
}
function connectUserSound(src, destination, key, kind) {
  const g = mix.ac.createGain(); g.gain.value = personGain(key, kind)
  src.connect(g).connect(destination)
  const item = { g, key, kind }; mix.userSounds.add(item)
  src.onended = () => { mix.userSounds.delete(item); src.disconnect(); g.disconnect() }
}
let ducking = false
const movieLevel = () => me.deaf ? 0 : prefs.vol * (ducking ? .3 : 1)
function somJogo() { return me.deaf || prefs.jogoMudo ? 0 : prefs.jogoVol ?? 1 }
function applyAudioLevels() {
  try { setMidiaVol() } catch {}
  try { radio?.vol() } catch {}
  if (mix.ac) {
    mix.movie.gain.cancelScheduledValues(mix.ac.currentTime)
    if (me.deaf) mix.movie.gain.setValueAtTime(0, mix.ac.currentTime)
    else mix.movie.gain.setTargetAtTime(movieLevel(), mix.ac.currentTime, ducking ? .12 : .5)
    mix.voice.gain.value = me.deaf ? 0 : prefs.vvol
    mix.sfx.gain.value = me.deaf ? 0 : prefs.sfx
    mix.jogo.gain.value = somJogo()
    mix.board.gain.value = me.deaf ? 0 : prefs.board
    mix.master.gain.value = prefs.master ?? 1
  }
  applyTileVols()
}
function updateDucking() {
  const speaking = (me.speaking && !me.muted) || [...peers.values()].some(p => p.speaking && !p.muted && personGain(p.key, 'voice') > 0 && prefs.vvol > 0)
  const want = !!prefs.duck && !me.deaf && speaking
  if (want === ducking) return
  ducking = want; applyAudioLevels()
}

/* ---------- Sons de aviso ---------- */
const sfxBuf = {}
async function loadSfx() {
  for (const [name, url] of Object.entries(CFG.sons || {})) {
    if (!url) continue
    fetch(url).then(r => r.arrayBuffer()).then(b => mix.ac.decodeAudioData(b)).then(buf => { sfxBuf[name] = buf }).catch(() => {})
  }
}
let lastSfx = {}
function sfx(name, key) {
  const buf = sfxBuf[name]
  if (!buf || !mix.ac || prefs.sfx <= 0) return
  const now = performance.now()
  if (now - (lastSfx[name + ':' + (key || '')] || 0) < 250) return // evita som empilhado
  lastSfx[name + ':' + (key || '')] = now
  const s = mix.ac.createBufferSource()
  s.buffer = buf
  connectUserSound(s, mix.sfx, key, 'effects')
  s.start()
}

/* ---------- Portão (entrada) ----------
   Tela da sessão: filme, data e cartões de quem pode entrar. Com convite (/nome-do-filme) não pede senha. */
const me = { key: '', name: '', muted: true, speaking: false, admin: false, deaf: false, away: false, seat: -1, typing: false, hidden: false }
let roomPw = ''
// perfis: foto e cor que cada pessoa escolheu na conta
const ORIG = Object.fromEntries(PEOPLE.map(p => [p.id, { foto: p.foto, cor: p.cor }]))
function applyPerfis(perfis) {
  for (const p of PEOPLE) { const x = perfis?.[p.id] || {}; p.foto = x.foto || ORIG[p.id].foto; p.cor = x.cor || ORIG[p.id].cor }
}
applyPerfis((await api('conta?perfis=1'))?.perfis)
// /nome-do-filme = convite do grupo; /nome-do-filme/<inicial> = link pessoal (entra logado, vale uma vez)
const [slug = '', ini = ''] = location.pathname.split('/').filter(Boolean).map(decodeURIComponent)
let invite = null, inviteMissing = false, linkUsed = false, fromLink = false
let conta = null
{
  // login salvo: o token do localStorage ou, se o navegador apagou, o cookie (o servidor lê sozinho).
  // Só esquece o login quando o servidor diz que ele não vale mais (404); erro de rede não desloga ninguém.
  const t = store.get('conta'), salvo = store.get('sess')
  const r = await apiStatus('conta' + (t ? '?t=' + encodeURIComponent(t) : ''))
  if (r.data?.key) { conta = { ...r.data, token: r.data.token || t }; store.set('conta', conta.token) }
  else if (r.status === 404) store.del('conta')
  else if (t && salvo?.pw && salvo.key) conta = { key: salvo.key, nome: salvo.name || person(salvo.key).nome, pw: salvo.pw, token: t }
  const old = store.get('sess')
  if (!conta && old?.pw && old.key) {
    const r = await api('conta', { method: 'POST', body: { op: 'login', pw: old.pw, key: old.key, nome: old.name } })
    if (r?.token) { store.set('conta', r.token); conta = { key: old.key, nome: old.name || person(old.key).nome, pw: old.pw, token: r.token }; store.set('sess', { key: old.key, name: old.name }) }
  }
}
if (/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  const r = await api('convite?s=' + slug + (ini ? '&p=' + encodeURIComponent(ini) : ''))
  if (r?.convite) invite = r.convite
  else inviteMissing = true
  if (ini && !conta) {
    const segredo = new URLSearchParams(location.hash.slice(1)).get('ticket') || ''
    const res = await api('convite', { method: 'POST', body: { op: 'resgatar', s: slug, p: ini, segredo } })
    if (res?.conta?.token) {
      conta = res.conta; invite = res.convite; fromLink = true
      store.set('conta', conta.token); store.set('sess', { key: conta.key, name: conta.nome })
    } else linkUsed = true
  }
  if (ini && conta && invite) {
    invite.pw = conta.pw
    history.replaceState(null, '', '/' + slug + location.search)
  }
}
canal = params.get('sala') || invite?.sala || ''

async function login(pw, key, name) {
  const r = await api('conta', { method: 'POST', body: { op: 'login', pw, key, nome: name } })
  if (r?.token) { store.set('conta', r.token); conta = { key, nome: name, pw, token: r.token } }
  if (r?.token) store.set('sess', { key, name, pw }) // a senha fica junto: se o token sumir, entra de novo sozinho
  else store.set('sess', { key, name })
  return !!r?.token
}
{
  const film = invite?.filme || CFG.subtitulo || ''
  const when = 'É só entrar'
  $('#lobbyWhen').textContent = `Sessão · ${when}`
  $('#lobbyTitle').textContent = film || CFG.nome
  $('#lobbySub').textContent = film ? `no ${CFG.nome}` : 'Escolha quem você é para entrar'
  if (invite) $('#pwField').hidden = true
  if (invite) renderTicket(invite, when)
}
// Convite = ingresso: pôster, filme, quando e um canhoto destacável
function renderTicket(inv, when) {
  $('#gate').classList.add('lobby--ticket')
  const n = inv.pessoas.length + (inv.convidados ? 1 : 0)
  const num = String([...(slug || 'x')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 99991, 7)).padStart(5, '0')
  const poster = inv.poster ? el('img', { className: 'ticket__poster', src: inv.poster, alt: '' }) : el('div', { className: 'ticket__poster ticket__poster--none' }, icon('film'))
  $('.lobby__head').replaceChildren(el('div', { className: 'ticket' },
    poster,
    el('div', { className: 'ticket__main' },
      el('span', { className: 'ticket__kicker', textContent: `${CFG.nome} apresenta` }),
      el('h1', { className: 'ticket__film', textContent: inv.filme || 'Bora pro Cineminha?' }),
      inv.nota != null ? el('p', { className: 'ticket__rating', textContent: `★ ${inv.nota}${inv.fonteNota ? ' · ' + inv.fonteNota : ''}${inv.ano ? ' · ' + inv.ano : ''}` }) : '',
      el('div', { className: 'ticket__meta' },
        el('div', {}, el('small', { textContent: 'Sessão' }), el('b', { textContent: when })),
        el('div', {}, el('small', { textContent: 'Sala' }), el('b', { textContent: CFG.nome })),
        el('div', {}, el('small', { textContent: 'Convidados' }), el('b', { textContent: String(n) })))),
    el('div', { className: 'ticket__stub' }, el('span', { textContent: 'Ingresso' }), el('b', { textContent: 'Nº ' + num }), el('i', {}, icon('ticket')))))
}
const whoEl = $('#who')
const allowed = id => !linkUsed && (!invite || invite.pessoas.includes(id) || id === 'kellyson') // o dono entra em qualquer sessão
const guestsOk = !linkUsed && CFG.convidados && (!invite || invite.convidados)
function whoCard(value, p, disabled, note) {
  const art = el('span', { className: 'whocard__art' })
  if (p.boneco) art.append(el('img', { className: 'whocard__boneco', src: p.boneco, alt: '', draggable: false }))
  art.append(p.foto ? el('img', { className: 'pfp whocard__pfp', src: p.foto, alt: '', width: 44, height: 44 }) : pfpImg(value, 44))
  const lab = el('label', { className: 'whocard' + (disabled ? ' absent' : ''), title: note || '' },
    el('input', { type: 'radio', name: 'who', value, disabled: !!disabled }),
    el('span', { className: 'whocard__in' }, art, el('b', { textContent: p.nome }), note ? el('small', { textContent: note }) : ''))
  lab.style.setProperty('--c', p.cor || 'var(--accent)')
  return lab
}
const ocupado = id => !!invite?.ocupados?.includes(id) && conta?.key !== id
PEOPLE.filter(p => allowed(p.id) && !ocupado(p.id)).forEach(p => whoEl.append(whoCard(p.id, p, p.ausente, p.ausente ? 'não vem hoje' : '')))
if (guestsOk) whoEl.append(whoCard('guest', { nome: 'Convidado', cor: '#a9b6bf', ...(CFG.convidado || {}) }))
if (invite && !whoEl.querySelector('input')) whoEl.append(el('p', { className: 'who__vazio', textContent: 'Todo mundo deste convite já entrou. Se você é um deles em outro aparelho, peça um link pessoal.' }))
whoEl.addEventListener('change', () => {
  const picked = document.querySelector('input[name=who]:checked')?.value
  $('#guestField').hidden = picked !== 'guest'
  if (picked === 'guest') return $('#guestName').focus()
  // com a senha já conhecida (convite ou digitada), clicar no cartão já entra
  if (invite || $('#pw').value.trim()) $('#gateForm').requestSubmit()
})
function gateErr(msg) {
  $('#gateErr').textContent = msg
  $('#gateErr').hidden = false
  $('#gate').classList.remove('shake'); void $('#gate').offsetWidth; $('#gate').classList.add('shake')
}
if (inviteMissing) gateErr('Esse convite não existe mais. Entre com a senha da sala.')
const okPw = async pw => crypto.subtle ? await sha(pw) === CFG.senhaHash : true
$('#gateForm').addEventListener('submit', async e => {
  e.preventDefault()
  const pw = invite ? invite.pw : $('#pw').value.trim().toLowerCase()
  if (!pw) { $('#pw').focus(); return gateErr('Digite a senha da sala.') }
  if (!await okPw(pw)) return gateErr('Senha errada.')
  const picked = document.querySelector('input[name=who]:checked')?.value
  if (!picked) return gateErr('Escolha quem você é.')
  let key, name
  if (picked === 'guest') {
    name = $('#guestName').value.trim().slice(0, 24)
    if (!name) return gateErr('Digite seu nome.')
    key = guestKey(name)
  } else { key = picked; name = person(key).nome }
  // link de grupo: ocupa o lugar (o cartão some para quem abrir depois)
  if (invite && !key.startsWith('g:')) {
    const r = await api('convite', { method: 'POST', body: { op: 'ocupar', s: slug, key, pw } })
    if (r?.ocupado) return gateErr(`${name} já entrou por este convite. Se é você em outro aparelho, peça um link pessoal.`)
  }
  if (!await login(pw, key, name)) return gateErr('Não foi possível entrar. Tente novamente.')
  enter(pw, key, name)
})
async function enter(pw, key, name) {
  if (me.key) return
  turnServers(pw)
  me.key = key; me.name = name; roomPw = pw
  store.set('sess', { key, name, pw }) // entrou: da próxima vez é direto, como esta pessoa
  me.seat = Number.isInteger(store.get('seat')) ? store.get('seat') : -1
  me.since = Date.now()
  Object.assign(prefs, DEFAULT_PREFS, normalizeAudioPrefs(store.get('prefs:' + key)))
  await loadPrefs()
  renderAccountBadge()
  $('#admHeading').hidden = me.key !== 'kellyson'
  $('#admLogin').hidden = me.key !== 'kellyson'
  abreCortinaEntrada()
  setTimeout(ligaLateral, 300)
  $('#gate').hidden = true
  document.body.classList.remove('locked')
  document.documentElement.classList.remove('auto')
  audioCtx()
  start(pw)
  if (ESTADO) { micOn(false, ESTADO.muted); if (ESTADO.deaf) setDeaf(true, true); if (ESTADO.rascunho) $('#chatInput').value = ESTADO.rascunho }
  else micOn(true)
  admRestore()
  if (!VOLTA) setTimeout(() => sfx('euEntrei'), 400)
  loadCanais()
}

/* ---------- WebRTC: Opus estéreo nas transmissões ---------- */
const FilmPC = criaFilmPC({ aoMudar: (pc, estado) => iceReport(pc, estado), evento: (k, t) => evento(k, t) })
async function iceReport(pc, estado) {
  if (pc._rep === estado) return
  pc._rep = estado
  let via = ''
  try {
    const st = await pc.getStats()
    st.forEach(r => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') { const l = st.get(r.localCandidateId), rm = st.get(r.remoteCandidateId); via = `${l?.candidateType}/${l?.protocol} ↔ ${rm?.candidateType}` } })
  } catch {}
  api('sala', { method: 'POST', body: { op: 'diag', pw: roomPw, d: { key: me.key, estado, turn: pc._turn, cands: [...pc._cands], via, ua: navigator.userAgent.slice(0, 180) } } })
}
const pcsOf = () => { const p = room?.getPeers?.() || {}; return p instanceof Map ? p : new Map(Object.entries(p)) }

/* ---------- Recarregar sem cara de recarregar ----------
   Quem recarrega (F5, versão nova, pedido do admin) vê "Reconectando…" por cima até a sala voltar,
   e não ouve de novo o "entrou" de quem já estava lá. Antes de recarregar avisa os outros,
   que tratam como uma queda rápida: o lugar fica apagado e ninguém vê "saiu"/"entrou". */
const VOLTA = (() => {
  try {
    const v = JSON.parse(sessionStorage.getItem('cine.volta') || 'null'); sessionStorage.removeItem('cine.volta')
    if (v && Date.now() - v.t < 60000) return v
    if (performance.getEntriesByType?.('navigation')[0]?.type === 'reload') return { t: Date.now(), m: 'f5' }
  } catch {}
  return null
})()
// o que a pessoa estava fazendo antes de recarregar: microfone, som e o texto meio digitado no chat
const ESTADO = VOLTA ? (() => { try { const e = JSON.parse(sessionStorage.getItem('cine.estado') || 'null'); return e && Date.now() - e.t < 120000 ? e : null } catch { return null } })() : null
function guardaEstado() { try { sessionStorage.setItem('cine.estado', JSON.stringify({ t: Date.now(), muted: !!me.muted, deaf: !!me.deaf, rascunho: $('#chatInput')?.value || '' })) } catch {} }
const voltaAte = VOLTA ? Date.now() + 20000 : 0
const voltandoAgora = () => Date.now() < voltaAte // durante a volta, quem já estava na sala não é anunciado de novo
const voltaTxt = m => m === 'versao' ? 'Atualizando…' : 'Reconectando…'
function voltaTela(m) { const v = $('#volta'); if (!v) return; $('#voltaTxt').textContent = voltaTxt(m); v.classList.remove('sai'); v.classList.add('show') }
function voltaFim() {
  const v = $('#volta'), h = document.documentElement
  if (!v || v.classList.contains('sai') || (!v.classList.contains('show') && !h.classList.contains('voltando'))) return
  v.classList.add('sai')
  setTimeout(() => { v.classList.remove('show', 'sai'); h.classList.remove('voltando') }, 350)
}
if (VOLTA) { $('#voltaTxt').textContent = voltaTxt(VOLTA.m); setTimeout(voltaFim, 10000) }
let recarregando = false
function recarregar(motivo) {
  if (recarregando) return
  recarregando = true
  try { sessionStorage.setItem('cine.volta', JSON.stringify({ t: Date.now(), m: motivo })) } catch {}
  guardaEstado()
  voltaTela(motivo)
  try { actions?.hello.send({ ...helloMsg(), volta: 1 }) } catch {}
  setTimeout(() => location.reload(), 350)
}

/* ---------- Atualização automática ---------- */
let baseVer = null, baseCss = null, cssVer = '', pendingUpdate = false, recargaMarcada = false, avisouJogo = false
// só o visual mudou: troca as folhas de estilo no lugar (a nova carrega antes de a antiga sair, sem piscar)
function trocaCss(c) {
  cssVer = c
  document.querySelectorAll('link[rel=stylesheet]').forEach(old => {
    const u = new URL(old.href, location.href)
    if (u.origin !== location.origin) return
    u.searchParams.set('c', c)
    const novo = old.cloneNode()
    novo.href = u.pathname.replace(/^\//, '') + u.search
    novo.onload = novo.onerror = () => old.remove()
    old.after(novo)
  })
}
async function checkVersion() {
  try {
    const { v, c } = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json()
    if (baseVer === null) { baseVer = v; baseCss = c; return }
    if (v === baseVer) { if (c && c !== baseCss) { baseCss = c; trocaCss(c) } return }
    const jogando = () => ativos().length > 0
    if (myShare) {
      if (!pendingUpdate) toast('Versão nova no ar: atualiza quando você parar de projetar', 6000)
      pendingUpdate = true
    } else if (jogando()) {
      // partida rolando: espera ela acabar (esta checagem roda de novo a cada 20 s)
      if (!avisouJogo) toast('Versão nova no ar: atualiza quando o jogo acabar', 5000)
      avisouJogo = true
    } else if (!recargaMarcada) {
      // cada um recarrega num instante diferente: a sala não cai inteira de uma vez
      recargaMarcada = true
      setTimeout(() => { if (myShare) pendingUpdate = true; else if (jogando()) recargaMarcada = false; else recarregar('versao') }, Math.random() * 5000)
    }
  } catch {}
}
checkVersion()
setInterval(checkVersion, 20000)

/* ---------- Rede (P2P via Trystero) ---------- */
const peers = new Map() // peerId -> {key, name, speaking, muted, rtt}
const shareInfo = new Map() // peerId -> {kind, game, paused, subs, n}
let actions = null, room = null, roomId = ''
const messages = []
const sumindo = new Map() // key -> {name, seat, timer}: caiu ou recarregou; o "saiu" só aparece se não voltar logo
const avisouVolta = new Map() // key -> até quando esperar (avisou que ia recarregar)
const saiuDeVez = new Set() // keys que avisaram que estão saindo (trocar de canal): "saiu" na hora
const QUEDA_MS = 12000, RECARGA_MS = 45000
function someDaSala(p) {
  const avisou = (avisouVolta.get(p.key) || 0) > Date.now()
  const ms = saiuDeVez.delete(p.key) ? 0 : avisou ? RECARGA_MS : QUEDA_MS
  evento('saiu', avisou ? `${p.name} está recarregando` : `perdeu a conexão com ${p.name}`)
  if (!avisou) quedaDe(p.key)
  const fim = () => {
    sumindo.delete(p.key); avisouVolta.delete(p.key)
    if ([...peers.values()].some(x => x.key === p.key)) return
    sysMsg(`${p.name} saiu`); sfx('saiu', p.key); renderAll()
  }
  clearTimeout(sumindo.get(p.key)?.timer)
  if (!ms) return fim()
  sumindo.set(p.key, { name: p.name, seat: p.seat, timer: setTimeout(fim, ms) })
}
const seen = new Set()
let msgN = 0
let banner = null // último aviso do admin (reenviado a quem chega)

async function start(pw) {
  const extra = canal
  roomId = await roomIdDe(pw, extra)
  const ice = await Promise.race([turnServers(pw), new Promise(r => setTimeout(() => r([]), 8000))])
  if (!ice.length) console.warn('Sem ponte TURN: conexão só direta')
  room = joinRoom({ appId: CFG.appId, password: pw, rtcPolyfill: FilmPC, turnConfig: ice }, roomId)
  const mk = n => room.makeAction(n)
  actions = Object.fromEntries(ACOES.map(n => [n, mk(n)]))

  room.onPeerJoin = id => {
    peers.set(id, { key: '', name: '', speaking: false })
    actions.hello.send(helloMsg(), { target: id })
    if (messages.some(m => !m.sys)) actions.hist.send(messages.filter(m => !m.sys).slice(-80), { target: id })
    if (msgReacts.size) actions.mre.send({ all: reactsDump() }, { target: id })
    if (midia) actions.mid.send(midiaSnap(), { target: id })
    radio?.onPeerJoin(id)
    faixa?.onPeerJoin(id)
    if (mic) room.addStream(mic.stream, { target: id, metadata: { voice: 1 } })
    if (myShare) {
      room.addStream(myShare.stream, { target: id, metadata: { screen: 1 } })
      actions.share.send(shareMsg(), { target: id })
      if (myShare.subs) actions.leg.send({ t: tiles.get(selfId)?.sub.dataset.raw || '' }, { target: id })
      setTimeout(tuneSenders, 2000)
    }
    if (banner) actions.adm.send(banner, { target: id })
    renderAll()
    pingLoop(id)
  }
  room.onPeerLeave = id => {
    const p = peers.get(id)
    peers.delete(id)
    if (p?.name) someDaSala(p)
    if (shareInfo.has(id)) { shareInfo.delete(id); removeTile(id) }
    dropVoice(id)
    renderAll()
  }

  actions.hello.onMessage = (d, { peerId }) => {
    const h = lerHello(d, PEOPLE)
    if (!h) return
    if (d.volta) avisouVolta.set(d.key, Date.now() + RECARGA_MS)
    if (d.sai) saiuDeVez.add(d.key)
    if (d.perfilAtualizado) api('conta?perfis=1').then(r => { if (r?.perfis) { applyPerfis(r.perfis); refreshProfileUI() } })
    const p = peers.get(peerId) || {}
    const isNew = !p.name
    const name = h.name
    Object.assign(p, { key: h.key, name, speaking: h.speaking, muted: h.muted, deaf: h.deaf, away: h.away, seat: h.seat, typing: h.typing, hidden: h.hidden, mesa: h.mesa })
    peers.set(peerId, p)
    if (d.key === me.key) dropVoice(peerId)
    const voltou = sumindo.has(d.key)
    if (voltou) { clearTimeout(sumindo.get(d.key).timer); sumindo.delete(d.key); avisouVolta.delete(d.key) }
    if (isNew) voltaFim()
    if (isNew) { if (!voltou && !voltandoAgora()) { sysMsg(`${name} entrou`); sfx('entrou', d.key) }; evento('entrou', voltou ? `${name} voltou` : `conectou com ${name}`); conectadoDesde.set(peerId, Date.now()); faixa?.entrouAlguem(d.key, name); coup?.entrouAlguem(d.key); descarte?.entrouAlguem(d.key); parPerfeito?.entrouAlguem(d.key); amigosDeBosta?.entrouAlguem(d.key); dobradinha?.entrouAlguem(d.key); douLheUma?.entrouAlguem(d.key); naTesta?.entrouAlguem(d.key); quadro?.entrouAlguem(d.key) }
    applyPeerVols(); applyTileVols()
    renderAll()
  }

  room.onPeerStream = (stream, peerId, meta) => {
    if (meta?.voice) return peers.get(peerId)?.key === me.key ? undefined : playVoice(stream, peerId)
    addTile(peerId, stream)
  }
  actions.share.onMessage = (d, { peerId }) => {
    const was = shareInfo.get(peerId)
    if (d?.on) {
      shareInfo.set(peerId, { ...lerShare(d), n: peers.get(peerId)?.name })
      if (!was) { toast(`${peers.get(peerId)?.name || 'Alguém'} começou a projetar`); sfx('telaOn', peers.get(peerId)?.key) }
      tiles.get(peerId) && renderTile(peerId)
    } else if (was) {
      shareInfo.delete(peerId)
      removeTile(peerId)
      toast(`${peers.get(peerId)?.name || 'Alguém'} parou de projetar`); sfx('telaOff', peers.get(peerId)?.key)
    }
    layout()
  }
  actions.need.onMessage = (_, { peerId }) => {
    if (!myShare) return
    const s = myShare.stream
    try { room.removeStream(s, { target: peerId }) } catch {}
    setTimeout(() => { if (myShare?.stream === s) { room.addStream(s, { target: peerId, metadata: { screen: 1 } }); setTimeout(tuneSenders, 1500) } }, 500)
  }
  actions.react.onMessage = (d, { peerId }) => gotReact(d, peerId)
  actions.mre.onMessage = (d, { peerId }) => gotMsgReact(d, peerId)
  actions.mid.onMessage = d => gotMidia(d)
  actions.rad.onMessage = d => radio?.got(d)
  actions.jogo.onMessage = (d, { peerId }) => {
    const [id, x] = jogoDaMsg(d)
    const k = peers.get(peerId)?.key
    if (jogos[id]) return jogos[id].got(x, k)
    carregaJogo(id).then(j => j?.got(x, k))
  }
  actions.chat.onMessage = (m, { peerId }) => chatChegou({ ...m, from: peerId })
  actions.hist.onMessage = list => Array.isArray(list) && list.forEach(m => !m.sys && addMsg(m, true))
  actions.spk.onMessage = (d, { peerId }) => { const p = peers.get(peerId); if (p) { p.speaking = !!d; renderSeats() } }
  actions.pausa.onMessage = (_, { peerId }) => gotPause(peers.get(peerId)?.name || 'Alguém')
  actions.leg.onMessage = (d, { peerId }) => showSub(peerId, typeof d?.t === 'string' ? d.t.slice(0, 400) : '')
  actions.adm.onMessage = (d, { peerId }) => onAdmin(d, peerId)
  actions.ctl.onMessage = (d, { peerId }) => gotCtl(d, peers.get(peerId)?.name || 'Alguém', peerId)

  if (mic) { room.addStream(mic.stream, { metadata: { voice: 1 } }); setTimeout(tuneSenders, 2000) }
  loadLayout()
  renderAll()
  // o chat é da sessão: primeiro descobre quando ela começou, depois carrega só o que veio desde então
  heartbeat().finally(loadHistory); clearInterval(presTimer); presTimer = setInterval(heartbeat, 15000)
}

/* ---------- Presença pelo servidor ----------
   Reserva para quando a conexão direta (P2P) não fecha: a pessoa aparece sentada
   (meio apagada) e o chat passa a ser buscado no servidor a cada 4 s. */
/* ---------- Diagnóstico: estado de cada conexão, eventos e tempo de call ---------- */
const evBuf = [] // eventos ainda não enviados ao servidor
function evento(k, t) { evBuf.push({ ts: Date.now(), k, t: String(t).slice(0, 200) }); if (evBuf.length > 60) evBuf.splice(0, evBuf.length - 60) }
const quedas = new Map() // key -> horários em que a conexão caiu
function quedaDe(key) { if (!key) return; const l = (quedas.get(key) || []).filter(t => Date.now() - t < 10 * 60e3); l.push(Date.now()); quedas.set(key, l) }
const conectadoDesde = new Map() // peerId -> quando conectou
const desdeSrv = new Map() // key -> online desde (servidor)
let callIni = 0
const entrouEm = Date.now()
// erros que o Trystero só joga no console também vão para o diário
{ const ce = console.error.bind(console); console.error = (...a) => { try { const t = a.map(String).join(' '); if (/Trystero|RTCPeerConnection|setRemoteDescription/.test(t)) evento('erro', t.slice(0, 200)) } catch {} ; ce(...a) } }
document.addEventListener('visibilitychange', () => evento('aba', document.hidden ? 'aba em segundo plano' : 'voltou para a aba'))
const navegador = () => { const u = navigator.userAgent; const b = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Outro'; const so = /Windows/.test(u) ? 'Windows' : /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iOS' : /Mac OS/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : ''; return `${b}${so ? ' · ' + so : ''}` }
const statsAntes = new Map() // peerId -> { t, ain, aout }
async function coletaEstado() {
  const out = { nav: navegador(), mic: !mic ? 'sem' : me.muted ? 'mudo' : 'aberto', surdo: !!me.deaf, proj: myShare?.kind || '', oculta: document.hidden, entrou: entrouEm, peers: {} }
  for (const [id, pc] of pcsOf()) {
    const key = peers.get(id)?.key || ('?' + String(id).slice(0, 5))
    const d = { st: pc.connectionState || pc.iceConnectionState, quedas: (quedas.get(key) || []).filter(t => Date.now() - t < 10 * 60e3).length }
    try {
      const st = await pc.getStats()
      let ain = 0, aout = 0, perdidos = 0, recebidos = 0, vin = 0
      st.forEach(r => {
        if (r.type === 'inbound-rtp' && r.kind === 'audio') { ain += r.bytesReceived || 0; perdidos += r.packetsLost || 0; recebidos += r.packetsReceived || 0 }
        if (r.type === 'inbound-rtp' && r.kind === 'video') vin += r.bytesReceived || 0
        if (r.type === 'outbound-rtp' && r.kind === 'audio') aout += r.bytesSent || 0
        if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') {
          const l = st.get(r.localCandidateId), rm = st.get(r.remoteCandidateId)
          d.via = l?.candidateType === 'relay' || rm?.candidateType === 'relay' ? 'ponte' : 'direto'
          if (r.currentRoundTripTime != null) d.rtt = Math.round(r.currentRoundTripTime * 1000)
        }
      })
      const a = statsAntes.get(id), t = performance.now()
      if (a) { const dt = (t - a.t) / 1000; d.ain = Math.max(0, Math.round((ain - a.ain) * 8 / dt / 100) / 10); d.aout = Math.max(0, Math.round((aout - a.aout) * 8 / dt / 100) / 10); d.vin = Math.max(0, Math.round((vin - a.vin) * 8 / dt / 1000)) }
      statsAntes.set(id, { t, ain, aout, vin })
      if (recebidos) d.perda = Math.round(perdidos / (perdidos + recebidos) * 1000) / 10
    } catch {}
    if (peers.get(id)?.rtt != null && d.rtt == null) d.rtt = Math.round(peers.get(id).rtt)
    if (conectadoDesde.has(id)) d.desde = conectadoDesde.get(id)
    out.peers[key] = d
  }
  return out
}
let reconectando = false
function reconectarPorAdmin(por) {
  if (reconectando) return
  reconectando = true
  evento('admin', `reconectado a pedido de ${por || 'admin'}`)
  try { sessionStorage.setItem('cine.reconectado', por || 'admin') } catch {}
  toast(`${por || 'O admin'} reconectou você`, 2000)
  // manda o evento antes de recarregar
  api('sala', { method: 'POST', body: { op: 'aqui', r: roomId, pw: roomPw, key: me.key, name: me.name, ev: evBuf.splice(0) } }).finally(() => setTimeout(() => recarregar('admin'), 600))
}
try { const por = sessionStorage.getItem('cine.reconectado'); if (por) { sessionStorage.removeItem('cine.reconectado'); setTimeout(() => toast(`Reconectado a pedido de ${por}`, 3000), 3000) } } catch {}

let beats = 0
async function heartbeat() {
  if (!room || !me.key || !roomPw) return
  if (++beats % 2 === 0 && $('#canalPop').hidden) loadCanais() // atualiza quem está em cada canal a cada 30 s
  const est = await coletaEstado().catch(() => null)
  ultimoEst = est
  const ev = evBuf.splice(0)
  const md = myShare?.midia
  const proj = myShare ? { t: myShare.titulo || '', k: myShare.kind, ...(md ? { m: { ti: md.titulo, pl: md.plat, s: md.s, e: md.e, ep: md.epNome, n: md.nota, en: md.epNota, p: md.poster, i: md.imdb, tp: md.tipo, a: md.ano } } : {}) } : null
  const r = await api('sala', { method: 'POST', body: { op: 'aqui', r: roomId, pw: roomPw, key: me.key, name: me.name, slug, filme: invite?.filme || CFG.subtitulo || '', est, ev, proj, registra: !/^teste/i.test(canal || '') } })
  if (!Array.isArray(r?.pres)) { evBuf.unshift(...ev.slice(-20)); return }
  if (!r.pres.some(x => x.key !== me.key)) voltaFim() // ninguém mais na sala: não há o que esperar
  if (r.callIni) callIni = r.callIni
  desdeSrv.clear(); r.pres.forEach(x => desdeSrv.set(x.key, x.desde))
  if (r.cmd?.op === 'reset') return reconectarPorAdmin(r.cmd.por)
  renderCallbar()
  const direct = new Set([...peers.values()].map(p => p.key))
  const before = new Set(srvPres.keys())
  srvPres.clear()
  r.pres.forEach(x => { if (x.key !== me.key && !direct.has(x.key)) srvPres.set(x.key, x.name) })
  srvPres.forEach((name, key) => {
    if (ghostWarned.has(key) || !before.has(key)) return // só avisa se continuar sem conexão na checagem seguinte
    ghostWarned.add(key)
    sysMsg(`${name || person(key).nome} está na sala, mas a conexão direta não fechou. O chat funciona; voz e tela, não.`)
  })
  renderSeats(); renderNet()
  if (srvPres.size && !pollTimer) { pollChat(); pollTimer = setInterval(pollChat, 4000) }
  if (!srvPres.size && pollTimer) { clearInterval(pollTimer); pollTimer = 0 }
}
async function pollChat() {
  if (chatCh) return
  const r = await api(`chat?n=20&r=${roomId}&desde=${Math.max(0, ...messages.map(m => m.ts || 0)) - 60e3}`)
  if (Array.isArray(r?.list)) r.list.forEach(m => addMsg(m))
}
addEventListener('pagehide', () => {
  if (me.key) guardaEstado() // se for F5, a volta restaura daqui
  if (roomId && me.key) navigator.sendBeacon('/api/sala', new Blob([JSON.stringify({ op: 'saiu', r: roomId, key: me.key })], { type: 'application/json' }))
})
async function pingLoop(id) {
  while (peers.has(id)) {
    try { peers.get(id).rtt = await room.ping(id); renderNet() } catch {}
    await sleep(5000)
  }
}
const helloMsg = () => helloDe(me)
const sendHello = () => actions?.hello.send(helloMsg())

// Mesma pessoa fixa duas vezes: pergunta quem é quem
function askSeat(msg) {
  $('#seatMsg').textContent = msg + ' Quem é você?'
  const opts = PEOPLE.filter(p => !p.ausente).map(p => {
    const b = el('button', { type: 'button', className: 'seatpick' }, pfpImg(p.id, 56), el('span', { textContent: p.nome }))
    b.addEventListener('click', () => pickSeat(p.id, p.nome))
    return b
  })
  if (CFG.convidados) {
    const b = el('button', { type: 'button', className: 'seatpick' }, (CFG.convidado?.foto ? el('img', { className: 'pfp', alt: '', width: 56, height: 56, src: CFG.convidado.foto }) : el('i', { className: 'pfp pfp--guest', style: 'width:56px;height:56px' }, icon('users'))), el('span', { textContent: 'Convidado' }))
    b.addEventListener('click', () => { const n = prompt('Seu nome:'); if (n?.trim()) pickSeat(guestKey(n), n.trim().slice(0, 24)) })
    opts.push(b)
  }
  $('#seatChoices').replaceChildren(...opts)
  $('#seatModal').hidden = false
}
function pickSeat(key, name) {
  me.key = key; me.name = name
  login(roomPw, key, name)
  $('#seatModal').hidden = true
  renderAccountBadge(); sendHello(); renderSeats(); loadPrefs()
}

/* ---------- Telas (várias pessoas podem transmitir ao mesmo tempo) ---------- */
const tilesEl = $('#tiles')
const tiles = new Map() // peerId -> {el, video, stream, src, label, sub}
let focusId = null
let myShare = null // {stream, kind, game, video?, cleanup, subs?}

/* ---------- Controles sobre o vídeo ---------- */
const peerQuality = new Map()
function playerInfo(id) { return id === selfId ? myShare : shareInfo.get(id) }
function playerTime(id) {
  const info = playerInfo(id)
  const n = id === selfId && nfxDe(myShare)
  if (n) return Math.min(n.d || Infinity, n.t + (n.paused ? 0 : (Date.now() - n.at) / 1000))
  if (id === selfId) return myShare?.video?.currentTime || 0
  const at = Number.isFinite(info?.t) ? info.t : 0
  return Math.min(info?.duration || Infinity, at + (info?.paused ? 0 : (Date.now() - (info?.tAt || Date.now())) / 1000 * (info?.rate || 1)))
}
function playerCommand(id, op, value) {
  feedbackPlayer(id, op, value)
  if (id === selfId) gotCtl({ op, d: value }, 'Você')
  else ctl(id, op, value)
}
// Retorno na hora do clique (como nos players de streaming): ↺ 5 s à esquerda, ↻ 5 s à direita,
// play/pausa grande no meio. O ícone da barra troca já, sem esperar a confirmação de quem projeta.
function feedbackPlayer(id, op, d) {
  const t = tiles.get(id)
  if (!t || !['seek', 'toggle', 'at'].includes(op)) return
  let f
  if (op === 'seek') {
    const lado = d < 0 ? 'esq' : 'dir'
    t.el.querySelector(`.pfb--${lado}`)?.remove()
    f = el('div', { className: `pfb pfb--${lado}` }, el('span', {}, icon(d < 0 ? 'rotate-ccw' : 'rotate-cw'), el('b', { textContent: `${Math.abs(d)} s` })))
  } else if (op === 'toggle') {
    const ia = t.player?.play.firstChild?.dataset.icon === 'play' // mostrava play = estava pausado → vai tocar
    if (t.player) setIcon(t.player.play.firstChild, ia ? 'pause' : 'play')
    t.el.querySelector('.pfb--meio')?.remove()
    f = el('div', { className: 'pfb pfb--meio' }, el('span', {}, icon(ia ? 'play' : 'pause')))
  } else f = el('div', { className: 'pfb pfb--meio' }, el('span', {}, el('b', { textContent: fmtMt(+d) })))
  t.el.append(f)
  setTimeout(() => f.remove(), 750)
}
function updatePlayer(id) {
  const tile = tiles.get(id), info = playerInfo(id)
  if (!tile?.player) return
  const p = tile.player, arq = info?.kind === 'arquivo'
  const nf = id === selfId ? !!nfxDe(myShare) : !!info?.nfx, file = arq || nf
  const pode = !nf || id === selfId || info?.nfx?.ctl !== 'eu'
  // pausado: na própria Netflix vem da extensão; num arquivo meu, do <video>; o resto, da mensagem de quem projeta
  const pausado = id === selfId ? (nfxDe(myShare)?.paused ?? myShare?.video?.paused ?? !!info?.paused) : !!info?.paused
  p.play.hidden = !file; p.seek.hidden = !file; p.time.hidden = !file; p.back.hidden = p.fwd.hidden = !file
  p.back.disabled = p.fwd.disabled = !pode
  p.root.classList.toggle('sem-linha', !file)
  nfxAcoes(id, tile, nf ? (id === selfId ? shareMsg().nfx : info.nfx) : null, pode)
  const md = info?.midia
  p.title.innerHTML = ''
  if (md) p.title.append(el('b', { textContent: md.titulo }), md.s ? el('span', { textContent: ` T${md.s}:E${md.e}${md.epNome ? ' ' + md.epNome : ''}` }) : '')
  p.center.hidden = !file || !pausado || !pode
  p.play.disabled = !pode; p.seek.disabled = !pode
  p.rateLabel.hidden = !arq; p.upload.hidden = !(arq && id === selfId)
  p.subs.hidden = !info?.subs
  p.subs.setAttribute('aria-pressed', String(!!prefs.subs))
  if (p.play.firstChild.dataset.icon !== (pausado ? 'play' : 'pause')) setIcon(p.play.firstChild, pausado ? 'play' : 'pause')
  p.play.title = !pode ? 'Só quem projeta controla a Netflix' : pausado ? 'Reproduzir para todos' : 'Pausar para todos'
  const duration = (id === selfId && nfxDe(myShare)?.d) || info?.duration || (id === selfId ? myShare?.video?.duration : 0) || 0
  const at = playerTime(id)
  if (document.activeElement !== p.seek) { p.seek.max = duration || 1; p.seek.value = at; p.seek.style.setProperty('--p', pct(duration ? at / duration : 0)) }
  p.seek.disabled = !duration || !pode
  p.time.textContent = `${fmtMt(at)} / ${fmtMt(duration)}`
  p.rate.value = String(info?.rate || 1)
  const value = id === selfId ? Math.min(1, tileVol(id)) : tileVol(id)
  p.volume.max = id === selfId ? 1 : 2
  p.volume.title = `Volume: ${Math.round(value * 100)}%`
  p.volume.value = value; p.volume.style.setProperty('--p', pct(value / +p.volume.max)); p.mute.title = value ? 'Silenciar projeção' : 'Ativar som da projeção'
  setIcon(p.mute.firstChild, value ? 'volume-2' : 'volume-x')
  const hasSound = id === selfId ? arq || !!tile.gain : !!tile.gain
  p.volume.disabled = !hasSound; p.mute.disabled = !hasSound
  tile.el.classList.toggle('file-session', file)
  if (info?.preview && tile.preview.getAttribute('src') !== info.preview) tile.preview.src = info.preview
  tile.preview.hidden = id === selfId || !arq || !pausado || !info?.preview
}
// Por cima do vídeo da Netflix: "Pular abertura" e a votação do próximo episódio
function nfxAcoes(id, tile, n, pode) {
  let box = tile.nfxBox
  if (!box) { box = tile.nfxBox = el('div', { className: 'nfx-acoes' }); box.addEventListener('click', e => e.stopPropagation()); tile.el.append(box) }
  const k = JSON.stringify([n?.pular, n?.voto?.id, n?.voto?.s, n?.voto?.n, n?.voto?.fim, n?.voto?.nq, pode, tile.meuVoto?.[n?.voto?.id], tile.minhaNota?.[n?.voto?.id]])
  if (box.dataset.k === k) return
  box.dataset.k = k
  const itens = []
  if (n?.pular && pode && !n?.voto) {
    const b = el('button', { type: 'button', className: 'nfx-pular' }, icon('skip-forward'), el('span', { textContent: n.pular === 'resumo' ? 'Pular resumo' : 'Pular abertura' }))
    b.addEventListener('click', () => playerCommand(id, 'pular'))
    itens.push(b)
  }
  const v = n?.voto
  if (v) {
    const meu = (tile.meuVoto ||= {})[v.id]
    const vota = val => { tile.meuVoto[v.id] = val; playerCommand(id, 'voto', { id: v.id, v: val }); box.dataset.k = ''; updatePlayer(id) }
    const bt = (val, emo, txt, c) => { const b = el('button', { type: 'button', className: 'nfx-voto__b ' + c + (meu === val ? ' on' : ''), disabled: !!v.fim }, el('i', { textContent: emo }), el('span', { textContent: txt }), el('b', { textContent: val > 0 ? v.s : v.n })); b.addEventListener('click', () => vota(val)); return b }
    const res = v.fim === 'sim' ? 'Mais um, então!' : v.fim === 'nao' ? 'Paramos por aqui' : v.fim ? 'A Netflix seguiu' : ''
    // fim do episódio: capa, o que vocês viram e a nota da sala (1 a 5 estrelas, cada um dá a sua)
    const md = playerInfo(id)?.midia, minha = (tile.minhaNota ||= {})[v.id] || 0
    const estrelas = el('div', { className: 'nfx-estrelas', role: 'radiogroup', ariaLabel: 'Nota da sala' }, ...[1, 2, 3, 4, 5].map(i => {
      const b = el('button', { type: 'button', className: i <= minha ? 'on' : '', textContent: '★', title: `${i} estrela${i > 1 ? 's' : ''}` })
      b.addEventListener('click', () => { tile.minhaNota[v.id] = i; playerCommand(id, 'estrela', { id: v.id, v: i }); box.dataset.k = ''; updatePlayer(id) })
      return b
    }), v.nq ? el('small', { textContent: `sala: ★ ${v.nm.toFixed(1).replace('.', ',')} (${v.nq})` }) : el('small', { textContent: 'dê sua nota' }))
    const visto = md ? el('div', { className: 'nfx-visto' },
      md.poster ? el('img', { src: md.poster.replace('/poster/small/', '/poster/medium/'), alt: '' }) : '',
      el('div', {}, el('small', { textContent: 'Vocês viram' }), el('b', { textContent: md.titulo }), md.s ? el('span', { textContent: `T${md.s} · E${md.e}${md.epNome ? ' · ' + md.epNome : ''}${md.epNota ? ` · IMDb ★ ${(+md.epNota).toFixed(1)}` : ''}` }) : '')) : ''
    const card = el('div', { className: 'nfx-voto' + (v.fim ? ' fim' : '') },
      visto, estrelas,
      el('div', { className: 'nfx-voto__t' }, el('b', { textContent: res || 'Mais um episódio?' }), el('small', { textContent: v.fim ? `${v.s} × ${v.n}` : `${v.s + v.n} de ${v.tot} votaram` })),
      el('div', { className: 'nfx-voto__bs' }, bt(1, '👍', 'Mais um', 'sim'), bt(-1, '👎', 'Parar', 'nao')),
      v.fim ? '' : el('i', { className: 'nfx-voto__tempo', style: `animation-duration:${Math.max(0, v.ate)}ms` }))
    itens.push(card)
  }
  box.replaceChildren(...itens)
}
function buildPlayer(id, tile) {
  const button = (name, title, fn) => {
    const b = el('button', { type: 'button', className: 'player-button', title, ariaLabel: title }, icon(name))
    b.addEventListener('click', fn); return b
  }
  const play = button('play', 'Reproduzir para todos', () => playerCommand(id, 'toggle'))
  const center = button('play', 'Reproduzir para todos', () => playerCommand(id, 'toggle')); center.classList.add('player-center')
  const seek = el('input', { type: 'range', min: 0, max: 1, step: .1, value: 0, className: 'player-seek', ariaLabel: 'Posição no filme' })
  seek.addEventListener('input', () => { time.textContent = `${fmtMt(+seek.value)} / ${fmtMt(+seek.max)}`; seek.style.setProperty('--p', pct(+seek.value / (+seek.max || 1))) })
  seek.addEventListener('change', () => playerCommand(id, 'at', +seek.value))
  const time = el('span', { className: 'player-time' })
  const volume = el('input', { type: 'range', min: 0, max: 2, step: .01, value: 1, className: 'player-volume', ariaLabel: 'Volume da projeção' })
  volume.addEventListener('input', () => { const key = keyOf(id); prefs.tvol[key] = +volume.value; delete prefs.tmute[key]; applyTileVols(); savePrefs(); updatePlayer(id) })
  const mute = button('volume-2', 'Silenciar projeção', () => { const key = keyOf(id); prefs.tmute[key] = !prefs.tmute[key]; applyTileVols(); savePrefs(); updatePlayer(id) })
  const subs = button('captions', 'Ativar ou desativar legendas', () => { $('#btnSubs').click(); tiles.forEach((_, key) => updatePlayer(key)) })
  const gear = button('settings', 'Opções do vídeo', () => {
    const open = settings.hidden
    document.querySelectorAll('.player-settings').forEach(node => node.hidden = true)
    settings.hidden = !open; gear.setAttribute('aria-expanded', String(open))
    settings.style.maxHeight = Math.max(75, tile.el.clientHeight - 90) + 'px'
    reveal()
  })
  gear.setAttribute('aria-expanded', 'false')
  const quality = el('select', { ariaLabel: 'Qualidade da projeção' }, ...[['auto','Automática'],['1080','Até 1080p'],['720','Até 720p'],['480','Até 480p']].map(([value, textContent]) => el('option', { value, textContent })))
  quality.addEventListener('change', () => { tile.aqNivel = 0; tile.aqRuim = tile.aqBom = 0; playerCommand(id, 'quality', quality.value) })
  const rate = el('select', { ariaLabel: 'Velocidade do filme' }, ...[.5,1,1.25,1.5,2].map(value => el('option', { value: String(value), textContent: value + '×' })))
  rate.value = '1'; rate.addEventListener('change', () => playerCommand(id, 'rate', +rate.value))
  const rateLabel = el('label', {}, el('span', { textContent: 'Velocidade' }), rate)
  const subtitleFile = el('input', { type: 'file', accept: '.srt,.vtt', hidden: true })
  subtitleFile.addEventListener('change', () => { const file = subtitleFile.files[0]; subtitleFile.value = ''; if (file) loadSubs(file) })
  const upload = button('captions', 'Carregar legenda SRT ou VTT', () => subtitleFile.click())
  upload.append(el('span', { textContent: 'Carregar legenda' })); upload.classList.add('player-upload')
  const settings = el('div', { className: 'player-settings', hidden: true }, el('label', {}, el('span', { textContent: 'Qualidade' }), quality), rateLabel, upload, subtitleFile)
  const full = button('maximize', 'Tela cheia', toggleFs); full.classList.add('player-full')
  const back = button('rotate-ccw', 'Voltar 5 s (←)', () => playerCommand(id, 'seek', -5)); back.classList.add('player-10')
  const fwd = button('rotate-cw', 'Avançar 5 s (→)', () => playerCommand(id, 'seek', 5)); fwd.classList.add('player-10')
  const title = el('span', { className: 'player-title' })
  const vol = el('span', { className: 'player-vol' }, mute, volume)
  const bar = el('div', { className: 'player-bar' }, play, back, fwd, vol, title, subs, gear, full)
  const linha = el('div', { className: 'player-linha' }, seek, time)
  const root = el('div', { className: 'player-controls' }, linha, bar, settings)
  tile.el.append(center, root)
  root.addEventListener('keydown', e => {
    e.stopPropagation()
    if (e.key === 'Escape') { settings.hidden = true; gear.setAttribute('aria-expanded', 'false'); gear.focus() }
  })
  let timer
  function reveal() {
    tile.el.classList.add('player-visible'); clearTimeout(timer)
    timer = setTimeout(() => {
      if (!settings.hidden || root.querySelector(':focus-visible')) return reveal()
      tile.el.classList.remove('player-visible')
    }, 2500)
  }
  tile.el.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && (!imersivo() || naZonaDaBarra(e))) reveal() })
  tile.el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && !imersivo()) reveal() })
  tile.el.addEventListener('focusin', reveal)
  tile.el.addEventListener('pointerleave', () => { if (settings.hidden && !root.querySelector(':focus-visible')) { clearTimeout(timer); tile.el.classList.remove('player-visible') } })
  tile.el.addEventListener('keydown', e => { if (e.target === tile.el && ['Space','Enter'].includes(e.code) && playerInfo(id)?.kind === 'arquivo') { e.preventDefault(); playerCommand(id, 'toggle'); reveal() } })
  tile.reveal = reveal
  tile.player = { root, play, center, seek, time, volume, mute, subs, gear, quality, rate, rateLabel, upload, settings, back, fwd, title }
  tile.playerCleanup = () => clearTimeout(timer)
}
/* Bordas pretas dentro da transmissão (ex.: player com tarjas): mede numa miniatura, uma vez por segundo.
   Só é borda o que é preto liso de verdade e fica parado; na Netflix a tarja é preto 100% e o corte é automático.
   Achado o corte, ele fica fixo (só muda pelo botão direito). Antes disso, cada linha/coluna guarda a última vez em que teve imagem, e o corte mostra tudo o que teve imagem nos
   últimos 90 s: cena escura não corta nada (aquela faixa teve imagem há pouco) e o corte só aperta depois
   de muito tempo sem nada na faixa. Abre na hora (2 leituras seguidas com imagem fora do corte).
   Tarjas de vídeo são simétricas: usa o menor dos dois lados, então a imagem nunca anda para um lado.
   Fora da Netflix não corta sozinho: avisa uma vez por sessão. */
const ss = { get: k => { try { return sessionStorage.getItem(k) } catch { return null } }, set: (k, v) => { try { sessionStorage.setItem(k, v) } catch {} } }
const bordasAuto = () => ss.get('cine.bordas') === 'on'
function setBordas(t, on) {
  t.cropOn = on
  t.cropLocked = on && !!t.cropFound
  ss.set('cine.bordas', on ? 'on' : 'off')
  t.crop = on ? t.cropFound || null : null
  t.fit?.()
}
function avisoBordas(t) {
  if (ss.get('cine.bordas') || t.cropOn || prefs.avisoBordas === false) return
  nudge('bordas', 'Essa tela tem bordas pretas.', 'Remover bordas', () => setBordas(t, true), () => ss.set('cine.bordas', 'off'))
}
const barCanvas = document.createElement('canvas')
const JANELA_BORDA = 90000
// Depois de cortar, o corte fica fixo: não anda mais sozinho. Errou? Botão direito → "Cortar as bordas de novo"
// (mede do zero e fixa de novo) ou "Mostrar a imagem inteira".
function recortaBordas(t) {
  Object.assign(t, { barKey: '', cropLocked: false, crop: null, cropFound: null, cropNext: undefined })
  t.fit?.()
}
function detectBars(t) {
  const v = t.video, vw = v.videoWidth, vh = v.videoHeight
  if (t.cropOn && t.cropLocked) return
  if (!vw || !vh || v.readyState < 2 || document.hidden) return
  const info = t.id === selfId ? myShare : shareInfo.get(t.id)
  const nf = info?.midia?.plat === 'netflix' || (t.id === selfId ? !!nfxDe(myShare) : !!info?.nfx)
  const cw = 240, ch = Math.max(2, Math.round(240 * vh / vw))
  barCanvas.width = cw; barCanvas.height = ch
  const g = barCanvas.getContext('2d', { willReadFrequently: true })
  let d
  try { g.drawImage(v, 0, 0, cw, ch); d = g.getImageData(0, 0, cw, ch).data } catch { return }
  const L = new Uint8Array(cw * ch)
  for (let k = 0, p = 0; k < L.length; k++, p += 4) L[k] = (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8
  const key = `${vw}x${vh}`
  if (t.barKey !== key) Object.assign(t, { barKey: key, rowSeen: new Float64Array(ch), colSeen: new Float64Array(cw), rowHit: new Uint8Array(ch), colHit: new Uint8Array(cw), barReads: 0, cropNext: undefined })
  // preto da borda: cantos escuros e lisos (Netflix: preto puro, só ruído da compressão)
  const canto = (x0, y0) => { let s = 0, s2 = 0, n = 0; for (let y = y0; y < y0 + 4; y++) for (let x = x0; x < x0 + 4; x++) { const l = L[y * cw + x]; s += l; s2 += l * l; n++ } const m = s / n; return { m, dp: Math.sqrt(Math.max(0, s2 / n - m * m)) } }
  const cs = [canto(0, 0), canto(cw - 4, 0), canto(0, ch - 4), canto(cw - 4, ch - 4)].filter(c => c.dp < (nf ? 2.5 : 4) && c.m < (nf ? 14 : 28))
  const base = cs.length ? Math.min(...cs.map(c => c.m)) : -1, lim = base + (nf ? 10 : 14)
  const liso = (s1, s2, n) => Math.sqrt(Math.max(0, s2 / n - (s1 / n) ** 2)) < (nf ? 2.5 : 3.5)
  const rows = new Uint8Array(ch), cols = new Uint8Array(cw)
  let acesos = 0
  for (let y = 0; y < ch; y++) { let n = 0, s1 = 0, s2 = 0; for (let x = 0; x < cw; x++) { const l = L[y * cw + x]; n += l > lim; s1 += l; s2 += l * l } rows[y] = base < 0 || n > cw * .01 || !liso(s1, s2, cw); acesos += n }
  if (base >= 0 && acesos < cw * ch * .05) return // quadro escuro (fade, cena noturna): não diz nada
  for (let x = 0; x < cw; x++) { let n = 0, s1 = 0, s2 = 0; for (let y = 0; y < ch; y++) { const l = L[y * cw + x]; n += l > lim; s1 += l; s2 += l * l } cols[x] = base < 0 || n > ch * .01 || !liso(s1, s2, ch) }
  const now = Date.now()
  t.barReads++
  for (let y = 0; y < ch; y++) { t.rowHit[y] = rows[y] ? Math.min(9, t.rowHit[y] + 1) : 0; if (t.rowHit[y] >= 2) t.rowSeen[y] = now }
  for (let x = 0; x < cw; x++) { t.colHit[x] = cols[x] ? Math.min(9, t.colHit[x] + 1) : 0; if (t.colHit[x] >= 2) t.colSeen[x] = now }
  if (t.barReads < (nf ? 4 : 8)) return
  const viu = s => s > 0 && now - s < JANELA_BORDA
  let top = 0, bot = ch - 1, lef = 0, rig = cw - 1
  while (top < ch && !viu(t.rowSeen[top])) top++
  while (bot > top && !viu(t.rowSeen[bot])) bot--
  while (lef < cw && !viu(t.colSeen[lef])) lef++
  while (rig > lef && !viu(t.colSeen[rig])) rig--
  if (top >= ch || lef >= cw) return
  // simétrico: a menor das duas tarjas vale para os dois lados
  const gy = Math.min(top, ch - 1 - bot), gx = Math.min(lef, cw - 1 - rig)
  top = gy < ch * .025 ? 0 : gy; bot = ch - 1 - top
  lef = gx < cw * .025 ? 0 : gx; rig = cw - 1 - lef
  const sx = vw / cw, sy = vh / ch
  let box = { x: lef * sx, y: top * sy, w: (rig + 1 - lef) * sx, h: (bot + 1 - top) * sy }
  const area = box.w * box.h / (vw * vh)
  if (area < .3) return // estranho demais: mantém como está
  if (area > .96) box = null // quase sem borda: sem corte
  const cur = t.cropOn ? t.crop : t.cropFound
  const same = (a, b) => (!a && !b) || (a && b && Math.abs(a.x - b.x) < vw * .025 && Math.abs(a.y - b.y) < vh * .025 && Math.abs(a.w - b.w) < vw * .025 && Math.abs(a.h - b.h) < vh * .025)
  if (same(box, cur)) { t.cropNext = undefined; return }
  // muda só com duas leituras seguidas propondo o mesmo corte
  if (t.cropNext === undefined || !same(box, t.cropNext)) { t.cropNext = box; return }
  t.cropNext = undefined; t.cropFound = box
  if (nf && box && !t.cropOn && ss.get('cine.bordas') !== 'off') t.cropOn = true
  if (t.cropOn) { t.crop = box; t.cropLocked = !!box; t.fit() } else if (box) avisoBordas(t)
}
function framePreview(video) {
  if (!video.videoWidth) return ''
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(960, video.videoWidth); canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth)
  try { canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height); const image = canvas.toDataURL('image/jpeg', .7); return image.length < 180000 ? image : canvas.toDataURL('image/jpeg', .45) } catch { return '' }
}

function addTile(id, stream, localVideo) {
  removeTile(id, true)
  const video = localVideo || el('video', { playsInline: true, autoplay: true, controls: false, disablePictureInPicture: true })
  if (!localVideo) { video.srcObject = stream; video.muted = true }
  const label = el('div', { className: 'tile__label' })
  const sub = el('div', { className: 'tile__sub' })
  const badge = el('div', { className: 'tile__paused' }, icon('pause'), el('span', { textContent: 'Pausado' }))
  const preview = el('img', { className: 'tile__preview', alt: '', hidden: true })
  const node = el('div', { className: 'tile' + (localVideo ? ' tile--file' : ''), tabIndex: 0 }, video, preview, sub, badge, label)
  node.addEventListener('pointerdown', e => { node._ptr = e.pointerType })
  node.addEventListener('click', e => {
    if (e.target.closest('button, input, select, label, .player-controls')) return
    // toque: primeiro mostra os controles; com eles à mostra, tocar no vídeo esconde (não pausa para todos)
    if (node._ptr && node._ptr !== 'mouse' && t.reveal) {
      if (!node.classList.contains('player-visible')) { t.reveal(); return }
      if (playerInfo(id)?.kind === 'arquivo') { node.classList.remove('player-visible'); return }
    }
    if (playerInfo(id)?.kind === 'arquivo') { playerCommand(id, 'toggle'); return }
    focusId = focusId === id ? null : id
    layout()
  })
  node.addEventListener('dblclick', e => { if (!e.target.closest('button, input, select, .player-controls')) toggleFs() })
  const t = { id, el: node, video, stream, label, sub, preview, src: null, gain: null, cropOn: bordasAuto() }
  // Encaixe: a parte com imagem (sem as bordas pretas que já vêm na transmissão) preenche o quadro
  const fit = () => {
    const W = node.clientWidth, H = node.clientHeight, vw = video.videoWidth, vh = video.videoHeight
    if (!W || !H || !vw || !vh) return
    const c = t.crop || { x: 0, y: 0, w: vw, h: vh }
    const k = Math.min(W / c.w, H / c.h), x = (W - c.w * k) / 2, y = (H - c.h * k) / 2
    if (t.crop) Object.assign(video.style, { inset: 'auto', objectFit: 'fill', width: vw * k + 'px', height: vh * k + 'px', left: x - c.x * k + 'px', top: y - c.y * k + 'px' })
    else Object.assign(video.style, { inset: '', objectFit: '', width: '', height: '', left: '', top: '' })
    node.style.setProperty('--vx', x + 'px'); node.style.setProperty('--vy', y + 'px')
  }
  t.fit = fit
  video.addEventListener('loadedmetadata', fit); video.addEventListener('resize', () => { t.crop = null; t.cropFound = null; t.barKey = ''; t.cropLocked = false; fit() })
  t.cropTimer = setInterval(() => detectBars(t), 1000)
  t.fitObs = new ResizeObserver(fit); t.fitObs.observe(node)
  ligaSomDaTile(t, id, stream)
  if (localVideo && prefs.output && localVideo.setSinkId) localVideo.setSinkId(prefs.output).catch(() => {})
  tiles.set(id, t)
  buildPlayer(id, t)
  tilesEl.append(node)
  if (!localVideo) video.play().catch(() => { needGesture = true; toast('Clique em qualquer lugar para ligar o som') })
  renderTile(id)
  applyTileVols()
  layout()
}
// O som de quem transmite vai para o mixer. Quem projeta uma aba também: o Chrome para de tocar a aba
// no próprio PC (suppressLocalAudioPlayback) e o som volta por aqui, com volume e "baixar durante falas".
// Janela/tela inteira não suprime (o som já sai do PC): aí não toca de novo.
function ligaSomDaTile(t, id, stream) {
  try { t.src?.disconnect(); t.gain?.disconnect() } catch {}
  t.src = t.gain = null
  const [at] = stream.getAudioTracks()
  // aba pela extensão: o Chrome tira o som da aba e manda só para o stream, então toca aqui
  if (!at || (id === selfId && at._somNaAba !== false && at.getSettings?.().suppressLocalAudioPlayback !== true)) return
  const ac = audioCtx()
  t.src = ac.createMediaStreamSource(new MediaStream([at]))
  t.gain = ac.createGain()
  t.src.connect(t.gain).connect(mix.movie)
}
function removeTile(id, quiet) {
  const t = tiles.get(id)
  if (!t) return
  t.playerCleanup?.(); t.fitObs?.disconnect(); clearInterval(t.cropTimer)
  t.src?.disconnect(); t.gain?.disconnect()
  if (!t.el.classList.contains('tile--file')) t.video.srcObject = null
  t.el.remove()
  tiles.delete(id)
  agoraPassando()
  if (focusId === id) focusId = null
  if (!quiet) layout()
}
const ICONE_PLAT = { netflix: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#e50914" d="M6 2h4l4 11V2h4v20h-4l-4-11v11H6z"/></svg>' }
const NOME_PLAT = { netflix: 'Netflix' }
function cartaoMidia(m, fixo) {
  const ep = m.s ? `T${m.s} · E${m.e}${m.epNome ? ' · ' + m.epNome : ''}` : m.ano
  const c = el('div', { className: 'midia-card aberto' + (fixo ? ' midia-card--fixo' : '') },
    m.fundo ? el('div', { className: 'midia-card__fundo', style: `background-image:url("${encodeURI(m.fundo)}")` }) : '',
    m.poster ? el('img', { className: 'midia-card__poster', src: m.poster.replace('/poster/small/', '/poster/medium/'), alt: '' }) : '',
    el('div', { className: 'midia-card__txt' },
      el('span', { className: 'midia-card__plat', innerHTML: (ICONE_PLAT[m.plat] || '') + `<span>${NOME_PLAT[m.plat] || ''}</span>` }),
      el('b', { textContent: m.titulo, title: m.original && m.original !== m.titulo ? m.original : '' }),
      ep ? el('small', { textContent: ep }) : '',
      m.nota || m.epNota ? el('span', { className: 'midia-card__nota' },
        m.epNota ? el('span', { title: 'Nota deste episódio no IMDb', innerHTML: `<i>★</i>${(+m.epNota).toFixed(1)}<small>episódio</small>` }) : '',
        m.nota ? el('span', { title: 'Nota da série/filme no IMDb', innerHTML: `<i>★</i>${(+m.nota).toFixed(1)}<small>${m.epNota ? 'série' : ''}</small>` }) : '',
        el('em', { textContent: 'IMDb' })) : ''))
  c.addEventListener('mouseenter', () => c.classList.add('aberto'))
  c.addEventListener('mouseleave', () => { if (!fixo) c.classList.remove('aberto') })
  c.addEventListener('click', e => e.stopPropagation())
  return c
}
// faixa "passando agora" acima das telas (fora da tela cheia)
const agoraEl = el('div', { className: 'agora', hidden: true })
$('.screen').before(agoraEl)
function agoraPassando() {
  const ids = [...tiles.keys()], id = (focusId && tiles.get(focusId)?.midiaKey ? focusId : ids.find(k => tiles.get(k).midiaKey))
  const info = id && playerInfo(id), md = info?.midia
  const k = md ? id + '|' + tiles.get(id).midiaKey : ''
  if (k === agoraEl.dataset.k) return
  agoraEl.dataset.k = k
  agoraEl.hidden = !md
  agoraEl.replaceChildren(...(md ? [cartaoMidia(md, true)] : []))
  if (md) requestAnimationFrame(() => requestAnimationFrame(() => agoraEl.firstChild?.classList.add('in')))
}
function renderTile(id) {
  const t = tiles.get(id)
  if (!t) return
  const info = id === selfId ? myShare : shareInfo.get(id)
  const who = id === selfId ? 'Você' : peers.get(id)?.name || '…'
  const kind = info?.kind === 'arquivo' ? 'arquivo' : info?.game ? 'jogo' : 'tela'
  t.label.replaceChildren(el('i'), document.createTextNode(who))
  t.label.title = t.q || kind
  if (t.player) t.player.quality.title = t.q || 'Limite da qualidade recebida'
  t.el.classList.toggle('paused', !!info?.paused)
  const md = info?.midia, mk = md ? `${md.titulo}|${md.s}|${md.e}|${md.nota}` : ''
  if (mk !== t.midiaKey) {
    t.midiaKey = mk; t.midiaCard?.remove(); t.midiaCard = null
    if (md) {
      const c = t.midiaCard = cartaoMidia(md)
      t.el.append(c); requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('in')))
      setTimeout(() => c.classList.remove('aberto'), 9000)
    }
    t.el.classList.toggle('has-midia', !!md)
    agoraPassando()
  }
  t.el.classList.toggle('remote-file', id !== selfId && info?.kind === 'arquivo')
  updateStage()
  updatePlayer(id)
}
function layout() {
  agoraPassando()
  setTimeout(() => arrumaBarra?.(), 0)
  const n = tiles.size + (midiaEl ? 1 : 0)
  if (midiaEl) { const thumb = n > 1 && !!focusId; midiaEl.classList.toggle('thumb', thumb); midiaEl.style.setProperty('--i', thumb ? tiles.size - 1 : 0) }
  if (focusId && !tiles.has(focusId)) focusId = null
  tilesEl.dataset.n = n
  tilesEl.classList.toggle('has-focus', n > 1 && !!focusId)
  let i = 0
  tiles.forEach((t, id) => {
    const thumb = n > 1 && !!focusId && id !== focusId
    t.el.classList.toggle('focus', n > 1 && id === focusId)
    t.el.classList.toggle('thumb', thumb)
    t.el.style.setProperty('--i', thumb ? i++ : 0)
  })
  $('#empty').hidden = n > 0
  const remote = [...tiles.keys()].filter(id => id !== selfId)
  $('#btnPause').hidden = !remote.length
  $('#btnReload').hidden = !remote.length
  $('#btnSubs').hidden = ![...shareInfo.values()].some(s => s.subs) && !myShare?.subs
  const names = [...tiles.keys()].map(id => id === selfId ? 'você' : peers.get(id)?.name || '…')
  if (midia) names.push(midia.kind === 'yt' ? 'YouTube' : 'Spotify')
  $('#sharer').hidden = !n
  $('#sharer').textContent = n ? `projetando · ${names.join(', ')}` : ''
  const b = $('#btnShare')
  setIcon(iconOf(b), myShare ? 'monitor-off' : 'projector')
  b.querySelector('span').textContent = myShare ? 'Parar' : 'Projetar'
  b.classList.toggle('on-air', !!myShare)
  b.classList.remove('btn--primary')
  $('#btnTrocar').hidden = myShare?.kind !== 'tela'
  renderSeats()
  updateStage()
}

/* ---------- Sala: sem contagem; a imagem aparece assim que está pronta ---------- */
function updateStage() {
  const on = tiles.size > 0 || !!midiaEl
  theater.classList.toggle('curtain-open', on)
  theater.classList.toggle('has-file', [...tiles.keys()].some(id => playerInfo(id)?.kind === 'arquivo'))
  const playing = [...tiles.keys()].some(id => !playerInfo(id)?.paused)
  document.body.classList.toggle('lights-off', on && playing)
}

/* ---------- Assistir junto: YouTube e Spotify ----------
   Ninguém transmite: cada um carrega o player no próprio navegador e o site sincroniza
   play, pausa e posição. Qualquer um controla; vale a última ação (seq maior). */
function parseMidia(url) {
  url = String(url || '').trim()
  if (/\s/.test(url)) return null
  let m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/)
  if (m) { const t = url.match(/[?&#]t=(\d+)/); return { kind: 'yt', id: m[1], pos: t ? +t[1] : 0 } }
  m = url.match(/open\.spotify\.com\/(?:intl-[\w-]+\/)?(track|album|playlist|episode|show)\/([A-Za-z0-9]{22})/) || url.match(/^spotify:(track|album|playlist|episode|show):([A-Za-z0-9]{22})$/)
  if (m) return { kind: 'sp', id: `spotify:${m[1]}:${m[2]}`, pos: 0 }
  return null
}
const midiaNow = () => !midia ? 0 : midia.playing ? midia.pos + (performance.now() - mrecv) / 1000 : midia.pos
const midiaSnap = () => ({ kind: midia.kind, id: midia.id, pos: midiaNow(), playing: midia.playing, seq: midia.seq, by: midia.by, title: midia.title || '' })
function startMidia(url) {
  const md = parseMidia(url)
  if (!md) return toast('Esse link não é do YouTube nem do Spotify.')
  if (md.kind === 'sp') { radio?.add(url); return toggleRadio(true) }
  midia = { ...md, playing: true, seq: ++mseq, by: me.name, title: '' }
  mrecv = performance.now()
  renderMidia(true)
  actions?.mid.send(midiaSnap())
  sysMsg(`${me.name} abriu ${md.kind === 'yt' ? 'um vídeo do YouTube' : 'uma música do Spotify'} para todos`)
}
// mudança feita aqui (play, pausa, pulo): vira a nova verdade da sala
function localMidia(changes) {
  if (!midia) return
  const pos = changes.pos ?? curMidiaPos() ?? midiaNow()
  midia = { ...midia, ...changes, pos, seq: ++mseq, by: me.name }
  mrecv = performance.now()
  actions?.mid.send(midiaSnap())
}
function endMidia(send) {
  if (!midia && !midiaEl) return
  if (send) { mfim = ++mseq; actions?.mid.send({ fim: 1, seq: mfim, by: me.name }) }
  midia = null; mready = false; spState = null
  try { mplayer?.destroy?.() } catch {}
  mplayer = null
  midiaEl?.remove(); midiaEl = null
  layout()
}
function gotMidia(d) {
  if (!d || typeof d !== 'object' || !Number.isFinite(d.seq)) return
  mseq = Math.max(mseq, d.seq)
  if (d.fim) { if (!midia || d.seq >= midia.seq) { mfim = d.seq; if (midia) sysMsg(`${String(d.by || 'Alguém').slice(0, 24)} fechou o vídeo`); endMidia(false) } return }
  if (d.seq <= mfim) return
  if (midia && (d.seq < midia.seq || (d.seq === midia.seq && String(d.by) <= String(midia.by)))) return
  const md = d.kind === 'yt' ? (/^[\w-]{11}$/.test(d.id) && d) : d.kind === 'sp' ? (/^spotify:(track|album|playlist|episode|show):[A-Za-z0-9]{22}$/.test(d.id) && d) : null
  if (!md) return
  const novo = !midia || midia.id !== d.id || midia.kind !== d.kind
  midia = { kind: d.kind, id: d.id, pos: Math.max(0, +d.pos || 0), playing: !!d.playing, seq: d.seq, by: String(d.by || '').slice(0, 24), title: String(d.title || '').slice(0, 120) }
  mrecv = performance.now()
  if (novo) { renderMidia(true); sysMsg(`${midia.by || 'Alguém'} abriu ${midia.kind === 'yt' ? 'um vídeo do YouTube' : 'uma música do Spotify'} para todos`) }
  else { applyMidia(); renderMidiaBar() }
}
function loadScript(src) {
  return new Promise((ok, no) => {
    const old = document.querySelector(`script[src="${src}"]`)
    if (old) return old.dataset.ok ? ok() : old.addEventListener('load', ok)
    const sc = el('script', { src }); sc.onload = () => { sc.dataset.ok = 1; ok() }; sc.onerror = no; document.head.append(sc)
  })
}
function ytApi() {
  if (window.YT?.Player) return Promise.resolve()
  return new Promise(ok => { const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { prev?.(); ok() }; loadScript('https://www.youtube.com/iframe_api') })
}
function spApi() {
  return spIFrame ||= new Promise(ok => { window.onSpotifyIframeApiReady = api => ok(api); loadScript('https://open.spotify.com/embed/iframe-api/v1') })
}
function renderMidiaBar() {
  if (!midiaEl || !midia) return
  midiaEl.querySelector('.midia__title').textContent = midia.title || (midia.kind === 'yt' ? 'Vídeo' : 'Ouvindo junto')
  midiaEl.querySelector('.midia__by').textContent = midia.by ? `· ${midia.by}` : ''
}
async function renderMidia() {
  try { mplayer?.destroy?.() } catch {}
  mplayer = null; mready = false; spState = null
  midiaEl?.remove()
  const host = el('div', { className: 'midia__host' })
  const x = el('button', { type: 'button', className: 'midia__x', title: 'Fechar para todos' }, icon('x'))
  x.addEventListener('click', () => endMidia(true))
  // volume do vídeo (só para você), direto na barra
  const mv = el('input', { type: 'range', min: 0, max: 1, step: .01, value: prefs.mvol ?? .45, className: 'midia__vol', title: 'Volume do vídeo (só para você)', ariaLabel: 'Volume do vídeo' })
  const mvOut = el('output', { className: 'midia__volout', textContent: pct(prefs.mvol ?? .45) })
  mv.addEventListener('input', () => { prefs.mvol = +mv.value; mvOut.textContent = pct(prefs.mvol); setMidiaVol(); savePrefs() })
  const mvBox = el('label', { className: 'midia__volbox' }, icon('volume-2'), mv, mvOut)
  const bar = el('div', { className: 'midia__bar' }, el('span', { className: 'midia__src', textContent: midia.kind === 'yt' ? 'YouTube' : 'Spotify' }), el('b', { className: 'midia__title' }), el('span', { className: 'midia__by' }), el('span', { className: 'midia__grow' }), mvBox, x)
  midiaEl = el('div', { className: `tile tile--midia midia--${midia.kind}` }, host, bar)
  tilesEl.append(midiaEl)
  renderMidiaBar(); layout()
  const want = midia
  if (midia.kind === 'yt') {
    await ytApi()
    if (midia !== want && midia?.id !== want.id) return
    mplayer = new YT.Player(host, {
      videoId: midia.id, width: '100%', height: '100%',
      playerVars: { autoplay: midia.playing ? 1 : 0, playsinline: 1, rel: 0, start: Math.floor(midiaNow()) },
      events: {
        onReady: () => { mready = true; setMidiaVol(); applyMidia(); const t = mplayer.getVideoData?.().title; if (t && midia && !midia.title) { midia.title = t; renderMidiaBar() } },
        onStateChange: e => {
          if (e.data === YT.PlayerState.BUFFERING) mbuf = performance.now()
          if (!midia || performance.now() < mquiet) return
          if (e.data === YT.PlayerState.PLAYING && !midia.playing) localMidia({ playing: true })
          else if (e.data === YT.PlayerState.PAUSED && midia.playing) localMidia({ playing: false })
          else if (e.data === YT.PlayerState.ENDED && midia.playing) localMidia({ playing: false })
        },
      },
    })
  } else {
    const api = await spApi()
    if (midia?.id !== want.id) return
    api.createController(host, { uri: midia.id, width: '100%', height: 352 }, ctrl => {
      mplayer = ctrl
      ctrl.addListener('ready', () => { mready = true; applyMidia() })
      ctrl.addListener('playback_update', e => {
        const was = spState; spState = e.data
        if (spState?.isBuffering) mbuf = performance.now()
        if (!midia || !was || performance.now() < mquiet) return
        if (was.isPaused !== spState.isPaused && spState.isPaused === midia.playing) localMidia({ playing: !spState.isPaused })
      })
    })
  }
}
function curMidiaPos() {
  if (!mready || !mplayer) return null
  if (midia?.kind === 'yt') return mplayer.getCurrentTime?.() ?? null
  return spState ? spState.position / 1000 : null
}
// leva o player local até o estado da sala (sem disparar eventos de volta)
function applyMidia() {
  if (!mready || !mplayer || !midia) return
  mquiet = performance.now() + 1200
  const want = midiaNow(), cur = curMidiaPos()
  if (midia.kind === 'yt') {
    const st = mplayer.getPlayerState?.()
    if (cur != null && Math.abs(cur - want) > 1.5) mplayer.seekTo(want, true)
    if (midia.playing && st !== YT.PlayerState.PLAYING && st !== YT.PlayerState.BUFFERING) mplayer.playVideo()
    if (!midia.playing && st === YT.PlayerState.PLAYING) mplayer.pauseVideo()
  } else {
    if (cur != null && Math.abs(cur - want) > 2) mplayer.seek(want)
    if (midia.playing && (!spState || spState.isPaused)) (spState && spState.position > 0 ? mplayer.resume() : mplayer.play())
    if (!midia.playing && spState && !spState.isPaused) mplayer.pause()
  }
}
// a cada segundo: corrige atraso e percebe quando alguém pulou o vídeo pelo próprio player
setInterval(() => {
  if (!midia || !mready || performance.now() < mquiet) return
  const cur = curMidiaPos(), want = midiaNow()
  if (cur == null) return
  const off = cur - want
  if (Math.abs(off) < 2.5) return
  const buffering = performance.now() - mbuf < 3000
  if (!buffering && (Math.abs(off) > 4 || !midia.playing)) localMidia({ pos: cur }) // pulou aqui: vale para todos
  else applyMidia() // ficou para trás (rede/carregamento): alcança a sala
}, 1000)
function setMidiaVol() {
  if (midia?.kind !== 'yt' || !mready || !mplayer?.setVolume) return
  // curva parecida com a do ouvido: o YouTube é linear e soa bem mais alto que a call
  const v = (prefs.mvol ?? .45) * (prefs.master ?? 1)
  if (me.deaf || !v) mplayer.mute?.(); else { mplayer.unMute?.(); mplayer.setVolume(Math.max(1, Math.round(v * v * 100))) }
  midiaEl?.querySelector('.midia__vol')?.setAttribute('value', prefs.mvol ?? .45)
}
$('#midiaForm').addEventListener('submit', e => {
  e.preventDefault()
  const url = $('#midiaUrl').value.trim()
  if (!url) return
  if (!parseMidia(url)) return toast('Cole um link do YouTube ou do Spotify.')
  $('#midiaUrl').value = ''
  openShareMenu(false)
  startMidia(url)
})

/* ---------- Rádio da sala ---------- */
radio = criaRadio({
  $, el, icon, toast, sysMsg, api, ytApi, spApi, me,
  hydrate: root => root.querySelectorAll('svg[data-icon]').forEach(s => setIcon(s, s.dataset.icon)),
  send: (d, target) => actions?.rad.send(d, target ? { target } : undefined),
  deaf: () => me.deaf, vol: () => prefs.master ?? 1,
  tela: (() => { const t = el('div', { className: 'radiotela', id: 'radioTela' }); $('#screenInner').append(t); return t })(),
  abrir: () => toggleRadio(true),
  onVol: () => { try { syncRadioVol() } catch {} },
})
// volume da rádio (só para você): botão direito no botão da rádio ou na tela
function radioVolControl() {
  const slider = el('input', { type: 'range', min: 0, max: 1, step: .01, value: radio.getVol(), ariaLabel: 'Volume da rádio' })
  const output = el('output', { textContent: pct(radio.getVol()) })
  slider.addEventListener('input', () => { radio.setVol(+slider.value); output.textContent = pct(+slider.value); if (radio.mudo() && +slider.value > 0) radio.setMudo(false) })
  return el('label', { className: 'ctxmenu__vol' }, icon('music'), el('span', { textContent: 'Rádio' }), slider, output)
}
// volume dos jogos (só para você): botão direito em cima do jogo
function jogoVolControl() {
  const v = () => prefs.jogoMudo ? 0 : prefs.jogoVol ?? 1
  const slider = el('input', { type: 'range', min: 0, max: 1.5, step: .01, value: v(), ariaLabel: 'Volume do jogo' })
  const output = el('output', { textContent: pct(v()) })
  slider.addEventListener('input', () => { prefs.jogoVol = +slider.value; prefs.jogoMudo = false; output.textContent = pct(+slider.value); applyAudioLevels(); savePrefs() })
  slider.addEventListener('dblclick', () => { slider.value = 1; slider.dispatchEvent(new Event('input')) })
  return el('label', { className: 'ctxmenu__vol' }, icon('gamepad-2'), el('span', { textContent: 'Jogo' }), slider, output)
}
function jogoMuteItem() {
  return ctxItem(prefs.jogoMudo ? 'volume-2' : 'volume-x', prefs.jogoMudo ? 'Voltar a ouvir o jogo' : 'Silenciar o jogo só para mim', () => { prefs.jogoMudo = !prefs.jogoMudo; applyAudioLevels(); savePrefs() })
}
function radioMuteItem() {
  return ctxItem(radio.mudo() ? 'volume-2' : 'volume-x', radio.mudo() ? 'Voltar a ouvir a rádio' : 'Silenciar a rádio só para mim', () => radio.setMudo(!radio.mudo()))
}
$('#btnRadio').addEventListener('contextmenu', e => {
  if (!radio.ativo()) return
  e.preventDefault()
  positionContext([el('div', { className: 'ctxmenu__title', textContent: 'Rádio da sala' }), radioVolControl(), radioMuteItem()], e.clientX, e.clientY)
})
function toggleRadio(open = $('#radio').hidden) {
  closePops(open ? $('#radio') : null)
  $('#radio').hidden = !open
  $('#btnRadio').setAttribute('aria-expanded', String(open))
  if (open) { $('#radio .radio__fila .radio__item--agora')?.scrollIntoView({ block: 'nearest' }); if (!radio.ativo()) $('#radio .radio__add input').focus() }
}
$('#btnRadio').addEventListener('click', () => toggleRadio())
const syncRadioVol = () => { $('#radioVol').value = radio.getVol(); $('#radioOut').textContent = pct(radio.getVol()) }
$('#radioVol').addEventListener('input', e => { radio.setVol(+e.target.value); $('#radioOut').textContent = pct(+e.target.value); if (radio.mudo() && +e.target.value > 0) radio.setMudo(false) })
$('#btnMixer').addEventListener('click', syncRadioVol)
syncRadioVol()

/* ---------- Jogos: cada um é um módulo à parte, baixado só quando alguém abre ou quando chega a primeira mensagem dele.
   Assim o principal (projetar, voz, chat) não carrega o peso dos jogos. ---------- */
const jogos = {} // id -> jogo já carregado
const carregando = {} // id -> promessa enquanto baixa
// botão de jogos aceso enquanto qualquer jogo estiver aberto
const jogoNoAr = () => $('#btnJogo')?.classList.toggle('on-air', Object.values(jogos).some(j => j?.ativo?.()))
const outroJogoAtivo = id => Object.entries(jogos).some(([k, j]) => k !== id && j?.ativo?.())
function ctxJogo(id) {
  const J = JOGOS[id]
  const tela = el('div', { className: J.tela, id: J.tela + 'Tela' }); $('#screenInner').append(tela)
  return {
    $, el, icon, toast, sysMsg, me, tela,
    send: (d, target) => actions?.jogo.send(d, target ? { target } : undefined),
    sendTo: (key, d) => { const ids = [...peers].filter(([, p]) => p.key === key).map(([pid]) => pid); if (ids.length) actions?.jogo.send(d, { target: ids }) },
    audioCtx: () => audioCtx(), saida: () => { audioCtx(); return mix.jogo },
    presentes: () => [...new Set([me.key, ...[...peers.values()].map(p => p.key)].filter(Boolean))],
    nomeDe: k => k === me.key ? me.name : [...peers.values()].find(p => p.key === k)?.name || person(k).nome,
    pfp: (k, s, n) => pfpImg(k, s, n),
    boneco: k => person(k).boneco || '',
    falando: k => k === me.key ? (me.speaking && !me.muted) : [...peers.values()].some(p => p.key === k && p.speaking && !p.muted),
    mudo: () => me.muted || me.deaf,
    outroJogo: () => false, faixaAtiva: () => false, // mesas paralelas: cada jogo segue o seu; o app mostra uma por vez
    hydrate: root => root.querySelectorAll('svg[data-icon]').forEach(s => setIcon(s, s.dataset.icon)),
    digitando: () => document.activeElement?.id === 'chatInput',
    onAtivo: on => { theater.classList.toggle(J.on, on); jogoNoAr(); mesaMudou(id, on) },
    // Faixa a Faixa
    salvaRes: r => api('sala', { method: 'POST', body: { op: 'faixa-res', pw: roomPw, key: me.key, nome: me.name, ...r } }),
    verDias: async datas => (await api('sala', { method: 'POST', body: { op: 'faixa-ver', pw: roomPw, datas } }))?.res || {},
    // alguém digitando um palpite: três pontinhos em cima do boneco (somem sozinhos)
    // no cooperativo vem o texto que a pessoa está digitando (em vez dos pontinhos)
    digitandoFaixa: (key, on, txt) => {
      const node = seatNodes.get(key)
      if (!node) return
      clearTimeout(node._digT)
      const velho = node.querySelector('.seat__dig')
      if (!on) return velho?.remove()
      if (txt && velho?.classList.contains('seat__dig--txt')) velho.querySelector('span').textContent = txt
      else { velho?.remove(); node.append(txt ? el('div', { className: 'seat__dig seat__dig--txt' }, el('span', { textContent: txt }), el('u')) : el('div', { className: 'seat__dig' }, el('i'), el('i'), el('i'))) }
      node._digT = setTimeout(() => node.querySelector('.seat__dig')?.remove(), 6000)
    },
    balao: (key, text) => showBubble({ key, text }),
  }
}
function carregaJogo(id) {
  if (jogos[id]) return Promise.resolve(jogos[id])
  if (carregando[id]) return carregando[id]
  const J = JOGOS[id]
  // telinha de carregamento na tela do cinema enquanto baixa
  const aviso = el('div', { className: 'jogo-carregando' }, el('span', {}, el('i'), el('i'), el('i')), el('small', { textContent: `Carregando ${J.nome}…` }))
  $('#screenInner').append(aviso)
  carregando[id] = (async () => {
    try {
      if (J.fontes) document.head.append(el('link', { rel: 'stylesheet', href: `${FONTES}${J.fontes}&display=swap` }))
      await Promise.all(J.css.map(h => document.querySelector(`link[href="${h}"], link[href^="${h}?"]`) ? null : new Promise(ok => { const l = el('link', { rel: 'stylesheet', href: cssVer ? `${h}?c=${cssVer}` : h }); l.onload = l.onerror = ok; document.head.append(l) })))
      const m = await import(J.mod)
      const j = m[J.cria](ctxJogo(id))
      jogos[id] = j
      if (id === 'faixa') faixa = j; else if (id === 'coup') coup = j; else if (id === 'dc') descarte = j; else if (id === 'pp') parPerfeito = j; else if (id === 'db') dobradinha = j; else if (id === 'du') douLheUma = j; else if (id === 'nt') naTesta = j; else if (id === 'qq') quadro = j; else amigosDeBosta = j
      return j
    } catch (e) { console.error(e); toast(`Não consegui abrir ${J.nome}. Tente de novo.`) ; return null }
    finally { aviso.remove(); delete carregando[id] }
  })()
  return carregando[id]
}
async function abreJogo(id, chamados) {
  if (jogos[id]?.ativo?.()) return setFoco(id) // já tem mesa desse jogo: vai para ela
  const outro = Object.keys(jogos).find(k => k !== id && jogos[k]?.ativo?.())
  if (outro && !chamados) return trocaJogo(outro, id)
  const j = await carregaJogo(id)
  j?.iniciar(chamados)
  setFoco(id)
}

/* ---------- Mesas: mais de um jogo ao mesmo tempo ----------
   Cada jogo é uma mesa. A tela mostra uma por vez (a mesa em foco); as outras seguem rodando por trás.
   Com duas ou mais, aparecem as abas em cima da tela e cada poltrona mostra em que mesa a pessoa está. */
var foco = '' // var: renderSeats pode rodar antes desta linha
function mesasNaSala() { return new Set([foco, ...[...peers.values()].map(p => p.mesa)].filter(Boolean)).size }
const ativos = () => Object.keys(jogos).filter(k => jogos[k]?.ativo?.())
function setFoco(id) {
  foco = id && jogos[id]?.ativo?.() ? id : melhorMesa()
  for (const [k, J] of Object.entries(JOGOS)) $('#' + J.tela + 'Tela')?.classList.toggle('mesa-oculta', !!foco && k !== foco)
  // a classe do jogo no teatro (esconde a fileira etc.) vale só para a mesa em foco
  for (const [k, J] of Object.entries(JOGOS)) theater.classList.toggle(J.on, k === foco)
  if (me.mesa !== foco) { me.mesa = foco; sendHello() }
  desenhaMesas(); renderSeats()
}
// a mesa em que eu jogo vem antes da que só estou olhando
const joga = id => !!jogos[id]?.jogadores?.().includes(me.key)
function melhorMesa(sem) {
  const ids = ativos().filter(k => k !== sem)
  return ids.find(joga) || ids[0] || ''
}
function mesaMudou(id, on) {
  if (on && (!foco || !jogos[foco]?.ativo?.())) return setFoco(id)
  if (!on && foco === id) return setFoco(melhorMesa(id))
  if (on && foco !== id) {
    if (joga(id) && !joga(foco)) return setFoco(id) // fui colocado nessa mesa e não jogo na que estou olhando
    $('#' + JOGOS[id].tela + 'Tela')?.classList.add('mesa-oculta'); theater.classList.remove(JOGOS[id].on)
  }
  desenhaMesas()
}
function iconeMesa(id) { return ({ coup: 'jogos/coup/cartas/duque.webp', dc: 'jogos/uno/logo.svg', pp: 'jogos/parperfeito/verso-vermelho.png', ab: 'jogos/amigosdebosta/verso-preto.png', db: 'jogos/dobradinha/capa.webp' })[id] }
function desenhaMesas() {
  let box = $('#mesas')
  const ids = ativos()
  if (ids.length < 2) { box?.remove(); return }
  if (!box) { box = el('nav', { id: 'mesas', className: 'mesas', 'aria-label': 'Mesas de jogo' }); $('#screenInner').append(box) }
  const pessoas = [{ key: me.key, mesa: foco }, ...[...peers.values()]]
  box.replaceChildren(el('small', { className: 'mesas__k', textContent: 'mesas' }), ...ids.map(id => {
    const js = jogos[id].jogadores?.() || [], aqui = pessoas.filter(p => p.mesa === id).length
    const b = el('button', { type: 'button', className: 'mesas__it' + (id === foco ? ' on' : '') + (js.includes(me.key) ? ' minha' : ''), title: `${JOGOS[id].nome}: ${js.length} jogando · ${aqui} olhando` },
      iconeMesa(id) ? el('img', { src: iconeMesa(id), alt: '' }) : el('span', { className: 'mesas__ic', innerHTML: ICONES_JOGO[id] || '' }),
      el('b', { textContent: JOGOS[id].nome }), el('small', { textContent: `${js.length} jogando` }))
    b.addEventListener('click', () => setFoco(id))
    return b
  }))
}
setInterval(() => { if (ativos().length > 1) desenhaMesas() }, 4000)

// tentou abrir um jogo com outro rolando: quem abriu a mesa (líder) escolhe levar todo mundo, abrir ao lado ou encerrar;
// quem só está jogando sai da mesa atual (ou abre ao lado, deixando a outra continuar)
function trocaJogo(atual, novoId) {
  document.querySelector('.trocajogo')?.remove()
  const A = JOGOS[atual], N = JOGOS[novoId], ja = jogos[atual], lider = !!ja?.lider?.()
  const fecha = () => m.remove()
  const op = (titulo, sub, fn, cls = '') => { const b = el('button', { type: 'button', className: 'trocajogo__op ' + cls }, el('b', { textContent: titulo }), el('small', { textContent: sub })); b.addEventListener('click', () => { fecha(); fn() }); return b }
  const ops = lider ? [
    op(`Levar todo mundo para ${N.nome}`, `Fecha ${A.nome} e já coloca quem estava jogando na mesa nova`, () => { const quem = ja.jogadores?.() || []; ja.encerra?.(); setTimeout(() => abreJogo(novoId, quem), 250) }, 'forte'),
    op(`Abrir ${N.nome} numa mesa ao lado`, `${A.nome} continua rodando; cada um escolhe em qual mesa fica`, async () => { const j = await carregaJogo(novoId); j?.iniciar(); setFoco(novoId) }),
    op(`Encerrar ${A.nome} para todos`, 'Fecha a mesa atual e não abre nada', () => ja.encerra?.(), 'perigo'),
  ] : [
    op(`Sair de ${A.nome} e abrir ${N.nome}`, `Só você sai; quem está em ${A.nome} continua jogando`, async () => { ja.sair?.(); const j = await carregaJogo(novoId); j?.iniciar(); setFoco(novoId) }, 'forte'),
  ]
  const m = el('div', { className: 'trocajogo', role: 'dialog', 'aria-modal': 'true' },
    el('div', { className: 'trocajogo__box' },
      el('div', { className: 'trocajogo__topo' }, iconeMesa(atual) ? el('img', { src: iconeMesa(atual), alt: '' }) : '', el('i', { textContent: '→' }), iconeMesa(novoId) ? el('img', { src: iconeMesa(novoId), alt: '' }) : el('span', { className: 'mesas__ic', innerHTML: ICONES_JOGO[novoId] || '' })),
      el('h3', { textContent: lider ? `${A.nome} está rolando` : `Você está em ${A.nome}` }),
      el('p', { textContent: lider ? `Você abriu essa mesa. O que fazer com ela?` : `Quem abriu a mesa de ${A.nome} é quem decide fechá-la para todos.` }),
      ...ops, op('Cancelar', '', () => {}, 'leve')))
  m.addEventListener('click', e => { if (e.target === m) fecha() })
  m.addEventListener('keydown', e => { if (e.key === 'Escape') fecha() })
  ;(theater.classList.contains('palco') || document.fullscreenElement ? theater : document.body).append(m)
  m.querySelector('.trocajogo__op')?.focus()
}
// quem abriu uma mesa e recarregou a página: o jogo volta sozinho (o módulo confere se ainda é o host)
for (const [id, k] of [['faixa', 'faixa.S'], ['coup', 'coup.G'], ['dc', 'dc.G'], ['pp', 'pp.G'], ['ab', 'ab.G'], ['db', 'db.G'], ['du', 'du.G'], ['nt', 'nt.G'], ['qq', 'qq.G']]) { try { if (localStorage.getItem(k)) carregaJogo(id) } catch {} }

/* ---------- Botão de jogos: escolher o jogo ---------- */
// ícones do menu: desenhados no centro de um quadrado de 24, para ficarem alinhados
const ICONES_JOGO = {
  qq: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="1.6" fill="#050404"/><g fill="#f4ecdf" opacity=".55"><rect x="3.5" y="6.2" width="1.6" height="1.1" rx=".3"/><rect x="7.5" y="6.2" width="1.6" height="1.1" rx=".3"/><rect x="11.5" y="6.2" width="1.6" height="1.1" rx=".3"/><rect x="15.5" y="6.2" width="1.6" height="1.1" rx=".3"/><rect x="19" y="6.2" width="1.6" height="1.1" rx=".3"/><rect x="3.5" y="16.7" width="1.6" height="1.1" rx=".3"/><rect x="7.5" y="16.7" width="1.6" height="1.1" rx=".3"/><rect x="11.5" y="16.7" width="1.6" height="1.1" rx=".3"/><rect x="15.5" y="16.7" width="1.6" height="1.1" rx=".3"/><rect x="19" y="16.7" width="1.6" height="1.1" rx=".3"/></g><rect x="3.6" y="8.4" width="7.6" height="7.2" rx=".6" fill="#f5b841"/><rect x="12.8" y="8.4" width="7.6" height="7.2" rx=".6" fill="#f5b841" opacity=".35"/></svg>',
  faixa: '<svg viewBox="0 0 24 24" fill="#fff"><rect x="4" y="9" width="3" height="6" rx="1.5"/><rect x="8.5" y="5" width="3" height="14" rx="1.5"/><rect x="13" y="7.5" width="3" height="9" rx="1.5"/><rect x="17.5" y="10" width="3" height="4" rx="1.5"/></svg>',
  du: '<svg viewBox="0 0 24 24" fill="none" stroke="#14231b" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 12.5-8 8a2.12 2.12 0 1 1-3-3l8-8"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/></svg>',
  nt: '<svg viewBox="0 0 24 24"><path d="M5 4h14v12.5L15.5 20H5z" fill="#ffe066" transform="rotate(-6 12 12)"/><text x="12" y="15.6" text-anchor="middle" font-family="Georgia, serif" font-weight="900" font-size="11" fill="#22170e" transform="rotate(-6 12 12)">?</text></svg>',
  db: '<svg viewBox="0 0 24 24"><rect x="3.5" y="6" width="9" height="13" rx="1.4" fill="#f5f7f6" transform="rotate(-10 8 12.5)"/><rect x="11" y="4" width="9" height="13" rx="1.4" fill="#f5f7f6" transform="rotate(8 15.5 10.5)"/><text x="15.6" y="13.6" text-anchor="middle" font-family="Georgia, serif" font-weight="900" font-size="7.4" fill="#c2362c" transform="rotate(8 15.5 10.5)">7</text><text x="8" y="15.4" text-anchor="middle" font-family="Georgia, serif" font-weight="900" font-size="7" fill="#1d4c9b" transform="rotate(-10 8 12.5)">4</text></svg>',
}
// Menu de jogos em grade: o que está rolando vai no topo, com quem está jogando
const LISTA_JOGOS = [
  ['faixa', 'Faixa a Faixa', 'Música do dia', () => el('span', { className: 'jogosmenu__ic jogosmenu__ic--faixa', innerHTML: ICONES_JOGO.faixa })],
  ['coup', 'Coup', '2 a 10', () => el('img', { className: 'jogosmenu__ic jogosmenu__ic--coup', src: 'jogos/coup/cartas/duque.webp', alt: '' })],
  ['dc', 'Uno', '2 a 10', () => el('img', { className: 'jogosmenu__ic jogosmenu__ic--dc jogosmenu__arte', src: 'jogos/uno/logo.svg', alt: '' })],
  ['pp', 'Red Flags', '3 ou mais', () => el('img', { className: 'jogosmenu__ic jogosmenu__ic--pp jogosmenu__arte', src: 'jogos/parperfeito/verso-vermelho.png', alt: '' })],
  ['ab', 'Amigos de Merda', '3 ou mais', () => el('img', { className: 'jogosmenu__ic jogosmenu__ic--ab jogosmenu__arte', src: 'jogos/amigosdebosta/verso-preto.png', alt: '' })],
  ['db', 'Dobradinha', '2 a 6', () => el('span', { className: 'jogosmenu__ic jogosmenu__ic--db', innerHTML: ICONES_JOGO.db })],
  ['du', 'Dou-lhe Uma', '2 ou mais', () => el('span', { className: 'jogosmenu__ic jogosmenu__ic--du', innerHTML: ICONES_JOGO.du })],
  ['nt', 'Na Testa', '2 ou mais', () => el('span', { className: 'jogosmenu__ic jogosmenu__ic--nt', innerHTML: ICONES_JOGO.nt })],
  ['qq', 'Quadro a Quadro', '1 ou mais', () => el('span', { className: 'jogosmenu__ic jogosmenu__ic--qq', innerHTML: ICONES_JOGO.qq })],
]
const DESC_JOGO = { faixa: 'Adivinhe a música do dia', coup: 'Blefe e intriga na corte', dc: 'Combine cor ou número', pp: 'Monte o pretendente ideal', ab: 'Votem em quem merece', db: 'Suba o valor; empatou, dobra', du: 'Leilão de listas: quem cita mais?', nt: 'Descubra quem está na sua testa', qq: 'Adivinhe o filme pelo frame' }
function menuJogos(btn) {
  const aberto = document.querySelector('.jogosmenu')
  if (aberto) return aberto.remove()
  const naMesa = id => [me, ...peers.values()].filter(p => p?.mesa === id)
  const abre = id => { m.remove(); abreJogo(id) }
  const rolando = LISTA_JOGOS.filter(([id]) => jogos[id]?.ativo?.() || naMesa(id).length)
  const cartao = ([id, nome, sub, arte]) => {
    const quem = naMesa(id)
    const b = el('button', { type: 'button', className: 'jogosmenu__card' + (quem.length ? ' on' : ''), title: DESC_JOGO[id] || '' },
      el('span', { className: 'jogosmenu__arte-box' }, arte()), el('b', { textContent: nome }), el('small', { textContent: quem.length ? `${quem.length} jogando` : sub }))
    b.addEventListener('click', () => abre(id)); return b
  }
  const m = el('div', { className: 'jogosmenu jogosmenu--grade' },
    ...(rolando.length ? [el('small', { className: 'jogosmenu__k', textContent: 'Rolando agora' }), ...rolando.map(([id, nome, , arte]) => {
      const quem = naMesa(id)
      const b = el('button', { type: 'button', className: 'jogosmenu__agora' }, arte(),
        el('span', {}, el('b', { textContent: nome }), el('small', { textContent: quem.length ? quem.map(p => p.name).slice(0, 4).join(', ') + (quem.length > 4 ? ` e mais ${quem.length - 4}` : '') : 'mesa aberta' })),
        el('div', { className: 'jogosmenu__rostos' }, ...quem.slice(0, 4).map(p => pfpImg(p.key, 24, p.name))), el('em', { textContent: 'Entrar' }))
      b.addEventListener('click', () => abre(id)); return b
    })] : []),
    el('small', { className: 'jogosmenu__k', textContent: 'Jogar com a call' }),
    el('div', { className: 'jogosmenu__grade' }, ...LISTA_JOGOS.map(cartao)))
  // em tela cheia só o que está dentro do palco aparece
  ;(imersivo() ? theater : document.body).append(m)
  const r = btn.getBoundingClientRect()
  m.style.left = Math.max(8, Math.min(r.left + r.width / 2 - m.offsetWidth / 2, innerWidth - m.offsetWidth - 8)) + 'px'
  m.style.top = (r.top - m.offsetHeight - 10) + 'px'
  setTimeout(() => document.addEventListener('pointerdown', function fora(e) { if (!m.contains(e.target) && e.target !== btn && !btn.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', fora) } }), 0)
}
$('#btnJogo').addEventListener('click', e => { closePops(); menuJogos(e.currentTarget) })
// tela vazia: atalhos grandes para começar
$('#emptyTela')?.addEventListener('click', () => shareScreen())
$('#emptyArquivo')?.addEventListener('click', () => $('#shareFile').click())
$('#emptyJogo')?.addEventListener('click', e => { closePops(); menuJogos(e.currentTarget) })
// Dicas estilizadas (no lugar do title do navegador, que demora e é feio) nos botões das barras
const dica = el('div', { className: 'dica', role: 'tooltip', hidden: true })
let dicaDe = null, dicaT = 0
document.addEventListener('pointerover', e => {
  const b = e.target.closest?.('.toolbar [title], .toolbar--voz [title], .player-controls [title], .nfx-acoes [title]')
  if (!b || e.pointerType !== 'mouse' || b === dicaDe || b.id === 'btnReact') return
  escondeDica()
  dicaDe = b; b.dataset.dica = b.title; b.removeAttribute('title')
  clearTimeout(dicaT)
  dicaT = setTimeout(() => {
    if (dicaDe !== b) return
    dica.textContent = b.dataset.dica; (imersivo() ? theater : document.body).append(dica); dica.hidden = false
    const r = b.getBoundingClientRect(), w = dica.offsetWidth, h = dica.offsetHeight
    const cima = r.top - h - 10 > 4
    dica.style.left = Math.max(6, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 6)) + 'px'
    dica.style.top = (cima ? r.top - h - 8 : r.bottom + 8) + 'px'
  }, 350)
})
function escondeDica() {
  clearTimeout(dicaT); dica.hidden = true
  if (dicaDe) { if (!dicaDe.hasAttribute('title') && dicaDe.dataset.dica) dicaDe.title = dicaDe.dataset.dica; dicaDe = null }
}
document.addEventListener('pointerout', e => { if (dicaDe && !dicaDe.contains(e.relatedTarget)) escondeDica() })
document.addEventListener('pointerdown', escondeDica, true)
// Barra mais limpa: o que se usa pouco (rádio, áudio da sala, teatro, palco) fica atrás do "⋯".
// Aparece sozinho se estiver em uso (rádio tocando, painel aberto).
for (const sel of ['#btnRadio', '#btnMixer']) $(sel)?.closest('.popwrap')?.classList.add('toolbar__rara')
for (const sel of ['#btnTeatro', '#btnPalco']) $(sel)?.classList.add('toolbar__rara')
$('#btnMais').addEventListener('click', e => {
  const tb = e.currentTarget.closest('.toolbar'), on = !tb.classList.contains('mais')
  tb.classList.toggle('mais', on); e.currentTarget.setAttribute('aria-expanded', String(on))
  setTimeout(() => arrumaBarra?.(), 0)
})

/* ---------- Transmitir: menu ---------- */
const shareMenu = $('#shareMenu')
function openShareMenu(open = shareMenu.hidden) {
  closePops(open ? shareMenu : null)
  shareMenu.hidden = !open
  $('#btnShare').setAttribute('aria-expanded', String(open))
  if (open) listDevices()
}
const onShareBtn = () => (myShare ? stopShare() : openShareMenu())
$('#btnShare').addEventListener('click', onShareBtn)
$('#shareScreen').addEventListener('click', () => { openShareMenu(false); shareScreen() })
$('#btnTrocar').addEventListener('click', trocarTela)
$('#shareFile').addEventListener('click', () => $('#fileInput').click())
$('#fileInput').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; openShareMenu(false); if (f) shareFile(f) })
$('#gameMode').checked = !!store.get('game')
$('#gameMode').addEventListener('change', e => store.set('game', e.target.checked))
$('#extraAudio').addEventListener('change', e => { prefs.extra = e.target.value; savePrefs() })

async function listDevices() {
  const devices = await navigator.mediaDevices?.enumerateDevices?.().catch(() => []) || []
  const inputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId && !['default','communications'].includes(d.deviceId))
  const outputs = devices.filter(d => d.kind === 'audiooutput' && d.deviceId && !['default','communications'].includes(d.deviceId))
  const fill = (select, list, first, value) => {
    if (!select) return
    select.replaceChildren(el('option', { value: '', textContent: first }), ...list.map((d, i) => el('option', { value: d.deviceId, textContent: d.label || `Dispositivo ${i + 1}` })))
    select.value = list.some(d => d.deviceId === value) ? value : ''
  }
  fill($('#extraAudio'), inputs, 'Nenhum', prefs.extra)
  fill($('#micDevice'), inputs.filter(d => !/monitor/i.test(d.label)), 'Microfone padrão', prefs.mic)
  fill($('#audioInput'), inputs.filter(d => !/monitor/i.test(d.label)), 'Microfone padrão', prefs.mic)
  const supported = typeof AudioContext.prototype.setSinkId === 'function'
  fill($('#audioOutput'), outputs, 'Saída padrão do sistema', prefs.output)
  if ($('#audioOutput')) $('#audioOutput').disabled = !supported
  if ($('#audioOutput')) $('#audioOutput').title = supported ? 'Todo o áudio da sala usa esta saída' : 'Neste navegador, altere a saída nas configurações do sistema'
}
navigator.mediaDevices?.addEventListener?.('devicechange', () => listDevices())

function shareMsg() {
  const n = nfxDe(myShare)
  const t = myShare.kind === 'arquivo' && myShare.video ? myShare.video.currentTime : n ? n.t : undefined
  if (n) return { on: true, kind: myShare.kind, midia: myShare.midia || null, game: false, paused: n.paused, subs: false, t, duration: n.d, rate: 1, preview: '', quality: myShare.quality || 'auto', nfx: { ctl: prefs.nfxTodos === false ? 'eu' : 'todos', pular: n.pular, fim: n.fim, voto: myShare.voto ? { id: myShare.voto.id, s: myShare.voto.sim.size, n: myShare.voto.nao.size, ate: myShare.voto.ate - Date.now(), fim: myShare.voto.fim, tot: peers.size + 1, nq: myShare.voto.notas.size, nm: myShare.voto.notas.size ? [...myShare.voto.notas.values()].reduce((a, v) => a + v, 0) / myShare.voto.notas.size : 0 } : null } }
  return { on: true, kind: myShare.kind, midia: myShare.midia || null, game: myShare.game, paused: !!myShare.paused, subs: !!myShare.subs, t, duration: myShare.video?.duration || 0, rate: myShare.video?.playbackRate || 1, preview: myShare.preview || '', quality: myShare.quality || 'auto' }
}
// quem transmite arquivo avisa o tempo do filme de vez em quando (para marcar mensagens)
setInterval(() => { if (myShare?.kind === 'arquivo' || myShare?.nfxEnviado) actions?.share.send(shareMsg()) }, 5000)
// nome do que está sendo projetado, para o diário: arquivo sem extensão e sem etiquetas técnicas; tela pelo nome da janela/aba quando o navegador conta
function nomeDoArquivo(n) {
  let t = String(n || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[._]+/g, ' ')
  t = t.replace(/\b(2160p|1080p|720p|480p|4k|uhd|hdr|x26[45]|h ?26[45]|hevc|web[- ]?(dl|rip)?|blu[- ]?ray|bdrip|brrip|dvdrip|aac|ac3|dts|ddp?5 1|5 1|dual|dublado|legendado|nacional|repack|proper|yify|rarbg)\b.*$/i, '')
  return t.replace(/\s+/g, ' ').replace(/[\s(\[-]+$/, '').trim() || String(n || '').slice(0, 80)
}
const nomeDaTela = vt => { const l = vt?.label || ''; return l && !/^(screen|window|web-contents-media-stream|tab|monitor)[:\s]/i.test(l) && !/^[\w-]+:\/\//.test(l) ? l.slice(0, 120) : '' }
function publish(stream, opts, localVideo, cleanup) {
  if (myShare) stopShare(true)
  myShare = { stream, ...opts, video: localVideo, cleanup }
  room?.addStream(stream, { metadata: { screen: 1 } })
  actions?.share.send(shareMsg())
  addTile(selfId, stream, localVideo)
  if (opts.kind === 'tela' && !opts.game && opts.vt) detectaMidia(opts.vt)
  sfx('telaOn')
  setTimeout(tuneSenders, 1500)
}
function stopShare(silent) {
  if (!myShare) return
  const s = myShare
  myShare = null
  try { room?.removeStream(s.stream) } catch {}
  s.stream.getTracks().forEach(t => t.stop())
  s.detector?.parar()
  s.cleanup?.()
  peerQuality.clear()
  actions?.share.send({ on: false })
  removeTile(selfId)
  if (!silent) sfx('telaOff')
  showSub(selfId, '')
  if (pendingUpdate) setTimeout(() => recarregar('versao'), 1500)
}

// Tela/janela/aba, com som da aba e/ou de uma entrada extra (ex.: monitor do PipeWire = som do PC)
// captura tela/janela/aba (+ som extra); devolve as trilhas e como parar tudo
async function captureScreen(game) {
  if (!navigator.mediaDevices?.getDisplayMedia) { toast('Este navegador não projeta a tela. Use Chrome ou Edge no computador.'); return null }
  const fps = game ? 60 : 30
  let ds
  try {
    ds = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: fps, max: fps }, width: { max: 1920 }, height: { max: 1080 } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: true },
      systemAudio: 'include', selfBrowserSurface: 'exclude', surfaceSwitching: 'include', preferCurrentTab: false,
    })
  } catch (e) {
    if (e.name !== 'NotAllowedError') toast('Não deu para projetar: ' + e.message)
    return null
  }
  const [vt] = ds.getVideoTracks()
  if ('contentHint' in vt) vt.contentHint = 'motion'
  let audio = ds.getAudioTracks()
  const extras = []
  let ctx = null
  if (prefs.extra) {
    try {
      const ex = await navigator.mediaDevices.getUserMedia({ audio: {
        deviceId: { exact: prefs.extra }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2,
      } })
      extras.push(...ex.getTracks())
      if (audio.length) { // som da aba + som extra: junta os dois numa trilha só
        ctx = new AudioContext({ sampleRate: 48000 })
        const dest = ctx.createMediaStreamDestination()
        ;[...audio, ...extras].forEach(t => ctx.createMediaStreamSource(new MediaStream([t])).connect(dest))
        audio = dest.stream.getAudioTracks()
      } else audio = extras
    } catch { toast('Não consegui abrir o som extra escolhido') }
  }
  audio.forEach(t => { if ('contentHint' in t) t.contentHint = 'music' })
  if (!audio.length) toast('Sem som: compartilhe uma ABA com “Compartilhar áudio”, ou escolha um “Som extra” no menu', 6000)
  return { vt, at: audio[0] || null, stop: () => { ds.getTracks().forEach(t => t.stop()); extras.forEach(t => t.stop()); ctx?.close() } }
}
async function shareScreen() {
  const game = $('#gameMode').checked
  const cap = await captureScreen(game)
  if (!cap) return
  const stream = new MediaStream([cap.vt, ...(cap.at ? [cap.at] : [])])
  const share = { stop: cap.stop }
  cap.vt.addEventListener('ended', () => { if (myShare?.stream === stream && myShare.vt === cap.vt) stopShare() })
  publish(stream, { kind: 'tela', game, vt: cap.vt, at: cap.at, share, titulo: nomeDaTela(cap.vt) || `Tela de ${me.name}` }, null, () => share.stop())
}
// O que está passando (Netflix por enquanto): lê o texto da tela e busca capa, nota e episódio
async function detectaMidia(vt) {
  const share = myShare
  let mod
  try { mod = await import('./midia.js') } catch { return }
  if (myShare !== share) return
  share.detector = mod.criaDetector(vt, r => { if (!nfxDe(share)) aplicaMidia(share, r, true) })
}
// a extensão (exata) ou o OCR acharam o que está passando: busca capa/nota e avisa todo mundo
async function aplicaMidia(share, r, ocr) {
  const k = `${r.titulo}|${r.s}|${r.e}`
  if (share.midiaK === k) return
  share.midiaK = k
  const mod = await import('./midia.js').catch(() => null)
  const m = mod ? await mod.buscaMidia(r) : null
  if (myShare !== share || share.midiaK !== k) return
  // leitura da tela só vale se o título existir no catálogo (OCR às vezes lê lixo, ex.: "Você db")
  if (ocr && !m) { share.midiaK = ''; return }
  share.midia = {
      plat: r.plat, titulo: r.titulo, s: r.s, e: r.e, epNome: r.epNome || m?.ep?.nome || '', tipo: m?.tipo || (r.s ? 'serie' : 'filme'),
      original: m?.filme || '', ano: m?.ano || '', nota: m?.nota ?? null, epNota: m?.ep?.nota ?? null, epImdb: m?.ep?.imdb || '', poster: m?.poster || '', fundo: m?.ep?.still || m?.background || '', imdb: m?.id || '',
    }
  share.titulo = r.titulo + (r.s ? ` · T${r.s}E${r.e}` : '')
  actions?.share.send(shareMsg()); renderTile(selfId)
  if (r.plat === 'netflix' && !nfx.ext && !nfx.avisou && /Chrome|Edg/.test(navigator.userAgent)) {
    nfx.avisou = true
    nudge('netflix', 'Com a extensão do Cineminha, a sala pausa e pula a sua Netflix.', 'Baixar extensão', () => {
      open('baixar/extensao', '_blank')
      toast('Descompacte, abra chrome://extensions, ligue o “Modo do desenvolvedor” e clique em “Carregar sem compactação”', 12000)
    }, () => {})
  }
}

// "Tela de Fulano" no diário não diz nada: quem projeta pode dizer o que está passando (busca capa e nota)
function nomearProjecao() {
  const sh = myShare
  if (!sh) return
  document.querySelector('.nomear')?.remove()
  const inp = el('input', { maxlength: 100, placeholder: 'Ex.: O Conto da Aia T1E8, Duna, jogo de Minecraft…', value: sh.midia?.titulo || '' })
  const box = el('form', { className: 'nomear' }, el('b', { textContent: 'O que está passando?' }), inp,
    el('div', {}, el('button', { type: 'button', className: 'btn btn--ghost', textContent: 'Cancelar' }), el('button', { type: 'submit', className: 'btn btn--primary', textContent: 'Salvar' })))
  box.querySelector('[type=button]').addEventListener('click', () => box.remove())
  box.addEventListener('submit', e => {
    e.preventDefault(); box.remove()
    const t = inp.value.trim()
    if (!t || myShare !== sh) return
    const m = t.match(/^(.*?)\s*[TS](\d{1,2})\s*[:.]?\s*E(\d{1,3})\b/i)
    sh.midiaK = ''
    sh.titulo = t
    aplicaMidia(sh, { plat: sh.midia?.plat || '', titulo: (m ? m[1] : t).trim(), s: m ? +m[2] : 0, e: m ? +m[3] : 0, epNome: '' })
    toast('Anotado no diário')
  })
  ;(imersivo() ? theater : document.body).append(box)
  inp.focus(); inp.select()
}
/* ---------- Extensão Cineminha · Netflix ----------
   Com a extensão (pasta extensao/netflix), quem projeta a Netflix recebe dela o tempo, a pausa e o título
   exatos, e a sala controla o player: play/pausa, pular e voltar. Quem pode controlar: todos ou só quem projeta. */
const nfx = { ext: false, avisou: false }
const nfxDe = sh => sh?.kind === 'tela' && !sh.game && sh.nfx && Date.now() - sh.nfx.at < 8000 ? sh.nfx : null
addEventListener('message', e => {
  if (e.source !== window || e.data?.cineExt !== 'netflix') return
  const d = e.data
  if (d.tipo === 'ola') { if (!nfx.ext) console.info('[Cineminha] extensão da Netflix encontrada', d.versao || ''); nfx.ext = true }
  else if (d.tipo === 'estado') nfxEstado(d)
  else if (d.tipo === 'captura' && typeof d.id === 'string') projetarDaExtensao(d.id, String(d.titulo || ''))
})
// Projeção pela extensão (chrome.tabCapture): a aba vem sem a faixa "Compartilhando…" do Chrome.
// O som da aba deixa de tocar nela e vem para cá; quem projeta ouve pelo mixer (com volume).
async function projetarDaExtensao(id, titulo) {
  if (!me.key) return
  const src = { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: id } }
  let ds
  try {
    ds = await navigator.mediaDevices.getUserMedia({ audio: src, video: { mandatory: { ...src.mandatory, maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30 } } })
  } catch (e) { toast('Não deu para projetar pela extensão: ' + (e.message || e.name)); return }
  const [vt] = ds.getVideoTracks(), [at] = ds.getAudioTracks()
  if ('contentHint' in vt) vt.contentHint = 'motion'
  if (at) { at._somNaAba = false; if ('contentHint' in at) at.contentHint = 'music' }
  if (myShare) stopShare(true)
  const stream = new MediaStream([vt, ...(at ? [at] : [])])
  const share = { stop: () => ds.getTracks().forEach(t => t.stop()) }
  vt.addEventListener('ended', () => { if (myShare?.stream === stream && myShare.vt === vt) stopShare() })
  publish(stream, { kind: 'tela', game: false, vt, at, share, titulo: titulo.replace(/\s*[-|–]\s*Netflix\s*$/i, '').trim() || `Tela de ${me.name}` }, null, () => share.stop())
  toast('Projetando pela extensão', 2500)
}
postMessage({ cineExt: 'netflix', tipo: 'quem' }, location.origin)
function nfxEstado(d) {
  const sh = myShare
  if (sh?.kind !== 'tela' || sh.game) return
  const ant = nfxDe(sh), agora = Date.now()
  if (!sh.nfx) console.info('[Cineminha] Netflix conectada pela extensão')
  sh.nfx = { paused: !!d.paused, t: Math.max(0, +d.t || 0), d: Math.max(0, +d.d || 0), at: agora, pular: ['abertura', 'resumo'].includes(d.pular) ? d.pular : '', fim: !!d.fim }
  // abertura/resumo: pula sozinho se quem projeta quiser; senão aparece o botão para a sala
  if (sh.nfx.pular && !ant?.pular && prefs.nfxPular) setTimeout(() => { if (nfxDe(sh)?.pular) { nfxCmd('pular'); sysMsg(`Pulei ${sh.nfx.pular === 'resumo' ? 'o resumo' : 'a abertura'}`) } }, 700)
  // fim do episódio (a Netflix mostra "Próximo episódio"): a sala vota se vê mais um
  if (sh.nfx.fim && !ant?.fim && !sh.voto) iniciaVoto(sh)
  if (!sh.nfx.fim && sh.voto && !sh.voto.fim) encerraVoto(sh, 'seguiu')
  if (d.midia?.titulo) aplicaMidia(sh, { plat: 'netflix', titulo: String(d.midia.titulo).slice(0, 100), s: +d.midia.s || 0, e: +d.midia.e || 0, epNome: String(d.midia.epNome || '').slice(0, 100) })
  const previsto = ant ? ant.t + (ant.paused ? 0 : (agora - ant.at) / 1000) : 0
  if (!ant || ant.paused !== sh.nfx.paused || ant.pular !== sh.nfx.pular || ant.fim !== sh.nfx.fim || Math.abs(previsto - sh.nfx.t) > 3 || agora - (sh.nfxEnviado || 0) > 5000) {
    sh.nfxEnviado = agora; actions?.share.send(shareMsg()); renderTile(selfId)
  }
}
/* Votação "mais um episódio?": quem projeta conta os votos. Maioria da sala decide na hora;
   senão, em 12 s vale o que tiver mais votos (empate ou ninguém votou: a Netflix segue sozinha). */
const VOTO_MS = 12000
function iniciaVoto(sh) {
  sh.voto = { id: Date.now().toString(36), sim: new Set(), nao: new Set(), notas: new Map(), ate: Date.now() + VOTO_MS, fim: '', md: sh.midia }
  sh.voto.timer = setTimeout(() => encerraVoto(sh), VOTO_MS)
  sfx('chat'); actions?.share.send(shareMsg()); renderTile(selfId)
}
function votou(sh, quem, v, id) {
  const vt = sh?.voto
  if (!vt || vt.fim || vt.id !== id) return
  vt.sim.delete(quem); vt.nao.delete(quem)
  ;(v > 0 ? vt.sim : vt.nao).add(quem)
  const total = peers.size + 1
  if (vt.sim.size > total / 2 || vt.nao.size > total / 2) encerraVoto(sh)
  else { actions?.share.send(shareMsg()); renderTile(selfId) }
}
function deuNota(sh, quem, v, id) {
  const vt = sh?.voto
  if (!vt || vt.id !== id || !(v >= 1 && v <= 5)) return
  vt.notas.set(quem, Math.round(v))
  actions?.share.send(shareMsg()); renderTile(selfId)
}
// guarda a nota da sala no diário (só a de quem projetou manda, uma vez por episódio)
function salvaNotas(vt) {
  if (!vt?.notas.size || !vt.md?.titulo || vt.salvo) return
  vt.salvo = true
  const notas = Object.fromEntries([...vt.notas].map(([quem, v]) => [quem === selfId ? me.key : peers.get(quem)?.key || quem, v]))
  api('sala', { method: 'POST', body: { op: 'nota', r: roomId, pw: roomPw, registra: !/^teste/i.test(canal || ''), ti: vt.md.titulo, s: vt.md.s, e: vt.md.e, notas } })
}
function encerraVoto(sh, motivo) {
  const vt = sh.voto
  if (!vt || vt.fim) return
  clearTimeout(vt.timer)
  const placar = `${vt.sim.size} × ${vt.nao.size}`
  if (motivo === 'seguiu') vt.fim = 'seguiu'
  else if (vt.sim.size > vt.nao.size) { vt.fim = 'sim'; nfxCmd('proximo'); sysMsg(`A sala votou: mais um episódio! (${placar})`) }
  else if (vt.nao.size > vt.sim.size) { vt.fim = 'nao'; nfxCmd('creditos'); sysMsg(`A sala votou: paramos por aqui (${placar})`) }
  else vt.fim = 'seguiu'
  actions?.share.send(shareMsg()); renderTile(selfId)
  setTimeout(() => { salvaNotas(vt); if (sh.voto === vt) { sh.voto = null; if (myShare === sh) { actions?.share.send(shareMsg()); renderTile(selfId) } } }, 12000)
}
function nfxCmd(op, d) { postMessage({ cineExt: 'netflix', tipo: 'cmd', op, d, id: Date.now() + '' + Math.random() }, location.origin) }
// Trocar o que está sendo projetado sem parar a transmissão: troca as trilhas na mesma conexão
async function trocarTela() {
  if (myShare?.kind !== 'tela') return shareScreen()
  const cap = await captureScreen(myShare.game)
  if (!cap) return
  const s = myShare
  if (!s || s.kind !== 'tela') { cap.stop(); return }
  const { stream } = s, oldV = s.vt, oldA = s.at
  try {
    room?.replaceTrack(oldV, cap.vt)
    if (oldA && cap.at) room?.replaceTrack(oldA, cap.at)
    else if (oldA && !cap.at) room?.removeTrack(oldA)
    else if (!oldA && cap.at) room?.addTrack(cap.at, stream, { metadata: { screen: 1 } })
  } catch (e) { console.warn('troca de tela', e) }
  stream.removeTrack(oldV); stream.addTrack(cap.vt)
  if (oldA) stream.removeTrack(oldA)
  if (cap.at) stream.addTrack(cap.at)
  const oldStop = s.share.stop
  s.share.stop = cap.stop
  s.vt = cap.vt; s.at = cap.at
  oldStop()
  // outra aba/janela: esquece o que estava passando e volta a procurar
  s.detector?.parar(); s.midia = null; s.midiaK = ''
  if (!s.game) detectaMidia(cap.vt)
  cap.vt.addEventListener('ended', () => { if (myShare === s && s.vt === cap.vt) stopShare() })
  const t = tiles.get(selfId)
  if (t) { t.crop = null; t.cropFound = null; t.barKey = ''; t.cropLocked = false; t.video.srcObject = stream; t.video.play().catch(() => {}); t.fit?.(); ligaSomDaTile(t, selfId, stream); applyTileVols() }
  actions?.share.send(shareMsg())
  setTimeout(tuneSenders, 1500)
  sfx('telaOn')
  toast('Tela trocada', 1600)
}

// Arquivo de vídeo: toca aqui e vai direto para os outros, sem captura de tela
async function shareFile(file) {
  const url = URL.createObjectURL(file)
  const v = el('video', { playsInline: true, controls: false, muted: true, preload: 'auto', src: url, className: 'filevideo' })
  v.volume = Math.min(1, (prefs.master ?? 1) * prefs.vol * (prefs.tmute[me.key] ? 0 : prefs.tvol[me.key] ?? 1))
  try { await v.play() } catch (e) { URL.revokeObjectURL(url); return fileProblem(file, { video: false, audio: false }) }
  // testa se o navegador decodifica vídeo e som de verdade (HEVC, AC3, DTS e alguns MKV não tocam no Chrome)
  if ('webkitVideoDecodedByteCount' in v) {
    await sleep(1500)
    const okVideo = v.videoWidth > 0 && v.webkitVideoDecodedByteCount > 0
    const okAudio = v.webkitAudioDecodedByteCount > 0
    if (!okVideo || !okAudio) {
      v.pause()
      const go = await fileProblem(file, { video: okVideo, audio: okAudio })
      if (!go) { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); return }
      v.currentTime = 0
      try { await v.play() } catch {}
    } else v.currentTime = 0
  }
  const cap = (v.captureStream || v.mozCaptureStream).call(v)
  for (let i = 0; i < 30 && !cap.getVideoTracks().length; i++) await sleep(100)
  if (!cap.getVideoTracks().length) { v.pause(); URL.revokeObjectURL(url); return toast('Não consegui ler o vídeo desse arquivo') }
  cap.getVideoTracks().forEach(t => { if ('contentHint' in t) t.contentHint = 'motion' })
  cap.getAudioTracks().forEach(t => { if ('contentHint' in t) t.contentHint = 'music' })
  v.pause()
  if (v.currentTime > 0) {
    await new Promise(resolve => {
      const done = () => { clearTimeout(timer); v.removeEventListener('seeked', done); resolve() }
      const timer = setTimeout(done, 2000)
      v.addEventListener('seeked', done, { once: true }); v.currentTime = 0
    })
  }
  v.muted = false
  const preview = framePreview(v)
  const onState = () => {
    if (myShare?.video !== v) return
    myShare.paused = v.paused
    if (v.paused) myShare.preview = framePreview(v) || myShare.preview
    actions?.share.send(shareMsg()); renderTile(selfId)
  }
  ;['pause','play','seeked','ratechange','ended'].forEach(event => v.addEventListener(event, onState))
  publish(cap, { kind: 'arquivo', game: false, paused: true, preview, quality: 'auto', titulo: nomeDoArquivo(file.name) }, v, () => { v.pause(); clearInterval(subTimer); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url) })
  toast(`Projetando ${file.name}`)
  offerSessionSubs()
}
// Se a sessão de hoje tem legenda cadastrada (pelo MCP), oferece usar
async function offerSessionSubs() {
  if (!invite?.sessao) return
  const s = await currentSession()
  if (!s?.temLegenda || myShare?.kind !== 'arquivo') return
  nudge('leg:' + s.id, `Usar a legenda cadastrada de "${s.filme}"?`, 'Usar legenda', async () => {
    const r = await api('sessoes?legenda=' + encodeURIComponent(s.id))
    if (r?.legenda) loadSubs(new File([r.legenda], s.id + (/^WEBVTT/.test(r.legenda) ? '.vtt' : '.srt')))
  })
}

// Arquivo que o navegador não toca direito: explica e deixa escolher outro
function fileProblem(file, { video, audio }) {
  const gb = file.size / 1e9
  $('#fileName').textContent = `${file.name} · ${gb >= 1 ? gb.toFixed(1) + ' GB' : Math.round(file.size / 1e6) + ' MB'}`
  $('#fileVideo').className = video ? 'ok' : 'bad'
  $('#fileVideo').querySelector('span').textContent = video ? 'Imagem: ok' : 'Imagem: o navegador não abre (vídeo HEVC/H.265?)'
  $('#fileAudio').className = audio ? 'ok' : 'bad'
  $('#fileAudio').querySelector('span').textContent = audio ? 'Som: ok' : 'Som: o navegador não toca (áudio AC3, DTS ou E-AC3?)'
  $('#fileGo').hidden = !video
  $('#fileModal').hidden = false
  return new Promise(resolve => {
    const done = go => { $('#fileModal').hidden = true; $('#fileGo').onclick = $('#fileOther').onclick = $('#fileCancel').onclick = null; resolve(go) }
    $('#fileGo').onclick = () => done(true)
    $('#fileCancel').onclick = () => done(false)
    $('#fileOther').onclick = () => { done(false); $('#fileInput').click() }
  })
}

/* ---------- Legendas (de quem transmite arquivo; cada um liga/desliga) ---------- */
let subTimer = null
function parseSubs(text) {
  const t = s => { const m = s.trim().match(/(?:(\d+):)?(\d+):(\d+)[,.](\d+)/); return m ? (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : 0 }
  return text.replace(/\r/g, '').split(/\n\n+/).map(b => {
    const lines = b.split('\n'), i = lines.findIndex(l => l.includes('-->'))
    if (i < 0) return null
    const [a, z] = lines[i].split('-->')
    return { s: t(a), e: t(z), text: lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim() }
  }).filter(c => c && c.text)
}
async function loadSubs(file) {
  if (!myShare?.video) return
  const raw = await file.arrayBuffer()
  let text = new TextDecoder('utf-8').decode(raw)
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(raw) // legendas antigas em latin1
  const cues = parseSubs(text)
  if (!cues.length) return toast('Não entendi essa legenda')
  const v = myShare.video
  myShare.subs = true
  actions?.share.send(shareMsg())
  layout()
  let last = null
  clearInterval(subTimer)
  subTimer = setInterval(() => {
    const now = v.currentTime
    const c = cues.find(c => now >= c.s && now <= c.e)
    const txt = c ? c.text : ''
    if (txt !== last) { last = txt; actions?.leg.send({ t: txt }); showSub(selfId, txt) }
  }, 100)
  toast(`Legenda carregada (${cues.length} falas)`)
}
function showSub(id, text) {
  const t = tiles.get(id)
  if (!t) return
  // um pouquinho de atraso para casar com o vídeo, que chega com buffer
  setTimeout(() => { t.sub.textContent = prefs.subs ? text : ''; t.sub.dataset.raw = text }, id === selfId ? 0 : 200)
}
$('#btnSubs').addEventListener('click', () => {
  prefs.subs = !prefs.subs; savePrefs(); renderSubsBtn()
  tiles.forEach(t => { t.sub.textContent = prefs.subs ? t.sub.dataset.raw || '' : '' })
})
function renderSubsBtn() { $('#btnSubs').setAttribute('aria-pressed', String(prefs.subs)) }

/* ---------- Pedir pausa ---------- */
function askPause() {
  if (![...tiles.keys()].some(id => id !== selfId)) return
  actions?.pausa.send(1)
  toast('Você pediu pausa')
}
function gotPause(name) {
  sfx('chat')
  if (myShare?.kind === 'arquivo' && !myShare.video.paused) { myShare.video.pause(); toast(`${name} pediu pausa · pausei o vídeo`, 5000) }
  else if (nfxDe(myShare) && !nfxDe(myShare).paused && prefs.nfxTodos !== false) { nfxCmd('pause'); toast(`${name} pediu pausa · pausei a Netflix`, 5000) }
  else toast(`${name} pediu pausa`, 5000)
  sysMsg(`${name} pediu pausa`)
}
$('#btnPause').addEventListener('click', askPause)

/* ---------- Controle remoto do arquivo (qualquer um pausa/volta/avança) ---------- */
function ctl(id, op, d) {
  actions?.ctl.send({ op, d }, { target: id })
  if (['quality','rate','voto','pular','estrela'].includes(op)) return
  toast(op === 'toggle' ? (shareInfo.get(id)?.paused ? 'Continuando…' : 'Pausando…') : op === 'at' ? `Pulando para ${fmtMt(d)}` : d < 0 ? `Voltando ${-d} s` : `Avançando ${d} s`, 1500)
}
function gotCtl(d, name, peerId) {
  if (d?.op === 'quality' && myShare && ['auto','1080','720','480'].includes(String(d.d))) {
    if (peerId) peerQuality.set(peerId, String(d.d)); else myShare.quality = String(d.d)
    tuneSenders(); if (!peerId) { actions?.share.send(shareMsg()); updatePlayer(selfId) }; return
  }
  const n = nfxDe(myShare)
  if (n && d?.op === 'voto' && d.d && typeof d.d.id === 'string') { votou(myShare, peerId || selfId, +d.d.v, d.d.id); return }
  if (myShare?.voto && d?.op === 'estrela' && d.d && typeof d.d.id === 'string') { deuNota(myShare, peerId || selfId, +d.d.v, d.d.id); return }
  if (n && d?.op === 'pular') {
    if (peerId && prefs.nfxTodos === false) return
    nfxCmd('pular'); sysMsg(`${name} pulou ${n.pular === 'resumo' ? 'o resumo' : 'a abertura'}`); return
  }
  if (n && d && ['toggle', 'at', 'seek'].includes(d.op)) {
    if (peerId && prefs.nfxTodos === false) return
    nfxCmd(d.op, d.d)
    if (d.op === 'toggle') toast(`${name} ${n.paused ? 'deu play' : 'pausou'} na Netflix`)
    else if (d.op === 'at' && Number.isFinite(+d.d)) toast(`${name} pulou para ${fmtMt(+d.d)}`)
    else if (Number.isFinite(+d.d)) toast(`${name} ${d.d < 0 ? 'voltou' : 'avançou'} ${Math.abs(d.d)} s`)
    return
  }
  const v = myShare?.kind === 'arquivo' && myShare.video
  if (!v || !d) return
  if (d.op === 'rate' && [.5,1,1.25,1.5,2].includes(+d.d)) { v.playbackRate = +d.d; return }
  if (d.op === 'toggle') { if (v.paused) v.play().catch(() => {}); else v.pause(); toast(`${name} ${v.paused ? 'pausou' : 'deu play'}`) }
  else if (d.op === 'at' && Number.isFinite(+d.d)) { v.currentTime = Math.max(0, Math.min(v.duration || 1e9, +d.d)); toast(`${name} pulou para ${fmtMt(+d.d)}`) }
  else if (d.op === 'seek' && Number.isFinite(+d.d)) { v.currentTime = Math.max(0, Math.min(v.duration || 1e9, v.currentTime + Math.max(-60, Math.min(60, +d.d)))); toast(`${name} ${d.d < 0 ? 'voltou' : 'avançou'} ${Math.abs(d.d)} s`) }
}

/* ---------- Recarregar a transmissão ---------- */
function reloadStream(auto, only) {
  const ids = only ? [only] : [...tiles.keys()].filter(id => id !== selfId)
  ids.forEach(id => {
    const t = tiles.get(id)
    if (!t) return
    const s = t.video.srcObject
    t.video.srcObject = null; t.video.srcObject = s; t.video.play().catch(() => {})
    actions?.need.send(1, { target: id })
  })
  if (ids.length) toast(auto ? 'A imagem parou: reconectando…' : 'Pedindo a projeção de novo…')
}
$('#btnReload').addEventListener('click', () => reloadStream())

/* ---------- Volumes ---------- */
// volume de cada tela (por pessoa que transmite), ajustado no botão direito
const keyOf = id => id === selfId ? me.key : peers.get(id)?.key
const tileVol = id => personGain(keyOf(id), 'movie')
function applyTileVols() {
  tiles.forEach((t, id) => { if (t.gain) t.gain.gain.value = tileVol(id) })
  if (myShare?.video) myShare.video.volume = Math.min(1, (prefs.master ?? 1) * movieLevel() * tileVol(selfId))
}
function applyPrefs() {
  try { setTeatro(!!prefs.teatro, true); setChatFixo(!!prefs.chatFixo, true) } catch {}
  $('#masterVol').value = prefs.master ?? 1; $('#masterOut').textContent = pct(prefs.master ?? 1)
  $('#vol').value = prefs.vol; $('#volOut').textContent = pct(prefs.vol)
  $('#vvol').value = prefs.vvol; $('#vvolOut').textContent = pct(prefs.vvol)
  $('#sfxVol').value = prefs.sfx; $('#sfxOut').textContent = pct(prefs.sfx)
  applyAudioLevels()
  $('#boardVol').value = prefs.board; $('#boardOut').textContent = pct(prefs.board)
  applyTileVols()
  $('#duckOpt').checked = !!prefs.duck
  $('#nudgeOpt').checked = !!prefs.nudges
  $('#spatialOpt').checked = !!prefs.spatial
  if ($('#audioSpatial')) $('#audioSpatial').checked = !!prefs.spatial
  if (mix.ac) updatePans()
  document.querySelectorAll(`input[name=vmode]`).forEach(r => { r.checked = r.value === prefs.vmode })
  $('#pttKey').textContent = prefs.pttLabel
  $('#pttRow').hidden = prefs.vmode !== 'ptt'
  if (!!theater.classList.contains('no-chat') === !!prefs.chat) setChat(prefs.chat, true)
  renderSubsBtn(); renderMic(); applyPeerVols()

}
for (const [id, k] of [['#masterVol', 'master'], ['#vol', 'vol'], ['#vvol', 'vvol'], ['#sfxVol', 'sfx'], ['#boardVol', 'board']]) {
  $(id).addEventListener('input', e => { prefs[k] = +e.target.value; applyPrefs(); savePrefs() })
  if (k === 'vol' || k === 'vvol' || k === 'master') $(id).addEventListener('dblclick', e => { e.target.value = 1; e.target.dispatchEvent(new Event('input')) })
}
$('#sfxVol').addEventListener('change', () => sfx('chat'))

$('#duckOpt').addEventListener('change', e => { prefs.duck = e.target.checked; updateDucking(); savePrefs() })
$('#nudgeOpt').addEventListener('change', e => { prefs.nudges = e.target.checked; savePrefs() })
$('#spatialOpt').addEventListener('change', e => { prefs.spatial = e.target.checked; prefs.spatialVersion = 3; savePrefs(); updatePans() })

/* ---------- Mesa de som (filme, vozes, efeitos e cada pessoa) ---------- */
function personAudioRow(key, kind) {
  const ch = AUDIO_CHANNELS[kind]
  const range = el('input', { type: 'range', min: 0, max: 2, step: .01, value: personGain(key, kind), ariaLabel: ch.label + ' de ' + person(key).nome })
  range.dataset.channel = kind; range.dataset.person = key
  const out = el('output', { textContent: pct(+range.value) })
  const mute = el('button', { type: 'button', className: 'person-audio__mute', title: 'Mutar ' + ch.label.toLowerCase(), ariaLabel: 'Mutar ' + ch.label.toLowerCase() + ' de ' + person(key).nome }, icon(prefs[ch.muted][key] ? 'volume-x' : ch.icon))
  const refresh = () => { applyPrefs(); savePrefs(); out.textContent = pct(personGain(key, kind)); range.value = personGain(key, kind); setIcon(mute.firstChild, prefs[ch.muted][key] ? 'volume-x' : ch.icon); mute.setAttribute('aria-pressed', String(!!prefs[ch.muted][key])) }
  range.addEventListener('input', () => { prefs[ch.values][key] = +range.value; delete prefs[ch.muted][key]; refresh() })
  range.addEventListener('dblclick', () => { prefs[ch.values][key] = 1; delete prefs[ch.muted][key]; refresh() })
  mute.setAttribute('aria-pressed', String(!!prefs[ch.muted][key]))
  mute.addEventListener('click', () => { prefs[ch.muted][key] = !prefs[ch.muted][key]; refresh() })
  return el('div', { className: 'person-audio__row' }, mute, el('span', { textContent: ch.label }), range, out)
}
function renderPersonAudio(key, box) {
  box.replaceChildren(el('div', { className: 'person-audio__head' }, pfpImg(key, 28), el('b', { textContent: person(key).nome })), ...Object.keys(AUDIO_CHANNELS).map(kind => personAudioRow(key, kind)), '')
}
function renderMixPeople() {
  const list = [...new Map([...peers.values()].filter(p => p.key).map(p => [p.key, p])).values()]
  $('#mixPeopleH').hidden = !list.length
  $('#mixPeople').replaceChildren(...list.map(p => {
    const box = el('details', { className: 'person-audio person-audio--mix' })
    box.append(el('summary', {}, pfpImg(p.key, 24, p.name), el('span', { textContent: p.name })), ...Object.keys(AUDIO_CHANNELS).map(kind => personAudioRow(p.key, kind)))
    return box
  }))
}
$('#btnMixer').addEventListener('click', () => {
  const p = $('#mixer'), open = p.hidden
  closePops(open ? p : null)
  p.hidden = !open
  $('#btnMixer').setAttribute('aria-expanded', String(open))
  if (open) renderMixPeople()
})

/* ---------- Botão direito numa tela: som e opções só dela ---------- */
const ctxEl = el('div', { className: 'pop ctxmenu', hidden: true, role: 'menu' })
theater.append(ctxEl)
function ctxItem(ic, text, fn) {
  const b = el('button', { type: 'button', className: 'ctxmenu__item', role: 'menuitem' }, icon(ic), el('span', { textContent: text }))
  b.addEventListener('click', () => { closePops(); fn() })
  return b
}
function openCtx(id, x, y) {
  if (id == null) return openRoomAudio(x, y)
  const mine = id === selfId
  const key = keyOf(id)
  const info = mine ? myShare : shareInfo.get(id)
  const hasSound = mine ? info?.kind === 'arquivo' : !!tiles.get(id)?.gain
  const items = [el('div', { className: 'ctxmenu__title', textContent: mine ? 'Sua projeção' : `Projeção de ${peers.get(id)?.name || '…'}` })]
  if (hasSound && key) {
    const muted = !!prefs.tmute[key]
    const v = prefs.tvol[key] ?? 1
    const range = el('input', { type: 'range', min: 0, max: 2, step: 0.01, value: muted ? 0 : v })
    range.setAttribute('aria-label', 'Volume desta tela')
    const out = el('output', { textContent: pct(muted ? 0 : v) })
    const mb = el('button', { type: 'button', className: 'ctxmenu__mute', title: muted ? 'Desmutar' : 'Mutar' }, icon(muted ? 'volume-x' : 'volume-2'))
    range.addEventListener('input', () => {
      prefs.tvol[key] = +range.value; delete prefs.tmute[key]
      out.textContent = pct(+range.value); setIcon(mb.firstChild, +range.value ? 'volume-2' : 'volume-x')
      applyTileVols(); savePrefs()
    })
    range.addEventListener('dblclick', () => { range.value = 1; range.dispatchEvent(new Event('input')) })
    mb.addEventListener('click', () => {
      const m = !prefs.tmute[key]
      if (m) prefs.tmute[key] = true; else delete prefs.tmute[key]
      range.value = m ? 0 : prefs.tvol[key] ?? 1; out.textContent = pct(+range.value); setIcon(mb.firstChild, m ? 'volume-x' : 'volume-2')
      applyTileVols(); savePrefs()
    })
    items.push(el('div', { className: 'ctxmenu__vol' }, mb, range, out))
  } else if (!mine) items.push(el('p', { className: 'ctxmenu__note', textContent: 'Essa tela está sem som.' }))
  if (!mine) {
    if (info?.kind === 'arquivo') items.push(ctxItem(info.paused ? 'play' : 'pause', info.paused ? 'Continuar para todos' : 'Pausar para todos', () => ctl(id, 'toggle')))
    else items.push(ctxItem('pause', 'Pedir pausa', askPause))
    items.push(ctxItem('refresh-cw', 'Recarregar esta tela', () => reloadStream(false, id)))
  }
  if (info?.subs) items.push(ctxItem('captions', prefs.subs ? 'Esconder legendas' : 'Mostrar legendas', () => $('#btnSubs').click()))
  const tt = tiles.get(id)
  if (tt) items.push(ctxItem('rectangle-horizontal', tt.cropOn ? 'Mostrar a imagem inteira' : 'Remover bordas pretas', () => setBordas(tt, !tt.cropOn)))
  if (mine && myShare?.kind === 'tela' && !myShare.game) items.push(ctxItem('clapperboard', myShare.midia ? 'Corrigir o que está passando' : 'Dizer o que está passando', nomearProjecao))
  if (tt?.cropOn) items.push(ctxItem('refresh-cw', 'Cortar as bordas de novo', () => { recortaBordas(tt); toast('Medindo as bordas de novo…', 2000) }))
  if (tiles.size > 1) items.push(ctxItem('maximize-2', focusId === id ? 'Ver todas as telas' : 'Deixar esta em destaque', () => { focusId = focusId === id ? null : id; layout() }))
  items.push(duckToggle())
  items.push(ctxItem(document.fullscreenElement ? 'minimize' : 'maximize', document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia', toggleFs))
  if (mine && myShare?.kind === 'tela') items.push(ctxItem('monitor-up', 'Trocar a tela projetada', trocarTela))
  if (mine) items.push(ctxItem('monitor-off', 'Parar de projetar', () => stopShare()))
  ctxEl.replaceChildren(...items)
  closePops(ctxEl)
  ctxEl.hidden = false
  const w = ctxEl.offsetWidth, h = ctxEl.offsetHeight
  ctxEl.style.left = Math.min(x, innerWidth - w - 8) + 'px'
  ctxEl.style.top = Math.min(y, innerHeight - h - 8) + 'px'
}
function positionContext(items, x, y) {
  ctxEl.replaceChildren(...items); closePops(ctxEl); ctxEl.hidden = false
  ctxEl.style.left = Math.max(8, Math.min(x, innerWidth - ctxEl.offsetWidth - 8)) + 'px'
  ctxEl.style.top = Math.max(8, Math.min(y, innerHeight - ctxEl.offsetHeight - 8)) + 'px'
}
function duckToggle() {
  const checkbox = el('input', { type: 'checkbox', checked: !!prefs.duck })
  checkbox.addEventListener('change', () => { prefs.duck = checkbox.checked; $('#duckOpt').checked = prefs.duck; updateDucking(); savePrefs() })
  return el('label', { className: 'check audio-duck', title: 'Baixa o filme enquanto alguém fala e restaura o volume depois' }, checkbox, el('span', {}, el('b', { textContent: 'Baixar durante falas' }), ''))
}
function globalMovieControl() {
  const slider = el('input', { type: 'range', min: 0, max: 2, step: .01, value: prefs.vol, ariaLabel: 'Volume da projeção' })
  const output = el('output', { textContent: pct(prefs.vol) })
  slider.addEventListener('input', () => { prefs.vol = +slider.value; output.textContent = pct(prefs.vol); applyPrefs(); savePrefs() })
  return el('label', { className: 'ctxmenu__vol' }, icon('film'), el('span', { textContent: 'Projeção' }), slider, output)
}
function midiaVolControl() {
  const slider = el('input', { type: 'range', min: 0, max: 1, step: .01, value: prefs.mvol ?? .45, ariaLabel: 'Volume do vídeo' })
  const output = el('output', { textContent: pct(prefs.mvol ?? .45) })
  slider.addEventListener('input', () => { prefs.mvol = +slider.value; output.textContent = pct(prefs.mvol); setMidiaVol(); savePrefs(); const b = midiaEl?.querySelector('.midia__vol'); if (b) { b.value = prefs.mvol; b.nextSibling.textContent = pct(prefs.mvol) } })
  return el('label', { className: 'ctxmenu__vol' }, icon('play'), el('span', { textContent: 'YouTube' }), slider, output)
}
function openRoomAudio(x, y, jogo) {
  positionContext([...(jogo ? [el('div', { className: 'ctxmenu__title', textContent: JOGOS[jogo].nome }), jogoVolControl(), jogoMuteItem()] : []), ...(midia?.kind === 'yt' ? [midiaVolControl()] : []), ...(radio?.ativo() ? [radioVolControl(), radioMuteItem()] : []), globalMovieControl(), duckToggle(), ctxItem('sliders-horizontal', 'Mixer', () => $('#btnMixer').click()), ctxItem('maximize', 'Tela cheia', toggleFs)], x, y)
}
$('#screenInner').addEventListener('contextmenu', e => {
  if (e.target.closest('input, textarea')) return // no campo de texto fica o menu do navegador (colar etc.)
  e.preventDefault()
  // em cima de um jogo: volume do jogo primeiro
  const jogo = Object.keys(JOGOS).find(k => e.target.closest('#' + JOGOS[k].tela + 'Tela'))
  if (jogo) return openRoomAudio(e.clientX, e.clientY, jogo)
  const node = e.target.closest('.tile')
  const id = node && [...tiles].find(([, t]) => t.el === node)?.[0]
  openCtx(id ?? null, e.clientX, e.clientY)
})

/* ---------- Avisos de volume ----------
   Compara o volume do filme com o das vozes enquanto alguém fala, e cada voz com as outras.
   Sugere o ajuste num cartãozinho; nunca muda sozinho. */
const nudgeEl = $('#nudges')
function nudge(id, text, actionText, action, ignorar) {
  if (nudgeEl.querySelector(`[data-id="${id}"]`)) return
  const card = el('div', { className: 'nudge' }, icon('sliders-horizontal'), el('span', { textContent: text }))
  card.dataset.id = id
  const close = () => { card.classList.add('out'); setTimeout(() => card.remove(), 300) }
  const yes = el('button', { type: 'button', className: 'nudge__yes', textContent: actionText })
  const no = el('button', { type: 'button', className: 'nudge__no', textContent: 'Agora não' })
  let feito = false
  yes.addEventListener('click', () => { feito = true; action(); close() })
  no.addEventListener('click', () => { feito = true; snooze.set(id, Date.now() + 30 * 60e3); ignorar?.(); close() })
  card.append(yes, no)
  nudgeEl.append(card)
  setTimeout(() => { if (!feito) ignorar?.(); close() }, 20000)
}
const snooze = new Map() // aviso -> não repetir antes de (ms)
const voiceDb = new Map() // peerId -> níveis (dB) enquanto a pessoa fala
let movieLoud = []
const dbOf = an => {
  const buf = new Float32Array(an.fftSize)
  an.getFloatTimeDomainData(buf)
  let s = 0
  for (const v of buf) s += v * v
  return 20 * Math.log10(Math.max(Math.sqrt(s / buf.length), 1e-6))
}
const median = a => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1] }
setInterval(() => {
  if (!prefs.nudges || !mix.ac || mix.ac.state !== 'running') return
  const now = Date.now()
  const movie = tiles.size && prefs.vol > 0 ? dbOf(mix.movieAn) : -120
  const voiceGain = 20 * Math.log10(Math.max(prefs.vvol, 1e-3))
  for (const [id, p] of peers) {
    const an = mix.peer.get(id)?.an
    if (!an || !p.speaking) continue
    const d = dbOf(an)
    if (d < -65) continue
    const arr = voiceDb.get(id) || []
    arr.push(d); if (arr.length > 300) arr.shift()
    voiceDb.set(id, arr)
    // filme x voz: o filme está bem mais alto do que quem fala agora?
    if (movie > -60) { movieLoud.push(movie - (d + voiceGain) > 8); if (movieLoud.length > 60) movieLoud.shift() }
  }
  if (movieLoud.length >= 40 && movieLoud.filter(Boolean).length / movieLoud.length > .7 && (snooze.get('movie') || 0) < now) {
    movieLoud = []
    snooze.set('movie', now + 5 * 60e3)
    nudge('movie', 'O filme está abafando a conversa. Baixar o filme um pouco?', 'Baixar filme', () => { prefs.vol = Math.max(.1, +(prefs.vol * .7).toFixed(2)); applyPrefs(); savePrefs(); toast(`Filme em ${pct(prefs.vol)}`) })
  }
  // cada voz x as outras: alguém fala bem mais baixo que o resto?
  const meds = [...voiceDb].filter(([id, a]) => a.length >= 50 && peers.has(id)).map(([id, a]) => [id, median(a)])
  if (meds.length < 2) return
  for (const [id, m] of meds) {
    const others = median(meds.filter(([x]) => x !== id).map(([, v]) => v))
    const p = peers.get(id), sid = 'voz:' + p?.key
    if (!p?.key || others - m < 7 || (snooze.get(sid) || 0) > now) continue
    snooze.set(sid, now + 10 * 60e3)
    const want = Math.min(2, (prefs.pvol[p.key] ?? 1) * 10 ** ((others - m - 2) / 20))
    nudge(sid, `${p.name} está falando mais baixo que o resto. Aumentar?`, `Aumentar para ${pct(want)}`, () => { prefs.pvol[p.key] = +want.toFixed(2); voiceDb.delete(id); applyPeerVols(); applyPrefs(); savePrefs() })
    break
  }
}, 250)

/* ---------- Qualidade e estabilidade ---------- */
async function tuneSenders() {
  const voiceTrack = mic?.stream.getAudioTracks()[0]
  const mine = [...(myShare?.stream.getTracks() || []), ...(voiceTrack ? [voiceTrack] : [])]
  if (!mine.length) return
  const game = !!myShare?.game
  for (const [peerId, pc] of pcsOf()) for (const s of pc.getSenders()) {
    if (!s.track || !mine.includes(s.track)) continue
    const p = s.getParameters()
    if (!p.encodings?.length) continue
    const video = s.track.kind === 'video'
    const quality = peerQuality.get(peerId) || myShare?.quality || 'auto'
    const height = s.track.getSettings().height || myShare?.video?.videoHeight || 1080
    const scale = video && quality !== 'auto' ? Math.max(1, height / +quality) : 1
    const want = video ? ({'480': 1400000, '720': 3500000, '1080': 6000000}[quality] || (game ? 8000000 : 6000000)) : s.track === voiceTrack ? 64000 : 192000
    const fps = game ? 60 : 30
    if (p.encodings[0].maxBitrate === want && (!video || p.encodings[0].maxFramerate === fps && p.encodings[0].scaleResolutionDownBy === scale)) continue
    Object.assign(p.encodings[0], { maxBitrate: want, priority: 'high', networkPriority: 'high' }, video ? { maxFramerate: fps, scaleResolutionDownBy: scale } : {})
    if (video) p.degradationPreference = game ? 'maintain-framerate' : 'balanced'
    try { await s.setParameters(p) } catch {
      delete p.degradationPreference
      try { await s.setParameters(p) } catch {}
    }
  }
}
const voiceTrackIds = () => new Set([...voices.values()].flatMap(a => a.srcObject?.getTracks().map(t => t.id) || []))
// Quem assiste: filme ganha um pouco de buffer (mais liso); jogo e voz, o mínimo de atraso
function tuneReceivers() {
  const vids = voiceTrackIds()
  for (const [id, pc] of pcsOf()) for (const r of pc.getReceivers()) {
    if (!('jitterBufferTarget' in r) || !r.track || vids.has(r.track.id)) continue
    const want = shareInfo.get(id)?.game ? 0 : 150
    if (r.jitterBufferTarget !== want) try { r.jitterBufferTarget = want } catch {}
  }
}
const lastBytes = new Map(), stalled = new Map()
let lastAutoReload = 0
/* Qualidade automática (quem assiste decide a sua): perda de pacotes, travadas ou fps baixo por ~6 s
   → pede a quem projeta uma resolução menor só para si (1080 → 720 → 480). Rede boa por 30 s → sobe um degrau.
   Só no "Automática"; escolher uma qualidade à mão desliga. */
const AQ = ['auto', '720', '480']
function qualidadeAuto(id, t, info) {
  const info2 = shareInfo.get(id)
  if (!t.player || t.player.quality.value !== 'auto' || info2?.paused) { t.aqAnt = info; return }
  const a = t.aqAnt; t.aqAnt = info
  if (!a) return
  const dRecv = info.recv - a.recv, dLost = Math.max(0, info.lost - a.lost), perda = dRecv + dLost ? dLost / (dRecv + dLost) : 0
  const ruim = perda > .04 || info.freeze > a.freeze || (dRecv > 0 && (info.fps || 0) < (info2?.game ? 30 : 15))
  const bom = perda < .01 && info.freeze === a.freeze && (info.fps || 0) >= (info2?.game ? 50 : 24)
  t.aqRuim = ruim ? (t.aqRuim || 0) + 1 : 0
  t.aqBom = bom ? (t.aqBom || 0) + 1 : 0
  t.aqNivel ||= 0
  let novo = t.aqNivel
  if (t.aqRuim >= 3 && t.aqNivel < AQ.length - 1) novo++
  else if (t.aqBom >= 15 && t.aqNivel > 0) novo--
  if (novo === t.aqNivel) return
  t.aqNivel = novo; t.aqRuim = t.aqBom = 0
  actions?.ctl.send({ op: 'quality', d: AQ[novo] }, { target: id })
  if (novo > 0) toast(`Sua rede oscilou: recebendo em ${AQ[novo]}p por enquanto`, 3500)
}
async function checkStreams() {
  if (!room) return
  tuneReceivers(); tuneSenders()
  const pcs = pcsOf(), vids = voiceTrackIds()
  for (const id of tiles.keys()) {
    const t = tiles.get(id)
    let info = null, bytes = 0, have = false
    const list = id === selfId ? [...pcs.values()].slice(0, 1) : [pcs.get(id)].filter(Boolean)
    for (const pc of list) {
      const stats = await pc.getStats().catch(() => null)
      stats?.forEach(s => {
        if (id === selfId && s.type === 'outbound-rtp' && s.kind === 'video' && myShare?.stream.getVideoTracks().length) {
          have = true; bytes += s.bytesSent
          info ||= { h: s.frameHeight, fps: s.framesPerSecond, lim: s.qualityLimitationReason }
        }
        if (id !== selfId && s.type === 'inbound-rtp' && !(s.kind === 'audio' && vids.has(s.trackIdentifier))) {
          have = true; bytes += s.bytesReceived
          if (s.kind === 'video') info = { h: s.frameHeight, fps: s.framesPerSecond, lost: s.packetsLost || 0, recv: s.packetsReceived || 0, freeze: s.freezeCount || 0 }
        }
      })
    }
    const prev = lastBytes.get(id)
    lastBytes.set(id, bytes)
    const mbps = prev != null ? Math.max(0, (bytes - prev) * 8 / 2 / 1e6) : 0
    t.q = have && info?.h ? `${info.h}p · ${Math.round(info.fps || 0)} fps · ${mbps.toFixed(1).replace('.', ',')} Mbps${info.lim === 'bandwidth' ? ' · rede limitando' : info.lim === 'cpu' ? ' · CPU limitando' : ''}` : ''
    if (id !== selfId && info) qualidadeAuto(id, t, info)
    if (t.aqNivel) t.q += ` · automático ${AQ[t.aqNivel]}p`
    renderTile(id)
    // nada chegou por ~8 s (e não está pausado) → pede a transmissão de novo
    if (id !== selfId && prev != null && !shareInfo.get(id)?.paused) {
      const st = bytes === prev ? (stalled.get(id) || 0) + 2 : 0
      stalled.set(id, st)
      if (st >= 8 && Date.now() - lastAutoReload > 20000) { lastAutoReload = Date.now(); stalled.set(id, 0); reloadStream(true, id) }
    }
  }
}
setInterval(() => checkStreams().catch(() => {}), 2000)

/* ---------- Fileiras (só quem está online; lugares vêm da arrumação da sala) ---------- */
const seatsEl = $('#seats')
const POSES = ['base', 'palmas1', 'palmas2', 'celular', 'colo', 'dormindo', 'pipoca']
const seatNodes = new Map()
function seatNode(key) {
  if (seatNodes.has(key)) return seatNodes.get(key)
  const p = person(key)
  const art = p.boneco ? el('img', { src: p.boneco, alt: '' }) : pfpImg(key, 64)
  const name = el('span', { className: 'seat__name' }, el('span', { className: 'seat__nm', textContent: p.nome }), icon('mic-off'), icon('headphone-off'))
  name.children[1].classList.add('seat__muted')
  name.children[2].classList.add('seat__deaf')
  const zzz = el('span', { className: 'seat__zzz', 'aria-hidden': 'true' }, el('i', { textContent: 'z' }), el('i', { textContent: 'z' }), el('i', { textContent: 'Z' }))
  const node = el('div', { className: 'seat' + (p.boneco ? '' : ' seat--pfp') + (p.guest ? ' seat--guest' : '') }, el('div', { className: 'seat__avatar' }, art), zzz, name)
  node.dataset.key = key
  if (p.poses && p.boneco) {
    node._poses = p.poses
    node.classList.add('has-poses')
    POSES.forEach(n => { new Image().src = p.poses + n + '.webp' }) // pré-carrega para trocar sem piscar
  }
  const adm = el('div', { className: 'pvol__adm' })
  const volBox = el('div', { className: 'person-audio' })
  // na própria poltrona: trocar de lugar
  const left = el('button', { type: 'button', className: 'btn btn--ghost', title: 'Um lugar para a esquerda' }, icon('chevron-left'))
  const right = el('button', { type: 'button', className: 'btn btn--ghost', title: 'Um lugar para a direita' }, icon('chevron-right'))
  left.addEventListener('click', () => moveStep(-1))
  right.addEventListener('click', () => moveStep(1))
  const moveBox = el('div', { className: 'pvol__move' }, el('span', { className: 'pvol__name', textContent: 'Trocar de lugar' }), el('div', { className: 'pvol__row' }, left, el('small', { textContent: 'ou clique numa poltrona vazia' }), right))
  const account = el('button', { type: 'button', className: 'btn btn--ghost pvol__account' }, icon('users'), el('span', { textContent: 'Minha conta' }))
  account.addEventListener('click', () => { closePops(); openAccount() })
  const pop = el('div', { className: 'pvol', hidden: true }, account, volBox, moveBox, adm)
  node.append(pop)
  node.querySelector('.seat__avatar').addEventListener('click', () => {
    if (!node.classList.contains('online')) return
    const mine = node.classList.contains('mine')
    const open = pop.hidden
    closePops()
    if (!open) return
    account.hidden = !mine; volBox.hidden = mine; moveBox.hidden = !mine
    if (!mine) { renderPersonAudio(key, volBox); renderAdmButtons(key, adm) }
    pop.style.marginLeft = '0px'; pop.style.top = ''; pop.style.bottom = ''
    pop.hidden = false
    let rect = pop.getBoundingClientRect()
    if (rect.bottom > innerHeight - 8) { pop.style.top = 'auto'; pop.style.bottom = 'calc(100% + 8px)'; rect = pop.getBoundingClientRect() }
    if (rect.left < 8) pop.style.marginLeft = (8 - rect.left) + 'px'
    else if (rect.right > innerWidth - 8) pop.style.marginLeft = (innerWidth - 8 - rect.right) + 'px'
  })
  node.addEventListener('contextmenu', e => { if (e.target.closest('.pvol')) return; e.preventDefault(); node.querySelector('.seat__avatar').click() })
  seatNodes.set(key, node)
  return node
}
PEOPLE.forEach(p => { if (!p.ausente) seatNode(p.id) })

// Arrumação: lista de poltronas ('' livre, 'guest' para convidados, ou o id de quem tem lugar reservado)
const defaultLayout = () => coreDefaultLayout(PEOPLE)
let salaLayout = defaultLayout()
const cleanLayout = l => coreCleanLayout(l, PEOPLE)
// Todo mundo calcula a mesma planta (public/core/plateia.js)
const seatPlan = people => coreSeatPlan(salaLayout, people)
let plan = { slots: [], taken: new Map(), placed: new Map() }
const emptyEls = []
function emptySeat(i, owner) {
  const e = emptyEls[i] || (emptyEls[i] = el('div', { className: 'seat-empty' }, el('img', { src: CFG.poltronaVazia || 'assets/poltrona-vazia.png', alt: '' }), el('span', { className: 'seat-empty__tag' })))
  e.dataset.slot = i
  const who = owner === 'guest' ? 'Convidados' : owner ? person(owner).nome : ''
  e.title = who ? `Reservada · ${who}` : 'Livre · clique para sentar aqui'
  e.querySelector('.seat-empty__tag').textContent = who
  e.classList.toggle('reserved', !!owner && owner !== me.key && !(owner === 'guest' && me.key.startsWith('g:')))
  return e
}
seatsEl.addEventListener('click', e => { const s = e.target.closest('.seat-empty'); if (s) moveTo(+s.dataset.slot) })
function moveTo(i) {
  if (!me.key) return
  const owner = plan.slots[i]
  if (plan.taken.has(i) && plan.taken.get(i) !== me.key) return toast('Esse lugar já está ocupado')
  if (!canSitIn(plan.slots, new Map([...plan.taken].filter(([, k]) => k !== me.key)), i, me.key)) return toast(owner === 'guest' ? 'Esse lugar é dos convidados' : `Esse lugar é de ${person(owner).nome}`)
  me.seat = i
  store.set('seat', i)
  sendHello(); renderSeats(); closePops()
}
function moveStep(d) {
  const cur = plan.placed.get(me.key) ?? 0
  const others = new Map([...plan.taken].filter(([, k]) => k !== me.key))
  for (let i = cur + d; i >= 0 && i < plan.slots.length; i += d) if (canSitIn(plan.slots, others, i, me.key)) return moveTo(i)
  toast('Não tem lugar livre para esse lado')
}
const lineEls = []
const sameKids = (p, kids) => p.children.length === kids.length && kids.every((k, i) => p.children[i] === k)
// quem fala acende na lateral (sem redesenhar a lista toda)
function falaLateral() {
  lateral.querySelectorAll('.lat-gente li[data-key]').forEach(li => li.classList.toggle('fala', !!estadoDe(li.dataset.key).speaking))
  lateral.querySelector('.lat-eu .lat-rosto')?.classList.toggle('fala', !!me.speaking)
}
function renderSeats() {
  try { falaLateral() } catch {}
  const people = [{ ...me, id: selfId }, ...[...peers].map(([id, p]) => ({ ...p, id })), ...[...srvPres].map(([key, name]) => ({ key, name, id: 'srv:' + key, ghost: true })), ...[...sumindo].filter(([key]) => !srvPres.has(key) && ![...peers.values()].some(p => p.key === key)).map(([key, s]) => ({ key, name: s.name, seat: s.seat, id: 'volta:' + key, ghost: true, volta: true }))].filter(x => x.key)
  // convidados entram e saem da fileira
  const guests = new Set(people.filter(x => !PEOPLE.some(p => p.id === x.key)).map(x => x.key))
  seatNodes.forEach((n, k) => { if (!PEOPLE.some(p => p.id === k) && !guests.has(k) && !n.classList.contains('leaving')) { n.remove(); seatNodes.delete(k) } })
  guests.forEach(k => seatNode(k))
  seatNodes.forEach((node, key) => {
    const here = people.filter(x => x.key === key)
    const was = node.classList.contains('online')
    // animação de sentar (entrou) e levantar (saiu)
    if (!was && here.length) { node.classList.remove('leaving'); node.classList.add('arriving'); setTimeout(() => node.classList.remove('arriving'), 700) }
    if (was && !here.length && node.isConnected) { node.classList.add('leaving'); setTimeout(() => { node.classList.remove('leaving'); renderSeats() }, 600) }
    node.classList.toggle('online', here.length > 0)
    node.classList.toggle('mine', here.some(x => x.id === selfId))
    node.classList.toggle('speaking', here.some(x => x.speaking))
    node.classList.toggle('muted', here.length > 0 && here.every(x => x.muted))
    node.classList.toggle('deaf', here.length > 0 && here.every(x => x.deaf))
    node.classList.toggle('away', here.length > 0 && here.every(x => x.away) && !here.some(x => x.speaking))
    node.classList.toggle('sharing', here.some(x => tiles.has(x.id)))
    node.classList.toggle('ghost', here.length > 0 && here.every(x => x.ghost))
    // balãozinho de estado: projetando ou assistindo (mudo, som cortado e ausente já têm ícone no nome e o zzz)
    // 🍿 só para quem não tem boneco com poses (os outros comem pipoca de verdade, no sprite)
    const est = !here.length || node.classList.contains('away') ? '' : here.some(x => tiles.has(x.id)) ? '📽️' : !node._poses && tiles.size && !node.classList.contains('speaking') ? '🍿' : ''
    if (node.dataset.estado !== est) {
      node.dataset.estado = est
      let b = node.querySelector('.seat__estado')
      if (!est) b?.remove()
      else { if (!b) { b = el('span', { className: 'seat__estado' }); node.append(b) } b.textContent = est; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop') }
    }
    const volta = here.length > 0 && here.every(x => x.volta)
    if (volta && !node.querySelector('.seat__volta')) node.append(el('div', { className: 'seat__volta' }, el('i'), el('i'), el('i')))
    else if (!volta) node.querySelector('.seat__volta')?.remove()
    const nm = here[0]?.name || person(key).nome
    node.querySelector('.seat__nm').textContent = nm
    node._st = { away: node.classList.contains('away'), typing: here.some(x => x.typing), hidden: here.length > 0 && here.every(x => x.hidden),
      // alguém está projetando e a pessoa só assiste: o boneco come pipoca
      assistindo: here.length > 0 && tiles.size > 0 && !here.some(x => tiles.has(x.id)) && !node.classList.contains('speaking') }
    // mesas paralelas: o selo do jogo em que a pessoa está (só quando há mais de uma mesa)
    const mesa = here.find(x => x.id === selfId) ? foco : here[0]?.mesa || ''
    let selo = node.querySelector('.seat__mesa')
    if (mesasNaSala() > 1 && mesa && JOGOS[mesa]) {
      if (!selo) { selo = el('span', { className: 'seat__mesa' }); node.append(selo) }
      if (selo.dataset.mesa !== mesa) { selo.dataset.mesa = mesa; selo.replaceChildren(iconeMesa(mesa) ? el('img', { src: iconeMesa(mesa), alt: '' }) : el('span', { className: 'mesas__ic', innerHTML: ICONES_JOGO[mesa] || '' }), el('b', { textContent: JOGOS[mesa].nome })) }
      selo.classList.toggle('outra', mesa !== foco)
    } else selo?.remove()
    applyPose(node)
    node.title = !here.length ? `${nm} · fora` : here.every(x => x.volta) ? `${nm} · reconectando…` : node.classList.contains('ghost') ? `${nm} · sem conexão direta (só chat)` : here.some(x => tiles.has(x.id)) ? `${nm} · projetando` : node.classList.contains('away') ? `${nm} · ausente` : node.classList.contains('deaf') ? `${nm} · som cortado` : nm
  })
  // planta da sala
  const uniq = new Map()
  people.forEach(x => { if (!uniq.has(x.key)) uniq.set(x.key, { key: x.key, seat: x.id === selfId ? me.seat : x.seat }) })
  plan = seatPlan([...uniq.values()])
  const cells = []
  plan.placed.forEach((i, key) => { const n = seatNodes.get(key); if (n) { n.dataset.slot = i; cells[i] = n } })
  seatNodes.forEach(n => { if (n.classList.contains('leaving') && n.dataset.slot && !cells[+n.dataset.slot]) cells[+n.dataset.slot] = n })
  const list = []
  for (let i = 0; i < plan.slots.length; i++) {
    if (cells[i]) list.push(cells[i])
    else if (salaLayout.vazias) list.push(emptySeat(i, plan.slots[i]))
  }
  // fileiras: a primeira é a da frente (mais perto da tela), desenhada em cima e um pouco menor
  const per = salaLayout.porFileira
  const lines = []
  for (let i = 0; i < list.length; i += per) lines.push(list.slice(i, i + per))
  const lineNodes = lines.map((l, r) => {
    const d = lineEls[r] || (lineEls[r] = el('div', { className: 'row__line' }))
    d.style.setProperty('--n', l.length)
    d.style.setProperty('--depth', lines.length - 1 - r)
    if (!sameKids(d, l)) d.replaceChildren(...l)
    return d
  })
  if (!sameKids(seatsEl, lineNodes)) seatsEl.replaceChildren(...lineNodes)
  updatePans()
}

/* ---------- Poses dos bonecos (assets em assets/poses/<pessoa>/) ----------
   dormindo (ausente) > palmas/pipoca (reação, por alguns segundos) > celular (digitando) > celular no colo (aba escondida) > normal */
const tempPose = new Map() // key -> { name, until }
function setPose(key, name, ms) {
  const node = seatNodes.get(key)
  if (!node?._poses) return
  tempPose.set(key, { name, until: Date.now() + ms })
  clearInterval(node._poseTimer)
  node._poseTimer = setInterval(() => { applyPose(node); if (!tempPose.has(key)) clearInterval(node._poseTimer) }, 110)
  applyPose(node)
}
function applyPose(node) {
  if (!node._poses) return
  const key = node.dataset.key, st = node._st || {}
  let t = tempPose.get(key)
  if (t && t.until < Date.now()) { tempPose.delete(key); t = null }
  const name = st.away ? 'dormindo'
    : t ? (t.name === 'palmas' ? (Math.floor(Date.now() / 220) % 2 ? 'palmas2' : 'palmas1') : t.name)
    : st.typing ? 'celular' : st.hidden ? 'colo' : st.assistindo ? 'pipoca' : 'base'
  const img = node.querySelector('.seat__avatar img')
  const src = node._poses + name + '.webp'
  if (img && img.getAttribute('src') !== src) img.setAttribute('src', src)
}

/* ---------- Voz pelo lugar: quem senta à sua esquerda soa mais à esquerda ---------- */
function updatePans() {
  if (!mix.ac) return
  const mine = plan.placed.get(me.key)
  mix.peer.forEach(({ spatialGraph }, id) => {
    if (!spatialGraph) return
    const { pan, direct, spatial } = spatialGraph
    const pos = spatialPosition(mine, plan.placed.get(peers.get(id)?.key), salaLayout.porFileira)
    const now = mix.ac.currentTime
    direct.gain.setTargetAtTime(prefs.spatial ? .3 : 1, now, .1)
    spatial.gain.setTargetAtTime(prefs.spatial ? .7 : 0, now, .1)
    pan.positionX.setTargetAtTime(pos.x, now, .15)
    pan.positionY.setTargetAtTime(0, now, .15)
    pan.positionZ.setTargetAtTime(pos.z, now, .15)
  })
}
addEventListener('resize', () => updatePans())

/* ---------- Arrumar a sala (admin) ---------- */
async function loadLayout() {
  const r = await api('sala?r=' + roomId)
  if (r?.layout) { salaLayout = cleanLayout(r.layout); renderSeats() }
}
function layoutForm() {
  const per = +$('#salaPer').value || 8
  const total = Math.max(1, Math.min(60, +$('#salaTotal').value || 1))
  const cur = [...$('#salaGrid').querySelectorAll('select')].map(s => s.value)
  const opts = [['', 'Livre'], ['guest', 'Convidados'], ...PEOPLE.filter(p => !p.ausente).map(p => [p.id, p.nome])]
  const sels = Array.from({ length: total }, (_, i) => {
    const s = el('select', { 'aria-label': `Poltrona ${i + 1}` }, ...opts.map(([v, t]) => el('option', { value: v, textContent: t })))
    s.value = cur[i] ?? ''
    s.addEventListener('change', () => { if (s.value && s.value !== 'guest') $('#salaGrid').querySelectorAll('select').forEach(o => { if (o !== s && o.value === s.value) o.value = '' }) })
    return s
  })
  const rows = []
  for (let i = 0; i < sels.length; i += per) rows.push(el('div', { className: 'salagrid__row' }, el('span', { textContent: `Fileira ${rows.length + 1}${rows.length ? '' : ' · frente'}` }), el('div', { className: 'salagrid__seats' }, ...sels.slice(i, i + per))))
  $('#salaGrid').replaceChildren(...rows)
}
$('#admSala').addEventListener('click', () => {
  closePops()
  $('#salaPer').value = salaLayout.porFileira
  $('#salaTotal').value = salaLayout.poltronas.length
  $('#salaVazias').checked = salaLayout.vazias
  $('#salaGrid').replaceChildren()
  layoutForm()
  $('#salaGrid').querySelectorAll('select').forEach((s, i) => { s.value = salaLayout.poltronas[i] ?? '' })
  $('#salaModal').hidden = false
})
;['#salaPer', '#salaTotal'].forEach(id => $(id).addEventListener('input', layoutForm))
$('#salaClose').addEventListener('click', () => { $('#salaModal').hidden = true })
$('#salaForm').addEventListener('submit', async e => {
  e.preventDefault()
  const layout = cleanLayout({ porFileira: +$('#salaPer').value, vazias: $('#salaVazias').checked, poltronas: [...$('#salaGrid').querySelectorAll('select')].map(s => s.value) })
  salaLayout = layout
  renderSeats()
  admSend('sala', { layout })
  $('#salaModal').hidden = true
  const r = await api('sala', { method: 'PUT', body: { r: roomId, tok: admTok, layout } })
  toast(r?.ok ? 'Sala arrumada' : 'Arrumei aqui, mas não deu para salvar no servidor')
})

function renderNet() {
  const n = new Set([me.key, ...[...peers.values()].map(p => p.key), ...srvPres.keys()].filter(Boolean)).size || 1
  const st = $('#netStatus')
  st.querySelector('b').textContent = n === 1 ? 'Só você na sala' : `${n} na sala`
  st.classList.toggle('ok', n > 1)
  // rostos de quem está (até 5) no lugar da bolinha
  const keys = [...new Set([me.key, ...[...peers.values()].map(p => p.key), ...srvPres.keys()].filter(Boolean))]
  let rostos = st.querySelector('.status__rostos')
  if (!rostos) { rostos = el('span', { className: 'status__rostos' }); st.prepend(rostos) }
  const k = keys.slice(0, 5).join(',')
  if (rostos.dataset.k !== k) { rostos.dataset.k = k; rostos.replaceChildren(...keys.slice(0, 5).map(x => pfpImg(x, 22))) }
  st.title = keys.map(x => person(x).nome).join(', ')
}
function renderAll() { renderSeats(); renderNet(); try { renderCallbar() } catch {}; renderLateral() }

/* ---------- Faixa da call: tempo de call, tempo online e conexão de cada um ---------- */
const durTxt = ms => { const m = Math.max(0, Math.floor(ms / 60000)); return m < 1 ? 'agora' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` }
let ultimoEst = null
function qualidadeDe(key) {
  const ids = [...peers].filter(([, p]) => p.key === key).map(([id]) => id)
  if (!ids.length) return srvPres.has(key) ? { c: 'ruim', t: 'Sem conexão direta: chat funciona, voz e tela não' } : { c: 'ruim', t: 'Sem conexão' }
  const d = ultimoEst?.peers?.[key]
  const q = (quedas.get(key) || []).filter(t => Date.now() - t < 10 * 60e3).length
  const partes = [d?.via === 'ponte' ? 'pela ponte' : d?.via === 'direto' ? 'direto' : 'conectando', d?.rtt != null ? `${d.rtt} ms` : '', d?.ain != null ? (d.ain > 1 ? `áudio chegando (${d.ain} kbps)` : 'áudio não está chegando') : '', q ? `caiu ${q}× em 10 min` : '']
  const c = q >= 3 || (d?.rtt > 400) ? 'ruim' : d?.via === 'ponte' || q || d?.rtt > 200 ? 'media' : 'boa'
  return { c, t: partes.filter(Boolean).join(' · ') }
}
function renderCallbar() {
  const bar = $('#callbar')
  if (!bar || !room) return
  bar.hidden = true
  sessTempo()
  return
  const keys = [...new Set([me.key, ...[...peers.values()].map(p => p.key), ...srvPres.keys()].filter(Boolean))]
  bar.hidden = false
  const ini = callIni || entrouEm
  const chips = keys.map(key => {
    const q = key === me.key ? { c: 'eu', t: 'Você' } : qualidadeDe(key)
    const desde = desdeSrv.get(key) || (key === me.key ? entrouEm : 0)
    const tempo = el('span', { className: 'callbar__t' }); tempo.dataset.desde = desde || ''
    const chip = el('span', { className: `callbar__p callbar__p--${q.c}`, title: `${person(key).nome}: ${q.t}${desde ? ` · online há ${durTxt(Date.now() - desde)}` : ''}` },
      el('i', { className: 'callbar__dot' }), pfpImg(key, 20), el('b', { textContent: key === me.key ? 'Você' : person(key).nome }), tempo)
    return chip
  })
  const total = el('span', { className: 'callbar__total' }, icon('clock'), el('span', { textContent: 'Na call há ' }), el('b', { className: 'callbar__t' }))
  total.querySelector('b').dataset.desde = ini
  bar.replaceChildren(total, el('span', { className: 'callbar__sep' }), ...chips)
  tickCallbar()
}
// tempo da sessão, embaixo do título (quem está na call fica no hover)
function sessTempo() {
  const t = $('#sessTempo')
  if (!t) return
  const ini = callIni || entrouEm
  t.hidden = !room
  const d = durTxt(Date.now() - ini)
  t.querySelector('b').textContent = d === 'agora' ? 'começou agora' : `há ${d}`
  const keys = [...new Set([me.key, ...[...peers.values()].map(p => p.key), ...srvPres.keys()].filter(Boolean))]
  t.title = `Sessão começou às ${new Date(ini).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\nNa call: ${keys.map(k => k === me.key ? 'você' : person(k).nome).join(', ')}`
}
setInterval(sessTempo, 20000)
function tickCallbar() { document.querySelectorAll('#callbar .callbar__t').forEach(x => { const d = +x.dataset.desde; x.textContent = d ? durTxt(Date.now() - d) : '' }) }
setInterval(tickCallbar, 20000)

/* ---------- Admin: diagnóstico da sala (quem ouve quem, eventos, reconectar) ---------- */
let diagTimer = 0
const diagEl = el('div', { className: 'diagm', hidden: true, role: 'dialog', ariaLabel: 'Diagnóstico da conexão' })
document.body.append(diagEl)
function abrirDiag() {
  diagEl.hidden = false
  diagEl.replaceChildren(el('div', { className: 'diagm__box' }, el('p', { className: 'diagm__vazio', textContent: 'Carregando…' })))
  carregaDiag(); clearInterval(diagTimer); diagTimer = setInterval(carregaDiag, 5000)
}
function fechaDiag() { diagEl.hidden = true; clearInterval(diagTimer) }
diagEl.addEventListener('click', e => { if (e.target === diagEl) fechaDiag() })
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !diagEl.hidden) fechaDiag() })
async function pedirReset(key) {
  const r = await api('sala', { method: 'POST', body: { op: 'cmd', r: roomId, pw: roomPw, tok: admTok, cmd: 'reset', key, por: me.name, quem: me.key, nomeAlvo: key === '*' ? 'todo mundo' : person(key).nome } })
  actions?.adm.send({ tok: admTok, op: 'reset', key })
  toast(r?.ok ? (key === '*' ? 'Pedido enviado para todos (até 15 s)' : `Pedido enviado para ${person(key).nome} (até 15 s)`) : 'Não consegui enviar o pedido', 2600)
  if (key === '*') setTimeout(() => recarregar('admin'), 1500)
}
async function carregaDiag() {
  if (diagEl.hidden) return
  const r = await api('sala', { method: 'POST', body: { op: 'diag-sala', r: roomId, pw: roomPw, tok: admTok } })
  if (!r?.pres) return
  const pres = r.pres.sort((a, b) => a.key.localeCompare(b.key))
  const nome = k => person(k).nome
  const fechar = el('button', { type: 'button', className: 'diagm__x', title: 'Fechar' }, icon('x'))
  fechar.addEventListener('click', fechaDiag)
  const todos = el('button', { type: 'button', className: 'btn btn--ghost diagm__todos' }, icon('refresh-cw'), el('span', { textContent: 'Reconectar todos' }))
  todos.addEventListener('click', () => pedirReset('*'))
  const head = el('div', { className: 'diagm__head' }, el('div', {}, el('h2', { textContent: 'Diagnóstico da conexão' }), el('p', { textContent: `${pres.length} na sala${r.callIni ? ` · call há ${durTxt(Date.now() - r.callIni)}` : ''} · atualiza a cada 5 s` })), todos, fechar)
  // quem ouve quem: linha = quem recebe, coluna = quem fala
  const celula = (rx, tx) => {
    if (rx.key === tx.key) return el('td', { className: 'diagm__eu', textContent: '—' })
    const d = rx.est?.peers?.[tx.key], micTx = tx.est?.mic
    let c = 'ruim', t = 'sem conexão'
    if (!rx.est) { c = 'cinza'; t = 'sem dados (versão antiga?)' }
    else if (d && d.st === 'connected') {
      if (micTx === 'sem' || micTx === 'mudo') { c = 'cinza'; t = micTx === 'sem' ? 'mic desligado' : 'mutado' }
      else if (d.ain == null) { c = 'cinza'; t = 'medindo…' }
      else if (d.ain > 1) { c = 'boa'; t = `ouvindo · ${d.ain} kbps` }
      else { c = 'media'; t = 'conectado, mas o áudio não chega' }
    } else if (d) t = d.st || 'conectando'
    const det = d ? [d.via, d.rtt != null ? d.rtt + ' ms' : '', d.perda ? `perda ${d.perda}%` : '', d.quedas ? `caiu ${d.quedas}× em 10 min` : '', d.vin ? `vídeo ${d.vin} kbps` : ''].filter(Boolean).join(' · ') : ''
    return el('td', { className: `diagm__c diagm__c--${c}`, title: `${nome(rx.key)} ouvindo ${nome(tx.key)}: ${t}${det ? ' · ' + det : ''}` }, el('b', { textContent: t }), det ? el('small', { textContent: det }) : '')
  }
  const tabela = el('table', { className: 'diagm__mat' },
    el('thead', {}, el('tr', {}, el('th', { textContent: 'ouve ↓ / fala →' }), ...pres.map(p => el('th', {}, pfpImg(p.key, 22), el('span', { textContent: nome(p.key) }))))),
    el('tbody', {}, ...pres.map(rx => el('tr', {}, el('th', {}, pfpImg(rx.key, 22), el('span', { textContent: nome(rx.key) })), ...pres.map(tx => celula(rx, tx))))))
  const pessoas = el('div', { className: 'diagm__pessoas' }, ...pres.map(p => {
    const e = p.est || {}
    const b = el('button', { type: 'button', className: 'btn btn--ghost diagm__reset' }, icon('refresh-cw'), el('span', { textContent: 'Reconectar' }))
    b.addEventListener('click', () => pedirReset(p.key))
    const q = Object.values(e.peers || {}).reduce((n, x) => n + (x.quedas || 0), 0)
    const atraso = Math.round((Date.now() - p.ts) / 1000)
    return el('div', { className: 'diagm__p' }, pfpImg(p.key, 34),
      el('div', { className: 'diagm__pinfo' }, el('b', { textContent: nome(p.key) }),
        el('span', { textContent: [e.nav, `online há ${durTxt(Date.now() - p.desde)}`, e.mic ? `mic ${e.mic}` : '', e.surdo ? 'som desligado' : '', e.proj ? `projetando (${e.proj})` : '', e.oculta ? 'aba em segundo plano' : '', q ? `${q} queda(s) em 10 min` : '', atraso > 20 ? `último sinal há ${atraso} s` : ''].filter(Boolean).join(' · ') })),
      b)
  }))
  const evs = el('ol', { className: 'diagm__ev' }, ...r.ev.slice(0, 80).map(x => el('li', { className: `diagm__ev--${x.k || 'x'}` },
    el('time', { textContent: new Date(x.ts).toLocaleTimeString('pt-BR') }), el('b', { textContent: nome(x.key) }), el('span', { textContent: x.t }))))
  diagEl.replaceChildren(el('div', { className: 'diagm__box' }, head,
    el('h3', { textContent: 'Quem ouve quem' }), el('div', { className: 'diagm__matwrap' }, tabela),
    el('h3', { textContent: 'Pessoas' }), pessoas,
    el('h3', { textContent: 'Eventos recentes' }), r.ev.length ? evs : el('p', { className: 'diagm__vazio', textContent: 'Nada ainda.' })))
}

renderAll()

/* ---------- Admin ---------- */
let admTok = null
const okTok = new Map()
async function validTok(tok) {
  if (typeof tok !== 'string' || !crypto.subtle) return false
  if (!okTok.has(tok)) okTok.set(tok, await sha('admin:' + tok) === CFG.adminHash)
  return okTok.get(tok)
}
async function admLogin(pw, quiet) {
  if (me.key !== 'kellyson') return
  if (!await validTok(pw)) { if (!quiet) toast('Senha de admin errada'); return }
  admTok = pw; me.admin = true
  store.set('adm', pw)
  $('#admLogin').hidden = true; $('#admTools').hidden = false
  $('#bannerX').hidden = false
  $('#btnInvite').hidden = false
  if (!quiet) toast('Você é admin')
}
function admRestore() { const t = store.get('adm'); if (t) admLogin(t, true) }
$('#admGo').addEventListener('click', () => admLogin($('#admPw').value))
$('#admDiag').addEventListener('click', () => { closePops(); abrirDiag() })
$('#admPw').addEventListener('keydown', e => { if (e.key === 'Enter') admLogin($('#admPw').value) })
const idsOf = key => [...peers].filter(([, p]) => p.key === key).map(([id]) => id)
function admSend(op, extra = {}, target) {
  if (!admTok) return
  actions?.adm.send({ tok: admTok, op, ...extra }, target ? { target } : undefined)
}
function renderAdmButtons(key, box) {
  box.replaceChildren()
  if (!me.admin) return
  const ids = idsOf(key)
  const mk = (ic, txt, fn) => { const b = el('button', { type: 'button', className: 'btn btn--ghost' }, icon(ic), el('span', { textContent: txt })); b.addEventListener('click', () => { fn(); closePops() }); return b }
  box.append(mk('mic-off', 'Mutar na sala', () => ids.forEach(id => admSend('mute', {}, id))))
  if (ids.some(id => tiles.has(id))) box.append(mk('monitor-x', 'Parar tela', () => ids.forEach(id => admSend('stop', {}, id))))
  box.append(mk('user-x', 'Tirar da sala', () => ids.forEach(id => admSend('kick', {}, id))))
}
$('#admSend').addEventListener('click', () => {
  const text = $('#admMsg').value.trim().slice(0, 140)
  if (!text) return
  banner = { tok: admTok, op: 'aviso', text }
  admSend('aviso', { text }); showBanner(text)
  $('#admMsg').value = ''
})
$('#bannerX').addEventListener('click', () => { banner = null; admSend('aviso', { text: '' }); showBanner('') })
// Convite rápido no botão principal; personalização fica na pílula ao lado.
let inviteSession = null, inviteMovie = null, inviteCopiedLink = '', inviteRevision = 0
let movieTimer, movieRequest = 0, movieResults = [], movieActive = -1
const generalPeople = () => PEOPLE.filter(p => !p.ausente).map(p => p.id)
const invButton = text => { $('#invGo').replaceChildren(icon('ticket'), el('span', { textContent: text })) }
function invalidateInvite() {
  inviteRevision++; inviteCopiedLink = ''; $('#invOut').hidden = true
  invButton('Gerar ingresso')
}
async function quickInvite() {
  if (!roomPw) return
  const btn = $('#btnInvite'); btn.disabled = true
  const r = await api('convite', { method: 'POST', body: {
    pw: roomPw, filme: invite?.filme || '', poster: invite?.poster || '',
    pessoas: generalPeople(), convidados: !!CFG.convidados, diretos: false,
    sessao: invite?.sessao || '', sala: canal,
  } })
  btn.disabled = false
  if (!r?.slug) return toast('Não consegui gerar o convite. Tente novamente.')
  const link = `${location.origin}/${r.slug}`
  if (!await copyLink(link)) {
    await openInvite(); showInviteLinks(link, {}, false)
  }
}
async function openInvite(session) {
  clearTimeout(movieTimer); movieRequest++
  closePops(); $('#diaryModal').hidden = true
  inviteSession = session || null
  inviteMovie = session ? { ...session, fonteNota: session.fonteNota || '' } : null
  $('#invFilme').value = session?.filme || ''
  $('#invMovies').hidden = true; $('#invSearchHint').hidden = true
  const chosen = session?.pessoas || []
  const options = [...PEOPLE.filter(p => !p.ausente), ...(CFG.convidados ? [{ id: 'guest', nome: 'Convidados sem perfil', foto: CFG.convidado?.foto, cor: '#a9b6bf' }] : [])]
  $('#invWho').replaceChildren(...options.map(p => {
    const input = el('input', { type: 'checkbox', value: p.id, checked: chosen.includes(p.id), ariaLabel: p.nome })
    const label = el('label', { className: 'invite-avatar', title: p.nome }, input, p.foto ? el('img', { className: 'pfp', src: p.foto, alt: '', width: 40, height: 40 }) : el('span', { textContent: p.nome[0] }), el('i', { className: 'invite-avatar__check' }, icon('check')))
    input.addEventListener('change', () => { invalidateInvite(); renderInviteCount() })
    return label
  }))
  invalidateInvite(); renderInviteCount(); renderInvitePreview()
  $('#inviteModal').hidden = false; $('#invFilme').focus()
}
function renderInviteCount() {
  const selected = [...$('#invWho').querySelectorAll('input:checked')].map(x => x.value)
  const only = selected.length === 1 && selected[0] !== 'guest'
  $('#invCount').textContent = !selected.length ? 'Todo mundo' : only ? person(selected[0]).nome : `${selected.length} selecionados`
  $('#invMode').textContent = !selected.length ? 'Sem selecionar ninguém, o convite é para todo mundo.' : only ? `O link entra direto como ${person(selected[0]).nome}. Vale uma vez.` : 'Um link para o grupo escolher entre essas pessoas.'
}
function renderInvitePreview() {
  const m = inviteMovie
  $('#invPreview').hidden = !m?.filme
  if (!m?.filme) return $('#invPreview').replaceChildren()
  const detail = [m.ano, m.nota != null ? `★ ${m.nota}${m.fonteNota ? ' · ' + m.fonteNota : ''}` : ''].filter(Boolean).join('  ·  ')
  const poster = m.poster ? el('img', { src: m.poster, alt: 'Capa de ' + m.filme }) : el('span', { className: 'invite-preview__placeholder' }, icon('film'))
  if (m.poster) poster.onerror = () => { poster.replaceWith(el('span', { className: 'invite-preview__placeholder' }, icon('film'))) }
  $('#invPreview').replaceChildren(poster, el('div', {}, el('small', { textContent: 'HOJE TEM CINEMINHA' }), el('h3', { textContent: m.filme }), el('p', { textContent: detail }), el('span', { textContent: 'Entra aí pra assistir com a gente.' })))
}
function closeMovieResults() {
  $('#invMovies').hidden = true; $('#invFilme').setAttribute('aria-expanded', 'false'); $('#invFilme').removeAttribute('aria-activedescendant'); movieActive = -1
}
function showMovieResults(list) {
  movieResults = list; movieActive = -1
  $('#invMovies').replaceChildren(...list.map((m, index) => {
    const button = el('button', { type: 'button', id: 'movie-option-' + index, role: 'option', className: 'movie-result', ariaSelected: 'false' }, m.poster ? el('img', { src: m.poster, alt: '', width: 28, height: 42 }) : icon('film'), el('span', {}, el('b', { textContent: m.filme }), el('small', { textContent: [m.ano, m.id ? 'Filme' : 'Sua sessão'].filter(Boolean).join(' · ') })))
    button.addEventListener('click', () => chooseMovie(m))
    return button
  }))
  $('#invMovies').hidden = !list.length; $('#invFilme').setAttribute('aria-expanded', String(!!list.length))
}
async function chooseMovie(m) {
  clearTimeout(movieTimer); const req = ++movieRequest
  closeMovieResults(); $('#invSearchHint').hidden = true
  inviteMovie = m; inviteSession = m.session || null
  $('#invFilme').value = m.filme
  invalidateInvite(); renderInvitePreview()
  if (m.id?.startsWith('tt')) {
    const r = await api('filmes?id=' + encodeURIComponent(m.id))
    if (req !== movieRequest) return
    if (r?.filme) { inviteMovie = r.filme; renderInvitePreview() }
  }
}
$('#invFilme').addEventListener('input', () => {
  const query = $('#invFilme').value.trim(), req = ++movieRequest
  clearTimeout(movieTimer); inviteMovie = null; inviteSession = null
  invalidateInvite(); renderInvitePreview(); closeMovieResults(); $('#invSearchHint').hidden = true
  if (query.length < 2) return
  movieTimer = setTimeout(async () => {
    const local = (await sessionsList()).filter(s => !s.resumo && s.filme?.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 2).map(s => ({ ...s, id: undefined, session: s }))
    const r = await api('filmes?q=' + encodeURIComponent(query))
    if (req !== movieRequest) return
    showMovieResults([...local, ...(r?.list || [])].slice(0, 6))
    $('#invSearchHint').textContent = r ? (movieResults.length ? '' : 'Pode usar esse título mesmo assim.') : 'A busca não respondeu. Você pode usar esse título mesmo assim.'
    $('#invSearchHint').hidden = !!movieResults.length
  }, 280)
})
$('#invFilme').addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.stopPropagation(); closeMovieResults(); return }
  if ($('#invMovies').hidden || !movieResults.length) return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); movieActive = (movieActive + (e.key === 'ArrowDown' ? 1 : -1) + movieResults.length) % movieResults.length
    $('#invFilme').setAttribute('aria-activedescendant', 'movie-option-' + movieActive)
    $('#invMovies').querySelectorAll('[role=option]').forEach((b, i) => b.setAttribute('aria-selected', String(i === movieActive)))
  } else if (e.key === 'Enter' && movieActive >= 0) { e.preventDefault(); chooseMovie(movieResults[movieActive]) }
})
$('#admInvite').addEventListener('click', () => openInvite())
$('#btnInvite').addEventListener('click', quickInvite)
$('#btnInviteDetails').addEventListener('click', () => openInvite())
$('#invClose').addEventListener('click', () => { clearTimeout(movieTimer); movieRequest++; $('#inviteModal').hidden = true })
async function copyLink(link) {
  try { await navigator.clipboard.writeText(link); toast('Convite copiado. É só mandar!'); return true }
  catch { toast('Toque em Copiar para copiar o convite'); return false }
}
function inviteLinkRow(label, url) {
  const copy = el('button', { type: 'button', className: 'btn btn--ghost', title: 'Copiar link de ' + label }, icon('copy'), el('span', { textContent: 'Copiar' }))
  copy.addEventListener('click', () => copyLink(url))
  const field = el('input', { value: url, readOnly: true, ariaLabel: 'Link de ' + label })
  field.addEventListener('focus', () => field.select())
  return el('div', { className: 'invite-link' }, el('b', { textContent: label }), el('div', {}, field, copy))
}
function showInviteLinks(link, directs, single) {
  const rows = [inviteLinkRow(single ? 'Seu ingresso pessoal está pronto' : 'Convite pronto', link)]
  if (!single && Object.keys(directs).length) rows.push(el('details', { className: 'invite-personals' }, el('summary', { textContent: 'Links individuais' }), ...Object.entries(directs).map(([key, suffix]) => inviteLinkRow(person(key).nome, `${link}/${suffix}`))))
  $('#invOut').replaceChildren(...rows); $('#invOut').hidden = false
  inviteCopiedLink = link; invButton('Copiar convite')
}
$('#inviteForm').addEventListener('submit', async e => {
  e.preventDefault()
  if (inviteCopiedLink) return copyLink(inviteCopiedLink)
  const picked = [...$('#invWho').querySelectorAll('input:checked')].map(i => i.value)
  const pessoas = picked.length ? picked.filter(v => v !== 'guest') : generalPeople()
  const convidados = picked.length ? picked.includes('guest') : !!CFG.convidados
  const single = pessoas.length === 1 && !convidados
  const revision = inviteRevision, btn = $('#invGo'); btn.disabled = true
  const movie = inviteMovie || {}
  const r = await api('convite', { method: 'POST', body: { pw: roomPw, filme: $('#invFilme').value.trim(), pessoas, convidados, diretos: !!picked.length, sessao: inviteSession?.id || '', poster: movie.poster || '', ano: movie.ano || '', nota: movie.nota ?? null, fonteNota: movie.fonteNota || '', sinopse: movie.sinopse || '', sala: canal } })
  btn.disabled = false
  if (revision !== inviteRevision) return
  if (!r?.slug) return toast('Não deu para criar o convite. Tente novamente.')
  const group = `${location.origin}/${r.slug}`
  const link = single ? `${group}/${r.diretos[pessoas[0]]}` : group
  showInviteLinks(link, r.diretos || {}, single)
  await copyLink(link)
})
$('#admFim').addEventListener('click', () => { closePops(); admSend('fim'); showCredits(); saveSummary() })

/* ---------- Diário de sessões ---------- */
let sessCache = null
async function sessionsList(force) {
  if (!sessCache || force) sessCache = (await api('sessoes'))?.list || []
  return sessCache
}
// sessão "de agora": a do convite, ou a última cadastrada nos últimos 3 dias que ainda não terminou
async function currentSession() {
  const list = await sessionsList()
  if (invite?.sessao) return list.find(s => s.id === invite.sessao) || null
  return list.find(s => !s.resumo && Date.now() - (s.criado || 0) < 3 * 86400e3) || null
}
// Ao finalizar, o admin grava quem foi, duração, mensagens, reações e a mensagem mais reagida
async function saveSummary() {
  if (!admTok) return
  const presentes = new Map()
  ;[me, ...peers.values()].forEach(p => { if (p.key && !presentes.has(p.key)) presentes.set(p.key, p.name || person(p.key).nome) })
  let destaque = null
  msgReacts.forEach((map, id) => {
    const n = [...map.values()].reduce((a, set) => a + set.size, 0)
    const m = messages.find(x => x.id === id)
    if (m?.text && n > (destaque?.n || 0)) destaque = { nome: person(m.key, m.name).nome, texto: m.text, n }
  })
  const cur = await currentSession()
  const sessao = {
    ...(cur ? { id: cur.id } : { filme: invite?.filme || CFG.subtitulo || `Sessão de ${new Date().toLocaleDateString('pt-BR')}`, quando: new Date().toLocaleDateString('pt-BR') }),
    resumo: { presentes: [...presentes].map(([key, nome]) => ({ key, nome })), duracao: Math.round((Date.now() - (me.since || Date.now())) / 60000), mensagens: messages.filter(m => !m.sys && m.ts >= (me.since || 0)).length, reacoes: reactCount, destaque },
  }
  const r = await api('sessoes', { method: 'POST', body: { tok: admTok, sessao } })
  if (r?.ok) { sessCache = null; toast('Sessão guardada no diário') }
}
let chamCache = []
// Esqueleto de carregamento (capa + linhas brilhando) no lugar de "Carregando…"
// diário em linha do tempo: um separador por mês ("Novembro de 2026"; o ano só se não for o atual)
function porMes(itens) {
  const out = []; let ant = ''
  for (const x of itens) {
    const d = new Date(x.t), k = `${d.getFullYear()}-${d.getMonth()}`
    if (k !== ant) {
      ant = k
      const mes = d.toLocaleDateString('pt-BR', { month: 'long' }), ano = d.getFullYear()
      out.push(el('li', { className: 'diary__sec diary__mes', textContent: mes[0].toUpperCase() + mes.slice(1) + (ano !== new Date().getFullYear() ? ` de ${ano}` : '') }))
    }
    out.push(x.node)
  }
  return out
}
// média das estrelas que a sala deu nos episódios/filme daquela call
function notaSala(c, ti) {
  const ns = (c.notas || []).filter(n => n.ti?.toLowerCase() === String(ti).toLowerCase())
  if (!ns.length) return ''
  const m = ns.reduce((a, n) => a + n.media, 0) / ns.length
  return el('span', { className: 'diary__nota diary__nota--sala', textContent: `★ ${m.toFixed(1).replace('.', ',')} da sala` })
}
const esqueleto = (n, tag = 'li') => Array.from({ length: n }, () => el(tag, { className: 'esq-item', ariaHidden: 'true' }, el('i', { className: 'esq esq--capa' }), el('div', {}, el('i', { className: 'esq esq--l1' }), el('i', { className: 'esq esq--l2' }), el('i', { className: 'esq esq--l3' }))))
/* ---------- Retrospectiva: o ano do Cineminha em números ---------- */
const retroEl = el('div', { className: 'retro', hidden: true })
$('#diaryList').after(retroEl)
const retroBtn = el('button', { type: 'button', className: 'diary-card__retro', title: 'O ano do Cineminha em números' }, icon('party-popper'), el('span', { textContent: 'Retrospectiva' }))
$('#diaryX').before(retroBtn)
retroBtn.addEventListener('click', () => mostraRetro(retroEl.hidden))
function mostraRetro(on, ano) {
  retroEl.hidden = !on; $('#diaryList').hidden = on
  retroBtn.setAttribute('aria-pressed', String(on))
  $('#diaryTitle').textContent = on ? 'Retrospectiva' : 'Diário de sessões'
  if (on) carregaRetro(ano || new Date().getFullYear())
}
const horasTxt = ms => { const h = ms / 3.6e6; return h >= 10 ? `${Math.round(h)} h` : h >= 1 ? `${h.toFixed(1).replace('.', ',')} h` : `${Math.round(ms / 60000)} min` }
async function carregaRetro(ano) {
  retroEl.replaceChildren(el('div', { className: 'esq esq--hero' }), ...esqueleto(3, 'div'))
  const r = await api('sessoes?retro=' + ano)
  if (!r?.ano) return retroEl.replaceChildren(el('p', { className: 'diary__empty', textContent: 'Não deu para carregar agora.' }))
  if (!r.sessoes) return retroEl.replaceChildren(el('p', { className: 'diary__empty', textContent: `Nenhuma sessão registrada em ${ano} ainda.` }))
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'], SEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
  const dia = SEM[r.semana.indexOf(Math.max(...r.semana))], hora = r.horas.indexOf(Math.max(...r.horas))
  const maxMes = Math.max(...r.meses, 1)
  const anos = r.anos.length > 1 ? el('div', { className: 'retro__anos' }, ...r.anos.map(a => { const b = el('button', { type: 'button', className: a === r.ano ? 'on' : '', textContent: a }); b.addEventListener('click', () => carregaRetro(a)); return b })) : ''
  const sec = (t, ...kids) => el('section', { className: 'retro__sec' }, el('h3', { textContent: t }), ...kids)
  const compartilhar = el('button', { type: 'button', className: 'retro__share' }, icon('send'), el('span', { textContent: 'Imagem para o grupo' }))
  compartilhar.addEventListener('click', () => imagemRetro(r, compartilhar))
  retroEl.replaceChildren(
    anos,
    el('div', { className: 'retro__hero' }, compartilhar,
      el('small', { textContent: `${r.ano} no Cineminha` }),
      el('b', { textContent: horasTxt(r.ms) }), el('span', { textContent: 'juntos na call' }),
      el('div', { className: 'retro__nums' },
        el('p', {}, el('b', { textContent: r.sessoes }), ' sessões'),
        el('p', {}, el('b', { textContent: horasTxt(r.msProj) }), ' de tela'),
        el('p', {}, el('b', { textContent: r.titulos.length }), ' títulos'))),
    r.titulos.length ? sec('O que mais passou', el('ol', { className: 'retro__tops' }, ...r.titulos.map((t, i) => el('li', {},
      t.poster ? el('img', { src: t.poster.replace('/poster/small/', '/poster/medium/'), alt: '', loading: 'lazy' }) : el('span', { className: 'retro__semcapa' }, icon('film')),
      el('i', { textContent: i + 1 }),
      el('div', {}, el('b', { textContent: t.titulo }), el('small', { textContent: [horasTxt(t.ms), t.notaSala ? `★ ${String(t.notaSala).replace('.', ',')} da sala` : '', t.eps ? `${t.eps} episódio${t.eps > 1 ? 's' : ''}` : '', t.sessoes > 1 ? `${t.sessoes} sessões` : ''].filter(Boolean).join(' · ') })))))) : '',
    sec('Quem mais apareceu', el('div', { className: 'retro__gente' }, ...r.pessoas.map((p, i) => el('div', { className: i === 0 ? 'top' : '' }, pfpImg(p.key, i === 0 ? 64 : 44, p.nome), el('b', { textContent: p.nome }), el('small', { textContent: `${p.n} ${p.n > 1 ? 'sessões' : 'sessão'}` }))))),
    el('div', { className: 'retro__dupla' },
      r.maior ? sec('Maratona do ano', el('p', { className: 'retro__grande', textContent: horasTxt(r.maior.ms) }), el('small', { textContent: [new Date(r.maior.ini).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }), r.maior.titulo, `${r.maior.presentes} pessoas`].filter(Boolean).join(' · ') })) : '',
      r.projetou[0]?.ms ? sec('Projecionista do ano', el('p', { className: 'retro__grande', textContent: r.projetou[0].nome }), el('small', { textContent: `${horasTxt(r.projetou[0].ms)} projetando` })) : '',
      sec('O horário de vocês', el('p', { className: 'retro__grande', textContent: `${dia}, ${hora}h` }), el('small', { textContent: 'o dia e a hora em que mais começa sessão' }))),
    sec('Mês a mês', el('div', { className: 'retro__meses' }, ...r.meses.map((ms, i) => el('div', { title: horasTxt(ms) }, el('i', { style: `--h:${Math.round(ms / maxMes * 100)}%` }), el('small', { textContent: MES[i] }))))))
}
// Entrar na sala: a cortina da entrada se abre para os lados (uma vez por entrada)
function abreCortinaEntrada() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('auto')) return
  const c = el('div', { className: 'entrada-cortina', ariaHidden: 'true' }, el('i', { className: 'l' }), el('i', { className: 'r' }))
  document.body.append(c)
  requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('abre')))
  setTimeout(() => c.remove(), 1900)
}
// Retrospectiva em imagem vertical (1080×1920, tipo stories) para mandar no grupo
async function imagemRetro(r, btn) {
  btn.disabled = true
  try {
    const W = 1080, H = 1920, c = el('canvas', { width: W, height: H }), g = c.getContext('2d')
    const carrega = src => new Promise(ok => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src })
    const fonte = (peso, px) => `${peso} ${px}px Inter, "DM Sans", system-ui, sans-serif`
    const bg = g.createRadialGradient(0, 0, 0, 0, 0, 1900); bg.addColorStop(0, '#e5484d'); bg.addColorStop(.45, '#8a1c2b'); bg.addColorStop(1, '#16070b')
    g.fillStyle = bg; g.fillRect(0, 0, W, H)
    // logo: o "c" com o play
    g.save(); g.translate(90, 110); g.scale(.62, .62); g.translate(-36, -36)
    g.fillStyle = '#fff4e6'; g.fill(new Path2D('M183.4 64.6A84 84 0 1 0 124 208H204a8 8 0 0 0 8-8V176a8 8 0 0 0-8-8H124A44 44 0 1 1 155.1 92.9Z'))
    g.fillStyle = '#ffc23d'; g.fill(new Path2D('M106 98 151 124 106 150Z')); g.restore()
    g.fillStyle = '#fff4e6'; g.font = fonte(800, 52); g.fillText('Cineminha', 230, 185)
    g.font = fonte(700, 34); g.globalAlpha = .8; g.fillText(`RETROSPECTIVA ${r.ano}`, 90, 330); g.globalAlpha = 1
    g.font = fonte(800, 210); g.fillText(horasTxt(r.ms), 82, 530)
    g.font = fonte(500, 46); g.fillText('juntos na call', 90, 600)
    const nums = [[r.sessoes, 'sessões'], [horasTxt(r.msProj), 'de tela'], [r.titulos.length, 'títulos']]
    nums.forEach(([n, t], i) => { const x = 90 + i * 310; g.font = fonte(800, 64); g.fillText(String(n), x, 720); g.font = fonte(500, 32); g.globalAlpha = .8; g.fillText(t, x, 765); g.globalAlpha = 1 })
    // o que mais passou (capas pelo nosso domínio)
    g.font = fonte(700, 30); g.globalAlpha = .7; g.fillText('O QUE MAIS PASSOU', 90, 880); g.globalAlpha = 1
    const top = r.titulos.slice(0, 3)
    const capas = await Promise.all(top.map(t => t.poster ? carrega('api/filmes?capa=' + encodeURIComponent(t.poster.replace('/poster/small/', '/poster/medium/'))) : null))
    top.forEach((t, i) => {
      const y = 920 + i * 200
      if (capas[i]) { g.save(); g.beginPath(); g.roundRect(90, y, 116, 172, 12); g.clip(); g.drawImage(capas[i], 90, y, 116, 172); g.restore() }
      else { g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.roundRect(90, y, 116, 172, 12); g.fill() }
      g.fillStyle = i ? '#fff4e6' : '#ffc23d'; g.font = fonte(800, 56); g.fillText(String(i + 1), 240, y + 100)
      g.fillStyle = '#fff4e6'; g.font = fonte(700, 46)
      let nome = t.titulo; while (g.measureText(nome).width > 640 && nome.length > 4) nome = nome.slice(0, -2)
      g.fillText(nome === t.titulo ? nome : nome + '…', 310, y + 80)
      g.font = fonte(500, 32); g.globalAlpha = .75; g.fillText([horasTxt(t.ms), t.eps ? `${t.eps} episódios` : '', t.notaSala ? `★ ${t.notaSala} da sala` : ''].filter(Boolean).join(' · '), 310, y + 128); g.globalAlpha = 1
    })
    // quem mais apareceu
    const yP = 1560
    g.font = fonte(700, 30); g.globalAlpha = .7; g.fillText('QUEM MAIS APARECEU', 90, yP); g.globalAlpha = 1
    const gente = r.pessoas.slice(0, 5), fotos = await Promise.all(gente.map(p => person(p.key, p.nome).foto ? carrega(person(p.key, p.nome).foto) : null))
    gente.forEach((p, i) => {
      const x = 90 + i * 186, y = yP + 40
      g.save(); g.beginPath(); g.arc(x + 70, y + 70, 70, 0, Math.PI * 2); g.clip()
      if (fotos[i]) g.drawImage(fotos[i], x, y, 140, 140); else { g.fillStyle = person(p.key, p.nome).cor || '#888'; g.fillRect(x, y, 140, 140) }
      g.restore()
      g.fillStyle = i ? '#fff4e6' : '#ffc23d'; g.font = fonte(700, 30); g.textAlign = 'center'; g.fillText(p.nome.slice(0, 10), x + 70, y + 190)
      g.font = fonte(500, 26); g.globalAlpha = .7; g.fillText(`${p.n} sessões`, x + 70, y + 226); g.globalAlpha = 1; g.textAlign = 'left'
    })
    const blob = await new Promise(ok => c.toBlob(ok, 'image/png'))
    const arq = new File([blob], `cineminha-${r.ano}.png`, { type: 'image/png' })
    if (navigator.canShare?.({ files: [arq] })) await navigator.share({ files: [arq], title: `Cineminha ${r.ano}` }).catch(() => {})
    else { const a = el('a', { href: URL.createObjectURL(blob), download: arq.name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('Imagem salva: é só mandar no grupo') }
  } catch (e) { toast('Não deu para gerar a imagem agora') }
  btn.disabled = false
}
async function openDiary() {
  closePops()
  mostraRetro(false)
  $('#diaryList').replaceChildren(...esqueleto(3))
  $('#diaryModal').hidden = false
  const r = await api('sessoes')
  sessCache = r?.list || []
  chamCache = r?.chamadas || []
  const list = sessCache
  const hm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dia = t => new Date(t).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
  // o que foi projetado numa sessão da call: título, quanto tempo, quem projetou
  const projs = c => c?.proj?.length ? el('ul', { className: 'diary__proj' }, ...c.proj.slice(0, 6).map(x => el('li', {}, icon(x.k === 'arquivo' ? 'film' : 'monitor'), el('b', { textContent: x.t }), el('span', { textContent: `${x.ms >= 60e3 ? durTxt(x.ms) : 'menos de 1 min'} · por ${x.por}` })))) : ''
  const cast = (pres, txt) => el('div', { className: 'diary__cast' }, ...(pres || []).map(p => pfpImg(p.key, 26, p.nome)), el('span', { textContent: txt }))
  const planned = list.map(s => {
    const r = s.resumo, c = chamCache.find(x => x.sessao === s.id)
    const quando = s.quando || new Date(s.criado).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
    const info = el('div', { className: 'diary__info' },
      el('span', { className: 'diary__when', textContent: r ? quando : `Próxima · ${quando}` }),
      el('h3', { textContent: s.filme || 'Sessão' }, s.ano ? el('small', { textContent: ` ${s.ano}` }) : ''),
      s.diretor ? el('p', { className: 'diary__meta', textContent: `de ${s.diretor}${s.duracao ? ' · ' + s.duracao : ''}` }) : '',
      s.sinopse && !r ? el('p', { className: 'diary__sinopse', textContent: s.sinopse }) : '',
      r ? cast(r.presentes, `${r.duracao || 0} min${r.mensagens ? ` · ${r.mensagens} mensagens` : ''}${r.reacoes ? ` · ${r.reacoes} reações` : ''}`) : '',
      projs(c),
      r?.destaque ? el('blockquote', { className: 'diary__quote' }, el('span', { textContent: `“${r.destaque.texto}”` }), el('cite', { textContent: `${r.destaque.nome} · ${r.destaque.n} reações` })) : '',
      !r ? (() => { const b = el('button', { type: 'button', className: 'btn btn--ghost diary__invite' }, icon('ticket'), el('span', { textContent: 'Convidar' })); b.addEventListener('click', () => openInvite(s)); return b })() : '',
      s.convite && !r ? el('a', { className: 'diary__link', href: '/' + s.convite, textContent: 'Abrir convite' }) : '')
    return { t: r?.fim || s.criado || 0, proxima: !r, node: el('li', { className: 'diary__item' }, s.poster ? el('img', { className: 'diary__poster', src: s.poster, alt: '', loading: 'lazy' }) : el('div', { className: 'diary__poster diary__poster--none' }, icon('film')), info) }
  })
  // sessões da call registradas sozinhas (as que não viraram uma sessão cadastrada)
  const auto = chamCache.filter(c => !c.sessao).map(c => {
    const agora = Date.now() - c.fim < 15 * 60e3
    // reconhecido na projeção (Netflix…): capa, série, episódios e nota; o mais assistido da call manda
    const m = [...c.proj].filter(x => x.m).sort((x, y) => y.ms - x.ms)[0]?.m
    const titulo = m?.ti || c.proj[0]?.t || 'Só conversa'
    const eps = m?.tp === 'serie' ? [...new Map(c.proj.filter(x => x.m?.ti === m.ti && x.m.e).map(x => [`${x.m.s}:${x.m.e}`, x.m])).values()].sort((x, y) => x.s - y.s || x.e - y.e) : []
    const epTxt = eps.length ? [...new Set(eps.map(x => x.s))].map(t => `T${t} · ${eps.filter(x => x.s === t).map(x => 'E' + x.e).join(', ')}`).join(' · ') + (eps.length === 1 && eps[0].ep ? ` · ${eps[0].ep}` : '') : m?.a || ''
    const info = el('div', { className: 'diary__info' },
      el('span', { className: 'diary__when' }, agora ? el('em', { className: 'diary__agora', textContent: 'agora' }) : '', `${dia(c.ini)} · ${hm(c.ini)}–${hm(c.fim)}`),
      el('h3', { textContent: titulo }),
      m ? el('p', { className: 'diary__meta diary__midia' }, m.pl ? el('span', { className: 'diary__plat', innerHTML: (ICONE_PLAT[m.pl] || '') + (NOME_PLAT[m.pl] || '') }) : '', epTxt ? el('span', { textContent: epTxt }) : '', eps.length === 1 && eps[0].en ? el('span', { className: 'diary__nota', innerHTML: `<i>★</i> ${(+eps[0].en).toFixed(1)} episódio` }) : '', m.n ? el('span', { className: 'diary__nota', innerHTML: `<i>★</i> ${(+m.n).toFixed(1)} IMDb` }) : '', notaSala(c, m.ti)) : '',
      cast(c.presentes, durTxt(c.fim - c.ini)),
      c.proj.length > 1 || (c.proj[0] && c.proj[0].ms >= 60e3) ? projs(c) : '')
    const capa = m?.p ? el('img', { className: 'diary__poster', src: m.p.replace('/poster/small/', '/poster/medium/'), alt: '', loading: 'lazy' }) : el('div', { className: 'diary__poster diary__poster--none' }, icon(c.proj[0]?.k === 'arquivo' ? 'film' : c.proj.length ? 'monitor' : 'users'))
    return { t: c.ini, node: el('li', { className: 'diary__item diary__item--auto' }, capa, info) }
  })
  const proximas = planned.filter(x => x.proxima), vistas = [...planned.filter(x => !x.proxima), ...auto].sort((a, b) => b.t - a.t)
  if (!proximas.length && !vistas.length) return $('#diaryList').replaceChildren(el('li', { className: 'diary__empty', textContent: 'Nada ainda. Cada sessão da call entra aqui sozinha, com o que foi projetado e quem estava.' }))
  $('#diaryList').replaceChildren(
    ...(proximas.length ? [el('li', { className: 'diary__sec', textContent: 'Próximas' }), ...proximas.map(x => (x.node.classList.add('diary__item--proxima'), x.node))] : []),
    ...(vistas.length ? porMes(vistas) : []))
}
$('#btnDiary').addEventListener('click', openDiary)
/* ---------- Barra lateral (como o Discord): salas de cinema (calls), chats de texto e o seu perfil ----------
   As salas de cinema são os canais de voz: cada uma é uma call P2P separada, e dá para ver quem está em cada.
   Os chats são canais de texto que não dependem da call (histórico no servidor; quem está na mesma call
   recebe na hora, os outros a cada poucos segundos). "Conversa da sala" é o chat da call em que você está. */
let chatCh = '', textos = [], textoPoll = 0, textoUltimo = 0
const textoR = new Map(), naoLidas = new Map()
const chatR = () => chatCh ? textoR.get(chatCh) || roomId : roomId
function chatChegou(m) {
  const ch = typeof m.ch === 'string' ? m.ch.slice(0, 30) : ''
  if (ch === chatCh) return addMsg(m)
  naoLidas.set(ch, (naoLidas.get(ch) || 0) + 1)
  if (!ch && !m.sys) { sfx('chat', m.key); showBubble(m) } // a conversa da call continua aparecendo nos bonecos
  renderLateral()
}
async function abreChat(ch, grande) {
  if (grande) chatGrande(true)
  if (ch === chatCh && messages.length) { renderLateral(); fechaLateral(); return }
  if (ch && !textoR.has(ch)) textoR.set(ch, 'x' + (await sha('texto:' + roomPw + ':' + ch)).slice(0, 40))
  chatCh = ch; naoLidas.delete(ch)
  clearInterval(textoPoll); textoPoll = 0
  clearChat()
  const t = textos.find(x => x.id === ch)
  $('#chat .chat__head h2').textContent = ch ? t?.nome || ch : 'Conversa da sala'
  setIcon($('#chat .chat__head svg'), ch ? 'hash' : 'volume-2')
  $('#chatInput').placeholder = ch ? `Conversar em #${t?.nome || ch}` : 'Mensagem para a sala'
  $('#chat').classList.remove('troca'); void $('#chat').offsetWidth; $('#chat').classList.add('troca')
  await loadHistory()
  textoUltimo = Math.max(0, ...messages.map(m => m.ts || 0))
  if (ch) textoPoll = setInterval(async () => {
    const r = await api(`chat?r=${chatR()}&desde=${textoUltimo + 1}`)
    if (chatCh !== ch) return
    for (const m of r?.list || []) { addMsg(m); textoUltimo = Math.max(textoUltimo, m.ts || 0) }
  }, 5000)
  if (!chatVisible()) setChat(true)
  renderLateral(); fechaLateral(); renderChatCanais()
}
// Chat grande (duplo clique no chat na lateral ou no título do chat): o histórico ocupa a tela; Esc volta
function chatGrande(on = !$('#chat').classList.contains('chat--grande')) {
  $('#chat').classList.toggle('chat--grande', on)
  document.body.classList.toggle('chat-grande-on', on)
  if (on) { (imersivo() ? theater : document.body).append($('#chatFundo') || el('div', { id: 'chatFundo', className: 'chat-fundo', onclick: () => chatGrande(false) })); $('#chatInput').focus() }
  else $('#chatFundo')?.remove()
  listEl.scrollTop = listEl.scrollHeight
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#chat').classList.contains('chat--grande')) chatGrande(false) })
// No próprio painel do chat: o título vira um seletor de chats
function renderChatCanais() {
  const h = $('#chat .chat__head')
  let b = h.querySelector('.chat__trocar')
  if (!b) {
    b = el('button', { type: 'button', className: 'chat__trocar', title: 'Trocar de chat', ariaExpanded: 'false' }, icon('chevron-down'))
    const g = el('button', { type: 'button', className: 'chat__trocar', title: 'Chat grande (duplo clique no título)' }, icon('maximize-2'))
    g.addEventListener('click', () => chatGrande())
    h.querySelector('h2').addEventListener('dblclick', () => chatGrande())
    h.querySelector('h2').addEventListener('click', () => b.click())
    b.addEventListener('click', () => {
      const aberto = h.querySelector('.chat__canais')
      if (aberto) return aberto.remove()
      const it = (id, nome, ic) => { const x = el('button', { type: 'button', className: chatCh === id ? 'on' : '' }, icon(ic), el('span', { textContent: nome }), naoLidas.get(id) ? el('b', { className: 'lat-badge', textContent: naoLidas.get(id) }) : ''); x.addEventListener('click', () => { m.remove(); abreChat(id) }); return x }
      const novo = el('button', { type: 'button', className: 'chat__canais-novo' }, icon('plus'), el('span', { textContent: 'Novo chat' }))
      novo.addEventListener('click', () => { m.remove(); abreLateral(); setTimeout(() => painel.querySelectorAll('.lateral__mais')[1]?.click(), 50) })
      const m = el('div', { className: 'chat__canais' }, it('', 'conversa-da-sala', 'volume-2'), ...textos.map(t => it(t.id, t.nome, 'hash')), novo)
      h.append(m)
    })
    h.append(g, b)
  }
}
async function loadTextos() {
  if (!roomPw) return
  const r = await api('sala', { method: 'POST', body: { op: 'textos', pw: roomPw } })
  if (Array.isArray(r?.textos)) { textos = r.textos; renderLateral() }
}

// Lateral = trilho fino sempre à mostra (salas em círculos, chats, projetar, mic, som e você) +
// painel completo que abre por cima ao clicar no trilho (e fecha ao clicar fora).
const lateral = el('nav', { className: 'lateral', ariaLabel: 'Salas e chats' })
const rail = el('div', { className: 'lat-rail' }), painel = el('div', { className: 'lat-painel' })
lateral.append(rail, painel)
document.body.append(lateral, el('div', { className: 'lateral__fundo', onclick: () => fechaLateral() }))
const abreLateral = () => { document.body.classList.add('lateral-aberta'); renderLateral() }
const fechaLateral = () => document.body.classList.remove('lateral-aberta')
rail.addEventListener('click', e => { if (!e.target.closest('[data-direto]')) abreLateral() })
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('lateral-aberta')) fechaLateral() })
// o "Projetar" (com o menu de tela/arquivo/YouTube) mora na lateral fora da tela cheia; em tela cheia volta para a barra
const projCasa = document.createComment('projetar'), projSlot = el('div', { className: 'lat-proj' })
function moveProjetar() {
  const w = $('#btnShare')?.closest('.popwrap'), dentro = !imersivo() && document.body.classList.contains('com-lateral') && innerWidth >= 1000
  if (!w) return
  if (dentro && !projSlot.contains(w)) { w.before(projCasa); projSlot.append(w, $('#btnTrocar')) }
  else if (!dentro && projSlot.contains(w)) { projCasa.replaceWith(w); w.after($('#btnTrocar')) }
}
addEventListener('resize', () => moveProjetar())
const secao = (titulo, onMais, dica) => {
  const h = el('div', { className: 'lateral__sec' }, el('span', { textContent: titulo }))
  if (onMais) { const b = el('button', { type: 'button', className: 'lateral__mais', title: dica, ariaLabel: dica }, icon('plus')); b.addEventListener('click', onMais); h.append(b) }
  return h
}
// criar sala ou chat: um campo aparece no lugar, Enter cria (a lateral não se redesenha enquanto você digita)
function criaInline(onde, ph, fn) {
  painel.querySelector('.lateral__novo')?.remove()
  const inp = el('input', { maxLength: 30, placeholder: ph })
  const f = el('form', { className: 'lateral__novo' }, inp, el('small', { textContent: 'Enter cria · Esc cancela' }))
  f.addEventListener('submit', async e => { e.preventDefault(); const v = inp.value.trim(); f.remove(); if (v) await fn(v); renderLateral() })
  inp.addEventListener('keydown', e => { if (e.key === 'Escape') { f.remove(); renderLateral() } })
  inp.addEventListener('blur', () => setTimeout(() => { if (f.isConnected && !inp.value.trim()) { f.remove(); renderLateral() } }, 200))
  onde.after(f); inp.focus()
}
function estadoDe(key) {
  if (key === me.key) return { muted: me.muted, deaf: me.deaf, speaking: me.speaking, proj: !!myShare }
  for (const [id, p] of peers) if (p.key === key) return { muted: p.muted, deaf: p.deaf, speaking: p.speaking, proj: tiles.has(id) }
  return {}
}
const iniciais = n => String(n || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase()
function renderLateral() {
  if (!me.key) return
  moveProjetar()
  if (painel.querySelector('.lateral__novo input') === document.activeElement) return // criando algo: não apaga o campo
  const salas = [...canais]
  if (!salas.some(c => c.id === canal)) salas.push({ id: canal, nome: canalNome(canal), pres: [] })
  const aqui = new Map([[me.key, me.name], ...[...peers.values()].filter(p => p.key).map(p => [p.key, p.name])])
  const gente = c => c.id === canal ? [...aqui].map(([key, name]) => ({ key, name })) : (c.pres || []).filter(p => p.key !== me.key)
  const totalNaoLidas = [...naoLidas.values()].reduce((a, n) => a + n, 0)
  // ---------- trilho ----------
  const bolinha = (conteudo, cls, dica, fn, direto) => {
    const b = el('button', { type: 'button', className: 'rail-b ' + (cls || ''), title: dica, ariaLabel: dica }, ...[].concat(conteudo))
    if (direto) b.dataset.direto = '1'
    if (fn) b.addEventListener('click', fn)
    return b
  }
  const mic = bolinha(icon(me.muted ? 'mic-off' : 'mic'), me.muted ? 'off' : '', me.muted ? 'Ligar microfone (M)' : 'Mutar (M) · botão direito: voz e áudio', () => $('#btnMic').click(), true)
  const som = bolinha(icon(me.deaf ? 'headphone-off' : 'headphones'), me.deaf ? 'off' : '', me.deaf ? 'Ligar o som (D)' : 'Cortar o som (D) · botão direito: voz e áudio', () => $('#btnDeaf').click(), true)
  for (const b of [mic, som]) b.addEventListener('contextmenu', e => { e.preventDefault(); openAudioMenu(b, e.clientX, e.clientY) })
  rail.replaceChildren(
    bolinha(el('img', { src: 'assets/icon.svg', alt: '' }), 'rail-logo', 'Abrir salas e chats'),
    el('i', { className: 'rail-sep' }),
    ...salas.map(c => {
      const n = gente(c).length, atual = c.id === canal
      const b = bolinha([el('span', { textContent: iniciais(c.nome) }), n ? el('b', { className: 'rail-n', textContent: n }) : ''], 'rail-sala' + (atual ? ' on' : '') + (atual && tiles.size ? ' aovivo' : ''), `${c.nome}${n ? ` · ${n} na sala` : ''}${atual ? ' (você está aqui)' : ''}`, () => { if (!atual) switchCanal(c.id) }, true)
      return b
    }),
    el('i', { className: 'rail-sep' }),
    bolinha([icon('message-square'), totalNaoLidas ? el('b', { className: 'rail-n rail-n--vermelho', textContent: totalNaoLidas > 99 ? '99+' : totalNaoLidas }) : ''], '', 'Chats'),
    bolinha(icon(myShare ? 'monitor-off' : 'projector'), 'rail-proj' + (myShare ? ' ativo' : ''), myShare ? 'Parar de projetar' : 'Projetar (tela, arquivo ou YouTube)', myShare ? () => stopShare() : null, !!myShare),
    el('span', { className: 'rail-grow' }),
    mic, som,
    bolinha(pfpImg(me.key, 36, me.name), 'rail-eu' + (me.speaking ? ' fala' : ''), `${me.name} · ajustes`, () => abreAjustes(), true))
  if (!document.body.classList.contains('lateral-aberta')) return
  // ---------- painel ----------
  const linhaSala = c => {
    const atual = c.id === canal, ativo = atual && tiles.size
    const b = el('button', { type: 'button', className: 'lat-sala' + (atual ? ' on' : ''), title: atual ? 'Você está nesta sala' : `Entrar em ${c.nome}` },
      icon(ativo ? 'projector' : 'volume-2'), el('span', { textContent: c.nome }), ativo ? el('em', { className: 'lat-aovivo', textContent: 'AO VIVO' }) : '')
    b.addEventListener('click', () => { if (!atual) switchCanal(c.id) })
    const lista = el('ul', { className: 'lat-gente' }, ...gente(c).map(p => {
      const st = atual ? estadoDe(p.key) : {}
      const li = el('li', { className: (st.speaking ? 'fala' : '') + (atual ? '' : ' longe'), title: p.name || person(p.key).nome },
        el('span', { className: 'lat-rosto' }, pfpImg(p.key, 24, p.name)), el('span', { className: 'lat-nome', textContent: p.name || person(p.key).nome }),
        st.proj ? el('em', { className: 'lat-tag', textContent: 'TELA' }) : '',
        st.muted ? el('span', { className: 'lat-ic' }, icon('mic-off')) : '', st.deaf ? el('span', { className: 'lat-ic' }, icon('headphone-off')) : '')
      if (atual) li.dataset.key = p.key
      return li
    }))
    return el('div', { className: 'lat-bloco' }, b, atual ? projSlot : '', lista)
  }
  const linhaChat = (id, nome, ic) => {
    const n = naoLidas.get(id) || 0
    const b = el('button', { type: 'button', className: 'lat-chat' + (chatCh === id ? ' on' : '') + (n ? ' novo' : ''), title: 'Duplo clique: abrir o chat grande' }, icon(ic), el('span', { textContent: nome }), n ? el('b', { className: 'lat-badge', textContent: n > 99 ? '99+' : n }) : '')
    b.addEventListener('click', () => abreChat(id))
    b.addEventListener('dblclick', () => abreChat(id, true))
    return b
  }
  const secSalas = secao('Salas de cinema', e => criaInline(e.currentTarget.parentElement, 'nome da sala', async nome => {
    const r = await api('sala', { method: 'POST', body: { op: 'canal-novo', pw: roomPw, nome, key: me.key } })
    if (!r?.canal) return toast('Não consegui criar a sala.')
    canais.push({ ...r.canal, pres: [] }); toast(`Sala “${r.canal.nome}” criada`); switchCanal(r.canal.id)
  }), 'Criar sala de cinema')
  const secChats = secao('Chats', e => criaInline(e.currentTarget.parentElement, 'nome-do-chat', async nome => {
    const r = await api('sala', { method: 'POST', body: { op: 'texto-novo', pw: roomPw, nome, key: me.key } })
    if (!r?.texto) return toast('Não consegui criar o chat.')
    if (!textos.some(t => t.id === r.texto.id)) textos.push(r.texto)
    toast(`Chat #${r.texto.nome} criado`); abreChat(r.texto.id)
  }), 'Criar chat')
  const eu = el('div', { className: 'lat-eu' },
    el('span', { className: 'lat-rosto' + (me.speaking ? ' fala' : '') }, pfpImg(me.key, 32, me.name)),
    el('div', { className: 'lat-eu__txt' }, el('b', { textContent: me.name }), el('small', { textContent: `🔊 ${canalNome(canal)}` })),
    ...[['btnMic', me.muted ? 'mic-off' : 'mic', me.muted ? 'Ligar microfone' : 'Mutar', me.muted], ['btnDeaf', me.deaf ? 'headphone-off' : 'headphones', me.deaf ? 'Ligar o som' : 'Cortar o som', me.deaf]].map(([alvo, ic, t, vermelho]) => {
      const b = el('button', { type: 'button', className: 'lat-eu__b' + (vermelho ? ' off' : ''), title: t + ' · botão direito: voz e áudio', ariaLabel: t }, icon(ic))
      b.addEventListener('click', () => $('#' + alvo)?.click())
      b.addEventListener('contextmenu', e => { e.preventDefault(); openAudioMenu(b, e.clientX, e.clientY) })
      return b
    }),
    (() => { const b = el('button', { type: 'button', className: 'lat-eu__b', title: 'Configurações', ariaLabel: 'Configurações' }, icon('settings')); b.addEventListener('click', () => abreAjustes()); return b })())
  painel.replaceChildren(
    el('header', { className: 'lateral__topo' }, el('img', { src: 'assets/icon.svg', alt: '' }), el('b', { textContent: CFG.nome || 'Cineminha' }),
      (() => { const b = el('button', { type: 'button', className: 'lateral__ic', title: 'Diário de sessões' }, icon('book-open')); b.addEventListener('click', () => { fechaLateral(); openDiary() }); return b })(),
      (() => { const b = el('button', { type: 'button', className: 'lateral__ic', title: 'Fechar (Esc)' }, icon('chevron-left')); b.addEventListener('click', fechaLateral); return b })()),
    el('div', { className: 'lateral__corpo' },
      secSalas, ...salas.map(linhaSala),
      secChats, linhaChat('', 'conversa-da-sala', 'volume-2'), ...textos.map(t => linhaChat(t.id, t.nome, 'hash'))),
    eu)
}
// mantém a lista de quem está em cada sala atualizada
let lateralTimer = 0
$('#btnLateral')?.addEventListener('click', () => document.body.classList.contains('lateral-aberta') ? fechaLateral() : abreLateral())
function ligaLateral() {
  document.body.classList.add('com-lateral')
  $('#chat .chat__head h2').textContent = 'Conversa da sala'; setIcon($('#chat .chat__head svg'), 'volume-2')
  renderChatCanais(); moveProjetar()
  loadCanais(); loadTextos()
  clearInterval(lateralTimer); lateralTimer = setInterval(() => { if (!document.hidden) loadCanais() }, 10000)
}

/* ---------- Canais ----------
   O principal sempre existe; qualquer pessoa da sala pode criar outro.
   Trocar de canal sai da sala P2P atual e entra na outra sem recarregar a página. */
let canais = [], canalTimer = 0, trocando = false
const canalNome = id => canais.find(c => c.id === id)?.nome || (id ? id.replace(/-/g, ' ') : 'Principal')
async function loadCanais() {
  if (!roomPw) return canais
  const r = await api('sala', { method: 'POST', body: { op: 'canais', pw: roomPw } })
  if (Array.isArray(r?.canais)) canais = r.canais
  renderCanais()
  return canais
}
function renderCanais() {
  renderLateral()
  $('#canalNome').textContent = canalNome(canal)
  // pontinho: tem gente em outro canal
  $('#canalDot').hidden = !canais.some(c => c.id !== canal && c.pres.some(p => p.key !== me.key))
  const list = [...canais]
  if (!list.some(c => c.id === canal)) list.push({ id: canal, nome: canalNome(canal), pres: [] }) // ?sala= de teste
  $('#canalList').replaceChildren(...list.map(c => {
    const aqui = c.id === canal
    const pres = aqui ? [] : c.pres.filter(p => p.key !== me.key)
    const b = el('button', { type: 'button', className: 'chan__item', title: aqui ? 'Você está aqui' : `Entrar em ${c.nome}` },
      icon('hash'), el('span', { className: 'chan__name', textContent: c.nome }),
      pres.length ? el('span', { className: 'chan__who', title: pres.map(p => p.name || person(p.key).nome).join(', ') }, ...pres.slice(0, 4).map(p => pfpImg(p.key, 20, p.name)), pres.length > 4 ? el('small', { textContent: `+${pres.length - 4}` }) : '') : '',
      aqui ? el('small', { className: 'chan__here', textContent: 'aqui' }) : '')
    if (aqui) b.setAttribute('aria-current', 'true')
    b.addEventListener('click', () => switchCanal(c.id))
    const li = el('li', {}, b)
    if (admTok && c.id && !aqui) {
      const x = el('button', { type: 'button', className: 'chan__del', title: `Apagar o canal ${c.nome}` }, icon('trash-2'))
      x.addEventListener('click', async () => {
        if (!confirm(`Apagar o canal “${c.nome}”? Quem estiver nele continua até sair.`)) return
        await api('sala', { method: 'POST', body: { op: 'canal-apagar', pw: roomPw, tok: admTok, id: c.id } })
        loadCanais()
      })
      li.append(x)
    }
    return li
  }))
}
$('#btnCanal').addEventListener('click', () => {
  const p = $('#canalPop'), open = p.hidden
  closePops(open ? p : null)
  p.hidden = !open
  $('#btnCanal').setAttribute('aria-expanded', String(open))
  clearInterval(canalTimer)
  if (open) { loadCanais(); canalTimer = setInterval(() => $('#canalPop').hidden ? clearInterval(canalTimer) : loadCanais(), 8000) }
})
$('#canalForm').addEventListener('submit', async e => {
  e.preventDefault()
  const nome = $('#canalInput').value.trim()
  if (!nome) return $('#canalInput').focus()
  const r = await api('sala', { method: 'POST', body: { op: 'canal-novo', pw: roomPw, nome, key: me.key } })
  if (!r?.canal) return toast('Não consegui criar o canal.')
  $('#canalInput').value = ''
  canais.push({ ...r.canal, pres: [] })
  switchCanal(r.canal.id)
})
async function switchCanal(id) {
  if (trocando || id === canal || !roomPw) return
  if (myShare && !confirm('Você está projetando. Trocar de canal encerra a projeção. Continuar?')) return
  trocando = true
  // entrou numa call: o chat volta a ser o da call
  if (chatCh) {
    chatCh = ''; clearInterval(textoPoll); textoPoll = 0
    $('#chat .chat__head h2').textContent = 'Conversa da sala'; setIcon($('#chat .chat__head svg'), 'volume-2'); $('#chatInput').placeholder = 'Mensagem para a sala'
  }
  closePops()
  // sai da sala atual
  clearInterval(presTimer); clearInterval(pollTimer); pollTimer = 0
  if (roomId && me.key) api('sala', { method: 'POST', body: { op: 'saiu', r: roomId, key: me.key } })
  try { actions?.hello.send({ ...helloMsg(), sai: 1 }) } catch {}
  stopShare(true); endMidia(false)
  try { room?.leave() } catch {}
  sumindo.forEach(s => clearTimeout(s.timer)); sumindo.clear(); avisouVolta.clear(); saiuDeVez.clear()
  room = null; actions = null
  ;[...peers.keys()].forEach(dropVoice); peers.clear()
  ;[...shareInfo.keys()].forEach(k => removeTile(k, true)); shareInfo.clear()
  srvPres.clear(); ghostWarned.clear()
  banner = null; showBanner('')
  clearChat(); reactCount = 0; me.since = Date.now()
  salaLayout = defaultLayout()
  layout()
  // endereço: ?sala=<canal>; um convite de outro canal deixa de valer no recarregar
  canal = id
  const u = new URL(location.href)
  if (invite && (invite.sala || '') !== id) u.pathname = '/'
  id ? u.searchParams.set('sala', id) : u.searchParams.delete('sala')
  history.replaceState(null, '', u.pathname + u.search)
  renderCanais()
  try { await start(roomPw) } finally { trocando = false }
  sysMsg(`Você entrou em #${canalNome(id)}`)
  sfx('euEntrei')
}

$('#diaryX').addEventListener('click', () => { $('#diaryModal').hidden = true })
$('#diaryModal').addEventListener('click', e => { if (e.target.id === 'diaryModal') $('#diaryModal').hidden = true })
// Créditos: sobem por cima de tudo (não dependem da transmissão)
function showCredits() {
  if (myShare?.kind === 'arquivo' && myShare.video && !myShare.video.paused) myShare.video.pause()
  const cast = new Map()
  ;[me, ...peers.values()].forEach(p => { if (p.key && !cast.has(p.key)) cast.set(p.key, p.name || person(p.key).nome) })
  const film = invite?.filme || CFG.subtitulo || ''
  const mins = Math.max(1, Math.round((Date.now() - (me.since || Date.now())) / 60000))
  const dur = mins >= 60 ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}` : `${mins} min`
  const msgs = messages.filter(m => !m.sys && m.ts >= (me.since || 0)).length
  const stat = (t, v) => [el('span', { textContent: t }), el('b', { textContent: v })]
  $('#creditsRoll').replaceChildren(
    el('h2', { textContent: 'Fim' }),
    film ? el('div', {}, el('h3', { textContent: 'Vocês assistiram' }), el('p', { className: 'credits__film', textContent: film })) : '',
    el('div', {}, el('h3', { textContent: 'Estrelando' }), el('div', { className: 'credits__cast' }, ...[...cast].map(([k, n]) => el('div', {}, pfpImg(k, 40, n), el('span', { textContent: n }))))),
    el('div', {}, el('h3', { textContent: 'Nesta sessão' }), el('div', { className: 'credits__stats' }, ...stat('Duração', dur), ...stat('Mensagens', String(msgs)), ...stat('Reações', String(reactCount)), ...stat('Na sala', String(cast.size)))),
    el('div', {}, el('h3', { textContent: 'Uma produção' }), el('p', { className: 'credits__film', textContent: CFG.nome })),
    el('p', { className: 'credits__end', textContent: 'Até a próxima sessão' }))
  const roll = $('#creditsRoll')
  roll.style.animation = 'none'; void roll.offsetWidth; roll.style.animation = ''
  roll.style.setProperty('--dur', `${18 + cast.size * 1.5}s`)
  $('#credits').hidden = false
}
$('#creditsX').addEventListener('click', () => { $('#credits').hidden = true })
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#credits').hidden) $('#credits').hidden = true })
$('#admClear').addEventListener('click', () => {
  if (!confirm('Apagar o chat para todos?')) return
  admSend('clear'); clearChat()
  api('chat', { method: 'DELETE', body: { r: chatR(), tok: admTok } })
})
function showBanner(text) { $('#banner').hidden = !text; $('#bannerText').textContent = text || '' }
async function onAdmin(d, peerId) {
  if (!d || !await validTok(d.tok)) return
  const who = peers.get(peerId)?.name || 'O admin'
  if (d.op === 'mute') { setMuted(true); toast(`${who} te mutou`) }
  else if (d.op === 'stop') { stopShare(); toast(`${who} parou sua projeção`) }
  else if (d.op === 'kick') leave(`${who} te tirou da sala.`)
  else if (d.op === 'clear') { clearChat(); sysMsg(`${who} limpou o chat`) }
  else if (d.op === 'sala' && d.layout) { salaLayout = cleanLayout(d.layout); renderSeats() }
  else if (d.op === 'fim') showCredits()
  else if (d.op === 'aviso') { banner = d.text ? d : null; showBanner(String(d.text || '').slice(0, 140)) }
  else if (d.op === 'reset' && (d.key === me.key || d.key === '*')) reconectarPorAdmin(who)
}
function leave(msg) {
  clearInterval(presTimer); clearInterval(pollTimer); pollTimer = 0
  if (roomId && me.key) api('sala', { method: 'POST', body: { op: 'saiu', r: roomId, key: me.key } })
  stopShare(true)
  sfx('euSai')
  try { room?.leave() } catch {}
  room = null; actions = null
  micOff()
  $('#kickedMsg').textContent = msg
  $('#kicked').hidden = false
  document.body.classList.add('locked')
}
$('#logout').addEventListener('click', logout)
async function logout() {
  if (conta?.token) await api('conta', { method: 'POST', body: { op: 'sair', t: conta.token } })
  clearTimeout(prefsTimer)
  if (me.key) await api('prefs', { method: 'PUT', body: { k: me.key, prefs } })
  store.del('conta'); store.del('sess'); store.del('adm'); store.del('prefs')
  try { room?.leave() } catch {}
  micOff(); location.assign('/' + location.search)
}

/* ---------- Minha conta ---------- */
let accountPhoto, accountPhotoBusy = false
function renderAccountBadge() {
  const owner = me.key === 'kellyson'
  if (!owner) { admTok = null; me.admin = false; store.del('adm'); $('#admTools').hidden = true; $('#bannerX').hidden = true }
  $('#admHeading').hidden = !owner
  $('#admLogin').hidden = !owner || me.admin
  $('#topName').textContent = me.name || 'Você'
  $('#topPfp').replaceChildren(pfpImg(me.key, 30, me.name))
  $('#contaNome').textContent = me.name || 'Você'
  $('#contaPfp').replaceChildren(pfpImg(me.key, 36, me.name))
}
function renderAccountPhoto() {
  const src = accountPhoto === null ? ORIG[me.key]?.foto : accountPhoto || person(me.key, me.name).foto
  $('#contaFoto').replaceChildren(el('img', { className: 'pfp', src, width: 72, height: 72, alt: 'Sua foto' }))
}
function openAccount() {
  closePops()
  accountPhoto = undefined
  const fixed = !!ORIG[me.key]
  $('#contaFotoRow').hidden = !fixed; $('#contaCorRow').hidden = !fixed
  $('#contaFile').disabled = !fixed
  $('#contaSub').textContent = me.name + (fixed ? '' : ' · convidado')
  $('#contaCor').value = person(me.key, me.name).cor
  $('#prefMuted').checked = !!prefs.entryMuted
  $('#prefSubs').checked = !!prefs.subs
  $('#prefSpatial').checked = !!prefs.spatial
  $('#prefNudges').checked = !!prefs.nudges
  renderAccountPhoto()
  $('#contaModal').hidden = false
  $('#contaClose').focus()
}
$('#btnConta').addEventListener('click', openAccount)
$('#btnProfile').addEventListener('click', openAccount)
$('#topLogout').addEventListener('click', logout)
$('#contaFotoBtn').addEventListener('click', () => $('#contaFile').click())
$('#contaFotoReset').addEventListener('click', () => { accountPhoto = null; renderAccountPhoto() })
$('#contaFile').addEventListener('change', async e => {
  const file = e.target.files?.[0]; e.target.value = ''
  if (!file) return
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 20 * 1024 * 1024) return toast('Escolha uma imagem PNG, JPEG, WebP ou GIF de até 20 MB')
  accountPhotoBusy = true
  try {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256
    const side = Math.min(bitmap.width, bitmap.height)
    canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256)
    bitmap.close()
    accountPhoto = canvas.toDataURL('image/webp', .82)
    if (accountPhoto.length > 160000) throw new Error('imagem grande')
    renderAccountPhoto()
  } catch { toast('Não consegui abrir essa imagem. Escolha outra.') }
  finally { accountPhotoBusy = false }
})
$('#contaForm').addEventListener('submit', async e => {
  e.preventDefault()
  if (accountPhotoBusy) return toast('Aguarde a foto carregar')
  const btn = e.submitter; if (btn) btn.disabled = true
  try {
    if (ORIG[me.key]) {
      const r = await api('conta', { method: 'POST', body: { op: 'perfil', t: conta?.token, ...(accountPhoto !== undefined ? { foto: accountPhoto } : {}), cor: $('#contaCor').value } })
      if (!r?.ok) return toast('Não foi possível salvar seu perfil. Tente novamente.')
      applyPerfis((await api('conta?perfis=1'))?.perfis)
      refreshProfileUI()
      actions?.hello.send({ ...helloMsg(), perfilAtualizado: true })
    }
    Object.assign(prefs, { entryMuted: $('#prefMuted').checked, subs: $('#prefSubs').checked, spatial: $('#prefSpatial').checked, spatialVersion: 3, nudges: $('#prefNudges').checked })
    savePrefs(); applyPrefs()
    const saved = await api('prefs', { method: 'PUT', body: { k: me.key, prefs } })
    $('#contaModal').hidden = true
    toast(saved?.ok ? 'Conta e preferências salvas' : 'Preferências salvas neste navegador; sincronização pendente')
  } finally { if (btn) btn.disabled = false }
})
function refreshProfileUI() {
  renderAccountBadge(); renderSeats()
  for (const node of document.querySelectorAll('.msg[data-key]')) {
    const p = person(node.dataset.key)
    const img = node.querySelector('.msg__gutter .pfp'); if (img) img.replaceWith(pfpImg(p.id, 36))
    const name = node.querySelector('.msg__head b'); if (name) name.style.color = p.cor
  }
}
$('#contaClose').addEventListener('click', () => { $('#contaModal').hidden = true; $('#btnSettings').focus() })
$('#contaSair').addEventListener('click', logout)
for (const id of ['contaModal', 'inviteModal']) {
  $( '#' + id).addEventListener('click', e => { if (e.target.id === id) e.target.hidden = true })
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { $('#contaModal').hidden = true; $('#inviteModal').hidden = true }
})

/* ---------- Entrada, saída e processamento de voz ---------- */
let outputRequest = 0, micGeneration = 0
async function applyOutputDevice(device = '') {
  const request = ++outputRequest
  if (mix.ac?.setSinkId) await mix.ac.setSinkId(device)
  else if (device) throw new Error('Troca de saída não disponível neste navegador')
  if (myShare?.video?.setSinkId) await myShare.video.setSinkId(device)
  if (request !== outputRequest) return false
  return true
}
async function restartMic() {
  stopMicTest(true)
  if (!mic) return
  const muted = me.muted
  micOff()
  await micOn(false, muted)
}
async function changeAudioInput(value) {
  prefs.mic = value; savePrefs()
  await restartMic(); await listDevices()
}
async function updateVoice(values, profile = 'custom') {
  prefs.voiceProfile = profile; prefs.voiceSettings = cleanVoice(values); savePrefs()
  renderVoiceOptions()
  await restartMic()
}
const audioMenu = el('section', { className: 'pop audio-menu', id: 'audioMenu', hidden: true, role: 'dialog', ariaLabel: 'Entrada, saída e processamento de voz' })
audioMenu.innerHTML = `<header class="audio-menu__head"><span class="audio-menu__mark" title="Voz e áudio"><svg data-icon="headphones"></svg></span><button type="button" id="audioMenuClose" aria-label="Fechar" title="Fechar"><svg data-icon="x"></svg></button></header>
<label class="audio-menu__field" title="Escolha o microfone usado na sala"><span><svg data-icon="mic"></svg>Entrada</span><select id="audioInput" aria-label="Entrada de som"></select></label>
<div class="audio-menu__output"><label class="audio-menu__field" title="Escolha o fone ou a caixa de som"><span><svg data-icon="headphones"></svg>Saída</span><select id="audioOutput" aria-label="Saída de som"></select></label><button type="button" class="audio-menu__test" id="testOutput" title="Testar saída" aria-label="Testar saída"><svg data-icon="volume-2"></svg></button></div>
<label class="check" title="A posição de cada pessoa na sala dá direção à voz"><svg data-icon="headphones"></svg><span><b>Espacial</b></span><input id="audioSpatial" type="checkbox"></label>
<label class="audio-menu__field" title="Preservar voz evita cortar falas baixas"><span><svg data-icon="mic"></svg>Perfil</span><select id="voiceProfile"><option value="balanced">Preservar voz</option><option value="strong">Ruído intenso · vento</option><option value="raw">Sem filtros</option><option value="custom">Manual</option></select></label>
<label class="audio-menu__field" id="noiseEngineField" title="Escolha o processador de supressão de ruído"><span><svg data-icon="sliders-horizontal"></svg>Ruído</span><select id="noiseEngine"><option value="rnnoise">RNNoise</option><option value="gtcrn">GTCRN · mais forte</option><option value="browser">Navegador</option><option value="off">Desligado</option></select></label>
<div class="audio-menu__meter" title="Nível do sinal do microfone"><svg data-icon="mic"></svg><meter id="micLevel" aria-label="Nível do microfone" min="-75" max="0" low="-45" high="-10" optimum="-20" value="-75"></meter><small id="micLevelText">Mudo</small></div>
<div class="mic-test"><button type="button" id="testMic" data-state="idle" title="Gravar 3 segundos com os filtros atuais e ouvir só neste fone" aria-label="Testar microfone">
<span class="mic-test__dial"><svg class="mic-test__ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" pathLength="100"/></svg><span id="micTestGlyph"></span></span>
<span class="mic-test__copy"><b id="micTestTitle">Teste de voz</b><small id="micTestStatus" role="status">3s · só você</small></span><span id="micTestAction" aria-hidden="true"></span></button></div>
<details id="voiceAdvanced"><summary><svg data-icon="sliders-horizontal"></svg>Ajustes</summary>
<label class="audio-menu__range" title="Aumenta ou reduz o volume captado antes dos filtros"><span>Ganho <output id="inputGainOut"></output></span><input id="inputGain" aria-label="Ganho de entrada" type="range" min="-12" max="18" step="1"></label>
<label class="audio-menu__range" title="Remove vibrações e graves abaixo desta frequência"><span>Graves <output id="highpassOut"></output></span><input id="highpass" aria-label="Corte de graves" type="range" min="0" max="180" step="10"></label>
<label class="check" title="Fecha a entrada quando o sinal fica baixo. Desligue se sílabas estiverem sumindo"><svg data-icon="mic-off"></svg><span><b>Portão de voz</b></span><input id="gateEnabled" type="checkbox"></label>
<label class="audio-menu__range" title="Volume mínimo para abrir o portão"><span>Limiar <output id="gateThresholdOut"></output></span><input id="gateThreshold" aria-label="Limite de abertura" type="range" min="-75" max="-20" step="1"></label>
<label class="audio-menu__range" title="Tempo de silêncio antes de fechar o portão"><span>Espera <output id="gateHoldOut"></output></span><input id="gateHold" aria-label="Espera antes de fechar" type="range" min="150" max="1600" step="50"></label>
<label class="check" title="Reduz o retorno do som das caixas no microfone"><svg data-icon="volume-2"></svg><span><b>Eco</b></span><input id="echoCancel" type="checkbox"></label>
<label class="check" title="Mantém o volume de voz mais uniforme"><svg data-icon="sliders-horizontal"></svg><span><b>Ganho automático</b></span><input id="autoGain" type="checkbox"></label>
</details>`
audioMenu.querySelectorAll('svg[data-icon]').forEach(svg => setIcon(svg, svg.dataset.icon))
theater.append(audioMenu)
function renderVoiceOptions() {
  const settings = cleanVoice(prefs.voiceSettings)
  $('#voiceProfile').value = prefs.voiceProfile
  $('#noiseEngine').value = settings.engine
  $('#audioSpatial').checked = !!prefs.spatial
  $('#inputGain').value = settings.gain; $('#inputGainOut').textContent = settings.gain + ' dB'
  $('#highpass').value = settings.highpass; $('#highpassOut').textContent = settings.highpass ? settings.highpass + ' Hz' : 'Desligado'
  $('#gateEnabled').checked = settings.gate
  $('#gateThreshold').value = settings.threshold; $('#gateThresholdOut').textContent = settings.threshold + ' dB'
  $('#gateHold').value = settings.hold; $('#gateHoldOut').textContent = settings.hold + ' ms'
  $('#echoCancel').checked = settings.echo; $('#autoGain').checked = settings.agc
  $('#noiseEngineField').title = settings.engine === 'rnnoise' ? 'RNNoise faz a limpeza; a supressão do navegador fica desligada.' : settings.engine === 'gtcrn' ? 'GTCRN: limpa vento, ventilador e barulho forte. A voz fica um pouco menos aguda.' : settings.engine === 'browser' ? 'Usando a supressão nativa do navegador.' : 'Supressão desligada. Eco, ganho e portão são independentes.'
}
function clampAudioMenu() {
  if (audioMenu.hidden) return
  audioMenu.style.top = Math.max(8, Math.min(parseFloat(audioMenu.style.top) || 8, innerHeight - audioMenu.offsetHeight - 8)) + 'px'
  audioMenu.style.left = Math.max(8, Math.min(parseFloat(audioMenu.style.left) || 8, innerWidth - audioMenu.offsetWidth - 8)) + 'px'
}
$('#voiceAdvanced').addEventListener('toggle', clampAudioMenu)
addEventListener('resize', clampAudioMenu)
async function openAudioMenu(button, x, y) {
  closePops(audioMenu); audioMenu.hidden = false
  renderVoiceOptions(); await listDevices()
  const rect = button.getBoundingClientRect()
  const left = x ?? rect.left, top = y ?? rect.top - audioMenu.offsetHeight - 10
  audioMenu.style.left = Math.max(8, Math.min(left, innerWidth - audioMenu.offsetWidth - 8)) + 'px'
  audioMenu.style.top = Math.max(8, Math.min(top, innerHeight - audioMenu.offsetHeight - 8)) + 'px'
  clampAudioMenu(); audioMenu.scrollTop = 0
  $('#audioInput').focus()
}
for (const id of ['btnMic', 'btnDeaf']) {
  $('#' + id).addEventListener('contextmenu', e => { e.preventDefault(); openAudioMenu(e.currentTarget, e.clientX, e.clientY) })
  $('#' + id).title += ' · botão direito: voz e áudio'
}
for (const id of ['btnMicOptions', 'btnDeafOptions']) {
  const button = $('#' + id)
  button.addEventListener('click', () => {
    if (!audioMenu.hidden && button.getAttribute('aria-expanded') === 'true') return closePops()
    openAudioMenu(button)
    button.setAttribute('aria-expanded', 'true')
  })
}
$('#audioMenuClose').addEventListener('click', () => closePops())
$('#audioInput').addEventListener('change', e => changeAudioInput(e.target.value))
$('#audioOutput').addEventListener('change', async e => {
  const next = e.target.value, previous = prefs.output
  try { await applyOutputDevice(next); prefs.output = next; savePrefs(); toast('Saída de som atualizada') }
  catch { e.target.value = previous; await applyOutputDevice(previous).catch(() => {}); toast('Não consegui usar essa saída. Verifique a permissão de áudio do navegador.') }
})
$('#voiceProfile').addEventListener('change', e => {
  if (VOICE_PROFILES[e.target.value]) updateVoice(VOICE_PROFILES[e.target.value], e.target.value)
  else prefs.voiceProfile = 'custom'
})
$('#noiseEngine').addEventListener('change', e => updateVoice({ ...prefs.voiceSettings, engine: e.target.value }))
$('#audioSpatial').addEventListener('change', e => { prefs.spatial = e.target.checked; prefs.spatialVersion = 3; applyPrefs(); savePrefs() })
for (const [id, key, suffix] of [['inputGain','gain','dB'],['highpass','highpass','Hz'],['gateThreshold','threshold','dB'],['gateHold','hold','ms']]) {
  $('#' + id).addEventListener('input', e => $('#' + id + 'Out').textContent = e.target.value + ' ' + suffix)
  $('#' + id).addEventListener('change', e => updateVoice({ ...prefs.voiceSettings, [key]: +e.target.value }))
}
for (const [id, key] of [['gateEnabled','gate'],['echoCancel','echo'],['autoGain','agc']]) $('#' + id).addEventListener('change', e => updateVoice({ ...prefs.voiceSettings, [key]: e.target.checked }))
$('#testOutput').addEventListener('click', () => {
  const ac = audioCtx(), osc = ac.createOscillator(), gain = ac.createGain()
  osc.frequency.value = 440; gain.gain.setValueAtTime(0, ac.currentTime); gain.gain.linearRampToValueAtTime(.08, ac.currentTime + .02); gain.gain.linearRampToValueAtTime(0, ac.currentTime + .3)
  osc.connect(gain).connect(ac.destination); osc.start(); osc.stop(ac.currentTime + .32)
  osc.onended = () => { osc.disconnect(); gain.disconnect() }
})
// A gravação de teste usa uma saída privada dos mesmos filtros. Nunca vai para o WebRTC.
let micTest = null
function stopMicTest(restore = true) {
  const test = micTest
  if (!test) return
  micTest = null; clearTimeout(test.timer)
  if (!mic) micGeneration++
  if (test.recorder?.state === 'recording') test.recorder.stop()
  clearInterval(test.countdown)
  if (test.playback) { try { test.playback.source.stop() } catch {}; test.playback.disconnect() }
  if (restore) setMuted(test.wasMuted, true)
  renderMicTest('idle')
}
function renderMicTest(state, seconds = 3, progress = 0) {
  const button = $('#testMic')
  const previousState = button.dataset.state
  if (previousState !== state) button.dataset.state = state
  button.style.setProperty('--progress', progress)
  const glyph = $('#micTestGlyph')
  if (previousState !== state || !glyph.firstChild || (state === 'recording' && glyph.dataset.second !== String(seconds))) {
    glyph.replaceChildren(state === 'recording' ? el('b', { className: 'mic-test__digit', textContent: String(seconds) }) : icon(state === 'playing' ? 'headphones' : 'mic'))
    glyph.dataset.second = String(seconds)
  }
  if (previousState !== state || !$('#micTestAction').firstChild) {
    button.setAttribute('aria-label', state === 'idle' ? 'Testar microfone' : 'Cancelar teste')
    $('#micTestTitle').textContent = { idle: 'Teste de voz', loading: 'Preparando', recording: 'Gravando', playing: 'Sua voz' }[state]
    $('#micTestStatus').textContent = { idle: '3s · só você', loading: 'Um instante', recording: 'Fale agora', playing: 'Ouvindo' }[state]
    $('#micTestAction').replaceChildren(icon(state === 'idle' ? 'play' : 'square'))
    button.title = state === 'idle' ? 'Gravar 3 segundos com os filtros atuais e ouvir neste fone' : 'Cancelar teste'
  }
}
renderMicTest('idle')
async function testMicrophone() {
  if (micTest) return stopMicTest(true)
  if (typeof MediaRecorder === 'undefined') return toast('Este navegador não oferece gravação de teste')
  const test = { wasMuted: me.muted }
  micTest = test
  renderMicTest('loading')
  try {
    setMuted(true, true)
    if (!mic) await micOn(false, true)
    if (micTest !== test) return
    if (!mic?.testStream) throw new Error('Microfone indisponível')
    const chunks = []
    test.recorder = new MediaRecorder(mic.testStream)
    test.recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    test.recorder.onerror = () => { if (micTest === test) { stopMicTest(true); toast('Não consegui gravar o teste') } }
    test.recorder.onstop = async () => {
      if (micTest !== test) return
      clearInterval(test.countdown)
      try {
        const blob = new Blob(chunks, { type: test.recorder.mimeType })
        if (!blob.size) throw new Error('Gravação vazia')
        clearInterval(test.countdown)
        renderMicTest('loading')
        const ac = audioCtx()
        const buffer = await ac.decodeAudioData(await blob.arrayBuffer())
        if (micTest !== test) return
        test.playback = createCenteredPlayback(ac, buffer)
        test.playback.source.onended = () => { if (micTest === test) stopMicTest(true) }
        renderMicTest('playing')
        test.playback.source.start()

      } catch { if (micTest === test) { stopMicTest(true); toast('Não consegui reproduzir o teste. Confira sua saída de áudio.') } }
    }
    test.recorder.start()
    const began = performance.now()
    renderMicTest('recording', 3, 0)
    test.countdown = setInterval(() => {
      const elapsed = performance.now() - began
      renderMicTest('recording', Math.max(1, Math.ceil((3000 - elapsed) / 1000)), Math.min(1, elapsed / 3000))
    }, 50)
    test.timer = setTimeout(() => { if (micTest === test && test.recorder.state === 'recording') test.recorder.stop() }, 3000)
    clampAudioMenu()
  } catch { if (micTest === test) { stopMicTest(true); toast('Libere o microfone para fazer o teste') } }
}
$('#testMic').addEventListener('click', testMicrophone)

function updateMicMeter() {
  if (audioMenu.hidden) return
  const an = mic?.analyser
  const level = an && (!me.muted || micTest) ? dbOf(an) : -75
  $('#micLevel').value = Math.max(-75, level)
  $('#micLevelText').textContent = !mic || (me.muted && !micTest) ? 'Mudo' : Math.round(Math.max(-75, level)) + ' dB'
}

/* ---------- Painéis, chat, tela cheia e atalhos ---------- */
function closePops(except) {
  if (except !== audioMenu) stopMicTest(true)
  document.querySelectorAll('.pop, .pvol, .reactgrid, .msgpick').forEach(x => { if (x !== except) x.hidden = true })
  document.querySelectorAll('[aria-expanded]').forEach(b => b.setAttribute('aria-expanded', 'false'))
}
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('.player-controls')) {
    document.querySelectorAll('.player-settings').forEach(menu => menu.hidden = true)
    document.querySelectorAll('.player-controls [aria-expanded=true]').forEach(button => button.setAttribute('aria-expanded','false'))
  }
  if (!e.target.closest('.popwrap, .seat, .msg__acts, .ctxmenu, .audio-menu, .settings, .chat__canais')) closePops() })
$('#btnSettings').addEventListener('click', () => {
  const p = $('#settings'), open = p.hidden
  closePops(open ? p : null)
  if (open) { montaAjustes(); (imersivo() ? theater : document.body).append(p) } // janela no meio da tela (fora do topo)
  p.hidden = !open
  $('#btnSettings').setAttribute('aria-expanded', String(open))
  if (open) { listDevices(); renderSetPrefs(); admFaixa(); mostraAjuste(ajusteAtual) }
})
/* Configurações em janela (como no Discord): categorias à esquerda, a escolhida à direita */
let ajusteAtual = 'voz', ajustesMontados = false
const abreAjustes = () => { fechaLateral?.(); if ($('#settings').hidden) $('#btnSettings').click() }
function montaAjustes() {
  if (ajustesMontados) return
  ajustesMontados = true
  const st = $('#settings')
  const grupo = (id, ...nodes) => el('section', { className: 'cfg-g', id: 'cfg-' + id }, ...nodes.filter(Boolean))
  const vozH = [...st.querySelectorAll(':scope > h3')].find(h => /voz/i.test(h.textContent))
  vozH?.remove()
  const g = {
    conta: grupo('conta', el('h2', { textContent: 'Minha conta' }), $('#btnConta'), $('#logout')),
    voz: grupo('voz', el('h2', { textContent: 'Voz' }), st.querySelector(':scope > .seg'), $('#pttRow'), $('#micDevice').closest('.srow'),
      (() => { const b = el('button', { type: 'button', className: 'btn btn--ghost btn--block' }, icon('sliders-horizontal'), el('span', { textContent: 'Entrada, saída e filtros de voz' })); b.addEventListener('click', e => { closePops(); openAudioMenu($('#btnMic'), innerWidth / 2 - 175, innerHeight / 2 - 250) }); return b })()),
    ajustes: grupo('ajustes', el('h2', { className: 'cfg-titulo' }), $('#setPrefs')),
    admin: grupo('admin', el('h2', { textContent: 'Admin' }), $('#admLogin'), $('#admTools')),
  }
  $('#admHeading')?.remove()
  const NAV = [['conta', 'Minha conta', 'user'], ['voz', 'Voz', 'mic'], ['Som', 'Som', 'volume-2'], ['Tela', 'Tela', 'monitor'], ['Netflix', 'Netflix', 'film'], ['Rádio', 'Rádio', 'music'], ['admin', 'Admin', 'lock']]
  const nav = el('aside', { className: 'cfg-nav' }, el('small', { textContent: 'Configurações' }), ...NAV.map(([id, nome, ic]) => {
    const b = el('button', { type: 'button', className: 'cfg-nav__b' }, icon(ic), el('span', { textContent: nome }))
    b.dataset.aj = id
    b.addEventListener('click', () => mostraAjuste(id))
    return b
  }))
  const x = el('button', { type: 'button', className: 'cfg-x', title: 'Fechar (Esc)', ariaLabel: 'Fechar' }, icon('x'))
  x.addEventListener('click', () => closePops())
  st.replaceChildren(nav, el('div', { className: 'cfg-corpo' }, ...Object.values(g)), x)
  st.classList.add('cfg')
}
function mostraAjuste(id) {
  ajusteAtual = id
  const sub = ['Som', 'Tela', 'Netflix', 'Rádio'].includes(id)
  if (sub) { abaAjustes = id; renderSetPrefs(); $('#cfg-ajustes .cfg-titulo').textContent = id }
  document.querySelectorAll('#settings .cfg-g').forEach(g => { g.hidden = g.id !== 'cfg-' + (sub ? 'ajustes' : id) })
  document.querySelectorAll('#settings .cfg-nav__b').forEach(b => {
    b.classList.toggle('on', b.dataset.aj === id)
    if (b.dataset.aj === 'admin') b.hidden = me.key !== 'kellyson'
  })
}
// admin: a resposta do Faixa a Faixa que está tocando (borrada até passar o mouse); atualiza enquanto o painel está aberto
function admFaixa() {
  const box = $('#admFaixa'), r = !$('#admTools').hidden && faixa?.resposta?.()
  box.hidden = !r
  if (r) { $('#admFaixaRot').textContent = `Faixa a Faixa · música ${r.i}/${r.n}`; $('#admFaixaResp').textContent = `${r.t} — ${r.a}${r.ano ? ` (${r.ano})` : ''}` }
}
setInterval(() => { if (!$('#settings').hidden) admFaixa() }, 1000)
// Preferências rápidas no menu de configurações (as mesmas do mixer e da conta, sempre sincronizadas)
function setToggle(texto, dica, get, set) {
  const cb = el('input', { type: 'checkbox', checked: !!get() })
  cb.addEventListener('change', () => { set(cb.checked); savePrefs() })
  return el('label', { className: 'setp' }, el('span', {}, el('b', { textContent: texto }), dica ? el('small', { textContent: dica }) : ''), cb)
}
function setVol(texto, get, set, max = 1) {
  const r = el('input', { type: 'range', min: 0, max, step: .01, value: get(), ariaLabel: texto })
  const o = el('output', { textContent: pct(get()) })
  r.addEventListener('input', () => { set(+r.value); o.textContent = pct(+r.value) })
  return el('label', { className: 'setp setp--vol' }, el('span', {}, el('b', { textContent: texto })), r, o)
}
// Ajustes em abas (Som, Tela, Netflix, Rádio); lembra a última aba aberta
let abaAjustes = 'Som'
function renderSetPrefs() {
  const box = $('#setPrefs')
  const ABAS = [
    ['Som', () => [
  setVol('Volume geral', () => prefs.master ?? 1, v => { prefs.master = v; applyPrefs(); savePrefs() }),
  setToggle('Entrar com o microfone mutado', '', () => prefs.entryMuted, v => { prefs.entryMuted = v; const c = $('#prefMuted'); if (c) c.checked = v }),
  setToggle('Baixar o filme quando alguém fala', 'Volta ao normal quando a conversa para', () => prefs.duck, v => { prefs.duck = v; $('#duckOpt').checked = v; updateDucking() }),
  setToggle('Áudio espacial', 'Cada voz vem do lado da poltrona (melhor com fone)', () => prefs.spatial, v => { prefs.spatial = v; prefs.spatialVersion = 3; $('#spatialOpt').checked = v; if ($('#audioSpatial')) $('#audioSpatial').checked = v; updatePans() }),
  setToggle('Sons de aviso', 'Entrou, saiu, mensagem nova', () => prefs.sfx > 0, v => { if (!v && prefs.sfx > 0) prefs.sfxAntes = prefs.sfx; prefs.sfx = v ? (prefs.sfxAntes || .6) : 0; applyPrefs() })
    ]],
    ['Tela', () => [
  setToggle('Legendas', '', () => prefs.subs, v => { if (!!prefs.subs !== v) $('#btnSubs').click() }),
  setToggle('Modo teatro', 'Tela mais larga, chat embaixo (T)', () => prefs.teatro, v => setTeatro(v)),
  setToggle('Chat fixo na tela cheia', 'Em vez de flutuar por cima do vídeo', () => prefs.chatFixo, v => setChatFixo(v)),
  setToggle('Avisos de volume', 'Sugere ajustes quando o filme abafa a conversa', () => prefs.nudges, v => { prefs.nudges = v; $('#nudgeOpt').checked = v }),
  setToggle('Avisar sobre bordas pretas', 'Oferece cortar as tarjas da projeção', () => prefs.avisoBordas !== false, v => { prefs.avisoBordas = v })
    ]],
    ['Netflix', () => [
  setToggle('Pular aberturas sozinho', 'Na Netflix, com a extensão: abertura e resumo são pulados sem precisar clicar', () => !!prefs.nfxPular, v => { prefs.nfxPular = v }),
  setToggle('Todo mundo controla a minha Netflix', (nfx.ext ? 'Extensão conectada. ' : 'Precisa da extensão (cineminha-boo.vercel.app/baixar/extensao). ') + 'Play, pausa e pular valem para todos; desligado, só você controla', () => prefs.nfxTodos !== false, v => { prefs.nfxTodos = v; if (myShare) { actions?.share.send(shareMsg()); updatePlayer(selfId) } })
    ]],
    ['Rádio', () => [
  setVol('Volume da rádio', () => radio.getVol(), v => { radio.setVol(v); try { syncRadioVol() } catch {} }),
  setToggle('Spotify pelo YouTube', 'Música inteira, sem login e com volume', () => radio.getFonte() !== 'sp', v => radio.setFonte(v ? 'yt' : 'sp'))
    ]]
  ]
  const abas = el('div', { className: 'setp-abas', role: 'tablist' }, ...ABAS.map(([n]) => {
    const b = el('button', { type: 'button', role: 'tab', className: 'setp-aba', textContent: n, ariaSelected: String(n === abaAjustes) })
    b.addEventListener('click', () => { abaAjustes = n; renderSetPrefs() }); return b
  }))
  const atual = ABAS.find(([n]) => n === abaAjustes) || ABAS[0]
  box.replaceChildren(abas, el('div', { className: 'setp-painel', role: 'tabpanel' }, ...atual[1]()))
}

const chatVisible = () => !theater.classList.contains('no-chat')
function setChat(show, quiet) {
  theater.classList.toggle('no-chat', !show)
  setIcon(iconOf($('#btnChat')), show ? 'message-square' : 'message-square-off')
  if (!quiet) { prefs.chat = show; savePrefs() }
}
$('#btnChat').addEventListener('click', () => setChat(!chatVisible()))
// Modo teatro (como no YouTube): tela ocupa a largura, chat desce para baixo dela
function setTeatro(on, quiet) {
  theater.classList.toggle('teatro', on)
  $('#btnTeatro').setAttribute('aria-pressed', String(on))
  if (!quiet) { prefs.teatro = on; savePrefs() }
  tiles.forEach(t => t.fit?.())
}
$('#btnTeatro').addEventListener('click', () => setTeatro(!theater.classList.contains('teatro')))

// Palco: a página inteira vira a tela (o jogo ou o filme), sem a tela cheia do navegador. Mesmo layout da tela cheia.
const imersivo = () => !!document.fullscreenElement || theater.classList.contains('palco')
function setPalco(on) {
  if (on === theater.classList.contains('palco')) return
  theater.classList.toggle('palco', on)
  setTimeout(arrumaBarra, 50)
  document.body.classList.toggle('palco-on', on)
  $('#btnPalco').setAttribute('aria-pressed', String(on))
  setIcon(iconOf($('#btnPalco')), on ? 'minimize' : 'maximize-2')
  closePops()
  tiles.forEach(t => t.fit?.())
  if (on) {
    theater.querySelector('.palco-aviso')?.remove()
    theater.append(el('div', { className: 'palco-aviso', innerHTML: 'Palco · <b>duplo clique no fundo</b>, <b>Esc</b> ou <b>G</b> para voltar' }))
    setTimeout(() => theater.querySelector('.palco-aviso')?.remove(), 3300)
    poke()
  } else theater.classList.remove('idle')
}
$('#btnPalco').addEventListener('click', () => setPalco(!theater.classList.contains('palco')))
// duplo clique no jogo (no fundo, não em carta ou botão) entra no palco; duplo clique fora do jogo sai
const INTERATIVO = 'button, a, input, textarea, select, label, [role=button], [class*="carta"], .clicavel, .cp-tocavel, .cp-roda, .mesas, .tile__tools, .player-controls, .chat, .toolbar, .row, .seat'
theater.addEventListener('dblclick', e => {
  if (e.target.closest(INTERATIVO)) return
  const noJogo = !!e.target.closest('#screenInner') && Object.values(JOGOS).some(J => theater.classList.contains(J.on))
  if (theater.classList.contains('palco')) setPalco(false)
  else if (noJogo) { getSelection()?.removeAllRanges(); setPalco(true) }
})
function toggleFs() {
  if (document.fullscreenElement) return document.exitFullscreen()
  theater.requestFullscreen?.().catch(() => {})
}
$('#btnFs').addEventListener('click', toggleFs)
document.addEventListener('fullscreenchange', () => {
  const fs = !!document.fullscreenElement
  closePops()
  $(fs ? '#settingsFsHome' : '#settingsHome').append($('#settingsWrap'))
  for (const id of ['contaModal', 'inviteModal', 'diaryModal']) (fs ? theater : document.body).append($('#' + id))
  setIcon(iconOf($('#btnFs')), document.fullscreenElement ? 'minimize' : 'maximize')
  poke()
})
// Em tela cheia, controles somem quando o mouse para
let idleTimer
function poke() {
  arrumaBarra()
  theater.classList.remove('idle')
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (!imersivo()) return
    // só segura a barra se estiver escrevendo de verdade (campo com texto) ou digitou há pouco
    const f = document.activeElement
    const typing = f?.matches('input:not([type=range]), textarea') && (f.value.trim() || performance.now() - lastKey < 4000)
    const panelOpen = [...document.querySelectorAll('.pop, .pvol, .reactgrid, #gifs, .player-settings, .jogosmenu')].some(x => !x.hidden)
    if (typing || panelOpen) return poke()
    if (theater.contains(document.activeElement)) document.activeElement.blur()
    theater.classList.add('idle')
  }, matchMedia('(pointer: coarse)').matches ? 5000 : 2500)
}
// Tela cheia em uma linha só: bonecos à esquerda, barrinha do vídeo no meio, botões à direita.
// A barrinha ocupa o que sobra entre os dois; com muita gente na fileira e pouco espaço, ela sobe.
// Em tela cheia, microfone e som saem da barra da direita e ficam logo depois dos bonecos:
// bonecos | mic e som | barrinha do vídeo | outros botões
const vozEl = el('div', { className: 'toolbar toolbar--voz' }), vozCasa = document.createComment('voicectl')
function moveVoz() {
  const v = document.querySelector('.voicectl')
  if (!v) return
  if (imersivo() && !vozEl.contains(v)) { v.before(vozCasa); vozEl.append(v); theater.append(vozEl) }
  else if (!imersivo() && vozEl.contains(v)) { vozCasa.replaceWith(v); vozEl.remove() }
}
function arrumaBarra() {
  moveVoz(); try { moveProjetar() } catch {}
  if (!imersivo()) { theater.classList.remove('barra-acima'); return }
  const row = theater.querySelector('.row__seats'), tb = theater.querySelector('.toolbar:not(.toolbar--voz)')
  const W = theater.clientWidth, rr = row?.getBoundingClientRect(), tr = tb?.getBoundingClientRect(), th = theater.getBoundingClientRect()
  vozEl.style.left = (rr?.width ? rr.right - th.left + 12 : 16) + 'px'
  const vr = vozEl.getBoundingClientRect()
  const esq = vr.width ? vr.right - th.left + 12 : rr?.width ? rr.right - th.left + 14 : 16, dir = tr?.width ? th.right - tr.left + 12 : 16
  theater.style.setProperty('--tbh', (tr?.height || 52) + 'px')
  theater.classList.toggle('barra-acima', W - esq - dir < 420)
  // a barrinha mora dentro de cada tela: converte para as bordas dela
  for (const t of tiles.values()) {
    const r = t.el.getBoundingClientRect()
    t.el.style.setProperty('--esq', Math.max(8, esq - (r.left - th.left)) + 'px')
    t.el.style.setProperty('--dir', Math.max(8, dir - (th.right - r.right)) + 'px')
    t.el.style.setProperty('--bb', Math.max(0, (tr ? r.bottom - tr.bottom : 12)) + 'px')
  }
}
new ResizeObserver(arrumaBarra).observe(theater)
setTimeout(() => { const r = theater.querySelector('.row__seats'), t = theater.querySelector('.toolbar'); const o = new ResizeObserver(arrumaBarra); r && o.observe(r); t && o.observe(t); o.observe(vozEl) }, 0)
document.addEventListener('fullscreenchange', () => setTimeout(arrumaBarra, 50))
// Em tela cheia, a barra só acorda com o mouse perto dela (faixa de baixo, ou de cima quando a barra
// fica no topo) ou em cima da barra/chat; mexer o mouse no meio do filme não mostra nada.
function naZonaDaBarra(e) {
  if (e.target.closest?.('.toolbar, .toolbar--voz, .chat, .pop, .jogosmenu, .trocajogo, .player-controls, .player-settings, .midia-card')) return true
  const r = (theater.querySelector('.toolbar') || $('.toolbar'))?.getBoundingClientRect()
  const faixa = Math.max(110, (r?.height || 50) + 70)
  if (e.clientY < 130 && e.clientX < 520) return true // canto do "passando agora"
  return r && r.top < innerHeight / 2 ? e.clientY < faixa : e.clientY > innerHeight - faixa
}
theater.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && (!imersivo() || naZonaDaBarra(e))) poke() })
let lastKey = 0
document.addEventListener('keydown', () => { lastKey = performance.now(); if (imersivo()) poke() }, true)
// janela sem foco ou mouse fora: esconde na hora (se não estiver escrevendo)
function idleNow() {
  if (!imersivo()) return
  const f = document.activeElement
  if (f?.matches('input:not([type=range]), textarea') && f.value.trim()) return
  clearTimeout(idleTimer); theater.classList.add('idle')
}
window.addEventListener('blur', idleNow)
document.documentElement.addEventListener('mouseleave', idleNow)
// chat em tela cheia: flutuante (metade de baixo, translúcido) ou fixo à direita
function setChatFixo(on, quiet) {
  theater.classList.toggle('chat-fixo', on)
  $('#chatModo').title = on ? 'Deixar o chat flutuando sobre o vídeo' : 'Fixar o chat à direita'
  setIcon($('#chatModo').firstChild, on ? 'maximize-2' : 'panel-right')
  if (!quiet) { prefs.chatFixo = on; savePrefs() }
  tiles.forEach(t => t.fit?.())
}
$('#chatModo').addEventListener('click', () => setChatFixo(!theater.classList.contains('chat-fixo')))
// toque: com a barra escondida, o primeiro toque só mostra os controles (não clica no que está embaixo)
let wokeAt = 0
theater.addEventListener('pointerdown', e => {
  if (theater.classList.contains('idle')) { wokeAt = Date.now(); for (const t of tiles.values()) if (t.el.contains(e.target)) t.reveal?.() }
  poke()
}, true)
theater.addEventListener('click', e => { if (Date.now() - wokeAt < 500) { e.stopPropagation(); e.preventDefault() } }, true)

// Aperte para falar
let pttDown = false, capturingKey = false
$('#pttKey').addEventListener('click', () => { capturingKey = true; $('#pttKey').textContent = 'Aperte…' })
document.querySelectorAll('input[name=vmode]').forEach(r => r.addEventListener('change', () => {
  prefs.vmode = r.value; savePrefs(); applyPrefs()
  toast(r.value === 'ptt' ? `Segure ${prefs.pttLabel} para falar` : 'Microfone aberto')
}))
document.addEventListener('keydown', e => {
  if (capturingKey) {
    e.preventDefault(); capturingKey = false
    if (e.key !== 'Escape') { prefs.pttKey = e.code; prefs.pttLabel = e.key.length === 1 ? e.key.toUpperCase() : e.key; savePrefs() }
    return applyPrefs()
  }
  if (e.target.matches('input:not([type=range]), textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return
  if (prefs.vmode === 'ptt' && e.code === prefs.pttKey) { e.preventDefault(); if (!pttDown) { pttDown = true; renderMic() } return }
  // ← → voltam/avançam 5 s no vídeo controlável (o em foco, ou o único arquivo/Netflix na sala)
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.matches('input[type=range]')) {
    const ctrl = id => { const i = playerInfo(id); return i?.kind === 'arquivo' || (id === selfId ? !!nfxDe(myShare) : !!i?.nfx) }
    const ids = [...tiles.keys()].filter(ctrl), id = focusId && ctrl(focusId) ? focusId : ids.length === 1 ? ids[0] : null
    if (id) { e.preventDefault(); playerCommand(id, 'seek', e.key === 'ArrowLeft' ? -5 : 5); tiles.get(id)?.reveal?.() }
    return
  }
  if (e.repeat) return
  const k = e.key.toLowerCase()
  if (k === 'f') toggleFs()
  else if (k === 'c') setChat(!chatVisible())
  else if (k === 't') setTeatro(!theater.classList.contains('teatro'))
  else if (k === 'g') setPalco(!theater.classList.contains('palco'))
  else if (/^[1-9]$/.test(k)) react(REACTS[+k - 1]?.id)
  else if (k === 'r') toggleReactGrid()
  else if (k === 'm') toggleMute()
  else if (k === 'd') setDeaf(!me.deaf)
  else if (k === 'p') askPause()
  else if (e.key === 'Escape') { if (theater.classList.contains('palco') && !document.querySelector('.pop:not([hidden]), .reactgrid:not([hidden]), #gifs:not([hidden])')) setPalco(false); else closePops() }
  else if (e.key === 'Enter' && chatVisible()) { e.preventDefault(); $('#chatInput').focus() }
})
document.addEventListener('keyup', e => { if (e.code === prefs.pttKey && pttDown) { pttDown = false; renderMic() } })
window.addEventListener('blur', () => { if (pttDown) { pttDown = false; renderMic() } })

/* ---------- Reações (saem da cabeça do boneco) ----------
   Item: { e: código Noto } = emoji animado, ou { k: ícone Lucide, c: cor } (temas antigos). */
const REACTS = (CFG.reacoes || EMOJI).map(r => ({ ...r, id: r.e || r.k }))
const REACT_BY = Object.fromEntries(REACTS.map(r => [r.id, r]))
const EMO_BY = Object.fromEntries(EMOJI.map(r => [r.e, { ...r, id: r.e }]))
const MEME_LIST = CFG.memes || MEMES
const MEME_BY = Object.fromEntries(MEME_LIST.map(m => [m.id, m]))
function reactArt(def, size, still) {
  if (def.e) {
    const img = el('img', { className: 'remoji', src: `reacoes/emoji/${def.e}.${still ? 'png' : 'webp'}`, alt: def.label, width: size, height: size, draggable: false })
    if (still) img.onerror = () => { img.onerror = null; img.src = `reacoes/emoji/${def.e}.webp` }
    return img
  }
  const s = icon(def.k)
  s.style.cssText = `color:${def.c || 'currentColor'};width:${size}px;height:${size}px`
  return s
}
const fxEl = $('#fx')
// Ponto da cabeça do boneco (relativo ao #theater)
function headPos(key) {
  const node = seatNodes.get(key)
  const art = node?.classList.contains('online') && node.querySelector('.seat__avatar img, .seat__avatar .pfp')
  if (!art || !art.getClientRects().length) return null
  const r = art.getBoundingClientRect(), t = theater.getBoundingClientRect()
  const boneco = !node.classList.contains('seat--pfp')
  return { x: r.left - t.left + r.width * (boneco ? .42 : .5), y: r.top - t.top + r.height * (boneco ? .08 : 0) }
}
function fallbackPos() {
  const r = $('#screenInner').getBoundingClientRect(), t = theater.getBoundingClientRect()
  return { x: r.right - t.left - 60 - Math.random() * 120, y: r.bottom - t.top - 20 }
}
let reactCount = 0
const clapAt = new Map()
function showReact(id, key) {
  const def = REACT_BY[id]
  if (!def) return
  reactCount++
  if (def.e === '1f44f') {
    setPose(key, 'palmas', 2600)
    // som de aplauso: um por pessoa a cada 2,5 s (segurar a tecla não vira metralhadora)
    if (Date.now() - (clapAt.get(key) || 0) > 2500) { clapAt.set(key, Date.now()); sfx('palmas', key) }
  }
  else if (def.e === '1f37f') setPose(key, 'pipoca', 4500)
  const old = fxEl.querySelectorAll('.fx__react')
  if (old.length > 50) old[0].remove()
  const p = headPos(key) || fallbackPos()
  const r = el('div', { className: 'fx__react' }, reactArt(def, 46))
  const dur = 2.3 + Math.random() * .9
  r.style.cssText = `left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px;--dx:${(Math.random() * 70 - 35).toFixed(0)}px;--rot:${(Math.random() * 30 - 15).toFixed(0)}deg;--s:${(.8 + Math.random() * .35).toFixed(2)};animation-duration:${dur.toFixed(2)}s`
  r.addEventListener('animationend', () => r.remove())
  fxEl.append(r)
}
const memeShown = new Map() // key -> cartão na tela (um por pessoa)
function showMeme(id, key) {
  const m = MEME_BY[id]
  if (!m) { if (/^u-[a-f0-9]{24}$/.test(id) && !showMeme.tried?.has(id)) { (showMeme.tried ||= new Set()).add(id); loadMemesUser(true).then(() => showMeme(id, key)) } return }
  reactCount++
  memeShown.get(key)?.remove()
  const p = headPos(key) || fallbackPos()
  const w = Math.min(200, theater.clientWidth * .3)
  const x = Math.max(8, Math.min(theater.clientWidth - w - 8, p.x - w * .25))
  const card = el('div', { className: 'fx__meme' }, el('img', { src: m.src, alt: m.label, draggable: false }))
  card.style.cssText = `left:${x.toFixed(0)}px;top:${p.y.toFixed(0)}px;width:${w.toFixed(0)}px;--ox:${(p.x - x).toFixed(0)}px;--rot:${(Math.random() * 8 - 4).toFixed(1)}deg`
  card.addEventListener('animationend', () => card.remove())
  memeShown.set(key, card)
  fxEl.append(card)
}
let lastReact = 0, lastMeme = 0
const memeFrom = new Map()
function react(id) {
  if (!id || !REACT_BY[id]) return
  const now = performance.now()
  if (now - lastReact < 140) return
  lastReact = now
  showReact(id, me.key)
  actions?.react.send({ k: id })
}
function sendMeme(id) {
  if (Date.now() - lastMeme < 5000) return toast('Calma, um meme de cada vez', 1600)
  lastMeme = Date.now()
  showMeme(id, me.key)
  actions?.react.send({ m: id })
  toggleReactGrid(false)
}
function gotReact(d, peerId) {
  const key = peers.get(peerId)?.key
  if (d?.stop) { if (liveSounds.size) { stopSounds(); toast(`${peers.get(peerId)?.name || 'Alguém'} parou o som`, 1800) } return }
  if (typeof d?.s === 'string') {
    if (Date.now() - (soundFrom.get(peerId) || 0) < 2500) return
    soundFrom.set(peerId, Date.now())
    return playSound(d.s, String(d.n || '').slice(0, 40), key)
  }
  if (typeof d?.m === 'string') {
    if (Date.now() - (memeFrom.get(peerId) || 0) < 3000) return
    memeFrom.set(peerId, Date.now())
    return showMeme(d.m, key)
  }
  showReact(d?.k, key)
}
const rgrid = $('#reactGrid')
REACTS.forEach((def, i) => {
  const art = reactArt(def, 34, true)
  const b = el('button', { type: 'button', className: 'reactgrid__item', title: def.label + (i < 9 ? ` (${i + 1})` : '') }, art, el('span', { textContent: def.label }))
  if (def.e) {
    b.addEventListener('pointerenter', () => { art.src = `reacoes/emoji/${def.e}.webp` })
    b.addEventListener('pointerleave', () => { art.src = `reacoes/emoji/${def.e}.png` })
  }
  let hold, first
  const stop = () => { clearTimeout(first); clearInterval(hold) }
  b.addEventListener('pointerdown', e => { e.preventDefault(); react(def.id); first = setTimeout(() => { hold = setInterval(() => react(def.id), 150) }, 300) })
  ;['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop))
  b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); react(def.id) } })
  $('#reactEmoji').append(b)
})
function memeButton(m) {
  const b = el('button', { type: 'button', className: 'reactgrid__meme', title: m.label + (m.byName ? ` · por ${m.byName}` : '') }, el('img', { src: m.src, alt: m.label, loading: 'lazy', draggable: false }))
  b.dataset.id = m.id
  b.addEventListener('click', () => sendMeme(m.id))
  // quem adicionou pode apagar (botão direito / segurar)
  if (m.by) b.addEventListener('contextmenu', async e => {
    if (m.by !== me.key) return
    e.preventDefault()
    if (!window.confirm(`Apagar o meme “${m.label}”?`)) return
    const r = await api('chat', { method: 'POST', body: { r: roomId, memeDel: m.id, key: me.key } })
    if (!r?.ok) return toast('Não consegui apagar.')
    delete MEME_BY[m.id]; b.remove(); toast('Meme apagado', 1500)
  })
  b._busca = semAcento(`${m.label} ${m.id.replace(/-/g, ' ')} ${m.tags || ''} ${m.byName || ''}`)
  return b
}
MEME_LIST.forEach(m => $('#reactMemes').append(memeButton(m)))
// memes que o pessoal adicionou: ficam no servidor e valem para todas as salas
let memesUser = 0
async function loadMemesUser(force) {
  if (!force && Date.now() - memesUser < 30000) return
  memesUser = Date.now()
  const r = await api('chat?memes=1')
  if (!r?.list) return
  const grid = $('#reactMemes')
  for (const raw of r.list.slice().reverse()) {
    const m = { ...raw, src: `api/chat?img=${raw.id.slice(2)}` }
    if (MEME_BY[m.id]) continue
    MEME_BY[m.id] = m
    grid.insertBefore(memeButton(m), $('#memeAdd').nextSibling)
  }
  $('#memesQ').dispatchEvent(new Event('input'))
}
loadMemesUser(true)
let memeNovo = null
$('#memeAdd').addEventListener('click', () => $('#memeFile').click())
$('#memeFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''
  if (!f?.type?.startsWith('image/')) return
  if (f.size > 25e6) return toast('Imagem grande demais.')
  let data = ''
  if (f.type === 'image/gif' && f.size < 650e3) data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f) })
  else {
    const bmp = await createImageBitmap(f).catch(() => null)
    if (!bmp) return toast('Não consegui abrir essa imagem.')
    for (const [max, q] of [[560, .85], [460, .75], [360, .65]]) {
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
      const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) })
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
      data = c.toDataURL('image/webp', q)
      if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/jpeg', q)
      if (data.length < 650e3) break
    }
  }
  memeNovo = data
  $('#memeNovoImg').src = data
  $('#memeNovoNome').value = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 40)
  $('#memeNovoTags').value = ''
  $('#memeNovo').hidden = false
  $('#memeNovoNome').select()
})
$('#memeNovoCancel').addEventListener('click', () => { memeNovo = null; $('#memeNovo').hidden = true })
$('#memeNovo').addEventListener('submit', async e => {
  e.preventDefault()
  const label = $('#memeNovoNome').value.trim()
  if (!memeNovo || !label) return
  const btn = $('#memeNovoSalvar'); btn.disabled = true
  const r = await api('chat', { method: 'POST', body: { r: roomId || 'xxxxxx', meme: { img: memeNovo, label, tags: $('#memeNovoTags').value, key: me.key, name: me.name } } })
  btn.disabled = false
  if (!r?.id) return toast('Não consegui salvar o meme.')
  const m = { ...r, src: `api/chat?img=${r.id.slice(2)}` }
  MEME_BY[m.id] = m
  $('#reactMemes').insertBefore(memeButton(m), $('#memeAdd').nextSibling)
  memeNovo = null; $('#memeNovo').hidden = true
  toast(`Meme “${label}” adicionado para todo mundo`, 2200)
})
function semAcento(t) { return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() }
// busca de memes: por nome e palavras-chave, sem ligar para acento
$('#memesQ').addEventListener('input', () => {
  const words = semAcento($('#memesQ').value).split(/\s+/).filter(Boolean)
  let n = 0
  for (const b of $('#reactMemes').children) { if (!b._busca) continue; const ok = words.every(w => b._busca.includes(w)); b.hidden = !ok; n += ok }
  $('#memesNada').hidden = n > 0
})
document.querySelectorAll('.reactgrid__tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.reactgrid__tab').forEach(x => x.setAttribute('aria-selected', String(x === t)))
  $('#reactEmoji').hidden = t.dataset.tab !== 'emoji'
  $('.reactgrid__credit').hidden = t.dataset.tab !== 'emoji'
  $('#reactMemesBox').hidden = t.dataset.tab !== 'memes'
  if (t.dataset.tab === 'memes') { $('#memesQ').focus(); loadMemesUser() }
  $('#reactSons').hidden = t.dataset.tab !== 'sons'
  if (t.dataset.tab === 'sons') { loadSons(); $('#sonsQ').focus() }
}))
function toggleReactGrid(open = rgrid.hidden) {
  closePops(open ? rgrid : null)
  rgrid.hidden = !open
  $('#btnReact').setAttribute('aria-expanded', String(open))
}
$('#btnReact').addEventListener('click', () => toggleReactGrid())
// Passar o mouse no botão de reações: atalhos para ir direto a Reações, Memes ou Sons
const atalhoReact = el('div', { className: 'react-atalho', hidden: true }, ...[['emoji', '😀', 'Reações'], ['memes', '🖼️', 'Memes'], ['sons', '🔊', 'Sons']].map(([tab, e, nome]) => {
  const b = el('button', { type: 'button', title: nome }, el('i', { textContent: e }), el('span', { textContent: nome }))
  b.addEventListener('click', () => { atalhoReact.hidden = true; toggleReactGrid(true); document.querySelector(`.reactgrid__tab[data-tab="${tab}"]`)?.click() })
  return b
}))
$('#btnReact').closest('.popwrap').append(atalhoReact)
let atalhoT = 0
const mostraAtalho = on => { clearTimeout(atalhoT); atalhoT = setTimeout(() => { atalhoReact.hidden = !on || !rgrid.hidden }, on ? 260 : 220) }
$('#btnReact').addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') mostraAtalho(true) })
$('#btnReact').addEventListener('pointerleave', () => mostraAtalho(false))
atalhoReact.addEventListener('pointerenter', () => clearTimeout(atalhoT))
atalhoReact.addEventListener('pointerleave', () => mostraAtalho(false))
$('#btnReact').addEventListener('click', () => { clearTimeout(atalhoT); atalhoReact.hidden = true })

/* ---------- Soundboard (MyInstants): o som toca para todos, no canal "Sons" da mesa de som ---------- */
const soundFrom = new Map(), soundBuf = new Map()
let lastSound = 0, sonsReq = 0, sonsTimer
const okSound = f => /^\/media\/sounds\/[\w.%()+-]{1,160}\.mp3$/i.test(f)
/* Volume justo: mede o som (nível das partes altas e pico) e ajusta para ficar perto do nível de diálogo,
   sem estourar. O limitador do canal segura o que ainda passar. */
const SOUND_TARGET = .11 // ≈ -19 dBFS nas partes altas: mesmo nível das vozes e do filme
function measureSound(buf) {
  const n = buf.numberOfChannels, len = buf.length, win = Math.max(1, Math.round(buf.sampleRate * .05))
  const ch = Array.from({ length: n }, (_, i) => buf.getChannelData(i))
  let peak = 0
  const rms = []
  for (let s = 0; s < len; s += win) {
    const e = Math.min(len, s + win)
    let sum = 0
    for (let i = s; i < e; i++) for (const c of ch) { const x = c[i]; sum += x * x; const a = x < 0 ? -x : x; if (a > peak) peak = a }
    rms.push(Math.sqrt(sum / ((e - s) * n)))
  }
  const loud = rms.filter(r => r > 1e-4).sort((a, b) => a - b)
  const level = loud.length ? loud[Math.floor(loud.length * .9)] : 0
  let g = level ? SOUND_TARGET / level : 1
  g = Math.min(g, 4) // som baixinho sobe até 4×
  if (peak * g > .9) g = .9 / peak // pico abaixo de -1 dB (o limitador segura o resto)
  return g
}
async function getSound(f) {
  let s = soundBuf.get(f)
  if (!s) {
    const buf = await audioCtx().decodeAudioData(await (await fetch('api/sons?f=' + encodeURIComponent(f))).arrayBuffer())
    s = { buf, g: measureSound(buf) }
    soundBuf.set(f, s)
  }
  return s
}
// toca com entrada e saída suaves (sem estalo) e no máximo 10 s
function startSound({ buf, g }, dest) {
  const ac = audioCtx(), t = ac.currentTime, end = Math.min(buf.duration, 10)
  const src = ac.createBufferSource(), env = ac.createGain()
  src.buffer = buf
  env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(g, t + .012)
  if (end < buf.duration) { env.gain.setValueAtTime(g, t + end - .25); env.gain.linearRampToValueAtTime(0, t + end) }
  src.connect(env)
  if (dest) env.connect(dest)
  src.start(); src.stop(t + end)
  return { src, env }
}
async function playSound(f, n, key) {
  if (!okSound(f)) return
  try {
    const { src, env } = startSound(await getSound(f))
    connectUserSound(env, mix.board, key, 'board')
    const clean = env.onended // a limpeza do canal da pessoa fica no fim do som
    const live = { src, env, n: n || 'som' }
    liveSounds.add(live); renderSomStop()
    src.onended = () => { clean?.(); env.disconnect(); liveSounds.delete(live); renderSomStop() }
  } catch { return }
  // um rótulo sobe da cabeça de quem tocou
  const p = headPos(key) || fallbackPos()
  const tag = el('div', { className: 'fx__sound' }, icon('volume-2'), el('span', { textContent: n || 'som' }))
  tag.style.cssText = `left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px`
  tag.addEventListener('animationend', () => tag.remove())
  fxEl.append(tag)
}
// Sons tocando agora: botão de parar ao lado das reações, com destaque
const liveSounds = new Set()
function renderSomStop() {
  const b = $('#btnSomStop'), last = [...liveSounds].pop()
  b.hidden = !last
  if (last) { b.querySelector('span').textContent = `Parar “${last.n.slice(0, 18)}${last.n.length > 18 ? '…' : ''}”`; poke() }
}
function stopSounds() {
  liveSounds.forEach(({ src, env }) => { try { env.gain.cancelScheduledValues(0); env.gain.setTargetAtTime(0, audioCtx().currentTime, .03); src.stop(audioCtx().currentTime + .12) } catch {} })
}
$('#btnSomStop').addEventListener('click', () => {
  if (!liveSounds.size) return
  stopSounds(); stopPreview()
  actions?.react.send({ stop: 1 })
})
// Prévia: toca só para você (no volume do soundboard), sem mandar para a sala
let preview = null
function stopPreview() {
  if (!preview) return
  try { preview.src.stop() } catch {}
  preview.btn.classList.remove('tocando'); setIcon(preview.btn.firstChild, 'headphones')
  preview = null
}
async function previewSound(s, btn) {
  const same = preview?.f === s.f
  stopPreview()
  if (same) return
  btn.classList.add('tocando'); setIcon(btn.firstChild, 'square')
  preview = { f: s.f, btn, src: null }
  try {
    const snd = await getSound(s.f)
    if (preview?.f !== s.f) return
    const { src } = startSound(snd, mix.board)
    preview.src = src
    src.onended = () => { if (preview?.src === src) stopPreview() }
  } catch { stopPreview(); toast('Não deu para tocar esse som.') }
}
function sendSound(s) {
  if (Date.now() - lastSound < 3000) return toast('Calma, um som de cada vez', 1600)
  lastSound = Date.now()
  playSound(s.f, s.n, me.key)
  actions?.react.send({ s: s.f, n: s.n })
  prefs.sonsRec = [s, ...prefs.sonsRec.filter(x => x.f !== s.f)].slice(0, 12)
  savePrefs()
  api('sons', { method: 'POST', body: { f: s.f, n: s.n, c: s.c } }) // conta para "mais tocados na sala"
}
// Soundboard em botões quadrados: a cor do som no fundo, nome grande; o fone no canto ouve só você
function sonsList(list, title, extra) {
  const kids = list.map(s => {
    const send = el('button', { type: 'button', className: 'sons__send', title: `Tocar para todos: ${s.n}` },
      el('span', { className: 'sons__ic' }, icon('play')), el('span', { className: 'sons__name', textContent: s.n }),
      s.vezes ? el('small', { className: 'sons__vezes', textContent: `${s.vezes}×` }) : '')
    send.addEventListener('click', () => { stopPreview(); sendSound(s); send.classList.remove('foi'); void send.offsetWidth; send.classList.add('foi') })
    const prev = el('button', { type: 'button', className: 'sons__prev', title: 'Ouvir só você', ariaLabel: `Ouvir ${s.n} só você` }, icon('headphones'))
    prev.addEventListener('click', () => previewSound(s, prev))
    const item = el('div', { className: 'sons__item' }, send, prev)
    const c = /^#[0-9a-f]{6}$/i.test(s.c || '') && !/^#(000000|ffffff)$/i.test(s.c) ? s.c : 'var(--accent)'
    item.style.setProperty('--c', c)
    return item
  })
  return title ? [el('p', { className: 'sons__title' }, el('span', { textContent: title }), extra || ''), ...kids] : kids
}
async function loadSons() {
  const q = $('#sonsQ').value.trim()
  const req = ++sonsReq
  const grid = $('#sonsGrid')
  if (!grid.children.length || q) grid.replaceChildren(...Array.from({ length: 9 }, () => el('div', { className: 'sons__item sons__esq esq' })))
  const [r, top] = await Promise.all([api('sons' + (q ? '?q=' + encodeURIComponent(q) : '')), q ? null : api('sons?top=1')])
  if (req !== sonsReq) return
  const list = r?.list || []
  if (q) return grid.replaceChildren(...(list.length ? sonsList(list, `Resultados para “${q}”`) : [el('p', { className: 'gifs__msg', textContent: r ? 'Nada encontrado. Tente outra palavra.' : 'Não deu para buscar agora.' })]))
  const sala = (top?.list || []).filter(x => x.vezes >= 2).slice(0, 9)
  grid.replaceChildren(
    ...(sala.length ? sonsList(sala, 'Mais tocados na sala') : []),
    ...(prefs.sonsRec.length ? sonsList(prefs.sonsRec.slice(0, 6), 'Seus recentes') : []),
    ...sonsList(list.slice(0, 24), 'Em alta no Brasil'))
}
$('#sonsQ').addEventListener('input', () => { clearTimeout(sonsTimer); sonsTimer = setTimeout(loadSons, 450); markChip() })
// atalhos de busca
const SONS_CHIPS = ['😂 Risada', '😱 Susto', '👏 Aplausos', '🥁 Tambor', '🎻 Suspense', '💀 Fail', '🗿 Bruh', '📢 Grito', '🐐 Faustão', '🚨 Alerta']
const palavraChip = c => c.replace(/^\S+\s+/, '')
function markChip() { const q = $('#sonsQ').value.trim().toLowerCase(); $('#sonsChips').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(palavraChip(b.textContent).toLowerCase() === q))) }
$('#sonsChips').append(...SONS_CHIPS.map(c => { const b = el('button', { type: 'button', textContent: c }); b.setAttribute('aria-pressed', 'false'); b.addEventListener('click', () => { const on = b.getAttribute('aria-pressed') === 'true'; $('#sonsQ').value = on ? '' : palavraChip(c); markChip(); loadSons() }); return b }))

/* ---------- Balão de fala na cabeça do boneco ---------- */
let bubbleZ = 0
function showBubble(m) {
  const node = seatNodes.get(m.key)
  if (!node?.classList.contains('online')) return
  node.querySelector('.seat__bubble')?.remove()
  const b = el('div', { className: 'seat__bubble' })
  if (m.text) b.append(el('span', { textContent: m.text }))
  else if (m.gif) b.append(el('img', { src: m.gif, alt: 'GIF' }))
  else return
  b.style.zIndex = 10 + (++bubbleZ % 1000) // o mais recente fica por cima
  node.append(b)
  const ms = Math.min(9000, 3500 + (m.text?.length || 30) * 55)
  setTimeout(() => b.classList.add('out'), ms)
  setTimeout(() => b.remove(), ms + 350)
}

/* ---------- Mensagens (estilo Discord: agrupadas, horário no hover, responder, reagir) ---------- */
const listEl = $('#chatList')
const msgEls = new Map() // id -> <li>
const msgReacts = new Map() // id -> Map(emoji -> Set(key))
const QUICK = ['1f602', '2764_fe0f', '1f631', '1f480']
const GROUP_MS = 5 * 60e3
const fmtTime = ts => new Date(ts).toLocaleString('pt-BR', new Date(ts).toDateString() === new Date().toDateString() ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const fmtClock = ts => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const fmtMt = s => {
  s = Math.max(0, Math.round(s))
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
function regroup(li) {
  if (!li?.classList.contains('msg')) return
  const prev = li.previousElementSibling
  const cont = !li.dataset.reply && prev?.classList.contains('msg') && prev.dataset.key === li.dataset.key && +li.dataset.ts - +prev.dataset.ts < GROUP_MS
  li.classList.toggle('cont', !!cont)
}
const actBtn = (art, title, fn) => { const b = el('button', { type: 'button', className: 'msg__act', title }, art); b.addEventListener('click', fn); return b }
function msgNode(m) {
  const p = person(m.key, m.name)
  const body = el('div', { className: 'msg__body' })
  if (m.re) {
    const q = el('button', { type: 'button', className: 'msg__quote', title: 'Ir para a mensagem' }, icon('reply'), el('b', { textContent: m.re.name || '' }), el('span', { textContent: m.re.text || 'GIF' }))
    q.addEventListener('click', () => jumpTo(m.re.id))
    body.append(q)
  }
  body.append(el('div', { className: 'msg__head' }, el('b', { textContent: p.nome, style: `color:${p.cor || 'inherit'}` }), el('time', { textContent: fmtTime(m.ts) })))
  const line = el('div', { className: 'msg__line' })
  if (Number.isFinite(m.mt)) {
    const b = el('button', { type: 'button', className: 'msg__mt', title: 'Momento do filme · clique para ir até ele' }, icon('clapperboard'), el('span', { textContent: fmtMt(m.mt) }))
    b.addEventListener('click', () => seekMovie(m.mt))
    line.append(b)
  }
  if (m.text) line.append(el('span', { className: 'msg__text', textContent: m.text }))
  if (line.childNodes.length) body.append(line)
  if (m.gif) body.append(gifImg(m))
  if (Array.isArray(m.poll) && m.poll.length >= 2) { line.classList.add('poll__q'); body.append(el('div', { className: 'poll' })) }
  const md = !m.gif && m.text && parseMidia(m.text)
  if (md) {
    const row = el('div', { className: 'msg__juntos' })
    if (md.kind === 'yt') { const b = el('button', { type: 'button', className: 'msg__junto' }, icon('play'), el('span', { textContent: 'Assistir junto' })); b.addEventListener('click', () => startMidia(m.text)); row.append(b) }
    const r = el('button', { type: 'button', className: 'msg__junto msg__junto--radio', title: 'Música de fundo para todos' }, icon('music'), el('span', { textContent: md.kind === 'yt' ? 'Na rádio' : 'Ouvir na rádio' }))
    r.addEventListener('click', async () => { if (await radio?.add(m.text)) toggleRadio(true) })
    row.append(r); body.append(row)
  }
  body.append(el('div', { className: 'msg__reacts' }))
  const acts = el('div', { className: 'msg__acts' },
    ...QUICK.map(e => actBtn(reactArt(EMO_BY[e], 20, true), EMO_BY[e].label, () => toggleMsgReact(m.id, e))),
    actBtn(icon('smile-plus'), 'Mais reações', ev => openMsgPick(m.id, ev.currentTarget)),
    actBtn(icon('reply'), 'Responder', () => startReply(m)))
  const li = el('li', { className: 'msg' + (m.from === selfId ? ' mine' : '') },
    el('div', { className: 'msg__gutter' }, pfpImg(m.key, 36, m.name), el('time', { className: 'msg__clock', textContent: fmtClock(m.ts) })),
    body, acts)
  li.dataset.key = m.key
  li.dataset.id = m.id
  if (m.re) li.dataset.reply = '1'
  return li
}
function addMsg(m, quiet) {
  if (!m || typeof m.text !== 'string' || !m.id || seen.has(m.id)) return
  if (m.gif && !safeGif(m.gif)) delete m.gif
  if (!m.sys && !m.text && !m.gif) return
  if (m.re && (typeof m.re !== 'object' || typeof m.re.id !== 'string')) delete m.re
  if (m.mt != null) { m.mt = +m.mt; if (!Number.isFinite(m.mt)) delete m.mt }
  if (m.poll != null) { if (Array.isArray(m.poll) && m.poll.length >= 2) m.poll = m.poll.slice(0, 6).map(o => String(o).slice(0, 60)); else delete m.poll }
  seen.add(m.id)
  messages.push(m)
  const li = m.sys ? el('li', { className: 'sys', textContent: m.text }) : msgNode(m)
  li.dataset.ts = m.ts
  if (!m.sys) msgEls.set(m.id, li)
  const atBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 60
  const after = [...listEl.children].find(x => +x.dataset.ts > m.ts)
  listEl.insertBefore(li, after || null)
  regroup(li); regroup(li.nextElementSibling)
  if (!m.sys) { renderMsgReacts(m.id); if (m.poll) renderPoll(m.id) }
  if (atBottom || m.from === selfId || quiet) listEl.scrollTop = listEl.scrollHeight
  if (!quiet && !m.sys) {
    if (m.from !== selfId) sfx('chat', m.key)
    if (!m.ch) showBubble(m) // balão no boneco só para a conversa da call
  }
}
function sysMsg(text) { addMsg({ id: `${selfId}-s${msgN++}`, sys: 1, text, ts: Date.now() }, true) }
function sendMsg(fields) {
  const m = { id: `${selfId}-${msgN++}`, from: selfId, key: me.key, name: me.name, text: '', ts: Date.now(), ...fields, ...(chatCh ? { ch: chatCh } : {}) }
  const mv = movieNow()
  if (mv) m.mt = Math.round(mv.t)
  if (replyTo) { m.re = replyTo; cancelReply() }
  addMsg(m)
  actions?.chat.send(m)
  const { from, ...keep } = m
  api('chat', { method: 'POST', body: { r: chatR(), m: keep } })
}
function clearChat() { messages.length = 0; msgEls.clear(); msgReacts.clear(); listEl.replaceChildren() }
async function loadHistory() {
  const r = await api(`chat?r=${chatR()}&n=80`) // histórico permanente (antes: só desde o começo da call)
  if (Array.isArray(r?.list)) r.list.forEach(m => addMsg(m, true))
  if (r?.re && typeof r.re === 'object') for (const [id, byE] of Object.entries(r.re)) for (const [e, keys] of Object.entries(byE || {})) (Array.isArray(keys) ? keys : []).forEach(k => setMsgReact(id, e, k, true))
}
// digitando no chat → boneco olha o celular
let typingTimer
function setTyping(v) { if (me.typing === v) return; me.typing = v; sendHello(); renderSeats() }
$('#chatInput').addEventListener('input', e => { setTyping(!!e.target.value.trim()); clearTimeout(typingTimer); typingTimer = setTimeout(() => setTyping(false), 6000) })
$('#chatInput').addEventListener('blur', () => setTyping(false))
$('#chatForm').addEventListener('submit', e => {
  e.preventDefault()
  setTyping(false)
  const text = $('#chatInput').value.trim().slice(0, 500)
  if (!text) return
  // Faixa a Faixa no modo chat: a resposta certa não aparece para os outros
  if (faixa?.interceptaChat(text)) { $('#chatInput').value = ''; return }
  const enq = /^\/enquete\s+(.+)/i.exec(text)
  if (enq) { const p = parseEnquete(enq[1]); sendMsg({ text: p.q, poll: p.ops }); $('#chatInput').value = ''; return }
  const gif = gifFromText(text)
  sendMsg(gif ? { gif } : { text })
  $('#chatInput').value = ''
})

/* Enquete no chat: "/enquete pizza ou hambúrguer?", "/enquete Que filme? Duna, Alien, Matrix" ou
   "/enquete Pergunta | a | b". Cada um vota em uma opção; os votos usam as reações da mensagem (p0…p5),
   então ficam no histórico e chegam para quem entra depois. */
function parseEnquete(t) {
  t = t.trim()
  let q = t, ops = []
  if (t.includes('|')) { [q, ...ops] = t.split('|').map(x => x.trim()) }
  else if (/\?\s*\S/.test(t)) { const i = t.indexOf('?'); q = t.slice(0, i + 1).trim(); ops = t.slice(i + 1).split(/,|\s+ou\s+/i).map(x => x.trim()) }
  if (ops.filter(Boolean).length < 2) ops = q.replace(/\?$/, '').split(/,|\s+ou\s+/i).map(x => x.trim())
  ops = [...new Set(ops.filter(Boolean))].slice(0, 6)
  if (ops.length < 2) ops = ['Sim', 'Não']
  return { q: q.slice(0, 200), ops: ops.map(o => o.replace(/\?$/, '').slice(0, 60)) }
}
function renderPoll(id) {
  const box = msgEls.get(id)?.querySelector('.poll'), m = messages.find(x => x.id === id)
  if (!box || !m?.poll) return
  const map = msgReacts.get(id) || new Map(), votos = m.poll.map((_, i) => map.get('p' + i) || new Set())
  const total = votos.reduce((a, s) => a + s.size, 0), max = Math.max(...votos.map(s => s.size))
  box.replaceChildren(...m.poll.map((op, i) => {
    const s = votos[i], meu = s.has(me.key), pc = total ? Math.round(s.size / total * 100) : 0
    const b = el('button', { type: 'button', className: 'poll__op' + (meu ? ' on' : '') + (s.size && s.size === max ? ' lider' : ''), style: `--pc:${pc}%`, title: [...s].map(k => person(k).nome).join(', ') || 'ninguém ainda' },
      el('span', { textContent: op }), el('div', { className: 'poll__quem' }, ...[...s].slice(0, 4).map(k => pfpImg(k, 18))), el('b', { textContent: total ? `${pc}%` : '' }))
    b.addEventListener('click', () => {
      m.poll.forEach((_, j) => { if (j !== i && votos[j].has(me.key)) toggleMsgReact(id, 'p' + j) })
      toggleMsgReact(id, 'p' + i)
    })
    return b
  }), el('small', { className: 'poll__total', textContent: total ? `${total} voto${total > 1 ? 's' : ''}` : 'toque para votar' }))
}
// Reações nas mensagens
function renderMsgReacts(id) {
  const box = msgEls.get(id)?.querySelector('.msg__reacts')
  if (!box) return
  const map = msgReacts.get(id) || new Map()
  box.replaceChildren(...[...map].filter(([e, s]) => s.size && EMO_BY[e]).map(([e, s]) => {
    const b = el('button', { type: 'button', className: 'msg__react' + (s.has(me.key) ? ' on' : ''), title: `${EMO_BY[e].label}: ${[...s].map(k => person(k).nome).join(', ')}` },
      reactArt(EMO_BY[e], 18, true), el('span', { textContent: s.size }))
    b.addEventListener('click', () => toggleMsgReact(id, e))
    return b
  }))
}
function setMsgReact(id, e, key, on) {
  if ((!EMO_BY[e] && !/^p[0-5]$/.test(e)) || !key || typeof id !== 'string') return
  let map = msgReacts.get(id)
  if (!map) msgReacts.set(id, map = new Map())
  let s = map.get(e)
  if (!s) map.set(e, s = new Set())
  if (on) s.add(key); else s.delete(key)
  renderMsgReacts(id)
  if (/^p\d$/.test(e)) renderPoll(id)
}
function toggleMsgReact(id, e) {
  if (!me.key) return
  const on = !msgReacts.get(id)?.get(e)?.has(me.key)
  setMsgReact(id, e, me.key, on)
  actions?.mre.send({ id, e, on })
  api('chat', { method: 'POST', body: { r: chatR(), re: { id, e, k: me.key, on } } })
  closePops()
}
const reactsDump = () => [...msgReacts].map(([id, map]) => [id, [...map].map(([e, s]) => [e, [...s]])])
function gotMsgReact(d, peerId) {
  if (Array.isArray(d?.all)) return d.all.forEach(([id, list]) => Array.isArray(list) && list.forEach(([e, keys]) => Array.isArray(keys) && keys.forEach(k => typeof k === 'string' && setMsgReact(id, e, k, true))))
  setMsgReact(d?.id, d?.e, peers.get(peerId)?.key, !!d?.on)
}
const msgPick = el('div', { className: 'pop msgpick', hidden: true })
EMOJI.forEach(def => {
  const b = el('button', { type: 'button', className: 'msgpick__item', title: def.label }, reactArt(def, 26, true))
  b.addEventListener('click', () => { if (msgPick.dataset.id) toggleMsgReact(msgPick.dataset.id, def.e) })
  msgPick.append(b)
})
function openMsgPick(id, anchor) {
  const open = msgPick.hidden || msgPick.dataset.id !== id
  closePops(open ? msgPick : null)
  msgPick.hidden = !open
  if (!open) return
  msgPick.dataset.id = id
  anchor.closest('.msg__acts').append(msgPick)
  // abre para cima se tiver espaço (a lista corta o que passa da borda)
  msgPick.classList.toggle('up', anchor.getBoundingClientRect().top - listEl.getBoundingClientRect().top > 190)
}

// Responder
let replyTo = null
function startReply(m) {
  replyTo = { id: m.id, name: person(m.key, m.name).nome, text: (m.text || '').slice(0, 120) }
  $('#replyName').textContent = replyTo.name
  $('#replyBar').hidden = false
  $('#chatInput').focus()
}
function cancelReply() { replyTo = null; $('#replyBar').hidden = true }
$('#replyX').addEventListener('click', cancelReply)
$('#chatInput').addEventListener('keydown', e => { if (e.key === 'Escape' && replyTo) { e.stopPropagation(); cancelReply() } })
function jumpTo(id) {
  const li = msgEls.get(id)
  if (!li) return toast('Essa mensagem não está mais no histórico')
  li.scrollIntoView({ block: 'center', behavior: 'smooth' })
  li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash')
}

// Momento do filme (só quando alguém transmite um arquivo)
function movieNow() {
  if (myShare?.kind === 'arquivo' && myShare.video) return { t: myShare.video.currentTime, id: selfId }
  for (const [id, s] of shareInfo) if (s.kind === 'arquivo' && Number.isFinite(s.t)) return { t: s.t + (s.paused ? 0 : (Date.now() - s.tAt) / 1000 * (s.rate || 1)), id }
  return null
}
function seekMovie(t) {
  const cur = movieNow()
  if (!cur) return toast('Ninguém está projetando um arquivo agora')
  if (cur.id === selfId) { myShare.video.currentTime = t; toast(`Pulando para ${fmtMt(t)}`) }
  else ctl(cur.id, 'at', t)
}

/* ---------- GIFs e figurinhas ---------- */
function safeGif(u) {
  try {
    const url = new URL(u)
    if (url.origin === location.origin && url.pathname === '/api/chat' && /^[a-f0-9]{24}$/.test(url.searchParams.get('img') || '')) return true
    return url.protocol === 'https:' && (/\.(gif|webp|png|jpe?g)$/i.test(url.pathname) || /(^|\.)giphy\.com$/.test(url.hostname))
  } catch { return false }
}
/* Imagens no chat: reduz no navegador (até 1600 px) e guarda no servidor por 60 dias */
async function sendImage(file) {
  if (!file?.type?.startsWith('image/')) return
  if (file.size > 25e6) return toast('Imagem grande demais.')
  toast('Enviando imagem…')
  const read = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f) })
  let data = ''
  if (file.type === 'image/gif' && file.size < 900e3) data = await read(file) // GIF animado vai como está
  else {
    const bmp = await createImageBitmap(file).catch(() => null)
    if (!bmp) return toast('Não consegui abrir essa imagem.')
    for (const [max, q] of [[1600, .85], [1280, .75], [960, .65], [720, .55]]) {
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
      const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) })
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
      data = c.toDataURL('image/jpeg', q)
      if (data.length < 900e3) break
    }
  }
  const r = await api('chat', { method: 'POST', body: { r: chatR(), img: data } })
  if (!r?.id) return toast('Não consegui enviar a imagem.')
  sendMsg({ gif: `${location.origin}/api/chat?img=${r.id}`, foto: 1 })
}
$('#btnImg').addEventListener('click', () => $('#imgFile').click())
$('#imgFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; sendImage(f) })
$('#chatInput').addEventListener('paste', e => {
  const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/'))
  if (f) { e.preventDefault(); sendImage(f) }
})
document.querySelector('.chat').addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.type.startsWith('image/'))) e.preventDefault() })
document.querySelector('.chat').addEventListener('drop', e => {
  const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/'))
  if (f) { e.preventDefault(); sendImage(f) }
})
function gifFromText(t) {
  if (/\s/.test(t) || !/^https:\/\//.test(t)) return null
  const page = t.match(/^https:\/\/giphy\.com\/(?:gifs|stickers)\/(?:[\w-]*-)?([A-Za-z0-9]+)\/?$/)
  if (page) return `https://media.giphy.com/media/${page[1]}/giphy.gif`
  return safeGif(t) ? t : null
}
function gifImg(m) {
  const img = el('img', { className: 'msg__gif' + (m.sticker ? ' msg__gif--sticker' : ''), src: m.gif, alt: 'GIF', loading: 'lazy' })
  img.onload = () => { if (listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 260) listEl.scrollTop = listEl.scrollHeight }
  if (m.foto) { img.alt = 'Imagem'; img.classList.add('msg__foto'); img.addEventListener('click', () => window.open(m.gif, '_blank', 'noopener')) }
  img.onerror = () => img.replaceWith(el('a', { href: m.gif, target: '_blank', rel: 'noopener', textContent: m.gif }))
  return img
}
const gifs = $('#gifs'), ggrid = $('#gifGrid')
let gifKind = 'gifs', gifTimer, gifReq = 0
const gifCache = new Map()
function openGifs(open = gifs.hidden) {
  gifs.hidden = !open
  $('#btnGif').setAttribute('aria-pressed', String(open))
  if (open) { $('#gifQ').focus(); loadGifs() }
}
async function loadGifs() {
  if (!CFG.giphyKey) return ggrid.replaceChildren(el('p', { className: 'gifs__msg', textContent: 'Sem chave do GIPHY no config. Cole o link de um GIF na mensagem.' }))
  const q = $('#gifQ').value.trim()
  const req = ++gifReq
  const url = `https://api.giphy.com/v1/${gifKind}/${q ? 'search' : 'trending'}?api_key=${CFG.giphyKey}&limit=24&rating=pg-13&lang=pt${q ? '&q=' + encodeURIComponent(q) : ''}`
  try {
    const key = gifKind + '|' + q.toLowerCase()
    const data = gifCache.get(key) || (await (await fetch(url)).json()).data
    gifCache.set(key, data)
    if (req !== gifReq) return
    ggrid.replaceChildren(...data.map(d => {
      const im = d.images, prev = im.fixed_width_small || im.fixed_width
      const b = el('button', { type: 'button', className: 'gifs__item', title: d.title || '' }, el('img', { src: prev.webp || prev.url, alt: d.title || 'GIF', loading: 'lazy' }))
      b.addEventListener('click', () => { sendMsg({ gif: im.fixed_width.webp || im.fixed_width.url, sticker: gifKind === 'stickers' }); openGifs(false); $('#chatInput').focus() })
      return b
    }))
    if (!data.length) ggrid.replaceChildren(el('p', { className: 'gifs__msg', textContent: 'Nada encontrado.' }))
  } catch {
    if (req === gifReq) ggrid.replaceChildren(el('p', { className: 'gifs__msg', textContent: 'Não deu para buscar agora.' }))
  }
}
$('#btnGif').addEventListener('click', () => openGifs())
$('#gifClose').addEventListener('click', () => openGifs(false))
$('#gifQ').addEventListener('input', () => { clearTimeout(gifTimer); gifTimer = setTimeout(loadGifs, 600) })
document.querySelectorAll('.gifs__tab').forEach(t => t.addEventListener('click', () => {
  gifKind = t.dataset.kind
  document.querySelectorAll('.gifs__tab').forEach(x => x.setAttribute('aria-selected', String(x === t)))
  loadGifs()
}))
gifs.addEventListener('keydown', e => { if (e.key === 'Escape') { openGifs(false); $('#chatInput').focus() } })

/* ---------- Voz ----------
   Mic → corte de graves → RNNoise → portão de voz → envio P2P. O mesmo sinal limpo alimenta o indicador de fala. */
let mic = null
const voices = new Map() // peerId -> <audio>
function playVoice(stream, peerId) {
  dropVoice(peerId)
  const a = el('audio', { autoplay: true, muted: true, className: 'voice' })
  a.srcObject = stream
  document.body.append(a)
  a.play().catch(() => { needGesture = true })
  const ac = audioCtx()
  const src = ac.createMediaStreamSource(stream), g = ac.createGain()
  const an = ac.createAnalyser(); an.fftSize = 1024
  src.connect(g)
  const spatialGraph = createSpatialVoice(ac, g, mix.voice)
  g.connect(an)
  voices.set(peerId, a)
  mix.peer.set(peerId, { src, g, an, spatialGraph })
  applyPeerVols(); updatePans()
  setTimeout(tuneReceivers, 500)
}
function dropVoice(id) {
  voices.get(id)?.remove(); voices.delete(id)
  const p = mix.peer.get(id)
  if (p) { p.src.disconnect(); p.g.disconnect(); p.an?.disconnect(); p.spatialGraph?.disconnect(); mix.peer.delete(id) }
}
let rnWasm = null, gtWasm = null
async function micOn(fromEntry, preserveMute = false) {
  const generation = ++micGeneration
  if (mic) return setMuted(false)
  let raw
  try {
    raw = await navigator.mediaDevices.getUserMedia({ audio: {
      ...(prefs.mic ? { deviceId: { ideal: prefs.mic } } : {}),
      echoCancellation: !!prefs.voiceSettings.echo, noiseSuppression: prefs.voiceSettings.engine === 'browser', autoGainControl: !!prefs.voiceSettings.agc, voiceIsolation: false, channelCount: 1,
    } })
  } catch {
    me.muted = true
    if (fromEntry && !prefs.entryMuted) $('#micModal').hidden = false
    else { $('#micModal').hidden = true; toast('O navegador bloqueou o microfone. Libere no cadeado ao lado do endereço.') }
    sendHello(); renderSeats(); renderMic()
    return
  }
  if (generation !== micGeneration) { raw.getTracks().forEach(t => t.stop()); return }
  const ac = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
  const src = ac.createMediaStreamSource(raw)
  const settings = cleanVoice(prefs.voiceSettings)
  const inputGain = ac.createGain(); inputGain.gain.value = 10 ** (settings.gain / 20)
  const highpass = new BiquadFilterNode(ac, { type: 'highpass', frequency: Math.max(1, settings.highpass), Q: .7 })
  src.connect(inputGain)
  let clean = inputGain
  if (settings.highpass > 0) { inputGain.connect(highpass); clean = highpass }
  let processor = null, effectiveEngine = settings.engine
  if (settings.engine === 'gtcrn') {
    try {
      gtWasm ||= await loadGtcrn({ url: 'vendor/nsup/gtcrn.wasm' })
      await ac.audioWorklet.addModule('vendor/nsup/gtcrnWorklet.js')
      processor = new GtcrnWorkletNode(ac, { maxChannels: 1, wasmBinary: gtWasm })
      clean.connect(processor); clean = processor
    } catch { effectiveEngine = 'rnnoise' }
  }
  if (effectiveEngine === 'rnnoise') {
    try {
      rnWasm ||= await loadRnnoise({ url: 'vendor/nsup/rnnoise.wasm', simdUrl: 'vendor/nsup/rnnoise_simd.wasm' })
      await ac.audioWorklet.addModule('vendor/nsup/rnnoiseWorklet.js')
      processor = new RnnoiseWorkletNode(ac, { maxChannels: 1, wasmBinary: rnWasm })
      clean.connect(processor); clean = processor
    } catch {
      effectiveEngine = 'browser'
      await raw.getAudioTracks()[0]?.applyConstraints({ noiseSuppression: true }).catch(() => {})
      toast('RNNoise indisponível; usando a supressão do navegador')
    }
  }
  if (generation !== micGeneration) { raw.getTracks().forEach(t => t.stop()); processor?.disconnect(); await ac.close(); return }
  // nivelador no envio: quem fala baixo (ou tem microfone fraco) chega mais perto de quem fala alto
  const nivel = new DynamicsCompressorNode(ac, { threshold: -32, knee: 12, ratio: 4, attack: .004, release: .25 })
  const compensa = ac.createGain(); compensa.gain.value = 2.2
  const teto = new DynamicsCompressorNode(ac, { threshold: -3, knee: 0, ratio: 20, attack: .001, release: .1 })
  const gate = ac.createGain()
  gate.gain.value = 0
  const dest = ac.createMediaStreamDestination()
  clean.connect(nivel).connect(compensa).connect(teto).connect(gate).connect(dest)
  const previewGate = ac.createGain(), previewDest = ac.createMediaStreamDestination()
  previewGate.channelCount = 1; previewGate.channelCountMode = 'explicit'
  previewDest.channelCount = 1; previewDest.channelCountMode = 'explicit'
  clean.connect(previewGate).connect(previewDest)
  let previewLastLoud = -Infinity
  const bp1 = new BiquadFilterNode(ac, { type: 'highpass', frequency: 150 })
  const bp2 = new BiquadFilterNode(ac, { type: 'lowpass', frequency: 3400 })
  const an = new AnalyserNode(ac, { fftSize: 1024 })
  clean.connect(bp1).connect(bp2).connect(an)
  const buf = new Float32Array(an.fftSize)
  let voiced = 0, lastLoud = -Infinity, lastVoice = -Infinity, open = false
  const timer = setInterval(() => {
    an.getFloatTimeDomainData(buf)
    let sum = 0
    for (const x of buf) sum += x * x
    const db = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-9)
    const now = performance.now()
    const ptt = prefs.vmode === 'ptt'
    const live = !me.muted && (!ptt || pttDown)
    if (db > settings.threshold) previewLastLoud = now
    const previewOpen = gateIsOpen({ live: true, pushToTalk: false, enabled: settings.gate, db, threshold: settings.threshold, now, lastLoud: previewLastLoud, hold: settings.hold })
    previewGate.gain.setTargetAtTime(previewOpen ? 1 : 0, ac.currentTime, previewOpen ? .005 : .12)
    const loud = live && db > settings.threshold
    if (loud) lastLoud = now
    voiced = loud ? voiced + 1 : 0
    if (voiced >= 6) lastVoice = now
    // aperte-para-falar: abre enquanto a tecla estiver apertada; aberto: abre com som e fecha 350 ms depois
    const shouldOpen = gateIsOpen({ live, pushToTalk: ptt, enabled: settings.gate, db, threshold: settings.threshold, now, lastLoud, hold: settings.hold })
    if (shouldOpen !== open) {
      open = shouldOpen
      gate.gain.setTargetAtTime(open ? 1 : 0, ac.currentTime, open ? 0.005 : 0.12)
    }
    const speaking = live && now - lastVoice < 450
    if (speaking !== me.speaking) { me.speaking = speaking; actions?.spk.send(speaking); renderSeats(); if (speaking) { lastActive = Date.now(); if (me.away) checkAway() } }
  }, 20)
  const [out] = dest.stream.getAudioTracks()
  if ('contentHint' in out) out.contentHint = 'speech'
  out.enabled = !(preserveMute || (fromEntry && !!prefs.entryMuted))
  mic = { stream: dest.stream, raw, ctx: ac, timer, settings, effectiveEngine, analyser: an, gate, processor, testStream: previewDest.stream }
  room?.addStream(mic.stream, { metadata: { voice: 1 } })
  setTimeout(tuneSenders, 1500)
  $('#micModal').hidden = true
  setMuted(preserveMute || (fromEntry && !!prefs.entryMuted), true)
  listDevices()
}
function micOff() {
  stopMicTest(false)
  micGeneration++
  if (!mic) return
  clearInterval(mic.timer)
  try { room?.removeStream(mic.stream) } catch {}
  mic.raw.getTracks().forEach(t => t.stop())
  mic.testStream?.getTracks().forEach(t => t.stop())
  mic.ctx.close()
  mic = null
}
function setMuted(m, quiet) {
  const changed = me.muted !== m
  me.muted = m
  setTimeout(renderLateral, 0)
  mic?.stream.getAudioTracks().forEach(t => { t.enabled = !m })
  if (m && me.speaking) { me.speaking = false; actions?.spk.send(false) }
  if (changed && !quiet) sfx(m ? 'mutar' : 'desmutar')
  sendHello(); renderSeats(); renderMic()
}
function renderMic() {
  const b = $('#btnMic')
  const on = !!mic && !me.muted
  const ptt = prefs.vmode === 'ptt'
  setIcon(iconOf(b), on ? 'mic' : 'mic-off')
  b.setAttribute('aria-pressed', String(on))
  b.classList.toggle('btn--muted', !on)
  b.closest('.voice-control')?.classList.toggle('voice-control--muted', !on)
  b.classList.toggle('btn--ptt', on && ptt && !pttDown)
  b.title = !on ? 'Microfone mudo (M para ligar)' : ptt ? `Segure ${prefs.pttLabel} para falar · M muta` : 'Microfone ligado (M para mutar)'
}
const toggleMute = () => { if (micTest) stopMicTest(false); if (me.deaf) setDeaf(false); return mic ? setMuted(!me.muted) : micOn() }

/* ---------- Cortar o som (como no Discord: some as vozes e muta o mic) ---------- */
let mutedBeforeDeaf = false
function setDeaf(d, quiet) {
  stopMicTest(true)
  if (me.deaf === d) return
  me.deaf = d
  setTimeout(renderLateral, 0)
  if (d) { mutedBeforeDeaf = me.muted; if (mic && !me.muted) setMuted(true, true) }
  else if (mic && !mutedBeforeDeaf) setMuted(false, true)
  if (!quiet) sfx(d ? 'mutar' : 'desmutar')
  updateDucking(); applyPrefs(); sendHello(); renderSeats()
  const b = $('#btnDeaf')
  setIcon(iconOf(b), d ? 'headphone-off' : 'headphones')
  b.setAttribute('aria-pressed', String(d))
  b.classList.toggle('btn--muted', d)
  b.closest('.voice-control')?.classList.toggle('voice-control--muted', d)
  b.title = d ? 'Todo o áudio desligado (D para voltar)' : 'Desativar todo o áudio (D)'
}
$('#btnDeaf').addEventListener('click', () => setDeaf(!me.deaf))

/* ---------- Ausente: sem mexer/falar por um tempo (ou com a aba escondida) ---------- */
let lastActive = Date.now(), hiddenSince = 0
;['pointermove', 'keydown', 'pointerdown'].forEach(ev => addEventListener(ev, () => { lastActive = Date.now(); if (me.away) checkAway() }, { passive: true }))
document.addEventListener('visibilitychange', () => {
  hiddenSince = document.hidden ? Date.now() : 0; lastActive = Date.now()
  if (me.hidden !== document.hidden) { me.hidden = document.hidden; sendHello(); renderSeats() } // aba escondida → celular no colo
  checkAway()
})
function checkAway() {
  const now = Date.now()
  const away = !me.speaking && (now - lastActive > 10 * 60e3 || (hiddenSince && now - hiddenSince > 5 * 60e3))
  if (away === me.away) return
  me.away = away
  sendHello(); renderSeats()
}
setInterval(checkAway, 15000)
$('#btnMic').addEventListener('click', toggleMute)
$('#micRetry').addEventListener('click', () => micOn())
$('#micSkip').addEventListener('click', () => { $('#micModal').hidden = true })
$('#micDevice').addEventListener('change', e => changeAudioInput(e.target.value))

/* ---------- Início ---------- */
setInterval(updateDucking, 100)
setInterval(updateMicMeter, 100)
setInterval(() => tiles.forEach((_, id) => updatePlayer(id)), 500)
applyPrefs()
// Lembra da sessão: quem já entrou neste navegador não precisa digitar de novo
const sess = store.get('sess')
const onlyOne = invite && invite.pessoas.length === 1 && !invite.convidados && invite.pessoas[0]
const showGate = () => { document.documentElement.classList.remove('auto'); voltaFim() }
if (conta && fromLink) {
  showGate()
  // link pessoal: mostra o ingresso por um instante e entra
  $('#lobbySub') && ($('#gateErr').hidden = true)
  $('.lobby__inner').append(el('p', { className: 'ticket__hello', textContent: `Bem-vindo, ${conta.nome}! Entrando…` }))
  whoEl.hidden = true; document.querySelector('.lobby__go').hidden = true
  setTimeout(() => enter(conta.pw, conta.key, conta.nome), 1600)
} else if (conta && (!invite || allowed(conta.key) || (conta.key.startsWith('g:') && guestsOk))) enter(invite?.pw || conta.pw, conta.key, conta.nome) // convite vencido não desloga ninguém
else if (onlyOne && !linkUsed) { await login(invite.pw, onlyOne, person(onlyOne).nome); enter(invite.pw, onlyOne, person(onlyOne).nome) } // convite de uma pessoa só: entra direto
else {
  showGate()
  if (linkUsed) {
    gateErr('Esse ingresso pessoal já foi usado ou não é válido. Peça um novo link a quem convidou você.')
    whoEl.hidden = true; $('#pwField').hidden = true; $('.lobby__go').hidden = true
  } else if (conta && invite && !allowed(conta.key)) gateErr('Sua conta não está na lista desta sessão. Saia da conta nos ajustes para escolher outro perfil.')
  if (!invite) $('#pw').focus()
  if (sess?.key && !conta && !linkUsed) document.querySelector(`input[name=who][value="${sess.key.startsWith('g:') ? 'guest' : sess.key}"]`)?.click()
  if (sess?.key?.startsWith('g:')) $('#guestName').value = sess.name || ''
}
