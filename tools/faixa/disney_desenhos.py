#!/usr/bin/env python3
"""Fila e worker de músicas da Disney e Desenhos/Animes para o Faixa a Faixa.

Recursos e garantias:
- Lock exclusivo de processo via fcntl.flock antes de criar PID.
- Respeita processos concorrentes (leva/diario/estudio/retro/ano/tags).
- Deduplica com dias.json por Deezer ID e título/artista, recategorizando existentes.
- Resolvedor Deezer com busca flexível, rejeição de covers/karaokê e fallbacks oficiais.
- Metadados autênticos: diferenciação anime/desenho, país real, fama por rank.
- Limite de CPU a 2 threads, nice alto, sem concorrência destrutiva.
- Gravação atômica (.tmp + os.replace) para dias.json, catalogo.json e fila.
- Assets gerados em pasta temporária e copiados somente quando completos.
- Sem deploy em hipótese alguma (--sem-publicar absoluto).
- Log e status fiéis sem duplicação de linhas.

Comandos:
  python3 tools/faixa/disney_desenhos.py preparar
  python3 tools/faixa/disney_desenhos.py status
  python3 tools/faixa/disney_desenhos.py testar
  python3 tools/faixa/disney_desenhos.py iniciar [--uma] [--limite N] [--daemon]
"""
import datetime as dt
import fcntl
import json
import os
import re
import signal
from itertools import zip_longest
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

# Raiz do cineminha e diretório tools/faixa
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import fabrica as F
import diario as D

RAIZ = F.RAIZ
SAIDA = F.SAIDA
INDICE = D.INDICE
CATALOGO_ARQ = SAIDA / 'catalogo.json'
FILA_ARQ = AQUI / 'listas' / 'disney_desenhos_fila.json'
TOP100_ARQ = AQUI / 'listas' / 'disney_desenhos_top100.json'
FONTES_ARQ = AQUI / 'listas' / 'disney_desenhos_fontes.json'

STATUS_DIR = Path('/tmp/faixa-disney-desenhos')
STATUS_ARQ = STATUS_DIR / 'status.json'
PID_ARQ = STATUS_DIR / 'worker.pid'
LOG_ARQ = STATUS_DIR / 'worker.log'
LOCK_ARQ = STATUS_DIR / 'worker.lock'

DEMUCS_VENV = Path.home() / '.local' / 'share' / 'demucs' / '.venv' / 'bin' / 'python'

# --- Seleção Curada Oficial com Metadados e Fallbacks ---
SELECAO_DISNEY = [
    {
        't': 'Hakuna Matata', 't_en': 'Hakuna Matata', 'obra': 'O Rei Leão', 'tipo': 'disney',
        'a_oficial': 'Ivan Parente', 'a_fallback': 'Elton John', 'pais': 'BR', 'hino': True,
        'encore_q': 'Hakuna Matata',
        'queries': ['Hakuna Matata Rei Leão', 'Hakuna Matata Ivan Parente', 'Hakuna Matata Lion King']
    },
    {
        't': 'O Ciclo Sem Fim', 't_en': 'Circle of Life', 'obra': 'O Rei Leão', 'tipo': 'disney',
        'a_oficial': 'Lilian Valeska', 'a_fallback': 'Elton John', 'pais': 'BR', 'hino': True,
        'encore_q': 'Circle of Life',
        'queries': ['Ciclo Sem Fim Rei Leão', 'Circle of Life Lion King', 'Circle of Life Elton John']
    },
    {
        't': 'Livre Estou', 't_en': 'Let It Go', 'obra': 'Frozen', 'tipo': 'disney',
        'a_oficial': 'Taryn Szpilman', 'a_fallback': 'Idina Menzel', 'pais': 'BR', 'hino': True,
        'encore_q': 'Let It Go Frozen',
        'queries': ['Livre Estou Frozen', 'Let It Go Frozen', 'Let It Go Idina Menzel']
    },
    {
        't': 'Vejo Enfim a Luz Brilhar', 't_en': 'I See the Light', 'obra': 'Enrolados', 'tipo': 'disney',
        'a_oficial': 'Sylvia Salustti', 'a_fallback': 'Mandy Moore', 'pais': 'BR', 'hino': False,
        'encore_q': 'I See the Light Tangled',
        'queries': ['Vejo Enfim a Luz Brilhar', 'Vejo Enfim a Luz Brilhar Enrolados', 'I See the Light Tangled']
    },
    {
        't': 'Um Mundo Ideal', 't_en': 'A Whole New World', 'obra': 'Aladdin', 'tipo': 'disney',
        'a_oficial': 'Kika Tristão', 'a_fallback': 'Mena Massoud', 'pais': 'BR', 'hino': True,
        'encore_q': 'A Whole New World Aladdin',
        'queries': ['Um Mundo Ideal Aladdin', 'A Whole New World Aladdin', 'A Whole New World Mena Massoud']
    },
    {
        't': 'Sentimentos São', 't_en': 'Beauty and the Beast', 'obra': 'A Bela e a Fera', 'tipo': 'disney',
        'a_oficial': 'Ju Cassou', 'a_fallback': 'Celine Dion', 'pais': 'BR', 'hino': False,
        'encore_q': 'Beauty and the Beast',
        'queries': ['Sentimentos São Bela e a Fera', 'Beauty and the Beast Disney', 'Tale As Old As Time']
    },
    {
        't': 'Amigo Estou Aqui', 't_en': "You've Got a Friend in Me", 'obra': 'Toy Story', 'tipo': 'disney',
        'a_oficial': 'Zé da Viola', 'a_fallback': 'Randy Newman', 'pais': 'BR', 'hino': True,
        'encore_q': 'You Have Got a Friend in Me',
        'queries': ['Amigo Estou Aqui Toy Story', 'You Have Got a Friend in Me Randy Newman', 'You Got a Friend in Me']
    },
    {
        't': 'Não Falamos do Bruno', 't_en': "We Don't Talk About Bruno", 'obra': 'Encanto', 'tipo': 'disney',
        'a_oficial': 'Elenco de Encanto', 'a_fallback': 'Carolina Gaitán', 'pais': 'BR', 'hino': True,
        'encore_q': 'We Don\'t Talk About Bruno',
        'queries': ['Não Falamos do Bruno Encanto', 'We Don\'t Talk About Bruno Encanto', 'We Don\'t Talk About Bruno']
    },
    {
        't': 'Saber Quem Sou', 't_en': "How Far I'll Go", 'obra': 'Moana', 'tipo': 'disney',
        'a_oficial': 'Any Gabrielly', 'a_fallback': "Auli'i Cravalho", 'pais': 'BR', 'hino': True,
        'encore_q': 'How Far I\'ll Go Moana',
        'queries': ['Saber Quem Sou Moana', 'How Far I\'ll Go Moana', 'How Far I\'ll Go Cravalho']
    },
    {
        't': 'De Nada', 't_en': "You're Welcome", 'obra': 'Moana', 'tipo': 'disney',
        'a_oficial': 'Saulo Vasconcellos', 'a_fallback': 'Dwayne Johnson', 'pais': 'BR', 'hino': True,
        'encore_q': 'You\'re Welcome Moana',
        'queries': ['De Nada Saulo Vasconcellos', 'De Nada Moana', 'You\'re Welcome Dwayne Johnson']
    },
    {
        't': 'Homem Ser', 't_en': "I'll Make a Man Out of You", 'obra': 'Mulan', 'tipo': 'disney',
        'a_oficial': 'Claudio Galvan', 'a_fallback': 'Donny Osmond', 'pais': 'BR', 'hino': False,
        'encore_q': 'I\'ll Make a Man Out of You Mulan',
        'queries': ['Homem Ser Mulan', 'I\'ll Make a Man Out of You Mulan']
    },
    {
        't': 'Aqui no Mar', 't_en': 'Under the Sea', 'obra': 'A Pequena Sereia', 'tipo': 'disney',
        'a_oficial': 'Sandro Christopher', 'a_fallback': 'Samuel E. Wright', 'pais': 'BR', 'hino': True,
        'encore_q': 'Under the Sea Little Mermaid',
        'queries': ['Aqui no Mar Pequena Sereia', 'Under the Sea Little Mermaid', 'Under the Sea Disney']
    },
    {
        't': 'Parte do Seu Mundo', 't_en': 'Part of Your World', 'obra': 'A Pequena Sereia', 'tipo': 'disney',
        'a_oficial': 'Kiara Sasso', 'a_fallback': 'Jodi Benson', 'pais': 'BR', 'hino': False,
        'encore_q': 'Part of Your World Little Mermaid',
        'queries': ['Parte do Seu Mundo Pequena Sereia', 'Part of Your World Jodi Benson', 'Part of Your World']
    },
    {
        't': 'No Meu Coração Você Vai Estar', 't_en': "You'll Be in My Heart", 'obra': 'Tarzan', 'tipo': 'disney',
        'a_oficial': 'Ed Motta', 'a_fallback': 'Phil Collins', 'pais': 'BR', 'hino': True,
        'encore_q': 'You\'ll Be in My Heart Phil Collins',
        'queries': ['No Meu Coração Você Vai Estar Ed Motta', 'You\'ll Be in My Heart Phil Collins', 'No Meu Coração Você Vai Estar']
    },
    {
        't': 'Filho de Homem', 't_en': 'Son of Man', 'obra': 'Tarzan', 'tipo': 'disney',
        'a_oficial': 'Ed Motta', 'a_fallback': 'Phil Collins', 'pais': 'BR', 'hino': False,
        'encore_q': 'Son of Man Phil Collins',
        'queries': ['Filho de Homem Ed Motta', 'Son of Man Phil Collins', 'Filho de Homem Tarzan']
    },
    {
        't': 'O que Eu Quero Mais É Ser Rei', 't_en': "I Just Can't Wait to Be King", 'obra': 'O Rei Leão', 'tipo': 'disney',
        'a_oficial': 'Paulo Vignolo', 'a_fallback': 'Jason Weaver', 'pais': 'BR', 'hino': False,
        'encore_q': 'I Just Can\'t Wait to Be King',
        'queries': ['O que Eu Quero Mais É Ser Rei', 'I Just Can\'t Wait to Be King Lion King']
    },
    {
        't': 'Cores do Vento', 't_en': 'Colors of the Wind', 'obra': 'Pocahontas', 'tipo': 'disney',
        'a_oficial': 'Kika Tristão', 'a_fallback': 'Judy Kuhn', 'pais': 'BR', 'hino': False,
        'encore_q': 'Colors of the Wind Pocahontas',
        'queries': ['Cores do Vento Pocahontas', 'Colors of the Wind Judy Kuhn', 'Colors of the Wind Vanessa Williams']
    },
    {
        't': 'Quase Lá', 't_en': 'Almost There', 'obra': 'A Princesa e o Sapo', 'tipo': 'disney',
        'a_oficial': 'Kacau Gomes', 'a_fallback': 'Anika Noni Rose', 'pais': 'BR', 'hino': False,
        'encore_q': 'Almost There Princess and the Frog',
        'queries': ['Quase Lá Princesa e o Sapo', 'Almost There Anika Noni Rose', 'Almost There Princess and the Frog']
    },
    {
        't': 'Lembre de Mim', 't_en': 'Remember Me', 'obra': 'Viva - A Vida É uma Festa', 'tipo': 'disney',
        'a_oficial': 'Rogério Flausino', 'a_fallback': 'Gael Garcia Bernal', 'pais': 'BR', 'hino': False,
        'encore_q': 'Remember Me Coco',
        'queries': ['Lembre de Mim Viva Flausino', 'Remember Me Coco Disney', 'Remember Me Gael Garcia Bernal']
    },
    {
        't': 'Se Preparem', 't_en': 'Be Prepared', 'obra': 'O Rei Leão', 'tipo': 'disney',
        'a_oficial': 'Jorgeh Ramos', 'a_fallback': 'Jeremy Irons', 'pais': 'BR', 'hino': False,
        'encore_q': 'Be Prepared Lion King',
        'queries': ['Se Preparem Rei Leão', 'Be Prepared Jeremy Irons', 'Be Prepared Lion King']
    },
    {
        't': 'Príncipe Ali', 't_en': 'Prince Ali', 'obra': 'Aladdin', 'tipo': 'disney',
        'a_oficial': 'Márcio Simões', 'a_fallback': 'Robin Williams', 'pais': 'BR', 'hino': False,
        'encore_q': 'Prince Ali Aladdin',
        'queries': ['Príncipe Ali Márcio Simões', 'Prince Ali Robin Williams', 'Prince Ali Will Smith']
    },
    {
        't': 'Vencer o Mal', 't_en': 'Go the Distance', 'obra': 'Hércules', 'tipo': 'disney',
        'a_oficial': 'Marcelo Coutinho', 'a_fallback': 'Michael Bolton', 'pais': 'BR', 'hino': False,
        'encore_q': 'Go the Distance Hercules',
        'queries': ['Vencer o Mal Hercules', 'Go the Distance Michael Bolton', 'Go the Distance Roger Bart']
    },
]

