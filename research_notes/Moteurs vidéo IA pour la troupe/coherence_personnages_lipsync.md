# Animer une troupe fixe de 54 personnages cartoon de façon cohérente avec des modèles vidéo IA (état au 16/10/2026)

Périmètre : cohérence d'identité et de style sur de nombreuses vidéos, animation depuis un dessin de référence, scènes à
2–4 personnages, parole et lip-sync en français ivoirien, format TikTok 9:16 de 25–60 s. Le contexte vient de l'utilisateur :
7 personnages avec planche de 5 poses, 32 avec une seule image de galerie, 8 en texte seul, et un essai Blender jugé « trop
lego », au mouvement saccadé.

**Contrainte ajoutée en cours de recherche : budget ZÉRO** (« je veux tout gratuit »). Les outils ouverts et gratuits qui
tournent sur GPU gratuit (Kaggle T4×2 16 Go ; Colab T4 gratuit ; le P100 Kaggle est retiré depuis le 15/09/2026 selon les
notes antérieures) ou sur CPU (4 cœurs, 15 Go de RAM) passent en premier. Les outils fermés ou payants ne figurent plus qu'en
comparaison. La question Q8 traite à part l'adéquation au T4 et les durées sur T4 ou CPU, outil par outil. Le classement de Q7
en tient compte.

Notes antérieures réutilisées sans les refaire : `research_notes/Animer Blender par prompt/animation_personnages_dessines.md`
(transfert de mouvement, avatars parlants, 2D, alpha, matériel), `modeles_video_ouverts_pilotes.md` (famille Wan, licences,
vitesses) et le rapport `reports/Animer Blender par prompt.md` (chaîne « Blender épingle, l'API interpole », prix OpenRouter
au 14/10/2026). Les faits repris de ces notes portent la mention *(notes antérieures)* et gardent leur source d'origine.

---

## Q1 — Entraîner une LoRA de personnage sur un modèle vidéo (Wan 2.x, HunyuanVideo, LTX) : données, temps, VRAM, outils, extension synthétique depuis quelques dessins, combinaison de plusieurs personnages

### Takeaway
Une LoRA de personnage sur Wan 2.2 se fait avec **15 à 40 images fixes** (25–40 recommandées). Il faut environ **3,5–4 h sur
une carte 12 Go**, ou **15–25 min sur A100** (guides communautaires). Les outils sont libres : musubi-tuner (Apache-2.0),
ai-toolkit (MIT), DiffSynth-Studio (Apache-2.0), diffusion-pipe (GPL-3.0) et OneTrainer (AGPL-3.0). Depuis 1 à 5 dessins, on
fabrique le jeu d'images avec **Qwen-Image-Edit-2509/2511 (Apache-2.0)**. FLUX.1 Kontext-dev est sous licence non commerciale
et Nano Banana Pro est fermé. Le point dur est la scène à plusieurs : **deux LoRA d'identité actives en même temps se
mélangent** en un personnage « moyen ». Les parades connues sont une LoRA entraînée sur les deux personnages ensemble, un
routage régional par l'attention (prouvé en image, pas en vidéo Wan) ou l'épinglage d'une image composite en première image.

