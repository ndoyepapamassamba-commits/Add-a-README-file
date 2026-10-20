# Contrôle du mouvement, animation par région, parallaxe de profondeur et portraits parlants : Follow-Your-Click, AnyI2V, LeviTor, MotionPro, MotionStone, Through-the-Mask, DepthFlow, HunyuanPortrait, HunyuanCustom, HunyuanVideo-Avatar

Veille du 16/10/2026. Méthode : dépôts GitHub clonés en lecture (README, LICENSE, configs, dernier commit), API Hugging Face (fiches modèles, Spaces et leur état), articles arXiv/CVF, nœuds ComfyUI sondés un par un, et **mesure réelle de DepthFlow sur ce poste** (CPU seul). Script de mesure : `/tmp/claude-0/-home-user-Add-a-README-file/b47568ca-f920-5025-9cd6-5f833e2dbfb0/scratchpad/bench/df_bench.py` (image et profondeur synthétiques, aucune donnée utilisateur).

Cas d'usage visé : images fixes générées style 3D « Pixar », 2 à 3 personnages africains par scène, sketchs dialogués en français d'une minute pour TikTok, plans de 2 à 4 s, personnage qui parle animé naturellement (tête, buste, bras, lèvres), identité et style conservés, décor vivant, ~1000 vidéos, sans abonnement ni coût par génération. Règle maison : code et modèles exécutés chez nous sous MIT, Apache-2.0 ou BSD uniquement.

## 1. Licences : code, poids, modèles de base, territoire, usage commercial des sorties

### Takeaway
Aucun des dix projets ne passe intégralement la règle maison « MIT / Apache-2.0 / BSD » une fois les modèles de base comptés. MotionPro (code et poids Apache-2.0) et LeviTor (poids Apache-2.0) reposent sur SVD (licence communautaire Stability) ; LeviTor exige en plus Depth Anything V2 Large (CC BY-NC 4.0). DepthFlow est en AGPL-3.0. HunyuanPortrait est réservé à la recherche. HunyuanCustom et HunyuanVideo-Avatar relèvent de la licence communautaire Tencent Hunyuan : le Sénégal est dans le territoire autorisé, mais il est interdit de « display » les sorties hors territoire (UE, Royaume-Uni, Corée du Sud), ce qui pose problème pour un public TikTok francophone en France ou en Belgique. Follow-Your-Click et AnyI2V n'ont pas de fichier LICENSE (licence « non précisée »). MotionStone et Through-the-Mask n'ont publié ni code ni poids.

