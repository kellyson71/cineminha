#!/usr/bin/env python3
"""Categorias de pessoas do Faixa a Faixa: a playlist de cada um vira uma categoria (Gabi, Otávio…).

As listas ficam em listas/pessoas/<id>.txt ("título|artista", lidas da playlist do Spotify).
Cada música do jogo que está na lista de alguém ganha `de: [id, …]` no dias.json; o menu de categorias
mostra uma categoria por pessoa. Músicas de desenho, abertura e jogo ficam escondidas por padrão no menu
(caixinha para incluir), então a fila nem pega essas.

Uso:
  pessoas.py marcar             marca `de` nas músicas que já existem (refaz do zero; idempotente)
  pessoas.py status             quantas de cada pessoa já estão no jogo, na fila, prontas e com erro
  pessoas.py fila [--rank N]    consulta a Deezer, escolhe as mais conhecidas que faltam e monta a fila
  pessoas.py leva [N] [--publicar K] [--primeiro otavio]   processa a fila (N músicas, padrão: todas) no banco de dias anteriores;
                                       com --publicar, publica só os dados (deploy.sh --dados) a cada K e no fim
Sem --publicar nada é publicado.
"""
import concurrent.futures, datetime as dt, json, os, re, signal, subprocess, sys, time, unicodedata
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import fabrica as F, diario as D, leva as L, pesquisa as P

AQUI = Path(__file__).parent
PASTA = AQUI / 'listas' / 'pessoas'
FILA = PASTA / 'fila.json'
PESSOAS = {'gabi': 'Gabi', 'otavio': 'Otávio', 'meris': 'Meris', 'kellyson': 'Kellyson'}
# Kellyson: as listas que abastecem o jogo desde o começo (mais ouvidas, curtidas e playlists do Spotify dele) e
# tudo o que entrou por elas. Não vai para a fila: as músicas dele já entram pela leva e pelo diário
ORIGENS = {'kellyson': {'top', 'sp-top', 'curtida', 'sp-playlist', 'antiga', 'estudio'}}
SEM_FILA = {'kellyson'}
# fica de fora da fila: trilha de desenho, anime, série animada e jogo (o menu esconde essas por padrão)
OBRA = re.compile(r'adventure time|league of legends|\barcane\b|ordem paranormal|ever after high|monster high|原神|attack on titan|'
                  r'life is strange|anime version|k/da|pentakill|hatsune miku|disney|pixar', re.I)
RANK_MIN = 450_000  # mesmo corte das sugestões revisadas (ícones/parecidas) na leva
parar = False


# mesma normalização do public/faixa.js (norm): versões, "feat." e parênteses não contam
def _sa(t):
    return ''.join(c for c in unicodedata.normalize('NFD', str(t or '')) if unicodedata.category(c) != 'Mn').lower()
_VF = re.compile(r'\s(ao vivo|live|acustico|acoustic|remaster(ed|izad[ao])?( \d{4})?|\d{4} remaster(ed)?|versao [a-z ]+|radio edit|single version|deluxe|playback|unplugged|em casa)$')
def norm(t):
    t = re.sub(r'\(.*?\)|\[.*?\]', ' ', _sa(t))
    t = re.sub(r'\s[-–—|/]\s.*$', ' ', t)
    t = re.sub(r'\b(feat|ft|part)\b.*$', ' ', t)
    return _VF.sub('', re.sub(r'[^a-z0-9]+', ' ', t).strip()).strip()
def artistas(a):
    return {norm(x) for x in re.split(r',|&| e | and | x ', _sa(a)) if norm(x)}


def lista(pid):
    if pid == 'kellyson':
        sp = P.spotify()
        xs = P.ler_txt('mais-ouvidas.txt') + P.ler_txt('curtidas-e-veio.txt') + [(x['t'], x['a']) for k in ('top', 'curtidas', 'playlists') for x in sp.get(k, [])]
    else:
        xs = []
        for l in (PASTA / f'{pid}.txt').read_text('utf-8').splitlines():
            if l.startswith('##') or '|' not in l: continue
            xs.append(tuple(x.strip() for x in l.split('|', 1)))
    out, vistos = [], set()
    for t, a in xs:
        if t and a and (t, a) not in vistos: vistos.add((t, a)); out.append((t, a))
    return out


