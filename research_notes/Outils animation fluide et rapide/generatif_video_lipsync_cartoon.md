# IA générative pour faire BOUGER et PARLER (lip-sync français) des personnages cartoon DESSINÉS à partir d'une image clé du moteur — état au 16/10/2026

Périmètre : « passe de finition » sur des plans choisis d'un film MASSAMBA (2.5D, illustrations peintes, 576×1024 vertical,
voix françaises) : (a) image → vidéo avec 1re/dernière image, (b) animation guidée par pose / vidéo pilote,
(c) lip-sync / tête parlante pilotée par l'audio sur visages STYLISÉS, (d) intervalles (in-betweening) entre deux dessins clés.

Méthode et provenance :
- **Repartir de la dernière veille** (14–16/10/2026) : licences déjà lues sur les LICENSE/fiches HF officielles dans
  `research_notes/Animer Blender par prompt/animation_personnages_dessines.md`, `modeles_video_ouverts_pilotes.md`,
  `api_video_paiement_usage.md`, `calcul_gpu_gratuit.md` ; ces notes sont citées avec leurs sources d'origine.
- **Lu en direct le 16/10/2026** : catalogue vidéo Pollinations (`GET https://gen.pollinations.ai/video/models`, 22 modèles),
  catalogue vidéo OpenRouter (`GET https://openrouter.ai/api/v1/videos/models`, 30 modèles), métadonnées de licence de
  ~25 fiches Hugging Face (`huggingface.co/api/models/…`), textes LICENSE (Tencent, Stability, FramePack, ToonCrafter),
  pages modèles fal.ai, documentation sync.so.
- **Mesuré dans le conteneur le 16/10/2026** (4 cœurs Intel Xeon 2,10 GHz, sans GPU) : RIFE 4.9 en ONNX (onnxruntime 1.31).
- Règle maison : code/poids exécutés chez nous = MIT, Apache-2.0 ou BSD seulement. Drapeaux : **[NC]** non commercial,
  **[RECH]** recherche seulement, **[TERR]** territoires exclus, **[CA]** plafond de chiffre d'affaires / d'audience,
  **[MAISON]** licence maison non MIT/Apache/BSD.

---

## 1. Modèles à poids ouverts 2025-2026 (a, b, c, d) : licences exactes, matériel, vitesse, cartoon, défauts connus

