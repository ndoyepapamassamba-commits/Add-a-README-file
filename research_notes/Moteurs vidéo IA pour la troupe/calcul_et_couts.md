# Calcul et coûts — moteurs vidéo IA pour la troupe (54 personnages, sketches TikTok 9:16 de 25–60 s) — état au 16/10/2026

Contrainte prioritaire (reçue en cours de recherche) : **budget ZÉRO, « je veux tout gratuit »**. Les notes sont donc
centrées sur le calcul 100 % gratuit ; les options payantes ne sont gardées qu'en ligne de comparaison. Conteneur de
l'assistant : **pas de GPU** (4 cœurs CPU, 15 Go RAM, ~30 Go disque) ; utilisateur au **Sénégal** ; compte OpenRouter
avec **~0,50 $** de reste. Règles : aucun appel payant, aucun compte créé.

Conventions : « lu le 16/10/2026 » = page ou API consultée aujourd'hui ; « note du 14/10 » = fait repris des notes
précédentes (`calcul_gpu_gratuit.md`, `api_video_paiement_usage.md`) avec leur source d'origine. « Mesuré (tiers) » =
chrono publié par un tiers ; « observé » = interrogé par nous via une API publique gratuite (GET). Tous les calculs
($/s, clips/semaine) sont des **inférences** et sont montrés. Un sketch = 30 à 60 s ≈ 6 à 12 plans de 5 s ;
hypothèse de travail **3 prises par plan** (non mesurée).

## 1. Paliers GPU gratuits (budget zéro) : matériel, quotas, sessions, vérifications, téléchargement des poids

### Takeaway
Seules trois sources gratuites sont **récurrentes et utilisables pour Wan** : **Kaggle** (~30 h GPU/semaine, T4×2
16 Go chacun, sessions de 12 h, vérification par téléphone ; P100 retiré le 15/09/2026), **Hugging Face ZeroGPU** (RTX
Pro 6000 Blackwell mais 5 min/jour et 3 exécutions/jour pour un compte gratuit) et **Lightning AI** (15 crédits/mois,
≈ 80 h de T4, vérification par téléphone, sans carte — chiffres de sources tierces). **Modal** (30 $/mois) est le plus
puissant mais l'exigence de carte est contradictoire selon les sources. Colab gratuit est imprévisible et interdit les
interfaces web (ComfyUI) aux comptes gratuits ; GCP/AWS/Azure/Oracle n'ouvrent **pas** de GPU gratuitement ; Studio
Lab est fermé aux nouveaux ; Paperspace gratuit (M4000 8 Go) est trop faible.

### Cited Findings

#### Tableau 1 — offres gratuites (dates de lecture indiquées)

