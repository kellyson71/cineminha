# Jogos do Cineminha — contexto

Tudo o que um jogo novo precisa seguir. Os seis jogos atuais são a referência viva:

| Jogo | Arquivos | Chave da mensagem | Tipo |
|---|---|---|---|
| Faixa a Faixa | `public/faixa.js`, `faixa.css`, `jogos/faixa/` | (sem chave, legado) | adivinhar a música, áudio por camadas |
| Coup | `public/coup.js`, `coup.css`, `jogos/coup/` | `coup` | blefe, mesa 3D em perspectiva |
| Uno | `public/descarte.js`, `descarte.css`, `jogos/uno/` | `dc` | cartas de cor e número, cartas em CSS/SVG |
| Red Flags | `public/parperfeito.js`, `parperfeito.css`, `jogos/parperfeito/` | `pp` | festa, rodadas com juiz, cartas de texto |
| Amigos de Merda | `public/amigosdebosta.js`, `amigosdebosta.css`, `jogos/amigosdebosta/` | `ab` | votação simultânea; baralho do mod (86 pretas + 22 rosas), frentes em HTML/CSS |
| Dobradinha | `public/dobradinha.js`, `dobradinha.css` | `db` | escalada de valores (igual dobra), mesa de boteco, cartas em CSS/SVG |

Comece copiando a estrutura do **Red Flags** (o mais simples e completo) ou do modelo em
`.agents/skills/cineminha-jogos/modelo.js`.

## Prioridade do site

O objetivo principal do Cineminha é **transmitir tela, conversar e ver junto**. Os jogos não podem pesar isso:

- Cada jogo é um **módulo carregado sob demanda** (registro `JOGOS` em `public/app.js`). Nada do jogo (JS, CSS, fontes) é
  baixado até alguém abrir o jogo ou chegar a primeira mensagem dele. Enquanto baixa, aparece "Carregando …" na tela.
- Assets grandes (áudio, imagens) só quando forem usados, um por vez. Nunca baixe "tudo" ao abrir.
- O jogo vive dentro da tela do cinema (`#screenInner`), nunca como modal da página.

## Como integrar um jogo novo (no `public/app.js`)

1. Uma entrada no registro `JOGOS`:
   ```js
   xx: { nome: 'Nome do Jogo', mod: './nomedojogo.js', cria: 'criaNomeDoJogo', tela: 'xx', on: 'xx-on', css: ['nomedojogo.css'], fontes: 'family=Fonte+Um&family=Fonte+Dois' },
   ```
   `fontes` é o trecho da URL do Google Fonts (só as fontes do jogo; o site principal só carrega Inter).
2. No roteamento de `actions.jogo.onMessage`, acrescente `d?.xx ? ['xx', d.xx] :` antes do `['faixa', d]`.
3. Uma variável `let nomeDoJogo = null` no topo, a atribuição em `carregaJogo` (`else if (id === 'xx') nomeDoJogo = j`) e a
   chamada `nomeDoJogo?.entrouAlguem(d.key)` no `hello` (junto das outras).
4. Um item no `menuJogos` com ícone próprio em `ICONES_JOGO` (SVG centralizado num quadrado de 24) e `() => abreJogo('xx')`.
   Os estilos do ícone (`.jogosmenu__ic--xx`) vão no **`style.css`** (o menu carrega antes do jogo).
5. Se o jogo restaura a partida do host depois de recarregar, inclua `['xx', 'xx.G']` na lista de restauração.
6. A fileira de poltronas some sozinha com `.theater.xx-on` — acrescente `.xx-on` no seletor `:is(...)` do `style.css`.

## O contexto (`ctx`) que o site entrega

`criaX(ctx)` recebe (veja `ctxJogo` em `app.js`):

- `ctx.tela` — div do jogo dentro de `#screenInner` (classe = `tela` do registro). Use `container-type: size` e medidas em
  `cqh`/`cqw` para escalar igual em tela cheia.
- `ctx.el(tag, props, ...filhos)` — cria elementos. **Não transforma `data-*` em atributo** (usa `Object.assign`): crie um
  wrapper `el` local (ver qualquer jogo) senão `querySelector('[data-…]')` não acha nada.
- `ctx.icon(nome)`, `ctx.hydrate(raiz)` — ícones Lucide do site (só os de `public/icons.js`).
- `ctx.toast(txt)`, `ctx.sysMsg(txt)` — aviso rápido e mensagem de sistema no chat.
- `ctx.me` — `{ key, name, muted, speaking, … }` de quem está nesta aba.
- `ctx.send(d)` (todos), `ctx.sendTo(key, d)` (uma pessoa, por `key`), mensagens pela action P2P `jogo`.
- `ctx.presentes()` — keys de quem está na sala; `ctx.nomeDe(key)`; `ctx.pfp(key, tamanho, nome)` (foto);
  `ctx.boneco(key)` (arte da poltrona); `ctx.falando(key)` (indicador de voz); `ctx.mudo()`.
