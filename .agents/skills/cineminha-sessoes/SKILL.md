---
name: cineminha-sessoes
description: Cadastra filmes e sessões no Cineminha, pesquisa metadados, anexa legendas e gera ingressos para convidados escolhidos usando o MCP do projeto. Use para organizar uma sessão, selecionar participantes ou criar convites; não para implementar a interface ou publicar o site.
---

# Sessões do Cineminha

Projeto local: `/home/kellyson/projetos/cineminha`. A mesma skill funciona no Claude, Codex e Anti-Gravity.

Use as ferramentas do MCP `cineminha` se estiverem disponíveis. Caso contrário, a ponte CLI executa o mesmo servidor MCP:

```bash
node /home/kellyson/projetos/cineminha/tools/cine.mjs list-tools
node /home/kellyson/projetos/cineminha/tools/cine.mjs pessoas
node /home/kellyson/projetos/cineminha/tools/cine.mjs listar_sessoes
node /home/kellyson/projetos/cineminha/tools/cine.mjs criar_convite --file /tmp/convite.json
```

As credenciais vêm do ambiente ou de `~/.config/cineminha/mcp.env`, lidas por `tools/mcp-start.mjs`. Não imprima esse arquivo. `CINEMINHA_URL` seleciona o destino (padrão local); `CINEMINHA_SENHA` permite convites; `CINEMINHA_ADMIN` permite cadastrar/alterar sessões e legendas; `TMDB_KEY` é opcional. Não faça deploy para organizar uma sessão.

## Escolher filme e convidados

- Consulte `pessoas` para resolver nomes em IDs. Confirme apenas ambiguidades reais; não acrescente pessoas que o usuário não escolheu.
- Consulte `listar_sessoes` antes de cadastrar novamente. Para somente convidar, use `criar_convite` com `sessao` e `pessoas`.
- Para dados do filme, use `buscar_filme` (Cinemeta sem chave; TMDB se configurado). Depois passe o `id` IMDb do resultado para obter nota e detalhes. Não invente ano, duração, pôster ou legenda.
- Cadastre com `criar_sessao`: `filme`, `pessoas`, e os metadados disponíveis (`ano`, `sinopse`, `diretor`, `duracao`, `poster`, `nota`, `fonteNota`). `gerar_convite: true` retorna ingresso de grupo e links individuais. Para atualizar uma sessão, inclua seu `id`.
- Não ative `convidados` (pessoas sem perfil) sem pedido do usuário. `pessoas` são os convidados fixos escolhidos, não a lista inteira do projeto.

Exemplo de argumentos para `criar_convite` (grave JSON em arquivo; não interpole descrições na linha de comando):

```json
{"sessao":"id-retornado-pelo-mcp","pessoas":["otavio","milenny"],"links_diretos":true}
```

`criar_convite` também aceita `filme` e `poster` sem sessão cadastrada. Sem preencher dados, gera um convite geral. Para uma pessoa só, compartilhe o campo `link`, que é o ingresso pessoal. Várias pessoas recebem o link do grupo. Não solicite horário: a intenção é entrar e assistir agora. O ID da sessão recupera automaticamente filme, data e pôster. Para testes, passe `sala: "teste-<identificador>"` e use a suíte isolada `tests/contas-convites.py`; o servidor local normal usa o Redis configurado no projeto.

## Legendas e entrega

`anexar_legenda` recebe `id` e um de `texto`, `caminho` ou `url` (SRT/VTT). Use um arquivo fornecido pelo usuário ou uma fonte autorizada; não prometa legenda que não foi obtida. O filme permanece local no computador de quem projeta; não envie o vídeo ao MCP.

Ao concluir, devolva o filme (se houver), convidados e os links realmente retornados pelo MCP. O link do grupo mostra só as pessoas selecionadas; cada link pessoal permite uma entrada automática e depois fica lembrado naquele navegador. Não abra links pessoais para testá-los: isso consome o ingresso. Não envie convites por mensagem a terceiros sem pedido explícito.