SELECAO_DESENHOS = [
    {
        't': 'Tema de Pokémon', 't_en': 'Pokémon Theme', 'obra': 'Pokémon', 'tipo': 'anime',
        'a_oficial': 'Janaína Bianchi', 'a_fallback': 'Jason Paige', 'pais': 'BR', 'hino': True,
        'encore_q': 'Pokemon Theme',
        'queries': ['Tema de Pokémon', 'Gotta Catch Em All Pokemon', 'Pokemon Theme Jason Paige']
    },
    {
        't': 'Cha-La Head-Cha-La', 't_en': 'Cha-La Head-Cha-La', 'obra': 'Dragon Ball Z', 'tipo': 'anime',
        'a_oficial': 'Rodrigo Firmino', 'a_fallback': 'Hironobu Kageyama', 'pais': 'BR', 'hino': True,
        'encore_q': 'Cha-La Head-Cha-La',
        'queries': ['Cha-La Head-Cha-La Rodrigo Firmino', 'Cha-La Head-Cha-La Hironobu Kageyama', 'Cha-La Head-Cha-La']
    },
    {
        't': 'Sorriso Resplandecente', 't_en': 'Dan Dan Kokoro Hikareteku', 'obra': 'Dragon Ball GT', 'tipo': 'anime',
        'a_oficial': 'Ricardo Fábio', 'a_fallback': 'Field of View', 'pais': 'BR', 'hino': True,
        'encore_q': 'Dan Dan Kokoro',
        'queries': ['Sorriso Resplandecente Ricardo Fábio', 'Dan Dan Kokoro Hikareteku Field of View', 'Sorriso Resplandecente']
    },
    {
        't': 'Pegasus Fantasy', 't_en': 'Pegasus Fantasy', 'obra': 'Os Cavaleiros do Zodíaco', 'tipo': 'anime',
        'a_oficial': 'Edu Falaschi', 'a_fallback': 'MAKE-UP', 'pais': 'BR', 'hino': True,
        'encore_q': 'Pegasus Fantasy',
        'queries': ['Pegasus Fantasy Edu Falaschi', 'Pegasus Fantasy MAKE-UP', 'Pegasus Fantasy Cavaleiros']
    },
    {
        't': 'Tema de Bob Esponja', 't_en': 'SpongeBob SquarePants Theme', 'obra': 'Bob Esponja', 'tipo': 'desenho',
        'a_oficial': 'Wendel Bezerra', 'a_fallback': 'Painty the Pirate', 'pais': 'BR', 'hino': False,
        'encore_q': 'SpongeBob SquarePants Theme',
        'queries': ['Tema Bob Esponja Wendel Bezerra', 'SpongeBob SquarePants Theme Painty the Pirate', 'Tema Bob Esponja']
    },
    {
        't': 'Tema de Ben 10', 't_en': 'Ben 10 Theme', 'obra': 'Ben 10', 'tipo': 'desenho',
        'a_oficial': 'Juliano Lira', 'a_fallback': 'Andy Sturmer', 'pais': 'BR', 'hino': False,
        'encore_q': 'Ben 10 Theme',
        'queries': ['Tema Ben 10', 'Ben 10 Theme Andy Sturmer']
    },
    {
        't': 'Os Padrinhos Mágicos', 't_en': 'Fairly OddParents Theme', 'obra': 'Os Padrinhos Mágicos', 'tipo': 'desenho',
        'a_oficial': None, 'a_fallback': 'Ron Jones', 'pais': None, 'hino': False,
        'encore_q': 'Fairly OddParents Theme',
        'queries': ['Os Padrinhos Mágicos tema', 'Fairly OddParents Theme']
    },
    {
        't': 'Scooby-Doo, Cadê Você?', 't_en': 'Scooby-Doo, Where Are You?', 'obra': 'Scooby-Doo', 'tipo': 'desenho',
        'a_oficial': None, 'a_fallback': 'David Mook', 'pais': 'US', 'hino': False,
        'encore_q': 'Scooby Doo Where Are You',
        'queries': ['Scooby-Doo Cadê Você', 'Scooby-Doo Where Are You David Mook']
    },
    {
        't': 'What\'s New, Scooby-Doo?', 't_en': 'What\'s New, Scooby-Doo?', 'obra': 'Scooby-Doo', 'tipo': 'desenho',
        'a_oficial': 'Simple Plan', 'a_fallback': 'Simple Plan', 'pais': 'CA', 'hino': False,
        'encore_q': 'Whats New Scooby Doo',
        'queries': ['Whats New Scooby-Doo Simple Plan', 'Whats New Scooby Doo']
    },
    {
        't': 'Phineas e Ferb (Abertura)', 't_en': 'Today Is Gonna Be a Great Day', 'obra': 'Phineas e Ferb', 'tipo': 'desenho',
        'a_oficial': 'Bowling for Soup', 'a_fallback': 'Bowling for Soup', 'pais': 'US', 'hino': False,
        'encore_q': 'Phineas and Ferb Theme',
        'queries': ['Today Is Gonna Be a Great Day Bowling for Soup', 'Phineas and Ferb Bowling for Soup']
    },
    {
        't': 'Haruka Kanata', 't_en': 'Haruka Kanata', 'obra': 'Naruto', 'tipo': 'anime',
        'a_oficial': 'Asian Kung-Fu Generation', 'a_fallback': 'Asian Kung-Fu Generation', 'pais': 'JP', 'hino': False,
        'encore_q': 'Haruka Kanata',
        'queries': ['Haruka Kanata Asian Kung-Fu', 'Haruka Kanata Naruto']
    },
    {
        't': 'Blue Bird', 't_en': 'Blue Bird', 'obra': 'Naruto Shippuden', 'tipo': 'anime',
        'a_oficial': 'Ikimono-Gakari', 'a_fallback': 'Ikimono-Gakari', 'pais': 'JP', 'hino': False,
        'encore_q': 'Blue Bird Ikimonogakari',
        'queries': ['Blue Bird Ikimonogakari', 'Blue Bird Naruto']
    },
    {
        't': 'Silhouette', 't_en': 'Silhouette', 'obra': 'Naruto Shippuden', 'tipo': 'anime',
        'a_oficial': 'KANA-BOON', 'a_fallback': 'KANA-BOON', 'pais': 'JP', 'hino': False,
        'encore_q': 'Silhouette KANA-BOON',
        'queries': ['Silhouette KANA-BOON']
    },
    {
        't': 'We Are!', 't_en': 'We Are!', 'obra': 'One Piece', 'tipo': 'anime',
        'a_oficial': 'Hiroshi Kitadani', 'a_fallback': 'Hiroshi Kitadani', 'pais': 'JP', 'hino': False,
        'encore_q': 'We Are One Piece',
        'queries': ['We Are Hiroshi Kitadani', 'We Are One Piece Kitadani']
    },
    {
        't': 'Gurenge', 't_en': 'Gurenge', 'obra': 'Demon Slayer', 'tipo': 'anime',
        'a_oficial': 'LiSA', 'a_fallback': 'LiSA', 'pais': 'JP', 'hino': False,
        'encore_q': 'Gurenge LiSA',
        'queries': ['Gurenge LiSA', 'Gurenge Demon Slayer']
    },
    {
        't': 'A Cruel Angel\'s Thesis', 't_en': 'A Cruel Angel\'s Thesis', 'obra': 'Neon Genesis Evangelion', 'tipo': 'anime',
        'a_oficial': 'Yoko Takahashi', 'a_fallback': 'Yoko Takahashi', 'pais': 'JP', 'hino': True,
        'encore_q': 'A Cruel Angel\'s Thesis',
        'queries': ['A Cruel Angel\'s Thesis Yoko Takahashi', 'Zankoku na Tenshi no Thesis']
    },
    {
        't': 'Unravel', 't_en': 'Unravel', 'obra': 'Tokyo Ghoul', 'tipo': 'anime',
        'a_oficial': 'TK from Ling Tosite Sigure', 'a_fallback': 'TK from Ling Tosite Sigure', 'pais': 'JP', 'hino': False,
        'encore_q': 'Unravel Tokyo Ghoul',
        'queries': ['Unravel TK from Ling Tosite Sigure', 'Unravel Tokyo Ghoul']
    },
    {
        't': 'Teen Titans Theme', 't_en': 'Teen Titans Theme', 'obra': 'Jovens Titãs', 'tipo': 'desenho',
        'a_oficial': 'Puffy AmiYumi', 'a_fallback': 'Puffy AmiYumi', 'pais': 'JP', 'hino': False,
        'encore_q': 'Teen Titans Theme',
        'queries': ['Teen Titans Theme Puffy AmiYumi', 'Teen Titans Puffy']
    },
    {
        't': 'Butter-Fly', 't_en': 'Butter-Fly', 'obra': 'Digimon Adventure', 'tipo': 'anime',
        'a_oficial': 'Koji Wada', 'a_fallback': 'Koji Wada', 'pais': 'JP', 'hino': False,
        'encore_q': 'Butter-Fly Digimon',
        'queries': ['Butter-Fly Koji Wada', 'Butter-Fly Digimon']
    },
    {
        't': 'The Pink Panther Theme', 't_en': 'The Pink Panther Theme', 'obra': 'A Pantera Cor-de-Rosa', 'tipo': 'desenho',
        'a_oficial': 'Henry Mancini', 'a_fallback': 'Henry Mancini', 'pais': 'US', 'hino': False,
        'encore_q': 'The Pink Panther Theme',
        'queries': ['The Pink Panther Theme Henry Mancini']
    },
    {
        't': 'The Simpsons Theme', 't_en': 'The Simpsons Theme', 'obra': 'Os Simpsons', 'tipo': 'desenho',
        'a_oficial': 'Danny Elfman', 'a_fallback': 'Danny Elfman', 'pais': 'US', 'hino': False,
        'encore_q': 'The Simpsons Theme',
        'queries': ['The Simpsons Theme Danny Elfman']
    },
    {
        't': 'Três Espiãs Demais', 't_en': 'Totally Spies Theme', 'obra': 'Três Espiãs Demais', 'tipo': 'desenho',
        'a_oficial': None, 'a_fallback': 'Nick Nolan', 'pais': None, 'hino': False,
        'encore_q': 'Totally Spies Theme',
        'queries': ['Totally Spies theme', 'Tres Espias Demais abertura']
    },
]


