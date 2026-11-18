#!/bin/sh
# Publica em produção pela CLI da Vercel (o projeto não está ligado ao GitHub; o push é só backup).
# O deploy sai de uma cópia limpa do último commit (git worktree), nunca da pasta de trabalho: o que não foi
# commitado (inclusive o trabalho de outros agentes) não vai para o ar.
# A sala recarrega só quando o código do app muda: o build (scripts/versao.sh) grava em public/version.json o hash dos
# .js/.html ("v": recarrega) e o dos .css ("c": o estilo é trocado na hora, sem derrubar ninguém).
# Dados novos não derrubam ninguém. O build não enxerga tools/ (.vercelignore).
#   ./deploy.sh "mensagem"   commita tudo e publica
#   ./deploy.sh --dados      só as músicas do Faixa a Faixa (rotina diária e leva.py)
#   ./deploy.sh --preview    publica o último commit numa URL de teste, sem commitar nem mexer na produção
cd "$(dirname "$0")" || exit 1
set -e

alvo=--prod
if [ "$1" = "--preview" ]; then
  alvo=
elif [ "$1" = "--dados" ]; then
  git add public/jogos/faixa
  if git diff --cached --quiet; then echo "nada novo para publicar"; exit 0; fi
  git commit -q -m "Faixa a Faixa: novas músicas"
else
  git add -A
  git diff --cached --quiet || git commit -q -m "${1:-Atualiza o site}"
fi

# Backup no GitHub: se falhar, avisa mas publica mesmo assim.
if [ -n "$alvo" ]; then
  git push -q origin main || echo "aviso: o push para o GitHub falhou; publicando assim mesmo"
fi

# a cópia fica no disco (~/.cache), não no /tmp: o /tmp é memória (tmpfs) e o repositório passa de 2,5 GB
mkdir -p "$HOME/.cache"
dir=$(mktemp -d "$HOME/.cache/cineminha-deploy.XXXXXX")
trap 'git worktree remove --force "$dir" 2>/dev/null; rm -rf "$dir"; git worktree prune' EXIT
git worktree add -q --detach "$dir" HEAD
mkdir -p "$dir/.vercel"
cp .vercel/project.json "$dir/.vercel/"

# --archive=tgz: o repositório passa de 15 mil arquivos (limite do envio arquivo a arquivo).
vercel deploy $alvo --yes --archive=tgz --cwd "$dir" \
  --meta commit="$(git rev-parse --short HEAD)" > "$dir.log" 2>&1 || { cat "$dir.log"; rm -f "$dir.log"; exit 1; }
url=$(grep -o 'https://[a-z0-9.-]*\.vercel\.app' "$dir.log" | head -1)
rm -f "$dir.log"
if [ -n "$alvo" ]; then
  echo "publicado ($(git rev-parse --short HEAD)): https://cineminha-boo.vercel.app  [$url]"
else
  echo "preview ($(git rev-parse --short HEAD)): $url"
fi
