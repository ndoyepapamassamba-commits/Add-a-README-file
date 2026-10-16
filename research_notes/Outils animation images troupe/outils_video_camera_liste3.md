# Huit outils ouverts de génération vidéo / contrôle de caméra pour animer les images de la troupe (liste 3) — veille du 16/10/2026

Périmètre : Pyramid Flow, EasyAnimate, VACE (dont Wan2.1-VACE), I2VGen-XL (VGen), SV3D, Stable Virtual Camera (SEVA), MotionCtrl, CameraCtrl (et CameraCtrl II).
Méthode : fichiers LICENSE lus directement (raw.githubusercontent.com), fiches Hugging Face lues via l'API `huggingface.co/api/models` et `raw/main/README.md`, dates du dernier commit relevées par `git clone --depth 1` le 16/10/2026, état des Spaces lu via `huggingface.co/api/spaces` le 16/10/2026, liste ComfyUI-Manager (`custom-node-list.json`, 6 026 entrées) téléchargée et filtrée le 16/10/2026. Les fiches `stabilityai/sv3d` et `stabilityai/stable-virtual-camera` sont à accès restreint (« gated ») : leur licence a été lue via les métadonnées de l'API et les fichiers LICENSE des dépôts GitHub.
Règle projet rappelée : code ET poids exécutés chez nous en MIT, Apache-2.0 ou BSD seulement, usage commercial permis (objectif : 1 000 films).
Outils couverts par d'autres chercheurs, cités seulement pour comparaison : Wan2.2-S2V, InfiniteTalk, MultiTalk, HuMo, LTX-Video, CogVideoX, SVD, AnimateDiff.

## Q1 — Licence exacte du code et de chaque poids (avec propagation des modèles de base)

