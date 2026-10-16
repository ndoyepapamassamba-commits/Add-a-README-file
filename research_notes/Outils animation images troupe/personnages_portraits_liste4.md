# Animation de personnages et portraits parlants, liste 4 : MIMO, Hyper-Motion, SkyReels-A1 (A2, A3, V3), MuseV, MagicDance, V-Express, EMO, JoyVASA

*État de l'art au 16/10/2026. Cadre : films « troupe » MASSAMBA, environ 60 s en 9:16, plusieurs personnages africains stylisés façon 3D cartoon autour d'une table, voix françaises de synthèse, objectif de 1 000 films, usage commercial, ComfyUI piloté par HTTP sur un T4 16 Go Kaggle gratuit ou un GPU loué. Règle : code et modèles exécutés chez nous sous MIT, Apache-2.0 ou BSD seulement.*

*Méthode : chaque fichier LICENSE, README et chaque fiche de modèle a été lu à la source (raw.githubusercontent.com, API Hugging Face, clones git sans blobs supprimés après lecture). La date du dernier commit vient de `git log` sur un clone `--depth=1 --filter=blob:none`. L'état des Spaces vient de l'API `huggingface.co/api/spaces/<id>`, interrogée le 16/10/2026. Les packs ComfyUI ont été cherchés dans `custom-node-list.json` de ComfyUI-Manager (branche main, lue le 16/10/2026). Aucune donnée client n'a été mise dans les requêtes.*

---

## 1. MIMO (menyifang/MIMO) : peut-il animer nos personnages et entrer dans le moteur ?

### Takeaway
MIMO anime le **corps entier** d'un personnage à partir d'une **pose 3D SMPL**. Il ne prend **aucun signal audio** et ne bouge pas les lèvres. Le code et les poids MIMO sont sous Apache-2.0, mais toute création de mouvement passe par SMPL (non commercial). La chaîne de décomposition embarque ProPainter, Depth-Anything-V2-Large et MANO, tous trois non commerciaux, et la base SD 1.5 est sous OpenRAIL-M, hors de notre liste. **Verdict : rejet comme moteur.** L'idée de décomposition spatiale (personnage, décor, occultation) mérite d'être réécrite avec des briques libres.

