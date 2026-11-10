# Disney e Desenhos no Faixa a Faixa

Curadoria e implementação inicial feitas com o Antigravity CLI, revisadas e verificadas com áudio real.
As duas categorias aparecem a partir da primeira faixa disponível. O restante das categorias mantém
seu mínimo anterior. O menu busca novamente o catálogo quando é aberto.

A fila inicial tem 44 candidatas (22 Disney e 22 desenhos/animes), intercaladas para abastecer os dois
filtros. A gravação é conferida por título, artista e trilha; covers e karaokês são rejeitados. Quando
uma versão oficial em PT-BR não é encontrada, a seleção pode usar uma gravação original em outro idioma.
Uma candidata sem gravação adequada ou sem duas camadas audíveis fica com o erro registrado, e a fila continua.

Fontes pesquisadas, com IDs e links: `listas/disney_desenhos_fontes.json` (playlists e API Deezer).
Cada música adicionada também guarda os links de origem nos seus metadados. O worker procura faixas
já separadas no Chorus Encore para a gravação identificada; se não encontrar, usa o Demucs existente
com duas threads de CPU. Os trechos têm aproximadamente 30 segundos e são codificados em Opus/WebM.

```sh
python3 tools/faixa/disney_desenhos.py status
python3 tools/faixa/disney_desenhos.py iniciar --daemon
python3 tools/faixa/disney_desenhos.py testar
```

`iniciar --daemon` também retoma itens pendentes ou com erro e preserva os já prontos.
`iniciar --uma` processa uma inclusão válida e termina. `preparar` atualiza a seleção e recategoriza
faixas existentes sem duplicá-las; com o worker ativo, preserva a fila em uso.

O processo tem lock exclusivo, prioridade reduzida e aguarda outras gerações do Faixa a Faixa.
O PID está em `/tmp/faixa-disney-desenhos/worker.pid`; o log em `worker.log` e o estado em `status.json`,
na mesma pasta. Enviar SIGTERM ao PID exibido encerra o processo depois da música atual.
A fila retomável fica em `listas/disney_desenhos_fila.json`. “Pronta” inclui músicas existentes
recategorizadas; o campo `recategorizada` distingue essas entradas.

O worker não chama deploy, git commit nem push. Os arquivos e o catálogo são adicionados localmente.
A publicação segue o fluxo normal do projeto.


## Ampliação a partir de playlists

`importa_playlists.py coletar` consulta playlists reais da Deezer, suas páginas de músicas e os álbuns.
As fontes podem ser ampliadas em `listas/disney_desenhos_playlist_catalogo.json`: cada registro informa
`id`, `categoria`, `tipo` e `recurso` (`playlist` ou `album`). O manifesto completo registra título,
link e gravações de cada fonte; álbuns oficiais também podem complementar a descoberta das playlists.
A coleta de 09/11/2026 trouxe 510 entradas de 9 playlists e identificou 303 gravações novas com prévia,
antes da revisão. A curadoria do Antigravity foi revisada e resultou em 60 novas candidatas: 30 por categoria.
Os registros são importados pelo ID da gravação e do artista, com o link exato da playlist; o resolvedor
não troca uma importação por um homônimo encontrado por texto. A seleção exclui repetições de composições
já disponíveis, covers e tributos identificados na revisão. Falhas de áudio continuam registradas por faixa.

Fontes incluem [Disney Hits Brasil](https://www.deezer.com/playlist/7549092142),
[Clássicos Disney](https://www.deezer.com/playlist/11842843521),
[Cartoon Network Songs](https://www.deezer.com/playlist/15845550241), Steven Universe e Hora de Aventura.
O manifesto completo fica em `listas/disney_desenhos_fontes.json`, e a seleção revisada em
`listas/disney_desenhos_playlist_selecao.json`. Playlists de comunidade são usadas para descoberta;
a revisão confere a gravação pelo artista, álbum e gravadora.

```sh
python3 tools/faixa/importa_playlists.py coletar
# Revisar a coleta em /tmp/faixa-playlists/candidatas.ndjson e atualizar o JSON de seleção.
python3 tools/faixa/importa_playlists.py enfileirar
python3 tools/faixa/disney_desenhos.py iniciar --daemon
```

O importador preserva a fila antiga, pula IDs já cadastrados e recusa alterações durante um worker ativo.
O comando `preparar` também preserva as entradas importadas. As novas pendências são processadas antes
das falhas antigas; as duas categorias são abastecidas de forma intercalada. O status distingue pendências
que ainda serão tentadas de falhas já registradas. Esta rotina também não publica automaticamente.

### Ampliação da busca

A busca seguinte reuniu **40 playlists e 36 trilhas oficiais**, com 4.532 entradas e
2.593 gravações candidatas após os filtros iniciais. Candidata não significa música já aprovada
ou processada: a curadoria ainda confere obra, gravação original, relevância e repetições da composição.
As fontes incluem Disney/Pixar, musicais Disney Channel, Cartoon Network, Nickelodeon,
animações DreamWorks e aberturas de anime. Séries animadas Disney ficam em Desenhos; filmes Disney/Pixar
e filmes musicais Disney Channel ficam em Disney.

A coleta usa três consultas simultâneas, cache local das fontes por seis horas e cache de gravadoras
em `/tmp/faixa-playlists/`. Uma falha individual não apaga o manifesto anterior; quando possível,
a fonte é recuperada do cache. IDs de faixas já prontas ou já presentes na fila são excluídos da nova
lista de candidatas. Os dados para revisão e o resumo da coleta ficam nessa mesma pasta.

A curadoria ampliada do Antigravity produziu 362 escolhas. Após revisão, duas saíram
(tributo do Ramones e composição já disponível com Bonnie Tyler): foram importadas **360 novas
candidatas, 223 Disney e 137 desenhos/animes, de 127 obras**, preservando as 104 entradas anteriores.
A seleção acumulada de playlists tem 420 escolhas; a fila também mantém as 44 candidatas manuais
iniciais. O lote novo foi iniciado em segundo plano e entra antes das falhas antigas.

Foram verificados: importação idempotente, exclusão mútua do worker, origem de gravações por ID,
proveniência de álbuns, retomada pelo cache e preservação do manifesto em falha parcial de rede.
O lote anterior de 60 músicas também passou por `ffprobe`: 294 camadas Opus válidas, de cerca de
30 segundos, com pelo menos dois arquivos diferentes em cada música.
