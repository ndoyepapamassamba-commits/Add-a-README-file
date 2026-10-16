# Moteurs vidéo fermés : Google Veo 3 / 3.1 (+ Gemini Omni Flash), Kuaishou Kling (1.x → 4.0, Avatar, Foley), xAI Grok Imagine — ce qu'on sait de leur fonctionnement interne (état au 16/10/2026)

Légende utilisée dans chaque puce :
- **[A]** = divulgation officielle du produit (rapport technique, fiche modèle, doc API, communiqué de l'éditeur).
- **[A-équipe]** = article publié par la MÊME équipe (Kling Team / Google DeepMind), fait vérifiable sur l'article, mais dont l'application au produit commercial reste une inférence.
- **[Tiers]** = revendeur, agrégateur, presse ou blog (daté, à revérifier).
- Dans « Inferences » : **[B]** = inférence crédible tirée des articles de l'équipe ; **[C] SPÉCULATION** = hypothèse non sourcée, signalée comme telle.
Les PDF primaires ont été téléchargés et lus en texte intégral (rapport Veo 3, fiche modèle Veo 3, Kling-Omni, Kling-Avatar,
KlingAvatar 2.0, Kling-Foley, ReCamMaster, SynCamMaster, FullDiT, VideoAlign). Catalogue OpenRouter relu le 16/10/2026
(`GET /api/v1/videos/models`, 30 modèles). Aucun appel payant. Les prix officiels Google/xAI repris des notes du 14/10/2026
(`.../Animer Blender par prompt/api_video_paiement_usage.md`) sont signalés comme tels.

## 1. Architecture : diffusion latente ou autorégressif ? DiT / MMDiT / U-Net ? VAE, flow matching, encodeurs de texte, taille

### Takeaway
**Veo 3** est officiellement une **diffusion latente CONJOINTE audio + vidéo** (deux autoencodeurs séparés, un seul débruiteur
**transformer**) ; Google ne publie ni la taille, ni les taux de compression, ni l'encodeur de texte, ni le choix flow matching /
DDPM. **Kling** est officiellement un **DiT + VAE 3D maison** à attention spatio-temporelle complète ; les articles de la Kling Team
montrent un modèle interne en **rectified flow** avec **VAE 3D causal 4× (temps) × 8× (espace)**, un **encodeur T5**, et — depuis
Kling-Omni (= Kling O1, déc. 2025) — un **MLLM « Prompt Enhancer »** devant le DiT, un **étage de super-résolution en cascade**,
un alignement **DPO** et une **distillation 150 → 10 pas**. **Grok Imagine (vidéo)** n'a **aucune** documentation d'architecture
officielle : le seul texte officiel d'xAI décrit **Aurora (images, déc. 2024)** comme « autorégressif à mélange d'experts » ;
l'affirmation « Grok Imagine vidéo = Aurora autorégressif » vient de revendeurs, et un ex-ingénieur vidéo d'xAI a refusé de
confirmer autorégressif vs diffusion.

### Cited Findings

#### Google Veo 3 / 3.1
- [A] « Veo 3 uses latent diffusion, in which the diffusion process is applied jointly to the temporal audio latents, and the spatio-temporal video latents. Video and audio are encoded by respective autoencoders into compressed latent representations […] During training, a transformer-based denoising network is optimized to remove noise from noisy latent vectors. This network is then iteratively applied to an input Gaussian noise during sampling » — [Veo 3 Tech Report (PDF)](https://storage.googleapis.com/deepmind-media/veo/Veo-3-Tech-Report.pdf)
- [A] Fiche modèle : « Veo 3 utilizes latent diffusion […] the diffusion process is applied to the temporal audio latents, and the spatio-temporal video latents » ; publiée le 23/05/2025, **mise à jour le 13/01/2026**, et « covers Veo 3 and subsequent versions » (donc aussi 3.1 / Fast / Lite) — [Veo 3 Model Card (PDF)](https://storage.googleapis.com/deepmind-media/Model-Cards/Veo-3-Model-Card.pdf)
- [A] Matériel / logiciel : entraîné sur **TPU** (« TPU Pods »), « Training was done using **JAX and ML Pathways** » — [Veo 3 Model Card](https://storage.googleapis.com/deepmind-media/Model-Cards/Veo-3-Model-Card.pdf)
- [A] Aucune taille de modèle, aucun taux de compression du VAE, aucun encodeur de texte, aucun objectif (flow matching vs ε-prédiction) ne figurent dans le rapport ni la fiche (lecture intégrale des deux PDF) — [Tech Report](https://storage.googleapis.com/deepmind-media/veo/Veo-3-Tech-Report.pdf) ; [Model Card](https://storage.googleapis.com/deepmind-media/Model-Cards/Veo-3-Model-Card.pdf)
- [A] Lignée revendiquée par Google (Veo 1, 14/05/2024) : « Veo builds upon years of our generative video model work, including Generative Query Network (GQN), DVD-GAN, Imagen-Video, Phenaki, WALT, VideoPoet and Lumiere », « combining architecture, scaling laws and other novel techniques » — [Google blog, 14/05/2024](https://blog.google/technology/ai/google-generative-ai-veo-imagen-3/)
- [A-équipe] **W.A.L.T** (déc. 2023) : « a causal encoder to jointly compress images and videos within a unified latent space », « window attention architecture tailored for joint spatial and spatiotemporal generative modeling », cascade de 3 modèles (base latente + 2 super-résolutions), 512×896 à 8 i/s — [arXiv 2312.06662](https://arxiv.org/abs/2312.06662)
- [A-équipe] **Lumiere** (janv. 2024) : « Space-Time U-Net architecture that generates the entire temporal duration of the video at once », sous-échantillonnage spatial ET temporel, part d'un modèle texte→image pré-entraîné — [arXiv 2401.12945](https://arxiv.org/abs/2401.12945)
- [A-équipe] **VideoPoet** (déc. 2023) : « employs a decoder-only transformer architecture that processes multimodal inputs » (images, vidéos, texte, audio) — branche autorégressive de Google, NON retenue pour Veo 3 qui est diffusion — [arXiv 2312.14125](https://arxiv.org/abs/2312.14125)
- [A] Upscaling : la mise à jour Veo 3.1 du 13/01/2026 permet de « Generate videos 1080p and 4K with state-of-the-art **upscaling** » — [Google blog, 13/01/2026](https://blog.google/innovation-and-ai/technology/ai/veo-3-1-ingredients-to-video/)
- [A] Successeur partiel : **Gemini Omni Flash** (annoncé mai 2026, fiche mise à jour août 2026) : « transformer-based » avec « native multimodal support for text, vision, video and audio inputs », entraîné sur TPU avec JAX + ML Pathways ; la fiche ne mentionne pas Veo — [Fiche Gemini Omni Flash](https://deepmind.google/models/model-cards/gemini-omni-flash/)
- [Tiers] Google n'a pas dit comment l'architecture Omni se rapporte à Veo 3 — [The Next Web](https://thenextweb.com/news/google-gemini-omni-flash-video-model-io-2026)
- [Tiers] **Pas de « Veo 4 » officiel** au début septembre 2026 ; Veo 3.1 reste le modèle Veo courant ; Omni Flash n'est pas présenté comme « Veo 4 » — [Zebracat, sept. 2026](https://zebracat.ai/features/veo-4-video-generator) ; [Aireiter, août 2026](https://aireiter.com/blog/veo-4)

#### Kuaishou Kling
- [A] Lancement (06/2024) : « Kling utilizes diffusion-based transformer architecture (DiT) », « self-developed a **3D VAE** network, achieving synchronous spatiotemporal compression », « computationally efficient, **full-attention** mechanism as a spatiotemporal modeling module » — [Kuaishou IR, juin 2024](https://ir.kuaishou.com/news-releases/news-release-details/kuaishou-unveils-proprietary-video-generation-model-kling)
- [A] **Kling-Omni Technical Report** (18/12/2025, « Model ID: Kling-Omni (Kling-O1) ») : trois blocs — (1) un **Prompt Enhancer** = MLLM entraîné par SFT (chaîne de raisonnement) puis RL, sur un jeu « multilingual » maison ; (2) un **Omni-Generator** qui « processes visual and textual tokens within a shared embedding space » ; (3) un module de **super-résolution multimodale** en cascade, conditionné sur les latents basse résolution ET les signaux MVL — [arXiv 2512.16776](https://arxiv.org/abs/2512.16776)
- [A] Kling-Omni, pipeline d'entraînement : « online **VAE/text encoder** inference and **DiT** training » ; entrées aplaties en séquences 1D, opérateur « MM-FlashAttention » à masques inter-modaux arbitraires — [arXiv 2512.16776](https://arxiv.org/abs/2512.16776)
- [A] Kling-Omni, super-résolution : architecture du modèle de base, initialisée avec ses poids ; **attention locale à fenêtres** avec décalage d'une demi-fenêtre sur les couches impaires ; **attention asymétrique** (les jetons de condition ne s'attendent qu'entre eux → cache KV réutilisé à chaque pas) — [arXiv 2512.16776](https://arxiv.org/abs/2512.16776)
- [A] Kling-Omni, étapes : pré-entraînement texte-vidéo (+ image→vidéo) → SFT « continue-training » (référence→vidéo, montage, tâches entrelacées image/vidéo/texte) → « quality-tuning » → **DPO** (paires préférées/rejetées jugées par des humains, critères dynamique du mouvement et intégrité visuelle ; DPO préféré à GRPO car sans échantillonnage de trajectoires) — [arXiv 2512.16776](https://arxiv.org/abs/2512.16776)
- [A] Kling-Omni, accélération : distillation en deux temps (appariement de trajectoire façon PCM/HyperSD, puis appariement de distribution façon TDM en **ODE** peu de pas) : « compressing the model inference to **10 NFE**, which originally costs **150 NFE** » ; quantification **FP8** de la plupart des GEMM et de l'attention ; cache des conditions ≈ ×2 — [arXiv 2512.16776](https://arxiv.org/abs/2512.16776)
- [A] Kling-Omni ne donne **ni nombre de paramètres, ni taux de compression du VAE, ni nom de l'encodeur de texte** (lecture intégrale) — [arXiv 2512.16776](https://arxiv.org/abs/2512.16776)
- [A-équipe] Modèle interne de base de la Kling Team (ReCamMaster, mars 2025 ; SynCamMaster, déc. 2024) : « latent video diffusion model, consisting of a **3D VAE** and a **Transformer-based diffusion model (DiT)** […] each Transformer block is instantiated as a sequence of spatial attention, 3D (spatial-temporal) attention, and cross-attention modules. The generative model adopts **Rectified Flow** » — [ReCamMaster, arXiv 2503.11647](https://arxiv.org/abs/2503.11647) (affiliation « Kling Team, Kuaishou Technology ») ; [SynCamMaster, arXiv 2412.07760](https://arxiv.org/abs/2412.07760)
- [A-équipe] FullDiT (Kuaishou, mars 2025) : « **causal 3D VAE** with **temporal compression rate of 4 and spatial compression rate of 8** » ; « an internal text-to-video diffusion model with **approximately 1B parameters** » (taille réduite volontairement pour la recherche), entraîné sur **64 NVIDIA H800**, flow matching — [arXiv 2503.19907](https://arxiv.org/abs/2503.19907)
- [A-équipe] VideoAlign (Kling Team, janv. 2025) : vise les modèles « rectified flow […] predicting velocity rather than noise » et propose **Flow-DPO**, Flow-RWR, Flow-NRG — [arXiv 2501.13918](https://arxiv.org/abs/2501.13918)
- [A-équipe] Kling-Avatar (sept. 2025) : « Video Diffusion Transformer […] pretrained on a large-scale dataset », étendu d'une **cross-attention audio** ; audio encodé par **Whisper**, texte par un **encodeur T5** — [arXiv 2509.09595](https://arxiv.org/abs/2509.09595)
- [A-équipe] Kling-Foley (juin 2025, son à partir de la vidéo) : blocs **MM-DiT** « introduced in SD3 », objectif de **flow matching** conditionnel, encodeur texte **T5-Base**, encodeur visuel **MetaCLIP ViT-bigG-14**, « universal latent audio codec » (bruitages, parole, chant, musique), rendu stéréo — [arXiv 2506.19774](https://arxiv.org/abs/2506.19774)
- [Tiers] Kling 3.0 (05/02/2026) décrit comme bâti sur le cadre « Multi-modal Visual Language (MVL) » partageant un espace latent image/vidéo/audio, sur base DiT — [CineD, 05/02/2026](https://www.cined.com/kling-3-0-ai-video-model-introduced-native-4k-enhanced-photorealism-multi-shot-sequencing-and-integrated-audio/)
- [Tiers] Kling 4.0 annoncé fin septembre 2026 (Flash en accès anticipé depuis le 28/09/2026, lancement complet visé en octobre 2026) ; **aucun détail d'architecture** publié — [fal, 29/09/2026](https://fal.ai/learn/tools/what-is-kling-4-0)

#### xAI Grok Imagine (vidéo)
- [A] Seule architecture officiellement décrite = **Aurora** (modèle d'IMAGE, 09/12/2024) : « Aurora is an autoregressive mixture-of-experts network trained to predict the next token from interleaved text and image data », entraîné sur « billions of examples from the internet » — [xAI, 09/12/2024](https://x.ai/news/grok-image-generation-release)
- [A] Doc vidéo xAI : décrit modèles, modes, durées, résolutions — **aucune information d'architecture** — [docs xAI, génération vidéo](https://docs.x.ai/developers/model-capabilities/video/generation)
- [Tiers, témoignage d'un ex-ingénieur] Ethan He (ex-xAI, ex-NVIDIA Cosmos), podcast Latent Space publié le 01/06/2026 : Grok Imagine 0.9 construit par « a few engineers » en **trois mois** en partant de « no infra, no data, and no model » ; 0.9 = « a first audio video [model] deployed at a large scale », génération **audio-vidéo conjointe** ; il « cannot comment specifically how xAI did » ; à la question « autorégressif avec tête de diffusion ? » : « **I cannot comment on that** » ; il décrit comme « quite standard » : VAE/tokenizer, « usually generative models use diffusion transformers », modèle image entraîné d'abord puis vidéo amorcée dessus, sous-titrage par VLM ; vitesse obtenue par « step distillation, consistency and GAN-based approaches » — [Latent Space, 01/06/2026](https://www.latent.space/p/video-agents)
- [Tiers] Rachat de **Hotshot** (startup vidéo, modèle 10 s en 1280×720) par xAI en mars 2025 ; l'équipe devait poursuivre l'entraînement sur **Colossus** — [TechCrunch, 17/03/2025](https://techcrunch.com/2025/03/17/elon-musks-ai-company-xai-acquires-a-generative-ai-video-startup)
- [Tiers] Revendeurs affirmant « Grok Imagine Video = Aurora, autorégressif MoE, audio et vidéo en une passe » — [Replicate](https://replicate.com/xai/grok-imagine-video) ; [Atlas Cloud](https://www.atlascloud.ai/models/xai/grok-imagine-video-v1.5/image-to-video) ; Atlas Cloud précise lui-même qu'xAI n'a publié « no technical report, parameter count, training-data disclosure, or formal model card » pour la 1.5 (même page).
- [Tiers, non vérifiable] « 110 000 GPU NVIDIA GB200 » et technique « Temporal Latent Flow » — [MindStudio](https://www.mindstudio.ai/blog/what-is-grok-imagine-video-xai) ; aucune source xAI trouvée.
- [Tiers] OpenRouter décrit Grok Imagine Video 1.5 Lite comme « **distilled from** Grok Imagine Video 1.5 » ; éditeur affiché « SpaceXAI » — [OpenRouter JSON, lu 16/10/2026](https://openrouter.ai/api/v1/videos/models)

### Inferences
- [B] **Veo 3** : la combinaison « autoencodeur vidéo spatio-temporel + débruiteur transformer + cascade de super-résolution » est la ligne W.A.L.T ; le passage au 4K « par upscaling » (janv. 2026) indique un générateur de base à ≤ 1080p suivi d'un super-résolveur, comme dans W.A.L.T/Imagen Video. Lumiere (U-Net) et VideoPoet (autorégressif) sont des branches abandonnées pour Veo 3 : le rapport dit explicitement « transformer-based denoising network » et « diffusion ».
- [B] **Veo 3 audio** : deux autoencodeurs (audio 1D temporel, vidéo 3D) dont les latents sont débruités ENSEMBLE par le même transformer → séquence de jetons mixtes audio + patchs vidéo, synchronisés par l'attention (voir §3).
- [B] **Kling (≥ 2024)** : DiT à attention 3D complète sur latents d'un VAE 3D causal ~4×8×8, entraîné en rectified flow, texte injecté par cross-attention (T5 dans les articles de recherche). Kling-Omni ajoute un MLLM qui réécrit/raisonne et des jetons image/vidéo de référence concaténés dans la même séquence (« shared embedding space »), d'où l'opérateur MM-FlashAttention à masques. Le modèle de production est bien plus gros que le « ~1B » des articles (qui est explicitement réduit), taille inconnue.
- [B] **Kling 3.0 / O3 / 4.0** sont très probablement des descendants de l'Omni-Generator (même vocabulaire « MVL », mêmes fonctions de références et de montage) ; rien n'indique un changement de paradigme.
- [C] **SPÉCULATION — Grok Imagine** : au vu (1) du 24 i/s, (2) de la « distillation » de la version Lite, (3) des méthodes d'accélération citées par Ethan He (distillation de pas, consistance, GAN — typiques de la diffusion/flow), (4) de son passé NVIDIA Cosmos (diffusion + autorégressif), l'hypothèse la plus probable est une **diffusion/flow latente type DiT avec génération audio-vidéo conjointe**, éventuellement précédée d'un composant autorégressif. L'étiquette « Aurora autorégressif » pour la vidéo n'est qu'une extrapolation de revendeurs à partir du billet image de 2024.
- [C] **SPÉCULATION — Gemini Omni Flash** : « transformer-based, native multimodal input » ressemble à l'architecture Kling-Omni (MLLM + générateur) ; rien de publié ne dit si le générateur derrière est un Veo dérivé.

### Gaps
- Nombre de paramètres : non publié pour Veo 3/3.1, Omni Flash, Kling (toutes versions), Grok Imagine. Aucune estimation crédible trouvée.
- Taux de compression des VAE : non publiés pour Veo et pour le Kling de production (seulement 4×8 pour le modèle de recherche FullDiT).
- Encodeur de texte de Veo : non divulgué (les modèles Imagen antérieurs utilisaient des encodeurs T5 — non vérifié dans cette session, ne pas l'affirmer pour Veo).
- Objectif d'entraînement de Veo (flow matching / v-prédiction / ε) : non divulgué.
- Architecture de Grok Imagine vidéo : rien d'officiel ; Ethan He a explicitement refusé.

## 2. Conditionnement : texte, image (1re / dernière), références (« ingredients » / « elements »), caméra, motion brush, extension

### Takeaway
Les trois moteurs font texte→vidéo et image→vidéo. Pour une **troupe récurrente**, l'outil clé est la **référence de personnage** :
Veo 3.1 « Ingredients » (≤ 3 images « asset », 8 s obligatoires), Kling-Omni/3.0 Omni « Elements / subject library » (plusieurs
images du MÊME personnage sous plusieurs angles — le mécanisme le plus abouti publiquement), Grok Imagine 1.5 (images de référence
+ ≤ 3 voix de référence, ≤ 720p en mode référence). Kling garde l'avance historique sur le contrôle (motion brush et caméra depuis
2024, transfert de mouvement, multi-plans) ; Veo et Grok offrent 1re + dernière image et extension.

### Cited Findings
- [A] **Veo 3.1** (Gemini API) : ≤ **3 images de référence** (`referenceImages`, exemples en `reference_type="asset"`), 1re image (`image`) + dernière image (`lastFrame`), **extension** « by 7 seconds and up to 20 times », entrée ≤ 141 s, sortie ≤ **148 s** au total, extension en 720p seulement ; durée **8 s obligatoire** pour références, 1080p, 4K ; texte ≤ **1 024 jetons** ; **Veo 3.1 Lite : ni références, ni extension** — [doc Veo, Gemini API](https://ai.google.dev/gemini-api/docs/veo)
- [A] Veo 3.1 Ingredients (13/01/2026) : « Identity consistency is better than ever », personnages cohérents à travers décors et scènes, objets/arrière-plans/textures réutilisables — [Google blog](https://blog.google/innovation-and-ai/technology/ai/veo-3-1-ingredients-to-video/)
- [A] Gemini Omni Flash : entrées « Text strings […], images, audio, and video files » ; création et **montage par conversation** — [Fiche Omni Flash](https://deepmind.google/models/model-cards/gemini-omni-flash/) ; doc : références de sujets, montage d'une vidéo ≤ 10 s, références vidéo, indisponible pour vidéos téléversées dans l'EEE / Suisse / R-U (notes du 14/10/2026) — [doc Omni](https://ai.google.dev/gemini-api/docs/omni)
- [A] **Kling-Omni** : entrées « text instructions, reference images, and video contexts » ; « **subject library** mechanism, where multiple images of the same subject (e.g., the same person with different viewpoints, poses, expressions, or lighting conditions) can be jointly provided » pour une identité plus stable ; tableau de capacités : référence image, bibliothèque d'éléments, ajout/retrait/remplacement, stylisation, détourage, **plan suivant / plan précédent**, nouvel angle de caméra, **transfert de mouvement**, **transfert de mouvement de caméra**, 1re image, 1re + dernière image — [arXiv 2512.16776](https://arxiv.org/abs/2512.16776)
- [A] Kling 1.5 (sept. 2024) : **Motion Brush** (trajectoires pour jusqu'à 6 éléments, zones statiques) et **6 mouvements de caméra** (panoramique horizontal/vertical, zoom, pan, tilt, roll) en mode Professionnel 5 s — [communiqué Kling via Barchart](https://www.barchart.com/story/news/29812569/kling-ai-launches-game-changing-motion-brush-and-camera-movements-features-in-kling-15-model) ; Motion Brush limité à 5 s — [The Decoder](https://the-decoder.com/?p=17411)
- [A-équipe] Contrôle caméra de recherche Kling : ReCamMaster (re-filmer une vidéo existante selon une nouvelle trajectoire, jeu de données Unreal Engine 5), SynCamMaster (multi-caméras synchronisées), FullDiT (caméra en plongements de Plücker, identités, profondeur dans une seule séquence à attention complète) — [arXiv 2503.11647](https://arxiv.org/abs/2503.11647) ; [arXiv 2412.07760](https://arxiv.org/abs/2412.07760) ; [arXiv 2503.19907](https://arxiv.org/abs/2503.19907)
- [Tiers] **Kling 3.0** (05/02/2026) : 4 modèles (Video 3.0, Video 3.0 Omni, Image 3.0, Image 3.0 Omni) ; 3.0 Omni ajoute un **storyboard multi-plans** (durée, valeur de plan, perspective, mouvement de caméra par plan) ; jusqu'à **6 plans** et 15 s par génération selon des tiers — résumé du communiqué [Kuaishou IR](https://ir.kuaishou.com/news-releases/news-release-details/kling-ai-launches-30-model-ushering-era-where-everyone-can-be) (page 403 à la lecture directe ; contenu via moteur de recherche)
- [Tiers] **Kling 4.0** (annoncé, specs reprises des notes de version Kling) : 3–30 s, **≤ 10 images clés**, ≤ 15 références (≤ 10 images, ≤ 5 vidéos de 30 s cumulées, ≤ 7 « elements », références voix seules), texte ≤ 8 000 jetons, montage de ≤ 5 clips ; extension jusqu'à 2 min « coming soon » ; Flash : 1re image seulement — [fal, 29/09/2026](https://fal.ai/learn/tools/what-is-kling-4-0)
- [A] **Grok Imagine** : `grok-imagine-video-1.5` = référence→vidéo (images de référence et/ou **audios de référence**, ≤ 3 locuteurs), **1re + dernière image**, **≤ 4 images clés** `{image, timestamp_s}` sur une grille de 1/3 s ; `grok-imagine-video` (classique) = **montage** (`/v1/videos/edits`, sortie ≤ 8,7 s, ≤ 720p) et **extension** (`/v1/videos/extensions`, depuis la dernière image), refuse `last_frame` et `keyframes` ; référence→vidéo du modèle classique ≤ 10 s — [docs xAI](https://docs.x.ai/developers/model-capabilities/video/generation)
- [A] Grok Imagine 1.5 : « jusqu'à 14 images + 3 voix » de référence (lu le 14/10/2026) — [modèles xAI](https://docs.x.ai/docs/models)
- [Tiers] Ethan He mentionne une référence→vidéo « up to seven input images » à une étape antérieure — [Latent Space](https://www.latent.space/p/video-agents)
- [A] Via **OpenRouter**, seules des sous-parties sont exposées : Veo 3.1 / Fast / Lite = `first_frame` + `last_frame` ; Kling 3.0 Std/Pro et O1 = `first_frame` + `last_frame` ; **Grok (3 modèles) = `first_frame` seulement** — [OpenRouter JSON, 16/10/2026](https://openrouter.ai/api/v1/videos/models)

### Inferences
- [B] Pour une troupe récurrente, la « subject library » de Kling-Omni (plusieurs vues du même personnage concaténées comme jetons de condition) est exactement le mécanisme à reproduire : fiches de modèle multi-angles → jetons de référence dans la séquence du DiT, plutôt qu'un adaptateur IP séparé (FullDiT montre que l'approche « tout dans une séquence à attention complète » évite les conflits d'adaptateurs).
- [B] Les **images clés multiples** (Grok 1.5 : 4 ; Kling 4.0 : 10) et la 1re + dernière image permettent d'épingler la pose des personnages depuis un rendu (Blender/dessin) : c'est la voie la plus sûre contre la dérive.
- [B] Les agrégateurs n'exposent pas les modes « référence » : pour les références de personnages, passer par l'API officielle (Gemini API / xAI) ou par fal/Runway selon le modèle.

### Gaps
- Mode « style reference » de Veo 3.1 : cité dans le tableau de paramètres mais non documenté.
- Liste officielle et à jour des paramètres de l'API Kling (elements, voice_id, multi-shot, motion brush en 3.0) : pages Kling dev rendues en JavaScript, illisibles par l'outil.
- Nombre exact d'images de référence par génération pour Kling 3.0 Omni : seulement des chiffres de tiers.

## 3. Audio : génération jointe, dialogue, lip-sync (Veo 3, Kling, Grok)

### Takeaway
**Veo 3** génère l'audio **dans le même processus de diffusion** que la vidéo (latents audio temporels + latents vidéo débruités
ensemble) ; c'est la fusion de la recherche « V2A » de DeepMind (2024) dans le générateur. **Kling** a deux familles : (1) depuis
**Kling 2.6 (déc. 2025, tiers)** puis 3.0, audio natif « dans la même passe » (dialogue multilingue EN/ZH/JA/KO/ES annoncé en 3.0,
français annoncé seulement pour 4.0) ; (2) des modèles spécialisés publiés : **Kling-Avatar / KlingAvatar 2.0** (image + audio →
vidéo parlante, cartoons inclus) et **Kling-Foley** (vidéo → son, MM-DiT flow matching). **Grok Imagine** génère l'audio par défaut
(« lip-synced speech » en 1.5) et un ex-ingénieur affirme une génération audio-vidéo conjointe dès 0.9.

### Cited Findings
- [A] Veo 3 : diffusion « applied jointly to the temporal audio latents, and the spatio-temporal video latents », autoencodeurs audio et vidéo distincts — [Veo 3 Tech Report](https://storage.googleapis.com/deepmind-media/veo/Veo-3-Tech-Report.pdf)
- [A] Données audio de Veo 3 : « Veo 3 was trained on audio, video, and image data. Audio and video datasets were annotated with text captions at different levels of detail, leveraging multiple Gemini models » — [Veo 3 Model Card](https://storage.googleapis.com/deepmind-media/Model-Cards/Veo-3-Model-Card.pdf)
- [A-équipe] **V2A** (DeepMind, 17/06/2024) : « starts by encoding video input into a compressed representation », diffusion qui « iteratively refines the audio from random noise », guidée par la vidéo et un prompt texte, entraînée avec « AI-generated annotations with detailed descriptions of sound and **transcripts of spoken dialogue** » ; limite d'alors : lèvres non synchronisées car « the paired video generation model may not be conditioned on transcripts » — [DeepMind blog](https://deepmind.google/discover/blog/generating-audio-for-video/)
- [A] Veo 3.1 (API) : audio « **Always on** » ; « English (EN) is fully supported, but other languages have not been evaluated, so they may work but results can vary » ; une vidéo peut être bloquée pour cause d'audio (non facturée) — [doc Veo](https://ai.google.dev/gemini-api/docs/veo)
- [A] Rapport Veo 3 : les deepfakes produits restent « much less controllable - particularly with respect to speech » — [Veo 3 Tech Report](https://storage.googleapis.com/deepmind-media/veo/Veo-3-Tech-Report.pdf)
- [A] Gemini Omni Flash : le montage peut modifier la parole des personnes, capacité « For now, we are restricting » — [Fiche Omni Flash](https://deepmind.google/models/model-cards/gemini-omni-flash/)
- [Tiers] Kling 2.6 (déc. 2025) = premier Kling à générer son et image ensemble (voix, bruitages, ambiance, dialogue multi-personnages, point fort en chinois) — [Morphic, glossaire](https://morphic.com/ai-glossary/kling-26)
- [A, via résumé] Kling 3.0 (05/02/2026) : audio natif multilingue — anglais, chinois, japonais, coréen, espagnol, avec accents ; dialogue **multi-personnages, chacun dans une langue** — [Kuaishou IR](https://ir.kuaishou.com/news-releases/news-release-details/kling-ai-launches-30-model-ushering-era-where-everyone-can-be) (contenu obtenu via moteur de recherche, page 403)
- [Tiers] Kling 4.0 : stéréo 2 canaux ; langues « Chinese, English, Japanese, Korean, Spanish, Portuguese, German, **French**, and more » ; lip-sync « more accurate » (affirmation Kling non vérifiée) — [fal, 29/09/2026](https://fal.ai/learn/tools/what-is-kling-4-0)
- [A-équipe] **Kling-Avatar** (18/09/2025) : cascade en 2 étapes — un **directeur MLLM** (Qwen2.5-Omni pour transcription + émotion de l'audio, Qwen2.5-VL pour la légende de l'image) écrit un scénario → une **vidéo « blueprint »** basse résolution → images clés → **sous-clips générés en parallèle conditionnés par 1re + dernière image** ; audio injecté par **cross-attention à fenêtre glissante** (chaque jeton vidéo ne voit que l'audio aligné en temps) ; perte pondérée sur la bouche (DWPose) ; cross-attention texte **gelée** pour garder la contrôlabilité ; jusqu'à **1080p et 48 i/s** ; « strong generalization to […] **anime, cartoons, and stylized characters** » — [arXiv 2509.09595](https://arxiv.org/abs/2509.09595)
- [A-équipe] Données Kling-Avatar : « thousands of hours » d'audio-vidéo filtrés (netteté des lèvres, continuité, **SyncNet**, esthétique) jusqu'à « **hundreds of hours** of high-quality human portrait videos » ; « data quality, rather than data scale, plays a decisive role » ; banc de test : 150 chinois, 150 anglais, 35 coréens, 40 japonais, 35 cas non humains (cartoon, anime, animaux) — **pas de français** — [arXiv 2509.09595](https://arxiv.org/abs/2509.09595)
- [A-équipe] **KlingAvatar 2.0** (déc. 2025) : cascade spatiale ET temporelle (blueprint basse résolution → images clés montées en résolution → sous-clips 1re/dernière image → super-résolution), « Co-Reasoning Director » à plusieurs experts LLM + « negative director », **attention consciente de l'identité** (tête de prédiction de masques sur les couches profondes du DiT) pour injecter l'audio de CHAQUE personnage dans sa région → **dialogues multi-personnages** ; cohérence d'identité « for videos up to **5 minutes** » — [arXiv 2512.13313](https://arxiv.org/abs/2512.13313)
- [A-équipe] **Kling-Foley** (juin 2025) : vidéo(+texte) → audio, MM-DiT + flow matching, T5-Base + MetaCLIP, codec audio latent universel, durée arbitraire, mono→stéréo ; banc Kling-Audio-Eval de 20 935 échantillons annotés — [arXiv 2506.19774](https://arxiv.org/abs/2506.19774)
- [Tiers] Kling AI Avatar v2 (fal) : image + audio → vidéo parlante, « realistic humans, animals, **cartoons, or stylized characters** » ; durée = durée de l'audio ; Pro **0,115 $/s**, Standard **0,0562 $/s** — [fal Kling Avatar v2 Pro](https://fal.ai/models/fal-ai/kling-video/ai-avatar/v2/pro)
- [A] Grok Imagine : audio inclus par défaut, avec « lip-synced speech » sur 1.5 et 1.5-lite ; `generate_audio=False` pour le muet ; voix de référence ≤ 3 locuteurs (1.5) — [docs xAI](https://docs.x.ai/developers/model-capabilities/video/generation)
- [A] Grok Imagine 1.0 (début févr. 2026) : « 10-second videos, 720p resolution, and dramatically better audio » — [xAI sur X](https://x.com/xai/status/2018164753810764061)
- [Tiers] Ethan He : 0.9 fait « audio video, joint generation » ; l'alignement est difficile faute de données audio-vidéo bien alignées en temps — [Latent Space](https://www.latent.space/p/video-agents)

### Inferences
- [B] Veo 3 = « V2A intégré » : là où V2A générait l'audio APRÈS la vidéo (d'où la mauvaise synchro labiale), Veo 3 débruite les deux latents dans la même séquence, ce qui laisse la bouche et le phonème se contraindre mutuellement. Les transcriptions de dialogue présentes dans les légendes Gemini expliquent la capacité à prononcer un texte entre guillemets.
- [B] Kling publie deux recettes réutilisables pour une troupe cartoon : (1) **audio-driven avatar** = DiT pré-entraîné + cross-attention audio Whisper à fenêtre glissante + perte bouche + cascade 1re/dernière image (Kling-Avatar) ; (2) **multi-personnages** = masques par personnage prédits dans le DiT pour router l'audio de chaque voix (KlingAvatar 2.0). C'est la voie « voix enregistrée/TTS français → animation », plus contrôlable que la parole générée nativement.
- [B] Pour du **dialogue en français**, la combinaison « TTS français maîtrisé + modèle avatar/lip-sync » est plus sûre que l'audio natif : Veo ne garantit que l'anglais, Kling 3.0 ne liste pas le français, Grok ne publie aucune liste.

### Gaps
- Langues officiellement prises en charge par Grok Imagine : non publiées.
- Qualité mesurée du lip-sync sur personnages cartoon (bouches stylisées, pas de dents) : aucun banc indépendant ; seulement des affirmations de revendeurs et le banc interne Kling-Avatar (35 cas non humains, résultats non ventilés).
- Architecture audio de Kling 2.6/3.0 (jointe dans le DiT ou cascade avec Kling-Foley ?) : non publiée.

## 4. Spécifications de sortie : durée, résolution, i/s, formats (9:16), temps de génération

### Takeaway
**Veo 3.1** : 4/6/8 s, 720p/1080p/4K (1080p et 4K à 8 s seulement), **24 i/s**, 16:9 et **9:16 natif** (depuis janv. 2026),
extension jusqu'à 148 s, latence 11 s – 6 min. **Kling 3.0** : 3–15 s, 720p chez OpenRouter (4K natif revendiqué par Kuaishou),
16:9 / 9:16 / 1:1 ; **Kling 4.0** annoncé à 30 s et 4K. **Grok Imagine** : **1–15 s**, 480p/720p/1080p (1080p natif en 1.5), 24 i/s
(OpenRouter), 9 formats dont 9:16, rendu « jusqu'à plusieurs minutes », variante rapide ≈ 25 s pour 6 s en 720p.

### Cited Findings
- [A] Veo 3.1 / Fast : 4, 6 ou 8 s ; 720p (défaut), 1080p (8 s), 4K (8 s) ; **24 fps** ; « 16:9 » et « 9:16 » ; 1 vidéo par requête ; latence « Min: 11 seconds; Max: 6 minutes (during peak hours) » ; vidéos conservées 2 jours ; filigrane **SynthID** — [doc Veo](https://ai.google.dev/gemini-api/docs/veo)
- [A] Veo 3.1 Lite : 4/6/8 s, 720p ou 1080p (8 s), pas de 4K, 24 fps, 16:9 / 9:16 — [doc Veo](https://ai.google.dev/gemini-api/docs/veo)
- [A] Veo 3 (`veo-3.0-generate-001`, juillet 2025, désormais « Deprecated ») : tableau de fonctions « 720p & 1080p (16:9 only) », 8 s (contradictions internes de la page signalées) — [doc Veo](https://ai.google.dev/gemini-api/docs/veo)
- [A] 9:16 natif + upscaling 1080p/4K ajoutés le 13/01/2026 — [Google blog](https://blog.google/innovation-and-ai/technology/ai/veo-3-1-ingredients-to-video/)
- [A] OpenRouter : Veo 3.1 et Fast en 1280×720, 1920×1080, 3840×2160 et leurs versions verticales (720×1280, 1080×1920, 2160×3840) ; Lite sans 4K — [OpenRouter JSON](https://openrouter.ai/api/v1/videos/models)
- [A] Kling 3.0 Std/Pro (OpenRouter) : 3–15 s, 720p (1280×720, **720×1280**, 720×720), 16:9 / 9:16 / 1:1 ; Kling O1 : 5 ou 10 s — [OpenRouter JSON](https://openrouter.ai/api/v1/videos/models)
- [Tiers] Kling 3.0 : génération native 2K et 4K revendiquée, 30 i/s (60 i/s non confirmé), ≤ 15 s — [CineD, 05/02/2026](https://www.cined.com/kling-3-0-ai-video-model-introduced-native-4k-enhanced-photorealism-multi-shot-sequencing-and-integrated-audio/)
- [Tiers] Kling 4.0 : 3–30 s, 720p/1080p/4K, 21:9 / 16:9 / 1:1 / 9:16 / Auto ; Flash 3–20 s en 720p — [fal, 29/09/2026](https://fal.ai/learn/tools/what-is-kling-4-0)
- [A-équipe] Kling-Avatar : jusqu'à 1080p et 48 i/s ; KlingAvatar 2.0 : jusqu'à 5 min — [arXiv 2509.09595](https://arxiv.org/abs/2509.09595) ; [arXiv 2512.13313](https://arxiv.org/abs/2512.13313)
- [A] Kling-Omni : 150 → 10 évaluations du réseau après distillation (ordre de grandeur du gain de vitesse) — [arXiv 2512.16776](https://arxiv.org/abs/2512.16776)
- [A] Grok Imagine : 1–15 s (défaut 8) ; 480p (défaut), 720p, 1080p — 1080p natif en 1.5 (t2v, i2v), 1.5-lite = 1080p par **upscaling du 720p**, référence→vidéo ≤ 720p, montage ≤ 720p ; formats 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9, 5:2 ; i2v = format de l'image d'entrée ; asynchrone, « typically takes up to several minutes » — [docs xAI](https://docs.x.ai/developers/model-capabilities/video/generation)
- [A] OpenRouter : Grok Imagine Video (classique) « 1–15 seconds, **24 fps** », tailles dont 480×854 et 720×1280 — [OpenRouter JSON](https://openrouter.ai/api/v1/videos/models)
- [Tiers] Grok Imagine 1.5 : préversion fin mai / API 03/06/2026, diffusion large le 17/06/2026 ; variante rapide de l'app : 6 s en 720p en ≈ 25 s — [Digital Today](https://www.digitaltoday.co.kr/en/view/67872/xai-releases-grok-imagine-video-1-5-ai-video-maker) ; [Musk sur X](https://x.com/elonmusk/status/2067093666792136855) ; [Digg](https://digg.com/tech/uv16t77f)
- [Tiers] Replicate : 5–8 s = plage la plus stable pour Grok Imagine — [Replicate](https://replicate.com/xai/grok-imagine-video)
- [A] OpenRouter (tous modèles vidéo) : génération « 30 seconds to several minutes » (notes du 14/10/2026) — [doc vidéo OpenRouter](https://openrouter.ai/docs/guides/overview/multimodal/video-generation.md)

### Inferences
- [B] Le 4K de Veo (et le 1080p de Grok Lite) est un **étage d'upscaling** ; la génération « réelle » se fait à ≤ 1080p — à retenir pour notre moteur : générer en basse résolution puis super-résoudre (comme Kling-Omni et KlingAvatar 2.0).
- [B] Tous produisent ≤ 15 s par appel (Kling 4.0 : 30 s annoncés) ; les durées longues passent par **extension** (Veo, Grok classique) ou **cascade 1re/dernière image** (Kling-Avatar), pas par une génération unique.

### Gaps
- i/s de Kling 3.0 et Grok 1.5 sur page officielle : non trouvés (24 i/s Grok = OpenRouter ; 30 i/s Kling = presse).
- Temps de génération officiel de Kling : non publié.

## 5. Accès et prix (oct. 2026) : API officielles, OpenRouter, fal, Replicate — prix à la seconde

### Takeaway
Les trois sont accessibles **à l'usage** : Veo via **Gemini API / Vertex AI** (0,05–0,60 $/s selon variante/résolution, audio
toujours actif côté Google), Grok via **API xAI** (0,02 / 0,05 / 0,08 $/s au tarif de base), Kling via API Kling (prépayée, page
illisible) ou agrégateurs. **OpenRouter** (lu le 16/10/2026) liste `google/veo-3.1`, `-fast`, `-lite`, `kwaivgi/kling-v3.0-std`,
`-pro`, `kwaivgi/kling-video-o1`, `x-ai/grok-imagine-video`, `-1.5`, `-1.5-lite` — mais **ni Gemini Omni, ni Kling O3, ni Kling 4.0,
ni Kling Avatar**. Moins cher par seconde : Grok 1.5 Lite (0,02 $/s 480p) ; Veo 3.1 Lite muet (0,03 $/s 720p) ; Kling 3.0 Std
muet (0,084 $/s).

### Cited Findings
- [A] **OpenRouter, relu le 16/10/2026** (`pricing_skus`) — [OpenRouter JSON](https://openrouter.ai/api/v1/videos/models) :

| ID OpenRouter (date d'ajout) | Durées | Résolutions / formats | Prix |
|---|---|---|---|
| `google/veo-3.1` (23/03/2026) | 4/6/8 s | 720p, 1080p, 4K ; 16:9, 9:16 | 0,40 $/s avec audio, 0,20 sans ; 4K 0,60 / 0,40 |
| `google/veo-3.1-fast` (24/04/2026) | 4/6/8 s | idem | 720p 0,10 (audio) / 0,08 ; 1080p 0,12 / 0,10 ; 4K 0,30 / 0,25 |
| `google/veo-3.1-lite` (23/04/2026) | 4/6/8 s | 720p, 1080p | 720p 0,05 / **0,03** ; 1080p 0,08 / 0,05 |
| `kwaivgi/kling-v3.0-std` (29/04/2026) | 3–15 s | 720p ; 16:9, 9:16, 1:1 | 0,084 $/s, 0,126 avec audio ; passthrough `negative_prompt`, `cfg_scale` |
| `kwaivgi/kling-v3.0-pro` (29/04/2026) | 3–15 s | idem | 0,112 $/s, 0,168 avec audio |
| `kwaivgi/kling-video-o1` (20/04/2026) | 5, 10 s | 720p | 0,112 $/s |
| `x-ai/grok-imagine-video` (18/05/2026) | 1–15 s | 480p, 720p ; 7 formats | 0,05 / 0,07 $/s + 0,002 $/image |
| `x-ai/grok-imagine-video-1.5` (20/07/2026) | 1–15 s | 480p, 720p, 1080p | 0,08 / 0,14 / 0,25 $/s + 0,01 $/image |
| `x-ai/grok-imagine-video-1.5-lite` (06/10/2026) | 1–15 s | 480p, 720p, 1080p | **0,02** / 0,03 / 0,14 $/s + 0,01 $/image |

- [A] xAI officiel : `grok-imagine-video-1.5` **0,080 $/s**, `grok-imagine-video` **0,050 $/s**, `grok-imagine-video-1.5-lite` **0,020 $/s** (taux unique, sans détail par résolution) — [modèles xAI](https://docs.x.ai/developers/models) ; les requêtes refusées pour violation sont facturées (notes du 14/10/2026) — [tarifs xAI](https://docs.x.ai/developers/pricing)
- [A] Gemini API (notes du 14/10/2026) : Veo 3.1 0,40 $/s (720p/1080p), 0,60 $/s (4K) ; Fast 0,10 / 0,12 / 0,30 ; Lite 0,05 (720p) / 0,08 (1080p) ; pas de palier gratuit pour Veo ; Omni Flash ≈ 0,10 $/s en 720p (17,50 $/M jetons de sortie) — [tarifs Gemini](https://ai.google.dev/gemini-api/docs/pricing)
- [A] Veo est publié sur Gemini API, Vertex AI, Flow, Gemini app, YouTube Shorts, Google Vids ; upscaling 1080p/4K seulement dans Flow, Gemini API, Vertex AI — [Google blog, 13/01/2026](https://blog.google/innovation-and-ai/technology/ai/veo-3-1-ingredients-to-video/)
- [Tiers] fal : Kling 3.0 Pro **0,112 $/s** muet, 0,168 avec audio, **0,196 avec audio + contrôle de voix** — [fal Kling v3 Pro](https://fal.ai/models/fal-ai/kling-video/v3/pro/text-to-video) ; Kling Avatar v2 Pro 0,115 $/s, Std 0,0562 $/s — [fal Kling Avatar](https://fal.ai/models/fal-ai/kling-video/ai-avatar/v2/pro) ; l'API de prix fal (`/v1/models/pricing`) exige une clé (vérifié le 16/10/2026).
- [Tiers] Replicate héberge `xai/grok-imagine-video` (prix non affiché sur la page lue) — [Replicate](https://replicate.com/xai/grok-imagine-video)
- [Tiers] Kling officiel : paquets prépayés ; page de prix kling.ai/dev non lisible (JS) ; plus petit paquet d'essai cité 9,80 $ / 100 unités (tiers, notes du 14/10/2026) — [Atlas Cloud](https://www.atlascloud.ai/blog/guides/kling-ai-api-pricing)
- [Tiers] Classements Artificial Analysis (image→vidéo, snapshot récent via recherche) : Grok Imagine Video 1.5 ≈ 1068 Elo, Veo 3.1 ≈ 1031 ± 17, Kling 3.0 Omni 1080p Pro ≈ 1004 ± 18 ; les snapshots varient fortement selon la date — [AA I2V leaderboard](https://artificialanalysis.ai/video/leaderboard/image-to-video)

### Inferences
- [B] OpenRouter facture un prix « sans audio » pour Veo alors que la Gemini API indique audio « Always on » : soit OpenRouter passe par Vertex (où l'audio est désactivable), soit il applique un SKU spécifique ; à vérifier avec `usage.cost` sur un appel test avant de compter dessus.
- [B] Pour un banc A/B de la troupe, OpenRouter suffit pour Veo 3.1 Lite/Fast, Kling 3.0 et Grok (1re image) ; les modes **références de personnages** imposent l'API officielle (Gemini API pour Veo 3.1 Ingredients, xAI pour Grok 1.5 référence) ou fal (Kling elements / avatar).

### Gaps
- Prix officiels Kling (vidéo 3.0, Omni/O3, Avatar, lip-sync) : non lisibles.
- Prix de Kling 4.0 : non publiés au 16/10/2026 (« coming to fal soon »).
- Prix Vertex AI de Veo (et option audio coupé) : non relus dans cette session.

## 6. Limites connues : dérive des personnages, mains, texte, cartoon, peaux noires / personnages africains, dialogue en français

### Takeaway
Officiellement : Veo 3 **penche vers les peaux claires** quand l'origine n'est pas précisée, est **mauvais en texte** à l'image,
a un **biais « cinéma » (coupes fréquentes, angles dramatiques)** et peine sur la cohérence des scènes complexes ; Omni Flash
signale la même chose (mouvements complexes, cohérence entre montages, texte). Kling documente la **dérive d'identité** des
méthodes à « motion frames » et la contourne par cascades 1re/dernière image et bibliothèques de sujets ; ses bancs internes
incluent des **personnages cartoon/anime**. Grok : aucune limite officielle publiée. Français : **non garanti** chez Veo (anglais
seul évalué), absent de la liste Kling 3.0, annoncé pour Kling 4.0, inconnu chez Grok.

### Cited Findings
- [A] Veo 3 : « this model appears to **skew towards lighter skin tones** when race is not specified in the prompt » (évaluation sur 140 métiers × 16 vidéos, échelle de Monk) ; risque de « semantic bias » (termes corrélés à tort à des groupes) — [Veo 3 Tech Report](https://storage.googleapis.com/deepmind-media/veo/Veo-3-Tech-Report.pdf) ; idem fiche modèle — [Veo 3 Model Card](https://storage.googleapis.com/deepmind-media/Model-Cards/Veo-3-Model-Card.pdf)
- [A] Veo 3 « is still poor at generating text » et « prone to small hallucinations » ; « a bias for generating cinematic footage, with frequent camera cuts and dramatic camera angles » — [Veo 3 Tech Report](https://storage.googleapis.com/deepmind-media/veo/Veo-3-Tech-Report.pdf)
- [A] « maintaining complete consistency throughout complex scenes or those with complex motion, remains a challenge » ; Veo 3 simule « a wide range of visual styles » — [Veo 3 Model Card](https://storage.googleapis.com/deepmind-media/Model-Cards/Veo-3-Model-Card.pdf)
- [A] Omni Flash : défis = « generating scenes with complex motion », cohérence à travers les montages, texte exact ; la fiche ne traite pas des biais de couleur de peau — [Fiche Omni Flash](https://deepmind.google/models/model-cards/gemini-omni-flash/)
- [A] Veo 3.1 : dialogue « English (EN) is fully supported, but other languages have not been evaluated » ; i2v / références = `allow_adult` seulement (et seule valeur permise en UE, R-U, Suisse, MENA) — [doc Veo](https://ai.google.dev/gemini-api/docs/veo)
- [Tiers] Formation française : seul Veo 3.1 Fast gère « nativement » le français ; la plupart des modèles prennent un **accent québécois** par défaut sauf si « accent parisien » est précisé ; écart entre durée du clip et longueur de la phrase → mots inventés ou désynchronisation — [Elephorm](https://www.elephorm.com/formation/maitriser-magnific-2026-les-fondamentaux/creer-des-videos-animees-avec-synchronisation-labiale-en-ia)
- [A-équipe] Kling-Avatar : les méthodes à « motion frames » souffrent d'« identity drift » ; la génération parallèle conditionnée 1re/dernière image l'atténue — [arXiv 2509.09595](https://arxiv.org/abs/2509.09595) ; KlingAvatar 2.0 vise « temporal drifting, quality degradation, and a weak prompt following » des longues vidéos — [arXiv 2512.13313](https://arxiv.org/abs/2512.13313)
- [A] Kling-Omni : banc OmniVideo-1.0 de 500+ cas dont catégorie « **cartoon characters** » et défi « cross-style integration » ; filtres de données avec « strict character identity consistency checks » pour les tâches centrées sur l'humain ; comparaison GSB favorable face à **Veo 3.1** (références image) et Runway Aleph (montage) — résultats agrégés, non ventilés par catégorie — [arXiv 2512.16776](https://arxiv.org/abs/2512.16776)
- [A-équipe] Banc Kling-Avatar : « 340 human portraits of **different races** » (répartition non publiée) + 35 cas cartoon/anime/animaux — [arXiv 2509.09595](https://arxiv.org/abs/2509.09595)
- [Tiers] Kling 3.0 : image de référence pour réduire la « feature drift » — [CineD](https://www.cined.com/kling-3-0-ai-video-model-introduced-native-4k-enhanced-photorealism-multi-shot-sequencing-and-integrated-audio/)
- [A] Grok Imagine : modération pouvant filtrer les sorties (`respect_moderation`), URLs temporaires — [docs xAI](https://docs.x.ai/developers/model-capabilities/video/generation) ; filigranes ajoutés dans les pays qui l'exigent — [Latent Space](https://www.latent.space/p/video-agents)

### Inferences
- [B] Pour des **personnages africains** : avec Veo, toujours décrire explicitement la carnation (biais documenté vers les peaux claires) et fournir des images de référence ; aucune donnée équivalente pour Kling et Grok → à mesurer nous-mêmes.
- [B] Le biais « coupes de caméra fréquentes » de Veo est gênant pour un plan de dialogue cartoon : préciser « single continuous shot, static camera » et épingler 1re/dernière image.
- [B] Les cartoons sont **dans la distribution d'évaluation** de Kling (Omni, Avatar) — c'est le seul des trois avec une preuve publique (même agrégée) de test sur personnages stylisés.
- [C] SPÉCULATION : les mains et le texte restent faibles chez les trois (Veo l'écrit pour le texte ; aucun des trois ne publie de mesure sur les mains).

### Gaps
- Aucun banc indépendant sur personnages cartoon récurrents, mains, ou carnations foncées pour Kling et Grok.
- Qualité mesurée du dialogue en français (prononciation, lip-sync) : aucune source fiable pour aucun des trois.
- Limites officielles de Grok Imagine (dérive, texte, mains) : non publiées.

## 7. Données d'entraînement et calcul : est-il réaliste de les « recréer » ?

### Takeaway
Aucun des trois ne publie volume de données, taille de modèle ou budget de calcul. Ce qui est public : Veo = images + vidéos +
audio **légendés par plusieurs modèles Gemini**, filtrés et dédupliqués sémantiquement, sur **pods TPU** ; Kling = données réelles
+ **données synthétiques** produites par ses propres modèles d'édition/compréhension, entraînement GPU massivement parallèle (PP/DP/
Ulysses, 97 % de temps utile) ; Grok = « no infra, no data, no model » au départ (mi-2025), 0.9 en 3 mois, sur l'infrastructure
xAI. Les repères publics comparables (Seaweed-7B : 665 000 h·H100 ; Movie Gen : 30 Md de paramètres ; Open-Sora 2.0 : 200 k$)
montrent qu'un modèle de base « niveau commercial » coûte de 0,2 à plusieurs M$ de calcul : **recréer un Veo/Kling from scratch
n'est pas réaliste** pour nous ; **reprendre leurs recettes** (références multi-vues, cascade 1re/dernière image, audio par
cross-attention, distillation) sur un modèle ouvert fine-tuné est réaliste.

### Cited Findings
- [A] Veo 3 : « large dataset comprising images, videos, and associated annotations », légendes « at different levels of detail, leveraging multiple Gemini models », filtres sécurité / PII / qualité, déduplication sémantique « across sources » ; légendes synthétiques pour diversifier les concepts — [Veo 3 Tech Report](https://storage.googleapis.com/deepmind-media/veo/Veo-3-Tech-Report.pdf)
- [A] Veo 3 : TPU Pods, JAX, ML Pathways ; aucun volume ni compute chiffré — [Veo 3 Model Card](https://storage.googleapis.com/deepmind-media/Model-Cards/Veo-3-Model-Card.pdf)
- [A-équipe] DeepMind montre que Veo 3 résout sans entraînement dédié segmentation, détection de contours, édition d'images, propriétés physiques, labyrinthes — signe d'un modèle à très grande échelle — [arXiv 2509.20328](https://arxiv.org/abs/2509.20328)
- [A] Kling-Omni : collecte « large-scale real-world data » + minage internet par « in-house embedding model » de paires sémantiquement liées / « subject-consistent » ; données synthétiques via « in-house image editing and video understanding models » et « automatic reverse synthesis » pour la référence→vidéo ; filtres : seuils résolution/durée, empreintes image/temps, corruption audio-vidéo, NSFW, flou/tremblement, coupes de scène, « low action semantic density », alignement légende-vidéo et référence-vidéo — [arXiv 2512.16776](https://arxiv.org/abs/2512.16776)
- [A] Kling-Omni, infrastructure : parallélisme pipeline + données + Ulysses élastique par micro-lot, all-to-all à deux niveaux, recalcul sélectif, déport CPU, détection de blocage RDMA, « 97% Effective Training Time Ratio » — [arXiv 2512.16776](https://arxiv.org/abs/2512.16776)
- [A-équipe] Kling-Avatar : des milliers d'heures brutes → **centaines d'heures** retenues ; « data quality, rather than data scale, plays a decisive role » — [arXiv 2509.09595](https://arxiv.org/abs/2509.09595)
- [A-équipe] FullDiT (recherche Kuaishou) : modèle ~1B entraîné sur 64 H800 (≈ 32 000 pas pour une tâche caméra) — [arXiv 2503.19907](https://arxiv.org/abs/2503.19907)
- [A] Échelle commerciale de Kling : revenus annualisés de **240 M$ en décembre 2025** — [Kuaishou IR](https://kuaishou.gcs-web.com/news-releases/news-release-details/kling-ai-annualized-revenue-run-rate-hits-usd240-million)
- [A] Grok Imagine a généré « 1.245 billion videos in the last 30 days » (févr. 2026) — [xAI sur X](https://x.com/xai/status/2018164753810764061)
- [Tiers] Ethan He : stockage d'≈ 1 milliard de vidéos à ≈ 5 Mo ≈ 5 Po, plus autant en latents ; coût d'entraînement vidéo « comparable with LLMs » (propos généraux, pas propres à xAI) — [Latent Space](https://www.latent.space/p/video-agents)
- [A, repère externe] **Seaweed-7B** (ByteDance) : « approximately 7 billion parameters […] trained from scratch using **665,000 H100 GPU hours** » — [arXiv 2504.08685](https://arxiv.org/abs/2504.08685)
- [A, repère externe] **Movie Gen** (Meta) : « largest video generation model is a **30B parameter** transformer trained with a maximum context length of 73K video tokens », 16 s à 16 i/s, 1080p — [arXiv 2410.13720](https://arxiv.org/abs/2410.13720)
- [A, repère externe] **Open-Sora 2.0** : « commercial-level video generation model trained for only **$200k** », jugé comparable à HunyuanVideo et Runway Gen-3 Alpha — [arXiv 2503.09642](https://arxiv.org/abs/2503.09642)

### Inferences
- [B] Ordre de grandeur : 665 000 h·H100 à ~2 $/h ≈ 1,3 M$ pour un modèle 7B ; Veo/Kling de production sont vraisemblablement au-delà (taille inconnue, audio joint, 4K, RL humain). Même le bas de fourchette (Open-Sora 2.0, 200 k$, niveau Gen-3 Alpha de 2024) dépasse de loin un budget de studio indépendant, sans compter la collecte et le légendage de dizaines de millions de clips.
- [B] Ce qui est **transposable à notre échelle** (fine-tuning d'un modèle ouvert existant sur la troupe) : (1) référence multi-vues par personnage injectée comme jetons de condition (Kling-Omni subject library) ; (2) cascade « blueprint basse résolution → images clés → sous-clips 1re/dernière image → super-résolution » (Kling-Avatar / 2.0) ; (3) audio Whisper en cross-attention à fenêtre glissante + perte renforcée sur la bouche, texte gelé (Kling-Avatar) ; (4) MLLM qui réécrit le prompt (Kling-Omni PE, Veo légendé par Gemini) ; (5) DPO sur paires jugées par nous ; (6) distillation peu de pas pour l'inférence. Kling-Avatar montre qu'**un petit volume très propre (centaines d'heures)** suffit pour l'étape spécialisée — à l'échelle d'une troupe, quelques heures de clips propres par personnage relèvent du LoRA, pas du pré-entraînement.
- [C] SPÉCULATION : Grok Imagine 0.9 « en 3 mois avec quelques ingénieurs » n'est pas un contre-exemple pour nous : il s'appuie sur le calcul et les pipelines de données d'xAI (Colossus) et probablement sur un modèle image existant.

### Gaps
- Volume (heures / nombre de clips) et calcul d'entraînement de Veo, Kling, Grok : non publiés ; aucune estimation crédible trouvée (le « 110 000 GB200 » de MindStudio n'a aucune source xAI).
- Licences / provenance des données (YouTube pour Veo ? Kuaishou pour Kling ? X pour Grok ?) : non divulguées dans les documents lus.
