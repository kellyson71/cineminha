#!/usr/bin/env python3
"""Receptor da extensão cineminha-musica (Spicetify). Ativado pelo cineminha-spotify.socket (fd 3):
grava tools/faixa/listas/spotify.json e sai depois de 30 s sem pedidos."""
import json, os, socket, sys, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ARQ = Path(__file__).resolve().parent / 'listas' / 'spotify.json'


class R(BaseHTTPRequestHandler):
    def _cab(self, cod=200):
        self.send_response(cod)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.end_headers()

    def do_OPTIONS(self):
        self._cab(204)

    def do_POST(self):
        if self.path != '/dados':
            return self._cab(404)
        n = int(self.headers.get('Content-Length') or 0)
        try:
            d = json.loads(self.rfile.read(n))
            limpa = lambda xs: [{k: x.get(k) for k in ('t', 'a', 'pop', 'periodo', 'playlist') if x.get(k) is not None} for x in xs or [] if x.get('t') and x.get('a')]
            out = {'quando': d.get('quando'), 'erros': [str(e)[:200] for e in d.get('erros') or []][:20], **{k: limpa(d.get(k)) for k in ('top', 'curtidas', 'recentes', 'playlists')}}
            tmp = ARQ.with_suffix('.tmp'); tmp.write_text(json.dumps(out, ensure_ascii=False)); tmp.replace(ARQ)
            self._cab(200); self.wfile.write(b'ok')
            print(f"recebido: {len(out['top'])} top, {len(out['curtidas'])} curtidas, {len(out['playlists'])} de playlists", flush=True)
        except Exception as e:
            self._cab(400); print('erro', e, flush=True)

    def log_message(self, *a):
        pass


def main():
    if os.environ.get('LISTEN_FDS'):
        srv = HTTPServer(('127.0.0.1', 8797), R, bind_and_activate=False)
        srv.socket = socket.fromfd(3, socket.AF_INET, socket.SOCK_STREAM)
    else:
        srv = HTTPServer(('127.0.0.1', 8797), R)
    import select
    while select.select([srv.socket], [], [], 30)[0]:  # sai depois de 30 s sem pedidos (o socket do systemd reabre)
        srv.handle_request()

if __name__ == '__main__':
    main()
