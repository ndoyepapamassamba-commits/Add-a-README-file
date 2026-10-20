#!/bin/bash
# FILM BENCH — step 1: a film → pictures at 8 fps (540×960, letterboxed to 9:16) + mono 16 kHz sound.
# usage: outils/filmbench/extract.sh <film> <name>   (work dir: $FILMBENCH_DIR, default .filmbench)
set -euo pipefail
D="${FILMBENCH_DIR:-.filmbench}/$2"
mkdir -p "$D"
find "$D" -maxdepth 1 -name 'f_*.jpg' -delete
ffmpeg -v error -y -i "$1" -vf "fps=8,scale=540:960:force_original_aspect_ratio=decrease,pad=540:960:(ow-iw)/2:(oh-ih)/2" -q:v 3 "$D/f_%05d.jpg"
ffmpeg -v error -y -i "$1" -ac 1 -ar 16000 "$D/audio.wav"
echo "$2: $(find "$D" -maxdepth 1 -name 'f_*.jpg' | wc -l) images"
