// Gera o hash das senhas para o config.js
//   node tools/hash.mjs "senha da sala"
//   node tools/hash.mjs --admin "senha de admin"
import { createHash } from 'node:crypto'
const [a, b] = process.argv.slice(2)
const s = a === '--admin' ? 'admin:' + b : a
if (!s) { console.log('uso: node tools/hash.mjs "senha"  |  node tools/hash.mjs --admin "senha"'); process.exit(1) }
console.log(createHash('sha256').update(a === '--admin' ? s : s.trim().toLowerCase()).digest('hex'))
