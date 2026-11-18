#!/usr/bin/env node
// Ajudante da live no seu PC (deixe aberto durante a live):
//  • som de um programa só: o estúdio lista os programas tocando som e "isola" o escolhido (ex.: Greenlight)
//    numa saída "Cineminha-Programa" que você continua ouvindo; reaproveita app/electron/somlinux.js
//  • temperatura do processador para o termômetro do estúdio
//  • https na rede de casa (porta 8791) para testar a câmera do celular com o servidor local
// O estúdio (local ou publicado) fala com ele em http://localhost:8792. Ctrl+C devolve o som como estava.
//   node scripts/live-local.mjs
import https from 'node:https'
import http from 'node:http'
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { networkInterfaces, homedir, loadavg, cpus } from 'node:os'
import path from 'node:path'
import { programas, separar, juntar, temPactl, direto } from '../app/electron/somlinux.js'

const ALVO = +(process.env.ALVO || 8790), PORTA = +(process.env.PORT || 8791), AJUDA = +(process.env.SENSORES || 8792)

/* ---------- som de um programa só ---------- */
const SINK = 'cineminha_programa'
const pactl = (...a) => new Promise((ok, err) => execFile('pactl', a, { timeout: 5000 }, (e, out) => (e ? err(e) : ok(out.trim()))))
let isolado = null // { id, nome }
const temSom = await temPactl()
async function isola(id) {
  semDireto = 0
  const r = await separar(id) // desfaz o anterior, cria a saída e move o programa
  isolado = { id, nome: amigavel(id, r.nome) }
  console.log(`Som isolado: ${isolado.nome} → entrada "${r.rotulo}"`)
  return { nome: isolado.nome, rotulo: r.rotulo }
}
// jogo só no retorno: o estúdio tira o som isolado do alto-falante e confirma a cada poucos segundos;
// se o estúdio fechar ou travar, o som volta sozinho para o alto-falante
let semDireto = 0
async function poeDireto(on) {
  const r = await direto(on).catch(() => true)
  if (!on) { if (!semDireto) console.log('Jogo só no retorno do estúdio (fora do alto-falante)'); semDireto = Date.now() }
  else if (semDireto) { semDireto = 0; console.log('Jogo de volta no alto-falante') }
  return r
}
setInterval(() => { if (semDireto && Date.now() - semDireto > 15000) poeDireto(true) }, 3000)
async function solta() { semDireto = 0; await juntar().catch(() => {}); if (isolado) console.log(`Som devolvido: ${isolado.nome}`); isolado = null }
// se o programa abrir um som novo (ex.: o Greenlight reconectou), move de novo para a saída isolada
setInterval(async () => {
  if (!isolado) return
  const p = (await programas().catch(() => [])).find(x => x.id === isolado.id)
  for (const e of p?.entradas || []) await pactl('move-sink-input', String(e.index), SINK).catch(() => {})
}, 5000)

// nomes que dá para reconhecer (o Greenlight se apresenta como "Chromium")
const amigavel = (id, nome) => /greenlight/i.test(id) ? 'Greenlight (Xbox)' : /chrome/i.test(id) && /google/i.test(nome) ? 'Google Chrome (o estúdio e a rádio)' : nome

/* ---------- temperatura ---------- */
const lerTemp = () => {
  try {
    const zonas = readdirSync('/sys/class/thermal').filter(z => z.startsWith('thermal_zone')).map(z => ({
      tipo: readFileSync(`/sys/class/thermal/${z}/type`, 'utf8').trim(), t: +readFileSync(`/sys/class/thermal/${z}/temp`, 'utf8') / 1000,
    })).filter(z => z.t > 0 && z.t < 130)
    const pacote = zonas.find(z => /x86_pkg|TCPU|cpu/i.test(z.tipo))
    return Math.round(pacote ? pacote.t : Math.max(...zonas.map(z => z.t)))
  } catch { return null }
}

/* ---------- servidor do ajudante (só no próprio PC) ---------- */
const corpo = req => new Promise(ok => { let s = ''; req.on('data', c => { s += c; if (s.length > 2000) req.destroy() }); req.on('end', () => { try { ok(JSON.parse(s || '{}')) } catch { ok({}) } }) })
http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-private-network', 'true')
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type')
  res.setHeader('cache-control', 'no-store')
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  const manda = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)) }
  const url = req.url.split('?')[0]
  try {
    if (url === '/sensores') return manda({ temp: lerTemp(), carga: Math.round(loadavg()[0] / cpus().length * 100) })
    if (url === '/som') return manda({ pactl: temSom, isolado, direto: !semDireto, programas: temSom ? (await programas()).filter(p => !/^loopback/i.test(p.id + p.nome)).map(({ id, nome }) => ({ id, nome: amigavel(id, nome) })) : [] })
    if (url === '/som/isolar' && req.method === 'POST') { const { id } = await corpo(req); return manda(await isola(String(id || ''))) }
    if (url === '/som/direto' && req.method === 'POST') { const { on } = await corpo(req); return manda({ direto: await poeDireto(on !== false) }) }
    if (url === '/som/soltar' && req.method === 'POST') { await solta(); return manda({ ok: true }) }
  } catch (e) { return manda({ erro: e.message || 'falhou' }, 500) }
  res.writeHead(404); res.end()
}).on('error', e => { console.error(e.code === 'EADDRINUSE' ? `A porta ${AJUDA} já está em uso: o ajudante já está aberto em outro terminal?` : e.message); process.exit(1) })
  .listen(AJUDA, '127.0.0.1', () => console.log(`Ajudante da live ligado (termômetro e som de um programa só). Deixe aberto; Ctrl+C para sair.${temSom ? '' : '\nAviso: sem pactl, o som de um programa só não funciona.'}`))

/* ---------- https na rede de casa (câmera do celular com o servidor local) ---------- */
const dir = path.join(homedir(), '.cache', 'cineminha-https')
const chave = path.join(dir, 'chave.pem'), cert = path.join(dir, 'cert.pem')
try {
  if (!existsSync(cert)) { mkdirSync(dir, { recursive: true }); execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '825', '-subj', '/CN=cineminha-local', '-keyout', chave, '-out', cert], { stdio: 'ignore' }) }
  https.createServer({ key: readFileSync(chave), cert: readFileSync(cert) }, (req, res) => {
    const p = http.request({ host: '127.0.0.1', port: ALVO, path: req.url, method: req.method, headers: req.headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res) })
    p.on('error', () => { res.writeHead(502); res.end('O servidor local (porta ' + ALVO + ') não está rodando.') })
    req.pipe(p)
  }).on('error', e => console.log(e.code === 'EADDRINUSE' ? `A porta ${PORTA} já está em uso: o https da rede de casa ficou desligado (a live publicada não precisa dele).` : e.message))
    .listen(PORTA, () => {
    const ips = Object.values(networkInterfaces()).flat().filter(x => x?.family === 'IPv4' && !x.internal && !/^172\.(1[6-9]|2\d|3[01])\./.test(x.address)).map(x => x.address)
    console.log(`Câmera com o servidor local: ${ips.map(ip => `https://${ip}:${PORTA}/live/cam.html?c=<código>`).join('  ')}`)
  })
} catch { console.log('Sem openssl: o https da rede de casa ficou desligado (a live publicada não precisa dele).') }

const sai = async () => { await solta(); process.exit(0) }
process.on('SIGINT', sai); process.on('SIGTERM', sai)
