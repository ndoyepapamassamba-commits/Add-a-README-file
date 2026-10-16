# Codes moteurs à dupliquer pour « le moteur de la troupe » — dépôts de moteurs vidéo ouverts (finder « moteurs ») — état au 16/10/2026

**Méthode (16/10/2026).** Pour chaque dépôt : clone superficiel **sans extraction de fichiers**
(`git clone --depth 1 --filter=blob:none --no-checkout`), puis lecture de `LICENSE` et `README.md` par `git show`.
**Aucun code des dépôts n'a été exécuté, aucun poids n'a été téléchargé.** « Dernier commit » = date du commit `HEAD`
de la branche par défaut. Étoiles = valeur arrondie affichée par la page GitHub (lue via WebFetch le 16/10/2026).
Licences des **poids** = tags `license:` de l'API Hugging Face (déclarées, texte non relu sauf mention « lu »).
« Dérivé » = estimation de ma part, pas une mesure. Les notes voisines (`modeles_ouverts_2026.md`,
`anatomie_code_moteur_ouvert.md`, `calcul_et_couts.md`) couvrent déjà les modèles, leurs licences et les chronos :
je ne les répète pas, je les cite.

Rappel des contraintes : budget zéro (Kaggle 2×T4 16 Go ≈ 30 h/semaine, pas de bf16 / FP8 / FlashAttention-2 sur T4 ;
HF ZeroGPU 5 min/jour ; conteneur 4 CPU / 15 Go RAM sans GPU) ; TikTok **monétisé** → licence commerciale du code
**et** des sorties exigée ; aucune création de compte.

---

## 0. En bref

**À dupliquer en priorité (licence propre + utilisable sur T4) :**
1. **`Wan-Video/Wan2.1`** (Apache-2.0) — le moteur de base à forker : 1,3B tient en 8,19 Go, VACE 1,3B inclus
   (référence → vidéo pour tenir les personnages), code court (≈ 8 400 lignes Python dans `wan/`).
2. **`Wan-Video/Wan2.2`** (Apache-2.0) — TI2V-5B, seul modèle Apache avec **9:16 natif 704×1280** ; Animate et S2V.
3. **`modelscope/DiffSynth-Studio`** (Apache-2.0) et **`hao-ai-lab/FastVideo`** (Apache-2.0) — les « châssis » :
   une seule base de code qui charge Wan, LTX, Hunyuan, Kandinsky, H3…, avec entraînement LoRA / complet et
   distillation (FastVideo : DMD2, Self-Forcing causal).
4. **`PKU-YuanGroup/Helios`** (Apache-2.0, nouveau 2026) — vidéos d'**une minute** autorégressives, base Wan2.1-14B,
   code d'entraînement publié, « ~6GB of VRAM » avec délestage par groupes : la piste la plus directe vers 25–60 s.
5. **`kandinskylab/kandinsky-6`** (MIT, nouveau 2026) — **audio + vidéo + lip-sync** en 3B (Lite) ; tourne sur une
   carte 16 Go grand public (RTX 5060 Ti) avec délestage par blocs.
6. **`NVlabs/Sana`** (SANA-Video 2B, Apache code **et** poids) — DiT à attention linéaire, petit, code d'entraînement
   complet ; bon candidat pour un « mini-moteur » maison affiné sur la troupe.
7. **Pour apprendre et écrire notre mini-moteur :** `Shubham2376G/NanoI2V` (MIT, 2026 — VAE causal 3D + DiT RoPE 3D +
   flow matching + conditionnement texte/image, ≈ 5 600 lignes), `cloneofsimo/minRF` (Apache, `rf.py` 161 lignes +
   `dit.py` 363 lignes), `lucidrains/rectified-flow-pytorch` (MIT, script Moving-MNIST vidéo de 177 lignes),
   `Vchitect/Latte` (Apache, DiT vidéo latent avec entraînement).

**Pièges de licence découverts pendant cette recherche (nouveaux par rapport aux notes précédentes) :**
- `yihao-meng/HoloCine` = **CC BY-NC-SA 4.0** (non commercial) ; `krea-ai/realtime-video` = **CC BY-NC-SA 4.0** ;
  poids `LongLive-1.3B` = **cc-by-nc-sa-4.0** (le code LongLive est Apache) ; `facebookresearch/DiT` et `RERV/VDT`
  = **CC BY-NC 4.0**.
- `guandeh17/Self-Forcing` est Apache-2.0 mais son README dit « built on top of the open-source implementation of
  CausVid », et `tianweiy/CausVid` est **CC BY-NC-SA 4.0** → provenance du code à vérifier avant de le copier.
- `Lightricks/LTX-2` : la licence LTX-2.x couvre aussi le **code** (« inference-enabling code, training-enabling
  code, … accompanying source code ») → forker LTX-2 = accepter la licence (gratuite < 10 M$ de CA).
- `hpcaitech/Open-Sora` : code Apache, mais l'étape 1 d'entraînement part de **FLUX.1-dev** (`--model.from_pretrained
  ckpts/flux1-dev-fused-rope.safetensors`) et le mode t2i2v appelle FLUX → poids Open-Sora 2.0 déclarés Apache mais
  dérivés d'un modèle sous licence non commerciale : **à faire vérifier**.
- `lllyasviel/FramePack` : code Apache, poids `FramePackI2V_HY` **sans tag de licence** et dérivés de HunyuanVideo
  (licence Tencent, ne s'applique pas dans l'UE / au R-U).
- `kandinskylab/kandinsky-6` : MIT, mais le VAE vidéo est `AutoencoderKLHunyuanVideo` → provenance à vérifier.
- `GAIR-NLP/daVinci-MagiHuman` : README « Apache License 2.0 », mais **aucun fichier LICENSE** dans le dépôt.
- SANA-Video **2.0** (5B) s'appuie sur le **VAE LTX-2.3** (licence LTX) ; SANA-Video 2B (v1) utilise le VAE Wan2.1 (Apache).
- CogVideoX-5B / 1.5 : licence CogVideoX qui exige un **enregistrement** sur open.bigmodel.cn (= création de compte,
  exclue) et ≤ 1 M visites/mois ; **CogVideoX-2B est Apache**.

