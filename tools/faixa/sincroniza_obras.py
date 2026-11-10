#!/usr/bin/env python3
"""Padroniza a obra das faixas (dias.json), grava títulos alternativos e põe a obra no autocomplete (catalogo.json).

Idempotente. O worker do disney_desenhos.py chama sincroniza() depois de cada música; rodar à mão também pode.
"""
import json, os, sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import disney_desenhos as W
from origens_lista import LISTA

# nome usado no jogo -> outros nomes que também valem (inglês, nome antigo da fila, apelidos)
CANON = {
    'Steven Universe': 'Steven Universo',
    'Bob Esponja Calça Quadrada': 'Bob Esponja',
    'Gravity Falls: Um Verão de Mistérios': 'Gravity Falls',
    'Frozen: Uma Aventura Congelante': 'Frozen',
    'Moana: Um Mar de Aventuras': 'Moana',
    'Viva - A Vida É uma Festa': 'Viva: A Vida É uma Festa',
    'Rei Leão': 'O Rei Leão',
    'He-Man e os Mestres do Universo': 'He-Man',
    'Neon Genesis Evangelion': 'Evangelion',
}
ALT = {
    'Steven Universo': ['Steven Universe'], 'Bob Esponja': ['SpongeBob', 'SpongeBob SquarePants', 'Bob Esponja Calça Quadrada'],
    'Gravity Falls': ['Gravity Falls: Um Verão de Mistérios'], 'Frozen': ['Frozen: Uma Aventura Congelante'], 'Frozen 2': ['Frozen II'],
    'Moana': ['Moana: Um Mar de Aventuras', 'Vaiana'], 'Viva: A Vida É uma Festa': ['Coco', 'Viva'], 'O Rei Leão': ['The Lion King', 'Rei Leão'],
    'A Pequena Sereia': ['The Little Mermaid'], 'A Bela e a Fera': ['Beauty and the Beast'], 'Enrolados': ['Tangled', 'Rapunzel'],
    'Toy Story': [], 'Encanto': [], 'Aladdin': ['Aladim'], 'Mulan': [], 'Hércules': ['Hercules'], 'Tarzan': [], 'Pocahontas': [],
    'Valente': ['Brave'], 'Elementos': ['Elemental'], 'Red: Crescer É uma Fera': ['Turning Red', 'Red'], 'Aristogatas': ['The Aristocats', 'Os Aristogatas'],
    'A Princesa e o Sapo': ['The Princess and the Frog'], 'Hora de Aventura': ['Adventure Time'], 'Phineas e Ferb': ['Phineas and Ferb'],
    'O Segredo Além do Jardim': ['Over the Garden Wall'], 'Jovens Titãs': ['Teen Titans'], 'Jovens Titãs em Ação!': ['Teen Titans Go!', 'Jovens Titãs em Ação'],
    'Os Simpsons': ['The Simpsons', 'Simpsons'], 'Inspetor Bugiganga': ['Inspector Gadget'], 'A Pantera Cor-de-Rosa': ['The Pink Panther', 'Pantera Cor-de-Rosa'],
    'Os Cavaleiros do Zodíaco': ['Saint Seiya', 'Cavaleiros do Zodíaco'], 'Dragon Ball Z': ['DBZ', 'Dragon Ball'], 'Dragon Ball Super': ['Dragon Ball'],
    'Naruto Shippuden': ['Naruto'], 'Demon Slayer': ['Kimetsu no Yaiba'], 'Evangelion': ['Neon Genesis Evangelion'], 'Fullmetal Alchemist: Brotherhood': ['Fullmetal Alchemist'],
    'Pokémon': ['Pokemon'], 'Kim Possible': [], 'High School Musical 2': ['High School Musical'], 'Descendentes 3': ['Descendentes', 'Descendants'],
    'Shrek 2': ['Shrek'], 'Madagascar 2': ['Madagascar'], 'Zootopia': ['Zootopia: Essa Cidade é o Bicho'], 'Carros': ['Cars'], 'Cinderela': ['Cinderella'],
    'Branca de Neve e os Sete Anões': ['Branca de Neve', 'Snow White'], 'Pinóquio': ['Pinocchio'], 'O Estranho Mundo de Jack': ['The Nightmare Before Christmas'],
    'Bob Esponja: O Filme': ['Bob Esponja', 'SpongeBob'], 'Scooby-Doo': ['Scooby Doo'], 'He-Man': ['He-Man e os Mestres do Universo'], 'ThunderCats': ['Thundercats'],
    'Pinky e o Cérebro': ['Pinky and the Brain'], 'Camp Rock': [], 'Teen Beach Movie': [], 'Tokyo Ghoul': [], 'One Piece': [], 'Cowboy Bebop': [],
}
for x in LISTA:
    ALT.setdefault(x['o'], [])
    ALT[x['o']] = list(dict.fromkeys([*ALT[x['o']], *x['oa']]))


