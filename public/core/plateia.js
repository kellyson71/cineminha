/* Planta da sala: todo mundo (site e app) calcula o mesmo lugar para cada pessoa.
   layout = { porFileira, vazias, poltronas: ['' livre | 'guest' convidados | id de quem tem lugar] } */
export const defaultLayout = pessoas => ({ porFileira: 8, vazias: false, poltronas: pessoas.filter(p => !p.ausente).map(p => p.id) })
export function cleanLayout(l, pessoas) {
  const ids = new Set(pessoas.map(p => p.id))
  const poltronas = (Array.isArray(l?.poltronas) ? l.poltronas : []).slice(0, 60).map(s => s === 'guest' || ids.has(s) ? s : '')
  return { porFileira: Math.max(1, Math.min(16, +l?.porFileira || 8)), vazias: !!l?.vazias, poltronas: poltronas.length ? poltronas : defaultLayout(pessoas).poltronas }
}
export const canSitIn = (slots, taken, i, key) => i >= 0 && i < slots.length && !taken.has(i) && (slots[i] === '' || slots[i] === key || (slots[i] === 'guest' && key.startsWith('g:')))
// 1º quem escolheu um lugar, 2º lugar reservado, 3º convidado em lugar de convidado, 4º qualquer livre
export function seatPlan(layout, people) {
  const slots = layout.poltronas.slice()
  const taken = new Map(), placed = new Map()
  const order = [...people].sort((a, b) => (a.key < b.key ? -1 : 1))
  const sit = (i, key) => { taken.set(i, key); placed.set(key, i) }
  for (const p of order) if (Number.isInteger(p.seat) && canSitIn(slots, taken, p.seat, p.key)) sit(p.seat, p.key)
  for (const p of order) if (!placed.has(p.key)) { const i = slots.indexOf(p.key); if (canSitIn(slots, taken, i, p.key)) sit(i, p.key) }
  for (const p of order) {
    if (placed.has(p.key)) continue
    let i = p.key.startsWith('g:') ? slots.findIndex((s, j) => s === 'guest' && !taken.has(j)) : -1
    if (i < 0) i = slots.findIndex((s, j) => s === '' && !taken.has(j))
    if (i < 0) { i = slots.length; slots.push('') }
    sit(i, p.key)
  }
  return { slots, taken, placed }
}
