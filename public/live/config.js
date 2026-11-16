/* Configuração da live. Para mudar nome, apelido, rádio ou manchetes, é só aqui. */
export default {
  streamer: 'Kellyson',
  ela: 'amor',                       // como ela aparece no chat, na ligação e nos pix
  fotoCalada: 'assets/ela-calada.webp',
  fotoFalando: 'assets/ela-falando.webp',
  titulo: 'fugindo da polícia desde as 21h',
  jogo: 'GTA VI',
  playlist: 'spotify:playlist:2mHRHKV6tTXCd695InKHHz', // rádio padrão (toca fora da cena do jogo)
  contagem: 5,                       // minutos da contagem do "começando" (dá para mudar no estúdio)
  lancamento: '2026-11-19T00:00',    // contagem da cena "lançamento" (dá para mudar no estúdio)
  lancamentoTexto: 'e a gente vai jogar juntos na hora que liberar',
  valoresPix: [2, 5, 10, 20, 50, 100],
  // de onde vem o dinheiro dela: 'infinito' ou 'tempo' (ganha R$ por minuto assistindo); dá para mudar no estúdio
  carteira: { modo: 'infinito', porMinuto: 1, inicial: 10 },
  meta: { titulo: 'Jantar de sábado', alvo: 200 },
  somPix: '',                        // ex.: 'assets/pix.mp3' (sem arquivo, toca um plim-plim)
  // enquetes prontas (pergunta, opções); dá para escrever outras na hora no estúdio
  enquetes: [
    ['Rouba o banco ou o carro-forte?', 'Banco', 'Carro-forte'],
    ['Foge ou enfrenta a polícia?', 'Foge', 'Enfrenta'],
    ['Qual vai ser a arma agora?', 'Faca', 'Pistola', 'Bazuca'],
    ['Pra onde a gente vai?', 'Praia', 'Centro', 'Pântano', 'Aeroporto'],
    ['Que carro ele rouba?', 'O mais caro', 'O mais feio', 'Uma moto'],
    ['Ele chega vivo na missão?', 'Chega', 'Não chega'],
    ['Música agora?', 'Animada', 'Romântica', 'Brasileira'],
  ],
  // plantão do "volto já"
  manchetes: [
    'Streamer local abandona a live; testemunhas dizem que ele foi até a geladeira',
    'Kellyson promete voltar em "dois minutinhos"; histórico indica quinze',
    'Espectadora número 1 exige explicações; especialistas recomendam um beijo como pedido de desculpas',
    'Pesquisa: 100% do público da live está com saudade do streamer',
    'Carro roubado há dez minutos segue estacionado na porta do streamer',
    'Meteorologia: previsão de chamego forte para o fim da live',
    'Economia: pix de mentira bate recorde histórico na orla',
    'Polícia segue sem pistas do streamer, que jura que "só foi no banheiro"',
    'Exclusivo: a única espectadora da live também é a mais bonita, confirmam fontes',
    'Trânsito: fuga da polícia congestiona a avenida da praia',
    'Cientistas confirmam: live sem a amor no chat não tem graça nenhuma',
    'Streamer é visto procurando o carregador do controle; situação é considerada grave',
  ],
}
