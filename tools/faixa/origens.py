#!/usr/bin/env python3
"""Resolve a curadoria de origens_lista.py (Deezer primeiro, YouTube depois) e põe na fila do worker.

  python3 origens.py resolver      # grava listas/origens_resolvidas.json (retoma de onde parou)
  python3 origens.py importar      # acrescenta na fila do disney_desenhos.py com prioridade
  python3 origens.py tudo          # os dois, importando cada resolvida na hora (o worker já pega)
"""
import json, re, subprocess, sys, time, unicodedata, urllib.parse, urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from origens_lista import LISTA
import disney_desenhos as W

RES = AQUI / 'listas' / 'origens_resolvidas.json'
UA = {'User-Agent': 'Mozilla/5.0 cineminha-faixa'}
RUIM = re.compile(r'(\bcover|acapella|a cappella|boss fight|gameplay|walkthrough|through the years|homenagem|remake|karaok|tribute|instrumental version|lullab|piano version|8.?bit|music box|caixa de m[uú]sica|made famous|in the style|remix|rem/x|slowed|sped up|nightcore|\b1 hour|10 hours|hora completa|\breact|rea[cç][aã]o|reagindo|tutorial|how to|lesson|fan.?made|ai cover|ringtone|marimba|kids version|vers[aã]o infantil|\bpt.?pt\b|portugu[eê]s europeu|portugal|deutsch|german|fran[cç]ais|espa[nñ]ol|latino|castellano|italiano)', re.I)


def sem(t):
    return re.sub(r'[^a-z0-9 ]+', ' ', unicodedata.normalize('NFD', str(t or '')).encode('ascii', 'ignore').decode().lower()).strip()


def chave(x):
    return f"{x['c']}|{sem(x['o'])}|{sem(x['t'])}"


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def titulo_bate(cand, nomes):
    c = sem(re.sub(r'\(.*?\)|\[.*?\]', ' ', cand))
    for n in nomes:
        n2 = sem(re.sub(r'\(.*?\)|\[.*?\]', ' ', n))
        if n2 and (c == n2 or c.startswith(n2) or n2.startswith(c) and len(c) >= 4):
            return True
    return False


def deezer(x):
    nomes = [x['t'], *x['al']]
    for q in x['q']:
        try:
            d = get('https://api.deezer.com/search?q=' + urllib.parse.quote(q) + '&limit=25')
        except Exception:
            time.sleep(2)
            continue
        boas = []
        for it in d.get('data', []):
            if not it.get('preview') or not it.get('readable', True):
                continue
            art, tit, alb = it['artist']['name'], it['title'], (it.get('album') or {}).get('title', '')
            if RUIM.search(f'{art} {tit} {alb}'):
                continue
            if not titulo_bate(tit, nomes):
                continue
            # o intérprete tem que estar no campo do artista (no título vem "originally performed by…" dos covers)
            if x['a'] and not any(w in sem(art) for w in sem(x['a']).split() if len(w) > 2):
                continue
            boas.append(it)
        if boas:
            exato = lambda i: any(sem(re.sub(r'\(.*?\)|\[.*?\]| - .*$', ' ', i['title'])) == sem(re.sub(r'\(.*?\)', ' ', n)) for n in nomes)
            limpo = lambda i: not re.search(r'mix|edit|version|vers[aã]o|live|ao vivo|acoustic|tv size', i['title'], re.I)
            it = max(boas, key=lambda i: (exato(i), limpo(i), i.get('rank', 0)))
            return {'fonte': 'deezer', 'dz_id': it['id'], 'dz_artist_id': it['artist']['id'], 'dz_t': it['title'], 'dz_a': it['artist']['name'],
                    'dz_album': (it.get('album') or {}).get('title', ''), 'rank': it.get('rank', 0)}
    return None