### Takeaway
Seuls **VACE sur Wan2.1 (1.3B/14B)**, **EasyAnimate V5.1** (7B/12B, dont Control-Camera) et **Pyramid Flow miniFLUX** passent la règle MIT/Apache sur code + poids. Tout le reste échoue : SV3D et SEVA sont non commerciaux (SEVA étend même l'interdiction aux vidéos produites), I2VGen-XL est marqué « MIT » mais sa fiche dit « RESEARCH/NON-COMMERCIAL USE ONLY », MotionCtrl et CameraCtrl ont un code Apache mais des poids dérivés de SVD / VideoCrafter2 / SD1.5. Attention : chez VACE, le poids VACE-LTX-Video-0.9 et deux annotateurs (Depth-Anything-V2-Large, InsightFace antelopev2) sont non conformes.

### Cited Findings
**Pyramid Flow**
- Code : fichier `LICENSE` = « MIT License, Copyright (c) 2024 Yang Jin » — [GitHub jy0205/Pyramid-Flow LICENSE](https://github.com/jy0205/Pyramid-Flow/blob/main/LICENSE).
- Poids `rain1011/pyramid-flow-miniflux` : `license: apache-2.0` ; la fiche dit que ces checkpoints ont une « FLUX structure trained from scratch » et ont été entraînés « only on open-source datasets » — [HF rain1011/pyramid-flow-miniflux](https://huggingface.co/rain1011/pyramid-flow-miniflux).
- Poids `rain1011/pyramid-flow-sd3` : `license: other`, `license_name: stabilityai-ai-community` ; le `LICENSE.md` est la « STABILITY AI COMMUNITY LICENSE AGREEMENT » (mise à jour du 10/10/2024), gratuite seulement pour les organisations « generating annual revenue of less than US $1,000,000 » — [HF rain1011/pyramid-flow-sd3](https://huggingface.co/rain1011/pyramid-flow-sd3), [LICENSE.md](https://huggingface.co/rain1011/pyramid-flow-sd3/blob/main/LICENSE.md).

**EasyAnimate**
- Code : `LICENSE` = Apache License 2.0 — [GitHub aigc-apps/EasyAnimate LICENSE](https://github.com/aigc-apps/EasyAnimate/blob/main/LICENSE).
- Poids V5.1 (`EasyAnimateV5.1-7b/12b-zh`, `-InP`, `-Control`, `-Control-Camera` et leurs versions `-diffusers`) : tous `license:apache-2.0` dans l'API HF (relevé du 16/10/2026) — [HF alibaba-pai/EasyAnimateV5.1-12b-zh-InP](https://huggingface.co/alibaba-pai/EasyAnimateV5.1-12b-zh-InP), [HF EasyAnimateV5.1-12b-zh-Control-Camera](https://huggingface.co/alibaba-pai/EasyAnimateV5.1-12b-zh-Control-Camera).
- Encodeur de texte embarqué dans V5.1 : `Qwen2VLForConditionalGeneration`, `hidden_size: 3584`, 28 couches — [config text_encoder](https://huggingface.co/alibaba-pai/EasyAnimateV5.1-12b-zh-InP/blob/main/text_encoder/config.json) ; Qwen2-VL-7B-Instruct = `license:apache-2.0` — [HF Qwen/Qwen2-VL-7B-Instruct](https://huggingface.co/Qwen/Qwen2-VL-7B-Instruct).
- Poids V5 (obsolètes) et V4 : `license: other` ; la fiche V5 cite CogVideo et HunYuan DiT dans ses références — [HF alibaba-pai/EasyAnimateV5-12b-zh-InP](https://huggingface.co/alibaba-pai/EasyAnimateV5-12b-zh-InP). V2/V3 : `apache-2.0` déclarée (API HF).

**VACE**
- Code : `LICENSE.txt` = Apache License 2.0 — [GitHub ali-vilab/VACE LICENSE.txt](https://github.com/ali-vilab/VACE/blob/main/LICENSE.txt).
- Poids `Wan-AI/Wan2.1-VACE-1.3B`, `Wan2.1-VACE-14B` (+ `-diffusers`), `ali-vilab/VACE-Wan2.1-1.3B-Preview` : `apache-2.0` — [HF Wan-AI/Wan2.1-VACE-1.3B](https://huggingface.co/Wan-AI/Wan2.1-VACE-1.3B), [HF Wan-AI/Wan2.1-VACE-14B](https://huggingface.co/Wan-AI/Wan2.1-VACE-14B) ; vérification du `LICENSE.txt` 14B déjà faite le 14/10/2026 — [notes « Animer Blender par prompt »](../Animer%20Blender%20par%20prompt/modeles_video_ouverts_pilotes.md).
- **Contradiction** : `ali-vilab/VACE-LTX-Video-0.9` porte l'étiquette `license: apache-2.0` dans l'API, mais le tableau du README (repris dans la fiche) indique **RAIL-M** (licence LTX-Video 0.9) et précise « All models inherit the license of the original model » — [HF ali-vilab/VACE-LTX-Video-0.9](https://huggingface.co/ali-vilab/VACE-LTX-Video-0.9), [GitHub ali-vilab/VACE README](https://github.com/ali-vilab/VACE).
- Annotateurs `ali-vilab/VACE-Annotators` (étiquette apache-2.0) : contiennent `depth/depth_anything_v2_vitl.pth` et `face/models/antelopev2/*.onnx` (InsightFace) — [HF ali-vilab/VACE-Annotators](https://huggingface.co/ali-vilab/VACE-Annotators). Or Depth-Anything-V2-Large = `cc-by-nc-4.0` (la version Small = `apache-2.0`) — [HF Depth-Anything-V2-Large](https://huggingface.co/depth-anything/Depth-Anything-V2-Large), [HF Depth-Anything-V2-Small](https://huggingface.co/depth-anything/Depth-Anything-V2-Small) ; et les modèles pré-entraînés InsightFace sont « for non-commercial research only » — [GitHub deepinsight/insightface README](https://github.com/deepinsight/insightface).

**I2VGen-XL (VGen)**
- Code : aucun fichier LICENSE à la racine du dépôt VGen (arborescence relevée le 16/10/2026 : `.gitignore, README.MD, cog.yaml, configs, …` sans LICENSE) — [GitHub ali-vilab/VGen](https://github.com/ali-vilab/VGen).
- Poids `ali-vilab/i2vgen-xl` : étiquette `license: mit`, **mais** la fiche dit « trained with using WebVid-10M and LAION-400M datasets and is intended for RESEARCH/NON-COMMERCIAL USE ONLY » — [HF ali-vilab/i2vgen-xl](https://huggingface.co/ali-vilab/i2vgen-xl).

**SV3D**
- Poids `stabilityai/sv3d` (accès restreint) : `license: other`, `license_name: sv3d-nc-community` (API HF) — [HF stabilityai/sv3d](https://huggingface.co/stabilityai/sv3d) ; texte = « STABILITY AI NON-COMMERCIAL COMMUNITY LICENSE AGREEMENT, Dated: March 18, 2024 » — [GitHub generative-models model_licenses/LICENSE-SV3D](https://github.com/Stability-AI/generative-models/blob/main/model_licenses/LICENSE-SV3D).
- Code `generative-models` : `LICENSE-CODE` = MIT (Copyright 2023 Stability AI) — [GitHub generative-models LICENSE-CODE](https://github.com/Stability-AI/generative-models/blob/main/LICENSE-CODE).

**Stable Virtual Camera (SEVA)**
- Code : le `LICENSE` du dépôt est la « Stability AI Non-Commercial License Agreement, Last Updated: February 20, 2025 » (le code lui-même n'est pas MIT) — [GitHub Stability-AI/stable-virtual-camera LICENSE](https://github.com/Stability-AI/stable-virtual-camera/blob/main/LICENSE).
- Poids `stabilityai/stable-virtual-camera` (v1.0 `model.safetensors`, v1.1 `modelv1.1.safetensors`) : `license_name: stabilityai-ai-non-commercial` (API HF) — [HF stabilityai/stable-virtual-camera](https://huggingface.co/stabilityai/stable-virtual-camera).
- Sorties : « License for the output? See issue #26. The output follows the same non-commercial license. » — [GitHub SEVA README](https://github.com/Stability-AI/stable-virtual-camera), [issue #26](https://github.com/Stability-AI/stable-virtual-camera/issues/26).

**MotionCtrl**
- Code : Apache License 2.0 — [GitHub TencentARC/MotionCtrl LICENSE](https://github.com/TencentARC/MotionCtrl/blob/main/LICENSE).
- Poids `TencentARC/MotionCtrl` : étiquette `apache-2.0` ; fichiers `motionctrl.pth` (SVD), `motionctrl_svd.ckpt`, `motionctrl_videocrafter2_cmcm.ckpt`, `motionctrl_animatediff_cmcm/omcm.ckpt` ; « It can be deployed on … LVDM/VideoCrafter and AnimateDiff, as well as … SVD » — [HF TencentARC/MotionCtrl](https://huggingface.co/TencentARC/MotionCtrl).
- Bases dont la licence se propage : VideoCrafter (« can only be used for personal/research/non-commercial purposes ») — [GitHub AILab-CVC/VideoCrafter](https://github.com/AILab-CVC/VideoCrafter) ; SVD-xt = « STABILITY AI COMMUNITY LICENSE AGREEMENT, Last Updated: July 5, 2024 » (commercial limité sous 1 M$ de revenu) — [HF SVD-xt LICENSE.md](https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/blob/main/LICENSE.md) ; l'ancienne licence SVD du dépôt Stability était « NON-COMMERCIAL COMMUNITY LICENSE » du 21/11/2023 — [GitHub generative-models LICENSE-SVD](https://github.com/Stability-AI/generative-models/blob/main/model_licenses/LICENSE-SVD).

**CameraCtrl**
- Code : `LICENSE.txt` = Apache License 2.0 — [GitHub hehao13/CameraCtrl LICENSE.txt](https://github.com/hehao13/CameraCtrl/blob/main/LICENSE.txt).
- Poids `hehao13/CameraCtrl` : `license: mit` (fiche vide hormis l'étiquette) — [HF hehao13/CameraCtrl](https://huggingface.co/hehao13/CameraCtrl) ; `hehao13/CameraCtrl_SVD_ckpts` (`CameraCtrl_svd.ckpt`, `CameraCtrl_svdxt.ckpt`) : aucune licence déclarée — [HF hehao13/CameraCtrl_SVD_ckpts](https://huggingface.co/hehao13/CameraCtrl_SVD_ckpts) ; copie élaguée `Kosinkadink/CameraCtrl` : `license: mit` — [HF Kosinkadink/CameraCtrl](https://huggingface.co/Kosinkadink/CameraCtrl).
- Bases : la branche `main` exige « Stable Diffusion V1.5 (SD1.5) » + l'adaptateur et le module de mouvement AnimateDiffV3 ; la branche `svd` repose sur SVD / SVD-xt — [GitHub CameraCtrl README](https://github.com/hehao13/CameraCtrl), [branche svd](https://github.com/hehao13/CameraCtrl/tree/svd).
- CameraCtrl II (arXiv 2503.10592, 13/03/2025) : la page arXiv ne donne que la licence CC BY 4.0 du **papier** ; ni la page arXiv ni la page projet ne donnent de lien vers du code ou des poids — [arXiv 2503.10592](https://arxiv.org/abs/2503.10592), [page projet CameraCtrl II](https://hehao13.github.io/Projects-CameraCtrl-II/).

### Inferences
- Les étiquettes HF ne suffisent pas : trois cas relevés aujourd'hui où l'étiquette est plus permissive que le texte (I2VGen-XL « mit » contre « NON-COMMERCIAL USE ONLY » ; VACE-LTX « apache-2.0 » contre RAIL-M ; MotionCtrl « apache-2.0 » sur des poids dérivés de SVD / VideoCrafter2). **Idée créée** : un « garde licence » automatique dans le moteur, qui (1) lit l'étiquette API, (2) cherche dans la fiche et le LICENSE les motifs `non-commercial|research only|RAIL|Community License|inherit`, (3) remonte la chaîne `base_model`, et bloque le téléchargement en cas de doute. Critère d'acceptation : il doit rejeter ces trois cas et laisser passer Wan2.1-VACE-1.3B, EasyAnimateV5.1-12b-zh-InP et pyramid-flow-miniflux.
- La licence Stability AI Community (SVD, pyramid-flow-sd3) autorise un usage commercial sous 1 M$ de revenu, mais ce n'est ni MIT, ni Apache, ni BSD : elle est hors règle projet.
- Pour VACE, la conformité impose de **remplacer deux annotateurs** : profondeur → passe Z de notre rendu Blender/2.5D ou Depth-Anything-V2-Small (Apache) ; visage → détecteur de visage sous licence permissive à choisir. Les autres annotateurs (DWPose ONNX, SAM2, GroundingDINO, RAM, RAFT, U²-Net) n'ont pas été vérifiés un par un ici.

### Gaps
- Licences individuelles des annotateurs VACE autres que la profondeur et le visage (DWPose/yolox, SAM2.1, GroundingDINO, RAM++, RAFT, U²-Net, scribble « anime_style ») : non vérifiées dans ce passage.
- Texte complet de la licence `sv3d-nc-community` et du `LICENSE` HF de SEVA non lisibles sans compte (accès restreint) ; lus via le dépôt GitHub et les métadonnées API seulement.
- Licence de VACE-LTX-Video-0.9 : RAIL-M d'après le README, alors que les versions LTX plus récentes ont une autre licence (sujet LTX couvert par un autre chercheur).

## Q2 — Entrées → sorties : image + prompt, trajectoire caméra, vidéo de référence ; résolution, images, i/s, durée, 9:16

### Takeaway
Seul **VACE/Wan2.1** déclare officiellement le **vertical 9:16** (480×832 en 1.3B ; 720×1280 et 480×832 en 14B) avec des entrées riches (images de référence, vidéo de contrôle profondeur/pose, masques). EasyAnimate V5.1 combine image de départ, vidéo de contrôle (Canny/Depth/Pose/trajectoire) et **trajectoire caméra au format CameraCtrl** (49 images à 8 i/s ≈ 6 s). Pyramid Flow fait image+prompt → 5 s (384p) ou 10 s (768p) à 24 i/s, mais en paysage seulement dans le code officiel. SV3D et SEVA sont des modèles de vues nouvelles (orbites/trajectoires caméra autour d'un objet ou d'une scène statique), pas d'animation des personnages. Aucun des huit n'accepte d'audio.

### Cited Findings
**Pyramid Flow** — texte→vidéo et image→vidéo (image + prompt) ; « 10-second videos at 768p resolution and 24 FPS » ; checkpoints 384p (jusqu'à 5 s) et 768p (jusqu'à 10 s) ; `temp=16: 5s, temp=31: 10s` — [GitHub Pyramid-Flow README](https://github.com/jy0205/Pyramid-Flow). L'application Gradio fixe `width_high = 1280, height_high = 768, width_low = 640, height_low = 384` et recadre l'image d'entrée (`resize_crop_image`) — [GitHub Pyramid-Flow app.py](https://github.com/jy0205/Pyramid-Flow/blob/main/app.py). Le papier montre l'animation d'image « 120 new frames (about 5 seconds, 768p, 24 fps) » sans mesure I2V chiffrée — [arXiv 2410.05954](https://arxiv.org/abs/2410.05954).

**EasyAnimate V5.1** — T2V, I2V (InP : image de début, et de fin), V2V, contrôle (« Canny, Depth, Pose, MLSD, and trajectory control »), caméra (« inputting camera motion trajectories ») ; « multiple resolutions (512, 768, 1024), trained with 49 frames at 8 frames per second » ; V5 : « up to 1024x1024, 49 frames, 6s, 8fps » — [GitHub EasyAnimate README](https://github.com/aigc-apps/EasyAnimate). Le mode caméra prend un fichier `control_camera_txt` + une image de référence ; le fichier de démo est noté « (from CameraCtrl) » — [GitHub EasyAnimate README, « Camera Control Video »](https://github.com/aigc-apps/EasyAnimate). Tailles documentées dans les tableaux mémoire : 384×672, 576×1008, 768×1344 en 25 ou 49 images — [GitHub EasyAnimate README](https://github.com/aigc-apps/EasyAnimate).

**VACE** — tâches R2V (référence→vidéo), V2V (ex. `--task depth`), MV2V (inpainting par bbox/masque, outpainting, extension) et combinaisons ; tailles « ~81 x 480 x 832 » (1.3B) et « ~81 x 720 x 1280 » (14B) — [GitHub ali-vilab/VACE](https://github.com/ali-vilab/VACE). Tailles acceptées par le code Wan : `'vace-1.3B': ('480*832', '832*480')`, `'vace-14B': ('720*1280', '1280*720', '480*832', '832*480')` — [GitHub Wan2.1 wan/configs/__init__.py](https://github.com/Wan-Video/Wan2.1/blob/main/wan/configs/__init__.py). Exemple officiel multi-références : `--src_ref_images examples/girl.png,examples/snake.png` — [GitHub Wan2.1 README](https://github.com/Wan-Video/Wan2.1).

**I2VGen-XL** — image + prompt ; affinement jusqu'à 1280×720 (papier) ; pipeline diffusers : `height=704`, `width=1280`, `num_frames=16`, `target_fps=16` par défaut ; « This implementation is 1-stage variant » ; « less than 50 steps … leads to bad results » avec DDIM — [Doc diffusers I2VGenXL](https://huggingface.co/docs/diffusers/main/en/api/pipelines/i2vgenxl).

**SV3D** — « trained to generate 21 frames at resolution 576x576, given 1 context frame of the same size, ideally a white-background image with one object » ; SV3D_u = orbite sans conditionnement caméra ; SV3D_p = orbites le long de trajectoires (21 élévations / 21 azimuts) — [GitHub generative-models README](https://github.com/Stability-AI/generative-models).

**SEVA** — une ou plusieurs images + trajectoire caméra (préréglages orbit, spiral, lemniscate, zoom, dolly zoom, move-forward/backward/up/down/left/right ; mode « Advanced » avec viewport 3D) — [SEVA docs/GR_USAGE.md](https://github.com/Stability-AI/stable-virtual-camera/blob/main/docs/GR_USAGE.md) ; « All input and output are square images of size 576×576 » par défaut, avec `--W --H` ou `--L_short 576` pour garder le rapport d'aspect ; jusqu'à « a thousand frames » en mode par blocs — [SEVA docs/CLI_USAGE.md](https://github.com/Stability-AI/stable-virtual-camera/blob/main/docs/CLI_USAGE.md) ; modèles v1.0 et v1.1 de 1,3 G paramètres, « 576P » — [GitHub SEVA README](https://github.com/Stability-AI/stable-virtual-camera).

**MotionCtrl** — poses caméra et/ou trajectoires d'objets ; « can independently control both the camera and object motion » — [HF TencentARC/MotionCtrl](https://huggingface.co/TencentARC/MotionCtrl) ; version SVD : `height=576`, `width=1024`, `fps=10`, `--frames 14`, `--ddim_steps 25` — [MotionCtrl branche svd, motionctrl_run.sh](https://github.com/TencentARC/MotionCtrl/blob/svd/configs/inference/motionctrl_run.sh).

**CameraCtrl** — trajectoire caméra (fichier de poses au format RealEstate10K) + prompt ; config AnimateDiff `adv3_256_384_cameractrl` (256×384) — [GitHub CameraCtrl README](https://github.com/hehao13/CameraCtrl) ; version SVD : `svd_320_576_cameractrl.yaml`, « --num_frames 14 for SVD, 25 for SVD-xt » — [GitHub CameraCtrl branche svd](https://github.com/hehao13/CameraCtrl/tree/svd).

**Audio** — aucune des fiches/README lues ne mentionne d'entrée audio pour ces huit outils (sources ci-dessus).

### Inferences
- VACE 1.3B : 81 images ; à 16 i/s (cadence Wan2.1) cela fait ≈ 5 s par plan ; un film de 60 s ≈ 12 plans enchaînés (calcul, pas mesure).
- EasyAnimate V5.1 : 49 images à 8 i/s ≈ 6 s, donc 10 plans pour 60 s, et une interpolation d'images serait nécessaire pour atteindre 24–25 i/s (calcul).
- Pyramid Flow et EasyAnimate n'annoncent pas le 9:16 ; le code Pyramid Flow recadre toute image vers 1280×768 ou 640×384 : nos images verticales seraient coupées.
- SV3D et SEVA ne peuvent servir qu'à des **mouvements de caméra autour d'une scène figée** ; ils n'animent ni corps ni têtes.

### Gaps
- Pas de confirmation que EasyAnimate V5.1 accepte des tailles verticales (672×384 au lieu de 384×672) sans perte : à tester.
- Durée maximale réelle de SEVA sur une scène à plusieurs personnages : non documentée hors objets/scènes de tests.

## Q3 — Preuves de qualité sur personnages 3D stylisés / scènes à plusieurs personnes ; stabilité des visages ; lip-sync

### Takeaway
Aucune des huit sources n'apporte de preuve contrôlée sur des personnages cartoon 3D à plusieurs autour d'une table. Les rares signaux sont négatifs pour I2VGen-XL (« inadequately on anime images ») et Pyramid Flow (point faible déclaré : « face consistency »). Aucun ne fait de lip-sync : ce rôle reste aux outils audio (InfiniteTalk, MultiTalk, Wan2.2-S2V, HuMo — couverts ailleurs).

### Cited Findings
- I2VGen-XL : « the current model performs inadequately on **anime images** and **images with a black background** due to the lack of relevant training data » — [GitHub ali-vilab/VGen README](https://github.com/ali-vilab/VGen).
- I2VGen-XL, VBench-I2V (VBench++, tableau III) : I2V Subject 96,74 ; I2V Background 95,44 ; Camera Motion 13,32 ; Subject Consistency 96,36 ; Motion Smoothness 98,31 ; **Dynamic Degree 24,96** ; Aesthetic 65,33 ; Imaging 69,85 (comparaison : DynamiCrafter-1024 Dynamic Degree 47,40 ; SVD-XT-1.1 43,17) — [arXiv 2411.13503 VBench++](https://arxiv.org/abs/2411.13503). Un autre papier reprend des valeurs I2V différentes (I2V score 96,98) en disant les tirer du classement officiel — [arXiv 2502.03207 MotionAgent](https://arxiv.org/pdf/2502.03207) (divergence non arbitrée).
- Pyramid Flow, VBench (texte→vidéo) : total 81,72 / qualité 84,74 / sémantique 69,62 contre CogVideoX-5B 81,61 / 82,75 / 77,04 ; limites citées : « The only metric where our model performs poorly is face consistency », « relatively inferior on metrics such as color and appearance style » ; pas d'évaluation I2V chiffrée — [arXiv 2410.05954 v2](https://arxiv.org/html/2410.05954).
- Pyramid Flow : passage de SD3 à miniFLUX « to fix human structure issues » ; « great improvement on human structure and motion stability » — [GitHub Pyramid-Flow README](https://github.com/jy0205/Pyramid-Flow). Issue ouverte #234 « bad result » (15/01/2025) — [GitHub Pyramid-Flow issues](https://github.com/jy0205/Pyramid-Flow/issues).
- VACE : les annotateurs incluent un extracteur `scribble/anime_style` — [HF ali-vilab/VACE-Annotators](https://huggingface.co/ali-vilab/VACE-Annotators) ; exemple officiel Wan multi-références (fille + serpent) — [GitHub Wan2.1 README](https://github.com/Wan-Video/Wan2.1). Notre veille du 14/10/2026 n'a trouvé « aucun benchmark contrôlé de VACE / Fun / Animate sur personnages 2D/2.5D style Pixar » — [notes internes](../Animer%20Blender%20par%20prompt/modeles_video_ouverts_pilotes.md).
- Recherche ciblée « VACE cartoon multi-personnages » : seulement des pages promotionnelles ; une revue de Wan-Animate signale que les scènes à plusieurs personnages exigent une vérification stricte car le « identity bleed » (mélange d'identités) peut ruiner une scène — [nemovideo, revue Wan-Animate-2](https://www.nemovideo.com/blog/ai-video-models/wan-animate-2-character-review) (source secondaire, non mesurée).
- SV3D : conçu pour « a white-background image with one object » — [GitHub generative-models](https://github.com/Stability-AI/generative-models). SEVA v1.1 corrige « foreground objects sometimes being detached from the background in v1.0 » — [GitHub SEVA README](https://github.com/Stability-AI/stable-virtual-camera).
- CameraCtrl : entraîné et démontré sur RealEstate10K (trajectoires de visites immobilières), avec une LoRA image RealEstate10K optionnelle — [GitHub CameraCtrl README](https://github.com/hehao13/CameraCtrl).
- EasyAnimate : seules des LoRA/checkpoints « portrait » pour l'ancienne V2 (PixArt) sont listés ; aucune démo cartoon trouvée dans le README — [GitHub EasyAnimate README](https://github.com/aigc-apps/EasyAnimate).

### Inferences
- Pour des visages de personnages stylisés qui doivent rester identiques pendant 60 s, les deux modèles « image→vidéo pure » (Pyramid Flow, I2VGen-XL) sont les plus risqués d'après leurs propres limites déclarées.
- VACE est le seul des huit à prendre plusieurs images de référence ET une vidéo de contrôle : c'est le meilleur levier pour verrouiller identité + mise en place des personnages autour de la table (profondeur rendue + pose exportée du rig), à condition de le prouver par nos mesures (`mesure2.py`, `measure.ts`).
- Lip-sync : brancher un outil audio séparé en aval ou en amont (comparaison seulement, voir les notes « animation par la voix »).

### Gaps
- Aucun score VBench-I2V trouvé pour Pyramid Flow, EasyAnimate ou VACE : le CSV I2V du classement (`Vchitect/vbench_leaderboard_submission/i2v_results.csv`) est en accès protégé (HTTP 401 le 16/10/2026).
- Aucun test public multi-personnages cartoon pour l'un des huit outils : banc à faire sur nos propres images de troupe.

## Q4 — Matériel : VRAM, temps par clip sur un GPU nommé, Kaggle T4 / P100

### Takeaway
Chiffres officiels disponibles : Pyramid Flow 768p 5 s = 5,5 min sur 1 A100 (moins de 12 Go ou de 8 Go de VRAM avec déchargement CPU) ; EasyAnimate V5.1-12B 384×672×49 ≈ 240 s sur A10 24 Go ; SEVA 80 images 768×576 ≈ 35 s + 204 s sur H100 ; Wan2.1 1.3B (base de VACE-1.3B) 8,19 Go / 261 s sur RTX 4090. **Aucune mesure publiée sur T4 ou P100** pour ces outils ; Pyramid Flow (bf16 obligatoire) et EasyAnimate (passer en fp16) ont des obstacles connus sur les GPU sans bf16.

### Cited Findings
- Pyramid Flow : « taking only 2.5 minutes to generate a 5s, 768p, 24fps video on 4 A100 GPUs (vs. 5.5 minutes on a single A100 GPU) » ; `cpu_offloading=True` → « less than 12GB » ; `enable_sequential_cpu_offload()` → « less than 8GB » ; Mac M2 24 Go possible via MPS ; `model_dtype = 'bf16' … (not support fp16 yet)` — [GitHub Pyramid-Flow README](https://github.com/jy0205/Pyramid-Flow). Papier : « 56 seconds to create a 5-second, 384p video clip » (matériel non précisé) ; entraînement 20,7 k heures A100 — [arXiv 2410.05954](https://arxiv.org/html/2410.05954). Issues ouvertes #246 « What are the requirements for GPU？OOM！ » et #244 « Input type (float) and bias type (c10::BFloat16) should be the same » en image→vidéo — [GitHub Pyramid-Flow issues](https://github.com/jy0205/Pyramid-Flow/issues).
- EasyAnimate V5.1-12B, 25 étapes : A10 24 Go ≈ 120 s (384×672×25), ≈ 240 s (384×672×49), ≈ 320 s (576×1008×25), ≈ 750 s (576×1008×49) ; A100 80 Go ≈ 45 s / 90 s / 120 s / 300 s, 768×1344×49 ≈ 710 s ; sur 16 Go : 12B en 384×672×25 avec `model_cpu_offload_and_qfloat8`, le reste jusqu'à 576×1008×49 en `sequential_cpu_offload` ; 7B en 384×672×49 avec qfloat8 sur 16 Go ; « GPUs that do not support torch.bfloat16, such as 2080ti and V100, require changing the weight_dtype … to torch.float16 » ; poids 30 Go (7B) / 39 Go (12B) ; « about 60GB available on disk » — [GitHub EasyAnimate README](https://github.com/aigc-apps/EasyAnimate).
- VACE / Wan2.1 1.3B : T2V-1.3B 480p sur RTX 4090 = 261,4 s et 8,19 Go (tableau officiel repris sur la fiche VACE-1.3B ; le surcoût des blocs VACE n'est pas chiffré) — [HF Wan-AI/Wan2.1-VACE-1.3B](https://huggingface.co/Wan-AI/Wan2.1-VACE-1.3B), relevé dans [notes internes du 14/10/2026](../Animer%20Blender%20par%20prompt/modeles_video_ouverts_pilotes.md). VACE-14B 720p : exemple officiel sur 8 GPU (`torchrun --nproc_per_node=8`) — [GitHub ali-vilab/VACE](https://github.com/ali-vilab/VACE).
- SEVA : mode Basic (80 images, 768×576) = 35 s (1re passe) + 204 s (2e passe) sur H100 sans compilation, 21 s + 144 s avec `torch.compile` ; sur le Space (L40S) 68 s + 484 s ; mode Advanced (134 images, 576×576) = 20 s + 313 s sur H100 — [SEVA docs/GR_USAGE.md](https://github.com/Stability-AI/stable-virtual-camera/blob/main/docs/GR_USAGE.md) ; Windows natif non pris en charge (« flash attention isn't supported on native Windows ») — [GitHub SEVA README](https://github.com/Stability-AI/stable-virtual-camera).
- SV3D : entraîné sur 4 nœuds de 8 A100 80 Go pendant ~6 jours (entraînement, pas inférence) ; pour faible VRAM : `--encoding_t=1 --decoding_t=1` ou `--img_size=512`, sans chiffre — [GitHub generative-models](https://github.com/Stability-AI/generative-models), [recherche web SV3D](https://arxiv.org/pdf/2403.12008).
- I2VGen-XL : la doc diffusers renvoie à la section « Reduce memory usage » de SVD et charge en fp16 avec `enable_model_cpu_offload()`, sans chiffre de VRAM — [Doc diffusers I2VGenXL](https://huggingface.co/docs/diffusers/main/en/api/pipelines/i2vgenxl).
- MotionCtrl, CameraCtrl : aucun chiffre de VRAM ni de temps d'inférence dans les README/fiches lus ; l'inférence CameraCtrl-SVD documentée est lancée avec `torch.distributed.launch --nproc_per_node=8` — [GitHub CameraCtrl branche svd](https://github.com/hehao13/CameraCtrl/tree/svd), [MotionCtrl branche svd README](https://github.com/TencentARC/MotionCtrl/tree/svd).
- Recherche dédiée « Pyramid Flow T4 Kaggle Colab » : aucun banc T4 trouvé ; le README propose un démarrage Colab sans préciser le GPU — [GitHub Pyramid-Flow README](https://github.com/jy0205/Pyramid-Flow).

### Inferences
- Estimations calculées (non mesurées) pour un film de 60 s : Pyramid Flow 768p ≈ 12 plans × 5,5 min ≈ 66 min sur 1 A100 ; EasyAnimate 12B 384×672×49 ≈ 10 plans × 240 s ≈ 40 min sur A10 ; VACE-1.3B ≈ 12 plans × ≥ 4,4 min ≈ ≥ 52 min sur 4090 (borne basse). Pour 1 000 films, aucune de ces voies brutes ne tient l'objectif « un film d'une minute en minutes » sans distillation (LoRA 4 étapes de type LightX2V pour Wan, couverte ailleurs) ni parallélisme.
- T4 (Turing) et P100 (Pascal) n'ont pas de bf16 natif : Pyramid Flow (« not support fp16 yet ») risque de ne pas tourner ou de tourner très lentement ; EasyAnimate demande la bascule fp16 comme pour V100/2080 Ti ; SEVA dépend de noyaux d'attention rapides (FlashAttention n'existe pas pour Turing/Pascal). À confirmer par un banc Kaggle.
- VACE-1.3B (8,19 Go mesurés pour la base sur 4090) est le seul des huit dont l'empreinte publiée tient dans les 16 Go d'une T4 sans déchargement agressif.

### Gaps
- Aucune mesure publiée (temps, VRAM) sur T4 ou P100 pour les huit outils.
- Aucune mesure VRAM/temps publiée pour SV3D, I2VGen-XL, MotionCtrl, CameraCtrl, SEVA (VRAM).
- Surcoût des blocs VACE par rapport à Wan2.1 T2V-1.3B non chiffré.

## Q5 — Intégration ComfyUI : nœuds natifs ou paquets de nœuds (nom, licence, dernier commit)

### Takeaway
Nœuds **natifs** dans ComfyUI : `WanVaceToVideo` (VACE), `SV3D_Conditioning` (SV3D) et `WanCameraEmbedding`, dont le code de plongement Plücker est **copié de CameraCtrl**. Le reste passe par des paquets externes : kijai/ComfyUI-WanVideoWrapper (Apache-2.0, actif en 2026) pour VACE ; nœuds ComfyUI fournis dans le dépôt EasyAnimate ; kijai/ComfyUI-PyramidFlowWrapper (MIT, figé en 11/2024) ; AnimateDiff-Evolved (Apache-2.0, actif) pour CameraCtrl. Les paquets MotionCtrl, I2VGen-XL et CameraCtrl de « chaojie » sont figés depuis 2024 ; le wrapper SEVA est sous licence non commerciale.

### Cited Findings
- ComfyUI cœur (dernier commit relevé 16/10/2026, licence GPL-3.0) : `class WanVaceToVideo` et `class WanCameraImageToVideo` dans `comfy_extras/nodes_wan.py` ; `class SV3D_Conditioning` dans `comfy_extras/nodes_stable3d.py` ; `class WanCameraEmbedding` dans `comfy_extras/nodes_camera_trajectory.py`, dont les fonctions portent « Copied from https://github.com/hehao13/CameraCtrl/blob/main/inference.py » et calculent un `plucker_embedding` — [ComfyUI nodes_wan.py](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy_extras/nodes_wan.py), [nodes_stable3d.py](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy_extras/nodes_stable3d.py), [nodes_camera_trajectory.py](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy_extras/nodes_camera_trajectory.py).
- Liste ComfyUI-Manager (6 026 entrées, filtrée le 16/10/2026) — [Comfy-Org/ComfyUI-Manager custom-node-list.json](https://github.com/Comfy-Org/ComfyUI-Manager/blob/main/custom-node-list.json) ; licences et derniers commits relevés par clone :
  - Pyramid Flow : kijai/ComfyUI-PyramidFlowWrapper — MIT — 15/11/2024 — [GitHub](https://github.com/kijai/ComfyUI-PyramidFlowWrapper) ; AIFSH/PyramidFlow-ComfyUI — MIT — 10/10/2024 — [GitHub](https://github.com/AIFSH/PyramidFlow-ComfyUI).
  - EasyAnimate : « Video Generation Nodes for EasyAnimate » = dossier `comfyui/` du dépôt officiel (Apache-2.0, dernier commit 06/03/2025) — [GitHub EasyAnimate comfyui](https://github.com/aigc-apps/EasyAnimate/tree/main/comfyui) ; chaojie/ComfyUI-EasyAnimate — Apache-2.0 — 18/05/2024 — [GitHub](https://github.com/chaojie/ComfyUI-EasyAnimate).
  - VACE : natif + kijai/ComfyUI-WanVideoWrapper — Apache-2.0 — 24/05/2026 (README cite VACE, ReCamMaster, Uni3C) — [GitHub](https://github.com/kijai/ComfyUI-WanVideoWrapper) ; drozbay/ComfyUI-WanVaceAdvanced — **GPL-3.0** — 01/10/2026 — [GitHub](https://github.com/drozbay/ComfyUI-WanVaceAdvanced) ; nombreux utilitaires VACE (préprocesseurs, raccord de clips, boucles infinies) dans la liste.
  - I2VGen-XL : chaojie/ComfyUI-I2VGEN-XL — **pas de fichier LICENSE** — 19/01/2024 — [GitHub](https://github.com/chaojie/ComfyUI-I2VGEN-XL).
  - SV3D : natif (`SV3D_Conditioning`).
  - SEVA : Pablerdo/ComfyUI-StableVirtualCameraWrapper — fichier LICENSE = « Stability AI Non-Commercial License Agreement » — 19/04/2025 — [GitHub](https://github.com/Pablerdo/ComfyUI-StableVirtualCameraWrapper).
  - MotionCtrl : chaojie/ComfyUI-MotionCtrl — Apache-2.0 — 08/01/2024 — [GitHub](https://github.com/chaojie/ComfyUI-MotionCtrl) ; chaojie/ComfyUI-MotionCtrl-SVD — pas de LICENSE — 16/01/2024 — [GitHub](https://github.com/chaojie/ComfyUI-MotionCtrl-SVD).
  - CameraCtrl : Kosinkadink/ComfyUI-AnimateDiff-Evolved — Apache-2.0 — 28/07/2026 — « CameraCtrl support, with the pruned model … Requires AnimateDiff SD1.5 models » — [GitHub](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved) ; chaojie/ComfyUI-CameraCtrl-Wrapper — Apache-2.0 — 19/04/2024 — [GitHub](https://github.com/chaojie/ComfyUI-CameraCtrl-Wrapper).

### Inferences
- Pour un moteur piloté en Python (sans dépendre de la GPL de ComfyUI dans notre code), VACE s'utilise aussi via diffusers (`Wan-AI/Wan2.1-VACE-1.3B-diffusers`, Apache) ou le script officiel `vace_wan_inference.py` ; ComfyUI reste un poste de réglage.
- **Idée créée (combinaison)** : la méthode CameraCtrl (plongement Plücker d'une trajectoire caméra) est déjà dans ComfyUI natif pour les modèles Wan Fun Camera (Apache, couverts ailleurs) et EasyAnimate V5.1 lit des fichiers de trajectoire au format CameraCtrl. On peut donc **exporter la caméra de notre moteur (Blender / parallaxe 2.5D) au format pose RealEstate10K/CameraCtrl** et la donner à un modèle Apache, au lieu d'exécuter CameraCtrl (poids SD1.5/SVD, hors règle). Critère d'acceptation : même fichier de trajectoire → même mouvement mesuré (flux optique moyen, `mesure2.py`) dans notre rendu 2.5D et dans la vidéo générée, écart < seuil fixé avant le test.

### Gaps
- Pas de vérification de licence de chaque utilitaire VACE de la liste (hors WanVideoWrapper et WanVaceAdvanced).
- Compatibilité des nœuds EasyAnimate officiels avec la version ComfyUI du 16/10/2026 non testée (dernier commit 03/2025).

## Q6 — Maintenance : dernier commit, issues bloquantes

### Takeaway
Seul VACE (et ses voies d'intégration Wan) est encore entretenu en 2025-2026 ; Pyramid Flow (12/2024, 70 issues ouvertes), EasyAnimate (03/2025, relayé par VideoX-Fun), VGen (01/2025), MotionCtrl (README 02/2025, code 2024), CameraCtrl (05/2024) et SEVA (06/2025) sont à l'arrêt.

### Cited Findings
- Derniers commits (clones du 16/10/2026) : Pyramid-Flow 22/12/2024 ; EasyAnimate 06/03/2025 (« Readme update ») ; VACE 17/10/2025 (« Update README.md », annonce du VACE-Benchmark) ; VGen 10/01/2025 ; generative-models (SV3D) 16/12/2025 (« Deprecate SD2 ») ; stable-virtual-camera 05/06/2025 ; MotionCtrl `main` 19/02/2025 (README), branche `svd` 19/07/2024 ; CameraCtrl `main` 24/05/2024, branche `svd` 24/05/2024 — [GitHub Pyramid-Flow](https://github.com/jy0205/Pyramid-Flow), [EasyAnimate](https://github.com/aigc-apps/EasyAnimate), [VACE](https://github.com/ali-vilab/VACE), [VGen](https://github.com/ali-vilab/VGen), [generative-models](https://github.com/Stability-AI/generative-models), [stable-virtual-camera](https://github.com/Stability-AI/stable-virtual-camera), [MotionCtrl](https://github.com/TencentARC/MotionCtrl), [CameraCtrl](https://github.com/hehao13/CameraCtrl).
- VACE : accepté à l'ICCV 2025 ; poids Wan2.1-VACE publiés le 14/05/2025 ; 17/10/2025 : mise à jour du VACE-Benchmark — [GitHub ali-vilab/VACE](https://github.com/ali-vilab/VACE).
- Pyramid Flow : 70 issues ouvertes ; les plus récentes (#257 du 08/08/2026, #256 du 19/06/2026) sans réponse visible ; issues bloquantes pour nous : #246 (OOM), #244 (erreur de type bf16 en image→vidéo), #239 (`timm==0.6.12` à mettre à jour), #230 (échec de chargement du MMDiT) — [GitHub Pyramid-Flow issues](https://github.com/jy0205/Pyramid-Flow/issues). Le README impose Python 3.8.10 et PyTorch 2.1.2 — [GitHub Pyramid-Flow README](https://github.com/jy0205/Pyramid-Flow).
- EasyAnimate : V5 et antérieures marquées « (Obsolete) » dans le tableau des modèles ; dernière version V5.1 (21/01/2025) — [GitHub EasyAnimate README](https://github.com/aigc-apps/EasyAnimate). Les modèles Wan2.1/2.2-Fun (même équipe alibaba-pai) vivent dans VideoX-Fun — [GitHub aigc-apps/VideoX-Fun](https://github.com/aigc-apps/VideoX-Fun) (relevé dans [nos notes du 14/10/2026](../Animer%20Blender%20par%20prompt/modeles_video_ouverts_pilotes.md)).
- I2VGen-XL : dernière nouvelle du README en 01/2024 (démo Gradio) — [GitHub ali-vilab/VGen](https://github.com/ali-vilab/VGen).
- CameraCtrl II : aucun dépôt de code trouvé (recherche web et page projet) — [page projet](https://hehao13.github.io/Projects-CameraCtrl-II/), [arXiv 2503.10592](https://arxiv.org/abs/2503.10592).

### Inferences
- Pyramid Flow et EasyAnimate sont « figés » : les intégrer revient à maintenir nous-mêmes un environnement Python ancien (3.8 / torch 2.1 pour Pyramid Flow), ce qui va contre la livraison légère de l'app.
- EasyAnimate V5.1 a été de fait remplacé par la famille Wan-Fun de la même équipe (Apache) : mieux vaut viser ces successeurs (couverts par un autre chercheur) que V5.1.

### Gaps
- Nombre d'issues ouvertes non relevé pour EasyAnimate, VACE, VGen, SEVA, MotionCtrl, CameraCtrl : l'accès HTML/API GitHub a été refusé par le proxy de la session (seuls les clones et WebFetch d'une page ont fonctionné).

## Q7 — Démo gratuite (Space Hugging Face) aujourd'hui

### Takeaway
Le 16/10/2026, seuls fonctionnent sur GPU gratuit (ZeroGPU A10G) les Spaces Pyramid Flow (25 images max) et un Space communautaire VACE « fast » ; les Spaces officiels MotionCtrl (×2), CameraCtrl-SVD, SEVA et I2VGen-XL sont en erreur d'exécution ; le Space EasyAnimate tourne sur CPU de base.

### Cited Findings
États lus via `huggingface.co/api/spaces` le 16/10/2026 :
- Pyramid-Flow/pyramid-flow : RUNNING, matériel `zero-a10g` ; le README précise « this online demo can only generate 25 frames (export at 8FPS or 24FPS) » — [Space Pyramid-Flow](https://huggingface.co/spaces/Pyramid-Flow/pyramid-flow), [GitHub README](https://github.com/jy0205/Pyramid-Flow).
- alibaba-pai/EasyAnimate : RUNNING, matériel `cpu-basic` (dernière modification 22/01/2025) — [Space alibaba-pai/EasyAnimate](https://huggingface.co/spaces/alibaba-pai/EasyAnimate).
- VACE : pas de Space officiel trouvé ; communautaires : linoyts/wan2-1-VACE-fast RUNNING `zero-a10g` ; fffiloni/Wan2.1-VACE-1.3B RUNNING `cpu-basic` ; wavespeed/wan-2-1-vace-14b RUNNING `cpu-basic` — [Space linoyts/wan2-1-VACE-fast](https://huggingface.co/spaces/linoyts/wan2-1-VACE-fast), [Space fffiloni/Wan2.1-VACE-1.3B](https://huggingface.co/spaces/fffiloni/Wan2.1-VACE-1.3B), [Space wavespeed/wan-2-1-vace-14b](https://huggingface.co/spaces/wavespeed/wan-2-1-vace-14b).
- I2VGen-XL : modelscope/I2VGen-XL RUNTIME_ERROR ; mrcuddle/I2VGenXL-Text-Image-To-Video BUILD_ERROR — [Space modelscope/I2VGen-XL](https://huggingface.co/spaces/modelscope/I2VGen-XL).
- SEVA : stabilityai/stable-virtual-camera RUNTIME_ERROR (511 likes) — [Space SEVA](https://huggingface.co/spaces/stabilityai/stable-virtual-camera).
- MotionCtrl : TencentARC/MotionCtrl et TencentARC/MotionCtrl_SVD RUNTIME_ERROR — [Space MotionCtrl](https://huggingface.co/spaces/TencentARC/MotionCtrl), [Space MotionCtrl_SVD](https://huggingface.co/spaces/TencentARC/MotionCtrl_SVD).
- CameraCtrl : hehao13/CameraCtrl-svd RUNTIME_ERROR — [Space CameraCtrl-svd](https://huggingface.co/spaces/hehao13/CameraCtrl-svd).
- SV3D : pas de Space officiel ; seulement des Spaces de particuliers — (recherche API HF « sv3d », 16/10/2026).

### Inferences
- Un Space « RUNNING » sur `cpu-basic` ne génère vraisemblablement pas de vidéo dans un délai utile (ou appelle un service externe) : à ne pas compter comme démo gratuite.
- Aucune de ces démos ne doit recevoir nos images de troupe (règle : images de l'utilisateur seulement dans `workbench/.private/` ou le scratchpad) ; les tests se font en local ou sur notre GPU gratuit.

### Gaps
- État « RUNNING » ≠ génération réussie : aucun Space n'a été exécuté dans ce passage.

## Q8 — Verdict pour notre usage (moteur principal / couche de mouvement de caméra / rejet) et raison décisive

### Takeaway
**VACE (Wan2.1-VACE-1.3B, puis 14B) = candidat moteur principal** parmi ces huit, avec annotateurs remplacés par nos passes de rendu ; **EasyAnimate V5.1 Control-Camera = couche caméra possible mais dépassée** (préférer ses successeurs Wan-Fun-Camera, même format de trajectoire) ; **Pyramid Flow miniFLUX = réserve** (licence OK, mais ni 9:16, ni contrôle, visages faibles, abandonné) ; **rejet** pour I2VGen-XL, SV3D, SEVA, MotionCtrl, CameraCtrl (licences), CameraCtrl II (pas de code).

### Cited Findings
Synthèse des fiches (chaque élément est sourcé dans les sections Q1–Q7) :

| Outil | Code | Poids utilisables | 9:16 | Contrôle | Verdict | Raison décisive |
|---|---|---|---|---|---|---|
| VACE (Wan2.1-VACE) | Apache-2.0 | 1.3B / 14B Apache-2.0 (pas VACE-LTX : RAIL-M) | Oui (480×832 ; 720×1280 en 14B) | Références multiples, profondeur, pose, masques, extension | **Moteur principal (à mesurer)** | Seul des huit à cumuler licence conforme, vertical natif, références + contrôle, nœud ComfyUI natif, entretien 2025 |
| EasyAnimate V5.1 | Apache-2.0 | 7B / 12B Apache-2.0 (encodeur Qwen2-VL-7B Apache) | Non documenté | I2V début/fin, Canny/Depth/Pose/trajectoire, caméra (format CameraCtrl) | **Couche caméra de secours** | Licence conforme et caméra pilotable, mais 8 i/s, pas de 9:16 attesté, figé depuis 03/2025, remplacé par Wan-Fun |
| Pyramid Flow | MIT | miniFLUX Apache-2.0 (sd3 : Stability Community, exclu) | Non (1280×768 / 640×384 codés en dur) | Image + prompt seulement | **Réserve / banc** | Pas de contrôle, faiblesse déclarée « face consistency », bf16 seulement, abandonné 12/2024 |
| I2VGen-XL | Aucun LICENSE | « NON-COMMERCIAL USE ONLY » (malgré l'étiquette MIT) | Non | Image + prompt | **Rejet** | Licence non commerciale ; « inadequately on anime images » |
| SV3D | MIT (generative-models) | sv3d-nc-community (non commercial) | Non (576×576) | Orbite autour d'un objet | **Rejet** | Licence non commerciale ; un seul objet sur fond blanc |
| SEVA | Non commercial | Non commercial, sorties comprises | Possible via `--W/--H` | Trajectoires caméra riches | **Rejet** | Licence non commerciale y compris des vidéos produites |
| MotionCtrl | Apache-2.0 | Dérivés SVD / VideoCrafter2 / AnimateDiff-SD1.5 | Non (1024×576) | Caméra + trajectoires d'objets | **Rejet** | Poids hérités de bases non MIT/Apache ; Spaces en erreur ; figé |
| CameraCtrl (+ II) | Apache-2.0 | MIT déclaré mais sur SD1.5 / SVD ; II : rien de publié | Non (256×384 ; 320×576) | Trajectoire caméra | **Rejet (méthode reprise)** | Bases SD1.5/SVD hors règle ; sa méthode Plücker vit déjà dans ComfyUI natif pour Wan |

### Inferences
- Plan d'intégration proposé (veille → combiner → créer) : (1) **VACE-1.3B 480×832** alimenté par nos propres passes (profondeur Z, squelette du rig, masques par personnage, images de référence de chaque personnage) — plus de dépendance aux annotateurs non commerciaux ; (2) **mouvements de caméra** : trajectoire exportée de notre moteur au format CameraCtrl → modèle caméra Apache (Wan-Fun-Camera via `WanCameraEmbedding`, ou EasyAnimate V5.1 Control-Camera en secours) ; (3) **lip-sync** confié à l'outil audio retenu par l'autre chercheur, puis recomposition des visages ; (4) mesure systématique avec `mesure2.py`, `measure.ts`, `grammaire_plans.py` contre les TikTok de référence.
- Critères d'acceptation proposés pour le banc (à fixer avant le test) : identité des personnages (similarité d'apparence image à image sur les recadrages visage) au moins égale à notre rendu 2.5D actuel ; zéro mélange d'identités entre personnages sur 12 plans ; temps par plan de 5 s mesuré sur T4 Kaggle et sur un GPU loué, consigné avec la carte exacte.
- Greffes en cours (et non « limites ») : la lenteur brute (≥ 52 min/film estimés sur 4090 pour VACE-1.3B) se traite par distillation 4 étapes et parallélisation sur plusieurs GPU gratuits — à mesurer ; l'absence de 9:16 chez Pyramid Flow / EasyAnimate se contourne en générant en 832×480 puis recadrage, au prix d'une perte de résolution, ou en préférant VACE.

### Gaps
- Aucune preuve publique de la qualité de VACE sur des personnages 3D cartoon africains à plusieurs autour d'une table : banc sur nos images indispensable avant de le déclarer « moteur principal ».
- Comparaison chiffrée VACE contre les modèles couverts ailleurs (Wan2.2-S2V, InfiniteTalk, LTX-Video, CogVideoX) non faite ici.
