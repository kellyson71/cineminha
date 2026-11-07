#!/usr/bin/env python3
"""Leva do Faixa a Faixa, meio a meio: cada música nova vai, alternando, para os PRÓXIMOS dias (o estoque) e para
o BANCO de dias anteriores (que dá para jogar em "Outros dias"). Os buracos do passado são preenchidos primeiro.

Uso:
  leva.py 30                 30 músicas (15 para frente, 15 para trás)
  leva.py --sem-parar        até Ctrl+C (termina a música que está fazendo)
  leva.py 10 --so futuro     só para frente (ou --so passado)
  leva.py 30 --publicar 10   publica os dados a cada 10 músicas e no fim (padrão: só no fim)
  leva.py 30 --sem-publicar
  leva.py --sem-parar --fontes tiktok,sp-br   só dessas fontes nesta leva (ignora os pesos zerados)
Cada música passa por: fonte sorteada pelo peso → filtro de nome → veredito do Antigravity → popularidade na Deezer.
"""
import datetime as dt, json, os, random, signal, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import fabrica as F, diario as D, pesquisa as P

RAIZ = F.RAIZ
POR_DIA = D.POR_DIA
parar = False
SO_FONTES = None  # --fontes a,b: só essas nesta leva


def _sinal(*_):
    global parar
    if parar: sys.exit(130)
    parar = True
    print('\n  vou parar depois desta música (Ctrl+C de novo sai na hora)', flush=True)


def indice():
    return json.loads(D.INDICE.read_text()) if D.INDICE.exists() else {}


def grava(data, m):
    """Junta a música no dia (relê o índice: a rotina pode ter mexido)."""
    idx = indice()
    ms = [x for x in idx.get(data, []) if x['n'] != m['n']] + [m]
    idx[data] = sorted(ms, key=lambda x: x['n'])
    tmp = D.INDICE.with_suffix('.tmp')
    tmp.write_text(json.dumps(dict(sorted(idx.items())), ensure_ascii=False, indent=1))
    tmp.replace(D.INDICE)


def alvo(lado, idx):
    """Próxima data e vaga para o lado ('futuro' ou 'passado')."""
    hoje = dt.date.today()
    falta = lambda d: len(idx.get(d.isoformat(), [])) < POR_DIA
    if lado == 'futuro':
        d = hoje
        while not falta(d): d += dt.timedelta(days=1)
    else:
        datas = sorted(dt.date.fromisoformat(k) for k in idx)
        d = hoje - dt.timedelta(days=1)
        mais_antiga = datas[0] if datas else d
        while d >= mais_antiga and not falta(d): d -= dt.timedelta(days=1)  # buracos primeiro
        if d < mais_antiga: d = mais_antiga - dt.timedelta(days=1)
    k = d.isoformat()
    n = min(set(range(POR_DIA)) - {m['n'] for m in idx.get(k, [])})
    return k, n


def candidatas():
    """Fila embaralhada por peso das fontes, só com as aprovadas que ainda não estão nos dias."""
    V = P.vereditos(); us = P.usadas()
    por = {}
    for f, xs in P.fontes().items():
        if SO_FONTES and f not in SO_FONTES: continue
        if not SO_FONTES and P.FONTES[f][0] <= 0: continue  # peso 0 = fonte desligada
        ok = [(t, a, ex) for t, a, ex in xs if P.chave(t, a) not in us and P.situacao(t, a, ex, V)[0] == 'ok']
        random.shuffle(ok); por[f] = ok
    return por


def sorteia(por):
    vivas = [f for f in por if por[f]]
    if not vivas: return None
    f = random.choices(vivas, weights=[max(1, P.FONTES[f][0]) for f in vivas])[0]
    t, a, ex = por[f].pop()
    return f, t, a


def publicar():
    print('  publicando os dados (ninguém na sala recarrega)…', flush=True)
    r = subprocess.run(['./deploy.sh', '--dados'], cwd=RAIZ, capture_output=True, text=True)
    print('  publicado' if r.returncode == 0 else f'  falhou ao publicar: {r.stderr[-300:]}', flush=True)


