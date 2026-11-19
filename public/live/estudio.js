/* Estúdio: captura o jogo, recebe a câmera do celular, junta tudo num vídeo só e transmite para ela.
   Manda o estado (cena, ligação, rádio, pix) e mostra o retorno igualzinho ao que ela vê. */
import LIVE from './config.js'
import { criaPalco, reais, relogio } from './palco.js'
import { entraLive, codigoDaUrl, novoCodigo } from './rede.js'
import { criaCompositor, QUALIDADES } from './compositor.js'
import { criaPlayer, criaRadioEstudio, buscaMusica, minutos } from './radio.js'
import { somPix, somLinha, falaPix, medidor, retomaAudio, ABERTURAS, vozValida } from './sons.js'
import { ic, poeIcones } from './icones.js'
import { corDe } from './pessoas.js'
import { ligaSomReal, somRealLigado, potenciaReal } from './somreal.js'

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)]
const LS = 'live.estudio'
let pref = {}
try { pref = JSON.parse(localStorage.getItem(LS)) || {} } catch {}
const salva = () => { try { localStorage.setItem(LS, JSON.stringify(pref)) } catch {} }
const toast = (t, ms = 3000) => { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), ms) }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const capaOk = c => typeof c === 'string' && /^https:\/\/(i\.ytimg\.com|i\.scdn\.co|mosaic\.scdn\.co|image-cdn-[\w-]+\.spotifycdn\.com)\//.test(c) ? c : ''

/* ---------- uma aba só: duas abas do estúdio brigam pela mesma live ---------- */
const canalAbas = new BroadcastChannel('live-estudio')
let outraAba = false
canalAbas.onmessage = e => { if (e.data === 'oi') canalAbas.postMessage('ja-aberto'); if (e.data === 'ja-aberto') outraAba = true }
canalAbas.postMessage('oi')
await new Promise(r => setTimeout(r, 250))
if (outraAba) {
  document.body.innerHTML = '<div style="height:100%;display:grid;place-items:center;text-align:center;font:600 22px var(--ui);color:#fff;padding:24px"><div><b style="font:400 44px var(--gta);display:block;margin-bottom:12px">o estúdio já está aberto</b>Use a outra aba do estúdio. Duas abas ao mesmo tempo deixam tudo travando e brigam pela live.</div></div>'
  throw new Error('estúdio já aberto em outra aba')
}
$('#chipEla span').textContent = LIVE.ela
poeIcones()

/* ---------- código e links ---------- */
const codigo = codigoDaUrl() || pref.codigo || novoCodigo()
pref.codigo = codigo; salva()
if (codigoDaUrl() !== codigo) history.replaceState(null, '', `?c=${codigo}`)
const base = location.origin + location.pathname.replace(/[^/]*$/, '')
// os links de quem assiste são sempre os do Cineminha publicado (o estúdio pode estar aberto no localhost)
const SITE = 'https://cineminha-boo.vercel.app/live/'
const local = /^(localhost|127\.|192\.168\.|10\.|\[::1\])/.test(location.hostname)
const baseLink = local ? SITE : base
// o link dela leva uma chave: sem ela, quem tirar o "&amigos" do link dos amigos não vira a amor
if (!pref.chaveEla) { pref.chaveEla = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 12); salva() }
$('#linkEla').textContent = `${baseLink}?c=${codigo}&k=${pref.chaveEla}`
$('#linkAmigos').textContent = local || location.hostname === 'cineminha-boo.vercel.app' ? `https://cineminha-boo.vercel.app/l/${codigo}` : `${baseLink}?c=${codigo}&amigos` // link curto
// no PC de casa (localhost) o celular precisa do https da rede: node scripts/live-local.mjs
$('#linkCam').textContent = /^(localhost|127\.)/.test(location.hostname) ? `https://<ip-do-pc>:8791${location.pathname.replace(/[^/]*$/, '')}cam.html?c=${codigo}` : `${base}cam.html?c=${codigo}`
$('#codigo').textContent = 'código ' + codigo
$$('[data-copia]').forEach(b => b.onclick = () => navigator.clipboard.writeText($('#' + b.dataset.copia).textContent).then(() => toast('Link copiado')))

/* ---------- abas ---------- */
function aba(nome) {
  $$('.abas button').forEach(b => b.setAttribute('aria-selected', b.dataset.aba === nome))
  $$('.aba').forEach(a => a.hidden = a.dataset.aba !== nome)
  const bd = { chat: '#bChat', radio: '#bRadio' }[nome]; if (bd) { $(bd).hidden = true; $(bd).textContent = '' }
}
$$('.abas button').forEach(b => b.onclick = () => aba(b.dataset.aba))
const avisaAba = (nome, sel) => { if ($(`.aba[data-aba=${nome}]`).hidden) { const b = $(sel); b.hidden = false; b.textContent = (+b.textContent || 0) + 1 } }

/* ---------- estado da live ---------- */
const dataLocal = s => { const t = new Date(s).getTime(); return Number.isFinite(t) ? t : 0 }
const mix = { radio: (pref.radioVol ?? 60) / 100, radioMudo: false, radioJogo: !!pref.radioJogo, abaixa: false }
const est = {
  cena: 'comecando', inicio: 0, ate: 0, fimEm: 0, titulo: pref.titulo || LIVE.titulo,
  linha: false, cam: false, radio: null, radioJogo: mix.radioJogo, mostrarMusica: pref.mostrarMusica !== false, stats: { pix: 0, msgs: 0 }, mix: {},
  lancamento: dataLocal(pref.lancamento || LIVE.lancamento), lancamentoTexto: pref.lancamentoTexto || LIVE.lancamentoTexto,
  camPos: { canto: 'br', tamanho: 'm', oculta: false, ...(pref.camPos || {}) }, avatarPos: pref.avatarPos?.estilo ? { lugar: 'tl', oculto: false, ...pref.avatarPos } : { lugar: 'tl', estilo: 'lista', oculto: !!pref.avatarPos?.oculto }, chatNaTela: !!pref.chatNaTela, lancNaTela: !!pref.lancNaTela, enquete: null,
  meta: { on: !!pref.metaOn, titulo: pref.metaTitulo || LIVE.meta.titulo, alvo: pref.metaAlvo || LIVE.meta.alvo, atual: pref.metaAtual || 0 },
  carteira: null,
}
const palco = criaPalco($('#palco'), { composto: true, leve: pref.previaLeve !== false })
const player = criaPlayer({ volume: 0, aoAcabar: () => radio.proxima(), aoDuracao: (id, d) => radio.duracao(id, d) })
let live = null
const radioToca = () => !!est.radio && (est.cena !== 'jogo' || mix.radioJogo)
// rádio: o YouTube dela toca em 75 × mix.radio × o volume dela (assistir.js); aqui sai o nível certo.
// O controle (0..100) é um fader: o ganho cresce ao quadrado. 100 ≈ −7,5 dB (quase a altura da voz),
// 60 ≈ −16 dB (fundo, uns 10 dB abaixo da voz). No jogo, −4,4 dB; enquanto você fala, −9 dB (como na página dela).
const RADIO_MAX = .42, NO_JOGO = .6, ABAIXA = .35
const radioGanho = () => mix.radioMudo ? 0 : RADIO_MAX * mix.radio ** 2 * (est.cena === 'jogo' ? NO_JOGO : 1)
// volume do YouTube dela (0..100), com o controle de volume dela no máximo
const ytDela = (comAbaixa = true) => 100 * radioGanho() * (comAbaixa && mix.abaixa ? ABAIXA : 1)
function manda(alvo) { live?.acoes.estado.send({ ...est, relogio: Date.now() }, alvo) }
function muda(ch) {
  Object.assign(est, ch)
  est.mix = { radio: radioGanho() / .75 }
  palco.estado(est, Date.now())
  player.segue(est.radio, radioToca())
  monitor()
  manda()
  pinta()
}
// a rádio aqui: no retorno ("Ouvir"), no mesmo nível que chega nela; fora dele, relativo ao dela (100% = igual)
let ouvindo = false, ytAqui = 0, testando = false
function monitor() {
  if (testando) return // o teste de som segura o volume
  ytAqui = Math.min(100, ytDela() * (ouvindo ? (pref.retVol ?? 100) / 100 : (pref.rMon2 ?? 100) / 100))
  player.volume(ytAqui)
}
setInterval(() => manda(), 5000)

/* ---------- cenas ---------- */
const CENAS = ['comecando', 'jogo', 'volto', 'fim', 'camera', 'lancamento']
const contagemMin = () => Math.max(0, Math.min(600, +(pref.contagem ?? LIVE.contagem) || 0))
function cena(c) {
  const ch = { cena: c }
  if (c === 'comecando' && !(est.ate > Date.now())) ch.ate = Date.now() + contagemMin() * 60e3
  if (c === 'fim') ch.fimEm = Date.now()
  if (c !== 'fim' && est.cena === 'fim') ch.fimEm = 0
  comp.modo(c === 'camera' ? 'cam' : 'jogo')
  est.cena = c; volumes()
  muda(ch)
}
$$('#cenas button').forEach(b => b.onclick = () => cena(b.dataset.cena))
addEventListener('keydown', e => {
  if (e.target.matches('input,select,textarea') || e.ctrlKey || e.metaKey || e.altKey) return
  if (/^[1-6]$/.test(e.key)) cena(CENAS[+e.key - 1])
  if (e.key.toLowerCase() === 'm') $('[data-canal=mic] [data-mudo]').click()
  if (e.key === ' ' && !e.target.matches('button')) { e.preventDefault(); radio.tocando ? radio.pausa() : radio.play() }
})
function pinta() {
  $$('#cenas button').forEach(b => b.setAttribute('aria-pressed', b.dataset.cena === est.cena))
  const vivo = !!est.inicio
  $('#chipVivo').classList.toggle('vivo', vivo); $('#chipVivo span').textContent = vivo ? 'ao vivo' : 'fora do ar'
  $('#btnVivo').textContent = vivo ? 'Encerrar a live' : 'Começar a live'
  $('#btnVivo').className = 'btn ' + (vivo ? 'perigo' : 'forte')
  $('#totalPix').textContent = reais(est.stats.pix) + ' em pix'
  $('#rTela').setAttribute('aria-pressed', est.mostrarMusica)
  $('#rJogo').setAttribute('aria-pressed', mix.radioJogo)
  const r = est.radio
  $('#rPlay').innerHTML = ic(r && !r.pausado ? 'pause' : 'play')
  $('#rTitulo').textContent = r?.t || 'Rádio parada'
  $('#rArtista').innerHTML = r ? (r.pedido ? `<span class="pedido">pedido de ${esc(r.pedido)}</span> · ` : '') + esc(r.a) : 'Aperte ▶ para tocar'
  const capa = r?.c || 'assets/vi.webp'; if ($('#rCapa').getAttribute('src') !== capa) $('#rCapa').src = capa
}
setInterval(() => {
  $('#tempo').textContent = est.inicio ? relogio(((est.fimEm || Date.now()) - est.inicio) / 1000) : ''
  const r = est.radio, p = r ? (r.pausado ? r.pos : (Date.now() - r.inicio) / 1000) : 0
  $('#rPos').textContent = minutos(p); $('#rDur').textContent = minutos(r?.d)
  $('#rBarra').style.width = r?.d ? Math.min(100, p / r.d * 100) + '%' : '0'
  const falta = est.ate - Date.now()
  $('#cInfo').textContent = est.ate && falta > 0 ? `faltam ${minutos(falta / 1000)}` : ''
}, 500)
$('#btnVivo').onclick = () => {
  retomaAudio(); comp.retomar()
  if (!est.inicio) { muda({ inicio: Date.now(), fimEm: 0, stats: { pix: 0, msgs: 0 } }); cena('comecando'); if (!radio.tocando) radio.play(); toast('Você está ao vivo pra ela') }
  else if (confirmaFim()) { cena('fim'); setTimeout(() => muda({ inicio: 0 }), 60e3) }
}
let pedeFim = 0
function confirmaFim() { if (Date.now() - pedeFim < 3000) return true; pedeFim = Date.now(); toast('Clique de novo para encerrar'); return false }
// prévia completa (com todos os enfeites) ou leve (mais rápida); escondida, ela pausa sozinha
const btnPrevia = $('#btnPrevia')
const pintaPrevia = () => { const leve = pref.previaLeve !== false; btnPrevia.textContent = leve ? 'Prévia leve' : 'Prévia completa'; btnPrevia.title = leve ? 'Sem os enfeites de fundo (mais rápido). Clique para ver completa.' : 'Igual ao que ela vê. Clique para deixar leve.' }
btnPrevia.onclick = () => { pref.previaLeve = pref.previaLeve === false; salva(); palco.leve(pref.previaLeve !== false); pintaPrevia() }
pintaPrevia()
// vídeo do retorno: desligado, a prévia não é desenhada (alivia o PC); a transmissão não muda
const retVideo = () => pref.retornoVideo !== false
function aplicaRetVideo() {
  $('#palco').classList.toggle('desligado', !retVideo())
  $('#btnRetVideo').setAttribute('aria-pressed', retVideo())
  palco.pausaPrevia?.(document.hidden || !retVideo())
}
$('#btnRetVideo').onclick = () => { pref.retornoVideo = !retVideo(); salva(); aplicaRetVideo() }
document.addEventListener('visibilitychange', () => palco.pausaPrevia?.(document.hidden || !retVideo()))
aplicaRetVideo()
$('#titulo').value = est.titulo
$('#titulo').oninput = e => { pref.titulo = e.target.value; salva(); muda({ titulo: e.target.value }) }

