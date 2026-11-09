# Jogos do Cineminha — contexto

Tudo o que um jogo novo precisa seguir. Os oito jogos atuais são a referência viva:

| Jogo | Arquivos | Chave da mensagem | Tipo |
|---|---|---|---|
| Faixa a Faixa | `public/faixa.js`, `faixa.css`, `jogos/faixa/` | (sem chave, legado) | adivinhar a música, áudio por camadas |
| Quadro a Quadro | `public/quadro.js`, `quadro.css`, `jogos/quadro/` | `qq` | adivinhar filmes por frames; Corrida, Cooperativo e Leilão; categoria Famosos (padrão) com 45 títulos conhecidos e 19 animações no acervo; pistas dessas seleções revisadas do menos óbvio ao mais fácil |
| Coup | `public/coup.js`, `coup.css`, `jogos/coup/` | `coup` | blefe, mesa 3D em perspectiva |
| Uno | `public/descarte.js`, `descarte.css`, `jogos/uno/` | `dc` | cartas de cor e número; mesa inclinada (46°) com temas de mesa locais (`dc.mesa`), anel de setas e facho para quem tem a vez, pilha bagunçada (14 cartas, giro/desvio por id), voos em arco com virada 3D e batida nas cartas de ação, mão em leque com FLIP; temas Minimalista (padrão) e Clássico em SVG; seletor com caixas originais em CSS 3D e preferência local em `dc.tema`; Sem Piedade com Roleta pública de uma carta por clique e efeitos próprios das ações novas; monte diminui por compra, recolhe o descarte deixando o topo, reutiliza o riffle e volta ao lugar sem distribuir |
| Red Flags | `public/parperfeito.js`, `parperfeito.css`, `jogos/parperfeito/` | `pp` | festa, rodadas com juiz, cartas de texto |
| Amigos de Merda | `public/amigosdebosta.js`, `amigosdebosta.css`, `jogos/amigosdebosta/` | `ab` | votação simultânea; baralho do mod (86 pretas + 22 rosas), frentes em HTML/CSS |
| Dobro | `public/dobradinha.js`, `dobradinha.css`, `jogos/dobro/` | `db` | escalada de valores (igual dobra), pilhas recolhidas no tampo, atlas AVIF/WebP; 3 s de proteção antes dos 9 s de contagem do Esquecido, arrastável; cola recolhida e paginada, cartas centrais maiores e destaque do destino ao levar a mesa |
| Dou-lhe Uma | `public/doulheuma.js`, `doulheuma.css`, `jogos/doulheuma/` | `du` | leilão de listas (quem cita mais), sem relógio; tarja de TV de leilão rural |
| Na Testa | `public/natesta.js`, `natesta.css`, `jogos/natesta/` | `nt` | quem sou eu? (post-it na testa, perguntas de sim/não); mural de cortiça |
| Codnames | `public/agentes.js`, `agentes.css`, `jogos/codnames/` (+ `jogos/agentes/palavras.js`) | `ag` | dicas em dois times; cartas em comandas que viram (agente, cliente, X9), dica com seletor de número, clique para sugerir e duplo para abrir; baralho próprio Da Casa e 5 pacotes em caixas 3D; skins Escritório (padrão) e Bar, só para quem escolhe; admin: um clique no logo mostra o mapa; efeitos originais restaurados em `jogos/codnames/sons/`, pelo mixer |

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
   numeração e o cliente descarta o evento como velho (sem animação). Use `qtd`, e monte `{ ...e, n: ++G.evN }`. Aconteceu no Dobro.
2. **`data-*` com o `ctx.el`.** Não vira atributo; use o wrapper local.
3. **Classes genéricas colidindo com o `style.css`.** `.sel`, `.row`, `.on`… já existem no site e mudam display/fundo.
   Prefixe tudo (`xx-`).
4. **Variáveis CSS com nome de cor.** No Uno a rotação das cartas da pilha se chamava `--r`, o mesmo nome da cor
   vermelha: as cartas vermelhas ficavam sem cor. Dê nomes descritivos (`--giro`, `--i`).
5. **Elementos 3D cortados.** Balões e textos dentro de um plano com `preserve-3d` somem atrás do plano. Desenhe balões numa
   camada 2D por cima (posição calculada pelo `getBoundingClientRect` do alvo).
5b. **Filho que cancela exatamente a inclinação da mesa 3D.** Num plano a `rotateX(46deg)`, um assento com `rotateX(-46deg)`
   faz o Chrome errar a oclusão e deixar de pintar o fundo do jogo fora do plano (aparecia a cortina do teatro por
   cima). Use um valor próximo (`-44deg`). Ampliar algo em pé com `scale` também o recorta contra o plano: mude
   largura/altura. Com jogo aberto a `.curtain` fica escondida (`style.css`). Aconteceu no Uno.
