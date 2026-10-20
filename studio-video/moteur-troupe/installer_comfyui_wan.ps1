# INSTALLER COMFYUI + WAN SUR WINDOWS (carte NVIDIA) — sans abonnement ni coût par génération.
# Usage (PowerShell) :  powershell -ExecutionPolicy Bypass -File installer_comfyui_wan.ps1 -Kit s2v
#   -Kit s2v           Wan2.2-S2V : une image + une voix → le personnage parle et bouge (25,2 Go de modèles)
#   -Kit infinitetalk  InfiniteTalk : deux personnages se répondent dans le même plan (29,4 Go de modèles)
#   -Dossier           dossier d'installation (défaut : %USERPROFILE%\ComfyUI_troupe)
# ComfyUI est sous licence GPL-3.0 : il tourne comme programme séparé, la chaîne de la troupe lui parle par son API.
param([ValidateSet('s2v','infinitetalk')][string]$Kit = 's2v', [string]$Dossier = "$env:USERPROFILE\ComfyUI_troupe")
$ErrorActionPreference = 'Stop'
$KITS = @{
  's2v' = @(
    @('Comfy-Org/Wan_2.2_ComfyUI_Repackaged','split_files/diffusion_models/wan2.2_s2v_14B_fp8_scaled.safetensors','diffusion_models'),
    @('Comfy-Org/Wan_2.2_ComfyUI_Repackaged','split_files/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors','loras'),
    @('Comfy-Org/Wan_2.2_ComfyUI_Repackaged','split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors','text_encoders'),
    @('Comfy-Org/Wan_2.2_ComfyUI_Repackaged','split_files/vae/wan_2.1_vae.safetensors','vae'),
    @('Comfy-Org/Wan_2.2_ComfyUI_Repackaged','split_files/audio_encoders/wav2vec2_large_english_fp16.safetensors','audio_encoders'))
  'infinitetalk' = @(
    @('Comfy-Org/Wan_2.1_ComfyUI_repackaged','split_files/diffusion_models/wan2.1_i2v_480p_14B_fp8_scaled.safetensors','diffusion_models'),
    @('Comfy-Org/Wan_2.1_ComfyUI_repackaged','split_files/model_patches/wan2.1_infiniteTalk_multi_fp16.safetensors','model_patches'),
    @('Kijai/WanVideo_comfy','Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors','loras'),
    @('Comfy-Org/Wan_2.1_ComfyUI_repackaged','split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors','text_encoders'),
    @('Comfy-Org/Wan_2.1_ComfyUI_repackaged','split_files/vae/wan_2.1_vae.safetensors','vae'),
    @('Kijai/wav2vec2_safetensors','wav2vec2-chinese-base_fp16.safetensors','audio_encoders'))
}
New-Item -ItemType Directory -Force -Path $Dossier | Out-Null
$racine = Join-Path $Dossier 'ComfyUI_windows_portable'
if (-not (Test-Path (Join-Path $racine 'run_nvidia_gpu.bat'))) {
  Write-Host '1/3  Téléchargement de ComfyUI portable (version NVIDIA, dernière version publiée)…'
  # lien direct de la dernière version publiée (vérifié le 16/10/2026)
  $archive = Join-Path $Dossier 'ComfyUI_windows_portable_nvidia.7z'
  curl.exe -L -C - -o $archive 'https://github.com/comfyanonymous/ComfyUI/releases/latest/download/ComfyUI_windows_portable_nvidia.7z'
  if (-not (Test-Path $archive) -or (Get-Item $archive).Length -lt 100MB) { throw 'Téléchargement de ComfyUI portable incomplet : relancez le script (il reprend où il s''est arrêté).' }
  Write-Host '     Extraction…'
  tar -xf $archive -C $Dossier
  if (-not (Test-Path (Join-Path $racine 'run_nvidia_gpu.bat'))) { throw "Extraction impossible avec tar : ouvrez $archive avec 7-Zip, extrayez-le dans $Dossier, puis relancez ce script." }
}
$modeles = Join-Path $racine 'ComfyUI\models'
Write-Host "2/3  Téléchargement des modèles du kit « $Kit » (reprise automatique si la connexion coupe)…"
foreach ($f in $KITS[$Kit]) {
  $cible = Join-Path $modeles $f[2]; New-Item -ItemType Directory -Force -Path $cible | Out-Null
  $nom = Split-Path $f[1] -Leaf; $sortie = Join-Path $cible $nom
  Write-Host "     $nom → models\$($f[2])"
  curl.exe -L -C - -o $sortie "https://huggingface.co/$($f[0])/resolve/main/$($f[1])"
}
Write-Host '3/3  Démarrage du serveur ComfyUI sur http://127.0.0.1:8188 (laisser cette fenêtre ouverte)…'
Set-Location $racine
& .\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --listen 127.0.0.1 --port 8188