### Cited Findings
**Quantité de données et réglages (guides communautaires, non officiels)**
- Wan 2.2 : « Minimum viable dataset: 15 images » ; 25–40 recommandées ; 15–30 images pour l'I2V, 20–50 pour le T2V ; au moins
  5 angles, 3 éclairages et 3 expressions. Il est conseillé d'entraîner une LoRA dès qu'il faut le même personnage sur plus de
  3 clips ou au-delà de 5 s — [wan27.org, 08/06/2026](https://wan27.org/blog/wan-2-2-lora-training-guide).
- Même guide : RTX 3060/4060 12 Go = **3,5–4 h** (30 images, rang 32, 10 époques) ; RTX 4070 = 2,5–3 h ; **A100 cloud =
  15–25 min** à 1024 px. Réglages 12 Go : rang 32, alpha 16, LR 5e-5, 512 px, batch 1, 10 époques. Réglages 16 Go+ : rang 64,
  1024 px, 8–15 époques. Le guide signale un surapprentissage au-delà d'environ 10 époques et conseille un test d'inférence
  toutes les 2–3 époques plutôt que de se fier à la perte —
  [wan27.org](https://wan27.org/blog/wan-2-2-lora-training-guide).
- **Les LoRA T2V et I2V ne sont pas interchangeables** : on entraîne sur le checkpoint utilisé à l'inférence. Une LoRA T2V
  employée en I2V à 0,4–0,6 « drops noticeably » — [wan27.org](https://wan27.org/blog/wan-2-2-lora-training-guide).
- Autres fourchettes communautaires : 15–25 images, « as few as 9 workable if they are high quality » —
  [Floyo, WAN LoRA training](https://floyo.ai/pages/wan-lora-training--7cxDh08tmcvb). La synthèse de recherche cite aussi
  ≈ 12 Go comme plancher pour une LoRA d'images et ≈ 24 Go pour une LoRA de vidéos —
  [synthèse de forum HF](https://huggingface.co/datasets/John6666/forum1/blob/e2772d17729a88bbc2d7379c6220c46b85ef5a31/wan22_lora_training.md).
- LTX-2.3 : des clips de 9 à 25 images suffisent pour l'identité, et un jeu d'images seules fonctionne pour l'identité et le
  style ; 512 px est le minimum pratique (guides RunComfy, corps d'article non lisible à la récupération, d'après l'extrait de
  recherche) — [RunComfy LTX-2.3 guide](https://www.runcomfy.com/trainer/ai-toolkit/ltx-2-3-lora-training-guide). Un
  entraînement LTX-2.3 22B sur 12 Go est documenté par un particulier —
  [note.com](https://note.com/sepiablue/n/n0b97545406aa?hl=en).

**Outils, VRAM, licences**
- **musubi-tuner (kohya-ss)** entraîne des LoRA pour HunyuanVideo, HunyuanVideo 1.5, Wan2.1/2.2, FramePack, FLUX.1 Kontext,
  FLUX.2, Qwen-Image, Z-Image, Kandinsky 5 et MiniMax-H3. Son code est sous Apache-2.0, mais les dossiers dérivés de
  HunyuanVideo suivent la licence Tencent — [README](https://github.com/kohya-ss/musubi-tuner).
- musubi-tuner/Wan : la prise en charge de Wan2.2 se limite aux 14B (`t2v-A14B`, `i2v-A14B`). Le guide indique **24 Go** pour
  entraîner sur des images 720×1280. Entraîner les deux experts haut et bas bruit avec `--offload_inactive_dit` demande
  **≈ 42 Go de VRAM partagée** en fp8 et **≥ 96 Go de RAM sous Windows**, moins avec `--blocks_to_swap` (au plus 39 pour les
  14B). `--fp8_fast` « seems to degrade the output quality » — [docs/wan.md](https://github.com/kohya-ss/musubi-tuner/blob/main/docs/wan.md).
- **ai-toolkit (Ostris) : MIT** ([LICENSE](https://github.com/ostris/ai-toolkit/blob/main/LICENSE)) ; prend en charge Wan
  2.2 T2V/I2V-14B et dispose d'une interface graphique ([wan27.org](https://wan27.org/blog/wan-2-2-lora-training-guide)).
  **DiffSynth-Studio : Apache-2.0** ([LICENSE](https://github.com/modelscope/DiffSynth-Studio/blob/main/LICENSE)).
  **diffusion-pipe : GPL-3.0** ([LICENSE](https://github.com/tdrussell/diffusion-pipe/blob/main/LICENSE)).
  **OneTrainer : AGPL-3.0** ([LICENSE](https://github.com/Nerogar/OneTrainer/blob/master/LICENSE.txt)). Licences lues le
  16/10/2026 ; elles portent sur les outils, pas sur les LoRA produites.
- **LTX-2** : le modèle recommandé est **LTX-2.5**, et LTX-2.3 est classé « legacy ». Le paquet officiel `ltx-trainer` gère
  LoRA, fine-tuning complet et IC-LoRA. Le dépôt propose aussi des pipelines A2Vid (audio → vidéo) et « Dub-It » (redoublage
  avec identité vocale et lèvres) — [Lightricks/LTX-2](https://github.com/Lightricks/LTX-2).
- Licence LTX : « LTX-2 Community License » du 05/01/2026 (LTX-2 et 2.3), puis **« LTX-2.x Community License » du
  11/08/2026** (LTX-2.5 et suivants). Une entité ayant **≥ 10 000 000 $ de chiffre d'affaires annuel** doit acheter une
  licence commerciale. En dessous de ce seuil, l'usage commercial est couvert par la licence communautaire —
  [LICENSE](https://github.com/Lightricks/LTX-2/blob/main/LICENSE), [LICENSE-2_x](https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x).
- Une LoRA « Dual-Character » pour LTX-2.3 22B (Apache-2.0) est faite pour les dialogues à deux. Elle passe par
  **l'épinglage d'une image composite en image 0**, un personnage de chaque côté. L'identité dérive d'un plan à l'autre, d'où
  la règle de « re-pin » à chaque plan. Les répliques entre guillemets font apparaître de faux sous-titres. Surtout,
  **l'orientation portrait dégrade l'identité** (LoRA entraînée en paysage). Il faut 3–4 min par plan de 5 s sur 24 Go, et une
  carte de 16 Go ne contient pas le 22B en bf16 —
  [HF SyFeee/LTX2.3-Dual-Character-en](https://huggingface.co/SyFeee/LTX2.3-Dual-Character-en).

**Fabriquer le jeu de données à partir de quelques dessins**
- **Qwen-Image-Edit-2511 : Apache-2.0** (fiche HF, créée le 17/12/2025) ; Qwen-Image-Edit-2509 : Apache-2.0 —
  [HF 2511](https://huggingface.co/Qwen/Qwen-Image-Edit-2511), [HF 2509](https://huggingface.co/Qwen/Qwen-Image-Edit-2509).
- Des workflows ComfyUI communautaires transforment **une seule image** de personnage en jeu multi-poses avec légendes, via
  Qwen-Image-Edit 2511 et une LoRA Lightning 4 pas —
  [Floyo, Qwen 2511 single image to character dataset](https://www.floyo.ai/workflows/qwen-2511-single-image-to-character--z4vpyev94iuc).
  Un autre workflow conseille de commencer par une **planche de personnage** (face/dos) pour garder la cohérence —
  [Floyo](https://floyo.ai/pages/wan-lora-training--7cxDh08tmcvb). Un Space HF génère des planches de rotation à 7 vues depuis
  une image avec Qwen-Image-Edit en local —
  [CharacterForgePro](https://huggingface.co/spaces/cronos3k/CharacterForgePro/blob/main/src/__init__.py).
- **FLUX.1-Kontext-dev** est sous `flux-1-dev-non-commercial-license` (fiche HF) —
  [HF](https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev).
- **Nano Banana Pro** (Google, fermé) accepte jusqu'à 14 images de référence et garde la ressemblance de jusqu'à 5 personnes,
  selon des sources secondaires. Une source parle de « 5 characters and 6 objects ». Un guide tiers conseille ≤ 6 références
  pour la meilleure fidélité. Aucune page Google officielle n'a été lue —
  [Analytics Vidhya, 02/2026](https://www.analyticsvidhya.com/blog/2026/02/nano-banana-2-vs-nano-banana-pro/),
  [Morphic](https://morphic.com/kr/resources/models/nano-banana-pro),
  [LaoZhang](https://blog.laozhang.ai/en/posts/nano-banana-pro-face-consistency-guide).

**Plusieurs personnages dans une scène**
- Le problème est décrit ainsi : « Two character LoRAs active at once, and the model blends them into one averaged person ».
  Un nœud ComfyUI applique chaque LoRA à sa région de l'image « at the attention level ». Il vise un modèle d'image (Krea 2),
  pas Wan — [comfy.icu, K2 Regional LoRA](https://comfy.icu/node/FVM_K2_LoRA).
- Contournement communautaire : une seule LoRA Wan 2.2 entraînée sur **deux** personnages pour les garder distincts
  ([civarchive](https://civarchive.com/models/2327568)). Wan 2.2 accepte aussi des LoRA différentes, à des forces
  différentes, sur ses experts haut et bas bruit ([MindStudio](https://www.mindstudio.ai/blog/what-is-wan-2-2-video-open-source)).
  Aucune source ne montre que cela règle le mélange.
- La dérive d'identité en I2V Wan 2.2 croît avec le mouvement, les changements de caméra et d'expression (extrait de
  recherche) — [RunComfy, Wan 2.2 I2V character consistency](https://www.runcomfy.com/trainer/ai-toolkit/wan-2-2-i2v-character-consistency-lora).

### Inferences
- Pour 54 personnages, une LoRA par personnage n'est pas rentable : il faudrait 54 entraînements de 3–4 h sur 12 Go, et les
  LoRA se mélangent dès qu'on en combine. Le schéma raisonnable est le suivant :
  (a) **une LoRA de style « troupe »**, entraînée sur l'ensemble des 7 planches et des 32 images de galerie, pour verrouiller
  le rendu Pixar ou Franco-africain 2D ;
  (b) **des LoRA d'identité I2V seulement pour les 5 à 7 personnages vedettes**. Sous budget zéro, cette étape passe par des
  **LoRA d'image** (Z-Image-Turbo, < 12 Go) qui fabriquent les images clés : la LoRA vidéo Wan 14B n'est pas raisonnable sur
  un T4 (voir Q8) ;
  (c) l'identité de tous les autres portée par la **première image** (I2V) ou par des **références** (Q2).
- Pour les 7 planches, 5 poses ne suffisent pas. Il faut les étendre à 20–30 images avec Qwen-Image-Edit-2511 (angles 3/4,
  dos, gros plans visage, bouches ouvertes sur les voyelles A/O/I/M, lumières différentes), puis faire une revue humaine et
  écarter toute image hors modèle. Pour les 32 personnages à une image, on part d'une planche de rotation générée et validée
  avant toute LoRA. Pour les 8 en texte seul, il faut d'abord fixer une image canonique (génération puis validation),
  sinon tout le reste dérive.
- Le 9:16 est un risque transversal. Phantom (Q2) et la LoRA LTX Dual-Character disent toutes deux que le vertical est moins
  stable. Il faut donc inclure des images 9:16 dans le jeu d'entraînement, ou générer en 3:4 puis recadrer et étendre l'image.
- Pour les scènes à 2–4 personnages, la voie la plus sûre à LoRA constante est **l'image composite épinglée** : on compose
  l'image clé avec tous les personnages via un éditeur d'images multi-références, puis on fait de l'I2V avec la LoRA de style
  seule. On ne combine pas les LoRA d'identité.

### Gaps
- Aucune mesure publique de LoRA vidéo sur des personnages **cartoon à grosse tête** ou d'un style africain 2D : les guides
  portent sur des humains réalistes.
- Les durées et la VRAM d'une LoRA HunyuanVideo 1.5 ou LTX-2.5 n'ont pas été trouvées. Les pages RunComfy LTX ne se lisaient
  pas à la récupération (seuls les extraits de recherche sont disponibles).
- Aucune comparaison publiée entre « LoRA par personnage » et « références sans entraînement » sur une troupe nombreuse.
- Aucune source primaire n'établit si les LoRA de deux personnages peuvent être isolées par masque dans Wan vidéo (régional
  par attention).

---

## Q2 — Référence → vidéo sans entraînement (VACE, Phantom, MAGREF, SkyReels, HunyuanCustom, Kling, Veo, Vidu, Seedance, Wan 2.7) : combien d'identités à la fois, qualité sur cartoon

### Takeaway
En poids ouverts, **Phantom-Wan (Apache-2.0, ≤ 4 références)** et **SkyReels-V3 R2V (1–4 références, 9:16 pris en charge,
licence Skywork Community autorisant le commercial sous conditions)** sont les plus utilisables. MAGREF (Apache-2.0) mène son
propre classement mais demande **≈ 70 Go de VRAM**. HunyuanCustom est sous licence Tencent exclue de l'UE, du Royaume-Uni et
de la Corée. Les services fermés montent plus haut : Kling 3.0 Omni/O1 accepte jusqu'à 7 éléments avec voix liée, Vidu Q2 7
images, Seedance 2.0 12 références et 2.5 jusqu'à 50 entrées, Wan 2.7 5 références avec voix liée, Veo 3.1 3 images en 9:16
natif. **Aucune source indépendante ne mesure ces outils sur des personnages cartoon**, et les benchmarks open source
signalent un effet « copier-coller » des références.

### Cited Findings
**Poids ouverts**
- **Phantom-Wan** : versions 1.3B et 14B, sous Apache-2.0. Le dépôt dit : « The number of reference images should be within
  4 ». Le 14B a été entraîné en 480P. Surtout, « horizontal videos … tend to produce more stable results compared to vertical
  videos ». Les exemples comptent quelques scènes cartoon (grand-père cartoon dans un café cartoon). Le 14B est sorti le
  27/05/2025 et un wrapper ComfyUI Kijai existe — [GitHub Phantom](https://github.com/Phantom-video/Phantom).
- **MAGREF** (ICLR 2026) : Apache-2.0, base Wan2.1 I2V 14B, aucun nombre maximal de références indiqué. L'inférence mono-GPU
  prend « around 70 GB of VRAM » (H100 testé). Il existe des nœuds ComfyUI Kijai et un FP8 —
  [GitHub MAGREF](https://github.com/MAGREF-Video/MAGREF). Scores auto-déclarés multi-sujets : MAGREF 0,694, Phantom 0,668,
  SkyReels-A2 0,604 — [arXiv 2505.23742](https://arxiv.org/html/2505.23742v2).
- Benchmark tiers **OpenS2V-Nexus** : SkyReels-A2 a le NexusScore le plus haut parmi les modèles ouverts, mais un NaturalScore
  bas qui trahit un **problème de copier-coller**. Phantom-14B passe devant SkyReels-A2-P14B au score total —
  [arXiv 2505.20292](https://arxiv.org/html/2505.20292v4).
- **SkyReels-V3** (poids et code publiés le 29/01/2026) comprend trois modèles : Reference-to-Video 14B-720P (**1 à 4 images
  de référence**, ratios dont **9:16**, clips de 5 s à 24 i/s conseillés), Video Extension 14B (5–30 s, avec « shot
  switching » Cut-In / Shot-Reverse Shot / Multi-Angle) et Talking Avatar 19B (voir Q5). Il existe un mode `--low_vram` pour
  les GPU de moins de 24 Go — [GitHub SkyReels-V3](https://github.com/SkyworkAI/SkyReels-V3). Licence : « Skywork Community
  License », « supports commercial use » sous ses conditions —
  [LICENSE.txt](https://github.com/SkyworkAI/SkyReels-V3/blob/main/LICENSE.txt).
- **HunyuanCustom** (08/05/2025) : base HunyuanVideo. Il accepte une ou plusieurs images de sujet, le multi-sujet figurant
  encore au plan d'ouverture, ainsi qu'un audio qui fait parler le sujet et le remplacement de sujet dans une vidéo. VRAM :
  80 Go en pointe en 720p, 24 Go minimum « very slow », 8 Go via WanGP —
  [GitHub](https://github.com/Tencent-Hunyuan/HunyuanCustom). Licence « TENCENT HUNYUAN COMMUNITY LICENSE … DOES NOT APPLY IN
  THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA » — [LICENSE](https://github.com/Tencent-Hunyuan/HunyuanCustom/blob/main/LICENSE).
- **Wan2.1-VACE-14B : Apache-2.0** (fiche HF) — [HF](https://huggingface.co/Wan-AI/Wan2.1-VACE-14B). Les notes antérieures
  détaillent VACE et Wan2.2-VACE-Fun (profondeur, pose, masque et images de référence) et donnent ≈ 261 s par clip 480p en
  1.3B sur 4090 *(notes antérieures)* — [fiche VACE-1.3B](https://huggingface.co/Wan-AI/Wan2.1-VACE-1.3B).

**Services fermés**
- **Kling (guide « Element Library », 05/02/2026)** : un élément multi-images contient de 2 à 4 images (1 principale et 3
  annexes). Un élément vidéo se fait à partir d'un clip de 3–8 s. Par génération, Video 3.0 Omni ou O1 acceptent **jusqu'à 7
  éléments sans vidéo** et 4 avec une vidéo. Video 3.0 avec image(s) de début/fin lie jusqu'à 3 éléments, qui doivent figurer
  dans ces images. Chaque élément personnage peut recevoir une **voix liée** à partir de 5–30 s d'audio d'une seule personne,
  mais les langues ne sont pas listées. **Plafond d'éléments par abonnement : 30 sans abonnement, 50 en Standard, 150 en Pro
  et Premier, 500 en Ultra** — [Kling](https://kling.ai/quickstart/klingai-element-library-3-user-guide).
- Kling 3.0 Omni : des guides tiers disent qu'on attribue chaque réplique à un personnage dans le prompt et que plus de 3
  personnages aux voix distinctes tiennent dans une scène. Ces chiffres ne sont pas vérifiés par Kling —
  [Kling blog Omni audio](https://kling.ai/blog/kling-video-3-omni-native-lip-sync-audio-guide),
  [kingy.ai](https://kingy.ai/news/kling-3-0-review-a-serious-step-toward-ai-video-as-a-production-system/).
- **Veo 3.1 « Ingredients to video »** accepte jusqu'à **3 images de référence** (personnage, objet, décor) via
  `reference_images` (10/2025). La mise à jour de janvier 2026 garde personnages et décors cohérents d'une vidéo à l'autre et
  ajoute le **9:16 natif** dans ce mode, ainsi que la 1080p et la 4K —
  [Google Developers Blog](https://developers.googleblog.com/introducing-veo-3-1-and-new-creative-capabilities-in-the-gemini-api/),
  [blog.google](https://blog.google/innovation-and-ai/technology/developers-tools/veo-3-1-gemini-api/).
- **Vidu Q2 Reference** : **jusqu'à 7 images** de référence (fal, Scenario, Vidu), pensé pour « multiple characters ». Clips
  de 1–8 s chez fal et jusqu'à 10 s chez Scenario. Prix fal : 0,10 $ en 360p, 0,20 $ en 520p, 0,30 $ en 720p par vidéo. Un
  workflow ComfyUI parle de 3 sujets au plus. Une variante Q2-Pro accepterait 7 sujets × 3 images (Atlas Cloud) —
  [fal](https://fal.ai/models/fal-ai/vidu/q2/reference-to-video), [Vidu](https://vidu.com/ai-reference-to-video),
  [Comfy blog](https://blog.comfy.org/p/vidu-q2-now-live-in-comfyui), [Atlas Cloud](https://www.atlascloud.ai/ko/models/vidu).
- **Seedance (ByteDance)** : la FAQ Dreamina (page datée du 30/09/2026) donne **jusqu'à 12 références pour Seedance 2.0** et
  **jusqu'à 50 entrées multimodales pour Seedance 2.5**. La même FAQ prévient que ce sont des plafonds, pas une recommandation,
  et que les références « ne garantissent pas » le même visage. Elle conseille un jeu de références petit et cohérent —
  [Dreamina FAQ](https://dreamina.capcut.com/ja-jp/ai-video/ai-video-reference-inputs-faq). Pour la 2.0, plusieurs sources
  donnent 9 images, 3 vidéos et 3 audios appelés par étiquette `@Image1` dans le prompt, avec des clips de 5–12 s —
  [Hedra](https://www.hedra.com/models/video/bytedance/seedance-20),
  [akitaonrails, 15/04/2026](https://akitaonrails.com/en/2026/04/15/seedance-2-0-public-launch-first-impressions/).
- **Wan 2.6 / 2.7 (Alibaba, API)** : le R2V de Wan 2.6 part d'une seule vidéo de référence, sans clonage de voix. Le R2V de
  **Wan 2.7** accepte **jusqu'à 5 références** (images et vidéos), le multi-personnages, et le **clonage de voix par
  personnage** via `voice_bindings` avec 1–10 s d'audio. Ratios dont 9:16, 720p ou 1080p, à **0,086 $/s en 720p** et 0,144 $/s
  en 1080p (page publiée le 22/05/2026, mise à jour le 04/08/2026). Les poids ne sont pas annoncés comme ouverts —
  [Evolink](https://evolink.ai/blog/wan-2-6-vs-wan-2-7).

### Inferences
- **Sans entraînement, en poids ouverts**, l'ordre d'essai serait : SkyReels-V3 R2V (9:16 natif, 4 références, mode faible
  VRAM), puis Phantom-Wan 14B (4 références, mais vertical moins stable), puis VACE avec référence et masque pour réinsérer un
  personnage dans une composition existante. MAGREF est hors de portée d'un GPU grand public.
- Avec 4 références au plus en ouvert, une scène à 4 personnages sature le budget. Il vaut mieux alors **composer l'image clé
  à plusieurs** (Q3) et faire de l'I2V, plutôt que de compter sur le R2V.
- En fermé, **Kling 3.0 Omni avec éléments et voix liées** colle le mieux au besoin : troupe persistante (54 éléments
  demandent l'abonnement Pro, à 150 éléments), 7 éléments par plan et voix liée par personnage. Wan 2.7 R2V est l'équivalent
  le plus proche et facture à la seconde. La langue française des voix liées reste à vérifier.
- Le risque « copier-coller » (OpenS2V) est probablement aggravé pour des dessins : le modèle colle la pose de la référence.
  D'où l'intérêt d'avoir **plusieurs angles** par personnage, comme les 2–4 images d'un élément Kling.

### Gaps
- Aucune évaluation indépendante du R2V sur personnages cartoon ou stylisés africains ; les démonstrations sont surtout
  humaines réalistes.
- Les durées maximales R2V de Wan 2.7, les langues des voix liées de Kling et Wan 2.7 et le nombre réel de personnages
  distincts dans un même plan Seedance n'ont pas été trouvés dans des sources primaires.
- La VRAM réelle de SkyReels-V3 R2V en `--low_vram` n'est pas chiffrée.

---

## Q3 — Image → vidéo depuis les planches (contrôle première/dernière image), flux par images clés, storyboard → plans

### Takeaway
La méthode la plus robuste pour une troupe fixe reste **« image clé validée → I2V »**. On compose chaque plan en image fixe
avec les bons personnages (édition multi-références), puis on l'anime en I2V ou entre une première et une dernière image.
L'identité est alors portée par des pixels, pas par un prompt. Côté ouvert, on a Wan2.1-FLF2V / VideoX-Fun (Apache-2.0) et
l'I2V de Wan 2.2. Côté fermé, Veo 3.1 Lite/Fast, Kling 3.0 et Hailuo 3 font la première et la dernière image. Le mouvement
rapide et les changements de caméra font dériver l'identité, et il faut prévoir **3 à 8 essais par plan**.

### Cited Findings
- Chaîne existante du projet : Blender rend la première image et une image épinglée à la fin. Veo 3.1 Lite 720p
  (première + dernière, 4/6/8 s) est le moins cher de ce mode à 0,03 $/s, devant Kling 3.0 Std (0,084 $/s) et Hailuo 3 Max
  480p (liste OpenRouter du 14/10/2026) *(rapport antérieur)* —
  [rapport](/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/repo/reports/Animer%20Blender%20par%20prompt.md), [liste OpenRouter](https://openrouter.ai/api/v1/videos/models).
- Poids ouverts première + dernière image : **Wan2.1-FLF2V-14B-720P** et **VideoX-Fun** *(notes antérieures)* —
  [HF FLF2V](https://huggingface.co/Wan-AI/Wan2.1-FLF2V-14B-720P), [VideoX-Fun](https://github.com/aigc-apps/VideoX-Fun).
- Kling 3.0 en mode image(s) de début/fin lie jusqu'à 3 éléments supplémentaires, qui doivent être visibles dans ces images —
  [Kling](https://kling.ai/quickstart/klingai-element-library-3-user-guide).
- La LoRA LTX-2.3 Dual-Character recommande, pour deux personnages, une **image composite** épinglée en image 0, ou
  l'épinglage décalé du personnage B (image 64). Il faut ré-épingler la référence à chaque plan contre la dérive —
  [HF](https://huggingface.co/SyFeee/LTX2.3-Dual-Character-en).
- SkyReels-V3 Video Extension enchaîne des plans avec des transitions « Shot/Reverse Shot », « Cut-In » et « Multi-Angle »
  (5 s par changement de plan), ce qui couvre le champ/contrechamp d'un dialogue —
  [GitHub](https://github.com/SkyworkAI/SkyReels-V3).
- Méthode de praticien : une image clé en entrée, 3 à 8 essais, on garde la meilleure prise et on passe au plan suivant. On
  produit d'abord un jeu de poses clés cohérentes avant d'animer (guides commerciaux) —
  [Neolemon, outils](https://www.neolemon.com/blog/best-ai-tools-for-animated-storytelling/),
  [Neolemon, animer](https://www.neolemon.com/blog/how-to-animate-ai-generated-characters/).
- La « character bible » (espèce, couleurs, tenue, proportions, accessoires, personnalité), réutilisée dans chaque prompt,
  est présentée comme l'étape centrale d'une série (guide commercial) — [gencartoon](https://gencartoon.com/ai-cartoon-series/).
- Qwen-Image-Edit-2511 (Apache-2.0) et Nano Banana Pro (14 références, 5 personnes, fermé) servent à composer l'image clé à
  plusieurs — voir Q1 et [HF 2511](https://huggingface.co/Qwen/Qwen-Image-Edit-2511).

### Inferences
- Chaîne type pour un sketch de 25–60 s (8–15 plans de 2–5 s) :
  1. script → découpage JSON (plan, cadrage, qui parle, émotion, pose de planche la plus proche) ;
  2. image clé de chaque plan, composée depuis les planches (pose « accusing », « shocked »…) avec l'éditeur
     multi-références, puis validée par un humain ;
  3. I2V ou première + dernière image (la dernière image = pose cible de la planche) ;
  4. lip-sync ou modèle audio-piloté sur les plans parlés (Q5) ;
  5. montage.
  Les 5 poses des planches servent directement d'images d'arrivée.
- Les plans courts (< 4 s) coûtent plus cher que leur durée sur les API à durée minimale (voir le rapport antérieur). En
  local, Wan I2V n'a pas ce coût.
- Les réactions muettes et les plans larges à 3–4 personnages sont les meilleurs candidats à l'I2V pur. Les gros plans parlés
  doivent passer par un modèle audio-piloté.

### Gaps
- Aucun taux de réussite publié (prises gardées / prises générées) sur personnages cartoon en I2V. Il faut le mesurer sur la
  troupe.
- L'arrivée exacte des modèles fermés sur l'image de fin épinglée n'est pas documentée (déjà signalé dans le rapport
  antérieur).

---

## Q4 — Transfert de mouvement depuis une vidéo pilote (acteur filmé au téléphone → personnage cartoon)

### Takeaway
Ce sujet est déjà couvert en détail dans les notes antérieures, et les conclusions tiennent au 16/10/2026. Trois modèles
Apache/MIT de 2026 acceptent une vidéo d'acteur sans squelette humain strict et revendiquent des personnages cartoon ou
anthropomorphes : **Wan-Animate-2** (Apache-2.0, 07/08/2026), **SCAIL-2** (code Apache-2.0, poids MIT) et **One-to-All
Animation** (Apache-2.0, données cartoon, 1.3B sur T4). Wan2.2-Animate reste le plus intégré, mais son prétraitement dépend
de YOLOv10 (AGPL) et, en mode amélioré, de FLUX Kontext (NC). Animate-X vise les anthropomorphes, avec un code Apache et des
poids sans licence indiquée. MimicMotion a des poids réservés à la recherche.

### Cited Findings
- Wan-Animate-2 (Wan2.2-Animate-2-14B, base et distillé) : Apache-2.0. Il fonctionne « de bout en bout », sans extracteur de
  pose intermédiaire, avec une démonstration sur un personnage anthropomorphe stylisé. La configuration est prévue pour
  **2 × A800 en 480p** *(notes antérieures)* — [HF](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B),
  [LICENSE](https://github.com/Wan-Video/Wan-Animate-2/blob/main/LICENSE).
- SCAIL-2 : code Apache-2.0, poids MIT (mise à jour HF du 15/07/2026). Le mode « end-to-end » contourne le squelette, en
  512p/704p. SCAIL-1 indique « only 1.5% of SCAIL's training samples are anime data » et une généralisation à l'anime
  *(notes antérieures)* — [README SCAIL-2](https://github.com/zai-org/SCAIL-2), [README SCAIL](https://github.com/zai-org/SCAIL).
- One-to-All Animation : « alignment-free », entraîné sur « self-collected cartoon data ». La version 1.3B met **≈ 11 min pour
  10 s en 832×480 sur un T4** (Kaggle) *(notes antérieures)* —
  [README](https://github.com/ssj9596/One-to-All-Animation).
- Wan2.2-Animate-14B : Apache-2.0 (fiche HF), avec modes animation et remplacement. Le prétraitement s'appuie sur YOLOv10
  (AGPL-3.0) et le reciblage « amélioré » sur FLUX.1-Kontext-dev (NC) *(notes antérieures)* —
  [HF](https://huggingface.co/Wan-AI/Wan2.2-Animate-14B),
  [UserGuider](https://github.com/Wan-Video/Wan2.2/blob/main/wan/modules/animate/preprocess/UserGuider.md).
- Animate-X : « universal animation framework … including anthropomorphic characters ». Code Apache-2.0, licence des poids
  non indiquée sur HF *(notes antérieures)* — [README](https://github.com/antgroup/animate-x),
  [HF](https://huggingface.co/Shuaishuai0219/Animate-X).
- UniAnimate-DiT : pas de LICENSE de code (README « academic research »), poids MIT ; ≈ 23 Go pour 81 images en 832×480
  *(notes antérieures)* — [HF](https://huggingface.co/ZheWang123/UniAnimate-DiT).
- StableAnimator : dépôt MIT, mais fiche HF Apache-2.0 (incohérence) et dépendance à InsightFace/antelopev2. MimicMotion :
  poids « research/education only » *(notes antérieures)* —
  [StableAnimator LICENSE](https://github.com/Francis-Rings/StableAnimator/blob/main/LICENSE),
  [MimicMotion poids](https://huggingface.co/tencent/MimicMotion/blob/main/LICENSE).

### Inferences
- Pour un compte comique, **le jeu d'acteur est le contenu**. Filmer un comédien ivoirien au téléphone (corps, timing,
  regards) puis le transférer sur le personnage, avec Wan-Animate-2 ou SCAIL-2, résout directement le grief « mouvement
  saccadé » du pipeline Blender. La voix du même comédien peut ensuite piloter le lip-sync (Q5).
- Les proportions à grosse tête restent le risque principal des modèles à squelette humain. Il faut privilégier les modes
  « end-to-end » ou « alignment-free ».
- Le coût matériel de Wan-Animate-2 (2 × A800 conseillés) pousse vers One-to-All 1.3B en local, ou vers un GPU loué pour les
  14B.

### Gaps
- Aucune mesure publique sur des personnages à grosse tête de style africain. Aucune source sur la tenue de l'identité quand
  2–3 acteurs pilotent 2–3 personnages dans un même plan (MultiAnimate est exclu pour ses poids, d'après les notes
  antérieures).

---

## Q5 — Parole et lip-sync (modèles audio-pilotés, lip-sync après coup) sur visages cartoon et à plusieurs voix, et voix françaises distinctes par personnage

### Takeaway
En ouvert, **MultiTalk / InfiniteTalk (Apache-2.0)**, **LongCat-Video-Avatar 1.5 (MIT)** et désormais le **Talking Avatar de
SkyReels-V3 (19B, licence Skywork)** revendiquent à la fois le cartoon et le dialogue à plusieurs. SkyReels-V3 annonce
« Compatible with … cartoon … characters » et des « Multi-character scenes ». Pour le lip-sync après coup sur un plan déjà
animé, LatentSync (code Apache-2.0, poids 1.6 en OpenRAIL++) et MuseTalk (MIT) sont commercialement utilisables, mais
**aucune preuve publique ne concerne les visages cartoon en français**. En fermé, Kling 3.0 Omni et Wan 2.7 lient une voix à
chaque personnage. Un formateur français juge que seul Veo 3.1 Fast gère nativement le français, ce qui est une seule
opinion. Pour les voix françaises open source à usage commercial, on retient **Qwen3-TTS (Apache-2.0, clonage en 3 s,
français)**, **Chatterbox Multilingual V3 (MIT, français, contrôle de l'émotion, filigrane)** et **Kyutai TTS 1.6B en_fr
(CC-BY-4.0)**. XTTS-v2 et les poids F5-TTS sont non commerciaux. Aucun modèle ne revendique un **accent ivoirien** : la voie
réaliste est de cloner les voix de comédiens ivoiriens.

### Cited Findings
**Modèles vidéo audio-pilotés (ouverts)**
- Tableau des notes antérieures *(notes antérieures)* :
  - **MultiTalk** (Apache-2.0) : multi-personnes, « cartoon character and singing », jusqu'à 15 s, 480p sur une RTX 4090 en
    mode faible VRAM ;
  - **InfiniteTalk** (Apache-2.0) : vidéo → vidéo, longueur illimitée ;
  - **LongCat-Video-Avatar 1.5** (MIT, 21/05/2026) : « generalizes to anime … multi-person » ;
  - **Wan2.2-S2V** (Apache-2.0) : 80 Go en mono-GPU ;
  - **EchoMimic v3** (Apache-2.0) : 12 Go ;
  - **StableAvatar** (MIT) : 18 Go, 3 min pour 5 s sur 4090 ;
  - **OmniAvatar** et **FantasyTalking** (Apache-2.0) : modes 5–8 Go ;
  - **HunyuanVideo-Avatar** : licence Tencent hors UE/RU/Corée ;
  - **Hallo3** : licence CogVideoX ;
  - **Sonic** : CC BY-NC-SA.

  Sources : [MultiTalk](https://github.com/MeiGen-AI/MultiTalk), [InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk),
  [LongCat-Video-Avatar-1.5](https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5),
  [Wan2.2-S2V](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B), [EchoMimic v3](https://github.com/antgroup/echomimic_v3),
  [StableAvatar](https://github.com/Francis-Rings/StableAvatar), [OmniAvatar](https://github.com/Omni-Avatar/OmniAvatar),
  [FantasyTalking](https://github.com/Fantasy-AMAP/fantasy-talking),
  [HunyuanVideo-Avatar LICENSE](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar/blob/main/LICENSE).
- Fiche HF MeiGen-MultiTalk : Apache-2.0 (vérifiée le 16/10/2026) — [HF](https://huggingface.co/MeiGen-AI/MeiGen-MultiTalk).
- **SkyReels-V3 Talking Avatar 19B-720P** : une image et un audio de **jusqu'à 200 s**, « Compatible with real-life, cartoon,
  animal, and stylized characters », « Multi-character scenes » avec attribution de rôles. Lip-sync multilingue annoncé pour le
  chinois, l'anglais et le coréen, **le français n'étant pas cité** — [GitHub](https://github.com/SkyworkAI/SkyReels-V3).
- InfiniteTalk existe en variantes « single » et « multi ». Un service hébergé décrit un mode à deux pistes audio qui aligne
  les bouches par flux (affirmation commerciale). L'amélioration sur MultiTalk (moins de distorsions, meilleure synchro) est
  auto-déclarée — [RunComfy](https://www.runcomfy.com/models/community/infinite-talk/fast/multi),
  [comfyui-wiki](https://comfyui-wiki.com/en/models/wan/infinitetalk). Un guide utilisateur fait tourner InfiniteTalk sur
  Wan 2.1 I2V 480p avec une LoRA Lightning en 4 pas et CFG 1 —
  [aistudynow](https://aistudynow.com/infinitytalk-comfyui-workflow-wan-2-1-img2vid-vid2vid-multi-talk/).
- Les encodeurs audio diffèrent : chinese-wav2vec2-base pour MultiTalk, InfiniteTalk et EchoMimic v3, Whisper-large-v3 pour
  LongCat 1.5 et HuMo. Whisper est multilingue, ce qui laisse penser qu'il est mieux armé pour le français (inférence
  antérieure, non mesurée) *(notes antérieures)* —
  [chinese-wav2vec2-base](https://huggingface.co/TencentGameMate/chinese-wav2vec2-base),
  [whisper-large-v3](https://huggingface.co/openai/whisper-large-v3).

**Lip-sync après coup**
- **LatentSync** : code Apache-2.0 ([LICENSE](https://github.com/bytedance/LatentSync/blob/main/LICENSE)) ; poids
  **LatentSync-1.6 sous OpenRAIL++** (fiche HF) — [HF](https://huggingface.co/ByteDance/LatentSync-1.6). Il faut environ 8 Go
  pour la v1.5 et 18 Go pour la v1.6 (source secondaire) —
  [creativeainews](https://www.creativeainews.com/articles/open-source-lip-sync-licenses-commercial-use-2026/).
- **MuseTalk : MIT** (fiche HF, mise à jour le 22/09/2026), testé à partir de 4 Go selon une source secondaire —
  [HF](https://huggingface.co/TMElyralab/MuseTalk),
  [creativeainews](https://www.creativeainews.com/articles/open-source-lip-sync-licenses-commercial-use-2026/).
- **Wav2Lip** : les poids héritent des conditions académiques du jeu LRS2, donc pas d'usage commercial —
  [creativeainews](https://www.creativeainews.com/articles/open-source-lip-sync-licenses-commercial-use-2026/).
- LTX-2 propose « Dub-It », qui reformule en gardant l'identité vocale et les mouvements de lèvres, sous la licence LTX
  (gratuite sous 10 M$ de CA) — [Lightricks/LTX-2](https://github.com/Lightricks/LTX-2).

**Services fermés à dialogue natif**
- Kling 3.0 Omni/O1 : voix liée à chaque élément personnage, à partir de 5–30 s d'audio ou de la voix d'un élément vidéo.
  Langues non listées — [Kling](https://kling.ai/quickstart/klingai-element-library-3-user-guide). Le blog Kling décrit le
  lip-sync natif d'Omni — [Kling blog](https://kling.ai/blog/kling-video-3-omni-native-lip-sync-audio-guide).
- Wan 2.7 R2V : `voice_bindings` par personnage, à partir de 1–10 s d'audio — [Evolink](https://evolink.ai/blog/wan-2-6-vs-wan-2-7).
- Un cours français (Elephorm) juge que Seedance et Kling « excellent en anglais » mais que **seul Veo 3.1 Fast gère le
  français nativement**, et que Kling est préféré pour le jeu d'acteur. C'est l'avis d'un seul formateur —
  [Elephorm](https://www.elephorm.com/formation/maitriser-magnific-2026-les-fondamentaux/creer-des-videos-animees-avec-synchronisation-labiale-en-ia).
  Un autre module du même éditeur traite du lip-sync français avec Kling 3.0 —
  [Elephorm Kling](https://www.elephorm.com/formation/maitriser-kling-30-pour-la-creation-cinematographique/realiser-une-synchronisation-labiale-en-francais-avec-une-ia-video).

**Voix françaises (TTS) et cohérence de voix**
- **Qwen3-TTS-12Hz-1.7B-Base** : Apache-2.0. Il couvre 10 langues dont le **français** et clone une voix en 3 s, avec la
  transcription de l'extrait de référence. Un modèle séparé, **VoiceDesign**, crée une voix depuis une description en texte,
  qu'on peut ensuite cloner. Article arXiv 2601.15621 (janvier 2026). En français, il obtient une similarité de locuteur de
  **0,714 contre 0,535 pour ElevenLabs** et 0,628 pour MiniMax (tableau auto-déclaré). Le WER de 2,858 est possiblement mal
  aligné dans le tableau — [HF](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base).
- **Chatterbox Multilingual V3** (Resemble AI) : MIT, 0,5 B de paramètres, 23 langues dont le **français**
  (`language_id="fr"`). Il clone sans entraînement et propose un réglage d'« exaggeration » de l'émotion (0,5 par défaut).
  **Chaque fichier porte le filigrane PerTh** — [HF](https://huggingface.co/ResembleAI/chatterbox).
- **Kyutai TTS 1.6B en_fr** : poids **CC-BY-4.0** (fiche HF) — [HF](https://huggingface.co/kyutai/tts-1.6b-en_fr). Les voix
  françaises viennent de CML-TTS sous CC BY 4.0 ; les jeux Expresso et EARS sont « non-commercial ». Les voix sont des
  embeddings calculés par un script, pas un clonage à la volée — [HF kyutai/tts-voices](https://huggingface.co/kyutai/tts-voices).
- **Kokoro-82M** : Apache-2.0, mais **une seule voix française** (`ff_siwis`, note B-, moins de 11 h de données, CC BY) et un
  support des langues non anglaises « thin » — [VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md).
- **XTTS-v2** : licence CPML, réservée au non commercial, y compris pour les sorties audio. Coqui a fermé en janvier 2024, donc
  aucune licence commerciale n'est achetable — [localaimaster](https://localaimaster.com/blog/xtts-coqui-commercial-license),
  [promptquorum](https://www.promptquorum.com/power-local-llm/local-tts-voice-cloning-piper-coqui-xtts).
- **F5-TTS** : code MIT ([LICENSE](https://github.com/SWivid/F5-TTS/blob/main/LICENSE)), mais poids officiels CC-BY-NC-4.0
  (source secondaire) — [codesota](https://www.codesota.com/guides/tts-models).
- **Piper** : moteur GPL-3.0, avec une licence propre à chaque voix, à vérifier une par une (source secondaire) —
  [codesota](https://www.codesota.com/guides/tts-models).
- **ElevenLabs** (fermé) : l'offre gratuite est à usage personnel non commercial, avec attribution. Les droits commerciaux
  viennent avec les offres payantes (Starter ≈ 5 $/mois selon une source tierce). Eleven v3 accepte des balises d'émotion
  ([whispers], [laughs]) — [ElevenLabs FR](https://elevenlabs.io/fr/text-to-speech),
  [videosdk](https://www.videosdk.live/ai-apps/elevenlab).
- Toonstar clone la voix de l'interprète pour faire parler ses personnages dans d'autres langues en gardant le jeu d'origine
  (espagnol, allemand, japonais) — [Fast Company](https://www.fastcompany.com/91423172/uncle-roger-cartoon-nigel-ng-toonstar),
  [L'ADN](https://www.ladn.eu/mondes-creatifs/des-dessins-animes-sans-ame-pour-enfants-sur-youtube-merci-lia/).

### Inferences
- **Cohérence de voix par personnage** : enregistrer une fois, pour chacun des 54 personnages, un extrait de référence de
  10–30 s par un comédien ivoirien (ou une voix conçue avec Qwen3-TTS VoiceDesign), puis le geler comme « empreinte vocale »
  du personnage. Toutes les répliques sont générées par clonage depuis ce même extrait (Qwen3-TTS ou Chatterbox). Le même
  extrait sert de voix liée dans Kling ou Wan 2.7 si l'on passe par une API.
- **L'accent ivoirien** (nouchi, intonation) n'est revendiqué par aucun modèle. Il ne peut venir que de l'extrait de référence
  et du texte écrit phonétiquement. Pour les répliques clés, faire jouer de vrais comédiens reste plus sûr. Le pipeline
  « acteur filmé » de Q4 donne en plus la voix.
- **Ordre de test du lip-sync** sur les têtes cartoon :
  1. plans larges à 2–4 personnages → MultiTalk / InfiniteTalk multi, ou le Talking Avatar de SkyReels-V3 sur l'image clé
     composite ;
  2. gros plans parlés → InfiniteTalk en vidéo → vidéo, ou LatentSync 1.6 sur le plan I2V ;
  3. témoin fermé → Kling 3.0 Omni avec voix liée.

  Il faut mesurer la synchro sur des phrases françaises (bilabiales P/B/M) avant de figer.
- Chatterbox marque toutes ses sorties d'un filigrane. Ce n'est pas bloquant pour TikTok, mais c'est à savoir. Kokoro est à
  écarter, faute de voix françaises variées.

### Gaps
- Aucune évaluation publique de lip-sync sur des visages cartoon **en français**. Aucune évaluation d'un TTS sur le français
  d'Afrique de l'Ouest.
- Les langues prises en charge par les voix liées de Kling et de Wan 2.7 ne sont pas documentées.
- Pas de source primaire Google sur la qualité du dialogue français de Veo 3/3.1.
- La licence des données d'entraînement de LatentSync et MuseTalk (même piège que Wav2Lip ?) n'a pas été vérifiée.

---

## Q6 — Options propres à la 2D : marionnettes type Live2D pilotées par IA, ToonCrafter, AniSora, adéquation au look série TV franco-africaine 2D

### Takeaway
Les modèles « anime » ouverts sont sous licence libre : **Index-AniSora V3 (Apache-2.0)**, avec une V3.2 sur Wan 2.2 en 8 pas,
et **ToonCrafter (code Apache-2.0)** pour l'interpolation entre images clés. Ils sont toutefois entraînés et illustrés sur
l'anime japonais, et rien ne montre qu'ils tiennent un trait franco-africain. La voie marionnette (Inochi2D BSD-2,
Qwen-Image-Layered Apache-2.0 pour découper un dessin en calques, AnimatedDrawings MIT) donne une identité parfaite par
construction, mais un mouvement limité, c'est-à-dire le défaut « trop rigide » du pipeline Blender sous une autre forme.

### Cited Findings
- **Index-AniSora** : les poids V3 sont passés sous Apache-2.0 le 27/08/2025 (README). La V3 génère « 5 sec 360p video shot
  within 8 sec » et propose génération de personnage en 3D, transfert de style, guidage multimodal et super-résolution. La
  V3.2 est entraînée sur Wan 2.2 et descend à 8 pas — [GitHub](https://github.com/bilibili/Index-anisora),
  [LICENSE](https://github.com/bilibili/Index-anisora/blob/main/LICENSE) ; fiche HF IndexTeam/Index-anisora : Apache-2.0 —
  [HF](https://huggingface.co/IndexTeam/Index-anisora). Ses exemples utilisent des extraits et personnages d'anime japonais,
  d'où une prudence à avoir — [Gigazine](https://gigazine.net/gsc_news/en/20250519-anisora). Il est centré sur les styles 2D
  et 2,5D d'anime — [ITHome](https://www.ithome.com/0/866/229.htm).
- **ToonCrafter** : code sous Apache-2.0 ([LICENSE](https://github.com/Doubiiu/ToonCrafter/blob/main/LICENSE)), fiche HF des
  poids sans licence indiquée ([HF](https://huggingface.co/Doubiiu/ToonCrafter)). Il sert à l'interpolation entre images clés,
  pas au rig *(notes antérieures)*.
- Les notes antérieures portent sur la marionnette :
  - **AnimatedDrawings** est MIT (code, poids et données), mais avec un squelette de 16 articulations, sans doigts ni tête
    séparée ;
  - **Qwen-Image-Layered** (Apache-2.0) et **Inochi2D** (BSD-2) sont les briques libres pour le découpage en calques et le rig ;
  - See-through et Bunraku (2026, illustration → calques façon Live2D) n'ont pas de code public ;
  - ToonComposer, LayerAnimate et AniDoc servent à l'interpolation et à la colorisation.

  *(notes antérieures)* — [AnimatedDrawings](https://github.com/facebookresearch/AnimatedDrawings),
  [Qwen-Image-Layered LICENSE](https://github.com/QwenLM/Qwen-Image-Layered/blob/main/LICENSE),
  [Inochi2D](https://github.com/Inochi2D/inochi-creator/blob/main/LICENSE).

### Inferences
- Pour le look « série TV franco-africaine 2D » (aplats, traits cernés, décors peints), le chemin le plus prometteur n'est
  probablement pas un modèle « anime » dédié. Il vaut mieux une **LoRA de style troupe sur Wan 2.2 I2V** (Q1), entraînée sur
  les 39 images existantes, plus des images clés en 2D. AniSora mérite un essai A/B, car il est Apache et rapide, mais son
  biais anime japonais (yeux, proportions) risque d'« animer » le style.
- ToonCrafter a sa place pour les **plans en 2D pure dessinés à la main** (deux images clés, puis interpolation), pas pour
  produire des sketches en série.
- Les marionnettes à calques restent utiles pour les **gros plans de bouche** (jeu de bouches par phonème, synchro exacte),
  combinés aux plans de corps générés.

### Gaps
- Aucune démonstration publique d'AniSora ou de ToonCrafter sur un style 2D africain ou franco-belge. Aucune évaluation de
  l'identité d'un personnage entre plusieurs plans avec AniSora.
- Le matériel utilisé pour le chiffre « 5 s en 8 s » d'AniSora V3 n'est pas indiqué dans l'extrait lu.

---

## Q7 — Pipeline de bout en bout recommandé et études de cas de séries cartoon IA à personnages récurrents (2025–2026)

### Takeaway
Les studios documentés n'utilisent **pas un seul modèle « magique »**. Ils construisent un moteur par série avec un
personnage figé (planche et bible), des images clés validées par des humains, des voix humaines ou clonées et une
animation IA plan par plan. Toonstar revendique 80 % de temps et 90 % de coût en moins avec un moteur IA « customized for each
show ». Critterz (OpenAI, Vertigo, Native Foreign) part de croquis d'artistes et de voix d'acteurs humains. Aucune étude de
cas vérifiée ne concerne une série IA ivoirienne ou ouest-africaine à personnages récurrents. Des séries IA nigérianes
existent sur TikTok, mais leur cohérence n'est pas documentée.

### Cited Findings
- **Toonstar** (Los Angeles) produit *StEvEn & Parker*, tiré des sketches live du TikTokeur Parker James. Son moteur
  d'animation **Ink & Pixel** est « customized for each show », et son système SPOT teste les contenus et repère les
  personnages ou rythmes faibles d'après les données de visionnage. Le studio revendique des productions « 80 % faster and
  90 % cheaper ». L'audience varie selon les sources : 30 M de vues par semaine, 3,38 M d'abonnés selon Engadget, 8,6 M selon
  Fast Company (chiffres contradictoires) —
  [getcoai](https://getcoai.com/news/toonstar-offers-glimpse-into-future-of-ai-powered-animation),
  [Engadget](https://engadget.com/ai/ai-animation-studio-toonstar-will-turn-books-into-digital-shows-for-harpercollins-211419155.html),
  [Fast Company](https://www.fastcompany.com/91423172/uncle-roger-cartoon-nigel-ng-toonstar),
  [L'ADN](https://www.ladn.eu/mondes-creatifs/des-dessins-animes-sans-ame-pour-enfants-sur-youtube-merci-lia/).
- **Critterz** (long métrage soutenu par OpenAI) : des artistes humains fournissent les croquis de départ, traités ensuite
  par les modèles OpenAI (dont GPT-5) et des outils d'image. Les personnages sont doublés par des acteurs humains. Budget de
  moins de 30 M$, 9 mois de production, première visée à Cannes en mai 2026. Le résultat réel n'a pas été vérifié —
  [PetaPixel, 10/09/2025](https://petapixel.com/2025/09/10/openai-plans-to-make-a-full-hollywood-movie-animated-critterz-using-ai),
  [Entrepreneur](https://www.entrepreneur.com/business-news/an-openai-backed-ai-made-animated-movie-is-coming-out-next/496853).
- Guides de praticiens et d'éditeurs (non indépendants) : la character bible et une image d'ancrage d'abord, puis un jeu de
  poses clés, puis l'animation plan par plan avec 3 à 8 essais —
  [gencartoon](https://gencartoon.com/ai-cartoon-series/), [Neolemon](https://www.neolemon.com/blog/best-ai-tools-for-animated-storytelling/).
  Des éditeurs (Atlabs, Luma « Universe ») vendent un « cast system » qui verrouille apparence et voix. Ce sont des
  affirmations marketing — [Luma](https://lumalabs.ai/news/ai-cartoon-video-generators-kids-content).
- Ouest-Afrique : des séries IA nigérianes à épisodes sont visibles sur TikTok, comme « biri da kosongo » (partie 5) ou
  « Preggy Anita » (épisode 22). Aucune donnée sur leur méthode ni sur leur cohérence —
  [TikTok, Nigerian animation](https://www.tiktok.com/discover/nigerian-tiktok-animation),
  [TikTok, African AI](https://www.tiktok.com/discover/african-ai).
- Pipeline du projet déjà conçu : Blender épingle la première et la dernière image, l'API (Veo 3.1 Lite) interpole, et les
  gros plans parlés gardent le rendu synchronisé du moteur. Coût estimé à 1,62 $ pour le mode hybride d'un film de 64 s
  *(rapport antérieur)* — [rapport](/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/repo/reports/Animer%20Blender%20par%20prompt.md).

### Inferences
**Playbook classé sous budget ZÉRO** (1 = premier choix ; GPU gratuit = Kaggle T4×2 ou Colab T4 ; les durées viennent de Q8
et sont des chiffres communautaires ou des extrapolations ; toutes les lignes sont des inférences tirées des sources
citées)

| Rang | Méthode | Outils gratuits (licence) | Tient sur T4 16 Go ? | Qualité attendue | Effort | Quand |
|---|---|---|---|---|---|---|
| 1 | **Image clé composite validée → I2V** (Wan 2.2 I2V 14B en GGUF Q4–Q6, ou Wan 2.1 / VACE 1.3B) | Qwen-Image-Edit-2511 (Apache) ou Z-Image-Turbo (Apache) pour l'image clé ; Wan 2.2 I2V GGUF (Apache) | **Oui en GGUF** (Q5 ≈ 10–11 Go, Q6_K ≈ 12 Go) ; ≈ 9–15 min par clip de 5 s en 480p (communauté) | Identité portée par les pixels ; mouvement naturel | Moyen (notebook Kaggle) | Défaut pour les plans muets et larges |
| 2 | **LoRA d'image (pas de vidéo) par personnage et/ou de style**, pour fabriquer des images clés cohérentes | Z-Image-Turbo + ai-toolkit (Apache / MIT) | **Probable** (< 12 Go signalé ; 1–2 h pour 2000 pas sur une carte 12 Go, plus lent sur T4) | Très bonne cohérence des images clés, donc des vidéos | Moyen | Les 7 vedettes, puis la troupe |
| 3 | **Lip-sync audio-piloté** sur l'image clé | InfiniteTalk / MultiTalk (Apache) ; voix Qwen3-TTS (Apache) / Chatterbox (MIT) / Piper (voix CC-BY) | **Oui** : InfiniteTalk ≈ 12,7 Go, ≈ 0,5–1 image/s en 480p sur T4 | Revendiquée sur cartoon et multi-personnes ; français non prouvé | Moyen | Plans parlés |
| 4 | **Lip-sync après coup** sur un plan I2V | MuseTalk (MIT, ≥ 4 Go) ; LatentSync **1.5** (8 Go) — la 1.6 (18 Go) ne tient pas | **Oui** (MuseTalk, LatentSync 1.5) | Bouche seule ; correct sur visages proches de l'humain, cartoon non prouvé | Faible | Gros plans parlés |
| 5 | **Acteur filmé → transfert de mouvement** | One-to-All 1.3B (Apache) ; Wan2.2-Animate 14B en GGUF Q3–Q6 (Apache ; notebook Kaggle 2×T4) | **Oui** : One-to-All ≈ 11 min pour 10 s en 832×480 ; Animate GGUF sans chrono publié ; Wan-Animate-2 **non** (2 × A800) | Meilleur jeu comique | Tournage au téléphone | Gags physiques |
| 6 | **Référence → vidéo ouvert** | Phantom-Wan **1.3B** (Apache) ; SkyReels-V3 R2V 14B `--low_vram` (à tester) | 1.3B probable ; 14B incertain sur T4 (pas de FP8 matériel) ; MAGREF **non** (70 Go) | Moyenne (copier-coller, vertical instable) | Moyen | Personnages secondaires à 1 image |
| 7 | **LoRA vidéo Wan** (identité ou style) | musubi-tuner / ai-toolkit | 1.3B probable ; **14B déconseillé sur T4** (24 Go recommandés, 16 Go seulement avec fp8 et block swap, aucun chrono T4) | Excellente en solo ; mélange à plusieurs | Élevé | Plus tard, sur GPU loué ou ZeroGPU |
| 8 | **Marionnette 2D à calques** et outils CPU | Inochi2D (BSD-2), AnimatedDrawings (MIT), LivePortrait (MIT, 7,9 s/image sur CPU) | **CPU** | Identité parfaite, mouvement limité | Rig manuel | Bouches, secours sans GPU |
| — | *Comparaison payante* | Kling 3.0 Omni (éléments et voix), Wan 2.7 R2V (0,086 $/s), Veo 3.1 (français natif selon un formateur), Seedance 2.x, Vidu Q2 | n/a | Très bonne selon les éditeurs | Faible | Hors budget zéro |

- **Pipeline cible à 0 €** :
  1. **Bible de la troupe** : image canonique, planche étendue à 20–30 images par Qwen-Image-Edit-2511 sur Kaggle, et voix
     de référence de 10–30 s par personnage, enregistrée par un comédien ou générée.
  2. **LoRA d'image Z-Image** pour les vedettes et pour le style.
  3. Script → découpage JSON.
  4. Images clés composites (2–4 personnages), validées.
  5. TTS cloné (Qwen3-TTS ou Chatterbox sur T4, Piper sur CPU en secours).
  6. Plans muets → Wan 2.2 I2V GGUF sur T4 ; plans parlés → InfiniteTalk / MultiTalk sur T4, ou MuseTalk sur un plan I2V ;
     gags → One-to-All 1.3B ou Wan2.2-Animate GGUF.
  7. Contrôle qualité.
  8. Montage.

  La file Kaggle (CLI `kernels push`) utilise les deux T4 en parallèle, un plan par GPU.
- **Débit estimé** pour un sketch de 40 s : environ 6 plans muets (≈ 9–15 min chacun en 480p, soit ≈ 1–1,5 h) et ≈ 25 s
  parlées (≈ 625 images à 0,5–1 image/s, soit ≈ 10–20 min), plus le chargement des poids. Il faut donc ≈ 2–3 h de T4 par
  sketch. Avec ≈ 30 h de quota par semaine, on obtient **≈ 10–15 sketches par semaine au plus**, ou à peu près le double si
  les deux T4 travaillent en parallèle. Ce calcul est une inférence à mesurer, et la sortie reste en 480p, à agrandir ensuite.
- Tout le pipeline doit être **mesuré sur 3 plans pilotes** (gros plan parlé, plan à 3 personnages, gag physique) sur Kaggle
  T4 avant d'être industrialisé.

### Gaps
- Aucune étude de cas vérifiée (méthode et métriques) d'une série IA à personnages récurrents sur TikTok en Afrique de l'Ouest
  ou en français. Les chiffres de Toonstar viennent du studio lui-même ou de la presse et se contredisent.
- Aucun « post-mortem » public d'un créateur décrivant la gestion de plus de 50 personnages récurrents.
- Les coûts de location de GPU (A100/4090) pour l'entraînement et l'inférence ne sont pas couverts ici ; ils sont dans
  `calcul_gpu_gratuit.md` des notes antérieures.

---

## Q8 — Budget zéro : quels outils tiennent sur un GPU gratuit de 16 Go (Kaggle T4×2, Colab T4 ; P100) ou sur CPU (4 cœurs, 15 Go), et en combien de temps ?

### Takeaway
Sur un **T4 16 Go**, tout le pipeline tient en **480p**, et seulement à certaines conditions :
- **vidéo** en Wan 2.2 I2V 14B **GGUF** (≈ 9–15 min par clip de 5 s, chiffre communautaire) ou en Wan 1.3B ;
- **lip-sync audio-piloté** avec InfiniteTalk (≈ 12,7 Go, ≈ 0,5–1 image/s générée) ;
- **lip-sync après coup** avec MuseTalk (≥ 4 Go) ou LatentSync 1.5 (8 Go) ;
- **transfert de mouvement** avec One-to-All 1.3B (≈ 11 min pour 10 s) ou Wan2.2-Animate en GGUF (notebook Kaggle 2×T4,
  sans chrono) ;
- **TTS** avec Qwen3-TTS ou Chatterbox, plus rapides que le temps réel sur un petit GPU.

Ne tiennent pas, ou sont déconseillés : MAGREF (70 Go), Wan-Animate-2 (2 × A800), LatentSync 1.6 (18 Go), StableAvatar
(18 Go), Wan2.2-S2V (80 Go), et **l'entraînement d'une LoRA vidéo Wan 14B**. Ce dernier demande 24 Go recommandés, et aucun
chrono T4 n'existe ; il vaut mieux entraîner une **LoRA d'image** (Z-Image-Turbo, < 12 Go). Le **P100 n'est plus disponible
sur Kaggle depuis le 15/09/2026**. Sur **CPU**, seuls le TTS (Piper, Kokoro, Qwen3-TTS lent) et les outils non génératifs
(LivePortrait 7,9 s/image, AnimatedDrawings, Inochi2D) sont réalistes. Le T4 n'a **ni bf16 natif, ni FP8, ni
FlashAttention-2**, ce qui exclut les recettes d'accélération récentes : il faut travailler en fp16 et en GGUF.

### Cited Findings
**Plateformes gratuites** *(notes antérieures)*
- Kaggle : ≈ 30 h de GPU par semaine en T4×2 (2 × 16 Go), sessions de 12 h. La CLI officielle `kaggle kernels push`
  lance un notebook sans navigateur. Le P100 est annoncé « Sunsetting … on September 15, 2026 » —
  [Kaggle Efficient GPU Usage](https://www.kaggle.com/docs/efficient-gpu-usage),
  [Kaggle API kernels.md](https://github.com/Kaggle/kaggle-api/blob/main/docs/kernels.md),
  [annonce P100](https://www.kaggle.com/product-announcements/735239). Un T4×2 n'accélère pas un clip seul, mais permet
  deux clips en parallèle (inférence des notes antérieures).
- Colab gratuit : GPU non garanti, 12 h au plus, et l'usage d'une interface web (Gradio/ComfyUI) restreint pour les comptes
  gratuits *(notes antérieures, voir `calcul_gpu_gratuit.md`)*.
- HF ZeroGPU gratuit : 5 min par jour et **3 exécutions par jour** pour un compte gratuit, sur RTX Pro 6000 (48 Go) —
  [HF docs ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu),
  [forum HF, 13/04/2026](https://discuss.huggingface.co/t/free-account-zerogpu-quota-issue/175180) *(notes antérieures)*.
- PyTorch a abandonné les roues Pascal (P100) dans ses versions récentes ; « bf16 requires Ampere, Ada, or Hopper GPUs » pour
  FlashAttention *(notes antérieures)* —
  [dev-discuss PyTorch](https://dev-discuss.pytorch.org/t/cuda-toolkit-version-and-architecture-support-update-maxwell-and-pascal-architecture-support-removed-in-cuda-12-8-and-12-9-builds/3128),
  [flash-attention](https://github.com/Dao-AILab/flash-attention).

**Vidéo I2V / référence**
- Le notebook communautaire « WanGP-Kaggle » vise le T4 (15 Go utiles), recommande le 480p et annonce « Expect ~9-15 minutes
  per video on T4 » *(notes antérieures)* — [WanGP-Kaggle](https://github.com/kayas881/WanGP-Kaggle). Le modèle exact n'est
  pas précisé.
- Wan 2.2 I2V A14B en GGUF : il faut les deux experts (haut et bas bruit). Les fichiers Q5 pèsent ≈ 10–11 Go et Q6_K ≈ 12 Go.
  Un jeu de données Kaggle fournit `wan2.2_i2v_low_noise_14B_Q4_K_M.gguf`, l'encodeur de texte et le VAE —
  [QuantStack GGUF](https://huggingface.co/QuantStack/Wan2.2-I2V-A14B-GGUF),
  [stablediffusiontutorials](https://www.stablediffusiontutorials.com/2025/08/wan-2.2-video-generation.html),
  [Kaggle dataset](https://www.kaggle.com/datasets/faturismee/wan-2-2-i2v).
- Un notebook Kaggle « Wan 2.2 TI2V 5B Diffusers Free GPU Test » affiche 6 min 56 s d'exécution sur P100 (réglages non
  vérifiés) *(notes antérieures)* — [Kaggle](https://www.kaggle.com/code/ali9999008/wan-2-2-ti2v-5b-diffusers-free-gpu-test).
  Sous stable-diffusion.cpp, le VAE de TI2V-5B réclame un tampon de 20 895,80 Mo pour 2 s en 832×480, ce qui pose un problème
  sur 16 Go — [discussion sd.cpp](https://github.com/leejet/stable-diffusion.cpp/discussions/868).
- Wan2.1-T2V-1.3B : Apache-2.0 (fiche HF) — [HF](https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B). Il demande 8,19 Go et 261 s
  par clip 480p sur une RTX 4090 *(notes antérieures)* — [fiche VACE-1.3B](https://huggingface.co/Wan-AI/Wan2.1-VACE-1.3B).
- MAGREF : « around 70 GB of VRAM » — [GitHub](https://github.com/MAGREF-Video/MAGREF). SkyReels-V3 : `--low_vram` (FP8
  poids seuls et déchargement de blocs) pour les GPU de moins de 24 Go, sans chiffre — [GitHub](https://github.com/SkyworkAI/SkyReels-V3).

**Transfert de mouvement**
- One-to-All 1.3B : « Run … for free on Kaggle's 16 GB T4 … It takes 11 minutes to generate a 10-second 832×480 video »
  *(notes antérieures)* — [README](https://github.com/ssj9596/One-to-All-Animation). Poids Apache-2.0 —
  [HF](https://huggingface.co/MochunniaN1/One-to-All-1.3b_2).
- Wan2.2-Animate 14B sur Kaggle : un dépôt communautaire fournit des notebooks ComfyUI pour « 2 x T4 GPU (16 GB VRAM) ». Ils
  utilisent un GGUF QuantStack **Q3_K_M** par défaut (Q6_K dans la version Gradio), la LoRA de ré-éclairage et la LoRA
  LightX2V I2V 480p, et demandent **32 Go de RAM**. Aucune durée par clip ni résolution n'est indiquée —
  [kelvinweijun/wan-2.2-animate-comfyui-kaggle](https://github.com/kelvinweijun/wan-2.2-animate-comfyui-kaggle).
- Wan-Animate-2 : configuration prévue pour 2 × A800 en 480p *(notes antérieures)* —
  [HF](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B).

**Avatars parlants et lip-sync**
- InfiniteTalk sur Colab gratuit : T4 au minimum, **12,7 Go de VRAM** dans le tableau, 12,7 Go de RAM au minimum (25 Go
  conseillés), 30–50 Go de disque. Vitesse ≈ **0,5–1 « FPS (Generation) » en 480p sur T4**, contre 2–3 sur L4 et 5–8 sur
  A100. En cas de manque de mémoire, on règle `--num_persistent_param_in_dit 0` et `motion_frame` à 3–5. Le notebook principal
  ne télécharge pas tous les poids sur un T4 gratuit, d'où un notebook ComfyUI de repli. Base : Wan2.1-I2V-14B-480P
  (≈ 27 Go) — [sruckh/InfiniteTalk-Google-Collab](https://github.com/sruckh/InfiniteTalk-Google-Collab).
- MultiTalk : Wan2GP « very low VRAM hardware (8 GB) » ; descendre à 10 pas « will not hurt the lip synchronization accuracy »
  *(notes antérieures)* — [README MultiTalk](https://github.com/MeiGen-AI/MultiTalk).
- EchoMimic v3 : « 12G VRAM is All YOU NEED », testé sur V100 16 Go *(notes antérieures)* —
  [README](https://github.com/antgroup/echomimic_v3). OmniAvatar : mode 8 Go à 22,1 s/it ; FantasyTalking : mode 5 Go à
  42,6 s/it (GPU de référence non précisé) *(notes antérieures)* — [OmniAvatar](https://github.com/Omni-Avatar/OmniAvatar),
  [FantasyTalking](https://github.com/Fantasy-AMAP/fantasy-talking). StableAvatar : 18 Go ; Wan2.2-S2V : 80 Go
  *(notes antérieures)*.
- MuseTalk : « 30fps … on a single NVIDIA Tesla V100 », débit mesuré après préparation de l'avatar. Un test utilisateur en
  basse VRAM a pris 171 s pour 7 s d'audio. Un notebook communautaire (camenduru) tourne sur T4 —
  [sync.so](https://sync.so/blog/what-is-musetalk),
  [tomodahinata](https://tomodahinata.com/en/blog/musetalk-realtime-lip-sync-production-guide),
  [hyper.ai](https://hyper.ai/en/notebooks/33760). Les poids sont sous MIT — [HF](https://huggingface.co/TMElyralab/MuseTalk).
- LatentSync : ≈ 8 Go pour la v1.5 et 18 Go pour la v1.6 —
  [creativeainews](https://www.creativeainews.com/articles/open-source-lip-sync-licenses-commercial-use-2026/). Les deux
  versions de poids sont sous OpenRAIL++ — [HF 1.5](https://huggingface.co/ByteDance/LatentSync-1.5),
  [HF 1.6](https://huggingface.co/ByteDance/LatentSync-1.6). C'est un modèle de diffusion, donc plus lent que MuseTalk —
  [Instavar](https://instavar.com/research/ai-video/open-source-lip-sync-models).

**Images clés et LoRA d'image**
- Z-Image-Turbo : Apache-2.0 — [HF](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo). Des LoRA s'entraînent avec moins de
  12 Go via ai-toolkit (options Low VRAM et Layer Offloading, 512 px) —
  [lilys.ai](https://lilys.ai/notes/ru/openai-agent-builder-20260208/free-lora-training-z-image-turbo-low-vram). Sur une
  carte 12 Go, il faut ≈ 2–3 s/it, soit **2000 pas en ≈ 1–2 h**, en 512–768 px ; « 6~10 images » ont suffi selon le rapport
  — [Z-Image issue #36](https://github.com/Tongyi-MAI/Z-Image/issues/36).
- Un notebook Colab Z-Image (payant) annonce ≈ 1 min par image en 9 pas sur T4 (extrait de recherche). Aucun chrono T4 n'a été
  trouvé pour Qwen-Image-Edit-2509/2511 en GGUF —
  [hackernoon](https://hackernoon.com/a-beginners-guide-to-qwen-image-edit-rapid-aio-gguf-best-use-cases-limitations-plus-more),
  [Replicate GGUF](https://replicate.com/jackieyaung/qwen-image-edit-2509-gguf).

**LoRA vidéo sur 16 Go**
- musubi-tuner : 24 Go pour entraîner sur des images 720×1280. `--fp8_fast` est réservé aux RTX 40x0. Le block swap monte
  jusqu'à 29 blocs pour le 1.3B — [docs/wan.md](https://github.com/kohya-ss/musubi-tuner/blob/main/docs/wan.md).
- Avec FP8 et block swap, « some users report I2V LoRA training on 16 GB ; 24 GB is smoother ». Une réponse de forum HF donne
  « at least 12GB, preferably 24GB » — [synthèse de forum HF](https://huggingface.co/datasets/John6666/forum1/blob/e2772d17729a88bbc2d7379c6220c46b85ef5a31/wan22_lora_training.md),
  [forum HF](https://discuss.huggingface.co/t/wan-lora-traning/167838). Aucun chrono de LoRA Wan sur T4 n'a été trouvé.
  Une ancienne issue signale des LoRA 1.3B de musubi inutilisables dans ComfyUI après conversion (peut-être corrigé) —
  [issue #134](https://github.com/kohya-ss/musubi-tuner/issues/134).

**Voix (GPU modeste ou CPU)**
- Un banc personnel sur GPU portable RTX 4050 donne pour Qwen3-TTS un **RTF de 0,91 sur GPU et 5,4 sur CPU**, le plus lent
  des trois modèles testés. Aucun des trois (XTTS-v2, Qwen3-TTS, Chatterbox Multilingual v3) ne tourne en temps réel sur CPU
  — [banc LinkedIn (source unique)](https://ar.linkedin.com/in/santiagoacu).
- Chatterbox Multilingual : le CPU est pris en charge, mais plus lent ; avec un GPU de 6 Go ou plus, on approche le temps
  réel. Une version GGUF existe — [mintlify](https://www.mintlify.com/yocxy2/chatterboxyocxy/models/chatterbox-multilingual),
  [HF GGUF](https://huggingface.co/hans00/Chatterbox-Multilingual-TTS-GGUF).
- **Voix françaises Piper** (fiches du dépôt `rhasspy/piper-voices`) :
  - `siwis` medium : 1 locuteur, CC-BY 4.0 ;
  - `upmc` medium : 2 locuteurs, CC-BY-SA 4.0 ;
  - `mls` medium : **125 locuteurs**, CC-BY 4.0 ;
  - `gilles` low : CC0 ;
  - `tom` medium : jeu de données sous AGPLv3.

  Toutes sont en français de France —
  [piper-voices fr_FR](https://huggingface.co/rhasspy/piper-voices/tree/main/fr/fr_FR).
- Kokoro (82 M, Apache-2.0) n'a qu'une voix française (`ff_siwis`, B-) —
  [VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md).

**CPU seul (4 cœurs)**
- LivePortrait (MIT) a été mesuré à 7,9 s/image sur 4 cœurs, soit ≈ 16 min pour 5 s à 25 i/s. AnimatedDrawings (MIT) rend
  sans écran. Aucun chiffre CPU n'existe pour une vidéo Wan *(notes antérieures)* —
  [LivePortrait LICENSE](https://github.com/KwaiVGI/LivePortrait/blob/main/LICENSE),
  [AnimatedDrawings](https://github.com/facebookresearch/AnimatedDrawings),
  [sd.cpp docs Wan](https://github.com/leejet/stable-diffusion.cpp/blob/main/docs/wan.md).

### Inferences
**Tableau d'adéquation budget zéro** (✔ = tient ; ~ = tient sous conditions ou sans preuve ; ✘ = ne tient pas)

| Brique | Outil gratuit | T4 16 Go | Durée indicative sur T4 | CPU 4 cœurs |
|---|---|---|---|---|
| Jeu d'images d'un personnage | Qwen-Image-Edit-2511 GGUF (Apache) | ~ (20B quantifié, encodeur sur CPU ; non mesuré) | inconnue ; ≈ 1 min/image pour Z-Image en 9 pas (affirmation) | ✘ |
| LoRA d'image (personnage, style) | Z-Image-Turbo + ai-toolkit | ~ probable (< 12 Go signalé, en fp16) | ≥ 1–2 h pour 2000 pas (chiffre 12 Go ; T4 plus lent) | ✘ |
| LoRA vidéo Wan 2.2 14B | musubi-tuner / ai-toolkit | ✘ déconseillé (24 Go conseillés ; FP8 non matériel ; RAM Kaggle limite) | aucun chiffre ; > 4 h probables | ✘ |
| LoRA vidéo Wan 1.3B (T2V) | musubi-tuner | ~ probable | inconnue | ✘ |
| I2V / première + dernière image | Wan 2.2 I2V 14B GGUF Q4–Q6 ; Wan 2.1 1.3B / VACE 1.3B | ✔ en 480p | ≈ 9–15 min par clip de 5 s | ✘ (aucun chiffre) |
| Référence → vidéo | Phantom-Wan 1.3B ; SkyReels-V3 R2V `--low_vram` | ~ (1.3B probable ; 14B non prouvé) | inconnue | ✘ |
| Transfert de mouvement | One-to-All 1.3B ; Wan2.2-Animate GGUF Q3–Q6 | ✔ / ~ | 11 min pour 10 s (One-to-All) ; Animate inconnue | ✘ |
| Audio → vidéo parlée | InfiniteTalk / MultiTalk | ✔ (12,7 Go ; 8 Go via Wan2GP) | ≈ 25–50 s de calcul par seconde de vidéo à 25 i/s (déduit de 0,5–1 image/s) | ✘ |
| Lip-sync après coup | MuseTalk ; LatentSync 1.5 | ✔ | MuseTalk proche du temps réel (30 i/s sur V100, T4 plus lent) ; LatentSync quelques minutes par clip | ~ très lent |
| TTS français cloné | Qwen3-TTS ; Chatterbox ML V3 | ✔ | ≈ temps réel ou mieux (RTF 0,91 sur une petite carte) | ✔ lent (RTF ≈ 5,4 pour Qwen3-TTS) |
| TTS français léger | Piper (voix CC-BY/CC0) ; Kokoro (1 voix) | inutile | — | ✔ (conçu pour CPU ; connaissance générale, non mesurée ici) |
| Visage piloté et marionnette | LivePortrait ; AnimatedDrawings ; Inochi2D | ✔ | rapide | ✔ (7,9 s/image pour LivePortrait) |

- **Changement de stratégie imposé par le budget zéro** : la cohérence se fait **au niveau de l'image clé**, avec une LoRA
  d'image Z-Image et l'édition par Qwen-Image-Edit, puis l'I2V Wan GGUF sur T4. Ce n'est plus une LoRA vidéo 14B,
  inentraînable confortablement sur T4. L'identité dans la vidéo est alors portée par la première image, et éventuellement
  par la dernière (FLF2V / VideoX-Fun).
- **Voix** : Qwen3-TTS (Apache) ou Chatterbox (MIT) sur le T4, dans le même notebook que la vidéo. Les 125 locuteurs de Piper
  `mls` (CC-BY) offrent un vivier de voix distinctes, gratuites et sur CPU, pour les 47 personnages secondaires, mais avec un
  accent de France et non ivoirien. La meilleure solution gratuite reste de faire enregistrer 10–30 s par des amis ou
  comédiens ivoiriens, puis de cloner.
- **Plafond de qualité** : 480p en sortie sur T4. Pour TikTok en 1080×1920, il faudra agrandir, avec un outil gratuit à
  évaluer, non couvert ici.
- **Appoint** : ZeroGPU (3 exécutions par jour, carte de 48 Go) peut servir aux 1 à 3 plans les plus exigeants d'un sketch,
  par exemple un plan Wan 2.2 14B en 720p.

### Gaps
- **Aucun chrono T4 mesuré** pour : Wan2.2-Animate GGUF, MultiTalk, SkyReels-V3, Phantom 1.3B, Qwen-Image-Edit GGUF, LoRA Z-Image
  et LoRA Wan. Les seuls chiffres T4 trouvés sont One-to-All (11 min pour 10 s), WanGP (9–15 min par clip, communauté) et
  InfiniteTalk (0,5–1 image/s, notebook communautaire à l'unité mal définie).
- La faisabilité de l'entraînement fp16 sur T4 (sans bf16) n'est pas documentée pour ai-toolkit ni pour musubi-tuner, qui
  utilisent bf16 par défaut. C'est à tester.
- La RAM exacte des sessions Kaggle T4 en octobre 2026 n'a pas été vérifiée (le notebook Wan2.2-Animate exige 32 Go). Le
  temps de téléchargement des poids (≈ 27 Go pour InfiniteTalk) à chaque session réduit le quota utile.
- Les licences des voix Piper « tom » (AGPLv3 sur les données) et les conditions précises d'OpenRAIL++ pour LatentSync
  doivent être relues avant un usage monétisé.