/* ---------- ajustes: contagem e lançamento ---------- */
$('#cMin').value = contagemMin()
$('#cMin').oninput = e => { pref.contagem = Math.max(0, Math.min(600, +e.target.value.replace(',', '.') || 0)); salva() }
$('#cAplica').onclick = () => {
  const hora = $('#cHora').value
  let ate = Date.now() + contagemMin() * 60e3
  if (hora) { const [h, m] = hora.split(':').map(Number), d = new Date(); d.setHours(h, m, 0, 0); if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); ate = d.getTime() }
  muda({ ate })
  toast(hora ? `Contagem até ${hora}` : `Contagem de ${contagemMin()} min`)
}
const paraInput = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
if (est.lancamento) $('#lData').value = paraInput(est.lancamento)
$('#lData').onchange = e => { pref.lancamento = e.target.value; salva(); muda({ lancamento: dataLocal(e.target.value) }) }
$('#lTexto').value = est.lancamentoTexto
$('#lTexto').oninput = e => { pref.lancamentoTexto = e.target.value; salva(); muda({ lancamentoTexto: e.target.value || LIVE.lancamentoTexto }) }

/* ---------- compositor e fontes ---------- */
// (o retorno de som fica logo depois do compositor)
const qualidade = QUALIDADES[pref.qualidade] ? +pref.qualidade : 720
const comp = criaCompositor({ fps: 30, qualidade })
palco.setJogo(new MediaStream(comp.saida.getVideoTracks()))
$('#qualidade').value = String(qualidade)
// no modo leve a qualidade é da própria captura (sem canvas no meio)
const tamanhoCaptura = (q, fps = 30) => { const [w, h] = QUALIDADES[q] || QUALIDADES[720]; capJogo?.getVideoTracks()[0]?.applyConstraints({ width: { max: w }, height: { max: h }, frameRate: { max: fps } }).catch(() => {}) }
$('#qualidade').onchange = e => { pref.qualidade = +e.target.value; salva(); comp.qualidade(+e.target.value); tamanhoCaptura(+e.target.value); ajustaEnvio(); toast(`Transmissão em ${e.target.value}p`) }
// retorno de som: ouvir no fone exatamente o que ela ouve — voz + jogo (depois do mixer e do atraso) e a rádio no nível dela.
// Com o retorno em 100% é igual a ela com o volume no máximo; o volume do fone você ajusta no PC.
const retorno = new Audio(); retorno.autoplay = true
const retVol = $('#retVol'); retVol.value = pref.retVol ?? 100
const pintaRet = () => { retVol.title = `Volume do retorno: ${retVol.value}%${+retVol.value === 100 ? ' (igual ao dela com o volume no máximo)' : ''}` }
retVol.oninput = () => { pref.retVol = +retVol.value; salva(); retorno.volume = retVol.value / 100; monitor(); pintaRet() }
pintaRet()
function ouvir(on) {
  ouvindo = on
  $('#btnOuvir').setAttribute('aria-pressed', on); retVol.hidden = !on; $('#btnSoRet').hidden = !on
  if (on) {
    retorno.srcObject = new MediaStream(comp.saida.getAudioTracks()); retorno.volume = retVol.value / 100; retorno.play().catch(() => {})
    toast('Agora você ouve igual a ela: sua voz, o jogo e a rádio no mesmo equilíbrio que chega lá. Use fone (no alto-falante vira eco).', 5500)
  } else { retorno.pause(); retorno.srcObject = null }
  jogoSoNoRetorno(on && pref.soRetorno !== false)
  monitor()
}
$('#btnOuvir').onclick = () => ouvir(!ouvindo)
// jogo só no fone: o ajudante tira o som isolado do jogo do alto-falante (senão você ouve o jogo duas vezes).
// O estúdio confirma a cada 5 s; se a aba fechar ou travar, o ajudante devolve o som sozinho em até 15 s.
let soRet = false, soRetT = 0
async function jogoSoNoRetorno(on) {
  on = on && ajudaOn && !!isolado
  clearInterval(soRetT)
  if (on === soRet && !on) { $('#btnSoRet').setAttribute('aria-pressed', false); return }
  soRet = on
  $('#btnSoRet').setAttribute('aria-pressed', on)
  await ajuda('/som/direto', { on: !on }).catch(() => null)
  if (on) {
    soRetT = setInterval(() => ajuda('/som/direto', { on: false }).catch(() => {}), 5000)
    const atr = +($('#atraso')?.value || 0)
    toast(`O jogo agora só toca no retorno${atr ? ` (com ${atr} ms de atraso, o mesmo que vai pra ela)` : ''}. Desligue "Jogo só no fone" para ouvir direto.`, 5500)
  }
}
$('#btnSoRet').onclick = () => {
  if (!soRet && !(ajudaOn && isolado)) { toast('Primeiro isole o som do jogo em Fontes (Programa do jogo → Isolar), com o ajudante aberto'); return }
  pref.soRetorno = !soRet; salva(); jogoSoNoRetorno(!soRet)
}
addEventListener('pagehide', () => { if (soRet) fetch('http://localhost:8792/som/direto', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: '{"on":true}', targetAddressSpace: 'loopback' }).catch(() => {}) })
let capJogo = null, somJogo = null, mic = null
// captura o jogo, uma janela ou uma aba do Chrome. Aba (YouTube pra react, por exemplo): com "Compartilhar áudio da guia"
// marcado, o som dela entra no mixer no lugar do som do jogo enquanto ela estiver na live; ao parar, volta o de antes.
let somDaAba = null
function somDaCaptura(at) {
  somDaAba?.stop(); somDaAba = at || null
  comp.somJogo(somDaAba || somJogo?.getAudioTracks()[0] || null)
  $('#selSom').disabled = !!somDaAba
  $('#selSom').title = somDaAba ? 'O som agora vem da aba que está sendo transmitida' : ''
}
$('#btnJogo').onclick = async () => {
  const [w, h] = QUALIDADES[pref.qualidade] || QUALIDADES[720]
  const s = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 30, max: 30 }, width: { max: w }, height: { max: h } },
    // som só de aba (o Chrome não pega som de janela no Linux; jogo usa a entrada "Som do jogo")
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    systemAudio: 'exclude', suppressLocalAudioPlayback: false,
    selfBrowserSurface: 'exclude', surfaceSwitching: 'include',
  }).catch(() => null)
  if (!s) return
  capJogo?.getTracks().forEach(t => t.stop())
  capJogo = s
  const vt = s.getVideoTracks()[0]; vt.contentHint = 'motion'
  const aba = vt.getSettings().displaySurface === 'browser', at = s.getAudioTracks()[0]
  if (!modoTela()) comp.jogo(vt)
  somDaCaptura(at)
  $('#infoJogo').textContent = (vt.label || 'capturando') + (at ? ' · com som' : '')
  $('#btnJogo').textContent = 'Trocar o que aparece'
  if (aba && !at) toast('Essa aba entrou sem som. Para levar o som, capture de novo e marque "Compartilhar áudio da guia".', 6000)
  else if (at) toast('Som da aba entrando na live no lugar do som do jogo', 3500)
  vt.addEventListener('ended', () => {
    if (capJogo !== s) return
    comp.jogo(null); capJogo = null; somDaCaptura(null)
    $('#infoJogo').textContent = 'sem captura'; $('#btnJogo').textContent = 'Capturar jogo, janela ou aba'
    if (modoTela()) reenvia()
  })
  if (modoTela()) reenvia()
}
async function entradas() {
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput')
  const op = (sel, atual, vazio) => { sel.innerHTML = `<option value="">${vazio}</option>` + devs.map(d => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Entrada de som')}</option>`).join(''); sel.value = devs.some(d => d.deviceId === atual) ? atual : '' }
  const prog = devs.find(d => /Cineminha-Programa/i.test(d.label))
  op($('#selSom'), prog?.deviceId || pref.som, 'Sem som do jogo')
  op($('#selMic'), pref.mic || devs.find(d => d.deviceId === 'default')?.deviceId, 'Sem microfone')
  $('#dicaSom').hidden = !!prog || ajudaOn
  return { prog }
}
const pegaEntrada = (id, voz) => navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: id }, echoCancellation: voz, noiseSuppression: voz, autoGainControl: false, channelCount: voz ? 1 : 2, sampleRate: 48000 } })
async function usaSom(id) {
  somJogo?.getTracks().forEach(t => t.stop()); somJogo = null
  if (id) somJogo = await pegaEntrada(id, false).catch(() => { toast('Não consegui abrir essa entrada de som'); return null })
  if (!somDaAba) comp.somJogo(somJogo?.getAudioTracks()[0] || null)
}
async function usaMic(id) {
  mic?.getTracks().forEach(t => t.stop()); mic = null
  if (id) mic = await pegaEntrada(id, true).catch(() => { toast('Não consegui abrir o microfone'); return null })
  comp.mic(mic?.getAudioTracks()[0] || null)
}
$('#selSom').onchange = e => { pref.som = e.target.value; salva(); usaSom(e.target.value) }
$('#selMic').onchange = e => { pref.mic = e.target.value; salva(); usaMic(e.target.value) }
const atraso = $('#atraso')
atraso.value = pref.atraso ?? 0
const aplicaAtraso = () => { $('#atrasoTxt').textContent = atraso.value + ' ms'; comp.atraso(+atraso.value); if (est.envio) muda({ envio: { ...est.envio, atraso: +atraso.value } }) }
atraso.oninput = () => { pref.atraso = +atraso.value; salva(); aplicaAtraso() }; aplicaAtraso()
$('#btnCam').onclick = e => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); comp.camLigada(on); muda({ cam: on && !!camTrilha }) }

navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {}).finally(async () => {
  const { prog } = await entradas()
  await usaMic($('#selMic').value)
  if (prog) await usaSom(prog.deviceId)
  else if ($('#selSom').value) await usaSom($('#selSom').value)
})
/* ---------- som de um programa só (pelo ajudante live-local.mjs) ---------- */
// lista os programas tocando som; "Isolar" leva o som dele para a entrada "Cineminha-Programa", que é escolhida sozinha
const AJUDA = 'http://localhost:8792'
let ajudaOn = false, isolado = null
const ajuda = (rota, corpo) => fetch(AJUDA + rota, { method: corpo ? 'POST' : 'GET', cache: 'no-store', targetAddressSpace: 'loopback', headers: corpo ? { 'content-type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined }).then(r => r.json())
async function listaProgramas() {
  const r = await ajuda('/som').catch(() => null)
  ajudaOn = !!r?.pactl
  const sel = $('#selProg'), antes = sel.value
  if (!ajudaOn) {
    sel.innerHTML = '<option value="">Ajudante desligado</option>'; sel.disabled = true; $('#btnProg').disabled = true
    $('#progStatus').textContent = ''; $('#dicaSom').hidden = false
    return
  }
  isolado = r.isolado
  const lista = r.programas.slice()
  if (isolado && !lista.some(p => p.id === isolado.id)) lista.unshift(isolado)
  sel.innerHTML = lista.length ? lista.map(p => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('') : '<option value="">Nenhum programa tocando som</option>'
  sel.disabled = !lista.length
  const prefere = isolado?.id || antes || pref.programa || lista.find(p => /greenlight|xbox/i.test(p.id + p.nome))?.id
  if (lista.some(p => p.id === prefere)) sel.value = prefere
  const ehIsolado = isolado && sel.value === isolado.id
  $('#btnProg').disabled = !lista.length
  $('#btnProg').textContent = ehIsolado ? 'Soltar' : 'Isolar'
  $('#progStatus').textContent = isolado ? `isolado: ${isolado.nome}` : ''
  $('#dicaSom').hidden = true
}
$('#selProg').onchange = () => { pref.programa = $('#selProg').value; salva(); listaProgramas() }
$('#btnProg').onclick = async () => {
  const id = $('#selProg').value; if (!id) return
  $('#btnProg').disabled = true
  if (isolado?.id === id) {
    await ajuda('/som/soltar', {}).catch(() => null)
    toast('Som do programa devolvido ao normal')
  } else {
    const r = await ajuda('/som/isolar', { id }).catch(() => null)
    if (!r || r.erro) { toast(r?.erro || 'Não consegui isolar o som desse programa'); $('#btnProg').disabled = false; return }
    pref.programa = id; salva()
    toast(`Só o som de ${r.nome} vai para ela`)
    // a entrada nova leva um instante para aparecer: escolhe ela sozinha
    for (let i = 0; i < 8; i++) {
      await new Promise(ok => setTimeout(ok, 400))
      const { prog } = await entradas()
      if (prog) { $('#selSom').value = prog.deviceId; await usaSom(prog.deviceId); break }
    }
  }
  listaProgramas()
}
;(function laco() { listaProgramas().finally(() => setTimeout(laco, ajudaOn ? 5000 : 20000)) })()

navigator.mediaDevices.addEventListener('devicechange', async () => { const antes = $('#selSom').value; const { prog } = await entradas(); if (prog && antes !== prog.deviceId) { $('#selSom').value = prog.deviceId; usaSom(prog.deviceId); toast('Som do jogo conectado') } })

/* ---------- ajustes: câmera do celular ---------- */
const camAj = { rot: 0, espelho: false, zoom: 1, cx: .5, cy: .5, cheia: 'auto', ...(pref.camAjuste || {}) }
function aplicaCam(ch = {}) {
  Object.assign(camAj, ch); pref.camAjuste = camAj; salva(); comp.ajusteCam(camAj)
  if (typeof muda === 'function' && est.camAj !== undefined) muda({ camAj: { ...camAj } })
  $('#camZoom').value = camAj.zoom; $('#camZoomTxt').textContent = (+camAj.zoom).toFixed(1).replace('.', ',') + '×'
  $('#camX').value = camAj.cx; $('#camY').value = camAj.cy; $('#camCheia').value = camAj.cheia
  $('#camEspelho').setAttribute('aria-pressed', camAj.espelho)
  $('#camGirar').textContent = camAj.rot ? `Girar 90° (${camAj.rot}°)` : 'Girar 90°'
}
aplicaCam()
$('#camGirar').onclick = () => aplicaCam({ rot: (camAj.rot + 90) % 360 })
$('#camEspelho').onclick = () => { aplicaCam({ espelho: !camAj.espelho }); pintaAtalhos?.() }
$('#camZoom').oninput = e => aplicaCam({ zoom: +e.target.value })
$('#camX').oninput = e => aplicaCam({ cx: +e.target.value })
$('#camY').oninput = e => aplicaCam({ cy: +e.target.value })
$('#camCheia').onchange = e => aplicaCam({ cheia: e.target.value })
$('#camCentro').onclick = () => aplicaCam({ zoom: 1, cx: .5, cy: .5 })
$('#camVirar').onclick = () => {
  const ids = live?.quem('cam') || []
  if (!ids.length) { toast('O celular não está conectado'); return }
  ids.forEach(id => live.acoes.camcmd.send({ virar: true }, id)); toast('Virando a câmera do celular…', 1500)
}

/* ---------- atalhos rápidos: canto e tamanho da câmera, espelhar, esconder, o que aparece na tela ---------- */
function pintaAtalhos() {
  $$('#camCantos [data-canto]').forEach(b => b.setAttribute('aria-pressed', b.dataset.canto === est.camPos.canto))
  $$('#camTam [data-tam]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tam === est.camPos.tamanho))
  $('#atEspelho').setAttribute('aria-pressed', camAj.espelho)
  $('#atEsconde').setAttribute('aria-pressed', !!est.camPos.oculta)
  $('#atChat').setAttribute('aria-pressed', est.chatNaTela)
  $('#atLanc').setAttribute('aria-pressed', est.lancNaTela)
  $('#atMusica').setAttribute('aria-pressed', est.mostrarMusica)
  $$('#avLugar [data-av]').forEach(b => b.setAttribute('aria-pressed', b.dataset.av === est.avatarPos.lugar))
  $('#avEsconde').setAttribute('aria-pressed', !!est.avatarPos.oculto)
  $$('#avEstilo [data-est]').forEach(b => b.setAttribute('aria-pressed', b.dataset.est === (est.avatarPos.estilo || 'lista')))
}
function moveAvatar(ch) {
  const avatarPos = { ...est.avatarPos, ...ch }
  pref.avatarPos = avatarPos; salva()
  muda({ avatarPos }); pintaAtalhos()
}
$$('#avLugar [data-av]').forEach(b => b.onclick = () => moveAvatar({ lugar: b.dataset.av, oculto: false }))
$('#avEsconde').onclick = () => moveAvatar({ oculto: !est.avatarPos.oculto })
$$('#avEstilo [data-est]').forEach(b => b.onclick = () => moveAvatar({ estilo: b.dataset.est, oculto: false }))
function moveCam(ch) {
  const camPos = { ...est.camPos, ...ch }
  pref.camPos = camPos; salva()
  comp.posicaoCam(camPos); comp.camLigada(!camPos.oculta && $('#btnCam').getAttribute('aria-pressed') === 'true')
  muda({ camPos }); pintaAtalhos()
}
$$('#camCantos [data-canto]').forEach(b => b.onclick = () => moveCam({ canto: b.dataset.canto }))
$$('#camTam [data-tam]').forEach(b => b.onclick = () => moveCam({ tamanho: b.dataset.tam }))
$('#atEspelho').onclick = () => { aplicaCam({ espelho: !camAj.espelho }); pintaAtalhos() }
$('#atEsconde').onclick = () => moveCam({ oculta: !est.camPos.oculta })
$('#atChat').onclick = () => { pref.chatNaTela = !est.chatNaTela; salva(); muda({ chatNaTela: !est.chatNaTela }); pintaAtalhos() }
$('#atLanc').onclick = () => { pref.lancNaTela = !est.lancNaTela; salva(); muda({ lancNaTela: !est.lancNaTela }); pintaAtalhos() }
$('#atMusica').onclick = () => $('#rTela').click()
addEventListener('keydown', e => {
  if (e.target.matches('input,select,textarea') || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key.toLowerCase() === 'e') $('#atEspelho').click()
  if (e.key.toLowerCase() === 'h') $('#atEsconde').click()
})
comp.posicaoCam(est.camPos); comp.camLigada(!est.camPos.oculta)

/* ---------- economia: estúdio mínimo (a live para ela não muda) ---------- */
const eco = () => !!pref.economia
function aplicaEco() {
  $('#btnEco').setAttribute('aria-pressed', eco())
  palco.leve(eco() || pref.previaLeve !== false)
  document.body.classList.toggle('eco', eco())
}
$('#btnEco').onclick = () => { pref.economia = !eco(); salva(); aplicaEco(); toast(eco() ? 'Economia ligada: prévia leve e medidores devagar' : 'Economia desligada', 2500) }
aplicaEco()

/* ---------- mixer ---------- */
const mudos = { mic: false, jogo: false }
function volumes() {
  for (const k of ['mic', 'jogo']) {
    const v = +$(`[data-canal=${k}] [data-vol]`).value / 100
    comp.volume(k, k === 'jogo' && est.cena !== 'jogo' ? 0 : v) // fora do jogo, o som do jogo some
    comp.mudo(k, mudos[k])
  }
}
$$('.faixa-mix').forEach(f => {
  const k = f.dataset.canal, vol = f.querySelector('[data-vol]'), mudo = f.querySelector('[data-mudo]')
  vol.value = pref['vol_' + k] ?? vol.value
  vol.oninput = () => {
    pref['vol_' + k] = +vol.value; salva()
    if (k === 'radio') { mix.radio = vol.value / 100; pref.radioVol = +vol.value; muda({}) } else volumes()
  }
  mudo.onclick = () => {
    const on = mudo.getAttribute('aria-pressed') !== 'true'
    mudo.setAttribute('aria-pressed', on)
    if (k === 'radio') { mix.radioMudo = on; muda({}) } else { mudos[k] = on; volumes() }
    if (k === 'mic') toast(on ? 'Microfone mudo' : 'Microfone ligado', 1500)
  }
})
if (pref.radioVol != null) mix.radio = pref.radioVol / 100
volumes()
const autoN = $('#autoNivela'), autoA = $('#autoAbaixa')
autoN.setAttribute('aria-pressed', pref.nivela !== false); autoA.setAttribute('aria-pressed', pref.abaixa !== false)
const aplicaAuto = () => comp.automatico({ nivela: autoN.getAttribute('aria-pressed') === 'true', abaixa: autoA.getAttribute('aria-pressed') === 'true' })
;[[autoN, 'nivela'], [autoA, 'abaixa']].forEach(([b, k]) => b.onclick = () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); pref[k] = on; salva(); aplicaAuto() })
comp.automatico({ aoAbaixar: on => { mix.abaixa = on; live?.acoes.mix.send({ abaixa: on }); monitor() } })
aplicaAuto()
// medidores: escala de -60 dB a 0 dB; a linha clara marca o pico, que desce devagar
const picos = { mic: 0, jogo: 0 }
let vozP = 0, jogoP = 0 // potência média da sua voz (quando fala) e do jogo, do jeito que chegam nela
// rádio estimada no nível dela: música do YouTube fica perto de −14 dB no volume 100 (ele normaliza o volume);
// depois de um teste de som, usa a correção medida para essa música
let calib = null
function radioDbEstimado() {
  if (!radioToca() || est.radio?.pausado || ytDela() <= 0) return null
  return -14 + 20 * Math.log10(ytDela() / 100) + (calib?.yt === est.radio?.yt ? calib.dif : 0)
}
const pct = v => Math.max(0, Math.min(100, (20 * Math.log10(Math.max(v, 1e-6)) + 60) / 60 * 100))
const med = Object.fromEntries(['mic', 'jogo', 'radio'].map(k => { const f = $(`[data-canal=${k}]`); return [k, { barra: f.querySelector('.medidor i'), pico: f.querySelector('.medidor u'), auto: f.querySelector('[data-auto]') }] }))
;(function medidores() {
  if (!document.hidden) {
    const n = comp.niveis()
    for (const k of ['mic', 'jogo']) {
      const f = med[k], w = pct(n[k].rms * 1.6), pk = pct(n[k].pico)
      picos[k] = Math.max(pk, picos[k] - 3)
      f.barra.style.clipPath = `inset(0 ${100 - w}% 0 0)`
      f.pico.style.transform = `translateX(${picos[k]}%)`
      const g = 20 * Math.log10(n[k].auto || 1)
      const txt = !n[k].tem ? 'sem fonte' : Math.abs(g) < .5 ? '' : `auto ${g > 0 ? '+' : ''}${g.toFixed(0)} dB`
      if (f.auto.textContent !== txt) f.auto.textContent = txt
    }
    // vozes que chegam nela (depois do mixer), para comparar com a rádio no teste de som
    const dbm = 20 * Math.log10(Math.max(n.mic.rms, 1e-6)), dbj = 20 * Math.log10(Math.max(n.jogo.rms, 1e-6))
    if (n.mic.tem && !mudos.mic && dbm > -40) vozP += (n.mic.rms ** 2 - vozP) * .02
    if (n.jogo.tem && est.cena === 'jogo' && dbj > -60) jogoP += (n.jogo.rms ** 2 - jogoP) * .01
    const rdb = radioDbEstimado()
    med.radio.barra.style.clipPath = `inset(0 ${100 - (rdb == null ? 0 : pct(10 ** (rdb / 20) * 1.6))}% 0 0)`
    med.radio.barra.parentNode.classList.toggle('estimado', calib?.yt !== est.radio?.yt)
    const txt = !est.radio ? 'parada' : mix.abaixa ? 'abaixada' : est.cena === 'jogo' ? (mix.radioJogo ? 'no jogo −50%' : 'fora do jogo') : ''
    if (med.radio.auto.textContent !== txt) med.radio.auto.textContent = txt
  }
  setTimeout(medidores, document.hidden ? 1000 : eco() ? 400 : 66) // ~15 por segundo; devagar na economia; parado com a aba escondida
})()

/* ---------- rádio ---------- */
let filaSnap = { itens: [] }
var radio = criaRadioEstudio({
  aoMudar: r => muda({ radio: r }),
  aoFila: s => { filaSnap = s; pintaFila() },
})
function pintaFila() {
  const s = filaSnap
  $('#rLista').textContent = s.nome || 'sem playlist'
  $('#filaInfo').textContent = s.itens.length ? `${s.itens.length} músicas` : ''
  const k = s.itens.findIndex(x => x.uid === s.atual)
  $('#fila').innerHTML = s.itens.length ? s.itens.map((x, j) => `<div class="item${x.uid === s.atual ? ' atual' : ''}${k >= 0 && j < k ? ' passou' : ''}" data-uid="${x.uid}" title="Tocar agora">
    <img src="${esc(x.c || 'assets/vi.webp')}" alt="" loading="lazy"><div><b>${esc(x.t)}</b><span>${x.pedido ? `<i class="tag">pedido de ${esc(x.pedido)}</i>` : ''}${esc(x.a)}</span></div>
    <div class="acoes"><small>${x.d ? minutos(x.d) : ''}</small><button class="btn x" data-tira="${x.uid}" title="Tirar da fila">${ic('x')}</button></div></div>`).join('')
    : '<p class="vazio">A fila está vazia. Cole uma playlist ou busque uma música.</p>'
  const atual = $('#fila .item.atual'); if (atual && !pintaFila.rolou) { atual.scrollIntoView({ block: 'nearest' }); pintaFila.rolou = true }
}
$('#fila').onclick = e => {
  const tira = e.target.closest('[data-tira]'); if (tira) { radio.remove(+tira.dataset.tira); return }
  const it = e.target.closest('.item'); if (it) radio.tocaUid(+it.dataset.uid)
}
$('#rPlay').onclick = () => { retomaAudio(); radio.tocando ? radio.pausa() : radio.play() }
$('#rParar').onclick = () => radio.parar()
$('#rProx').onclick = () => radio.proxima()
$('#rAnt').onclick = () => radio.anterior()
$('#rJogo').onclick = () => { mix.radioJogo = !mix.radioJogo; pref.radioJogo = mix.radioJogo; salva(); muda({ radioJogo: mix.radioJogo }) }
$('#rTela').onclick = () => { pref.mostrarMusica = !est.mostrarMusica; salva(); muda({ mostrarMusica: !est.mostrarMusica }); pintaAtalhos() }
const rMon = $('#rMon'); rMon.value = pref.rMon2 ?? 100
const aplicaMon = () => { const v = +rMon.value; $('#rMonTxt').textContent = v === 100 ? 'igual a ela' : v === 0 ? 'mudo' : v < 100 ? `${v}% do dela` : `${(v / 100).toFixed(1).replace('.', ',')}× o dela`; monitor() }
rMon.oninput = () => { pref.rMon2 = +rMon.value; salva(); aplicaMon() }; aplicaMon()

/* ---------- teste de som: mede a rádio de verdade, no nível que chega nela ----------
   Captura o som desta aba por 5 s com a rádio no volume exato dela (e o retorno calado), e compara com a sua voz
   e o jogo como saem do mixer. Tudo com o volume dela no máximo; o controle dela abaixa tudo por igual. */
const db10 = p => 10 * Math.log10(Math.max(p, 1e-12))
let ultimoTeste = null, pixEm = 0
async function testaSom() {
  const b = $('#btnTesteSom')
  if (!radioToca() || est.radio?.pausado) { toast(est.cena === 'jogo' && !mix.radioJogo ? 'A rádio não toca na cena do jogo. Ligue "Tocar no jogo" ou troque de cena.' : 'Toque a rádio para testar'); return }
  if (mix.radioMudo) { toast('A rádio está muda no mixer'); return }
  if (!somRealLigado()) {
    toast('Escolha "esta aba" e deixe "compartilhar áudio" marcado. Só o som desta aba é medido.', 6000)
    try { await ligaSomReal() } catch (e) { toast(e.message === 'sem-som' ? 'Faltou marcar "compartilhar áudio da guia"' : 'Teste cancelado'); return }
  }
  b.disabled = true; testando = true
  const volRet = retorno.volume; retorno.volume = 0
  const yt = Math.min(100, ytDela(false)); player.volume(yt)
  await new Promise(ok => setTimeout(ok, 900)) // o volume do player sobe em rampa
  let soma = 0, n = 0; const t0 = Date.now(), cancela = () => Date.now() - pixEm < 15000
  while (Date.now() - t0 < 5000 && !cancela()) {
    soma += potenciaReal(); n++
    b.textContent = `Medindo… ${Math.ceil((5000 - (Date.now() - t0)) / 1000)}`
    await new Promise(ok => setTimeout(ok, 45))
  }
  retorno.volume = volRet; testando = false; monitor(); b.disabled = false; b.innerHTML = `${ic('gauge')}Testar o som`
  if (cancela()) { toast('Chegou um pix no meio: teste de novo'); return }
  const radio = db10(soma / n)
  if (radio < -65) { toast('Não chegou som. Escolheu esta aba com "compartilhar áudio" marcado?', 5000); return }
  calib = { yt: est.radio?.yt, dif: radio - (-14 + 20 * Math.log10(yt / 100)) }
  ultimoTeste = { radio, cena: est.cena, voz: vozP ? db10(vozP) : null, jogo: jogoP ? db10(jogoP) : null, em: Date.now() }
  pintaTeste()
}
$('#btnTesteSom').onclick = testaSom
// o alvo: rádio uns 12 dB abaixo da sua voz fora do jogo (no jogo ela já toca 4,4 dB mais baixa)
const RADIO_ALVO = -12
function avaliaTeste(t = ultimoTeste) {
  if (!t) return null
  const voz = t.voz ?? -20, base = t.radio - (t.cena === 'jogo' ? 20 * Math.log10(NO_JOGO) : 0), dif = base - voz
  const [cls, txt] = dif > -4 ? ['erro', 'Alta demais: a rádio briga com a sua voz'] : dif > -8 ? ['aviso', 'Um pouco alta'] : dif >= -18 ? ['ok', 'Equilibrado'] : ['aviso', 'Baixinha: quase não dá para ouvir']
  return { cls, txt, dif, base, voz }
}
function pintaTeste() {
  const t = ultimoTeste, a = avaliaTeste(), el = $('#resSom')
  if (!t) { el.hidden = true; return }
  const f = v => v == null ? '—' : `${Math.round(v)} dB`
  const vols = [...volDe.values()]
  el.hidden = false
  el.innerHTML = `<div class="linhas">
      <span>sua voz<b>${f(t.voz)}</b></span><span>jogo<b>${f(t.jogo)}</b></span><span>rádio<b>${f(t.radio)}</b></span>
    </div>
    <p class="veredito ${a.cls}">${ic(a.cls === 'ok' ? 'circle-check' : 'triangle-alert')}${a.txt} <small>rádio ${Math.abs(Math.round(a.dif))} dB ${a.dif < 0 ? 'abaixo' : 'acima'} da voz${t.cena === 'jogo' ? ' (fora do jogo)' : ''}${t.voz == null ? ' · fale um pouco para comparar com a sua voz de verdade' : ''}</small></p>
    <p class="dica">Medido no nível que chega nela com o volume dela no máximo${vols.length ? ` · volume lá: ${vols.map(v => `${esc(v.nome)} ${v.vol}%`).join(', ')}` : ''}.</p>
    ${a.cls === 'ok' ? '' : '<button class="btn mini forte" id="btnAjustaRadio">Ajustar a rádio pra mim</button>'}`
  const aj = $('#btnAjustaRadio')
  if (aj) aj.onclick = () => {
    // ganho ∝ fader²: para mudar d dB, o fader muda 10^(d/40)
    const d = (a.voz + RADIO_ALVO) - a.base, novo = Math.max(.05, Math.min(1, mix.radio * 10 ** (d / 40)))
    const vol = $('[data-canal=radio] [data-vol]'); vol.value = Math.round(novo * 100); vol.oninput()
    toast(novo >= 1 && d > 0 ? 'A rádio já está no máximo' : `Rádio ajustada para ${vol.value}. Teste de novo para conferir.`)
    ultimoTeste = null; pintaTeste()
  }
}
// volume que cada um deixou na página dela (ela manda quando muda)
const volDe = new Map()
function pintaVolDela() {
  const v = [...volDe.values()]
  $('#volDela').textContent = v.length ? 'volume lá: ' + v.map(x => `${x.nome} ${x.mudo ? 'mudo' : x.vol + '%'}`).join(' · ') : 'o que ela ouve'
}

// playlists: a do config e as que você já tocou
const recentes = () => { const l = pref.playlists || []; return l.some(x => x.link === LIVE.playlist) ? l : [{ link: LIVE.playlist, titulo: 'Playlist padrão' }, ...l] }
function pintaRecentes(atual) {
  $('#recentes').innerHTML = recentes().map(x => `<button type="button" data-link="${esc(x.link)}" class="${x.link === atual ? 'atual' : ''}" title="${esc(x.link)}">${esc(x.titulo)}</button>`).join('')
}
async function tocaLista(link) {
  $('#rLista').textContent = 'carregando…'
  const r = await radio.carrega(link)
  if (r.erro) { toast(r.erro); pintaFila(); return }
  pref.playlists = [{ link, titulo: r.titulo || 'Playlist' }, ...(pref.playlists || []).filter(x => x.link !== link)].slice(0, 8)
  pref.ultimaLista = link; salva(); pintaRecentes(link)
  toast(`${r.titulo}: ${r.n} músicas`)
}
$('#formLista').onsubmit = e => { e.preventDefault(); const l = $('#linkLista').value.trim(); if (l) { tocaLista(l); $('#linkLista').value = '' } }
$('#recentes').onclick = e => { const b = e.target.closest('[data-link]'); if (b) tocaLista(b.dataset.link) }
pintaRecentes(pref.ultimaLista || LIVE.playlist)
radio.carrega(pref.ultimaLista || LIVE.playlist, { tocar: false }).then(r => { if (r.erro) $('#rLista').textContent = 'não abriu a playlist' })

// busca
let resultados = []
$('#formBusca').onsubmit = async e => {
  e.preventDefault()
  const q = $('#busca').value.trim(); if (!q) return
  $('#resultados').innerHTML = '<p class="vazio">Buscando…</p>'
  resultados = await buscaMusica(q)
  $('#resultados').innerHTML = resultados.length ? resultados.map((x, j) => `<div class="item" data-j="${j}"><img src="${esc(x.c)}" alt="" loading="lazy"><div><b>${esc(x.t)}</b><span>${esc(x.a)} · ${minutos(x.d)}</span></div>
    <div class="acoes"><button class="btn mini" data-faz="agora" title="Tocar agora">▶</button><button class="btn mini" data-faz="fila" title="Tocar depois desta">+ fila</button></div></div>`).join('') : '<p class="vazio">Nada encontrado.</p>'
}
$('#resultados').onclick = e => {
  const b = e.target.closest('[data-faz]'), it = e.target.closest('[data-j]'); if (!it) return
  const x = resultados[+it.dataset.j], agora = !b || b.dataset.faz === 'agora'
  radio.adiciona({ ...x, k: 'yt' }, { agora })
  toast(agora ? `Tocando: ${x.t}` : `Na fila: ${x.t}`)
}

/* ---------- chat, pix e pedidos ---------- */
const msgs = []
const nomeDe = m => m.de === 'ele' ? LIVE.streamer : m.de === 'amigo' ? (m.nome || 'Convidado') : LIVE.ela
function poeMsg(m) {
  msgs.push(m); if (msgs.length > 120) msgs.shift()
  const d = document.createElement('div')
  if (m.id) d.dataset.id = m.id
  if (!m.sis && m.de !== 'ele') { d.dataset.key = m.de === 'amigo' ? m.key : 'ela'; d.dataset.nome = nomeDe(m) }
  const cor = m.de === 'amigo' ? corDe(m.key) : '#ff9ccb'
  if (m.pix) { d.className = 'pixmsg'; d.innerHTML = `<strong>pix de ${reais(m.pix)}</strong><b style="color:${cor}"></b>: `; d.querySelector('b').textContent = nomeDe(m); d.append(m.txt || '') }
  else if (m.ped) { d.className = 'pedmsg'; d.innerHTML = `${ic('music')} <b style="color:${cor}"></b> pediu `; d.querySelector('b').textContent = nomeDe(m); d.append(m.txt) }
  else if (m.sis) { d.className = 'sis'; d.textContent = m.txt }
  else { d.className = m.de === 'ele' ? 'eu' : 'ela'; d.innerHTML = '<b></b> '; const b = d.querySelector('b'); b.textContent = nomeDe(m); if (m.de === 'amigo') b.style.color = cor; d.append(m.txt) }
  const box = $('#msgs'), embaixo = box.scrollHeight - box.scrollTop - box.clientHeight < 40
  box.append(d); if (embaixo) box.scrollTop = box.scrollHeight
  if (!m.sis && m.de !== 'ele') avisaAba('chat', '#bChat')
  if (!m.sis && !m.ped && !m.hist) palco.chat({ id: m.id, de: m.de || 'ela', key: m.key, nome: m.nome, txt: m.txt, pix: m.pix })
}
$('#compor').onsubmit = e => {
  e.preventDefault()
  const txt = $('#msg').value.trim().slice(0, 300); if (!txt) return
  const m = { id: crypto.randomUUID(), de: 'ele', txt, ts: Date.now() }
  poeMsg(m); live?.acoes.chat.send(m); $('#msg').value = ''
  est.stats.msgs++; manda()
}
function recebePix(p, id) {
  const valor = Math.round(+p?.valor * 100) / 100
  if (!(valor > 0 && valor <= 10000)) return
  const q = quemE(id), md = modDe(q.key)
  if (md.fora) return expulsa(id)
  if (!regras.pix || md.semPix || md.calado) { sisPara(id, !regras.pix ? 'O pix está fechado agora.' : md.calado ? 'Você está silenciado: o pix volta junto com o chat.' : 'O pix está bloqueado pra você nesta live.'); return }
  if (cart.modo === 'tempo' && valor > saldoDe(q.key) + 1e-9) { live?.acoes.chat.send({ id: crypto.randomUUID(), de: 'sis', txt: `Saldo insuficiente: você tem ${reais(saldoDe(q.key))}` }, id); return }
  if (cart.modo === 'tempo') gasta(q.key, valor)
  const msg = String(p.msg || '').slice(0, 140)
  const ev = { id: String(p.id || crypto.randomUUID()).slice(0, 40), valor, msg, voz: vozValida(p.voz) ? p.voz : 'normal', abre: Math.floor(Math.random() * ABERTURAS.length), nome: q.nome, key: q.key, de: q.de }
  if (est.meta.on) { est.meta = { ...est.meta, atual: Math.round(((est.meta.atual || 0) + valor) * 100) / 100 }; pref.metaAtual = est.meta.atual; salva() }
  est.stats.pix = Math.round((est.stats.pix + valor) * 100) / 100
  poeMsg({ id: 'pix' + ev.id, pix: valor, txt: msg, de: q.de, key: q.key, nome: q.nome })
  live?.acoes.pixtoca.send(ev)
  pixEm = Date.now()
  palco.pix(ev); somPix(); setTimeout(() => falaPix(q.nome, ev.valor, ev.msg, ev.voz, ev.abre), 1100)
  muda({ meta: { ...est.meta }, carteira: estCart(), carteiras: estCarteiras() }); pintaPix()
}
let ultimoPedido = 0
function recebePedido(p, id) {
  if (!/^[\w-]{11}$/.test(p?.id || '') || Date.now() - ultimoPedido < 4000) return
  const q = quemE(id), md = modDe(q.key)
  if (md.fora) return expulsa(id)
  if (!regras.pedidos || md.calado) { sisPara(id, md.calado ? 'Você está silenciado: os pedidos voltam junto com o chat.' : 'Os pedidos de música estão fechados agora.'); return }
  ultimoPedido = Date.now()
  const it = radio.adiciona({ k: 'yt', id: p.id, t: String(p.t || '').slice(0, 120), a: String(p.a || '').slice(0, 80), c: capaOk(p.c), d: +p.d || 0, pedido: q.nome })
  const txt = `${it.t}${it.a ? ' · ' + it.a : ''}`
  poeMsg({ ped: true, txt, de: q.de, key: q.key, nome: q.nome })
  avisaAba('radio', '#bRadio')
  toast(`${q.nome} pediu ${it.t}`, 4000)
  live?.acoes.chat.send({ id: crypto.randomUUID(), de: 'sis', txt: `Pedido na fila: ${txt}` })
}

/* ---------- moderação ----------
   Por pessoa (a chave dela ou a conta do amigo): silenciar por um tempo (chat, pix e pedidos), bloquear o pix,
   tirar da linha, bloquear a linha, apagar mensagem e expulsar (só amigos). Tudo passa pelo estúdio, então vale
   mesmo se a página da pessoa for antiga; a página nova mostra o aviso e trava os botões. Fica salvo entre recargas. */
const SEMPRE = 8.64e15
const mod = pref.mod || {} // key → { nome, ate, semPix, semLinha, fora }
const regras = { pix: pref.pixAberto !== false, pedidos: pref.pedidosAbertos !== false, linha: pref.linhaAberta !== false }
est.regras = { ...regras }
const modDe = key => { const m = mod[key] || {}; return { calado: m.ate > Date.now() ? m.ate : 0, semPix: !!m.semPix, semLinha: !!m.semLinha, fora: !!m.fora } }
const idsDe = key => live ? live.publico().filter(id => quemE(id).key === key) : []
const sisPara = (id, txt) => live?.acoes.chat.send({ id: crypto.randomUUID(), de: 'sis', txt }, id)
function salvaMod() {
  for (const [k, m] of Object.entries(mod)) if (!(m.ate > Date.now()) && !m.semPix && !m.semLinha && !m.fora) delete mod[k]
  pref.mod = mod; salva()
}
const avisaMod = key => idsDe(key).forEach(id => live.acoes.mod.send({ ...modDe(key), regras }, id))
const foraAp = new Set(pref.foraAps || [])
const salvaForaAp = () => { pref.foraAps = [...foraAp].slice(-200); salva() }
function expulsa(id) { live?.acoes.mod.send({ fora: true, regras }, id); vozSai(id) }
function tiraDaLinha(key) {
  idsDe(key).forEach(id => { live.acoes.mod.send({ ...modDe(key), regras, tirado: true }, id); mudaChamada(id, false) })
  const lista = (est.chamada || []).filter(p => p.key !== key)
  if (lista.length !== (est.chamada || []).length) { somLinha(false); muda({ chamada: lista, linha: lista.some(p => p.key === 'ela') }) }
}
const naLinha = key => (est.chamada || []).some(p => p.key === key)
function apagaMsg(id) {
  if (!id) return
  const k = msgs.findIndex(m => m.id === id); if (k >= 0) msgs.splice(k, 1)
  document.querySelectorAll(`#msgs [data-id="${CSS.escape(id)}"]`).forEach(e => e.remove())
  palco.apagaChat?.(id)
  live?.acoes.chat.send({ apaga: id })
}
// limpar o chat de todo mundo (dois toques: o primeiro pede confirmação). As páginas antigas só sabem apagar
// uma mensagem por vez, então vai também um "apaga" para cada mensagem.
let limpaConfirma = 0
$('#limpaChat').onclick = () => {
  const b = $('#limpaChat')
  if (Date.now() - limpaConfirma > 4000) { limpaConfirma = Date.now(); b.textContent = 'Toque de novo para limpar'; setTimeout(() => { if (Date.now() - limpaConfirma >= 4000) b.textContent = 'Limpar chat' }, 4100); return }
  limpaConfirma = 0; b.textContent = 'Limpar chat'
  const ids = msgs.map(m => m.id).filter(Boolean)
  msgs.length = 0; $('#msgs').innerHTML = ''; palco.limpaChat?.()
  live?.acoes.chat.send({ limpa: 1 })
  for (const id of ids) live?.acoes.chat.send({ apaga: id })
  toast('Chat limpo para todo mundo')
}
function modera(key, nome, acao, arg) {
  const m = mod[key] ||= {}
  m.nome = nome
  const fala = t => poeMsg({ sis: true, txt: t })
  if (acao === 'calar') {
    m.ate = arg ? Date.now() + arg * 60e3 : SEMPRE
    fala(`${nome} silenciado${arg ? ` por ${arg} min` : ' até você liberar'}`)
    idsDe(key).forEach(id => sisPara(id, `Você foi silenciado${arg ? ` por ${arg} min` : ''}. Chat, pix e pedidos voltam depois.`))
  }
  if (acao === 'soltar') { m.ate = 0; fala(`${nome} pode falar de novo`); idsDe(key).forEach(id => sisPara(id, 'Você pode falar no chat de novo.')) }
  if (acao === 'semPix') { m.semPix = !m.semPix; fala(m.semPix ? `Pix de ${nome} bloqueado` : `Pix de ${nome} liberado`) }
  if (acao === 'tirar') { tiraDaLinha(key); fala(`${nome} saiu da linha`) }
  if (acao === 'semLinha') { m.semLinha = !m.semLinha; if (m.semLinha) tiraDaLinha(key); fala(m.semLinha ? `Linha bloqueada para ${nome}` : `Linha liberada para ${nome}`) }
  if (acao === 'expulsar') {
    m.fora = true; tiraDaLinha(key)
    // guarda o aparelho também: assim não adianta voltar como convidado com outro nome
    m.aps = [...new Set([...(m.aps || []), ...idsDe(key).map(id => live.perfis.get(id)?.ap).filter(Boolean)])]
    m.aps.forEach(a => foraAp.add(a)); salvaForaAp()
    idsDe(key).forEach(expulsa)
    fala(`${nome} foi removido da live`)
  }
  if (acao === 'voltar') { m.fora = false; (m.aps || []).forEach(a => foraAp.delete(a)); m.aps = []; salvaForaAp(); fala(`${nome} pode voltar para a live`) }
  if (acao === 'apagarTudo') {
    const ids = msgs.filter(x => !x.sis && (key === 'ela' ? x.de === 'ela' && !x.key : x.key === key)).map(x => x.id).filter(Boolean)
    ids.forEach(apagaMsg); fala(`${ids.length} mensage${ids.length === 1 ? 'm' : 'ns'} de ${nome} apagada${ids.length === 1 ? '' : 's'}`)
  }
  salvaMod(); avisaMod(key); pintaPessoas()
}
// relógio dos silêncios: quando acaba, avisa a pessoa e destrava
setInterval(() => {
  let mudou = false
  for (const [k, m] of Object.entries(mod)) if (m.ate && m.ate < Date.now()) { m.ate = 0; mudou = true; avisaMod(k); idsDe(k).forEach(id => sisPara(id, 'Acabou o silêncio: você pode falar no chat de novo.')) }
  if (mudou) salvaMod()
  if (Object.values(mod).some(m => m.ate > Date.now()) || mudou) pintaPessoas()
}, 1000)
// abrir e fechar pix, pedidos e linha para todo mundo
function pintaRegras() {
  $('#regPix').setAttribute('aria-pressed', regras.pix); $('#regPed').setAttribute('aria-pressed', regras.pedidos); $('#regLinha').setAttribute('aria-pressed', regras.linha)
}
;[['#regPix', 'pix', 'pixAberto', 'Pix'], ['#regPed', 'pedidos', 'pedidosAbertos', 'Pedidos de música'], ['#regLinha', 'linha', 'linhaAberta', 'Linha']].forEach(([s, k, p, nome]) => $(s).onclick = () => {
  regras[k] = !regras[k]; pref[p] = regras[k]; salva(); pintaRegras()
  if (k === 'linha' && !regras.linha) (est.chamada || []).forEach(x => tiraDaLinha(x.key))
  muda({ regras: { ...regras } })
  live?.publico().forEach(id => live.acoes.mod.send({ ...modDe(quemE(id).key), regras }, id))
  toast(`${nome} ${regras[k] ? (k === 'pedidos' ? 'abertos' : 'aberto') : (k === 'pedidos' ? 'fechados' : 'fechado')} para todo mundo`)
})
pintaRegras()
// quem está na live (e quem tem alguma restrição, mesmo fora): toque no nome para moderar
function pintaPessoas() {
  const box = $('#pessoas'); if (!box) return
  const on = new Map()
  for (const id of live?.publico() || []) { const q = quemE(id); on.set(q.key, q.nome) }
  for (const [k, m] of Object.entries(mod)) if (!on.has(k)) on.set(k, m.nome || k)
  box.innerHTML = [...on].map(([k, nome]) => {
    const md = modDe(k), ligado = idsDe(k).length > 0
    const semConta = k !== 'ela' && !k.startsWith('g:') && idsDe(k).some(id => !live.perfis.get(id)?.conf)
    const marcas = [semConta && '<em class="nc" title="Escolheu este perfil sem estar logado no Cineminha">?</em>', naLinha(k) && ic('phone'), md.calado && `${ic('timer')}${md.calado < SEMPRE ? minutos((md.calado - Date.now()) / 1000) : ''}`, md.semPix && ic('circle-x'), md.semLinha && ic('mic-off'), md.fora && '<em>fora</em>'].filter(Boolean).join('')
    return `<button class="pessoa${ligado ? '' : ' off'}" data-key="${esc(k)}" data-nome="${esc(nome)}" style="--c:${k === 'ela' ? '#ff9ccb' : corDe(k)}"><b>${esc(nome)}</b>${marcas ? `<span>${marcas}</span>` : ''}</button>`
  }).join('') || '<span class="vazio">ninguém na live ainda</span>'
}
// menu de moderação (nome no chat ou na lista de pessoas)
const menu = $('#menuMod')
function abreMenu(key, nome, msgId, ancora) {
  const md = modDe(key), ehEla = key === 'ela'
  const item = (acao, rot, icone, arg = '', perigo = false) => `<button data-acao="${acao}" data-arg="${arg}"${perigo ? ' class="perigo"' : ''}>${ic(icone)}${rot}</button>`
  menu.innerHTML = `<h4>${esc(nome)}</h4>
    ${md.calado ? item('soltar', `Liberar o chat${md.calado < SEMPRE ? ` (faltam ${minutos((md.calado - Date.now()) / 1000)})` : ''}`, 'circle-check')
      : `<div class="tempo">${ic('timer')}Silenciar<span>${[1, 5, 10].map(n => `<button data-acao="calar" data-arg="${n}">${n} min</button>`).join('')}<button data-acao="calar" data-arg="0">até eu liberar</button></span></div>`}
    ${item('semPix', md.semPix ? 'Liberar o pix' : 'Bloquear o pix', md.semPix ? 'circle-check' : 'circle-x')}
    ${naLinha(key) ? item('tirar', 'Tirar da linha', 'phone') : ''}
    ${item('semLinha', md.semLinha ? 'Liberar a linha' : 'Bloquear a linha', md.semLinha ? 'mic' : 'mic-off')}
    ${msgId ? item('apagar', 'Apagar esta mensagem', 'trash-2') : ''}
    ${item('apagarTudo', 'Apagar todas as mensagens', 'trash-2')}
    ${ehEla ? '' : md.fora ? item('voltar', 'Deixar voltar para a live', 'circle-check') : item('expulsar', 'Remover da live', 'user-x', '', true)}`
  menu.dataset.key = key; menu.dataset.nome = nome; menu.dataset.msg = msgId || ''
  menu.hidden = false
  const r = ancora.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight
  menu.style.left = Math.max(8, Math.min(innerWidth - mw - 8, r.left)) + 'px'
  menu.style.top = (r.bottom + mh + 8 > innerHeight ? Math.max(8, r.top - mh - 6) : r.bottom + 6) + 'px'
}
menu.onclick = e => {
  const b = e.target.closest('[data-acao]'); if (!b) return
  const { key, nome, msg } = menu.dataset, a = b.dataset.acao
  if (a === 'expulsar' && b.dataset.certo !== '1') { b.dataset.certo = '1'; b.lastChild.textContent = 'Clique de novo para remover'; return }
  if (a === 'apagar') { apagaMsg(msg); toast('Mensagem apagada para todo mundo') } else modera(key, nome, a, +b.dataset.arg || 0)
  menu.hidden = true
}
addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('#msgs [data-key] b, .pessoa')) menu.hidden = true })
addEventListener('keydown', e => { if (e.key === 'Escape') menu.hidden = true })
$('#msgs').addEventListener('click', e => {
  const b = e.target.closest('b'), d = b?.closest('[data-key]'); if (!d) return
  abreMenu(d.dataset.key, d.dataset.nome, d.dataset.id, b)
})
$('#pessoas').onclick = e => { const p = e.target.closest('.pessoa'); if (p) abreMenu(p.dataset.key, p.dataset.nome, '', p) }

