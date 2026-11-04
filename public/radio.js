// Rádio da sala: música de fundo (Spotify ou YouTube) que todo mundo ouve junto, sem ocupar a tela.
// Estado da sala = { fila, i, pos, playing, seq, by }. Quem mexe por último vale (seq maior).
// Os players ficam escondidos; quem controla é o cartão da rádio.

const LS = 'cine.radio'
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const spRe = /open\.spotify\.com\/(?:intl-[\w-]+\/)?(track|album|playlist|episode|show)\/([A-Za-z0-9]{22})|^spotify:(track|album|playlist|episode|show):([A-Za-z0-9]{22})$/
const ytRe = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/|music\.youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/

export function parseRadio(url) {
  url = String(url || '').trim()
  let m = url.match(spRe)
  if (m) return { k: 'sp', uri: `spotify:${m[1] || m[3]}:${m[2] || m[4]}` }
  const lista = (url.match(/[?&]list=([\w-]{10,64})/) || [])[1]
  m = url.match(ytRe)
  if (m) return { k: 'yt', id: m[1], lista }
  if (lista && /youtube\.com\//.test(url)) return { k: 'yt', id: '', lista }
  return null
}

export function criaRadio(ctx) {
  const { $, el, icon, toast, sysMsg, api, ytApi, spApi } = ctx
  let R = null, recv = 0, seq = 0, fimSeq = -1
  let pref = {}
  try { pref = JSON.parse(localStorage.getItem(LS)) || {} } catch {}
  pref = { vol: 0.4, mudo: false, fonte: 'yt', ...pref }
  const salvaPref = () => { try { localStorage.setItem(LS, JSON.stringify(pref)) } catch {} }
  const now = () => !R ? 0 : R.playing ? R.pos + (performance.now() - recv) / 1000 : R.pos
  const cur = () => R?.fila[R.i]
  const snap = () => R && { fila: R.fila, i: R.i, pos: now(), playing: R.playing, seq: R.seq, by: R.by, radio: !!R.radio }
  const send = (d, target) => ctx.send(d, target)
  const info = new Map() // id -> { c, cor, cor2 } (capa e cor, buscadas uma vez)

  /* ---------- estado ---------- */
  function mudar(ch, aviso) {
    if (!R) return
    const pos = ch.pos ?? now()
    R = { ...R, ...ch, pos, seq: ++seq, by: ctx.me.name }
    recv = performance.now()
    send(snap())
    if (aviso) sysMsg(aviso)
    aplicar(); render()
  }
  function got(d) {
    if (!d || typeof d !== 'object' || !Number.isFinite(d.seq)) return
    seq = Math.max(seq, d.seq)
    if (d.vazio) {
      if (!R || d.seq >= R.seq) { fimSeq = d.seq; if (R) sysMsg(`${String(d.by || 'Alguém').slice(0, 24)} desligou a rádio`); limpa() }
      return
    }
    if (d.seq <= fimSeq) return
    if (R && (d.seq < R.seq || (d.seq === R.seq && String(d.by) <= String(R.by)))) return
    const fila = (Array.isArray(d.fila) ? d.fila : []).slice(0, 300).map(limpaItem).filter(Boolean)
    if (!fila.length) return
    const novo = !R
    R = { fila, i: Math.max(0, Math.min(fila.length - 1, d.i | 0)), pos: Math.max(0, +d.pos || 0), playing: !!d.playing, seq: d.seq, by: String(d.by || '').slice(0, 24), radio: !!d.radio }
    recv = performance.now()
    if (novo) sysMsg(`${R.by || 'Alguém'} ligou a rádio: ${fila[0].t || 'música'}`)
    aplicar(); render()
  }
  function limpaItem(x) {
    if (!x || typeof x !== 'object') return null
    if (x.k === 'sp' && !/^spotify:(track|episode):[A-Za-z0-9]{22}$/.test(x.id)) return null
    if (x.k === 'yt' && !/^[\w-]{11}$/.test(x.id)) return null
    if (x.k !== 'sp' && x.k !== 'yt') return null
    const c = typeof x.c === 'string' && /^https:\/\/(i\.scdn\.co|i\.ytimg\.com|image-cdn-[\w-]+\.spotifycdn\.com|mosaic\.scdn\.co)\//.test(x.c) ? x.c : ''
    return { k: x.k, id: x.id, t: String(x.t || '').slice(0, 120), a: String(x.a || '').slice(0, 120), d: Math.max(0, +x.d || 0), c, por: String(x.por || '').slice(0, 24) }
  }
  function limpa() {
    R = null
    try { sp?.pause() } catch {}
    try { yt?.stopVideo?.() } catch {}
    spUri = ''; ytId = ''
    render()
  }
  function desligar() {
    if (!R) return
    fimSeq = ++seq
    send({ vazio: 1, seq: fimSeq, by: ctx.me.name })
    sysMsg(`${ctx.me.name} desligou a rádio`)
    limpa()
  }

  /* ---------- adicionar ---------- */
  async function add(url, { agora } = {}) {
    const p = parseRadio(url)
    if (!p) { toast('Escolha uma música da lista ou cole um link do Spotify ou do YouTube.'); return false }
    let itens = []
    if (p.k === 'sp') {
      const r = await api('musica?u=' + encodeURIComponent(p.uri))
      if (!r?.lista?.length) { toast('Não consegui abrir esse link do Spotify.'); return false }
      itens = r.lista
      if (r.lista.length === 1 && r.cor) info.set(r.lista[0].id, { c: r.capa, cor: r.cor, cor2: r.cor2 })
    } else {
      if (p.lista) {
        const r = await api(`musica?ytlista=${p.lista}${p.id ? '&v=' + p.id : ''}`)
        itens = r?.lista || []
        // link de um vídeo dentro de playlist: começa por ele
        if (p.id) { const k = itens.findIndex(x => x.id === p.id); if (k > 0) itens = itens.slice(k).concat(itens.slice(0, k)) }
      }
      if (!itens.length && p.id) {
        const o = (await api('musica?yt=' + p.id)) || {}
        itens = [{ k: 'yt', id: p.id, t: o.titulo || 'Vídeo do YouTube', a: o.artista || '', d: 0, c: `https://i.ytimg.com/vi/${p.id}/hqdefault.jpg` }]
      }
      if (!itens.length) { toast('Não consegui abrir essa playlist do YouTube.'); return false }
    }
    return poe(itens, { agora })
  }
  function poe(itens, { agora } = {}) {
    itens = itens.map(x => limpaItem({ ...x, por: ctx.me.name })).filter(Boolean)
    if (!itens.length) return false
    const nome = itens.length > 1 ? `${itens.length} músicas` : `“${itens[0].t}”`
    if (!R) {
      R = { fila: itens, i: 0, pos: 0, playing: true, seq: ++seq, by: ctx.me.name }
      recv = performance.now()
      send(snap())
      sysMsg(`${ctx.me.name} ligou a rádio: ${nome}`)
      aplicar(); render()
    } else if (agora) {
      const fila = R.fila.slice(); fila.splice(R.i + 1, 0, ...itens)
      mudar({ fila: fila.slice(0, 300), i: R.i + 1, pos: 0, playing: true }, `${ctx.me.name} pôs pra tocar agora: ${nome}`)
    } else {
      mudar({ fila: R.fila.concat(itens).slice(0, 300) }, `${ctx.me.name} pôs na fila da rádio: ${nome}`)
    }
    return true
  }
  let buscandoMais = false
  async function pular(d) {
    if (!R) return
    // modo rádio: no fim da fila, puxa músicas parecidas com a última (Mix do YouTube)
    if (d > 0 && R.radio && R.i === R.fila.length - 1 && !buscandoMais) {
      buscandoMais = true
      const base = R.fila[R.i], ytBase = base.k === 'yt' ? base.id : await ytDe(base)
      const r = ytBase ? await api(`musica?ytlista=RD${ytBase}&v=${ytBase}`) : null
      buscandoMais = false
      const ja = new Set([...R.fila.map(x => x.id), ...[...ytMatch.values()].filter(v => typeof v === 'string'), ytBase])
      const novas = (r?.lista || []).filter(x => !ja.has(x.id)).map(x => limpaItem({ ...x, por: 'modo rádio' })).filter(Boolean).slice(0, 25)
      if (novas.length && R) return mudar({ fila: R.fila.concat(novas).slice(-300), i: Math.min(R.i + 1, R.fila.concat(novas).slice(-300).length - 1), pos: 0, playing: true })
    }
    mudar({ i: (R.i + d + R.fila.length) % R.fila.length, pos: 0, playing: true })
  }
  const tocar = i => { if (R && R.fila[i]) mudar({ i, pos: 0, playing: true }) }
  function tirar(i) {
    if (!R) return
    if (R.fila.length === 1) return desligar()
    const fila = R.fila.slice(); fila.splice(i, 1)
    if (i < R.i) mudar({ fila, i: R.i - 1 })
    else if (i === R.i) mudar({ fila, i: R.i % fila.length, pos: 0 })
    else mudar({ fila })
  }

  /* ---------- players (escondidos) ---------- */
  const box = el('div', { className: 'radio__players', ariaHidden: 'true' })
  document.body.append(box)
  let sp = null, spReady = false, spState = null, spUri = '', spCriando = null
  let yt = null, ytReady = false, ytId = '', ytCriando = null
  let quieto = 0, buf = 0
  async function criaSp(uri, at) {
    if (spCriando) return spCriando
    spCriando = (async () => {
      const apiSp = await spApi()
      const host = el('div'); box.append(host)
      await new Promise(ok => apiSp.createController(host, { uri, width: 300, height: 80 }, c => {
        sp = c; spUri = uri
        if (c.iframeElement) c.iframeElement.loading = 'eager'
        c.addListener('ready', () => { spReady = true; aplicar() })
        c.addListener('playback_update', e => {
          spState = e.data
          if (spState?.isBuffering) buf = performance.now()
          avisoPrevia(); progresso()
        })
        ok()
      }))
      void at
    })()
    return spCriando
  }
  async function criaYt(id, at) {
    if (ytCriando) return ytCriando
    ytCriando = (async () => {
      await ytApi()
      const host = el('div'); box.append(host)
      await new Promise(ok => {
        yt = new YT.Player(host, {
          videoId: id, width: 320, height: 200,
          playerVars: { autoplay: 1, playsinline: 1, start: Math.floor(at || 0), controls: 0, disablekb: 1 },
          events: {
            onReady: () => { ytReady = true; ytId = id; vol(); aplicar(); ok() },
            onStateChange: e => {
              if (e.data === YT.PlayerState.BUFFERING) buf = performance.now()
              if (e.data === YT.PlayerState.ENDED && R && alvo(cur())?.id === ytId && performance.now() > quieto) pular(1)
              const it = cur()
              if (it?.k === 'yt' && !it.d && yt.getDuration?.() > 0) { it.d = Math.round(yt.getDuration()); render() }
              const vd = yt.getVideoData?.()
              if (it?.k === 'yt' && vd?.video_id === it.id && vd.title && it.t === 'Vídeo do YouTube') { it.t = vd.title; it.a ||= vd.author || ''; render() }
            },
          },
        })
      })
    })()
    return ytCriando
  }
  // Spotify toca pelo YouTube (inteira, sem login e com volume); se não achar, usa o player do Spotify
  const ytMatch = new Map()
  function ytDe(it) {
    if (it.k === 'yt') return Promise.resolve(it.id)
    if (ytMatch.has(it.id)) return Promise.resolve(ytMatch.get(it.id))
    const pr = api(`musica?busca=${encodeURIComponent(it.id)}&t=${encodeURIComponent(it.t)}&a=${encodeURIComponent(it.a)}&d=${it.d || 0}`)
      .then(r => { const v = r?.yt || null; if (r?.erro) setTimeout(() => ytMatch.delete(it.id), 20000); ytMatch.set(it.id, v); return v })
    ytMatch.set(it.id, pr)
    return pr
  }
  function alvo(it) {
    if (!it) return null
    if (it.k === 'yt') return { k: 'yt', id: it.id }
    if (pref.fonte === 'sp') return { k: 'sp', id: it.id }
    const m = ytMatch.get(it.id)
    if (m === undefined) { ytDe(it).then(() => { if (cur() === it) { aplicar(); render() } }); return { k: 'espera' } }
    if (m instanceof Promise) return { k: 'espera' }
    return m ? { k: 'yt', id: m } : { k: 'sp', id: it.id }
  }
  const mudoAqui = () => pref.mudo || ctx.deaf()
  function vol() {
    if (!yt || !ytReady) return
    if (mudoAqui()) yt.mute?.()
    // curva parecida com a do ouvido: 50% no controle soa como metade (o YouTube é linear e soa alto demais)
    else { const v = pref.vol * Math.min(1, ctx.vol()); yt.unMute?.(); yt.setVolume(Math.max(v > 0 ? 1 : 0, Math.round(v * v * 100))) }
  }
  function posPlayer() {
    const a = alvo(cur())
    if (!a || a.k === 'espera') return null
    if (a.k === 'sp') return spReady && spState && spUri === a.id ? spState.position / 1000 : null
    return ytReady && ytId === a.id ? yt.getCurrentTime?.() ?? null : null
  }
  // leva o player local até o estado da sala
  async function aplicar() {
    const a = alvo(cur())
    if (!a) return
    const nx = R.fila[(R.i + 1) % R.fila.length]; if (nx) alvo(nx) // já procura a próxima
    const it = { k: a.k, id: a.id }
    const want = now(), tocando = R.playing && !mudoAqui()
    quieto = performance.now() + 1500
    if (it.k === 'espera') { if (ytReady) try { yt.pauseVideo() } catch {}; if (spReady && spState && !spState.isPaused) try { sp.pause() } catch {}; return }
    if (it.k === 'sp') {
      if (ytReady) try { yt.pauseVideo() } catch {}
      if (!sp) { if (!tocando) return; await criaSp(it.id, want); return }
      if (!spReady) return
      if (spUri !== it.id) { spUri = it.id; spState = null; sp.loadUri(it.id, false, Math.floor(want)); if (tocando) setTimeout(() => sp.play(), 400); return }
      const p = posPlayer(), dur = (spState?.duration || 0) / 1000
      if (tocando && p != null && Math.abs(p - want) > 2.5 && (!dur || want < dur - 1)) sp.seek(want)
      if (tocando && (!spState || spState.isPaused)) (spState && spState.position > 0 ? sp.resume() : sp.play())
      if (!tocando && spState && !spState.isPaused) sp.pause()
    } else {
      if (spReady && spState && !spState.isPaused) try { sp.pause() } catch {}
      if (!yt) { if (!tocando) return; await criaYt(it.id, want); return }
      if (!ytReady) return
      vol()
      if (ytId !== it.id) { ytId = it.id; tocando ? yt.loadVideoById({ videoId: it.id, startSeconds: want }) : yt.cueVideoById({ videoId: it.id, startSeconds: want }); return }
      const p = posPlayer(), st = yt.getPlayerState?.()
      if (p != null && Math.abs(p - want) > 2) yt.seekTo(want, true)
      if (R.playing && st !== YT.PlayerState.PLAYING && st !== YT.PlayerState.BUFFERING && (!yt.getDuration?.() || want < yt.getDuration() - 1)) yt.playVideo()
      if (!R.playing && st === YT.PlayerState.PLAYING) yt.pauseVideo()
    }
  }
  // a cada segundo: passa para a próxima quando acaba e corrige atraso
  setInterval(() => {
    if (!R) return
    const it = cur()
    if (R.playing && it?.d && now() >= it.d - 0.4) return pular(1)
    const p = posPlayer()
    if (p != null && Math.abs(p - now()) > 2.5 && performance.now() - buf > 3000 && performance.now() > quieto) aplicar()
    else if (R.playing && !mudoAqui() && performance.now() > quieto) {
      const a = alvo(it)
      if (a?.k === 'sp' && spReady && spState?.isPaused && (!spState.duration || now() < spState.duration / 1000 - 1)) aplicar()
      if (a?.k === 'yt' && ytReady && yt.getPlayerState?.() !== YT.PlayerState.PLAYING && yt.getPlayerState?.() !== YT.PlayerState.BUFFERING) aplicar()
    }
    progresso()
  }, 1000)

  /* ---------- prévia de 30 s (sem login no Spotify) ---------- */
  function avisoPrevia() {
    const it = cur()
    const previa = alvo(it)?.k === 'sp' && spState?.duration > 0 && spState.duration < 31500 && it.d > 45
    ui.previa.hidden = !previa
  }
  function relogarSp() {
    try { sp?.destroy() } catch {}
    box.querySelectorAll('iframe[src*="spotify"]').forEach(f => f.parentElement?.remove())
    sp = null; spReady = false; spState = null; spUri = ''; spCriando = null
    aplicar()
  }

  /* ---------- cartão ---------- */
  const ui = {}
  ui.btn = $('#btnRadio')
  ui.pop = $('#radio')
  ui.btnCapa = ui.btn.querySelector('.radiobtn__capa')
  ui.pop.innerHTML = `
    <div class="radio__fundo"></div>
    <div class="radio__vazio">
      <div class="radio__disco"><svg data-icon="music"></svg></div>
      <b>Rádio da sala</b>
      <p>Música de fundo para todo mundo ouvir junto enquanto faz outra coisa. Busque pelo nome ou cole um link de música, álbum ou playlist.</p>
    </div>
    <div class="radio__agora">
      <img class="radio__capa" alt="">
      <div class="radio__info"><b class="radio__titulo"></b><span class="radio__artista"></span><span class="radio__por"></span></div>
    </div>
    <div class="radio__tempo"><span class="radio__t1">0:00</span><input type="range" class="radio__barra" min="0" max="100" step="1" value="0" aria-label="Posição"><span class="radio__t2">0:00</span></div>
    <div class="radio__ctl">
      <button type="button" class="radio__mudo" title="Silenciar só para mim"><svg data-icon="volume-2"></svg></button>
      <button type="button" class="radio__ant" title="Anterior"><svg data-icon="skip-back"></svg></button>
      <button type="button" class="radio__play" title="Tocar / pausar para todos"><svg data-icon="play"></svg></button>
      <button type="button" class="radio__prox" title="Próxima"><svg data-icon="skip-forward"></svg></button>
      <input type="range" class="radio__vol" min="0" max="1" step="0.01" aria-label="Volume da rádio (só para mim)">
    </div>
    <div class="radio__previa" hidden>Você está ouvindo só 30 segundos de cada música: entre na sua conta do Spotify neste navegador.
      <span><a href="https://accounts.spotify.com/login?continue=https%3A%2F%2Fopen.spotify.com%2F" target="_blank" rel="noopener">Entrar no Spotify</a><button type="button" class="radio__jaentrei">Já entrei</button></span></div>
    <div class="radio__opcoes">
      <button type="button" class="radio__modo" title="Quando a fila acabar, continua com músicas parecidas (Mix do YouTube), para todos"><svg data-icon="radio"></svg>Modo rádio</button>
      <button type="button" class="radio__fonte" title="Só para você: de onde vem o som das músicas do Spotify"></button>
    </div>
    <div class="radio__filahead"><span>Fila</span><span class="radio__qtd"></span></div>
    <ol class="radio__fila"></ol>
    <form class="radio__add" autocomplete="off"><input placeholder="Buscar música ou colar link (Spotify, YouTube)" spellcheck="false"><button type="submit" title="Pôr na fila"><svg data-icon="plus"></svg></button></form>
    <div class="radio__busca" hidden><div class="radio__abas"><button type="button" data-aba="mus">Músicas</button><button type="button" data-aba="yt">YouTube</button></div><ul class="radio__res"></ul></div>
    <button type="button" class="radio__desligar"><svg data-icon="x"></svg>Desligar a rádio para todos</button>`
  ctx.hydrate(ui.pop)
  const q = s => ui.pop.querySelector(s)
  Object.assign(ui, {
    capa: q('.radio__capa'), titulo: q('.radio__titulo'), artista: q('.radio__artista'), por: q('.radio__por'),
    t1: q('.radio__t1'), t2: q('.radio__t2'), barra: q('.radio__barra'), play: q('.radio__play'), mudo: q('.radio__mudo'),
    vol: q('.radio__vol'), fila: q('.radio__fila'), qtd: q('.radio__qtd'), form: q('.radio__add'), previa: q('.radio__previa'),
  })
  ui.vol.value = pref.vol
  ui.play.addEventListener('click', () => { if (R) mudar({ playing: !R.playing }) })
  q('.radio__ant').addEventListener('click', () => { if (R) now() > 5 ? mudar({ pos: 0 }) : pular(-1) })
  q('.radio__prox').addEventListener('click', () => pular(1))
  q('.radio__desligar').addEventListener('click', desligar)
  q('.radio__jaentrei').addEventListener('click', relogarSp)
  q('.radio__modo').addEventListener('click', () => { if (R) mudar({ radio: !R.radio }, `${ctx.me.name} ${R.radio ? 'desligou' : 'ligou'} o modo rádio`) })
  q('.radio__fonte').addEventListener('click', () => { pref.fonte = pref.fonte === 'sp' ? 'yt' : 'sp'; salvaPref(); aplicar(); render() })
  let arrastando = false
  ui.barra.addEventListener('input', () => { arrastando = true; ui.t1.textContent = fmt(+ui.barra.value) })
  ui.barra.addEventListener('change', () => { arrastando = false; if (R) mudar({ pos: +ui.barra.value }) })
  ui.vol.addEventListener('input', () => { pref.vol = +ui.vol.value; salvaPref(); vol(); ctx.onVol?.() })
  ui.mudo.addEventListener('click', () => { pref.mudo = !pref.mudo; salvaPref(); vol(); aplicar(); render() })
  ui.form.addEventListener('submit', async e => {
    e.preventDefault()
    const inp = ui.form.querySelector('input'), b = ui.form.querySelector('button')
    if (!inp.value.trim()) return
    // texto (não link): põe o primeiro resultado da aba aberta
    if (!parseRadio(inp.value)) { const r = busca.res[busca.aba]?.[0]; if (r) escolhe(r); else buscar(inp.value.trim(), true); return }
    b.disabled = true
    const ok = await add(inp.value)
    b.disabled = false
    if (ok) { inp.value = ''; fechaBusca() }
  })

  /* ---------- busca por nome: catálogo (Deezer, toca pelo YouTube) ou vídeos do YouTube ---------- */
  const busca = { q: '', aba: pref.aba || 'mus', res: { mus: null, yt: null }, timer: 0 }
  const boxBusca = q('.radio__busca'), listaBusca = q('.radio__res')
  const inpBusca = ui.form.querySelector('input')
  function fechaBusca() { boxBusca.hidden = true; busca.q = '' }
  function buscar(txt, ja) {
    clearTimeout(busca.timer)
    if (!txt || parseRadio(txt) || txt.length < 2) return fechaBusca()
    busca.timer = setTimeout(async () => {
      busca.q = txt; busca.res = { mus: null, yt: null }; desenhaBusca()
      const [dz, yt] = [api('musica?dz=' + encodeURIComponent(txt)), api('musica?ytq=' + encodeURIComponent(txt))]
      dz.then(r => { if (busca.q !== txt) return; busca.res.mus = (r?.musicas || []).slice(0, 8).map(m => ({ cat: 1, t: m.t, a: m.a, c: m.capa, sub: [m.a, m.album].filter(Boolean).join(' · ') })); desenhaBusca() })
      yt.then(r => { if (busca.q !== txt) return; busca.res.yt = (r?.lista || []).map(v => ({ ...v, sub: `${v.a}${v.d ? ' · ' + fmt(v.d) : ''}` })); desenhaBusca() })
    }, ja ? 0 : 320)
  }
  function desenhaBusca() {
    boxBusca.hidden = !busca.q
    boxBusca.querySelectorAll('.radio__abas button').forEach(b => b.classList.toggle('on', b.dataset.aba === busca.aba))
    const r = busca.res[busca.aba]
    if (r == null) return listaBusca.replaceChildren(...[0, 1, 2].map(() => el('li', { className: 'radio__res-it radio__res-esq' }, el('i'), el('span', {}, el('b'), el('small')))))
    if (!r.length) return listaBusca.replaceChildren(el('li', { className: 'radio__res-nada', textContent: 'Nada encontrado.' }))
    listaBusca.replaceChildren(...r.map(x => {
      const li = el('li', { className: 'radio__res-it' })
      const b = el('button', { type: 'button', className: 'radio__res-btn', title: 'Pôr na fila' },
        x.c ? el('img', { src: x.c, alt: '', referrerPolicy: 'no-referrer' }) : el('i'),
        el('span', {}, el('b', { textContent: x.t }), el('small', { textContent: x.sub })))
      b.addEventListener('click', () => escolhe(x))
      const ja = el('button', { type: 'button', className: 'radio__res-agora', title: 'Tocar agora' }, icon('play'))
      ja.addEventListener('click', () => escolhe(x, true))
      li.append(b, ja)
      return li
    }))
  }
  async function escolhe(x, agora) {
    let it = x
    if (x.cat) {
      const r = await api(`musica?acha=1&t=${encodeURIComponent(x.t)}&a=${encodeURIComponent(x.a)}`)
      if (!r?.yt) return toast('Não achei essa música para tocar. Tente pela aba YouTube.')
      it = { k: 'yt', id: r.yt, t: x.t, a: x.a, d: 0, c: `https://i.ytimg.com/vi/${r.yt}/hqdefault.jpg` }
    }
    const { sub, cat, ...limpo } = it
    if (poe([limpo], { agora })) { inpBusca.value = ''; fechaBusca() }
  }
  boxBusca.querySelectorAll('.radio__abas button').forEach(b => b.addEventListener('click', () => { busca.aba = b.dataset.aba; pref.aba = busca.aba; salvaPref(); desenhaBusca() }))
  inpBusca.addEventListener('input', () => buscar(inpBusca.value.trim()))
  inpBusca.addEventListener('keydown', e => { if (e.key === 'Escape' && !boxBusca.hidden) { e.stopPropagation(); fechaBusca() } })

  function progresso() {
    if (!R) return
    const it = cur(), d = it?.d || (it?.k === 'sp' && spState?.duration ? spState.duration / 1000 : 0)
    ui.barra.max = Math.max(1, Math.round(d))
    if (!arrastando) { ui.barra.value = Math.min(now(), d || now()); ui.t1.textContent = fmt(now()) }
    ui.t2.textContent = d ? fmt(d) : '–:––'
    const pc = d ? `${Math.min(100, now() / d * 100)}%` : '0%'
    ui.barra.style.setProperty('--p', pc)
    if (tela) { tela.t1.textContent = fmt(now()); tela.t2.textContent = d ? fmt(d) : ''; tela.barra.style.width = pc }
  }
  async function cores(it) {
    if (!it || info.has(it.id)) return
    info.set(it.id, {})
    if (it.k === 'sp') {
      const r = await api('musica?u=' + encodeURIComponent(it.id))
      if (r) info.set(it.id, { c: r.capa, cor: r.cor, cor2: r.cor2 })
    }
    render()
  }
  function renderBase() {
    const on = !!R
    ui.pop.classList.toggle('radio--on', on)
    ui.btn.classList.toggle('radiobtn--on', on)
    ui.btn.classList.toggle('radiobtn--tocando', on && R.playing && !mudoAqui())
    if (!on) { ui.btnCapa.removeAttribute('src'); ui.pop.style.removeProperty('--rc'); ui.pop.style.removeProperty('--rc2'); return }
    const it = cur(), inf = info.get(it.id) || {}
    cores(it)
    const capa = it.c || inf.c || ''
    if (capa) { ui.capa.src = capa; ui.btnCapa.src = capa } else { ui.capa.removeAttribute('src'); ui.btnCapa.removeAttribute('src') }
    ui.capa.classList.toggle('radio__capa--gira', R.playing)
    ui.titulo.textContent = it.t || 'Música'
    ui.artista.textContent = it.a || (it.k === 'yt' ? 'YouTube' : 'Spotify')
    ui.por.textContent = `${it.k === 'sp' ? 'Spotify' : 'YouTube'}${it.por ? ` · pedida por ${it.por}` : ''}`
    ui.btn.title = `Rádio: ${it.t}${it.a ? ' — ' + it.a : ''}`
    ui.pop.style.setProperty('--rc', inf.cor || (it.k === 'yt' ? 'rgb(90,24,30)' : 'rgb(24,70,44)'))
    ui.pop.style.setProperty('--rc2', inf.cor2 || 'rgb(20,20,24)')
    ui.play.replaceChildren(icon(R.playing ? 'pause' : 'play'))
    ui.mudo.replaceChildren(icon(mudoAqui() ? 'volume-x' : 'volume-2'))
    ui.mudo.classList.toggle('on', pref.mudo)
    const a = alvo(it)
    ui.vol.hidden = a?.k === 'sp'
    q('.radio__modo').classList.toggle('on', !!R.radio)
    const fonte = q('.radio__fonte')
    fonte.hidden = it.k !== 'sp'
    fonte.textContent = pref.fonte === 'sp' ? 'Som: player do Spotify' : 'Som: pelo YouTube (inteira)'
    fonte.classList.toggle('on', pref.fonte !== 'sp')
    ui.qtd.textContent = `${R.i + 1} de ${R.fila.length}`
    ui.fila.replaceChildren(...R.fila.map((x, i) => {
      const li = el('li', { className: 'radio__item' + (i === R.i ? ' radio__item--agora' : '') })
      const b = el('button', { type: 'button', className: 'radio__itembtn', title: 'Tocar agora para todos' },
        el('span', { className: 'radio__num', textContent: i === R.i ? '' : String(i + 1) }),
        el('span', { className: 'radio__itxt' }, el('b', { textContent: x.t || 'Música' }), el('span', { textContent: x.a || '' })),
        el('span', { className: 'radio__dur', textContent: x.d ? fmt(x.d) : '' }))
      if (i === R.i) b.querySelector('.radio__num').append(el('i'), el('i'), el('i'))
      b.addEventListener('click', () => tocar(i))
      const rm = el('button', { type: 'button', className: 'radio__rm', title: 'Tirar da fila' }, icon('x'))
      rm.addEventListener('click', () => tirar(i))
      li.append(b, rm)
      return li
    }))
    if (!ui.pop.hidden) ui.fila.children[R.i]?.scrollIntoView?.({ block: 'nearest' })
    avisoPrevia(); progresso()
  }
  /* ---------- na tela, quando ninguém projeta ---------- */
  let tela = null
  if (ctx.tela) {
    const t = ctx.tela
    t.innerHTML = `<div class="radiotela__bg"></div>
      <div class="radiotela__box">
        <div class="radiotela__disco"><img class="radiotela__capa" alt=""></div>
        <div class="radiotela__txt">
          <span class="radiotela__lbl"><i></i><i></i><i></i>Rádio da sala</span>
          <b class="radiotela__titulo"></b><span class="radiotela__artista"></span>
          <div class="radiotela__prog"><span class="radiotela__t1"></span><div class="radiotela__trilho"><div class="radiotela__barra"></div></div><span class="radiotela__t2"></span></div>
          <div class="radiotela__ctl"><button type="button" data-a="ant" title="Anterior"><svg data-icon="skip-back"></svg></button><button type="button" data-a="play" class="radiotela__play" title="Tocar / pausar para todos"></button><button type="button" data-a="prox" title="Próxima"><svg data-icon="skip-forward"></svg></button><button type="button" data-a="fila" title="Fila e opções"><svg data-icon="list-music"></svg></button></div>
          <span class="radiotela__prox"></span>
        </div>
      </div>`
    ctx.hydrate(t)
    const g = c => t.querySelector(c)
    tela = { bg: g('.radiotela__bg'), capa: g('.radiotela__capa'), titulo: g('.radiotela__titulo'), artista: g('.radiotela__artista'), t1: g('.radiotela__t1'), t2: g('.radiotela__t2'), barra: g('.radiotela__barra'), play: g('.radiotela__play'), prox: g('.radiotela__prox') }
    t.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a
      if (!a || !R) return
      if (a === 'play') mudar({ playing: !R.playing })
      if (a === 'ant') now() > 5 ? mudar({ pos: 0 }) : pular(-1)
      if (a === 'prox') pular(1)
      if (a === 'fila') ctx.abrir?.()
    })
  }
  function renderTela() {
    if (!tela) return
    ctx.tela.classList.toggle('radiotela--on', !!R)
    ctx.tela.classList.toggle('radiotela--tocando', !!R?.playing)
    if (!R) return
    const it = cur(), inf = info.get(it.id) || {}, capa = it.c || inf.c || ''
    if (capa) { tela.capa.src = capa; tela.bg.style.backgroundImage = `url("${capa}")` } else tela.capa.removeAttribute('src')
    tela.titulo.textContent = it.t || 'Música'
    tela.artista.textContent = it.a || ''
    tela.play.replaceChildren(icon(R.playing ? 'pause' : 'play'))
    ctx.tela.style.setProperty('--rc', inf.cor || (it.k === 'yt' ? 'rgb(90,24,30)' : 'rgb(24,70,44)'))
    const nx = R.fila.length > 1 && R.fila[(R.i + 1) % R.fila.length]
    tela.prox.textContent = nx ? `A seguir: ${nx.t}${nx.a ? ' · ' + nx.a : ''}` : R.radio ? 'A seguir: modo rádio escolhe' : ''
  }
  function render() { renderBase(); renderTela() }
  render()

  window.__radio = () => ({ R, spState, spReady, spUri, ytReady, ytId, yt: yt?.getPlayerState?.(), ytPos: yt?.getCurrentTime?.(), ytVol: yt?.getVolume?.(), ifr: [...box.querySelectorAll('iframe')].map(f => f.src.slice(0, 60) + ' allow=' + f.allow + ' loading=' + f.loading) })
  return {
    got, add, snap, vol: () => { vol(); if (R) aplicar() },
    getVol: () => pref.vol, setVol: v => { pref.vol = Math.max(0, Math.min(1, v)); ui.vol.value = pref.vol; salvaPref(); vol() },
    getFonte: () => pref.fonte, setFonte: f => { pref.fonte = f === 'sp' ? 'sp' : 'yt'; salvaPref(); aplicar(); render() },
    mudo: () => pref.mudo, setMudo: m => { pref.mudo = !!m; salvaPref(); vol(); aplicar(); render() },
    onPeerJoin: id => { if (R) send(snap(), id) },
    ativo: () => !!R,
  }
}
