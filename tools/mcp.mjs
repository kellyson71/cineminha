#!/usr/bin/env node
// MCP do Cineminha (stdio, sem dependências): deixa uma IA (Claude, Gemini…) cadastrar a sessão,
// anexar a legenda e gerar o convite. A IA pesquisa o filme na web; aqui só registramos.
//
// Claude Code:
//   claude mcp add cineminha -e CINEMINHA_URL=https://cineminha-boo.vercel.app -e CINEMINHA_ADMIN=<senha admin> \
//     -e CINEMINHA_SENHA=<senha da sala> -- node ~/projetos/cineminha/tools/mcp.mjs
// Gemini CLI (~/.gemini/settings.json):
//   "mcpServers": { "cineminha": { "command": "node", "args": ["/caminho/tools/mcp.mjs"], "env": { ... } } }
// Opcional: TMDB_KEY (chave da API do TMDB) para a ferramenta buscar_filme.
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import cfg from '../public/config.js'

const URL_BASE = (process.env.CINEMINHA_URL || 'http://localhost:8790').replace(/\/+$/, '')
const ADMIN = process.env.CINEMINHA_ADMIN || ''
const SENHA = process.env.CINEMINHA_SENHA || ''
const TMDB = process.env.TMDB_KEY || ''

async function api(path, method = 'GET', body) {
  const r = await fetch(`${URL_BASE}/api/${path}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${path}: ${j.error || r.status}`)
  return j
}
const pessoas = () => cfg.pessoas.map(p => `${p.id} (${p.nome})`).join(', ')