### Cited Findings
- **Dépôt, maintenance** : dernier commit le 19/06/2025 (« fix assets.zip link »), d'après le clone git. Le code a été publié le 11/06/2025 en « simplified version of full implementation », et l'article est accepté à CVPR 2025 — [README MIMO](https://github.com/menyifang/MIMO)
- **Licence du code** : Apache-2.0 (fichier LICENSE de 201 lignes) — [LICENSE MIMO](https://github.com/menyifang/MIMO/blob/main/LICENSE)
- **Licence des poids** : la fiche HF `menyifang/MIMO` indique `license: apache-2.0`. Fichiers : `denoising_unet.pth`, `motion_module.pth`, `pose_guider.pth`, `reference_unet.pth` (fiche modifiée le 13/04/2025) — [HF menyifang/MIMO](https://huggingface.co/menyifang/MIMO)
- **Modèles de base requis** : Stable Diffusion V1.5, sd-vae-ft-mse et l'`image_encoder` de lambdalabs/sd-image-variations-diffusers — [README MIMO](https://github.com/menyifang/MIMO). Leurs licences : SD 1.5 sous `creativeml-openrail-m` ([HF SD 1.5](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5)), VAE sous `mit` ([HF sd-vae-ft-mse](https://huggingface.co/stabilityai/sd-vae-ft-mse)), encodeur sous `apache-2.0` ([HF lambdalabs](https://huggingface.co/lambdalabs/sd-image-variations-diffusers))
- **Dépendances de décomposition vidéo** : le dépôt HF `menyifang/MIMO_VidDecomp` est étiqueté apache-2.0, mais il redistribue `SMPL_NEUTRAL.pkl`, `SMPL_MALE.pkl`, `SMPLH_*`, `MANO_LEFT/RIGHT.pkl`, `depth_anything_v2_vitl.pth`, `ProPainter.pth`, `sam2_hiera_large.pt`, `sam_vit_h`, `hamer.ckpt`, `hmr2`, `vitpose+_huge/wholebody.pth` et un ViTDet detectron2 — [HF MIMO_VidDecomp](https://huggingface.co/menyifang/MIMO_VidDecomp)
- **Clauses non commerciales relevées** :
  - ProPainter, embarqué dans `video_decomp/ProPainter`, est sous « S-Lab License 1.0 : Redistribution and use for non-commercial purpose » — [LICENSE ProPainter dans MIMO](https://github.com/menyifang/MIMO/blob/main/video_decomp/ProPainter/LICENSE)
  - Depth-Anything-V2-Large est sous `cc-by-nc-4.0` — [HF Depth-Anything-V2-Large](https://huggingface.co/depth-anything/Depth-Anything-V2-Large)
  - SMPL : « Any other use, in particular any use for commercial purposes, is prohibited… may not be reproduced… or made available… to any third party » — [Licence SMPL](https://smpl.is.tue.mpg.de/modellicense.html)
  - MANO : licence « for non-commercial scientific research purposes » — [Licence MANO](https://mano.is.tue.mpg.de/license.html)
- **Ce qu'il anime et comment** : U-Net initialisé depuis SD 1.5 avec module temporel AnimateDiff, ReferenceNet et encodeur CLIP. Le signal pilote est un code de mouvement construit à partir de paramètres SMPL estimés image par image (bases AMASS et Mixamo, ou vidéos réelles). La décomposition s'appuie sur Depth Anything, Detectron2, SAM 2, ProPainter et Humans in 4D. Entraînement sur 24 images par clip, tests sur clips de 150 images. Résolution et fps ne sont pas donnés — [arXiv 2409.16160](https://arxiv.org/html/2409.16160)
- **Personnages stylisés** : le papier affirme « our method can animate arbitrary characters, including realistic humans, cartoon characters and personified ones » (Fig. 5), sans mesure chiffrée sur le stylisé — [arXiv 2409.16160](https://arxiv.org/html/2409.16160)
- **Plusieurs personnes** : non traité. Le pipeline suppose un seul « main human » ; il gère en revanche les interactions avec des objets et l'occultation — [arXiv 2409.16160](https://arxiv.org/html/2409.16160)
- **Matériel** : testé sur A100 et L20 (README) ; seul l'entraînement est chiffré (8 × A100 80 Go) — [README MIMO](https://github.com/menyifang/MIMO), [arXiv](https://arxiv.org/html/2409.16160)
- **T4** : l'issue #31 « Can the model run on a T4 gpu with 16gb vram? » (14/06/2025) n'a reçu aucune réponse — [issue #31](https://github.com/menyifang/MIMO/issues/31)
- **État des issues** : l'issue #38 (05/02/2026) signale que les données nécessaires à la création d'un gabarit de mouvement (`sdc_info.npy`, `smpl_vert_segmentation.json`) manquent. Les issues #27 et #29 parlent de « fake open source » — [issue #38](https://github.com/menyifang/MIMO/issues/38), [liste des issues](https://github.com/menyifang/MIMO/issues)
- **Démo** : une démo ModelScope (v1.5, vidéos pilotes personnalisées) est annoncée dans le README — [README MIMO](https://github.com/menyifang/MIMO)
- **ComfyUI** : aucun pack MIMO dans `custom-node-list.json` — [ComfyUI-Manager custom-node-list](https://github.com/Comfy-Org/ComfyUI-Manager/blob/main/custom-node-list.json)

### Inferences
- Sans audio ni lèvres, MIMO ne servirait au mieux que de **couche de mouvement du corps**. Or le code de mouvement exige SMPL (licence non commerciale, redistribution interdite) : la redistribution de SMPL sous une étiquette « apache-2.0 » dans MIMO_VidDecomp ne lève pas la licence MPI. Pour nous, c'est un **rejet**.
- **À réécrire (greffe)** : l'idée de décomposer la scène en trois couches (personnage, décor, occultation) répond exactement au problème de la table à plusieurs personnages. Plan : masques par SAM 2 (Apache-2.0, déjà dans la liste MIMO), profondeur par Depth-Anything-V2-**Small**, qui est sous `apache-2.0` ([HF DA-V2-Small](https://huggingface.co/depth-anything/Depth-Anything-V2-Small)), puis animation couche par couche et recomposition. Critère d'acceptation : aucun bord visible entre un personnage animé et le décor fixe, mesuré par SSIM sur une couronne de 8 px autour du masque, sur 10 plans de la troupe.
- Le T4 Kaggle ne prend pas en charge le bf16. Le commentaire de `inference.py` d'Hyper-Motion cite la 2080 Ti, de même génération Turing ([inference.py Hyper-Motion](https://github.com/vivoCameraResearch/Hyper-Motion/blob/main/scripts/inference.py)). Il faudrait donc tout passer en fp16, ce qui n'a pas été testé sur MIMO.

### Gaps
- Aucun chiffre de VRAM ni de temps par seconde de vidéo publié, sur aucun GPU.
- L'état de la démo ModelScope au 16/10/2026 n'a pas été vérifié (page non interrogée).
- Aucune preuve chiffrée de qualité sur des visages 3D cartoon.

---

## 2. Hyper-Motion / HyperMotionX (vivoCameraResearch/Hyper-Motion) : dépôt exact, licence, usage

### Takeaway
Le dépôt exact est **vivoCameraResearch/Hyper-Motion** (projet renommé « HyperMotionX » le 20/02/2026). C'est un réglage fin de **Wan2.1-I2V-14B**, guidé par une vidéo de pose 2D, pour le corps entier en mouvement complexe. Il produit nativement du **576×1024 vertical**, sans audio. Le README et la fiche HF actuelle le placent sous **CC BY-NC-SA 4.0** (code, poids et démo). **Verdict : rejet** pour licence non commerciale.

### Cited Findings
- **Dépôt** : dernier commit le 27/05/2026 (« Update README.md ») ; le commit du 20/02/2026 s'intitule « Change project name to HyperMotionX and update citation » (git log) — [dépôt Hyper-Motion](https://github.com/vivoCameraResearch/Hyper-Motion)
- **Licence, avec contradiction relevée** :
  - section License du README : « All the materials, including code, checkpoints, and demo, are made available under the Creative Commons BY-NC-SA 4.0 license… for non-commercial purposes » — [README](https://github.com/vivoCameraResearch/Hyper-Motion)
  - fiche HF `shuolin/HyperMotion` : `license: cc-by-nc-sa-4.0`, modifiée le 19/03/2026 — [HF shuolin/HyperMotion](https://huggingface.co/shuolin/HyperMotion)
  - le fichier `LICENSE.txt` ne contient qu'une ligne, l'URL de la licence Apache-2.0, et le badge du README « CC BY-NC-SA-4.0 » pointe lui aussi vers cette URL — [LICENSE.txt](https://github.com/vivoCameraResearch/Hyper-Motion/blob/main/LICENSE.txt)
  - un résultat de recherche indique qu'une version antérieure de la fiche HF affichait apache-2.0 — [historique HF](https://huggingface.co/shuolin/HyperMotion/commit/2730884e6c8d8aa44b628b8a12e9434dbab0f44d) (version non relue commit par commit)
- **Base et poids** : modèle de base Wan2.1-I2V-14B ; le code dérive de VideoX-Fun — [README](https://github.com/vivoCameraResearch/Hyper-Motion). Wan2.1-I2V-14B est sous `apache-2.0` ([HF Wan2.1-I2V-14B-720P](https://huggingface.co/Wan-AI/Wan2.1-I2V-14B-720P)). Le dépôt HF HyperMotion contient `diffusion_pytorch_model.safetensors`, le VAE Wan2.1, umt5-xxl et open-clip-xlm-roberta — [HF](https://huggingface.co/shuolin/HyperMotion)
- **Dépendances non commerciales** :
  - X-Pose, recommandé pour extraire les poses : « License for Non-commercial Scientific Research Purposes… any use for commercial… purposes is prohibited » — [LICENSE X-Pose](https://github.com/IDEA-Research/X-Pose/blob/master/LICENSE.txt), [README Hyper-Motion](https://github.com/vivoCameraResearch/Hyper-Motion)
  - données d'entraînement issues de Motion-X, accordées sur formulaire « for non-commercial purposes » — [README](https://github.com/vivoCameraResearch/Hyper-Motion)
- **Ce qu'il anime** : animation humaine corps entier guidée par une vidéo de pose (points-clés 2D) et une image de référence. Résolutions 1024×576 et **576×1024 (portrait)**. Jeu de données mono-personne (filtre YOLOv8). Limites : visage flou ou perdu dans les transitions rapides, mains mal estimées — [arXiv 2505.22977](https://arxiv.org/html/2505.22977)
- **Réglages par défaut** : `sample_size = [576, 1024]`, `video_length = 49`, `fps = 16`, `num_inference_steps = 50`, `guidance_scale = 6.0`, `GPU_memory_mode = "sequential_cpu_offload"`, bf16. Le commentaire précise que « some graphics cards, such as v100, 2080ti, do not support torch.bfloat16 » — [scripts/inference.py](https://github.com/vivoCameraResearch/Hyper-Motion/blob/main/scripts/inference.py)
- **Matériel** :
  - README : « inference only need < 24GB, even 16GB! So single RTX4090 is enough », environ 60 Go de disque pour les poids, GPU vérifiés V100 16G, A10 24G, A100 40G et 80G — [README](https://github.com/vivoCameraResearch/Hyper-Motion)
  - papier : « only a single RTX 3090 GPU is required » ; entraînement sur 8 × H20 pendant environ 12 jours — [arXiv](https://arxiv.org/html/2505.22977)
  - aucun temps d'inférence publié.
- **Stylisé et multi-personnes** : ni le papier ni la page projet n'en parlent ; la page décrit des « realistic human animations » — [page projet](https://vivocameraresearch.github.io/hypermotion/), [arXiv](https://arxiv.org/html/2505.22977)
- **ComfyUI** : aucun pack dans `custom-node-list.json` — [ComfyUI-Manager](https://github.com/Comfy-Org/ComfyUI-Manager/blob/main/custom-node-list.json). Aucun Space HF trouvé par l'API de recherche.

### Inferences
- Même si `LICENSE.txt` ne contient que l'URL Apache, la déclaration explicite du README et de la fiche HF (CC BY-NC-SA 4.0) couvre les poids. Usage commercial **interdit** → rejet.
- Comme référence, il montre qu'un réglage fin de Wan2.1-I2V-14B (Apache-2.0) sur des poses sort du **576×1024 vertical**, notre format, avec 16 Go et du délestage séquentiel. La même démarche est reproductible sous licence propre : base Wan2.1 Apache-2.0, poses DWPose ou MediaPipe, données sous licence ouverte. C'est une piste de greffe, pas une utilisation directe.
- Sur T4 il faudrait passer en fp16 (pas de bf16) ; un 14B en `sequential_cpu_offload` y serait très lent. Non mesuré.

### Gaps
- Aucun temps par seconde de vidéo publié. Aucun résultat sur des personnages cartoon ou 3D stylisés.

---

## 3. SkyReels-A1 (SkyworkAI/SkyReels-A1), avec A2, A3 et V3 : portrait expressif piloté par la vidéo ou l'audio

### Takeaway
SkyReels-A1 anime un **portrait** (expressions et tête, plus un peu de corps) sur une base **CogVideoX-5B**, piloté par une vidéo ou par l'audio via **DiffPoseTalk + FLAME**. Sa chaîne de licences cumule quatre blocages :
- la licence Skywork Community, commerciale mais révocable et hors MIT/Apache/BSD ;
- la CogVideoX License (inscription obligatoire, plafond de 1 M visites par mois) ;
- FLAME et InsightFace, non commerciaux ;
- DiffPoseTalk, sans licence.

Il demande environ 18 Go selon un utilisateur, et sa démo est en panne. **Verdict : rejet.** SkyReels-A2 (composition multi-éléments sur Wan2.1) et SkyReels-V3 A2V-19B (avatar parlant, cartoon revendiqué) restent sous licence Skywork : rejet aussi au titre de notre règle. Aucun dépôt public SkyReels-A3 n'a été trouvé.

### Cited Findings
- **Maintenance** : dernier commit A1 le 05/06/2025. Dans la TODO, « User-Level GPU Inference on RTX4090 » et « ComfyUI » restent **non cochés** — [README A1](https://github.com/SkyworkAI/SkyReels-A1)
- **Licence, avec contradiction relevée** :
  - le dépôt GitHub contient `LICENSE.txt` = « Skywork Community License… The Skywork model supports commercial use… you must abide by terms and conditions » — [LICENSE.txt A1](https://github.com/SkyworkAI/SkyReels-A1/blob/main/LICENSE.txt)
  - la fiche HF `Skywork/SkyReels-A1` indique `license: apache-2.0` mais contient le même `LICENSE.txt` — [HF SkyReels-A1](https://huggingface.co/Skywork/SkyReels-A1)
- **Skywork Community License** : licence « non-exclusive, worldwide, non-transferable, non-sublicensable, **revocable**, royalty-free ». Usage commercial autorisé. Obligations : fournir la licence aux tiers, signaler les modifications, étiqueter les dérivés « developed based on the Skywork Model ». Clauses sur le droit chinois (PIPL) — [Skywork Community License (PDF)](https://github.com/SkyworkAI/Skywork/blob/main/Skywork%20Community%20License.pdf)
- **Modèle de base** : « We train our model based on the advanced video diffusion transformer CogVideoX-5B » — [arXiv 2502.10841](https://arxiv.org/html/2502.10841). La CogVideoX License prévoit : « Users who wish to use the models for commercial purposes must register… the number of service users (visits)… must not exceed 1 million visits per month », révocable, droit chinois, tribunal de Haidian — [LICENSE CogVideoX-5b-I2V](https://huggingface.co/THUDM/CogVideoX-5b-I2V/blob/main/LICENSE)
- **Briques embarquées** :
  - `extra_models/FLAME/FLAME2020`, `extra_models/smirk/SMIRK_em1.pt`, `extra_models/mediapipe/face_landmarker.task`, `siglip-so400m-patch14-384` ;
  - dans `eval/`, les packs InsightFace `buffalo_l` et `antelopev2` ;
  - sources : [HF SkyReels-A1](https://huggingface.co/Skywork/SkyReels-A1).
- **Licences de ces briques** :
  - FLAME : « non-commercial scientific research… Any other use, in particular any use for commercial… purposes is prohibited » — [Licence FLAME](https://flame.is.tue.mpg.de/modellicense.html)
  - InsightFace : « The pretrained models provided with this library are for non-commercial research only » — [README python-package InsightFace](https://github.com/deepinsight/insightface/blob/master/python-package/README.md)
  - SMIRK : code sous MIT — [LICENSE SMIRK](https://github.com/georgeretsi/smirk/blob/main/LICENSE)
  - SigLIP : `apache-2.0` — [HF SigLIP](https://huggingface.co/google/siglip-so400m-patch14-384)
- **InsightFace est dans le chemin d'inférence**, pas seulement dans l'évaluation : `pre_process_lmk3d.py` crée `FaceAnalysis(allowed_modules=['detection'])` — [pre_process_lmk3d.py](https://github.com/SkyworkAI/SkyReels-A1/blob/main/skyreels_a1/pre_process_lmk3d.py)
- **Pilotage par l'audio** : DiffPoseTalk produit les coefficients FLAME à partir de l'audio (checkpoint `head-SA-hubert-WM`, statistiques `HDTF_TFHP`) — [README A1](https://github.com/SkyworkAI/SkyReels-A1). Le dépôt DiffPoseTalk n'a **aucun fichier LICENSE** (404 sur main, aucune mention de licence dans le README, dernier commit le 11/03/2025) — [DiffPoseTalk](https://github.com/DiffPoseTalk/DiffPoseTalk)
- **Réglages audio** : `sample_size = [480, 720]` (paysage), `num_frames = 49`, `target_fps = 12` (« Native »), 10 pas, `guidance_scale = 3.0`, bf16, `enable_model_cpu_offload()`. Le visage est recadré avec `get_face_landmarks_5(only_center_face=True)`, donc **un seul visage**. Un script dédié gère les vidéos longues, et FILM interpole vers 24, 48 ou 60 i/s — [inference_audio.py](https://github.com/SkyworkAI/SkyReels-A1/blob/main/inference_audio.py), [README](https://github.com/SkyworkAI/SkyReels-A1)
- **Couverture** : « natural body dynamics » ; le modèle peut « animate full-body images seamlessly » quand le visage est petit. Limite reconnue sur les « extreme pose variations ». Aucune mention de personnages stylisés ou cartoon dans le papier ni sur la page projet — [arXiv](https://arxiv.org/html/2502.10841), [page projet](https://skyworkai.github.io/skyreels-a1.github.io/)
- **VRAM, d'après l'issue #2** :
  - un utilisateur : « I tested it on an A100 with 40GB of VRAM in colab, and it required approximately 18GB » (19/02/2025) ;
  - un autre : « 24GB GPU memory… fails with CUDA OOM on pipe.to('cuda') » (28/03/2025) ;
  - aucun fonctionnement confirmé sous 24 Go ;
  - source : [issue #2](https://github.com/SkyworkAI/SkyReels-A1/issues/2)
- **Démo** : le Space `Skywork/skyreels-a1-talking-head` est à l'état **CONFIG_ERROR** (API HF, 16/10/2026) — [Space A1](https://huggingface.co/spaces/Skywork/skyreels-a1-talking-head)
- **ComfyUI A1** : aucun pack dans `custom-node-list.json` — [ComfyUI-Manager](https://github.com/Comfy-Org/ComfyUI-Manager/blob/main/custom-node-list.json)
- **SkyReels-A2** :
  - composition de « arbitrary visual elements » sur Wan2.1-14B. Seule la Preview est publiée (environ 81 images × 480×832) ; « Pro » et « Infinity » sont « To be released » ;
  - passe sur RTX 4090 avec `offload_switch` ; dernier commit le 03/06/2025 ;
  - sources : [README A2](https://github.com/SkyworkAI/SkyReels-A2).
  - Licence : `LICENSE.txt` du dépôt = Skywork Community License ; fiche HF = `apache-2.0` (même contradiction qu'A1) — [LICENSE A2](https://github.com/SkyworkAI/SkyReels-A2/blob/main/LICENSE.txt), [HF A2](https://huggingface.co/Skywork/SkyReels-A2)
  - Pack ComfyUI-SkyReels-A2 (Yuan-ManX) : MIT, dernier commit le 27/05/2025 — [ComfyUI-SkyReels-A2](https://github.com/Yuan-ManX/ComfyUI-SkyReels-A2)
  - A2 ne prend pas d'audio.
- **SkyReels-A3** : annoncé le 11/08/2025 comme modèle de vidéos d'humains numériques pilotés par l'audio, de toute durée, proposé dans l'outil Talking Avatar du site SkyReels — [Sina Finance, 11/08/2025](https://finance.sina.cn/2025-08-11/detail-infkqmzi9886253.d.html). `github.com/SkyworkAI/SkyReels-A3` n'est pas accessible publiquement (git ls-remote refusé le 16/10/2026).
- **SkyReels-V3, pour comparaison** :
  - modèle « Talking Avatar » 19B-720P (`Skywork/SkyReels-V3-A2V-19B`), audio ≤ 200 s, « Currently supports one audio track », 720p à 24 i/s ;
  - le README revendique « Supports multiple languages » et « Compatible with real-life, cartoon, animal, and stylized characters » ;
  - option `--low_vram` (poids FP8 et délestage par blocs) pour moins de 24 Go, résolutions 540P et 480P ; formats 9:16 annoncés pour le modèle Reference-to-Video ;
  - dernier commit le 30/01/2026 ;
  - sources : [README V3](https://github.com/SkyworkAI/SkyReels-V3).
  - Licence de la fiche HF : `other` (Skywork Community License) ; encodeur audio `chinese-wav2vec2-base` embarqué — [HF V3-A2V-19B](https://huggingface.co/Skywork/SkyReels-V3-A2V-19B), [LICENSE V3-A2V](https://huggingface.co/Skywork/SkyReels-V3-A2V-19B/blob/main/LICENSE)
  - Un nœud `WanVideoImageToVideoSkyreelsv3_audio` existe dans ComfyUI-WanVideoWrapper — [InstaSD, liste des nœuds](https://www.instasd.com/comfyui/custom-nodes/comfyui-wanvideowrapper/wanvideoimagetovideoskyreelsv3_audio)

### Inferences
- A1 cumule quatre blocages (licence Skywork révocable et hors règle, CogVideoX à inscription et plafond, FLAME et InsightFace non commerciaux, DiffPoseTalk sans licence), auxquels s'ajoutent un seul visage par passe et du 480×720 paysage → **rejet**.
- Sur T4, A1 cumule bf16 non pris en charge et besoin de mémoire supérieur à 16 Go (environ 18 Go mesurés par un utilisateur sur A100) → non exploitable sans greffe, et sans intérêt vu la licence.
- V3 A2V-19B est le seul de la famille Skywork qui revendique le cartoon, le multilingue et 200 s d'audio. Sa licence Skywork (commerciale mais révocable, obligation d'étiquetage) **viole notre règle MIT/Apache/BSD** → rejet. À citer seulement comme référence de qualité à dépasser.

### Gaps
- Aucun temps d'inférence publié pour A1 (papier ni README). Comportement de DiffPoseTalk (HuBERT) sur une voix française non documenté.
- Aucune information technique publique sur A3 (pas de papier ni de poids trouvés).

---

## 4. MuseV (TMElyralab/MuseV) : génération vidéo de « virtual human » de longueur infinie

### Takeaway
MuseV fait du texte, de l'image ou de la vidéo vers vidéo, sur SD 1.5 avec ReferenceNet, IP-Adapter et ControlNet de pose. Il ne prend **pas d'audio** (le lip-sync est délégué à MuseTalk). Le code est sous MIT, mais **les modèles entraînés sont non commerciaux** (README), et le projet est abandonné depuis mai 2024. **Verdict : rejet.**

### Cited Findings
- **Licence** : « `code`: … MIT License. There is no limitation for both academic and commercial usage. `model`: The trained model are available for non-commercial research purposes only. `other opensource model`… such as `insightface`, `IP-Adapter`, `ft-mse-vae` » — [README MuseV](https://github.com/TMElyralab/MuseV), [LICENSE MuseV](https://github.com/TMElyralab/MuseV/blob/main/LICENSE)
- **Contradiction** : la fiche HF `TMElyralab/MuseV` affiche `creativeml-openrail-m` et redistribue `buffalo_l` (InsightFace), `ip-adapter-faceid_sd15.bin`, des embeddings négatifs et `lcm-lora-sdv1-5` — [HF MuseV](https://huggingface.co/TMElyralab/MuseV). Les modèles InsightFace sont « for non-commercial research only » — [InsightFace](https://github.com/deepinsight/insightface/blob/master/python-package/README.md)
- **Technique** :
  - entraîné sur environ 60K paires texte-vidéo humaines en 512×320 ;
  - VRAM ≈ 8 Go (`musev`, module de mouvement seul) et ≈ 12 Go (`musev_referencenet`), mesurés à 512×512 avec `time_size=12` ;
  - débruitage parallèle conditionné visuellement pour la longueur « infinie », « only suitable for relatively fixed camera scenes » ;
  - modèles t2i de base : checkpoints communautaires SD 1.5 (`majicmixRealv6Fp16`, `fantasticmix_v10`) ;
  - source : [README MuseV](https://github.com/TMElyralab/MuseV)
- **Maintenance** : dernier commit le 29/05/2024 (git log)
- **ComfyUI** :
  - `chaojie/ComfyUI-MuseV` : MIT, dernier commit le 04/04/2024 — [ComfyUI-MuseV](https://github.com/chaojie/ComfyUI-MuseV)
  - `storyicon/comfyui_musev_evolved` : aucun fichier LICENSE à la racine (404), dernier commit le 23/05/2024 — [comfyui_musev_evolved](https://github.com/storyicon/comfyui_musev_evolved)
  - les deux figurent dans [ComfyUI-Manager](https://github.com/Comfy-Org/ComfyUI-Manager/blob/main/custom-node-list.json)
- **Démos** : `AnchorFake/MuseVDemo` et `anchorxia/MuseVDemo` sont à l'état **RUNTIME_ERROR** (API HF, 16/10/2026) — [Space AnchorFake](https://huggingface.co/spaces/AnchorFake/MuseVDemo), [Space anchorxia](https://huggingface.co/spaces/anchorxia/MuseVDemo)

### Inferences
- Poids non commerciaux, pas d'audio, base SD 1.5 sous OpenRAIL-M et checkpoints communautaires de licence non vérifiée, aucun entretien depuis 2024 → **rejet**. Il n'apporte rien que nos moteurs vidéo actuels ne couvrent pas.

### Gaps
- Aucun temps de génération publié. Aucune preuve sur des personnages 3D cartoon, même si les exemples du README incluent des prompts de style anime (« 1girl »).

---

## 5. MagicDance / MagicPose (Boese0601/MagicDance) : transfert de pose et d'expression 2D

### Takeaway
MagicPose (ICML 2024) retransfère la **pose du corps et l'expression faciale** d'une séquence OpenPose sur une image de référence, avec SD 1.5 et ControlNet. Il ne prend **pas d'audio**. Le code est sous **licence de recherche USC** (usage commercial seulement sur accord), l'annotateur OpenPose embarqué est **CMU non commercial** et la licence des poids est floue (« cc »). **Verdict : rejet.**

### Cited Findings
- **Licence du code** : « Permission to use, copy, modify, and distribute this software… for educational, research and non-profit purposes… Permission to make commercial use… may be obtained by contacting USC Stevens Center » — [LICENSE.txt MagicDance](https://github.com/Boese0601/MagicDance/blob/main/LICENSE.txt)
- **Annotateur OpenPose embarqué** : « ACADEMIC OR NON-PROFIT ORGANIZATION NONCOMMERCIAL RESEARCH USE ONLY » (CMU) — [LICENSE OpenPose dans MagicDance](https://github.com/Boese0601/MagicDance/blob/main/model_lib/ControlNet/annotator/openpose/LICENSE)
- **Poids** : la fiche HF `Boese0601/MagicDance` indique `license: cc` sans variante. Fichiers : `control_sd15_ini.ckpt`, `control_v11p_sd15_openpose.pth`, `model_state-110000.th` — [HF MagicDance](https://huggingface.co/Boese0601/MagicDance)
- **Méthode** : « diffusion-based model for 2D human pose and facial expression retargeting… generalizes well to unseen human identities and complex poses without the need for additional fine-tuning… plug-in module/extension to Stable Diffusion » (ICML 2024). Le texte de l'abstract ne mentionne pas le stylisé — [arXiv 2311.12052](https://arxiv.org/abs/2311.12052)
- **Données et stylisé** : entraînement et tests sur TikTok ; le README montre des « interesting outputs from out-of-domain images » sans préciser leur style — [README MagicDance](https://github.com/Boese0601/MagicDance)
- **Maintenance** : dernier commit le 02/07/2024 (git log)
- **ComfyUI** : `bombax-xiaoice/ComfyUI-MagicDance`, enveloppe sous Apache-2.0 accompagnée de `LICENSE_MAGICDANCE`, dernier commit le 26/12/2024. Le README indique « Verified to work on a single NVidia RTX 3070 card with 8G graphics memory » et une seule image de référence par génération — [ComfyUI-MagicDance](https://github.com/bombax-xiaoice/ComfyUI-MagicDance)
- **Démo** : aucun Space HF trouvé par l'API de recherche (16/10/2026).

### Inferences
- Licence USC de recherche, OpenPose CMU non commercial et poids flous : trois blocages → **rejet**. Sur le plan technique, l'outil serait réalisable sur T4 (8 Go suffisent selon l'enveloppe ComfyUI) mais n'apporte rien pour les lèvres.

### Gaps
- Pas de résolution, de fps ni de temps par seconde publiés pour l'inférence. Aucune preuve sur des personnages 3D cartoon ou à plusieurs.

---

## 6. V-Express (tencent-ailab/V-Express) : portrait parlant piloté par l'audio et des points-clés

### Takeaway
V-Express produit une **tête parlante** (visage recadré en 512×512) pilotée par l'audio (wav2vec2 anglais) et trois points-clés V-kps. C'est le seul outil de la liste avec un **chiffre de temps mesuré** : **31 s d'audio → 2 617,4 s de calcul et 7 956 MiB de pic sur V100**. Mais **aucun fichier LICENSE**, des checkpoints « for research purposes only » et InsightFace `buffalo_l` intégré. **Verdict : rejet.**

### Cited Findings
- **Licence** :
  - le dépôt GitHub n'a **pas de fichier LICENSE** (arbre git : README, requirements, configs seulement) ;
  - le README (ligne 228) dit : « The code of V-Express is released for both academic and commercial usage. However, both manual-downloading and auto-downloading models from V-Express are for non-commercial research purposes. Our released checkpoints are also for research purposes only » — [README V-Express](https://github.com/tencent-ailab/V-Express)
  - un mainteneur (issue #3, 28/05/2024) : « The model depends on some modules which cannot be used for commercial purposes… We may replace these modules further, but cannot provide an estimated timeline » ; la question de suivi est restée sans réponse — [issue #3](https://github.com/tencent-ailab/V-Express/issues/3)
- **Poids** : la fiche HF `tk93/V-Express` n'a **aucune métadonnée de licence**. Elle redistribue `insightface_models/buffalo_l` (2d106det, det_10g, genderage, w600k_r50), `wav2vec2-base-960h` (`apache-2.0`), `sd-vae-ft-mse` (MIT) et la configuration du U-Net SD 1.5 — [HF tk93/V-Express](https://huggingface.co/tk93/V-Express), [HF wav2vec2-base-960h](https://huggingface.co/facebook/wav2vec2-base-960h)
- **Technique** :
  - SD v1.5, visages recadrés en 512×512, segments de 12 images avec 4 de recouvrement ;
  - entraînement sur HDTF, VFHQ et autres (environ 300 h) ;
  - « performs better with English » à cause de l'encodeur Wav2Vec2 ;
  - génération lente (autorégressive) ;
  - source : [arXiv 2406.02511](https://arxiv.org/html/2406.02511)
  - le README précise : « our model now performs better on English, and other languages have n[ot]… » — [README](https://github.com/tencent-ailab/V-Express)
- **Matériel et temps** :
  - « For a 31-second audio, it requires a peak memory of 7956MiB in a V100 test environment, with a total processing time of 2617.4 seconds » — [README](https://github.com/tencent-ailab/V-Express)
  - un collaborateur : le script d'exemple « requires 9873M GPU memory » sur V100 ;
  - un utilisateur : fonctionne sur RTX 4060 8 Go ;
  - source : [issue #17](https://github.com/tencent-ailab/V-Express/issues/17)
- **Stylisé et multi-personnes** : non mentionnés dans le papier ; une seule face recadrée par passe — [arXiv](https://arxiv.org/html/2406.02511)
- **Maintenance** : dernier commit le 24/01/2025 (fusion de la PR #61) (git log)
- **ComfyUI** :
  - `tiankuan93/ComfyUI-V-Express` (auteur collaborateur du dépôt officiel) : **aucun fichier LICENSE**, dernier commit le 26/06/2024 — [ComfyUI-V-Express](https://github.com/tiankuan93/ComfyUI-V-Express)
  - `AIFSH/ComfyUI_V-Express` : son `LICENSE.md` recopie la clause « research purposes only », dernier commit le 23/06/2024 — [ComfyUI_V-Express](https://github.com/AIFSH/ComfyUI_V-Express)
  - les deux sont listés dans [ComfyUI-Manager](https://github.com/Comfy-Org/ComfyUI-Manager/blob/main/custom-node-list.json)

### Inferences
- 2 617,4 s pour 31 s, soit environ **84 s de calcul par seconde de vidéo sur V100** (calcul à partir du README). Pour un film de 60 s, cela donnerait environ 1 h 24 de calcul pour un seul visage, contraire à la consigne « un film d'une minute en minutes ».
- Checkpoints de recherche, absence de licence pour le code, InsightFace, faiblesse hors de l'anglais → **rejet**.

### Gaps
- Aucune mesure publiée sur T4. Aucune preuve sur des visages cartoon.

---

## 7. EMO, Emote Portrait Alive (HumanAIGC/EMO) : le code ou les poids sont-ils publiés ?

### Takeaway
**Non.** Au 16/10/2026, le dépôt ne contient qu'un `README.md` (titre, liens, BibTeX). Le dernier commit date du 21/08/2024 et la page projet précise « intended solely for academic research and effect demonstration ». Les démos sont très convaincantes sur des peintures, des modèles 3D et des personnages de jeu, en plusieurs langues. **Verdict : rejet** (indisponible).

### Cited Findings
- **Contenu du dépôt** : l'arbre git ne contient qu'un fichier, `README.md` ; dernier commit le 21/08/2024 (« Update README.md »). Le README ne donne que le titre, les auteurs (Alibaba, Institute for Intelligent Computing), ECCV 2024 et la citation — [HumanAIGC/EMO](https://github.com/HumanAIGC/EMO)
- **Page projet** : EMO génère des « vocal avatar videos with expressive facial expressions, and various head poses ». Il peut animer « portraits from bygone eras, paintings, and both 3D models and AI generated content ». Les démos sont en mandarin, japonais, cantonais, coréen et anglais, avec une durée « any duration depending on the length of input ». La page dit « This project is intended solely for academic research and effect demonstration » et ne parle pas de plusieurs personnes — [page projet EMO](https://humanaigc.github.io/emote-portrait-alive/)
- **Papier** : [arXiv 2402.17485](https://arxiv.org/abs/2402.17485)
- **Spaces communautaires** : le Space `CrystalGPT/EMO_EmotePortraitAlive` affiche une erreur d'exécution avec un `app.py` vide (résultat de recherche) — [Space CrystalGPT](https://huggingface.co/spaces/CrystalGPT/EMO_EmotePortraitAlive/tree/main). Un marché Manifold sur une publication avant fin 2024 a été résolu « NO » — [Manifold](https://manifold.markets/Lion/will-emote-portrait-alive-by-alibab)
- **ComfyUI** : aucun pack (aucun modèle à charger).

### Inferences
- Rien à exécuter, donc rien à greffer. EMO ne sert que de **référence visuelle** (expressivité sur des visages 3D et peints) pour notre grille de mesure.

### Gaps
- Aucune trace d'une publication ultérieure des poids, même sous un autre nom ; aucune source trouvée.

---

## 8. JoyVASA (jdh-algo/JoyVASA) : mouvement du visage et de la tête par diffusion audio, rendu LivePortrait

### Takeaway
Seul outil de la liste dont le **code (MIT)** et les **poids (MIT)** sont libres. Il génère, à partir de l'audio, une **séquence de mouvement indépendante de l'identité** (expressions et pose de la tête). Ce mouvement est rendu par **LivePortrait** (code et poids sous MIT), recadré puis recollé dans l'image. Le papier revendique l'anime et l'art. Il reste trois blocages, tous greffables :
- le détecteur **InsightFace** `buffalo_l`, non commercial, à remplacer ;
- l'encodeur audio publié, **chinese-hubert** seul (la version wav2vec2 n'est toujours pas sortie en avril 2026) ;
- aucun mouvement du corps ni geste.

**Verdict : couche visage candidate** (lèvres et tête), **pas moteur principal**, sous réserve des greffes ci-dessous.

### Cited Findings
- **Licence du code** : MIT (« Copyright (c) 2024 xuyangcao ») — [LICENSE JoyVASA](https://github.com/jdh-algo/JoyVASA/blob/main/LICENSE)
- **Licence des poids** : la fiche HF `jdh-algo/JoyVASA` indique `license: mit`. Fichiers : `motion_generator/motion_generator_hubert_chinese.pt`, `motion_template/motion_template.pkl` (812 téléchargements, modifiée le 13/01/2025) — [HF JoyVASA](https://huggingface.co/jdh-algo/JoyVASA)
- **Dépendances et leurs licences** :
  - LivePortrait : code MIT et fiche HF `mit`. Son README avertit : « The models of InsightFace are for non-commercial research purposes only. If you want to use the LivePortrait project for commercial purposes, you should remove and replace InsightFace's detection models » — [LICENSE LivePortrait](https://github.com/KwaiVGI/LivePortrait/blob/main/LICENSE), [HF LivePortrait](https://huggingface.co/KwaiVGI/LivePortrait)
  - JoyVASA place `insightface/models/buffalo_l/2d106det.onnx` et `det_10g.onnx` dans `pretrained_weights` — [README JoyVASA](https://github.com/jdh-algo/JoyVASA)
  - encodeur audio `TencentGameMate/chinese-hubert-base` : `mit` — [HF chinese-hubert-base](https://huggingface.co/TencentGameMate/chinese-hubert-base)
  - `wav2vec2-base-960h` : `apache-2.0`, mais le modèle de mouvement correspondant n'est pas publié — [HF](https://huggingface.co/facebook/wav2vec2-base-960h)
  - mode animal : X-Pose, sous licence IDEA non commerciale. Optionnel et inutile pour des humains — [LICENSE X-Pose](https://github.com/IDEA-Research/X-Pose/blob/master/LICENSE.txt)
- **Pipeline** : apparence 3D et points-clés extraits par LivePortrait ; le DiT génère le mouvement « directly from audio cues, independent of character identity » ; le générateur LivePortrait rend le résultat. Entraînement sur « a hybrid dataset of private Chinese and public English data, enabling multilingual support » — [README](https://github.com/jdh-algo/JoyVASA), [arXiv 2411.09209](https://arxiv.org/html/2411.09209)
- **Stylisé** : le papier dit que le modèle « can drive any portrait, including people, anime, portraits with artwork, and even animals » (Fig. 4). Ce sont des affirmations qualitatives : les expériences portent sur des jeux de données de visages humains — [arXiv](https://arxiv.org/html/2411.09209)
- **Limites reconnues** : qualité plafonnée par le premier étage ; LivePortrait « exhibits suboptimal performance when handling large pose variations » ; pas de multi-personnes ; travail futur sur le temps réel — [arXiv](https://arxiv.org/html/2411.09209)
- **Format** : visage recadré, généré puis recollé. Pour d'autres proportions, « 在config里改一下crop和paste_back应该就行 » (« il suffit de modifier crop et paste_back dans la configuration », réponse d'un utilisateur du 09/07/2025) — [issue #52](https://github.com/jdh-algo/JoyVASA/issues/52)
- **Matériel** : testé sur A100 (Ubuntu) et sur **RTX 4060 Laptop 8 Go** (Windows 11) — [README](https://github.com/jdh-algo/JoyVASA). Aucun temps d'inférence publié (le papier ne nomme que l'A800 d'entraînement) — [arXiv](https://arxiv.org/html/2411.09209)
- **Encodeur multilingue** : l'issue #59 (15/04/2026) reprend la phrase du README « The motion generation model with wav2vec2 encoder will be supported later », sans réponse — [issue #59](https://github.com/jdh-algo/JoyVASA/issues/59)
- **Qualité signalée par les utilisateurs** : bouches d'animaux étranges (#49), yeux grands ouverts (#47), mouvement presque identique d'une image à l'autre (#46). Un modèle réentraîné a 70 dimensions au lieu de 73 et une qualité moindre (#60, 25/04/2026) — [issues JoyVASA](https://github.com/jdh-algo/JoyVASA/issues)
- **Maintenance** :
  - dernier commit le 16/04/2026 (retouche du README) ;
  - 09/12/2025 : « fix bug in position encoding » ;
  - 13/01/2025 : « add training scripts » et « add silence audio frame before animation » ;
  - source : git log de [JoyVASA](https://github.com/jdh-algo/JoyVASA)
- **Démo** : le Space officiel `jdh-algo/JoyVASA` est à l'état **NO_APP_FILE** (API HF, 16/10/2026) — [Space JoyVASA](https://huggingface.co/spaces/jdh-algo/JoyVASA)
- **ComfyUI** : aucun pack JoyVASA dans `custom-node-list.json` ; aucune recherche web n'en a trouvé — [ComfyUI-Manager](https://github.com/Comfy-Org/ComfyUI-Manager/blob/main/custom-node-list.json)

### Inferences
- **Chaîne de licences presque propre** : JoyVASA (MIT), LivePortrait (MIT), chinese-hubert (MIT) et wav2vec2 (Apache-2.0) passent. Le seul blocage pour un humain est le détecteur InsightFace. **Greffe** : le remplacer par MediaPipe (dépôt sous Apache-2.0, [LICENSE MediaPipe](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE)) pour la détection et les 106 points, puis vérifier que le recadrage et le recollage LivePortrait restent stables. Critère : écart moyen de position de la boîte du visage entre détecteurs inférieur ou égal à 2 % de sa largeur, sur nos 10 personnages de la troupe.
- **Greffe « JoyVASA-FR »** : les scripts d'entraînement sont publiés (MIT). On réentraîne le générateur de mouvement avec un encodeur adapté au français sous Apache-2.0 :
  - [facebook/wav2vec2-xls-r-300m](https://huggingface.co/facebook/wav2vec2-xls-r-300m) (`apache-2.0`) ;
  - ou [jonatasgrosman/wav2vec2-large-xlsr-53-french](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-french) (`apache-2.0`) ;
  - mais **pas** `facebook/mms-300m`, qui est sous `cc-by-nc-4.0` ([HF MMS](https://huggingface.co/facebook/mms-300m)).

  Critère d'acceptation : sur 10 répliques françaises de la troupe, la synchro lèvres-phonèmes mesurée par nos outils (`mesure2.py`) est meilleure qu'avec `hubert_chinese`. Attention aux issues #60 et #35 : la dimension du mouvement (70 contre 73) doit rester celle du modèle publié.
- **Plusieurs personnages à table** : JoyVASA travaille sur un visage recadré puis recollé, ce qui convient à un **traitement personnage par personnage**. On recadre chaque tête, on anime le locuteur avec sa piste de voix et les autres avec une piste « silence » (le commit du 13/01/2025 ajoute justement une trame de silence avant l'animation), puis on recolle tout sur l'image de table. Critère : aucune couture visible au recollage (SSIM de la couronne ≥ 0,98) et aucun décalage d'identité entre plans, mesuré par une similarité d'embedding sous licence libre plutôt que par ArcFace/InsightFace (non commercial).
- **Rôle dans le moteur** : couche visage (lèvres et tête) à combiner avec une couche corps et gestes venue d'un autre outil, puis à mesurer. Les candidats pour cette couche sont couverts par d'autres chercheurs (UniAnimate, MimicMotion, StableAnimator, Champ pour la pose ; MultiTalk et InfiniteTalk pour l'audio multi-personnes ; EchoMimic et Hallo pour les portraits).
- **T4** : 8 Go suffisent selon le README (RTX 4060 Laptop). Le modèle tient donc sur un T4 16 Go ; la vitesse reste à mesurer.

### Gaps
- Aucun temps par seconde de vidéo publié, sur aucun GPU. Aucune mesure publiée sur des visages 3D cartoon, ni sur une voix française.
- Pas de nœud ComfyUI : il faudra l'écrire. Notre propre enveloppe ComfyUI sera mesurée (temps, VRAM) sur T4.

---

## 9. Synthèse : quel rôle pour chaque outil dans le moteur MASSAMBA ?

### Takeaway
Sur les huit outils, **un seul est exploitable sous notre règle** : **JoyVASA**, comme **couche visage** (lèvres et tête), après deux greffes (détecteur sous Apache-2.0, encodeur audio français sous Apache-2.0). Les sept autres sont **rejetés** :
- MIMO : SMPL et dépendances non commerciales ;
- Hyper-Motion : CC BY-NC-SA ;
- SkyReels-A1, A2 et V3 : licence Skywork, CogVideoX, FLAME et InsightFace ;
- MuseV : poids non commerciaux ;
- MagicDance : licence USC et OpenPose CMU ;
- V-Express : checkpoints de recherche, InsightFace, environ 84 s de calcul par seconde de vidéo ;
- EMO : non publié.

Aucun ne gère nativement deux personnages dans la même image.

### Cited Findings
| Outil | Licence code | Licence poids (et dépendances bloquantes) | Signal | Couverture | Format natif | VRAM et temps (source) | ComfyUI (dernier commit) | Dernier commit | Démo au 16/10/2026 | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| MIMO | Apache-2.0 ([LICENSE](https://github.com/menyifang/MIMO/blob/main/LICENSE)) | Apache-2.0 ([HF](https://huggingface.co/menyifang/MIMO)) ; SD 1.5 OpenRAIL-M ; SMPL, MANO, ProPainter, DA-V2-L non commerciaux ([HF VidDecomp](https://huggingface.co/menyifang/MIMO_VidDecomp)) | pose 3D SMPL, vidéo | corps entier, sans lèvres | non publié | A100, L20 testés, aucun chiffre ([README](https://github.com/menyifang/MIMO)) | aucun | 19/06/2025 | ModelScope annoncée (non vérifiée) | Rejet ; idée de décomposition à réécrire |
| Hyper-Motion | CC BY-NC-SA 4.0 (README) ; LICENSE.txt contient l'URL Apache | CC BY-NC-SA 4.0 ([HF](https://huggingface.co/shuolin/HyperMotion)) ; X-Pose et Motion-X non commerciaux | vidéo de pose 2D | corps entier | 576×1024 portrait, 49 images, 16 i/s ([inference.py](https://github.com/vivoCameraResearch/Hyper-Motion/blob/main/scripts/inference.py)) | < 24 Go, « même 16 Go », RTX 4090 ([README](https://github.com/vivoCameraResearch/Hyper-Motion)) ; aucun temps | aucun | 27/05/2026 | aucune | Rejet |
| SkyReels-A1 | Skywork Community (dépôt) contre apache-2.0 (HF) | CogVideoX License (inscription, ≤ 1 M visites par mois) ; FLAME et InsightFace non commerciaux ; DiffPoseTalk sans licence | vidéo ou audio (DiffPoseTalk) | visage, tête, un peu de corps | 480×720, 49 images, 12 i/s ([inference_audio.py](https://github.com/SkyworkAI/SkyReels-A1/blob/main/inference_audio.py)) | environ 18 Go sur A100 40 Go ; OOM sur 24 Go ([issue #2](https://github.com/SkyworkAI/SkyReels-A1/issues/2)) | aucun (TODO non coché) | 05/06/2025 | CONFIG_ERROR | Rejet |
| SkyReels-V3 A2V (comparaison) | Skywork Community | `other` (Skywork) ([HF](https://huggingface.co/Skywork/SkyReels-V3-A2V-19B)) | audio ≤ 200 s, une seule piste | portrait, cartoon revendiqué | 720p à 24 i/s ; `--low_vram` sous 24 Go ([README](https://github.com/SkyworkAI/SkyReels-V3)) | aucun temps | nœud dans WanVideoWrapper ([InstaSD](https://www.instasd.com/comfyui/custom-nodes/comfyui-wanvideowrapper/wanvideoimagetovideoskyreelsv3_audio)) | 30/01/2026 | non vérifiée | Rejet (licence hors règle) |
| MuseV | MIT | « non-commercial research purposes only » ([README](https://github.com/TMElyralab/MuseV)) contre OpenRAIL-M (HF) ; InsightFace | texte, image, vidéo, pose | demi-corps ou corps, sans lèvres | entraîné en 512×320 | ≈ 8 à 12 Go à 512×512 ([README](https://github.com/TMElyralab/MuseV)) | chaojie (MIT, 04/04/2024) ; storyicon (sans LICENSE, 23/05/2024) | 29/05/2024 | RUNTIME_ERROR | Rejet |
| MagicDance | USC, recherche seulement | `cc` non précisé ([HF](https://huggingface.co/Boese0601/MagicDance)) ; OpenPose CMU non commercial | séquence OpenPose | corps et expression 2D | non publié | RTX 3070 8 Go (enveloppe ComfyUI) | bombax-xiaoice (Apache-2.0, 26/12/2024) | 02/07/2024 | aucune | Rejet |
| V-Express | aucun fichier LICENSE ; README : code commercial possible | « research purposes only » ; InsightFace `buffalo_l` | audio et V-kps | tête parlante | 512×512 | 31 s → 2 617,4 s et 7 956 MiB sur V100 ([README](https://github.com/tencent-ailab/V-Express)) | tiankuan93 (sans LICENSE, 26/06/2024) ; AIFSH (23/06/2024) | 24/01/2025 | non vérifiée | Rejet |
| EMO | aucun code | aucun poids | (audio) | (tête) | n/d | n/d | aucun | 21/08/2024 | aucune officielle | Rejet (non publié) |
| JoyVASA | MIT | MIT ; LivePortrait MIT ; hubert-chinese MIT ; **InsightFace à remplacer** | audio (hubert chinois) | visage et tête, recadrage puis recollage | 512 recadré, recollage configurable ([#52](https://github.com/jdh-algo/JoyVASA/issues/52)) | RTX 4060 Laptop 8 Go testé ; aucun temps ([README](https://github.com/jdh-algo/JoyVASA)) | aucun | 16/04/2026 | NO_APP_FILE | **Couche visage après greffe** |

- Liste des packs ComfyUI vérifiée dans `custom-node-list.json` le 16/10/2026 : seuls MuseV (deux packs), V-Express (deux packs), MagicDance et SkyReels-A2 y figurent — [ComfyUI-Manager](https://github.com/Comfy-Org/ComfyUI-Manager/blob/main/custom-node-list.json)
- InsightFace (présent dans SkyReels-A1, MuseV, V-Express et JoyVASA via LivePortrait) : « The training data containing the annotation (and the models trained with these data) are available for non-commercial research purposes only » — [README InsightFace](https://github.com/deepinsight/insightface)

### Inferences
- **Plan de greffe proposé (innovation, au-delà des références)** : une **« tablée en couches »** qui combine trois idées.
  1. La **décomposition spatiale de MIMO**, réécrite avec SAM 2 (Apache-2.0) et Depth-Anything-V2-Small (Apache-2.0), découpe l'image de table en un calque par personnage, plus le décor et les occultations (verres, mains sur la table).
  2. **JoyVASA-FR**, avec un encodeur XLS-R sous Apache-2.0 et un détecteur MediaPipe, anime chaque tête à partir de **sa** piste de voix française ; les personnages qui écoutent reçoivent une piste silence.
  3. Une couche corps et gestes, issue du meilleur outil sous licence propre retenu par les autres chercheurs, anime les épaules et les mains. Le tout est recomposé par profondeur.

  Aucune des références lues ne gère plusieurs locuteurs dans la même image. Le gain attendu est un rendu multi-personnages sans modèle multi-personnes.

  Critères d'acceptation :
  - aucune couture visible ;
  - identité stable ;
  - synchro labiale FR meilleure que la référence `hubert_chinese` ;
  - temps de calcul total inférieur ou égal à la durée du film multipliée par un facteur fixé après une première mesure sur T4, sans chiffre inventé à ce stade.
- La couche visage (environ 8 Go selon le README JoyVASA) peut tourner sur le T4 Kaggle. Pour les outils DiT 14B et plus (Hyper-Motion, SkyReels-V3), le T4 impose le fp16 (pas de bf16) et du délestage. Ce point est sans objet ici puisqu'ils sont rejetés pour licence.

### Gaps
- Aucun des huit outils ne publie de temps par seconde de vidéo sur T4. Le seul chiffre de temps vérifiable est celui de V-Express sur V100.
- Aucune preuve chiffrée de qualité sur des personnages **3D cartoon africains** pour aucun outil : seules existent des affirmations qualitatives (MIMO, JoyVASA, EMO, SkyReels-V3). Il faut une mesure maison sur nos personnages.
- La qualité de JoyVASA sur la voix française, avec l'encodeur chinois publié ou après réentraînement, n'est pas documentée.
- L'état de la démo ModelScope de MIMO et des Spaces V-Express n'a pas été vérifié.
- Le registre `references/registre_innovations.md` du skill `methode-veille-creation` n'a pas été modifié, conformément à la consigne « do not edit .claude/skills files ». Les innovations ci-dessus sont à y reporter par le coordinateur.
