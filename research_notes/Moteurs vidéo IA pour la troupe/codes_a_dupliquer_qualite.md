# Codes à dupliquer : post-production et contrôle qualité (interpolation, upscale, deflicker, couleur, métriques, juges VLM) — état au 16/10/2026

Demande de l'utilisateur : « cherche des codes moteurs à dupliquer ». Cette note couvre l'**étage post-production et
contrôle qualité** du « moteur de la troupe » : interpolation d'images (RIFE, FILM, GIMM-VFI), super-résolution
(SeedVR2, FlashVSR, Real-ESRGAN), anti-scintillement (deflicker), harmonisation des couleurs, mesures automatiques
(VBench, RAFT, UVQ, SyncNet) et juges VLM (VideoReward, DefectVideoReward). Pour chaque dépôt : ce qui tourne sur le
**CPU du conteneur** (4 cœurs, 15 Go de RAM, sans GPU) et ce qui demande un **GPU** (Kaggle T4×2 16 Go).

**Méthode (16/10/2026).** Fichiers `LICENSE` et `README.md` lus en brut (`raw.githubusercontent.com`), plus quelques
fichiers de code lus **comme des données** (jamais exécutés) pour vérifier le choix du périphérique (CPU/GPU) et la
précision (fp16/bf16). Étoiles = valeur arrondie de la page GitHub ; « dernière activité » = date du commit le plus
récent du flux `commits/<branche>.atom`, lus via WebFetch. Licences des **poids** = API publique Hugging Face (tags
`license:`). **Aucun dépôt n'a été cloné ni exécuté, aucun poids n'a été téléchargé, aucun compte n'a été créé.** Les
licences sont **telles qu'affichées** et restent à confirmer par une passe juridique. Les phrases marquées
**(inférence)** sont nos déductions, pas des faits publiés.

Notes voisines déjà couvertes, non répétées ici : `fluidite_qualite_controle.md` (sections 2 et 3 : rôle de chaque outil,
chronos ComfyUI de SeedVR2/FlashVSR, définitions VBench, LSE-C/LSE-D) et `verification_licences.md` (Practical-RIFE MIT
et SeedVR2 Apache-2.0 **confirmés** ; wrapper numz sous Apache-2.0 et non MIT). Rappels : le T4 n'a ni bf16 natif, ni
FP8, ni FlashAttention-2 (`modeles_ouverts_2026.md`) ; Kaggle ≈ 30 h/semaine (`verification_gratuit.md`).

---

## 1. Takeaway

- **Trois pièges de licence nouveaux, absents des notes précédentes** :
  1. **GIMM-VFI est NON COMMERCIAL** (« S-Lab License 1.0 » : « Redistribution and use for non-commercial purpose »),
     et son nœud ComfyUI `kijai/ComfyUI-GIMM-VFI` aussi. `fluidite_qualite_controle.md` le recommandait pour les
     mouvements rapides : **à retirer** de la chaîne d'une chaîne TikTok monétisée, sauf accord écrit des auteurs.
  2. **VBench (code Apache-2.0) embarque deux composants non commerciaux** dans ses dimensions « vidéos perso » :
     `motion_smoothness` utilise **AMT** (CC BY-NC 4.0) et `imaging_quality` utilise **MUSIQ via pyiqa/IQA-PyTorch**
     (PolyForm Noncommercial 1.0.0). VBench-2.0 ajoute **CoTracker** (CC BY-NC 4.0) et les modèles **InsightFace**
     (« non-commercial research purposes only »). Il faut donc **dupliquer VBench à la carte** : garder
     `dynamic_degree` (RAFT, BSD-3), `subject_consistency` (DINO, Apache-2.0), `background_consistency` (CLIP, MIT) et
     `aesthetic_quality` (prédicteur LAION, MIT), et remplacer les deux dimensions NC.
  3. **Les poids d'All-In-One-Deflicker** sont dans un dépôt séparé **sans licence**
     (`ChenyangLEI/cvpr2023_deflicker_public_folder`), alors que le code n'est sous Apache-2.0 que depuis le **14/07/2026**.
     Les **poids SyncNet** sont décrits par Oxford VGG comme utilisables « for research purposes under Creative Commons
     Attribution License » : formulation ambiguë, à faire trancher.
- **Interpolation à dupliquer : `hzwer/Practical-RIFE` (MIT, code et poids).** Le script `inference_video.py` bascule
  seul sur le CPU (`torch.device("cuda" if torch.cuda.is_available() else "cpu")`) et offre `--fp16` sur GPU. Le dépôt
  vit encore (commit du 27/08/2026). Pour un CPU sans PyTorch, **`nihui/rife-ncnn-vulkan`** (MIT) documente `-g -1`
  = CPU, mais il est figé depuis 2022 et ne livre que des modèles jusqu'à **RIFE v4.6**. **FILM** (Apache-2.0) est
  l'alternative « grands mouvements » sous licence propre, mais le dépôt Google est **archivé depuis le 14/10/2025** ;
  le portage PyTorch `dajes/frame-interpolation-pytorch` (Apache-2.0) est le plus simple à vendre dans notre code.
- **Upscale à dupliquer : `numz/ComfyUI-SeedVR2_VideoUpscaler`** (Apache-2.0, 2,9k étoiles), utilisé **en CLI
  autonome** (`inference_cli.py`, sans interface) : GGUF Q4/Q8, BlockSwap, délestage DiT/VAE vers le CPU, tuilage VAE,
  `--chunk_size` pour les vidéos longues et **`--cuda_device 0,1` pour Kaggle T4×2**. Le README annonce « Minimal VRAM
  (8GB or less) : GGUF Q4_K_M models with BlockSwap and VAE tiling » ; le code détecte le bf16 « without affecting RTX
  20XX » (Turing, comme le T4). Le code officiel `ByteDance-Seed/SeedVR` vise « 1 H100-80G » et ne convient pas tel quel.
- **FlashVSR** : code et poids Apache-2.0 (v1, v1.1 et **FlashVSR+ publié le 14/10/2026**, base Wan2.1-T2V-1.3B). Le code
  officiel exige Block-Sparse-Attention, testé seulement sur A100/A800/H200 ; FlashVSR+ a un repli PyTorch SDPA mais
  reste « CUDA-only ». **Seule voie T4 documentée : `lihaoyun6/ComfyUI-FlashVSR_Ultra_Fast`** (GPL-3.0), qui remplace
  Block-Sparse par Sparse_Sage, propose `precision: fp16` et dit « For Turing or older GPU, please install triton<3.3.0 ».
