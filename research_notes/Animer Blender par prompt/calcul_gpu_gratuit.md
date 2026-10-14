# Calcul GPU gratuit (sans abonnement) pour les modèles vidéo ouverts (Wan 2.1/2.2, LTX) — état au 14/10/2026

Portée : où faire tourner gratuitement Wan 2.2 TI2V-5B / Animate-14B / I2V-A14B, Wan 2.1 VACE (1.3B/14B) et LTX pour la
chaîne Film (moteur Blender en conteneur CPU 4 cœurs, sans GPU, ~3 Go de disque libre). Chaque fait porte sa source ;
« observé » = mesuré par nous le 14/10/2026 (API Hugging Face, `app.py` des Spaces, docs GitHub téléchargées).
Les calculs (clips/jour, films/semaine) sont des **inférences**, jamais des mesures. Aucune création de compte n'est
proposée : c'est à l'utilisateur de décider.

Rappel de besoin : un film = 64 s ≈ **13 clips de 5 s** (Wan sort 16 i/s : 5 s ≈ 80–81 images).

## 1. Kaggle (quota GPU hebdomadaire, T4×2 / P100, TPU, API headless, Internet, limites de sortie)

### Takeaway
Kaggle reste la meilleure source **gratuite, automatisable officiellement** : environ 30 h GPU/semaine (T4×2, 2 × 16 Go),
sessions de 12 h, et la CLI officielle `kaggle kernels push` lance un notebook GPU sans navigateur puis récupère les
sorties. P100 retiré le 15/09/2026 ; vérification par téléphone obligatoire pour GPU et Internet.

