# Jogos do Cineminha — como cada um joga hoje

Retrato de 04/11/2026, para pesquisar jogos novos e melhorar os atuais. Escrito para ser lido por gente e por agente:
cada mecânica aponta para o arquivo e a linha do código (`arquivo:linha`). A pasta `codigo/` ao lado tem atalhos para
todos os arquivos citados. Regras de arquitetura e armadilhas já conhecidas ficam em `../../JOGOS.md` (leia antes de mexer).

## Base comum (vale para todos)

| Peça | Como funciona | Onde |
|---|---|---|
| Carregar | Cada jogo é um módulo baixado só quando alguém abre (registro `JOGOS`) | `public/app.js` (busque `const JOGOS`) |
| Rede | Host autoritativo: guarda o estado `G`, manda a cada um só a sua `vista(k)`; os outros mandam intenções | `hostRecebe`, `vista`, `difunde` em cada jogo |
| Eventos | `G.ev` numerado: animação e som tocam uma vez só, no cliente (`anima`) | `anima` em cada jogo |
| Convite | Fase `convite`: **bilhete** para quem foi chamado (Jogar / Só assistir) | `convite()` e `bilhete()` em cada jogo |
| Quem cai | Sai depois de 12 s; o sucessor assume o host depois de 10 s com a cópia `{bk}` | `remove`, `assumeSePreciso` |
| Avisos | `ctx.toast` (aviso rápido no topo), `ctx.sysMsg` (linha no chat) | ex.: `public/parperfeito.js:515` |
| Sons | MP3 do Kenney (CC0), um por evento, no canal de efeitos do mixer | `public/jogos/coup/sons/`, `som()` em cada jogo |
| Tutorial | Motor de aula: cenas declarativas, uma regra por cena | `public/aula.js`, `aula.css`, `coup-aula.js`, `dobradinha-aula.js` |
| Mesas | Vários jogos ao mesmo tempo, abas em cima da tela, um em foco | `iniciar/lider/encerra/sair` no fim de cada módulo |

Componentes de interface que se repetem (mesmo nome em vários jogos):
- **Bilhete**: cartão que entra deslizando no canto inferior direito, com foto de quem fez, uma frase e botões.
- **Balão**: fala ao lado da foto, numa camada 2D por cima da mesa.
- **Confirma**: clique duplo para ações perigosas ("Clique de novo.").
- **Voo**: carta ou moeda que sai de um ponto e pousa em outro, com WAAPI.
- **Distribuir**: embaralhar no meio e dar as cartas no começo.

---

## 1. Coup — blefe na corte
`public/coup.js` (1172 linhas) · `coup.css` · `coup-aula.js` · artes em `public/jogos/coup/` · chave `coup`

**Regras:** Coup base com a variante do Inquisidor (`V.op.inq`). Com 2 jogadores, quem começa leva só 1 moeda (`coup.js:97`).

**Fluxo de uma jogada**
1. **Ação** (`declarar`, `coup.js:138`). As ações são cartas no canto direito que sobem na sua vez (`opcoesDe`, `:775`; `mesaTocavel`, `:785`). Escolher alvo abre um leque de cartas para dentro da mesa, que nunca sai da tela (`poeRoda`, `:797`).
   - Ajuda, Taxar e Trocar acontecem na hora.
   - Com alvo, só o alvo decide, sem pressa (`ALVO_MS` 60 s, `:36`).
2. **Bilhete do alvo** (`bilhete`, `coup.js:906`; CSS `.cp-bilhete`, `coup.css:167`). É o aviso no **canto inferior direito**: "Fulano diz ser o Capitão e vai roubar 2 moedas suas".
   - Botões: Duvidar, "Sou o X" para bloquear (destacado se você tem a carta) e Aceitar.
   - Entra com som de papel e animação de deslizar e girar.
