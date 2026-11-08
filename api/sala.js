import { createHash } from 'node:crypto'
import { redis, json, readBody } from './_redis.js'
import cfg from '../public/config.js'

// Arrumação da sala (fileiras e poltronas reservadas), por sala. Só o admin muda.
// Também guarda a presença de cada sala e a lista de canais.
// quem mandou sinal nos últimos 45 s
async function presenca(r, now, comEstado) {
  const flat = (await redis('HGETALL', `pres:${r}`)) || []
  const out = []
  for (let i = 0; i < flat.length; i += 2) { try { const v = JSON.parse(flat[i + 1]); if (now - v.ts < 45e3) out.push({ key: flat[i], name: v.name, desde: v.desde || v.ts, ...(comEstado ? { est: v.est || null, ts: v.ts } : {}) }) } catch {} }
  return out
}
const okCanal = id => typeof id === 'string' && /^[\w-]{0,40}$/.test(id)
const slugify = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'canal'
const isAdmin = tok => createHash('sha256').update('admin:' + String(tok || '')).digest('hex') === cfg.adminHash
const roomOf = (pw, id) => createHash('sha256').update('sala:' + pw + (id ? ':' + id : '')).digest('hex').slice(0, 24)
async function canais(pw, now) {
  const flat = (await redis('HGETALL', 'canais')) || []
  const list = [{ id: '', nome: 'Principal', criado: 0 }]
  for (let i = 0; i < flat.length; i += 2) { try { list.push(JSON.parse(flat[i + 1])) } catch {} }
  list.sort((a, b) => (a.criado || 0) - (b.criado || 0))
  // callIni: desde quando a call dessa sala está rolando (só quando tem gente)
  return Promise.all(list.map(async c => {
    const r = roomOf(pw, c.id), pres = await presenca(r, now)
    return { ...c, r, pres, callIni: pres.length ? +(await redis('GET', `callini:${r}`)) || null : null }
  }))
}
const TEXTOS_PADRAO = [{ id: 'geral', nome: 'geral', fixo: 1 }, { id: 'indicacoes', nome: 'indicações', fixo: 1 }, { id: 'memes', nome: 'memes', fixo: 1 }]
const okRoom = r => typeof r === 'string' && /^[a-f0-9x]{6,64}$/.test(r)
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const r = new URL(req.url, 'http://x').searchParams.get('r')
      if (!okRoom(r)) return json(res, 400, { error: 'sala' })
      const s = await redis('GET', `sala:${r}`)
      return json(res, 200, { layout: s ? JSON.parse(s) : null })
    }
    if (req.method === 'POST') {
      // Presença pelo servidor: funciona mesmo quando a conexão direta (P2P) não fecha
      const b = await readBody(req)
      const now = Date.now()
      if (b.op === 'saiu') {
        if (okRoom(b.r) && typeof b.key === 'string') await redis('HDEL', `pres:${b.r}`, b.key.slice(0, 40))
        return json(res, 200, { ok: true })
      }
      if (createHash('sha256').update(String(b.pw || '')).digest('hex') !== cfg.senhaHash) return json(res, 403, { error: 'senha' })
      if (b.op === 'diag') {
        const d = b.d || {}
        const row = { ts: now, key: String(d.key || '').slice(0, 40), estado: String(d.estado || '').slice(0, 20), turn: !!d.turn, cands: (Array.isArray(d.cands) ? d.cands : []).slice(0, 6).map(String), via: String(d.via || '').slice(0, 80), ua: String(d.ua || '').slice(0, 180) }
        await redis('LPUSH', 'diag', JSON.stringify(row)); await redis('LTRIM', 'diag', 0, 299)
        return json(res, 200, { ok: true })
      }
      if (b.op === 'turn') {
        // Ponte TURN da Cloudflare: credenciais temporárias (24 h) para quando a conexão direta não fecha
        const id = process.env.CF_TURN_KEY_ID, tok = process.env.CF_TURN_API_TOKEN
        if (!id || !tok) return json(res, 200, { iceServers: [] })
        const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ ttl: 86400 }) })
        const j = await r.json().catch(() => ({}))
        // só as entradas TURN (o STUN já vem do Trystero); navegadores bloqueiam a porta 53
        const ice = (j.iceServers || []).map(x => ({ ...x, urls: [].concat(x.urls).filter(u => /^turns?:/.test(u) && !/:53\b/.test(u)) })).filter(x => x.urls.length)
        return json(res, 200, { iceServers: ice })
      }
      if (b.op === 'aqui') {
        if (!okRoom(b.r) || typeof b.key !== 'string' || !b.key) return json(res, 400, { error: 'sala' })
        const key = b.key.slice(0, 40)
        // desde quando a pessoa está online (sem pausa maior que 1 min)
        let antes = null
        try { antes = JSON.parse(await redis('HGET', `pres:${b.r}`, key)) } catch {}
        const desde = antes && now - antes.ts < 60e3 && antes.desde ? antes.desde : now
        const est = b.est && typeof b.est === 'object' && JSON.stringify(b.est).length < 6000 ? b.est : null
        const info = { name: String(b.name || '').slice(0, 24), ts: now, desde, est }
        await redis('HSET', `pres:${b.r}`, key, JSON.stringify(info))
        await redis('EXPIRE', `pres:${b.r}`, 3600)
        // início da sessão: vale enquanto alguém continuar na sala (some 15 min depois do último sair)
        await redis('SET', `callini:${b.r}`, String(now), 'NX', 'EX', 900)
        await redis('EXPIRE', `callini:${b.r}`, 900)
        const callIni = +(await redis('GET', `callini:${b.r}`)) || now
        // diário automático: quem esteve e o que foi projetado (salas de teste ficam de fora)
        if (b.registra) {
          const id = `${b.r}:${callIni}`, h = `cham:${id}`
          await redis('HSETNX', h, 'ini', String(callIni))
          await redis('HSET', h, 'fim', String(now), 'r', b.r, `p:${key}`, info.name || key)
          const pj = b.proj && typeof b.proj.t === 'string' && b.proj.t.trim() ? { t: b.proj.t.trim().slice(0, 140), k: String(b.proj.k || 'tela').slice(0, 12), m: metaProj(b.proj.m) } : null
          if (pj) {
            const campo = `x:${pj.t.toLowerCase()}`
            let x = null
            try { x = JSON.parse(await redis('HGET', h, campo)) } catch {}
            // tempo projetado: soma os intervalos entre batidas (15 s), sem contar pausas longas
            const ms = (x?.ms || 0) + (x && now - x.fim < 60e3 ? now - x.fim : 0)
            await redis('HSET', h, campo, JSON.stringify({ t: pj.t, k: pj.k, por: info.name || key, ini: x?.ini || now, fim: now, ms, ...(pj.m || x?.m ? { m: pj.m || x.m } : {}) }))
          }
          await redis('ZADD', 'chamadas', 'NX', String(callIni), id)
          await redis('EXPIRE', h, 180 * 86400)
        }
        // eventos do navegador (entradas, quedas, erros) para o diagnóstico
        if (Array.isArray(b.ev) && b.ev.length) {
          const evs = b.ev.slice(0, 30).map(e => JSON.stringify({ ts: Math.min(now, +e.ts || now), key, t: String(e.t || '').slice(0, 200), k: String(e.k || '').slice(0, 12) }))
          await redis('LPUSH', `ev:${b.r}`, ...evs)
          await redis('LTRIM', `ev:${b.r}`, 0, 399)
          await redis('EXPIRE', `ev:${b.r}`, 2 * 86400)
        }
        // comando do admin para esta pessoa (ex.: reconectar)
        let cmd = null
        try { cmd = JSON.parse(await redis('HGET', `cmd:${b.r}`, key)) } catch {}
        if (cmd) await redis('HDEL', `cmd:${b.r}`, key)
        return json(res, 200, { pres: await presenca(b.r, now), callIni, cmd: cmd && now - cmd.ts < 120e3 ? cmd : null })
      }
      // Faixa do dia: resultado de cada um, música por música (hash faixa:<data>, campo = pessoa)
      // nota da sala para o episódio/filme que acabou (quem projetou manda as estrelas de todo mundo)
      if (b.op === 'nota') {
        if (!okRoom(b.r) || !b.registra || typeof b.ti !== 'string' || !b.ti.trim() || !b.notas || typeof b.notas !== 'object') return json(res, 200, { ok: false })
        const callIni = +(await redis('GET', `callini:${b.r}`))
        if (!callIni) return json(res, 200, { ok: false })
        const notas = Object.fromEntries(Object.entries(b.notas).slice(0, 40).map(([k, v]) => [String(k).slice(0, 40), Math.max(1, Math.min(5, Math.round(+v) || 0))]).filter(([, v]) => v >= 1))
        if (!Object.keys(notas).length) return json(res, 200, { ok: false })
        const s = Math.max(0, Math.min(99, +b.s || 0)), e = Math.max(0, Math.min(999, +b.e || 0)), ti = b.ti.trim().slice(0, 100)
        const vals = Object.values(notas), media = Math.round(vals.reduce((a, v) => a + v, 0) / vals.length * 10) / 10
        await redis('HSET', `cham:${b.r}:${callIni}`, `n:${ti.toLowerCase()}|${s}|${e}`, JSON.stringify({ ti, s, e, notas, media }))
        return json(res, 200, { ok: true, media })
      }
      if (b.op === 'faixa-res') {
        const data = String(b.data || ''), n = String(b.n ?? '')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{1,2}$/.test(n) || typeof b.key !== 'string' || !b.key) return json(res, 400, { error: 'dados' })
        const k = b.key.slice(0, 40)
        let cur = null
        try { cur = JSON.parse(await redis('HGET', `faixa:${data}`, k)) } catch {}
        if (!cur?.musicas) cur = { musicas: {} }
        cur.nome = String(b.nome || cur.nome || '').slice(0, 24)
        const novo = { r: ['ok', 'art', 'fora'].includes(b.r) ? b.r : 'fora', passo: Math.max(0, Math.min(9, +b.passo || 0)), pts: Math.max(0, Math.min(2000, +b.pts || 0)), ts: now }
        const antes = cur.musicas[n]
        if (!antes || novo.pts > antes.pts) cur.musicas[n] = novo
        await redis('HSET', `faixa:${data}`, k, JSON.stringify(cur))
        return json(res, 200, { ok: true })
      }
      if (b.op === 'faixa-ver') {
        const datas = (Array.isArray(b.datas) ? b.datas : []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 60)
        const out = {}
        for (const d of datas) {
          const flat = (await redis('HGETALL', `faixa:${d}`)) || []
          const m = {}
          for (let i = 0; i < flat.length; i += 2) { try { m[flat[i]] = JSON.parse(flat[i + 1]) } catch {} }
          out[d] = m
        }
        return json(res, 200, { res: out })
      }
      // admin: reconectar alguém (ou todos) e ver o diagnóstico da sala
      if (b.op === 'cmd') {
        if (!isAdmin(b.tok)) return json(res, 403, { error: 'admin' })
        if (!okRoom(b.r) || !['reset', 'mover'].includes(b.cmd) || (b.cmd === 'mover' && !okCanal(b.canal))) return json(res, 400, { error: 'cmd' })
        const alvos = b.key === '*' ? (await presenca(b.r, now)).map(x => x.key) : [String(b.key || '').slice(0, 40)]
        for (const k of alvos) await redis('HSET', `cmd:${b.r}`, k, JSON.stringify({ op: b.cmd, ts: now, por: String(b.por || '').slice(0, 24), ...(b.cmd === 'mover' ? { canal: b.canal } : {}) }))
        await redis('EXPIRE', `cmd:${b.r}`, 300)
        await redis('LPUSH', `ev:${b.r}`, JSON.stringify({ ts: now, key: String(b.quem || 'admin').slice(0, 40), t: b.cmd === 'mover' ? `levou ${String(b.nomeAlvo || b.key).slice(0, 24)} para outra sala` : `pediu para reconectar ${String(b.nomeAlvo || b.key).slice(0, 24)}`, k: 'admin' }))
        return json(res, 200, { ok: true, alvos })
      }
      if (b.op === 'diag-sala') {
        if (!isAdmin(b.tok)) return json(res, 403, { error: 'admin' })
        if (!okRoom(b.r)) return json(res, 400, { error: 'sala' })
        const ev = ((await redis('LRANGE', `ev:${b.r}`, 0, 149)) || []).map(x => { try { return JSON.parse(x) } catch { return null } }).filter(Boolean)
        return json(res, 200, { pres: await presenca(b.r, now, true), callIni: +(await redis('GET', `callini:${b.r}`)) || null, ev })
      }
      // Canais: o principal (id '') sempre existe; os outros ficam no hash "canais".
      // A sala de cada canal é sha('sala:' + senha + ':' + id), igual ao navegador.
      if (b.op === 'canais') return json(res, 200, { canais: await canais(b.pw, now), agora: now })
      if (b.op === 'canal-novo') {
        const nome = String(b.nome || '').replace(/\s+/g, ' ').trim().slice(0, 32)
        if (!nome) return json(res, 400, { error: 'nome' })
        if (((await redis('HLEN', 'canais')) || 0) >= 20) return json(res, 400, { error: 'muitos canais' })
        const base = slugify(nome)
        let id = base
        for (let i = 2; id === 'principal' || await redis('HEXISTS', 'canais', id); i++) id = `${base}-${i}`
        const canal = { id, nome, por: String(b.key || '').slice(0, 40), criado: now }
        await redis('HSET', 'canais', id, JSON.stringify(canal))
        return json(res, 200, { canal })
      }
      // Chats de texto (como os canais de texto do Discord): não dependem da call; o histórico fica no
      // api/chat com uma sala derivada no navegador. Três já vêm prontos.
      if (b.op === 'textos') {
        const flat = (await redis('HGETALL', 'textos')) || []
        const extras = []
        for (let i = 0; i < flat.length; i += 2) { try { extras.push(JSON.parse(flat[i + 1])) } catch {} }
        return json(res, 200, { textos: [...TEXTOS_PADRAO, ...extras.sort((x, y) => (x.criado || 0) - (y.criado || 0))] })
      }
      if (b.op === 'texto-novo') {
        const nome = slugify(String(b.nome || '')).slice(0, 28)
        if (!nome) return json(res, 400, { error: 'nome' })
        if (TEXTOS_PADRAO.some(t => t.id === nome) || await redis('HEXISTS', 'textos', nome)) return json(res, 200, { texto: { id: nome, nome } })
        if (((await redis('HLEN', 'textos')) || 0) >= 20) return json(res, 400, { error: 'muitos chats' })
        const texto = { id: nome, nome, por: String(b.key || '').slice(0, 40), criado: now }
        await redis('HSET', 'textos', nome, JSON.stringify(texto))
        return json(res, 200, { texto })
      }
      // renomear ou apagar sala/chat: quem criou ou o admin
      if (['canal-apagar', 'canal-renomear', 'texto-renomear', 'texto-apagar'].includes(b.op)) {
        const hash = b.op.startsWith('canal') ? 'canais' : 'textos'
        if (!okCanal(b.id) || !b.id) return json(res, 400, { error: 'id' })
        let cur = null
        try { cur = JSON.parse(await redis('HGET', hash, b.id)) } catch {}
        if (!cur) return json(res, 404, { error: 'não existe (as salas e chats padrão não mudam)' })
        if (!isAdmin(b.tok) && (!cur.por || cur.por !== String(b.key || ''))) return json(res, 403, { error: 'só quem criou ou o admin' })
        if (b.op.endsWith('apagar')) { await redis('HDEL', hash, b.id); return json(res, 200, { ok: true }) }
        const nome = hash === 'textos' ? slugify(String(b.nome || '')).slice(0, 28) : String(b.nome || '').replace(/\s+/g, ' ').trim().slice(0, 32)
        if (!nome) return json(res, 400, { error: 'nome' })
        cur.nome = nome
        await redis('HSET', hash, b.id, JSON.stringify(cur))
        return json(res, 200, { ok: true, nome })
      }
      return json(res, 400, { error: 'op' })
    }
    if (req.method === 'PUT') {
      const b = await readBody(req)
      if (!okRoom(b.r)) return json(res, 400, { error: 'sala' })
      if (createHash('sha256').update('admin:' + String(b.tok || '')).digest('hex') !== cfg.adminHash) return json(res, 403, { error: 'admin' })
      const ids = new Set((cfg.pessoas || []).map(p => p.id))
      const l = b.layout || {}
      const layout = {
        porFileira: Math.max(1, Math.min(16, +l.porFileira || 8)),
        vazias: !!l.vazias,
        poltronas: (Array.isArray(l.poltronas) ? l.poltronas : []).slice(0, 60).map(s => (s === 'guest' || ids.has(s) ? s : '')),
      }
      await redis('SET', `sala:${b.r}`, JSON.stringify(layout))
      return json(res, 200, { ok: true })
    }
    json(res, 405, { error: 'método' })
  } catch (e) { json(res, 500, { error: String(e.message || e) }) }
}

// o que estava passando (série/filme reconhecido na projeção): só campos simples, para o diário
function metaProj(m) {
  if (!m || typeof m !== 'object' || typeof m.ti !== 'string' || !m.ti.trim()) return null
  const tx = (v, n) => typeof v === 'string' ? v.slice(0, n) : ''
  const nu = (v, hi) => Number.isFinite(+v) ? Math.max(0, Math.min(hi, +v)) : 0
  return {
    ti: tx(m.ti, 100), pl: m.pl === 'netflix' ? 'netflix' : '', s: nu(m.s, 99), e: nu(m.e, 999), ep: tx(m.ep, 100),
    n: m.n == null ? null : nu(m.n, 10), en: m.en == null ? null : nu(m.en, 10), p: /^https:\/\/[^\s"'<>]+$/.test(m.p || '') ? m.p.slice(0, 300) : '', i: /^tt\d{5,12}$/.test(m.i || '') ? m.i : '',
    tp: m.tp === 'serie' ? 'serie' : 'filme', a: tx(m.a, 12),
  }
}
