import { createHash, randomBytes } from 'node:crypto'
import { redis, json, readBody } from './_redis.js'
import cfg from '../public/config.js'

// Histórico do chat por sala (as últimas 500 mensagens)
const MAX = 500
const okRoom = r => typeof r === 'string' && /^[a-f0-9x]{6,64}$/.test(r)
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const u = new URL(req.url, 'http://x').searchParams, r = u.get('r')
      // imagem enviada no chat
      const img = u.get('img')
      if (img) {
        if (!/^[a-f0-9]{24}$/.test(img)) return json(res, 400, { error: 'img' })
        const data = await redis('GET', `img:${img}`)
        const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(data || '')
        if (!m) return json(res, 404, { error: 'img' })
        res.statusCode = 200; res.setHeader('content-type', m[1]); res.setHeader('cache-control', 'public, max-age=31536000, immutable')
        return res.end(Buffer.from(m[2], 'base64'))
      }
      // memes enviados pelo pessoal (valem para todas as salas)
      if (u.get('memes')) {
        const flat = (await redis('HGETALL', 'memes')) || []
        const list = []
        for (let i = 0; i < flat.length; i += 2) { try { list.push({ id: flat[i], ...JSON.parse(flat[i + 1]) }) } catch {} }
        list.sort((a, b) => (b.ts || 0) - (a.ts || 0))
        res.setHeader('cache-control', 'no-store')
        return json(res, 200, { list })
      }
      if (!okRoom(r)) return json(res, 400, { error: 'sala' })
      const n = Math.max(1, Math.min(150, +u.get('n') || 150))
      const raw = await redis('LRANGE', `chat:${r}`, 0, n - 1)
      // chat da sessão: só o que veio desde o começo dela (o resto continua guardado)
      const desde = +u.get('desde') || 0
      const list = raw.map(s => { try { return JSON.parse(s) } catch { return null } }).filter(m => m && (!desde || (m.ts || 0) >= desde)).reverse()
      // reações nas mensagens: hash msgId -> {emoji: [keys]}
      const flat = (await redis('HGETALL', `chatre:${r}`)) || []
      const ids = new Set(list.map(m => m.id))
      const re = {}
      for (let i = 0; i < flat.length; i += 2) if (ids.has(flat[i])) { try { re[flat[i]] = JSON.parse(flat[i + 1]) } catch {} }
      return json(res, 200, { list, re })
    }
    const b = await readBody(req)
    if (!okRoom(b.r)) return json(res, 400, { error: 'sala' })
    if (req.method === 'POST' && b.img) {
      if (typeof b.img !== 'string' || b.img.length > 950_000 || !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(b.img)) return json(res, 400, { error: 'img' })
      const id = randomBytes(12).toString('hex')
      await redis('SET', `img:${id}`, b.img, 'EX', 60 * 86400)
      return json(res, 200, { id })
    }
    if (req.method === 'POST' && b.meme) {
      const { img, label, tags, key, name } = b.meme
      if (typeof img !== 'string' || img.length > 700_000 || !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(img)) return json(res, 400, { error: 'img' })
      const nome = String(label || '').trim().slice(0, 40)
      if (!nome) return json(res, 400, { error: 'nome' })
      if ((await redis('HLEN', 'memes')) >= 400) return json(res, 400, { error: 'cheio' })
      const id = randomBytes(12).toString('hex')
      await redis('SET', `img:${id}`, img)
      const info = { label: nome, tags: String(tags || '').slice(0, 120), by: String(key || '').slice(0, 40), byName: String(name || '').slice(0, 24), ts: Date.now() }
      await redis('HSET', 'memes', `u-${id}`, JSON.stringify(info))
      return json(res, 200, { id: `u-${id}`, ...info })
    }
    if (req.method === 'POST' && b.memeDel) {
      const id = String(b.memeDel)
      if (!/^u-[a-f0-9]{24}$/.test(id)) return json(res, 400, { error: 'id' })
      let info = null
      try { info = JSON.parse(await redis('HGET', 'memes', id)) } catch {}
      if (!info) return json(res, 404, { error: 'meme' })
      if (info.by && info.by !== String(b.key || '')) return json(res, 403, { error: 'dono' })
      await redis('HDEL', 'memes', id)
      await redis('DEL', `img:${id.slice(2)}`)
      return json(res, 200, { ok: true })
    }
    if (req.method === 'POST' && b.re) {
      const { id, e, k, on } = b.re
      if (typeof id !== 'string' || id.length > 80 || !/^[\w-]{2,20}$/.test(String(e)) || typeof k !== 'string' || k.length > 40) return json(res, 400, { error: 're' })
      let cur = {}
      try { cur = JSON.parse(await redis('HGET', `chatre:${b.r}`, id)) || {} } catch {}
      const set = new Set(cur[e] || [])
      if (on) set.add(k); else set.delete(k)
      if (set.size) cur[e] = [...set].slice(0, 50); else delete cur[e]
      if (Object.keys(cur).length) await redis('HSET', `chatre:${b.r}`, id, JSON.stringify(cur))
      else await redis('HDEL', `chatre:${b.r}`, id)
      return json(res, 200, { ok: true })
    }
    if (req.method === 'POST') {
      const m = b.m || {}
      if (typeof m.id !== 'string' || typeof m.text !== 'string' || m.text.length > 500 || (m.gif && String(m.gif).length > 600)) return json(res, 400, { error: 'msg' })
      const keep = { id: m.id.slice(0, 80), key: String(m.key || '').slice(0, 40), name: String(m.name || '').slice(0, 24), text: m.text, ts: +m.ts || Date.now(), ...(m.gif ? { gif: String(m.gif), sticker: !!m.sticker, ...(m.foto ? { foto: 1 } : {}) } : {}),
        ...(m.re && typeof m.re.id === 'string' ? { re: { id: m.re.id.slice(0, 80), name: String(m.re.name || '').slice(0, 24), text: String(m.re.text || '').slice(0, 120) } } : {}),
        ...(Number.isFinite(+m.mt) && m.mt !== null && m.mt !== '' ? { mt: Math.max(0, Math.round(+m.mt)) } : {}) }
      await redis('LPUSH', `chat:${b.r}`, JSON.stringify(keep))
      await redis('LTRIM', `chat:${b.r}`, 0, MAX - 1)
      return json(res, 200, { ok: true })
    }
    if (req.method === 'DELETE') {
      const h = createHash('sha256').update('admin:' + String(b.tok || '')).digest('hex')
      if (h !== cfg.adminHash) return json(res, 403, { error: 'admin' })
      await redis('DEL', `chat:${b.r}`)
      await redis('DEL', `chatre:${b.r}`)
      return json(res, 200, { ok: true })
    }
    json(res, 405, { error: 'método' })
  } catch (e) { json(res, 500, { error: String(e.message || e) }) }
}