def slug_norm(t):
    t = unicodedata.normalize('NFD', t or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', t).strip()


def log(msg):
    ts = dt.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    linha = f"[{ts}] {msg}"
    print(linha, flush=True)
    # Evita duplicação se o stdout já estiver redirecionado para o arquivo de log no daemon
    if not getattr(log, '_em_daemon', False):
        try:
            STATUS_DIR.mkdir(parents=True, exist_ok=True)
            with open(LOG_ARQ, 'a', encoding='utf-8') as f:
                f.write(linha + '\n')
        except Exception:
            pass

log._em_daemon = os.environ.get('FAIXA_DAEMON') == '1'


_lock_fd = None

def adquirir_lock():
    global _lock_fd
    STATUS_DIR.mkdir(parents=True, exist_ok=True)
    f = open(LOCK_ARQ, 'w')
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        _lock_fd = f
        return True
    except (BlockingIOError, OSError):
        f.close()
        return False


def liberar_lock():
    global _lock_fd
    if _lock_fd:
        try:
            fcntl.flock(_lock_fd, fcntl.LOCK_UN)
            _lock_fd.close()
        except Exception:
            pass
        _lock_fd = None


def worker_ativo():
    STATUS_DIR.mkdir(parents=True, exist_ok=True)
    if not LOCK_ARQ.exists():
        return False
    try:
        f = open(LOCK_ARQ, 'r+')
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.flock(f, fcntl.LOCK_UN)
        f.close()
        return False
    except (BlockingIOError, OSError):
        return True


def worker_pid():
    if PID_ARQ.exists():
        try:
            pid = int(PID_ARQ.read_text().strip())
            os.kill(pid, 0)
            return pid
        except (ValueError, OSError):
            PID_ARQ.unlink(missing_ok=True)
    return None


def aguardar_outras_geracoes():
    meu = os.getpid()
    while True:
        r = subprocess.run(['pgrep', '-f', r'[t]ools/faixa/(diario|estudio|ano|tags|retro|leva)[.]py'], capture_output=True, text=True)
        outros = [p for p in r.stdout.split() if int(p) != meu]
        if not outros:
            break
        log(f"Aguardando término de outros processos de faixa (PIDs: {', '.join(outros)})...")
        time.sleep(15)


def grava_status(mensagem="Atualizado", ativo=False, pid=None, item_atual=None):
    STATUS_DIR.mkdir(parents=True, exist_ok=True)
    fila = carrega_fila()
    disney_feitas = len({item.get('data_adicionado') or item['id'] for item in fila if item.get('cat') == 'disney' and item.get('status') == 'pronta'})
    desenhos_feitas = len({item.get('data_adicionado') or item['id'] for item in fila if item.get('cat') == 'desenhos' and item.get('status') == 'pronta'})
    pendentes = sum(1 for item in fila if item.get('status') == 'pendente')
    falhas = sum(1 for item in fila if item.get('status') == 'erro')

    dados = {
        'status': 'ativo' if ativo else 'parado',
        'mensagem': mensagem,
        'timestamp': dt.datetime.now().isoformat(),
        'worker': {
            'ativo': ativo,
            'pid': pid,
            'log': str(LOG_ARQ),
            'fila_arq': str(FILA_ARQ),
            'item_atual': item_atual,
        },
        'catalogo': {
            'disney_prontas': disney_feitas,
            'desenhos_prontas': desenhos_feitas,
            'disney_total': sum(1 for item in fila if item.get('cat') == 'disney'),
            'desenhos_total': sum(1 for item in fila if item.get('cat') == 'desenhos'),
            'total_fila': len(fila),
            'pendentes': pendentes,
            'falhas': falhas,
        }
    }
    tmp = STATUS_ARQ.with_suffix(f'.{os.getpid()}.tmp')
    tmp.write_text(json.dumps(dados, ensure_ascii=False, indent=2))
    tmp.replace(STATUS_ARQ)
    return dados


def carrega_fila():
    if not FILA_ARQ.exists():
        preparar_fila()
    try:
        return json.loads(FILA_ARQ.read_text('utf-8'))
    except Exception:
        return []


FILA_LOCK = STATUS_DIR / 'fila.lock'


def atualiza_fila(fn):
    """Lê, altera e grava a fila sob flock (worker e importadores mexem nela ao mesmo tempo)."""
    import fcntl
    STATUS_DIR.mkdir(parents=True, exist_ok=True)
    with open(FILA_LOCK, 'a') as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        fila = json.loads(FILA_ARQ.read_text('utf-8')) if FILA_ARQ.exists() else []
        r = fn(fila)
        salva_fila_atomico(fila)
        return r


def salva_fila_atomico(fila):
    FILA_ARQ.parent.mkdir(parents=True, exist_ok=True)
    tmp = FILA_ARQ.with_suffix(f'.{os.getpid()}.tmp')
    tmp.write_text(json.dumps(fila, ensure_ascii=False, indent=2))
    tmp.replace(FILA_ARQ)


def casa_musica(cand, m):
    """Verifica com precisão se a música m de dias.json é a mesma música do candidato."""
    dz_id = m.get('dz', {}).get('t') if m.get('dz') else None
    if dz_id and cand.get('dz_id') and dz_id == cand['dz_id']:
        return True

    nt_m = slug_norm(m.get('t', ''))
    na_m = slug_norm(m.get('a', ''))
    nt_c = slug_norm(cand['t'])
    nt_en = slug_norm(cand.get('t_en', ''))
    na_oficial = slug_norm(cand.get('a_oficial', ''))
    na_fallback = slug_norm(cand.get('a_fallback', ''))

    # Título exato
    match_t = (nt_m == nt_c) or (bool(nt_en) and nt_m == nt_en)
    if not match_t:
        return False

    # Artista ou álbum/obra deve ter correspondência
    if na_oficial and (na_oficial in na_m or na_m in na_oficial):
        return True
    if na_fallback and (na_fallback in na_m or na_m in na_fallback):
        return True
    if cand.get('obra') and slug_norm(cand['obra']) in slug_norm(m.get('album', '')):
        return True

    # Se o título é muito específico e bate exatamente (ex: 'sorriso resplandecente')
    if len(nt_c) >= 18 and nt_m == nt_c:
        return True

    return False


def deduplica_e_recategoriza_dias(dias_dict):
    """Varre dias.json por faixas existentes que coincidem com a seleção e as recategoriza."""
    recat_count = 0
    candidatos = SELECAO_DISNEY + SELECAO_DESENHOS

    for data, ms in dias_dict.items():
        for m in ms:
            for cand in candidatos:
                if casa_musica(cand, m):
                    cat_alvo = 'disney' if cand['tipo'] == 'disney' else 'desenhos'
                    mudou = False
                    if m.get('categoria') != cat_alvo:
                        m['categoria'] = cat_alvo
                        mudou = True
                    m.setdefault('tg', {})
                    m['tg'].setdefault('generos', [])
                    if cat_alvo not in m['tg']['generos']:
                        m['tg']['generos'].append(cat_alvo)
                        mudou = True
                    if cand['tipo'] == 'anime' and 'anime' not in m['tg']['generos']:
                        m['tg']['generos'].append('anime')
                        mudou = True
                    if mudou:
                        recat_count += 1
                    break
    return recat_count


def preparar_fila():
    if worker_ativo():
        log("Worker ativo com lock exclusivo. Operação 'preparar' preservou a fila atual para evitar concorrência.")
        return carrega_fila()

    if TOP100_ARQ.exists():
        aprovadas = set(json.loads(TOP100_ARQ.read_text('utf-8'))['aprovadas'])
        fila = [x for x in carrega_fila() if x.get('status') == 'pronta' or x['id'] in aprovadas]
        salva_fila_atomico(fila)
        grava_status('Curadoria das 100 mais conhecidas; prontas preservadas')
        return fila

    # Recategoriza no dias.json se houver faixas existentes
    if INDICE.exists():
        try:
            dias_dict = json.loads(INDICE.read_text('utf-8'))
            n_recat = deduplica_e_recategoriza_dias(dias_dict)
            if n_recat > 0:
                tmp = INDICE.with_suffix(f'.{os.getpid()}.tmp')
                tmp.write_text(json.dumps(dict(sorted(dias_dict.items())), ensure_ascii=False, indent=1))
                tmp.replace(INDICE)
                log(f"Deduplicação: {n_recat} faixas existentes em dias.json foram recategorizadas.")
        except Exception as e:
            log(f"Aviso na deduplicação de dias.json: {e}")

    existente = {}
    if FILA_ARQ.exists():
        try:
            for item in json.loads(FILA_ARQ.read_text('utf-8')):
                existente[item.get('id')] = item
        except Exception:
            pass

    # Checa faixas prontas em dias.json
    dias_dict = json.loads(INDICE.read_text('utf-8')) if INDICE.exists() else {}
    lista_dias = [(d, m.get('n'), m) for d, ms in dias_dict.items() for m in ms]

    nova_fila = []
    for c in (c for par in zip_longest(SELECAO_DISNEY, SELECAO_DESENHOS) for c in par if c):
        chave_id = F.slug(f"{c['tipo']}-{c['obra']}-{c['t']}")
        item_exist = existente.get(chave_id)

        # Checa se já está nos dias com validação estrita
        achado = None
        for d_m, n_m, m_m in lista_dias:
            if casa_musica(c, m_m):
                achado = (d_m, n_m, m_m)
                break

        valida_pronta = False
        if item_exist and item_exist.get('status') == 'pronta':
            ref = item_exist.get('data_adicionado')
            if ref and '#' in ref:
                try:
                    d_ref, n_ref = ref.split('#')
                    n_int = int(n_ref)
                    m_ref = next((x for x in dias_dict.get(d_ref, []) if x.get('n') == n_int), None)
                    if m_ref and casa_musica({**c, 'dz_id': item_exist.get('dz_id')}, m_ref) and (D.SAIDA / d_ref / n_ref / '0.webm').exists():
                        valida_pronta = True
                except Exception:
                    valida_pronta = False

        if item_exist and item_exist.get('status') == 'pronta' and not valida_pronta:
            item_exist = None
        if achado:
            d_achado, n_achado, m_achado = achado
            adiciona_catalogo_atomico(m_achado['t'], m_achado['a'])
            item = {
                'id': chave_id,
                't': m_achado.get('t', c['t']),
                't_en': c.get('t_en'),
                'a': m_achado.get('a', c.get('a_oficial') or ''),
                'obra': c['obra'],
                'tipo': c['tipo'],
                'cat': 'disney' if c['tipo'] == 'disney' else 'desenhos',
                'pais': m_achado.get('pais') or c.get('pais'),
                'hino': c.get('hino', False),
                'status': 'pronta',
                'recategorizada': True,
                'data_adicionado': f"{d_achado}#{n_achado}",
                'dz_id': m_achado.get('dz', {}).get('t'),
                'erro': None,
            }
            nova_fila.append(item)
        elif valida_pronta:
            nova_fila.append(item_exist)
        else:
            nova_fila.append({
                'id': chave_id,
                't': c['t'],
                't_en': c.get('t_en'),
                'a': c.get('a_oficial'),
                'a_fallback': c.get('a_fallback'),
                'obra': c['obra'],
                'tipo': c['tipo'],
                'cat': 'disney' if c['tipo'] == 'disney' else 'desenhos',
                'pais': c.get('pais'),
                'hino': c.get('hino', False),
                'queries': c['queries'],
                'encore_q': c.get('encore_q'),
                'status': item_exist.get('status', 'pendente') if item_exist else 'pendente',
                'tentativas': item_exist.get('tentativas', 0) if item_exist else 0,
                'erro': item_exist.get('erro') if item_exist else None,
                'data_adicionado': item_exist.get('data_adicionado') if item_exist else None,
                'dz_id': item_exist.get('dz_id') if item_exist else None,
                'dz_t': item_exist.get('dz_t') if item_exist else None,
                'dz_a': item_exist.get('dz_a') if item_exist else None,
                'dz_link': item_exist.get('dz_link') if item_exist else None,
            })

    # Importações de playlists são entradas reais da fila, além da seleção inicial.
    ids_novos = {item['id'] for item in nova_fila}
    nova_fila.extend(item for item in existente.values() if item.get('origem_playlist') and item['id'] not in ids_novos)
    salva_fila_atomico(nova_fila)
    grava_status("Fila preparada com sucesso")
    log(f"Fila preparada com {len(nova_fila)} itens ({len(SELECAO_DISNEY)} Disney, {len(SELECAO_DESENHOS)} Desenhos/Animes).")
    return nova_fila


def avalia_resultado_deezer(cand, item):
    """Pontua um resultado Deezer.

    Retorna <= 0 se for cover genérico, karaokê, instrumental não oficial ou sem prévia.
    """
    if not item.get('preview'):
        return -9999

    t_real = item.get('title', '')
    a_real = item.get('artist', {}).get('name', '')
    alb_real = item.get('album', {}).get('title', '')

    nt_real = F.slug(t_real)
    na_real = F.slug(a_real)
    nalb_real = F.slug(alb_real)

    nt_cand = F.slug(cand['t'])
    nt_en = F.slug(cand.get('t_en', ''))
    n_obra = F.slug(cand.get('obra', ''))

    match_pt = nt_cand and (nt_cand in nt_real or nt_real in nt_cand)
    match_en = nt_en and (nt_en in nt_real or nt_real in nt_en)

    if not match_pt and not match_en:
        return -9999

    # Rejeição de covers, karaokês, marimbas, caixas de música e gravações amadoras
    BAD_MARKERS = [
        'cover', 'karaoke', 'karaoke', 'tributo', 'tribute', 'marimba',
        'versao-para-piano', 'piano-version', 'caixa-de-musica', 'music-box',
        'instrumental-version', 'lullaby', 'canciones-infantiles', 'cancoes-infantis',
        'musicas-infantis', 'nanas-populares', 'guitarrista-de-atena', 'banda-da-varanda',
        'cancao-de-ninar', 'cancao-para-dormir', 'casamento-pop', 'parodia',
        'cangaco-sessions', 'bailao-otaku'
    ]
    txt_total = f"{nt_real}-{na_real}-{nalb_real}"
    for b in BAD_MARKERS:
        if b in txt_total:
            return -100

    artistas = [cand.get('a_oficial') or cand.get('a'), cand.get('a_fallback')]
    artista_ok = any(F.slug(a) and na_real and (F.slug(a) in na_real or na_real in F.slug(a)) for a in artistas if a)
    trilha_ok = any(m in nalb_real for m in ['trilha-sonora-original', 'original-motion-picture-soundtrack', 'original-soundtrack', 'banda-sonora-original'])
    obra_ok = n_obra and (n_obra in nalb_real or n_obra in nt_real)
    if not artista_ok and not (trilha_ok and obra_ok):
        return -100

    score = 10.0
    if match_pt:
        score += 25.0

    OST_MARKERS = [
        'trilha-sonora-original', 'original-motion-picture-soundtrack',
        'original-soundtrack', 'banda-sonora-original', 'soundtrack', 'ost'
    ]
    if any(m in nalb_real for m in OST_MARKERS):
        score += 40.0

    if n_obra and (n_obra in nalb_real or n_obra in nt_real):
        score += 25.0

    if cand.get('a_oficial') and F.slug(cand['a_oficial']) in na_real:
        score += 35.0
    if cand.get('a_fallback') and F.slug(cand['a_fallback']) in na_real:
        score += 30.0

    score += (item.get('rank', 0) / 100_000.0)
    return score


def resolver_deezer(cand):
    """Consulta a API Deezer com queries livres e ranqueia as opções para escolher a oficial."""
    if cand.get('origem_playlist') and cand.get('dz_id'):
        # O importador já conferiu esta gravação da playlist: não trocar por homônimo.
        x = json.loads(F.baixa(f"https://api.deezer.com/track/{int(cand['dz_id'])}"))
        if x.get('id') != cand['dz_id'] or (x.get('artist') or {}).get('id') != cand.get('dz_artist_id'):
            raise ValueError('Gravação da playlist não corresponde ao ID/intérprete importado')
        return x if x.get('preview') else None
    if FONTES_ARQ.exists():
        fontes = json.loads(FONTES_ARQ.read_text('utf-8'))
        candidatos = {}
        for fonte in fontes:
            for faixa in fonte['musicas']:
                amostra = {'title': faixa['t'], 'artist': {'name': faixa['a']}, 'album': {'title': faixa.get('album') or ''}, 'preview': True}
                score = avalia_resultado_deezer(cand, amostra)
                if score > 0: candidatos[faixa['id']] = (score, faixa, fonte['link'])
        for score, faixa, playlist in sorted(candidatos.values(), key=lambda x: -x[0])[:4]:
            try:
                x = json.loads(F.baixa(f"https://api.deezer.com/track/{faixa['id']}"))
                if avalia_resultado_deezer(cand, x) > 0:
                    cand['playlist_fonte'] = playlist
                    return x
            except Exception:
                continue

    # 1. Tenta D.deezer(t, a) se houver artista oficial informado
    if cand.get('a_oficial'):
        try:
            x = D.deezer(cand['t'], cand['a_oficial'])
            if x and avalia_resultado_deezer(cand, x) > 0:
                return x
        except Exception:
            pass

    # 2. Consultas livres ordenadas por prioridade
    queries = list(cand.get('queries', []))
    if cand.get('t_en') and cand['t_en'] not in queries:
        queries.append(f"{cand['t_en']} {cand['obra']}")

    melhor_item = None
    melhor_score = 0.0

    for q in queries:
        try:
            url = 'https://api.deezer.com/search?q=' + urllib.parse.quote(q) + '&limit=12'
            req = urllib.request.Request(url, headers=F.UA)
            with urllib.request.urlopen(req, timeout=10) as resp:
                d = json.loads(resp.read().decode('utf-8'))
        except Exception:
            time.sleep(1)
            continue

        for item in d.get('data', []):
            sc = avalia_resultado_deezer(cand, item)
            if sc > melhor_score:
                melhor_score = sc
                melhor_item = item

        if melhor_score >= 80.0:
            break

    return melhor_item


def proximo_alvo(idx):
    """Encontra data e vaga atômica sem sobrepor faixas existentes."""
    datas = sorted(dt.date.fromisoformat(k) for k in idx)
    hoje = dt.date.today()
    d = hoje - dt.timedelta(days=1)
    mais_antiga = datas[0] if datas else d

    while d >= mais_antiga:
        k = d.isoformat()
        if len(idx.get(k, [])) < D.POR_DIA:
            n = min(set(range(D.POR_DIA)) - {m['n'] for m in idx.get(k, [])})
            return k, n
        d -= dt.timedelta(days=1)

    d = mais_antiga - dt.timedelta(days=1)
    k = d.isoformat()
    n = 0
    return k, n


def adiciona_catalogo_atomico(titulo, artista):
    """Atualiza public/jogos/faixa/catalogo.json de forma atômica."""
    if not CATALOGO_ARQ.exists():
        return
    try:
        cat = json.loads(CATALOGO_ARQ.read_text('utf-8'))
        ja = {f"{F.slug(a)}-{F.slug(t)}" for t, a in cat}
        chave = f"{F.slug(artista)}-{F.slug(titulo)}"
        if chave not in ja:
            cat.append([titulo, artista])
            tmp = CATALOGO_ARQ.with_suffix(f'.{os.getpid()}.tmp')
            tmp.write_text(json.dumps(cat, ensure_ascii=False, separators=(',', ':')))
            tmp.replace(CATALOGO_ARQ)
            log(f"Autocomplete atualizado em catalogo.json: '{titulo}' — '{artista}'")
    except Exception as e:
        log(f"Aviso ao atualizar catalogo.json: {e}")


def separa_cpu_demucs(mp3_path, tmp_dir):
    """Executa o Demucs isolado em CPU limitado a 2 threads."""
    wav = Path(tmp_dir) / 'mix.wav'
    F.run('ffmpeg', '-v', 'error', '-y', '-i', mp3_path, '-ac', '2', '-ar', '44100', wav)
    env = {
        **os.environ,
        'OMP_NUM_THREADS': '2',
        'MKL_NUM_THREADS': '2',
        'TORCH_NUM_THREADS': '2',
        'OPENBLAS_NUM_THREADS': '2',
    }
    cmd = [
        str(DEMUCS_VENV), '-m', 'demucs', '-d', 'cpu',
        '-j', '0', '-n', 'htdemucs_6s',
        '-o', str(Path(tmp_dir) / 'sep'), str(wav)
    ]
    r = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"Demucs falhou: {r.stderr[-500:]}")
    d = Path(tmp_dir) / 'sep' / 'htdemucs_6s' / 'mix'
    mapa = {'drums': 'bateria', 'bass': 'baixo', 'guitar': 'guitarra', 'piano': 'piano', 'other': 'outros', 'vocals': 'voz'}
    return [(t, d / f'{s}.wav') for s, t in mapa.items()]


