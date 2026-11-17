"""Live da namorada com três navegadores na sala P2P de verdade: estúdio, ela e o celular (câmera falsa).
Requer o servidor local em 8790 (node tools/dev.mjs) e Playwright com o Chrome. Os prints ficam em /tmp/cineminha-live.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os, time, random, string
BASE = os.environ.get('CINEMINHA_TEST_URL', 'http://localhost:8790')
OUT = Path('/tmp/cineminha-live'); OUT.mkdir(exist_ok=True)
COD = 'teste' + ''.join(random.choices(string.ascii_lowercase, k=5))
ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']

def espera(page, js, seg=40, msg=''):
    fim = time.time() + seg
    while time.time() < fim:
        if page.evaluate(js): return True
        time.sleep(.5)
    raise AssertionError('tempo esgotado: ' + (msg or js))

with sync_playwright() as p:
    nav = p.chromium.launch(channel='chrome', headless=True, args=ARGS)
    ctx = nav.new_context(viewport={'width': 1600, 'height': 900}, permissions=['camera', 'microphone'])
    log = []
    est = ctx.new_page(); est.on('console', lambda m: log.append(('estudio', m.type, m.text)))
    est.goto(f'{BASE}/live/estudio.html?c={COD}&debug')
    espera(est, '!!window.__estudio', msg='estúdio carregou')
    est.click('#btnVivo')
    # "jogo" falso: canvas animado no lugar da janela do Greenlight
    est.evaluate('''() => { const c = document.createElement('canvas'); c.width = 1920; c.height = 1080; const g = c.getContext('2d'); let t = 0
      setInterval(() => { t++; g.fillStyle = `hsl(${t % 360},70%,45%)`; g.fillRect(0,0,1920,1080); g.fillStyle = '#fff'; g.font = 'bold 160px sans-serif'; g.fillText('JOGO ' + t, 200, 560) }, 33)
      window.__estudio.comp.jogo(c.captureStream(30).getVideoTracks()[0]) }''')

    cam = ctx.new_page(); cam.on('console', lambda m: log.append(('cam', m.type, m.text)))
    cam.goto(f'{BASE}/live/cam.html?c={COD}'); cam.click('#ligar')

    ela = ctx.new_page(); ela.on('console', lambda m: log.append(('ela', m.type, m.text)))
    ela.goto(f'{BASE}/live/?c={COD}'); ela.click('#btnEntrar')

    espera(est, "document.querySelector('#chipEla').classList.contains('on')", 60, 'estúdio vê ela')
    espera(est, "document.querySelector('#chipCam').classList.contains('on')", 60, 'estúdio vê a câmera')
    espera(ela, "document.querySelector('video.jogo').videoWidth > 0", 60, 'vídeo chegou nela')
    print('vídeo nela:', ela.evaluate("[document.querySelector('video.jogo').videoWidth, document.querySelector('video.jogo').videoHeight]"))
    time.sleep(2); ela.screenshot(path=OUT / '1-comecando.png'); est.screenshot(path=OUT / '1-estudio.png')

    est.keyboard.press('2'); time.sleep(3)
    espera(ela, "document.querySelector('.palco .cena.ativa')?.dataset.cena === 'jogo'", 10, 'cena jogo nela')
    ela.screenshot(path=OUT / '2-jogo.png')

    ela.fill('#msg', 'oi amor, boa live!'); ela.press('#msg', 'Enter')
    espera(est, "document.querySelector('#msgs').textContent.includes('boa live')", 15, 'chat chegou no estúdio')
    est.fill('#msg', 'valeu, inscrita número 1'); est.press('#msg', 'Enter')
    espera(ela, "document.querySelector('#msgs').textContent.includes('inscrita número 1')", 15, 'resposta chegou nela')

    # saldo por tempo assistido: começa com R$ 10, então R$ 50 fica bloqueado; depois de um presente de R$ 50, passa
    est.click('.abas [data-aba="ajustes"]')
    est.select_option('#cartModo', 'tempo'); est.fill('#cartInicial', '10'); est.dispatch_event('#cartInicial', 'input')
    est.click('#metaLiga'); est.fill('#metaAlvo', '100'); est.dispatch_event('#metaAlvo', 'input'); est.click('#metaZera')
    espera(ela, "!document.querySelector('#saldo').hidden", 15, 'saldo apareceu nela')
    ela.click('#btnPix')
    espera(ela, "document.querySelector('#valores button[data-v=\"50\"]').disabled", 10, 'R$ 50 bloqueado sem saldo')
    ela.click('#cancelaPix')
    est.click('[data-presente="50"]')
    espera(ela, "document.querySelector('#saldoV').textContent.includes('60')", 15, 'presente chegou no saldo')
    ela.click('#btnPix'); ela.click('#valores button[data-v="50"]'); ela.click('#vozes [data-voz="esquilo"]')
    ela.fill('#msgPix', 'pra comprar um carro que não seja roubado'); ela.click('#enviaPix')
    espera(est, "document.querySelector('#metaInfo').textContent.includes('50,00 de')", 15, 'meta somou o pix')
    espera(ela, "document.querySelector('#saldoV').textContent.includes('10')", 15, 'saldo descontou o pix')
    espera(ela, "document.querySelector('.palco .pix').classList.contains('toca')", 15, 'pix tocou nela')
    time.sleep(2.2); ela.screenshot(path=OUT / '3-pix.png')
    espera(est, "document.querySelector('#totalPix').textContent.includes('50')", 5, 'total do pix no estúdio')

    # pedido de música: ela busca e escolhe; entra como próxima na fila do estúdio
    ela.click('#btnPedir'); ela.fill('#buscaPedido', 'evidencias chitaozinho'); ela.press('#buscaPedido', 'Enter')
    espera(ela, "document.querySelectorAll('#achados [data-j]').length > 0", 30, 'resultados da busca')
    ela.click('#achados [data-j="0"]')
    espera(est, "document.querySelector('#msgs').textContent.includes('pediu')", 15, 'pedido chegou no estúdio')
    espera(ela, "document.querySelector('#msgs').textContent.includes('Pedido na fila')", 15, 'confirmação do pedido nela')
    est.click('.abas [data-aba="radio"]'); time.sleep(1)
    espera(est, "[...document.querySelectorAll('#fila .item')].some(x => x.textContent.includes('pedido de'))", 10, 'pedido na fila')
    est.click('#rJogo'); est.click('#rProx'); time.sleep(3)
    espera(est, "document.querySelector('#rArtista').textContent.includes('pedido de')", 30, 'pedido tocando')
    est.screenshot(path=OUT / '3b-estudio-radio.png')
    # enquete: ele aposta em A, ela vota em B; no fim aparece que ele errou
    est.click('.abas [data-aba="enquete"]')
    est.fill('#enqPergunta', 'Rouba o banco ou o carro-forte?')
    ins = est.locator('#enqOps input'); ins.nth(0).fill('Banco'); ins.nth(1).fill('Carro-forte')
    est.select_option('#enqTempo', '30'); est.click('#formEnq button[type=submit]')
    espera(ela, "!document.querySelector('#enqCard').hidden", 15, 'enquete apareceu nela')
    est.click('#enqRes [data-aposta="0"]')
    ela.click('#enqOps [data-i="1"]')
    espera(est, "document.querySelector('#enqRes').textContent.includes('1 voto')", 15, 'voto chegou')
    time.sleep(1.5); ela.screenshot(path=OUT / '3c-enquete-aberta.png')
    est.click('#enqEncerra')
    espera(ela, "document.querySelector('.palco .enquete').classList.contains('fim')", 15, 'resultado nela')
    time.sleep(1.5); ela.screenshot(path=OUT / '3d-enquete-fim.png')
    assert 'errou' in ela.inner_text('.palco .enq-pe'), ela.inner_text('.palco .enq-pe')
    # câmera em cima à esquerda, grande; chat e contagem do lançamento na tela
    est.click('#camCantos [data-canto="tl"]'); est.click('#camTam [data-tam="g"]')
    est.click('#atChat'); est.click('#atLanc')
    ela.fill('#msg', 'olha o carro rosa ali!'); ela.press('#msg', 'Enter')
    time.sleep(2.5); ela.screenshot(path=OUT / '3e-cam-chat.png')
    est.click('#camCantos [data-canto="br"]'); est.click('#camTam [data-tam="m"]')
    # checklist
    est.click('#btnChecar'); time.sleep(6); est.screenshot(path=OUT / '3f-checar.png'); est.click('#fechaCheck')
    est.evaluate("document.activeElement.blur()")
    ela.click('#btnLigar')
    espera(est, "!!document.querySelector('.palco .chamada .linha.on')", 20, 'ligação no estúdio')
    time.sleep(2.5); ela.screenshot(path=OUT / '4-linha.png'); est.screenshot(path=OUT / '4-estudio.png')

    # amigo pelo link dos amigos, sem conta: digita o nome, conversa e entra na ligação junto com ela
    amg = ctx.new_page(); amg.on('console', lambda m: log.append(('amigo', m.type, m.text)))
    amg.goto(f'{BASE}/live/?c={COD}&amigos')
    amg.wait_for_selector('#nomeEntrada:not([hidden])', timeout=15000)
    amg.fill('#nomeEntrada', 'Otávio'); amg.click('#btnEntrar')
    espera(est, "document.querySelector('#chipAmigos span').textContent.includes('1 amigo')", 60, 'estúdio vê o amigo')
    espera(amg, "document.querySelector('video.jogo').videoWidth > 0", 60, 'vídeo chegou no amigo')
    amg.fill('#msg', 'salve, cheguei!'); amg.press('#msg', 'Enter')
    espera(est, "document.querySelector('#msgs').textContent.includes('Otávio')", 15, 'nome do amigo no chat do estúdio')
    espera(ela, "document.querySelector('#msgs').textContent.includes('Otávio')", 15, 'nome do amigo no chat dela')
    amg.click('#btnLigar')
    espera(est, "document.querySelectorAll('.palco .chamada .linha').length === 2", 20, 'dois avatares na ligação')
    est.click('#avLugar [data-av="cam"]')
    time.sleep(2.5); amg.screenshot(path=OUT / '4b-amigo.png'); est.screenshot(path=OUT / '4c-estudio-chamada.png')
    amg.click('#btnLigar')

    est.evaluate('document.activeElement.blur()')
    est.keyboard.press('3'); time.sleep(4)
    espera(ela, "document.querySelector('.palco .cena.ativa')?.dataset.cena === 'volto'", 10, 'cena volto nela'); ela.screenshot(path=OUT / '5-volto.png')
    # câmera em tela cheia (cena 5), com zoom e giro; lançamento (cena 6)
    est.click('.abas [data-aba="ajustes"]'); est.fill('#camZoom', '1.5'); est.dispatch_event('#camZoom', 'input'); est.click('#camGirar')
    est.evaluate('document.activeElement.blur()')
    est.keyboard.press('5'); time.sleep(3)
    espera(ela, "document.querySelector('.palco').classList.contains('so-cam')", 10, 'câmera cheia nela')
    ela.screenshot(path=OUT / '5b-camera.png')
    est.click('#camGirar'); est.click('#camGirar'); est.click('#camGirar'); est.click('#camCentro')
    est.evaluate('document.activeElement.blur()')
    est.keyboard.press('6'); time.sleep(3)
    espera(ela, "document.querySelector('.palco .cena.ativa')?.dataset.cena === 'lancamento'", 10, 'lançamento nela')
    ela.screenshot(path=OUT / '5c-lancamento.png'); est.screenshot(path=OUT / '5d-estudio-ajustes.png')
    est.keyboard.press('4'); time.sleep(6)
    espera(ela, "document.querySelector('.palco .cena.ativa')?.dataset.cena === 'fim'", 10, 'cena fim nela'); ela.screenshot(path=OUT / '6-fim.png')
    ela.set_viewport_size({'width': 400, 'height': 860}); time.sleep(1); ela.screenshot(path=OUT / '7-celular.png', full_page=True)

    erros = [l for l in log if l[1] == 'error']
    print('erros no console:', len(erros)); [print(' ', e) for e in erros[:15]]
    print('ok, prints em', OUT)
    nav.close()
