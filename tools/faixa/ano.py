#!/usr/bin/env python3
"""Ano de lançamento original (MusicBrainz: primeira data da gravação), para a dica do Faixa a Faixa.
Uso: ano.py            completa/corrige todas as músicas de dias.json
     import: ano_original(titulo, artista) -> int|None"""
import json, re, sys, time, urllib.parse
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import fabrica as F

def ano_original(t, a):
    t0 = re.sub(r'\s*[(\[-].*$', '', t).strip() or t
    q = f'recording:"{t0}" AND artist:"{a.split(",")[0].split("&")[0].strip()}"'
    try:
        d = json.loads(F.baixa('https://musicbrainz.org/ws/2/recording?fmt=json&limit=25&query=' + urllib.parse.quote(q)))
    except Exception:
        time.sleep(2); return None
    anos = [int(r['first-release-date'][:4]) for r in d.get('recordings', []) if r.get('first-release-date') and r.get('score', 0) >= 90]
    time.sleep(1.1)  # o MusicBrainz pede 1 consulta por segundo
    return min(anos) if anos else None

if __name__ == '__main__':
    p = F.SAIDA / 'dias.json'
    idx = json.loads(p.read_text())
    for k, ms in idx.items():
        for m in ms:
            if m.get('ano_ok'):
                continue
            a = ano_original(m['t'], m['a'])
            if a:
                m['ano'] = min(a, m['ano']) if m.get('ano') else a
            m['ano_ok'] = True
            print(k, m['t'], '—', m['a'], '→', m.get('ano'), flush=True)
        cur = json.loads(p.read_text()); cur[k] = ms; p.write_text(json.dumps(dict(sorted(cur.items())), ensure_ascii=False, indent=1))