def processa_item_atomico(item):
    """Gera o pacote completo em diretório temporário e publica de forma atômica."""
    t = item['t']
    a = item.get('a') or item.get('a_oficial') or 'Vários'
    cat = item.get('cat', 'disney')
    tipo = item.get('tipo', cat)
    obra = item.get('obra', '')

    if item.get('yt_id') and not item.get('dz_id'):
        return processa_youtube(item)

    log(f"Resolvendo faixa oficial para: '{t}' ({obra})")

    x_deezer = resolver_deezer(item)
    if not x_deezer:
        return False, f"Nenhuma gravação oficial com prévia encontrada: {t} ({obra})"
    # A versão encontrada pode ter outro título/intérprete que o previsto na curadoria.
    # Conferir o ID real também evita repetir uma faixa já incluída por outra fila.
    aguardar_outras_geracoes()
    indice = json.loads(INDICE.read_text('utf-8')) if INDICE.exists() else {}
    for data, musicas in indice.items():
        for musica in musicas:
            if (musica.get('dz') or {}).get('t') != x_deezer['id']:
                continue
            musica['categoria'] = cat
            if obra: musica['obra'] = obra
            alt = [x for x in dict.fromkeys([item.get('t'), *(item.get('alt') or [])]) if x and F.slug(x) != F.slug(musica['t'])]
            if alt: musica['alt'] = list(dict.fromkeys([*(musica.get('alt') or []), *alt]))
            if item.get('obra_alt'): musica['obra_alt'] = item['obra_alt']
            for titulo in [musica['t'], *alt]:
                if obra: adiciona_catalogo_atomico(titulo, obra)
            generos = musica.setdefault('tg', {}).setdefault('generos', [])
            for genero in [cat] + (['anime'] if tipo == 'anime' else []):
                if genero not in generos: generos.append(genero)
            tmp = INDICE.with_suffix(f'.{os.getpid()}.tmp')
            tmp.write_text(json.dumps(dict(sorted(indice.items())), ensure_ascii=False, indent=1))
            tmp.replace(INDICE)
            item.update(dz_id=x_deezer['id'], dz_link=x_deezer.get('link'), recategorizada=True)
            log(f"Faixa existente reaproveitada: {musica['t']} — {musica['a']}")
            return True, f"{data}#{musica['n']}"

    # 1. Tenta estúdio no Chorus Encore para a gravação identificada.
    info_estudio = None
    arquivos_estudio = {}
    if item.get('encore_q'):
        try:
            from acha_stems import avalia
            from estudio import processa
            r_encore = avalia(((x_deezer['title'], x_deezer['artist']['name']), {}))
            if r_encore.get('md5') and len(r_encore.get('faixas', [])) >= 3:
                log(f"Faixas separadas encontradas no Chorus Encore ({len(r_encore['faixas'])} canais) para '{item['encore_q']}'")
                with tempfile.TemporaryDirectory() as tmp_est:
                    tmp_pasta = Path(tmp_est) / 'stems'
                    info_estudio = processa(r_encore['md5'], tmp_pasta)
                    arquivos_estudio = {p.name: p.read_bytes() for p in tmp_pasta.iterdir() if p.is_file()}
                    # Mantém créditos
                    item['stems_md5'] = r_encore['md5']
        except Exception as e:
            log(f"Encore busca/processamento não resultou em stems: {e}")

    # 2. Metadados oficiais da gravação resolvida.
    if not x_deezer and not info_estudio:
        msg = f"Nenhuma gravação oficial válida encontrada na Deezer com prévia para '{t}' ({obra})"
        log(f"  ✗ {msg}")
        return False, msg

    # Grava metadados reais encontrados
    if x_deezer:
        item['dz_id'] = x_deezer['id']
        item['dz_t'] = x_deezer['title']
        item['dz_a'] = x_deezer['artist']['name']
        item['dz_album'] = x_deezer.get('album', {}).get('title', '')
        item['dz_link'] = x_deezer.get('link') or f"https://www.deezer.com/track/{x_deezer['id']}"

    # 3. Geração em pasta temporária (staging)
    with tempfile.TemporaryDirectory() as tmp_stage:
        staging_dir = Path(tmp_stage) / 'pacote'
        staging_dir.mkdir(parents=True, exist_ok=True)

        if info_estudio:
            # Já temos as camadas geradas pelo processa() do encore
            fonte = 'estudio'
            for nome, dados in arquivos_estudio.items():
                (staging_dir / nome).write_bytes(dados)
            info = info_estudio
        else:
            fonte = 'ia'
            mp3 = Path(tmp_stage) / 'preview.mp3'
            F.baixa(x_deezer['preview'], mp3)
            log(f"Prévia oficial Deezer baixada ({mp3.stat().st_size} bytes). Separando camadas com Demucs (CPU 2 threads)...")
            camadas = separa_cpu_demucs(mp3, tmp_stage)
            info = F.publica(camadas, staging_dir, {})

        # Baixa capa oficial
        if x_deezer and x_deezer.get('album', {}).get('cover_big'):
            try:
                capa_raw = Path(tmp_stage) / 'capa_raw.jpg'
                F.baixa(x_deezer['album']['cover_big'], capa_raw)
                F.run('ffmpeg', '-v', 'error', '-y', '-i', str(capa_raw), '-vf', 'scale=360:360', str(staging_dir / 'capa.jpg'))
            except Exception as e:
                log(f"Aviso ao processar capa: {e}")

        # Validação de integridade do pacote gerado antes de gravar nos diretórios públicos
        webms = list(staging_dir.glob('*.webm'))
        if len(webms) < 2:
            raise RuntimeError(f"Pacote incompleto gerado: apenas {len(webms)} camadas webm")
        for w in webms:
            if w.stat().st_size < 1024:
                raise RuntimeError(f"Camada de áudio vazia ou corrompida: {w.name} ({w.stat().st_size} bytes)")

        # 4. Gravação atômica em dias.json e publicação dos arquivos reais
        aguardar_outras_geracoes()

        idx = json.loads(INDICE.read_text('utf-8')) if INDICE.exists() else {}
        data_alvo, n_vaga = proximo_alvo(idx)
        pasta_destino = D.SAIDA / data_alvo / str(n_vaga)
        pasta_destino.mkdir(parents=True, exist_ok=True)

        # Move/copia arquivos validados
        for f in staging_dir.iterdir():
            dest = pasta_destino / f.name
            dest.write_bytes(f.read_bytes())

        # Metadados reais
        ano_final = None
        if x_deezer and x_deezer.get('id'):
            try:
                tr = json.loads(F.baixa(f"https://api.deezer.com/track/{x_deezer['id']}"))
                ano_final = int((tr.get('release_date') or tr.get('album', {}).get('release_date') or '0')[:4]) or None
            except Exception:
                pass

        rank_deezer = x_deezer.get('rank', 0) if x_deezer else 0
        fama_calculada = 5 if rank_deezer >= 750_000 else 4 if rank_deezer >= 500_000 else 3 if rank_deezer >= 250_000 else 2

        generos_tg = [cat]
        if tipo == 'anime':
            generos_tg.append('anime')

        vibes = []
        if item.get('hino'):
            vibes.append('hino')

        m_registro = {
            'id': F.slug(f"{x_deezer['artist']['name'] if x_deezer else a}-{x_deezer['title'] if x_deezer else t}"),
            'n': n_vaga,
            'origem': cat,
            'categoria': cat,
            'fonte': fonte,
            'ano_ok': True,
            't': x_deezer['title'] if x_deezer else t,
            'a': x_deezer['artist']['name'] if x_deezer else a,
            'album': x_deezer.get('album', {}).get('title', obra) if x_deezer else obra,
            'ano': ano_final,
            'dz': {'t': x_deezer['id'], 'a': x_deezer['artist']['id']} if x_deezer else None,
            'capa': 'capa.jpg' if (pasta_destino / 'capa.jpg').exists() else '',
            'camadas': info['camadas'],
            'generos': ['Disney'] if cat == 'disney' else ['Jogos'] if cat == 'jogos' else ['Anime'] if tipo == 'anime' else ['Desenhos'],
            'tags_ok': True,
            'tg': {
                'generos': generos_tg,
                'vibes': vibes,
                'fama': fama_calculada,
            }
        }
        # O país da versão PT-BR não descreve automaticamente um fallback em inglês.
        artista_esperado = F.slug(item.get('a_oficial') or item.get('a') or '')
        artista_real = F.slug(m_registro['a'])
        if item.get('pais') and artista_esperado and (artista_esperado in artista_real or artista_real in artista_esperado):
            m_registro['pais'] = item['pais']
            m_registro['tg']['pais'] = item['pais']
        m_registro['obra'] = obra
        # nomes que também valem como resposta: título em português/inglês e outros nomes da obra
        alt = [x for x in dict.fromkeys([item.get('t'), item.get('t_pt'), item.get('t_en'), *(item.get('alt') or [])]) if x and F.slug(x) != F.slug(m_registro['t'])]
        if alt: m_registro['alt'] = alt
        if item.get('obra_alt'): m_registro['obra_alt'] = item['obra_alt']
        m_registro['fontes'] = {'deezer': item.get('dz_link'), 'playlist': item.get('playlist_fonte'), 'stems': f"https://www.enchor.us/?search={urllib.parse.quote(item.get('encore_q') or t)}" if info_estudio else None}

        # Atualiza dias.json atomicamente
        idx = json.loads(INDICE.read_text('utf-8')) if INDICE.exists() else {}
        lista_dia = [m for m in idx.get(data_alvo, []) if m.get('n') != n_vaga] + [m_registro]
        idx[data_alvo] = sorted(lista_dia, key=lambda m: m['n'])

        tmp_idx = INDICE.with_suffix(f'.{os.getpid()}.tmp')
        tmp_idx.write_text(json.dumps(dict(sorted(idx.items())), ensure_ascii=False, indent=1))
        tmp_idx.replace(INDICE)

        # Atualiza catalogo.json
        adiciona_catalogo_atomico(m_registro['t'], m_registro['a'])
        # no autocomplete a obra aparece como "artista" (Phineas e Ferb, Zelda…) e os títulos alternativos também
        for titulo in [m_registro['t'], *(m_registro.get('alt') or [])]:
            if obra: adiciona_catalogo_atomico(titulo, obra)
        for titulo in m_registro.get('alt') or []:
            adiciona_catalogo_atomico(titulo, m_registro['a'])

        log(f"✓ Concluído com sucesso: '{m_registro['t']}' — '{m_registro['a']}' em {data_alvo} vaga {n_vaga + 1}")
        return True, f"{data_alvo}#{n_vaga}"


