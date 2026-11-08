# Dobro: cartas originais e custo no navegador

O jogo passou de **Dobradinha** para **Dobro** na interface, nos convites, no chat, no menu e na documentação ativa. Os identificadores `db`, `db.G`, `criaDobradinha` e os nomes dos módulos foram preservados para manter partidas salvas e o protocolo de rede existentes.

As cartas vêm da cópia local de [Dobro (EN/PT-BR), mod 3366858020](https://steamcommunity.com/sharedfiles/filedetails/?id=3366858020), baixada em 03/11/2026. Originais, BSON, JSON e registros de download continuam em `~/Downloads/Dobro (EN PT-BR) - 3366858020/`. A capa original foi extraída da imagem da primeira página do manual incluído no pacote. Créditos completos em [CREDITOS.txt](../../public/jogos/dobro/CREDITOS.txt).

## Escolha aplicada

Um atlas de **18 artes únicas**, com **224 × 311 px por carta**, em **6 colunas × 3 linhas**. Ele contém os números 2–12, Curinga, Passa, Inverte, verso, Esquecido e os dois sentidos. As cópias repetidas do baralho usam a mesma região da textura. A quantidade e as regras das cartas não mudaram.

O CSS usa `image-set`: AVIF quando suportado e WebP como alternativa. O navegador baixa **um** atlas, compartilhado por todas as cartas. O atlas só é solicitado ao abrir o jogo; o menu usa uma miniatura separada de 4,5 KiB. A carta de Curinga na mesa conserva um marcador de valor escolhido por cima da arte. A carta Esquecido substitui a antiga representação de guarda-chuva, e a carta de sentido mostra a face correspondente à direção atual.

AVIF foi escolhido por preservar as ilustrações e a textura das imagens originais com o menor download entre as opções de qualidade visual conferida. No teste, teve PSNR ligeiramente melhor que WebP Q82 com 28,5% menos bytes. WebP decodificou alguns milissegundos mais rápido; essa etapa ocorre uma vez por atlas.

## Medições em 08/11/2026

Chromium **156.0.8078.47**, headless, mesma máquina, sete amostras por alternativa. A montagem usa 57 cartas de **120 × 166,6 px**, incluindo repetição das mesmas artes. Arquivos locais, sem latência ou limitação artificial de rede.

| Alternativa | Download¹ | Decodificar, mediana | Montar/desenhar 57 cartas² | Elementos DOM | PSNR³ |
|---|---:|---:|---:|---:|---:|
| WebP 160 px, Q82 | 53,0 KiB | 19,1 ms | 4,0 ms | 57 | 32,17 dB |
| WebP 224 px, Q72 | 57,6 KiB | 24,0 ms | 3,7 ms | 57 | 34,67 dB |
| WebP 224 px, Q82 (fallback) | 76,7 KiB | 28,2 ms | 3,7 ms | 57 | 35,75 dB |
| WebP 256 px, Q82 | 88,6 KiB | 33,7 ms | 3,2 ms | 57 | 36,47 dB |
| WebP 320 px, Q82 | 113,4 KiB | 47,8 ms | 2,9 ms | 57 | 38,20 dB |
| **AVIF 224 px, Q55 (aplicado)** | **54,9 KiB** | **32,9 ms** | **3,0 ms** | **57** | **36,03 dB** |
| AVIF 224 px, Q70 | 83,2 KiB | 30,3 ms | 3,0 ms | 57 | 36,89 dB |
| SVG vetorizado, 12 cores | 409,3 KiB gzip | 89,2 ms | 122,9 ms | 855 | 24,13 dB |

¹ Tamanho real do arquivo; gzip estimado no SVG. Os cinco arquivos originais das cartas somam **2.663.582 bytes**. O atlas AVIF tem **56.195 bytes**, redução de **97,9%** frente a esse conjunto. O original de 4.096 × 3.416 das frentes também contém cópias repetidas: só ele tem 882.056 bytes. Céu 3D, manuais e arquivos do mod não são baixados pelo jogo.

² Tempo de CPU do main thread por `Performance.getMetrics().TaskDuration`, com duas passagens de `requestAnimationFrame` para incluir a renderização. Não é latência de rede, FPS, tempo de GPU ou consumo de bateria. A versão de imagens usa fundos CSS compartilhados; a versão vetorial usa SVG inline por carta. Pequenas diferenças entre versões raster estão na faixa de poucos milissegundos e não justificam escolher uma resolução maior.

³ PSNR medido no canvas contra um contato PNG das imagens originais redimensionadas para 224 px. Ajuda a comparar compressão e perda de detalhes; não substitui a inspeção visual. Os números pequenos, rostos, mãos, cartas auxiliares e verso foram conferidos em capturas.

A textura de 1.344 × 933 corresponde a **4,78 MiB em RGBA** (`largura × altura × 4`), compartilhada pelo baralho. Essa é uma estimativa da superfície decodificada, não uma medição da memória total do processo ou da GPU. Subir para 320 px aumenta essa estimativa para 9,76 MiB e o download para 113,4 KiB em WebP Q82.

### Limite da comparação com reprodução em código

O SVG comparado é uma **vetorização automática das mesmas imagens**, com quantização em 12 cores e contornos Potrace suavizados. Não é um redesenho manual otimizado. Ele ficou maior e preservou menos detalhes. Um desenho manual em CSS/SVG, com componentes compartilhados, poderia baixar menos bytes, mas a sua fidelidade e seu custo não foram medidos aqui. O tema antigo de azulejos também não representa as ilustrações do Dobro. A escolha aplicada prioriza as artes originais com custo pequeno e conhecido.

## Reproduzir

Dependências: Python com Pillow e codecs AVIF/WebP, Potrace, Poppler (`pdfimages`), Playwright e Chrome. O benchmark não usa APIs nem grava dados em salas.

```bash
python tools/dobro/prepara.py \
  --origem "$HOME/Downloads/Dobro (EN PT-BR) - 3366858020" \
  --saida /tmp/cineminha-dobro --aplicar

# Com o servidor local em http://localhost:8790:
python tools/dobro/benchmark.py --saida /tmp/cineminha-dobro
```

`prepara.py` gera todas as alternativas, a referência PNG, a vetorização e hashes SHA-256 das fontes. `--aplicar` copia apenas os formatos escolhidos, a capa, a marca e a miniatura para `public/jogos/dobro/`. As demais alternativas ficam em `/tmp`, fora do deploy. [Resultados medidos](dobro-benchmark.json).

## Verificação funcional

A galeria com as 18 artes foi conferida no Chrome. O carregamento normal solicitou apenas `cartas.avif`. Ao simular AVIF não suportado na seleção de tipos, o navegador solicitou apenas `cartas.webp`. Os recortes e as posições das 18 artes passaram nas duas versões.

Também passou uma rodada completa de **68 turnos com 4 participantes**, usando o baralho embaralhado e ações pela interface, por P2P. Verificados: oito passos do tutorial e treino interativo, reposição após jogar, resultado, uma única solicitação AVIF por navegador, ausência de carregamento do atlas antes de abrir o jogo, saída de participante e sucessão do anfitrião. Capturas conferidas em tela normal, tela cheia e viewport de 800 × 650. Sem erros de JavaScript. APIs interceptadas em sala `teste-db-assets-*`, sem escrever no banco da sala.

Teste adicional com 2 jogadores: Inverte ausente do baralho e carta de sentido oculta, conforme o manual. Um Curinga jogado como 7 sobre o valor 7 resultou em 14, preservando o marcador visível `= 7` e o rótulo acessível.