### Takeaway
Sous licence compatible avec la règle maison, la boîte à outils complète existe : **Wan 2.1/2.2 (FLF2V 1re+dernière image,
I2V, TI2V-5B, Animate-14B, S2V-14B) = Apache-2.0**, **Wan-Animate-2 / One-to-All / SteadyDancer = Apache-2.0**,
**SCAIL-2 = code Apache / poids MIT**, **MultiTalk / InfiniteTalk / EchoMimic V3 / FantasyTalking = Apache-2.0**,
**LongCat-Video-Avatar 1.5 / StableAvatar / ToonComposer = MIT**, **MuseTalk = MIT (code ET poids, usage commercial
explicitement permis)**. Pièges nouveaux relevés aujourd'hui : **les poids LatentSync 1.6 sont sous OpenRAIL++ (pas
Apache)**, **les poids FramePack n'ont aucune licence déclarée et dérivent de HunyuanVideo**, toute la famille
**Hunyuan (Video-I2V, 1.5, Custom, Avatar) exclut UE / Royaume-Uni / Corée du Sud**, **SVD = Stability Community
License (gratuit < 1 M$ de CA)**, **LTX-2 = licence communautaire (licence payante ≥ 10 M$ de CA)**. Tous ces modèles
exigent un GPU (≈ 4–80 Go) et produisent de l'ordre de **0,5 à 2 s de vidéo par minute de calcul** sur une RTX 4090
(jusqu'à ≈ 4 s/min en distillé 4 pas), donc un film d'une minute = 30 min à 2 h de GPU.

### Cited Findings

**Tableau 1 — poids ouverts : licence, matériel, vitesse, cartoon, défauts** (« s/min » = secondes de vidéo produites par
minute de calcul, calcul fait ici à partir du chiffre publié cité)

| Famille | Modèle | Code / poids (licence) | Commercial ? | VRAM min publiée | Vitesse publiée → s vidéo / min de calcul | Durée max | Cartoon / stylisé (affirmation) | Défauts connus |
|---|---|---|---|---|---|---|---|---|
| (a) | **Wan2.1-FLF2V-14B-720P** (1re + dernière image) | Apache-2.0 (code vérifié, poids `apache-2.0` HF) | oui | 14B : « ≥ 80 Go » en commande de base (A14B Wan2.2) | non publiée pour FLF2V | ≈ 5 s (81 images) | non revendiqué | — |
| (a) | **Wan2.2 I2V-A14B / TI2V-5B** | Apache-2.0 (HF lu 16/10) | oui | TI2V-5B : 24 Go (4090, offload) | 5 s 720p « under 9 minutes » → ≈ 0,56 s/min | 5 s | non revendiqué | — |
| (a) | **Wan2.1 1.3B (T2V / VACE)** | Apache-2.0 | oui | 8,19 Go | 4090 : 261,4 s pour 5 s 480p → ≈ 1,15 s/min | 5 s | — | — |
| (a) | **Wan2.2-Fun (fp8) + LoRA 4 pas** | Apache-2.0 (VideoX-Fun) | oui | 24 Go (83–89 % d'une 4090D) | 81 images en ≈ 520 s → ≈ 0,58 s/min ; 4 pas 79–138 s → ≈ 2,2–3,8 s/min | 81 images | — | « the acceleration with LoRA is significant but the video dynamic is lost » |
| (a) | **FramePack / FramePack-F1** | code Apache-2.0 (LICENSE lu) ; **poids sans licence déclarée** (HF) et dérivés de HunyuanVideo → **[MAISON][TERR] par héritage probable** | à éviter | 6 Go | 4090 : 2,5 s/image (1,5 s TeaCache) à 30 i/s → 0,8 (1,3) s/min | jusqu'à ~1 min | — | — |
| (a) | **LTX-2 / 2.3 / 2.5** | **[MAISON][CA]** « LTX-2 Community License » : licence payante dès 10 M$ de CA annuel | oui sous le seuil, hors règle maison | non officielle | non officielle | — | — | — |
| (a) | **HunyuanVideo-I2V, HunyuanVideo 1.5, HunyuanCustom** | **[TERR][CA]** « THIS LICENSE AGREEMENT DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA » + licence à demander au-delà de 100 M d'utilisateurs actifs mensuels | hors règle | — | — | — | — | — |
| (a) | **SkyReels V2 / V3** | **[MAISON]** « Skywork Community License » (PDF) ; « The Skywork model supports commercial use » sous conditions | hors règle | multi-GPU / offload | — | V3 V2V jusqu'à 30 s | — | — |
| (a) | **MAGI-1** / **Mochi 1** | Apache-2.0 (HF lu 16/10) | oui | MAGI-2 : 8 GPU Hopper | — | — | — | Mochi : pas de contrôle image natif |
| (a) | **CogVideoX-2B** / **5B** | 2B Apache-2.0 ; **5B [MAISON][CA]** (commercial sur inscription, ≤ 1 M visites/mois) | 2B oui | — | — | 49 images à 8 i/s | — | — |
| (a) | **Stable Video Diffusion (XT, 1.1)** | **[MAISON][CA]** « Stability AI Community License » (05/07/2024) : gratuit si CA < 1 M$ | hors règle | — | — | 25 images | — | — |
| (b) | **Wan2.2-Animate-14B** (animation + remplacement) | Apache-2.0 ; prétraitement : YOLOv10 **AGPL-3.0**, option FLUX Kontext **[NC]** | oui sans `use_flux` et avec un autre détecteur | ≥ 80 Go (base) ; ZeroGPU 150 s réservées / 5 s | — | — | squelette prévu aussi pour non-humanoïdes | proportions différentes → « artifacts or deformations » ; masque « single-person videos ONLY » |
| (b) | **Wan-Animate-2 (14B, 08/2026)** | Apache-2.0 | oui | 2× A800 (480p) | — | — | exemple officiel = chatte anthropomorphe | aucun banc cartoon indépendant |
| (b) | **SCAIL-2** | code Apache-2.0 / poids MIT ; SAM3 (licence maison) dans le prétraitement | oui (sans SAM3) | — | — | 512p / 704p | SCAIL-1 : « can generalize towards many complex anime characters » | — |
| (b) | **One-to-All 1.3B / 14B** | Apache-2.0 | oui | T4 16 Go (1.3B) | T4 Kaggle : 10 s en 11 min → ≈ 0,9 s/min | — | « self-collected cartoon data », « alignment-free » | — |
| (b) | **Animate-X** | code Apache-2.0 ; **poids sans licence** sur HF | incertain | — | — | — | « anthropomorphic characters » | — |
| (b) | **UniAnimate-DiT** | **aucun LICENSE** ; README « academic research » ; poids MIT | incertain | 23 Go (480p) | — | 81 images | — | — |
| (b) | **StableAnimator** | MIT/Apache (incohérence dépôt/HF) ; dépend d'**InsightFace antelopev2** | à vérifier | — | — | — | — | — |
| (b) | **MimicMotion / MusePose / MultiAnimate** | poids **[RECH]/[NC]** | non | — | — | — | — | — |
| (b) | **HumanDiT / Animate Anyone 2 / DreamActor-M1 / OmniHuman** | pas de code (HumanDiT, AA2) ; DreamActor / OmniHuman = ByteDance, API seulement | — | — | — | — | OmniHuman : voir §2 | — |
| (c) | **MultiTalk / InfiniteTalk** | Apache-2.0 (code + poids) | oui | 8 Go via Wan2GP (licence maison du runtime) ; 480p sur une 4090 | — | MultiTalk 15 s ; InfiniteTalk 40 s par défaut, « illimité » | MultiTalk : « cartoon character and singing », multi-personnes | moins de pas : lèvres OK mais mouvement/qualité dégradés |
| (c) | **LongCat-Video-Avatar 1.5** | MIT | oui | exemples sur 2 GPU | — | — | « anime, animals … multi-person » | — |
| (c) | **Wan2.2-S2V-14B** | Apache-2.0 | oui | ≥ 80 Go mono-GPU | Live Avatar (base S2V, GGUF) : 5,81 s en 276 s sur 5090 → ≈ 1,26 s/min | — | Live Avatar : « Strong generalization across cartoon characters » | — |
| (c) | **EchoMimic V3 (1,3B)** | Apache-2.0 | oui | 12 Go | — | — | pas de mention cartoon | — |
| (c) | **EchoMimic V2** | Apache-2.0 ; README « academic research » ; poids sans licence | incertain | — | A100 : 120 images en ≈ 50 s | — | — | — |
| (c) | **FantasyTalking / OmniAvatar / HuMo** | Apache-2.0 | oui | 5 Go (42,6 s/it) / 8 Go / 32 Go (HuMo 1.7B : 480p en 8 min) | — | — | — | — |
| (c) | **StableAvatar** | MIT | oui | 18 Go | 4090 : 5 s en 3 min → ≈ 1,7 s/min | — | — | — |
| (c) | **MuseTalk 1.5** (redoublage vidéo) | **MIT code ; poids « available for any purpose, even commercially »** ; HF `mit` (maj 22/09/2026) | oui | 4 Go (3050 Ti portable fp16) | « 30fps+ » sur V100 (temps réel) ; 3050 Ti : 8 s en ≈ 5 min → 1,6 s/min | — | aucune mention | visage 256×256 (flou), moustache / forme et couleur des lèvres mal gardées, scintillement image par image |
| (c) | **LatentSync 1.6** (redoublage vidéo) | code Apache-2.0 ; **poids `openrail++`** (fiche HF) → **[MAISON]** (OpenRAIL à restrictions d'usage) | oui sous conditions, hors règle stricte | 18 Go (1.6) ; 8 Go (1.5) | non publiée | — | démo avec clips anime (crédités VASA-1) | guidance élevée → « distortion or jitter » ; pipeline d'alignement InsightFace |
| (c) | **LivePortrait** | MIT (code + poids, registre maison) ; détecteur InsightFace de la démo **[NC]** remplacé chez nous | oui (sans InsightFace) | — | **mesuré chez nous** : 7,9 s/image sur CPU 4 cœurs ; ≈ 30 i/s sur RTX 3090 (FasterLivePortrait) | — | utilisé sur nos dessins (registre) | — |
| (c) | **Hallo3** | code MIT ; fiche HF dit `mit` (maj 31/07/2026) **mais** modèle dérivé de CogVideoX-5B-I2V (licence CogVideoX) → contradiction | hors règle par prudence | — | — | — | — | — |
| (c) | **Sonic / HunyuanVideo-Avatar** | **[NC]** CC BY-NC-SA / **[TERR]** Tencent | non | — | — | — | Hunyuan-Avatar : « multi-style avatars » | — |
| (d) | **ToonCrafter** | LICENSE Apache-2.0 (lu 16/10) ; **fiche HF sans licence**, README « research exploration, instead of commercial products » | ambigu | 12 Go (fp16) | non publiée | 16 images 512×320 (≈ 2 s) | conçu pour le cartoon | « unstable motion and incoherent content to input frames » (article tiers) |
| (d) | **ToonComposer (Tencent ARC, ICLR 2026)** | MIT (code hors composants tiers ; HF `mit`, maj 05/03/2026) | oui | — | — | — | intervalles + colorisation en une passe | non mesuré |
| (d) | **AniDoc** | badge Apache (pas de LICENSE) ; poids MIT | oui (avec réserve) | 14 Go | — | 14 images | colorisation de croquis | — |
| (d) | **LayerAnimate (Wan2.1 1.3B)** | code Apache-2.0 / poids MIT | oui | — | — | 81 images 480×832 | contrôle par calques | — |
| (d) | **RIFE 4.x (interpolation optique, non générative)** | MIT (dépôts HF `mit` : TensorForger, daydreamlive) | oui | CPU suffit | **mesuré chez nous** : 0,99 s / image intermédiaire en 576×1024, 0,30 s en 288×512 → doubler 12→24 i/s = ≈ 5 s (16,7 s en demi-résolution) de vidéo par minute de CPU | — | — | **mesuré** : grand geste → membre qui disparaît (voir §4) |

Sources du tableau 1 :
- Wan FLF2V / I2V / TI2V / 1.3B / Animate / S2V : [HF Wan2.1-FLF2V-14B-720P](https://huggingface.co/Wan-AI/Wan2.1-FLF2V-14B-720P), [HF Wan2.2-I2V-A14B](https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B), [HF Wan2.2-TI2V-5B](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B) (licences lues via l'API HF le 16/10/2026) ; « at least 80GB VRAM », « under 9 minutes » — [README Wan2.2](https://github.com/Wan-Video/Wan2.2) ; 261,4 s / 8,19 Go — [HF Wan2.1-VACE-1.3B](https://huggingface.co/Wan-AI/Wan2.1-VACE-1.3B) ; guide Animate (proportions, mono-personne, YOLOv10, FLUX) — [UserGuider](https://github.com/Wan-Video/Wan2.2/blob/main/wan/modules/animate/preprocess/UserGuider.md), [YOLOv10 LICENSE](https://github.com/THU-MIG/yolov10/blob/main/LICENSE) ; S2V ≥ 80 Go — [HF Wan2.2-S2V-14B](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B) (relevés dans la note du 14/10/2026 `animation_personnages_dessines.md`).
- Wan2.2-Fun timings — [docs ComfyUI Wan2.2 Fun Inp](https://docs.comfy.org/tutorials/video/wan/wan2-2-fun-inp).
- FramePack : code Apache-2.0 — [LICENSE](https://github.com/lllyasviel/FramePack/blob/main/LICENSE) (lu le 16/10/2026) ; poids sans licence — [HF FramePackI2V_HY](https://huggingface.co/lllyasviel/FramePackI2V_HY), [HF FramePack_F1](https://huggingface.co/lllyasviel/FramePack_F1_I2V_HY_20250503) (API HF, `license` vide) ; 6 Go, 2,5 / 1,5 s par image — [README FramePack](https://github.com/lllyasviel/FramePack).
- LTX-2 : « Entities with annual revenues of at least $10,000,000 … are required to obtain a paid commercial license » — [LICENSE-2_x](https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x) ; étiquette HF `ltx-2-community-license-agreement` — [HF Lightricks/LTX-2](https://huggingface.co/Lightricks/LTX-2).
- Tencent (texte lu le 16/10/2026) : [HunyuanVideo-1.5 LICENSE](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5/blob/master/LICENSE), [HunyuanCustom LICENSE](https://github.com/Tencent-Hunyuan/HunyuanCustom/blob/main/LICENSE), [HunyuanVideo-I2V LICENSE.txt](https://github.com/Tencent-Hunyuan/HunyuanVideo-I2V/blob/main/LICENSE.txt), [HunyuanVideo-Avatar LICENSE](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar/blob/main/LICENSE).
- SkyReels : [HF SkyReels-V2-I2V LICENSE](https://huggingface.co/Skywork/SkyReels-V2-I2V-14B-540P/blob/main/LICENSE) ; MAGI-1 / Mochi : [HF sand-ai/MAGI-1](https://huggingface.co/sand-ai/MAGI-1), [HF genmo/mochi-1-preview](https://huggingface.co/genmo/mochi-1-preview) ; CogVideoX : [LICENSE 2b](https://huggingface.co/zai-org/CogVideoX-2b/blob/main/LICENSE), [LICENSE 5b](https://huggingface.co/zai-org/CogVideoX-5b/blob/main/LICENSE).
- SVD : « preserves free access to the Models for people or organizations generating annual revenue of less than US $1,000,000 » — [LICENSE.md SVD-XT](https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/blob/main/LICENSE.md).
- Animation par pose (Wan-Animate-2, SCAIL-2, One-to-All, Animate-X, UniAnimate-DiT, StableAnimator, MimicMotion, MusePose, MultiAnimate, HumanDiT, Animate Anyone 2) : licences lues le 14/10/2026 — [HF Wan2.2-Animate-2-14B](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B), [README SCAIL-2](https://github.com/zai-org/SCAIL-2), [README SCAIL](https://github.com/zai-org/SCAIL), [README One-to-All](https://github.com/ssj9596/One-to-All-Animation), [README Animate-X](https://github.com/antgroup/animate-x), [HF UniAnimate-DiT](https://huggingface.co/ZheWang123/UniAnimate-DiT), [StableAnimator](https://github.com/Francis-Rings/StableAnimator), [MimicMotion poids](https://huggingface.co/tencent/MimicMotion/blob/main/LICENSE), [MusePose](https://github.com/TMElyralab/MusePose), [MultiAnimate](https://github.com/hyc001/MultiAnimate), [arXiv HumanDiT](https://arxiv.org/abs/2502.04847), [Animate Anyone 2](https://github.com/HumanAIGC/animate-anyone-2).
- Voix → vidéo : [README MultiTalk](https://github.com/MeiGen-AI/MultiTalk), [README InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk), [HF LongCat-Video-Avatar-1.5](https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5), [HF Live-Avatar](https://huggingface.co/Quark-Vision/Live-Avatar), [HF audio-cpp/LiveAvatar-GGUF](https://huggingface.co/audio-cpp/LiveAvatar-GGUF), [README EchoMimic v3](https://github.com/antgroup/echomimic_v3), [HF EchoMimicV2](https://huggingface.co/BadToBest/EchoMimicV2), [README FantasyTalking](https://github.com/Fantasy-AMAP/fantasy-talking), [README OmniAvatar](https://github.com/Omni-Avatar/OmniAvatar), [README HuMo](https://github.com/Phantom-video/HuMo), [README StableAvatar](https://github.com/Francis-Rings/StableAvatar), [Sonic LICENSE](https://github.com/jixiaozhong/Sonic/blob/main/LICENSE) ; InfiniteTalk / EchoMimicV3 / FantasyTalking `apache-2.0` reconfirmés via l'API HF le 16/10/2026.
- MuseTalk : « The code of MuseTalk is released under the MIT License » ; « The trained model are available for any purpose, even commercially » ; 1.5 sorti le 28/03/2025 ; « 30fps+ » sur V100 ; 3050 Ti 4 Go ≈ 5 min pour 8 s ; limites 256×256, identité, scintillement — [GitHub TMElyralab/MuseTalk](https://github.com/TMElyralab/MuseTalk) ; étiquette `mit` — [HF TMElyralab/MuseTalk](https://huggingface.co/TMElyralab/MuseTalk) ; « cleanest commercial option » (article du 16/09/2026) — [creativeainews](https://www.creativeainews.com/articles/open-source-lip-sync-licenses-commercial-use-2026/).
- LatentSync : code Apache-2.0, 1.6 du 11/06/2025, 18 Go (1.6) / 8 Go (1.5), alignement InsightFace, guidance → « distortion or jitter », démo anime — [GitHub bytedance/LatentSync](https://github.com/bytedance/LatentSync) ; **poids `license: openrail++`** — [HF ByteDance/LatentSync-1.6 README](https://huggingface.co/ByteDance/LatentSync-1.6) (lu le 16/10/2026). L'article creativeainews le classe « Apache-2.0 … least ambiguous » sans examiner les poids — [creativeainews](https://www.creativeainews.com/articles/open-source-lip-sync-licenses-commercial-use-2026/) → **contredit par la fiche HF**.
- Wav2Lip : pas de LICENSE, usage commercial interdit (données LRS2) ; SadTalker : Apache « except for the third-party components » — [creativeainews](https://www.creativeainews.com/articles/open-source-lip-sync-licenses-commercial-use-2026/).
- Hallo3 : `license: mit` sur la fiche — [HF fudan-generative-ai/hallo3](https://huggingface.co/fudan-generative-ai/hallo3) ; dérivé de CogVideoX-5B-I2V (licence CogVideoX) — [README hallo3](https://github.com/fudan-generative-vision/hallo3), [CogVideoX LICENSE](https://huggingface.co/zai-org/CogVideoX-5b-I2V/blob/main/LICENSE).
- LivePortrait : mesure 7,9 s/image CPU et MIT — registre interne `.claude/skills/outils-puissants-d-abord` (14/10/2026), [LICENSE LivePortrait](https://github.com/KwaiVGI/LivePortrait/blob/main/LICENSE).
- Intervalles : ToonCrafter [LICENSE](https://github.com/Doubiiu/ToonCrafter/blob/main/LICENSE), [HF](https://huggingface.co/Doubiiu/ToonCrafter), [README](https://github.com/Doubiiu/ToonCrafter) ; ToonComposer [HF](https://huggingface.co/TencentARC/ToonComposer), [LICENSE](https://github.com/TencentARC/ToonComposer/blob/main/LICENSE) ; AniDoc [README](https://github.com/yihao-meng/AniDoc) ; LayerAnimate [README](https://github.com/IamCreateAI/LayerAnimate) ; défauts ToonCrafter/DynamiCrafter cités par [Motion-Aware Generative Frame Interpolation, arXiv 2501.03699](https://arxiv.org/html/2501.03699v1) ; panorama 2D : [Generative AI for Cel-Animation: A Survey, arXiv 2501.06250](https://arxiv.org/html/2501.06250v5) ; méthodes ligne/graphes AnimeInbet (ICCV 2023) — [arXiv 2309.16643](https://arxiv.org/html/2309.16643v1) ; RIFE MIT — [HF TensorForger/RIFE-safetensors](https://huggingface.co/TensorForger/RIFE-safetensors) ; RIFE « 30+FPS for 2X 720p » sur 2080 Ti — [papier RIFE](https://arxiv.org/abs/2011.06294v12).

**Qui revendique explicitement le cartoon / anime / stylisé (poids ouverts)** : MultiTalk (« cartoon character »), LongCat-Video-Avatar 1.5 (« anime, animals »), Live Avatar (« cartoon characters »), SCAIL (« anime characters »), One-to-All (« cartoon data »), Animate-X (« anthropomorphic »), Wan-Animate-2 (exemple anthropomorphe), ToonCrafter / ToonComposer / AniDoc / LayerAnimate (conçus pour l'animation 2D), SVI-Tom (Tom & Jerry 8–10 min, MIT) — sources ci-dessus et [GitHub Stable-Video-Infinity](https://github.com/vita-epfl/Stable-Video-Infinity). **Aucun** de MuseTalk, LatentSync, EchoMimic V3, FramePack, Wan2.2-S2V (hors Live Avatar) ne le revendique.

### Inferences
- Pour la règle maison, la pile la plus sûre est **Wan (Apache) + MultiTalk/InfiniteTalk (Apache) + LongCat 1.5 (MIT) +
  MuseTalk (MIT, code et poids)**. LatentSync, souvent présenté comme « Apache », est en réalité **hors règle stricte** par
  ses poids OpenRAIL++ ; FramePack est **à écarter** (poids sans licence, base Hunyuan à exclusion territoriale).
- Le lip-sync « redoublage » (MuseTalk, LatentSync) travaille sur un carré de visage 256/512 détecté par des détecteurs de
  visages humains : sur des visages cartoon très stylisés (grosse tête, bouche dessinée), le risque principal est l'échec de
  détection ou une bouche « photo » collée sur un dessin — c'est exactement le cas où notre propre couche de bouche
  (Rhubarb + LivePortrait, déjà au moteur) reste meilleure. À mesurer, non publié.
- Les vitesses publiées (0,5–2 s de vidéo par minute de 4090, ≈ 4 s/min en 4 pas) placent un film de 60 s entre ≈ 15 min
  (distillé, idéal) et ≈ 2 h (non distillé) de GPU haut de gamme : la « finition générative » doit rester sélective
  (quelques plans), pas systématique.

### Gaps
- Aucun banc public de qualité sur personnages cartoon « grosse tête » pour MultiTalk, LongCat 1.5, Wan-Animate-2, SCAIL-2,
  One-to-All, MuseTalk ; aucune évaluation du lip-sync **français** publiée pour un modèle ouvert.
- Licence exacte des poids ToonCrafter (fiche HF sans licence, README orienté recherche) et des poids Animate-X : non tranchée.
- Vitesse de ToonComposer, ToonCrafter, LatentSync 1.6, LongCat 1.5 en mono-GPU : non publiée.
- FramePack : aucune option 1re + dernière image officielle vérifiée (seulement I2V et F1).
- DreamActor-M1/M2 : aucun code ni poids ; aucune page de prix trouvée (BytePlus, fal) — recherche infructueuse le 16/10/2026.

---

## 2. API payées à l'usage (USD/s) : qui accepte NOTRE image de départ ET NOTRE piste audio française, et combien coûte un film de 60 s en 12 plans ?

### Takeaway
Trois façons d'utiliser une API : **(1) garder le mouvement du moteur et ne refaire que les lèvres** (vidéo + audio →
vidéo) : **Kling LipSync chez fal = 0,014 $ par tranche de 5 s → ≈ 0,17 $ le film**, sync.so lipsync-2 ≈ 2,40–3,00 $,
lipsync-2-pro ≈ 4,02–4,98 $ ; **(2) image + audio → plan parlant** (image clé du moteur + voix française) : HeyGen Avatar IV
0,05 $/s (≈ 3,00 $), Wan 2.5 avec `audio_url` 0,05 $/s 480p (≈ 3,00 $), Kling AI Avatar v2 Std 0,0562 $/s (≈ 3,37 $), VEED
Fabric 1.0 0,08 $/s 480p (≈ 4,80 $), Wan 2.2 S2V 0,10 $/s 480p (≈ 6 $), OmniHuman 1.5 0,16 $/s (≈ 9,60 $), InfiniteTalk
0,20 $/s (≈ 12 $) ; **(3) corps seulement, muet, 1re + dernière image** puis lèvres à part : **Wan 2.2 Fast chez
Pollinations 0,01 pollen/s (≈ 0,60 pollen le film)**, Wan 2.2 kf2v-flash 0,015–0,036 $/s (0,90–2,16 $). Chez Pollinations,
**aucun modèle de lip-sync dédié** ; seuls **Wan 3.0, Seedance 2.0 / 2.5 et MiniMax H3 Max acceptent des « reference
audios »**, sans garantie documentée que la voix fournie pilote les lèvres. **Veo 3.1 n'accepte pas d'audio en entrée ;
Sora 2 (API) est fermé depuis le 24/09/2026.** sync.so déclare ne pas prendre en charge « animals or non-humanoid
characters » : nos personnages humains dessinés sont dans le périmètre, pas les animaux de la troupe.

### Cited Findings

**Tableau 2 — API (prix lus le 16/10/2026 sauf mention ; « $ » = USD, « pollen » = unité Pollinations)**

| Service / modèle (fournisseur) | Image de départ | Dernière image | Audio en ENTRÉE (lip-sync) | Prix | Durées | Cartoon / limites déclarées |
|---|---|---|---|---|---|---|
| **Kling LipSync audio-to-video** (fal) | — (vidéo en entrée) | — | oui : vidéo 2–10 s + audio 2–60 s | **0,014 $ par tranche de 5 s, arrondie au-dessus** | vidéo 2–10 s | vidéo **720–1920 px** de côté, ≤ 100 Mo, .mp4/.mov ; rien sur le cartoon |
| **sync.so lipsync-2** | — (vidéo) | — | oui | **0,04–0,05 $/s** (25 i/s) | 1 min (Hobbyist) à 30 min (Scale+) | visage 512×512 ; « don't currently support animals or non-humanoid characters » ; le personnage doit « look like they are talking » |
| **sync.so lipsync-2-pro** | — | — | oui | **0,067–0,083 $/s** ; revendeurs : Runware 0,0733, WaveSpeed 0,08 | idem | idem ; 3 générations gratuites/mois ≤ 20 s |
| **sync.so sync-3** | — | — | oui | **0,107–0,133 $/s** | idem | « can open silent lips … results are generic » |
| **HeyGen Avatar IV** (OpenRouter) | oui (photo) | — | voix par `voice_id` (TTS HeyGen) dans les paramètres OpenRouter ; envoi d'un fichier audio non visible | **0,05 $/s** (720p/1080p, 9:16 ok) | non indiqué | « animates a single photo into an expressive, lip-synced talking-head » ; recommandé par un tiers pour portraits « stylized or anime » |
| **Kling AI Avatar v2** (fal) | oui (portrait) | — | oui (mp3/ogg/wav/m4a/aac) ; durée = durée de l'audio | **Std 0,0562 $/s ; Pro 0,115 $/s** (résumé de la page fal) | selon l'audio | — |
| **Wan 2.5 preview i2v** (fal) | oui | — | **`audio_url` optionnel** (rôle non documenté sur la page) | **0,05 / 0,10 / 0,15 $/s** (480/720/1080p) | non indiqué | — |
| **VEED Fabric 1.0** (fal) | oui | — | oui (obligatoire) | **0,08 $/s 480p ; 0,15 $/s 720p** | non indiqué | « accepts any image and audio input » |
| **Wan 2.2 S2V 14B** (fal) | oui | — | oui | **0,10 / 0,15 / 0,20 $/s** (480/580/720p ; secondes comptées à 16 i/s) | non indiqué | — |
| **OmniHuman 1.5** (fal) | oui (« image of a human figure ») | — | oui | **0,16 $/s** (revendeurs : 0,045–0,25 $/s, discordants) | non indiqué | tiers : « works with stylized, cartoon and anime characters » |
| **InfiniteTalk** (fal) | oui | — | oui | **0,20 $/s** ; « For 720p price will be doubled » | non indiqué | — |
| **Hedra Character-3** | oui | — | oui | **3 crédits/s (540p), 6 crédits/s (720p)** (page plans, via résumé de recherche) ; prix API en $ non trouvé | — | tiers : souvent recommandé pour visages stylisés |
| **Runway Act-Two** | image ou vidéo du personnage | — | **non** (vidéo de jeu d'acteur en entrée) | 0,05 $/s (14/10/2026) | 3–30 s (tiers) | — |
| **Veo 3.1 / Lite / Fast** | oui | oui | **non** (audio généré, pas fourni) | Lite muet 0,03 $/s 720p, avec son 0,05 ; Fast 0,08/0,10 (OpenRouter) | 4/6/8 s | audio : anglais seul évalué (Omni) |
| **Sora 2** | — | — | — | API fermée le 24/09/2026 | — | exclu |

**Catalogue Pollinations lu en direct (16/10/2026, `gen.pollinations.ai/video/models`), image → vidéo**

| Modèle | pollen/s (défaut ; variantes) | Entrées | 1re / dernière image | Audio en entrée | Durées | Résolutions |
|---|---|---|---|---|---|---|
| Wan 2.2 (« wan-2.2-fast ») | **0,01** | texte, image | oui / **oui** | non (muet) | **5 s fixes** | 480p |
| HeyGen Video 1 | 0,01055 (768p : 0,015825) | texte, image | oui / non | **non** (génère dialogue + ambiance lui-même) | 5–15 s | 480p, 768p |
| Pruna P-Video | 0,02 (1080p 0,04) | texte, image | oui / non | non | 1–10 s | 720p, 1080p |
| Seedance 1.0 Pro Fast | 0,025 (480p 0,015 ; 1080p 0,06) | texte, image | oui / non | non | 2–10 s | 480–1080p |
| Grok Imagine 1.5 Lite | 0,03 (480p 0,02 ; 1080p 0,14) | texte, image | oui / non | non | 1–15 s | 480–1080p |
| Kandinsky 6.0 Lite | 0,032 (avec image 0,034) | texte, image | oui / non | non (sortie audio) | 5 s | 480p |
| **Wan 3.0** | **0,068** (720p 0,14 ; 1080p 0,28) | texte, image, vidéo, **audio** | oui / **oui** | **reference_audios** | **5 s fixes** | 480–1080p |
| Seedance 2.0 Fast | 0,07 | texte, image | oui / oui | non | 4–5 s | 480p |
| Veo 3.1 Fast | 0,08 (1080p 0,10) | texte, image | oui / oui | non | 4–8 s | 720p, 1080p |
| Seedance 2.0 Mini | 0,09 (480p 0,04) | texte, image | oui / oui | non | 4–10 s | 480p, 720p |
| Wan 2.7 | 0,10 | texte, image, vidéo | oui / oui | non | 2–15 s | 720p, 1080p |
| **Seedance 2.5** | 0,1028 (720p 0,2312 ; vidéo en entrée 0,43–0,97) | texte, image, vidéo, **audio** | oui / oui | **reference_audios** | **4 s fixes** | 480p, 720p |
| **Seedance 2.0** | 0,18 (vidéo en entrée 0,22) | texte, image, vidéo, **audio** | oui / oui | **reference_audios** | 4–15 s | 720p |
| **MiniMax H3 Max** | **prix non publié (null)** | texte, image, vidéo, **audio** | oui / oui | **reference_audios** | 5–15 s | 480–1080p |
| Grok Imagine 1.5 | 0,1477 (480p 0,0844) | texte, image | oui / non | non | 1–15 s | 480–1080p |

Source : [catalogue vidéo Pollinations](https://gen.pollinations.ai/video/models) (JSON lu le 16/10/2026 ; tous les modèles marqués `paid_only: true`).

**Coût d'un film de 60 s = 12 plans de 5 s (une prise par plan ; calculs faits ici à partir des prix cités)**

| Voie | Option | Calcul | Total |
|---|---|---|---|
| (1) Lèvres seules sur le rendu moteur | Kling LipSync (fal) | 12 × 0,014 $ | **0,17 $** |
| | sync.so lipsync-2 | 60 s × 0,04–0,05 $ | 2,40–3,00 $ |
| | sync.so lipsync-2-pro | 60 × 0,067–0,083 | 4,02–4,98 $ |
| | sync.so sync-3 | 60 × 0,107–0,133 | 6,42–7,98 $ |
| (2) Image clé + voix → plan parlant | HeyGen Avatar IV | 60 × 0,05 | 3,00 $ |
| | Wan 2.5 + `audio_url` 480p / 720p | 60 × 0,05 / 0,10 | 3,00 / 6,00 $ |
| | Kling AI Avatar v2 Std / Pro | 60 × 0,0562 / 0,115 | 3,37 / 6,90 $ |
| | VEED Fabric 480p / 720p | 60 × 0,08 / 0,15 | 4,80 / 9,00 $ |
| | Wan 2.2 S2V 480p / 720p | 60 × 0,10 / 0,20 | 6,00 / 12,00 $ |
| | OmniHuman 1.5 | 60 × 0,16 | 9,60 $ |
| | InfiniteTalk (fal) / 720p | 60 × 0,20 / 0,40 | 12,00 / 24,00 $ |
| | Pollinations Wan 3.0 (référence audio) 480p / 720p | 12 × 5 × 0,068 / 0,14 | 4,08 / 8,40 pollen |
| | Pollinations Seedance 2.0 720p | 60 × 0,18 | 10,80 pollen |
| | Pollinations Seedance 2.5 480p / 720p (plans re-découpés en 15 × 4 s) | 60 × 0,1028 / 0,2312 | 6,17 / 13,87 pollen |
| (3) Corps muet, 1re + dernière image | Pollinations Wan 2.2 Fast 480p | 12 × 5 × 0,01 | **0,60 pollen** |
| | Alibaba Wan 2.2 kf2v-flash 480p / 720p (14/10/2026) | 60 × 0,015 / 0,036 | 0,90 / 2,16 $ |
| | Veo 3.1 Lite muet 720p (plans de 5 s facturés 6 s) | 12 × 6 × 0,03 | 2,16 $ |
| | Pollinations Seedance 2.0 Mini 480p | 60 × 0,04 | 2,40 pollen |

Sources des prix :
- Kling LipSync : « $0.014 per 5-second increment », vidéo 2–10 s, 720–1920 px, audio 2–60 s ≤ 5 Mo — [fal Kling LipSync audio-to-video](https://fal.ai/models/fal-ai/kling-video/lipsync/audio-to-video).
- sync.so : grilles par modèle, 512×512, « don't currently support animals or non-humanoid characters », durée max par offre — [sync.so docs, modèles lipsync](https://sync.so/docs/models/lipsync) ; 3 générations gratuites ≤ 20 s, -20 % sur l'offre haute — [sync.so billing](https://sync.so/docs/product/billing) (via résumé de recherche) ; revendeurs — [Runware](https://runware.ai/models/lipsync-2-pro), [WaveSpeed](https://www.wavespeed.ai/docs/docs-api/sync/sync-lipsync-2-pro).
- HeyGen Avatar IV 0,05 $/s, 720p/1080p, 9:16, `voice_id` — [OpenRouter, liste JSON vidéo](https://openrouter.ai/api/v1/videos/models) (lue le 16/10/2026), [page OpenRouter Avatar IV](https://openrouter.ai/heygen/avatar-iv) ; portefeuille prépayé dès 5 $ et même prix 720p/1080p (résumé de recherche) — [blog HeyGen](https://www.heygen.com/blog/best-ai-avatar-talking-head-apis).
- Kling AI Avatar v2 — [fal, AI Avatar v2 Pro](https://fal.ai/models/fal-ai/kling-video/ai-avatar/v2/pro) (prix Std/Pro issus du résumé de recherche de cette page ; un comparateur concurrent cite ≈ 0,45 $/génération Std, non retenu — [MuAPI](https://muapi.ai/comparison/kling-v2-avatar-standard)).
- Wan 2.5 i2v + `audio_url` — [fal Wan 2.5 preview i2v](https://fal.ai/models/fal-ai/wan-25-preview/image-to-video) ; VEED Fabric — [fal veed/fabric-1.0](https://fal.ai/models/veed/fabric-1.0) ; Wan 2.2 S2V — [fal wan v2.2-14b speech-to-video](https://fal.ai/models/fal-ai/wan/v2.2-14b/speech-to-video) ; OmniHuman 1.5 0,16 $/s — [fal OmniHuman v1.5](https://fal.ai/models/fal-ai/bytedance/omnihuman/v1.5) (fiche API fal : `license_type: commercial`, maj 21/04/2026) ; revendeurs discordants — [ApiPass](https://apipass.dev/model/omni-human-1-5/bytedance_omni-human-1-5), [EvoLink](https://evolink.ai/de/omnihuman-1-5), [MuAPI](https://muapi.ai/vi/playground/omnihuman-1-5) ; InfiniteTalk — [fal InfiniteTalk](https://fal.ai/models/fal-ai/infinitalk).
- Hedra : 3 crédits/s 540p, 6 crédits/s 720p (résumé de recherche de la page plans ; la page n'a rendu qu'un formulaire de connexion) — [Hedra plans](https://www.hedra.com/plans) ; fusion Avatar/Omnia en Character-3 à 6 crédits/s (tracker tiers, juil. 2026) — [usagepricing](https://www.usagepricing.com/blueprint/activity/hedra-2026-07-29-character-3-hailuo-lineup).
- Avis qualitatifs cartoon (tiers, non indépendants) : OmniHuman « works with stylized, cartoon and anime characters » — [rekreate.ai](https://rekreate.ai/models/omnihuman) ; OmniHuman sans scénario gagnant à son prix face à Kling V2 Pro, HeyGen, Creatify Aurora, Hedra — [versely.studio](https://www.versely.studio/blog/omnihuman-1-5-review-2026) ; Hedra recommandé pour visages stylisés, Kling moins précis de la bouche quand la scène est libre, HeyGen Avatar IV pour portrait anime — [elser.ai](https://www.elser.ai/blog/best-ai-video-generators-lip-sync-anime-music-videos-2026), [lipsync.com](https://lipsync.com/compare/kling-vs-hedra).
- Prix Veo 3.1, Act-Two, Wan 2.2 kf2v-flash, fermeture de Sora 2 : note du 14/10/2026 `api_video_paiement_usage.md` — [tarifs Gemini](https://ai.google.dev/gemini-api/docs/pricing), [tarifs Runway API](https://docs.dev.runwayml.com/guides/pricing/), [Model Studio](https://www.alibabacloud.com/help/en/model-studio/model-pricing), [OpenAI Sora 2](https://developers.openai.com/api/docs/models/sora-2) ; Veo 3.1 Lite/Fast et durées 4/6/8 s reconfirmés dans la [liste JSON OpenRouter](https://openrouter.ai/api/v1/videos/models) le 16/10/2026.
- Seedance 2.0 et références audio : jusqu'à 3 audios de référence, lip-sync « phoneme »-level en 8+ langues selon des revendeurs (non officiel) — [EvoLink](https://evolink.ai/de/seedance-2-0), [RunComfy skill](https://skills.sh/agentspace-so/runcomfy-skills/seedance-v2).

### Inferences
- **Pollen ≈ dollar** (inférence, non publiée) : les prix Pollinations recoupent au centime ceux d'OpenRouter en USD pour
  Grok 1.5 Lite (0,03 à 720p), Veo 3.1 Fast muet (0,08 à 720p) et « Wan 3.0 » (0,068 / 0,14 / 0,28 = grille **Wan 3.0
  Prime** chez OpenRouter, alors que Wan 3.0 simple y coûte 0,05 / 0,10 / 0,20 $) ; Seedance 2.0 est ≈ 19 % plus cher chez
  Pollinations (0,18 contre 0,151 $/s calculé). À confirmer par la page de crédit Pollinations.
- La voie la plus économique et la plus sûre pour le français est **« corps d'abord, lèvres en dernier »** : générer le
  mouvement muet (Wan 2.2 Fast 1re+dernière image ≈ 0,60 pollen le film), puis refaire les lèvres sur la vidéo finale avec
  Kling LipSync (≈ 0,17 $) ou sync.so — ou avec notre propre bouche Rhubarb/LivePortrait (0 €). Aucun modèle génératif
  n'a alors à « comprendre » le français : il ne fait que suivre la phonétique de l'audio.
- Kling LipSync exige ≥ 720 px de côté : nos plans 576×1024 doivent être agrandis (×1,25 → 720×1280) avant l'envoi, puis
  réduits ; coût supplémentaire nul, mais une étape d'upscale à prévoir.
- Les modèles « image + audio » (HeyGen, Kling Avatar, OmniHuman, Fabric) **remplacent** la mise en scène du moteur
  (cadrage et jeu réinventés à partir d'un portrait) : bons pour un gros plan parlant, mauvais pour garder le découpage
  exact du moteur.
- Les modèles à durée fixe (Wan 2.2 Fast et Wan 3.0 à 5 s, Seedance 2.5 à 4 s) imposent de caler le découpage : un plan de
  3 s coûte quand même 5 s ; Seedance 2.5 oblige à re-découper en plans de 4 s.

### Gaps
- Pollinations : taux de conversion pollen → USD non trouvé (recherche sans résultat) ; prix de MiniMax H3 Max et Turbo
  publiés « null » dans le catalogue.
- Rôle exact des « reference audios » (Wan 3.0, Seedance 2.x, H3 Max) et de l'`audio_url` de Wan 2.5 : pilote-t-il les
  lèvres de NOTRE voix ou sert-il d'ambiance ? Non documenté sur les pages lues.
- HeyGen Avatar IV : envoi d'un fichier audio personnel par OpenRouter non confirmé (seul `voice_id` apparaît) ; page de prix
  officielle HeyGen non lue.
- Prix officiels Kling (page JS illisible le 14/10/2026), DreamActor-M1/M2, Hedra API en dollars : non trouvés.
- Aucun banc indépendant de lip-sync sur personnages cartoon dessinés (2D) ni sur le français pour ces API.
- Conditions d'utilisation des images téléversées (entraînement, rétention) chez fal, sync.so, HeyGen, Pollinations : non lues.

---

## 3. Preuves de terrain : rendu de moteur 2D/3D + « finition » générative (VACE / Fun Control / pose / profondeur), astuces de cohérence, temps sur GPU gratuit

### Takeaway
Le schéma « rendu moteur → passe générative contrôlée » est documenté côté ouvert par **Wan2.1-VACE** (vidéo de contrôle
profondeur/pose + images de référence + masques dans un même modèle, Apache-2.0), **Wan2.2-Fun Control / VACE-Fun**,
**Wan-Animate (mode remplacement + LoRA de ré-éclairage)** et, hors règle, **LTX-2.5 IC-LoRA Layout-To-Render** (« Keep
the same … camera as the driver »). Astuces de cohérence citées : **image de référence + LoRA du personnage** (la plus
citée), même graine, 1re image = rendu du moteur. Temps gratuits : **HF ZeroGPU ≈ 69 s réservées par clip Wan 2.2 de 5 s
(4 pas) → ≈ 4 clips/jour par compte gratuit**, **Kaggle T4 ≈ 9–15 min par clip (communauté) et ≈ 30 h GPU/semaine**,
One-to-All 1.3B ≈ 11 min pour 10 s sur T4. Le P100 Kaggle a été retiré le 15/09/2026. ComfyUI (GPL-3.0) est hors règle :
utiliser Diffusers / DiffSynth-Studio / VideoX-Fun (Apache).

### Cited Findings
- VACE « accepte une vidéo de contrôle (ex. profondeur) + images de référence + masques (MV2V : inpainting/outpainting/
  extension) dans un même modèle » ; VACE Apache-2.0 (VACE-LTX = RAIL-M) — [GitHub ali-vilab/VACE](https://github.com/ali-vilab/VACE).
- Wan-Animate remplacement : le personnage remplace l'acteur et reprend l'éclairage / la teinte de la scène (LoRA de
  ré-éclairage) ; le squelette 2D vise aussi des personnages non humanoïdes mais les erreurs de squelette et les grandes
  différences de corps provoquent des déformations — [README Wan2.2](https://github.com/Wan-Video/Wan2.2), [arXiv 2509.14055](https://arxiv.org/html/2509.14055v1).
- Communauté : image de référence + LoRA de personnage donnent une forte cohérence avec Wan2.1 VACE — [snapshot Reddit r/StableDiffusion, 13/03/2026](https://reddit.sentinel-team.org/posts/1romzwt/snapshots/2026-03-13T21%3A28%3A18.36706Z) ; entraînement de LoRA proposé par VideoX-Fun / DiffSynth-Studio (Apache) — [VideoX-Fun](https://github.com/aigc-apps/VideoX-Fun).
- LTX-2.5 IC-LoRA Layout-To-Render (22/09/2026, `video-to-video`, `camera-control`) ; prompt d'exemple « Keep the same well,
  bucket, posts, and camera as the driver » ; licence `ltx-2.x-community-license` (hors règle) — [API HF Layout-To-Render](https://huggingface.co/api/models/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render) (relevé le 14/10/2026) ; LoRA tierce « 3DREAL » (LTX-2.3) : rendus 3D/blockouts → vidéo photoréaliste en gardant composition, caméra et mise en scène — [comfyui-wiki, 29/06/2026](https://comfyui-wiki.com/en/news/2026-06-29-ltx-2-3-3dreal-lora-render-to-real).
- SVI (MIT) : SVI-Shot (padding VACE avec image de référence), SVI-Dance (squelette), SVI-Talk, SVI-Tom (cartoon) — [GitHub Stable-Video-Infinity](https://github.com/vita-epfl/Stable-Video-Infinity).
- Wan2.2-Fun fp8 sur RTX 4090D : 81 images 640×640 ≈ 520 s ; LoRA 4 pas ≈ 79–138 s mais « the video dynamic is lost » — [docs ComfyUI](https://docs.comfy.org/tutorials/video/wan/wan2-2-fun-inp).
- ZeroGPU : quota 5 min/jour connecté, 2 min anonyme ; Space `zerogpu-aoti/wan2-2-fp8da-aoti-faster` (Wan 2.2 I2V-A14B FP8,
  AoT, 4 pas) : réservation = `10 + steps × 15 × (frames×W×H / (81×832×624))^1.5` s → ≈ 69 s pour 5 s en 832×624 ; Wan 2.2
  Animate ≈ 150 s réservées pour 5 s — [HF docs ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu), [app.py](https://huggingface.co/spaces/zerogpu-aoti/wan2-2-fp8da-aoti-faster/blob/main/app.py) (calcul de la note `calcul_gpu_gratuit.md`, 14/10/2026) ; Space de démonstration 1re/dernière image (compte multimodalart, 673 likes au 14/10/2026) — [multimodalart/wan-2-2-first-last-frame](https://huggingface.co/spaces/multimodalart/wan-2-2-first-last-frame).
- Kaggle : ≈ 30 h GPU/semaine (T4×2), CLI `kaggle kernels push --accelerator NvidiaTeslaT4` / `status` / `output`
  automatisable sans navigateur ; P100 retiré le 15/09/2026 — [kernels.md](https://github.com/Kaggle/kaggle-api/blob/main/docs/kernels.md), [annonce Kaggle](https://www.kaggle.com/product-announcements/735239) ; « Expect ~9-15 minutes per video on T4 » (480p, modèle non précisé) — [WanGP-Kaggle (communauté)](https://github.com/kayas881/WanGP-Kaggle).
- One-to-All 1.3B : « It takes 11 minutes to generate a 10-second 832×480 video » sur T4 Kaggle 16 Go — [README](https://github.com/ssj9596/One-to-All-Animation).
- T4 (Turing) : FlashAttention-2 vise Ampere/Ada/Hopper ; « bf16 requires Ampere, Ada, or Hopper GPUs » — [README flash-attention](https://github.com/Dao-AILab/flash-attention).
- Runtimes : ComfyUI = GPL-3.0 — [LICENSE](https://github.com/comfyanonymous/ComfyUI/blob/master/LICENSE) ; ComfyUI-WanVideoWrapper (Kijai) Apache-2.0 — [LICENSE](https://github.com/kijai/ComfyUI-WanVideoWrapper/blob/main/LICENSE) ; LightX2V Apache-2.0 — [LICENSE](https://github.com/ModelTC/LightX2V/blob/main/LICENSE) ; Wan2GP « WanGP Community License 2.0 » (maison) — [LICENSE.txt](https://github.com/deepbeepmeep/Wan2GP/blob/main/LICENSE.txt).

### Inferences
- **Recette ouverte la plus proche du besoin** (à mesurer) : rendu moteur du plan → profondeur/pose extraites du moteur
  (exactes, sans estimateur) → Wan2.1-VACE / Wan2.2 VACE-Fun avec image de référence de la planche + LoRA du personnage +
  **masque qui exclut la tête** (le visage et la bouche du moteur sont conservés tels quels) → le lip-sync français reste
  celui du moteur, déterministe, à 0 €. C'est une combinaison neuve : aucune source lue ne masque la bouche pour protéger
  un lip-sync calculé ailleurs.
- Avec ZeroGPU (≈ 4 clips de 5 s/jour/compte) un film de 12 plans demande ≈ 3 jours ; avec Kaggle T4 (9–15 min/clip)
  ≈ 2–3 h de GPU par film, soit ≤ 10–15 films/semaine : faisable en lot de nuit, pas « en minutes ».
- Les LoRA 4 pas accélèrent ×4–7 mais appauvrissent le mouvement — précisément ce qu'on cherche à améliorer : garder 4 pas
  pour les brouillons, plus de pas pour la passe finale.

### Gaps
- Aucun chrono maison ni publié de Wan2.1-VACE-1.3B / Wan2.2 VACE-Fun sur T4 à réglages connus, ni sur 576×1024 vertical.
- Aucun exemple public de « personnage cartoon 2D peint + VACE profondeur » avec mesure de dérive d'identité.
- Efficacité réelle du « masque tête protégée » (raccord cou/épaules, tête qui doit bouger avec le corps) : non testée.

---

## 4. Ce qui est réaliste sur CPU seul (4 cœurs, sans GPU) — quantifié

### Takeaway
**Aucun modèle vidéo génératif n'est utilisable en temps utile sur le CPU du conteneur** (aucun chrono CPU publié pour
Wan/FramePack/VACE ; ordre de grandeur estimé : heures à jours par clip). Sont en revanche **mesurés et utilisables** :
**RIFE 4.9 (MIT) = 0,99 s par image intermédiaire en 576×1024 (0,30 s en 288×512)**, donc doubler un plan de 12 à 24 i/s
coûte ≈ 12 s de CPU par seconde de film (≈ 5 s de vidéo par minute de CPU) — **mais seulement pour de petits écarts de
pose** : à 15° de rotation de bras l'image intermédiaire est propre, à 30° le bras se « casse », à 100° **le bras
disparaît**. LivePortrait (MIT) reste à 7,9 s/image sur CPU (≈ 0,3 s de vidéo par minute), d'où la bibliothèque d'états
déjà en place.

### Cited Findings
- **Mesure maison du 16/10/2026** (Intel Xeon 2,10 GHz, 4 threads, onnxruntime 1.31.0 CPU, RIFE 4.9 « ensemble » ONNX de
  [HF yuvraj108c/rife-onnx](https://huggingface.co/yuvraj108c/rife-onnx) — dépôt sans licence déclarée, utilisé seulement pour
  la mesure ; poids RIFE sous MIT chez [TensorForger/RIFE-safetensors](https://huggingface.co/TensorForger/RIFE-safetensors)) :
  - 576×1024 : 1,46 s (1er appel après chauffe), 0,71 s, 0,81 s → **moyenne 0,99 s / image intermédiaire** ;
  - 288×512 : 0,29 / 0,32 / 0,29 s → **0,30 s / image** ;
  - test qualitatif sur un personnage synthétique (grosse tête, maillot jaune, bras de 190 px) : pas de **15°** (bout du bras
    déplacé ≈ 50 px) → intermédiaire net ; pas de **30°** (≈ 99 px) → bras coudé/cassé ; pas de **100°** (≈ 291 px) → bras
    effacé (fantôme presque invisible) aux temps 0,25 / 0,5 / 0,75. Fichiers : planches `planche.png` et `small_steps.png`
    dans le dossier `bench_rife` du scratchpad de la session.
- RIFE : « 30+FPS for 2X 720p interpolation » sur 2080 Ti (GPU) ; aucun chiffre CPU publié trouvé — [papier RIFE](https://arxiv.org/abs/2011.06294v12), [wiki SVP](https://svp-team.com/wiki/RIFE_AI_interpolation).
- LivePortrait : 7,9 s/image sur 4 cœurs CPU (mesure maison du 14/10/2026) ; FasterLivePortrait ONNX : 17,6 s/image sur ce
  CPU (pas plus rapide) — registre `.claude/skills/outils-puissants-d-abord`.
- stable-diffusion.cpp (MIT) documente la génération vidéo Wan2.1/2.2 (dont VACE 1.3B, FLF2V, S2V) en GGUF mais ne publie
  aucun temps CPU ; recherches « Wan2.1 1.3B CPU only », « OpenVINO Wan2.1 » sans résultat chiffré — note `modeles_video_ouverts_pilotes.md` (14/10/2026), [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp).
- Référence GPU pour l'estimation : Wan2.1 1.3B = 261,4 s pour 5 s 480p sur RTX 4090 — [HF Wan2.1-VACE-1.3B](https://huggingface.co/Wan-AI/Wan2.1-VACE-1.3B) ; FramePack = 2,5 s/image sur 4090, 6 Go — [README FramePack](https://github.com/lllyasviel/FramePack).

### Inferences
- Estimation (inférence, pas une mesure) : un CPU 4 cœurs est de l'ordre de 100 à 1 000 fois moins rapide qu'une 4090 en
  calcul matriciel ; Wan 1.3B (261 s sur 4090 pour 5 s) → **≈ 7 h à 3 jours par clip de 5 s** sur ce CPU ; FramePack
  (2,5 s/image sur 4090) → **≈ 4 à 40 min par image**. Inutilisable pour un film ; seul un micro-test de fumée (quelques
  images, 4 pas, GGUF Q4) aurait un sens pour valider une chaîne.
- **Routeur d'intervalles hybride (idée nouvelle, testable)** : le moteur connaît l'écart de pose entre deux images ; si le
  déplacement maximal d'un membre est ≤ ≈ 50 px (≈ 15° pour un bras de 190 px en 576 px de large) → RIFE sur CPU (≈ 1 s
  par image, 0 €) ; entre ≈ 50 et 100 px → le moteur rend lui-même des poses intermédiaires (interpolation des paramètres
  du rig, 0 €) ; au-delà, ou pour un changement de DESSIN (pose dessinée A → pose dessinée B) → passe générative
  1re + dernière image (Wan 2.2 Fast ≈ 0,05 pollen par plan de 5 s, ou Wan2.1-FLF2V Apache sur GPU gratuit).
  **Critère d'acceptation** : aucune image intermédiaire où l'aire de la silhouette d'un membre chute de plus de 20 % par
  rapport à la moyenne des deux images clés (détection automatique de la « disparition » observée à 100°).
- RIFE à 0,30 s/image en demi-résolution suggère une variante plus rapide : estimer le flux en 288×512 puis l'appliquer en
  pleine résolution (mode « scale 0.5 » de RIFE) — à mesurer, gain probable ≈ ×2–3.

### Gaps
- Aucun temps CPU publié pour Wan / VACE / FramePack / ToonCrafter ; l'estimation ci-dessus n'est qu'un ordre de grandeur.
- RIFE mesuré sur un personnage synthétique, pas sur les planches peintes de la troupe (textures, contours) : seuils de
  15°/30° à confirmer sur nos dessins (images de l'utilisateur à garder dans `workbench/.private/`).
- Variantes spécialisées animation (GIMM-VFI, AnimeInterp, AnimeInbet) non mesurées ; licences non lues dans cette session.
