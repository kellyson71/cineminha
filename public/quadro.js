// Quadro a Quadro: adivinhe o filme pelo frame. Três modos:
//  corrida      todo mundo chuta junto; a cada poucos segundos abre mais um frame; quanto antes, mais pontos
//  cooperativo  a turma é um time: qualquer acerto vale para todos; o placar é do grupo
//  leilão       vendo o 1º frame, cada um aposta em segredo "acerto com N frames"; quem apostar menos
//               tenta com só esses frames (2 chances); se errar, os outros roubam com tudo aberto
// Host autoritativo (ver JOGOS.md). Dados: public/jogos/quadro/ (tools/quadro/coleta.mjs).

const XX = 'qq'
const NOME = 'Quadro a Quadro'
const DADOS = 'jogos/quadro/'
const SOM = n => `jogos/coup/sons/${n}.mp3`
const SONS = ['embaralhar', 'desliza1', 'desliza2', 'desliza3', 'carimbo', 'papel', 'vez', 'clique', 'tique', 'leque']
const VOL = { embaralhar: .5, carimbo: .6, papel: .45, vez: .45, clique: .3, tique: .25, leque: .5 }
const SAIU_MS = 12000, HOST_MS = 10000
const REVELA_MS = 6500, TRAVA_MS = 2500, LANCE_MS = 20000, DESAFIO_MS = 25000, ROUBO_MS = 18000
const OP_FILMES = [5, 8, 12], OP_CHUTES = [1, 2, 3], OP_SEG = [0, 8, 12, 18] // 0 = sem tempo: o frame fica até todo mundo chutar ou passar
export const MODOS = {
  corrida: { nome: 'Corrida', txt: 'Todo mundo chuta junto. Quanto antes acertar, mais pontos.', min: 1 },
  coop: { nome: 'Cooperativo', txt: 'Um time só: qualquer acerto vale para todos.', min: 1 },
  leilao: { nome: 'Leilão', txt: '“Acerto com 2 frames!” Quem apostar menos tenta sozinho.', min: 2 },
}
export const CATS = {
  famosos: 'Famosos', todos: 'Todos', nossos: 'Nossas sessões', classicos: 'Clássicos (até 1979)', anos8090: 'Anos 80 e 90', novos: 'Anos 2000+', oscar: 'Ganhou o Oscar',
  brasil: 'Brasileiros', animacao: 'Animação', acao: 'Ação e aventura', comedia: 'Comédia', terror: 'Terror', ficcao: 'Ficção e fantasia', suspense: 'Suspense e crime', romance: 'Romance',
}
const daCat = (f, c) => c === 'todos' ? true : c === 'classicos' ? f.ano < 1980 : c === 'anos8090' ? f.ano >= 1980 && f.ano < 2000 : c === 'novos' ? f.ano >= 2000 : (f.c || []).includes(c)

const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n }
const embaralha = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]] } return a }
const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch {} } }

/* ---------- conferir o palpite: bem tolerante (parecido já vale) ---------- */
const semAcento = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const ROMANOS = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9' }
const VAZIAS = new Set(['the', 'a', 'an', 'o', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'e', 'and', 'of', 'em', 'no', 'na', 'to', 'in', 'el', 'la', 'le', 'les', 'il', 'der', 'die', 'das', 'filme', 'movie', 'parte', 'part', 'episodio', 'episode'])
const norm = t => semAcento(t).replace(/&/g, ' e ').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
  .split(' ').map(w => ROMANOS[w] || w).join(' ')
const palavras = t => norm(t).split(' ').filter(w => w && !VAZIAS.has(w))
const digitos = t => (norm(t).match(/\d+/g) || []).join(' ')
function dist(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 1; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[m][n]
}
const palavraBate = (a, b) => a === b || (b.length >= 4 && a.length >= 3 && dist(a, b) <= (b.length >= 8 ? 2 : 1)) || (b.length >= 5 && a.length >= 4 && b.startsWith(a))
// 0 (nada a ver) … 1 (igual)
function parecido(palpite, titulo) {
  const p = norm(palpite), t = norm(titulo)
  if (!p || !t) return 0
  const dp = digitos(palpite), dt = digitos(titulo)
  if (dp && dp !== dt) return 0 // "Toy Story 2" não é "Toy Story 3", "Matrix 2" não é "Matrix" (mas "Toy Story" vale para o 3)
  const ps = p.replace(/ /g, ''), ts = t.replace(/ /g, '')
  if (ps === ts) return 1
  const letras = 1 - dist(ps, ts) / Math.max(ps.length, ts.length)
  const wp = palavras(palpite), wt = palavras(titulo)
  if (!wp.length || !wt.length) return letras
  const cobre = wt.filter(w => wp.some(x => palavraBate(x, w))).length / wt.length // quanto do título apareceu
  const certo = wp.filter(x => wt.some(w => palavraBate(x, w))).length / wp.length // quanto do palpite é do título
  const pal = cobre * .65 + certo * .35
  return Math.max(letras, certo < .6 ? Math.min(pal, .6) : pal) // palavras sobrando ("Matrix Reloaded") pesam contra
}
export function nota(palpite, nomes) {
  // vale qualquer nome: brasileiro, original, de Portugal; e o subtítulo sozinho ("O Cavaleiro das Trevas"), nunca só o começo ("Batman")
  const todos = nomes.flatMap(n => { const d = n.split(/\s*[:–—]\s*|\s+-\s+/); return d.length > 1 ? [n, ...d.slice(1).filter(x => x.length >= 8)] : [n] })
  return Math.max(0, ...todos.map(n => parecido(palpite, n)))
}
export const confere = (palpite, nomes) => nota(palpite, nomes) >= .72
const quase = (palpite, nomes) => nota(palpite, nomes) >= .5

