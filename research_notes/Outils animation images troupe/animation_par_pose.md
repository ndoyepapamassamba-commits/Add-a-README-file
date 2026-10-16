# Modèles d'animation de personnage pilotés par la pose / le mouvement — fiches sourcées (état au 16/10/2026)

Périmètre : X-Dyna (ByteDance), AnimateAnyone (HumanAIGC) + Moore-AnimateAnyone + statut d'AnimateAnyone 2, MimicMotion (Tencent), MusePose (TMElyralab), MagicAnimate (magic-research), UniAnimate / UniAnimate-DiT (ali-vilab), StableAnimator, Champ, Wan2.2-Animate (Wan-Animate) et Wan-Animate-2 (sorti le 07/08/2026).

Méthode : dépôts GitHub clonés (métadonnées seulement) le 16/10/2026 pour lire les fichiers LICENSE / README et la date du dernier commit ; API Hugging Face lue le 16/10/2026 pour les licences des poids (champ `license` des cartes de modèle), la liste des fichiers et l'état des Spaces ; articles arXiv et docs ComfyUI lus en ligne. Toutes les dates « dernier commit » ci-dessous viennent de `git log` sur la branche par défaut au 16/10/2026.

---

## 1. Licences : code (LICENSE exact), poids (carte de modèle), sous-modèles requis, usage commercial

### Takeaway
Seuls **Wan2.2-Animate** et **Wan-Animate-2** offrent une chaîne propre « code Apache-2.0 + poids Apache-2.0 » ; avec Wan-Animate-2 il n'y a même plus d'extracteur de pose (donc plus de sous-modèle à licence douteuse). **MimicMotion (poids), MusePose (poids), UniAnimate (modèle)** sont explicitement non commerciaux ; **StableAnimator** dépend d'InsightFace (modèles non commerciaux) ; **Champ** dépend du modèle SMPL (inscription, usage non commercial) ; les modèles SD 1.5 (X-Dyna, Moore-AA, MusePose, MagicAnimate, Champ) héritent de la licence CreativeML OpenRAIL-M, qui n'est ni MIT, ni Apache, ni BSD (règle maison `modeles-libres-moteur`).

### Cited Findings

