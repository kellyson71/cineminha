#!/usr/bin/env python3
"""Coleta playlists reais e importa a seleção revisada na fila do Faixa a Faixa."""
import argparse
import concurrent.futures
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.request

AQUI=Path(__file__).resolve().parent
sys.path.insert(0,str(AQUI))
import disney_desenhos as W

CACHE=Path('/tmp/faixa-playlists')
SELECAO=AQUI/'listas/disney_desenhos_playlist_selecao.json'
CATALOGO_FONTES=AQUI/'listas/disney_desenhos_playlist_catalogo.json'
PLAYLISTS=[
 (7549092142,'disney','editorial'),
 (11842843521,'disney','editorial'),
 (11842839421,'disney','editorial'),
 (7523895322,'desenhos','descoberta'),
 (15845550241,'desenhos','descoberta'),
 (6490856624,'desenhos','descoberta'),
 (4808901304,'desenhos','descoberta'),
 (11101547744,'desenhos','descoberta'),
 (14516929363,'desenhos','descoberta'),
]

def grava(p,dados):
 p.parent.mkdir(parents=True,exist_ok=True)
 tmp=p.with_suffix(f'.{os.getpid()}.tmp');tmp.write_text(json.dumps(dados,ensure_ascii=False,indent=2));tmp.replace(p)

def api(path):
 with urllib.request.urlopen(urllib.request.Request('https://api.deezer.com/'+path,headers=W.F.UA),timeout=25) as r:d=json.load(r)
 if d.get('error'):raise RuntimeError(str(d['error']))
 return d

def coleta_playlist(spec):
 pid,cat,tipo=spec['id'],spec['categoria'],spec['tipo']
 recurso=spec.get('recurso','playlist')
 if recurso not in ('playlist','album') or cat not in ('disney','desenhos'):raise ValueError('Fonte inválida')
 p=api(f'{recurso}/{int(pid)}')
 tracks=[];next_url=f'https://api.deezer.com/{recurso}/{pid}/tracks?limit=100'
 while next_url and len(tracks)<1000:
  if not next_url.startswith('https://api.deezer.com/'):raise ValueError('Paginação fora da API esperada')
  page=api(next_url.removeprefix('https://api.deezer.com/'))
  tracks.extend(page.get('data',[]));next_url=page.get('next')
 if recurso=='album':
  for m in tracks:m.setdefault('album',{'id':pid,'title':p['title']})
 return {'playlist':p['title'],'id':pid,'recurso':recurso,'link':p.get('link') or f'https://www.deezer.com/{recurso}/{pid}','categoria':cat,'tipo':tipo,'musicas':tracks}

