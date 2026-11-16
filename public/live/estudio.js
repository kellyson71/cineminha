/* Estúdio: captura o jogo, recebe a câmera do celular, junta tudo num vídeo só e transmite para ela.
   Manda o estado (cena, ligação, rádio, pix) e mostra o retorno igualzinho ao que ela vê. */
import LIVE from './config.js'
import { criaPalco, reais, relogio } from './palco.js'
import { entraLive, codigoDaUrl, novoCodigo } from './rede.js'
import { criaCompositor, QUALIDADES } from './compositor.js'
import { criaPlayer, criaRadioEstudio, buscaMusica, minutos } from './radio.js'
import { somPix, somLinha, falaPix, medidor, retomaAudio, ABERTURAS, vozValida } from './sons.js'
import { ic, poeIcones } from './icones.js'

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
$('#linkEla').textContent = `${base}?c=${codigo}`
// no PC de casa (localhost) o celular precisa do https da rede: node scripts/https-local.mjs
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
  camPos: { canto: 'br', tamanho: 'm', oculta: false, ...(pref.camPos || {}) }, chatNaTela: !!pref.chatNaTela, lancNaTela: !!pref.lancNaTela, enquete: null,
  meta: { on: !!pref.metaOn, titulo: pref.metaTitulo || LIVE.meta.titulo, alvo: pref.metaAlvo || LIVE.meta.alvo, atual: pref.metaAtual || 0 },
  carteira: null,
}
const palco = criaPalco($('#palco'), { composto: true, leve: pref.previaLeve !== false })
const player = criaPlayer({ volume: 0, aoAcabar: () => radio.proxima(), aoDuracao: (id, d) => radio.duracao(id, d) })
let live = null
const radioToca = () => !!est.radio && (est.cena !== 'jogo' || mix.radioJogo)
// volume da rádio que ela recebe (0..1): seu nível no mixer, mais baixo no jogo
const radioNivel = () => mix.radioMudo ? 0 : mix.radio * (est.cena === 'jogo' ? .5 : 1)
function manda(alvo) { live?.acoes.estado.send({ ...est, relogio: Date.now() }, alvo) }
function muda(ch) {
  Object.assign(est, ch)
  est.mix = { radio: radioNivel() }
  palco.estado(est, Date.now())
  player.segue(est.radio, radioToca())
  monitor()
  manda()
  pinta()
}
const monitor = () => player.volume((pref.rMon ?? 60) * radioNivel() * (mix.abaixa ? .35 : 1))
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
$('#qualidade').onchange = e => { pref.qualidade = +e.target.value; salva(); comp.qualidade(+e.target.value); ajustaEnvio(); toast(`Transmissão em ${e.target.value}p`) }
// retorno de som: ouvir no fone exatamente o que vai pra ela (voz + jogo, depois do mixer e do atraso)
const retorno = new Audio(); retorno.autoplay = true
const retVol = $('#retVol'); retVol.value = pref.retVol ?? 80
retVol.oninput = () => { pref.retVol = +retVol.value; salva(); retorno.volume = retVol.value / 100 }
$('#btnOuvir').onclick = () => {
  const on = $('#btnOuvir').getAttribute('aria-pressed') !== 'true'
  $('#btnOuvir').setAttribute('aria-pressed', on); retVol.hidden = !on
  if (on) {
    retorno.srcObject = new MediaStream(comp.saida.getAudioTracks()); retorno.volume = retVol.value / 100; retorno.play().catch(() => {})
    toast('Use fone: no alto-falante o microfone pega o retorno e vira eco. O jogo vai soar duas vezes (direto e no retorno).', 5000)
  } else { retorno.pause(); retorno.srcObject = null }
}
let capJogo = null, somJogo = null, mic = null
$('#btnJogo').onclick = async () => {
  const [w, h] = QUALIDADES[pref.qualidade] || QUALIDADES[720]
  const s = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 30, max: 30 }, width: { max: w }, height: { max: h } },
    audio: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include',
  }).catch(() => null)
  if (!s) return
  capJogo?.getTracks().forEach(t => t.stop())
  capJogo = s
  const vt = s.getVideoTracks()[0]; vt.contentHint = 'motion'
  comp.jogo(vt)
  $('#infoJogo').textContent = vt.label || 'capturando'
  $('#btnJogo').textContent = 'Trocar janela'
  vt.addEventListener('ended', () => { if (capJogo === s) { comp.jogo(null); capJogo = null; $('#infoJogo').textContent = 'sem captura do jogo'; $('#btnJogo').textContent = 'Capturar janela do jogo' } })
}
async function entradas() {
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput')
  const op = (sel, atual, vazio) => { sel.innerHTML = `<option value="">${vazio}</option>` + devs.map(d => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Entrada de som')}</option>`).join(''); sel.value = devs.some(d => d.deviceId === atual) ? atual : '' }
  const prog = devs.find(d => /Cineminha-Programa/i.test(d.label))
  op($('#selSom'), prog?.deviceId || pref.som, 'Sem som do jogo')
  op($('#selMic'), pref.mic || devs.find(d => d.deviceId === 'default')?.deviceId, 'Sem microfone')
  $('#dicaSom').hidden = !!prog
  return { prog }
}
const pegaEntrada = (id, voz) => navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: id }, echoCancellation: voz, noiseSuppression: voz, autoGainControl: false, channelCount: voz ? 1 : 2, sampleRate: 48000 } })
async function usaSom(id) {
  somJogo?.getTracks().forEach(t => t.stop()); somJogo = null
  if (id) somJogo = await pegaEntrada(id, false).catch(() => { toast('Não consegui abrir essa entrada de som'); return null })
  comp.somJogo(somJogo?.getAudioTracks()[0] || null)
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
const aplicaAtraso = () => { $('#atrasoTxt').textContent = atraso.value + ' ms'; comp.atraso(+atraso.value) }
atraso.oninput = () => { pref.atraso = +atraso.value; salva(); aplicaAtraso() }; aplicaAtraso()
$('#btnCam').onclick = e => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); comp.camLigada(on); muda({ cam: on && !!camTrilha }) }

navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {}).finally(async () => {
  const { prog } = await entradas()
  await usaMic($('#selMic').value)
  if (prog) await usaSom(prog.deviceId)
  else if ($('#selSom').value) await usaSom($('#selSom').value)
})
navigator.mediaDevices.addEventListener('devicechange', async () => { const antes = $('#selSom').value; const { prog } = await entradas(); if (prog && antes !== prog.deviceId) { $('#selSom').value = prog.deviceId; usaSom(prog.deviceId); toast('Som do jogo conectado') } })

/* ---------- ajustes: câmera do celular ---------- */
const camAj = { rot: 0, espelho: false, zoom: 1, cx: .5, cy: .5, cheia: 'auto', ...(pref.camAjuste || {}) }
function aplicaCam(ch = {}) {
  Object.assign(camAj, ch); pref.camAjuste = camAj; salva(); comp.ajusteCam(camAj)
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
}
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
    const rv = radioToca() && !est.radio?.pausado ? radioNivel() * (mix.abaixa ? .35 : 1) : 0
    med.radio.barra.style.clipPath = `inset(0 ${100 - rv * 100}% 0 0)`
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
const rMon = $('#rMon'); rMon.value = pref.rMon ?? 60
const aplicaMon = () => { $('#rMonTxt').textContent = rMon.value + '%'; monitor() }
rMon.oninput = () => { pref.rMon = +rMon.value; salva(); aplicaMon() }; aplicaMon()

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
function poeMsg(m) {
  msgs.push(m); if (msgs.length > 120) msgs.shift()
  const d = document.createElement('div')
  if (m.pix) { d.className = 'pixmsg'; d.innerHTML = `<strong>pix de ${reais(m.pix)}</strong><b style="color:#ff9ccb"></b>: `; d.querySelector('b').textContent = LIVE.ela; d.append(m.txt || '') }
  else if (m.ped) { d.className = 'pedmsg'; d.innerHTML = `${ic('music')} <b style="color:#ff9ccb"></b> pediu `; d.querySelector('b').textContent = LIVE.ela; d.append(m.txt) }
  else if (m.sis) { d.className = 'sis'; d.textContent = m.txt }
  else { d.className = m.de === 'ele' ? 'eu' : 'ela'; d.innerHTML = '<b></b> '; d.querySelector('b').textContent = m.de === 'ele' ? LIVE.streamer : LIVE.ela; d.append(m.txt) }
  const box = $('#msgs'), embaixo = box.scrollHeight - box.scrollTop - box.clientHeight < 40
  box.append(d); if (embaixo) box.scrollTop = box.scrollHeight
  if (!m.sis && m.de !== 'ele') avisaAba('chat', '#bChat')
  if (!m.sis && !m.ped && !m.hist) palco.chat({ de: m.pix ? 'ela' : m.de, txt: m.txt, pix: m.pix })
}
$('#compor').onsubmit = e => {
  e.preventDefault()
  const txt = $('#msg').value.trim().slice(0, 300); if (!txt) return
  const m = { id: crypto.randomUUID(), de: 'ele', txt, ts: Date.now() }
  poeMsg(m); live?.acoes.chat.send(m); $('#msg').value = ''
  est.stats.msgs++; manda()
}
function recebePix(p) {
  const valor = Math.round(+p?.valor * 100) / 100
  if (!(valor > 0 && valor <= 10000)) return
  if (cart.modo === 'tempo' && valor > saldo() + 1e-9) { live?.acoes.chat.send({ id: crypto.randomUUID(), de: 'sis', txt: `Saldo insuficiente: você tem ${reais(saldo())}` }); return }
  if (cart.modo === 'tempo') { cart.gasto += valor; salvaCart() }
  const msg = String(p.msg || '').slice(0, 140)
  const ev = { id: String(p.id || crypto.randomUUID()).slice(0, 40), valor, msg, voz: vozValida(p.voz) ? p.voz : 'normal', abre: Math.floor(Math.random() * ABERTURAS.length) }
  if (est.meta.on) { est.meta = { ...est.meta, atual: Math.round(((est.meta.atual || 0) + valor) * 100) / 100 }; pref.metaAtual = est.meta.atual; salva() }
  est.stats.pix = Math.round((est.stats.pix + valor) * 100) / 100
  poeMsg({ pix: valor, txt: msg })
  live?.acoes.pixtoca.send(ev)
  palco.pix(ev); somPix(); setTimeout(() => falaPix(LIVE.ela, ev.valor, ev.msg, ev.voz, ev.abre), 1100)
  muda({ meta: { ...est.meta }, carteira: estCart() }); pintaPix()
}
let ultimoPedido = 0
function recebePedido(p) {
  if (!/^[\w-]{11}$/.test(p?.id || '') || Date.now() - ultimoPedido < 4000) return
  ultimoPedido = Date.now()
  const it = radio.adiciona({ k: 'yt', id: p.id, t: String(p.t || '').slice(0, 120), a: String(p.a || '').slice(0, 80), c: capaOk(p.c), d: +p.d || 0, pedido: LIVE.ela })
  const txt = `${it.t}${it.a ? ' · ' + it.a : ''}`
  poeMsg({ ped: true, txt })
  avisaAba('radio', '#bRadio')
  toast(`${LIVE.ela} pediu ${it.t}`, 4000)
  live?.acoes.chat.send({ id: crypto.randomUUID(), de: 'sis', txt: `Pedido na fila: ${txt}` })
}

