// Dou-lhe Uma: temas dos lotes (escritos para o Cineminha). Cada tema precisa ter respostas de sobra
// para dar briga no leilão: nada de lista com 5 itens possíveis.
// grupo: 'geral' | 'tela' (filmes, séries, desenhos) | 'som' (música) | 'bola' (futebol e esporte) | 'br' (coisas do Brasil)
export const TEMAS = [
  // geral
  ['geral', 'Países da Europa'], ['geral', 'Países da África'], ['geral', 'Capitais do mundo'], ['geral', 'Marcas de carro'],
  ['geral', 'Marcas de roupa'], ['geral', 'Frutas'], ['geral', 'Legumes e verduras'], ['geral', 'Raças de cachorro'],
  ['geral', 'Animais que vivem no mar'], ['geral', 'Animais da savana'], ['geral', 'Insetos'], ['geral', 'Aves'],
  ['geral', 'Profissões'], ['geral', 'Instrumentos musicais'], ['geral', 'Esportes olímpicos'], ['geral', 'Cores'],
  ['geral', 'Partes do corpo humano'], ['geral', 'Coisas que tem numa cozinha'], ['geral', 'Coisas que tem num banheiro'],
  ['geral', 'Sabores de sorvete'], ['geral', 'Sabores de pizza'], ['geral', 'Tipos de queijo'], ['geral', 'Bebidas alcoólicas'],
  ['geral', 'Doces e sobremesas'], ['geral', 'Elementos da tabela periódica'], ['geral', 'Planetas, luas e estrelas'],
  ['geral', 'Línguas faladas no mundo'], ['geral', 'Redes sociais e aplicativos'], ['geral', 'Marcas de celular'],
  ['geral', 'Empresas de tecnologia'], ['geral', 'Super-heróis'], ['geral', 'Vilões famosos'], ['geral', 'Personagens de videogame'],
  ['geral', 'Jogos de videogame'], ['geral', 'Jogos de tabuleiro e cartas'], ['geral', 'Princesas de desenho'],
  ['geral', 'Deuses de qualquer mitologia'], ['geral', 'Signos e coisas de horóscopo'], ['geral', 'Pokémon'],
  ['geral', 'Dinossauros'], ['geral', 'Flores'], ['geral', 'Árvores'], ['geral', 'Pedras preciosas'],
  ['geral', 'Fast-foods e redes de restaurante'], ['geral', 'Marcas de refrigerante e suco'], ['geral', 'Marcas de chocolate e bala'],
  ['geral', 'Coisas que você leva para a praia'], ['geral', 'Coisas redondas'], ['geral', 'Coisas que voam'],
  ['geral', 'Palavras que rimam com "ão"'], ['geral', 'Palavras em inglês que todo mundo usa'], ['geral', 'Meios de transporte'],
  ['geral', 'Bilionários e donos de empresa'], ['geral', 'Presidentes de qualquer país'], ['geral', 'Cientistas e inventores'],
  ['geral', 'Pintores e artistas plásticos'], ['geral', 'Escritores'], ['geral', 'Monumentos e pontos turísticos do mundo'],
  ['geral', 'Ilhas'], ['geral', 'Rios'], ['geral', 'Moedas de países'], ['geral', 'Sobrenomes comuns'],
  ['geral', 'Nomes de mulher com A'], ['geral', 'Nomes de homem com J'], ['geral', 'Coisas que custam caro'],

  // tela
  ['tela', 'Filmes da Disney (desenho)'], ['tela', 'Filmes da Pixar'], ['tela', 'Filmes da Marvel'], ['tela', 'Filmes de terror'],
  ['tela', 'Filmes que ganharam Oscar'], ['tela', 'Filmes com mais de uma continuação'], ['tela', 'Filmes brasileiros'],
  ['tela', 'Atores de Hollywood'], ['tela', 'Atrizes de Hollywood'], ['tela', 'Atores e atrizes brasileiros'],
  ['tela', 'Séries da Netflix'], ['tela', 'Séries de comédia'], ['tela', 'Animes'], ['tela', 'Personagens dos Simpsons'],
  ['tela', 'Personagens do Chaves'], ['tela', 'Personagens da Turma da Mônica'], ['tela', 'Personagens de Harry Potter'],
  ['tela', 'Personagens de Star Wars'], ['tela', 'Personagens de Friends'], ['tela', 'Personagens do Bob Esponja'],
  ['tela', 'Desenhos animados dos anos 90 e 2000'], ['tela', 'Novelas da Globo'], ['tela', 'Vilões de novela'],
  ['tela', 'Apresentadores de TV'], ['tela', 'Programas de TV brasileiros'], ['tela', 'Participantes do Big Brother Brasil'],
  ['tela', 'Diretores de cinema'], ['tela', 'Filmes do Adam Sandler ou do Jim Carrey'], ['tela', 'Filmes de super-herói da DC'],
  ['tela', 'Youtubers e streamers brasileiros'], ['tela', 'Filmes com animais falantes'], ['tela', 'Sagas de filmes'],

  // som
  ['som', 'Músicas da Anitta'], ['som', 'Músicas da Legião Urbana'], ['som', 'Músicas do Charlie Brown Jr.'],
  ['som', 'Músicas dos Mamonas Assassinas'], ['som', 'Músicas do Michael Jackson'], ['som', 'Músicas da Taylor Swift'],
  ['som', 'Músicas dos Beatles'], ['som', 'Músicas do Queen'], ['som', 'Músicas da Ivete Sangalo'], ['som', 'Músicas do Roberto Carlos'],
  ['som', 'Cantores de sertanejo'], ['som', 'Duplas sertanejas'], ['som', 'Cantores e bandas de rock nacional'],
  ['som', 'Bandas de rock gringas'], ['som', 'Cantoras pop gringas'], ['som', 'Rappers brasileiros'], ['som', 'Rappers gringos'],
  ['som', 'Cantores de MPB'], ['som', 'Cantores de funk'], ['som', 'Músicas de Carnaval'], ['som', 'Bandas de pagode'],
  ['som', 'Músicas com nome de mulher'], ['som', 'Músicas com "amor" no nome'], ['som', 'Músicas de abertura de desenho ou novela'],
  ['som', 'Grupos de K-pop'], ['som', 'Músicas de festa junina'], ['som', 'Cantores que já morreram'],

  // bola
  ['bola', 'Jogadores do Flamengo'], ['bola', 'Jogadores do Corinthians'], ['bola', 'Jogadores do Palmeiras'],
  ['bola', 'Jogadores do São Paulo'], ['bola', 'Jogadores da seleção brasileira'], ['bola', 'Jogadores do Real Madrid'],
  ['bola', 'Jogadores do Barcelona'], ['bola', 'Jogadores que ganharam a Bola de Ouro'], ['bola', 'Times do Brasileirão'],
  ['bola', 'Times da Europa'], ['bola', 'Seleções campeãs ou finalistas de Copa'], ['bola', 'Goleiros famosos'],
  ['bola', 'Técnicos de futebol'], ['bola', 'Estádios de futebol'], ['bola', 'Pilotos de Fórmula 1'], ['bola', 'Lutadores de UFC'],
  ['bola', 'Jogadores de basquete'], ['bola', 'Tenistas'], ['bola', 'Atletas olímpicos brasileiros'], ['bola', 'Camisas 10 famosos'],

  // br
  ['br', 'Capitais do Brasil'], ['br', 'Estados do Brasil'], ['br', 'Cidades de São Paulo'], ['br', 'Cidades do Nordeste'],
  ['br', 'Praias brasileiras'], ['br', 'Comidas típicas brasileiras'], ['br', 'Marcas brasileiras'], ['br', 'Bairros do Rio de Janeiro'],
  ['br', 'Gírias brasileiras'], ['br', 'Memes brasileiros'], ['br', 'Presidentes do Brasil'], ['br', 'Políticos brasileiros'],
  ['br', 'Lojas e supermercados'], ['br', 'Bancos que existem no Brasil'], ['br', 'Salgados de festa'], ['br', 'Biscoitos e salgadinhos'],
  ['br', 'Festas e feriados brasileiros'], ['br', 'Personagens do folclore'], ['br', 'Times de futebol do Nordeste'],
  ['br', 'Pratos de padaria'], ['br', 'Comidas de festa junina'], ['br', 'Influenciadores brasileiros'],
]

export const GRUPOS = { geral: 'Geral', tela: 'Filmes e TV', som: 'Música', bola: 'Esporte', br: 'Brasil' }
