import { createHash, randomBytes } from 'node:crypto'
import { redis, json, readBody } from './_redis.js'
import cfg from '../public/config.js'

// Contas: quem entra uma vez fica logado neste navegador (token), e cada pessoa fixa tem um perfil (foto e cor).
//   GET  ?t=token           → { key, nome, pw } (a senha da sala vem junto para entrar sem digitar)
//   GET  ?perfis=1          → { perfis: { key: { foto, cor } } }
//   POST { op: 'login', pw, key }        → { token }
//   POST { op: 'perfil', t, foto?, cor? } → salva o perfil de quem é dono do token
//   POST { op: 'sair', t }               → apaga o token
const DIAS = 180
const okRoomPw = pw => createHash('sha256').update(String(pw || '')).digest('hex') === cfg.senhaHash
const fixa = key => (cfg.pessoas || []).find(p => p.id === key)
const okKey = k => typeof k === 'string' && (fixa(k) || /^g:[^\n]{1,24}$/.test(k))
const okTok = t => typeof t === 'string' && /^[a-f0-9]{48}$/.test(t)

export async function novaConta(key, nome, pw) {
  const token = randomBytes(24).toString('hex')
  await redis('SET', `conta:${token}`, JSON.stringify({ key, nome, pw, criado: Date.now() }), 'EX', DIAS * 86400)
  return token
}
async function dono(t) {
  if (!okTok(t)) return null
  const raw = await redis('GET', `conta:${t}`)
  const c = raw ? JSON.parse(raw) : null
  return c && okRoomPw(c.pw) ? c : null
}

export default async function handler(req, res) {
  try {
    const u = new URL(req.url, 'http://x').searchParams
    if (req.method === 'GET') {
      if (u.get('perfis')) {
        const flat = (await redis('HGETALL', 'perfis')) || []
        const perfis = {}
        for (let i = 0; i < flat.length; i += 2) { try { perfis[flat[i]] = JSON.parse(flat[i + 1]) } catch {} }
        return json(res, 200, { perfis })
      }
      const c = await dono(u.get('t'))
      if (!c || !okRoomPw(c.pw)) return json(res, 404, { error: 'conta' }) // senha da sala mudou: entra de novo
      await redis('EXPIRE', `conta:${u.get('t')}`, DIAS * 86400) // renova enquanto usar
      return json(res, 200, { key: c.key, nome: c.nome, pw: c.pw })
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'método' })
    const b = await readBody(req, 180_000)
    if (b.op === 'login') {
      if (!okRoomPw(b.pw) || !okKey(b.key)) return json(res, 400, { error: 'login' })
      const nome = fixa(b.key)?.nome || String(b.nome || b.key.slice(2)).slice(0, 24)
      return json(res, 200, { token: await novaConta(b.key, nome, b.pw) })
    }
    const c = await dono(b.t)
    if (!c) return json(res, 403, { error: 'conta' })
    if (b.op === 'perfil') {
      if (!fixa(c.key)) return json(res, 400, { error: 'só pessoas fixas têm perfil' })
      let cur = {}
      try { cur = JSON.parse(await redis('HGET', 'perfis', c.key)) || {} } catch {}
      if (b.foto === null) delete cur.foto
      else if (b.foto != null) {
        if (typeof b.foto !== 'string' || !/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(b.foto) || b.foto.length > 160_000) return json(res, 400, { error: 'foto' })
        cur.foto = b.foto
      }
      if (b.cor === null) delete cur.cor
      else if (b.cor != null) { if (!/^#[0-9a-f]{6}$/i.test(b.cor)) return json(res, 400, { error: 'cor' }); cur.cor = b.cor }
      await redis('HSET', 'perfis', c.key, JSON.stringify(cur))
      return json(res, 200, { ok: true, perfil: cur })
    }
    if (b.op === 'sair') { await redis('DEL', `conta:${b.t}`); return json(res, 200, { ok: true }) }
    json(res, 400, { error: 'op' })
  } catch (e) { json(res, 500, { error: String(e.message || e) }) }
}
