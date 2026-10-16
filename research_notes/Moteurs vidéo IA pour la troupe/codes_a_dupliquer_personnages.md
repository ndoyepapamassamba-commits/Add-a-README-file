# Codes à dupliquer pour « le moteur de la troupe » : personnages, identité, parole, lèvres, voix, planches et LoRA (finder « personnages ») — état au 16/10/2026

**Méthode (16/10/2026).** Pour chaque dépôt GitHub : clone superficiel **sans extraction de fichiers**
(`git clone --depth 1 --filter=blob:none --no-checkout`), puis lecture de `LICENSE`, du `README` et de quelques fichiers
de configuration ou de prétraitement par `git show`. Le nombre de lignes Python est compté sur le commit `HEAD`
(fichiers vendorisés compris). **Aucun code des dépôts n'a été exécuté et aucun poids n'a été téléchargé.**
« Dernier commit » = date du commit `HEAD` de la branche par défaut. Étoiles = valeur arrondie affichée par la page
GitHub (lue via WebFetch le 16/10/2026). Licence des **poids** = tag `license:` de l'API Hugging Face (déclaratif) ;
tailles GGUF = API `tree` de Hugging Face. Les durées sur T4 sans source sont des **estimations de ma part**, marquées
« (estimé) ».

Notes voisines **non répétées ici** : `coherence_personnages_lipsync.md` (Q1–Q8 : quoi utiliser, chronos T4, voix
françaises), `verification_licences.md` (licences vérifiées), `codes_a_dupliquer_moteurs.md` (Wan2.1/2.2, DiffSynth,
FastVideo, SkyReels-V3…) et `codes_a_dupliquer_execution.md` (WanGP, ComfyUI, kijai, GGUF, notebooks Kaggle). Ce
document ajoute ce que ces notes n'avaient pas : l'état des **dépôts de code** (dernière activité, taille, dépendances
cachées), les **quantifications GGUF disponibles** et les **pièges de licence dans le prétraitement**.

Contraintes rappelées : budget zéro (Kaggle 2×T4 16 Go ≈ 30 h/semaine, **ni bf16 natif, ni FP8, ni FlashAttention-2 sur
T4** ; HF ZeroGPU 5 min/jour ; conteneur 4 CPU / 15 Go de RAM sans GPU) ; TikTok **monétisé**, donc licence commerciale
exigée pour le code **et** les sorties ; **aucune création de compte** (ce qui exclut les poids « gated »).

---

## 0. En bref

**À dupliquer en priorité pour la troupe (licence propre et chemin T4 crédible) :**

1. **`Wan-Video/Wan-Animate-2`** (Apache-2.0 code et poids) : acteur filmé au téléphone → personnage, **sans extracteur
   de pose**. Il n'y a donc plus de YOLOv10 (AGPL) dans la chaîne, contrairement à Wan2.2-Animate. Le code est court
   (7 465 lignes Python) et une version distillée tourne en 10 pas sans CFG. Sur T4 : GGUF communautaire Q3_K_M 8,6 Go
   ou Q4_K_M 11,3 Go, mais il faut un **nœud de chargement spécial**, faute de quoi l'échec est **silencieux** (§2.1).
