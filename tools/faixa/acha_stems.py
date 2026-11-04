#!/usr/bin/env python3
"""Procura no Chorus Encore (acervo do Clone Hero / Rock Band) as músicas curtidas que já existem com as
faixas separadas (bateria, baixo, guitarra, voz…). Lê só o cabeçalho de cada .sng (64 KB) para ver as faixas.
Candidatas: rock/metal/indie/rock-nacional do catálogo classificado (fama >= 2).
Saída: tools/faixa/listas/stems-encore.json  (ordenado: mais faixas e mais fama primeiro)"""
import json, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import fabrica as F

AQUI = Path(__file__).parent
ROCK = {'rock', 'metal', 'indie', 'rock-nacional'}
GRUPO = [(r'^drums', 'bateria'), (r'^bass', 'baixo'), (r'^rhythm', 'base'), (r'^guitar', 'guitarra'), (r'^keys', 'teclado'), (r'^(vocals|harmon)', 'voz')]


def busca(q):
    body = json.dumps({'search': q, 'page': 1}).encode()
    req = urllib.request.Request('https://api.enchor.us/search', body, {'content-type': 'application/json', **F.UA})
    for i in range(3):
        try:
            return json.load(urllib.request.urlopen(req, timeout=30)).get('data', [])
        except Exception:
            time.sleep(2 + i * 2)
    return []


def faixas(md5):
    req = urllib.request.Request(f'https://files.enchor.us/{md5}.sng', headers={**F.UA, 'Range': 'bytes=0-65535'})
    try:
        cab = urllib.request.urlopen(req, timeout=30).read()
    except Exception:
        return None
    nomes = set(re.findall(rb'([a-z_0-9]+)\.(?:opus|ogg|mp3|wav)', cab))
    grupos = set()
    for n in nomes:
        n = n.decode()
        g = next((g for rx, g in GRUPO if re.match(rx, n)), None)
        if g:
            grupos.add(g)
    return sorted(grupos, key=lambda g: [x for _, x in GRUPO].index(g))


def avalia(item):
    (t, a), tg = item
    t0 = re.sub(r'\s*[(\[-].*$', '', t).strip() or t
    st, sa = F.slug(t0), F.slug(a.split(',')[0].split('&')[0])
    achados = [c for c in busca(f'{t0} {a}') if st and st in F.slug(c['name']) and (sa in F.slug(c['artist']) or F.slug(c['artist']) in sa)]
    # mais instrumentos mapeados primeiro (charts vindos do Rock Band costumam ter as faixas separadas)
    achados.sort(key=lambda c: -len(c['notesData'].get('instruments') or []))
    melhor = None
    for c in achados[:2]:
        fx = faixas(c['md5'])
        if fx and (not melhor or len(fx) > len(melhor['faixas'])):
            melhor = {'md5': c['md5'], 'chart': f"{c['name']} — {c['artist']}", 'charter': c.get('charter'), 'faixas': fx}
    return {'t': t, 'a': a, 'fama': tg.get('fama'), 'generos': tg.get('generos'), 'charts': len(achados), **(melhor or {'faixas': []})}


def main():
    cat = json.loads((F.SAIDA / 'catalogo.json').read_text())
    tags = json.loads((AQUI / 'listas' / 'catalogo-tags.json').read_text())
    cand = [((t, a), tags.get(F.slug(f'{a}-{t}'), {})) for t, a in cat]
    cand = [x for x in cand if ROCK & set(x[1].get('generos') or []) and (x[1].get('fama') or 0) >= 2]
    print(len(cand), 'candidatas', flush=True)
    out = []
    with ThreadPoolExecutor(6) as ex:
        for i, r in enumerate(ex.map(avalia, cand)):
            out.append(r)
            if len(r['faixas']) >= 3:
                print(f"  ✓ {r['t']} — {r['a']} (fama {r['fama']}): {', '.join(r['faixas'])}", flush=True)
    out.sort(key=lambda r: (-len(r['faixas']), -(r['fama'] or 0)))
    (AQUI / 'listas' / 'stems-encore.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
    boas = [r for r in out if len(r['faixas']) >= 3]
    print(f"\n{len(boas)} com 3+ faixas separadas · {sum(1 for r in out if r['charts'])} com algum chart · {len(out)} pesquisadas")


if __name__ == '__main__':
    main()
