import { createHash } from 'node:crypto'
import { redis, json, readBody } from './_redis.js'
import cfg from '../public/config.js'

// Diário de sessões: filme, data, quem foi, resumo e legenda.
//   GET                    → lista (mais recentes primeiro)
//   GET ?legenda=<id>      → texto da legenda (SRT/VTT)
//   POST  {tok, sessao}    → cria ou atualiza (admin); sessao.legenda (texto) vai separado
//   DELETE {tok, id}       → apaga (admin)
const isAdmin = tok => createHash('sha256').update('admin:' + String(tok || '')).digest('hex') === cfg.adminHash
const okId = s => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,70}$/.test(s)
const slugify = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'sessao'
const str = (v, n) => (v == null ? undefined : String(v).slice(0, n))
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

export default async function handler(req, res) {
  try {
    const u = new URL(req.url, 'http://x').searchParams
    if (req.method === 'GET') {
      const leg = u.get('legenda')
      if (leg != null) {
        if (!okId(leg)) return json(res, 400, { error: 'id' })
        const t = await redis('GET', `legenda:${leg}`)
        return t ? json(res, 200, { legenda: t }) : json(res, 404, { error: 'legenda' })
      }
      const flat = (await redis('HGETALL', 'sessoes')) || []
      const list = []
      for (let i = 0; i < flat.length; i += 2) { try { list.push(JSON.parse(flat[i + 1])) } catch {} }
      list.sort((a, b) => (b.criado || 0) - (a.criado || 0))
      const chamadas = await lerChamadas()
      // sessão planejada que já aconteceu e ficou parada: encerra sozinha com os dados da call
      const agora = Date.now()
      for (const s of list) {
        if (s.resumo) continue
        const c = chamadas.find(c => c.ini >= (s.criado || 0) - 6 * 3600e3 && agora - c.fim > 2 * 3600e3 && c.fim - c.ini > 20 * 60e3 && !c.sessao)
        if (!c) continue
        s.resumo = { presentes: c.presentes, duracao: Math.round((c.fim - c.ini) / 60000), mensagens: 0, reacoes: 0, destaque: null, fim: c.fim, auto: true }
        c.sessao = s.id
        await redis('HSET', 'sessoes', s.id, JSON.stringify(s))
        await redis('HSET', `cham:${c.id}`, 'sessao', s.id)
      }
      return json(res, 200, { list: list.slice(0, 100), chamadas: chamadas.filter(c => c.fim - c.ini >= 5 * 60e3 || c.proj.length) })
    }
    const b = await readBody(req)
    if (!isAdmin(b.tok)) return json(res, 403, { error: 'admin' })
    if (req.method === 'POST') {
      const s = b.sessao || {}
      let id = okId(s.id) ? s.id : ''
      let cur = {}
      if (id) {
        const raw = await redis('HGET', 'sessoes', id)
        if (!raw) return json(res, 404, { error: 'sessão não existe' })
        try { cur = JSON.parse(raw) } catch {}
      }
      else {
        const base = slugify(`${s.filme || 'sessao'}${s.ano ? '-' + s.ano : ''}`)
        id = base
        for (let i = 2; await redis('HEXISTS', 'sessoes', id); i++) id = `${base}-${i}`
      }
      const ids = new Set((cfg.pessoas || []).map(p => p.id))
      const r = s.resumo && typeof s.resumo === 'object' ? s.resumo : null
      const next = {
        ...cur,
        ...clean({
          id,
          filme: str(s.filme, 120), ano: str(s.ano, 8), sinopse: str(s.sinopse, 1200), poster: /^https:\/\//.test(s.poster || '') ? str(s.poster, 500) : undefined,
          quando: str(s.quando, 60), diretor: str(s.diretor, 120), duracao: str(s.duracao, 30), nota: s.nota != null && Number.isFinite(+s.nota) && +s.nota >= 0 && +s.nota <= 10 ? +s.nota : undefined, fonteNota: ['IMDb', 'TMDB'].includes(s.fonteNota) ? s.fonteNota : undefined,
          pessoas: Array.isArray(s.pessoas) ? s.pessoas.filter(x => ids.has(x)) : undefined,
          convite: okId(s.convite) ? s.convite : undefined,
          resumo: r ? {
            presentes: (Array.isArray(r.presentes) ? r.presentes : []).slice(0, 40).map(p => ({ key: str(p.key, 40), nome: str(p.nome, 24) })),
            duracao: Math.max(0, +r.duracao || 0), mensagens: Math.max(0, +r.mensagens || 0), reacoes: Math.max(0, +r.reacoes || 0),
            destaque: r.destaque ? { nome: str(r.destaque.nome, 24), texto: str(r.destaque.texto, 300), n: +r.destaque.n || 0 } : null,
            fim: Date.now(),
          } : undefined,
        }),
        criado: cur.criado || Date.now(),
      }
      if (typeof s.legenda === 'string' && s.legenda.trim()) {
        if (s.legenda.length > 900_000) return json(res, 413, { error: 'legenda grande' })
        await redis('SET', `legenda:${id}`, s.legenda)
        next.temLegenda = true
      }
      await redis('HSET', 'sessoes', id, JSON.stringify(next))
      return json(res, 200, { ok: true, sessao: next })
    }
    if (req.method === 'DELETE') {
      if (!okId(b.id)) return json(res, 400, { error: 'id' })
      await redis('HDEL', 'sessoes', b.id)
      await redis('DEL', `legenda:${b.id}`)
      return json(res, 200, { ok: true })
    }
    json(res, 405, { error: 'método' })
  } catch (e) { json(res, 500, { error: String(e.message || e) }) }
}

// sessões da call registradas sozinhas (api/sala.js): quando, quem esteve e o que foi projetado
async function lerChamadas() {
  const ids = (await redis('ZREVRANGE', 'chamadas', 0, 59)) || []
  const out = []
  const todos = await Promise.all(ids.map(id => redis('HGETALL', `cham:${id}`).catch(() => [])))
  for (const [n, id] of ids.entries()) {
    const flat = todos[n] || []
    if (!flat.length) continue
    const h = {}
    for (let i = 0; i < flat.length; i += 2) h[flat[i]] = flat[i + 1]
    const presentes = Object.keys(h).filter(k => k.startsWith('p:')).map(k => ({ key: k.slice(2), nome: h[k] }))
    const proj = Object.keys(h).filter(k => k.startsWith('x:')).map(k => { try { return JSON.parse(h[k]) } catch { return null } }).filter(Boolean).sort((a, b) => b.ms - a.ms)
    out.push({ id, ini: +h.ini || 0, fim: +h.fim || 0, sessao: h.sessao || null, titulo: h.titulo || null, presentes, proj })
  }
  return out
}