const TOOLS = [
  {
    name: 'listar_sessoes',
    description: 'Lista as sessões do diário do Cineminha (filme, data, quem foi, resumo).',
    inputSchema: { type: 'object', properties: {} },
    run: async () => (await api('sessoes')).list,
  },
  {
    name: 'pessoas',
    description: 'Lista as pessoas fixas do Cineminha (ids para usar em criar_sessao).',
    inputSchema: { type: 'object', properties: {} },
    run: async () => cfg.pessoas.map(p => ({ id: p.id, nome: p.nome })),
  },
  {
    name: 'buscar_filme',
    description: 'Busca filmes e capas. Sem chave usa Cinemeta; com TMDB_KEY usa TMDB. Passe id IMDb para detalhes com nota.',
    inputSchema: { type: 'object', properties: { titulo: { type: 'string' }, ano: { type: 'string' }, id: { type: 'string', description: 'ID IMDb do resultado para obter nota e sinopse' } } },
    run: async ({ titulo, ano, id }) => {
      if (id) return (await api('filmes?id=' + encodeURIComponent(id))).filme
      if (!titulo) throw new Error('Informe titulo ou id')
      if (!TMDB) return (await api('filmes?q=' + encodeURIComponent(titulo))).list
      const q = new URLSearchParams({ api_key: TMDB, query: titulo, language: 'pt-BR', ...(ano ? { year: ano } : {}) })
      const r = await (await fetch(`https://api.themoviedb.org/3/search/movie?${q}`)).json()
      return (r.results || []).slice(0, 5).map(m => ({ tmdb: m.id, filme: m.title, original: m.original_title, ano: (m.release_date || '').slice(0, 4), sinopse: m.overview, poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null }))
    },
  },
  {
    name: 'criar_sessao',
    description: `Cria (ou atualiza, com "id") uma sessão no diário. Com gerar_convite=true também cria o link /nome-do-filme para as pessoas escolhidas. Ids das pessoas: ${pessoas()}.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Para atualizar uma sessão existente' },
        filme: { type: 'string' }, ano: { type: 'string' }, sinopse: { type: 'string' }, diretor: { type: 'string' }, duracao: { type: 'string' },
        poster: { type: 'string', description: 'URL https do pôster' },
        nota: { type: 'number', description: 'Nota do filme (0–10)' }, fonteNota: { type: 'string', enum: ['IMDb', 'TMDB'] },
        pessoas: { type: 'array', items: { type: 'string' } },
        convidados: { type: 'boolean', description: 'Convite também aceita convidados com nome' },
        gerar_convite: { type: 'boolean' },
        links_diretos: { type: 'boolean', description: 'Gera também um ingresso pessoal de uso único por pessoa (padrão: true)' },
        sala: { type: 'string', description: 'Sala isolada (?sala=), para testes' },
        tema: { type: 'string', description: 'Tema visual da sessão (pasta em public/themes, ex.: pulp-fiction, halloween)' },
      },
      required: ['filme'],
    },
    run: async a => {
      const { sessao } = await api('sessoes', 'POST', { tok: ADMIN, sessao: a })
      let convite = null, diretos = null
      if (a.gerar_convite) {
        if (!SENHA) throw new Error('Configure CINEMINHA_SENHA para gerar convites')
        const { slug, diretos: individuais } = await api('convite', 'POST', { tok: ADMIN, pw: SENHA, filme: a.filme, quando: a.quando || '', pessoas: a.pessoas || [], convidados: !!a.convidados, sala: a.sala || '', tema: a.tema || '', sessao: sessao.id, poster: a.poster || '', nota: a.nota, fonteNota: a.fonteNota, ano: a.ano, sinopse: a.sinopse, diretos: a.links_diretos !== false })
        convite = `${URL_BASE}/${slug}`
        diretos = Object.fromEntries(Object.entries(individuais || {}).map(([k, suffix]) => [k, `${convite}/${suffix}`]))
        await api('sessoes', 'POST', { tok: ADMIN, sessao: { id: sessao.id, convite: slug } })
      }
      return { sessao: sessao.id, convite, diretos }
    },
  },
  {
    name: 'criar_convite',
    description: `Gera ingresso de grupo e links pessoais de uso único para uma sessão existente ou um filme. Permite escolher pessoas sem recadastrar a sessão. Ids: ${pessoas()}.`,
    inputSchema: { type: 'object', properties: {
      sessao: { type: 'string', description: 'ID de uma sessão existente; traz pôster, filme e horário' },
      filme: { type: 'string' }, quando: { type: 'string' }, poster: { type: 'string' },
      pessoas: { type: 'array', items: { type: 'string' }, description: 'IDs dos convidados; se omitido, usa os da sessão' },
      convidados: { type: 'boolean' }, links_diretos: { type: 'boolean' }, sala: { type: 'string' }, tema: { type: 'string' },
    } },
    run: async a => {
      if (!SENHA) throw new Error('Configure CINEMINHA_SENHA para gerar convites')
      let session = null
      if (a.sessao) {
        session = (await api('sessoes')).list.find(x => x.id === a.sessao)
        if (!session) throw new Error('Sessão não encontrada')
      }
      const filme = a.filme || session?.filme
      const selected = a.pessoas ?? session?.pessoas ?? []
      const geral = !selected.length && a.convidados == null
      const pessoasConvite = geral ? cfg.pessoas.filter(p => !p.ausente).map(p => p.id) : selected
      const guests = geral ? !!cfg.convidados : !!a.convidados
      const { slug, diretos } = await api('convite', 'POST', {
        pw: SENHA, filme: filme || '', quando: a.quando ?? session?.quando ?? '',
        pessoas: pessoasConvite, convidados: guests,
        poster: a.poster || session?.poster || '', sessao: session?.id || '', ano: session?.ano || '', nota: session?.nota, fonteNota: session?.fonteNota, sinopse: session?.sinopse || '',
        sala: a.sala || '', tema: a.tema || '', diretos: a.links_diretos !== false,
      })
      const convite = `${URL_BASE}/${slug}`
      const individuais = Object.fromEntries(Object.entries(diretos || {}).map(([k, suffix]) => [k, `${convite}/${suffix}`]))
      const link = pessoasConvite.length === 1 && !guests && individuais[pessoasConvite[0]] ? individuais[pessoasConvite[0]] : convite
      return { sessao: session?.id || null, link, convite, diretos: individuais }
    },
  },
  {
    name: 'anexar_legenda',
    description: 'Anexa uma legenda (SRT ou VTT) a uma sessão. Passe o texto, um caminho de arquivo local ou uma URL. Quem transmitir o arquivo recebe a oferta de usar essa legenda.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, texto: { type: 'string' }, caminho: { type: 'string' }, url: { type: 'string' } }, required: ['id'] },
    run: async ({ id, texto, caminho, url }) => {
      let t = texto
      if (!t && caminho) t = await readFile(caminho.replace(/^~/, process.env.HOME), 'utf8')
      if (!t && url) t = await (await fetch(url)).text()
      if (!t?.trim()) throw new Error('Legenda vazia')
      await api('sessoes', 'POST', { tok: ADMIN, sessao: { id, legenda: t } })
      return `Legenda anexada (${Math.round(t.length / 1024)} KB)`
    },
  },
]

// JSON-RPC por linhas (stdio)
const send = m => process.stdout.write(JSON.stringify(m) + '\n')
createInterface({ input: process.stdin }).on('line', async line => {
  let msg
  try { msg = JSON.parse(line) } catch { return }
  const { id, method, params } = msg
  if (id === undefined) return // notificações
  try {
    if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'cineminha', version: '1.0.0' } } })
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} })
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ run, ...t }) => t) } })
    if (method === 'tools/call') {
      const tool = TOOLS.find(t => t.name === params?.name)
      if (!tool) throw new Error('Ferramenta desconhecida')
      try {
        const out = await tool.run(params.arguments || {})
        return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }] } })
      } catch (e) {
        return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Erro: ' + (e.message || e) }], isError: true } })
      }
    }
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Método não encontrado' } })
  } catch (e) { send({ jsonrpc: '2.0', id, error: { code: -32000, message: String(e.message || e) } }) }
})
