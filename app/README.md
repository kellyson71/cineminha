# Cineminha — app desktop (Electron + React)

Entra na **mesma sala** que o site (mesmo protocolo, mesmo servidor). Quem está no site e quem
está no app se veem, conversam, projetam e jogam juntos.

```sh
cd app
npm install
npm run dev        # Vite + Electron com recarga instantânea
npm start          # build de produção e abre
npm run dist       # AppImage, pacman, deb e rpm em release/
npm run dist:win   # instalador e versão portátil do Windows
npm run release    # tudo isso + release no GitHub (precisa de GH_TOKEN)
```

## Como o código é dividido

- `public/core/` — **compartilhado com o site**: protocolo P2P (`rede.js`: Opus estéreo, correção de SDP,
  TURN, id da sala, API, leitura de `hello`/`share`), lista de jogos (`jogos.js`) e planta das
  poltronas (`plateia.js`). O `public/app.js` importa daqui. Mudou o protocolo, muda nos dois.
- `app/src/sala/` — a sala no app: `sala.js` (Trystero + núcleo, estado lido com `useSala`),
  `audio.js` (vozes por pessoa, efeitos, saída dos jogos), `jogos.js` (monta os módulos de jogo
  do site com o mesmo `ctx` que o `app.js` dá a eles).
- `app/src/components/` — a interface em React, com o mesmo `public/style.css` do site.
- `app/electron/` — processo principal: `servidor.js` (protocolo `cine://app/`: serve o app e os
  arquivos do site, encaminha `api/` ao servidor e busca do servidor o que não vem no pacote, como os
  trechos do Faixa a Faixa), `somlinux.js` (som de um programa só), `converter.js` (ffmpeg).

## O que o app faz e o site não

- **Tela com som**: Windows pega o som do sistema; no Linux dá para escolher **só um programa**
  (o jogo ou o player) e o som vai sem as vozes da call (PipeWire/PulseAudio, `pactl`).
- **Qualquer filme**: MKV, AC3, DTS, HEVC… o ffmpeg do sistema troca o som para AAC e, só se
  precisar, o vídeo para H.264. A legenda de texto do MKV vai junto para todos.
- **Atalhos de qualquer lugar**: Ctrl+Shift+M muta, Ctrl+Shift+D corta o som, Ctrl+Shift+P mini player.
  Dentro do app, "Aperte para falar" é segurar V.
- **Minimizado continua na call**: sem desaceleração em segundo plano enquanto está na sala;
  fechar a janela manda para a bandeja (mutar, cortar som, mini player, sair).
- **Mini player** sempre por cima, só com a tela.
- **Notificações**: quem entra, quem começa a projetar e quando te marcam (`@nome`), com contador.
- **Não deixa a tela dormir** com filme ou projeção.
- **Convites**: links `cineminha://…` abrem no app; dá também para colar o link do site no lobby.
- **Atualização automática** pelas releases do GitHub (`kellyson71/cineminha`).

## Ainda só no site

Convidar/gerar ingresso, diário de sessões, ferramentas de admin (o app obedece aos comandos de admin),
rádio, "assistir junto" do YouTube, GIFs/figurinhas, memes e soundboard.
