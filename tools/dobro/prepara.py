#!/usr/bin/env python3
"""Prepara os assets do Dobro e as alternativas usadas no benchmark.

Requer Pillow com AVIF/WebP, Potrace e pdfimages (Poppler).
Exemplo: python tools/dobro/prepara.py --origem ~/Downloads/'Dobro (EN PT-BR) - 3366858020' --aplicar
"""
from pathlib import Path
from PIL import Image,ImageOps
import argparse,json,io,gzip,subprocess,xml.etree.ElementTree as ET,time,shutil,hashlib
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--origem',type=Path,required=True,help='Pasta do mod baixado (contendo assets/)')
parser.add_argument('--saida',type=Path,default=Path('/tmp/cineminha-dobro'))
parser.add_argument('--aplicar',action='store_true',help='Grava os assets escolhidos em public/jogos/dobro')
args=parser.parse_args()
SRC=args.origem/'assets';OUT=args.saida;OUT.mkdir(parents=True,exist_ok=True)
atlas=Image.open(SRC/'07_FaceURL.jpg').convert('RGB')
names=['passa','inv','cur',*map(str,range(2,13))]
imgs=[]
for i in range(14):
 box=(round(i%10*atlas.width/10)+1,round(i//10*atlas.height/6)+1,round((i%10+1)*atlas.width/10)-1,round((i//10+1)*atlas.height/6)-1)
 imgs.append(atlas.crop(box))
for name,file in [('verso','08_BackURL.jpg'),('esquecido','04_BackURL_FaceURL.jpg'),('sentido','05_FaceURL.jpg'),('sentido-inverso','06_BackURL.jpg')]:names.append(name);imgs.append(Image.open(SRC/file).convert('RGB'))
meta={'names':names,'original_bytes':sum((SRC/f).stat().st_size for f in ['07_FaceURL.jpg','08_BackURL.jpg','04_BackURL_FaceURL.jpg','05_FaceURL.jpg','06_BackURL.jpg']),'variants':{}}
for w in [160,224,256,320]:
 h=round(w*25/18);sheet=Image.new('RGB',(w*6,h*3))
 for i,img in enumerate(imgs):sheet.paste(img.resize((w,h),Image.Resampling.LANCZOS),(i%6*w,i//6*h))
 for fmt,qualities in [('webp',[72,82,90]),('avif',[55,70])]:
  for q in qualities:
   fn=f'atlas-{w}-q{q}.{fmt}';start=time.monotonic();sheet.save(OUT/fn,quality=q,**({'method':6} if fmt=='webp' else {'speed':6}))
   meta['variants'][fn]={'bytes':(OUT/fn).stat().st_size,'width':sheet.width,'height':sheet.height,'rgba_bytes':sheet.width*sheet.height*4}
# Source PNG contact sheet, so browser fidelity compares equal output dimensions.
w,h=224,311;sheet=Image.new('RGB',(w*6,h*3))
for i,img in enumerate(imgs):sheet.paste(img.resize((w,h),Image.Resampling.LANCZOS),(i%6*w,i//6*h))
sheet.save(OUT/'referencia.png');meta['variants']['referencia.png']={'bytes':(OUT/'referencia.png').stat().st_size,'width':sheet.width,'height':sheet.height,'rgba_bytes':sheet.width*sheet.height*4}
# A flat-color SVG version: 12-color quantization and smooth Potrace outlines.
parts=[]
for i,img in enumerate(imgs):
 small=img.resize((224,311),Image.Resampling.LANCZOS);quant=small.quantize(colors=12,dither=Image.Dither.NONE);pal=quant.getpalette();paths=[]
 for color,count in sorted([(c,n) for n,c in quant.getcolors()],key=lambda x:-x[1]):
  if count<4:continue
  mask=quant.point(lambda x:0 if x==color else 255,'1');mask.save(OUT/'mask.pbm')
  subprocess.run(['potrace',str(OUT/'mask.pbm'),'-s','-o',str(OUT/'mask.svg'),'--turdsize','3','--opttolerance','0.5'],check=True)
  root=ET.parse(OUT/'mask.svg').getroot();g=root.find('{*}g');rgb=pal[color*3:color*3+3];fill='#%02x%02x%02x'%tuple(rgb)
  d=''.join(p.attrib['d'].replace('\n',' ') for p in g.findall('{*}path'))
  paths.append(f'<path fill="{fill}" stroke="{fill}" stroke-width="10" d="{d}"/>')
 parts.append(f'<g transform="translate({i%6*w} {i//6*h+h}) scale(.1 -.1)">'+''.join(paths)+'</g>')
svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{w*6}" height="{h*3}" viewBox="0 0 {w*6} {h*3}">'+''.join(parts)+'</svg>'
(OUT/'vetor.svg').write_text(svg)
meta['variants']['vetor.svg']={'bytes':len(svg.encode()),'gzip_bytes':len(gzip.compress(svg.encode())),'width':w*6,'height':h*3,'paths':svg.count('<path')}
(OUT/'fontes.json').write_text(json.dumps(meta,indent=2))
if args.aplicar:
 dest=Path(__file__).resolve().parents[2]/'public/jogos/dobro';dest.mkdir(parents=True,exist_ok=True)
 for ext,q in [('avif',55),('webp',82)]:shutil.copyfile(OUT/f'atlas-224-q{q}.{ext}',dest/f'cartas.{ext}')
 # A capa original está no manual do próprio pacote, sem recriar o nome ou a arte.
 subprocess.run(['pdfimages','-f','1','-l','1','-png',str(SRC/'03_PDFUrl.pdf'),str(OUT/'manual')],check=True)
 capa=Image.open(OUT/'manual-000.png').convert('RGB').crop((0,30,1172,1202))
 capa.resize((640,640),Image.Resampling.LANCZOS).save(dest/'capa.webp',quality=82,method=6)
 capa.resize((160,160),Image.Resampling.LANCZOS).save(dest/'miniatura.webp',quality=78,method=6)
 verso=Image.open(SRC/'08_BackURL.jpg').convert('RGB')
 marca=verso.crop((round(verso.width*.14),round(verso.height*.26),round(verso.width*.85),round(verso.height*.42)))
 marca.resize((320,100),Image.Resampling.LANCZOS).save(dest/'marca.webp',quality=85,method=6)
meta['source_sha256']={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in SRC.glob('*') if f.suffix in ['.jpg','.pdf']}
(OUT/'fontes.json').write_text(json.dumps(meta,indent=2))
print(json.dumps(meta,indent=2))
