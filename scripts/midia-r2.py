"""Envia as músicas e capas do Faixa a Faixa (public/jogos/faixa/dias) para o bucket do Cloudflare R2 (cineminha-midia).
Assim elas saem do pacote do site e a publicação fica leve. O jogo lê de lá (config.js → midiaFaixa).

Manda só o que ainda não está no bucket (mesmo nome e tamanho), então rodar de novo é rápido.
Lê do .env.local: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
O CORS (o site poder ler as músicas) é configurado no painel da Cloudflare, na página do bucket.

Uso:  uv run --with boto3 scripts/midia-r2.py
"""
import mimetypes
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import boto3
from botocore.config import Config

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / 'public' / 'jogos' / 'faixa' / 'dias'
PREFIXO = 'faixa/dias/'


def env():
    vals = {}
    arq = RAIZ / '.env.local'
    if arq.exists():
        for linha in arq.read_text().splitlines():
            if '=' in linha and not linha.lstrip().startswith('#'):
                k, v = linha.split('=', 1)
                vals[k.strip()] = v.strip().strip('"').strip("'")
    vals.update({k: v for k, v in os.environ.items() if k.startswith('R2_')})
    falta = [k for k in ('R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET') if not vals.get(k)]
    if falta:
        sys.exit('Falta no .env.local: ' + ', '.join(falta))
    return vals


def main():
    e = env()
    s3 = boto3.client('s3', endpoint_url=f"https://{e['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
                      aws_access_key_id=e['R2_ACCESS_KEY_ID'], aws_secret_access_key=e['R2_SECRET_ACCESS_KEY'],
                      region_name='auto', config=Config(retries={'max_attempts': 6, 'mode': 'adaptive'}, max_pool_connections=16))
    bucket = e['R2_BUCKET']

    # o que já está no bucket (nome → tamanho)
    tem = {}
    for pag in s3.get_paginator('list_objects_v2').paginate(Bucket=bucket, Prefix=PREFIXO):
        for o in pag.get('Contents', []):
            tem[o['Key']] = o['Size']

    locais = [p for p in PASTA.rglob('*') if p.is_file()]
    faltam = [p for p in locais if tem.get(PREFIXO + p.relative_to(PASTA).as_posix()) != p.stat().st_size]
    total = sum(p.stat().st_size for p in faltam)
    print(f'{len(locais)} arquivos aqui, {len(tem)} no bucket; enviando {len(faltam)} ({total / 1e6:.0f} MB)', flush=True)

    feitos = [0]

    def envia(p):
        chave = PREFIXO + p.relative_to(PASTA).as_posix()
        tipo = mimetypes.guess_type(p.name)[0] or ('audio/webm' if p.suffix == '.webm' else 'application/octet-stream')
        s3.upload_file(str(p), bucket, chave, ExtraArgs={'ContentType': tipo, 'CacheControl': 'public, max-age=86400'})
        feitos[0] += 1
        if feitos[0] % 250 == 0 or feitos[0] == len(faltam):
            print(f'  {feitos[0]}/{len(faltam)}', flush=True)

    with ThreadPoolExecutor(8) as ex:
        list(ex.map(envia, faltam))
    print('pronto', flush=True)


if __name__ == '__main__':
    main()