3. **"Duvido!" para todos** (`poeContesta`, `coup.js:955`). Um botão aparece ao lado da foto de quem alegou e fica até a próxima pessoa agir. O primeiro a clicar duvida, e o silêncio vale como aceitar. Na Ajuda, o botão vira "Sou o Duque".
4. **Hesitação** (`hesita`, `coup.js:929`). Passar o mouse em Duvidar ou Bloquear mostra aos outros um chip "pensando em duvidar" sobre a sua foto, com 180 ms de atraso para não piscar.
5. **Contestação "fulano × fulano"** no meio da mesa (`meio`, `:836`).
6. **Revelação com suspense** (`revela`, `coup.js:1074`): a mesa escurece, a carta treme virada com tique-taque acelerando e então vira.
   - Verdade: a carta aparece e volta para a Corte.
   - Blefe: sobra um fantasma com lacre vermelho, e o host desfaz o que a ação já tinha feito (`desfaz`, `:205`).
7. **Perda de carta** (`perder`/`escolhePerda`, `:247`/`:301`). As cartas perdidas ficam reveladas num monte, com a conta do que ainda pode estar escondido (`reveladas`, `:574`).

**Animações e sons** (`anima`, `coup.js:1047`)
- Começo: embaralha e distribui 2 cartas para cada um (`distribui`, `:1099`).
- Moedas: pilhas de verdade (ouro vale 5, prata vale 1; `pilha`, `:563`) que voam de um lugar a outro (`voaMoedas`). A mesa de quem tem a vez só acende depois que elas pousam (`RESPIRO_MS`, `:37`).
- Balões: cada ação "fala" (`FALA`, `:31`; `poeBalao`, `:718`) e a carta alegada fica levantada enquanto a alegação está aberta.
- Sons de punhal no assassinato, golpe, carimbo na dúvida e moedas.
- Hover mostra moedas, Corte e cartas reveladas (`:1140`).

**Tela:** mesa 3D em perspectiva. Você fica embaixo, de costas (`minhaArea`, `:737`); os outros ficam em volta pela foto (`assento`, `:677`, ângulos em `:547`).

**Fim** (`:851`): todas as cartas viram, uma pessoa por vez, mostrando quem blefou e quem pegou quem (`anota`, `:216`). Quem só assiste pode ver as cartas de todos, se a mesa permitir (`vista`, `:384`).

---

## 2. Uno (Descarte) — cor ou número
`public/descarte.js` (834) · `descarte.css` · artes em `public/jogos/uno/` · chave `dc`

**Regras e opções** (`OPCOES`, `descarte.js:9`). Ligadas por padrão:
- Acumular +2/+4: +2 vale em cima de +4, de qualquer cor (`:123`).
- Comprar até 3: uma por clique, depois só "Passar a vez" (`comprar`, `:206`).
- Avisar Uno.
- 7 do silêncio.

Desligadas por padrão (`:18`): 7 troca de mão (`trocaMao`, `:196`), 0 gira as mãos (`giraMaos`, `:190`) e Corte (jogar fora da vez com a carta idêntica, `:157`).

Tempo por vez: 0, 15, 20 ou 30 s (`TEMPOS`, `:19`). Quando acaba, o host compra e passa (`tempoAcabou`, `:142`), com tique nos 3 s finais (`:792`).

**Jogar** (`clicaCarta`, `descarte.js:592`)
- Clicar seleciona a carta. Dá para juntar outras de mesmo valor, de qualquer cor; a última clicada fica por cima.
- Clicar de novo na última joga. Se a carta não tem par, vai direto.
- Os botões ficam no canto direito (`controles`, `:636`): Jogar N, Comprar N ou Comprar 1/3, Passar a vez, Uno! e "Pegou Fulano!" (`pegar`, `:240`).
- Coringa: escolhe a cor.
- Botão de ordenar a mão por cor ou por número (`:50`).

