# 🎬 Skit Studio — moteur de génération massive de vidéos de sketches (9:16)

Application web **100 % navigateur** (aucun serveur) qui produit en masse des vidéos courtes de
dialogues satiriques au format TikTok / Reels / Shorts, dans le style de la vidéo de référence :
compilation de sketches question → punchline, images de personnages **animées** (bouche, mâchoire,
sourcils, clignements, tête, parallaxe 2.5D), sous-titres cinétiques à mots-clés colorés, emojis 3D,
cartes titre / réaction / outro, voix neuronales, export MP4 par lot (ZIP).

Ouvrez `index.html` (double-clic, ou servi par n'importe quel hébergeur statique : GitHub Pages,
Netlify, un téléphone Android avec Chrome…). Version mono-fichier : `skit-studio.standalone.html`.

---

## 1. Rétro-ingénierie de la référence (`tiktok_grok_v4.mp4`)

Mesures faites sur le fichier (ffprobe, détection de coupes, lecture image par image) :

| Élément | Observation | Reproduction dans Skit Studio |
|---|---|---|
| Format | 720 × 1280, 30 i/s, 62 s, AAC stéréo | 1080 × 1920 ou 720 × 1280, 24–60 i/s |
| Structure | 5 sketches, **cycle de 12,4 s** : réaction 3,2 s → titre 2,0 s → plan large 5,0 s → gros plan 2,2 s | `timing` du projet (réglable), construit par `20-timeline.js` |
| Accroche | sketch 1 à froid, sans carte | option `hookFirst` |
| Carte titre | fond violet `#2b1b4f`, « SKETCH n/5 » en jaune, titre blanc, gros emoji 3D qui rebondit | `Painter.drawTitleCard` |
| Carte réaction | emoji 3D géant, rayons jaunes qui tournent, emojis flottants 🤣 🎉 | `Painter.drawReactionCard` |
| Outro | « LA SUITE DEMAIN / ABONNE-TOI 🎉 » | `layout.outro` |
| Sous-titres | MAJUSCULES, Montserrat 900, blanc + contour noir, 1–3 mots-clés jaunes en fin de phrase, emoji réaction à droite, tiers bas | `Painter.drawSubtitle` (modes phrase / mot par mot / karaoké) |
| Visuels | personnages 3D type Pixar, plan large de situation puis gros plan de réaction | images IA + **moteur d'animation maison** |
| Audio | voix synthétiques par personnage, lit musical, rires | Piper / API, mixage hors ligne, SFX synthétisés |

## 2. Architecture

```
Script (JSON / CSV / texte / gabarits / LLM)        10-script.js, 95-ai.js
   │
   ├─ Voix par réplique (Piper navigateur, API…)     40-voices.js, 30-audio.js
   │     └─ durée mesurée + enveloppe d'amplitude
   ├─ Images par plan (banque IndexedDB, Pollinations, API) 65-imagegen.js
   │     └─ visages (MediaPipe 478 pts) → maillage Delaunay   55-facerig.js
   │     └─ profondeur (synthétique ou Depth Anything)        56-depth.js
   ▼
Timeline datée (segments : line / title / reaction / outro)   20-timeline.js
   ▼
Peintre déterministe  t → image                                70-painter.js
   ├─ plans animés : déformation de maillage + cavité buccale + parallaxe WebGL   60-animator.js, 57-warp.js
   ├─ cartes, sous-titres, emojis 3D Fluent                     50-assets.js
   ▼
Encodeur : WebCodecs + mp4-muxer (H.264/VP9/AV1 + AAC/Opus) ou MediaRecorder   80-encoder.js
   ▼
Lot : variantes × file d'attente × ZIP                           90-batch.js, 85-zip.js
```

Tous les modules sont des scripts classiques (pas de modules ES) pour fonctionner en `file://`.
Chaque module expose `SkitStudio.<Nom>` ; les modules purs exportent aussi `module.exports`
pour les tests Node.

### 2.1 Le moteur d'animation (ce qui remplace la génération vidéo IA)

Objectif : partir d'**une image fixe** (générée par IA ou importée) et produire une animation
crédible, déterministe et gratuite, sans GPU distant.

1. **Détection** — MediaPipe Face Landmarker (WASM/GPU, chargé depuis jsDelivr, exécuté
   localement) renvoie 478 points par visage. Sans réseau ou sans visage détecté, un gabarit
   facial paramétré par trois ancres (yeux, bouche) prend le relais.
2. **Maillage** — ~150 points de contrôle (ovale, lèvres internes/externes, paupières, sourcils,
   nez, joues, front) + un anneau proche (cheveux/cou, suit à 55 %) + un anneau lointain et les
   bords de l'image (statiques). Triangulation de Delaunay (Bowyer-Watson). Seuls les triangles
   touchant un point mobile sont redessinés (~200 `drawImage` affines par image).