def indice_lista(xs):
    """{título normalizado: [artistas de cada entrada]}: para comparar milhares de músicas sem varrer a lista toda."""
    ix = {}
    for t, a in xs: ix.setdefault(norm(t), []).append(artistas(a))
    return ix


def esta_em(t, a, ix):
    cands = ix.get(norm(t))
    if not cands: return False
    am, an = artistas(a), norm(a)
    return any(c & am or any(x and x in an for x in c) for c in cands)


def donos(m, ixs):
    return [pid for pid, ix in ixs.items() if esta_em(m.get('t'), m.get('a'), ix) or m.get('origem') in ORIGENS.get(pid, ())]


def grava_indice(idx):
    tmp = D.INDICE.with_suffix('.pessoas.tmp')
    tmp.write_text(json.dumps(dict(sorted(idx.items())), ensure_ascii=False, indent=1))
    tmp.replace(D.INDICE)


def marcar(quieto=False):
    listas = {p: indice_lista(lista(p)) for p in PESSOAS}
    idx = L.indice()
    mudou = 0
    cont = {p: [0, 0] for p in PESSOAS}  # [até hoje, próximos dias]
    hoje = dt.date.today().isoformat()
    for d, ms in idx.items():
        for m in ms:
            de = donos(m, listas)
            for p in de: cont[p][d > hoje] += 1
            if de != m.get('de', []):
                mudou += 1
                if de: m['de'] = de
                else: m.pop('de', None)
    if mudou: grava_indice(idx)
    if not quieto:
        for p, (ja, fut) in cont.items():
            print(f'{PESSOAS[p]}: {ja + fut} no jogo ({ja} até hoje, {fut} nos próximos dias)')
        print(f'{mudou} músicas atualizadas no dias.json')
    return mudou


def carrega_fila():
    return json.loads(FILA.read_text()) if FILA.exists() else []


def salva_fila(fila):
    tmp = FILA.with_suffix('.tmp'); tmp.write_text(json.dumps(fila, ensure_ascii=False, indent=1)); tmp.replace(FILA)


def _consulta(par):
    pid, t, a = par
    x = D.deezer(t, a)
    if not x: return {'de': pid, 't': t, 'a': a, 'rank': 0, 'fas': 0, 'sem': 'sem prévia na Deezer'}
    ok, rank, fas = D.conhecida(x)
    return {'de': pid, 't': t, 'a': a, 'rank': rank, 'fas': fas, 'ok': ok, 'dz': x['id']}


def fila(rank_min=RANK_MIN):
    listas = {p: lista(p) for p in PESSOAS}
    todas = [m for ms in L.indice().values() for m in ms]
    antiga = {(x['t'], x['a']): x for x in carrega_fila()}
    faltam = []
    no_jogo = indice_lista([(m['t'], m['a']) for m in todas])
    ixs = {p: indice_lista(xs) for p, xs in listas.items()}
    for p, xs in listas.items():
        if p in SEM_FILA: continue
        for t, a in xs:
            if esta_em(t, a, no_jogo): continue
            if OBRA.search(t) or OBRA.search(a) or P.BARRA.search(t): continue
            if any(norm(t) == norm(y[1]) and artistas(a) & artistas(y[2]) for y in faltam):
                continue  # repetida entre as duas listas (ou na mesma): uma entrada só
            faltam.append((p, t, a))
    print(f'consultando {len(faltam)} músicas na Deezer…', flush=True)
    with concurrent.futures.ThreadPoolExecutor(4) as ex:
        res = list(ex.map(_consulta, faltam))
    for r in res:  # quem tem a música nas duas listas
        r['de'] = [p for p in PESSOAS if esta_em(r['t'], r['a'], ixs[p])]
    boas = sorted([r for r in res if r['rank'] >= rank_min], key=lambda r: -r['rank'])
    nova = []
    for r in boas:
        velho = antiga.get((r['t'], r['a']), {})
        nova.append({**r, 'estado': velho.get('estado', 'pendente'), **({'erro': velho['erro']} if velho.get('erro') else {})})
    # mantém o que já foi feito de uma fila anterior e saiu do corte
    nova += [x for k, x in antiga.items() if x.get('estado') == 'pronta' and k not in {(r['t'], r['a']) for r in nova}]
    salva_fila(nova)
    for p in PESSOAS:
        xs = [r for r in nova if p in r['de']]
        print(f'\n{PESSOAS[p]}: {len(xs)} na fila (de {sum(1 for r in res if p in r["de"])} que faltam)')
        for r in xs: print(f'   {r["rank"]:>8}  {r["t"]} — {r["a"]}')
    fora = [r for r in res if r['rank'] < rank_min]
    print(f'\nficaram de fora (pouco conhecidas ou sem prévia): {len(fora)}')
    return nova


