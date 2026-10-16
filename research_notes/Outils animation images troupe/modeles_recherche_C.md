# Lot C : DynamiCrafter, SEINE, VideoCrafter 1/2, Open-Sora 1.x/2.0, ImaGINator, VTG. Peuvent-ils animer nos images de la troupe ? (fiches au 16/10/2026)

Contexte d'évaluation : images fixes générées en style 3D cartoon « type Pixar » avec 2 ou 3 personnages africains (cour, restaurant en plein air). Il s'agit de sketchs dialogués en français d'une minute pour TikTok (9:16), découpés en plans de 2 à 4 s. Le personnage qui parle doit bouger naturellement (tête, buste, bras, articulations, lèvres), sans déformation, en gardant son identité et le style. Volume visé : environ 1 000 vidéos, sans abonnement ni paiement à la génération. Règle maison : seuls les modèles et le code sous MIT, Apache-2.0 ou BSD peuvent être exécutés chez nous.

Méthode et provenance : les fichiers LICENSE, README et configurations ont été lus directement sur les dépôts. Les dates de commit viennent d'un clone git partiel (`--filter=blob:none`) fait le 16/10/2026. Les métadonnées Hugging Face (cartes, état des Spaces) viennent de l'API publique `huggingface.co/api/...` et ont été relevées le 16/10/2026. Les scores VBench ont été extraits le 16/10/2026 de la configuration en ligne du Space officiel `Vchitect/VBench_Leaderboard`. L'accès à l'API GitHub était refusé dans cette session, mais `git clone` et `raw.githubusercontent.com` fonctionnaient.

---

## 1. Licences : code (fichier LICENSE exact), poids (carte de modèle exacte), modèles de base, usage commercial des sorties

### Takeaway
Les sept projets ont presque tous un code sous Apache-2.0 ou MIT. Les poids, eux, sont flous ou contaminés par une base sous licence restrictive : SD 1.4 ou 2.1 (OpenRAIL), PixArt-Σ (openrail), et surtout FLUX.1 [dev] (non commercial) pour Open-Sora 2.0. DynamiCrafter a retiré en mars 2024 sa clause « recherche seulement », mais les nœuds ComfyUI copiés avant cette date la portent encore. VTG n'a publié aucun code.

### Cited Findings

