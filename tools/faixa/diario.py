#!/usr/bin/env python3
"""Faixa do dia: prepara 5 músicas por dia para o Faixa a Faixa.

Mistura 3 das mais ouvidas com 2 aleatórias das curtidas/"de veio" (listas em tools/faixa/listas).
A escolha é fixa por data (mesma semente), sem repetir música entre dias.
Áudio: prévia de 30 s da Deezer, separada em camadas pelo Demucs (htdemucs_6s).

Uso:
  diario.py                      hoje e amanhã (o que faltar)
  diario.py --desde 2026-10-27   de uma data até amanhã
  diario.py --data 2026-11-05    só esse dia (refaz)
Saída: public/jogos/faixa/dias/<data>/<n>/<camada>.webm + capa.jpg  e  public/jogos/faixa/dias.json
"""
import datetime as dt, json, random, re, subprocess, sys, tempfile, time, urllib.parse
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import fabrica as F

AQUI = Path(__file__).parent
SAIDA = F.SAIDA / 'dias'
INDICE = F.SAIDA / 'dias.json'
POR_DIA = 5
# quantas das mais ouvidas por dia (o resto vem das curtidas); FAIXA_TOP muda só para uma leva
DO_TOP = int(__import__('os').environ.get('FAIXA_TOP', 3))
# só músicas conhecidas: popularidade da faixa na Deezer (rank) e fãs do artista
LIMPA = re.compile(r'\s*[-(\[]\s*(feat\.?|ft\.?|with|ao vivo|live|remaster|radio edit|sped up|slowed|ac[uú]stico|versão|version|edit|mono|stereo).*$', re.I)


def lista(arq, secao=None):
    out, cur = [], None
    for l in (AQUI / 'listas' / arq).read_text('utf-8').splitlines():
        if l.startswith('##'):
            cur = l[2:].strip(); continue
        if '|' in l and (secao is None or cur in secao):
            t, a = l.split('|', 1)
            out.append((t.strip(), a.strip()))
    return out


def popularidade(x):
    """(rank da faixa, fãs do artista) pela Deezer."""
    try:
        fas = json.loads(F.baixa(f"https://api.deezer.com/artist/{x['artist']['id']}")).get('nb_fan', 0)
    except Exception:
        fas = 0
    return x.get('rank', 0), fas


def conhecida(x):
    # calibrado com as músicas já geradas: a Deezer subestima as brasileiras (Evidências ~575 mil)
    # e alguns clássicos têm poucos fãs (Black Betty ~820 mil); trilhas de jogo e nichadas ficam abaixo
    rank, fas = popularidade(x)
    ok = rank >= 800_000 or (rank >= 500_000 and fas >= 100_000 and not (fas < 200_000 and rank < 600_000))
    return ok, rank, fas


def deezer(titulo, artista):
    """Melhor faixa na Deezer com prévia; confere título e artista."""
    t0 = LIMPA.sub('', titulo).strip()
    for q in (f'track:"{t0}" artist:"{artista}"', f'{artista} {t0}', t0):
        try:
            d = json.loads(F.baixa('https://api.deezer.com/search?q=' + urllib.parse.quote(q) + '&limit=10'))
        except Exception:
            time.sleep(2); continue
        for x in d.get('data', []):
            if not x.get('preview'):
                continue
            ok_t = F.slug(LIMPA.sub('', x['title'])) == F.slug(t0) or F.slug(t0) in F.slug(x['title'])
            ok_a = F.slug(artista.split(',')[0]) in F.slug(x['artist']['name']) or F.slug(x['artist']['name']) in F.slug(artista)
            if ok_t and ok_a:
                return x
    return None


def estudio(t, a, pasta):
    """Versão de estúdio no acervo do Clone Hero (Chorus Encore), com 3+ faixas separadas; None se não houver."""
    try:
        from acha_stems import avalia
        from estudio import processa
        r = avalia(((t, a), {}))
        if r.get('md5') and len(r.get('faixas', [])) >= 3:
            return processa(r['md5'], pasta)
    except Exception as e:
        print(f'  estúdio falhou ({t}): {e}', flush=True)
    return None


