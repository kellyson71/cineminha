// Som de um programa só (Linux, PipeWire/PulseAudio via pactl):
// cria uma saída virtual "Cineminha-Programa", repete ela na sua saída (você continua ouvindo)
// e move o programa escolhido para lá. O app captura o monitor dessa saída: vai o som do jogo/player,
// sem as vozes da call. Ao parar, devolve o programa para onde estava e desfaz tudo.
import { execFile } from 'node:child_process'

const pactl = (...a) => new Promise((ok, err) => execFile('pactl', a, { timeout: 5000 }, (e, out) => (e ? err(e) : ok(out.trim()))))
const SINK = 'cineminha_programa', DESC = 'Cineminha-Programa'
// o Chromium não lista fontes "monitor": publica o monitor como uma entrada comum
const fonte = async (monitor, nome, desc) => { modulos.push(await pactl('load-module', 'module-remap-source', `master=${monitor}`, `source_name=${nome}`, `source_properties=device.description=${desc}`)); return desc }
let modulos = [], movidos = new Map() // sink-input -> sink original

export async function temPactl() { try { await pactl('info'); return true } catch { return false } }

// programas tocando som agora (menos o próprio Cineminha)
export async function programas() {
  const lista = JSON.parse(await pactl('-f', 'json', 'list', 'sink-inputs'))
  const vistos = new Map()
  for (const s of lista) {
    const p = s.properties || {}
    const nome = p['application.name'] || p['media.name'] || 'Programa'
    const bin = p['application.process.binary'] || ''
    if (/electron|cineminha/i.test(nome + bin) || p['application.process.id'] === String(process.pid)) continue
    const id = bin || nome
    if (!vistos.has(id)) vistos.set(id, { id, nome, entradas: [] })
    vistos.get(id).entradas.push({ index: s.index, sink: s.sink })
  }
  return [...vistos.values()]
}

export async function separar(id) {
  await juntar()
  const alvo = (await programas()).find(p => p.id === id)
  if (!alvo) throw new Error('Esse programa não está tocando som agora')
  const padrao = await pactl('get-default-sink')
  modulos.push(await pactl('load-module', 'module-null-sink', `sink_name=${SINK}`, `sink_properties=device.description=${DESC}`))
  modulos.push(await pactl('load-module', 'module-loopback', `source=${SINK}.monitor`, `sink=${padrao}`, 'latency_msec=30'))
  for (const e of alvo.entradas) { movidos.set(e.index, e.sink); await pactl('move-sink-input', String(e.index), SINK).catch(() => {}) }
  return { rotulo: await fonte(`${SINK}.monitor`, `${SINK}_entrada`, DESC), nome: alvo.nome }
}

// som do sistema inteiro: o monitor da saída padrão (inclui as vozes da call, se tocarem nela)
export async function monitorPadrao() {
  await juntar()
  const padrao = await pactl('get-default-sink')
  return { rotulo: await fonte(`${padrao}.monitor`, 'cineminha_sistema', 'Cineminha-Sistema') }
}

export async function juntar() {
  for (const [idx, sink] of movidos) await pactl('move-sink-input', String(idx), String(sink)).catch(() => {})
  movidos.clear()
  for (const m of modulos.reverse()) await pactl('unload-module', m).catch(() => {})
  modulos = []
}
