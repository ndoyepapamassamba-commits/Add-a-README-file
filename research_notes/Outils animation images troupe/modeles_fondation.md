# Modèles de fondation image → vidéo à poids ouverts : lequel anime le mieux nos images de la troupe ? (Wan 2.2, LTX, CogVideoX, SVD, AnimateDiff ; comparaison HunyuanVideo et Mochi)

Veille faite le 16/10/2026. Méthode : fiches Hugging Face lues par l'API officielle (`/api/models/<id>` : champ licence, date de création, accès conditionné) ; **textes de licence téléchargés et lus** (fichiers `LICENSE*` des dépôts HF officiels, et `LICENSE` des dépôts GitHub via raw.githubusercontent.com) ; classement VBench lu **dans les données mêmes du Space officiel** `Vchitect/VBench_Leaderboard` (configuration Gradio, tableaux T2V et I2V) ; classement image → vidéo d'Artificial Analysis lu en direct ; documentation ComfyUI lue dans ses fichiers source (`docs.comfy.org/*.md`). « Vérifiée » = texte de licence lu le 16/10/2026 ; « déclarée » = champ `license:` de la fiche seulement ; « note interne 14/10 » = fait relu le 14/10/2026 par un autre chercheur du projet (fichier `research_notes/Animer Blender par prompt/modeles_video_ouverts_pilotes.md`), avec sa source primaire. Les calculs marqués « dérivé » sont des multiplications de chiffres cités, pas des mesures.

Rappel du cas : images fixes de haute qualité, 3D cartoon type Pixar, 2–3 personnages africains (cour, restaurant en plein air) ; sketchs dialogués en français d'une minute pour TikTok (9:16), plans de 2–4 s ; le personnage qui parle doit bouger tête, buste, bras, articulations sans déformation ni perte d'identité/style ; ≈ 1 000 vidéos ; ni abonnement ni paiement à la génération. Règle du dépôt : modèles et code exécutés chez nous en MIT / Apache-2.0 / BSD seulement.

---

## Q1. Licences du code ET des poids, version par version — la monétisation TikTok/YouTube est-elle permise ?

### Takeaway
Seule la **famille Wan 2.2 (TI2V-5B, I2V-A14B, S2V-14B, Animate-14B) est Apache-2.0 pour le code et les poids** : monétisation libre, sans seuil ni enregistrement, et seule famille image → vidéo qui passe la règle MIT/Apache/BSD du projet. Les autres autorisent le commercial **sous conditions** (LTX ≥ 0.9.5 : gratuit sous 10 M$ de CA ; SVD : gratuit sous 1 M$ de CA avec enregistrement ; CogVideoX-5B/1.5 : enregistrement + ≤ 1 M visites/mois, licence révocable, droit chinois ; Hunyuan : exclu en UE/Royaume-Uni/Corée du Sud) ou **l'interdisent** (LTX-Video 0.9 et 0.9.1 = recherche seulement). Mochi est Apache-2.0 mais texte → vidéo seulement.

### Cited Findings

**Tableau des licences (lues le 16/10/2026 sauf mention)**