def youtube(x):
    q = x['y'] or f"{x['t']} {x['o']}"
    try:
        r = subprocess.run(['yt-dlp', '-q', '--no-warnings', '--flat-playlist', '--print', '%(id)s\t%(title)s\t%(duration)s\t%(channel)s\t%(view_count)s', f'ytsearch8:{q}'],
                           capture_output=True, text=True, timeout=90)
    except Exception:
        return None
    GEN = {'abertura', 'theme', 'tema', 'opening', 'portugues', 'music', 'musica', 'song', 'main', 'original', 'dublado', 'versao', 'from'}
    pal_o = {w for w in sem(f"{x['o']} {' '.join(x['oa'])}").split() if len(w) > 2} - GEN
    pal_t = [{w for w in sem(re.sub(r'\(.*?\)', ' ', n)).split() if len(w) > 2} - GEN - pal_o for n in [x['t'], *x['al']]]
    abertura = bool(re.search(r'abertura|theme|tema|opening', x['t'], re.I))
    boas = []
    for ln in r.stdout.splitlines():
        p = ln.split('\t')
        if len(p) < 5:
            continue
        vid, tit, dur, canal, views = p
        try:
            dur = float(dur)
        except ValueError:
            continue
        try:
            views = int(views)
        except ValueError:
            views = 0
        if not 25 <= dur <= 420 or RUIM.search(tit) or re.search(r'extended|estendid|\bloop|todas as vers|compila|ranking|\btop \d+|evolution|evolu[cç][aã]o|\bfull album|\bost completa|parody|par[oó]dia', tit, re.I):
            continue
        st = sem(tit)
        obra_ok = any(w in st for w in pal_o)
        # a música certa: as palavras do título (ou de um título alternativo) aparecem; aberturas valem pelo nome da obra
        tit_ok = max((sum(1 for w in ws if w in st) / len(ws) for ws in pal_t if ws), default=0)
        if not (tit_ok >= .5 or (abertura and obra_ok and re.search(r'abertura|theme|tema|opening|intro', tit, re.I))):
            continue
        # abertura: a mais vista entre as que citam a obra; música: a que bate o título e a obra
        boas.append((obra_ok, 0, views, vid, tit, dur, canal) if abertura else (tit_ok >= .5 and obra_ok, tit_ok, views, vid, tit, dur, canal))
    if not boas:
        return None
    _, _, views, vid, tit, dur, canal = max(boas)
    return {'fonte': 'youtube', 'yt_id': vid, 'yt_titulo': tit, 'yt_dur': dur, 'yt_canal': canal, 'views': views}


def resolver(importa_na_hora=False):
    res = json.loads(RES.read_text()) if RES.exists() else {}
    for k, x in enumerate(sorted(LISTA, key=lambda x: x['p'])):
        ch = chave(x)
        if ch in res and res[ch]:
            continue
        r = None
        if not x['yt'] and x['q']:
            r = deezer(x)
        if not r:
            r = youtube(x)
        res[ch] = r
        RES.write_text(json.dumps(res, ensure_ascii=False, indent=1))
        print(f"[{k + 1}/{len(LISTA)}] {x['t']} ({x['o']}) -> {r and (r['fonte'] + ' ' + (r.get('dz_a') or r.get('yt_titulo', '')))}", flush=True)
        if importa_na_hora and r:
            importar(silencioso=True)
    return res


def item_fila(x, r):
    base = {
        'id': 'origem-' + W.F.slug(f"{x['c']}-{x['o']}-{x['t']}"),
        't': x['t'], 'alt': x['al'], 'obra': x['o'], 'obra_alt': x['oa'], 'tipo': x['tp'], 'cat': x['c'],
        'pais': None, 'hino': x['p'] <= 110 and x['c'] in ('disney', 'desenhos'), 'prio': x['p'], 'status': 'pendente', 'tentativas': 0, 'erro': None,
        'data_adicionado': None, 'queries': [], 'encore_q': None, 'curadoria': 'origens_lista.py',
    }
    if r['fonte'] == 'deezer':
        base.update(origem_playlist=True, dz_id=r['dz_id'], dz_artist_id=r['dz_artist_id'], dz_t=r['dz_t'], dz_a=r['dz_a'],
                    a=r['dz_a'], a_oficial=r['dz_a'], dz_link=f"https://www.deezer.com/track/{r['dz_id']}", encore_q=r['dz_t'])
    else:
        base.update(yt_id=r['yt_id'], yt_titulo=r['yt_titulo'], yt_dur=r['yt_dur'], a=x['a'] or x['o'], yt_ini=x['ini'])
    return base


def importar(silencioso=False):
    res = json.loads(RES.read_text()) if RES.exists() else {}
    por_chave = {chave(x): x for x in LISTA}
    idx = json.loads(W.INDICE.read_text('utf-8')) if W.INDICE.exists() else {}
    dz_existentes = {(m.get('dz') or {}).get('t') for v in idx.values() for m in v}

    def aplica(fila):
        ids = {i.get('id') for i in fila}
        dzs = {i.get('dz_id') for i in fila if i.get('dz_id')}
        yts = {i.get('yt_id') for i in fila if i.get('yt_id')}
        n = 0
        for ch, r in res.items():
            x = por_chave.get(ch)
            if not x or not r:
                continue
            it = item_fila(x, r)
            if it['id'] in ids or (it.get('dz_id') and it['dz_id'] in dzs) or (it.get('yt_id') and it['yt_id'] in yts):
                continue
            if it.get('dz_id') in dz_existentes:
                it['reaproveita'] = True  # o worker só marca a categoria/obra na faixa que já existe
            fila.append(it)
            ids.add(it['id'])
            n += 1
        return n
    n = W.atualiza_fila(aplica)
    if not silencioso:
        print(f'{n} novas na fila')
    return n


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'tudo'
    if cmd == 'resolver':
        resolver()
    elif cmd == 'importar':
        importar()
    else:
        resolver(importa_na_hora=True)
        importar()
