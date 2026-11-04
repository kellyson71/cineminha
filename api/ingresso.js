// HTML com Open Graph no servidor: previews de WhatsApp/Discord não executam JS.
import { readFile } from 'node:fs/promises'
import { redis } from './_redis.js'
import cfg from '../public/config.js'
const esc = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export default async function handler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) { res.statusCode = 405; return res.end() }
  const u = new URL(req.url, 'http://x')
  const slug = u.searchParams.get('s') || u.pathname.split('/').filter(Boolean)[0]
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(slug || '')) { res.statusCode = 404; return res.end('Convite não encontrado') }
  let inv
  try { const raw = await redis('GET', `conv:${slug}`); inv = raw ? JSON.parse(raw) : null } catch {}
  const title = inv?.filme ? `${inv.filme} · ${cfg.nome}` : `Bora pro ${cfg.nome}?`
  const description = inv ? (inv.sinopse || 'A sala está aberta. Entra aí para assistir com a gente!') : 'Abra o Cineminha para assistir com os amigos.'
  const poster = /^https:\/\//.test(inv?.poster || '') ? inv.poster : ''
  let html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
  const tags = `<meta property="og:type" content="website">\n<meta property="og:site_name" content="${esc(cfg.nome)}">\n<meta property="og:title" content="${esc(title)}">\n<meta property="og:description" content="${esc(description.slice(0, 250))}">\n<meta name="description" content="${esc(description.slice(0, 250))}">\n<meta name="twitter:card" content="${poster ? 'summary_large_image' : 'summary'}">\n${poster ? `<meta property="og:image" content="${esc(poster)}">\n<meta property="og:image:alt" content="${esc(inv.filme)}">\n<meta name="twitter:image" content="${esc(poster)}">` : ''}`
  html = html.replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`).replace('</head>', tags + '\n</head>')
  res.statusCode = inv ? 200 : 404
  res.setHeader('content-type', 'text/html; charset=utf-8'); res.setHeader('cache-control', 'no-store')
  res.end(req.method === 'HEAD' ? undefined : html)
}
