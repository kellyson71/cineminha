import { PALAVRAS as CLASSICO } from '../agentes/palavras.js'

// Cada grupo tem relações que admitem pistas coletivas; os grupos também se cruzam.
const grupos = texto => texto.split('\n').map(l => l.split('|').map(p => p.trim()).filter(Boolean)).filter(g => g.length)
export const PACOTES = [
  { id: 'classico', nome: 'Da Casa', subtitulo: 'O baralho do bar · 474 palavras', descricao: 'Palavras do dia a dia escritas para o Codnames. Boas para começar.', cor: '#c8432f', outra: '#2d6fb0', simbolo: 'copo', palavras: CLASSICO },
  { id: 'mundo', nome: 'Pelo Mundo', subtitulo: 'Países e lugares', descricao: 'Viagens, idiomas, continentes e lugares que compartilham história, paisagens e costumes.', cor: '#257958', outra: '#b9d9ad', simbolo: 'globo', grupos: grupos(`BRASIL|ARGENTINA|URUGUAI|CHILE|PERU|COLÔMBIA|EQUADOR|BOLÍVIA
PORTUGAL|ESPANHA|FRANÇA|ITÁLIA|GRÉCIA|ALEMANHA|INGLATERRA|IRLANDA
JAPÃO|CHINA|COREIA|ÍNDIA|TAILÂNDIA|VIETNÃ|INDONÉSIA|FILIPINAS
EGITO|MARROCOS|QUÊNIA|ANGOLA|MOÇAMBIQUE|NIGÉRIA|ÁFRICA DO SUL|SAARA
CANADÁ|MÉXICO|ESTADOS UNIDOS|CUBA|JAMAICA|COSTA RICA|PANAMÁ|CARIBE
AUSTRÁLIA|NOVA ZELÂNDIA|ISLÂNDIA|NORUEGA|SUÉCIA|FINLÂNDIA|DINAMARCA|SUÍÇA
AMAZÔNIA|PATAGÔNIA|ANDES|ALPES|HIMALAIA|ANTÁRTICA|EVEREST|PACÍFICO
PARIS|ROMA|LONDRES|LISBOA|TÓQUIO|CAIRO|BUENOS AIRES|BRASÍLIA`) },
  { id: 'nomes', nome: 'Nome aos Bois', subtitulo: 'Gente e personagens', descricao: 'Música, futebol, cinema e televisão. Pessoas conhecidas em grupos que se conectam.', cor: '#6d4799', outra: '#d1a6c0', simbolo: 'estrela', grupos: grupos(`PELÉ|MARTA|NEYMAR|RONALDINHO|ROMÁRIO|ZICO|MESSI|CRISTIANO RONALDO
CHICO BUARQUE|CAETANO VELOSO|GILBERTO GIL|GAL COSTA|MARIA BETHÂNIA|ELIS REGINA|TOM JOBIM|VINICIUS
ANITTA|LUDMILLA|IZA|PABLLO VITTAR|GLORIA GROOVE|LUÍSA SONZA|IVETE SANGALO|CLAUDIA LEITTE
SILVIO SANTOS|XUXA|ELIANA|ANGÉLICA|FAUSTÃO|GUGU|HEBE|ANA MARIA BRAGA
HOMEM-ARANHA|BATMAN|SUPERMAN|MULHER-MARAVILHA|HULK|THOR|HOMEM DE FERRO|CAPITÃO AMÉRICA
CHAVES|CHAPOLIN|SEU MADRUGA|DONA FLORINDA|KIKO|CHIQUINHA|PROFESSOR GIRAFALES|SEU BARRIGA
MÔNICA|CEBOLINHA|CASCÃO|MAGALI|CHICO BENTO|ROSINHA|BIDU|FRANJINHA
SHREK|BURRO|FIONA|GATO DE BOTAS|PINÓQUIO|CINDERELA|BRANCA DE NEVE|PETER PAN`) },
  { id: 'resenha', nome: 'Só Resenha', subtitulo: 'Memes e Brasil cotidiano', descricao: 'Comida, perrengues, festa e internet brasileira. Pistas simples como boleto, churrasco ou novela.', cor: '#d89119', outra: '#f0dca1', simbolo: 'fala', grupos: grupos(`PIX|BOLETO|SERASA|FIADO|SALÁRIO|TROCO|CARTÃO|VAQUINHA
CHURRASCO|PICANHA|FAROFA|VINAGRETE|CARVÃO|ESPETINHO|CERVEJA|PÃO DE ALHO
COXINHA|PASTEL|CALDO DE CANA|PAMONHA|PÃO DE QUEIJO|BRIGADEIRO|CACHORRO-QUENTE|PIPOCA
CAPIVARA|VIRA-LATA|CARAMELO|POMBO|GATO|CACHORRO|PAPAGAIO|CALOPSITA
FÁTIMA|GRÁVIDA DE TAUBATÉ|CANETA AZUL|LUVA DE PEDREIRO|RECEBA|BORA BILL|DOLLY|NÃO SEI OPINAR
MARMITA|BUSÃO|CATRACA|PONTO|TRÂNSITO|ATRASO|FIRMA|CRACHÁ
CHINELO|GAMBIARRA|VENTILADOR|FILTRO DE BARRO|COPO AMERICANO|POTE DE SORVETE|VASSOURA|PANO DE CHÃO
BBB|PAREDÃO|CONFESSIONÁRIO|LÍDER|IMUNIDADE|MUTIRÃO|FOFOCA|BARRACO`) },
  { id: 'internet', nome: 'Muito Online', subtitulo: 'Internet, jogos e geração Z', descricao: 'Vocabulário reconhecível de redes, mensagens e jogos; sem depender de tendências de uma única semana.', cor: '#275a9f', outra: '#86b6c2', simbolo: 'tela', grupos: grupos(`MEME|FIGURINHA|PRINT|ÁUDIO|GRUPO|STICKER|STATUS|ENCAMINHADO
TREND|VIRAL|FEED|STORY|REELS|LIKE|SEGUIDOR|HASHTAG
CRINGE|FLOP|HYPE|AURA|BISCOITO|CANCELAMENTO|HATER|FANDOM
LAG|BUG|PING|SERVIDOR|UPDATE|PATCH|DOWNLOAD|WI-FI
NOOB|BOSS|SKIN|LOOT|RANK|XP|RESPAWN|CHECKPOINT
STREAMER|LIVE|CHAT|EMOTE|MODERADOR|BAN|SUB|CLIP
SPOILER|PLOT TWIST|FANFIC|SHIP|CANON|COSPLAY|ANIME|MANGÁ
MATCH|CRUSH|GHOSTING|CONTATINHO|DIRECT|STALKER|LOW PROFILE|BIO`) },
  { id: 'brasilia', nome: 'Praça dos Três', subtitulo: 'Política brasileira', descricao: 'Nomes, instituições, eleições e história política. Sem alinhamento partidário: só associações de palavras.', cor: '#8f3f34', outra: '#c8b56c', simbolo: 'predio', grupos: grupos(`LULA|DILMA ROUSSEFF|BOLSONARO|MICHEL TEMER|FERNANDO HENRIQUE|ITAMAR FRANCO|FERNANDO COLLOR|JOSÉ SARNEY
GETÚLIO VARGAS|JUSCELINO KUBITSCHEK|JOÃO GOULART|JÂNIO QUADROS|TANCREDO NEVES|ULYSSES GUIMARÃES|LEONEL BRIZOLA|FRANCO MONTORO
MARINA SILVA|CIRO GOMES|FERNANDO HADDAD|SIMONE TEBET|GUILHERME BOULOS|TABATA AMARAL|BENEDITA DA SILVA|MANUELA D'ÁVILA
BRASÍLIA|PLANALTO|ALVORADA|CONGRESSO|SENADO|CÂMARA|ESPLANADA|SUPREMO
URNA|VOTO|ELEIÇÃO|COLIGAÇÃO|PARTIDO|CAMPANHA|COMÍCIO|SANTINHO
PREFEITURA|GOVERNO|MINISTÉRIO|GABINETE|BANCADA|COMISSÃO|PLENÁRIO|MANDATO
CONSTITUIÇÃO|EMENDA|PROJETO|LEI|DECRETO|VETO|SANÇÃO|ORÇAMENTO
DEBATE|PESQUISA|PROPAGANDA|ENTREVISTA|SABATINA|COLETIVA|PALANQUE|DISCURSO`) },
]

export function sorteiaPalavras(ids, embaralha) {
  const packs = PACOTES.filter(p => ids.includes(p.id)), usados = new Set(), saida = []
  if (!packs.length) return embaralha([...CLASSICO]).slice(0, 25)
  for (let i = 0; i < packs.length; i++) {
    const p = packs[i], qtd = Math.floor(25 / packs.length) + (i < 25 % packs.length ? 1 : 0)
    // Nos pacotes autorais, junta pequenas famílias de associações antes de misturar a posição das cartas.
    const pool = p.palavras ? embaralha([...p.palavras]) : embaralha(p.grupos.map(g => embaralha([...g]))).flatMap(g => g.slice(0, 5))
    const disponiveis = pool.filter(w => !usados.has(w))
    for (const w of disponiveis.slice(0, qtd)) { usados.add(w); saida.push(w) }
  }
  if (saida.length < 25) for (const w of embaralha(packs.flatMap(p => p.palavras || p.grupos.flat()))) if (!usados.has(w)) { usados.add(w); saida.push(w); if (saida.length === 25) break }
  return embaralha(saida)
}
