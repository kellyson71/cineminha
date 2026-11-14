// Faixa a Faixa: adivinhe a música. Começa só com a bateria; cada erro ou "pular" abre mais um instrumento,
// e a última linha é uma dica. Quanto antes acertar, mais pontos. Acertar só o artista vale metade.
// Dias: 5 músicas por dia (tools/faixa/diario.py). Dá para jogar um dia ou um combo de vários dias.
// O host (quem começou) guarda o estado e manda para todos pela action 'jogo'.

const BASE = 'jogos/faixa/'
const MODOS = {
  coletivo: { nome: 'Cooperativo', ic: 'users', dica: 'Todo mundo ouve o mesmo. Qualquer erro ou pulo abre o próximo instrumento para todos.' },
  individual: { nome: 'Cada um', ic: 'user', dica: 'Cada um no seu ritmo, vendo quem já acertou.' },
  cegas: { nome: 'Às cegas', ic: 'eye-off', dica: 'Cada um no seu ritmo, sem saber dos outros até a revelação.' },
  leilao: { nome: 'Leilão', ic: 'gavel', novo: true, dica: 'Dê um lance: com quantos instrumentos você acerta? Quem arrisca menos tenta, com um palpite só. Sem relógio.' },
  corrida: { nome: 'Corrida', ic: 'zap', novo: true, dica: 'Uma camada nova a cada 8 s para todos. Quem acerta primeiro leva mais pontos.' },
  ano: { nome: 'Que ano é?', ic: 'clock', novo: true, dica: 'Ouça a música inteira e chute o ano de lançamento. Quanto mais perto, mais pontos.' },
}
const ANTIGOS = ['coletivo', 'individual', 'cegas']
const ANO_ATUAL = new Date().getFullYear()
const ANO_MIN = 1950
const anoReal = m => { const a = Number(m?.ano); return Number.isInteger(a) && a >= 1900 && a <= ANO_ATUAL ? a : 0 }
const ptsAno = dif => dif === 0 ? 5 : dif <= 1 ? 4 : dif <= 2 ? 3 : dif <= 5 ? 2 : dif <= 10 ? 1 : 0
const PTS_CORRIDA = [5, 3, 2]
const ptsOrdem = pos => PTS_CORRIDA[pos] ?? 1 // pos = quantos já acertaram antes
const CAMADA_MS = 8000, ULTIMA_MS = 10000, TRAVA_MS = 2000, ANO_MS = 60000
// categorias: etiquetas da Deezer (generos, pais, ano) + do catálogo classificado pelo Antigravity (tg: generos, vibes, fama)
const GEN = (m, ...gs) => [...(m.generos || []), ...(m.tg?.generos || [])].some(g => gs.some(x => g.toLowerCase().includes(x)))
const VIBE = (m, ...vs) => (m.tg?.vibes || []).some(v => vs.includes(v))
const BR = m => m.pais === 'BR' || m.tg?.pais === 'BR' || GEN(m, 'mpb', 'sertanejo', 'pagode', 'samba', 'funk-br', 'forro', 'forró', 'axé', 'rock-nacional')
const ANO = m => m.ano || m.tg?.decada || 0
const DISNEY = m => m.categoria === 'disney' || m.origem === 'disney' || VIBE(m, 'disney') || GEN(m, 'disney') || (m.tg?.generos || []).some(g => g.toLowerCase().includes('disney'))
const DESENHOS = m => m.categoria === 'desenhos' || m.categoria === 'desenho' || m.origem === 'desenhos' || m.origem === 'desenho' || GEN(m, 'desenho', 'desenhos', 'anime', 'animes', 'animation', 'cartoon', 'cartoons') || VIBE(m, 'desenho', 'desenhos', 'anime') || (m.tg?.generos || []).some(g => ['desenho', 'desenhos', 'anime', 'animes', 'cartoon'].includes(g.toLowerCase()))
const JOGOS = m => m.categoria === 'jogos' || GEN(m, 'jogos')
const FILMES = m => m.categoria === 'filmes' || GEN(m, 'filmes e séries')
// "De onde é?": músicas com obra (filme, desenho, série ou jogo). Nessa categoria o palpite é a obra, não a música
const ORIGEM = m => !!m.obra
// Aberturas: abertura ou tema de desenho, anime ou série (tools/faixa/aberturas.py marca `ab`). Também vale o palpite da obra
const ABERTURA = m => !!m.obra && (m.ab || (m.categoria !== 'jogos' && /\babertura\b|opening|theme song/i.test(m.t || '')))
// trilhas: entrou no jogo como música de desenho, anime ou jogo, ou é abertura. Nas playlists das pessoas ficam
// escondidas por padrão (caixinha "incluir desenhos, aberturas e jogos")
const TRILHA = m => ['desenhos', 'desenho', 'jogos'].includes(m.origem) || ABERTURA(m)
// pessoas: a playlist de cada um vira categoria (tools/faixa/pessoas.py marca `de` nas músicas)
const PESSOAS_CAT = [{ id: 'gabi', nome: 'Gabi', da: 'da' }, { id: 'otavio', nome: 'Otávio', da: 'do' }, { id: 'meris', nome: 'Meris', da: 'da' }]
const CATEGORIAS = [
  ...PESSOAS_CAT.map(p => ({ id: `p-${p.id}`, nome: p.nome, pessoa: p.id, da: p.da, f: m => (m.de || []).includes(p.id) })),
  { id: 'origem', nome: 'De onde é?', ic: '🧩', f: ORIGEM, origem: true },
  { id: 'aberturas', nome: 'Aberturas', ic: '📡', f: ABERTURA, origem: true },
  { id: 'jogos', nome: 'Jogos', ic: '🎮', f: JOGOS },
  { id: 'filmes', nome: 'Filmes e séries', ic: '🎬', f: FILMES },
  { id: 'estudio', nome: 'Faixas de estúdio', ic: '🎚️', f: m => m.fonte === 'estudio' },
  { id: 'disney', nome: 'Disney', ic: '🏰', f: DISNEY },
  { id: 'desenhos', nome: 'Desenhos e animes', ic: '📺', f: DESENHOS },
  { id: 'nacionais', nome: 'Nacionais', ic: '🇧🇷', f: BR },
  { id: 'gringas', nome: 'Gringas', ic: '🌎', f: m => !BR(m) && !!(m.pais || m.tg?.pais) },
  { id: 'hinos', nome: 'Pra cantar junto', ic: '🎙️', f: m => VIBE(m, 'hino') || (m.tg?.fama >= 5) },
  { id: 'rocknac', nome: 'Rock nacional', ic: '🤘', f: m => GEN(m, 'rock-nacional') || (BR(m) && GEN(m, 'rock')) },
  { id: 'rock', nome: 'Rock', ic: '🎸', f: m => GEN(m, 'rock', 'metal', 'alternativ', 'indie') },
  { id: 'mpb', nome: 'MPB e samba', ic: '🌴', f: m => GEN(m, 'mpb', 'pagode', 'samba') },
  { id: 'sertanejo', nome: 'Sertanejo e forró', ic: '🤠', f: m => GEN(m, 'sertanejo', 'forro', 'forró', 'axé') },
  { id: 'sofrencia', nome: 'Sofrência e românticas', ic: '💔', f: m => VIBE(m, 'sofrencia', 'romantica', 'triste') },
  { id: 'pop', nome: 'Pop', ic: '✨', f: m => GEN(m, 'pop') },
  { id: 'danca', nome: 'Pra dançar', ic: '🪩', f: m => VIBE(m, 'festa') || GEN(m, 'dance', 'disco', 'eletronica', 'funk', 'soul', 'r&b') },
  { id: 'rap', nome: 'Rap, trap e funk', ic: '🎧', f: m => GEN(m, 'rap', 'hip hop', 'trap', 'funk-br') },
  { id: 'emo', nome: 'Emo e anos 2000', ic: '🖤', f: m => VIBE(m, 'emo') },
  { id: 'virais', nome: 'Virais e memes', ic: '📱', f: m => VIBE(m, 'viral') || GEN(m, 'internet-meme') },
  { id: 'classicos', nome: 'Clássicos (até 1989)', ic: '📼', f: m => ANO(m) && ANO(m) < 1990 },
  { id: 'anos90', nome: 'Anos 90 e 2000', ic: '💿', f: m => ANO(m) >= 1990 && ANO(m) < 2010 },
  { id: 'recentes', nome: 'Recentes', ic: '🔥', f: m => ANO(m) >= 2015 },
]
const ICONE = { bateria: '1f941', baixo: '1f3b8', base: '1f3b8', guitarra: '1f3b8', violao: '1f3b8', piano: '1f3b9', teclado: '1f3b9', outros: '1f3b6', resto: '1f3b6', melodia: '1f3b7', voz: '1f3a4', mix: '1f3b9' }
const ANIMADO = new Set(['1f941', '1f3b8', '1f3b7', '1f3b6'])
const MAX_AUDIO = 5
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const semAcento = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
// outras versões da mesma música contam como ela: "(Ao Vivo)", "- Live", "Remastered 2011", "Acústico"…
// (o que vem depois de " - " é quase sempre a versão; parênteses e colchetes também saem)
const VERSAO_FIM = /\s(ao vivo|live|acustico|acoustic|remaster(ed|izad[ao])?( \d{4})?|\d{4} remaster(ed)?|versao [a-z ]+|radio edit|single version|deluxe|playback|unplugged|em casa)$/
const norm = t => semAcento(t).replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\s[-–—|/]\s.*$/, ' ').replace(/\b(feat|ft|part)\b.*$/, ' ').replace(/[^a-z0-9]+/g, ' ').trim().replace(VERSAO_FIM, '').trim()
function dist(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 1; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[m][n]
}
export function confere(palpite, titulo) {
  const p = norm(palpite), t = norm(titulo)
  if (!p || p.length < 2 || !t) return false
  if (p === t || p.replace(/ /g, '') === t.replace(/ /g, '')) return true
  if (t.length >= 3 && p.includes(t)) return true // escreveu a música e mais alguma coisa (o artista, por exemplo)
  if (p.length >= Math.max(4, t.length * .6) && t.startsWith(p)) return true // escreveu boa parte do começo
  // todas as palavras que importam do título estão no palpite (em qualquer ordem)
  const pal = t.split(' ').filter(w => w.length > 2)
  if (pal.length >= 2 && pal.every(w => p.split(' ').some(x => x === w || (w.length > 4 && dist(x, w) <= 1)))) return true
  return dist(p, t) <= Math.max(1, Math.floor(t.length * .28))
}
const normArt = a => norm(a).replace(/\b(e|and|y|the|os|as)\b/g, ' ').replace(/\s+/g, ' ').trim()
const mesmoArtista = (a, b) => {
  const x = normArt(a), y = normArt(b)
  if (!x || !y) return false
  if (x === y || (x.length > 3 && y.includes(x)) || (y.length > 3 && x.includes(y)) || confere(x, y)) return true
  // dupla/banda escrita diferente: metade das palavras em comum já basta
  const wx = x.split(' ').filter(w => w.length > 2), wy = new Set(y.split(' ').filter(w => w.length > 2))
  return wx.length > 0 && wx.filter(w => wy.has(w)).length >= Math.ceil(Math.min(wx.length, wy.size) / 2)
}
// a obra (desenho, filme, jogo) também vale como "artista", com os outros nomes dela
const obrasDe = m => [m?.obra, ...(m?.obra_alt || [])].filter(Boolean)
const ehObra = (x, m) => !!x && obrasDe(m).some(o => mesmoArtista(x, o) || confere(x, o))
const titulosDe = m => [m.t, ...(m.alt || [])].filter(Boolean)
const hojeStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function nomeDia(iso, curto) {
  const [y, m, d] = iso.split('-').map(Number), dt = new Date(y, m - 1, d)
  const dif = Math.round((new Date(hojeStr() + 'T00:00') - dt) / 864e5)
  if (dif === 0) return 'Hoje'
  if (dif === 1) return 'Ontem'
  return curto ? `${d} ${MESES[m - 1]}` : `${SEMANA[dt.getDay()]}, ${d} ${MESES[m - 1]}`
}
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
// esconde o nome do artista: "Tim Maia" -> "T__ M___"
const iniciais = a => String(a).split(/(\s+)/).map(w => /\s/.test(w) || !w ? w : w[0] + '_'.repeat(Math.max(0, w.length - 1))).join('')

// agrupa as faixas separadas em até 5 passos de áudio (junta piano/outros/etc.) + 1 passo de dica
function passosDe(m) {
  const g = m.camadas.map((c, i) => ({ tipo: c.tipo, nome: c.nome, idx: [i] }))
  const juntaveis = ['piano', 'teclado', 'outros', 'resto', 'melodia', 'base', 'guitarra', 'mix']
  while (g.length > MAX_AUDIO) {
    const i = g.findIndex((x, k) => k < g.length - 1 && juntaveis.includes(x.tipo) && juntaveis.includes(g[k + 1].tipo))
    const k = i >= 0 ? i : g.length - 3
    const a = g[k], b = g[k + 1]
    const guit = a.tipo === 'base' && b.tipo === 'guitarra'
    g.splice(k, 2, { tipo: guit ? 'guitarra' : 'mix', nome: guit ? 'Guitarras' : 'Teclados e efeitos', idx: [...a.idx, ...b.idx] })
  }
  return [...g, { tipo: 'dica', nome: 'Dica', idx: [], dica: true }]
}

const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch {} } }

