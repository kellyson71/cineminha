#!/usr/bin/env node
// HTTPS na rede de casa para testar a câmera do celular sem publicar: o celular só libera a câmera em https.
// Também entrega a temperatura do PC para o termômetro do estúdio (http://localhost:8792/sensores).
// Repassa tudo para o servidor local (node tools/dev.mjs, porta 8790). O certificado é próprio:
// no celular, toque em "Avançado" → "Continuar" na primeira vez.
//   node scripts/https-local.mjs        → https://<ip-do-pc>:8791/live/cam.html?c=...
import https from 'node:https'
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { networkInterfaces, homedir, loadavg, cpus } from 'node:os'
import path from 'node:path'

const ALVO = +(process.env.ALVO || 8790), PORTA = +(process.env.PORT || 8791)
const dir = path.join(homedir(), '.cache', 'cineminha-https')
const chave = path.join(dir, 'chave.pem'), cert = path.join(dir, 'cert.pem')
if (!existsSync(cert)) {
  mkdirSync(dir, { recursive: true })
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '825', '-subj', '/CN=cineminha-local', '-keyout', chave, '-out', cert], { stdio: 'ignore' })
}
https.createServer({ key: readFileSync(chave), cert: readFileSync(cert) }, (req, res) => {
  const p = http.request({ host: '127.0.0.1', port: ALVO, path: req.url, method: req.method, headers: req.headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res) })
  p.on('error', () => { res.writeHead(502); res.end('O servidor local (porta ' + ALVO + ') não está rodando.') })
  req.pipe(p)
}).listen(PORTA, () => {
  const ips = Object.values(networkInterfaces()).flat().filter(x => x?.family === 'IPv4' && !x.internal && !/^172\.(1[6-9]|2\d|3[01])\./.test(x.address)).map(x => x.address)
  console.log('HTTPS da rede de casa:')
  for (const ip of ips) console.log(`  https://${ip}:${PORTA}/live/cam.html?c=<código>`)
  console.log('Na primeira vez o celular avisa do certificado: toque em Avançado → Continuar.')
})

// temperatura do processador (o pacote inteiro, que é o que freia quando chega a 100 °C)
const lerTemp = () => {
  try {
    const zonas = readdirSync('/sys/class/thermal').filter(z => z.startsWith('thermal_zone')).map(z => {
      const tipo = readFileSync(`/sys/class/thermal/${z}/type`, 'utf8').trim(), t = +readFileSync(`/sys/class/thermal/${z}/temp`, 'utf8') / 1000
      return { tipo, t }
    }).filter(z => z.t > 0 && z.t < 130)
    const pacote = zonas.find(z => /x86_pkg|TCPU|cpu/i.test(z.tipo))
    return Math.round(pacote ? pacote.t : Math.max(...zonas.map(z => z.t)))
  } catch { return null }
}
http.createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-private-network', 'true')
  res.setHeader('cache-control', 'no-store')
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  if (!req.url.startsWith('/sensores')) { res.writeHead(404); return res.end() }
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ temp: lerTemp(), carga: Math.round(loadavg()[0] / cpus().length * 100) }))
}).listen(+(process.env.SENSORES || 8792), '127.0.0.1')
