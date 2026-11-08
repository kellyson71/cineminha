/* Jogos do Cineminha: cada um é um módulo à parte em public/, baixado só quando alguém abre
   ou quando chega a primeira mensagem dele. Usado pelo site e pelo app desktop. */
export const FONTES = 'https://fonts.googleapis.com/css2?'
export const JOGOS = {
  faixa: { nome: 'Faixa a Faixa', mod: './faixa.js', cria: 'criaFaixa', tela: 'faixa', on: 'jogo-on', css: ['faixa.css'], fontes: 'family=Bebas+Neue&family=Permanent+Marker' },
  coup: { nome: 'Coup', mod: './coup.js', cria: 'criaCoup', tela: 'coup', on: 'coup-on', css: ['aula.css', 'coup.css'], fontes: 'family=Pinyon+Script&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500' },
  dc: { nome: 'Uno', mod: './descarte.js', cria: 'criaDescarte', tela: 'dc', on: 'dc-on', css: ['cartas-mesa.css', 'descarte.css'], fontes: 'family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800' },
  pp: { nome: 'Red Flags', mod: './parperfeito.js', cria: 'criaParPerfeito', tela: 'pp', on: 'pp-on', css: ['parperfeito.css'], fontes: 'family=Roboto+Condensed:wght@500;600;700;900' },
  ab: { nome: 'Amigos de Merda', mod: './amigosdebosta.js', cria: 'criaAmigosDeBosta', tela: 'ab', on: 'ab-on', css: ['amigosdebosta.css'], fontes: 'family=Bebas+Neue&family=Roboto+Condensed:wght@500;600;700;900' },
  db: { nome: 'Dobro', mod: './dobradinha.js', cria: 'criaDobradinha', tela: 'db', on: 'db-on', css: ['aula.css', 'cartas-mesa.css', 'dobradinha.css'], fontes: 'family=Alfa+Slab+One&family=Caveat+Brush&family=Barlow+Semi+Condensed:wght@500;600;700' },
  du: { nome: 'Dou-lhe Uma', mod: './doulheuma.js', cria: 'criaDouLheUma', tela: 'du', on: 'du-on', css: ['doulheuma.css'], fontes: 'family=Bowlby+One+SC&family=Archivo+Narrow:wght@500;600;700' },
  qq: { nome: 'Quadro a Quadro', mod: './quadro.js', cria: 'criaQuadro', tela: 'qq', on: 'qq-on', css: ['quadro.css'], fontes: 'family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700' },
  nt: { nome: 'Na Testa', mod: './natesta.js', cria: 'criaNaTesta', tela: 'nt', on: 'nt-on', css: ['natesta.css'], fontes: 'family=Gochi+Hand&family=Outfit:wght@400;600;700' },
}

// mensagem da ação "jogo" → [id do jogo, conteúdo]. O Faixa a Faixa manda sem envelope.
export const jogoDaMsg = d => d?.coup ? ['coup', d.coup] : d?.dc ? ['dc', d.dc] : d?.pp ? ['pp', d.pp] : d?.ab ? ['ab', d.ab] : d?.db ? ['db', d.db] : d?.du ? ['du', d.du] : d?.nt ? ['nt', d.nt] : d?.qq ? ['qq', d.qq] : ['faixa', d]