**X-Dyna (ByteDance)**
- Code : fichier `LICENSE.txt` = Apache License 2.0 ; le README dit « Our code is distributed under the Apache-2.0 license » — [GitHub bytedance/X-Dyna](https://github.com/bytedance/X-Dyna)
- Poids : carte Hugging Face `license: mit` (dernière modif. 20/01/2025) — [HF Boese0601/X-Dyna](https://huggingface.co/Boese0601/X-Dyna)
- Les poids publiés ont été ré-entraînés sur des jeux publics (HumanVid, Pexels…) « for research use » ; le modèle entraîné sur données internes n'est pas publié ; avertissement final : « The purpose of this work is only for research » — [GitHub bytedance/X-Dyna](https://github.com/bytedance/X-Dyna)
- Sous-modèles : UNet Stable Diffusion 1.5 (carte `creativeml-openrail-m`) — [HF stable-diffusion-v1-5](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5) ; initialisation ControlNet `control_v11p_sd15_openpose` (carte `openrail`) — [HF lllyasviel/control_v11p_sd15_openpose](https://huggingface.co/lllyasviel/control_v11p_sd15_openpose) ; IP-Adapter (carte `apache-2.0`) — [HF h94/IP-Adapter](https://huggingface.co/h94/IP-Adapter) ; AnimateDiff (carte `apache-2.0`) — [HF guoyww/animatediff](https://huggingface.co/guoyww/animatediff)

**AnimateAnyone (HumanAIGC, original) et AnimateAnyone 2**
- Le dépôt officiel ne contient que `LICENSE` (Apache 2.0), `README.md` et `docs/` : **aucun code ni poids** ; le README renvoie désormais vers « our open-source work: Wan-Animate » (dernier commit 20/09/2025) — [GitHub HumanAIGC/AnimateAnyone](https://github.com/HumanAIGC/AnimateAnyone)
- AnimateAnyone 2 (arXiv 2502.06145) : la page projet ne contient aucune annonce de publication de code ni de poids — [Page projet Animate Anyone 2](https://humanaigc.github.io/animate-anyone-2/) ; [arXiv 2502.06145](https://arxiv.org/abs/2502.06145). Un clone de `github.com/HumanAIGC/AnimateAnyone2` le 16/10/2026 a échoué (dépôt inexistant ou privé) — constat de clonage, pas de page à citer.

**Moore-AnimateAnyone (réimplémentation ouverte de Moore Threads)**
- Code : `LICENSE` = « Copyright @2023-2024 Moore Threads Technology Co., Ltd » + Apache License 2.0 ; `NOTICE` : composants tiers majic-animate (BSD 3-Clause, Bytedance), animatediff (Apache 2.0), DWPose (Apache 2.0), animatediff-cli-prompt-travel (Apache 2.0) — [GitHub MooreThreads/Moore-AnimateAnyone](https://github.com/MooreThreads/Moore-AnimateAnyone)
- Poids : carte `license: apache-2.0` (4 fichiers : denoising_unet, reference_unet, pose_guider, motion_module ; 15/01/2024) — [HF patrolli/AnimateAnyone](https://huggingface.co/patrolli/AnimateAnyone)
- Le README précise « This project is intended for academic research » (clause de non-responsabilité) — [GitHub MooreThreads/Moore-AnimateAnyone](https://github.com/MooreThreads/Moore-AnimateAnyone)
- Sous-modèles exigés : SD 1.5, `sd-vae-ft-mse`, `image_encoder` de `lambdalabs/sd-image-variations-diffusers`, DWPose (`dw-ll_ucoco_384.onnx`, `yolox_l.onnx`) — [GitHub MooreThreads/Moore-AnimateAnyone](https://github.com/MooreThreads/Moore-AnimateAnyone) ; `sd-vae-ft-mse` = carte `mit` — [HF stabilityai/sd-vae-ft-mse](https://huggingface.co/stabilityai/sd-vae-ft-mse)
- **Alerte d'approvisionnement** : au 16/10/2026, le dépôt `lambdalabs/sd-image-variations-diffusers` ne contient plus que `.gitattributes` et un `README.md` de 28 octets (`license: apache-2.0`), avec un seul commit « initial commit » daté du 07/10/2026 : l'`image_encoder` n'y est plus téléchargeable — [API HF (arbre de fichiers)](https://huggingface.co/api/models/lambdalabs/sd-image-variations-diffusers/tree/main) ; [HF lambdalabs/sd-image-variations-diffusers](https://huggingface.co/lambdalabs/sd-image-variations-diffusers). Le dépôt de poids de Champ embarque une copie `image_encoder/` — [HF fudan-generative-ai/champ](https://huggingface.co/fudan-generative-ai/champ)

**MimicMotion (Tencent)**
- Code : `LICENSE` GitHub = Apache 2.0 « except for the third-party components listed below » (diffusers, DWPose, transformers en Apache-2.0 ; PyTorch etc. en BSD-3) — [GitHub Tencent/MimicMotion](https://github.com/Tencent/MimicMotion)
- **Poids : NON commerciaux.** Le `LICENSE` du dépôt de poids dit : « You agree to use the MimicMotion only for academic, research and education purposes, and refrain from using it for any commercial or production purposes under any circumstances » ; carte HF `license: other` — [HF tencent/MimicMotion LICENSE](https://huggingface.co/tencent/MimicMotion/blob/main/LICENSE)
- Base : Stable Video Diffusion 1.1 (`stabilityai/stable-video-diffusion-img2vid-xt-1-1`, téléchargé automatiquement), sous « STABILITY AI COMMUNITY LICENSE AGREEMENT » — [HF tencent/MimicMotion NOTICE](https://huggingface.co/tencent/MimicMotion/blob/main/NOTICE) ; carte SVD 1.1 : `license_name: stable-video-diffusion-1-1-community`, accès restreint (gated) — [HF SVD xt 1.1](https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt-1-1)
- Stability AI Community License : usage commercial gratuit seulement pour les entités à moins de 1 000 000 USD de revenu annuel, avec inscription obligatoire, attribution « Powered by Stability AI », et interdiction d'utiliser les sorties pour entraîner un modèle génératif fondamental — [HF tencent/MimicMotion NOTICE](https://huggingface.co/tencent/MimicMotion/blob/main/NOTICE) ; [HF SVD xt LICENSE.md (version du 05/07/2024)](https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/blob/main/LICENSE.md)
- DWPose : code Apache-2.0 — [GitHub IDEA-Research/DWPose](https://github.com/IDEA-Research/DWPose) ; poids `yzd-v/DWPose` carte `apache-2.0` — [HF yzd-v/DWPose](https://huggingface.co/yzd-v/DWPose)

**MusePose (TMElyralab / Tencent Music) — vérification demandée**
- Code : `LICENSE` = MIT, « Copyright (c) 2024 Tencent Music Entertainment Group » ; README : « The code of MusePose is released under the MIT License. There is no limitation for both academic and commercial usage » — [GitHub TMElyralab/MusePose](https://github.com/TMElyralab/MusePose)
- **Poids : non commerciaux, confirmé.** README GitHub ET carte HF : « `model`: The trained model are available for non-commercial research purposes only » ; « The testdata are collected from internet, which are available for non-commercial research purposes only » — [GitHub TMElyralab/MusePose](https://github.com/TMElyralab/MusePose) ; [HF TMElyralab/MusePose](https://huggingface.co/TMElyralab/MusePose)
- **Contradiction relevée** : l'en-tête YAML de la même carte HF indique `license: creativeml-openrail-m`, alors que le texte de la carte restreint le modèle à la recherche non commerciale — [HF TMElyralab/MusePose](https://huggingface.co/TMElyralab/MusePose). Le texte explicite est plus restrictif ; c'est lui qui doit primer par prudence (voir Inferences).
- Sous-modèles : `sd-image-variations-diffusers` (unet + image_encoder, dépôt vidé au 07/10/2026, cf. ci-dessus), `sd-vae-ft-mse`, DWPose ; pour l'entraînement : `control_v11p_sd15_openpose` et `mm_sd_v15_v2.ckpt` (AnimateDiff) — [GitHub TMElyralab/MusePose](https://github.com/TMElyralab/MusePose)

**MagicAnimate (magic-research / ByteDance)**
- Code : `LICENSE` = BSD 3-Clause, « Copyright 2023 MagicAnimate Team » — [GitHub magic-research/magic-animate](https://github.com/magic-research/magic-animate)
- Poids : carte `license: bsd-3-clause` (appearance_encoder, densepose_controlnet, temporal_attention ; 04/12/2023) — [HF zcxu-eric/MagicAnimate](https://huggingface.co/zcxu-eric/MagicAnimate)
- Sous-modèles : SD 1.5 (OpenRAIL-M) + `sd-vae-ft-mse` — [GitHub magic-research/magic-animate](https://github.com/magic-research/magic-animate) ; le pilotage se fait par vidéo DensePose ; outil courant `vid2densepose` = MIT — [GitHub Flode-Labs/vid2densepose](https://github.com/Flode-Labs/vid2densepose) ; detectron2 = Apache 2.0 — [GitHub facebookresearch/detectron2](https://github.com/facebookresearch/detectron2)

**UniAnimate (ali-vilab)**
- Code : **aucun fichier LICENSE** à la racine du dépôt (constat au 16/10/2026) ; « Disclaimer » du README : « This open-source model is intended for RESEARCH/NON-COMMERCIAL USE ONLY » — [GitHub ali-vilab/UniAnimate](https://github.com/ali-vilab/UniAnimate)
- Poids : distribués via ModelScope (`modelscope ... snapshot_download`) ; licence des poids : non précisée ailleurs que dans ce disclaimer — [GitHub ali-vilab/UniAnimate](https://github.com/ali-vilab/UniAnimate)

**UniAnimate-DiT (ali-vilab, avril 2025)**
- Code : **aucun fichier LICENSE** dans le dépôt ; le README contient seulement « This project is intended for academic research » (non-responsabilité) ; bâti sur DiffSynth-Studio — [GitHub ali-vilab/UniAnimate-DiT](https://github.com/ali-vilab/UniAnimate-DiT) ; DiffSynth-Studio = Apache 2.0 — [GitHub modelscope/DiffSynth-Studio](https://github.com/modelscope/DiffSynth-Studio)
- Poids (LoRA `UniAnimate-Wan2.1-14B-Lora-12000.ckpt` + DWPose onnx) : carte HF `license: mit` — [HF ZheWang123/UniAnimate-DiT](https://huggingface.co/ZheWang123/UniAnimate-DiT)
- Base : Wan2.1-I2V-14B-720P, carte `apache-2.0` — [HF Wan-AI/Wan2.1-I2V-14B-720P](https://huggingface.co/Wan-AI/Wan2.1-I2V-14B-720P)

**StableAnimator (Fudan / MSRA, CVPR 2025)**
- Code : `LICENSE` = MIT, « Copyright (c) Shuyuan Tu » — [GitHub Francis-Rings/StableAnimator](https://github.com/Francis-Rings/StableAnimator)
- Poids : carte `license: apache-2.0` (unet, pose_net, face_encoder, `glintr100_torch.pth`, DWPose onnx) — [HF FrancisRing/StableAnimator](https://huggingface.co/FrancisRing/StableAnimator)
- Sous-modèles : SVD xt (`svd_xt.safetensors`) et InsightFace **antelopev2** (glintr100) — [GitHub Francis-Rings/StableAnimator](https://github.com/Francis-Rings/StableAnimator) ; SVD xt = Stability AI Community License — [HF SVD xt LICENSE.md](https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/blob/main/LICENSE.md) ; InsightFace : « The training data containing the annotation (and the models trained with these data) are available for non-commercial research purposes only », y compris les modèles auto-téléchargés — [GitHub deepinsight/insightface](https://github.com/deepinsight/insightface)

**Champ (Fudan, ECCV 2024)**
- Code : `LICENSE` = MIT, « Fusion Lab: Generative Vision Lab of Fudan University » — [GitHub fudan-generative-vision/champ](https://github.com/fudan-generative-vision/champ)
- Poids : carte `license: apache-2.0` (denoising/reference UNet, guidance encoders depth/normal/semantic/dwpose, motion module + copies de SD 1.5, sd-vae-ft-mse, image_encoder ; dernière modif. 31/07/2026) — [HF fudan-generative-ai/champ](https://huggingface.co/fudan-generative-ai/champ)
- Sous-modèles pour préparer le mouvement : 4D-Humans (MIT) qui exige de télécharger le modèle **SMPL** après inscription (« register to get access ») sur smplify.is.tue.mpg.de — [GitHub shubham-goel/4D-Humans](https://github.com/shubham-goel/4D-Humans) ; detectron2 (Apache 2.0) et Blender 3.6 — [Champ docs/data_process.md](https://github.com/fudan-generative-vision/champ/blob/master/docs/data_process.md)

**Wan2.2-Animate (Wan-Animate, Alibaba Tongyi, sorti le 19/09/2025)**
- Code : `LICENSE.txt` = Apache 2.0 ; README : « The models in this repository are licensed under the Apache 2.0 License. We claim no rights over the your generated contents » — [GitHub Wan-Video/Wan2.2](https://github.com/Wan-Video/Wan2.2)
- Poids : carte `apache-2.0` (172 847 téléchargements au 16/10/2026) — [HF Wan-AI/Wan2.2-Animate-14B](https://huggingface.co/Wan-AI/Wan2.2-Animate-14B) ; version Diffusers `apache-2.0` — [HF Wan-AI/Wan2.2-Animate-14B-Diffusers](https://huggingface.co/Wan-AI/Wan2.2-Animate-14B-Diffusers) ; reconditionnement ComfyUI `apache-2.0` (dont `wan2.2_animate_14B_bf16` et `wan2.2_animate_14B_int8_convrot`) — [HF Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged)
- **Sous-modèles du prétraitement officiel** : `det/yolov10m.onnx`, `pose2d/vitpose_h_wholebody.onnx` (obligatoires), `sam2/sam2_hiera_large.pt` et `FLUX.1-Kontext-dev` (optionnels) — [Wan2.2 UserGuider (prétraitement)](https://github.com/Wan-Video/Wan2.2/blob/main/wan/modules/animate/preprocess/UserGuider.md) ; ces fichiers yolov10m / vitpose sont livrés dans `process_checkpoint/` du dépôt HF — [HF Wan-AI/Wan2.2-Animate-14B](https://huggingface.co/Wan-AI/Wan2.2-Animate-14B)
- Licences de ces sous-modèles : YOLOv10 (THU-MIG) = **GNU AGPL v3** — [GitHub THU-MIG/yolov10](https://github.com/THU-MIG/yolov10) ; ViTPose = Apache 2.0 — [GitHub ViTAE-Transformer/ViTPose](https://github.com/ViTAE-Transformer/ViTPose) ; SAM 2 = Apache 2.0 — [GitHub facebookresearch/sam2](https://github.com/facebookresearch/sam2) ; FLUX.1-Kontext-dev = `flux-1-dev-non-commercial-license` (accès restreint) — [HF black-forest-labs/FLUX.1-Kontext-dev](https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev)
- Dans le flux ComfyUI officiel, le prétraitement se fait avec « DWPose Estimator » de comfyui_controlnet_aux (et non yolov10/vitpose) — [Docs ComfyUI Wan2.2 Animate](https://docs.comfy.org/tutorials/video/wan/wan2-2-animate) ; comfyui_controlnet_aux = Apache 2.0 — [GitHub Fannovel16/comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) ; son détecteur YOLOX = Apache 2.0 — [GitHub Megvii-BaseDetection/YOLOX](https://github.com/Megvii-BaseDetection/YOLOX)

**Wan-Animate-2 (sorti le 07/08/2026)**
- Code : `LICENSE` = Apache 2.0 ; section « License » du README : « This project is licensed under the Apache License 2.0 » ; 13 commits du 06/08 au 08/08/2026 — [GitHub Wan-Video/Wan-Animate-2](https://github.com/Wan-Video/Wan-Animate-2)
- Poids : « Wan-Animate-2 Base » et « Distillation » publiés le 07/08/2026, cartes `apache-2.0` — [HF Wan-AI/Wan2.2-Animate-2-14B](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B) ; [HF Wan-AI/Wan2.2-Animate-2-14B-Distilled-Diffusers](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B-Distilled-Diffusers)
- Pas d'extracteur de mouvement : « directly consumes driving videos … by eliminating intermediate motion extractors » — [GitHub Wan-Video/Wan-Animate-2](https://github.com/Wan-Video/Wan-Animate-2) ; [arXiv 2608.06009](https://arxiv.org/abs/2608.06009). Sous-modèles chargés : T5 umt5-xxl, VAE Wan, CLIP xlm-roberta ViT-H/14 (fichiers inclus dans le dépôt HF sous licence de carte `apache-2.0`) — [HF Wan-AI/Wan2.2-Animate-2-14B](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B)
- Le README demande une légende de l'image (apparence + décor) produite par un LLM (exemple : Qwen3.7-Plus) comme prompt — [GitHub Wan-Video/Wan-Animate-2](https://github.com/Wan-Video/Wan-Animate-2)

**Couche d'outillage (pertinent pour la règle maison MIT/Apache/BSD)**
- ComfyUI (cœur) = **GNU GPL v3** — [GitHub comfyanonymous/ComfyUI](https://github.com/comfyanonymous/ComfyUI) ; ComfyUI-KJNodes = **GNU GPL v3** — [GitHub kijai/ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes)
- diffusers = Apache 2.0 et contient `pipelines/wan/pipeline_wan_animate.py` — [GitHub huggingface/diffusers](https://github.com/huggingface/diffusers)
- OpenPose CMU (si on l'utilisait à la place de DWPose) : « ACADEMIC OR NON-PROFIT ORGANIZATION NONCOMMERCIAL RESEARCH USE ONLY » — [GitHub CMU-Perceptual-Computing-Lab/openpose](https://github.com/CMU-Perceptual-Computing-Lab/openpose)

### Inferences
- Tableau de synthèse (déduit des constats ci-dessus) :

| Outil | Code | Poids | Sous-modèle bloquant | Commercial ? | Règle maison MIT/Apache/BSD |
|---|---|---|---|---|---|
| Wan-Animate-2 | Apache-2.0 | Apache-2.0 | aucun extracteur | oui | conforme (hors ComfyUI GPL) |
| Wan2.2-Animate | Apache-2.0 | Apache-2.0 | yolov10m (AGPL) dans le prétraitement officiel ; FLUX Kontext dev (NC) optionnel | oui si prétraitement DWPose/YOLOX | conforme avec DWPose + diffusers |
| UniAnimate-DiT | pas de LICENSE | MIT (carte) | Wan2.1 Apache | ambigu (code sans licence) | à clarifier |
| X-Dyna | Apache-2.0 | MIT | SD 1.5 OpenRAIL-M, ControlNet OpenRAIL | possible sous OpenRAIL, mais « research only » affiché | non conforme (OpenRAIL) |
| Moore-AnimateAnyone | Apache-2.0 | Apache-2.0 | SD 1.5 OpenRAIL-M ; image_encoder introuvable | possible sous OpenRAIL | non conforme (OpenRAIL) |
| MagicAnimate | BSD-3 | BSD-3 | SD 1.5 OpenRAIL-M | possible sous OpenRAIL | non conforme (OpenRAIL) |
| StableAnimator | MIT | Apache-2.0 | InsightFace (NC) + SVD (Community) | non (InsightFace) | non conforme |
| Champ | MIT | Apache-2.0 | SMPL (inscription, NC) + SD 1.5 | non | non conforme |
| MimicMotion | Apache-2.0 | **recherche/éducation seulement** | SVD 1.1 Community | non | non conforme |
| MusePose | MIT | **non commercial** | SD 1.5 | non | non conforme |
| UniAnimate | pas de LICENSE | **non commercial** | — | non | non conforme |

- Une chaîne entièrement MIT/Apache/BSD est possible avec : poids Wan2.2-Animate ou Wan-Animate-2 (Apache) + diffusers (Apache) ou DiffSynth-Studio (Apache) + DWPose/YOLOX (Apache) pour Wan2.2-Animate. ComfyUI et KJNodes étant GPL-3.0, les exécuter localement sort de la règle maison stricte (MIT/Apache/BSD) même si la GPL n'interdit pas l'usage commercial.
- Pour MusePose, l'étiquette `creativeml-openrail-m` de la carte contredit le texte ; en l'absence d'arbitrage par l'éditeur, considérer les poids comme non commerciaux.

### Gaps
- Licence exacte des poids UniAnimate (ModelScope) : non précisée hors du disclaimer README.
- Licence de redistribution des poids `yolov10m.onnx` inclus dans le dépôt HF Wan2.2-Animate (le dépôt est globalement étiqueté Apache-2.0, le projet d'origine est AGPL-3.0) : non clarifiée par Alibaba.
- Licence d'origine de `lambdalabs/sd-image-variations-diffusers` avant son vidage du 07/10/2026 : non vérifiable aujourd'hui (le dépôt actuel n'affiche que `apache-2.0` sur un README vide).
- Pas de LICENSE dans le dépôt ComfyUI-MagicAnimate (thecooltechguy) : licence non précisée.

---

## 2. Entrées, conservation du décor, multi-personnages, visage/expressions, audio

### Takeaway
Tous prennent **une image de référence + un mouvement** (squelette, DensePose, SMPL ou vidéo brute). **Wan2.2-Animate (mode animation)** est le seul à garantir explicitement que **le décor de l'image source est conservé** ; Wan-Animate-2 consomme directement la vidéo pilote (sans squelette) et ajoute un contrôle du point de vue par texte. **Aucun** ne documente l'animation de plusieurs personnages distincts dans un même passage ; aucun n'a d'entrée audio/lip-sync (le visage suit la vidéo pilote).

### Cited Findings
- **X-Dyna** : image unique + vidéo pilote (expressions faciales et mouvements du corps) ; génère des « context-aware dynamics for both the subject and the surrounding environment » (le décor est animé, pas figé) ; ControlNet visage « S-Face » optionnel (`--face_controlnet`) ; sortie à 15 i/s par défaut (`--save_fps 15`) — [GitHub bytedance/X-Dyna](https://github.com/bytedance/X-Dyna)
- **Moore-AnimateAnyone** : image + séquence DWPose ; module séparé de « face reenactment » piloté par les repères faciaux d'une vidéo (OpenSeeFace) dont les poids sont sur Baidu Pan — [GitHub MooreThreads/Moore-AnimateAnyone](https://github.com/MooreThreads/Moore-AnimateAnyone)
- **AnimateAnyone 2** (non publié) : prend en compte l'environnement (« the region with the exclusion of characters ») via un masque agnostique de forme, un « object guider » pour les objets en interaction, et montre des interactions entre personnages — [Page projet Animate Anyone 2](https://humanaigc.github.io/animate-anyone-2/)
- **MimicMotion** : image + poses DWPose ; v1.1 jusqu'à 72 images en 576×1024 — [GitHub Tencent/MimicMotion](https://github.com/Tencent/MimicMotion)
- **MusePose** : image + séquence de poses ; fournit un algorithme `pose_align` pour aligner une vidéo de danse quelconque sur une image de référence quelconque ; conseille FaceFusion (face-swap) pour améliorer la cohérence du visage — [GitHub TMElyralab/MusePose](https://github.com/TMElyralab/MusePose)
- **MagicAnimate** : image + vidéo DensePose (`densepose_controlnet`) — [HF zcxu-eric/MagicAnimate](https://huggingface.co/zcxu-eric/MagicAnimate) ; [GitHub magic-research/magic-animate](https://github.com/magic-research/magic-animate)
- **UniAnimate** : image + séquence de poses DWPose alignées ; l'alignement utilise la première image de la séquence cible pour calculer l'échelle, d'où l'intérêt d'une première image montrant visage, mains et pieds — [GitHub ali-vilab/UniAnimate](https://github.com/ali-vilab/UniAnimate)
- **UniAnimate-DiT** : image + poses DWPose (`run_align_pose.py`), 81 images en 832×480 ou 1280×720, mode vidéo longue — [GitHub ali-vilab/UniAnimate-DiT](https://github.com/ali-vilab/UniAnimate-DiT)
- **StableAnimator** : image + squelettes + masques de visage extraits ; module visage dédié (face encoder + optimisation HJB) pour préserver l'identité « without any post-processing » — [GitHub Francis-Rings/StableAnimator](https://github.com/Francis-Rings/StableAnimator)
- **Champ** : image + mouvement SMPL rendu (profondeur, normales, carte sémantique) + DWPose ; script de lissage des SMPL dans Blender — [GitHub fudan-generative-vision/champ](https://github.com/fudan-generative-vision/champ) ; [Champ docs/data_process.md](https://github.com/fudan-generative-vision/champ/blob/master/docs/data_process.md)
- **Wan2.2-Animate** : deux modes ; en **animation**, « the background from the source image is preserved » ; en **remplacement**, le personnage est inséré dans la vidéo pilote (décor de la vidéo) avec une « Relighting LoRA » qui adapte lumière et teinte — [arXiv 2509.14055 (HTML)](https://arxiv.org/html/2509.14055)
- Wan2.2-Animate : le corps est piloté par squelette, le visage par les **images brutes du visage** (encodées en latent implicite, injectées dans des « Face Blocks » toutes les 5 couches) — [arXiv 2509.14055 (HTML)](https://arxiv.org/html/2509.14055)
- Wan2.2-Animate : le prétraitement produit `src_pose.mp4` et `src_face.mp4` (animation), plus `src_bg.mp4` et `src_mask.mp4` (remplacement) ; retargeting de pose recommandé en mode animation, avec une version « basique » qui exige que référence et première image pilote soient « front-facing, stretched pose » — [Wan2.2 UserGuider](https://github.com/Wan-Video/Wan2.2/blob/main/wan/modules/animate/preprocess/UserGuider.md)
- Wan2.2-Animate multi-personnes : « This mask extraction process is designed for single-person videos ONLY and may produce incorrect results or fail in multi-person videos » — [Wan2.2 UserGuider](https://github.com/Wan-Video/Wan2.2/blob/main/wan/modules/animate/preprocess/UserGuider.md) ; données d'entraînement filtrées pour que « each video clip features only a single, consistent character » — [arXiv 2509.14055 (HTML)](https://arxiv.org/html/2509.14055)
- Nœud ComfyUI `WanAnimateToVideo` : entrées `reference_image`, `face_video`, `pose_video`, `background_video`, `character_mask`, `continue_motion` (enchaînement de segments) ; mode « Move » = débrancher `background_video` et `character_mask` — [ComfyUI nodes_wan.py](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy_extras/nodes_wan.py) ; [Docs ComfyUI Wan2.2 Animate](https://docs.comfy.org/tutorials/video/wan/wan2-2-animate)
- **Wan-Animate-2** : entrée = image de référence + **vidéo pilote brute** (`--refer-video-file`) + prompt ; « text-driven viewpoint control that decouples the output camera perspective from the driving video » ; variante Lite temps réel pour le streaming — [GitHub Wan-Video/Wan-Animate-2](https://github.com/Wan-Video/Wan-Animate-2) ; [arXiv 2608.06009](https://arxiv.org/abs/2608.06009)
- Nœud ComfyUI `WanAnimate2ToVideo` : « effectively replicating the facial animation, body motion and hands gesture from the video » ; réglages `pose_strength`, `pose_start_percent`/`pose_end_percent`, `reference_image_strength` (en dessous de 1.0 « loosens identity ») ; pas d'entrée `background_video` ni `character_mask` — [ComfyUI nodes_wan.py](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy_extras/nodes_wan.py)

### Inferences
- Pour « le personnage reste dans sa scène », Wan2.2-Animate en mode animation est la seule option documentée qui conserve le décor de l'image source ; les modèles SD 1.5 à ReferenceNet (Moore-AA, MusePose, Champ, UniAnimate) régénèrent toute l'image, d'où les artefacts/scintillements de décor signalés (cf. §3).
- Plusieurs personnages : faute de support natif, la voie réaliste est la **composition par calques** — découper chaque personnage (SAM 2, Apache-2.0), animer chacun séparément sur son propre plan avec sa propre vidéo pilote, puis recomposer sur le décor fixe ; ou enchaîner des passes successives en mode remplacement. Ni l'une ni l'autre n'est documentée par les éditeurs : à mesurer.
- Personnage assis / mains sur les hanches : le retargeting « basique » de Wan2.2-Animate suppose une pose de face bras écartés ; il vaut mieux tourner la vidéo pilote en reproduisant la pose de départ (acteur assis, mains sur les hanches) et désactiver le retargeting, ou utiliser Wan-Animate-2 qui n'aligne pas de squelette.
- Mocap CMU BVH : pour les modèles à squelette 2D (Wan2.2-Animate, UniAnimate-DiT, MimicMotion…), projeter le BVH en squelette DWPose/OpenPose 2D (rendu Blender) ; pour Wan-Animate-2 (vidéo brute), rendre un mannequin 3D neutre animé par le BVH et s'en servir comme vidéo pilote ; pour Champ, convertir BVH → SMPL. Aucune de ces conversions n'est documentée par les éditeurs.
- Le lip-sync du dialogue français devra venir d'ailleurs (vidéo pilote d'un acteur qui prononce le texte, ou modèle audio séparé) : aucun des modèles étudiés ne prend d'audio.

### Gaps
- Aucune source ne documente un essai multi-personnages (2–3 personnages, mouvements indépendants) pour ces modèles, y compris Wan-Animate-2.
- Le comportement exact de Wan-Animate-2 vis-à-vis du décor de l'image de référence n'est pas décrit dans le résumé arXiv ni le README (seul le prompt « 背景描述 » laisse penser que le décor de la référence est décrit et conservé) : à vérifier par test.
- Pas de source sur la qualité du pilotage par squelette issu de mocap (BVH) plutôt que d'une vidéo réelle.

---

## 3. Qualité sur personnages cartoon / stylisés, défauts connus, benchmarks

### Takeaway
Sur benchmark humain, **Wan2.2-Animate** domine tous les modèles de cette liste (SSIM 0,813, LPIPS 0,227, FVD 118,65 contre 147,92 au mieux pour StableAnimator). Sur personnages **anthropomorphes/cartoon** (A²Bench d'Animate-X), les méthodes à alignement de pose SD (Moore-AA, MimicMotion, MusePose, UniAnimate) s'effondrent (FVD 1 156 à 2 250) : elles imposent une morphologie humaine et sacrifient l'identité. Aucun chiffre public n'existe encore pour Wan-Animate / Wan-Animate-2 sur personnages stylisés.

### Cited Findings
- Tableau comparatif de Wan-Animate (corps entier, SSIM ↑ / LPIPS ↓ / FVD ↓) : Moore-AA 0,761 / 0,288 / 170,07 ; Champ 0,749 / 0,297 / 177,64 ; MimicMotion 0,742 / 0,307 / 184,71 ; UniAnimate 0,787 / 0,271 / 155,03 ; StableAnimator 0,794 / 0,265 / 147,92 ; **Wan-Animate 0,813 / 0,227 / 118,65** — [arXiv 2509.14055 (HTML)](https://arxiv.org/html/2509.14055)
- Même article, portrait/visage : LivePortrait 0,811 / 0,231 / 118,67 ; X-Portrait2 0,825 / 0,212 / 98,03 ; **Wan-Animate 0,834 / 0,205 / 94,65** ; étude humaine (20 participants) contre Runway Act-Two et DreamActor-M1 jugée favorable à Wan-Animate (pourcentages seulement dans la figure 5) — [arXiv 2509.14055 (HTML)](https://arxiv.org/html/2509.14055)
- Wan-Animate sur personnages non réalistes : le squelette « offers better generality, particularly for non-humanoid characters with unconventional shapes » et le modèle « generalizes well to a wide range of humanoid characters », sans chiffre sur personnages stylisés — [arXiv 2509.14055 (HTML)](https://arxiv.org/html/2509.14055)
- Défauts connus Wan-Animate : squelettes 2D « susceptible to issues like missing or erroneous keypoints », difficulté sur les « complex motions due to spatial ambiguity », déformations en remplacement si morphologies très différentes — [arXiv 2509.14055 (HTML)](https://arxiv.org/html/2509.14055) ; retargeting simplifié « NOT guaranteed to be perfect » — [Wan2.2 UserGuider](https://github.com/Wan-Video/Wan2.2/blob/main/wan/modules/animate/preprocess/UserGuider.md)
- Wan-Animate-2 : l'article justifie la suppression des extracteurs (représentations explicites = erreurs d'extraction et dérive d'identité ; implicites = perte de détails) ; évaluation **qualitative et par étude utilisateur seulement**, aucun benchmark chiffré dans le résumé — [arXiv 2608.06009](https://arxiv.org/abs/2608.06009). L'exemple officiel du README anime un **chaton anthropomorphe en uniforme** (personnage stylisé) — [GitHub Wan-Video/Wan-Animate-2](https://github.com/Wan-Video/Wan-Animate-2)
- **A²Bench (Animate-X, personnages anthropomorphes)**, FID ↓ / FID-VID ↓ / FVD ↓ : Moore-AnimateAnyone 50,97 / 75,11 / 1 367,84 ; MimicMotion 122,92 / 129,40 / 2 250,13 ; ControlNeXt 68,15 / 81,05 / 1 652,09 ; MusePose 100,91 / 114,15 / 1 760,46 ; UniAnimate 48,47 / 61,03 / 1 156,36 ; Animate-X 26,11 / 32,23 / 703,87 — [arXiv 2410.10306 (HTML)](https://arxiv.org/html/2410.10306)
- Explication d'Animate-X : les modèles entraînés sur des vidéos de danse humaines « tend to introduce unrelated human characteristics », d'où des « excessive sacrifices in identity preservation in favor of strict pose consistency », et ils exigent un alignement strict référence/vidéo pilote — [arXiv 2410.10306 (HTML)](https://arxiv.org/html/2410.10306) ; Animate-X lui-même : code Apache-2.0 — [GitHub antgroup/animate-x](https://github.com/antgroup/animate-x)
- MusePose, limites déclarées : « some details of the original character are not well preserved (e.g. face region and complex clothing) » et « noise and flicking in complex background » ; la résolution influe sur le visage — [GitHub TMElyralab/MusePose](https://github.com/TMElyralab/MusePose)
- Moore-AnimateAnyone, limite déclarée : « The background may occur some artifacts, when the reference image has a clean background » — [GitHub MooreThreads/Moore-AnimateAnyone](https://github.com/MooreThreads/Moore-AnimateAnyone)
- StableAnimator : entraînement sur vidéos à fond statique conseillé (« The backgrounds of the selected training videos should remain static ») — [GitHub Francis-Rings/StableAnimator](https://github.com/Francis-Rings/StableAnimator)
- UniAnimate-DiT : TeaCache en 720p long « may lead to inconsistent background » ; « about 1000 training videos can finetune a good human image animation model » (LoRA sur un A100) — [GitHub ali-vilab/UniAnimate-DiT](https://github.com/ali-vilab/UniAnimate-DiT)
- X-Dyna : comparé à MagicPose et MimicMotion sur la dynamique des textures ; code d'évaluation (DTFVD, Face-Cos…) non publié — [GitHub bytedance/X-Dyna](https://github.com/bytedance/X-Dyna)
- Wan2.2 Animate (ComfyUI) : vidéos d'entrée à mouvements très rapides ou multiples changements de plan déconseillées — [Scenario, Wan 2.2 Animate essentials](https://help.scenario.com/en/articles/wan-2-2-animate-models-the-essentials)

### Inferences
- Pour des personnages Pixar-like africains aux proportions cartoon (grosses têtes, membres courts), les modèles SD 1.5 à alignement de pose risquent d'« humaniser » la silhouette et de perdre l'identité (preuve indirecte A²Bench). Wan2.2-Animate et Wan-Animate-2, entraînés à plus grande échelle et sur base Wan 14B, sont les candidats les plus crédibles, mais il faut les **mesurer sur nos propres planches** (fidélité visage/tenue, mains, décor) avant d'industrialiser.
- Mains (mains sur les hanches) : le squelette DWPose / ViTPose wholebody inclut les mains ; Wan-Animate-2 évite les erreurs de points clés en lisant directement la vidéo. Les deux doivent être testés sur ce geste précis.
- UniAnimate-DiT permet un affinage LoRA avec ~1 000 vidéos : piste d'adaptation au style « troupe » si les modèles génériques déforment nos personnages.

### Gaps
- Aucun benchmark public chiffré de Wan2.2-Animate, Wan-Animate-2, X-Dyna, StableAnimator ou Champ sur personnages cartoon/stylisés.
- Les pourcentages de l'étude utilisateur Wan-Animate (figure 5) et de Wan-Animate-2 n'ont pas été extraits.
- Pas de source indépendante (hors auteurs) comparant ces modèles sur des personnages à peau foncée / style 3D cartoon.

---

## 4. Matériel : VRAM, vitesse par clip, CPU ; état de maintenance

### Takeaway
Les modèles SD 1.5 / SVD tiennent sur 8–28 Go ; les modèles Wan 14B (Wan2.2-Animate, UniAnimate-DiT, Wan-Animate-2) demandent 14–80 Go selon déchargement et quantification. Chiffres de vitesse publiés : StableAnimator 5 min pour 15 s (512², RTX 4090), MimicMotion 20 min pour 35 s (RTX 4090), UniAnimate-DiT ~3 min pour 5 s en 480p (A800, TeaCache). Aucun n'est documenté comme exploitable sur CPU. Projets actifs en 2026 : Wan2.2 (commit 21/09/2026), Wan-Animate-2 (août 2026), ComfyUI (16/10/2026) ; la plupart des autres sont figés depuis 2024–2025.

### Cited Findings

**VRAM et vitesse**
- X-Dyna : testé sur un A100 ; minimum 20 Go pour 16 images (batch 1) ; 80 Go recommandés — [GitHub bytedance/X-Dyna](https://github.com/bytedance/X-Dyna)
- Moore-AnimateAnyone : appli gradio locale si « >= 16GB vram » — [GitHub MooreThreads/Moore-AnimateAnyone](https://github.com/MooreThreads/Moore-AnimateAnyone)
- MimicMotion : vidéo démo de 35 s = 16 Go (RTX 4060 Ti) et 20 min sur RTX 4090 ; 8 Go minimum pour l'UNet 16 images mais le décodeur VAE demande 16 Go (exécutable sur CPU) ; validé sur V100 — [GitHub Tencent/MimicMotion](https://github.com/Tencent/MimicMotion)
- MusePose : 16 Go pour 512×512×48 ; 28 Go pour 768×768×48 — [GitHub TMElyralab/MusePose](https://github.com/TMElyralab/MusePose)
- UniAnimate : ~12 Go pour 32×768×512 avec CLIP et VAE déchargés sur CPU ; ~21 Go en 768×1216 — [GitHub ali-vilab/UniAnimate](https://github.com/ali-vilab/UniAnimate)
- UniAnimate-DiT : ~23 Go en 480p (81 images 832×480) ; 14 Go avec `num_persistent_param_in_dit=0` (23,0 s/itération contre 20,5) ; ~36 Go en 720p ; ~3 min pour 5 s en 480p et ~13 min en 720p sur un A800 avec TeaCache (~×4) — [GitHub ali-vilab/UniAnimate-DiT](https://github.com/ali-vilab/UniAnimate-DiT)
- StableAnimator : démo 15 s (512×512, 30 i/s) = 8 Go et 5 min sur RTX 4090 (modèle de base 16 images) ; modèle pro : 10 Go pour l'UNet en 576×1024, VAE 16 Go (exécutable sur CPU) — [GitHub Francis-Rings/StableAnimator](https://github.com/Francis-Rings/StableAnimator)
- Champ : GPU testés A100 et RTX 3090 ; séquence par défaut de ~250 images ≈ 20 Go — [GitHub fudan-generative-vision/champ](https://github.com/fudan-generative-vision/champ)
- Wan2.2 (A14B) : les commandes mono-GPU du dépôt officiel indiquent « at least 80GB VRAM » ; le TI2V-5B tourne sur 24 Go (RTX 4090) — [GitHub Wan-Video/Wan2.2](https://github.com/Wan-Video/Wan2.2)
- Wan2.2-Animate dans ComfyUI : poids `Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ` ou bf16, LoRA lightx2v 4 étapes ; segments de 77 images (~4,8 s) par extension ; aucune exigence VRAM ni durée indiquée par la doc — [Docs ComfyUI Wan2.2 Animate](https://docs.comfy.org/tutorials/video/wan/wan2-2-animate) ; poids int8 « convrot » disponibles — [HF Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged)
- Wan-Animate-2 : réglages par défaut prévus pour **8× A800** en 720p ; 480p testé sur **2× A800** ; version distillée : 10 étapes sans CFG — [GitHub Wan-Video/Wan-Animate-2](https://github.com/Wan-Video/Wan-Animate-2)
- Wan-Animate-2 dans ComfyUI : nœud `WanAnimate2Cache` « Roughly halves generation time » au prix de ~12,5 Go de RAM système en 480×832 / 81 images bf16 (int8/int4 possibles) — [ComfyUI nodes_wan.py](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy_extras/nodes_wan.py)

**CPU** : seules des parties s'exécutent sur CPU (décodeur VAE de MimicMotion et StableAnimator, CLIP/VAE d'UniAnimate) — [GitHub Tencent/MimicMotion](https://github.com/Tencent/MimicMotion) ; [GitHub Francis-Rings/StableAnimator](https://github.com/Francis-Rings/StableAnimator) ; [GitHub ali-vilab/UniAnimate](https://github.com/ali-vilab/UniAnimate)

**Maintenance (dernier commit, branche par défaut, lu le 16/10/2026)**
- X-Dyna : 29/01/2025 (8 commits) — [GitHub bytedance/X-Dyna](https://github.com/bytedance/X-Dyna)
- AnimateAnyone (HumanAIGC) : 20/09/2025 (README seul) — [GitHub HumanAIGC/AnimateAnyone](https://github.com/HumanAIGC/AnimateAnyone)
- Moore-AnimateAnyone : 29/05/2024 — [GitHub MooreThreads/Moore-AnimateAnyone](https://github.com/MooreThreads/Moore-AnimateAnyone)
- MimicMotion : 18/11/2025 (compatibilité torch ancien) — [GitHub Tencent/MimicMotion](https://github.com/Tencent/MimicMotion)
- MusePose : 05/03/2025 (code d'entraînement) — [GitHub TMElyralab/MusePose](https://github.com/TMElyralab/MusePose)
- MagicAnimate : 29/08/2025 (fichier gradio), dernière actualité du README 04/12/2023 — [GitHub magic-research/magic-animate](https://github.com/magic-research/magic-animate)
- UniAnimate : 15/04/2025 ; UniAnimate-DiT : 27/04/2025 — [GitHub ali-vilab/UniAnimate](https://github.com/ali-vilab/UniAnimate) ; [GitHub ali-vilab/UniAnimate-DiT](https://github.com/ali-vilab/UniAnimate-DiT)
- StableAnimator : 21/09/2025 (README), dernière fonction publiée 10/03/2025 — [GitHub Francis-Rings/StableAnimator](https://github.com/Francis-Rings/StableAnimator)
- Champ : 09/07/2024 — [GitHub fudan-generative-vision/champ](https://github.com/fudan-generative-vision/champ)
- Wan2.2 : 21/09/2026 ; intégration Diffusers de Wan2.2-Animate le 13/11/2025 — [GitHub Wan-Video/Wan2.2](https://github.com/Wan-Video/Wan2.2)
- Wan-Animate-2 : 08/08/2026 — [GitHub Wan-Video/Wan-Animate-2](https://github.com/Wan-Video/Wan-Animate-2)
- Autre modèle Wan apparenté publié en 2026 : `Wan-AI/Wan-Dancer-14B` (carte `apache-2.0`, 17/07/2026) — [HF Wan-AI/Wan-Dancer-14B](https://huggingface.co/Wan-AI/Wan-Dancer-14B)

### Inferences
- Ordre de grandeur pour ~1 000 clips de 2–4 s : avec UniAnimate-DiT à ~3 min / 5 s en 480p sur A800, il faudrait de l'ordre de 50 h-GPU de classe A800 ; Wan2.2-Animate 14B en fp8 + LoRA 4 étapes sur carte 24 Go est vraisemblablement du même ordre (quelques minutes par clip), à mesurer chez nous.
- Le CPU seul n'est pas une voie de production : aucun éditeur ne le documente pour le débruitage, et les modèles 14B ne tiennent même pas sur une carte 24 Go sans déchargement.
- La vidéo pilote d'un TikTok (plans de 2–4 s) tient dans un seul segment Wan (77–81 images à 16–24 i/s), ce qui évite les raccords entre segments.

### Gaps
- Pas de chiffre officiel VRAM/temps pour Wan2.2-Animate ni pour Wan-Animate-2 sur GPU grand public (RTX 3090/4090/5090) ; la recherche web n'a renvoyé que des chiffres tiers (Patreon, blogs) non spécifiques à Animate et non vérifiés, donc non retenus.
- Pas de mesure publique de la variante Wan-Animate-2-Lite (poids Lite non listés dans les notes de version du 07/08/2026).

---

## 5. Prise en charge ComfyUI (nœuds natifs du cœur ou dépôts de nœuds personnalisés)

### Takeaway
**Natif dans le cœur ComfyUI** : `WanAnimateToVideo` (Wan2.2-Animate, depuis le 19/09/2025) et `WanAnimate2ToVideo` + `WanAnimate2Cache` (Wan-Animate-2, depuis le 06/08/2026), tous marqués « experimental ». Les autres modèles n'ont que des enveloppes communautaires, presque toutes à l'arrêt depuis 2024–2025.

### Cited Findings
- `WanAnimateToVideo` : catégorie `model/conditioning/wan/animate`, `is_experimental=True`, largeur/hauteur multiples de 16, longueur par défaut 77 — [ComfyUI nodes_wan.py](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy_extras/nodes_wan.py) ; ajouté par le commit « Basic WIP support for the wan animate model. (#9939) » du 19/09/2025 (historique git de `comfy_extras/nodes_wan.py`) — [GitHub comfyanonymous/ComfyUI](https://github.com/comfyanonymous/ComfyUI)
- `WanAnimate2ToVideo` et `WanAnimate2Cache` : commit « feat: Support Wan-Animate2 (CORE-358) (#15362) » du 06/08/2026 ; modèle `WAN_Animate2` (« Wan2.1-I2V-14B weights, driven by a video instead of a motion extractor ») — [Commit ComfyUI a464ac33](https://github.com/comfyanonymous/ComfyUI/commit/a464ac33) ; [ComfyUI nodes_wan.py](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy_extras/nodes_wan.py)
- Flux officiel Wan2.2 Animate : nœuds personnalisés requis ComfyUI-KJNodes (Points Editor) et comfyui_controlnet_aux (DWPose Estimator) ; modes Mix (remplacement) et Move (animation) — [Docs ComfyUI Wan2.2 Animate](https://docs.comfy.org/tutorials/video/wan/wan2-2-animate) ; KJNodes GPL-3.0, actif (commit 15/10/2026) — [GitHub kijai/ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes) ; comfyui_controlnet_aux Apache-2.0, actif (commit 11/10/2026) — [GitHub Fannovel16/comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux)
- ComfyUI-WanVideoWrapper (kijai) : Apache-2.0 ; prend en charge WanAnimate (correctifs jusqu'au 27/12/2025 et 16/02/2026) et UniAnimate-DiT (« Support UniAnimate-DiT », 18/04/2025) ; dernier commit 24/05/2026 ; aucune mention de Wan-Animate-2 trouvée dans le code au 16/10/2026 — [GitHub kijai/ComfyUI-WanVideoWrapper](https://github.com/kijai/ComfyUI-WanVideoWrapper)
- MimicMotion : ComfyUI-MimicMotionWrapper (kijai), Apache-2.0, dernier commit 12/01/2025 — [GitHub kijai/ComfyUI-MimicMotionWrapper](https://github.com/kijai/ComfyUI-MimicMotionWrapper)
- MusePose : Comfyui-MusePose officiel, MIT, dernier commit 08/06/2024 — [GitHub TMElyralab/Comfyui-MusePose](https://github.com/TMElyralab/Comfyui-MusePose)
- Champ : ComfyUI-champWrapper (kijai), Apache-2.0, dernier commit 30/06/2024 — [GitHub kijai/ComfyUI-champWrapper](https://github.com/kijai/ComfyUI-champWrapper)
- Moore-AnimateAnyone : ComfyUI-AnimateAnyone-Evolved (MrForExample), MIT, dernier commit 02/02/2024 — [GitHub MrForExample/ComfyUI-AnimateAnyone-Evolved](https://github.com/MrForExample/ComfyUI-AnimateAnyone-Evolved)
- UniAnimate (v1) + Animate-X : ComfyUI-UniAnimate-W (Isi-dev), **pas de fichier LICENSE**, dernier commit 02/10/2025, testé sur 12 Go de VRAM / 16 Go de RAM (Windows 10) ; ~12 Go pour le nœud UniAnimate — [GitHub Isi-dev/ComfyUI-UniAnimate-W](https://github.com/Isi-dev/ComfyUI-UniAnimate-W)
- StableAnimator : ComfyUI_StableAnimator (HJH-AILab), MIT, dernier commit 24/04/2025 — [GitHub HJH-AILab/ComfyUI_StableAnimator](https://github.com/HJH-AILab/ComfyUI_StableAnimator)
- MagicAnimate : ComfyUI-MagicAnimate (thecooltechguy), **pas de fichier LICENSE**, dernier commit 09/01/2024, ~15 Go de poids auto-téléchargés — [GitHub thecooltechguy/ComfyUI-MagicAnimate](https://github.com/thecooltechguy/ComfyUI-MagicAnimate) ; [comfy.icu, ComfyUI-MagicAnimate](https://comfy.icu/extension/thecooltechguy__ComfyUI-MagicAnimate)
- Hors ComfyUI : diffusers (Apache-2.0) contient `pipeline_wan_animate.py` (Wan2.2-Animate) — [GitHub huggingface/diffusers](https://github.com/huggingface/diffusers) ; le README de Wan-Animate-2 renvoie à `WanAnimate2Pipeline` (PR diffusers #14412, installation depuis la source) — [GitHub Wan-Video/Wan-Animate-2](https://github.com/Wan-Video/Wan-Animate-2)

### Inferences
- Pour intégrer sans dépendre d'une enveloppe abandonnée, les seules options maintenues en 2026 sont les nœuds natifs Wan (cœur ComfyUI) ou diffusers / dépôts officiels Wan ; pour respecter la règle maison MIT/Apache/BSD, préférer diffusers ou le code officiel Wan (Apache-2.0) à ComfyUI (GPL-3.0).

### Gaps
- X-Dyna : aucun nœud ComfyUI trouvé par recherche web le 16/10/2026 (absence non prouvée, seulement non trouvée).
- `WanAnimate2Pipeline` n'a pas été trouvé dans la branche principale de diffusers lors de notre clone superficiel du 16/10/2026 (seul `pipeline_wan_animate.py` est présent) : intégration diffusers de Wan-Animate-2 peut-être pas encore fusionnée — à revérifier.

---

## 6. Démos hébergées gratuites, utilisables anonymement

### Takeaway
Les démos officielles historiques sont **toutes en panne** (MagicAnimate, Moore-AA : RUNTIME_ERROR ; MimicMotion : BUILD_ERROR). La seule démo active trouvée est un Space communautaire **Wan2.2-Animate sur ZeroGPU** (RUNNING), limité à **2 min de GPU par jour** pour un visiteur anonyme : utile pour un essai, inutilisable pour 1 000 vidéos.

### Cited Findings
- `zcxu-eric/magicanimate` : état RUNTIME_ERROR — [HF Space zcxu-eric/magicanimate](https://huggingface.co/spaces/zcxu-eric/magicanimate)
- `xunsong/Moore-AnimateAnyone` : état RUNTIME_ERROR — [HF Space xunsong/Moore-AnimateAnyone](https://huggingface.co/spaces/xunsong/Moore-AnimateAnyone)
- `fffiloni/MimicMotion` : état BUILD_ERROR — [HF Space fffiloni/MimicMotion](https://huggingface.co/spaces/fffiloni/MimicMotion)
- MusePose : Space officiel resté « coming soon » dans le README — [GitHub TMElyralab/MusePose](https://github.com/TMElyralab/MusePose) ; Space communautaire `jhj0517/musepose` en RUNTIME_ERROR — [HF Space jhj0517/musepose](https://huggingface.co/spaces/jhj0517/musepose)
- `alexnasa/Wan2.2-Animate-ZEROGPU` : RUNNING sur `zero-a10g`, 360 likes, modifié le 24/08/2026 — [HF Space alexnasa/Wan2.2-Animate-ZEROGPU](https://huggingface.co/spaces/alexnasa/Wan2.2-Animate-ZEROGPU)
- Space communautaire Wan-Animate-2 `brnawy2/Wan_Animate_2_motion_transfer_V2V` : PAUSED — [HF Space brnawy2/Wan_Animate_2_motion_transfer_V2V](https://huggingface.co/spaces/brnawy2/Wan_Animate_2_motion_transfer_V2V)
- Démo officielle annoncée par Wan-Animate-2 : « ModelScope Studio » `Wan-AI/Wan2.2-Animate` — [GitHub Wan-Video/Wan-Animate-2](https://github.com/Wan-Video/Wan-Animate-2)
- Quotas ZeroGPU (doc HF) : non authentifié 2 min/jour (priorité basse) ; compte gratuit 5 min ; PRO 40 min ; remise à zéro 24 h après le premier usage ; au-delà, crédits payants à 1 $ / 10 min (PRO) — [Docs HF ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu)

### Inferences
- Les démos ne peuvent servir qu'à un test de faisabilité (une ou deux planches). La production de ~1 000 clips sans abonnement passe par une exécution locale ou sur GPU gratuit à quota (Colab/Kaggle, hors périmètre de cette note).

### Gaps
- Accès anonyme à la démo ModelScope Studio Wan2.2-Animate non vérifié (compte ModelScope/Alibaba probablement requis, non confirmé).
- Aucune démo hébergée trouvée pour X-Dyna, StableAnimator, Champ, UniAnimate-DiT.

---

## 7. Verdict pour notre cas d'usage (stills Pixar-like, 2–3 personnages africains, plans de 2–4 s, ~1 000 vidéos, 0 abonnement)

### Takeaway
**Retenir Wan2.2-Animate (mode animation) comme moteur principal et Wan-Animate-2 comme candidat n°1 à tester** : licences Apache-2.0 de bout en bout, décor de l'image conservé (Wan2.2-Animate), visage + corps + mains, meilleurs scores publiés, nœuds ComfyUI natifs et diffusers. **Écarter** MimicMotion, MusePose, UniAnimate, StableAnimator et Champ (licences non commerciales ou sous-modèles non commerciaux) ; **garder en réserve** UniAnimate-DiT (affinage LoRA possible, licence du code à clarifier) ; X-Dyna, Moore-AA et MagicAnimate sont dépassés et dépendent de SD 1.5 (OpenRAIL-M).

### Cited Findings
- Wan2.2-Animate conserve le décor de l'image source en mode animation et reproduit expressions et mouvements — [arXiv 2509.14055 (HTML)](https://arxiv.org/html/2509.14055)
- Wan2.2-Animate obtient les meilleurs SSIM/LPIPS/FVD face à Moore-AA, Champ, MimicMotion, UniAnimate, StableAnimator — [arXiv 2509.14055 (HTML)](https://arxiv.org/html/2509.14055)
- Wan2.2-Animate et Wan-Animate-2 : code et poids Apache-2.0 — [GitHub Wan-Video/Wan2.2](https://github.com/Wan-Video/Wan2.2) ; [GitHub Wan-Video/Wan-Animate-2](https://github.com/Wan-Video/Wan-Animate-2) ; [HF Wan-AI/Wan2.2-Animate-14B](https://huggingface.co/Wan-AI/Wan2.2-Animate-14B) ; [HF Wan-AI/Wan2.2-Animate-2-14B](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B)
- Wan2.2-Animate n'est pas conçu pour plusieurs personnes (masque mono-personne, données mono-personnage) — [Wan2.2 UserGuider](https://github.com/Wan-Video/Wan2.2/blob/main/wan/modules/animate/preprocess/UserGuider.md) ; [arXiv 2509.14055 (HTML)](https://arxiv.org/html/2509.14055)
- Méthodes à alignement de pose SD = perte d'identité sur personnages anthropomorphes — [arXiv 2410.10306 (HTML)](https://arxiv.org/html/2410.10306)
- Poids MimicMotion, MusePose, UniAnimate non commerciaux ; InsightFace (StableAnimator) non commercial ; SMPL (Champ) sur inscription — [HF tencent/MimicMotion LICENSE](https://huggingface.co/tencent/MimicMotion/blob/main/LICENSE) ; [HF TMElyralab/MusePose](https://huggingface.co/TMElyralab/MusePose) ; [GitHub ali-vilab/UniAnimate](https://github.com/ali-vilab/UniAnimate) ; [GitHub deepinsight/insightface](https://github.com/deepinsight/insightface) ; [GitHub shubham-goel/4D-Humans](https://github.com/shubham-goel/4D-Humans)

### Inferences
- **Fiche verdict par outil** (déduite) :
  - Wan2.2-Animate : **OUI (principal)** — décor conservé, visage implicite, licences propres si prétraitement DWPose/YOLOX (éviter yolov10m AGPL et FLUX Kontext dev NC) ; multi-personnages par calques ; GPU ≥ 24 Go avec fp8/déchargement.
  - Wan-Animate-2 : **OUI (à tester en priorité)** — plus d'extracteur de pose (mains, hanches, posture assise lues directement dans la vidéo de l'acteur), contrôle de vue par texte, version distillée 10 étapes ; à vérifier : conservation du décor, VRAM sur une seule carte, comportement sur style cartoon.
  - UniAnimate-DiT : **RÉSERVE** — base Wan2.1 Apache + LoRA MIT, affinage avec ~1 000 vidéos possible ; dépôt de code sans LICENSE : demander une licence explicite avant usage.
  - X-Dyna : **NON** — SD 1.5 (OpenRAIL-M), anime aussi le décor, 20–80 Go, plus maintenu depuis janvier 2025, pas de ComfyUI.
  - Moore-AnimateAnyone / MagicAnimate : **NON** — SD 1.5, artefacts de décor, démos mortes, maintenance arrêtée, `image_encoder` de Moore introuvable depuis le 07/10/2026.
  - MimicMotion / MusePose / UniAnimate : **NON** — poids non commerciaux.
  - StableAnimator : **NON** — InsightFace non commercial (malgré code MIT et poids Apache).
  - Champ : **NON** — SMPL sur inscription non commerciale, chaîne lourde (4D-Humans + detectron2 + Blender), arrêté depuis juillet 2024.
  - AnimateAnyone (officiel) / AnimateAnyone 2 : **NON DISPONIBLES** — aucun code ni poids ; la lignée continue sous forme de Wan-Animate / Wan-Animate-2 (mêmes auteurs HumanAIGC).
- **Plan de greffe proposé** (à mesurer avec `mesure2.py` / `measure.ts` sur nos planches) : (1) découper chaque personnage de la planche avec SAM 2 ; (2) tourner une vidéo pilote par personnage (acteur qui reproduit la pose de départ : assis, mains sur les hanches) ou rendre un mannequin Blender animé par BVH CMU ; (3) animer chaque personnage avec Wan-Animate-2 et Wan2.2-Animate en parallèle (A/B) ; (4) recomposer sur le décor fixe ; (5) mesurer fidélité d'identité, mains, stabilité du décor et vitesse par clip.

### Gaps
- Aucun test public n'établit la qualité de Wan2.2-Animate / Wan-Animate-2 sur des personnages 3D cartoon africains à proportions stylisées : seul un essai sur nos propres planches tranchera.
- Coût GPU réel par clip de 2–4 s sur une carte grand public non documenté par les éditeurs.
