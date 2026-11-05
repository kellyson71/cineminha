#!/bin/sh
# Publica em produção pelo git: a Vercel faz o deploy sozinha a cada push na main.
# A sala recarrega só quando o código do app muda: o build (vercel.json) grava em public/version.json o hash dos
# .js/.html ("v": recarrega) e o dos .css ("c": o estilo é trocado na hora, sem derrubar ninguém).
# Dados novos não derrubam ninguém. O build não enxerga tools/ (.vercelignore).
#   ./deploy.sh "mensagem"   commita tudo e publica
#   ./deploy.sh --dados      só as músicas do Faixa a Faixa (rotina diária e leva.py)
cd "$(dirname "$0")"
if [ "$1" = "--dados" ]; then
  git add public/jogos/faixa
  if git diff --cached --quiet; then echo "nada novo para publicar"; exit 0; fi
  git commit -q -m "Faixa a Faixa: novas músicas"
else
  git add -A
  git diff --cached --quiet || git commit -q -m "${1:-Atualiza o site}"
fi
git push -q origin main && echo "publicado: a Vercel faz o deploy em instantes"