2. **`zai-org/SCAIL-2`** (code Apache-2.0, poids MIT) : même usage, plus le **multi-personnages par masques colorés** et le
   multi-références (dos, gros plan, décor). Il intègre le **code d'entraînement** et est pris en charge nativement par
   ComfyUI. GGUF Q4_K_M 10,9 Go. Piège : les masques passent par **SAM3, à accès restreint (compte requis)** ; on le
   remplace par SAM2.1 (Apache, libre d'accès).
3. **`ssj9596/One-to-All-Animation`** (Apache-2.0) : le seul de la famille **prouvé sur T4 Kaggle**, en 1.3B (11 min
   pour 10 s en 832×480). Il fournit le code d'entraînement complet et des données cartoon. Piège : son prétraitement
   télécharge `yolov10m.onnx` (AGPL-3.0).
4. **`MeiGen-AI/InfiniteTalk`** (Apache-2.0) : plans parlés depuis l'image clé, **2 voix dans le même plan**
   (`person1`/`person2`) et jusqu'à ~1 min par plan. Module GGUF Q4_K_M de 1,4 Go à greffer sur Wan2.1-I2V-14B GGUF.
5. **`meituan-longcat/LongCat-Video`** (MIT, avatar 1.5) : parole mono et multi-personnages avec un encodeur
   **Whisper-large-v3** (multilingue, donc a priori mieux armé pour le français que wav2vec2 chinois), INT8 et mode
   distillé. GGUF Q3_K_M 9,9 Go.
6. **`Phantom-video/HuMo`** (Apache-2.0, **nouveau dans nos notes**) : texte + **image(s) de référence** + audio →
   personnage qui parle en gardant son identité, avec encodeur Whisper-large-v3. Il existe une version 1.7B
   « légère » et un support ComfyUI officiel.
7. **`antgroup/echomimic_v3`** (Apache-2.0) : avatar parlant 1.3B, « 12G VRAM », **testé sur V100 16 Go**. C'est la
   carte la plus proche d'un T4 (fp16, sans bf16), d'où le candidat le plus sûr pour les **gros plans parlés sur T4**.
8. **Voix** : **`QwenLM/Qwen3-TTS`** (Apache-2.0 : clonage en 3 s, français, **dossier de fine-tuning**, GGUF ≈ 1 Go
   pour le CPU) et **`resemble-ai/chatterbox`** (MIT : Multilingual V3 avec français, **conversion de voix** pour
   qu'un seul comédien fasse plusieurs voix, filigrane PerTh). **`OHF-Voice/piper1-gpl`** (GPL-3.0) reste le secours
   CPU.
9. **Planches de personnages** : **`QwenLM/Qwen-Image`** pour **Qwen-Image-Edit-2511** (Apache-2.0, multi-images, GGUF
   Q3/Q4 de 9,9 à 13,2 Go) et **`Tongyi-MAI/Z-Image`** (Apache-2.0, Turbo GGUF Q4_K_M de 5 Go, et LoRA de personnage).
10. **LoRA** : **`kohya-ss/musubi-tuner`** (Wan, Wan « 1 image », Qwen-Image-Edit-2511 avec plusieurs images de
    contrôle, Z-Image) ; **`ostris/ai-toolkit`** (MIT, interface graphique) ; **`tdrussell/diffusion-pipe`** (GPL-3.0),
    le seul qui **répartit un modèle sur 2 GPU** par parallélisme de pipeline, ce qui colle au 2×T4 de Kaggle.

**Pièges découverts pendant cette recherche (nouveaux par rapport aux notes voisines) :**

- **Qwen-Image-2.1** (HF, 14/09/2026 ; Turbo le 09/10/2026) est sous **« Qwen RESEARCH LICENSE » : usage non commercial
  uniquement** (« FOR NON-COMMERCIAL PURPOSES ONLY »). ai-toolkit et diffusion-pipe le proposent déjà à l'entraînement.
  **Rester sur Qwen-Image-Edit-2511 (Apache).**
- **Modèles InsightFace (`buffalo_l`) = « non-commercial research purposes only »** (README InsightFace). On les trouve
  dans **LatentSync** (`FaceAnalysis` détection + landmarks 106), **LivePortrait** (mode humains, `buffalo_l`) et
  **Hallo3**. Il faut les remplacer par MediaPipe, comme le fait `kijai/ComfyUI-LivePortraitKJ`.
- **X-Pose** (mode « Animals » de LivePortrait) : « License for Non-commercial Scientific Research Purposes ».
- **SAM3** (masques de SCAIL-2) : poids `facebook/sam3` à accès **« gated: manual »**, donc création de compte
  requise. SAM2.1 (`facebook/sam2.1-hiera-large`, Apache-2.0, non restreint) le remplace.
- **YOLOv10 (`yolov10m.onnx`, AGPL-3.0)** est tiré aussi par le prétraitement de **One-to-All**, pas seulement par
  Wan2.2-Animate.
- **TalkVerse** (`snap-research/TalkVerse`, avatar parlant sur Wan2.2-TI2V-5B, cité dans le README Wan2.2) est sous
  **« Snap Inc. Non-Commercial License »**. À écarter, malgré sa taille (5B) idéale pour un T4.
- **musubi-tuner** n'a **aucun fichier LICENSE** à la racine : seul le README dit « Other code is under the Apache
  License 2.0 ». Il déclare `modules/convrot_int8_kernels.py` « derived from dxqb/OneTrainer » (OneTrainer est AGPL-3.0)
  tout en le disant Apache. **Provenance à vérifier avant de vendoriser ce fichier.**
- **SkyReels-A2** : `LICENSE.txt` GitHub = Skywork Community License, mais tag HF `apache-2.0`. Les deux textes ne
  concordent pas, et le dépôt est figé en « preview » depuis le 03/06/2025.
- **Hallo3** : tag HF `mit`, mais le README dit que le modèle est un dérivé de **CogVideoX-5B** et suit sa licence
  (enregistrement obligatoire), avec en plus « Audio must be in English ».
- **GGUF de Phantom 14B** : la seule quantification trouvée est `QuantStack/Phantom_Wan_14B_FusionX-GGUF`. Les fusions
  « FusionX » incorporent, d'après les descriptions communautaires, des LoRA dont CausVid (non commercial, cf.
  `verification_licences.md`). **À éviter** ; non vérifié fichier par fichier.
- Plusieurs scripts forcent des **services tiers** : One-to-All fixe `HF_ENDPOINT=https://hf-mirror.com` (miroir
  chinois) ; l'« enhancer » de SCAIL-2 exige une **clé API Gemini**. Il faut les retirer au fork.

---

## 1. Tableau de synthèse

Verdicts : **D** = à dupliquer ; **E** = à étudier ou à emprunter par morceaux ; **L** = lire seulement ; **✘** = à
écarter (licence ou état). ★ = étoiles GitHub au 16/10/2026.

| # | Dépôt (URL canonique) | Étape | Licence code / poids | ★ | Dernier commit | T4 16 Go | CPU 4 cœurs | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | [Wan-Video/Wan-Animate-2](https://github.com/Wan-Video/Wan-Animate-2) | animation par vidéo d'acteur | Apache-2.0 / Apache-2.0 | 348 | 2026-08-08 | ~ GGUF Q3_K_M 8,6 Go / Q4_K_M 11,3 Go (nœud spécial) ; officiel : 2×A800 en 480p | ✘ | **D** |
| 2 | [zai-org/SCAIL-2](https://github.com/zai-org/SCAIL-2) | animation, remplacement, multi-perso | Apache-2.0 / MIT | 1,3 k | 2026-08-24 | ~ GGUF Q3_K_M 8,1 Go / Q4_K_M 10,9 Go ; LoRA LightX2V 8 pas | ✘ | **D** |
| 3 | [ssj9596/One-to-All-Animation](https://github.com/ssj9596/One-to-All-Animation) | animation sans alignement + entraînement | Apache-2.0 / Apache-2.0 | 505 | 2026-04-19 | **✔ 1.3B : 11 min pour 10 s en 832×480 (README)** ; 14B en GGUF Q3_K_M 10,4 Go | ✘ | **D** |
| 4 | [ali-vilab/UniAnimate-DiT](https://github.com/ali-vilab/UniAnimate-DiT) | animation par pose | **aucun LICENSE** (« academic research ») / MIT | 854 | 2025-04-27 | ~ 14 Go en bf16 (mode offload), fp16 non testé | ✘ | **L** |
| 5 | [antgroup/animate-x](https://github.com/antgroup/animate-x) | animation anthropomorphe | Apache-2.0 / **aucun tag** | 390 | 2025-02-11 | probable (SD, 768×512, 32 images) | ✘ | **✘** |
| 6 | [Phantom-video/Phantom](https://github.com/Phantom-video/Phantom) | référence → vidéo (≤ 4 réf.) | Apache-2.0 / Apache-2.0 | 1,5 k | 2025-09-11 | ✔ probable en 1.3B fp16 ; 14B : seulement GGUF FusionX (à éviter) | ✘ | **E** |
| 7 | [ali-vilab/VACE](https://github.com/ali-vilab/VACE) | réf. → vidéo, masques, réinsertion | Apache-2.0 / Apache-2.0 (Wan) ; RAIL-M (LTX) | 4,0 k | 2025-10-17 | ✔ 1.3B ; module 14B GGUF Q4 2 Go (kijai) | ✘ | **E** |
| 8 | [MAGREF-Video/MAGREF](https://github.com/MAGREF-Video/MAGREF) | multi-réf. multi-identités | Apache-2.0 / pas de tag (GGUF tagué Apache) | 299 | 2026-03-24 | ~ GGUF Q4_K_M 10,9 Go ; officiel ≈ 70 Go | ✘ | **E** |
| 9 | [SkyworkAI/SkyReels-A2](https://github.com/SkyworkAI/SkyReels-A2) | multi-réf. | Skywork Community (GitHub) / « apache-2.0 » (HF) | 713 | 2025-06-03 | offload « RTX 4090 » | ✘ | **✘** (remplacé par SkyReels-V3) |
| 10 | [Phantom-video/HuMo](https://github.com/Phantom-video/HuMo) | réf. + audio → perso parlant | Apache-2.0 / Apache-2.0 | 1,3 k | 2026-01-26 | ~ 1.7B (« 8 min sur 32 Go ») ; 17B via kijai sur 24 Go | ✘ | **D** |
| 11 | [MeiGen-AI/InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk) | parole, doublage, 2 voix | Apache-2.0 / Apache-2.0 | 8,1 k | 2026-05-22 | **✔ 12,7 Go, ≈ 0,5–1 image/s (notebook Colab, cf. notes)** | ✘ | **D** |
| 12 | [MeiGen-AI/MultiTalk](https://github.com/MeiGen-AI/MultiTalk) | parole multi-perso | Apache-2.0 / Apache-2.0 | 3,0 k | 2026-05-22 | ✔ via Wan2GP (8 Go) | ✘ | **L** (InfiniteTalk le remplace) |
| 13 | [meituan-longcat/LongCat-Video](https://github.com/meituan-longcat/LongCat-Video) | parole mono/multi (Avatar 1.5) | MIT / MIT | 9,2 k | 2026-05-27 | ~ GGUF Q3_K_M 9,9 Go / Q4_K_M 12,1 Go ; `--use_int8` | ✘ | **D** |
| 14 | [antgroup/echomimic_v3](https://github.com/antgroup/echomimic_v3) | avatar parlant 1.3B | Apache-2.0 / Apache-2.0 | 1,1 k | 2026-03-18 | **✔ probable : « 12G », testé V100 16 Go** | ✘ | **D** |
| 15 | [Wan-Video/Wan2.2](https://github.com/Wan-Video/Wan2.2) (tâche S2V) | parole cinéma + pose | Apache-2.0 / Apache-2.0 | 18,0 k | 2026-09-21 | ~ GGUF Q3_K_M 11,4 Go / Q4_K_M 13,9 Go ; officiel 80 Go | ✘ | **E** |
| 16 | [Tencent-Hunyuan/HunyuanVideo-Avatar](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar) | parole multi-perso, émotion | **Tencent Hunyuan Community (hors UE/R-U/Corée)** | 2,2 k | 2025-12-16 | ~ 10 Go via Wan2GP | ✘ | **✘** (France exclue) |
| 17 | [fudan-generative-vision/hallo3](https://github.com/fudan-generative-vision/hallo3) | portrait parlant | MIT / dérivé CogVideoX-5B (licence CogVideoX) | 1,4 k | 2025-03-13 | ✘ (5B) | ✘ | **✘** |
| 18 | [TMElyralab/MuseTalk](https://github.com/TMElyralab/MuseTalk) | lip-sync après coup | MIT / MIT | 6,7 k | 2025-09-26 | ✔ (≥ 4 Go ; 30 i/s sur V100) | ~ très lent (non mesuré) | **D** (sous réserves) |
| 19 | [bytedance/LatentSync](https://github.com/bytedance/LatentSync) | lip-sync après coup | Apache-2.0 / OpenRAIL++ | 6,1 k | 2025-06-20 | ✔ v1.5 (8 Go) ; v1.6 18 Go ✘ | ✘ | **E** (InsightFace à retirer) |
| 20 | [KlingAIResearch/LivePortrait](https://github.com/KlingAIResearch/LivePortrait) (ex-KwaiVGI) | visage piloté, retargeting lèvres/yeux | MIT / MIT | 19,2 k | 2026-06-02 | ✔ | **✔ 7,9 s/image (cf. notes)** | **E** (InsightFace et X-Pose à retirer) |
| 21 | [resemble-ai/chatterbox](https://github.com/resemble-ai/chatterbox) | TTS FR + conversion de voix | MIT / MIT | 27,0 k | 2026-07-21 | ✔ | ~ lent (Nano 110M : 3× temps réel sur 8 cœurs, mais anglais seul) | **D** |
| 22 | [QwenLM/Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) | TTS FR, clonage, voice design, fine-tuning | Apache-2.0 / Apache-2.0 | 13,8 k | 2026-03-17 | ✔ (fp16/SDPA au lieu de bf16/FA2) | ~ GGUF Q4_K_M 1,04 Go (moteur C++ communautaire) | **D** |
| 23 | [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl) | TTS CPU + entraînement de voix | GPL-3.0 / licence par voix | 5,9 k | 2026-10-15 | entraînement ✔ (8 Go rapportés) | **✔ conçu pour CPU** | **E** (secours CPU) |
| 24 | [QwenLM/Qwen-Image](https://github.com/QwenLM/Qwen-Image) (Edit-2511) | planches : angles, poses, composites | Apache-2.0 / Apache-2.0 | 8,4 k | 2026-02-10 | ~ GGUF Q3_K_M 9,9 Go / Q4_K_M 13,2 Go, encodeur sur le 2e T4 | ✘ | **D** |
| 25 | [Tongyi-MAI/Z-Image](https://github.com/Tongyi-MAI/Z-Image) | images clés + LoRA de perso | Apache-2.0 / Apache-2.0 | 12,1 k | 2026-02-09 | **✔ Turbo GGUF Q4_K_M 5,0 Go, 8 NFE** | ~ GGUF via stable-diffusion.cpp (lent, non mesuré) | **D** |
| 26 | [kohya-ss/musubi-tuner](https://github.com/kohya-ss/musubi-tuner) | LoRA Wan / Qwen-Edit / Z-Image | Apache-2.0 **selon le README, pas de LICENSE** | 2,1 k | 2026-09-27 | ~ image 12 Go ✔, vidéo 24 Go conseillés ; RAM 64 Go conseillés | ✘ | **D** |
| 27 | [ostris/ai-toolkit](https://github.com/ostris/ai-toolkit) | LoRA (GUI) | MIT | 12,3 k | 2026-10-15 | ~ Z-Image < 12 Go (cf. notes) ; exemples 24–32 Go | ✘ | **D** |
| 28 | [tdrussell/diffusion-pipe](https://github.com/tdrussell/diffusion-pipe) | LoRA, pipeline sur plusieurs GPU | GPL-3.0 | 2,0 k | 2026-09-28 | ~ **2×T4 = 32 Go en pipeline** (à tester) | ✘ | **E** |
| 29 | [Nerogar/OneTrainer](https://github.com/Nerogar/OneTrainer) | LoRA d'images (GUI) | AGPL-3.0 | 3,2 k | 2026-10-11 | ~ image | ✘ | **L** |
| 30 | [snap-research/TalkVerse](https://github.com/snap-research/TalkVerse) | avatar parlant 5B + entraînement | **Snap Non-Commercial** | n.r. | 2026-01-29 | (5B, aurait convenu) | ✘ | **✘** |

---

## 2. Fiches détaillées

### 2.1 Animation de personnage depuis une vidéo d'acteur (« jeu comique filmé au téléphone »)

#### Wan-Animate-2 — `https://github.com/Wan-Video/Wan-Animate-2` — **à dupliquer**
- **Licence** : `LICENSE` = Apache-2.0 ; poids `Wan-AI/Wan2.2-Animate-2-14B`, `-Diffusers` et `-Distilled-Diffusers` tagués
  `apache-2.0`. 348 ★, dernier commit 2026-08-08 (« Fix author list in README.md »), commit `3ad2fef`.
- **Ce que c'est** : « end-to-end character animation framework that directly consumes driving videos … by eliminating
  intermediate motion extractors ». L'exemple officiel est une chatte anthropomorphe en uniforme (prompt
  « 人物外观描述：一只银灰色虎斑纹的小猫… »). Le code contient **aucun détecteur de pose ni ONNX** :
  `pipelines/wan_animate_2_pipeline.py` importe seulement cv2, decord, einops et torch (lecture de `git show`).
  Il fait 40 fichiers, dont **7 465 lignes Python**, avec un paquet `wanxiang/` (DiT, VAE, T5, CLIP) et une config YAML.
- **Intégrations** : Diffusers (`WanAnimate2Pipeline`, PR #14412), DiffSynth-Studio, ComfyUI (cases cochées dans le
  README). La version distillée tourne en `num_inference_steps=10`, `guidance_scale=1.0` (sans CFG), solveur Euler.
- **Matériel** : « tuned for 8× A800 GPUs and support 720P … tested 480P generation on 2× A800 ». Les YAML sont en
  `param_dtype: bfloat16`, avec `t5_dtype: torch.bfloat16` et `use_fp8_gemm: False`.
- **T4** : GGUF communautaire `realrebelai/Wan-Animate-2_GGUFs` (Apache-2.0, 10/08/2026). Fichiers distillés « TURBO »
  de Q2_K 6,5 Go à Q8_0 18,1 Go, dont **Q3_K_M 8,58 Go** et **Q4_K_M 11,34 Go** (API HF). La fiche avertit : « These
  require a custom loader node … any GGUF of this model loads as a plain Wan 2 … the driving video is completely
  ignored. Nothing errors ». Il faut le chargeur « Rebels W3A8 Loader » avec `model_type=animate2`. Deuxième
  avertissement : « The reference image must roughly match the driving video's opening pose ». Côté mémoire, umT5 en
  fp16 et CLIP-H sont à placer sur le 2e T4 ou sur le CPU, et la LoRA LightX2V I2V 480p est optionnelle. **Aucun chrono
  T4 publié** ; en extrapolant de Wan2.2-Animate GGUF (Kaggle 2×T4, cf. `coherence_personnages_lipsync.md` Q8), on
  peut viser (estimé) environ 10–20 min par clip de 5 s en 480p.
- **CPU** : non.
- **Pourquoi le dupliquer** : c'est la pièce qui corrige le grief « mouvement saccadé » du pipeline Blender. Un comédien
  ivoirien joue la scène, le personnage la reprend, et **sans squelette humain**, ce qui convient aux proportions à
  grosse tête. Le code est petit et lisible, sans dépendance AGPL ni NC dans le prétraitement. On garde
  `wanxiang/models/wan_animate_2_model.py` et la pipeline, et on remplace la légende chinoise produite par un LLM fermé
  (« Qwen3.7-Plus » conseillé dans le README) par un VLM local ou un gabarit de la bible des personnages.

#### SCAIL-2 — `https://github.com/zai-org/SCAIL-2` — **à dupliquer**
- **Licence** : `LICENSE` GitHub = Apache-2.0 ; poids `zai-org/SCAIL-2` tagués `mit` (345 likes, maj. 15/07/2026). Le
  sous-module `zai-org/SCAIL-Pose` est sous Apache-2.0. 1,3 k ★, dernier commit 2026-08-24 (correctif LoRA), 40
  fichiers et **10 811 lignes Python**.
- **Fonctions** : modes « animation end-to-end » (la vidéo d'acteur brute pilote), « pose-driven » et
  **remplacement** (avec une LoRA de ré-éclairage publiée le 15/07/2026). Il gère aussi le **multi-références** :
  `--additional_ref_image` pour un fond, un dos ou un gros plan, et **plusieurs personnages** (`character_0`,
  `character_1`) distingués par des **masques de couleur** (« Color — encodes the correspondence between character
  regions and the driving motion »). Il est entraîné en 512p et 704p (notes voisines : 704×1280 = 9:16 possible). La
  LoRA LightX2V permet 8 pas et CFG 1. Une LoRA DPO corrige les mains et améliore la synchro.
- **Entraînement** : publié le 06/08/2026 sur la branche `sat-scail2` (DeepSpeed ZeRO-2 / FSDP2, données en WebDataset
  de latents). Le README renvoie à un « VRAM-friendly » `fengjia-guo/SCAIL-2-Tuner`, qui est une surcouche
  expérimentale de musubi-tuner : 5 ★, **sans licence visible**, donc à ne pas copier.
- **Prétraitement (pièges)** : le mode recommandé `--e2e_mode` fabrique les masques avec **SAM3**. Or `facebook/sam3` est
  « gated: manual », ce qui suppose un compte et l'acceptation de la licence Meta. Il faut remplacer par **SAM2.1**
  (`facebook/sam2.1-hiera-large`, Apache-2.0, non restreint). Le mode pose utilise NLF (`nlf_l_multi_0.3.2.torchscript`,
  licence non vérifiée) et DWPose (Apache-2.0) : **préférer le mode e2e**. `prompt_enhancer.py` appelle Gemini avec une
  clé API, donc à retirer.
- **T4** : ComfyUI natif (PR #14373, multi-réf. PR #14509). GGUF `realrebelai/SCAIL-2_GGUF` (MIT) : Q3_K_M 8,11 Go,
  Q4_K_M 10,86 Go, Q5_K_M 12,27 Go. Pas de chrono T4.
- **Pourquoi** : c'est la seule base Apache/MIT qui anime **deux personnages distincts à partir d'une vidéo d'acteurs**
  avec des masques explicites, et qui fournit le code d'entraînement pour l'affiner sur la troupe. Le mode remplacement
  permet en plus de **réutiliser des plans filmés** : le comédien est remplacé par le personnage dans son décor.

#### One-to-All Animation — `https://github.com/ssj9596/One-to-All-Animation` — **à dupliquer (base T4 éprouvée)**
- **Licence** : Apache-2.0 ; poids `MochunniaN1/One-to-All-1.3b_2` et `-14b` tagués `apache-2.0`. 505 ★, dernier commit
  2026-04-19, CVPR 2026.
- **Points forts** : « alignment-free », « **Full Training Code**: Three-stage progressive training from scratch »,
  « Pre-processed open-source datasets + **self-collected cartoon data** ». Le README dit : « **Run One-to-All1.3B +
  ComfyUI for free on Kaggle's 16 GB T4** … It takes 11 minutes to generate a 10-second 832×480 video ». Le 14B est
  intégré à kijai WanVideoWrapper, et un GGUF 14B existe (`vantagewithai/One-to-All-14b-GGUF`, Apache : Q3_K_M 10,4 Go,
  Q4_K_M 13,5 Go). Le README conseille « at least 3,000 additional high-quality video samples » pour réentraîner.
- **Pièges** : `pretrained_models/download_pretrained_models.py` télécharge `Wan-AI/Wan2.2-Animate-14B`
  `process_checkpoint/det/*`, soit **`yolov10m.onnx` (AGPL-3.0)**, plus `vitpose_h_wholebody` et DWPose (via le dépôt HF
  de StableAnimator). Il faut remplacer le détecteur par yolox (Apache, celui de DWPose). Les scripts fixent
  `HF_ENDPOINT='https://hf-mirror.com'`, à enlever. FlashAttention 3/2 est « recommended », mais absent sur T4 : SDPA
  par défaut (à vérifier). Le dépôt est lourd : 765 fichiers .py et ≈ 252 000 lignes, avec configs vendorisées
  CogVideo, Hunyuan et Mochi.
- **Pourquoi** : c'est le **seul animateur de personnage dont le fonctionnement sur T4 gratuit est documenté par les
  auteurs**. Il entraîne sur du cartoon et le 1.3B se réentraîne à petite échelle : c'est la meilleure base pour un
  « animateur maison » affiné sur la troupe.

#### UniAnimate-DiT — `https://github.com/ali-vilab/UniAnimate-DiT` — lire seulement
- **Pas de fichier LICENSE** (racine : `.gitignore`, `README.md`, `apps`, `data`, `diffsynth`, `dwpose`, `examples`…) ;
  le README dit « intended for academic research ». Poids `ZheWang123/UniAnimate-DiT` tagués `mit`. 854 ★, dernier
  commit 2025-04-27.
- Il s'agit d'une LoRA plus des modules sur Wan2.1-I2V-14B-720P, bâtie sur DiffSynth (vendorisé). Tableau du README :
  bf16 avec `num_persistent_param_in_dit=7B` → 23 Go, 20,5 s/it ; avec `0` → **14 Go, 23 s/it** (480p). Il faut
  ≈ 3 min par clip de 5 s en 480p avec TeaCache (GPU non précisé).
- **Verdict** : sans licence de code, tous les droits sont réservés, donc **pas de copie**. On peut s'en inspirer pour
  le schéma « LoRA + encodeur de pose sur Wan I2V 14B ».

#### Animate-X — `https://github.com/antgroup/animate-x` — à écarter
- Code Apache-2.0, poids HF `Shuaishuai0219/Animate-X` **sans tag de licence**. 390 ★, dernier commit 2025-02-11.
  Construit sur UniAnimate / MimicMotion / MusePose (latent diffusion), il sort 32 images en 768×512.
- **Verdict** : dépassé par Wan-Animate-2, SCAIL-2 et One-to-All, avec des poids à la licence non déclarée.

### 2.2 Identité par références, sans entraînement

#### Phantom — `https://github.com/Phantom-video/Phantom` — étudier (version 1.3B pour le T4)
- Apache-2.0 (code et poids `bytedance-research/Phantom`). 1,5 k ★, dernier commit 2025-09-11, **7 417 lignes**
  (fork léger de Wan2.1 : `generate.py --task s2v-1.3B / s2v-14B`).
- « The number of reference images should be within 4 ». Le 14B a été entraîné en 480P et à 24 i/s, et « horizontal
  videos … more stable … than vertical ». La case « Training codes of Phantom-Wan » n'est **pas cochée** : il n'y a pas
  de code d'entraînement.
- **T4** : le 1.3B s'appuie sur le VAE et le T5 de Wan2.1-T2V-1.3B (8,19 Go officiels pour Wan 1.3B), donc il passe en
  fp16 (estimé). Pour le 14B, la seule quantification trouvée est la fusion FusionX, à éviter (CausVid, cf. §0).
- **Pourquoi** : c'est le code R2V le plus simple à lire. Il sert à **intégrer les références multi-images** dans
  notre fork Wan 1.3B pour les personnages secondaires à une image. Le 9:16 reste faible.

#### VACE — `https://github.com/ali-vilab/VACE` — étudier (briques de masques et de réinsertion)
- Apache-2.0 ; 4,0 k ★ ; dernier commit 2025-10-17. Il couvre R2V, V2V et MV2V (édition par masque). « All models
  inherit the license of the original model » : Wan2.1-VACE-1.3B/14B en Apache-2.0, **VACE-LTX-Video-0.9 en RAIL-M**.
- **T4** : 1.3B en 480p ; kijai publie le module VACE 14B en GGUF (Q4_K_M 1,98 Go) et les modules Wan2.2-Fun-VACE
  HIGH/LOW (`Kijai/WanVideo_comfy_GGUF`, Apache-2.0).
- **Pourquoi** : les **annotateurs** (pose, profondeur, masque) et la logique de « réinsérer un personnage de référence
  dans une zone masquée » servent à corriger un personnage qui dérive dans un plan, sans tout régénérer.

#### MAGREF — `https://github.com/MAGREF-Video/MAGREF` — étudier
- Code Apache-2.0 ; poids HF **sans tag** (le GGUF QuantStack est tagué `apache-2.0`). 299 ★ ; dernier commit 2026-03-24
  (ICLR 2026) ; 5 695 lignes. Le README indique « around **70 GB** of VRAM ». Il n'y a pas de code d'entraînement.
- **T4** : seulement en GGUF (`QuantStack/MAGREF_Wan2.1_I2V_14B-GGUF` : Q3_K_M 8,1 Go, Q4_K_M 10,9 Go) via kijai ou
  ComfyUI-GGUF, sans chrono.
- **Pourquoi** : c'est le meilleur score multi-sujets auto-déclaré (cf. notes voisines) et son « masked guidance »
  sépare les identités. L'idée est à reprendre dans notre code, plutôt que le dépôt entier.

#### SkyReels-A2 — `https://github.com/SkyworkAI/SkyReels-A2` — à écarter
- `LICENSE.txt` = « Skywork Community License » (PDF, « supports commercial use » sous conditions), alors que le tag HF
  dit `apache-2.0` : contradiction. 713 ★ ; dernier commit 2025-06-03. Seul « A2-Wan2.1-14B-Preview » est publié ; les
  versions complète, Pro et Infinity sont « To be released ».
- **Verdict** : dépôt figé, remplacé par SkyReels-V3 R2V (fiche dans `codes_a_dupliquer_moteurs.md`).

### 2.3 Parole pilotée par l'audio (le personnage parle, bouge la tête et le corps)

#### HuMo — `https://github.com/Phantom-video/HuMo` — **à dupliquer (nouveau)**
- Apache-2.0 (code), poids `bytedance-research/HuMo` tagués `apache-2.0`. 1,3 k ★ ; dernier commit 2026-01-26 ;
  8 553 lignes.
- Il prend en entrée texte + image(s) de référence + audio (« Customize character appearance, clothing, makeup,
  props… combined with reference images »). L'encodeur audio est **Whisper-large-v3** (Apache-2.0), avec un séparateur
  vocal optionnel `huangjackson/Kim_Vocal_2` (sans tag de licence, à éviter). Modèles : **17B** (480P/720P) et
  **1.7B** (« generate a 480P video in 8 minutes on a 32G GPU »). L'entraînement est fait sur 97 images à 25 i/s
  (≈ 3,9 s par plan). Le jeu de données HuMoSet (670 000 échantillons) est publié, mais pas de code d'entraînement.
- **T4** : pour le 1.7B, la mesure est faite sur une carte de 32 Go ; il faut l'offload sur 16 Go, sans preuve. Le 17B
  passe via kijai sur 24 Go (« can be run on a NVIDIA 3090 »). ComfyUI prend en charge officiellement le 1.7B.
- **Pourquoi** : il réunit **identité par référence et parole** en une seule passe, ce qui couvre le besoin « 32
  personnages à une seule image qui doivent parler ». Whisper-large-v3 est multilingue, donc plus prometteur pour le
  français que wav2vec2 chinois (inférence, non mesurée).

#### InfiniteTalk — `https://github.com/MeiGen-AI/InfiniteTalk` — **à dupliquer**
- Apache-2.0 (code `LICENSE.txt`, poids). 8,1 k ★ ; dernier commit 2026-05-22 ; 50 fichiers, **15 000 lignes**, avec un
  dossier `kokoro/` vendorisé.
- **Fonctions** : doublage vidéo → vidéo de longueur illimitée, et image → vidéo (« good results from a single image
  for up to 1 minute. Beyond 1 minute, color shifts »). `--max_frame_num` vaut par défaut « 40 seconds (1000 frames) ».
  En **multi-personnes**, l'entrée JSON contient `cond_audio: {person1, person2}`, avec `audio_type` « para »
  (superposé) ou « add » (enchaîné) : **2 voix par plan**. Basse VRAM via `--num_persistent_param_in_dit 0`,
  quantification `--quant fp8` (calcul FP8 absent sur T4 ; l'INT8 est à préférer).
- Le README avertit que la LoRA FusionX « exacerbates color shift … and reduces ID preservation ». **Ne pas
  l'utiliser** (CausVid NC en prime).
- **T4** : notebook Colab communautaire à 12,7 Go et ≈ 0,5–1 image/s en 480p (cf. `coherence_personnages_lipsync.md`
  Q8). Modules GGUF kijai : `Wan2_1-InfiniteTalk_Multi_Q4_K_M.gguf` et `_Single_Q4_K_M.gguf`, 1,4 Go chacun.
- **Pourquoi** : c'est le moteur des **plans de dialogue**. Il anime l'image clé composite validée, prend deux pistes
  audio françaises et sert aussi à re-doubler un plan Wan-Animate-2 déjà joué.

#### MultiTalk — `https://github.com/MeiGen-AI/MultiTalk` — lire seulement
- Apache-2.0 ; 3,0 k ★ ; dernier commit 2026-05-22 ; 14 968 lignes. Il revendique la conversation multi-personnes, le
  chant et les « cartoon character ». Clips de 15 s au plus, quantification INT8 (optimum-quanto), 8 Go via Wan2GP, TTS
  intégré via Kokoro (une seule voix française, cf. notes).
- **Verdict** : même famille de code qu'InfiniteTalk, qui le surpasse en synchro labiale et en stabilité. On le garde
  comme référence seulement.

#### LongCat-Video (Avatar 1.0 / 1.5) — `https://github.com/meituan-longcat/LongCat-Video` — **à dupliquer**
- MIT (code ; poids `LongCat-Video-Avatar` et `-1.5` tagués `mit`). 9,2 k ★ ; dernier commit 2026-05-27 ;
  **12 834 lignes**. Le dépôt `MeiGen-AI/LongCat-Video-Avatar` n'est qu'une page de projet : le code est ici
  (`run_demo_avatar_single_audio_to_video.py`, `run_demo_avatar_multi_audio_to_video.py`).
- **Fonctions** : `--model_type avatar-v1.5` (« Whisper-large-v3 audio encoder for better lip sync quality »),
  `--use_distill` obligatoire en 1.5, `--use_int8` pour réduire la VRAM (1.5 seulement). Il gère la continuation par
  segments (`--num_segments`), les deux modes double-audio (« para » et « add »), le 480P/720P, ainsi que T2V, I2V et
  la continuation sur le même DiT de 13,6B.
- **T4** : les exemples officiels utilisent `torchrun --nproc_per_node=2 --context_parallel_size=2`. Le parallélisme
  de contexte sur les **2 T4 de Kaggle** est plausible, à tester. GGUF ComfyUI `vantagewithai/LongCat-Video-Avatar-1.5-GGUF-ComfyUI`
  (MIT) : Q3_K_M 9,9 Go, Q4_K_M 12,07 Go.
- **Pourquoi** : c'est la **seule base MIT** qui fait à la fois parole multi-personnages, encodeur Whisper et longue
  durée par continuation. Selon les notes voisines, l'anime et les animaux sont revendiqués.

#### EchoMimic V3 — `https://github.com/antgroup/echomimic_v3` — **à dupliquer (gros plans parlés sur T4)**
- Apache-2.0 (code ; poids `BadToBest/EchoMimicV3` ; base `alibaba-pai/Wan2.1-Fun-V1.1-1.3B-InP`, Apache-2.0). 1,1 k ★ ;
  dernier commit 2026-03-18 ; 11 077 lignes.
- La version « EchoMimicV3-Flash » (22/01/2026) annonce « 8-step High-quality Generation » et « 12G VRAM
  Requirement ». « Tested GPUs: A100(80G) / RTX4090D (24G) / **V100(16G)** ». ComfyUI le fait tourner sur 16 Go
  (smthemex). Le README conseille « 5 steps for talking head, 15~25 steps for talking body » et `partial_video_length`
  à 65–81 pour réduire la VRAM.
- **Réserves** : l'encodeur audio est `wav2vec2-base-960h` (anglais) en preview, ou `chinese-wav2vec2-base` en Flash ; le
  français n'est pas prouvé. Le masque de visage passe par `retina-face` (serengil, code MIT, mais poids issus du
  projet InsightFace : **à vérifier**).
- **Pourquoi** : sa taille de 1.3B et le test sur V100 16 Go (fp16, sans bf16, comme le T4) en font le candidat le
  plus réaliste pour des **gros plans parlés rapides sur T4**.

#### Wan2.2-S2V — `https://github.com/Wan-Video/Wan2.2` (tâche `s2v-14B`) — étudier
- Apache-2.0 ; 18,0 k ★ ; dernier commit 2026-09-21. « This command can run on a GPU with at least 80GB VRAM ». Il
  prend audio + image + pose optionnelle (`--pose_video`), avec un TTS CosyVoice intégré (`--enable_tts`). L'encodeur
  audio est `wav2vec2-large-xlsr-53-english` (cf. `anatomie_code_moteur_ouvert.md` §7).
- **T4** : GGUF `QuantStack/Wan2.2-S2V-14B-GGUF` (Apache) : Q3_K_M 11,4 Go, Q4_K_M 13,9 Go. C'est limite.
- **Pourquoi** : le code d'injection audio (fenêtre par image latente, AdaIN) est la **référence à lire** pour ajouter
  l'audio à notre propre fork Wan. Pour la production sur T4, InfiniteTalk et EchoMimic sont plus réalistes.

#### HunyuanVideo-Avatar — `https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar` — à écarter
- `LICENSE` = « TENCENT HUNYUAN COMMUNITY LICENSE … Release Date: May 28, 2025 » (exclusion UE/R-U/Corée du Sud, cf.
  `verification_licences.md`). Tag HF absent. 2,2 k ★ ; dernier commit 2025-12-16. Il fait du dialogue
  multi-personnages et des émotions ; 24 Go au minimum, 96 Go recommandés, 10 Go via Wan2GP.
- **Verdict** : une vidéo vue en France tombe hors territoire. Lecture seulement.

#### Hallo3 — `https://github.com/fudan-generative-vision/hallo3` — à écarter
- Code MIT ; poids `fudan-generative-ai/hallo3` tagués `mit`, mais « fine-tuned derivative … based on the CogVideo-5B
  I2V model … must comply with the license terms of CogVideo-5B ». Il dépend d'InsightFace (NC) et indique « Audio must
  be in English ». 1,4 k ★ ; dernier commit 2025-03-13.

#### TalkVerse — `https://github.com/snap-research/TalkVerse` — à écarter (piège)
- « Snap Inc. Non-Commercial License … for non-commercial, research purposes only ». Il s'agit d'une LoRA S2V sur
  Wan2.2-TI2V-5B, avec code d'entraînement et jeu de 6 300 h. Sa taille aurait convenu au T4, mais la licence
  l'exclut.

### 2.4 Lip-sync après coup et visage piloté

#### MuseTalk — `https://github.com/TMElyralab/MuseTalk` — à dupliquer, sous réserves
- MIT (code et poids ; README : « available for any purpose, even commercially »). 6,7 k ★ ; dernier commit
  2025-09-26 ; 10 302 lignes. La version 1.5 vient avec le **code d'entraînement** (04/2025). La zone de visage fait
  256×256, l'audio passe par whisper-tiny, et le débit est de « 30fps+ on an NVIDIA Tesla V100 ».
- **Dépendances à auditer** : détection S3FD (`face_detection`, code de type face-alignment), DWPose via mmpose
  (Apache), `face-parse-bisent` téléchargé sur Google Drive (BiSeNet ; **jeu d'entraînement probablement
  CelebAMask-HQ, non commercial : à vérifier**), SyncNet de LatentSync. Sur visage cartoon, **si S3FD ne détecte rien,
  la chaîne s'arrête** : à tester sur la troupe.
- **T4** : oui (≥ 4 Go, cf. notes). **CPU** : techniquement possible, très lent (non mesuré).
- **Pourquoi** : c'est le lip-sync le plus léger et entièrement MIT, et il est **réentraînable** sur nos propres
  bouches cartoon (code de prétraitement et d'entraînement fournis).

#### LatentSync — `https://github.com/bytedance/LatentSync` — étudier (détecteur à remplacer)
- Code Apache-2.0 ; poids 1.5 et 1.6 `openrail++`. 6,1 k ★ ; dernier commit 2025-06-20 ; 12 861 lignes. « Minimum VRAM
  for inference: 8 GB with LatentSync 1.5 ; 18 GB with LatentSync 1.6 ». L'entraînement demande de 20 à 55 Go. Les
  démos « anime » viennent de VASA-1.
- **Piège** : `latentsync/utils/face_detector.py` utilise `insightface.app.FaceAnalysis(allowed_modules=["detection",
  "landmark_2d_106"])`, soit les modèles InsightFace (« non-commercial research purposes only »). Le même fichier fait
  `if len(faces) == 0: return None`, donc pas de visage détecté, pas de lip-sync (risque cartoon). Il faut le
  **remplacer par MediaPipe Face Landmarker (Apache-2.0)** au fork.
- **Pourquoi** : la meilleure qualité de bouche en diffusion, une fois le détecteur remplacé ; la v1.5 tient sur T4.

#### LivePortrait — `https://github.com/KlingAIResearch/LivePortrait` (redirection depuis KwaiVGI / KlingTeam) — étudier
- MIT (code ; poids HF déplacés vers `KlingTeam/LivePortrait`). 19,2 k ★ ; dernier commit 2026-06-02 ; 15 205 lignes.
- **Pièges** : le mode humains utilise InsightFace `buffalo_l` (`src/utils/cropper.py` : `name="buffalo_l"`), qui est
  NC. Le mode **Animals** utilise **X-Pose**, sous « License for Non-commercial Scientific Research Purposes ».
  `kijai/ComfyUI-LivePortraitKJ` (MIT) propose « MediaPipe as an alternative to Insightface » : c'est la voie
  commerciale.
- **CPU** : ✔ (7,9 s/image sur 4 cœurs, cf. notes). Il existe un mode macOS MPS et une version TensorRT
  (FasterLivePortrait).
- **Pourquoi** : c'est le **seul outil d'animation faciale utilisable sur le CPU du conteneur**. Il permet de
  retargeter yeux et lèvres sur des images clés, et de transférer les expressions du comédien en gros plan, sans GPU.

### 2.5 Voix françaises

#### Qwen3-TTS — `https://github.com/QwenLM/Qwen3-TTS` — **à dupliquer**
- Apache-2.0 (code et poids 0.6B et 1.7B). 13,8 k ★ ; dernier commit 2026-03-17 ; 10 115 lignes.
- Il couvre 10 langues, dont le **français**. Modèles **Base** (« 3-second rapid voice clone … can be used for
  fine-tuning »), **VoiceDesign** (voix créée depuis une description) et **CustomVoice** (9 timbres, contrôle par
  instruction : émotion, ton). Le dossier **`finetuning/`** (`prepare_data.py`, `sft_12hz.py`) gère le fine-tuning
  « single-speaker », en conseillant le même `ref_audio` pour toutes les lignes. On peut ainsi **affiner une voix par
  personnage vedette** sur 10–30 min d'un comédien ivoirien.
- **T4** : les exemples sont en `torch.bfloat16` + FlashAttention 2, à passer en fp16 + SDPA sur T4 (à tester).
  **CPU** : GGUF `ggml-org/Qwen3-TTS-12Hz-1.7B-Base-GGUF` (Q4_K_M 1,04 Go, Q8_0 1,85 Go, publié le 03/08/2026). Le
  support llama.cpp passe par la PR « Add Qwen3 TTS architecture support » (#20752, statut non vérifié) ou par
  `qwentts.cpp` (communautaire). Le RTF CPU de la version PyTorch était de ≈ 5,4 (cf. notes).
- **Pourquoi** : clonage, conception de voix et fine-tuning sous Apache, avec une route CPU, ce qui en fait le **socle
  voix** du moteur.

#### Chatterbox — `https://github.com/resemble-ai/chatterbox` — **à dupliquer**
- MIT (code et poids). 27,0 k ★ ; dernier commit 2026-07-21 (« Update ChatterboxNano ») ; 9 462 lignes.
- **Multilingual V3** (0,5B) gère 23 langues dont le français (`language_id="fr"`). Le « Single Language Pack »
  **n'a pas de français** (zh, es-latam…). **Turbo** (350M) et **Nano** (110M, « 3x faster than realtime on 8 CPU
  cores ») sont **en anglais seulement**, avec des balises `[laugh]`, `[chuckle]`. Le dépôt contient **`vc.py`**
  (conversion de voix) : un seul comédien enregistre toutes les répliques, puis on convertit vers la voix de chaque
  personnage, en gardant jeu, accent et timing. « Every audio file generated by Chatterbox includes … Perth …
  Watermarker ».
- **GGUF** : `cstr/chatterbox-GGUF` (MIT), avec t3-v3 en Q4_K de 0,39 Go et s3gen en Q4_K de 0,31 Go.
- **Pourquoi** : la **conversion de voix** est la réponse la plus réaliste au problème de l'accent ivoirien. L'accent
  vient du comédien, pas du modèle. Utilisable sur T4 et, lentement, sur CPU.

#### Piper (piper1-gpl) — `https://github.com/OHF-Voice/piper1-gpl` — étudier (secours CPU)
- GPL-3.0 (`COPYING` ; le moteur embarque espeak-ng). 5,9 k ★ ; dernier commit 2026-10-15. L'ancien `rhasspy/piper`
  (MIT, dernier commit 2025-08-26) est archivé.
- `docs/TRAINING.md` : « Users have reported success with as little as 8GB of VRAM ». L'option `--ckpt_path`
  (« highly recommended ») part d'un checkpoint existant. Or ces checkpoints dérivent souvent de lessac ou ryan, qui
  sont **non commerciaux** (cf. `verification_licences.md`). **Pour une voix propre, entraîner depuis zéro** sur nos
  propres enregistrements.
- **Pourquoi** : c'est le seul TTS **conçu pour le CPU** (ONNX). On peut l'appeler comme binaire séparé, ce qui évite
  de lier du GPL dans notre code.

### 2.6 Planches de personnages et images clés

#### Qwen-Image (Edit-2511) — `https://github.com/QwenLM/Qwen-Image` — **à dupliquer**
- Apache-2.0 (code ; poids `Qwen/Qwen-Image-Edit-2511` tagués `apache-2.0`). 8,4 k ★ ; dernier commit 2026-02-10.
- Edit-2511 apporte « Multiple Image Support and Improved Consistency » (`QwenImageEditPlusPipeline`). L'accélération
  Lightning de LightX2V est disponible dès la sortie. musubi-tuner entraîne des LoRA Edit-2509/2511 avec **un nombre
  quelconque d'images de contrôle** (« official version supports up to 3 images »).
- **T4** : GGUF `unsloth/Qwen-Image-Edit-2511-GGUF` (Apache) : Q3_K_M 9,92 Go, Q4_K_M 13,24 Go. L'encodeur
  Qwen2.5-VL-7B va sur le 2e T4 ou sur le CPU. Pas de chrono T4 (cf. notes).
- **Piège** : **ne pas basculer vers Qwen-Image-2.1** (dépôt `QwenLM/Qwen-Image-2.1` sur GitHub ; HF 14/09/2026).
  Il est séduisant (7B, « up to **10 reference images** », RGBA), mais **sous Qwen RESEARCH LICENSE, non commercial**.
- **Pourquoi** : étendre les 7 planches à 20–30 vues, générer les planches de rotation des 32 personnages à une image
  et **composer les images clés à 2–4 personnages** (cf. Q1/Q3 des notes).

#### Z-Image — `https://github.com/Tongyi-MAI/Z-Image` — **à dupliquer**
- Apache-2.0 (code ; poids Turbo et base tagués `apache-2.0`). 12,1 k ★ ; dernier commit 2026-02-09.
- **Turbo** fonctionne en 8 NFE (`num_inference_steps=9`, `guidance_scale=0.0`) ; **Z-Image** (base, 23/01/2026) est
  fait pour le fine-tuning. **Z-Image-Edit et Omni-Base sont toujours « To be released »** : aucun dépôt
  `Tongyi-MAI` correspondant n'existe sur HF au 16/10/2026.
- **T4** : GGUF `unsloth/Z-Image-Turbo-GGUF` (Apache) Q4_K_M 5,02 Go, Q8_0 7,22 Go ; bf16 12,3 Go. Il tient donc en fp16
  ou en GGUF. **CPU** : GGUF `leejet/Z-Image-Turbo-GGUF` pour stable-diffusion.cpp, à mesurer (plusieurs minutes par
  image, estimé).
- **Pourquoi** : c'est le générateur d'images clés le plus léger sous Apache, et il entraîne des **LoRA d'image** par
  personnage avec moins de 12 Go (cf. notes). C'est la stratégie d'identité retenue sous budget zéro.

### 2.7 Entraîneurs de LoRA

#### musubi-tuner — `https://github.com/kohya-ss/musubi-tuner` — **à dupliquer** (avec audit de provenance)
- **Licence** : pas de fichier LICENSE ; le README dit : « Other code is under the Apache License 2.0 »,
  `hunyuan_model/` et `hunyuan_video_1_5/` suivent la licence Tencent, et `wan/` et `frame_pack/` sont sous Apache.
  `modules/convrot_int8_kernels.py` est « derived from dxqb/OneTrainer » (AGPL). 2,1 k ★ ; dernier commit 2026-09-27.
- **Modèles** : Wan2.1/2.2 (+ « Single Frame » : `docs/wan_1f.md`), Qwen-Image et Edit/2509/2511/Layered, Z-Image,
  FLUX.2, H3, HunyuanVideo 1.5, Kandinsky 5, Krea 2, Ideogram 4, HiDream-O1… « VRAM: 12GB or more recommended for
  image training, 24GB or more for video training » ; « Main Memory: 64GB or more recommended, 32GB + swap may work ».
  Sur Z-Image, le README note : « not yet clear whether `--mixed_precision bf16` or `fp16` is better », ce qui laisse
  une **voie fp16 pour le T4**. La quantification ConvRot int8 vise les « GPUs without fp8 support » (Krea 2 seulement
  pour l'instant).
- **Pourquoi** : un seul outil couvre les **LoRA Z-Image de personnage**, les **LoRA Qwen-Edit à plusieurs images de
  contrôle** (apprendre « planche → nouvelle pose » sur notre style) et les LoRA Wan. Il sert aussi de base à la
  surcouche LoRA de SCAIL-2.

#### ai-toolkit — `https://github.com/ostris/ai-toolkit` — **à dupliquer** (interface pour la troupe)
- MIT. 12,3 k ★ ; dernier commit 2026-10-15. Il prend en charge Z-Image Turbo, De-Turbo et base, Qwen-Image-Edit-2509
  et 2511, Wan 2.1 1.3B, Wan 2.2 5B et 14B, ainsi que LTX-2.x. Il a une interface web et un gestionnaire
  d'installation. Les exemples de config sont pour 24 et 32 Go ; les notebooks ne couvrent que FLUX.
- **Piège** : il propose aussi Qwen-Image-2.1 (NC).
- **Pourquoi** : c'est l'outil le plus simple pour un créateur seul. Interface graphique, licence MIT, et LoRA Z-Image
  sous 12 Go selon les retours (cf. notes).

#### diffusion-pipe — `https://github.com/tdrussell/diffusion-pipe` — étudier (2×T4)
- GPL-3.0. 2,0 k ★ ; dernier commit 2026-09-28. « **Pipeline parallelism, for training models larger than can fit on
  a single GPU** », avec DeepSpeed, sous Linux seulement (Kaggle convient). Il entraîne sur des poids quantifiés de type
  ComfyUI (« Z-Image and later »), et l'exemple `wan_14b_min_vram.toml` utilise `blocks_to_swap`.
- **Pourquoi** : c'est le seul moyen d'additionner les **deux T4 de Kaggle (2 × 16 Go)** pour une LoRA Wan 14B. La RAM
  hôte reste le facteur limitant, non vérifié. On l'utilise comme outil séparé ; la LoRA produite n'est pas GPL.

#### OneTrainer — `https://github.com/Nerogar/OneTrainer` — lire seulement
- AGPL-3.0. 3,2 k ★ ; dernier commit 2026-10-11. Interface graphique ; modèles d'images uniquement (Z-Image, Qwen
  Image, FLUX, SDXL, Sana, Hunyuan Video) ; EMA sur CPU. Pas de Wan.
- **Verdict** : redondant avec ai-toolkit (MIT). L'AGPL déconseille d'en vendoriser du code.

---

## 3. Proposition de duplication (ordre conseillé, inférence de ma part)

1. **`moteur-troupe/personnages/`** : forker **Wan-Animate-2** (pipeline + `wanxiang/`, sans la légende par LLM fermé)
   et **One-to-All 1.3B** (seul chrono T4 connu ; remplacer YOLOv10 par yolox et retirer `hf-mirror`). Premier test
   Kaggle : un gag de 10 s joué au téléphone, sur un personnage vedette.
2. **Multi-personnages** : greffer le **mode masques colorés de SCAIL-2** (masques par SAM2.1, pas SAM3) pour les
   scènes à 2 personnages jouées par 2 comédiens.
3. **Parole** : **InfiniteTalk** (2 voix par plan) sur l'image clé composite ; **EchoMimic V3 Flash** pour les gros
   plans ; **LongCat-Avatar 1.5** et **HuMo** en A/B pour la tenue du français (Whisper-large-v3).
4. **Voix** : **Qwen3-TTS** (VoiceDesign → empreinte de voix par personnage → clonage ; fine-tuning des vedettes) et
   **Chatterbox `vc.py`** (un comédien, 54 voix). **Piper** reste en secours CPU, appelé en binaire.
5. **Bible visuelle** : **Qwen-Image-Edit-2511** (GGUF, 2×T4) pour les planches et images clés, puis **Z-Image
   Turbo** et des LoRA d'image entraînées avec **ai-toolkit** ou **musubi-tuner** en fp16.
6. **Retouches de bouche** : **MuseTalk** (MIT, réentraînable) ; **LatentSync 1.5** seulement après avoir remplacé
   InsightFace par MediaPipe ; **LivePortrait** (détecteur MediaPipe, sans le mode Animals) sur CPU.
7. **Plus tard, sur GPU loué ou en pipeline 2×T4** : LoRA Wan 14B ou SCAIL-2 via **diffusion-pipe** ou musubi-tuner.

---

## 4. Gaps

- **Aucun chrono T4 publié** pour Wan-Animate-2 GGUF, SCAIL-2 GGUF, HuMo 1.7B, LongCat-Avatar 1.5 GGUF/INT8, EchoMimic V3
  (testé sur V100, pas sur T4), Qwen-Image-Edit-2511 GGUF ou Qwen3-TTS en fp16. Les seuls chiffres T4 sûrs restent
  One-to-All 1.3B (README) et InfiniteTalk (notebook communautaire).
- **Comportement en fp16** des modèles publiés en bf16 (Wan-Animate-2, SCAIL-2, Qwen3-TTS) : non documenté. Il y a un
  risque de débordement numérique à tester.
- **Détection de visage sur cartoon** : aucune mesure. S3FD (MuseTalk), InsightFace (LatentSync, LivePortrait),
  RetinaFace (EchoMimic) et MediaPipe n'ont pas été évalués sur des têtes stylisées de la troupe.
- **Français** : aucun de ces modèles audio-vidéo ne publie de résultat de synchro labiale en français. Whisper-large-v3
  (HuMo, LongCat 1.5) est un argument, pas une preuve.
- **Licences non relues en texte intégral** : SAM License (SAM3), NLF (poids), face-parse-bisent (jeu d'entraînement),
  poids RetinaFace de serengil, Skywork Community License (PDF), `Kim_Vocal_2` (sans tag). La provenance de
  `convrot_int8_kernels.py` (musubi-tuner) reste à vérifier.
- **Contenu exact des fusions FusionX** (Phantom GGUF) non vérifié fichier par fichier.
- **Statut de la PR llama.cpp #20752** (Qwen3-TTS) non vérifié ; `qwentts.cpp` non examiné.
- **Étoiles** : valeurs arrondies lues par un résumeur automatique (WebFetch) ; ★ de TalkVerse non relevées.

Sources principales : dépôts GitHub listés au §1 (lus par clone superficiel le 16/10/2026) ; API Hugging Face
(`/api/models/<id>`, `/tree/main`) pour les licences et les GGUF ; fiches
[realrebelai/Wan-Animate-2_GGUFs](https://huggingface.co/realrebelai/Wan-Animate-2_GGUFs),
[Qwen/Qwen-Image-2.1 LICENSE](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE),
[InsightFace README (License)](https://github.com/deepinsight/insightface#license),
[IDEA-Research/X-Pose](https://github.com/IDEA-Research/X-Pose),
[facebook/sam3](https://huggingface.co/facebook/sam3), [facebook/sam2.1-hiera-large](https://huggingface.co/facebook/sam2.1-hiera-large),
[snap-research/TalkVerse](https://github.com/snap-research/TalkVerse),
[fengjia-guo/SCAIL-2-Tuner](https://github.com/fengjia-guo/SCAIL-2-Tuner),
[PR llama.cpp #20752 (via semanticdiff)](https://app.semanticdiff.com/gh/ggml-org/llama.cpp/pull/20752/overview),
[Serveurperso/Qwen3-TTS-GGUF](https://huggingface.co/Serveurperso/Qwen3-TTS-GGUF).
