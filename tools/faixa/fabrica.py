#!/usr/bin/env python3
"""Fábrica de pacotes do minijogo "Faixa a Faixa".

Cada música vira um trecho de 30 s separado em camadas (bateria, baixo, guitarra…),
que o jogo vai ligando uma a uma. Três fontes, para comparar:

  originais  faixas que já vêm separadas nos charts do Clone Hero (~/.clonehero/Songs)
  ia         separação por IA (Demucs htdemucs_6s) do áudio completo
  midi       arquivo MIDI (BitMidi) tocado por instrumento no FluidSynth

Uso:  python3 tools/faixa/fabrica.py originais|ia|midi [--so "nome"]
Saída: public/jogos/faixa/<fonte>/<id>/<n>.webm + capa.jpg, e public/jogos/faixa/pacotes.json
"""
import json, os, re, struct, subprocess, sys, tempfile, unicodedata, urllib.parse, urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = RAIZ / 'public' / 'jogos' / 'faixa'
SONGS = Path.home() / '.clonehero' / 'Songs' / 'Spotify'
DEMUCS = Path.home() / '.local' / 'share' / 'demucs' / '.venv' / 'bin' / 'python'
SF2 = '/usr/share/soundfonts/FluidR3_GM.sf2'
DUR = 30  # segundos de cada trecho
ALVO_LUFS = -17

# --- músicas de cada fonte (nomes das pastas/arquivos em ~/.clonehero/Songs/Spotify) ---
ORIGINAIS = ['Evanescence - Bring Me to Life.sng', 'Radiohead - Creep.sng', 'Nirvana - Come As You Are (Live from MTV Unplugged).sng',
             'Ram Jam - Black Betty.sng', 'ACDC - Thunderstruck (Live).sng', "Tom Petty - Runnin' Down a Dream.sng",
             'The Daughters Of Eve - Hey Lover', 'ACDC - Back in Black (Live).sng']
IA = ['Chitãozinho & Xororó - Evidências', 'Tim Maia - O Descobridor dos Sete Mares', 'Skank - Ainda Gosto Dela',
      'Charlie Brown Jr - Céu Azul', 'Lulu Santos - Tempos Modernos', 'Harry Styles - As It Was', 'a-ha - Take on Me',
      'ROSÉ & Bruno Mars - APT.', 'The Weeknd - Blinding Lights', 'Linkin Park - In the End',
      # as mesmas das originais, para comparar a IA com as faixas de verdade
      'Radiohead - Creep.sng', 'Evanescence - Bring Me to Life.sng']
MIDI = [('a-ha', 'Take on Me'), ('Michael Jackson', 'Billie Jean'), ("Guns N' Roses", "Sweet Child o' Mine"),
        ('Linkin Park', 'In the End'), ('The Weeknd', 'Blinding Lights'), ('Michael Jackson', 'Beat It'),
        ('Nirvana', 'Smells Like Teen Spirit'), ('KISS', "I Was Made for Lovin' You")]

NOMES = {'bateria': 'Bateria', 'baixo': 'Baixo', 'base': 'Guitarra base', 'guitarra': 'Guitarra', 'violao': 'Violão',
         'teclado': 'Teclado', 'piano': 'Piano', 'outros': 'Outros', 'resto': 'Resto da banda', 'melodia': 'Melodia', 'voz': 'Voz'}
ORDEM = ['bateria', 'baixo', 'base', 'guitarra', 'violao', 'piano', 'teclado', 'outros', 'resto', 'melodia', 'voz']


UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'}
def baixa(url, destino=None):
    h = {'User-Agent': 'cineminha-faixa/1.0 (jogo entre amigos)'} if 'musicbrainz.org' in url else UA
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=30) as r:
        dados = r.read()
    if destino:
        Path(destino).write_bytes(dados)
    return dados


def slug(t):
    t = unicodedata.normalize('NFD', t).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')[:60]


def run(*a, **k):
    r = subprocess.run([str(x) for x in a], capture_output=True, text=True, **k)
    if r.returncode:
        raise RuntimeError(f'{a[0]} falhou: {r.stderr[-800:]}')
    return r


