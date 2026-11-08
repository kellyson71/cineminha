"""Regressão do Esquecido e das pilhas. Requer o servidor local na porta 8790 e Playwright."""
from pathlib import Path
from time import time
from playwright.sync_api import sync_playwright

OUT = Path('/tmp/cineminha-dobro')
OUT.mkdir(exist_ok=True)
HTML = '''<link rel="stylesheet" href="/dobradinha.css">
<link rel="stylesheet" href="/cartas-mesa.css"><link rel="stylesheet" href="/aula.css">
<style>body{margin:0}.pfp{display:grid;place-items:center;border-radius:50%;background:#aabac6;width:100%;height:100%}</style>
<div class="db" id="game"></div>'''
SETUP = '''async key => {
  window.agora = Date.now(); Date.now = () => window.agora;
  localStorage.setItem('db.mesa', JSON.stringify('brahma')); localStorage.setItem('mesa.qualidade', '3d');
  const {criaDobradinha} = await import('/dobradinha.js');
  const el = (tag, props = {}, ...kids) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...kids.flat().filter(x => x != null && x !== '')); return e;
  };
  window.saida = [];
  window.jogo = criaDobradinha({el, tela:document.querySelector('#game'), me:{key,name:key},
    icon:() => document.createElementNS('http://www.w3.org/2000/svg','svg'),
    toast:() => {}, sysMsg:() => {}, presentes:() => ['h','g','b'], nomeDe:k => k,
    pfp:(k,s,n) => el('span',{className:'pfp',textContent:n}), hydrate:() => {},
    sendTo:(k,d) => saida.push({key:k,data:structuredClone(d)}), send:() => {},
    outroJogo:() => false, audioCtx:() => {throw Error('teste sem áudio')}
  });
  window.intencao = (op, key = 'g') => jogo.got({op:{id:__db().V.id,...op}},key);
  window.prepara = (v = 2) => {
    const {G,difunde} = __db(), {seq,evN} = G;
    Object.assign(G,structuredClone(base),{seq,evN,ev:[],repor:{},esq:'h',mesa:[],valor:0});
    G.vez = G.js.findIndex(j => j.key === 'g');
    const c = G.js[G.vez].mao[0]; c.v = v; difunde();
    intencao({op:'joga',cartas:[c.id],esc:2});
  };
}'''

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/opt/google/chrome/chrome', headless=True,
                                args=['--no-sandbox'])
    errors, pages = [], []
    for key in ['h', 'g']:
        ctx = browser.new_context(viewport={'width': 1200, 'height': 700})
        ctx.route('**/api/**', lambda r: r.fulfill(json={}))
        ctx.route('**/_teste-mesa?*', lambda r: r.fulfill(content_type='text/html', body=HTML))
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(f'http://localhost:8790/_teste-mesa?sala=teste-db-mesa-{int(time())}')
        page.evaluate(SETUP, key)
        pages.append(page)
    host, guest = pages
    host.evaluate("jogo.iniciar(['g','b'])")
    host.get_by_role('button', name='Começar · 3', exact=True).click()
    host.evaluate('window.base = structuredClone(__db().G)')

    def mirror():
        packet = host.evaluate("({agora, v:saida.filter(x=>x.key==='g'&&x.data.db.v).at(-1).data.db.v})")
        guest.evaluate("x => {agora=x.agora;jogo.got({v:x.v},'h')}", packet)

    assert not host.locator('.db-cola').evaluate("e=>e.classList.contains('aberta')")
    host.locator('.db-cola__aba').click()
    assert host.locator('.db-cola__lista li').count() == 1
    for _ in range(8):
        host.locator('.db-cola__proxima').click()
    assert host.locator('.db-cola__nav span').text_content() == '1 / 8'
    host.locator('.db-cola__aba').click()

    # Arrasto real com mouse, incluindo redesenho durante o gesto e destinos inválidos.
    def drag_to(target, during=None, release=True):
        source = host.locator('.db-guarda--eu').bounding_box()
        dest = host.locator(target).bounding_box()
        host.mouse.move(source['x']+source['width']/2, source['y']+source['height']/2)
        host.mouse.down()
        host.mouse.move(dest['x']+dest['width']/2, dest['y']+dest['height']/2, steps=12)
        assert host.locator('.db-guarda--arrastando').count() == 1
        if during:
            host.evaluate(during)
        if release:
            host.mouse.up()
            assert host.locator('.db-guarda--arrastando').count() == 0

    target = '.db-assento[data-key="g"] .db-retrato'
    host.evaluate('prepara()')
    drag_to(target)
    assert host.evaluate("__db().G.esq==='h'")  # protegido
    host.evaluate('agora+=3000;__db().difunde()')
    drag_to(target, '__db().difunde()')
    assert host.evaluate("__db().G.esq==='g'")
    host.evaluate('prepara();agora+=3000;__db().difunde()')
    drag_to(target, "intencao({op:'compra'})")
    assert host.evaluate("__db().G.esq==='h'")  # comprou durante o gesto
    host.evaluate('prepara();agora+=3000;__db().difunde()')
    drag_to(target, release=False)
    host.keyboard.press('Escape')
    host.mouse.up()
    assert host.locator('.db-guarda--arrastando').count() == 0
    assert host.evaluate("__db().G.esq==='h'")
    host.locator('.db-guarda--eu').focus()
    host.keyboard.press('Enter')
    host.keyboard.press('Enter')
    assert host.evaluate("__db().G.esq==='g'")  # alternativa por teclado

    host.evaluate("prepara();__db().G.vez=__db().G.js.findIndex(j=>j.key==='h');__db().difunde()")
    own_pile = host.locator('.db-comanda--mesa[data-conta="h"]')
    host.locator('.db-btn--levar').hover()
    assert own_pile.evaluate("e=>e.classList.contains('db-recebe-mesa')")
    assert own_pile.locator('.db-comanda__entrada').text_content() == '+1'
    host.locator('.db-btn--levar').click()
    host.wait_for_timeout(1750)
    assert own_pile.locator('.db-comanda__chegaram').text_content() == '+1'

    # A compra funciona desde a jogada; nem spam nem carta de ação furam os 3 s.
    for value in [2, 'passa', 'inv', 'cur']:
        host.evaluate('prepara', value)
        assert host.evaluate('__db().G.repor.g-agora') == 12000
        assert host.evaluate("() => {const n=__db().G.seq;for(let i=0;i<100;i++)intencao({op:'guarda',alvo:'g'},'h');return __db().G.seq===n&&__db().G.esq==='h'}")
        host.evaluate("intencao({op:'compra'})")
        assert host.evaluate("!__db().G.repor.g && __db().G.esq==='h' && __db().G.js.find(j=>j.key==='g').mao.length===6")

    # Fronteira exata e atualização local sem qualquer pacote de rede.
    host.evaluate('prepara()')
    mirror()
    host.evaluate('agora += 2999')
    guest.evaluate('agora += 2999')
    host.evaluate("intencao({op:'guarda',alvo:'g'},'h')")
    assert host.evaluate("__db().G.esq==='h'")
    guest.wait_for_timeout(180)
    assert guest.locator('.db-pavio').evaluate("e=>getComputedStyle(e).visibility==='hidden'")
    assert host.locator('.db-assento.alvo-guarda').count() == 0
    before = host.evaluate('__db().G.seq')
    host.evaluate('agora++')
    guest.evaluate('agora++')
    host.wait_for_timeout(250)
    assert host.locator('.db-assento.alvo-guarda[data-key="g"]').count() == 1
    assert guest.locator('.db-pavio').evaluate("e=>getComputedStyle(e).visibility==='visible'&&e.style.getPropertyValue('--t')==='1'")
    assert host.evaluate('__db().G.seq') == before
    host.evaluate("intencao({op:'guarda',alvo:'g'},'h')")
    assert host.evaluate("__db().G.esq==='g' && !__db().G.repor.g")

    # O relógio dura 9 s após a proteção; reenvio de estado não reinicia o prazo.
    host.evaluate('prepara(); agora += 11999; __db().difunde()')
    deadline = host.evaluate('__db().G.repor.g')
    assert host.evaluate("__db().G.esq==='h'")
    host.evaluate('__db().difunde()')
    assert host.evaluate('__db().G.repor.g') == deadline
    host.evaluate('agora++')
    host.wait_for_function("__db().G.esq==='g' && !__db().G.repor.g")

    # Sem monte não há alvo válido, mesmo com uma intenção antiga pendente.
    host.evaluate('prepara(); agora+=3000; __db().G.monte=[]')
    host.evaluate("intencao({op:'guarda',alvo:'g'},'h')")
    assert host.evaluate("__db().G.esq==='h'")

    # Pilhas pertencem ao plano da mesa, inclusive para quem está jogando nesta aba.
    host.evaluate("() => {const {G,difunde}=__db();Object.assign(G,structuredClone(base),{seq:G.seq,ev:[]});G.js.forEach((j,i)=>j.conta=7+i*8);difunde()}")
    mirror()
    host.wait_for_timeout(3200)
    for page in pages:
        assert page.locator('.db-plano > .db-comanda--mesa').count() == 3
        assert page.locator('.db-assento .db-comanda, .db-eu .db-comanda').count() == 0
        for width, height in [(1200, 700), (900, 510)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.wait_for_timeout(400)
            assert page.locator('.db-comanda--mesa').evaluate_all('''ns => ns.every(n => {
              const x=parseFloat(n.style.left), y=parseFloat(n.style.top);
              return x>27&&x<73&&y>15&&y<89&&getComputedStyle(n).transformStyle==='preserve-3d';
            })''')
            page.screenshot(path=str(OUT / f'mesa-{page==host}-{width}.png'))
    host.evaluate("() => {const {G,difunde}=__db();for(const key of ['c','d','e'])G.js.push({key,nome:key,mao:[{id:900+G.js.length,v:2}],conta:24,pts:[],tot:0});difunde()}")
    host.wait_for_timeout(400)
    assert host.locator('.db-plano > .db-comanda--mesa').count() == 6
    host.screenshot(path=str(OUT / 'mesa-seis.png'))
    assert not errors, errors
    print('OK: cola paginada, arrasto com proteção/compra/redesenho/Escape, teclado, destino de recolhimento, spam, fronteira 3 s, contagem 9 s e pilhas na mesa; sem erros JS.')
    browser.close()