def coletar():
 CACHE.mkdir(exist_ok=True)
 specs=json.loads(CATALOGO_FONTES.read_text()) if CATALOGO_FONTES.exists() else [{'id':i,'categoria':c,'tipo':t,'recurso':'playlist'} for i,c,t in PLAYLISTS]
 fontes=[];falhas=[]
 anteriores=json.loads(W.FONTES_ARQ.read_text()) if W.FONTES_ARQ.exists() else []
 def coleta_segura(spec):
  arq_cache=CACHE/'fontes'/f"{spec.get('recurso','playlist')}-{int(spec['id'])}.json"
  try:
   if arq_cache.exists() and time.time()-arq_cache.stat().st_mtime<6*3600:
    fonte=json.loads(arq_cache.read_text())
    if spec.get('recurso')=='album':
     for m in fonte['musicas']:m.setdefault('album',{'id':spec['id'],'title':fonte['playlist']})
   else:
    fonte=coleta_playlist(spec)
    grava(arq_cache,fonte)
   return fonte,None
  except Exception as e:
   anterior=json.loads(arq_cache.read_text()) if arq_cache.exists() else None
   return anterior,{'id':spec['id'],'recurso':spec.get('recurso','playlist'),'erro':str(e),'cache_utilizado':bool(anterior)}
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
  for n,(fonte,erro) in enumerate(ex.map(coleta_segura,specs),1):
   if fonte:fontes.append(fonte)
   if erro:falhas.append(erro)
   if n%10==0:print(f'Fontes consultadas: {n}/{len(specs)}',flush=True)
 if not fontes:raise RuntimeError('Nenhuma fonte disponível; a coleta anterior foi preservada')
 albums={m['album']['id'] for f in fontes for m in f['musicas'] if m.get('album',{}).get('id')}
 # O manifesto anterior e o cache evitam repetir centenas de consultas de gravadora.
 cache_albuns=CACHE/'albuns.json'
 info_albuns=json.loads(cache_albuns.read_text()) if cache_albuns.exists() else {}
 for f in anteriores:
  for m in f['musicas']:
   if m.get('album_id') and m.get('label'):info_albuns.setdefault(str(m['album_id']),{'label':m['label']})
 faltam=sorted(a for a in albums if str(a) not in info_albuns)
 def album(aid):
  try:return aid,api(f'album/{aid}')
  except Exception as e:return aid,{'erro':str(e)}
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
  for n,(aid,dado) in enumerate(ex.map(album,faltam),1):
   if not dado.get('erro'):info_albuns[str(aid)]={'label':dado.get('label')}
   if n%50==0:
    grava(cache_albuns,info_albuns)
    print(f'Álbuns conferidos: {n}/{len(faltam)}',flush=True)
 grava(cache_albuns,info_albuns)
 dias=json.loads(W.INDICE.read_text());usados={(m.get('dz') or {}).get('t') for ms in dias.values() for m in ms}
 usados.update(c.get('dz_id') for c in W.carrega_fila())
 usados_ta={(m['t'].casefold(),m['a'].casefold()) for ms in dias.values() for m in ms}
 encontrados={};sanitizadas=[]
 for fonte in fontes:
  itens=[]
  for m in fonte['musicas']:
   alb=info_albuns.get(str(m.get('album',{}).get('id')), {})
   dado={'id':m['id'],'t':m['title'],'a':m['artist']['name'],'artist_id':m['artist']['id'],'album':m.get('album',{}).get('title',''),'album_id':m.get('album',{}).get('id'),'label':alb.get('label'),'duracao':m.get('duration',0),'link':m.get('link') or f"https://www.deezer.com/track/{m['id']}",'preview_disponivel':bool(m.get('preview')),'playlist':fonte['link'],'playlist_nome':fonte['playlist'],'categoria_playlist':fonte['categoria'],'editorial':fonte['tipo']=='editorial'}
   itens.append(dado)
   if m['id'] in usados or (m['title'].casefold(),m['artist']['name'].casefold()) in usados_ta:continue
   if not dado['preview_disponivel'] or dado['duracao']<30:continue
   txt=' '.join([dado['t'],dado['a'],dado['album'],dado.get('label') or '']).casefold()
   if re.search(r'\b(karaoke|karaokê|covers?|tribute|tributo|lullaby|marimba|music box|caixa de música|piano version)\b',txt) or any(x in txt for x in ['geek music','reecover','miura jam','guitarrista de atena']):continue
   if dado['id'] not in encontrados:encontrados[dado['id']]=dado
  sanitizadas.append({**{k:v for k,v in fonte.items() if k!='musicas'},'musicas':itens})
 chaves={(f.get('recurso','playlist'),f['id']) for f in sanitizadas}
 sanitizadas.extend(f for f in anteriores if (f.get('recurso','playlist'),f['id']) not in chaves)
 grava(W.FONTES_ARQ,sanitizadas)
 grava(CACHE/'candidatas.json',list(encontrados.values()))
 rows=[json.dumps(d,ensure_ascii=False,separators=(',',':')) for d in encontrados.values()]
 (CACHE/'candidatas.ndjson').write_text('\n'.join(rows)+'\n')
 erros=[{k:c.get(k) for k in ['id','t','t_en','a','obra','cat','erro']} for c in W.carrega_fila() if c.get('status')=='erro']
 grava(CACHE/'erros-anteriores.json',erros)
 resumo={'fontes':len(fontes),'playlists':sum(f.get('recurso','playlist')=='playlist' for f in fontes),'albuns':sum(f.get('recurso')=='album' for f in fontes),'faixas_listadas':sum(len(f['musicas']) for f in fontes),'candidatas_novas':len(encontrados),'falhas':falhas,'por_fonte':[(f['playlist'],len(f['musicas'])) for f in fontes]}
 grava(CACHE/'resumo-coleta.json',resumo)
 print(json.dumps(resumo,ensure_ascii=False))

