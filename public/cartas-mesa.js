// Motor compartilhado das mesas de cartas (Uno e Dobro): voo de carta em arco (com virada 3D e batida), onda de
// choque, mesa tremendo, FLIP da mão, inclinação da carta conforme o mouse, pouso e um giro contínuo (anel/sentido e
// facho de luz para quem tem a vez) que sobrevive ao render, que refaz a tela inteira a cada mudança.
// Cada jogo passa a tela, a função que desenha a carta (c ou null = verso) e o seletor da classe das cartas.
// As peças do voo usam classes cm-* (cartas-mesa.css, carregado junto com o CSS do jogo).

export function criaMesa({ tela, carta, cartaSel, palco }) {
  const calmo = () => matchMedia('(prefers-reduced-motion: reduce)').matches
  const cqh = () => tela.clientHeight / 100
  const rnd = n => Math.floor(Math.random() * n)
  const noTela = n => { const r = n.getBoundingClientRect(), t = tela.getBoundingClientRect(); return { x: r.left - t.left + r.width / 2, y: r.top - t.top + r.height / 2, w: r.width, h: r.height } }
  // ponto de um voo: centro na tela e largura que a carta tem ali
  const ponto = (n, larg) => n?.isConnected ? { ...noTela(n), ...(larg ? { w: larg } : {}) } : null
  const novo = (tag, cls, style = '') => { const n = document.createElement(tag); n.className = cls; if (style) n.style.cssText = style; return n }
  const pousando = new Set() // cartas voando: ficam escondidas no destino até pousar

  // FLIP da mão: guarda onde cada carta estava antes do render; depois, cada uma desliza com mola até o lugar novo
  function fotos(sel) {
    const m = new Map(), t = tela.getBoundingClientRect()
    for (const n of tela.querySelectorAll(`${sel} ${cartaSel}[data-id]`)) { const r = n.getBoundingClientRect(); m.set(+n.dataset.id, { x: r.left - t.left + r.width / 2, y: r.top - t.top + r.height / 2, w: n.offsetWidth }) }
    return m
  }
  function flip(antes, sel) {
    if (!antes.size || calmo()) return
    const t = tela.getBoundingClientRect()
    for (const n of tela.querySelectorAll(`${sel} ${cartaSel}[data-id]`)) {
      const a = antes.get(+n.dataset.id); if (!a) continue
      const r = n.getBoundingClientRect(), dx = a.x - (r.left - t.left + r.width / 2), dy = a.y - (r.top - t.top + r.height / 2)
      if (Math.abs(dx) + Math.abs(dy) < 1.5) continue
      n.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: 480, easing: 'cubic-bezier(.22,1.28,.36,1)' })
    }
  }
  // a carta da mão inclina em 3D conforme o mouse (--tx/--ty, usados no transform do CSS do jogo)
  function inclina(mao) {
    mao.addEventListener('pointermove', e => {
      const c = e.target.closest?.(cartaSel); if (!c) return
      const r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5
      c.style.setProperty('--tx', `${(-py * 16).toFixed(1)}deg`); c.style.setProperty('--ty', `${(px * 20).toFixed(1)}deg`)
    })
    mao.addEventListener('pointerout', e => { const c = e.target.closest?.(cartaSel); if (c && !c.contains(e.relatedTarget)) { c.style.removeProperty('--tx'); c.style.removeProperty('--ty') } })
  }
  // a carta pousou: revela a de verdade com um assentar
  function pousa(id, sel) {
    pousando.delete(id)
    const n = tela.querySelector(`${sel} ${cartaSel}[data-id="${id}"]`)
    if (!n) return
    n.classList.remove('oculta', 'chegou')
    n.style.visibility = ''
    if (!calmo()) n.animate([{ scale: '1.06' }, { scale: '1' }], { duration: 200, easing: 'ease-out' })
  }
  // mesa sacode (batida de carta forte)
  function treme(f = 1) {
    const pl = tela.querySelector(palco); if (!pl || calmo()) return
    const a = .9 * f
    pl.animate([{ translate: '0 0' }, { translate: `${-a}cqh ${a * .5}cqh` }, { translate: `${a}cqh ${-a * .4}cqh` }, { translate: `${-a * .6}cqh ${a * .3}cqh` }, { translate: `${a * .3}cqh 0` }, { translate: '0 0' }], { duration: 230, easing: 'linear' })
  }
  // impacto: onda de choque na cor dada; forte = faíscas e a mesa sacode
  function impacto(p, cor = '#f4f2ee', forte = false, cores = null) {
    if (!p || calmo()) return
    const h = cqh()
    const onda = novo('i', 'cm-onda' + (forte ? ' forte' : ''), `left:${p.x}px;top:${p.y}px;--cor-onda:${cor}`)
    tela.append(onda); setTimeout(() => onda.remove(), 800)
    if (!forte) return
    const paleta = cores || [cor, cor, '#fff']
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2 + Math.random() * .4, d = (8 + Math.random() * 9) * h
      const f = novo('i', 'cm-faisca', `background:${paleta[i % paleta.length]}`); tela.append(f)
      f.animate([{ transform: `translate(${p.x}px,${p.y}px) translate(-50%,-50%) rotate(0) scale(1)`, opacity: 1 },
        { transform: `translate(${p.x + Math.cos(a) * d}px,${p.y + Math.sin(a) * d * .7}px) translate(-50%,-50%) rotate(${rnd(540) - 270}deg) scale(.3)`, opacity: 0 }],
        { duration: 520 + rnd(220), easing: 'cubic-bezier(.12,.75,.3,1)' }).onfinish = () => f.remove()
    }
    treme(1)
  }
  // Voo de carta: arco Bézier que sobe em direção à câmera (escala), inclina pela velocidade (o papel "dobra" no ar,
  // com as bordas atrasando um pouco), sombra que se afasta da carta e pouso com mola.
  // vira: começa de costas e mostra a face no meio do caminho. slam: sobe alto, para no ápice e desce batendo (bate()
  // é chamado no impacto). deita: termina inclinada como a mesa (graus; true = 38).
  function voo(c, A, B, o = {}) {
    const { dur = 540, atraso = 0, alto = 7, lado = 0, giro0 = 0, giro1 = 0, vira = false, slam = false, deita = 0, fim, bate } = o
    setTimeout(() => {
      if (!A || !B || !tela.isConnected || calmo()) { bate?.(); return fim?.() }
      const h = cqh(), W = B.w, P = 130 * h, s0 = A.w / W
      const n = novo('div', 'cm-voo', `width:${W}px;--w:${W}px`)
      const sombra = novo('i', 'cm-voo__sombra')
      const giroY = novo('div', 'cm-voo__giro')
      const frente = carta(c); frente.classList.add('cm-voo__frente')
      giroY.append(frente)
      if (vira) { const verso = carta(null); verso.classList.add('cm-voo__verso'); giroY.append(verso) }
      n.append(sombra, giroY); tela.append(n)
      const deitaMax = typeof deita === 'number' ? deita : deita ? 38 : 0
      const fr = [], sf = []
      const lerp = (a, b, t) => a + (b - a) * t
      const push = (off, x, y, sc, rx, ry, rz, sk, lift) => {
        fr.push({ offset: off, transform: `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) perspective(${P.toFixed(0)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotate(${rz.toFixed(2)}deg) skewX(${sk.toFixed(2)}deg) scale(${sc.toFixed(3)})` })
        sf.push({ offset: off, transform: `translate(${(lift * 1.2 * h).toFixed(1)}px,${(lift * 3.6 * h).toFixed(1)}px) scale(${(1 + lift * .12).toFixed(3)})`, opacity: (.1 + lift * .45).toFixed(3) })
      }
      const clamp = (v, m) => Math.max(-m, Math.min(m, v))
      if (!slam) {
        const C = { x: (A.x + B.x) / 2 + lado * h, y: Math.min(A.y, B.y) - alto * h }
        const N = 14, fimV = .8, pts = []
        for (let i = 0; i <= N; i++) {
          const t = i / N, p = .35 * t * t * (3 - 2 * t) + .65 * (1 - (1 - t) ** 3)
          pts.push({ t, p, x: (1 - p) ** 2 * A.x + 2 * (1 - p) * p * C.x + p * p * B.x, y: (1 - p) ** 2 * A.y + 2 * (1 - p) * p * C.y + p * p * B.y })
        }
        pts.forEach((q, i) => {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)], dt = (b.t - a.t) || 1
          const vx = (b.x - a.x) / dt / W, vy = (b.y - a.y) / dt / W // larguras de carta por voo
          const lift = Math.sin(Math.PI * q.p), sc = lerp(s0, 1, q.p) * (1 + .3 * lift)
          const rx = clamp(-vy * 1.1, 26) * (1 - q.p) + deitaMax * q.p ** 3
          push(q.t * fimV, q.x, q.y, sc, rx, clamp(vx * 1.4, 28) * (1 - q.p * .6), lerp(giro0, giro1, q.p), clamp(-vx * .45, 9) * lift, lift)
        })
        push(.88, B.x, B.y, .95, deitaMax, 0, giro1 + 1.6, 0, 0)
        push(.95, B.x, B.y, 1.025, deitaMax, 0, giro1 - .6, 0, 0)
        push(1, B.x, B.y, 1, deitaMax, 0, giro1, 0, 0)
      } else {
        const M = { x: lerp(A.x, B.x, .82) + lado * h, y: B.y - 17 * h }
        const N = 8
        for (let i = 0; i <= N; i++) {
          const t = i / N, p = 1 - (1 - t) ** 2.4
          const x = (1 - p) ** 2 * A.x + 2 * (1 - p) * p * ((A.x + M.x) / 2) + p * p * M.x
          const y = (1 - p) ** 2 * A.y + 2 * (1 - p) * p * (Math.min(A.y, M.y) - 4 * h) + p * p * M.y
          push(t * .4, x, y, lerp(s0, 1.6, p), -18 * p, lerp(clamp((B.x - A.x) / W * .8, 24), 0, p), lerp(giro0, giro1 * .4 - lado * 2, p), 0, p)
        }
        push(.47, M.x, M.y - .8 * h, 1.62, -22, 0, giro1 * .4 - lado * 2, 0, 1.05) // ápice: antecipação
        push(.53, M.x, M.y - .4 * h, 1.6, -24, 0, giro1 * .5 - lado * 2, 0, 1)
        push(.64, B.x, B.y, .9, deitaMax, 0, giro1, 0, 0) // bate
        push(.74, B.x, B.y, 1.05, deitaMax, 0, giro1 - 1.5, 0, 0)
        push(.86, B.x, B.y, .985, deitaMax, 0, giro1 + .5, 0, 0)
        push(1, B.x, B.y, 1, deitaMax, 0, giro1, 0, 0)
        if (bate) setTimeout(bate, dur * .64)
      }
      const an = n.animate(fr, { duration: dur, easing: 'linear', fill: 'both' })
      sombra.animate(sf, { duration: dur, easing: 'linear', fill: 'both' })
      if (vira) giroY.animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(180deg)', offset: .1, easing: 'cubic-bezier(.45,0,.2,1)' }, { transform: 'rotateY(0deg)', offset: slam ? .45 : .62 }, { transform: 'rotateY(0deg)' }], { duration: dur, fill: 'both' })
      an.onfinish = () => { n.remove(); fim?.() }
    }, atraso)
  }
  // Giro contínuo num laço próprio: anel (ou desenho de sentido) girando no sentido do jogo e facho de luz que vira
  // suave para quem tem a vez. Os elementos são buscados a cada quadro (o render troca o DOM).
  function criaGiro({ anel, luz, vel, ativo }) {
    const E = { ang: 0, vel: vel(), t: 0, luz: null, alvo: 0 }
    let laco = false
    const passo = ts => {
      if (!ativo() || !tela.isConnected) { laco = false; E.t = 0; return }
      // mesa escondida (outra mesa em foco) ou aba oculta: checa devagar
      if (!tela.getClientRects().length || document.hidden) { E.t = 0; setTimeout(() => requestAnimationFrame(passo), 500); return }
      const dt = E.t ? Math.min(.05, (ts - E.t) / 1000) : 0; E.t = ts
      E.vel += (vel() - E.vel) * Math.min(1, dt * 2.2)
      E.ang = (E.ang + E.vel * dt) % 360
      const g = anel && tela.querySelector(anel); if (g) g.style.rotate = E.ang.toFixed(2) + 'deg'
      if (E.luz != null) {
        const d = ((E.alvo - E.luz) % 360 + 540) % 360 - 180
        if (Math.abs(d) > .05) { E.luz += d * Math.min(1, dt * 6); const l = luz && tela.querySelector(luz); if (l) l.style.rotate = E.luz.toFixed(2) + 'deg' }
      }
      requestAnimationFrame(passo)
    }
    return {
      // depois do render: põe o giro atual nos elementos novos e mira o facho (ângulo em graus ou null = apaga)
      sincroniza(ang) {
        const g = anel && tela.querySelector(anel); if (g) g.style.rotate = E.ang + 'deg'
        const l = luz && tela.querySelector(luz)
        if (l) {
          l.classList.toggle('on', ang != null)
          if (ang != null) { E.alvo = ang; if (E.luz == null || calmo()) E.luz = ang; l.style.rotate = E.luz + 'deg' }
        }
        if (!laco && !calmo() && ativo()) { laco = true; requestAnimationFrame(passo) }
      },
      // inverteu o sentido: freia, dá um tranco para o outro lado e volta ao normal
      inverte(el) {
        E.vel *= .15
        setTimeout(() => { E.vel = vel() * 11 }, 170)
        const a = el && tela.querySelector(el)
        if (a && !calmo()) a.animate([{ scale: 1 }, { scale: .9, offset: .25 }, { scale: 1.16, offset: .55 }, { scale: 1 }], { duration: 650, easing: 'cubic-bezier(.3,.7,.3,1)' })
      },
    }
  }
  // ângulo no plano da mesa (antes da inclinação) do ponto (cx, cy) até o assento posicionado em % (left/top)
  function anguloAte(plano, assento, cy = .52, euY = 1.2) {
    const W = plano.offsetWidth, H = plano.offsetHeight
    const sx = assento ? parseFloat(assento.style.left) / 100 * W : W / 2, sy = assento ? parseFloat(assento.style.top) / 100 * H : H * euY
    return Math.atan2(sy - H * cy, sx - W / 2) * 180 / Math.PI
  }
  return { calmo, cqh, noTela, ponto, pousando, fotos, flip, inclina, pousa, treme, impacto, voo, criaGiro, anguloAte }
}
