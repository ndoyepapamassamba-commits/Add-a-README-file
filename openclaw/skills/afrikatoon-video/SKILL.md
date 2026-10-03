---
name: afrikatoon-video
description: Fabrique des vidéos TikTok humoristiques Afrikatoon (> 1 minute, 9:16) pour @comedyvideos_100 — Claude écrit le sketch, puis dessin animé 2D (lip-sync Rhubarb, caméra automatique, voix Chatterbox à accent africain, musique balafon originale) ou animation IA Wan 2.2. Déclencheurs : « vidéo du jour », « fais un sketch », « Afrikatoon », « vidéo TikTok drôle ».
version: 1.0.0
metadata:
  openclaw:
    emoji: "🎬"
    os: [linux, macos]
    homepage: https://github.com/ndoyepapamassamba-commits/Add-a-README-file
    requires:
      bins: [python3, ffmpeg, git]
    envVars:
      - name: HF_TOKEN
        required: false
        description: Jeton HuggingFace « Read » — conversion 2D par IA (FLUX.2) et animation Wan 2.2 (quota ZeroGPU).
      - name: ANTHROPIC_API_KEY
        required: false
        description: Écriture automatique des sketchs (sinon c'est l'agent qui écrit le kit).
      - name: TIKTOK_CLIENT_KEY
        required: false
        description: Publication TikTok (avec TIKTOK_CLIENT_SECRET et TIKTOK_REFRESH_TOKEN).
      - name: TIKTOK_CLIENT_SECRET
        required: false
        description: Publication TikTok.
      - name: TIKTOK_REFRESH_TOKEN
        required: false
        description: Publication TikTok (créé par `python run.py auth`).
    install:
      - kind: brew
        formula: ffmpeg
        bins: [ffmpeg]
---

# Afrikatoon — vidéos du jour

Projet : `{baseDir}/../../../afrikatoon-auto` (ou le chemin du dépôt cloné dans `AFRIKATOON_DIR`).
**Toujours appliquer aussi le skill `coffre-fort`** : jamais de jeton dans le chat ni dans un fichier.

## 1. Installer (une fois)
```bash
cd afrikatoon-auto
CLAUDE_CODE_REMOTE=true bash scripts/setup_env.sh   # Chatterbox, Rhubarb, MediaPipe, rembg, Real-ESRGAN
```
Les secrets se mettent dans le coffre : `bash ../openclaw/skills/coffre-fort/scripts/vault.sh put HF_TOKEN`
puis chaque commande est lancée par `vault.sh run -- …`.

## 2. Écrire le kit
Lire `NEXT_STEPS.md`, `state/history.json` (ne jamais refaire un couple conflit × twist), `afrikatoon/bible.py`
(38 personnages, décors) et `examples/kit_exemple.json`. Écrire `kits/<AAAA-MM-JJ>/<NN>-<slug>.json` :
hook dans la 1re seconde, escalade, twist, chute < 10 mots, 8 scènes, répliques ≤ 12 mots écrites pour l'oral,
légende avec question qui force à choisir un camp, 6-8 hashtags. Auto-évaluation `score` ≥ 8 partout.

## 3. Fabriquer
```bash
vault.sh run -- python3 run.py run --kit kits/…json --mock 2d-hq --no-upload   # dessin animé 2D (gratuit, CPU)
vault.sh run -- python3 run.py run --kit kits/…json --mock wan --no-upload     # animation IA Wan 2.2 (quota HF)
```
La vidéo et sa légende sont dans `output/<date>-<titre>/` (`final.mp4`, `caption.txt`).

## 4. Contrôler avant d'envoyer
- Regarder une planche d'images (`ffmpeg -i final.mp4 -vf fps=1/4,scale=180:320,tile=8x2 planche.jpg`).
- Voix : chaque réplique est retranscrite par Whisper ; refaire celles dont le contrôle est < 0,9.
- Durée > 60 s (programme Creator Rewards), sous-titres lisibles, pas de logo de marque réelle visible.

## 5. Publier
Publication TikTok **seulement après accord explicite de l'utilisateur** (règle coffre-fort n° 4) :
`vault.sh run -- python3 run.py upload output/<dossier> --mode draft`. Étiquette « contenu IA » obligatoire.
