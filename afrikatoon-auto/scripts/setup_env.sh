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
# Chatterbox (voix naturelles gratuites, version processeur) — seulement si huggingface.co est autorisé
if curl -s -o /dev/null -m 5 https://huggingface.co; then
  if ! python3 -c "import chatterbox" 2>/dev/null; then
    pip install -q torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu >/dev/null 2>&1
    # antlr4 4.9.3 ne se compile pas avec le setuptools de Debian : installation directe des sources
    if ! python3 -c "import antlr4" 2>/dev/null; then
      T=$(mktemp -d) && pip download -q antlr4-python3-runtime==4.9.3 --no-deps --no-binary :all: -d "$T" >/dev/null 2>&1 \
        && tar xzf "$T"/antlr4-python3-runtime-4.9.3.tar.gz -C "$T" \
        && SP=$(python3 -c "import site;print(site.getsitepackages()[0])") \
        && cp -r "$T"/antlr4-python3-runtime-4.9.3/src/antlr4 "$SP"/ \
        && mkdir -p "$SP"/antlr4_python3_runtime-4.9.3.dist-info \
        && printf "Metadata-Version: 2.1\nName: antlr4-python3-runtime\nVersion: 4.9.3\n" > "$SP"/antlr4_python3_runtime-4.9.3.dist-info/METADATA \
        && echo "antlr4/__init__.py,," > "$SP"/antlr4_python3_runtime-4.9.3.dist-info/RECORD
    fi
    pip install -q chatterbox-tts "numpy<2" >/dev/null 2>&1 || true
  fi
  python3 -c "import gradio_client" 2>/dev/null || pip install -q gradio_client >/dev/null 2>&1
fi
echo "Afrikatoon : environnement prêt (Blender, voix, ffmpeg)."
exit 0