3. **Pose** à chaque instant :
   * **mâchoire / lèvres** : ouverture = enveloppe RMS de l'audio de la réplique (lissée sur
     3 images) × visème dérivé du texte (A ouvert, E étiré, O arrondi, fermeture sur m/b/p) ;
   * **cavité buccale** : dégradé sombre, dents supérieures, langue, dessinés dans le polygone
     des lèvres internes déformé, avec fondu selon l'ouverture ;
   * **émotions** : cibles de sourcils (haut/bas, intérieur), ouverture des yeux, plissement,
     sourire asymétrique (smug) ; « coup » d'expression au début d'une punchline ;
   * **clignements** pseudo-aléatoires déterministes (graine = clé d'image + index du visage) ;
   * **tête** : rotation autour d'un pivot au cou + translation, hochements synchronisés sur la
     parole ; l'auditeur bouge moins et réagit (choqué) pendant la punchline.
4. **Caméra 2.5D** — carte de profondeur (synthétique : visages/buste proches, fond lointain ;
   ou IA : Depth Anything v2 small via Transformers.js) et shader WebGL de déplacement :
   zoom Ken Burns, panoramique vers le locuteur, parallaxe, coup de zoom à la coupe, secousse sur
   la punchline. Repli Canvas 2D sans WebGL.

5. **Images clés d'expression (morphing)** — option « n images superposées » : à partir de
   l'image de base, OpenRouter (Gemini Image) produit des éditions **pixel-alignées** du même
   plan (même décor, même cadrage) : bouche ouverte réelle (dents, langue), et en option une
   expression forte pour la fin des punchlines. MediaPipe relève les 478 points de chaque
   image clé ; le moteur déforme base et image clé vers une géométrie commune (interpolée)
   puis les fond. Le poids « bouche » suit l'enveloppe de la voix image par image, le poids
   « expression » monte à la fin de la réplique. Si une édition décale le cadrage (visage
   déplacé de plus de 12 % de sa largeur), elle est rejetée. Coût mesuré : ≈ 0,039 $ et
   ≈ 8 s par image clé, mises en banque et réutilisées par toutes les variantes.

Tout est fonction de `t` : l'aperçu, l'export WebCodecs et l'export MediaRecorder produisent
exactement les mêmes images.

### 2.2 Algorithme de génération en masse

```
banque = sketches du projet | gabarits(N, graine) | LLM(N, thème)
pour n de 1 à count :
    choisir perVideo sketches (parcours glissant d'une permutation à graine, sans doublon de jeu)
    faire tourner l'accroche (n mod k), thème = themes[n mod |themes|], emojis = sets[n mod |sets|]
    variante = normalise(clone(projet) + sketches + thème)
file d'attente séquentielle : voix (cache par texte+voix) → images (banque par prompt+graine)
                              → timeline → mixage → encodage → résultat
ZIP (STORE) de tous les fichiers
```

Les images sont indexées par `hash(prompt, graine, fournisseur, taille)` ; le prompt est
déterministe (style + fiche personnage + décor + émotion + plan). Deux variantes qui partagent un
sketch partagent donc ses images et ses voix : seule la première vidéo paie la génération.

### 2.3 Format de script

```
# LE BÉBÉ 😱
@scene chambre
A: Le bébé ne me *ressemble pas* ! | 🔥
B: Justement, je cherche à qui il *ressemble*. | 😜 [close] (shocked)
---
# L'ANNIVERSAIRE 😱
A: Tu as oublié notre anniversaire de *mariage* !
B: Moi j'essaie d'oublier le *mariage même*.
```

* `*mots*` = mots-clés colorés (sinon : les 2 derniers mots) ; `| emoji` = emoji réaction ;
  `[wide|close]` = plan ; `(emotion)` = angry, happy, sad, shocked, smug, confused, neutral.
* CSV : colonnes `sketch,title,title_emoji,scene,speaker,text,emoji,shot,emotion`.
* JSON : projet complet, tableau de sketches, ou un sketch (`{ title, emoji, scene, lines:[…] }`).

## 3. Fournisseurs d'IA (tous optionnels, gratuits par défaut)

| Besoin | Par défaut (gratuit, sans clé) | Avec clé |
|---|---|---|
| Images | **Pollinations** classique (`image.pollinations.ai`, 1 image / 45 s par IP, filigrane rogné automatiquement, qualité et respect du prompt limités) | **OpenRouter** (Gemini Image « Nano Banana », GPT Image : images propres, sans filigrane, 3–8 s, ≈ 0,03 $ l'image — recommandé), Pollinations `gen.pollinations.ai` (Flux, Grok Imagine…), toute API `/images/generations` compatible OpenAI |
| Voix | **Piper** (vits-web) neuronal dans le navigateur : `fr_FR-siwis-medium`, `fr_FR-tom-medium`, `fr_FR-gilles-low`… (≈ 60 Mo par voix, puis hors ligne) | Pollinations (OpenAI TTS, ElevenLabs, Microsoft, Kokoro), API `/audio/speech` compatible OpenAI, ElevenLabs direct |
| Scripts | **Pollinations** texte (`text.pollinations.ai/openai`, 1 requête / 30 s) | Pollinations avec clé, OpenRouter, Groq, Mistral, serveur local (toute API `/chat/completions`) |
| Visages | MediaPipe Face Landmarker (local) | — |
| Profondeur | synthétique (instantanée) | Depth Anything v2 (Transformers.js, local, WebGPU conseillé) |
| Emojis 3D | Fluent Emoji (Microsoft, PNG via jsDelivr), repli police système | — |

Les clés sont saisies dans l'onglet **Réglages** et restent dans le `localStorage` du navigateur.

## 3 bis. Coûts (relevés le 2026-11-07)

**Images — mesuré via OpenRouter (`usage.cost`)** : `google/gemini-2.5-flash-image` ≈ **0,039 $**
par image (768 × 1344, 4–8 s) ; `google/gemini-3.1-flash-lite-image` ≈ 0,034 $. Une image clé
d'expression est une édition au même prix (≈ 0,039 $, ≈ 8 s).

| Vidéo de 5 sketches (10 répliques) | Images | Coût |
|---|---|---|
| Images de base seules | 10 | ≈ 0,39 $ |
| + 1 image clé par plan (bouche réelle) | 20 | ≈ 0,78 $ |
| + expression forte sur les 5 punchlines | 25 | ≈ 0,98 $ |
| Variante d'un lot réutilisant des sketches déjà générés | 0 | 0 $ (banque) |

Formule : **n images × prix unitaire** ; l'onglet *Images IA* affiche l'estimation avant génération.
Pollinations sans clé : 0 $, mais 1 image / 45 s et une qualité nettement inférieure.

**Alternatives moins chères (relevé de prix, non intégrées, qualité à valider)** :
Seedream 5.0 Flash ≈ 0,019 $ (Runware, Pollinations) ; Qwen-Image-Edit ≈ 0,003 $ (Runware) ;
FLUX.2 klein ≈ 0,0008 $ (Runware) ; FLUX.1 schnell ≈ 0,0006 $ (Cloudflare, pas de CORS).

**Animation hébergée (image → vidéo), pour un clip de 5 s** : Wan 2.2 Fast 480p ≈ 0,05 $
(Pollinations, WaveSpeed) ; Seedance 1 Pro Fast ≈ 0,05 $ (480p) / 0,10 $ (720p) ;
P-Video-2-Pro-Avatar, lip-sync sur votre audio, ≈ 0,10 $ (480p, Runware/Segmind) ;
InfiniteTalk ≈ 0,15 $ (480p, WaveSpeed) ; OmniHuman 1.5 ≈ 0,60–0,80 $. Aucun palier gratuit.
Le moteur local (maillage + images clés) ne coûte que les images.

## 4. Utilisation

1. **Scripts** : chargez l'exemple, importez un fichier, générez par gabarits (40 gabarits × slots
   prénoms/lieux/sommes) ou par IA.
2. **Personnages & voix** : nom, couleur, **apparence** (injectée dans les prompts), voix (Piper par
   défaut), vitesse, hauteur, bouton *Tester la voix*.
3. **Images IA** : style (**3D dessin animé africain** par défaut, Pixar 3D, réaliste, anime, BD, pâte à modeler), fournisseur, graine ;
   *Générer / vérifier toutes les images* (ou importez vos propres images par réplique).
4. **Studio** : thème, sous-titres, structure, rythme, musique de fond, effets.
5. **Préparer** (voix + images + mixage) puis ▶️ pour l'aperçu synchronisé.
6. **Export & lot** : export MP4 de la vidéo courante, ou variantes × N → rendu en lot → ZIP.

Durées indicatives : voix Piper ≈ 2–5 s par réplique (CPU) ; image Pollinations gratuite 45 s ;
encodage WebCodecs ≈ 3–10 images/s à 1080p selon la machine (un GPU accélère la parallaxe).

## 5. Export

* **WebCodecs + mp4-muxer** (Chrome, Edge, Android Chrome) : hors temps réel, H.264 si disponible
  (Linux/Chromium sans codecs propriétaires : VP9 ou AV1 dans MP4), audio AAC ou Opus.
* **MediaRecorder** (repli, Firefox/Safari) : temps réel, MP4 ou WebM selon le navigateur ;
  l'onglet doit rester visible.
* ZIP sans compression (les vidéos le sont déjà), < 4 Go, écrit en JS pur.

## 6. Tests

```bash
node --test skit-studio/tests/core.test.js skit-studio/tests/facerig.test.js   # 17 tests purs
node skit-studio/tests/e2e.js /tmp/skit-e2e   # Chromium headless : page → voix Piper → export MP4 → ffprobe
```

Le test e2e attend deux images `wide.jpg` et `close.jpg` dans `/tmp/skit-e2e/fixtures`.

## 7. Guide d'intégration et d'extension

### Ajouter un fournisseur de voix
Dans `js/40-voices.js`, ajoutez une entrée à `Voices.PROVIDERS` et un `case` dans `Voices.synthLine`
qui renvoie un `AudioBuffer` (utilisez `Audio.decode(arrayBuffer)`). La timeline, l'enveloppe de
bouche et le mixage suivent automatiquement.

### OpenRouter (recommandé pour des images propres)
`POST https://openrouter.ai/api/v1/chat/completions` avec `{"model":"google/gemini-2.5-flash-image","messages":[{"role":"user","content":prompt}],"modalities":["image","text"],"image_config":{"aspect_ratio":"9:16"}}` ;
la réponse contient `choices[0].message.images[0].image_url.url` (data-URL base64). Implémenté dans
`fetchOpenRouter` (`js/65-imagegen.js`) ; la clé se saisit dans Réglages → OpenRouter et sert aussi au LLM.

### Ajouter un fournisseur d'images
Dans `js/65-imagegen.js`, ajoutez une fonction `fetchX(prompt, seed, w, h, settings, signal) → Blob`
et branchez-la dans `ImageGen.getOrGenerate`. La banque et le moteur d'animation sont inchangés.

### Vidéo IA externe (image → vidéo) à la place du moteur maison
`gen.pollinations.ai` (avec clé) expose `GET /video/{prompt}?model=x-ai/grok-imagine-video-1.5&image=URL&duration=5`
et `reference_audios=URL` pour les modèles audio-conditionnés (Seedance 2.0, Wan 3.0, MiniMax H3) ;
les fichiers locaux se publient d'abord via `POST https://media.pollinations.ai/upload` (champ `file`).
Pour l'intégrer : générer le clip par réplique, le décoder dans un `<video>` et, dans
`Painter.drawLine`, dessiner `video` (positionné sur `lt`) à la place de `Animator.renderShot`.
Les cartes, sous-titres et le lot restent identiques. (Non testé ici : nécessite une clé payante.)

### Lip-sync IA (Wav2Lip, SadTalker, MuseTalk, HeyGen…)
Même principe : un clip par réplique (image + audio de la réplique) → `<video>`. Les Spaces
Hugging Face Gradio exposent `/call/predict` ; prévoir file d'attente et délais.

### ffmpeg.wasm (transcodage, filtres, concaténation)
```js
import { FFmpeg } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm';
const ff = new FFmpeg(); await ff.load({ coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js' });
await ff.writeFile('in.webm', new Uint8Array(await blob.arrayBuffer()));
await ff.exec(['-i', 'in.webm', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', 'out.mp4']);
const mp4 = new Blob([await ff.readFile('out.mp4')], { type: 'video/mp4' });
```
Utile pour convertir un WebM MediaRecorder en MP4 H.264 sur Firefox, ou pour ajouter un LUT.
Coût : ≈ 30 Mo à télécharger, encodage lent (mono-thread sans isolation cross-origin).

### Rendu côté serveur ou Android
Le peintre est pur Canvas 2D + WebGL : il tourne tel quel dans Chrome Android (WebCodecs inclus),
dans Playwright/Puppeteer headless (voir `tests/e2e.js`) et peut être piloté par une CI pour
produire des centaines de vidéos (une page, une boucle sur les variantes, `App.renderProject`).

## 8. Limites connues

* Le moteur anime une image fixe : pas de changement de pose du corps ni de déplacement dans le
  décor ; il déforme la bouche et le visage, il ne synthétise pas de nouveaux pixels (contrairement
  à un modèle vidéo). Pour un rendu « vidéo IA » complet, branchez un fournisseur image → vidéo.
* Web Speech (voix du navigateur) n'est pas capturable : aperçu seulement.
* Pollinations gratuit limite à une image par 45 s et par adresse IP.
* Safari : pas de WebCodecs → MediaRecorder temps réel (WebM/MP4 selon version).
