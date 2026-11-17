/* Página dela: assiste a live (jogo + câmera já juntos), conversa no chat, manda pix e entra na linha. */
import LIVE from './config.js'
import { criaPalco, reais, relogio } from './palco.js'
import { entraLive, codigoDaUrl } from './rede.js'
import { criaPlayer, buscaMusica, minutos } from './radio.js'
import { somPix, somLinha, falaPix, fala, medidor, retomaAudio, VOZES, vozesIA, vozValida, tocaIA } from './sons.js'
import { ic, poeIcones } from './icones.js'
import { quemSou, fotoDe, corDe, perfisProntos } from './pessoas.js'

const $ = s => document.querySelector(s)
const codigo = codigoDaUrl()
poeIcones()
document.querySelectorAll('[data-nome]').forEach(s => { s.setAttribute('aria-label', LIVE.streamer); s.innerHTML = '<use href="#pl-nome"/>' })
const amigo = new URLSearchParams(location.search).has('amigos')
let eu = { key: 'ela', nome: LIVE.ela, ela: true }
$('#entradaTxt').textContent = !codigo ? 'Esse link está incompleto. Peça o link da live pra ele de novo.' : amigo ? `${LIVE.streamer} está ao vivo jogando ${LIVE.jogo}` : `${LIVE.streamer} está te esperando na live de ${LIVE.jogo}`
const prontoEu = quemSou(amigo).then(async q => {
  eu = q
  if (!amigo) return
  await perfisProntos
  if (q.logado) { $('#quemSou').hidden = false; $('#quemFoto').src = fotoDe(q.key); $('#quemNome').textContent = q.nome; $('#btnEntrar').textContent = `Entrar como ${q.nome}` }
  else { $('#nomeEntrada').hidden = false; $('#nomeEntrada').value = q.nome || ''; $('#btnEntrar').textContent = 'Entrar na live' }
})
if (!codigo) $('#btnEntrar').hidden = true

const palco = criaPalco($('#palco'), { comSom: true, composto: true }) // jogo + câmera chegam juntos, num vídeo só
const somEstudio = new Audio(); somEstudio.autoplay = true
const player = criaPlayer({ volume: 40 })
let est = { cena: 'comecando' }, live = null, estudioOn = false, abaixa = false

/* ---------- volume ---------- */
const vJogo = palco.el.querySelector('video.jogo')
// rádio: o volume que ele escolheu no mixer × o seu volume; abaixa quando ele fala
let mudo = false
const volume = () => { const v = mudo ? 0 : +$('#volume').value / 100; vJogo.volume = v; somEstudio.volume = v; player.volume(v * 75 * (est.mix?.radio ?? .6) * (abaixa ? .35 : 1)) }
try { $('#volume').value = localStorage.getItem('live.volume') ?? 90 } catch {}
$('#volume').oninput = () => { volume(); try { localStorage.setItem('live.volume', $('#volume').value) } catch {} }