def processa_youtube(item):
    """Trilhas que não estão na Deezer (dublagens, Nintendo): 30 s do vídeo escolhido pelo origens.py."""
    t, cat, obra, vid = item['t'], item.get('cat', 'desenhos'), item.get('obra', ''), item['yt_id']
    tipo = item.get('tipo', cat)
    dur = float(item.get('yt_dur') or 60)
    ini = item.get('yt_ini')
    if ini is None:
        ini = max(0, (dur - 30) / 2) if dur <= 75 else 15 if dur <= 150 else min(60, dur * .25)
    log(f"YouTube: '{t}' ({obra}) — {item.get('yt_titulo')} a partir de {ini:.0f}s")
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        r = subprocess.run(['yt-dlp', '-q', '--no-warnings', '-f', 'bestaudio', '-x', '--audio-format', 'mp3',
                            '--download-sections', f'*{ini:.0f}-{ini + 32:.0f}', '-o', str(tmp / 'yt.%(ext)s'),
                            f'https://www.youtube.com/watch?v={vid}'], capture_output=True, text=True, timeout=300)
        bruto = tmp / 'yt.mp3'
        if r.returncode != 0 or not bruto.exists():
            return False, f"yt-dlp falhou: {r.stderr[-300:]}"
        mp3 = tmp / 'trecho.mp3'
        F.run('ffmpeg', '-v', 'error', '-y', '-i', bruto, '-t', '30', '-af', 'afade=t=in:d=0.3,afade=t=out:st=29.3:d=0.7', mp3)
        log("Trecho do YouTube baixado. Separando camadas com Demucs (CPU 2 threads)...")
        staging = tmp / 'pacote'; staging.mkdir()
        info = F.publica(separa_cpu_demucs(mp3, tmp), staging, {})
        try:
            F.baixa(f'https://i.ytimg.com/vi/{vid}/hqdefault.jpg', tmp / 'capa_raw.jpg')
            F.run('ffmpeg', '-v', 'error', '-y', '-i', tmp / 'capa_raw.jpg', '-vf', 'crop=ih*0.75:ih*0.75,scale=360:360', staging / 'capa.jpg')
        except Exception as e:
            log(f"Aviso ao processar capa: {e}")
        webms = list(staging.glob('*.webm'))
        if len(webms) < 2 or any(w.stat().st_size < 1024 for w in webms):
            raise RuntimeError(f"Pacote incompleto gerado: {len(webms)} camadas")
        aguardar_outras_geracoes()
        idx = json.loads(INDICE.read_text('utf-8')) if INDICE.exists() else {}
        data_alvo, n_vaga = proximo_alvo(idx)
        destino = D.SAIDA / data_alvo / str(n_vaga)
        destino.mkdir(parents=True, exist_ok=True)
        for f in staging.iterdir():
            (destino / f.name).write_bytes(f.read_bytes())
    artista = item.get('a') or obra
    alt = [x for x in dict.fromkeys(item.get('alt') or []) if x and F.slug(x) != F.slug(t)]
    reg = {
        'id': F.slug(f"{obra}-{t}"), 'n': n_vaga, 'origem': cat, 'categoria': cat, 'fonte': 'ia', 'ano_ok': False,
        't': t, 'a': artista, 'album': obra, 'ano': None, 'dz': None, 'yt': vid,
        'capa': 'capa.jpg' if (destino / 'capa.jpg').exists() else '', 'camadas': info['camadas'],
        'generos': ['Disney'] if cat == 'disney' else ['Jogos'] if cat == 'jogos' else ['Filmes e séries'] if cat == 'filmes' else ['Anime'] if tipo == 'anime' else ['Desenhos'],
        'tags_ok': True, 'tg': {'generos': [cat] + (['anime'] if tipo == 'anime' else []), 'vibes': ['hino'] if item.get('hino') else [], 'fama': 4 if item.get('prio', 500) <= 150 else 3},
        'obra': obra, 'fontes': {'youtube': f'https://www.youtube.com/watch?v={vid}'},
    }
    if alt: reg['alt'] = alt
    if item.get('obra_alt'): reg['obra_alt'] = item['obra_alt']
    idx = json.loads(INDICE.read_text('utf-8')) if INDICE.exists() else {}
    idx[data_alvo] = sorted([m for m in idx.get(data_alvo, []) if m.get('n') != n_vaga] + [reg], key=lambda m: m['n'])
    tmp_idx = INDICE.with_suffix(f'.{os.getpid()}.tmp')
    tmp_idx.write_text(json.dumps(dict(sorted(idx.items())), ensure_ascii=False, indent=1))
    tmp_idx.replace(INDICE)
    for titulo in [t, *alt]:
        adiciona_catalogo_atomico(titulo, obra)
        if artista != obra: adiciona_catalogo_atomico(titulo, artista)
    log(f"✓ Concluído (YouTube): '{t}' — '{obra}' em {data_alvo} vaga {n_vaga + 1}")
    return True, f"{data_alvo}#{n_vaga}"


