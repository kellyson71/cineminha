from playwright.sync_api import sync_playwright
from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parents[2]/'public/jogos/codnames'
OUT=Path('/tmp/codnames');OUT.mkdir(exist_ok=True)
meta=json.loads((root/'sons/origem.json').read_text())
assert hashlib.sha256((root/'sons/efeitos.mp3').read_bytes()).hexdigest()==meta['sha256']
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/opt/google/chrome/chrome',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1280,'height':950}); errors=[]; req=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:req.append(r.url))
 page.goto('http://localhost:8790/jogos/codnames/sons.html')
 assert page.locator('.som').count()==15
 assert page.locator('.som .uso').count()==15
 assert page.title()=='Sons do Codnames · Cineminha'
 assert page.evaluate("async()=>{const {EFEITOS}=await import('./audio.js');return Object.values(EFEITOS).filter(e=>e.confirmado).length}")==14
 assert not any(u.endswith('/efeitos.mp3') for u in req)
 page.get_by_role('button',name='Ouvir Teste de volume',exact=True).click()
 page.wait_for_function("document.querySelector('#status').textContent.includes('Escolha outro')")
 assert len([u for u in req if u.endswith('/efeitos.mp3')])==1
 # O navegador decodifica o MP3 e todos os recortes têm áudio e estão nos limites.
 result=page.evaluate('''async()=>{
  const {EFEITOS,criaSonsCodnames}=await import('./audio.js');
  const ac=new AudioContext();const bytes=await(await fetch('./sons/efeitos.mp3')).arrayBuffer();
  const buffer=await ac.decodeAudioData(bytes),data=buffer.getChannelData(0);
  const cortes=Object.entries(EFEITOS).map(([nome,e])=>{
    const a=Math.floor(e.inicio*buffer.sampleRate),fim=Math.floor((e.inicio+e.duracao)*buffer.sampleRate);
    let soma=0;for(let i=a;i<fim;i++)soma+=data[i]*data[i];
    return {nome,inicio:e.inicio,duracao:e.duracao,valido:fim<=data.length,rms:Math.sqrt(soma/(fim-a))};
  });
  const saida=ac.createGain();saida.gain.value=0;saida.connect(ac.destination);
  const sons=criaSonsCodnames({audioCtx:()=>ac,saida:()=>saida});
  const n=await sons.tocar('win',{volume:.2});const mixer=n.context===ac;
  sons.parar();sons.destruir();const fechado=await sons.tocar('click')===null;
  await ac.close();return {duracao:buffer.duration,cortes,mixer,fechado};
 }''')
 assert result['mixer'] and result['fechado']
 assert all(x['valido'] and x['rms']>.001 for x in result['cortes']),result
 for name,vals in meta['efeitos'].items():
  cut=next(x for x in result['cortes'] if x['nome']==name)
  assert [cut['inicio'],cut['duracao']]==vals
 page.get_by_role('button',name='Ouvir Vitória',exact=True).click()
 page.wait_for_function("document.querySelector('#status').textContent==='Tocando: Vitória'")
 page.get_by_role('button',name='Parar',exact=True).click()
 assert page.locator('#status').text_content()=='Reprodução interrompida.'
 assert page.locator('[aria-pressed=true]').count()==0
 page.screenshot(path=str(OUT/'galeria.png'))
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(OUT/'galeria-mobile.png'),full_page=True)
 assert not errors,errors
 print('OK: hash original, 15 recortes com áudio, tempos exatos do site, carregamento sob demanda, mixer, parar/destruir e galeria desktop/celular; sem erros JS.')
 print(json.dumps(result,indent=2))
 b.close()
