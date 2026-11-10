"""Categorias, ordem de pistas e continuidade em três clientes. Servidor: porta 8790.

Usa o módulo e os assets reais, API interceptada e transporte em memória.
Execute: python tools/quadro/teste-curadoria.py
"""
from pathlib import Path
from time import time
import json
from playwright.sync_api import sync_playwright

FILMES = json.loads((Path(__file__).resolve().parents[2] / 'public/jogos/quadro/filmes.json').read_text())
FAMOSOS = sum('famosos' in f['c'] for f in FILMES)
ANIMACOES = sum('animacao' in f['c'] for f in FILMES)
BRASILEIROS = {'tt0317248', 'tt0053146', 'tt2762506', 'tt0271383', 'tt0861739', 'tt1555149',
               'tt0140888', 'tt2464018', 'tt0448927', 'tt0367975'}
assert ANIMACOES >= 50
assert {f['imdb'] for f in FILMES if 'brasil' in f['c']} == BRASILEIROS

OUT = Path('/tmp/cineminha-quadro-curadoria')
OUT.mkdir(exist_ok=True)
HTML = '''<link rel="stylesheet" href="/quadro.css">
<style>body{margin:0;background:#000}.pfp{display:grid;place-items:center;background:#674a30}</style>
<div class="qq" id="game"></div>'''
SETUP = '''async key => {
  const realNow = Date.now; window.offset = 0; Date.now = () => realNow() + offset;
  const {criaQuadro} = await import('/quadro.js');
  const el = (tag, props = {}, ...kids) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...kids.flat().filter(x => x != null && x !== '')); return e;
  };
  window.saida = []; window.presentes = ['h','g','b'];
  window.jogo = criaQuadro({el, tela:document.querySelector('#game'), me:{key,name:key},
    icon:() => document.createElementNS('http://www.w3.org/2000/svg','svg'),
    toast:() => {}, sysMsg:() => {}, presentes:() => presentes, nomeDe:k=>k,
    pfp:(k,s,n) => el('span',{className:'pfp',textContent:n}), hydrate:()=>{},
    sendTo:(k,d) => saida.push({key:k,data:structuredClone(d)}),
    send:d => presentes.filter(k=>k!==key).forEach(k=>saida.push({key:k,data:structuredClone(d)})),
    outroJogo:()=>false, audioCtx:()=>{throw Error('sem áudio no teste')}
  });
  window.acao = op => {
    const m = {id:__qq().V.id,...op};
    if (__qq().V.host === key) jogo.got({op:m},key);
    else saida.push({key:__qq().V.host,data:{qq:{op:m}}});
  };
}'''

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/opt/google/chrome/chrome', headless=True,
                                args=['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
    errors, pages = [], {}
    for key in ['h', 'g', 'b']:
        ctx = browser.new_context(viewport={'width': 1200, 'height': 675})
        ctx.route('**/api/**', lambda r: r.fulfill(json={}))
        ctx.route('**/_teste-quadro?*', lambda r: r.fulfill(content_type='text/html', body=HTML))
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(f'http://localhost:8790/_teste-quadro?sala=teste-qq-curadoria-{int(time())}')
        page.evaluate(SETUP, key)
        pages[key] = page
    host = pages['h']

    def pump():
        for _ in range(6):
            count = 0
            for sender, page in pages.items():
                for packet in page.evaluate('saida.splice(0)'):
                    if packet['key'] not in pages:
                        continue
                    count += 1
                    pages[packet['key']].evaluate('([d,k])=>jogo.got(d.qq,k)', [packet['data'], sender])
            if not count:
                return
        raise AssertionError('Mensagens não estabilizaram')

    def act(key, op):
        pages[key].evaluate('op=>acao(op)', op)
        pump()

    def check_frames():
        expected = host.evaluate('''() => {
          const {G}=__qq(), f=G.lista[G.i];
          return Array.from({length:G.passo+1},(_,i)=>`jogos/quadro/f/${f.p}/${f.ordem?.[i] ?? i}.webp`);
        }''')
        for page in pages.values():
            assert page.evaluate('__qq().V.frames') == expected
            assert page.evaluate('__qq().V.filme !== null') == host.evaluate("__qq().G.est==='revela'")
            page.wait_for_function("[...document.querySelectorAll('.qq-img,.qq-quadro img')].every(i=>i.complete && i.naturalWidth>0)")

    def start(mode, cat):
        host.evaluate("jogo.iniciar(['g','b'])")
        pump()
        host.wait_for_function("n=>[...document.querySelectorAll('.qq-cat')].some(c=>c.textContent.includes('Famosos') && c.textContent.includes(`${n} filmes`))", arg=FAMOSOS)
        assert host.locator('.qq-cat').filter(has_text='Animação').inner_text() == f'Animação\n{ANIMACOES} filmes'
        assert host.locator('.qq-cat').filter(has_text='Brasileiros').inner_text() == f'Brasileiros\n{len(BRASILEIROS)} filmes'
        act('h', {'op': 'opcao', 'modo': mode, 'cat': cat, 'filmes': 5})
        host.get_by_role('button', name='Começar', exact=True).click()
        host.wait_for_function("__qq().G.fase==='jogo'")
        pump()
        check_frames()
        if cat == 'brasil':
            assert set(host.evaluate('__qq().G.lista.map(f=>f.imdb)')) <= BRASILEIROS

    # A primeira mesa já sugere a seleção conhecida.
    host.evaluate("jogo.iniciar(['g','b'])")
    pump()
    host.wait_for_function("n=>document.querySelector('.qq-cat.on small')?.textContent===`${n} filmes`", arg=FAMOSOS)
    assert host.evaluate('__qq().G.op.cat') == 'famosos'
    host.screenshot(path=str(OUT/'menu.png'))
    host.evaluate('jogo.encerra()')
    pump()

    for mode, cat in [('corrida', 'famosos'), ('coop', 'animacao'), ('leilao', 'animacao'), ('corrida', 'brasil')]:
        start(mode, cat)
        for round_index in range(5):
            assert host.evaluate('__qq().G.i') == round_index
            if mode == 'leilao':
                for key, n in [('h', 4), ('g', 2), ('b', 3)]:
                    act(key, {'op': 'lance', 'n': n})
                assert host.evaluate('__qq().G.passo') == 1
            else:
                for step in range(2):
                    for key in pages:
                        pages[key].get_by_role('button', name='Passo', exact=True).click()
                        pump()
                    assert host.evaluate('__qq().G.passo') == step + 1
            check_frames()
            answer = host.evaluate('__qq().G.lista[__qq().G.i].t')
            guessers = ['g'] if mode in ['coop', 'leilao'] else ['g', 'h', 'b']
            for key in guessers:
                pages[key].locator('.qq-campo').fill(answer)
                pages[key].locator('.qq-chute button').click()
                pump()
            assert host.evaluate('__qq().G.est') == 'revela'
            check_frames()
            if round_index == 0:
                host.wait_for_timeout(550)
                host.screenshot(path=str(OUT/f'{mode}-{cat}-revelado.png'))
            # Avança somente a espera entre filmes, mantendo os timers reais do módulo.
            host.evaluate('offset += 7000')
            host.wait_for_function("__qq().G.est!=='revela' || __qq().G.fase==='fim'")
            pump()
        assert all(page.evaluate('__qq().V.fase') == 'fim' for page in pages.values())
        host.evaluate('jogo.encerra()')
        pump()

    # A ordem acompanha a partida salva e o sucessor, inclusive fora de 0,1,2…
    start('corrida', 'famosos')
    saved = host.evaluate("JSON.parse(localStorage.getItem('qq.G'))")
    assert saved['lista'][0]['ordem'] == host.evaluate('__qq().G.lista[0].ordem')
    successor = host.evaluate('__qq().G.sucessor')
    host_before = host.evaluate('__qq().V.frames')
    pages.pop('h')
    host.close()
    for page in pages.values():
        page.evaluate("presentes = ['g','b']")
    candidate = pages[successor]
    candidate.wait_for_timeout(1700)
    candidate.evaluate('offset += 11000')
    candidate.wait_for_function('__qq().G !== null', timeout=5000)
    host = candidate
    pump()
    assert host.evaluate('__qq().V.frames') == host_before
    assert all(page.evaluate('__qq().V.host') == successor for page in pages.values())
    check_frames()
    leaver = next(key for key in pages if key != successor)
    act(leaver, {'op': 'sai'})
    assert host.evaluate('__qq().G.js.length') == 1
    assert host.evaluate('__qq().V.frames') == host_before
    assert not errors, errors
    print('OK: categorias, 20 filmes nos três modos incluindo Brasileiros, imagens, ordem nas vistas/backup, troca de host e saída; sem pageerror.')
    print(f'Capturas: {OUT}')
    browser.close()