/* ---------- ligação: a voz dela ---------- */
let paraMedir = null
const somDela = new Audio(); somDela.autoplay = true
function vozChegou(stream) {
  somDela.srcObject = stream; somDela.play().catch(() => {})
  paraMedir?.(); paraMedir = medidor(stream, v => palco.setNivel(v))
}

/* ---------- rede ---------- */
const camDe = new Map()
let camTrilha = null
async function conecta() {
  live = await entraLive(codigo, 'estudio')
  const chips = () => {
    $('#chipEla').classList.toggle('on', live.quem('ela').length > 0)
    $('#chipCam').classList.toggle('on', live.quem('cam').length > 0)
    $('#infoSaida').textContent = live.quem('ela').length ? `transmitindo para ${LIVE.ela}` : `esperando ${LIVE.ela} entrar`
    if (!live.quem('cam').length) $('#camInfo').textContent = 'desconectada'
  }
  live.on('papel', (id, p) => {
    chips()
    if (p === 'ela') {
      live.manda(comp.saida, id, { live: 1 })
      manda(id); live.acoes.mix.send({ abaixa: mix.abaixa }, id)
      live.acoes.chat.send({ hist: msgs.filter(m => !m.sis).slice(-80) }, id)
      setTimeout(ajustaEnvio, 1500)
      poeMsg({ sis: true, txt: `${LIVE.ela} entrou na live` })
    }
    if (p === 'cam') poeMsg({ sis: true, txt: 'Câmera do celular conectada' })
  })
  live.on('saiu', (id, p) => {
    chips()
    if (p === 'ela') { poeMsg({ sis: true, txt: `${LIVE.ela} saiu da live` }); if (est.linha && !live.quem('ela').length) { muda({ linha: false }); somLinha(false) } }
    if (camDe.get(id)) { camDe.delete(id); if (!camDe.size) { camTrilha = null; comp.cam(null); muda({ cam: false }) } }
  })
  live.on('stream', (stream, id, meta) => {
    if (meta.cam) {
      const t = stream.getVideoTracks()[0]; if (!t) return
      camDe.set(id, t); camTrilha = t; comp.cam(t)
      muda({ cam: $('#btnCam').getAttribute('aria-pressed') === 'true' })
    }
    if (meta.voz) vozChegou(stream)
  })
  live.acoes.camcmd.on((c, id) => {
    if (live.papeis.get(id) !== 'cam' || !c?.estado) return
    const { frente, w, h } = c.estado
    $('#camInfo').textContent = `${frente ? 'frontal' : 'traseira'} · ${w}×${h}${h > w ? ' (em pé)' : ''}`
  })
  live.acoes.chat.on((m, id) => {
    if (live.papeis.get(id) !== 'ela' || typeof m?.txt !== 'string') return
    const msg = { id: String(m.id || '').slice(0, 40), de: 'ela', txt: m.txt.slice(0, 300), ts: Date.now() }
    poeMsg(msg); est.stats.msgs++
    live.acoes.chat.send(msg)
    manda()
  })
  live.acoes.pix.on((p, id) => { if (live.papeis.get(id) === 'ela') recebePix(p) })
  live.acoes.pedido.on((p, id) => { if (live.papeis.get(id) === 'ela') recebePedido(p) })
  live.acoes.voto.on((v, id) => { if (live.papeis.get(id) === 'ela') recebeVoto(v, id) })
  live.acoes.linha.on((l, id) => {
    if (live.papeis.get(id) !== 'ela') return
    const on = !!l?.on
    if (on === est.linha) return
    somLinha(on); muda({ linha: on })
    if (!on) { paraMedir?.(); paraMedir = null; palco.setNivel(0) }
  })
  chips()
}

