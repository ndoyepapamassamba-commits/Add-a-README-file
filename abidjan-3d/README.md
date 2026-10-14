# 🏙️ Abidjan 3D — la planche des 30 quartiers animée en relief

La planche « Abidjan » (30 vignettes de quartiers, 1672×941) animée en **HTML/WebGL (Three.js)** avec le
même principe que la vidéo « Ivrogne » : une carte de profondeur par image → un vrai maillage 3D → une
caméra qui bouge. Export **MP4** et **fichier HTML autonome**.

## Deux formats

| Format | Ce que ça fait | Sortie |
|---|---|---|
| **Mosaïque** | La planche entière à sa résolution d'origine. Chaque vignette a sa propre caméra 3D (respiration, vague, ou qui suit la souris). Les séparateurs et les bandeaux de légende restent des pixels d'origine, fixes et nets. | 1672×942, boucle de 8 s |
| **Diaporama 9:16** | Chaque vignette agrandie ×4 par IA (Real-ESRGAN), en plein cadre vertical sur fond flou, avec un mouvement de caméra (approche, orbite, plongée) et un fondu enchaîné. La légende reste plate et nette. | 1080×1920, prêt pour TikTok (76 s) |

Le mode **Original** désactive le relief : la mosaïque est alors rendue au pixel près.

## ✅ Fidélité mesurée

| Contrôle | Résultat |
|---|---|
| Mosaïque, mode Original : rendu WebGL vs image décodée par le navigateur | **1 573 352 pixels identiques sur 1 573 352** |
| MP4 de contrôle vs rendu (CRF 12) | PSNR luminance 50,8 dB · SSIM 0,9988 |
| MP4 animés vs rendu (CRF 16, défaut) | PSNR luminance > 42 dB · SSIM > 0,996 |

À savoir : le MP4 standard stocke les couleurs à demi-résolution (4:2:0). Sur une image aussi colorée, cela
adoucit légèrement les couleurs fines, quel que soit l'outil. Pour un master aux couleurs pleine
résolution : `node tools/export.mjs --chroma 444`.

## 🚀 Démarrage

```bash
cd abidjan-3d
npm install
npm run serve        # puis ouvrir http://localhost:8080
npm run build        # → dist/abidjan-3d.html : un seul fichier, s'ouvre par double-clic, hors ligne
```

## 📤 Exporter

- **Dans la page** (Chrome, Edge) : bouton « Exporter en MP4 » (WebCodecs via Mediabunny).
- **En ligne de commande** (FFmpeg + Chromium, 100 % libre) :

```bash
npm run export                          # mosaïque animée (respiration) → out/
node tools/export.mjs --camera vague    # mosaïque, vague diagonale
npm run export:slides                   # diaporama vertical 1080×1920
npm run check                           # contrôle zéro régression de la mosaïque
node tools/export.mjs --format slides --duration 1.5 --audio musique.mp3
```

| Option | Valeurs | Défaut |
|---|---|---|
| `--format` | `mosaic`, `slides` | `mosaic` |
| `--mode` | `3d`, `original` | `3d` |
| `--camera` | `respiration`, `vague`, `souris` | `respiration` |
| `--relief` | 0 → 0,35 | 0,2 (mosaïque) · 0,15 (diaporama) |
| `--duration` | secondes par vignette (diaporama) | 2,5 |
| `--crf` | 0 → 23 | 16 |
| `--chroma` | `420`, `444` | `420` |
| `--audio` | fichier son ajouté au MP4 | aucun |

## 🗂️ Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `src/app.js` | Le studio : formats, caméras, lecture, liste des quartiers, export navigateur. |
| `src/studio.js` | Moteur de rendu Three.js (mosaïque pixel exacte, vignettes 3D, diaporama). |
| `assets/abidjan.webp` | La planche d'origine, jamais modifiée. |
| `assets/tiles/*.webp` | Les 30 vignettes agrandies ×4 (≈ 1100×728). |
| `assets/depth-atlas.png`, `assets/meta.json` | Cartes de profondeur, grille, bandeaux, légendes. |
| `tools/prepare.py` | Découpe la grille, détecte les bandeaux, agrandit (Real-ESRGAN), calcule la profondeur. |
| `tools/export.mjs` | Export MP4 en ligne de commande, avec contrôle de fidélité. |
| `tools/build-standalone.mjs` | Fichier HTML unique et autonome. |

### Refaire la préparation (optionnel)

```bash
pip install onnxruntime numpy pillow
# Real-ESRGAN General x4v3 (ONNX, BSD-3) : https://huggingface.co/qualcomm/Real-ESRGAN-General-x4v3
# Depth Anything V2 Small (ONNX, Apache-2.0) : https://huggingface.co/onnx-community/depth-anything-v2-small
python tools/prepare.py assets/abidjan.webp real_esrgan_general_x4v3.onnx depth_anything_v2_small.onnx assets/
```

## 🆓 Outils libres et gratuits

Three.js (MIT) · Mediabunny (MPL-2.0) · FFmpeg + x264 (LGPL/GPL) · Playwright + Chromium (Apache-2.0/BSD) ·
Real-ESRGAN General x4v3 (BSD-3) · Depth Anything V2 Small (Apache-2.0) · ONNX Runtime (MIT).

Remarque : deux coquilles de l'image d'origine (« Trechville », « SOCOGİ ») sont conservées dans les pixels ;
la liste des quartiers du studio affiche « Treichville » et « SOCOGI ».
