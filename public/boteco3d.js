// Mesa de bar na calçada do Marcílio Bar, atrás das cartas do Uno e do Dobro.
// Modelo e skins vêm do mod "Traditional Brazilian Bar Table" (Oficina do Tabletop Simulator, Jerry123i), a pedido
// do usuário; o fundo é uma imagem fixa (fundo-bar.webp, gerada pelo usuário a partir de uma foto do bar), posta no
// palco pelo CSS (.b3d-fundo), igual para todo mundo. Créditos em jogos/boteco/CREDITOS.txt.
//
// Leve de propósito: as cartas continuam em HTML. A mesa tem dois modos:
// - '3d': o Three.js (public/vendor, baixado só aqui) desenha a mesa UMA vez, o quadro é copiado para um canvas 2D
//   comum e o contexto WebGL é descartado. Só volta a desenhar ao redimensionar ou trocar a cor.
// - '2d': sem WebGL nenhum; o tampo é a própria textura recortada num div deitado no plano das cartas (CSS 3D).
// O modo vem de localStorage 'mesa.qualidade' ('3d' | '2d'); sem escolha, máquina fraca fica no 2D.
// A câmera do 3D é montada a partir do CSS calculado do palco (perspective, perspective-origin) e do plano
// (posição, rotateX, transform-origin), então a mesa desenhada casa com o plano onde as cartas ficam.

