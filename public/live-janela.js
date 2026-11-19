/* Janelinha da live no Cineminha: quando o Kellyson está ao vivo, quem está na sala vê a live num canto, por cima
   de tudo (dá para jogar enquanto assiste). Arrasta pelo topo, muda o tamanho pela alça, troca o que aparece
   (jogo + câmera, só o jogo, só a câmera ou lado a lado), troca o visual e fecha.
   O estúdio avisa o servidor (api/live) enquanto está no ar; a janelinha entra na sala da live como espectador
   ("amigo", com a conta do Cineminha) e recebe jogo e câmera separados. Fechou: sai da sala (alivia o PC dele). */
import LIVE from './live/config.js'

const LS = 'cine.liveJanela'
const ler = () => { try { return JSON.parse(localStorage.getItem(LS)) || {} } catch { return {} } }
let cfg = { modo: 'ambos', estilo: 'vice', vol: 70, mudo: false, w: 380, ...ler() }
const salva = () => { try { localStorage.setItem(LS, JSON.stringify(cfg)) } catch {} }
const $ = (s, r = document) => r.querySelector(s)
const f2 = n => String(n).padStart(2, '0')
const relogio = s => { s = Math.max(0, Math.floor(s)); return `${f2(s / 3600 | 0)}:${f2(s / 60 % 60 | 0)}:${f2(s % 60)}` }

