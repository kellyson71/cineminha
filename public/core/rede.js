/* Núcleo de rede do Cineminha, usado pelo site (app.js) e pelo app desktop (app/).
   Só protocolo: nada de DOM aqui. Mudou o protocolo, muda nos dois de uma vez. */

// Ações P2P (Trystero). A ordem não importa, o nome sim: é o que os outros escutam.
export const ACOES = ['hello', 'share', 'chat', 'hist', 'spk', 'need', 'react', 'pausa', 'leg', 'adm', 'ctl', 'mre', 'mid', 'rad', 'jogo']

export const sha = async s => crypto.subtle
  ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('')
  : 'x' + [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(16)

// id da sala P2P: senha + canal ('' = principal)
export const roomIdDe = async (pw, canal) => (await sha('sala:' + pw + (canal ? ':' + canal : ''))).slice(0, 24)

export const guestKey = name => 'g:' + name.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 24)

// API do site (caminho relativo: no app desktop o protocolo cine:// encaminha para o servidor)
export async function api(path, { method = 'GET', body } = {}) {
  try {
    const r = await fetch('api/' + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
    return r.ok ? await r.json() : null
  } catch { return null }
}
// como api(), mas diz o status: para distinguir "token inválido" (404) de "servidor fora do ar agora"
export async function apiStatus(path) {
  try { const r = await fetch('api/' + path, { credentials: 'same-origin' }); return { status: r.status, data: r.ok ? await r.json() : null } } catch { return { status: 0, data: null } }
}

// credencial da ponte (TURN): busca cedo, guarda 20 h (vale 24 h)
let turnReq = null
export function turnServers(pw) {
  try { const c = JSON.parse(localStorage.getItem('cine.turn')); if (c && Date.now() - c.t < 20 * 3600e3) return Promise.resolve(c.ice) } catch {}
  turnReq ||= api('sala', { method: 'POST', body: { op: 'turn', pw } }).then(r => {
    const ice = r?.iceServers || []
    if (ice.length) try { localStorage.setItem('cine.turn', JSON.stringify({ t: Date.now(), ice })) } catch {}
    turnReq = null
    return ice
  })
  return turnReq
}

// "hello" de quem chegou/mudou de estado, já limpo
export function lerHello(d, pessoas = []) {
  if (!d || typeof d.key !== 'string') return null
  return {
    key: d.key,
    name: pessoas.find(x => x.id === d.key)?.nome || String(d.name || 'Visitante').slice(0, 24),
    speaking: !!d.speaking, muted: !!d.muted, deaf: !!d.deaf, away: !!d.away,
    seat: Number.isInteger(d.seat) ? d.seat : -1,
    typing: !!d.typing, hidden: !!d.hidden,
    mesa: typeof d.mesa === 'string' && d.mesa.length < 12 ? d.mesa : '',
    volta: !!d.volta, sai: !!d.sai, perfilAtualizado: !!d.perfilAtualizado,
  }
}
export const helloDe = me => ({ key: me.key, name: me.name, speaking: !!me.speaking, muted: !!me.muted, deaf: !!me.deaf, away: !!me.away, seat: me.seat ?? -1, typing: !!me.typing, hidden: !!me.hidden, mesa: me.mesa || '' })

// o que está passando na tela (ex.: série da Netflix), já limpo
const txt = (v, n) => typeof v === 'string' ? v.slice(0, n) : ''
const url = v => typeof v === 'string' && /^https:\/\/[^\s"'()<>]+$/.test(v) ? v.slice(0, 500) : ''
const num = (v, lo, hi) => Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : 0
function lerMidia(m) {
  if (!m || typeof m !== 'object' || !['netflix'].includes(m.plat) || !txt(m.titulo, 100)) return null
  return {
    plat: m.plat, titulo: txt(m.titulo, 100), s: num(m.s, 0, 99), e: num(m.e, 0, 999), epNome: txt(m.epNome, 100), tipo: m.tipo === 'serie' ? 'serie' : 'filme',
    original: txt(m.original, 120), ano: txt(m.ano, 12), nota: m.nota == null ? null : num(m.nota, 0, 10), poster: url(m.poster), fundo: url(m.fundo), imdb: /^tt\d+$/.test(m.imdb) ? m.imdb : '',
  }
}
// mensagem "share" de quem projeta, já limpa
export function lerShare(d) {
  return {
    kind: d.kind, game: !!d.game, paused: !!d.paused, subs: !!d.subs,
    duration: Math.max(0, +d.duration || 0), rate: Math.max(0.5, Math.min(2, +d.rate || 1)),
    preview: typeof d.preview === 'string' && /^data:image\/jpeg;base64,/.test(d.preview) && d.preview.length < 200000 ? d.preview : '',
    quality: d.quality || 'auto', t: Number.isFinite(+d.t) ? +d.t : NaN, tAt: Date.now(),
    midia: lerMidia(d.midia),
    nfx: d.nfx && typeof d.nfx === 'object' ? {
      ctl: d.nfx.ctl === 'eu' ? 'eu' : 'todos', pular: ['abertura', 'resumo'].includes(d.nfx.pular) ? d.nfx.pular : '', fim: !!d.nfx.fim,
      voto: d.nfx.voto && typeof d.nfx.voto.id === 'string' ? { id: d.nfx.voto.id.slice(0, 20), s: num(d.nfx.voto.s, 0, 99), n: num(d.nfx.voto.n, 0, 99), tot: num(d.nfx.voto.tot, 1, 99), ate: num(d.nfx.voto.ate, 0, 60000), fim: ['sim', 'nao', 'seguiu'].includes(d.nfx.voto.fim) ? d.nfx.voto.fim : '', nq: num(d.nfx.voto.nq, 0, 99), nm: num(d.nfx.voto.nm, 0, 5) } : null,
    } : null,
  }
}

/* ---------- WebRTC: Opus estéreo nas transmissões ---------- */
export function stereoSdp(sdp) {
  const pt = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i)?.[1]
  if (!pt) return sdp
  return sdp.replace(new RegExp(`a=fmtp:${pt} ([^\r\n]*)`), (line, p) =>
    /stereo=1/.test(p) ? line : `a=fmtp:${pt} ${p};stereo=1;sprop-stereo=1;maxaveragebitrate=192000`)
}
// Firefox ao renegociar às vezes reaproveita um id de extensão RTP para outra coisa (ex.: id 2 era
// abs-send-time e vira csrc-audio-level); o Chrome recusa a oferta e a conexão cai e volta sem parar.
// Tira só as linhas de extensão que conflitam com o que já foi combinado (são opcionais).
export function fixExtmap(sdp, antes) {
  const idUri = new Map(), uriId = new Map()
  for (const d of antes) for (const [, id, uri] of (d || '').matchAll(/a=extmap:(\d+)(?:\/\w+)? (\S+)/g)) {
    if (!idUri.has(id)) idUri.set(id, uri)
    if (!uriId.has(uri)) uriId.set(uri, id)
  }
  if (!idUri.size) return sdp
  const nl = sdp.includes('\r\n') ? '\r\n' : '\n'
  return sdp.split(nl).filter(l => {
    const m = l.match(/^a=extmap:(\d+)(?:\/\w+)? (\S+)/)
    if (!m) return true
    const [, id, uri] = m
    const conflito = (idUri.has(id) && idUri.get(id) !== uri) || (uriId.has(uri) && uriId.get(uri) !== id)
    if (conflito) console.info('extmap em conflito removida', id, uri)
    return !conflito
  }).join(nl)
}

// RTCPeerConnection com Opus estéreo e as correções de SDP. Os ganchos são para o diagnóstico de quem usa.
export function criaFilmPC({ aoMudar = () => {}, evento = () => {} } = {}) {
  return class FilmPC extends RTCPeerConnection {
    constructor(cfg) {
      super(cfg)
      this._turn = (cfg?.iceServers || []).some(x => [].concat(x.urls).some(u => /^turns?:/.test(u)))
      this._cands = new Set()
      this._sdps = [] // tudo que esta conexão já combinou ou propôs (ver fixExtmap)
      this.addEventListener('icecandidate', e => { if (e.candidate?.type) this._cands.add(e.candidate.type) })
      this.addEventListener('iceconnectionstatechange', () => {
        const st = this.iceConnectionState
        if (st === 'failed') { aoMudar(this, 'falhou'); evento('falha', `conexão falhou (${this._turn ? 'com' : 'sem'} ponte)`) }
        if (st === 'connected' || st === 'completed') setTimeout(() => aoMudar(this, 'conectou'), 1500)
      })
    }
    async setRemoteDescription(desc) {
      // espera a própria oferta terminar de gravar (colisão: os dois ofereceram juntos)
      if (this._sld) await this._sld.catch(() => {})
      if (desc?.sdp) {
        try { desc = { type: desc.type, sdp: stereoSdp(desc.sdp) } } catch {}
        try { desc = { type: desc.type, sdp: fixExtmap(desc.sdp, [...this._sdps, this.localDescription?.sdp, this.currentRemoteDescription?.sdp, this._extAtivas()]) } } catch {}
      }
      return this._srd(desc, 0)
    }
    // se ainda assim o Chrome recusar por colisão de extensão, tira a linha que ele apontou e tenta de novo
    async _srd(desc, n) {
      try {
        const r = await super.setRemoteDescription(desc)
        if (desc?.sdp) this._sdps.push(desc.sdp)
        return r
      } catch (e) {
        const m = String(e?.message).match(/extension ID reassignment[^]*?id=(\d+)[^]*?new_uri="([^"]+)"/)
        if (!m || n > 6 || !desc?.sdp) throw e
        console.info('extmap recusada, tentando sem ela', m[1], m[2]); evento('sdp', `corrigiu negociação (extensão ${m[1]})`)
        const sdp = desc.sdp.split(/\r?\n/).filter(l => !new RegExp(`^a=extmap:${m[1]}(?:/\\w+)? ${m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).test(l)).join('\r\n')
        return this._srd({ type: desc.type, sdp }, n + 1)
      }
    }
    // extensões que o navegador já tem ativas nos canais (inclui oferta própria desfeita por colisão)
    _extAtivas() {
      try { return this.getTransceivers().flatMap(t => [...(t.getNegotiatedHeaderExtensions?.() || []), ...(t.getHeaderExtensionsToNegotiate?.() || [])]).filter(x => x.id && x.direction !== 'stopped').map(x => `a=extmap:${x.id} ${x.uri}`).join('\n') } catch { return '' }
    }
    setLocalDescription(...a) {
      const r = super.setLocalDescription(...a)
      this._sld = r.then(() => { if (this.localDescription?.sdp) this._sdps.push(this.localDescription.sdp) })
      return r
    }
  }
}
