# Modèles de recherche B : MobileI2V, Motion-I2V, MAGE, Tune-A-Video, Follow-Your-Motion. Peuvent-ils animer nos images de la troupe ?

Veille faite le 16/10/2026. Méthode : clonage superficiel de chaque dépôt GitHub (README, fichier LICENSE et date du dernier commit lus directement), API Hugging Face (fiches de modèles, licences, état des Spaces), arXiv (résumés et texte HTML complet), liste officielle des nœuds de ComfyUI-Manager. Toutes les dates de « dernier commit » viennent du clone (`git log -1`) fait le 16/10/2026.

Rappel du cas d'usage : images fixes de haute qualité, style 3D cartoon proche de Pixar, 2 ou 3 personnages africains dans une cour ou un restaurant en plein air. Il faut des sketchs dialogués d'une minute pour TikTok (9:16), avec des plans de 2 à 4 s. Le personnage qui parle doit bouger tête, buste, bras et lèvres, sans perdre son identité, sans casser le style et sans déformation. Volume visé : environ 1 000 vidéos, sans abonnement et sans paiement à la génération. Consigne interne du dépôt (`CLAUDE.md`, « modèles-libres-moteur ») : on n'exécute chez nous que des modèles et du code sous licence MIT, Apache-2.0 ou BSD.

---

## Q0. Identification des bons dépôts (MAGE et famille « Follow-Your-* »)

### Takeaway
MAGE est **« Make It Move: Controllable Image-to-Video Generation with Text Descriptions »** (CVPR 2022, dépôt `Youncy-Hu/MAGE`) : c'est le seul candidat qui correspond à « animation contrôlable d'image avec description textuelle ». Dans la famille Follow-Your-*, c'est **Follow-Your-Motion** (`mayuelala/FollowYourMotion`, arXiv 2506.05207) qui correspond à « transfert de mouvement vers une vidéo générée ».

### Cited Findings
- **MAGE, le bon candidat.** « Make It Move » propose la tâche Text-Image-to-Video (TI2V), qui génère une vidéo à partir d'une image fixe et d'une description textuelle. Le modèle s'appelle « Motion Anchor-based video GEnerator (MAGE) ». Version 1 sur arXiv le 6 déc. 2021, révisée le 31 mars 2022 ; CVPR 2022. — [arXiv 2112.02815](https://arxiv.org/abs/2112.02815) ; [README Youncy-Hu/MAGE](https://github.com/Youncy-Hu/MAGE)
- **MAGE, homonymes écartés :**
  - « MAGE: MAsked Generative Encoder to Unify Representation Learning and Image Synthesis » (CVPR 2023, dépôt `LTH14/mage`) fait de l'apprentissage de représentations et de la synthèse d'image, pas d'animation. — [README LTH14/mage](https://github.com/LTH14/mage) ; [arXiv 2211.09117](https://arxiv.org/abs/2211.09117)
  - `microsoft/Mage` se présente comme « A Lightweight, Research-Friendly Multimodal Model Family ». Une recherche web le décrit comme de la génération et de l'édition d'images (Mage-Flow), pas de l'animation. — [README microsoft/Mage](https://github.com/microsoft/Mage)
  - Mage.space est une plateforme web commerciale, pas un dépôt ouvert. (Résultat de recherche secondaire, non approfondi.)