/* ---------- quem é quem: a amor (link dela) e os amigos (conta do Cineminha) ---------- */
function quemE(id) {
  if (live?.papeis.get(id) === 'amigo') { const p = live.perfis.get(id) || {}; return { de: 'amigo', key: p.key || 'g:convidado', nome: p.nome || 'Convidado' } }
  return { de: 'ela', key: 'ela', nome: LIVE.ela }
}
const publico = id => ['ela', 'amigo'].includes(live?.papeis.get(id))

/* ---------- ligação: a voz de cada um ---------- */
const vozes = new Map() // peerId → { audio, para, key }
function vozChegou(stream, id) {
  vozSai(id)
  const q = quemE(id), audio = new Audio(); audio.autoplay = true; audio.srcObject = stream; audio.play().catch(() => {})
  vozes.set(id, { audio, key: q.key, para: medidor(stream, v => palco.setNivel(v, q.key)) })
}
function vozSai(id) { const v = vozes.get(id); if (!v) return; v.para?.(); v.audio.srcObject = null; palco.setNivel(0, v.key); vozes.delete(id) }
function mudaChamada(id, on) {
  const q = quemE(id), md = modDe(q.key)
  if (on && (md.fora || md.semLinha || !regras.linha)) { live?.acoes.mod.send({ ...md, regras, tirado: true }, id); sisPara(id, md.semLinha ? 'A linha está bloqueada pra você nesta live.' : 'A linha está fechada agora.'); on = false }
  const lista = (est.chamada || []).filter(p => p.key !== q.key)
  if (on) lista.push({ key: q.key, nome: q.nome })
  if (!on) vozSai(id)
  if (lista.length === (est.chamada || []).length && on === (est.chamada || []).some(p => p.key === q.key)) return
  somLinha(on); muda({ chamada: lista, linha: lista.some(p => p.key === 'ela') })
}

