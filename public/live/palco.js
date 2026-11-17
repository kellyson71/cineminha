/* Palco da live: a tela 1920×1080 com as cenas e os efeitos.
   O vídeo do jogo e a câmera chegam como streams; cena, ligação, pix e rádio chegam como estado.
   A página dela e o retorno do estúdio usam o mesmo palco, então ele vê exatamente o que ela vê. */
import LIVE from './config.js'
import { camRect } from './layout.js'
import { fotoDe, corDe } from './pessoas.js'

const ICONES = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="pl-pix" viewBox="0 0 48 48"><path fill="currentColor" d="M35.6 34.4a5.6 5.6 0 0 1-4-1.65l-5.77-5.77a1.1 1.1 0 0 0-1.52 0l-5.79 5.79a5.6 5.6 0 0 1-4 1.65h-1.13l7.3 7.3a5.84 5.84 0 0 0 8.26 0l7.32-7.32zM14.52 13.56a5.6 5.6 0 0 1 4 1.65l5.79 5.79a1.07 1.07 0 0 0 1.52 0l5.77-5.77a5.6 5.6 0 0 1 4-1.65h.7l-7.32-7.32a5.84 5.84 0 0 0-8.26 0l-7.3 7.3zM41.74 19.87l-4.43-4.43a.85.85 0 0 1-.31.06h-2a3.97 3.97 0 0 0-2.78 1.15L26.44 22.43a2.75 2.75 0 0 1-3.9 0l-5.79-5.79a3.97 3.97 0 0 0-2.78-1.15h-2.47a.83.83 0 0 1-.3-.06l-4.45 4.45a5.84 5.84 0 0 0 0 8.26l4.45 4.45a.83.83 0 0 1 .3-.06h2.47a3.97 3.97 0 0 0 2.78-1.15l5.79-5.79a2.82 2.82 0 0 1 3.9 0l5.77 5.77a3.97 3.97 0 0 0 2.78 1.15H37a.85.85 0 0 1 .31.06l4.43-4.43a5.84 5.84 0 0 0 0-8.26z"/></symbol>
<symbol id="pl-tel" viewBox="0 0 24 24"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></symbol>
<symbol id="pl-nome" viewBox="0 0 760 300"><g font-family="Yellowtail, cursive" font-size="210" text-anchor="middle" stroke-linejoin="round" stroke-linecap="round">
<text x="380" y="205" fill="#1c0830" stroke="#1c0830" stroke-width="58">${LIVE.streamer}</text>
<text x="380" y="198" fill="#f67a9b" stroke="#f67a9b" stroke-width="34">${LIVE.streamer}</text>
<text x="380" y="198" fill="#fff" stroke="#fff" stroke-width="7">${LIVE.streamer}</text></g></symbol>
</defs></svg>`
const nome = `<svg class="assinatura" viewBox="0 0 760 300" aria-label="${LIVE.streamer}"><use href="#pl-nome"/></svg>`
const palmeiras = lista => lista.map(([src, css, cls = '', v = 9, d = 0]) => `<img class="palm ${cls}" src="assets/${src}.webp" alt="" style="${css};--v:${v}s;--d:${d}s">`).join('')
const ave = (y, w, v, d) => `<div class="ave" style="--y:${y}px;--w:${w}px;--v:${v}s;--d:${d}s"><svg viewBox="0 0 40 16"><path class="cima" d="M2 12 Q10 1 20 10 Q30 1 38 12"/><path class="baixo" d="M2 6 Q10 15 20 8 Q30 15 38 6"/></svg></div>`
const cenario = (palms, aves) => `<div class="sol"></div><div class="aves">${aves}</div>${palms}<div class="brisa"></div>`
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const f2 = n => String(n).padStart(2, '0')
export const relogio = s => { s = Math.max(0, Math.floor(s)); return `${f2(s / 3600 | 0)}:${f2(s / 60 % 60 | 0)}:${f2(s % 60)}` }
export const reais = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const HTML = `${ICONES}
<section class="cena" data-cena="jogo">
  <div class="sem-jogo"><span>o jogo aparece aqui</span></div>
  <video class="jogo" autoplay playsinline></video>
  <div class="cam sem">
    <div class="moldura"><video autoplay playsinline muted></video><div class="borda"></div></div>
    <div class="selo-vivo"><i></i>ao vivo</div>
    ${nome.replace('class="assinatura"', 'class="assinatura nome"')}
    <div class="tempo" data-tempo>00:00:00</div>
  </div>
  <div class="chamada"></div>
  <div class="moldura-cheia">
    <div class="selo-vivo"><i></i>ao vivo</div>
    ${nome.replace('class="assinatura"', 'class="assinatura nome"')}
    <div class="tempo" data-tempo2>00:00:00</div>
  </div>
  <div class="aviso"><span class="ico"><svg><use href="#pl-tel"/></svg></span><span><b data-aviso-nome>${esc(LIVE.ela)}</b> <span data-aviso>entrou na linha</span></span></div>
