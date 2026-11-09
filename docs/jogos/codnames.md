# Codnames

Jogo de dicas em dois times (antes "Agentes de Boteco"). Módulo `public/agentes.js` e chave P2P `ag`
mantidos para restaurar partidas. Interface, desenhos e palavras são do Cineminha. Os efeitos originais
do Codenames Online foram reaplicados a pedido do usuário, com origem e créditos preservados.

## Fluxo

- Lobby: Azul à esquerda, Vermelho à direita. Cada um senta como chefe ou entra como agente; o anfitrião
  pode sortear times e chefes, escolher os baralhos (caixas 3D, dá para misturar) e ligar o relógio
  (3 min a dica, 90 s o palpite).
- Faixa no alto do tabuleiro diz sempre de quem é a vez e o que fazer ("Sua vez" com destaque).
- Chefe: toca nas próprias cartas para marcar o que a dica liga (só ele vê); o número acompanha as marcas,
  mas dá para ajustar com − / + ou escolher ∞. A palavra precisa ser uma só e não pode estar na mesa.
- Dica nova aparece num anúncio grande e fica na lousa embaixo, com os palpites restantes.
- Agentes: um clique sugere (pino com o rosto), clique duplo (ou Enter) abre. Acerto continua; cliente
  ou carta do outro time passa a vez; o X9 (carta preta) perde na hora.
- Laterais: quantos faltam (tampinhas), chefe, agentes e o histórico de dicas com as cartas abertas em cada
  uma. O chefe vê ✓ nas que eram as pensadas. O botão de lista no topo abre o registro completo.
- Fim: cartão do vencedor com o placar da call; "Ver o mapa" mostra todas as cores.

## Visual

- `localStorage ag.skin`: `noir` (Escritório, padrão: persiana, luz dos times, tampo de couro) ou `bar`
  (calçada do Marcílio Bar + tampo da mesa de bar). Só muda para quem escolhe.
- Cartas: comanda de papel; verso com o agente de chapéu (time), a caneca (cliente) ou o X9.
- Sons: `jogos/codnames/sons/efeitos.mp3`; um sprite carregado na primeira reprodução,
  pelo mixer do Cineminha. Seleção, dica, suspense, resultado, cobertura, troca de vez e
  vitória/derrota usam seus efeitos correspondentes. A identidade toca aos 1.180 ms e a
  cobertura acompanha o pouso da animação de 2.100 ms. Fechar ou reiniciar cancela os sons pendentes.
  Catálogo e origem: [codnames-sons.md](codnames-sons.md).

## Baralhos

`public/jogos/codnames/pacotes.js`: "Da Casa" (id `classico`, a lista própria de `jogos/agentes/palavras.js`)
e cinco pacotes de famílias de oito palavras. Misturar divide as 25 cartas entre eles.

## Verificação local

Com o servidor em `localhost:8790`, rode `python3 tools/codnames/teste.py`.
O catálogo confere o hash e os 15 trechos de áudio no Chrome. O teste de sons usa quatro
clientes e cobre seleção, dica, revelação, troca de vez, vitória/derrota e cancelamento
ao fechar. O teste P2P passa pelo menu do Cineminha, joga até o fim e verifica a sucessão
do host. As chamadas de API ficam interceptadas em salas de teste; capturas em `/tmp/codnames/`.
