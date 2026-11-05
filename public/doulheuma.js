// Dou-lhe Uma: leilão de listas. Sai um tema ("Filmes da Pixar") e cada um, na sua vez, sobe o lance de quantos itens
// consegue citar, ou passa. Quem fica com o maior lance cita em voz alta e a call conta os que valeram. Bateu o lance:
// +2 pontos para quem arrematou. Não bateu: +1 para cada um dos outros. Quem chegar à meta leva. Sem relógio.
// Mesma estrutura dos outros jogos: o host guarda tudo e manda a vista para cada um ({ du: ... }).
import { TEMAS, GRUPOS, NIVEIS } from './jogos/doulheuma/temas.js'

const SOM = n => `jogos/coup/sons/${n}.mp3`
const SONS = ['embaralhar', 'desliza1', 'desliza2', 'desliza3', 'poe1', 'poe2', 'leque', 'carimbo', 'papel', 'vez', 'clique', 'tique']
const VOL = { embaralhar: .5, carimbo: .7, papel: .45, vez: .5, clique: .3, tique: .35 }
const SAIU_MS = 12000, HOST_MS = 10000, MIN_JOG = 2, MAX_LANCE = 60
const METAS = [[6, 'rápida · 6'], [10, 'normal · 10'], [15, 'longa · 15']]
const PTS_GANHA = 2, PTS_MICO = 1
// tipos de lote: sem relógio, com relógio na hora de citar, ou valendo o dobro
const TIPOS = {
  calma: { nome: 'Sem pressa', dica: 'Tempo folgado para citar tudo: 4 s por item + 8 s', ic: 'coffee' },
  relogio: { nome: 'Com relógio', dica: 'Tempo apertado para citar tudo: 2,5 s por item + 5 s', ic: 'clock' },
  fixo: { nome: 'Tempo fixo', dica: 'O mesmo tempo para qualquer lance', ic: 'clock' },
  dobro: { nome: 'Vale dobro', dica: 'Pontos em dobro · tempo folgado: 4 s por item + 8 s', ic: 'zap' },
}
// todo lote tem um tempo geral para citar a lista inteira (não vai somando): apertado no "com relógio", folgado nos outros
const VEZ_MS = 20000
const MODOS_LOTE = [['variado', 'Variados'], ['fixo', 'Tempo fixo'], ['calma', 'Tempo folgado'], ['relogio', 'Tempo apertado']]
const FIXOS = [20, 30, 40] // segundos do lote de tempo fixo
const tempoLista = (qtd, tipo, fixo) => tipo === 'fixo' ? fixo * 1000 : tipo === 'relogio' ? (5 + qtd * 2.5) * 1000 : (8 + qtd * 4) * 1000
// temas que este navegador já viu (para o sorteio não repetir entre partidas)
const VISTOS_MAX = 600
const meusVistos = () => { const v = ls.get('du.vistos'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [] }
const guardaVisto = txt => { if (!txt) return; const v = meusVistos().filter(x => x !== txt); v.push(txt); ls.set('du.vistos', v.slice(-VISTOS_MAX)) }

const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n }
const embaralha = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]] } return a }
const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch {} } }
const SVG_MARTELO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 12.5-8 8a2.12 2.12 0 1 1-3-3l8-8"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/></svg>'

