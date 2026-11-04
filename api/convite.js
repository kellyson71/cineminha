import { createHash, randomBytes } from 'node:crypto'
import { redis, json, readBody } from './_redis.js'
import { novaConta } from './conta.js'
import cfg from '../public/config.js'

// Convites (ingressos): qualquer pessoa da sala cria um link /nome-do-filme com quem pode entrar.
// A senha da sala autoriza a criação; apagar um convite continua sendo ação do admin.
// Links diretos /nome-do-filme/<inicial>: um por pessoa, entram já logados e valem uma vez só.
//   GET ?s=slug          → { convite }
//   GET ?s=slug&p=ini    → prévia sem senha; não consome o ingresso
//   POST {op: resgatar, s, p, segredo} → conta; 409 se o ingresso já foi usado
//   POST {pw, ...}       → { slug, diretos: { key: inicial + fragmento secreto } }
//   DELETE {tok, s}
const DIAS = 45
const okSlug = s => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,60}$/.test(s)
const slugify = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'sessao'
const isAdmin = tok => createHash('sha256').update('admin:' + String(tok || '')).digest('hex') === cfg.adminHash
const isRoomPw = pw => createHash('sha256').update(String(pw || '')).digest('hex') === cfg.senhaHash
// a menor inicial que não confunde com ninguém (kauan → ka, kellyson → ke, otavio → o)
export function iniciais() {
  const ids = (cfg.pessoas || []).map(p => p.id)
  const out = {}
  for (const id of ids) { let n = 1; while (n < id.length && ids.some(o => o !== id && o.startsWith(id.slice(0, n)))) n++; out[id] = id.slice(0, n) }
  return out
}
const publico = ({ pw, diretos, ...c }, grupo = true) => grupo ? { ...c, pw } : c
// quem já ocupou o lugar: pelo link de grupo ou resgatando o ingresso pessoal
async function ocupados(s, conv) {
  const out = new Set((await redis('SMEMBERS', `conv-ocup:${s}`)) || [])
  for (const [ini, d] of Object.entries(conv.diretos || {})) if (!out.has(d.key) && await redis('EXISTS', `conv-uso:${s}:${ini}`)) out.add(d.key)
  return [...out]
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const u = new URL(req.url, 'http://x').searchParams
      const s = u.get('s'), p = u.get('p')
      if (!okSlug(s)) return json(res, 400, { error: 'convite' })
      const raw = await redis('GET', `conv:${s}`)
      if (!raw) return json(res, 404, { error: 'convite' })
      const conv = JSON.parse(raw)
      conv.ocupados = await ocupados(s, conv)
      if (p == null) return json(res, 200, { convite: publico(conv) })
      // Prévia do link pessoal nunca consome o ingresso nem revela a senha.
      return json(res, 200, { convite: publico(conv, false) })
    }
    const b = await readBody(req)
    // Link de grupo: quem escolhe o cartão "ocupa" o lugar; o cartão some para os próximos
    if (req.method === 'POST' && b.op === 'ocupar') {
      if (!okSlug(b.s) || typeof b.key !== 'string') return json(res, 400, { error: 'lugar' })
      const raw = await redis('GET', `conv:${b.s}`)
      if (!raw) return json(res, 404, { error: 'convite' })
      const conv = JSON.parse(raw)
      if (conv.pw !== b.pw || !isRoomPw(b.pw)) return json(res, 403, { error: 'senha' })
      if (!conv.pessoas.includes(b.key)) return json(res, 200, { ok: true }) // fora da lista (dono/convidado): não ocupa nada
      if ((await ocupados(b.s, conv)).includes(b.key)) return json(res, 200, { ok: false, ocupado: true })
      await redis('SADD', `conv-ocup:${b.s}`, b.key)
      await redis('EXPIRE', `conv-ocup:${b.s}`, DIAS * 86400)
      return json(res, 200, { ok: true })
    }
    if (req.method === 'POST' && b.op === 'resgatar') {
      if (!okSlug(b.s) || !/^[a-z0-9]{1,12}$/.test(b.p || '') || !/^[a-f0-9]{48}$/.test(b.segredo || '')) return json(res, 400, { error: 'ingresso inválido' })
      const raw = await redis('GET', `conv:${b.s}`)
      if (!raw) return json(res, 404, { error: 'convite' })
      const conv = JSON.parse(raw), d = conv.diretos?.[b.p]
      if (!d || d.segredo !== createHash('sha256').update(b.segredo).digest('hex')) return json(res, 403, { error: 'ingresso inválido' })
      if (!isRoomPw(conv.pw)) return json(res, 410, { error: 'convite expirado' })
      const lockKey = `conv-uso:${b.s}:${b.p}`
      const lock = await redis('SET', lockKey, '1', 'NX', 'EX', DIAS * 86400)
      if (lock) { await redis('SADD', `conv-ocup:${b.s}`, d.key); await redis('EXPIRE', `conv-ocup:${b.s}`, DIAS * 86400) }
      if (!lock) return json(res, 409, { error: 'ingresso já usado', usado: true })
      try {
        const nome = (cfg.pessoas || []).find(x => x.id === d.key)?.nome || d.key
        const token = await novaConta(d.key, nome, conv.pw)
        return json(res, 200, { convite: publico(conv), conta: { token, key: d.key, nome, pw: conv.pw } })
      } catch (e) { await redis('DEL', lockKey); throw e }
    }
    if (req.method === 'POST') {
      const ids = new Set((cfg.pessoas || []).map(p => p.id))
      const pessoas = (Array.isArray(b.pessoas) ? b.pessoas : []).filter(id => ids.has(id)).slice(0, 30)
      if (!isRoomPw(b.pw)) return json(res, 400, { error: 'senha' })
      if (!pessoas.length && !b.convidados) return json(res, 400, { error: 'pessoas' })
      const ini = iniciais()
      const secretos = Object.fromEntries(pessoas.map(k => [k, randomBytes(24).toString('hex')]))
      const conv = {
        filme: String(b.filme || '').slice(0, 80),
        quando: '',
        ano: String(b.ano || '').slice(0, 12),
        nota: b.nota != null && Number.isFinite(+b.nota) && +b.nota >= 0 && +b.nota <= 10 ? +b.nota : null,
        fonteNota: ['IMDb', 'TMDB'].includes(b.fonteNota) ? b.fonteNota : '',
        sinopse: String(b.sinopse || '').slice(0, 1200),
        pessoas,
        convidados: !!b.convidados,
        pw: String(b.pw),
        sala: /^[\w-]{0,40}$/.test(b.sala || '') ? b.sala || '' : '',
        tema: /^[\w-]{0,40}$/.test(b.tema || '') ? b.tema || '' : '',
        sessao: okSlug(b.sessao) ? b.sessao : '',
        poster: /^https:\/\//.test(b.poster || '') ? String(b.poster).slice(0, 500) : '',
        ...(b.diretos ? { diretos: Object.fromEntries(pessoas.map(k => [ini[k], { key: k, segredo: createHash('sha256').update(secretos[k]).digest('hex') }])) } : {}),
        criado: Date.now(),
      }
      // nome do filme no link; se já existir, ganha um número
      const base = slugify(conv.filme || 'vem-pro-cineminha')
      let slug = base
      for (let i = 2; i < 50; i++) {
        const ok = await redis('SET', `conv:${slug}`, JSON.stringify(conv), 'NX', 'EX', DIAS * 86400)
        if (ok) return json(res, 200, { slug, diretos: b.diretos ? Object.fromEntries(pessoas.map(k => [k, ini[k] + '#ticket=' + secretos[k]])) : null })
        slug = `${base}-${i}`
      }
      return json(res, 409, { error: 'slug' })
    }
    if (req.method === 'DELETE') {
      if (!isAdmin(b.tok)) return json(res, 403, { error: 'admin' })
      if (!okSlug(b.s)) return json(res, 400, { error: 'convite' })
      await redis('DEL', `conv:${b.s}`)
      return json(res, 200, { ok: true })
    }
    json(res, 405, { error: 'método' })
  } catch (e) { json(res, 500, { error: String(e.message || e) }) }
}