/* ---------- controles da live: som, chat, tela cheia ---------- */
const playerEl = $('#player')
let somemT = 0
function mostraControles() {
  playerEl.classList.add('mostra'); playerEl.classList.remove('esconde-mouse')
  clearTimeout(somemT)
  somemT = setTimeout(() => { if (!playerEl.querySelector('.controles:hover')) { playerEl.classList.remove('mostra'); if (document.fullscreenElement) playerEl.classList.add('esconde-mouse') } }, 2600)
}
playerEl.addEventListener('mousemove', mostraControles)
playerEl.addEventListener('touchstart', mostraControles, { passive: true })
playerEl.addEventListener('mouseleave', () => { clearTimeout(somemT); playerEl.classList.remove('mostra') })
function alternaMudo() {
  mudo = !mudo; volume()
  $('#btnMudo').innerHTML = ic(mudo ? 'volume-x' : 'volume-2'); $('#btnMudo').title = mudo ? 'Ligar o som (M)' : 'Som (M)'
}
$('#btnMudo').onclick = alternaMudo
let novas = 0
function alternaChat(mostrar = document.body.classList.contains('sem-chat')) {
  document.body.classList.toggle('sem-chat', !mostrar)
  try { localStorage.setItem('live.semChat', mostrar ? '' : '1') } catch {}
  $('#btnChat').title = mostrar ? 'Esconder o chat (C)' : 'Mostrar o chat (C)'
  if (mostrar) { novas = 0; $('#bChatNovo').hidden = true; const b = $('#msgs'); b.scrollTop = b.scrollHeight }
}
$('#btnChat').onclick = () => alternaChat()
$('#btnFechaChat').onclick = () => alternaChat(false)
try { if (localStorage.getItem('live.semChat')) alternaChat(false) } catch {}
async function alternaCheia() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen({ navigationUI: 'hide' }) } catch {}
}
$('#btnCheia').onclick = alternaCheia
document.addEventListener('fullscreenchange', () => {
  const cheia = !!document.fullscreenElement
  document.body.classList.toggle('cheia', cheia)
  $('#btnCheia').innerHTML = ic(cheia ? 'minimize' : 'maximize'); $('#btnCheia').title = cheia ? 'Sair da tela cheia (F)' : 'Tela cheia (F)'
  mostraControles()
})
playerEl.addEventListener('dblclick', e => { if (!e.target.closest('.controles')) alternaCheia() })
// os botões de ação dentro da tela cheia apertam os de baixo
document.querySelectorAll('[data-faz]').forEach(b => b.onclick = () => $('#' + b.dataset.faz).click())
addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return
  const k = e.key.toLowerCase()
  if (k === 'f') alternaCheia()
  if (k === 'c') alternaChat()
  if (k === 'm') alternaMudo()
})

/* ---------- estado do estúdio ---------- */
function aplica(e) {
  est = e
  if (e.semJogo) palco.setJogo(null)
  palco.estado(e, e.relogio)
  player.segue(e.radio, e.cena !== 'jogo' || !!e.radioJogo, palco.agora)
  volume()
  $('#titulo').firstChild.textContent = e.titulo || LIVE.titulo
  $('#titulo small').textContent = `${LIVE.streamer} está jogando ${LIVE.jogo}`
  const vivo = !!e.inicio
  $('#vivo').classList.toggle('off', !vivo); $('#vivo span').textContent = vivo ? 'ao vivo' : 'offline'
  espera()
  pintaEnq()
  pintaSaldo(); marca(); infoPix()
}

/* ---------- enquete: ela vota (pode trocar até acabar) ---------- */
const LETRAS = 'ABCD'
let meuVoto = null, enqId = null
function pintaEnq() {
  const e = est.enquete, card = $('#enqCard')
  if (!e || (e.fim && palco.agora() - (e.fimEm || 0) > 15000)) { card.hidden = true; return }
  if (e.id !== enqId) { enqId = e.id; meuVoto = null; card.hidden = false; card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '' }
  card.hidden = false
  $('#enqP').textContent = e.pergunta
  const box = $('#enqOps')
  if (box.children.length !== e.opcoes.length || box.dataset.id !== e.id) {
    box.dataset.id = e.id
    box.innerHTML = e.opcoes.map((o, i) => `<button type="button" data-i="${i}"><span>${LETRAS[i]}</span><span></span><span></span></button>`).join('')
    box.querySelectorAll('button').forEach((b, i) => b.children[1].textContent = e.opcoes[i])
  }
  const total = e.votos.reduce((a, b) => a + b, 0)
  box.querySelectorAll('button').forEach((b, i) => {
    b.disabled = !!e.fim
    b.setAttribute('aria-pressed', meuVoto === i)
    b.classList.toggle('ganhou', !!e.fim && e.ganhador === i)
    b.children[2].textContent = e.fim && total ? Math.round(e.votos[i] / total * 100) + '%' : ''
  })
  $('#enqSt').textContent = e.fim ? '· resultado' : ''
  $('#enqPe').textContent = e.fim
    ? (e.palpite != null ? (e.palpite === e.ganhador ? `${LIVE.streamer} apostou certinho no que você ia escolher` : `${LIVE.streamer} apostou em ${LETRAS[e.palpite]} e errou`) : meuVoto != null ? 'Valeu pelo voto!' : 'Acabou o tempo')
    : meuVoto == null ? 'Toque numa opção para votar' : e.palpite != null ? `${LIVE.streamer} fez uma aposta: o resultado aparece no fim` : 'Dá para trocar o voto até acabar o tempo'
}
$('#enqOps').onclick = ev => {
  const b = ev.target.closest('[data-i]'), e = est.enquete
  if (!b || !e || e.fim || !live) return
  meuVoto = +b.dataset.i
  live.acoes.voto.send({ id: e.id, i: meuVoto })
  pintaEnq()
}
setInterval(() => {
  const e = est.enquete; if (!e || e.fim || $('#enqCard').hidden) return
  const tot = (e.ate - (e.desde || e.ate - 60000)) || 1
  $('#enqT').style.width = Math.max(0, Math.min(100, (e.ate - palco.agora()) / tot * 100)) + '%'
}, 500)
if (!$('#titulo').firstChild || $('#titulo').firstChild.nodeType !== 3) $('#titulo').prepend(document.createTextNode(LIVE.titulo))
function espera() {
  const vivo = estudioOn && !!est.inicio
  $('#espera').classList.toggle('some', vivo)
  $('#espera b').textContent = !estudioOn ? 'a live ainda não começou' : est.inicio ? '' : 'ele está se arrumando pra live'
}
setInterval(() => { $('#tempo').textContent = est.inicio ? relogio(((est.fimEm || palco.agora()) - est.inicio) / 1000) : '00:00:00' }, 500)

