# Cineminha — resumo

Site para assistir filmes e jogar junto com os amigos (Otávio, Milenny, Kellyson e convidados).
Cada um transmite a tela com som, todos conversam por voz e chat, e a sala mostra quem está "sentado" nas poltronas.

- Produção: https://cineminha-boo.vercel.app (senha da sala `cineminha`, senha de admin `kellyson`)
- Código: `~/projetos/cineminha` · deploy com `./deploy.sh` · servidor local com `node tools/dev.mjs` (porta 8790)
- O Especial Boo (`~/projetos/especial-boo`) é o projeto de origem e **não deve ser mexido**.

## Como funciona

- **Sem servidor de mídia.** Vídeo, voz e mensagens vão direto entre os navegadores (WebRTC via Trystero, em `public/vendor/trystero.js`).
- **A sala** é derivada da senha: `sha("sala:" + senha [+ ":" + ?sala=])`. Por isso, `?sala=teste-x` cria uma sala isolada. **Todo teste deve usar `?sala=teste-…`** para os amigos não ouvirem nada.
- **Mensagens P2P** (ações): `hello` (quem sou, mudo, som cortado, ausente, lugar), `share` (inclui o tempo do filme), `chat`, `hist`, `spk` (falando/parou), `need`, `react` (emoji, meme `m` ou som `s`), `mre` (reação numa mensagem), `pausa`, `leg` (legenda), `adm` (comandos do admin: mute, stop, kick, clear, aviso, sala, fim), `ctl` (controle remoto do arquivo: toggle, seek, at).
- **Servidor só para guardar coisas** (funções em `api/`, Upstash Redis):
  - `api/chat.js`: histórico de chat (últimas 500; o admin pode apagar) e reações nas mensagens (`chatre:<sala>`).
  - `api/prefs.js`: preferências de cada pessoa.
  - `api/convite.js`: convites `/nome-do-filme` (qualquer participante cria; valem 45 dias; o link leva a senha da sala).
  - `api/sala.js`: arrumação da sala (poltronas por fileira, reservadas, mostrar vazias).
  - `api/sons.js`: busca no MyInstants e repassa os MP3 (o site não libera CORS).
  - `api/sessoes.js`: diário de sessões e legendas cadastradas.
- **Atenção:** o servidor local usa o mesmo Redis da produção (`.env.local`). Testes devem usar `?sala=teste-…` e apagar o que criarem no diário/convites.
- **Entrada:** senha da sala, depois escolher quem você é (fixo ou convidado com nome). "Lembre da sessão" guarda no navegador e entra direto na próxima vez.

## Voz

Caminho do microfone (`micOn()` em `public/app.js`):

```
mic (eco/ganho configuráveis) → ganho e corte de graves 70 Hz → RNNoise → portão opcional (padrão desligado) → envio P2P
```

- **Supressão de ruído:** RNNoise (rede neural, roda em WebAssembly via AudioWorklet, `public/vendor/nsup/`). Se não carregar, a voz segue só com o filtro do navegador.
- **Portão de voz:**
  - Mede o volume (filtrado 150–3400 Hz) a cada 20 ms. O limite e o tempo de espera são configuráveis.
  - No perfil Ambiente ruidoso, abre acima de −55 dB e espera 800 ms antes de fechar, com fade. No perfil Preservar minha voz, fica desligado para preservar falas baixas.
  - Assim, teclado e respiração não vazam entre as falas.
- **Indicador de "falando":** acende depois de cerca de 120 ms de voz contínua e apaga 450 ms depois. Ele é enviado pela ação `spk` e faz o boneco da pessoa brilhar na fileira.
- **Modos:**
  - Microfone aberto (padrão).
  - Aperte para falar: tecla configurável, padrão V. Solta a tecla quando a janela perde o foco.
- **Mutar/desmutar:**
  - Tecla M ou botão do mic.
  - Desliga a faixa e avisa os outros pelo `hello`; a poltrona mostra o ícone de mudo.
  - Toca o som Slack huddle-pop.