def separa(mp3, tmp):
    wav = Path(tmp) / 'mix.wav'
    F.run('ffmpeg', '-v', 'error', '-y', '-i', mp3, '-ac', '2', '-ar', '44100', wav)
    F.run(F.DEMUCS, '-m', 'demucs', '-n', 'htdemucs_6s', '-o', Path(tmp) / 'sep', wav)
    d = Path(tmp) / 'sep' / 'htdemucs_6s' / 'mix'
    mapa = {'drums': 'bateria', 'bass': 'baixo', 'guitar': 'guitarra', 'piano': 'piano', 'other': 'outros', 'vocals': 'voz'}
    return [(t, d / f'{s}.wav') for s, t in mapa.items()]


def etiquetas_catalogo():
    p = AQUI / 'listas' / 'catalogo-tags.json'
    return json.loads(p.read_text()) if p.exists() else {}


def uma(t, a, origem, pasta_dia, n, TG=None, rank_min=None):
    """Prepara uma música na vaga n do dia (pasta_dia/n). Devolve o item do dias.json ou None se não deu."""
    TG = etiquetas_catalogo() if TG is None else TG
    chave = F.slug(f'{a}-{t}')
    x = deezer(t, a)
    if not x:
        print(f'  sem prévia: {t} | {a}', flush=True); return None
    ok, rank, fas = conhecida(x)
    if rank_min is not None: ok = ok or rank >= rank_min  # sugestões já revisadas pelo Antigravity: corte mais baixo
    if not ok:
        print(f'  pouco conhecida, pulei: {t} | {a} (rank {rank}, {fas} fãs)', flush=True); return None
    pasta = pasta_dia / str(n)
    try:
        with tempfile.TemporaryDirectory() as tmp:
            t0 = time.time()
            info, fonte = estudio(t, a, pasta), 'estudio'
            if not info:  # sem versão de estúdio: separa a prévia da Deezer com a IA
                mp3 = Path(tmp) / 'p.mp3'; F.baixa(x['preview'], mp3)
                camadas = separa(mp3, tmp)
                info, fonte = F.publica(camadas, pasta, {}), 'ia'
            F.baixa(x['album']['cover_big'], Path(tmp) / 'c.jpg')
            F.run('ffmpeg', '-v', 'error', '-y', '-i', Path(tmp) / 'c.jpg', '-vf', 'scale=360:360', pasta / 'capa.jpg')
        ano = None
        try:
            tr = json.loads(F.baixa(f"https://api.deezer.com/track/{x['id']}"))
            ano = int((tr.get('release_date') or tr.get('album', {}).get('release_date') or '0')[:4]) or None
        except Exception:
            pass
        try:
            from ano import ano_original
            ao = ano_original(x['title'], x['artist']['name'])
            if ao: ano = min(ao, ano) if ano else ao
        except Exception:
            pass
        m = {'id': chave, 'n': n, 'origem': origem, 'fonte': fonte, 'ano_ok': True, 't': x['title'], 'a': x['artist']['name'], 'album': x['album']['title'],
             'ano': ano, 'dz': {'t': x['id'], 'a': x['artist']['id']}, 'capa': 'capa.jpg', 'camadas': info['camadas']}
        tg = TG.get(chave) or TG.get(F.slug(f'{a}-{LIMPA.sub("", t).strip()}'))
        if tg: m['tg'] = tg
        try:
            from tags import etiqueta
            etiqueta(m)
        except Exception:
            pass
        print(f'  {n + 1}. {x["title"]} — {x["artist"]["name"]} ({origem}, {fonte}, {round(time.time() - t0)} s): {", ".join(c["nome"] for c in info["camadas"])}', flush=True)
        return m
    except Exception as e:
        print(f'  falhou {t}: {e}', flush=True)
        return None