def canon(o):
    return CANON.get(o, o)


def sincroniza(log=print):
    W.aguardar_outras_geracoes()
    idx = json.loads(W.INDICE.read_text('utf-8'))
    fila = json.loads(W.FILA_ARQ.read_text('utf-8')) if W.FILA_ARQ.exists() else []
    por_vaga = {i['data_adicionado']: i for i in fila if i.get('status') == 'pronta' and i.get('data_adicionado')}
    pares, mudou = [], 0
    for d, ms in idx.items():
        for m in ms:
            it = por_vaga.get(f"{d}#{m['n']}")
            if not m.get('obra') and it and it.get('obra'):
                m['obra'] = it['obra']
            if not m.get('obra'):
                continue
            antes = json.dumps(m, ensure_ascii=False, sort_keys=True)
            # tema instrumental de jogo/filme não é "pra cantar junto"
            vibes = (m.get('tg') or {}).get('vibes') or []
            if m.get('categoria') in ('jogos', 'filmes') and 'hino' in vibes and not any(c.get('tipo') == 'voz' for c in m.get('camadas', [])):
                vibes.remove('hino')
            velho = m['obra']
            m['obra'] = canon(velho)
            oa = [o for o in dict.fromkeys([*(m.get('obra_alt') or []), *ALT.get(m['obra'], []), velho]) if o and W.F.slug(o) != W.F.slug(m['obra'])]
            if oa: m['obra_alt'] = oa
            alt = [*(m.get('alt') or [])]
            if it:
                alt += [it.get('t'), it.get('t_pt'), it.get('t_en'), *(it.get('alt') or [])]
            alt = [a for a in dict.fromkeys(alt) if a and W.F.slug(a) != W.F.slug(m['t'])]
            if alt: m['alt'] = alt
            if json.dumps(m, ensure_ascii=False, sort_keys=True) != antes:
                mudou += 1
            for t in [m['t'], *alt]:
                pares.append((t, m['obra']))
            for t in alt:
                pares.append((t, m['a']))
    if mudou:
        tmp = W.INDICE.with_suffix(f'.{os.getpid()}.sinc.tmp')
        tmp.write_text(json.dumps(dict(sorted(idx.items())), ensure_ascii=False, indent=1))
        tmp.replace(W.INDICE)
    cat = json.loads(W.CATALOGO_ARQ.read_text('utf-8'))
    ja = {f"{W.F.slug(a)}-{W.F.slug(t)}" for t, a in cat}
    novos = 0
    for t, a in pares:
        k = f"{W.F.slug(a)}-{W.F.slug(t)}"
        if k not in ja:
            cat.append([t, a]); ja.add(k); novos += 1
    if novos:
        tmp = W.CATALOGO_ARQ.with_suffix(f'.{os.getpid()}.sinc.tmp')
        tmp.write_text(json.dumps(cat, ensure_ascii=False, separators=(',', ':')))
        tmp.replace(W.CATALOGO_ARQ)
    if mudou or novos:
        log(f'Obras sincronizadas: {mudou} faixas atualizadas, {novos} entradas novas no autocomplete')
    return mudou, novos


if __name__ == '__main__':
    sincroniza()
