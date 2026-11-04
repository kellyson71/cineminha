# Cineminha — plano de UI (personalidade)

Base visual: referência "watch party" escura (vídeo grande + chat lateral limpo, acento amarelo/dourado).
O que dá identidade: **a fileira de poltronas com os bonecos**. Tudo o resto é familiar (estilo Discord) e discreto.

Regras que valem para tudo:
- O vídeo é a estrela; nada cobre o filme além de controles no hover e coisas passageiras (balões, reações).
- Interações divertidas com moderação: curtas, raras e com limite (nada "fubanga").
- Continua funcionando por temas (tokens CSS + assets por pasta), sem amarrar o `app.js` a um visual.

---

## 1. Fileira e poltronas

**Quem aparece:** só quem está online (fixos e convidados). Ninguém fica como fantasma cinza.

**Transparência (sobreposição):**
- Parado: boneco semitransparente, para não atrapalhar o filme quando estiver por cima.
- Falando: opaco, com brilho suave.
- Mantém a mesma lógica em tela cheia (canto inferior esquerdo).

**Estados:**
| Estado | Visual |
|---|---|
| falando | opaco + brilho quente |
| mudo | ícone de mic cortado pequeno |
| som cortado (ensurdecido) | ícone de fone cortado |
| ausente (sem mexer/falar há X min) | "z z z" subindo devagar da cabeça |
| transmitindo | ponto ao vivo no nome (depois: feixe de projetor) |
| entrou / saiu | animação curta de sentar / levantar |

**Assets (o Kellyson entrega, não criar):**
- `assets/poltrona-vazia.png`: poltrona sem ninguém.
- `assets/avatar-convidado.png`: silhueta cinza sentada (a da imagem enviada).
  - PNG com **fundo transparente**, no mesmo enquadramento dos outros bonecos (~250×415 px, boneco encostando embaixo).
- `assets/pfp-convidado.png`: o círculo com a silhueta, 256×256, transparente fora do círculo.
- Sugestão para diferenciar convidados: tingir levemente a silhueta com a cor do convidado (CSS `mask` + cor) e mostrar o nome. Não precisa de um asset por pessoa.

**Configurar a sala (admin):**
- poltronas por fileira, número de fileiras;
- poltronas reservadas (fixas de cada pessoa, ou "só convidado");
- trocar de lugar (arrastar o próprio boneco, se a poltrona estiver livre);
- guardado no servidor (`api/prefs` ou um `api/sala` novo) e enviado aos outros por P2P.

**Voz pelo lugar (áudio espacial):** quem senta à esquerda soa mais à esquerda (`StereoPannerNode`). **Pode desligar** nos ajustes. Começa desligado ou leve.

**Interação entre amigos (com cuidado):**
- No popover da pessoa (abre **embaixo** da poltrona): volume, mutar/tirar (admin) e 1 ou 2 ações leves ("jogar pipoca", "shhh").
- Limite: uma por pessoa a cada ~10 s; quem recebe pode desligar nos ajustes.

## 2. Balões e reações

**Balão de fala:** mensagem do chat aparece num balão simples acima da cabeça do boneco por ~5 s (texto curto; texto longo é cortado com "…"; GIF vira miniatura). Várias seguidas: substitui, não empilha.

**Reações saem da cabeça do boneco** (não mais do canto direito).
- **Rápidas (teclas 1–9):** emoji animados (Noto Animated Emoji, licença livre), sobem da cabeça e somem.
- **Memes (aba "Figurinhas do grupo"):** imagens de `Supaco/supaco-react/dist/memes` (27 webp com legenda, retangulares). Aparecem como um cartãozinho/polaroid que salta da cabeça, maior e mais devagar. Cooldown para não virar spam.
- Os temas podem trazer as próprias figurinhas e emoji.
- Copiar os memes para `public/stickers/` (ficam ~600 KB) com uma lista em JSON.

## 3. Chat (estilo Discord bem feito)

- Tirar o ping (`#peerInfo`) e a cara de cartão.
- Mensagens seguidas da mesma pessoa agrupadas (foto e nome só na primeira).
- Horário aparece no hover.
- Responder (citação) e reagir a uma mensagem.
- **Marca do filme:** se quem transmite é um arquivo, a mensagem guarda o minuto ("aos 42:10"); quem transmite pode clicar para pular até lá.
- Histórico continua salvo no servidor.
- **Sem notificações flutuantes** sobre o vídeo (o balão no boneco já cumpre esse papel).
- **Tela cheia:** chat translúcido por cima do vídeo, à direita (estilo Twitch). Some junto com o resto quando fica parado (`idle`), volta ao mexer o mouse.