### Cited Findings
- La CLI officielle `kaggle kernels push -p <dossier>` « Pushes new code/notebook and metadata to a kernel, then runs the kernel » ; option `--accelerator <ID>` (« NvidiaTeslaT4 (GPU T4 ×2, default GPU) », « NvidiaL4 », « TpuV5E8 », « TpuV6E8 ») et `-t/--timeout <secondes>` — [Kaggle API docs, kernels.md](https://github.com/Kaggle/kaggle-api/blob/main/docs/kernels.md) (lu le 14/10/2026).
- Liste « Accelerators available as of Sep 2026 » : NvidiaTeslaT4 (T4 ×2), NvidiaTeslaA100, NvidiaL4, TpuV5E8, NvidiaL4X1, TpuV6E8, NvidiaH100, NvidiaRtxPro6000 — avec la réserve « Some of these are only available to participants of specific competitions, and some are only available to Kaggle admins » — [kernels.md](https://github.com/Kaggle/kaggle-api/blob/main/docs/kernels.md). P100 n'y figure plus.
- `kaggle kernels status` indique si la dernière exécution tourne, a réussi ou échoué ; `kaggle kernels output <owner/slug>` télécharge les fichiers produits (pagination `--page-size` jusqu'à 200, filtre `--file-pattern`) — [kernels.md](https://github.com/Kaggle/kaggle-api/blob/main/docs/kernels.md).
- `kernel-metadata.json` : `enable_gpu` (défaut false), `enable_internet` (défaut false), `machine_shape` (ex. `NvidiaTeslaT4`), et sources attachables `dataset_sources`, `kernel_sources`, `model_sources` — [kernels_metadata.md](https://github.com/Kaggle/kaggle-api/blob/main/docs/kernels_metadata.md).
- Annonce officielle « Sunsetting the NVIDIA Tesla P100 GPU on September 15, 2026 » — [Kaggle product announcement](https://www.kaggle.com/product-announcements/735239) (titre lu ; corps non rendu). Selon le résumé de recherche du même avis : remplacement par T4×2, bascule automatique des notebooks P100 après le 15/09/2026 — [même source, via moteur de recherche](https://www.kaggle.com/product-announcements/735239) (non relu en texte intégral).
- Quota : « 30 hours or sometimes higher depending on demand and resources », remis à zéro chaque semaine (extrait de la page officielle obtenu via moteur de recherche, page non lisible directement car rendue en JavaScript) — [Kaggle, Efficient GPU Usage Tips](https://www.kaggle.com/docs/efficient-gpu-usage). Le blog GPUperHour (21/09/2026) note que le quota n'est pas publié dans la doc et que « users commonly report about 30 hours », visible dans les réglages du compte — [GPUperHour, Free Cloud GPUs in 2026](https://gpuperhour.com/blog/free-cloud-gpus-and-credits).
- Sessions : 12 h pour CPU et GPU, 9 h pour TPU ; lier un Colab Pro / Pro+ ajoute 15 / 30 h GPU par semaine (promotion révocable) — [GPUperHour, 21/09/2026](https://gpuperhour.com/blog/free-cloud-gpus-and-credits) (agrégateur citant kaggle.com/docs/notebooks).
- Vérification par téléphone nécessaire avant d'avoir les options Internet et GPU (rapports de cours/forums, pas la doc Kaggle) — [Calvin University CS 376](https://cs.calvin.edu/courses/cs/376/25sp/units/01introduction/lab/) ; [Neuromatch, tutorial Kaggle](https://neuroai.neuromatch.io/tutorial-kaggle) ; [forum fast.ai](https://forums.fast.ai/t/beginner-using-colab-or-kaggle/96280).
- Débit rapporté (communauté) : le notebook « WanGP-Kaggle » vise le T4 (15 Go utiles), recommande le 480p et annonce « Expect ~9-15 minutes per video on T4 » ; il expose l'interface via un lien Gradio public (« expire in ~1 week ») — [kayas881/WanGP-Kaggle README](https://github.com/kayas881/WanGP-Kaggle) (communautaire, non mesuré par nous, modèle exact non précisé).
- Un notebook public Kaggle « Wan 2.2 TI2V 5B Diffusers Free GPU Test » affiche une exécution de 6 min 56 s sur P100 (résumé de recherche ; durée vidéo et réglages non vérifiés) — [Kaggle notebook ali9999008](https://www.kaggle.com/code/ali9999008/wan-2-2-ti2v-5b-diffusers-free-gpu-test).

### Inferences
- Chaîne automatisable de bout en bout et dans les règles : le conteneur pousse un notebook (script Wan + images de départ Blender en `dataset_sources`), lance avec `--accelerator NvidiaTeslaT4`, interroge `kernels status`, puis rapatrie les MP4 par `kernels output`. Aucun navigateur requis.
- Débit théorique (si 9–15 min par clip 5 s 480p sur T4, chiffre communautaire) : 13 clips ≈ 2 h à 3 h 15 de GPU par film → 30 h/semaine ≈ **9 à 15 films/semaine au plus**, moins le temps de chargement des poids à chaque session. Un T4×2 n'accélère pas un clip unique sauf pipeline multi-GPU ; il permet en revanche deux clips en parallèle (un par GPU) — à mesurer.
- Le T4 (Turing) n'a pas de bf16 natif ni de FP8 : les recettes FP8/NVFP4 récentes (LightX2V) ne s'y appliquent pas ; préférer fp16 + offload ou GGUF/quantif int8 — à vérifier par un essai.
- Attacher les poids Wan comme dataset/modèle Kaggle (`dataset_sources`/`model_sources`) évite de les retélécharger à chaque run et permet de laisser `enable_internet` à false.

### Gaps
- Quota exact par compte en octobre 2026 et accès réel des comptes ordinaires à `NvidiaL4` / `NvidiaRtxPro6000` / `NvidiaH100` : non confirmés (docs Kaggle rendues en JavaScript, non lisibles ici).
- Limite de taille de `/kaggle/working` et disque disponible : aucune source officielle lue (souvent citée « ~20 Go », non vérifié).
- CGU Kaggle sur l'usage « production » répété de notebooks GPU pour générer des médias : texte non lu ; le lien Gradio public du notebook WanGP-Kaggle n'est ni autorisé ni interdit par une source lue.
- Aucun chrono mesuré de Wan2.2 TI2V-5B ou Wan2.1 VACE-1.3B sur T4 Kaggle avec réglages connus.

## 2. Google Colab gratuit (T4, CGU sur l'automatisation / usage non interactif, limites de session)

### Takeaway
Colab gratuit n'est pas une base fiable pour une chaîne automatique : GPU « heavily restricted » et non garantis, limites
non publiées, 12 h maximum, priorité à l'usage interactif, et pour les comptes gratuits l'usage d'une interface web
(type Gradio/ComfyUI) à la place du notebook est explicitement restreint.

### Cited Findings
- « In the version of Colab that is free of charge, access to expensive resources like GPUs is heavily restricted » ; les types de GPU « vary over time » ; Colab « does not publish these limits » — [FAQ Colab](https://research.google.com/colaboratory/faq.html) (lue le 14/10/2026).
- « Colab prioritizes interactive compute. Runtimes will time out if you are idle. In the version of Colab that is free of charge notebooks can run for at most 12 hours » ; Colab « prioritizes users who are actively programming in a notebook » — [FAQ Colab](https://research.google.com/colaboratory/faq.html).
- Interdit sur tous les runtimes : « file hosting, media serving, or other web service offerings not related to interactive compute », proxies distants, minage, « using multiple accounts to work around access or resource usage restrictions », deepfakes, etc. — [FAQ Colab](https://research.google.com/colaboratory/faq.html).
- Restreint pour les comptes gratuits sans solde d'unités de calcul (« may be terminated at any time without warning ») : « remote control such as SSH shells, remote desktops », « bypassing the notebook UI to interact primarily via a web UI », « running distributed computing workers » — [FAQ Colab](https://research.google.com/colaboratory/faq.html).
- Les utilisateurs rapportent un T4 en gratuit, non confirmé par Google — [GPUperHour, 21/09/2026](https://gpuperhour.com/blog/free-cloud-gpus-and-credits).

### Inferences
- Lancer Wan via une interface Gradio/ComfyUI sur Colab gratuit tombe dans « bypassing the notebook UI … via a web UI » → risque de coupure ; un pilotage depuis notre conteneur (worker distant) ressemble à un « distributed computing worker » → à éviter.
- Usage acceptable : ouvrir manuellement un notebook, exécuter les cellules, télécharger les clips — utile en appoint, pas pour « plusieurs films par semaine ».

### Gaps
- Aucune API officielle pour lancer un notebook Colab gratuit sans interface ; aucune source lue sur un quota horaire chiffré.

## 3. Hugging Face (ZeroGPU, Spaces dupliqués, gradio_client, Inference Providers, Spaces Wan/LTX actifs)

### Takeaway
ZeroGPU est désormais adossé à des **RTX Pro 6000 Blackwell (48 Go par demi-carte, 96 Go en `xlarge`)**, mais le quota
gratuit est minuscule : **5 min/jour** connecté, **2 min/jour** anonyme. Concrètement ≈ 4 clips Wan 2.2 de 5 s par jour
et par compte gratuit. Appel programmatique officiel via `gradio_client` avec jeton. Les Inference Providers n'offrent
**plus aucun crédit mensuel aux comptes gratuits**.

### Cited Findings
- Matériel : `large` (défaut) = « Half NVIDIA RTX Pro 6000 Blackwell », 48 Go, coût 1× ; `xlarge` = carte entière, 96 Go, coût **2×** du quota — [HF docs, Spaces ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu) (lue le 14/10/2026).
- Quotas quotidiens : anonyme 2 min (priorité basse), compte gratuit 5 min (moyenne), PRO 40 min (« extensible »), Team 40 min, Enterprise 60 min ; remise à zéro « exactly 24 hours after your first GPU usage » ; le quota restant influe sur la priorité de file — [HF docs ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu).
- Au-delà du quota : seulement PRO/Team/Enterprise, crédits prépayés à « $1 per 10 minutes » — [HF docs ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu).
- Hébergement : un compte gratuit « in good standing (verified email, account older than 30 days) » peut héberger **2 Spaces ZeroGPU** ; PRO 10 ; organisations Team/Enterprise 50. ZeroGPU = SDK Gradio uniquement ; durée GPU par défaut 60 s par appel (paramétrable, ex. `duration=120`) ; `torch.compile` non pris en charge, compilation AoT oui (torch ≥ 2.8) — [HF docs ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu).
- Appel par API : « Every Gradio Space on Hugging Face is automatically available as an API endpoint » (`gradio_client`, client JS, REST `/gradio_api/call/...`) ; « When you authenticate with your token, your account's GPU quota is consumed. Unauthenticated requests use a shared pool with stricter limits » ; d'un Space à un autre, transmettre l'en-tête `x-ip-token` de l'utilisateur — [HF docs, Spaces as API endpoints](https://huggingface.co/docs/hub/spaces-api-endpoints).
- Contradiction (communauté) : des utilisateurs PRO rapportent que des appels `gradio_client` avec jeton ont consommé le quota anonyme (« You have exceeded your GPU quota ») — [forum HF, Use authentication in Gradio API (ZeroGPU)](https://discuss.huggingface.co/t/use-authentication-in-huggingface-gradio-api-hosting-on-zerogpu/115565) ; [discussion zero-gpu-explorers #129](https://huggingface.co/spaces/zero-gpu-explorers/README/discussions/129) (anciens fils, statut actuel inconnu).
- Inference Providers : crédits mensuels **« Free Users : None »**, PRO 2,00 $, Team/Enterprise 2,00 $ par siège ; les gratuits doivent acheter des crédits — [HF docs, Inference Providers Pricing](https://huggingface.co/docs/inference-providers/pricing).
- Spaces observés via l'API Hub le 14/10/2026 (likes / état / matériel) :
  - `zerogpu-aoti/wan2-2-fp8da-aoti-faster` : 3 740 likes, RUNNING, ZeroGPU ; Wan 2.2 I2V-A14B (Diffusers, FP8, AoT), 16 i/s, 8 à 80 images (≤ 5 s), 4 pas par défaut ; réservation GPU = `10 + steps × 15 × (frames×W×H / (81×832×624))^1.5` s — [app.py](https://huggingface.co/spaces/zerogpu-aoti/wan2-2-fp8da-aoti-faster/blob/main/app.py).
  - `r3gm/wan2-2-fp8da-aoti-preview` (3 228 likes, RUNNING), `r3gm/wan2-2-fp8da-aoti-preview2` (2 179), `multimodalart/wan-2-2-first-last-frame` (673) — [API Spaces HF](https://huggingface.co/api/spaces?search=wan2-2&sort=likes&direction=-1).
  - `alexnasa/Wan2.2-Animate-ZEROGPU` : 354 likes, RUNNING, modifié le 24/08/2026 ; durées 1–20 s ; réservation 150 s pour 5 s en « Low Res », ×2 en « Medium Res » ; décorateurs `size='large'` et `size='xlarge'` — [app.py](https://huggingface.co/spaces/alexnasa/Wan2.2-Animate-ZEROGPU/blob/main/app.py).
  - `Wan-AI/Wan2.2-S2V` : 430 likes, matériel `cpu-basic` (pas de GPU actif) ; `Wan-AI/Wan-2.2-5B` et `Wan-AI/Wan2.2-Animate` : l'API Hub a répondu « Invalid username or password » (Space privé ou restreint) — observé via [API Spaces HF](https://huggingface.co/api/spaces/Wan-AI/Wan2.2-S2V).
  - `Lightricks/ltx-video-distilled` : 1 605 likes, RUNNING, `xlarge`, 0,3 à 8,5 s — [app.py](https://huggingface.co/spaces/Lightricks/ltx-video-distilled/blob/main/app.py).
  - `Lightricks/LTX-2.5` (modifié le 11/10/2026) : `@spaces.GPU(size="xlarge")`, réservation 60 à 400 s ; le code explique que « ZeroGPU checks the *requested* duration against the visitor's remaining quota (not the actual runtime) » et mesure « 768x512x49 … 24.7s end to end on a COLD worker » — [app.py](https://huggingface.co/spaces/Lightricks/LTX-2.5/blob/main/app.py).
  - VACE : `linoyts/wan2-1-VACE-fast` (95 likes ; 512×896 par défaut, 8–81 images à 16 i/s, réservation 60–120 s) — [app.py](https://huggingface.co/spaces/linoyts/wan2-1-VACE-fast/blob/main/app.py) ; `fffiloni/Wan2.1-VACE-1.3B` (72 likes). Aucun Space « Wan 2.2 VACE » trouvé ; le Space communautaire techfreakworm/wan-studio indique « VACE … (Wan 2.1 only) » — [résultat de recherche](https://techfreakworm-wan-studio.hf.space/sitemap.xml).
- L'API Hub étiquette encore ces Spaces `zero-a10g` (identifiant historique), alors que la doc annonce des RTX Pro 6000 Blackwell — observé via [API Spaces HF](https://huggingface.co/api/spaces/zerogpu-aoti/wan2-2-fp8da-aoti-faster) et [doc ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu).

### Inferences
- Calcul avec la formule du Space Wan 2.2 I2V FP8 (832×624, 80 images, 4 pas) : réservation ≈ **69 s par clip de 5 s**. Compte gratuit (300 s/jour) → **4 clips/jour** ; anonyme (120 s) → 1 clip/jour. Un film de 13 clips ≈ **3 à 4 jours** avec un seul compte gratuit. Wan 2.2 Animate (150 s réservées pour 5 s) → 2 clips/jour. LTX-2.5 en `xlarge` → ≥ 120 s de quota par appel → ≤ 2 appels/jour.
- Multiplier les comptes pour contourner le quota : non recommandé (interdit explicitement chez Colab ; pour HF, aucune clause lue ici → à vérifier avant tout usage).
- Dupliquer un Space ZeroGPU sur son propre compte gratuit (≥ 30 jours, e-mail vérifié) permet de figer la version et d'ajouter nos contrôles (VACE, première/dernière image) sans dépendre de la disponibilité d'un tiers, mais **ne donne pas plus de quota** : le quota suit l'utilisateur qui appelle.
- Licence : appeler un Space LTX n'exécute rien « chez nous », mais les sorties restent soumises à la licence LTX (non MIT/Apache) ; les Spaces Wan 2.2 utilisent des poids Apache-2.0.

### Gaps
- Comportement actuel (octobre 2026) de `gradio_client` + jeton gratuit : non testé par nous (aucun jeton utilisé, conformément aux consignes) ; les rapports contraires datent de 2024–2025.
- CGU HF sur l'automatisation intensive d'appels à des Spaces tiers : non lues.

## 4. Autres plateformes (Lightning, Modal, Studio Lab, Paperspace, Saturn, Intel, AMD, GCP/Azure/AWS, NVIDIA, Cloudflare, Together/fal/Replicate)

### Takeaway
Seul **Modal** offre un crédit mensuel récurrent clair et pilotable par code (30 $/mois). Les essais GCP/Azure n'ouvrent
pas de GPU ; Studio Lab est fermé aux nouveaux ; AMD donne 100 $ une fois (30 jours) ; Lightning, Saturn, Paperspace,
Intel ont des offres GPU gratuites floues ou trop faibles pour Wan.

### Cited Findings
- **Modal** : plan Starter « $30 / month free credits » ; prix à la seconde : T4 0,000164 $, L4 0,000222 $, A10 0,000306 $, L40S 0,000542 $, A100 40 Go 0,000583 $, A100 80 Go 0,000694 $, H100 0,001097 $, H200 0,001261 $, B200 0,001736 $ ; Starter : 100 conteneurs, 10 GPU simultanés ; jusqu'à 10 k$ pour chercheurs/académiques sur candidature — [Modal Pricing](https://modal.com/pricing) (lu le 14/10/2026 ; exigence de carte bancaire non indiquée sur la page).
- **Lightning AI** : « Users get 1 free 4-CPU Studio » ; crédits gratuits « promotional, non-transferable, and do not accumulate », modifiables à tout moment ; 1 crédit = 1 $ ; Pro = 40 crédits/mois ; montant mensuel gratuit non indiqué — [Lightning docs, billing FAQ](https://lightning.ai/docs/platform/overview/faq/billing.md). Tiers : « 15 monthly credits », Studio redémarré toutes les 4 h — [usagepricing.com](https://usagepricing.com/blueprint/lightning-ai) ; le montant n'a pas pu être confirmé — [GPUperHour](https://gpuperhour.com/blog/free-cloud-gpus-and-credits).
- **SageMaker Studio Lab** : « no longer open to new customers. Existing customers can continue to use the service » ; limites Studio Lab 12 Go RAM, 15 Go stockage — [AWS docs, Studio Lab availability change](https://docs.aws.amazon.com/sagemaker/latest/dg/studio-lab-availability-change.html). Existants : sessions GPU ≤ 4 h et 4 h / 24 h — [GPUperHour](https://gpuperhour.com/blog/free-cloud-gpus-and-credits).
- **Paperspace Gradient** : « Notebooks include a free GPU plan » ; « When using free-tier machines, the maximum auto-shutdown timeout is 6 hours » (page vérifiée le 13/07/2026) — [DigitalOcean docs, Paperspace Notebooks features](https://docs.digitalocean.com/products/paperspace/notebooks/details/features/). Machine gratuite M4000, 5 Go de stockage, disponibilité non testée — [GPUperHour](https://gpuperhour.com/blog/free-cloud-gpus-and-credits).
- **Saturn Cloud** : « 150 hours a month of compute for free, with up to 64GB of RAM, a GPU … no credit card » (résumé de recherche de la page officielle ; type de GPU non précisé) — [Saturn Cloud, Try](https://saturncloud.io/try) ; [blog 150 free hours](https://saturncloud.io/blog/150-free-hours/).
- **Intel Tiber AI Cloud** : aucun volume GPU gratuit publié trouvé ; palier « Standard » gratuit décrit en 2024 — [Intel Tiber Developer Cloud: First Look (2024)](https://dineshdivakaran.substack.com/p/intel-tiber-developer-cloud-first) ; [Intel Tiber AI Cloud overview](https://console.cloud.intel.com/docs/about/ai_cloud_overview.html).
- **AMD Developer Cloud** : 100 $ de crédits offerts via l'AMD AI Developer Program (≈ 50 h de MI300X à 1,99 $/h selon des guides tiers), crédits expirant 30 jours après dépôt, moyen de paiement requis selon des guides — [AMD Developer Cloud](https://amd.com/en/developer/resources/cloud-access/amd-developer-cloud.html) ; [lablab.ai guide](https://lablab.ai/ai-articles/from-zero-to-ai-builder-amd-developer-program) ; offre 2025 antérieure : 25 h à utiliser en 10 jours — [AMD blog 2025](https://www.amd.com/en/developer/resources/technical-articles/2025/how-to-get-started-on-the-amd-developer-cloud-.html).
- **Google Cloud** : 300 $ sur 90 jours, mais pendant l'essai on ne peut pas « Add GPUs to your VM instances » ; GPU seulement après passage en compte payant ; carte ou moyen de paiement exigé — [Google Cloud Free Program](https://docs.cloud.google.com/free/docs/free-cloud-features).
- **Azure** : compte gratuit limité en cœurs ; quota initial de la série N (GPU) à 0, augmentation sur ticket (sources de forum 2017–2022, anciennes) — [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/749877/gpu-based-virtual-machine-on-free-trial-subscripti) ; [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/693791/why-am-i-unable-to-deploy-not-even-a-single-gpu-in). 200 $ sur 30 jours — [GPUperHour](https://gpuperhour.com/blog/free-cloud-gpus-and-credits).
- **AWS** : nouveau plan gratuit jusqu'à 200 $ (100 $ à l'inscription + 100 $ via activités), expire après 6 mois ; certains services réservés au plan payant — [AWS News Blog](https://aws.amazon.com/blogs/aws/aws-free-tier-update-new-customers-can-get-started-and-explore-aws-with-up-to-200-in-credits) ; [Neowin](https://www.neowin.net/news/aws-free-tier-overhauled-new-users-get-200-in-credits-but-theres-a-catch/).
- **NVIDIA build.nvidia.com** : essai NIM plafonné à 5 000 crédits, 1 000 à l'inscription (post de forum non daté) ; aucun modèle vidéo confirmé dans le catalogue gratuit — [NVIDIA Developer Forums](https://forums.developer.nvidia.com/t/api-credits-for-build-nvidia-com/306633).
- **Cloudflare Workers AI** : le catalogue liste `hh1-t2v` et `hh1-i2v` (Alibaba HappyHorse 1.0, 3–15 s) marqués « Proxied » — [Cloudflare llms-full.txt](https://developers.cloudflare.com/ai/llms-full.txt) (prix et quota gratuit non lus).
- **fal / Replicate / Together** : fal ≈ 1 $ offert sans carte (source tierce) ; Replicate : facturation exigée après un temps ; Together : crédits non chiffrés — [costbench, fal](https://costbench.com/software/ai-ml-platforms/fal) ; [GPUperHour](https://gpuperhour.com/blog/free-cloud-gpus-and-credits) ; [cometapi](https://www.cometapi.com/best-fal-ai-alternatives/). Aucun montant officiel lu.

### Inferences
- Modal 30 $/mois ≈ 37 h de L4 (0,80 $/h), 12 h d'A100 80 Go (2,50 $/h) ou 7,6 h de H100 (3,95 $/h). Avec le seul chiffre officiel disponible (TI2V-5B : < 9 min par clip 5 s 720p sur GPU grand public), 13 clips ≈ 2 h GPU par film sur une carte de classe 4090 → de l'ordre de **quelques films/mois** sur A100/H100, davantage avec les modèles distillés 4 pas — à mesurer, aucune vitesse Modal publiée pour Wan.
- Modal est le seul « gratuit récurrent » conçu pour être appelé par code (fonctions Python) depuis notre conteneur ; Kaggle l'est aussi mais en lots (notebooks).
- AMD : MI300X (192 Go) mais ROCm ; compatibilité Wan via diffusers/ROCm non vérifiée ; crédit unique de 30 jours → banc d'essai, pas une solution de fond.
- GCP/Azure/AWS : inutilisables pour le GPU sans passer en payant (GCP explicite, Azure quota 0, AWS non clarifié).

### Gaps
- Montant exact des crédits gratuits Lightning et GPU accessibles avec ; type de GPU Saturn Cloud gratuit ; disponibilité réelle de la M4000 Paperspace.
- Liste officielle des services interdits sur le plan gratuit AWS (instances G/P ?).
- Prix et éventuelle gratuité de HappyHorse sur Workers AI ; présence d'un modèle vidéo sur build.nvidia.com.

## 5. PC local de l'utilisateur (Windows, Blender installé, GPU inconnu) : matériel minimum et vitesses

### Takeaway
Avec une NVIDIA de **8 Go** (RTX 4060) on peut déjà faire tourner Wan 2.1 1.3B / VACE-1.3B (480p) et Wan via LightX2V ;
**24 Go** (RTX 4090) font tourner Wan 2.2 TI2V-5B en 720p (< 9 min / 5 s). Les outils les plus « basse VRAM » (WanGP,
6 Go) et LTX ne sont **pas** sous MIT/Apache/BSD → hors règle de la maison ; LightX2V (Apache-2.0) l'est.

### Cited Findings
- Wan 2.1 T2V-1.3B : « requires only 8.19 GB VRAM » ; « 5-second 480P video on an RTX 4090 in about 4 minutes (without optimization techniques like quantization) » ; 1.3B/VACE-1.3B recommandés en 480p — [Wan2.1 README](https://github.com/Wan-Video/Wan2.1).
- Wan 2.2 TI2V-5B : « can run on a GPU with at least 24GB VRAM (e.g, RTX 4090 GPU) » avec `--offload_model True --convert_model_dtype --t5_cpu` ; 5 s 720p « under 9 minutes on a single consumer-grade GPU » ; T2V/I2V-A14B et S2V-14B : « at least 80GB VRAM » en mono-GPU ; licence « Apache 2.0 » ; Animate-14B intégré à Diffusers le 13/11/2025 — [Wan2.2 README](https://github.com/Wan-Video/Wan2.2).
- LightX2V : licence Apache-2.0 ; « can run on RTX 5090 and RTX 4060 (8GB VRAM) » (cité par Wan) ; modèles Wan2.2-I2V-A14B 4 pas 720p (20/04/2026) ; variante Wan 2.2 14B NVFP4 + attention creuse pour Blackwell, « over 50× speedup » sur une RTX 5090 (29/05/2026) — [LightX2V README](https://github.com/ModelTC/LightX2V) ; [Wan2.1 README](https://github.com/Wan-Video/Wan2.1).
- DiffSynth-Studio propose FP8 et un offload couche par couche pour Wan — [Wan2.2 README](https://github.com/Wan-Video/Wan2.2) (licence DiffSynth non vérifiée ici).
- WanGP (v18.00 du 11/10/2026) : « as little as 6 GB of VRAM » pour certains modèles ; NVIDIA GTX 10XX/RTX 20XX et plus récentes, AMD « RDNA 4, 3, 3.5, and 2 » ; mode headless/CLI (`python wgp.py --process my_queue.zip`) et API ; « 20 seconds of 480p (24fps) video takes about 28s » sur RTX 5090 (Profile 4 ; modèle concerné non précisé dans l'extrait) — [WanGP README](https://github.com/deepbeepmeep/Wan2GP). Licence : **« WanGP Community License 2.0 »** (usage gratuit, interdiction de revendre/héberger en SaaS payant) — [LICENSE.txt](https://github.com/deepbeepmeep/Wan2GP/blob/main/LICENSE.txt).
- LTX : LTX-2.5 22B distillé, options `--quantization fp8-cast --offload {cpu, disk}` ; licences « LTX-2 Community License » (05/01/2026) et « LTX-2.x Community License » (11/08/2026) — [LTX-2 README](https://github.com/Lightricks/LTX-2) ; [LICENSE](https://github.com/Lightricks/LTX-2/blob/main/LICENSE). LTX-Video 0.9.5+ : licence OpenRAIL-M ; communauté LTX-VideoQ8 : 720×480×121 « under a minute » sur RTX 4060 8 Go (non officiel) — [LTX-Video README](https://github.com/Lightricks/LTX-Video).

### Inferences
- Seuils pratiques (déduits des sources) : **8 Go NVIDIA** → Wan 2.1 1.3B / VACE-1.3B en 480p (contrôle par pose/profondeur depuis Blender) ; **12–16 Go** → TI2V-5B avec offload/quantif, plus lent ; **24 Go** → TI2V-5B 720p officiel ; Wan 14B (Animate, I2V-A14B) → 80 Go en natif, ou 8–24 Go via LightX2V/quantif + offload.
- Au rythme officiel (≈ 4 min par clip 480p de 1.3B sur 4090 ; < 9 min par clip 720p de 5B), un film de 13 clips ≈ 1 h à 2 h sur une 4090 non optimisée — nettement moins avec les variantes distillées 4 pas (gain non chiffré pour notre cas).
- Le pont local existant (« app → Blender local ») pourrait recevoir une file de clips et appeler un script diffusers/LightX2V (Apache-2.0) : gratuit, illimité, sans CGU tierces.
- AMD Windows : seul WanGP annonce RDNA 2–4 (licence hors règle) ; pour une pile Apache sur AMD, ROCm/DirectML non vérifié.

### Gaps
- GPU réel de l'utilisateur inconnu (à faire lire : `nvidia-smi` ou Gestionnaire des tâches → GPU → « Mémoire GPU dédiée »).
- Aucune source lue sur Apple Silicon (MPS/MLX) pour Wan 2.2 5B ou VACE ; aucune mesure publiée sur RTX 3060 12 Go pour TI2V-5B.
- Licences DiffSynth-Studio et ComfyUI non vérifiées dans cette session (ComfyUI est réputé GPL-3.0, donc hors règle MIT/Apache/BSD — à confirmer).

## 6. Classement pour « 64 s de vidéo contrôlée 480p–720p par film, plusieurs films par semaine »

### Takeaway
1) PC de l'utilisateur s'il a une NVIDIA ≥ 8–12 Go (pile Apache : diffusers/LightX2V) ; 2) **Kaggle** (≈ 30 h/semaine,
API officielle) — la seule option cloud gratuite qui tienne plusieurs films/semaine ; 3) Modal (30 $/mois, GPU rapides,
appel par code) ; 4) ZeroGPU gratuit en appoint (≈ 4 clips/jour) ; le reste est marginal ou fermé.

### Cited Findings
- Kaggle : ≈ 30 h GPU/semaine, T4×2, CLI `kernels push/status/output` — [Kaggle Efficient GPU Usage](https://www.kaggle.com/docs/efficient-gpu-usage) ; [kernels.md](https://github.com/Kaggle/kaggle-api/blob/main/docs/kernels.md) ; ~9–15 min/clip T4 (communauté) — [WanGP-Kaggle](https://github.com/kayas881/WanGP-Kaggle).
- Modal : 30 $/mois, L4 0,000222 $/s, H100 0,001097 $/s — [Modal Pricing](https://modal.com/pricing).
- ZeroGPU : 5 min/jour gratuit, 2 min anonyme — [HF docs ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu) ; réservation ≈ `10 + 4 × 15 × facteur^1.5` s par clip Wan 2.2 — [app.py zerogpu-aoti](https://huggingface.co/spaces/zerogpu-aoti/wan2-2-fp8da-aoti-faster/blob/main/app.py).
- Colab gratuit : GPU non garantis, interface web restreinte — [FAQ Colab](https://research.google.com/colaboratory/faq.html) ; GCP essai sans GPU — [Google Cloud Free Program](https://docs.cloud.google.com/free/docs/free-cloud-features) ; Studio Lab fermé aux nouveaux — [AWS docs](https://docs.aws.amazon.com/sagemaker/latest/dg/studio-lab-availability-change.html).

### Inferences
| Rang | Option | Débit estimé (inférence) | Automatisable | Points bloquants |
|---|---|---|---|---|
| 1 | PC local NVIDIA ≥ 8 Go (≥ 24 Go pour 720p 5B) | ≈ 1–2 h/film sur 4090 non optimisée ; illimité | oui (pont local) | GPU inconnu ; pile Apache à monter (diffusers/LightX2V) |
| 2 | Kaggle T4×2 | ≈ 9–15 films/semaine au plus (2–3 h/film) | oui, CLI officielle | téléphone vérifié ; T4 lent ; quota non garanti |
| 3 | Modal Starter | quelques films/mois (30 $ ≈ 37 h L4 / 7,6 h H100) | oui, SDK Python | carte bancaire ? (non indiqué) ; vitesse Wan non publiée |
| 4 | HF ZeroGPU gratuit | ≈ 4 clips/jour → 1 film tous les 3–4 jours | oui, gradio_client (fiabilité du jeton discutée) | dépend des Spaces tiers ; 5 min/jour |
| 5 | AMD Dev Cloud | 100 $ une fois, 30 jours | oui (VM) | ROCm ; carte ; ponctuel |
| 6 | Colab gratuit | imprévisible | non (interactif) | web UI restreinte ; GPU non garanti |
| — | GCP / Azure / AWS essais, Studio Lab, Paperspace, Saturn, Lightning, Intel | ≈ 0 pour Wan | — | pas de GPU en essai, fermé, ou GPU trop faible / non précisé |

- Combinaison réaliste et gratuite : rendu Blender (conteneur) → images de départ / cartes de pose → **lot Kaggle hebdomadaire** pour les clips génératifs, ZeroGPU pour les retouches urgentes (≤ 4 clips/jour), PC local dès que le GPU est connu.
- « Un film d'une minute en minutes » n'est pas atteignable sur T4 ; il l'est seulement sur GPU récent avec modèles distillés 4 pas (aucun chiffre publié pour notre format → à mesurer).

### Gaps
- Aucune mesure maison : il faut chronométrer 1 clip 5 s 480p (Wan 2.1 VACE-1.3B) et 720p (Wan 2.2 TI2V-5B) sur Kaggle T4 et, si possible, sur le PC de l'utilisateur, avant de figer le classement.
- Qualité de contrôle (fidélité à l'animation Blender) selon le modèle : hors du périmètre de cette note.
