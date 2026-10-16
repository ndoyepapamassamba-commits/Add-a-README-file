#!/usr/bin/env bash
# INSTALLER COMFYUI + WAN SUR LINUX (NVIDIA) OU macOS (Apple Silicon) — sans abonnement ni coût par génération.
#   bash installer_comfyui_wan.sh s2v            Wan2.2-S2V (25,2 Go de modèles)
#   bash installer_comfyui_wan.sh infinitetalk   InfiniteTalk deux voix (29,4 Go de modèles)
#   DOSSIER=~/ComfyUI_troupe (par défaut)
# ComfyUI (GPL-3.0) tourne comme programme séparé ; la chaîne de la troupe lui parle par son API (http://127.0.0.1:8188).
set -euo pipefail
KIT="${1:-s2v}"; DOSSIER="${DOSSIER:-$HOME/ComfyUI_troupe}"
case "$KIT" in
  s2v) FICHIERS="Comfy-Org/Wan_2.2_ComfyUI_Repackaged split_files/diffusion_models/wan2.2_s2v_14B_fp8_scaled.safetensors diffusion_models
Comfy-Org/Wan_2.2_ComfyUI_Repackaged split_files/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors loras
Comfy-Org/Wan_2.2_ComfyUI_Repackaged split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors text_encoders
Comfy-Org/Wan_2.2_ComfyUI_Repackaged split_files/vae/wan_2.1_vae.safetensors vae
Comfy-Org/Wan_2.2_ComfyUI_Repackaged split_files/audio_encoders/wav2vec2_large_english_fp16.safetensors audio_encoders" ;;
  infinitetalk) FICHIERS="Comfy-Org/Wan_2.1_ComfyUI_repackaged split_files/diffusion_models/wan2.1_i2v_480p_14B_fp8_scaled.safetensors diffusion_models
Comfy-Org/Wan_2.1_ComfyUI_repackaged split_files/model_patches/wan2.1_infiniteTalk_multi_fp16.safetensors model_patches
Kijai/WanVideo_comfy Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors loras
Comfy-Org/Wan_2.1_ComfyUI_repackaged split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors text_encoders
Comfy-Org/Wan_2.1_ComfyUI_repackaged split_files/vae/wan_2.1_vae.safetensors vae
Kijai/wav2vec2_safetensors wav2vec2-chinese-base_fp16.safetensors audio_encoders" ;;
  *) echo "Kit inconnu : $KIT (s2v | infinitetalk)"; exit 1 ;;
esac
mkdir -p "$DOSSIER" && cd "$DOSSIER"
if [ ! -d ComfyUI ]; then
  echo "1/3  Installation de ComfyUI…"
  git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git
  python3 -m venv venv && . venv/bin/activate && pip install -q --upgrade pip
  if command -v nvidia-smi >/dev/null 2>&1; then pip install -q torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
  else pip install -q torch torchvision torchaudio; fi   # macOS : torch avec MPS (Apple Silicon)
  pip install -q -r ComfyUI/requirements.txt
else . venv/bin/activate; fi
echo "2/3  Téléchargement des modèles du kit « $KIT » (reprise automatique)…"
echo "$FICHIERS" | while read -r depot chemin dossier; do
  mkdir -p "ComfyUI/models/$dossier"; nom=$(basename "$chemin"); echo "     $nom → models/$dossier"
  curl -L -C - -o "ComfyUI/models/$dossier/$nom" "https://huggingface.co/$depot/resolve/main/$chemin"
done
echo "3/3  Démarrage du serveur ComfyUI sur http://127.0.0.1:8188 (laisser ce terminal ouvert)…"
cd ComfyUI && exec python main.py --listen 127.0.0.1 --port 8188
