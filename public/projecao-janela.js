/* Janelinha da projeção: quando alguém está projetando (ex.: o jogo do Xbox) e você abre um jogo da sala, a
   projeção não some atrás da mesa: vai para um canto da tela, pequena, por cima de tudo. Arrasta pelo topo, muda o
   tamanho pela alça, troca o visual e fecha. Também dá para mandar para o canto na hora pelo botão na projeção.
   É uma segunda imagem do mesmo vídeo (o som continua o do Cineminha, no volume do filme). Não mexe no app.js. */
import { JOGOS } from './core/jogos.js'

const LS = 'cine.projJanela'
let cfg = { estilo: '', w: 360 }
try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem(LS)) } } catch {}
const salva = () => { try { localStorage.setItem(LS, JSON.stringify(cfg)) } catch {} }
const $ = (s, r = document) => r.querySelector(s)
const CLASSES_JOGO = Object.values(JOGOS).map(j => j.on).filter(Boolean)
const ESTILOS = ['vice', 'neon', 'limpo']
const estiloAgora = () => cfg.estilo || (document.body.classList.contains('tema-gta6') ? 'vice' : 'limpo')

const IC = {
  estilo: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a6 6 0 0 0 6-6c0-4.9-4.5-8.6-10-8.6Z"/>',
  trocar: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  fechar: '<path d="M18 6 6 18M6 6l12 12"/>',
  canto: '<rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="11" width="8" height="7" rx="1" fill="currentColor" stroke="none"/>',
}
const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`

document.head.append(Object.assign(document.createElement('style'), { textContent: `
@font-face{font-family:'Pricedown';src:url(live/assets/pricedown-rsg.ttf) format('truetype');font-display:swap}
.pj{--vi:linear-gradient(135deg,#ff4fa3,#ff9a4a 55%,#ffd36b);--tinta:#1c0830;position:fixed;z-index:8990;width:var(--w,360px);color:#fff;font:600 12px/1.2 Inter,system-ui,sans-serif;
  border-radius:14px;background:#141419;box-shadow:0 12px 40px #000b;user-select:none;touch-action:none;transition:opacity .25s,transform .35s cubic-bezier(.2,1.4,.4,1),box-shadow .2s}
.pj.nasce{opacity:0;transform:scale(.6) translateY(20px)}
.pj.arrastando{transition:none;cursor:grabbing}
.pj-topo{position:absolute;left:0;right:0;top:0;z-index:2;display:flex;align-items:center;gap:6px;padding:7px 7px 18px 10px;border-radius:14px 14px 0 0;background:linear-gradient(#000c,transparent);cursor:grab;opacity:0;transition:opacity .2s}
.pj:hover .pj-topo,.pj.arrastando .pj-topo{opacity:1}
.pj-nome{flex:1;min-width:0;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 3px #000}
.pj-nome i{width:7px;height:7px;border-radius:50%;background:#ff4fa3;flex:none;animation:pjPulsa 1.4s infinite}
@keyframes pjPulsa{50%{opacity:.35}}
.pj-b{display:grid;place-items:center;width:26px;height:26px;border:0;border-radius:8px;background:#ffffff22;color:#fff;cursor:pointer;flex:none;padding:0;backdrop-filter:blur(4px)}
.pj-b:hover{background:#ffffff3a}.pj-b.fechar:hover{background:#e8213f}.pj-b svg{width:15px;height:15px}
.pj-tela{position:relative;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#000}
.pj-tela video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.pj-alca{position:absolute;left:-4px;top:-4px;z-index:3;width:18px;height:18px;cursor:nwse-resize}
.pj-alca::after{content:'';position:absolute;left:6px;top:6px;width:7px;height:7px;border-left:2px solid #fff9;border-top:2px solid #fff9;border-radius:2px 0 0 0;opacity:0;transition:opacity .2s}
.pj:hover .pj-alca::after{opacity:1}
/* Vice: moldura escura com filete rosa e o nome em letreiro */
.pj[data-estilo=vice]{background:#160a26;padding:5px;box-shadow:0 0 0 3px var(--tinta),0 0 0 5px #ff4fa3aa,0 18px 50px #000a}
.pj[data-estilo=vice] .pj-tela{border-radius:10px}
.pj[data-estilo=vice] .pj-topo{position:static;opacity:1;background:none;padding:2px 2px 6px 4px;border-radius:0}
.pj[data-estilo=vice] .pj-nome{font:400 16px/1 Pricedown,Impact,sans-serif;letter-spacing:.02em;text-shadow:none}
.pj[data-estilo=vice] .pj-b{background:#ffffff14}
/* Neon: brilho no degradê do VI */
.pj[data-estilo=neon]{box-shadow:0 0 0 2px #ff4fa3,0 0 22px #ff4fa388,0 0 60px #ff9a4a44,0 18px 50px #000a}
.pj[data-estilo=neon] .pj-nome{font:400 16px/1 Pricedown,Impact,sans-serif;background:var(--vi);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none}
/* botão "mandar para o canto" em cima de cada projeção */
.pj-mandar{position:absolute;top:10px;left:10px;z-index:6;display:none;align-items:center;gap:6px;padding:6px 10px;border:0;border-radius:9px;background:#000a;color:#fff;font:600 12px Inter,system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(6px)}
.pj-mandar svg{width:15px;height:15px}
.tile:hover .pj-mandar{display:inline-flex}
.pj-mandar:hover{background:#ff4fa3}
@media (max-width:640px){.pj{--w:min(70vw,300px)!important}}
@media (prefers-reduced-motion:reduce){.pj{transition:none}.pj-nome i{animation:none}}
` }))

let el = null, atual = null, manual = false, jaJogo = false, fechadas = new Set()
const tilesComVideo = () => [...document.querySelectorAll('#screenInner .tile:not(.tile--file)')].filter(t => {
  const v = $('video', t); return v?.srcObject?.getVideoTracks().some(x => x.readyState === 'live')
})
const nomeDe = t => ($('.tile__label', t)?.textContent || '').trim() || 'Projeção'
const idDe = t => $('video', t)?.srcObject?.id || ''
const jogoNaTela = () => CLASSES_JOGO.some(c => $('#theater')?.classList.contains(c))

function confere() {
  const lista = tilesComVideo()
  // botão de mandar para o canto em cada projeção
  for (const t of lista) if (!$('.pj-mandar', t)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pj-mandar'; b.title = 'Ver numa janelinha no canto (dá para fazer outra coisa na sala)'
    b.innerHTML = `${svg('canto')}<span>Janelinha</span>`
    b.addEventListener('click', e => { e.stopPropagation(); fechadas.delete(idDe(t)); manual = true; mostra(t) })
    t.append(b)
  }
  const vivo = atual && lista.includes(atual) && idDe(atual) === el?.dataset.id
  if (atual && !vivo) { atual = null; some() }
  const jogo = jogoNaTela()
  if (jaJogo && !jogo) fechadas.clear() // saiu do jogo: da próxima vez a janelinha volta a aparecer
  jaJogo = jogo
  const quer = manual || jogo
  if (!quer) { if (el) some(); return }
  if (el) return
  const t = lista.find(x => !fechadas.has(idDe(x)))
  if (t) mostra(t)
}

function mostra(t) {
  atual = t
  const v = $('video', t)
  if (!el) monta()
  el.dataset.id = idDe(t)
  const meu = $('video', el)
  if (meu.srcObject !== v.srcObject) { meu.srcObject = v.srcObject; meu.play().catch(() => {}) }
  $('.pj-nome span', el).textContent = `${nomeDe(t)}`
  $('[data-faz=trocar]', el).hidden = tilesComVideo().length < 2
}

function monta() {
  el = document.createElement('div')
  el.className = 'pj nasce'; el.dataset.estilo = estiloAgora()
  el.innerHTML = `<div class="pj-topo"><div class="pj-nome"><i></i><span></span></div>
      <button class="pj-b" data-faz="estilo" title="Trocar o visual">${svg('estilo')}</button>
      <button class="pj-b" data-faz="trocar" title="Ver a outra projeção" hidden>${svg('trocar')}</button>
      <button class="pj-b fechar" data-faz="fechar" title="Fechar a janelinha">${svg('fechar')}</button></div>
    <div class="pj-tela"><video autoplay playsinline muted></video></div><div class="pj-alca" title="Arraste para mudar o tamanho"></div>`
  document.body.append(el)
  el.style.setProperty('--w', cfg.w + 'px')
  posiciona(cfg.x, cfg.y)
  requestAnimationFrame(() => requestAnimationFrame(() => el?.classList.remove('nasce')))
  el.addEventListener('click', e => {
    const f = e.target.closest('[data-faz]')?.dataset.faz; if (!f) return
    if (f === 'fechar') { fechadas.add(el.dataset.id); manual = false; atual = null; some() }
    if (f === 'estilo') { cfg.estilo = ESTILOS[(ESTILOS.indexOf(estiloAgora()) + 1) % ESTILOS.length]; el.dataset.estilo = cfg.estilo; salva(); reencaixa() }
    if (f === 'trocar') { const l = tilesComVideo(), i = l.indexOf(atual); mostra(l[(i + 1) % l.length]) }
  })
  arrasto(); redimensiona()
}
function some() {
  if (!el) return
  const e = el; el = null; e.classList.add('nasce'); setTimeout(() => e.remove(), 300)
}

/* ---------- arrastar e redimensionar ---------- */
function posiciona(x, y) {
  const w = el.offsetWidth, h = el.offsetHeight, m = 12
  if (x == null || y == null) { x = 90; y = innerHeight - h - 110 } // padrão: embaixo à esquerda, ao lado da barra (não cobre o chat; a da live fica à direita)
  x = Math.max(m, Math.min(innerWidth - w - m, x)); y = Math.max(m, Math.min(innerHeight - h - m, y))
  el.style.left = x + 'px'; el.style.top = y + 'px'
  return [x, y]
}
const reencaixa = () => { if (el) posiciona(parseFloat(el.style.left), parseFloat(el.style.top)) }
addEventListener('resize', reencaixa)
function arrasto() {
  const topo = $('.pj-topo', el)
  topo.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return
    e.preventDefault(); topo.setPointerCapture(e.pointerId); el.classList.add('arrastando')
    const ox = e.clientX - parseFloat(el.style.left), oy = e.clientY - parseFloat(el.style.top)
    const move = ev => posiciona(ev.clientX - ox, ev.clientY - oy)
    const solta = () => {
      topo.removeEventListener('pointermove', move); el.classList.remove('arrastando')
      let x = parseFloat(el.style.left), y = parseFloat(el.style.top); const w = el.offsetWidth, h = el.offsetHeight, g = 40
      if (x < g) x = 12; if (innerWidth - x - w < g) x = innerWidth - w - 12; if (y < g) y = 12; if (innerHeight - y - h < g) y = innerHeight - h - 12
      ;[cfg.x, cfg.y] = posiciona(x, y); salva()
    }
    topo.addEventListener('pointermove', move); topo.addEventListener('pointerup', solta, { once: true }); topo.addEventListener('pointercancel', solta, { once: true })
  })
}
function redimensiona() {
  const alca = $('.pj-alca', el)
  alca.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); alca.setPointerCapture(e.pointerId); el.classList.add('arrastando')
    const dir = parseFloat(el.style.left) + el.offsetWidth, base = parseFloat(el.style.top) + el.offsetHeight
    const move = ev => {
      const w = Math.max(220, Math.min(Math.min(innerWidth - 24, 1100), dir - ev.clientX))
      el.style.setProperty('--w', w + 'px'); cfg.w = w
      posiciona(dir - el.offsetWidth, base - el.offsetHeight)
    }
    const solta = () => { alca.removeEventListener('pointermove', move); el.classList.remove('arrastando'); cfg.x = parseFloat(el.style.left); cfg.y = parseFloat(el.style.top); salva() }
    alca.addEventListener('pointermove', move); alca.addEventListener('pointerup', solta, { once: true }); alca.addEventListener('pointercancel', solta, { once: true })
  })
}

setInterval(confere, 800)
