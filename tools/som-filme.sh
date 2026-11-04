#!/bin/sh
# Som do PC na transmissão (Linux/PipeWire).
# Cria a saída virtual "Cineminha - Filme": o que tocar nela vai para a transmissão E para o seu fone.
# No site: Transmitir > Som extra > "Monitor of Cineminha - Filme". As vozes dos amigos não entram (não tocam nela).
#
#   tools/som-filme.sh            cria a saída
#   tools/som-filme.sh mover mpv  manda o som de um app (nome parcial) para ela
#   tools/som-filme.sh desfazer   remove tudo
SINK=cineminha_filme
IDS="${XDG_RUNTIME_DIR:-/tmp}/cineminha-som.ids"
case "$1" in
  desfazer|off)
    [ -f "$IDS" ] && for id in $(cat "$IDS"); do pactl unload-module "$id" 2>/dev/null; done
    rm -f "$IDS"; echo "Saída removida."; exit 0 ;;
  mover)
    [ -z "$2" ] && { echo "uso: $0 mover <app>"; exit 1; }
    pactl -f json list sink-inputs | python3 -c '
import json,sys
for s in json.load(sys.stdin):
    p=s.get("properties",{})
    nome=(p.get("application.name","")+" "+p.get("application.process.binary","")+" "+p.get("media.name","")).lower()
    if sys.argv[1].lower() in nome: print(s["index"], p.get("application.name",""))
' "$2" | while read idx nome; do pactl move-sink-input "$idx" "$SINK" && echo "→ $nome"; done
    exit 0 ;;
esac
if pactl list short sinks | grep -q "$SINK"; then echo "Já existe. No app do filme, escolha a saída \"Cineminha - Filme\"."; exit 0; fi
a=$(pactl load-module module-null-sink sink_name=$SINK sink_properties='device.description="Cineminha - Filme"')
# devolve o som para a saída padrão, para você ouvir também (latência folgada evita cortes)
b=$(pactl load-module module-loopback source=$SINK.monitor latency_msec=60)
echo "$a $b" > "$IDS"
cat <<T
Pronto: saída "Cineminha - Filme" criada.
1. Mande o som do filme/jogo para ela (pavucontrol, ou: $0 mover mpv)
2. No site: Transmitir > Som extra > "Monitor of Cineminha - Filme"
3. Transmita a tela ou janela normalmente.
Para desfazer: $0 desfazer
T