export function criaDouLheUma(ctx) {
  const { icon, toast, sysMsg, me } = ctx
  const tela = ctx.tela
  // o ctx.el não transforma data-* em atributo: este wrapper faz
  const el = (tag, props = {}, ...kids) => {
    const dados = {}, resto = {}
    for (const [k, v] of Object.entries(props)) (k.startsWith('data-') ? dados : resto)[k] = v
    const n = ctx.el(tag, resto, ...kids.flat())
    for (const [k, v] of Object.entries(dados)) n.setAttribute(k, v)
    return n
  }

  /* ================================================================ host: estado completo */
  let G = null, restaurou = false
  const ausDesde = new Map()
  const jog = k => G?.js.find(j => j.key === k)
  const log = t => { G.log.push(t); if (G.log.length > 60) G.log.splice(0, G.log.length - 60) }
  const ev = e => { G.ev.push({ ...e, n: ++G.evN }); if (G.ev.length > 30) G.ev.splice(0, G.ev.length - 30) }
  const novoId = () => Math.random().toString(36).slice(2, 9)

  function abrir(chamados) {
    const op = ls.get('du.op') || {}
    G = { id: novoId(), host: me.key, hostNome: me.name, fase: 'convite',
      op: { meta: METAS.some(([m]) => m === op.meta) ? op.meta : 10, grupos: Array.isArray(op.grupos) && op.grupos.length ? op.grupos.filter(g => GRUPOS[g]) : Object.keys(GRUPOS),
        nivel: [1, 2, 3].includes(op.nivel) ? op.nivel : 1, lotes: MODOS_LOTE.some(([m]) => m === op.lotes) ? op.lotes : 'variado' },
      conv: Object.fromEntries(ctx.presentes().map(k => [k, k === me.key || chamados?.includes(k) ? 'sim' : '?'])),
      js: [], abre: 0, lote: 0, tema: null, opcoes: null, tipo: 'calma', usados: [], vistos: meusVistos(), lei: null, lista: null, res: null, vencedor: null,
      log: [], ev: [], evN: 0, seq: 0, t: Date.now() }
    sysMsg(`${me.name} abriu uma mesa de Dou-lhe Uma`)
    difunde()
  }
  function comecar() {
    if (G?.fase !== 'convite') return
    const pres = new Set(ctx.presentes())
    const ks = embaralha(Object.keys(G.conv).filter(k => G.conv[k] === 'sim' && pres.has(k)))
    if (ks.length < MIN_JOG) return toast(`Precisa de pelo menos ${MIN_JOG} pessoas.`)
    ls.set('du.op', G.op)
    G.js = ks.map(k => ({ key: k, nome: ctx.nomeDe(k), pontos: 0 }))
    G.abre = 0; G.lote = 0; G.usados = []; G.log = []
    ev({ t: 'inicio' })
    sysMsg(`Dou-lhe Uma começou: ${G.js.map(j => j.nome).join(', ')}`)
    novoLote()
  }
  // sorteia um tema que ainda não saiu nesta partida (dos grupos escolhidos)
  // até o nível escolhido (fácil = só os fáceis; médio = fáceis e médios…)
  function sorteiaTema() {
    let ok = TEMAS.map((t, i) => [t, i]).filter(([t]) => G.op.grupos.includes(t[0]) && t[2] <= (G.op.nivel || 1))
    if (ok.length < 6) ok = TEMAS.map((t, i) => [t, i]).filter(([t]) => t[2] <= (G.op.nivel || 1)) // poucos temas nesses assuntos: usa todos do nível
    // primeiro os que ninguém da mesa viu; acabando, os que só saíram em outras partidas; por fim, tudo de novo
    const vistos = new Set(G.vistos || [])
    let livres = ok.filter(([t, i]) => !G.usados.includes(i) && !vistos.has(t[1]))
    if (livres.length < 3) livres = ok.filter(([, i]) => !G.usados.includes(i))
    if (!livres.length) { G.usados = []; livres = ok }
    const [t, i] = livres[rnd(livres.length)]
    G.usados.push(i); (G.vistos ||= []).push(t[1])
    return { grupo: t[0], txt: t[1], nivel: t[2] }
  }
  const tresTemas = () => [sorteiaTema(), sorteiaTema(), sorteiaTema()]
  function sorteiaTipo() {
    if (G.op.lotes === 'calma' || G.op.lotes === 'relogio' || G.op.lotes === 'fixo') return G.op.lotes
    const r = rnd(100)
    return r < 50 ? 'fixo' : r < 75 ? 'relogio' : r < 87 ? 'calma' : 'dobro' // metade com tempo fixo
  }
  // lote novo: quem abre escolhe o tema entre três sorteados
  function novoLote() {
    G.lote++
    G.tipo = sorteiaTipo()
    G.fixo = G.tipo === 'fixo' ? FIXOS[rnd(FIXOS.length)] : 0
    G.opcoes = tresTemas(); G.tema = null
    const ks = G.js.map(j => j.key), r = G.abre % ks.length
    const ordem = [...ks.slice(r), ...ks.slice(0, r)]
    G.lei = { ordem, ativos: [...ordem], vez: ordem[0], lance: null, hist: [] }
    G.lista = null; G.res = null; G.fase = 'tema'; G.ate = Date.now() + VEZ_MS
    ev({ t: 'lote', quem: ordem[0], tipo: G.tipo })
    difunde()
  }
  function escolheTema(key, i) {
    if (G.fase !== 'tema' || (key !== G.host && key !== G.lei.ordem[0]) || !G.opcoes?.[i]) return
    G.tema = G.opcoes[i]; G.opcoes = null; G.fase = 'lance'; G.ate = Date.now() + VEZ_MS
    ev({ t: 'tema', key })
    log(`Lote ${G.lote}: ${G.tema.txt} (${TIPOS[G.tipo].nome.toLowerCase()}).`)
    difunde()
  }
  function trocaTema(key) {
    if (G.fase !== 'tema' || (key !== G.host && key !== G.lei.ordem[0])) return
    G.opcoes = tresTemas(); G.ate = Date.now() + VEZ_MS
    ev({ t: 'troca' })
    difunde()
  }
  function daLance(key, qtd) {
    const L = G.lei
    if (G.fase !== 'lance' || L.vez !== key) return
    qtd = Math.floor(Number(qtd))
    if (!(qtd > (L.lance?.qtd || 0) && qtd <= MAX_LANCE)) return
    L.lance = { key, qtd }; L.hist.push({ k: key, qtd })
    ev({ t: 'lance', key, qtd })
    proximoDaVez(key)
  }
  function passa(key) {
    const L = G.lei
    if (G.fase !== 'lance' || L.vez !== key) return
    if (L.ativos.length === 1 && !L.lance) return // o último não passa sem ninguém ter dado lance
    L.ativos = L.ativos.filter(k => k !== key); L.hist.push({ k: key, qtd: 0 })
    ev({ t: 'passou', key })
    proximoDaVez(key)
  }
  function proximoDaVez(de) {
    const L = G.lei, o = L.ordem, i = Math.max(0, o.indexOf(de))
    for (let s = 1; s <= o.length; s++) {
      const c = o[(i + s) % o.length]
      if (L.ativos.includes(c) && c !== L.lance?.key) { L.vez = c; G.ate = Date.now() + VEZ_MS; return difunde() }
    }
    if (L.lance) return vendido()
    difunde()
  }
  function vendido() {
    const { key, qtd } = G.lei.lance
    G.lei.vez = null
    // com relógio: o tempo começa depois do "vendido!" (3 s de animação)
    const tot = tempoLista(qtd, G.tipo, G.fixo)
    G.lista = { key, qtd, ok: 0, ult: null, contador: proximoContador(key, key), ate: Date.now() + 3000 + tot, tot, folga: G.tipo !== 'relogio' }
    G.ate = 0
    G.fase = 'lista'
    ev({ t: 'vendido', key, qtd })
    log(`${jog(key).nome} arrematou: vai citar ${qtd}.`)
    difunde()
  }
  // uma pessoa só conta (a próxima da roda depois de quem cita); ela pode passar a contagem para o seguinte
  function proximoContador(depois, cita) {
    const pres = new Set(ctx.presentes()), ks = G.js.map(j => j.key), i = Math.max(0, ks.indexOf(depois))
    for (let s = 1; s <= ks.length; s++) { const k = ks[(i + s) % ks.length]; if (k !== cita && (pres.has(k) || k === me.key)) return k }
    return G.host
  }
  function passaContagem(key) {
    const l = G.lista
    if (G.fase !== 'lista' || !l || (key !== l.contador && key !== G.host)) return
    const novo = proximoContador(l.contador, l.key)
    if (novo === l.contador) return
    l.contador = novo
    ev({ t: 'contador', key: novo })
    difunde()
  }
  function conta(key, delta) {
    const l = G.lista
    if (G.fase !== 'lista' || !l || key !== l.contador) return
    const d = delta > 0 ? 1 : -1
    const novo = Math.max(0, Math.min(l.qtd, l.ok + d))
    if (novo === l.ok) return
    l.ok = novo; l.ult = { key, d }
    ev({ t: d > 0 ? 'valeu' : 'tirou', key, ok: novo })
    if (l.ok >= l.qtd) return fechaLista(true)
    difunde()
  }
  function desiste(key) {
    if (G.fase !== 'lista' || (key !== G.lista.key && key !== G.host)) return
    fechaLista(false)
  }
  function fechaLista(ganhou, tempo) {
    const l = G.lista, j = jog(l.key), mult = G.tipo === 'dobro' ? 2 : 1
    if (ganhou) { if (j) j.pontos += PTS_GANHA * mult }
    else for (const x of G.js) if (x.key !== l.key) x.pontos += PTS_MICO * mult
    G.res = { key: l.key, qtd: l.qtd, ok: l.ok, ganhou, tempo: !!tempo, mult }
    G.fase = 'resultado'
    ev({ t: ganhou ? 'arrematou' : 'micou', key: l.key })
    log(ganhou ? `${j?.nome} citou ${l.qtd}: +${PTS_GANHA * mult}.` : `${j?.nome} parou em ${l.ok} de ${l.qtd}${tempo ? ' (o tempo acabou)' : ''}: os outros ganham ${PTS_MICO * mult}.`)
    difunde()
  }
  function proximo(key) {
    if (G.fase !== 'resultado' || (key !== G.host && key !== G.res?.key)) return
    const max = Math.max(...G.js.map(j => j.pontos))
    if (max >= G.op.meta) {
      G.fase = 'fim'; G.vencedor = G.js.filter(j => j.pontos === max).map(j => j.key)
      ev({ t: 'fim' }); log(`${G.vencedor.map(k => jog(k).nome).join(' e ')} venceu.`)
      return difunde()
    }
    G.abre = (G.abre + 1) % G.js.length
    novoLote()
  }
  function revanche() {
    const ant = new Set(G.js.map(j => j.key))
    G.conv = Object.fromEntries(ctx.presentes().map(k => [k, ant.has(k) || k === me.key ? 'sim' : '?']))
    Object.assign(G, { id: novoId(), fase: 'convite', js: [], lote: 0, tema: null, lei: null, lista: null, res: null, vencedor: null, log: [], ev: [], evN: 0 })
    difunde()
  }
  // alguém saiu de vez: tira da mesa e ajeita o leilão
  function remove(key) {
    if (G.fase === 'convite') { if (key in G.conv) { delete G.conv[key]; difunde() } return }
    const i = G.js.findIndex(j => j.key === key)
    if (i < 0) return
    const j = G.js[i]
    G.js.splice(i, 1)
    ausDesde.delete(key)
    ev({ t: 'saiu', key, nome: j.nome }); log(`${j.nome} saiu da mesa.`); sysMsg(`${j.nome} saiu do Dou-lhe Uma`)
    if (G.fase === 'fim') return difunde()
    if (G.js.length < MIN_JOG) { G.fase = 'fim'; const max = Math.max(0, ...G.js.map(x => x.pontos)); G.vencedor = G.js.filter(x => x.pontos === max).map(x => x.key); return difunde() }
    if (G.abre >= G.js.length) G.abre = 0
    if (G.fase === 'tema') {
      if (G.lei.ordem[0] === key) { G.lote--; return novoLote() } // quem ia escolher o tema saiu
      G.lei.ordem = G.lei.ordem.filter(k => k !== key); G.lei.ativos = G.lei.ativos.filter(k => k !== key)
      return difunde()
    }
    if (G.fase === 'lance') {
      const L = G.lei
      if (L.lance?.key === key) { G.lote--; return novoLote() } // quem tinha o lance saiu: o lote recomeça
      const eraVez = L.vez === key, antes = L.ordem[(L.ordem.indexOf(key) - 1 + L.ordem.length) % L.ordem.length]
      L.ordem = L.ordem.filter(k => k !== key); L.ativos = L.ativos.filter(k => k !== key)
      if (eraVez) return proximoDaVez(L.ordem.includes(antes) ? antes : L.ordem[0])
      if (L.lance && !L.ativos.some(k => k !== L.lance.key)) return vendido()
    } else if (G.fase === 'lista' && G.lista.key === key) {
      G.res = { key, qtd: G.lista.qtd, ok: G.lista.ok, ganhou: false, cancelado: true }; G.fase = 'resultado'
    } else if (G.fase === 'lista' && G.lista.contador === key) G.lista.contador = proximoContador(key, G.lista.key)
    difunde()
  }
  function hostRecebe(d, key) {
    if (!G || !key || d.id !== G.id) return
    switch (d.op) {
      case 'resp': if (G.fase === 'convite') {
        G.conv[key] = d.sim ? 'sim' : 'nao'
        // junta os temas que essa pessoa já jogou em outras partidas
        if (d.sim && Array.isArray(d.vistos)) G.vistos = [...new Set([...(G.vistos || []), ...d.vistos.filter(x => typeof x === 'string').slice(-VISTOS_MAX)])].slice(-VISTOS_MAX * 3)
        difunde()
      } break
      case 'sai': if (key !== G.host) remove(key); break
      case 'lance': daLance(key, d.qtd); break
      case 'passa': passa(key); break
      case 'troca': trocaTema(key); break
      case 'tema': escolheTema(key, Math.floor(Number(d.escolha))); break
      case 'conta': conta(key, d.delta); break
      case 'desiste': desiste(key); break
      case 'passaConta': passaContagem(key); break
      case 'proximo': proximo(key); break
    }
  }
  // tudo neste jogo é público
  function vista() {
    return {
      id: G.id, seq: G.seq, host: G.host, hostNome: G.hostNome, fase: G.fase, op: G.op, conv: G.conv,
      js: G.js.map(j => ({ key: j.key, nome: j.nome, pontos: j.pontos })), lote: G.lote, tema: G.tema, opcoes: G.opcoes, tipo: G.tipo, fixo: G.fixo || 0,
      lei: G.lei, lista: G.lista && { ...G.lista, resta: G.lista.ate ? Math.max(0, G.lista.ate - Date.now()) : 0 }, res: G.res, resta: G.ate ? Math.max(0, G.ate - Date.now()) : 0, vencedor: G.vencedor, log: G.log.slice(-30), ev: G.ev,
    }
  }
  function difunde() {
    if (!G) return
    G.seq++; G.t = Date.now()
    ls.set('du.G', G)
    const v = vista()
    const ks = new Set([...ctx.presentes(), ...G.js.map(j => j.key), ...Object.keys(G.conv || {})])
    for (const k of ks) if (k !== me.key) ctx.sendTo(k, { du: { v } })
    const pres = new Set(ctx.presentes())
    G.sucessor = G.js.map(j => j.key).find(k => k !== me.key && pres.has(k)) || [...pres].find(k => k !== me.key) || null
    if (G.sucessor) ctx.sendTo(G.sucessor, { du: { bk: G } })
    aplica(vista())
  }
  function encerrar() {
    if (!G) return
    ctx.send({ du: { fim: G.id } })
    ls.set('du.G', null)
    G = null
    aplica(null)
  }
  let backup = null, hostSumiu = 0
  function assumeSePreciso() {
    if (G || !V || !backup || backup.id !== V.id || backup.sucessor !== me.key || souHost()) { hostSumiu = 0; return }
    if (ctx.presentes().includes(V.host)) { hostSumiu = 0; return }
    if (!hostSumiu) hostSumiu = Date.now()
    if (Date.now() - hostSumiu < HOST_MS) return
    const antigo = backup.host, nomeAntigo = backup.hostNome
    G = backup; backup = null; hostSumiu = 0
    G.host = me.key; G.hostNome = me.name; G.seq += 5
    sysMsg(`${nomeAntigo} caiu: ${me.name} assumiu a mesa de Dou-lhe Uma`)
    remove(antigo)
    if (G) difunde()
  }
  // o relógio da hora de citar (só nos lotes com relógio)
  setInterval(() => {
    if (G?.host !== me.key) return
    const agora = Date.now()
    if (G.fase === 'lista' && G.lista?.ate && agora > G.lista.ate) return fechaLista(false, true)
    if (!G.ate || agora < G.ate) return
    G.ate = 0
    if (G.fase === 'tema' && G.opcoes) return escolheTema(G.lei.ordem[0], 0) // demorou: fica o primeiro tema
    if (G.fase === 'lance' && G.lei.vez) {
      const L = G.lei, k = L.vez
      ev({ t: 'demorou', key: k })
      if (L.ativos.length === 1 && !L.lance) return daLance(k, 1) // ninguém deu lance e não dá para passar: vale 1
      return passa(k)
    }
  }, 250)
  setInterval(() => {
    if (!G && !restaurou && me.key) {
      restaurou = true
      const s = ls.get('du.G')
      if (s && s.host === me.key && s.fase !== 'fim' && Date.now() - s.t < 3 * 3600e3) setTimeout(() => { if (G || (V && V.host !== me.key)) return ls.set('du.G', null); G = s; difunde() }, 3000)
    }
    assumeSePreciso()
    if (!G || G.host !== me.key) return
    const pres = new Set(ctx.presentes()), agora = Date.now()
    const quem = G.fase === 'convite' ? Object.keys(G.conv).filter(k => k !== me.key) : G.js.map(j => j.key).filter(k => k !== me.key)
    for (const k of quem) { if (pres.has(k)) ausDesde.delete(k); else if (!ausDesde.has(k)) ausDesde.set(k, agora) }
    for (const [k, t] of ausDesde) if (agora - t > SAIU_MS) return remove(k)
    if (G.fase === 'lista' && G.lista && !pres.has(G.lista.contador) && G.lista.contador !== me.key && (ausDesde.get(G.lista.contador) || agora) < agora - 4000) { G.lista.contador = proximoContador(G.lista.contador, G.lista.key); difunde() }
  }, 1500)

  /* ================================================================ cliente */
  let V = null, ultEv = 0, dispensado = ''
  const vistos = new Set()
  const novo = k => vistos.has(k) ? false : (vistos.add(k), true)
  const souHost = () => V && V.host === me.key
  const eu = () => V?.js.find(j => j.key === me.key)
  const N = k => k === me.key ? 'Você' : (V?.js.find(j => j.key === k)?.nome || ctx.nomeDe(k))
  function manda(d) {
    if (!V) return
    const m = { id: V.id, ...d }
    if (souHost()) hostRecebe(m, me.key)
    else ctx.sendTo(V.host, { du: { op: m } })
  }
  function got(d, deKey) {
    if (!d) return
    if (d.op) { if (G && G.host === me.key) hostRecebe(d.op, deKey); return }
    if (d.fim) { if (V?.id === d.fim) aplica(null); return }
    if (d.bk) { if (d.bk.host === deKey) backup = d.bk; return }
    if (d.v) {
      if (G && d.v.id === G.id && d.v.host !== me.key) { G = null; ls.set('du.G', null) }
      if (d.v.id === dispensado) return
      if (V && d.v.id === V.id && d.v.seq <= V.seq) return
      aplica(d.v)
    }
  }
  let chegou = 0
  function aplica(v) {
    chegou = Date.now()
    const antes = V
    if (v && (!antes || antes.id !== v.id)) ultEv = Math.max(0, ...v.ev.map(e => e.n))
    V = v
    if (v?.tema && (v.fase === 'lance' || v.fase === 'lista')) guardaVisto(v.tema.txt)
    const evs = v ? v.ev.filter(e => e.n > ultEv) : []
    if (v) ultEv = Math.max(ultEv, ...v.ev.map(e => e.n))
    anima(evs)
    render()
  }

  /* ---------- sons ---------- */
  const buf = new Map()
  let carregando = null
  function carregaSons() {
    if (carregando) return carregando
    let ac; try { ac = ctx.audioCtx() } catch { return Promise.resolve() }
    carregando = Promise.all(SONS.map(n => fetch(SOM(n)).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(d => buf.set(n, d)).catch(() => {})))
    return carregando
  }
  function som(n, atraso = 0, vol = 1) {
    if (n === 'desliza') n = `desliza${1 + rnd(3)}`
    if (n === 'poe') n = `poe${1 + rnd(2)}`
    let ac; try { ac = ctx.audioCtx() } catch { return }
    const b = buf.get(n)
    if (!ac || !b) { carregaSons(); return }
    if (ac.state === 'suspended') ac.resume()
    const s = ac.createBufferSource(); s.buffer = b
    s.playbackRate.value = .95 + Math.random() * .1
    const g = ac.createGain(); g.gain.value = (VOL[n] ?? .55) * vol
    s.connect(g).connect(ctx.saida())
    s.start(ac.currentTime + atraso / 1000)
    s.onended = () => g.disconnect()
  }

  /* ---------- a mesa ---------- */
  const botao = (conteudo, fn, cls = '', title = '') => { const b = el('button', { type: 'button', className: `du-btn ${cls}`, title }); b.append(...[conteudo].flat()); b.addEventListener('click', e => { e.stopPropagation(); b.blur(); som('clique'); fn(e) }); return b }
  const retrato = (k, cls = '') => el('span', { className: `du-foto ${cls}`, 'data-key': k }, ctx.pfp(k, 64, N(k)))
  const selo = (tipo, grande) => {
    const t = TIPOS[tipo] || TIPOS.calma, fixo = tipo === 'fixo' && V?.fixo
    return el('span', { className: `du-selo du-selo--${tipo}` + (grande ? ' grande' : ''), title: t.dica }, icon(t.ic), el('b', { textContent: fixo ? `${V.fixo} s cravados` : t.nome }), grande ? el('small', { textContent: t.dica }) : '')
  }
  const martelo = (cls = '') => el('span', { className: `du-martelo ${cls}`, innerHTML: SVG_MARTELO })
  // a animação do "dou-lhe uma, dou-lhe duas, vendido!" fica por cima mesmo se a tela for refeita no meio
  let fx = null
  let lanceSel = 0, lanceChave = ''

  function render() {
    tela.classList.toggle('du--on', !!V)
    ctx.onAtivo?.(!!V)
    if (!V) { tela.replaceChildren(); return }
    const topo = el('header', { className: 'du-topo' },
      el('span', { className: 'du-logo' }, martelo(), el('b', { textContent: 'Dou-lhe Uma' })),
      V.fase !== 'convite' && V.fase !== 'fim' ? el('span', { className: 'du-meta', textContent: `lote ${V.lote} · quem fizer ${V.op.meta} pontos leva` }) : '',
      V.fase !== 'convite' && V.fase !== 'fim' ? selo(V.tipo) : '',
      el('span', { className: 'du-grow' }),
      V.js.length ? placar() : '',
      souHost() ? botao(icon('x'), encerrar, 'du-btn--ic', 'Encerrar a mesa para todo mundo')
        : botao(icon('x'), () => { dispensado = V.id; aplica(null) }, 'du-btn--ic', 'Sair da mesa (só para você)'))
    let corpo
    if (V.fase === 'convite') corpo = convite()
    else if (V.fase === 'fim') corpo = fim()
    else corpo = mesa()
    tela.replaceChildren(topo, corpo, bilhete())
    if (fx && Date.now() < fx.ate) tela.append(fx.el)
    ctx.hydrate(tela)
  }
  function placar() {
    const ord = V.js.slice().sort((a, b) => b.pontos - a.pontos)
    return el('div', { className: 'du-placar' }, ...ord.map(j => el('span', { className: 'du-placar__p', title: `${j.nome}: ${j.pontos} ponto${j.pontos === 1 ? '' : 's'}` }, retrato(j.key), el('b', { textContent: j.pontos }))))
  }

  // página inicial: três quadrinhos animados (tema, lances subindo, a call contando)
  function convite() {
    const host = souHost()
    const n = Object.entries(V.conv).filter(([k, v]) => v === 'sim' && ctx.presentes().includes(k)).length
    const quadro = (num, cena, rotulo) => el('div', { className: 'du-passo', style: `--d:${num * 140}ms` }, el('div', { className: `du-cena du-cena--${num}` }, ...cena), el('span', { className: 'du-passo__rot' }, rotulo))
    const tutorial = el('div', { className: 'du-tutorial' },
      quadro(1, [el('span', { className: 'du-mini-placa' }, el('small', { textContent: 'lote 1' }), el('b', { textContent: 'Filmes da Pixar' }))], 'Sai um tema'),
      quadro(2, [el('span', { className: 'du-mini-plq a', textContent: '5' }), el('span', { className: 'du-mini-plq b', textContent: '7' }), el('span', { className: 'du-mini-plq c', textContent: '8' })], 'Quem cita mais?'),
      quadro(3, [el('span', { className: 'du-mini-slots' }, ...Array.from({ length: 8 }, (_, i) => el('i', { style: `--i:${i}` })))], 'A call conta'))
    const meta = el('div', { className: 'du-seg' }, ...METAS.map(([m, t]) => host
      ? botao(t, () => { G.op.meta = m; difunde() }, V.op.meta === m ? 'du-on' : '')
      : el('span', { className: V.op.meta === m ? 'du-on' : '', textContent: t })))
    const grupos = el('div', { className: 'du-chips' }, ...Object.entries(GRUPOS).map(([g, t]) => {
      const on = V.op.grupos.includes(g)
      const conteudo = [on ? icon('check') : '', el('span', { textContent: t })]
      if (!host) return el('span', { className: 'du-chip' + (on ? ' du-on' : '') }, ...conteudo)
      return botao(conteudo, () => { const s = new Set(G.op.grupos); on ? s.delete(g) : s.add(g); if (!s.size) return toast('Deixe pelo menos um assunto.'); G.op.grupos = [...s]; difunde() }, 'du-chip' + (on ? ' du-on' : ''))
    }))
    const seg = (lista, atual, fn) => el('div', { className: 'du-seg' }, ...lista.map(([v, t]) => host ? botao(t, () => { fn(v); difunde() }, atual === v ? 'du-on' : '') : el('span', { className: atual === v ? 'du-on' : '', textContent: t })))
    const opcao = (rot, ctl) => el('div', { className: 'du-opcao' }, el('small', { textContent: rot }), ctl)
    const opcoes = el('div', { className: 'du-opcoes' },
      opcao('Assuntos', grupos),
      opcao('Dificuldade dos temas', seg(NIVEIS.map(([n, t]) => [n, n === 1 ? 'Fácil' : n === 2 ? 'Até médio' : 'Todos']), V.op.nivel || 1, v => { G.op.nivel = v })),
      opcao('Tempo para citar', seg(MODOS_LOTE, V.op.lotes || 'variado', v => { G.op.lotes = v })),
      opcao('Partida', meta))
    const pessoas = el('div', { className: 'du-pessoas' }, ...Object.entries(V.conv).map(([k, v]) => el('span', { className: `du-pessoa du-pessoa--${v}`, title: v === 'sim' ? 'vai jogar' : v === 'nao' ? 'só assiste' : 'decidindo' }, retrato(k), el('small', { textContent: k === me.key ? 'você' : ctx.nomeDe(k) }))))
    const ir = host ? botao(n >= MIN_JOG ? `Começar · ${n}` : `Precisa de ${MIN_JOG}`, comecar, 'du-btn--forte du-btn--grande') : el('small', { className: 'du-espera', textContent: `${V.hostNome} vai começar` })
    if (host && n < MIN_JOG) ir.disabled = true
    return el('div', { className: 'du-inicio' }, tutorial,
      el('p', { className: 'du-regra' }, el('b', { textContent: `Bateu o lance: +${PTS_GANHA}` }), ' · ', el('span', { textContent: `micou: +${PTS_MICO} para cada um dos outros` }), ' · ',
        V.op.lotes === 'fixo' ? 'todo lote tem 20, 30 ou 40 s para citar' : V.op.lotes === 'calma' ? 'todo lote tem tempo folgado para citar' : V.op.lotes === 'relogio' ? 'todo lote tem tempo apertado para citar' : 'cada lote sorteia: metade com 20, 30 ou 40 s; o resto apertado, folgado ou vale dobro'),
      opcoes, pessoas,
      el('div', { className: 'du-linha' }, host ? botao(V.conv[me.key] === 'sim' ? 'Eu jogo' : 'Eu só assisto', () => { G.conv[me.key] = G.conv[me.key] === 'sim' ? 'nao' : 'sim'; difunde() }, 'du-btn--leve') : '', ir))
  }
  function bilhete() {
    if (V.fase !== 'convite' || souHost() || V.conv[me.key] !== '?') return ''
    if (novo('conv:' + V.id)) som('papel')
    return el('div', { className: 'du-bilhete' },
      el('div', { className: 'du-linha' }, retrato(V.host), el('span', {}, el('b', { textContent: V.hostNome }), ' chamou você para o Dou-lhe Uma')),
      el('div', { className: 'du-linha' }, botao('Jogar', () => manda({ op: 'resp', sim: true, vistos: meusVistos() }), 'du-btn--forte'), botao('Só assistir', () => manda({ op: 'resp', sim: false }), 'du-btn--leve')))
  }

  // a placa do lote: o tema em destaque
  const NIVEL_NOME = { 1: 'fácil', 2: 'médio', 3: 'difícil' }
  function placa() {
    const base = `${V.id}:${V.lote}`
    const entra = novo(`placa:${base}:${V.tema?.txt}`)
    return el('div', { className: 'du-placa' + (entra ? ' entra' : '') },
      el('span', { className: 'du-placa__lote' }, el('small', { textContent: 'lote' }), el('b', { textContent: String(V.lote).padStart(2, '0') })),
      el('div', { className: 'du-placa__txt' }, el('small', { textContent: `${GRUPOS[V.tema.grupo]} · ${NIVEL_NOME[V.tema.nivel] || 'fácil'}` }), el('b', { textContent: V.tema.txt })),
      selo(V.tipo, true))
  }
  // quem abre o lote escolhe o tema entre três
  function escolheTemaUI() {
    const pode = souHost() || V.lei.ordem[0] === me.key, quem = V.lei.ordem[0]
    const base = `${V.id}:${V.lote}:${V.opcoes.map(o => o.txt).join('|')}`
    const entra = novo(`ops:${base}`)
    return el('div', { className: 'du-mesa du-mesa--tema' },
      el('div', { className: 'du-tema__cab' }, el('span', { className: 'du-placa__lote du-placa__lote--solta' }, el('small', { textContent: 'lote' }), el('b', { textContent: String(V.lote).padStart(2, '0') })),
        el('p', {}, pode ? el('b', { textContent: quem === me.key ? 'Escolha o tema deste lote' : `${N(quem)} escolhe o tema (ou você, que abriu a mesa)` }) : [el('b', { textContent: N(quem) }), ' está escolhendo o tema…']),
        selo(V.tipo, true)),
      el('div', { className: 'du-temas' }, ...V.opcoes.map((o, i) => {
        const c = el(pode ? 'button' : 'div', { className: 'du-tema' + (entra ? ' entra' : ''), type: 'button', style: `--d:${i * 90}ms` }, el('small', { textContent: `${GRUPOS[o.grupo]} · ${NIVEL_NOME[o.nivel] || 'fácil'}` }), el('b', { textContent: o.txt }))
        if (pode) c.addEventListener('click', () => { som('carimbo', 0, .5); manda({ op: 'tema', escolha: i }) })
        return c
      })),
      el('div', { className: 'du-linha' }, tempinho(), pode ? botao([icon('refresh-cw'), el('span', { textContent: 'Outros três' })], () => manda({ op: 'troca' }), 'du-btn--leve') : ''))
  }
  // barrinha discreta do tempo da vez (45 s): só para não deixar a mesa parada
  const tempinho = () => V.resta ? el('div', { className: 'du-tempinho', title: 'Se acabar, a vez passa sozinha' }, el('span', { className: 'du-tempinho__barra' }, el('i')), el('small', { className: 'du-tempinho__n' })) : ''
  // a tarja de TV com o lance atual
  function tarja() {
    const L = V.lei, l = V.lista
    const k = l?.key || L?.lance?.key, qtd = l?.qtd || L?.lance?.qtd
    if (!k) return el('div', { className: 'du-tarja du-tarja--vazia' }, el('span', { textContent: 'Sem lance ainda' }), el('b', { textContent: '—' }))
    const entra = novo(`tarja:${V.id}:${V.lote}:${qtd}:${k}`)
    return el('div', { className: 'du-tarja' + (entra ? ' entra' : '') },
      el('span', { className: 'du-tarja__rot', textContent: V.fase === 'lance' ? 'Maior lance' : 'Arrematado por' }),
      retrato(k, 'du-foto--tarja'), el('span', { className: 'du-tarja__nome', textContent: N(k) }),
      el('b', { className: 'du-tarja__n', textContent: qtd }), el('small', { textContent: qtd === 1 ? 'item' : 'itens' }))
  }
  function mesa() {
    const f = V.fase
    if (f === 'tema') return escolheTemaUI()
    const corpo = f === 'lance' ? leilao() : f === 'lista' ? lista() : resultado()
    return el('div', { className: 'du-mesa du-mesa--' + f }, placa(), tarja(), corpo)
  }
  function leilao() {
    const L = V.lei, base = `${V.id}:${V.lote}`
    const ult = {}; L.hist.forEach((h, i) => { ult[h.k] = { qtd: h.qtd, i } })
    const fila = el('ul', { className: 'du-fila' }, ...L.ordem.map(k => {
      const u = ult[k], vez = L.vez === k, tem = L.lance?.key === k, passou = !L.ativos.includes(k)
      const plq = u?.qtd ? el('span', { className: 'du-plq' + (tem ? ' top' : '') + (novo(`${base}:p${u.i}`) ? ' entra' : '') }, el('b', { textContent: u.qtd }))
        : passou ? el('span', { className: 'du-carimbo' + (novo(`${base}:x:${k}`) ? ' entra' : ''), textContent: 'passou' }) : el('span', { className: 'du-plq du-plq--vazia' })
      return el('li', { className: 'du-licitante' + (vez ? ' vez' : '') + (tem ? ' tem' : '') + (passou ? ' passou' : '') + (k === me.key ? ' eu' : ''), 'data-key': k },
        plq, retrato(k), el('b', { textContent: N(k) }), el('small', { textContent: vez ? 'pensando…' : tem ? 'maior lance' : passou ? 'fora do lote' : u ? `disse ${u.qtd}` : 'esperando' }))
    }))
    let ctl
    if (L.vez === me.key) {
      const min = (L.lance?.qtd || 0) + 1
      const chave = `${base}:${L.hist.length}`
      if (lanceChave !== chave) { lanceChave = chave; lanceSel = min }
      lanceSel = Math.max(min, Math.min(MAX_LANCE, lanceSel))
      const num = el('b', { className: 'du-passo-n', textContent: lanceSel })
      const ajusta = d => { lanceSel = Math.max(min, Math.min(MAX_LANCE, lanceSel + d)); num.textContent = lanceSel; menos.disabled = lanceSel <= min; dar.querySelector('.du-dar__txt').textContent = `Dar lance de ${lanceSel}`; som('tique', 0, .6) }
      const menos = botao(icon('chevron-left'), () => ajusta(-1), 'du-btn--ic du-btn--grande', 'Menos um')
      menos.disabled = lanceSel <= min
      const dar = botao([martelo(), el('span', { className: 'du-dar__txt', textContent: `Dar lance de ${lanceSel}` })], () => manda({ op: 'lance', qtd: lanceSel }), 'du-btn--forte du-btn--grande')
      const podePassar = !(L.ativos.length === 1 && !L.lance)
      ctl = el('div', { className: 'du-vez' + (novo(`vez:${chave}`) ? ' entra' : '') },
        el('small', { className: 'du-vez__k', textContent: L.lance ? `Sua vez: cubra o ${L.lance.qtd}` : 'Sua vez: abra o leilão' }),
        el('div', { className: 'du-stepper' }, menos, num, botao(icon('chevron-right'), () => ajusta(1), 'du-btn--ic du-btn--grande', 'Mais um'),
          botao('+5', () => ajusta(5), 'du-btn--leve', 'Mais cinco')),
        el('div', { className: 'du-linha' }, dar, podePassar ? botao('Passo', () => manda({ op: 'passa' }), 'du-btn--leve du-btn--grande', 'Sai deste lote') : el('small', { className: 'du-nota', textContent: 'Todos passaram: alguém tem que dar um lance.' })))
    } else ctl = el('p', { className: 'du-aguarda' }, retrato(L.vez), el('span', {}, el('b', { textContent: N(L.vez) }), L.lance ? ` vai cobrir o ${L.lance.qtd} ou passar…` : ' abre o leilão…'))
    const dica0 = el('small', { className: 'du-dica', textContent: `Quantos itens de "${V.tema.txt}" você consegue citar? Cubra com um número maior ou passe. Quem ficar com o maior lance cita tudo em ${V.tipo === 'fixo' ? `${V.fixo} s, seja qual for o lance` : V.tipo === 'relogio' ? 'tempo apertado (2,5 s por item + 5 s)' : 'tempo folgado (4 s por item + 8 s)'}.` })
    return el('div', { className: 'du-leilao' }, fila, el('div', { className: 'du-leilao__ctl' }, tempinho(), ctl, dica0))
  }
  // a hora da verdade: quem arrematou cita em voz alta e a call conta
  function lista() {
    const l = V.lista, souEu = l.key === me.key
    const slots = el('div', { className: 'du-slots', style: `--qtd:${l.qtd}` }, ...Array.from({ length: l.qtd }, (_, i) => {
      const ok = i < l.ok
      return el('i', { className: 'du-slot' + (ok ? ' ok' : '') + (ok && novo(`slot:${V.id}:${V.lote}:${i}:${l.ok > i}`) ? ' entra' : '') }, ok ? icon('thumbs-up') : el('span', { textContent: i + 1 }))
    }))
    const quem = l.ult ? el('small', { className: 'du-ult', textContent: `${l.ult.d > 0 ? '+1' : '−1'} de ${N(l.ult.key)}` }) : el('small', { className: 'du-ult', textContent: souEu ? `${N(l.contador)} vai contando enquanto você fala` : l.contador === me.key ? 'Aperte a cada item que valer' : '' })
    const falando = ctx.falando(l.key)
    const relogio = el('div', { className: 'du-relogio' + (l.folga ? ' du-relogio--pensa' : '') }, icon(l.folga ? 'coffee' : 'clock'), el('b', { className: 'du-relogio__n' }),
      el('small', { className: 'du-relogio__rot', textContent: `para citar os ${l.qtd}${l.folga ? ' · tempo folgado' : ''}${V.tipo === 'dobro' ? ' · vale dobro' : ''}` }), el('span', { className: 'du-relogio__barra' }, el('i')))
    const contoEu = l.contador === me.key
    const contador = el('div', { className: 'du-contador' + (contoEu ? ' eu' : '') }, retrato(l.contador, 'du-foto--mini'),
      el('span', {}, contoEu ? el('b', { textContent: 'Você está contando' }) : [el('b', { textContent: N(l.contador) }), ' está contando']),
      contoEu || souHost() ? botao([icon('refresh-cw'), el('span', { textContent: contoEu ? 'Passar a contagem' : 'Trocar quem conta' })], () => manda({ op: 'passaConta' }), 'du-btn--leve', `Passa para ${N(V.js.map(j => j.key).filter(k => k !== l.key && k !== l.contador)[0] || '')}`) : '')
    let ctl
    if (contoEu) ctl = el('div', { className: 'du-linha du-conta' },
      botao([icon('thumbs-up'), el('span', { textContent: 'Valeu! +1' })], () => manda({ op: 'conta', delta: 1 }), 'du-btn--verde du-btn--enorme', 'Esse item vale'),
      botao('−1', () => manda({ op: 'conta', delta: -1 }), 'du-btn--leve', 'Tirar um (contou a mais)'))
    else if (souEu) ctl = el('div', { className: 'du-linha du-conta' }, el('p', { className: 'du-fala', textContent: 'Fale os itens em voz alta!' }))
    else ctl = el('p', { className: 'du-dica', textContent: `Ouça ${N(l.key)} e ajude ${N(l.contador)} a contar só os que valem.` })
    const desistir = souEu || souHost() ? botao(souEu ? 'Não consigo mais' : 'Não conseguiu', () => manda({ op: 'desiste' }), 'du-btn--leve du-btn--perigo', 'Encerra: os outros ganham') : ''
    return el('div', { className: 'du-lista' }, relogio,
      el('div', { className: 'du-lista__quem' + (falando ? ' fala' : '') }, retrato(l.key, 'du-foto--grande'),
        el('span', {}, el('b', { textContent: souEu ? 'Sua vez de citar' : `${N(l.key)} está citando` }), el('small', { textContent: `${l.ok} de ${l.qtd}` }))),
      slots, quem, contador, ctl, desistir)
  }
  function resultado() {
    const r = V.res, j = V.js.find(x => x.key === r.key)
    const carimbo = el('div', { className: 'du-res' + (r.ganhou ? ' ganhou' : ' micou') + (novo(`res:${V.id}:${V.lote}`) ? ' entra' : '') },
      el('span', { className: 'du-res__selo', textContent: r.cancelado ? 'Cancelado' : r.ganhou ? 'Arrematou!' : r.tempo ? 'Acabou o tempo!' : 'Micou!' }),
      el('p', {}, r.cancelado ? `${j?.nome || 'Quem arrematou'} saiu da mesa. Próximo lote.` : r.ganhou ? `${N(r.key)} citou ${r.qtd} e leva +${PTS_GANHA * (r.mult || 1)}${r.mult > 1 ? ' (dobro!)' : ''}.` : `${r.tempo ? 'O tempo acabou! ' : ''}${N(r.key)} parou em ${r.ok} de ${r.qtd}. Os outros ganham +${PTS_MICO * (r.mult || 1)}.`))
    const pode = souHost() || r.key === me.key
    const max = Math.max(...V.js.map(x => x.pontos))
    return el('div', { className: 'du-resultado' }, carimbo,
      pode ? botao(max >= V.op.meta ? 'Ver quem levou' : 'Próximo lote', () => manda({ op: 'proximo' }), 'du-btn--forte du-btn--grande') : el('small', { className: 'du-espera', textContent: `${N(r.key)} ou ${V.hostNome} chama o próximo lote` }))
  }
  function fim() {
    const ord = V.js.slice().sort((a, b) => b.pontos - a.pontos)
    return el('div', { className: 'du-fim' },
      martelo('du-martelo--grande'),
      el('b', { className: 'du-fim__t', textContent: V.vencedor?.length ? `${V.vencedor.map(N).join(' e ')} ${V.vencedor.length > 1 ? 'levaram' : 'levou'}!` : 'Fim do leilão' }),
      el('ol', { className: 'du-podio' }, ...ord.map((j, i) => el('li', { className: V.vencedor?.includes(j.key) ? 'top' : '' }, el('i', { textContent: `${i + 1}º` }), retrato(j.key), el('b', { textContent: j.nome }), el('em', { textContent: j.pontos })))),
      souHost() ? el('div', { className: 'du-linha' }, botao('Nova partida', revanche, 'du-btn--forte du-btn--grande'), botao('Fechar', encerrar, 'du-btn--leve')) : el('small', { className: 'du-espera', textContent: `${V.hostNome} decide se tem revanche` }))
  }

  // "Dou-lhe uma… dou-lhe duas… VENDIDO!"
  function vendidoFx(e) {
    const n = el('div', { className: 'du-vendido' },
      el('span', { className: 'du-vendido__a', textContent: 'Dou-lhe uma…' }),
      el('span', { className: 'du-vendido__b', textContent: 'dou-lhe duas…' }),
      el('span', { className: 'du-vendido__c' }, martelo(), el('b', { textContent: 'Vendido!' }), el('small', { textContent: `${N(e.key)} · ${e.qtd} ${e.qtd === 1 ? 'item' : 'itens'}` })))
    fx = { el: n, ate: Date.now() + 2900 }
    som('tique', 0); som('tique', 650); som('carimbo', 1300); som('leque', 1500, .6)
    setTimeout(() => { if (fx?.el === n) { n.remove(); fx = null } }, 2900)
  }
  function anima(evs) {
    for (const e of evs) {
      if (e.t === 'inicio') som('embaralhar')
      else if (e.t === 'lote') { som('papel', 200); if (e.quem === me.key) som('vez', 600) }
      else if (e.t === 'troca') som('papel')
      else if (e.t === 'tema') som('carimbo', 0, .5)
      else if (e.t === 'demorou') toast(`${N(e.key)} demorou: a vez passou`, 2200)
      else if (e.t === 'contador') { som('papel', 0, .6); if (e.key === me.key) { toast('Agora você conta os itens', 2200); som('vez', 200) } }
      else if (e.t === 'lance') som('poe')
      else if (e.t === 'passou') som('desliza', 0, .7)
      else if (e.t === 'vendido') { vendidoFx(e); if (V?.lista?.contador === me.key) setTimeout(() => toast('Você conta os itens que valerem', 2600), 2900) }
      else if (e.t === 'valeu') som('poe', 0, .8)
      else if (e.t === 'tirou') som('desliza', 0, .6)
      else if (e.t === 'arrematou') { som('carimbo'); som('leque', 250) }
      else if (e.t === 'micou') som('carimbo', 0, .8)
      else if (e.t === 'fim') som('leque', 300)
      else if (e.t === 'saiu') toast(`${e.nome} saiu da mesa`, 3200)
    }
    // na minha vez de dar lance, aviso sonoro
    if (V?.fase === 'lance' && V.lei.vez === me.key && novo(`minhavez:${V.id}:${V.lote}:${V.lei.hist.length}`)) som('vez', 300)
  }
  // quem caiu fica apagado; quem está falando acende (na hora de citar)
  ;(function loop() {
    if (V) {
      const pres = new Set(ctx.presentes())
      for (const s of tela.querySelectorAll('[data-key]')) s.classList.toggle('caiu', !pres.has(s.dataset.key))
      const rel = tela.querySelector('.du-relogio')
      if (rel && V.lista?.tot) {
        const resta = Math.max(0, V.lista.resta - (Date.now() - chegou)), tot = V.lista.tot, falta = Math.min(tot, resta)
        rel.querySelector('.du-relogio__n').textContent = resta > tot ? 'Prepare-se…' : `${Math.ceil(falta / 1000)} s`
        rel.querySelector('.du-relogio__barra i').style.width = `${(falta / tot) * 100}%`
        rel.classList.toggle('urgente', resta <= tot && falta < (V.lista.folga ? 8000 : 5000))
      }
      const tp = tela.querySelector('.du-tempinho')
      if (tp && V.resta) {
        const falta = Math.max(0, V.resta - (Date.now() - chegou))
        tp.querySelector('.du-tempinho__n').textContent = `${Math.ceil(falta / 1000)} s`
        tp.querySelector('i').style.width = `${(falta / VEZ_MS) * 100}%`
        tp.classList.toggle('urgente', falta < 6000)
      }
      const q = tela.querySelector('.du-lista__quem')
      if (q && V.lista) q.classList.toggle('fala', !!ctx.falando(V.lista.key))
    }
    setTimeout(loop, 200)
  })()

  function iniciar(chamados) {
    carregaSons()
    if (V && !souHost()) return toast(`Já tem uma mesa aberta (de ${V.hostNome})`)
    if (G) return toast('A mesa já está aberta')
    abrir(chamados)
  }
  window.__du = () => ({ G, V, difunde })
  return {
    got: (d, k) => { carregaSons(); got(d, k) }, iniciar, ativo: () => !!V,
    lider: () => !!V && souHost(),
    encerra: () => { if (G && G.host === me.key) encerrar() },
    sair: () => { if (!V) return; if (G && G.host === me.key) return encerrar(); manda({ op: 'sai' }); dispensado = V.id; aplica(null) },
    jogadores: () => !V ? [] : V.fase === 'convite' || !V.js?.length ? Object.keys(V.conv || {}).filter(k => V.conv[k] === 'sim') : V.js.map(j => j.key),
    entrouAlguem: key => { if (!G || G.host !== me.key) return; if (G.fase === 'convite' && !(key in G.conv)) { G.conv[key] = '?'; return difunde() } ctx.sendTo(key, { du: { v: vista() } }) },
  }
}
