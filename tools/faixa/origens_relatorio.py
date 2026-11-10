#!/usr/bin/env python3
"""Lista as músicas de desenhos/Disney/filmes/jogos: prontas e pendentes, da mais famosa para a menos."""
import json
from pathlib import Path
AQUI = Path(__file__).resolve().parent
fila = json.loads((AQUI / 'listas' / 'disney_desenhos_fila.json').read_text())
NOME = {'disney': 'Disney', 'desenhos': 'Desenhos/animes', 'filmes': 'Filmes e séries', 'jogos': 'Jogos'}
ordem = sorted(enumerate(fila), key=lambda x: (x[1].get('prio', 500), x[0]))
for st, tit in [('pronta', 'PRONTAS'), ('pendente', 'NA FILA'), ('erro', 'COM ERRO')]:
    itens = [i for _, i in ordem if i.get('status') == st]
    print(f'\n## {tit} ({len(itens)})')
    for c in NOME:
        grupo = [i for i in itens if i.get('cat') == c]
        if not grupo: continue
        print(f'\n### {NOME[c]} ({len(grupo)})')
        for k, i in enumerate(grupo, 1):
            fonte = 'YouTube' if i.get('yt_id') and not i.get('dz_id') else 'Deezer'
            print(f"{k}. {i['t']} — {i.get('obra')}" + (f" · {fonte}" if st != 'pronta' else '') + (f" · {i.get('erro')}" if st == 'erro' else ''))