/* ---------- rede ---------- */
const camDe = new Map()
let camTrilha = null
async function conecta() {
  live = await entraLive(codigo, 'estudio')
  const chips = () => {
    $('#chipEla').classList.toggle('on', live.quem('ela').length > 0)
    const na = live.quem('amigo').length
    $('#chipAmigos').hidden = !na; $('#chipAmigos').classList.toggle('on', na > 0); $('#chipAmigos span').textContent = `${na} amigo${na === 1 ? '' : 's'}`
    $('#chipCam').classList.toggle('on', live.quem('cam').length > 0)
    const ela = live.quem('ela').length
    $('#infoSaida').textContent = ela || na ? `transmitindo para ${[ela ? LIVE.ela : '', na ? `${na} amigo${na === 1 ? '' : 's'}` : ''].filter(Boolean).join(' e ')}` : `esperando ${LIVE.ela} entrar`
    if (!live.quem('cam').length) $('#camInfo').textContent = 'desconectada'
  }
  live.on('papel', (id, p) => {
    if (p === 'ela' && live.perfis.get(id)?.k !== pref.chaveEla) {
      // link sem a chave (antigo, ou alguém tirou o "&amigos"): entra como convidado
      live.papeis.set(id, 'amigo'); live.perfis.set(id, { key: 'g:link antigo', nome: 'Link antigo', ap: live.perfis.get(id)?.ap || '' }); p = 'amigo'
      live.acoes.mod.send({ linkAntigo: true, regras }, id)
      poeMsg({ sis: true, txt: `Alguém entrou com um link antigo dela. Se for a ${LIVE.ela}, mande o link novo (aba links).` })
    }
    chips()
    if ((p === 'ela' || p === 'amigo') && (modDe(quemE(id).key).fora || foraAp.has(live.perfis.get(id)?.ap))) { expulsa(id); return }
    if (p === 'ela' || p === 'amigo') {
      live.acoes.mod.send({ ...modDe(quemE(id).key), regras }, id)
      enviaPara(id)
      manda(id); live.acoes.mix.send({ abaixa: mix.abaixa }, id)
      live.acoes.chat.send({ hist: msgs.filter(m => !m.sis).slice(-80) }, id)
      setTimeout(ajustaEnvio, 1500)
      poeMsg({ sis: true, txt: `${quemE(id).nome} entrou na live` }); pintaPessoas()
    }
    if (p === 'cam') poeMsg({ sis: true, txt: 'Câmera do celular conectada' })
  })
  live.acoes.mix.on((m, id) => {
    const p = live.papeis.get(id)
    if ((p === 'ela' || p === 'amigo') && m && typeof m.vol === 'number') { volDe.set(id, { nome: quemE(id).nome, vol: Math.round(Math.max(0, Math.min(100, m.vol))), mudo: !!m.mudo }); pintaVolDela() }
  })
  live.on('saiu', (id, p, pf) => {
    chips(); if (volDe.delete(id)) pintaVolDela(); setTimeout(pintaPessoas)
    if (p === 'ela' || p === 'amigo') {
      const q = p === 'amigo' ? { key: pf?.key, nome: pf?.nome || 'Convidado' } : { key: 'ela', nome: LIVE.ela }
      poeMsg({ sis: true, txt: `${q.nome} saiu da live` })
      vozSai(id)
      if ((est.chamada || []).some(x => x.key === q.key)) { const lista = est.chamada.filter(x => x.key !== q.key); somLinha(false); muda({ chamada: lista, linha: lista.some(x => x.key === 'ela') }) }
    }
    if (camDe.get(id)) { camDe.delete(id); if (!camDe.size) { camTrilha = null; comp.cam(null); muda({ cam: false }); if (modoTela()) reenvia() } }
  })
  live.on('stream', (stream, id, meta) => {
    if (meta.cam) {
      const t = stream.getVideoTracks()[0]; if (!t) return
      camDe.set(id, t); camTrilha = t
      if (modoTela()) reenvia(); else comp.cam(t)
      muda({ cam: $('#btnCam').getAttribute('aria-pressed') === 'true' })
    }
    if (meta.voz && publico(id)) vozChegou(stream, id)
  })
  live.acoes.camcmd.on((c, id) => {
    if (live.papeis.get(id) !== 'cam' || !c?.estado) return
    const { frente, w, h } = c.estado
    $('#camInfo').textContent = `${frente ? 'frontal' : 'traseira'} · ${w}×${h}${h > w ? ' (em pé)' : ''}`
  })
  live.acoes.chat.on((m, id) => {
    if (!publico(id) || typeof m?.txt !== 'string') return
    const q = quemE(id), md = modDe(q.key)
    if (md.fora) return expulsa(id)
    if (md.calado) { sisPara(id, `Você está silenciado${md.calado < 8e15 ? ` por mais ${minutos((md.calado - Date.now()) / 1000)}` : ''}. A mensagem não foi.`); return }
    const msg = { id: String(m.id || '').slice(0, 40), de: q.de, key: q.key, nome: q.nome, txt: m.txt.slice(0, 300), ts: Date.now() }
    poeMsg(msg); est.stats.msgs++
    live.acoes.chat.send(msg)
    manda()
  })
  live.acoes.pix.on((p, id) => { if (publico(id)) recebePix(p, id) })
  live.acoes.pedido.on((p, id) => { if (publico(id)) recebePedido(p, id) })
  live.acoes.voto.on((v, id) => { if (publico(id) && !modDe(quemE(id).key).fora) recebeVoto(v, id) })
  live.acoes.linha.on((l, id) => { if (publico(id)) { mudaChamada(id, !!l?.on); pintaPessoas() } })
  chips()
}