6. **Caractere como ícone** (♥, ⚑) fica torto no centro. Use SVG.
7. **Re-render tirando o foco do campo** que a pessoa está digitando: guarde e restaure o foco/seleção (ver Red Flags).
8. **Regras globais dentro do CSS do jogo** (menu de jogos, fileira de poltronas) somem enquanto o jogo não carregou: vão
   no `style.css`.
9. **Fileira de poltronas** fica por cima do canto inferior esquerdo da tela fora da tela cheia: deixe respiro embaixo ou
   esconda (`.theater.xx-on .row`).

## Motor de mesa de cartas (compartilhado)

`public/cartas-mesa.js` + `cartas-mesa.css` (ponha `'cartas-mesa.css'` no `css` do registro): `criaMesa({ tela, carta,
cartaSel, palco })` devolve o voo de carta (arco Bézier subindo para a câmera, inclinação pela velocidade, sombra, virada
3D `vira`, batida `slam` com `bate()`, pouso inclinado `deita`), `impacto` (onda/faíscas/mesa sacode), FLIP da mão
(`fotos` antes do render, `flip` depois), `inclina` (carta segue o mouse via `--tx/--ty`), `pousa` + `pousando` (carta
escondida no destino até o voo chegar) e `criaGiro` (anel/sentido e facho da vez num laço próprio que sobrevive ao
render). Usado no Uno e no Dobro; a mão de ambos usa encaixe parado (`.xx-slot`, recebe o hover) com a carta dentro
subindo por `--lift/--sc`. Em `vista(k)` mande a mão como cópia (`mao.slice()`): no host, a referência do `G` faz a
carta nova não parecer nova.

### Mesa de bar (`public/boteco3d.js`)

`criaBoteco({ tela, palco, plano, centro, tamanho })`: mesa de plástico de bar (modelo e skins do mod "Traditional
Brazilian Bar Table") na calçada do Marcílio Bar (imagem fixa `jogos/boteco/fundo-bar.webp`, gerada pelo usuário,
posta no palco pela classe `.b3d-fundo`). Padrão no Uno e no Dobro. As cartas continuam em HTML. Dois modos
(`localStorage 'mesa.qualidade'`, escolhido no painel Baralho e mesa do Uno; sem escolha, máquina fraca fica no leve):
- `3d`: o Three.js (`public/vendor`, só aqui) desenha a mesa UMA vez com câmera tirada do CSS do palco/plano, copia
  para um canvas 2D e descarta o WebGL. Redesenha só ao redimensionar ou trocar a cor. Nada de laço, PMREM ou sombras
  em tempo real (travava máquina fraca); cartas 3D também foram descartadas por peso.
- `2d`: sem WebGL; o tampo é a textura recortada (`.b2d-tampo`) deitada no plano.
`balanca(f)` faz a mesa sentir pancadas (batida, carta pousando, compra grande). A luz do balcão e o grão de papel nas
cartas são CSS (`--cm-luz`, `--cm-brilho`, `--cm-grao` em soft-light dentro da carta). Chame `encaixa()` + `liga(cor)`
depois de cada render e `desliga()` ao fechar. Créditos em `public/jogos/boteco/CREDITOS.txt`.

## Admin nos jogos de carta (Uno e Dobro)

Sem botão: **um clique no logo do jogo** abre "Próximas compras" (só para `kellyson` logado como admin;
para os outros o logo não faz nada). Sem fila, a compra é aleatória. A fila só vai na vista do admin, não é salva no
`localStorage` nem na cópia do sucessor, e não aparece no histórico da mesa nem no chat; o uso vai só para o diário
interno da sala (`ctx.logInterno`, visível no Diagnóstico do admin). Uno: itens `cor:valor` ('r:+2', 'g:pulaT') ou
coringa sem cor ('+10'); a carta sai do monte, do descarte ou entra nova. Dobro: só sai carta que existe no baralho
(monte ou as 10 de fora com 2 pessoas, trocada por uma do monte); a que não existe espera na fila.

## Poses de carta do boneco

Quem tem `cartas: 'assets/poses/<pessoa>/cartas/'` no `config.js` aparece na cadeira de bar no Uno e no Dobro
(`ctx.poseCartas`): poucas, muitas (10+), uma (1 carta), pensando (sua vez), joga (1 s depois de jogar), dormindo
(90 s sem mexer fora da vez). Originais em `raw/poses-cartas/`. Hoje: Kellyson e Jeyce.

