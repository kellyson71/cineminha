// Servidor local: serve public/ e roda as funções de api/ com as variáveis do .env.local
//   node tools/dev.mjs  →  http://localhost:8790
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
const root = new URL('..', import.meta.url).pathname
if (existsSync(join(root, '.env.local'))) for (const l of readFileSync(join(root, '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)="?(.*?)"?$/); if (m) process.env[m[1]] ??= m[2]
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' }
const port = +process.env.PORT || 8790
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^\w-]/g, '')
    try { return (await import(join(root, 'api', name + '.js'))).default(req, res) }
    catch (e) { res.statusCode = 404; return res.end(String(e)) }
  }
  let p = normalize(join(root, 'public', decodeURIComponent(url.pathname)))
  if (!p.startsWith(join(root, 'public'))) { res.statusCode = 403; return res.end() }
  try { if ((await stat(p)).isDirectory()) p = join(p, 'index.html') } catch {}
  try {
    const body = await readFile(p)
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(body)
  } catch {
    // convite: /nome-do-filme cai no index.html (igual ao rewrite do vercel.json)
    if (/^\/[a-z0-9][a-z0-9-]*(\/[a-z0-9]{1,12})?$/.test(url.pathname)) {
      return (await import(join(root, 'api', 'ingresso.js'))).default(req, res)
    }
    res.statusCode = 404; res.end('404')
  }
}).listen(port, () => console.log(`http://localhost:${port}`))
