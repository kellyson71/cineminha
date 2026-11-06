import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { createReadStream, statSync } from 'node:fs'
import path from 'node:path'

// Os assets e o style.css vêm direto de ../public: o visual é o mesmo do site,
// e só entra no pacote o que o app importa (com hash, cache eterno).
const site = fileURLToPath(new URL('../public', import.meta.url))
const SITE = process.env.CINE_SITE || 'https://cineminha-boo.vercel.app'
const TIPOS = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm', '.woff2': 'font/woff2' }

// Em dev, o mesmo que o protocolo cine:// faz no pacote: arquivos do site (jogos, sons) e api/ no servidor
const arquivosDoSite = {
  name: 'site', apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '')
      if (!rel || /^(src|@|node_modules)/.test(rel)) return next()
      const p = path.join(site, rel)
      try { if (!p.startsWith(site) || !statSync(p).isFile()) return next() } catch { return next() }
      res.setHeader('content-type', TIPOS[path.extname(p)] || 'application/octet-stream')
      createReadStream(p).pipe(res)
    })
  },
}

export default defineConfig({
  base: './',
  plugins: [react(), arquivosDoSite, {
    // CSP só no pacote (o dev do Vite precisa de script inline para a recarga)
    name: 'csp', apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', injectTo: 'head-prepend', attrs: { 'http-equiv': 'Content-Security-Policy', content: "default-src 'self'; connect-src 'self' wss: https:; img-src 'self' data: blob: https:; media-src 'self' blob: mediastream: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; frame-src https://www.youtube.com https://open.spotify.com; script-src 'self' https://www.youtube.com https://s.ytimg.com" } }],
  }],
  publicDir: false,
  resolve: { alias: { '@site': site } },
  server: { port: 5199, strictPort: false, fs: { allow: ['..'] }, proxy: { '/api': { target: SITE, changeOrigin: true } } },
  build: {
    target: 'chrome140',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 2048,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
  },
})
