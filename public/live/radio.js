/* Rádio da live: playlists do Spotify ou do YouTube tocam pelo YouTube (inteiras, sem login), como a rádio da sala.
   O estúdio cuida da fila e diz qual música e desde quando; cada lado toca no próprio navegador, no mesmo ponto. */
import { parseRadio } from '../radio.js'

const api = p => fetch('../api/' + p).then(r => r.ok ? r.json() : null).catch(() => null)
export const buscaMusica = q => api('musica?ytq=' + encodeURIComponent(q)).then(r => (r?.lista || []).filter(x => /^[\w-]{11}$/.test(x.id)).slice(0, 12))
export const minutos = s => { s = Math.round(s || 0); return `${s / 60 | 0}:${String(s % 60).padStart(2, '0')}` }

let ytPronto = null
function ytApi() {
  if (window.YT?.Player) return Promise.resolve()
  return ytPronto ||= new Promise(ok => {
    const antes = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { antes?.(); ok() }
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.append(s)
  })
}

// player escondido: segue o estado { yt, inicio, pausado, pos } no relógio do estúdio; volume com rampa
export function criaPlayer({ volume = 45, aoAcabar, aoDuracao } = {}) {
  let yt = null, pronto = false, atual = null, ativo = false, agora = () => Date.now()
  let alvoVol = volume, volAtual = volume
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;width:2px;height:2px;left:-10px;top:-10px;opacity:0;pointer-events:none'
  document.body.append(host)
  async function cria(id, at) {
    await ytApi()
    const div = document.createElement('div'); host.append(div)
    await new Promise(ok => {
      yt = new YT.Player(div, {
        videoId: id, width: 2, height: 2,
        playerVars: { autoplay: 1, playsinline: 1, start: Math.floor(at), controls: 0, disablekb: 1 },
        events: {
          onReady: () => { pronto = true; yt.setVolume(Math.round(volAtual)); ok(); aplica() },
          onStateChange: e => {
            if (e.data === YT.PlayerState.ENDED) aoAcabar?.()
            if (e.data === YT.PlayerState.PLAYING) { const d = yt.getDuration?.(); if (d > 0) aoDuracao?.(atual?.yt, Math.round(d)) }
          },
          onError: () => aoAcabar?.(true),
        },
      })
    })
  }
  const pos = () => !atual ? 0 : atual.pausado ? atual.pos || 0 : Math.max(0, (agora() - atual.inicio) / 1000)
  async function aplica() {
    if (!atual?.yt || !ativo || atual.pausado) { if (pronto) yt.pauseVideo(); return }
    if (!yt) return cria(atual.yt, pos())
    if (!pronto) return
    if (yt.getVideoData?.()?.video_id !== atual.yt) { yt.loadVideoById({ videoId: atual.yt, startSeconds: pos() }); return }
    if (Math.abs((yt.getCurrentTime?.() || 0) - pos()) > 2.5) yt.seekTo(pos(), true)
    if (yt.getPlayerState?.() !== YT.PlayerState.PLAYING) yt.playVideo()
  }
  setInterval(() => { if (ativo && atual) aplica() }, 4000)
  setInterval(() => {
    if (Math.abs(alvoVol - volAtual) < .5) return
    volAtual += Math.sign(alvoVol - volAtual) * Math.max(.5, Math.abs(alvoVol - volAtual) * .25)
    if (pronto) yt.setVolume(Math.round(volAtual))
  }, 40)
  return {
    segue(radio, on, relogio) {
      if (relogio) agora = relogio
      const mudou = radio?.yt !== atual?.yt || on !== ativo || !!radio?.pausado !== !!atual?.pausado || radio?.inicio !== atual?.inicio
      atual = radio; ativo = on && !!radio
      if (mudou) aplica()
    },
    volume(v) { alvoVol = Math.max(0, Math.min(100, v)) },
    posicao: pos,
  }
}

