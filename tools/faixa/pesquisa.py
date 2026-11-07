#!/usr/bin/env python3
"""Pesquisa de músicas para o Faixa a Faixa: de onde vêm as candidatas e quem passa no filtro.

Listas (tools/faixa/listas):
  mais-ouvidas.txt, curtidas-e-veio.txt      as originais (exportadas do Spotify)
  spotify.json                               o que a extensão do Spicetify mandou (top, curtidas, playlists, recentes)
  pesquisa-icones.txt, pesquisa-parecidas.txt  o que o Antigravity sugeriu
  veredito.json                              revisão do Antigravity: ok / nichada / genérica / versão (cache)

Uso:
  pesquisa.py icones [qtd]       clássicos que todo mundo conhece e que não estão nas suas listas
  pesquisa.py parecidas [qtd]    conhecidas na linha das suas mais ouvidas
  pesquisa.py revisar [qtd]      o Antigravity revisa as candidatas ainda sem veredito
  pesquisa.py spotify            importa o spotify.json mais recente para as fontes
  pesquisa.py fontes             quantas candidatas cada fonte tem (aprovadas / sem veredito / barradas)
"""
import json, random, re, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import fabrica as F

AQUI = Path(__file__).parent
L = AQUI / 'listas'
VEREDITO = L / 'veredito.json'
SPOTIFY = L / 'spotify.json'
DIAS = F.SAIDA / 'dias.json'

# o que nem precisa perguntar: versões, remixes, funk/slowed de meme, trilha de trailer
BARRA = re.compile(r'\b(funk|slowed|sped ?up|nightcore|remix|mashup|cover|vers[aã]o|version|orchestral|orquestral|epic|8-?bit|lo-?fi|instrumental|karaok[eê]|trailer|ost|op(ening)?\s*\d|ending\s*\d|medley|tribute|x\s)\b|\s[x×]\s', re.I)
FONTES = {
    # fonte: (peso na leva, descrição)
    'top': (30, 'suas mais ouvidas (lista antiga)'),
    'sp-top': (20, 'mais tocadas no Spotify (4 semanas, 6 meses, sempre) fora das curtidas'),
    'curtida': (15, 'curtidas e "de veio"'),
    'sp-playlist': (10, 'das suas playlists'),
    'icone': (15, 'ícones que todo mundo conhece (Antigravity)'),
    'parecida': (10, 'conhecidas parecidas com as que você ouve (Antigravity)'),
    # paradas (paradas.py, sem login; peso 0 = desligada até você ligar com "musica-cineminha fontes tiktok=20")
    'sp-br': (8, 'Spotify Brasil: top 200 do dia'),
    'sp-global': (4, 'Spotify mundo: top da semana'),
    'sp-sempre': (8, 'Spotify Brasil: as mais tocadas de todos os tempos'),
    'tiktok': (6, 'hits do TikTok (playlists de virais da Deezer)'),
    'deezer-br': (4, 'Deezer: Top Brasil'),
}
CONFIG = L / 'fontes-config.json'  # pesos escolhidos por você (sobrepõem os de cima)
try:
    for _f, _p in json.loads(CONFIG.read_text()).get('pesos', {}).items():
        if _f in FONTES: FONTES[_f] = (max(0, int(_p)), FONTES[_f][1])
except Exception:
    pass


def salva_pesos(pesos):
    cfg = json.loads(CONFIG.read_text()) if CONFIG.exists() else {}
    cfg.setdefault('pesos', {}).update({f: max(0, int(p)) for f, p in pesos.items() if f in FONTES})
    CONFIG.write_text(json.dumps(cfg, ensure_ascii=False, indent=1))
    for f, p in cfg['pesos'].items():
        if f in FONTES: FONTES[f] = (p, FONTES[f][1])


def chave(t, a):
    return F.slug(f'{a}-{t}')


def ler_txt(nome, secao=None):
    p = L / nome
    if not p.exists():
        return []
    out, cur = [], None
    for l in p.read_text('utf-8').splitlines():
        if l.startswith('##'):
            cur = l[2:].strip(); continue
        if '|' in l and (secao is None or cur in secao):
            t, a = l.split('|', 1)
            if t.strip() and a.strip():
                out.append((t.strip(), a.strip().split('|')[0].strip()))
    return out


def spotify():
    try:
        return json.loads(SPOTIFY.read_text())
    except Exception:
        return {}


