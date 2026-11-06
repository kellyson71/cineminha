/* Sala de verdade no app: mesmo protocolo do site (Trystero + public/core/rede.js).
   Estado fora do React (um objeto imutável + assinantes), lido com useSala(). */
import { useSyncExternalStore } from 'react'
import { joinRoom, selfId } from '@site/vendor/trystero.js'
import { ACOES, roomIdDe, api, turnServers, lerHello, helloDe, lerShare, criaFilmPC } from '@site/core/rede.js'
import { jogoDaMsg } from '@site/core/jogos.js'
import { defaultLayout, cleanLayout } from '@site/core/plateia.js'
import { CFG, PEOPLE, person, applyPerfis, store } from '../data.js'

export { selfId }
const QUEDA_MS = 12000, RECARGA_MS = 45000

/* ---------- estado ---------- */
let state = {
  fase: 'fora', // fora | dentro | expulso
  motivo: '',
  me: { key: '', name: '', muted: true, deaf: false, speaking: false, typing: false, away: false, hidden: false, seat: -1, mesa: '' },
  canal: '', roomId: '', pw: '',
  peers: {}, // peerId -> { key, name, speaking, muted, ... }
  srvPres: {}, // key -> name: na sala pelo servidor, sem conexão direta
  messages: [], msgReacts: {}, // id -> { emoji: [keys] }
  shares: {}, // peerId -> info de quem projeta
  streams: {}, // peerId -> MediaStream da tela
  subs: {}, // peerId -> legenda atual
  banner: null, callIni: 0, versao: 0,
  layout: defaultLayout(PEOPLE),
}
const subs = new Set()
const set = patch => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; subs.forEach(f => f()) }
export const getSala = () => state
export const useSala = sel => useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => sel(state))

// eventos para a interface (reação, balão, aviso, som, jogo)
const ouvintes = new Map()
export const on = (ev, fn) => { (ouvintes.get(ev) || ouvintes.set(ev, new Set()).get(ev)).add(fn); return () => ouvintes.get(ev).delete(fn) }
const emit = (ev, ...a) => ouvintes.get(ev)?.forEach(f => { try { f(...a) } catch (e) { console.error(e) } })
export const toast = (t, ms) => emit('toast', t, ms)
export const emitir = emit

/* ---------- rede ---------- */
let room = null, actions = null, presTimer = 0, msgN = 0
const seen = new Set()
const sumindo = new Map(), avisouVolta = new Map()
let mic = null // MediaStream do microfone (adicionado à sala)
let myShare = null // { stream, kind, video, game, paused, subs }
let jogos = null // gerente de jogos (registrado pelo app)
export const registraJogos = j => { jogos = j }

const FilmPC = criaFilmPC({
  aoMudar: async (pc, estado) => {
    if (pc._rep === estado) return
    pc._rep = estado
    api('sala', { method: 'POST', body: { op: 'diag', pw: state.pw, d: { key: state.me.key, estado, turn: pc._turn, cands: [...pc._cands], via: 'app', ua: 'Cineminha desktop ' + navigator.userAgent.slice(0, 150) } } })
  },
})

const setPeer = (id, patch) => set(s => ({ peers: { ...s.peers, [id]: { ...s.peers[id], ...patch } } }))
const keyDe = id => state.peers[id]?.key
const nomeDe = id => state.peers[id]?.name || 'Alguém'
export const sendHello = () => actions?.hello.send(helloDe(state.me))
export const setMe = patch => {
  const antes = state.me
  set(s => ({ me: { ...s.me, ...patch } }))
  if ('speaking' in patch && patch.speaking !== antes.speaking) actions?.spk.send(!!patch.speaking)
  if (Object.keys(patch).some(k => k !== 'speaking' && patch[k] !== antes[k])) sendHello()
}

export function sysMsg(text) { addMsg({ id: `${selfId}-s${msgN++}`, sys: 1, text, ts: Date.now() }, true) }
function addMsg(m, quiet) {
  if (!m || typeof m.text !== 'string' || !m.id || seen.has(m.id)) return
  if (!m.sys && !m.text && !m.gif) return
  if (m.re && (typeof m.re !== 'object' || typeof m.re.id !== 'string')) delete m.re
  seen.add(m.id)
  set(s => {
    const list = [...s.messages, m]
    if (list.length > 1 && list[list.length - 2].ts > m.ts) list.sort((a, b) => a.ts - b.ts)
    return { messages: list.slice(-400) }
  })
  if (!quiet && !m.sys) emit('msg', m)
}

