"""Executa as verificações do catálogo, integração de sons e partida P2P local."""
from pathlib import Path
import subprocess
import sys

for nome in ['teste-catalogo.py', 'teste-sons.py', 'teste-p2p.py']:
    subprocess.run([sys.executable, str(Path(__file__).with_name(nome))], check=True)