</section>

<section class="cena comecando" data-cena="comecando">
  <div class="arte" style="background-image:url(assets/fundo-orla.webp)"></div>
  ${cenario(palmeiras([
    ['palmeira-b', 'left:260px;height:620px', 'fundo', 13, -4],
    ['palmeira-c', 'right:330px;height:560px', 'fundo espelho', 14, -9],
    ['palmeira-c', 'left:-70px;height:1010px;filter:brightness(.5) saturate(1.3) hue-rotate(10deg)', '', 9, 0],
    ['palmeira-a', 'right:-100px;height:990px;filter:brightness(.78) saturate(1.2)', '', 10, -5],
  ]), ave(170, 46, 38, -6) + ave(215, 34, 44, -20) + ave(140, 28, 52, -33))}
  <div class="vinheta"></div>
  <div class="centro">
    ${nome.replace('class="assinatura"', 'class="assinatura entra"')}
    <div class="linha1 entra"><span class="adesivo">ao vivo em</span><img src="assets/gta6-logo.webp" alt="Grand Theft Auto VI"></div>
    <div class="contagem adesivo entra" data-contagem>já já</div>
    <div class="chamada entra">pega a pipoca, a live já vai começar</div>
  </div>
</section>

<section class="cena lancamento" data-cena="lancamento">
  <div class="arte" style="background-image:url(assets/fundo-ocean.webp)"></div>
  ${cenario(palmeiras([
    ['palmeira-c', 'left:-80px;height:1040px;filter:brightness(.5) saturate(1.3)', '', 9, -1],
    ['palmeira-a', 'right:-120px;height:1020px;filter:brightness(.7) saturate(1.2)', 'espelho', 10, -6],
  ]), ave(120, 42, 41, -8) + ave(160, 30, 49, -27))}
  <div class="vinheta"></div>
  <div class="centro">
    <img class="logo-vi entra" src="assets/gta6-logo.webp" alt="Grand Theft Auto VI">
    <div class="chega adesivo entra" data-chega>chega em</div>
    <div class="relogio-lanc entra" data-lanc>
      <div><b data-l="d">00</b><span>dias</span></div><div><b data-l="h">00</b><span>horas</span></div>
      <div><b data-l="m">00</b><span>min</span></div><div><b data-l="s">00</b><span>seg</span></div>
    </div>
    <div class="chamada entra" data-lanc-txt>${esc(LIVE.lancamentoTexto || 'e a gente vai jogar juntos na hora que liberar')}</div>
  </div>
  <div class="confete" data-confete></div>
</section>

<section class="cena plantao" data-cena="volto">
  <div class="arte" style="background-image:url(assets/fundo-ocean.webp)"></div>
  ${cenario(palmeiras([
    ['palmeira-c', 'left:-120px;height:1080px;filter:brightness(.45) saturate(1.3)', '', 9, -2],
    ['palmeira-a', 'right:-150px;height:1060px;filter:brightness(.6) saturate(1.2)', 'espelho', 11, -7],
  ]), ave(60, 40, 40, -12) + ave(40, 30, 47, -30))}
  <div class="tela-tv">
    <div class="selos"><span class="urgente">urgente</span><span class="marca-tv">jornal da orla</span></div>
    <div class="manchete"><small>Plantão · ${esc(LIVE.streamer)} saiu por um instante</small><h2 data-manchete></h2></div>
  </div>
  <div class="volto adesivo"><span>volto</span> <span>já</span></div>
  <div class="rodape"><span class="tag">última hora</span><div class="corre"><span data-corre></span></div></div>
</section>