export function criaQuadro(ctx) {
  const { icon, toast, sysMsg, me } = ctx
  const tela = ctx.tela
  const el = (tag, props = {}, ...kids) => {
    const dados = {}, resto = {}
    for (const [k, v] of Object.entries(props)) (k.startsWith('data-') ? dados : resto)[k] = v
    const n = ctx.el(tag, resto, ...kids.flat())
    for (const [k, v] of Object.entries(dados)) n.setAttribute(k, v)
    return n
  }

  /* ---------- dados ---------- */
  let filmes = null, catalogo = null, contaCats = null, capasCat = null
  // "Nossas sessões": filmes que a turma já viu no Cineminha (diário e o que foi reconhecido nas calls)
  const pegaVistos = () => fetch('api/sessoes?vistos=1').then(r => r.json()).then(r => new Set(r.imdb || [])).catch(() => new Set())
  const pegaFilmes = () => filmes ||= Promise.all([fetch(DADOS + 'filmes.json', { cache: 'no-cache' }).then(r => r.json()), pegaVistos()]).then(([l, vistos]) => {
    for (const f of l) if (vistos.has(f.imdb)) f.c = [...(f.c || []), 'nossos']
    contaCats = Object.fromEntries(Object.keys(CATS).map(c => [c, l.filter(f => daCat(f, c)).length]))
    capasCat = Object.fromEntries(Object.keys(CATS).map(c => { const f = l.filter(x => daCat(x, c))[3] || l.find(x => daCat(x, c)); return [c, f ? frameFilme(f, Math.min(2, f.n - 1)) : ''] }))
    if (V) render(); return l
  }).catch(() => { filmes = null; return [] })
  const pegaCatalogo = async () => catalogo ||= fetch(DADOS + 'catalogo.json').then(r => r.json()).then(l => l.map(([t, o, ano]) => ({ t, o, ano, k: norm(t), ko: norm(o) }))).catch(() => { catalogo = null; return [] })
  const frame = (p, i) => `${DADOS}f/${p}/${i}.webp`
  // A curadoria vai do detalhe/cenário ao personagem ou à cena mais reconhecível.
  // A ordem fica no filme e acompanha o backup do host; nunca é embaralhada.
  const frameFilme = (f, i) => frame(f.p, f.ordem?.[i] ?? i)

  /* ================================================================ host: estado completo */
  let G = null, restaurou = false
  const ausDesde = new Map()
  const jog = k => G?.js.find(j => j.key === k)
  const ev = e => { G.ev.push({ ...e, n: ++G.evN }); if (G.ev.length > 40) G.ev.splice(0, G.ev.length - 40) }
  const filme = () => G?.lista[G.i]
  const presentesJog = () => G.js.filter(j => ctx.presentes().includes(j.key))

  function abrir(chamados) {
    const op = { filmes: 8, seg: 0, chutes: 2, modo: 'corrida', cat: 'famosos', ...ls.get(`${XX}.op`) }
    G = { id: Math.random().toString(36).slice(2, 9), host: me.key, hostNome: me.name, fase: 'convite', op,
      conv: Object.fromEntries(ctx.presentes().map(k => [k, k === me.key || chamados?.includes?.(k) ? 'sim' : '?'])),
      js: [], lista: [], i: 0, time: 0, vencedor: null, ev: [], evN: 0, seq: 0, t: Date.now() }
    sysMsg(`${me.name} abriu uma mesa de ${NOME}`)
    difunde()
  }
  async function comecar() {
    if (G?.fase !== 'convite') return
    const pres = new Set(ctx.presentes())
    const ks = Object.keys(G.conv).filter(k => G.conv[k] === 'sim' && pres.has(k))
    const min = MODOS[G.op.modo].min
    if (ks.length < min) return toast(`O ${MODOS[G.op.modo].nome} precisa de pelo menos ${min} pessoas.`)
    const todos = (await pegaFilmes()).filter(f => daCat(f, G.op.cat))
    if (!todos.length) return toast('Não achei filmes nessa categoria.')
    // não repete: conta quantos do grupo já viram cada filme (cada um mandou a sua lista) e sorteia dos menos vistos
    const listas = ks.map(k => new Set(k === me.key ? meusVistos() : G.vistos?.[k] || []))
    const quantos = f => listas.filter(l => l.has(f.p)).length
    G.lista = embaralha([...todos]).map(f => [quantos(f), f]).sort((a, b) => a[0] - b[0]).slice(0, G.op.filmes).map(([, f]) => f)
      .map(f => ({ imdb: f.imdb, t: f.t, o: f.o, ano: f.ano, nomes: f.nomes, p: f.p, n: f.n, ordem: f.ordem?.slice() }))
    const repetidos = G.lista.filter(f => quantos(f) > 0).length
    if (repetidos) toast(`Acabaram os inéditos para o grupo nessa categoria: ${repetidos} ${repetidos === 1 ? 'filme é repetido' : 'filmes são repetidos'} (os menos vistos).`, 4500)
    ls.set(`${XX}.op`, G.op)
    G.js = embaralha(ks).map(k => ({ key: k, nome: ctx.nomeDe(k), pontos: 0, acertos: 0 }))
    G.fase = 'jogo'; G.time = 0
    ev({ t: 'inicio' })
    sysMsg(`${NOME} (${MODOS[G.op.modo].nome}, ${CATS[G.op.cat]}) começou: ${G.js.map(j => j.nome).join(', ')}`)
    novoFilme(0)
  }
  const seg = () => G.op.seg * 1000
  const prazoFrame = () => (G.op.seg ? Date.now() + seg() : 0)
  function novoFilme(i) {
    const leilao = G.op.modo === 'leilao'
    Object.assign(G, { i, passo: 0, est: leilao ? 'lance' : 'olhando', prazo: leilao ? Date.now() + LANCE_MS : prazoFrame(), ate: 0,
      acertos: {}, erros: [], passou: [], trava: {}, chutes: {}, lances: {}, venc: null, tent: 0 })
    ev({ t: 'filme', i })
    difunde()
  }
  function abreFrame() {
    const f = filme()
    if (G.passo >= f.n - 1) return revela()
    G.passo++; G.passou = []; G.chutes = {}; G.prazo = prazoFrame()
    ev({ t: 'frame', passo: G.passo })
    difunde()
  }
  function revela() {
    if (G.est === 'revela') return
    G.est = 'revela'; G.ate = Date.now() + REVELA_MS; G.prazo = 0; G.passo = filme().n - 1
    ev({ t: 'revela', alguem: Object.keys(G.acertos).length > 0 })
    const f = filme(), quem = Object.keys(G.acertos).map(k => jog(k)?.nome).filter(Boolean)
    sysMsg(`🎬 ${f.t} (${f.ano})${quem.length ? ` · acertou: ${quem.join(', ')}` : ' · ninguém acertou'}`)
    difunde()
  }
  function proximo() {
    if (G.i + 1 < G.lista.length) return novoFilme(G.i + 1)
    G.fase = 'fim'
    const ord = [...G.js].sort((a, b) => b.pontos - a.pontos)
    G.vencedor = G.op.modo !== 'coop' && ord[0]?.pontos > 0 && ord[0].pontos !== ord[1]?.pontos ? ord[0].key : null
    ev({ t: 'fim' })
    if (G.op.modo === 'coop') sysMsg(`${NOME}: a turma fez ${G.time} pontos`)
    else if (G.vencedor) sysMsg(`${NOME}: ${jog(G.vencedor).nome} venceu com ${ord[0].pontos} pontos`)
    difunde()
  }
  const semAcerto = () => G.js.filter(j => !(j.key in G.acertos))

  // leilão: todo mundo apostou (ou acabou o tempo) → quem apostou menos tenta
  function resolveLance() {
    const ls_ = Object.entries(G.lances).sort((a, b) => a[1].n - b[1].n || a[1].t - b[1].t)
    if (!ls_.length) { G.est = 'olhando'; G.prazo = prazoFrame(); ev({ t: 'semlance' }); return difunde() } // ninguém apostou: vira corrida
    const [key, { n }] = ls_[0]
    G.venc = { key, n }; G.est = 'desafio'; G.passo = n - 1; G.tent = 2; G.prazo = Date.now() + DESAFIO_MS
    ev({ t: 'venceu-lance', key, n })
    difunde()
  }
  function rouba() {
    G.est = 'roubo'; G.chutes = {}; G.passo = filme().n - 1; G.prazo = Date.now() + ROUBO_MS
    ev({ t: 'roubo' })
    if (!G.js.some(j => j.key !== G.venc.key)) return revela()
    difunde()
  }
  function lance(key, n) {
    const f = filme()
    if (G.est !== 'lance' || !jog(key) || !Number.isInteger(n) || n < 1 || n > f.n) return
    G.lances[key] = { n, t: G.lances[key]?.t || Date.now() }
    if (presentesJog().every(j => j.key in G.lances)) return resolveLance()
    difunde()
  }

  function chute(key, txt) {
    const j = jog(key), f = filme()
    if (G.fase !== 'jogo' || !j || key in G.acertos) return
    if (!['olhando', 'desafio', 'roubo'].includes(G.est)) return
    if (G.est === 'desafio' && key !== G.venc.key) return
    if (G.est === 'roubo' && key === G.venc.key) return
    txt = String(txt || '').trim().slice(0, 80)
    if (!txt || (G.trava[key] || 0) > Date.now()) return
    const limite = G.op.chutes || 2
    if (G.est !== 'desafio') { G.chutes ||= {}; if ((G.chutes[key] || 0) >= limite) return; G.chutes[key] = (G.chutes[key] || 0) + 1 }
    if (confere(txt, f.nomes)) {
      const primeiro = !Object.keys(G.acertos).length
      let pts
      if (G.est === 'desafio') pts = f.n + 1 - G.venc.n // apostou 1 frame: 6 pontos
      else if (G.est === 'roubo') pts = 2
      else pts = (f.n - G.passo) + (primeiro && G.op.modo === 'corrida' ? 1 : 0)
      G.acertos[key] = { passo: G.passo, pts, primeiro }
      j.pontos += pts; j.acertos++
      ev({ t: 'acertou', key, pts, primeiro, txt })
      if (G.op.modo === 'coop') { G.time += pts; for (const o of G.js) if (!(o.key in G.acertos)) G.acertos[o.key] = { passo: G.passo, pts: 0, time: true }; return revela() }
      if (G.est !== 'olhando' || !semAcerto().length) return revela()
      if (!G.op.seg && G.passou.length && todosPassaram()) return abreFrame()
    } else {
      G.trava[key] = Date.now() + TRAVA_MS
      const q = quase(txt, f.nomes)
      G.erros.push({ key, txt, q }); if (G.erros.length > 8) G.erros.shift()
      ev({ t: 'errou', key, txt, q })
      if (G.est === 'desafio' && --G.tent <= 0) return rouba()
      // sem tempo: chutou (e errou) conta como passar; quando todo mundo passou ou chutou, abre o próximo frame
      if (G.est === 'olhando' && !G.op.seg && !G.passou.includes(key)) { G.passou.push(key); if (todosPassaram()) return abreFrame() }
    }
    difunde()
  }
  const todosPassaram = () => !semAcerto().filter(j => ctx.presentes().includes(j.key) && !G.passou.includes(j.key)).length
  function passa(key) {
    if (G.fase !== 'jogo' || G.est !== 'olhando' || !jog(key) || key in G.acertos || G.passou.includes(key)) return
    G.passou.push(key)
    if (todosPassaram()) return abreFrame()
    difunde()
  }
  function revanche() {
    const ant = new Set(G.js.map(j => j.key))
    G.conv = Object.fromEntries(ctx.presentes().map(k => [k, ant.has(k) || k === me.key ? 'sim' : '?']))
    Object.assign(G, { id: Math.random().toString(36).slice(2, 9), fase: 'convite', js: [], lista: [], vencedor: null, time: 0, ev: [], evN: 0 })
    difunde()
  }
  function remove(key) {
    if (G.fase === 'convite') { if (key in G.conv) { delete G.conv[key]; difunde() } return }
    const i = G.js.findIndex(j => j.key === key)
    if (i < 0) return
    const j = G.js[i]
    G.js.splice(i, 1)
    ausDesde.delete(key)
    delete G.lances?.[key]
    ev({ t: 'saiu', key, nome: j.nome }); sysMsg(`${j.nome} saiu do ${NOME}`)
    if (G.fase !== 'fim' && !G.js.length) { G.fase = 'fim'; G.vencedor = null; return difunde() }
    if (G.fase === 'jogo') {
      if (G.est === 'desafio' && G.venc?.key === key) return rouba()
      if (G.est === 'lance' && presentesJog().every(x => x.key in G.lances)) return resolveLance()
      if (G.est === 'olhando' && !semAcerto().length) return revela()
    }
    difunde()
  }
  function hostRecebe(d, key) {
    if (!G || !key || d.id !== G.id) return
    switch (d.op) {
      case 'resp': if (G.fase === 'convite') { G.conv[key] = d.sim ? 'sim' : 'nao'; difunde() } break
      case 'chute': chute(key, d.txt); break
      case 'lance': lance(key, d.n); break
      case 'passa': passa(key); break
      case 'sai': remove(key); break
      case 'vistos': if (Array.isArray(d.l)) { G.vistos ||= {}; G.vistos[key] = d.l.filter(x => typeof x === 'string').slice(-2000) } break
      case 'opcao':
        if (key !== G.host || G.fase !== 'convite') break
        if (OP_FILMES.includes(d.filmes)) G.op.filmes = d.filmes
        if (OP_SEG.includes(d.seg)) G.op.seg = d.seg
        if (OP_CHUTES.includes(d.chutes)) G.op.chutes = d.chutes
        if (d.modo in MODOS) G.op.modo = d.modo
        if (d.cat in CATS) G.op.cat = d.cat
        difunde(); break
    }
  }
  // o que cada um vê: só os frames abertos; o nome só na revelação; as apostas só depois do leilão
  function vista(k) {
    const f = filme()
    const v = {
      id: G.id, seq: G.seq, host: G.host, hostNome: G.hostNome, fase: G.fase, op: G.op, conv: G.conv, time: G.time,
      js: G.js.map(j => ({ key: j.key, nome: j.nome, pontos: j.pontos, acertos: j.acertos })),
      vencedor: G.vencedor, ev: G.ev, total: G.lista.length, i: G.i,
    }
    if (G.fase === 'jogo' && f) {
      const revelado = G.est === 'revela'
      Object.assign(v, {
        est: G.est, passo: G.passo, n: f.n, resta: G.prazo ? Math.max(0, G.prazo - Date.now()) : 0,
        dur: G.est === 'lance' ? LANCE_MS : G.est === 'desafio' ? DESAFIO_MS : G.est === 'roubo' ? ROUBO_MS : seg(),
        frames: Array.from({ length: G.passo + 1 }, (_, i) => frameFilme(f, i)),
        acertos: G.acertos, erros: G.erros, passou: G.passou, trava: Math.max(0, (G.trava[k] || 0) - Date.now()),
        chutei: G.chutes?.[k] || 0, limite: G.op.chutes || 2,
        lances: G.est === 'lance' ? Object.fromEntries(Object.keys(G.lances).map(x => [x, x === k ? G.lances[x].n : true])) : Object.fromEntries(Object.entries(G.lances).map(([x, l]) => [x, l.n])),
        venc: G.venc, tent: G.tent,
        filme: revelado ? { t: f.t, o: f.o, ano: f.ano, p: f.p } : null,
        prox: G.i + 1 < G.lista.length ? frameFilme(G.lista[G.i + 1], 0) : '',
      })
    }
    if (G.fase === 'fim') v.filmes = G.lista.map(f => ({ t: f.t, ano: f.ano, capa: frameFilme(f, 0) }))
    return v
  }
  function difunde() {
    if (!G) return
    G.seq++; G.t = Date.now()
    ls.set(`${XX}.G`, G)
    const ks = new Set([...ctx.presentes(), ...G.js.map(j => j.key), ...Object.keys(G.conv || {})])
    for (const k of ks) if (k !== me.key) ctx.sendTo(k, { [XX]: { v: vista(k) } })
    const pres = new Set(ctx.presentes())
    G.sucessor = G.js.map(j => j.key).find(k => k !== me.key && pres.has(k)) || [...pres].find(k => k !== me.key) || null
    if (G.sucessor) ctx.sendTo(G.sucessor, { [XX]: { bk: G } })
    aplica(vista(me.key))
  }
  function encerrar() {
    if (!G) return
    ctx.send({ [XX]: { fim: G.id } })
    ls.set(`${XX}.G`, null)
    G = null
    aplica(null)
  }
  let backup = null, hostSumiu = 0
  function assumeSePreciso() {
    if (G || !V || !backup || backup.id !== V.id || backup.sucessor !== me.key || souHost()) { hostSumiu = 0; return }
    if (ctx.presentes().includes(V.host)) { hostSumiu = 0; return }
    if (!hostSumiu) hostSumiu = Date.now()
    if (Date.now() - hostSumiu < HOST_MS) return
    const antigo = backup.host, nomeAntigo = backup.hostNome
    G = backup; backup = null; hostSumiu = 0
    G.host = me.key; G.hostNome = me.name; G.seq += 5
    if (G.prazo) G.prazo = G.est === 'olhando' ? prazoFrame() : Date.now() + DESAFIO_MS
    sysMsg(`${nomeAntigo} caiu: ${me.name} assumiu a mesa de ${NOME}`)
    remove(antigo)
    if (G) difunde()
  }
  // relógio do host
  setInterval(() => {
    if (!G || G.host !== me.key || G.fase !== 'jogo') return
    const agora = Date.now()
    if (G.est === 'revela') { if (agora >= G.ate) proximo(); return }
    if (!G.prazo || agora < G.prazo) return
    if (G.est === 'olhando') abreFrame()
    else if (G.est === 'lance') resolveLance()
    else if (G.est === 'desafio') rouba()
    else if (G.est === 'roubo') revela()
  }, 250)
  setInterval(() => {
    if (!G && !restaurou && me.key) {
      restaurou = true
      const s = ls.get(`${XX}.G`)
      if (s && s.host === me.key && s.fase !== 'fim' && Date.now() - s.t < 3 * 3600e3) setTimeout(() => { if (G || (V && V.host !== me.key)) return ls.set(`${XX}.G`, null); G = s; if (G.prazo) G.prazo = G.est === 'olhando' ? prazoFrame() : Date.now() + DESAFIO_MS; difunde() }, 3000)
    }
    assumeSePreciso()
    if (!G || G.host !== me.key) return
    const pres = new Set(ctx.presentes()), agora = Date.now()
    const quem = G.fase === 'convite' ? Object.keys(G.conv).filter(k => k !== me.key) : G.js.map(j => j.key).filter(k => k !== me.key)
    for (const k of quem) { if (pres.has(k)) ausDesde.delete(k); else if (!ausDesde.has(k)) ausDesde.set(k, agora) }
    for (const [k, t] of ausDesde) if (agora - t > SAIU_MS) return remove(k)
  }, 1500)

  /* ================================================================ cliente */
  let V = null, ultEv = 0, dispensado = '', recebidoEm = 0, verFrame = -1, meuQuase = 0
  const souHost = () => V && V.host === me.key
  const N = k => k === me.key ? 'Você' : (V?.js.find(j => j.key === k)?.nome || ctx.nomeDe(k))
  function manda(d) {
    if (!V) return
    const m = { id: V.id, ...d }
    if (souHost()) hostRecebe(m, me.key)
    else ctx.sendTo(V.host, { [XX]: { op: m } })
  }
  function got(d, deKey) {
    if (!d) return
    if (d.op) { if (G && G.host === me.key) hostRecebe(d.op, deKey); return }
    if (d.fim) { if (V?.id === d.fim) aplica(null); return }
    if (d.bk) { if (d.bk.host === deKey) backup = d.bk; return }
    if (d.v) {
      if (G && d.v.id === G.id && d.v.host !== me.key) { G = null; ls.set(`${XX}.G`, null) }
      if (d.v.id === dispensado) return
      if (V && d.v.id === V.id && d.v.seq <= V.seq) return
      if (ctx.outroJogo?.()) return
      aplica(d.v)
    }
  }
  function meusVistos() { return ls.get(`${XX}.vistos2`) || [] }
  let mandouVistos = ''
  function aplica(v) {
    const antes = V
    if (v?.filme?.p && !meusVistos().includes(v.filme.p)) ls.set(`${XX}.vistos2`, [...meusVistos(), v.filme.p].slice(-2000))
    if (v?.fase === 'convite' && v.host !== me.key && mandouVistos !== v.id) { mandouVistos = v.id; setTimeout(() => manda({ op: 'vistos', l: meusVistos() }), 50) }
    if (v && (!antes || antes.id !== v.id)) ultEv = Math.max(0, ...v.ev.map(e => e.n))
    if (v && (antes?.i !== v.i || antes?.passo !== v.passo || antes?.est !== v.est)) verFrame = -1
    V = v; recebidoEm = Date.now()
    const evs = v ? v.ev.filter(e => e.n > ultEv) : []
    if (v) ultEv = Math.max(ultEv, ...v.ev.map(e => e.n))
    if (v?.prox) new Image().src = v.prox
    render()
    if (v) anima(evs)
  }

  /* ---------- sons ---------- */
  const buf = new Map()
  let carregando = null
  function carregaSons() {
    if (carregando) return carregando
    let ac; try { ac = ctx.audioCtx() } catch { return Promise.resolve() }
    carregando = Promise.all(SONS.map(n => fetch(SOM(n)).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(d => buf.set(n, d)).catch(() => {})))
    return carregando
  }
  function som(n, atraso = 0, vol = 1) {
    if (n === 'desliza') n = `desliza${1 + rnd(3)}`
    let ac; try { ac = ctx.audioCtx() } catch { return }
    const b = buf.get(n)
    if (!ac || !b) { carregaSons(); return }
    if (ac.state === 'suspended') ac.resume()
    const s = ac.createBufferSource(); s.buffer = b
    s.playbackRate.value = .95 + Math.random() * .1
    const g = ac.createGain(); g.gain.value = (VOL[n] ?? .55) * vol
    s.connect(g).connect(ctx.saida())
    s.start(ac.currentTime + atraso / 1000)
    s.onended = () => g.disconnect()
  }

  /* ---------- campo do palpite com sugestões (vive entre renders: não perde o foco) ---------- */
  const campo = el('input', { className: `${XX}-campo`, placeholder: 'Qual é o filme?', maxLength: 80, autocomplete: 'off', spellcheck: false })
  const sugs = el('ul', { className: `${XX}-sugs`, hidden: true })
  let lista = [], sel = -1
  const forma = el('form', { className: `${XX}-chute` }, campo, sugs, el('button', { type: 'submit', className: `${XX}-btn ${XX}-btn--ok` }, 'Chutar'))
  function busca(q) {
    const k = norm(q)
    if (!Array.isArray(catalogo) || k.length < 2) return []
    const wq = palavras(q)
    const pts = c => {
      if (c.k.startsWith(k) || c.ko.startsWith(k)) return 4
      if (c.k.includes(' ' + k) || c.ko.includes(' ' + k)) return 3
      if (c.k.includes(k) || c.ko.includes(k)) return 2
      // com erro de digitação: palavras parecidas
      if (wq.length && wq.every(x => [...palavras(c.t), ...palavras(c.o)].some(w => palavraBate(x, w)))) return 1
      return 0
    }
    return catalogo.map(c => [pts(c), c]).filter(([p]) => p).sort((a, b) => b[0] - a[0]).slice(0, 8).map(([, c]) => c)
  }
  function mostraSugs() {
    sugs.replaceChildren(...lista.map((c, i) => {
      const li = el('li', { className: i === sel ? 'on' : '' }, el('b', { textContent: c.t }), el('small', { textContent: [c.o !== c.t ? c.o : '', c.ano].filter(Boolean).join(' · ') }))
      li.addEventListener('pointerdown', e => { e.preventDefault(); envia(c.t) })
      return li
    }))
    sugs.hidden = !lista.length
  }
  campo.addEventListener('focus', () => { pegaCatalogo().then(l => { catalogo = l }) })
  campo.addEventListener('input', async () => {
    if (!Array.isArray(catalogo)) catalogo = await pegaCatalogo()
    lista = busca(campo.value); sel = -1; mostraSugs()
  })
  campo.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && lista.length) { e.preventDefault(); sel = (sel + 1) % lista.length; mostraSugs() }
    else if (e.key === 'ArrowUp' && lista.length) { e.preventDefault(); sel = (sel - 1 + lista.length) % lista.length; mostraSugs() }
    else if (e.key === 'Escape') { lista = []; mostraSugs() }
    e.stopPropagation()
  })
  campo.addEventListener('blur', () => setTimeout(() => { lista = []; mostraSugs() }, 120))
  forma.addEventListener('submit', e => { e.preventDefault(); envia(sel >= 0 ? lista[sel].t : campo.value) })
  function envia(txt) {
    txt = String(txt || '').trim()
    if (!txt || !V) return
    manda({ op: 'chute', txt })
    campo.value = ''; lista = []; sel = -1; mostraSugs()
    som('clique')
  }

  /* ---------- MESA ---------- */
  const botao = (conteudo, fn, cls = '') => { const b = el('button', { type: 'button', className: `${XX}-btn ${cls}` }); b.append(...[conteudo].flat()); b.addEventListener('click', e => { e.stopPropagation(); b.blur(); som('clique'); fn(e) }); return b }
  const foto = (k, cls = '') => { const s = el('span', { className: `${XX}-foto ${cls}`, 'data-key': k }); s.append(ctx.pfp(k, 40, N(k))); return s }
  function render() {
    tela.classList.toggle(`${XX}--on`, !!V)
    ctx.onAtivo?.(!!V)
    if (!V) { tela.replaceChildren(); return }
    const tinhaFoco = document.activeElement === campo
    const topo = el('header', { className: `${XX}-topo` },
      el('span', { className: `${XX}-logo` }, el('i'), el('b', { textContent: 'Quadro' }), el('em', { textContent: 'a' }), el('b', { textContent: 'Quadro' })),
      V.fase !== 'convite' ? el('span', { className: `${XX}-cont`, textContent: `${MODOS[V.op.modo].nome} · ${CATS[V.op.cat]}` }) : '',
      V.fase === 'jogo' ? el('span', { className: `${XX}-cont`, textContent: `Filme ${V.i + 1} de ${V.total}` }) : '',
      V.op.modo === 'coop' && V.fase !== 'convite' ? el('span', { className: `${XX}-cont ${XX}-cont--time`, textContent: `Time: ${V.time} pts` }) : '',
      el('span', { className: `${XX}-grow` }),
      souHost() ? botao(icon('x'), encerrar, `${XX}-btn--ic`) : botao(icon('x'), () => { manda({ op: 'sai' }); dispensado = V.id; aplica(null) }, `${XX}-btn--ic`))
    const corpo = V.fase === 'convite' ? convite() : V.fase === 'fim' ? fim() : mesa()
    const bilhete = V.fase === 'convite' && !souHost() && V.conv[me.key] === '?' ? el('div', { className: `${XX}-bilhete` },
      el('span', { textContent: `${V.hostNome} chamou você para ${NOME}` }), botao('Jogar', () => manda({ op: 'resp', sim: true }), `${XX}-btn--ok`), botao('Só assistir', () => manda({ op: 'resp', sim: false }))) : ''
    tela.replaceChildren(topo, corpo, bilhete, el('small', { className: `${XX}-cred`, textContent: 'frames: FILMGRAB · títulos: Wikidata' }))
    ctx.hydrate(tela)
    if (tinhaFoco && campo.isConnected && !campo.disabled) campo.focus()
  }
  // página inicial: modos como cartões à esquerda; mesa (categoria, filmes, tempo, chutes, quem joga) à direita
  const ICO_MODO = {
    corrida: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    coop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><circle cx="16.5" cy="9" r="2.6"/><path d="M3 20c.6-3.6 3-5.5 6-5.5s5.4 1.9 6 5.5M15 14.6c2.8-.3 5 1.4 5.8 4.9"/></svg>',
    leilao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 12.5-8 8a2.12 2.12 0 1 1-3-3l8-8"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/></svg>',
  }
  const REGRAS = {
    corrida: ['Frames do menos óbvio ao mais fácil', 'Acertou no 1º frame: 6 pontos; no último: 1', 'Quem acerta primeiro ganha +1'],
    coop: ['Frames do menos óbvio ao mais fácil', 'Qualquer acerto vale para todos', 'Bata o recorde de pontos do grupo'],
    leilao: ['O 1º frame é o menos óbvio; aposte em segredo', 'Quem apostar menos tenta sozinho (2 chances)', 'Errou? Os outros roubam com tudo aberto'],
  }
  function convite() {
    if (!contaCats) pegaFilmes()
    const host = souHost(), m = V.op.modo
    const sim = Object.entries(V.conv).filter(([k, v]) => v === 'sim' && ctx.presentes().includes(k)).map(([k]) => k)
    const muda = d => manda({ op: 'opcao', ...d })
    const clicavel = (node, fn) => { if (host) { node.addEventListener('click', () => { som('clique'); fn() }); node.classList.add(`${XX}-clic`) } return node }
    const modos = el('div', { className: `${XX}-modos` }, ...Object.entries(MODOS).map(([k, md]) => clicavel(
      el('div', { className: `${XX}-modo ${k === m ? 'on' : ''}`, role: host ? 'button' : '' },
        el('span', { className: `${XX}-modo__ic`, innerHTML: ICO_MODO[k] }),
        el('div', { className: `${XX}-modo__txt` }, el('b', { textContent: md.nome }), el('small', { textContent: md.txt }),
          k === m ? el('ul', {}, ...REGRAS[k].map(r => el('li', { textContent: r }))) : '')), () => muda({ modo: k }))))
    // categorias com um frame de fundo (o primeiro filme de cada uma)
    // "Nossas sessões" aparece sempre (é a de vocês); com menos de 3 filmes fica apagada, com o que falta
    const cats = Object.keys(CATS).filter(c => c === 'nossos' || !contaCats || contaCats[c] >= 3)
    const gradeCats = el('div', { className: `${XX}-cats` }, ...cats.map(c => {
      const poucos = contaCats && contaCats[c] < 3, card = el('div', { className: `${XX}-cat ${c === V.op.cat ? 'on' : ''} ${c === 'nossos' ? `${XX}-cat--nossos` : ''} ${poucos ? 'off' : ''}`, style: capasCat?.[c] ? `--capa:url("${capasCat[c]}")` : '' },
        el('b', { textContent: CATS[c], title: c === 'famosos' ? 'Uma seleção de filmes bem conhecidos para jogar sem precisar ser cinéfilo.' : '' }), contaCats ? el('small', { textContent: poucos ? `${contaCats[c]} de 3 · vejam mais filmes` : `${contaCats[c]} filmes` }) : '')
      return poucos ? card : clicavel(card, () => muda({ cat: c }))
    }))
    const seg = (rot, itens, atual, chave, fmt) => el('div', { className: `${XX}-seg` }, el('small', { textContent: rot }),
      el('div', { className: `${XX}-seg__opts` }, ...itens.map(x => clicavel(el('span', { className: x === atual ? 'on' : '', textContent: fmt(x) }), () => muda({ [chave]: x })))))
    const ajustes = el('div', { className: `${XX}-ajustes` },
      seg('Filmes', OP_FILMES, V.op.filmes, 'filmes', String),
      m !== 'leilao' ? seg('Cada frame', OP_SEG, V.op.seg, 'seg', x => (x ? `${x}s` : 'Sem tempo')) : '',
      m !== 'leilao' ? seg('Chutes por frame', OP_CHUTES, V.op.chutes || 2, 'chutes', String) : '')
    const min = MODOS[m].min
    const ir = host
      ? botao(sim.length < min ? `${MODOS[m].nome} precisa de ${min}` : 'Começar', () => comecar(), `${XX}-btn--ok ${XX}-btn--grande`)
      : el('small', { className: `${XX}-espera`, textContent: `${V.hostNome} escolhe e começa` })
    if (host && sim.length < min) ir.disabled = true
    return el('div', { className: `${XX}-menu` },
      el('section', { className: `${XX}-col` }, el('h3', { textContent: 'Modo' }), modos),
      el('section', { className: `${XX}-col ${XX}-col--mesa` },
        el('h3', { textContent: 'Categoria' }), gradeCats, ajustes,
        el('div', { className: `${XX}-rodape` }, el('div', { className: `${XX}-quem` }, ...sim.map(k => foto(k)), el('small', { textContent: `${sim.length} ${sim.length === 1 ? 'jogador' : 'jogadores'}` })), ir)))
  }
  function mesa() {
    const revelado = V.est === 'revela'
    const atual = verFrame >= 0 && verFrame < V.frames.length ? verFrame : V.frames.length - 1
    const img = el('img', { className: `${XX}-img`, src: V.frames[atual], alt: '', draggable: false })
    img.addEventListener('error', () => img.classList.add('erro'))
    const decorrido = V.dur - V.resta + (Date.now() - recebidoEm)
    const tela1 = el('div', { className: `${XX}-tela${revelado ? ` ${XX}-tela--revela` : ''}` }, img,
      revelado ? el('div', { className: `${XX}-titulo` }, el('small', { textContent: V.filme.o !== V.filme.t ? `${V.filme.o} · ${V.filme.ano}` : String(V.filme.ano) }), el('b', { textContent: V.filme.t })) : '',
      !revelado && V.resta ? el('div', { className: `${XX}-barra` }, el('i', { style: `animation-duration:${V.dur / 1000}s; animation-delay:-${decorrido / 1000}s` })) : '')
    const tira = el('div', { className: `${XX}-tira` }, ...Array.from({ length: V.n }, (_, i) => {
      if (i >= V.frames.length) return el('span', { className: `${XX}-quadro ${XX}-quadro--fechado` }, el('b', { textContent: String(i + 1) }))
      const q = el('button', { type: 'button', className: `${XX}-quadro ${i === atual ? 'on' : ''}` }, el('img', { src: V.frames[i], alt: '', loading: 'lazy' }))
      q.addEventListener('click', () => { verFrame = i; render() })
      return q
    }))
    const jogo = V.js.some(j => j.key === me.key), eu = V.acertos[me.key]
    const travado = V.trava > 0 && Date.now() - recebidoEm < V.trava
    campo.disabled = travado
    if (travado) setTimeout(() => { if (V) render() }, V.trava - (Date.now() - recebidoEm) + 30)
    const aviso = (t, cls = '') => el('p', { className: `${XX}-aviso ${cls}` }, t)
    const quaseAviso = meuQuase > Date.now() ? el('span', { className: `${XX}-quase` }, 'Quase! Tá perto…') : ''
    let baixo
    if (revelado) baixo = aviso(V.op.modo === 'coop' && Object.keys(V.acertos).length ? `A turma acertou! +${Math.max(...Object.values(V.acertos).map(a => a.pts))}` : V.i + 1 < V.total ? 'Próximo filme já vem…' : 'Última! Vendo o placar…')
    else if (!jogo) baixo = aviso('Você está assistindo')
    else if (V.est === 'lance') {
      const meu = typeof V.lances[me.key] === 'number' ? V.lances[me.key] : 0
      baixo = el('div', { className: `${XX}-leilao` }, el('b', { textContent: meu ? `Seu lance: ${meu} ${meu === 1 ? 'frame' : 'frames'}. Pode baixar até o tempo acabar.` : 'Com quantos frames você acerta?' }),
        el('div', { className: `${XX}-lances` }, ...Array.from({ length: V.n }, (_, i) => botao(String(i + 1), () => manda({ op: 'lance', n: i + 1 }), `${XX}-lance ${meu === i + 1 ? 'on' : ''}`))))
    } else if (V.est === 'desafio' && V.venc.key !== me.key) baixo = aviso(`${N(V.venc.key)} apostou que acerta com ${V.venc.n} ${V.venc.n === 1 ? 'frame' : 'frames'}… (${V.tent} ${V.tent === 1 ? 'chance' : 'chances'})`)
    else if (V.est === 'roubo' && V.venc?.key === me.key) baixo = aviso('Não foi… agora os outros podem roubar!')
    else if (eu) baixo = aviso(eu.time ? 'A turma acertou!' : `Acertou! +${eu.pts}. Esperando os outros…`, `${XX}-aviso--ok`)
    else if (V.est !== 'desafio' && V.chutei >= V.limite) baixo = aviso(`Seus ${V.limite === 1 ? 'chute acabou' : `${V.limite} chutes acabaram`} neste frame. Espere o próximo${V.op.seg ? '' : ' (todo mundo chutar ou passar)'}.`)
    else {
      const extra = V.est === 'desafio' ? el('small', { className: `${XX}-espera` }, `Sua vez! ${V.tent} ${V.tent === 1 ? 'chance' : 'chances'}`)
        : V.est === 'roubo' ? el('small', { className: `${XX}-espera` }, 'Roubo! Acertou, leva 2')
          : V.passou.includes(me.key) ? el('small', { className: `${XX}-espera` }, V.op.seg ? 'Esperando os outros passarem…' : 'Esperando os outros… pode chutar de novo')
            : botao([icon('skip-forward'), 'Passo'], () => manda({ op: 'passa' }), `${XX}-btn--passa`)
      const resta = V.est === 'desafio' ? V.tent : V.limite - V.chutei
      forma.querySelector('button').textContent = `Chutar · ${resta}`
      baixo = el('div', { className: `${XX}-baixo` }, forma, extra)
    }
    const placar = el('ol', { className: `${XX}-placar` }, ...[...V.js].sort((a, b) => b.pontos - a.pontos).map(j => {
      const a = V.acertos[j.key], l = V.lances[j.key]
      return el('li', { className: a ? 'ok' : V.passou.includes(j.key) ? 'passou' : '', 'data-key': j.key }, foto(j.key), el('span', { textContent: N(j.key) }),
        V.est === 'lance' && l ? el('em', { className: `${XX}-apostou`, textContent: typeof l === 'number' ? `${l}` : '✓' }) : '',
        V.venc?.key === j.key && V.est !== 'lance' ? el('em', { className: `${XX}-apostou`, textContent: `${V.venc.n}` }) : '',
        a && a.pts ? el('em', { textContent: `+${a.pts}` }) : '', el('b', { textContent: String(j.pontos) }))
    }))
    const faltam = V.est === 'olhando' ? V.js.filter(j => !V.acertos[j.key] && !V.passou.includes(j.key)) : []
    const passes = V.est === 'olhando' && V.passou.length ? el('div', { className: `${XX}-passes` },
      el('small', { textContent: 'Já foram:' }), ...V.passou.map(k => el('span', { className: 'ok', 'data-key': k }, foto(k, `${XX}-foto--mini`), N(k))),
      faltam.length ? el('small', { textContent: 'Faltam:' }) : '', ...faltam.map(j => el('span', { className: 'falta', 'data-key': j.key }, foto(j.key, `${XX}-foto--mini`), N(j.key), el('i', { textContent: '…' })))) : ''
    const erros = el('div', { className: `${XX}-erros` }, quaseAviso, ...V.erros.slice(-5).map(e => el('span', { className: e.q ? 'q' : '' }, el('b', { textContent: N(e.key) }), ` ${e.txt}`)))
    return el('div', { className: `${XX}-mesa` }, el('div', { className: `${XX}-palco` }, tela1, tira, passes, erros, baixo), placar)
  }
  function fim() {
    const ord = [...V.js].sort((a, b) => b.pontos - a.pontos)
    const coop = V.op.modo === 'coop'
    const titulo = coop ? `A turma fez ${V.time} pontos` : V.vencedor ? `${N(V.vencedor)} ${V.vencedor === me.key ? 'venceu!' : 'venceu'}` : 'Empate!'
    return el('div', { className: `${XX}-fim` },
      el('b', { className: `${XX}-fim__t`, textContent: titulo }),
      coop ? el('small', { className: `${XX}-espera`, textContent: `de ${V.total * 6} possíveis · quem mais acertou: ${ord[0] ? N(ord[0].key) : '—'}` }) : '',
      el('ol', { className: `${XX}-placar ${XX}-placar--fim` }, ...ord.map((j, i) => el('li', { 'data-key': j.key }, el('i', { textContent: `${i + 1}º` }), foto(j.key), el('span', { textContent: N(j.key) }), el('small', { textContent: `${j.acertos}/${V.total}` }), el('b', { textContent: String(j.pontos) })))),
      el('div', { className: `${XX}-cartaz` }, ...(V.filmes || []).map(f => el('figure', {}, el('img', { src: f.capa, alt: '', loading: 'lazy' }), el('figcaption', { textContent: `${f.t} (${f.ano})` })))),
      souHost() ? botao('Nova partida', revanche, `${XX}-btn--ok ${XX}-btn--grande`) : '')
  }
  let ultTique = 0
  function anima(evs) {
    for (const e of evs) {
      if (e.t === 'inicio') som('embaralhar')
      else if (e.t === 'filme') som('desliza')
      else if (e.t === 'frame') som('vez')
      else if (e.t === 'venceu-lance') { som('leque'); toast(`${N(e.key)} vai tentar com ${e.n} ${e.n === 1 ? 'frame' : 'frames'}!`, 2600) }
      else if (e.t === 'roubo') { som('papel'); toast('Roubo liberado: todos os frames abertos!', 2600) }
      else if (e.t === 'semlance') toast('Ninguém deu lance: vale para todo mundo', 2400)
      else if (e.t === 'acertou') { som('carimbo', 0, e.key === me.key ? 1 : .6); if (e.key !== me.key) toast(`${N(e.key)} acertou${e.primeiro && V.op.modo === 'corrida' ? ' primeiro' : ''}!`, 1800); ctx.balao?.(e.key, '🎬 acertei!') }
      else if (e.t === 'errou') { som('papel', 0, e.key === me.key ? 1 : .5); if (e.key === me.key && e.q) { meuQuase = Date.now() + 2500; setTimeout(() => V && render(), 2600); render() } }
      else if (e.t === 'revela') som(e.alguem ? 'vez' : 'papel')
      else if (e.t === 'saiu') toast(`${e.nome} saiu da mesa`, 3200)
    }
    if (V?.fase === 'jogo' && V.est !== 'revela' && V.resta && V.resta < 3500 && Date.now() - ultTique > 3000) { ultTique = Date.now(); som('tique') }
  }
  ;(function loop() { if (V) { const pres = new Set(ctx.presentes()); for (const s of tela.querySelectorAll('[data-key]')) s.classList.toggle('caiu', !pres.has(s.dataset.key)) } setTimeout(loop, 1000) })()

  function iniciar(chamados) {
    carregaSons(); pegaFilmes(); pegaCatalogo().then(l => { catalogo = l })
    if (V && !souHost()) return toast(`Já tem uma mesa aberta (de ${V.hostNome})`)
    if (G) return toast('A mesa já está aberta')
    abrir(chamados)
  }
  window[`__${XX}`] = () => ({ G, V, difunde })
  return {
    got: (d, k) => { carregaSons(); got(d, k) }, iniciar, ativo: () => !!V,
    lider: () => !!V && souHost(),
    encerra: () => { if (G && G.host === me.key) encerrar() },
    sair: () => { if (!V) return; if (G && G.host === me.key) return encerrar(); manda({ op: 'sai' }); dispensado = V.id; aplica(null) },
    jogadores: () => !V ? [] : V.fase === 'convite' || !V.js?.length ? Object.keys(V.conv || {}).filter(k => V.conv[k] === 'sim') : V.js.map(j => j.key),
    entrouAlguem: key => { if (!G || G.host !== me.key) return; if (G.fase === 'convite' && !(key in G.conv)) { G.conv[key] = '?'; return difunde() } ctx.sendTo(key, { [XX]: { v: vista(key) } }) },
  }
}
