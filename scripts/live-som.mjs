#!/usr/bin/env node
// Som do jogo para a live, sem as vozes: reaproveita a separação de som do app do Cineminha
// (app/electron/somlinux.js, PipeWire/PulseAudio). Move o Greenlight para a saída "Cineminha-Programa",
// que você continua ouvindo, e publica ela como entrada. No estúdio, escolha "Cineminha-Programa".
//   node scripts/live-som.mjs            procura o Greenlight (ou pergunta qual programa)
//   node scripts/live-som.mjs firefox    usa o programa que tiver esse nome
// Ctrl+C devolve tudo como estava.
import { programas, separar, juntar, temPactl } from '../app/electron/somlinux.js'
import { createInterface } from 'node:readline/promises'

if (!(await temPactl())) { console.error('Precisa do pactl (PipeWire ou PulseAudio).'); process.exit(1) }
const busca = (process.argv[2] || 'greenlight').toLowerCase()
let lista = await programas()
let alvo = lista.find(p => (p.id + ' ' + p.nome).toLowerCase().includes(busca))
if (!alvo) {
  if (!lista.length) { console.error('Nenhum programa tocando som agora. Abra o jogo, deixe tocar algo e rode de novo.'); process.exit(1) }
  console.log(`Não achei "${busca}". Programas tocando som agora:`)
  lista.forEach((p, i) => console.log(`  ${i + 1}. ${p.nome} (${p.id})`))
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const n = +(await rl.question('Qual número? ')); rl.close()
  alvo = lista[n - 1]
  if (!alvo) process.exit(1)
}
const { rotulo, nome } = await separar(alvo.id)
console.log(`Som de ${nome} indo para "${rotulo}". No estúdio, escolha essa entrada em "Som do jogo".`)
console.log('Deixe esta janela aberta durante a live. Ctrl+C para desfazer.')
const sai = async () => { await juntar().catch(() => {}); console.log('\nSom devolvido.'); process.exit(0) }
process.on('SIGINT', sai); process.on('SIGTERM', sai)
setInterval(() => {}, 1 << 30)
