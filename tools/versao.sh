#!/bin/sh
# Versão do app para a atualização automática (roda no build da Vercel):
#   "v" muda com o código (.js/.html de public/) e faz a sala recarregar;
#   "c" muda só com o visual (.css) e é trocado na hora, sem derrubar ninguém.
cd "$(dirname "$0")/.."
h() { sort | xargs cat | sha1sum | cut -c1-16; }
v=$(find public -maxdepth 1 -type f \( -name '*.js' -o -name '*.html' \) | h)
c=$({ find public -maxdepth 1 -type f -name '*.css'; find public/themes -type f -name '*.css' 2>/dev/null; } | h)
printf '{"v":"%s","c":"%s"}\n' "$v" "$c" > public/version.json
