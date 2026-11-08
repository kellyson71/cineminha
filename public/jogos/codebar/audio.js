// Recortes do sprite de áudio público do Codenames Online, nos mesmos pontos usados pelo site.
// Origem e hash do arquivo em sons/origem.json; carregamento só na primeira reprodução.
export const EFEITOS = {
  deal: { nome: 'Distribuir cartas', inicio: 0, duracao: 2.365,
    onde: 'Partida · distribuição inicial', quando: 'Durante a animação de início da partida, 1 segundo após startMatch.', gatilho: 'startMatch', confirmado: true },
  click: { nome: 'Teste de volume', inicio: 3, duracao: .2,
    onde: 'Configurações · volume de efeitos', quando: 'Ao ajustar o volume dos efeitos, para ouvir o nível escolhido.', gatilho: 'effectsVolume.onValueChange', confirmado: true },
  notification: { nome: 'Aviso de início', inicio: 4, duracao: 2,
    onde: 'Partida · preparação inicial', quando: '100 ms após começar o carregamento da partida.', gatilho: 'startMatchLoading', confirmado: true },
  click2: { nome: 'Clique em botão', inicio: 6, duracao: .11,
    onde: 'Interface · botões', quando: 'No clique local dos botões comuns, junto da ação do botão.', gatilho: 'Button.onClick', confirmado: true },
  select: { nome: 'Selecionar carta', inicio: 6.5, duracao: .2,
    onde: 'Tabuleiro · seleção e sugestão', quando: 'Ao selecionar uma palavra ou marcar uma sugestão de palpite. Não confirma nem revela a carta.', gatilho: 'card.onClick / tipCard', confirmado: true },
  dealCard: { nome: 'Cobrir carta revelada', inicio: 7, duracao: .25,
    onde: 'Tabuleiro · carta de cobertura', quando: '100 ms após começar a colocação da cobertura sobre a palavra revelada.', gatilho: 'placeCoverCard', confirmado: true },
  nextRound: { nome: 'Trocar a vez do time', inicio: 8, duracao: 1.5,
    onde: 'Partida · anúncio da próxima vez', quando: 'Ao abrir o anúncio de que a vez passou ao próximo time; não ao iniciar uma nova partida.', gatilho: 'nextTeamTurn / NextTeamTurnModal', confirmado: true },
  sendClue: { nome: 'Anunciar dica', inicio: 11, duracao: 2.889,
    onde: 'Partida · anúncio da dica enviada', quando: 'Ao mostrar a dica aceita, com a palavra e o número, no anúncio para a mesa.', gatilho: 'showGiveClue / GiveClueModal', confirmado: true },
  revealCard: { nome: 'Começar a revelação', inicio: 14, duracao: 1.4,
    onde: 'Tabuleiro · suspense do palpite confirmado', quando: 'Ao destacar e ampliar a carta do palpite confirmado, antes de mostrar o resultado.', gatilho: 'highlightGuessedCard', confirmado: true },
  wrongGuess: { nome: 'Palpite errado', inicio: 18, duracao: 3.447,
    onde: 'Tabuleiro · resultado da revelação', quando: 'Ao revelar uma carta não preta cujo palpite não foi um acerto: neutra ou do outro time.', gatilho: 'revealCard: cardColor != black e guessResult falso', confirmado: true },
  assasin: { nome: 'Assassino', inicio: 22, duracao: 3.841,
    onde: 'Tabuleiro · resultado da revelação', quando: 'Ao revelar a carta preta. Substitui o som de acerto ou de palpite errado nessa revelação.', gatilho: 'revealCard: cardColor == black', confirmado: true },
  win: { nome: 'Vitória', inicio: 26, duracao: 4.477,
    onde: 'Fim de jogo · perspectiva do jogador', quando: 'Ao abrir o resultado final para quem venceu. Escolhido conforme haveTeamWon.', gatilho: 'showGameover / haveTeamWon verdadeiro', confirmado: true },
  goodGuess: { nome: 'Acerto', inicio: 30.5, duracao: 1.2,
    onde: 'Tabuleiro · resultado da revelação', quando: 'Ao revelar uma carta não preta cujo palpite foi um acerto para o time da vez.', gatilho: 'revealCard: cardColor != black e guessResult verdadeiro', confirmado: true },
  error: { nome: 'Erro · uso não confirmado', inicio: 32, duracao: 2,
    onde: 'Catálogo de áudio', quando: 'Existe no sprite original, mas não foi encontrada uma chamada no código das telas inspecionadas. Reservado; não atribuir um gatilho como se fosse original.', gatilho: null, confirmado: false },
  loss: { nome: 'Derrota', inicio: 34.5, duracao: 4.144,
    onde: 'Fim de jogo · perspectiva do jogador', quando: 'Ao abrir o resultado final para quem não venceu. Alternativo a win, conforme haveTeamWon.', gatilho: 'showGameover / haveTeamWon falso', confirmado: true },
}

const ARQUIVO = new URL('./sons/efeitos.mp3', import.meta.url)

// Usa o AudioContext e a saída do mixer dos jogos do Cineminha; não cria outro canal de áudio.
export function criaSonsCodebar(ctx) {
  let carregando = null, fechado = false
  const ativos = new Set(), cancelamento = new AbortController()
  const carrega = ac => carregando ||= fetch(ARQUIVO, { signal: cancelamento.signal })
    .then(r => { if (!r.ok) throw new Error(`Áudio do Codebar: HTTP ${r.status}`); return r.arrayBuffer() })
    .then(b => ac.decodeAudioData(b))
    .catch(e => { carregando = null; throw e })

  async function tocar(nome, { atraso = 0, volume = 1 } = {}) {
    const efeito = EFEITOS[nome]
    if (!efeito) throw new RangeError(`Efeito desconhecido: ${nome}`)
    if (fechado) return null
    const ac = ctx.audioCtx(), quando = ac.currentTime + Math.max(0, atraso) / 1000
    if (ac.state === 'suspended') await ac.resume()
    let buffer
    try { buffer = await carrega(ac) } catch (e) { if (fechado) return null; throw e }
    if (fechado) return null
    const som = ac.createBufferSource(), ganho = ac.createGain()
    som.buffer = buffer
    ganho.gain.value = .3 * Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1))
    som.connect(ganho).connect(ctx.saida())
    ativos.add(som)
    som.addEventListener('ended', () => { ativos.delete(som); som.disconnect(); ganho.disconnect() }, { once: true })
    som.start(Math.max(ac.currentTime, quando), efeito.inicio, efeito.duracao)
    return som
  }
  function parar() { for (const som of ativos) { try { som.stop() } catch {} } }
  return { tocar, parar, destruir() { fechado = true; cancelamento.abort(); parar() } }
}
