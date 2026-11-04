#!/bin/bash
# Rotina do Faixa a Faixa: gera hoje e amanhã, completa ano/etiquetas e publica só os dados
# (sem trocar a versão: ninguém na sala recarrega). Registro em ~/.local/state/faixa/rotina.log
cd /home/kellyson/projetos/cineminha || exit 1
LOG=~/.local/state/faixa/rotina.log
mkdir -p "$(dirname "$LOG")"
exec >>"$LOG" 2>&1
echo "== $(date '+%F %T') início"
# espera outra geração que esteja rodando (leva manual, estúdio…)
while pgrep -f '[t]ools/faixa/(diario|estudio|ano|tags|retro|leva|pesquisa)[.]py' >/dev/null; do echo "   esperando outra geração terminar…"; sleep 60; done
antes=$(md5sum public/jogos/faixa/dias.json)
python3 -u tools/faixa/diario.py 2>&1 | grep -v -i warn
python3 -u tools/faixa/ano.py >/dev/null 2>&1
python3 -u tools/faixa/tags.py >/dev/null 2>&1
if [ "$antes" != "$(md5sum public/jogos/faixa/dias.json)" ] || [ "$1" = "--publicar" ]; then
  echo "   publicando (só dados)…"
  ./deploy.sh --dados && echo "   publicado"
else
  echo "   nada novo para publicar"
fi
echo "== $(date '+%F %T') fim"
