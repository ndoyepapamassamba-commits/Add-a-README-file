# Sources GRATUITES (coût zéro) pour générer vidéo, images, voix et lip-sync d'une troupe de 54 personnages cartoon — inventaire daté au 16/10/2026

Périmètre : services hébergés gratuits (applis grand public, API à palier gratuit, démos Hugging Face), modèles
ouverts de voix/lip-sync et outils de montage gratuits. **Hors périmètre** : paliers GPU gratuits type Kaggle/Colab
(couverts ailleurs). Utilisateur au **Sénégal** (UTC+0), sketches TikTok 9:16 de 25–60 s, dialogues en français.
Règles respectées : aucun appel payant, aucun compte créé.

Conventions : « lu le 16/10/2026 » = page officielle ou API publique consultée aujourd'hui ; « observé » = interrogé
par nous via une API publique gratuite (GET sans clé) ; « (tiers) » = blog/comparateur non officiel. Les quotas
grand public changent souvent : **chaque chiffre est daté**. Les calculs de clips/semaine sont des **inférences**.

---

## 1. Crédits gratuits des applis vidéo grand public (Google, Meta, Grok, Kling, Hailuo, Vidu, PixVerse, Pika, Luma, Dreamina, Qwen, Bing, Sora, TikTok…)

### Takeaway
Au 16/10/2026, la seule source vidéo **gratuite, récurrente, officiellement chiffrée et disponible au Sénégal** de
qualité « Veo » est **Google Flow : 50 crédits/jour pour les non-abonnés** (≈ 5 clips Veo 3.1 Lite ou 2 clips Veo 3.1
Fast de ≤ 8 s par jour, pas de génération vidéo garantie aux heures de pointe 14 h–17 h UTC). Viennent ensuite
**Dreamina (CapCut/ByteDance, Seedance 2.0) : 120 crédits/jour** (page officielle du 10/09/2026, filigrane sur le
gratuit selon des tiers) et **Kling : ~66 crédits/jour** (tiers, filigrane, pas d'usage commercial). Tout le reste est
soit marginal (Pika 80 crédits/mois, Vidu, PixVerse), soit ponctuel (Hailuo, Runway), soit supprimé/instable (Luma
supprimé début 2026, Sora fermé en 2026, Grok Imagine gratuit intermittent, vidéo absente du Gemini gratuit).

### Cited Findings

**Google — appli Gemini (non-abonné)**
- Page officielle des limites Gemini (lue le 16/10/2026) : le palier sans abonnement a des « standard limits » ; AI Plus = 2×, AI Pro = 4×, AI Ultra = 5× ou 20× AI Pro ; les limites « se rechargent toutes les 5 heures jusqu'à atteindre la limite hebdomadaire » ; aucune valeur numérique publiée ; contexte 32k tokens en gratuit ; « les limites peuvent changer sans préavis » — [Google Gemini Help](https://support.google.com/gemini/answer/16275805)
- Même page : la génération d'images **Nano Banana 2** est cochée pour les 4 offres (gratuit inclus) ; « Redo images (Nano Banana Pro) » et la **génération vidéo** ne sont cochées que pour Plus/Pro/Ultra (lecture des icônes du tableau ; la vidéo « consomme généralement le plus d'usage ») — [Google Gemini Help](https://support.google.com/gemini/answer/16275805)
- Des guides 2026 confirment que la vidéo Veo n'est **pas incluse** dans le Gemini gratuit (l'offre promo d'août 2025 de 3 clips de 8 s est terminée) — [Fello AI](https://felloai.com/is-gemini-free/) ; [Sammy Fans (promo août 2025)](https://www.sammyfans.com/2025/08/23/gemini-app-now-offers-free-access-to-veo-3-video-generation/)
- Images Nano Banana 2 dans l'appli gratuite : ~20 images/jour en 1K selon un instantané du tableau de quotas Google du 30/03/2026 (50 Plus, 100 Pro, 1 000 Ultra) — (tiers) [laozhang.ai](https://blog.laozhang.ai/en/posts/nano-banana-2-free-unlimited) ; [ai.zenken](https://ai.zenken.co.jp/en/post/gemini-image-guide/). Nano Banana Pro en gratuit : « 2/jour avec filigrane visible » selon un guide, « non disponible » selon un autre (conflit) — [laozhang.ai](https://blog.laozhang.ai/en/posts/is-nano-banana-free) ; [ai.zenken](https://ai.zenken.co.jp/en/post/gemini-free-vs-pro/)

**Google — Flow (labs.google/flow)**
- Page officielle « Flow AI credits » (lue le 16/10/2026) : comptes **sans Google AI plan = 50 crédits Flow par jour**, crédits non reportés ; les non-abonnés **peuvent ne pas pouvoir générer de vidéos aux heures de pointe (~14 h–17 h UTC)** mais peuvent toujours générer des images et utiliser l'agent Flow — [Google Labs Help](https://support.google.com/labs/answer/16526234)
- Coûts (même page) : **Veo 3.1 Lite = 10 crédits** (non-Ultra), **Veo 3.1 Fast = 20 crédits**, **Veo 3.1 Quality = 100 crédits** (8 s) ; « Veo 3.1 Lite (Lower Priority) » à 0 crédit réservé à Ultra — [Google Labs Help](https://support.google.com/labs/answer/16526234)
- Vérification tierce datée du 24/08/2026 : 50 crédits/jour ≈ **cinq clips Veo 3.1 Lite de 8 s par jour** (4, 6 ou 8 s par génération) ; Quality inaccessible avec la dotation gratuite — [AIToolsBakery (MAJ 13/10/2026)](https://aitoolsbakery.com/blog/ai-video-tools-free-tier-2026/)
- **Disponibilité : le Sénégal figure dans la liste officielle des pays où Flow est disponible**, réservé aux **18 ans et plus** (aussi : Côte d'Ivoire, Mali, Burkina Faso, Bénin, Niger, Togo, Cameroun, Gabon, Nigeria, Ghana, Maroc, etc.) — [Google Labs Help « Where you can use Flow »](https://support.google.com/labs/answer/16353544)
- Une page Google « getting started » distincte indiquait encore qu'il faut un abonnement AI Plus/Pro/Ultra (conflit relevé par des tiers ; la page crédits officielle prévaut) — (tiers) [magichour.ai](https://magichour.ai/blog/google-flow) ; [flowaifree.com](https://www.flowaifree.com/google-flow-free-credits/)

**Google — YouTube Shorts / Whisk**
- YouTube a annoncé (Made on YouTube, sept. 2025) **Veo 3 Fast gratuit dans Shorts**, en **480p avec son**, d'abord dans certains pays (US, UK…) — [TechRadar](https://www.techradar.com/computing/artificial-intelligence/youtube-shorts-is-getting-a-huge-free-veo-3-upgrade-that-might-just-make-me-leave-tiktok-and-capcuts-behind) ; [Chrome Unboxed](https://chromeunboxed.com/youtube-is-getting-powerful-new-ai-tools-including-free-veo-3-video-generation-in-shorts/)
- Whisk Animate (Veo 2) était réservé aux abonnés payants en 2025 ; aucune source 2026 sur son statut — [onlinemarketing.de](https://onlinemarketing.de/technologie/google-veo-2-whisk-video-generator-ki-modelle)

**Meta AI / Vibes**
- Vibes est gratuit depuis son lancement ; en février 2026 Meta testait une appli autonome (Mexique, Brésil) et prévoyait un modèle **freemium** avec abonnement pour débloquer plus de créations vidéo par mois — [TechCrunch (05/02/2026)](https://www.techcrunch.com/2026/02/05/meta-tests-a-standalone-app-for-its-ai-generated-vibes-videos)
- Pays listés pour Meta AI/Vibes (article non daté) : Australie, Canada, **Ghana**, Jamaïque, Malawi, Nouvelle-Zélande, **Nigeria**, Pakistan, Singapour, **Afrique du Sud**, Ouganda, États-Unis, Zambie, Zimbabwe — aucun pays francophone d'Afrique — [Gulf News](https://gulfnews.com/business/markets/facebook-instagram-owner-meta-launch-vibes-an-ai-video-feed-1.500284282) ; Europe ajoutée en nov. 2025 — [Meta Newsroom](https://about.fb.com/news/2025/11/bringing-vibes-to-europe-a-new-way-to-create-share-and-play-in-the-meta-ai-app/amp/)

**Grok Imagine (xAI)**
- Chronologie (article du 07/09/2026, MAJ 17/09/2026) : 09/01/2026 images sur X limitées aux payants ; **19/03/2026 génération image+vidéo gratuite coupée** sur grok.com et les applis ; 21/08/2026 retour d'un palier gratuit à **1 vidéo/jour** ; 5–7/09/2026 certains comptes gratuits ramenés à zéro, d'autres non (par cohorte de compte, pas par région ; un second compte n'aide pas) ; images ~2–4/jour pour les comptes concernés ; la grille tarifaire xAI coche l'image en Free mais **exclut la vidéo** — [RoboRhythms](https://www.roborhythms.com/is-grok-imagine-free/)
- La restriction de mars 2026 aux abonnés payants est confirmée dans le contexte du scandale des deepfakes Grok — [Wikipedia](https://en.wikipedia.org/wiki/Grok_sexual_deepfake_scandal)

**Kling AI (Kuaishou)**
- Plusieurs guides 2026 : **66 crédits/jour** pour tout utilisateur connecté, remise à zéro toutes les 24 h, sans report ; **filigrane Kling visible** sur toutes les vidéos gratuites ; pas de droits commerciaux en gratuit ; estimations de 2 à ~6 clips/jour selon modèle et réglages — (tiers) [aireiter](https://aireiter.com/blog/kling-ai-free-tier-2026) ; [crixpix](https://crixpix.com/kling-ai-free/) ; [whichoneisreal](https://whichoneisreal.com/compare/best-free-ai-video/) ; [crepal (filigrane)](https://crepal.ai/blog/aivideo/kling-ai-watermark/)
- Contradiction : vérification du 24/08/2026 — la page tarifs Kling affiche un palier « Basic » à 0 $ **sans publier l'allocation** — [AIToolsBakery](https://aitoolsbakery.com/blog/ai-video-tools-free-tier-2026/)
- Usage commercial : réservé aux plans payants (Standard ≈ 6,60–10 $/mois) ; les contenus générés en gratuit ne deviennent pas commercialisables après passage au payant (selon un tiers) — (tiers) [Atlas Cloud](https://www.atlascloud.ai/blog/guides/kling-ai-pricing) ; [crepal](https://crepal.ai/blog/aivideo/is-kling-ai-free-pricing/)

**Hailuo (MiniMax)**
- Le « 100 crédits gratuits/jour » est une ancienne politique abandonnée : depuis le 18/06/2025, pack de bienvenue **unique** expirant 3 jours après l'octroi ; deux vérifications d'inscription en août 2026 = **200 crédits** (≈ 8 clips 768p de 6 s) ; gratuit = téléchargements filigranés, file d'attente basse ; promos ponctuelles (ex. 3 générations H3 Max gratuites jusqu'au 03/09/2026) — (tiers) [aireiter](https://aireiter.com/blog/hailuo-ai-pricing)
- Une page CostBench 2026 affiche encore « 3–5 générations/jour », jugée incohérente — [CostBench](https://costbench.com/software/ai-video-generators/hailuo-ai/free-plan/)

**Vidu (Shengshu)**
- Page tarifs vérifiée le 22/08/2026 : le plan gratuit donne **10 « references »/mois** (entrées de cohérence, pas des vidéos) et **aucune allocation de crédits** n'est indiquée — [AIToolsBakery](https://aitoolsbakery.com/blog/vidu-pricing/)
- Conflit : en juin 2026, CostBench indiquait 40 crédits/mois, filigrane, mode « off-peak » illimité — [CostBench](https://costbench.com/software/ai-video-generators/vidu/free-plan/)

**PixVerse**
- 90 crédits à l'inscription + **60 crédits/jour** (Atlas Cloud) vs **30 crédits/jour** (CostBench, ToolsForHumans) ; ~25–35 crédits par vidéo ; **540p max, filigrane, pas d'usage commercial** en gratuit ; PixVerse ne publie pas ses conditions gratuites de façon accessible — (tiers) [Atlas Cloud](https://www.atlascloud.ai/id/blog/guides/pixverse-ai-free) ; [CostBench](https://costbench.com/software/ai-video-generators/pixverse/) ; [ToolsForHumans](https://www.toolsforhumans.ai/ai-tools/pixverse-ai)

**Pika**
- Vérifié le 24/08/2026 : **80 crédits/mois** ; image→vidéo 480p 5 s = 12 crédits (≈ 6 clips/mois) ; 480p uniquement ; « pas de filigrane » et « usage commercial permis » selon cette source — [AIToolsBakery](https://aitoolsbakery.com/blog/ai-video-tools-free-tier-2026/)
- Contradiction : d'autres sources indiquent filigrane et **pas d'usage commercial** sur le plan gratuit — [CostBench](https://costbench.com/software/ai-video-generators/pika/free-plan/) ; [eesel.ai](https://eesel.ai/blog/pika-ai-pricing)

**Luma Dream Machine / Runway / HeyGen**
- **Luma : plus aucun plan gratuit** — retiré entre le 30/01 et le 08/03/2026 (le 30/01 il offrait 8 vidéos « draft ») — [AIToolsBakery](https://aitoolsbakery.com/blog/ai-video-tools-free-tier-2026/)
- Runway : 125 crédits **uniques** (« Free forever »), ≈ 10 s de Gen-4.5 une seule fois — [AIToolsBakery](https://aitoolsbakery.com/blog/ai-video-tools-free-tier-2026/)
- HeyGen (avatars parlants) : 3 vidéos/mois ≤ 1 min, 720p, filigranées (Avatar IV inclus) — [AIToolsBakery](https://aitoolsbakery.com/blog/ai-video-tools-free-tier-2026/)

**Dreamina / CapCut (ByteDance, Seedance 2.0)**
- FAQ officielle Dreamina (publiée le 10/09/2026) : **les utilisateurs gratuits reçoivent 120 crédits par jour**, utilisables image et vidéo, « budget créatif quotidien plutôt qu'un nombre garanti de vidéos » ; le coût dépend du modèle, de la durée, de la résolution et du mode — [Dreamina FAQ](https://dreamina.capcut.com/ai-video/free-image-to-video-generator-credits-faq)
- Page officielle Seedance 2.0 : on peut « essayer Dreamina Seedance 2.0 avec les crédits quotidiens gratuits » — [Dreamina Seedance 2.0](https://dreamina.capcut.com/tools/seedance-2-0)
- Tiers : sorties gratuites **filigranées**, visages de personnes réelles bloqués sur 2.0, filigrane invisible ; montants variables selon région/promo, ~2–3 vidéos/jour — [reapi.ai](https://reapi.ai/blog/how-to-use-seedance-2-0-for-free) ; [gamsgo](https://www.gamsgo.com/blog/how-to-use-seedance)
- Un comparateur US n'a pas pu vérifier CapCut (réponses HTTP 451, blocage légal) au 24/08/2026 — [AIToolsBakery](https://aitoolsbakery.com/blog/ai-video-tools-free-tier-2026/)

**Qwen Chat (chat.qwen.ai, vidéo Wan) / Tongyi Wanxiang / wan.video**
- Alibaba ne publie **aucun plafond** pour la vidéo gratuite dans Qwen Chat ; clips ≈ 5 s ; un testeur sans limite dure mais ralentissement après 6–7 générations par session — (tiers, oct. 2026) [AI Miracle](https://www.aimiracle.ai/ai-tool-review/qwen-ai-review) ; un utilisateur bloqué après 4 vidéos, un autre ~5–6 min par vidéo (2025) — [DEV Community](https://dev.to/fm/just-got-free-access-to-qwen-ai-video-generation-awesome-36of) ; [Medium](https://medium.com/data-science-in-your-pocket/free-unlimited-ai-video-generation-using-qwen-chat-486c430a5612)
- Sites officiels Wan : plans Pro 5 $/mois (300 crédits) et Premium 20 $/mois (1 200 crédits) ; aucun bonus quotidien gratuit confirmé — (tiers) [imagine.art](https://www.imagine.art/blogs/wan-ai-pricing-guide)

**Higgsfield / Krea**
- Higgsfield : **0 crédit gratuit**, pas de vidéo en gratuit ; Starter ≈ 19 $/mois — [Creatify](https://creatify.ai/blog/higgsfield-pricing-(2026)-plans-and-what-you-ll-actually-pay) ; [Krea blog](https://www.krea.ai/blog/what-is-higgsfield-ai-pricing-free-plan-and-alternatives-in-2026)
- Krea : 100 compute units/jour, images Krea 2 seulement, **pas de vidéo**, **pas d'usage commercial** (blog de Krea, sept. 2026) — [Krea blog](https://www.krea.ai/blog/what-is-higgsfield-ai-pricing-free-plan-and-alternatives-in-2026)

**Microsoft Bing Video Creator / OpenAI Sora**
- Lancement juin 2025 : 10 générations « Fast » gratuites puis mode « Standard » gratuit (lent) ou 100 points Microsoft Rewards par Fast ; clips de 5 s en 9:16 ; 3 en file — [PetaPixel](https://petapixel.com/2025/06/06/you-can-now-use-openais-video-generator-sora-on-microsoft-bing)
- Passage à **Sora 2** (≈ mars 2026) avec audio, **filigrane visible** et métadonnées C2PA ; limites gratuites post-mise à jour non confirmées — [Windows Report](https://windowsreport.com/microsoft-upgrades-bing-video-creator-with-openais-sora-2-ai-video-model/)
- **OpenAI a annoncé le 24/03/2026 l'arrêt de Sora (appli et API)** — [Engadget](https://engadget.com/ai/openai-is-shutting-down-its-sora-video-generation-app-211023358.html) ; dates non officielles : appli éteinte le 26/04/2026, API jusqu'au 24/09/2026 — [pasqualepillitteri.it](https://pasqualepillitteri.it/en/news/4453/what-happened-to-sora-openai-shutdown). Avant cela le gratuit était passé à 6 générations/jour (nov. 2025) — [TechRadar](https://www.techradar.com/ai-platforms-assistants/gemini/openai-and-google-quietly-limit-free-sora-nano-banana-pro-and-gemini-3-pro-use-heres-what-it-means-for-you)

**TikTok (AI Alive, Symphony)**
- **AI Alive** (13/05/2025) : photo→vidéo animée, **limité aux Stories** (Story Camera) ; sorties étiquetées « AI-generated » + métadonnées C2PA ; modération du prompt et de la photo — [FOX 5 NY](https://www.fox5ny.com/news/tiktok-ai-alive-photo-animation-launch) ; [CDO Magazine](https://www.cdomagazine.tech/aiml/tiktok-launches-ai-alive-to-turn-photos-into-animated-stories)
- **Symphony Creative Studio** : réservé aux comptes **TikTok for Business** connectés ; sorties étiquetées « AI-generated » — [TikTok for Business](https://ads.tiktok.com/business/en-US/blog/tiktok-symphony-ai-creative-suite) ; intègre Seedance 2.0 (MAJ juillet 2026), gratuité non confirmée officiellement — (tiers) [Vidjet](https://www.vidjet.com/blog/latest-features-on-tiktok-symphony-studio-july-2026-update)

### Inferences
- **Volume gratuit réaliste/semaine (si les quotas tiennent)** : Flow ≈ 35 clips Veo 3.1 Lite ≤ 8 s (5/jour × 7) ; Dreamina 120 crédits/jour (nombre de clips Seedance inconnu, sans doute 1–3/jour d'après les tiers) ; Kling ≈ 14–40 clips filigranés ; Qwen Chat quelques clips de 5 s non garantis. Un sketch de 30–60 s ≈ 6–12 plans → **Flow seul couvre ~3–5 sketches/semaine sans reprises** ; avec 2–3 prises par plan, plutôt **1–2 sketches/semaine**. Il faut donc combiner plusieurs comptes de services différents (pas plusieurs comptes du même service — voir §6).
- Le Sénégal est en UTC+0 : la fenêtre de pointe Flow (14 h–17 h UTC) correspond à **14 h–17 h heure de Dakar** ; générer le matin/soir.
- Pour une troupe de 54 personnages récurrents, les applis gratuites (Flow, Dreamina, Kling) imposent des fichiers de référence par image (image→vidéo) ; c'est la seule façon de garder la cohérence sans LoRA.
- Les clips gratuits de Kling, PixVerse, Dreamina (et Pika selon certaines sources) portent un **filigrane visible**, ce qui exclut un rendu « propre » pour TikTok sans recadrage/masquage (et masquer un filigrane peut violer les CGU).
- Meta Vibes, Bing Video Creator (adossé à Sora en voie d'arrêt) et Grok Imagine sont **trop incertains** pour une production régulière depuis le Sénégal.

### Gaps
- Filigrane visible/SynthID sur les vidéos Veo **gratuites** de Flow : non indiqué sur la page crédits officielle.
- Qualité de la parole **en français** et du lip-sync natif de Veo 3.1 Lite/Fast et Seedance 2.0 : non vérifiée dans les sources lues.
- Disponibilité de Meta AI/Vibes, de Grok Imagine gratuit, de Qwen Chat vidéo et de Dreamina **au Sénégal** : aucune source par pays trouvée (Flow est le seul confirmé).
- Coût exact en crédits d'un clip Seedance 2.0 sur Dreamina gratuit, et présence de filigrane confirmée par Dreamina : non publiés officiellement.
- Jimeng (即梦) et Tongyi Wanxiang (通义万相) domestiques chinois : aucune source fiable trouvée sur les quotas gratuits ni sur l'accès hors Chine.
- Statut 2026 de Whisk et de Veo dans YouTube Shorts (pays, limites, filigrane) : aucune source 2026.
- Statut de Bing Video Creator après la fin de l'API Sora (24/09/2026 non officiel) : inconnu.

---

## 2. Inférence hébergée gratuite avec accès API (Hugging Face Spaces/ZeroGPU, Pollinations, OpenRouter, Google AI Studio, Cloudflare, Groq/Cerebras, Replicate/fal)

### Takeaway
Il n'existe **aucune API vidéo gratuite** fiable au 16/10/2026 : OpenRouter liste 30 modèles vidéo, tous payants à la
seconde ; l'API Gemini n'a **pas de palier gratuit pour Veo ni pour les modèles image** (Nano Banana) ; Pollinations
exige désormais une clé et des « Pollen ». La seule voie « API » gratuite vers des modèles vidéo ouverts (Wan 2.2,
LTX-2.3, HunyuanVideo 1.5) est d'appeler des **Spaces Hugging Face ZeroGPU via gradio_client**, plafonnée à
**5 min GPU/jour pour un compte gratuit** (2 min anonyme). En revanche, le **texte (scénarios) est largement gratuit**
(OpenRouter 18 modèles `:free`, Gemini Flash/Gemma gratuits, Groq, Cerebras), et la **TTS est gratuite via l'API
Gemini** (modèles TTS « Free of charge ») et **Cloudflare Workers AI (MeloTTS ~536 min/jour)**.

### Cited Findings

**OpenRouter (observé le 16/10/2026 via `GET /api/v1/models`, gratuit, sans clé)**
- Liste par défaut : 465 modèles dont **18 gratuits** (`:free` ou prix 0), tous en **sortie texte** : `nvidia/nemotron-3.5-super-vl:free` (1M ctx, entrée texte+image+vidéo), `nvidia/nemotron-3-ultra-550b-a55b:free` (1M), `nvidia/nemotron-3.5-lightning:free` (1M), `nvidia/nemotron-3-super-120b-a12b:free` (262k), `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` (entrée audio/image/vidéo), `nvidia/nemotron-3.5-content-safety:free`, `thinkingmachines/inkling:free` et `inkling-small:free` (1M, entrée texte/image/audio), `google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free` (262k), `dots-studio/dots-3-note-preview:free` (512k), `poolside/laguna-s-2.1:free`, `poolside/laguna-xs-2.1:free`, `cohere/north-mini-code:free`, `liquid/lfm-2.5-2.6b:free`, routeur `openrouter/free` ; plus `google/lyria-3-pro-preview` et `lyria-3-clip-preview` affichés à 0 par token mais dont la description indique **0,08 $/chanson et 0,04 $/clip de 30 s** (facturation par requête, donc pas gratuits) — [OpenRouter models API](https://openrouter.ai/api/v1/models)
- Avec `?output_modalities=all` : 676 modèles ; seuls modèles non-texte gratuits = décisions (`inception/mercury-decide:free`, `respan/span-01-lite:free`), embeddings, rerank, et **une voix : `fish-audio/s2.1-pro-free:free`** (« variante sans coût de Fish Audio S2.1 Pro pour tests, prototypage et faible volume », créée le 29/07/2026) — mais son endpoint `/endpoints` renvoyait **une liste vide** le 16/10/2026 (pas de fournisseur actif) — [OpenRouter models API (all)](https://openrouter.ai/api/v1/models?output_modalities=all) ; [endpoints fish-audio](https://openrouter.ai/api/v1/models/fish-audio/s2.1-pro-free-20260729/endpoints)
- **Vidéo** (`GET /api/v1/videos/models`) : 30 modèles, **tous payants à la seconde**, ex. Grok Imagine Video 1.5 Lite 2 ¢/s en 480p, Wan 2.6 t2v 0,04 $/s en 480p, Veo 3.1 Lite 0,05 $/s (720p avec audio), Hailuo 2.3 ≈ 0,08 $/s, Kling v3.0 std 0,084 $/s, Veo 3.1 0,40 $/s avec audio — aucun `:free` (une page « wan-2.6:free » apparaît dans l'index de recherche mais pas dans l'API) — [OpenRouter videos API](https://openrouter.ai/api/v1/videos/models)
- **Images** (`?output_modalities=image`, 61 modèles) : tous payants (FLUX, Seedream, Qwen-Image 3, Nano Banana, GPT-Image…) — [OpenRouter models API (image)](https://openrouter.ai/api/v1/models?output_modalities=image)
- Limites des modèles `:free` : **20 requêtes/min, 50 requêtes/jour** si moins de 10 crédits achetés au total ; **1 000/jour** à partir de 10 crédits achetés ; remise à zéro par jour UTC ; un solde négatif peut provoquer des 402 même sur les modèles gratuits — [OpenRouter docs Limits](https://openrouter.ai/docs/api-reference/limits)

**Google AI Studio / API Gemini**
- Page tarifs (MAJ 15/10/2026) : **gratuits** = Gemini Flash/Flash-Lite texte (3.8 Flash, 3.6 Flash, 3.5 Flash-Lite, 3.1 Flash-Lite, 3 Flash Preview, 2.5 Flash/Flash-Lite), **Gemma 4**, et **TTS** (Gemini 3.8 Flash TTS, 3.8 Flash-Lite TTS, 3.1 Flash TTS Preview, 2.5 Flash Preview TTS) ; **non disponibles en gratuit** = tous les modèles image (Nano Banana 2.1, 3.1 Flash Image, 3.1 Flash Lite Image, 3 Pro Image, 2.5 Flash Image), **tous les Veo** (3.1, Fast, Lite), Lyria, Gemini 2.5 Pro TTS ; Gemini 2.5 Flash Image déprécié, arrêt le 02/10/2026 ; en gratuit, **les contenus soumis servent à améliorer les produits Google** — [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Page limites (MAJ 15/10/2026) : les plafonds RPM/TPM/RPD gratuits ne sont plus publiés sur la page, seulement visibles dans AI Studio — [Gemini API Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) ; un comparatif (MAJ 24/09/2026) donne 5–15 RPM et 20–1 500 requêtes/jour selon le modèle, sans carte bancaire, données utilisées pour l'entraînement hors UE/UK/EEE — [OpenRouter blog](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/)

**Hugging Face Spaces (ZeroGPU) — appel par code via gradio_client**
- Doc officielle ZeroGPU (lue le 16/10/2026) : quota GPU **quotidien** : **non authentifié 2 min, compte gratuit 5 min, PRO 40 min** (extensible par crédits à 1 $/10 min), Team 40 min, Enterprise 60 min ; remise à zéro **24 h après la première utilisation** ; le quota restant influe sur la priorité en file ; matériel = **moitié de NVIDIA RTX Pro 6000 Blackwell (48 Go)** par défaut, `xlarge` (96 Go) consomme 2× le quota ; durée par défaut 60 s par appel — [HF Docs ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu)
- Hébergement : un compte gratuit « en règle » (email vérifié, **compte de plus de 30 jours**) peut héberger **jusqu'à 2 Spaces ZeroGPU** ; ZeroGPU uniquement avec le SDK Gradio — [HF Docs ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu)
- Spaces comme API : avec un token, c'est le quota du compte qui est débité ; sans token, pool partagé plus strict — [HF Docs Spaces API endpoints](https://huggingface.co/docs/hub/spaces-api-endpoints) ; des utilisateurs signalent que via `gradio_client` le quota anonyme s'applique parfois malgré le token (correctif supposé dans Gradio ≥ 5.12, non confirmé) — [HF Forum 115565](https://discuss.huggingface.co/t/use-authentication-in-huggingface-gradio-api-hosting-on-zerogpu/115565) ; [HF Forum 106619](https://discuss.huggingface.co/t/usage-quota-exceeded/106619)
- **Spaces vérifiés « RUNNING » sur ZeroGPU le 16/10/2026** (observé via `https://huggingface.co/api/spaces/<id>/runtime`) : vidéo — `zerogpu-aoti/wan2-2-fp8da-aoti-faster` (3 747 likes), `r3gm/wan2-2-fp8da-aoti-preview2`, `Lightricks/LTX-2-3`, `alexnasa/ltx-2-TURBO`, `multimodalart/Hunyuan-Video-1-5` ; lip-sync/animation — `fffiloni/LatentSync`, `KlingTeam/LivePortrait` ; image/édition — `Qwen/Qwen-Image-Edit-2511`, `prithivMLmods/Qwen-Image-Edit-2511-LoRAs-Fast`, `linoyts/Qwen-Image-Edit-Angles`, `black-forest-labs/FLUX.1-Kontext-Dev` ; voix — `mrfakename/E2-F5-TTS`, `ResembleAI/Chatterbox-Multilingual-TTS` et `-V3`, `hexgrad/Kokoro-TTS`. **En erreur** : `Lightricks/ltx-2-distilled` (RUNTIME_ERROR), `coqui/xtts` (RUNTIME_ERROR), `vinthony/SadTalker` (BUILD_ERROR), `TMElyralab/MuseTalk` (RUNTIME_ERROR) — [HF Spaces API](https://huggingface.co/api/spaces?search=wan&sort=likes&direction=-1&limit=6&full=true)
- **Inference Providers** (fal, Replicate… routés par HF) : **les comptes gratuits n'ont AUCUN crédit mensuel** (achat requis) ; PRO = 2 $/mois — [HF Docs Inference Providers Pricing](https://huggingface.co/docs/inference-providers/pricing)

**Pollinations.ai**
- Doc API v0.3.0 (lue le 16/10/2026) : **une clé est requise** pour toute génération (`sk_` créée sur enter.pollinations.ai) ; la monnaie est le « Pollen » ; le solde distingue « tier » (= **Quest Pollen**, gagné via des quêtes) et « pack » (payé) ; les anciennes clés publiques `pk_` sont limitées à **1 pollen par IP par heure** ; catalogue très large : vidéo (Veo 3.1 Fast, Seedance 2.0/2.5, Wan 2.2-fast/2.6/2.7/3.0, Grok Imagine Video, MiniMax H3…), images (z-image-turbo par défaut, FLUX, Qwen-Image, Nano Banana, Seedream…), audio (ElevenLabs, Kokoro-82M, Qwen3-TTS, Gemini TTS…) — [Pollinations APIDOCS.md](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md)
- Le montant de Pollen gratuit quotidien n'est pas publié dans la doc ; ancienne grille (tiers) : anonyme 1 requête/15 s, palier « Seed » gratuit 5 s + retrait du filigrane, « Flower » payant 3 s — [switchtools (tiers)](https://www.switchtools.io/hi/tool/pollinations) ; la page de limites se rend en JavaScript et n'a pas pu être capturée (18/07/2026) — [vc.ru](https://vc.ru/ai/3037644-pollinations-ai-api-limity-besplatnoj-generacii)

**Cloudflare Workers AI**
- Plan Workers Free : **10 000 neurons/jour**, remise à 00:00 UTC ; flux-1-schnell = 4,80 neurons par tuile 512×512 + 9,60 par step ; lucid-origin 636/tuile ; **melotts = 18,63 neurons par minute audio** (≈ 536 min/jour) ; aura-1 1 363,64 /1k caractères ; aura-2-en/-es 2 727,27 /1k caractères ; **aucun modèle vidéo** — [Cloudflare Workers AI Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

**Groq, Cerebras et autres LLM gratuits (scénarisation)**
- Comparatif (publié 15/06/2026, MAJ 24/09/2026) : **Groq** 30 RPM, 1 000 requêtes/jour ; **Cerebras** 30 RPM, ~1M tokens/jour ; **Mistral** ~1 milliard de tokens/mois (palier « Experiment » = opt-in entraînement) ; **GitHub Models** 15 RPM, 150–1 000/jour ; **NVIDIA NIM** ~1 000/jour ; Cloudflare ~10k neurons/jour ; aucune carte requise — [OpenRouter blog](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/)
- Autre source Cerebras : 5 RPM, 30 000 TPM, 1M tokens/jour + 5 $ de crédits (conflit sur le RPM) — (tiers) [morphllm](https://www.morphllm.com/cerebras-pricing)

**Replicate / fal**
- Les deux sont accessibles via HF Inference Providers mais **sans crédit gratuit pour les comptes HF gratuits** — [HF Docs](https://huggingface.co/docs/inference-providers/pricing). Aucune offre d'essai gratuite actuelle de fal ou Replicate n'a été trouvée (seul un blog 2025 évoque 50 images/mois chez Replicate, non vérifié) — [laozhang.ai (2025)](https://blog.laozhang.ai/ai-tools/flux-api-free/)

### Inferences
- **5 min/jour de ZeroGPU** (compte gratuit) ≈ quelques clips Wan 2.2 « fast/AOTI » courts par jour au mieux ; c'est utile pour tester ou générer 1–3 plans, pas pour produire plusieurs sketches/semaine. Multiplier les comptes HF serait contraire à l'esprit des quotas (voir §6).
- L'utilisateur (compte OpenRouter avec ~0,50 $ de crédit d'après les notes voisines) reste au palier **50 requêtes/jour** pour les `:free` : largement suffisant pour écrire des scripts de sketches (quelques requêtes par sketch).
- Pour la scénarisation en français, Gemini Flash (AI Studio gratuit), Gemma 4 (`:free` sur OpenRouter et gratuit sur l'API Gemini) et Nemotron 3 Ultra sont les candidats gratuits les plus solides ; les données gratuites Gemini servent à l'entraînement (sans gravité pour des scripts comiques, mais à savoir).
- Les modèles vidéo de Pollinations/OpenRouter/fal sont des **reventes payantes** ; même via Pollinations, le gratuit dépend de « Quest Pollen » non chiffré → pas une base de production.

### Gaps
- Montant exact de « Quest Pollen » gratuit de Pollinations et existence d'un palier anonyme résiduel : non publiés.
- RPM/RPD gratuits exacts par modèle Gemini (texte et TTS) : visibles uniquement dans AI Studio (connexion requise, non faite).
- Durée GPU réelle d'un clip sur chaque Space Wan/LTX ZeroGPU (pour convertir 5 min/jour en nombre de clips) : non mesurée.
- `fish-audio/s2.1-pro-free:free` : aucun fournisseur actif le 16/10/2026 ; disponibilité future et support du français inconnus.

---

## 3. Images gratuites pour keyframes et fiches personnages (Nano Banana, Qwen-Image-Edit, FLUX Kontext, Ideogram, Leonardo, Bing/Designer, Krea)

### Takeaway
Pour étendre les fiches des 54 personnages gratuitement : **Gemini app (Nano Banana 2, ~20 images/jour en gratuit,
chiffre tiers)**, **Flow (images autorisées même hors heures de pointe vidéo)**, **Bing Image Creator (15 boosts/semaine
puis file lente sans plafond, chiffre tiers)**, **Leonardo (150 tokens/jour, images publiques)** et surtout les
**Spaces HF Qwen-Image-Edit-2511 (Apache-2.0, en ligne le 16/10/2026)** pour l'édition cohérente (angles, poses).
Attention : **FLUX.1 Kontext dev est sous licence non commerciale** et **Nano Banana n'a pas de palier API gratuit**.

### Cited Findings
- Gemini app gratuit : Nano Banana 2 inclus (officiel, sans chiffre) — [Google Gemini Help](https://support.google.com/gemini/answer/16275805) ; ~20 images/jour, 1K, remise à minuit heure du Pacifique (tiers) — [ai.zenken](https://ai.zenken.co.jp/en/post/gemini-image-guide/) ; [laozhang.ai](https://blog.laozhang.ai/en/posts/nano-banana-2-free-unlimited)
- API Gemini : **pas de palier gratuit** pour aucun modèle image (MAJ 15/10/2026) — [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Flow : les non-abonnés peuvent générer des images même quand la vidéo est indisponible aux heures de pointe — [Google Labs Help](https://support.google.com/labs/answer/16526234)
- Bing Image Creator : 15 « boosts » rapides/semaine, puis file lente de 2–5 min sans plafond, sortie 1024×1024 fixe (juin 2026, tiers) — [Morphed](https://morphed.app/blog/bing-image-creator-limits) ; autre source : 15/jour (conflit) — [Framia](https://framia.converge.ai/blog/bing-ai-image-creator-alternative/) ; Bing Image Creator motorisé par **MAI-Image-2.5** (02/06/2026, tiers) — [InVideo](https://invideo.io/blog/mai-image-ai-generator/) ; Designer : boosts quotidiens variables selon promos (tiers SEO) — [WPS](https://www.wps.com/office-quick-solution/others/why-does-microsoft-designer-limit-ai-image-generation-credits/)
- Leonardo : **150 tokens/jour** remis à zéro quotidiennement (~30–75 images), images gratuites **publiques**, droits commerciaux disputés — (tiers, août 2026) [Nesyona](https://nesyona.com/articles/ai-image-generator-free-tier-limits-2026) ; [Techpresso](https://academy.techpresso.co/reviews/is-leonardo-ai-worth-it)
- Ideogram : ~**10 crédits lents par semaine** (réduit depuis 10/jour début 2025), attentes ≥ 20 min aux heures de pointe — (tiers, juin 2026) [Nesyona](https://nesyona.com/articles/ideogram-vs-leonardo-ai-2026)
- Krea : 100 compute units/jour, images seulement, pas d'usage commercial — [Krea blog](https://www.krea.ai/blog/what-is-higgsfield-ai-pricing-free-plan-and-alternatives-in-2026)
- Modèles ouverts d'édition et licences (HF API, 16/10/2026) : **Qwen-Image-Edit-2509 = Apache-2.0** — [HF](https://huggingface.co/Qwen/Qwen-Image-Edit-2509) ; **FLUX.1-Kontext-dev = « flux-1-dev-non-commercial-license »** — [HF](https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev) ; Spaces Qwen-Image-Edit-2511, Qwen-Image-Edit-Angles et FLUX.1-Kontext-Dev en ligne sur ZeroGPU — [HF Spaces API](https://huggingface.co/api/spaces?search=qwen-image-edit&sort=likes&direction=-1&limit=6&full=true)
- Cloudflare Workers AI flux-1-schnell : 4,80 neurons/tuile + 9,60/step sur 10 000 neurons/jour gratuits — [Cloudflare](https://developers.cloudflare.com/workers-ai/platform/pricing/)

### Inferences
- Avec ~4,80 + 4×9,60 ≈ 43 neurons par image 512×512 à 4 steps, flux-1-schnell gratuit sur Cloudflare permettrait ~230 images/jour (le mode de cumul tuile/step n'est pas explicité par Cloudflare) — utile pour des fonds/décors, pas pour la cohérence de personnages.
- Pipeline gratuit plausible : fiche maîtresse par personnage (Gemini/Flow) → déclinaisons d'angles/expressions via le Space Qwen-Image-Edit (Apache-2.0, sans souci commercial) → keyframes 9:16 → image→vidéo (Flow/Dreamina/Kling ou Wan auto-hébergé).
- Éviter FLUX.1 Kontext dev pour du contenu monétisé (licence non commerciale) ; ses Spaces restent utilisables pour du prototypage.

### Gaps
- Chiffre officiel Google d'images/jour gratuites dans Gemini et existence d'un filigrane visible sur Nano Banana 2 gratuit : non publiés officiellement.
- Conditions commerciales exactes de Leonardo/Ideogram/Bing gratuits : sources tierces contradictoires.
- Disponibilité de Bing Image Creator/Designer au Sénégal : non vérifiée.

---

## 4. TTS française gratuite à voix distinctes, et lip-sync gratuit (hébergé ou local)

### Takeaway
Pour 54 voix françaises distinctes et monétisables, les meilleures options gratuites sont **Chatterbox Multilingual
(MIT, 23 langues dont le français, clonage zéro-shot)** et **Piper (6 voix fr_FR, licence MIT sur le dépôt)**, plus
**Kokoro (Apache-2.0, mais une seule voix française)**. **XTTS-v2 (CPML) et F5-TTS (CC-BY-NC-4.0, y compris les
fine-tunes français) sont non commerciaux**. En hébergé : **API Gemini TTS gratuite**, **Cloudflare MeloTTS
(~536 min/jour)**, **Google Cloud TTS (1–4 M caractères/mois, facturation activée obligatoire)** ; **ElevenLabs
gratuit = 10 min/mois sans licence commerciale** ; **edge-tts est une voie non officielle** (risque de blocage).
Lip-sync : **MuseTalk (MIT)**, **LatentSync (code Apache-2.0 / poids marqués openrail++)**, **InfiniteTalk et
Wan2.2-S2V (Apache-2.0)** ; **Wav2Lip interdit l'usage commercial** ; démo hébergée gratuite en ligne :
`fffiloni/LatentSync` (ZeroGPU).

### Cited Findings

**Modèles TTS ouverts (licences observées via l'API HF le 16/10/2026)**
- **Kokoro-82M : Apache-2.0** ; VOICES.md : **français = 1 voix féminine (1F)** ; « le support des langues non anglaises peut être absent ou faible… certaines langues ne sont représentées que par une voix (français) » ; meilleure qualité sur 100–200 tokens — [HF Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) ; [VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)
- **Piper : rhasspy/piper-voices = MIT** (tag HF), voix fr_FR disponibles : **gilles, mls, mls_1840, siwis, tom, upmc** (MAJ dépôt 17/09/2026) — [HF piper-voices fr_FR](https://huggingface.co/rhasspy/piper-voices/tree/main/fr/fr_FR)
- **XTTS-v2 : « coqui-public-model-license » (CPML)** — [HF coqui/XTTS-v2](https://huggingface.co/coqui/XTTS-v2) ; [CPML](https://coqui.ai/cpml) ; Space officiel `coqui/xtts` en RUNTIME_ERROR le 16/10/2026 — [HF Spaces API](https://huggingface.co/api/spaces?search=xtts&sort=likes&direction=-1&limit=6&full=true)
- **F5-TTS : poids CC-BY-NC-4.0** — [HF SWivid/F5-TTS](https://huggingface.co/SWivid/F5-TTS) ; fine-tune français trouvé (québécois) également **CC-BY-NC-4.0** — [HF tontate/f5-tts-quebec-french-finetune](https://huggingface.co/tontate/f5-tts-quebec-french-finetune) ; Space `mrfakename/E2-F5-TTS` en ligne (MAJ 15/10/2026)
- **Chatterbox (Resemble AI) : MIT** (MAJ 10/06/2026) — [HF ResembleAI/chatterbox](https://huggingface.co/ResembleAI/chatterbox) ; version multilingue **23 langues dont le français**, appel `language_id="fr"`, ~6 Go VRAM recommandés — [Mintlify doc](https://www.mintlify.com/yocxy2/chatterboxyocxy/models/chatterbox-multilingual) ; [DeepInfra](https://deepinfra.com/ResembleAI/chatterbox-multilingual) ; Spaces `Chatterbox-Multilingual-TTS` et `-V3` en ligne sur ZeroGPU le 16/10/2026
- **Fish Audio** : `openaudio-s1-mini` = CC-BY-NC-SA-4.0 ; `s2-pro` = « fish-audio-research-license » — [HF openaudio-s1-mini](https://huggingface.co/fishaudio/openaudio-s1-mini) ; [HF s2-pro](https://huggingface.co/fishaudio/s2-pro)
- Autres (licence seulement) : Qwen3-TTS-12Hz-1.7B-Base Apache-2.0 — [HF](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base) ; sesame/csm-1b Apache-2.0 — [HF](https://huggingface.co/sesame/csm-1b) ; VibeVoice-1.5B MIT — [HF](https://huggingface.co/microsoft/VibeVoice-1.5B) ; IndexTTS-2 sans tag de licence — [HF](https://huggingface.co/IndexTeam/IndexTTS-2)

**TTS hébergée gratuite**
- **API Gemini TTS** : Gemini 3.8 Flash TTS, 3.8 Flash-Lite TTS, 3.1 Flash TTS Preview, 2.5 Flash Preview TTS = « Free of charge » (palier standard) ; 2.5 Pro TTS non gratuit — [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- **Google Cloud Text-to-Speech** : Standard 4 M caractères/mois gratuits, WaveNet 1 M, Chirp 3 HD 0–1 M puis 30 $/M ; **la facturation doit être activée** (dépassements facturés automatiquement) ; Gemini 2.5 Flash/Pro TTS sans usage gratuit côté Cloud — [Google Cloud TTS Pricing](https://cloud.google.com/text-to-speech/pricing) ; [Google Cloud TTS](https://cloud.google.com/text-to-speech) ; conflit : CostBench donne 4 M pour WaveNet — [CostBench](https://costbench.com/software/ai-voice-tools/google-cloud-text-to-speech/free-plan/)
- **Cloudflare Workers AI** : melotts 18,63 neurons/minute audio sur 10 000 neurons/jour gratuits — [Cloudflare](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- **ElevenLabs gratuit** (lu le 16/10/2026) : **10 000 crédits/mois (~10 min)**, pas de report, **licence commerciale seulement à partir de Starter** (6 $/mois, promo 1 $ jusqu'au 18/10), pas d'Instant Voice Cloning en gratuit, 3 emplacements de voix, ~2 requêtes simultanées — [ElevenLabs Pricing](https://elevenlabs.io/pricing)
- **edge-tts** : passe par les voix « Read Aloud » gratuites d'Edge, **route non officielle** (pas d'API publique Microsoft) — [PromptQuorum](https://www.promptquorum.com/power-local-llm/openai-edge-tts-review) ; Microsoft peut limiter/bloquer l'usage excessif ou commercial, Azure AI Speech recommandé pour le commercial (README d'un paquet tiers) — [edge-tts-browser README](https://cdn.jsdelivr.net/npm/edge-tts-browser@1.0.1/README.md) ; erreurs 403 et restrictions après abus (revente de voix-off) — [pyVideoTrans](https://pyvideotrans.com/en/edgetts-api) ; un développeur d'extension signale qu'au **17/12/2025 Microsoft a bloqué sa méthode** d'accès gratuit — [Firefox add-on edge-tts](https://firefox.marketplace.browsertotal.com/ko/firefox/addon/edge-tts/)
- Pollinations propose Kokoro, Qwen3-TTS, ElevenLabs, Gemini TTS… mais sous clé + Pollen — [Pollinations APIDOCS](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md)

**Lip-sync**
- **LatentSync (ByteDance)** : code et poids Apache 2.0 selon un comparatif (8 Go VRAM v1.5, 18 Go v1.6, meilleure fidélité mais lent) — [Creative AI News](https://www.creativeainews.com/articles/open-source-lip-sync-licenses-commercial-use-2026/) ; **mais la fiche HF LatentSync-1.6 porte le tag `openrail++`** (conflit à vérifier) — [HF ByteDance/LatentSync-1.6](https://huggingface.co/ByteDance/LatentSync-1.6) ; Space `fffiloni/LatentSync` **RUNNING sur ZeroGPU** le 16/10/2026
- **MuseTalk : MIT** (fiche HF MAJ 22/09/2026) ; ne régénère que bouche/bas du visage ; ~5 min pour 8 s sur GPU portable 4 Go en FP16 (README) — [Creative AI News](https://www.creativeainews.com/articles/open-source-lip-sync-licenses-commercial-use-2026/) ; [HF TMElyralab/MuseTalk](https://huggingface.co/TMElyralab/MuseTalk) ; Space officiel en RUNTIME_ERROR
- **Wav2Lip : usage commercial strictement interdit** (poids entraînés sur LRS2) — [Creative AI News](https://www.creativeainews.com/articles/open-source-lip-sync-licenses-commercial-use-2026/)
- Autres modèles (licence HF) : **InfiniteTalk Apache-2.0** — [HF](https://huggingface.co/MeiGen-AI/InfiniteTalk) ; **Wan2.2-S2V-14B (speech-to-video) Apache-2.0** — [HF](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B) ; LivePortrait MIT — [HF](https://huggingface.co/KwaiVGI/LivePortrait) ; Hallo3 MIT — [HF](https://huggingface.co/fudan-generative-ai/hallo3) ; HunyuanVideo-Avatar sans tag de licence — [HF](https://huggingface.co/tencent/HunyuanVideo-Avatar)
- Hébergé grand public : HeyGen 3 vidéos/mois ≤ 1 min, 720p filigrane — [AIToolsBakery](https://aitoolsbakery.com/blog/ai-video-tools-free-tier-2026/) ; **Hedra : pas de palier gratuit permanent** (Scopeful mai 2026, CostBench août 2026) vs 125 crédits uniques (PulseSignal 09/10/2026, conflit) ; Character-3 = 6 crédits/s — [Scopeful](https://www.scopeful.org/tools/hedra) ; [CostBench](https://costbench.com/software/ai-media-apis/hedra-api/free-plan/) ; [PulseSignal](https://getpulsesignal.com/pricing/hedra)

### Inferences
- Pour 54 personnages, les voix « préfabriquées » ne suffisent pas (Piper : 6 voix FR, Kokoro : 1) : la solution gratuite et commercialisable est le **clonage zéro-shot avec Chatterbox Multilingual (MIT)** à partir de 54 courts échantillons de référence (générés une fois, p. ex. par variation de voix Piper/Gemini TTS ou par des voix humaines consenties) — Chatterbox tourne aussi sur CPU (6 Go RAM selon un tiers), donc compatible avec un traitement hors GPU.
- Gemini TTS gratuit (API) est la meilleure TTS hébergée gratuite **utilisable par code** ; à condition que ses CGU gratuites conviennent (contenus utilisés pour l'entraînement).
- Les modèles lip-sync (LatentSync/MuseTalk/Wav2Lip) sont entraînés majoritairement sur des visages humains réels ; sur des personnages 3D stylisés type Pixar, le résultat est incertain — d'où l'intérêt des moteurs vidéo qui génèrent parole + bouche nativement (Veo 3.1, Seedance 2.0) ou des modèles audio→vidéo (Wan2.2-S2V, InfiniteTalk).
- edge-tts est gratuit et de bonne qualité, mais **non officiel, sans garantie, potentiellement bloqué** et inadapté à un usage monétisé.

### Gaps
- Qualité perçue du français (accent, prosodie) de Chatterbox Multilingual, Gemini TTS, MeloTTS et Qwen3-TTS : aucun test comparatif trouvé ; support exact du français par Qwen3-TTS et MeloTTS sur Cloudflare non vérifié.
- Licence par voix Piper (les jeux de données d'origine — SIWIS, MLS, etc. — peuvent avoir leurs propres conditions) : non vérifiée voix par voix.
- Licence réelle de LatentSync (Apache-2.0 vs OpenRAIL++) : sources contradictoires.
- Efficacité du lip-sync open source sur visages cartoon 3D : aucune source.
- CGU exactes de Microsoft pour l'endpoint « Read Aloud » utilisé par edge-tts : aucun texte officiel trouvé.

---

## 5. Montage / assemblage gratuit (ffmpeg, CapCut gratuit, DaVinci Resolve gratuit)

### Takeaway
**DaVinci Resolve 21 gratuit** : sorties jusqu'en UHD 60 i/s sans filigrane (sauf effets Studio), mais **plus de
scripting depuis la 21.1** et aucun outil IA. **CapCut gratuit** : exports standards non filigranés, filigrane sur
les éléments « Pro », CGU accordant à ByteDance une licence large sur les contenus. **ffmpeg** reste l'outil
d'assemblage automatisable par code (concaténation, mixage voix/musique, sous-titres, 9:16).

### Cited Findings
- DaVinci Resolve 21 gratuit : master/sortie **≤ UHD 3840×2160 à 60 i/s**, **un seul GPU** sous Windows/Linux, outils IA de Resolve 21 absents du gratuit ; réduction de bruit, motion blur, isolation de voix réservés au Studio ; pas de filigrane général, mais **filigrane Studio** si on utilise un effet Studio — [Blackmagic Readme Resolve 21](https://www.blackmagicdesign.com/support/content/readme/59dd4eef1f4941c29fb8dc48b33f5c87) ; [Videomaker](https://www.videomaker.com/news/davinci-resolve-21-launches-early-with-massive-ai-upgrades/)
- **Resolve 21.1 : le scripting est retiré de la version gratuite** (délibéré, pas de contournement simple ; rester en 21.0 si besoin) — [Puget Systems (10/09/2026)](https://www.pugetsystems.com/blog/2026/09/10/how-davinci-resolve-free-v21-1-scripting-changes-affect-puget-bench/) ; Studio = 295 $ licence unique — [thepostflow](https://thepostflow.com/post-production/video-editing/resolve-studio-vs-free/)
- CapCut gratuit : export 1080p, timeline multipiste, keyframes, chroma key, voix-off IA de base ; **filigrane uniquement sur modèles/effets/outils IA « Pro »** ; Standard ≈ 9,99 $/mois, Pro ≈ 19,99 $ (4K, IA complète) — (tiers) [Vidpros](https://vidpros.com/capcut-pro-vs-free/) ; [Fluxnote (juin 2026)](https://fluxnote.io/guides/capcut-questions-answered)
- CGU CapCut : licence « non exclusive, gratuite, transférable, sous-licenciable, perpétuelle et mondiale » sur les contenus importés/créés (CGU MAJ 15/04/2026 selon un résumé tiers) ; les sons/musiques intégrés ne sont pas licenciés pour l'usage commercial — (tiers) [Fluxnote](https://fluxnote.io/guides/capcut-questions-answered) ; [VEED review](https://www.veed.io/learn/capcut-review)

### Inferences
- Pour un pipeline automatisé (script → plans → voix → montage), **ffmpeg** (en ligne de commande, scriptable) est préférable à Resolve gratuit (scripting retiré en 21.1) et à CapCut (non scriptable, CGU de licence large).
- CapCut reste utile pour finitions manuelles rapides et sous-titres auto, en évitant les éléments « Pro » (filigrane) et la musique intégrée pour du contenu monétisé.

### Gaps
- Licence et conditions d'ffmpeg (LGPL/GPL selon compilation) : non relues ici (non bloquant pour un usage local).
- Texte officiel des CGU CapCut 2026 : non consulté directement (résumés tiers uniquement) ; disponibilité/conditions de CapCut au Sénégal non vérifiées.

---

## 6. Durabilité (plusieurs sketches/semaine) et CGU : automatisation, usage commercial, monétisation TikTok

### Takeaway
Rien de gratuit n'est à la fois **illimité, automatisable et monétisable** : les applis grand public (Flow, Dreamina,
Kling, Qwen) sont **manuelles** (pas d'API gratuite ; Veo/Imagen/Nano Banana absents du palier API gratuit), souvent
**filigranées** et parfois **non commerciales** (Kling, PixVerse, Krea, ElevenLabs gratuit). Le socle durable et
légal est **l'auto-hébergement de modèles ouverts sous licence permissive** (Wan 2.2 Apache-2.0, Qwen-Image-Edit
Apache-2.0, Chatterbox MIT, MuseTalk MIT, InfiniteTalk/Wan-S2V Apache-2.0) sur GPU gratuits, complété à la main par
Flow (≈ 5 clips Veo Lite/jour). Côté monétisation, le **Creator Rewards Program de TikTok n'est pas ouvert au Sénégal**
selon les listes disponibles et ne rémunère que les vidéos **> 1 min** — les sketches de 25–60 s n'y seraient de toute
façon pas éligibles.

### Cited Findings
- Licences « vidéo » ouvertes (HF, 16/10/2026) : **Wan2.2-TI2V-5B Apache-2.0**, Wan2.2-S2V-14B Apache-2.0 — [HF Wan2.2-TI2V-5B](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B) ; **LTX-2 = « ltx-2-community-license-agreement »** (licence propre, à lire) — [HF Lightricks/LTX-2](https://huggingface.co/Lightricks/LTX-2)
- Usage commercial interdit/limité en gratuit : Kling (tiers) — [Atlas Cloud](https://www.atlascloud.ai/blog/guides/kling-ai-pricing) ; PixVerse (tiers) — [Atlas Cloud](https://www.atlascloud.ai/id/blog/guides/pixverse-ai-free) ; Krea — [Krea blog](https://www.krea.ai/blog/what-is-higgsfield-ai-pricing-free-plan-and-alternatives-in-2026) ; ElevenLabs (licence commerciale dès Starter) — [ElevenLabs](https://elevenlabs.io/pricing) ; FLUX.1 Kontext dev, F5-TTS, XTTS-v2, Fish S1-mini (licences non commerciales) — [HF FLUX Kontext](https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev) ; [HF F5-TTS](https://huggingface.co/SWivid/F5-TTS) ; [HF XTTS-v2](https://huggingface.co/coqui/XTTS-v2) ; [HF openaudio-s1-mini](https://huggingface.co/fishaudio/openaudio-s1-mini)
- Pika gratuit : « usage commercial permis » (AIToolsBakery, 24/08/2026) vs « pas d'usage commercial » (CostBench) — [AIToolsBakery](https://aitoolsbakery.com/blog/ai-video-tools-free-tier-2026/) ; [CostBench](https://costbench.com/software/ai-video-generators/pika/free-plan/)
- Grok Imagine : contourner par un second compte n'aide pas ; limites possiblement liées à l'IP/appareil (soupçon non confirmé par xAI) — [RoboRhythms](https://www.roborhythms.com/is-grok-imagine-free/)
- Données : en palier gratuit de l'API Gemini, les contenus servent à améliorer les produits Google — [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing) ; Leonardo gratuit : images publiques — [Nesyona](https://nesyona.com/articles/ai-image-generator-free-tier-limits-2026)
- **TikTok Creator Rewards** : exigences courantes = 18 ans+, 10 000 abonnés, 100 000 vues authentiques sur 30 jours, compte personnel, pays éligible, **vidéos de plus d'une minute** — (tiers) [MessengerBot](https://messengerbot.app/tiktok-creator-rewards-program-2026-how-to-qualify-and-earn/) ; [ShortSync](https://www.shortsync.app/resources/tiktok-creator-rewards-program-2026)
- Pays éligibles (attribution exacte incertaine parmi les comparateurs ci-dessous, résumé de recherche) : une source s'appuyant sur la doc de support TikTok consultée le 14/08/2026 cite **Brésil, France, Allemagne, Japon, Corée du Sud, Royaume-Uni, États-Unis** ; d'autres ajoutent Canada/Mexique ; **aucune liste ne mentionne le Sénégal ni un pays africain** — (tiers) [ttcalculator](https://ttcalculator.net/learn/creator-fund-countries/) ; [ShortSync](https://www.shortsync.app/resources/tiktok-creator-rewards-program-2026)
- Contenu IA sur TikTok : étiquetage requis pour le contenu IA réaliste/significativement modifié ; l'IA n'est pas interdite en soi — (tiers) [Cinerads](https://www.cinerads.com/blog/tiktok-ai-content-policy) ; [Music Business Worldwide (label « AI-generated »)](https://musicbusinessworldwide.com/tiktok-says-its-testing-automatic-ai-content-detection-as-it-rolls-out-new-ai-generated-label-for-creators) ; contenu IA monétisable via CRP s'il est étiqueté et atteint les seuils (tiers) vs affirmations contraires d'autres blogs — [ClipSpeed](https://www.clipspeed.ai/blog/can-ai-videos-be-monetized.html) ; étiquette IA obligatoire dans les **publicités** depuis le 21/07/2026 — [Common Thread](https://commonthreadco.com/blogs/coachs-corner/tiktok-ai-ad-disclosure-rules-ecommerce-2026)
- Marquages : AI Alive (TikTok) et Bing Video Creator ajoutent C2PA ; Bing ajoute un filigrane visible — [FOX 5 NY](https://www.fox5ny.com/news/tiktok-ai-alive-photo-animation-launch) ; [Windows Report](https://windowsreport.com/microsoft-upgrades-bing-video-creator-with-openais-sora-2-ai-video-model/)

### Inferences
- **Tableau de durabilité (synthèse, au 16/10/2026)** :

| Source | Gratuit/sem. (approx.) | API gratuite ? | Filigrane | Commercial en gratuit | Sénégal | Verdict |
|---|---|---|---|---|---|---|
| Google Flow (Veo 3.1 Lite/Fast) | ~35 Lite ou ~14 Fast (≤ 8 s) | Non | Non précisé | Non précisé | Oui (18+) | **Pilier manuel n°1** |
| Dreamina (Seedance 2.0) | 120 crédits/jour (clips non chiffrés) | Non | Oui (tiers) | Non précisé | Non vérifié | Complément manuel |
| Kling | 66 crédits/jour (~2–6 clips/jour) | Non | Oui | Non (tiers) | Non vérifié | Tests/prévisualisation |
| Qwen Chat (Wan) | Non publié (~4–7/session) | Non | Non précisé | Non précisé | Non vérifié | Bonus aléatoire |
| Grok Imagine | 0–1 vidéo/jour selon cohorte | Non | — | — | — | Non fiable |
| Pika / Vidu / PixVerse | 6 clips/mois / ~0 / 30–60 crédits/jour 540p | Non | Variable | Variable | — | Marginal |
| Luma / Sora / Higgsfield | 0 (supprimé/fermé/aucun) | — | — | — | — | Exclus |
| HF ZeroGPU Spaces (Wan, LTX, LatentSync, Qwen-Edit, Chatterbox) | 5 min GPU/jour/compte | **Oui (gradio_client)** | Non | Selon licence du modèle | Oui (web) | Prototypage/appoint |
| OpenRouter `:free`, Gemini, Groq, Cerebras (texte) | 50–1 000 req/jour | **Oui** | — | — | Oui | **Scénarios : suffisant** |
| Gemini TTS / Cloudflare MeloTTS | Gratuit (RPD non publié) / ~536 min/jour | **Oui** | — | Selon CGU | Oui | Voix d'appoint |
| Chatterbox / Piper / Kokoro (local) | Illimité (CPU/GPU) | Local | Non | **Oui (MIT/Apache)** | Oui | **Socle voix** |

- **Automatisation** : aucune des applis grand public n'offre d'API gratuite ; piloter Flow/Dreamina/Kling par scripts navigateur relève généralement des interdictions d'accès automatisé des CGU (non vérifié texte par texte, voir Gaps) et expose au bannissement du compte. Les seules voies automatisables légitimement gratuites sont : API texte/TTS gratuites, Spaces HF via gradio_client (dans les quotas), et modèles locaux/auto-hébergés.
- **Multi-comptes** : multiplier les comptes pour contourner les quotas (Flow, Kling, HF) est contraire à l'esprit des conditions et inefficace chez certains (Grok lie aux cohortes/IP) ; à ne pas recommander.
- **Monétisation** : comme le CRP n'est pas ouvert au Sénégal (selon les listes disponibles) et exige > 1 min, la contrainte « usage commercial » porte surtout sur d'autres revenus (marques, sponsors, TikTok Shop/LIVE gifts) ; il reste prudent de privilégier les sources dont les sorties sont **commercialisables et sans filigrane** (modèles Apache/MIT auto-hébergés ; Flow sous réserve de vérifier ses conditions), et d'**étiqueter le contenu comme IA** sur TikTok.
- Un sketch type (8 plans × 2–3 prises) consomme ~16–24 générations : avec Flow seul (~35 clips Lite/semaine) on vise **~1–2 sketches/semaine** ; pour « plusieurs sketches/semaine », il faut l'auto-hébergement de Wan (paliers GPU couverts par un autre chercheur) et réserver Flow/Dreamina aux plans « héros ».

### Gaps
- Textes officiels des CGU sur l'**automatisation/scraping** de Google Flow (Generative AI Additional Terms / Prohibited Use Policy), Dreamina/CapCut, Kling, Qwen Chat : non consultés dans cette passe.
- Droits commerciaux exacts des sorties **gratuites** de Google Flow (Veo) et de Dreamina : non trouvés dans les pages lues.
- Liste officielle TikTok des pays éligibles au Creator Rewards Program (page support) et programmes de monétisation alternatifs disponibles au Sénégal (cadeaux LIVE, abonnements, TikTok Shop) : non vérifiés sur source primaire.
- Position officielle de TikTok sur l'éligibilité des contenus 100 % IA au CRP : sources tierces contradictoires.