def fontes():
    """{fonte: [(titulo, artista, extra)]} sem repetir música entre fontes (a primeira fonte ganha)."""
    sp = spotify()
    curt_sp = {chave(x['t'], x['a']) for x in sp.get('curtidas', [])}
    curt_txt = {chave(t, a) for t, a in ler_txt('curtidas-e-veio.txt')}
    todas = {
        'top': [(t, a, {}) for t, a in ler_txt('mais-ouvidas.txt')],
        'sp-top': [(x['t'], x['a'], {'pop': x.get('pop')}) for x in sp.get('top', []) if chave(x['t'], x['a']) not in curt_sp | curt_txt],
        'curtida': [(t, a, {}) for t, a in ler_txt('curtidas-e-veio.txt')] + [(x['t'], x['a'], {'pop': x.get('pop')}) for x in sp.get('curtidas', [])],
        'sp-playlist': [(x['t'], x['a'], {'pop': x.get('pop')}) for x in sp.get('playlists', [])],
        'icone': [(t, a, {}) for t, a in ler_txt('pesquisa-icones.txt')],
        'parecida': [(t, a, {}) for t, a in ler_txt('pesquisa-parecidas.txt')],
        **{f: [(x['t'], x['a'], {'pos': x.get('pos')}) for x in lista] for f, lista in paradas().items() if f in FONTES},
    }
    for f in FONTES: todas.setdefault(f, [])
    vistos, out = set(), {}
    for f in FONTES:
        out[f] = []
        for t, a, ex in todas[f]:
            k = chave(t, a)
            if k in vistos: continue
            vistos.add(k); out[f].append((t, a, ex))
    return out


def paradas():
    try:
        import paradas as PR
        return PR.ler()
    except Exception:
        return {}


def vereditos():
    try:
        return json.loads(VEREDITO.read_text())
    except Exception:
        return {}


def usadas():
    try:
        return {m['id'] for ms in json.loads(DIAS.read_text()).values() for m in ms}
    except Exception:
        return set()


_CAT = None
def _cat():
    global _CAT
    if _CAT is None:
        try: _CAT = json.loads((L / 'catalogo-tags.json').read_text())
        except Exception: _CAT = {}
    return _CAT
F_LIMPA = lambda t: re.sub(r'\s*[-(\[]\s*(feat\.?|ft\.?|with|ao vivo|live|remaster|radio edit|edit|mono|stereo).*$', '', t, flags=re.I).strip()


def situacao(t, a, ex=None, V=None):
    """'ok', 'barrada' (motivo) ou None (sem veredito ainda)."""
    V = vereditos() if V is None else V
    if BARRA.search(t) or BARRA.search(a):
        return 'barrada', 'versão/remix/funk no nome'
    if ex and ex.get('pop') is not None and ex['pop'] < 35:
        return 'barrada', f"pouco tocada no Spotify ({ex['pop']})"
    v = V.get(chave(t, a))
    if not v:
        # nota de fama que o Antigravity já deu no catálogo (catalogo-tags.json)
        fama = (_cat().get(chave(t, a)) or _cat().get(chave(F_LIMPA(t), a)) or {}).get('fama')
        if fama: return ('ok', f'fama {fama}') if fama >= 3 else ('barrada', f'fama {fama} (nichada)')
        return None, ''
    return ('ok', v.get('motivo', '')) if v.get('ok') else ('barrada', v.get('motivo', ''))


def agy(prompt, timeout=600):
    """Pergunta ao Antigravity (agy -p) e devolve o texto."""
    r = subprocess.run(['agy', '-p', prompt, '--print-timeout', f'{timeout}s'], capture_output=True, text=True, timeout=timeout + 60)
    return r.stdout


CRITERIO = """Critério (é um jogo de adivinhar música entre amigos brasileiros de 20 e poucos anos):
- OK: música original que a maioria desse grupo reconheceria ouvindo um trecho (hits, clássicos, virais grandes, sucessos de novela/futebol, rock/pop/MPB/sertanejo/funk/pagode populares, temas de anime/jogo MUITO famosos na versão original).
- NÃO: versões (funk/forró/orquestral/épica/acústica/slowed/remix/cover/mashup), memes de nicho, trilhas que só fã conhece, artista pequeno, música genérica de playlist (lo-fi, fundo, instrumental anônimo), coisa que ninguém do grupo conheceria."""


def revisar(qtd=120, lote=60):
    """O Antigravity dá veredito nas candidatas ainda sem veredito (prioriza as fontes de maior peso)."""
    V = vereditos(); us = usadas()
    pend = []
    for f, xs in fontes().items():
        for t, a, ex in xs:
            if chave(t, a) in us: continue
            s, _ = situacao(t, a, ex, V)
            if s is None: pend.append((t, a))
    random.shuffle(pend)
    pend = pend[:qtd]
    if not pend:
        print('nada para revisar'); return 0
    feitas = 0
    for i in range(0, len(pend), lote):
        grupo = pend[i:i + lote]
        linhas = '\n'.join(f'{k}|{t}|{a}' for k, (t, a) in enumerate(grupo))
        print(f'  revisando {len(grupo)} com o Antigravity…', flush=True)
        txt = agy(f"""{CRITERIO}

Para cada linha (indice|titulo|artista), responda UMA linha: indice|ok ou nao|fama 1-5|motivo curto (até 6 palavras).
Sem texto antes ou depois.

{linhas}""")
        for l in txt.splitlines():
            p = [x.strip() for x in l.split('|')]
            if len(p) < 3 or not p[0].isdigit() or int(p[0]) >= len(grupo): continue
            t, a = grupo[int(p[0])]
            ok = p[1].lower().startswith('ok')
            fama = int(p[2]) if p[2].isdigit() else None
            V[chave(t, a)] = {'ok': ok and (fama is None or fama >= 3), 'fama': fama, 'motivo': p[3] if len(p) > 3 else '', 't': t, 'a': a, 'quando': time.strftime('%F')}
            feitas += 1
        VEREDITO.write_text(json.dumps(V, ensure_ascii=False, indent=0))
    ok = sum(1 for t, a in pend if V.get(chave(t, a), {}).get('ok'))
    print(f'  {feitas} revisadas · {ok} aprovadas · {feitas - ok} barradas')
    return feitas