export async function entrar({ pw, key, name, canal = '' }) {
  if (room) return
  applyPerfis((await api('conta?perfis=1'))?.perfis)
  const r = await api('conta', { method: 'POST', body: { op: 'login', pw, key, nome: name } })
  if (r?.token) store.set('conta-token', r.token)
  const roomId = await roomIdDe(pw, canal)
  set({ fase: 'dentro', pw, canal, roomId, me: { ...state.me, key, name, seat: Number.isInteger(store.get('seat')) ? store.get('seat') : -1 }, peers: {}, srvPres: {}, shares: {}, streams: {}, messages: [], msgReacts: {} })
  seen.clear()
  const ice = await Promise.race([turnServers(pw), new Promise(ok => setTimeout(() => ok([]), 8000))])
  room = joinRoom({ appId: CFG.appId, password: pw, rtcPolyfill: FilmPC, turnConfig: ice }, roomId)
  actions = Object.fromEntries(ACOES.map(n => [n, room.makeAction(n)]))

  room.onPeerJoin = id => {
    setPeer(id, { key: '', name: '', speaking: false })
    actions.hello.send(helloDe(state.me), { target: id })
    const hist = state.messages.filter(m => !m.sys)
    if (hist.length) actions.hist.send(hist.slice(-80), { target: id })
    const all = Object.entries(state.msgReacts).map(([mid, byE]) => [mid, Object.entries(byE)])
    if (all.length) actions.mre.send({ all }, { target: id })
    if (mic) room.addStream(mic, { target: id, metadata: { voice: 1 } })
    if (myShare) { room.addStream(myShare.stream, { target: id, metadata: { screen: 1 } }); actions.share.send(shareMsg(), { target: id }) }
    if (state.banner) actions.adm.send(state.banner, { target: id })
    jogos?.onPeerJoin(id)
  }
  room.onPeerLeave = id => {
    const p = state.peers[id]
    set(s => { const peers = { ...s.peers }; delete peers[id]; const shares = { ...s.shares }; delete shares[id]; const streams = { ...s.streams }; delete streams[id]; return { peers, shares, streams } })
    emit('voz-fim', id)
    if (!p?.name) return
    const ms = (avisouVolta.get(p.key) || 0) > Date.now() ? RECARGA_MS : QUEDA_MS
    clearTimeout(sumindo.get(p.key))
    sumindo.set(p.key, setTimeout(() => {
      sumindo.delete(p.key)
      if (Object.values(state.peers).some(x => x.key === p.key)) return
      sysMsg(`${p.name} saiu`); emit('som', 'saiu', p.key)
    }, ms))
  }
  actions.hello.onMessage = (d, { peerId }) => {
    const h = lerHello(d, PEOPLE)
    if (!h) return
    if (h.volta) avisouVolta.set(h.key, Date.now() + RECARGA_MS)
    if (h.perfilAtualizado) api('conta?perfis=1').then(r => { if (r?.perfis) { applyPerfis(r.perfis); set(s => ({ versao: s.versao + 1 })) } })
    const novo = !state.peers[peerId]?.name
    const { volta, sai, perfilAtualizado, ...p } = h
    setPeer(peerId, p)
    if (h.key === state.me.key) emit('voz-fim', peerId)
    const voltou = sumindo.has(h.key)
    if (voltou) { clearTimeout(sumindo.get(h.key)); sumindo.delete(h.key) }
    if (novo && !voltou) { sysMsg(`${h.name} entrou`); emit('som', 'entrou', h.key); emit('entrou', h) }
    if (novo) jogos?.entrouAlguem(h.key)
  }
  room.onPeerStream = (stream, peerId, meta) => {
    if (meta?.voice) { if (keyDe(peerId) !== state.me.key) emit('voz', peerId, stream); return }
    set(s => ({ streams: { ...s.streams, [peerId]: stream } }))
  }
  actions.share.onMessage = (d, { peerId }) => {
    const was = state.shares[peerId]
    if (d?.on) {
      set(s => ({ shares: { ...s.shares, [peerId]: { ...lerShare(d), n: nomeDe(peerId) } } }))
      if (!was) { toast(`${nomeDe(peerId)} começou a projetar`); emit('som', 'telaOn', keyDe(peerId)); emit('projetou', nomeDe(peerId)) }
    } else if (was) {
      set(s => { const shares = { ...s.shares }; delete shares[peerId]; const streams = { ...s.streams }; delete streams[peerId]; return { shares, streams } })
      toast(`${nomeDe(peerId)} parou de projetar`); emit('som', 'telaOff', keyDe(peerId))
    }
  }
  actions.need.onMessage = (_, { peerId }) => {
    if (!myShare) return
    const s = myShare.stream
    try { room.removeStream(s, { target: peerId }) } catch {}
    setTimeout(() => { if (myShare?.stream === s) room.addStream(s, { target: peerId, metadata: { screen: 1 } }) }, 500)
  }
  actions.react.onMessage = (d, { peerId }) => {
    const k = keyDe(peerId)
    if (typeof d?.k === 'string') emit('react', d.k, k)
    else if (typeof d?.m === 'string') emit('meme', d.m, k)
  }
  actions.mre.onMessage = (d, { peerId }) => {
    if (Array.isArray(d?.all)) return d.all.forEach(([mid, list]) => Array.isArray(list) && list.forEach(([e, keys]) => Array.isArray(keys) && keys.forEach(k => typeof k === 'string' && setMsgReact(mid, e, k, true))))
    setMsgReact(d?.id, d?.e, keyDe(peerId), !!d?.on)
  }
  actions.jogo.onMessage = (d, { peerId }) => { const [id, x] = jogoDaMsg(d); jogos?.got(id, x, keyDe(peerId)) }
  actions.chat.onMessage = (m, { peerId }) => addMsg({ ...m, from: peerId })
  actions.hist.onMessage = list => Array.isArray(list) && list.forEach(m => !m.sys && addMsg(m, true))
  actions.spk.onMessage = (d, { peerId }) => { if (state.peers[peerId]) setPeer(peerId, { speaking: !!d }) }
  actions.pausa.onMessage = (_, { peerId }) => {
    const n = nomeDe(peerId)
    if (myShare?.kind === 'arquivo' && !myShare.video.paused) { myShare.video.pause(); toast(`${n} pediu pausa · pausei o vídeo`, 5000) } else toast(`${n} pediu pausa`, 5000)
    sysMsg(`${n} pediu pausa`); emit('som', 'chat')
  }
  actions.leg.onMessage = (d, { peerId }) => { const t = typeof d?.t === 'string' ? d.t.slice(0, 400) : ''; setTimeout(() => set(s => ({ subs: { ...s.subs, [peerId]: t } })), 200) }
  actions.adm.onMessage = (d, { peerId }) => onAdmin(d, peerId)
  actions.ctl.onMessage = (d, { peerId }) => gotCtl(d, nomeDe(peerId))
  actions.mid.onMessage = () => {}
  actions.rad.onMessage = () => {}

  api('sala?r=' + roomId).then(r => { if (r?.layout) set({ layout: cleanLayout(r.layout, PEOPLE) }) })
  if (mic) room.addStream(mic, { metadata: { voice: 1 } })
  heartbeat().finally(loadHistory)
  clearInterval(presTimer); presTimer = setInterval(heartbeat, 15000)
  emit('som', 'euEntrei')
}

