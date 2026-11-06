import { memo } from 'react'
import { person } from '../data.js'
import { Icon, Pfp } from './ui.jsx'

export const CHANNELS = [
  ['voice', 'Voz', 'mic'],
  ['movie', 'Projeção', 'film'],
  ['board', 'Soundboard', 'volume-2'],
  ['effects', 'Efeitos', 'bell'],
]
const pct = v => Math.round(v * 100) + '%'

// Volume de cada canal de uma pessoa: { [key]: { voice: 1, voiceMute: false, ... } }
export const PersonRows = memo(function PersonRows({ pkey, vols, setVol }) {
  const p = vols[pkey] || {}
  return CHANNELS.map(([kind, label, ic]) => {
    const v = p[kind] ?? 1, muted = !!p[kind + 'Mute']
    return (
      <div className="person-audio__row" key={kind}>
        <button type="button" className="person-audio__mute" aria-pressed={muted} title={'Mutar ' + label.toLowerCase()} onClick={() => setVol(pkey, kind + 'Mute', !muted)}>
          <Icon name={muted ? 'volume-x' : ic} />
        </button>
        <span>{label}</span>
        <input type="range" min="0" max="2" step="0.01" value={v} aria-label={`${label} de ${person(pkey).nome}`}
          onChange={e => setVol(pkey, kind, +e.target.value)} onDoubleClick={() => setVol(pkey, kind, 1)} />
        <output>{pct(muted ? 0 : v)}</output>
      </div>
    )
  })
})

export function PersonAudio({ pkey, name, vols, setVol }) {
  return (
    <div className="person-audio">
      <div className="person-audio__head"><Pfp pkey={pkey} size={28} name={name} /><b>{name || person(pkey).nome}</b></div>
      <PersonRows pkey={pkey} vols={vols} setVol={setVol} />
    </div>
  )
}
