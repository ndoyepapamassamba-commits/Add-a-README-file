#!/bin/bash
# Banc CPU « moteur de la troupe » : Wan2.1-T2V-1.3B (GGUF Q8_0) + LoRA DMD 4 pas, via stable-diffusion.cpp.
# Usage : B=/chemin/banc W=320 H=576 F=17 T=2 OUT=clip.avi ./generer.sh "prompt"
#   B : dossier contenant sdcpp/build/bin/sd-cli, models/ et models/loras/dmd4.safetensors
#   W,H : multiples de 16 (9:16 -> 320x576) ; F = 4k+1 images (9, 17, 33, 81) à 16 i/s
#   T : threads (2 si un autre calcul tourne, sinon 4) ; DECODEUR=vae|tae (tae = rapide, MIT)
set -euo pipefail
B=${B:?définir B}; W=${W:-320}; H=${H:-576}; F=${F:-17}; T=${T:-2}; OUT=${OUT:-clip.avi}; SEED=${SEED:-42}
PROMPT=${1:-"3D animated cartoon, Pixar style, a thin West-African man in a faded green t-shirt waves his hand in a sunny West-African courtyard, vertical 9:16"}
if [ "${DECODEUR:-tae}" = tae ]; then DEC=(--tae "$B/models/taew2_1.safetensors" --temporal-tiling); else DEC=(--vae-tiling --vae-tile-overlap 0.25); fi
python3 -I "$(dirname "$0")/mesure.py" "$B/sdcpp/build/bin/sd-cli" -M vid_gen \
  --diffusion-model "$B/models/Wan2.1-T2V-1.3B-Q8_0.gguf" \
  --vae "$B/models/wan_2.1_vae.safetensors" \
  --t5xxl "$B/models/umt5-xxl-encoder-Q4_K_M.gguf" \
  --lora-model-dir "$B/models/loras" \
  -p "$PROMPT<lora:dmd4:1.0>" --cfg-scale 1.0 --sampling-method lcm --scheduler simple --steps 4 \
  -W "$W" -H "$H" --video-frames "$F" --fps 16 --flow-shift 5.0 -s "$SEED" -t "$T" "${DEC[@]}" -o "$OUT"