| Offre | GPU / VRAM | Volume gratuit | Session max | Carte / téléphone | Disque / poids | Source |
|---|---|---|---|---|---|---|
| **Kaggle Notebooks** | **T4 ×2 (2 × 16 Go)** ; P100 **retiré le 15/09/2026** ; L4 / RTX Pro 6000 / H100 listés mais « only available to participants of specific competitions … or Kaggle admins » | « 30 hours or sometimes higher depending on demand », remis à zéro chaque semaine ; +15/+30 h si Colab Pro/Pro+ lié | **12 h** CPU/GPU, 9 h TPU | **téléphone** pour GPU et Internet ; carte non mentionnée | `/kaggle/working` ≈ **20 Go** sauvegardés (+ espace temporaire non sauvegardé, taille non confirmée) ; poids attachables comme `dataset_sources` / `model_sources` | [kernels.md](https://github.com/Kaggle/kaggle-api/blob/main/docs/kernels.md) ; [annonce P100](https://www.kaggle.com/product-announcements/735239) ; [Kaggle GPU tips](https://www.kaggle.com/docs/efficient-gpu-usage) (note du 14/10) ; [GPUperHour, 21/09/2026](https://gpuperhour.com/blog/free-cloud-gpus-and-credits) ; [AIMultiple, 16/09/2026](https://aimultiple.com/free-cloud-gpu) ; 20 Go : [O'Reilly, The Kaggle Book](https://www.oreilly.com/library/view/the-kaggle-book/9781801817479/Text/Chapter_3.xhtml) (via recherche) |
| **Google Colab gratuit** | non publié ; T4 16 Go rapporté par les utilisateurs | « heavily restricted », limites « not published » | ≤ **12 h**, coupure si inactif | compte Google | non lu | [FAQ Colab](https://research.google.com/colaboratory/faq.html) (note du 14/10) ; [GPUperHour](https://gpuperhour.com/blog/free-cloud-gpus-and-credits) |
| **Hugging Face ZeroGPU** (appeler des Spaces) | ½ RTX Pro 6000 Blackwell 48 Go (`large`), 96 Go en `xlarge` (coût ×2) | **5 min/jour** connecté, 2 min anonyme ; **3 exécutions/jour** max pour un compte gratuit (personnel HF, 13/04/2026) ; quota décompté sur la durée **demandée** | 60 s par appel par défaut | e-mail ; héberger un Space ZeroGPU : compte ≥ 30 jours, e-mail vérifié (2 Spaces) | poids hébergés par le Space (rien à télécharger chez nous) | [HF docs ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu) ; [forum HF](https://discuss.huggingface.co/t/free-account-zerogpu-quota-issue/175180) (note du 14/10) |
| **Lightning AI** | T4, L4, A100, H200 cités ; T4 le plus souvent documenté en gratuit | **15 crédits/mois** (expirent en fin de mois) ≈ « 80 GPU hours » de T4 ; 1 crédit = 1 $ | Studio redémarré toutes les **4 h** ; 1 Studio actif | **sans carte ; téléphone** pour débloquer les crédits GPU | stockage persistant **50 Go** | [AIMultiple, 16/09/2026](https://aimultiple.com/free-cloud-gpu) ; [usagepricing](https://usagepricing.com/blueprint/lightning-ai) ; [GMI Cloud, 2026](https://www.gmicloud.ai/blog/where-can-i-get-free-gpu-cloud-trials-in-2026-a-complete-guide) ; [GPUperHour](https://gpuperhour.com/blog/free-cloud-gpus-and-credits) ; crédits « promotional … do not accumulate » — [Lightning docs](https://lightning.ai/docs/platform/overview/faq/billing.md) ; page officielle de prix non rendue (lue le 16/10/2026) |
| **Modal** (Starter) | T4 → B200 ; T4 0,000164 $/s, L4 0,000222, A10 0,000306, L40S 0,000542, A100 80 Go 0,000694, H100 0,001097, H200 0,001261, B200 0,001736 | **30 $/mois** de crédits | fonctions ≤ 24 h ; notebooks arrêtés après 10 min d'inactivité | **contradictoire** : « A payment method is required » ([AIMultiple](https://aimultiple.com/free-cloud-gpu)) vs « no credit card required at signup » ([aicreditmart](https://aicreditmart.com/ai-credits-providers/modal-free-tier-how-to-get-30-month-in-compute-credits-2026/), [costbench](https://costbench.com/software/ai-gpu-cloud/modal/free-plan/)) ; la page officielle ne le dit pas | volumes Modal (taille gratuite non lue) | [Modal Pricing](https://modal.com/pricing) (lu le 16/10/2026) |
| **Saturn Cloud** | 1 GPU « classe T4 » ≤ 16 Go | **non publié** ; ~30 h/mois (anciennes pages) **ou** 150 h/mois (ancien communiqué) — conflit | non lu | **sans carte** | non lu | [AIMultiple FR](https://aimultiple.com/fr/free-cloud-gpu) ; [Fierce Network](https://fierce-network.com/newswire/saturn-cloud-launches-150-free-hour-tier-data-professionals) ; [Saturn Cloud](https://saturncloud.io/try) (note du 14/10) |
| **Paperspace Gradient Free** | Quadro **M4000 8 Go** | non publié | arrêt auto ≤ **6 h**, inactif 1 h | non indiqué | **5 Go** | [DigitalOcean docs](https://docs.digitalocean.com/products/paperspace/notebooks/details/features/) ; [AIMultiple](https://aimultiple.com/free-cloud-gpu) |
| **SageMaker Studio Lab** | — | 4 h / 24 h (anciens clients) | 4 h | — | 15 Go | « **no longer open to new customers** » — [AWS docs](https://docs.aws.amazon.com/sagemaker/latest/dg/studio-lab-availability-change.html) |
| **Google Cloud essai** | **aucun GPU** pendant l'essai | 300 $ / 90 jours | — | carte | — | [Google Cloud Free Program](https://docs.cloud.google.com/free/docs/free-cloud-features) |
| **AWS plan gratuit** | quota GPU par défaut à 0 (source tierce) | ≤ 200 $ / 6 mois | — | carte | — | [AWS News Blog](https://aws.amazon.com/blogs/aws/aws-free-tier-update-new-customers-can-get-started-and-explore-aws-with-up-to-200-in-credits) ; [AIMultiple FR](https://aimultiple.com/fr/free-cloud-gpu) |
| **Azure gratuit** | quota GPU non confirmé (anciens fils : 0) | 200 $ / 30 jours | — | **téléphone + carte non prépayée** | — | [GPUperHour](https://gpuperhour.com/blog/free-cloud-gpus-and-credits) ; [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/749877/gpu-based-virtual-machine-on-free-trial-subscripti) |
| **Oracle Always Free** | **CPU seulement** (E2.1.Micro AMD, Ampere A1 Arm) | A1 : 3 000 OCPU-h + 18 000 Go-h/mois (page officielle) ; réduction de moitié rapportée, **non confirmée** | — | carte (autorisation temporaire) | — | [Oracle docs](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm) ; [braindetox](https://braindetox.kr/en/posts/oracle_always_free_tier_reduced_2026.html) ; une source tierce prétendant un A10 gratuit est contredite par la doc officielle — [GMI Cloud](https://gmicloud.ai/blog/where-can-i-get-free-gpu-cloud-trials-in-2025-a-complete-guide) |
| **AMD Developer Cloud** | MI300X 192 Go (ROCm) | 100 $ **une fois**, 30 jours | — | moyen de paiement selon guides | — | [AMD](https://amd.com/en/developer/resources/cloud-access/amd-developer-cloud.html) (note du 14/10) |

#### Autres faits utiles
- Colab gratuit : interdits sur tous les runtimes « media serving », « using multiple accounts to work around access or resource usage restrictions » ; **restreint** pour les comptes gratuits : « bypassing the notebook UI to interact primarily via a web UI », SSH, « distributed computing workers » — [FAQ Colab](https://research.google.com/colaboratory/faq.html) (note du 14/10).
- Kaggle est pilotable sans navigateur : `kaggle kernels push` (`--accelerator NvidiaTeslaT4`), `kernels status`, `kernels output` ; `kernel-metadata.json` : `enable_gpu`, `enable_internet`, `dataset_sources`, `model_sources` — [kernels.md](https://github.com/Kaggle/kaggle-api/blob/main/docs/kernels.md), [kernels_metadata.md](https://github.com/Kaggle/kaggle-api/blob/main/docs/kernels_metadata.md) (note du 14/10).
- Vérification téléphone Kaggle : un responsable technique Kaggle a ouvert un fil pour recenser les codes SMS **jamais reçus**, en demandant l'indicatif pays (fil non daté) — [forum fast.ai](https://forums.fast.ai/t/have-you-had-issues-verifying-your-phone-with-kaggle/101775).
- Crédits d'essai **API** (uniques, pas du calcul) : Alibaba Model Studio (Singapour) **50 s gratuites par modèle Wan** (30 s pour Wan 3.0) pendant 90 jours, échecs non décomptés ; Runware 2 $ (e-mail professionnel) ; WaveSpeed 1 $ sans carte ; Veo et Omni « Not available » en palier gratuit Gemini — [Model Studio](https://www.alibabacloud.com/help/en/model-studio/model-pricing), [Runware](https://runware.ai/pricing), [WaveSpeed](https://wavespeed.ai/pricing), [tarifs Gemini](https://ai.google.dev/gemini-api/docs/pricing) (note du 14/10).
- Crédit déjà payé par l'utilisateur : OpenRouter facture Grok Imagine Video 1.5 Lite 0,03 $/s en 720p + 0,01 $ par image d'entrée, durées 1–15 s — [OpenRouter, API vidéo](https://openrouter.ai/api/v1/videos/models) (observé le 16/10/2026).

### Inferences
- **Classement gratuit pour notre usage** : (1) Kaggle (volume, automatisable par CLI) ; (2) Lightning AI (≈ 18 h T4/semaine si les 15 crédits s'appliquent au tarif T4 de 0,19 $/h : 15 ÷ 0,19 ≈ 79 h/mois) ; (3) ZeroGPU (peu de volume mais GPU Blackwell → 720p rapide, idéal pour 1–3 « plans vedettes »/jour) ; (4) Modal **si** aucune carte n'est exigée (30 $ ≈ 7,6 h H100 ou 37,5 h L4 ou 50,8 h T4) ; (5) Saturn (≈ 7 h T4/semaine si 30 h/mois) ; Colab en appoint manuel seulement.
- Les 0,50 $ d'OpenRouter suffisent pour **un seul** clip d'essai Grok 1.5 Lite 720p de ~16 s ((0,50 − 0,01) ÷ 0,03 ≈ 16,3 s) ou ~16 s de Veo 3.1 Lite muet (0,03 $/s) — utile comme étalon de qualité, pas comme production.
- Multiplier les comptes pour cumuler les quotas est interdit chez Colab ; à proscrire partout (risque de bannissement de tout le pipeline).

### Gaps
- Pages officielles **Kaggle** (docs notebooks rendues en JavaScript, illisibles le 16/10/2026) : RAM et disque temporaire exacts d'une session T4×2, CGU sur la génération répétée de médias, liste des pays acceptés pour la vérification SMS (Sénégal **non confirmé**).
- **Lightning** : montant gratuit et GPU éligibles non lus sur la page officielle (non rendue) ; « 80 h » = chiffre tiers.
- **Modal** : exigence de carte contradictoire ; **Saturn** : heures gratuites actuelles inconnues (30 h vs 150 h).
- Aucun nouveau palier GPU gratuit significatif apparu en 2026 n'a été trouvé hors de ceux listés (GPUperHour du 21/09/2026 recense surtout des fermetures : Studio Lab, Colab Pro for Education fermé aux nouvelles inscriptions).

## 2. Que peuvent faire tourner ces GPU gratuits (Wan 2.2 TI2V-5B, Wan 14B GGUF/FP8 + Lightx2v 4 pas, LTX-2 distillé, InfiniteTalk) et combien de clips par semaine ?

### Takeaway
Sur **T4 16 Go (Kaggle/Colab/Lightning/Saturn)**, le choix réaliste est **Wan 2.2 TI2V-5B en GGUF/fp16 à 480p** (≈ 9–15 min
par clip de 5 s, chiffre communautaire) — paquet de poids ≈ 11,5 Go en Q4. **Wan 14B** (I2V-A14B GGUF Q4 + LoRA
Lightx2v 4 pas) pèse ≈ 28,5 Go à télécharger et dépasse la VRAM d'un T4 (deux experts de 9,7 Go + encodeur) : possible
seulement avec offload, sans chrono publié sur T4. **LTX-2.5 distillé** Q4 (15,7 Go) dépasse aussi la VRAM d'un T4.
**InfiniteTalk** (lip-sync) demande 13–16 Go et ~1 min de calcul par seconde de vidéo sur GPU non précisé. Le T4
(Turing) n'a ni bf16 ni FP8 : les recettes rapides FP8/NVFP4 ne s'y appliquent pas. **ZeroGPU** fait tourner Wan 2.2
14B FP8 4 pas en ~69 s réservées par clip, mais 3 fois par jour seulement.

### Cited Findings

#### Poids à télécharger (tailles lues via l'API Hugging Face le 16/10/2026)
- Wan 2.2 TI2V-5B : GGUF Q4_K_M **3,4 Go**, Q8_0 5,4 Go ; VAE 2.2 **1,4 Go** — [QuantStack/Wan2.2-TI2V-5B-GGUF](https://huggingface.co/api/models/QuantStack/Wan2.2-TI2V-5B-GGUF/tree/main?recursive=true) ; fp16 **10,0 Go** ; encodeur `umt5_xxl_fp8_e4m3fn_scaled` **6,7 Go** (fp16 11,4 Go) — [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/api/models/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main?recursive=true).
- Wan 2.2 I2V-A14B : deux experts (high/low noise) ; GGUF Q4_K_M **9,7 Go chacun**, Q3_K_S 6,5 Go, Q8_0 15,4 Go — [QuantStack/Wan2.2-I2V-A14B-GGUF](https://huggingface.co/api/models/QuantStack/Wan2.2-I2V-A14B-GGUF/tree/main?recursive=true) ; fp8 scaled **14,3 Go chacun**, fp16 28,6 Go chacun ; LoRA `wan2.2_i2v_lightx2v_4steps_lora_v1` **1,2 Go** par expert — [Comfy-Org](https://huggingface.co/api/models/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main?recursive=true).
- Wan 2.2 Animate-14B GGUF Q4_K_M **12,6 Go** ; InfiniteTalk GGUF Q4_K_M **1,4 Go** (module ajouté à un Wan 2.1 I2V 14B) ; VACE module 14B Q4 2,0 Go — [Kijai/WanVideo_comfy_GGUF](https://huggingface.co/api/models/Kijai/WanVideo_comfy_GGUF/tree/main?recursive=true) ; InfiniteTalk officiel : single/multi **9,9 Go** (bf16), quantifiés fp8/int8 **19,5 Go** — [MeiGen-AI/InfiniteTalk](https://huggingface.co/api/models/MeiGen-AI/InfiniteTalk/tree/main?recursive=true).
- LTX-2.5 distillé GGUF : Q3_K_S 12,6 Go, **Q4_K_M 15,7 Go**, Q8_0 23,6 Go — [Abiray/LTX-2.5-Distilled-GGUF](https://huggingface.co/api/models/Abiray/LTX-2.5-Distilled-GGUF/tree/main?recursive=true) ; paquet officiel LTX-2.5 « roughly 66 GiB » ; options `--quantization fp8-cast --offload {cpu, disk}` — [LTX-2 README](https://github.com/Lightricks/LTX-2).

#### Exigences et vitesses publiées
- Wan 2.2 TI2V-5B : ≥ **24 Go** en officiel (4090) avec `--offload_model True --convert_model_dtype --t5_cpu` ; 5 s 720p « under 9 minutes » sur GPU grand public ; A14B : 80 Go en mono-GPU natif — [Wan2.2 README](https://github.com/Wan-Video/Wan2.2).
- **Mesuré (tiers, septembre 2026)** sur RTX 4090 : TI2V-5B 1280×704, 121 images, 50 pas → **667 s** au total (diffusion 8 min 12 s, pic 24 079 Mio) ; un premier essai identique a fait OOM au décodage VAE ; T2V-A14B **GGUF Q4_K_M** 832×480, 81 images, 20 pas → **516 s**, pic 14 907 Mio — [ComputingForGeeks, MAJ 23/09/2026](https://computingforgeeks.com/run-wan-video-generation-locally/).
- Wan 2.1 T2V-14B pleine précision, 5 s : H100 SXM **85 s (480p) / 284 s (720p)** ; A100 SXM 170 / 523 s ; RTX 4090 281 s (480p) / OOM (720p) (chiffres SaladCloud cités) — [RunAIHome, 03/06/2026](https://runaihome.com/blog/wan-video-local-ai-gpu-guide-2026/).
- Wan 2.2 14B + **LoRA Lightning 4 pas** : 480p 5 s ≈ **1–3 min** sur RTX 4090 (contre 40–50 min en standard), 720p « roughly doubles » ; 12 Go minimum avec block swap (guide secondaire, résumé de recherche) — [EarnGenix](https://www.earngenix.com/workflows/wan-2-2-fast-comfyui). Wan 2.2 A14B FP8 720p 81 images 30 pas : **4 min 20 s** sur 4090 (résumé de recherche) — [Smeltcore](https://smeltcore.com/recipes/wan-2-2-t2v-a14b-on-rtx-4090-720p-text-to-video-in-comfyui-with-fp8-scaled-weights/). Un modèle distillé Lightx2v = « 4 steps … without classifier-free guidance » — [HF lightx2v](https://huggingface.co/lightx2v/Wan2.2-I2V-A14B-Moe-Distill-Lightx2v).
- **T4 (Kaggle)** : notebook communautaire WanGP-Kaggle, 480p recommandé, « Expect ~9-15 minutes per video on T4 » (modèle exact non précisé) — [kayas881/WanGP-Kaggle](https://github.com/kayas881/WanGP-Kaggle) ; notebook « Wan 2.2 TI2V 5B Diffusers Free GPU Test » : 6 min 56 s sur P100 (P100 désormais retiré) — [Kaggle](https://www.kaggle.com/code/ali9999008/wan-2-2-ti2v-5b-diffusers-free-gpu-test) (note du 14/10). Un vendeur de notebook Colab annonce « up to 5 seconds of 480p & 4 seconds of 720p on free T4 » pour Wan 2.2 (allégation commerciale) — [Gumroad isinse](https://isinse.gumroad.com/l/wgcntivivflfv).
- **HunyuanVideo-1.5** (8,3 B) : **14 Go** minimum avec offload ; modèle distillé en pas : « a single RTX 4090 can generate videos within 75 seconds » (contexte 480p I2V) ; LoRA prise en charge (`--use_lora`, rang 8 par défaut) — [HunyuanVideo-1.5 README](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5).
- **LTX** : LTX-2.5 = 10 s 720p i2v en **6,8 s sur 2 GB200** (chiffre éditeur) ; 16 Go VRAM minimum annoncés ; licence LTX-2.x Community gratuite sous 10 M$ de revenus annuels — [VentureBeat, 11/08/2026](https://venturebeat.com/technology/ltx-2-5-can-generate-a-10-second-ai-video-from-an-image-in-just-6-8-seconds-on-nvidia-superchips-and-its-open-weights). Un billet Medium décrit LTX 2.3 (22 B) distillé GGUF Q4_K_M sur **Colab gratuit** (~15 Go VRAM), modèles stockés sur Google Drive (non vérifié, ~7 mois) — [Medium](https://medium.com/@ammanakhtar8/how-i-finally-ran-ltx-2-3-22b-on-a-free-google-colab-gpu-770993db442c). Un blog affirme 8 s 720p en ~25 s sur 4090 « with NVFP4 » — **douteux** : NVFP4 est un format Blackwell, la 4090 est Ada (résumé de recherche) — [LocalAIMaster](https://localaimaster.com/blog/local-ai-video-generation).
- **InfiniteTalk** : workflow ComfyUI annoncé pour 13–16 Go de VRAM, « a bit over 20 min » avec 4 pas + LoRA Lightning — [AIStudyNow](https://aistudynow.com/infinitytalk-comfyui-workflow-wan-2-1-img2vid-vid2vid-multi-talk/) ; un clip de 27 s ≈ 20 min de rendu (« less than 1 minute … per sec », GPU non nommé) — [Zanno](https://zanno.se/lets-talk-multitalk-infinitetalk-wan-s2v/) ; un utilisateur de 4090 se plaint de lenteur (8 pas, offload) — [GitHub issue #210](https://github.com/MeiGen-AI/InfiniteTalk/issues/210).
- **ZeroGPU** : Space `zerogpu-aoti/wan2-2-fp8da-aoti-faster` = Wan 2.2 I2V-A14B FP8, 4 pas, ≤ 80 images à 16 i/s ; réservation `10 + steps × 15 × (frames×W×H / (81×832×624))^1.5` s → ≈ 69 s pour un clip 832×624 de 5 s ; `Lightricks/LTX-2.5` en `xlarge` (coût ×2, réservation 60–400 s) — [app.py Wan](https://huggingface.co/spaces/zerogpu-aoti/wan2-2-fp8da-aoti-faster/blob/main/app.py), [app.py LTX-2.5](https://huggingface.co/spaces/Lightricks/LTX-2.5/blob/main/app.py) (note du 14/10).
- **Modèle ouvert lourd à noter** : **MiniMax H3** publié en poids ouverts le 28/07/2026 (Omni-Transformer **33 B** dense dont ~13 B dans des branches AdaLN pré-calculables + encodeur Qwen3-VL-32B ; 768p, 4–15 s, 24 i/s ; mode Ref2VA ≤ 9 images de référence) ; exemple de service SGLang sur **4 GPU** ; licence « MiniMax H3 Community License », formulaire requis seulement pour USA/UE/R-U/Corée du Sud — [MiniMaxAI/MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3) (lu le 16/10/2026) ; LightX2V propose des LoRA H3 Turbo 4 et 8 pas (11 et 27/08/2026) — [LightX2V README](https://github.com/ModelTC/LightX2V).

### Inferences

#### Tableau 2 — faisabilité sur matériel gratuit (inférences à partir des tailles et chronos cités)

| Modèle | Paquet à télécharger | T4 16 Go (Kaggle / Lightning / Saturn / Colab) | ZeroGPU (Blackwell 48/96 Go) | Modal (H100/L4) |
|---|---|---|---|---|
| Wan 2.2 TI2V-5B Q4 GGUF + umt5 fp8 + VAE | 3,4 + 6,7 + 1,4 = **11,5 Go** | **Oui, 480p** ; ~9–15 min/clip 5 s ; 720p = ~2,3× plus de pixels → probablement 25–45 min et risque d'OOM au VAE | via un Space (TI2V-5B officiel privé/restreint) | oui |
| Wan 2.2 TI2V-5B fp16 | 10,0 + 6,7 + 1,4 = 18,1 Go | oui avec offload (fp16, pas de bf16) | — | oui |
| Wan 2.2 I2V-A14B Q4 ×2 + umt5 + Lightx2v ×2 | 9,7×2 + 6,7 + 1,2×2 = **28,5 Go** (Q3_K_S : 22,1 Go) | limite : chaque expert ≈ 9,7 Go + activations ; offload RAM/disque ; **aucun chrono T4** ; dépasse les 20 Go de `/kaggle/working` → à poser en dataset Kaggle ou dans l'espace temporaire | **oui, ~69 s réservées/clip**, 3 clips/jour | oui ; H100 : ~1–2 min/clip attendu en 4 pas (non mesuré) |
| Wan 2.2 I2V-A14B fp8 ×2 | 37,7 Go | non (T4 sans FP8 natif) | oui (Space FP8) | oui |
| LTX-2.5 distillé Q4_K_M | 15,7 Go + encodeur texte (taille non lue) | douteux : > VRAM, offload obligatoire ; un seul témoignage Colab non vérifié | oui (`xlarge`, ≤ 2 appels/jour) | oui |
| InfiniteTalk (Wan 2.1 I2V 14B + module) | module 1,4 Go (Q4) + base 14B (taille non lue) + umt5 6,7 Go | limite (13–16 Go annoncés) ; probablement ≥ 1–2 min de calcul par seconde parlée | pas de Space InfiniteTalk vérifié | oui |
| HunyuanVideo-1.5 distillé | non lu | 14 Go mini avec offload → plausible, aucun chrono T4 | — | oui |
| MiniMax H3 | > 60 Go (33 B + Qwen3-VL-32B) | **non** | non | trop cher pour 30 $ (exemple sur 4 GPU) |

#### Débit réaliste par semaine (calculs ; 1 clip = 5 s, 480p sauf mention)
- **Kaggle** : 30 h × 60 ÷ 15 min = **120** à 30 × 60 ÷ 9 = **200 clips/semaine** sur un seul T4, moins le chargement des poids à chaque session (≈ 11,5 Go) ; jusqu'à ~2× si l'on fait tourner un clip par T4 (T4×2 = une seule session décomptée — à vérifier en RAM). Soit **10 à 17 min de vidéo brute/semaine** → avec 3 prises par plan, **3,3 à 5,5 min utiles** → **4 à 7 sketches de 45 s/semaine** à 480p.
- **Lightning** (si 15 crédits ≈ 79 h T4/mois) : ≈ 18 h/semaine → **~70–120 clips/semaine**.
- **ZeroGPU** : 3 exécutions/jour → **21 clips/semaine** (105 s) en Wan 2.2 14B FP8 4 pas, qualité supérieure → réserver aux plans clés.
- **Modal 30 $/mois** (si sans carte) : Wan 2.1 14B 720p sur H100 (284 s) → 30 ÷ (0,001097 × 284) ≈ **96 clips/mois** (~22/semaine) ; en 480p (85 s) ≈ 320/mois (~74/semaine).
- **Saturn** (si 30 h/mois) : ≈ 7 h/semaine → ~35 clips/semaine.
- **Cumul Kaggle + Lightning + ZeroGPU** ≈ 200–340 clips/semaine à 480p → couvre « plusieurs sketches par semaine » **à condition** d'accepter 480p (puis upscale ; LightX2V prend en charge SeedVR2/SwiftVR — [LightX2V](https://github.com/ModelTC/LightX2V)) et des lots planifiés, pas de l'instantané.
- Le conteneur de l'assistant (4 CPU, 15 Go RAM, sans GPU) ne peut servir que d'**orchestrateur** (préparer les lots, pousser les notebooks Kaggle, rapatrier les MP4, monter) ; générer de la vidéo diffusion sur CPU n'est pas réaliste (aucune source ; ordre de grandeur : heures par clip).

### Gaps
- **Aucun chrono publié** de Wan 2.2 I2V-A14B GGUF + Lightx2v 4 pas, ni de LTX-2.5 distillé, ni d'InfiniteTalk, **sur T4** ; aucun chrono T4 de TI2V-5B à 720p avec réglages connus. À mesurer par un premier notebook Kaggle.
- RAM CPU d'une session Kaggle T4×2 et de Colab gratuit (nécessaire pour l'offload du 14B) : non lue officiellement.
- Taille du modèle de base Wan 2.1 I2V 14B GGUF pour InfiniteTalk et de l'encodeur texte LTX-2.5 : non relevées.
- Qualité du rendu « cartoon 2D » de chaque modèle à 480p : aucune donnée indépendante.

## 3. Coût d'un sketch de 30–60 s sur chaque voie (gratuit d'abord ; payant en comparaison)

### Takeaway
En gratuit, le coût est en **temps de quota**, pas en argent : un sketch de 60 s (12 plans × 3 prises = 36 clips) ≈
**5,4 à 9 h de T4 Kaggle** à 480p (≈ 18–30 % du quota hebdomadaire), ou 12 jours de ZeroGPU. En payant (comparaison
seulement), le même sketch coûte ≈ **0,60–2,25 $** en GPU loué (RunPod 4090 communautaire à 0,34 $/h) et ≈ **3,60–5,40 $**
avec les API fermées les moins chères (Grok Imagine 1.5 Lite, Seedance 1.5 Pro muet, Veo 3.1 Lite muet), jusqu'à
**~72 $** en Veo 3.1 standard avec audio.

### Cited Findings
- Prix vidéo OpenRouter **observés le 16/10/2026 à 01:07 UTC** ([API vidéo OpenRouter](https://openrouter.ai/api/v1/videos/models), 30 modèles) : Grok Imagine Video 1.5 Lite 0,02 / **0,03** / 0,14 $/s (480p/720p/1080p) + 0,01 $/image, 1–15 s ; Grok Imagine Video 1.5 0,08 / 0,14 / 0,25 $/s ; grok-imagine-video 0,05 / 0,07 $/s ; Veo 3.1 0,40 $/s avec audio, 0,20 sans ; Veo 3.1 Fast 720p 0,10 avec audio / 0,08 sans ; **Veo 3.1 Lite 720p 0,05 avec audio / 0,03 sans** ; Kling v3.0 Std 0,084 (0,126 audio), Pro 0,112 (0,168), Kling O1 0,112 ; Seedance 1.5 Pro 2,4 $/M jetons (1,2 sans audio) ; Seedance 2.0 7 $/M, 2.0 Fast 4,2, 2.0 Mini 3,5, 2.5 10,7 ; Hailuo 3 (MiniMax H3) 0,13 $/s 2K ; Hailuo 3 Max 0,05 (480p) / 0,08 (768p) ; Wan 2.6 i2v 720p 0,10 ; Wan 2.7 0,10 ; Wan 3.0 0,05/0,10/0,20 ; HappyHorse 1.0/1.1 0,0988 (720p) ; Runway Gen-4.5 0,12 ; Aleph 2 0,28 (min 0,56 $) ; FLUX 3 Video 0,17 (720p) ; HeyGen Video 1 0,02 (480p). Aucun modèle vidéo n'apparaît dans `GET /api/v1/models` (465 modèles, tous sans sortie vidéo) — observé le 16/10/2026.
- Seedance : jetons = largeur × hauteur × 24 × durée ÷ 1024 → 720p 9:16 = 21 600 jetons/s — [fal, guide Seedance 1.5](https://fal.ai/learn/devs/seedance-1-5-user-guide) (note du 14/10).
- Prix directs Google (Gemini API) : Veo 3.1 0,40 $/s, Fast 0,10 $/s (720p), Lite 0,05 $/s (720p) ; pas de palier gratuit pour Veo — [tarifs Gemini](https://ai.google.dev/gemini-api/docs/pricing) (note du 14/10).
- Location GPU **lue le 16/10/2026** — RunPod Pods (communautaire / sécurisé, $/h) : RTX 3090 0,22/0,50 ; **RTX 4090 0,34/0,89** ; RTX 5090 0,69/1,19 ; L4 0,44/0,59 ; A40 0,35/0,59 ; L40S 0,79/1,09 ; A100 80 Go PCIe 1,19/1,79 ; **H100 SXM 2,69/3,99** ; H100 PCIe 1,99/2,89 ; H200 3,59/5,29 ; RTX PRO 6000 1,69/2,49 ; B200 5,98/7,99 ; Serverless ($/h) : 4090 1,10 ; 5090 1,58 ; L40S 1,75 ; A100 2,72 ; H100 4,79 ; H200 5,93 — [RunPod Pricing](https://www.runpod.io/pricing).
- Vast.ai, offres 1 GPU à la demande **observées le 16/10/2026 ~01:10 UTC** via l'API publique de recherche : RTX 3090 min 0,17 / médiane 0,25 $/h (n = 24) ; **RTX 4090 min 0,46 / médiane 0,67** (n = 31) ; RTX 5090 0,60 / 0,87 (n = 33) ; L40S 0,74 / 0,82 (n = 4) ; RTX PRO 6000 WS 1,33 / 1,61 (n = 10) ; A100 SXM4 **40 Go** dès 0,47 ; H100 SXM 2,76–3,38 (n = 6, dont un hôte au Nigeria à 3,33) ; H100 PCIe 2,97 (Afrique du Sud) ; H200 2,80–4,61 — [Vast.ai API bundles](https://console.vast.ai/api/v0/bundles/) ; la page de prix est rendue en JavaScript — [Vast.ai pricing](https://vast.ai/pricing).
- Lambda (1 GPU, $/h) : H100 SXM 4,29 ; H100 PCIe 3,29 ; GH200 2,29 ; A100 40 Go 1,99 ; A10 1,29 ; A6000 1,09 ; B200 6,99 — [Lambda](https://lambda.ai/pricing). Replicate : H100 et H200 0,001525 $/s (5,49 $/h), A100 80 Go 5,04 $/h, L40S 3,51 $/h, T4 0,81 $/h ; Wan 2.1 i2v 0,09 $/s (480p), 0,25 $/s (720p) — [Replicate](https://replicate.com/pricing). fal Compute : H100 4,50 $/h (dès 2,49), H200 6,00 (dès 2,99), RTX PRO 6000 4,00 (dès 1,99) — [fal Pricing](https://fal.ai/pricing).
- Modèles ouverts hébergés à la sortie : fal Wan 2.2 A14B i2v **avec LoRA 0,10 $/s** — [fal](https://fal.ai/models/fal-ai/wan/v2.2-a14b/image-to-video/lora) ; fal LTX-2 Fast i2v 0,04 $/s en 1080p (6–20 s, audio inclus) — [fal](https://fal.ai/models/fal-ai/ltx-2/image-to-video/fast) ; Alibaba Wan 2.2 i2v-flash 0,015 $/s (480p) / 0,036 (720p) — [Model Studio](https://www.alibabacloud.com/help/en/model-studio/model-pricing) (note du 14/10).

### Inferences

#### Tableau 3 — un sketch (60 s ; 30 s = moitié) ; 1 clip = 5 s ; « ×3 » = 3 prises par plan

| Voie | Base de calcul | 60 s, 1 prise | **60 s, ×3** | Quota / temps GPU pour 60 s ×3 |
|---|---|---|---|---|
| **Kaggle T4 (gratuit)**, TI2V-5B 480p | 9–15 min/clip | 0 $ | **0 $** | 36 clips × 9–15 min = **5,4–9 h** (18–30 % de 30 h/semaine) |
| **ZeroGPU (gratuit)**, Wan 2.2 14B FP8 4 pas | 3 clips/jour | 0 $ | **0 $** | 36 clips ÷ 3 = **12 jours** (1 compte) |
| **Lightning (gratuit)**, T4 | idem Kaggle | 0 $ | **0 $** | 5,4–9 h sur ~18 h/semaine |
| **Modal (30 $ offerts)**, Wan 2.1 14B 720p H100 | 284 s/clip × 0,001097 $/s = 0,31 $/clip | 3,74 $ | **11,22 $** de crédit (37 % des 30 $) | 2,84 h H100 |
| Location RunPod 4090 communautaire (payant), TI2V-5B 720p | 667 s × 0,34 $/h ÷ 3 600 = 0,063 $/clip → 0,0125 $/s | 0,75 $ | **2,25 $** | 6,6 h |
| idem, Wan 2.2 14B Lightning 480p (180 s/clip) | 0,017 $/clip → 0,0034 $/s | 0,20 $ | **0,61 $** | 1,8 h |
| idem, Wan 2.1 14B 480p sur 4090 (281 s) | 0,0053 $/s | 0,32 $ | 0,96 $ | 2,8 h |
| idem, HunyuanVideo-1.5 distillé (75 s, 121 images) | 0,0014 $/s | 0,08 $ | 0,25 $ | 0,74 h |
| Vast 4090 médiane (0,67 $/h), TI2V-5B 720p | 0,0246 $/s | 1,48 $ | 4,43 $ | 6,6 h |
| RunPod H100 SXM communautaire, Wan 2.1 14B 720p | 0,0424 $/s | 2,55 $ | 7,64 $ | 2,8 h |
| RunPod serverless 4090 (1,10 $/h), TI2V-5B 720p | 0,0404 $/s | 2,43 $ | 7,28 $ | — |
| API Grok Imagine 1.5 Lite 480p / 720p | 0,02 / 0,03 $/s | 1,20 / 1,80 $ | **3,60 / 5,40 $** | — |
| API Seedance 1.5 Pro 720p muet | 21 600 × 1,2e-6 = 0,0259 $/s | 1,56 $ | 4,67 $ | — |
| API Veo 3.1 Lite 720p muet / audio | 0,03 / 0,05 $/s | 1,80 / 3,00 $ | 5,40 / 9,00 $ | — |
| API Hailuo 3 Max 480p | 0,05 $/s | 3,00 $ | 9,00 $ | — |
| API Kling 3.0 Std muet / audio | 0,084 / 0,126 $/s | 5,04 / 7,56 $ | 15,12 / 22,68 $ | — |
| API Veo 3.1 Fast 720p audio | 0,10 $/s | 6,00 $ | 18,00 $ | — |
| API Seedance 2.0 720p | 0,151 $/s | 9,07 $ | 27,22 $ | — |
| API Veo 3.1 standard audio | 0,40 $/s | 24,00 $ | **72,00 $** | — |
| fal Wan 2.2 A14B + LoRA (hébergé) | 0,10 $/s | 6,00 $ | 18,00 $ | — |

- Les coûts de location ci-dessus **excluent** le chargement des poids, le démarrage à froid, l'inactivité et le stockage : en pratique ×1,3 à ×2 (hypothèse).
- Par mois (≈ 17 sketches de 45 s, 3 prises ≈ 2 340 s générées) : gratuit = 0 $ mais 2 340 ÷ 5 = 468 clips × 9–15 min ≈ **70–117 h de T4/mois**, soit l'essentiel du quota Kaggle (~30 × 4,33 ≈ 130 h/mois) → tenable seulement à 480p et sans marge (Lightning/ZeroGPU en renfort) ; en payant : RunPod 4090 TI2V-5B 720p ≈ 29 $/mois, Lightning 14B 480p ≈ 8 $/mois ; API Grok Lite 720p ≈ 70 $/mois ; Kling 3.0 Std ≈ 196 $/mois ; Veo 3.1 ≈ 935 $/mois.
- Point dur pour 54 personnages récurrents : le prix à la seconde importe moins que le **taux de rejet** (cohérence des personnages), qui fixe le nombre réel de prises — non mesuré.

### Gaps
- Aucun chrono T4 précis pour notre format (9:16, 480p, 5 s) ; taux de reprises réel inconnu.
- Coûts serverless « à froid » (temps de chargement facturé) de RunPod/Modal pour un modèle de 11–30 Go : non mesurés.
- Prix fal par sortie pour Wan 2.2 5B, HunyuanVideo-1.5 et LTX-2.5 : l'API de prix fal exige une clé (réponse 401 le 16/10/2026).

## 4. LoRA de personnages : combien coûte l'entraînement (gratuit vs payant) ?

### Takeaway
En gratuit, une LoRA vidéo Wan sur T4 coûte surtout du **quota** : les guides donnent ~3–3,5 h pour 30 images au rang 32
sur une carte de 12 Go (plus lent sur T4, non mesuré) → **54 LoRA ≈ 160 à 300 h de GPU gratuit**, soit 5 à 10 semaines
de quota Kaggle entier. Il vaut mieux ne former des LoRA que pour les ~6–10 personnages principaux (ou une LoRA de
« style troupe ») et animer les autres depuis une image de départ tirée de leur fiche. En payant (comparaison) : fal
facture **0,005 $/pas** (1 000 pas = 5 $) → 54 × 5 $ = **270 $** ; ≈ 1–2 h de H100 RunPod à 2,69 $/h par personnage.

### Cited Findings
- fal Wan 2.2 I2V-A14B trainer : **0,005 $ par pas, minimum 100 pas** ; « For $5 you can fine-tune a LoRA for 1000 steps » ; au moins **une vidéo** requise (jeux d'images seules refusés) — [fal](https://fal.ai/models/fal-ai/wan-22-trainer/i2v-a14b) (lu le 16/10/2026).
- AI Toolkit sur carte 12 Go : ~3 h pour 30 images au rang 32 (T2V), ~3,5 h (I2V) — [wan27.org](https://wan27.org/blog/wan-2-2-lora-training-guide) (résumé de recherche) ; la séparation high/low noise de Wan 2.2 alourdit l'entraînement, « almost 2-3 days for video training » — [StableDiffusionTutorials](https://www.stablediffusiontutorials.com/2025/10/wan2.2-lora-training.html) (résumé de recherche).
- RunPod H200 : ~22 h et ~80 $ pour 500+ images × 100+ époques ; ~15 images × 100 époques ≈ 1 h et 2–3 $ — [Medium, A. Areeb](https://medium.com/@ahmadareeb3026/training-wan2-2-for-your-character-custom-style-ultra-realistic-images-f8993350c862) (résumé de recherche) ; une LoRA bien réglée sur H100/A100 80 Go ≈ 25–50 $, une LoRA vidéo sur carte 96 Go ≈ 24 h — [Spheron, 2026](https://www.spheron.network/blog/fine-tune-flux2-wan-lora-cost-gpu-cloud-2026/) (résumé de recherche, vendeur de GPU).
- LTX : `ltx-trainer` (« LoRA, full fine-tuning, and IC-LoRA ») recommande un GPU **80 Go+**, configuration basse VRAM (INT8) pour 32 Go (RTX 5090) — [ltx-trainer](https://github.com/Lightricks/LTX-2/tree/main/packages/ltx-trainer) ; HunyuanVideo-1.5 : LoRA intégrée (rang 8, alpha 16) — [README](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5).
- Alternatives sans LoRA (API) : Veo 3.1 jusqu'à 3 images de référence, Grok Imagine 1.5 jusqu'à 14 images, Seedance 2.x jusqu'à 30 images — [doc Veo](https://ai.google.dev/gemini-api/docs/veo), [modèles xAI](https://docs.x.ai/docs/models) (note du 14/10) ; ouvert : MiniMax H3 Ref2VA ≤ 9 images — [MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3).

### Inferences
- Gratuit : 54 × 3–5,5 h (T4 plus lent qu'une carte 12 Go récente, hypothèse ×1–1,5) ≈ **160–300 h** → 5,4 à 10 semaines de quota Kaggle entièrement consacré aux LoRA, sans aucune génération → irréaliste d'un bloc ; étaler : 2–3 LoRA/semaine en parallèle de la production.
- Les LTX LoRA (80 Go recommandés) sont hors de portée du gratuit ; Wan 2.2 TI2V-5B ou Wan 2.1 1.3B sont les seules cibles LoRA réalistes sur T4 (aucun chrono publié).
- Stratégie économique : fiche de personnage → image de départ cohérente (outil image) → i2v Wan ; LoRA seulement pour les personnages qui apparaissent dans la majorité des sketches.

### Gaps
- Aucun chrono d'entraînement LoRA Wan 2.2 (5B ou 14B) sur T4/Kaggle ; RAM Kaggle suffisante ou non pour musubi-tuner / AI Toolkit : non vérifié.
- Nombre d'images/clips minimal par personnage cartoon pour une LoRA fiable : pas de source dédiée au dessin 2D.

## 5. Recréer « le moteur » de Veo 3 / Kling / Grok Imagine à partir de zéro : réaliste ?

### Takeaway
Non. Le modèle ouvert « bon marché » de référence, **Open-Sora 2.0 (11 B)**, a coûté **199 600 $** (4 160 GPU-jours de
H200 à 2 $/h, 224 GPU) pour une qualité comparée en 2025 à HunyuanVideo / Runway Gen-3 Alpha — loin de Veo 3. Seaweed-7B
a demandé **665 000 heures H100** ; Movie Gen (30 B) plus de 6 000 H100 ; Step-Video-T2V (30 B) « des milliers » de H800.
Au prix de location actuel, c'est 280 000 $ à 2,8 M$ de calcul seul, hors données et équipe — soit des siècles d'un
budget de créateur, et impossible à budget zéro.

### Cited Findings
- Open-Sora 2.0 : tableau 2 du rapport — 256px T2V 224 GPU, 2 240 GPU-jours, 107,5 k$ ; 256px T/I2V 192 GPU, 384 GPU-jours, 18,4 k$ ; 768px T/I2V 192 GPU, 1 536 GPU-jours, 73,7 k$ ; **total 4 160 GPU-jours, 199,6 k$**, en supposant « the rental price of H200 is $2 per GPU hour » ; modèle **11 B** ; jeux de données de 70 M, 10 M et 5 M clips selon l'étape — [arXiv 2503.09642v3](https://arxiv.org/html/2503.09642v3) ; qualité « comparable » à HunyuanVideo et Runway Gen-3 Alpha (VBench + humains) ; coût annoncé 5–10× inférieur à Movie Gen et Step-Video-T2V — [arXiv abstract](https://arxiv.org/abs/2503.09642).
- Seaweed-7B (ByteDance Seed, avril 2025) : ~7 B, **665 000 H100 GPU-heures** depuis zéro ; rappelle que Movie Gen a utilisé « more than 6,000 H100 GPUs » — [arXiv 2504.08685](https://arxiv.org/abs/2504.08685) (résumé de recherche).
- Movie Gen : « Our largest video generation model is a 30B parameter transformer » — [arXiv 2410.13720](https://arxiv.org/abs/2410.13720).
- Step-Video-T2V : 30 B, datacenter de « thousands of NVIDIA H800 GPUs » (pas de GPU-heures publiées) — [arXiv 2502.10248](https://arxiv.org/html/2502.10248v1) ; un blog tiers avance 4 096 H800 × 28 jours et > 8 M$ (**non vérifié**) — [anakin.ai](http://anakin.ai/blog/step-video-t2v-a-technical-deep-dive-into-the-open-source-video-generation-model/).
- Même la **distillation** d'un modèle existant coûte cher : Wan2.1-14B distillé (DMD2, NVIDIA FastGen) sur **64 H100 pendant 16 h** — [Lyceum, 15/09/2026](https://lyceum.technology/magazine/what-it-costs-to-train-a-text-to/).
- Estimation de coût de Movie Gen ~2,5 M$ et Step-Video ~1 M$ : estimations de presse, non publiées par les auteurs — [The Decoder](https://the-decoder.com/open-sora-2-0-achieves-competitive-ai-video-quality-at-one-tenth-the-training-cost-of-commercial-models/) (résumé de recherche).

### Inferences
- Open-Sora 2.0 recalculé aux prix lus le 16/10/2026 : 99 840 GPU-h × 3,59 $ (H200 RunPod communautaire) ≈ **358 k$** ; × 2,80 $ (H200 le moins cher sur Vast) ≈ **280 k$**. Seaweed-7B : 665 000 × 2,69 $ (H100 SXM RunPod) ≈ **1,79 M$** ; × 1,99 $ (H100 PCIe) ≈ 1,32 M$.
- 200 k$ = 4 000 mois d'un budget de 50 $/mois (≈ 333 ans) ; à budget zéro, la seule voie réaliste est de **réutiliser des poids ouverts** (Wan 2.2, HunyuanVideo-1.5, LTX-2.5, MiniMax H3) et d'y ajouter LoRA / images de référence — c'est cela, « recréer le moteur » à notre échelle.
- Les distillations 4 pas déjà publiées (Lightx2v, Lightning) apportent gratuitement un gain que l'on ne pourrait pas s'offrir (≈ 1 024 H100-h pour une distillation 14B).

### Gaps
- GPU-heures de Wan 2.x, HunyuanVideo (13 B / 1.5), MAGI-1, LTX-2.x et MiniMax H3 : non publiés dans les sources lues.
- Coûts de données (licences, nettoyage) : non chiffrés par les rapports.

## 6. Accès et paiement depuis le Sénégal (comptes gratuits d'abord)

### Takeaway
Pour le **gratuit**, l'obstacle n'est pas le paiement mais la **vérification** : Kaggle et Lightning exigent un numéro
de téléphone (réception des SMS au Sénégal non confirmée), Hugging Face seulement un e-mail, Modal peut-être une carte
(sources contradictoires), Azure/Oracle/GCP/AWS une carte. Pour plus tard (payant) : l'**API Gemini est ouverte au
Sénégal**, et la **carte virtuelle Visa de Wave** (lancée le 23/01/2026 avec Ecobank) est la piste la plus simple pour
payer OpenRouter/RunPod/xAI depuis le mobile money (frais et acceptation en USD non publiés).

### Cited Findings
- Gemini API / AI Studio : le **Sénégal** figure dans les régions disponibles (ainsi que Côte d'Ivoire, Mali, Nigeria, Ghana, Bénin, Burkina Faso, Guinée, Niger, Togo…) ; page mise à jour le 28/04/2026 — [Gemini API available regions](https://ai.google.dev/gemini-api/docs/available-regions) (lu le 16/10/2026).
- Wave Sénégal : carte **virtuelle Visa** lancée le 23/01/2026 à Dakar avec Visa et Ecobank Sénégal, intégrée à l'application, émission immédiate, pour paiements en ligne (e-commerce, abonnements, services numériques) ; frais, plafonds et paiements en USD **non précisés** — [Financial Afrik, 24/01/2026](https://www.financialafrik.com/2026/01/24/senegal-wave-lance-une-carte-virtuelle-avec-visa-et-ecobank/) ; ouverte à tous les détenteurs de compte Wave selon les promoteurs — [AllAfrica](https://fr.allafrica.com/stories/202601260227.html).
- OpenRouter : cartes, AliPay, **USDC** ; frais 5,5 % (min 0,80 $) par carte, 5 % en crypto ; crédits pouvant expirer après un an ; crypto jamais remboursée — [FAQ OpenRouter](https://openrouter.ai/docs/faq) (lu le 16/10/2026).
- RunPod : dépôt minimum 10 $ ; carte via Stripe (≥ 100 $ conseillés avec carte prépayée) ; crypto via crypto.com avec KYC ; une Pod exige au moins 1 h de crédit — [RunPod billing](https://docs.runpod.io/references/billing-information), [blog RunPod](https://www.runpod.io/blog/manage-runpod-account-funding), [RunPod docs](https://docs.runpod.io/billing/).
- xAI : crédits prépayés, carte ou virement, achat via « Guest Checkout due to regulatory requirements », recharge auto ≥ 5 $, crypto non mentionnée — [xAI billing](https://docs.x.ai/docs/key-information/billing).
- Kling API officielle : paquets prépayés (essai 9,80 $ / 100 unités, 30 jours ; standard dès 700 $), abonnement web sans accès API (source tierce) ; pays et moyens de paiement non trouvés — [Atlas Cloud](https://www.atlascloud.ai/blog/guides/kling-ai-api-pricing).
- Vérifications gratuites : Kaggle — téléphone pour GPU/Internet ([AIMultiple](https://aimultiple.com/free-cloud-gpu)) ; Lightning — sans carte, téléphone pour crédits GPU ([AIMultiple](https://aimultiple.com/free-cloud-gpu)) ; HF ZeroGPU — e-mail vérifié et compte ≥ 30 jours pour héberger ([HF docs](https://huggingface.co/docs/hub/spaces-zerogpu)) ; Azure — téléphone + carte non prépayée ([GPUperHour](https://gpuperhour.com/blog/free-cloud-gpus-and-credits)) ; Oracle — carte ([Oracle docs](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm), via résumé de recherche).
- Licence MiniMax H3 : formulaire de demande « only for USA/EU/UK/South Korea » — [MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3).

### Inferences
- Ordre d'ouverture conseillé (gratuit) : Hugging Face (e-mail) → Kaggle (téléphone) → Lightning (téléphone) ; tester Modal sans carte. Si le SMS Kaggle n'arrive pas avec un numéro sénégalais, le fil du responsable Kaggle suggère de signaler l'indicatif.
- Si un jour un petit budget est accepté : carte virtuelle Wave → OpenRouter (un seul compte pour Grok, Veo, Kling, Seedance, Hailuo, Wan) ou RunPod (10 $ minimum) ; tester d'abord un petit montant car l'acceptation des marchands étrangers en USD n'est pas documentée.

### Gaps
- Acceptation réelle de la carte virtuelle Wave chez Stripe (OpenRouter, RunPod), xAI, Google Cloud Billing : non documentée.
- Réception des SMS de vérification Kaggle / Lightning avec un numéro +221 : aucune source.
- Disponibilité de Kling (officiel), BytePlus (Seedance), MiniMax et Alibaba Cloud international pour des comptes au Sénégal : non lue.

## 7. Montage recommandé pour cet utilisateur (budget zéro)

### Takeaway
Un « moteur maison » gratuit est faisable **en lots, à 480p** : orchestrateur dans le conteneur CPU → **Kaggle T4×2**
(Wan 2.2 TI2V-5B GGUF, ~120–200 clips/semaine) + **Lightning AI** en renfort (~70–120 clips/semaine si confirmé) +
**ZeroGPU** pour 3 plans vedettes/jour en Wan 2.2 14B FP8 4 pas ; personnages tenus par **images de départ tirées des
fiches** et quelques LoRA pour les rôles principaux ; les 0,50 $ OpenRouter servent à **un** clip étalon (Grok 1.5 Lite).
Capacité estimée : **4 à 7 sketches de 45 s par semaine** à 480p avec 3 prises par plan. Comparaison payante en une
ligne : RunPod 4090 à 0,34 $/h ≈ 0,60–2,25 $ par sketch de 60 s ; API la moins chère ≈ 3,60–5,40 $.

### Cited Findings
- Kaggle : ~30 h/semaine, T4×2, CLI `kernels push/status/output` — [kernels.md](https://github.com/Kaggle/kaggle-api/blob/main/docs/kernels.md) ; ~9–15 min par clip sur T4 — [WanGP-Kaggle](https://github.com/kayas881/WanGP-Kaggle).
- ZeroGPU : 5 min et 3 exécutions/jour ; Space Wan 2.2 FP8 4 pas — [HF docs](https://huggingface.co/docs/hub/spaces-zerogpu), [forum HF](https://discuss.huggingface.co/t/free-account-zerogpu-quota-issue/175180), [app.py](https://huggingface.co/spaces/zerogpu-aoti/wan2-2-fp8da-aoti-faster/blob/main/app.py).
- Lightning : 15 crédits/mois, sans carte, téléphone — [AIMultiple](https://aimultiple.com/free-cloud-gpu).
- Paquet Wan 2.2 TI2V-5B Q4 ≈ 11,5 Go (3,4 + 6,7 + 1,4) — [QuantStack](https://huggingface.co/api/models/QuantStack/Wan2.2-TI2V-5B-GGUF/tree/main?recursive=true), [Comfy-Org](https://huggingface.co/api/models/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main?recursive=true).
- Licence Wan 2.2 Apache-2.0 — [Wan2.2 README](https://github.com/Wan-Video/Wan2.2) ; LTX-2.x Community (gratuit sous 10 M$ de revenus) — [VentureBeat](https://venturebeat.com/technology/ltx-2-5-can-generate-a-10-second-ai-video-from-an-image-in-just-6-8-seconds-on-nvidia-superchips-and-its-open-weights).

### Inferences
- Pipeline : (1) script du sketch → découpage en plans de 5 s (conteneur) ; (2) image de départ par plan à partir des fiches des 54 personnages ; (3) lot hebdomadaire poussé sur Kaggle (poids posés une fois en dataset privé pour éviter de les retélécharger) ; (4) plans clés sur ZeroGPU ; (5) voix + lip-sync (InfiniteTalk seulement pour les gros plans parlés — coûteux en quota) ; (6) upscale 480p → 720p/1080p et montage 9:16 dans le conteneur ou sur Kaggle.
- Premier pas mesurable (gratuit) : un notebook Kaggle qui chronomètre **1 clip 5 s 480p 9:16** en TI2V-5B Q4 et en I2V-A14B Q3/Q4 + Lightx2v ; ces deux chiffres fixent le vrai nombre de sketches/semaine.
- À ne pas faire : entraîner un modèle de zéro ; cumuler plusieurs comptes ; ouvrir ComfyUI en interface web sur Colab gratuit.

### Gaps
- Tout le débit repose sur des chiffres communautaires T4 non vérifiés et sur un quota Kaggle non garanti (« sometimes higher depending on demand » — et donc parfois plus bas) ; conditions d'usage Kaggle pour une production régulière de contenus : non lues.
- Qualité acceptable pour TikTok d'un 480p upscalé sur des personnages cartoon : à juger sur un premier lot.
