# Créer et préparer les personnages de la troupe sur CPU : génération d'image, détourage, repères, découpe en rig, poses et bouches cohérentes (banc du 16/10/2026)

Conventions :
- **[mesure]** : mesure faite dans ce conteneur le 16/10/2026. Machine : 4 vCPU « Intel Xeon Processor @ 2.10GHz »
  (AVX-512 et AMX présents), 15 Go de RAM, sans GPU. **3 threads** pour tous les calculs lourds, un seul calcul lourd à la fois.
- Scripts du banc (écrits pour ce banc, non versionnés, **aucun code tiers copié**) :
  `scratchpad/bench-perso/scripts/` → `detourage.py`, `reperes.py`, `autodecoupe.py`, `recadrer_recoller.py`,
  `yeux_cartoon.py`, `klein_chaine.sh`, `planche.py`, `mesure.py` (repris de `studio-troupe/banc-cpu/scripts/mesure.py` :
  temps mural et pic de RAM `ru_maxrss` des enfants).
  `scratchpad` = `/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad`.
- Sorties (images, journaux, JSON), **hors dépôt** : `scratchpad/bench-perso/out/`. Poids : `scratchpad/modeles/`
  (9,4 Go pour la génération + 0,8 Go pour la vision, sommes SHA-256 dans `modeles/SHA256SUMS.txt`).
- Personnage testé : **MODOU**, description **verbatim** de la bible (`studio-troupe/troupe/troupe.json`) :
  « thin lanky West-African man, short hair, thin moustache and goatee, faded worn green t-shirt, brown cargo trousers
  rolled at the ankle, black sandals », plus `details.face` « expressive tired eyes » et `age` « 35 ans ».
  Prompt complet (`bench-perso/scripts/prompt_modou.txt`) :
  ```
  3D animated cartoon character, Pixar style, full body shot, front view, standing straight in a neutral A-pose with both
  arms held slightly away from the body, hands open, feet slightly apart. The character is a thin lanky West-African man,
  35 years old, short hair, thin moustache and goatee, expressive tired eyes, faded worn green t-shirt, brown cargo
  trousers rolled at the ankle, black sandals. Whole body visible from head to feet, centered, plain flat light grey
  background, even soft studio lighting, character reference sheet, vibrant saturated colours.
  ```

---

## Q1. Peut-on générer un personnage de la troupe sur ce CPU, gratuitement, avec des poids commercialement utilisables ? Z-Image-Turbo contre FLUX.2 [klein] 4B

### Takeaway
**Oui.** Les deux modèles Apache-2.0 tournent dans le `stable-diffusion.cpp` déjà compilé et donnent un MODOU en pied,
9:16 (576×1024), propre et fidèle à la bible :
- **Z-Image-Turbo** (6B, GGUF Q4_K) : **30,0 min**, pic **9,77 Go**. Le meilleur rendu « Pixar » : grosse tête,
  yeux fatigués très expressifs.
- **FLUX.2 [klein] 4B** (GGUF Q4_0) : **14,6 min**, pic **7,07 Go**. Une vraie A-pose, mais un style plus réaliste et une
  tête plus petite.

C'est trop lent pour la vidéo, mais **largement suffisant pour fabriquer une fois la planche de chaque personnage** :
54 personnages × 1 image ≈ 13 h de CPU en klein, ou 27 h en Z-Image, sur une nuit ou deux.