<section class="cena fim" data-cena="fim">
  <div class="arte" style="background-image:url(assets/fundo-orla.webp)"></div>
  <div class="estrelas" data-estrelas></div>
  <div class="centro">
    ${nome}
    <div class="titulo adesivo">fim da live</div>
    <div class="dados"><span><b data-fim-tempo>00:00:00</b> no ar</span><span><b data-fim-pix>R$ 0,00</b> em pix de mentira</span><span><b data-fim-msgs>0</b> mensagens</span></div>
    <div class="dedicatoria">Hoje a live foi só pra <em>${esc(LIVE.ela)}</em></div>
  </div>
</section>

<div class="tocando"><div class="disco-box"><div class="disco"></div><img class="capa" alt=""></div>
  <div class="info"><small>Tocando agora <span class="eq"><i></i><i></i><i></i><i></i></span></small><div class="rolo"><b data-musica></b></div><span class="artista" data-artista></span><div class="barra"><i></i></div></div></div>

<div class="lanc-mini"><img src="assets/vi.webp" alt=""><div><small data-lm-txt>GTA VI chega em</small><b data-lm>0d 00:00:00</b></div></div>

<div class="enquete">
  <div class="enq-tempo"><i data-enq-t></i></div>
  <small class="enq-rot">Enquete da live <span data-enq-status></span></small>
  <h3 data-enq-p></h3>
  <ol data-enq-ops></ol>
  <p class="enq-pe" data-enq-pe></p>
</div>

<div class="chat-tela"></div>

<div class="meta">
  <div class="meta-ic"><svg><use href="#pl-pix"/></svg></div>
  <div class="meta-txt"><small data-meta-rot>Meta da live</small><b data-meta-t></b>
    <div class="meta-barra"><i data-meta-b></i></div></div>
  <div class="meta-num" data-meta-n></div>
  <div class="meta-festa" data-meta-festa></div>
</div>

<div class="pix">
  <div class="icone"><svg><use href="#pl-pix"/></svg></div>
  <div class="faixa"><div class="conteudo"><small>Pix na live</small><div class="quem"><em data-pix-nome>${esc(LIVE.ela)}</em> mandou <span class="valor"></span></div><div class="msg"></div></div></div>
  <div class="brilho"></div>