def executar_worker(limite=None, so_uma=False):
    if not adquirir_lock():
        log("Outro worker já está ativo com lock exclusivo (worker.lock). Encerrando.")
        return

    pid = os.getpid()
    PID_ARQ.write_text(str(pid))
    log(f"Worker ativo com lock exclusivo (PID: {pid}, threads CPU=2, sem-publicar=True)")
    grava_status("Worker em execução", ativo=True, pid=pid)

    # Limita prioridade para não comprometer o host
    try:
        os.nice(10)
    except Exception:
        pass

    parar = False

    def _sig_handler(*_):
        nonlocal parar
        log("Recebido sinal de parada. Finalizando faixa atual e saindo...")
        parar = True

    signal.signal(signal.SIGINT, _sig_handler)
    signal.signal(signal.SIGTERM, _sig_handler)

    processadas = 0
    ocioso_desde = None

    try:
        # A fila é relida a cada faixa: dá para acrescentar ou reordenar itens com o worker rodando.
        # Ordem: campo 'prio' (menor primeiro, padrão 500) e depois a posição no arquivo.
        while not parar:
            if so_uma and processadas >= 1:
                break
            if limite and processadas >= limite:
                break
            fila = carrega_fila()
            pend = [(i.get('prio', 500), k, i) for k, i in enumerate(fila) if i.get('status') == 'pendente']
            if not pend:
                ocioso_desde = ocioso_desde or time.time()
                if time.time() - ocioso_desde > 2 * 3600:
                    log("Fila vazia há 2 h. Encerrando.")
                    break
                grava_status("Aguardando novas músicas na fila", ativo=True, pid=pid)
                for _ in range(30):
                    if parar: break
                    time.sleep(2)
                continue
            ocioso_desde = None
            item = min(pend, key=lambda x: (x[0], x[1]))[2]

            item_atual = {'t': item['t'], 'obra': item.get('obra'), 'cat': item.get('cat')}
            grava_status(f"Processando: {item['t']}", ativo=True, pid=pid, item_atual=item_atual)

            item['tentativas'] = item.get('tentativas', 0) + 1
            try:
                ok, detalhe = processa_item_atomico(item)
                if ok:
                    item['status'] = 'pronta'
                    item['data_adicionado'] = detalhe
                    item['erro'] = None
                    processadas += 1
                else:
                    item['status'] = 'erro'
                    item['erro'] = detalhe
            except Exception as e:
                item['status'] = 'erro'
                item['erro'] = str(e)
                log(f"  ✗ Erro inesperado ao processar '{item['t']}': {e}")

            # grava só este item sobre a fila atual do disco (preserva o que foi acrescentado no meio)
            def _aplica(f):
                for k, x in enumerate(f):
                    if x.get('id') == item.get('id'):
                        f[k] = item
                        break
                else:
                    f.append(item)
            atualiza_fila(_aplica)
            try:
                import sincroniza_obras
                sincroniza_obras.sincroniza(log)
            except Exception as e:
                log(f"Aviso ao sincronizar obras: {e}")
            grava_status(f"Worker ativo ({processadas} concluídas)", ativo=True, pid=pid)
            time.sleep(2)

    finally:
        PID_ARQ.unlink(missing_ok=True)
        liberar_lock()
        grava_status("Worker parado", ativo=False)
        log(f"Worker encerrado. Total de faixas concluídas nesta execução: {processadas}")


