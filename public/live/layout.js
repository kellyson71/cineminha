/* Onde a sua câmera fica na tela (palco de 1920×1080). O palco desenha a moldura e o estúdio
   desenha a imagem da câmera no mesmo lugar, então os dois usam esta mesma conta. */
export const CAM_BASE = { w: 500, h: 300, borda: 6, raio: 20 }
export const CANTOS = ['br', 'bl', 'tr', 'tl'] // baixo-direita, baixo-esquerda, cima-direita, cima-esquerda
export const TAMANHOS = { p: .75, m: 1, g: 1.3 }

export function camRect({ canto = 'br', tamanho = 'm' } = {}) {
  const s = TAMANHOS[tamanho] || 1, w = CAM_BASE.w * s, h = CAM_BASE.h * s
  const direita = canto[1] !== 'l', embaixo = canto[0] !== 't'
  const x = direita ? 1920 - 64 - w : 64
  const y = embaixo ? 1080 - 92 - h : 70 // embaixo sobra lugar pro nome e pro tempo; em cima, pro selo "ao vivo"
  return { x, y, w, h, s, direita, embaixo }
}
// a área da imagem (dentro da borda da moldura)
export const camImagem = r => ({ x: r.x + CAM_BASE.borda * r.s, y: r.y + CAM_BASE.borda * r.s, w: (CAM_BASE.w - 2 * CAM_BASE.borda) * r.s, h: (CAM_BASE.h - 2 * CAM_BASE.borda) * r.s, r: CAM_BASE.raio * r.s })