## 4. Controles e som

- Tirar os dois sliders soltos da barra.
- **Clique direito na tela (tile):** menu de som daquela transmissão (volume, mudo, recarregar, legenda).
- **Clique no boneco:** volume da pessoa (já existe, vai para baixo da poltrona).
- **Mesa de som** (um botão na barra): filme, vozes, efeitos, soundboard e cada pessoa.
- **Avisos inteligentes de volume** (toast pequeno com ação, no máximo um a cada poucos minutos):
  - "O filme está bem mais alto que a galera. Baixar o filme?" (compara o nível do filme com o das vozes);
  - "A Milenny está mais baixa que o resto. Aumentar?" (compara a média de cada voz).
- **Soundboard no site:** busca no MyInstants; o som toca para todos no canal "efeitos" (com volume próprio na mesa de som), sem passar pelo RNNoise.

## 5. Transmissão de arquivo

- O tamanho (5 GB) não é problema: o arquivo toca do disco de quem transmite e só o vídeo reencodado vai pela rede.
- O problema é o formato (HEVC, áudio AC3/DTS, alguns MKV).
- **No navegador:** antes de transmitir, testar o arquivo; se o vídeo ou o som não tocar, abrir um **modal** explicando que o arquivo não é compatível e pedindo um compatível (MP4/WebM, H.264 + AAC).
- **No app desktop (futuro, Electron leve):** conversão local com ffmpeg e tela inteira com som do sistema.

## 6. Início da transmissão

- Ao começar: contagem "3·2·1" de projetor antigo + cortina abrindo + luzes da sala baixando.
- **Créditos no fim**, só quando alguém clicar em "Finalizar sessão" (não automático, porque filme e transmissão podem continuar). Os nomes de quem assistiu sobem como créditos, em cima da tela, sem depender da transmissão.

## 7. Diário de sessões + cadastro por IA

- `api/sessoes`: lista de sessões (filme, ano, pôster, sinopse, legenda, data, quem foi, mensagem mais reagida).
- **Servidor MCP** (ferramentas `criar_sessao`, `buscar_filme`, `anexar_legenda`, `listar_sessoes`): Claude, Gemini ou outra IA pesquisa o filme (TMDB), acha a legenda (OpenSubtitles) e cadastra. O Kellyson só escolhe o arquivo e transmite.
- A sessão cadastrada vira o `subtitulo`/pôster da sala e alimenta o convite.

## 8. Entrada e convites

**Tela de entrada** (página inteira, não modal):
- cartão da sessão: pôster, nome do filme, data;
- quem foi convidado: cartões com **foto + nome + a poltrona**;
- clicar em quem você é → entra. Convidado sem perfil usa a silhueta.

**Convite do admin:** `cineminha…/nome-do-filme`.
- O admin cria no painel: escolhe o filme (do diário) e as pessoas.
- O servidor guarda o slug → {sessão, pessoas}.
- Mostra só os avatares convidados; se for **uma pessoa só**, ela entra direto.
- A senha da sala fica embutida no convite (o convite é a credencial); sem convite continua a senha normal.

## 9. Sistema visual

- Acento dourado/amarelo de letreiro no lugar do vermelho; vermelho só para "ao vivo".
- Fonte de letreiro só no nome e nos títulos; uma grotesca com mais caráter para a interface.
- Grão de filme bem sutil; veludo só nas bordas.

---

## Status (1º de novembro de 2026)

Etapas 1 a 10 implementadas e testadas localmente com várias pessoas (Chrome headless). **Ainda não publicadas** (`./deploy.sh`).
Pendente: app desktop (Electron), sistema visual (acento dourado e fontes, item 9), interação "jogar pipoca/shhh" entre amigos (deixada de fora de propósito para não ficar exagerado).

## Ordem sugerida

