# Prompt para o Claude Design

Copie o texto abaixo e anexe as pastas `1-telas-atuais`, `2-assets` e `3-codigo`.

---

Quero redesenhar o visual do **Cineminha**, um site privado onde eu e meus amigos (3 a 6 pessoas) assistimos filmes e jogamos juntos à distância. Uma pessoa (ou várias) transmite a tela ou um arquivo de vídeo; todos conversam por voz, chat e reações. As capturas da versão atual estão em `1-telas-atuais` e o código (HTML + CSS) em `3-codigo`.

**Direção: mais cinema.** Quero sentir que estamos numa sala de cinema pequena e aconchegante, só nossa:
- tela de entrada como um **ingresso** (bilhete destacável) com o nome da sessão, data e o campo de senha + "quem é você";
- **letreiro/marquise** no topo com o nome da sessão (estilo letras de cinema antigo, com lâmpadas), discreto;
- **cortina de veludo** nas laterais da tela; quando ninguém transmite a cortina está fechada e, quando alguém começa, ela abre;
- **luz da sala**: quando o filme está rolando, o resto da página escurece (como as luzes apagando) e volta a acender quando pausa ou para;
- a fileira de baixo com **poltronas de veludo** vistas de trás, com os bonequinhos de cada pessoa sentados (os bonecos estão em `2-assets/avatar*.png`, de costas, com fundo transparente; convidados não têm boneco e aparecem com uma bolinha com a inicial);
- quem está falando ganha um **brilho suave** (como o Discord, nada exagerado); quem está fora fica cinza/transparente; quem está mudo tem um ícone de microfone cortado;
- chat lateral como um **painel escuro de bilheteria/lanchonete**, legível em primeiro lugar.

**Restrições:**
- Escuro, confortável para ver filme no escuro, sem cores berrantes perto da tela. A tela de vídeo é a estrela: nada pode cobrir o vídeo além dos controles que aparecem no hover.
- Ícones Lucide (sem emoji).
- Precisa funcionar em **tela cheia** (vídeo ocupando tudo, chat opcional à direita, poltronas pequenas e semitransparentes no canto inferior esquerdo, barra de controles que some sozinha) e no **celular** (390 px).
- Vários estados para desenhar: ninguém transmitindo; 1 tela; 2–4 telas em grade; uma tela em foco com miniaturas no canto; vídeo pausado; legenda aparecendo; menu "Transmitir" (tela / arquivo / modo jogo / som extra); painel de configurações (sons, voz, microfone, admin); popover de volume de cada pessoa (com botões de admin: mutar, parar tela, tirar da sala); aviso fixo do admin no topo; grade de reações (16 ícones); mini notificações de chat em tela cheia; seletor de GIFs.
- Deve ser possível implementar só com HTML/CSS (sem framework) mantendo as mesmas classes do `3-codigo/index.html`. Idealmente entregue o visual como um **tema** que troca as variáveis do `:root` (cores, fontes, raios) + imagens de decoração (texturas de veludo, cortina, letreiro), como o `tema-halloween.css` faz.

**Entregáveis:** telas desenhadas (desktop e celular) para os estados acima, paleta, fontes (Google Fonts) e as imagens de decoração exportadas (PNG/SVG/WebP com fundo transparente quando fizer sentido).