async function heartbeat() {
  if (!room) return
  const proj = myShare ? { t: myShare.titulo || '', k: myShare.kind } : null
  const r = await api('sala', { method: 'POST', body: { op: 'aqui', r: state.roomId, pw: state.pw, key: state.me.key, name: state.me.name, slug: '', filme: CFG.subtitulo || '', est: null, ev: [], proj, registra: !/^teste/i.test(state.canal) } })
  if (!Array.isArray(r?.pres)) return
  const direct = new Set(Object.values(state.peers).map(p => p.key))
  const srvPres = {}
  r.pres.forEach(x => { if (x.key !== state.me.key && !direct.has(x.key)) srvPres[x.key] = x.name })
  set({ srvPres, callIni: r.callIni || state.callIni })
}
async function loadHistory() {
  const r = await api(`chat?r=${state.roomId}&desde=${state.callIni || Date.now() - 60e3}`)
  if (Array.isArray(r?.list)) r.list.forEach(m => addMsg(m, true))
  if (r?.re && typeof r.re === 'object') for (const [id, byE] of Object.entries(r.re)) for (const [e, keys] of Object.entries(byE || {})) (Array.isArray(keys) ? keys : []).forEach(k => setMsgReact(id, e, k, true))
}

export function sair(motivo = '') {
  clearInterval(presTimer)
  if (state.roomId && state.me.key) api('sala', { method: 'POST', body: { op: 'saiu', r: state.roomId, key: state.me.key } })
  pararProjecao()
  try { actions?.hello.send({ ...helloDe(state.me), sai: 1 }) } catch {}
  try { room?.leave() } catch {}
  room = null; actions = null
  emit('saiu')
  set({ fase: motivo ? 'expulso' : 'fora', motivo, peers: {}, streams: {}, shares: {}, srvPres: {} })
}
addEventListener('beforeunload', () => { if (state.roomId && state.me.key) navigator.sendBeacon('api/sala', new Blob([JSON.stringify({ op: 'saiu', r: state.roomId, key: state.me.key })], { type: 'application/json' })) })

