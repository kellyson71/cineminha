import { createHash } from 'node:crypto'
import { redis, json, readBody } from './_redis.js'
import cfg from '../public/config.js'

// Live no ar, para o Cineminha mostrar a janelinha. O estúdio avisa a cada 30 s enquanto está ao vivo; se ele
// fechar sem avisar, o aviso some sozinho em 90 s.
//   GET                                          → { ativa, codigo?, titulo?, inicio? }
//   POST { op: 'anuncia', tok, codigo, titulo, inicio } (tok = senha de admin do Cineminha)
//   POST { op: 'para', tok }
const CHAVE = 'live:ativa'
const isAdmin = tok => createHash('sha256').update('admin:' + String(tok || '')).digest('hex') === cfg.adminHash

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const raw = await redis('GET', CHAVE)
      const v = raw ? JSON.parse(raw) : null
      return json(res, 200, v ? { ativa: true, ...v } : { ativa: false })
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'método' })
    const b = await readBody(req, 4000)
    if (!isAdmin(b.tok)) return json(res, 403, { error: 'admin' })
    if (b.op === 'anuncia') {
      const codigo = String(b.codigo || '').toLowerCase()
      if (!/^[a-z0-9]{4,16}$/.test(codigo)) return json(res, 400, { error: 'código' })
      const v = { codigo, titulo: String(b.titulo || '').replace(/[<>]/g, '').slice(0, 80), inicio: Math.max(0, +b.inicio || 0) }
      await redis('SET', CHAVE, JSON.stringify(v), 'EX', 90)
      return json(res, 200, { ok: true })
    }
    if (b.op === 'para') { await redis('DEL', CHAVE); return json(res, 200, { ok: true }) }
    json(res, 400, { error: 'op' })
  } catch (e) { json(res, 500, { error: String(e.message || e) }) }
}
