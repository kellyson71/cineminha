/* Jogos no app: os mesmos módulos do site (public/*.js), montados com o mesmo ctx que o app.js dá a eles. */
import { FONTES, JOGOS } from '@site/core/jogos.js'
import { ICONS, person, asset } from '../data.js'
import { api } from '@site/core/rede.js'
import * as sala from './sala.js'
import { audioCtx, saidaJogo } from './audio.js'

export { JOGOS }
const jogos = {} // id -> jogo carregado
const carregando = {}
const ativos = new Set()
const subs = new Set()
export const onJogos = f => { subs.add(f); return () => subs.delete(f) }
export const jogosAtivos = () => [...ativos]
const avisa = () => subs.forEach(f => f([...ativos]))

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter(k => k !== '' && k != null)); return e }
function setIcon(svg, name) {
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true'); svg.dataset.icon = name; svg.innerHTML = ICONS[name] || ''
}
const icon = name => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); setIcon(s, name); return s }
function pfpImg(key, size, name) {
  const p = person(key, name)
  const txt = () => el('span', { className: 'pfp pfp--txt', textContent: (p.nome || '?')[0].toUpperCase(), style: `background:${p.cor};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px` })
  if (!p.foto) return txt()
  const img = el('img', { className: 'pfp', alt: '', width: size, height: size, src: asset(p.foto) })
  img.onerror = () => img.replaceWith(txt())
  return img
}
// o ctx lê o "me" sempre atualizado
const me = new Proxy({}, { get: (_, k) => sala.getSala().me[k] })

function ctxJogo(id) {
  const J = JOGOS[id]
  const tela = el('div', { className: J.tela, id: J.tela + 'Tela' })
  document.querySelector('#screenInner')?.append(tela)
  return {
    $: s => document.querySelector(s), el, icon, toast: sala.toast, sysMsg: sala.sysMsg, me, tela,
    send: (d, target) => sala.enviarJogo(d, target),
    sendTo: (key, d) => sala.enviarJogoPara(key, d),
    audioCtx, saida: saidaJogo,
    presentes: sala.presentes, nomeDe: sala.nomeDaKey,
    pfp: (k, s, n) => pfpImg(k, s, n),
    boneco: k => asset(person(k).boneco) || '',
    falando: k => { const s = sala.getSala(); return k === s.me.key ? s.me.speaking && !s.me.muted : Object.values(s.peers).some(p => p.key === k && p.speaking && !p.muted) },
    mudo: () => { const m = sala.getSala().me; return m.muted || m.deaf },
    outroJogo: () => false, faixaAtiva: () => false,
    hydrate: root => root.querySelectorAll('svg[data-icon]').forEach(s => setIcon(s, s.dataset.icon)),
    digitando: () => document.activeElement?.id === 'chatInput',
    onAtivo: on => { if (on) ativos.add(id); else ativos.delete(id); sala.setMe({ mesa: ativos.size ? [...ativos].at(-1) : '' }); avisa() },
    salvaRes: r => { const s = sala.getSala(); return api('sala', { method: 'POST', body: { op: 'faixa-res', pw: s.pw, key: s.me.key, nome: s.me.name, ...r } }) },
    verDias: async datas => (await api('sala', { method: 'POST', body: { op: 'faixa-ver', pw: sala.getSala().pw, datas } }))?.res || {},
    digitandoFaixa: (key, on, txt) => sala.emitir('dig', key, on, txt),
    balao: (key, text) => sala.emitir('balao', key, text),
  }
}

const css = h => document.querySelector(`link[href="${h}"]`) ? null : new Promise(ok => { const l = el('link', { rel: 'stylesheet', href: h }); l.onload = l.onerror = ok; document.head.append(l) })
export function carregaJogo(id) {
  if (jogos[id]) return Promise.resolve(jogos[id])
  if (carregando[id]) return carregando[id]
  const J = JOGOS[id]
  if (!J) return Promise.resolve(null)
  carregando[id] = (async () => {
    try {
      if (J.fontes) document.head.append(el('link', { rel: 'stylesheet', href: `${FONTES}${J.fontes}&display=swap` }))
      await Promise.all(J.css.map(css))
      const m = await import(/* @vite-ignore */ new URL(J.mod, document.baseURI).href)
      return (jogos[id] = m[J.cria](ctxJogo(id)))
    } catch (e) { console.error(e); sala.toast(`Não consegui abrir ${J.nome}. Tente de novo.`); return null }
    finally { delete carregando[id] }
  })()
  return carregando[id]
}
export async function abreJogo(id) {
  if (jogos[id]?.ativo?.()) return
  const j = await carregaJogo(id)
  j?.iniciar()
}

sala.registraJogos({
  got: (id, x, k) => (jogos[id] ? jogos[id].got(x, k) : carregaJogo(id).then(j => j?.got(x, k))),
  entrouAlguem: k => Object.values(jogos).forEach(j => j?.entrouAlguem?.(k)),
  onPeerJoin: peerId => jogos.faixa?.onPeerJoin?.(peerId),
})
export const interceptaChat = text => !!jogos.faixa?.interceptaChat?.(text)
