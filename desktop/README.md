# Cineminha Desktop — Linux nativo

Aplicativo em **Rust**, com uma única janela desenhada por egui/OpenGL. Não usa
Chrome, Electron, WebKit, WebView nem servidor local durante o uso normal.
A interface nativa reaproveita os personagens, as poltronas, as cores e a
organização de tela + participantes + chat do Cineminha.

## Abrir

Procure **Cineminha** no menu de aplicativos após instalar, ou execute:

```sh
./desktop/dist/cineminha
```

Escolha seu perfil, informe a senha da sala e entre. Quem usa o site continua
na mesma sala: o aplicativo implementa o protocolo Trystero 0.26 do projeto
(Nostr para descoberta, WebRTC para mídia e mensagens).

## Transmitir e jogar

- Clique em **Transmitir tela inteira** e escolha o monitor no seletor do sistema.
- O **som do sistema** vem ligado por padrão; o microfone tem seu próprio botão.
- Em **Ajustes**, escolha a saída de áudio a capturar ou ative **Modo jogo**.
- Pode minimizar o app e abrir seu jogo: a captura continua em segundo plano.
- Use **Parar transmissão** para encerrar a captura; **Sair da sala** encerra a conexão.

O modo cinema limita a captura a 1080p/30 fps; o modo jogo a 720p/60 fps.
O vídeo é codificado uma vez e o RTP é distribuído aos participantes.
Quando disponível, usa H.264 pela GPU (VA-API ou NVIDIA); caso contrário,
VP8 pela CPU. `--check` mostra o encoder e os requisitos encontrados.
A interface só redesenha quando há eventos, e não atualiza texturas enquanto
está minimizada. O consumo depende da resolução, do encoder e das transmissões recebidas.

No Wayland, o seletor é o portal nativo do desktop, e a captura vem do PipeWire.
No X11, usa XImage. O áudio é capturado diretamente pelo PulseAudio/pipewire-pulse
em Opus estéreo, separado da voz. Nenhuma gravação é salva no disco.
A captura da saída inteira inclui as vozes da sala se tocarem nessa saída.
Para separar jogo e conversa, use uma saída dedicada ao jogo e escolha seu
monitor em Ajustes (por exemplo, a saída criada por `tools/som-filme.sh`).

## Escopo desta versão

Inclui sala, perfis fixos/convidados, chat de texto, voz, transmissão da tela
inteira com som, recepção de mídia, pausa e tela cheia. A interface foi reescrita
nativamente, e não reproduz todos os recursos do site: minijogos embutidos,
GIFs, administração, convites, legendas e envio de arquivo ainda pertencem à
versão web. O app serve para conversar e compartilhar inclusive jogos externos.

## Compilar e instalar

Requer Rust/Cargo, compilador/linker C, pkg-config, OpenGL, PipeWire/PulseAudio,
pactl e GStreamer com os plugins de captura, Opus, VP8 e decodificação H.264.
Para Wayland, também requer xdg-desktop-portal e o backend do seu desktop.

```sh
cd desktop
cargo test --locked
cargo clippy --all-targets -- -D warnings
./build.sh
./dist/cineminha --check
./dist/cineminha --install
```

O build produz `dist/cineminha` e `dist/cineminha-linux-<arquitetura>.tar.gz`.
Não precisa de navegador ou Node para executar o app.
Em distribuições nas quais o Rust procura um linker inexistente, use
`CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=cc` nos comandos Cargo/build.
Recompile na arquitetura e em uma distribuição compatível com o destino:
o pacote depende das bibliotecas GStreamer/OpenGL do sistema.

A instalação por usuário coloca o executável e o ícone em
`${XDG_DATA_HOME:-~/.local/share}/cineminha` e cria
`applications/cineminha.desktop` no mesmo diretório de dados. Não precisa de sudo.
Para desinstalar, remova esse diretório e essa entrada `.desktop`.
A versão nativa não usa o perfil Chromium do launcher anterior; se ele foi usado,
o diretório antigo `~/.config/cineminha/chromium` pode ser removido separadamente.

`assets/config.json` contém somente a configuração pública usada pelo app
(appId, hash da senha e lista de perfis). Atualize esse snapshot se alterar
`public/config.js`. Não há senha em texto puro persistida pelo aplicativo.
A versão fixada do transporte e a pequena correção de rollback estão documentadas
em `vendor/webrtc/CINEMINHA-PATCH.md`, com as licenças upstream preservadas.

## Teste de interoperabilidade

```sh
cargo build --locked
CINEMINHA_TEST_BROWSER_ORDER=first python3 tests/interop.py target/debug/cineminha-desktop
CINEMINHA_TEST_BROWSER_ORDER=last python3 tests/interop.py target/debug/cineminha-desktop
xvfb-run -a env XDG_SESSION_TYPE=x11 CINEMINHA_CAPTURE_TEST=1 cargo test capture_x11_and_pulse_monitor -- --nocapture
```

O teste requer Python Playwright e Chrome para representar um participante
**do site**; o executável nativo não depende deles. Usa um relay temporário
em localhost, mídia sintética e saída de som descartada, sem escrever em produção.
Verifica autenticação de sala, chat nos dois sentidos, vídeo e áudio enviados
pelo app e vídeo recebido do navegador. O seletor real do portal Wayland precisa
de uma verificação interativa no desktop de destino.
