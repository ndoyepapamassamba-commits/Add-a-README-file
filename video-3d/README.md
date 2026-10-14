# 🎬 « Ivrogne » — la vidéo recodée en HTML 3D, exportable en MP4

La vidéo TikTok « Ivrogne » (12,3 s, 1080×1920, 30 i/s) reconstruite en **page HTML/WebGL (Three.js)** :

- **Mode Original — zéro régression** : la page redessine chaque frame **au pixel près** à l'identique de la vidéo.
- **Mode Relief 3D** : la scène devient un vrai maillage 3D déformé par une **carte de profondeur par frame**
  (Depth Anything V2). La caméra peut tourner (souris / doigt), faire un travelling ou une orbite.
- **Sous-titres** optionnels (dialogues transcrits, style TikTok).
- **Export MP4** depuis la page (Chrome / Edge) **ou** en ligne de commande avec FFmpeg, 100 % outils libres.

## ✅ Zéro régression : mesuré, pas promis

Résultat de `npm run export` (mode Original), vérifié automatiquement :

| Contrôle | Résultat |
|---|---|
| Rendu HTML/WebGL vs frames source | **369 / 369 frames identiques au pixel près** |
| Résolution · cadence · frames · durée | 1080×1920 · 30 i/s · 369 · 12,30 s (identiques) |
| Audio | **identique au bit près** (AAC copié, jamais ré-encodé) |
| PSNR moyen / pire frame (après encodage H.264) | **52,3 dB / 50,7 dB** (invisible à l'œil au-delà d'environ 45 dB) |
| SSIM | **0,997** |

La seule perte possible vient de la compression H.264 finale (CRF 12 par défaut). Pour un master
strictement sans perte : `node tools/export.mjs --crf 0`.

> **Pourquoi les personnages ne sont pas « remodélisés » en code ?**
> Ce sont des rendus 3D générés par IA (style Pixar). Les refaire à la main en Three.js donnerait une
> copie approximative, donc de la régression. Ici la 3D est **reconstruite à partir des pixels
> d'origine** : on garde la qualité exacte de la vidéo et on y ajoute le relief.

## 🚀 Démarrage

