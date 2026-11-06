import { memo } from 'react'
import { ICONS, person, asset } from '../data.js'

// Ícone Lucide igual ao do site (svg[data-icon] herda o CSS original)
export const Icon = memo(function Icon({ name, className }) {
  return (
    <svg data-icon={name} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] || '' }} />
  )
})

export const Pfp = memo(function Pfp({ pkey, size, name, className = '' }) {
  const p = person(pkey, name)
  const src = asset(p.foto)
  if (!src) {
    return <span className={'pfp pfp--txt ' + className} style={{ background: p.cor, width: size, height: size, fontSize: Math.round(size * 0.45) }}>{(p.nome || '?')[0].toUpperCase()}</span>
  }
  return <img className={'pfp ' + className} alt="" width={size} height={size} src={src} decoding="async" draggable={false} />
})

// Interruptor no mesmo formato do site (label.check)
export function Check({ checked, onChange, title, children }) {
  return (
    <label className="check" title={title}>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
      <span><b>{children}</b></span>
    </label>
  )
}
