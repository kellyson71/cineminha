#!/usr/bin/env node
// Ponte de linha de comando para as mesmas ferramentas do MCP, sem SDK.
// node tools/cine.mjs pessoas
// node tools/cine.mjs criar_convite --file /tmp/convite.json
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
const [name = 'list-tools', flag, path] = process.argv.slice(2)
let args = {}
if (flag === '--file' && path) args = JSON.parse(await readFile(path, 'utf8'))
else if (flag) { process.stderr.write('Use: cine.mjs <ferramenta> [--file argumentos.json]\n'); process.exit(1) }
const child = spawn(process.execPath, [new URL('./mcp-start.mjs', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'inherit'] })
const request = name === 'list-tools' ? { method: 'tools/list' } : { method: 'tools/call', params: { name, arguments: args } }
let buffer = '', done = false
const timer = setTimeout(() => { process.stderr.write('O MCP não respondeu em 45 segundos\n'); child.kill(); process.exitCode = 1 }, 45000)
child.stdout.setEncoding('utf8')
child.stdout.on('data', chunk => {
  buffer += chunk
  const i = buffer.indexOf('\n'); if (i < 0 || done) return
  done = true; clearTimeout(timer)
  const msg = JSON.parse(buffer.slice(0, i))
  if (msg.error || msg.result?.isError) process.exitCode = 1
  const result = msg.result
  process.stdout.write(result?.content ? result.content.map(x => x.text || '').join('\n') + '\n' : JSON.stringify(result || msg.error, null, 2) + '\n')
  child.stdin.end()
})
child.on('error', e => { clearTimeout(timer); process.stderr.write(e.message + '\n'); process.exitCode = 1 })
child.on('exit', code => { clearTimeout(timer); if (!done && code) process.exitCode = code })
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, ...request }) + '\n')
