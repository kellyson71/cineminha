// Dev: Vite com recarga instantânea + Electron apontando para ele
import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname })
await server.listen()
const url = server.resolvedUrls.local[0]
const electron = createRequire(import.meta.url)('electron')
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, CINE_DEV_URL: url } })
child.on('exit', code => { server.close(); process.exit(code ?? 0) })