- **Troca de microfone** nos ajustes: reinicia o pipeline e mantém o estado de mudo.

## Áudio de quem assiste (mixer)

- Três volumes independentes (até 200%): **filme**, **vozes** e **efeitos**, além de um **volume por pessoa** (popover na poltrona).
- **Transmissão em estéreo:** o SDP é ajustado para Opus estéreo 192 kbps (filme com som bom).
- **Atraso:**
  - Modo filme: buffer de 150 ms (estável).
  - Modo jogo: 0 ms, 60 fps, 8 Mbps e prioridade a manter o fps.

## Transmitir

- **Tela/janela/aba com som:**
  - Windows: marcar "Compartilhar áudio do sistema".
  - Linux: usar `tools/som-filme.sh` (cria a saída "Cineminha - Filme" e move o app para lá) ou a flag do Chrome em `tools/chrome-som-do-sistema.sh`.
  - Mac: precisa do BlackHole e da opção "Som extra" no menu Projetar.
- **Arquivo local:**
  - Toca no navegador de quem envia e transmite via `captureStream()`.
  - Aceita legenda SRT/VTT, enviada como texto a cada 100 ms.
  - Os outros podem pausar e pular ±10 s pelo **controle remoto**.
- **Várias pessoas ao mesmo tempo:** grade, ou uma em foco com as outras em miniatura.
- **"Pausa aí":** pede para quem transmite pausar.
- Botão de **recarregar transmissão**; travamentos de vídeo são detectados e recarregados sozinhos.

## Admin

No perfil Kellyson, a seção Admin dos ajustes permite digitar a senha de administrador. O token é conferido pelos outros navegadores e pelo servidor. O admin pode:

- mutar alguém;
- tirar alguém da sala;
- parar a transmissão de alguém;
- mandar aviso (faixa no topo);
- limpar o chat.

## Chat, reações e sons

- **Chat:** histórico salvo no servidor, GIFs (Giphy), pode ser ocultado (C).
- **Reações:** teclas 1–9; a lista pode vir do tema.
- **Sons** (em `public/sounds/`, ajustáveis em `config.sons`):

| Evento | Som |
|---|---|
| Eu entrei / eu saí | Slack huddle "você entrou/saiu" |
| Alguém entrou / saiu | Slack huddle "alguém entrou/saiu" |
| Mutar e desmutar | Slack huddle-pop |
| Tela ligou / desligou | Discord stream start/end |
| Mensagem no chat | Slack knock_brush |

- **Atalhos:** M mutar · tecla do aperte-para-falar · F tela cheia · C chat · P pedir pausa · R reações · 1–9 reação · Enter escrever · Esc fecha.

## Temas e sessões (logística)

Uma sessão nova normalmente só muda **`public/config.js`**:

- `nome`, `subtitulo` (ex.: filme da noite), `logo`, `tema`, `appId`.
- `senhaHash` e `adminHash`, gerados com `node tools/hash.mjs "senha"`. A senha de admin entra como `admin:` + senha.
- `pessoas`: id, nome, foto, **boneco** (arte da fileira) e cor.
- `sons`, `reacoes`, `convidados`.

Como um tema funciona:

- **Pasta:** cada tema é uma pasta em `public/themes/<nome>/`.
  - `theme.css` sobrescreve os **tokens** dentro de `.tema-<nome>`. Os tokens base ficam em `:root` no `style.css`: `--bg`, `--surface`, `--card`, `--fg`, `--accent`, `--live`, `--speak`, `--speak-glow`, `--font-display`, `--radius` etc. Também pode trazer texturas e imagens próprias.
  - `theme.js` tem valores padrão (logo, reações…). **O que estiver preenchido no `config.js` ganha** do tema.
- **Escolha do tema:** `config.tema`, ou teste com `?tema=nome` na URL. Sem tema, vale o visual base escuro e neutro.
- **Exemplo pronto:** `themes/halloween` (jornal recortado, papel rasgado, abóbora, morcego, reações de terror).
- **Regra para o redesign:** o visual base precisa funcionar só com tokens e assets trocáveis. Um tema novo (Natal, anime, terror, aniversário…) deve ser só uma pasta com CSS e imagens, sem tocar no `app.js`.

