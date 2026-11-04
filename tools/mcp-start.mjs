#!/usr/bin/env node
// Configuração privada compartilhada pelos clientes MCP e pela skill.
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
const path = process.env.CINEMINHA_ENV || join(homedir(), '.config/cineminha/mcp.env')
try {
  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '')
  }
} catch (e) { if (e.code !== 'ENOENT') throw e }
await import('./mcp.mjs')