- **Upscale conservateur et bon marché : Real-ESRGAN `realesr-animevideov3`** (BSD-3, modèle « XS » pour vidéo
  d'animation, ×1 à ×4). La classe `RealESRGANer` sait tourner sur CPU (`--fp32`), mais le script vidéo appelle
  `torch.cuda.synchronize` et crée `num_gpus × num_process_per_gpu` processus : il faut un petit correctif pour le CPU.
- **Deflicker** : All-In-One-Deflicker (≈ 3 Go de GPU, mais **entraîne un atlas neuronal par clip** : 10 001 itérations
  à 768×432, 200 images max) et **FastBlend** (Apache-2.0, sans modèle, CuPy donc GPU). Aucun des deux n'est réaliste
  sur le CPU du conteneur (inférence). Côté couleur, **`hahnec/color-matcher`** (GPL-3.0, numpy, CPU) harmonise un
  plan sur une image de référence (méthodes Reinhard, MKL, `hm-mkl-hm`).
- **Contrôle qualité sur CPU, licences propres** : **RAFT** (BSD-3, aussi dans torchvision) pour le mouvement ;
  **`google/uvq`** (Apache-2.0, UVQ 1.5) pour la qualité technique : le README mesure **~17,9 s sur 4 cœurs** pour une
  vidéo 1080p de 20 s, avec `--device cpu`, `--transpose` (vidéos portrait) et un mode lot ; **`joonson/syncnet_python`**
  (MIT, `environment-cpu.yml`) pour la synchro labiale.
- **Juges VLM (GPU)** : **VideoReward** (`KlingAIResearch/VideoAlign`, code MIT ; poids `KlingTeam/VideoReward`
  Apache-2.0, base Qwen2-VL-2B) passe sur un T4 en fp16 à condition de couper FlashAttention-2 (`disable_flash_attn2`
  est codé en dur à `False` dans `inference.py`). **DefectVideoReward** (poids Apache-2.0, Qwen3-VL-8B, ~9 Md de
  paramètres en BF16, **pas de dépôt GitHub**, seulement un extrait `transformers`) dépasse 16 Go en 16 bits : il faut le
  répartir sur T4×2 ou le quantifier (inférence).

---

## 2. Tableau de synthèse

Légende : ✔ = documenté ou lu dans le code ; ~ = possible sous conditions (fp16, GGUF, délestage, tuilage, petit
correctif) ou non testé ; ✘ = non. CPU = conteneur 4 cœurs / 15 Go.

| # | Dépôt (URL canonique) | Rôle | Licence affichée (code / poids) | Étoiles | Dernière activité vue | T4 16 Go | CPU 4 cœurs |
|---|---|---|---|---|---|---|---|
| 1 | [hzwer/Practical-RIFE](https://github.com/hzwer/Practical-RIFE) | interpolation ×2/×4 (RIFE 4.25/4.26) | MIT / MIT (« same MIT license ») | 1,0k | 27/08/2026 | ✔ `--fp16` | ✔ repli CPU dans le code ; vitesse non publiée |
| 2 | [Fannovel16/ComfyUI-Frame-Interpolation](https://github.com/Fannovel16/ComfyUI-Frame-Interpolation) | nœuds VFI (RIFE 4.26, FILM, AMT, GMFSS…) | MIT (wrapper) ; modèles : licences propres à chacun | 1,1k | 29/03/2026 | ✔ | ~ backend `taichi` « experimental » |
| 3 | [nihui/rife-ncnn-vulkan](https://github.com/nihui/rife-ncnn-vulkan) | RIFE en C++/ncnn, binaire | MIT | 1,1k | 23/10/2022 (figé) | ~ via Vulkan | ✔ `-g -1` = CPU ; modèles ≤ v4.6 |
| 4 | [google-research/frame-interpolation](https://github.com/google-research/frame-interpolation) (+ [dajes/frame-interpolation-pytorch](https://github.com/dajes/frame-interpolation-pytorch)) | FILM, grands mouvements | Apache-2.0 (les deux) ; poids Google Drive sans licence propre lue | 3,2k (+185) | **archivé 14/10/2025** ; portage 24/12/2023 | ✔ (`--fp16` du portage) | ~ portage PyTorch sans `--gpu` ; lent (inférence) |
| 5 | [GSeanCDAT/GIMM-VFI](https://github.com/GSeanCDAT/GIMM-VFI) | interpolation continue (NeurIPS 2024) | **S-Lab License 1.0 = non commercial** ; poids HF sans licence | 408 | 05/06/2025 | ~ CuPy/CUDA ; 7,9 Go en 2K sur V100 | ✘ |
| 6 | [ByteDance-Seed/SeedVR](https://github.com/ByteDance-Seed/SeedVR) | SeedVR2 officiel (restauration 1 pas) | Apache-2.0 / Apache-2.0 (3B, 7B) | 1,4k | 27/01/2026 | ✘ tel quel (« 1 H100-80G », flash_attn, apex) | ✘ |
| 7 | [numz/ComfyUI-SeedVR2_VideoUpscaler](https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler) | SeedVR2 basse VRAM + CLI autonome | Apache-2.0 / Apache-2.0 (dont GGUF `cmeka`) | 2,9k | 24/12/2025 (v2.5.24) | ~ GGUF Q4/Q8 + BlockSwap + tuilage ; T4×2 via `--cuda_device 0,1` | ✘ (CUDA, MPS, ROCm seulement) |
| 8 | [OpenImagingLab/FlashVSR](https://github.com/OpenImagingLab/FlashVSR) | VSR diffusion 1 pas en flux (×4) | Apache-2.0 / Apache-2.0 (v1, v1.1) | 1,9k | 15/10/2026 (README) | ✘/? Block-Sparse testé A100/A800/H200 seulement | ✘ |
| 9 | [OpenImagingLab/FlashVSR_Plus](https://github.com/OpenImagingLab/FlashVSR_Plus) | FlashVSR+ (Hybrid Attention, RY-DMD) | Apache-2.0 / Apache-2.0 (base Wan2.1-T2V-1.3B) | 84 | 14/10/2026 (1 commit) | ? repli SDPA `--hardware-profile generic` ; non testé sur Turing | ✘ « does not support CPU inference » |
| 10 | [lihaoyun6/ComfyUI-FlashVSR_Ultra_Fast](https://github.com/lihaoyun6/ComfyUI-FlashVSR_Ultra_Fast) | FlashVSR basse VRAM, sans compilation | **GPL-3.0** (poids FlashVSR Apache-2.0) | 802 | 20/11/2025 | ✔/~ « For Turing… triton<3.3.0 », `precision: fp16`, `tiled_dit` | ✘ (« No devices found ») |
| 11 | [xinntao/Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) (+ [Real-ESRGAN-ncnn-vulkan](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan), MIT) | upscale GAN conservateur, modèle vidéo animé | BSD-3-Clause | 37,1k | 02/04/2024 | ✔ fp16 par défaut | ~ classe `RealESRGANer` en `--fp32` ; script vidéo à corriger |
| 12 | [ChenyangLEI/All-In-One-Deflicker](https://github.com/ChenyangLEI/All-In-One-Deflicker) | deflicker aveugle (atlas + filtre neuronal) | Apache-2.0 (ajoutée le 14/07/2026) ; **poids sans licence** | 767 | 14/07/2026 | ✔ « about 3000M GPU memory » | ✘ en pratique (atlas de 10 001 itérations) |
| 13 | [Artiprocher/sd-webui-fastblend](https://github.com/Artiprocher/sd-webui-fastblend) | FastBlend : lissage / deflicker sans modèle | Apache-2.0 | 394 | 14/08/2024 | ✔ (CuPy CUDA) | ✘ (CuPy) |
| 14 | [hahnec/color-matcher](https://github.com/hahnec/color-matcher) | transfert de couleur plan → référence | GPL-3.0 | 673 | 24/02/2026 | sans objet | ✔ (numpy) |
| 15 | [Vchitect/VBench](https://github.com/Vchitect/VBench) (+ VBench-2.0) | banc de mesures vidéo | Apache-2.0 (code) ; **AMT CC BY-NC, pyiqa PolyForm NC, CoTracker CC BY-NC, InsightFace NC** | 1,8k | 21/08/2026 | ✔ (VBench) ; ✘ VBench-2.0 (LLaVA-Video-7B + Qwen2.5-7B) | ~ API Python avec `device` ; `evaluate.py` code `cuda` en dur |
| 16 | [princeton-vl/RAFT](https://github.com/princeton-vl/RAFT) (+ [SEA-RAFT](https://github.com/princeton-vl/SEA-RAFT), torchvision `raft_small`) | flux optique → amplitude, couverture, à-coups | BSD-3-Clause (les trois) | 4,1k (+717) | 24/08/2025 | ✔ | ✔ (torchvision) ; SEA-RAFT : CPU non documenté |
| 17 | [joonson/syncnet_python](https://github.com/joonson/syncnet_python) | synchro lèvres/voix (LSE-C/LSE-D) | MIT (code) ; poids Oxford « research purposes » + CC BY | 913 | 17/04/2026 | ✔ | ✔ `environment-cpu.yml`, repli CPU automatique |
| 18 | [KlingAIResearch/VideoAlign](https://github.com/KlingAIResearch/VideoAlign) | VideoReward : notes VQ / MQ / TA | MIT (LICENSE ajoutée 24/09/2025) / Apache-2.0 (`KlingTeam/VideoReward`) | 518 | 24/09/2025 | ~ fp16 + FA2 désactivée (≈ 2 Md de paramètres) | ~ très lent (inférence) |
| 19 | [CaoruiLi/DefectVideoReward](https://huggingface.co/CaoruiLi/DefectVideoReward) (HF, pas de GitHub) | juge VLM : liste de défauts + note 1–10 en JSON | Apache-2.0 (poids, base Qwen3-VL-8B) | 0 like, 40 téléchargements | 27/07/2026 | ~ T4×2 (`device_map="auto"`) ou 4/8 bits | ✘ en pratique |
| 20 | [google/uvq](https://github.com/google/uvq) | qualité perceptive sans référence (UVQ 1.0 / 1.5) | Apache-2.0 | 155 | 29/09/2026 | ✔ (`--device cuda`, lots de 24) | ✔ **~17,9 s / clip 20 s 1080p sur 4 cœurs** |

---

## 3. Fiches détaillées

### 3.1 Practical-RIFE — `hzwer/Practical-RIFE` (interpolation par défaut)

**Faits lus**
- LICENSE MIT (« Copyright (c) 2021 hzwer ») ; README : « The content of these links [les modèles] is under the same MIT
  license as this project ». 1,0k étoiles, 133 forks, 208 commits. Dernier commit le **27/08/2026** (« Add Apple Silicon
  (MPS) support to warplayer (#156) ») — [dépôt](https://github.com/hzwer/Practical-RIFE),
  [flux](https://github.com/hzwer/Practical-RIFE/commits/main.atom).
- « Currently, it is recommended to choose 4.25 by default for most scenes » ; 4.25 (19/09/2024) « anime scenes have
  been significantly improved » ; 4.26 (21/09/2024) ; 4.25.lite (20/10/2024) ; « 4.24+ is quite suitable for
  post-processing of some diffusion model generated videos ». Installation : « python <= 3.11 » ; poids sur Google Drive
  et Baidu à copier dans `train_log/`.
- `inference_video.py` (lu, non exécuté) : `--multi`, `--exp`, `--fps`, `--scale` (0,5 pour la 4K), `--UHD`, `--img`
  (suite de PNG), `--montage`, `--png`, `--ext`, et **`--fp16`** (« fp16 mode for faster and more lightweight inference on
  cards with Tensor Cores »). Ligne 84 : `device = torch.device("cuda" if torch.cuda.is_available() else "cpu")`.
- Le README renvoie vers des portages : VapourSynth-RIFE, RIFE-ncnn-vulkan, vs-mlrt.

**Pour la troupe (inférence)**
- C'est le bloc « fluidité » à vendre (vendor) tel quel dans le moteur : un seul fichier d'entrée, licence MIT sur le
  code **et** les poids. Recette : Wan 16 fps → `--multi=2` → 32 fps, puis ré-échantillonner à 30 fps avec ffmpeg.
- Sur T4 : `--fp16`, 720×1280 en `--scale=1.0`. Sur le CPU du conteneur, ça marche en fp32 mais aucun chrono n'est
  publié : à mesurer sur un clip de 5 s avant d'en faire une étape CPU de production.
- Point d'attention : l'épinglage de version (4.25 vs 4.26) se fait par le choix du fichier de poids ; garder 4.25 par
  défaut comme le recommande l'auteur.

### 3.2 ComfyUI-Frame-Interpolation — `Fannovel16/ComfyUI-Frame-Interpolation`

**Faits lus**
- MIT (« Copyright (c) 2023 Fannovel16 ») ; 1,1k étoiles, 138 forks. Derniers commits : « feat: update rife node
  display name to recommend 4.25+ versions » (26/03/2026), fusion du 29/03/2026 —
  [dépôt](https://github.com/Fannovel16/ComfyUI-Frame-Interpolation).
- Nœuds : GMFSS Fortuna, IFRNet, IFUnet, M2M, RIFE, FILM, Sepconv, AMT, STMFNet, FLAVR, ATM-VFI, MoMo. « About 99% the
  code of this repo comes from » VSGAN-tensorrt-docker.
- `vfi_models/rife/__init__.py` (lu) : points de contrôle `rife47`, `rife49`, `rife417`, **`rife426`** ; défaut
  `rife49.pth`.
- `config.yaml` : `ops_backend: "cupy"` ; « Support for non-CUDA device (experimental) » via `taichi`, avec
  `NotImplementedError` possible pour certains nœuds.

**Pour la troupe (inférence)**
- Utile si le moteur d'exécution retenu est ComfyUI (voir `codes_a_dupliquer_execution.md`) : un seul paquet donne RIFE
  4.26, FILM et AMT dans le même graphe. **La licence MIT du wrapper ne couvre pas les modèles** : AMT est CC BY-NC 4.0
  (vérifié pour VBench, section 3.15), GMFSS et les autres sont à vérifier un par un. N'utiliser que **RIFE** et
  **FILM** en production.

### 3.3 rife-ncnn-vulkan — `nihui/rife-ncnn-vulkan` (RIFE sans PyTorch)

**Faits lus**
- MIT ; 1,1k étoiles, 94 forks. Derniers commits : « implement cpu temporal tta for rife v4 » (**23/10/2022**) —
  [dépôt](https://github.com/nihui/rife-ncnn-vulkan), [flux](https://github.com/nihui/rife-ncnn-vulkan/commits/master.atom).
- Option `-g gpu-id` : « (-1=cpu, default=auto) can be 0,1,2 for multi-gpu » ; exemple qui « runs on CPU, Discrete GPU,
  and Integrated GPU all at the same time ». Modèles fournis : rife … rife-anime, rife-v4, **rife-v4.6** (le plus récent).

**Pour la troupe (inférence)**
- Seul binaire RIFE qui documente le CPU : bon candidat pour une **interpolation de secours dans le conteneur** sans
  installer PyTorch. Limites : modèles anciens (v4.6, pas la 4.25 « anime ») et dépôt figé depuis 2022. Le binaire Linux
  dépend probablement d'un chargeur Vulkan (`libvulkan`) même en mode CPU : à vérifier.

### 3.4 FILM — `google-research/frame-interpolation` (+ portage `dajes/frame-interpolation-pytorch`)

**Faits lus**
- Apache-2.0 ; 3,2k étoiles ; **« archived by the owner on Oct 14, 2025. It is now read-only »** ; dernier commit
  14/01/2023. TensorFlow 2 (CUDA 11.2.1, cuDNN 8.1.0) ; `--block_height/--block_width` pour la haute résolution ;
  `--times_to_interpolate`. Poids « TF2 Saved Models » sur Google Drive : aucune licence distincte n'est écrite pour eux
  — [dépôt](https://github.com/google-research/frame-interpolation).
- Portage PyTorch `dajes/frame-interpolation-pytorch` : Apache-2.0, 185 étoiles, dernier commit 24/12/2023. Modèle
  TorchScript en release ; `inference.py` avec `--gpu` et `--fp16` (« speeds inference up on GPUs with tensor cores ») ;
  sans `--gpu`, le calcul reste sur le CPU — [dépôt](https://github.com/dajes/frame-interpolation-pytorch).

**Pour la troupe (inférence)**
- Alternative à licence propre pour les **grands mouvements** (chutes, danses), maintenant que GIMM-VFI est exclu. Le
  portage PyTorch est le plus simple à vendre dans le moteur (un modèle TorchScript, une fonction). Il est figé mais
  stable. Les poids FILM venant de Google Drive sans texte de licence propre, les traiter comme couverts par l'Apache-2.0
  du dépôt **est une hypothèse** à faire confirmer.

### 3.5 GIMM-VFI — `GSeanCDAT/GIMM-VFI` (à NE PAS dupliquer pour un usage monétisé)

**Faits lus**
- LICENSE : « S-Lab License 1.0 … Redistribution and use for non-commercial purpose in source and binary forms … In the
  event that redistribution and/or use for commercial purpose … is required, please contact the contributor(s) ». Même
  licence sur le nœud `kijai/ComfyUI-GIMM-VFI`. Poids HF `GSean/GIMM-VFI` sans tag de licence —
  [LICENSE](https://github.com/GSeanCDAT/GIMM-VFI/blob/main/LICENSE),
  [LICENSE kijai](https://github.com/kijai/ComfyUI-GIMM-VFI/blob/main/LICENSE).
- 408 étoiles ; dernier commit « fixed bug » (05/06/2025). PyTorch 1.13 / CUDA 11.6 / **CuPy**. Mémoire sur V100 :
  « [2K interpolation] DS_SCALE: 0.5 Memory-Usage: 7932MiB », « [4K] … 10922MiB ».

**Pour la troupe**
- Corrige `fluidite_qualite_controle.md` (section 2), qui le proposait pour les actions rapides sans avoir lu la licence.
  Pour une chaîne TikTok monétisée : **exclure**, ou demander une licence commerciale aux auteurs (NTU S-Lab).

### 3.6 SeedVR officiel — `ByteDance-Seed/SeedVR`

**Faits lus**
- Apache-2.0 (« SeedVR and SeedVR2 are licensed under the Apache 2.0 ») ; poids `ByteDance-Seed/SeedVR2-3B` tagués
  `apache-2.0`. 1,4k étoiles, 9 commits ; actualité : SeedVR2 accepté à l'ICLR 2026 (27/01/2026) —
  [dépôt](https://github.com/ByteDance-Seed/SeedVR).
- Matériel : « 1 H100-80G can handle videos with 100x720x1280 » ; « 4 H100-80G further support 1080p and 2K videos
  (sp_size=4) ». Dépendances `flash_attn==2.5.9.post1` et apex.
- Limite écrite par les auteurs : les méthodes « tend to overly generate details on inputs with very light degradations ».

**Pour la troupe (inférence)**
- À lire pour comprendre le modèle, pas à exécuter : FlashAttention-2 et apex ne passent pas sur T4. La remarque sur les
  « détails en trop » compte pour des personnages 3D stylisés aux surfaces lisses : SeedVR2 peut ajouter de la texture
  que le design n'a pas. Toujours repasser le contrôle d'identité après l'upscale.

### 3.7 SeedVR2 basse VRAM — `numz/ComfyUI-SeedVR2_VideoUpscaler` (upscale recommandé)

**Faits lus**
- Apache-2.0 (LICENSE et README) ; 2,9k étoiles, 243 forks, 423 commits ; v2.5.24 du **24/12/2025** (dernier commit du
  flux le même jour) — [dépôt](https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler).
- Matériel : « Minimal VRAM (8GB or less): Use GGUF Q4_K_M models with BlockSwap and VAE tiling enabled » ; « Moderate VRAM
  (12-16GB): Use FP8 models with BlockSwap or VAE tiling as needed ». Poids : `numz/SeedVR2_comfyUI`,
  `AInVFX/SeedVR2_comfyUI`, `cmeka/SeedVR2-GGUF`, tous tagués `apache-2.0` sur HF.
- v2.5.17 : « Runtime bf16 CUBLAS probe … correctly detecting unsupported GPUs without affecting RTX 20XX ». v2.5.20 :
  repli automatique sur PyTorch SDPA si FlashAttention ou SageAttention manquent. v2.5.23 : « Prevent code execution in
  model loading … restricting deserialization to tensors only ».
- **CLI autonome** `inference_cli.py` : `--dit_model` (3B/7B, fp16/fp8/GGUF), `--resolution` (côté court, défaut 1080),
  `--batch_size` (règle 4n+1), `--blocks_to_swap`, `--swap_io_components`, `--dit_offload_device cpu`,
  `--vae_offload_device cpu`, `--vae_encode_tiled/--vae_decode_tiled`, `--chunk_size` + `--temporal_overlap` (vidéos
  longues), `--cuda_device 0,1` (multi-GPU), `--color_correction lab` (défaut), `--video_backend ffmpeg --10bit`.
  Exemple « Memory-optimized for low VRAM (8GB) » avec `seedvr2_ema_3b-Q8_0.gguf` et `--blocks_to_swap 32`.
- Limites écrites : « The VAE is slow » ; batch 4n+1 obligatoire.

**Pour la troupe (inférence)**
- Bloc « netteté finale » à dupliquer : la CLI tourne sans ComfyUI, donc pilotable depuis un notebook Kaggle en mode
  sans interface. Réglage de départ sur T4 : 3B GGUF Q8 (ou Q4_K_M), `--resolution 1080` (côté court, donc 1080×1920
  en 9:16), `--batch_size 21` ou 33, BlockSwap + tuilage VAE, `--color_correction lab` pour ne pas dériver de la palette.
  `--cuda_device 0,1` répartit les images sur les deux T4.
- Le T4 n'est pas cité nommément : la mention « RTX 20XX » (même génération Turing) est l'indice le plus proche. À
  valider sur un clip de 5 s.

### 3.8 FlashVSR officiel — `OpenImagingLab/FlashVSR`

**Faits lus**
- Apache-2.0 ; poids `JunhaoZhuang/FlashVSR` et `FlashVSR-v1.1` tagués `apache-2.0` (HF, mis à jour le 15/08/2026).
  1,9k étoiles, 42 commits ; dernier commit 15/10/2026 (« Update README with FlashVSR+ release news ») —
  [dépôt](https://github.com/OpenImagingLab/FlashVSR).
- « ∼17 FPS for 768 × 1408 videos on a single A100 » ; « primarily designed and optimized for 4× video
  super-resolution ». Dépendance **Block-Sparse-Attention** (BSD-3) : « works correctly on NVIDIA A100 and A800 … H200 …
  Compatibility and performance on other GPUs (e.g., RTX 40/50 series or H800) are currently unknown ».
- Avertissement des auteurs : certaines intégrations tierces « do not include our Locality-Constrained Sparse Attention
  (LCSA) » et retombent en attention dense, d'où une « noticeable quality degradation ».

**Pour la troupe (inférence)**
- Licence idéale, mais le code officiel ne vise pas le T4. À garder comme **référence** pour juger les portages, pas comme
  code à exécuter sur Kaggle.

### 3.9 FlashVSR+ — `OpenImagingLab/FlashVSR_Plus` (nouveau, 14/10/2026)

**Faits lus**
- Apache-2.0 ; poids `ruchangyao/FlashVSR_plus` tagués `apache-2.0`, `base_model: Wan-AI/Wan2.1-T2V-1.3B`, créés le
  27/09/2026. 84 étoiles, **1 seul commit** (« init flashvsr+ », 14/10/2026) — [dépôt](https://github.com/OpenImagingLab/FlashVSR_Plus).
- « spatially untiled 4K inference on a single 24GB RTX 4090 » ; « up to 2× DiT acceleration and 45% lower peak memory ».
  Préréglages Turbo, Base, V1 ; `--temporal-compression` 4 → 2 ou 1 pour les grands mouvements ; `--decode-every` pour
  les vidéos longues.
- « The released inference pipeline is CUDA-only and does not support CPU inference. » Hauteur et largeur divisibles par
  128. Attention : BSA → Triton maison (exige flash-attn 2.7.4) → **PyTorch SDPA** (`--hardware-profile generic`). Seule
  mention de précision : une option « channels-last BF16 convolution storage ».

**Pour la troupe (inférence)**
- Le plus prometteur pour plus tard (base Wan 1.3B Apache, repli SDPA), mais trop neuf (un commit, deux jours) et
  rien n'indique que le chemin fp16/Turing marche. 1080×1920 est divisible par 128 en largeur (1920 = 15×128) mais pas
  1080 : il faudra rogner ou remplir à 1152. À surveiller, pas à dupliquer tout de suite.

### 3.10 FlashVSR « Ultra Fast » — `lihaoyun6/ComfyUI-FlashVSR_Ultra_Fast` (voie T4 pour FlashVSR)

**Faits lus**
- **GPL-3.0** ; 802 étoiles, 54 commits ; derniers commits « fix dtype » (20/11/2025) et « fix model version »
  (06/11/2025) — [dépôt](https://github.com/lihaoyun6/ComfyUI-FlashVSR_Ultra_Fast).
- « Replaced `Block-Sparse-Attention` with `Sparse_Sage`, removing the need to compile any custom kernels » ; options
  `tiled_dit`, `tiled_vae`, `unload_dit`, mode `tiny`/`full`, `scale` 4 ou 2 ; « For Turing or older GPU, please install
  `triton<3.3.0` ». Utilise les poids FlashVSR v1 (Apache-2.0).
- `nodes.py` (lu) : `"precision": (["fp16", "bf16"], {"default": "bf16"})` ; sans CUDA ni MPS : `RuntimeError("No devices
  found to run FlashVSR!")`.
- Le dépôt officiel le liste avec la mention « I have not personally tested this version ».

**Pour la troupe (inférence)**
- Seul chemin FlashVSR qui documente Turing : `precision=fp16`, `mode=tiny`, `scale=2` si la VRAM manque,
  `tiled_dit=True`. La GPL n'empêche pas de monétiser les vidéos ; elle oblige à publier nos modifications si l'on
  redistribue le nœud. Comparer à SeedVR2 sur les mêmes plans (netteté des contours, dérive de la peau et des motifs wax).

### 3.11 Real-ESRGAN — `xinntao/Real-ESRGAN` (upscale conservateur, très léger)

**Faits lus**
- BSD-3-Clause ; 37,1k étoiles ; dernier commit 02/04/2024 — [dépôt](https://github.com/xinntao/Real-ESRGAN).
- `realesr-animevideov3` : « Anime video model with XS size », ×4, « can also be used for X1, X2, X3 » —
  [anime_video_model.md](https://github.com/xinntao/Real-ESRGAN/blob/master/docs/anime_video_model.md).
- `inference_realesrgan_video.py` (lu) : fp16 par défaut, `--fp32`, `--num_process_per_gpu`, `--extract_frame_first`,
  multi-GPU via `CUDA_VISIBLE_DEVICES`. `realesrgan/utils.py` : `torch.device('cuda' if torch.cuda.is_available() else
  'cpu')`. Mais le script vidéo appelle `torch.cuda.synchronize(device)` à chaque image et lance
  `torch.cuda.device_count() * num_process_per_gpu` processus (0 sans GPU).
- Binaire `Real-ESRGAN-ncnn-vulkan` (MIT) : défaut `realesr-animevideov3` ; README : « executable files for
  Intel/AMD/Nvidia GPU » ; aucune option CPU documentée (contrairement à rife-ncnn).

**Pour la troupe (inférence)**
- L'upscale « conservateur » que la doc ComfyUI recommande pour l'animation : un GAN image par image ne réinvente pas les
  visages comme un upscaler diffusif. Sur T4, c'est quasi instantané. Sur CPU, il faut appeler `RealESRGANer` directement
  avec `half=False` (correctif de quelques lignes) : candidat pour un ×2 de secours dans le conteneur.
- Risque connu des upscalers image par image : petit scintillement de texture ; repasser la mesure de flicker après.

### 3.12 All-In-One-Deflicker — `ChenyangLEI/All-In-One-Deflicker`

**Faits lus**
- Licence Apache-2.0 **ajoutée le 14/07/2026** (commit « Add Apache License 2.0 to the project ») ; 767 étoiles,
  55 commits — [dépôt](https://github.com/ChenyangLEI/All-In-One-Deflicker).
- Poids : `git clone https://github.com/ChenyangLEI/cvpr2023_deflicker_public_folder` → **aucun fichier LICENSE** dans
  ce dépôt (3 étoiles, 2 commits).
- « our inference code only takes about 3000M GPU memory ». Évalué sur des sorties texte-vers-vidéo (Make-A-Video,
  Magic Video) et des « Old cartoons ». `config_flow_100.json` (lu) : `"maximum_number_of_frames": 200`, `"resx": 768`,
  `"resy": 432`, `"iters_num": 10001`. `stage1_neural_atlas.py` : repli `cpu` si pas de CUDA ; `test.py` : `--gpu`.
- Masques optionnels via Carvekit ou Mask-RCNN ; le code d'atlas dérive de `ykasten/layered-neural-atlases` (MIT).

**Pour la troupe (inférence)**
- À réserver aux plans que la mesure de flicker signale. Un clip Wan de 81 images passe sous la limite de 200. Le coût
  réel est l'**ajustement d'un atlas par clip** (10 001 itérations) : temps non publié, à mesurer sur T4. Sur CPU, non
  réaliste. Le **statut des poids** (sans licence) bloque un usage commercial propre tant que les auteurs ne l'ont pas
  précisé.

### 3.13 FastBlend — `Artiprocher/sd-webui-fastblend`

**Faits lus**
- Apache-2.0 ; 394 étoiles ; dernier commit 14/08/2024 — [dépôt](https://github.com/Artiprocher/sd-webui-fastblend),
  papier [arXiv 2311.09265](https://arxiv.org/abs/2311.09265).
- « a model-free algorithm that can make your video smooth. You can remove the flicker in your video, or render a fluent
  video using a series of keyframes. » API Python `smooth_video(video_guide=…, video_style=…, mode="Fast",
  window_size=15, …)` et `interpolate_video(...)`. Dépendance `cupy-cuda12x` ; `patch_match.py` importe `cupy` et utilise
  `cp.cuda.Device`.

**Pour la troupe (inférence)**
- Alternative sans poids (donc sans question de licence des poids) à All-In-One-Deflicker. GPU obligatoire (CuPy), mais
  léger. À tester en passant la vidéo générée à la fois comme guide et comme style. Le dépôt n'évolue plus depuis 2024.

### 3.14 color-matcher — `hahnec/color-matcher` (harmonisation des couleurs entre plans)

**Faits lus**
- GPL-3.0 ; 673 étoiles ; dernier commit 24/02/2026 — [dépôt](https://github.com/hahnec/color-matcher).
- Méthodes décrites : Reinhard, Monge-Kantorovich Linearization (MKL), composé « HM-MVGD-HM » ; exemples
  `--method='hm-mkl-hm'` (CLI) et `mkl` (API) ; traitement par lot d'un dossier ; `pip3 install color-matcher`.

**Pour la troupe (inférence)**
- Tourne sur le CPU du conteneur : caler chaque plan d'un sketch sur une image de référence de la scène (ou sur la
  planche du personnage) pour éviter les sauts de teinte entre plans générés séparément. La GPL ne gêne pas tant qu'on
  ne redistribue pas le moteur. Complète la correction LAB intégrée à la CLI SeedVR2.

### 3.15 VBench / VBench-2.0 — `Vchitect/VBench` (à dupliquer « à la carte »)

**Faits lus**
- Apache-2.0 ; 1,8k étoiles, 1 113 commits ; dernier commit 21/08/2026 ; PyPI `vbench` 0.1.5 (01/2025) ;
  VBench-I2V Arena (03/2026) — [dépôt](https://github.com/Vchitect/VBench).
- `--mode=custom_input` pour `subject_consistency`, `background_consistency`, `motion_smoothness`, `dynamic_degree`,
  `aesthetic_quality`, `imaging_quality`. `evaluate.py` (lu) : `device = torch.device("cuda")` en dur ; la classe
  `VBench(device, …)` et les modules par dimension prennent un `device` en paramètre.
- Composants par dimension (code lu, `vbench/utils.py` et modules) :
  - `dynamic_degree` : RAFT (`vbench/third_party/RAFT`) ; seuil `thres = 6.0*(scale/256.0)`, `count_num =
    round(4*(count/16.0))`. RAFT : BSD-3.
  - `subject_consistency` : DINO ViT-B/16 (`facebookresearch/dino`, Apache-2.0).
  - `background_consistency` : CLIP (OpenAI, MIT).
  - `aesthetic_quality` : CLIP ViT-L/14 + `LAION-AI/aesthetic-predictor` (MIT).
  - `motion_smoothness` : **AMT** (`vbench/third_party/amt`, poids `amt-s.pth`) ; LICENSE `MCG-NKU/AMT` = **CC BY-NC 4.0**.
  - `imaging_quality` : `from pyiqa.archs.musiq_arch import MUSIQ`, poids `musiq_spaq_ckpt` ; LICENSE
    `chaofengc/IQA-PyTorch` = **PolyForm Noncommercial License 1.0.0**.
- VBench-2.0 : CUDA 11.8, LLaVA-Video-7B-Qwen2 et Qwen2.5-7B-Instruct, « one dimension per GPU » ; custom pour
  Human_Anatomy, Human_Identity, Human_Clothes, Diversity, Multi-View_Consistency. Composants : CoTracker (LICENSE **CC BY-NC
  4.0**), InsightFace (README : modèles « for non-commercial research purposes only »), YOLO-World (GPL-3.0), CLIP, RAFT.

**Pour la troupe (inférence)**
- Ne pas dupliquer VBench en bloc pour un pipeline monétisé. Copier les quatre dimensions propres (RAFT, DINO, CLIP,
  LAION) dans notre module `qa/` en citant VBench (Apache-2.0 exige de conserver la notice). Remplacer
  `motion_smoothness` par une erreur d'interpolation RIFE (MIT : prédire l'image paire à partir des impaires, même
  principe qu'AMT) et `imaging_quality` par UVQ (Apache-2.0, section 3.20).
- Ces quatre dimensions tournent probablement sur CPU en passant `device=cpu` à l'API Python, à basse résolution
  (inférence ; non testé). VBench-2.0 reste hors de portée du conteneur et chargé de composants NC.

### 3.16 RAFT — `princeton-vl/RAFT` (+ SEA-RAFT, + torchvision)

**Faits lus**
- BSD-3-Clause ; 4,1k étoiles ; dernier commit 24/08/2025 (« fix_altcorr ») ; « tested with PyTorch 1.6 and Cuda
  10.1 » ; poids `raft-things.pth` etc. via `download_models.sh` ou Google Drive — [dépôt](https://github.com/princeton-vl/RAFT).
- SEA-RAFT : BSD-3-Clause (« Copyright (c) 2024, Princeton Vision & Learning Lab ») ; 717 étoiles ; « at least 2.3x faster
  than existing methods » ; poids sur Google Drive et Hugging Face ; « developed with pytorch 2.2.0, CUDA 12.2 », CPU
  non mentionné — [dépôt](https://github.com/princeton-vl/SEA-RAFT).
- torchvision fournit `raft_large` et `raft_small` (LICENSE torchvision : BSD-3) — [doc](https://docs.pytorch.org/vision/main/models/raft.html).

**Pour la troupe (inférence)**
- Cœur de la **porte « rythme »** qui a fait échouer l'ancien rig Blender (« motion 0.0271, coverage 0.53 ») : amplitude
  du flux (top 5 % comme VBench), part des paires d'images au-dessus du seuil (couverture), et dérivée seconde (à-coups).
  `torchvision.models.optical_flow.raft_small` sur CPU à 256–384 px est la voie la plus simple (pas de code à cloner).

### 3.17 syncnet_python — `joonson/syncnet_python` (synchro labiale)

**Faits lus**
- LICENSE MIT (« Copyright (c) 2016-present Joon Son Chung ») ; 913 étoiles, 28 commits ; derniers commits « modernize
  code », « logging changes » (17/04/2026) — [dépôt](https://github.com/joonson/syncnet_python).
- « The code automatically detects and uses a CUDA GPU if available, and falls back to CPU otherwise » ;
  `environment-cpu.yml` (Python 3.10, PyTorch 2.5.1, scenedetect, opencv). Trois étapes run_pipeline → run_syncnet →
  run_visualise. Sorties de démo : « AV offset: 3, Min dist: 5.353, Confidence: 10.021 ».
- `download_model.sh` : `syncnet_v2.model` et `sfd_face.pth` (détecteur S3FD) téléchargés depuis robots.ox.ac.uk. La
  page Oxford VGG dit : le modèle « can be used for research purposes under Creative Commons Attribution License » ;
  aucune ligne sur l'usage commercial — [page VGG](https://www.robots.ox.ac.uk/~vgg/software/lipsync/).

**Pour la troupe (inférence)**
- Seule mesure de synchro labiale à licence de code propre et qui tourne sur CPU. Deux réserves : (1) le statut des
  poids (« research purposes » + CC BY) est à faire trancher ; c'est un outil de mesure interne, ses sorties ne finissent
  pas dans la vidéo, mais cela reste un usage dans une activité commerciale ; (2) le détecteur S3FD est entraîné sur des
  visages réels : il faut vérifier qu'il trouve les visages Pixar de la troupe, sinon fournir le recadrage de la bouche
  à partir des positions connues des personnages.

### 3.18 VideoAlign / VideoReward — `KlingAIResearch/VideoAlign`

**Faits lus**
- LICENSE MIT (« Copyright (c) 2025 Kling Team, Kuaishou Technology »), ajoutée le **24/09/2025** ; 518 étoiles,
  18 commits. Le README clone `KwaiVGI/VideoAlign` — [dépôt](https://github.com/KlingAIResearch/VideoAlign).
- Poids `KlingTeam/VideoReward` : tag `apache-2.0`, `base_model: Qwen/Qwen2-VL-2B-Instruct` (API HF). Trois notes :
  Visual Quality, Motion Quality, Text Alignment ; usages « data filtering, guidance, reject sampling, DPO ».
- `inference.py` (lu) : `VideoVLMRewardInference(..., device='cuda', dtype=torch.bfloat16)`, avec
  `disable_flash_attn2=False` codé en dur et une branche `fp16=True if dtype == torch.float16`. Installation :
  `flash-attn==2.5.8`.

**Pour la troupe (inférence)**
- Juge « mouvement » pour le **best-of-N** (3–4 graines par plan, garder la meilleure note MQ). Sur T4 : passer
  `dtype=torch.float16` et mettre `disable_flash_attn2=True` (correctif d'une ligne) ; ~2 Md de paramètres tiennent
  largement en 16 Go. Sur CPU : possible en théorie, très lent. Rappel de `fluidite_qualite_controle.md` : le modèle peut
  être « trompé » (reward hacking), donc classer et rejeter, pas optimiser contre lui.

### 3.19 DefectVideoReward — `CaoruiLi/DefectVideoReward` (Hugging Face seulement)

**Faits lus**
- Fiche HF : `license: apache-2.0`, base Qwen3-VL-8B-Instruct, créée le 27/07/2026 ; « about 9B parameters in BF16 » ;
  pas de dépôt GitHub ni d'arXiv ; extrait `Qwen3VLForConditionalGeneration.from_pretrained(..., torch_dtype="bfloat16",
  device_map="auto")`. Sortie JSON `{"defects": [{"issue": "...", "weight": 1|2|3}], "score": 7}`. Entraînement : SFT sur
  des listes de défauts annotées, puis GRPO 800 pas sur des paires de VideoGen-RewardBench —
  [fiche](https://huggingface.co/CaoruiLi/DefectVideoReward).

**Pour la troupe (inférence)**
- Le seul « code » à dupliquer est l'extrait `transformers` et le prompt système de la fiche. Son intérêt : il **nomme**
  les défauts (mains, visage qui fond, objet qui disparaît), ce qui permet de choisir entre régénérer et retoucher.
  ~18 Go en 16 bits : sur Kaggle, répartir sur les deux T4 (`device_map="auto"`, fp16) ou charger en 4/8 bits. Hors de
  portée du CPU du conteneur. Le modèle a 40 téléchargements : il n'a pas encore fait ses preuves.

### 3.20 UVQ — `google/uvq` (qualité technique sans référence, CPU)

**Faits lus**
- Apache-2.0 ; 155 étoiles, 41 commits ; dernier commit 29/09/2026 (« Fix UVQ 1.5 frame selection and speed up CPU
  inference (#31) ») — [dépôt](https://github.com/google/uvq).
- « no-reference perceptual video quality assessment model that is designed to work well on user-generated content » ;
  `uvq_inference.py --model_version 1.5` ; mode lot (fichier `.txt`) ; options `--device cpu|cuda`, `--fps` (défaut 1),
  `--threads`, **`--transpose` « (e.g., for portrait videos) »**, `--output_all_stats` (scores par image).
- Chronos du README (AMD EPYC 7B13, vidéo 1080p de 20 s, 1 image/s) : 8 cœurs ~13,8 s ; **4 cœurs ~17,9 s** ; 2 cœurs
  ~26,5 s ; 1 cœur ~43,6 s.

**Pour la troupe (inférence)**
- Remplaçant propre de `imaging_quality` (MUSIQ, NC) : détecte flou, artefacts de compression et dégradations après
  upscale ou réencodage. Il a été entraîné sur des vidéos réelles d'utilisateurs, pas sur de l'animation 3D : utiliser
  ses notes **en relatif** (avant/après upscale, plan A contre plan B), pas comme seuil absolu.

---

## 4. Pile recommandée à dupliquer (inférence)

**Dans le conteneur CPU (gratuit, sans quota)** — porte qualité n° 1, puis retouches légères :
1. Décodage ffmpeg à 256–384 px.
2. Mouvement : `torchvision` `raft_small` → amplitude (top 5 %), couverture, à-coups. Porte **à deux bornes**
   (ni figé, ni chaotique), calibrée sur 20–30 clips « bons ».
3. Identité : DINO (code `subject_consistency` de VBench, Apache) sur les recadrages de chaque personnage contre sa
   planche ; écart de teinte de peau (Lab) contre la planche.
4. Qualité technique : UVQ 1.5 (`--device cpu --transpose`).
5. Synchro labiale : syncnet_python (environnement CPU) sur les plans dialogués, si S3FD détecte les visages.
6. Couleur : color-matcher (`hm-mkl-hm`) plan par plan vers l'image de référence de la scène.
7. Secours CPU : Practical-RIFE ×2 ou rife-ncnn-vulkan `-g -1` (à chronométrer avant usage en production).

**Sur Kaggle T4×2 (≈ 30 h/semaine)** — génération, puis :
1. Best-of-N : VideoReward (fp16, FA2 coupée) note MQ ; DefectVideoReward (T4×2 ou 4 bits) liste les défauts des
   gagnants.
2. Interpolation : Practical-RIFE 4.25 `--fp16 --multi=2` (FILM via le portage dajes pour les plans très rapides).
3. Upscale : CLI SeedVR2 numz (3B GGUF, `--cuda_device 0,1`, `--color_correction lab`) ; repli rapide
   Real-ESRGAN `realesr-animevideov3` ; FlashVSR Ultra Fast (`fp16`) en comparaison.
4. Deflicker seulement sur les plans signalés : FastBlend (sans poids) avant All-In-One-Deflicker (poids sans licence).
5. Repasser la porte n° 1 (le CPU suffit) sur la sortie finale.

---

## 5. Écartés ou à manier avec précaution

| Élément | Raison | Source |
|---|---|---|
| GIMM-VFI et `kijai/ComfyUI-GIMM-VFI` | S-Lab License 1.0 : non commercial | [LICENSE](https://github.com/GSeanCDAT/GIMM-VFI/blob/main/LICENSE) |
| AMT (`motion_smoothness` de VBench, nœud AMT de ComfyUI-Frame-Interpolation) | CC BY-NC 4.0 | [LICENSE AMT](https://github.com/MCG-NKU/AMT/blob/main/LICENSE) |
| pyiqa / IQA-PyTorch (MUSIQ de `imaging_quality`) | PolyForm Noncommercial 1.0.0 | [LICENSE IQA-PyTorch](https://github.com/chaofengc/IQA-PyTorch/blob/main/LICENSE) |
| DOVER (qualité vidéo) | S-Lab License 1.0 : non commercial | [LICENSE DOVER](https://github.com/VQAssessment/DOVER/blob/master/LICENSE) |
| CoTracker, InsightFace (VBench-2.0) | CC BY-NC 4.0 ; modèles « non-commercial research purposes only » | [LICENSE CoTracker](https://github.com/facebookresearch/co-tracker/blob/main/LICENSE.md) ; [README InsightFace](https://github.com/deepinsight/insightface) |
| Q-Save (juge VLM) | CC BY-NC-SA 4.0 (selon `fluidite_qualite_controle.md`) | [arXiv 2511.18825](https://arxiv.org/html/2511.18825v2) |
| Poids All-In-One-Deflicker | dépôt de poids sans licence | [cvpr2023_deflicker_public_folder](https://github.com/ChenyangLEI/cvpr2023_deflicker_public_folder) |
| Poids SyncNet | « research purposes under Creative Commons Attribution License » : ambigu | [page VGG](https://www.robots.ox.ac.uk/~vgg/software/lipsync/) |
| SeedVR officiel, FlashVSR officiel | pas de chemin T4 (H100, flash_attn, apex ; Block-Sparse testé A100/H200) | sections 3.6 et 3.8 |

---

## 6. Gaps

- **Aucun chrono CPU publié** pour Practical-RIFE, rife-ncnn-vulkan (`-g -1`), Real-ESRGAN, RAFT-small ou SyncNet sur
  4 cœurs. Seul UVQ en donne un. À mesurer dans le conteneur avant de décider ce qui reste sur CPU.
- **Aucun retour public sur T4** pour la CLI SeedVR2, FlashVSR Ultra Fast (`fp16`) ou FlashVSR+ (SDPA) : la mention
  « RTX 20XX » / « Turing » est l'indice le plus proche. Le temps d'ajustement d'atlas d'All-In-One-Deflicker n'est pas
  publié.
- **Licences non lues** : poids FILM (Google Drive), autres modèles de ComfyUI-Frame-Interpolation (GMFSS, IFRNet,
  M2M…), poids RAFT/SEA-RAFT (jeux de données FlyingChairs, Sintel, KITTI), points de contrôle de VideoGen-RewardBench
  ayant servi à DefectVideoReward.
- Aucune validation de S3FD, DINO, UVQ ou VideoReward sur des personnages 3D stylisés à peau foncée.
- `rife-ncnn-vulkan` en mode CPU sur Linux sans pilote Vulkan : non vérifié (lavapipe ou chargeur seul ?).
- FlashVSR+ a deux jours : ni retour communautaire, ni portage ComfyUI recensé au 16/10/2026.

## Sources principales

- Dépôts GitHub cités dans le tableau (pages, `LICENSE`, `README.md`, flux `commits/*.atom`), lus le 16/10/2026.
- API Hugging Face : [FlashVSR](https://huggingface.co/api/models/JunhaoZhuang/FlashVSR), [FlashVSR-v1.1](https://huggingface.co/api/models/JunhaoZhuang/FlashVSR-v1.1), [FlashVSR_plus](https://huggingface.co/api/models/ruchangyao/FlashVSR_plus), [SeedVR2-3B](https://huggingface.co/api/models/ByteDance-Seed/SeedVR2-3B), [numz/SeedVR2_comfyUI](https://huggingface.co/api/models/numz/SeedVR2_comfyUI), [cmeka/SeedVR2-GGUF](https://huggingface.co/api/models/cmeka/SeedVR2-GGUF), [KlingTeam/VideoReward](https://huggingface.co/api/models/KlingTeam/VideoReward), [DefectVideoReward](https://huggingface.co/api/models/CaoruiLi/DefectVideoReward), [GSean/GIMM-VFI](https://huggingface.co/api/models/GSean/GIMM-VFI).
- Recherche d'appoint : [AInVFX, SeedVR2 v2.5 sur 8 Go](https://www.ainvfx.com/blog/seedvr2-v2-5-the-complete-redesign-that-makes-7b-models-run-on-8gb-gpus/) (texte du développeur de l'outil, à tester) ; [AEmotionStudio/SeedVR2-models](https://huggingface.co/AEmotionStudio/SeedVR2-models/blob/main/README.md) (7B Q4_K_M ≈ 4,6 Go).
