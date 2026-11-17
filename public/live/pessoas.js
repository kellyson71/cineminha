/* Quem está na live: a amor (pelo link dela) e os amigos (logados no Cineminha, ou com um nome).
   Fotos e cores vêm dos perfis do Cineminha (api/conta?perfis=1) ou da lista de pessoas do config. */
import CFG from '../config.js'
import LIVE from './config.js'

let perfis = {}
export const perfisProntos = fetch('../api/conta?perfis=1').then(r => r.ok ? r.json() : {}).then(j => { perfis = j?.perfis || {} }).catch(() => {})
const fixa = key => (CFG.pessoas || []).find(p => p.id === key)
const caminho = f => !f ? '' : /^(https?:|data:image\/|blob:)/.test(f) ? f : '../' + String(f).replace(/^\/+/, '')

export function fotoDe(key) {
  if (key === 'ela') return LIVE.fotoCalada
  return caminho(perfis[key]?.foto || fixa(key)?.foto) || '../assets/avatar-convidado.png'
}
export const corDe = key => key === 'ela' ? '#ff9ccb' : key === 'ele' ? '#9fd8ff' : perfis[key]?.cor || fixa(key)?.cor || '#ffcf8a'

// limpa o perfil que chega pela rede (só chave e nome)
export function lerPerfil(p) {
  const key = typeof p?.key === 'string' ? p.key.slice(0, 40) : ''
  if (!key || key === 'ela' || key === 'ele') return null
  return { key, nome: String(p.nome || 'Convidado').replace(/[<>]/g, '').slice(0, 24) }
}

// quem é esta página: link dela → a amor; link dos amigos → a conta do Cineminha (ou o nome digitado)
export async function quemSou(amigo) {
  if (!amigo) return { key: 'ela', nome: LIVE.ela, ela: true }
  let t = null
  try { t = JSON.parse(localStorage.getItem('cine.conta')) } catch {}
  const r = await fetch('../api/conta' + (t ? '?t=' + encodeURIComponent(t) : ''), { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null)
  if (r?.key) return { key: r.key, nome: r.nome || fixa(r.key)?.nome || 'Convidado', logado: true }
  let nome = ''
  try { nome = localStorage.getItem('live.nome') || '' } catch {}
  return { key: nome ? 'g:' + nome.toLowerCase().trim() : '', nome, logado: false }
}