</div>`

export function criaPalco(host, { comSom = false, composto = false, leve = false } = {}) {
  host.classList.add('palco-host')
  const palco = document.createElement('div')
  palco.className = 'palco' + (composto ? ' composto' : '') + (leve ? ' leve' : '')
  palco.innerHTML = HTML
  host.append(palco)
  const $ = s => palco.querySelector(s), $$ = s => [...palco.querySelectorAll(s)]

  const ajusta = () => { const s = Math.min(host.clientWidth / 1920, host.clientHeight / 1080) || 0; palco.style.transform = `translate(-50%,-50%) scale(${s})` }
  new ResizeObserver(ajusta).observe(host); ajusta()

  // estrelas do fim e faíscas do pix
  for (let i = 0; i < 90; i++) { const e = document.createElement('i'); e.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;opacity:${.2 + Math.random() * .7}`; $('[data-estrelas]').append(e) }
  for (let i = 0; i < 14; i++) { const e = document.createElement('i'), a = i / 14 * Math.PI * 2, r = 110 + Math.random() * 60
    e.style.setProperty('--x', Math.cos(a) * r + 'px'); e.style.setProperty('--y', Math.sin(a) * r + 'px'); if (i % 3 === 0) e.style.background = '#fff'; $('.pix .brilho').append(e) }

  const cores = ['#ff4fa3', '#ffb04a', '#3d5bd9', '#fff', '#c93fc6', '#33e1d0']
  for (let i = 0; i < 90; i++) { const e = document.createElement('i')
    e.style.cssText = `left:${Math.random() * 100}%;background:${cores[i % cores.length]};--v:${3 + Math.random() * 4}s;--d:${-Math.random() * 7}s;--x:${(Math.random() - .5) * 400}px;--r:${Math.random() * 720}deg;width:${8 + Math.random() * 10}px;height:${5 + Math.random() * 8}px`
    $('[data-confete]').append(e) }
  palco.querySelectorAll('.brisa').forEach(b => { for (let i = 0; i < 26; i++) { const e = document.createElement('i'), t = 3 + Math.random() * 9
    e.style.cssText = `left:${Math.random() * 100}%;--t:${t}px;--b:${t > 8 ? 3 : 1}px;--o:${.25 + Math.random() * .45};--v:${14 + Math.random() * 16}s;--d:${-Math.random() * 30}s;--x:${(Math.random() - .5) * 300}px`; b.append(e) } })

  // avatar dela: duas expressões (calada / falando)
  const imgs = [LIVE.fotoCalada, LIVE.fotoFalando].filter(Boolean)
  imgs.forEach(src => { const i = new Image(); i.src = src })

  // manchetes do plantão
  const manchetes = LIVE.manchetes
  $('[data-corre]').innerHTML = manchetes.map(esc).join('<b>●</b>')
  $('[data-corre]').style.setProperty('--corre', manchetes.join(' ').length * .16 + 's')
  let mi = Math.floor(Math.random() * manchetes.length)
  const h2 = $('[data-manchete]'); h2.textContent = manchetes[mi]
  setInterval(() => {
    if (st.cena !== 'volto') return
    h2.classList.add('sai')
    setTimeout(() => { mi = (mi + 1) % manchetes.length; h2.textContent = manchetes[mi]; h2.classList.remove('sai') }, 450)
  }, 9000)

  /* ---------- streams ---------- */
  const vJogo = $('video.jogo'), vCam = $('.cam video')
  let temCam = false, previaPausada = false
  vJogo.muted = !comSom
  function setJogo(stream) {
    vJogo.srcObject = stream || null
    palco.querySelector('[data-cena=jogo]').classList.toggle('tem-jogo', !!stream)
    if (stream && !previaPausada) vJogo.play().catch(() => {})
  }
  function setCam(stream) {
    temCam = !!stream
    vCam.srcObject = stream || null
    $('.cam').classList.toggle('sem', composto ? !st.cam : (!temCam || st.cam === false))
    if (stream && !previaPausada) vCam.play().catch(() => {})
  }
  const tocar = () => { if (previaPausada) return; if (vJogo.srcObject) vJogo.play().catch(() => {}); if (vCam.srcObject) vCam.play().catch(() => {}) }
  function pausaPrevia(on) {
    previaPausada = !!on
    if (previaPausada) { vJogo.pause(); vCam.pause() }
    else tocar()
  }

  /* ---------- estado ---------- */
  let st = { cena: 'comecando', inicio: 0, ate: 0, linha: false, stats: {}, radio: null }
  let deslocamento = 0, musicaPosta = false, abertoAte = 0, abertoT = 0, chegou = false // relógio do estúdio - relógio local
  const agora = () => Date.now() + deslocamento
  function estado(novo, relogioEstudio) {
    if (relogioEstudio) deslocamento = relogioEstudio - Date.now()
    const antes = st
    st = { ...st, ...novo }
    const secao = st.cena === 'camera' ? 'jogo' : st.cena // câmera cheia usa o mesmo vídeo da cena do jogo
    if (st.cena !== antes.cena || !palco.querySelector('.cena.ativa')) $$('.cena').forEach(c => c.classList.toggle('ativa', c.dataset.cena === secao))
    palco.classList.toggle('so-cam', st.cena === 'camera')
    palco.dataset.cenaAtual = st.cena
    chamada(antes)
    $('.cam').classList.toggle('sem', composto ? !st.cam : (!temCam || st.cam === false))
    // no jogo a música fica em cima da sua câmera: aberta quando troca, depois só o disquinho girando
    const r = st.radio, noJogo = st.cena === 'jogo'
    if (r && (r.yt !== antes.radio?.yt || (noJogo && antes.cena !== 'jogo'))) { abertoAte = Date.now() + 10000; clearTimeout(abertoT); abertoT = setTimeout(() => estado({}), 10100) }
    const on = !!r && !r.pausado && st.mostrarMusica !== false && (!noJogo || st.radioJogo)
    const tc = $('.tocando')
    tc.classList.toggle('na-cam', noJogo)
    tc.classList.toggle('mini', noJogo && Date.now() > abertoAte)
    tc.classList.toggle('sem-cam', noJogo && !st.cam)
    tc.classList.toggle('on', on)
    $('.tocando small').firstChild.textContent = r?.pedido ? `Pedido de ${r.pedido} ` : 'Tocando agora '
    if (r && (r.yt !== antes.radio?.yt || !musicaPosta)) {
      musicaPosta = true
      const info = $('.tocando .info'); info.classList.remove('troca'); void info.offsetWidth; info.classList.add('troca')
      $('[data-musica]').textContent = r.t || ''; $('[data-artista]').textContent = r.a || ''
      const img = $('.tocando .capa'); if (r.c) img.src = r.c
      requestAnimationFrame(() => { const rolo = $('.tocando .rolo'), b = rolo.firstElementChild, falta = rolo.clientWidth - b.scrollWidth
        rolo.classList.toggle('longo', falta < 0); b.style.setProperty('--falta', falta + 'px') })
    }
    if (st.lancamentoTexto !== antes.lancamentoTexto && st.lancamentoTexto) $('[data-lanc-txt]').textContent = st.lancamentoTexto
    posiciona()
    $('.chat-tela').classList.toggle('on', !!st.chatNaTela)
    if (st.enquete !== antes.enquete) pintaEnquete(antes.enquete)
    $('.lanc-mini').classList.toggle('on', !!st.lancNaTela && !!st.lancamento && st.cena !== 'lancamento')
    palco.classList.toggle('com-lanc', $('.lanc-mini').classList.contains('on'))
    palco.classList.toggle('com-meta', !!st.meta?.on && st.cena !== 'fim')
    pintaMeta(antes.meta)
    const s = st.stats || {}
    $('[data-fim-pix]').textContent = reais(s.pix)
    $('[data-fim-msgs]').textContent = s.msgs || 0
    tick()
  }
  function tick() {
    const t = st.inicio ? (agora() - st.inicio) / 1000 : 0
    // selo do lançamento (qualquer cena) e tempo da enquete
    if ($('.lanc-mini').classList.contains('on')) {
      const lt = Math.max(0, Math.ceil((st.lancamento - agora()) / 1000))
      $('[data-lm]').textContent = lt ? `${lt / 86400 | 0}d ${relogio(lt % 86400)}` : 'chegou!'
      $('[data-lm-txt]').textContent = lt ? `${LIVE.jogo} chega em` : `${LIVE.jogo}`
      $('.lanc-mini').classList.toggle('chegou', !lt)
    }
    tickEnquete()
    if (st.cena === 'jogo') $('[data-tempo]').textContent = relogio(t)
    else if (st.cena === 'camera') $('[data-tempo2]').textContent = relogio(t)
    else if (st.cena === 'fim' && st.fimEm) $('[data-fim-tempo]').textContent = relogio((st.fimEm - st.inicio) / 1000)
    else if (st.cena === 'comecando') {
      const falta = st.ate ? Math.ceil((st.ate - agora()) / 1000) : 0
      $('[data-contagem]').textContent = falta > 0 ? (falta >= 3600 ? `${falta / 3600 | 0}:${f2(falta / 60 % 60 | 0)}:${f2(falta % 60)}` : `${f2(falta / 60 | 0)}:${f2(falta % 60)}`) : 'já já'
    } else if (st.cena === 'lancamento') {
      // lançamento: dias, horas, minutos e segundos; no zero, festa
      const lt = st.lancamento ? Math.max(0, Math.ceil((st.lancamento - agora()) / 1000)) : 0
      const partes = { d: lt / 86400 | 0, h: lt / 3600 % 24 | 0, m: lt / 60 % 60 | 0, s: lt % 60 }
      for (const [k, v] of Object.entries(partes)) { const e = palco.querySelector(`[data-l=${k}]`), txt = f2(v); if (e.textContent !== txt) { e.textContent = txt; e.classList.remove('vira'); void e.offsetWidth; e.classList.add('vira') } }
      const ja = !!st.lancamento && lt === 0
      if (ja !== chegou) { chegou = ja; palco.querySelector('.lancamento').classList.toggle('chegou', ja); $('[data-chega]').textContent = ja ? 'chegou!' : 'chega em' }
    }
    const r = st.radio
    if (r?.d && $('.tocando').classList.contains('on')) $('.tocando .barra i').style.width = Math.min(100, (r.pausado ? r.pos * 1000 : agora() - r.inicio) / 10 / r.d) + '%'
  }
  setInterval(tick, 500)

  /* ---------- sua câmera na tela: canto e tamanho (o estúdio desenha a imagem no mesmo lugar) ---------- */
  const px = v => Math.round(v) + 'px'
  function posiciona() {
    const R = camRect(st.camPos || {}), cam = $('.cam'), noJogo = st.cena === 'jogo'
    cam.style.setProperty('--cx', px(R.x)); cam.style.setProperty('--cy', px(R.y)); cam.style.setProperty('--s', R.s)
    cam.classList.toggle('oculta', !!st.camPos?.oculta)
    palco.classList.toggle('cam-esq', !R.direita); palco.classList.toggle('cam-cima', !R.embaixo)
    // a música fica grudada na câmera: em cima dela (câmera embaixo) ou embaixo (câmera em cima)
    const tc = $('.tocando'), CH = 78, AVH = 205
    const semCam = !st.cam || st.camPos?.oculta
    const A = st.avatarPos || {}, gente = pessoasNaLinha().length
    const filaNaCam = gente && !A.oculto && (!A.lugar || A.lugar === 'cam') && st.cena === 'jogo'
    // em cima da câmera (ou embaixo, se ela estiver no alto) fica a fileira da ligação; a música vem depois
    const baseCam = semCam ? R.y + R.h : R.embaixo ? R.y - 30 : R.y + R.h + 62 * R.s + 14
    const fileiraTopo = R.embaixo || semCam ? baseCam - AVH : baseCam
    const topo = filaNaCam ? (R.embaixo || semCam ? fileiraTopo - 12 - CH : fileiraTopo + AVH + 12) : semCam ? R.y + R.h - CH : R.embaixo ? R.y - 30 - CH : R.y + R.h + 62 * R.s + 14
    if (noJogo) {
      tc.style.top = px(topo); tc.style.bottom = 'auto'
      if (R.direita) { tc.style.right = px(1920 - R.x - R.w); tc.style.left = 'auto' } else { tc.style.left = px(R.x); tc.style.right = 'auto' }
      tc.style.width = tc.classList.contains('mini') ? '' : px(Math.max(R.w, 440))
    } else ['top', 'bottom', 'left', 'right', 'width'].forEach(k => tc.style[k] = '')
    // fileira da ligação: em cima da sua câmera (padrão), num canto que ele escolher, ou escondida; aviso perto da música
    const ln = $('.chamada'), av = $('.aviso')
    ln.classList.toggle('oculta', !!A.oculto)
    let lado = R.direita
    if (A.lugar && A.lugar !== 'cam') {
      const cima = A.lugar[0] === 't'; lado = A.lugar[1] === 'r'
      ln.style.top = px(cima ? 70 : 1080 - 92 - AVH)
    } else if (st.cena === 'camera') {
      ln.style.top = px(1080 - 150 - AVH); lado = true
    } else ln.style.top = px(fileiraTopo)
    if (lado) { ln.style.right = px(A.lugar && A.lugar !== 'cam' || st.cena === 'camera' ? 64 : 1920 - R.x - R.w); ln.style.left = 'auto' }
    else { ln.style.left = px(A.lugar && A.lugar !== 'cam' ? 64 : R.x); ln.style.right = 'auto' }
    ln.classList.toggle('direita', lado)
    av.style.top = px(R.embaixo ? topo - 66 : topo + CH + 16); av.style.bottom = 'auto'
    if (R.direita) { av.style.right = px(1920 - R.x - R.w); av.style.left = 'auto' } else { av.style.left = px(R.x); av.style.right = 'auto' }
  }

  /* ---------- chat na tela ---------- */
  function chat(m) {
    if (!m?.txt || m.sis) return
    const box = $('.chat-tela'), d = document.createElement('div')
    d.className = 'bal ' + (m.de === 'ele' ? 'ele' : m.de === 'amigo' ? 'amigo' : 'ela')
    d.innerHTML = '<b></b>'; const bn = d.querySelector('b')
    bn.textContent = m.de === 'ele' ? LIVE.streamer : m.de === 'amigo' ? (m.nome || 'Convidado') : LIVE.ela
    if (m.de === 'amigo') bn.style.color = corDe(m.key)
    d.append(m.pix ? `mandou ${reais(m.pix)}${m.txt ? ': ' + m.txt : ''}` : m.txt)
    if (m.pix) d.classList.add('pixb')
    box.append(d)
    while (box.children.length > 6) box.firstElementChild.remove()
    setTimeout(() => { d.classList.add('sai'); setTimeout(() => d.remove(), 600) }, 30000)
  }

  /* ---------- meta de pix ---------- */
  const festa = $('[data-meta-festa]')
  for (let i = 0; i < 40; i++) { const e = document.createElement('i'), a = Math.random() * Math.PI
    e.style.cssText = `left:${10 + Math.random() * 80}%;background:${['#ff4fa3', '#ffb04a', '#fff', '#33e1d0'][i % 4]};--x:${Math.cos(a) * (80 + Math.random() * 160)}px;--y:${-40 - Math.random() * 140}px;--r:${Math.random() * 540}deg;--d:${Math.random() * .3}s`
    festa.append(e) }
  function pintaMeta(antes) {
    const m = st.meta, box = $('.meta')
    box.classList.toggle('on', !!m?.on && st.cena !== 'fim')
    if (!m?.on) return
    const p = Math.min(100, (m.atual || 0) / (m.alvo || 1) * 100), batida = (m.atual || 0) >= m.alvo
    $('[data-meta-t]').textContent = m.titulo || 'Meta'
    $('[data-meta-b]').style.width = p + '%'
    $('[data-meta-n]').innerHTML = `<b>${reais(m.atual || 0).replace(',00', '')}</b> / ${reais(m.alvo).replace(',00', '')}`
    $('[data-meta-rot]').textContent = batida ? 'Meta batida!' : 'Meta da live'
    box.classList.toggle('batida', batida)
    if (batida && antes?.on && (antes.atual || 0) < antes.alvo && antes.titulo === m.titulo) { box.classList.remove('festa'); void box.offsetWidth; box.classList.add('festa') }
    else if ((m.atual || 0) > (antes?.atual || 0) && antes?.on) { box.classList.remove('sobe'); void box.offsetWidth; box.classList.add('sobe') }
  }

  /* ---------- enquete ---------- */
  const LETRAS = 'ABCD'
  function pintaEnquete(antes) {
    const e = st.enquete, box = $('.enquete')
    if (!e) { box.classList.remove('on'); return }
    const nova = e.id !== antes?.id
    if (nova) {
      $('[data-enq-p]').textContent = e.pergunta
      $('[data-enq-ops]').innerHTML = e.opcoes.map((o, i) => `<li><span class="letra">${LETRAS[i]}</span><span class="txt"></span><span class="pct"></span><i class="barra"></i></li>`).join('')
      $$('[data-enq-ops] .txt').forEach((t, i) => t.textContent = e.opcoes[i])
      box.classList.remove('on', 'fim'); void box.offsetWidth
    }
    box.classList.add('on'); box.classList.toggle('fim', !!e.fim)
    const total = e.votos.reduce((a, b) => a + b, 0)
    const mostra = e.fim || !e.suspense // com aposta dele, o voto dela só aparece no fim
    $$('[data-enq-ops] li').forEach((li, i) => {
      const p = mostra && total ? Math.round(e.votos[i] / total * 100) : 0
      li.style.setProperty('--p', p + '%')
      li.querySelector('.pct').textContent = mostra && total ? p + '%' : ''
      li.classList.toggle('escolha', mostra && e.escolha === i)
      li.classList.toggle('ganhou', !!e.fim && e.ganhador === i)
      li.classList.toggle('palpite', e.palpite === i)
    })
    const ela = LIVE.ela, ele = LIVE.streamer
    let pe = ''
    if (!e.fim) pe = total ? (e.suspense ? `${ela} já votou… resultado no fim` : `${ela} votou`) : `esperando o voto de ${ela}`
    else if (e.ganhador == null) pe = `${ela} não votou dessa vez`
    else if (e.palpite != null) pe = e.palpite === e.ganhador ? `${ele} apostou certo!` : `${ele} apostou em ${LETRAS[e.palpite]} e errou`
    else pe = `${ela} escolheu ${LETRAS[e.ganhador]}`
    $('[data-enq-pe]').textContent = pe
    $('[data-enq-status]').textContent = e.fim ? '· resultado' : e.palpite != null ? `· ${ele} apostou em ${LETRAS[e.palpite]}` : ''
  }
  function tickEnquete() {
    const e = st.enquete, box = $('.enquete')
    if (!e || !box.classList.contains('on')) return
    if (e.fim) { if (agora() - (e.fimEm || 0) > 12000) box.classList.remove('on'); $('[data-enq-t]').style.width = '0'; return }
    const tot = (e.ate - (e.desde || e.ate - 60000)) || 1
    $('[data-enq-t]').style.width = Math.max(0, Math.min(100, (e.ate - agora()) / tot * 100)) + '%'
  }

  /* ---------- ligação ---------- */
  // st.chamada = [{ key, nome }] de quem está na linha (a amor tem a chave 'ela'); compatível com o antigo st.linha
  const pessoasNaLinha = () => Array.isArray(st.chamada) ? st.chamada : st.linha ? [{ key: 'ela', nome: LIVE.ela }] : []
  const itens = new Map() // key → { el, nivel, alvo, img }
  function aviso(txt, quem = LIVE.ela) { const a = $('.aviso'); $('[data-aviso-nome]').textContent = quem; $('[data-aviso]').textContent = txt; a.classList.remove('mostra'); void a.offsetWidth; a.classList.add('mostra') }
  function chamada(antes) {
    const agora = pessoasNaLinha(), antesL = Array.isArray(antes?.chamada) ? antes.chamada : antes?.linha ? [{ key: 'ela', nome: LIVE.ela }] : []
    const box = $('.chamada'), chaves = new Set(agora.map(p => p.key))
    for (const [k, it] of itens) if (!chaves.has(k)) { it.el.classList.remove('on'); setTimeout(() => it.el.remove(), 500); itens.delete(k) }
    for (const p of agora) {
      if (itens.has(p.key)) continue
      const el = document.createElement('div'); el.className = 'linha'
      el.innerHTML = '<div class="avatar"><div class="onda"></div><div class="onda"></div><div class="foto"></div></div><div class="rotulo"><b></b><span class="eq"><i></i><i></i><i></i><i></i><i></i></span></div>'
      el.querySelector('.rotulo b').textContent = p.key === 'ela' ? LIVE.ela : p.nome
      if (p.key !== 'ela') el.querySelector('.foto').style.backgroundImage = `url("${fotoDe(p.key)}")`
      box.append(el); requestAnimationFrame(() => el.classList.add('on'))
      itens.set(p.key, { el, nivel: 0, alvo: 0, img: null })
    }
    if (antes) {
      for (const p of agora) if (!antesL.some(x => x.key === p.key)) aviso('entrou na linha', p.key === 'ela' ? LIVE.ela : p.nome)
      for (const p of antesL) if (!chaves.has(p.key)) aviso('saiu da linha', p.key === 'ela' ? LIVE.ela : p.nome)
    }
  }
  function setNivel(v, key = 'ela') { const it = itens.get(key); if (it) it.alvo = Math.max(0, Math.min(1, v || 0)) }
  ;(function quadro() {
    if (!itens.size) { setTimeout(quadro, 250); return } // ninguém na linha: quase parado
    for (const [k, it] of itens) {
      it.nivel += (it.alvo - it.nivel) * .3
      const fala = it.nivel > .08, el = it.el
      el.querySelectorAll('.eq i').forEach((b, i) => b.style.height = 4 + (fala ? (Math.random() * .5 + .5) * it.nivel * 14 * (1 - Math.abs(i - 2) * .18) : 0) + 'px')
      el.querySelectorAll('.onda').forEach((o, i) => { o.style.transform = `scale(${1 + it.nivel * (.1 + i * .1)})`; o.style.opacity = it.nivel * (i ? .35 : .8) })
      el.classList.toggle('mudo', !fala)
      if (k === 'ela' && imgs.length) { const src = fala && LIVE.fotoFalando ? LIVE.fotoFalando : LIVE.fotoCalada || LIVE.fotoFalando; if (src !== it.img) { it.img = src; el.querySelector('.foto').style.backgroundImage = `url(${src})` } }
      else el.querySelector('.foto').style.transform = fala ? `scale(${1 + it.nivel * .06})` : ''
    }
    setTimeout(() => requestAnimationFrame(quadro), 60)
  })()

  /* ---------- pix ---------- */
  const fila = []
  let tocandoPix = false
  function pix(p) { fila.push(p); if (!tocandoPix) proximoPix() }
  function proximoPix() {
    const p = fila.shift()
    if (!p) { tocandoPix = false; return }
    tocandoPix = true
    const el = $('.pix'), dur = Math.max(7.2, 4 + (p.msg || '').length * .07)
    el.style.setProperty('--dur', dur + 's')
    el.querySelector('.valor').textContent = reais(p.valor)
    el.querySelector('[data-pix-nome]').textContent = p.nome || LIVE.ela
    el.querySelector('.msg').textContent = p.msg ? `“${p.msg}”` : ''
    el.classList.remove('toca'); void el.offsetWidth; el.classList.add('toca')
    setTimeout(proximoPix, dur * 1000 + 400)
  }

  return { el: palco, chat, leve: on => palco.classList.toggle('leve', !!on), pausaPrevia, setJogo, setCam, estado, setNivel, pix, aviso, tocar, agora, get st() { return st } }
}
