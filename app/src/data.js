// Mesma configuração, ícones e reações do site (importados direto de ../public)
import CFG from '@site/config.js'
import { ICONS } from '@site/icons.js'
import { EMOJI } from '@site/reacoes/reacoes.js'

// Só os arquivos usados pelo app entram no pacote, com hash no nome
const FILES = import.meta.glob(['@site/assets/**/*.{png,jpg,webp,svg}', '@site/reacoes/emoji/*.{png,webp}'], { eager: true, query: '?url', import: 'default' })
const BY_PATH = {}
for (const [k, url] of Object.entries(FILES)) BY_PATH[k.replace(/^.*?\/public\//, '')] = url
// arquivo do pacote (com hash) ou, se não estiver nele, o caminho como veio (foto da conta, arquivo do site)
export const asset = p => !p ? '' : /^(https?:|data:|blob:)/.test(p) ? p : BY_PATH[p.replace(/^\.?\//, '')] || p

export { CFG, ICONS }
export const PEOPLE = (CFG.pessoas || []).filter(p => !p.ausente)
// foto e cor que cada um escolheu na conta (mesmo que o site faz)
const ORIG = Object.fromEntries(PEOPLE.map(p => [p.id, { foto: p.foto, cor: p.cor }]))
export function applyPerfis(perfis) {
  for (const p of PEOPLE) { const x = perfis?.[p.id] || {}; p.foto = x.foto || ORIG[p.id].foto; p.cor = x.cor || ORIG[p.id].cor }
}
export const POSES = ['base', 'palmas1', 'palmas2', 'celular', 'colo', 'dormindo', 'pipoca']
export const REACTS = EMOJI.map(r => ({ ...r, id: r.e, still: asset(`reacoes/emoji/${r.e}.png`), anim: asset(`reacoes/emoji/${r.e}.webp`) }))
export const REACT_BY = Object.fromEntries(REACTS.map(r => [r.id, r]))

const GUEST_COLORS = ['#7dd3fc', '#a7f3d0', '#fca5a5', '#fcd34d', '#c4b5fd', '#f9a8d4', '#fdba74', '#86efac']
const GUEST = { nome: 'Convidado', cor: '#a9b6bf', ...(CFG.convidado || {}) }
export function person(key, name) {
  const p = PEOPLE.find(x => x.id === key)
  if (p) return p
  const n = name || (key || '').slice(2) || 'Visitante'
  const h = [...n].reduce((a, c) => a + c.charCodeAt(0), 0)
  return { ...GUEST, id: key, nome: n, cor: GUEST_COLORS[h % GUEST_COLORS.length], guest: true }
}
export const poseUrl = (p, pose) => (p.poses ? asset(p.poses + pose + '.webp') : '') || asset(p.boneco)

export async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('cine.' + k)) } catch { return null } },
  set(k, v) { try { localStorage.setItem('cine.' + k, JSON.stringify(v)) } catch {} },
  del(k) { try { localStorage.removeItem('cine.' + k) } catch {} },
}

export const fmtTime = ts => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
