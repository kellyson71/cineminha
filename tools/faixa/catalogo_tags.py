#!/usr/bin/env python3
"""Junta a classificação do catálogo feita pelo Antigravity (linhas id|pais|generos|decada|vibes|fama)
em tools/faixa/listas/catalogo-tags.json e aplica nas músicas de dias.json (campo 'tg').
Uso: catalogo_tags.py <pasta com out*.txt>"""
import json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import fabrica as F

GEN = set('rock metal pop indie mpb rock-nacional sertanejo pagode-samba funk-br forro-axe rap trap eletronica disco-dance rnb-soul reggae kpop-jpop anime-games trilha internet-meme gospel jazz-blues latina classica folk-country'.split())
VIB = set('festa sofrencia romantica nostalgia hino emo viral chill triste energia'.split())
AQUI = Path(__file__).parent
SAIDA = AQUI / 'listas' / 'catalogo-tags.json'

def chave(t, a):
    return F.slug(f'{a}-{t}')

def carrega():
    return json.loads(SAIDA.read_text()) if SAIDA.exists() else {}

def main(pasta):
    cat = json.loads((F.SAIDA / 'catalogo.json').read_text())
    tags = carrega()
    ok = ruins = 0
    for f in sorted(Path(pasta).glob('out*.txt')):
        for l in f.read_text('utf-8', 'replace').splitlines():
            p = [x.strip() for x in l.split('|')]
            if len(p) != 6 or not p[0].isdigit() or int(p[0]) >= len(cat):
                if l.strip(): ruins += 1
                continue
            i, pais, gens, dec, vibs, fama = p
            t, a = cat[int(i)]
            tags[chave(t, a)] = {
                'pais': pais.upper() if re.fullmatch(r'[A-Za-z]{2}', pais) else None,
                'generos': [g.strip() for g in gens.lower().split(',') if g.strip() in GEN][:2],
                'decada': int(dec) if dec.isdigit() else None,
                'vibes': [v.strip() for v in vibs.lower().split(',') if v.strip() in VIB][:3],
                'fama': int(fama) if fama.isdigit() and 1 <= int(fama) <= 5 else None,
            }
            ok += 1
    SAIDA.write_text(json.dumps(tags, ensure_ascii=False, separators=(',', ':')))
    print(f'{ok} classificadas ({ruins} linhas ruins) · total {len(tags)}')
    # aplica nas músicas que já estão nos dias
    idx_p = F.SAIDA / 'dias.json'
    idx = json.loads(idx_p.read_text())
    n = 0
    for ms in idx.values():
        for m in ms:
            tg = tags.get(chave(m['t'], m['a'])) or tags.get(m.get('id', ''))
            if tg: m['tg'] = tg; n += 1
    idx_p.write_text(json.dumps(idx, ensure_ascii=False, indent=1))
    print(f'{n} músicas dos dias ganharam etiquetas')

if __name__ == '__main__':
    main(sys.argv[1])