const IC = {
  ambos: '<rect x="2" y="4" width="20" height="16" rx="2"/><rect x="13" y="12" width="7" height="6" rx="1" fill="currentColor" stroke="none"/>',
  jogo: '<path d="M6 11h4M8 9v4"/><circle cx="15.5" cy="11.5" r="1"/><circle cx="17.5" cy="13.5" r="1"/><path d="M17.3 5H6.7a4 4 0 0 0-3.96 3.43l-.8 5.6A2.6 2.6 0 0 0 4.52 17c.9 0 1.73-.48 2.18-1.26L8 14h8l1.3 1.74A2.53 2.53 0 0 0 19.48 17a2.6 2.6 0 0 0 2.58-2.97l-.8-5.6A4 4 0 0 0 17.3 5Z"/>',
  cam: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  lado: '<rect x="2" y="5" width="12" height="14" rx="2"/><rect x="16" y="8" width="6" height="8" rx="1.5"/>',
  estilo: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a6 6 0 0 0 6-6c0-4.9-4.5-8.6-10-8.6Z"/>',
  abrir: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  fechar: '<path d="M18 6 6 18M6 6l12 12"/>',
  som: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  mudo: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m22 9-6 6M16 9l6 6"/>',
}
const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`
const MODOS = [['ambos', 'Jogo e câmera'], ['jogo', 'Só o jogo'], ['cam', 'Só a câmera'], ['lado', 'Lado a lado']]
const CENAS = { comecando: ['já vai começar', 'pega a pipoca'], volto: ['volto já', 'ele foi ali e já volta'], fim: ['a live acabou', 'valeu por assistir'], lancamento: ['contagem do GTA VI', 'falta pouco'] }

const CSS = `
@font-face{font-family:'Pricedown';src:url(live/assets/pricedown-rsg.ttf) format('truetype');font-display:swap}
.lj{--vi:linear-gradient(135deg,#ff4fa3,#ff9a4a 55%,#ffd36b);--tinta:#1c0830;--rosa:#ff4fa3;position:fixed;z-index:9000;width:var(--w,380px);color:#fff;font:600 13px/1.2 Inter,system-ui,sans-serif;
  border-radius:16px;background:#160a26;box-shadow:0 0 0 3px var(--tinta),0 0 0 5px #ff4fa3aa,0 18px 50px #000a;user-select:none;touch-action:none;
  transition:box-shadow .2s,opacity .25s,transform .35s cubic-bezier(.2,1.4,.4,1);transform-origin:bottom right}
.lj.nasce{opacity:0;transform:scale(.6) translateY(20px)}
.lj.arrastando{transition:none;box-shadow:0 0 0 3px var(--tinta),0 0 0 5px #ff4fa3,0 24px 60px #000c;cursor:grabbing}
.lj-topo{display:flex;align-items:center;gap:8px;padding:7px 8px 7px 10px;cursor:grab}
.lj-vivo{display:inline-flex;align-items:center;gap:6px;padding:3px 8px 4px;border-radius:7px;background:var(--rosa);font:400 15px/1 Pricedown,Impact,sans-serif;letter-spacing:.02em;flex:none}
.lj-vivo i{width:7px;height:7px;border-radius:50%;background:#fff;animation:ljPulsa 1.4s infinite}
@keyframes ljPulsa{50%{opacity:.35}}
.lj-nome{min-width:0;flex:1}
.lj-nome b{display:block;font:400 19px/1 Pricedown,Impact,sans-serif;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lj-nome small{display:block;font:600 11px/1.2 Inter,system-ui,sans-serif;color:#fffa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.lj-b{display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:8px;background:#ffffff14;color:#fff;cursor:pointer;flex:none;padding:0;transition:background .15s,transform .15s}
.lj-b:hover{background:#ffffff2a}.lj-b:active{transform:scale(.92)}
.lj-b svg{width:16px;height:16px}
.lj-b.fechar:hover{background:#e8213f}
.lj-tela{position:relative;aspect-ratio:16/9;margin:0 6px;border-radius:11px;overflow:hidden;background:#0e0618}
.lj[data-modo=lado] .lj-tela{aspect-ratio:2.6/1;display:grid;grid-template-columns:minmax(0,1.78fr) minmax(0,1fr);gap:4px;background:#160a26}
.lj-tela video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#0e0618}
.lj-cam{object-fit:cover!important;transition:all .35s cubic-bezier(.2,1.2,.4,1)}
.lj[data-modo=ambos] .lj-cam{inset:auto 8px 8px auto;width:28%;height:auto;aspect-ratio:16/9;border-radius:8px;box-shadow:0 0 0 2px var(--tinta),0 0 0 4px #fff4e8,0 6px 14px #0008}
.lj[data-modo=jogo] .lj-cam{opacity:0;pointer-events:none;transform:scale(.6)}
.lj[data-modo=cam] .lj-jogo{opacity:0}
.lj[data-modo=lado] .lj-tela video{position:relative;inset:auto;border-radius:9px}
.lj.sem-cam .lj-cam{display:none}
.lj-cena,.lj-espera{position:absolute;inset:0;display:grid;place-items:center;text-align:center;background:#160a26b0;backdrop-filter:blur(3px);transition:opacity .3s}
.lj-cena b,.lj-espera b{display:block;font:400 clamp(18px,7cqw,34px)/1 Pricedown,Impact,sans-serif;background:var(--vi);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 0 var(--tinta))}
.lj-cena span,.lj-espera span{display:block;margin-top:6px;color:#fffc;font-size:12px}
.lj-tela{container-type:inline-size}
.lj-cena[hidden],.lj-espera[hidden]{display:none}
.lj-pe{display:flex;align-items:center;gap:6px;padding:6px 8px 8px}
.lj-modos{display:flex;gap:3px;padding:3px;border-radius:10px;background:#ffffff0d}
.lj-modos .lj-b{width:26px;height:24px;background:none}
.lj-modos .lj-b[aria-pressed=true]{background:var(--rosa);box-shadow:0 2px 8px #ff4fa366}
.lj-vol{flex:1;min-width:40px;accent-color:var(--rosa)}
.lj-alca{position:absolute;left:-4px;top:-4px;width:18px;height:18px;cursor:nwse-resize;border-radius:6px}
.lj-alca::after{content:'';position:absolute;left:6px;top:6px;width:7px;height:7px;border-left:2px solid #fff8;border-top:2px solid #fff8;border-radius:2px 0 0 0}
.lj:not(:hover) .lj-alca::after{opacity:0}
/* visual limpo: sem moldura colorida, topo e controles só aparecem com o mouse em cima */
.lj[data-estilo=limpo]{background:#0e0618;box-shadow:0 10px 34px #000b;border-radius:12px}
.lj[data-estilo=limpo] .lj-tela{margin:0;border-radius:12px}
.lj[data-estilo=limpo] .lj-topo,.lj[data-estilo=limpo] .lj-pe{position:absolute;left:0;right:0;z-index:2;opacity:0;transition:opacity .2s}
.lj[data-estilo=limpo] .lj-topo{top:0;background:linear-gradient(#000c,transparent);border-radius:12px 12px 0 0}
.lj[data-estilo=limpo] .lj-pe{bottom:0;background:linear-gradient(transparent,#000c);border-radius:0 0 12px 12px}
.lj[data-estilo=limpo]:hover .lj-topo,.lj[data-estilo=limpo]:hover .lj-pe,.lj[data-estilo=limpo].arrastando .lj-topo{opacity:1}
/* visual neon: moldura animada no degradê do VI */
.lj[data-estilo=neon]{background:#12061f;box-shadow:0 0 0 2px #ff4fa3,0 0 22px #ff4fa388,0 0 60px #ff9a4a44,0 18px 50px #000a}
.lj[data-estilo=neon] .lj-tela{box-shadow:0 0 0 2px #ffd36b66}
.lj[data-estilo=neon] .lj-nome b{background:var(--vi);-webkit-background-clip:text;background-clip:text;color:transparent}
.lj-pilula{position:fixed;z-index:9000;right:16px;bottom:16px;display:flex;align-items:center;gap:8px;padding:8px 10px 8px 12px;border:0;border-radius:999px;background:#160a26;color:#fff;
  box-shadow:0 0 0 3px #1c0830,0 0 0 5px #ff4fa3aa,0 10px 30px #0009;font:400 16px/1 Pricedown,Impact,sans-serif;cursor:pointer;animation:ljEntra .5s cubic-bezier(.2,1.4,.4,1)}
.lj-pilula i{width:8px;height:8px;border-radius:50%;background:#ff4fa3;animation:ljPulsa 1.4s infinite}
.lj-pilula span.x{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#ffffff1a;font:700 13px Inter,sans-serif}
.lj-pilula span.x:hover{background:#e8213f}
@keyframes ljEntra{from{opacity:0;transform:translateY(20px) scale(.8)}}
@media (prefers-reduced-motion:reduce){.lj,.lj-cam,.lj-pilula{transition:none;animation:none}.lj-vivo i,.lj-pilula i{animation:none}}
@media (max-width:640px){.lj{--w:min(92vw,360px)!important}}
`

export function iniciaJanelaLive() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st)
  let atual = null      // { codigo, inicio, titulo } da live no ar
  let sala = null, est = {}, el = null, pilula = null, relogioT = 0
  let fechada = ''      // live que a pessoa fechou (código:início): não abre de novo sozinha
  try { fechada = sessionStorage.getItem('cine.liveFechada') || '' } catch {}
  const idLive = l => l ? `${l.codigo}:${l.inicio}` : ''

  const eu = () => { try { const s = JSON.parse(localStorage.getItem('cine.sess')); return s?.key ? { key: s.key, nome: s.name || 'Convidado' } : null } catch { return null } }
  const logado = () => { try { return !!JSON.parse(localStorage.getItem('cine.conta')) } catch { return false } }
  const aparelho = () => { try { let a = localStorage.getItem('live.aparelho'); if (!a) { a = crypto.randomUUID(); localStorage.setItem('live.aparelho', a) } return a } catch { return '' } }
  const entrou = () => $('#gate')?.hidden === true && !!eu()

  async function confere() {
    if (!entrou()) return
    const r = await fetch('api/live', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
    if (!r) return
    const nova = r.ativa ? { codigo: r.codigo, inicio: r.inicio, titulo: r.titulo } : null
    if (idLive(nova) === idLive(atual)) { if (nova && el) atualizaTopo(nova); return }
    some(); atual = nova
    if (!atual) return
    if (fechada === idLive(atual)) mostraPilula()
    else abre()
  }

  /* ---------- janela ---------- */
  function monta() {
    el = document.createElement('div')
    el.className = 'lj nasce'; el.dataset.modo = cfg.modo; el.dataset.estilo = cfg.estilo
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', `Live do ${LIVE.streamer}`)
    el.innerHTML = `
      <div class="lj-topo">
        <span class="lj-vivo"><i></i>ao vivo</span>
        <div class="lj-nome"><b>${LIVE.streamer}</b><small></small></div>
        <button class="lj-b" data-faz="estilo" title="Trocar o visual">${svg('estilo')}</button>
        <button class="lj-b" data-faz="abrir" title="Abrir a live completa (chat, pix e linha)">${svg('abrir')}</button>
        <button class="lj-b fechar" data-faz="fechar" title="Fechar a janelinha">${svg('fechar')}</button>
      </div>
      <div class="lj-tela">
        <video class="lj-jogo" autoplay playsinline></video>
        <video class="lj-cam" autoplay playsinline muted></video>
        <div class="lj-cena" hidden><div><b></b><span></span></div></div>
        <div class="lj-espera"><div><b>conectando…</b><span>entrando na live</span></div></div>
      </div>
      <div class="lj-pe">
        <div class="lj-modos" role="group" aria-label="O que aparece">${MODOS.map(([m, t]) => `<button class="lj-b" data-modo="${m}" title="${t}" aria-pressed="${cfg.modo === m}">${svg(m)}</button>`).join('')}</div>
        <button class="lj-b" data-faz="som" title="Som (a live tem o som do jogo e a voz dele)"></button>
        <input class="lj-vol" type="range" min="0" max="100" aria-label="Volume da live">
      </div>
      <div class="lj-alca" title="Arraste para mudar o tamanho"></div>`
    document.body.append(el)
    el.style.setProperty('--w', cfg.w + 'px')
    posiciona(cfg.x, cfg.y)
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('nasce')))
    pintaSom()
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-faz],[data-modo]'); if (!b || b.classList.contains('lj')) return
      if (b.dataset.modo) { cfg.modo = b.dataset.modo; el.dataset.modo = cfg.modo; el.querySelectorAll('[data-modo]').forEach(x => x.getAttribute('aria-pressed') != null && x.setAttribute('aria-pressed', x.dataset.modo === cfg.modo)); salva(); return }
      const f = b.dataset.faz
      if (f === 'fechar') { fechada = idLive(atual); try { sessionStorage.setItem('cine.liveFechada', fechada) } catch {} ; some(); mostraPilula() }
      if (f === 'abrir') window.open(`live/?c=${atual.codigo}&amigos`, '_blank', 'noopener')
      if (f === 'estilo') { const ord = ['vice', 'neon', 'limpo']; cfg.estilo = ord[(ord.indexOf(cfg.estilo) + 1) % ord.length]; el.dataset.estilo = cfg.estilo; salva() }
      if (f === 'som') { cfg.mudo = !cfg.mudo; salva(); pintaSom() }
    })
    $('.lj-vol', el).addEventListener('input', e => { cfg.vol = +e.target.value; cfg.mudo = false; salva(); pintaSom() })
    arrasto(); redimensiona()
    addEventListener('resize', reencaixa)
    atualizaTopo(atual)
    relogioT = setInterval(() => atualizaTopo(atual), 1000)
  }
  function pintaSom() {
    if (!el) return
    const v = $('.lj-jogo', el); v.volume = cfg.vol / 100; v.muted = cfg.mudo
    $('[data-faz=som]', el).innerHTML = svg(cfg.mudo || !cfg.vol ? 'mudo' : 'som')
    $('.lj-vol', el).value = cfg.mudo ? 0 : cfg.vol
  }
  function atualizaTopo(l) {
    if (!el || !l) return
    const t = est.inicio || l.inicio
    $('.lj-nome small', el).textContent = `${LIVE.jogo}${t ? ' · ' + relogio((Date.now() - t) / 1000) : ''}${(est.titulo || l.titulo) ? ' · ' + (est.titulo || l.titulo) : ''}`
  }
  function pintaCena() {
    if (!el) return
    const c = CENAS[est.cena], box = $('.lj-cena', el)
    box.hidden = !c
    if (c) { $('b', box).textContent = c[0]; $('span', box).textContent = c[1] }
    // cena "câmera" (ele em tela cheia): mostra só a câmera, sem mexer na escolha da pessoa
    el.dataset.modo = est.cena === 'camera' ? 'cam' : cfg.modo
  }

  /* ---------- arrastar e redimensionar ---------- */
  const limites = () => ({ w: el.offsetWidth, h: el.offsetHeight, W: innerWidth, H: innerHeight })
  function posiciona(x, y) {
    const { w, h, W, H } = limites(), m = 12
    if (x == null || y == null) { x = W - w - 20; y = H - h - 90 } // padrão: canto de baixo à direita, acima da barra
    x = Math.max(m, Math.min(W - w - m, x)); y = Math.max(m, Math.min(H - h - m, y))
    el.style.left = x + 'px'; el.style.top = y + 'px'
    return [x, y]
  }
  const reencaixa = () => { if (el) posiciona(parseFloat(el.style.left), parseFloat(el.style.top)) }
  function arrasto() {
    const topo = $('.lj-topo', el)
    topo.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return
      e.preventDefault(); topo.setPointerCapture(e.pointerId); el.classList.add('arrastando')
      const ox = e.clientX - parseFloat(el.style.left), oy = e.clientY - parseFloat(el.style.top)
      const move = ev => posiciona(ev.clientX - ox, ev.clientY - oy)
      const solta = () => {
        topo.removeEventListener('pointermove', move); el.classList.remove('arrastando')
        // gruda nos cantos se soltar perto da borda
        let [x, y] = [parseFloat(el.style.left), parseFloat(el.style.top)]; const { w, h, W, H } = limites(), g = 40
        if (x < g) x = 12; if (W - x - w < g) x = W - w - 12; if (y < g) y = 12; if (H - y - h < g) y = H - h - 12
        ;[cfg.x, cfg.y] = posiciona(x, y); salva()
      }
      topo.addEventListener('pointermove', move); topo.addEventListener('pointerup', solta, { once: true }); topo.addEventListener('pointercancel', solta, { once: true })
    })
  }
  function redimensiona() {
    const alca = $('.lj-alca', el)
    alca.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); alca.setPointerCapture(e.pointerId); el.classList.add('arrastando')
      const dir = parseFloat(el.style.left) + el.offsetWidth, base = parseFloat(el.style.top) + el.offsetHeight
      const move = ev => {
        const w = Math.max(240, Math.min(Math.min(innerWidth - 24, 1100), dir - ev.clientX))
        el.style.setProperty('--w', w + 'px'); cfg.w = w
        posiciona(dir - el.offsetWidth, base - el.offsetHeight) // cresce para cima e para a esquerda (o canto oposto fica parado)
      }
      const solta = () => { alca.removeEventListener('pointermove', move); el.classList.remove('arrastando'); cfg.x = parseFloat(el.style.left); cfg.y = parseFloat(el.style.top); salva() }
      alca.addEventListener('pointermove', move); alca.addEventListener('pointerup', solta, { once: true }); alca.addEventListener('pointercancel', solta, { once: true })
    })
  }

  /* ---------- sala da live ---------- */
  async function abre() {
    if (!atual) return
    pilula?.remove(); pilula = null
    monta()
    const { entraLive } = await import('./live/rede.js')
    const quem = eu()
    const l = atual
    const s = await entraLive(l.codigo, 'amigo', { key: quem.key, nome: quem.nome, ap: aparelho(), conf: logado(), origem: 'cine' })
    if (atual !== l || !el) { try { s.room.leave() } catch {} ; return }
    sala = s
    const estudio = id => sala.papeis.get(id) === 'estudio'
    sala.on('stream', (stream, id, meta) => {
      if (!estudio(id) || !el) return
      if (meta.live) {
        const v = $('.lj-jogo', el); v.srcObject = stream; v.play().catch(() => { cfg.mudo = true; pintaSom(); v.play().catch(() => {}) })
        $('.lj-espera', el).hidden = true
      }
      if (meta.cam) { const c = $('.lj-cam', el); c.srcObject = stream; c.play().catch(() => {}); el.classList.remove('sem-cam') }
    })
    el.classList.add('sem-cam')
    sala.acoes.estado.on((e, id) => { if (estudio(id) && e) { est = e; pintaCena(); atualizaTopo(atual); el?.classList.toggle('sem-cam', !e.cam && !$('.lj-cam', el)?.srcObject) } })
    sala.acoes.mod.on((m, id) => { if (estudio(id) && m?.fora) { fechada = idLive(atual); some() } })
    sala.on('saiu', (id, p) => { if (p === 'estudio' && el) { $('.lj-espera', el).hidden = false; $('.lj-espera b', el).textContent = 'reconectando…' } })
  }
  function some() {
    clearInterval(relogioT)
    try { sala?.room.leave() } catch {}
    sala = null; est = {}
    if (el) { const e = el; e.classList.add('nasce'); setTimeout(() => e.remove(), 300); el = null }
    removeEventListener('resize', reencaixa)
    pilula?.remove(); pilula = null
  }
  function mostraPilula() {
    pilula?.remove()
    pilula = document.createElement('button')
    pilula.className = 'lj-pilula'; pilula.title = 'Abrir a janelinha da live'
    pilula.innerHTML = `<i></i>${LIVE.streamer} ao vivo<span class="x" title="Esconder">×</span>`
    pilula.onclick = e => {
      if (e.target.closest('.x')) { pilula.remove(); pilula = null; return }
      fechada = ''; try { sessionStorage.removeItem('cine.liveFechada') } catch {}
      abre()
    }
    document.body.append(pilula)
  }

  confere()
  setInterval(confere, 20000)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) confere() })
  // acabou de entrar na sala: confere logo, sem esperar os 20 s
  const espera = setInterval(() => { if (entrou()) { clearInterval(espera); confere() } }, 1500)
}

iniciaJanelaLive()