export async function trocarCanal(canal) {
  const { pw, me } = state
  sair()
  await entrar({ pw, key: me.key, name: me.name, canal })
}

/* ---------- chat e reações ---------- */
export function enviarChat(text, re) {
  const m = { id: `${selfId}-${msgN++}`, from: selfId, key: state.me.key, name: state.me.name, text, ts: Date.now() }
  if (re) m.re = re
  addMsg(m)
  emit('msg', m)
  actions?.chat.send(m)
  const { from, ...keep } = m
  api('chat', { method: 'POST', body: { r: state.roomId, m: keep } })
}
function setMsgReact(id, e, key, on) {
  if (!key || typeof id !== 'string' || typeof e !== 'string') return
  set(s => {
    const cur = s.msgReacts[id]?.[e] || []
    if (on === cur.includes(key)) return {}
    const next = on ? [...cur, key] : cur.filter(k => k !== key)
    return { msgReacts: { ...s.msgReacts, [id]: { ...s.msgReacts[id], [e]: next } } }
  })
}
export function reagirMsg(id, e) {
  const on = !state.msgReacts[id]?.[e]?.includes(state.me.key)
  setMsgReact(id, e, state.me.key, on)
  actions?.mre.send({ id, e, on })
  api('chat', { method: 'POST', body: { r: state.roomId, re: { id, e, k: state.me.key, on } } })
}
export function reagir(id) { emit('react', id, state.me.key); actions?.react.send({ k: id }) }
export const pedirPausa = () => { actions?.pausa.send(1); toast('Pedido de pausa enviado') }
export const pedirTela = peerId => actions?.need.send(1, { target: peerId })
export const controlar = (peerId, op, d) => actions?.ctl.send({ op, d }, { target: peerId })

/* ---------- voz e projeção ---------- */
export function setMicStream(stream) {
  if (stream === mic) return
  if (mic && room) try { room.removeStream(mic) } catch {}
  mic = stream
  if (mic && room) room.addStream(mic, { metadata: { voice: 1 } })
}

