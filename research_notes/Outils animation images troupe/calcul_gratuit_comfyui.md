# Faire tourner Wan 2.2 (I2V / S2V / Animate), InfiniteTalk, HuMo, LTX-Video et CogVideoX sous ComfyUI sans abonnement ni frais par génération — état au 16/10/2026

Portée : guide pratique pour choisir où produire **~1 000 films d'une minute** (≈ 50 s de plans animés en ~480p chacun).
Repart de la veille du 14/10/2026 (`research_notes/Animer Blender par prompt/calcul_gpu_gratuit.md`, notée « veille du 14/10 »)
et la complète sur ComfyUI, les paliers de VRAM, les fichiers exacts et le coût par film.
Conventions : « observé » = relevé par nous le 16/10/2026 via l'API Hugging Face (tailles exactes des fichiers) ou les
fichiers bruts GitHub (LICENSE, README, `cli_args.py`). Tous les temps sont **ceux des sources citées, avec leur matériel** ;
aucun n'a été mesuré par nous. Les calculs (temps par film, kWh, coûts) sont marqués **calcul** et reposent sur des
hypothèses explicites.

Rappel de format : Wan 2.x sort à 16 i/s ; un clip « 5 s » = 81 images (≈ 5,06 s). 50 s de plans ≈ **10 clips de 5 s**
par film → 1 000 films ≈ **10 000 clips**.

---

## 1. Paliers matériels (8 / 12 / 16 / 24 / 32 Go), formats (fp8, GGUF, block swap, offload) et vitesses mesurées par GPU

### Takeaway
Sous ComfyUI, la quantification GGUF (Q4/Q5) et le délestage permettent de faire tourner Wan 2.2 14B dès 6–12 Go, mais
la vitesse dépend surtout des **LoRA/modèles distillés 4 pas** : de ≈ 6 min par clip 5 s 480p sur RTX 3060 12 Go
(GGUF Q5 + lightx2v) à ≈ 2 min sur RTX 5090 (GGUF Q4, 6 pas), et **10,7 s** sur RTX 5090 avec LightX2V NVFP4 4 pas
(hors ComfyUI). Aucune mesure sourcée trouvée pour Apple Silicon, AMD sur Wan ni CPU seul.

### Cited Findings