**Mecânicas com a call**
- **"Uno!" por voz** (`voz`, `descarte.js:496`): `webkitSpeechRecognition` em pt-BR só fica ligado quando você tem 1–2 cartas e não está mudo. Ouvir "uno" ou "última" avisa sozinho.
- **7 do silêncio** (`silencio`, `:698`; host em `:327`): depois de um 7 e um respiro de 1,4 s (`GRACA_7`), quem aparecer falando no indicador de voz da call compra 2. Quem está mudo não conta.

**Animações e sons** (`anima`, `descarte.js:727`). Eventos: `inicio`, `embaralha`, `compra` (uma carta por vez, para dar para contar, `:753`), `joga`, `pula`, `inverte`, `gira`, `troca`, `corte`, `ultima`, `pegou`, `falou`, `tempo`, `vence`, `saiu`.
- Distribuição: embaralhar e dar as cartas (`distribui`, `:773`).
- Cartas voando da mão para o monte (`voa`, `:707`).
- Balões (`balao`, `:715`).
- Quando o acumulado sobe, o selo pula e um "+2" ou "+4" sobe dele (`:728`).
- Monte com rotação fixa por carta (`giro`, `:457`).
- Com a mão grande, o boneco se afasta para caber (`:580`).

---

## 3. Dobro — suba o valor; empatou, dobra
`public/dobradinha.js` (894) · `dobradinha.css` · `dobradinha-aula.js` · `public/jogos/dobradinha/` · chave `db` · de 2 a 6 jogadores

**Regras** (mecânica do "Dobro"; `calcula`, `dobradinha.js:37`)
- Joga-se 1 carta ou um par igual. A soma precisa ser maior ou igual ao valor da mesa.
- Se a soma for **igual**, o valor **dobra**.
- Curinga vale o número que você escolher. Passa e Inverte (Inverte não existe com 2 jogadores) só podem ser jogados sozinhos.
- Baralho em `QTD` (`:18`). A mão tem 6 cartas (5 com 6 jogadores).

**Fluxo**
- Se não puder ou não quiser subir, **leva a mesa**: as cartas vão para a sua comanda e você abre a próxima (`pegar`, `:158`).
- Depois de jogar vem a etapa **repor** (`comprar`, `:167`; `passar`, `:174`): botão manual de completar a mão em até 9 s (`REPOR_MS`). Passar sem repor dá o **guarda-chuva** (−1 ponto); o evento é `esqueceu`.
- **Fim da rodada** (`fimRodada`, `:186`): os pontos são 1 + quantos têm mais cartas que você, menos o guarda-chuva. A partida dura 1, 3 ou 1 rodada por pessoa (`RODADAS`, `:16`); quem tem menos pontos abre a próxima.

**Interface**
- **Status** no alto à esquerda (`status`, `:473`): de quem é a vez, o que fazer e a última jogada.
- **Cola** à direita, que dá para esconder (`cola`, `:484`): o que cada carta de ação faz.
- Clique (`clicaCarta`, `:587`):
  - um clique seleciona a carta, outro clique junta o par;
  - clicar de novo numa selecionada, na lousa ou na pilha envia (`enviar`, `:606`);
  - botão direito tira a carta da seleção; Esc limpa.
- Escolha do valor do curinga com números de giz.
- Lousa com o valor atual (`lousa`, `:509`); comanda de papel com as contas (`placar`, `:656`).

**Animações** (`anima`, `dobradinha.js:760`)
- Começo: embaralhar no centro e distribuir em roda a partir do monte (`distribui`, `:811`).
- **Levar a mesa** (`fotoMesa`/`levaMesa`, `:733`/`:741`): as cartas reais da mesa voam para quem levou.
- Carimbo "DOBROU" (`carimbo`, `:725`).
- Cartas do tipo azulejo flutuando na mão, com brilho de esmalte e destaque na escolhida.

---

## 4. Red Flags (Par Perfeito) — monte o pretendente
`public/parperfeito.js` (539) · `parperfeito.css` · `public/jogos/parperfeito/` · chave `pp` · 3+ jogadores