# ---------------- leitura dos charts ----------------
def ler_sng(caminho):
    """SNGPKG v1 (Clone Hero) -> (metadados, {arquivo: bytes}). Mesmo formato do ch2wtde.py."""
    d = open(caminho, 'rb').read()
    if d[:6] != b'SNGPKG':
        raise ValueError('não é .sng')
    pos = 10
    mask = d[pos:pos + 16]; pos += 16
    def u64():
        nonlocal pos; v = struct.unpack_from('<Q', d, pos)[0]; pos += 8; return v
    def i32():
        nonlocal pos; v = struct.unpack_from('<i', d, pos)[0]; pos += 4; return v
    u64(); meta = {}
    for _ in range(u64()):
        n = i32(); k = d[pos:pos + n].decode('utf-8', 'replace'); pos += n
        n = i32(); v = d[pos:pos + n].decode('utf-8', 'replace'); pos += n
        meta[k] = v
    u64(); ents = []
    for _ in range(u64()):
        n = d[pos]; pos += 1
        nome = d[pos:pos + n].decode('utf-8', 'replace'); pos += n
        tam = u64(); ini = u64(); ents.append((nome, tam, ini))
    xor = bytes(mask[i % 16] ^ (i & 0xFF) for i in range(256))
    arqs = {}
    for nome, tam, ini in ents:
        bloco = d[ini:ini + tam]
        chave = (xor * (len(bloco) // 256 + 1))[:len(bloco)]
        arqs[nome] = (int.from_bytes(bloco, 'big') ^ int.from_bytes(chave, 'big')).to_bytes(len(bloco), 'big')
    return meta, arqs


def abre_chart(nome, tmp):
    """Devolve (meta, {arquivo: caminho}) de uma pasta ou .sng."""
    p = SONGS / nome
    if p.is_dir():
        meta = {}
        ini = p / 'song.ini'
        if ini.exists():
            for l in ini.read_text('utf-8', 'replace').splitlines():
                if '=' in l:
                    k, v = l.split('=', 1); meta[k.strip().lower()] = v.strip()
        return meta, {f.name: f for f in p.iterdir()}
    meta, arqs = ler_sng(p)
    out = {}
    for n, b in arqs.items():
        f = Path(tmp) / n; f.write_bytes(b); out[n] = f
    return {k.lower(): v for k, v in meta.items()}, out


def info_basica(nome, meta):
    art, _, tit = nome.removesuffix('.sng').partition(' - ')
    return (meta.get('name') or tit).strip(), (meta.get('artist') or art).strip()


def inicio_previa(meta, total):
    try:
        ms = int(float(meta.get('preview_start_time', '-1')))
        if ms > 0:
            return min(ms / 1000, max(0, total - DUR))
    except ValueError:
        pass
    return max(0, min(total * .3, total - DUR))


def duracao(f):
    r = run('ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f)
    return float(r.stdout.strip() or 0)


# ---------------- áudio ----------------
def corta(f, ini, out):
    run('ffmpeg', '-v', 'error', '-y', '-ss', f'{ini:.2f}', '-t', DUR, '-i', f, '-ac', '2', '-ar', '44100', out)


def junta(fs, out):
    if len(fs) == 1:
        os.replace(fs[0], out); return
    run('ffmpeg', '-v', 'error', '-y', *sum([['-i', f] for f in fs], []), '-filter_complex', f'amix=inputs={len(fs)}:normalize=0', out)


def energia(f):
    r = subprocess.run(['ffmpeg', '-v', 'info', '-i', str(f), '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.search(r'mean_volume: (-?[\d.]+) dB', r.stderr)
    return float(m.group(1)) if m else -99


def lufs(fs):
    """Loudness da mistura de todas as camadas (para pôr todas as músicas no mesmo volume)."""
    tmp = Path(fs[0]).with_name('_mix.wav'); junta_copia(fs, tmp)
    r = subprocess.run(['ffmpeg', '-v', 'info', '-i', str(tmp), '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], capture_output=True, text=True)
    tmp.unlink(missing_ok=True)
    m = re.search(r'"input_i" : "(-?[\d.]+)"', r.stderr)
    return float(m.group(1)) if m else ALVO_LUFS


def junta_copia(fs, out):
    if len(fs) == 1:
        run('cp', fs[0], out); return
    run('ffmpeg', '-v', 'error', '-y', *sum([['-i', f] for f in fs], []), '-filter_complex', f'amix=inputs={len(fs)}:normalize=0', out)


def publica(camadas, pasta, extra):
    """camadas: [(tipo, wav)] -> webm opus com o mesmo ganho em todas; devolve a lista para o JSON."""
    camadas = [(t, f) for t, f in camadas if energia(f) > -50]  # tira faixa muda
    camadas.sort(key=lambda x: ORDEM.index(x[0]))
    if len(camadas) < 2:
        raise RuntimeError('menos de 2 camadas com som')
    ganho = max(-12, min(12, ALVO_LUFS - lufs([f for _, f in camadas])))
    pasta.mkdir(parents=True, exist_ok=True)
    for f in pasta.glob('*.webm'):
        f.unlink()
    out = []
    for i, (t, f) in enumerate(camadas):
        run('ffmpeg', '-v', 'error', '-y', '-i', f, '-af', f'volume={ganho:.2f}dB,afade=t=in:d=0.05', '-c:a', 'libopus', '-b:a', '64k', '-vbr', 'on', pasta / f'{i}.webm')
        out.append({'tipo': t, 'nome': NOMES[t], 'arq': f'{i}.webm'})
    return {**extra, 'camadas': out}


def capa_de(arqs, pasta, tit, art):
    for n, f in arqs.items():
        if n.lower().startswith('album') and n.lower().endswith(('.jpg', '.png', '.jpeg')):
            try:
                run('ffmpeg', '-v', 'error', '-y', '-i', f, '-vf', 'scale=300:300', pasta / 'capa.jpg'); return 'capa.jpg'
            except RuntimeError:
                pass
    return capa_deezer(pasta, tit, art)


def capa_deezer(pasta, tit, art):
    try:
        q = urllib.parse.quote(f'{art} {tit}')
        d = json.loads(baixa(f'https://api.deezer.com/search?q={q}&limit=1'))
        url = d['data'][0]['album']['cover_medium']
        pasta.mkdir(parents=True, exist_ok=True)
        baixa(url, pasta / 'capa.jpg'); return 'capa.jpg'
    except Exception as e:
        print('  sem capa:', e); return ''


# ---------------- fontes ----------------
TIPO_ORIG = [(r'^drums', 'bateria'), (r'^bass', 'baixo'), (r'^rhythm', 'base'), (r'^guitar', 'guitarra'), (r'^keys', 'teclado'),
             (r'^(vocals|harmon)', 'voz'), (r'^song', 'resto')]


def fonte_originais(nome, tmp):
    meta, arqs = abre_chart(nome, tmp)
    tit, art = info_basica(nome, meta)
    grupos = {}
    for n, f in arqs.items():
        base = n.lower().rsplit('.', 1)
        if len(base) < 2 or base[1] not in ('opus', 'ogg', 'mp3', 'wav'):
            continue
        tipo = next((t for rx, t in TIPO_ORIG if re.match(rx, base[0])), None)
        if tipo:
            grupos.setdefault(tipo, []).append(f)
    if len(grupos) < 3:
        raise RuntimeError(f'só {list(grupos)} separados')
    total = max(duracao(f) for fs in grupos.values() for f in fs)
    ini = inicio_previa(meta, total)
    camadas = []
    for t, fs in grupos.items():
        cortes = []
        for j, f in enumerate(fs):
            c = Path(tmp) / f'{t}{j}.wav'; corta(f, ini, c); cortes.append(c)
        out = Path(tmp) / f'{t}.wav'; junta(cortes, out); camadas.append((t, out))
    return tit, art, arqs, camadas, {'inicio': round(ini, 1)}


def fonte_ia(nome, tmp):
    meta, arqs = abre_chart(nome, tmp)
    tit, art = info_basica(nome, meta)
    audios = [f for n, f in arqs.items() if n.lower().rsplit('.', 1)[-1] in ('opus', 'ogg', 'mp3', 'wav') and not n.lower().startswith('crowd')]
    total = max(duracao(f) for f in audios)
    ini = inicio_previa(meta, total)
    cortes = []
    for j, f in enumerate(audios):
        c = Path(tmp) / f'in{j}.wav'; corta(f, ini, c); cortes.append(c)
    mix = Path(tmp) / 'mix.wav'; junta(cortes, mix)  # a música inteira (se vier em faixas, junta antes)
    import time; t0 = time.time()
    run(DEMUCS, '-m', 'demucs', '-n', 'htdemucs_6s', '-o', Path(tmp) / 'sep', mix)
    seg = time.time() - t0
    d = Path(tmp) / 'sep' / 'htdemucs_6s' / 'mix'
    mapa = {'drums': 'bateria', 'bass': 'baixo', 'guitar': 'guitarra', 'piano': 'piano', 'other': 'outros', 'vocals': 'voz'}
    return tit, art, arqs, [(t, d / f'{s}.wav') for s, t in mapa.items()], {'inicio': round(ini, 1), 'segundos_ia': round(seg)}


def fonte_midi(par, tmp):
    import mido  # do venv do demucs
    art, tit = par
    q = urllib.parse.quote(f'{tit}')
    res = json.loads(baixa(f'https://bitmidi.com/api/midi/search?q={q}&page=0&pageSize=20'))['result']['results']
    chave = [w for w in re.findall(r'[a-z0-9]+', slug(tit)) if len(w) > 2]
    res = [r for r in res if slug(tit) in slug(r['name'])]  # só aceita se o título inteiro aparecer no nome do arquivo
    if not res:
        raise RuntimeError('sem MIDI')
    r = max(res, key=lambda x: x.get('views', 0))
    mid = Path(tmp) / 'm.mid'
    baixa('https://bitmidi.com' + r['downloadUrl'], mid)
    m = mido.MidiFile(mid)
    # grupo de cada canal pelo instrumento (General MIDI); canal 10 = bateria
    prog = {}
    for tr in m.tracks:
        for msg in tr:
            if msg.type == 'program_change':
                prog.setdefault(msg.channel, msg.program)
    def grupo(ch):
        if ch == 9: return 'bateria'
        p = prog.get(ch, 0)
        if 32 <= p <= 39: return 'baixo'
        if 24 <= p <= 31: return 'guitarra'
        if p <= 7: return 'piano'
        if 16 <= p <= 23: return 'teclado'
        if 56 <= p <= 87 or 104 <= p <= 111: return 'melodia'
        return 'outros'
    canais = {msg.channel for tr in m.tracks for msg in tr if msg.type == 'note_on'}
    grupos = {}
    for ch in canais:
        grupos.setdefault(grupo(ch), []).append(ch)
    camadas = []
    for g, chs in grupos.items():
        sub = mido.MidiFile(type=m.type, ticks_per_beat=m.ticks_per_beat)
        for tr in m.tracks:
            nt = mido.MidiTrack()
            for msg in tr:
                if hasattr(msg, 'channel') and msg.channel not in chs and msg.type in ('note_on', 'note_off'):
                    nt.append(msg.copy(velocity=0) if msg.type == 'note_on' else msg)  # silencia os outros canais
                else:
                    nt.append(msg)
            sub.tracks.append(nt)
        f = Path(tmp) / f'{g}.mid'; sub.save(f)
        w = Path(tmp) / f'{g}_full.wav'
        run('fluidsynth', '-ni', '-g', '0.8', '-F', w, '-r', '44100', SF2, f)
        camadas.append((g, w))
    total = max(duracao(w) for _, w in camadas)
    ini = max(0, min(total * .3, total - DUR))
    out = []
    for g, w in camadas:
        c = Path(tmp) / f'{g}.wav'; corta(w, ini, c); out.append((g, c))
    return tit, art, {}, out, {'inicio': round(ini, 1), 'midi': r['name']}


def main():
    fonte = sys.argv[1]
    so = sys.argv[sys.argv.index('--so') + 1].lower() if '--so' in sys.argv else ''
    lista = {'originais': ORIGINAIS, 'ia': IA, 'midi': MIDI}[fonte]
    fn = {'originais': fonte_originais, 'ia': fonte_ia, 'midi': fonte_midi}[fonte]
    idx = SAIDA / 'pacotes.json'
    pac = json.loads(idx.read_text()) if idx.exists() else {}
    musicas = {m['id']: m for m in pac.get(fonte, {}).get('musicas', [])}
    for item in lista:
        nome = item if isinstance(item, str) else ' - '.join(item)
        if so and so not in nome.lower():
            continue
        print('→', nome, flush=True)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                tit, art, arqs, camadas, extra = fn(item, tmp)
                mid = slug(f'{art}-{tit}')
                pasta = SAIDA / fonte / mid
                pasta.mkdir(parents=True, exist_ok=True)
                capa = capa_de(arqs, pasta, tit, art) if arqs else capa_deezer(pasta, tit, art)
                musicas[mid] = publica(camadas, pasta, {'id': mid, 't': tit, 'a': art, 'capa': capa, **extra})
                print('  ok:', ', '.join(c['nome'] for c in musicas[mid]['camadas']), extra, flush=True)
        except Exception as e:
            print('  pulei:', e, flush=True)
    pac = json.loads(idx.read_text()) if idx.exists() else {}  # relê: outra fonte pode ter gravado enquanto isso
    pac[fonte] = {'musicas': list(musicas.values())}
    SAIDA.mkdir(parents=True, exist_ok=True)
    idx.write_text(json.dumps(pac, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