// qualidade de envio: H.264 (circuito de vídeo), bitrate de acordo com a qualidade escolhida
async function ajustaEnvio() {
  const camT = streamCam?.getVideoTracks()[0]
  const meus = [...comp.saida.getTracks(), ...(streamDireto?.getTracks() || []), ...(camT ? [camT] : [])]
  const pcs = live?.room.getPeers?.() || {}
  const kbps = (protegendo ? 1800 : pref.qualidade === 1080 ? 6000 : 3500) * 1000
  // cada pessoa custa uma codificação e o envio inteiro: ela recebe a qualidade cheia; os amigos, 480p mais leve
  const altura = protegendo ? 540 : (QUALIDADES[pref.qualidade] || QUALIDADES[720])[1]
  for (const [pid, pc] of (pcs instanceof Map ? [...pcs] : Object.entries(pcs))) for (const s of pc.getSenders()) {
    if (!s.track || !meus.includes(s.track)) continue
    const p = s.getParameters(); if (!p.encodings?.length) continue
    const video = s.track.kind === 'video', ehCam = s.track === camT, amigo = live.papeis.get(pid) === 'amigo'
    const leve = video && !ehCam && amigo
    Object.assign(p.encodings[0], { maxBitrate: !video ? 160_000 : ehCam ? (amigo ? 450_000 : 700_000) : leve ? Math.min(kbps, 1_200_000) : kbps, priority: amigo ? 'medium' : 'high', networkPriority: amigo ? 'medium' : 'high' },
      video ? { maxFramerate: protegendo ? 24 : 30, scaleResolutionDownBy: leve ? Math.max(1, altura / 480) : 1 } : {})
    // jogo: segura a nitidez e, se faltar fôlego, solta um quadro aqui e ali; câmera: mantém o movimento
    if (video) p.degradationPreference = ehCam ? 'maintain-framerate' : 'maintain-resolution'
    await s.setParameters(p).catch(() => {})
  }
}

