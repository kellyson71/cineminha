import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { person, poseUrl, asset, POSES } from '../data.js'
import { Icon, Pfp } from './ui.jsx'
import { PersonAudio } from './PersonAudio.jsx'

// key -> elemento da arte (para as reações saírem da cabeça de quem reagiu)
export const seatArt = new Map()
const preloaded = new Set()
function preload(p) {
  if (!p.poses || preloaded.has(p.id)) return
  preloaded.add(p.id)
  POSES.forEach(n => { const u = poseUrl(p, n); if (u) new Image().src = u })
}

// dormindo (ausente) > palmas/pipoca (reação) > celular (digitando) > colo (janela escondida) > normal
function usePose(st, temp) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!temp) return
    const ms = temp.until - Date.now()
    if (ms <= 0) return
    const iv = temp.name === 'palmas' ? setInterval(() => setTick(t => t + 1), 220) : null
    const to = setTimeout(() => setTick(t => t + 1), ms + 20)
    return () => { clearInterval(iv); clearTimeout(to) }
  }, [temp])
  const active = temp && temp.until > Date.now()
  if (st.away) return 'dormindo'
  if (active) return temp.name === 'palmas' ? (tick % 2 ? 'palmas2' : 'palmas1') : temp.name
  if (st.typing) return 'celular'
  if (st.hidden) return 'colo'
  return 'base'
}

function Bubble({ msg }) {
  const [out, setOut] = useState(false)
  const [gone, setGone] = useState(false)
  useEffect(() => {
    setOut(false); setGone(false)
    const ms = Math.min(9000, 3500 + (msg.text?.length || 30) * 55)
    const a = setTimeout(() => setOut(true), ms), b = setTimeout(() => setGone(true), ms + 350)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [msg])
  if (gone) return null
  return <div className={'seat__bubble' + (out ? ' out' : '')}><span>{msg.text}</span></div>
}

const Seat = memo(function Seat({ u, mine, temp, bubble, open, onToggle, onMove, onAccount, vols, setVol }) {
  const p = person(u.key, u.name)
  const pose = usePose(u, temp)
  const hasBoneco = !!asset(p.boneco)
  const artRef = useRef(null)
  const popRef = useRef(null)
  const [arriving, setArriving] = useState(true)
  useEffect(() => { preload(p); const t = setTimeout(() => setArriving(false), 700); return () => clearTimeout(t) }, [])
  useEffect(() => { seatArt.set(u.key, { el: artRef.current, boneco: hasBoneco }); return () => seatArt.delete(u.key) }, [u.key, hasBoneco])
  // a janelinha não sai da tela
  useLayoutEffect(() => {
    const pop = popRef.current
    if (!open || !pop) return
    pop.style.marginLeft = '0px'; pop.style.top = ''; pop.style.bottom = ''
    let r = pop.getBoundingClientRect()
    if (r.bottom > innerHeight - 8) { pop.style.top = 'auto'; pop.style.bottom = 'calc(100% + 8px)'; r = pop.getBoundingClientRect() }
    if (r.left < 8) pop.style.marginLeft = 8 - r.left + 'px'
    else if (r.right > innerWidth - 8) pop.style.marginLeft = innerWidth - 8 - r.right + 'px'
  }, [open])

  const cls = ['seat', 'online', hasBoneco ? 'has-poses' : 'seat--pfp', p.guest && 'seat--guest', mine && 'mine', u.speaking && 'speaking',
    u.muted && 'muted', u.deaf && 'deaf', u.away && !u.speaking && 'away', u.sharing && 'sharing', arriving && 'arriving'].filter(Boolean).join(' ')
  const nm = u.name || p.nome
  const title = u.sharing ? `${nm} · projetando` : u.away ? `${nm} · ausente` : u.deaf ? `${nm} · som cortado` : nm

  return (
    <div className={cls} title={title} onContextMenu={e => { if (!e.target.closest('.pvol')) { e.preventDefault(); onToggle(u.key) } }}>
      <div className="seat__avatar" ref={artRef} onClick={() => onToggle(u.key)}>
        {hasBoneco ? <img src={poseUrl(p, pose)} alt="" draggable={false} decoding="async" /> : <Pfp pkey={u.key} size={64} name={u.name} />}
      </div>
      <span className="seat__zzz" aria-hidden="true"><i>z</i><i>z</i><i>Z</i></span>
      <span className="seat__name"><span className="seat__nm">{nm}</span><Icon name="mic-off" className="seat__muted" /><Icon name="headphone-off" className="seat__deaf" /></span>
      {bubble && <Bubble msg={bubble} />}
      {open && (
        <div className="pvol" ref={popRef} onClick={e => e.stopPropagation()}>
          {mine ? (
            <>
              <button type="button" className="btn btn--ghost pvol__account" onClick={onAccount}><Icon name="users" /><span>Minha conta</span></button>
              <div className="pvol__move">
                <span className="pvol__name">Trocar de lugar</span>
                <div className="pvol__row">
                  <button type="button" className="btn btn--ghost" title="Um lugar para a esquerda" onClick={() => onMove(-1)}><Icon name="chevron-left" /></button>
                  <small>ou use as setas</small>
                  <button type="button" className="btn btn--ghost" title="Um lugar para a direita" onClick={() => onMove(1)}><Icon name="chevron-right" /></button>
                </div>
              </div>
            </>
          ) : <PersonAudio pkey={u.key} name={u.name} vols={vols} setVol={setVol} />}
        </div>
      )}
    </div>
  )
})

export default function Seats({ people, myKey, perRow = 8, temps, bubbles, openSeat, setOpenSeat, onMove, onAccount, vols, setVol }) {
  const lines = []
  for (let i = 0; i < people.length; i += perRow) lines.push(people.slice(i, i + perRow))
  const toggle = k => setOpenSeat(o => (o === k ? null : k))
  return (
    <div className="row">
      <div className="row__seats" id="seats">
        {lines.map((l, r) => (
          <div className="row__line" key={r} style={{ '--n': l.length, '--depth': lines.length - 1 - r }}>
            {l.map(u => (
              <Seat key={u.key} u={u} mine={u.key === myKey} temp={temps[u.key]} bubble={bubbles[u.key]} open={openSeat === u.key}
                onToggle={toggle} onMove={onMove} onAccount={onAccount} vols={vols} setVol={setVol} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
