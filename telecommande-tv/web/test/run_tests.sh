#!/bin/sh
# Tests de la version web : fausse télé + faux serveur IPTV + passerelle + Chromium (Playwright).
# PYTHON : Python avec pyOpenSSL, cryptography, androidtvremote2 (fausse télé), zxing-cpp et pillow (QR code)
# FFMPEG : ffmpeg avec libvpx-vp9 et libopus (vidéos de test), NODE_PATH : contient playwright
set -e
cd "$(dirname "$0")"
PY=${PYTHON:-python3}
FF=${FFMPEG:-ffmpeg}
MEDIA=${MEDIA_DIR:-/tmp/telecommande-media}
WORK=$(mktemp -d)
if [ ! -f "$MEDIA/clip.webm" ]; then
  mkdir -p "$MEDIA"
  "$FF" -hide_banner -loglevel error -y -f lavfi -i testsrc=size=160x90:rate=25 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 240 \
    -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -b:v 80k -g 50 -keyint_min 50 -pix_fmt yuv420p -c:a libopus -b:a 24k \
    -f hls -hls_time 2 -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 -hls_segment_filename "$MEDIA/seg%03d.m4s" \
    -hls_playlist_type vod "$MEDIA/out.m3u8"
  "$FF" -hide_banner -loglevel error -y -f lavfi -i testsrc=size=160x90:rate=25 -t 120 -c:v libvpx -b:v 80k "$MEDIA/clip.webm"
fi
mkdir -p "$WORK/tv"
"$PY" streams.py 18080 "$MEDIA" & P1=$!
"$PY" ../../tools/test/fake_tv.py 127.0.0.1 6466 6467 "$WORK/tv" > "$WORK/tv.log" 2>&1 & P2=$!
TELECOMMANDE_DIR="$WORK/cfg" TELECOMMANDE_SCAN_EXTRA=127.0.0.1 TELECOMMANDE_PROXY_LOCAL=1 \
  "$PY" ../passerelle_tv.py --no-browser --port 18765 > "$WORK/bridge.log" 2>&1 & P3=$!
trap 'kill $P1 $P2 $P3 2>/dev/null' EXIT
sleep 3
STREAMS=http://127.0.0.1:18080 BRIDGE=http://127.0.0.1:18765 FAKE_TV_DIR="$WORK/tv" PYTHON="$PY" node web_test.js