/* ---------- como a câmera entra no vídeo: 'pc' (o canvas junta tudo) ou 'tela' (vai separado, a tela dela monta) ----------
   No modo 'tela' a captura do jogo vai direto pro codificador (sem copiar cada quadro), a câmera do celular é repassada
   pequena e saindo daqui (mesmo caminho do jogo, então chegam juntas) e a página dela segura o vídeo do jogo no mesmo
   atraso do som. O compositor continua só no som (mixer). */
const modoTela = () => pref.envio === 'tela'
const somSaida = comp.saida.getAudioTracks()[0]
let streamDireto = null, streamCam = null
function montaStreams() {
  const vt = capJogo?.getVideoTracks()[0]
  streamDireto = modoTela() ? new MediaStream([...(vt ? [vt] : []), somSaida]) : null
  streamCam = modoTela() && camTrilha ? new MediaStream([camTrilha]) : null
}
function enviaPara(id) {
  if (!live) return
  if (modoTela()) { live.manda(streamDireto, id, { live: 1 }); if (streamCam) live.manda(streamCam, id, { cam: 1 }) }
  else live.manda(comp.saida, id, { live: 1 })
  setTimeout(ajustaEnvio, 1500)
}
let antigos = []
function reenvia() {
  const ids = live?.publico() || []
  for (const id of ids) for (const st of [comp.saida, ...antigos]) if (st) live.tira(st, id)
  montaStreams(); antigos = [streamDireto, streamCam].filter(Boolean)
  previaEnvio()
  ids.forEach(enviaPara)
}
function previaEnvio() {
  const vt = capJogo?.getVideoTracks()[0]
  palco.composto(!modoTela())
  palco.setJogo(modoTela() ? (vt ? new MediaStream([vt]) : null) : new MediaStream(comp.saida.getVideoTracks()))
  palco.setCam(modoTela() && camTrilha ? new MediaStream([camTrilha]) : null)
}
function aplicaModoEnvio() {
  comp.parar(modoTela())
  if (!modoTela()) { const vt = capJogo?.getVideoTracks()[0]; if (vt) comp.jogo(vt); if (camTrilha) comp.cam(camTrilha) }
  muda({ envio: { modo: modoTela() ? 'tela' : 'pc', atraso: +$('#atraso').value }, camAj: { ...camAj } })
  reenvia()
}
$('#envio').value = modoTela() ? 'tela' : 'pc'
$('#envio').onchange = e => { pref.envio = e.target.value; salva(); aplicaModoEnvio(); toast(modoTela() ? 'Câmera montada na tela dela: o PC só envia a imagem do jogo' : 'Câmera juntada aqui no PC') }


/* ---------- meta de pix e dinheiro dela ---------- */
// carteira: 'infinito' ou 'tempo' (ganha R$ a cada minuto assistindo com a live no ar); fica salva entre as lives
const cart = { modo: LIVE.carteira.modo, porMinuto: LIVE.carteira.porMinuto, inicial: LIVE.carteira.inicial, ganho: 0, gasto: 0, seg: 0, ...(pref.carteira || {}) }
const salvaCart = () => { pref.carteira = { ...cart }; salva() }
const saldo = () => Math.max(0, Math.round((cart.inicial + cart.ganho - cart.gasto) * 100) / 100)
const estCart = () => ({ modo: cart.modo, saldo: saldo(), porMinuto: cart.porMinuto, falta: 60 - cart.seg })
est.carteira = estCart()
// os amigos têm o próprio saldo (pela conta do Cineminha), com as mesmas regras do dela
const amigosCart = pref.amigosCart || {}
const salvaAmigos = () => { pref.amigosCart = amigosCart; salva() }
const r2 = v => Math.round(v * 100) / 100
const saldoDe = key => key === 'ela' ? saldo() : Math.max(0, r2(cart.inicial + (amigosCart[key]?.ganho || 0) - (amigosCart[key]?.gasto || 0)))
function gasta(key, v) { if (key === 'ela') { cart.gasto += v; salvaCart() } else { (amigosCart[key] ||= { ganho: 0, gasto: 0, seg: 0 }).gasto += v; salvaAmigos() } }
const amigosOn = () => [...new Set((live?.quem('amigo') || []).map(id => live.perfis.get(id)?.key).filter(Boolean))]
const estCarteiras = () => Object.fromEntries(amigosOn().map(k => [k, { saldo: saldoDe(k), falta: 60 - (amigosCart[k]?.seg || 0) }]))
est.carteiras = {}
setInterval(() => {
  if (cart.modo !== 'tempo' || !est.inicio) return
  let mudou = false
  if (live?.quem('ela').length) {
    cart.seg++
    if (cart.seg >= 60) { cart.seg = 0; cart.ganho = r2(cart.ganho + cart.porMinuto); salvaCart(); mudou = true }
    else if (cart.seg % 15 === 0) salvaCart()
  }
  for (const k of amigosOn()) {
    const a = (amigosCart[k] ||= { ganho: 0, gasto: 0, seg: 0 })
    if (++a.seg >= 60) { a.seg = 0; a.ganho = r2(a.ganho + cart.porMinuto); mudou = true }
  }
  if (mudou) { salvaAmigos(); muda({ carteira: estCart(), carteiras: estCarteiras() }); pintaPix() }
  else { est.carteira = estCart(); est.carteiras = estCarteiras() }
}, 1000)
function pintaPix() {
  const m = est.meta
  $('#metaLiga').setAttribute('aria-pressed', m.on); $('#atMeta').setAttribute('aria-pressed', m.on)
  $('#metaInfo').textContent = `${reais(m.atual || 0)} de ${reais(m.alvo)}`
  $('#cartModo').value = cart.modo
  $('#cartTempo').hidden = cart.modo !== 'tempo'
  $('#cartInfo').textContent = cart.modo === 'tempo' ? `saldo dela: ${reais(saldo())}` : 'infinito'
}
$('#metaTitulo').value = est.meta.titulo; $('#metaAlvo').value = est.meta.alvo
const mudaMeta = ch => { const meta = { ...est.meta, ...ch }; Object.assign(pref, { metaOn: meta.on, metaTitulo: meta.titulo, metaAlvo: meta.alvo, metaAtual: meta.atual }); salva(); muda({ meta }); pintaPix() }
$('#metaTitulo').oninput = e => mudaMeta({ titulo: e.target.value.trim() || LIVE.meta.titulo })
$('#metaAlvo').oninput = e => { const v = Math.round(+e.target.value.replace(/[^\d,.]/g, '').replace(',', '.')); if (v > 0) mudaMeta({ alvo: v }) }
$('#metaLiga').onclick = $('#atMeta').onclick = () => mudaMeta({ on: !est.meta.on })
$('#metaZera').onclick = () => { mudaMeta({ atual: 0 }); toast('Meta recomeçou do zero') }
$('#cartModo').onchange = e => { cart.modo = e.target.value; salvaCart(); muda({ carteira: estCart() }); pintaPix(); toast(cart.modo === 'tempo' ? `Ela ganha ${reais(cart.porMinuto)} por minuto assistido` : 'Pix com dinheiro infinito') }
$('#cartTaxa').value = String(cart.porMinuto).replace('.', ',')
$('#cartTaxa').oninput = e => { const v = +e.target.value.replace(',', '.'); if (v >= 0) { cart.porMinuto = v; salvaCart(); muda({ carteira: estCart() }) } }
$('#cartInicial').value = cart.inicial
$('#cartInicial').oninput = e => { const v = +e.target.value.replace(',', '.'); if (v >= 0) { cart.inicial = v; salvaCart(); muda({ carteira: estCart() }); pintaPix() } }
$$('[data-presente]').forEach(b => b.onclick = () => {
  const v = +b.dataset.presente; cart.ganho += v; salvaCart(); muda({ carteira: estCart() }); pintaPix()
  live?.acoes.chat.send({ id: crypto.randomUUID(), de: 'sis', txt: `${LIVE.streamer} te deu ${reais(v)} de presente pra gastar em pix` })
  toast(`Deu ${reais(v)} pra ela`)
})
$('#cartZera').onclick = () => { cart.ganho = 0; cart.gasto = 0; cart.inicial = 0; cart.seg = 0; $('#cartInicial').value = 0; salvaCart(); muda({ carteira: estCart() }); pintaPix(); toast('Saldo dela zerado') }
pintaPix()

/* ---------- enquete ---------- */
const LETRAS = 'ABCD'
let votosDe = new Map(), fimEnq = 0
$('#enqProntas').innerHTML = LIVE.enquetes.map((e, i) => `<button type="button" data-i="${i}">${esc(e[0])}</button>`).join('')
$('#enqProntas').onclick = e => {
  const b = e.target.closest('[data-i]'); if (!b) return
  const [p, ...ops] = LIVE.enquetes[+b.dataset.i]
  $('#enqPergunta').value = p; $$('#enqOps input').forEach((x, i) => x.value = ops[i] || '')
}
$('#formEnq').onsubmit = e => {
  e.preventDefault()
  const pergunta = $('#enqPergunta').value.trim(), opcoes = $$('#enqOps input').map(x => x.value.trim()).filter(Boolean)
  if (!pergunta || opcoes.length < 2) { toast('Escreva a pergunta e pelo menos duas opções'); return }
  const seg = +$('#enqTempo').value || 60
  votosDe = new Map()
  muda({ enquete: { id: crypto.randomUUID().slice(0, 8), pergunta, opcoes, desde: Date.now(), ate: Date.now() + seg * 1000, votos: opcoes.map(() => 0), escolha: null, palpite: null, suspense: false, fim: false, ganhador: null } })
  clearTimeout(fimEnq); fimEnq = setTimeout(encerraEnq, seg * 1000)
  poeMsg({ sis: true, txt: `Enquete no ar: ${pergunta}` })
  pintaEnq()
}
function recebeVoto(v, id) {
  const e = est.enquete
  if (!e || e.fim || v?.id !== e.id || !(v.i >= 0 && v.i < e.opcoes.length)) return
  votosDe.set(id, v.i | 0)
  const votos = e.opcoes.map((_, i) => [...votosDe.values()].filter(x => x === i).length)
  const primeira = !e.votos.some(Boolean)
  muda({ enquete: { ...e, votos, escolha: v.i | 0 } })
  if (primeira) toast(`${LIVE.ela} votou${e.palpite != null ? ' (resultado no fim)' : `: ${e.opcoes[v.i]}`}`, 3000)
  pintaEnq()
}
function encerraEnq() {
  const e = est.enquete; if (!e || e.fim) return
  clearTimeout(fimEnq)
  const max = Math.max(...e.votos), ganhador = max > 0 ? e.votos.indexOf(max) : null
  muda({ enquete: { ...e, fim: true, fimEm: Date.now(), ganhador } })
  const res = ganhador == null ? `${LIVE.ela} não votou` : `${LIVE.ela} escolheu ${e.opcoes[ganhador]}` + (e.palpite != null ? (e.palpite === ganhador ? ' (você acertou!)' : ' (você errou a aposta)') : '')
  poeMsg({ sis: true, txt: `Resultado: ${res}` })
  live?.acoes.chat.send({ id: crypto.randomUUID(), de: 'sis', txt: `Resultado da enquete: ${res}` })
  pintaEnq()
}
$('#enqEncerra').onclick = encerraEnq
$('#enqTira').onclick = () => { clearTimeout(fimEnq); muda({ enquete: null }); pintaEnq() }
function pintaEnq() {
  const e = est.enquete
  $('#enqAoVivo').hidden = !e; $('#enqNova').hidden = !!e && !e.fim
  if (!e) return
  $('#enqTitulo').textContent = e.pergunta
  const total = e.votos.reduce((a, b) => a + b, 0)
  $('#enqRes').innerHTML = e.opcoes.map((o, i) => `<div class="op${e.ganhador === i ? ' ganhou' : ''}" style="--p:${total ? e.votos[i] / total * 100 : 0}%"><i class="barra"></i><b>${LETRAS[i]}</b><span>${esc(o)}</span><small>${e.votos[i]} voto${e.votos[i] === 1 ? '' : 's'}</small>
    ${e.fim ? '' : `<button class="btn mini aposta" data-aposta="${i}" aria-pressed="${e.palpite === i}" title="Apostar que ela escolhe esta">${e.palpite === i ? 'sua aposta' : 'apostar'}</button>`}</div>`).join('')
}
$('#enqRes').onclick = ev => {
  const b = ev.target.closest('[data-aposta]'), e = est.enquete; if (!b || !e || e.fim) return
  const i = +b.dataset.aposta, palpite = e.palpite === i ? null : i
  muda({ enquete: { ...e, palpite, suspense: palpite != null } }); pintaEnq()
}
setInterval(() => { const e = est.enquete; $('#enqFalta').textContent = e && !e.fim ? `faltam ${Math.max(0, Math.ceil((e.ate - Date.now()) / 1000))} s` : e?.fim ? 'encerrada' : '' }, 500)

