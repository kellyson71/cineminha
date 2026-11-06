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
      if (u.has('retro')) return json(res, 200, await retrospectiva(+u.get('retro') || new Date().getFullYear()))
      if (u.has('vistos')) return json(res, 200, await vistos())
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
async function lerChamadas(ids) {
  ids ||= (await redis('ZREVRANGE', 'chamadas', 0, 59)) || []
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

// Retrospectiva do ano: tudo calculado das calls registradas (horas, títulos, quem mais foi, recordes)
const HORA_BR = ms => new Date(ms - 3 * 3600e3) // horário de Brasília (sem horário de verão)
async function retrospectiva(ano) {
  const ini = Date.UTC(ano, 0, 1) + 3 * 3600e3, fim = Date.UTC(ano + 1, 0, 1) + 3 * 3600e3
  const ids = (await redis('ZRANGEBYSCORE', 'chamadas', String(ini), String(fim - 1))) || []
  const calls = (await lerChamadas(ids)).filter(c => c.fim - c.ini >= 10 * 60e3 || c.proj.length)
  const anos = [...new Set(((await redis('ZRANGE', 'chamadas', 0, -1, 'WITHSCORES')) || []).filter((_, i) => i % 2).map(t => HORA_BR(+t).getUTCFullYear()))].sort()
  const titulos = new Map(), pessoas = new Map(), proj = new Map(), meses = Array(12).fill(0), semana = Array(7).fill(0), horas = Array(24).fill(0)
  let total = 0, totalProj = 0, maior = null
  for (const c of calls) {
    const dur = Math.max(0, c.fim - c.ini), d = HORA_BR(c.ini)
    total += dur; meses[d.getUTCMonth()] += dur; semana[d.getUTCDay()]++; horas[d.getUTCHours()]++
    for (const p of c.presentes.filter(p => !/^(g:)?teste/i.test(p.key) && !/^teste/i.test(p.nome || ''))) { const x = pessoas.get(p.key) || { key: p.key, nome: p.nome, n: 0 }; x.n++; pessoas.set(p.key, x) }
    for (const x of c.proj) {
      totalProj += x.ms
      const k = (x.m?.ti || x.t).toLowerCase()
      const t = titulos.get(k) || { titulo: x.m?.ti || x.t, ms: 0, poster: '', plat: '', tipo: x.m?.tp || '', nota: null, eps: new Set(), sessoes: new Set() }
      t.ms += x.ms; t.sessoes.add(c.id)
      if (x.m) { t.poster ||= x.m.p; t.plat ||= x.m.pl; t.nota ??= x.m.n; if (x.m.e) t.eps.add(`${x.m.s}:${x.m.e}`) }
      titulos.set(k, t)
      proj.set(x.por, (proj.get(x.por) || 0) + x.ms)
    }
    const principal = [...c.proj].sort((a, b) => b.ms - a.ms)[0]
    if (!maior || dur > maior.ms) maior = { ms: dur, ini: c.ini, titulo: principal && !/^tela de /i.test(principal.t) ? principal.m?.ti || principal.t : '', presentes: c.presentes.length }
  }
  const generico = t => /^tela de /i.test(t.titulo)
  const top = [...titulos.values()].filter(t => t.ms >= 5 * 60e3 && !generico(t)).sort((a, b) => b.ms - a.ms).slice(0, 10)
    .map(t => ({ titulo: t.titulo, ms: t.ms, poster: t.poster, plat: t.plat, tipo: t.tipo, nota: t.nota, eps: t.eps.size, sessoes: t.sessoes.size }))
  return {
    ano, anos, sessoes: calls.length, ms: total, msProj: totalProj, maior,
    titulos: top, pessoas: [...pessoas.values()].sort((a, b) => b.n - a.n).slice(0, 12),
    projetou: [...proj.entries()].map(([nome, ms]) => ({ nome, ms })).sort((a, b) => b.ms - a.ms).slice(0, 5),
    meses, semana, horas,
  }
}

// filmes que a turma já viu (IMDb): das sessões cadastradas (pela capa) e do que foi reconhecido nas calls
async function vistos() {
  const out = new Set()
  const flat = (await redis('HGETALL', 'sessoes')) || []
  for (let i = 1; i < flat.length; i += 2) { const m = String(flat[i]).match(/tt\d{5,12}/); if (m) out.add(m[0]) }
  const ids = (await redis('ZRANGE', 'chamadas', 0, -1)) || []
  for (const c of await lerChamadas(ids)) for (const x of c.proj) if (x.m?.i) out.add(x.m.i)
  return { imdb: [...out] }
}