## Direitos autorais

Jogos comerciais de referência: **pode** usar a mecânica (regras, fluxo). **Não pode** copiar textos das cartas, nome, arte
ou visual, mesmo traduzidos ou "da comunidade". Escreva as cartas do zero (`public/jogos/xx/cartas.js`), dê nome próprio e
identidade visual própria. Sons: Kenney (CC0) em `public/jogos/coup/sons/`; Twemoji (CC-BY 4.0) pede crédito em `CREDITOS.txt`.

## Identidade e interface

- Cada jogo tem **identidade visual própria** (Coup: renascença/pergaminho; Uno: baralho minimalista nas referências do usuário, com opção de voltar ao Clássico; Red Flags: vermelho/branco com versos da Oficina;
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
  --use-fake-device-for-media-stream`, viewport 1400x900. Login: `#pw` = a senha da sala, clicar no `.whocard` com
  `input[value=kellyson]` (e otavio, milenny, pedro), esperar `!document.body.classList.contains('locked')` e as poltronas.
  Abrir: `#btnJogo` → `.jogosmenu__it` com o nome do jogo.
- Jogue rodadas completas com 3–4 navegadores, sem `pageerror`, e **olhe os screenshots** (legibilidade, sobreposição).
  `node --check` em todo JS alterado.
- Publicar: `./deploy.sh` (troca a versão: quem está na sala recarrega). Só com o usuário pedindo.

## Artes dos jogos existentes

Quadro a Quadro: frames do FILMGRAB, títulos do Wikidata; fontes e seis pistas das 16 animações novas em `tools/quadro/curadoria.json`. `node tools/quadro/animacoes.mjs` baixa/converte as imagens e atualiza filmes e autocomplete. A curadoria também corrige Aladdin (1992) e O Rei Leão (1994), remove Avatar e Christopher Robin da categoria Animação e registra a ordem dos frames de Famosos. `categorias.mjs` reaplica essas escolhas depois de consultar o Wikidata; o jogo preserva `ordem` na partida e no backup do host.

A pedido do usuário, Uno usa o logo da Mattel, Red Flags e Amigos de Merda usam os versos dos downloads da Oficina da Steam. Imagens locais em `public/jogos/uno/`, `public/jogos/parperfeito/` e `public/jogos/amigosdebosta/`; as fontes constam em `CREDITOS.txt` nessas pastas. O menu carrega apenas as miniaturas; os versos de cada mesa carregam com o CSS do jogo.

## Dobro: assets e desempenho

O nome visível é **Dobro**. `db`, `db.G`, `criaDobradinha` e os nomes dos módulos foram mantidos para preservar a restauração e o protocolo existentes. As 18 artes únicas do mod usam um único atlas de 6 × 3: `cartas.avif` (54,9 KiB) ou `cartas.webp` (76,7 KiB), escolhido por `image-set`. A carta Esquecido e as duas faces da carta de sentido também vêm do pacote original. O menu baixa apenas a miniatura; o atlas entra com o jogo. Fontes, scripts de geração e a comparação com SVG constam em [dobro-assets.md](docs/jogos/dobro-assets.md).

## Uno: reposição do monte

`repoe()` recicla assim que a última carta é comprada (ou ao receber um monte já vazio). Mantém o topo e a cor escolhida, remove `esc` das
cartas recicladas e emite `embaralha` com a quantidade e até 13 faces já públicas (não com a ordem do
monte novo). Não devolver cartas antecipadamente por tamanho do descarte. Compras que atravessam
a reposição emitem um evento `compra` antes e outro depois dela.

No cliente, a altura do monte cai a cada compra. A reposição dura 2,2 s: recolhe (450 ms), vira
(300 ms), usa o mesmo `embaralhaVisual`/`dc-riffle-*` da distribuição inicial (1 s) e retorna
ao monte (450 ms). As mãos recebem apenas a compra solicitada. A camada sobrevive a renders;
fechar/trocar a partida cancela seus timers e voos pendentes. Movimento reduzido repõe sem os voos.
O host guarda `repondoAte`, recusa novas jogadas/compras durante a reposição e dá esse tempo extra
à vez/Roleta. A vista envia apenas o tempo restante (`repondo`).

Verificação local: `python3 tools/uno/teste-monte.py`, `teste-roleta.py` e `teste-partida.py` na mesma
pasta, com o servidor na porta 8790 e API interceptada. Capturas da reposição em `/tmp/cineminha-uno-monte/`.
