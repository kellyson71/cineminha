#!/usr/bin/env python3
"""Paradas para o Faixa a Faixa: o que está tocando agora (e o que sempre tocou), sem login.

  paradas.py            baixa todas e grava listas/paradas.json
  paradas.py --se-velho só baixa se o arquivo tiver mais de 1 dia

Fontes:
  sp-br        Spotify Brasil, top 200 do dia                 (kworb.net)
  sp-global    Spotify mundo, top da semana                   (kworb.net)
  sp-sempre    Spotify Brasil, as mais tocadas de todos os tempos (kworb.net, total semanal acumulado)
  tiktok       hits do TikTok: playlists "Hits do TikTok" e "Virais" (Deezer)
  deezer-br    Top Brasil da Deezer
"""
import html, json, re, sys, time, urllib.request
from pathlib import Path

AQUI = Path(__file__).parent
ARQ = AQUI / 'listas' / 'paradas.json'
UA = {'user-agent': 'Mozilla/5.0 (Cineminha; faixa a faixa)'}
TIKTOK = [1299844827, 8575701342, 8575702082]  # Hits do TikTok (Topsify), Hits TikTok 2026 e Hits Virais (Filtr)
DEEZER_BR = 1111141961                          # Top Brasil (Deezer Charts)


def baixa(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')


# "Pós - Ao Vivo" → "Pós"; "Nome (feat. X)" → "Nome": o jogo usa o nome da música, não da versão
LIMPA = re.compile(r'\s*(-\s*(ao vivo|live|remaster(ed)?( \d{4})?|radio edit|acústico|acustico)\b.*|\((feat|ft|with|part)\.?[^)]*\)|\[(feat|ft)[^\]]*\])', re.I)
EMOJI = re.compile('[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D]')
limpa = lambda t: re.sub(r'\s+', ' ', EMOJI.sub('', LIMPA.sub('', html.unescape(t)))).strip()


def kworb(url, limite):
    out = []
    for a, t in re.findall(r'<a href="../artist/[^"]*">([^<]*)</a> - <a href="../track/[^"]*">([^<]*)</a>', baixa(url)):
        out.append({'t': limpa(t), 'a': html.unescape(a).strip(), 'pos': len(out) + 1})
        if len(out) >= limite: break
    return out


def deezer(ids, limite):
    out, vistos = [], set()
    for pid in ids:
        d = json.loads(baixa(f'https://api.deezer.com/playlist/{pid}/tracks?limit={limite}'))
        for x in d.get('data', []):
            t, a = limpa(x.get('title_short') or x.get('title', '')), x.get('artist', {}).get('name', '')
            k = (t.lower(), a.lower())
            if not t or not a or k in vistos: continue
            vistos.add(k); out.append({'t': t, 'a': a, 'pos': len(out) + 1, 'rank': x.get('rank')})
    return out[:limite]


def atualiza():
    paradas = {}
    jobs = {
        'sp-br': lambda: kworb('https://kworb.net/spotify/country/br_daily.html', 200),
        'sp-global': lambda: kworb('https://kworb.net/spotify/country/global_weekly.html', 200),
        'sp-sempre': lambda: kworb('https://kworb.net/spotify/country/br_weekly_totals.html', 500),
        'tiktok': lambda: deezer(TIKTOK, 150),
        'deezer-br': lambda: deezer([DEEZER_BR], 100),
    }
    for nome, fn in jobs.items():
        try:
            paradas[nome] = fn()
            print(f'  {nome:10} {len(paradas[nome]):4} músicas', flush=True)
        except Exception as e:
            print(f'  {nome:10} falhou: {e}', flush=True)
    antigo = json.loads(ARQ.read_text()) if ARQ.exists() else {}
    for k, v in antigo.get('fontes', {}).items():
        if not paradas.get(k): paradas[k] = v  # fonte que falhou agora: mantém a de antes
    ARQ.write_text(json.dumps({'atualizado': int(time.time()), 'fontes': paradas}, ensure_ascii=False, indent=1))
    return paradas


def ler():
    try:
        return json.loads(ARQ.read_text()).get('fontes', {})
    except Exception:
        return {}


def velho():
    try:
        return time.time() - json.loads(ARQ.read_text())['atualizado'] > 86400
    except Exception:
        return True


if __name__ == '__main__':
    if '--se-velho' in sys.argv and not velho():
        print('  paradas em dia (menos de 1 dia)')
    else:
        print('baixando as paradas…'); atualiza()