/* ---------- chat ---------- */
const vistos = new Set()
function poeMsg(m) {
  if (m.id && vistos.has(m.id)) return
  if (m.id) vistos.add(m.id)
  const d = document.createElement('div')
  const nomeM = m.de === 'ele' ? LIVE.streamer : m.de === 'amigo' ? (m.nome || 'Convidado') : LIVE.ela, corM = m.de === 'amigo' ? corDe(m.key) : '#ff9ccb'
  if (m.pix) { d.className = 'pixmsg'; d.innerHTML = `<strong>pix de ${reais(m.pix)}</strong><b style="color:${corM}"></b>: `; d.querySelector('b').textContent = nomeM; d.append(m.txt || '') }
  else if (m.sis) { d.className = m.ped ? 'pedmsg' : 'sis'; if (m.ped) d.innerHTML = ic('music'); d.append(m.txt) }
  else {
    d.className = m.de === 'ele' ? 'eu' : 'ela'
    d.innerHTML = m.de === 'ela' ? '<b></b><span class="selo" title="Inscrita nº 1">1</span>' : '<b></b> '
    d.querySelector('b').textContent = nomeM; if (m.de === 'amigo') d.querySelector('b').style.color = corM; d.append(m.txt)
  }
  const box = $('#msgs'), embaixo = box.scrollHeight - box.scrollTop - box.clientHeight < 60
  box.append(d); if (embaixo || m.meu) box.scrollTop = box.scrollHeight
  if (!m.sis && !m.hist) palco.chat({ de: m.de || 'ela', key: m.key, nome: m.nome, txt: m.txt, pix: m.pix }) // aparece na live se ele ligou o chat na tela
  // chat escondido: conta as mensagens novas dele no botão
  if (document.body.classList.contains('sem-chat') && !m.hist && m.de === 'ele') { novas++; $('#bChatNovo').hidden = false; $('#bChatNovo').textContent = novas }
}
$('#compor').onsubmit = e => {
  e.preventDefault()
  const txt = $('#msg').value.trim().slice(0, 300); if (!txt) return
  const m = { id: crypto.randomUUID(), de: eu.ela ? 'ela' : 'amigo', key: eu.key, nome: eu.nome, txt, meu: true }
  poeMsg(m); live?.acoes.chat.send(m); $('#msg').value = ''
}

