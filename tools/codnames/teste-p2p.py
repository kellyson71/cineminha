from pathlib import Path
from time import time
from playwright.sync_api import sync_playwright
OUT=Path('/tmp/codnames');OUT.mkdir(exist_ok=True)
keys=['kellyson','otavio','milenny','pedro']
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/opt/google/chrome/chrome',headless=True,args=['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'])
 pages={};errors=[];audio={}
 room=f'http://localhost:8790/?sala=teste-codnames-{int(time())}'
 for key in keys:
  c=b.new_context(viewport={'width':1400,'height':900},permissions=['microphone'])
  c.route('**/api/**',lambda r:r.fulfill(json={'token':'a'*48,'perfis':{}} if 'conta' in r.request.url else {}))
  c.route('**/app.js',lambda r:r.fulfill(content_type='text/javascript',body=r.fetch().text()+'\nwindow.__codeApp={peers,me,carregaJogo,get room(){return room}};'))
  pg=c.new_page();pg.on('pageerror',lambda e:errors.append(str(e)));audio[key]=[]
  pg.on('request',lambda r,k=key:audio[k].append(r.url) if '/jogos/codnames/sons/efeitos.mp3' in r.url else None)
  pg.goto(room);pg.wait_for_function('typeof __codeApp!=="undefined"')
  if pg.locator('#pw').is_visible():pg.fill('#pw','cineminha')
  pg.locator('.whocard').filter(has=pg.locator(f'input[value={key}]')).click()
  pg.wait_for_function("!document.body.classList.contains('locked')")
  pages[key]=pg;print('login',key,flush=True)
 host=pages[keys[0]];host.wait_for_function('__codeApp.peers.size===3',timeout=40000)
 assert all(not rs for rs in audio.values())
 host.locator('#btnJogo').click();host.locator('.jogosmenu__card').filter(has_text='Codnames').click()
 for pg in pages.values():
  pg.wait_for_function('typeof __ag!=="undefined" && __ag().V')
  if pg.locator('.ag-modal').count():pg.locator('.ag-modal button[title="Fechar"]').click()
 roles=[('kellyson','r','mestre'),('otavio','r','agente'),('milenny','b','mestre'),('pedro','b','agente')]
 for key,t,role in roles:
  pages[key].locator(f'.ag-time--{t} '+('.ag-cadeira.vazia' if role=='mestre' else '.ag-entrar')).click()
  host.wait_for_function('([k,t])=>__ag().G.times[k]===t',arg=[key,t])
 host.locator('.ag').screenshot(path=str(OUT/'p2p-lobby.png'))
 host.get_by_role('button',name='Começar partida',exact=True).click()
 host.wait_for_function('__ag().G.fase==="jogo"')
 for turn in range(12):
  g=host.evaluate('__ag().G')
  if g['fase']=='fim':break
  team=g['vez'];master=g['chefe'][team];agent=next(k for k,t in g['times'].items() if t==team and k!=master)
  own=[i for i,c in enumerate(g['cartas']) if c['cor']==team and not c['rev']]
  m=pages[master];a=pages[agent]
  m.wait_for_function('(s)=>__ag().V.seq>=s',arg=g['seq'])
  for idx in own[:2]:
   m.locator(f'.ag-carta[data-idx="{idx}"]').click()
   host.wait_for_function('i=>__ag().G.alvos[__ag().G.vez].includes(i)',arg=idx)
  assert a.evaluate('__ag().V.alvos.length')==0
  m.locator('.ag-dica__txt').fill(f'Conexão{turn}')
  m.get_by_role('button',name='Mandar',exact=True).click()
  host.wait_for_function('__ag().G.etapa==="palpite"')
  for idx in own[:3]:
   if host.evaluate('__ag().G.fase')=='fim':break
   host.wait_for_function('Date.now()>=__ag().G.bloqueio')
   a.wait_for_function('Date.now()>=__ag().V.recebido+__ag().V.bloqueio && document.querySelectorAll(".ag-carta.clicavel").length>0')
   a.locator(f'.ag-carta[data-idx="{idx}"]').press('Enter')
   host.wait_for_function('i=>__ag().G.cartas[i].rev',arg=idx)
  print('vez',turn,team,'faltam',host.evaluate('__ag().V.faltam'),flush=True)
 assert host.evaluate('__ag().G.fase')=='fim'
 host.wait_for_selector('.ag-fim');host.locator('.ag').screenshot(path=str(OUT/'p2p-fim.png'))
 assert all(len(rs)<=1 for rs in audio.values()),audio
 print('rodada completa P2P; dicas privadas; um sprite por navegador',flush=True)
 host.get_by_role('button',name='Jogar de novo',exact=True).click()
 host.wait_for_function('__ag().G.fase==="jogo"')
 for pg in pages.values():pg.wait_for_function('__ag().V.fase==="jogo"')
 host.locator('.ag').screenshot(path=str(OUT/'p2p-mesa.png'))
 successor=host.evaluate('__ag().G.sucessor')
 host.evaluate('__codeApp.room.leave()');host.close()
 survivor=pages[successor]
 survivor.wait_for_function('__ag().G?.host===__codeApp.me.key',timeout=25000)
 assert survivor.evaluate('__ag().G.fase')=='fim'
 assert survivor.evaluate('__ag().G.motivo')=='abandono'
 assert not errors,errors
 print('troca de host e término por time sem jogadores suficientes OK; sem erros JS',flush=True)
 b.close()
