"""Partida de Uno Sem Piedade em quatro navegadores, com transporte P2P do app."""
from pathlib import Path
from time import time
from playwright.sync_api import sync_playwright

OUT = Path('/tmp/cineminha-uno-roleta')
OUT.mkdir(exist_ok=True)
KEYS = ['kellyson', 'otavio', 'milenny', 'pedro']
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/opt/google/chrome/chrome', headless=True,
        args=['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
    pages, errors = {}, []
    room = f'http://localhost:8790/?sala=teste-dc-roleta-{int(time())}'
    for key in KEYS:
        ctx = browser.new_context(viewport={'width':1400,'height':900}, permissions=['microphone'])
        ctx.route('**/api/**', lambda r: r.fulfill(json={'token':'a'*48,'perfis':{}} if 'conta' in r.request.url else {}))
        ctx.route('**/app.js', lambda r: r.fulfill(content_type='text/javascript', body=r.fetch().text()+
            '\nwindow.__unoApp={peers,me,carregaJogo,get room(){return room}};'))
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(room)
        page.wait_for_function('typeof __unoApp!=="undefined"')
        if page.locator('#pw').is_visible():
            page.fill('#pw', 'cineminha')
        page.locator('.whocard').filter(has=page.locator(f'input[value={key}]')).click()
        page.wait_for_function("!document.body.classList.contains('locked')")
        pages[key] = page
        print('login', key, flush=True)
    host = pages[KEYS[0]]
    host.wait_for_function('__unoApp.peers.size===3', timeout=40000)
    host.locator('#btnJogo').click()
    host.locator('.jogosmenu__card').filter(has_text='Uno').click()
    for page in pages.values():
        page.wait_for_function('typeof __descarte!=="undefined"')
        page.evaluate("async()=>window.__unoGame=await __unoApp.carregaJogo('dc')")
    for key in KEYS[1:]:
        pages[key].get_by_role('button', name='Jogar', exact=True).evaluate('(e)=>e.click()')
    host.evaluate("()=>{const {G,difunde}=__descarte();for(const k of Object.keys(G.op))G.op[k]=false;G.op.semPiedade=G.op.acumula=true;difunde()}")
    host.get_by_role('button', name='Começar com 4', exact=True).click()
    host.wait_for_timeout(4000)
    host.evaluate('window.base=structuredClone(__descarte().G)')
    total = host.evaluate('__descarte().G.monte.length+__descarte().G.descarte.length+__descarte().G.js.reduce((n,j)=>n+j.mao.length,0)')

    # Roleta: o jogador real recebe o aviso e compra pelo botão de sua própria aba.
    host.evaluate("""()=>{const {G,difunde}=__descarte();G.js.sort((a,b)=>['kellyson','otavio','milenny','pedro'].indexOf(a.key)-['kellyson','otavio','milenny','pedro'].indexOf(b.key));G.vez=0;G.dir=1;G.cor='r';G.ev=[];
      G.js[0].mao=[{id:9000,c:null,v:'roleta'},{id:9001,c:'r',v:'2'}];G.js[1].mao=[{id:9010,c:'b',v:'3'}];
      G.descarte=[{id:9020,c:'r',v:'1'}];G.monte=[{id:9032,c:'r',v:'7'},{id:9031,c:null,v:'cor'},{id:9030,c:'b',v:'4'}];difunde()}""")
    host.locator('.dc-mao .dc-carta[data-id="9000"]').evaluate('(e)=>e.click()')
    host.locator('.dc-cores [data-cor="r"]').first.dispatch_event('click')
    target = pages['otavio']
    target.wait_for_selector('.dc-roleta')
    assert host.evaluate('__descarte().G.js[1].mao.length') == 1
    for n in range(3):
        target.wait_for_function("document.querySelector('[data-roleta-compra]')&&!document.querySelector('[data-roleta-compra]').disabled")
        target.locator('[data-roleta-compra]').click()
        host.wait_for_function('(n)=>__descarte().G.roleta?.qtd===n', arg=n+1)
        target.wait_for_timeout(450)
        if n == 1:
            target.locator('.dc').screenshot(path=str(OUT/'roleta-p2p.png'))
    host.wait_for_function('__descarte().G.fase==="jogo"')
    assert host.evaluate('__descarte().G.js[__descarte().G.vez].key') == 'milenny'
    print('Roleta P2P: 3 compras individuais, coringa não encerra, alvo perde a vez', flush=True)

    # Partida inteira com o baralho real e todas as ações novas habilitadas.
    host.evaluate("()=>{const {G,difunde}=__descarte(),{seq,evN}=G;Object.assign(G,structuredClone(base),{seq,evN,ev:[]});difunde()}")
    for turn in range(700):
        g = host.evaluate('__descarte().G')
        if g['fase'] == 'fim':
            break
        player = g['js'][g['vez']]
        page = pages[player['key']]
        page.wait_for_function('(s)=>__descarte().V.seq>=s', arg=g['seq'])
        if g['fase'] == 'roleta':
            if g['roleta']['concluida']:
                host.wait_for_function('__descarte().G.fase!=="roleta"')
                continue
            page.wait_for_function("document.querySelector('[data-roleta-compra]')&&!document.querySelector('[data-roleta-compra]').disabled")
            page.locator('[data-roleta-compra]').click()
        else:
            top = g['descarte'][-1]
            possible = [c for c in player['mao'] if c['v'] in ['+2','+4','+6','+10','inv4']] if g['pend'] else [
                c for c in player['mao'] if not c['c'] or c['c'] == g['cor'] or c['v'] == top['v']]
            possible.sort(key=lambda c: (c['c'] is None, c['v']))
            if possible:
                c = possible[0]
                page.locator(f'.dc-mao .dc-carta[data-id="{c["id"]}"]').evaluate('(e)=>e.click()')
                # Cartas iguais ficam selecionadas para permitir jogar mais de uma.
                if page.locator('.dc-controles button').filter(has_text='Jogar').count():
                    page.locator('.dc-controles button').filter(has_text='Jogar').first.evaluate('(e)=>e.click()')
                if page.locator('.dc-cores').count():
                    color = max('rygb', key=lambda col: sum(x['c'] == col for x in player['mao']))
                    page.locator(f'.dc-cores [data-cor="{color}"]').first.dispatch_event('click')
            elif page.locator('.dc-controles button').filter(has_text='Passar a vez').count():
                page.get_by_role('button', name='Passar a vez', exact=True).click()
            else:
                page.locator('.dc-controles button').filter(has_text='Comprar').first.click()
        host.wait_for_function('(s)=>__descarte().G.seq>s', arg=g['seq'])
        if turn % 30 == 0:
            ids = host.evaluate('__descarte().G.js.flatMap(j=>j.mao).concat(__descarte().G.monte,__descarte().G.descarte).map(c=>c.id)')
            assert len(ids) == len(set(ids)) == total
            print('jogada', turn, 'monte', host.evaluate('__descarte().G.monte.length'), flush=True)
    assert host.evaluate('__descarte().G.fase') == 'fim'
    host.locator('.dc').screenshot(path=str(OUT/'partida-fim.png'))
    assert not errors, errors
    print('OK: rodada completa em', turn, 'ações, sem perda/duplicação de cartas nem erros JS.', flush=True)
    browser.close()
