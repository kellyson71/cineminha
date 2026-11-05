// Dou-lhe Uma: temas dos lotes (escritos para o Cineminha). Cada tema precisa ter respostas de sobra
// para dar briga no leilão: nada de lista com 5 itens possíveis.
// grupo: 'geral' | 'tela' (filmes, séries, desenhos) | 'som' (música) | 'bola' (futebol e esporte) | 'br' (coisas do Brasil)
// nível: 1 fácil (todo mundo cita fácil), 2 médio, 3 difícil (pede conhecimento específico)
export const TEMAS = [
  // geral
  ['geral', 'Países da Europa', 2], ['geral', 'Países da África', 3], ['geral', 'Capitais do mundo', 3], ['geral', 'Marcas de carro', 1],
  ['geral', 'Marcas de roupa', 2], ['geral', 'Frutas', 1], ['geral', 'Legumes e verduras', 1], ['geral', 'Raças de cachorro', 2],
  ['geral', 'Animais que vivem no mar', 1], ['geral', 'Animais da savana', 1], ['geral', 'Insetos', 2], ['geral', 'Aves', 2],
  ['geral', 'Profissões', 1], ['geral', 'Instrumentos musicais', 2], ['geral', 'Esportes olímpicos', 2], ['geral', 'Cores', 1],
  ['geral', 'Partes do corpo humano', 1], ['geral', 'Coisas que tem numa cozinha', 1], ['geral', 'Coisas que tem num banheiro', 1],
  ['geral', 'Sabores de sorvete', 1], ['geral', 'Sabores de pizza', 1], ['geral', 'Tipos de queijo', 2], ['geral', 'Bebidas alcoólicas', 2],
  ['geral', 'Doces e sobremesas', 1], ['geral', 'Elementos da tabela periódica', 3], ['geral', 'Planetas, luas e estrelas', 3],
  ['geral', 'Línguas faladas no mundo', 3], ['geral', 'Redes sociais e aplicativos', 1], ['geral', 'Marcas de celular', 2],
  ['geral', 'Empresas de tecnologia', 2], ['geral', 'Super-heróis', 1], ['geral', 'Vilões famosos', 2], ['geral', 'Personagens de videogame', 2],
  ['geral', 'Jogos de videogame', 2], ['geral', 'Jogos de tabuleiro e cartas', 2], ['geral', 'Princesas de desenho', 2],
  ['geral', 'Deuses de qualquer mitologia', 3], ['geral', 'Signos e coisas de horóscopo', 3], ['geral', 'Pokémon', 3],
  ['geral', 'Dinossauros', 3], ['geral', 'Flores', 2], ['geral', 'Árvores', 3], ['geral', 'Pedras preciosas', 3],
  ['geral', 'Fast-foods e redes de restaurante', 2], ['geral', 'Marcas de refrigerante e suco', 1], ['geral', 'Marcas de chocolate e bala', 1],
  ['geral', 'Coisas que você leva para a praia', 1], ['geral', 'Coisas redondas', 2], ['geral', 'Coisas que voam', 1],
  ['geral', 'Palavras que rimam com "ão"', 3], ['geral', 'Palavras em inglês que todo mundo usa', 2], ['geral', 'Meios de transporte', 1],
  ['geral', 'Bilionários e donos de empresa', 3], ['geral', 'Presidentes de qualquer país', 3], ['geral', 'Cientistas e inventores', 3],
  ['geral', 'Pintores e artistas plásticos', 3], ['geral', 'Escritores', 3], ['geral', 'Monumentos e pontos turísticos do mundo', 2],
  ['geral', 'Ilhas', 3], ['geral', 'Rios', 3], ['geral', 'Moedas de países', 3], ['geral', 'Sobrenomes comuns', 2],
  ['geral', 'Nomes de mulher com A', 1], ['geral', 'Nomes de homem com J', 1], ['geral', 'Coisas que custam caro', 2],

  // tela
  ['tela', 'Filmes da Disney (desenho)', 1], ['tela', 'Filmes da Pixar', 2], ['tela', 'Filmes da Marvel', 2], ['tela', 'Filmes de terror', 2],
  ['tela', 'Filmes que ganharam Oscar', 3], ['tela', 'Filmes com mais de uma continuação', 2], ['tela', 'Filmes brasileiros', 2],
  ['tela', 'Atores de Hollywood', 2], ['tela', 'Atrizes de Hollywood', 2], ['tela', 'Atores e atrizes brasileiros', 2],
  ['tela', 'Séries da Netflix', 2], ['tela', 'Séries de comédia', 2], ['tela', 'Animes', 2], ['tela', 'Personagens dos Simpsons', 3],
  ['tela', 'Personagens do Chaves', 2], ['tela', 'Personagens da Turma da Mônica', 2], ['tela', 'Personagens de Harry Potter', 2],
  ['tela', 'Personagens de Star Wars', 3], ['tela', 'Personagens de Friends', 3], ['tela', 'Personagens do Bob Esponja', 2],
  ['tela', 'Desenhos animados dos anos 90 e 2000', 2], ['tela', 'Novelas da Globo', 2], ['tela', 'Vilões de novela', 3],
  ['tela', 'Apresentadores de TV', 2], ['tela', 'Programas de TV brasileiros', 2], ['tela', 'Participantes do Big Brother Brasil', 3],
  ['tela', 'Diretores de cinema', 3], ['tela', 'Filmes do Adam Sandler ou do Jim Carrey', 3], ['tela', 'Filmes de super-herói da DC', 2],
  ['tela', 'Youtubers e streamers brasileiros', 2], ['tela', 'Filmes com animais falantes', 2], ['tela', 'Sagas de filmes', 2],

  // som
  ['som', 'Músicas da Anitta', 2], ['som', 'Músicas da Legião Urbana', 3], ['som', 'Músicas do Charlie Brown Jr.', 3],
  ['som', 'Músicas dos Mamonas Assassinas', 3], ['som', 'Músicas do Michael Jackson', 3], ['som', 'Músicas da Taylor Swift', 3],
  ['som', 'Músicas dos Beatles', 3], ['som', 'Músicas do Queen', 3], ['som', 'Músicas da Ivete Sangalo', 2], ['som', 'Músicas do Roberto Carlos', 3],
  ['som', 'Cantores de sertanejo', 2], ['som', 'Duplas sertanejas', 2], ['som', 'Cantores e bandas de rock nacional', 2],
  ['som', 'Bandas de rock gringas', 2], ['som', 'Cantoras pop gringas', 2], ['som', 'Rappers brasileiros', 2], ['som', 'Rappers gringos', 3],
  ['som', 'Cantores de MPB', 2], ['som', 'Cantores de funk', 2], ['som', 'Músicas de Carnaval', 2], ['som', 'Bandas de pagode', 2],
  ['som', 'Músicas com nome de mulher', 2], ['som', 'Músicas com "amor" no nome', 2], ['som', 'Músicas de abertura de desenho ou novela', 2],
  ['som', 'Grupos de K-pop', 3], ['som', 'Músicas de festa junina', 2], ['som', 'Cantores que já morreram', 3],

  // bola
  ['bola', 'Jogadores do Flamengo', 2], ['bola', 'Jogadores do Corinthians', 2], ['bola', 'Jogadores do Palmeiras', 2],
  ['bola', 'Jogadores do São Paulo', 2], ['bola', 'Jogadores da seleção brasileira', 2], ['bola', 'Jogadores do Real Madrid', 3],
  ['bola', 'Jogadores do Barcelona', 3], ['bola', 'Jogadores que ganharam a Bola de Ouro', 3], ['bola', 'Times do Brasileirão', 1],
  ['bola', 'Times da Europa', 2], ['bola', 'Seleções campeãs ou finalistas de Copa', 3], ['bola', 'Goleiros famosos', 3],
  ['bola', 'Técnicos de futebol', 3], ['bola', 'Estádios de futebol', 3], ['bola', 'Pilotos de Fórmula 1', 3], ['bola', 'Lutadores de UFC', 3],
  ['bola', 'Jogadores de basquete', 3], ['bola', 'Tenistas', 3], ['bola', 'Atletas olímpicos brasileiros', 3], ['bola', 'Camisas 10 famosos', 3],

  // br
  ['br', 'Capitais do Brasil', 1], ['br', 'Estados do Brasil', 1], ['br', 'Cidades de São Paulo', 2], ['br', 'Cidades do Nordeste', 2],
  ['br', 'Praias brasileiras', 2], ['br', 'Comidas típicas brasileiras', 1], ['br', 'Marcas brasileiras', 2], ['br', 'Bairros do Rio de Janeiro', 3],
  ['br', 'Gírias brasileiras', 2], ['br', 'Memes brasileiros', 2], ['br', 'Presidentes do Brasil', 3], ['br', 'Políticos brasileiros', 3],
  ['br', 'Lojas e supermercados', 1], ['br', 'Bancos que existem no Brasil', 2], ['br', 'Salgados de festa', 1], ['br', 'Biscoitos e salgadinhos', 1],
  ['br', 'Festas e feriados brasileiros', 1], ['br', 'Personagens do folclore', 3], ['br', 'Times de futebol do Nordeste', 3],
  ['br', 'Pratos de padaria', 2], ['br', 'Comidas de festa junina', 1], ['br', 'Influenciadores brasileiros', 2],
  // mais temas fáceis (qualquer um cita uns 10 sem pensar muito)
  ['geral', 'Coisas que tem num quarto', 1], ['geral', 'Coisas que tem numa escola', 1], ['geral', 'Coisas que tem num hospital', 1],
  ['geral', 'Coisas que tem num supermercado', 1], ['geral', 'Coisas de cor vermelha', 1], ['geral', 'Coisas de cor verde', 1],
  ['geral', 'Coisas que tem rodas', 1], ['geral', 'Coisas que fazem barulho', 1], ['geral', 'Coisas que derretem', 1],
  ['geral', 'Coisas que você coloca na mochila', 1], ['geral', 'Comidas de café da manhã', 1], ['geral', 'Comidas que levam ovo', 1],
  ['geral', 'Animais de fazenda', 1], ['geral', 'Animais de estimação', 1], ['geral', 'Animais que começam com C', 1],
  ['geral', 'Bichos que dão medo', 1], ['geral', 'Roupas e acessórios', 1], ['geral', 'Eletrodomésticos', 1], ['geral', 'Móveis da casa', 1],
  ['geral', 'Brinquedos', 1], ['geral', 'Brincadeiras de criança', 1], ['geral', 'Coisas de aniversário', 1], ['geral', 'Coisas de Natal', 1],
  ['geral', 'Coisas que tem na praia', 1], ['geral', 'Coisas que se faz no fim de semana', 1], ['geral', 'Desculpas para faltar o trabalho', 1],
  ['geral', 'Palavras que começam com P', 1], ['geral', 'Nomes de cachorro', 1], ['geral', 'Formas de dizer "estou cansado"', 1],
  ['tela', 'Desenhos animados', 1], ['tela', 'Personagens da Disney', 1], ['tela', 'Filmes de comédia', 1], ['tela', 'Filmes de Natal', 1],
  ['som', 'Músicas que todo mundo sabe cantar', 1], ['som', 'Cantores e cantoras brasileiros', 1], ['som', 'Estilos de música', 1],
  ['bola', 'Esportes', 1], ['bola', 'Times de futebol brasileiros', 1], ['bola', 'Coisas que tem num jogo de futebol', 1],
  ['br', 'Comidas de churrasco', 1], ['br', 'Cidades brasileiras', 1], ['br', 'Coisas que tem numa padaria', 1], ['br', 'Frutas brasileiras', 1],
]

export const GRUPOS = { geral: 'Geral', tela: 'Filmes e TV', som: 'Música', bola: 'Esporte', br: 'Brasil' }

export const NIVEIS = [[1, 'Fácil'], [2, 'Médio'], [3, 'Difícil']]
