---
name: cineminha-jogos
description: Cria um minijogo multiplayer novo no Cineminha (ou reforma um existente) seguindo a arquitetura dos jogos atuais — host autoritativo P2P, módulo carregado sob demanda, convite, saída de quem cai, troca de host, tutorial visual e identidade própria. Use quando o usuário pedir um jogo novo para jogar na call (inclusive "baseado no jogo X" ou a partir de um PDF de regras); não use para sessões de filme, convites ou para mexer no player.
---

# Criar um jogo no Cineminha

Projeto: `/home/kellyson/projetos/cineminha` (site estático em `public/`, funções em `api/`). Interface e comentários em
português do Brasil, com acentuação correta.

**Antes de tudo, leia `JOGOS.md` na raiz do projeto.** Ele tem o contrato `ctx`, a arquitetura de rede, a integração no
`app.js` e as armadilhas que já aconteceram. O esqueleto pronto está em `modelo.js`, nesta pasta.

## Passo a passo

1. **Entenda as regras.** Se vier um PDF ou link, leia (`pdftotext -layout`). Liste fases, quem age, o que é secreto, como
   se pontua e como termina. Pergunte ao usuário só o que muda o jogo de verdade (regras opcionais, nome, clima visual).
2. **Direitos autorais.** Se for baseado num jogo comercial: implemente a *mecânica*, mas **escreva todo o conteúdo do zero**
   (textos das cartas, perguntas), com **nome e visual próprios**. Não copie cartas de PDFs/imagens, nem a arte, nem o nome,
   mesmo "traduzidos pela comunidade". Diga isso ao usuário em uma frase e siga.
3. **Escolha a chave** curta da mensagem (`xx`), o nome do arquivo (`public/nomedojogo.js` + `.css`) e a pasta de dados
   (`public/jogos/nomedojogo/`, ex.: `cartas.js`).
4. **Copie `modelo.js`** (ou o Par Perfeito, o mais simples) e preencha:
   - estado do host `G`, `comecar()`, as jogadas validadas em `hostRecebe`, o fim de jogo;
   - `vista(k)`: só o que a pessoa `k` pode ver (cartas dos outros escondidas, votos secretos até revelar);
   - eventos `ev({ t: ... })` para cada coisa que merece animação/som;
   - `remove(key)` devolvendo as cartas de quem saiu e ajeitando a vez.
5. **Integre no `app.js`** (registro `JOGOS`, roteamento da mensagem, variável, `entrouAlguem`, item no `menuJogos` com
   ícone SVG em `ICONES_JOGO`, restauração `xx.G`) e no **`style.css`** (ícone do menu e `.xx-on` no seletor que esconde a
   fileira de poltronas). Tudo descrito em `JOGOS.md`.
6. **Design.** Identidade própria, legível, usando a tela inteira do cinema. Página inicial com tutorial visual animado
   (2–3 quadros, quase sem texto). Cartas em pé, como cartas de verdade. Animações curtas (embaralhar, voar do monte para a
   mão, revelar). Sons reais e baixos de `jogos/coup/sons/`. Medidas em `cqh`/`cqw`. Fontes do jogo só no registro `JOGOS`.
   Se a skill `frontend-design` estiver disponível, use-a para a direção visual.
7. **Teste de verdade** (detalhes em `JOGOS.md`): sala `?sala=teste-xx-<timestamp>`, API interceptada no Playwright,
   3–4 navegadores, rodadas completas até o fim, saída de um jogador e queda do host. **Olhe os screenshots.**
   `node --check` em todo JS alterado.
8. **Não publique** sem o usuário pedir. Publicar é `./deploy.sh` (todos na sala recarregam).

## Checklist antes de entregar

- [ ] Nenhuma intenção usa um campo chamado `id` (use `carta`, `alvo`…).
- [ ] Wrapper `el` local para `data-*`; classes e variáveis CSS com prefixo/nomes próprios (`xx-…`, nada de `--r`).
- [ ] Nada do jogo carrega antes de abrir; assets grandes só quando usados.
- [ ] Convite com bilhete; quem entra depois recebe a vista; quem cai sai em ~12 s com aviso; o sucessor assume se o host cair.
- [ ] Texto das cartas/perguntas original; nome e visual próprios; créditos de assets de terceiros em `CREDITOS.txt`.
- [ ] Screenshots conferidos: sem sobreposição, legível fora e dentro da tela cheia, poltronas não cobrindo nada.
- [ ] Atualize a tabela de jogos no `JOGOS.md`.
