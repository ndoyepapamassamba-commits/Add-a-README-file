# API vidéo payées à l'usage (sans abonnement) pour animer nos rendus Blender par prompt — état au 14 octobre 2026

Périmètre : API hébergées qui prennent NOS images (rendu Blender en première image, première + dernière image, images de
référence des personnages, ou pré-rendu basse qualité en vidéo-vers-vidéo) + un prompt, et rendent un plan animé 9:16.
Toutes les pages ont été lues le **14/10/2026** sauf mention contraire. « Officiel » = page du fournisseur ; « agrégateur »
= revendeur (fal, OpenRouter, Runware…) ; « tiers » = blog/comparateur (daté, à revérifier). Aucun prix n'est inventé :
ce qui n'a pas pu être lu est dans « Gaps ». Comptes : l'utilisateur doit créer lui-même chaque compte et saisir lui-même
ses moyens de paiement ; rien n'a été créé ni demandé ici.

Formule Seedance utilisée pour les conversions jetons → $/s (sources tierces concordantes, la page BytePlus n'a pas pu
être rendue) : jetons = largeur × hauteur × 24 i/s × durée ÷ 1024 → 720p 9:16 (720×1280) = **21 600 jetons/s** ;
480p 9:16 (480×854) ≈ **9 608 jetons/s** — [fal, guide Seedance 1.5](https://fal.ai/learn/devs/seedance-1-5-user-guide) ;
[iApp, Seedance 2.5](https://iapp.co.th/docs/video-generation/seedance-2p5) ;
[Pika dev, Seedance 2.5](https://dev.pika.art/models/bytedance/seedance-2.5/text-to-video/pricing).

## 1. API officielles : capacités, prix, facturation (tableau dense)

### Takeaway
En octobre 2026, presque tous les grands modèles sont accessibles **à l'usage, sans abonnement** (Veo 3.1 / Lite, Gemini
Omni Flash, Grok Imagine 1.5 / Lite, MiniMax H3 / H3 Max, Wan 2.x / 3.0, Seedance 1.5–2.5, Runway, Luma Ray 3.2, Kling via
agrégateurs). **Sora 2 est fermé depuis le 24/09/2026** et Adobe Firefly reste sur abonnement : à exclure. Les moins chers
à 720p avec notre image en première image tournent autour de **0,025–0,05 $/s** (Wan 2.6 flash, Grok 1.5 Lite, Seedance
1.5 Pro muet, Veo 3.1 Lite) ; la gamme « qualité » est à **0,08–0,15 $/s** (Kling 3.0, Seedance 2.0, Omni Flash, Veo Fast).

### Cited Findings

#### Tableau A — fournisseurs officiels (prix publics, 14/10/2026)

| Fournisseur / modèle | Entrées utiles pour nous | Durées | 9:16 | Audio | Prix (source) | Facturation |
|---|---|---|---|---|---|---|
| Google **Veo 3.1** (Gemini API) | texte, image (i2v), 1re+dernière image, **jusqu'à 3 images de référence**, extension (+7 s ×20) | 4/6/8 s ; 8 s obligatoire pour références, 1080p, 4K | oui | toujours actif | 0,40 $/s (720p/1080p), 0,60 $/s (4K) — [tarifs Gemini](https://ai.google.dev/gemini-api/docs/pricing) | pas de palier gratuit pour Veo ; facturé seulement si la vidéo est générée |
| Google **Veo 3.1 Fast** | idem Veo 3.1 | idem | oui | toujours actif | 0,10 $/s 720p, 0,12 $/s 1080p, 0,30 $/s 4K — [tarifs Gemini](https://ai.google.dev/gemini-api/docs/pricing) | idem |
| Google **Veo 3.1 Lite** | texte, image, 1re+dernière image ; **pas de références, pas d'extension** | 4/6/8 s ; 1080p à 8 s seulement ; pas de 4K | oui | toujours actif | **0,05 $/s 720p, 0,08 $/s 1080p** — [tarifs Gemini](https://ai.google.dev/gemini-api/docs/pricing) ; capacités — [doc Veo](https://ai.google.dev/gemini-api/docs/veo) | idem |
| Google **Gemini Omni Flash** (`gemini-omni-1.1-flash`, preview `gemini-omni-flash-preview`) | texte, image, 1re+dernière image, références de sujets (plusieurs images), **montage d'une vidéo téléversée ≤ 10 s**, références vidéo (3 clips ≤ 3 s), montage conversationnel multi-tours | extension 3–10 s par appel, ~40 s cumulés (guide) | oui (9:16 et 16:9) | généré par défaut ; **anglais seul évalué** | entrée 1,50 $/M jetons ; sortie vidéo 17,50 $/M ; 5 792 jetons/s à 720p ≈ **0,10 $/s** — [tarifs Gemini](https://ai.google.dev/gemini-api/docs/pricing) ; capacités — [doc Omni](https://ai.google.dev/gemini-api/docs/omni) | pas de palier gratuit ; pas de batch |
| xAI **Grok Imagine Video 1.5** | texte, image, **référence : jusqu'à 14 images + 3 voix**, épingler 1re/dernière/milieu, extension | jusqu'à 15 s | oui (métadonnées OpenRouter) | oui (voix de référence) | 0,080 $/s (taux unique publié) — [modèles xAI](https://docs.x.ai/docs/models), [tarifs xAI](https://docs.x.ai/developers/pricing) ; par résolution chez OpenRouter : 0,08 / 0,14 / 0,25 $/s (480p/720p/1080p) — [OpenRouter JSON](https://openrouter.ai/api/v1/videos/models) | les requêtes refusées pour violation sont **quand même facturées** — [tarifs xAI](https://docs.x.ai/developers/pricing) |
| xAI **Grok Imagine Video 1.5 Lite** | texte ou image de départ | 1–15 s | oui | non précisé | **0,020 $/s** (xAI) ; OpenRouter : 0,02 / 0,03 / 0,14 $/s (480p/720p/1080p) + 0,01 $/image d'entrée | idem |
| xAI **grok-imagine-video** (base) | texte, image, **montage d'une vidéo existante par prompt**, extension | 1–15 s | oui | non précisé | 0,050 $/s (xAI) ; OpenRouter : 0,05 / 0,07 $/s (480p/720p) | idem ; « Generated media … is not used for training » — [guide vidéo xAI](https://docs.x.ai/docs/guides/video-generations) |
| MiniMax **H3** | texte, image, 1re+dernière image, références image/vidéo/audio | 5–15 s (OpenRouter) | oui | oui | 0,08 $/s 768P, 0,13 $/s 2K ; 5 images gratuites puis 0,04 $/image ; vidéo d'entrée 0,08 $/s (768P) — [MiniMax PAYG](https://platform.minimax.io/docs/guides/pricing-paygo) | **solde prépayé** débité à l'usage ; échecs non débités |
| MiniMax **H3 Max** | texte, image, 1re+dernière image | 5–15 s (OpenRouter) | oui | oui (fal) | **0,05 $/s 480P**, 0,08 $/s 768P ; 2 images gratuites puis 0,074 $ ; vidéo d'entrée 0,0553 $/s (480P) — [MiniMax PAYG](https://platform.minimax.io/docs/guides/pricing-paygo) | idem ; les « Video Packages » mensuels (1 000 $ et +) ne couvrent pas H3 |
| MiniMax **Hailuo 2.3 / 2.3 Fast / 02** | image | 6/10 s | Hailuo 2.3 : **16:9 seulement** chez OpenRouter | non | 768P 6 s : 0,28 $ (2.3), 0,19 $ (2.3 Fast) ; 512P 6 s : 0,10 $ (02) — [MiniMax PAYG](https://platform.minimax.io/docs/guides/pricing-paygo) | idem |
| Alibaba **Wan 3.0** / **3.0 Prime** (Model Studio, Singapour) | texte, image, références image/vidéo/audio (Runway) | 2–30 s (OpenRouter) | oui | oui | 3.0 : 0,05 / 0,10 / 0,20 $/s (480/720/1080p, **–30 % temporaire**) ; Prime : 0,068 / 0,14 / 0,28 $/s ; **entrée ET sortie facturées** — [Model Studio](https://www.alibabacloud.com/help/en/model-studio/model-pricing) | 30 s gratuites (entrée+sortie), 90 jours |
| Alibaba **Wan 2.7** i2v / r2v / videoedit | i2v, **1re+dernière image**, référence (r2v), **montage vidéo** | 2–10 s (OpenRouter) | oui | oui | 0,10 $/s 720p, 0,15 $/s 1080p ; videoedit : entrée + sortie facturées — [Model Studio](https://www.alibabacloud.com/help/en/model-studio/model-pricing) | 50 s gratuites par modèle, 90 jours |
| Alibaba **Wan 2.6** i2v / i2v-flash / r2v-flash | i2v, référence (r2v : vidéo d'entrée facturée jusqu'à 5 s) | 5 ou 10 s (OpenRouter « Wan 2.6 ») | oui | option | i2v 0,10 $/s 720p ; **i2v-flash muet 0,025 $/s 720p**, 0,0375 $/s 1080p ; avec audio 0,05 / 0,075 ; r2v-flash muet 0,025 $/s 720p — [Model Studio](https://www.alibabacloud.com/help/en/model-studio/model-pricing) | r2v : 50 s gratuites |
| Alibaba **Wan 2.2** i2v-flash / kf2v-flash / animate | i2v ; **kf2v = 1re+dernière image** ; **animate-move = image du personnage + mouvement d'une vidéo** ; animate-mix = remplacement de personnage | non lu | non lu | muet | i2v-flash 0,015 $/s 480p, 0,036 $/s 720p ; **kf2v-flash 0,015 / 0,036 / 0,07 $/s** ; animate-move 0,12 (std) / 0,18 (pro) $/s ; animate-mix 0,18 / 0,26 $/s — [Model Studio](https://www.alibabacloud.com/help/en/model-studio/model-pricing) | 50 s gratuites par modèle |
| Alibaba **Wan 2.1 VACE plus** | **montage/restylage vidéo (VACE)** | non lu | non lu | — | 0,10 $/s 720p, **entrée gratuite, sortie seule facturée** — [Model Studio](https://www.alibabacloud.com/help/en/model-studio/model-pricing) | 50 s gratuites |
| ByteDance **Seedance 2.5** | texte, image, 1re+dernière image, **jusqu'à 30 images, 10 clips vidéo, 10 audios** de référence | 4–30 s | oui | oui | 10,70 $/M jetons sans vidéo d'entrée, 6,40 $/M avec (entrée + sortie comptées) → **0,231 $/s 720p 9:16** (calcul) — [SaaS CRM Review, 24/08/2026](https://saascrmreview.com/seedance-pricing/) ; mêmes taux chez [OpenRouter](https://openrouter.ai/api/v1/videos/models) | page BytePlus non lisible (JS) |
| ByteDance **Seedance 2.0 / 2.0 Fast / 2.0 Mini** | idem (références image/vidéo/audio), 1re+dernière image | 4–15 s | oui | oui | 2.0 : 7,00 $/M (4,30 avec vidéo) → 0,151 $/s 720p ; Fast : 4,20 $/M (2,475) → 0,091 $/s ; **Mini : 3,50 $/M (2,10) → 0,076 $/s 720p, 0,034 $/s 480p** (calculs) — [OpenRouter JSON](https://openrouter.ai/api/v1/videos/models) | officiel BytePlus : 2.0 avec vidéo d'entrée = 0,39–0,86 $/vidéo 5 s 480p, 0,84–1,86 $ 720p (extrait de recherche de [doc BytePlus](https://docs.byteplus.com/docs/ModelArk/1544106), page non rendue) |
| ByteDance **Seedance 1.5 Pro** | 1re+dernière image | 4–12 s | oui | option | 2,40 $/M avec audio, **1,20 $/M sans audio → 0,026 $/s 720p 9:16** (calcul) — [OpenRouter JSON](https://openrouter.ai/api/v1/videos/models) | — |
| Kuaishou **Kling 3.0 Std / Pro**, **O1**, **O3** | image, 1re+dernière image, O3 : texte/image/**vidéo** + images de référence ; motion control (mouvement d'une vidéo → image de personnage) | 3.0 : 3–15 s ; O1 : 5/10 s | oui | option | **page officielle non lisible (JS)**. OpenRouter : 3.0 Std 0,084 $/s (0,126 avec audio), 3.0 Pro 0,112 (0,168), O1 0,112 $/s — [OpenRouter JSON](https://openrouter.ai/api/v1/videos/models) ; Runway : O3 Std 0,13 $/s, O3 Pro 0,17 $/s — [modèles Runway](https://docs.dev.runwayml.com/guides/models/) | officiel = paquets prépayés ; « Trial S » 9,80 $ / 100 unités, 30 jours, 5 tâches simultanées (tiers) — [Atlas Cloud](https://www.atlascloud.ai/blog/guides/kling-ai-api-pricing) |
| **Runway** API (Gen-4.5, Gen-4 Turbo, Aleph 2, Act-Two + modèles tiers) | Gen-4.5 : texte/image (1re image) ; **Aleph 2 : vidéo→vidéo guidé par images clés** ; **Act-Two : transfert de jeu d'acteur** | Gen-4.5 : 2–10 s 720p (OpenRouter) ; Act-Two 3–30 s (tiers [CometAPI](https://www.cometapi.com/es/models/runway/runwayml-character-performance/)) | Gen-4.5 et Aleph 2 : oui | non | crédit = 0,01 $ ; Gen-4.5 12 cr/s (0,12 $), **Gen-4 Turbo 5 cr/s (0,05 $)**, **Act-Two 5 cr/s (0,05 $)**, **Aleph 2 28 cr/s (0,28 $), minimum 56 cr/génération**, Veo 3.1 40/20 cr/s (audio/sans), Veo 3.1 Fast 15/10 — [tarifs Runway API](https://docs.dev.runwayml.com/guides/pricing/) | crédits achetés à 0,01 $ dans le portail développeur ; minimum d'achat non indiqué |
| **Luma** Ray 3.2 | texte, image, interpolation d'images, extension, **video_edit**, reframe | blocs de 5 / 10 s | non lu | non | génération 720p 0,30 $ / 5 s (0,06 $/s) ; 540p 0,15 $ ; **video_edit 720p 1,08 $ / 5 s**, 540p 0,72 $, brouillon 360p 0,54 $ — [tarifs Luma](https://docs.agents.lumalabs.ai/guides/pricing/) | **paiement à l'usage, « No minimum spend, no contract »** ; capacité partagée, pas de SLA de latence ; « rates subject to change ahead of GA » |
| **Vidu** (Q2 / Q3 / Q4 preview) | i2v, **1re+dernière image**, **reference-to-video** (Q3-mix, Q3, Q3-turbo) | 1–16 s (Q3) ; 3–16 s (Q4, référence) | non lu | option (+15 crédits) | en **crédits RMB** : 1 crédit = 0,03125 RMB ; Q3-turbo référence 720p 10 crédits/s ; Q3 référence 720p 12 crédits/s ; Q4 720p 19 crédits/s ; heures creuses = moitié prix — [tarifs Vidu](https://platform.vidu.com/docs/overview/pricing) | **recharge minimale 500 RMB = 16 000 crédits**, valable 1 an, ≤ 5 tâches simultanées |
| **PixVerse** V6 | i2v, référence | non lu | non lu | option | API officielle 18–23 crédits/s à 1080p ≈ 0,10–0,15 $/s ; paquets PAYG dès 10 $ ou forfaits 100 $/mois (tiers) — [Atlas Cloud, revue V6](https://www.atlascloud.ai/blog/guides/pixverse-v6-review) ; Higgsfield : 0,115 $/s — [Higgsfield](https://higgsfield.ai/blog/higgsfield-api) | non vérifié sur page officielle |
| **Higgsfield** API (revendeur multi-modèles) | dépend du modèle | — | — | — | Kling 2.5 0,042 $/s, Kling 2.6 0,07, **Seedance 2.5 0,0738**, Kling 3.0 0,112, PixVerse 6 0,115, MiniMax H3 0,13, LTX 2.5 Pro 0,17, Wan 3.0 0,20, Seedance 2.0 0,9332 $/s (prix « à partir de ») — [blog Higgsfield, 16/09/2026](https://higgsfield.ai/blog/higgsfield-api) | **« There is no subscription »**, solde en dollars, arrêt automatique à zéro, fonds expirent après 1 an ; recharge minimale 5 $ (tiers) — [MindStudio](https://www.mindstudio.ai/blog/higgsfield-api-pricing-pay-per-use/) |
| **OpenAI Sora 2 / 2 Pro** | — | — | — | — | « The Sora 2 models and Videos API were **shut down on September 24, 2026** » — [modèle Sora 2](https://developers.openai.com/api/docs/models/sora-2) | **exclu** |
| **Adobe Firefly** vidéo | — | — | — | — | aucun prix API à l'usage trouvé ; offre grand public par abonnement et crédits (sources 2025, périmées) — [Magic Hour](https://magichour.ai/blog/adobe-firefly-for-video) | **exclu** (abonnement) |
| **Pika** | son portail dev revend Seedance 2.5 : 11,235 $/M jetons (480p/720p), 6,72 $/M avec vidéo d'entrée — [SaaS CRM Review](https://saascrmreview.com/seedance-pricing/), [Pika dev](https://dev.pika.art/models/bytedance/seedance-2.5/text-to-video/pricing) | — | — | — | API des modèles Pika maison : non trouvée | — |

#### Autres faits officiels utiles
- Veo : latence « ~11 secondes minimum à 6 minutes en heure de pointe » ; vidéos gardées **2 jours** sur le serveur ; filigrane SynthID ; pour i2v / interpolation / références, `personGeneration` = `allow_adult` seulement, et « In EU, UK, CH, MENA locations, `allow_adult` is the only allowed value » — [doc Veo](https://ai.google.dev/gemini-api/docs/veo).
- Gemini Omni : montage/extension de vidéos téléversées **indisponible dans l'EEE, en Suisse et au Royaume-Uni** ; prompts négatifs non pris en charge (à écrire dans le prompt) ; « Voice editing and audio reference uploads are not supported » — [doc Omni](https://ai.google.dev/gemini-api/docs/omni). La page vidéo présente Omni Flash comme modèle par défaut et Veo 3.1 pour l'extension, le contrôle de la dernière image et l'audio natif — [vue d'ensemble vidéo Gemini](https://ai.google.dev/gemini-api/docs/video).
- Omni : jetons/s à 360p = 1 931 (≈ 0,034 $/s), 1080p = 8 688 (≈ 0,152 $/s), 4K = 17 376 (≈ 0,304 $/s) ; Omni 1.1 Flash sortie en preview le 27/08/2026 (tiers, édité le 29/08/2026) — [eesel.ai](https://www.eesel.ai/blog/gemini-omni-1-1-flash-pricing). Runway affiche « Gemini Omni Flash 1.1 from $0.034/sec » — [modèles Runway](https://docs.dev.runwayml.com/guides/models/).
- Conditions Gemini API : pour les services **payants**, « Google doesn't use your prompts » ni les réponses « to improve our products » ; journalisation limitée « solely for detecting and preventing violations » ; pour les services **gratuits**, contenu utilisé pour améliorer les produits et lisible par des relecteurs humains — [conditions Gemini API](https://ai.google.dev/gemini-api/terms).
- Alibaba : « Failed requests are not billed and do not consume the free quota » ; formule « Cost = Video unit price × Video duration (seconds) » — [Model Studio](https://www.alibabacloud.com/help/en/model-studio/model-pricing). Lip-sync (wan2.2-s2v 0,129 $/s 720p, videoretalk 0,0115 $/s) listé **seulement pour la région Chine (Pékin)** — même page.
- Seedance 2.0 en Chine (Volcengine) : 28 ¥/M jetons avec vidéo d'entrée, 46 ¥/M en génération pure (≈ 0,14 $/s) — [TechNode, 05/03/2026](https://technode.com/2026/03/05/bytedances-seedance-2-0-video-model-costs-about-0-14-per-second/).
- Paquets de ressources BytePlus (tiers, citant la doc ModelArk) : 4,30 $ pour 1 M jetons, 43 $ pour 10 M ; paquets « fast » 3,30 $ / 1 M — [Kingy.ai](https://kingy.ai/news/byteplus-review-seedance-2-0-turns-byteplus-into-a-serious-ai-video-platform/).

### Inferences
- Le taux unique xAI (0,020 / 0,050 / 0,080 $/s) correspond aux tarifs 480p affichés par OpenRouter ; à 720p il faut compter 0,03 / 0,07 / 0,14 $/s. Le plafond DUR doit utiliser le prix de la résolution réellement demandée.
- Pour nos plans de 1–7 s, les durées minimales pèsent plus que le prix au mètre : Veo (4 s mini), Seedance (4 s), MiniMax H3 (5 s), Wan 2.6 (5 s) facturent la durée minimale même pour un plan d'1 s ; Grok (1 s mini), Wan 3.0 (2 s), Runway Gen-4.5 (2 s), Kling 3.0 (3 s) collent mieux à notre découpage.
- Les modes les plus adaptés à « garder l'identité et la mise en place du rendu Blender » sont : 1re+dernière image (Veo 3.1 / Lite, Wan 2.2 kf2v, Wan 2.7, Seedance, Kling 3.0, H3 Max), références de personnages (Veo 3.1 jusqu'à 3, Grok 1.5 jusqu'à 14, Seedance jusqu'à 30), et vidéo-vers-vidéo (question 3).
- Audio français : aucune page ne garantit le français (Omni : « anglais seul évalué ») ; le plus sûr est de générer **muet** (moins cher chez Wan 2.6 flash, Seedance 1.5, Veo via OpenRouter, Kling) et de garder notre chaîne voix + lip-sync locale.

### Gaps
- Pages de prix officielles **Kling** (kling.ai/dev/pricing) et **BytePlus ModelArk** : rendues en JavaScript, illisibles par l'outil ; prix Kling officiels, coûts du motion control et du lip-sync Kling non vérifiés (seulement tiers : EvoLink ≈ 0,1134 $/s pour motion control, instantané d'avril 2026 — [EvoLink](https://evolink.ai/blog/kling-3-o3-api-official-discount-pricing-developers)).
- xAI : prix par résolution, mode de facturation (prépayé ou facture), limites de débit et rétention : non publiés sur les pages lues.
- Vidu : conversion RMB → USD non publiée ; la page internationale semble montrer les crédits en RMB (à confirmer, peut-être la grille Chine).
- Langues de l'audio Veo 3.1, Grok, Kling, Seedance : non documentées dans les pages lues.
- Limites de débit (RPM) Veo / Omni / Wan / MiniMax : non lues.
- Conditions sur les images téléversées (entraînement, rétention) pour Kling, MiniMax, Alibaba, BytePlus, Runway, Luma, Vidu : non lues — à vérifier avant d'envoyer les planches de la troupe.
- Mode de facturation Google (postpayé via Cloud Billing ou prépayé) : non vérifié dans cette session.

## 2. Agrégateurs : mêmes modèles, prix, abonnement ou dépôt minimum ?

### Takeaway
**OpenRouter route la vidéo depuis avril 2026** (30 modèles au 14/10/2026, prix lisibles par API avant l'appel) ; **fal**
est prépayé avec un point d'API de prix ; **Runware** (2 $ offerts) et **WaveSpeed** (1 $ offert sans carte) sont à l'usage
sans abonnement ; **Hugging Face** n'offre plus de crédits aux comptes gratuits (achat de crédits requis) ; Together et
Replicate publient peu de prix vidéo. Les agrégateurs reprennent en général le prix officiel (OpenRouter = Google, MiniMax,
Alibaba), mais fal facture Seedance ≈ 2× le tarif BytePlus.

### Cited Findings

#### Tableau B — agrégateurs (14/10/2026)

| Agrégateur | Facturation / abonnement | Prix vidéo relevés | Outils de contrôle du coût |
|---|---|---|---|
| **OpenRouter** | à l'usage par seconde de vidéo ; lancement vidéo le 15/04/2026 (Seedance 2.0/1.5, Veo 3.1, Wan 2.7/2.6, Sora 2 Pro au départ) — [blog OpenRouter](https://openrouter.ai/blog/video-generation) | Veo 3.1 0,40 $/s (0,20 sans audio) ; Veo 3.1 Fast 0,10 $/s 720p (0,08 sans audio) ; **Veo 3.1 Lite 0,05 $/s 720p (0,03 sans audio)** ; Grok 1.5 Lite 0,02/0,03/0,14 ; Grok 1.5 0,08/0,14/0,25 ; Kling 3.0 Std 0,084 (0,126 audio) ; Kling O1 0,112 ; H3 Max 0,05 (480p) / 0,08 (768p) ; H3 0,13 (2K) + 0,04/réf ; Wan 3.0 0,05/0,10/0,20 ; Wan 2.7 0,10 ; Wan 2.6 i2v 0,10 (720p) ; Seedance 2.0 Mini 3,5 $/M ; Seedance 2.5 10,7 $/M ; **Runway Aleph 2 0,28 $/s (min 0,56 $)** ; Gen-4.5 0,12 ; **FLUX Video Edit 0,03 $/s** ; HeyGen Video 1 0,02 $/s (480p) + 0,04 $/image de réf. ; HappyHorse 1.1 0,0988 $/s 720p — [OpenRouter, liste JSON](https://openrouter.ai/api/v1/videos/models) | `GET /api/v1/videos/models` donne les `pricing_skus` ; chaque tâche terminée renvoie `usage.cost` ; entrées `frame_images` (first/last) et `input_references` ; « Video generation is not eligible for Zero Data Retention » ; génération « 30 seconds to several minutes » — [doc vidéo OpenRouter](https://openrouter.ai/docs/guides/overview/multimodal/video-generation.md) |
| **fal.ai** | « fal uses a **prepaid credit model** » ; la concurrence autorisée croît avec l'historique d'achats ; erreurs HTTP ≥ 500 et attente en file **non facturées** — [doc prix fal](https://fal.ai/docs/documentation/model-apis/pricing.md) | MiniMax H3 Max (t2v, i2v, **reference-to-video**) 0,05 $/s ; **H3 Max Turbo i2v 0,025 $/s** ; Kling 2.5 Turbo Pro i2v 0,07 $/s ; Kling v3 Pro 0,14 $/s ; Seedance 2 i2v/référence 0,014 $ / 1 000 jetons — [tarifs fal](https://fal.ai/pricing) ; **Kling O3 Std video-to-video edit 0,126 $/s** — [fal Kling O3 edit](https://fal.ai/models/fal-ai/kling-video/o3/standard/video-to-video/edit) ; Seedance 2.5 0,0214 $ / 1 000 jetons (tiers) — [SaaS CRM Review](https://saascrmreview.com/seedance-pricing/) | `GET https://api.fal.ai/v1/models/pricing?endpoint_id=…` (prix unitaire avant l'appel) — [doc prix fal](https://fal.ai/docs/documentation/model-apis/pricing.md) |
| **Runware** | « pay-as-you-go billing » ; **2 $ offerts** aux inscriptions avec e-mail professionnel ; seules les requêtes réussies sont facturées — [tarifs Runware](https://runware.ai/pricing) | P-Video-2-Pro 480p 0,01 $/s ; HeyGen Video 1.0 480p 0,0107 $/s (promo) ; P-Video-Edit brouillon 0,01875 $/s ; Grok 1.5 Lite 480p 0,02 ; P-Video-2 720p 0,025 ; **H3 Max Turbo 480p 0,025** ; FLUX Video Edit [fast] 0,03 ; Wan 3.0 480p 0,05 ; Seedance 2.5 480p 0,1025 $/s — [tarifs Runware](https://runware.ai/pricing) | estimation dans le Playground |
| **WaveSpeedAI** | « pay-per-use », crédits prépayés, **pas d'abonnement** ; **1 $ offert sans carte** ; niveaux de compte selon les recharges — [tarifs WaveSpeed](https://wavespeed.ai/pricing) | Wan 3.0 0,05 $/s ; MiniMax H3 0,04 $/s ; Kling 3.0 Std 0,084 ; Veo 3.1 Fast 0,10 ; Seedance 2.0 0,12 ; Seedance 2.5 0,18 ; InfiniteTalk 0,03 $/s (prix « à partir de ») — [tarifs WaveSpeed](https://wavespeed.ai/pricing) ; Kling O3 4K edit / référence vidéo 0,462 $/s — [blog WaveSpeed](https://wavespeed.ai/blog/ai-models/kling-o3-4k-video-edit-video-reference/) | page modèle par modèle |
| **Replicate** | « You only pay for what you use » ; modèles publics facturés au temps machine ou par sortie — [tarifs Replicate](https://replicate.com/pricing) | wan-2.1-i2v-480p 0,09 $/s ; wan-2.1-i2v-720p 0,25 $/s ; bannière « Wan 3.0 30 % off » sans prix — [tarifs Replicate](https://replicate.com/pricing) | — |
| **Together AI** | « Pay-per-use » ; prépaiement / minimum non indiqués — [tarifs Together](https://www.together.ai/pricing) | prix « par vidéo » sans durée ni résolution : Seedance 2.0 0,16 $, Seedance 2.5 0,115 $, Kling 2.1 Std 0,18 $, Hailuo 02 0,49 $, Sora 2 0,80 $ (**Sora fermé → page en partie périmée**) — [tarifs Together](https://www.together.ai/pricing) | — |
| **Hugging Face Inference Providers** | comptes gratuits : **aucun crédit mensuel**, « credits purchase required » ; PRO (abonnement) 2 $/mois ; prix des fournisseurs repassés **sans marge** — [doc prix HF](https://huggingface.co/docs/inference-providers/pricing) | routage vers fal, Replicate, WaveSpeed… (tiers) — [Scopeful](https://www.scopeful.org/tools/huggingface) | page de facturation HF |
| **Runway** (comme agrégateur) | crédits à 0,01 $ | héberge Seedance 2.5 (dès 0,20 $/s), 2.0 Mini 0,16 $/s, Kling O3 Std 0,13 $/s, H3 Max dès 0,05 $/s, Wan 3.0 dès 0,05 $/s, Grok 1.5 Lite dès 0,02 $/s, Veo 3.1 Fast dès 0,10 $/s, Omni Flash 1.1 dès 0,034 $/s — [modèles Runway](https://docs.dev.runwayml.com/guides/models/) | — |
| **Higgsfield** (agrégateur) | sans abonnement, fonds valables 1 an — [blog Higgsfield](https://higgsfield.ai/blog/higgsfield-api) | voir tableau A | — |

### Inferences
- Pour « montrer le coût avant chaque appel » et tenir un plafond DUR, **OpenRouter** (tarifs lisibles par API + `usage.cost` après) et **fal** (point `models/pricing`) sont les plus simples à brancher ; un seul compte OpenRouter donne Veo 3.1 Lite, Grok, Kling, Seedance, Wan, MiniMax et Aleph 2.
- OpenRouter suit les prix officiels (Veo, Wan 3.0, H3 Max identiques au centime) ; fal est plus cher sur Seedance (0,014 $/1 000 jetons = 14 $/M contre 7 $/M chez OpenRouter pour 2.0), à vérifier par l'API de prix avant tout choix.
- Les « prix à partir de » des agrégateurs (WaveSpeed, Higgsfield, Runway) sont la résolution la plus basse : ne pas les utiliser tels quels pour le plafond.

### Gaps
- OpenRouter : frais sur l'achat de crédits et montant minimum de recharge non lus dans cette session.
- fal : montant minimum d'achat, expiration des crédits et crédits offerts non publiés sur la page officielle (tiers : expiration 365 jours, 20 $ offerts — non vérifié — [CostBench](https://costbench.com/software/ai-media-apis/fal-ai/)).
- Replicate / Together : prix vidéo par modèle (Kling, Seedance, Veo) non affichés sur la page générale.

## 3. Vidéo-vers-vidéo (restyler un pré-rendu Blender en gardant le mouvement) : qui, comment, combien ?

### Takeaway
Oui, plusieurs API acceptent notre pré-rendu en entrée : **Wan 2.1 VACE (0,10 $/s, entrée gratuite)**, **Gemini Omni Flash
(≈ 0,11 $/s entrée comprise, clips ≤ 10 s, hors EEE/CH/R-U)**, **Kling O3 edit (0,126 $/s chez fal)**, **Wan 2.7 videoedit
(0,10 $/s entrée + sortie)**, **Seedance 2.x avec vidéo de référence (tarif réduit au jeton)**, **Wan 2.2 animate-move
(0,12 $/s : image du personnage + mouvement d'une vidéo)**, **Runway Aleph 2 (0,28 $/s)**, **Act-Two (0,05 $/s, transfert de
jeu)**, **Luma Ray 3.2 video_edit (1,08 $ / 5 s à 720p)**, et des options très bon marché mais non testées : **FLUX Video
Edit 0,03 $/s**, Grok Imagine vidéo de base (montage 0,05 $/s).

### Cited Findings
- **Wan 2.1 VACE plus** : 0,10 $/s à 720p ; « For wan2.1-vace-plus, input is free and only output is billed » ; 50 s gratuites — [Model Studio](https://www.alibabacloud.com/help/en/model-studio/model-pricing).
- **Wan 2.7 videoedit** : 0,10 $/s 720p, 0,15 $/s 1080p ; « both input and output are billed by duration » — [Model Studio](https://www.alibabacloud.com/help/en/model-studio/model-pricing).
- **Wan 2.2 animate-move** (image → mouvement) 0,12 $/s standard, 0,18 $/s pro ; **animate-mix** (remplacement de personnage) 0,18 / 0,26 $/s — [Model Studio](https://www.alibabacloud.com/help/en/model-studio/model-pricing).
- **Wan 2.6 r2v** : vidéo d'entrée facturée jusqu'à 5 s + durée de sortie ; r2v-flash muet 0,025 $/s 720p — [Model Studio](https://www.alibabacloud.com/help/en/model-studio/model-pricing).
- **Gemini Omni Flash** : « Input videos for editing and extension must be 10 seconds or less » ; montage multi-tours (remplacement d'éléments, changement de perspective) ; indisponible pour vidéos téléversées dans l'EEE, en Suisse, au Royaume-Uni — [doc Omni](https://ai.google.dev/gemini-api/docs/omni) ; entrée vidéo 5 792 jetons/s à 1,50 $/M ≈ 0,0087 $/s (tiers) — [eesel.ai](https://www.eesel.ai/blog/gemini-omni-1-1-flash-pricing) ; sortie 720p ≈ 0,10 $/s — [tarifs Gemini](https://ai.google.dev/gemini-api/docs/pricing).
- **Kling O3 Std video-to-video edit** (fal) : 0,126 $/s, vidéo requise (@Video1), images de référence et « Elements » (image de face + image de référence du personnage) optionnels ; la page ne dit pas si le mouvement source est conservé — [fal](https://fal.ai/models/fal-ai/kling-video/o3/standard/video-to-video/edit) ; durée facturée bornée 3–10 s (tiers) — [RunComfy](https://www.runcomfy.com/models/kling/kling-video-o3/standard/video-to-video).
- **Seedance avec vidéo d'entrée** (OpenRouter) : 2.0 4,30 $/M, 2.0 Fast 2,475 $/M, **2.0 Mini 2,10 $/M**, 2.5 6,40 $/M — [OpenRouter JSON](https://openrouter.ai/api/v1/videos/models) ; pour 2.5, durée d'entrée + durée de sortie comptées, et BytePlus applique un seuil minimal de jetons aux tâches avec vidéo — [SaaS CRM Review](https://saascrmreview.com/seedance-pricing/).
- **Runway Aleph 2** : 28 crédits/s (0,28 $/s), minimum 56 crédits par génération — [tarifs Runway](https://docs.dev.runwayml.com/guides/pricing/) ; « in-context video editing model with keyframe-guided control » — [modèles Runway](https://docs.dev.runwayml.com/guides/models/) ; ratios dont 9:16 et paramètre `keyframes` — [OpenRouter JSON](https://openrouter.ai/api/v1/videos/models).
- **Runway Act-Two** (`/v1/character_performance`) : 5 crédits/s (0,05 $/s) — [tarifs Runway](https://docs.dev.runwayml.com/guides/pricing/) ; vidéo d'interprétation + image ou vidéo du personnage, 3–30 s (tiers) — [CometAPI](https://www.cometapi.com/es/models/runway/runwayml-character-performance/).
- **Luma Ray 3.2 video_edit** : 360p 0,54 $ / 5 s, 540p 0,72 $, **720p 1,08 $ / 5 s (2,16 $ / 10 s)**, 1080p 2,16 $ / 5 s — [tarifs Luma](https://docs.agents.lumalabs.ai/guides/pricing/).
- **Grok Imagine vidéo de base** : « Modify an existing video with a text prompt » — [guide vidéo xAI](https://docs.x.ai/docs/guides/video-generations) ; 0,050 $/s — [tarifs xAI](https://docs.x.ai/developers/pricing).
- **FLUX Video Edit** (Black Forest Labs) : 0,03 $/s de sortie — [OpenRouter JSON](https://openrouter.ai/api/v1/videos/models) ; [fast] 0,03 $/s — [Runware](https://runware.ai/pricing).
- **MiniMax H3** : vidéo d'entrée 0,08 $/s (768P) en plus de la sortie ; H3 Max 0,0553 $/s (480P) — [MiniMax PAYG](https://platform.minimax.io/docs/guides/pricing-paygo).
- **Kling motion control** (mouvement d'une vidéo de référence transféré sur une image de personnage) ≈ 0,1134 $/s chez EvoLink (tiers, avril 2026) — [EvoLink](https://evolink.ai/blog/kling-3-o3-api-official-discount-pricing-developers).

#### Tableau C — coût vidéo-vers-vidéo (calculs à partir des prix cités ; 1 prise par plan)

| Option (720p sauf mention) | $/s retenu | Film 64 s | 3 plans clés 12 s | Hypothèse |
|---|---|---|---|---|
| FLUX Video Edit | 0,03 | 64 × 0,03 = **1,92 $** | 12 × 0,03 = **0,36 $** | qualité et respect du mouvement non testés |
| Grok vidéo de base (montage) | 0,05 | 64 × 0,05 = 3,20 $ | 0,60 $ | facturation de l'entrée non documentée |
| Runway Act-Two | 0,05 | 3,20 $ | 0,60 $ | pilotage par un rendu Blender non vérifié |
| Seedance 2.0 Mini + vidéo | 2,10 $/M × 21 600 jetons/s = 0,0454 | sortie seule (4 s mini → ≥ 92 s) : 92 × 0,0454 = **4,17 $** ; entrée + sortie : 156 × 0,0454 = 7,08 $ | sortie seule 0,54 $ ; entrée + sortie 1,09 $ | règle d'entrée de la 2.0 non confirmée |
| Wan 2.1 VACE plus | 0,10 (entrée gratuite) | **6,40 $** | **1,20 $** | — |
| Gemini Omni Flash (montage) | 0,1014 + 0,0087 = 0,1100 | 7,04 $ | 1,32 $ | clips ≤ 10 s ; durées de sortie non documentées |
| Wan 2.2 animate-move (std) | 0,12 | 7,68 $ | 1,44 $ | — |
| Kling O3 Std edit (fal) | 0,126 | 8,06 $ | 1,51 $ | facturation 3–10 s (tiers) → un peu plus pour les plans d'1–2 s |
| MiniMax H3 768P (entrée + sortie) | 0,08 + 0,08 = 0,16 | 10,24 $ | 1,92 $ | — |
| Wan 2.7 videoedit | 0,10 × (entrée + sortie) | 128 × 0,10 = 12,80 $ | 24 × 0,10 = 2,40 $ | — |
| Runway Aleph 2 | 0,28 | 17,92 $ | 3,36 $ | min 0,56 $ par génération (non atteint pour ≥ 2 s) |
| Luma Ray 3.2 video_edit | 1,08 $ / bloc de 5 s | ≥ 23 × 1,08 = 24,84 $ | 3 × 1,08 = 3,24 $ | chaque plan ≤ 5 s ; un plan de 6–7 s coûte 2,16 $ |

### Inferences
- Pour notre cas (pré-rendu Blender correct en mouvement et en cadrage, à « jouer » mieux et à rendre plus vivant), les
  candidats les plus directs sont **Wan 2.1 VACE** (entrée gratuite, prix connu, Alibaba officiel), **Omni Flash**
  (montage par instruction, mais clips ≤ 10 s et l'utilisateur doit être hors EEE/CH/R-U), **Kling O3 edit** (éléments de
  personnage) et **Wan 2.2 animate-move** (notre planche du personnage + le mouvement de notre rendu).
- FLUX Video Edit et Grok « edit » sont les moins chers mais sans aucune preuve de qualité pour du dessin 2D : à tester
  sur 1 plan avant tout lot.

### Gaps
- Aucune page lue ne garantit que le **mouvement et la mise en page** du pré-rendu sont conservés à l'image près (VACE,
  Omni, Kling O3, Aleph) : à mesurer chez nous (écart de silhouette / flux optique entre entrée et sortie).
- Limites d'entrée (durée, résolution, 9:16) de Wan VACE, Wan 2.7 videoedit, Aleph 2, Kling O3 edit : non lues.
- Coût réel de Seedance 2.0 avec vidéo (entrée comptée ou non, seuil minimal) : page BytePlus illisible.

## 4. Coût d'un film de 64 s et de 3 plans clés (≈ 12 s) — les 3 options adaptées les moins chères (calculs montrés)

### Takeaway
En image-vers-vidéo 720p 9:16 depuis notre rendu, une prise par plan : **Grok Imagine 1.5 Lite ≈ 1,92 $ le film / 0,36 $
les 3 plans**, **Seedance 1.5 Pro muet ≈ 2,38 $ / 0,31 $**, **Veo 3.1 Lite ≈ 2,76 $ muet (OpenRouter) ou 4,60 $ avec audio
(Google) / 0,36–0,60 $**. Wan 2.6 i2v-flash muet suit (≈ 2,88 $ / 0,38 $). La gamme « qualité » (Kling 3.0 Std, Seedance 2.0
Mini, Omni Flash, Veo 3.1 Fast) coûte **≈ 5,80–9,20 $ le film** et **≈ 0,91–1,22 $ les 3 plans**. Les reprises multiplient
ces montants.

### Cited Findings
Hypothèses de calcul (à appliquer dans le plafond DUR) :
- 23 plans, total 64 s, chaque plan 1–7 s (durées entières supposées) ; **secondes facturées = Σ max(durée du plan, durée
  minimale du modèle)**, arrondies aux durées autorisées. Borne basse : modèle à 4 s mini → max(64, 23 × 4) = **92 s** ;
  5 s mini → 23 × 5 = **115 s** ; 3 s mini → 23 × 3 = **69 s** ; 1–2 s mini → **64 s** (+1 s par plan d'1 s si mini 2 s).
- 3 plans clés de 4 s = 12 s (pour un modèle à 5 s mini : 3 × 5 = 15 s).
- Durées autorisées : Grok 1.5 Lite 1–15 s ; Seedance 1.5 Pro 4–12 s ; Veo 3.1 Lite 4/6/8 s ; « Wan 2.6 » 5/10 s ; Kling 3.0
  3–15 s ; Seedance 2.0 Mini 4–15 s ; H3 Max 5–15 s — [OpenRouter JSON](https://openrouter.ai/api/v1/videos/models) ;
  Veo 4/6/8 s — [doc Veo](https://ai.google.dev/gemini-api/docs/veo).

#### Tableau D — image-vers-vidéo depuis notre rendu (1 prise par plan)

| Option | Prix cité | $/s retenu | Film 64 s | 3 plans clés |
|---|---|---|---|---|
| **1. Grok Imagine Video 1.5 Lite**, 720p | 0,03 $/s 720p — [OpenRouter](https://openrouter.ai/api/v1/videos/models) (xAI : 0,020 $/s — [xAI](https://docs.x.ai/developers/pricing)) | 0,03 | 64 × 0,03 = **1,92 $** (480p : 64 × 0,02 = 1,28 $) | 12 × 0,03 = **0,36 $** (480p : 0,24 $) |
| **2. Seedance 1.5 Pro sans audio**, 720p | 1,20 $/M jetons — [OpenRouter](https://openrouter.ai/api/v1/videos/models) | 21 600 × 1,2e-6 = 0,0259 | 92 × 0,0259 = **2,38 $** | 12 × 0,0259 = **0,31 $** |
| **3. Veo 3.1 Lite**, 720p | sans audio 0,03 $/s — [OpenRouter](https://openrouter.ai/api/v1/videos/models) ; avec audio 0,05 $/s — [Google](https://ai.google.dev/gemini-api/docs/pricing) | 0,03 / 0,05 | 92 × 0,03 = **2,76 $** ; 92 × 0,05 = **4,60 $** | 12 × 0,03 = **0,36 $** ; 12 × 0,05 = **0,60 $** |
| 4. Wan 2.6 i2v-flash muet, 720p | 0,025 $/s — [Model Studio](https://www.alibabacloud.com/help/en/model-studio/model-pricing) | 0,025 | 115 × 0,025 = 2,88 $ (avec audio 0,05 : 5,75 $) | 15 × 0,025 = 0,38 $ |
| Wan 2.2 kf2v-flash (1re+dernière image), 720p | 0,036 $/s — [Model Studio](https://www.alibabacloud.com/help/en/model-studio/model-pricing) | 0,036 | ≥ 64 × 0,036 = 2,30 $ (durées non lues) | 12 × 0,036 = 0,43 $ |
| MiniMax H3 Max, 480p | 0,05 $/s — [MiniMax](https://platform.minimax.io/docs/guides/pricing-paygo) | 0,05 | 115 × 0,05 = 5,75 $ | 15 × 0,05 = 0,75 $ |
| Kling 3.0 Std muet (avec audio) | 0,084 (0,126) $/s — [OpenRouter](https://openrouter.ai/api/v1/videos/models) | 0,084 | 69 × 0,084 = 5,80 $ (8,69 $) | 12 × 0,084 = 1,01 $ (1,51 $) |
| Seedance 2.0 Mini, 720p | 3,50 $/M — [OpenRouter](https://openrouter.ai/api/v1/videos/models) | 0,0756 | 92 × 0,0756 = 6,96 $ | 12 × 0,0756 = 0,91 $ |
| Gemini Omni Flash, 720p | 17,50 $/M × 5 792 jetons/s — [Google](https://ai.google.dev/gemini-api/docs/pricing) | 0,1014 | 64 × 0,1014 = 6,49 $ (borne basse, durées non lues) | 1,22 $ |
| Veo 3.1 Fast, 720p | 0,10 $/s — [Google](https://ai.google.dev/gemini-api/docs/pricing) | 0,10 | 92 × 0,10 = 9,20 $ | 1,20 $ |
| Veo 3.1 (standard) | 0,40 $/s — [Google](https://ai.google.dev/gemini-api/docs/pricing) | 0,40 | 92 × 0,40 = 36,80 $ | 4,80 $ |

### Inferences
- Le prix « au mètre » trompe : Wan 2.6 flash (0,025 $/s) finit plus cher que Grok Lite (0,03 $/s) sur notre découpage, à
  cause de son minimum de 5 s. Le calcul de coût de l'app doit appliquer `Σ max(durée, min_modèle)` et la résolution
  réellement demandée, puis multiplier par le nombre de prises prévu.
- Avec 2 prises par plan (hypothèse de travail, non mesurée), le film reste sous ≈ 4–10 $ dans la gamme bon marché et
  ≈ 12–18 $ dans la gamme qualité ; Veo 3.1 standard (≈ 74 $) est hors budget pour un film entier.
- Les 3 plans clés (≈ 0,30–1,50 $ par modèle) sont la bonne taille pour un **banc A/B réel** sur nos planches avant de
  choisir un champion.

### Gaps
- Durées autorisées de Wan 2.6 i2v-flash, Wan 2.2 kf2v-flash et Omni Flash non lues sur les pages officielles (la valeur
  5/10 s vient d'OpenRouter pour « Wan 2.6 »).
- Taux de rejet / de reprise par modèle sur du dessin 2D : aucune donnée publiée ; à mesurer.
- Qualité sur personnages cartoon : seules des affirmations de revendeur existent — Kling 3.0 « strong » sur la cohérence,
  1 à 2 images de référence ; Seedance « multi-reference » ; Wan 2.6 « Good » sur la préservation du style (Atlas Cloud,
  vendeur d'API) — [Atlas Cloud](https://www.atlascloud.ai/blog/guides/ai-image-to-video-models-compared). Aucun banc
  indépendant 2D/cartoon trouvé.

## 5. Quota d'API réellement gratuit sans abonnement ?

### Takeaway
Rien de récurrent et significatif : **Veo et Omni n'ont pas de palier gratuit**, Hugging Face ne donne plus rien aux comptes
gratuits. Il existe seulement des **quotas d'essai uniques** : Alibaba Model Studio (Singapour) **50 s par modèle Wan pendant
90 jours** (30 s pour Wan 3.0), Runware 2 $, WaveSpeed 1 $ sans carte — utiles pour le banc d'essai, pas pour la production.

### Cited Findings
- Gemini API : Veo « Not available » sur le palier gratuit ; Omni Flash : entrée et sortie « Not available » en gratuit — [tarifs Gemini](https://ai.google.dev/gemini-api/docs/pricing).
- Alibaba Model Studio (Singapour) : 50 s gratuites pour wan2.7-t2v/i2v/r2v/videoedit, wan2.6-t2v/r2v/r2v-flash, wan2.5, wan2.2 (t2v-plus, i2v-plus, i2v-flash, kf2v-flash, animate-move/mix), wan2.1-kf2v-plus, wan2.1-vace-plus ; Wan 3.0 / Prime : 30 s (entrée + sortie) ; valables 90 jours après activation, sortie du modèle ou approbation ; les échecs ne consomment pas le quota ; aucune gratuité indiquée pour wan2.6-i2v / i2v-flash — [Model Studio](https://www.alibabacloud.com/help/en/model-studio/model-pricing).
- Runware : « New users who sign up with a business email receive $2 in free credits » — [tarifs Runware](https://runware.ai/pricing).
- WaveSpeed : 1 $ de crédits pour les nouveaux comptes éligibles, sans carte ; certains modèles premium exclus des crédits d'essai — [tarifs WaveSpeed](https://wavespeed.ai/pricing).
- Hugging Face : comptes gratuits « None » en crédits mensuels, achat de crédits requis — [doc prix HF](https://huggingface.co/docs/inference-providers/pricing) (des pages tierces citent encore 0,10 $/mois : périmé).
- fal : crédits offerts non publiés officiellement (tiers : ~20 $ avec e-mail professionnel, non vérifié) — [CostBench](https://costbench.com/software/ai-media-apis/fal-ai/).
- Kling officiel : pas de gratuité API trouvée ; plus petit paquet d'essai 9,80 $ / 100 unités, 30 jours (tiers) — [Atlas Cloud](https://www.atlascloud.ai/blog/guides/kling-ai-api-pricing).

### Inferences
- Avec ~17 modèles Wan à 50 s, le quota Alibaba représente de l'ordre de 14 minutes de vidéo d'essai (17 × 50 s = 850 s),
  mais **une seule fois** et réparties sur des modèles différents : parfait pour comparer Wan 2.2 kf2v / 2.7 / VACE /
  animate-move sur nos 3 plans clés à 0 $, sans en dépendre ensuite.
- La voie fiable sans abonnement reste un **solde prépayé plafonné** (OpenRouter, fal, MiniMax, Runway, Higgsfield,
  WaveSpeed) avec un plafond DUR appliqué par notre code avant l'appel ; aucun de ces fournisseurs ne publie dans les pages
  lues un plafond de dépense par requête côté serveur.

### Gaps
- BytePlus ModelArk : quota gratuit pour nouveaux comptes non vérifié (page illisible).
- Conditions d'ouverture de compte (carte bancaire exigée, pays éligibles — Côte d'Ivoire / Sénégal) chez Alibaba Cloud
  international, BytePlus, MiniMax, xAI, OpenRouter : non lues ; l'utilisateur devra les vérifier lui-même en créant ses
  comptes.
