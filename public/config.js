/* Configuração da sessão. Para uma sessão nova, normalmente só muda este arquivo.
   Senhas ficam como hash SHA-256 (gere com: node tools/hash.mjs "senha"). */
export default {
  nome: 'Cineminha',
  subtitulo: '',          // ex.: o nome do filme da noite
  logo: '',               // imagem opcional no topo (ex.: 'themes/halloween/logo.png')
  tema: '',               // '' = padrão escuro; 'halloween' = jornal recortado. Também dá para testar com ?tema=halloween
  appId: 'cineminha-2026',
  senhaHash: 'a3d6152d4e74eaf7f54fa54cb48888c023c5650a992a32ead8cc1481ee4dee05', // "cineminha"
  senhaAberta: 'cineminha', // entrada sem senha: o site usa esta (vazio = volta a pedir a senha na entrada)
  adminHash: 'd8f92ee6a6cbc42e122fa7a4fe7794a870241e68678674627b5794813dff519a', // sha256("admin:" + senha de admin)
  giphyKey: '0yM0aIY5iVZWPygyynVoZcQAZPQ3oPv0',
  convidados: true,       // permite entrar digitando um nome

  // Pessoas fixas. "boneco" é a arte que aparece na fileira; sem ele, aparece a foto.
  // "poses" (opcional): pasta com base, palmas1, palmas2, celular, colo, dormindo e pipoca (.webp, mesmo tamanho).
  // "cartas" (opcional): poses na cadeira de bar para os jogos de carta (poucas, muitas, uma, dormindo, pensando, joga).
  pessoas: [
    { id: 'otavio', nome: 'Otávio', foto: 'assets/pfp1.png', boneco: 'assets/avatar1.png', cor: '#86aef0', poses: 'assets/poses/otavio/', cartas: 'assets/poses/otavio/cartas/' },
    { id: 'milenny', nome: 'Milenny', foto: 'assets/pfp2.png', boneco: 'assets/avatar2.png', cor: '#e58ad6', poses: 'assets/poses/milenny/' },
    { id: 'kellyson', nome: 'Kellyson', foto: 'assets/pfp3.png', boneco: 'assets/avatar3.png', cor: '#f3a064', poses: 'assets/poses/kellyson/', cartas: 'assets/poses/kellyson/cartas/' },
    { id: 'jeyce', nome: 'Jeyce', foto: 'assets/pfp-jeyce.png', boneco: 'assets/avatar-jeyce.png', cor: '#d79be6', poses: 'assets/poses/jeyce/', cartas: 'assets/poses/jeyce/cartas/' },
    { id: 'kauan', nome: 'Kauan', foto: 'assets/pfp-kauan.png', boneco: 'assets/avatar-kauan.png', cor: '#e3ad4a', poses: 'assets/poses/kauan/' },
    { id: 'luiz', nome: 'Luiz', foto: 'assets/pfp-luiz.png', boneco: 'assets/avatar-luiz.png', cor: '#7cc7e8', poses: 'assets/poses/luiz/' },
    { id: 'pedro', nome: 'Pedro', foto: 'assets/pfp-pedro.png', boneco: 'assets/avatar-pedro.png', cor: '#6fdcb0', poses: 'assets/poses/pedro/' },
    { id: 'gabi', nome: 'Gabi', foto: 'assets/pfp-gabi.png', boneco: 'assets/avatar-gabi.png', cor: '#a3a8f5', poses: 'assets/poses/gabi/', cartas: 'assets/poses/gabi/cartas/' },
    { id: 'meris', nome: 'Meris', foto: 'assets/pfp-meris.png', boneco: 'assets/avatar-meris.png', cor: '#f0a8df', poses: 'assets/poses/meris/' },
    { id: 'rodrigues', nome: 'Rodrigues', foto: 'assets/pfp-rodrigues.png', boneco: 'assets/avatar-rodrigues.png', cor: '#8fb4e0', poses: 'assets/poses/rodrigues/' },
    { id: 'matheus', nome: 'Matheus', foto: 'assets/pfp-matheus.png', boneco: 'assets/avatar-matheus.png', cor: '#9fd98a', poses: 'assets/poses/matheus/' },
    { id: 'vitoria', nome: 'Vitória', foto: 'assets/pfp-vitoria.png', boneco: 'assets/avatar-vitoria.png', cor: '#5cc9c9', poses: 'assets/poses/vitoria/' },
  ],
  // Arte de quem entra como convidado (sem perfil) e da poltrona vazia
  convidado: { foto: 'assets/pfp-convidado.png', boneco: 'assets/avatar-convidado.png', poses: 'assets/poses/convidado/' },
  poltronaVazia: 'assets/poltrona-vazia.png',

  sons: {
    euEntrei: 'sounds/eu-entrei.mp3',
    euSai: 'sounds/eu-sai.mp3',
    entrou: 'sounds/entrou.mp3',
    saiu: 'sounds/saiu.mp3',
    mutar: 'sounds/mute.mp3',
    desmutar: 'sounds/mute.mp3',
    telaOn: 'sounds/tela-on.mp3',
    telaOff: 'sounds/tela-off.mp3',
    chat: 'sounds/chat.mp3',
    palmas: 'sounds/palmas.mp3', // aplauso (CC0, sandermotions/Freesound via Wikimedia Commons)
  },

  // Reações (ícones Lucide). Os temas podem trocar a lista.
  reacoes: null,
}