def testar_integridade_real():
    print("=== Testando Integridade Real do Faixa a Faixa ===")
    erros = []
    dias, cat = {}, []
    # O worker publica índice e autocomplete antes de marcar a fila como pronta.
    # Ler a fila primeiro evita comparar uma conclusão nova com um índice anterior.
    fila_snapshot = json.loads(FILA_ARQ.read_text('utf-8')) if FILA_ARQ.exists() else None

    # 1. Validação de sintaxe JS com o interpretador Node.js real
    faixa_js = RAIZ / 'public' / 'faixa.js'
    if not faixa_js.exists():
        erros.append("public/faixa.js não existe!")
    else:
        r_node = subprocess.run(['node', '--check', str(faixa_js)], capture_output=True, text=True)
        if r_node.returncode != 0:
            erros.append(f"Erro de sintaxe em public/faixa.js:\n{r_node.stderr}")
        else:
            print("✓ public/faixa.js: sintaxe JavaScript válida verificada pelo Node.js.")

    # 2. Validação profunda de public/jogos/faixa/dias.json e arquivos de camadas
    if not INDICE.exists():
        erros.append("public/jogos/faixa/dias.json não existe!")
    else:
        try:
            dias = json.loads(INDICE.read_text('utf-8'))
            total_dias = len(dias)
            total_musicas = 0
            faixas_invalidas = 0

            for data_str, ms in dias.items():
                total_musicas += len(ms)
                for m in ms:
                    n = m.get('n')
                    pasta_faixa = D.SAIDA / data_str / str(n)
                    camadas = m.get('camadas', [])
                    if not camadas:
                        faixas_invalidas += 1
                        erros.append(f"Faixa sem camadas: {data_str}#{n} ({m.get('t')})")
                    for c in camadas:
                        arq_webm = pasta_faixa / c.get('arq', '')
                        if not arq_webm.exists() or arq_webm.stat().st_size < 1024:
                            faixas_invalidas += 1
                            erros.append(f"Arquivo de camada ausente ou vazio: {arq_webm}")

            if faixas_invalidas == 0:
                print(f"✓ dias.json: {total_dias} dias e {total_musicas} músicas com todos os arquivos .webm válidos no disco.")
        except Exception as e:
            erros.append(f"Erro ao ler/validar dias.json: {e}")

    # 3. Validação de catalogo.json
    if not CATALOGO_ARQ.exists():
        erros.append("public/jogos/faixa/catalogo.json não existe!")
    else:
        try:
            cat = json.loads(CATALOGO_ARQ.read_text('utf-8'))
            if not isinstance(cat, list) or not all(isinstance(x, list) and len(x) == 2 for x in cat):
                erros.append("catalogo.json com formato inválido (deve ser lista de pares [titulo, artista])")
            else:
                print(f"✓ catalogo.json: {len(cat)} músicas cadastradas no autocomplete.")
        except Exception as e:
            erros.append(f"Erro ao ler catalogo.json: {e}")

    # 4. Validação da fila e candidatos
    if not FILA_ARQ.exists():
        preparar_fila()
    try:
        fila = fila_snapshot if fila_snapshot is not None else json.loads(FILA_ARQ.read_text('utf-8'))
        ids = set()
        for it in fila:
            if it['id'] in ids:
                erros.append(f"ID duplicado na fila: {it['id']}")
            ids.add(it['id'])
            if it.get('status') == 'pronta':
                try:
                    data, numero = it['data_adicionado'].split('#')
                    faixa = next(m for m in dias[data] if m['n'] == int(numero))
                    if faixa.get('categoria') != it['cat']:
                        erros.append(f"Categoria incorreta na faixa pronta: {it['t']}")
                    if [faixa['t'], faixa['a']] not in cat:
                        erros.append(f"Faixa pronta ausente do autocomplete: {faixa['t']}")
                    if len(faixa.get('camadas', [])) < 2:
                        erros.append(f"Faixa pronta sem duas camadas: {faixa['t']}")
                except (ValueError, KeyError, StopIteration):
                    erros.append(f"Referência inválida na fila pronta: {it['t']}")
        disney = sum(1 for x in fila if x.get('tipo') == 'disney')
        desenhos = sum(1 for x in fila if x.get('tipo') in ('desenho', 'anime'))
        prontas = sum(1 for x in fila if x.get('status') == 'pronta')
        print(f"✓ Fila: {len(fila)} itens únicos ({disney} Disney, {desenhos} Desenhos/Animes, {prontas} prontas).")
    except Exception as e:
        erros.append(f"Erro na fila: {e}")

    # 5. Validação do ambiente Demucs
    if DEMUCS_VENV.exists():
        print(f"✓ Demucs venv presente em {DEMUCS_VENV}.")
    else:
        print(f"ℹ Demucs venv em {DEMUCS_VENV} (fora do sandbox; disponível no ambiente normal do host).")

    if erros:
        print("\nFalhas na validação:")
        for err in erros:
            print(f"  ✗ {err}")
        return False
    else:
        print("\n✓ Todos os testes de validação passaram com sucesso!")
        return True


