# Modèles de recherche d'animation d'image (lot A) : PIA, Cinemo, ConsistI2V, AnimateAnything, AtomoVideo

Fiches établies le 16/10/2026. Méthode : lecture directe des dépôts GitHub (clonage des métadonnées git : LICENSE, README, fichiers de configuration, historique des commits), des cartes de modèles Hugging Face (API `huggingface.co/api/models`), des articles arXiv (versions HTML), de l'état des Spaces (API `huggingface.co/api/spaces`), du classement VBench-I2V en ligne (tableau extrait de la configuration du Space `Vchitect/VBench_Leaderboard` le 16/10/2026), de la liste officielle des nœuds ComfyUI-Manager et du registre `api.comfy.org`. Un essai réel et anonyme a été lancé sur le seul Space en état de marche (Cinemo).

Rappel du besoin : images fixes de qualité en style 3D cartoon (type Pixar), 2 à 3 personnages africains dans une scène (cour, restaurant en plein air) ; sketchs dialogués d'une minute pour TikTok (voix françaises de synthèse) ; plans de 2 à 4 s ; le personnage qui parle doit bouger naturellement (tête, buste, bras, articulations, lèvres) ; identité et style conservés, sans déformation ; environ 1 000 vidéos ; ni abonnement ni coût par génération.

---

## 1. Licences : code, poids, modèles de base, usage commercial des sorties

### Takeaway (à retenir)
Le code des cinq projets est sous licence permissive (Apache-2.0 ou MIT) ou absent (AtomoVideo), mais aucun des poids ne se réduit à du pur MIT/Apache : PIA et Cinemo embarquent des briques Stable Diffusion 1.x (CreativeML OpenRAIL-M), Cinemo ajoute le décodeur VAE temporel de SVD-XT (Stability AI Community License), ConsistI2V dérive de SD 2.1-base (Open RAIL++-M), AnimateAnything part de VideoComposer, déclaré « RESEARCH/NON-COMMERCIAL USE ONLY », et ses poids n'ont pas de licence propre. AtomoVideo ne publie ni code ni poids.

