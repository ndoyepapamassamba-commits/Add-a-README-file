# Animer une image fixe par la voix (lèvres + tête + buste + gestes) : comparatif sourcé pour les sketchs dialogués de la troupe — état au 16/10/2026

Périmètre : InfiniteTalk et MultiTalk (MeiGen), HuMo (ByteDance), Wan2.2-S2V (Alibaba), OmniAvatar, Hallo3 (Fudan), EchoMimic V2/V3 (Ant Group), FantasyTalking (AMAP), Sonic (Tencent), StableAvatar ; outils de lip-sync sur vidéo LatentSync (ByteDance) et MuseTalk (Tencent Music) ; nouveau modèle 2026 multi-personnes : LongCat-Video-Avatar 1.5 (Meituan / MeiGen).

Cas d'usage visé : images fixes de haute qualité, style 3D cartoon type Pixar, 2–3 personnages africains dans une même scène (cour, restaurant) ; sketchs de 1 min en français pour TikTok ; un plan par réplique (2–4 s), parfois deux personnages cadrés dont seul le locuteur parle pendant que l'autre réagit ; voix françaises synthétiques ; lèvres + tête + buste + gestes synchronisés, identité et décor conservés, sans déformation ; ~1 000 vidéos ; ni abonnement ni paiement à la génération.

Méthode et provenance (16/10/2026) :
- Repartir de la dernière veille : `research_notes/Outils animation fluide et rapide/generatif_video_lipsync_cartoon.md` et le journal de `.claude/skills/veille-permanente/SKILL.md` (16/10/2026). Ce qui y était déjà établi est repris avec ses sources ; tout le reste a été relu aujourd'hui.
- **Lu en direct aujourd'hui** : textes LICENSE bruts de 16 dépôts GitHub (raw.githubusercontent.com), étiquettes de licence de 33 fiches Hugging Face (API `huggingface.co/api/models/…`), README GitHub et fiches HF de chaque modèle, code source (MultiTalk `generate_multitalk.py` et `wan/multitalk.py`, LongCat `run_demo_avatar_multi_audio_to_video.py`, ComfyUI `comfy_extras/nodes_wan.py` et `pyproject.toml`), tableaux de résultats extraits des versions HTML arXiv de 10 articles, tutoriels docs.comfy.org, pages tarifaires WaveSpeed et Replicate, état d'exécution de 16 Spaces Hugging Face (API `api/spaces`).
- Règle maison rappelée : code et poids exécutés chez nous = MIT, Apache-2.0 ou BSD seulement. Drapeaux : **[NC]** non commercial, **[RECH]** recherche seulement, **[MAISON]** licence maison non MIT/Apache/BSD, **[GPL]** copyleft.

---

## 1. Licences : code (LICENSE exact), poids (fiche du modèle), composants obligatoires (encodeur audio, modèle vidéo de base) ; usage commercial ?

### Takeaway
Six familles passent la règle maison de bout en bout (code + poids + composants) : **InfiniteTalk, MultiTalk, HuMo, Wan2.2-S2V, OmniAvatar-14B, FantasyTalking, EchoMimic V3 (Apache-2.0)**, **StableAvatar et LongCat-Video-Avatar 1.5 (MIT)**, et **MuseTalk (MIT, poids commerciaux autorisés)**. Sont à exclure ou à isoler : **Sonic** (CC BY-NC-SA + Stable Video Diffusion), **Hallo3** (dérivé de CogVideoX-5B + modèles InsightFace non commerciaux), **LatentSync** (poids OpenRAIL++ + modèles InsightFace non commerciaux à l'inférence), **EchoMimic V2** (poids sans licence, README « academic research »). Piège nouveau : **ComfyUI lui-même est sous GPL-3.0** (le wrapper Kijai est Apache-2.0 mais s'exécute dans ComfyUI) et **Wan2GP est sous « WanGP Community License 2.0 » (licence maison)**.

### Cited Findings

**Tableau 1 — licences lues le 16/10/2026**

| Modèle | Code (fichier LICENSE lu) | Poids (étiquette fiche HF) | Modèle vidéo de base (licence) | Encodeur audio (licence) | Autres composants à l'inférence | Commercial selon la règle maison |
|---|---|---|---|---|---|---|
| **InfiniteTalk** | Apache-2.0 (`LICENSE.txt`) | `apache-2.0` (maj 04/09/2025) | Wan2.1-I2V-14B-480P : `apache-2.0` | chinese-wav2vec2-base : `mit` | LoRA lightx2v : `apache-2.0` ; FusionX : `apache-2.0` déclaré | **oui** |
| **MultiTalk** | Apache-2.0 (`LICENSE.txt`) | `apache-2.0` (maj 12/07/2025) | Wan2.1-I2V-14B-480P : `apache-2.0` | chinese-wav2vec2-base : `mit` | idem | **oui** |
| **HuMo** (1.7B / 17B) | Apache-2.0 (`LICENSE`) | `apache-2.0` (maj 18/09/2025) | Wan 2.1 (VAE + encodeur de texte) : `apache-2.0` | Whisper-large-v3 : `apache-2.0` | — | **oui** |
| **Wan2.2-S2V-14B** | Apache-2.0 (`LICENSE.txt` de Wan2.2) | `apache-2.0` (maj 17/09/2025) ; « The models in this repository are licensed under the Apache 2.0 License » | (le modèle est lui-même la base) | wav2vec2-large-xlsr-53-english : `apache-2.0` | umt5-xxl (fourni dans le dépôt) | **oui** |
| **OmniAvatar** 14B / 1.3B | Apache-2.0 (`LICENSE.txt`) | 14B : `apache-2.0` ; **1.3B : aucune étiquette** | Wan2.1-T2V-14B : `apache-2.0` | wav2vec2-base-960h : `apache-2.0` | — | 14B **oui** ; 1.3B incertain |
| **FantasyTalking** | Apache-2.0 (`LICENSE`) | `apache-2.0` | Wan2.1-I2V-14B-720P (Apache) | wav2vec2-base-960h : `apache-2.0` | — | **oui** |
| **EchoMimic V3** (1.3B) | Apache-2.0 (`LICENSE.txt`) | `apache-2.0` (maj 23/01/2026) | Wan2.1-Fun-V1.1-1.3B-InP (Apache, VideoX-Fun) | wav2vec2-base-960h (`apache-2.0`) ou chinese-wav2vec2-base (`mit`) | — | **oui** |
| **EchoMimic V2** | Apache-2.0 (`LICENSE`) | **aucune étiquette** ; README : « This project is intended for academic research » | (U-Net type SD) | Whisper tiny (`apache-2.0`) | sd-vae-ft-mse : `mit` ; **pose des mains obligatoire** | **[RECH] incertain → exclu** |
| **StableAvatar** | MIT (`LICENSE.txt`) | `mit` (maj 17/08/2025) | Wan2.1-Fun-V1.1-1.3B-InP (Apache) | wav2vec2-base-960h (`apache-2.0`) | — | **oui** |
| **Hallo3** | MIT (`LICENSE`) | `mit` (maj 31/07/2026) | **CogVideoX-5b-I2V : `license:other`** (licence CogVideoX) | wav2vec2-base-960h | **InsightFace (modèles non commerciaux)**, MediaPipe, séparateur vocal Kim_Vocal_2 | **[MAISON][NC] → exclu** |
| **Sonic** | **CC BY-NC-SA 4.0** (`LICENSE`) ; README : « our license is **non-commercial** » | aucune étiquette | **SVD-XT : `stable-video-diffusion-community`** | whisper-tiny | — | **[NC] → exclu** |
| **LatentSync 1.5 / 1.6** | Apache-2.0 (`LICENSE`) | **`openrail++`** (1.5 et 1.6) | U-Net latent (type SD) | Whisper tiny | **InsightFace `FaceAnalysis` dans `face_detector.py`** (modèles non commerciaux) | **[MAISON][NC] → exclu** |
| **MuseTalk 1.5** | MIT (`LICENSE`, © 2024 Tencent Music) | `mit` (maj 22/09/2026) ; « The trained model are available for any purpose, even commercially » | — | Whisper | sd-vae-ft-mse (`mit`) | **oui** |
| **LongCat-Video-Avatar 1.5** (2026) | MIT (« Any contributions to this repository are licensed under the MIT License ») | `mit` (maj 04/06/2026) ; « The model weights are released under the MIT License » | LongCat-Video : `mit` | Whisper-large-v3 (`apache-2.0`) ; v1.0 : wav2vec2 | — | **oui** |