/* ---------- pix ---------- */
let valorPix = LIVE.valoresPix.includes(20) ? 20 : LIVE.valoresPix[0]
$('#valores').innerHTML = LIVE.valoresPix.map(v => `<button type="button" data-v="${v}">R$ ${v}</button>`).join('')
// dinheiro dela: infinito, ou o saldo ganho assistindo (o estúdio confere de novo antes de aceitar)
const carteira = () => {
  const c = est.carteira || { modo: 'infinito' }
  return eu.ela ? c : { ...c, saldo: est.carteiras?.[eu.key]?.saldo ?? 0, falta: est.carteiras?.[eu.key]?.falta ?? 60 }
}
const podeGastar = v => carteira().modo !== 'tempo' || v <= (carteira().saldo || 0) + 1e-9
const marca = () => {
  document.querySelectorAll('#valores button').forEach(b => { b.setAttribute('aria-pressed', +b.dataset.v === valorPix); b.disabled = !podeGastar(+b.dataset.v) })
  const ok = podeGastar(valorPix)
  $('#enviaPix').textContent = ok ? `Mandar R$ ${valorPix}` : 'Saldo insuficiente'
  $('#enviaPix').disabled = !ok
}
function infoPix() {
  const c = carteira(), m = est.meta, partes = []
  if (c.modo === 'tempo') partes.push(`<span>Seu saldo: ${reais(c.saldo || 0)} · ganha ${reais(c.porMinuto || 0)} por minuto assistindo</span>`)
  if (m?.on) { const p = Math.min(100, (m.atual || 0) / m.alvo * 100), falta = Math.max(0, m.alvo - (m.atual || 0))
    partes.push(`<span>Meta: ${m.titulo.replace(/[<>&]/g, '')} · ${falta ? `faltam ${reais(falta)}` : 'batida!'}</span><div class="barra"><i style="width:${p}%"></i></div>`) }
  $('#infoPix').innerHTML = partes.join(''); $('#infoPix').hidden = !partes.length
}
// voz que lê o pix: toque para ouvir uma amostra
let vozPix = (() => { try { return localStorage.getItem('live.voz') || 'normal' } catch { return 'normal' } })()
const marcaVoz = () => document.querySelectorAll('#vozes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.voz === vozPix))
// personagens (voz de verdade, ElevenLabs) primeiro; as do navegador ficam como reserva
vozesIA.then(ia => {
  const pers = Object.entries(ia).filter(([k, v]) => v?.id && k !== 'locutor').map(([k, v]) => `<button type="button" class="ia" data-voz="ia:${k}">${v.nome}</button>`)
  const nav = Object.entries(VOZES).map(([k, v]) => `<button type="button" data-voz="${k}">${v.nome}</button>`)
  $('#vozes').innerHTML = pers.join('') + (pers.length ? '<span class="sep-vozes">vozes simples</span>' : '') + nav.join('')
  if (!vozValida(vozPix)) vozPix = pers.length ? `ia:${Object.keys(ia).find(k => k !== 'locutor' && ia[k]?.id)}` : 'normal'
  marcaVoz()
})
$('#vozes').onclick = e => {
  const b = e.target.closest('[data-voz]'); if (!b) return
  vozPix = b.dataset.voz; try { localStorage.setItem('live.voz', vozPix) } catch {}; marcaVoz()
  // amostra: personagem toca a voz de verdade; as simples, a do navegador
  speechSynthesis.cancel()
  if (vozPix.startsWith('ia:')) fetch('../api/voz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: 'Oi! É assim que eu vou ler o seu pix.', voz: vozPix.slice(3) }) })
    .then(r => r.ok ? r.blob() : null).then(async bl => bl && tocaIA(bl, (await vozesIA)[vozPix.slice(3)]?.vel)).catch(() => {})
  else fala(`${LIVE.ela} mandou dez reais`, vozPix)
}
// saldo ao lado do botão de pix, com o "+R$" quando ganha
let saldoAntes = null
function pintaSaldo() {
  const c = carteira(), el = $('#saldo')
  el.hidden = c.modo !== 'tempo'
  if (c.modo !== 'tempo') return
  $('#saldoV').textContent = reais(c.saldo || 0)
  if (saldoAntes != null && c.saldo > saldoAntes + 1e-9) { const g = $('#saldoGanho'); g.textContent = '+' + reais(c.saldo - saldoAntes).replace(',00', ''); g.classList.remove('sobe'); void g.offsetWidth; g.classList.add('sobe') }
  saldoAntes = c.saldo
}
setInterval(() => {
  const c = carteira(); if (c.modo !== 'tempo' || !est.inicio) { $('#saldoProx').textContent = ''; return }
  c.falta = Math.max(0, (c.falta ?? 60) - 1)
  $('#saldoProx').textContent = `+${reais(c.porMinuto || 0).replace(',00', '')} em ${c.falta}s`
}, 1000)
document.querySelectorAll('#valores button').forEach(b => b.onclick = () => { valorPix = +b.dataset.v; marca() })
marca()
const conta = () => $('#contaPix').textContent = $('#msgPix').value.length
$('#msgPix').oninput = conta
const fecha = () => $('#janela').classList.remove('aberta')
$('#btnPix').onclick = () => { infoPix(); marca(); $('#janela').classList.add('aberta'); conta(); setTimeout(() => $('#msgPix').focus(), 50) }
$('#cancelaPix').onclick = fecha
$('#janela').onclick = e => { if (e.target.id === 'janela') fecha() }
addEventListener('keydown', e => { if (e.key === 'Escape') fecha() })
$('#enviaPix').onclick = () => {
  if (!estudioOn) { fecha(); poeMsg({ sis: true, txt: 'O pix vai quando a live estiver no ar.' }); return }
  if (!podeGastar(valorPix)) return
  live.acoes.pix.send({ id: crypto.randomUUID(), valor: valorPix, msg: $('#msgPix').value.trim().slice(0, 140), voz: vozPix })
  $('#msgPix').value = ''; fecha()
}

/* ---------- na linha (microfone dela) ---------- */
let mic = null, paraMedir = null
async function linha(on) {
  if (on) {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).catch(() => null)
    if (!mic) { poeMsg({ sis: true, txt: 'Não deu para usar o microfone. Libere o microfone no navegador e tente de novo.' }); return }
    ouvintes().forEach(id => live.manda(mic, id, { voz: 1 }))
    paraMedir = medidor(mic, v => palco.setNivel(v, eu.key))
  } else {
    if (mic) { ouvintes().forEach(id => live.tira(mic, id)); mic.getTracks().forEach(t => t.stop()); mic = null }
    paraMedir?.(); paraMedir = null; palco.setNivel(0, eu.key)
  }
  live.acoes.linha.send({ on })
  somLinha(on)
  $('#btnLigar').setAttribute('aria-pressed', on)
  document.querySelectorAll('#btnLigar span, [data-faz=btnLigar] span').forEach(x => x.textContent = on ? 'Sair da linha' : 'Entrar na linha')
}
$('#btnLigar').onclick = () => { if (!estudioOn) { poeMsg({ sis: true, txt: 'Dá para entrar na linha quando a live estiver no ar.' }); return } linha(!mic) }

/* ---------- rede ---------- */
// quem ouve a sua voz na ligação: o estúdio e quem está assistindo
const ouvintes = () => [...live.quem('estudio'), ...live.publico()]
const vozesDe = new Map() // peerId → { audio, para, key }
function vozDeAlguem(stream, id) {
  vozesDe.get(id)?.para?.()
  const key = live.papeis.get(id) === 'ela' ? 'ela' : live.perfis.get(id)?.key
  const audio = new Audio(); audio.autoplay = true; audio.srcObject = stream; audio.play().catch(() => {})
  vozesDe.set(id, { audio, key, para: medidor(stream, v => palco.setNivel(v, key)) })
}
function vozSaiu(id) { const v = vozesDe.get(id); if (!v) return; v.para?.(); v.audio.srcObject = null; palco.setNivel(0, v.key); vozesDe.delete(id) }
async function conecta() {
  live = await entraLive(codigo, eu.ela ? 'ela' : 'amigo', eu.ela ? null : { key: eu.key, nome: eu.nome })
  const atualiza = () => { estudioOn = live.quem('estudio').length > 0; espera() }
  live.on('papel', (id, p) => {
    atualiza()
    if (p === 'estudio' && mic) { live.manda(mic, id, { voz: 1 }); live.acoes.linha.send({ on: true }, id) }
    if ((p === 'ela' || p === 'amigo') && mic) live.manda(mic, id, { voz: 1 })
  })
  live.on('saiu', (id, p) => {
    vozSaiu(id)
    if (p === 'estudio') { atualiza(); palco.setJogo(null); palco.setCam(null); somEstudio.srcObject = null }
    if (p === 'cam') palco.setCam(null)
  })
  live.on('stream', (stream, id, meta) => {
    if (meta.live) { palco.setJogo(stream); volume() }
    if (meta.som) { somEstudio.srcObject = stream; somEstudio.play().catch(() => {}); volume() }
    if (meta.cam) palco.setCam(stream)
    if (meta.voz && ['ela', 'amigo'].includes(live.papeis.get(id))) vozDeAlguem(stream, id)
  })
  live.acoes.estado.on((e, id) => { if (live.papeis.get(id) === 'estudio' || !live.papeis.size) aplica(e) })
  live.acoes.chat.on(m => {
    if (Array.isArray(m?.hist)) { m.hist.forEach(x => poeMsg({ ...x, hist: true })); return }
    if (typeof m?.txt !== 'string') return
    if (m.de === 'sis') poeMsg({ id: m.id, sis: true, ped: /^Pedido/.test(m.txt), txt: m.txt.slice(0, 200) })
    else poeMsg({ id: m.id, de: ['ele', 'amigo'].includes(m.de) ? m.de : 'ela', key: m.key, nome: m.nome, txt: m.txt.slice(0, 300) })
  })
  live.acoes.mix.on((m, id) => { if (live.papeis.get(id) === 'estudio') { abaixa = !!m?.abaixa; volume() } })
  live.acoes.pixtoca.on(p => {
    if (!(p?.valor > 0)) return
    poeMsg({ id: 'pix' + p.id, pix: p.valor, txt: String(p.msg || '').slice(0, 140), de: p.de, key: p.key, nome: p.nome })
    palco.pix(p); somPix(); setTimeout(() => falaPix(p.nome || LIVE.ela, p.valor, p.msg, p.voz, p.abre | 0), 1100)
  })
}

/* ---------- pedir música ---------- */
let achados = []
const fechaPedido = () => $('#janelaPedido').classList.remove('aberta')
$('#btnPedir').onclick = () => {
  if (!estudioOn) { poeMsg({ sis: true, txt: 'Dá para pedir música quando a live estiver no ar.' }); return }
  $('#janelaPedido').classList.add('aberta'); setTimeout(() => $('#buscaPedido').focus(), 50)
}
$('#fechaPedido').onclick = fechaPedido
$('#janelaPedido').onclick = e => { if (e.target.id === 'janelaPedido') fechaPedido() }
addEventListener('keydown', e => { if (e.key === 'Escape') fechaPedido() })
$('#formPedido').onsubmit = async e => {
  e.preventDefault()
  const q = $('#buscaPedido').value.trim(); if (!q) return
  $('#achados').innerHTML = '<p>Procurando…</p>'
  achados = await buscaMusica(q)
  const box = $('#achados'); box.innerHTML = ''
  if (!achados.length) { box.innerHTML = '<p>Não achei. Tenta com o nome do artista junto.</p>'; return }
  achados.forEach((x, j) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.j = j
    b.innerHTML = '<img alt="" loading="lazy"><div><b></b><span></span></div><small></small>'
    b.querySelector('img').src = x.c; b.querySelector('b').textContent = x.t; b.querySelector('span').textContent = x.a; b.querySelector('small').textContent = minutos(x.d)
    box.append(b)
  })
}
$('#achados').onclick = e => {
  const b = e.target.closest('[data-j]'); if (!b || !live) return
  const x = achados[+b.dataset.j]
  live.acoes.pedido.send({ id: x.id, t: x.t, a: x.a, c: x.c, d: x.d })
  fechaPedido(); $('#buscaPedido').value = ''; $('#achados').innerHTML = ''
}

$('#btnEntrar').onclick = async () => {
  await prontoEu
  if (amigo && !eu.logado) {
    const nome = $('#nomeEntrada').value.trim().replace(/[<>]/g, '').slice(0, 24)
    if (!nome) { $('#nomeEntrada').focus(); return }
    eu = { key: 'g:' + nome.toLowerCase(), nome, logado: false }
    try { localStorage.setItem('live.nome', nome) } catch {}
  }
  retomaAudio(); palco.tocar(); somEstudio.play().catch(() => {})
  $('#entrada').classList.add('some')
  conecta().catch(e => { console.error(e); poeMsg({ sis: true, txt: 'Não consegui conectar na live. Recarregue a página.' }) })
}
palco.estado(est); espera()
