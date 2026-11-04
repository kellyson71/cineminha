#!/bin/sh
# Publica em produção. O version.json novo faz quem está na sala atualizar sozinho.
cd "$(dirname "$0")"
# --dados: só dados novos (ex.: dias do Faixa a Faixa). Não troca a versão, então ninguém na sala recarrega.
[ "$1" = "--dados" ] || printf '{"v":"%s"}\n' "$(date +%s)" > public/version.json
npx -y vercel@latest deploy --prod --yes --force 2>&1 | tail -3
