"""Reposição do monte: quatro clientes, compra dividida, topo preservado e animação persistente."""
import ast
from pathlib import Path
from time import time
from playwright.sync_api import sync_playwright

# Mesmo contexto multiplayer dos testes da Roleta, sem executar os cenários daquele arquivo.
source = ast.parse(Path(__file__).with_name('teste-roleta.py').read_text())
fixtures = {n.targets[0].id: ast.literal_eval(n.value) for n in source.body if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name) and n.targets[0].id in ['HTML', 'SETUP']}
OUT=Path('/tmp/cineminha-uno-monte');OUT.mkdir(exist_ok=True)
KEYS=['h','g','b','c']
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/opt/google/chrome/chrome',headless=True,args=['--no-sandbox'])
 pages={};errors=[]
 for key in KEYS:
  ctx=browser.new_context(viewport={'width':1200,'height':700})
  ctx.route('**/api/**',lambda r:r.fulfill(json={}))
  ctx.route('**/_teste-monte?*',lambda r:r.fulfill(content_type='text/html',body=fixtures['HTML']))
  pg=ctx.new_page();pg.on('pageerror',lambda e:errors.append(str(e)))
  pg.goto(f'http://localhost:8790/_teste-monte?sala=teste-uno-monte-{int(time())}');pg.evaluate(fixtures['SETUP'],key);pages[key]=pg
 host=pages['h'];host.evaluate("jogo.iniciar(['g','b','c'])")
 host.get_by_role('button',name='Começar com 4',exact=True).click()
 def pump():
  for _ in range(6):
   packets=[(k,msg) for k,pg in pages.items() for msg in pg.evaluate('saida.splice(0)')]
   if not packets:return
   for key,msg in packets:pages[msg['key']].evaluate('([d,k])=>jogo.got(d.dc,k)',[msg['data'],key])
  raise AssertionError('transporte não estabilizou')
 pump();host.wait_for_timeout(3500)
 PREPARA='''()=>{
 const {G,difunde}=__descarte();G.fase='jogo';G.op.tempo=0;G.op.semPiedade=true;G.op.sete=false;G.op.bate=false;
 G.js.sort((a,b)=>['h','g','b','c'].indexOf(a.key)-['h','g','b','c'].indexOf(b.key));G.vez=0;G.dir=1;G.cor='y';G.ev=[];G.pend=6;G.pendTipo='+6';G.repondoAte=0;G.roleta=null;
 G.descarte=Array.from({length:64},(_,i)=>({id:7000+i,c:i%7?'g':null,v:i%7?String(i%10):'cor',...(i%7?{}:{esc:'g'})}));
 G.descarte.push({id:7999,c:null,v:'cor',esc:'y'});
 G.monte=[{id:8000,c:'b',v:'1'},{id:8001,c:'r',v:'2'}];
 window.total=G.js.reduce((s,j)=>s+j.mao.length,0)+G.monte.length+G.descarte.length;
 window.maos=Object.fromEntries(G.js.map(j=>[j.key,j.mao.length]));difunde();
 }'''
 host.evaluate(PREPARA);pump()
 for pg in pages.values():pg.evaluate('''window.etapas=[];new MutationObserver(ms=>{for(const m of ms)if(m.target.matches?.('.dc-recicla[data-etapa]'))etapas.push({etapa:m.target.dataset.etapa,topos:[...document.querySelectorAll('.dc-descarte .dc-no-monte')].map(n=>n.dataset.id),monte:document.querySelector('.dc-centro > .dc-monte')?.dataset.qtd})}).observe(document.querySelector('#game'),{subtree:true,attributes:true,attributeFilter:['data-etapa']})''')
 assert host.locator('.dc-centro > .dc-monte .dc-camada').count()==2
 host.evaluate("intencao({op:'compra'},'h')");pump()
 evs=host.evaluate('__descarte().G.ev')
 assert [(e['t'],e.get('qtd')) for e in evs if e['t'] in ['compra','embaralha']]==[('compra',2),('embaralha',64),('compra',4)]
 assert all(e['n']>0 for e in evs)
 assert host.evaluate('__descarte().G.descarte')==[{'id':7999,'c':None,'v':'cor','esc':'y'}]
 assert host.evaluate("__descarte().G.monte.every(c=>!('esc' in c))")
 assert len(next(e for e in evs if e['t']=='embaralha')['cartas'])==13
 host.wait_for_selector('.dc-recicla[data-etapa="embaralhando"]')
 assert host.locator('.dc-centro > .dc-monte .dc-camada').count()==0
 assert host.evaluate("[...document.querySelectorAll('.cm-voo .dc-carta[data-id]')].every(n=>['8000','8001'].includes(n.dataset.id))") # apenas as compras anteriores, sem nova distribuição
 assert host.evaluate("[...document.querySelectorAll('.dc-recicla .dc-camada')].some(n=>getComputedStyle(n).animationName.startsWith('dc-riffle-'))")
 before=host.evaluate('__descarte().G.seq');host.evaluate("intencao({op:'compra'},__descarte().V.vez)")
 assert host.evaluate('__descarte().G.seq')==before # host recusa compras durante a reposição
 host.evaluate('__descarte().render()')
 assert host.locator('.dc-recicla').count()==1
 host.screenshot(path=str(OUT/'embaralhando.png'))
 host.wait_for_selector('.dc-recicla',state='detached')
 for pg in pages.values():
  pg.wait_for_function("['recolhendo','virando','embaralhando','voltando'].every(e=>etapas.some(x=>x.etapa===e))")
  assert pg.evaluate("etapas.every(e=>JSON.stringify(e.topos)===JSON.stringify(['7999'])&&e.monte==='0')")
 host.wait_for_function("document.querySelector('.dc-centro > .dc-monte').dataset.qtd==='60'")
 host.wait_for_timeout(800)
 for key,pg in pages.items():
  assert pg.locator('.dc-mao .dc-carta.oculta').count()==0
  assert pg.locator('.dc-centro > .dc-monte').get_attribute('data-qtd')=='60'
  assert pg.locator('.dc-descarte .dc-no-monte').count()==1
 assert host.evaluate("__descarte().G.js.every(j=>j.mao.length===maos[j.key]+(j.key==='h'?6:0))")
 assert host.evaluate('(()=>{const g=__descarte().G,cs=g.js.flatMap(j=>j.mao).concat(g.monte,g.descarte);return cs.length===total&&new Set(cs.map(c=>c.id)).size===total})()')
 host.screenshot(path=str(OUT/'reposto.png'))
 print('Quatro clientes: compra 2 → recolhe 64 → compra 4; topo/cor, segredo, unicidade e mãos preservados; riffle reaproveitado sem distribuição; render no meio: OK',flush=True)
 # O último cartão do monte realmente desaparece; com só o topo na mesa não se cria outra carta.
 host.evaluate("()=>{const {G,difunde}=__descarte();G.monte=[{id:9000,c:'b',v:'1'}];G.descarte=[G.descarte.at(-1)];G.vez=0;G.pend=0;G.compradas=0;G.op.ate3=true;G.repondoAte=0;G.ev=[];difunde()}");pump()
 assert host.locator('.dc-centro > .dc-monte .dc-camada').count()==1
 host.evaluate("intencao({op:'compra'},'h')");pump();host.wait_for_timeout(600)
 assert host.locator('.dc-centro > .dc-monte .dc-camada').count()==0
 host.evaluate("intencao({op:'compra'},'h')");pump()
 assert host.evaluate('__descarte().G.descarte.length')==1
 assert not host.evaluate("__descarte().G.ev.some(e=>e.t==='embaralha')")
 # Comprar a última carta já recolhe o descarte, sem exigir outro clique e sem distribuir.
 host.evaluate("()=>{const {G,difunde}=__descarte();G.monte=[{id:9100,c:'b',v:'1'}];G.descarte=[{id:9200,c:'g',v:'2'},{id:9201,c:'r',v:'5'},G.descarte.at(-1)];G.vez=0;G.pend=0;G.compradas=0;G.ev=[];G.repondoAte=0;difunde()}");pump()
 host.evaluate("intencao({op:'compra'},'h')");pump()
 assert host.evaluate("__descarte().G.ev.filter(e=>e.t==='compra').length") == 1
 assert host.evaluate("__descarte().G.ev.some(e=>e.t==='embaralha'&&e.qtd===2)")
 host.wait_for_function("document.querySelector('.dc-centro > .dc-monte').dataset.qtd==='2'",timeout=5000)
 host.wait_for_timeout(500)
 # Movimento reduzido e tema clássico usam a mesma reposição sem voos desnecessários.
 host.locator('.dc-tema').click();host.locator('[data-tema-opcao="classico"]').click()
 assert host.locator('.dc').get_attribute('data-tema')=='classico'
 for pg in pages.values():pg.emulate_media(reduced_motion='reduce')
 host.evaluate(PREPARA);pump();host.evaluate("intencao({op:'compra'},'h')");pump();host.wait_for_timeout(1300)
 assert host.locator('.dc-recicla').count()==0
 assert host.locator('.dc-centro > .dc-monte').get_attribute('data-qtd')=='60'
 for pg in pages.values():pg.emulate_media(reduced_motion='no-preference')
 # Uma compra maior que as amostras visuais entrega todas as cartas, inclusive as restantes.
 host.evaluate("()=>{const {G,difunde}=__descarte();G.monte=Array.from({length:30},(_,i)=>({id:30000+i,c:'b',v:String(i%10)}));G.descarte=[G.descarte.at(-1)];G.vez=0;G.pend=30;G.repondoAte=0;G.ev=[];window.maoAntes=G.js[0].mao.length;difunde()}");pump()
 host.evaluate("intencao({op:'compra'},'h')");pump();host.wait_for_timeout(2800)
 assert host.evaluate('__descarte().G.js[0].mao.length===maoAntes+30&&__descarte().G.monte.length===0')
 assert host.locator('.dc-mao .dc-carta.oculta').count()==0
 host.evaluate(PREPARA);pump();host.evaluate("intencao({op:'compra'},'h')");pump()
 host.wait_for_selector('.dc-recicla[data-etapa="recolhendo"]')
 host.evaluate('jogo.encerra()');host.wait_for_timeout(3100)
 assert host.locator('.dc-recicla,.cm-voo').count()==0
 assert not errors,errors
 print('Monte 1 → 0, falta total de cartas, movimento reduzido e fechamento no meio da reposição: OK; sem erros JS.',flush=True)
 browser.close()