- `ctx.audioCtx()`, `ctx.saida()` — tocar sons no mixer do site (canal de efeitos).
- `ctx.outroJogo()` — outro jogo está aberto (não aceite estado novo).
- `ctx.onAtivo(on)` — chame no render (liga a classe `xx-on` no teatro e acende o botão de jogos).

O módulo devolve `{ got(d, deKey), iniciar(chamados), ativo(), entrouAlguem(key), lider(), encerra(), sair(), jogadores() }`
e expõe `window.__xx = () => ({ G, V, difunde })` para testes. Os quatro últimos e o `chamados` (keys que já entram como
"sim" no convite) servem às **mesas**: o app deixa mais de um jogo rolando ao mesmo tempo, mostra um por vez (a mesa em
foco, com abas em cima da tela) e, ao abrir um jogo com outro rolando, pergunta ao líder se leva todo mundo, abre ao lado
ou encerra; quem só joga sai (`sair()` manda `{ op: 'sai' }` e o host chama `remove(key)`). `ctx.outroJogo()` agora é
sempre falso: cada jogo segue o seu, mesmo sem foco.

## Arquitetura de rede (igual em todos)

- **Host autoritativo.** Quem abre a mesa guarda o estado completo `G` (inclusive cartas escondidas e o baralho).
  `difunde()` incrementa `G.seq`, salva em `localStorage` (`xx.G`) e manda para cada pessoa **só o que ela pode ver**:
  `ctx.sendTo(k, { xx: { v: vista(k) } })`. O host também aplica a própria vista.
- Os outros só mandam **intenções**: `ctx.sendTo(V.host, { xx: { op: { id: V.id, op: 'joga', carta } } })`.
  `hostRecebe(d, key)` valida tudo (fase, vez, carta na mão…) antes de mudar `G`.
- **Eventos** (`G.ev`, com número crescente) dizem o que acabou de acontecer, para animar e tocar som só uma vez
  (`ultEv` no cliente). Ao entrar numa mesa já em andamento, o cliente pula os eventos antigos.
- **Convite:** fase `'convite'` com `G.conv[key] = 'sim' | 'nao' | '?'`. Quem foi chamado vê um bilhete (Jogar / Só assistir);
  `entrouAlguem` coloca quem chega depois no convite ou manda a vista atual.
- **Quem cai:** depois de ~12 s fora (`SAIU_MS`) sai do jogo; cartas voltam ao monte; se era a vez dela, a vez anda.
  Aviso "Fulano saiu da mesa" e nome apagado ("caiu") enquanto isso.
- **Troca de host:** a cada `difunde` o host manda uma cópia completa para o **sucessor** (`{ xx: { bk: G } }`, próximo
  jogador conectado). Se o host sumir por ~10 s (`HOST_MS`), o sucessor assume (`assumeSePreciso`), tira o antigo do jogo e
  continua. Quem recebe uma vista de outro host com o mesmo `id` larga o próprio `G`.
- **Recarregar:** o host restaura `xx.G` do `localStorage` (só se ninguém assumiu no lugar).

## Armadilhas que já aconteceram (não repita)

1. **Campo `id` na intenção.** `manda(d)` monta `{ id: V.id, ...d }`. Um `id` dentro de `d` (ex.: id da carta) **sobrescreve
   o id da partida** e o host ignora a jogada em silêncio. Use `carta`, `cartas`, `alvo`… Aconteceu no Uno e no Red Flags.
1b. **Campo `n` num evento.** `ev(e)` numera os eventos com `n`; um `n` dentro de `e` (ex.: quantidade de cartas) quebra a
   numeração e o cliente descarta o evento como velho (sem animação). Use `qtd`, e monte `{ ...e, n: ++G.evN }`. Aconteceu na Dobradinha.
2. **`data-*` com o `ctx.el`.** Não vira atributo; use o wrapper local.
3. **Classes genéricas colidindo com o `style.css`.** `.sel`, `.row`, `.on`… já existem no site e mudam display/fundo.
   Prefixe tudo (`xx-`).
4. **Variáveis CSS com nome de cor.** No Uno a rotação das cartas da pilha se chamava `--r`, o mesmo nome da cor
   vermelha: as cartas vermelhas ficavam sem cor. Dê nomes descritivos (`--giro`, `--i`).
5. **Elementos 3D cortados.** Balões e textos dentro de um plano com `preserve-3d` somem atrás do plano. Desenhe balões numa
   camada 2D por cima (posição calculada pelo `getBoundingClientRect` do alvo).
