"""Player com dois navegadores conectados por WebRTC. APIs interceptadas: não escreve no banco.
Requer servidor local em 8790, Playwright/Chrome e ffmpeg.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os, subprocess, time
ROOT=Path(__file__).resolve().parents[1]
BASE=os.environ.get('CINEMINHA_TEST_URL','http://localhost:8790')
OUT=Path('/tmp/cineminha-player');OUT.mkdir(exist_ok=True)
VIDEO=OUT/'filme-teste.mp4'
if not VIDEO.exists():
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=1280x720:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','12','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-y',str(VIDEO)],check=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/opt/google/chrome/chrome',headless=True,args=['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'])
 errors=[]
 def context():
  c=browser.new_context(viewport={'width':1400,'height':950},permissions=['microphone'])
  c.route('**/api/**',lambda r:r.fulfill(json={'token':'a'*48,'perfis':{}} if 'conta' in r.request.url else {}))
  def instrument(route):
   route.fulfill(body=route.fetch().text()+"\nwindow.__player={get share(){return myShare},get actions(){return actions},peers,pcsOf,selfId};",content_type='text/javascript')
  c.route('**/app.js',instrument)
  return c
 host=context().new_page();guest=context().new_page()
 for page in [host,guest]:page.on('pageerror',lambda e:errors.append(str(e)))
 room=BASE+'/?sala=teste-player-'+str(int(time.time()))
 for page,key in [(host,'kellyson'),(guest,'otavio')]:
  page.goto(room);page.fill('#pw','cineminha');page.locator('.whocard').filter(has=page.locator('input[value='+key+']')).click();page.wait_for_function("!document.body.classList.contains('locked')")
 host.wait_for_function('__player.peers.size>=1',timeout=45000)
 host.set_input_files('#fileInput',str(VIDEO))
 host.wait_for_function('__player.share?.kind==="arquivo" && __player.share.video.paused',timeout=15000)
 assert host.locator('#leader').count()==0
 assert host.locator('.tile--file video').evaluate('(v)=>v.controls') is False
 assert host.evaluate('__player.share.video.currentTime')<.2
 host.wait_for_timeout(1700)
 assert host.evaluate('__player.share.video.currentTime')<.2
 guest.wait_for_selector('.tile.file-session .tile__preview:not([hidden])',timeout=30000)
 guest.wait_for_function("document.querySelector('.tile__preview')?.naturalWidth>0")
 for page in [host,guest]:
  page.locator('.tile').hover(position={'x':500,'y':150})
  page.wait_for_function("Number(getComputedStyle(document.querySelector('.player-controls')).opacity)>.9")
 host.screenshot(path=str(OUT/'pausado.png'));guest.screenshot(path=str(OUT/'convidado-pausado.png'))
 guest.locator('.player-bar > button').first.click()
 host.wait_for_function('!__player.share.video.paused && __player.share.video.currentTime>.3')
 host.locator('.tile--file video').click(position={'x':450,'y':100})
 host.wait_for_function('__player.share.video.paused')
 guest.wait_for_selector('.tile.paused')
 # Busca no tempo por participante e velocidade compartilhada.
 seek=guest.locator('.player-seek');seek.evaluate("e=>{e.value=4;e.dispatchEvent(new Event('change',{bubbles:true}))}")
 host.wait_for_function('Math.abs(__player.share.video.currentTime-4)<.2')
 guest.locator('.tile').hover(position={'x':400,'y':150});guest.locator('.player-button[title="Opções do vídeo"]').click()
 guest.select_option('.player-settings select[aria-label="Velocidade do filme"]','1.5')
 host.wait_for_function('__player.share.video.playbackRate===1.5')
 guest.select_option('.player-settings select[aria-label="Qualidade da projeção"]','480')
 host.wait_for_function("[...__player.pcsOf().values()].some(pc=>pc.getSenders().some(s=>s.track?.kind==='video' && s.getParameters().encodings[0]?.scaleResolutionDownBy>=1.4))",timeout=15000)
 # Legendas próprias, ativar/desativar no player.
 host.locator('.tile').hover(position={'x':400,'y':100});host.locator('.player-button[title="Opções do vídeo"]').click()
 host.set_input_files('.player-settings input[type=file]',{'name':'teste.srt','mimeType':'text/plain','buffer':b'1\n00:00:00,000 --> 00:00:11,000\nLegenda do teste\n'})
 guest.wait_for_selector('.tile__sub:not(:empty)')
 guest.locator('.player-button[title="Ativar ou desativar legendas"]').click()
 assert guest.locator('.tile__sub').inner_text()==''
 guest.locator('.player-button[title="Ativar ou desativar legendas"]').click()
 assert guest.locator('.tile__sub').inner_text()=='Legenda do teste'
 # Entrar depois do filme anexado continua mostrando a prévia pausada.
 late=context().new_page();late.on('pageerror',lambda e:errors.append(str(e)))
 late.goto(room);late.fill('#pw','cineminha');late.locator('.whocard').filter(has=late.locator('input[value=gabi]')).click()
 late.wait_for_selector('.tile.file-session .tile__preview:not([hidden])',timeout=45000)
 # Hover e controles próprios também em tela cheia.
 guest.locator('.tile').hover(position={'x':400,'y':100});guest.locator('.player-button[title="Tela cheia"]').click()
 guest.wait_for_function('!!document.fullscreenElement')
 guest.locator('.tile').hover(position={'x':450,'y':200})
 guest.screenshot(path=str(OUT/'tela-cheia.png'))
 assert not errors,errors
 browser.close()
 print('PASS: arquivo pausado, prévia para convidados, play/pausa e busca compartilhados, qualidade real, velocidade, legendas e tela cheia.')