function shareMsg() {
  const v = myShare.video
  return { on: true, kind: myShare.kind, game: !!myShare.game, paused: !!myShare.paused, subs: !!myShare.subs, t: v ? v.currentTime : undefined, duration: v?.duration || 0, rate: v?.playbackRate || 1, preview: '', quality: 'auto' }
}
export function projetar(stream, opts = {}) {
  pararProjecao(true)
  myShare = { stream, ...opts }
  room?.addStream(stream, { metadata: { screen: 1 } })
  actions?.share.send(shareMsg())
  set(s => ({ streams: { ...s.streams, [selfId]: stream }, shares: { ...s.shares, [selfId]: { kind: opts.kind, mine: true, n: 'Você' } } }))
  emit('som', 'telaOn')
  if (opts.video) {
    const v = opts.video
    const onState = () => { if (myShare?.video !== v) return; myShare.paused = v.paused; actions?.share.send(shareMsg()) }
    ;['pause', 'play', 'seeked', 'ratechange', 'ended'].forEach(e => v.addEventListener(e, onState))
    myShare.tick = setInterval(() => actions?.share.send(shareMsg()), 5000)
  }
}
export function pararProjecao(silencioso) {
  if (!myShare) return
  const s = myShare
  myShare = null
  clearInterval(s.tick)
  try { room?.removeStream(s.stream) } catch {}
  actions?.share.send({ on: false })
  s.stream.getTracks().forEach(t => t.stop())
  s.cleanup?.()
  set(st => { const streams = { ...st.streams }; delete streams[selfId]; const shares = { ...st.shares }; delete shares[selfId]; return { streams, shares } })
  if (!silencioso) emit('som', 'telaOff')
}
export const minhaProjecao = () => myShare
export function enviarLegenda(t) { actions?.leg.send({ t }); set(s => ({ subs: { ...s.subs, [selfId]: t } })) }
// troca a tela/janela sem parar a transmissão
export function trocarTrilha(velha, nova) {
  if (!myShare) return
  try { room?.replaceTrack(velha, nova) } catch (e) { console.warn(e) }
  myShare.stream.removeTrack(velha); myShare.stream.addTrack(nova); velha.stop()
}

function gotCtl(d, name) {
  const v = myShare?.kind === 'arquivo' && myShare.video
  if (!v || !d) return
  if (d.op === 'rate' && [0.5, 1, 1.25, 1.5, 2].includes(+d.d)) v.playbackRate = +d.d
  else if (d.op === 'toggle') { if (v.paused) v.play().catch(() => {}); else v.pause(); toast(`${name} ${v.paused ? 'pausou' : 'deu play'}`) }
  else if (d.op === 'at' && Number.isFinite(+d.d)) v.currentTime = Math.max(0, Math.min(v.duration || 1e9, +d.d))
  else if (d.op === 'seek' && Number.isFinite(+d.d)) v.currentTime = Math.max(0, Math.min(v.duration || 1e9, v.currentTime + Math.max(-60, Math.min(60, +d.d))))
}

/* ---------- admin (só valida e obedece; os botões de admin ficam no site) ---------- */
const okTok = new Map()
async function validTok(tok) {
  if (typeof tok !== 'string') return false
  if (!okTok.has(tok)) { const { sha } = await import('@site/core/rede.js'); okTok.set(tok, await sha('admin:' + tok) === CFG.adminHash) }
  return okTok.get(tok)
}
async function onAdmin(d, peerId) {
  if (!d || !await validTok(d.tok)) return
  const who = state.peers[peerId]?.name || 'O admin'
  if (d.op === 'mute') { emit('mutar'); toast(`${who} te mutou`) }
  else if (d.op === 'stop') { pararProjecao(); toast(`${who} parou sua projeção`) }
  else if (d.op === 'kick') sair(`${who} te tirou da sala.`)
  else if (d.op === 'clear') { set({ messages: [], msgReacts: {} }); sysMsg(`${who} limpou o chat`) }
  else if (d.op === 'sala' && d.layout) set({ layout: cleanLayout(d.layout, PEOPLE) })
  else if (d.op === 'aviso') set({ banner: d.text ? d : null })
  else if (d.op === 'reset' && (d.key === state.me.key || d.key === '*')) trocarCanal(state.canal)
}

/* ---------- jogos: canal de mensagens ---------- */
export const enviarJogo = (d, target) => actions?.jogo.send(d, target ? { target } : undefined)
export function enviarJogoPara(key, d) {
  const ids = Object.entries(state.peers).filter(([, p]) => p.key === key).map(([id]) => id)
  if (ids.length) actions?.jogo.send(d, { target: ids })
}
export const presentes = () => [...new Set([state.me.key, ...Object.values(state.peers).map(p => p.key)].filter(Boolean))]
export const nomeDaKey = k => k === state.me.key ? state.me.name : Object.values(state.peers).find(p => p.key === k)?.name || person(k).nome

/* ---------- canais (lista do servidor) ---------- */
export async function carregarCanais() {
  const r = await api('sala', { method: 'POST', body: { op: 'canais', pw: state.pw } })
  return Array.isArray(r?.canais) ? r.canais : []
}
export async function criarCanal(nome) {
  const r = await api('sala', { method: 'POST', body: { op: 'canal-novo', pw: state.pw, nome, key: state.me.key } })
  return r
}
