"""Acompanhante de série com dois navegadores: quem projeta é também a ponte (Cena local), o convidado pergunta pela sala.
Requer servidor local em 8790, o Cena em 127.0.0.1:8799 (com cineminha.py), Playwright/Chrome e ffmpeg.
A extensão é simulada na ponte: o mesmo repasse que fundo.js faz (postMessage → fetch no Cena).
Usa o Gemini de verdade (via Cena) e a busca de capa/IMDb de verdade (api/filmes).
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os, subprocess, time, urllib.request, json
BASE = os.environ.get('CINEMINHA_TEST_URL', 'http://localhost:8790')
OUT = Path('/tmp/cineminha-companheiro'); OUT.mkdir(exist_ok=True)
VIDEO = OUT / 'Game of Thrones S01E01.mp4'
SRT = b"""1
00:00:03,000 --> 00:00:06,000
Um desertor da Patrulha da Noite foi capturado.

2
00:00:10,000 --> 00:00:13,000
Ele jurou que viu os Caminhantes Brancos.

3
00:00:30,000 --> 00:00:34,000
Voce entende por que eu fiz isso?

4
00:00:40,000 --> 00:00:45,000
Quem da a sentenca deve empunhar a espada.

5
00:01:30,000 --> 00:01:34,000
FALA DO FUTURO: ninguem deveria saber disto ainda.
"""
if not VIDEO.exists():
    # quadro do T1E01 (imagem do próprio IMDb) parado por 2 minutos
    q = '{"query":"query { title(id: \\"tt1480055\\") { primaryImage { url } } }"}'
    r = urllib.request.Request('https://caching.graphql.imdb.com/', data=q.encode(), headers={'content-type': 'application/json', 'x-imdb-client-name': 'imdb-web-next'})
    url = json.load(urllib.request.urlopen(r))['data']['title']['primaryImage']['url'].replace('._V1_.jpg', '._V1_UX1280_.jpg')
    (OUT / 'quadro.jpg').write_bytes(urllib.request.urlopen(url).read())
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-loop', '1', '-i', str(OUT / 'quadro.jpg'), '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '120',
                    '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-r', '10', '-c:a', 'aac', '-shortest', str(VIDEO)], check=True)

EXT = """addEventListener('message', async e => {
  if (e.source !== window || e.data?.cineExt !== 'netflix' || e.data.tipo !== 'cena') return
  const { id, rota, corpo } = e.data
  let r
  try { const x = await fetch('http://127.0.0.1:8799' + rota, corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {}); r = await x.json() }
  catch (err) { r = { erro: String(err), codigo: 0 } }
  ;(window.__cena ||= []).push({ rota, falas: corpo?.falas, posicao: corpo?.posicao })
  postMessage({ cineExt: 'netflix', tipo: 'cena-resp', id, r }, location.origin)
})"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/opt/google/chrome/chrome', headless=True, args=['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
    errors = []

    def context(ponte):
        c = browser.new_context(viewport={'width': 1400, 'height': 900}, permissions=['microphone'])
        c.route('**/api/**', lambda r: r.continue_() if 'api/filmes' in r.request.url else r.fulfill(json={'token': 'a' * 48, 'perfis': {}} if 'conta' in r.request.url else {}))
        c.route('**/app.js', lambda route: route.fulfill(body=route.fetch().text() + "\nwindow.__t={get share(){return myShare},peers,selfId,tiles,companheiro,enter};", content_type='text/javascript'))
        if ponte:
            c.add_init_script(EXT)
        return c
    host = context(True).new_page(); guest = context(False).new_page()
    for page in [host, guest]:
        page.on('pageerror', lambda e: errors.append(str(e)))
    room = BASE + '/?sala=teste-cena-' + str(int(time.time()))
    for page, key in [(host, 'kellyson'), (guest, 'otavio')]:
        page.goto(room); page.wait_for_function('window.__t')
        page.evaluate(f"__t.enter('teste-cena', '{key}', '{key.title()}')")
        page.wait_for_function("!document.body.classList.contains('locked')")
    host.wait_for_function('__t.peers.size>=1', timeout=45000)
    host.wait_for_function('__t.companheiro.souPonte()', timeout=10000)
    print('ponte ok')

    host.set_input_files('#fileInput', str(VIDEO))
    host.wait_for_function('__t.share?.kind==="arquivo"', timeout=15000)
    host.wait_for_function('__t.share?.midia?.imdb', timeout=30000)
    print('mídia:', host.evaluate('JSON.stringify({t:__t.share.midia.titulo,s:__t.share.midia.s,e:__t.share.midia.e,imdb:__t.share.midia.imdb,ep:__t.share.midia.epImdb})'))
    host.set_input_files('.player-settings input[type=file]', {'name': 'got.srt', 'mimeType': 'text/plain', 'buffer': SRT})
    host.wait_for_function('__t.share.cues?.length===5')
    host.evaluate('__t.share.video.currentTime=46')
    host.wait_for_timeout(1500)

    # convidado: botões aparecem (há ponte e o que passa é conhecido)
    guest.wait_for_function("document.querySelector('.cena-acoes:not([hidden])')", timeout=30000)
    guest.locator('.tile').hover(position={'x': 500, 'y': 300})
    guest.wait_for_function("Number(getComputedStyle(document.querySelector('.cena-acoes')).opacity)>.9")
    guest.screenshot(path=str(OUT / '1-botoes.png'))

    # Raio-X
    guest.locator('.cena-acoes button[title^="Raio-X"]').click()
    guest.wait_for_selector('.cena-rx__caixa', timeout=60000)
    guest.screenshot(path=str(OUT / '2-raiox.png'))
    guest.wait_for_selector('.cena-rx__lado:not([hidden])', timeout=60000)
    guest.locator('.cena-rx__caixa').first.click()
    guest.screenshot(path=str(OUT / '3-raiox-cena.png'))
    guest.keyboard.press('Escape')
    guest.wait_for_selector('.cena-rx', state='detached')

    # pergunta (atalho Q)
    guest.mouse.move(10, 10); guest.keyboard.press('q')
    guest.wait_for_selector('.cena-painel input')
    guest.fill('.cena-painel input', 'por que ele mesmo vai executar o desertor?')
    guest.keyboard.press('Enter')
    guest.wait_for_selector('.cena-resp:not(.carregando)', timeout=90000)
    guest.screenshot(path=str(OUT / '4-resposta.png'))
    print('resposta:', guest.locator('.cena-resp').first.inner_text()[:400])

    pedidos = host.evaluate('__cena.filter(x=>x.rota.startsWith("/cineminha"))')
    for x in pedidos:
        assert all(f[0] <= x['posicao'] + 1 for f in x['falas']), 'fala depois da posição'
        assert not any('FUTURO' in f[1] for f in x['falas']), 'spoiler da legenda'
        print(x['rota'], 'posição', x['posicao'], 'falas', len(x['falas']))
    assert len(pedidos) == 3 and all(len(x['falas']) == 4 for x in pedidos)

    # mostrar para a sala
    guest.locator('.cena-sala').click()
    host.wait_for_selector('.cena-card', timeout=15000)
    host.screenshot(path=str(OUT / '5-sala.png'))
    assert not errors, errors
    print('ok — capturas em', OUT)
