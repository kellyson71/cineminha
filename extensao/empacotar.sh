#!/bin/sh
# Gera o .zip da extensão que o site oferece em /baixar/extensao
set -e
cd "$(dirname "$0")/netflix"
mkdir -p ../../public/extensao
rm -f ../../public/extensao/cineminha-netflix.zip
zip -qr ../../public/extensao/cineminha-netflix.zip . -x '.*'
echo "public/extensao/cineminha-netflix.zip"