**Ce que dit ComfyUI lui-même**
- Le README de ComfyUI annonce : « Can run even the biggest open source models on as low as 4GB vram + 8GB ram relatively quickly […] using our state of the art asynchronous weight streaming technology » ; « Supports all operating systems and GPU types (NVIDIA, AMD, Intel, Apple Silicon, Ascend) » — [ComfyUI README](https://github.com/comfyanonymous/ComfyUI/blob/master/README.md) (lu le 16/10/2026). Affirmation de l'éditeur, sans chiffre de vitesse.
- Wan 2.2 TI2V-5B : « should fit well on 8GB vram with the ComfyUI native offloading » — [docs.comfy.org, Wan2.2](https://docs.comfy.org/tutorials/video/wan/wan2_2).
- Options mémoire de `cli_args.py` (observé) : `--lowvram` (« Doesn't do anything if dynamic vram is enabled. If dynamic vram isn't being used this option makes the text encoders run on the CPU »), `--novram` (« When lowvram isn't enough »), `--cpu` (« To use the CPU for everything (slow) »), `--gpu-only`, `--highvram` (garde les modèles en VRAM), `--reserve-vram <Go>`, `--async-offload [N flux]`, `--fast-disk` (délestage via disque NVMe), `--disable-smart-memory`, `--cpu-vae`, `--use-sage-attention`, `--cache-none` — [ComfyUI comfy/cli_args.py](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy/cli_args.py).
- Recette officielle Wan (hors ComfyUI) : I2V/T2V-A14B et S2V-14B « can run on a GPU with at least 80GB VRAM » ; TI2V-5B « at least 24GB VRAM (e.g, RTX 4090 GPU) » avec `--offload_model True --convert_model_dtype --t5_cpu` — [Wan2.2 README](https://github.com/Wan-Video/Wan2.2). Wan 2.1 T2V-1.3B : « requires only 8.19 GB VRAM », 5 s 480p en ≈ 4 min sur RTX 4090 sans optimisation — [Wan2.1 README](https://github.com/Wan-Video/Wan2.1) (veille du 14/10).

**Tailles réelles des poids (observé via l'API HF le 16/10/2026) → palier minimal plausible**
- Wan 2.2 I2V-A14B (2 experts, haut bruit + bas bruit, chargés l'un après l'autre) : fp16 28,58 Go/expert ; `fp8_scaled` 14,29 Go/expert — [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/diffusion_models). GGUF par expert : Q2_K 5,30 Go ; Q3_K_M 7,18 ; Q4_K_S 8,75 ; **Q4_K_M 9,65** ; **Q5_K_M 10,79** ; Q6_K 12,00 ; Q8_0 15,41 — [QuantStack/Wan2.2-I2V-A14B-GGUF](https://huggingface.co/QuantStack/Wan2.2-I2V-A14B-GGUF) (Apache-2.0).
- Wan 2.2 S2V-14B : bf16 32,59 Go ; fp8_scaled 16,39 Go — [Comfy-Org repack](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/diffusion_models) ; GGUF Q3_K_M 11,39 ; Q4_K_S 12,96 ; Q4_K_M 13,86 ; Q5_K_M 15,00 ; Q8_0 19,62 Go — [QuantStack/Wan2.2-S2V-14B-GGUF](https://huggingface.co/QuantStack/Wan2.2-S2V-14B-GGUF).
- Wan 2.2 Animate-14B : bf16 34,55 Go ; int8_convrot 18,41 Go — [Comfy-Org repack](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/diffusion_models) ; GGUF Q3_K_M 8,63 ; Q4_K_M 11,50 ; Q5_K_M 13,00 ; Q8_0 18,72 Go — [QuantStack/Wan2.2-Animate-14B-GGUF](https://huggingface.co/QuantStack/Wan2.2-Animate-14B-GGUF).
- Encodeur texte commun `umt5_xxl` : fp16 11,37 Go ; fp8_e4m3fn_scaled 6,74 Go — [Comfy-Org repack](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/text_encoders).
- InfiniteTalk (module greffé sur Wan 2.1 I2V-14B 480p) : module fp16 5,13 Go — [Comfy-Org/Wan_2.1_ComfyUI_repackaged, model_patches](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/model_patches) ; GGUF Q4_K_M 1,40 Go / Q8 2,65 Go — [Kijai/WanVideo_comfy_GGUF](https://huggingface.co/Kijai/WanVideo_comfy_GGUF) ; base Wan 2.1 I2V 480p 14B fp8_scaled 16,40 Go — [Comfy-Org Wan 2.1 repack](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/diffusion_models).
- HuMo : 17B fp16 34,11 Go ; 17B fp8_e4m3fn 17,06 Go ; **1.7B fp16 3,48 Go** — [Comfy-Org/HuMo_ComfyUI](https://huggingface.co/Comfy-Org/HuMo_ComfyUI).

**Block swap / délestage (Kijai WanVideoWrapper)**
- Premier essai 14B en 512×512×81 : « ~16GB used with 20/40 blocks offloaded » ; fenêtre de contexte 1 025 images (fenêtre 81, recouvrement 16) avec le 1.3B T2V : « under 5GB VRAM and took 10 minutes to gen on a 5090 » ; les LoRA non fusionnées sont désormais permutées avec les blocs (1 Go de LoRA, 20 blocs permutés → ≈ +500 Mo de VRAM) — [Kijai ComfyUI-WanVideoWrapper README](https://github.com/kijai/ComfyUI-WanVideoWrapper).

**Temps mesurés publiés (clip ≈ 5 s, 480p sauf mention)**

| GPU | Modèle / format / pas | Temps par clip | Source (nature) |
|---|---|---|---|
| RTX 5090 32 Go | LightWan2.2-A14B I2V, **NVFP4 + attention creuse, 4 NFE**, cadre LightX2V (pas ComfyUI) | **10,7 s** (480p) ; 26,7 s (720p) ; référence Wan2.2-I2V 40 NFE : 787 s (480p), 2 685 s (720p) | [fiche lightx2v/LightWan2.2-A14B](https://huggingface.co/lightx2v/LightWan2.2-A14B) (éditeur, « End-to-End Latency ») |
| RTX 5090 | Wan 2.2 I2V 14B, GGUF Q4_K_M, 6 pas (3+3), dpm++_sde, 832×480×81, WanVideoWrapper, ComfyUI v0.16.4 | **125 s** à chaud (sageattn3) ; 143,9 s sans sageattn3 / à froid ; chute ≈ 50 % si RAM > 92 % | [toki_mwc, Zenn, 11/03/2026 mis à jour 28/06/2026](https://zenn.dev/toki_mwc/articles/ltx23-vs-wan22-i2v-benchmark-rtx5090?locale=en) (mesure d'auteur) |
| RTX 5090 | LTX-2.3 22B distillé GGUF Q4_K_M (17,8 Go), 8 pas, 832×480×81 | **22,1 s** à chaud ; 48,5 s à froid | même source Zenn |
| RTX 5090 / RTX 4090 | Wan 2.1 I2V, ComfyUI (guide officiel « partiellement suivi » ; résolution, images, pas non indiqués) ; 100+ exécutions | 419 s (5090) / 763 s (4090) ; puissance moyenne **520 W / 235 W** ; pic 587 W / 450 W ; VRAM pic 24,2 / 15,6 Go | [Valdi.ai](https://www.valdi.ai/blog/rtx-5090-vs-4090-in-the-real-world-of-image-to-video-inference) (mesure d'éditeur cloud) |
| RTX 4090 | Wan 2.1 T2V-14B pleine précision, script officiel | 281 s (480p) ; 720p : OOM | chiffre SaladCloud repris par [runaihome, juin 2026](https://runaihome.com/blog/wan-video-local-ai-gpu-guide-2026/) (source primaire non relue) |
| RTX 3060 12 Go (Ryzen 5 3600, 32 Go RAM, fichier d'échange 45–98 Go) | Wan 2.2 I2V GGUF (Q5 pour le 2ᵉ expert) + LoRA lightx2v, workflow « 4 steps », 480p | **≈ 6 min** (≈ 8 min avec MMAudio) | [Civitai, « Another WAN2.2 workflow - 4steps », 09/04/2026](https://civitai.com/models/2121649/another-wan22-workflow-4steps-i2vflft2v) (mesure d'auteur) |
| RTX 3060 12 Go | Wan 2.2 I2V, 1440×960, 6 pas | ≈ 15 min | [Civitai, workflow 3060](https://civitai.com/articles/17955/wan-22-workflow-optimized-for-rtx-3060-12-gb-vram-gpu) (via résumé de recherche) |
| RTX 3060 12 Go / RTX 4070 12 Go | Wan 2.2 14B GGUF + T5 sur CPU, 480p (pas non précisés, sans lightx2v apparemment) | 18–22 min ; VRAM ≈ 8 Go | [runaihome](https://runaihome.com/blog/wan-video-local-ai-gpu-guide-2026/) (non attribué → faible) |
| RTX 4060 Ti 16 Go | Wan 2.2 14B 720p (réglages non indiqués) | 4–7 min | [runaihome](https://runaihome.com/blog/wan-video-local-ai-gpu-guide-2026/) (non attribué → faible) |
| RTX 3090 24 Go | Wan 2.2-Animate, 640×480×81 | ≈ 7 s/image → 9–10 min | test communautaire (Medium) cité par [runaihome](https://runaihome.com/blog/wan-video-local-ai-gpu-guide-2026/) |
| RTX 3050 6 Go (16 Go RAM) | Wan 2.2 14B « Rapid AIO » GGUF (fusion communautaire), délestage CPU agressif | « 1-second video in under 5 minutes » | [Cordux/ComfyUI-Wan2.2-workflow README](https://github.com/Cordux/ComfyUI-Wan2.2-workflow) |
| T4 16 Go (Kaggle) | WanGP, 480p (modèle non précisé) | 9–15 min par vidéo | [kayas881/WanGP-Kaggle](https://github.com/kayas881/WanGP-Kaggle) (veille du 14/10) |

**Autres modèles**
- InfiniteTalk : 480p et 720p ; mode très basse VRAM `--num_persistent_param_in_dit 0` ; quantification int8 et TeaCache ; LoRA lightx2v ou FusioniX → « only 4~8 steps » (guide texte 1, guide audio 2 avec LoRA) ; `--max_frame_num` par défaut « 40 seconds (1000 frames) » ; I2V bon « up to 1 minute », dérive de couleur au-delà ; FusionX « exacerbates color shift over 1 minute and reduces ID preservation » — [InfiniteTalk README](https://github.com/MeiGen-AI/InfiniteTalk). Rendus ComfyUI sur RTX 4090 : ≈ 200 s (image→vidéo) et ≈ 70 s (vidéo→vidéo), **durée de clip non indiquée** — [Next Diffusion, I2V](https://www.nextdiffusion.ai/tutorials/create-lip-sync-videos-from-images-with-infinitetalk-in-comfyui) ; [Next Diffusion, V2V](https://www.nextdiffusion.ai/tutorials/how-to-create-video-to-video-lip-sync-with-infinitetalk-in-comfyui).
- HuMo : 1.7B « generate a 480P video in 8 minutes on a 32G GPU » ; 17B « can be run on a NVIDIA 3090 GPU » via WanVideoWrapper ; entraîné sur « 97-frame videos at 25 FPS » (≈ 3,9 s ; au-delà, dégradation possible) ; ComfyUI supporte HuMo-1.7B nativement depuis le 17/09/2025 — [HuMo README](https://github.com/Phantom-video/HuMo).
- Wan 2.2 S2V sous ComfyUI : 16 i/s, segments de 77 images (≈ 4,81 s) chaînés par « Video S2V Extend » ; avec la LoRA 4 pas : steps 4, cfg 1.0 (sinon 20 pas, cfg 6.0), mais la LoRA « is not trained for Wan2.2 S2V » et « will cause significant dynamic and quality loss » — [docs.comfy.org, Wan2.2 S2V](https://docs.comfy.org/tutorials/video/wan/wan2-2-s2v).
- CogVideoX (diffusers, avec optimisations) : 5B « BF16 : 5GB minimum », INT8 torchao 4,4 Go ; 2B FP16 4 Go ; 1.5-5B BF16 « from 10GB » ; vitesse 50 pas : 5B ≈ 180 s sur A100 / ≈ 90 s sur H100 ; 2B ≈ 90 s / 45 s ; 1.5-5B ≈ 1 000 s / 550 s (vidéo 5 s) ; 2B/5B : 6 s à 8 i/s ; 1.5 : 5 ou 10 s à 16 i/s ; « CogVideoX-5B on desktop GPUs like RTX 3060 » — [CogVideo README](https://github.com/zai-org/CogVideo).
- LTX-Video : 13B 0.9.7 distillé « generates HD videos in 10 seconds […] (on H100) » ; version fp8 « real-time » sur H100 ; 0.9.8 jusqu'à 60 s de vidéo dans ComfyUI — [LTX-Video README](https://github.com/Lightricks/LTX-Video). Communauté LTX-VideoQ8 : 720×480×121 « under a minute » sur RTX 4060 8 Go (veille du 14/10, non officiel).
- Gains de LightX2V : « approximately 2x faster than ComfyUI » (affirmation de l'éditeur, extrait de recherche) — [lightx2v/Wan2.1-Distill-Models](https://huggingface.co/lightx2v/Wan2.1-Distill-Models). Pas de 4 : un utilisateur de 3060 déconseille de descendre sous 4 pas avec les LoRA « lightning » (cohérence temporelle) — [Latenode community](https://community.latenode.com/t/quick-video-ai-setup-for-budget-12gb-graphics-cards-wan-2-2-gguf-models-lightning-training-optimized-steps/33286).

**Apple Silicon, AMD, Intel, CPU**
- Apple : installation ComfyUI sur M1–M4 avec PyTorch nightly (MPS) — [ComfyUI README](https://github.com/comfyanonymous/ComfyUI/blob/master/README.md) ; ComfyUI-GGUF : « On MacOS sequoia, torch 2.4.1 seems to be required » (erreur « M1 buffer is not large enough » en 2.6 nightly) — [ComfyUI-GGUF README](https://github.com/city96/ComfyUI-GGUF). Aucune mesure Wan sur M-series trouvée ; seule mention qualitative : Mac Studio M4 Max 128 Go fait tourner Wan 14B, « slower » que NVIDIA — [runaihome](https://runaihome.com/blog/wan-video-local-ai-gpu-guide-2026/). LightWan NVFP4 exige « NVIDIA RTX 50-series GPUs or other Blackwell » — [LightWan2.2-A14B](https://huggingface.co/lightx2v/LightWan2.2-A14B).
- AMD : ROCm 7.2 sous Linux (`pip install torch … --index-url https://download.pytorch.org/whl/rocm7.2`), Windows avec ROCm 10.0 / PyTorch 2.13, architectures RDNA 2, 3, 3.5 et 4 ; portable Windows AMD officiel — [ComfyUI README](https://github.com/comfyanonymous/ComfyUI/blob/master/README.md). Tutoriel AMD ComfyUI testé sur RX 7900 XTX mais avec LTX-Video, pas Wan — [ROCm docs, T2V ComfyUI Radeon](https://rocm.docs.amd.com/projects/ai-developer-hub/en/v11.0/notebooks/inference/t2v_comfyui_radeon.html). AMD annonce « 5.4x » sur Wan 14B avec ROCm 7.2, sur Radeon AI Pro R9700 (affirmation d'éditeur, via résumé de recherche) — [Notebookcheck](https://www.notebookcheck.net/AMD-ROCm-7-2-brings-AI-training-and-inferencing-to-all-with-Ryzen-AI-400-support-and-ComfyUI-Adrenalin-integrations.1196997.0.html). 7900 XTX « roughly matches the RTX 3090 at 480p » (non attribué) — [runaihome](https://runaihome.com/blog/wan-video-local-ai-gpu-guide-2026/).
- Intel Arc : PyTorch `xpu` + portable Windows Intel officiel — [ComfyUI README](https://github.com/comfyanonymous/ComfyUI/blob/master/README.md).
- CPU seul : `--cpu` « (slow) » — [cli_args.py](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy/cli_args.py) ; aucune mesure Wan/LTX sur CPU trouvée ; la donnée CPU la plus proche concerne une image Stable Diffusion (≈ 5–10 min sans LCM) — [lilys.ai](https://lilys.ai/notes/pt/comfyui-20251213/stable-diffusion-comfyui-cpu-only) (résumé de recherche).

### Inferences
- **Grille de paliers (déduite des tailles de fichiers + sources ci-dessus, à valider par un essai)** :

| VRAM | Wan 2.2 I2V-A14B | Wan 2.2 S2V-14B | Wan 2.2 Animate-14B | InfiniteTalk | HuMo | LTX / CogVideoX |
|---|---|---|---|---|---|---|
| 6–8 Go | GGUF Q3/Q4 + délestage + T5 fp8 ou CPU ; ≥ 32 Go RAM conseillés ; lent (minutes par seconde de vidéo) | Q3_K_M (11,4 Go) → délestage lourd | Q3_K_M (8,6 Go) + délestage | module Q4 (1,4 Go) + base Wan 2.1 GGUF | **1.7B (3,5 Go)** natif | TI2V-5B (doc Comfy : 8 Go) ; CogVideoX-5B diffusers ≥ 5 Go |
| 12 Go (3060, 4070) | **Q4_K_M / Q5_K_M + lightx2v 4 pas ≈ 6 min / clip 480p** (mesure 3060) | Q4_K_S + délestage | Q4_K_M (11,5 Go) | GGUF Q8 | 1.7B ; 17B via block swap | LTX-2.3 Q4 (17,8 Go) → délestage |
| 16 Go (4060 Ti, 5060 Ti, T4) | fp8_scaled (14,3 Go/expert) avec T5 hors GPU, ou Q6/Q8 | Q5_K_M (15 Go) | Q5_K_M / int8 avec délestage | fp16 module + base fp8 avec block swap | 17B fp8 (17 Go) + block swap | idem |
| 24 Go (3090, 4090) | fp8 confortable ; Q8 | fp8_scaled (16,4 Go) | int8_convrot (18,4 Go) / Q8 | confortable | 17B fp8 (doc HuMo : « 3090 ») | LTX-2.3 Q4 sans délestage |
| 32 Go (5090) | tout sauf bf16 sans délestage ; NVFP4 LightX2V | fp8, presque bf16 | fp8/int8 | confortable | confortable | LTX 22 s / 81 images |

- La RAM système compte autant que la VRAM dès qu'on déleste : la perte de 50 % au-delà de 92 % de RAM (Zenn) et la config 3060 à 32 Go RAM + 45–98 Go d'échange (Civitai) indiquent **32 Go de RAM minimum, 64 Go conseillés** pour les 14B en GGUF.
- Facteur d'accélération utile : sur la même RTX 5090, la pile LightX2V NVFP4 4 pas (10,7 s) est ≈ **12× plus rapide** que ComfyUI GGUF Q4 6 pas (125 s) et ≈ 74× plus rapide que la référence 40 pas — mais réglages, attention et cadre diffèrent : c'est un ordre de grandeur, pas un rapport mesuré à iso-réglage.
- Pour 480p, Wan 2.2 TI2V-5B (720p natif, 8 Go selon Comfy) et HuMo-1.7B sont les seuls candidats « vraiment légers » du lot ; pour la parole, InfiniteTalk (fenêtres jusqu'à 40 s, 1 min avant dérive) couvre mieux un plan long de dialogue que S2V (segments de 4,81 s chaînés) ou HuMo (97 images).

### Gaps
- Aucune mesure sourcée, à réglages identiques, de Wan 2.2 I2V 4 pas en 480p sur RTX 4060 Ti 16 Go, RTX 4070 et RTX 4090 sous ComfyUI : à chronométrer nous-mêmes (protocole : 832×480×81, Q4_K_M et fp8, lightx2v 4 pas, sage-attention, chaud/froid).
- Aucune mesure Apple Silicon (MPS) ni AMD (ROCm) publiée pour Wan 2.2 / InfiniteTalk / HuMo ; prise en charge fp8 sur MPS non vérifiée.
- Aucune mesure CPU seul pour un modèle vidéo : seul l'ordre de grandeur image (5–10 min/image SD) existe.
- Temps InfiniteTalk et S2V exprimés « par seconde de vidéo » introuvables (les deux tutoriels 4090 ne donnent pas la durée produite).
- Page « computational efficiency » de Wan 2.2 (tableau par GPU) : en image dans le README, non lisible ici.

---

## 2. Calcul gratuit sans frais par génération : Kaggle, Colab, Lightning, Modal, ZeroGPU, SaladCloud, Vast.ai / RunPod (référence)

### Takeaway
Pour 10 000 clips, aucune offre gratuite ne suffit seule : Kaggle (≈ 30 h GPU T4 par semaine, ComfyUI publié en
notebooks, NSFW banni) est la seule ressource gratuite récurrente adaptée à des lots ; Modal (30 $/mois) et Lightning
(≈ 15 crédits/mois, chiffre non officiel) complètent ; ZeroGPU gratuit (3 exécutions/jour) et Colab gratuit (interfaces
web restreintes) sont marginaux. La location horaire (Salad, Vast, RunPod) sert de repère de coût, pas de solution gratuite.

### Cited Findings
- **Kaggle** (veille du 14/10, sources relues) : ≈ 30 h GPU/semaine (« 30 hours or sometimes higher depending on demand ») — [Kaggle, Efficient GPU Usage](https://www.kaggle.com/docs/efficient-gpu-usage) ; sessions de 12 h — [GPUperHour, 21/09/2026](https://gpuperhour.com/blog/free-cloud-gpus-and-credits) ; P100 retiré le 15/09/2026, T4×2 par défaut, CLI `kaggle kernels push/status/output` — [Kaggle API, kernels.md](https://github.com/Kaggle/kaggle-api/blob/main/docs/kernels.md) ; vérification par téléphone pour GPU et Internet (sources de cours) — [Calvin University CS 376](https://cs.calvin.edu/courses/cs/376/25sp/units/01introduction/lab/).
- **Kaggle et ComfyUI** : des notebooks ComfyUI publics existent — [wandaweb/ComfyUI-Kaggle](https://github.com/wandaweb/ComfyUI-Kaggle) ; [Kaggle, stable-diffusion-webui & ComfyUI](https://www.kaggle.com/code/yiyiooo/stable-diffusion-webui-comfyui?scriptVersionId=157071528). Selon un membre de l'équipe Kaggle (2023), la vague de bannissements visait le contenu NSFW, pas Stable Diffusion en soi : « NSFW content is not allowed on Kaggle, bans will continue to be issued » (extrait obtenu via moteur de recherche) — [Kaggle product-feedback 392306](https://kaggle.com/discussions/product-feedback/392306). Aucun texte de CGU Kaggle interdisant explicitement une interface web type ComfyUI n'a été trouvé.
- **Google Colab gratuit** : « bypassing the notebook UI to interact primarily via a web UI », « remote control such as SSH shells, remote desktops », « running distributed computing workers » sont restreints pour les comptes gratuits (« may be terminated at any time without warning ») ; GPU « heavily restricted », limites non publiées, 12 h maximum ; multi-comptes interdits — [FAQ Colab](https://research.google.com/colaboratory/faq.html) (veille du 14/10). Précédent 2023 : le responsable de Colab a indiqué que « stable diffusion with a webui is restricted from our free tier » — [Decrypt](https://decrypt.co/197428/google-colab-stable-diffusion-web-ui-ban).
- **Hugging Face ZeroGPU** : compte gratuit 5 min/jour (anonyme 2 min, PRO 40 min) sur demi RTX Pro 6000 Blackwell 48 Go ; Gradio uniquement ; quota décompté sur la durée **demandée** ; les comptes gratuits sont limités à « three times per day » (personnel HF, 13/04/2026) — [HF docs ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu) ; [forum HF](https://discuss.huggingface.co/t/free-account-zerogpu-quota-issue/175180) (veille du 14/10). Inference Providers : « Free Users : None » — [HF pricing](https://huggingface.co/docs/inference-providers/pricing).
- **Modal** : « $30 / month free credits » (Starter) ; T4 0,000164 $/s, L4 0,000222 $/s, A100 80 Go 0,000694 $/s, H100 0,001097 $/s ; 10 GPU simultanés — [Modal Pricing](https://modal.com/pricing) (veille du 14/10).
- **Lightning AI** : crédits gratuits « promotional, non-transferable, and do not accumulate » ; 1 Studio CPU gratuit — [Lightning billing FAQ](https://lightning.ai/docs/platform/overview/faq/billing.md) ; montant : « 15 monthly credits » selon des agrégateurs ; conversion « ≈ 80 GPU hours on spot » et vérification téléphonique selon d'autres (chiffres divergents, non officiels) ; T4 ≈ 0,19 $/h, L4 ≈ 0,48 $/h à la demande — [usagepricing.com](https://usagepricing.com/blueprint/lightning-ai) ; [GMI Cloud](https://www.gmicloud.ai/blog/where-can-i-get-free-gpu-cloud-trials-in-2026-a-complete-guide) ; [costbench](https://costbench.com/software/ai-ml-platforms/lightning-ai/).
- **SaladCloud** (GPU grand public partagés, payant à l'heure) : RTX 4090 0,160 $/h, RTX 3090 0,090 $/h (relevé du 04/08/2026) — [computeprices, Salad 4090](https://computeprices.com/providers/salad/gpus/rtx4090) ; [computeprices, Salad 3090](https://computeprices.com/providers/salad/gpus/rtx3090). Aucun palier gratuit trouvé.
- **RunPod / Vast.ai (référence)** : RTX 4090 ≈ 0,34 $/h (RunPod Community) à 0,69–0,74 $/h (Secure) ; Vast 4090 plancher ≈ 0,20 $/h, médiane ≈ 0,48 $/h ; RTX 5090 RunPod 0,99 $/h à la demande (0,69 $/h Community cité) ; Vast 5090 ≈ 0,36 $/h (interruptible) à 0,75 $/h, médiane ≈ 0,60–0,63 $/h — [hackceleration](https://www.hackceleration.com/labs/runpod-pricing) ; [Beam, 4090](https://www.beam.cloud/blog/nvidia-rtx-4090-pricing) ; [Beam, 5090](https://www.beam.cloud/blog/nvidia-rtx-5090-pricing) ; [Yotta Labs](https://www.yottalabs.ai/post/cheapest-alternatives-to-aws-for-rtx-5090-gpu-access-with-fast-cold-start-times) ; [DeployBase](https://deploybase.ai/articles/rtx-5090-on-vastai-pricing-specs-how-to-rent) (sources commerciales, dates variables).
- Images Docker ComfyUI prêtes pour ces plateformes (communautaires) : `ls250824/run-comfyui-wan2` — [Docker Hub](https://hub.docker.com/r/ls250824/run-comfyui-wan2) ; `hardandheavy/comfyui-rocm` — [Docker Hub](https://hub.docker.com/r/hardandheavy/comfyui-rocm).

### Inferences
- **Kaggle T4, calcul** : 9–15 min par clip (chiffre communautaire) × 10 clips = 1,5–2,5 h GPU par film → 30 h/semaine ≈ **12 à 20 films/semaine** → 1 000 films ≈ **50 à 83 semaines** avec un seul compte (multiplier les comptes est interdit chez Colab et à proscrire partout). Le T4 n'a ni FP8 ni NVFP4 : GGUF Q4/Q5 + LoRA 4 pas est la voie la plus probable pour réduire ces 9–15 min (gain à mesurer). Rester en ComfyUI **piloté par l'API depuis le notebook** (pas d'interface web exposée) limite le risque de CGU, et le contenu doit rester tout public.
- **ZeroGPU gratuit** : 3 exécutions/jour → ≤ 3 clips/jour → 10 000 clips ≈ 9 ans : inutilisable pour le volume, utile pour un plan clé urgent ; et ComfyUI n'y tourne pas tel quel (Spaces ZeroGPU = Gradio).
- **Modal** : 30 $ ≈ 7,6 h de H100 ou ≈ 37 h de L4 par mois ; sans mesure Wan publiée sur ces GPU, le volume mensuel n'est pas chiffrable proprement (à mesurer : un lot de 10 clips sur L4).
- **Lightning** : si 15 crédits = 15 $, ≈ 79 h de T4 à 0,19 $/h (calcul) — à confirmer sur la page officielle avant d'en dépendre.
- **Repère location** (calcul, cf. §5) : un film coûte de ≈ 0,03 $ (RTX 5090 + pile 4 pas NVFP4, 0,99 $/h) à ≈ 0,34 $ (RTX 4090 Salad, cas lent de Valdi) ; 1 000 films ≈ 30 à 340 $ — ce sont des loyers horaires, pas des frais par génération.

### Gaps
- Texte intégral actuel des CGU Kaggle (usage « production » répété, interfaces web, tunnels) non lu ; page Kaggle rendue en JavaScript.
- Montant officiel des crédits gratuits Lightning en octobre 2026 et GPU accessibles avec ; exigence de carte bancaire chez Modal non affichée.
- Débit réel de Wan 2.2 4 pas sur T4 ×2 Kaggle (un clip par GPU en parallèle) : jamais publié.
- SaladCloud : existence d'un crédit d'essai non vérifiée ; CGU sur les charges vidéo non lues.

---

## 3. Automatiser ComfyUI : API HTTP / WebSocket, export « API », mode sans interface, Docker, comfy-cli — et licences

### Takeaway
ComfyUI s'automatise entièrement par HTTP (`POST /prompt`, `POST /upload/image`, `GET /history/{id}`, `GET /view`) et
par WebSocket `/ws` ; on exporte le graphe en format API (« File → Export (API) ») et on lance le serveur sans navigateur
(`--listen`, `--port`, `comfy launch --background`). ComfyUI, comfy-cli, VideoHelperSuite et KJNodes sont **GPL-3.0** ;
ComfyUI-GGUF et WanVideoWrapper sont **Apache-2.0**.

### Cited Findings
- Routes documentées : `POST /prompt` (« validates the prompt and adds it to an execution queue », renvoie `prompt_id` et `number`, ou `error` + `node_errors`) ; `GET /prompt` (état de la file) ; `POST /upload/image`, `POST /upload/mask` ; `GET /view` ; `GET /history`, `GET /history/{prompt_id}`, `POST /history` (purge) ; `GET/POST /queue` ; `POST /interrupt` ; `POST /free` (décharger des modèles) ; `GET /object_info[/{node_class}]` ; `GET /system_stats` (Python, périphériques, VRAM) ; `GET /models/{folder}` ; `/userdata…` — [docs.comfy.org, Routes](https://docs.comfy.org/development/comfyui-server/comms_routes).
- WebSocket `/ws` : messages `status`, `execution_start`, `execution_cached`, `executing`, `progress`, `executed` — [docs.comfy.org, Routes](https://docs.comfy.org/development/comfyui-server/comms_routes).
- Format API : « This is the ComfyUI api prompt format. If you want it for a specific workflow you can "File -> Export (API)" in the interface » ; envoi `{"prompt": …}` vers `http://127.0.0.1:8188/prompt` — [script_examples/basic_api_example.py](https://github.com/comfyanonymous/ComfyUI/blob/master/script_examples/basic_api_example.py) ; exemples WebSocket `websockets_api_example.py` et `websockets_api_example_ws_images.py` présents (observé, HTTP 200) — [ComfyUI script_examples](https://github.com/comfyanonymous/ComfyUI/tree/master/script_examples).
- Options serveur : `--listen` (défaut 127.0.0.1 ; sans valeur = « 0.0.0.0,:: »), `--port` (défaut 8188), `--tls-keyfile/--tls-certfile`, `--enable-cors-header`, `--max-upload-size` (défaut 100 Mo), `--input-directory`, `--output-directory`, `--cuda-device`, `--multi-user`, `--preview-method` (défaut aucune) — [cli_args.py](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy/cli_args.py). « Runs fully offline » ; `--offline` coupe les nœuds API payants — [ComfyUI README](https://github.com/comfyanonymous/ComfyUI/blob/master/README.md).
- comfy-cli : `pip install comfy-cli` puis `comfy install` (option `--fast-deps` avec uv, `--skip-manager`) ; `comfy launch -- --cpu --listen 0.0.0.0` ; `comfy launch --background` ; `comfy --workspace=~/comfy launch --background -- --listen 10.0.0.10 --port 8000` ; `comfy run --workflow ./workflow.json` (local ou `--where cloud`, le cloud consommant des crédits Comfy Cloud et exigeant un abonnement) — [comfy-cli README](https://github.com/Comfy-Org/comfy-cli) ; [ComfyUI README](https://github.com/comfyanonymous/ComfyUI/blob/master/README.md).
- Pas d'image Docker officielle mentionnée dans le README de ComfyUI (seulement un conteneur OpenSSL pour les certificats) — [ComfyUI README](https://github.com/comfyanonymous/ComfyUI/blob/master/README.md) ; images communautaires citées au §2.
- Licences (fichiers LICENSE bruts, observé le 16/10/2026) : ComfyUI **GPL-3.0** — [LICENSE](https://github.com/comfyanonymous/ComfyUI/blob/master/LICENSE) ; comfy-cli **GPL-3.0** — [LICENSE](https://github.com/Comfy-Org/comfy-cli/blob/main/LICENSE) ; ComfyUI-VideoHelperSuite **GPL-3.0** — [LICENSE](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite/blob/main/LICENSE) ; ComfyUI-KJNodes **GPL-3.0** — [LICENSE](https://github.com/kijai/ComfyUI-KJNodes/blob/main/LICENSE) ; ComfyUI-GGUF (city96) **Apache-2.0** — [LICENSE](https://github.com/city96/ComfyUI-GGUF/blob/main/LICENSE) ; ComfyUI-WanVideoWrapper (Kijai) **Apache-2.0** — [LICENSE](https://github.com/kijai/ComfyUI-WanVideoWrapper/blob/main/LICENSE) ; LightX2V **Apache-2.0** — [LICENSE](https://github.com/ModelTC/LightX2V/blob/main/LICENSE).
- Licences des poids : Wan2.2 I2V/S2V/Animate **Apache-2.0** ; InfiniteTalk **Apache-2.0** (HF + `LICENSE.txt` GitHub) ; HuMo **Apache-2.0** ; GGUF QuantStack et Kijai **Apache-2.0** ; LoRA `lightx2v/Wan2.2-Distill-Loras` **Apache-2.0** (dépôt modifié le 16/10/2026) — [API Hugging Face](https://huggingface.co/api/models/Wan-AI/Wan2.2-S2V-14B) (observé). CogVideoX-2B **Apache-2.0** ; CogVideoX-5B / 1.5 : « CogVideoX License » (usage commercial après enregistrement, plafond « 1 million visits per month ») — [LICENSE CogVideoX-5b-I2V](https://huggingface.co/zai-org/CogVideoX-5b-I2V/blob/main/LICENSE). LTX-2 / 2.3 : « LTX-2 Community License » — les entités dont le chiffre d'affaires annuel atteint **10 000 000 $** doivent obtenir une licence commerciale payante — [LICENSE LTX-2.3](https://huggingface.co/Lightricks/LTX-2.3/blob/main/LICENSE) ; LTX-Video 0.9.5+ : OpenRAIL-M — [LTX-Video README](https://github.com/Lightricks/LTX-Video).

### Inferences
- **Chaîne type (sans navigateur)** : `comfy launch --background -- --listen 127.0.0.1 --highvram` → pour chaque plan : `POST /upload/image` (image de départ Blender) → modifier le JSON exporté en API (nom d'image, graine, prompt, nombre d'images) → `POST /prompt` → suivre `/ws` (`executing` avec `node: null` = fini) → `GET /history/{prompt_id}` → `GET /view?filename=…&type=output` pour rapatrier le MP4. Garder le serveur chaud (pas de rechargement des 14 Go entre clips) évite l'écart froid/chaud mesuré (143,9 s vs 125 s sur 5090).
- **GPL-3.0 et règle maison (MIT/Apache/BSD seulement pour ce qui s'exécute chez nous)** : ComfyUI, comfy-cli et VideoHelperSuite sont hors règle. Lecture courante de la GPL (FAQ GNU non relue dans cette session, serveur gnu.org indisponible) : les obligations naissent à la **distribution** ; deux programmes qui ne communiquent que par HTTP/sockets sont en général traités comme des programmes séparés. Utiliser ComfyUI comme **serveur à part, non modifié, non redistribué** dans « MASSAMBA Workbench » n'imposerait donc pas la GPL à l'app — mais la règle maison l'exclut quand même tant que l'utilisateur ne l'a pas levée. Voie conforme sans exception : **LightX2V (Apache-2.0) ou diffusers** pour exécuter Wan/InfiniteTalk/HuMo, plus rapides de surcroît (×2 annoncé par LightX2V ; 10,7 s/clip NVFP4 sur 5090), ComfyUI restant un banc d'essai externe ; WanVideoWrapper et ComfyUI-GGUF (Apache-2.0) peuvent servir de référence de code à reproduire.
- Ne jamais embarquer de nœud GPL dans le paquet livré ; si ComfyUI est utilisé, l'installer côté utilisateur (`comfy install`) plutôt que de le redistribuer dans `A ENVOYER`.

### Gaps
- Texte exact de la FAQ GPL (« MereAggregation », réseau/AGPL) non relu : gnu.org a répondu 429 puis 503 le 16/10/2026.
- Licence du dépôt `Kijai/WanVideo_comfy` (poids repackagés, lightx2v) non vérifiée fichier par fichier.
- Sous-commandes locales de comfy-cli (`comfy jobs`, `comfy download`, `comfy upload`) mentionnées dans le README mais non testées.

---

## 4. Fichiers exacts pour Wan 2.2 I2V / S2V / Animate, InfiniteTalk, HuMo (dépôts Comfy-Org), tailles et dossiers

### Takeaway
Tout est dans trois dépôts Comfy-Org (Wan_2.2_ComfyUI_Repackaged, Wan_2.1_ComfyUI_repackaged, HuMo_ComfyUI) plus
Wan-Animate-2 ; chaque sous-dossier `split_files/<x>` correspond au dossier `ComfyUI/models/<x>`. Prévoir ≈ 30–40 Go
par modèle en fp8, ≈ 20–25 Go en GGUF Q4.

### Cited Findings
- **Wan 2.2 I2V-A14B** — `ComfyUI/models/diffusion_models/` : `wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors` (14,29 Go) + `wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors` (14,29 Go) [ou fp16 : 28,58 Go chacun] ; `models/vae/` : `wan_2.1_vae.safetensors` (0,25 Go) ; `models/text_encoders/` : `umt5_xxl_fp8_e4m3fn_scaled.safetensors` (6,74 Go) ; `models/loras/` : `wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors` et `…_low_noise.safetensors` (1,23 Go chacun) — tailles observées : [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged) ; dossiers : [docs.comfy.org, Wan2.2](https://docs.comfy.org/tutorials/video/wan/wan2_2). LoRA lightx2v I2V plus récentes (12/04/2026) : `Wan_2_2_I2V_A14B_HIGH_lightx2v_4step_lora_260412_rank_64_fp16.safetensors` et `…LOW…` (0,63 Go ; rang 256 : 2,50 Go) — [Kijai/WanVideo_comfy, LoRAs/Wan22_Lightx2v](https://huggingface.co/Kijai/WanVideo_comfy/tree/main/LoRAs/Wan22_Lightx2v).
- **Wan 2.2 TI2V-5B** : `wan2.2_ti2v_5B_fp16.safetensors` (10,0 Go, diffusion_models) + `wan2.2_vae.safetensors` (1,41 Go, vae) + umt5 fp8 — [docs.comfy.org, Wan2.2](https://docs.comfy.org/tutorials/video/wan/wan2_2) ; tailles observées sur le repack.
- **Wan 2.2 S2V-14B** : `diffusion_models/wan2.2_s2v_14B_fp8_scaled.safetensors` (16,39 Go ; défaut du modèle de workflow) ou `wan2.2_s2v_14B_bf16.safetensors` (32,59 Go) ; `text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors` ; `audio_encoders/wav2vec2_large_english_fp16.safetensors` (0,63 Go ; « create the folder if it's missing ») ; `vae/wan_2.1_vae.safetensors` ; LoRA optionnelle `wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors` — [docs.comfy.org, Wan2.2 S2V](https://docs.comfy.org/tutorials/video/wan/wan2-2-s2v) ; tailles observées sur le repack.
- **Wan 2.2 Animate-14B** : `wan2.2_animate_14B_bf16.safetensors` (34,55 Go) ou `wan2.2_animate_14B_int8_convrot.safetensors` (18,41 Go) ; LoRA `wan2.2_animate_14B_relight_lora_bf16.safetensors` (1,44 Go) — [repack Wan 2.2](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files) (observé). Nouveau dépôt **Comfy-Org/Wan-Animate-2** (modifié le 23/09/2026, Apache-2.0) : `diffusion_models/wan_animate_2_bf16.safetensors` (32,79 Go), `wan_animate_2_distill_bf16.safetensors` (32,79 Go), `wan_animate_2_int8_convrot.safetensors` et `wan_animate_2_distill_int8_convrot.safetensors` (16,65 Go) ; `clip_vision/clip_vision_h.safetensors` (1,26 Go) ; `loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors` (0,74 Go) ; `vae/Wan2_1_VAE_bf16.safetensors` (0,25 Go) ; umt5 fp8/fp16 — [Comfy-Org/Wan-Animate-2](https://huggingface.co/Comfy-Org/Wan-Animate-2) (observé).
- **InfiniteTalk (natif ComfyUI)** : `split_files/model_patches/wan2.1_infiniteTalk_single_fp16.safetensors` (5,13 Go) et `wan2.1_infiniteTalk_multi_fp16.safetensors` (5,12 Go) ; base `diffusion_models/wan2.1_i2v_480p_14B_fp8_scaled.safetensors` (16,40 Go) ; `clip_vision/clip_vision_h.safetensors` (1,26 Go) — [Comfy-Org/Wan_2.1_ComfyUI_repackaged](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files) (observé). Variante Kijai : `InfiniteTalk/Wan2_1-InfiniTetalk-Single_fp16.safetensors` (5,13 Go) — [Kijai/WanVideo_comfy](https://huggingface.co/Kijai/WanVideo_comfy/tree/main/InfiniteTalk) ; GGUF Q4_K_M 1,40 Go / Q6_K 2,04 / Q8 2,65 — [Kijai/WanVideo_comfy_GGUF](https://huggingface.co/Kijai/WanVideo_comfy_GGUF/tree/main/InfiniteTalk).
- **HuMo** : `split_files/diffusion_models/humo_17B_fp8_e4m3fn.safetensors` (17,06 Go), `humo_17B_fp16.safetensors` (34,11 Go), `humo_1.7B_fp16.safetensors` (3,48 Go) ; `split_files/audio_encoders/whisper_large_v3_fp16.safetensors` (3,09 Go) — [Comfy-Org/HuMo_ComfyUI](https://huggingface.co/Comfy-Org/HuMo_ComfyUI) (observé, Apache-2.0, modifié le 23/09/2026). Variante Kijai : `HuMo/Wan2_1-HuMo-14B_fp16.safetensors` (34,11 Go), `HuMo/whisper_large_v3_encoder_fp16.safetensors` (1,69 Go) — [Kijai/WanVideo_comfy](https://huggingface.co/Kijai/WanVideo_comfy/tree/main/HuMo).
- **GGUF** (nœud ComfyUI-GGUF) : « Place the .gguf model files in your `ComfyUI/models/unet` folder », chargeur « GGUF Unet loader » (catégorie `bootleg`) — [ComfyUI-GGUF README](https://github.com/city96/ComfyUI-GGUF). WanVideoWrapper charge aussi les GGUF « in the main model loader » — [WanVideoWrapper README](https://github.com/kijai/ComfyUI-WanVideoWrapper).
- **LTX-2.3** : dépôt `Comfy-Org/ltx-2.3` (licence « other »), LoRA distillée `ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors` (2,74 Go) — [Comfy-Org/ltx-2.3](https://huggingface.co/Comfy-Org/ltx-2.3) (observé).

### Inferences
- **Budget disque par film-type (calcul)** : Wan 2.2 I2V fp8 (2 × 14,29) + umt5 fp8 6,74 + VAE 0,25 + LoRA 4 pas 2 × 1,23 ≈ **38 Go** ; en GGUF Q4_K_M (2 × 9,65) ≈ **28 Go** ; InfiniteTalk (base fp8 16,40 + module 5,13 + clip_vision 1,26 + umt5 6,74 + VAE) ≈ **30 Go** ; HuMo-1.7B + whisper ≈ **7 Go** (+ umt5 et VAE). Sur Kaggle, joindre ces poids comme dataset/modèle Kaggle évite de les retélécharger à chaque session (veille du 14/10).
- Correspondance `split_files/<dossier>` → `ComfyUI/models/<dossier>` : confirmée par les docs pour diffusion_models, text_encoders, vae, audio_encoders ; supposée identique pour `model_patches`, `clip_vision`, `loras`.

### Gaps
- Encodeur audio exact du modèle de workflow natif InfiniteTalk (wav2vec2 chinois ou anglais ?) non trouvé dans les dépôts Comfy-Org lus.
- Version minimale de ComfyUI requise pour InfiniteTalk/HuMo natifs : la doc S2V dit seulement « update ComfyUI » / « Nightly ».

---

## 5. Temps et électricité par film d'une minute (calcul) et choix pour ~1 000 films

### Takeaway
Calcul à partir des mesures publiées : un film (10 clips 480p) coûte de **≈ 0,016 kWh / 2 min** (RTX 5090 + pile
LightX2V NVFP4 4 pas) à **≈ 0,5 kWh / 2 h** (RTX 4090 sous ComfyUI non distillé) ; la RTX 3060 12 Go avec GGUF + 4 pas
tourne autour de **1 h et ≈ 0,17–0,27 kWh** par film. Pour 1 000 films, seul un GPU récent avec modèle 4 pas tient
l'échelle (≈ 30 h à ≈ 350 h de calcul) ; Kaggle gratuit demande ≈ 1 an.

### Cited Findings
- Puissances mesurées pendant Wan 2.1 I2V sous ComfyUI : RTX 4090 moyenne 235 W (pic 450 W), RTX 5090 moyenne ≈ 520 W (pic ≈ 587 W) — [Valdi.ai](https://www.valdi.ai/blog/rtx-5090-vs-4090-in-the-real-world-of-image-to-video-inference).
- Puissances nominales (TGP) : RTX 4090 450 W, RTX 4070 200 W, RTX 4060 Ti 160–165 W, RTX 5090 575 W ; RTX 3060 ≈ 170 W (déduit indirectement) — [HotHardware](https://hothardware.com/news/nvidias-geforce-rtx-5090-600w-gpu-not-so-fast) ; [Club386](https://club386.com/nvidia-geforce-rtx-50-series-could-consume-up-to-500w) ; [macmyths](https://macmyths.com/rtx-5090s-rumored-575w-power-rating-was-right-but-nvidia-calls-it-tgp/) (sources secondaires).
- Temps par clip utilisés : 10,7 s ([LightWan2.2-A14B](https://huggingface.co/lightx2v/LightWan2.2-A14B)), 125 s ([Zenn](https://zenn.dev/toki_mwc/articles/ltx23-vs-wan22-i2v-benchmark-rtx5090?locale=en)), 763 s ([Valdi](https://www.valdi.ai/blog/rtx-5090-vs-4090-in-the-real-world-of-image-to-video-inference)), ≈ 360 s ([Civitai 3060](https://civitai.com/models/2121649/another-wan22-workflow-4steps-i2vflft2v)), 9–15 min ([WanGP-Kaggle](https://github.com/kayas881/WanGP-Kaggle)), 22,1 s pour 81 images LTX ([Zenn](https://zenn.dev/toki_mwc/articles/ltx23-vs-wan22-i2v-benchmark-rtx5090?locale=en)).

### Inferences
**Calcul** — formule : kWh/film = 10 clips × t_clip (s) × P (W) ÷ 3 600 000. Hypothèses : P = puissance moyenne mesurée
quand elle existe (Valdi), sinon TGP (plafond) ; +100 W pour le reste du PC = **hypothèse** ; temps de chargement des
modèles exclus (serveur gardé chaud) ; tarif électrique **hypothétique**, à remplacer par le tarif réel.

| Cas (GPU · pile · pas) | t/clip | GPU-heures / film | kWh GPU / film | kWh avec +100 W PC | 1 000 films : durée de calcul · kWh (GPU+PC) | Coût élec. 1 000 films à 0,20 €/kWh (hyp.) |
|---|---|---|---|---|---|---|
| A. RTX 5090 · LightX2V NVFP4 4 NFE (hors ComfyUI) · P = 520 W | 10,7 s | 0,030 h | 0,0155 | 0,0185 | ≈ 30 h · ≈ 18,5 kWh | ≈ 3,7 € |
| B. RTX 5090 · ComfyUI WanVideoWrapper GGUF Q4 6 pas · 520 W | 125 s | 0,347 h | 0,181 | 0,215 | ≈ 347 h (14,5 j) · ≈ 215 kWh | ≈ 43 € |
| C. RTX 4090 · ComfyUI Wan 2.1 I2V (réglages Valdi) · 235 W mesurés | 763 s | 2,12 h | 0,498 | 0,710 | ≈ 2 119 h (88 j) · ≈ 710 kWh | ≈ 142 € |
| D. RTX 3060 12 Go · GGUF Q5 + lightx2v 4 pas · 170 W (TGP, plafond) | ≈ 360 s | 1,0 h | 0,170 | 0,270 | ≈ 1 000 h (42 j) · ≈ 270 kWh | ≈ 54 € |
| E. Kaggle T4 (gratuit) | 9–15 min | 1,5–2,5 h | 0 (hors facture) | 0 | ≈ 1 500–2 500 h → 50–83 semaines à 30 h/sem. | 0 € |
| F. RTX 5090 · LTX-2.3 distillé Q4 (≈ 15 clips de 81 images à 24 i/s pour 50 s) · 520 W | 22,1 s | 0,092 h | 0,048 | 0,057 | ≈ 92 h · ≈ 57 kWh | ≈ 11 € (licence LTX hors règle maison) |

- Repère location (calcul, prix du §2) : A sur RunPod 5090 à 0,99 $/h ≈ 0,03 $/film ; B sur Vast 5090 à 0,36–0,75 $/h ≈ 0,12–0,26 $/film ; C sur Salad 4090 à 0,16 $/h ≈ 0,34 $/film ; D sur Salad 3090-classe à 0,09 $/h ≈ 0,09 $/film (si le débit 3090 ≈ 3060, non vérifié).
- **Lecture** : le facteur dominant n'est pas le GPU mais le **nombre de pas** (40 → 4) et la pile (NVFP4/attention creuse) : B → A divise le temps par ≈ 12 sur la même carte. Une 3060 avec 4 pas (D) bat une 4090 sans distillation (C) en énergie par film.
- **Choix proposé pour ~1 000 films (inférence)** : 1) GPU local NVIDIA ≥ 12 Go avec Wan 2.2 I2V GGUF/fp8 + LoRA lightx2v 4 pas, serveur chaud piloté par l'API, en visant la pile Apache LightX2V dès que possible (règle maison) ; 2) Kaggle T4 en lots hebdomadaires pour absorber le surplus sans frais (≈ 12–20 films/semaine) ; 3) location ponctuelle d'une 5090 (≈ 0,03–0,26 $/film) pour un sprint ; 4) ZeroGPU/Colab gratuits seulement pour un plan clé isolé.
- **Création au-delà des références (proposition, critère testable)** : file « 10 clips = 1 film » où chaque clip démarre sur la dernière image du précédent (première/dernière image, `WanFirstLastFrameToVideo`) et où un compteur de joules par clip (lecture `nvidia-smi` toutes les secondes pendant `executing`) alimente le registre de coûts de l'app ; critère : écart < 10 % entre kWh prédit par ce tableau et kWh mesuré sur 10 films, et 0 rechargement de modèle entre clips (`execution_cached` présent).

### Gaps
- Aucune mesure de puissance publiée pour RTX 3060 / 4060 Ti / 4070 pendant Wan : le cas D utilise le TGP (plafond) et +100 W de PC hypothétiques.
- Temps A mesuré hors ComfyUI (LightX2V) et en T2V/I2V « 480p » sans nombre d'images précisé dans la fiche ; cas B en 6 pas au lieu de 4 ; cas C sans résolution ni pas : les six cas ne sont pas à iso-réglage — à remplacer par nos propres chronos sur un lot de 10 clips.
- Tarif électrique réel de l'utilisateur inconnu (le 0,20 €/kWh est une hypothèse de calcul).
- Temps de décodage VAE, d'interpolation (16 → 24/30 i/s) et de montage non inclus.