// qualidade de envio: H.264 (circuito de vídeo), bitrate de acordo com a qualidade escolhida
async function ajustaEnvio() {
  const meus = comp.saida.getTracks()
  const pcs = live?.room.getPeers?.() || {}
  const kbps = (protegendo ? 1800 : pref.qualidade === 1080 ? 6000 : 3500) * 1000
  for (const pc of (pcs instanceof Map ? pcs.values() : Object.values(pcs))) for (const s of pc.getSenders()) {
    if (!s.track || !meus.includes(s.track)) continue
    const p = s.getParameters(); if (!p.encodings?.length) continue
    const video = s.track.kind === 'video'
    Object.assign(p.encodings[0], { maxBitrate: video ? kbps : 160_000, priority: 'high', networkPriority: 'high' }, video ? { maxFramerate: 30 } : {})
    if (video) p.degradationPreference = 'maintain-framerate'
    await s.setParameters(p).catch(() => {})
  }
}


/* ---------- meta de pix e dinheiro dela ---------- */
// carteira: 'infinito' ou 'tempo' (ganha R$ a cada minuto assistindo com a live no ar); fica salva entre as lives
const cart = { modo: LIVE.carteira.modo, porMinuto: LIVE.carteira.porMinuto, inicial: LIVE.carteira.inicial, ganho: 0, gasto: 0, seg: 0, ...(pref.carteira || {}) }
const salvaCart = () => { pref.carteira = { ...cart }; salva() }
const saldo = () => Math.max(0, Math.round((cart.inicial + cart.ganho - cart.gasto) * 100) / 100)
const estCart = () => ({ modo: cart.modo, saldo: saldo(), porMinuto: cart.porMinuto, falta: 60 - cart.seg })
est.carteira = estCart()
setInterval(() => {
  if (cart.modo !== 'tempo' || !est.inicio || !live?.quem('ela').length) return
  cart.seg++
  if (cart.seg >= 60) {
    cart.seg = 0; cart.ganho = Math.round((cart.ganho + cart.porMinuto) * 100) / 100; salvaCart()
    muda({ carteira: estCart() }); pintaPix()
  } else if (cart.seg % 15 === 0) { salvaCart(); est.carteira = estCart() }
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
async function leTemp() {
  // publicado (https), o Chrome pede permissão de "rede local" para o site falar com o seu PC: é só permitir
  const r = await fetch('http://localhost:8792/sensores', { cache: 'no-store', targetAddressSpace: 'loopback' }).then(r => r.json()).catch(() => null)
  semSensor = r ? 0 : semSensor + 1
  temp = r?.temp ?? null
  const chip = $('#chipTemp')
  chip.querySelector('span').textContent = temp == null ? 'sem sensor' : `${temp} °C${protegendo ? ' · protegendo' : ''}`
  chip.className = 'chip medida ' + (temp == null ? '' : temp >= 93 ? 'ruim' : temp >= 85 ? 'atencao' : 'ok')
  if (temp == null || pref.protecao === false) return
  quente = temp >= 93 ? quente + 1 : 0
  frio = temp <= 82 ? frio + 1 : 0
  if (!protegendo && quente >= 3) {
    protegendo = true; comp.qualidade(540); comp.fps(24); ajustaEnvio()
    toast('PC muito quente: transmissão em 540p até esfriar', 5000)
  } else if (protegendo && frio >= 20) {
    protegendo = false; comp.qualidade(pref.qualidade || 720); comp.fps(30); ajustaEnvio()
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
  for (const pc of (pcs instanceof Map ? pcs.values() : Object.values(pcs))) {
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
    ['Temperatura', temp == null ? ['aviso', 'Sem leitura. Rode <code>node scripts/https-local.mjs</code>.'] : temp >= 93 ? ['erro', `${temp} °C: o PC está se freando. Deixe esfriar, use uma base com ventoinha ou a economia.`] : temp >= 85 ? ['aviso', `${temp} °C: quente. Dá para seguir; a proteção baixa a qualidade se passar de 93 °C.`] : ['ok', `${temp} °C`]],
    ['Imagem do jogo', capJogo ? ['ok', `Capturando: ${esc(capJogo.getVideoTracks()[0]?.label || 'janela')}`] : ['erro', 'Clique em <b>Capturar janela do jogo</b> e escolha o Greenlight (deixe a janela dele aberta, pode ficar atrás).']],
    ['Som do jogo', !n.jogo.tem ? ['erro', 'Sem entrada. Rode <code>node scripts/live-som.mjs</code> com o Greenlight tocando e escolha <b>Cineminha-Programa</b>.'] : dbs(n.jogo.rms) > -55 ? ['ok', 'Chegando som do jogo.'] : ['aviso', 'Entrada certa, mas sem som agora. Faça algum barulho no jogo.']],
    ['Seu microfone', !n.mic.tem ? ['erro', 'Escolha o microfone em <b>Fontes</b>.'] : mudos.mic ? ['aviso', 'Está mudo (tecla M).'] : dbs(n.mic.rms) > -50 ? ['ok', 'Ouvindo você.'] : ['aviso', 'Fale alguma coisa para testar.']],
    ['Câmera do celular', cel ? ['ok', $('#camInfo').textContent] : ['erro', 'Abra o link da câmera no celular (aba <b>links</b>).']],
    [`${LIVE.ela} na live`, ela ? (medida ? [medida.fps >= 24 ? 'ok' : 'aviso', `Chegando ${medida.h}p a ${medida.fps} fps${medida.rtt != null ? `, ${medida.rtt} ms` : ''}.`] : ['espera', 'Conectando…']) : ['aviso', 'Ainda não entrou. Mande o link dela (aba <b>links</b>).']],
    ['Rádio', filaSnap.itens.length ? ['ok', `${esc(filaSnap.nome || 'Playlist')}: ${filaSnap.itens.length} músicas`] : ['aviso', 'Playlist ainda carregando.']],
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

palco.estado(est, Date.now()); pinta(); pintaAtalhos()
conecta().catch(e => { console.error(e); toast('Não consegui abrir a sala da live', 6000) })

// testes (tests/live.py): ?debug expõe as peças
if (new URLSearchParams(location.search).has('debug')) window.__estudio = { comp, palco, est, cena, muda, radio }