| Modèle | Code | Poids (fichier exact) | Commercial (TikTok/YouTube) |
|---|---|---|---|
| Wan2.2 TI2V-5B, I2V-A14B, S2V-14B, Animate-14B | Apache-2.0 vérifiée (note interne 14/10) — [GitHub Wan2.2 LICENSE.txt](https://github.com/Wan-Video/Wan2.2/blob/main/LICENSE.txt) | `license: apache-2.0` déclarée sur les 4 fiches, **aucun fichier LICENSE dans les dépôts HF** — [API HF Wan2.2-I2V-A14B](https://huggingface.co/api/models/Wan-AI/Wan2.2-I2V-A14B), [API HF Wan2.2-TI2V-5B](https://huggingface.co/api/models/Wan-AI/Wan2.2-TI2V-5B), [API HF Wan2.2-S2V-14B](https://huggingface.co/api/models/Wan-AI/Wan2.2-S2V-14B), [API HF Wan2.2-Animate-14B](https://huggingface.co/api/models/Wan-AI/Wan2.2-Animate-14B) | **Oui**, sans seuil. Fiche S2V : « The models in this repository are licensed under the Apache 2.0 License. We claim no rights over the your generated contents… » + interdiction de contenus illégaux, nuisibles, de désinformation — [HF Wan2.2-S2V-14B](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B) |
| LTX-Video 2B **0.9** et **0.9.1** | Apache-2.0 vérifiée — [GitHub LTX-Video LICENSE](https://github.com/Lightricks/LTX-Video/blob/main/LICENSE) | « RAIL-M License dated November 22, 2024 » ; « “Permitted Purpose” means for academic or research purposes only, and explicitly excludes commercialization » — [ltx-video-2b-v0.9.license.txt](https://huggingface.co/Lightricks/LTX-Video/blob/main/ltx-video-2b-v0.9.license.txt), [ltx-video-2b-v0.9.1.license.txt](https://huggingface.co/Lightricks/LTX-Video/blob/main/ltx-video-2b-v0.9.1.license.txt) | **Non** (recherche seulement) |
| LTX-Video 2B **0.9.5** | idem | « Open RAIL-M License dated March 5, 2025 » : « this License … allows commercia[l] use of the Model », avec restrictions d'usage (Attachment A) — [ltx-video-2b-v0.9.5.license.txt](https://huggingface.co/Lightricks/LTX-Video/blob/main/ltx-video-2b-v0.9.5.license.txt) | **Oui**, restrictions d'usage (dont obligation de signaler un contenu généré par machine, clause (e)) |
| LTX-Video **0.9.6 → 0.9.8** (2B et 13B, dev/distilled/fp8, IC-LoRA, upscalers) | idem | « LTXV Open Weights License 0.X, License date: April 15, 2025 (applicable to all LTXV model versions released since April 15, 2025 (v0.9.6)) » : usage « for any purpose » mais les entités à **CA annuel ≥ 10 000 000 $** doivent acheter une licence commerciale — [LTX-Video-Open-Weights-License-0.X.txt](https://huggingface.co/Lightricks/LTX-Video/blob/main/LTX-Video-Open-Weights-License-0.X.txt) ; correspondance version ↔ fichier de licence affichée sur la fiche — [HF Lightricks/LTX-Video](https://huggingface.co/Lightricks/LTX-Video) | **Oui sous 10 M$ de CA** ; même clause (e) « machine generated » |
| **LTX-2** (19B) / **LTX-2.3** (22B) | nœuds et code sous licence maison (note interne 14/10 : nœuds ComfyUI-LTXVideo = LTX-2 Community License) — [GitHub ComfyUI-LTXVideo LICENSE](https://github.com/Lightricks/ComfyUI-LTXVideo/blob/master/LICENSE) | « LTX-2 Community License Agreement, License date: January 5, 2026 » : entités à CA ≥ 10 000 000 $ → licence payante ; restriction n° 18 « For commercial use only: To train, improve, or fine-tune any other machine learning model … » ; clause « machine generated » ; clause sanctions — [HF LTX-2 LICENSE](https://huggingface.co/Lightricks/LTX-2/blob/main/LICENSE) ; fiche LTX-2.3 `ltx-2-community-license-agreement` — [API HF LTX-2.3](https://huggingface.co/api/models/Lightricks/LTX-2.3) | **Oui sous 10 M$ de CA** |
| **LTX-2.5** (22B, 23/07/2026, dépôt conditionné `gated: auto`) | idem | `ltx-2.x-community-license-agreement` — [API HF LTX-2.5](https://huggingface.co/api/models/Lightricks/LTX-2.5) ; texte `LICENSE-2_x` du 11/08/2026, même seuil 10 M$ (note interne 14/10) — [GitHub LTX-2 LICENSE-2_x](https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x) | **Oui sous 10 M$ de CA** |
| CogVideoX-**2B** (T2V seulement) | Apache-2.0 vérifiée — [GitHub CogVideo LICENSE](https://github.com/zai-org/CogVideo/blob/main/LICENSE) | `apache-2.0` + fichier LICENSE — [API HF CogVideoX-2b](https://huggingface.co/api/models/zai-org/CogVideoX-2b), [LICENSE 2b](https://huggingface.co/zai-org/CogVideoX-2b/blob/main/LICENSE) | Oui (mais pas d'I2V officiel en 2B) |
| CogVideoX-**5B**, **5B-I2V**, **1.5-5B**, **1.5-5B-I2V** | idem | « The CogVideoX License » (fichiers identiques pour 5B-I2V et 1.5-5B-I2V) : recherche libre ; commercial = **s'enregistrer** sur open.bigmodel.cn pour une licence de base gratuite ; « the number of service users (visits) for your commercial activities must not exceed **1 million visits per month** » ; licence « revocable » ; « not use the Software for any act that may undermine China's national security » ; droit de la RPC, tribunal de Haidian — [LICENSE 5b-I2V](https://huggingface.co/zai-org/CogVideoX-5b-I2V/blob/main/LICENSE), [LICENSE 1.5-5B-I2V](https://huggingface.co/zai-org/CogVideoX1.5-5B-I2V/blob/main/LICENSE) | **Oui sous conditions** (enregistrement, plafond de visites, révocable) |
| SVD (14 images), SVD-XT (25 images), **SVD-XT 1.1** | code `generative-models` : MIT vérifiée — [GitHub LICENSE-CODE](https://github.com/Stability-AI/generative-models/blob/main/LICENSE-CODE) | « STABILITY AI COMMUNITY LICENSE AGREEMENT, Last Updated: July 5, 2024 » (texte identique pour SVD-XT et SVD-XT 1.1) : gratuit pour « annual revenue of less than US $1,000,000 » ; usage commercial = **enregistrement** sur stability.ai/community-license ; au-delà de 1 M$ → licence entreprise — [LICENSE.md SVD-XT 1.1](https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt-1-1/blob/main/LICENSE.md), [LICENSE.md SVD-XT](https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/blob/main/LICENSE.md) ; SVD-XT 1.1 = dépôt conditionné (`gated: auto`) — [API HF](https://huggingface.co/api/models/stabilityai/stable-video-diffusion-img2vid-xt-1-1) | **Oui sous 1 M$ de CA**, après enregistrement |
| AnimateDiff (v1, v2, v3, SparseCtrl, SDXL-beta) | Apache-2.0 vérifiée — [GitHub AnimateDiff LICENSE.txt](https://github.com/guoyww/AnimateDiff/blob/main/LICENSE.txt) ; mais README : « This project is released for academic use » (avertissement) — [GitHub AnimateDiff](https://github.com/guoyww/AnimateDiff) | modules de mouvement `apache-2.0` déclarée (fichiers `mm_sd_v15_v2.ckpt`, `v3_sd15_mm.ckpt`, `v3_sd15_adapter.ckpt`, `mm_sdxl_v10_beta.ckpt`, LoRA caméra v2) — [API HF guoyww/animatediff](https://huggingface.co/api/models/guoyww/animatediff) ; **modèle de base obligatoire** : SD1.5 = `creativeml-openrail-m` — [HF SD1.5](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5) ; SDXL = `openrail++` — [HF SDXL base](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) ; AnimateDiff-Lightning (ByteDance) = `creativeml-openrail-m` — [HF AnimateDiff-Lightning](https://huggingface.co/ByteDance/AnimateDiff-Lightning) ; AnimateLCM : **aucune licence déclarée** — [API HF AnimateLCM](https://huggingface.co/api/models/wangfuyun/AnimateLCM) | Oui en pratique (OpenRAIL-M permet le commercial avec restrictions d'usage), mais l'ensemble n'est pas MIT/Apache pur |
| HunyuanVideo-I2V (05/03/2025) | **licence maison aussi pour le code** : `LICENSE.txt` du dépôt = Tencent Hunyuan Community License — [GitHub HunyuanVideo-I2V LICENSE.txt](https://github.com/Tencent-Hunyuan/HunyuanVideo-I2V/blob/main/LICENSE.txt) | « THIS LICENSE AGREEMENT DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA » ; > 100 M d'utilisateurs actifs mensuels → licence à demander ; « You must not use … any Output … to improve any other AI model » — [HF HunyuanVideo-I2V LICENSE](https://huggingface.co/tencent/HunyuanVideo-I2V/blob/main/LICENSE) | Oui **dans le Territoire** (monde hors UE/R-U/Corée du Sud) |
| HunyuanVideo 1.5 (20/11/2025) | Tencent Hunyuan Community (note interne 14/10) | `tencent-hunyuan-community` — [API HF HunyuanVideo-1.5](https://huggingface.co/api/models/tencent/HunyuanVideo-1.5) ; mêmes exclusions UE/R-U/Corée (note interne 14/10) — [LICENSE 1.5](https://huggingface.co/tencent/HunyuanVideo-1.5/blob/main/LICENSE) | idem |
| Mochi 1 preview | Apache-2.0 vérifiée — [GitHub mochi LICENSE](https://github.com/genmoai/mochi/blob/main/LICENSE) | `apache-2.0` + fichier LICENSE — [HF mochi-1-preview LICENSE](https://huggingface.co/genmo/mochi-1-preview/blob/main/LICENSE) | Oui (mais T2V seulement) |

**Accélérateurs et dérivés (licences)**
- LightX2V (code) Apache-2.0 vérifiée (note interne 14/10) — [GitHub LightX2V LICENSE](https://github.com/ModelTC/LightX2V/blob/main/LICENSE) ; `lightx2v/Wan2.2-Lightning` = `apache-2.0` déclarée — [API HF](https://huggingface.co/api/models/lightx2v/Wan2.2-Lightning) ; `lightx2v/LightWan2.2-A14B` = Apache-2.0 — [HF LightWan2.2-A14B](https://huggingface.co/lightx2v/LightWan2.2-A14B) ; FastWan2.2-TI2V-5B (FastVideo) = `apache-2.0` déclarée — [API HF FastWan2.2](https://huggingface.co/api/models/FastVideo/FastWan2.2-TI2V-5B-FullAttn-Diffusers) ; `Phr00t/WAN2.2-14B-Rapid-AllInOne` = `apache-2.0` déclarée (fusion communautaire, composants non détaillés) — [API HF Rapid-AllInOne](https://huggingface.co/api/models/Phr00t/WAN2.2-14B-Rapid-AllInOne).
- CausVid (distillation temps réel) = CC BY-NC-SA 4.0 → **non commercial, exclu** (note interne 14/10) — [GitHub CausVid LICENSE.md](https://github.com/tianweiy/CausVid/blob/master/LICENSE.md).
- Paquets ComfyUI : `Comfy-Org/Wan_2.2_ComfyUI_Repackaged` = apache-2.0 ; `Comfy-Org/HunyuanVideo_1.5_repackaged` = tencent-hunyuan-community ; `Comfy-Org/ltx-2` = ltx-2-community-license ; `Comfy-Org/mochi_preview_repackaged` = apache-2.0 — [API HF Wan repackaged](https://huggingface.co/api/models/Comfy-Org/Wan_2.2_ComfyUI_Repackaged), [API HF Hunyuan 1.5 repackaged](https://huggingface.co/api/models/Comfy-Org/HunyuanVideo_1.5_repackaged), [API HF Comfy-Org/ltx-2](https://huggingface.co/api/models/Comfy-Org/ltx-2), [API HF Mochi repackaged](https://huggingface.co/api/models/Comfy-Org/mochi_preview_repackaged).
- ComfyUI lui-même = GPL-3.0 (note interne 14/10) — [GitHub ComfyUI LICENSE](https://github.com/comfyanonymous/ComfyUI/blob/master/LICENSE) ; enveloppes Kijai CogVideoX et Mochi = Apache-2.0 vérifiée — [CogVideoXWrapper LICENSE](https://github.com/kijai/ComfyUI-CogVideoXWrapper/blob/main/LICENSE), [MochiWrapper LICENSE](https://github.com/kijai/ComfyUI-MochiWrapper/blob/main/LICENSE) ; AnimateDiff-Evolved = Apache-2.0 vérifiée — [LICENSE](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved/blob/main/LICENSE).

**Hors liste demandée mais en tête des classements (pour mémoire)**
- MiniMax H3 (open weights, 1er du classement I2V d'Artificial Analysis) : `minimax-h3-community-license-agreement` — [API HF MiniMax-H3](https://huggingface.co/api/models/MiniMaxAI/MiniMax-H3) ; territoire = monde **hors UE, Royaume-Uni, Corée du Sud et États-Unis** (note interne 14/10) — [LICENSE MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE).
- MAGI-2 preview : `apache-2.0` déclarée — [API HF MAGI-2-preview](https://huggingface.co/api/models/sand-ai/MAGI-2-preview) ; 114B MoE, 8 GPU Hopper (note interne 14/10) — [HF MAGI-2-preview](https://huggingface.co/sand-ai/MAGI-2-preview).

### Inferences
- Pour une chaîne TikTok/YouTube d'un particulier ou d'une petite structure (CA bien sous 1 M$), **toutes** ces licences permettent la monétisation sauf LTX-Video 0.9/0.9.1 ; mais seules Wan 2.2 et Mochi le permettent **sans aucune condition**, et seule Wan 2.2 fait de l'image → vidéo. La règle MIT/Apache/BSD du projet laisse donc **une seule famille de fondation I2V exécutable chez nous : Wan 2.2** (+ ses accélérateurs Apache : LightX2V, Lightning, LightWan, FastWan).
- Les licences LTX et Stability exigent d'indiquer qu'un contenu est généré par machine ; TikTok impose de toute façon l'étiquette « contenu IA » — à intégrer d'office au gabarit de publication quelle que soit la licence.
- Hunyuan : l'exclusion UE/R-U/Corée porte sur le lieu d'usage ; un opérateur basé en Afrique de l'Ouest est dans le « Territoire », mais la diffusion de vidéos vues en Europe n'est pas traitée explicitement par le texte → zone grise juridique (avis d'un juriste, non fourni ici).
- CogVideoX : « 1 million visits per month » est mal défini pour des vues TikTok ; une vidéo virale pourrait dépasser le plafond → risque de licence pour un usage en volume.

### Gaps
- Poids Wan 2.2 : licence seulement **déclarée** (pas de fichier LICENSE dans les dépôts HF) — fichier `LICENSE.txt` du code relu le 14/10 ; à archiver avec chaque version téléchargée.
- AnimateDiff : contradiction entre le fichier Apache-2.0 et la phrase « released for academic use » du README ; aucune clarification de l'auteur trouvée.
- Texte complet de `LICENSE-2_x` (LTX-2.5) non relu aujourd'hui (relu le 14/10 par la note interne).

---

## Q2. Les poids de Wan 2.5 / 2.6 / 2.7 / 3.0 sont-ils ouverts (octobre 2026) ?

### Takeaway
**Non.** Les derniers poids Wan téléchargeables sont ceux de **Wan 2.2** (et dérivés : Animate, Animate-2, Dancer) ; Wan 2.5-Preview, 2.6, 2.7 et 3.0 ne sont disponibles que par API (Alibaba Model Studio, revendeurs, nœuds API payants de ComfyUI).

### Cited Findings
- Article du 06/09/2026 : la recherche HF « Wan2.7 » et « Wan3.0 » renvoie un tableau vide ; l'organisation Wan-AI compte 27 dépôts, tous Wan 2.1/2.2 ou variantes (dont Wan-Animate-2 et Wan-Dancer-14B) ; GitHub Wan-Video = Wan2.1, Wan2.2, Wan-skills, Wan-Dancer, Wan-Animate-2, fork de diffusers ; annonces Wan2.7 et Wan3.0 = « now available on Alibaba Cloud's Model Studio » sans mention de licence ; deux tickets GitHub demandant l'ouverture des versions ≥ 2.5 sans réponse depuis septembre 2025 — [howaiworks.ai, 06/09/2026](https://howaiworks.ai/blog/alibaba-wan-open-weights-stopped-at-2-2).
- Artificial Analysis classe **Wan 3.0** (Elo 1127, 4e, août 2026) et **Wan 2.7** (Elo 1033, 12e, avril 2026) avec « Open weights : No » — [Artificial Analysis, I2V leaderboard](https://artificialanalysis.ai/video/leaderboard/image-to-video) (lu le 16/10/2026).
- ComfyUI expose `wan2.5-i2v-preview`, `wan2.6-i2v`, `wan2.7-i2v`, `wan3.0-video` et `wan3.0-video-prime` uniquement comme **schémas de nœuds API** (routage vers le service payant), pas comme modèles locaux — [docs.comfy.org llms.txt](https://docs.comfy.org/llms.txt) (lu le 16/10/2026).
- Les dernières créations de dépôts Wan-AI sur HF lues aujourd'hui : Wan2.2-S2V-14B (25/08/2025), Wan2.2-Animate-14B (11/09/2025) — [API HF S2V](https://huggingface.co/api/models/Wan-AI/Wan2.2-S2V-14B), [API HF Animate](https://huggingface.co/api/models/Wan-AI/Wan2.2-Animate-14B) ; Comfy-Org/Wan-Animate-2 créé le 14/07/2026, Apache-2.0 — [API HF Comfy-Org/Wan-Animate-2](https://huggingface.co/api/models/Comfy-Org/Wan-Animate-2).
- Wan 2.5-Preview i2v accepte un `audio_url` (lip-sync) mais seulement chez des hébergeurs payants (note interne 16/10) — [fal Wan 2.5 preview i2v](https://fal.ai/models/fal-ai/wan-25-preview/image-to-video).

### Inferences
- Toute la puissance « Wan » utilisable localement et gratuitement en octobre 2026 = Wan 2.2 (+ Animate-2 d'août 2026). Les capacités audio natives de Wan 2.5+ (son généré, entrée voix) ne sont pas récupérables en local ; l'équivalent ouvert pour la parole est Wan2.2-S2V (entrée audio) ou InfiniteTalk/MultiTalk (Apache, base Wan 2.1).

### Gaps
- Aucune déclaration officielle d'Alibaba sur une future ouverture des poids 2.5+ ; à surveiller (veille mensuelle de l'organisation Wan-AI sur HF).

---

## Q3. Capacités : qualité I2V, contrôle des gestes par le prompt, durée/résolution/i/s, première/dernière image, caméra, entrée audio

### Takeaway
Pour un **personnage qui parle et bouge**, deux modèles ouverts acceptent une **voix en entrée** : **Wan2.2-S2V-14B** (Apache ; image + audio + texte, pose optionnelle, durée = celle de l'audio) et **LTX-2.x** (pipeline audio → vidéo, licence maison). Pour les plans de gestes/actions sans parole : **Wan2.2-I2V-A14B** (81 images à 16 i/s, 480p/720p, première+dernière image) ou **TI2V-5B** (720p 24 i/s, vertical 704×1280 natif). SVD, AnimateDiff, CogVideoX et Mochi sont nettement en retrait (pas de texte pour SVD, 6 s à 8 i/s pour CogVideoX-5B, T2V seul pour Mochi).

### Cited Findings

**Tableau des capacités**

| Modèle | Entrées | Sortie native | Première/dernière image | Caméra | Audio en entrée | Source |
|---|---|---|---|---|---|---|
| Wan2.2-TI2V-5B | texte + image | 720p à 24 i/s ; `1280*704` ou **`704*1280`** (vertical) | non (FLF2V officiel = 14B) | par le prompt ; variante Fun-5B-Control-Camera (alibaba-pai) | non | [GitHub Wan2.2 README](https://github.com/Wan-Video/Wan2.2) (note interne 14/10), [HF Wan2.2-Fun-5B-Control](https://huggingface.co/alibaba-pai/Wan2.2-Fun-5B-Control) |
| Wan2.2-I2V-A14B (MoE high/low noise) | texte + image | 480p / 720p, 81 images à 16 i/s (réglages VBench : 832×480, 16 i/s, 81 images) | **oui** (gabarit ComfyUI `video_wan2_2_14B_flf2v`) | prompt ; Fun-Camera / Fun-Control | non | [VBench-I2V, réglages](https://github.com/Vchitect/VBench/tree/master/vbench2_beta_i2v), [docs.comfy.org Wan2.2](https://docs.comfy.org/tutorials/video/wan/wan2_2) |
| **Wan2.2-S2V-14B** | **audio + image de référence + texte facultatif** ; `--pose_video` pour suivre une pose | 480p et 720p ; « the generated video length will automatically adjust based on the input audio length » ; 16 i/s dans ComfyUI, tranches de 77 images (+4,81 s par extension) | non | prompt | **oui** | [HF Wan2.2-S2V-14B](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B), [docs.comfy.org S2V](https://docs.comfy.org/tutorials/video/wan/wan2-2-s2v) |
| Wan2.2-Animate-14B | image du personnage + **vidéo de conduite** | modes animation / remplacement ; segments de 77 images | — | — | non (le visage suit la vidéo) | [GitHub Wan2.2 README](https://github.com/Wan-Video/Wan2.2), [arXiv 2509.14055](https://arxiv.org/html/2509.14055v1) (note interne 14/10) |
| Wan-Animate-2 (07/08/2026, Apache) | image + vidéo de conduite (sans extracteur de pose) ; nouveau fond et caméra par le texte | — | — | par le texte | non | [docs.comfy.org Wan-Animate-2](https://docs.comfy.org/tutorials/video/wan/wan-animate-2) |
| InfiniteTalk (Apache, base Wan2.1-I2V-14B-480p) | image + 1 ou **2 pistes audio** ; masque par personnage | extensions de 81 images à 25 i/s (≈ 3,24 s) | — | — | **oui, multi-personnages** (« Supports both single-character and multi-character scenarios ») | [docs.comfy.org InfiniteTalk](https://docs.comfy.org/tutorials/video/wan/wan-infinitetalk), [API HF InfiniteTalk](https://huggingface.co/api/models/MeiGen-AI/InfiniteTalk) |
| LTX-Video 0.9.x (2B / 13B) | texte, image, **plusieurs images ou segments à des n° d'image donnés** | « 30 FPS videos at a 1216×704 resolution faster than they can be watched » ; < 257 images ; < 720×1280 conseillé | oui (conditionnement multi-images ; gabarit ComfyUI « multi-frame control from start and end images » en 0.9.5) | IC-LoRA depth/pose/canny (13B 0.9.7) | non | [HF LTX-Video](https://huggingface.co/Lightricks/LTX-Video), [docs.comfy.org LTXV](https://docs.comfy.org/tutorials/video/ltxv) |
| LTX-2 (19B, janv. 2026) | texte, image, vidéo | son + vidéo synchronisés en une passe ; distillé 8 étapes CFG=1 ; upscalers ×2 spatial et ×2 temporel | — | gabarits Depth/Canny/**Pose**-to-Video | génère l'audio (dialogue, bruitages) | [docs.comfy.org LTX-2](https://docs.comfy.org/tutorials/video/ltx/ltx-2) |
| LTX-2.3 (22B, mars 2026) | + `audio-to-video`, `video-to-audio`… | 1024×1536 à 24 i/s par défaut (DFR) ; jusqu'à 3840×2176 ; multiples de 32 ; « 8 + 1 » images | `KeyframeInterpolationPipeline` | IC-LoRA (clean-plate, détail, HDR, **Dub-It** = re-doublage avec lèvres) | **oui** : `A2VidPipelineTwoStage` « generates video conditioned on an input audio file » | [HF LTX-2.3](https://huggingface.co/Lightricks/LTX-2.3), [GitHub LTX-2](https://github.com/Lightricks/LTX-2) |
| LTX-2.5 (22B, juil. 2026) | T2V, I2V, FLF2V, DFR | « native multishot » (plusieurs plans liés gardant personnage, décor, lumière, voix), « Auto duration », 4K HDR jusqu'à 50 i/s, encodeur Gemma 4 12B | **oui** (gabarit FLF2V) | prompt (encodeur qui retient la direction caméra) | via pipelines LTX-2 (A2Vid) | [docs.comfy.org LTX-2.5](https://docs.comfy.org/tutorials/video/ltx/ltx-2-5), [GitHub LTX-2](https://github.com/Lightricks/LTX-2) |
| CogVideoX-5B-I2V | texte (anglais, ≤ 226 jetons) + image | **720×480 uniquement, 6 s, 8 i/s** | non (via CogVideoX-Fun / VideoX-Fun) | non | non | [HF CogVideoX-5b-I2V](https://huggingface.co/zai-org/CogVideoX-5b-I2V) |
| CogVideoX1.5-5B-I2V | idem (≤ 224 jetons) | côté court 768, long ≤ 1360 ; **5 ou 10 s à 16 i/s** | non | non | non | [HF CogVideoX1.5-5B-I2V](https://huggingface.co/zai-org/CogVideoX1.5-5B-I2V) |
| SVD-XT 1.1 | **image seule** (« cannot be controlled through text ») | 25 images 1024×576, « ≤ 4 sec », conditionnement fixe 6 i/s / motion bucket 127 | non | non | non | [HF SVD-XT 1.1](https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt-1-1) |
| AnimateDiff v3 + SparseCtrl | texte + modèle SD1.5 personnalisé ; SparseCtrl RGB (image) / scribble, nombre arbitraire de cartes | SDXL-beta : « 1024x1024x16 frames » ; config `3_1_sparsectrl_i2v.yaml` | oui (cartes à des images choisies) | MotionLoRA v2 : pan, tilt, zoom, roll | non | [GitHub AnimateDiff](https://github.com/guoyww/AnimateDiff) |
| HunyuanVideo-I2V | texte + image | jusqu'à 720p, **129 images (5 s)** ; LoRA d'effets entraînables | non | prompt | non | [HF HunyuanVideo-I2V](https://huggingface.co/tencent/HunyuanVideo-I2V) |
| HunyuanVideo 1.5 (8,3B) | texte + image | 480p / 720p + super-résolution 1080p ; 121 images à 24 i/s ; « 5-10s » dans ComfyUI | non | prompt | non | [HF HunyuanVideo-1.5](https://huggingface.co/tencent/HunyuanVideo-1.5), [docs.comfy.org Hunyuan 1.5](https://docs.comfy.org/tutorials/video/hunyuan/hunyuan-video-1-5) |
| Mochi 1 preview (10B) | **texte seulement** (pas d'I2V) | 480p (848×480) ; exemple 84 images exportées à 30 i/s | non | non | non | [HF mochi-1-preview](https://huggingface.co/genmo/mochi-1-preview) |

### Inferences
- **Notre plan type (2–4 s, personnage qui parle)** se découpe en deux familles de plans : (1) réplique parlée → modèle **piloté par l'audio** (S2V-14B, ou InfiniteTalk « multi » quand 2 personnages sont à l'écran avec deux pistes et un masque chacun) ; (2) réaction/geste/entrée → **I2V-A14B** avec FLF2V pour revenir exactement sur l'image clé suivante (raccords propres entre plans).
- TI2V-5B est le seul modèle ouvert à sortir **nativement du 9:16 en 720p à 24 i/s** ; les A14B et S2V sortent à 16 i/s → interpolation ×1,5 vers 24 i/s (ou ×2 vers 30–32 i/s) à prévoir.
- LTX-2.5 a la palette fonctionnelle la plus riche (multishot, auto-durée, audio→vidéo, FLF2V, 50 i/s) mais reste hors règle de licence du projet.

### Gaps
- Aucune source ne dit si Wan2.2-S2V gère **plusieurs personnages** dans un même cadre (non mentionné sur la fiche ni dans la doc ComfyUI) ; à tester avec masque/composition.
- Comportement de S2V et de LTX-2.x A2V sur **voix françaises** : non documenté (l'encodeur audio du gabarit S2V est `wav2vec2_large_english_fp16`).

---

## Q4. Preuves de qualité : VBench / VBench-I2V, Artificial Analysis, comparaisons communautaires cartoon/3D et multi-personnages, défauts connus

### Takeaway
Sur **VBench-I2V officiel** (données du Space lues le 16/10/2026), les meilleurs modèles ouverts de la liste sont **Wan2.2-TI2V-5B (88,80 %) et Wan2.2-I2V-A14B (88,68 %)** avec prompt optimisé, devant LTX-2 (87,59 %, mais « dynamic degree » 8,54 % : presque immobile), HunyuanVideo-I2V (86,82 %) et CogVideoX-5B-I2V (86,70 %). Sur l'arène **Artificial Analysis I2V**, aucun Wan 2.2/Hunyuan/CogVideoX n'apparaît ; les seuls ouverts classés sont MiniMax H3 (1er), MAGI-2 (10e) et LTX-2.5/2.3 (19e–23e sur 23). Les preuves « cartoon Pixar » sont anecdotiques : un test (bébé dragon 3D) note Wan 2.2 et Hunyuan 1.5 « Excellent » en cohérence de personnage, LTX 2.3 « Good ».

### Cited Findings

**VBench-I2V (Space officiel `Vchitect/VBench_Leaderboard`, lu le 16/10/2026 ; échantillonnage et évaluation « VBench Team » sauf mention)**

| Modèle | Date d'éval. | Total | Score I2V | Qualité | Sujet vidéo↔image | Fond vidéo↔image | Fluidité | **Degré de mouvement** | Esthétique | Netteté |
|---|---|---|---|---|---|---|---|---|---|---|
| Wan2.2-TI2V-5B (prompt optimisé Qwen) | 2026-02-12 | **88,80 %** | 96,30 % | 81,30 % | 98,43 % | 99,27 % | 98,65 % | 52,85 % | 64,01 % | 70,70 % |
| Wan2.2-I2V-A14B (prompt optimisé Qwen) | 2026-03-06 | **88,68 %** | 96,51 % | 80,85 % | 98,60 % | 99,56 % | 98,22 % | 48,62 % | 64,71 % | 70,67 % |
| Wan2.2-I2V-A14B (sans optimisation) | 2026-02-07 | 88,16 % | 95,82 % | 80,50 % | 97,52 % | 99,03 % | 98,32 % | 52,85 % | 61,53 % | 70,36 % |
| LTX-2-I2V (sans optimisation) | 2026-02-06 | 87,59 % | 96,53 % | 78,65 % | **99,38 %** | 99,35 % | 99,29 % | **8,54 %** | 63,61 % | 72,72 % |
| Wan2.1-I2V-14B-720P | 2025-05-08 | 86,86 % | 92,90 % | 80,82 % | 96,95 % | 96,44 % | 97,90 % | 51,38 % | 64,75 % | 70,44 % |
| HunyuanVideo-I2V | 2025-06-13 | 86,82 % | 95,10 % | 78,54 % | 98,53 % | 97,37 % | 99,23 % | 22,20 % | 62,55 % | 70,14 % |
| CogVideoX-5b-I2V | 2025-03-31 | 86,70 % | 94,79 % | 78,61 % | 97,19 % | 96,74 % | 98,40 % | 33,17 % | 61,87 % | 70,01 % |
| CogVideoX1.5-5B-I2V | 2025-03-31 | 71,58 % | 92,25 % | 50,90 % | 96,46 % | 95,50 % | 40,98 % (anomalie) | 62,29 % | 70,21 % | 97,07 % (anomalie) |
| SVD-XT-1.0 | 2024-07-22 | n.c. | n.c. | 80,11 % | 97,52 % | 97,63 % | 98,09 % | 52,36 % | 60,15 % | 69,80 % |
| SVD-XT-1.1 | 2024-07-22 | n.c. | n.c. | 79,40 % | 97,51 % | 97,62 % | 98,12 % | 43,17 % | 60,23 % | 70,23 % |
| (référence fermée) Gen-4-I2V (Runway) | 2025-05-20 | 88,27 % | 95,65 % | 80,89 % | 97,84 % | 97,46 % | 98,99 % | 55,20 % | 61,77 % | 70,41 % |
| (1er du tableau, auto-déclaré) DreamX-World-1.0 | 2026-05-20 | 90,49 % | 97,74 % | 83,24 % | 98,27 % | 99,04 % | 98,52 % | 72,11 % | 63,70 % | 71,46 % |

Source : [HF Space Vchitect/VBench_Leaderboard](https://huggingface.co/spaces/Vchitect/VBench_Leaderboard) (onglet I2V ; valeurs extraites de la configuration Gradio du Space). Réglages d'échantillonnage (résolution, i/s, nb d'images) — [GitHub VBench vbench2_beta_i2v](https://github.com/Vchitect/VBench/tree/master/vbench2_beta_i2v). Une étude tierce reproduit Wan2.2-I2V-A14B à 0,8816 (total) / 0,9582 (I2V) — [arXiv 2608.26105, tableau 8](https://arxiv.org/pdf/2608.26105) (lu via résumé de recherche).

**VBench T2V (même Space ; pour situer Mochi, AnimateDiff, LTX-Video 0.9)**
- Wan2.1-T2V-1.3B 84,26 % ; Wan2.2-T2V-A14B 84,23 % (prompt optimisé) / 82,61 % (sans) ; HunyuanVideo open source 83,24 % ; CogVideoX1.5-5B 82,01 % ; CogVideoX-5B (Diffusers) 81,91 % ; CogVideoX-2B 81,55 % ; AnimateDiff-V2 80,27 % (degré de mouvement 40,83 %) ; Mochi-1 80,13 % ; LTX-Video (5 s 768×512) 80,00 % ; LTX-2 (Diffusers) 79,35 % — [HF Space VBench_Leaderboard](https://huggingface.co/spaces/Vchitect/VBench_Leaderboard).

**Artificial Analysis — arène image → vidéo (AA-Video-I2V v1.1, lu le 16/10/2026, 23 modèles, Kling 3.0 = ancre 1000)**
- Ouverts classés : MiniMax H3 768p **1er, Elo 1141** (juil. 2026) ; MAGI-2 Preview 10e, 1046 ; **LTX-2.5 Fast 19e, 985** ; LTX-2.5 Pro 21e, 957 ; LTX-2.3 Pro 22e, 903 ; LTX-2.3 Fast 23e, 889. Fermés en tête : Seedance 2.5 (1139), Gemini Omni Flash 1.1 (1134), Wan 3.0 (1127). **Wan 2.2, Wan 2.1, HunyuanVideo 1.5, CogVideoX, Kandinsky n'apparaissent pas** sur ce tableau ; aucune date de mise à jour affichée ; « AA-Video-I2V v2.1 coming soon » — [Artificial Analysis I2V](https://artificialanalysis.ai/video/leaderboard/image-to-video).
- Wikipédia (secondaire) : à sa sortie, LTX-2 était 3e en I2V chez Artificial Analysis et « début 2026 » le modèle ouvert le mieux classé — [Wikipedia LTX-2](https://en.wikipedia.org/wiki/LTX-2).

**Comparaisons communautaires cartoon / 3D**
- Test « 3D Pixar » (bébé dragon turquoise, une image, prompt : deux pas, saut avec battements d'ailes, rire, travelling avant, tilt vers le haut ; auteur Umesh Sharma, « Sep 13 », matériel et réglages non publiés, coûts Wavespeed) : cohérence du personnage **Hunyuan 1.5 = Excellent, LTX 2.3 = Good, Wan 2.2 = Excellent** ; micro-expressions « High » pour les trois ; locomotion avant : Hunyuan « Missed », LTX « Over-indexed » (sauts répétés en boucle), Wan « Failed » (saute sur place) ; saut vertical/caméra : Wan « Flawless », LTX « Partial », Hunyuan « Static » — [ALwrity](https://www.alwrity.com/post/open-source-i2v-model-comparison-hunyuan-ltx-wan).
- RTX 4060 8 Go, Wan 2.2 14B « Rapid AllInOne » 4 étapes : « the input character is preserved properly », mouvement subtil (cheveux, bouche), pas de déformation ; un saut demandé « didn't come through » — [lilting.ch, 07/03/2026](https://lilting.ch/en/articles/wan22-comfyui-rtx4060-i2v).
- Fiche Mochi : « Mochi 1 is also optimized for photorealistic styles so does not perform well with animated content » — [HF mochi-1-preview](https://huggingface.co/genmo/mochi-1-preview).
- AnimateDiff : pour l'animation d'image, « it's recommanded to use images generated by the same community model » — [GitHub AnimateDiff](https://github.com/guoyww/AnimateDiff).
- Multi-personnages : InfiniteTalk propose un patch « multi » avec masques par personnage et deux pistes audio — [docs.comfy.org InfiniteTalk](https://docs.comfy.org/tutorials/video/wan/wan-infinitetalk) ; aucune source de cette veille n'évalue Wan2.2-I2V/S2V, LTX ou Hunyuan sur 2–3 personnages cartoon dans le même plan.

**Défauts connus (sources primaires ou éditeurs)**
- Wan 2.2 + LoRA LightX2V 4 étapes : mouvement **au ralenti** dans le gabarit I2V par défaut ; LoRA correctives « Slow-Mo Fix » (haut et bas bruit, force 1,0) — [HF rzgar/Wan2.2_I2V_LightX2V_Slow-Mo_Fix](https://huggingface.co/rzgar/Wan2.2_I2V_LightX2V_Slow-Mo_Fix) ; contournement communautaire : LoRA à 0,6–0,8 et CFG 2–3,5 sur le modèle haut bruit — [HF discussion Wan2.2-Lightning #5](https://huggingface.co/lightx2v/Wan2.2-Lightning/discussions/5).
- S2V + LoRA Lightning (entraînée pour T2V) : « significant dynamic and quality loss » ; revenir à 20 étapes CFG 6 si la qualité est insuffisante — [docs.comfy.org S2V](https://docs.comfy.org/tutorials/video/wan/wan2-2-s2v).
- Wan-Animate : déformations si gros écart de morphologie en remplacement, erreurs du squelette 2D (note interne 14/10) — [arXiv 2509.14055](https://arxiv.org/html/2509.14055v1).
- SVD-XT 1.1 : « Faces and people in general may not be generated properly », « may generate videos without motion, or very slow camera pans » — [HF SVD-XT 1.1](https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt-1-1).
- AnimateDiff : « Small fickering is noticable » ; qualité T2V limitée — [GitHub AnimateDiff](https://github.com/guoyww/AnimateDiff).
- HunyuanVideo-I2V : compromis stabilité/dynamisme (`--i2v-stability` + `--flow-shift 7.0` vs 17.0) ; prompts trop détaillés → transitions parasites — [HF HunyuanVideo-I2V](https://huggingface.co/tencent/HunyuanVideo-I2V).
- Mochi : « minor warping and distortions » en mouvement extrême — [HF mochi-1-preview](https://huggingface.co/genmo/mochi-1-preview).
- LTX-2 : incohérences de lip-sync et de suivi de mouvement sur les longues scènes (revue citée par Wikipédia, non retrouvée) — [Wikipedia LTX-2](https://en.wikipedia.org/wiki/LTX-2) ; le guide éditeur LTX-2.3 attribue la dérive de synchro surtout aux erreurs de nombre d'images — [ltx.io, guide lip-sync LTX-2.3](https://ltx.io/model/model-blog/ltx-2-3-lip-sync-guide) (source éditeur).

### Inferences
- Le chiffre le plus parlant pour « le personnage doit bouger » est le **degré de mouvement** VBench : Wan 2.2 (≈ 49–53 %) bouge nettement plus que HunyuanVideo-I2V (22 %), CogVideoX-5B-I2V (33 %) et surtout LTX-2 I2V (8,5 %), tout en gardant une cohérence sujet/fond ≥ 98,4 %/99,3 % → meilleur équilibre « vie / identité » de la liste.
- L'absence de Wan 2.2 et Hunyuan 1.5 sur l'arène AA actuelle n'est pas un signal de qualité (tableau limité à 23 modèles récents) ; elle empêche simplement une comparaison Elo directe avec LTX-2.5.
- Le défaut « ralenti » des LoRA 4 étapes est critique pour des sketchs comiques (rythme) → la LoRA corrective ou un réglage haut-bruit doit faire partie du gabarit dès le départ, et le rythme se mesure (vitesse de mouvement par plan) contre nos TikTok de référence.

### Gaps
- Arena (ex-LMArena, `arena.ai/leaderboard/image-to-video`) renvoie HTTP 403 : non lue. Un résumé secondaire non identifiable donne Hunyuan 1.5 (1198) > Wan2.2-A14B (1170) > LTX-2 (1159) ; **non retenu** faute de page source.
- Pas de score VBench-I2V pour HunyuanVideo 1.5, LTX-2.3/2.5, Wan2.2-S2V, AnimateDiff ; ligne CogVideoX1.5-5B-I2V visiblement décalée dans les données du Space (fluidité 40,98 %, netteté 97,07 %) → à ne pas utiliser.
- Aucun banc indépendant publié sur personnages **3D cartoon africains, multi-personnages, dialogue** : seul un banc maison sur nos propres planches (identité, déformation, rythme, lèvres) tranchera — mesure à lancer avec `mesure2.py` / `measure.ts`.

---

## Q5. Matériel et vitesse : VRAM par précision, temps par clip de ≈ 5 s sur GPU nommés, LoRA/distillations d'accélération, chiffres CPU

### Takeaway
Chiffres sourcés par clip ≈ 5 s : **RTX 5090 + LightWan2.2-A14B (NVFP4, 4 étapes, Apache) = 10,7 s en I2V 480p et 26,7 s en 720p** (vs 787 s / 2685 s non distillé) ; **RTX 4090 : HunyuanVideo 1.5 480p distillé ≈ 75 s** ; Wan2.2-TI2V-5B 720p ≈ 525 s / 22,8 Go ; **RTX 3060 12 Go : Wan2.2-14B fp8 + 4 étapes ≈ 5 min 37 s par scène** ; RTX 4060 8 Go : 111 s pour 33 images 480×480. Aucune mesure CPU seul n'a été trouvée.

### Cited Findings

**Officiel éditeur**
- Wan2.2 sur RTX 4090, TI2V-5B 720p : I2V **524,8 s / 22,8 Go**, T2V 534,7 s / 22,9 Go ; A14B 1 GPU : H100 480p ≈ 327,8 s / 41,0 Go (I2V), 720p ≈ 1041–1056 s / 59,7–59,8 Go ; A100 480p 785,7–810,0 s, 720p 2735,7–2810,9 s (note interne 14/10) — [HF Wan2.2-TI2V-5B, tableau comp_effic](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B). Commandes de base A14B : « at least 80GB VRAM » ; TI2V-5B tient sur 24 Go avec `--offload_model True --convert_model_dtype --t5_cpu` — [GitHub Wan2.2](https://github.com/Wan-Video/Wan2.2) (note interne 14/10).
- Wan2.2-S2V-14B : « can run on a GPU with at least 80GB VRAM » (avec offload) ; exemples multi-GPU ×8 FSDP + Ulysses — [HF Wan2.2-S2V-14B](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B).
- ComfyUI : « The Wan2.2 5B version should fit well on 8GB vram with the ComfyUI native offloading » — [docs.comfy.org Wan2.2](https://docs.comfy.org/tutorials/video/wan/wan2_2).
- **LightWan2.2-A14B** (Apache-2.0, distillation 4 étapes + quantification NVFP4 + attention creuse, **Blackwell seulement : RTX 50 / B200**), RTX 5090, bout en bout : I2V 480p **787,0 s → 10,7 s (×73,9)** ; I2V 720p **2685,0 s → 26,7 s (×100,5)** ; T2V 480p 734,0 → 9,1 s ; nombre d'images non indiqué — [HF lightx2v/LightWan2.2-A14B](https://huggingface.co/lightx2v/LightWan2.2-A14B).
- LightX2V, Wan2.1-I2V-14B-480P, 81 images, 40 étapes : RTX 4090D = 20,26 s/itération (Diffusers 30,50) ; H100 = 5,18 s/it (note interne 14/10) — [GitHub ModelTC/LightX2V](https://github.com/ModelTC/LightX2V).
- **HunyuanVideo 1.5** (8,3B) : « a single RTX 4090 can generate videos within 75 seconds » (I2V 480p step-distill, 8 ou 12 étapes conseillées, 4 possibles) ; **14 Go minimum avec offload** ; SR 480→720 en 6 étapes, 720→1080 en 8 ; caches deepcache/teacache/taylorcache ; MagCache ×1,7 — [HF HunyuanVideo-1.5](https://huggingface.co/tencent/HunyuanVideo-1.5) ; ComfyUI : « consumer GPUs (24GB VRAM) » — [docs.comfy.org Hunyuan 1.5](https://docs.comfy.org/tutorials/video/hunyuan/hunyuan-video-1-5).
- **HunyuanVideo-I2V** : pic **60 Go** en 720p (80 Go conseillés) ; 1280×720, 129 images, 50 étapes : **1 GPU 1904,08 s**, 2 GPU 934,09 s, 4 GPU 514,08 s, 8 GPU 337,58 s (xDiT) — [HF HunyuanVideo-I2V](https://huggingface.co/tencent/HunyuanVideo-I2V).
- **CogVideoX-5B(-I2V)** : diffusers BF16 « from 5GB* » (INT8 torchao 4,4 Go) ; SAT BF16 26 Go ; 50 étapes : **A100 ≈ 180 s, H100 ≈ 90 s** ; 2B : A100 ≈ 90 s, H100 ≈ 45 s — [HF CogVideoX-5b-I2V](https://huggingface.co/zai-org/CogVideoX-5b-I2V). **CogVideoX1.5-5B-I2V** : 9 Go min (BF16, optimisations diffusers), 24 Go multi-GPU ; clip de 5 s, 50 étapes : **A100 ≈ 1000 s, H100 ≈ 550 s** ; désactiver les optimisations « can triple VRAM usage but increase speed by 3-4 times » — [HF CogVideoX1.5-5B-I2V](https://huggingface.co/zai-org/CogVideoX1.5-5B-I2V).
- **Mochi** : ≈ 60 Go sur un GPU ; diffusers 42 Go (qualité max) / 22 Go (bf16) ; « ComfyUI can optimize Mochi to run on less than 20GB VRAM » ; H100 recommandé — [HF mochi-1-preview](https://huggingface.co/genmo/mochi-1-preview).
- **AnimateDiff SDXL-beta** : « Inference usually requires ~13GB VRAM » ; module de mouvement v1 = 417 M paramètres / 1,6 Go — [GitHub AnimateDiff](https://github.com/guoyww/AnimateDiff).
- **LTX-Video 0.9.x** : 0.9.6-distilled 2B « 15× faster, real-time capable » ; 13B dev « requires more VRAM », distilled « less VRAM », versions fp8 publiées — [HF LTX-Video](https://huggingface.co/Lightricks/LTX-Video) (aucun chiffre de VRAM).
- **LTX-2.x** : téléchargement LTX-2.5 ≈ 66 GiB ; options `--quantization fp8-cast --offload {cpu, disk}` en cas de mémoire limitée ; distillé = 8 étapes (étage 1) + 4 (étage 2) — [GitHub LTX-2](https://github.com/Lightricks/LTX-2) ; guide NVIDIA (17/03/2026) pour LTX-2.3 dans ComfyUI : **16 Go de VRAM minimum, RTX 5070 Ti ou mieux conseillée, 64 Go de RAM**, clips de 121 images (5 s) recommandés, < 257 images — [NVIDIA, guide RTX génération vidéo](https://www.nvidia.com/en-gb/geforce/news/rtx-ai-video-generation-guide) ; fichiers ComfyUI LTX-2.5 publiés en **int8** (`ltx-2.5-22b-distilled-transformer-comfy-int8-convrot`) — [docs.comfy.org LTX-2.5](https://docs.comfy.org/tutorials/video/ltx/ltx-2-5).

**Communauté (GPU grand public)**
- **RTX 3060 12 Go** (22/06/2026) : Wan2.2-14B I2V fp8 scaled (13,31 Go par expert) + LoRA Lightning : 50 min/scène à 20 étapes → **5 min 37 s à 4 étapes** ; OOM au-delà de ≈ 141 images (note interne 14/10) — [Substack D. Rusnok](https://danielrusnok.substack.com/p/0-ai-reels-on-a-12gb-gpu).
- **RTX 4060 8 Go + 32 Go RAM** (07/03/2026) : `Phr00t/WAN2.2-14B-Rapid-AllInOne` (≈ 22 Go, encodeur et VAE intégrés), 480×480, 33 images, 4 étapes, CFG 1 : **111,41 s** (échantillonnage 45 s à 11,46 s/it ; ≈ 4,5 Go en VRAM, ≈ 11 Go déchargés en RAM) — [lilting.ch](https://lilting.ch/en/articles/wan22-comfyui-rtx4060-i2v).
- Guides tiers (secondaires) : 12 Go → 14B GGUF Q4 en 4–8 min par clip 5 s ; 8 Go, 480p, 181 s avec 6 étapes lightx2v (note interne 14/10) — [wan27.org](https://wan27.org/blog/wan-2-2-requirements-guide), [Runflow](https://www.runflow.io/blog/comfyui-wan-2-2-image-to-video) ; workflow 3060 « 1440×960 60 i/s, 6 étapes » ≈ 15 min en I2V (résumé de recherche, workflow communautaire) — [civarchive 1852904](https://civarchive.com/models/1852904).
- Quantifications : GGUF QuantStack (`Wan2.2-TI2V-5B-GGUF`, `Wan2.2-Animate-14B-GGUF`) et FP8 Kijai = Apache déclarée (note interne 14/10) — [HF QuantStack/Wan2.2-Animate-14B-GGUF](https://huggingface.co/QuantStack/Wan2.2-Animate-14B-GGUF), [HF Kijai/WanVideo_comfy_fp8_scaled](https://huggingface.co/Kijai/WanVideo_comfy_fp8_scaled).
- FastWan2.2-TI2V-5B : distillation 3 étapes, 121×704×1280 ; aucun chrono publié trouvé — [deepinfra FastWan2.2](https://deepinfra.com/FastVideo/FastWan2.2-TI2V-5B-FullAttn-Diffusers).

**CPU seul**
- Aucun chiffre publié trouvé pour Wan, LTX, CogVideoX, SVD, AnimateDiff, Hunyuan ou Mochi sur CPU ; stable-diffusion.cpp (MIT) documente Wan 2.1/2.2 (T2V, I2V, FLF2V, VACE) en GGUF sans chronos CPU — [deepwiki stable-diffusion.cpp, Wan](https://deepwiki.com/leejet/stable-diffusion.cpp/6.1.6-wan-video-models) ; OpenVINO publie des carnets LTX-Video et SVD sans temps CPU dans l'extrait — [OpenVINO LTX-Video](https://docs.openvino.ai/2025/notebooks/ltx-video-with-output.html), [OpenVINO SVD](https://docs.openvino.ai/2024/notebooks/stable-video-diffusion-with-output.html).

### Inferences
- **Calculs dérivés** (multiplications, pas des mesures ; 1 sketch d'1 min ≈ 20 plans de 3 s ; un clip de 5 s majore un plan de 2–4 s) :

| Configuration | Par clip | 1 sketch (20 plans) | 1 000 plans | 1 000 sketchs (20 000 plans) |
|---|---|---|---|---|
| RTX 5090 + LightWan2.2-A14B I2V 480p | 10,7 s | ≈ 3,6 min | ≈ 3,0 h | ≈ 59 h |
| RTX 5090 + LightWan2.2-A14B I2V 720p | 26,7 s | ≈ 8,9 min | ≈ 7,4 h | ≈ 148 h |
| RTX 4090 + HunyuanVideo 1.5 480p distillé (hors règle) | 75 s | ≈ 25 min | ≈ 20,8 h | ≈ 417 h |
| RTX 3060 12 Go + Wan2.2-14B fp8, 4 étapes | ≈ 337 s | ≈ 1 h 52 | ≈ 93,6 h | ≈ 1 872 h |
| RTX 4090 + Wan2.2-TI2V-5B 720p, 50 étapes | 524,8 s | ≈ 2,9 h | ≈ 146 h | — |

- Le seul couple **Apache** qui tient l'objectif « un film d'une minute en minutes » est **Wan2.2-A14B distillé NVFP4 (LightWan) sur carte Blackwell (RTX 50xx)** ; sur Ampere/Ada (3060/4070/4090) il faut les LoRA 4 étapes fp8/GGUF, d'un ordre de grandeur plus lent.
- Les plans parlés via S2V-14B (80 Go officiels) sont le poste le plus lourd : version fp8 dans ComfyUI + LoRA 4 étapes possible mais avec perte de dynamisme documentée (Q4) → à mesurer.

### Gaps
- Pas de chrono publié : S2V-14B, Animate-14B, LTX-2.x et SVD/AnimateDiff sur GPU grand public ; TI2V-5B sur 3060/4070 ; LightWan sur RTX 5060/5070 (Blackwell grand public) ; nombre d'images du banc LightWan.
- **Aucun chiffre CPU seul** pour aucun modèle → mesure maison à faire (TI2V-5B GGUF via stable-diffusion.cpp sur le PC i7-1165G7 de l'utilisateur, 33 images 480p), avant toute estimation.
- Un chiffre NVIDIA « RTX 5090, 4 s 720p en ≈ 25 s » pour LTX-2 apparaît dans un résumé de recherche mais pas dans la page NVIDIA lue (17/03/2026) → non retenu.

---

## Q6. ComfyUI : support natif (nœuds du cœur, gabarits officiels) et fichiers (dépôts Comfy-Org)

### Takeaway
**Natif dans ComfyUI avec gabarits officiels** : Wan 2.2 (TI2V-5B, I2V-A14B, FLF2V, S2V, Animate, Fun, Animate-2, InfiniteTalk), LTX-Video 0.9.5, LTX-2 / 2.3 / 2.5 (dont I2V, FLF2V, depth/canny/pose), HunyuanVideo (I2V v1) et HunyuanVideo 1.5 (T2V/I2V), SVD (nœuds de base). **Non natif** : CogVideoX (enveloppe Kijai), AnimateDiff (AnimateDiff-Evolved) ; Mochi = paquet Comfy-Org mais pas de tutoriel officiel listé. ComfyUI est sous GPL-3.0.

### Cited Findings
- Liste des tutoriels vidéo officiels (lue le 16/10/2026) : `hunyuan/hunyuan-video`, `hunyuan/hunyuan-video-1-5`, `ltxv`, `ltx/ltx-2`, `ltx/ltx-2-3`, `ltx/ltx-2-5`, `ltx/ltx-2-5-dfr`, `wan/wan2_2`, `wan/wan2-2-s2v`, `wan/wan2-2-animate`, `wan/wan-animate-2`, `wan/wan-flf`, `wan/wan2-2-fun-control|inp|camera`, `wan/vace`, `wan/wan-infinitetalk`, `minimax/minimax-h3*`, `kandinsky/kandinsky-5`… ; **aucun** tutoriel CogVideoX, SVD, Mochi ou AnimateDiff — [docs.comfy.org, index Get Started](https://docs.comfy.org/_llms/en/get-started.txt).
- **Wan 2.2** — dépôt `Comfy-Org/Wan_2.2_ComfyUI_Repackaged` ; TI2V-5B : `wan2.2_ti2v_5B_fp16.safetensors` + `wan2.2_vae.safetensors` + `umt5_xxl_fp8_e4m3fn_scaled.safetensors` (gabarit `video_wan2_2_5B_ti2v`) ; I2V-14B : `wan2.2_i2v_high_noise_14B_fp16.safetensors` + `wan2.2_i2v_low_noise_14B_fp16.safetensors` + `wan_2.1_vae.safetensors` (gabarit `video_wan2_2_14B_i2v`) ; FLF2V : `video_wan2_2_14B_flf2v` ; incohérence relevée : l'étape I2V cite les fichiers T2V `fp8_scaled` — [docs.comfy.org Wan2.2](https://docs.comfy.org/tutorials/video/wan/wan2_2).
- **Wan2.2-S2V** — « natively supported » ; gabarit `video_wan2_2_14B_s2v` ; `wan2.2_s2v_14B_fp8_scaled.safetensors` (ou `_bf16`), `wav2vec2_large_english_fp16.safetensors` (dossier `audio_encoders/`), `wan_2.1_vae.safetensors`, `umt5_xxl_fp8_e4m3fn_scaled.safetensors` ; LoRA `wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors` — [docs.comfy.org S2V](https://docs.comfy.org/tutorials/video/wan/wan2-2-s2v).
- **Wan2.2-Animate** — `Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ` ou bf16, LoRA `lightx2v_I2V_14B_480p_cfg_step_distill_rank64`, DWPose, extension +77 images (note interne 14/10) — [docs.comfy.org Wan2.2 Animate](https://docs.comfy.org/tutorials/video/wan/wan2-2-animate). **Wan-Animate-2** — `Comfy-Org/Wan-Animate-2` : `wan_animate_2_int8_convrot.safetensors` (défaut), `_bf16`, `_distill_int8_convrot`, `_distill_bf16`, LoRA lightx2v, `clip_vision_h`, `Wan2_1_VAE_bf16` — [docs.comfy.org Wan-Animate-2](https://docs.comfy.org/tutorials/video/wan/wan-animate-2).
- **InfiniteTalk** — `Wan2_1-I2V-14B-480p_fp8_e4m3fn_scaled_KJ` + patchs `wan2.1_infiniteTalk_single_fp16` / `wan2.1_infiniteTalk_multi_fp16` + `wav2vec2-chinese-base_fp16` — [docs.comfy.org InfiniteTalk](https://docs.comfy.org/tutorials/video/wan/wan-infinitetalk).
- **LTX-Video 0.9.5** — `ltx-video-2b-v0.9.5.safetensors` + `t5xxl_fp16.safetensors` ; gabarits `ltxv_image_to_video`, `ltxv_text_to_video` ; « multi-frame control from start and end images » — [docs.comfy.org LTXV](https://docs.comfy.org/tutorials/video/ltxv).
- **LTX-2** (19B) — gabarits `video_ltx2_i2v`, `video_ltx2_i2v_distilled`, `video_ltx2_t2v(_distilled)`, `video_ltx2_depth_to_video`, `video_ltx2_canny_to_video`, `video_ltx2_pose_to_video` ; `ltx-2-19b-distilled` (8 étapes, CFG=1), upscalers `ltx-2-spatial-upscaler-x2-1.0`, `ltx-2-temporal-upscaler-x2-1.0` ; paquet `Comfy-Org/ltx-2` — [docs.comfy.org LTX-2](https://docs.comfy.org/tutorials/video/ltx/ltx-2), [API HF Comfy-Org/ltx-2](https://huggingface.co/api/models/Comfy-Org/ltx-2).
- **LTX-2.5** — « natively supported » ; 4 gabarits : T2V, I2V (`video_ltx2_5_i2v`), FLF2V (`video_ltx2_5_flf2v`), DFR ; fichiers dans le dépôt conditionné `Lightricks/LTX-2.5` : `ltx-2.5-22b-distilled-transformer-comfy-int8-convrot`, `gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot`, `ltx-2.5-video-vae-bf16`, `ltx-2.5-audio-vae-bf16`, `ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0` ; amplificateur de prompt optionnel ≈ 5 Go, + 1–2 min — [docs.comfy.org LTX-2.5](https://docs.comfy.org/tutorials/video/ltx/ltx-2-5).
- **HunyuanVideo 1.5** — `Comfy-Org/HunyuanVideo_1.5_repackaged` : `hunyuanvideo1.5_720p_i2v_fp16.safetensors`, `hunyuanvideo1.5_720p_t2v_fp16.safetensors`, `hunyuanvideo1.5_1080p_sr_distilled_fp16.safetensors`, `qwen_2.5_vl_7b_fp8_scaled`, `byt5_small_glyphxl_fp16`, `hunyuanvideo15_vae_fp16`, `sigclip_vision_patch14_384` ; gabarit `video_hunyuan_video_1.5_720p_i2v` — [docs.comfy.org Hunyuan 1.5](https://docs.comfy.org/tutorials/video/hunyuan/hunyuan-video-1-5). **HunyuanVideo-I2V** (05/03/2025) : flux « V1 concat » — [docs.comfy.org Hunyuan Video](https://docs.comfy.org/tutorials/video/hunyuan/hunyuan-video).
- **SVD** — natif : `svd.safetensors` (14 images), `svd_xt.safetensors` (25 images), nœud `VideoLinearCFGGuidance`, réglages `video_frames`, `fps`, `motion_bucket_id`, niveau d'augmentation — [ComfyUI Examples, Video](https://comfyanonymous.github.io/ComfyUI_examples/video/).
- **CogVideoX** — pas de nœuds du cœur trouvés ; enveloppe Kijai `ComfyUI-CogVideoXWrapper` (1.5, Fun, Tora, I2V) — [comfy.org, nœuds supportés](https://comfy.org/cloud/supported-nodes/comfyui-cogvideoxwrapper.md), licence Apache-2.0 — [LICENSE](https://github.com/kijai/ComfyUI-CogVideoXWrapper/blob/main/LICENSE).
- **AnimateDiff** — nœud communautaire `ComfyUI-AnimateDiff-Evolved` (Apache-2.0) — [LICENSE](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved/blob/main/LICENSE).
- **Mochi** — paquet `Comfy-Org/mochi_preview_repackaged` (Apache-2.0) — [API HF](https://huggingface.co/api/models/Comfy-Org/mochi_preview_repackaged) ; la fiche cite aussi `ComfyUI-MochiWrapper` — [HF mochi-1-preview](https://huggingface.co/genmo/mochi-1-preview).

### Inferences
- Tout le parcours recommandé (TI2V-5B, I2V-A14B + FLF2V, S2V, InfiniteTalk multi, Animate-2) existe en **gabarits officiels** → on peut piloter ComfyUI par son API sans nœuds exotiques. Mais la règle « code exécuté chez nous = MIT/Apache/BSD » exclut ComfyUI (GPL-3.0) **en production embarquée** ; la voie conforme est Diffusers / LightX2V / DiffSynth-Studio (Apache) avec les mêmes poids, ComfyUI restant un banc d'essai externe.

### Gaps
- Pas de VRAM ni de durée dans les pages ComfyUI (hors « 8 Go pour TI2V-5B ») ; le support natif Mochi n'a pas de page officielle dans l'index lu.

---

## Q7. Verdict : classement pour notre cas (images Pixar-like, 2–3 personnages africains, sketchs FR d'1 min, plans 2–4 s, ≈ 1 000 vidéos, 0 abonnement)

### Takeaway
**1er : famille Wan 2.2 (Apache-2.0)** — meilleur VBench-I2V ouvert, mouvement + identité équilibrés, support ComfyUI/Diffusers complet, seule famille conforme à la règle du projet : **S2V-14B** (ou InfiniteTalk « multi ») pour les répliques parlées, **I2V-A14B + FLF2V + LightX2V/LightWan** pour gestes et réactions, **TI2V-5B** pour le 9:16 natif à 24 i/s et les petites cartes. Puis, hors règle : **HunyuanVideo 1.5** (esthétique, 75 s/clip sur 4090) et **LTX-2.5** (audio, multishot, FLF2V, le plus rapide, mais LTX-2 I2V quasi statique sur VBench). Loin derrière : CogVideoX, SVD, AnimateDiff, HunyuanVideo-I2V, Mochi.

### Cited Findings
- Wan2.2-TI2V-5B 88,80 % et I2V-A14B 88,68 % (VBench-I2V, prompt optimisé) > LTX-2-I2V 87,59 % (degré de mouvement 8,54 %) > HunyuanVideo-I2V 86,82 % > CogVideoX-5b-I2V 86,70 % — [HF Space VBench_Leaderboard](https://huggingface.co/spaces/Vchitect/VBench_Leaderboard).
- Wan 2.2 = Apache-2.0 code et poids — [GitHub Wan2.2 LICENSE.txt](https://github.com/Wan-Video/Wan2.2/blob/main/LICENSE.txt), [API HF Wan2.2-I2V-A14B](https://huggingface.co/api/models/Wan-AI/Wan2.2-I2V-A14B) ; S2V = audio + image + texte, durée = audio — [HF Wan2.2-S2V-14B](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B) ; InfiniteTalk multi-personnages — [docs.comfy.org InfiniteTalk](https://docs.comfy.org/tutorials/video/wan/wan-infinitetalk).
- LightWan2.2-A14B : I2V 480p 10,7 s sur RTX 5090 (Apache) — [HF LightWan2.2-A14B](https://huggingface.co/lightx2v/LightWan2.2-A14B).
- Test 3D « Pixar » : cohérence de personnage Wan 2.2 et Hunyuan 1.5 « Excellent », LTX 2.3 « Good » — [ALwrity](https://www.alwrity.com/post/open-source-i2v-model-comparison-hunyuan-ltx-wan).
- HunyuanVideo 1.5 : 75 s sur 4090, 14 Go min — [HF HunyuanVideo-1.5](https://huggingface.co/tencent/HunyuanVideo-1.5) ; licence exclue en UE/R-U/Corée — [LICENSE HunyuanVideo-I2V](https://huggingface.co/tencent/HunyuanVideo-I2V/blob/main/LICENSE).
- LTX-2.5 : multishot, FLF2V, audio, 50 i/s, natif ComfyUI — [docs.comfy.org LTX-2.5](https://docs.comfy.org/tutorials/video/ltx/ltx-2-5) ; 19e/23 sur l'arène AA (985) — [Artificial Analysis I2V](https://artificialanalysis.ai/video/leaderboard/image-to-video) ; licence 10 M$ — [HF LTX-2 LICENSE](https://huggingface.co/Lightricks/LTX-2/blob/main/LICENSE).
- SVD sans contrôle texte et faible sur visages/personnes — [HF SVD-XT 1.1](https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt-1-1) ; Mochi T2V seul et faible en animation — [HF mochi-1-preview](https://huggingface.co/genmo/mochi-1-preview) ; CogVideoX-5B-I2V 720×480, 6 s, 8 i/s, licence à plafond de visites — [HF CogVideoX-5b-I2V](https://huggingface.co/zai-org/CogVideoX-5b-I2V), [LICENSE](https://huggingface.co/zai-org/CogVideoX-5b-I2V/blob/main/LICENSE) ; AnimateDiff : scintillement, base SD OpenRAIL — [GitHub AnimateDiff](https://github.com/guoyww/AnimateDiff).

**Classement argumenté**

| Rang | Modèle | Pour notre cas | Licence / règle projet |
|---|---|---|---|
| 1 | **Wan2.2-S2V-14B** (+ InfiniteTalk multi en complément) | seul ouvert Apache qui prend **notre voix française** et anime bouche, tête, buste ; pose optionnelle | Apache ✔ |
| 1 bis | **Wan2.2-I2V-A14B** + FLF2V + LightX2V/LightWan (+ LoRA anti-ralenti) | gestes, réactions, entrées/sorties, raccords exacts image clé → image clé ; meilleur VBench-I2V ouvert | Apache ✔ |
| 1 ter | **Wan2.2-TI2V-5B** (FastWan 3 étapes en option) | 9:16 natif 704×1280 à 24 i/s, tient sur 8 Go avec offload ComfyUI | Apache ✔ |
| 2 | HunyuanVideo 1.5 | esthétique 3D très bonne, rapide (75 s/4090), mais pas d'audio et peu de déplacement dans le test cartoon | Tencent ✘ (hors règle ; exclusions territoriales) |
| 3 | LTX-2.5 / 2.3 | audio→vidéo, multishot, FLF2V, le plus riche ; mais I2V LTX-2 peu dynamique (VBench) et dérive de sujet signalée | LTX-2.x ✘ (gratuit < 10 M$, hors règle) |
| 4 | CogVideoX1.5-5B-I2V / 5B-I2V | génération 2024, basse résolution / 8–16 i/s, prompts anglais | CogVideoX License ✘ |
| 5 | SVD-XT 1.1 | aucun contrôle par le texte, ≤ 4 s, visages fragiles → inadapté aux répliques | Stability Community ✘ |
| 6 | AnimateDiff v3 + SparseCtrl | boucles stylisées SD1.5, 16 images, scintillement | Apache + OpenRAIL-M ✘ |
| 7 | HunyuanVideo-I2V | dépassé par 1.5 ; 60 Go, 1904 s/clip 720p sur 1 GPU | Tencent ✘ |
| 8 | Mochi 1 | pas d'I2V, mauvais en animation | Apache ✔ mais inutilisable ici |

### Inferences
- **Innovation proposée (combinaison, à mesurer)** : « plan parlé = S2V, plan joué = I2V-A14B FLF2V » orchestrés par notre moteur JEV : (1) l'image clé de chaque plan vient de nos planches ; (2) la réplique FR (TTS) pilote S2V sur le seul personnage qui parle (masque), le(s) autre(s) restant sur l'image clé ou animés en écoute par un I2V court ; (3) la **dernière image** de chaque plan est imposée (FLF2V) pour que le montage raccorde sans saut ; (4) un juge automatique compare identité (embedding visage/silhouette vs planche), déformation (stabilité des contours), rythme (vitesse de mouvement vs nos TikTok) et relance le plan fautif seulement. Critère d'acceptation : ≥ 95 % des plans acceptés au premier tirage sur un lot de 40 plans, avec dérive d'identité mesurée inférieure à celle de Grok sur le même lot.
- **Matériel cible** pour « 1 min en minutes » sous licence Apache : une carte Blackwell (RTX 50xx) avec LightWan NVFP4 (≈ 3,6 min de calcul par sketch en 480p, dérivé) ; sans Blackwell, 4070/4090 + fp8 + LoRA 4 étapes, puis interpolation 16 → 24/30 i/s et agrandissement.

### Gaps
- Classement final à confirmer par **un banc maison sur nos planches** (aucune source ne teste des personnages africains 3D cartoon en dialogue multi-personnages) : 20 plans × {S2V, InfiniteTalk multi, I2V-A14B 4 étapes, TI2V-5B, Hunyuan 1.5, LTX-2.5} mesurés avec `mesure2.py` / `measure.ts` (identité, déformation, mouvement, lèvres FR, temps GPU).
- Tenue de la langue française par S2V (encodeur wav2vec2 anglais) et par LTX-2.x A2V : non documentée → mesure de synchro labiale sur 10 répliques FR.
