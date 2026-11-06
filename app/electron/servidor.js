// Protocolo cine://app/ — serve o app (dist/), os arquivos do site (public/: jogos, sons, assets)
// e encaminha api/ para o servidor do Cineminha. Assim o código usa os mesmos caminhos relativos do site.
import { app, net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

export const SITE = process.env.CINE_SITE || 'https://cineminha-boo.vercel.app'
export const ORIGEM = 'cine://app'

protocol.registerSchemesAsPrivileged([{ scheme: 'cine', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }])

// o filme convertido toca num <video> que é capturado (captureStream): precisa ser "do mesmo dono" (CORS)
function comCors(r, tipo) {
  const h = new Headers(r.headers)
  h.set('access-control-allow-origin', '*')
  h.set('content-type', tipo)
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h })
}
const arquivo = (raiz, rel) => {
  const p = path.join(raiz, rel)
  if (!p.startsWith(raiz)) return null
  try { return statSync(p).isFile() ? p : null } catch { return null }
}

export function registraServidor({ dist, site, extras = new Map() }) {
  protocol.handle('cine', async req => {
    const url = new URL(req.url)
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
    if (rel.startsWith('api/')) {
      const headers = new Headers(req.headers)
      headers.delete('origin')
      return net.fetch(SITE + '/' + rel + url.search, { method: req.method, headers, body: req.body, duplex: 'half', bypassCustomProtocolHandlers: true })
    }
    // arquivos locais liberados pelo processo principal (ex.: filme convertido pelo ffmpeg)
    if (rel.startsWith('local/')) {
      const p = extras.get(rel.slice(6))
      if (p && existsSync(p)) return comCors(await net.fetch(pathToFileURL(p).toString(), { headers: req.headers }), p.endsWith('.vtt') ? 'text/vtt' : 'video/mp4')
      return new Response('', { status: 404 })
    }
    const p = arquivo(dist, rel) || arquivo(site, rel)
    if (p) return net.fetch(pathToFileURL(p).toString(), { headers: req.headers })
    // o que não vem no pacote (ex.: os 600 MB de trechos do Faixa a Faixa) vem do servidor, sob demanda
    return net.fetch(SITE + '/' + rel + url.search, { headers: req.headers, bypassCustomProtocolHandlers: true })
  })
}

export const pastaDoSite = dir => app.isPackaged ? path.join(process.resourcesPath, 'site') : path.join(dir, '..', '..', 'public')