def outra_rodando():
    meu = os.getpid()
    r = subprocess.run(['pgrep', '-f', r'[t]ools/faixa/(diario|estudio|ano|tags|retro)[.]py'], capture_output=True, text=True)
    return [p for p in r.stdout.split() if int(p) != meu]


def main():
    args = sys.argv[1:]
    meta = next((int(a) for a in args if a.isdigit()), 30)
    sem_parar = '--sem-parar' in args
    so = args[args.index('--so') + 1] if '--so' in args else None
    global SO_FONTES
    if '--fontes' in args:
        SO_FONTES = {f.strip() for f in args[args.index('--fontes') + 1].split(',') if f.strip()}
        errado = SO_FONTES - set(P.FONTES)
        if errado: sys.exit(f'fonte desconhecida: {", ".join(errado)} (existem: {", ".join(P.FONTES)})')
        print(f'  só destas fontes: {", ".join(sorted(SO_FONTES))}', flush=True)
    # paradas (Spotify/TikTok/Deezer) com mais de 1 dia: baixa de novo antes de começar
    try:
        import paradas as PR
        if PR.velho(): print('  atualizando as paradas…', flush=True); PR.atualiza()
    except Exception as e:
        print(f'  paradas: {e}', flush=True)
    cada = int(args[args.index('--publicar') + 1]) if '--publicar' in args and len(args) > args.index('--publicar') + 1 and args[args.index('--publicar') + 1].isdigit() else (10 if sem_parar else 0)
    publica = '--sem-publicar' not in args
    signal.signal(signal.SIGINT, _sinal); signal.signal(signal.SIGTERM, _sinal)
    while outra_rodando():
        print('  esperando outra geração terminar…', flush=True); time.sleep(60)

    print(f"leva: {'sem parar' if sem_parar else f'{meta} músicas'}" + (f', só {so}' if so else ', meio a meio (próximos dias / banco de dias anteriores)'), flush=True)
    feitas = {'futuro': 0, 'passado': 0}
    desde_pub = 0
    por = candidatas()
    TG = D.etiquetas_catalogo()
    tentativas = 0
    while not parar and (sem_parar or sum(feitas.values()) < meta):
        # poucas aprovadas na fila: pede revisão de mais candidatas ao Antigravity
        if sum(len(x) for x in por.values()) < 8:
            print('  fila curta: revisando mais candidatas…', flush=True)
            if not P.revisar(120):
                print('  sem candidatas novas; rode "musica-cineminha pesquisar icones" ou "parecidas"', flush=True)
                if not P.sugerir('icones', 40): break
                P.revisar(80)
            por = candidatas()
            if not sum(len(x) for x in por.values()): break
        lado = so or ('futuro' if feitas['futuro'] <= feitas['passado'] else 'passado')
        idx = indice()
        data, n = alvo(lado, idx)
        s = sorteia(por)
        if not s: continue
        f, t, a = s
        tentativas += 1
        print(f'[{sum(feitas.values()) + 1}{"" if sem_parar else f"/{meta}"}] {lado} → {data} vaga {n + 1} · {t} — {a} ({f})', flush=True)
        m = D.uma(t, a, f, D.SAIDA / data, n, TG, rank_min=450_000 if f in ('icone', 'parecida') else None)
        if not m:  # sem prévia ou pouco conhecida na Deezer: não tenta de novo nas próximas levas
            V = P.vereditos(); V[P.chave(t, a)] = {**V.get(P.chave(t, a), {}), 'ok': False, 'motivo': 'Deezer: sem prévia ou pouco conhecida', 't': t, 'a': a}
            P.VEREDITO.write_text(json.dumps(V, ensure_ascii=False, indent=0))
            continue
        grava(data, m)
        feitas[lado] += 1; desde_pub += 1
        if publica and cada and desde_pub >= cada:
            publicar(); desde_pub = 0
    print(f"pronto: {feitas['futuro']} para os próximos dias · {feitas['passado']} para o banco · {tentativas} tentativas", flush=True)
    if publica and desde_pub:
        publicar()


if __name__ == '__main__':
    main()
