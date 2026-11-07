#!/bin/sh
# Gera os pacotes da extensão:
#   public/extensao/cineminha-netflix.zip  → o que o site oferece em /baixar/extensao (inclui localhost, para testar)
#   extensao/loja/cineminha-loja.zip        → o que vai para a Chrome Web Store (sem localhost)
set -e
cd "$(dirname "$0")/netflix"
mkdir -p ../../public/extensao
rm -f ../../public/extensao/cineminha-netflix.zip ../loja/cineminha-loja.zip
zip -qr ../../public/extensao/cineminha-netflix.zip . -x '.*'
tmp=$(mktemp -d); cp -r . "$tmp/"
node -e '
const fs=require("fs"),p=process.argv[1]+"/manifest.json",m=JSON.parse(fs.readFileSync(p,"utf8"))
const sem=l=>l.filter(u=>!u.includes("localhost"))
m.host_permissions=sem(m.host_permissions); for (const c of m.content_scripts) c.matches=sem(c.matches)
fs.writeFileSync(p, JSON.stringify(m,null,2))' "$tmp"
sed -i "s#, 'http://localhost:8790/\*'##" "$tmp/fundo.js" "$tmp/popup.js"
(cd "$tmp" && zip -qr "$OLDPWD/../loja/cineminha-loja.zip" . -x '.*')
rm -rf "$tmp"
echo "public/extensao/cineminha-netflix.zip"
echo "extensao/loja/cineminha-loja.zip"