## Interface (redesign de nov/2026, detalhes em `PLANO-UI.md`)

- **Entrada:** página inteira com a cortina, a sessão (filme, data, pôster do convite) e cartões com boneco + foto. Com convite não pede senha; convite de uma pessoa só entra direto.
- **Fileiras:** só quem está online; meio transparentes parados, opacos falando. Estados: mudo, som cortado (tecla D), ausente (z z z após 10 min sem mexer). Sentar/levantar animado. Lugares vêm da arrumação da sala; cada um troca de lugar clicando na própria poltrona.
- **Poses dos bonecos** (`assets/poses/<pessoa>/*.webp`, `poses` no `config.js`, todas alinhadas pela poltrona): palmas ao mandar 👏, pipoca ao mandar 🍿, celular aceso digitando no chat, celular no colo com a aba escondida, dormindo quando ausente. A Jeyce ainda não tem poses.
- **Fileira** fica no canto inferior esquerdo da tela, sobrepondo um pouco a imagem. "Transmitir" virou **Projetar**.
- **Chat estilo Discord:** agrupado, horário no hover, responder, reagir, marca do minuto do filme (clicável). Cada mensagem vira um balão na cabeça do boneco. Em tela cheia, chat translúcido que some com os controles.
- **Reações:** emoji animados (Noto, `public/reacoes/emoji/`), memes do grupo (`public/reacoes/memes/`, vindos do Supaco) e sons do MyInstants. Tudo sai da cabeça de quem mandou. Lista em `public/reacoes/reacoes.js`; temas podem trocar (`reacoes`, `memes`).
- **Som:** mesa de som (filme, vozes, sons, efeitos, cada pessoa), botão direito numa tela (volume só dela e opções), avisos de volume (sugere, nunca muda sozinho), voz pelo lugar (opcional).
- **Cinema:** cortina de veludo, sem contagem, luzes que apagam com o filme rodando, créditos ao finalizar a sessão (admin).
- **Arquivo incompatível** (HEVC, AC3/DTS): modal antes de transmitir. O tamanho não importa (o arquivo não é enviado, só o vídeo reencodado).
- **Diário + MCP:** `tools/mcp.mjs` deixa uma IA cadastrar a sessão, anexar legenda e gerar convite. Ao transmitir, a legenda cadastrada é oferecida. Ao finalizar, o resumo vai para o diário.

```
claude mcp add cineminha -e CINEMINHA_URL=https://cineminha-boo.vercel.app -e CINEMINHA_ADMIN=<admin> -e CINEMINHA_SENHA=<sala> -- node ~/projetos/cineminha/tools/mcp.mjs
```

## Design (histórico)

**Situação:** o protótipo no canvas foi descartado ("muito feio"). Vamos seguir com o design direto, de preferência já no próprio site.

O que o Kellyson já deixou claro:

- **A identidade são as poltronas com os bonecos sentados.** É a interação principal; o resto é secundário. Nada de visual genérico.
- **Tem que parecer um cinema de verdade:**
  - Usar assets reais: fotos, veludo, cortina e sala, em `design-kit/4-assets-reais/`, créditos em `CREDITOS.md`.
  - Nada de "adesivo de quadrinho" exagerado.
- **Sem plaquinhas A1/A2/A3.**
- **Hover na poltrona** mostra **embaixo** as opções: volume da pessoa, mutar, tirar da sala.
- **Balão de fala** acima ou ao lado do boneco quando a pessoa manda mensagem (ele gostou).
- **Chat ao lado**, que pode ser ocultado.
- **Os bonecos não podem tampar o filme.**
- **Tela cheia** em dois estados (com chat e sem chat). Os bonecos continuam sentados, mas sem atrapalhar. Precisa ter pausa, legendas, volume do filme, volume de cada pessoa e volume das vozes.
- **Equilíbrio:** com personalidade própria (cinema e jogos), mas sem ficar difícil de usar. Precisa ser familiar o bastante, no estilo Discord, para ninguém travar.
- **Adaptável a temas** (ver seção acima).

