import { redis, json, readBody } from './_redis.js'

// Preferências por pessoa (volumes, sons, modo de voz…), para valer em qualquer computador
const okKey = k => typeof k === 'string' && k.length > 0 && k.length <= 40
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const k = new URL(req.url, 'http://x').searchParams.get('k')
      if (!okKey(k)) return json(res, 400, { error: 'k' })
      const s = await redis('GET', `prefs:${k}`)
      return json(res, 200, { prefs: s ? JSON.parse(s) : null })
    }
    if (req.method === 'PUT') {
      const b = await readBody(req)
      const s = JSON.stringify(b.prefs || {})
      if (!okKey(b.k) || s.length > 32000) return json(res, 400, { error: 'prefs' })
      await redis('SET', `prefs:${b.k}`, s)
      return json(res, 200, { ok: true })
    }
    json(res, 405, { error: 'método' })
  } catch (e) { json(res, 500, { error: String(e.message || e) }) }
}