**Regras** (`parperfeito.js:1`)
- A cada rodada, alguém é o **solteiro**. Os outros montam um pretendente com **2 qualidades** (cartas brancas; a mão tem 4, `MAO_Q`; `poeQualidades`, `:95`).
- Depois, cada um estraga o pretendente do **vizinho** com **1 defeito** (carta vermelha; a mão tem 3, `MAO_D`; `poeDefeito`, `:107`; `vizinho`, `:44`).
- O solteiro escolhe com quem sairia e o dono daquele pretendente ganha 1 ponto (`escolhe`, `:120`).
- Fim: duas voltas na mesa ou meta de pontos (`:126`). O placar acumulado fica no `localStorage` (`pp.placar`).
- **Cartas em branco**: um campo para escrever a própria carta. O foco é guardado entre os re-renders (`:345`).

**Visibilidade** (`vista`, `:189`): as qualidades só aparecem quando todo mundo montou; os defeitos, só na revelação.

**Tela:** o solteiro no alto, os pretendentes no meio como pilhas em cascata (`perfil`, `:410`), a mão embaixo (`minhaMao`, `:426`) e os dois montes (`montes`, `:403`).

**Animações** (`anima`, `parperfeito.js:501`)
- Embaralhar e distribuir (`embaralha2`/`distribui`, `:497`/`:482`).
- Cartas voando da mão até a pilha (`guardaVoo`/`fazVoo`, `:444`/`:450`).
- Revelação carta a carta, a cada 500 ms.
- Carimbo no match.
- Tutorial em 3 quadrinhos animados em loop (`convite`, `:365`).

---

## 5. Amigos de Merda (Amigos de Bosta) — votação simultânea
`public/amigosdebosta.js` (640) · `amigosdebosta.css` · `public/jogos/amigosdebosta/` · chave `ab` · 3+ jogadores

**Regras** (`amigosdebosta.js:1`)
- Na sua vez, você compra uma pergunta e lê em voz alta (`compraCarta`, `:75`).
- Contagem 3-2-1 (`contagem`, `:391`): o host só aceita votos depois de 1,7 s (`ABRE_MS`).
- Todos votam **ao mesmo tempo**, apontando alguém, e ninguém vota em si mesmo (`vota`, `:92`). Os votos ficam secretos até todos votarem (`:238`).
- O mais votado fica com a carta (`fechaVotacao`/`avalia`, `:106`/`:117`).
- **Empate** (`respEmpate`/`resolveEmpate`, `:127`/`:135`): quem não votou nos empatados pode trocar o voto em até 25 s (`EMPATE_MS`). Se continuar empatado, vale o voto de quem leu (`minerva`, `:148`).
- Opções (`:23`):
  - meta de cartas: 4, 5 ou 7;
  - tempo para votar: sem limite, 30 ou 60 s;
  - perguntas 18+ (`CARTAS_18`).
- Quem bate a meta é **coroado** (`coroa`, `:170`).

**Tela:** carta no centro (`centro`, `:433`), painel (`painel`, `:452`) e jogadores em volta (`jogadores`, `:493`).

**Animações** (`anima`, `amigosdebosta.js:611`)
- **Setas e fichas** indo de cada votante até a foto votada (`fazVotos`, `:546`).
- A carta voa até a pilha de quem ganhou (`fazVooCarta`, `:577`).
- Tique na contagem e coroa no fim (`fim`, `:591`).

**Pendente:** o usuário pediu uma mesa parecida com a do Dobro, sem perder a rapidez.

---

## 6. Faixa a Faixa — adivinhe a música pelas camadas
`public/faixa.js` (624) · `faixa.css` · dados em `public/jogos/faixa/` · ferramentas em `tools/faixa/` · sem chave (legado)

