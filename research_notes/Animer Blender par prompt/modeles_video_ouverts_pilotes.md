# Modèles vidéo à poids ouverts pilotables par un rendu Blender + prompt (état au 14/10/2026)

Méthode : toutes les sources ont été lues le 14/10/2026. « Licence **vérifiée** » = texte du fichier LICENSE lu sur la
source primaire (dépôt Hugging Face de l'organisation officielle ou dépôt GitHub officiel) pendant cette recherche.
« Déclarée » = seulement le champ `license:` de la fiche officielle (pas de fichier LICENSE dans le dépôt, ou texte non
relu). « Communauté » = mesure d'un particulier, pas de l'éditeur. Les calculs marqués « dérivé » sont de simples
multiplications à partir de chiffres cités, pas des mesures. Règle du projet : MIT / Apache-2.0 / BSD seulement.

---

## Q1 — Famille Wan 2.1 / 2.2 (VACE, Fun-Control / InP, Animate, Animate-2, TI2V-5B) : licences, VRAM, vitesse, variantes rapides et quantifiées

### Takeaway
Toute la famille Wan pertinente pour piloter un rendu Blender (VACE 1.3B/14B, Wan2.2-Fun-Control/InP/VACE-Fun,
Wan2.2-Animate-14B, **Wan-Animate-2 (sorti le 07/08/2026)**, TI2V-5B) est sous Apache-2.0, avec un écosystème Apache
d'accélération (LightX2V 4 étapes, GGUF QuantStack, FP8 Kijai). Chiffres officiels sur RTX 4090 : Wan2.1-1.3B 480p =
261 s / 8,19 Go par clip ; TI2V-5B 720p ≈ 525–535 s / 22,8–22,9 Go par clip ; les 14B demandent 41–60 Go sans
quantification/offload.

### Cited Findings

**Licences (lues le 14/10/2026)**
- Wan2.1-VACE-14B : fichier `LICENSE.txt` du dépôt officiel = Apache License 2.0 → **vérifiée** — [HF Wan-AI/Wan2.1-VACE-14B LICENSE.txt](https://huggingface.co/Wan-AI/Wan2.1-VACE-14B/blob/main/LICENSE.txt). VACE-1.3B : fiche `license: apache-2.0` + `LICENSE.txt` présent (même éditeur) — [HF Wan-AI/Wan2.1-VACE-1.3B](https://huggingface.co/Wan-AI/Wan2.1-VACE-1.3B). Code VACE : Apache-2.0 **vérifiée** — [GitHub ali-vilab/VACE LICENSE.txt](https://github.com/ali-vilab/VACE/blob/main/LICENSE.txt).
- Code Wan2.2 : Apache-2.0 **vérifiée** — [GitHub Wan-Video/Wan2.2 LICENSE.txt](https://github.com/Wan-Video/Wan2.2/blob/main/LICENSE.txt). Poids Wan2.2 TI2V-5B, I2V-A14B, T2V-A14B, S2V-14B, Animate-14B : `license: apache-2.0` sur les fiches officielles, sans fichier LICENSE dans les dépôts HF → **déclarée** — [HF Wan-AI/Wan2.2-Animate-14B](https://huggingface.co/Wan-AI/Wan2.2-Animate-14B), [HF Wan-AI/Wan2.2-TI2V-5B](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B).
- Wan-Animate-2 : code Apache-2.0 **vérifiée** — [GitHub Wan-Video/Wan-Animate-2 LICENSE](https://github.com/Wan-Video/Wan-Animate-2/blob/main/LICENSE) ; poids `license: apache-2.0` (déclarée) — [HF Wan-AI/Wan2.2-Animate-2-14B](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B), variantes Diffusers et Distilled-Diffusers créées le 06/08/2026, Apache déclarée — [HF Wan2.2-Animate-2-14B-Distilled-Diffusers](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B-Distilled-Diffusers).
- Wan2.2-Fun (alibaba-pai : Fun-A14B-Control, Fun-A14B-InP, Fun-5B-Control, VACE-Fun-A14B) : `license: apache-2.0` déclarée — [HF alibaba-pai/Wan2.2-Fun-A14B-Control](https://huggingface.co/alibaba-pai/Wan2.2-Fun-A14B-Control), [HF alibaba-pai/Wan2.2-VACE-Fun-A14B](https://huggingface.co/alibaba-pai/Wan2.2-VACE-Fun-A14B) ; code VideoX-Fun Apache-2.0 **vérifiée** — [GitHub aigc-apps/VideoX-Fun LICENSE](https://github.com/aigc-apps/VideoX-Fun/blob/main/LICENSE).
- Accélérations : LightX2V (code) Apache-2.0 **vérifiée** — [GitHub ModelTC/LightX2V LICENSE](https://github.com/ModelTC/LightX2V/blob/main/LICENSE) ; poids `lightx2v/Wan2.2-Lightning`, `Wan2.2-Distill-Models`, `Wan2.2-Distill-Loras`, `Wan2.2-NVFP4-Sparse` : Apache-2.0 déclarée — [HF lightx2v/Wan2.2-Distill-Models](https://huggingface.co/lightx2v/Wan2.2-Distill-Models), [HF lightx2v/Wan2.2-Lightning](https://huggingface.co/lightx2v/Wan2.2-Lightning). `lightx2v/Wan2.1-T2V-1.3B-Distill-Models` (13/06/2026) : **aucun champ licence** → à vérifier — [HF listing lightx2v](https://huggingface.co/lightx2v).
- Builds quantifiés : QuantStack `Wan2.1_14B_VACE-GGUF`, `Wan2.2-VACE-Fun-A14B-GGUF`, `Wan2.2-Animate-14B-GGUF`, `Wan2.2-TI2V-5B-GGUF` = Apache-2.0 déclarée — [HF QuantStack/Wan2.1_14B_VACE-GGUF](https://huggingface.co/QuantStack/Wan2.1_14B_VACE-GGUF), [HF QuantStack/Wan2.2-Animate-14B-GGUF](https://huggingface.co/QuantStack/Wan2.2-Animate-14B-GGUF) ; Kijai `WanVideo_comfy_fp8_scaled` = Apache-2.0 déclarée — [HF Kijai/WanVideo_comfy_fp8_scaled](https://huggingface.co/Kijai/WanVideo_comfy_fp8_scaled) ; `Kijai/WanVideo_comfy` n'a **pas** de licence globale (contenu mixte, dont un fichier de licence propre à la LoRA « Ditto ») → licence fichier par fichier — [HF Kijai/WanVideo_comfy](https://huggingface.co/Kijai/WanVideo_comfy).
- Distillations « temps réel » à EXCLURE : CausVid = CC BY-NC-SA 4.0 (**vérifiée**, non commercial) — [GitHub tianweiy/CausVid LICENSE.md](https://github.com/tianweiy/CausVid/blob/master/LICENSE.md), fiche HF `cc-by-nc-4.0` (divergence NC vs NC-SA entre code et poids) — [HF tianweiy/CausVid](https://huggingface.co/tianweiy/CausVid) ; LongLive-1.3B (NVIDIA) `cc-by-nc-sa-4.0` déclarée — [HF Efficient-Large-Model/LongLive-1.3B](https://huggingface.co/Efficient-Large-Model/LongLive-1.3B). Acceptables : Self-Forcing code Apache-2.0 **vérifiée** — [GitHub guandeh17/Self-Forcing LICENSE](https://github.com/guandeh17/Self-Forcing/blob/main/LICENSE), poids `apache-2.0` déclarée — [HF gdhe17/Self-Forcing](https://huggingface.co/gdhe17/Self-Forcing) ; Krea Realtime 14B `apache-2.0` déclarée — [HF krea/krea-realtime-video](https://huggingface.co/krea/krea-realtime-video).

**Contrôles et fonctions**
- VACE = modèle « tout-en-un » : référence→vidéo (R2V), vidéo→vidéo (V2V, ex. `--task depth`), édition masquée (MV2V : inpainting par bbox/masque, outpainting, extension) ; outils de prétraitement `vace_preproccess.py --task depth|inpainting…` — [GitHub ali-vilab/VACE README](https://github.com/ali-vilab/VACE). VACE-1.3B : 480p ; VACE-14B : 480p et 720p ; le 1.3B « peut » faire du 720p mais « less stable » — [GitHub Wan-Video/Wan2.1 README](https://github.com/Wan-Video/Wan2.1). Le contrôle « Layout » de VACE = boîtes colorées par sujet sur fond blanc (recette reprise par MiniMax-H3-ControlNet) — [HF alibaba-pai/MiniMax-H3-Fun-Controlnet-Union-2.0](https://huggingface.co/alibaba-pai/MiniMax-H3-Fun-Controlnet-Union-2.0).
- Wan2.2-Fun-A14B-Control : contrôles Canny, Depth, Pose, MLSD + contrôle de trajectoire, mode « Generic Control Video + Reference Image » ; poids 64,0 Go ; variante Control-Camera multi-résolution 512/768/1024 — [HF alibaba-pai/Wan2.2-Fun-A14B-Control](https://huggingface.co/alibaba-pai/Wan2.2-Fun-A14B-Control). Wan2.2-Fun-5B-Control : 23,0 Go, mêmes contrôles ; 5B-Control-Camera entraîné à 121 images / 24 i/s — [HF alibaba-pai/Wan2.2-Fun-5B-Control](https://huggingface.co/alibaba-pai/Wan2.2-Fun-5B-Control).
- Wan2.2-VACE-Fun : « controlled generation and subject reference » (schéma VACE) ; Wan2.1-Fun V1.1 : 512/768/1024, 81 images à 16 i/s, T2V, I2V, **première/dernière image**, contrôle, caméra — [GitHub aigc-apps/VideoX-Fun README](https://github.com/aigc-apps/VideoX-Fun). I2V première+dernière image via `validation_image_start` / `validation_image_end` ; V2V contrôlé via `control_video` (Canny/Pose/Depth) — [GitHub VideoX-Fun README](https://github.com/aigc-apps/VideoX-Fun).
- VideoX-Fun : modes mémoire `model_cpu_offload`, `model_cpu_offload_and_qfloat8` (transformer en float8, « may slightly reduce model performance »), `sequential_cpu_offload` ; GPU testés : RTX 3060 12 Go et 3090 24 Go (Windows), V100 16 Go, A10 24 Go, A100 40/80 Go (Linux) — [GitHub VideoX-Fun README](https://github.com/aigc-apps/VideoX-Fun).
- Wan2.2-Animate-14B (19/09/2025) : entrée = vidéo + image du personnage ; mode « animation » ou « replacement » (le personnage remplace l'acteur dans la vidéo d'origine) ; prétraitement `--retarget_flag` / `--replace_flag` ; LoRA de ré-éclairage `--use_relighting_lora` ; intégré à Diffusers le 13/11/2025 — [GitHub Wan-Video/Wan2.2 README](https://github.com/Wan-Video/Wan2.2).
- Article Wan-Animate : segments de 78 images (77 générées), budget de jetons ≈ 1280×720, enchaînement par les 1 ou 5 dernières images ; corps piloté par squelette 2D, « particularly for non-humanoid characters with unconventional shapes » ; visage par traits implicites injectés dans des « Face Blocks » tous les 5 blocs ; limites : déformations si grosse différence de corps en remplacement, erreurs du squelette 2D, retargeting déconseillé en remplacement ; pas d'évaluation explicite sur cartoon/anime — [arXiv 2509.14055 (HTML)](https://arxiv.org/html/2509.14055v1).
- Workflow ComfyUI officiel Wan-Animate : `Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ` ou bf16, LoRA d'accélération 4 étapes `lightx2v_I2V_14B_480p_cfg_step_distill_rank64`, estimateur DWPose, groupe « Video Extend » = +77 images (≈ 4,81 s) ; aucune VRAM ni durée indiquée — [docs.comfy.org Wan2.2 Animate](https://docs.comfy.org/tutorials/video/wan/wan2-2-animate).
- **Wan-Animate-2 (Base + Distillation, 07/08/2026)** : framework de bout en bout qui « directly consumes driving videos … eliminating intermediate motion extractors », contrôle du point de vue caméra par le texte, variante Lite « real-time » (poids publiés : Base et Distillation seulement) ; réglages par défaut prévus pour 8× A800 en 720p, 480p testé sur 2× A800 ; Distillation = 10 étapes sans CFG ; `WanAnimate2Pipeline` dans Diffusers (PR #14412), intégrations DiffSynth-Studio et ComfyUI cochées ; exemple officiel = petite chatte tigrée en uniforme (personnage cartoon anthropomorphe) — [HF Wan-AI/Wan2.2-Animate-2-14B](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B), [arXiv 2608.06009](https://arxiv.org/abs/2608.06009) (l'abstract ne donne ni GPU, ni latence chiffrée).
- TI2V-5B : VAE 16×16×4, T2V+I2V 720p à 24 i/s ; le 720p de TI2V est `1280*704` **ou `704*1280`** (vertical natif) ; tourne sur ≥ 24 Go (RTX 4090) avec `--offload_model True --convert_model_dtype --t5_cpu` — [GitHub Wan-Video/Wan2.2 README](https://github.com/Wan-Video/Wan2.2). Les A14B : « at least 80GB VRAM » en commande de base — [même source](https://github.com/Wan-Video/Wan2.2).
- Wan-Dancer-14B (13/07/2026, Apache déclarée) : musique→danse longue durée — [HF Wan-AI/Wan-Dancer-14B](https://huggingface.co/Wan-AI/Wan-Dancer-14B) (peu pertinent pour la comédie dialoguée).

**Vitesse et VRAM officielles (format « temps total (s) / pic mémoire (Go) », 1 GPU)**
- Wan2.1 T2V-1.3B 480p sur RTX 4090 (offload + T5 sur CPU) : **261,4 s / 8,19 Go** ; texte de la fiche : « 5-second 480P video on an RTX 4090 in about 4 minutes (without optimization techniques like quantization) » — [HF Wan-AI/Wan2.1-VACE-1.3B (tableau comp_effic)](https://huggingface.co/Wan-AI/Wan2.1-VACE-1.3B).
- Wan2.2 sur RTX 4090, TI2V-5B 720p : T2V **534,7 s / 22,9 Go** ; I2V **524,8 s / 22,8 Go** — [HF Wan-AI/Wan2.2-TI2V-5B (tableau comp_effic)](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B).
- Wan2.2 A14B, 1 GPU : H100/H800 480p 326,9 s / 41,3 Go (T2V), 327,8 s / 41,0 Go (I2V) ; 720p ≈ 1041–1056 s / 59,7–59,8 Go ; A100 480p 785,7–810,0 s ; 720p 2735,7–2810,9 s — [même tableau](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B).
- LightX2V, Wan2.1-I2V-14B-480P (40 étapes, 81 images) : RTX 4090D 1 GPU = 20,26 s/itération (Diffusers 30,50 s/it) ; H100 1 GPU = 5,18 s/it ; 8×H100 sans CFG + FP8 = 0,35 s/it ; modèles distillés 4 étapes publiés — [GitHub ModelTC/LightX2V README](https://github.com/ModelTC/LightX2V). LightX2V « can run on RTX 5090 and RTX 4060 (8GB VRAM) » — [GitHub Wan2.1 README, Community Works](https://github.com/Wan-Video/Wan2.1).
- LightX2V 2026 : Wan2.2-I2V-A14B 4 étapes 720p (20/04/2026) ; Wan2.2-NVFP4-Sparse (29/05/2026) « over 50× speedup » sur RTX 5090, **Blackwell uniquement** (NVFP4) — [GitHub LightX2V README](https://github.com/ModelTC/LightX2V), [HF lightx2v/Wan2.2-NVFP4-Sparse](https://huggingface.co/lightx2v/Wan2.2-NVFP4-Sparse).
- Wan2.2-Lightning : « only 4 steps without the need of CFG trick, leading to x20 speed-up » (affirmation éditeur, lue via résultat de recherche de la fiche) — [HF lightx2v/Wan2.2-Lightning](https://huggingface.co/lightx2v/Wan2.2-Lightning).
- Self-Forcing : GPU ≥ 24 Go (RTX 4090, A100, H100 testés) et 64 Go de RAM, génération « real-time, streaming » — [GitHub guandeh17/Self-Forcing](https://github.com/guandeh17/Self-Forcing). Krea Realtime 14B (distillé de Wan2.1-T2V-14B par Self-Forcing) : 11 i/s en 4 étapes sur **une B200** ; exemples vidéo→vidéo (streaming) dans la fiche — [HF krea/krea-realtime-video](https://huggingface.co/krea/krea-realtime-video).

**VRAM réelle des builds quantifiés (communauté / guides tiers)**
- Communauté (22/06/2026) : RTX 3060 12 Go, Wan2.2-14B I2V (fichiers fp8 scaled, 13,31 Go chacun pour high/low noise ; 33 Go de modèles au total) + LoRA Lightning : **50 min/scène à 20 étapes → 5 min 37 s à 4 étapes (×8,5)** ; scènes de 41 à 281 images à 16 i/s ; OOM à 12 Go au-delà → scène découpée en 141 + 141 images — [Substack D. Rusnok « $0 AI Reels on a 12GB GPU »](https://danielrusnok.substack.com/p/0-ai-reels-on-a-12gb-gpu).
- Guide tiers (secondaire) : 12 Go → 14B GGUF Q4_K_S/Q4_K_M en 580p–720p, 4–8 min par clip 5 s / 81 images ; 8 Go → 8–12 min — [wan27.org, guide des exigences Wan 2.2](https://wan27.org/blog/wan-2-2-requirements-guide). Autre guide : 8 Go, 480p, 5 s en 181 s (23 s/étape, 6 étapes, GGUF + LoRA lightx2v) — [Runflow, Wan 2.2 I2V ComfyUI](https://www.runflow.io/blog/comfyui-wan-2-2-image-to-video). Workflow 3060 « 10–15 min » par vidéo 5 s, marqué obsolète — [civarchive 17955](https://civarchive.com/articles/17955/wan-2-2-workflow-optimized-for-rtx-3060-12-gb-vram-gpu).

### Inferences
- Pour nos personnages « cartes riggées » en 2.5D, le meilleur couple Apache est (a) **VACE / VACE-Fun** quand on veut garder la mise en page à l'image près (profondeur + pose + masque + image de référence) et (b) **Wan-Animate / Wan-Animate-2** quand on veut un jeu d'acteur naturel transféré depuis la vidéo Blender (Animate-2 prend la vidéo de conduite telle quelle, sans extraction de squelette : notre rendu Blender pourrait servir directement de « driving video »). Animate-2 est trop lourd pour un GPU grand public à ce jour (2× A800 pour le 480p officiel) ; aucun GGUF/FP8 communautaire repéré pendant cette recherche.
- La distillation 4 étapes (LightX2V/Lightning, Apache) est le levier principal : le seul chiffre mesuré sur 12 Go (×8,5) est cohérent avec l'annonce « ×20 » de l'éditeur une fois les coûts fixes (VAE, encodeur de texte, chargements) comptés.
- 16 i/s (Wan2.1 / A14B / Animate) vs 25 i/s du film : prévoir une interpolation d'images ou un retiming ; TI2V-5B et Fun-5B-Control sont à 24 i/s.

### Gaps
- Aucun chiffre officiel de VRAM/temps pour VACE-14B, Fun-Control-A14B, Animate-14B ou Animate-2 sur une seule carte grand public (seulement H100/A100/A800 ou rien). Aucun GGUF d'Animate-2 trouvé.
- Pas de mesure publiée de VACE-1.3B lui-même (le 261 s est celui de T2V-1.3B ; les blocs de contexte VACE ajoutent un coût non chiffré).
- Licence de `lightx2v/Wan2.1-T2V-1.3B-Distill-Models` non déclarée ; à vérifier avant usage.

---

## Q2 — Autres candidats (LTX, CogVideoX, Hunyuan, Mochi, SkyReels, MAGI, FramePack, SVI, Open-Sora, Step-Video, MiniMax H3, nouveautés 2026)

### Takeaway
Hors Wan, seuls quelques modèles passent la règle MIT/Apache/BSD : **Stable Video Infinity (MIT, sur base Wan),
LongCat-Video (MIT), Kandinsky 6.0 (MIT, déclarée), Mochi (Apache, vérifiée), CogVideoX-2B (Apache, vérifiée),
MAGI-1/2 (Apache), Open-Sora 2.0 (Apache), Step-Video (MIT)** — mais aucun d'eux n'offre un contrôle profondeur/pose
aussi complet que VACE/Fun, et MAGI-2 / Step-Video / Open-Sora sont hors de portée d'un GPU grand public ou sans
contrôle. Les meilleurs contrôles « rendu 3D → vidéo » de 2026 (LTX-2.x IC-LoRA Union / Motion-Track / **Layout-To-Render**,
MiniMax-H3 ControlNet-Union 2.0) sont sous licences maison **hors règle**.

### Cited Findings

**Tableau de synthèse (licences lues le 14/10/2026)**

| Modèle (date) | Licence | Contrôles utiles | Matériel / vitesse annoncés | Source |
|---|---|---|---|---|
| LTX-2.3 22B (04/03/2026) | **LTX-2 Community License** (vérifiée) : entités ≥ 10 M$ de CA annuel doivent acheter une licence | IC-LoRA Union (Canny+Depth+Pose, référence à 0,5× la résolution), Motion-Track (splines), image initiale, audio | distillé 8 étapes CFG=1 ; upscalers x1,5/x2 spatiaux, x2 temporel | [HF Lightricks/LTX-2.3](https://huggingface.co/Lightricks/LTX-2.3), [LICENSE](https://huggingface.co/Lightricks/LTX-2.3/blob/main/LICENSE), [IC-LoRA Union](https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Union-Control), [Motion-Track](https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Motion-Track-Control) |
| LTX-2.5 22B (23/07/2026, accès conditionné) | **LTX-2.x Community License** du 11/08/2026 (vérifiée) : même seuil 10 M$ | IC-LoRA **Layout-To-Render** (22/09/2026, tags `layout-to-render`, `camera-control`, `video-to-video`), Ingredients, Clean-Plate, Day-To-Night, Restore… | téléchargement ≈ 66 GiB (transformer distillé bf16 + Gemma4-12B + VAE) ; options `--quantization fp8-cast --offload {cpu, disk}` | [GitHub Lightricks/LTX-2](https://github.com/Lightricks/LTX-2), [LICENSE-2_x](https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x), [HF Layout-To-Render](https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render) |
| LTX-Video 0.9.6–0.9.8 13B (2025, ancien) | « LTXV Open Weights License 0.X » du 15/04/2025 (maison, clauses non relues en entier) | IC-LoRA depth / pose / canny 13B 0.9.7, détaileur 0.9.8 | — | [LICENSE 0.X](https://huggingface.co/Lightricks/LTX-Video/blob/main/LTX-Video-Open-Weights-License-0.X.txt), [ICLoRA depth](https://huggingface.co/Lightricks/LTX-Video-ICLoRA-depth-13b-0.9.7) |
| CogVideoX-2B (08/2024, ancien) | **Apache-2.0 vérifiée** | via CogVideoX-Fun : pose, contrôle ; 49 images à 8 i/s | — | [LICENSE 2b](https://huggingface.co/zai-org/CogVideoX-2b/blob/main/LICENSE), [VideoX-Fun](https://github.com/aigc-apps/VideoX-Fun) |
| CogVideoX-5B / 1.5-5B (2024, ancien) | **CogVideoX License vérifiée** : recherche libre ; commercial = enregistrement + ≤ 1 M visites/mois ; licence révocable ; droit chinois | idem | — | [LICENSE 5b](https://huggingface.co/zai-org/CogVideoX-5b/blob/main/LICENSE) |
| HunyuanVideo / -I2V / HunyuanCustom / HunyuanVideo-1.5 (12/2024→11/2025) | **Tencent Hunyuan Community License vérifiée** (1.5 et Custom) : ne s'applique pas dans l'UE, au Royaume-Uni et en Corée du Sud ; licence à demander au-delà de 100 M d'utilisateurs actifs/mois ; interdiction d'utiliser les sorties pour améliorer un autre modèle | Custom : référence d'identité ; 1.5 : T2V/I2V | 1.5 = 8,3B ; 14 Go min. avec offload ; I2V 480p distillé 8–12 étapes ≈ **75 s sur RTX 4090** (officiel) ; Wan2GP jusqu'à 6 Go | [LICENSE 1.5](https://huggingface.co/tencent/HunyuanVideo-1.5/blob/main/LICENSE), [LICENSE Custom](https://huggingface.co/tencent/HunyuanCustom/blob/main/LICENSE), [GitHub HunyuanVideo-1.5](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5) |
| Mochi 1 preview (10/2024, ancien) | **Apache-2.0 vérifiée** | aucun contrôle natif | — | [LICENSE](https://huggingface.co/genmo/mochi-1-preview/blob/main/LICENSE) |
| SkyReels V2 (04/2025) / V3 (29/01/2026) | « Skywork Community License » (PDF externe non lu ; la page de conditions HF dit l'usage commercial permis sous conditions) | V3 : R2V 14B (1–4 images de référence, 720p 5 s), V2V extension 5→30 s, A2V 19B ; V2 : diffusion forcing, images de début/fin | multi-GPU xDiT, option `--offload` | [HF SkyReels-V3-V2V-14B](https://huggingface.co/Skywork/SkyReels-V3-V2V-14B), [conditions](https://huggingface.co/Skywork/SkyReels-V3-V2V-14B/blob/main/LICENSE) |
| MAGI-1 (04/2025) / MAGI-2-preview (08/2026) | MAGI-1 code **Apache vérifiée** ; MAGI-2 `apache-2.0` déclarée | T2V / I2V seulement | MAGI-2 : 114B MoE (6B actifs), clips de 10 s uniquement, **8 GPU Hopper**, ≈ 307 Go | [GitHub MAGI-1 LICENSE](https://github.com/SandAI-org/MAGI-1/blob/main/LICENSE), [HF MAGI-2-preview](https://huggingface.co/sand-ai/MAGI-2-preview) |
| FramePack (04/2025) | code **Apache vérifiée** ; poids `FramePackI2V_HY` / `F1` **sans licence déclarée** et dérivés de HunyuanVideo (13B) | I2V long (1 min) | **6 Go** min ; RTX 4090 : 2,5 s/image (1,5 s avec teacache) ; portables 3060/3070 Ti 4–8× plus lents | [GitHub lllyasviel/FramePack](https://github.com/lllyasviel/FramePack), [HF FramePackI2V_HY](https://huggingface.co/lllyasviel/FramePackI2V_HY) |
| Stable Video Infinity 2.0 Pro (10/2025→05/2026) | code **MIT vérifiée** ; poids `mit` déclarée ; base Wan2.1/2.2 (Apache) | longueur infinie ; SVI-Shot (padding VACE avec image de référence), SVI-Film, SVI-Dance (squelette), SVI-Talk, **SVI-Tom (cartoon Tom & Jerry, démos de 8–10 min)** ; branche Wan2.2 ; prochain : « Wan 2.2 Animate SVI » | workflows ComfyUI quantifiés/distillés communautaires | [GitHub vita-epfl/Stable-Video-Infinity](https://github.com/vita-epfl/Stable-Video-Infinity), [LICENSE](https://github.com/vita-epfl/Stable-Video-Infinity/blob/main/LICENSE) |
| Open-Sora 2.0 (03/2025) | code **Apache vérifiée**, poids `apache-2.0` | T2V/I2V, pas de contrôle | — | [GitHub hpcaitech/Open-Sora LICENSE](https://github.com/hpcaitech/Open-Sora/blob/main/LICENSE), [HF Open-Sora-v2](https://huggingface.co/hpcai-tech/Open-Sora-v2) |
| Step-Video-T2V (02/2025) | code **MIT vérifiée**, poids `mit` | T2V seulement | — | [GitHub Step-Video-T2V LICENSE](https://github.com/stepfun-ai/Step-Video-T2V/blob/main/LICENSE) |
| **MiniMax H3** (HF 28/07/2026, licence du 02/08/2026) | **MiniMax H3 Community License vérifiée** : territoire = monde **hors UE, Royaume-Uni, Corée du Sud et États-Unis** ; redistribution avec copie de la licence ; mention « Powered by MiniMax H3 » encouragée | FL2VA (0/1/2 images : T2V, première, dernière, première+dernière) ; Ref2VA (≤ 9 images, ≤ 3 vidéos, ≤ 3 audios) ; **ControlNet-Union 2.0** (alibaba-pai, 22/09/2026) : Canny, Depth, HED, MLSD, Pose (DWPose), Scribble, Layout, Gray + **inpainting masqué** | 33B dense (≈ 13B en branches AdaLN pré-calculables) + encodeur Qwen3-VL-32B ; 4–15 s, côté court 768 px, 24 i/s, 9:16 supporté ; exemple sglang sur 4 GPU ; LoRA Turbo 4 et 8 étapes 768p (LightX2V) ; branche ControlNet ≈ 13,5 Go | [HF MiniMaxAI/MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3), [LICENSE](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE), [ControlNet 2.0](https://huggingface.co/alibaba-pai/MiniMax-H3-Fun-Controlnet-Union-2.0), [Turbo](https://huggingface.co/lightx2v/Minimax-h3-Turbo) |
| Kandinsky 6.0 Lite 3B / Pro 29B (09/2026) | `mit` déclarée (LICENSE non lu) | T2AV et image→audio-vidéo (première image) ; pas de contrôle depth/pose | clips de 5 s, exemple 480×864, 121 images ; variantes distillées 10 étapes ; super-résolution 2–4 étapes | [HF kandinskylab/Kandinsky-6.0-Lite-5s-Diffusers](https://huggingface.co/kandinskylab/Kandinsky-6.0-Lite-5s-Diffusers) |
| LongCat-Video 13,6B (10/2025) | code **MIT vérifiée**, poids `mit` | T2V, I2V, **continuation vidéo** (minutes sans dérive de couleur annoncée) ; pas de depth/pose | 720p 30 i/s « within minutes » (multi-GPU, sans chiffre précis) | [HF meituan-longcat/LongCat-Video](https://huggingface.co/meituan-longcat/LongCat-Video), [LICENSE](https://github.com/meituan-longcat/LongCat-Video/blob/main/LICENSE) |
| Phantom (Wan2.1, ByteDance) / Lynx | `apache-2.0` déclarée | référence multi-sujets (Phantom) ; identité visage (Lynx) | — | [HF bytedance-research/Phantom](https://huggingface.co/bytedance-research/Phantom), [HF ByteDance/Lynx](https://huggingface.co/ByteDance/Lynx) |

**Détails complémentaires**
- LTX-2 = transformeur double flux asymétrique, 14B vidéo + 5B audio ; abstract : résultats « comparable to proprietary models at a fraction of their computational cost » sans chiffre — [arXiv 2601.03233](https://arxiv.org/abs/2601.03233).
- LTX-2.x Community License : « Entities with annual revenues of at least $10,000,000 … are required to obtain a paid commercial license » ; LTX-2.5 et suivants couverts par `LICENSE-2_x` (11/08/2026) — [GitHub Lightricks/LTX-2 LICENSE-2_x](https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x). Les nœuds ComfyUI officiels LTX sont eux-mêmes sous LTX-2 Community License (vérifiée) — [GitHub Lightricks/ComfyUI-LTXVideo LICENSE](https://github.com/Lightricks/ComfyUI-LTXVideo/blob/master/LICENSE).
- LTX-2.5 Layout-To-Render : dépôt conditionné ; métadonnées publiques : licence `ltx-2.x-community-license`, base LTX-2.5, `pipeline_tag: video-to-video` ; prompt d'exemple : « Keep the same well, bucket, posts, and camera as the driver » et un exemple « blocking » — [API HF](https://huggingface.co/api/models/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render). Un résumé de recherche n'a pas trouvé de page publique le décrivant (le dépôt est fermé sans connexion).
- LoRA tierce « 3DREAL » (LTX-2.3, fal.ai, 26/06/2026) : rendus 3D / blockouts → vidéo **photoréaliste** en gardant composition, caméra et mise en scène ; variantes Light/Strong ; mot déclencheur « 3DREAL » — [comfyui-wiki, 29/06/2026](https://comfyui-wiki.com/en/news/2026-06-29-ltx-2-3-3dreal-lora-render-to-real) (cible photoréaliste, pas cartoon ; dérivé LTX → licence LTX).
- Systèmes de recommandations officielles LTX : un résumé de recherche cite « minimum 32GB+ VRAM » sur la page « System Requirements » ; la page elle-même a renvoyé HTTP 403 → **non lu** — [docs.ltx.video System Requirements](https://docs.ltx.video/open-source-model/getting-started/system-requirements).
- LTX-2 codebase : Python ≥ 3.12, CUDA > 12.7, PyTorch ~2.7 — [HF Lightricks/LTX-2.3](https://huggingface.co/Lightricks/LTX-2.3).
- MiniMax H3 : modules H3-Context-IR (pré-traitement hébergé) et H3-Regenerate-2K **non ouverts** ; la publication locale = H3-Base 768p, poids distillés CFG — [HF MiniMaxAI/MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3).
- Journal de veille du projet (autre chercheur, même jour) : classements i2v sept.–oct. 2026 (Artificial Analysis, Arena) en tête MiniMax H3, Gemini Omni Flash, Vidu Q4, Seedance, Wan 3.0 ; « Wan 3.0 : API seulement (aucun poids publié vérifié) » — `.claude/skills/veille-permanente/SKILL.md` (non revérifié ici).

### Inferences
- Pour la règle MIT/Apache/BSD, la famille Wan (Q1) reste la seule à combiner contrôle depth/pose/masque, référence d'identité et outillage grand public. SVI (MIT) est le complément le plus utile pour la continuité longue (les démos Tom & Jerry montrent qu'il tient un style cartoon sur des minutes).
- LTX-2.5 Layout-To-Render est fonctionnellement le plus proche du besoin « blocking Blender → rendu » mais la licence LTX-2.x n'est pas MIT/Apache ; gratuite pour une entité < 10 M$ de CA, elle reste **hors règle du projet** → à présenter seulement comme option si l'utilisateur lève la règle.
- MiniMax H3 + ControlNet-Union 2.0 est techniquement le plus complet (8 contrôles + inpainting + 9:16 + 15 s) mais licence maison à exclusions de pays (la Côte d'Ivoire est dans le territoire autorisé ; c'est la règle MIT/Apache du projet qui l'exclut) et matériel multi-GPU.
- HunyuanVideo-1.5 (75 s par clip 480p sur 4090) serait la voie la plus rapide mesurée officiellement, mais licence Tencent → hors règle.

### Gaps
- Pas de VRAM/temps officiels pour LTX-2.3/2.5 sur 12/16/24 Go (page officielle inaccessible, chiffres communautaires contradictoires) ; contenu exact de Layout-To-Render et Ingredients (dépôts conditionnés) non lu.
- Licence Skywork (PDF) non lue ; licence Kandinsky 6.0 lue seulement comme métadonnée ; Step-Video et Open-Sora : besoins matériels non relevés.
- Aucun benchmark VBench / Artificial Analysis consulté directement dans cette recherche pour les modèles contrôlés.

---

## Q3 — Quels modèles acceptent profondeur / pose / masque issus d'un rendu 3D, gardent l'identité d'une image de référence et un décor peint cohérent ?

### Takeaway
Oui pour plusieurs modèles Apache : **VACE (1.3B/14B) et Wan2.2-VACE-Fun** (profondeur, pose, layout, masque + images de
référence), **Wan2.2-Fun-Control** (Canny/Depth/Pose/MLSD/trajectoire + image de référence), **Wan-Animate** (squelette +
visage depuis une vidéo, mode remplacement qui garde le décor d'origine) et **Wan-Animate-2** (vidéo de conduite brute).
Le décor peint se garde le mieux en **ne régénérant que les masques des personnages** (MV2V de VACE, mode remplacement
d'Animate) plutôt qu'en re-rendant toute l'image. Les preuves de qualité sur personnages cartoon sont rares et
surtout anecdotiques.

### Cited Findings
- VACE accepte une vidéo de contrôle (ex. profondeur) + images de référence + masques (MV2V : inpainting/outpainting/extension) dans un même modèle — [GitHub ali-vilab/VACE](https://github.com/ali-vilab/VACE).
- Wan2.2-Fun-A14B-Control : « Generic Control Video (Canny, Pose, Depth, etc.) + Reference Image » et contrôle de trajectoire — [HF alibaba-pai/Wan2.2-Fun-A14B-Control](https://huggingface.co/alibaba-pai/Wan2.2-Fun-A14B-Control). Wan2.2-VACE-Fun : contrôle + « subject reference » — [GitHub VideoX-Fun](https://github.com/aigc-apps/VideoX-Fun).
- Première + dernière image : Wan2.1-FLF2V-14B-720P (poids `apache-2.0` déclarée ; code Wan2.1 Apache-2.0 **vérifiée**) — [HF Wan-AI/Wan2.1-FLF2V-14B-720P](https://huggingface.co/Wan-AI/Wan2.1-FLF2V-14B-720P), [GitHub Wan2.1 LICENSE.txt](https://github.com/Wan-Video/Wan2.1/blob/main/LICENSE.txt) ; Wan-Fun via `validation_image_start/end` — [VideoX-Fun](https://github.com/aigc-apps/VideoX-Fun) ; MiniMax H3 FL2VA (hors règle) — [HF MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3).
- Wan-Animate remplacement : le personnage de l'image remplace l'acteur dans la vidéo en reprenant l'éclairage et la teinte de la scène (LoRA de ré-éclairage) — [GitHub Wan2.2 README](https://github.com/Wan-Video/Wan2.2), [hyper.ai, résumé arXiv 2509.14055](https://hyper.ai/en/papers/2509.14055). Le squelette 2D est conçu aussi pour des personnages non humanoïdes, mais les erreurs de squelette et les grosses différences de corps provoquent des déformations — [arXiv 2509.14055](https://arxiv.org/html/2509.14055v1).
- Wan-Animate-2 supprime l'extracteur de mouvement intermédiaire (consomme la vidéo de conduite) et revendique une meilleure préservation de l'identité ; évaluations qualitatives + études utilisateurs « across diverse characters » — [arXiv 2608.06009](https://arxiv.org/abs/2608.06009).
- MiniMax-H3 ControlNet-Union 2.0 : masque blanc = zone régénérée, noir = conservée ; la vidéo de contrôle impose le cadre (multiples de 32) — [HF alibaba-pai/MiniMax-H3-Fun-Controlnet-Union-2.0](https://huggingface.co/alibaba-pai/MiniMax-H3-Fun-Controlnet-Union-2.0) (hors règle).
- LTX-2.3 IC-LoRA Union (Canny+Depth+Pose) accepte aussi une image initiale (I2V) — [HF LTX-2.3 IC-LoRA Union](https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Union-Control) (hors règle).
- Qualité cartoon / stylisée (preuves disponibles) : SVI-Tom = vidéos Tom & Jerry de 8–10 min — [GitHub SVI](https://github.com/vita-epfl/Stable-Video-Infinity) ; exemple officiel Wan-Animate-2 = chatte anthropomorphe en uniforme — [HF Wan2.2-Animate-2-14B](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B) ; communauté : image de référence + LoRA de personnage donnent une forte cohérence avec Wan2.1 VACE — [snapshot Reddit r/StableDiffusion, 13/03/2026](https://reddit.sentinel-team.org/posts/1romzwt/snapshots/2026-03-13T21%3A28%3A18.36706Z) ; pipeline commercial « Blender graybox → Wan 2.2 Fun Control » (affirmations de l'auteur) — [playbook3d Gumroad](https://playbook3d.gumroad.com/l/vpjph) ; guide tiers : la profondeur sert surtout à la mise en page, pas à l'identité — [wan27.org, VACE expliqué](https://wan27.org/blog/wan-2-2-vace-explained).
- Contrôle « Layout » = boîtes colorées par sujet suivies dans le temps (recette VACE) — [HF MiniMax-H3 ControlNet 2.0](https://huggingface.co/alibaba-pai/MiniMax-H3-Fun-Controlnet-Union-2.0).

### Inferences
- Nos passes Blender couvrent directement les entrées : profondeur (Z pass normalisée) → `depth` VACE/Fun ; squelette exporté du rig → pose (préférable à DWPose, entraîné sur des humains, qui risque de mal lire des proportions cartoon à grosse tête — cohérent avec les limites du squelette 2D notées dans l'article Wan-Animate) ; masques d'objets → masques MV2V ; boîtes englobantes → `layout`.
- Stratégie décor peint : régénérer seulement les personnages (masque) pour figer le décor peint à l'identique, puis, si l'on veut un « fond vivant », une seconde passe masquée sur le fond seul (foule, feuillages) avec faible force ; re-rendre l'image entière (Layout-To-Render, Fun-Control plein cadre) risque de repeindre le style des décors.
- Identité : combiner image de référence (VACE R2V / Fun « reference image ») + première image rendue par Blender (I2V/FLF2V) ; une LoRA de personnage (entraînement LoRA proposé par VideoX-Fun / DiffSynth-Studio, Apache) est la voie la plus citée par la communauté pour la stabilité.

### Gaps
- Aucun benchmark contrôlé de VACE / Fun / Animate sur personnages 2D/2.5D style Pixar ; aucune étude sur la tenue d'un décor peint (non photo) sous contrôle profondeur.
- Aucune source n'évalue la lecture des squelettes OpenPose sur des personnages à proportions cartoon dans Wan-Animate.

---

## Q4 — Le plus rapide réaliste pour 64 s de vidéo contrôlée (720p ou 480p) sur UN GPU grand public (3060 12 Go / 4070 12 Go / 4090 24 Go) et sur GPU cloud gratuit (T4 / P100 16 Go) : minutes par clip de 5 s

### Takeaway
Chiffres sourcés par clip de ≈ 5 s : RTX 4090 → **≈ 4,4 min** (Wan2.1-1.3B 480p, 50 étapes, officiel) et **≈ 8,8–8,9 min**
(TI2V-5B 720p, officiel) ; RTX 3060 12 Go → **≈ 5,6 min par scène** pour Wan2.2-14B I2V en 4 étapes (communauté, scènes
de longueur variable) ; guides tiers 12 Go : 4–8 min. Dérivé pour 64 s (≈ 13 clips de 5 s) : ≈ 1 h sur 4090 en 1.3B
non distillé, ≈ 1,9 h en TI2V-5B 720p ; la distillation 4 étapes devrait diviser fortement ces temps mais **aucune mesure
publique VACE/Fun + 4 étapes sur 12 Go** n'a été trouvée. Sur T4/P100 : **aucun chiffre publié** ; P100 en fin de vie
(Google Cloud EOS 15/09/2026) et abandonné par les roues PyTorch récentes.

### Cited Findings
- Officiel RTX 4090 : Wan2.1-T2V-1.3B 480p = 261,4 s / 8,19 Go ; Wan2.2-TI2V-5B 720p = 524,8 s (I2V) / 534,7 s (T2V), ≈ 22,9 Go — [HF Wan2.1-VACE-1.3B](https://huggingface.co/Wan-AI/Wan2.1-VACE-1.3B), [HF Wan2.2-TI2V-5B](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B).
- Officiel RTX 4090 : HunyuanVideo-1.5 I2V 480p distillé « within 75 seconds » (licence Tencent, hors règle) — [GitHub HunyuanVideo-1.5](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5).
- FramePack (poids Hunyuan, hors règle) : 4090 = 2,5 s/image (1,5 s avec teacache) ; portables 3060/3070 Ti 4–8× plus lents ; 6 Go min — [GitHub lllyasviel/FramePack](https://github.com/lllyasviel/FramePack).
- LightX2V sur RTX 4090D : 20,26 s/itération (Wan2.1-I2V-14B-480P, 81 images, 40 étapes) vs 30,50 s/it en Diffusers — [GitHub ModelTC/LightX2V](https://github.com/ModelTC/LightX2V).
- Communauté RTX 3060 12 Go (22/06/2026) : Wan2.2-14B I2V fp8 + LoRA Lightning, 5 min 37 s par scène en 4 étapes (50 min à 20 étapes) ; film de 55 s en 1080×1920 (agrandi) ; OOM au-delà de ≈ 141 images — [Substack D. Rusnok](https://danielrusnok.substack.com/p/0-ai-reels-on-a-12gb-gpu).
- Guides tiers : 12 Go, 14B GGUF Q4, 4–8 min par clip 5 s ; 8 Go, 480p, 181 s avec 6 étapes lightx2v — [wan27.org](https://wan27.org/blog/wan-2-2-requirements-guide), [Runflow](https://www.runflow.io/blog/comfyui-wan-2-2-image-to-video).
- PyTorch : les roues CUDA 12.8/12.9 ont abandonné sm_50–sm_60 dès la 2.8 (Pascal = P100) ; PyTorch 2.14 = dernière version avec roues CUDA 12.x ; à partir de 2.15 Pascal (et Volta) abandonnés — [dev-discuss PyTorch, CUDA 12.8](https://dev-discuss.pytorch.org/t/cuda-toolkit-version-and-architecture-support-update-maxwell-and-pascal-architecture-support-removed-in-cuda-12-8-and-12-9-builds/3128), [dev-discuss PyTorch, 2.15](https://dev-discuss.pytorch.org/t/notice-cuda-12-6-wheels-will-no-longer-be-published-from-pytorch-2-15-drops-maxwell-pascal-volta/3432).
- « NVIDIA P100 GPUs on Google Cloud will reach End of Support (EOS) on September 15, 2026 » (page mise à jour le 13/10/2026) — [Google Cloud, P100 EOS](https://docs.cloud.google.com/compute/docs/eol/p100-eos). Le journal du projet note « P100 retiré [de Kaggle] le 15/09/2026 » (non confirmé par une page Kaggle dans cette recherche) ; une page de mai 2026 listait encore `NvidiaTeslaP100` parmi les accélérateurs Kaggle — [skills.sh kaggle-environment](https://www.skills.sh/josiahsiegel/claude-plugin-marketplace/kaggle-environment).
- Quota Kaggle : ≈ 30 h GPU/semaine, sessions de 12 h (sources secondaires contradictoires, pas de page Kaggle officielle trouvée) — [gpuperhour.com](https://gpuperhour.com/blog/free-cloud-gpus-and-credits), [Spheron, alternatives à Colab 2026](https://www.spheron.network/blog/google-colab-alternatives-8-gpu-clouds-compared-2026/).
- Piles requises : LTX-2 = CUDA > 12.7 et PyTorch ~2.7 — [HF LTX-2.3](https://huggingface.co/Lightricks/LTX-2.3) ; Wan-Animate-2 = torch 2.7.0 cu126 + flash-attn — [HF Wan2.2-Animate-2-14B](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B) ; LightX2V NVFP4 = Blackwell (RTX 5090) uniquement — [HF lightx2v/Wan2.2-NVFP4-Sparse](https://huggingface.co/lightx2v/Wan2.2-NVFP4-Sparse).

**Licences de la pile d'intégration (vérifiées)**
- Diffusers Apache-2.0 — [LICENSE](https://github.com/huggingface/diffusers/blob/main/LICENSE) ; DiffSynth-Studio Apache-2.0 (offload couche par couche, FP8, LoRA) — [LICENSE](https://github.com/modelscope/DiffSynth-Studio/blob/main/LICENSE), [GitHub Wan2.2 Community Works](https://github.com/Wan-Video/Wan2.2) ; LightX2V Apache-2.0 ; VideoX-Fun Apache-2.0 ; ComfyUI-WanVideoWrapper (Kijai) Apache-2.0 — [LICENSE](https://github.com/kijai/ComfyUI-WanVideoWrapper/blob/main/LICENSE) ; ComfyUI-GGUF Apache-2.0 — [LICENSE](https://github.com/city96/ComfyUI-GGUF/blob/main/LICENSE) ; stable-diffusion.cpp MIT — [LICENSE](https://github.com/leejet/stable-diffusion.cpp/blob/master/LICENSE).
- **ComfyUI lui-même = GPL-3.0** (vérifiée) — [LICENSE](https://github.com/comfyanonymous/ComfyUI/blob/master/LICENSE) ; Wan2GP = « WanGP Community License 2.0 » (restreint la commercialisation hébergée/API/SaaS) — [LICENSE.txt](https://github.com/deepbeepmeep/Wan2GP/blob/main/LICENSE.txt) ; nœuds ComfyUI-LTXVideo = LTX-2 Community License — [LICENSE](https://github.com/Lightricks/ComfyUI-LTXVideo/blob/master/LICENSE).

### Inferences
- Calculs dérivés (pas des mesures) pour 64 s ≈ 13 clips de 5 s (ou 23 plans de 1–7 s, même total d'images) :
  - RTX 4090, VACE-1.3B 480p non distillé : 13 × ≈ 4,4 min ≈ **57 min** (borne basse : le 261 s mesuré est T2V-1.3B sans les blocs VACE).
  - RTX 4090, TI2V-5B / Fun-5B-Control 720p 24 i/s : 13 × ≈ 8,8 min ≈ **1 h 55**.
  - RTX 4090D, Wan-14B 480p via LightX2V : 40 étapes × 20,26 s ≈ 13,5 min par clip ; avec un modèle 4 étapes, la seule partie débruitage tombe à ≈ 81 s par clip (+ VAE/encodeur non chiffrés) → ordre de **20–30 min pour 64 s**, à mesurer.
  - RTX 3060/4070 12 Go, 14B fp8/GGUF + 4 étapes : ≈ 5,6 min par scène mesurée par la communauté → ordre de **1 h à 1 h 15** pour 64 s ; la 4070 (Ada) gère le FP8 matériel, pas la 3060 (Ampere) — inférence non mesurée ici.
- Voie la plus rapide sous règle Apache aujourd'hui : **VACE-1.3B (ou Fun-1.3B-Control) 480p vertical 480×832 + distillation 4 étapes + LightX2V ou Diffusers**, puis agrandissement ; sur 4090, passer à VACE-Fun-A14B FP8 + LoRA 4 étapes pour la qualité. Hors règle, HunyuanVideo-1.5 distillé (75 s/clip sur 4090) serait ≈ 3,5× plus rapide que Wan-1.3B non distillé.
- Pour l'objectif « un film d'une minute en minutes » : aucune configuration Apache mesurée publiquement n'atteint ce rythme sur un seul GPU grand public ; seules les variantes temps réel (Self-Forcing / Krea 14B sur B200, Wan-Animate-2-Lite non publiée) s'en approchent, et elles visent des GPU de centre de calcul.
- T4 (Turing, 16 Go) : pas de FP8 matériel ni de bf16 natif (connaissance générale, non re-vérifiée ici) → privilégier fp16/GGUF et le 1.3B ; P100 : pile PyTorch ≤ 2.14 cu126 obligatoire, incompatible avec LTX-2 (CUDA > 12.7) et probablement avec la plupart des noyaux d'attention récents ; et le P100 est en fin de support chez Google Cloud. **Mesurer avant de planifier.**
- Si la règle MIT/Apache/BSD s'applique aussi au code exécuté, il faut éviter ComfyUI (GPL-3.0) et Wan2GP en production : Diffusers / DiffSynth-Studio / LightX2V / VideoX-Fun / sd.cpp couvrent les mêmes modèles.

### Gaps
- **Aucune mesure publiée de minutes par clip de 5 s sur T4 ou P100** pour Wan/VACE (recherches Kaggle/Colab infructueuses) ; le journal du projet mentionne « 9–15 min/clip T4 communautaire » sans source primaire relue ici.
- Aucune mesure publique de VACE ou Fun-Control (1.3B ou 14B) avec LoRA 4 étapes sur 12 Go ; aucune mesure RTX 4070.
- Quota Kaggle 2026 et disponibilité du P100 sur Kaggle non confirmés par une page Kaggle officielle.

---

## Q5 — Peut-on faire quelque chose d'utile sur CPU seul (4 cœurs, sans GPU) ?

### Takeaway
Techniquement il existe une voie MIT sans GPU (stable-diffusion.cpp, qui charge Wan2.1/2.2, VACE 1.3B/14B, TI2V-5B et
VACE-Fun-A14B en GGUF), mais **aucun chiffre de temps CPU n'a été trouvé** pour une vidéo Wan ; rien de publié ne permet
d'affirmer qu'un clip de 5 s est faisable en temps utile sur 4 cœurs.

### Cited Findings
- stable-diffusion.cpp (MIT, vérifiée) documente la génération vidéo (`sd-cli -M vid_gen`) pour Wan2.1 T2V/I2V/FLF2V 14B, **Wan2.1 VACE 1.3B et 14B**, Wan2.2 TI2V-5B, T2V/I2V-A14B, S2V-14B et **Wan2.2 VACE-Fun A14B** en GGUF ; avertit que « Wan models vae requires really much VRAM » et propose TAE en remplacement (qualité moindre) ; aucun temps CPU dans la doc — [GitHub leejet/stable-diffusion.cpp docs/wan.md](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/wan.md), [LICENSE](https://github.com/leejet/stable-diffusion.cpp/blob/master/LICENSE).
- Recherches « Wan2.1 1.3B CPU only », « stable-diffusion.cpp Wan CPU time », « OpenVINO Wan2.1 » : aucun résultat chiffré ; le seul banc OpenVINO trouvé concerne SDXL (images), pas la vidéo — [Lenovo Press LP2261](https://lenovopress.lenovo.com/lp2261-accelerating-text-to-image-diffusion-models-openvino-intel-amx).
- Journal du projet : « Rien d'ouvert ne tourne dans le conteneur (4 cœurs, sans GPU) » — `.claude/skills/veille-permanente/SKILL.md` (constat d'un autre chercheur, non re-mesuré ici).

### Inferences
- Ordre de grandeur (inférence, pas une mesure) : le 1.3B demande ≈ 261 s sur une RTX 4090 pour 81 images 480p en 50 étapes ; un CPU 4 cœurs est de l'ordre de deux à trois ordres de grandeur moins rapide en calcul matriciel → plusieurs heures à plusieurs jours par clip non distillé. Seul usage CPU plausible : tests de fumée minuscules (ex. 17 images, 256 px, 4 étapes distillées, TAE) pour valider la chaîne, pas la production.
- Sur CPU, la valeur réelle reste du côté du moteur Blender lui-même (passes, rig, LivePortrait déjà intégré) ; la génération vidéo doit partir sur GPU (local ou cloud gratuit) en lot.

### Gaps
- Aucun temps CPU publié (sd.cpp, Diffusers, OpenVINO) pour Wan/VACE/TI2V ; un micro-banc dans le conteneur (sd.cpp + VACE-1.3B GGUF Q4, 17 images, 4 étapes) donnerait le seul chiffre fiable.