- **Famille Follow-Your-* (même auteur principal, Yue Ma, HKUST) :**
  - **Follow-Your-Pose** (arXiv 2304.01186, AAAI 2024) fait de la génération texte → vidéo guidée par la pose : « We tune the text-to-image model (e.g., stable diffusion) to generate the character videos from pose and text description ». — [README FollowYourPose](https://github.com/mayuelala/FollowYourPose)
  - **Follow-Your-Click** (arXiv 2403.08268) fait de l'« Open-domain Regional image animation via Short Prompts ». — [README FollowYourMotion, section Follow Family](https://github.com/mayuelala/FollowYourMotion) ; [README FollowYourClick](https://github.com/mayuelala/FollowYourClick)
  - **Follow-Your-Emoji** (arXiv 2406.01900) fait de l'animation de portrait. — [README FollowYourEmoji](https://github.com/mayuelala/FollowYourEmoji)
  - **Follow-Your-Motion** (arXiv 2506.05207) fait du « Video Motion Transfer via Efficient Spatial-Temporal Decoupled Finetuning ». À partir d'une vidéo de référence, il génère une nouvelle vidéo qui reprend le même mouvement : objets seuls ou multiples, poses humaines complexes, caméra. — [arXiv 2506.05207](https://arxiv.org/abs/2506.05207) ; [dépôt](https://github.com/mayuelala/FollowYourMotion)
- **Particularité du README de Follow-Your-Motion.** La commande d'installation pointe vers un autre dépôt (`git clone https://github.com/maohanw6-afk/Follow-Your-Motion.git`). Le dépôt officiel lié par l'article reste `mayuelala/FollowYourMotion`. — [README FollowYourMotion](https://github.com/mayuelala/FollowYourMotion)

### Inferences
- Pour notre besoin (animer une image qui parle), Follow-Your-Click (animation d'image) et Follow-Your-Emoji (portrait) sont plus proches du but que Follow-Your-Motion. Ils figurent ci-dessous comme voisins, sans fiche complète.

### Gaps
- Le dépôt `maohanw6-afk/Follow-Your-Motion` cité dans le README n'a pas été examiné. On ne sait pas s'il s'agit d'un miroir ou d'un fork.

---

## Q1. Licences : code (fichier LICENSE exact), poids (fiche de modèle exacte), usage commercial des sorties, modèles de base

### Takeaway
Un seul outil passe à la fois la consigne MIT/Apache/BSD et la chaîne complète de licences : **Follow-Your-Motion** (code Apache-2.0 + Wan2.1 Apache-2.0). Les autres posent problème pour une raison identifiable :
- **MobileI2V** : le VAE vient de LTX-Video, sous une licence restrictive.
- **Motion-I2V** : aucune licence de code ni de poids, et une base SD 1.5 sous CreativeML OpenRAIL-M.
- **Tune-A-Video** : base SD 1.4 et poids publiés sous CreativeML OpenRAIL-M.
- **MAGE** : code Apache-2.0, mais poids sur Google Drive sans licence.

### Cited Findings
**MobileI2V (hustvl, HUST)**
- Code : `LICENSE.txt` = Apache License 2.0. — [LICENSE.txt](https://github.com/hustvl/MobileI2V/blob/main/LICENSE.txt)
- Poids : la fiche Hugging Face `hustvl/MobileI2V` déclare `license: mit`. Elle contient un seul fichier de poids, `hybrid_371.pth`. Créée le 20/05/2026, modifiée le 25/07/2026. — [HF hustvl/MobileI2V](https://huggingface.co/hustvl/MobileI2V)
- Dépendances déclarées dans le README : le VAE vidéo de LTX-Video (`Lightricks/LTX-Video/tree/main/vae`) et Qwen2-0.5B comme encodeur de texte. Le décodeur LTX est remplacé par Turbo-VAED. Le code « mainly built with SANA and LTX-Video ». — [README MobileI2V](https://github.com/hustvl/MobileI2V) ; [config MobileI2V_300M_img512.yaml](https://github.com/hustvl/MobileI2V/blob/main/configs/mobilei2v_config/MobileI2V_300M_img512.yaml)
- Licences des dépendances :
  - Qwen2-0.5B : Apache-2.0. — [HF Qwen/Qwen2-0.5B](https://huggingface.co/Qwen/Qwen2-0.5B)
  - Turbo-VAED : MIT. — [HF hustvl/Turbo-VAED](https://huggingface.co/hustvl/Turbo-VAED)
  - Selon l'article, Turbo-VAED « distills the VAE of LTX-Video » (§4.1). — [arXiv HTML 2511.21475](https://arxiv.org/html/2511.21475)
  - LTX-Video 0.9 : « RAIL-M License dated November 22, 2024 ». Le « Permitted Purpose » est défini comme « for academic or research purposes only, and explicitly excludes commercialization ». La licence de droit d'auteur n'est accordée que « only for the Permitted Purpose ». Pour les sorties : « Licensor claims no rights in the Output ». — [ltx-video-2b-v0.9.license.txt](https://huggingface.co/Lightricks/LTX-Video/blob/main/ltx-video-2b-v0.9.license.txt)
  - Les versions de LTX publiées depuis la 0.9.6 (15/04/2025) relèvent de la « LTXV Open Weights License 0.X ». Elle autorise l'usage « for any purpose », mais les entités dont le chiffre d'affaires annuel atteint au moins 10 M$ doivent obtenir une licence commerciale payante. — [LTX-Video-Open-Weights-License-0.X.txt](https://huggingface.co/Lightricks/LTX-Video/blob/main/LTX-Video-Open-Weights-License-0.X.txt)
- Usage commercial des sorties : non précisé par MobileI2V lui-même. Le README ne contient pas de clause de licence.

**Motion-I2V (G-U-N, CUHK MMLab ; SIGGRAPH 2024)**
- Code : **aucun fichier LICENSE** à la racine du dépôt (fichiers présents : README.md, animation, assets, configs, dot, environment.yaml, flowgen, scripts, test_imgs…). Le README ne mentionne pas de licence. Code : **non précisé**. — [dépôt G-U-N/Motion-I2V](https://github.com/G-U-N/Motion-I2V)
- Poids : la fiche HF `wangfuyun/Motion-I2V` n'a pas de champ licence (**non précisé**). Elle contient l'étage 1 `StableDiffusion-FlowGen` (ControlNet, UNet, VAE, vae_flow), l'étage 2 `Motion_Module/motion_block.bin` et un modèle DreamBooth `realisticVisionV51_v20Novae.safetensors`. — [HF wangfuyun/Motion-I2V](https://huggingface.co/wangfuyun/Motion-I2V)
- Modèles de base : « We choose Stable Diffusion v1.5 as the base LDM model for the first stage and AnimateDiff v2 as the base VLDM for the second stage », entraînés sur WebVid-10M. — [arXiv HTML 2401.15977](https://arxiv.org/html/2401.15977)
- Licences des bases :
  - SD 1.5 : `creativeml-openrail-m`. — [HF stable-diffusion-v1-5](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5)
  - CreativeML OpenRAIL-M, article 6 : « Licensor claims no rights in the Output You generate using the Model… No use of the output can contravene any provision as stated in the License ». — [licence CreativeML OpenRAIL-M](https://huggingface.co/spaces/CompVis/stable-diffusion-license)
  - AnimateDiff : `apache-2.0`. — [HF guoyww/animatediff](https://huggingface.co/guoyww/animatediff)
- L'article arXiv est sous CC BY-NC-SA 4.0. Cette licence porte sur le texte de l'article, pas sur le code. — [arXiv HTML 2401.15977](https://arxiv.org/html/2401.15977)

**MAGE (Make It Move, CVPR 2022)**
- Code : `LICENSE` = Apache License 2.0. — [LICENSE](https://github.com/Youncy-Hu/MAGE/blob/main/LICENSE)
- Poids (MAGE et MAGE+) : distribués sur Google Drive. Aucune licence de poids n'est indiquée (**non précisé**). — [README MAGE](https://github.com/Youncy-Hu/MAGE)
- Modèle de base : aucun modèle préentraîné tiers. Le VQ-VAE et le générateur sont entraînés par l'utilisateur sur Moving MNIST et CATER-GEN. — [README MAGE](https://github.com/Youncy-Hu/MAGE)

**Tune-A-Video (showlab)**
- Code : `LICENSE` = Apache License 2.0. — [LICENSE](https://github.com/showlab/Tune-A-Video/blob/main/LICENSE)
- Poids publiés (organisation `Tune-A-Video-library` : a-man-is-surfing, mo-di-bear-guitar, redshift-man-skiing, talking-man…) : tous sous `creativeml-openrail-m`. — [HF Tune-A-Video-library](https://huggingface.co/Tune-A-Video-library)
- Modèle de base : Stable Diffusion v1-4 dans la configuration fournie (`pretrained_model_path: ./checkpoints/stable-diffusion-v1-4`). Le README cite aussi v2-1 et des SD affinés (Modern Disney, Anything V4, Redshift). — [configs/man-skiing.yaml](https://github.com/showlab/Tune-A-Video/blob/main/configs/man-skiing.yaml) ; [README](https://github.com/showlab/Tune-A-Video)
- SD 1.4 : `creativeml-openrail-m`. — [HF CompVis/stable-diffusion-v1-4](https://huggingface.co/CompVis/stable-diffusion-v1-4)

**Follow-Your-Motion (HKUST)**
- **Contradiction dans le dépôt.** Le fichier `LICENSE.md` contient le texte de l'**Apache License 2.0**, alors que la section « License » du README dit « licensed under the MIT License. See LICENSE.md ». Les deux licences sont permissives, mais le fichier fait foi : Apache-2.0. — [LICENSE.md](https://github.com/mayuelala/FollowYourMotion/blob/main/LICENSE.md) ; [README](https://github.com/mayuelala/FollowYourMotion)
- Poids : **aucun poids publié**. L'utilisateur entraîne ses propres LoRA spatiales et temporelles sur sa vidéo de référence. — [README](https://github.com/mayuelala/FollowYourMotion)
- Modèle de base : Wan2.1-T2V-1.3B (recommandé), sous `apache-2.0` (fiche créée le 25/02/2025). Le code « borrows heavily from DiffSynth-Studio ». — [HF Wan-AI/Wan2.1-T2V-1.3B](https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B) ; [README](https://github.com/mayuelala/FollowYourMotion)

**Voisins de la famille Follow-Your-***
- **Follow-Your-Pose :**
  - Code : `LICENSE` = MIT (« Copyright (c) 2022 hysts », probablement repris d'un gabarit). — [LICENSE](https://github.com/mayuelala/FollowYourPose/blob/main/LICENSE)
  - Poids : `YueMafighting/FollowYourPose_v1`, `license: mit`. — [HF](https://huggingface.co/YueMafighting/FollowYourPose_v1)
  - Base : SD 1.4 (CreativeML OpenRAIL-M). — [README](https://github.com/mayuelala/FollowYourPose)
- **Follow-Your-Click :** aucun fichier LICENSE (**non précisé**). — [dépôt](https://github.com/mayuelala/FollowYourClick)
- **Follow-Your-Emoji :**
  - Aucun fichier LICENSE (**non précisé**). Les poids `YueMafighting/FollowYourEmoji` n'ont pas de licence (**non précisé**). — [dépôt](https://github.com/mayuelala/FollowYourEmoji) ; [HF](https://huggingface.co/YueMafighting/FollowYourEmoji)
  - Bases : `lambdalabs/sd-image-variations-diffusers` (fiche : apache-2.0), `sd-vae-ft-mse` (MIT), AnimateDiff (apache-2.0). — [HF lambdalabs](https://huggingface.co/lambdalabs/sd-image-variations-diffusers) ; [HF sd-vae-ft-mse](https://huggingface.co/stabilityai/sd-vae-ft-mse)

### Inferences
- **MobileI2V.** Les poids du débruiteur sont sous MIT, mais chaque inférence passe par l'encodeur VAE de LTX-Video. Turbo-VAED ne remplace que le décodeur, et il est lui-même distillé du VAE LTX. Or la licence LTX définit les « Derivatives of the Model » comme incluant la distillation. Si le dossier `vae/` de LTX-Video relève de la licence 0.9 (RAIL-M, recherche seulement), l'usage pour une production commerciale TikTok n'est pas couvert. La licence exacte de ce dossier reste à confirmer.
- **Motion-I2V et Tune-A-Video** reposent sur CreativeML OpenRAIL-M. Cette licence ne revendique pas de droits sur les sorties et autorise le commercial sous restrictions d'usage. Mais elle n'est **ni MIT, ni Apache, ni BSD** : la consigne interne exclut donc ces deux modèles. Pour Motion-I2V s'ajoute l'absence totale de licence sur le code et les poids, qui interdit en pratique toute redistribution ou intégration.
- **Follow-Your-Motion** est le seul dont toute la chaîne (code Apache-2.0, DiffSynth, Wan2.1 Apache-2.0) passe la consigne. Les sorties de Wan2.1 sont exploitables commercialement selon Apache-2.0, sous réserve des droits sur la vidéo de référence utilisée.

### Gaps
- La licence exacte des fichiers `Lightricks/LTX-Video/vae/` (0.9 RAIL-M ou Open Weights 0.X) n'a pas été tranchée. Le dossier est à la racine du dépôt HF, sans fichier de licence dédié.
- La licence de `realisticVisionV51_v20Novae.safetensors` (modèle communautaire inclus dans les poids de Motion-I2V) n'a pas été vérifiée à la source.

---

## Q2. Ce que fait exactement chaque outil : entrées, sortie (durée, résolution, i/s), audio et lip-sync

### Takeaway
**Aucun des cinq n'accepte l'audio ni ne fait de lip-sync.** Deux seulement partent d'une image fournie :
- **MobileI2V** : 17 images, 720p, 1 s par clip dans le script fourni.
- **Motion-I2V** : 16 images en 320×512 paysage.

Les autres ne partent pas de notre image :
- **Tune-A-Video** et **Follow-Your-Motion** partent d'une vidéo et d'un texte (texte → vidéo).
- **MAGE** ne fonctionne que sur des jeux synthétiques (chiffres MNIST, objets CATER).

### Cited Findings
**MobileI2V**
- Entrées : une image de référence, ou la première image d'une vidéo, listée dans un fichier `.txt`. Un « flow_score » (score de mouvement) règle l'amplitude du mouvement. L'invite texte vient de la config (`prompt = config.prompt`). — [README](https://github.com/hustvl/MobileI2V) ; [scripts/inference_i2v.py](https://github.com/hustvl/MobileI2V/blob/main/scripts/inference_i2v.py)
- Sortie :
  - Démos « 1280×720×17 » et « 960×960×17 ». — [README](https://github.com/hustvl/MobileI2V)
  - Config `num_frames: 17`. — [config](https://github.com/hustvl/MobileI2V/blob/main/configs/mobilei2v_config/MobileI2V_300M_img512.yaml)
  - Le script appelle `save_sample(..., fps=17)` : 17 images à 17 i/s, soit environ 1 s par clip. — [inference_i2v.py](https://github.com/hustvl/MobileI2V/blob/main/scripts/inference_i2v.py)
- Le score de mouvement est un conditionnement par flot optique. Sur un paysage, passer de 2 à 5 fait monter le « dynamic degree » de 0,157 à 0,495. — [arXiv HTML 2511.21475 §4.2 et §9.1](https://arxiv.org/html/2511.21475)

**Motion-I2V**
- Entrées : image + invite texte. Options : trajectoires éparses (glisser des points), masque de région (animer seulement une zone), et vidéo source pour du vidéo → vidéo sans entraînement (étage 2). — [arXiv 2401.15977](https://arxiv.org/abs/2401.15977)
- Sortie : l'application Gradio recadre au centre en **320×512** (`CenterCrop((320, 512))`) et génère **16 images** (`Drag(..., 320, 512, 16)`). — [scripts/app.py](https://github.com/G-U-N/Motion-I2V/blob/main/scripts/app.py)
- Le nœud ComfyUI produit aussi une « 16 frame animation ». — [ComfyUI-IG-Motion-I2V](https://github.com/IDGallagher/ComfyUI-IG-Motion-I2V)

**MAGE**
- Entrées : image + texte. Le modèle génère les images suivantes de façon récursive grâce à des « three-dimensional axial transformers ». — [arXiv 2112.02815](https://arxiv.org/abs/2112.02815)
- Sortie : les configs donnent `frames_length: 10`. La résolution de l'autoencodeur MAGE+ est de 128, avec une latente 16×16. — [config/mage+_caterv1.yaml](https://github.com/Youncy-Hu/MAGE/blob/main/config/mage+_caterv1.yaml)
- Données d'évaluation : Moving MNIST et CATER-GEN, jeux synthétiques. — [README](https://github.com/Youncy-Hu/MAGE)

**Tune-A-Video**
- Entrée : **un couple vidéo + texte**. Le modèle affine SD sur cette seule vidéo (« One-Shot Video Tuning »), puis génère de nouvelles vidéos à partir d'invites modifiées. L'inversion DDIM de la vidéo source sert de guide de structure. — [arXiv 2212.11565](https://arxiv.org/abs/2212.11565) ; [README](https://github.com/showlab/Tune-A-Video)
- Sortie : la config d'exemple donne 24 images en 512×512 (`video_length: 24`, `sample_frame_rate: 2`). La démo HF parle de vidéos de 8 images. — [configs/man-skiing.yaml](https://github.com/showlab/Tune-A-Video/blob/main/configs/man-skiing.yaml) ; [Space app.py](https://huggingface.co/spaces/Tune-A-Video-library/Tune-A-Video-inference/blob/main/app.py)
- Pas d'entrée image : le modèle ne part pas d'une image fournie.

**Follow-Your-Motion**
- Entrées : une vidéo de référence (le mouvement), sa description, puis une invite texte pour la nouvelle vidéo. Base texte → vidéo Wan2.1 ; pipeline en plusieurs étapes : traitement des données, collecte des têtes d'attention, LoRA spatiale puis LoRA temporelle, inférence. — [README](https://github.com/mayuelala/FollowYourMotion)
- Les exemples d'entraînement utilisent `--num_frames 45 --height 544 --width 544`. — [README](https://github.com/mayuelala/FollowYourMotion)
- Les scripts fournis sont tous en T2V (`EffiVMT_train_wan_t2v.py`, `wan_14b_text_to_video.py`, `inference.py`) ; aucun script I2V n'existe dans l'arbre. — [arbre du dépôt](https://github.com/mayuelala/FollowYourMotion/tree/main/examples/wanvideo)
- Évaluation de l'article « in 32 frames ». — [arXiv HTML 2506.05207 §4.3](https://arxiv.org/html/2506.05207)

**Audio et lip-sync**
- Aucun des README de MobileI2V, Motion-I2V, MAGE, Tune-A-Video et Follow-Your-Motion ne mentionne d'entrée audio, de parole ou de synchronisation labiale. — [MobileI2V](https://github.com/hustvl/MobileI2V) ; [Motion-I2V](https://github.com/G-U-N/Motion-I2V) ; [MAGE](https://github.com/Youncy-Hu/MAGE) ; [Tune-A-Video](https://github.com/showlab/Tune-A-Video) ; [FollowYourMotion](https://github.com/mayuelala/FollowYourMotion)
- À titre de comparaison, Wan-AI publie des modèles dédiés, tous sous `apache-2.0` :
  - `Wan2.2-S2V-14B` (parole → vidéo), fiche du 25/08/2025 ;
  - `Wan2.2-Animate-14B`, fiche du 11/09/2025.
  - — [HF Wan2.2-S2V-14B](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B) ; [HF Wan2.2-Animate-14B](https://huggingface.co/Wan-AI/Wan2.2-Animate-14B)

### Inferences
- Un plan de 2 à 4 s demanderait d'enchaîner 2 à 4 clips MobileI2V de 1 s, ou 1 à 2 clips Motion-I2V de 16 images, avec un risque de dérive d'identité à chaque raccord. Aucun des deux ne règle les lèvres.
- Motion-I2V est au format paysage 512×320 : pour le 9:16 de TikTok, il faudrait recadrer ou adapter la résolution, ce qui n'a pas été testé.
- Tune-A-Video et Follow-Your-Motion ne partent pas de notre image : l'identité de nos personnages n'est pas garantie par construction.

### Gaps
- L'i/s « natif » d'entraînement de MobileI2V n'est pas documenté ; seul le 17 i/s du script est attesté. L'enchaînement de clips (extension temporelle) n'est pas documenté non plus.
- La compatibilité de Motion-I2V avec d'autres résolutions et le format vertical n'est pas documentée.

---

## Q3. Qualité sur personnages stylisés / cartoon / 3D et scènes à plusieurs personnes ; défauts connus ; benchmarks ; comparaison avec Wan 2.x et LTX-Video

### Takeaway
Aucun outil ne montre de résultats sur des personnages 3D cartoon en dialogue, à 2 ou 3 personnes.
- **MobileI2V** est entraîné surtout sur des visages et des vues aériennes ; ses auteurs disent qu'il rend mal les autres scènes et floute la bouche et les yeux.
- **Motion-I2V** est entraîné sur WebVid (vidéos réelles) et date d'avant Wan et LTX.
- **MAGE** ne sort pas des jeux synthétiques.
- **Tune-A-Video** est de l'ère SD 1.4.
- **Follow-Your-Motion** est le plus récent (Wan2.1) et mesure bien le mouvement humain complexe et multi-objets, mais seulement en texte → vidéo.

### Cited Findings
**MobileI2V**
- Défauts cités par les auteurs :
  - « our model is mainly trained on faces and aerial scenery, resulting in poor performance on other scenes » ;
  - « complex dynamic areas such as the mouth and eyes of a person's face are prone to blurring » ;
  - le VAE à forte compression 32×32×8 provoque du flou, aggravé quand l'amplitude du mouvement augmente.
  - — [arXiv HTML 2511.21475, §7 et §11](https://arxiv.org/html/2511.21475)
- Données d'entraînement : environ 160 000 vidéos en 512 (115 000 paysages + 45 000 visages) et environ 170 000 en 720p (93 000 paysages + 88 000 visages). — [arXiv HTML 2511.21475 §5.1](https://arxiv.org/html/2511.21475)
- Benchmark, Tableau 1 (I2V de 17 images, jeu de test des auteurs : 1 348 visages + 1 739 paysages, métrique FVD où plus bas est meilleur) :

  | Modèle | Taille | Pas | Résolution | Temps A100 | Temps iPhone | FVD (2 colonnes) |
  |---|---|---|---|---|---|---|
  | SVD-XT | 1,5B | 30 | 1024×576 | 45,9 s | OOM | 32,39 / 34,74 |
  | LTX-Video | 1,9B | 30 | 1280×720 | 9,00 s | OOM | 36,04 / 33,34 |
  | MobileI2V | 0,27B | 30 | 1280×720 | 2,00 s | 20,13 s | 26,99 / 25,09 |
  | MobileI2V distillé | 0,27B | 2 | 1280×720 | 0,23 s | 2,24 s | 31,69 / 27,06 |

  — [arXiv HTML 2511.21475 §5.2, Tab. 1](https://arxiv.org/html/2511.21475)
- VBench-I2V : les auteurs annoncent des scores « comparable » à DynamiCrafter, CogVideoX1.5, SVD et LTX-Video. Pas de comparaison avec Wan. — [arXiv HTML 2511.21475 §9.1](https://arxiv.org/html/2511.21475)

**Motion-I2V**
- Entraînement : SD 1.5 + AnimateDiff v2, sur WebVid-10M (vidéos réelles), clips de 16 images. Jeu de test maison : activités humaines, animaux, véhicules, scènes naturelles. — [arXiv HTML 2401.15977 §5.1](https://arxiv.org/html/2401.15977)
- Comparaisons qualitatives avec DynamiCrafter, Pika 1.0 et Gen-2 : « DynamiCrafter and Pika 1.0 tend to generate videos of very small motions. Gen2 can generate as large motion as our method, but fails to preserve the identity of the reference image ». — [arXiv HTML 2401.15977 Fig. 8](https://arxiv.org/html/2401.15977)
- Limite déclarée : « our method tends to generate videos of medium brightness » (calendrier de bruit sans SNR nul au dernier pas). — [arXiv HTML 2401.15977 §6](https://arxiv.org/html/2401.15977)
- Défaut montré par le nœud ComfyUI : quand des jumelles s'abaissent, « the model doesn't know what this face should look like ». Il faut une deuxième image via IP-Adapter, ce qui montre la faiblesse sur les zones cachées. — [ComfyUI-IG-Motion-I2V](https://github.com/IDGallagher/ComfyUI-IG-Motion-I2V)

**MAGE**
- Évaluation uniquement sur Moving MNIST et CATER-GEN : « Experiments conducted on these datasets verify the effectiveness of MAGE ». — [arXiv 2112.02815](https://arxiv.org/abs/2112.02815)

**Tune-A-Video**
- Démonstrations stylisées : SD affinés « Modern Disney » et « Redshift » (rendu 3D), et invites du type « Spider Man is skiing on the beach, cartoon style ». — [README](https://github.com/showlab/Tune-A-Video)
- Ces démonstrations transforment une vidéo source ; elles n'animent pas une image donnée. Base SD 1.4, article de déc. 2022. — [arXiv 2212.11565](https://arxiv.org/abs/2212.11565)

**Follow-Your-Motion**
- MotionBench : 200 vidéos réparties en mouvement de caméra, objet seul, objets multiples et « complex human motion ». — [arXiv HTML 2506.05207 §4.2](https://arxiv.org/html/2506.05207)
- Tableau 1 (32 images ; méthodes concurrentes réappliquées sur Wan-2.1 et CogVideo) : Follow-Your-Motion obtient Text Sim. 0,380, Motion Fid. 0,971, Temp. Cons. 0,976 et un temps de 727 s. En comparaison :
  - MotionDirector : 0,292 / 0,896 / 0,939, 3 008 s ;
  - DiTFlow : 0,375 / 0,807 / 0,941, 712 s.
  - Étude utilisateur (20 volontaires) : rang global 1,132, le meilleur.
  - — [arXiv HTML 2506.05207 §4.3, Tab. 1](https://arxiv.org/html/2506.05207)
- Les auteurs notent que le LoRA naïf en deux étages souffre de « appearance leakage ». — [arXiv HTML 2506.05207](https://arxiv.org/html/2506.05207)

**Repères de date pour les modèles récents**
- Wan2.1 : 25/02/2025.
- Wan2.2-TI2V-5B : 18/07/2025.
- LTX-Video : premier dépôt HF le 31/10/2024.
- LTX-2 : 03/01/2026, sous `ltx-2-community-license-agreement`.
- — [HF Wan2.1-T2V-1.3B](https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B) ; [HF Wan2.2-TI2V-5B](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B) ; [HF LTX-Video](https://huggingface.co/Lightricks/LTX-Video) ; [HF LTX-2](https://huggingface.co/Lightricks/LTX-2)

### Inferences
- **MobileI2V** est plus rapide que LTX-Video sur son propre jeu de test (visages et paysages). Mais rien ne garantit la tenue sur un rendu 3D cartoon à plusieurs personnages, que les auteurs disent eux-mêmes mal couvert. Le flou de la bouche est rédhibitoire pour des dialogues.
- **Motion-I2V, Tune-A-Video et MAGE** sont antérieurs à Wan2.1 et à LTX-Video et n'ont aucune comparaison publiée face à eux. Au vu des dates et des bases (SD 1.4/1.5, 512 px ou moins), il faut s'attendre à une qualité nettement inférieure aux modèles 2025-2026. Cette appréciation n'a pas été mesurée sur nos données.
- **Follow-Your-Motion** a la meilleure mesure de fidélité du mouvement, y compris pour le mouvement humain complexe. C'est l'outil à étudier si l'on veut copier un geste précis d'une vidéo TikTok de référence. Mais il génère tout le décor et les personnages par texte : il ne préserve pas nos personnages dessinés.

### Gaps
- Aucune source trouvée ne teste ces cinq outils sur du cartoon 3D de type Pixar ou sur des scènes de dialogue à plusieurs personnages. Seul un banc maison (`mesure2.py`, `measure.ts`) pourrait trancher.
- Le Tableau 1 de MobileI2V contient une première ligne (720×480, 73,1 s sur A100, FVD 60,83 / 41,03) dont le nom du modèle a été perdu à l'extraction HTML. Il s'agit probablement de CogVideoX1.5, non confirmé.

---

## Q4. Matériel : VRAM, temps par clip sur un GPU nommé, chemin CPU, promesses mobiles ; dates de sortie, dernier commit, maintenance

### Takeaway
- **MobileI2V** est de loin le plus rapide : 0,23 s pour 17 images en 720p sur A100 en version distillée, 2,24 s sur iPhone 16 Pro (Max). Mais aucune application ni aucun export mobile n'est distribué.
- **Follow-Your-Motion** tient dans environ 8,2 Go de VRAM à l'inférence (24 Go pour entraîner), mais demande environ 12 min de réglage par mouvement de référence.
- **Tune-A-Video** : 70 s par clip de 8 images sur T4.
- **Motion-I2V** et **MAGE** ne documentent ni VRAM ni temps.
- Seuls **MobileI2V** (mai 2026) et **Follow-Your-Motion** (mars 2026) ont été actifs en 2026.

### Cited Findings
**MobileI2V**
- 270M paramètres ; échantillonnage distillé de plus de 20 pas à 2 pas ; « each frame of 720p video is less than 100 ms » en un pas. — [arXiv 2511.21475](https://arxiv.org/abs/2511.21475)
- Temps par clip :
  - A100 : 0,23 s pour la version distillée (2 pas), 2,00 s pour la version en 30 pas.
  - iPhone : 2,24 s (distillé), 20,13 s (30 pas). — [Tab. 1](https://arxiv.org/html/2511.21475)
  - Le README parle de « 199× faster on an A100 » que SVD-XT. — [README](https://github.com/hustvl/MobileI2V)
- Mobile : conversion Core ML (TorchScript puis coremltools, `.mlpackage`, FP16) sur iPhone 16 Pro. Pour 1280×720×17 : encodeur VAE 337 ms, décodeur 503 ms, débruiteur 412 ms ; le pipeline complet est environ 10 % plus lent. Le texte parle aussi d'« iPhone 16 PM ». — [arXiv HTML 2511.21475 §10 et §1](https://arxiv.org/html/2511.21475)
- L'interface mobile n'est montrée qu'en vidéo dans le README (« We designed the mobile UI and deployed the model, as shown in the video below »). Aucun lien de téléchargement d'application ni de modèle Core ML. — [README](https://github.com/hustvl/MobileI2V)
- Entraînement : « 24 Nvidia V100 32G GPUs… approximately one week ». — [arXiv HTML §5.1](https://arxiv.org/html/2511.21475)
- Inférence PC : commande `CUDA_VISIBLE_DEVICES=0 python scripts/inference_i2v.py…`. Aucun chemin CPU n'est documenté. — [README](https://github.com/hustvl/MobileI2V)
- Calendrier : article le 26/11/2025 ; code de base le 27/11/2025 ; code de distillation le 20/05/2026. Dernier commit : 21/05/2026 (« Fix HuggingFace badge link in README »). — [README](https://github.com/hustvl/MobileI2V) ; clone du 16/10/2026

**Motion-I2V**
- Entraînement : « 32 NVIDIA A100 GPU ». — [arXiv HTML 2401.15977 §5.1](https://arxiv.org/html/2401.15977)
- VRAM et temps d'inférence non documentés. Le code appelle `.cuda()` directement : pas de chemin CPU. — [scripts/app.py](https://github.com/G-U-N/Motion-I2V/blob/main/scripts/app.py)
- La liste « TODO » du nœud ComfyUI contient « Reduce VRAM usage ». — [ComfyUI-IG-Motion-I2V](https://github.com/IDGallagher/ComfyUI-IG-Motion-I2V)
- Une recherche dans les issues GitHub (« memory OR VRAM OR GPU OR license ») ne renvoie qu'une issue (#1, « Instructions on the project », 12/07/2024). — [issues](https://github.com/G-U-N/Motion-I2V/issues)
- Calendrier : arXiv le 29/01/2024 ; SIGGRAPH 2024 ; poids HF le 11/07/2024. Dernier commit : 27/09/2024 (« Update app.py »). — [arXiv](https://arxiv.org/abs/2401.15977) ; [HF](https://huggingface.co/wangfuyun/Motion-I2V)

**MAGE**
- Seule mention matérielle : « tested on Ubuntu 18.04 ». — [README](https://github.com/Youncy-Hu/MAGE)
- Dernier commit : 19/08/2023 (« Update mage_model.py ») ; article de 2021-2022.

**Tune-A-Video**
- Entraînement : « Tuning a 24-frame video usually takes 300~500 steps, about 10~15 minutes using one A100 GPU. Reduce n_sample_frames if your GPU memory is limited. » — [README](https://github.com/showlab/Tune-A-Video)
- Inférence : « Expected time to generate an 8-frame video: 70 seconds with T4, 24 seconds with A10G, (10 seconds with A100) ». — [Space app.py](https://huggingface.co/spaces/Tune-A-Video-library/Tune-A-Video-inference/blob/main/app.py)
- Chemin CPU : « This demo does not work on CPU ». — [Space app.py](https://huggingface.co/spaces/Tune-A-Video-library/Tune-A-Video-inference/blob/main/app.py)
- Calendrier : code le 28/01/2023 ; dernier commit le 25/10/2023 (« Update README.md »). — [README](https://github.com/showlab/Tune-A-Video)

**Follow-Your-Motion**
- Matériel : « VRAM: ~8.2GB for 1.3B inference, 24GB for full LoRA training » ; « NVIDIA RTX 3090/4090 (Recommended for training) » ; « single-GPU compatible ». Utilise un VAE en tuiles et du délestage mémoire (offloading). — [README](https://github.com/mayuelala/FollowYourMotion)
- Temps de réglage : 727 s par vidéo de référence (Tab. 1, GPU non précisé dans le tableau), contre 3 042 s pour 3 000 pas de la référence de base sur une seule H20. Environ 3 000 pas de LoRA spatiale puis 2 000 pas de LoRA temporelle, rang 128 dans l'article. — [arXiv HTML 2506.05207 §3, §4.1, Tab. 1](https://arxiv.org/html/2506.05207)
- Calendrier : arXiv v1 le 05/06/2025 ; v4 le 30/03/2026. Dernier commit : 25/03/2026 (« Update README.md »). Le README dit : « This is the codebase for our research work ». — [arXiv](https://arxiv.org/abs/2506.05207) ; [README](https://github.com/mayuelala/FollowYourMotion)

**Voisins**
- Derniers commits : Follow-Your-Pose 20/03/2024, Follow-Your-Click 17/09/2025, Follow-Your-Emoji 22/12/2025 (clones du 16/10/2026).
- Follow-Your-Emoji annonce un cache TIC « up to 2.4× lossless acceleration » (16/04/2025). — [README FollowYourEmoji](https://github.com/mayuelala/FollowYourEmoji)

### Inferences
- **Calcul pour 1 000 vidéos d'une minute** (environ 20 plans de 3 s, donc environ 20 000 plans) :
  - **MobileI2V** prend un temps négligeable sur GPU. Mais ce n'est utile que si la qualité tient, ce que les limites des auteurs rendent improbable pour nos dialogues.
  - **Follow-Your-Motion** demande environ 12 min de réglage par geste de référence. Une bibliothèque de gestes réutilisables entraînés une fois amortirait ce coût. Mais le T2V ne garde pas nos personnages.
  - **Tune-A-Video** sur T4 gratuit reviendrait à au moins 70 s par clip de 8 images, plus 10 à 15 min de réglage (A100) par vidéo source : inadapté au volume.

### Gaps
- La VRAM d'inférence de MobileI2V sur PC et celle de Motion-I2V ne sont pas documentées : il faudra les mesurer.
- On ne sait pas sur quel GPU ont été mesurés les 727 s de Follow-Your-Motion.
- Il n'y a aucune donnée sur un chemin CPU, ni sur un GPU grand public de 8 à 12 Go, pour MobileI2V.

---

## Q5. Prise en charge dans ComfyUI (dépôt de nœuds, licence, maintenance)

### Takeaway
Seul **Motion-I2V** a un nœud ComfyUI dédié : ComfyUI-IG-Motion-I2V, sans fichier de licence et figé depuis septembre 2024. MobileI2V, MAGE, Tune-A-Video et Follow-Your-Motion n'apparaissent pas dans la liste de ComfyUI-Manager. Dans la famille Follow-Your-*, seul Follow-Your-Emoji y figure.

### Cited Findings
- **ComfyUI-IG-Motion-I2V (IDGallagher) :**
  - Nœuds « MI2V Flow Predictor », « MI2V Flow Animator », « MI2V Motion Painter » et « MI2V Pause » ; enveloppe diffusers ; IP-Adapter de base. — [README](https://github.com/IDGallagher/ComfyUI-IG-Motion-I2V)
  - TODO restant : « Convert the code to be Comfy Native », « Reduce VRAM usage ». — [README](https://github.com/IDGallagher/ComfyUI-IG-Motion-I2V)
  - Version 0.6.3. Le `pyproject.toml` déclare `license = { file = "LICENSE" }`, mais aucun fichier LICENSE n'existe à la racine : licence **non précisée**. — [pyproject.toml](https://github.com/IDGallagher/ComfyUI-IG-Motion-I2V/blob/main/pyproject.toml)
  - Dernier commit : 30/09/2024 (clone du 16/10/2026).
- Le README de Motion-I2V renvoie lui-même vers ce nœud. — [README Motion-I2V](https://github.com/G-U-N/Motion-I2V)
- **Liste ComfyUI-Manager** (`custom-node-list.json`, filtrée le 16/10/2026 sur motion-i2v, tune-a-video, mobilei2v, followyour, follow-your, make it move) : seuls « ComfyUI-IG-Motion-I2V » et « ComfyUI_FollowYourEmoji » (smthemex) ressortent. — [custom-node-list.json](https://github.com/ltdrdata/ComfyUI-Manager/blob/main/custom-node-list.json) ; [ComfyUI_FollowYourEmoji](https://github.com/smthemex/ComfyUI_FollowYourEmoji)

### Inferences
- **Follow-Your-Motion** dérive de DiffSynth-Studio et de Wan2.1. Ce sont ses LoRA, une fois entraînées, qui pourraient être chargées dans un graphe Wan2.1. Le format n'est pas vérifié : les LoRA visent des modules renommés `self_attn.q_spatial`, `q_temporal`…, ce qui suggère une architecture modifiée, incompatible telle quelle.

### Gaps
- La compatibilité des LoRA de Follow-Your-Motion avec les chargeurs de LoRA Wan standards (ComfyUI, DiffSynth amont) n'est pas vérifiée.
- La licence et l'état de maintenance de ComfyUI_FollowYourEmoji n'ont pas été vérifiés.

---

## Q6. Démo hébergée gratuite et utilisation anonyme aujourd'hui (16/10/2026)

### Takeaway
**Aucune démo utilisable aujourd'hui** pour les cinq outils (vérification par l'API runtime des Spaces Hugging Face) :
- Tune-A-Video : le seul Space « RUNNING » tourne sur CPU, et l'application déclare elle-même ne pas fonctionner sur CPU.
- MobileI2V, Motion-I2V, MAGE et Follow-Your-Motion : aucun Space trouvé.

### Cited Findings
- **Tune-A-Video :**
  - `Tune-A-Video-library/Tune-A-Video-inference` : stage « RUNNING », matériel « cpu-basic » (matériel suggéré « t4-small »). Mais `app.py` affiche « Running on CPU 🥶 This demo does not work on CPU ». — [API runtime](https://huggingface.co/api/spaces/Tune-A-Video-library/Tune-A-Video-inference/runtime) ; [app.py](https://huggingface.co/spaces/Tune-A-Video-library/Tune-A-Video-inference/blob/main/app.py)
  - `Tune-A-Video-library/Tune-A-Video-Training-UI` : « RUNTIME_ERROR », « Workload evicted, storage limit exceeded (50G) ». — [API runtime](https://huggingface.co/api/spaces/Tune-A-Video-library/Tune-A-Video-Training-UI/runtime)
  - `kadirnar/Tune-A-Video` : « RUNTIME_ERROR », « Scheduling failure ». — [API runtime](https://huggingface.co/api/spaces/kadirnar/Tune-A-Video/runtime)
  - Un notebook Colab officiel existe (non exécuté ici). — [README](https://github.com/showlab/Tune-A-Video) ; [notebook](https://colab.research.google.com/github/showlab/Tune-A-Video/blob/main/notebooks/Tune-A-Video.ipynb)
- **MobileI2V, Motion-I2V, Follow-Your-Motion** : la recherche de Spaces HF (`/api/spaces?search=`) ne renvoie aucun résultat pour « MobileI2V », « Motion-I2V » et « FollowYourMotion ». Pour « MAGE », elle ne renvoie que des Spaces sans rapport (microsoft/mage-vl-demo, cartoonisation…). — [API Spaces HF](https://huggingface.co/api/spaces?search=Motion-I2V)
- **Voisins :**
  - `YueMafighting/FollowYourPose` : « RUNTIME_ERROR » (a10g-large demandé). — [API runtime](https://huggingface.co/api/spaces/YueMafighting/FollowYourPose/runtime)
  - Spaces Follow-Your-Emoji (`learnmlf/FollowYourEmoji`, `Mildclimate/Follow-Your-Emoji`) : « PAUSED » et « SLEEPING », sur cpu-basic. — [API runtime learnmlf](https://huggingface.co/api/spaces/learnmlf/FollowYourEmoji/runtime)

### Inferences
- Pour tester l'un de ces outils, il faudrait un GPU gratuit (notebook Colab ou Kaggle), puisque aucun Space GPU n'est actif. Cet essai n'a pas été fait ici.

### Gaps
- La page projet de MobileI2V (hustvl.github.io/MobileI2V), celle de Motion-I2V et OpenXLab n'ont pas été explorées à la recherche d'une démo hors Hugging Face.

---

## Q7. Verdict pour notre cas d'usage (garder / écarter, raison décisive)

### Takeaway
**Les cinq sont écartés comme moteur d'animation de nos plans dialogués.** Aucun ne fait de lip-sync, et aucun ne démontre la préservation d'un personnage 3D cartoon qui parle. Deux idées méritent d'être reprises : le **score de mouvement** et la **vitesse** de MobileI2V comme passe d'aperçu, et le **transfert de mouvement par LoRA spatio-temporelles découplées** de Follow-Your-Motion pour une bibliothèque de gestes.

### Cited Findings
- **MobileI2V — écarté.** Raison décisive : selon les auteurs, il est entraîné sur visages et paysages et « poor performance on other scenes », avec « mouth and eyes… prone to blurring ». S'y ajoutent la dépendance au VAE LTX-Video (licence à clarifier) et des clips de 17 images à 17 i/s. — [arXiv HTML 2511.21475 §11](https://arxiv.org/html/2511.21475) ; [inference_i2v.py](https://github.com/hustvl/MobileI2V/blob/main/scripts/inference_i2v.py) ; [licence LTX 0.9](https://huggingface.co/Lightricks/LTX-Video/blob/main/ltx-video-2b-v0.9.license.txt)
- **Motion-I2V — écarté.** Raison décisive : ni le code ni les poids n'ont de licence, et la base SD 1.5 est sous OpenRAIL-M (hors consigne MIT/Apache/BSD). S'y ajoutent 16 images en 320×512 paysage, l'absence de lip-sync et l'absence de maintenance depuis le 27/09/2024. — [dépôt](https://github.com/G-U-N/Motion-I2V) ; [HF](https://huggingface.co/wangfuyun/Motion-I2V) ; [app.py](https://github.com/G-U-N/Motion-I2V/blob/main/scripts/app.py)
- **MAGE — écarté.** Raison décisive : il n'a été entraîné et évalué que sur des jeux synthétiques (Moving MNIST, CATER-GEN), à environ 128 px et 10 images. Il n'existe aucun modèle pour des images réelles ou cartoon. — [arXiv 2112.02815](https://arxiv.org/abs/2112.02815) ; [config](https://github.com/Youncy-Hu/MAGE/blob/main/config/mage+_caterv1.yaml)
- **Tune-A-Video — écarté.** Raison décisive : ce n'est pas de l'image → vidéo (l'entrée est une vidéo + un texte, avec réglage par vidéo). Il repose sur SD 1.4 et ses poids sont sous CreativeML OpenRAIL-M (hors consigne). Comptez 70 s par clip de 8 images sur T4. — [arXiv 2212.11565](https://arxiv.org/abs/2212.11565) ; [HF Tune-A-Video-library](https://huggingface.co/Tune-A-Video-library) ; [Space app.py](https://huggingface.co/spaces/Tune-A-Video-library/Tune-A-Video-inference/blob/main/app.py)
- **Follow-Your-Motion — écarté pour animer nos images, gardé comme idée à greffer.** Raison décisive : pipeline texte → vidéo uniquement (scripts T2V, aucun I2V), donc nos personnages ne sont pas préservés, et aucun lip-sync. Points forts : licence Apache-2.0 + Wan2.1 Apache-2.0, environ 8,2 Go de VRAM à l'inférence, meilleure fidélité de mouvement sur MotionBench (0,971). — [README](https://github.com/mayuelala/FollowYourMotion) ; [LICENSE.md](https://github.com/mayuelala/FollowYourMotion/blob/main/LICENSE.md) ; [Tab. 1](https://arxiv.org/html/2506.05207)

### Inferences
Ces pistes combinent les trouvailles ; ce sont des propositions à tester, pas des résultats mesurés.
- **Piste 1, « gestes TikTok → LoRA de mouvement ».** Reprendre la méthode publiée de Follow-Your-Motion : classer les têtes d'attention en spatiales ou temporelles, puis n'entraîner une LoRA temporelle que sur les têtes temporelles, avec échantillonnage épars des images. Il s'agit de la réécrire sur un modèle **image → vidéo** sous licence Apache-2.0 de la famille Wan, pour construire une bibliothèque de gestes de conversation (hochement, main ouverte, haussement d'épaules) tirés de vidéos de référence. Critère d'acceptation : fidélité du mouvement d'au moins 0,9 (métrique tracklet de l'article) et identité du personnage stable (similarité CLIP/DINO avec l'image de départ au-dessus d'un seuil fixé sur nos planches), mesurées avec `mesure2.py`.
- **Piste 2, « score de mouvement à la MobileI2V ».** Ajouter à notre moteur un réglage d'amplitude du mouvement par plan, piloté par la prosodie de la voix française : plus fort sur les répliques accentuées, faible pour l'écoute. Le conditionnement par flot optique de MobileI2V montre qu'un seul scalaire suffit à piloter le « dynamic degree ». Critère d'acceptation : corrélation mesurée entre l'énergie audio et l'amplitude de mouvement du plan.
- **Le lip-sync reste un étage séparé quel que soit l'outil retenu.** Les alternatives Apache-2.0 qui traitent la parole (Wan2.2-S2V-14B) ou l'animation pilotée (Wan2.2-Animate-14B) sont à comparer dans une autre fiche.

### Gaps
- Aucun de ces outils n'a été exécuté sur nos images : le verdict repose sur les sources, sans mesure maison. Un essai Colab de MobileI2V sur une planche de la troupe trancherait la question du style cartoon en moins d'une heure de GPU gratuit.
- La faisabilité de la piste 1 (transposer les LoRA découplées de Wan2.1-T2V vers un I2V Wan) n'est documentée nulle part ; il faudra l'expérimenter.
