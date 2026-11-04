#!/usr/bin/env python3
"""Baixa do Chorus Encore as músicas com faixas de estúdio separadas (lista de acha_stems.py) e monta como
dias retroativos do Faixa a Faixa (antes do primeiro dia existente). Não repete músicas que já estão nos dias.
Uso: estudio.py [--min-faixas 3]"""
import datetime as dt, json, re, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import fabrica as F, diario as D

CACHE = Path.home() / '.cache' / 'faixa-sng'
LISTA = Path(__file__).parent / 'listas' / 'stems-encore.json'


def processa(md5, pasta):
    sng = CACHE / f'{md5}.sng'
    if not sng.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        F.baixa(f'https://files.enchor.us/{md5}.sng', sng)
    meta, arqs = F.ler_sng(sng)
    meta = {k.lower(): v for k, v in meta.items()}
    with tempfile.TemporaryDirectory() as tmp:
        caminhos = {}
        for n, b in arqs.items():
            f = Path(tmp) / n; f.write_bytes(b); caminhos[n] = f
        grupos = {}
        for n, f in caminhos.items():
            base = n.lower().rsplit('.', 1)
            if len(base) < 2 or base[1] not in ('opus', 'ogg', 'mp3', 'wav'):
                continue
            tipo = next((t for rx, t in F.TIPO_ORIG if re.match(rx, base[0])), None)
            if tipo:
                grupos.setdefault(tipo, []).append(f)
        total = max(F.duracao(f) for fs in grupos.values() for f in fs)
        ini = F.inicio_previa(meta, total)
        camadas = []
        for t, fs in grupos.items():
            cortes = []
            for j, f in enumerate(fs):
                c = Path(tmp) / f'{t}{j}.wav'; F.corta(f, ini, c); cortes.append(c)
            out = Path(tmp) / f'{t}.wav'; F.junta(cortes, out); camadas.append((t, out))
        info = F.publica(camadas, pasta, {})
        # na separação do Rock Band, "rhythm" costuma ser baixo/base
        for c in info['camadas']:
            if c['tipo'] == 'base':
                c['nome'] = 'Baixo e base'
    return info


def main():
    minimo = int(sys.argv[sys.argv.index('--min-faixas') + 1]) if '--min-faixas' in sys.argv else 3
    lista = [r for r in json.loads(LISTA.read_text()) if len(r.get('faixas', [])) >= minimo and r.get('md5')]
    idx = json.loads(D.INDICE.read_text())
    ja = {F.slug(f"{m['a']}-{re.sub(r'[(\\[-].*$', '', m['t']).strip()}") for ms in idx.values() for m in ms} | {m['id'] for ms in idx.values() for m in ms}
    novas = [r for r in lista if F.slug(f"{r['a']}-{re.sub(r'[(\\[-].*$', '', r['t']).strip()}") not in ja]
    print(f'{len(novas)} músicas de estúdio novas (de {len(lista)})', flush=True)
    # termina antes dos dias da IA (a leva de 16/10 em diante pode estar sendo gerada agora)
    primeiro = min([dt.date.fromisoformat(d) for d in idx] + [dt.date(2026, 10, 16)])
    dias = (len(novas) + D.POR_DIA - 1) // D.POR_DIA
    dia = primeiro - dt.timedelta(days=dias)
    feitas = []
    for r in novas:
        k = (dia + dt.timedelta(days=len(feitas) // D.POR_DIA)).isoformat()
        n = len(feitas) % D.POR_DIA
        pasta = D.SAIDA / k / str(n)
        try:
            info = processa(r['md5'], pasta)
            x = D.deezer(r['t'], r['a'])
            m = {'id': F.slug(f"{r['a']}-{r['t']}"), 'n': n, 'origem': 'estudio', 'fonte': 'estudio', 't': x['title'] if x else r['t'], 'a': x['artist']['name'] if x else r['a'],
                 'album': x['album']['title'] if x else '', 'dz': {'t': x['id'], 'a': x['artist']['id']} if x else None, 'capa': '', 'camadas': info['camadas'], 'tg': {'fama': r.get('fama'), 'generos': r.get('generos')}}
            if x:
                F.baixa(x['album']['cover_big'], pasta / 'c.jpg')
                F.run('ffmpeg', '-v', 'error', '-y', '-i', pasta / 'c.jpg', '-vf', 'scale=360:360', pasta / 'capa.jpg'); (pasta / 'c.jpg').unlink()
                m['capa'] = 'capa.jpg'
            feitas.append((k, m))
            print(f"  {k} #{n + 1}: {m['t']} — {m['a']}: {', '.join(c['nome'] for c in info['camadas'])}", flush=True)
        except Exception as e:
            print(f"  falhou {r['t']}: {e}", flush=True)
        # grava a cada dia completo
        if len(feitas) % D.POR_DIA == 0 and feitas:
            grava(feitas)
    grava(feitas)


def grava(feitas):
    idx = json.loads(D.INDICE.read_text())
    por = {}
    for k, m in feitas:
        por.setdefault(k, []).append(m)
    for k, ms in por.items():
        idx[k] = sorted(ms, key=lambda m: m['n'])
    D.INDICE.write_text(json.dumps(dict(sorted(idx.items())), ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
