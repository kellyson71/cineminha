# Sons do Codnames

Pacote preparado a pedido do usuário e integrado ao Codnames, preservando os efeitos dos outros jogos.

- Prévia local: `/jogos/codnames/sons.html`.
- Arquivo original: `public/jogos/codnames/sons/efeitos.mp3` (562.584 bytes).
- Reprodução: `public/jogos/codnames/audio.js`.
- Origem, hash SHA-256 e tempos: `public/jogos/codnames/sons/origem.json`.
- Créditos: `public/jogos/codnames/sons/CREDITOS.txt`.

O site oficial usa um sprite: os 15 efeitos estão em um único MP3. O arquivo foi preservado sem conversão;
o módulo usa os mesmos offsets e durações do mapa público do site. A grafia original `assasin` foi mantida.

## Nomes exatos e momentos de uso

As chaves abaixo são as mesmas do sprite original, sem tradução nem correção de grafia. As descrições foram
conferidas nas chamadas de áudio das telas do site. O nome do efeito sozinho não define o seu gatilho: por exemplo,
`nextRound` toca na troca de vez, e `dealCard` toca na cobertura de uma carta já revelada.

| Chave original | Onde e quando usar | Gatilho no site | Duração |
|---|---|---|---|
| `deal` | Distribuição inicial; 1 s após começar a animação da partida. | `startMatch` | 2,365 s |
| `click` | Configurações: retorno sonoro ao ajustar o volume de efeitos. | `effectsVolume.onValueChange` | 0,2 s |
| `notification` | Aviso de início; 100 ms após começar o carregamento da partida. | `startMatchLoading` | 2 s |
| `click2` | Clique local em botão comum da interface. | `Button.onClick` | 0,11 s |
| `select` | Selecionar uma palavra ou marcar uma sugestão; ainda não confirma o palpite. | seleção da carta / `tipCard` | 0,2 s |
| `dealCard` | Colocar a cobertura sobre a palavra revelada; 100 ms após iniciar essa etapa. | `placeCoverCard` | 0,25 s |
| `nextRound` | Anunciar a passagem da vez ao próximo time. | `nextTeamTurn` / `NextTeamTurnModal` | 1,5 s |
| `sendClue` | Mostrar à mesa a dica aceita, com palavra e número. | `showGiveClue` / `GiveClueModal` | 2,889 s |
| `revealCard` | Destacar e ampliar a carta do palpite confirmado, antes de revelar o resultado. | `highlightGuessedCard` | 1,4 s |
| `wrongGuess` | Resultado de carta não preta sem acerto: neutra ou do outro time. | `revealCard`, `guessResult` falso | 3,447 s |
| `assasin` | Revelar a carta preta; substitui `goodGuess` e `wrongGuess` nessa revelação. | `revealCard`, `cardColor` preto | 3,841 s |
| `win` | Resultado final, para o jogador cujo time venceu. | `showGameover`, `haveTeamWon` verdadeiro | 4,477 s |
| `goodGuess` | Resultado de carta não preta acertada pelo time da vez. | `revealCard`, `guessResult` verdadeiro | 1,2 s |
| `error` | **Reservado: gatilho não confirmado.** Existe no sprite, mas não foi encontrada uma chamada nas telas inspecionadas. | Não confirmado | 2 s |
| `loss` | Resultado final, para o jogador cujo time não venceu; alternativo a `win`. | `showGameover`, `haveTeamWon` falso | 4,144 s |

Os campos `onde`, `quando`, `gatilho` e `confirmado` também estão disponíveis em cada entrada de `EFEITOS`, no
`audio.js`, e aparecem na galeria. Os URLs dos arquivos usados para conferir os gatilhos estão em
`sons/origem.json`, sob `fontesUso`. A única entrada com `confirmado: false` é `error`.

## Reprodução e integração

No módulo do jogo, crie uma instância usando o `ctx` do Cineminha:

```js
import { criaSonsCodnames } from './jogos/codnames/audio.js'

const sons = criaSonsCodnames(ctx)
// Dentro de uma interação ou de um evento novo recebido na partida:
sons.tocar('sendClue').catch(() => {})
sons.tocar('goodGuess', { atraso: 250, volume: .8 }).catch(() => {})
// Ao fechar a mesa:
sons.destruir()
```

O módulo usa `ctx.audioCtx()` e `ctx.saida()`, respeitando o mixer dos jogos. O MP3 só é baixado e decodificado
na primeira reprodução; os efeitos seguintes reutilizam o mesmo buffer. O ganho padrão é 0,3, como no site
original. Não há dependência de Howler, carregamento automático na abertura do Cineminha ou música de fundo.

Os tempos de espera descritos na tabela documentam as animações do site; o reprodutor só espera quando recebe
`atraso`. Para acompanhar o mesmo início de distribuição, use `sons.tocar('deal', { atraso: 1000 })`.
Toque ações compartilhadas uma vez por evento novo da partida, evitando repetir sons a cada renderização.
`click2` e `select` acompanham a interação local. Ao revelar uma carta, use primeiro `revealCard` e, na etapa
que mostra a identidade, apenas um entre `assasin`, `goodGuess` e `wrongGuess`. No fim do jogo, cada jogador
ouve `win` ou `loss` conforme o próprio time.

## Verificação realizada

Hash do MP3 conferido com o original; decodificação no Chrome; 15 trechos dentro dos limites, todos com áudio
e tempos iguais ao mapa do site. Galeria conferida em desktop e celular, com carregamento apenas após clique,
reprodução, parada e descarte da instância sem erros JavaScript.