def sugerir(tipo, qtd=40):
    """Novas candidatas pelo Antigravity: 'icones' ou 'parecidas'. Grava em pesquisa-<tipo>.txt (sem repetir)."""
    arq = L / f'pesquisa-{tipo}.txt'
    ja = {chave(t, a) for xs in fontes().values() for t, a, _ in xs} | usadas()
    top = [f'{a} — {t}' for t, a in ler_txt('mais-ouvidas.txt')[:60]] + [f"{x['a']} — {x['t']}" for x in spotify().get('top', [])[:40]]
    artistas = sorted({x.split(' — ')[0] for x in top})
    if tipo == 'icones':
        pedido = f"""Liste {qtd} músicas ICÔNICAS que praticamente qualquer brasileiro de 18 a 35 anos reconhece em poucos segundos:
hits internacionais e nacionais de várias décadas (anos 70 até hoje), rock, pop, MPB, sertanejo, funk, pagode, axé, temas de abertura famosos.
Varie gêneros e décadas. Evite o óbvio repetido das listas de 'top 10 de sempre' só de rock gringo."""
    else:
        pedido = f"""A pessoa ouve muito estes artistas: {', '.join(artistas[:70])}.
Liste {qtd} músicas CONHECIDAS (sucessos de verdade, não lado B) na mesma linha de gosto, de artistas desses ou parecidos,
que um grupo de amigos brasileiros reconheceria."""
    txt = agy(f"""{pedido}

{CRITERIO}

Responda só linhas no formato: titulo|artista (título original, sem 'remastered', sem 'ao vivo'). Sem numeração, sem texto extra.""")
    novas = []
    for l in txt.splitlines():
        if '|' not in l: continue
        t, a = [x.strip(' -*"') for x in l.split('|', 1)]
        if not t or not a or len(t) > 80: continue
        k = chave(t, a)
        if k in ja or BARRA.search(t): continue
        ja.add(k); novas.append(f'{t}|{a}')
    if novas:
        with arq.open('a', encoding='utf-8') as f:
            f.write('\n'.join(novas) + '\n')
        # já vieram com o critério do jogo: aprovadas (a Deezer ainda confere a popularidade na hora de gerar)
        V = vereditos()
        for l in novas:
            t, a = l.split('|', 1)
            V.setdefault(chave(t, a), {'ok': True, 'fama': 4, 'motivo': f'sugerida ({tipo})', 't': t, 'a': a, 'quando': time.strftime('%F')})
        VEREDITO.write_text(json.dumps(V, ensure_ascii=False, indent=0))
    print(f'  {len(novas)} novas em {arq.name}')
    return novas


def resumo():
    V = vereditos(); us = usadas()
    print(f"{'fonte':<12} {'peso':>4}  {'aprovadas':>9} {'sem veredito':>12} {'barradas':>8} {'já nos dias':>11}")
    for f, xs in fontes().items():
        c = {'ok': 0, None: 0, 'barrada': 0, 'usada': 0}
        for t, a, ex in xs:
            if chave(t, a) in us: c['usada'] += 1; continue
            c[situacao(t, a, ex, V)[0]] += 1
        print(f"{f:<12} {FONTES[f][0]:>4}  {c['ok']:>9} {c[None]:>12} {c['barrada']:>8} {c['usada']:>11}   {FONTES[f][1]}")
    sp = spotify()
    print(f"\nSpotify: " + (f"exportado em {sp.get('quando', '?')} · {len(sp.get('top', []))} top · {len(sp.get('curtidas', []))} curtidas · {len(sp.get('playlists', []))} de playlists" if sp else 'ainda não exportado (abra o Spotify: a extensão manda sozinha)'))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'fontes'
    n = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else None
    if cmd in ('icones', 'parecidas'): sugerir(cmd, n or 40)
    elif cmd == 'revisar': revisar(n or 120)
    elif cmd in ('fontes', 'spotify'): resumo()
    else: print(__doc__)
