#!/usr/bin/env python3
"""Junta os pacotes antigos (Clone Hero = 'estudio' e IA) na Faixa do dia como dias retroativos,
completa ano/ids da Deezer de todas as músicas e gera o catálogo de sugestões (curtidas + mais ouvidas).
Uso: retro.py   (pode rodar de novo: não duplica)
"""
import json, shutil, sys, datetime as dt
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import fabrica as F, diario as D

PAC = F.SAIDA / 'pacotes.json'


def detalhes(m):
    """Completa dz (ids), album e ano pela Deezer."""
    if not m.get('dz'):
        x = D.deezer(m['t'], m['a'])
        if x:
            m['dz'] = {'t': x['id'], 'a': x['artist']['id']}
            m['album'] = m.get('album') or x['album']['title']
    if m.get('dz') and not m.get('ano'):
        try:
            tr = json.loads(F.baixa(f"https://api.deezer.com/track/{m['dz']['t']}"))
            m['ano'] = int((tr.get('release_date') or tr.get('album', {}).get('release_date') or '0')[:4]) or None
            m['album'] = m.get('album') or tr.get('album', {}).get('title')
        except Exception as e:
            print('  sem ano:', m['t'], e)
    return m


def main():
    idx = json.loads(D.INDICE.read_text()) if D.INDICE.exists() else {}
    pac = json.loads(PAC.read_text()) if PAC.exists() else {}
    ja = {m['id'] for ms in idx.values() for m in ms} | {F.slug(f"{m['a']}-{m['t']}") for ms in idx.values() for m in ms}
    novas = []
    for fonte, rot in (('originais', 'estudio'), ('ia', 'ia')):  # estúdio primeiro: na dúvida, fica a versão original
        for m in pac.get(fonte, {}).get('musicas', []):
            chave = F.slug(f"{m['a']}-{m['t']}")
            if chave in ja or m['id'] in ja:
                continue
            ja.add(chave); ja.add(m['id'])
            novas.append((fonte, rot, m))
    print(len(novas), 'músicas antigas viram dias retroativos')
    primeiro = min((dt.date.fromisoformat(d) for d in idx), default=dt.date.today())
    dia = primeiro - dt.timedelta(days=(len(novas) + D.POR_DIA - 1) // D.POR_DIA)
    for i in range(0, len(novas), D.POR_DIA):
        k = dia.isoformat()
        lista = []
        for n, (fonte, rot, m) in enumerate(novas[i:i + D.POR_DIA]):
            src = F.SAIDA / fonte / m['id']
            dst = D.SAIDA / k / str(n)
            if dst.exists():
                shutil.rmtree(dst)
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(src, dst)
            mm = detalhes({'id': F.slug(f"{m['a']}-{m['t']}"), 'n': n, 'origem': 'antiga', 'fonte': rot, 't': m['t'], 'a': m['a'],
                           'capa': m.get('capa') or '', 'camadas': m['camadas']})
            lista.append(mm)
            print(f'  {k} #{n + 1}: {mm["t"]} — {mm["a"]} ({rot}, {mm.get("ano")})', flush=True)
        idx = json.loads(D.INDICE.read_text()) if D.INDICE.exists() else {}
        idx[k] = lista
        D.INDICE.write_text(json.dumps(dict(sorted(idx.items())), ensure_ascii=False, indent=1))
        dia += dt.timedelta(days=1)
    # ano/ids para os dias que já existiam
    idx = json.loads(D.INDICE.read_text())
    for k, ms in idx.items():
        for m in ms:
            m.setdefault('fonte', 'ia')
            detalhes(m)
    D.INDICE.write_text(json.dumps(dict(sorted(idx.items())), ensure_ascii=False, indent=1))
    # catálogo para sugestões instantâneas
    cat, visto = [], set()
    for t, a in D.lista('mais-ouvidas.txt') + D.lista('curtidas-e-veio.txt'):
        t = D.LIMPA.sub('', t).strip()
        k = F.slug(f'{a}-{t}')
        if k in visto or not t:
            continue
        visto.add(k); cat.append([t, a])
    (F.SAIDA / 'catalogo.json').write_text(json.dumps(cat, ensure_ascii=False, separators=(',', ':')))
    print('catálogo:', len(cat), 'músicas')


if __name__ == '__main__':
    main()