**Regras** (`faixa.js:1`)
- Começa só com a bateria. Cada erro ou "pular" abre mais um instrumento, em até 5 passos de áudio (`MAX_AUDIO`; `passosDe`, `:71`). A última linha é uma dica: o artista mascarado, "T__ M___" (`:67`).
- Quanto antes acertar, mais pontos. Acertar só o artista vale metade, e depois a música vale o total (`chuta`, `:194`).
- **5 músicas por dia**: dá para jogar o dia, dias anteriores ou um combo. Também há categorias (`CATEGORIAS`, `:17`, a partir das etiquetas da Deezer e da classificação do Antigravity); cada uma sorteia 5 que você ainda não ouviu.

**Modos** (`MODOS`, `faixa.js:7`; `mudarModo`, `:158`)

| Modo | Como funciona |
|---|---|
| Cooperativo | Qualquer erro abre a camada para todos; um acerto encerra a música para todos (`:132`, `:144`) |
| Cada um | Cada um no seu ritmo, vendo quem acertou |
| Às cegas | Sem saber dos outros até a revelação |

**Interface**
- Palpite com busca no catálogo, que só baixa quando alguém começa a digitar e mostra primeiro as músicas que você conhece (`locais`, `:279`).
- "Fulano está digitando" sobre o boneco (`:346`).
- Toasts "Fulano acertou a música!" (`avisos`, `:177`).
- Player por camadas com volumes (`tocar`/`volumes`, `:234`/`:254`).
- Revelação e placar final (`revela`/`placarFinal`, `:446`/`:459`).
- Lobby com dias, progresso e categorias (`abrirLobby`, `:502`).

**Geração das músicas:** `tools/faixa/diario.py`, `leva.py`, `pesquisa.py` e o comando `musica-cineminha`. A separação usa Demucs ou faixas do Clone Hero.

---

## Comparativo rápido

| | Jogadores | Duração | Ritmo | Usa a call | Destaque visual |
|---|---|---|---|---|---|
| Coup | 2–6 | 10–15 min | por turno, com reação | blefe falado | mesa 3D, revelação com suspense |
| Uno | 2+ | 10–20 min | por turno, opcionalmente com relógio | "Uno!" por voz, 7 do silêncio | monte, selo do acumulado |
| Dobro | 2–6 | 5–10 min por rodada | por turno, rápido | não | boteco, levar a mesa |
| Red Flags | 3+ | 15–25 min | fases simultâneas | discussão do solteiro | pilhas em cascata |
| Amigos de Merda | 3+ | 10 min | todos ao mesmo tempo | leitura em voz alta | setas de voto |
| Faixa a Faixa | 1+ | 5 min por dia | simultâneo | cantar junto | áudio por camadas |

## Lacunas para a pesquisa de jogos novos

- **Nenhum jogo de desenho nem de palavra** (como Gartic ou Codenames).
- **Nenhum jogo de dedução social em equipes** (como Lobisomem ou Avalon): a voz da call seria o centro.
- **Nenhum jogo em tempo real ou de reflexo**: a rede é P2P com host, então serviria latência de turno curto, não de ação.
- **Quase nada usa o filme ou a tela que está sendo transmitida** (bingo do filme, palpites sobre o que acontece na cena, quiz sobre a sessão).
- **Faixa a Faixa é o único solo e diário**: outro jogo diário (palavra, filme por frames) reaproveitaria o lobby de dias.
- Mecânicas da call que já funcionam e podem ser reaproveitadas: indicador de quem está falando (`ctx.falando`), reconhecimento de voz e balão sobre o boneco.

## Pontos fracos conhecidos

- Coup: o bilhete aparece só para o alvo; os outros dependem do "Duvido!" ao lado da foto, que é fácil de não ver.
- Uno: a regra de comprar até 3 é nova, testada com 2 jogadores e ainda não publicada.
- Dobro: nome e cartas originais atualizados em 08/11/2026; rodada completa com 4 navegadores, tutorial, reposição, saída e sucessão do host verificados. Medições em `dobro-assets.md`.
- Amigos de Merda: a mesa simples ainda não tem a cara dos outros jogos.
- Red Flags e Amigos de Merda dependem de cartas de texto: o tamanho do baralho limita quantas partidas dá para jogar sem repetir.