// fila do estúdio
export function criaRadioEstudio({ aoMudar, aoFila }) {
  let fila = [], i = -1, atual = null, tocando = false, pausaPos = 0, nome = '', uid = 0
  const achar = new Map()
  const limpa = x => ({ uid: ++uid, k: x.k === 'yt' ? 'yt' : 'sp', id: String(x.id), t: String(x.t || 'Música').slice(0, 120), a: String(x.a || '').slice(0, 80), c: x.c || '', d: +x.d || 0, pedido: x.pedido || '' })
  function yt(it) {
    if (it.k === 'yt') return Promise.resolve(it.id)
    if (!achar.has(it.id)) achar.set(it.id, api(`musica?busca=${encodeURIComponent(it.id)}&t=${encodeURIComponent(it.t)}&a=${encodeURIComponent(it.a)}&d=${it.d || 0}`).then(r => r?.yt || null))
    return achar.get(it.id)
  }
  const estado = () => atual && { yt: atual.yt, t: atual.t, a: atual.a, c: atual.c, d: atual.d, pedido: atual.pedido, inicio: atual.inicio, pausado: !tocando, pos: tocando ? 0 : pausaPos }
  const snap = () => ({ nome, i, tocando, atual: atual?.uid, itens: fila.map(({ uid, t, a, c, d, pedido }) => ({ uid, t, a, c, d, pedido })) })
  const emite = () => { aoMudar(estado()); aoFila(snap()) }
  async function tocaIdx(k, { pos = 0, pausado = false } = {}) {
    if (!fila.length) { atual = null; tocando = false; emite(); return }
    for (let n = 0; n < fila.length; n++) {
      const j = ((k + n) % fila.length + fila.length) % fila.length, it = fila[j], id = await yt(it)
      if (!id) continue
      i = j
      atual = { ...it, yt: id, c: it.c || capaLista, inicio: Date.now() - pos * 1000 }
      tocando = !pausado; pausaPos = 0
      yt(fila[(i + 1) % fila.length]) // já procura a próxima
      emite(); return
    }
  }
  let capaLista = ''
  async function carrega(link, { substituir = true, tocar = true } = {}) {
    const p = parseRadio(link)
    if (!p) return { erro: 'Cole um link de playlist, álbum ou música do Spotify ou do YouTube.' }
    let itens = [], titulo = ''
    if (p.k === 'sp') {
      const r = await api('musica?u=' + encodeURIComponent(p.uri))
      itens = r?.lista || []; titulo = r?.titulo || 'Spotify'; if (substituir) capaLista = r?.capa || ''
    } else {
      if (p.lista) { const r = await api(`musica?ytlista=${p.lista}${p.id ? '&v=' + p.id : ''}`); itens = r?.lista || []; titulo = 'Playlist do YouTube' }
      if (!itens.length && p.id) { const o = (await api('musica?yt=' + p.id)) || {}; itens = [{ k: 'yt', id: p.id, t: o.titulo || 'Vídeo do YouTube', a: o.artista || '', c: `https://i.ytimg.com/vi/${p.id}/hqdefault.jpg` }]; titulo ||= o.titulo }
    }
    if (!itens.length) return { erro: 'Não consegui abrir esse link.' }
    itens = itens.map(limpa)
    if (substituir) {
      for (let k = itens.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [itens[k], itens[j]] = [itens[j], itens[k]] }
      // pedidos que ainda não tocaram continuam na frente
      const pedidos = fila.slice(i + 1).filter(x => x.pedido)
      fila = [...pedidos, ...itens]; nome = titulo; i = -1
      await tocaIdx(0, { pausado: !tocar })
    } else { fila.splice(i + 1, 0, ...itens); emite() }
    return { n: itens.length, titulo }
  }
  // música avulsa (busca do estúdio ou pedido dela): entra depois dos outros pedidos
  function adiciona(x, { agora = false } = {}) {
    const it = limpa(x)
    let k = i + 1
    while (k < fila.length && fila[k].pedido && !agora) k++
    fila.splice(k, 0, it)
    if (agora || !atual) tocaIdx(k); else emite()
    return it
  }
  const play = () => { if (!atual) return tocaIdx(Math.max(0, i)); if (!tocando) { atual.inicio = Date.now() - pausaPos * 1000; tocando = true; emite() } }
  const pausa = () => { if (!atual || !tocando) return; pausaPos = (Date.now() - atual.inicio) / 1000; tocando = false; emite() }
  const parar = () => { if (!atual) return; pausaPos = 0; tocando = false; emite() }
  const anterior = () => { if (atual && tocando && Date.now() - atual.inicio > 5000) { atual.inicio = Date.now(); emite() } else tocaIdx(i - 1) }
  function remove(u) {
    const k = fila.findIndex(x => x.uid === u); if (k < 0) return
    fila.splice(k, 1)
    if (k < i) i--
    else if (k === i) { i--; return tocaIdx(i + 1) }
    emite()
  }
  // reserva: se o player não avisar o fim, a duração da faixa avança a rádio
  setInterval(() => { if (tocando && atual?.d && Date.now() - atual.inicio > (atual.d + 4) * 1000) tocaIdx(i + 1) }, 3000)
  return {
    carrega, adiciona, play, pausa, parar, anterior, remove,
    proxima: () => tocaIdx(i + 1),
    tocaUid: u => { const k = fila.findIndex(x => x.uid === u); if (k >= 0) tocaIdx(k) },
    duracao: (id, d) => { if (atual?.yt === id && !atual.d) { atual.d = d; if (fila[i]) fila[i].d = d; emite() } },
    get tocando() { return tocando }, get atual() { return estado() },
  }
}
