/* Acompanhante de série na call: perguntar sobre a cena e Raio-X (quem está na tela).
   Quem responde é o Cena, um servidor local (127.0.0.1:8799) no PC de alguém da sala: o navegador dessa pessoa,
   pela extensão do Cineminha, vira a "ponte". Os outros mandam a pergunta para ela pela sala (ação "cena").
     quem pergunta → {op:'pede'} → ponte → {op:'falas?'} → quem projeta (legenda até o ponto atual)
                                        → extensão → Cena (Gemini) → {op:'resp'} → quem perguntou
   Sem spoiler: a posição é a de quem projeta, e as falas vão só até ela. Nada disso sai do PC da ponte
   além da chamada ao Gemini que o próprio Cena faz. */

const ROTAS = ['/cineminha/perguntar', '/cineminha/raiox', '/cineminha/raiox/cena']
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
const https = u => typeof u === 'string' && /^https:\/\/[^\s"'<>()]+$/.test(u) ? u : ''
const hms = s => { s = Math.max(0, Math.floor(+s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}` }
const nomeCurto = n => String(n || '').replace(/\s*['"][^'"]+['"]\s*/g, ' ').replace(/\s+/g, ' ').trim()
const iniciais = n => nomeCurto(n).split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase()

export function criaCompanheiro(c) {
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'companheiro.css' }))
  const { el, icon } = c
  let souPonte = false, testouEm = 0, modelo = ''
  const pontes = new Map() // peerId -> desde quando
  const espera = new Map() // id -> resolve (respostas da sala)
  let seq = 0
  const novoId = () => `${String(c.selfId).slice(0, 6)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const envia = (d, alvo) => { try { c.acao()?.send(d, alvo ? { target: alvo } : undefined) } catch {} }
  function aguarda(id, ms) {
    return new Promise(ok => {
      const tm = setTimeout(() => { espera.delete(id); ok(null) }, ms)
      espera.set(id, d => { clearTimeout(tm); espera.delete(id); ok(d) })
    })
  }

  /* ---------- extensão: só no PC de quem tem o Cena ---------- */
  const ext = new Map()
  let aoFalasNfx = null
  addEventListener('message', e => {
    if (e.source !== window || e.data?.cineExt !== 'netflix') return
    const d = e.data
    if (d.tipo === 'cena-resp') ext.get(d.id)?.(d.r)
    else if (d.tipo === 'ola') testaPonte()
    else if (d.tipo === 'falas') aoFalasNfx?.(d)
  })
  function pedeExt(rota, corpo, ms = 150000) {
    return new Promise(ok => {
      const id = novoId()
      const tm = setTimeout(() => { ext.delete(id); ok({ erro: 'A extensão não respondeu' }) }, ms)
      ext.set(id, r => { clearTimeout(tm); ext.delete(id); ok(r || { erro: 'sem resposta' }) })
      postMessage({ cineExt: 'netflix', tipo: 'cena', id, rota, corpo }, location.origin)
    })
  }
  // A extensão existe e o Cena responde? Então este navegador é a ponte da sala.
  async function testaPonte() {
    if (Date.now() - testouEm < 60000) return
    testouEm = Date.now()
    const r = await pedeExt('/saude', null, 4000)
    const antes = souPonte
    souPonte = !!r?.ok
    modelo = r?.modelo || ''
    if (souPonte !== antes) { if (souPonte) console.info('[Cineminha] acompanhante de série: este PC responde a sala (Cena)'); envia({ op: 'ponte', on: souPonte }); c.aoMudar() }
  }
  testaPonte()

  const ponteDaSala = () => [...pontes.keys()].find(p => c.peers().has(p))
  const disponivel = id => { const i = c.info(id); return !!(i?.midia?.titulo && !i.game && (souPonte || ponteDaSala())) }
  const nomeDe = pid => pid === c.selfId ? 'você' : c.peers().get(pid)?.name || 'alguém'

  /* ---------- mensagens da sala ---------- */
  function recebe(d, peerId) {
    if (!d || typeof d !== 'object') return
    if (d.op === 'ponte') { if (d.on) pontes.set(peerId, Date.now()); else pontes.delete(peerId); c.aoMudar(); return }
    if ((d.op === 'resp' || d.op === 'falas') && espera.has(d.id)) return espera.get(d.id)(d)
    if (d.op === 'pede' && souPonte) return atende(d, peerId)
    if (d.op === 'falas?') return minhasFalas(+d.ate || 0).then(falas => envia({ op: 'falas', id: d.id, falas }, peerId))
    if (d.op === 'card') return cardDaSala(d, peerId)
  }
  const onPeerJoin = id => { if (souPonte) envia({ op: 'ponte', on: true }, id) }
  const onPeerLeave = id => { if (pontes.delete(id)) c.aoMudar() }

  /* ---------- quem pergunta ---------- */
  async function pedir(rota, corpo, projetor) {
    if (souPonte) return atendeLocal(rota, corpo, projetor)
    const ponte = ponteDaSala()
    if (!ponte) return { erro: 'Ninguém com o acompanhante ligado na call agora.' }
    const id = novoId(), p = aguarda(id, 150000)
    envia({ op: 'pede', id, rota, corpo, projetor }, ponte)
    const r = await p
    return r?.r && typeof r.r === 'object' ? { ...r.r, _ponte: nomeDe(ponte) } : { erro: `${nomeDe(ponte)} não respondeu a tempo.` }
  }

  /* ---------- a ponte ---------- */
  const ocupado = new Map()
  async function atende(d, peerId) {
    const n = ocupado.get(peerId) || 0
    if (n >= 2) return envia({ op: 'resp', id: d.id, r: { erro: 'Calma: ainda estou respondendo as suas outras perguntas.' } }, peerId)
    ocupado.set(peerId, n + 1)
    try { envia({ op: 'resp', id: d.id, r: await atendeLocal(String(d.rota), d.corpo && typeof d.corpo === 'object' ? d.corpo : {}, d.projetor) }, peerId) }
    finally { ocupado.set(peerId, Math.max(0, (ocupado.get(peerId) || 1) - 1)) }
  }
  async function atendeLocal(rota, corpo, projetor) {
    if (!ROTAS.includes(rota)) return { erro: 'pedido inválido' }
    const falas = await falasAte(projetor, +corpo.posicao || 0)
    const r = await pedeExt(rota, { ...corpo, falas })
    return { ...r, _falas: falas.length }
  }
  async function falasAte(projetor, ate) {
    if (!projetor) return []
    if (projetor === c.selfId) return minhasFalas(ate)
    if (!c.peers().has(projetor)) return []
    const id = novoId(), p = aguarda(id, 3500)
    envia({ op: 'falas?', id, ate }, projetor)
    const r = await p
    return Array.isArray(r?.falas) ? r.falas.filter(x => Array.isArray(x) && +x[0] <= ate + 1).slice(-2000) : []
  }

  /* ---------- quem projeta: as falas até o ponto atual ---------- */
  function corta(cues, ate) {
    const out = []
    let total = 0
    for (const [s, t] of [...cues].sort((a, b) => a[0] - b[0]).reverse()) {
      if (!(s <= ate + 1)) continue
      total += String(t).length + 10
      if (total > 45000) break
      out.push([Math.round(s * 10) / 10, String(t).slice(0, 400)])
    }
    return out.reverse()
  }
  function falasNetflix() {
    return new Promise(ok => {
      const tm = setTimeout(() => { aoFalasNfx = null; ok(null) }, 2500)
      aoFalasNfx = d => { clearTimeout(tm); aoFalasNfx = null; ok(Array.isArray(d.cues) ? d.cues : null) }
      postMessage({ cineExt: 'netflix', tipo: 'cmd', op: 'falas', id: novoId() }, location.origin)
    })
  }
  async function minhasFalas(ate) {
    const sh = c.meuShare()
    if (!sh) return []
    if (sh.cues?.length) return corta(sh.cues.map(x => [x.s, x.text]), ate) // arquivo com legenda carregada
    if (sh.nfx) return corta(await falasNetflix() || [], ate)
    return []
  }

  /* ---------- o quadro e o contexto ---------- */
  function quadro(id, larg) {
    const t = c.tile(id), v = t?.video
    if (!v?.videoWidth) return null
    const r = t.crop || { x: 0, y: 0, w: v.videoWidth, h: v.videoHeight }
    const cv = document.createElement('canvas')
    cv.width = Math.min(larg, Math.round(r.w)); cv.height = Math.round(cv.width * r.h / r.w)
    try { cv.getContext('2d').drawImage(v, r.x, r.y, r.w, r.h, 0, 0, cv.width, cv.height); return { url: cv.toDataURL('image/jpeg', .82), r } } catch { return null }
  }
  function contexto(id) {
    const m = c.info(id)?.midia || {}
    const t = c.tile(id)
    return {
      obra: { titulo: m.titulo, original: m.original, ano: m.ano, tipo: m.tipo, s: m.s, e: m.e, epNome: m.epNome, imdb: m.imdb, epImdb: m.epImdb },
      posicao: Math.round(c.tempo(id) * 10) / 10, legenda: t?.sub?.dataset.raw || '',
    }
  }
  const rotuloObra = (m, pos) => [m?.titulo, m?.s || m?.e ? `T${m.s}E${m.e}` : '', pos != null ? hms(pos) : ''].filter(Boolean).join(' · ')

  /* ---------- resposta: resumo com chips de foto e blocos de apoio ---------- */
  const im = (u, cls = '') => https(u) ? `<img class="${cls}" src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''
  const av = (foto, nome) => https(foto) ? `<img class="cena-av" src="${esc(foto)}" alt="" referrerpolicy="no-referrer">` : `<i class="cena-av">${esc(iniciais(nome))}</i>`
  const sub = (b, padrao) => (b.titulo || padrao) ? `<div class="cena-sub">${esc(b.titulo || padrao)}</div>` : ''
  const R = {
    destaque: b => `<div class="cena-hero${b.foto ? ' retrato' : ''}">${im(b.foto || b.url)}<div class="cena-hero__txt"><b>${esc(nomeCurto(b.titulo || b.nome))}</b>${b.subtitulo || b.ator ? `<small>${esc(b.subtitulo || b.ator)}</small>` : ''}</div></div>${b.texto ? `<p>${md(b.texto)}</p>` : ''}`,
    personagem: b => `<div class="cena-pers">${av(b.foto, b.nome || b.titulo)}<div><b>${esc(nomeCurto(b.nome || b.titulo))}</b>${b.ator ? `<small>${esc(b.ator)}</small>` : ''}${b.texto ? `<p>${md(b.texto)}</p>` : ''}</div></div>`,
    relacoes: b => `${sub(b, 'Relações')}<div class="cena-rels">${(b.itens || []).map(i => `<div class="cena-rel">${av(i.foto, i.rotulo)}<div><b>${esc(nomeCurto(i.rotulo))}</b><p>${md(i.texto)}</p></div></div>`).join('')}</div>`,
    grupo: b => `<div class="cena-grupo">${im(b.url, 'cena-grupo__img')}<div><b>${esc(b.titulo)}</b>${b.texto ? `<p>${md(b.texto)}</p>` : ''}</div></div><div class="cena-membros">${(b.itens || []).map(i => `<span title="${esc(i.texto)}">${av(i.foto, i.rotulo)}${esc(nomeCurto(i.rotulo))}</span>`).join('')}</div>`,
    fatos: b => `${sub(b, '')}<dl class="cena-fatos">${(b.itens || []).map(i => `<div><dt>${esc(i.rotulo)}</dt><dd>${md(i.texto)}</dd></div>`).join('')}</dl>`,
    linha_do_tempo: b => `${sub(b, 'Até aqui')}<ol class="cena-tl">${(b.itens || []).map(i => `<li>${i.rotulo ? `<b>${esc(i.rotulo)}</b>` : ''}<p>${md(i.texto)}</p></li>`).join('')}</ol>`,
    episodio: b => `<div class="cena-pers">${im(b.miniatura, 'cena-ep__img')}<div><b>${esc(b.codigo || b.episodio)} ${esc(b.nome || b.titulo)}</b><p>${md(b.texto)}</p></div></div>`,
    local: b => `<div class="cena-hero">${im(b.url)}<div class="cena-hero__txt"><small>Lugar</small><b>${esc(b.titulo)}</b></div></div>${b.texto ? `<p>${md(b.texto)}</p>` : ''}`,
    galeria: b => `${sub(b, 'Na cena')}<div class="cena-gal">${(b.itens || []).map(i => `<figure>${av(i.foto, i.rotulo)}<figcaption>${esc(nomeCurto(i.rotulo))}</figcaption></figure>`).join('')}</div>`,
    lista: b => `${sub(b, '')}<ul class="cena-lista">${(b.itens || []).map(i => `<li>${i.rotulo ? `<b>${esc(i.rotulo)}:</b> ` : ''}${md(i.texto)}</li>`).join('')}</ul>`,
    citacao: b => `<blockquote class="cena-cit">${md(b.texto)}${b.titulo ? `<small>— ${esc(b.titulo)}</small>` : ''}</blockquote>`,
    imagem: b => https(b.url) ? `<figure class="cena-img">${im(b.url)}${b.texto ? `<figcaption>${esc(b.texto)}</figcaption>` : ''}</figure>` : '',
    links: b => `<div class="cena-links">${(b.itens || []).filter(i => https(i.url)).map(i => `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.rotulo || i.texto)}</a>`).join('')}</div>`,
    aviso: b => `<div class="cena-aviso">${md(b.texto || b.titulo)}</div>`,
  }
  const chips = r => md(r.resumo || '').replace(/\[\[(.+?)\]\]/g, (_, k) => {
    const chave = k.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    const m = r.mencoes?.[chave] || { nome: chave }
    return `<span class="cena-chip" title="${esc(m.ator || '')}">${av(m.foto, m.nome)}${esc(nomeCurto(m.nome))}</span>`
  })
  const respostaHtml = r =>
    (r.curta ? `<p class="cena-curta">${esc(r.curta)}</p>` : '') +
    (r.resumo ? `<p class="cena-resumo">${chips(r)}</p>` : '') +
    (Array.isArray(r.blocos) ? r.blocos : []).map(b => b && R[b.tipo] ? `<div class="cena-bloco">${R[b.tipo](b)}</div>` : '').join('')

  /* ---------- painel de perguntas (um por tela) ---------- */
  const SUGESTOES = ['Quem é esse?', 'O que está acontecendo?', 'Me situa: o que rolou até aqui?']
  function painel(id) {
    const t = c.tile(id)
    if (!t) return null
    if (t.cenaPainel?.el.isConnected) return t.cenaPainel
    const inp = el('input', { type: 'text', maxLength: 300, placeholder: 'Pergunte sobre a cena…', ariaLabel: 'Pergunta sobre a cena', autocomplete: 'off' })
    const enviar = el('button', { type: 'submit', className: 'cena-enviar', title: 'Perguntar', ariaLabel: 'Perguntar' }, icon('send'))
    const fechar = el('button', { type: 'button', className: 'cena-x', title: 'Fechar (Esc)', ariaLabel: 'Fechar' }, icon('x'))
    const conversa = el('div', { className: 'cena-conversa' })
    const cab = el('small', { className: 'cena-painel__obra' })
    const sugs = el('div', { className: 'cena-sugs' }, ...SUGESTOES.map(s => { const b = el('button', { type: 'button', textContent: s }); b.addEventListener('click', () => perguntar(id, s)); return b }))
    const form = el('form', { className: 'cena-form' }, inp, enviar)
    const raiz = el('aside', { className: 'cena-painel', ariaLabel: 'Acompanhante de série' },
      el('header', {}, el('span', { className: 'cena-marca' }, icon('message-circle-question'), el('b', { textContent: 'Acompanhante' })), cab, fechar),
      conversa, sugs, form,
      el('p', { className: 'cena-dica', textContent: 'Sem spoiler: só o que já passou até agora.' }))
    raiz.addEventListener('click', e => e.stopPropagation())
    raiz.addEventListener('pointerdown', e => e.stopPropagation())
    raiz.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') fechaPainel(id) })
    form.addEventListener('submit', e => { e.preventDefault(); const q = inp.value.trim(); if (q) { inp.value = ''; perguntar(id, q) } })
    fechar.addEventListener('click', () => fechaPainel(id))
    t.el.append(raiz)
    t.cenaPainel = { el: raiz, inp, conversa, cab, sugs, hist: [] }
    return t.cenaPainel
  }
  function fechaPainel(id) { const p = c.tile(id)?.cenaPainel; if (p) { p.el.classList.add('sai'); setTimeout(() => { p.el.remove(); c.tile(id) && (c.tile(id).cenaPainel = null) }, 180) } }
  function abre(id) {
    if (!disponivel(id)) return false
    const p = painel(id)
    if (!p) return false
    p.cab.textContent = rotuloObra(c.info(id)?.midia, c.tempo(id))
    requestAnimationFrame(() => p.inp.focus())
    return true
  }

  async function perguntar(id, pergunta) {
    if (!disponivel(id)) return
    const p = painel(id)
    if (!p) return
    const ctx = contexto(id), q = quadro(id, 1024)
    p.cab.textContent = rotuloObra(c.info(id)?.midia, ctx.posicao)
    p.sugs.hidden = true
    const ultima = p.hist.at(-1)
    const continuacao = !!ultima && Math.abs(ultima.posicao - ctx.posicao) < 90
    const resp = el('div', { className: 'cena-resp carregando', innerHTML: '<span class="cena-pontos"><i></i><i></i><i></i></span>' })
    const vez = el('div', { className: 'cena-vez' }, el('div', { className: 'cena-perg' }, el('span', { textContent: pergunta }), el('small', { textContent: hms(ctx.posicao) })), resp)
    p.conversa.append(vez)
    vez.scrollIntoView({ block: 'end', behavior: 'smooth' })
    const r = await pedir('/cineminha/perguntar', {
      ...ctx, imagem: q?.url || null, pergunta, continuacao,
      historico: continuacao ? p.hist.slice(-6).map(h => ({ pergunta: h.pergunta, resposta: h.resposta })) : [],
    }, id)
    resp.classList.remove('carregando')
    if (!r || r.erro) { resp.classList.add('erro'); resp.textContent = r?.erro || 'Não deu para responder agora.'; return }
    p.hist.push({ pergunta, resposta: [r.curta, r.resumo].filter(Boolean).join(' ').replace(/\[\[(.+?)\]\]/g, '$1').slice(0, 1200), posicao: ctx.posicao })
    resp.innerHTML = respostaHtml(r)
    const meta = r._meta ? [r._meta.modelo, `${r._meta.segundos}s`, r._ponte ? `PC de ${r._ponte}` : '', r._falas ? `${r._falas} falas` : 'sem legenda'].filter(Boolean).join(' · ') : ''
    const sala = el('button', { type: 'button', className: 'cena-sala' }, icon('megaphone'), el('span', { textContent: 'Mostrar para a sala' }))
    sala.addEventListener('click', () => {
      envia({ op: 'card', tile: id, pergunta, posicao: ctx.posicao, r: limpa(r) })
      c.sysMsg(`Você mostrou para a sala: “${pergunta}”`)
      sala.disabled = true; sala.lastChild.textContent = 'Mostrado para a sala'
    })
    resp.append(el('div', { className: 'cena-rodape' }, sala, el('small', { textContent: meta })))
    vez.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
  // o que vai para os outros: só os campos que a interface mostra
  const limpa = r => JSON.parse(JSON.stringify({ curta: r.curta, resumo: r.resumo, mencoes: r.mencoes, blocos: (r.blocos || []).slice(0, 3) }))

  // alguém mostrou uma resposta para a sala: cartão sobre a tela (some sozinho) e aviso no chat
  function cardDaSala(d, peerId) {
    const t = c.tile(d.tile) || c.tile([...c.tilesIds()][0]) // o id da tela é o mesmo para todos (id de quem projeta)
    const r = d.r && typeof d.r === 'object' ? d.r : null
    const pergunta = String(d.pergunta || '').slice(0, 300)
    if (!r || !pergunta) return
    const quem = nomeDe(peerId)
    c.sysMsg(`${quem} perguntou ao acompanhante: “${pergunta}”`)
    if (!t) return
    t.el.querySelector('.cena-card')?.remove()
    const fechar = el('button', { type: 'button', className: 'cena-x', title: 'Fechar', ariaLabel: 'Fechar' }, icon('x'))
    const card = el('aside', { className: 'cena-card' },
      el('header', {}, el('span', { className: 'cena-marca' }, icon('message-circle-question'), el('b', { textContent: `${quem} perguntou` })), el('small', { textContent: hms(d.posicao) }), fechar),
      el('div', { className: 'cena-perg' }, el('span', { textContent: pergunta })),
      el('div', { className: 'cena-resp', innerHTML: respostaHtml({ curta: String(r.curta || '').slice(0, 600), resumo: String(r.resumo || '').slice(0, 1500), mencoes: r.mencoes, blocos: Array.isArray(r.blocos) ? r.blocos.slice(0, 3) : [] }) }))
    card.addEventListener('click', e => e.stopPropagation())
    let tm = 0
    const some = () => { card.classList.add('sai'); setTimeout(() => card.remove(), 200) }
    const agenda = () => { clearTimeout(tm); tm = setTimeout(some, 40000) }
    card.addEventListener('mouseenter', () => clearTimeout(tm))
    card.addEventListener('mouseleave', agenda)
    fechar.addEventListener('click', some)
    t.el.append(card); agenda()
  }

  /* ---------- Raio-X: congela o quadro só para quem pediu e marca quem está na tela ---------- */
  function area(t, r) {
    const W = t.el.clientWidth, H = t.el.clientHeight, k = Math.min(W / r.w, H / r.h)
    return { x: (W - r.w * k) / 2, y: (H - r.h * k) / 2, w: r.w * k, h: r.h * k }
  }
  function fechaRaiox(t) {
    if (!t?.cenaRx) return
    const { ov, ro, tecla } = t.cenaRx
    t.cenaRx = null
    ro.disconnect(); removeEventListener('keydown', tecla, true)
    ov.classList.add('sai'); setTimeout(() => ov.remove(), 200)
  }
  async function raiox(id) {
    const t = c.tile(id)
    if (!t || !disponivel(id)) return false
    if (t.cenaRx) { fechaRaiox(t); return true }
    const q = quadro(id, 1280)
    if (!q) { c.toast('Ainda sem imagem para analisar'); return true }
    const ctx = contexto(id)
    const foto = el('img', { className: 'cena-rx__foto', src: q.url, alt: '' })
    const caixas = el('div', { className: 'cena-rx__caixas' })
    const quadroEl = el('div', { className: 'cena-rx__quadro varrendo' }, foto, caixas)
    const status = el('div', { className: 'cena-rx__status' }, el('span', { className: 'cena-pontos' }, el('i'), el('i'), el('i')), el('span', { textContent: 'Procurando quem está na tela…' }))
    const fechar = el('button', { type: 'button', className: 'cena-x cena-rx__x', title: 'Voltar ao vivo (Esc)', ariaLabel: 'Fechar Raio-X' }, icon('x'))
    const lado = el('aside', { className: 'cena-rx__lado', hidden: true })
    const ov = el('div', { className: 'cena-rx' }, quadroEl, el('div', { className: 'cena-rx__topo' }, el('span', { className: 'cena-marca' }, icon('scan-face'), el('b', { textContent: 'Raio-X' }), el('small', { textContent: rotuloObra(c.info(id)?.midia, ctx.posicao) })), status, fechar), lado)
    const posiciona = () => { const a = area(t, q.r); Object.assign(quadroEl.style, { left: a.x + 'px', top: a.y + 'px', width: a.w + 'px', height: a.h + 'px' }) }
    const ro = new ResizeObserver(posiciona)
    const tecla = e => { if (e.key === 'Escape' && t.cenaRx?.ov === ov) { e.stopPropagation(); fechaRaiox(t) } }
    ov.addEventListener('click', e => { e.stopPropagation(); if (e.target === ov || e.target === foto) caixas.querySelector('.aberta')?.classList.remove('aberta') })
    ov.addEventListener('pointerdown', e => e.stopPropagation())
    fechar.addEventListener('click', () => fechaRaiox(t))
    t.el.append(ov); ro.observe(t.el); posiciona()
    addEventListener('keydown', tecla, true)
    t.cenaRx = { ov, ro, tecla }
    const vivo = () => t.cenaRx?.ov === ov
    const r = await pedir('/cineminha/raiox', { ...ctx, imagem: q.url }, id)
    if (!vivo()) return true
    quadroEl.classList.remove('varrendo')
    if (!r || r.erro) { status.classList.add('erro'); status.lastChild.textContent = r?.erro || 'Não deu para analisar agora.'; status.firstChild.remove(); return true }
    const gente = (Array.isArray(r.pessoas) ? r.pessoas : []).filter(p => Array.isArray(p.caixa) && p.caixa.length === 4)
    if (!gente.length) { status.firstChild.remove(); status.lastChild.textContent = 'Ninguém reconhecível neste quadro.'; return true }
    gente.forEach((p, i) => {
      const [y0, x0, y1, x1] = p.caixa.map(Number)
      const nome = nomeCurto(p.nome) || 'Não reconheci'
      const caixa = el('button', { type: 'button', className: 'cena-rx__caixa' + (y1 > .72 ? ' cima' : ''), style: `left:${x0 * 100}%;top:${y0 * 100}%;width:${(x1 - x0) * 100}%;height:${(y1 - y0) * 100}%;--i:${i}`, ariaLabel: nome },
        el('span', { className: 'cena-rx__etq', innerHTML: `${av(p.foto, nome)}<span><b>${esc(nome)}</b>${p.ator ? `<small>${esc(p.ator)}</small>` : ''}${p.descricao ? `<em>${esc(p.descricao)}</em>` : ''}</span>` }))
      caixa.addEventListener('click', e => { e.stopPropagation(); const ja = caixa.classList.contains('aberta'); caixas.querySelectorAll('.aberta').forEach(x => x.classList.remove('aberta')); caixa.classList.toggle('aberta', !ja) })
      caixas.append(caixa)
    })
    // depois das caixas: o que está acontecendo entre essas pessoas
    status.lastChild.textContent = 'Entendendo a cena…'
    const nomes = gente.map(p => p.nome).filter(Boolean)
    const rc = await pedir('/cineminha/raiox/cena', { ...ctx, imagem: q.url, nomes }, id)
    if (!vivo()) return true
    status.remove()
    if (!rc || rc.erro || !rc.resumo) return true
    const pessoas = (Array.isArray(rc.pessoas) ? rc.pessoas : []).slice(0, 6)
    const conexoes = (Array.isArray(rc.conexoes) ? rc.conexoes : []).slice(0, 6)
    lado.innerHTML = `<div class="cena-sub">O que está rolando</div><p class="cena-resumo">${chips(rc)}</p>` +
      (pessoas.length ? `<div class="cena-rels">${pessoas.map(p => `<div class="cena-rel">${av(p.foto, p.nome)}<div><b>${esc(nomeCurto(p.nome))}</b><p>${esc(p.quem)}</p>${p.fazendo ? `<p class="cena-fazendo">${esc(p.fazendo)}</p>` : ''}</div></div>`).join('')}</div>` : '') +
      (conexoes.length ? `<div class="cena-sub">Entre eles</div><ul class="cena-con">${conexoes.map(x => `<li><span>${av(x.fa?.foto, x.a)}${av(x.fb?.foto, x.b)}</span><p><b>${esc(nomeCurto(x.a))} e ${esc(nomeCurto(x.b))}</b>${esc(x.relacao)}</p></li>`).join('')}</ul>` : '')
    lado.hidden = false
    return true
  }

  // Q pergunta, X faz o Raio-X: na tela em foco ou na única que tem o acompanhante
  function atalho(k, focoId) {
    const ids = [...c.tilesIds()].filter(disponivel)
    const id = focoId && disponivel(focoId) ? focoId : ids.length === 1 ? ids[0] : null
    if (!id) return false
    return k === 'x' ? (raiox(id), true) : abre(id)
  }

  return { recebe, onPeerJoin, onPeerLeave, disponivel, abre, raiox, atalho, souPonte: () => souPonte, modelo: () => modelo }
}
