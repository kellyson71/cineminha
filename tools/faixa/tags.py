#!/usr/bin/env python3
"""Etiquetas para as categorias do Faixa a Faixa: gêneros (álbum na Deezer), país do artista (MusicBrainz) e década.
Uso: tags.py   (só completa o que falta)   ·   import: etiqueta(m) -> m"""
import json, sys, time, urllib.parse
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import fabrica as F

PAISES = {}

def pais_do_artista(nome):
    if nome in PAISES:
        return PAISES[nome]
    p = None
    try:
        d = json.loads(F.baixa('https://musicbrainz.org/ws/2/artist?fmt=json&limit=3&query=' + urllib.parse.quote(f'artist:"{nome.split(",")[0].split("&")[0].strip()}"')))
        a = next((x for x in d.get('artists', []) if x.get('score', 0) >= 90), None)
        if a:
            p = a.get('country') or (a.get('area') or {}).get('iso-3166-1-codes', [None])[0]
    except Exception:
        pass
    time.sleep(1.1)
    PAISES[nome] = p
    return p

def etiqueta(m):
    if m.get('tags_ok'):
        return m
    gens = []
    if m.get('dz'):
        try:
            tr = json.loads(F.baixa(f"https://api.deezer.com/track/{m['dz']['t']}"))
            al = json.loads(F.baixa(f"https://api.deezer.com/album/{tr['album']['id']}"))
            gens = [g['name'] for g in (al.get('genres') or {}).get('data', [])]
            m['rank'] = tr.get('rank', 0)
        except Exception as e:
            print('  sem gênero:', m['t'], e)
    m['generos'] = gens
    m['pais'] = pais_do_artista(m['a'])
    if m.get('ano'):
        m['decada'] = m['ano'] // 10 * 10
    m['tags_ok'] = True
    return m

if __name__ == '__main__':
    p = F.SAIDA / 'dias.json'
    for k in sorted(json.loads(p.read_text())):
        cur = json.loads(p.read_text())
        ms = [etiqueta(m) for m in cur[k]]
        for m in ms:
            print(k, m['t'][:28], '—', m['a'][:18], '|', m.get('pais'), m.get('decada'), m.get('generos'), m.get('rank'), flush=True)
        cur = json.loads(p.read_text()); cur[k] = ms
        p.write_text(json.dumps(dict(sorted(cur.items())), ensure_ascii=False, indent=1))