Material disponível em `design-kit/`:

- `PROMPT.md`
- prints das telas atuais
- bonecos e fotos de perfil, em `2-assets`
- fotos reais, em `4-assets-reais`

## Pendências

- Saber o sistema da Milenny e do Otávio (Windows/Mac/Linux) para fechar a solução de "tela com som". Talvez colocar ajuda por sistema no menu Projetar, ou um app Electron.
- A flag do Chrome no Linux e o comportamento em aparelhos reais ainda não foram testados.
- Créditos: três fotos pedem atribuição (CC BY / CC BY-SA). A autoria de `sala-de-cinema-3` não foi confirmada.

## Contas e ingressos personalizados (continuação)

- **Minha conta:** pela foto no topo, pela própria poltrona ou Ajustes → Minha conta. Foto (recorte central de 256 px), restauração da foto original, cor do nome, microfone mudo ao entrar, legendas, voz pelo lugar e avisos de volume. Foto e cor são compartilhadas; volumes e preferências ficam separados por pessoa e sincronizados via `api/prefs.js`.
- **Sessão lembrada:** token aleatório em `cine.conta`, válido por 180 dias, renovado ao usar. Sair revoga o token e volta à entrada. Se a senha da sala mudar, é necessário entrar novamente. A escolha de perfil continua seguindo a lógica do grupo: senha da sala ou ingresso.
- **Convidar:** botão no topo para todos e em cada sessão futura no Diário. Não exige senha de admin; a API valida a senha da sala. Selecionar a sessão traz filme, horário, pôster e pessoas do cadastro feito pelo MCP. Ao gerar, aparecem o ingresso do grupo e um link individual por pessoa selecionada.
- **Grupo:** `/nome-do-filme`, mostra apenas os cartões selecionados. Um grupo com uma única pessoa entra automaticamente.
- **Pessoal:** `/nome-do-filme/inicial#ticket=<segredo>`, entra automaticamente uma vez e lembra a conta no navegador. A inicial distingue nomes iguais (`ka`, `ke`). O segredo é removido da barra após a entrada; apenas seu hash fica no convite. A prévia GET não consome o ingresso: o resgate é POST, com exclusão atômica no Redis. Em outro navegador, um ingresso usado é bloqueado. Quem já está autenticado mantém sua própria conta.
- **MCP `criar_sessao`:** `gerar_convite=true` retorna `convite` e `diretos` (mapa pessoa → URL individual), vinculados à sessão. `links_diretos=false` gera só o ingresso do grupo.
- **Palmas:** reação 👏 anima as poses e toca `public/sounds/palmas.mp3` no canal Efeitos, com intervalo para evitar sons empilhados.
- **Verificação:** `python3 tests/contas-convites.py`. Requer Playwright Python e Chrome em `/opt/google/chrome/chrome`. Usa servidor na porta 8791 e Redis REST em memória, sem ler ou escrever o banco de produção; cobre API, resgate concorrente, fluxo visual, conta lembrada, perfil, preferências, logout, layout móvel e MCP.


## Controles de voz e áudio (inspirados no Discord)

