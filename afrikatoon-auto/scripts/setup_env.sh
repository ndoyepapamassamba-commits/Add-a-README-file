#!/bin/bash
# Installe ce qu'il faut pour fabriquer les vidéos dans une session cloud Claude Code (idempotent).
[ "$CLAUDE_CODE_REMOTE" != "true" ] && exit 0
need_apt=""
command -v ffmpeg >/dev/null || need_apt="$need_apt ffmpeg"
command -v espeak-ng >/dev/null || need_apt="$need_apt espeak-ng"
[ -d /usr/share/mbrola/fr1 ] || need_apt="$need_apt mbrola mbrola-fr1 mbrola-fr4"
if [ -n "$need_apt" ]; then
  (apt-get install -y -q $need_apt >/dev/null 2>&1 || (apt-get update -q >/dev/null 2>&1 && apt-get install -y -q $need_apt >/dev/null 2>&1))
fi
python3 -c "import bpy, PIL, numpy, requests, dotenv, cairosvg" 2>/dev/null || \
  pip install -q bpy pillow numpy requests python-dotenv anthropic cairosvg >/dev/null 2>&1
# Chatterbox (voix clonées, ~2 Go) seulement si les modèles sont téléchargeables (huggingface.co autorisé)
if curl -s -o /dev/null -m 5 https://huggingface.co; then
  python3 -c "import chatterbox" 2>/dev/null || pip install -q chatterbox-tts >/dev/null 2>&1 || true
fi
echo "Afrikatoon : environnement prêt (Blender, voix, ffmpeg)."
exit 0