def faz_dia(data, usadas, manter=()):
    """Completa o dia até 5 músicas; 'manter' são as que já existem (ficam nos mesmos lugares)."""
    rnd = random.Random(f'faixa-{data}-{len(usadas)}')
    top = [x for x in lista('mais-ouvidas.txt') if F.slug(f'{x[1]}-{x[0]}') not in usadas]
    curt = [x for x in lista('curtidas-e-veio.txt') if F.slug(f'{x[1]}-{x[0]}') not in usadas]
    # nota de fama do Antigravity (1-5): das curtidas, só as conhecidas (>= 3); do top, tudo menos as nichadas (1)
    TG = etiquetas_catalogo()
    fama = lambda x: (TG.get(F.slug(f'{x[1]}-{LIMPA.sub("", x[0]).strip()}')) or {}).get('fama') or 3
    top = [x for x in top if fama(x) >= 2]
    curt = [x for x in curt if fama(x) >= 3]
    # o que o filtro de nome ou o Antigravity barrou (versões, funk de meme, nichadas) não entra
    try:
        import pesquisa as P
        V = P.vereditos()
        top = [x for x in top if P.situacao(x[0], x[1], None, V)[0] != 'barrada']
        curt = [x for x in curt if P.situacao(x[0], x[1], None, V)[0] != 'barrada']
    except Exception as e:
        print(f'  sem filtro da pesquisa: {e}', flush=True)
    rnd.shuffle(top); rnd.shuffle(curt)
    musicas = list(manter)
    pasta_dia = SAIDA / data
    while len(musicas) < POR_DIA and (top or curt):
        quer_top = sum(1 for m in musicas if m['origem'] == 'top') < DO_TOP
        origem, (t, a) = ('top', top.pop()) if (quer_top and top) or not curt else ('curtida', curt.pop())
        chave = F.slug(f'{a}-{t}')
        usadas.add(chave)
        n = min(set(range(POR_DIA)) - {m['n'] for m in musicas})
        m = uma(t, a, origem, pasta_dia, n, TG)
        if m: musicas.append(m)
    return sorted(musicas, key=lambda m: m['n'])


def trocar_nichadas():
    """Nos dias já gerados, troca as músicas pouco conhecidas por outras (mesmo dia, mesmo lugar)."""
    idx = json.loads(INDICE.read_text())
    for k in sorted(idx):
        manter, sai = [], []
        for m in idx[k]:
            try:
                tr = json.loads(F.baixa(f"https://api.deezer.com/track/{m['dz']['t']}")) if m.get('dz') else {}
                ok, rank, fas = conhecida({'rank': tr.get('rank', 0), 'artist': {'id': m['dz']['a']}}) if m.get('dz') else (False, 0, 0)
            except Exception:
                ok, rank, fas = True, -1, -1  # sem rede: não mexe
            (manter if ok else sai).append(m)
            if not ok:
                print(f'  {k}: sai {m["t"]} — {m["a"]} (rank {rank}, {fas} fãs)', flush=True)
        if not sai and len(idx[k]) >= POR_DIA:
            continue
        usadas = {m['id'] for kk, ms in idx.items() for m in ms}
        novas = faz_dia(k, usadas, manter)
        if len(novas) == POR_DIA:
            idx = json.loads(INDICE.read_text())
            idx[k] = novas
            INDICE.write_text(json.dumps(dict(sorted(idx.items())), ensure_ascii=False, indent=1))


def main():
    if '--trocar-nichadas' in sys.argv:
        return trocar_nichadas()
    hoje = dt.date.today()
    args = sys.argv[1:]
    if '--data' in args:
        datas = [dt.date.fromisoformat(args[args.index('--data') + 1])]
    else:
        ini = dt.date.fromisoformat(args[args.index('--desde') + 1]) if '--desde' in args else hoje
        datas = [ini + dt.timedelta(days=i) for i in range((hoje + dt.timedelta(days=1) - ini).days + 1)]
    idx = json.loads(INDICE.read_text()) if INDICE.exists() else {}
    for d in datas:
        k = d.isoformat()
        if k in idx and '--data' not in args:
            continue
        usadas = {m['id'] for kk, ms in idx.items() if kk != k for m in ms}
        print('dia', k, flush=True)
        musicas = faz_dia(k, usadas)
        if len(musicas) == POR_DIA:
            idx = json.loads(INDICE.read_text()) if INDICE.exists() else {}
            idx[k] = musicas
            INDICE.write_text(json.dumps(dict(sorted(idx.items())), ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