export function criaFaixa(ctx) {
  const { el, icon, toast, sysMsg, me } = ctx
  let S = null, seq = 0, dias = null
  const tela = ctx.tela
  const ehHost = () => S && S.host === me.key
  const euJog = () => S?.jog?.[me.key]
  const individual = () => !!S && (S.modo === 'individual' || S.modo === 'cegas')
  const leiN = () => S?.lei?.fase === 'ouve' ? S.lei.n : 0 // camadas que o leilão libera na hora do palpite
  const atualDe = () => S?.musicas[S.i]
  const musica = () => { const a = atualDe(); return a && dias?.[a.d]?.find(m => m.n === a.n) }
  const pasta = () => { const a = atualDe(); return `${BASE}dias/${a.d}/${a.n}/` }
  const passos = () => { const m = musica(); return m ? passosDe(m) : [] }
  const total = () => passos().length || 6
  const valor = p => Math.max(100, (total() - p + 1) * 100)
  const passoDe = j => individual() ? j.n : S.modo === 'leilao' ? leiN() : S.modo === 'ano' ? total() : S.camada
  const pontosEquipe = () => Math.max(0, ...Object.values(S?.placar || {}))
  const coop = () => S?.modo === 'coletivo'
  // versus: cada um por si. Quem já acertou ou desistiu da música passa a ver o que os outros digitam e chutam
  const VERSUS = ['individual', 'cegas', 'corrida']
  const prontoEm = s => { const j = s?.jog?.[me.key]; return !!j && (!!j.ok || !!j.fora) }
  const espia = () => !!S && VERSUS.includes(S.modo) && S.fase === 'tocando' && prontoEm(S)
  const maxLance = () => Math.max(1, Math.min(5, total() - 1))

  async function carrega(forcar) {
    if (dias && !forcar) return
    dias = await fetch(BASE + 'dias.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : {}).catch(() => ({}))
  }

  /* ---------- estado (o host decide) ---------- */
  // o host também passa pelos avisos (era só quem recebia o estado: o histórico de quem abria a partida nunca era salvo)
  let anterior = null
  // relógio das fases com tempo (corrida, lance, palpite do leilão, ano): só o host tem o `prazo`; todo mundo recebe
  // o que falta (`cd`, em ms) no momento do envio e conta a partir da chegada, assim os relógios não precisam bater
  let prazo = null, chegou = 0
  const defPrazo = (ms, acao) => { prazo = { ate: Date.now() + ms, tot: ms, acao } }
  function carimbaPrazo() { if (S.fase !== 'tocando') prazo = null; S.cd = prazo ? Math.max(0, prazo.ate - Date.now()) : null; S.cdTot = prazo?.tot || 0 }
  const restaMs = () => S?.cd == null ? null : Math.max(0, S.cd - (Date.now() - chegou))
  function manda() {
    carimbaPrazo()
    S.seq = ++seq; chegou = Date.now(); ctx.send({ estado: S })
    if (ehHost()) ls.set('faixa.S', S.fase === 'fim' ? null : { ...S, t: Date.now() }) // se eu recarregar, a partida volta daqui
    avisos(anterior, S); anterior = JSON.parse(JSON.stringify(S))
    render(); prepara()
  }
  const novoJog = nome => ({ nome, n: 1, ok: 0, art: 0, fora: false, pts: 0, tent: [], ano: null, trav: false })
  function got(d, deKey) {
    if (!d) return
    if (d.estado) {
      const e = d.estado
      if (e.fim) { if (ls.get('faixa.S')?.id === e.id) ls.set('faixa.S', null); if (!S || e.id === S.id) { S = null; parar(); render() } return }
      if (S && e.id === S.id && e.seq <= S.seq) return
      if (e.host !== me.key && ls.get('faixa.S')?.id === e.id) ls.set('faixa.S', null) // alguém segue a partida: não volto a ela como host
      fechaVer() // a partida começou: o menu de quem escolhia sai da frente
      const antes = S
      S = e; seq = Math.max(seq, e.seq); chegou = Date.now()
      carrega().then(() => { avisos(antes, S); render(); prepara() })
      return
    }
    if (d.dig !== undefined) { if (deKey && S && (S.modo !== 'cegas' || espia())) ctx.digitandoFaixa?.(deKey, !!d.dig, coop() || espia() ? String(d.txt || '').slice(0, 60) : ''); return }
    if (d.menu !== undefined) return verMenu(d.menu, deKey)
    if (d.tl) return gotTl(d.tl, deKey)
    if (d.tlPede) return pedeuTl(d.tlPede, deKey)
    if (!ehHost() || !deKey || !S) return
    if (d.lance !== undefined || d.passa) return S.modo === 'leilao' ? leiAcao(d, deKey) : undefined
    if (d.ano !== undefined) return S.modo === 'ano' ? anoChute(Number(d.ano), deKey) : undefined
    if (!d.tent) return
    const j = S.jog[deKey] || (S.jog[deKey] = novoJog(d.nome || deKey))
    if (S.fase !== 'tocando' || j.ok || j.fora || S.modo === 'ano') return
    if (S.modo === 'leilao') return leiChute(d, deKey, j)
    if (S.modo === 'corrida') return corridaChute(d, deKey, j)
    const passo = passoDe(j)
    const t = { c: passo, tipo: String(d.tent.tipo), txt: String(d.tent.txt || '').slice(0, 80), ts: Date.now() }
    j.tent.push(t)
    const somar = pts => { if (pts > j.pts) { S.placar[deKey] = (S.placar[deKey] || 0) + pts - j.pts; j.pts = pts } }
    // cooperativo: um acerto vale para todo mundo da sessão (e a música acaba ali)
    const todos = S.modo === 'coletivo' ? Object.entries(S.jog) : [[deKey, j]]
    const soma = (x, k, pts) => { if (pts > x.pts) { S.placar[k] = (S.placar[k] || 0) + pts - x.pts; x.pts = pts } }
    if (t.tipo === 'certo') {
      const pts = valor(passo)
      for (const [k, x] of todos) { x.ok = passo; soma(x, k, pts) }
      if (S.modo === 'coletivo') { S.acertou = { key: deKey, nome: j.nome }; (S.contrib ||= {})[deKey] = (S.contrib[deKey] || 0) + 1; return revelar() }
    } else if (t.tipo === 'artista') {
      for (const [k, x] of todos) if (!x.art) { x.art = passo; soma(x, k, Math.floor(valor(passo) / 2)) }
    } else if (individual()) {
      if (j.n >= total()) j.fora = true; else j.n++
    } else {
      // coletivo: o erro/pulo de qualquer um abre a próxima camada para todos; na última, quem errou sai
      if (S.camada >= total()) j.fora = true; else S.camada++
    }
    if (Object.values(S.jog).every(x => x.ok || x.fora)) return revelar()
    manda()
  }
  function comecar({ lista, rotulo, modo, origem }) {
    if (modo === 'ano') {
      // só entram músicas com ano de lançamento de verdade (não só a década)
      const total0 = lista.length
      lista = lista.filter(a => anoReal(dias?.[a.d]?.find(m => m.n === a.n)))
      if (!lista.length) return toast('Nenhuma dessas músicas tem o ano de lançamento. Tente outro grupo.', 3600)
      if (lista.length < total0) toast(`Só ${lista.length} de ${total0} músicas têm o ano certo${lista.length < 3 ? ' — a rodada vai ser curta' : ''}.`, 3600)
    }
    if (!lista.length) return toast('Nenhuma música para jogar aqui (vocês já ouviram todas?).', 3200)
    S = { id: Math.random().toString(36).slice(2, 9), host: me.key, hostNome: me.name, rotulo, modo, origem: !!origem, musicas: lista, i: 0, fase: 'tocando', camada: 1, jog: {}, placar: {}, seq: 0, ordem: [], lei: null }
    for (const k of ctx.presentes()) S.jog[k] = novoJog(ctx.nomeDe(k))
    iniciaRodada()
    sysMsg(`${me.name} começou o Faixa a Faixa: ${rotulo} (${MODOS[modo].nome})`)
    manda()
  }
  // trocar de modo no meio do jogo (só quem criou)
  function mudarModo(novo) {
    if (!ehHost() || !MODOS[novo] || novo === S.modo || !ANTIGOS.includes(novo) || !ANTIGOS.includes(S.modo)) return
    const vivos = Object.values(S.jog).filter(j => !j.ok && !j.fora)
    if (novo === 'coletivo') S.camada = Math.max(1, ...vivos.map(j => j.n))
    else if (S.modo === 'coletivo') for (const j of Object.values(S.jog)) j.n = S.camada
    S.modo = novo
    sysMsg(`Modo: ${MODOS[novo].nome}`)
    manda()
  }
  function proxima() {
    if (!ehHost()) return
    if (S.i + 1 >= S.musicas.length) { S.fase = 'fim'; return manda() }
    S.i++; S.fase = 'tocando'; S.camada = 1; S.acertou = null; S.anoReal = 0
    for (const j of Object.values(S.jog)) Object.assign(j, { n: 1, ok: 0, art: 0, fora: false, pts: 0, tent: [], ano: null, trav: false, te: 0 })
    iniciaRodada()
    manda()
  }
  function revelar() { if (!ehHost() || S.fase !== 'tocando') return; if (S.modo === 'ano') pontuaAno(); S.fase = 'revela'; manda() }

  /* ---------- modos novos (o host decide tudo; os outros só mandam lance / palpite / ano) ---------- */
  setInterval(() => { if (!prazo || !ehHost() || S?.fase !== 'tocando' || Date.now() < prazo.ate) return; const a = prazo.acao; prazo = null; a() }, 200)
  function iniciaRodada() {
    prazo = null; S.lei = null; S.ordem = []
    if (S.modo === 'leilao') novaLei()
    else if (S.modo === 'corrida') defPrazo(CAMADA_MS + 2500, corridaTick) // 2,5 s a mais na primeira para todo mundo carregar o áudio
    else if (S.modo === 'ano') defPrazo(ANO_MS, revelar)
  }
  // Corrida: a cada CAMADA_MS abre a próxima; na última (a dica) espera ULTIMA_MS e revela
  function corridaTick() {
    if (S.modo !== 'corrida' || S.fase !== 'tocando') return
    if (S.camada >= total()) return revelar()
    S.camada++
    defPrazo(S.camada >= total() ? ULTIMA_MS : CAMADA_MS, corridaTick)
    manda()
  }
  function corridaChute(d, k, j) {
    const tipo = String(d.tent.tipo)
    if (tipo === 'errou' && Date.now() - (j.te || 0) < TRAVA_MS - 600) return // metralhadora de palpites
    j.tent.push({ c: S.camada, tipo, txt: String(d.tent.txt || '').slice(0, 80) })
    const cheio = ptsOrdem(S.ordem.length)
    const soma = pts => { if (pts > j.pts) { S.placar[k] = (S.placar[k] || 0) + pts - j.pts; j.pts = pts } }
    if (tipo === 'certo') { j.ok = S.camada; S.ordem.push(k); soma(cheio) }
    else if (tipo === 'artista') { if (!j.art) { j.art = S.camada; soma(Math.floor(cheio / 2)) } }
    else if (tipo === 'pulou') j.fora = true // desistiu
    else j.te = Date.now()
    if (Object.values(S.jog).every(x => x.ok || x.fora)) return revelar()
    manda()
  }
  // Leilão: lances em ordem (cada um menor que o anterior); passou = fora do leilão; quem tem o menor lance tenta
  function novaLei() {
    const pres = ctx.presentes(), ks = Object.keys(S.jog).filter(k => pres.includes(k))
    if (!ks.length) ks.push(me.key)
    const r = S.i % ks.length, ordem = [...ks.slice(r), ...ks.slice(0, r)]
    S.lei = { fase: 'lance', ordem, ativos: [...ordem], vez: ordem[0], lance: null, hist: [], ouvinte: null, n: 0, chute: '', res: null }
  }
  function leiAcao(d, k) {
    const L = S.lei
    if (S.fase !== 'tocando' || !L || L.fase !== 'lance' || L.vez !== k) return
    if (d.passa) return leiPassa(k)
    const n = Math.floor(Number(d.lance)), max = L.lance ? L.lance.n - 1 : maxLance()
    if (!(n >= 1 && n <= max)) return
    L.lance = { key: k, n }; L.hist.push({ k, n })
    if (n === 1) return leiFecha()
    leiProx(k)
  }
  function leiPassa(k) {
    const L = S.lei
    if (L.ativos.length === 1 && !L.lance) return // o último não pode passar sem lance nenhum
    L.ativos = L.ativos.filter(x => x !== k); L.hist.push({ k, n: 0 })
    leiProx(k)
  }
  function leiProx(de) {
    const L = S.lei, o = L.ordem, i = o.indexOf(de)
    for (let s2 = 1; s2 <= o.length; s2++) {
      const c = o[(i + s2) % o.length]
      if (L.ativos.includes(c) && c !== L.lance?.key) { L.vez = c; return manda() }
    }
    if (L.lance) return leiFecha()
    revelar()
  }
  // leilão sem relógio: cada um pensa no seu tempo. Só se a pessoa da vez sair da sala por 10 s o jogo segue sem ela
  // (e o host pode pular a vez de quem estiver demorando)
  let ausLei = { k: '', desde: 0 }
  setInterval(() => {
    if (!ehHost() || S?.modo !== 'leilao' || S.fase !== 'tocando' || !S.lei) return
    const L = S.lei, k = L.fase === 'lance' ? L.vez : L.fase === 'ouve' ? L.ouvinte : ''
    if (!k || k === me.key || ctx.presentes().includes(k)) { ausLei = { k: '', desde: 0 }; return }
    if (ausLei.k !== k) ausLei = { k, desde: Date.now() }
    else if (Date.now() - ausLei.desde > 10000) { ausLei = { k: '', desde: 0 }; L.fase === 'lance' ? leiTempoVez() : leiFim('tempo') }
  }, 1000)
  const leiTempoVez = () => { const L = S.lei; if (!L || L.fase !== 'lance') return; L.ativos.length === 1 && !L.lance ? leiAcao({ lance: maxLance() }, L.vez) : leiAcao({ passa: true }, L.vez) }
  function leiFecha() {
    const L = S.lei
    L.fase = 'ouve'; L.ouvinte = L.lance.key; L.n = L.lance.n; L.vez = null
    manda()
  }
  function leiChute(d, k, j) {
    const L = S.lei
    if (!L || L.fase !== 'ouve' || L.ouvinte !== k) return
    const tipo = String(d.tent.tipo), txt = String(d.tent.txt || '').slice(0, 80)
    j.tent.push({ c: L.n, tipo, txt }); L.chute = txt
    leiFim(tipo === 'certo' ? 'ok' : tipo === 'artista' ? 'art' : 'erro')
  }
  function leiFim(res) {
    const L = S.lei, o = S.jog[L.ouvinte]
    if (S.fase !== 'tocando' || L.res) return
    L.res = res
    if (o) {
      const cheio = 6 - L.n, pts = res === 'ok' ? cheio : res === 'art' ? Math.floor(cheio / 2) : 0
      if (res === 'ok') o.ok = L.n; else if (res === 'art') o.art = L.n; else o.fora = true
      o.pts = pts; S.placar[L.ouvinte] = (S.placar[L.ouvinte] || 0) + pts
      if (res !== 'ok') for (const k of L.ordem) if (k !== L.ouvinte && S.jog[k]) { S.jog[k].pts = 1; S.placar[k] = (S.placar[k] || 0) + 1 }
    }
    S.fase = 'revela'; manda()
  }
  // Que ano é?
  function anoChute(n, k) {
    const j = S.jog[k]
    if (!j || S.fase !== 'tocando' || j.trav || !Number.isInteger(n) || n < ANO_MIN || n > ANO_ATUAL) return
    j.ano = n; j.trav = true
    if (Object.values(S.jog).every(x => x.trav)) return revelar()
    manda()
  }
  function pontuaAno() {
    const real = anoReal(musica()); S.anoReal = real
    for (const [k, j] of Object.entries(S.jog)) if (j.trav && real) { const p = ptsAno(Math.abs(j.ano - real)); j.pts = p; S.placar[k] = (S.placar[k] || 0) + p; if (!(j.ano - real)) j.ok = 1 }
  }
  function encerrar() { if (!S) return; prazo = null; ctx.send({ estado: { id: S.id, fim: true } }); ls.set('faixa.S', null); S = null; parar(); render() }
  // recarreguei sendo o host: retoma a partida salva (se ninguém tiver mandado outra nesse meio tempo)
  setTimeout(() => {
    const s = ls.get('faixa.S')
    if (!s) return
    if (S || s.host !== me.key || s.fase === 'fim' || Date.now() - s.t > 3 * 3600e3) { if (S?.id !== s.id) ls.set('faixa.S', null); return }
    S = s; seq = s.seq || 0; delete S.t
    // relógios das fases com tempo voltam do ponto em que estavam
    const cd = S.fase === 'tocando' ? S.cd : null
    if (cd != null) {
      const acao = S.modo === 'corrida' ? corridaTick : S.modo === 'ano' ? revelar : S.modo === 'leilao' ? (S.lei?.fase === 'ouve' ? () => leiFim('tempo') : leiTempoVez) : null
      if (acao) defPrazo(Math.max(3000, cd), acao)
    }
    for (const k of ctx.presentes()) if (!S.jog[k]) S.jog[k] = novoJog(ctx.nomeDe(k))
    carrega().then(() => { if (S?.host === me.key) manda() })
  }, 2500)
  const salvos = new Set()
  function avisos(a, b) {
    // anúncios só fora do modo às cegas
    if (b.modo !== 'cegas' && b.modo !== 'leilao' && b.modo !== 'ano' && b.fase === 'tocando') for (const [k, j] of Object.entries(b.jog || {})) {
      const x = a?.i === b.i ? a?.jog?.[k] : null
      if (k === me.key || !x) continue
      if (j.ok && !x.ok) toast(`${j.nome} acertou a música!`, 2200)
      else if (j.art && !x.art) toast(`${j.nome} acertou ${b.origem ? 'a música' : 'o artista'}`, 1800)
    }
    // cooperativo: o chute de cada um aparece no balão em cima do boneco dele
    if ((b.modo === 'coletivo' || (VERSUS.includes(b.modo) && b.fase === 'tocando' && prontoEm(b))) && a?.id === b.id && a?.i === b.i) for (const [k, j] of Object.entries(b.jog || {})) {
      const x = a.jog?.[k]
      if (k === me.key || !x || j.tent.length <= x.tent.length) continue
      const t = j.tent[j.tent.length - 1]
      ctx.digitandoFaixa?.(k, false)
      ctx.balao?.(k, t.tipo === 'pulou' ? 'Pulei ⏭' : t.tipo === 'certo' ? `✓ ${t.txt}` : t.tipo === 'artista' ? `Artista ✓ ${t.txt}` : `✗ ${t.txt}`)
    }
    // na revelação, cada um guarda o próprio resultado daquela música
    const eu = b.jog?.[me.key], at = b.musicas?.[b.i]
    // os modos novos pontuam diferente: não entram no histórico do dia (nem nas bolinhas/números do lobby)
    if (b.fase === 'revela' && eu && at && !MODOS[b.modo]?.novo && !salvos.has(`${b.id}:${b.i}`)) {
      salvos.add(`${b.id}:${b.i}`)
      ctx.salvaRes({ data: at.d, n: at.n, r: eu.ok ? 'ok' : eu.art ? 'art' : 'fora', passo: eu.ok || eu.art || 0, pts: eu.pts })
    }
  }

  /* ---------- palpite (cada um confere o seu) ---------- */
  // quanto vale acertar agora (cada modo calcula de um jeito)
  const valeAgora = j => S.modo === 'leilao' ? 6 - (S.lei?.n || 5) : S.modo === 'corrida' ? ptsOrdem(S.ordem.length) : valor(passoDe(j))
  // corrida: depois de um erro, 2 s sem poder palpitar (só nesta aba; o host também segura palpites seguidos)
  let travaAte = 0
  function trava() {
    travaAte = Date.now() + TRAVA_MS
    const i = chute.input, antes = i.placeholder
    i.disabled = true; i.placeholder = 'Errou! Segura 2 s…'
    setTimeout(() => { i.disabled = false; i.placeholder = antes; if (S?.fase === 'tocando' && tela.contains(i) && !ctx.digitando()) i.focus({ preventScroll: true }) }, TRAVA_MS)
  }
  function chuta(g) {
    const m = musica(), j = euJog()
    if (!S || S.fase !== 'tocando' || !m || !j || j.ok || j.fora || S.modo === 'ano') return
    if (S.modo === 'leilao' && !(S.lei?.fase === 'ouve' && S.lei.ouvinte === me.key)) return
    if (S.modo === 'corrida' && Date.now() < travaAte) return toast('Calma! Espere o tempo da trava.', 1200)
    let tipo, txt = ''
    const mesmaMusica = g.tipo === 'musica' && ((m.dz && g.id === m.dz.t) || titulosDe(m).some(t => (g.t && norm(g.t) === norm(t)) || (confere(g.t, t) && (!g.a || mesmoArtista(g.a, m.a) || ehObra(g.a, m)))))
    if (g.tipo === 'pular') tipo = 'pulou'
    else if (S.origem) {
      // De onde é?: vale a obra (digitada, escolhida como "artista" ou numa música dela); acertar só a música vale metade
      const nome = g.tipo === 'artista' ? g.nome : g.t
      const certo = ehObra(nome, m) || (g.tipo === 'musica' && ehObra(g.a, m))
      const meio = !certo && (mesmaMusica || (g.tipo === 'artista' && mesmoArtista(g.nome, m.a)))
      if (meio && j.art) return toast('Essa parte você já acertou. Agora: de onde é?', 1800)
      tipo = certo ? 'certo' : meio ? 'artista' : 'errou'; txt = g.tipo === 'artista' ? g.nome : g.a && !ehObra(g.a, m) ? `${g.t} — ${g.a}` : g.t
      if (meio) toast(`Isso é da música, vale metade (+${Math.floor(valeAgora(j) / 2)}). Agora diga de onde é!`, 2600)
    } else if (g.tipo === 'artista') {
      const certo = (m.dz && g.id === m.dz.a) || mesmoArtista(g.nome, m.a) || ehObra(g.nome, m)
      if (certo && j.art) return toast('O artista você já acertou. Agora a música!', 1800)
      tipo = certo ? 'artista' : 'errou'; txt = g.nome
      if (certo) toast(S.modo === 'leilao' ? 'Artista certo! Vale metade.' : `Artista certo! +${Math.floor(valeAgora(j) / 2)} — agora a música vale o total.`, 2600)
    } else {
      // o nome igual (tirando "ao vivo", "remaster"…) já vale, mesmo que a versão escolhida seja de outro artista
      const certo = mesmaMusica
      tipo = certo ? 'certo' : 'errou'; txt = g.a ? `${g.t} — ${g.a}` : g.t
    }
    if (tipo === 'errou') { erroVisual(); if (S.modo === 'corrida') trava() }
    const d = { tent: { tipo, txt }, nome: me.name }
    ctx.send(d); if (ehHost()) got(d, me.key)
  }

  /* ---------- áudio: todas as faixas juntas em loop; cada passo só aumenta o volume ---------- */
  let P = null
  async function prepara() {
    const m = musica()
    if (!S || !m || S.fase === 'fim') return parar()
    const id = S.id + ':' + S.i
    if (P?.id !== id) {
      parar()
      const ac = ctx.audioCtx()
      P = { id }
      const base = pasta()
      const bufs = await Promise.all(m.camadas.map(c => fetch(base + c.arq).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).catch(() => null)))
      if (P?.id !== id) return
      const mestre = ac.createGain(); mestre.gain.value = .9; mestre.connect(ctx.saida())
      const ganhos = bufs.map(() => { const g = ac.createGain(); g.gain.value = 0; g.connect(mestre); return g })
      P = { id, ac, bufs, ganhos, mestre, fontes: [], t0: 0, pos: 0, play: false, dur: Math.max(...bufs.filter(Boolean).map(b => b.duration), 1) }
      volumes(); tocar(0)
      if (sincronizado()) ctx.send({ tlPede: id }) // cheguei depois: entro no ponto em que os outros estão
      return
    }
    volumes()
  }
  function tocar(de = 0) {
    if (!P?.bufs) return
    pararFontes()
    const ac = P.ac, quando = ac.currentTime + .04
    de = ((de % P.dur) + P.dur) % P.dur
    if (ac.state === 'suspended') ac.resume()
    P.fontes = P.bufs.map((b, i) => { if (!b) return null; const s = ac.createBufferSource(); s.buffer = b; s.loop = true; s.loopEnd = b.duration; s.connect(P.ganhos[i]); s.start(quando, Math.min(de, b.duration - .05)); return s })
    P.t0 = quando - de; P.play = true
    atualizaPlayer()
  }
  function pausar() { if (!P?.play) return; P.pos = posicao(); pararFontes(); P.play = false; atualizaPlayer() }
  const posicao = () => !P?.bufs ? 0 : P.play ? ((P.ac.currentTime - P.t0) % P.dur + P.dur) % P.dur : P.pos
  const pula = s => { if (P?.bufs) tocar(posicao() + s) }
  function pararFontes() { for (const s of P?.fontes || []) { try { s?.stop() } catch {} } if (P) P.fontes = [] }
  function abertas() {
    const ps = passos(); if (!ps.length || !S) return new Set()
    const j = euJog()
    const n = S.fase !== 'tocando' || j?.ok || j?.fora ? ps.length : passoDe(j || { n: 1 })
    return new Set(ps.slice(0, n).flatMap(p => p.idx))
  }
  function volumes() {
    if (!P?.ganhos) return
    const on = abertas(), t = P.ac.currentTime
    P.ganhos.forEach((g, i) => g.gain.setTargetAtTime(on.has(i) ? 1 : 0, t, .06))
  }
  function parar() { if (P?.ganhos) { pararFontes(); for (const g of P.ganhos) g.disconnect(); P.mestre.disconnect() } P = null }
  function atualizaPlayer() {
    const pl = tela.querySelector('.fx-player'); if (!pl || !P?.bufs) return
    const p = posicao()
    pl.querySelector('.fx-player__cab').style.width = `${(p / P.dur) * 100}%`
    pl.querySelector('.fx-player__t').textContent = `${fmt(p)} / ${fmt(P.dur)}`
    const b = pl.querySelector('.fx-player__play'); if (b.dataset.st !== String(P.play)) { b.dataset.st = String(P.play); b.replaceChildren(icon(P.play ? 'pause' : 'play')) }
  }
  // contagem regressiva das fases com tempo: atualiza só o texto e a barra, sem refazer a tela
  let cdUlt = 0
  function atualizaCd() {
    const r = restaMs(); if (r == null) return
    for (const c of tela.querySelectorAll('.fx-cd')) {
      c.querySelector('.fx-cd__txt').textContent = `${c.dataset.rot} ${Math.ceil(r / 1000)} s`
      c.querySelector('.fx-cd__barra i').style.width = `${S.cdTot ? Math.min(100, r / S.cdTot * 100) : 0}%`
      c.classList.toggle('urgente', r < 3000)
    }
  }
  const relogio = rot => { if (S?.cd == null) return ''; const c = el('div', { className: 'fx-cd' }, icon('clock'), el('span', { className: 'fx-cd__txt' }), el('span', { className: 'fx-cd__barra' }, el('i'))); c.dataset.rot = rot; return c }
  const envia = d => { ctx.send(d); if (ehHost()) got(d, me.key) }
  ;(function loop(t) { if (S && P?.play) atualizaPlayer(); if (S?.cd != null && t - cdUlt > 150) { cdUlt = t; atualizaCd() } requestAnimationFrame(loop) })(0)
  document.addEventListener('keydown', e => {
    if (!S || S.fase === 'fim' || e.key !== ' ' || e.target.closest?.('input, textarea, select')) return
    e.preventDefault(); alternaPlay()
  })

  /* ---------- música sincronizada ----------
     Nos modos em grupo (cooperativo, leilão, corrida, ano) todo mundo ouve no mesmo ponto: play, pause e pulos de
     qualquer um valem para todos. Nos versus (cada um, às cegas) cada um ouve no seu ritmo. Dá para trocar no player.
     Quem age manda a posição direto para todos (sem passar pelo host); o host corrige a diferença de vez em quando. */
  let syncEscolha = null // { id, on }: o que a pessoa escolheu nesta partida (senão vale o padrão do modo)
  const syncPadrao = () => !!S && !individual()
  const sincronizado = () => syncEscolha?.id === S?.id ? syncEscolha.on : syncPadrao()
  let tlUlt = 0 // quando chegou a última posição (para ignorar respostas repetidas)
  const msgTl = ev => ({ tl: { id: P.id, play: P.play, pos: posicao(), ev, nome: me.name } })
  function avisaTl(ev) { if (sincronizado() && P?.bufs) ctx.send(msgTl(ev)) }
  function alternaPlay() { P?.play ? pausar() : tocar(P?.pos || 0); avisaTl(P?.play ? 'play' : 'pause') }
  function trocaSync() {
    const on = !sincronizado()
    syncEscolha = { id: S?.id, on }
    if (on && P?.id) { tlUlt = 0; ctx.send({ tlPede: P.id }) } // voltou a ficar junto: pega o ponto dos outros
    toast(on ? 'Música junto com a sala' : 'Agora você ouve no seu ritmo', 1800)
    render()
  }
  // diferença em volta (a música toca em loop): 29 s e 1 s estão a 2 s de distância
  const difLoop = (a, b) => { const d = Math.abs(a - b) % P.dur; return Math.min(d, P.dur - d) }
  function gotTl(t, deKey) {
    if (!t || !deKey || !sincronizado() || !P?.bufs || t.id !== P.id) return
    const pos = Number(t.pos) || 0
    if (t.ev === 'resp') { if (Date.now() - tlUlt < 1500) return } // várias respostas ao mesmo pedido: vale a primeira
    tlUlt = Date.now()
    if (t.ev === 'drift' && t.play === P.play && difLoop(pos, posicao()) < .4) return // diferença pequena: deixa
    if (t.play) tocar(pos + .03)
    else { pararFontes(); P.play = false; P.pos = ((pos % P.dur) + P.dur) % P.dur; atualizaPlayer() }
    if (t.ev === 'play' || t.ev === 'pause') toast(`${t.nome || 'Alguém'} ${t.play ? 'deu play' : 'pausou'}`, 1300)
  }
  function pedeuTl(id, deKey) {
    if (!deKey || !sincronizado() || !P?.bufs || P.id !== id) return
    setTimeout(() => { if (P?.id === id) ctx.sendTo(deKey, msgTl('resp')) }, Math.random() * 250)
  }
  // o host acerta os relógios a cada 8 s (só corrige quem estiver mais de 0,4 s fora)
  setInterval(() => { if (ehHost() && P?.bufs && P.play && sincronizado() && S?.fase !== 'fim') ctx.send(msgTl('drift')) }, 8000)

  /* ---------- busca do palpite: catálogo local na hora + Deezer com capa ---------- */
  let catalogo = null
  // catálogo da busca de palpites: só baixa quando alguém começa a palpitar
  let pedindoCatalogo = null
  const pedeCatalogo = () => pedindoCatalogo ||= fetch(BASE + 'catalogo.json').then(r => r.json()).then(c => { catalogo = c.map(([t, a]) => ({ t, a, nt: norm(t), na: norm(a) })) }).catch(() => { catalogo = [] })
  const cache = new Map()
  // De onde é?: as sugestões são as obras (desenhos, filmes, séries, jogos) que existem no jogo
  const TIPO_OBRA = { jogos: 'Jogo', filmes: 'Filme ou série', disney: 'Disney', desenhos: 'Desenho, anime ou animação' }
  let obrasCache = null, obrasDe0 = null
  function obrasLista() {
    if (obrasCache && obrasDe0 === dias) return obrasCache
    const mp = new Map()
    for (const m of Object.values(dias || {}).flat()) if (m.obra && !mp.has(norm(m.obra))) mp.set(norm(m.obra), { nome: m.obra, sub: TIPO_OBRA[m.categoria] || 'Obra', chaves: obrasDe(m).map(norm) })
    obrasDe0 = dias; return (obrasCache = [...mp.values()])
  }
  function locaisObra(q) {
    const nq = norm(q), ws = nq.split(' ').filter(Boolean)
    if (!ws.length) return []
    const pont = o => Math.max(...o.chaves.map(k => k.startsWith(nq) ? 3 : ws.every(w => k.includes(w)) ? 2 : k.split(' ').some(w => w.startsWith(ws[0])) && ws.length === 1 ? 1 : 0))
    return obrasLista().map(o => [pont(o), o]).filter(([p]) => p).sort((a, b) => b[0] - a[0]).slice(0, 7).map(([, o]) => ({ tipo: 'artista', obra: true, nome: o.nome, titulo: o.nome, sub: o.sub }))
  }
  function locais(q) {
    const nq = norm(q), ws = nq.split(' ').filter(Boolean)
    if (!catalogo || !ws.length) return { musicas: [], artistas: [] }
    const pont = x => {
      if (!ws.every(w => x.nt.includes(w) || x.na.includes(w))) return 0
      return (x.nt.startsWith(nq) ? 4 : 0) + (x.na.startsWith(nq) ? 3 : 0) + (x.nt.includes(nq) ? 2 : 0) + 1
    }
    const ms = catalogo.map(x => [pont(x), x]).filter(([p]) => p).sort((a, b) => b[0] - a[0]).slice(0, 6).map(([, x]) => x)
    const arts = [...new Map(catalogo.filter(x => x.na.startsWith(nq) || ws.every(w => x.na.includes(w))).map(x => [x.na, x.a])).values()].slice(0, 2)
    return { musicas: ms.map(x => ({ t: x.t, a: x.a })), artistas: arts.map(nome => ({ nome })) }
  }
  const chute = (() => {
    const input = el('input', { placeholder: 'Qual é a música? (ou o artista)', autocomplete: 'off', spellcheck: false, enterKeyHint: 'send' })
    const lista = el('ul', { className: 'fx-busca__lista', hidden: true })
    const form = el('form', { className: 'fx-busca' }, el('span', { className: 'fx-busca__lupa' }, icon('search')), input, lista)
    let itens = [], sel = -1, timer = 0, ctrl = null, carregando = false, texto = ''
    const fecha = () => { lista.hidden = true }
    function junta(loc, rem) {
      const arts = new Map(), mus = new Map()
      for (const a of rem?.artistas || []) arts.set(norm(a.nome), { tipo: 'artista', id: a.id, nome: a.nome, titulo: a.nome, sub: a.fas ? `${a.fas.toLocaleString('pt-BR')} fãs` : 'Artista', img: a.foto })
      for (const a of loc.artistas) if (!arts.has(norm(a.nome))) arts.set(norm(a.nome), { tipo: 'artista', nome: a.nome, titulo: a.nome, sub: 'Artista' })
      for (const m of rem?.musicas || []) mus.set(norm(m.t) + '|' + norm(m.a), { tipo: 'musica', id: m.id, t: m.t, a: m.a, titulo: m.t, sub: m.album ? `${m.a} · ${m.album}` : m.a, img: m.capa })
      for (const m of loc.musicas) { const k = norm(m.t) + '|' + norm(m.a); if (!mus.has(k)) mus.set(k, { tipo: 'musica', t: m.t, a: m.a, titulo: m.t, sub: m.a }) }
      // as que você conhece (catálogo) primeiro
      const conhecidas = new Set(loc.musicas.map(m => norm(m.t) + '|' + norm(m.a)))
      const ms = [...mus.entries()].sort((a, b) => conhecidas.has(b[0]) - conhecidas.has(a[0])).map(([, x]) => x)
      return [...[...arts.values()].slice(0, 2), ...ms.slice(0, 7)]
    }
    function desenha() {
      const lis = itens.map((x, i) => {
        const li = el('li', { className: 'fx-busca__it' + (i === sel ? ' ativo' : '') + (x.tipo === 'artista' ? ' art' : '') },
          x.img ? el('img', { src: x.img, alt: '', referrerPolicy: 'no-referrer' }) : el('i', { className: 'fx-busca__ini', textContent: (x.titulo || '?')[0].toUpperCase() }),
          el('span', {}, el('b', { textContent: x.titulo }), el('small', { textContent: x.sub })),
          el('em', { textContent: x.obra ? 'De onde é' : x.tipo === 'artista' ? 'Artista · ½' : S?.origem ? 'Música · ½' : 'Música' }))
        li.addEventListener('pointerdown', e => e.preventDefault()) // não tira o foco do campo
        li.addEventListener('click', () => { if (!lista.hidden) escolhe(x) })
        return li
      })
      if (carregando) for (let i = 0; i < (itens.length ? 2 : 4); i++) lis.push(el('li', { className: 'fx-busca__it fx-busca__esq' }, el('i'), el('span', {}, el('b'), el('small'))))
      if (!carregando && !itens.length && texto.length >= 2) lis.push(el('li', { className: 'fx-busca__nada', textContent: `Nada encontrado. Enter chuta “${texto}” mesmo assim.` }))
      lista.replaceChildren(...lis)
      lista.hidden = !lis.length || document.activeElement !== input
    }
    function busca(q) {
      texto = q
      if (!q) { itens = []; carregando = false; return desenha() }
      if (S?.origem) {
        itens = locaisObra(q); carregando = false
        sel = itens.length && norm(itens[0].titulo).startsWith(norm(q)) ? 0 : -1
        return desenha()
      }
      const c = cache.get(norm(q))
      itens = junta(locais(q), c)
      sel = itens.length && norm(itens.find(x => x.tipo === 'musica')?.titulo || '').startsWith(norm(q)) ? itens.findIndex(x => x.tipo === 'musica') : -1
      carregando = !c && q.length >= 2
      desenha()
      clearTimeout(timer)
      if (!carregando) return
      timer = setTimeout(async () => {
        ctrl?.abort(); ctrl = new AbortController()
        const r = await fetch('api/musica?dz=' + encodeURIComponent(q), { signal: ctrl.signal }).then(r => r.json()).catch(() => null)
        if (texto !== q) return
        if (r) cache.set(norm(q), r)
        carregando = false
        itens = junta(locais(q), r); if (sel >= itens.length) sel = -1
        desenha()
      }, 140)
    }
    function escolhe(x) {
      input.value = ''; texto = ''; itens = []; fecha()
      chuta(x.tipo === 'artista' ? { tipo: 'artista', id: x.id, nome: x.nome } : { tipo: 'musica', id: x.id, t: x.t, a: x.a })
    }
    // avisa os outros que você está digitando um palpite (aparece em cima do seu boneco)
    // no cooperativo vai junto o que está sendo digitado (aparece no balão)
    let dig = false, digTxt = '', digT = 0, digEnvio = 0
    const avisaDig = on => {
      clearTimeout(digT); if (on) digT = setTimeout(() => avisaDig(false), 4000)
      if (!S) return
      const txt = on && (coop() || VERSUS.includes(S.modo)) ? input.value.trim().slice(0, 60) : '' // no versus só aparece para quem já terminou a música
      if (on === dig && txt === digTxt) return
      dig = on; digTxt = txt
      clearTimeout(digEnvio); digEnvio = setTimeout(() => ctx.send({ dig, txt: digTxt }), on ? 120 : 0)
    }
    // quando o catálogo chega, refaz a busca do que já foi digitado
    const comCatalogo = () => { if (!catalogo) pedeCatalogo().then(() => { if (input.value.trim()) busca(input.value.trim()) }) }
    input.addEventListener('focus', comCatalogo)
    input.addEventListener('input', () => { comCatalogo(); busca(input.value.trim()); avisaDig(!!input.value.trim()) })
    input.addEventListener('blur', () => avisaDig(false))
    form.addEventListener('submit', () => avisaDig(false))
    input.addEventListener('focus', () => { if (input.value.trim()) busca(input.value.trim()) }) // volta a lista ao voltar o foco
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!itens.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length; desenha() }
      else if (e.key === 'Escape') fecha()
    })
    input.addEventListener('blur', () => setTimeout(fecha, 120))
    document.addEventListener('pointerdown', e => { if (!form.contains(e.target)) fecha() }, true)
    form.addEventListener('submit', e => {
      e.preventDefault()
      if (sel >= 0 && itens[sel] && !lista.hidden) return escolhe(itens[sel])
      const v = input.value.trim(); if (!v) return
      input.value = ''; texto = ''; itens = []; fecha(); chuta({ tipo: 'musica', t: v })
    })
    return { form, input }
  })()
  function erroVisual() { const f = tela.querySelector('.fx-filme'); if (!f) return; f.classList.remove('erro'); void f.offsetWidth; f.classList.add('erro') }

  /* ---------- tela ---------- */
  // logo: adesivo colado meio torto (mesmo no menu e no jogo)
  const marquee = () => el('div', { className: 'fx-logo', 'aria-label': 'Faixa a Faixa' }, el('b', { textContent: 'Faixa' }), el('i', { textContent: 'a' }), el('b', { textContent: 'Faixa' }))
  // ícones próprios dos atalhos (traço grosso, combinam com o resto)
  const ICONE_ATALHO = {
    dias: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M12 14h2M16 14h0M8 17h2"/></svg>',
    combo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c-4 0-7-2.7-7-6.6 0-3.1 2-5.2 3.6-7 .4 2 1.4 3 2.5 3.4C11 7.7 12.6 5 15.3 3c-.4 2.7.7 4.6 2 6.3 1.1 1.4 1.7 3 1.7 5 0 3.9-3 6.7-7 6.7z"/><path d="M12 21c-1.7 0-3-1.2-3-3 0-1.6 1.2-2.6 2-3.6.3 1 .9 1.5 1.6 1.7.4-1.2 1-2 1.8-2.6.2 1.5 1.6 2.4 1.6 4.4 0 1.8-1.4 3.1-4 3.1z"/></svg>',
    cats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.4 1.4 0 0 1 0 2l-7 7a1.4 1.4 0 0 1-2 0z"/><circle cx="8.3" cy="8.3" r="1.6"/></svg>',
  }
  function botao(ic, txt, fn, cls = '', title = '') { const b = el('button', { type: 'button', className: `fx-btn ${cls}`, title }, icon(ic), txt ? el('span', { textContent: txt }) : ''); b.addEventListener('click', e => { b.blur(); fn(e) }); return b }
  function iconeDe(tipo, vivo) {
    if (tipo === 'dica') return el('span', { className: 'fx-ic fx-ic--dica' }, icon('lightbulb'))
    const c = ICONE[tipo] || '1f3b6'
    return el('img', { className: 'fx-ic' + (tipo === 'baixo' ? ' fx-ic--baixo' : ''), src: `${BASE}icones/${c}.${vivo && ANIMADO.has(c) ? 'webp' : 'svg'}`, alt: '', draggable: false })
  }
  function render() {
    tela.classList.toggle('faixa--on', !!S)
    ctx.onAtivo?.(!!S)
    if (!S) { tela.querySelectorAll(':scope > :not(.fx-fundo)').forEach(n => n.remove()); return }
    const m = musica()
    if (!m && S.fase !== 'fim') { tela.replaceChildren(el('div', { className: 'fx-msg', textContent: 'Carregando…' })); return }
    const at = atualDe()
    const trocavel = ehHost() && ANTIGOS.includes(S.modo) // modos novos têm estado próprio: só se escolhem ao começar
    const topo = el('header', { className: 'fx-topo' }, marquee(),
      el('div', { className: 'fx-topo__info' },
        S.fase === 'fim' ? el('small', { textContent: 'Placar final' }) : el('small', {}, el('b', { textContent: `${S.i + 1}/${S.musicas.length}` }), ` · ${S.rotulo || nomeDia(at.d)}`),
        (() => { const b = el('button', { type: 'button', className: 'fx-modo', title: !ehHost() ? MODOS[S.modo].dica : trocavel ? 'Trocar o modo' : `${MODOS[S.modo].dica} (o modo só muda ao começar um jogo)`, disabled: !trocavel }, icon(MODOS[S.modo].ic), MODOS[S.modo].nome, trocavel ? icon('chevron-down') : ''); b.addEventListener('click', e => escolheModo(S.modo, mudarModo, e.currentTarget, ANTIGOS)); return b })()),
      ehHost() ? '' : el('small', { className: 'fx-host', textContent: `host: ${S.hostNome}` }),
      // qualquer um na call pode encerrar (se o host sair, o jogo não fica preso na tela de todo mundo)
      botao('x', '', encerrar, 'fx-btn--x', ehHost() ? 'Encerrar o jogo' : 'Encerrar o jogo para todos'))
    const corpo = S.fase === 'fim' ? placarFinal() : S.fase === 'revela' ? revela(m) : rodada(m)
    tela.replaceChildren(topo, el('div', { className: 'fx-corpo' }, corpo, lado()))
    ctx.hydrate(tela)
    atualizaPlayer()
    if (S.fase === 'tocando' && tela.contains(chute.input) && !ctx.digitando()) chute.input.focus({ preventScroll: true })
  }
  const playerEl = () => el('div', { className: 'fx-player' + (sincronizado() ? ' sync' : '') },
      botao('rotate-ccw', '', () => { tocar(0); avisaTl('volta') }, 'fx-player__mini', 'Do começo'),
      botao('chevron-left', '5s', () => { pula(-5); avisaTl('pula') }, 'fx-player__mini fx-player__5', 'Voltar 5 s'),
      (() => { const b = el('button', { type: 'button', className: 'fx-player__play', title: 'Tocar / pausar' }, icon('play')); b.addEventListener('click', () => { b.blur(); alternaPlay() }); return b })(),
      botao('chevron-right', '5s', () => { pula(5); avisaTl('pula') }, 'fx-player__mini fx-player__5', 'Avançar 5 s'),
      (() => {
        const tr = el('div', { className: 'fx-player__trilho' }, el('div', { className: 'fx-player__cab' }))
        tr.addEventListener('pointerdown', e => { if (!P?.bufs) return; const r = tr.getBoundingClientRect(); tocar(Math.max(0, Math.min(.999, (e.clientX - r.left) / r.width)) * P.dur); avisaTl('pula') })
        return tr
      })(),
      el('span', { className: 'fx-player__t', textContent: '0:00 / 0:30' }),
      (() => {
        const on = sincronizado()
        const b = el('button', { type: 'button', className: 'fx-player__sync' + (on ? ' on' : ''), title: on ? 'A música está igual para todo mundo: play, pause e pulos valem para todos. Clique para ouvir no seu ritmo.' : 'Você ouve no seu ritmo. Clique para ficar junto com os outros.' }, icon(on ? 'link-2' : 'unlink-2'), el('span', { textContent: on ? 'Junto' : 'Só eu' }))
        b.addEventListener('click', () => { b.blur(); trocaSync() })
        return b
      })())
  function rodada(m) {
    if (S.modo === 'leilao') return rodadaLeilao(m)
    if (S.modo === 'ano') return rodadaAno(m)
    const corrida = S.modo === 'corrida'
    const ps = passos(), j = euJog() || novoJog('')
    if (Date.now() >= travaAte) chute.input.placeholder = S.origem ? 'De onde é? (desenho, filme, série, jogo…)' : 'Qual é a música? (ou o artista)'
    const passo = j.ok || j.fora ? ps.length : passoDe(j)
    const porPasso = {}
    const tents = coop() ? Object.entries(S.jog).flatMap(([k, x]) => x.tent.map(t => ({ ...t, quem: k === me.key ? '' : x.nome }))).sort((a, b) => (a.ts || 0) - (b.ts || 0)) : j.tent
    for (const t of tents) (porPasso[t.c] ||= []).push(t)
    const linhas = ps.map((p, i) => {
      const k = i + 1, aberta = k <= passo, atual = k === passo && !j.ok && !j.fora
      const res = (porPasso[k] || []).map(t => el('span', { className: `fx-tent fx-tent--${t.tipo}`, title: t.quem ? `${t.quem}: ${t.txt || 'pulou'}` : t.txt || '' },
        t.quem ? el('b', { textContent: t.tipo === 'pulou' ? `${t.quem} pulou` : `${t.quem}: ` }) : '',
        t.tipo === 'pulou' ? (t.quem ? '' : 'pulou') : t.tipo === 'artista' ? `${S.origem ? 'música' : 'artista'} ✓ ${t.txt}` : t.tipo === 'certo' ? `✓ ${t.txt}` : `✗ ${t.txt}`))
      let nome = aberta ? p.nome : ''
      if (p.dica && aberta) nome = S.origem ? `de: ${iniciais(m.obra || m.a)}` : [m.ano ? `Lançada em ${m.ano}` : '', `artista: ${iniciais(m.a)}`].filter(Boolean).join(' · ')
      return el('li', { className: 'fx-linha' + (aberta ? ' on' : '') + (atual ? ' atual' : '') + (j.ok === k ? ' certo' : '') + (p.dica ? ' fx-linha--dica' : '') },
        el('span', { className: 'fx-linha__n', textContent: k }),
        aberta ? iconeDe(p.tipo, atual) : el('span', { className: 'fx-ic fx-ic--fechado' }, icon(p.dica ? 'lightbulb' : 'lock')),
        el('b', { className: 'fx-linha__nome', textContent: nome || (p.dica ? 'Dica' : '') }),
        el('span', { className: 'fx-linha__res' + (coop() ? ' fx-linha__res--coop' : '') }, ...res),
        el('span', { className: 'fx-linha__pts' + (atual ? ' atual' : ''), textContent: corrida ? '' : `${valor(k)}` }))
    })
    const filme = el('ol', { className: 'fx-filme' }, ...linhas)
    const player = playerEl()
    let topo
    if (j.ok) topo = el('div', { className: 'fx-status fx-status--ok' }, icon('check'), el('span', { textContent: corrida ? `Acertou em ${S.ordem.indexOf(me.key) + 1}º lugar! +${j.pts}` : `Acertou com ${j.ok} dica${j.ok > 1 ? 's' : ''}! +${j.pts}` }))
    else if (j.fora) topo = el('div', { className: 'fx-status', textContent: j.art ? `Acabaram as dicas — ficou com ${S.origem ? 'a música' : 'o artista'} (+${j.pts}).` : 'Acabaram as dicas. Espere a revelação.' })
    else {
      const ultimo = passo >= ps.length
      topo = el('div', { className: 'fx-chute' },
        el('div', { className: 'fx-vale', title: corrida ? 'Pontos se você acertar agora. Depende de quantos já acertaram.' : 'Pontos se acertar a música agora. Cada dica a mais tira 100.' }, el('small', { textContent: 'vale' }), el('b', { textContent: corrida ? ptsOrdem(S.ordem.length) : valor(passo) }), el('small', { textContent: j.art ? `já tem ${j.pts}` : 'pts' })),
        chute.form,
        corrida ? botao('flag', 'Desistir', () => chuta({ tipo: 'pular' }), 'fx-btn--pular', 'Sai desta música')
          : botao(ultimo ? 'flag' : 'skip-forward', ultimo ? 'Desistir' : 'Pular', () => chuta({ tipo: 'pular' }), 'fx-btn--pular', ultimo ? '' : `Abre a próxima dica (passa a valer ${valor(passo + 1)})`))
    }
    return el('section', { className: 'fx-jogo' }, topo, corrida ? painelCorrida() : '', filme, player)
  }

  /* ---------- corrida: relógio e ordem de chegada ---------- */
  function painelCorrida() {
    const ult = S.camada >= total()
    const fila = S.ordem.map((k, i) => el('li', { className: 'fx-chega' + (k === me.key ? ' eu' : '') }, el('i', { textContent: `${i + 1}º` }), ctx.pfp(k, 22), el('b', { textContent: k === me.key ? 'Você' : S.jog[k]?.nome }), el('em', { textContent: `+${ptsOrdem(i)}` })))
    return el('div', { className: 'fx-corrida' }, relogio(ult ? 'Revela em' : 'Próxima camada em'),
      el('ol', { className: 'fx-chegada' }, ...(fila.length ? fila : [el('li', { className: 'fx-chega vazio', textContent: `Ninguém acertou ainda — o 1º leva ${ptsOrdem(0)}` })])))
  }

  /* ---------- camadas já abertas, sem pontos (leilão e ano) ---------- */
  function filmeSimples(m, passo, semDica) {
    const ps = passos().filter(p => !(semDica && p.dica))
    return el('ol', { className: 'fx-filme' }, ...ps.map((p, i) => {
      const k = i + 1, aberta = k <= passo, atual = aberta && k === passo
      let nome = aberta ? p.nome : ''
      if (p.dica && aberta) nome = S.origem ? `de: ${iniciais(m.obra || m.a)}` : `artista: ${iniciais(m.a)}`
      return el('li', { className: 'fx-linha' + (aberta ? ' on' : '') + (atual ? ' atual' : '') + (p.dica ? ' fx-linha--dica' : '') },
        el('span', { className: 'fx-linha__n', textContent: k }),
        aberta ? iconeDe(p.tipo, atual) : el('span', { className: 'fx-ic fx-ic--fechado' }, icon(p.dica ? 'lightbulb' : 'lock')),
        el('b', { className: 'fx-linha__nome', textContent: nome || (p.dica ? 'Dica' : '') }), el('span', { className: 'fx-linha__res' }), el('span', { className: 'fx-linha__pts' }))
    }))
  }

  /* ---------- leilão: sem relógio; plaquinhas, martelo e o lote (os instrumentos) que está valendo ---------- */
  const vistos = new Set() // animações que só tocam uma vez (a tela é refeita a cada mudança)
  const novo = k => vistos.has(k) ? false : (vistos.add(k), true)
  const instrumentos = n => el('span', { className: 'fx-instr' }, ...passos().filter(p => !p.dica).slice(0, n).map((p, i) => { const x = iconeDe(p.tipo, false); x.style.setProperty('--i', i); x.title = p.nome; return x }))
  const pontinhos = () => el('span', { className: 'fx-pontinhos' }, el('i'), el('i'), el('i'))
  function rodadaLeilao(m) {
    const L = S.lei, ouvindo = L.fase === 'ouve', euOuvinte = L.ouvinte === me.key
    const Nome = k => k === me.key ? 'Você' : S.jog[k]?.nome || '?'
    const nomeDe = k => k === me.key ? 'você' : S.jog[k]?.nome || '?'
    const inst = n => `${n} instrumento${n > 1 ? 's' : ''}`
    const base = `${S.id}:${S.i}`
    const ult = {}; L.hist.forEach((h, i) => { ult[h.k] = { n: h.n, i } })
    // a mesa: cada um com a plaquinha do último lance (sobe quando é novo) ou o carimbo de "passou"
    const mesa = el('ul', { className: 'fx-mesa' }, ...L.ordem.map(k => {
      const passou = !L.ativos.includes(k), vez = !ouvindo && L.vez === k, tem = L.lance?.key === k, ouv = L.ouvinte === k, u = ult[k]
      const st = ouv ? (euOuvinte ? 'sua vez de chutar' : 'vai chutar') : tem ? 'menor lance' : passou ? 'fora deste leilão' : vez ? 'pensando' : u ? `disse ${u.n}` : 'esperando a vez'
      const placa = u?.n ? el('span', { className: 'fx-placa' + (tem ? ' top' : '') + (novo(`${base}:p${u.i}`) ? ' entra' : '') }, el('b', { textContent: u.n }))
        : passou ? el('span', { className: 'fx-carimbo' + (novo(`${base}:x:${k}`) ? ' entra' : ''), textContent: 'passou' }) : ''
      return el('li', { className: 'fx-mesa__it' + (vez ? ' vez' : '') + (tem ? ' tem' : '') + (passou && !tem ? ' passou' : '') + (ouv ? ' ouv' : '') + (k === me.key ? ' eu' : '') },
        ctx.pfp(k, 40), el('span', { className: 'fx-mesa__txt' }, el('b', { textContent: Nome(k) }), el('small', {}, st, vez || ouv ? pontinhos() : '')), placa)
    }))
    // o histórico do leilão, em ordem
    const hist = L.hist.length ? el('ol', { className: 'fx-lances' }, ...L.hist.map((h, i) => el('li', { className: (h.n ? '' : 'passou') + (novo(`${base}:h${i}`) ? ' entra' : '') }, ctx.pfp(h.k, 18), el('span', { textContent: h.n ? `${h.n}` : 'passou' })))) : ''
    const vendido = ouvindo && novo(`${base}:vendido`)
    const destaque = el('div', { className: 'fx-lei fx-lei--leilao' + (ouvindo ? ' ouve' : '') },
      el('span', { className: 'fx-martelo' + (vendido ? ' bate' : '') }, icon('gavel')),
      el('div', { className: 'fx-lei__txt' },
        el('small', { className: 'fx-kicker', textContent: ouvindo ? 'Vendido!' : 'Leilão' }),
        el('b', { textContent: ouvindo ? (euOuvinte ? `Sua vez: acerte com ${inst(L.n)}` : `${Nome(L.ouvinte)} tenta com ${inst(L.n)}`) : L.lance ? `Menor lance: ${L.lance.n} (${nomeDe(L.lance.key)})` : 'Com quantos instrumentos você acerta?' }),
        el('small', { textContent: ouvindo ? `Acertando: +${6 - L.n}. Errando: todo mundo ganha 1.` : 'Cada lance tem que ser menor que o anterior. Quem arrisca menos tenta, com um palpite só. Sem pressa: ninguém tem relógio.' })),
      L.lance ? el('div', { className: 'fx-lote' }, el('small', { textContent: ouvindo ? 'no lote' : 'lote atual' }), instrumentos(L.lance.n)) : '',
      vendido ? el('span', { className: 'fx-vendido', textContent: 'Vendido!' }) : '')
    if (!ouvindo) {
      let ctl
      if (L.vez === me.key) {
        const max = L.lance ? L.lance.n - 1 : maxLance()
        const podePassar = !(L.ativos.length === 1 && !L.lance)
        ctl = el('div', { className: 'fx-lance' + (novo(`${base}:vez${L.hist.length}`) ? ' entra' : '') }, el('small', { className: 'fx-kicker', textContent: 'É a sua vez' }),
          el('div', { className: 'fx-lance__bt' }, ...Array.from({ length: max }, (_, i) => max - i).map((n, i) =>
            el('button', { type: 'button', className: 'fx-lance__btn', style: `--d:${i * 60}ms`, title: `Eu acerto com ${inst(n)}`, onclick: () => envia({ lance: n }) },
              el('b', { textContent: n }), el('span', { className: 'fx-lance__info' }, el('small', { textContent: `Acerto com ${inst(n)}` }), instrumentos(n)), el('em', { textContent: `+${6 - n}` })))),
          podePassar ? botao('hand', L.lance ? 'Passo' : 'Vai você', () => envia({ passa: true }), 'fx-btn--pular', 'Sai do leilão desta música') : el('small', { className: 'fx-nota', textContent: 'Todos passaram: você precisa dar um lance.' }))
      } else ctl = el('div', { className: 'fx-status fx-status--vez' }, ctx.pfp(L.vez, 24), el('span', { textContent: `Vez de ${nomeDe(L.vez)} dar o lance` }), pontinhos(),
        ehHost() ? botao('skip-forward', 'Pular a vez', () => leiTempoVez(), 'fx-lei__pula', `Passa a vez de ${nomeDe(L.vez)}`) : '')
      return el('section', { className: 'fx-jogo fx-jogo--lei' }, destaque, mesa, hist, ctl)
    }
    const ps = passos()
    const topo = euOuvinte ? el('div', { className: 'fx-chute' },
      el('div', { className: 'fx-vale' }, el('small', { textContent: 'vale' }), el('b', { textContent: 6 - L.n }), el('small', { textContent: 'pts' })), chute.form,
      botao('flag', 'Desistir', () => chuta({ tipo: 'pular' }), 'fx-btn--pular', 'Conta como erro'))
      : el('div', { className: 'fx-status fx-status--vez' }, ctx.pfp(L.ouvinte, 24), el('span', { textContent: `${Nome(L.ouvinte)} está ouvindo ${L.n} camada${L.n > 1 ? 's' : ''} e vai chutar` }), pontinhos(),
        ehHost() ? botao('skip-forward', 'Encerrar', () => leiFim('tempo'), 'fx-lei__pula', `Encerra sem o palpite de ${nomeDe(L.ouvinte)}`) : '')
    return el('section', { className: 'fx-jogo fx-jogo--lei' }, destaque, mesa, topo, filmeSimples(m, Math.min(L.n, ps.length), true), playerEl())
  }

  /* ---------- que ano é? ---------- */
  const anoCtl = (() => {
    let val = 2000, id = ''
    const num = el('input', { type: 'number', min: ANO_MIN, max: ANO_ATUAL, value: val, className: 'fx-ano__num', inputMode: 'numeric' })
    const rng = el('input', { type: 'range', min: ANO_MIN, max: ANO_ATUAL, value: val, className: 'fx-ano__rng' })
    const set = v => { val = Math.max(ANO_MIN, Math.min(ANO_ATUAL, Math.round(+v) || val)); num.value = val; rng.value = val }
    rng.addEventListener('input', () => set(rng.value))
    num.addEventListener('change', () => set(num.value))
    num.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); set(num.value); envia({ ano: val }) } })
    const trava = botao('check', 'Travar chute', () => { set(num.value); envia({ ano: val }) }, 'fx-btn--ok')
    const box = el('div', { className: 'fx-ano' },
      el('div', { className: 'fx-ano__linha' }, botao('chevron-left', '', () => set(val - 1), 'fx-btn--x fx-ano__pm', 'Um ano antes'), num, botao('chevron-right', '', () => set(val + 1), 'fx-btn--x fx-ano__pm', 'Um ano depois'), trava),
      rng, el('div', { className: 'fx-ano__ref' }, el('span', { textContent: ANO_MIN }), el('span', { textContent: Math.round((ANO_MIN + ANO_ATUAL) / 2) }), el('span', { textContent: ANO_ATUAL })))
    return { box, num, nova(novoId) { if (id !== novoId) { id = novoId; set(2000) } } }
  })()
  function rodadaAno(m) {
    anoCtl.nova(S.id + ':' + S.i)
    const j = euJog(), trav = Object.values(S.jog).filter(x => x.trav).length, n = Object.keys(S.jog).length
    const corpo = j?.trav ? el('div', { className: 'fx-status fx-status--ok' }, icon('check'), el('span', { textContent: `Chute travado: ${j.ano}. Esperando os outros (${trav}/${n})` }))
      : !j ? el('div', { className: 'fx-status', textContent: 'Você entra na próxima música.' }) : anoCtl.box
    const lista = el('ul', { className: 'fx-prontos' }, ...Object.entries(S.jog).map(([k, x]) => el('li', { className: x.trav ? 'ok' : '' }, ctx.pfp(k, 22), el('span', { textContent: x.trav ? 'travou' : 'pensando…' }))))
    return el('section', { className: 'fx-jogo fx-jogo--ano' },
      el('div', { className: 'fx-lei' }, el('small', { className: 'fx-kicker', textContent: 'Que ano é?' }), el('b', { textContent: 'Em que ano esta música foi lançada?' }), el('small', { textContent: 'Todas as camadas tocam juntas. Exato 5 · ±1 ano 4 · ±2 anos 3 · ±5 anos 2 · ±10 anos 1.' })),
      relogio('Tempo'), corpo, lista, playerEl())
  }

  /* ---------- linha do tempo da revelação (ano) ---------- */
  function linhaDoTempo() {
    const real = S.anoReal, chutes = Object.entries(S.jog).filter(([, j]) => j.trav).map(([k, j]) => ({ k, j, a: j.ano }))
    const todos = [real, ...chutes.map(c => c.a)], lo = Math.floor((Math.min(...todos) - 2) / 5) * 5, hi = Math.ceil((Math.max(...todos) + 2) / 5) * 5
    const pos = a => ((a - lo) / Math.max(1, hi - lo)) * 100
    const marcas = []; for (let a = lo; a <= hi; a += (hi - lo > 40 ? 10 : 5)) marcas.push(el('span', { className: 'fx-tl__marca', style: `left:${pos(a)}%`, textContent: a }))
    const ordenados = chutes.slice().sort((x, y) => x.a - y.a)
    const faixas = []; // empilha chutes próximos em alturas diferentes
    const pinos = ordenados.map(c => { let r = 0; while (faixas[r] != null && Math.abs(pos(c.a) - faixas[r]) < 11) r++; faixas[r] = pos(c.a); return { ...c, r } })
    const alto = Math.max(1, ...pinos.map(p => p.r + 1))
    return el('div', { className: 'fx-tl', style: `--niveis:${alto}` },
      el('div', { className: 'fx-tl__eixo' }, ...marcas,
        el('div', { className: 'fx-tl__real', style: `left:${pos(real)}%` }, el('b', { textContent: real }))),
      ...pinos.map(p => el('div', { className: 'fx-tl__pino' + (p.a === real ? ' exato' : ''), style: `left:${pos(p.a)}%; --nivel:${p.r}` },
        ctx.pfp(p.k, 28), el('b', { textContent: p.k === me.key ? 'Você' : p.j.nome }), el('small', { textContent: `${p.a}${p.a === real ? '' : ` (${p.a > real ? '+' : '−'}${Math.abs(p.a - real)})`} · +${p.j.pts}` }))))
  }
  function revela(m) {
    const quem = Object.entries(S.jog).sort((a, b) => b[1].pts - a[1].pts)
    const L = S.lei
    const txtDe = (k, j) => {
      if (S.modo === 'leilao') {
        if (!L?.ouvinte) return 'ninguém arriscou'
        if (L.ouvinte === k) return L.res === 'ok' ? `acertou com ${L.n} instrumento${L.n > 1 ? 's' : ''}` : L.res === 'art' ? `só o artista (lance ${L.n})` : L.res === 'tempo' ? 'não chutou' : `errou${L.chute ? `: ${L.chute}` : ''}`
        return L.res === 'ok' ? 'não levou' : L.ordem.includes(k) ? 'ponto pelo erro' : 'assistiu'
      }
      if (S.modo === 'ano') return j.trav ? `chutou ${j.ano}` : 'não chutou'
      if (S.modo === 'corrida') return j.ok ? `${S.ordem.indexOf(k) + 1}º a acertar` : j.art ? 'só o artista' : 'não acertou'
      return j.ok ? `${S.origem ? 'acertou' : 'música'} com ${j.ok} dica${j.ok > 1 ? 's' : ''}` : j.art ? (S.origem ? 'só a música' : 'só o artista') : 'não acertou'
    }
    return el('section', { className: 'fx-revela' },
      el('div', { className: 'fx-ingresso' },
        m.capa ? el('img', { className: 'fx-ingresso__capa', src: pasta() + m.capa, alt: '' }) : el('div', { className: 'fx-ingresso__capa' }, icon('music')),
        el('div', { className: 'fx-ingresso__main' },
          el('small', { className: 'fx-kicker', textContent: S.acertou ? `${S.acertou.key === me.key ? 'Você' : S.acertou.nome} acertou para todo mundo · era` : 'Era' }), el('b', { className: 'fx-ingresso__t', textContent: S.origem && m.obra ? m.obra : m.t }),
          el('span', { className: 'fx-ingresso__a', textContent: (S.origem && m.obra ? [m.t, m.a !== m.obra ? m.a : '', m.ano] : [m.a, m.obra || m.album, m.ano]).filter(Boolean).join(' · ') }),
          el('ul', { className: 'fx-ingresso__quem' }, ...quem.map(([k, j]) => el('li', {}, ctx.pfp(k, 20), el('b', { textContent: j.nome }),
            el('span', { textContent: txtDe(k, j) }), el('em', { textContent: j.pts ? `+${j.pts}` : '' })))),
          ehHost() ? botao('skip-forward', S.i + 1 >= S.musicas.length ? 'Ver o placar' : 'Próxima música', proxima, 'fx-btn--ok') : el('small', { className: 'fx-esperando', textContent: `Esperando ${S.hostNome} seguir…` })),
        el('div', { className: 'fx-ingresso__canhoto' }, el('span', { textContent: `${S.i + 1}/${S.musicas.length}` }))),
      S.modo === 'ano' && S.anoReal ? linhaDoTempo() : '')
  }
  function placarFinal() {
    const c = coop()
    const rank = Object.entries(S.jog).map(([k, j]) => [k, j.nome, c ? (S.contrib?.[k] || 0) : S.placar[k] || 0]).sort((a, b) => b[2] - a[2])
    return el('section', { className: 'fx-final' },
      el('b', { className: 'fx-final__t', textContent: c ? 'Placar da equipe' : 'Placar final' }),
      c ? el('div', { className: 'fx-equipe fx-equipe--final' }, el('b', { textContent: pontosEquipe().toLocaleString('pt-BR') }), el('small', { textContent: `pontos juntos · ${S.musicas.length} música${S.musicas.length > 1 ? 's' : ''}` })) : '',
      c ? el('small', { className: 'fx-kicker', textContent: 'Quem mais acertou para a equipe' }) : '',
      el('ol', { className: 'fx-podio' }, ...rank.map(([k, nome, p], i) => el('li', { className: i === 0 ? 'top' : '' }, el('span', { className: 'fx-podio__pos', textContent: `${i + 1}º` }), ctx.pfp(k, 32), el('b', { textContent: nome }), el('em', { textContent: c ? (p ? `★ ${p}` : '—') : `${p}` })))),
      el('div', { className: 'fx-final__ctl' }, ehHost() ? botao('rotate-ccw', 'Jogar mais', () => abrirLobby()) : '', botao('x', 'Fechar', encerrar)))
  }
  function lado() {
    const cegas = S.modo === 'cegas' && S.fase === 'tocando'
    const rank = Object.entries(S.jog).sort((a, b) => (S.placar[b[0]] || 0) - (S.placar[a[0]] || 0))
    const equipe = coop() ? el('div', { className: 'fx-equipe', title: 'No cooperativo todo mundo tem o mesmo total: um acerto vale para a equipe inteira' },
      el('small', { textContent: 'Pontos da equipe' }), el('b', { textContent: pontosEquipe().toLocaleString('pt-BR') }), el('small', { textContent: 'o mesmo para todo mundo' })) : ''
    return el('aside', { className: 'fx-lado' + (coop() ? ' fx-lado--coop' : '') }, equipe,
      el('small', { className: 'fx-kicker', textContent: coop() ? 'Equipe' : 'Jogadores' }),
      el('ul', { className: 'fx-jogs' }, ...rank.map(([k, j]) => {
        const esconde = cegas && k !== me.key && !espia()
        const ult = espia() && k !== me.key ? j.tent?.[j.tent.length - 1] : null
        const L = S.lei
        const st = MODOS[S.modo].novo && S.fase !== 'tocando' ? '' : S.modo === 'leilao' && L ? (L.ouvinte === k ? `tenta com ${L.n}` : L.lance?.key === k ? `lance ${L.lance.n}` : !L.ordem.includes(k) ? 'entra na próxima' : !L.ativos.includes(k) ? 'passou' : L.vez === k ? 'dando o lance' : '')
          : S.modo === 'ano' ? (j.trav ? 'travou' : 'pensando…')
          : S.modo === 'corrida' && S.ordem.includes(k) ? `✓ ${S.ordem.indexOf(k) + 1}º`
          : esconde ? (j.ok || j.fora ? 'pronto' : 'pensando…') : j.ok ? (S.origem ? '✓ acertou' : '✓ música') : j.art ? (S.origem ? '½ música' : '½ artista') : j.fora ? 'sem dicas' : ''
        const bolas = !esconde && S.fase === 'tocando' && individual() ? Array.from({ length: total() }, (_, i) => el('i', { className: i < j.n ? (j.ok === i + 1 ? 'ok' : 'on') : '' })) : []
        return el('li', { className: !esconde && j.ok ? 'ok' : '' }, ctx.pfp(k, 26),
          el('span', { className: 'fx-jogs__nome' }, el('b', { textContent: j.nome }), el('span', { className: 'fx-jogs__passos' }, ...bolas, st ? el('small', { textContent: st }) : ''),
            ult ? el('small', { className: 'fx-jogs__chute fx-jogs__chute--' + ult.tipo, title: 'Último chute', textContent: ult.tipo === 'pulou' ? 'pulou ⏭' : `${ult.tipo === 'certo' ? '✓' : ult.tipo === 'artista' ? '½' : '✗'} ${ult.txt}` }) : ''),
          coop() ? el('em', { className: 'fx-jogs__acertos', title: 'Músicas que acertou para a equipe', textContent: S.contrib?.[k] ? `★ ${S.contrib[k]}` : '' }) : el('em', { textContent: esconde ? '' : S.placar[k] || 0 }))
      })),
      ehHost() && S.fase === 'tocando' ? botao('eye', 'Revelar', revelar, 'fx-btn--sec') : '')
  }

  /* ---------- telinha de modo (lobby e durante o jogo) ---------- */
  function escolheModo(atual, fn, perto, permitidos) {
    document.querySelector('.fx-modopop')?.remove()
    const pop = el('div', { className: 'fx-modopop' }, el('small', { className: 'fx-kicker', textContent: 'Modo de jogo' }),
      ...Object.entries(MODOS).filter(([k]) => !permitidos || permitidos.includes(k)).map(([k, v]) => {
        const b = el('button', { type: 'button', className: 'fx-modocard' + (k === atual ? ' on' : '') }, el('span', { className: 'fx-modocard__ic' }, icon(v.ic)), el('span', {}, el('b', { textContent: v.nome }), el('small', { textContent: v.dica })), k === atual ? icon('check') : '')
        b.addEventListener('click', () => { pop.remove(); fn(k) })
        return b
      }))
    ctx.hydrate(pop)
    document.body.append(pop)
    const r = perto.getBoundingClientRect()
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8)) + 'px'
    pop.style.top = Math.min(r.bottom + 8, innerHeight - pop.offsetHeight - 8) + 'px'
    setTimeout(() => document.addEventListener('pointerdown', function fora(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown', fora) } }), 0)
  }

  /* ---------- tela inicial: jogar hoje em destaque; outros dias, combo e categorias ---------- */
  let modoEscolhido = 'coletivo'
  // quem abre o menu mostra para a sala onde está navegando; os outros veem o mesmo menu (só olhando)
  let menuAtual = null // o que eu estou mostrando (sou eu escolhendo)
  let lobby = null // { ver: key de quem escolhe (se só estou olhando), nav, fechar }
  const difundeMenu = m => { menuAtual = m; ctx.send({ menu: m }) }
  function fechaVer() { if (lobby?.ver) lobby.fechar(true) }
  let menuPendente = null
  async function verMenu(m, deKey) {
    if (!deKey || deKey === me.key) return
    if (!m) { if (lobby?.ver === deKey) lobby.fechar(true); return }
    if (lobby && !lobby.ver) return // estou no meu próprio menu
    if (S && S.fase !== 'fim') return // tem partida rolando: o menu de outro não cobre o jogo
    menuPendente = m
    if (lobby?.ver === deKey) return lobby.nav?.(m)
    if (lobby?.abrindo) return
    await abrirLobby({ ver: deKey, nome: ctx.nomeDe(deKey) })
  }
  // menu inicial dentro da tela do cinema: aparece na hora e completa quando os dados chegam
  async function abrirLobby(olhar) {
    tela.querySelector('.fx-fundo')?.remove()
    const ver = olhar?.ver || ''
    const box = el('div', { className: 'fx-lobby' + (ver ? ' fx-lobby--ver' : '') }, el('div', { className: 'fx-carregando' }, el('i'), el('i'), el('i')))
    const fundo = el('div', { className: 'fx-fundo' }, box)
    const eu = { ver, abrindo: true, nav: null, fechar: null }
    lobby = eu
    const fechar = calado => {
      fundo.remove(); document.querySelector('.fx-modopop')?.remove()
      if (lobby === eu) { lobby = null; tela.classList.remove('faixa--lobby') }
      if (!ver && !calado) difundeMenu(null)
      if (!ver) menuAtual = null
    }
    eu.fechar = fechar
    fundo.addEventListener('click', e => { if (e.target === fundo) fechar() })
    tela.append(fundo); tela.classList.add('faixa--lobby')
    if (!ver) difundeMenu({ tela: 'inicio', modo: modoEscolhido })
    await carrega(true)
    const hoje = hojeStr()
    const datas = Object.keys(dias || {}).filter(d => d <= hoje).sort().reverse()
    const res = datas.length ? await ctx.verDias(datas) : {}
    const meu = d => res[d]?.[me.key]?.musicas || {}
    // em grupo, "nova" é a música que ninguém da call ouviu ainda (não só você)
    const call = ctx.presentes(), grupo = call.length > 1
    const feitas = new Set(datas.flatMap(d => Object.entries(res[d] || {}).filter(([k]) => call.includes(k)).flatMap(([, v]) => Object.keys(v.musicas || {}).map(n => `${d}#${n}`))))
    const ninguem = grupo ? 'ninguém da call' : 'você não'
    const todas = datas.flatMap(d => (dias[d] || []).map(m => ({ ...m, d })))
    const tudo = datas.flatMap(d => Object.values(meu(d)))
    const st = { jogadas: tudo.length, ok: tudo.filter(x => x.r === 'ok').length, art: tudo.filter(x => x.r === 'art').length, fora: tudo.filter(x => x.r === 'fora').length, pts: tudo.reduce((s, x) => s + (x.pts || 0), 0) }
    const listaDias = (ds, pular) => ds.slice().sort().flatMap(d => (dias[d] || []).filter(m => !pular || !feitas.has(`${d}#${m.n}`)).map(m => ({ d, n: m.n })))
    eu.abrindo = false
    if (!fundo.isConnected) return
    const jogar = (lista, rotulo, origem) => { if (ver) return; fechar(true); menuAtual = null; comecar({ lista, rotulo, modo: modoEscolhido, origem }) }
    // quem está escolhendo manda a tela em que está; quem olha segue junto
    const conta = t => { if (!ver) difundeMenu({ tela: t, modo: modoEscolhido, sel: [...sel], mais: maisCats, qtd: qtdCat, mix: misturar, cs: [...catSel], comum: emComum, tri: comTrilhas }) }
    const faixaVer = () => ver ? el('div', { className: 'fx-lobby__ver' }, ctx.pfp(ver, 22), el('span', {}, el('b', { textContent: olhar.nome }), ' está escolhendo o jogo…'), botao('x', '', () => fechar(), 'fx-btn--x', 'Fechar (só para você)')) : ''
    const bolas = d => el('span', { className: 'fx-dia__bolas' }, ...(dias[d] || []).map(m => { const x = meu(d)[m.n]; return el('i', { className: x ? x.r : '', title: x ? (x.r === 'ok' ? `acertou (+${x.pts})` : x.r === 'art' ? `só o artista (+${x.pts})` : 'errou') : 'não jogou' }) }))
    const ptsDia = d => Object.values(meu(d)).reduce((s, x) => s + (x.pts || 0), 0)
    function topo(voltar, titulo) {
      const modoBtn = el('button', { type: 'button', className: 'fx-modopill', title: 'Trocar o modo' }, icon(MODOS[modoEscolhido].ic), el('span', { textContent: MODOS[modoEscolhido].nome }), icon('chevron-down'))
      modoBtn.addEventListener('click', e => { if (!ver) escolheModo(modoEscolhido, k => { modoEscolhido = k; voltar ? voltar() : inicio() }, e.currentTarget) })
      box.dataset.tela = voltar ? 'sub' : 'inicio' // a tela inicial usa o layout em grade da tela toda
      return el('div', { className: 'fx-lobby__topo' },
        voltar ? botao('chevron-left', titulo, inicio, 'fx-voltar') : marquee(),
        el('span', { className: 'fx-grow' }), modoBtn, ver ? '' : botao('x', '', () => fechar(), 'fx-btn--x'))
    }
    // tela principal
    function inicio() {
      const d = datas.includes(hoje) ? hoje : datas[0]
      const ms = dias[d] || [], feito = Object.keys(meu(d)).length
      const falta = listaDias([d], true)
      const acao = !ms.length ? null : falta.length === ms.length ? 'Jogar' : falta.length ? 'Continuar' : 'De novo' // o progresso já aparece embaixo do dia
      const disco = el('div', { className: 'fx-disco', 'aria-hidden': 'true' }, el('i'))
      const heroi = d ? el('div', { className: 'fx-hero' }, disco,
        el('div', { className: 'fx-hero__txt' }, el('small', { className: 'fx-kicker', textContent: d === hoje ? 'Faixa do dia' : 'Último dia pronto' }), el('b', { className: 'fx-hero__dia', textContent: nomeDia(d) }),
          bolas(d), el('span', { className: 'fx-hero__info', textContent: grupo ? (falta.length ? `${falta.length} de ${ms.length} que ninguém da call ouviu` : 'a call já ouviu todas · repetir') : feito ? `${ptsDia(d)} pts${feito < ms.length ? ` · faltam ${ms.length - feito}` : ' · completo'}` : `${ms.length} músicas novas` })),
        botao('play', acao, () => jogar(falta.length ? falta : listaDias([d], false), nomeDia(d)), 'fx-btn--ok fx-hero__btn fx-palheta')) : el('p', { className: 'fx-vazio', textContent: 'Nenhum dia pronto ainda.' })
      const atalho = (ic, nome, sub, fn) => { const i = el('span', { className: 'fx-atalho__ic' }); i.innerHTML = ICONE_ATALHO[ic]; const b = el('button', { type: 'button', className: `fx-atalho fx-atalho--${ic}` }, i, el('b', { textContent: nome }), el('small', { textContent: sub })); b.addEventListener('click', fn); return b }
      const pendentes = datas.filter(x => listaDias([x], true).length).length
      conta('inicio')
      box.replaceChildren(faixaVer(), topo(),
        heroi,
        el('div', { className: 'fx-atalhos' },
          atalho('dias', 'Outros dias', pendentes ? `${pendentes} com músicas novas${grupo ? ' para a call' : ''}` : `${datas.length} dias`, outrosDias),
          atalho('combo', 'Combo', 'vários dias seguidos', combo),
          atalho('cats', 'Categorias', 'De onde é?, aberturas, jogos, Disney…', categorias)),
        st.jogadas ? el('div', { className: 'fx-stats' },
          el('span', {}, el('b', { textContent: st.jogadas }), ' jogadas'), el('span', { className: 'ok' }, el('b', { textContent: st.ok }), ' acertos'),
          el('span', { className: 'art' }, el('b', { textContent: st.art }), ' só artista'), el('span', { className: 'fora' }, el('b', { textContent: st.fora }), ' derrotas'),
          el('span', { className: 'pts' }, el('b', { textContent: st.pts.toLocaleString('pt-BR') }), ' pts')) : '')
      ctx.hydrate(box)
    }
    function cartaoDia(d, on, fn) {
      const ms = dias[d] || [], feito = Object.keys(meu(d)).length
      const melhor = Object.values(res[d] || {}).map(v => [v.nome, Object.values(v.musicas || {}).reduce((s, x) => s + (x.pts || 0), 0)]).sort((a, b) => b[1] - a[1])[0]
      const b = el('button', { type: 'button', className: 'fx-dia' + (on ? ' on' : '') + (d === hoje ? ' hoje' : '') + (feito >= ms.length ? ' feito' : '') },
        el('b', { textContent: nomeDia(d, true) }), bolas(d),
        el('small', { textContent: feito ? `${ptsDia(d)} pts${feito < ms.length ? ` · ${feito}/${ms.length}` : ''}` : 'novo' }),
        melhor && melhor[1] ? el('em', { textContent: `🏆 ${melhor[0]}` }) : '')
      b.addEventListener('click', fn)
      return b
    }
    function outrosDias() {
      conta('outros')
      box.replaceChildren(faixaVer(), topo(outrosDias, 'Outros dias'),
        el('div', { className: 'fx-dias' }, ...datas.map(d => cartaoDia(d, false, () => { const f = listaDias([d], true); jogar(f.length ? f : listaDias([d], false), nomeDia(d)) }))))
      ctx.hydrate(box)
    }
    const sel = new Set()
    function combo() {
      const rapidos = [['Últimos 3 dias', datas.slice(0, 3)], ['Última semana', datas.slice(0, 7)], ['Tudo que falta', datas]]
      const qtd = listaDias([...sel], true).length
      const ir = botao('play', sel.size ? `Jogar combo · ${sel.size} dia${sel.size > 1 ? 's' : ''} · ${qtd} músicas` : 'Escolha os dias', () => jogar(listaDias([...sel], true), `combo de ${sel.size} dias`), 'fx-btn--ok fx-btn--grande')
      ir.disabled = !qtd
      conta('combo')
      box.replaceChildren(faixaVer(), topo(combo, 'Combo'),
        el('div', { className: 'fx-chips' }, ...rapidos.map(([nome, ds]) => { const b = el('button', { type: 'button', className: 'fx-chip', textContent: nome }); b.addEventListener('click', () => { sel.clear(); ds.forEach(x => sel.add(x)); combo() }); return b })),
        el('div', { className: 'fx-dias' }, ...datas.map(d => cartaoDia(d, sel.has(d), () => { sel.has(d) ? sel.delete(d) : sel.add(d); combo() }))),
        el('small', { className: 'fx-nota', textContent: grupo ? 'As músicas que alguém da call já ouviu ficam de fora.' : 'As músicas que você já respondeu ficam de fora.' }),
        ir)
      ctx.hydrate(box)
    }
    // categorias: as playlists da galera no topo, as principais em destaque, o resto em "mais categorias". Cada uma
    // sorteia N que você ainda não ouviu; quando acaba, deixa repetir. A barrinha mostra quantas já foram ouvidas.
    // "Misturar": marca várias e joga tudo junto (somando) ou só o que está em todas (em comum).
    const PRINCIPAIS = ['origem', 'aberturas', 'disney', 'desenhos', 'jogos', 'filmes', 'nacionais', 'gringas', 'hinos', 'rock', 'pop', 'recentes']
    const MINIMO_1 = ['disney', 'desenhos', 'jogos', 'filmes', 'origem', 'aberturas']
    let maisCats = false
    // quantas músicas cada categoria sorteia (fica lembrado neste navegador)
    const QTDS = [5, 10, 15, 20]
    let qtdCat = (() => { try { const n = +localStorage.getItem('faixa.qtdCat'); return QTDS.includes(n) ? n : 5 } catch { return 5 } })()
    let comTrilhas = false // playlists das pessoas: desenhos, aberturas e jogos só entram se marcar
    let misturar = false, emComum = false
    const catSel = new Set()
    const chave = m => `${m.d}#${m.n}`
    // primeiro as que ninguém ouviu; se não der a quantidade, completa com as já ouvidas. A mesma música em dois dias conta uma vez
    function sorteio(ms) {
      const mistura = a => a.slice().sort(() => Math.random() - .5)
      const novas = ms.filter(m => !feitas.has(chave(m)))
      const vistas = new Set(), out = []
      for (const m of [...mistura(novas), ...mistura(ms.filter(m => feitas.has(chave(m))))]) {
        const k = `${norm(m.t)}|${norm(m.a)}`
        if (vistas.has(k)) continue
        vistas.add(k); out.push({ d: m.d, n: m.n })
        if (out.length >= qtdCat) break
      }
      return out
    }
    function categorias() {
      const cats = CATEGORIAS.map(c => ({ ...c, ms: todas.filter(c.pessoa && !comTrilhas ? m => c.f(m) && !TRILHA(m) : c.f) }))
        .filter(c => c.ms.length >= (c.pessoa || MINIMO_1.includes(c.id) ? 1 : 3))
      for (const id of [...catSel]) if (!cats.some(c => c.id === id)) catSel.delete(id)
      const escolhidas = cats.filter(c => catSel.has(c.id))
      // a mistura: soma (tudo de qualquer uma) ou em comum (só o que está em todas as marcadas)
      const juntas = () => {
        if (!escolhidas.length) return []
        if (emComum) { const [p, ...r] = escolhidas; const sets = r.map(c => new Set(c.ms.map(chave))); return p.ms.filter(m => sets.every(s => s.has(chave(m)))) }
        const mp = new Map(); for (const c of escolhidas) for (const m of c.ms) mp.set(chave(m), m); return [...mp.values()]
      }
      const cartao = (c, mini) => {
        const novas = c.ms.filter(m => !feitas.has(chave(m))), ouvidas = c.ms.length - novas.length
        const fim = !novas.length, on = catSel.has(c.id)
        const b = el('button', { type: 'button', className: 'fx-cat' + (mini ? ' mini' : '') + (fim ? ' fim' : '') + (c.pessoa ? ' fx-cat--pessoa' : '') + (on ? ' sel' : ''),
          title: misturar ? (on ? 'Tirar da mistura' : 'Pôr na mistura') : fim ? (grupo ? 'A call já ouviu todas: o sorteio repete' : 'Você já ouviu todas: o sorteio repete') : `Sorteia ${Math.min(qtdCat, c.ms.length)} das ${novas.length} que ${ninguem} ouviu${novas.length < qtdCat && novas.length < c.ms.length ? ' (completa com repetidas)' : ''}` },
          c.pessoa ? el('span', { className: 'fx-cat__ic fx-cat__ic--pfp' }, ctx.pfp(c.pessoa, mini ? 22 : 30)) : el('span', { className: 'fx-cat__ic', textContent: c.ic }),
          el('b', { textContent: c.pessoa ? `Playlist ${c.da} ${c.nome}` : c.nome }),
          el('span', { className: 'fx-cat__barra' }, el('i', { style: `width:${Math.round(ouvidas / c.ms.length * 100)}%` })),
          el('small', { textContent: fim ? `todas as ${c.ms.length} ouvidas · repetir` : `${ouvidas} de ${c.ms.length} ouvidas · faltam ${novas.length}` }),
          misturar ? el('i', { className: 'fx-cat__marca' }, on ? icon('check') : '') : '')
        if (misturar) b.setAttribute('aria-pressed', String(on))
        b.addEventListener('click', () => {
          if (misturar) { on ? catSel.delete(c.id) : catSel.add(c.id); return categorias() }
          const base = sorteio(c.ms)
          jogar(base, `${c.nome} · ${base.length}`, c.origem)
        })
        return b
      }
      const pess = cats.filter(c => c.pessoa)
      const prin = cats.filter(c => !c.pessoa && PRINCIPAIS.includes(c.id)), resto = cats.filter(c => !c.pessoa && !PRINCIPAIS.includes(c.id))
      // com a mistura ligada, as marcadas que estão em "mais categorias" deixam a lista aberta
      const abreMais = maisCats || resto.some(c => catSel.has(c.id))
      const mais = el('button', { type: 'button', className: 'fx-maiscats' + (abreMais ? ' on' : '') }, `${abreMais ? 'Menos' : 'Mais'} categorias (${resto.length})`, icon('chevron-down'))
      mais.addEventListener('click', () => { maisCats = !abreMais; categorias() })
      const chip = (txt, on, fn, dica) => { const b = el('button', { type: 'button', className: 'fx-chip' + (on ? ' on' : ''), textContent: txt, title: dica || '' }); b.addEventListener('click', fn); return b }
      const qtds = el('div', { className: 'fx-chips fx-qtds' }, el('small', { className: 'fx-qtds__rot', textContent: 'Músicas por partida' }),
        ...QTDS.map(n => chip(n, n === qtdCat, () => { qtdCat = n; try { localStorage.setItem('faixa.qtdCat', n) } catch {} categorias() })),
        el('span', { className: 'fx-grow' }),
        chip('Misturar', misturar, () => { misturar = !misturar; if (!misturar) catSel.clear(); categorias() }, 'Marque duas ou mais categorias e jogue tudo junto'))
      // barra da mistura: o que está marcado, somar ou em comum, e jogar
      let barra = ''
      if (misturar) {
        const pool = juntas(), novasM = pool.filter(m => !feitas.has(chave(m))).length
        const jogarM = botao('play', 'Jogar', () => {
          const base = sorteio(pool)
          jogar(base, `${escolhidas.map(c => c.nome).join(emComum ? ' × ' : ' + ')} · ${base.length}`, escolhidas.every(c => c.origem))
        }, 'fx-btn--ok fx-mistura__ir')
        if (escolhidas.length < 2 || !pool.length) jogarM.disabled = true
        barra = el('div', { className: 'fx-mistura' },
          el('div', { className: 'fx-mistura__txt' },
            el('small', { className: 'fx-qtds__rot', textContent: 'Mistura' }),
            el('b', { textContent: escolhidas.length ? escolhidas.map(c => c.nome).join(emComum ? ' × ' : ' + ') : 'marque as categorias' }),
            el('span', { textContent: escolhidas.length < 2 ? 'escolha pelo menos duas' : pool.length ? `${pool.length} músicas · ${novasM} que ${ninguem} ouviu` : 'nenhuma música em comum' })),
          el('div', { className: 'fx-chips' },
            chip('Somar', !emComum, () => { emComum = false; categorias() }, 'Tudo o que está em qualquer uma das marcadas'),
            chip('Em comum', emComum, () => { emComum = true; categorias() }, 'Só as músicas que estão em todas as marcadas')),
          jogarM)
      }
      const trilhas = el('label', { className: 'fx-trilhas' }, el('input', { type: 'checkbox', checked: comTrilhas }), el('span', { textContent: 'Incluir desenhos, aberturas e jogos' }))
      trilhas.querySelector('input').addEventListener('change', e => { comTrilhas = e.target.checked; categorias() })
      conta('cats')
      box.replaceChildren(faixaVer(), topo(categorias, 'Categorias'),
        cats.length ? el('p', { className: 'fx-catnota' }, icon('music'), el('span', {}, 'Cada categoria sorteia ', el('b', { textContent: grupo ? `${qtdCat} músicas que ninguém da call ouviu` : `${qtdCat} músicas que você ainda não ouviu` }), '. Se faltar, completa com as já ouvidas.')) : '',
        cats.length ? qtds : '',
        barra,
        pess.length ? el('div', { className: 'fx-pessoas' },
          el('div', { className: 'fx-pessoas__topo' }, el('small', { className: 'fx-qtds__rot', textContent: 'Playlists da galera' }), trilhas),
          el('div', { className: 'fx-cats' }, ...pess.map(c => cartao(c)))) : '',
        el('div', { className: 'fx-cats' }, ...prin.map(c => cartao(c))),
        resto.length ? mais : '',
        abreMais ? el('div', { className: 'fx-cats fx-cats--mini' }, ...resto.map(c => cartao(c, true))) : '',
        cats.length ? '' : el('p', { className: 'fx-vazio', textContent: 'As categorias aparecem quando houver músicas suficientes.' }))
      ctx.hydrate(box)
    }
    eu.nav = m => {
      if (!m) return
      if (MODOS[m.modo]) modoEscolhido = m.modo
      sel.clear(); for (const d of m.sel || []) sel.add(d)
      maisCats = !!m.mais
      if (QTDS.includes(m.qtd)) qtdCat = m.qtd
      misturar = !!m.mix; emComum = !!m.comum; comTrilhas = !!m.tri
      catSel.clear(); for (const c of m.cs || []) catSel.add(c)
      ;({ outros: outrosDias, combo, cats: categorias }[m.tela] || inicio)()
    }
    if (ver && menuPendente) eu.nav(menuPendente); else inicio()
  }
  function iniciar() {
    if (S && !ehHost() && ctx.presentes().includes(S.host)) return toast(`Já tem um jogo rolando (host: ${S.hostNome})`)
    abrirLobby()
  }

  // só para o admin (painel Admin nas configurações): a música que está tocando agora
  const resposta = () => { const m = musica(); return S && m && S.fase !== 'fim' ? { t: m.t, a: m.a, ano: m.ano || '', i: S.i + 1, n: S.musicas.length } : null }
  window.__faixa = () => ({ S, resp: musica()?.t, artista: musica()?.a, obra: musica()?.obra, alt: musica()?.alt }) // diagnóstico/testes
  return {
    got, iniciar, interceptaChat: () => false, ativo: () => !!S, volumes, resposta,
    onPeerJoin: id => { if (ehHost()) { carimbaPrazo(); ctx.send({ estado: S }, id) } if (menuAtual) ctx.send({ menu: menuAtual }, id) },
    entrouAlguem: (key, nome) => {
      if (!ehHost() || S.fase === 'fim' || S.jog[key]) return
      S.jog[key] = novoJog(nome)
      if (S.modo === 'coletivo') S.placar[key] = pontosEquipe() // no cooperativo o placar é um só: quem chega entra com o total da equipe
      manda()
    },
  }
}
