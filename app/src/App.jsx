import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { REACTS, REACT_BY, store } from './data.js'
import { seatPlan, canSitIn } from '@site/core/plateia.js'
import * as sala from './sala/sala.js'
import { useSala, selfId } from './sala/sala.js'
import { aplicarAudio, audioCtx } from './sala/audio.js'
import { JOGOS, abreJogo, onJogos, interceptaChat } from './sala/jogos.js'
import { useDesktop } from './desktop.js'
import Lobby from './components/Lobby.jsx'
import Top from './components/Top.jsx'
import Stage from './components/Stage.jsx'
import Toolbar from './components/Toolbar.jsx'
import Seats, { seatArt } from './components/Seats.jsx'
import Chat from './components/Chat.jsx'
import { useMic } from './useMic.js'
import { projetarTela, projetarArquivo, trocarTela } from './projetar.js'

const DEFAULT_PREFS = { chatOn: true, teatro: false, chatFixo: false, vmode: 'open', gameMode: false, duck: true, spatial: false, nudges: true, subs: true, notif: true }
const DEFAULT_MIX = { master: 1, movie: 1, voices: 1, board: 1, sfx: 0.7, radio: 0.5 }
let fxN = 0

export default function App() {
  const fase = useSala(s => s.fase)
  const motivo = useSala(s => s.motivo)
  const me = useSala(s => s.me)
  const peers = useSala(s => s.peers)
  const srvPres = useSala(s => s.srvPres)
  const messages = useSala(s => s.messages)
  const msgReacts = useSala(s => s.msgReacts)
  const streams = useSala(s => s.streams)
  const shares = useSala(s => s.shares)
  const subsTxt = useSala(s => s.subs)
  const layout = useSala(s => s.layout)
  const canal = useSala(s => s.canal)
  const banner = useSala(s => s.banner)
  const callIni = useSala(s => s.callIni)
  useSala(s => s.versao) // perfis atualizados: redesenha as fotos

  const [prefs, setPrefs] = useState(() => ({ ...DEFAULT_PREFS, ...store.get('prefs') }))
  const [mix, setMixState] = useState(() => ({ ...DEFAULT_MIX, ...store.get('mix') }))
  const [vols, setVols] = useState(() => store.get('vols') || {})
  const [pop, setPop] = useState(null)
  const [openSeat, setOpenSeat] = useState(null)
  const [focusId, setFocusId] = useState(null)
  const [temps, setTemps] = useState({})
  const [bubbles, setBubbles] = useState({})
  const [toast, setToast] = useState({ text: '', show: false })
  const [fx, setFx] = useState([])
  const [palco, setPalco] = useState(false)
  const [fs, setFs] = useState(false)
  const [canais, setCanais] = useState([])
  const [jogosOn, setJogosOn] = useState([])
  const [busy, setBusy] = useState('')
  const theaterRef = useRef(null)
  const toastTimer = useRef()
  const mic = useMic(prefs.micId)
  const desktop = useDesktop({ prefs, setPref: (k, v) => setPref(k, v), fase, sharing: !!streams[selfId], playing: Object.keys(streams).length > 0 })

  const setPref = useCallback((k, v) => setPrefs(p => { const n = { ...p, [k]: v }; store.set('prefs', n); return n }), [])
  const setMix = useCallback((k, v) => setMixState(p => { const n = { ...p, [k]: v }; store.set('mix', n); return n }), [])
  const setVol = useCallback((key, k, v) => setVols(p => { const n = { ...p, [key]: { ...p[key], [k]: v } }; store.set('vols', n); return n }), [])
  const showToast = useCallback((text, ms = 2800) => { setToast({ text, show: true }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), ms) }, [])
  const togglePop = useCallback(k => { setOpenSeat(null); setPop(p => (k && p !== k ? k : null)) }, [])

  // entrar (e voltar sozinho na próxima vez, como o site)
  const enter = useCallback(async ({ key, name, pw, canal }) => {
    store.set('sess', { key, name, pw })
    if (canal != null) store.set('canal', canal)
    desktop.limparConvite?.()
    audioCtx()
    await sala.entrar({ pw, key, name, canal: store.get('canal') || '' })
  }, [])
  useEffect(() => { const s = store.get('sess'); if (s?.pw && s.key && sala.getSala().fase === 'fora') enter(s) }, [])
  const logout = () => { sala.sair(); mic.stop(); store.set('ultimo', store.get('sess')); store.del('sess'); setPop(null) }

  // meu estado → sala (hello / spk)
  useEffect(() => { sala.setMicStream(mic.stream) }, [mic.stream])
  useEffect(() => { sala.setMe({ muted: mic.muted, speaking: mic.speaking && !me.deaf }) }, [mic.muted, mic.speaking, me.deaf])
  useEffect(() => aplicarAudio({ mix, vols, deaf: me.deaf }), [mix, vols, me.deaf])
  useEffect(() => {
    const vis = () => sala.setMe({ hidden: document.visibilityState === 'hidden' })
    document.addEventListener('visibilitychange', vis)
    return () => document.removeEventListener('visibilitychange', vis)
  }, [])

  // reações: sobem da cabeça do boneco (minhas e dos outros)
  const showReact = useCallback((id, key) => {
    const def = REACT_BY[id]
    const th = theaterRef.current
    if (!def || !th) return
    if (id === '1f44f') { setTemps(t => ({ ...t, [key]: { name: 'palmas', until: Date.now() + 2600 } })); sala.emitir('som', 'palmas') }
    else if (id === '1f37f') setTemps(t => ({ ...t, [key]: { name: 'pipoca', until: Date.now() + 4500 } }))
    const a = seatArt.get(key), tr = th.getBoundingClientRect()
    let x, y
    if (a?.el?.getClientRects().length) {
      const r = a.el.getBoundingClientRect()
      x = r.left - tr.left + r.width * (a.boneco ? 0.42 : 0.5); y = r.top - tr.top + r.height * (a.boneco ? 0.08 : 0)
    } else {
      const s = th.querySelector('#screenInner').getBoundingClientRect()
      x = s.right - tr.left - 60 - Math.random() * 120; y = s.bottom - tr.top - 20
    }
    setFx(f => [...f.slice(-50), { id: fxN++, def, x, y, dx: Math.random() * 70 - 35, rot: Math.random() * 30 - 15, s: 0.8 + Math.random() * 0.35, dur: 2.3 + Math.random() * 0.9 }])
  }, [])
  useEffect(() => {
    const offs = [
      sala.on('react', showReact),
      sala.on('msg', m => { setBubbles(b => ({ ...b, [m.key]: m })); if (m.key !== sala.getSala().me.key) sala.emitir('som', 'chat') }),
      sala.on('toast', showToast),
      sala.on('mutar', () => mic.setMute(true)),
      sala.on('balao', (key, text) => setBubbles(b => ({ ...b, [key]: { id: 'b' + fxN++, key, text } }))),
      onJogos(setJogosOn),
    ]
    return () => offs.forEach(f => f())
  }, [showReact, showToast, mic.setMute])

  // quem está na sala, na ordem das poltronas (a mesma planta do site)
  const people = useMemo(() => {
    if (fase !== 'dentro') return []
    const byKey = new Map([[me.key, { ...me, sharing: !!streams[selfId] }]])
    for (const [id, p] of Object.entries(peers)) if (p.key && !byKey.has(p.key)) byKey.set(p.key, { ...p, sharing: !!streams[id] })
    for (const [key, name] of Object.entries(srvPres)) if (!byKey.has(key)) byKey.set(key, { key, name, ghost: true })
    const plan = seatPlan(layout, [...byKey.values()])
    return [...plan.placed].sort((a, b) => a[1] - b[1]).map(([key]) => byKey.get(key))
  }, [fase, me, peers, srvPres, streams, layout])
  const others = useMemo(() => people.filter(u => u.key !== me.key && !u.ghost), [people, me.key])

  const moveSeat = useCallback(d => {
    const plan = seatPlan(layout, people.map(u => ({ key: u.key, seat: u.seat })))
    const cur = plan.placed.get(me.key) ?? 0
    const outros = new Map([...plan.taken].filter(([, k]) => k !== me.key))
    for (let i = cur + d; i >= 0 && i < plan.slots.length; i += d) {
      if (canSitIn(plan.slots, outros, i, me.key)) { store.set('seat', i); return sala.setMe({ seat: i }) }
    }
    showToast('Não tem lugar livre para esse lado')
  }, [people, layout, me.key, showToast])

  // telas da projeção
  const tiles = useMemo(() => Object.entries(streams).map(([id, stream]) => {
    const mine = id === selfId
    const p = peers[id]
    return { id, stream, mine, key: mine ? me.key : p?.key, who: mine ? 'Você' : p?.name || '…', kind: shares[id]?.kind || 'tela', paused: !!shares[id]?.paused, video: mine ? sala.minhaProjecao()?.video : null, sub: prefs.subs ? subsTxt[id] || '' : '' }
  }), [streams, peers, shares, subsTxt, prefs.subs, me.key])
  const sharing = !!streams[selfId]
  const remoteTiles = tiles.filter(t => !t.mine)

  const doShare = useCallback(async what => {
    setPop(null)
    try {
      if (what === 'tela') await projetarTela({ game: prefs.gameMode, audio: desktop.audioFonte })
      else await projetarArquivo(what, setBusy)
    } catch (e) { if (e?.message) showToast(e.message, 5000) } finally { setBusy('') }
  }, [prefs.gameMode, desktop.audioFonte, showToast])

  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen()
    else theaterRef.current?.requestFullscreen().catch(() => {})
  }, [])
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  const toggleMic = useCallback(() => { if (sala.getSala().me.deaf) sala.setMe({ deaf: false }); mic.toggle().catch(() => showToast('Sem acesso ao microfone')) }, [mic, showToast])
  const toggleDeaf = useCallback(() => { const d = !sala.getSala().me.deaf; if (d) mic.setMute(true); sala.setMe({ deaf: d }) }, [mic])
  desktop.useAtalhos({ toggleMic, toggleDeaf, ptt: on => { if (prefs.vmode === 'ptt') mic.setMute(!on).catch(() => {}) } })

  // atalhos do site
  const keys = useRef({})
  keys.current = { toggleMic, toggleDeaf, toggleFs, setPref, prefs, palco, togglePop }
  useEffect(() => {
    if (fase !== 'dentro') return
    const onKey = e => {
      const k = keys.current
      if (e.key === 'Escape') { setPop(null); setOpenSeat(null); if (k.palco) setPalco(false); return }
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return
      const c = e.key.toLowerCase()
      if (c === 'm') k.toggleMic()
      else if (c === 'd') k.toggleDeaf()
      else if (c === 'c') k.setPref('chatOn', !k.prefs.chatOn)
      else if (c === 't') k.setPref('teatro', !k.prefs.teatro)
      else if (c === 'g') setPalco(p => !p)
      else if (c === 'f') k.toggleFs()
      else if (c === 'r') k.togglePop('react')
      else if (c === 'p') sala.pedirPausa()
      else if (/^[1-9]$/.test(c) && REACTS[+c - 1]) sala.reagir(REACTS[+c - 1].id)
      else return
      e.preventDefault()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [fase])

  // aperte para falar: segure V (com a janela em foco)
  useEffect(() => {
    if (fase !== 'dentro' || prefs.vmode !== 'ptt') return
    let down = false
    const livre = e => !e.target.closest?.('input, textarea, select, [contenteditable]') && e.key.toLowerCase() === 'v'
    const kd = e => { if (livre(e) && !down) { down = true; mic.setMute(false).catch(() => {}) } }
    const ku = e => { if (down && e.key.toLowerCase() === 'v') { down = false; mic.setMute(true) } }
    const blur = () => { if (down) { down = false; mic.setMute(true) } }
    addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('blur', blur)
    mic.setMute(true)
    return () => { removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('blur', blur) }
  }, [fase, prefs.vmode, mic.setMute])

  // fecha janelinhas ao clicar fora
  useEffect(() => {
    if (!pop && !openSeat) return
    const close = e => { if (!e.target.closest('.popwrap, .pvol, .seat__avatar, .top-profile, .voice-options')) { setPop(null); setOpenSeat(null) } }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [pop, openSeat])

  // canais: lista do servidor quando abre o menu
  useEffect(() => { if (pop === 'canal' || fase === 'dentro') sala.carregarCanais().then(setCanais) }, [pop, fase])
  const irCanal = id => { store.set('canal', id); setPop(null); sala.trocarCanal(id) }

  // "sessão começou agora / há 12 min" (atualiza uma vez por minuto)
  const [, setMin] = useState(0)
  useEffect(() => { const iv = setInterval(() => setMin(m => m + 1), 60000); return () => clearInterval(iv) }, [])
  const mins = callIni ? Math.floor((Date.now() - callIni) / 60000) : 0
  const tempo = mins < 1 ? 'começou agora' : mins < 60 ? `há ${mins} min` : `há ${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`

  const playing = tiles.some(t => !t.paused)
  useEffect(() => {
    const b = document.body.classList
    b.toggle('locked', fase !== 'dentro')
    b.toggle('lights-off', playing)
    b.toggle('palco-on', palco)
    b.toggle('mini-on', !!desktop.mini)
  }, [fase, playing, palco, desktop.mini])

  if (fase === 'fora') return <Lobby onEnter={enter} last={store.get('ultimo')} convite={desktop.convite} />
  if (fase === 'expulso') {
    return (
      <div className="gate"><div className="paper gate__card mic-card" role="dialog">
        <h2>Você saiu da sala</h2><p>{motivo}</p>
        <button className="btn btn--primary btn--block" type="button" onClick={() => enter(store.get('sess'))}>Entrar de novo</button>
      </div></div>
    )
  }

  const canalNome = canais.find(c => (c.id || '') === canal)?.nome || canal.replace(/-/g, ' ') || 'Principal'
  const theaterCls = ['theater', (tiles.length || jogosOn.length) && 'curtain-open', !prefs.chatOn && 'no-chat', prefs.teatro && 'teatro', prefs.chatFixo && 'chat-fixo', palco && 'palco',
    tiles.some(t => t.kind === 'arquivo') && 'has-file', ...jogosOn.map(id => JOGOS[id]?.on)].filter(Boolean).join(' ')

  return (
    <>
      <Top tempo={tempo} me={me} count={people.length} pop={pop} togglePop={togglePop} onLogout={logout} prefs={prefs} setPref={setPref}
        mics={mic.devices} micId={prefs.micId || ''} setMicId={v => setPref('micId', v)} desktop={desktop}
        canal={canal} canalNome={canalNome} canais={canais} setCanal={irCanal} meKey={me.key}
        addCanal={async n => { const r = await sala.criarCanal(n); if (r?.canal?.id) irCanal(r.canal.id); else sala.carregarCanais().then(setCanais) }} />
      {banner?.text && <div className="banner"><span>{String(banner.text).slice(0, 140)}</span></div>}
      <main id="theater" className={theaterCls} ref={theaterRef} onDoubleClick={e => { if (palco && e.target === e.currentTarget) setPalco(false) }}>
        <section className="stage">
          <div className="live" hidden={!tiles.length}>{tiles.length ? `projetando · ${tiles.map(t => (t.mine ? 'você' : t.who)).join(', ')}` : ''}</div>
          <Stage tiles={tiles} focusId={focusId} setFocusId={setFocusId} toast={toast} onFs={toggleFs} busy={busy} vols={vols} mix={mix} deaf={me.deaf}
            onRemoteToggle={id => sala.controlar(id, 'toggle')} />
          <Toolbar pop={pop} togglePop={togglePop} sharing={sharing} onShareScreen={() => doShare('tela')} onShareFile={f => doShare(f)} onStopShare={() => sala.pararProjecao()}
            onTrocar={sharing && sala.minhaProjecao()?.kind === 'tela' ? () => trocarTela({ audio: desktop.audioFonte }).catch(e => showToast(e.message)) : null}
            onPausa={remoteTiles.length ? sala.pedirPausa : null} onReload={remoteTiles.length ? () => remoteTiles.forEach(t => sala.pedirTela(t.id)) : null}
            subs={tiles.some(t => shares[t.id]?.subs) ? prefs.subs : null} setSubs={v => setPref('subs', v)}
            onReact={sala.reagir} mix={mix} setMix={setMix} others={others} vols={vols} setVol={setVol}
            muted={mic.muted} deaf={me.deaf} onMic={toggleMic} onDeaf={toggleDeaf}
            chatOn={prefs.chatOn} setChatOn={v => setPref('chatOn', v)} teatro={prefs.teatro} setTeatro={v => setPref('teatro', v)}
            palco={palco} setPalco={setPalco} onFs={toggleFs} fs={fs} prefs={prefs} setPref={setPref}
            jogos={JOGOS} jogosOn={jogosOn} onJogo={id => { setPop(null); abreJogo(id) }} desktop={desktop} />
          <Seats people={people} myKey={me.key} perRow={layout.porFileira} temps={temps} bubbles={bubbles} openSeat={openSeat} setOpenSeat={setOpenSeat}
            onMove={moveSeat} onAccount={() => { setOpenSeat(null); setPop('settings') }} vols={vols} setVol={setVol} />
        </section>
        <div className="fx" aria-hidden="true">
          {fx.map(r => (
            <div key={r.id} className="fx__react" onAnimationEnd={() => setFx(f => f.filter(x => x.id !== r.id))}
              style={{ left: r.x.toFixed(0) + 'px', top: r.y.toFixed(0) + 'px', '--dx': r.dx.toFixed(0) + 'px', '--rot': r.rot.toFixed(0) + 'deg', '--s': r.s.toFixed(2), animationDuration: r.dur.toFixed(2) + 's' }}>
              <img className="remoji" src={r.def.anim} alt="" width={46} height={46} draggable={false} />
            </div>
          ))}
        </div>
        <Chat messages={messages} myKey={me.key} msgReacts={msgReacts} onReact={sala.reagirMsg} onTyping={v => sala.setMe({ typing: v })}
          onSend={(t, re) => { if (!interceptaChat(t)) sala.enviarChat(t, re) }}
          fixo={prefs.chatFixo} onFixo={() => setPref('chatFixo', !prefs.chatFixo)} />
        {palco && <div className="palco-aviso">Palco · <b>duplo clique no fundo</b>, <b>Esc</b> ou <b>G</b> para voltar</div>}
      </main>
    </>
  )
}