- Foto de perfil, nome, configurações e sair ficam no topo. Em tela cheia, configurações se move para a barra inferior; os modais de conta e convites continuam acessíveis.
- Microfone e fone têm maior destaque na barra. Projetar fica ao lado deles, com acento discreto. A tela vazia não tem um segundo botão de projeção.
- O fone (D) desliga **todo o áudio recebido** (filme, vozes, soundboard e efeitos) e muta o microfone. Ao voltar, restaura os volumes e o estado anterior do microfone. O microfone (M) controla apenas sua voz.
- Botão direito no cinema abre o menu de áudio mesmo sem transmissão. Nas telas com projeção, continua permitindo volume individual e opções da tela.
- **Baixar filme durante as falas:** opção persistente no menu do cinema e em Áudio da sala. Enquanto alguém audível fala, o filme fica em 30% do volume escolhido; depois retorna gradualmente. A voz local também ativa a redução. Vozes silenciadas individualmente não ativam a redução remota.
- Clique (ou botão direito) numa pessoa: voz, projeção, soundboard e efeitos independentes, cada um com volume e botão de mudo. São ajustes locais. Efeitos incluem as palmas e avisos associados àquela pessoa. Em Áudio da sala, cada pessoa aparece em uma seção expansível com os mesmos controles.
- A própria poltrona abre Minha conta e troca de lugar. Os controles de admin continuam exclusivos do perfil Kellyson no site; convites são compartilhados por todos.
- Skill compartilhada: `.agents/skills/cineminha-sessoes/SKILL.md`, com links nas pastas globais de Claude, Codex e Anti-Gravity. Usa o MCP diretamente quando disponível ou `node tools/cine.mjs <ferramenta> --file argumentos.json`.
- `tools/mcp-start.mjs` lê a configuração privada em `~/.config/cineminha/mcp.env` sem publicar credenciais no projeto. O destino configurado inicialmente é local. `criar_convite` permite convidar para sessão existente, selecionando pessoas sem recadastrar o filme.


## Convite rápido e prévia de filme

- Clique em **Convidar**: gera e copia um convite geral, sem abrir formulário. A pílula de engrenagem ao lado abre a personalização.
- Personalizar tem só uma busca opcional de filme e uma faixa horizontal de fotos. Nenhuma foto selecionada significa todo mundo; uma pessoa gera/copia seu ingresso pessoal de uso único; várias pessoas geram/copiam o link do grupo. Sem título também funciona. Não existe campo de horário.
- `api/filmes.js` busca metadados públicos no Cinemeta: título, ano, capa, sinopse e nota IMDb (detalhes obtidos ao selecionar). Busca por título em português funciona; o título retornado depende do catálogo. Se a busca falhar, dá para convidar usando texto livre ou nenhum filme.
- O formulário mostra uma prévia compacta com capa, título, ano e nota; os links individuais ficam recolhidos, disponíveis se necessários.
- `api/ingresso.js` serve a página com Open Graph no HTML (título, descrição, capa e metadados Twitter). Os rewrites de `/filme` e `/filme/inicial` passam por esse handler, que não resgata nem consome ingressos. A função inclui `public/index.html` no pacote de deploy. O servidor local usa o mesmo handler.
- A prévia externa do WhatsApp depende de uma URL pública: os metadados são verificáveis localmente, mas `localhost` não pode ser acessado pelo WhatsApp.
- O MCP `buscar_filme` usa Cinemeta sem chave e TMDB quando configurado; `criar_convite` aceita formulário vazio e retorna `link` (pessoal quando há uma única pessoa, de grupo nos outros casos). A skill compartilhada acompanha essa lógica.


## Menus de entrada/saída e voz espacial

- Botão direito no microfone ou no fone, ou a pequena seta ao lado: menu expandido de entrada, saída, teste de saída, espacial, perfis e ajustes manuais. A troca de saída usa `AudioContext.setSinkId()` e também altera a saída do vídeo local. Se o navegador não oferece a API, a seleção fica desativada e informa que é necessário usar a saída do sistema.
- Perfis: **Preservar minha voz** (RNNoise, sem portão, um único corte de graves em 70 Hz), **Ambiente ruidoso** (RNNoise com portão), **Sem filtros** e **Personalizado**. A supressão nativa e o isolamento de voz ficam desligados quando RNNoise é usado, evitando tratamentos sobrepostos. Se RNNoise falha, tenta a supressão nativa e informa a troca.
- Manual: motor RNNoise/navegador/desligado, ganho −12 a +18 dB, corte de graves 0–180 Hz, portão ligado/desligado, limite −75 a −20 dB, espera 150–1600 ms, eco e ganho automático. Trocas preservam o estado de mudo. Medidor mostra o sinal processado.
- Espacial ligado por padrão (`spatialVersion: 2` migra preferências antigas uma vez). Depois disso, desligar continua salvo. `PannerNode` HRTF calcula a direção pela planta da sala (coluna/fileira), com ângulo lateral limitado e 30% de presença central para evitar uma voz só em um ouvido. Desligado, a voz volta ao centro. Funciona da mesma forma em tela cheia.
- Outra aba/dispositivo com o mesmo perfil não abre mais “Quem é você?” nem muda a conta. Vozes recebidas com a mesma identidade local são ignoradas, evitando ouvir a própria voz por outra aba. A escolha explícita de outra identidade continua pela saída da conta e entrada novamente.
- Testes: `node tests/audio-settings.mjs` e `python3 tests/contas-convites.py`. Incluem áudio HRTF renderizado offline nos dois canais, perfis e portão, ausência de supressão nativa junto com RNNoise e perfil duplicado sem modal de seleção. A qualidade perceptiva com a voz real e os dispositivos físicos deve ser conferida manualmente.