6. **Caractere como ícone** (♥, ⚑) fica torto no centro. Use SVG.
7. **Re-render tirando o foco do campo** que a pessoa está digitando: guarde e restaure o foco/seleção (ver Red Flags).
8. **Regras globais dentro do CSS do jogo** (menu de jogos, fileira de poltronas) somem enquanto o jogo não carregou: vão
   no `style.css`.
9. **Fileira de poltronas** fica por cima do canto inferior esquerdo da tela fora da tela cheia: deixe respiro embaixo ou
   esconda (`.theater.xx-on .row`).

## Direitos autorais

Jogos comerciais de referência: **pode** usar a mecânica (regras, fluxo). **Não pode** copiar textos das cartas, nome, arte
ou visual, mesmo traduzidos ou "da comunidade". Escreva as cartas do zero (`public/jogos/xx/cartas.js`), dê nome próprio e
identidade visual própria. Sons: Kenney (CC0) em `public/jogos/coup/sons/`; Twemoji (CC-BY 4.0) pede crédito em `CREDITOS.txt`.

## Identidade e interface

- Cada jogo tem **identidade visual própria** (Coup: renascença/pergaminho; Uno: baralho clássico com logo e elipse; Red Flags: vermelho/branco com versos da Oficina;
  Amigos de Merda: preto/rosa com versos da Oficina; Faixa a Faixa: minimal + punk/show). Nada de cara genérica de IA.
- Página inicial = **tutorial visual**. Jogos com regra difícil usam o motor de aula (`public/aula.js` + `aula.css`, ponha
  `'aula.css'` no `css` do registro): passos curtos, uma regra por cena, e o último passo interativo. As cenas são
  declarativas: cada peça recebe classes de batida (`eN` entra, `sN` sai, `vN`/`wN` move, `fN` vira, `mN` morre, `dN`
  destaca, `pN` carimba, `tN` treme) e o motor acende `b1, b2…` na cena. Exemplos: `coup-aula.js`, `dobradinha-aula.js`.
  Jogos simples podem ficar com 2–3 quadros em loop (ver `convite()` do Red Flags).
- Cartas parecem cartas de verdade (proporção em pé, mesmo tamanho na mão e na mesa), legíveis rápido.
- Hierarquia clara: o que é a vez de quem, o que fazer agora. Sem textão de instrução; dicas curtas no `title`.
- Animações curtas e com propósito (cartas voando do monte para a mão, embaralhar no começo, revelar), sem exagero;
  respeite `prefers-reduced-motion`.
- Sons reais e baixos (não sintetizados agudos); um por evento.
- Use a tela inteira do cinema (não um modal pequeno); fora da tela cheia, deixe respiro para as poltronas.

## Testar (obrigatório antes de dizer que está pronto)

- Servidor local: `cd ~/projetos/cineminha && setsid -f node tools/dev.mjs > /tmp/dev.log 2>&1` (porta 8790). Ele guarda os
  módulos de `api/` em memória: reinicie depois de mudar a API. Não use `pkill -f` (mata o próprio shell); use o PID.
- **O servidor local usa o mesmo Redis da produção.** Teste sempre em `?sala=teste-xx-<timestamp>` e intercepte
  `**/api/**` no Playwright (`{'token':'a'*48,'perfis':{}}` para `conta`, `{}` para o resto) para não gravar nada.
- Playwright (Python) com Chrome em `/opt/google/chrome/chrome`, headless, `--no-sandbox --use-fake-ui-for-media-stream
  --use-fake-device-for-media-stream`, viewport 1400x900. Login: `#pw` = `cineminha`, clicar no `.whocard` com
  `input[value=kellyson]` (e otavio, milenny, pedro), esperar `!document.body.classList.contains('locked')` e as poltronas.
  Abrir: `#btnJogo` → `.jogosmenu__it` com o nome do jogo.
- Jogue rodadas completas com 3–4 navegadores, sem `pageerror`, e **olhe os screenshots** (legibilidade, sobreposição).
  `node --check` em todo JS alterado.
- Publicar: `./deploy.sh` (troca a versão: quem está na sala recarrega). Só com o usuário pedindo.

## Artes dos jogos existentes

A pedido do usuário, Uno usa o logo da Mattel, Red Flags e Amigos de Merda usam os versos dos downloads da Oficina da Steam. Imagens locais em `public/jogos/uno/`, `public/jogos/parperfeito/` e `public/jogos/amigosdebosta/`; as fontes constam em `CREDITOS.txt` nessas pastas. O menu carrega apenas as miniaturas; os versos de cada mesa carregam com o CSS do jogo.
