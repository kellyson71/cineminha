import assert from 'node:assert/strict'
import { DEFAULT_VOICE, cleanVoice, normalizeAudioPrefs, spatialPosition, gateIsOpen } from '../public/audio-settings.js'
assert.equal(DEFAULT_VOICE.gate, false)
// áudio espacial é opcional: preferência antiga (sem versão 3) começa desligada; a escolha salva na versão 3 vale
assert.equal(normalizeAudioPrefs({ spatial: true }).spatial, false)
assert.equal(normalizeAudioPrefs({ spatial: true, spatialVersion: 2 }).spatial, false)
assert.equal(normalizeAudioPrefs({ spatial: true, spatialVersion: 3 }).spatial, true)
assert.equal(normalizeAudioPrefs({ spatial: false, spatialVersion: 3 }).spatial, false)
assert.equal(cleanVoice({ gain: 999, hold: 1, threshold: -999 }).gain, 18)
assert.equal(cleanVoice({ gain: 999, hold: 1, threshold: -999 }).hold, 150)
const left = spatialPosition(2, 0, 4), right = spatialPosition(0, 2, 4)
assert(left.x < 0 && right.x > 0 && Math.abs(left.x) < Math.abs(left.z))
assert.equal(left.z, right.z)
assert.equal(spatialPosition(2, 2, 4).x, 0)
const base = { live: true, pushToTalk: false, enabled: false, db: -70, threshold: -55, now: 1000, lastLoud: 0, hold: 800 }
assert(gateIsOpen(base), 'voz baixa não deve ser cortada com o portão desligado')
assert(!gateIsOpen({ ...base, live: false }))
assert(gateIsOpen({ ...base, enabled: true, lastLoud: 700 }), 'preserva o fim da frase pelo tempo de espera')
assert(!gateIsOpen({ ...base, enabled: true }), 'portão manual fecha quando o tempo expira')
assert(gateIsOpen({ ...base, enabled: true, pushToTalk: true }), 'PTT ignora o limite de volume')
console.log('PASS: perfis, migração espacial, posições e preservação de fala baixa.')