### Cited Findings
**Follow-Your-Click**
- Le dépôt n'a aucun fichier LICENSE à la racine. Seuls les sous-dossiers tiers `mmflow/` et `Inpaint-Anything/` contiennent le leur (sondage de l'arborescence le 16/10/2026). Licence du code : **non précisée**. — [GitHub mayuelala/FollowYourClick](https://github.com/mayuelala/FollowYourClick)
- Le modèle de base est Stable Diffusion 1.5 (`pretrained_model_path: "stable-diffusion-v1-5"` dans la config d'entraînement), avec un module de mouvement de type AnimateDiff. — [configs/training](https://github.com/mayuelala/FollowYourClick/tree/main/configs/training)
- SD 1.5 est sous licence `creativeml-openrail-m`. — [HF stable-diffusion-v1-5](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5)
- Les modules de mouvement AnimateDiff sont en `apache-2.0`. — [HF guoyww/animatediff](https://huggingface.co/guoyww/animatediff)
- Les poids entraînés de Follow-Your-Click ne sont pas publiés. La config d'inférence pointe vers un chemin interne (`/teg_amai_cq5_1/share_1629729/.../checkpoint-24000.ckpt`), et aucun modèle n'existe sur HF sous mayuelala ni sous « followyourclick » (API HF, 16/10/2026). — [configs/prompts](https://github.com/mayuelala/FollowYourClick/tree/main/configs/prompts)
- Les scripts de téléchargement récupèrent des modèles DreamBooth sur CivitAI (ToonYou, RcnzCartoon, Lyriel…), chacun sous sa propre licence. — [download_bashscripts](https://github.com/mayuelala/FollowYourClick/tree/main/download_bashscripts)

**AnyI2V**
- Aucun fichier LICENSE dans `henghuiding/AnyI2V` : licence **non précisée**. — [GitHub henghuiding/AnyI2V](https://github.com/henghuiding/AnyI2V)
- La config d'exemple utilise `v3_sd15_mm.ckpt` (AnimateDiff v3, SD 1.5) et le checkpoint DreamBooth `realisticVisionV60B1_v51VAE.safetensors`. — [config 1_1_animate_RealisticVision.yaml](https://github.com/henghuiding/AnyI2V/blob/main/configs/prompts/1_1_animate_RealisticVision.yaml)

**LeviTor**
- Aucun fichier LICENSE dans le dépôt. Le README déclare : « This repo is governed by the license of Apache 2.0 ». — [GitHub ant-research/LeviTor](https://github.com/ant-research/LeviTor)
- Les poids HF `hlwang06/LeviTor` portent le tag `license:apache-2.0` (créés le 18/12/2024). — [HF hlwang06/LeviTor](https://huggingface.co/hlwang06/LeviTor)
- LeviTor exige `stable-video-diffusion-img2vid-xt`, `sam_vit_h_4b8939.pth` et `depth_anything_v2_vitl.pth`. — [README LeviTor](https://github.com/ant-research/LeviTor)
- SVD-XT relève de la « Stability AI Community License » (mise à jour du 05/07/2024). Elle autorise l'usage commercial gratuit tant que le chiffre d'affaires annuel reste sous 1 M$, avec enregistrement obligatoire. Les sorties appartiennent à l'utilisateur. — [LICENSE.md SVD-XT](https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/blob/main/LICENSE.md)
- Depth Anything V2 Large est en `cc-by-nc-4.0` (non commercial). La version Small est en `apache-2.0`. — [HF DA-V2-Large](https://huggingface.co/depth-anything/Depth-Anything-V2-Large-hf) ; [HF DA-V2-Small](https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf)

**MotionPro**
- Le code est sous Apache-2.0 (fichier LICENSE). — [LICENSE MotionPro](https://github.com/HiDream-ai/MotionPro/blob/main/LICENSE)
- Les poids HF portent `license:apache-2.0`, avec `base_model: stabilityai/stable-video-diffusion-img2vid`. — [HF HiDream-ai/MotionPro](https://huggingface.co/HiDream-ai/MotionPro)
- La base SVD img2vid est sous `stable-video-diffusion-community` (voir LICENSE.md de SVD). — [HF SVD img2vid](https://huggingface.co/stabilityai/stable-video-diffusion-img2vid)

**MotionStone / Through-the-Mask**
- Ni code ni poids trouvés : recherche web, recherche HF « MotionStone » sans résultat, et page projet de TTM limitée à l'article et au benchmark. Licence : **non précisée / sans objet**. — [arXiv MotionStone](https://arxiv.org/abs/2412.05848) ; [Page TTM](https://guyyariv.github.io/TTM/)

**DepthFlow (BrokenSource)**
- Le code est sous **GNU AGPL v3** (`license.txt`, `license = "AGPL-3.0"` dans pyproject, v1.0.1). — [license.txt](https://github.com/BrokenSource/DepthFlow/blob/main/license.txt) ; [pyproject.toml](https://github.com/BrokenSource/DepthFlow/blob/main/pyproject.toml)
- La page licence dit de l'usage commercial « Allowed and encouraged ». Les demandes de parrainage sont de simples suggestions (« Section 7 … allows dropping extra terms »). — [website/license.md](https://github.com/BrokenSource/DepthFlow/blob/main/website/license.md)
- Le moteur de rendu ShaderFlow est aussi en AGPL v3. — [GitHub BrokenSource/ShaderFlow](https://github.com/BrokenSource/ShaderFlow)
- Estimateur par défaut : Depth Anything V2. La doc avertit : « Models other than Small are under CC BY-NC 4.0 ». — [docs/estimators.md](https://github.com/BrokenSource/DepthFlow/blob/main/website/docs/estimators.md)

**HunyuanPortrait**
- Code, paramètres et poids : « only for academic, research and education purposes, and refrain from using it for any commercial or production purposes under any circumstances ». — [LICENSE](https://github.com/Tencent-Hunyuan/HunyuanPortrait/blob/main/LICENSE) ; [LICENSE_MODEL](https://github.com/Tencent-Hunyuan/HunyuanPortrait/blob/main/LICENSE_MODEL)
- Le modèle est affiné à partir de SVD, présenté comme soumis à la « Stable Video Diffusion Non-Commercial Community License ». — [LICENSE_MODEL](https://github.com/Tencent-Hunyuan/HunyuanPortrait/blob/main/LICENSE_MODEL)
- La fiche HF n'a pas de champ licence. — [HF tencent/HunyuanPortrait](https://huggingface.co/tencent/HunyuanPortrait)

**HunyuanCustom et HunyuanVideo-Avatar (licence communautaire Tencent Hunyuan)**
- En-tête de la licence : « THIS LICENSE AGREEMENT DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA ». « Territory » y est défini comme le monde entier moins ces trois zones. Le Sénégal et l'Afrique de l'Ouest sont donc **dans** le territoire. — [LICENSE HunyuanCustom](https://github.com/Tencent-Hunyuan/HunyuanCustom/blob/main/LICENSE) ; [LICENSE HunyuanVideo-Avatar](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar/blob/main/LICENSE)
- Clause 5(c) : « You must not use, reproduce, modify, distribute, or display the Tencent Hunyuan Works, Output or results of the Tencent Hunyuan Works outside the Territory ». — [LICENSE HunyuanVideo-Avatar](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar/blob/main/LICENSE)
- Clause 5(b) : interdiction d'utiliser les sorties pour améliorer un autre modèle d'IA. Clause 6(d) : « Tencent claims no rights in Outputs You generate ». Seuil de 100 M d'utilisateurs actifs mensuels au-delà duquel une licence séparée est requise. — [LICENSE HunyuanVideo-Avatar](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar/blob/main/LICENSE)
- Dates de publication selon les licences : HunyuanCustom 09/05/2025, HunyuanVideo-Avatar 28/05/2025. Le modèle de base HunyuanVideo (03/12/2024) relève de la même licence. — [Notice HunyuanCustom](https://github.com/Tencent-Hunyuan/HunyuanCustom/blob/main/Notice.txt) ; [Notice Avatar](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar/blob/main/Notice.txt) ; [HF tencent/HunyuanVideo](https://huggingface.co/tencent/HunyuanVideo)
- Les dépôts HF de HunyuanCustom et HunyuanVideo-Avatar contiennent `LICENSE` et `Notice.txt`, mais leurs fiches n'ont pas de champ licence. — [HF tencent/HunyuanVideo-Avatar](https://huggingface.co/tencent/HunyuanVideo-Avatar) ; [HF tencent/HunyuanCustom](https://huggingface.co/tencent/HunyuanCustom)

### Inferences
- **Règle maison MIT/Apache/BSD** : aucun outil n'est intégrable tel quel dans le moteur.
  - MotionPro est le plus proche (code et poids Apache-2.0), mais son socle SVD ne l'est pas.
  - Une étiquette Apache-2.0 sur des poids affinés ne peut pas, à notre lecture, lever les conditions de la licence SVD du modèle de base.
- **Risque Tencent pour TikTok** : publier des vidéos HunyuanVideo-Avatar ou HunyuanCustom vues en France, Belgique ou ailleurs dans l'UE peut être lu comme « display … Output … outside the Territory ».
  - C'est un risque juridique réel pour des sketchs en français.
  - Ce point relève d'une lecture de la clause, pas d'un avis juridique.
- **LeviTor** : déclaré « Apache », mais en pratique **non commercial**, puisqu'il exige la profondeur ViT-L sous CC BY-NC 4.0.
- **DepthFlow** : l'AGPL permet l'usage local et commercial, mais interdit de l'embarquer dans notre app sans la passer en AGPL.
  - Conforme à la règle maison : réécrire la méthode (ray-marching sur carte de profondeur) dans notre moteur, ce qui a déjà été amorcé (tâche #112 « profondeur Depth Anything V2 + parallaxe »).

### Gaps
- Licence exacte des checkpoints DreamBooth CivitAI utilisés par Follow-Your-Click et AnyI2V : non vérifiée fiche par fiche.
- Aucun avis juridique sur l'interprétation de « display … outside the Territory » quand une vidéo produite au Sénégal est diffusée mondialement. À trancher avant tout usage de Tencent Hunyuan.

## 2. Ce que fait chaque outil : entrées, sorties, lip-sync audio

### Takeaway
Seul **HunyuanVideo-Avatar** fait vraiment notre travail principal : image, audio et prompt donnent un personnage parlant avec corps et décor animés, y compris en style cartoon ou 3D, à 129 images à 25 i/s (~5,2 s), 704 px. HunyuanCustom ajoute un mode piloté par l'audio. HunyuanPortrait exige une **vidéo de pilotage** et ne sait pas lire l'audio. Les six autres projets sont des outils de **contrôle de mouvement sans audio** : clic, pinceau, trajectoires 2D/3D ou masques. Leurs sorties sont courtes (16 images) et basse résolution (288×512 à 512×512). DepthFlow ne fait que de la parallaxe 2,5D à partir d'une image et de sa profondeur, à n'importe quelle résolution.

### Cited Findings
**Follow-Your-Click** (arXiv 2403.08268, v1 du 13/03/2024)
- Fonctionnement : un clic choisit la région, un « short motion prompt » dit comment elle bouge. Techniques : « first-frame masking », module « motion-augmented », contrôle d'amplitude par flot optique. — [arXiv](https://arxiv.org/abs/2403.08268)
- Galerie sur images générées : « Tune the head », « Smile », « Sad », « Storm », « Flap the wings ». — [README](https://github.com/mayuelala/FollowYourClick)
- Résolution : entraînement en 448×256. Le script d'inférence a pour défauts `--L 16 --W 512 --H 512`. — [config d'entraînement](https://github.com/mayuelala/FollowYourClick/tree/main/configs/training) ; [scripts/inference_w_image_cond.py](https://github.com/mayuelala/FollowYourClick/blob/main/scripts/inference_w_image_cond.py)

**AnyI2V** (ICCV 2025)
- Méthode sans entraînement. Elle anime une **image de condition** (canny, profondeur, maillage, nuage de points…) le long de trajectoires utilisateur, avec prompt texte et LoRA possibles. — [Page projet](https://henghuiding.com/AnyI2V/) ; [ICCV 2025](https://openaccess.thecvf.com/content/ICCV2025/html/Li_AnyI2V_Animating_Any_Conditional_Image_with_Motion_Control_ICCV_2025_paper.html)
- Mise en œuvre : script local `scripts.AnyI2V_fp16`, app Gradio locale (`scripts.app`, port 7860), trajectoires en JSON. — [README](https://github.com/henghuiding/AnyI2V)

**LeviTor** (CVPR 2025 Highlight)
- Entrées : image de départ, objets choisis par SAM, **trajectoires 3D** (profondeur estimée par Depth Anything V2, occlusions).
- Commande fournie : `--num_frames 16 --width 288 --height 512`.
- Bâti sur Framer, DragAnything et SVD-Xtend ; démo Gradio locale publiée le 20/12/2024. — [README LeviTor](https://github.com/ant-research/LeviTor)

**MotionPro** (CVPR 2025)
- Entrées : pinceau (masque de région) et glissés de trajectoires, pour contrôler à la fois l'objet et la caméra. MotionPro-Dense prend un flot dense et des masques de visibilité ; CoTracker sert à resynchroniser. — [README MotionPro](https://github.com/HiDream-ai/MotionPro)
- Sortie : 16 images (`num_frames: 16`), image recadrée en 320×512 ou 512×512. — [configs/inference_all_flow_from_svd.yaml](https://github.com/HiDream-ai/MotionPro/blob/main/configs/inference_all_flow_from_svd.yaml) ; [demo_sparse_flex_wh.py](https://github.com/HiDream-ai/MotionPro/blob/main/demo_sparse_flex_wh.py)

**MotionStone** (CVPR 2025)
- Image-vers-vidéo sur DiT. Un estimateur sépare l'intensité du mouvement des objets et celle de la caméra ; il est appris par contraste sur des paires de vidéos et sert de signal de contrôle. — [arXiv 2412.05848](https://arxiv.org/abs/2412.05848) ; [CVF](https://openaccess.thecvf.com/content/CVPR2025/html/Shi_MotionStone_Decoupled_Motion_Intensity_Modulation_with_Diffusion_Transformer_for_Image-to-Video_CVPR_2025_paper.html)

**Through-the-Mask** (CVPR 2025, Meta GenAI/FAIR + Hebrew University)
- Deux étapes : génération d'une trajectoire de mouvement sous forme de **masques**, puis vidéo conditionnée par ces masques. Pensé pour le multi-objets ; variantes U-Net et DiT. — [arXiv 2501.03059](https://arxiv.org/abs/2501.03059) ; [Page projet](https://guyyariv.github.io/TTM/)

**DepthFlow**
- Image et carte de profondeur (estimée ou fournie) donnent une vidéo de parallaxe 3D par shader GLSL en ray-marching. Résolution et i/s libres, suréchantillonnage, boucles sans couture. — [readme](https://github.com/BrokenSource/DepthFlow)
- Utilisable en CLI ou en bibliothèque Python : `DepthScene(backend="headless")`, `scene.main(output=…, fps, time, width, height, ssaa)`. — [docs/exporting.md](https://github.com/BrokenSource/DepthFlow/blob/main/website/docs/exporting.md)
- La v1.0.0 (15/06/2026) a retiré la WebUI Gradio, le traitement par lots et le système d'animation, désormais remplacés par des scripts d'exemple. — [changelog](https://github.com/BrokenSource/DepthFlow/blob/main/website/changelog.md)

**HunyuanPortrait** (CVPR 2025)
- Image de référence et **vidéo de pilotage** (expressions et pose de tête encodées implicitement) donnent un portrait animé. Lancement : `inference.py --video_path --image_path`, ou serveur Gradio local. — [README](https://github.com/Tencent-Hunyuan/HunyuanPortrait)
- Config : 512×512, `n_sample_frames: 25`, `fps: 12.5`, `num_inference_steps: 25`, `overlap: 3`. — [config](https://github.com/Tencent-Hunyuan/HunyuanPortrait/tree/main/config)
- Le 08/12/2025, ajout de la génération en pleine résolution avec recollage du visage dans l'image d'origine (`paste_back_frame`). — [inference.py](https://github.com/Tencent-Hunyuan/HunyuanPortrait/blob/main/inference.py)
- **Pas d'audio en entrée** (aucune option audio dans le README).

**HunyuanCustom**
- Entrées : texte et une ou plusieurs images de sujet ; audio (« drive the subject to speak ») ; vidéo (remplacement de sujet).
- Inférence et poids audio et vidéo publiés le 06/06/2025, via OmniV2V. — [README](https://github.com/Tencent-Hunyuan/HunyuanCustom)
- Sortie : 720×1280×129 images ou 512×896×129 images. — [README](https://github.com/Tencent-Hunyuan/HunyuanCustom)
- Le « Multi-Subject Video Customization » figure au plan open source **sans aucune case** (ni inférence ni poids publiés). — [README](https://github.com/Tencent-Hunyuan/HunyuanCustom)

**HunyuanVideo-Avatar**
- Entrées : image d'avatar (« photorealistic, cartoon, 3D-rendered, and anthropomorphic », du portrait au corps entier), audio, prompt texte, image de référence d'émotion. — [README](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar)
- Sortie : `--sample-n-frames 129 --image-size 704` ; `fps` à 25 dans `assets/test.csv`. — [README](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar) ; [assets/test.csv](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar/blob/main/assets/test.csv)
- Entraînement entre 704×704 et 704×1216, sur ~500 000 échantillons (~1 250 h). Les vidéos plus longues passent par un « time-aware position shift ». — [arXiv 2505.20156](https://arxiv.org/html/2505.20156v1)
- Multi-personnages dans l'article : un Face-Aware Audio Adapter applique un masque de visage InsightFace dans l'espace latent, si bien que chaque personnage peut recevoir son propre audio. — [arXiv](https://arxiv.org/html/2505.20156v1)
- Le code publié n'utilise pourtant que le plus grand visage : `align_instance(..., maxface=True)` dans `get_facemask`. — [audio_preprocessor.py](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar/blob/main/hymm_sp/data_kits/audio_preprocessor.py)

### Inferences
- **Lip-sync piloté par l'audio** : seuls HunyuanVideo-Avatar et le mode audio de HunyuanCustom le font. HunyuanPortrait demanderait une vidéo de pilotage filmée, par exemple un acteur qui joue la réplique.
- **Durée des sorties** : 129 images à 25 i/s couvrent un plan de 2 à 4 s. Les outils à 16 images, eux, ne donnent que 0,6 à 2 s selon l'i/s choisi.
- **Dialogues** : le code public d'Avatar ne gère qu'un personnage parlant par génération. Un dialogue à deux suppose de générer chaque réplique séparément (un plan par locuteur), ou de bricoler le masque.
- **AnyI2V** part d'une image de condition et non de notre image RGB finie : il ne garantit donc pas la conservation pixel par pixel de nos personnages.

### Gaps
- I/s exact de Follow-Your-Click, LeviTor et MotionPro en sortie : non documenté dans les README lus.
- Résolution et longueur de MotionStone et de TTM : non publiées.

## 3. Qualité sur personnages stylisés, cartoon ou 3D, multi-personnages ; modes d'échec ; benchmarks

### Takeaway
Seul HunyuanVideo-Avatar affiche des métriques solides et revendique les styles cartoon et 3D. Il bat OmniHuman-1 sur la préservation d'identité (IP 4,84) et le lip-sync (LS 4,65) en étude utilisateur, mais reste derrière lui sur le naturel visage et corps. Ses limites déclarées : émotion fixée par une image de référence, pas de changement d'émotion dans un plan, lenteur. Aucun projet ne fournit de mesure chiffrée sur des personnages stylisés ni sur des scènes à 2 ou 3 personnages ; tout est qualitatif.

### Cited Findings
**HunyuanVideo-Avatar**
- Portraits, CelebV-HQ puis HDTF :
  - IQA 3,70 / 3,99 ;
  - Sync-C 4,92 / 5,30 ;
  - FID 43,42 / 38,01 ;
  - FVD 445,02 / 358,71.
- Sonic le dépasse en Sync-C sur les deux jeux, et en FVD sur CelebV-HQ (415,04). — [arXiv 2505.20156](https://arxiv.org/html/2505.20156v1)
- Corps entier (250 vidéos, 200 identités) :
  - IQA 4,66 ;
  - Sync-C 5,56 ;
  - FID 49,38 ;
  - FVD 650,54, Hallo3 faisant mieux sur ce point (629,94).
- Étude utilisateur (30 participants) : FCN 3,91, FBN 3,88, IP 4,84, LS 4,65, contre OmniHuman-1 à 4,11 / 4,18 / 4,79 / 4,61. — [arXiv](https://arxiv.org/html/2505.20156v1)
- Limites déclarées par les auteurs : une émotion par image de référence ; plusieurs émotions dans un même segment audio peuvent produire des erreurs ; pas de changement d'émotion en cours de vidéo ; faiblesses héritées de HunyuanVideo ; pas de temps réel. — [arXiv](https://arxiv.org/html/2505.20156v1)
- Styles : l'annexe (fig. 10) montre LEGO, peinture chinoise, anime et croquis, qualitatif seulement. Les styles 3D ne sont pas chiffrés. — [arXiv](https://arxiv.org/html/2505.20156v1)
- Multi-personnages : la fig. 7b de l'article est qualitative, sans évaluation chiffrée. — [arXiv](https://arxiv.org/html/2505.20156v1)
- Le nœud ComfyUI smthemex propose un « dual role », mais son auteur prévient : « 测试双人代码，不一定有效 » (« code deux personnes en test, pas forcément efficace »). — [ComfyUI_HunyuanAvatar_Sm](https://github.com/smthemex/ComfyUI_HunyuanAvatar_Sm)

**HunyuanCustom**
- Face-Sim 0,627 (meilleur du tableau, devant Hailuo 0,526 et Keling1.6 0,505).
- DINO-Sim 0,593, Temp-Consis 0,958, DD 0,71. — [README](https://github.com/Tencent-Hunyuan/HunyuanCustom)

**HunyuanPortrait**
- Résumé du README : animation « style-flexible » depuis une seule image, présentée comme supérieure en contrôle et cohérence. Aucun chiffre sur le cartoon dans le README. — [README](https://github.com/Tencent-Hunyuan/HunyuanPortrait)

**AnyI2V**
- FVD 569,89 et ObjMC 16,39 sans entraînement, d'après le tableau de comparaison de l'article. — [arXiv 2507.02857](https://arxiv.org/pdf/2507.02857)

**MotionPro**
- MC-Bench : 1 100 paires image-trajectoire annotées, avec scripts d'évaluation (FVD, contrôle du mouvement). — [README MotionPro](https://github.com/HiDream-ai/MotionPro)

**Through-the-Mask**
- Benchmark SA-V-128 (mono et multi-objets). Le résumé revendique l'état de l'art en cohérence temporelle et réalisme du mouvement, surtout en multi-objets, sans chiffres sur la page. — [Page projet](https://guyyariv.github.io/TTM/) ; [SA-V-128](https://huggingface.co/datasets/GuyYariv/SA-V-128-Benchmark)

**Follow-Your-Click**
- Comparé à 7 bases sur 8 métriques et annoncé supérieur, mais l'abstract ne donne aucun chiffre. — [arXiv](https://arxiv.org/abs/2403.08268)

**DepthFlow**
- Revendique des bords « artifact-free » et des boucles sans couture. La doc des estimateurs parle d'« élargir les bords » pour limiter les artefacts de projection. — [readme](https://github.com/BrokenSource/DepthFlow) ; [estimators.md](https://github.com/BrokenSource/DepthFlow/blob/main/website/docs/estimators.md)

### Inferences
- **Modèles SVD et SD 1.5 à 16 images** (LeviTor, MotionPro, Follow-Your-Click, AnyI2V) : en basse résolution, on peut attendre des déformations des visages et des mains de nos personnages 3D, surtout en 9:16.
  - À mesurer avec nos outils (`mesure2.py`, `measure.ts`) avant tout rejet définitif.
  - Ces outils servent surtout aux éléments secondaires : fumée, feuilles, tissu.
- **DepthFlow en parallaxe** déchire les zones de bord : cheveux, bras devant le décor.
  - C'est le mode d'échec typique de la 2,5D ; DepthFlow l'atténue en élargissant les bords.
  - Notre moteur peut faire mieux en séparant d'abord les personnages (calques) et en n'appliquant la parallaxe qu'au décor bouché derrière eux.

### Gaps
- Aucune évaluation publiée sur des personnages africains en style 3D « Pixar », ni sur des scènes à 2 ou 3 personnages, pour aucun des dix projets. Cela doit passer par notre banc de preuve (environnement miroir, tâche #107).
- Modes d'échec de Follow-Your-Click, LeviTor, MotionPro et AnyI2V sur des humains stylisés : non documentés dans les sources lues.

## 4. Matériel, temps par clip, voie CPU, dates et maintenance

### Takeaway
**DepthFlow est le seul outil qui tourne sans GPU.** Mesuré ici sur 4 vCPU Xeon 2,1 GHz avec Mesa llvmpipe, il **n'est pas temps réel sur CPU** : 7,66 i/s en 576×1024 (0,26× le temps réel) et 2,16 i/s en 1080×1920 (0,07×). Le README revendique jusqu'à 8K à 50 i/s sur un GPU de classe RTX 3060 ; ce chiffre n'a pas été mesuré ici. Tous les autres outils exigent un GPU NVIDIA. HunyuanVideo-Avatar demande 24 Go au minimum (« very slow »), 96 Go recommandés, et environ 60 min pour 10 s en 720×1216 d'après l'article. Wan2GP le fait tourner avec 10 Go.

### Cited Findings
**Mesure maison DepthFlow 1.0.1 (16/10/2026, ce conteneur, CPU uniquement)**
- Moteur de rendu : `OpenGL Renderer: llvmpipe (LLVM 20.1.2, 256 bits)` ; CPU Intel Xeon 2,1 GHz, 4 vCPU ; encodage h264 « veryfast ».
- 576×1024, 4 s à 30 i/s (120 images) : rendu et encodage en 15,67 s, soit **7,66 i/s (0,26× le temps réel)**.
- 1080×1920, même clip : 55,52 s, soit **2,16 i/s (0,07×)**.
- Depth Anything V2 Small sur CPU : 11,9 s au premier appel (chargement compris), puis **1,5 s par image** (entrée 576×1024).
- Source : mesure locale avec [DepthFlow](https://github.com/BrokenSource/DepthFlow). Scripts : `/tmp/claude-0/-home-user-Add-a-README-file/b47568ca-f920-5025-9cd6-5f833e2dbfb0/scratchpad/bench/df_bench.py` et `/tmp/claude-0/-home-user-Add-a-README-file/b47568ca-f920-5025-9cd6-5f833e2dbfb0/scratchpad/bench/da2_bench.py`.

**DepthFlow (documentation)**
- « up to 8k50fps rendering with an RTX 3060-class GPU » (affirmation du README). — [readme](https://github.com/BrokenSource/DepthFlow)
- La doc Docker évoque le « slow cpu-only rendering with llvmpipe » et la configuration EGL qui l'évite. — [website/get/docker.md](https://github.com/BrokenSource/DepthFlow/blob/main/website/get/docker.md)
- Versions et activité : v1.0.0 le 15/06/2026, v1.0.1 le 25/08/2026, dernier commit le 10/10/2026 ; projet **maintenu**. — [changelog](https://github.com/BrokenSource/DepthFlow/blob/main/website/changelog.md)

**HunyuanVideo-Avatar**
- Testé sur 8 GPU ; minimum 24 Go pour 704×768×129 images (« very slow ») ; 96 Go recommandés ; options `--use-fp8` et `--cpu-offload`. — [README](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar)
- Wan2GP, depuis le 06/06/2025 : « just 10 GB of VRAM … up to 15s … with no quality degradation », TeaCache inclus. — [CHANGELOG Wan2GP](https://github.com/deepbeepmeep/Wan2GP/blob/main/docs/CHANGELOG.md)
- Article : 10 s en 720×1216 et 50 pas prennent « approximately 60 minutes » (GPU d'inférence non précisé). Entraînement sur 160 GPU de 96 Go. — [arXiv](https://arxiv.org/html/2505.20156v1)
- Service payant fal.ai : environ 8 min de traitement moyen annoncé (ce n'est pas une option gratuite). — [fal.ai hunyuan-avatar](https://fal.ai/models/fal-ai/hunyuan-avatar/playground)
- Poids publiés le 28/05/2025 ; dernier commit le 16/12/2025 (contraintes de versions). — [README](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar)

**HunyuanCustom**
- 80 Go en pointe pour 720×1280×129 images ; 60 Go pour 512×896×129 images ; minimum 24 Go (« very slow ») ; fp8 et cpu-offload disponibles.
- Annonce d'un fonctionnement avec 8 Go via WanGP (13/06/2025) ; dernier commit le 15/10/2025. — [README](https://github.com/Tencent-Hunyuan/HunyuanCustom)

**HunyuanPortrait**
- « An NVIDIA 3090 GPU … tested on a single 24G GPU », Linux ; dernier commit le 08/12/2025. — [README](https://github.com/Tencent-Hunyuan/HunyuanPortrait)

**MotionPro**
- Code publié le 26/03/2025 ; dernier commit le 23/04/2026 (citation) ; entraînement en batch de 8 par A100. VRAM d'inférence non indiquée. — [README](https://github.com/HiDream-ai/MotionPro)

**LeviTor**
- fp16 et xformers ; dernier commit le 15/04/2025 ; démo HF toujours en « TODO ». VRAM non indiquée. — [README](https://github.com/ant-research/LeviTor)

**AnyI2V**
- Implémenté sur AnimateDiff avec une seule Nvidia A800 (selon l'article) ; le supplément mentionne aussi une intégration à LaVie et VideoCrafter2 ; dernier commit le 24/08/2025. — [arXiv 2507.02857](https://arxiv.org/pdf/2507.02857) ; [Supplément ICCV](https://openaccess.thecvf.com/content/ICCV2025/supplemental/Li_AnyI2V_Animating_Any_ICCV_2025_supplemental.pdf) ; [GitHub](https://github.com/henghuiding/AnyI2V)

**Follow-Your-Click**
- Dernier commit le 17/09/2025 (« submit ») ; VRAM non indiquée. — [GitHub](https://github.com/mayuelala/FollowYourClick)

### Inferences
- **Volume visé** : 1000 vidéos d'une minute font 60 000 s de vidéo.
  - **HunyuanVideo-Avatar** au rythme de l'article (~60 min de GPU pour 10 s) : de l'ordre de 6 000 h de GPU. C'est intenable sans abonnement, même en ne traitant que les plans parlants.
  - **DepthFlow sur CPU à 576×1024** : 1,8 M images à 7,66 i/s donnent ~65 h de CPU (4 vCPU) si chaque image passait par la parallaxe. Avec un GPU, ce volume devient négligeable si le chiffre du README se confirme.
- **Maintenance** :
  - actifs en 2026 : DepthFlow et MotionPro ;
  - figés depuis 2025 : HunyuanPortrait, HunyuanCustom, HunyuanVideo-Avatar, LeviTor, AnyI2V et Follow-Your-Click.

### Gaps
- Temps par clip de LeviTor, MotionPro, Follow-Your-Click et AnyI2V sur des GPU nommés : non publiés.
- Chiffres RTX 4090 pour HunyuanVideo-Avatar : uniquement des blogs tiers non attribuables avec certitude ([spheron](https://www.spheron.network/blog/image-to-video-gpu-cloud-ltx-wan-hunyuan/), [gaga.art](https://gaga.art/blog/hunyuanvideo-avatar/)), donc non retenus.
- DepthFlow sur GPU : non mesuré (pas de GPU dans ce conteneur). À mesurer, avec la même commande, sur le GPU gratuit utilisé pour les plans de chute (tâche #115).

## 5. Prise en charge ComfyUI (dépôt du nœud, licence, maintenance)

### Takeaway
Les nœuds ComfyUI n'existent que pour les outils Tencent et DepthFlow. Aucun n'est à la fois maintenu en 2026 et sous licence MIT/Apache/BSD avec un modèle sous-jacent conforme. Aucun nœud n'a été trouvé pour Follow-Your-Click, AnyI2V, LeviTor, MotionPro, MotionStone ou Through-the-Mask.

### Cited Findings
**HunyuanVideo-Avatar**
- smthemex/ComfyUI_HunyuanAvatar_Sm : son LICENSE est la licence Tencent Hunyuan ; dernier commit le 24/06/2025 ; VRAM > 10-12 Go ; « dual role » expérimental. — [GitHub](https://github.com/smthemex/ComfyUI_HunyuanAvatar_Sm)
- Yuan-ManX/ComfyUI-HunyuanVideo-Avatar : enveloppe sous MIT (le modèle reste sous licence Tencent) ; dernier commit le 29/05/2025. — [GitHub](https://github.com/Yuan-ManX/ComfyUI-HunyuanVideo-Avatar)
- Le nœud ComfyUI officiel reste non coché dans le plan open source. — [README Avatar](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar)
- Wan2GP, interface hors ComfyUI : prend en charge Avatar et Custom Audio ; dernier commit le 16/10/2026.
  - Sa « WanGP Community License 2.0 » autorise l'usage gratuit et la vente des sorties.
  - Elle interdit de l'embarquer dans un produit payant sans licence commerciale. — [LICENSE.txt Wan2GP](https://github.com/deepbeepmeep/Wan2GP/blob/main/LICENSE.txt)

**HunyuanCustom**
- Intégré à kijai/ComfyUI-HunyuanVideoWrapper, sujet unique seulement (workflow `hyvideo_custom_testing_01.json`).
- Ce dépôt n'a **aucun fichier LICENSE**, alors que son pyproject y renvoie : licence **non précisée**. Dernier commit le 20/08/2025. — [Wrapper kijai](https://github.com/kijai/ComfyUI-HunyuanVideoWrapper) ; [README HunyuanCustom](https://github.com/Tencent-Hunyuan/HunyuanCustom)

**HunyuanPortrait**
- Yuan-ManX/ComfyUI-HunyuanPortrait : MIT ; dernier commit le 28/05/2025. — [GitHub](https://github.com/Yuan-ManX/ComfyUI-HunyuanPortrait) ; [comfy.icu](https://comfy.icu/extension/Yuan-ManX__ComfyUI-HunyuanPortrait)

**DepthFlow**
- akatz-ai/ComfyUI-Depthflow-Nodes v1.2.3 : **AGPL-3.0** ; il épingle `depthflow==0.9.1` (ancienne version) ; dernier commit le 15/02/2026. — [GitHub](https://github.com/akatz-ai/ComfyUI-Depthflow-Nodes)
- cr7Por/ComfyUI_DepthFlow : aucun LICENSE ; dernier commit le 16/09/2024. — [GitHub](https://github.com/cr7Por/ComfyUI_DepthFlow)

**Autres projets**
- Aucun nœud trouvé : recherche web, puis dépôts `Yuan-ManX/ComfyUI-{LeviTor, MotionPro, AnyI2V, FollowYourClick, HunyuanCustom}` sondés et inexistants le 16/10/2026. — [Recherche ComfyUI](https://comfyui-wiki.com/en/custom-nodes)

### Inferences
- **Nœud DepthFlow** : il reste figé sur la v0.9.1, alors que DepthFlow 1.0 a cassé son API. Le combiner avec la version maintenue demanderait donc un portage.
- **ComfyUI n'est pas notre chemin** : notre moteur (Blender, navigateur, Python) gagne à réécrire les méthodes plutôt qu'à empiler ces nœuds.

### Gaps
- Le registre officiel ComfyUI Manager n'a pas été consulté directement : un nœud publié sous un autre nom a pu échapper au sondage.

## 6. Démo hébergée gratuite utilisable anonymement aujourd'hui

### Takeaway
**Aucune** démo hébergée gratuite, anonyme et fonctionnelle n'a été trouvée au 16/10/2026 pour les dix projets. Les seuls Spaces HF existants sont non officiels et soit en erreur, soit sur un CPU de base incapable de faire tourner un modèle de 13 Md de paramètres.

### Cited Findings
- **HunyuanVideo-Avatar** :
  - `henrybit/HunyuanVideo-Avatar-Test` : RUNNING sur `cpu-basic`, Space non officiel.
  - `oKen38461/WanGP-HunyuanVideoAvatar` : RUNTIME_ERROR (« Scheduling failure »). Source : API HF `/runtime`, 16/10/2026. — [Space henrybit](https://huggingface.co/spaces/henrybit/HunyuanVideo-Avatar-Test) ; [Space oKen38461](https://huggingface.co/spaces/oKen38461/WanGP-HunyuanVideoAvatar)
  - Tencent ne publie aucun Space HF pour Avatar, Portrait ou Custom (son seul Space Hunyuan vidéo est `tencent/HunyuanVideo-Foley`).
  - La fiche HF d'Avatar renvoie vers un « Playground » sur hunyuan.tencent.com. — [HF tencent/HunyuanVideo-Avatar](https://huggingface.co/tencent/HunyuanVideo-Avatar)
- **DepthFlow** :
  - Les Spaces `Yakova/Depthflow*` sont en RUNTIME_ERROR (« storage limit exceeded (50G) »). — [Space Yakova/Depthflow](https://huggingface.co/spaces/Yakova/Depthflow)
  - Le README prévient : « Any paid apps, websites, or ports claiming to be official are fake ». — [readme](https://github.com/BrokenSource/DepthFlow)
- **LeviTor** : la démo HF reste en TODO, seule la démo Gradio locale existe. — [README](https://github.com/ant-research/LeviTor)
- **MotionPro et AnyI2V** : démos Gradio **locales** uniquement. — [README MotionPro](https://github.com/HiDream-ai/MotionPro) ; [README AnyI2V](https://github.com/henghuiding/AnyI2V)
- Recherche de Spaces HF sans résultat pour HunyuanPortrait, HunyuanCustom, LeviTor, MotionPro, Follow-Your-Click et AnyI2V (API HF, 16/10/2026).

### Inferences
- **Space henrybit** : sur `cpu-basic`, il ne peut vraisemblablement pas exécuter Avatar localement. C'est soit une coquille, soit un relais vers une API, à ne pas utiliser avec nos images (dépôt public, images privées).

### Gaps
- Le Playground hunyuan.tencent.com (modelId=126) n'a pas été testé : on ne sait pas s'il est utilisable sans compte ni ce qu'il implique côté licence d'affichage. À vérifier manuellement.

## 7. Verdict : outil principal, complémentaire ou rejet

### Takeaway
**Aucun outil principal dans cette liste.** HunyuanVideo-Avatar est le seul qui sache faire parler et bouger un personnage cartoon ou 3D à partir d'une image et d'un audio. Il est pourtant rejeté comme moteur pour trois raisons : licence hors MIT/Apache/BSD, clause interdisant d'afficher les sorties hors territoire (UE, donc public francophone de France et de Belgique), et coût de calcul d'environ 60 min de GPU pour 10 s. Il ne gère en outre qu'un locuteur dans le code public. **DepthFlow** est le meilleur complément pour la parallaxe de fond, mais son AGPL impose de **réécrire la méthode** plutôt que d'intégrer le code. Les outils de mouvement par région (Follow-Your-Click, MotionPro, LeviTor, AnyI2V) apportent surtout des **idées à réécrire** (clic → masque → prompt court, pinceau et trajectoires), pas des composants.

### Cited Findings
Synthèse des sources des sections 1 à 6 :

| Projet | Verdict | Raison décisive |
|---|---|---|
| **HunyuanVideo-Avatar** | Rejet comme moteur ; référence de qualité et de méthode | Licence Tencent : sorties non affichables hors territoire (UE, Royaume-Uni, Corée), hors règle MIT/Apache/BSD ([LICENSE](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar/blob/main/LICENSE)). ~60 min pour 10 s ([arXiv](https://arxiv.org/html/2505.20156v1)). Code public mono-visage `maxface=True` ([code](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar/blob/main/hymm_sp/data_kits/audio_preprocessor.py)) |
| **HunyuanCustom** | Rejet | Même licence Tencent ; 60-80 Go ; multi-sujets non publié ([README](https://github.com/Tencent-Hunyuan/HunyuanCustom)) |
| **HunyuanPortrait** | Rejet | Usage commercial et production interdits ([LICENSE](https://github.com/Tencent-Hunyuan/HunyuanPortrait/blob/main/LICENSE)) ; vidéo de pilotage obligatoire, pas d'audio |
| **DepthFlow** | Complémentaire par la **méthode** (parallaxe de décor) ; code non intégrable | AGPL-3.0 ([license.txt](https://github.com/BrokenSource/DepthFlow/blob/main/license.txt)) ; pas temps réel sur CPU (7,66 i/s en 576×1024, mesuré) ; profondeur à prendre en DA-V2 Small seulement (Apache) |
| **MotionPro** | Complémentaire par l'idée (pinceau de région et trajectoires pour fumée ou feuilles) ; rejet comme composant | Code et poids Apache-2.0, mais socle SVD sous licence communautaire Stability ([HF](https://huggingface.co/HiDream-ai/MotionPro)) ; 16 images en 320×512 |
| **Follow-Your-Click** | Rejet ; idée à reprendre | Pas de poids publiés, licence non précisée ([configs](https://github.com/mayuelala/FollowYourClick/tree/main/configs/prompts)) |
| **LeviTor** | Rejet | Exige DA-V2 Large en CC BY-NC 4.0 ([HF](https://huggingface.co/depth-anything/Depth-Anything-V2-Large-hf)) ; 16 images en 288×512 ; SVD |
| **AnyI2V** | Rejet | Licence non précisée ; anime une image de condition, pas notre image finie ; SD 1.5 et AnimateDiff ([config](https://github.com/henghuiding/AnyI2V/blob/main/configs/prompts/1_1_animate_RealisticVision.yaml)) |
| **MotionStone** | Rejet (indisponible) ; idée à reprendre | Aucun code ni poids ([arXiv](https://arxiv.org/abs/2412.05848)) |
| **Through-the-Mask** | Rejet (indisponible) ; idée à reprendre | Aucun code ; seuls l'article et SA-V-128 sont publiés ([Page projet](https://guyyariv.github.io/TTM/)) |

### Inferences
Ce que la veille combinée permet de créer, en idées réécrites dans notre moteur sous licence maison :

1. **Parallaxe par calques plutôt que parallaxe plein cadre**, d'après la méthode DepthFlow (ray-marching GLSL sur carte de profondeur).
   - Les personnages sont séparés, le décor reçoit le ray-marching sur sa profondeur DA-V2 Small (Apache), et les trous derrière les personnages sont bouchés.
   - Critère d'acceptation : zéro déchirure de bord mesurée sur les contours des personnages, et ≥ 30 i/s en 576×1024 sur le GPU de production.
2. **« Clic → masque → mot de mouvement »** (idée Follow-Your-Click / MotionPro) appliqué aux éléments secondaires.
   - Masque SAM ou Mask R-CNN (tâche #163), puis mouvement procédural paramétré par un mot : « fumée », « feuilles », « tissu ».
   - Pas de diffusion, donc aucune déformation des personnages.
   - Critère : identité des personnages intacte, mesurée à 100 % puisque les pixels hors masque ne changent pas.
3. **Masque de visage par locuteur** (idée FAA de HunyuanVideo-Avatar et des masques de trajectoire de TTM) appliqué à notre lip-sync.
   - Chaque réplique ne pilote que la bouche du personnage qui parle ; les autres font des réactions d'écoute.
   - Critère : aucun mouvement de lèvres chez les non-locuteurs, vérifié image par image.
4. **Curseur d'intensité de mouvement séparé objet / caméra** (idée MotionStone) dans le moteur de scène.
   - Critère : intensité mesurée conforme à la consigne (écart < 10 %) avec nos outils de mesure.

### Gaps
- **Banc A/B de qualité** : aucun outil n'a été essayé sur nos propres images de troupe, faute de GPU dans ce conteneur et à cause des licences.
  - Greffe en cours : refaire la mesure DepthFlow sur GPU, puis tester les idées réécrites ci-dessus avec `mesure2.py`, `measure.ts` et `grammaire_plans.py`.
- **Statut juridique de la diffusion** dans l'UE d'une sortie Tencent produite au Sénégal : non tranché, aucun avis juridique trouvé.
