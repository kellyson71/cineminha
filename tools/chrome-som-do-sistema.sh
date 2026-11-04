#!/bin/sh
# Abre o Chrome com a opção experimental que libera "compartilhar áudio do sistema" ao transmitir a tela inteira no Linux.
# O Chrome precisa estar totalmente fechado antes, senão a opção não vale.
# Atenção: capta TUDO que toca no PC, inclusive as vozes dos amigos (eco). Use fone, ou prefira tools/som-filme.sh.
if pgrep -x chrome >/dev/null; then echo "Feche o Chrome por completo e rode de novo."; exit 1; fi
exec google-chrome-stable --enable-features=PulseaudioLoopbackForScreenShare "$@"