### Cited Findings
**Licences et poids (vérifiés via l'API Hugging Face, révisions épinglées)**
- Z-Image-Turbo : 6 milliards de paramètres, « only 8 NFEs », `guidance_scale=0.0`, licence Apache-2.0. La variante
  d'édition **Z-Image-Edit est toujours « To be released »** —
  [fiche Tongyi-MAI/Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo).
- GGUF utilisé : `leejet/Z-Image-Turbo-GGUF` @ `c61c0e42`, licence apache-2.0, `z_image_turbo-Q4_K.gguf`
  (3 864 250 304 o, sha256 `14b375ab4f226bc5…`) — [dépôt HF](https://huggingface.co/leejet/Z-Image-Turbo-GGUF).
  D'autres quantifications existent : Q3_K 3,14 Go, Q8_0 6,58 Go (même dépôt).
- L'encodeur de texte de Z-Image-Turbo est **Qwen3-4B de base**. Les deux premiers fragments de
  `text_encoder/model-0000x-of-00003.safetensors` ont le même SHA-256 LFS (`328a91d3…`, `6cd087b3…`) que
  `Qwen/Qwen3-4B`, et non que `Qwen3-4B-Instruct-2507` (`75311d91…`) —
  [API Z-Image-Turbo](https://huggingface.co/api/models/Tongyi-MAI/Z-Image-Turbo?blobs=true),
  [API Qwen3-4B](https://huggingface.co/api/models/Qwen/Qwen3-4B?blobs=true). La doc de sd.cpp conseille pourtant
  l'Instruct-2507 ([docs/z_image.md](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/z_image.md)).
  Nous avons pris **un seul fichier pour les deux modèles** : `unsloth/Qwen3-4B-GGUF` @ `22c9fc8a`, `Qwen3-4B-Q4_K_M.gguf`
  (2 497 281 312 o, sha256 `f6f85177…`), apache-2.0 — [dépôt HF](https://huggingface.co/unsloth/Qwen3-4B-GGUF).
- VAE de Z-Image : `Comfy-Org/z_image_turbo` @ `6fc90a3b`, `split_files/vae/ae.safetensors` (335 304 388 o,
  sha256 `afc8e282…`), apache-2.0. Ce fichier est identique, octet pour octet, au `ae.safetensors` de FLUX.1-schnell
  (apache-2.0) — [API Comfy-Org/z_image_turbo](https://huggingface.co/api/models/Comfy-Org/z_image_turbo?blobs=true),
  [API FLUX.1-schnell](https://huggingface.co/api/models/black-forest-labs/FLUX.1-schnell?blobs=true).
- FLUX.2 [klein] 4B : « licensed under the Apache 2.0 », « Open weights available for commercial use ». Un seul modèle
  unifié fait le texte → image et l'**édition multi-références**. Il tient dans environ 13 Go de VRAM —
  [fiche black-forest-labs/FLUX.2-klein-4B](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B).
  GGUF : `leejet/FLUX.2-klein-4B-GGUF` @ `3b1f5a9d`, `flux-2-klein-4b-Q4_0.gguf` (2 460 378 560 o, sha256
  `d1023499…`), apache-2.0 — [dépôt HF](https://huggingface.co/leejet/FLUX.2-klein-4B-GGUF).
- VAE de klein : `black-forest-labs/FLUX.2-small-decoder` @ `a3efc24f`, `full_encoder_small_decoder.safetensors`
  (249 519 092 o, sha256 `ea4273f0…`), apache-2.0. La doc de sd.cpp le cite comme VAE alternatif. Nous évitons ainsi le VAE
  du dépôt FLUX.2-dev — [API HF](https://huggingface.co/api/models/black-forest-labs/FLUX.2-small-decoder?blobs=true),
  [docs/flux2.md](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/flux2.md).
- **Pièges de licence de la même famille** :
  - FLUX.2 [klein] **9B** : `flux-non-commercial-license`
    ([API HF](https://huggingface.co/api/models/black-forest-labs/FLUX.2-klein-9B)) ;
  - **FLUX.3 Image Klein** (dépôt créé le 13/10/2026) : `flux-kommunity-license`, pas Apache
    ([API HF](https://huggingface.co/api/models/black-forest-labs/flux-3-image-klein)).
  
  À exclure tous les deux, même si sd.cpp les prend en charge (`docs/flux3.md`).
- stable-diffusion.cpp : licence MIT ([LICENSE](https://github.com/leejet/stable-diffusion.cpp/blob/master/LICENSE)).
  Binaire déjà compilé : commit `8cd731e7` (« master-968 »), avec AVX-512, AMX et OpenMP (voir
  `studio-troupe/banc-cpu/README.md`).

**[mesure] Commandes exactes**
```bash
S=<scratchpad>; SD=$S/banc-cpu/sdcpp/build/bin/sd-cli; M=$S/modeles; P="$(cat $S/bench-perso/scripts/prompt_modou.txt)"
# Z-Image-Turbo
python3 -I mesure.py $SD --diffusion-model $M/z_image_turbo-Q4_K.gguf --vae $M/ae.safetensors --llm $M/Qwen3-4B-Q4_K_M.gguf \
  -p "$P" --cfg-scale 1.0 --steps 8 -W 576 -H 1024 -s 42 -t 3 -v -o zimg_modou_576x1024_s42.png
# FLUX.2 [klein] 4B
python3 -I mesure.py $SD --diffusion-model $M/flux-2-klein-4b-Q4_0.gguf --vae $M/flux2_full_encoder_small_decoder.safetensors \
  --llm $M/Qwen3-4B-Q4_K_M.gguf -p "$P" --cfg-scale 1.0 --sampling-method euler --steps 4 -W 576 -H 1024 -s 42 -t 3 -v \
  -o k1_t2i_576x1024.png
```

**[mesure] Résultats (576×1024, 3 threads, graine 42)**

| | Z-Image-Turbo Q4_K | FLUX.2 [klein] 4B Q4_0 |
|---|---|---|
| Poids chargés en RAM (log `total params memory size`) | 6 221 Mo (texte 2 376 + DiT 3 685 + VAE 160) | 4 841 Mo (texte 2 376 + DiT 2 346 + VAE 119) |
| Encodage du texte (Qwen3-4B) | 9,5 s | 21,5 s (*) |
| Diffusion | 8 pas, **216 s/pas**, 1 726 s | 4 pas, **196 s/pas**, 785 s |
| Décodage VAE | 61 s (tampon 3,74 Go) | 66 s (tampon 2,81 Go) |
| **Total mural** | **1 799,5 s = 30,0 min** | **873,5 s = 14,6 min** |
| **Pic RAM** | **9,77 Go** | **7,07 Go** |
| CPU utilisateur | 5 242 s | 2 534 s |

(*) Pendant l'encodage du texte de klein, nos scripts légers (planches, découpe) tournaient sur le 4ᵉ cœur.

Remarques sur ces mesures :
- Un pas de klein 4B coûte presque autant qu'un pas de Z-Image 6B à cette taille. Le gain de klein vient surtout du
  nombre de pas : 4 contre 8.
- Le **décodage VAE** est le pic de RAM des deux modèles, à 2,8–3,7 Go de tampon. La doc de sd.cpp signale aussi un mode
  `--taesd` (décodeur rapide) pour les aperçus.

**Qualité, jugée à l'œil** (`out/zimg_modou_576x1024_s42.png`, `out/klein/k1_t2i_576x1024.png`, planche `out/planche_generation.jpg`)
- **Z-Image** :
  - Bible respectée point par point : homme mince et dégingandé, cheveux courts, fine moustache et bouc, yeux fatigués
    aux paupières lourdes, t-shirt vert délavé, usé et effiloché en bas, cargo marron **retroussé à la cheville**, sandales
    noires.
  - Style Pixar net : tête large, nez rond, grandes oreilles.
  - Fond gris clair uni, avec une **ombre de contact** sous les pieds.
  - Défaut : les bras pendent près du corps. Ce n'est pas une vraie A-pose, même si un espace reste visible entre le bras
    et le torse.
- **klein** :
  - **Vraie A-pose**, avec les bras nettement écartés : c'est idéal pour la découpe.
  - Cargo retroussé à mi-mollet plutôt qu'à la cheville. T-shirt taché, avec poche.
  - Proportions plus réalistes et tête plus petite : moins « Pixar ». Cela rejoint la plainte « personnage irréel » dans
    l'autre sens : le cartoon de Z-Image est plus séduisant.
  - Fond uni avec une ombre douce.

### Inferences
- **Choix par défaut proposé** : **Z-Image-Turbo pour la planche de référence** (style), puis **klein pour les variantes
  éditées** (Q5). klein est le seul des deux à savoir éditer avec une image de référence, et Z-Image-Edit n'est pas sorti.
- **Coût en jetons** (déduit des mesures, à vérifier sur d'autres tailles) : à 3 threads, un pas coûte environ 0,09 s par
  jeton d'image pour Z-Image et 0,085 s pour klein à 2 304 jetons (576×1024/16²). Une image de 640×1152 (2 880 jetons)
  coûterait donc environ +25 % ou plus, à cause de l'attention.
- **A-pose** : le prompt seul ne suffit pas avec Z-Image. La planche « neutre » doit donc être vérifiée automatiquement
  (Q3) : angle bras-torse ≥ 12° et espace bras-torse visible dans l'alpha, sinon on régénère avec une autre graine. Autre
  voie : générer avec klein puis transférer le style, ce qui n'a pas été testé.
- **Budget nuit** : 54 planches × 30 min ≈ 27 h de Z-Image à 3 threads. C'est faisable en deux nuits, mais **une seule
  graine par personnage** : choisir plusieurs graines multiplie le temps. Mieux vaut générer d'abord en 288×512, à un
  quart du coût environ (non mesuré), choisir la graine, puis régénérer en 576×1024.

### Gaps
- Une seule graine et un seul personnage. Aucune mesure de variance entre graines, ni de taux d'échec de l'A-pose.
- Pas de mesure avec 4 threads libres, ni en Q3_K ou Q8_0. Pas de test de `--vae-tiling`, de `--taesd` ni de la
  génération en 288×512 suivie d'une montée en résolution.
- Le gros plan du visage n'a **pas été généré en texte → image** (30 min de plus). Nous avons utilisé à la place le
  recadrage du plein pied, monté de 219 px à 512 px (Q5).
- **Droits sur les sorties** : les fiches Apache-2.0 ne disent rien de plus sur les images produites. La licence Apache
  porte sur les poids. Aucune clause ne restreint les sorties, mais aucune phrase explicite ne les « libère » non plus,
  contrairement à la fiche Wan citée dans `banc-cpu/README.md`.

---

## Q2. Détourage sur CPU : quel modèle permissif, à quel coût, avec quelle qualité sur un cartoon ?

### Takeaway
Sur un personnage généré sur fond uni, **ISNet-anime** (Apache-2.0) suffit : **1,56 s et 0,92 Go**, avec des bords
nets et l'espace bras-torse conservé. Son masque recouvre celui de BiRefNet-lite à **IoU 0,993**. BiRefNet-lite (MIT)
n'apporte rien de visible ici et coûte **12,6 s et 6,5 Go** : à réserver aux planches avec décor. U2Net est flou (entrée
320 px). Notre clé de fond plat, en code pur, échoue à cause de l'**ombre de contact**.

### Cited Findings
**Licences**
- BiRefNet : MIT, « Copyright (c) 2024 ZhengPeng » — [LICENSE](https://github.com/ZhengPeng7/BiRefNet/blob/main/LICENSE).
  ONNX `BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx` tiré de la release v1 du dépôt (224 005 088 o, sha256 `56000243…`).
- anime-segmentation (ISNet-anime) : Apache-2.0 — [LICENSE](https://github.com/SkyTNT/anime-segmentation/blob/main/LICENSE).
  Données d'entraînement : « a combined dataset of AniSeg and character_bg_seg_data », nettoyé avec DeepDanbooru puis à la
  main. **La licence de ce jeu de données n'est pas indiquée** —
  [README](https://github.com/SkyTNT/anime-segmentation). ONNX `isnet-anime.onnx` tiré de la release v0.0.0 de rembg
  (176 069 933 o, sha256 `f15622d8…`).
- U²-Net : Apache-2.0 — [LICENSE](https://github.com/xuebinqin/U-2-Net/blob/master/LICENSE). DIS (ISNet général) :
  Apache-2.0 — [LICENSE](https://github.com/xuebinqin/DIS/blob/main/LICENSE.md).
- rembg, qui sert d'emballage et héberge les ONNX : MIT — [LICENSE](https://github.com/danielgatis/rembg/blob/main/LICENSE.txt).
  **Nous ne l'utilisons pas** : notre script appelle onnxruntime directement.
- Autres modèles MIT non testés : BEN2 ([LICENSE](https://github.com/PramaLLC/BEN2/blob/main/LICENSE)) et InSPyReNet
  ([LICENSE](https://github.com/plemeri/InSPyReNet/blob/main/LICENSE)).
- Seul point de comparaison publié trouvé : BiRefNet Swin-T ONNX en 1024×1024 prend « environ 4,32 s » sur le CPU d'un
  Apple M1 Max. C'est un billet de blog, sur une seule machine —
  [DEV Community](https://dev.to/kiarina/removing-a-portrait-background-with-birefnet-onnx-on-cpu-gbj).

**[mesure] Commande et résultats** (`detourage.py`, onnxruntime 1.31.0 CPU, 3 threads intra-op, arène mémoire désactivée)
```bash
python -I detourage.py $S/modeles/vision out/zimg_modou_576x1024_s42.png out/detourage 3 <methode>
```

| Méthode | Entrée | Chargement | Inférence (2ᵉ appel) | Pic RSS du processus | Opaque | Semi-transparent |
|---|---|---|---|---|---|---|
| Clé de fond plat (la nôtre) | 576×1024 | — | 0,33 s | 0,11 Go | 22,7 % | 0,8 % |
| U2Net | 320² | 0,63 s | 0,49 s | 0,56 Go | 18,9 % | 3,2 % |
| **ISNet-anime** | 1024² | 1,06 s | **1,56 s** | **0,92 Go** | 18,9 % | 1,5 % |
| BiRefNet-lite (Swin-T) | 1024² | 4,91 s | 12,58 s | **6,49 Go** | 19,0 % | 1,4 % |

- **IoU des masques binaires** : ISNet-anime / BiRefNet-lite **0,993** ; U2Net / BiRefNet-lite 0,989 ; clé de fond plat /
  modèles 0,83.
- **Incident** : lors d'un premier essai, pendant que Z-Image tournait (6,5 Go), BiRefNet-lite a été **tué par l'OOM**
  du cgroup à 7,2 Go RSS. Il faut donc ordonnancer : jamais BiRefNet en même temps qu'un sd-cli.
- **Inspection à l'œil** (zoom ×3 sur fond bleu : main, sandale, aisselle ; `out/zoom_detourage.jpg`) :
  - ISNet-anime et BiRefNet-lite : bords nets, doigts séparés, espace bras-torse ouvert, sans liseré gris.
  - U2Net : halo flou d'environ 3 px autour de la main et du pied.
  - Clé de fond plat :
    - bords crénelés ;
    - l'**ombre sous les sandales** et la bande de sol au bas de l'image sont gardées comme personnage ;
    - l'espace **entre les jambes** reste gris, parce que l'ombre ferme la région et la coupe du bord de l'image.

### Inferences
- **Défaut retenu** : ISNet-anime. BiRefNet-lite sert de **second avis** quand l'IoU avec ISNet tombe sous 0,98, et pour
  les planches de l'utilisateur sur décor.
- **Les ombres de contact** font échouer toute clé couleur. Une clé « invariante aux ombres » (on ignore la baisse de L*)
  effacerait aussi les **sandales noires**, qui sont neutres comme l'ombre. Le détourage appris est donc nécessaire.
  L'ombre au sol, elle, est **re-synthétisée par notre moteur** (ombre de contact procédurale sous chaque pied), ce qui
  est plus cohérent avec le décor que l'ombre peinte.
- **Décontamination des bords** (dans `detourage.py`) : `F = (I − (1 − α)·B) / max(α, 0,05)`, avec B la couleur médiane
  du bord de l'image. On retire ainsi le gris du fond mélangé dans les pixels de bord avant de poser le personnage sur un
  décor d'Abidjan.
- La licence non précisée du **jeu de données** d'ISNet-anime est un risque faible : le modèle sert hors ligne, et seul
  son masque entre dans la vidéo. Il faut quand même le noter dans `THIRD_PARTY_NOTICES.md`.

### Gaps
- Aucune vérité terrain : la « qualité » est jugée à l'œil et par l'accord entre modèles.
- BEN2, InSPyReNet et BiRefNet complet (Swin-L) n'ont pas été testés. Les planches réelles de l'utilisateur, absentes du
  conteneur, non plus.
- Les durées sont celles d'une image. Le coût d'un lot (54 personnages × N poses) n'a pas été mesuré.

---

## Q3. Repères du corps et du visage sur un cartoon : MediaPipe et RTMW, précision et coût

### Takeaway
Sur le MODOU généré, **les deux squelettes du corps sont justes** : RTMW-l à 133 points et MediaPipe Pose (33 points)
s'accordent à **3,7 % de la longueur du torse** en moyenne. MediaPipe heavy prend **77 ms**, RTMW **137 ms**, sans
détecteur : la boîte vient de l'alpha.

Pour le visage, **MediaPipe Face Landmarker (478 points) place bien la bouche**, sous la moustache, à condition de
recadrer la tête et de l'agrandir à 512 px. En revanche, **il pose le contour de l'œil sur l'iris** et non sur la grande
sclérotique du cartoon. Il faut donc notre propre affinage des paupières. Le visage à 68 points de RTMW est moins bon :
lèvres sur la moustache, yeux réduits à l'iris.

### Cited Findings
**Licences, modèles, limites publiées**
- MediaPipe : Apache-2.0 — [LICENSE](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE).
  - Face Landmarker : 478 points 3D, 52 scores de blendshapes. Trois modèles : BlazeFace (192×192), FaceMesh-V2
    (256×256), blendshapes (1×146×2) —
    [Google AI Edge, Face landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker).
  - Fiche du modèle FaceMesh-V2 : « LICENSED UNDER Apache License, Version 2.0 ». Le modèle est prévu pour la vidéo en
    mode selfie et ne convient pas aux visages inclinés de plus de 8° ni tournés de plus de 80° —
    [Model Card MediaPipe Face Mesh V2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf).
  - `face_landmarker.task` float16 « latest » : 3 758 596 o, sha256 `64184e22…`.
- RTMW (mmpose) :
  - Corps entier à 133 points au format COCO-WholeBody. RTMW-l en 384×288 atteint 70,1 AP « Whole » ; l'ONNX
    `rtmw-dw-x-l_simcc-cocktail14_270e-384x288_20231122.zip` est celui que nous avons utilisé. **Aucune latence CPU
    n'est publiée** pour RTMW.
  - Données d'entraînement « Cocktail14 » : AI Challenger, CrowdPose, MPII, sub-JHMDB, Halpe, PoseTrack18,
    COCO-WholeBody, UBody, **Human-Art**, WFLW, 300W, COFW, LaPa et InterHand —
    [mmpose projects/rtmpose](https://github.com/open-mmlab/mmpose/tree/main/projects/rtmpose).
  - Code mmpose et rtmlib : Apache-2.0 — [mmpose LICENSE](https://github.com/open-mmlab/mmpose/blob/main/LICENSE),
    [rtmlib LICENSE](https://github.com/Tau-J/rtmlib/blob/main/LICENSE).
- **Human-Art** (CVPR 2023) : les détecteurs et estimateurs de pose entraînés sur COCO « work poorly » sur les humains
  artificiels (sculpture, peinture, cartoon). Exemple cité : AP de 63,2 % et 79,8 % sur scènes naturelles, contre 12,6 %
  et 28,7 % sur la sculpture —
  [article CVPR 2023](https://openaccess.thecvf.com/content/CVPR2023/papers/Ju_Human-Art_A_Versatile_Human-Centric_Dataset_Bridging_Natural_and_Artificial_Scenes_CVPR_2023_paper.pdf).
  RTMW a vu Human-Art à l'entraînement (Cocktail14), MediaPipe non, à notre connaissance.
- **À exclure** : X-Pose / UniPose (IDEA), points-clés « de n'importe quel objet », y compris les cartoons. Sa licence est
  « License for Non-commercial Scientific Research Purposes » —
  [LICENSE.txt](https://github.com/IDEA-Research/X-Pose/blob/master/LICENSE.txt).

**[mesure] Commande et résultats** (`reperes.py`, venv MediaPipe 1.1.1 + onnxruntime 1.31.0, 3 threads)
```bash
python -I reperes.py out/zimg_modou_576x1024_s42.png out/detourage/…_alpha_birefnet_lite.png \
  $S/modeles/vision $S/bench-mp/models out/reperes/modou 3
```
- **Boîte englobante tirée de l'alpha**, agrandie ×1,25 et mise au rapport 288/384. Puis transformation affine,
  normalisation (moyenne 123,675 / 116,28 / 103,53 ; écart-type 58,395 / 57,12 / 57,375, en RGB), et décodage **SimCC** :
  `x = argmax(simcc_x)/2`, `y = argmax(simcc_y)/2`, score = `min(max_x, max_y)`, puis transformation affine inverse.
  Paramètres tirés de `pipeline.json` (split ratio 2,0, entrée 288×384).

| Modèle | Points | Inférence (médiane de 2) | Détection |
|---|---|---|---|
| RTMW-l 384×288 (ONNX 1er appel 0,125 s ; chargement 1,43 s) | 133 | **0,137 s** | 133/133 |
| MediaPipe Pose lite / full / heavy | 33 | 0,031 / 0,034 / **0,077 s** | 33/33, visibilité ≥ 0,92 |
| MediaPipe Face (image entière 576×1024) | 478 + 52 | 0,012 s | oui |
| MediaPipe Face (tête recadrée, agrandie à 512) | 478 + 52 | 0,012 s | oui |

Pic RSS du processus : 0,9 Go.
- **Accord RTMW / MediaPipe** (13 articulations, distance normalisée par la longueur du torse, 219 px) :
  - lite : moyenne 0,054 ;
  - full : 0,047 ;
  - heavy : **0,037**.
  
  L'écart maximal est sur le **nez** (0,10 à 0,12) : le gros nez du cartoon déroute les deux modèles.
- **Inspection à l'œil** (`out/reperes/planche_reperes.jpg`, `out/reperes/zoom_visage.jpg`) :
  - Épaules, coudes, poignets, genoux et chevilles sont bien placés par les deux modèles.
  - Les **hanches** sont posées à l'ourlet du t-shirt, un peu haut.
  - MediaPipe Face :
    - lèvres extérieures et intérieures sur la vraie bouche, un peu plus étroites que la bouche dessinée ;
    - le contour des yeux entoure **l'iris seul** : la sclérotique blanche, très grande, est ignorée ;
    - les centres d'iris (468 et 473) sont justes.
  - RTMW visage : lèvres en partie **sur la moustache**, yeux réduits à l'iris, mâchoire trop large.
- **Blendshapes sur le visage neutre** (tête recadrée) : `browInnerUp` 0,98, `browOuterUp` 0,74–0,75, `jawOpen` 0,17,
  `mouthRollLower` 0,22. Les sourcils « tristes » et fatigués du dessin sont lus comme une expression, et la bouche fermée
  donne `jawOpen` 0,17 à 0,30 selon le recadrage.
- **Notre affinage des yeux** (`yeux_cartoon.py`) :
  - Méthode : centre d'iris MediaPipe, couleur de référence de la sclérotique prise de part et d'autre de l'iris (à
    ±0,22 × la distance inter-iris), pixels à ΔE < 42 et pas trop sombres, composante connexe qui touche l'iris.
  - Paupière **haute** : tracé fidèle sur les deux yeux.
  - Paupière **basse** : sous-estimée, car la sclérotique ombrée en bas sort du seuil.
  - Ouverture hauteur/largeur mesurée : 0,64 et 0,82.
  - Coût : moins de 50 ms.

### Inferences
- **Corps** :
  - **MediaPipe Pose heavy** comme source principale (rapide, et déjà en place dans le projet :
    `direct/lib/studio/bodyDetect.ts`, audit 00) ;
  - **RTMW** pour les **mains** (21 points par main, utiles au pivot du poignet et à la forme de main) et pour les
    **pieds** (orteils et talon) ;
  - fusion par moyenne pondérée des scores sur les points communs.
  
  Un désaccord de plus de 8 % du torse sur une articulation est un **signal QA** : on demande alors une correction
  manuelle.
- **Visage** : MediaPipe sur la tête recadrée à 512 px, pour la **bouche** (contours, largeur, ouverture) et les
  **centres d'iris**, et **jamais** pour le contour des yeux. Les paupières viennent de notre segmentation de la
  sclérotique.
- **Blendshapes : en relatif seulement.** Sur un cartoon, les valeurs absolues sont biaisées (sourcils « tristes » =
  `browInnerUp` à 0,98). On n'utilise que l'écart à la planche neutre du même personnage, pour vérifier qu'une variante
  « choc » ouvre bien la mâchoire par exemple (Q5).
- Les limites de la fiche FaceMesh-V2 (inclinaison au-delà de 8°) excluent les poses très penchées : on mesure les
  repères **sur la planche neutre**, puis ils suivent le rig.

### Gaps
- Aucune vérité terrain annotée à la main, donc pas de PCK. L'accord entre modèles n'est pas une précision.
- Un seul personnage, très frontal et humanoïde. Les gabarits extrêmes de la troupe (enfants, personnes très rondes,
  boubou ample qui cache les jambes) n'ont pas été testés.
- Le visage à 68 points de RTMW n'est pas comparé à un détecteur de visage dédié et permissif.
- **Risque de licence des données** : Cocktail14 contient des jeux de données dont certaines licences sont non
  commerciales (par exemple 300W ou AI Challenger, à vérifier une par une). Les **poids** sont distribués sous Apache-2.0
  par mmpose. Le risque est faible pour un usage hors ligne qui ne produit que des coordonnées, mais il n'est pas nul.

---

## Q4. Du personnage généré au rig découpé : parties, pivots, coiffes d'articulation (prototype « AutoDécoupe »)

### Takeaway
À partir de l'alpha (Q2) et des 133 repères (Q3), une **étiquette géodésique multi-sources** découpe MODOU en 15 parties
conformes à la spec §6, avec pivots et parents, en **1,4 s sur un cœur** et sans aucun pixel orphelin. La découpe est
juste dès que le **torse est ensemencé par une surface** et non par un segment. Restent à reprendre la limite
torse/bassin (qui doit suivre l'ourlet du vêtement) et un cou séparé.

### Cited Findings
- Spec §6 : « tête, torse, bassin, bras segmentés, avant-bras, mains, cuisses, jambes et pieds ; pivots anatomiques ;
  couches d'occlusion et masques sans trous » (`spec/spec.txt`, section 6).
- La note 01 (G1) retient déjà l'**attribution des sommets aux os par Dijkstra géodésique dans le masque**, idée d'Animated
  Drawings, et la note 02 (G1) définit l'entrée `CutoutLayers` + `SkeletonGuess` de `CharacterRigAdapter.build`. Le
  prototype en produit exactement l'entrée.
- **[mesure] `autodecoupe.py`** :
  - Entrées : RGBA d'ISNet-anime + `modou_reperes.json`.
  - Graines : segments d'os rastérisés entre 15 % et 85 % de leur longueur. Pour le **torse**, une graine surfacique : le
    quadrilatère épaules-hanches rétréci de 15 %.
  - Propagation : Dijkstra 8-connexe (coût 1 ou √2) restreint au masque, puis une règle « au-dessus du menton = tête ».
  - Sorties : un PNG RGBA par partie, une coiffe au pivot (disque de rayon 1,1 × la demi-épaisseur), et
    `character_manifest.json` (fichier, décalage, pivot, extrémité, parent, z).
  - Coût : **1,36 s** de segmentation, 1,89 s en tout, en Python pur avec heapq, sur 576×1024. **0 pixel non étiqueté.**
- **Inspection à l'œil** (`out/decoupe/parties_viz.png`) :
  - **1ʳᵉ version** (torse ensemencé par un segment) : les **manches des bras dévoraient les flancs du t-shirt**.
  - **2ᵉ version** (graine surfacique) :
    - torse = t-shirt entier ; manches → bras ; avant-bras, mains, cuisses, jambes et pieds sont propres, coupés au
      coude, au poignet, au genou et à la cheville ;
    - défauts restants : le **bassin** est un petit triangle sous le t-shirt, alors que le haut du pantalon part dans les
      cuisses ; le **cou** est rattaché à la tête ; la tête n'a pas de parent dans le manifeste ;
    - quelques pixels d'ombre au bord des sandales.

### Inferences
- **Pourquoi l'A-pose compte** : avec des bras écartés, il n'y a presque pas de zone cachée à compléter. Seules les
  coiffes d'articulation exigent des pixels « sous » le voisin, et elles sont **prises dans l'image** (le disque autour du
  pivot appartient au parent). Pour des rotations au-delà de 40° environ, la coiffe montre l'ancien voisin : il faudra une
  complétion (G5). L'image klein, plus écartée, est donc **meilleure pour la découpe** que celle de Z-Image.
- **Améliorations à faire** :
  - La **limite torse/bassin** doit être accrochée au **bord de couleur du vêtement** : coût d'arête de Dijkstra pondéré
    par le gradient Lab, ou coupe de graphe à deux étiquettes dans la bande entre 60 % et 100 % de la hauteur du torse.
  - Le **cou** devient une partie à deux pivots (base, nuque), à la manière de Live2D.
- Le manifeste doit porter la **provenance** pour l'`AssetRegistry` de la spec : modèle, révision, graine, prompt,
  SHA-256 de l'image source, licences.

### Gaps
- Testé sur un seul personnage, en vue de face. Les jupes et boubous (TANTIE AWA) n'ont pas de jambes visibles : il faudra
  une règle « vêtement long = une seule partie bas du corps » avec une déformation par maillage (note 02, G1/G6).
- Aucun test d'animation des parties produites. Les coiffes n'ont pas été vérifiées en rotation extrême.
- La complétion amodale des zones cachées (inpainting CPU) n'a pas été mesurée.

---

## Q5. Poses supplémentaires et formes de bouche cohérentes : édition sur CPU (klein) ou déformation ?

### Takeaway
[[Q5_TAKEAWAY]]

### Cited Findings
**Options d'édition, licences et faisabilité CPU**
- FLUX.2 [klein] 4B : texte → image et « image-to-image multi-reference editing in a single unified model », Apache-2.0
  ([fiche HF](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B)). Dans sd.cpp, les références passent par `-r`
  avec le préréglage `flux2` : les latents VAE de la référence sont concaténés aux jetons du DiT
  ([docs/edit.md](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/edit.md),
  [docs/flux2.md](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/flux2.md)).
- Pour la cohérence de personnage, BFL conseille de fournir des images de référence du personnage puis de décrire la
  nouvelle scène, pose ou contexte —
  [BFL, character consistency](https://docs.bfl.ai/guides/usecases_editing_character_consistency). La famille FLUX.2
  accepte jusqu'à 10 références ([BFL, FLUX.2](https://bfl.ai/blog/flux-2)). Ce sont des documents du vendeur, sans mesure
  propre à klein 4B.
- **Écartés pour le CPU (taille), malgré une licence permissive** :
  - Qwen-Image-Edit-2511 : Apache-2.0, GGUF Q3/Q4 de 9,9 à 13,2 Go plus un encodeur Qwen2.5-VL 7B (note
    `Moteurs vidéo IA pour la troupe/codes_a_dupliquer_personnages.md`) ;
  - Boogu Image Edit : apache-2.0 sur le dépôt Comfy-Org, 20,6 Go en bf16 et 10,3 Go en fp8
    ([API HF](https://huggingface.co/api/models/Comfy-Org/Boogu-Image?blobs=true)) ;
  - Qwen-Image-Layered : Apache-2.0, décompose une image en calques RGBA éditables
    ([fiche HF](https://huggingface.co/Qwen/Qwen-Image-Layered)) ; sd.cpp le prend en charge (préréglage `qwen_layered`,
    [docs/edit.md](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/edit.md)), mais c'est un modèle de la
    taille de Qwen-Image.
  
  Tous les trois sont des candidats GPU (Kaggle T4) pour plus tard.
- **sd.cpp sait faire de l'inpainting sur n'importe quel modèle**. Avec `-i` et `--mask`, le masque est réduit à la
  taille du latent (`latent_mask`) et sert de `denoise_mask` : seule la zone masquée est débruitée
  (`src/pipeline/image.cpp`, lignes 194–415, commit `8cd731e7`). Cela ouvre la voie « Z-Image en inpainting sur un
  recadrage de bouche » (non mesurée ici).

**[mesure] Chaîne klein** (`klein_chaine.sh`, 4 pas, euler, CFG 1, graine 42, 3 threads)
- Préfixe commun des prompts d'édition : « Keep exactly the same character, same face, same proportions, same clothes,
  same 3D Pixar-like cartoon style, same lighting and the same plain light grey background. »
- Visage : recadrage carré de 1,5 × l'étendue des 478 points MediaPipe, de 219 px dans l'image 576×1024, agrandi à
  512×512 en Lanczos (`recadrer_recoller.py crop`).

[[Q5_TABLE]]

### Inferences
[[Q5_INF]]

### Gaps
[[Q5_GAPS]]

---

## Ce que nous greffons dans notre moteur

[[GREFFES]]
