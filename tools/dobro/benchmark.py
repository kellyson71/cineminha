#!/usr/bin/env python3
"""Mede download, decodificação e montagem de 57 cartas em Chromium.
Execute prepara.py antes. Requer Playwright e o servidor local do Cineminha.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse,json,statistics,xml.etree.ElementTree as ET,base64
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--saida',type=Path,default=Path('/tmp/cineminha-dobro'))
parser.add_argument('--chrome',default='/opt/google/chrome/chrome')
args=parser.parse_args()
OUT=args.saida;meta=json.loads((OUT/'fontes.json').read_text());results={}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=args.chrome,headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1400,'height':1000})
 def serve(r):
  f=OUT/r.request.url.rsplit('/',1)[-1];r.fulfill(body=f.read_bytes(),content_type={'.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.avif':'image/avif'}[f.suffix])
 page.route('**/bench-dobro/*',serve)
 page.route('**/_benchmark-dobro',lambda r:r.fulfill(content_type='text/html',body='<style>body{margin:0}#cards{display:grid;grid-template-columns:repeat(10,120px);gap:8px}.card{width:120px;height:166.6px;background-size:600% 300%;background-repeat:no-repeat;overflow:hidden}.card>svg{width:100%;height:100%}</style><main id="cards"></main>'))
 page.goto('http://localhost:8790/_benchmark-dobro')
 session=page.context.new_cdp_session(page);session.send('Performance.enable')
 candidates=['atlas-160-q82.webp','atlas-224-q72.webp','atlas-224-q82.webp','atlas-256-q82.webp','atlas-320-q82.webp','atlas-224-q55.avif','atlas-224-q70.avif','vetor.svg']
 reference=page.evaluate('''async()=>{const i=new Image;i.src='/bench-dobro/referencia.png';await i.decode();const c=document.createElement('canvas');c.width=1344;c.height=933;const x=c.getContext('2d');x.drawImage(i,0,0);window.ref=x.getImageData(0,0,c.width,c.height).data;return true}''')
 for name in candidates:
  data=page.evaluate('''async name=>{const blob=await(await fetch('/bench-dobro/'+name)).blob();const tempos=[];let img;
   for(let j=0;j<7;j++){img=new Image;const u=URL.createObjectURL(blob);const t=performance.now();img.src=u;await img.decode();tempos.push(performance.now()-t);URL.revokeObjectURL(u)}
   const c=document.createElement('canvas');c.width=1344;c.height=933;const x=c.getContext('2d');x.drawImage(img,0,0,c.width,c.height);const pixels=x.getImageData(0,0,c.width,c.height).data;let mse=0;for(let i=0;i<pixels.length;i++)if(i%4!==3)mse+=(pixels[i]-ref[i])**2;mse/=pixels.length*.75;
   window.assetUrl=URL.createObjectURL(blob);return {decode_ms:tempos,psnr_db:10*Math.log10(255**2/mse)}
  }''',name)
  svg=(OUT/'vetor.svg').read_text() if name=='vetor.svg' else None
  groups=None
  if svg:
   root=ET.fromstring(svg);ET.register_namespace('','http://www.w3.org/2000/svg');groups=[ET.tostring(g,encoding='unicode') for g in root]
  batches=[]
  for j in range(7):
   page.evaluate("document.querySelector('#cards').replaceChildren()")
   before={x['name']:x['value'] for x in session.send('Performance.getMetrics')['metrics']}
   dom=page.evaluate('''async groups=>{const cards=document.querySelector('#cards');cards.innerHTML=Array.from({length:57},(_,i)=>{const n=i%18;const art=groups?`<svg viewBox="${n%6*224} ${Math.floor(n/6)*311} 224 311">${groups[n]}</svg>`:'';return `<div class="card" style="${groups?'':`background-image:url(${assetUrl});background-position:${n%6*20}% ${Math.floor(n/6)*50}%`}">${art}</div>`}).join('');await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return cards.querySelectorAll('*').length}''',groups)
   after={x['name']:x['value'] for x in session.send('Performance.getMetrics')['metrics']}
   batches.append((after['TaskDuration']-before['TaskDuration'])*1000)
  results[name]={**meta['variants'][name],'decode_ms_median':round(statistics.median(data['decode_ms']),2),'render_main_thread_ms_median':round(statistics.median(batches),2),'psnr_db':round(data['psnr_db'],2),'dom_57_cards':dom}
  if name in ['atlas-224-q82.webp','atlas-224-q55.avif','vetor.svg']:page.screenshot(path=str(OUT/(name.replace('.','-')+'.png')))
  print(name,results[name],flush=True)
 results['environment']={'chrome':b.version,'cards':57,'card_css_px':[120,166.6],'samples':7,'note':'CPU do main thread via CDP TaskDuration; decodificação local sem rede; PSNR frente à referência de 224px; RGBA é estimativa width*height*4, não medição de memória.'}
 b.close()
(OUT/'benchmark.json').write_text(json.dumps(results,indent=2))
