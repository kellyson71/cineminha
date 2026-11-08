"""Roleta interativa e efeitos do Sem Piedade. Execute com o servidor local na porta 8790."""
from pathlib import Path
from time import time
from playwright.sync_api import sync_playwright

OUT = Path('/tmp/cineminha-uno-roleta')
OUT.mkdir(exist_ok=True)
HTML = '''<link rel="stylesheet" href="/descarte.css"><link rel="stylesheet" href="/cartas-mesa.css">
<style>body{margin:0}.pfp{display:grid;place-items:center;border-radius:50%;background:#aabac6;width:100%;height:100%}</style>
<div class="dc" id="game"></div>'''
SETUP = '''async key => {
  localStorage.setItem('mesa.qualidade','2d');
  const {criaDescarte} = await import('/descarte.js');
  const el = (tag, props = {}, ...kids) => {
    const e = Object.assign(document.createElement(tag),props);
    e.append(...kids.flat().filter(x => x != null && x !== '')); return e;
  };
  window.saida = [];
  window.presentes = ['h','g','b','c'];
  window.jogo = criaDescarte({el,tela:document.querySelector('#game'),me:{key,name:key},
    icon:() => document.createElementNS('http://www.w3.org/2000/svg','svg'),
    toast:() => {},sysMsg:() => {},presentes:() => window.presentes,nomeDe:k=>k,
    pfp:(k,s,n) => el('span',{className:'pfp',textContent:n}),hydrate:()=>{},
    sendTo:(k,d) => saida.push({key:k,data:structuredClone(d)}),send:()=>{},
    outroJogo:()=>false,audioCtx:()=>{throw Error('teste sem áudio')}
  });
  window.intencao = (op,key='g') => jogo.got({op:{id:__descarte().V.id,...op}},key);
  window.prepara = (v,dir=1) => {
    const {G,difunde}=__descarte(),{seq,evN}=G;
    Object.assign(G,structuredClone(base),{seq,evN,ev:[],fase:'jogo',vez:0,dir,pend:0,pendTipo:null,roleta:null});
    G.js.sort((a,b)=>['h','g','b','c'].indexOf(a.key)-['h','g','b','c'].indexOf(b.key));
    G.op=Object.fromEntries(Object.keys(G.op).map(k=>[k,false]));G.op.semPiedade=true;
    G.descarte=[{id:8000,c:'r',v:'1'}];G.cor='r';
    G.js[0].mao=[{id:8001,c:['desc','pulaT'].includes(v)?'r':null,v},{id:8002,c:'r',v:'5'},{id:8003,c:'b',v:'2'}];
    G.js[1].mao=[{id:8100,c:'g',v:'1'}];
    G.monte=[{id:8202,c:'r',v:'2'},{id:8201,c:null,v:'cor'},{id:8200,c:'b',v:'4'}];
    difunde();intencao({op:'joga',cartas:[8001],cor:'r'},'h');
  };
}'''

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/opt/google/chrome/chrome', headless=True,
                                args=['--no-sandbox'])
    errors, pages = [], {}
    for key in ['h', 'g', 'b', 'c']:
        ctx = browser.new_context(viewport={'width': 1200, 'height': 700})
        ctx.route('**/api/**', lambda r: r.fulfill(json={}))
        ctx.route('**/_teste-roleta?*', lambda r: r.fulfill(content_type='text/html', body=HTML))
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(f'http://localhost:8790/_teste-roleta?sala=teste-dc-roleta-{int(time())}')
        page.evaluate(SETUP, key)
        pages[key] = page
    host, guest = pages['h'], pages['g']
    host.evaluate("jogo.iniciar(['g','b','c'])")
    host.get_by_role('button', name='Começar com 4', exact=True).click()
    host.evaluate('window.base=structuredClone(__descarte().G)')
    host.wait_for_timeout(3500)

    def pump():
        for packet in host.evaluate('saida.splice(0)'):
            pages[packet['key']].evaluate("d=>jogo.got(d.dc,'h')", packet['data'])
        for key, page in pages.items():
            if key == 'h':
                continue
            for packet in page.evaluate('saida.splice(0)'):
                if packet['key'] == 'h' and packet['data'].get('dc', {}).get('op'):
                    host.evaluate("([d,k])=>jogo.got(d.dc,k)", [packet['data'], key])
        for packet in host.evaluate('saida.splice(0)'):
            pages[packet['key']].evaluate("d=>jogo.got(d.dc,'h')", packet['data'])

    host.evaluate("prepara('roleta')")
    pump()
    assert host.evaluate("__descarte().G.fase==='roleta' && __descarte().G.js[1].mao.length===1")
    for page in pages.values():
        assert 'vermelho' in page.locator('.dc-roleta').text_content().lower()
        assert page.evaluate('__descarte().V.roleta.ultima') is None
        assert page.locator('.dc-roleta__texto').text_content().find('perde a vez') >= 0
    assert host.locator('[data-roleta-compra]').count() == 0
    guest.bring_to_front()
    for step, color in enumerate(['b', None, 'r']):
        guest.wait_for_function("!document.querySelector('[data-roleta-compra]').disabled")
        guest.locator('[data-roleta-compra]').click()
        pump()
        revealed = host.evaluate("__descarte().G.ev.filter(e=>e.t==='roletaCarta').at(-1)")
        assert revealed['qtd'] == step+1
        assert revealed['carta']['c'] == color
        assert host.evaluate('__descarte().G.js[1].mao.length') == step+2
        # Repetições do mesmo passo, outro jogador e cliques rápidos não compram outra.
        host.evaluate("passo=>{for(let i=0;i<100;i++)intencao({op:'roleta',passo});intencao({op:'roleta',passo:passo+1},'b')}", step)
        assert host.evaluate("__descarte().G.ev.filter(e=>e.t==='roletaCarta').at(-1).qtd") == step+1
        assert host.evaluate("__descarte().G.ev.filter(e=>e.t==='roletaCarta').at(-1).achou") == (step == 2)
        guest.wait_for_function("!document.querySelector('.dc-roleta__carta.oculta')", timeout=3000)
        if guest.locator('.dc-roleta').count():
            guest.screenshot(path=str(OUT/f'carta-{step+1}.png'))
    host.wait_for_function("__descarte().G.fase==='jogo'")
    pump()
    assert host.evaluate('__descarte().G.js[__descarte().G.vez].key') == 'b'
    assert host.evaluate('__descarte().G.js[1].mao.length') == 4
    assert all(page.evaluate('__descarte().V.fase') == 'jogo' for page in pages.values())

    # Cada ação nova possui seu efeito próprio e mantém a regra da carta.
    for value in ['+6', '+10', 'inv4', 'pulaT', 'desc']:
        host.bring_to_front()
        host.evaluate('prepara', value)
        pump()
        selector = '.dc-pula-todos-marca' if value == 'pulaT' else '.dc-varre-cor' if value == 'desc' else '.dc-especial-carga'
        host.wait_for_selector(selector, state='attached')
        if value == 'pulaT':
            assert host.locator(selector).count() == 3
        if value in ['+6', '+10', 'inv4']:
            assert host.evaluate('__descarte().G.pend') == {'+6':6, '+10':10, 'inv4':4}[value]
        elif value == 'pulaT':
            assert host.evaluate('__descarte().G.js[__descarte().G.vez].key') == 'h'
        else:
            assert host.evaluate('__descarte().G.js[0].mao.length') == 1
        host.screenshot(path=str(OUT/f'efeito-{value.replace("+", "mais")}.png'))
        host.wait_for_timeout(1800)

    # Monte vazio: recicla o descarte; se não houver mais cartas, encerra sem travar.
    host.evaluate("prepara('roleta');__descarte().G.monte=[];__descarte().G.descarte=[{id:8300,c:'g',v:'2'},__descarte().G.descarte.at(-1)];__descarte().difunde()")
    pump()
    for _ in range(2):
        guest.wait_for_function("!document.querySelector('[data-roleta-compra]').disabled")
        guest.locator('[data-roleta-compra]').click()
        pump()
    assert host.evaluate("__descarte().G.ev.filter(e=>e.t==='roletaCarta').at(-1).carta===null && !__descarte().G.ev.filter(e=>e.t==='roletaCarta').at(-1).achou")
    host.wait_for_function("__descarte().G.fase==='jogo'")

    # Um timeout vira uma só carta e dá novamente tempo para o jogador continuar.
    host.evaluate("prepara('roleta');__descarte().G.op.tempo=.05;__descarte().G.roleta.liberaEm=Date.now();__descarte().difunde()")
    pump()
    guest.locator('[data-roleta-compra]').wait_for()
    guest.wait_for_function("!document.querySelector('[data-roleta-compra]').disabled")
    guest.locator('[data-roleta-compra]').click()
    pump()
    host.wait_for_function('__descarte().G.roleta.qtd===2', timeout=4000)
    host.evaluate('__descarte().G.op.tempo=0')
    assert host.evaluate('__descarte().G.roleta.qtd') == 2

    host.evaluate("prepara('roleta',-1)")
    pump()
    assert host.evaluate('__descarte().G.roleta.key') == 'c'
    assert pages['c'].locator('[data-roleta-compra]').count() == 1

    # O sucessor recebe a Roleta pela cópia normal e continua após a queda do host.
    host.evaluate("prepara('roleta')")
    pump()
    guest.wait_for_function("!document.querySelector('[data-roleta-compra]').disabled")
    guest.locator('[data-roleta-compra]').click()
    pump()
    assert host.evaluate('__descarte().G.roleta.qtd') == 1
    guest.evaluate("window.presentes=['g','b','c']")
    guest.wait_for_function("__descarte().G?.host==='g'", timeout=17000)
    assert guest.evaluate("__descarte().G.fase==='roleta' && __descarte().G.roleta.key==='g' && __descarte().G.roleta.qtd===1")
    for _ in range(8):
        if guest.evaluate('__descarte().G.fase') == 'jogo':
            break
        if guest.evaluate('__descarte().G.roleta.concluida'):
            guest.wait_for_function("__descarte().G.fase==='jogo'")
            break
        guest.wait_for_function("!document.querySelector('[data-roleta-compra]').disabled")
        guest.locator('[data-roleta-compra]').click()
    assert guest.evaluate("__descarte().G.fase==='jogo' && !__descarte().G.roleta && __descarte().G.js.length===3")
    assert not errors, errors
    print('OK: quatro clientes, Roleta manual, cores/coringas, mensagens repetidas, vez pulada, timeout, monte reciclado/vazio, sentido inverso, sucessão do host e cinco efeitos especiais; sem erros JS.')
    browser.close()
