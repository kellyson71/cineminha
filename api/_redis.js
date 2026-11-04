// Upstash Redis via REST (sem SDK): um comando por chamada
export async function redis(...cmd) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) })
  const j = await r.json()
  if (j.error) throw new Error(j.error)
  return j.result
}
export const json = (res, code, body) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(body)) }
export async function readBody(req, limit = 1_200_000) {
  if (req.body && typeof req.body === 'object') return req.body
  let s = ''
  for await (const c of req) { s += c; if (s.length > limit) throw new Error('Corpo da requisição muito grande') }
  try { return JSON.parse(s) } catch { return {} }
}