def enfileirar():
 if not W.adquirir_lock():raise SystemExit('Pare a importação: já há um worker ativo.')
 try:
  raw=json.loads((CACHE/'candidatas.json').read_text());por_id={x['id']:x for x in raw}
  selecionadas=json.loads(SELECAO.read_text());selecionadas=selecionadas.get('selecionadas',[]) if isinstance(selecionadas,dict) else selecionadas
  aprovadas=set(json.loads(W.TOP100_ARQ.read_text())['aprovadas']) if W.TOP100_ARQ.exists() else None
  fila=W.carrega_fila();ids_fila={x.get('dz_id') for x in fila}
  dias=json.loads(W.INDICE.read_text());ids_dias={(m.get('dz') or {}).get('t') for ms in dias.values() for m in ms}
  novas=[]
  for escolha in selecionadas:
   mid=int(escolha['id'])
   if mid in ids_fila or mid in ids_dias:continue
   if mid not in por_id:raise ValueError(f'ID {mid} não consta na coleta atual de playlists')
   orig=por_id[mid]
   cat=escolha['categoria'];tipo=escolha.get('tipo','desenho' if cat=='desenhos' else 'disney')
   if aprovadas is not None and f'playlist-{cat}-{mid}' not in aprovadas:continue
   if cat not in ('disney','desenhos') or tipo not in ('disney','desenho','anime'):raise ValueError('Categoria/tipo inválidos')
   if cat=='disney' and tipo!='disney' or cat=='desenhos' and tipo=='disney':raise ValueError('Categoria incompatível')
   obra=escolha.get('obra','').strip()
   if not obra:raise ValueError('A obra deve ser identificada')
   item={'id':f'playlist-{cat}-{mid}','t':orig['t'],'a':orig['a'],'a_oficial':orig['a'],'obra':obra,'tipo':tipo,'cat':cat,'pais':None,'hino':False,'status':'pendente','tentativas':0,'erro':None,'data_adicionado':None,'dz_id':mid,'dz_t':orig['t'],'dz_a':orig['a'],'dz_artist_id':orig['artist_id'],'dz_link':orig['link'],'origem_playlist':True,'playlist_fonte':orig['playlist'],'playlist_nome':orig['playlist_nome'],'album_label':orig.get('label'),'curadoria':escolha.get('motivo','Seleção revisada de playlist'),'queries':[],'encore_q':orig['t']}
   novas.append(item);ids_fila.add(mid)
  por_cat={k:[x for x in novas if x['cat']==k] for k in ('disney','desenhos')}
  from itertools import zip_longest
  intercaladas=[x for par in zip_longest(por_cat['disney'],por_cat['desenhos']) for x in par if x]
  W.salva_fila_atomico(fila+intercaladas);W.grava_status('Playlists importadas: '+str(len(intercaladas))+' novas candidatas')
  print(json.dumps({'novas':len(intercaladas),'disney':len(por_cat['disney']),'desenhos':len(por_cat['desenhos'])},ensure_ascii=False))
 finally:W.liberar_lock()

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('comando',choices=['coletar','enfileirar']);a=p.parse_args()
 {'coletar':coletar,'enfileirar':enfileirar}[a.comando]()
if __name__=='__main__':main()
