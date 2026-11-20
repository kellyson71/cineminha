#!/bin/sh
# Músicas e capas do Faixa a Faixa num projeto à parte da Vercel (cineminha-midia), fora do pacote do site.
# Assim o site fica com poucos arquivos e as duas publicações enviam só o que mudou (rápido).
# A pasta de envio é montada com links (não copia os 2,5 GB) em ~/.cache e publicada em produção.
#   sh scripts/midia-vercel.sh        → https://cineminha-midia.vercel.app/faixa/dias/<data>/<n>/<arquivo>
cd "$(dirname "$0")/.." || exit 1
set -e

dir="$HOME/.cache/cineminha-midia"
mkdir -p "$dir/public/faixa"
rm -rf "$dir/public/faixa/dias"
cp -al public/jogos/faixa/dias "$dir/public/faixa/dias" # links: mesmo disco, sem copiar nada

# o jogo baixa as músicas com fetch: precisa liberar o site (CORS); cache de um dia no navegador e na CDN
cat > "$dir/vercel.json" <<'EOF'
{
  "framework": null,
  "installCommand": "true",
  "buildCommand": "true",
  "outputDirectory": "public",
  "headers": [
    { "source": "/(.*)", "headers": [
      { "key": "Access-Control-Allow-Origin", "value": "*" },
      { "key": "Cache-Control", "value": "public, max-age=86400" }
    ] }
  ]
}
EOF

# mesmo time do site; cria o projeto na primeira vez
if [ ! -f "$dir/.vercel/project.json" ]; then
  scope=$(sed -n 's/.*"orgId":"\([^"]*\)".*/\1/p' .vercel/project.json)
  vercel project add cineminha-midia --scope "$scope" >/dev/null 2>&1 || true
  vercel link --yes --project cineminha-midia --scope "$scope" --cwd "$dir" >/dev/null
fi

# só os arquivos novos (rápido); o plano grátis aceita até 5.000 arquivos soltos por dia: passou disso, vai num pacote só
vercel deploy --prod --yes --cwd "$dir" >/dev/null 2>&1 || vercel deploy --prod --yes --archive=tgz --cwd "$dir" >/dev/null
echo "mídia publicada: https://cineminha-midia.vercel.app/faixa/"
