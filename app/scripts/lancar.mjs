// Lança uma versão nova do app: sobe a versão, faz commit e push.
// O GitHub Actions (.github/workflows/app.yml) vê a versão nova, cria a tag e a release
// e compila Linux e Windows. Os links de download se atualizam sozinhos.
//   npm run lancar            0.1.0 → 0.1.1
//   npm run lancar -- minor   0.1.0 → 0.2.0
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const tipo = process.argv[2] || 'patch'
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' })

sh('npm', ['version', tipo, '--no-git-tag-version'])
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
sh('git', ['add', 'package.json', 'package-lock.json'])
sh('git', ['commit', '-m', `App v${version}`])
sh('git', ['push'])
console.log(`\nv${version} enviada. Acompanhe em https://github.com/kellyson71/cineminha/actions`)