def outra_rodando():
    meu = os.getpid()
    r = subprocess.run(['pgrep', '-f', r'[t]ools/faixa/(diario|estudio|ano|tags|retro|leva|disney_desenhos|importa_playlists)[.]py'], capture_output=True, text=True)
    return [p for p in r.stdout.split() if int(p) != meu]


def _sinal(*_):
    global parar
    if parar: sys.exit(130)
    parar = True
    print('\n  vou parar depois desta música (Ctrl+C de novo sai na hora)', flush=True)


def leva(meta=None, cada=0, primeiro=None):
    signal.signal(signal.SIGINT, _sinal); signal.signal(signal.SIGTERM, _sinal)
    TG = D.etiquetas_catalogo()
    feitas = 0
    while not parar and (meta is None or feitas < meta):
        fl = carrega_fila()
        pend = [x for x in fl if x['estado'] == 'pendente']
        if not pend: break
        # alterna as pessoas: a mais conhecida de quem tem menos prontas
        prontas = {p: sum(1 for x in fl if x['estado'] == 'pronta' and p in x['de']) for p in PESSOAS}
        com = [p for p in PESSOAS if any(p in x['de'] for x in pend)]
        vez = primeiro if primeiro in com else min(com, key=lambda p: prontas[p])  # --primeiro: todas dessa pessoa antes
        it = next(x for x in pend if vez in x['de'])
        while outra_rodando():
            print('  esperando outra geração terminar…', flush=True); time.sleep(60)
        data, n = L.alvo('passado', L.indice())
        print(f'[{feitas + 1}{"" if meta is None else f"/{meta}"}] {PESSOAS[vez]} → {data} vaga {n + 1} · {it["t"]} — {it["a"]}', flush=True)
        m = D.uma(it['t'], it['a'], 'pessoa', D.SAIDA / data, n, TG, rank_min=0)
        fl = carrega_fila()
        alvo = next(x for x in fl if (x['t'], x['a']) == (it['t'], it['a']))
        if not m:
            alvo['estado'] = 'erro'; alvo['erro'] = 'sem prévia, pouco conhecida ou falhou ao separar'
        else:
            m['de'] = alvo['de']
            L.grava(data, m)
            alvo['estado'] = 'pronta'; alvo['dia'] = data; alvo.pop('erro', None)
            feitas += 1
        salva_fila(fl)
        if m and cada and feitas % cada == 0:
            marcar(quieto=True); L.publicar()
    marcar(quieto=True)  # a música nova pode estar na lista da outra pessoa com outro nome
    if cada and feitas % cada: L.publicar()
    print(f'pronto: {feitas} músicas novas.', flush=True)


def status():
    marcar()
    fl = carrega_fila()
    for p in PESSOAS:
        xs = [x for x in fl if p in x['de']]
        c = {e: sum(1 for x in xs if x['estado'] == e) for e in ('pendente', 'pronta', 'erro')}
        print(f'{PESSOAS[p]} na fila: {c["pendente"]} pendentes, {c["pronta"]} prontas, {c["erro"]} com erro')


if __name__ == '__main__':
    a = sys.argv[1:]
    cmd = a[0] if a else 'status'
    if cmd == 'marcar': marcar()
    elif cmd == 'fila': fila(int(a[a.index('--rank') + 1]) if '--rank' in a else RANK_MIN)
    elif cmd == 'leva':
        cada = int(a[a.index('--publicar') + 1]) if '--publicar' in a else 0
        primeiro = a[a.index('--primeiro') + 1] if '--primeiro' in a else None
        leva(next((int(x) for i, x in enumerate(a[1:], 1) if x.isdigit() and a[i - 1] != '--publicar'), None), cada, primeiro)
    else: status()