Sources du tableau :
- InfiniteTalk : [LICENSE.txt](https://github.com/MeiGen-AI/InfiniteTalk/blob/main/LICENSE.txt), [fiche HF](https://huggingface.co/MeiGen-AI/InfiniteTalk), composants listés dans le [README](https://github.com/MeiGen-AI/InfiniteTalk) (« Wan2.1-I2V-14B-480P … Base model », « chinese-wav2vec2-base … Audio encoder »).
- MultiTalk : [LICENSE.txt](https://github.com/MeiGen-AI/MultiTalk/blob/main/LICENSE.txt), [fiche HF](https://huggingface.co/MeiGen-AI/MeiGen-MultiTalk), [README](https://github.com/MeiGen-AI/MultiTalk).
- HuMo : [LICENSE](https://github.com/Phantom-video/HuMo/blob/main/LICENSE), [fiche HF](https://huggingface.co/bytedance-research/HuMo) (« license: apache-2.0 »), composants Wan-2.1 + Whisper-large-v3 dans le [README](https://github.com/Phantom-video/HuMo).
- Wan2.2-S2V : [fiche HF](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B) (section « License Agreement » ; dossier `wav2vec2-large-xlsr-53-english` dans la liste des fichiers), [LICENSE.txt Wan2.2](https://github.com/Wan-Video/Wan2.2/blob/main/LICENSE.txt), [fiche jonatasgrosman/wav2vec2-large-xlsr-53-english](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-english).
- OmniAvatar : [LICENSE.txt](https://github.com/Omni-Avatar/OmniAvatar/blob/main/LICENSE.txt), [HF 14B](https://huggingface.co/OmniAvatar/OmniAvatar-14B), [HF 1.3B](https://huggingface.co/OmniAvatar/OmniAvatar-1.3B), [README](https://github.com/Omni-Avatar/OmniAvatar).
- FantasyTalking : [LICENSE](https://github.com/Fantasy-AMAP/fantasy-talking/blob/main/LICENSE), [HF acvlab/FantasyTalking](https://huggingface.co/acvlab/FantasyTalking).
- EchoMimic : [LICENSE V3](https://github.com/antgroup/echomimic_v3/blob/main/LICENSE.txt), [HF V3](https://huggingface.co/BadToBest/EchoMimicV3), [README V3](https://github.com/antgroup/echomimic_v3) ; [LICENSE V2](https://github.com/antgroup/echomimic_v2/blob/main/LICENSE), [HF V2](https://huggingface.co/BadToBest/EchoMimicV2), [README V2](https://github.com/antgroup/echomimic_v2).
- StableAvatar : [LICENSE.txt](https://github.com/Francis-Rings/StableAvatar/blob/main/LICENSE.txt), [HF](https://huggingface.co/FrancisRing/StableAvatar).
- Hallo3 : [LICENSE](https://github.com/fudan-generative-vision/hallo3/blob/main/LICENSE), [HF](https://huggingface.co/fudan-generative-ai/hallo3), composants dans le [README](https://github.com/fudan-generative-vision/hallo3), [CogVideoX-5b-I2V](https://huggingface.co/zai-org/CogVideoX-5b-I2V).
- Sonic : [LICENSE](https://github.com/jixiaozhong/Sonic/blob/main/LICENSE), [README](https://github.com/jixiaozhong/Sonic), [SVD-XT](https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt).
- LatentSync : [LICENSE](https://github.com/bytedance/LatentSync/blob/main/LICENSE), [HF 1.6](https://huggingface.co/ByteDance/LatentSync-1.6), [face_detector.py](https://github.com/bytedance/LatentSync/blob/main/latentsync/utils/face_detector.py) (`from insightface.app import FaceAnalysis`).
- MuseTalk : [README / LICENSE](https://github.com/TMElyralab/MuseTalk), [HF](https://huggingface.co/TMElyralab/MuseTalk).
- LongCat 1.5 : [fiche HF](https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5), [HF LongCat-Video](https://huggingface.co/meituan-longcat/LongCat-Video).
- Encodeurs : [chinese-wav2vec2-base](https://huggingface.co/TencentGameMate/chinese-wav2vec2-base) (`mit`), [wav2vec2-base-960h](https://huggingface.co/facebook/wav2vec2-base-960h) (`apache-2.0`), [whisper-large-v3](https://huggingface.co/openai/whisper-large-v3) (`apache-2.0`), [whisper-tiny](https://huggingface.co/openai/whisper-tiny) (`apache-2.0`), [sd-vae-ft-mse](https://huggingface.co/stabilityai/sd-vae-ft-mse) (`mit`).
- Accélérateurs : [lightx2v Wan2.1-I2V-14B-480P StepDistill](https://huggingface.co/lightx2v/Wan2.1-I2V-14B-480P-StepDistill-CfgDistill-Lightx2v) (`apache-2.0`), [LightX2V LICENSE](https://github.com/ModelTC/LightX2V/blob/main/LICENSE) (Apache-2.0), [FusionX](https://huggingface.co/vrgamedevgirl84/Wan14BT2VFusioniX) (`apache-2.0` déclaré sur la fiche).

**InsightFace** : « The code of InsightFace is released under the MIT License » mais « The training data containing the annotation (and the models trained with these data) are available for non-commercial research purposes only » ; la bibliothèque Python le répète : « The pretrained models provided with this library are for non-commercial research only » — [README InsightFace](https://github.com/deepinsight/insightface), [README python-package](https://github.com/deepinsight/insightface/blob/master/python-package/README.md).

**Outillage d'exécution** :
- **ComfyUI = GNU GPL v3** (fichier `LICENSE` du dépôt) — [LICENSE ComfyUI](https://github.com/comfyanonymous/ComfyUI/blob/master/LICENSE).
- **ComfyUI-WanVideoWrapper (Kijai) = Apache-2.0** — [LICENSE](https://github.com/kijai/ComfyUI-WanVideoWrapper/blob/main/LICENSE).
- Fichiers repackagés : `Comfy-Org/Wan_2.1_ComfyUI_repackaged` et `Comfy-Org/Wan_2.2_ComfyUI_Repackaged` = `apache-2.0` ; `Kijai/WanVideo_comfy_fp8_scaled` = `apache-2.0` ; `Kijai/wav2vec2_safetensors` = `mit` ; **`Kijai/WanVideo_comfy` (où docs.comfy.org pointe la LoRA lightx2v rang 64 et le VAE bf16) : aucune étiquette de licence** — lu via l'API HF ([Wan_2.1 repackaged](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged), [Wan_2.2 repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged), [WanVideo_comfy_fp8_scaled](https://huggingface.co/Kijai/WanVideo_comfy_fp8_scaled), [wav2vec2_safetensors](https://huggingface.co/Kijai/wav2vec2_safetensors), [WanVideo_comfy](https://huggingface.co/Kijai/WanVideo_comfy)).
- **Wan2GP** : « WanGP Community License 2.0 » — « You may use WanGP for free, including inside a company … you may sell or license those outputs … You may not sell WanGP itself, white-label it, embed it in a paid product, or offer paid API / SaaS / hosted » — [LICENSE.txt Wan2GP](https://github.com/deepbeepmeep/Wan2GP/blob/main/LICENSE.txt).

### Inferences
- Pour 1 000 vidéos publiées (TikTok, potentiellement monétisées), la pile la plus propre est **Wan 2.1/2.2 (Apache) + InfiniteTalk/MultiTalk (Apache) + chinese-wav2vec2 (MIT) + lightx2v (Apache)**, ou **LongCat-Video-Avatar 1.5 + LongCat-Video (MIT) + Whisper-large-v3 (Apache)**. Ces deux piles ne contiennent aucun composant non commercial connu.
- ComfyUI étant GPL-3.0, l'exécuter comme **outil externe séparé** (processus à part, sans copier son code dans notre moteur) ne change rien aux sorties vidéo, mais **intégrer son code** dans notre moteur sortirait de la règle MIT/Apache/BSD. La voie conforme pour un moteur maison est d'appeler **les scripts officiels Apache** (`generate_infinitetalk.py`, `generate_multitalk.py`, `run_demo_avatar_multi_audio_to_video.py`) depuis notre code.
- Les deux pièges « cachés » sont des **composants**, pas les dépôts : InsightFace (Hallo3, LatentSync) et les modèles de base (CogVideoX pour Hallo3, SVD pour Sonic).
- Les LoRA téléchargées depuis `Kijai/WanVideo_comfy` (sans étiquette) peuvent être remplacées par la source amont `lightx2v/…` (Apache-2.0) pour garder une trace de licence propre.

### Gaps
- La composition exacte de la LoRA FusionX (fusion de plusieurs LoRA tierces) n'a pas été vérifiée ici ; seule l'étiquette `apache-2.0` de la fiche est attestée. À vérifier avant usage (sinon s'en tenir à lightx2v, Apache).
- Licence des poids OmniAvatar-1.3B : aucune étiquette sur la fiche ; non résolue.
- Licences des nœuds ComfyUI tiers `smthemex/ComfyUI_StableAvatar` et `smthemex/ComfyUI_EchoMimic` : non lues.

---

## 2. Entrées / sorties : image ou vidéo, audio, texte ; multi-personnes avec audio par locuteur et boîtes ; corps ou visage ; durée ; résolution ; i/s ; robustesse au français ; personnages cartoon

### Takeaway
Seuls **MultiTalk, InfiniteTalk (patch « multi ») et LongCat-Video-Avatar 1.5** savent lier **une piste audio à une personne** dans une image à plusieurs personnages (masques ou boîtes) ; **LongCat 1.5 accepte en plus une liste de boîtes « others » qui reçoivent un audio silencieux** — exactement le cas « 3 personnages, un seul parle ». Wan2.2-S2V, HuMo, OmniAvatar, FantasyTalking, EchoMimic, StableAvatar, Sonic et Hallo3 sont pilotés par **une seule piste audio**. Pour le français, **HuMo et LongCat 1.5 utilisent Whisper-large-v3 (multilingue)** ; InfiniteTalk/MultiTalk utilisent un wav2vec2 **pré-entraîné sur du mandarin**, les autres un wav2vec2 **anglais** — aucun n'a publié d'évaluation sur le français.

### Cited Findings

**Tableau 2 — entrées, sorties, durée (lu le 16/10/2026)**

| Modèle | Entrée image / vidéo | Texte | Multi-personnes (audio par locuteur) | Corps | Durée par passe ; long | Résolution | i/s | Encodeur audio (données d'entraînement) | Cartoon / stylisé (preuve) |
|---|---|---|---|---|---|---|---|---|---|
| **InfiniteTalk** | image (I2V) **ou vidéo (V2V, doublage)** | oui | **oui** : patch `multi`, `cond_audio` person1/person2, `audio_type` `para`/`add` | corps entier (« head movements, body posture, and facial expressions ») | blocs de 81 images, 72 nouvelles images par bloc ; `--max_frame_num` défaut **40 s (1000 images)** ; « unlimited » | 480p / 720p | 25 | chinese-wav2vec2-base (**10 000 h WenetSpeech, mandarin**) | non revendiqué dans le README |
| **MultiTalk** | image | oui | **oui** : person1/person2 + clé optionnelle **`bbox`** ; sans `bbox`, l'image est coupée en moitié gauche / moitié droite | corps | entraîné sur **81 images à 25 i/s** ; jusqu'à 201 images ; « up to 15 seconds » | 480p (720p multi-GPU) | 25 | chinese-wav2vec2-base | **« Support the generation of cartoon character and singing »** |
| **LongCat-Video-Avatar 1.5** (21/05/2026) | image (ai2v) ou texte seul (at2v) + continuation vidéo | oui | **oui** : person1/person2 + `bbox` + **`others` (audio silencieux pour les autres personnages)** ; `audio_type` `para`/`add` | corps (« full-body temporal stability », « object handling ») | **93 images** par segment (13 de conditionnement), `--num_segments` | 480p (480×832) / 720p (768×1280) | **25** (v1.5) ; 16 (v1.0) | **Whisper-large-v3** (v1.5) | **« Robustly generalizes to anime, animals »** |
| **Wan2.2-S2V-14B** | image + **vidéo de pose optionnelle** | oui | **non** (une piste audio) | « full-body and half-body » | 77 images par bloc + nœuds Extend ; durée calée sur l'audio | 480p / 720p (aire, ratio de l'image) | **16** | wav2vec2-large-xlsr-53-english (XLSR-53 affiné sur l'anglais Common Voice) | exemple officiel « a white cat wearing sunglasses » ; Live Avatar (dérivé S2V) revendique les cartoons |
| **HuMo** 1.7B / 17B | **image de référence (identité), pas image de départ** + texte ; mode TA ou TIA | oui (fort) | non | corps | entraîné sur **97 images à 25 i/s** ; « longer than 97 frames may degrade » | 480p / 720p (« 720P … much better quality ») | 25 | **Whisper-large-v3** | article : « generalizes to … stylized humanoid artworks, and animations » |
| **OmniAvatar** 14B / 1.3B | image de référence + texte (base **Wan2.1-T2V**) | oui | non | « Adaptive Body Animation » | fenêtres avec recouvrement 13 images | **« 480p only for now »** | — | wav2vec2-base-960h (LibriSpeech, anglais) | article : « cartoon painting style » (Fig. 9) |
| **FantasyTalking** | image | oui | non | portrait / buste | 81 images (tests) | 512×512 (tests), base 720P | — | wav2vec2-base-960h | — |
| **EchoMimic V3** 1.3B | image | oui | non | tête et corps (« 5 steps for talking head, 15~25 steps for talking body ») | > 138 images via « Long Video CFG » | — | — | wav2vec2-base-960h ou chinese-wav2vec2-base (Flash) | — |
| **EchoMimic V2** | image + **pose des mains obligatoire** | — | non | demi-corps | 120 images (mesure A100) | — | — | Whisper tiny ; « trained on English and Mandarin Chinese » | — |
| **StableAvatar** 1.3B | image | oui | **une seule piste** ; démontre plusieurs personnages animés par le même audio (A.7) | corps entier / demi-corps (A.6) | « infinite-length » ; vidéos de plus de 3 min montrées | 512×512, 480×832, 832×480 | 25 (README) ; 30 (article) | wav2vec2-base-960h | **A.8 « Cartoon Avatar Video Generation »** ; **échec sur une créature non humaine** (A.10) |
| **Sonic** | image | — | non | visage | jusqu'à 10 min montrées | — | — | whisper-tiny | exemple `anime1.png` |
| **Hallo3** | image | oui | non | visage + fond dynamique | — | — | — | wav2vec2-base-960h | — |
| **LatentSync 1.6** | **vidéo** (bouche seule) | — | non | **bouche seule** | segments 5–10 s (entraînement) | visage 512×512 (1.6) | 25 | Whisper tiny | démo avec vidéos anime (VASA-1) |
| **MuseTalk 1.5** | **vidéo** (bouche seule) | — | non | **bouche seule** | temps réel | visage 256×256 | « 30fps+ » (V100) | Whisper | aucune mention |

Sources : [README InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk) ; « produce 72 frames each time » — [article InfiniteTalk](https://arxiv.org/html/2508.14033) ; [exemple multi InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk/blob/main/examples/multi_example_image.json) ; [README MultiTalk](https://github.com/MeiGen-AI/MultiTalk) ; gestion `bbox` / moitiés gauche-droite / `para`-`add` — [wan/multitalk.py](https://github.com/MeiGen-AI/MultiTalk/blob/main/wan/multitalk.py) et [generate_multitalk.py](https://github.com/MeiGen-AI/MultiTalk/blob/main/generate_multitalk.py) ; [fiche LongCat 1.5](https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5) ; bbox, `others`, 93 images, 25 i/s, résolutions — [run_demo_avatar_multi_audio_to_video.py](https://github.com/meituan-longcat/LongCat-Video/blob/main/run_demo_avatar_multi_audio_to_video.py) ; [fiche Wan2.2-S2V](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B) ; 77 images, 16 i/s — [tutoriel S2V docs.comfy.org](https://docs.comfy.org/tutorials/video/wan/wan2-2-s2v) ; [README HuMo](https://github.com/Phantom-video/HuMo) ; « stylized humanoid artworks » — [article HuMo](https://arxiv.org/html/2509.08519) ; [README OmniAvatar](https://github.com/Omni-Avatar/OmniAvatar) ; « cartoon painting style » — [article OmniAvatar](https://arxiv.org/html/2506.18866) ; [README FantasyTalking](https://github.com/Fantasy-AMAP/fantasy-talking) ; [README EchoMimic V3](https://github.com/antgroup/echomimic_v3) ; [README EchoMimic V2](https://github.com/antgroup/echomimic_v2) ; [README StableAvatar](https://github.com/Francis-Rings/StableAvatar) ; A.6–A.10 — [article StableAvatar](https://arxiv.org/html/2508.08248) ; [README Sonic](https://github.com/jixiaozhong/Sonic) ; [README Hallo3](https://github.com/fudan-generative-vision/hallo3) ; [README LatentSync](https://github.com/bytedance/LatentSync) ; [README MuseTalk](https://github.com/TMElyralab/MuseTalk) ; encodeurs : [chinese-wav2vec2-base](https://huggingface.co/TencentGameMate/chinese-wav2vec2-base) (« Pretrained on 10k hours WenetSpeech L subset »), [wav2vec2-base-960h](https://huggingface.co/facebook/wav2vec2-base-960h) (LibriSpeech), [xlsr-53-english](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-english) (« Fine-tuned XLSR-53 … on English … Common Voice 6.1 »), [whisper-large-v3](https://huggingface.co/openai/whisper-large-v3) (« Trained on >5M hours of labeled data »).

**Détails multi-personnes utiles à notre cas « seul le locuteur parle »** :
- MultiTalk : si une piste vaut `'None'`, le code la remplace par des zéros (`np.zeros`) ; `para` = deux pistes simultanées ; `add` = person1 puis person2 à la suite — [generate_multitalk.py](https://github.com/MeiGen-AI/MultiTalk/blob/main/generate_multitalk.py).
- MultiTalk : « The number of target bbox should be the same with cond_audio » ; le masque est rempli `human_mask[int(x_min):int(x_max), int(y_min):int(y_max)]`, c'est-à-dire que **le premier couple indexe les LIGNES (hauteur)** — [wan/multitalk.py](https://github.com/MeiGen-AI/MultiTalk/blob/main/wan/multitalk.py).
- LongCat 1.5 : « bbox: [left_y_min, left_x_min, left_y_max, left_x_max] » ; `others` = liste de boîtes, `use_background_silent_audio` crée un embedding audio à partir de `np.zeros_like(...)` pour ces personnages — [run_demo_avatar_multi_audio_to_video.py](https://github.com/meituan-longcat/LongCat-Video/blob/main/run_demo_avatar_multi_audio_to_video.py).
- LongCat 1.5 : « Merge mode (set audio_type to para) requires two audio clips of equal length … Concatenation mode (set audio_type to add) does not require equal-length inputs » — [fiche HF](https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5).
- ComfyUI natif : `WanInfiniteTalkToVideo` a deux modes, `single_speaker` et `two_speakers` ; en deux locuteurs, `mask_1` et `mask_2` sont « required if using two audio inputs » — [nodes_wan.py](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy_extras/nodes_wan.py) ; « For multi-character scenarios, use the Mask Editor to draw masks for each character » — [tutoriel InfiniteTalk](https://docs.comfy.org/tutorials/video/wan/wan-infinitetalk).
- Hébergé : WaveSpeed InfiniteTalk Multi exige une image qui « should clearly show two people », `left_audio`, `right_audio`, `order` (gauche→droite, droite→gauche, simultané) ; pas de boîte ni de masque exposés — [WaveSpeed](https://wavespeed.ai/models/wavespeed-ai/infinitetalk/multi).
- Observation de praticien (InfiniteTalk multi, ComfyUI) : « When the man talks, the woman looks at him. When she talks, he turns. Lip-sync stays steady » — [aistudynow](https://aistudynow.com/infinitytalk-comfyui-workflow-wan-2-1-img2vid-vid2vid-multi-talk/).

**Robustesse à la langue et aux voix synthétiques** :
- MultiTalk (limite écrite par les auteurs) : « our method performs better using real audio than using synthesized audio in terms of facial expression. The reason might be that we use real audio data for training » — [article MultiTalk](https://arxiv.org/html/2505.22647).
- LongCat 1.5 : banc d'évaluation humaine sur « 2 languages (Chinese/English) » — [fiche HF](https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5).
- EchoMimic V2 : « Pretrained models trained on English and Mandarin Chinese » — [README](https://github.com/antgroup/echomimic_v2) ; LatentSync 1.5 « improves performance on Chinese videos » — [README](https://github.com/bytedance/LatentSync).
- Aucune évaluation publiée du lip-sync **français** pour un modèle ouvert (constat de la veille précédente, confirmé aujourd'hui) — [note du 16/10/2026](../Outils%20animation%20fluide%20et%20rapide/generatif_video_lipsync_cartoon.md).

### Inferences
- **Format de plan** : nos répliques de 2–4 s tiennent dans **une seule passe** chez InfiniteTalk/MultiTalk (81 images à 25 i/s = 3,24 s ; calcul fait ici), HuMo (97 images = 3,88 s), LongCat 1.5 (93 images = 3,72 s) et S2V (77 images à 16 i/s = 4,81 s). Les défauts « longue vidéo » (dérive de couleur, d'identité) ne concernent donc presque pas notre usage plan par plan.
- **Cas « deux personnages, un seul parle »** : avec MultiTalk/InfiniteTalk, passer la voix du locuteur à sa personne et **une piste silencieuse** à l'écouteur (`'None'` → zéros), plus des boîtes/masques précis issus de notre propre détection ; décrire la réaction de l'écouteur dans le prompt (« écoute, hoche la tête »). Avec **3 personnages**, seul **LongCat 1.5** prévoit nativement le 3e (boîtes `others` muettes) ; avec InfiniteTalk, le 3e personnage n'est couvert par aucun masque.
- **Identité et décor** : I2V (image de départ) — InfiniteTalk, MultiTalk, S2V, LongCat ai2v, FantasyTalking, StableAvatar — part de **notre image exacte** ; **HuMo est un modèle « référence → vidéo »** (l'image fixe l'identité, le décor vient du texte), donc il **ne garantit pas le décor de notre image** : à réserver aux plans où l'on accepte de régénérer la scène.
- **Français** : Whisper-large-v3 (HuMo, LongCat 1.5) est le seul encodeur entraîné massivement en multilingue ; c'est un argument a priori, pas une mesure. Les voix synthétiques françaises doivent être **expressives** (prosodie marquée) pour limiter l'écart « real vs synthesized » signalé par MultiTalk.
- **Vertical 9:16** : MultiTalk revendique « arbitrary aspect ratios » ; LongCat code 480×832 / 768×1280 en dur dans le script multi (orientation à vérifier sur notre format 576×1024 / 720×1280).

### Gaps
- Comportement exact d'InfiniteTalk/LongCat sur un format vertical 9:16 avec 2–3 personnages de petite taille : non documenté → à mesurer sur nos images (greffe en cours : banc de 20 plans, Sync-C du locuteur, mouvement de bouche de l'écouteur par repères faciaux).
- Comportement de LatentSync/MuseTalk quand deux visages sont dans le cadre (quel visage est choisi) : non trouvé dans les README lus.
- Aucune preuve publiée sur des personnages **3D type Pixar à grosse tête** spécifiquement ; seules des mentions génériques « cartoon / anime / stylized » existent.

---

## 3. Preuves de qualité : Sync-C / Sync-D, FID / FVD, études utilisateurs, comparaisons directes ; défauts connus

### Takeaway
Chaque équipe se classe première dans son propre article : dans ceux de MeiGen, **MultiTalk → InfiniteTalk** mènent en Sync-C (≈ 8–9 sur HDTF) devant OmniAvatar (≈ 7) et Hallo3 (≈ 6,5–7,2) ; dans les articles **tiers**, MultiTalk est **à égalité avec OmniAvatar sur HDTF** (7,63 contre 7,62 ; 7,53 contre 7,50) mais **derrière lui sur les autres jeux** (4,76 contre 7,12 ; 4,88 contre 6,78 sur AVSpeech), et **StableAvatar** affiche le meilleur Sync-C et la seule identité stable sur vidéos longues (CSIM 0,849 contre ≈ 0,42–0,47 sur Long100). **FantasyTalking (≈ 3–3,8)** est dans le bas de tous les tableaux tiers (seuls AniPortrait et MimicMotion font moins bien). Les outils de **doublage** (LatentSync, MuseTalk) gardent mieux l'identité image par image (CSIM 0,92–0,93 contre 0,78 pour InfiniteTalk) mais **ne bougent que la bouche** ; l'étude utilisateur d'InfiniteTalk les classe derrière lui pour la synchronisation lèvres et corps. Tous ces chiffres sont **auto-déclarés** dans les articles des auteurs et mesurés sur des visages **réels** (HDTF, CelebV-HQ, EMTD), jamais sur du cartoon ni en français.

### Cited Findings

**Tableau 3a — article InfiniteTalk, comparaison des modèles image → vidéo (HDTF / CelebV-HQ / EMTD)**

| Modèle | Sync-C ↑ | Sync-D ↓ | FID ↓ | FVD ↓ | CSIM ↑ |
|---|---|---|---|---|---|
| FantasyTalking | 3,78 / 2,93 / 3,60 | 10,80 / 10,79 / 11,31 | 32,06 / 37,53 / 36,66 | 110,36 / 237,58 / 298,24 | 0,684 / 0,654 / 0,626 |
| Hallo3 | 7,20 / 5,63 / 5,68 | 8,61 / 9,12 / 9,56 | 36,48 / 42,36 / 44,71 | 144,65 / 258,65 / 326,94 | 0,674 / 0,591 / 0,512 |
| OmniAvatar | 7,06 / 5,88 / 6,93 | 8,63 / 8,68 / 8,55 | 26,63 / 37,41 / 29,47 | 112,49 / 250,67 / 308,14 | 0,752 / 0,703 / 0,694 |
| MultiTalk | 9,02 / 7,25 / 8,13 | 6,96 / 7,70 / 7,50 | 27,61 / 34,79 / 33,80 | 133,58 / 230,41 / 315,33 | 0,754 / 0,711 / 0,702 |
| **InfiniteTalk** | **9,18 / 7,41 / 8,34** | **6,84 / 7,59 / 7,36** | 27,14 / 33,96 / 33,27 | 132,54 / 230,12 / 314,68 | 0,751 / 0,713 / 0,709 |

**Tableau 3b — article InfiniteTalk, comparaison avec les outils de doublage (HDTF)** : LatentSync FID 16,09, FVD 48,45, Sync-C 8,99, Sync-D 6,36, CSIM 0,916 ; MuseTalk 14,20 / 49,13 / 7,17 / 7,90 / 0,933 ; InfiniteTalk 26,11 / 131,65 / 9,35 / 6,67 / 0,775. **Étude utilisateur** (rang moyen, 1 = meilleur, 3 = pire) : synchro lèvres MuseTalk 2,57, LatentSync 2,32, **InfiniteTalk 1,11** ; synchro corps LatentSync 1,92, **InfiniteTalk 1,09** (« We do not compare … MuseTalk in body synchronization because MuseTalk has exactly the same body movement to LatentSync »). Les auteurs notent que « Sync-C and Sync-D cannot accurately depict the lip synchronization when there is large head motion » — [article InfiniteTalk](https://arxiv.org/html/2508.14033).

**Tableau 3c — article MultiTalk (HDTF, Sync-C / Sync-D / FID / FVD)** : Sonic 8,35 / 6,43 / 29,53 / 89,34 ; Hallo3 6,55 / 8,49 / 33,98 / 153,31 ; EchoMimic (v1) 5,36 / 8,99 / 60,82 / 240,07 ; FantasyTalking 3,61 / 10,78 / 32,64 / 103,01 ; **MultiTalk-single 8,54 / 6,69 / 24,01 / 95,99** ; MultiTalk-multiple 8,53 / 6,81 / 27,27 / 124,06. Corps (EMTD) : **EchoMimic V2 6,31 / 8,41** ; FantasyTalking 3,32 / 11,41 ; MultiTalk-single 8,18 / 7,28 ; MultiTalk-multiple 8,34 / 7,30 — [article MultiTalk](https://arxiv.org/html/2505.22647).

**Tableau 3d — article OmniAvatar (HDTF, 1er tableau)** : Hallo3 Sync-C 6,89 / FID 42,1 / FVD 406 ; FantasyTalking 3,75 / 43,9 / 441 ; HunyuanAvatar 7,31 / 47,3 / 588 ; MultiTalk 7,63 / 44,2 / 436 ; **OmniAvatar 7,62 / 37,3 / 382** ; vérité terrain Sync-C 8,20. Second tableau comparatif du même article (légende non extraite) : OmniAvatar Sync-C 7,12, FID 67,6, FVD 664 contre MultiTalk 4,76 / 74,7 / 787, HunyuanAvatar 6,71 / 77,7 / 887, Hallo3 5,23 / 104 / 1078, FantasyTalking 3,14 / 78,9 / 780 — [article OmniAvatar](https://arxiv.org/html/2506.18866).

**Tableau 3e — article StableAvatar (HDTF / AVSpeech / Long100)** : Sync-C Sonic 8,16 / 6,04 / 4,03 ; Hallo3 6,58 / 5,16 / 4,42 ; FantasyTalking 3,42 / 2,98 / 1,92 ; HunyuanAvatar 7,20 / 6,74 / 4,34 ; MultiTalk 7,53 / 4,88 / 4,12 ; OmniAvatar 7,50 / 6,78 / 4,45 ; **StableAvatar 8,15 / 7,56 / 8,24**. CSIM sur Long100 (vidéos longues) : concurrents 0,415–0,472, **StableAvatar 0,849** — [article StableAvatar](https://arxiv.org/html/2508.08248).

**Tableau 3f — article Wan-S2V (comparaison SOTA)** : Sync-C EchoMimicV2 4,44, MimicMotion 2,68, EMO2 4,58, FantasyTalking 3,00, HY-Avatar 4,71, **Wan-S2V 4,51** ; FID **15,66** (meilleur) ; FVD 129,57 (EMO2 129,41) ; CSIM **0,677** (meilleur) ; SSIM 0,734 ; PSNR 20,49 — [article Wan-S2V](https://arxiv.org/html/2508.18621).

**Tableau 3g — article HuMo (banc MoCha, synchro audio-visuelle)** : Sync-C / Sync-D OmniHuman 6,526 / 7,784 ; Hallo3 5,189 / 9,212 ; FantasyTalking 3,202 / 10,914 ; HunyuanCustom 4,562 / 9,892 ; HuMo-1.7B 6,005 / 8,648 ; **HuMo-17B 6,252 / 8,577** ; HuMo-17B meilleur en esthétique (AES 0,589) et suivi du texte (TVA 6,508) — [article HuMo](https://arxiv.org/html/2509.08519).

**Contradictions relevées** :
- MultiTalk mène en Sync-C dans les articles de son équipe (MultiTalk, InfiniteTalk) mais est à égalité avec OmniAvatar sur HDTF et derrière lui sur les autres jeux dans les articles OmniAvatar et StableAvatar (tableaux 3d et 3e) ; chaque article place son propre modèle en tête.
- FantasyTalking est parmi les plus bas en Sync-C dans les articles MultiTalk, InfiniteTalk, OmniAvatar, StableAvatar, Wan-S2V et HuMo (seuls AniPortrait et MimicMotion font moins bien selon les tableaux), mais **premier dans sa propre étude utilisateur** (9,45 / 9,18 / 8,44 / 9,81 contre Sonic 9,07 / 8,17 / 8,13 / 6,25) — [article FantasyTalking](https://arxiv.org/html/2504.04842).

**Défauts connus (sources primaires)** :
- InfiniteTalk : « FusionX LoRA exacerbates color shift over 1 minute and reduces ID preservation » ; I2V « good results from a single image for up to 1 minute. Beyond 1 minute, color shifts become more pronounced » ; SDEdit en V2V « introduces color shift » — [README InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk). Échantillonner des références éloignées « introduces accumulated color and background errors over long sequences » — [article](https://arxiv.org/html/2508.14033).
- MultiTalk : moins de pas « will not hurt the lip synchronization accuracy, but affects the motion and visual quality » ; « Audio CFG influences color tone consistency across segments. Set this value to 3 » ; au-delà de 81 images « might reduce prompt-following » — [README MultiTalk](https://github.com/MeiGen-AI/MultiTalk). InfiniteTalk « Reduces hand/body distortions compared to MultiTalk » — [README InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk).
- Wan2.2-S2V avec LoRA lightning 4 pas : « Using it will cause significant dynamic and quality loss » (LoRA non entraînée pour S2V) — [tutoriel S2V](https://docs.comfy.org/tutorials/video/wan/wan2-2-s2v).
- OmniAvatar : « inherits the weaknesses of the base model, Wan … such as color shifts and error propagation in long video generation » — [article OmniAvatar](https://arxiv.org/html/2506.18866).
- HuMo : « Generating video longer than 97 frames may degrade the performance » — [README HuMo](https://github.com/Phantom-video/HuMo).
- StableAvatar : sur une créature non humaine, « struggles to find its lip, thereby failing to synchronize » — [article StableAvatar](https://arxiv.org/html/2508.08248).
- LatentSync : guidance élevée → « distortion or jitter » ; MuseTalk : visage 256×256 (flou), forme et couleur des lèvres mal gardées, scintillement — repris de la [note du 16/10/2026](../Outils%20animation%20fluide%20et%20rapide/generatif_video_lipsync_cartoon.md) (sources [LatentSync](https://github.com/bytedance/LatentSync), [MuseTalk](https://github.com/TMElyralab/MuseTalk)).
- Retours de praticiens (non vérifiés, commentaires de lecteurs) sur InfiniteTalk dans ComfyUI : déformation après ≈ 2 s sur un clip de 9 s (RTX 5070), vidéo au ralenti et désynchro audio, question sur des résultats plus faibles en 16:9 qu'en carré/vertical ; conseil de l'auteur : « if colors shift between frames, keep ColorMatch OFF » — [aistudynow](https://aistudynow.com/infinitytalk-comfyui-workflow-wan-2-1-img2vid-vid2vid-multi-talk/).
- **Écouteur qui bouge aussi les lèvres** : seule trace trouvée = un billet de blog citant « occasionally both avatars mov[ing] » parmi les inconvénients de MultiTalk (extrait tronqué, source secondaire) — [Promptus](https://www.promptus.ai/blog/bringing-multiple-ai-voices-to-life-with-multitalk-wan-2-1).

### Inferences
- Pour **les lèvres + le corps** sur un plan court, les chiffres publiés placent un **peloton de tête InfiniteTalk / MultiTalk / OmniAvatar / StableAvatar** (Sync-C ≈ 7–9 sur HDTF, ordre interne différent selon l'article), puis Hallo3, HuMo (Sync-C plus bas mais meilleure qualité visuelle et suivi du texte), Wan-S2V (Sync-C moyen mais meilleur FID/CSIM sur son banc), et FantasyTalking en dernier. Comme aucun banc n'est indépendant, **seule une mesure sur nos plans tranchera**.
- L'écart d'identité (CSIM 0,78 InfiniteTalk contre 0,92–0,93 doublage) s'explique par la régénération de toute l'image ; pour notre cas « identité et décor conservés », un **contrôle automatique d'identité/décor par plan** (similarité visage + SSIM du décor hors masque) est nécessaire avant d'accepter un plan.
- Sync-C (SyncNet entraîné sur des visages réels) est un indicateur possiblement biaisé sur des visages cartoon ; il reste utile **en relatif** entre modèles sur nos propres plans.

### Gaps
- Aucun banc indépendant (hors auteurs) comparant InfiniteTalk, LongCat 1.5 et S2V sur les mêmes données ; le rapport technique LongCat 1.5 (PDF) n'a pas été lu ici, donc ses chiffres ne sont pas repris.
- Aucun chiffre publié sur la fréquence du défaut « l'écouteur bouge les lèvres » → à mesurer chez nous (greffe en cours : amplitude d'ouverture de bouche de l'écouteur par repères faciaux, seuil d'acceptation, re-génération automatique avec autre graine ou piste muette).

---

## 4. Matériel et vitesse : VRAM (fp8, GGUF, modes économes), secondes de calcul par seconde de vidéo sur GPU nommés, LoRA d'accélération, faisabilité CPU

### Takeaway
Tous ces modèles exigent un **GPU NVIDIA** ; aucun mode CPU n'est documenté. Les modèles 14B (InfiniteTalk, MultiTalk, S2V, OmniAvatar, FantasyTalking) tournent sur **8 Go** en déchargement complet mais 2 à 3 fois plus lentement, et sur **≈ 13–24 Go** en fp8 + LoRA 4 pas ; les modèles 1.3B (StableAvatar, EchoMimic V3) visent **12–18 Go**. Ordre de grandeur publié : **≈ 10 à 36 s de calcul par seconde de vidéo** (InfiniteTalk 4 pas ≈ 29 s/s sur une carte non nommée ; StableAvatar 36 s/s sur 4090 ; WaveSpeed annonce 10–30 s/s sur ses GPU), donc ~1 000 sketchs × 60 s ≈ **170 à 600 heures-GPU**.

### Cited Findings

**Tableau 4 — matériel et vitesse publiés (« s/s » = secondes de calcul par seconde de vidéo, calculé ici à partir du chiffre cité)**

| Modèle | VRAM publiée | Vitesse publiée | → s/s (calcul) | Accélérations documentées |
|---|---|---|---|---|
| **InfiniteTalk** | « Run with very low VRAM » (`--num_persistent_param_in_dit 0`) ; fp8 (`--quant fp8`, `infinitetalk_single_fp8.safetensors`) ; ComfyUI 4 pas : « about 13–16 GB VRAM » | ComfyUI, lightx2v 4 pas, CFG 1 : 42 s d'audio en « a bit over 20 min » (GPU non nommé) | ≈ 29 | TeaCache, int8, fp8, multi-GPU ; **lightx2v 4 pas** ; FusionX 8 pas |
| **MultiTalk** | Wan2GP : « very low VRAM hardware (8 GB of VRAM) » ; « 480P video generation on a single RTX 4090 » | Replicate (H100) : « Predictions typically complete within 7 minutes » (≤ 15 s par vidéo) | ≥ 28 (si 15 s en 7 min) | TeaCache, int8, SageAttention 2.2, APG, LoRA FusionX / lightx2v |
| **Wan2.2-S2V-14B** | « at least 80GB VRAM » (commande mono-GPU officielle) ; ComfyUI : fp8_scaled « requires less VRAM » | — | — | LoRA lightning 4 pas (perte de qualité, voir §3) |
| **HuMo** | 17B : « can be run on a NVIDIA 3090 GPU » (Kijai) ; 1.7B : « 32G GPU » | 1.7B : « a 480P video in 8 minutes on a 32G GPU » (97 images = 3,88 s) | ≈ 124 | 30–40 pas au lieu de 50 |
| **OmniAvatar 14B** (A800) | 36 Go (plein) ; 21 Go (7B persistants) ; **8 Go** (0 persistant) ; 14,3 Go × 4 GPU (FSDP) | 16,0 / 19,4 / 22,1 s par itération ; 4,8 s/it sur 4 GPU ; 20–50 pas recommandés | — (images par fenêtre non publiées) | TeaCache 0,05–0,15 |
| **FantasyTalking** (A100, 512×512, 81 images) | 40 Go / 20 Go / **5 Go** | 15,5 / 32,8 / 42,6 s par itération | — (pas par défaut non lu) | — |
| **EchoMimic V3 1.3B** | « 12G VRAM Requirement » ; ComfyUI 16 Go ; testé A100 / 4090D / V100 | article : « a 5-second video in approximately 4 minutes with 25 inference steps » (TeaCache) | ≈ 48 | 8 pas (« 8-step High-quality Generation ») |
| **EchoMimic V2** | testé A100 / 4090D / V100 | accéléré : « from ~7mins/120frames to ~50s/120frames on A100 » | — (i/s non lue) | `infer_acc.py` ×9 |
| **StableAvatar 1.3B** | « approximately 18GB VRAM » ; `model_cpu_offload` ≈ moitié | « finishes in 3 minutes on a 4090 GPU » pour 5 s (480×832, 25 i/s) ; article : « half the memory and … tenfold increase in inference speed over … OmniAvatar » | **36** | ComfyUI 10 pas « 3x faster » (nœud tiers) |
| **LongCat-Video-Avatar 1.5** | non publiée ; exemples officiels sur **2 GPU** (`--nproc_per_node=2 --context_parallel_size=2`) ; `--use_int8` | — | — | **8 pas distillés (DMD2)** ; INT8 |
| **LatentSync** | **8 Go (1.5)**, **18 Go (1.6)** | — | — | DeepCache (cité dans la note précédente) |
| **MuseTalk 1.5** | 4 Go (3050 Ti portable fp16) | « 30fps+ » sur V100 ; 3050 Ti : 8 s en ≈ 5 min | ≈ 37 (3050 Ti) ; < 1 (V100) | — |
| **Hébergé WaveSpeed (InfiniteTalk Multi)** | — | « approximately 10–30 seconds of wall time per 1 second of video » | 10–30 | — |

Sources : [README InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk) ; mesure 20 min / 42 s / 13–16 Go — [aistudynow](https://aistudynow.com/infinitytalk-comfyui-workflow-wan-2-1-img2vid-vid2vid-multi-talk/) ; [README MultiTalk](https://github.com/MeiGen-AI/MultiTalk) ; [Replicate zsxkib/multitalk](https://replicate.com/zsxkib/multitalk) ; [fiche S2V](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B) ; [tutoriel S2V](https://docs.comfy.org/tutorials/video/wan/wan2-2-s2v) ; [README HuMo](https://github.com/Phantom-video/HuMo) ; [README OmniAvatar](https://github.com/Omni-Avatar/OmniAvatar) (« The model is tested on A800 ») ; [README FantasyTalking](https://github.com/Fantasy-AMAP/fantasy-talking) (« tested on a single A100 ») ; [README EchoMimic V3](https://github.com/antgroup/echomimic_v3) et [article EchoMimic V3](https://arxiv.org/html/2507.03905) ; [README EchoMimic V2](https://github.com/antgroup/echomimic_v2) ; [README StableAvatar](https://github.com/Francis-Rings/StableAvatar) et [article](https://arxiv.org/html/2508.08248) ; [fiche LongCat 1.5](https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5) ; [README LatentSync](https://github.com/bytedance/LatentSync) ; MuseTalk — [README](https://github.com/TMElyralab/MuseTalk) (chiffres 3050 Ti repris de la [note du 16/10/2026](../Outils%20animation%20fluide%20et%20rapide/generatif_video_lipsync_cartoon.md)) ; [WaveSpeed](https://wavespeed.ai/models/wavespeed-ai/infinitetalk/multi).

- GGUF : stable-diffusion.cpp (MIT) documente Wan2.1/2.2 (dont S2V) en GGUF mais sans chiffres de vitesse publiés ; Live Avatar (dérivé S2V, Apache-2.0) existe en GGUF : 5,81 s en 276 s sur RTX 5090 (≈ 47 s/s) — repris de la [note du 16/10/2026](../Outils%20animation%20fluide%20et%20rapide/generatif_video_lipsync_cartoon.md) (sources [HF Live-Avatar](https://huggingface.co/Quark-Vision/Live-Avatar), [audio-cpp/LiveAvatar-GGUF](https://huggingface.co/audio-cpp/LiveAvatar-GGUF)).
- CPU : aucun des README lus ne documente d'inférence CPU ; tous indiquent un GPU NVIDIA/CUDA (ex. Sonic : « An NVIDIA GPU with CUDA support is required ») — [README Sonic](https://github.com/jixiaozhong/Sonic).

### Inferences
- Volume : 1 000 vidéos × 60 s = 60 000 s de vidéo (calcul). À 10–36 s/s → **6,7 × 10⁵ à 2,2 × 10⁶ s ≈ 170 à 600 heures-GPU** (calcul). Un sketch d'une minute ≈ **10 à 36 min sur un GPU**, ou quelques minutes en répartissant ses 15–30 plans sur plusieurs GPU en parallèle (un plan = un travail indépendant), ce qui respecte la consigne « un film d'une minute en minutes ».
- Le conteneur actuel (CPU 4 cœurs, sans GPU) ne peut pas exécuter ces modèles ; il faut un GPU ≥ 16–24 Go (4090/5090/A100/L40S) loué ou possédé, ou l'option hébergée (§6).
- Pour la qualité, préférer **lightx2v (Apache) 4 pas** sur InfiniteTalk/MultiTalk (perte acceptée par les auteurs : mouvement et qualité visuelle, pas les lèvres) et éviter FusionX (dérive de couleur et d'identité signalée).

### Gaps
- Pas de mesure publique à étapes égales sur une **RTX 4090 nommée** pour InfiniteTalk/MultiTalk/LongCat 1.5 en 480p 4–8 pas → à mesurer (greffe en cours : banc chronométré de 10 plans 3 s, 480p puis 720p, sur un GPU loué à l'heure).
- VRAM minimale de LongCat-Video-Avatar 1.5 en mono-GPU (INT8) : non publiée.

---

## 5. ComfyUI : nœuds natifs (ComfyUI 0.41), flux officiels, noms des fichiers modèles ; nœuds tiers (Kijai) et licences

### Takeaway
**Confirmé dans le code de ComfyUI 0.41.0** : trois nœuds natifs — **`WanSoundImageToVideo`** (+ `WanSoundImageToVideoExtend`), **`WanHuMoImageToVideo`** (marqué expérimental) et **`WanInfiniteTalkToVideo`** (modes `single_speaker` / `two_speakers` avec `mask_1` / `mask_2`). Des flux officiels existent pour InfiniteTalk (`video_wan2_1_infinitetalk`) et S2V (`video_wan2_2_14B_s2v`). MultiTalk, FantasyTalking, HuMo-17B et OmniAvatar passent par le **ComfyUI-WanVideoWrapper de Kijai (Apache-2.0)** ; StableAvatar et EchoMimic par des nœuds tiers de smthemex. ComfyUI lui-même est **GPL-3.0**.

### Cited Findings
- Version : `version = "0.41.0"` dans `pyproject.toml` et `__version__ = "0.41.0"` dans `comfyui_version.py` (branche master lue le 16/10/2026) — [pyproject.toml](https://github.com/comfyanonymous/ComfyUI/blob/master/pyproject.toml).
- Nœuds (fichier `comfy_extras/nodes_wan.py`) — [nodes_wan.py](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy_extras/nodes_wan.py) :
  - `WanSoundImageToVideo` (catégorie `model/conditioning/wan/sound`) : entrées `width` 832, `height` 480, `length` défaut **77**, `batch_size`, `audio_encoder_output`, `ref_image`, **`control_video`** (pose), `ref_motion` ; + `WanSoundImageToVideoExtend`.
  - `WanHuMoImageToVideo` (catégorie `model/conditioning/wan/humo`) : `length` défaut **97**, `audio_encoder_output`, `ref_image` optionnels ; `is_experimental=True`.
  - `WanInfiniteTalkToVideo` (catégorie `model/conditioning/wan/infinite talk`) : `mode` = `single_speaker` | `two_speakers` (`audio_encoder_output_2`, `mask_1`, `mask_2`), `model_patch`, `length` défaut **81**, `start_image`, `audio_encoder_output_1`, `motion_frame_count` défaut 9 (1–33), `audio_scale`, `previous_frames` ; sortie `trim_image`.
  - Aucun nœud natif MultiTalk, LongCat, OmniAvatar, FantasyTalking, StableAvatar ou EchoMimic n'apparaît dans ce fichier (recherche par nom).
- **Flux InfiniteTalk officiel** (gabarit `video_wan2_1_infinitetalk.json`) — fichiers : `Wan2_1-I2V-14B-480p_fp8_e4m3fn_scaled_KJ.safetensors` (diffusion_models), `umt5_xxl_fp8_e4m3fn_scaled.safetensors` (text_encoders), **`wan2.1_infiniteTalk_single_fp16.safetensors` / `wan2.1_infiniteTalk_multi_fp16.safetensors`** (model_patches, chargés par `ModelPatchLoader`), **`wav2vec2-chinese-base_fp16.safetensors`** (audio_encoders), `Wan2_1_VAE_bf16.safetensors` (vae), `lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors` (loras) ; chaque groupe « Video Extend » ajoute « approximately 3.24 seconds (81 frames at 25 fps) » — [tutoriel InfiniteTalk](https://docs.comfy.org/tutorials/video/wan/wan-infinitetalk) ; le flux est publié sous Apache 2.0 selon la page [comfy.org workflows](https://comfy.org/workflows/video_wan2_1_infinitetalk-b95499a55c9f/) (résumé de recherche).
- **Flux S2V officiel** (gabarit `video_wan2_2_14B_s2v`) — fichiers : **`wan2.2_s2v_14B_fp8_scaled.safetensors`** ou **`wan2.2_s2v_14B_bf16.safetensors`**, `umt5_xxl_fp8_e4m3fn_scaled.safetensors`, **`wav2vec2_large_english_fp16.safetensors`** (via `AudioEncoderLoader`), `wan_2.1_vae.safetensors`, LoRA `wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors` ; réglages « With 4-step Lightning LoRA: steps: 4, cfg: 1.0 / Without …: steps: 20, cfg: 6.0 » ; « each extension will generate 77 / 16 = 4.8125 seconds » — [tutoriel S2V](https://docs.comfy.org/tutorials/video/wan/wan2-2-s2v) ; fichiers présents dans [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged).
- **HuMo natif** : « ComfyUI officially supports HuMo-1.7B » (17/09/2025) — [README HuMo](https://github.com/Phantom-video/HuMo) (lien vers [blog.comfy.org](https://blog.comfy.org/p/humo-and-chroma1-radiance-support)) ; fichiers du dépôt [Comfy-Org/HuMo_ComfyUI](https://huggingface.co/Comfy-Org/HuMo_ComfyUI) : `humo_17B_fp16.safetensors`, **`humo_17B_fp8_e4m3fn.safetensors`**, `humo_1.7B_fp16.safetensors`, **`whisper_large_v3_fp16.safetensors`** (audio_encoders).
- **Wrapper Kijai** (Apache-2.0) : MultiTalk (« thank kijai for integrating MultiTalk into ComfyUI-WanVideoWrapper »), InfiniteTalk, HuMo-17B (« can be run on a NVIDIA 3090 GPU »), FantasyTalking (« merged to ComfyUI-Wan ») — [README MultiTalk](https://github.com/MeiGen-AI/MultiTalk), [README InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk), [README HuMo](https://github.com/Phantom-video/HuMo), [README FantasyTalking](https://github.com/Fantasy-AMAP/fantasy-talking), [LICENSE Kijai](https://github.com/kijai/ComfyUI-WanVideoWrapper/blob/main/LICENSE).
- Nœuds tiers : StableAvatar — [smthemex/ComfyUI_StableAvatar](https://github.com/smthemex/ComfyUI_StableAvatar) ; EchoMimic V2/V3 — [smthemex/ComfyUI_EchoMimic](https://github.com/smthemex/ComfyUI_EchoMimic) (cités par les README officiels).
- Licence de ComfyUI : GPL-3.0 — [LICENSE](https://github.com/comfyanonymous/ComfyUI/blob/master/LICENSE).

### Inferences
- Le flux natif InfiniteTalk « two_speakers » correspond directement à notre plan « locuteur + écouteur » : masque du locuteur + sa voix, masque de l'écouteur + piste silencieuse.
- ComfyUI peut servir de **banc d'essai rapide** (outil externe), mais le moteur maison doit appeler les scripts officiels Apache/MIT pour rester dans la règle.

### Gaps
- Nom exact du gabarit HuMo dans la bibliothèque de modèles ComfyUI : non relu (seuls les fichiers du dépôt Comfy-Org/HuMo_ComfyUI et l'annonce sont attestés).
- Licences des nœuds smthemex : non lues.

---

## 6. Offres hébergées (prix par seconde : RunComfy, Atlas Cloud, WaveSpeed, fal, Replicate) et démos gratuites anonymes qui fonctionnent

### Takeaway
Le moins cher relevé pour InfiniteTalk est **RunComfy ≈ 0,017 $/s** (résumé de recherche, à confirmer) puis **WaveSpeed 0,03 $/s en 480p / 0,06 $/s en 720p** (page lue) ; **fal InfiniteTalk 0,20 $/s** et **fal Wan2.2-S2V 0,10–0,20 $/s** sont 6 à 12 fois plus chers ; **Replicate MultiTalk ≈ 0,59 $ par exécution** (≤ 15 s, H100). Pour 1 000 sketchs d'une minute : **≈ 1 000 à 3 600 $** chez RunComfy/WaveSpeed, **6 000 à 24 000 $** chez fal — ce qui contredit la contrainte « sans paiement à la génération ». **Aucune démo gratuite anonyme fiable** : les Spaces utiles tournent sur ZeroGPU (quota anonyme nul) ou sans GPU.

### Cited Findings

**Tableau 6 — prix (lus ou relevés le 16/10/2026)**

| Hébergeur / modèle | Prix | Conditions | Source |
|---|---|---|---|
| **WaveSpeed InfiniteTalk Multi** | **0,03 $/s (480p) ; 0,06 $/s (720p)** ; « starts at $0.15 per run » | minimum facturé 3 s ; plafond 600 s ; 2 personnes, `left_audio` / `right_audio`, `order` ; « 10–30 seconds of wall time per 1 second of video » | [WaveSpeed](https://wavespeed.ai/models/wavespeed-ai/infinitetalk/multi) |
| WaveSpeed InfiniteTalk Fast V2V Multi | 0,015 $/s (min 5 s = 0,075 $) | vidéo → vidéo | [blog WaveSpeed](https://wavespeed.ai/blog/id/posts/introducing-wavespeed-ai-infinitetalk-fast-video-to-video-multi-on-wavespeedai/) (résumé de recherche) |
| **RunComfy InfiniteTalk Fast / Multi-Person** | **0,017 $/s** | multi : pistes gauche/droite + ordre `meanwhile` / `left_right` / `right_left` | [RunComfy multi](https://www.runcomfy.com/es/models/community/infinite-talk/fast/multi) (résumé de recherche, page non relue) |
| RunComfy InfiniteTalk image-to-video | 0,08 $/s (« 1 second equals 25 frames ») | — | [RunComfy i2v](https://www.runcomfy.com/ko/models/community/infinite-talk/image-to-video) (résumé de recherche) |
| **fal InfiniteTalk** | **0,20 $/s** ; « For 720p price will be doubled » | — | [fal InfiniteTalk](https://fal.ai/models/fal-ai/infinitalk) (lu le 16/10/2026 dans la note précédente) |
| fal InfiniteTalk « single-text » | prix non affiché sur la page API ; `num_frames` 41–721 (défaut 145), voix TTS intégrées (20 voix anglaises) | — | [fal API](https://fal.ai/models/fal-ai/infinitalk/single-text/api) |
| **fal Wan2.2-S2V 14B** | **0,10 / 0,15 / 0,20 $/s** (480/580/720p) | « secondes comptées à 16 i/s » | [fal S2V](https://fal.ai/models/fal-ai/wan/v2.2-14b/speech-to-video) (note précédente) |
| **Replicate MultiTalk** (zsxkib) | **« approximately $0.59 to run »** | H100 ; « typically complete within 7 minutes » ; jusqu'à 15 s | [Replicate](https://replicate.com/zsxkib/multitalk) |
| Atlas Cloud | **aucun prix trouvé** pour InfiniteTalk, S2V ou HuMo (seuls Wan 2.2 Turbo 0,02 $/s, Wan 2.7 0,10 $/s dans des billets marketing) | — | [Atlas Cloud blog](https://www.atlascloud.ai/it/blog/guides/cheapest-api-provider-seedance-kling-wan) (résumé de recherche) |

**Démos gratuites (état lu via l'API HF le 16/10/2026)** :

| Space | État | Matériel | Utilisable sans compte ? |
|---|---|---|---|
| [Wan-AI/Wan2.2-S2V](https://huggingface.co/spaces/Wan-AI/Wan2.2-S2V) | RUNNING | cpu-basic (calcul délégué au service Alibaba) | file mesurée le 16/10/2026 : **rang 604, attente ≈ 20 h** ([journal veille-permanente](../../.claude/skills/veille-permanente/SKILL.md)) |
| [victor/LongCat-Video-Avatar-1.5](https://huggingface.co/spaces/victor/LongCat-Video-Avatar-1.5) | RUNNING | zero-a10g (329 j'aime) | ZeroGPU → quota anonyme nul selon notre mesure du 16/10/2026 |
| [acvlab/FantasyTalking](https://huggingface.co/spaces/acvlab/FantasyTalking) | RUNNING | zero-a10g | idem |
| [fffiloni/LatentSync](https://huggingface.co/spaces/fffiloni/LatentSync) | RUNNING | zero-a10g | idem (et poids OpenRAIL++) |
| [fffiloni/Meigen-MultiTalk](https://huggingface.co/spaces/fffiloni/Meigen-MultiTalk) | RUNNING | **cpu-basic** (pas de GPU) | Space public sans carte graphique (journal du 16/10/2026) ; génération non testée aujourd'hui |
| [alexnasa/HuMo_local](https://huggingface.co/spaces/alexnasa/HuMo_local) | PAUSED | — | non |
| [YinmingHuang/StableAvatar](https://huggingface.co/spaces/YinmingHuang/StableAvatar) | RUNTIME_ERROR | — | non (README : « accessible to Hugging Face Pro users only ») |
| [TMElyralab/MuseTalk](https://huggingface.co/spaces/TMElyralab/MuseTalk) | RUNTIME_ERROR | — | non |

- « ZeroGPU anonyme = 0 » et Spaces MultiTalk/InfiniteTalk « publics sans carte graphique » : mesure consignée le 16/10/2026 dans le [journal veille-permanente](../../.claude/skills/veille-permanente/SKILL.md).
- HuMo : « OpenBayes provides 3 hours of free GPU computation for testing the 1.7B and 17B models » (annonce du 15/10/2025, offre non revérifiée aujourd'hui) — [README HuMo](https://github.com/Phantom-video/HuMo).

### Inferences
- Coût d'un volume de 60 000 s (1 000 × 60 s ; calculs faits ici) : RunComfy 0,017 $/s → **1 020 $** ; WaveSpeed 480p → **1 800 $**, 720p → **3 600 $** ; fal S2V 480p → 6 000 $ ; fal InfiniteTalk 480p → 12 000 $ (720p 24 000 $) ; Replicate MultiTalk à 15–30 plans par sketch × 0,59 $ → **8 850 à 17 700 $**.
- La contrainte « ni abonnement ni paiement à la génération » impose un **GPU local ou loué à l'heure** avec les poids ouverts ; l'hébergé ne sert que de **secours ponctuel** ou de point de comparaison qualité.

### Gaps
- Pages RunComfy et Atlas Cloud non relues directement (prix issus de résumés de recherche) → à confirmer avant tout usage.
- Aucun hébergeur trouvé pour **LongCat-Video-Avatar 1.5** avec prix publié.

---

## 7. Verdict et classement pour nos sketchs dialogués (Pixar-like, 2–3 personnages africains, français, 2–4 s par réplique, 1 000 vidéos, sans frais à la génération)

### Takeaway
**1) InfiniteTalk** (Apache, natif ComfyUI, Sync-C dans le peloton de tête et étude utilisateur favorable face au doublage, deux locuteurs avec masques, I2V qui part de notre image) est le choix de production immédiat ; **2) LongCat-Video-Avatar 1.5** (MIT, Whisper multilingue, boîtes « others » muettes pour un 3e personnage, 8 pas, anime revendiqué) est le challenger à mesurer en A/B, potentiellement n° 1 pour les scènes à 3 et le français ; **3) MultiTalk** en repli ; **4) Wan2.2-S2V** pour les gros plans à un seul personnage ; **MuseTalk (MIT)** en passe corrective de lèvres. À exclure par licence : Sonic, Hallo3, LatentSync, EchoMimic V2.

### Cited Findings
- InfiniteTalk : Apache-2.0 code + poids, composants Apache/MIT (§1) ; Sync-C 9,18 / 7,41 / 8,34 sur HDTF / CelebV-HQ / EMTD, meilleur du tableau I2V de son article ; rang moyen 1,11 (lèvres) et 1,09 (corps) dans son étude utilisateur contre LatentSync/MuseTalk — [article InfiniteTalk](https://arxiv.org/html/2508.14033) ; nœud natif `WanInfiniteTalkToVideo` à deux locuteurs — [nodes_wan.py](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy_extras/nodes_wan.py) ; hébergé dès 0,03 $/s — [WaveSpeed](https://wavespeed.ai/models/wavespeed-ai/infinitetalk/multi).
- LongCat 1.5 : MIT ; Whisper-large-v3 ; « anime, animals … multi-person interactions » ; 8 pas DMD2 ; INT8 — [fiche HF](https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5) ; boîtes `others` avec audio silencieux — [script multi](https://github.com/meituan-longcat/LongCat-Video/blob/main/run_demo_avatar_multi_audio_to_video.py).
- MultiTalk : « cartoon character » ; 2 locuteurs + `bbox` ; mais InfiniteTalk « Reduces hand/body distortions compared to MultiTalk » et « superior lip synchronization to MultiTalk » — [README MultiTalk](https://github.com/MeiGen-AI/MultiTalk), [README InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk).
- Wan2.2-S2V : Apache ; une piste audio ; FID 15,66 et CSIM 0,677 meilleurs de son banc, Sync-C 4,51 ; 16 i/s ; ≥ 80 Go en mono-GPU officiel — [article Wan-S2V](https://arxiv.org/html/2508.18621), [fiche HF](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B).
- HuMo : Apache ; Whisper ; meilleure esthétique/suivi du texte de son banc ; modèle « référence → vidéo » ; 97 images — [README](https://github.com/Phantom-video/HuMo), [article](https://arxiv.org/html/2509.08519).
- StableAvatar : MIT ; 1.3B ; 18 Go ; 5 s en 3 min sur 4090 ; cartoon démontré ; une piste audio — [README](https://github.com/Francis-Rings/StableAvatar), [article](https://arxiv.org/html/2508.08248).
- OmniAvatar 14B : Apache ; Sync-C ≈ MultiTalk sur HDTF ; 480p seulement ; 8 Go possible — [README](https://github.com/Omni-Avatar/OmniAvatar), [article](https://arxiv.org/html/2506.18866).
- FantasyTalking : Apache ; parmi les plus bas en Sync-C dans six articles tiers (§3).
- Nuance sur InfiniteTalk/MultiTalk : leur avance en Sync-C est mesurée dans les articles de leur équipe ; dans les articles tiers, MultiTalk est à égalité ou derrière OmniAvatar et derrière StableAvatar (§3, tableaux 3d–3e).
- EchoMimic V3 : Apache ; 1.3B ; 12 Go ; une piste — [README](https://github.com/antgroup/echomimic_v3).
- MuseTalk : MIT, « available for any purpose, even commercially », bouche seule — [README](https://github.com/TMElyralab/MuseTalk).
- Exclus : Sonic « non-commercial » ; Hallo3 (CogVideoX + InsightFace) ; LatentSync (OpenRAIL++ + InsightFace) ; EchoMimic V2 (« academic research », poids sans licence, pose obligatoire) — sources §1.

**Tableau 7 — classement pour notre cas (jugement fondé sur §1–§6)**

| Rang | Outil | Pourquoi | Rôle dans la chaîne |
|---|---|---|---|
| 1 | **InfiniteTalk** (patch single / multi) | licences propres ; Sync-C dans le peloton de tête (meilleur de son article) ; 2 locuteurs + masques ; image de départ conservée ; ComfyUI natif ; lightx2v 4 pas | plan standard « une réplique » (seul ou à deux) |
| 2 | **LongCat-Video-Avatar 1.5** | MIT ; Whisper (français a priori mieux couvert) ; 3e personnage muet natif ; 8 pas ; anime revendiqué | challenger A/B ; scènes à 3 personnages |
| 3 | **MultiTalk** | même pile, 2 locuteurs + `bbox`, « cartoon » revendiqué ; plus de déformations de mains | repli |
| 4 | **Wan2.2-S2V-14B** | meilleure qualité d'image/identité de son banc ; pose optionnelle ; mais 1 seule voix, 16 i/s, 80 Go | gros plans d'un seul personnage, plans « cinéma » |
| 5 | **StableAvatar** | MIT, léger (1.3B, 18 Go), rapide, cartoon montré ; une seule voix | gros plans rapides à un personnage |
| 6 | **HuMo-17B** | qualité visuelle et suivi du texte ; Whisper ; mais régénère le décor | plans où l'on accepte un nouveau décor |
| 7 | **OmniAvatar-14B** | Apache, 8 Go possible ; 480p seulement | réserve |
| 8 | **EchoMimic V3** | Apache, 12 Go ; peu de preuves comparatives | réserve basse VRAM |
| 9 | **FantasyTalking** | Apache mais Sync-C parmi les plus bas dans tous les articles tiers | non recommandé |
| — | **MuseTalk 1.5** (vidéo → vidéo) | MIT, commercial ; bouche seule, 256×256 | passe corrective : refaire seulement les lèvres d'un plan raté |
| exclu | Sonic, Hallo3, LatentSync, EchoMimic V2 | licences [NC] / [MAISON] / [RECH] | — |

### Inferences
- **Innovation proposée (combiner veille + moteur maison)** — « plan dialogue à pistes séparées » : pour chaque réplique, notre moteur (qui connaît déjà qui parle, les positions des personnages et la durée de la voix) produit automatiquement (a) la piste du locuteur, (b) une **piste silencieuse** pour chaque écouteur, (c) les **boîtes/masques** de chaque personnage par notre détection, (d) un prompt de réaction de l'écouteur (« regarde X, hoche la tête, sourit »), puis envoie le tout à InfiniteTalk `two_speakers` ou LongCat 1.5 (`bbox` + `others`). **Critères d'acceptation testables** : Sync-C du locuteur ≥ celui obtenu en plan seul ; ouverture de bouche de l'écouteur (repères faciaux) sous un seuil fixé sur nos plans de référence ; SSIM du décor hors masques ≥ seuil ; similarité d'identité de chaque visage ≥ seuil ; sinon re-génération (autre graine) puis passe MuseTalk sur le seul locuteur.
- **Pré/post-roll** : ajouter 0,2–0,3 s de silence avant/après la réplique et couper ensuite, pour que le plan commence bouche fermée et raccorde au plan suivant (déduit du fonctionnement par blocs ; à valider par mesure).
- **Voix** : MultiTalk documente un écart entre voix réelle et voix synthétique ; prévoir des voix TTS françaises expressives et mesurer l'effet sur l'expressivité.
- **Conformité** : exécuter les scripts officiels Apache/MIT dans notre moteur ; garder ComfyUI (GPL) comme banc externe uniquement.

### Gaps
- Aucun test sur nos images Pixar-like africaines ni sur voix françaises synthétiques : le classement 1/2 entre InfiniteTalk et LongCat 1.5 reste à trancher par mesure (greffe en cours : banc A/B de 20 répliques, 10 à deux personnages et 10 à trois, mêmes images et mêmes voix, métriques ci-dessus + revue à l'œil, sur un GPU loué à l'heure).
- Exigences matérielles mono-GPU de LongCat 1.5 non publiées ; à mesurer pendant le même banc.