Prérequis : [Node.js](https://nodejs.org) ≥ 18 et [FFmpeg](https://ffmpeg.org) (pour l'export en ligne de commande).

```bash
cd video-3d
npm install          # three, mediabunny, playwright-core (versions figées)
npm run serve        # puis ouvrir http://localhost:8080
```

Dans la page : **Lire**, basculer **Original / Relief 3D**, choisir la caméra, activer les sous-titres,
cocher **A/B** pour superposer la vidéo source, puis **Exporter en MP4**.

Raccourcis clavier : `Espace` lecture/pause · `←` `→` image par image.
URL directes : `?mode=3d&camera=orbite&relief=0.2&subs=1`.

## 📦 Fichier HTML autonome (un seul fichier)

```bash
npm run build        # → dist/ivrogne-3d.html (≈ 27 Mo)
```

Ce fichier contient tout : la vidéo, les cartes de profondeur, Three.js, Mediabunny et le studio.
Il s'ouvre par **double-clic**, sans serveur ni connexion Internet, et garde toutes les fonctions
(mode 3D, sous-titres, export MP4 dans Chrome ou Edge).

## 📤 Exporter en MP4

### 1. Depuis la page (Chrome, Edge)
Le bouton **Exporter en MP4** décode chaque frame (WebCodecs, via Mediabunny), la redessine avec
Three.js et la ré-encode en H.264. Le son d'origine est **copié tel quel**. Rien n'est envoyé sur
Internet : tout se passe dans le navigateur.

### 2. En ligne de commande (FFmpeg + Chromium, aucun logiciel propriétaire)

```bash
npm run export                                    # Original → out/ivrogne-original.mp4 + test de régression
npm run export:3d                                 # Relief 3D, caméra travelling
node tools/export.mjs --mode 3d --camera orbite --relief 0.2
node tools/export.mjs --subs                      # avec sous-titres
node tools/export.mjs --crf 0                     # master sans perte
```

| Option | Valeurs | Défaut |
|---|---|---|
| `--mode` | `original`, `3d` | `original` |
| `--camera` | `travelling`, `orbite`, `fixe` | `travelling` |
| `--relief` | 0 → 0,3 | 0,15 |
| `--subs` | (drapeau) | non |
| `--crf` | 0 (sans perte) → 23 | 12 |
| `--out` | chemin du MP4 | `out/…` |
| `--browser` | chemin d'un Chromium / Chrome | détection auto |

Chaîne : FFmpeg décode la source → la page Three.js (Chromium headless piloté par Playwright) rend chaque
frame → FFmpeg encode en H.264 (x264) et copie l'audio. Sans Chromium installé :
`npx playwright-core install chromium`.

### 3. Vérifier un export

```bash
npm run regression -- out/ivrogne-original.mp4
```

## 🗂️ Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Le studio : lecteur, modes, caméra, sous-titres, export. |
| `src/compositor.js` | Moteur de rendu Three.js (shaders, caméras, sous-titres), partagé par tous les exports. |
| `src/app.js` | Lecteur, caméra interactive, export navigateur (Mediabunny), mode rendu pour la CLI. |
| `assets/source.mp4` | La vidéo d'origine (images et son). |
| `assets/depth-atlas.png` · `depth-meta.json` | 369 cartes de profondeur (224×178) assemblées en atlas. |
| `tools/export.mjs` | Export MP4 en ligne de commande (Playwright + FFmpeg). |
| `tools/regression.mjs` | Test de non-régression (PSNR, SSIM, audio, durée…). |
| `tools/depth.py` | Régénère l'atlas de profondeur (Depth Anything V2, ONNX Runtime). |
| `tools/build-standalone.mjs` | Fabrique le fichier HTML autonome `dist/ivrogne-3d.html`. |
| `tools/serve.mjs` | Mini serveur local (gère les requêtes Range pour la vidéo). |
| `vendor/` | Three.js et Mediabunny copiés localement : la page marche hors-ligne. |

### Régénérer la profondeur (optionnel)

```bash
pip install onnxruntime numpy pillow
curl -L -o model.onnx https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx
python tools/depth.py assets/source.mp4 model.onnx assets/
```

## 🧾 Analyse de la vidéo source

| Temps | Plan | Dialogue |
|---|---|---|
| 0,00 – 2,10 s | La femme (robe rose, enceinte) crie sur l'homme ivre (chemise bleue, 2 bouteilles) | **Femme** : « Ivrogne, c'est comme ça que tu passes ton temps ? » |
| 2,18 – 4,30 s | Il la pointe du doigt avec sa bouteille | **Homme** : « Tais-toi, je suis déjà énervé contre moi-même. » |
| 4,42 – 5,62 s | Elle, mains sur les hanches | **Femme** : « Et cela pourquoi donc ? » |
| 5,72 – 9,10 s | Il se penche vers elle | **Homme** : « J'ai bu toute la journée pour t'oublier, et maintenant je te vois en double. » |
| 9,10 – 10,03 s | Chute : elle se prend le visage, il fixe la caméra | — |
| 10,03 – 12,30 s | Écran noir, emoji 😎 qui se balance | (son final) |

Format : plan paysage net (1080×860, y = 530 → 1390) sur fond flou agrandi, typique de TikTok.

## 🆓 Outils libres et gratuits utilisés

| Outil | Rôle ici | Licence |
|---|---|---|
| [Three.js](https://threejs.org) | Rendu WebGL 3D (maillage, caméras, shaders) | MIT |
| [Mediabunny](https://mediabunny.dev) | Lecture/écriture MP4 dans le navigateur (WebCodecs) | MPL-2.0 |
| [FFmpeg](https://ffmpeg.org) + x264 | Décodage, encodage H.264, mesures PSNR/SSIM | LGPL / GPL |
| [Playwright](https://playwright.dev) (`playwright-core`) | Pilote Chromium sans écran pour l'export CLI | Apache-2.0 |
| [Chromium](https://www.chromium.org) | Navigateur qui exécute la page pendant l'export | BSD |
| [Depth Anything V2 Small](https://github.com/DepthAnything/Depth-Anything-V2) | Carte de profondeur par frame (mode 3D) | Apache-2.0 |
| [ONNX Runtime](https://onnxruntime.ai) | Exécution du modèle de profondeur sur CPU | MIT |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (modèle Whisper) | Transcription des dialogues pour les sous-titres | MIT |
| [Node.js](https://nodejs.org) · [Python](https://www.python.org) | Scripts | MIT · PSF |

**Alternatives repérées** (pour aller plus loin) :
- [HyperFrames](https://silenceper.com/en/article/2026-05-02-hyperframes-html-video-rendering/) (HeyGen, Apache-2.0) : HTML + CSS + GSAP → MP4 via Chromium et FFmpeg, même principe que `tools/export.mjs`.
- [Motion Canvas](https://motioncanvas.io) / [Revideo](https://docs.re.video) (MIT) : animations en TypeScript rendues en vidéo.
- [Remotion](https://www.remotion.dev) : vidéo en React. Gratuit pour les particuliers et les petites équipes, licence payante pour les entreprises.
- [GSAP](https://gsap.com) : bibliothèque d'animation devenue 100 % gratuite (y compris les plugins) depuis le rachat par Webflow. Licence gratuite, mais pas open source.

Sources :
[HyperFrames (silenceper.com)](https://silenceper.com/en/article/2026-05-02-hyperframes-html-video-rendering/) ·
[HyperFrames (noqta.tn)](https://noqta.tn/en/blog/heygen-hyperframes-html-to-mp4-ai-agent-video-2026) ·
[Comparatif Remotion / Motion Canvas / Revideo (pkgpulse)](https://www.pkgpulse.com/guides/remotion-vs-motion-canvas-vs-revideo-programmatic-video-2026) ·
[Mediabunny](https://mediabunny.dev/guide/introduction) ·
[GSAP devient gratuit (Webflow)](https://webflow.com/blog/gsap-becomes-free) ·
[Licence standard GSAP](https://gsap.com/community/standard-license/)