/* ---------- termômetro e proteção: acima de 93 °C a transmissão cai para 540p/24 fps até esfriar ---------- */
let temp = null, quente = 0, frio = 0, protegendo = false
// marcha lenta: sem ninguém assistindo, o canvas junta só 10 quadros por segundo (economiza processador e calor)
let ritmoAtual = 30
function ritmo() {
  const alvo = !live?.publico().length ? 10 : protegendo ? 24 : 30
  if (alvo !== ritmoAtual) { ritmoAtual = alvo; comp.fps(alvo) }
}
setInterval(ritmo, 2000)
let teveSensor = false
async function leTemp() {
  // publicado (https), o Chrome pede permissão de "rede local" para o site falar com o seu PC: é só permitir
  const r = await fetch('http://localhost:8792/sensores', { cache: 'no-store', targetAddressSpace: 'loopback' }).then(r => r.json()).catch(() => null)
  semSensor = r ? 0 : semSensor + 1
  if (r) teveSensor = true
  else if (teveSensor && semSensor === 2) {
    teveSensor = false
    toast('O ajudante da live parou: sem termômetro e sem o som do jogo separado. Rode node scripts/live-local.mjs', 9000)
    poeMsg({ sis: true, txt: 'O ajudante da live parou (termômetro e som do jogo). Rode node scripts/live-local.mjs no PC.' })
  }
  temp = r?.temp ?? null
  const chip = $('#chipTemp')
  chip.querySelector('span').textContent = temp == null ? 'sem sensor' : `${temp} °C${protegendo ? ' · protegendo' : ''}`
  chip.className = 'chip medida ' + (temp == null ? '' : temp >= 93 ? 'ruim' : temp >= 85 ? 'atencao' : 'ok')
  if (temp == null || pref.protecao === false) return
  quente = temp >= 93 ? quente + 1 : 0
  frio = temp <= 82 ? frio + 1 : 0
  if (!protegendo && quente >= 3) {
    protegendo = true; comp.qualidade(540); ritmo(); tamanhoCaptura(540, 24); ajustaEnvio()
    toast('PC muito quente: transmissão em 540p até esfriar', 5000)
  } else if (protegendo && frio >= 20) {
    protegendo = false; comp.qualidade(pref.qualidade || 720); ritmo(); tamanhoCaptura(pref.qualidade || 720); ajustaEnvio()
    toast('PC esfriou: qualidade normal de volta', 4000)
  }
}
// sem o script do termômetro rodando, tenta de novo só a cada 30 s (em vez de a cada 3 s)
let semSensor = 0
;(function laco() { leTemp().finally(() => setTimeout(laco, semSensor > 2 ? 30000 : 3000)) })()

/* ---------- qualidade real que está chegando nela ---------- */
let medida = null, antesBytes = 0, antesT = 0
async function leQualidade() {
  const pcs = live?.room.getPeers?.() || {}, video = comp.saida.getVideoTracks()[0]
  let out = null, rtt = null
  const lista = (pcs instanceof Map ? [...pcs] : Object.entries(pcs)).sort(([a], [b]) => (live.papeis.get(a) === 'ela') - (live.papeis.get(b) === 'ela')) // a dela por último: é a que vale
  for (const [, pc] of lista) {
    if (!pc.getSenders().some(s => s.track === video)) continue
    const st = await pc.getStats().catch(() => null); if (!st) continue
    st.forEach(x => {
      if (x.type === 'outbound-rtp' && x.kind === 'video') out = x
      if (x.type === 'candidate-pair' && x.nominated && x.currentRoundTripTime != null) rtt = Math.round(x.currentRoundTripTime * 1000)
    })
  }
  const chip = $('#chipQual')
  if (!out) { medida = null; chip.className = 'chip medida'; chip.querySelector('span').textContent = live?.quem('ela').length ? 'conectando…' : 'sem transmissão'; return }
  const kbps = antesT ? Math.round((out.bytesSent - antesBytes) * 8 / ((out.timestamp - antesT) / 1000) / 1000) : 0
  antesBytes = out.bytesSent; antesT = out.timestamp
  medida = { w: out.frameWidth, h: out.frameHeight, fps: Math.round(out.framesPerSecond || 0), kbps, rtt, motivo: out.qualityLimitationReason, codec: out.encoderImplementation, hw: out.powerEfficientEncoder }
  chip.querySelector('span').textContent = `${medida.h || '?'}p · ${medida.fps} fps · ${(kbps / 1000).toFixed(1).replace('.', ',')} Mb/s`
  chip.title = `Chegando nela: ${medida.w}×${medida.h}, ${medida.fps} fps, ${kbps} kb/s${rtt != null ? `, atraso de rede ${rtt} ms` : ''}${medida.motivo && medida.motivo !== 'none' ? `, limitado por ${medida.motivo === 'cpu' ? 'processador' : medida.motivo === 'bandwidth' ? 'internet' : medida.motivo}` : ''}${medida.codec ? `, codificador ${medida.codec}` : ''}`
  chip.className = 'chip medida ' + (medida.fps >= 24 && medida.h >= 500 ? 'ok' : medida.fps >= 15 ? 'atencao' : 'ruim')
}
setInterval(leQualidade, 2000)

/* ---------- checar a live (antes de começar) ---------- */
let codif = null // resultado do teste do codificador
async function testaCodificador() {
  const c = new OffscreenCanvas(640, 360), g = c.getContext('2d')
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360; const gc = cv.getContext('2d')
  let n = 0; const tm = setInterval(() => { n++; gc.fillStyle = `hsl(${n * 7 % 360},70%,45%)`; gc.fillRect(0, 0, 640, 360) }, 33)
  const s = cv.captureStream(30), a = new RTCPeerConnection(), b = new RTCPeerConnection()
  try {
    a.onicecandidate = e => e.candidate && b.addIceCandidate(e.candidate); b.onicecandidate = e => e.candidate && a.addIceCandidate(e.candidate)
    const tr = a.addTransceiver(s.getVideoTracks()[0], { direction: 'sendonly' })
    const cods = RTCRtpSender.getCapabilities('video').codecs
    tr.setCodecPreferences([...cods.filter(x => /h264/i.test(x.mimeType)), ...cods.filter(x => !/h264/i.test(x.mimeType))])
    await a.setLocalDescription(); await b.setRemoteDescription(a.localDescription); await b.setLocalDescription(); await a.setRemoteDescription(b.localDescription)
    await new Promise(r => setTimeout(r, 4000))
    let out = null; (await a.getStats()).forEach(x => { if (x.type === 'outbound-rtp' && x.kind === 'video') out = x })
    const impl = out?.encoderImplementation || '', hw = out?.powerEfficientEncoder === true || /vaapi|v4l2|mediafoundation|videotoolbox|hardware|external/i.test(impl)
    return { impl: impl || 'desconhecido', hw, h264: /h264/i.test(cods.map(x => x.mimeType).join()) }
  } catch { return { impl: 'falhou', hw: false } } finally { clearInterval(tm); a.close(); b.close(); void g }
}
const ITENS = () => {
  const n = comp.niveis(), ela = live?.quem('ela').length > 0, cel = live?.quem('cam').length > 0
  const dbs = v => 20 * Math.log10(Math.max(v, 1e-6))
  return [
    ['Codificador de vídeo', codif == null ? ['espera', 'Testando…'] : codif.hw ? ['ok', `Placa de vídeo (${codif.impl}). O processador fica livre.`] : ['erro', `Está no processador (${codif.impl}). Feche o Chrome inteiro e abra de novo para ligar a placa; confira em chrome://gpu.`]],
    ['Temperatura', temp == null ? ['aviso', 'Sem leitura. Rode <code>node scripts/live-local.mjs</code>.'] : temp >= 93 ? ['erro', `${temp} °C: o PC está se freando. Deixe esfriar, use uma base com ventoinha ou a economia.`] : temp >= 85 ? ['aviso', `${temp} °C: quente. Dá para seguir; a proteção baixa a qualidade se passar de 93 °C.`] : ['ok', `${temp} °C`]],
    ['Imagem do jogo', capJogo ? ['ok', `Capturando: ${esc(capJogo.getVideoTracks()[0]?.label || 'janela')}`] : ['erro', 'Clique em <b>Capturar janela do jogo</b> e escolha o Greenlight (deixe a janela dele aberta, pode ficar atrás).']],
    ['Som do jogo', !n.jogo.tem ? ['erro', 'Sem entrada. Deixe <code>node scripts/live-local.mjs</code> aberto, escolha o Greenlight em <b>Programa do jogo</b> e clique em <b>Isolar</b>.'] : dbs(n.jogo.rms) > -55 ? ['ok', 'Chegando som do jogo.'] : ['aviso', 'Entrada certa, mas sem som agora. Faça algum barulho no jogo.']],
    ['Seu microfone', !n.mic.tem ? ['erro', 'Escolha o microfone em <b>Fontes</b>.'] : mudos.mic ? ['aviso', 'Está mudo (tecla M).'] : dbs(n.mic.rms) > -50 ? ['ok', 'Ouvindo você.'] : ['aviso', 'Fale alguma coisa para testar.']],
    ['Câmera do celular', cel ? ['ok', $('#camInfo').textContent] : ['erro', 'Abra o link da câmera no celular (aba <b>links</b>).']],
    [`${LIVE.ela} na live`, ela ? (medida ? [medida.fps >= 24 ? 'ok' : 'aviso', `Chegando ${medida.h}p a ${medida.fps} fps${medida.rtt != null ? `, ${medida.rtt} ms` : ''}.`] : ['espera', 'Conectando…']) : ['aviso', 'Ainda não entrou. Mande o link dela (aba <b>links</b>).']],
    ['Rádio', !filaSnap.itens.length ? ['aviso', 'Playlist ainda carregando.'] : (() => {
      const lista = `${esc(filaSnap.nome || 'Playlist')}: ${filaSnap.itens.length} músicas`, a = avaliaTeste()
      return a ? [a.cls, `${lista}. Volume: ${a.txt.toLowerCase()} (${Math.abs(Math.round(a.dif))} dB ${a.dif < 0 ? 'abaixo' : 'acima'} da voz).`] : ['aviso', `${lista}. Clique em <b>Testar o som</b> no mixer para conferir o volume real.`]
    })()],
  ]
}
let checando = 0
function pintaCheck() {
  $('#listaCheck').innerHTML = ITENS().map(([t, [tipo, txt]]) => `<div class="check ${tipo}">${ic({ ok: 'circle-check', aviso: 'triangle-alert', erro: 'circle-x', espera: 'circle-dashed' }[tipo])}<div><b>${esc(t)}</b><span>${txt}</span></div></div>`).join('')
}
$('#btnChecar').onclick = async () => {
  $('#janCheck').hidden = false; pintaCheck()
  clearInterval(checando); checando = setInterval(pintaCheck, 1000)
  if (!codif) { codif = await testaCodificador(); pintaCheck() }
}
const fechaCheck = () => { $('#janCheck').hidden = true; clearInterval(checando) }
$('#fechaCheck').onclick = fechaCheck
$('#janCheck').onclick = e => { if (e.target.id === 'janCheck') fechaCheck() }
addEventListener('keydown', e => { if (e.key === 'Escape') fechaCheck() })

est.envio = { modo: modoTela() ? 'tela' : 'pc', atraso: +$('#atraso').value }; est.camAj = { ...camAj }
palco.estado(est, Date.now()); pinta(); pintaAtalhos()
if (modoTela()) { comp.parar(true); montaStreams(); antigos = [streamDireto, streamCam].filter(Boolean); previaEnvio() }
conecta().catch(e => { console.error(e); toast('Não consegui abrir a sala da live', 6000) })

// testes (tests/live.py): ?debug expõe as peças
if (new URLSearchParams(location.search).has('debug')) window.__estudio = { comp, palco, est, cena, muda, radio }

// recarregar ou fechar o estúdio com gente assistindo corta a live: o navegador pergunta antes
addEventListener('beforeunload', e => { if (live?.publico().length) { e.preventDefault(); e.returnValue = '' } })
