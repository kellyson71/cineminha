// Soundboard: sons do MyInstants (o site não libera CORS para o navegador, então passa por aqui)
//   GET                 → "em alta no Brasil" (página de tendências do MyInstants)
//   GET ?q=texto        → busca, na ordem de relevância do próprio site
//   GET ?top=1          → mais tocados na sala (contados aqui)
//   GET ?f=/media/sounds/x.mp3 → o arquivo de som
//   POST {f, n, c}      → conta mais uma vez que a sala tocou esse som
// A API JSON deles (/api/v1/instants) devolve os uploads mais recentes, não os populares: por isso as
// listas vêm das páginas HTML (cada som é um <div class="instant"> com play('/media/sounds/…') e o nome).
import { redis, json, readBody } from './_redis.js'

const BASE = 'https://www.myinstants.com'
const UA = { 'user-agent': 'Mozilla/5.0 (Cineminha)', 'accept-language': 'pt-BR,pt;q=0.9' }
const okFile = f => typeof f === 'string' && /^\/media\/sounds\/[\w.%()+-]{1,160}\.mp3$/i.test(f)
const cor = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c.toLowerCase() : ''

function lerPagina(html) {
  const out = [], vistos = new Set()
  for (const b of String(html || '').split(/<div class="instant"/).slice(1)) {
    const f = b.match(/play\('(\/media\/sounds\/[^']+\.mp3)'/)?.[1]
    const n = (b.match(/class="instant-link[^"]*"[^>]*>([^<]*)/)?.[1] || '').replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').trim()
    if (!okFile(f) || !n || vistos.has(f)) continue
    vistos.add(f)
    out.push({ n: n.slice(0, 40), f, c: cor(b.match(/background-color:\s*(#[0-9a-fA-F]{6})/)?.[1]) })
  }
  return out
}
const pagina = url => fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) }).then(r => r.ok ? r.text() : '').catch(() => '')

export default async function handler(req, res) {
  try {
    const u = new URL(req.url, 'http://x').searchParams
    if (req.method === 'POST') {
      const b = await readBody(req)
      if (!okFile(b.f)) return json(res, 400, { error: 'som' })
      await redis('ZINCRBY', 'sons:top', '1', b.f)
      await redis('HSET', 'sons:info', b.f, JSON.stringify({ n: String(b.n || '').slice(0, 40), c: cor(b.c) }))
      return json(res, 200, { ok: true })
    }
    const f = u.get('f')
    if (f != null) {
      if (!okFile(f)) return json(res, 400, { error: 'arquivo' })
      const r = await fetch(BASE + f, { headers: UA })
      if (!r.ok) return json(res, 404, { error: 'som' })
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > 2_500_000) return json(res, 413, { error: 'grande' })
      res.statusCode = 200
      res.setHeader('content-type', 'audio/mpeg')
      res.setHeader('cache-control', 'public, max-age=604800, immutable')
      return res.end(buf)
    }
    if (u.has('top')) {
      const flat = (await redis('ZREVRANGE', 'sons:top', 0, 17, 'WITHSCORES')) || []
      const fs = flat.filter((_, i) => i % 2 === 0)
      const infos = fs.length ? (await redis('HMGET', 'sons:info', ...fs)) || [] : []
      const list = fs.map((f, i) => { let x = {}; try { x = JSON.parse(infos[i]) || {} } catch {} return { f, n: x.n || f.split('/').pop().replace(/\.mp3$/, '').replace(/[-_]+/g, ' '), c: x.c || '', vezes: +flat[i * 2 + 1] || 0 } })
      return json(res, 200, { list })
    }
    const q = String(u.get('q') || '').trim().slice(0, 60)
    let list
    if (q) {
      // duas páginas da busca (36 cada), na ordem do site
      const [a, b] = await Promise.all([1, 2].map(p => pagina(`${BASE}/pt/search/?name=${encodeURIComponent(q)}${p > 1 ? '&page=' + p : ''}`)))
      list = lerPagina(a + b)
    } else list = lerPagina(await pagina(`${BASE}/pt/index/br/`))
    res.statusCode = 200
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'public, max-age=600, s-maxage=1800')
    return res.end(JSON.stringify({ list: list.slice(0, 48) }))
  } catch (e) { json(res, 500, { error: String(e.message || e) }) }
}
