/* Sala P2P da live: estúdio, página dela e celular (câmera). Mesmo Trystero/TURN da sala do Cineminha.
   O código da live (na URL: ?c=...) é a senha da sala; quem não tem o código não entra. */
import { joinRoom, selfId } from '../vendor/trystero.js'
import { roomIdDe, criaFilmPC } from '../core/rede.js'
import CFG from '../config.js'

// estado: estúdio → todos · chat: todos · pix/linha/pedido (música): ela → estúdio
// pixtoca: estúdio → todos (a hora certa da animação) · mix: estúdio → todos (rádio abaixa quando ele fala)
const ACOES = ['papel', 'estado', 'chat', 'pix', 'linha', 'pixtoca', 'pedido', 'mix', 'camcmd', 'voto', 'mod'] // camcmd: estúdio → celular (trocar a câmera)

export const codigoDaUrl = () => (new URLSearchParams(location.search).get('c') || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16)
export function novoCodigo() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), b => a[b % a.length]).join('')
}

// Vídeo em H.264 primeiro: é o formato que o circuito de vídeo do PC (Intel Quick Sync) e dos celulares
// codificam sem usar o processador. VP8/VP9 ficam de reserva se o outro lado não tiver H.264.
const H264 = c => /video\/h264/i.test(c.mimeType)
const ordemH264 = () => {
  const cods = RTCRtpSender.getCapabilities?.('video')?.codecs || []
  // perfil "constrained baseline" com packetization-mode=1 é o que os codificadores de hardware aceitam melhor
  const nota = c => (H264(c) ? 10 : 0) + (/packetization-mode=1/.test(c.sdpFmtpLine || '') ? 2 : 0) + (/profile-level-id=42e0/.test(c.sdpFmtpLine || '') ? 1 : 0)
  return cods.slice().sort((a, b) => nota(b) - nota(a))
}
const Base = criaFilmPC()
class LivePC extends Base {
  addTrack(trilha, ...streams) {
    const sender = super.addTrack(trilha, ...streams)
    if (trilha.kind === 'video') try { this.getTransceivers().find(t => t.sender === sender)?.setCodecPreferences(ordemH264()) } catch {}
    return sender
  }
}

// ponte TURN (mesma rota da sala; aqui o caminho sai de /live/)
async function turn() {
  try { const c = JSON.parse(localStorage.getItem('cine.turn')); if (c && Date.now() - c.t < 20 * 3600e3) return c.ice } catch {}
  const r = await fetch('../api/sala', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'turn', pw: CFG.senhaAberta }) }).then(r => r.ok ? r.json() : null).catch(() => null)
  const ice = r?.iceServers || []
  if (ice.length) try { localStorage.setItem('cine.turn', JSON.stringify({ t: Date.now(), ice })) } catch {}
  return ice
}

export async function entraLive(codigo, papel, perfil = null) {
  const pw = 'live:' + codigo
  const roomId = await roomIdDe(pw, 'live')
  const ice = await Promise.race([turn(), new Promise(r => setTimeout(() => r([]), 6000))])
  const room = joinRoom({ appId: CFG.appId, password: pw, rtcPolyfill: LivePC, turnConfig: ice }, roomId)
  const papeis = new Map() // peerId → 'estudio' | 'ela' | 'amigo' | 'cam'
  const perfis = new Map() // peerId → { key, nome } (amigos: a conta do Cineminha)
  const ouvintes = { entrou: [], saiu: [], papel: [], stream: [] }
  const emite = (ev, ...a) => ouvintes[ev].forEach(f => { try { f(...a) } catch (e) { console.error(e) } })

  const acoes = {}
  for (const n of ACOES) {
    const a = room.makeAction(n), fs = []
    a.onMessage = (d, { peerId }) => fs.forEach(f => { try { f(d, peerId) } catch (e) { console.error(e) } })
    acoes[n] = { send: (d, alvo) => a.send(d, alvo ? { target: alvo } : undefined), on: f => fs.push(f) }
  }
  acoes.papel.on((p, id) => {
    if (!['estudio', 'ela', 'amigo', 'cam'].includes(p?.papel)) return
    const novo = papeis.get(id) !== p.papel
    papeis.set(id, p.papel)
    // extras: k = chave do link dela, ap = este aparelho (para remover de vez), conf = perfil confirmado (logado no Cineminha)
    const txt = (v, n) => typeof v === 'string' ? v.slice(0, n) : ''
    const extra = { ap: txt(p.perfil?.ap, 40), conf: p.perfil?.conf === true }
    if (p.papel === 'ela') perfis.set(id, { key: 'ela', nome: '', k: txt(p.perfil?.k, 40), ...extra })
    else if (p.papel === 'amigo' && typeof p.perfil?.key === 'string') perfis.set(id, { key: p.perfil.key.slice(0, 40), nome: String(p.perfil.nome || 'Convidado').replace(/[<>]/g, '').slice(0, 24), ...extra })
    if (novo) emite('papel', id, p.papel)
  })
  room.onPeerJoin = id => { acoes.papel.send({ papel, perfil }, id); emite('entrou', id) }
  room.onPeerLeave = id => { const p = papeis.get(id), pf = perfis.get(id); papeis.delete(id); perfis.delete(id); emite('saiu', id, p, pf) }
  room.onPeerStream = (stream, id, meta) => emite('stream', stream, id, meta || {})

  return {
    room, acoes, papeis, perfis, selfId,
    // quem assiste: a amor e os amigos
    publico: () => [...papeis].filter(([, x]) => x === 'ela' || x === 'amigo').map(([id]) => id),
    on: (ev, f) => ouvintes[ev].push(f),
    quem: p => [...papeis].filter(([, x]) => x === p).map(([id]) => id),
    manda: (stream, alvo, metadata) => room.addStream(stream, { target: alvo, metadata }),
    tira: (stream, alvo) => { try { room.removeStream(stream, { target: alvo }) } catch {} },
  }
}