### Cited Findings (faits sourcés)
**PIA (open-mmlab)**
- Code : fichier LICENSE = Apache License 2.0, 201 lignes (identique sur la branche par défaut `main`) — [LICENSE PIA](https://github.com/open-mmlab/PIA/blob/main/LICENSE)
- Poids : carte HF `Leoxing/PIA` = `license: apache-2.0` ; la carte ne contient que l'en-tête YAML (28 octets) ; un seul fichier `pia.ckpt` de 1 673 373 725 octets ; 0 téléchargement sur 30 jours et 9 « likes » au 16/10/2026 — [HF Leoxing/PIA](https://huggingface.co/Leoxing/PIA)
- Dépendances imposées par le README : Stable Diffusion v1-5 (`git clone https://huggingface.co/runwayml/stable-diffusion-v1-5`), plus des modèles personnalisés DreamBooth/LoRA (RealisticVision, RcnzCartoon, MajicMix) téléchargés par scripts ; module de mouvement issu d'AnimateDiff — [README PIA](https://github.com/open-mmlab/PIA) ; [arXiv 2312.13964](https://arxiv.org/abs/2312.13964)
- Le dépôt `runwayml/stable-diffusion-v1-5` n'existe plus sur l'API HF (réponse non JSON le 16/10/2026) ; la copie maintenue `stable-diffusion-v1-5/stable-diffusion-v1-5` porte `license: creativeml-openrail-m` — [HF SD 1.5](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5)
- CreativeML Open RAIL-M, article 6 : « Licensor claims no rights in the Output You generate using the Model. You are accountable for the Output you generate and its subsequent uses. No use of the output can contravene any provision as stated in the License. » — [LICENSE CompVis/stable-diffusion](https://github.com/CompVis/stable-diffusion/blob/main/LICENSE)
- Le Space officiel PIA charge aussi `h94/IP-Adapter` (`ip-adapter_sd15.bin`) — message d'erreur du Space au 16/10/2026 — [Space Leoxing/PIA](https://huggingface.co/spaces/Leoxing/PIA)

**Cinemo (maxin-cn)**
- Code : LICENSE = Apache License 2.0 (200 lignes) ; README : « The code and model weights are licensed under [LICENSE](LICENSE) » — [GitHub Cinemo](https://github.com/maxin-cn/Cinemo)
- Poids : carte HF `maxin-cn/Cinemo` = `license: apache-2.0`, `pipeline_tag: image-to-video` ; 19 téléchargements sur 30 jours, 32 likes — [HF maxin-cn/Cinemo](https://huggingface.co/maxin-cn/Cinemo)
- Le dépôt de poids contient un pipeline de type `StableDiffusionPipeline` avec `text_encoder` = `openai/clip-vit-large-patch14` (dimension 768, typique de SD 1.x), un VAE `AutoencoderKL` et un dossier `vae_temporal_decoder` dont la config indique `_name_or_path: .../models--diffusers--svd-xt/.../vae`, c'est-à-dire le décodeur VAE temporel de SVD-XT — [config vae_temporal_decoder](https://huggingface.co/maxin-cn/Cinemo/blob/main/vae_temporal_decoder/config.json) ; [config text_encoder](https://huggingface.co/maxin-cn/Cinemo/blob/main/text_encoder/config.json)
- L'article indique que Cinemo est construit sur LaVie, dont il reprend les poids pour l'initialisation — [arXiv 2407.15642](https://arxiv.org/abs/2407.15642) ; LaVie : code sous Apache-2.0 — [LICENSE LaVie](https://github.com/Vchitect/LaVie/blob/main/LICENSE) ; la carte HF `Vchitect/LaVie` ne déclare aucune licence (champ vide) — [HF Vchitect/LaVie](https://huggingface.co/Vchitect/LaVie)
- SVD-XT : `license: other`, `license_name: stable-video-diffusion-community` ; texte = Stability AI Community License (mise à jour du 5 juillet 2024) : usage commercial gratuit si le chiffre d'affaires annuel est inférieur à 1 000 000 USD, inscription obligatoire, mention « Powered by Stability AI », fichier « Notice » ; « You own any outputs generated from the Models » ; interdiction d'utiliser les sorties pour créer ou améliorer un modèle génératif de fondation — [LICENSE SVD-XT](https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/blob/main/LICENSE.md)
- Le décodeur temporel est optionnel dans le code (`enable_vae_temporal_decoder: True` dans la config par défaut) — [configs/sample.yaml](https://github.com/maxin-cn/Cinemo/blob/main/configs/sample.yaml)

**ConsistI2V (TIGER-AI-Lab)**
- Code : LICENSE = MIT, « Copyright (c) 2024 TIGER Lab » — [LICENSE ConsistI2V](https://github.com/TIGER-AI-Lab/ConsistI2V/blob/main/LICENSE)
- Poids : carte HF `TIGER-Lab/ConsistI2V` = `license: mit` ; 26 téléchargements sur 30 jours, 8 likes — [HF TIGER-Lab/ConsistI2V](https://huggingface.co/TIGER-Lab/ConsistI2V)
- Les configs du U-Net, de l'encodeur de texte et du VAE indiquent `_name_or_path: .../stable-diffusion-2-1-base` ; l'article confirme l'initialisation depuis Stable Diffusion 2.1-base — [unet/config.json](https://huggingface.co/TIGER-Lab/ConsistI2V/blob/main/unet/config.json) ; [arXiv 2402.04324](https://arxiv.org/abs/2402.04324)
- SD 2.1-base : une copie clonée de la carte officielle porte `license: openrail++` (CreativeML Open RAIL++-M) — [clone HF de la carte stabilityai/stable-diffusion-2-1-base](https://huggingface.co/kaseris/stable-diffusion-2-1-base/commit/0094d483a120f3f33dafbd187ea4aa60d10de75c) ; le dépôt officiel `stabilityai/stable-diffusion-2-1-base` répond HTTP 401 sur l'API HF le 16/10/2026 (dépôt retiré ou rendu privé), donc le texte officiel n'a pas pu être relu.

**AnimateAnything (alibaba/animate-anything)**
- Code : LICENSE = MIT, « Copyright (c) 2023 Alibaba » — [LICENSE animate-anything](https://github.com/alibaba/animate-anything/blob/main/LICENSE)
- Poids : non hébergés sur Hugging Face par Alibaba ; téléchargés depuis un stockage OSS Alibaba (`animate_anything_512_v1.02.tar`, 7 351 644 160 octets, en ligne le 16/10/2026 ; `animate_anything_svd_v1.0.tar`, 9 018 101 760 octets) ; aucun fichier de licence propre aux poids : **non précisé** — [README animate-anything](https://github.com/alibaba/animate-anything)
- Le dépôt HF `zyand/animate-anything-v1.02` déclare `license: mit` mais ne contient que `.gitattributes` et `README.md` (aucun poids) — [HF zyand/animate-anything-v1.02](https://huggingface.co/zyand/animate-anything-v1.02)
- Modèle de base : l'article dit « Our model is initialized from VideoComposer » — [arXiv 2311.12886](https://arxiv.org/abs/2311.12886) ; le README de VideoComposer (code MIT) précise que le modèle « is intended for RESEARCH/NON-COMMERCIAL USE ONLY » — [README VideoComposer](https://github.com/ali-vilab/videocomposer)
- Les configs d'entraînement citent en commentaire `damo-vilab/text-to-video-ms-1.7b` (ModelScope T2V), sous `cc-by-nc-4.0` — [train_mask_motion.yaml](https://github.com/alibaba/animate-anything/blob/main/example/train_mask_motion.yaml) ; [HF ali-vilab/text-to-video-ms-1.7b](https://huggingface.co/ali-vilab/text-to-video-ms-1.7b)
- Variante SVD : affinée depuis `stable-video-diffusion-img2vid` (Stability AI Community License, voir plus haut) — [train_svd_mask.yaml](https://github.com/alibaba/animate-anything/blob/main/example/train_svd_mask.yaml)

**AtomoVideo (Alimama Tech, Alibaba)**
- Aucun code ni poids publiés. Le seul dépôt public, `atomo-video/atomo-video.github.io`, contient le site web (1 commit, 2024-03-08) ; son LICENSE.txt (Apache-2.0) couvre le code du site, basé sur la page Nerfies — [GitHub atomo-video.github.io](https://github.com/atomo-video/atomo-video.github.io)
- L'article ne mentionne aucune publication de code ou de poids — [arXiv 2403.01800](https://arxiv.org/abs/2403.01800) ; presse chinoise de mars 2024 : seule la page et les vidéos de démonstration sont publiées, le compte GitHub sert uniquement à héberger le site, et la technique est déployée en interne chez Alimama (Wanxiang Lab, plate-forme publicitaire) — [ifeng.com](https://tech.ifeng.com/c/8XkojgSWAiU)
- Base déclarée : Stable Diffusion 1.5 + couches temporelles initialisées depuis AnimateDiff + IP-Adapter SD 1.5 — [arXiv 2403.01800](https://arxiv.org/abs/2403.01800)

**Données d'entraînement communes**
- PIA, Cinemo et ConsistI2V sont entraînés sur WebVid-10M (Cinemo aussi sur Vimeo25M) — articles cités ci-dessus. Le dépôt WebVid indique : « Dataset no longer available, but you can still use it for internal non-commerical purposes », après une mise en demeure de Shutterstock — [README WebVid](https://github.com/m-bain/webvid)

### Inferences (déductions)
- Usage commercial des sorties (vidéos TikTok monétisables) : juridiquement plausible pour PIA, Cinemo et ConsistI2V (OpenRAIL-M et RAIL++-M ne revendiquent pas les sorties, sous réserve des restrictions d'usage ; Stability Community License autorise jusqu'à 1 M USD de CA avec inscription) ; douteux pour AnimateAnything (base VideoComposer « research/non-commercial », poids sans licence) ; sans objet pour AtomoVideo.
- Au regard de la règle maison (« modèles et code exécutés chez nous : MIT, Apache-2.0 ou BSD seulement »), aucun des cinq ne passe strictement : la licence affichée sur la carte (Apache-2.0 ou MIT) ne lève pas les conditions des briques de base embarquées (SD 1.x, SD 2.1, SVD-XT, VideoComposer).
- Les modèles personnalisés Civitai qu'exige PIA pour un rendu « 3D cartoon » (ex. RcnzCartoon) ajoutent chacun leur propre licence, à vérifier fichier par fichier.

### Gaps (manques)
- Texte officiel de la licence SD 2.1-base non relu (dépôt Stability inaccessible le 16/10/2026) ; seule une copie clonée a été lue.
- Licence des poids AnimateAnything hébergés sur OSS Alibaba : non précisé (aucun fichier).
- Licence des modèles personnalisés Civitai utilisés par PIA (RcnzCartoon, ToonYou) non vérifiée.

---

## 2. Ce que fait chaque outil : entrées, durée, résolution, fps, capacité à faire parler

### Takeaway (à retenir)
Les cinq modèles produisent des clips muets de 16 frames (24 pour AtomoVideo) à 8 fps, soit environ 2 s, à basse résolution carrée ou paysage (256×256 à 512×512) ; tous sont pilotés par une image et un texte, avec un réglage d'intensité de mouvement (et un masque de zone pour AnimateAnything). Aucun n'accepte d'audio : pas de synchronisation labiale, la bouche ne peut bouger que de façon générique (« talking », « open mouth » dans le prompt).

### Cited Findings (faits sourcés)
**PIA**
- Entrées : image de condition (première frame), prompt texte, « inter-frame affinity » réglée par l'utilisateur pour la magnitude du mouvement (`--magnitude=0/1/2` = petit, moyen, grand) ; options `--loop` (boucle) et `--style_transfer` — [README PIA](https://github.com/open-mmlab/PIA) ; [arXiv 2312.13964](https://arxiv.org/abs/2312.13964)
- Sortie par défaut : `sample_width: 512`, `sample_height: 512`, `video_length: 16`, 25 pas de débruitage — [example/config/base.yaml](https://github.com/open-mmlab/PIA/blob/main/example/config/base.yaml)
- Le README annonce depuis le 28/12/2023 la prise en charge d'images 1024×1024 avec 16 Go de VRAM grâce à `scaled_dot_product_attention` — [README PIA](https://github.com/open-mmlab/PIA)
- Exemples de prompts du README : « 1boy smiling », « 1boy is waving hands », « 1girl open mouth », « 1man is singing » — [README PIA](https://github.com/open-mmlab/PIA)

**Cinemo**
- Entrées : image (première frame), prompt texte, « motion bucket » (0 à 19, issu du SSIM moyen entre frames), nombre de pas, échelle de guidage, raffinement de bruit DCT (DCTInit) — [arXiv 2407.15642](https://arxiv.org/abs/2407.15642) ; [app.py](https://github.com/maxin-cn/Cinemo/blob/main/app.py)
- Sortie : `video_length: 15` frames générées + la frame d'entrée = 16 frames, `image_size: [320, 512]` (320 de haut × 512 de large), 50 pas DDIM, guidage 7,5 ; fichier MP4 écrit avec `fps=8` — [configs/sample.yaml](https://github.com/maxin-cn/Cinemo/blob/main/configs/sample.yaml) ; [pipelines/animation.py](https://github.com/maxin-cn/Cinemo/blob/main/pipelines/animation.py)
- Résolution « fixed at 320 x 512 » selon les auteurs — [arXiv 2407.15642](https://arxiv.org/abs/2407.15642)
- Allonger la vidéo : le mainteneur répond (31/07/2024) « It can generate 16 frames » et propose d'enchaîner en repartant de la dernière frame ; un utilisateur rapporte que passer à 24 frames dégrade vite (« very jittery, and splotchy ») — [issue #9](https://github.com/maxin-cn/Cinemo/issues/9)
- Applications annexes : édition vidéo et transfert de mouvement (scripts `video_editing.sh`) — [README Cinemo](https://github.com/maxin-cn/Cinemo)

**ConsistI2V**
- Entrées : première frame + prompt texte (+ prompt négatif) ; intervalle entre frames (1 à 5) comme condition de cadence — [arXiv 2402.04324](https://arxiv.org/abs/2402.04324)
- Sortie par défaut : `height: 256`, `width: 256`, `n_frames: 16`, `steps: 50`, `frame_stride: 3` ; configuration autorégressive (`autoregress_steps: 3`) pour enchaîner des segments — [configs/inference/inference.yaml](https://github.com/TIGER-AI-Lab/ConsistI2V/blob/main/configs/inference/inference.yaml) ; [inference_autoregress.yaml](https://github.com/TIGER-AI-Lab/ConsistI2V/blob/main/configs/inference/inference_autoregress.yaml)
- VBench-I2V échantillonne ConsistI2V en 256×256, 8 fps, 16 frames, 2 s — [VBench vbench2_beta_i2v README](https://github.com/Vchitect/VBench/blob/master/vbench2_beta_i2v/README.md)

**AnimateAnything**
- Entrées : image de référence, prompt, **masque de zone de mouvement** (dessiné avec labelme, binaire) et **force du mouvement** (`validation_data.strength`) — [README animate-anything](https://github.com/alibaba/animate-anything) ; [arXiv 2311.12886](https://arxiv.org/abs/2311.12886)
- Sortie : carte HF « generate 2s videos in 8fps. The resolution of generated video is equivalent to 512x512 », images de taille et de rapport quelconques — [HF zyand/animate-anything-v1.02](https://huggingface.co/zyand/animate-anything-v1.02) ; config : 512×512, `fps: 8`, `n_sample_frames: 16` — [train_mask_motion.yaml](https://github.com/alibaba/animate-anything/blob/main/example/train_mask_motion.yaml)
- Le README propose d'agrandir ensuite avec un super-résolveur vidéo cartoon (Real-CUGAN) car « The model output low res videos » ; variante SVD vid2vid (576×1024 en config) — [README animate-anything](https://github.com/alibaba/animate-anything)
- Exemple d'inférence du README : `validation_data.prompt='A cartoon girl is talking.'` sur l'image `barbie2.jpg` — [README animate-anything](https://github.com/alibaba/animate-anything)

**AtomoVideo**
- Entrées : image de référence (latente VAE concaténée au bruit et à un masque binaire, 9 canaux), embeddings CLIP image via IP-Adapter, prompt texte — [arXiv 2403.01800](https://arxiv.org/abs/2403.01800)
- Sortie : 24 frames en 512×512 à l'entraînement, généralisation annoncée jusqu'à 1280×720 ; prédiction itérative (8 frames prises, 16 prédites) pour des vidéos longues (exemple de 7 s) ; fps non indiqué — [arXiv 2403.01800](https://arxiv.org/abs/2403.01800)

### Inferences (déductions)
- Format TikTok 9:16 : aucun des cinq n'a de mode vertical documenté ; Cinemo est figé en paysage 320×512 ; ConsistI2V et PIA sont carrés par défaut (PIA, basé sur SD 1.5 + AnimateDiff, accepte d'autres tailles en pratique, non documenté ici).
- Un plan de 2 à 4 s exige soit d'accepter 2 s à 8 fps puis d'interpoler, soit d'enchaîner 2 segments autorégressifs (ConsistI2V, Cinemo, AtomoVideo), avec la dérive constatée dans l'issue Cinemo #9.
- Le masque de zone d'AnimateAnything est la seule fonction qui colle au besoin « seul le personnage qui parle bouge » ; mais la parole reste générique, sans audio.
- Pour une vraie synchronisation labiale en français, il faut une brique audio→visage en aval (hors de ces cinq outils).

### Gaps (manques)
- fps de sortie de PIA non indiqué (le README et l'article sont muets).
- Aucune mesure publiée de qualité sur des cadrages verticaux.

---

## 3. Qualité sur personnages stylisés 3D et scènes à plusieurs personnes ; modes d'échec ; bancs d'essai ; comparaison aux modèles récents

### Takeaway (à retenir)
Aucun des cinq n'a été évalué sur des personnages 3D cartoon ou sur des scènes à plusieurs personnes ; les seules mesures publiques datent de 2023-2024 et opposent ces modèles à des concurrents de la même époque. Sur le classement VBench-I2V en ligne (16/10/2026), les deux présents sont au bas du tableau : AnimateAnything 86,48 % avec un « Dynamic Degree » de 2,68 % (quasi statique) et ConsistI2V 84,07 % (Dynamic Degree 18,62 %), contre 88,16 à 88,80 % pour Wan 2.2, 87,59 % pour LTX-2 et 86,70 % pour CogVideoX-5b-I2V. Les auteurs d'AtomoVideo écrivent eux-mêmes que l'association avec des modèles de style cartoon « n'est pas facile ».

### Cited Findings (faits sourcés)
**Classement VBench-I2V (extrait du Space officiel le 16/10/2026)** — [VBench Leaderboard](https://huggingface.co/spaces/Vchitect/VBench_Leaderboard)

| Modèle (date d'évaluation) | Total | I2V Score | Quality | Subject Cons. vidéo-image | Dynamic Degree | Aesthetic | Imaging |
|---|---|---|---|---|---|---|---|
| Wan2.2-TI2V-5B, prompt optimisé Qwen (2026-02-12) | 88,80 % | 96,30 % | 81,30 % | 98,43 % | 52,85 % | 64,01 % | 70,70 % |
| Wan2.2-I2V-A14B, prompt optimisé Qwen (2026-03-06) | 88,68 % | 96,51 % | 80,85 % | 98,60 % | 48,62 % | 64,71 % | 70,67 % |
| Wan2.2-I2V-A14B, sans optimisation (2026-02-07) | 88,16 % | 95,82 % | 80,50 % | 97,52 % | 52,85 % | 61,53 % | 70,36 % |
| DynamiCrafter-1024 (2024-07-22) | 87,76 % | 95,02 % | 80,50 % | 98,17 % | 47,40 % | 66,46 % | 69,34 % |
| LTX-2-I2V, sans optimisation (2026-02-06) | 87,59 % | 96,53 % | 78,65 % | 99,38 % | 8,54 % | 63,61 % | 72,72 % |
| Wan2.1-I2V-14B-720P (2025-05-08) | 86,86 % | 92,90 % | 80,82 % | 96,95 % | 51,38 % | 64,75 % | 70,44 % |
| CogVideoX-5b-I2V (2025-03-31) | 86,70 % | 94,79 % | 78,61 % | 97,19 % | 33,17 % | 61,87 % | 70,01 % |
| **Animate-Anything** (2024-07-22) | **86,48 %** | 94,25 % | 78,71 % | 98,76 % | **2,68 %** | 67,12 % | 72,09 % |
| **ConsistI2V** (2024-07-22) | **84,07 %** | 91,91 % | 76,22 % | 95,82 % | **18,62 %** | 59,00 % | 66,92 % |

- Le classement VBench-I2V ne contient ni PIA, ni Cinemo, ni AtomoVideo (liste des modèles échantillonnés par l'équipe VBench) — [VBench vbench2_beta_i2v README](https://github.com/Vchitect/VBench/blob/master/vbench2_beta_i2v/README.md)
- Pondérations du score I2V : Dynamic Degree pèse 0,5, Camera Motion 0,1, les autres dimensions 1 — [constants.py du Space](https://huggingface.co/spaces/Vchitect/VBench_Leaderboard/blob/main/constants.py)
- Anomalie relevée : la ligne CogVideoX1.5-5B-I2V du tableau en ligne a des colonnes visiblement décalées (Imaging Quality 97,07 %) ; elle n'est pas reprise ici — [VBench Leaderboard](https://huggingface.co/spaces/Vchitect/VBench_Leaderboard)

**PIA**
- AnimateBench (105 cas, 7 modèles personnalisés, 3 prompts par image) : score CLIP image/texte 93,44 / 68,74 contre 90,10 / 66,17 (VideoComposer) et 89,72 / 68,41 (AnimateDiff) ; étude utilisateurs (20 questions, 20 participants) : préférence 0,525 / 0,670 — [arXiv 2312.13964](https://arxiv.org/abs/2312.13964)
- Gen-2 et Pika ne sont comparés que qualitativement ; les auteurs disent qu'ils « respond less to the prompt » — [arXiv 2312.13964](https://arxiv.org/abs/2312.13964)
- Modes d'échec déclarés : écart de couleur quand le style de l'image s'éloigne des données d'entraînement ; incohérences de couleur si les mots déclencheurs du modèle personnalisé manquent dans le prompt ; attribués en partie à WebVid (flou de mouvement, compression) — [arXiv 2312.13964](https://arxiv.org/abs/2312.13964)
- Issue #24 « The generated face easily collapses. », ouverte le 28/12/2023, toujours ouverte — [issue #24](https://github.com/open-mmlab/PIA/issues/24)
- Issue #51 (25/07/2024) : sur des images de style anime, la vidéo reste difficilement cohérente avec l'image d'entrée, y compris avec `rcnzCartoon3d_v10` et un modèle réentraîné sur des données anime ; pas de réponse des mainteneurs, issue fermée par son auteur — [issue #51](https://github.com/open-mmlab/PIA/issues/51)
- Démonstrations officielles en style « RCNZ Cartoon 3d » (personnage seul, plan rapproché) — [README PIA](https://github.com/open-mmlab/PIA)

**Cinemo**
- UCF-101 : FVD 168,16, IS 58,71, FID 13,17 ; MSR-VTT : FVD 93,51, CLIPSIM 0,2858 ; meilleur que ConsistI2V (177,66 / 56,22 / 15,74 ; 104,58 / 0,2674), SEINE, DynamiCrafter, I2VGen-XL ; pas d'étude utilisateurs ; PIA et SVD comparés qualitativement seulement — [arXiv 2407.15642](https://arxiv.org/abs/2407.15642)
- Limites déclarées : performances bornées par LaVie, résolution figée 320×512 ; aucune mention de cartoon, de parole ni de scènes à plusieurs personnes — [arXiv 2407.15642](https://arxiv.org/abs/2407.15642)
- Exemples officiels : « People Walking », « Girl Dancing under the Stars », « Snowman Waving his Hand » — [README Cinemo](https://github.com/maxin-cn/Cinemo)

**ConsistI2V**
- UCF-101 : FVD 177,66 / IS 56,22 / FID 15,74 ; MSR-VTT : FVD 104,58 / CLIPSIM 0,2674 ; I2V-Bench : dynamic degree 37,48, subject consistency 90,85 ; évaluation humaine (548 échantillons, 1 061 réponses, 13 participants) : apparence 53,62 %, mouvement 37,04 % (meilleur score contre SEINE, DynamiCrafter, AnimateAnything, I2VGen-XL) — [arXiv 2402.04324](https://arxiv.org/abs/2402.04324)
- Modes d'échec déclarés : résolution faible ; filigrane WebVid pouvant contaminer les vidéos ; amplitude de mouvement parfois limitée et mouvement lent ; adaptation difficile aux modèles T2I personnalisés ; mêmes faiblesses que Stable Diffusion sur les visages humains et le texte — [arXiv 2402.04324](https://arxiv.org/abs/2402.04324)

**AnimateAnything**
- MSR-VTT zéro-shot : FVD 443 (meilleur que VideoCrafter1 465, VideoComposer 551, ModelScope 550) ; précision du masque de mouvement 0,82 ; erreur de force de mouvement 2,36 ; pas d'étude utilisateurs — [arXiv 2311.12886](https://arxiv.org/abs/2311.12886)
- Mesuré par des tiers : dynamic degree 3,69 sur I2V-Bench (décrit comme quasi statique), FVD UCF-101 642,64, préférence humaine « mouvement » 20,26 % — [arXiv 2402.04324](https://arxiv.org/abs/2402.04324) ; Dynamic Degree 2,68 % sur VBench-I2V — [VBench Leaderboard](https://huggingface.co/spaces/Vchitect/VBench_Leaderboard)
- Modes d'échec déclarés : pas entraîné en haute résolution ; quand le texte contredit l'image, l'image l'emporte ; une force de mouvement excessive fait perdre les détails fins du visage — [arXiv 2311.12886](https://arxiv.org/abs/2311.12886)

**AtomoVideo**
- AIGCBench : SSIM 0,759, ICS 0,9938, CLIP 0,279, RAFT 3,124, DOVER 0,804 ; meilleur des modèles ouverts comparés (SVD : 0,615 / 0,9830 / 0,273 / 2,778 / 0,726), mais derrière Gen-2 en SSIM, ICS et DOVER — [arXiv 2403.01800](https://arxiv.org/abs/2403.01800)
- Limites déclarées : cohérence d'image et qualité « slightly lower » que les commerciaux ; association difficile avec des modèles de style cartoon, la fidélité étant privilégiée ; compatibilité ControlNet/LoRA affirmée, non démontrée — [arXiv 2403.01800](https://arxiv.org/abs/2403.01800)

### Inferences (déductions)
- Les scores de cohérence très élevés d'AnimateAnything (Subject 98,76 %) s'expliquent par l'absence de mouvement (Dynamic Degree 2,68 %) : il conserve l'identité parce qu'il ne bouge presque pas, ce qui va à l'encontre d'un personnage qui gesticule en parlant.
- Sur des scènes 3D cartoon à 2-3 personnages, aucune preuve publique ; les signaux disponibles (issues PIA #24 et #51, aveu d'AtomoVideo sur le cartoon, faiblesse de ConsistI2V sur les visages) annoncent dérive d'identité et visages instables.
- Les modèles de 2025-2026 (Wan 2.2, LTX-2) dépassent nettement ces cinq outils en mouvement et en qualité d'image, avec des clips d'environ 5 s de 832×480 (Wan2.2-I2V-A14B) à 1536×1024 (LTX-2) dans le protocole VBench, contre 2 s et 256 à 512 px ([VBench vbench2_beta_i2v README](https://github.com/Vchitect/VBench/blob/master/vbench2_beta_i2v/README.md)). Nuance : LTX-2 a un Dynamic Degree bas (8,54 %), donc lui aussi bouge peu sans prompt optimisé.

### Gaps (manques)
- Aucune mesure publiée, ni par les auteurs ni par des tiers, sur des personnages 3D stylisés ou des scènes à plusieurs personnes pour ces cinq modèles.
- PIA, Cinemo et AtomoVideo absents de VBench-I2V : pas de comparaison directe avec Wan, LTX ou CogVideoX.
- Un test maison sur nos images (mesure identité, déformation, mouvement) n'a pas pu être fait : pas de GPU dans ce conteneur, et le quota anonyme du seul Space en marche est épuisé (voir question 6).

---

## 4. Matériel, temps par clip, voie CPU, dates de sortie et maintenance

### Takeaway (à retenir)
Ce sont des modèles légers à faire tourner (environ 6 à 16 Go de VRAM, 14 à 22 s par clip de 2 s sur A100 ou RTX 4090 selon les auteurs), mais ils ne sont plus maintenus : derniers commits de code entre juin et octobre 2024, seule une retouche du README de Cinemo date de mai 2025. Aucune voie CPU n'est réellement documentée.

### Cited Findings (faits sourcés)
- **PIA** : inférence 512×512 en environ 13,8 s sur une A100 (25 pas DDIM, guidage 7,5) ; entraînement sur 16 A100, 4 500 pas — [arXiv 2312.13964](https://arxiv.org/abs/2312.13964) ; 1024×1024 avec 16 Go grâce à `scaled_dot_product_attention` (PyTorch 2.0 recommandé) — [README PIA](https://github.com/open-mmlab/PIA). Premier commit « release » le 22/12/2023 ; dernier commit le 05/08/2024 (« Merge pull request #53 ») ; 41 commits — historique git du [dépôt PIA](https://github.com/open-mmlab/PIA/commits/main). Publication CVPR 2024 — [README PIA](https://github.com/open-mmlab/PIA)
- **Cinemo** : entraînement sur 8 A100 80 Go pendant une semaine — [arXiv 2407.15642](https://arxiv.org/abs/2407.15642) ; le mainteneur répond (12/03/2025) « I use A100 (80g) for inference » et « I think 3090 can also run the model » ; aucune valeur de VRAM ni de temps publiée — [issue #16](https://github.com/maxin-cn/Cinemo/issues/16). Poids : `unet` 3 644 720 235 octets, `cinemo.pt` 3 644 718 107 octets, encodeur texte 492 Mo, VAE 335 Mo, décodeur temporel 391 Mo — [arborescence HF](https://huggingface.co/maxin-cn/Cinemo/tree/main). La carte HF mentionne une exécution CPU possible en retirant `cudatoolkit` et `pytorch-cuda` de l'environnement (passage commenté dans le README GitHub) — [carte HF Cinemo](https://huggingface.co/maxin-cn/Cinemo). Premier commit 02/06/2024 ; dernier commit 17/05/2025 (« Update README.md ») ; 81 commits ; article accepté à CVPR 2025 (annonce du 27/02/2025) ; code d'entraînement demandé (issue #8, ouverte depuis le 31/07/2024) — [dépôt Cinemo](https://github.com/maxin-cn/Cinemo) ; [issues Cinemo](https://github.com/maxin-cn/Cinemo/issues)
- **ConsistI2V** : sur une RTX 4090, float32, lot de 1 : 9 249 Mo de mémoire GPU et 18,48 s par génération (256×256, 16 frames) ; entraînement : lot 192, 170 000 pas (GPU non précisés) — [arXiv 2402.04324](https://arxiv.org/abs/2402.04324). Premier commit 06/02/2024 ; code et modèle publiés le 26/02/2024 ; dernier commit 27/06/2024 ; 15 commits ; article TMLR 2024 selon le README — [dépôt ConsistI2V](https://github.com/TIGER-AI-Lab/ConsistI2V)
- **AnimateAnything** : environ 6 Go de VRAM en inférence (5,9 Go mesurés), 21,54 s (configuration de mesure non précisée) ; affinage sur une A10 en un jour (environ 20 Go) — [arXiv 2311.12886](https://arxiv.org/abs/2311.12886) ; affinage complet en mode DeepSpeed sur 4 V100 16 Go, variante SVD sur 4 A10 24 Go, affinage SVD avec masque « around 80G GPU RAM » — [README animate-anything](https://github.com/alibaba/animate-anything). Premier commit 08/12/2023 ; modèle v1.02 le 18/12/2023 ; variante SVD le 27/12/2023 ; dernier commit 18/10/2024 (README, lien vers Tora) ; 82 commits — [dépôt animate-anything](https://github.com/alibaba/animate-anything)
- **AtomoVideo** : article du 04/03/2024 (v2 le 05/03/2024) ; matériel non indiqué ; pas de code — [arXiv 2403.01800](https://arxiv.org/abs/2403.01800)

### Inferences (déductions)
- Volume visé : 1 000 sketchs d'une minute en plans de 2 à 4 s, soit 15 000 à 30 000 plans. À environ 14 à 22 s par clip de 2 s (chiffres des auteurs), 15 000 clips représentent environ 58 h (PIA, A100), 77 h (ConsistI2V, RTX 4090) ou 90 h (AnimateAnything) de GPU, hors agrandissement, interpolation et retouches. Le temps n'est donc pas le frein ; c'est la qualité et la durée du clip qui le sont.
- Une carte grand public de 12 à 16 Go suffirait pour PIA (512 px), ConsistI2V et AnimateAnything d'après les chiffres publiés ; pour Cinemo, rien n'est publié (UNet de 3,6 Go en fp32).
- Avec des derniers commits en 2024, toute incompatibilité avec les versions récentes de PyTorch ou de diffusers restera à notre charge (déjà visible : le Space ConsistI2V est en « CONFIG_ERROR » pour version de torch incompatible, question 6).

### Gaps (manques)
- VRAM et temps d'inférence de Cinemo : non publiés.
- Temps d'AnimateAnything : GPU de mesure non précisé dans l'article.
- Aucune mesure CPU publiée pour aucun des cinq.

---

## 5. Prise en charge ComfyUI

### Takeaway (à retenir)
Seul PIA fonctionne dans ComfyUI, via le pack de nœuds ComfyUI-AnimateDiff-Evolved (Apache-2.0, maintenu : version 1.6.0 du 28/07/2026). Cinemo, ConsistI2V, AnimateAnything et AtomoVideo n'ont aucun nœud référencé dans la liste officielle de ComfyUI-Manager ni dans le registre Comfy au 16/10/2026.

### Cited Findings (faits sourcés)
- ComfyUI-AnimateDiff-Evolved (Kosinkadink) : « PIA support, with the model pia.ckpt » ; nécessite le `beta_schedule` `autoselect` ou `sqrt_linear (AnimateDiff)` et le nœud Gen2 « Apply AnimateDiff-PIA Model » pour fournir l'image ; réglages via « PIA Input [Paper Presets] » ou « PIA Input [Multival] » ; prise en charge fp8 et Mac M1/M2/M3 — [README AnimateDiff-Evolved](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved)
- Licence du pack : Apache License 2.0 ; dernier commit le 28/07/2026 (« Bump version to 1.6.0 ») — historique git de [ComfyUI-AnimateDiff-Evolved](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved)
- Nom de classe du nœud : `ADE_ApplyAnimateDiffModelWithPIA` — [RunComfy](https://www.runcomfy.com/comfyui-nodes/ComfyUI-AnimateDiff-Evolved/ADE_ApplyAnimateDiffModelWithPIA)
- Recherche dans la liste officielle `custom-node-list.json` de ComfyUI-Manager (6 026 entrées, téléchargée le 16/10/2026) : aucune entrée contenant « cinemo », « consisti2v », « animate-anything », « animateanything » ou « atomovideo » — [custom-node-list.json](https://github.com/ltdrdata/ComfyUI-Manager/blob/main/custom-node-list.json)
- Registre Comfy (`api.comfy.org/nodes/search`) : aucun résultat pour cinemo, consisti2v, animate-anything, animateanything, atomo — [registre Comfy](https://registry.comfy.org)
- Cinemo : issue #2 « ComfyUI surpport? », ouverte depuis le 23/07/2024, toujours ouverte — [issues Cinemo](https://github.com/maxin-cn/Cinemo/issues)
- PIA : issue #28 demandant une extension SD-WebUI ou ComfyUI, fermée le 02/07/2024 — [issues PIA](https://github.com/open-mmlab/PIA/issues?q=is%3Aissue)

### Inferences (déductions)
- Pour Cinemo, ConsistI2V et AnimateAnything, l'intégration passerait par un nœud maison enveloppant leur script Python (diffusers ancien) ; AtomoVideo est inintégrable faute de poids.
- PIA via AnimateDiff-Evolved permet de le chaîner avec des LoRA SD 1.5, ControlNet et l'interpolation dans un même graphe, mais reste limité par SD 1.5 et des clips de 16 frames.

### Gaps (manques)
- Des dépôts de nœuds non référencés peuvent exister sur GitHub ; la recherche GitHub authentifiée était bloquée dans cette session (seuls quelques noms probables ont été testés, tous absents).

---

## 6. Démo hébergée gratuite (Space Hugging Face) et usage anonyme aujourd'hui

### Takeaway (à retenir)
Le 16/10/2026, un seul Space officiel tourne (Cinemo, sur ZeroGPU) ; ceux de PIA et ConsistI2V sont en panne, AnimateAnything et AtomoVideo n'ont pas de démo officielle. Notre essai anonyme sur Cinemo a été refusé immédiatement pour quota ZeroGPU épuisé ; même avec un compte gratuit (5 min de GPU par jour), on ne ferait que 3 clips par jour environ.

### Cited Findings (faits sourcés)
- **Cinemo** : Space `maxin-cn/Cinemo` en état `RUNNING` sur `zero-a10g` (matériel affiché par l'API), modifié le 14/07/2026, 205 likes — [Space maxin-cn/Cinemo](https://huggingface.co/spaces/maxin-cn/Cinemo)
- Essai anonyme du 16/10/2026 (gradio_client, sans jeton, image d'exemple du dépôt `forest.jpg` réduite en 512×320, 50 pas) : échec en 1,5 s avec le message « You have exceeded your ZeroGPU quota (90s requested vs. 0s left) ... Authenticate with a Hugging Face token for more quota » — essai réalisé dans cette session sur [Space maxin-cn/Cinemo](https://huggingface.co/spaces/maxin-cn/Cinemo)
- Quotas ZeroGPU officiels : non authentifié 2 minutes par jour (priorité basse), compte gratuit 5 minutes, PRO 40 minutes ; matériel ZeroGPU = moitié d'une NVIDIA RTX Pro 6000 Blackwell (48 Go) par défaut ; au-delà, crédits prépayés à 1 USD les 10 minutes (PRO, Team, Enterprise) — [Documentation ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu)
- **PIA** : Space `Leoxing/PIA` en `RUNTIME_ERROR` (matériel demandé `a10g-small`, aucun matériel attribué ; erreur de chargement `h94/IP-Adapter`), dernière modification le 29/01/2024 — [Space Leoxing/PIA](https://huggingface.co/spaces/Leoxing/PIA) ; autres accès listés dans le README : OpenXLab, Colab tiers (camenduru), Replicate — [README PIA](https://github.com/open-mmlab/PIA)
- **ConsistI2V** : Space `TIGER-Lab/ConsistI2V` en `CONFIG_ERROR` : « torch version in requirements.txt is not compatible with ZeroGPU. Supported versions: 2.11.0, 2.10.0, 2.9.1, 2.8.0 » ; copie `fantaxy/ConsistI2V` en pause (`PAUSED`) — [Space TIGER-Lab/ConsistI2V](https://huggingface.co/spaces/TIGER-Lab/ConsistI2V) ; [Space fantaxy/ConsistI2V](https://huggingface.co/spaces/fantaxy/ConsistI2V)
- **AnimateAnything** : pas de Space officiel ; deux Spaces tiers « Animate-Anything-Vid2Vid » (variante vidéo vers vidéo) en `BUILD_ERROR` (« Error while cloning repository », « OOMKilled ») — [talalif/Animate-Anything-Vid2Vid](https://huggingface.co/spaces/talalif/Animate-Anything-Vid2Vid) ; [sisisilll/Animate-Anything-Vid2Vid](https://huggingface.co/spaces/sisisilll/Animate-Anything-Vid2Vid). Un notebook Colab est fourni pour la variante SVD vid2vid — [README animate-anything](https://github.com/alibaba/animate-anything)
- **AtomoVideo** : aucune démo en ligne (seulement vidéos sur la page du projet) — [ifeng.com](https://tech.ifeng.com/c/8XkojgSWAiU) ; [page projet](https://atomo-video.github.io/)

### Inferences (déductions)
- Avec 90 s de quota par génération demandées par le Space Cinemo : 1 clip par jour en anonyme (2 min), environ 3 en compte gratuit (5 min) ; pour 15 000 à 30 000 plans, la voie Space gratuite est inopérante à cette échelle ; seule une exécution locale ou sur GPU gratuit (Colab, Kaggle) est envisageable.
- Le refus immédiat (« 0s left ») sur notre adresse de sortie suggère que le quota anonyme est partagé par adresse IP ; depuis un poste personnel, le résultat peut différer.
- Replicate (badge du README PIA) est un service facturé au calcul, donc hors budget.

### Gaps (manques)
- Pas de génération réelle obtenue sur nos images (quota épuisé, pas de GPU local dans le conteneur) : temps réel sur ZeroGPU non mesuré.
- État de la démo OpenXLab de PIA non vérifié (plateforme chinoise, connexion probablement requise).

---

## 7. Verdict pour notre usage (sketchs dialogués TikTok, 3D cartoon, 2 à 3 personnages, ~1 000 vidéos, 0 € par génération)

### Takeaway (à retenir)
Rejet des cinq comme moteur principal du personnage qui parle. Raison décisive commune : clips muets de 2 s à 256-512 px sans entrée audio (donc aucune synchronisation labiale), mouvement faible ou visages instables, aucune preuve sur la 3D cartoon multi-personnages, projets non maintenus depuis 2024 et licences de poids qui ne passent pas la règle maison MIT/Apache/BSD. AnimateAnything garde un intérêt d'idée (le masque de zone de mouvement) à reproduire dans notre moteur, pas comme modèle à déployer.

### Cited Findings (faits sourcés)
- PIA : 16 frames 512×512 sur SD 1.5 — [base.yaml](https://github.com/open-mmlab/PIA/blob/main/example/config/base.yaml) ; visages qui « collapse » (issue ouverte) — [issue #24](https://github.com/open-mmlab/PIA/issues/24) ; incohérence sur l'anime/cartoon 3D — [issue #51](https://github.com/open-mmlab/PIA/issues/51) ; seul des cinq disponible dans ComfyUI — [AnimateDiff-Evolved](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved)
- Cinemo : résolution figée 320×512 (paysage), 16 frames — [arXiv 2407.15642](https://arxiv.org/abs/2407.15642) ; décodeur temporel SVD-XT sous Stability Community License — [config](https://huggingface.co/maxin-cn/Cinemo/blob/main/vae_temporal_decoder/config.json) ; pas de nœud ComfyUI — [issue #2](https://github.com/maxin-cn/Cinemo/issues)
- ConsistI2V : 256×256, faiblesse déclarée sur les visages et mouvements lents — [arXiv 2402.04324](https://arxiv.org/abs/2402.04324) ; dernier du classement VBench-I2V parmi les modèles cités (84,07 %) — [VBench Leaderboard](https://huggingface.co/spaces/Vchitect/VBench_Leaderboard)
- AnimateAnything : quasi statique (Dynamic Degree 2,68 %) — [VBench Leaderboard](https://huggingface.co/spaces/Vchitect/VBench_Leaderboard) ; base VideoComposer « RESEARCH/NON-COMMERCIAL USE ONLY » — [README VideoComposer](https://github.com/ali-vilab/videocomposer) ; masque de zone et force de mouvement — [README animate-anything](https://github.com/alibaba/animate-anything)
- AtomoVideo : ni code ni poids, difficulté déclarée avec les modèles cartoon — [arXiv 2403.01800](https://arxiv.org/abs/2403.01800) ; [atomo-video.github.io](https://github.com/atomo-video/atomo-video.github.io)

| Outil | Verdict | Raison décisive |
|---|---|---|
| PIA | Rejeter | SD 1.5, 2 s en 512 px, visages instables et cartoon incohérent (issues #24 et #51), dépendance OpenRAIL-M + modèles Civitai ; seul atout : nœud ComfyUI maintenu |
| Cinemo | Rejeter | 320×512 paysage figé, 16 frames, dégradation au-delà, aucune donnée VRAM, Space seul inutilisable à l'échelle (2 à 5 min de GPU par jour) |
| ConsistI2V | Rejeter | 256×256, visages faibles, mouvement lent, 84,07 % sur VBench-I2V |
| AnimateAnything | Rejeter comme modèle ; reprendre l'idée du masque | Quasi statique (2,68 %), poids sans licence sur une base non commerciale ; le masque « seule la zone choisie bouge » est l'idée à greffer |
| AtomoVideo | Rejeter | Aucun code ni poids publiés |

### Inferences (déductions)
- Pour ce besoin, la comparaison utile se fait avec les modèles ouverts de 2025-2026 du classement VBench-I2V (Wan 2.2 TI2V-5B et I2V-A14B, LTX-2), plus des briques dédiées audio→visage pour la parole ; ces pistes sortent du périmètre de ce lot et sont couvertes par les autres chercheurs.
- Idée à reprendre dans notre moteur : le conditionnement par masque de zone d'AnimateAnything (seul le personnage qui parle s'anime, le reste de l'image est figé), combiné à un pilotage audio des lèvres ; c'est une méthode publiée, réécrivable sous licence maison.

### Gaps (manques)
- Verdict fondé sur les publications et l'état des dépôts, pas sur un essai de nos propres images (aucun GPU local, quota du Space épuisé).