**DynamiCrafter (Doubiiu, CUHK et Tencent AI Lab)**
- Le fichier LICENSE actuel du dépôt est un Apache License 2.0 complet, terminé par « Copyright Tencent », sans clause additionnelle — [LICENSE GitHub](https://github.com/Doubiiu/DynamiCrafter/blob/main/LICENSE)
- Historique de la licence : la version du 27/11/2023 contenait une clause « 10. This code is provided for research purposes only and is not to be used for any commercial purposes… Any use of this code for commercial purposes… is strictly prohibited ». Elle a été retirée le 17/03/2024 par le commit « modify license and add interp hf demo » — [LICENSE du 27/11/2023](https://github.com/Doubiiu/DynamiCrafter/blob/c744acf1a5e7fa775f7ee0bcd0cae242d2afb366/LICENSE) ; [commit 3c81e6f](https://github.com/Doubiiu/DynamiCrafter/commit/3c81e6f7a94081c58656daca4e9f0b79faa00b6c)
- Poids : les dépôts HF `Doubiiu/DynamiCrafter_1024`, `_512`, `_512_Interp` et `DynamiCrafter` contiennent chacun un fichier LICENSE Apache-2.0 « Copyright Tencent » identique à celui du code. Les métadonnées de la carte ne déclarent aucune licence (`{}`) — [carte HF DynamiCrafter_1024](https://huggingface.co/Doubiiu/DynamiCrafter_1024) ; [LICENSE HF](https://huggingface.co/Doubiiu/DynamiCrafter_1024/blob/main/LICENSE)
- La carte HF contient une phrase mise en commentaire HTML, donc non affichée : « We develop this repository for RESEARCH purposes, so it can only be used for personal/research/non-commercial purposes. » — [README brut de la carte HF](https://huggingface.co/Doubiiu/DynamiCrafter_1024/raw/main/README.md)
- Avertissement du README : « Users are granted the freedom to create videos using this tool, but they are expected to comply with local laws… » — [README GitHub](https://github.com/Doubiiu/DynamiCrafter)
- Lignée : le README de VideoCrafter présente le checkpoint `DynamiCrafter_1024` comme le modèle I2V « VideoCrafter1 640x1024 » — [README VideoCrafter](https://github.com/AILab-CVC/VideoCrafter). Le modèle T2V de VideoCrafter1 « builds upon SD 2.1 by incorporating temporal attention layers » — [arXiv 2310.19512](https://arxiv.org/abs/2310.19512)
- Encodeurs texte et image : OpenCLIP `ViT-H-14`, version `laion2b_s32b_b79k` (valeurs par défaut dans le code) — [condition.py](https://github.com/Doubiiu/DynamiCrafter/blob/main/lvdm/modules/encoders/condition.py). Ces poids sont sous licence MIT sur HF — [laion/CLIP-ViT-H-14-laion2B-s32B-b79K](https://huggingface.co/laion/CLIP-ViT-H-14-laion2B-s32B-b79K)
- SD 2.1 est sous « openrail++ » d'après le miroir communautaire `sd2-community/stable-diffusion-2-1`. Le dépôt officiel `stabilityai/stable-diffusion-2-1` ne répondait pas à l'API publique le 16/10/2026 — [miroir sd2-community](https://huggingface.co/sd2-community/stable-diffusion-2-1)

**ToonCrafter (dérivé « cartoon » de DynamiCrafter, cité ici pour l'usage de niche)**
- Code sous Apache-2.0 « Copyright Tencent », sans clause « recherche seulement » — [LICENSE ToonCrafter](https://github.com/Doubiiu/ToonCrafter/blob/main/LICENSE). Avertissement du README : « This is an open-source research exploration, instead of commercial products » — [README ToonCrafter](https://github.com/Doubiiu/ToonCrafter)

**VideoCrafter1 et VideoCrafter2 (AILab-CVC, Tencent)**
- Le code est sous un fichier nommé `License` (et non LICENSE), ajouté le 27/11/2023. Il commence par « This license applies to the source codes that are open sourced in connection with the VideoCrafter1. Copyright (C) 2023 THL A29 Limited, a Tencent company. » et se poursuit par le texte Apache-2.0. Aucune clause « research only » n'a été trouvée dans ce fichier — [License](https://github.com/AILab-CVC/VideoCrafter/blob/main/License)
- Contradiction : l'avertissement du README dit « We develop this repository for RESEARCH purposes, so it can only be used for personal/research/non-commercial purposes. » — [README VideoCrafter](https://github.com/AILab-CVC/VideoCrafter)
- Poids VideoCrafter2 (T2V 320x512) : la carte HF ne contient que la métadonnée `license: apache-2.0` — [VideoCrafter/VideoCrafter2](https://huggingface.co/VideoCrafter/VideoCrafter2)
- Poids I2V de VideoCrafter1 (`VideoCrafter/Image2Video-512`) : aucune carte ni licence. Le README est absent (« Entry not found ») — [VideoCrafter/Image2Video-512](https://huggingface.co/VideoCrafter/Image2Video-512)
- Base de VideoCrafter1 : SD 2.1 avec des couches temporelles ajoutées — [arXiv 2310.19512](https://arxiv.org/abs/2310.19512)

**SEINE (Vchitect, Shanghai AI Lab)**
- Le code est sous Apache-2.0 — [LICENSE](https://github.com/Vchitect/SEINE/blob/main/LICENSE)
- Poids, selon le README : « The code is licensed under Apache-2.0, model weights are fully open for academic research and also allow **free** commercial usage. To apply for a commercial license, please contact vchitect@pjlab.org.cn. » La formulation est ambiguë : usage commercial gratuit, mais avec une demande de licence — [README SEINE](https://github.com/Vchitect/SEINE)
- Le dépôt HF `Vchitect/SEINE` (fichier `seine.pt`) ne déclare aucune licence dans sa carte — [Vchitect/SEINE](https://huggingface.co/Vchitect/SEINE)
- Base : « Our model is based on Stable diffusion v1.4 », construit sur LaVie, diffusers et Stable Diffusion — [README SEINE](https://github.com/Vchitect/SEINE). SD v1.4 est sous `creativeml-openrail-m` — [CompVis/stable-diffusion-v1-4](https://huggingface.co/CompVis/stable-diffusion-v1-4)
- Avertissement : « The model was not trained to realistically represent people or events… It is prohibited for pornographic, violent and bloody content generation… » — [README SEINE](https://github.com/Vchitect/SEINE)

**Open-Sora (hpcaitech, HPC-AI Tech)**
- Le code est sous Apache-2.0 — [LICENSE](https://github.com/hpcaitech/Open-Sora/blob/main/LICENSE)
- Poids Open-Sora 2.0 (11B) : la carte HF déclare `license: apache-2.0` — [hpcai-tech/Open-Sora-v2](https://huggingface.co/hpcai-tech/Open-Sora-v2). Le même dépôt contient pourtant aussi `flux1-dev.safetensors`, `flux1-dev-ae.safetensors`, `hunyuan_vae.safetensors`, `google/t5-v1_1-xxl` et `openai/clip-vit-large-patch14` (liste relevée via l'API HF le 16/10/2026) — [fichiers du dépôt](https://huggingface.co/hpcai-tech/Open-Sora-v2/tree/main)
- Rapport technique : « we adopt Flux… We initialize our text-to-video model using Flux and empirically find that, despite it being a distilled model, this initialization is effective ». L'auto-encodeur a d'abord été celui de HunyuanVideo, puis le Video DC-AE maison — [arXiv 2503.09642 (HTML)](https://arxiv.org/html/2503.09642v1)
- Licence FLUX.1 [dev] Non-Commercial v1.1.1 : un « Derivative » est « any modified version… (including… any customized or fine-tuned version thereof) ». La licence est accordée « solely for your Non-Commercial Purposes ». Les sorties restent utilisables « for any purpose (including for commercial purposes) », sauf pour entraîner un modèle concurrent. Il faut aussi « implement and maintain content filtering measures » — [LICENSE-FLUX1-dev](https://github.com/black-forest-labs/flux/blob/main/model_licenses/LICENSE-FLUX1-dev)
- Licence Tencent Hunyuan Community, qui couvre la VAE `hunyuan_vae` : « DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA ». Une licence spécifique est exigée au-delà de 100 millions d'utilisateurs actifs mensuels — [LICENSE HunyuanVideo](https://huggingface.co/tencent/HunyuanVideo/blob/main/LICENSE)
- Open-Sora 1.2 : le modèle « starts from the PixArt-Σ 2K checkpoint ». La VAE 2D est initialisée depuis la VAE de SDXL — [report_03](https://github.com/hpcaitech/Open-Sora/blob/opensora/v1.2/docs/report_03.md). PixArt-Σ est déclaré `openrail` sur HF — [PixArt-Sigma-XL-2-2K-MS](https://huggingface.co/PixArt-alpha/PixArt-Sigma-XL-2-2K-MS). `sdxl-vae` est sous MIT — [stabilityai/sdxl-vae](https://huggingface.co/stabilityai/sdxl-vae)
- Poids 1.2 (`OpenSora-STDiT-v3`) : `license: apache-2.0` — [carte HF](https://huggingface.co/hpcai-tech/OpenSora-STDiT-v3). Poids 1.3 (`OpenSora-STDiT-v4`, `-v4-i2v`, `OpenSora-VAE-v1.3`) : aucune métadonnée de licence (relevé API) — [STDiT-v4-i2v](https://huggingface.co/hpcai-tech/OpenSora-STDiT-v4-i2v)

**ImaGINator (Wang, Bilinski, Bremond, Dantcheva ; Inria, WACV 2020)**
- Le code est sous MIT (« Copyright (c) 2021 Yaohui ») — [LICENSE](https://github.com/wyhsirius/ImaGINator/blob/master/LICENSE)
- Le modèle pré-entraîné est entraîné sur MUG et distribué via Google Drive, sans licence précisée — [README](https://github.com/wyhsirius/ImaGINator)

**Versatile Transition Generation (VTG ; Zuhao Yang, Jiahui Zhang, Yingchen Yu, Shijian Lu, Song Bai ; NTU et ByteDance, ICCV 2025)**
- Identification : il s'agit de l'article « Versatile Transition Generation with Image-to-Video Diffusion », arXiv 2508.01698, ICCV 2025. La page projet est mwxely.github.io/projects/yang2025vtg — [arXiv](https://arxiv.org/abs/2508.01698) ; [ICCV Open Access](https://openaccess.thecvf.com/content/ICCV2025/html/Yang_Versatile_Transition_Generation_with_Image-to-Video_Diffusion_ICCV_2025_paper.html)
- Pas de code public. La page projet renvoie seulement vers l'article, arXiv, TransitBench (HF), le poster, les diapositives et une vidéo YouTube. Elle ne contient aucun lien GitHub de code — [page projet](https://mwxely.github.io/projects/yang2025vtg/index.html)
- Sur sa page personnelle, l'auteur liste VTG avec « paper / bibtex / webpage », sans lien « code », alors que ses autres projets en ont un. La même page mentionne un brevet américain de 2026, « Method, Device, and Medium for Generating Transition Videos with Diffusion Model » — [mwxely.github.io](https://mwxely.github.io/)
- Le jeu d'évaluation TransitBench est sous `cc-by-nc-4.0` (métadonnée HF, créé le 06/07/2025) — [mwxely/TransitBench](https://huggingface.co/datasets/mwxely/TransitBench)
- Base : « other available weights are initialized from the pre-trained checkpoint of DynamiCrafter ». L'article dit aussi : « we use Stable Diffusion v2.1-base as our interpolation backbone » (LoRA) — [arXiv 2508.01698v1 (HTML)](https://arxiv.org/html/2508.01698v1)
- Licence du code et des poids : non précisée, faute de publication.

### Inferences
- **Règle maison (MIT, Apache-2.0 ou BSD seulement)** : aucun de ces modèles n'est « propre » sur toute sa chaîne de poids. DynamiCrafter et VideoCrafter descendent de SD 2.1 (OpenRAIL++), SEINE de SD 1.4 (OpenRAIL-M) et Open-Sora 1.x de PixArt-Σ (openrail). Open-Sora 2.0 est initialisé depuis FLUX.1-dev, donc probablement un « Derivative » au sens de la licence FLUX, non commercial. Son étiquette `apache-2.0` sur HF semble contredite par la licence de sa base. C'est une lecture des textes, pas un avis juridique.
- DynamiCrafter est aujourd'hui le plus clair des sept (Apache-2.0 sur le code et sur le dépôt des poids). Cependant, les wrappers ComfyUI les plus utilisés (kijai, chaojie) ont figé l'ancienne clause « research only ». Il faudrait donc réécrire le nœud plutôt que le reprendre tel quel.
- Pour VideoCrafter, le fichier `License` (Apache) contredit l'avertissement « non-commercial » du README. Le plus prudent est de considérer l'usage commercial comme non autorisé.
- Pour Open-Sora 2.0, la licence FLUX autorise l'usage commercial des *sorties*. Le blocage porte sur l'exécution et la « production use » des poids dérivés, ce qui heurte directement notre règle d'exécution locale.
- VTG ne peut pas être exécuté : pas de code, et le brevet déposé laisse penser qu'une réimplémentation fidèle de la méthode présenterait un risque.

### Gaps
- Texte exact de l'OpenRAIL++-M de SD 2.1 (restrictions d'usage, sorties) : le dépôt officiel Stability n'était pas joignable ; seul le miroir communautaire a été consulté.
- La licence de `DeepFloyd/t5-v1_1-xxl` (encodeur des versions 1.x d'Open-Sora) n'est pas déclarée dans les métadonnées HF ; elle n'a pas été vérifiée ailleurs.
- La base exacte de VideoCrafter2 (réentraînement depuis VideoCrafter1 ou autre) n'a pas été vérifiée dans arXiv 2401.09047.
- La licence d'accès à la base MUG, qui conditionne les poids d'ImaGINator, n'a pas été vérifiée.
- Le dépôt HF `xinyuanc91/SEINE`, cité par le README, n'a pas répondu à l'API ; sa licence est donc inconnue.

---

## 2. Fonctionnement : entrées, durée, résolution, i/s, audio et lip-sync

### Takeaway
Ce sont tous des modèles « image (et texte) vers clip court sans son ». Les clips font 16 images (DynamiCrafter, SEINE, VideoCrafter), 32 images en 64×64 (ImaGINator) ou jusqu'à environ 5 s (Open-Sora 2.0). Aucun ne prend d'audio en entrée ni ne fait de synchronisation labiale. Pour un format vertical 9:16, seul Open-Sora (1.x et 2.0) le prévoit explicitement.

### Cited Findings
- **DynamiCrafter** : image et texte en entrée (« takes in a still image as a conditioning image and text prompt describing dynamics »). Il génère 16 images en 576×1024, et la carte annonce « short video clips (~2 seconds) » — [carte HF 1024](https://huggingface.co/Doubiiu/DynamiCrafter_1024). Le README précise « up to 16 frames with a resolution of 576x1024 » et trois modèles : 256×256, 320×512 et 576×1024 — [README](https://github.com/Doubiiu/DynamiCrafter)
- **DynamiCrafter** : le conditionnement de vitesse est réglé par `run.sh`. Le modèle 1024 « adopts FPS=10, range recommended: 15-5 », le 512 « FPS=24 », le 256 « frame stride=3 » — [scripts/run.sh](https://github.com/Doubiiu/DynamiCrafter/blob/main/scripts/run.sh). La configuration 1024 fixe `video_length: 16` et un latent `[72, 128]`, soit 576×1024 en paysage — [configs/inference_1024_v1.0.yaml](https://github.com/Doubiiu/DynamiCrafter/blob/main/configs/inference_1024_v1.0.yaml)
- **DynamiCrafter** : un modèle d'interpolation générative et de boucle (`DynamiCrafter512_interp`, 320×512) prend deux images, une de début et une de fin — [README](https://github.com/Doubiiu/DynamiCrafter)
- **DynamiCrafter** : selon VBench++, il « may position the input image randomly within the generated video ». L'image d'entrée n'est donc pas forcément la première image du clip — [VBench++ arXiv 2411.13503](https://arxiv.org/abs/2411.13503)
- **SEINE** : I2V avec masque « first1 » et transition entre deux images avec masque « onelast1 ». La configuration I2V produit 16 images en 240×560, avec un échantillonneur DDPM à 250 pas et un suffixe de prompt « slow motion » ; la transition se fait en 512×512 — [sample_i2v.yaml](https://github.com/Vchitect/SEINE/blob/main/configs/sample_i2v.yaml) ; [sample_transition.yaml](https://github.com/Vchitect/SEINE/blob/main/configs/sample_transition.yaml). L'article présente le modèle comme « Short-to-Long Video Diffusion Model for Generative Transition and Prediction » — [arXiv 2310.20700](https://arxiv.org/abs/2310.20700)
- **VideoCrafter1 (I2V)** : 320×512, 16 images (`temporal_length: 16`), fps=8, 50 pas DDIM, guidance 12 — [run_image2video.sh](https://github.com/AILab-CVC/VideoCrafter/blob/main/scripts/run_image2video.sh) ; [inference_i2v_512_v1.0.yaml](https://github.com/AILab-CVC/VideoCrafter/blob/main/configs/inference_i2v_512_v1.0.yaml). L'article dit que l'I2V doit produire des vidéos « that strictly adhere to the content of the provided reference image, preserving its content, structure, and style » — [arXiv 2310.19512](https://arxiv.org/abs/2310.19512)
- **VideoCrafter2** : texte vers vidéo seulement (320×512) ; il n'existe pas de checkpoint I2V VideoCrafter2. Le README renvoie vers DynamiCrafter pour l'I2V (« Our dedicated high-resolution I2V model is released at: DynamiCrafter ») — [README](https://github.com/AILab-CVC/VideoCrafter)
- **Open-Sora 2.0** : un seul modèle de 11B fait le T2V et l'I2V (« Our model is optimized for image-to-video generation »). Résolutions 256px et 768px ; formats `16:9`, `9:16`, `1:1`, `2.39:1` ; nombre d'images de la forme `4k+1` et inférieur à 129. L'I2V s'obtient avec `--cond_type i2v_head`, et un « motion score » est réglable de 1 à 7 (4 par défaut) — [README](https://github.com/hpcaitech/Open-Sora). Le rapport parle de « 128 frames… At 24 FPS… a 5-second duration » — [arXiv 2503.09642](https://arxiv.org/html/2503.09642v1)
- **Open-Sora 1.1 et 1.2** : « 2s~15s, 144p to 720p, any aspect ratio… image-to-video, video-to-video » ; dans la démo, l'image sert de première image (« with the image as the first frame ») — [README v1.2](https://github.com/hpcaitech/Open-Sora/tree/opensora/v1.2). **Open-Sora 1.3** : jusqu'à 113 images en 360p ou 720p, avec un modèle I2V dédié (`OpenSora-STDiT-v4-i2v`) — [README v1.3](https://github.com/hpcaitech/Open-Sora/tree/opensora/v1.3)
- **ImaGINator** : en entrée, une image, une étiquette d'expression ou d'action et du bruit (« given a single image, a condition (label of a facial expression or action) and noise »). En sortie, « video sequences of 32 frames with an image size 64×64 pixels » ; jeux de données MUG, UvA-NEMO, NATOPS et Weizmann — [article WACV 2020](https://openaccess.thecvf.com/content_WACV_2020/papers/WANG_ImaGINator_Conditional_Spatio-Temporal_GAN_for_Video_Generation_WACV_2020_paper.pdf)
- **VTG** : en entrée, la première et la dernière image plus des descriptions. Il couvre quatre tâches : « object morphing, motion prediction, concept blending, and scene transition » — [page projet](https://mwxely.github.io/projects/yang2025vtg/index.html)
- **Audio et lip-sync** : aucun README ni article de ce lot ne décrit d'entrée audio ou de synchronisation labiale (lecture des README [DynamiCrafter](https://github.com/Doubiiu/DynamiCrafter), [SEINE](https://github.com/Vchitect/SEINE), [VideoCrafter](https://github.com/AILab-CVC/VideoCrafter), [Open-Sora](https://github.com/hpcaitech/Open-Sora), [ImaGINator](https://github.com/wyhsirius/ImaGINator) et de la [page VTG](https://mwxely.github.io/projects/yang2025vtg/index.html)).

### Inferences
- Un plan de 2 à 4 s à 24-30 i/s demande 48 à 120 images. DynamiCrafter, SEINE et VideoCrafter n'en donnent que 16 : il faudrait étirer le temps (interpolation) ou enchaîner plusieurs clips. Cela accroît la dérive d'identité et la mollesse du mouvement.
- DynamiCrafter 1024 est entraîné en paysage (576×1024). Pour du 9:16, il faudrait recadrer ou détourer. Open-Sora 2.0 est le seul du lot à proposer `9:16` nativement.
- Sans entrée audio, aucun de ces modèles ne peut faire parler un personnage en synchronisation avec une réplique française. Les lèvres devraient venir d'un autre outil, branché sur le son.

### Gaps
- Résolution et nombre d'images exacts produits par VTG : non trouvés dans les extraits lus. L'article indique seulement que la méthode s'appuie sur DynamiCrafter.
- Durée maximale réellement exploitable en I2V à 768px pour Open-Sora 2.0 sur un seul GPU : non documentée hors H100/H800.

---

## 3. Qualité : personnages stylisés 3D/cartoon, scènes à plusieurs personnes, défauts, benchmarks et comparaison avec Wan 2.2, LTX et HunyuanVideo-I2V

### Takeaway
Sur VBench-I2V, DynamiCrafter-1024 (87,76 %) devance encore Wan2.1-I2V-14B (86,86 %) et HunyuanVideo-I2V (86,82 %). Il reste derrière Wan2.2-I2V-A14B (88,16 % à 88,68 %), Wan2.2-TI2V-5B (88,80 %) et Magi-1 (89,28 %). Mais VBench-I2V récompense la cohérence avec l'image d'entrée plus que la qualité du jeu d'acteur : il ne mesure ni l'anatomie, ni la parole, ni le style cartoon. Les auteurs eux-mêmes signalent des défauts sur les visages et les personnes (DynamiCrafter), un a priori appris sur des vidéos réelles inadapté au cartoon (ToonCrafter), et un modèle « pas entraîné à représenter des personnes » (SEINE).

### Cited Findings
- **VBench-I2V, classement officiel** (valeurs extraites le 16/10/2026 ; format Total / I2V / Qualité / « Dynamic Degree ») — [VBench Leaderboard](https://huggingface.co/spaces/Vchitect/VBench_Leaderboard) :
  - Magi-1 : 89,28 % / 96,12 / 82,44 / 68,21 %
  - Wan2.2-TI2V-5B (prompt optimisé par Qwen) : 88,80 % / 96,30 / 81,30 / 52,85 %
  - Wan2.2-I2V-A14B (prompt optimisé) : 88,68 % / 96,51 / 80,85 / 48,62 %
  - Wan2.2-I2V-A14B (sans optimisation) : 88,16 % / 95,82 / 80,50 / 52,85 %
  - **DynamiCrafter-1024** : **87,76 %** / 95,02 / 80,50 / 47,40 %
  - LTX-2-I2V (sans optimisation) : 87,59 % / 96,53 / 78,65 / 8,54 %
  - **DynamiCrafter-512** : 86,99 % / 93,53 / 80,46 / 69,67 %
  - Wan2.1-I2V-14B-720P : 86,86 % / 92,90 / 80,82 / 51,38 %
  - HunyuanVideo-I2V : 86,82 % / 95,10 / 78,54 / 22,20 %
  - CogVideoX-5b-I2V : 86,70 %
  - Animate-Anything : 86,48 % / 94,25 / 78,71 / **2,68 %**
  - **SEINE-512x512** : 85,52 % / 92,67 / 78,37 / 27,07 %
  - **DynamiCrafter-256** : 85,25 %
  - **SEINE-512x320** : 84,88 % / 92,39 / 77,37 / 34,31 %
  - **VideoCrafter-I2V** : **82,57 %** / 86,31 / 78,84 / 22,60 %, avec une cohérence sujet image-vidéo de 91,17 % et une cohérence de fond de 91,31 %, les plus basses des modèles listés hors CogVideoX1.5.
- **Open-Sora** n'apparaît pas dans le classement I2V. Sur le classement T2V (Total) : Open-Sora-2.0 du 18/03/2025 à 84,34 % (certification « Silver », vidéos échantillonnées par l'équipe Open-Sora), Wan2.2-T2V-A14B à 84,23 %, HunyuanVideo version open source à 83,24 %, VideoCrafter-2.0 à 80,44 %, LTX-Video à 80,00 %, OpenSora V1.2 (8 s) à 79,76 % et VideoCrafter-1.0 à 79,72 % — [VBench Leaderboard](https://huggingface.co/spaces/Vchitect/VBench_Leaderboard)
- Méthode VBench-I2V : la cohérence du sujet avec l'image utilise DINOv1, celle du fond utilise DreamSim. Le mouvement de caméra est évalué avec Co-Tracker sur sept mouvements de base — [VBench++](https://arxiv.org/abs/2411.13503)
- Fiabilité VBench pour VideoCrafter2.0 (T2V) : Culture Fairness 84,92 %, Skin Bias 30,94 %, Gender Bias 14,25 %, Safety 54,33 %. VBench++ indique « A higher score indicates relatively better performance » — [VBench Leaderboard](https://huggingface.co/spaces/Vchitect/VBench_Leaderboard) ; [VBench++](https://arxiv.org/abs/2411.13503)
- **DynamiCrafter**, limites déclarées sur la carte : « Faces and people in general may not be generated properly », « The autoencoding part of the model is lossy, resulting in slight flickering artifacts », « The generated videos are relatively short (2 seconds, FPS=8) » — [carte HF](https://huggingface.co/Doubiiu/DynamiCrafter_1024)
- **DynamiCrafter** : les vitrines du README incluent « two people dancing » et « girl talking and blinking » (modèle 256), ainsi que des comparaisons avec SVD et Pika — [README](https://github.com/Doubiiu/DynamiCrafter)
- **DynamiCrafter sur le cartoon** : ToonCrafter, des mêmes auteurs et construit sur DynamiCrafter, part du constat qu'il faut « adapting live-action video priors to better suit cartoon interpolation » pour résoudre « the domain gap and content leakage issues » — [arXiv 2405.17933](https://arxiv.org/abs/2405.17933). Son README avertit : « the success rate is not guaranteed » — [README ToonCrafter](https://github.com/Doubiiu/ToonCrafter)
- **VTG contre ses bases** : en morphing d'objet, « the compared methods exhibit low-fidelity (e.g., DiffMorpher, DynamiCrafter), oversaturation effect… ». VTG utilise de son côté le prompt négatif « Distorted, discontinuous, Ugly… disfigured, disconnected limbs, Ugly faces, incomplete arms » — [arXiv 2508.01698](https://arxiv.org/html/2508.01698v1)
- **SEINE** : « The model was not trained to realistically represent people or events » — [README](https://github.com/Vchitect/SEINE)
- **Open-Sora 2.0, selon les auteurs** : il « outperforms these top-performing models in at least two aspects out of the three » (qualité visuelle, respect du prompt, qualité du mouvement) face à Runway Gen-3 Alpha, Luma Ray2, HunyuanVideo et Step-Video-T2V. L'écart VBench avec Sora serait passé de « 4.52% to 0.69% ». Les légendes d'entraînement décrivent le style vidéo (« realistic, cinematic, 3D, animation ») — [arXiv 2503.09642](https://arxiv.org/html/2503.09642v1)
- **ImaGINator** : entraîné et évalué uniquement sur des visages réels recadrés (MUG, UvA-NEMO) et des actions (NATOPS, Weizmann) en 64×64 — [article WACV 2020](https://openaccess.thecvf.com/content_WACV_2020/papers/WANG_ImaGINator_Conditional_Spatio-Temporal_GAN_for_Video_Generation_WACV_2020_paper.pdf)

### Inferences
- Le classement VBench-I2V favorise les sorties peu animées. Animate-Anything atteint 86,48 % au total avec seulement 2,68 % de « Dynamic Degree », et LTX-2-I2V 87,59 % avec 8,54 %. Le rang de DynamiCrafter-1024 au-dessus de Wan2.1 ou de HunyuanVideo-I2V ne prouve donc pas qu'il anime mieux un personnage qui parle. Pour notre cas, il faudra un banc maison : identité, anatomie, lèvres, style.
- En résumé : l'a priori de DynamiCrafter vient de vidéos réelles (son entraînement se fait sur WebVid d'après le [README](https://github.com/Doubiiu/DynamiCrafter), et ToonCrafter le qualifie de « live-action video priors »), les auteurs avouent des défauts sur les visages, et les clips plafonnent à 16 images. On peut s'attendre à des visages cartoon qui « fondent » ou dérivent dès que la tête bouge. C'est une inférence, non mesurée sur nos images.
- VideoCrafter-I2V a la plus faible cohérence avec l'image d'entrée (91 %). Garder l'identité de la troupe serait donc son point le plus faible.
- Aucun de ces projets n'a publié d'évaluation dédiée aux scènes à 2 ou 3 personnages avec un seul locuteur. C'est l'angle mort principal pour notre cas.

### Gaps
- Aucun test public trouvé de ces modèles sur des personnages 3D style Pixar à peau foncée, ni sur des scènes à plusieurs personnages dont un seul parle.
- Les issues GitHub n'ont pas pu être fouillées en profondeur (API GitHub refusée dans la session). La recherche web dans les issues de DynamiCrafter n'a fait ressortir aucun ticket sur le cartoon ou les visages.
- Il n'existe pas de score VBench-I2V pour Open-Sora 1.x ou 2.0 (absents du classement I2V), ni pour VTG ou ImaGINator.

---

## 4. Matériel : VRAM, temps par clip sur GPU nommés, voie CPU ; dates de sortie, dernier commit, maintenance

### Takeaway
DynamiCrafter tient sur un GPU grand public : de 8 à 18 Go selon la variante, et environ 75 s par clip de 2 s en 1024 sur A100. Open-Sora 2.0 demande un GPU de 50 à 60 Go : 1 656 s pour un clip 768px sur un H100. Hormis le dépôt Open-Sora, qui ne reçoit plus que de la documentation, tous ces projets ont cessé leur développement (code figé entre 2022 et 2025). Aucune voie CPU n'est documentée.

### Cited Findings
- **DynamiCrafter** (A100, 50 pas DDIM) : 1024 → 18,3 Go et 75 s (`perframe_ae=True`) ; 512 → 12,8 Go et 20 s ; 256 → 11,9 Go et 10 s ; 512_interp → 12,8 Go et 20 s. Les mêmes consommations mémoire sont rapportées sur RTX 4090 (18,3 / 12,8 / 11,9 Go) — [README](https://github.com/Doubiiu/DynamiCrafter)
- **DynamiCrafter**, versions communautaires élaguées en bf16 de kijai : 1024 → 10 Go, 512_interp → 8 Go — [Kijai/DynamiCrafter_pruned](https://huggingface.co/Kijai/DynamiCrafter_pruned) via [README DynamiCrafter](https://github.com/Doubiiu/DynamiCrafter). Le wrapper annonce « 512x320 under 10GB VRAM ». Pour ToonCrafter, il annonce « slightly under 15GB for sampling… peaks to ~17GB at decoding », avec xformers requis pour la pleine qualité — [README wrapper](https://github.com/kijai/ComfyUI-DynamiCrafterWrapper)
- **DynamiCrafter**, calendrier : 256 publié le 29/11/2023, 512 et 1024 le 05/02/2024, interp et boucle le 14/03/2024, code d'entraînement le 05/05/2024 et le 14/06/2024 — [README](https://github.com/Doubiiu/DynamiCrafter). Dernier commit le 08/09/2024 (« Update README.md »), 42 commits au total (clone du 16/10/2026) — [commits](https://github.com/Doubiiu/DynamiCrafter/commits/main). Article oral à ECCV 2024 — [README](https://github.com/Doubiiu/DynamiCrafter)
- **ToonCrafter** : environ 24 Go et 24 s sur A100 en 320×512 ; le README ajoute « the community has lowered the consumption to ~10GB ». Dernier commit le 19/03/2025 — [README ToonCrafter](https://github.com/Doubiiu/ToonCrafter)
- **VideoCrafter** : VideoCrafter1 publié le 13/10/2023, VideoCrafter2 le 18/01/2024 (checkpoint 512 le 26/01/2024) — [README](https://github.com/AILab-CVC/VideoCrafter). Dernier commit le 09/01/2026 (correction d'une coquille du README, PR #102), précédé de modifications du README en 2024 ; 120 commits — [commits](https://github.com/AILab-CVC/VideoCrafter/commits/main)
- **SEINE** : dépôt créé le 23/09/2023 ; dernier commit de code le 09/12/2023 (`with_mask_sample.py`) ; dernier commit le 13/11/2024 (README) ; publié à ICLR 2024 — [commits](https://github.com/Vchitect/SEINE/commits/main). Échantillonnage DDPM à 250 pas par défaut — [sample_i2v.yaml](https://github.com/Vchitect/SEINE/blob/main/configs/sample_i2v.yaml)
- **Open-Sora 2.0**, sur H100/H800 avec 50 pas en T2V (temps total / pic mémoire) : 256×256 avec 1 GPU → 60 s / 52,5 Go (avec `--offload True`) ; 768×768 avec 1 GPU → 1 656 s / 60,3 Go ; avec 8 GPU → 276 s / 44,3 Go — [README](https://github.com/hpcaitech/Open-Sora)
- **Open-Sora 1.2** sur H100 80 Go : 360p 2 s → 18 s / 27 Go ; 480p 4 s → 55 s / 30 Go ; 720p 4 s → 130 s / 39 Go — [README v1.2](https://github.com/hpcaitech/Open-Sora/tree/opensora/v1.2). **Open-Sora 1.3** sur H200 avec 30 pas : 360p 49 images → 16 s / 23 Go ; 720p 97 images → 130 s / 33 Go — [README v1.3](https://github.com/hpcaitech/Open-Sora/tree/opensora/v1.3)
- **Open-Sora**, calendrier : 1.0 le 18/03/2024, 1.1 le 25/04/2024, 1.2 le 17/06/2024, 1.3 le 20/02/2025, 2.0 le 12/03/2025. Le coût d'entraînement de la 2.0 est de 199,6 k$ (4 160 jours-GPU H200 à 2 $/h) — [README](https://github.com/hpcaitech/Open-Sora) ; [rapport 2.0](https://arxiv.org/html/2503.09642v1). Les derniers commits de code datent des 26 et 27/03/2025 (« mitigate gpu mem peak when loading ckpt »), et le dernier commit du 09/04/2026 ne touche que la documentation ; 1 333 commits — [commits](https://github.com/hpcaitech/Open-Sora/commits/main). Le README renvoie vers un produit commercial : « For a professional AI video-generation product, try Video Ocean » — [README](https://github.com/hpcaitech/Open-Sora)
- **ImaGINator** : Python 3.6, CUDA 9.2, PyTorch 1.4+ — [README](https://github.com/wyhsirius/ImaGINator). Dernier commit le 01/11/2022, 7 commits — [commits](https://github.com/wyhsirius/ImaGINator/commits/master)
- **VTG** : entraîné sur 4 A100-80GB pendant environ 20 000 itérations, avec un lot de 2. Chaque paire d'images demande des LoRA (rang 16, 200 pas), soit environ 85 s sur une A100-80GB, puis un échantillonnage DDIM à 50 pas — [arXiv 2508.01698](https://arxiv.org/html/2508.01698v1)

### Inferences
- Estimation pour environ 1 000 vidéos d'une minute, avec des plans de 3 s, soit environ 20 plans par vidéo et 20 000 plans au total. Avec DynamiCrafter 1024 à environ 75 s sur A100 par clip de 16 images, et sans compter les reprises, il faudrait environ 420 heures GPU A100 rien que pour la génération brute. Ce calcul extrapole les chiffres du README et n'a pas été mesuré.
- Open-Sora 2.0 en 768px sur un seul H100, à 1 656 s par clip, est hors de portée de ce volume sur du calcul gratuit.
- Projets figés : aucun correctif n'est à attendre (DynamiCrafter depuis 09/2024, SEINE depuis 12/2023 pour le code, ImaGINator depuis 2022, Open-Sora depuis 03/2025 pour le code).

### Gaps
- Temps mesurés sur RTX 3090/4090 ou T4 (Colab, Kaggle) pour DynamiCrafter, SEINE et VideoCrafter : non publiés par les auteurs ; seule la mémoire est rapportée sur 4090 pour DynamiCrafter.
- VRAM et temps de SEINE et de VideoCrafter-I2V : non documentés dans leurs README.
- Voie CPU : aucune documentée pour ces projets.
- Consommation d'Open-Sora 2.0 en I2V 768px sur 24 Go (avec offload) : aucun relevé fiable trouvé.

---

## 5. Prise en charge ComfyUI

### Takeaway
DynamiCrafter et ToonCrafter disposent de nœuds ComfyUI communautaires listés dans ComfyUI-Manager. Le principal, celui de kijai, a été maintenu jusqu'en 06/2025, mais il porte l'ancienne licence « research only ». Open-Sora a des nœuds pour les versions 1.0 à 1.2 seulement. Aucun nœud n'a été trouvé pour SEINE, VideoCrafter, ImaGINator ou VTG. Aucun de ces modèles n'est pris en charge nativement par ComfyUI.

### Cited Findings
- Recherche dans le registre ComfyUI-Manager (`custom-node-list.json`, lu le 16/10/2026). Entrées trouvées : ComfyUI-DynamiCrafterWrapper (kijai), ComfyUI-DynamiCrafter (chaojie), ComfyUI - Native DynamiCrafter (ExponentialML), ComfyUI-ToonCrafter (AIGODLIKE), ComfyUI-Open-Sora (chaojie), ComfyUI-Open-Sora-I2V (bombax-xiaoice) et ComfyUI-OpenDiTWrapper (kijai, « supports Open-Sora t2i and i2i »). Aucune entrée pour SEINE, VideoCrafter, ImaGINator ou VTG — [custom-node-list.json](https://github.com/Comfy-Org/ComfyUI-Manager/blob/main/custom-node-list.json)
- **kijai/ComfyUI-DynamiCrafterWrapper** : la LICENSE commence par « This license applies to the source codes that are open sourced in connection with the DynamiCrafter. Copyright (C) 2023 THL A29 Limited, a Tencent company. » et contient la clause « 10. This code is provided for research purposes only and is not to be used for any commercial purposes… ». Dernier commit le 02/06/2025 (« Possible import error fix »), précédé de juillet 2024 ; 117 commits. Il prend en charge ToonCrafter et la ControlNet — [LICENSE](https://github.com/kijai/ComfyUI-DynamiCrafterWrapper/blob/main/LICENSE) ; [dépôt](https://github.com/kijai/ComfyUI-DynamiCrafterWrapper)
- **chaojie/ComfyUI-DynamiCrafter** : sa LICENSE est identique, octet pour octet, à celle du wrapper kijai, clause « research only » comprise (vérifié par `diff`) — [LICENSE](https://github.com/chaojie/ComfyUI-DynamiCrafter/blob/main/LICENSE)
- **ExponentialML/ComfyUI_Native_DynamiCrafter** : LICENSE Apache-2.0. Il s'intègre aux nœuds natifs, à la ControlNet et à l'interpolation, avec un maximum de 16 images en interpolation (« This is strictly enforced… blurry results »). Dernier commit le 22/03/2024 — [dépôt](https://github.com/ExponentialML/ComfyUI_Native_DynamiCrafter)
- **AIGODLIKE/ComfyUI-ToonCrafter** : LICENSE Apache-2.0, dernier commit le 17/07/2024 — [dépôt](https://github.com/AIGODLIKE/ComfyUI-ToonCrafter)
- **chaojie/ComfyUI-Open-Sora** : Apache-2.0, « only supports Linux now », poids Open-Sora v1.0 (16×512×512). Dernier commit le 26/03/2024 — [dépôt](https://github.com/chaojie/ComfyUI-Open-Sora)
- **bombax-xiaoice/ComfyUI-Open-Sora-I2V** : Apache-2.0, « Supports latest V1.2 and V1.1 models as well as image to video functions », jusqu'à 1280×720. Dernier commit le 21/01/2025 — [dépôt](https://github.com/bombax-xiaoice/ComfyUI-Open-Sora-I2V)
- Aucun nœud ComfyUI pour Open-Sora 2.0 n'a été trouvé. Les résultats de recherche renvoient aux nœuds API de « Sora 2 » d'OpenAI, un produit fermé sans rapport — [recherche Comfy (Sora 2 partner nodes)](https://blog.comfy.org/p/sora-2-api-nodes-now-in-comfyui)

### Inferences
- Pour intégrer DynamiCrafter dans ComfyUI tout en respectant notre règle de licence, le nœud natif d'ExponentialML (Apache-2.0) est le seul point de départ propre. Il est figé depuis 03/2024 et reste lié aux poids, eux-mêmes descendants de SD 2.1.

### Gaps
- La date du dernier commit de chaojie/ComfyUI-DynamiCrafter n'a pas été relevée.
- Compatibilité de ces nœuds avec les versions 2026 de ComfyUI : non testée.

---

## 6. Démo hébergée gratuite et utilisable anonymement aujourd'hui (16/10/2026)

### Takeaway
Seuls deux Spaces de ce lot tournent : `hpcai-tech/open-sora` (qui sert Open-Sora **1.2** et non 2.0) et `Doubiiu/tooncrafter`. Tous deux utilisent ZeroGPU, avec un quota de 2 min de GPU par jour pour un visiteur non connecté et de 5 min pour un compte gratuit. Les Spaces officiels de DynamiCrafter, SEINE et VideoCrafter sont en erreur.

### Cited Findings
- État des Spaces le 16/10/2026, d'après l'API HF :
  - `Doubiiu/DynamiCrafter` : RUNTIME_ERROR — [Space](https://huggingface.co/spaces/Doubiiu/DynamiCrafter)
  - `Doubiiu/DynamiCrafter_interp_loop` : RUNTIME_ERROR — [Space](https://huggingface.co/spaces/Doubiiu/DynamiCrafter_interp_loop)
  - `Vchitect/SEINE` : RUNTIME_ERROR — [Space](https://huggingface.co/spaces/Vchitect/SEINE)
  - `VideoCrafter/VideoCrafter` : BUILD_ERROR (dernière modification le 30/05/2024) — [Space](https://huggingface.co/spaces/VideoCrafter/VideoCrafter)
  - `hpcai-tech/open-sora` : RUNNING sur `zero-a10g` (licence du Space : apache-2.0) — [Space](https://huggingface.co/spaces/hpcai-tech/open-sora)
  - `Doubiiu/tooncrafter` : RUNNING sur `zero-a10g` (licence du Space : mit) — [Space](https://huggingface.co/spaces/Doubiiu/tooncrafter)
- Le Space `hpcai-tech/open-sora` charge `MODEL_TYPES = ["v1.2-stage3"]` → `hpcai-tech/OpenSora-STDiT-v3`, soit Open-Sora 1.2 et non 2.0 — [app.py du Space](https://huggingface.co/spaces/hpcai-tech/open-sora/blob/main/app.py)
- Quotas ZeroGPU : « Unauthenticated 2 minutes » par jour (priorité basse), « Free account 5 minutes » (priorité moyenne), « PRO account 40 minutes » ; quota quotidien réinitialisé 24 h après la première utilisation — [documentation ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu)
- La carte DynamiCrafter cite aussi une démo Replicate (`camenduru/dynami-crafter-576x1024`) et le README un badge OpenXLab ; le README de SEINE cite `replicate.com/lucataco/seine` — [carte HF](https://huggingface.co/Doubiiu/DynamiCrafter_1024) ; [README DynamiCrafter](https://github.com/Doubiiu/DynamiCrafter) ; [README SEINE](https://github.com/Vchitect/SEINE)
- VTG et ImaGINator : aucune démo hébergée référencée par leurs pages — [page VTG](https://mwxely.github.io/projects/yang2025vtg/index.html) ; [README ImaGINator](https://github.com/wyhsirius/ImaGINator)

### Inferences
- Deux minutes de GPU par jour en anonyme permettent au mieux quelques essais. C'est inutilisable pour 1 000 vidéos et réservé à un test qualitatif ponctuel (par exemple ToonCrafter sur deux images clés de la troupe).

### Gaps
- État et gratuité des démos OpenXLab et Replicate : non vérifiés. Replicate facture généralement à l'usage, ce qui n'a pas été confirmé pour ces modèles précis.

---

## 7. Verdict pour notre cas d'usage (garder ou rejeter, avec la raison décisive) et usages de niche

### Takeaway
Les sept projets sont à rejeter comme moteur d'animation des sketchs parlants. Raison décisive commune : ni audio ni lip-sync, des clips de 16 images (environ 2 s) ou presque, et des bases sous licences hors MIT/Apache/BSD. Seuls deux usages de niche méritent un essai encadré : DynamiCrafter-interp ou ToonCrafter pour l'interpolation entre deux images clés, et un plan d'ensemble muet.

### Cited Findings (rappels qui fondent le verdict)
- Pas d'audio ni de lip-sync dans aucun des sept projets (voir la question 2) ; DynamiCrafter produit environ 2 s et 16 images — [carte HF DynamiCrafter](https://huggingface.co/Doubiiu/DynamiCrafter_1024)
- Les visages et les personnes ne sont « may not be generated properly » (DynamiCrafter) — [carte HF](https://huggingface.co/Doubiiu/DynamiCrafter_1024) ; SEINE n'est « not trained to realistically represent people » — [README SEINE](https://github.com/Vchitect/SEINE)
- Open-Sora 2.0 est initialisé depuis FLUX (licence FLUX.1 [dev], non commerciale) et demande 52 à 60 Go de VRAM — [rapport](https://arxiv.org/html/2503.09642v1) ; [LICENSE-FLUX1-dev](https://github.com/black-forest-labs/flux/blob/main/model_licenses/LICENSE-FLUX1-dev) ; [README](https://github.com/hpcaitech/Open-Sora)
- VTG n'a ni code public ni démo, et fait l'objet d'un brevet américain en 2026 — [page projet](https://mwxely.github.io/projects/yang2025vtg/index.html) ; [page auteur](https://mwxely.github.io/)

### Inferences : fiches de verdict

| Projet | Verdict | Raison décisive | Niche éventuelle |
|---|---|---|---|
| **DynamiCrafter** (1024, 512, 256) | **Rejeter** comme moteur principal | 16 images (environ 2 s), paysage 576×1024, aucun lip-sync, visages fragiles d'après les auteurs, a priori appris sur des vidéos réelles ; base SD 2.1 (OpenRAIL++), donc hors règle MIT/Apache/BSD ; code figé depuis 09/2024 | **Interpolation générative** entre deux images clés de même cadrage (modèle 512_interp, 320×512, 8 à 13 Go) pour des plans muets courts ou des raccords. Banc d'essai seulement, poids sous Apache-2.0 mais descendant de SD 2.1 |
| **ToonCrafter** (dérivé) | **Ne garder qu'en essai** de niche | Conçu pour l'interpolation cartoon (adapte l'a priori « live-action » au cartoon) ; 16 images en 320×512 ; « success rate is not guaranteed » ; pas de lip-sync | Images intermédiaires entre deux poses dessinées de la troupe. Démo ZeroGPU fonctionnelle, utile pour juger rapidement |
| **SEINE** | **Rejeter** | 16 images en 240×560 ou 512×512, 250 pas DDPM, base SD 1.4 (OpenRAIL-M), poids sous licence ambiguë, Space en panne, code figé depuis 12/2023 | Transitions de scène génératives entre deux plans. Dépassé par VTG selon l'article VTG ; à remplacer par un modèle début/fin d'image récent (hors de ce lot) |
| **VideoCrafter1 / 2** | **Rejeter** | VideoCrafter2 ne fait pas d'I2V ; l'I2V de VideoCrafter1 (320×512, 16 images) est dernier du lot sur VBench-I2V (82,57 % ; cohérence sujet 91,17 %) ; le README impose un usage « non-commercial » | Aucune |
| **Open-Sora 2.0** | **Rejeter** pour exécution chez nous | Poids initialisés depuis FLUX.1-dev (licence non commerciale) et VAE Hunyuan dans le dépôt ; 52 à 60 Go de VRAM, 1 656 s par clip 768px sur H100 ; pas de lip-sync ni de nœud ComfyUI | Aucune en local. Ses sorties seraient commercialisables selon la licence FLUX, mais l'exécution reste contraire à notre règle |
| **Open-Sora 1.2 / 1.3** | **Rejeter** | Base PixArt-Σ (openrail) ; qualité T2V nettement inférieure (79,76 % VBench pour la 1.2) ; I2V « image = première image » sans contrôle du jeu d'acteur | **Plan d'ensemble muet** (cour, restaurant, ambiance) via le Space gratuit 1.2, dans la limite de 2 min de GPU par jour en anonyme. Faible valeur ajoutée |
| **ImaGINator** | **Rejeter** | GAN de 2020, 64×64, 32 images, visages réels seulement, étiquettes fixes ; poids sans licence ; projet abandonné depuis 2022 | Aucune (intérêt purement historique) |
| **VTG** | **Rejeter** (non exécutable) | Aucun code public, brevet US 2026, benchmark sous CC-BY-NC-4.0 | Idées de méthode (interpolation du bruit latent après inversion DDIM, LoRA par paire, prédiction bidirectionnelle) à n'étudier qu'au vu du brevet |

- Pour le « moteur d'animation » de la troupe, les références à mesurer sont les modèles de 2025-2026 qui dominent VBench-I2V : Wan2.2-I2V-A14B, Wan2.2-TI2V-5B, LTX-2 et HunyuanVideo-I2V. Leur licence et leur prise en charge de la voie audio ou lip-sync sont hors de ce lot et à vérifier dans les lots A et B.

### Gaps
- Aucun essai réel sur nos images n'a été fait dans ce lot. Le verdict repose sur les spécifications publiées, les licences et les benchmarks publics.
- La pertinence de ToonCrafter en tant qu'interpolateur pour un rendu 3D style Pixar (et non pour un dessin animé 2D) reste à mesurer sur la troupe.