1. **Chat + balões + reações** (não depende de asset): agrupamento, hover de horário, responder, sem ping, balão na cabeça, emoji + memes saindo da cabeça.
2. **Controles:** clique direito na tela, mesa de som, avisos de volume, sem sliders soltos.
3. **Poltronas:** só online, transparência, estados (z z z, mudo, ensurdecido), convidado com silhueta, poltrona vazia (quando os assets chegarem).
4. **Tela cheia** com chat translúcido estilo Twitch.
5. **Arquivo:** teste de compatibilidade + modal.
6. **Entrada nova + convites** `/nome-do-filme`.
7. **Configurar sala** (fileiras, reservadas, trocar lugar) + voz pelo lugar.
8. **Soundboard** MyInstants.
9. **Contagem 3·2·1, cortina, créditos.**
10. **Diário + MCP.**
11. App desktop (Electron) — projeto à parte.

## Pendências

- ~~Assets do Kellyson~~ entregues e recortados em `public/assets/`: `poltrona-vazia.png`, `avatar-convidado.png`/`pfp-convidado.png` e as novas pessoas (Jeyce, Kauan, Luiz, Pedro, Gabi, Meris).
- API do MyInstants não é oficial: confirmar se a busca funciona direto do navegador (CORS) ou se precisa de uma função em `api/`.
- Chave do TMDB para o diário/MCP.

## Continuação — contas e ingressos

- [x] Som de palmas ligado à reação 👏.
- [x] Minha conta com foto, restauração, cor e preferências persistentes.
- [x] Entrada lembrada no navegador e saída com revogação do token.
- [x] Convidar no topo e no Diário, trazendo os dados da sessão cadastrada pelo MCP.
- [x] Seleção de grupo e links pessoais com entrada automática de uso único.
- [x] MCP retorna os ingressos individuais junto ao link do grupo.
- [x] Testes isolados do Redis de produção em `tests/contas-convites.py`.


## Refinamento dos controles e convites

- [x] Minha conta no topo e na própria poltrona; configurações e sair no topo.
- [x] Convites disponíveis a qualquer participante; seção Admin no perfil Kellyson.
- [x] Projetar discreto na barra, ao lado dos controles principais de microfone e fone.
- [x] Botão direito no cinema vazio; volume e redução automática durante falas.
- [x] Voz, projeção, soundboard e efeitos separados por pessoa.
- [x] Fone desliga todos os canais; menus acessíveis em tela cheia.
- [x] Ferramenta MCP criar_convite e skill compartilhada entre os três agentes.


## Convites rápidos

- [x] Botão principal copia convite geral em um clique; pílula de personalização.
- [x] Fotos selecionáveis em faixa; formulário vazio também funciona.
- [x] Uma pessoa copia ingresso pessoal; várias copiam convite de grupo.
- [x] Sem agendamento; busca opcional com autocomplete, capa, ano e nota.
- [x] Prévia compacta no formulário e Open Graph no HTML para compartilhamento.
- [x] Testes de cópia, busca, roteamento, metadados e não consumo por prévias.


## Voz, dispositivos e identidade

- [x] Menu por botão direito no mic/fone e seta de opções, com entrada/saída e teste.
- [x] Perfis de ruído e ajustes manuais, preservando o mudo nas trocas.
- [x] RNNoise sem empilhamento da supressão nativa; portão desligado por padrão.
- [x] Espacial HRTF suave com presença nos dois ouvidos, ligado por padrão.
- [x] Conta lembrada não abre seleção automática ao encontrar outra aba igual.
- [x] Testes de processamento, menu, áudio espacial e identidade.


## Polimento dos menus e teste de voz

- [x] Descrições no hover e rótulos curtos com ícones; sem cabeçalhos redundantes no mixer.
- [x] Teste de voz com contagem 3–2–1, anel de progresso e estados de gravação/reprodução.
- [x] Retorno privado centralizado: mesma voz nos canais esquerdo e direito, sem espacial.
- [x] Verificação com sinais originalmente presentes em apenas um dos canais.


## Player de arquivo e controles no hover

- [x] Remover a contagem, conforme nova decisão.
- [x] Arquivos iniciam pausados, com quadro real de prévia.
- [x] Controles próprios no hover, em tela normal e cheia.
- [x] Play/pausa, busca, velocidade, volume, legendas e qualidade.
- [x] Controle compartilhado para todos e limite de qualidade por participante.
- [x] Preview para participantes que chegam com o filme pausado.