---

## 1. Tableau de synthèse (moteurs de base, frameworks, nouveaux 2026)

| # | Dépôt (URL canonique) | Licence code / poids | ★ (16/10) | Dernier commit | T4 16 Go | CPU | Verdict troupe |
|---|---|---|---|---|---|---|---|
| 1 | [Wan-Video/Wan2.1](https://github.com/Wan-Video/Wan2.1) | Apache-2.0 / Apache-2.0 | 17,2 k | 2026-03-05 | **oui** (1,3B fp16, 8,19 Go officiel) | GGUF via stable-diffusion.cpp (lent, non mesuré) | **À forker (base)** |
| 2 | [Wan-Video/Wan2.2](https://github.com/Wan-Video/Wan2.2) | Apache-2.0 / Apache-2.0 | 18,0 k | 2026-09-21 | **oui à 480p** (TI2V-5B GGUF/offload) ; 14B limite | GGUF possible, irréaliste en production | **À forker (qualité, 9:16)** |
| 3 | [hpcaitech/Open-Sora](https://github.com/hpcaitech/Open-Sora) | Apache-2.0 / Apache-2.0 déclaré (init. FLUX.1-dev) | 29,9 k | 2026-04-09 | 11B : limite (256px + offload) ; entraînement : non | non | **Lire / copier la chaîne d'entraînement** |
| 4 | [Lightricks/LTX-2](https://github.com/Lightricks/LTX-2) | **LTX-2.x Community (code inclus)** / idem, < 10 M$ CA | 9,8 k | 2026-10-13 | 2×T4 via Q4/INT8 (carnets tiers) | non | Option audio-vidéo, pas « libre » |
| 5 | [Lightricks/LTX-Video](https://github.com/Lightricks/LTX-Video) | Apache-2.0 / LTXV Open Weights 0.X (< 10 M$) ou OpenRAIL-M (2B 0.9.5) | 11,1 k | 2026-01-06 (renvoi vers LTX-2) | **probable** (2B distillé 6,3 Go) | non | Petit moteur rapide, à tester en fp16 |
| 6 | [Tencent-Hunyuan/HunyuanVideo-1.5](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5) | Tencent Hunyuan Community (**hors UE/R-U/Corée**) | 4,6 k | 2026-04-10 | limite (14 Go avec offload) | non | Lire seulement (licence) |
| 7 | [kandinskylab/kandinsky-6](https://github.com/kandinskylab/kandinsky-6) | MIT / MIT (VAE HunyuanVideo à vérifier) | 348 | 2026-10-13 | **plausible** (Lite 3B, 16 Go grand public testé) | encodeur Qwen2.5-VL sur CPU possible | **À forker (audio+vidéo)** |
| 8 | [GAIR-NLP/daVinci-MagiHuman](https://github.com/GAIR-NLP/daVinci-MagiHuman) | Apache-2.0 (README, **pas de LICENSE**) / Apache-2.0 | 2,1 k | 2026-04-11 | non en natif (15B, FA3/Hopper) | non | Étudier (français listé) |
| 9 | [character-ai/Ovi](https://github.com/character-ai/Ovi) | Apache-2.0 / Apache-2.0 | 1,8 k | 2025-11-14 | non (24 Go min., matmuls bf16) | non | Lire (architecture double tour audio) |
| 10 | [SkyworkAI/SkyReels-V2](https://github.com/SkyworkAI/SkyReels-V2) (+ [V3](https://github.com/SkyworkAI/SkyReels-V3)) | Skywork Community (commercial annoncé OK, PDF non lu) | 7,7 k (V3 : 581) | 2026-01-29 (V3 : 2026-01-30) | DF-1,3B : limite (14,7 Go pic à 540p) | non | Étudier le « Diffusion Forcing » (vidéo infinie) |
| 11 | [SandAI-org/MAGI-1](https://github.com/SandAI-org/MAGI-1) | Apache-2.0 / Apache-2.0 | 3,8 k | 2026-06-17 | non (4,5B : 24 Go ; quant FP8 : 12 Go mais FP8) | non | Lire (autorégressif par blocs) |
| 12 | [meituan-longcat/LongCat-Video](https://github.com/meituan-longcat/LongCat-Video) | MIT / MIT | 9,2 k | 2026-05-27 | non en natif (13,6B ; INT8 avatar seulement) | non | Étudier (continuation + avatar multi-perso) |
| 13 | [genmoai/mochi](https://github.com/genmoai/mochi) | Apache-2.0 / Apache-2.0 | 3,8 k | 2026-10-06 | non (≈ 60 Go mono-GPU) | non | Lire seulement |
| 14 | [zai-org/CogVideo](https://github.com/zai-org/CogVideo) | Apache-2.0 / 2B Apache ; 5B licence CogVideoX (enregistrement) | 13,1 k | 2025-11-04 | **oui** (2B : **FP16 recommandé**, « 4GB minimum ») | non | Moteur école sur T4 (qualité 2024) |
| 15 | [stepfun-ai/Step-Video-T2V](https://github.com/stepfun-ai/Step-Video-T2V) | MIT / MIT | 3,2 k | 2025-03-17 | non (30B, ≈ 78 Go) | non | Écarter (inactif, trop gros) |
| 16 | [PKU-YuanGroup/Helios](https://github.com/PKU-YuanGroup/Helios) | Apache-2.0 / Apache-2.0 (base Wan2.1-T2V-14B) | 2,2 k | 2026-08-24 | **à tester** (« ~6GB of VRAM » + délestage ; RAM hôte critique) | non | **À forker (plans longs)** |
| 17 | [NVlabs/Sana](https://github.com/NVlabs/Sana) (SANA-Video) | Apache-2.0 / Apache-2.0 | 9,3 k | 2026-10-11 | **probable** (2B ; à tester en fp16) | non | **À forker (mini-moteur rapide)** |
| 18 | [Robbyant/lingbot-video](https://github.com/Robbyant/lingbot-video) | Apache-2.0 / Apache-2.0 | 974 | 2026-09-18 | Dense 1,3B : oui ; MoE 30B-A3B : délestage lourd | GGUF 1,3B communautaire (15/10/2026) | Étudier (orienté robotique) |
| 19 | [MiniMax-AI/MiniMax-H3](https://github.com/MiniMax-AI/MiniMax-H3) | **H3 Community (hors UE, R-U, USA, Corée)** ; pas de LICENSE dans le dépôt GitHub | 10,0 k | 2026-08-15 | 2×T4 INT8 (carnet tiers) | non | **Ne pas dupliquer pour la prod monétisée** |
| 20 | [hao-ai-lab/FastVideo](https://github.com/hao-ai-lab/FastVideo) | Apache-2.0 | 4,6 k | 2026-10-15 | oui pour 1,3B/5B (`num_gpus=1` conseillé sur T4) ; noyaux VSA = GPU récents | non | **À forker (distillation, inférence unifiée)** |
| 21 | [modelscope/DiffSynth-Studio](https://github.com/modelscope/DiffSynth-Studio) | Apache-2.0 | 13,3 k | 2026-10-15 | oui (gestion VRAM, LoRA Wan 1,3B/5B) | non | **À forker (châssis + LoRA)** |
| 22 | [huggingface/finetrainers](https://github.com/huggingface/finetrainers) | Apache-2.0 | 1,4 k | 2026-09-23 (CI) | oui pour LoRA petits modèles (fp16 à surveiller) | non | Lire/forker (spécification de modèle propre) |
| 23 | [guandeh17/Self-Forcing](https://github.com/guandeh17/Self-Forcing) | Apache-2.0 (dérivé de CausVid **CC BY-NC-SA**) / Apache-2.0 | 3,6 k | 2025-09-11 | inférence 1,3B plausible ; entraînement non (24 Go + 64 Go RAM) | non | Lire ; ne copier qu'après vérif. |
| 24 | [lllyasviel/FramePack](https://github.com/lllyasviel/FramePack) | Apache-2.0 / poids sans licence, base HunyuanVideo | 17,3 k | 2025-10-15 | 6 Go annoncés, mais Turing « not tested » | non | Copier l'idée (contexte compressé), pas les poids |
| 25 | [yihao-meng/HoloCine](https://github.com/yihao-meng/HoloCine) | **CC BY-NC-SA 4.0** | — | 2025-11-26 | non (14B) | non | **Lecture seule (non commercial)** |
| 26 | [leejet/stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) | MIT | 7,7 k | 2026-10-16 | oui (CUDA) | **oui** (AVX/AVX2/AVX512, GGUF) | Voie CPU / C++ de secours |

Sources du tableau : dépôts clonés le 16/10/2026 (dates `HEAD`, fichiers `LICENSE`) ; étoiles lues sur les pages
GitHub ; tags de licence des poids via l'API HF (`/api/models/<id>`). Détails et citations par fiche ci-dessous.

---

## 2. Fiches détaillées — moteurs de base

### 2.1 Wan2.1 — `https://github.com/Wan-Video/Wan2.1` — **à forker comme base**
- **Quoi** : T2V 1,3B / 14B, I2V 14B, FLF2V 14B (première + dernière image), **VACE 1,3B / 14B** (référence, masque,
  V2V) — tâches `flf2v-14B`, `vace-1.3B`, `vace-14B` dans `generate.py` ; modules `wan/modules/model.py` (631 lignes),
  `vae.py` (663), `vace_model.py` (250), `text2video.py` (271) ; total `wan/` ≈ 8 390 lignes Python (compté le 16/10).
- **Licence** : `LICENSE.txt` Apache-2.0 ; README : « The models in this repository are licensed under the Apache 2.0
  License. We claim no rights over the your generated contents ».
- **T4** : « The T2V-1.3B model requires only 8.19 GB VRAM … 5-second 480P video on an RTX 4090 in about 4 minutes » ;
  en cas d'OOM `--offload_model True --t5_cpu`. Sur T4 : fp16 (le README montre `torch.bfloat16` → convertir),
  480p ; 50 pas ≈ 15–25 min / clip de 5 s, 3–4 pas distillés (FastWan 1,3B, Apache) ≈ 2–4 min (**dérivé**, cf.
  `modeles_ouverts_2026.md` Q3).
- **CPU** : génération non réaliste ; mais l'encodeur umT5 peut tourner sur CPU (`--t5_cpu`) → **pré-calculer les
  embeddings des prompts dans notre conteneur** puis envoyer seulement le DiT sur Kaggle.
- **Pourquoi le dupliquer** : plus petit moteur Apache complet et lisible, VACE 1,3B = référence personnage sur T4,
  écosystème le plus large (LoRA Pixar Apache, LightX2V, FastWan, Self-Forcing, LongLive, Helios, SkyReels-V2 et
  SANA-Video réutilisent tous ses briques).
- **Limites** : pas de code d'entraînement officiel (le prendre chez DiffSynth-Studio / FastVideo / finetrainers) ;
  1,3B instable en 720p (« we recommend using 480P »).

### 2.2 Wan2.2 — `https://github.com/Wan-Video/Wan2.2` — **à forker pour la qualité 9:16**
- **Quoi** : TI2V-5B (VAE 16×16×4, `704*1280` natif), T2V/I2V-A14B (MoE 2 experts), Animate-14B, S2V-14B. Anatomie
  détaillée dans `anatomie_code_moteur_ouvert.md` (commit `1ea34ff`, identique au `HEAD` lu aujourd'hui).
- **Licence** : Apache-2.0 (code et poids). Dernier commit 2026-09-21. 18,0 k ★.
- **T4** : TI2V-5B officiel ≥ 24 Go ; sur T4 → GGUF Q4 (paquet ≈ 11,5 Go) + 480p, testé sur Colab T4 gratuit via
  Wan2GP (cf. `calcul_et_couts.md` §2) ; A14B → GGUF Q4 9,7 Go **par expert**, un expert par T4 sur Kaggle 2×T4.
- **CPU** : non (sauf encodeur texte et décodage VAE lent).
- **Pourquoi** : seule base Apache avec vertical natif ; Animate / S2V = briques personnage et voix ; même API que 2.1.

### 2.3 Open-Sora 2.0 — `https://github.com/hpcaitech/Open-Sora` — **la chaîne d'entraînement complète à copier**
- **Quoi** : 11B, T2V + I2V, 256px et 768px ; **code d'entraînement complet** (`configs/diffusion/train/stage1.py`,
  `stage2.py`, `stage*_i2v.py`, `demo.py`, `configs/vae/train/video_dc_ae.py`), guide `docs/train.md`, jeu
  `open-sora-pexels-45k` (≈ 250 Go), score de mouvement dans le prompt, raffineur de prompt.
- **Licence** : Apache-2.0 (code) ; poids `hpcai-tech/Open-Sora-v2` tag `apache-2.0`. **Risque** : « To finetune from
  flux-dev … `--model.from_pretrained ckpts/flux1-dev-fused-rope.safetensors` » et pipeline t2i2v « with the help of flux
  text-to-image model » → les poids dérivent de FLUX.1-dev (licence non commerciale) ; l'usage I2V seul avec nos
  propres images évite FLUX à l'inférence mais pas la question de provenance.
- **T4** : `--offload True` existe pour 256px sur 1 GPU ; 768px = 8 GPU dans les exemples. Entraînement : batchs
  « searched on H200 GPUs with 140GB memory » → hors de portée ; coût total 199,6 k$ (cf. `calcul_et_couts.md` §5).
- **Pourquoi** : c'est le meilleur **manuel de code** pour la partie que les autres ne publient pas : seaux
  résolution/durée (`bucket_config`), checkpointing sélectif, délestage des activations, entraînement du VAE.
  29,9 k ★, dernier commit 2026-04-09 (doc).

### 2.4 LTX-2 — `https://github.com/Lightricks/LTX-2` — option audio-vidéo, **pas libre**
- **Quoi** : monorepo `packages/ltx-core`, `ltx-pipelines`, `ltx-trainer` (LoRA, complet, IC-LoRA), `ltx-kernels` ;
  version 1.4.2 ; LTX-2 / 2.3 / 2.5 (19–22B + Gemma).
- **Licence** (lue) : `LICENSE` renvoie à `LICENSE-2_x` (11/08/2026) dont la définition 1.9 inclut « machine-learning
  model code, inference-enabling code, training-enabling code, fine-tuning enabling code, accompanying source code »
  publiés sur `github.com/Lightricks/LTX-2` ; seuil « annual revenues of at least $10,000,000 » → licence payante.
  Un créateur TikTok est sous le seuil, mais le code **n'est pas réutilisable librement** dans un autre moteur.
- **T4 / CPU** : carnets Kaggle 2×T4 tiers en Q4/INT8 (cf. `modeles_ouverts_2026.md` Q3) ; CPU non.
- **Pourquoi** : meilleure référence ouverte pour l'audio-vidéo conjoint, le retake, le doublage (DubIt) et un
  entraîneur maintenu (dernier commit 2026-10-13, 9,8 k ★).

### 2.5 LTX-Video (0.9.x) — `https://github.com/Lightricks/LTX-Video` — petit moteur rapide
- **Quoi** : `ltxv-2b-0.9.8-distilled` (6,3 Go), `-fp8` (4,5 Go), 13B 0.9.8 ; README : « Generate 720x480x121 videos in
  under a minute on RTX 4060 (8GB VRAM) » (projet communautaire cité) ; entraîneur séparé `LTX-Video-Trainer`
  (« full fine-tuning as well as LoRA »).
- **Licence** : code **Apache-2.0** ; poids : 2B 0.9.5 = OpenRAIL-M (lu : restrictions d'usage) ; 2B ≥ 0.9.6 et 13B =
  « LTXV Open Weights License 0.X » (lu : « for any purpose », entités ≥ 10 M$ de CA → licence payante, restrictions
  d'usage de l'annexe A à reproduire).
- **T4** : **probable** à 480p avec T5 délesté ; à valider en fp16 (modèle publié en bf16). CPU : non.
- **Pourquoi** : le plus petit moteur DiT moderne avec code Apache ; 11,1 k ★ ; dernier commit 2026-01-06 (notice de
  redirection vers LTX-2 → dépôt en fin de vie).

### 2.6 HunyuanVideo-1.5 — `https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5` — lecture seulement
- **Quoi** : 8,3B, `generate.py` + **`train.py`** (entraînement / LoRA), dossier `ComfyUI`, SR 1080p.
- **Licence** (lue) : « THIS LICENSE AGREEMENT DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA ».
  Public francophone en France → risque.
- **T4** : « Minimum GPU Memory: 14 GB (with model offloading enabled) » (cf. notes) → limite. CPU : non.
- **Pourquoi** : lire `train.py` et l'attention SSTA ; ne pas l'intégrer à la production monétisée. 4,6 k ★, 2026-04-10.

### 2.7 Kandinsky 6.0 — `https://github.com/kandinskylab/kandinsky-6` — **à forker (audio + vidéo, MIT)**
- **Quoi** : Lite 3B et Pro 29B, « 5-second video clips with synchronized 44 kHz audio, including lip-sync », T2AV et
  TI2AV ; parole entre balises `<S>…<E>` ; distillés 10 pas (`PiflowScheduler`) ; points de contrôle `lite-pretrain` /
  `pro-pretrain` publiés (bons points de départ pour un affinage) ; Diffusers, ComfyUI, vLLM-Omni, SGLang, FastVideo.
  Pas de script d'entraînement dans le dépôt.
- **Composants (API HF, Lite distill)** : transformer 6,38 Go, encodeur **Qwen2.5-VL** 16,6 Go + CLIP 0,49 Go, VAE
  `AutoencoderKLHunyuanVideo` 0,99 Go, VAE audio MMAudio 1,71 Go + vocodeur 0,49 Go.
- **Licence** : MIT (code 2026 Kandinsky Lab ; poids tag `mit`). À vérifier : provenance du VAE HunyuanVideo et des
  poids MMAudio.
- **T4** : le README mesure **RTX 5060 Ti (16 Go)** en délestage par blocs : Lite SD **1 310 s** non distillé pour 5 s.
  Sur T4, plus lent (pas de SageAttention2++ ni bf16) : ≈ 40–60 min non distillé, ≈ 10–15 min distillé 10 pas
  (**dérivé**, non mesuré). Encodeur 16,6 Go → à faire tourner sur le 2ᵉ T4 ou en pré-calcul.
- **CPU** : pré-calcul des embeddings Qwen2.5-VL possible en RAM (≈ 16,6 Go bf16 → trop juste dans 15 Go ; quantifier).
- **Pourquoi** : seule pile **MIT** qui génère voix + lèvres + image en 3B ; dernier commit 2026-10-13 ; 348 ★
  (jeune). Le français n'est pas documenté.

### 2.8 daVinci-MagiHuman — `https://github.com/GAIR-NLP/daVinci-MagiHuman` — étudier
- **Quoi** : 15B audio-vidéo centré humain, « 5-second 256p video in 2 seconds … 1080p in 38 seconds on a single H100 »,
  « Turbo VAE Decoder », gating par tête d'attention ; français listé (cf. notes). Inférence seule.
- **Licence** : README « released under the Apache License 2.0 » ; poids HF `apache-2.0` ; **aucun fichier LICENSE**
  à la racine du dépôt (constat du 16/10/2026) → demander/attendre l'ajout avant de vendoriser le code.
- **T4** : non en natif (installation FlashAttention Hopper) ; WanGP le prend en charge (cf. notes). CPU : non.
- **Pourquoi** : meilleure intelligibilité de la parole publiée parmi les ouverts (WER 14,6 %) ; architecture
  mono-flux à lire. 2,1 k ★, 2026-04-11.

### 2.9 Ovi — `https://github.com/character-ai/Ovi` — lire
- Apache-2.0 (code et poids), 11B = vidéo Wan2.2-5B + tour audio 5B jumelle ; 24 Go minimum, « still uses bf16
  matmuls » → **pas T4**. Intéressant pour comprendre la fusion croisée audio↔vidéo. 1,8 k ★, dernier commit
  2025-11-14 (peu actif).

### 2.10 SkyReels V2 / V3 — `https://github.com/SkyworkAI/SkyReels-V2`, `https://github.com/SkyworkAI/SkyReels-V3`
- **Quoi** : V2 = **Diffusion Forcing** (`generate_video_df.py`) pour vidéo de longueur arbitraire, modèles
  **DF-1,3B-540P** et 14B, `skycaptioner_v1` ; V3 = R2V 14B (1–4 références), extension 5–30 s, avatar parlant 19B
  (audio ≤ 200 s), option `--low_vram` (FP8 poids + délestage).
- **Licence** : `LICENSE.txt` renvoie à la « Skywork Community License » (PDF non lu) : « The Skywork model supports
  commercial use » ; demande de ne pas servir le modèle sur Internet « without appropriate security reviews and
  records ». Poids HF tag `other` / `skywork-license`.
- **T4** : « Generating a 540P video using the 1.3B model requires approximately 14.7GB peak VRAM » → limite ; baisser
  `--base_num_frames`. FP8 de V3 inutile sur T4. CPU : non.
- **Pourquoi** : le code DF est la référence lisible pour enchaîner des plans longs sur une base Wan 1,3B.
  V2 7,7 k ★ (2026-01-29) ; V3 581 ★ (2026-01-30).

### 2.11 MAGI-1 — `https://github.com/SandAI-org/MAGI-1` — lire
- Apache-2.0 ; autorégressif par blocs de 24 images ; 4,5B (« at least 24GB ») ; « 4.5B-distill+fp8_quant … works on
  GPUs with at least 12GB » mais FP8 = pas sur T4 ; MAGI-1.1 24B publié le 17/06/2026. Pas de code d'entraînement.
  3,8 k ★. Voir aussi `SandAI-org/MAGI-2-preview` (Apache, 114B MoE, 8 Hopper — hors de portée).

### 2.12 LongCat-Video — `https://github.com/meituan-longcat/LongCat-Video` — étudier
- MIT ; 13,6B ; scripts T2V, I2V, **continuation**, **vidéo longue**, interactif, avatar mono/multi-audio
  (`run_demo_avatar_multi_audio_to_video.py`) ; `--use_int8` seulement pour `avatar-v1.5` ; exemples sur 2 GPU en
  parallélisme de contexte. T4 : non en natif. 9,2 k ★, 2026-05-27. Pas d'entraînement publié.

### 2.13 Mochi 1 — `https://github.com/genmoai/mochi` — lire
- Apache-2.0 ; « requires approximately 60GB VRAM when running on a single GPU » ; LoRA « on one H100 or A100 80GB » ;
  dernier commit 2026-10-06 (mention de licence MIT pour `lora.py`). Pas T4. 3,8 k ★.

### 2.14 CogVideoX — `https://github.com/zai-org/CogVideo` — moteur école sur T4
- **Quoi** : CogVideoX-2B / 5B / 1.5 ; inférence Diffusers + SAT, dossier `finetune` (LoRA Diffusers), CogKit.
- **Licence** : code Apache-2.0 ; **2B : poids Apache-2.0** (tag HF) ; 5B / 1.5 : `MODEL_LICENSE` (lu) — usage
  commercial après enregistrement sur open.bigmodel.cn, ≤ 1 M visites/mois, droit chinois → **exclu** (création de compte).
- **T4** : tableau du README : 2B « **FP16*(Recommended)** », « diffusers FP16: 4GB minimum* », INT8 3,6 Go ; « You can run
  CogVideoX-2B on older GPUs like GTX 1080TI » → **le seul modèle de la liste entraîné pour le fp16**, donc natif T4.
- **Pourquoi** : banc d'essai idéal pour monter notre boucle d'entraînement LoRA sur T4 (finetrainers le supporte)
  avant de passer à Wan. Qualité 2024 (720×480, 8 i/s). 13,1 k ★, 2025-11-04.

### 2.15 Step-Video-T2V — `https://github.com/stepfun-ai/Step-Video-T2V` — écarter
- MIT ; 30B ; ≈ 78 Go de pic (cf. notes) ; dernier commit 2025-03-17. Aucune utilité pratique sur gratuit.

---

## 3. Nouveaux venus 2026 (dépôts trouvés pendant cette recherche)

### 3.1 Helios (PKU-YuanGroup) — `https://github.com/PKU-YuanGroup/Helios` — **à forker pour les plans longs**
- **Quoi** : « minute-scale, high-quality video synthesis at 19.5 FPS on a single H100 GPU », 14B, **base
  `Wan-AI/Wan2.1-T2V-14B-Diffusers`** (tag HF), autorégressif par **33 images par segment**, sans Self-Forcing ni cache
  KV ; Base / Mid / Distilled publiés le 04/03/2026 avec « training/inference code » (`train_helios.py`) ; Diffusers
  `HeliosPyramidPipeline` ; Space HF ZeroGPU officiel.
- **Licence** : Apache-2.0 (code `LICENSE.txt` ; poids tag `apache-2.0`), base Wan Apache → **chaîne propre**.
- **T4** : « Group Offloading … The Helios model below requires `~6GB of VRAM` » (`--enable_low_vram_mode
  --group_offloading_type leaf_level`). Le délestage déplace le problème vers la **RAM hôte** (14B ≈ 28 Go en fp16) →
  à tester sur Kaggle ; fp16 sur T4 à valider (exemples en bf16). CPU : non.
- **Pourquoi** : c'est exactement le besoin 25–60 s ; 2,2 k ★ ; dernier commit 2026-08-24.

### 3.2 SANA-Video (NVIDIA) — `https://github.com/NVlabs/Sana` — **mini-moteur rapide**
- **Quoi** : 2B « Linear DiT » avec cache KV à mémoire constante, 480p/720p ; LongSANA (minute, temps réel) ;
  SANA-Video 2.0 5B (août 2026, 720p ≈ 8 s) ; **code d'entraînement** (`train_video_scripts/`, `diffusion/longsana/
  trainer/` dont `self_forcing_trainer.py`) ; tableau README : SANA-Video-2B 720p latence 36 vs 400 (Wan2.1-1.3B).
- **Licence** : code Apache-2.0 (« Sana code-base license changed to Apache 2.0 ») ; poids 2B 480p/720p et 2.0 5B tag
  `apache-2.0`, fichier LICENSE Apache dans chaque dépôt HF. Dépendances : encodeur `gemma-2-2b-it` (conditions Gemma),
  VAE Wan2.1 (2B v1, Apache) ou **VAE LTX-2.3** (2.0, licence LTX).
- **T4** : 2B → poids ≈ 4 Go en fp16 (fichier publié 8,2 Go, probablement fp32 — **dérivé**) ; « model precision BF16 »
  → débordement fp16 à tester. CPU : non.
- **Pourquoi** : le meilleur compromis « petit + Apache + code d'entraînement + vidéo longue » pour affiner sur la
  troupe ; l'exemple officiel 2.0 est un **coq cartoon** qui parle et boit. 9,3 k ★ ; dernier commit 2026-10-11.

### 3.3 LingBot-Video (Robbyant) — `https://github.com/Robbyant/lingbot-video` — étudier
- **Quoi** (09/07/2026) : Dense 1,3B et **MoE 30B-A3B** (3B actifs) + raffineur, T2I/T2V/TI2V ; prompts **JSON
  structurés** produits par un réécriveur Qwen3.6-27B + LoRA ; « dedicated to embodied intelligence ».
  Pas de script d'entraînement dans le dépôt.
- **Licence** : Apache-2.0 (code et poids). 974 ★ ; dernier commit 2026-09-18 (« release moe dmd model »).
- **T4** : Dense 1,3B → oui ; GGUF communautaire `offgrid-ai/LingBot-Video-Dense-1.3B-GGUF` (15/10/2026) ; MoE : poids
  30B à délester (RAM). CPU : GGUF 1,3B théoriquement, non mesuré.
- **Pourquoi** : idée réutilisable = **caption JSON structuré** (personnages, actions, plans) — utile pour la couche
  « mise en scène » ; données orientées robotique → style cartoon non garanti.

### 3.4 MiniMax H3 — `https://github.com/MiniMax-AI/MiniMax-H3` — **ne pas dupliquer pour la production**
- Dépôt GitHub = poids/composants Diffusers + `skills`, **pas de fichier LICENSE** ; README → « MiniMax H3 Community
  License Agreement » (territoire hors UE, R-U, USA, Corée ; « Powered by MiniMax H3 » ; cf. `modeles_ouverts_2026.md`).
  Inférence « full attention only » (attention creuse non publiée). 10,0 k ★ ; 2026-08-15.
- Utile pour du prototypage interne uniquement ; FastVideo publie FastH3 (4/8 pas) mais la licence H3 suit les dérivés.

### 3.5 Dérivés Wan 2026 « personnage » (couverts par d'autres finders)
- `ByteDance/Bernini` (Apache-2.0, avec **scripts d'entraînement** du rendu, 1,3 k ★, 2026-08-13),
  `zai-org/SCAIL-2` (Apache-2.0 sur GitHub — la fiche HF dit MIT, 1,3 k ★, 2026-08-24),
  `Wan-Video/Wan-Animate-2` (Apache-2.0, 2026-08-08). Je les signale sans fiche : étape « personnage-animation ».

---

## 4. Frameworks à forker (châssis d'entraînement / inférence)

### 4.1 DiffSynth-Studio — `https://github.com/modelscope/DiffSynth-Studio`
- Apache-2.0, 13,3 k ★, dernier commit 2026-10-15 (« add json format for quant_options in training »). Ré-implémente
  Wan 2.1/2.2/Animate, LTX-2.x, H3, Ovi… avec **gestion de VRAM** et **entraînement LoRA / complet** (cf.
  `anatomie_code_moteur_ouvert.md` §10). T4 : LoRA Wan 1,3B / TI2V-5B plausible en fp16 + checkpointing (non mesuré).
- **Pourquoi** : un seul fork donne inférence + entraînement pour toute la famille Wan (Apache) ; HoloCine est
  d'ailleurs bâti sur `diffsynth` (dossier vendorisé).

### 4.2 FastVideo — `https://github.com/hao-ai-lab/FastVideo`
- Apache-2.0, 4,6 k ★, dernier commit 2026-10-15 ; « unified post-training and real-time inference framework » :
  LoRA et affinage complet, **DMD2**, distillation creuse, « Causal distillation through Self-Forcing », FSDP2.
  Matrice : Wan 2.1/2.2 (dont FastWan 1,3B / 5B Apache), HunyuanVideo-1.5, Kandinsky 5/6, LTX-2/2.5, H3, LingBot,
  Cosmos, Self-Forcing Wan…
- **T4** : le README vise explicitement Colab/Kaggle : « On Colab/Kaggle-style machines with ~16GB host RAM, keep
  `num_gpus=1`; free-tier system memory does not grow with extra T4s, so `num_gpus>1` is likely to OOM ». Les noyaux
  VSA (attention creuse) ciblent les GPU récents → sur T4 utiliser l'attention standard (SDPA).
- **Pourquoi** : c'est le code qui fabrique les modèles « 3–4 pas » ; le jour où l'on veut distiller notre propre
  modèle troupe, c'est la recette (le calcul, lui, reste hors gratuit : cf. `calcul_et_couts.md` §5).

### 4.3 finetrainers — `https://github.com/huggingface/finetrainers`
- Apache-2.0, 1,4 k ★ ; LoRA et complet pour LTX-Video, CogVideoX, Wan T2V/I2V, HunyuanVideo, Flux ; « Memory-efficient
  single-GPU training », « Standardized model specification format for training arbitrary models », FP8 factice.
  Dernières nouveautés fonctionnelles en avril 2025 ; commit du 2026-09-23 = CI → **peu actif**.
- **Pourquoi** : sa « spécification de modèle » est un bon gabarit pour brancher **notre** mini-modèle dans une boucle
  d'entraînement existante. Avertissement du README : PyTorch < 2.5.1 → « completely black videos, OOM ».

### 4.4 Self-Forcing — `https://github.com/guandeh17/Self-Forcing`
- Code Apache-2.0, poids `gdhe17/Self-Forcing` Apache-2.0 ; base Wan2.1-T2V-1.3B ; « Nvidia GPU with at least 24 GB
  memory … 64 GB RAM » ; `train.py`, `trainer/`, `pipeline/`. 3,6 k ★ ; dernier commit 2025-09-11.
- **Risque** : « built on top of the open-source implementation of CausVid » et `tianweiy/CausVid` est CC BY-NC-SA 4.0.
  → lire pour comprendre ; **ré-écrire** plutôt que copier, ou passer par l'implémentation FastVideo (Apache).

### 4.5 FramePack — `https://github.com/lllyasviel/FramePack`
- Code Apache-2.0 (≈ 3 300 lignes Python) ; « To generate 1-minute video … the minimal required GPU memory is 6GB » ;
  « RTX 30XX, 40XX, 50XX … GTX 10XX/20XX are not tested » (T4 = Turing, non testé). Poids `FramePackI2V_HY` sans
  licence déclarée, base HunyuanVideo. 17,3 k ★ ; 2025-10-15.
- **Pourquoi** : copier l'**idée** (contexte d'images passées compressé à taille fixe) dans un moteur Wan Apache ;
  ne pas utiliser ses poids en production.

### 4.6 stable-diffusion.cpp — `https://github.com/leejet/stable-diffusion.cpp`
- MIT, 7,7 k ★, dernier commit 2026-10-16 ; C++/ggml ; README (via WebFetch) : vidéo « Wan2.1/Wan2.2 », backend CPU
  « AVX, AVX2 and AVX512 ». **Seule voie CPU** identifiée pour un moteur vidéo : utile pour des tests de fumée dans le
  conteneur (4 cœurs) ; aucun chrono CPU publié → compter en heures par clip (**dérivé**, cf. notes).

---

## 5. Réimplémentations minimales / pédagogiques (pour écrire « notre » mini-moteur)

| Dépôt | Licence | ★ | Dernier commit | Taille | Ce qu'on y apprend | T4 / CPU |
|---|---|---|---|---|---|---|
| [Shubham2376G/NanoI2V](https://github.com/Shubham2376G/NanoI2V) | MIT | 29 | 2026-07-18 | ≈ 5 600 lignes Python | **VAE causal 3D** (`vae/conv.py` CausalConv3D), **DiT** avec **RoPE 3D** et adaLN, attention croisée, **flow matching** (`flow/scheduler.py`), CFG, conditionnement texte + image, `train_vae.py` / `train_dit.py`, cours en ligne | « smoke tests … tiny model configurations and synthetic data … on a free Google Colab GPU » ; CPU : configurations minuscules plausibles |
| [cloneofsimo/minRF](https://github.com/cloneofsimo/minRF) | Apache-2.0 | 644 | 2024-07-01 | `rf.py` 161 l. + `dit.py` 363 l. ; `advanced/mmdit.py` | rectified flow + DiT les plus courts possibles (MNIST / CIFAR), MMDiT façon SD3 | T4 et CPU : oui (MNIST) |
| [lucidrains/rectified-flow-pytorch](https://github.com/lucidrains/rectified-flow-pytorch) | MIT | 488 | 2026-10-13 | `train_moving_mnist.py` 177 l. (`VideoUnet`, 10 images) + variantes (MeanFlow, NanoFlow…) | flow matching appliqué à une **vidéo jouet** ; nombreuses variantes récentes d'objectifs | T4 : oui ; CPU : lent mais faisable |
| [Vchitect/Latte](https://github.com/Vchitect/Latte) | Apache-2.0 | 1,9 k | 2026-08-10 | ≈ 13 000 lignes | DiT **vidéo latent** complet avec `train.py` (DDP), configs FaceForensics / SkyTimelapse / UCF101 / Taichi (256²), T2V Latte-1 dans Diffusers (fp16) | inférence T4 : oui (Diffusers fp16) ; entraînement 256² : lourd |
| [willisma/SiT](https://github.com/willisma/SiT) | MIT | 1,2 k | 2025-12-21 | `models.py`, `transport/` | DiT + interpolants (flow / diffusion) **sous MIT** — remplaçant légal de `facebookresearch/DiT` (CC BY-NC) | image seulement |
| [atong01/conditional-flow-matching](https://github.com/atong01/conditional-flow-matching) | MIT | — | 2026-07-21 | bibliothèque `torchcfm` | variantes de CFM (OT-CFM, etc.) prêtes à l'emploi | CPU/T4 : oui |
| [lucidrains/video-diffusion-pytorch](https://github.com/lucidrains/video-diffusion-pytorch) | MIT | 1,4 k | 2024-05-03 | 4 fichiers Python | 3D-UNet DDPM (ancienne génération), utile historiquement | T4 : 64×64 seulement |

À **ne pas** copier (non commercial) : `facebookresearch/DiT` (CC BY-NC 4.0), `RERV/VDT` (CC BY-NC 4.0).
Recherches « nano / tiny video DiT », « Moving-MNIST flow matching DiT » : rien d'autre de mieux que NanoI2V trouvé
([recherche web 16/10/2026](https://awesome.ecosyste.ms/projects/github.com%2FShubham2376G%2FNanoI2V)).

---

## 6. Écartés ou en lecture seule

| Dépôt | Raison |
|---|---|
| [yihao-meng/HoloCine](https://github.com/yihao-meng/HoloCine) | **CC BY-NC-SA 4.0** (lu) ; idée du prompt hiérarchique `[shot cut]` à ré-implémenter soi-même (cf. `couche_prompt_et_multiplans.md`) |
| [krea-ai/realtime-video](https://github.com/krea-ai/realtime-video) | **CC BY-NC-SA 4.0** (lu) |
| [NVlabs/LongLive](https://github.com/NVlabs/LongLive) | code Apache-2.0, mais poids `LongLive-1.3B` **cc-by-nc-sa-4.0** ; LongLive 2.0 (Wan2.2-TI2V-5B, 30/05/2026) et LongLive-Plug à revérifier |
| [tianweiy/CausVid](https://github.com/tianweiy/CausVid) | **CC BY-NC-SA 4.0** (lu) |
| [stepfun-ai/Step-Video-T2V](https://github.com/stepfun-ai/Step-Video-T2V) | 30B, inactif depuis 03/2025 |
| [SandAI-org/MAGI-2-preview](https://github.com/SandAI-org/MAGI-2-preview) | Apache mais 114B, 8 GPU Hopper |
| [PKU-YuanGroup/Open-Sora-Plan](https://github.com/PKU-YuanGroup/Open-Sora-Plan) | MIT (12,2 k ★) ; v1.5 « comparable to HunyuanVideo » ; son successeur est Helios (même équipe) — lire `train_causalvae.py` (VAE causal) si besoin |

---

## 7. Proposition de duplication (ordre conseillé, dérivé)

1. **Forker `Wan-Video/Wan2.1`** dans notre dépôt « moteur de la troupe » : garder `wan/modules/{model,vae,t5,
   vace_model}.py`, `wan/utils/fm_solvers*.py`, `wan/text2video.py`, `wan/vace.py` ; ajouter un mode fp16 T4 et
   l'encodage des prompts sur CPU (conteneur) → premier clip 480p sur Kaggle.
2. **Ajouter la branche TI2V-5B de `Wan2.2`** pour le 9:16 natif et l'I2V depuis nos fiches personnages.
3. **Vendoriser DiffSynth-Studio** (ou FastVideo) comme couche d'entraînement : LoRA « style troupe » puis LoRA par
   personnage sur Wan 1,3B / 5B ; tester la boucle d'abord sur **CogVideoX-2B** (fp16 natif T4).
4. **Plans longs** : prototyper Helios (Apache, 33 images par segment) ou le Diffusion Forcing de SkyReels-V2 DF-1,3B
   (vérifier la licence Skywork) ; idée FramePack (contexte compressé) à porter dans notre code.
5. **Voix + lèvres natives** : évaluer Kandinsky 6 Lite distillé (MIT) sur 2×T4 (encodeur sur GPU 1, DiT sur GPU 0).
6. **Apprentissage / mini-moteur maison** : suivre NanoI2V (même architecture que Wan en miniature), minRF et le
   script Moving-MNIST de lucidrains ; envisager SANA-Video 2B comme « grand frère » à affiner.

---

## 8. Gaps

- **Aucun chrono mesuré sur T4** pour Helios, SANA-Video, Kandinsky 6 Lite, LTX-Video 2B, LingBot 1,3B, CogVideoX-2B :
  tous les temps T4 ci-dessus sont dérivés. Le comportement **fp16** des modèles publiés en bf16 (Wan, Helios, SANA,
  LTX-Video) n'est documenté nulle part.
- RAM hôte réelle de Kaggle 2×T4 : FastVideo dit « ~16GB host RAM » pour « Colab/Kaggle-style machines » ; les notes
  précédentes la donnent comme non confirmée → critique pour Helios 14B et Kandinsky (encodeur 16,6 Go).
- Licences non relues en texte intégral : Skywork Community License (PDF), conditions Gemma (SANA-Video), poids MMAudio
  et VAE HunyuanVideo réutilisés par Kandinsky 6, provenance FLUX.1-dev des poids Open-Sora 2.0.
- daVinci-MagiHuman et MiniMax-H3 : pas de fichier LICENSE dans les dépôts GitHub (constat du 16/10/2026).
- Étoiles = valeurs arrondies de la page GitHub, lues par un résumeur automatique (WebFetch) ; ★ de
  `atong01/conditional-flow-matching` et `HoloCine` non relevées.