const BASE = 'jogos/boteco/'
export const SKINS_BAR = [['skol', 'Skol', '#e9c912'], ['brahma', 'Brahma', '#d8312b'], ['antarctica', 'Antarctica', '#155a96'], ['branca', 'Branca', '#dedad4']]
const TAMPO_UV = .2705 // o tampo ocupa o canto inferior esquerdo da textura (27% × 27%)
let threeP = null, objP = null
const carregaThree = () => threeP ||= import('./vendor/three.module.min.js')
const carregaObj = () => objP ||= fetch(BASE + 'mesa.obj').then(r => { if (!r.ok) throw new Error('mesa.obj'); return r.text() }).then(leObj)
const ls = { get: k => { try { return localStorage.getItem(k) } catch { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch {} } }

// qualidade da mesa: escolha da pessoa ou, sem escolha, 2D em máquina fraca
export function qualidadeMesa() {
  const q = ls.get('mesa.qualidade')
  if (q === '3d' || q === '2d') return q
  const mem = navigator.deviceMemory || 8, cpu = navigator.hardwareConcurrency || 8
  return mem <= 2 || cpu <= 2 ? '2d' : '3d'
}
export const escolheQualidadeMesa = q => ls.set('mesa.qualidade', q)

// leitor de OBJ mínimo (v / vt / vn / f, faces em leque): devolve arrays não indexados
function leObj(txt) {
  const v = [], vt = [], vn = [], pos = [], uv = [], nor = []
  for (const l of txt.split('\n')) {
    const p = l.trim().split(/\s+/)
    if (p[0] === 'v') v.push(p.slice(1, 4).map(Number))
    else if (p[0] === 'vt') vt.push(p.slice(1, 3).map(Number))
    else if (p[0] === 'vn') vn.push(p.slice(1, 4).map(Number))
    else if (p[0] === 'f') {
      const ids = p.slice(1).map(s => s.split('/').map(n => parseInt(n, 10)))
      const idx = (n, arr) => n > 0 ? n - 1 : arr.length + n
      for (let i = 1; i < ids.length - 1; i++) for (const q of [ids[0], ids[i], ids[i + 1]]) {
        pos.push(...v[idx(q[0], v)])
        uv.push(...(q[1] ? vt[idx(q[1], vt)] : [0, 0]))
        if (q[2]) nor.push(...vn[idx(q[2], vn)])
      }
    }
  }
  return { pos, uv, nor: nor.length === pos.length ? nor : null }
}

export function criaBoteco({ tela, palco, plano, centro = [.5, .52], tamanho = [.74, .78] }) {
  let skin = null, ligado = false, modo = null, versao = 0, timer = 0, tamAnt = '', falhou3d = false
  const quadro = document.createElement('canvas'); quadro.className = 'b3d'; quadro.setAttribute('aria-hidden', 'true')
  const tampo = document.createElement('div'); tampo.className = 'b2d-tampo'; tampo.setAttribute('aria-hidden', 'true')
  const calmo = () => matchMedia('(prefers-reduced-motion: reduce)').matches
  new ResizeObserver(() => { if (ligado && modo === '3d') pede() }).observe(tela)

  const fundoNoPalco = () => { const pal = tela.querySelector(palco); if (pal) pal.classList.toggle('b3d-fundo', ligado) }
  // põe a mesa (quadro do 3D ou tampo 2D) no DOM novo depois de cada render do jogo
  function poe() {
    const pal = tela.querySelector(palco), pla = tela.querySelector(plano)
    if (!pal || !pla) return
    if (modo === '3d') { tampo.remove(); if (quadro.parentNode !== pal) pal.prepend(quadro) }
    else {
      quadro.remove()
      if (tampo.parentNode !== pla) pla.prepend(tampo)
      const cor = (SKINS_BAR.find(s => s[0] === skin) || SKINS_BAR[0])[2]
      tampo.style.cssText = `left:${(centro[0] - tamanho[0] / 2) * 100}%;top:${(centro[1] - tamanho[1] / 2) * 100}%;width:${tamanho[0] * 100}%;height:${tamanho[1] * 100}%;` +
        `--tampo:url(${BASE}mesa-${skin}.webp);--tampo-cor:${cor};--tampo-uv:${100 / TAMPO_UV}%`
      tela.classList.add('b3d-ok')
    }
  }
  // agrupa pedidos de desenho (resize em sequência, vários renders)
  function pede() {
    clearTimeout(timer)
    timer = setTimeout(() => desenha3d(), 120)
  }
  async function desenha3d() {
    if (!ligado || modo !== '3d') return
    const pal = tela.querySelector(palco), pla = tela.querySelector(plano)
    if (!pal || !pla || !pal.clientWidth) return
    const W = pal.clientWidth, H = pal.clientHeight, dpr = Math.min(devicePixelRatio || 1, 1.5)
    const tam = `${W}x${H}x${dpr}x${skin}`
    if (tam === tamAnt && quadro.width) return poe()
    const v = ++versao
    let T, o, renderer = null
    try {
      ;[T, o] = await Promise.all([carregaThree(), carregaObj()])
      const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = `${BASE}mesa-${skin}.webp` })
      if (v !== versao || !ligado || modo !== '3d') return
      // um renderer descartável: desenha uma vez e some
      const cv = document.createElement('canvas')
      renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'low-power' })
      renderer.setClearColor(0x000000, 0); renderer.setPixelRatio(dpr); renderer.setSize(W, H, false)
      renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05
      const scene = new T.Scene(), camera = new T.PerspectiveCamera()
      scene.add(new T.HemisphereLight(0xffe3bd, 0x2b1d14, 1.25))
      const balcao = new T.DirectionalLight(0xffd29a, 1.7); balcao.position.set(0, .8, .7); scene.add(balcao)
      const poste = new T.DirectionalLight(0xdfe8ff, .5); poste.position.set(.8, .3, .5); scene.add(poste)
      const geo = new T.BufferGeometry()
      geo.setAttribute('position', new T.Float32BufferAttribute(o.pos, 3))
      geo.setAttribute('uv', new T.Float32BufferAttribute(o.uv, 2))
      if (o.nor) geo.setAttribute('normal', new T.Float32BufferAttribute(o.nor, 3)); else geo.computeVertexNormals()
      geo.computeBoundingBox()
      const tex = new T.Texture(img); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4; tex.needsUpdate = true
      const mesa = new T.Mesh(geo, new T.MeshStandardMaterial({ map: tex, roughness: .5, metalness: 0 }))
      mesa.rotation.x = Math.PI / 2
      // sombra de contato no chão, embaixo da mesa
      const bb = geo.boundingBox, c2 = document.createElement('canvas'); c2.width = c2.height = 128
      const g2 = c2.getContext('2d'), rg = g2.createRadialGradient(64, 64, 8, 64, 64, 64)
      rg.addColorStop(0, 'rgba(0,0,0,.72)'); rg.addColorStop(.55, 'rgba(0,0,0,.45)'); rg.addColorStop(1, 'rgba(0,0,0,0)')
      g2.fillStyle = rg; g2.fillRect(0, 0, 128, 128)
      const sombra = new T.Mesh(new T.PlaneGeometry((bb.max.x - bb.min.x) * 1.55, (bb.max.z - bb.min.z) * 1.55), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c2), transparent: true, depthWrite: false }))
      sombra.rotation.x = -Math.PI / 2; sombra.position.set((bb.max.x + bb.min.x) / 2 + .6, bb.min.y + .02, (bb.max.z + bb.min.z) / 2 + .4)
      mesa.add(sombra)
      const grupo = new T.Group(); grupo.add(mesa); scene.add(grupo)
      // câmera do CSS: olho em (ox, oy, P) olhando para o plano da tela; frustum assimétrico cobrindo o palco
      const cs = getComputedStyle(pal), P = parseFloat(cs.perspective) || 1000
      const [ox, oy] = cs.perspectiveOrigin.split(' ').map(parseFloat)
      camera.position.set(ox, -oy, P); camera.updateMatrixWorld()
      camera.projectionMatrix.makePerspective(-ox / P, (W - ox) / P, oy / P, (oy - H) / P, 1, P * 40)
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
      // plano das cartas: posição, rotateX e origem da transformação (coordenadas do CSS com y para baixo)
      const cp = getComputedStyle(pla), m = new DOMMatrix(cp.transform === 'none' ? undefined : cp.transform)
      const a = Math.atan2(m.m23, m.m22)
      const [tox, toy] = cp.transformOrigin.split(' ').map(parseFloat)
      grupo.position.set(pla.offsetLeft + tox, -(pla.offsetTop + toy), 0); grupo.rotation.set(-a, 0, 0)
      const PW = pla.offsetWidth, PH = pla.offsetHeight, lx = bb.max.x - bb.min.x, lz = bb.max.z - bb.min.z
      const sx = PW * tamanho[0] / lx, sz = PH * tamanho[1] / lz, sy = (sx + sz) / 2
      mesa.scale.set(sx, sy, sz)
      const cx = PW * centro[0] - tox, cy = PH * centro[1] - toy
      mesa.position.set(cx - (bb.max.x + bb.min.x) / 2 * sx, -cy + (bb.max.z + bb.min.z) / 2 * sz, -bb.max.y * sy)
      renderer.render(scene, camera)
      // copia o quadro para o canvas 2D (na mesma tarefa, antes de o navegador limpar o buffer) e descarta o WebGL
      quadro.width = cv.width; quadro.height = cv.height
      const g = quadro.getContext('2d'); g.clearRect(0, 0, quadro.width, quadro.height); g.drawImage(cv, 0, 0)
      tamAnt = tam
      geo.dispose(); tex.dispose(); mesa.material.dispose(); sombra.geometry.dispose(); sombra.material.map.dispose(); sombra.material.dispose()
      renderer.dispose(); renderer.forceContextLoss(); renderer = null
      poe()
      tela.classList.add('b3d-ok')
    } catch (e) {
      // sem WebGL (ou falhou): fica a mesa 2D
      console.warn('[boteco3d] sem 3D, usando a mesa 2D:', e)
      try { renderer?.dispose(); renderer?.forceContextLoss() } catch {}
      falhou3d = true
      if (v === versao && ligado) { modo = '2d'; poe() }
    }
  }
  // a mesa sente a pancada (batida, compra grande, carta pousando): afunda um pouco e volta
  function balanca(f = 1) {
    if (!ligado || calmo()) return
    const alvo = modo === '3d' ? quadro : tampo
    if (!alvo.isConnected) return
    const d = .55 * f
    alvo.animate([{ translate: '0 0', scale: '1' }, { translate: `0 ${d}cqh`, scale: `${1 - .006 * f}` }, { translate: `0 ${-d * .35}cqh`, scale: `${1 + .002 * f}` }, { translate: '0 0', scale: '1' }],
      { duration: 260 + 120 * f, easing: 'cubic-bezier(.3,.7,.3,1)' })
  }
  return {
    // liga (ou troca a cor / o modo)
    liga(k) {
      const novoModo = falhou3d ? '2d' : qualidadeMesa()
      const mudou = !ligado || skin !== k || modo !== novoModo
      ligado = true; skin = k; modo = novoModo
      fundoNoPalco()
      poe()
      if (modo === '3d' && (mudou || !quadro.width)) { tamAnt = ''; pede() }
    },
    // depois de cada render do jogo: o palco é novo, a mesa volta para ele
    encaixa() { if (!ligado) return; fundoNoPalco(); poe() },
    balanca,
    desliga() { ligado = false; versao++; clearTimeout(timer); quadro.remove(); tampo.remove(); tela.classList.remove('b3d-ok'); fundoNoPalco() },
    modo: () => modo,
    calmo,
  }
}
