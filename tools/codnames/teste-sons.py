"""Chrome: quatro clientes, áudio real no mixer e eventos autoritativos da partida."""
from pathlib import Path
from time import time
from playwright.sync_api import sync_playwright

OUT = Path('/tmp/codnames'); OUT.mkdir(exist_ok=True)
KEYS = ['h', 'a', 'b', 'c']
HTML = '<link rel="stylesheet" href="/agentes.css"><style>body{margin:0}.pfp{display:grid;place-items:center;background:#687b88;width:100%;height:100%}</style><div class="ag" id="game"></div>'
SETUP = '''async key=>{
 const {criaAgentes}=await import('/agentes.js');
 const el=(t,p={},...cs)=>{const n=Object.assign(document.createElement(t),p);n.append(...cs.flat().filter(x=>x!=null&&x!==''));return n};
 localStorage.setItem('ag.tutorial','false');
 window.saida=[];window.pres=['h','a','b','c'];window.audios=[];window.starts=[];
 const ac=new AudioContext(),mixer=ac.createGain();mixer.gain.value=0;mixer.connect(ac.destination);
 const start=AudioBufferSourceNode.prototype.start;
 AudioBufferSourceNode.prototype.start=function(...args){starts.push(args);return start.apply(this,args)};
 window.game=criaAgentes({el,tela:document.querySelector('#game'),me:{key,name:key},icon:()=>document.createElementNS('http://www.w3.org/2000/svg','svg'),toast:()=>{},sysMsg:()=>{},presentes:()=>pres,nomeDe:k=>k,pfp:(k,s,n)=>el('span',{className:'pfp',textContent:n[0]}),hydrate:()=>{},sendTo:(key,data)=>saida.push({key,data:structuredClone(data)}),send:d=>pres.filter(k=>k!==key).forEach(k=>saida.push({key:k,data:structuredClone(d)})),audioCtx:()=>ac,saida:()=>mixer,onAtivo:()=>{}});
 const sons=__ag().sons(),tocar=sons.tocar;
 sons.tocar=(nome,...args)=>{audios.push({nome,t:performance.now()});return tocar(nome,...args)};
 window.intent=(d,key='h')=>game.got({op:{id:__ag().V.id,...d}},key);
}'''
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/opt/google/chrome/chrome',headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 errors=[];pages={};requests={}
 for key in KEYS:
  c=browser.new_context(viewport={'width':1400,'height':850})
  c.route('**/api/**',lambda r:r.fulfill(json={}))
  c.route('**/_teste-codnames?*',lambda r:r.fulfill(content_type='text/html',body=HTML))
  pg=c.new_page();pg.on('pageerror',lambda e:errors.append(str(e)))
  requests[key]=[];pg.on('request',lambda r,k=key:requests[k].append(r.url) if r.url.endswith('.mp3') else None)
  pg.goto(f'http://localhost:8790/_teste-codnames?sala=teste-codnames-{int(time())}');pg.evaluate(SETUP,key);pages[key]=pg
 host=pages['h'];host.evaluate('game.iniciar()')
 def sync():
  for _ in range(8):
   packets=[(k,packet) for k,pg in pages.items() for packet in pg.evaluate('saida.splice(0)')]
   if not packets:return
   for sender,packet in packets:pages[packet['key']].evaluate('([d,k])=>game.got(d.ag,k)',[packet['data'],sender])
  raise AssertionError('transporte não estabilizou')
 def intent(d,key='h'):
  host.evaluate('([d,k])=>intent(d,k)',[d,key]);sync()
 def nomes(k):return pages[k].evaluate('audios.map(x=>x.nome)')
 def limpa():
  for pg in pages.values():pg.evaluate('audios.length=0')
 def espera():host.wait_for_function('Date.now()>=__ag().G.bloqueio')
 def dica(team):
  m=pages['h' if team=='r' else 'b']
  m.locator('.ag-dica__txt').fill('Conexao')
  m.locator('button[title="Sem limite de palpites"]').click()
  m.get_by_role('button',name='Mandar',exact=True).click();sync()
 def abre(idx,who):
  espera();pg=pages[who];pg.wait_for_function('Date.now()>=__ag().V.recebido+__ag().V.bloqueio')
  card=pg.locator(f'.ag-carta[data-idx="{idx}"]');card.dblclick(delay=120);sync()
  assert host.evaluate('i=>__ag().G.cartas[i].rev',idx)
  host.wait_for_timeout(2700)
 sync()
 assert all(not rs for rs in requests.values()),requests
 assert host.locator('.ag-logo').get_attribute('aria-label')=='Codnames'
 assert host.locator('.ag-logo').inner_text().replace('\n','')=='CODNAMES'
 host.locator('.ag-prateleira').click()
 assert host.locator('.ag-caixa__marca').first.inner_text().replace('\n','')=='CODNAMES'
 host.locator('.ag-modal button[title="Fechar"]').click()
 for key,team,role in [('h','r','mestre'),('a','r','agente'),('b','b','mestre'),('c','b','agente')]:
  pages[key].locator(f'.ag-time--{team} '+('.ag-cadeira.vazia' if role=='mestre' else '.ag-entrar')).click();sync()
 host.evaluate("__ag().G.comeca='r';__ag().difunde()");sync()
 host.screenshot(path=str(OUT/'lobby.png'))
 limpa();host.get_by_role('button',name='Começar partida',exact=True).click();sync();host.wait_for_timeout(1200)
 assert all(nomes(k).count('notification')==1 and nomes(k).count('deal')==1 for k in KEYS)
 assert all(c['cor'] is None for c in pages['a'].evaluate('__ag().V.cartas'))
 reds=host.evaluate("__ag().G.cartas.flatMap((c,i)=>c.cor==='r'?[i]:[])")
 host.locator(f'.ag-carta[data-idx="{reds[0]}"]').click();sync()
 assert nomes('h')[-1]=='select' and pages['a'].evaluate('__ag().V.alvos')==[]
 dica('r');assert all('sendClue' in nomes(k) for k in KEYS)
 limpa();abre(reds[0],'a')
 assert all(nomes(k).count('goodGuess')==1 and 'wrongGuess' not in nomes(k) and 'dealCard' in nomes(k) for k in KEYS)
 before=nomes('h');host.evaluate('__ag().render();__ag().difunde()');sync();assert nomes('h')==before
 limpa();neutral=host.evaluate("__ag().G.cartas.findIndex(c=>c.cor==='n')");abre(neutral,'a')
 assert all('wrongGuess' in nomes(k) and 'nextRound' in nomes(k) for k in KEYS)
 dica('b');limpa();black=host.evaluate("__ag().G.cartas.findIndex(c=>c.cor==='x')");abre(black,'c')
 assert all('assasin' in nomes(k) and 'wrongGuess' not in nomes(k) for k in KEYS)
 assert all('win' in nomes(k) for k in ['h','a']) and all('loss' in nomes(k) for k in ['b','c'])
 host.wait_for_selector('.ag-fim');host.screenshot(path=str(OUT/'fim.png'))
 print('Seleção, dica, acerto, erro, cobertura, troca de vez, assassino, vitória/derrota: OK',flush=True)
 host.get_by_role('button',name='Jogar de novo',exact=True).click();sync();dica('b')
 # Fecha ainda no suspense: nenhum resultado/pouso/fim pode escapar para a mesa seguinte.
 espera();idx=host.evaluate("__ag().G.cartas.findIndex(c=>c.cor==='x')")
 intent({'op':'revela','idx':idx},'c');host.wait_for_timeout(100)
 host.evaluate('game.encerra()');sync();limpa();host.wait_for_timeout(2900)
 assert all(nomes(k)==[] for k in KEYS)
 assert all(len(rs)==1 and '/jogos/codnames/sons/' in rs[0] for rs in requests.values()),requests
 assert all(pg.evaluate('starts.length')>5 for pg in pages.values())
 assert not errors,errors
 print('Um único sprite por cliente, áudio decodificado, sem repetição no render, cancelamento ao fechar: OK',flush=True)
 browser.close()