## Setas dos controles e teste de microfone

- Microfone e fone têm controles de 54 px (50 px no celular), cada um com sua própria seta para o menu. O clique principal mantém mutar/desmutar; botão direito também continua abrindo opções. Fone com áudio ligado usa a mesma cor clara do microfone; vermelho indica áudio desligado.
- **Testar microfone** grava três segundos e reproduz pela saída escolhida, com os mesmos filtros e portão. Usa uma saída privada do processamento, que não é enviada ao WebRTC. O envio normal é silenciado durante gravação/reprodução; terminar, cancelar ou fechar o menu restaura o estado anterior de mudo. Trocar os filtros cancela o teste.


## Menus compactos e retorno de voz centralizado

- Menus de voz, mixer, projeção, ajustes e preferências de conta usam rótulos curtos e ícones. Instruções ficam no `title` (hover); títulos redundantes e parágrafos de ajuda foram retirados.
- Teste de voz tem anel de progresso com contagem 3–2–1, estados por ícones e animação discreta ao ouvir. Respeita a preferência por movimento reduzido. Não repete textos no leitor de tela a cada atualização do progresso.
- O ramo privado da captura é mono; a reprodução decodifica a gravação e usa `createCenteredPlayback()` para enviar a mesma amostra aos canais esquerdo e direito. Não passa pelo espacial das outras pessoas e segue a saída de áudio escolhida. Foi testado também com buffers originalmente só à esquerda e só à direita: as saídas são idênticas nos dois canais.


## Player de vídeo próprio

- Arquivo abre pausado em 0:00, após teste silencioso de compatibilidade. Sem contagem 3–2–1. O anfitrião vê o quadro do próprio vídeo; participantes recebem também uma prévia JPEG do quadro atual, inclusive ao entrar numa sessão já pausada.
- Controles aparecem ao mover o mouse e somem por inatividade, dentro ou fora da tela cheia. O clique no vídeo e o play/pausa alteram o arquivo do anfitrião para todos. Participantes também podem buscar no tempo e mudar a velocidade.
- Barra própria: progresso, tempo/duração, play/pausa, volume local da projeção, legendas, opções e tela cheia. Sem controles nativos do navegador. A barra respeita o espaço das poltronas e do chat em tela cheia.
- Opções: qualidade automática ou limites de 1080p/720p/480p, velocidade de 0,5× a 2× e envio de legenda SRT/VTT pelo anfitrião. Cada participante escolhe seu limite de qualidade; o emissor aplica escala de resolução e bitrate ao respectivo RTCRtpSender. Não aumenta a resolução acima da fonte.
- A legenda cadastrada só é oferecida automaticamente quando há uma sessão explicitamente vinculada ao convite. Sem essa associação, fica apenas a prévia do arquivo.
- `python3 tests/player.py`: dois navegadores com conexão WebRTC real e APIs interceptadas (sem banco), mais um participante que entra depois. Valida início pausado, preview, controles remotos, seek, escala real de qualidade, velocidade, legenda e tela cheia.