def cmd_status():
    pid = worker_pid()
    ativo = worker_ativo()
    fila = carrega_fila()
    anterior = json.loads(STATUS_ARQ.read_text()) if STATUS_ARQ.exists() else {}
    st = grava_status(anterior.get('mensagem', 'Atualizado') if ativo else 'Worker parado', ativo=ativo, pid=pid, item_atual=anterior.get('worker', {}).get('item_atual') if ativo else None)

    disney_prontas = st['catalogo']['disney_prontas']
    desenhos_prontas = st['catalogo']['desenhos_prontas']
    pendentes = st['catalogo']['pendentes']
    total = st['catalogo']['total_fila']

    print("========================================")
    print("  STATUS FAIXA: DISNEY, DESENHOS, FILMES E JOGOS")
    print("========================================")
    print(f"Worker: {'ATIVO (PID: ' + str(pid) + ')' if pid else 'PARADO'}")
    print(f"Lock exclusivo (flock): {'OCUPADO' if ativo else 'LIVRE'}")
    print(f"Fila total: {total} músicas")
    for c, nome in [('disney', 'Disney'), ('desenhos', 'Desenhos/animes'), ('filmes', 'Filmes e séries'), ('jogos', 'Jogos')]:
        tot = [x for x in fila if x.get('cat') == c]
        print(f"  • {nome + ' prontas:':24} {sum(1 for x in tot if x.get('status') == 'pronta')}/{len(tot)}")
    atual = (st.get('worker') or {}).get('item_atual')
    if atual: print(f"  • Agora: {atual.get('t')} ({atual.get('obra')})")
    print(f"  • Pendentes:        {pendentes}")
    print(f"  • Com falha:        {st['catalogo']['falhas']}")
    print(f"Status gravado em: {STATUS_ARQ}")
    print(f"Log do worker:     {LOG_ARQ}")

    erros = [x for x in fila if x.get('erro')]
    if erros:
        print(f"\nÚltimos erros ({len(erros)} faixas com erro):")
        for item in erros[:3]:
            print(f"  - {item['t']} ({item['obra']}): {item['erro']}")
    print("========================================")


def main():
    args = sys.argv[1:]
    if not args or 'status' in args:
        cmd_status()
        return

    cmd = args[0]
    if cmd == 'preparar':
        preparar_fila()
        cmd_status()
    elif cmd == 'testar':
        ok = testar_integridade_real()
        sys.exit(0 if ok else 1)
    elif cmd == 'iniciar':
        if worker_ativo():
            print(f"Outro worker já está ativo com lock exclusivo (PID: {worker_pid()}).")
            return

        so_uma = '--uma' in args
        limite = next((int(args[i + 1]) for i, a in enumerate(args) if a == '--limite' and i + 1 < len(args) and args[i + 1].isdigit()), None)
        daemon = '--daemon' in args

        if daemon:
            log._em_daemon = True
            cmd_daemon = [sys.executable, str(Path(__file__).resolve()), 'iniciar']
            if so_uma: cmd_daemon.append('--uma')
            if limite: cmd_daemon.extend(['--limite', str(limite)])
            STATUS_DIR.mkdir(parents=True, exist_ok=True)
            env = {**os.environ, 'FAIXA_DAEMON': '1'}
            with open(LOG_ARQ, 'a', encoding='utf-8') as log_f:
                proc = subprocess.Popen(cmd_daemon, stdout=log_f, stderr=log_f, start_new_session=True, env=env)
            print(f"Worker iniciado em segundo plano com PID {proc.pid}")
            grava_status("Worker iniciado em segundo plano", ativo=True, pid=proc.pid)
        else:
            executar_worker(limite=limite, so_uma=so_uma)
    else:
        print(f"Comando desconhecido: {cmd}")
        print("Uso: disney_desenhos.py preparar | status | testar | iniciar [--uma] [--limite N] [--daemon]")


if __name__ == '__main__':
    main()
