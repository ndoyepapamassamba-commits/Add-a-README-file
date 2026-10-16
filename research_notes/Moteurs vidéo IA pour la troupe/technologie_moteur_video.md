# La technologie « moteur » des générateurs vidéo (texte→vidéo, image→vidéo, audio-vidéo), état au 16/10/2026

Méthode : sources lues le 16/10/2026 (rapports techniques arXiv en HTML, README GitHub, fiches Hugging Face, fichiers de
configuration du code officiel). Les chiffres marqués **(dérivé)** sont de simples calculs faits à partir de chiffres
cités (multiplications, divisions), pas des mesures publiées. « Fermé » = modèle propriétaire dont l'architecture
n'est pas publiée (Veo, Kling, Sora, Seedance) : on ne rapporte que ce que l'éditeur a écrit. Le catalogue détaillé des
modèles ouverts (licences, variantes) et l'outillage cohérence-personnage / lip-sync sont traités par d'autres
chercheurs ; ici on se limite aux mécanismes et aux chiffres. Notes de fond consultées (orientation seulement) :
`scratchpad/repo/research_notes/Animer Blender par prompt/modeles_video_ouverts_pilotes.md`.

---

## Q1 — Le pipeline : encodeur de texte, VAE vidéo, réseau de diffusion (DiT), objectif d'entraînement, échantillonnage, guidance

### Takeaway
Tous les moteurs publiés en 2024-2026 suivent la même recette : (1) un **encodeur de texte** gelé (T5/umT5 puis, de plus
en plus, un LLM/VLM : Qwen2.5-VL, Gemma 3/4, MLLM maison) ; (2) un **VAE vidéo 3D causal** qui comprime la vidéo
(4× en temps × 8×8 en espace × 16 canaux en 2024-25 ; 4×16×16 avec 32-48 canaux, voire 8×32×32 avec 128 canaux, en
2025-26) ; (3) un **Transformer de diffusion (DiT)** à attention 3D complète sur des « patchs » 1×2×2 de latents, avec
RoPE 3D, conditionné par cross-attention (Wan, Movie Gen) ou par flux joints texte+vidéo (MMDiT : HunyuanVideo,
Open-Sora 2.0) ; (4) un objectif **flow matching / rectified flow** (prédiction de vitesse, temps tiré en logit-normal) ;
(5) ~40-50 pas d'un solveur ODE (Euler, UniPC) avec « shift » du calendrier, et **CFG** d'échelle ~5-7,5. Veo 3 (fermé)
confirme publiquement le même schéma « diffusion latente + débruiteur Transformer », appliqué conjointement à l'audio et
à la vidéo.

### Cited Findings

**Schéma général (y compris modèles fermés)**
- Sora (OpenAI, rapport « Video generation models as world simulators », 15/02/2024) : un réseau compresse la vidéo en
  un latent compressé « in time and space », un décodeur ramène les latents en pixels ; le latent est découpé en
  « spacetime patches » qui servent de jetons au Transformer ; une image = une vidéo d'une image ; Sora est « a diffusion
  transformer » qui prédit les patchs propres à partir de patchs bruités + texte ; entraînement à la résolution/au
  format natif plutôt que recadré ; le rapport précise que les détails d'implémentation ne sont pas publiés —
  [OpenAI](https://openai.com/index/video-generation-models-as-world-simulators/) (page lue via résultats de recherche ;
  accès direct refusé en 403).
- Veo 3 (Google DeepMind, « Veo 3 Tech Report ») : « Veo 3 uses latent diffusion, in which the diffusion process is
  applied jointly to the temporal audio latents, and the spatio-temporal video latents. Video and audio are encoded by
  respective autoencoders… a transformer-based denoising network is optimized to remove noise from noisy latent
  vectors » ; légendes à plusieurs niveaux de détail produites par « multiple Gemini models », filtrage sécurité/qualité,
  déduplication sémantique ; aucun chiffre (taille, VAE, données, calcul) — [Veo 3 Tech Report (PDF)](https://storage.googleapis.com/deepmind-media/veo/Veo-3-Tech-Report.pdf).
- Kling-Omni (Kuaishou, arXiv 18/12/2025) : « a diffusion transformer aligned with a vision-language model », jetons
  visuels et textuels dans un espace d'embedding partagé, entrées aplaties en séquences 1D ; un « Prompt Enhancer » basé
  sur un MLLM ; un étage de super-résolution en cascade ; **non divulgués** : nombre de paramètres, VAE, encodeur de
  texte, profondeur/largeur du DiT, données, GPU — [arXiv 2512.16776](https://arxiv.org/html/2512.16776v1).

**Encodeurs de texte (par modèle)**
- Wan 2.1 (code 25/02/2025, rapport 21/03/2025) : umT5-XXL (multilingue), `text_len = 512` jetons, bf16 ; injection par
  cross-attention — [config Wan2.1 shared_config.py](https://raw.githubusercontent.com/Wan-Video/Wan2.1/main/wan/configs/shared_config.py),
  [arXiv 2503.20314](https://arxiv.org/html/2503.20314). L'encodeur de texte occupe « over 20 GB » de mémoire GPU —
  [arXiv 2503.20314](https://arxiv.org/html/2503.20314).
- HunyuanVideo (03/12/2024) : MLLM décodeur-seul + « bidirectional token refiner », plus le dernier jeton non-padding de
  CLIP-Large comme guidance globale — [arXiv 2412.03603](https://arxiv.org/html/2412.03603).
- HunyuanVideo 1.5 (v2 25/11/2025) : Qwen2.5-VL + Glyph-ByT5 (rendu de texte à l'image) — [arXiv 2511.18870](https://arxiv.org/html/2511.18870v2).
- Movie Gen (Meta, 04/10/2024) : trois encodeurs concaténés — UL2, ByT5 (texte visuel seulement), MetaCLIP « long
  prompt » (77→256 jetons), chacun projeté en 6144 dims — [arXiv 2410.13720](https://arxiv.org/html/2410.13720).
- CogVideoX (08/2024) : T5, 226 jetons — [arXiv 2408.06072](https://arxiv.org/html/2408.06072).
- Open-Sora 2.0 (03/2025) : T5-XXL + CLIP-Large — [arXiv 2503.09642](https://arxiv.org/html/2503.09642).
- Seedance 1.0 (ByteDance, 06/2025) : « a fine-tuned decoder-only LLM as the text encoder » ; réécriture de prompt par un
  modèle basé sur Qwen2.5-14B — [arXiv 2506.09113](https://arxiv.org/html/2506.09113).
- Step-Video-T2V (14/02/2025) : deux encodeurs bilingues (anglais/chinois) — [arXiv 2502.10248](https://arxiv.org/abs/2502.10248).
- LTX-2 (Lightricks, 06/01/2026) : Gemma3-12B, caractéristiques extraites de **toutes** les couches du décodeur puis
  projetées, « text connector » à attention bidirectionnelle avec « thinking tokens », un connecteur par flux — [arXiv 2601.03233](https://arxiv.org/html/2601.03233v1).
  Les checkpoints LTX-2.5 (recommandés en 2026) utilisent « Gemma 4 12B, fine-tuned for LTX » ; Gemma 3 seulement pour
  l'ancien LTX-2.3 — [GitHub Lightricks/LTX-2](https://github.com/Lightricks/LTX-2).
- Réécriture de prompt (étage amont standard) : Wan → Qwen2.5-Plus ; HunyuanVideo → Hunyuan-Large (puis LoRA) ; Movie
  Gen → Llama3-70B distillé en 8B — [arXiv 2503.20314](https://arxiv.org/html/2503.20314), [arXiv 2412.03603](https://arxiv.org/html/2412.03603), [arXiv 2410.13720](https://arxiv.org/html/2410.13720).

**VAE vidéo (compression temps × hauteur × largeur, canaux latents)**
- Wan-VAE (2.1) : VAE 3D **causal**, 4×8×8, **16 canaux**, **127 M paramètres** ; latent de forme (1+T/4)×H/8×W/8 ; la
  1re image n'est compressée que spatialement ; obtenu en « gonflant » un VAE 2D image en 3D ; perte L1 (3) + KL (3e-6)
  + LPIPS (3), puis GAN avec discriminateur 3D ; GroupNorm remplacé par RMSNorm pour préserver la causalité ; « feature
  cache » par blocs de ≤ 4 images (2 images en cache) pour encoder des vidéos de longueur arbitraire ; 2,5× plus rapide
  que le VAE HunyuanVideo — [arXiv 2503.20314](https://arxiv.org/html/2503.20314).
- HunyuanVideo : 4×8×8, C = 16, entraîné de zéro, mélange vidéo:image 4:1, perte L1 + 0,1·LPIPS + 0,05·adv + 1e-6·KL ;
  tuilage spatio-temporel à l'inférence ; PSNR 33,14 (ImageNet 256) / 35,39 (MCL-JCV) — [arXiv 2412.03603](https://arxiv.org/html/2412.03603).
- CogVideoX : 4×8×8, 16 canaux ; VAE entraîné sur 17 images 256×256 puis affiné sur 161 images — [arXiv 2408.06072](https://arxiv.org/html/2408.06072).
- Movie Gen « TAE » : **8×8×8**, 16 canaux, « outlier penalty loss » ; tuilage 32 images (encodeur) — [arXiv 2410.13720](https://arxiv.org/html/2410.13720).
- Step-Video-T2V : Video-VAE 16×16 spatial, 8× temporel, jusqu'à 204 images — [arXiv 2502.10248](https://arxiv.org/abs/2502.10248).
- LTX-Video (30/12/2024) : ratio **1:192**, 32×32×8 pixels par jeton ; le « patchify » est déplacé dans le VAE ; le
  décodeur du VAE fait aussi la dernière étape de débruitage — [arXiv 2501.00103](https://arxiv.org/abs/2501.00103).
- Wan2.2-VAE (TI2V-5B, 28/07/2025) : 4×16×16 (« compression rate of 64 »), 4×32×32 avec la couche de patchification ;
  `z_dim=48` (48 canaux) dans le code source — [HF Wan-AI/Wan2.2-TI2V-5B](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B),
  [code vae2_2.py](https://raw.githubusercontent.com/Wan-Video/Wan2.2/main/wan/modules/vae2_2.py).
- HunyuanVideo 1.5 : 3D causal, 16× spatial, 4× temporel, **32 canaux** — [arXiv 2511.18870](https://arxiv.org/html/2511.18870v2).
- Seedance 1.0 : (rt, rh, rw) = (4, 16, 16), **C = 48**, temporellement causal ; la patchification du DiT est supprimée à
  cause du fort sous-échantillonnage — [arXiv 2506.09113](https://arxiv.org/html/2506.09113).
- Open-Sora 2.0 « Video DC-AE » : 4×32×32, 128 canaux (variante 256) ; pour 5 s à 24 i/s en 768 px : 76 K jetons avec le
  VAE HunyuanVideo contre 19 K avec Video DC-AE ; ×5,2 débit d'entraînement, > ×10 à l'inférence — [arXiv 2503.09642](https://arxiv.org/html/2503.09642).
- MAGI-1 (Sand AI, 21/04/2025) : VAE à base de Transformer, 8× spatial, 4× temporel — [GitHub SandAI-org/MAGI-1](https://github.com/SandAI-org/MAGI-1).

**Backbone de diffusion (DiT / MMDiT), patchs, positions**
- Wan 2.1 : patchify par conv 3D noyau (1,2,2) → L = (1+T/4)·H/16·W/16 jetons ; attention spatio-temporelle **complète** ;
  texte par **cross-attention** ; un MLP partagé (Linear+SiLU) prédit les 6 paramètres de modulation AdaLN pour tous les
  blocs (≈ 25 % de paramètres en moins) — [arXiv 2503.20314](https://arxiv.org/html/2503.20314). Configs : **1.3B** = dim
  1536, FFN 8960, 12 têtes, 30 couches ; **14B** = dim 5120, FFN 13824, 40 têtes, 40 couches ; entrée/sortie 16 canaux,
  `qk_norm=True` — [GitHub Wan2.1](https://github.com/Wan-Video/Wan2.1), [config wan_t2v_14B.py](https://raw.githubusercontent.com/Wan-Video/Wan2.1/main/wan/configs/wan_t2v_14B.py).
- Wan2.2 TI2V-5B : dim 3072, FFN 14336, 24 têtes, 30 couches, patch (1,2,2), 121 images à 24 i/s — [config wan_ti2v_5B.py](https://raw.githubusercontent.com/Wan-Video/Wan2.2/main/wan/configs/wan_ti2v_5B.py).
- Wan2.2 A14B (28/07/2025) : **Mixture-of-Experts** par niveau de bruit — un expert « high-noise » (mise en place globale)
  et un expert « low-noise » (détails), ≈ 14B chacun, ≈ 27B au total, ≈ 14B actifs par pas ; bascule au pas où le SNR
  passe sous la moitié de SNR_min — [GitHub Wan2.2](https://github.com/Wan-Video/Wan2.2), [HF Wan2.2-TI2V-5B](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B).
- HunyuanVideo (13B+) : hybride « dual-stream puis single-stream » (style MMDiT/Flux) — 20 blocs double flux + 40 blocs
  simple flux, dim 3072, FFN 12288, 24 têtes × 128 ; attention complète unifiée (pas factorisée) ; RoPE 3D avec canaux
  répartis 16/56/56 sur (T, H, W) — [arXiv 2412.03603](https://arxiv.org/html/2412.03603).
- Open-Sora 2.0 (11B) : MMDiT hybride 19 blocs double flux + 38 simple flux, dim 3072, FFN 12288, 24 têtes, patch 2
  (patch 1 avec Video DC-AE) ; initialisé depuis Flux — [arXiv 2503.09642](https://arxiv.org/html/2503.09642).
- HunyuanVideo 1.5 (8.3B) : 54 blocs, dim 2048, FFN 8192, 16 têtes × 128 — [arXiv 2511.18870](https://arxiv.org/html/2511.18870v2).
- Movie Gen Video (30B) : Transformer style Llama 3 — 48 couches, dim 6144, FFN 16384, 48 têtes, SwiGLU, RMSNorm ;
  patchs 2×2 (k_t = 1) ; cross-attention texte dans chaque bloc ; AdaLN pour le pas de temps ; attention complète
  bidirectionnelle — [arXiv 2410.13720](https://arxiv.org/html/2410.13720).
- CogVideoX : « expert transformer » (expert adaptive LayerNorm), attention 3D complète, RoPE 3D réparti 3/8 (x), 3/8 (y),
  2/8 (t) ; 2B = 30 couches, 32 têtes, dim 1920 ; 5B = 42 couches, 48 têtes, dim 3072 — [arXiv 2408.06072](https://arxiv.org/html/2408.06072).
- Seedance 1.0 : couches spatiales et temporelles **découplées** (attention temporelle par fenêtres), texte seulement dans
  les couches spatiales, MMDiT façon SD3 ; « Multi-shot MM-RoPE » (RoPE 3D vidéo + RoPE 1D texte) pour des séquences
  multi-plans entrelacées — [arXiv 2506.09113](https://arxiv.org/html/2506.09113).
- Step-Video-T2V : 30B, DiT à attention 3D complète — [arXiv 2502.10248](https://arxiv.org/abs/2502.10248).
- Lois d'échelle HunyuanVideo : famille DiT-T2X de 92M à 6,6B paramètres, ajustement de lois de puissance image et
  vidéo ; taille finale retenue 13B — [arXiv 2412.03603](https://arxiv.org/html/2412.03603).

**Objectif d'entraînement**
- Wan : flow matching / rectified flow, x_t = t·x1 + (1−t)·x0, cible vitesse x1 − x0, perte MSE, t tiré en
  **logit-normal** sur [0,1] ; AdamW, wd 1e-3, lr 1e-4, bf16 — [arXiv 2503.20314](https://arxiv.org/html/2503.20314).
- HunyuanVideo : flow matching, t logit-normal, MSE sur la vitesse — [arXiv 2412.03603](https://arxiv.org/html/2412.03603).
  Movie Gen : flow matching, σ_min = 1e-5, t logit-normal — [arXiv 2410.13720](https://arxiv.org/html/2410.13720).
  Step-Video : flow matching — [arXiv 2502.10248](https://arxiv.org/abs/2502.10248).
- Alternative « ancienne génération » : CogVideoX utilise **v-prediction + zero SNR** (famille DDPM, calendrier LDM),
  « Explicit Uniform Sampling » des pas de temps — [arXiv 2408.06072](https://arxiv.org/html/2408.06072).
- HunyuanVideo 1.5 : optimiseur **Muon** (« lower training loss than AdamW in only half the number of training steps »)
  — [arXiv 2511.18870](https://arxiv.org/html/2511.18870v2).

**Échantillonnage, shift, CFG (valeurs par défaut publiées)**
- HunyuanVideo : solveur ODE d'Euler du 1er ordre ; « timestep shift » t' = s·t / (1 + (s−1)·t) avec s = 7 pour 50 pas et
  s = 17 pour < 20 pas — [arXiv 2412.03603](https://arxiv.org/html/2412.03603) ; défauts du dépôt : 50 pas, guidance
  « embedded » 6,0, flow shift 7,0 — [GitHub HunyuanVideo](https://github.com/Tencent-Hunyuan/HunyuanVideo).
- Wan 2.1 : T2V-14B 50 pas, I2V-14B 40 pas ; 1.3B : guide 6, shift 8-12 ; Diffusers : guidance 5,0, flow_shift 5,0 (720p)
  / 3,0 (480p) ; « typically around 50 » pas — [GitHub Wan2.1](https://github.com/Wan-Video/Wan2.1), [arXiv 2503.20314](https://arxiv.org/html/2503.20314).
  Prompt négatif par défaut intégré (en chinois : « couleurs saturées, surexposé, statique, flou, sous-titres… doigts en
  trop… ») — [shared_config.py](https://raw.githubusercontent.com/Wan-Video/Wan2.1/main/wan/configs/shared_config.py).
- Wan2.2 TI2V-5B : 50 pas, guidance 5,0, shift 5,0 — [config wan_ti2v_5B.py](https://raw.githubusercontent.com/Wan-Video/Wan2.2/main/wan/configs/wan_ti2v_5B.py).
- Movie Gen : CFG 7,5 ; calendrier « linear-quadratic » : 50 pas qui émulent 250 pas linéaires (≈ ×20) — [arXiv 2410.13720](https://arxiv.org/html/2410.13720).
- CogVideoX : 50 pas à l'inférence — [arXiv 2408.06072](https://arxiv.org/html/2408.06072). Ovi : solveur UniPC — [arXiv 2510.01284](https://arxiv.org/html/2510.01284).
- LTX-2 : CFG « modality-aware » M̂ = M(x,t,m) + s_t·(M(x,t,m) − M(x,∅,m)) + s_m·(M(x,t,m) − M(x,t,∅)) ; vidéo s_t = 3,
  s_m = 3 ; audio s_t = 7, s_m = 3 — [arXiv 2601.03233](https://arxiv.org/html/2601.03233v1).
- HunyuanVideo : distillation de la CFG (échelle tirée entre 1 et 8) → ≈ ×1,9 — [arXiv 2412.03603](https://arxiv.org/html/2412.03603).
  Wan : mise en cache des sorties non conditionnelles de la CFG — [arXiv 2503.20314](https://arxiv.org/html/2503.20314).

### Inferences
- **Nombre de jetons (dérivé)** : Wan 2.1, 1280×720, 81 images → latent 21×90×160, patchs 2×2 → 21×45×80 ≈ **75 600
  jetons** ; 832×480 → 21×30×52 ≈ 32 760 jetons ; Wan2.2-TI2V-5B 1280×704, 121 images → 31×44×80 latents, patchs 2×2 →
  31×22×40 ≈ 27 280 jetons. Cohérent avec Open-Sora 2.0 (76 K vs 19 K jetons selon le VAE). Comme l'attention complète
  coûte ∝ L², diviser les jetons par 4 divise grossièrement le coût d'attention par 16 : c'est la raison de la course aux
  VAE plus compressifs (16×16, 32×32) en 2025-26.
- **CFG double le calcul** : chaque pas exige une passe conditionnelle et une non conditionnelle ; d'où la distillation
  de CFG (HunyuanVideo, MAGI-1) et les modèles distillés « sans CFG » (guidance 1,0).
- **Tendance encodeur de texte** : T5 (2024) → LLM/VLM multimodaux (2025-26 : Qwen2.5-VL, Gemma 3/4, LLM maison) pour
  mieux comprendre de longs prompts, plusieurs langues et des références d'images.
- **Plan type « recréer un moteur »** (synthèse des configurations ci-dessus) : umT5-XXL ou un VLM 7-12B gelé → VAE 3D
  causal 4×16×16 / 48 canaux → DiT 30-40 couches, dim 3072-5120, attention 3D complète + RoPE 3D, cross-attention texte
  et AdaLN partagé → flow matching logit-normal → 40-50 pas Euler/UniPC avec shift 3-7, CFG 5-6 → distillation 4-8 pas.
- **Pour le créateur non spécialiste** (analogie) : le VAE est un « zip » qui transforme 5 s de vidéo en une petite
  pâte de nombres ; le DiT est un sculpteur qui part d'un bloc de bruit et, en ~50 coups de ciseau guidés par le texte,
  fait apparaître la pâte d'une vidéo ; l'encodeur de texte traduit le prompt en « intentions » lisibles par le sculpteur ;
  la CFG est un curseur « obéir au texte » ; le VAE « dézippe » à la fin.

### Gaps
- Architecture de Kling, Sora 2 (sorti fin septembre 2025) et Veo 3/3.1 : aucune taille, VAE ou nombre de pas publiés ;
  la date d'annonce de Veo 3 (mai 2025, Google I/O) n'apparaît pas dans le PDF du rapport lu.
- Les dimensions internes de Seedance 1.0/2.0 et de Step-Video (nombre de couches, dim) n'étaient pas dans les passages lus.
- La taille du patch temporel/spatial du DiT HunyuanVideo n'apparaît pas en clair dans le passage lu (seulement la formule).
- Pas de comparaison publiée et contrôlée « flow matching vs v-prediction » à l'échelle vidéo trouvée ; la bascule de
  l'industrie vers le flow matching est constatée (Wan, Hunyuan, Movie Gen, Step, Open-Sora) mais non mesurée ici.

---

## Q2 — Image→vidéo, vidéo→vidéo et contrôle (pose, profondeur, caméra, ControlNet / VACE)

### Takeaway
Le mécanisme dominant de l'I2V est la **concaténation dans les canaux** : la première image (et éventuellement la
dernière ou plusieurs images) est encodée par le VAE avec des images nulles, accompagnée d'un **masque binaire** « image
fournie / à générer », et concaténée aux latents bruités (Wan, Seedance) ; une représentation sémantique de l'image
(CLIP ViT-H) est souvent injectée en plus par cross-attention découplée. Le contrôle (profondeur, pose, contours,
caméra, inpainting, référence de personnage) s'obtient soit par des branches type ControlNet / modulation à
initialisation nulle (caméra en coordonnées de Plücker), soit par un format d'entrée **unifié** (VACE : texte + images
de contexte + masques) ; les modèles 2026 (Kling-Omni, Seedance 2.0) généralisent à des références multiples
(images, vidéos, audio) dans une seule séquence de jetons.

### Cited Findings
- **Wan I2V** : l'image de condition est concaténée dans le temps avec des images remplies de zéros, puis encodée par le
  Wan-VAE (c = 16 canaux, t = 1+(T−1)/4, h = H/8, w = W/8) ; un masque binaire (1 = image conservée, 0 = à générer) est
  réarrangé en s×t×h×w (s = pas temporel du VAE) ; l'entrée du DiT I2V a **2c + s** canaux au lieu de c, via une couche
  de projection initialisée à zéro ; des caractéristiques CLIP passent par un MLP à 3 couches et sont injectées par
  **cross-attention découplée** ; données filtrées par similarité SigLIP — [arXiv 2503.20314](https://arxiv.org/html/2503.20314).
  Encodeur image du code officiel : `open-clip-xlm-roberta-large-vit-huge-14` (CLIP ViT-H/14) — [config wan_i2v_14B.py](https://raw.githubusercontent.com/Wan-Video/Wan2.1/main/wan/configs/wan_i2v_14B.py).
- **Seedance 1.0** : T2V et I2V unifiés — les entrées bruitées sont concaténées dans la dimension canal avec les images
  propres ou des images nulles, et des masques binaires indiquent les images de condition ; l'I2V représente 20 % du
  pré-entraînement, 40 % en « Continue Training » — [arXiv 2506.09113](https://arxiv.org/html/2506.09113).
- **Première + dernière image (FLF2V)** : Wan2.1-FLF2V publié le 17/04/2025 ; les auteurs augmentent la proportion
  d'exemples à forte transition entre première et dernière image — [GitHub Wan2.1](https://github.com/Wan-Video/Wan2.1), [arXiv 2503.20314](https://arxiv.org/html/2503.20314).
- **VACE (unifié, 14/05/2025)** : « Video Condition Unit » V = [T ; F ; M] (texte, images de contexte normalisées dans
  [−1,1], masques binaires) ; « concept decoupling » Fc = F×M (à modifier) et Fk = F×(1−M) (à garder) ; construit sur
  Wan-T2V-14B, jusqu'à 720p — [arXiv 2503.20314](https://arxiv.org/html/2503.20314) ; tâches : référence→vidéo,
  vidéo→vidéo (ex. profondeur), édition masquée (inpainting, outpainting, extension) — [GitHub ali-vilab/VACE](https://github.com/ali-vilab/VACE).
- **Contrôle caméra (Wan)** : paramètres caméra encodés en **coordonnées de Plücker** P ∈ ℝ^(6×F×H×W) ; convolutions
  initialisées à zéro produisant γ et β appliqués en f_i = (γ_i+1)·f_{i−1} + β_i ; ≈ O(1) millier de segments extraits
  par VGG-SfM — [arXiv 2503.20314](https://arxiv.org/html/2503.20314).
- **Personnalisation visage (Wan)** : ≈ O(100)M vidéos filtrées → ≈ O(10)M vidéos « personnalisées », ≈ O(1)M visages
  synthétisés par Instant-ID ; similarité ArcFace 0,5526 (2e sur 4 comparés) — [arXiv 2503.20314](https://arxiv.org/html/2503.20314).
- **Contrôles type ControlNet sur Wan** (VideoX-Fun) : Canny, profondeur, pose, MLSD, trajectoire, première/dernière
  image, caméra — [HF alibaba-pai/Wan2.2-Fun-A14B-Control](https://huggingface.co/alibaba-pai/Wan2.2-Fun-A14B-Control), [GitHub VideoX-Fun](https://github.com/aigc-apps/VideoX-Fun) (déjà détaillé dans les notes de fond).
- **Animation de personnage (Wan-Animate, 19/09/2025)** : corps piloté par squelette 2D, visage par caractéristiques
  implicites injectées dans des « Face Blocks » tous les 5 blocs ; segments de 77 images générées, enchaînés par 1 ou 5
  images de recouvrement — [arXiv 2509.14055](https://arxiv.org/html/2509.14055v1) (via notes de fond).
- **Référence par jetons (Wan-S2V)** : l'image de référence, les images cibles et les « motion frames » passent toutes par
  le VAE 3D, sont patchifiées et aplaties en une **seule séquence** ; la référence conditionne sans être la 1re image — [arXiv 2508.18621](https://arxiv.org/html/2508.18621).
- **Kling-Omni** : texte, images de référence et contextes vidéo mappés dans une représentation multimodale unifiée ;
  « subject library » (plusieurs images d'un même sujet) ; noyau d'entraînement acceptant « arbitrary cross-modal masks
  and variable-length sequences » ; mécanisme exact (concaténation vs cross-attention) non précisé — [arXiv 2512.16776](https://arxiv.org/html/2512.16776v1).
- **Seedance 2.0** (lancé 12/02/2026, rapport arXiv 15/04/2026) : entrées texte, image, audio, vidéo ; jusqu'à 9 images,
  3 vidéos et 3 audios de référence ; 4-15 s, 480p/720p natifs — [arXiv 2604.14148](https://arxiv.org/abs/2604.14148), [Seed blog](https://seed.bytedance.com/en/blog/seedance-2-0-正式发布).
- **LTX-2** : vidéo→vidéo et image→vidéo par **IC-LoRA** (In-Context LoRA) ; IC-LoRA publiées : upscaler, HDR, « Dub-It »
  — [GitHub Lightricks/LTX-2](https://github.com/Lightricks/LTX-2).
- **Stable Video Diffusion** (25/11/2023) : modèle de base servant à l'I2V et à la génération multi-vues ; LoRA de
  mouvement caméra — [arXiv 2311.15127](https://arxiv.org/abs/2311.15127).

### Inferences
- Une recette I2V reproductible à partir d'un T2V existant : ajouter 16 canaux (latent de l'image + zéros) + 4 canaux de
  masque (dérivé : 2×16+4 = **36 canaux d'entrée** pour Wan 2.1 I2V), initialiser la nouvelle projection à zéro pour ne
  pas casser le modèle pré-entraîné, et affiner sur des paires (vidéo, 1re image) ; le même masque permet « dernière
  image », « images clés » et « prolongation de vidéo ».
- L'initialisation à zéro (projection I2V, caméra Plücker, ControlNet) est le motif commun : la nouvelle condition
  démarre « muette » et le réseau apprend progressivement à l'écouter.
- Pour un studio, le format unifié (VACE / IC-LoRA) est le plus économique : un seul modèle pour profondeur, pose,
  inpainting et référence, au lieu d'un ControlNet par signal.

### Gaps
- Mécanisme I2V de HunyuanVideo-I2V (06/03/2025) et de SVD (bruitage de l'image de condition, CLIP) non vérifiés sur la
  source primaire pendant cette recherche.
- Mécanismes de référence de Kling, Veo 3.1 (« ingredients ») et Seedance 2.0 non publiés en détail.

---

## Q3 — Génération audio-vidéo conjointe et synchronisation labiale

### Takeaway
Deux familles. (a) **Génération conjointe** : deux flux de latents (vidéo via VAE 3D, audio via un VAE 1D sur
mél-spectrogramme ou forme d'onde) débruités **ensemble** par un réseau à deux branches (« twin backbone » / « dual
stream ») qui échangent l'information par **cross-attention bidirectionnelle bloc par bloc**, avec des positions
temporelles alignées (RoPE temporel commun ou mis à l'échelle) : Veo 3 (principe confirmé), Ovi (2×~5B), LTX-2
(14B vidéo + 5B audio), Seedance 2.0 (« unified », détails non vérifiés). (b) **Pipeline en cascade** : TTS ou piste
audio existante → modèle « speech-to-video » / talking-head qui injecte des caractéristiques audio (Wav2Vec) dans un DiT
vidéo par attention segmentée par image latente (Wan-S2V, HunyuanVideo-Avatar), ou V2A (vidéo→audio) après coup
(Movie Gen Audio, Wan V2A).

### Cited Findings

**Conjoint**
- **Veo 3** : diffusion latente appliquée « jointly to the temporal audio latents, and the spatio-temporal video
  latents », autoencodeurs séparés pour audio et vidéo, débruiteur Transformer — [Veo 3 Tech Report](https://storage.googleapis.com/deepmind-media/veo/Veo-3-Tech-Report.pdf).
- **Ovi** (29-30/09/2025) : branche vidéo initialisée depuis **Wan2.2-5B**, branche audio
  d'architecture identique entraînée de zéro ; chaque branche 30 blocs, dim 3072, FFN 14336, 24 têtes × 128 ; 11B au
  total, ≈ 5,7B entraînables pendant la fusion (FFN gelés) ; **cross-attention bidirectionnelle dans chacun des 30 blocs**
  (audio→vidéo et vidéo→audio) ; fréquences RoPE de l'audio multipliées par **31/157 ≈ 0,197** pour aligner 157 jetons
  audio sur 31 latents vidéo (5 s) ; VAE audio 1D de MMAudio en 16 kHz (16 kHz × 5 s / 512 = 157 jetons) ; un seul T5
  gelé sur un prompt combiné ; parole balisée `<S>…<E>`, description sonore `<AUDCAP>…<ENDAUDCAP>` ; pré-entraînement
  audio 50 k pas (batch 2880, lr 1e-4) sur « hundreds of thousands of hours » de surtout parole ; fusion AV 40 k pas
  (batch 768, lr 5e-5) sur « millions of videos » ; pertes pondérées 0,85 vidéo / 0,15 audio ; sortie 720×720, 5 s,
  24 i/s ; filtre SyncNet |offset| ≤ 3 et confiance > 1,5 ; pas de métrique lip-sync chiffrée (étude de préférence à
  50 personnes) — [arXiv 2510.01284](https://arxiv.org/html/2510.01284).
- **LTX-2** (06/01/2026) : transformeur **asymétrique** à deux flux — 14B vidéo + 5B audio (19B ; la conclusion dit
  « 13B » + « 3B », incohérence interne) ; cross-attention audio-vidéo bidirectionnelle n'utilisant que la composante
  **temporelle** du RoPE ; « cross-modality AdaLN » (chaque flux module l'autre) ; RoPE 3D vidéo, 1D audio ; VAE audio :
  stéréo 16 kHz → mél par canal → jetons de 128 dims couvrant ≈ 1/25 s chacun ; vocodeur HiFi-GAN stéréo 24 kHz ;
  légendes incluant transcription des dialogues (locuteur, langue, accent) ; jusqu'à **20 s** continues avec audio
  stéréo ; H100, 121 images 720p : **1,22 s/pas** (audio+vidéo) contre 22,30 s/pas pour Wan 2.2-14B (vidéo seule), soit
  « ≈ 18× faster » — [arXiv 2601.03233](https://arxiv.org/html/2601.03233v1). Le dépôt 2026 propose LTX-2.3 (ancien) et
  LTX-2.5 (recommandé) en 22B, avec une IC-LoRA « Dub-It » — [GitHub Lightricks/LTX-2](https://github.com/Lightricks/LTX-2) ;
  JUST-DUB-IT (doublage) s'appuie sur LTX-2 — [arXiv 2601.22143](https://arxiv.org/pdf/2601.22143).
- **Seedance 2.0** : « native multi-modal audio-video generation model », « unified, highly efficient, and large-scale
  architecture » ; l'abstract ne dit pas si c'est une ou deux branches — [arXiv 2604.14148](https://arxiv.org/abs/2604.14148) ;
  les descriptions secondaires divergent (« shared latent stream » vs « separate branches ») et ne sont pas vérifiées —
  [NYU Shanghai RITS](https://rits.shanghai.nyu.edu/ai/seedance-2-0-bytedances-multimodal-audio-video-ai-model/), [Analytics Vidhya](https://www.analyticsvidhya.com/blog/2026/02/what-is-seedance-2-0/).

**Cascade / audio piloté**
- **Wan-S2V** (26/08/2025, 14B sur Wan-14B) : audio encodé par Wav2Vec, couches agrégées par poids apprenables (rythme et
  émotion en surface, lexique en profondeur) ; convolutions 1D causales qui compressent l'audio pour donner t jetons audio
  par image latente ; dans chaque « Audio Block », les jetons vidéo sont découpés par image latente et l'attention se fait
  entre chaque segment audio et **son** segment vidéo, « rather than performing full 3D attention » ; « motion frames »
  compressées façon FramePack pour la continuité des longues vidéos ; Sync-C 4,51 (HY-Avatar 4,71, EMO2 4,58) — [arXiv 2508.18621](https://arxiv.org/html/2508.18621).
- **Movie Gen Audio** : modèle séparé de 13B, sortie 48 kHz, pré-entraîné sur O(1)M heures d'audio — [arXiv 2410.13720](https://arxiv.org/html/2410.13720).
- **Wan V2A** : stéréo 44,1 kHz jusqu'à 12 s ; texte umT5 (4096 dims) + caractéristiques CLIP par image (1024 dims)
  projetés en 1536 dims ; ≈ O(1) millier d'heures de données — [arXiv 2503.20314](https://arxiv.org/html/2503.20314).
- HunyuanVideo-Avatar (28/05/2025) : animation humaine pilotée par l'audio — [GitHub HunyuanVideo](https://github.com/Tencent-Hunyuan/HunyuanVideo).

### Inferences
- **Recette « twin backbone » reproductible** (Ovi) : cloner un DiT vidéo pré-entraîné, entraîner la copie sur l'audio
  seul (latents d'un VAE audio public), puis relier les deux par des cross-attentions bidirectionnelles et un RoPE
  temporel mis à l'échelle, et affiner sur des millions de clips parlants filtrés par SyncNet. Le coût dominant reste la
  branche vidéo ; LTX-2 montre qu'on peut donner moins de capacité à l'audio (5B vs 14B).
- **Pourquoi le conjoint synchronise mieux** : chaque pas de débruitage voit simultanément la bouche et le phonème ; en
  cascade, la vidéo doit « suivre » un audio figé (bon pour le lip-sync sur une voix choisie, moins bon pour bruitages et
  ambiance cohérents).
- Pour une troupe : la cascade (TTS → S2V/talking-head) garde la maîtrise de la voix (comédien, voix clonée autorisée) ;
  le conjoint (LTX-2 ouvert, Veo 3/Seedance 2.0 fermés) donne ambiance et bruitages « gratuits » mais moins de contrôle
  sur le timbre.

### Gaps
- Aucune métrique lip-sync comparable (Sync-C/LSE) publiée pour Veo 3, Seedance 2.0, Ovi ou LTX-2 trouvée.
- Taille des données audio-vidéo de LTX-2 et budget de calcul non publiés.
- Architecture audio de Sora 2, Kling (audio natif) et Veo 3.1 non publiée.

---

## Q4 — Recette d'entraînement : données, légendes, curriculum progressif, post-entraînement (SFT, RLHF/DPO), tailles

### Takeaway
Recette commune : (1) **données** = milliards d'images + 10⁷-10⁹ clips vidéo, découpés par plans, filtrés à ~50 % ou
plus (OCR/texte, esthétique, NSFW, filigranes, flou, mouvement, durée ≥ 2-4 s), dédupliqués, équilibrés par clusters ;
(2) **légendes denses** produites par un VLM maison (LLaVA/Qwen, Llama3-Video, Tarsier2, CogVLM2, Gemini) ;
(3) **curriculum** image 256p → image+vidéo basse résolution → haute résolution/longues durées, le coût explosant avec
la résolution ; (4) **post-entraînement** : SFT sur ~10⁶ clips triés à la main, puis alignement par préférences (DPO,
GRPO en ligne, modèles de récompense multi-axes : qualité visuelle, mouvement, alignement texte, esthétique).

### Cited Findings

**Données et filtrage**
- Wan : « billions of images and videos », ≈ 1 000 milliards (1T) de jetons ; filtres de base (couverture de texte OCR,
  esthétique LAION, NSFW, filigrane/logo, bords noirs, surexposition, détection d'images synthétiques — une contamination
  < 10 % peut déjà nuire —, flou, durée ≥ 4 s) qui retirent ≈ 50 % des données ; 100 clusters notés 1-5 à la main puis
  par un modèle expert ; mouvement classé en 6 niveaux (statique, caméra seule, tremblé, etc.) ; post-entraînement :
  top 20 % des images + millions d'images et de vidéos triées sur 12 catégories — [arXiv 2503.20314](https://arxiv.org/html/2503.20314).
- Légendeur Wan : style LLaVA (ViT + MLP 2 couches + LLM Qwen) ; vidéo à 3 i/s jusqu'à 129 images, une image sur 4 en
  pleine résolution (schéma « slow-fast ») ; VideoMME 67,6 → 69,1 % — [arXiv 2503.20314](https://arxiv.org/html/2503.20314).
- Wan 2.2 : « +65.6% more images and +83.2% more videos » que Wan 2.1 ; étiquettes esthétiques (éclairage, composition,
  contraste, couleur) — [GitHub Wan2.2](https://github.com/Wan-Video/Wan2.2).
- HunyuanVideo : ≈ 10 K centroïdes de concepts (k-means), légendes JSON structurées à 7 dimensions, 14 classes de
  mouvement caméra, ≈ 1 M exemples annotés à la main pour l'affinage — [arXiv 2412.03603](https://arxiv.org/html/2412.03603).
- HunyuanVideo 1.5 : T2I 5 milliards d'images (256p) puis 1 milliard (512p) ; ≈ **800 M segments vidéo** retenus sur
  **> 10 M heures** brutes ; clips 2-10 s ; ratio T2I:T2V:I2V = 1:6:3 — [arXiv 2511.18870](https://arxiv.org/html/2511.18870v2).
- Movie Gen : O(100)M paires vidéo-texte et O(1)Md paires image-texte ; clips 4-16 s ; légendes ≈ 100 mots par
  LLaMa3-Video (70 % 8B, 30 % 70B) ; classifieur de mouvement caméra à 16 classes — [arXiv 2410.13720](https://arxiv.org/html/2410.13720).
- CogVideoX : ≈ 35 M clips mono-plan (≈ 6 s) + ≈ 2 Md d'images (LAION-5B, COYO-700M) ; 6 filtres basés Video-LLaMA ;
  légendes Panda70M + CogVLM → résumés GPT-4 → Llama 2 affiné, puis CogVLM2-Caption — [arXiv 2408.06072](https://arxiv.org/html/2408.06072).
- Open-Sora 2.0 : rejet des clips < 2 s, bpp < 0,02, < 16 i/s, ratio hors [1/3, 3] ; découpe des plans > 8 s ; scores
  esthétique, mouvement, flou, OCR, tremblement ; légendes LLaVA-Video (256 px) et Qwen 2.5 Max (768 px) — [arXiv 2503.09642](https://arxiv.org/html/2503.09642).
- Seedance 1.0 : segmentation par plans, clips ≤ 12 s ; légendeur bilingue basé Tarsier2 ; rectification des
  incrustations, filtres qualité/sécurité, déduplication sémantique, rééquilibrage — [arXiv 2506.09113](https://arxiv.org/html/2506.09113).
- Veo 3 : légendes à plusieurs niveaux de détail par plusieurs modèles Gemini, filtrage sécurité/PII, déduplication
  sémantique — [Veo 3 Tech Report](https://storage.googleapis.com/deepmind-media/veo/Veo-3-Tech-Report.pdf).

**Curriculum progressif (chiffres d'étapes)**
- Wan : T2I 256p → images 256p + vidéos 192p 5 s 16 i/s → 480p → 720p — [arXiv 2503.20314](https://arxiv.org/html/2503.20314).
- Movie Gen : T2I 256 px = 210 k itérations / 1,94 Md d'échantillons ; T2I/V 256 px = 185 k it. / 394,8 M ; T2I/V
  768 px = 74,5 k it. / 73,8 M, contexte ≈ 73 K jetons (256 images 768×768) — [arXiv 2410.13720](https://arxiv.org/html/2410.13720).
- CogVideoX : 256×384 (400 k pas, batch 2000) → 480×720 (220 k, batch 1000) → 768×1360 10 s (120 k, batch 250, séquence
  700 k) → affinage 10 k pas — [arXiv 2408.06072](https://arxiv.org/html/2408.06072).
- HunyuanVideo : image 256 → 256/512 multi-échelle → vidéo+image 256 → 960 px ; vidéo basse rés. courte → basse rés.
  longue → haute rés. longue — [arXiv 2412.03603](https://arxiv.org/html/2412.03603).
- HunyuanVideo 1.5 : 256p → 480p → 720p à 16 i/s, puis 720p à 24 i/s — [arXiv 2511.18870](https://arxiv.org/html/2511.18870v2).
- Seedance 1.0 : 256 px image+vidéo → 640 px → 24 i/s → « Continue Training » → SFT → RLHF ; un « refiner » 480p → 720p/1080p
  — [arXiv 2506.09113](https://arxiv.org/html/2506.09113).
- Open-Sora 2.0 : 768 px coûte ≈ 40× plus cher que 256 px pour 129 images — [arXiv 2503.09642](https://arxiv.org/html/2503.09642).

**Post-entraînement / alignement**
- Movie Gen : SFT sur un petit ensemble trié (vidéos 10,6-16 s), 64 nœuds / 512 H100 — [arXiv 2410.13720](https://arxiv.org/html/2410.13720).
- Seedance 1.0 : SFT sur « several hundred categories » avec fusion de modèles entraînés séparément ; RLHF avec **trois
  modèles de récompense** (fondamental, mouvement, esthétique), itérations multiples, aussi sur le refiner ; prompt
  engineering SFT + DPO en LoRA — [arXiv 2506.09113](https://arxiv.org/html/2506.09113).
- HunyuanVideo 1.5 : CT + SFT sur 1 M clips par tâche ; I2V : RL en ligne (MixGRPO) ; T2V : DPO hors ligne sur ≈ O(10K)
  prompts puis même RL en ligne — [arXiv 2511.18870](https://arxiv.org/html/2511.18870v2).
- Kling-Omni : pré-entraînement → SFT « continue-training » (référence→vidéo, édition) → « quality-tuning » → **DPO** (pas
  GRPO) sur paires de préférences humaines issues de plusieurs graines par condition (dynamique du mouvement, intégrité
  visuelle) — [arXiv 2512.16776](https://arxiv.org/html/2512.16776v1).
- Step-Video-T2V : « Video-DPO » pour réduire les artefacts — [arXiv 2502.10248](https://arxiv.org/abs/2502.10248).
- « Improving Video Generation with Human Feedback » (23/01/2025) : jeu de préférences humaines multi-dimensions,
  récompense **VideoReward**, et trois algorithmes pour modèles de flux — Flow-DPO (meilleur que Flow-RWR et que le SFT),
  Flow-RWR, Flow-NRG (guidance par récompense à l'inférence) — [arXiv 2501.13918](https://arxiv.org/abs/2501.13918).
- SVD (11/2023) avait formalisé les trois étapes « pré-entraînement image → pré-entraînement vidéo sur un grand jeu
  curé → affinage haute qualité » — [arXiv 2311.15127](https://arxiv.org/abs/2311.15127).

### Inferences
- L'ordre de grandeur « industriel » 2025-26 : 10⁸-10⁹ clips et 10⁹-10¹⁰ images ; le « petit » Open-Sora 2.0 s'en sort avec
  70 M → 10 M → 5 M clips parce qu'il hérite d'un modèle image (Flux).
- Le post-entraînement par préférences (DPO/GRPO + récompenses mouvement/esthétique) est désormais standard chez tous
  les acteurs qui publient (ByteDance, Tencent, Kuaishou, StepFun) : c'est lui qui réduit les membres déformés et le
  « mouvement mou ».
- Pour un non-spécialiste : on apprend d'abord au modèle à « voir » (images), puis à « bouger » en petit format, puis en
  grand ; on finit par lui montrer des exemples triés à la main et des paires « celle-ci est meilleure que celle-là ».

### Gaps
- Taille exacte des jeux de données de Veo, Kling, Sora, Seedance 2.0 : non publiée.
- Taille du jeu de préférences de VideoReward (souvent citée ≈ 182 k) non confirmée sur la page lue.
- Pas de chiffre public sur la part de données synthétiques dans ces corpus (seule mention : Wan, contamination < 10 %).

---

## Q5 — Vitesse : distillation, cache, attention creuse, quantification, génération autoregressive / streaming

### Takeaway
On cumule cinq leviers : (1) **distillation de pas** 40-50 → 4-10 pas (DMD/DMD2, consistance continue rCM, adversarial,
trajectoire) et de CFG ; (2) **cache** des sorties entre pas proches (TeaCache, cache de diffusion Wan, cache des
conditions) ≈ ×1,5-2 ; (3) **attention creuse** (SSTA, VSA, Sparse-vDiT) ≈ ×1,6-2 de bout en bout ; (4) **quantification**
FP8/NVFP4/INT8-attention (SageAttention), GGUF pour les petites cartes ; (5) **autoregressif causal** par blocs avec cache
KV (CausVid, Self-Forcing, MAGI-1) qui atteint le temps réel (~17 i/s sur H100 à 480p) et la génération longue en
streaming. Combinés, ByteDance annonce > ×10 de bout en bout (5 s 1080p en 41,4 s sur L20) et TurboDiffusion
revendique ×100-200.

### Cited Findings

**Distillation de pas**
- DMD2 (23/05/2024) : supprime la perte de régression de DMD (plus besoin de paires bruit-image du professeur), règle de
  mise à jour à deux échelles de temps, perte GAN sur données réelles, simulation des échantillons d'inférence pour le
  multi-pas ; FID 1,28 en 1 pas sur ImageNet-64, 8,35 sur COCO zero-shot, « 500X reduction in inference cost » — [arXiv 2405.14867](https://arxiv.org/abs/2405.14867).
- CausVid (10/12/2024, CVPR 2025) : transforme un DiT bidirectionnel en générateur **autoregressif causal** ; DMD étendu à
  la vidéo, professeur bidirectionnel → élève causal (« asymmetric distillation »), initialisation par trajectoires ODE,
  cache KV ; 50 → **4 pas** ; 9,4 i/s sur un GPU ; VBench-Long 84,27 ; streaming, V2V, I2V en zero-shot — [arXiv 2412.07772](https://arxiv.org/abs/2412.07772).
- Self-Forcing (06/2025) : corrige le biais d'exposition (entraîné sur contexte réel, testé sur ses propres sorties) en
  faisant le **déroulé autoregressif avec cache KV pendant l'entraînement**, perte au niveau vidéo (DMD, SiD ou GAN) ;
  base Wan2.1-T2V-1.3B, 832×480 ; 4 pas, blocs de 3 latents ; **17,0 i/s, latence 0,69 s** sur un H100 (par image :
  8,9 i/s, 0,45 s) ; cache KV glissant pour extrapoler ; convergence en ≈ **1,5 h sur 64 H100** ; VBench 84,31 vs 81,20
  pour CausVid (réimplémenté) — [arXiv 2506.08009](https://arxiv.org/html/2506.08009). Note : Self-Forcing mesure CausVid à
  17,0 i/s dans sa propre implémentation, CausVid annonce 9,4 i/s — chiffres non comparables.
- rCM (NVIDIA, 10/2025, ICLR 2026) : consistance continue (sCM) + distillation de score comme régulariseur ; noyau JVP
  FlashAttention-2 pour > 10B paramètres ; sur Wan2.1 jusqu'à 14B et Cosmos-Predict2 : **1-4 pas**, ×15-50, qualité
  au niveau de DMD2 avec plus de diversité — [arXiv 2510.08431](https://arxiv.org/html/2510.08431v2), [NVIDIA](https://research.nvidia.com/labs/cosmos-lab/rcm/).
- Seedance 1.0 : TSCD (×4 sur le DiT), distillation de score RayFlow, entraînement adversarial (APT) avec préférences
  humaines ; décodeur VAE allégé (×2), fusion de noyaux (+15 %), quantification, attention creuse, communication FP8 ;
  « over 10× end-to-end speedup » ; **5 s en 1080p en 41,4 s sur NVIDIA L20** — [arXiv 2506.09113](https://arxiv.org/html/2506.09113).
- Kling-Omni : distillation en deux temps (trajectory matching puis distribution matching, avec la première comme
  régulariseur) : **150 NFE → 10 NFE** — [arXiv 2512.16776](https://arxiv.org/html/2512.16776v1).
- MAGI-1 : « shortcut distillation » — un seul modèle de vitesse valable pour des budgets de pas cycliques {64, 32, 16, 8},
  contrainte « un grand pas = deux petits », + distillation de CFG — [GitHub MAGI-1](https://github.com/SandAI-org/MAGI-1).
- LTX-2 : pipeline distillé à 8 sigmas prédéfinis (8 pas étape 1, 4 pas étape 2) — [GitHub LTX-2](https://github.com/Lightricks/LTX-2).
- Wan « streamer » : distillation de consistance (LCM/VideoLCM) ×10-20, 8-16 i/s ; 15 min de vidéo sur 8 A100 à 8 i/s ;
  « 8 FPS » sur une RTX 4090 dans le texte vs « 20 FPS » (int8 + TensorRT) dans une légende — incohérence interne —
  [arXiv 2503.20314](https://arxiv.org/html/2503.20314).
- Écosystème Wan : LightX2V (4 pas) et LoRA de distillation ; Wan-Animate-2 « Distillation » = 10 pas sans CFG — [GitHub ModelTC/LightX2V](https://github.com/ModelTC/LightX2V), [HF Wan-AI/Wan2.2-Animate-2-14B](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B) (via notes de fond).

**Cache**
- Wan : cache de diffusion ×1,62 sur T2V-14B — [arXiv 2503.20314](https://arxiv.org/html/2503.20314).
- TeaCache (saut des pas quand l'entrée modulée par le pas de temps change peu) : supporté pour Wan et HunyuanVideo dans
  SGLang — [docs SGLang](https://docs.sglang.io/diffusion/performance/index.html) ; retour praticien sur Wan2.2 :
  par pas 3,10 s → 1,51 s avec TeaCache ; avec SageAttention (INT8, −14 % sur l'attention) et autres optimisations,
  187 s → 60 s pour 40 pas sur 8 GPU — [Voltage Park](https://www.voltagepark.com/blog/accelerating-wan2-2-from-4-67s-to-1-5s-per-denoising-step-through-targeted-optimizations).
- Kling-Omni : cache des conditions de référence ≈ ×2, et KV des jetons de condition réutilisés entre pas dans le
  super-résolveur — [arXiv 2512.16776](https://arxiv.org/html/2512.16776v1).

**Attention creuse**
- HunyuanVideo 1.5 SSTA (sans paramètre) : ×1,87 de bout en bout pour 10 s en 720p vs FlashAttention-3 ; par pas 5,51 s →
  2,95 s (720p, 241 images, 8×H800) ; 50 pas : 96,8 s → 58,4 s — [arXiv 2511.18870](https://arxiv.org/html/2511.18870v2).
- VSA (attention creuse entraînable, NeurIPS 2025) : Wan2.1-1.3B 31 s → 18 s, temps d'attention ÷6 ; 14B 1274 s → 576 s —
  [NeurIPS 2025](https://proceedings.neurips.cc/paper_files/paper/2025/hash/dfc310e81992d2e4cedc09ac47eff13e-Abstract-Conference.html).
- Sparse-vDiT : ×1,76 (CogVideoX1.5), ×1,85 (HunyuanVideo), ×1,58 (Wan2.1) ; Rectified SpaAttn : ×3,33 sur HunyuanVideo à
  88,95 % de parcimonie — [arXiv 2511.19835](https://arxiv.org/pdf/2511.19835) (via résultats de recherche).

**Quantification**
- Wan : GEMM FP8 ×1,13 sur le DiT ; FlashAttention 8 bits > ×1,27 — [arXiv 2503.20314](https://arxiv.org/html/2503.20314).
- HunyuanVideo : poids FP8 (18/12/2024) ≈ −10 Go de mémoire — [GitHub HunyuanVideo](https://github.com/Tencent-Hunyuan/HunyuanVideo).
- Kling-Omni : FP8 pour la plupart des GEMM et l'auto-attention, communication FP8 — [arXiv 2512.16776](https://arxiv.org/html/2512.16776v1).
- LTX-2 sur RTX : NVFP8 ≈ −30 % de taille et jusqu'à ×2 ; NVFP4 jusqu'à −60 % de VRAM (RTX 50 seulement) ; « weight
  streaming » ComfyUI vers la RAM — [NVIDIA blog CES 2026](https://blogs.nvidia.com/?p=88691).
- GGUF (Q4-Q8) des Wan 14B/5B par QuantStack et FP8 « scaled » par Kijai, utilisés dans ComfyUI — [HF QuantStack/Wan2.2-Animate-14B-GGUF](https://huggingface.co/QuantStack/Wan2.2-Animate-14B-GGUF), [HF Kijai/WanVideo_comfy_fp8_scaled](https://huggingface.co/Kijai/WanVideo_comfy_fp8_scaled) (via notes de fond).
- TurboDiffusion : SageAttention + attention creuse-linéaire + distillation de pas + quantification 8 bits, revendique
  ×100-200 — [arXiv 2512.16093](https://arxiv.org/pdf/2512.16093) (via résultats de recherche, non lu en détail).

**Génération longue / autoregressive**
- MAGI-1 (21/04/2025, Apache-2.0) : blocs de **24 images**, bruit croissant de bloc en bloc, jusqu'à 4 blocs débruités en
  parallèle (pipeline), le bloc suivant démarre quand le précédent atteint un certain niveau de débruitage — [GitHub MAGI-1](https://github.com/SandAI-org/MAGI-1).
- Self-Forcing : cache KV glissant à taille fixe (16,1 i/s avec attention locale ; recalcul du KV → 4,6 i/s sur 10 s) — [arXiv 2506.08009](https://arxiv.org/html/2506.08009).
- Wan-S2V : « motion frames » compressées façon FramePack — [arXiv 2508.18621](https://arxiv.org/html/2508.18621) ; Wan-Animate : segments de 77 images enchaînés — [arXiv 2509.14055](https://arxiv.org/html/2509.14055v1).
- LTX-2 : jusqu'à 20 s d'un seul tenant — [arXiv 2601.03233](https://arxiv.org/html/2601.03233v1).

### Inferences
- Pour un studio, l'ordre d'efficacité pratique est : modèle distillé 4-8 pas (×5-12) > FP8/GGUF (rend possible sur
  24 Go et moins) > cache (×1,5-2) > attention creuse (×1,5-2) ; les gains se multiplient en partie mais dégradent un peu
  la qualité (perte de diversité avec DMD, d'où rCM).
- L'autoregressif causal (Self-Forcing, MAGI-1) est la voie vers des plans longs et l'interactivité ; la qualité reste
  inférieure aux modèles bidirectionnels 14B, et les variantes publiées sont surtout en 1,3B/480p.

### Gaps
- FasterCache : aucun chiffre trouvé pendant cette recherche.
- Chiffres officiels du papier TeaCache non relus (seulement un retour praticien et la doc SGLang).
- Aucun chiffre public de vitesse pour Veo 3 / Kling / Sora 2.

---

## Q6 — Échelle de calcul : coûts d'entraînement publiés et coût d'inférence (VRAM / temps par seconde de vidéo)

### Takeaway
L'entraînement d'un modèle de base reste hors de portée d'un studio : Movie Gen (30B) a utilisé jusqu'à **6 144 H100** ;
le chiffre « bas » le plus crédible est Open-Sora 2.0 (11B) à **≈ 200 k$** (4 160 jours-GPU H200 à 2 $/h), rendu possible
par l'initialisation depuis Flux et un VAE très compressif. À l'inférence, il faut compter (sans distillation) ≈ 1 min de
calcul par seconde de vidéo pour un 1,3B en 480p sur RTX 4090 (8 Go), ≈ 1,5-2 min/s pour un 5B en 720p (≈ 23 Go), et
≈ 3,5 min/s pour un 14B en 720p sur H100 (≈ 60 Go) ; les modèles distillés/efficaces 2025-26 descendent à quelques
secondes par seconde de vidéo (LTX-2 sur RTX 5090, Seedance sur L20, Self-Forcing en temps réel).

### Cited Findings

**Entraînement**
- Open-Sora 2.0 (11B, arXiv 03/2025, v3 02/03/2026) : « trained for only $200k » — total 199,6 k$, en supposant H200 à
  2 $/GPU-heure ; étapes : 256 px T2V 70 M échantillons, 85 k it., 224 GPU, 2 240 jours-GPU, 107,5 k$ ; 256 px T/I2V 10 M,
  13 k it., 192 GPU, 384 jours-GPU, 18,4 k$ ; 768 px T/I2V 5 M, 13 k it., 192 GPU, 1 536 jours-GPU, 73,7 k$ ; MFU 38,19 %
  puis 35,75 % ; autoencodeur 250 k + 200 k pas sur **8 GPU** ; revendique « 5-10× lower training cost » que Movie Gen et
  Step-Video-T2V (estimations à partir d'infos publiques) — [arXiv 2503.09642](https://arxiv.org/html/2503.09642).
- Movie Gen (30B) : jusqu'à 6 144 H100 80 Go ; parallélisme FSDP + tenseur + séquence + contexte ; SFT sur 512 H100 — [arXiv 2410.13720](https://arxiv.org/html/2410.13720).
- Wan : pas de budget total ; exemple de configuration sur 128 GPU (CP 16 = Ulysses 8 × Ring 2, FSDP 32, DP 4) ;
  activations ≈ 8 To à 1 M de jetons (batch 1) ; l'attention prend jusqu'à 95 % du temps d'entraînement à 1 M jetons —
  [arXiv 2503.20314](https://arxiv.org/html/2503.20314).
- HunyuanVideo : parallélisme « 5D » (TP, SP, CP, DP + ZeroCache), stabilité 99,5 % ; pas de nombre de GPU publié — [arXiv 2412.03603](https://arxiv.org/html/2412.03603).
- Kling-Omni : « Effective Training Time Ratio » 97 %, redémarrage < 1 min ; pas de nombre de GPU — [arXiv 2512.16776](https://arxiv.org/html/2512.16776v1).
- Wan-S2V : entraîné en FSDP sur 8 GPU de 80 Go + parallélisme de contexte, itération ≈ 100 s → ≈ 12 s, jusqu'à 48 images
  en 1024×768 — [arXiv 2508.18621](https://arxiv.org/html/2508.18621).
- Self-Forcing : distillation complète en ≈ 1,5 h sur 64 H100 (≈ 96 GPU-heures) — [arXiv 2506.08009](https://arxiv.org/html/2506.08009).

**Inférence (temps total / pic mémoire, 1 GPU sauf mention)**
- **1-2B** : Wan2.1-T2V-1.3B 480p 5 s sur RTX 4090 (offload + T5 sur CPU) : **261,4 s / 8,19 Go** — [HF Wan-AI/Wan2.1-VACE-1.3B](https://huggingface.co/Wan-AI/Wan2.1-VACE-1.3B) (via notes de fond), [GitHub Wan2.1](https://github.com/Wan-Video/Wan2.1).
  CogVideoX-2B sur H800, 50 pas : 480×720 6 s = **49 s / 18 Go** ; 768×1360 5 s = 220 s / 53 Go — [arXiv 2408.06072](https://arxiv.org/html/2408.06072).
  LTX-Video (2B) : 5 s 768×512 24 i/s en **2 s** sur H100 — [arXiv 2501.00103](https://arxiv.org/abs/2501.00103).
  Self-Forcing 1,3B : 17 i/s 832×480 sur H100 (temps réel) — [arXiv 2506.08009](https://arxiv.org/html/2506.08009).
- **~5B** : Wan2.2-TI2V-5B 720p 24 i/s 5 s sur RTX 4090 : T2V **534,7 s / 22,9 Go**, I2V 524,8 s / 22,8 Go ; officiellement
  « under 9 minutes » — [HF Wan-AI/Wan2.2-TI2V-5B](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B).
  CogVideoX-5B sur H800 : 480×720 6 s = 113 s / 26 Go ; 768×1360 5 s = 500 s / 76 Go — [arXiv 2408.06072](https://arxiv.org/html/2408.06072).
  MAGI-1 4.5B : 1× RTX 4090 (≥ 24 Go) ; version distillée+quantifiée avec `window_size=1` sur 12 Go — [GitHub MAGI-1](https://github.com/SandAI-org/MAGI-1).
- **8-14B** : HunyuanVideo 1.5 (8,3B) : pic **13,6 Go** en 720p 121 images avec offload + VAE en tuiles (RTX 4090) ; 10 s
  720p, 50 pas sur 8×H800 : 96,8 s (58,4 s avec SSTA) — [arXiv 2511.18870](https://arxiv.org/html/2511.18870v2).
  Wan2.2-A14B : H100/H800 480p 326,9 s / 41,3 Go ; 720p ≈ 1 041-1 056 s / 59,7-59,8 Go ; A100 720p 2 735-2 811 s — [HF Wan-AI/Wan2.2-TI2V-5B](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B) (tableau, via notes de fond) ;
  « at least 80GB VRAM » sans offload — [GitHub Wan2.2](https://github.com/Wan-Video/Wan2.2). Rapport Wan : un 14B
  demande « approximately 30 minutes on a single [high-end] GPU without additional optimization » — [arXiv 2503.20314](https://arxiv.org/html/2503.20314).
  HunyuanVideo (13B) : 720×1280×129 images ≈ 60 Go, 544×960 ≈ 45 Go, 80 Go recommandés ; 1280×720 129 images 50 pas :
  1 GPU 1 904 s, 8 GPU 337,6 s (xDiT) — [GitHub HunyuanVideo](https://github.com/Tencent-Hunyuan/HunyuanVideo).
- **19-30B** : LTX-2 (19B A+V) 1,22 s/pas sur H100 à 720p 121 images — [arXiv 2601.03233](https://arxiv.org/html/2601.03233v1) ;
  LTX-2 720p 4 s ≈ 25 s sur RTX 5090 (32 Go), 8 s ≈ 3 min quand le « weight streaming » s'active — [NVIDIA](https://blogs.nvidia.com/?p=88691) ;
  téléchargement ≈ 66 GiB pour LTX-2.5 22B — [GitHub LTX-2](https://github.com/Lightricks/LTX-2).
  MAGI-1 24B : 8× H100 ; distillé+FP8 : 4× H100 ou 8× RTX 4090 — [GitHub MAGI-1](https://github.com/SandAI-org/MAGI-1).
  Step-Video-T2V : 30B (pas de chiffre VRAM sur la page lue) — [arXiv 2502.10248](https://arxiv.org/abs/2502.10248).
- **Fermé, à titre de repère** : Seedance 1.0, 5 s 1080p en 41,4 s sur un L20 (après distillation et optimisations) — [arXiv 2506.09113](https://arxiv.org/html/2506.09113).

### Inferences
- **Temps de calcul par seconde de vidéo (dérivé)** : Wan 1.3B 480p ≈ 261/5 ≈ **52 s par seconde** (RTX 4090) ; TI2V-5B
  720p ≈ 530/5 ≈ **106 s/s** (RTX 4090) ; Wan2.2-A14B 720p ≈ 1 050/5 ≈ **210 s/s** (H100) et 480p ≈ 65 s/s ; HunyuanVideo 13B
  720p ≈ 1 904/5,4 ≈ **350 s/s** (1 GPU) ; CogVideoX-5B 480p ≈ 19 s/s (H800) ; HunyuanVideo 1.5 720p ≈ 9,7 s/s sur 8×H800
  (≈ 78 GPU-s par seconde) ; LTX-2 sur RTX 5090 ≈ 6 s/s en 720p.
- **Mémoire des poids (dérivé)** : 14B en bf16 ≈ 28 Go, en FP8 ≈ 14 Go, en GGUF 4 bits ≈ 7-8 Go (hors encodeur de texte
  umT5-XXL > 20 Go en bf16 selon Wan, et activations) — ce qui explique l'offload systématique sur cartes 24 Go.
- **Coût d'une distillation type Self-Forcing (dérivé)** : 96 H100-heures × 2-3 $/h ≈ 200-300 $ — accessible à un studio
  qui loue du cloud, contrairement au pré-entraînement (≈ 200 k$ minimum crédible).

### Gaps
- Aucun budget de calcul publié pour Wan, HunyuanVideo, Kling, Veo, Sora, Seedance, LTX-2.
- Le GPU exact du test HunyuanVideo « 1 904 s sur 1 GPU » n'est pas précisé sur la page lue.
- Chiffres VRAM LTX-2 sur RTX 4090 : seulement des estimations communautaires divergentes (≈ 20-21 Go en 720p FP8 vs
  « 32 Go+ » conseillés) — [Codersera](https://codersera.com/blog/run-ltx-2-on-comfyui-locally-and-free-generate-videos-with-audio/amp/), [Thunder Compute](https://www.thundercompute.com/blog/ltx-2-3-comfyui), [ComfyUI](https://comfy.org/workflows/model/ltx/).

---

## Q7 — Ce qu'un particulier / petit studio peut réellement faire (de zéro, affinage LoRA, usage tel quel) et matériel minimal

### Takeaway
**Entraîner de zéro** un modèle de base compétitif : non réaliste (≥ ~200 k$ et des centaines de GPU H200 pendant des
semaines, plus 10⁷-10⁸ clips curés). **Affiner** : réaliste — une LoRA vidéo sur Wan 14B tient sur **24 Go** (RTX 4090)
avec block-swap + FP8 (images seules : 12 Go), et une distillation type Self-Forcing coûte ~100 GPU-heures H100 louées.
**Utiliser tel quel** : réaliste dès 8-12 Go (Wan 1.3B, MAGI-1 4.5B quantifié, HunyuanVideo 1.5 avec offload), 24 Go pour
le confort en 720p (TI2V-5B, LTX-2 FP8), 32 Go (RTX 5090) pour l'audio-vidéo LTX-2 rapide, 80 Go (location H100) pour
les 14B en pleine précision.

### Cited Findings
- Entraînement de zéro, borne basse publiée : Open-Sora 2.0, 11B, ≈ 199,6 k$ (H200 à 2 $/h), 192-224 GPU par étape,
  en s'appuyant sur Flux (11B) comme initialisation — [arXiv 2503.09642](https://arxiv.org/html/2503.09642).
- LoRA : musubi-tuner (kohya-ss) — block swap + FP8 permettent d'entraîner en 720×1280 (images) sur 24 Go ;
  recommandations : **12 Go pour l'entraînement sur images, 24 Go+ pour la vidéo** ; support Wan2.2 14B « experimental » ;
  `--fp8_scaled` non supporté pour Wan — [musubi-tuner (docs)](https://docsearch.algolia.com/mcp/docs/repo/kohya-ss/musubi-tuner), [GitHub discussion #455](https://github.com/kohya-ss/musubi-tuner/discussions/455) ;
  un utilisateur rapporte ≈ 8 h pour une passe « high-noise » Wan 2.2 sur une carte 16 Go (fork communautaire) — [même discussion](https://github.com/kohya-ss/musubi-tuner/discussions/455) ;
  une config tierce indique 48 Go / A100 80 Go recommandés pour Wan 2.2 T2V 14B — [HF config tierce](https://huggingface.co/spaces/dippoo/content-engine/blob/main/config/models.yaml) (moins fiable).
- LTX-2 : `ltx-trainer` gère LoRA, affinage complet et IC-LoRA ; une LoRA ne fonctionne qu'avec le modèle sur lequel elle a
  été entraînée — [GitHub LTX-2](https://github.com/Lightricks/LTX-2).
- VideoX-Fun (Wan-Fun) testé sur RTX 3060 12 Go et 3090 24 Go (Windows), modes `model_cpu_offload_and_qfloat8` — [GitHub VideoX-Fun](https://github.com/aigc-apps/VideoX-Fun) (via notes de fond).
- Inférence légère : Wan 1.3B 8,19 Go ; HunyuanVideo 1.5 pic 13,6 Go (offload) ; MAGI-1 4.5B distill+quant 12 Go ;
  TI2V-5B ≥ 24 Go ; LightX2V « can run on RTX 5090 and RTX 4060 (8GB VRAM) » — [GitHub Wan2.1](https://github.com/Wan-Video/Wan2.1), [arXiv 2511.18870](https://arxiv.org/html/2511.18870v2), [GitHub MAGI-1](https://github.com/SandAI-org/MAGI-1), [GitHub Wan2.2](https://github.com/Wan-Video/Wan2.2).
- Distillation : Self-Forcing ≈ 1,5 h sur 64 H100 — [arXiv 2506.08009](https://arxiv.org/html/2506.08009).
- Ovi montre qu'on peut **greffer** l'audio sur un modèle vidéo ouvert existant (Wan2.2-5B) plutôt que tout réentraîner,
  mais avec des centaines de milliers d'heures d'audio et des batchs de 768-2 880 — [arXiv 2510.01284](https://arxiv.org/html/2510.01284).

### Inferences
- **Trois niveaux pour une troupe** (synthèse) :
  1. *Usage tel quel* (PC RTX 4090/5090 ou location) : Wan 2.2 (5B/14B quantifié) ou LTX-2 pour l'audio, en 4-8 pas
     distillés ; budget matériel ≈ une carte 24-32 Go.
  2. *Personnalisation* : LoRA de style/personnage sur Wan 14B (24 Go, quelques heures à une nuit) ou IC-LoRA LTX-2 ;
     c'est le niveau « adapter le moteur » recommandé.
  3. *Adaptation lourde* (location cloud, quelques centaines à milliers de $) : distillation vers un générateur causal
     temps réel (Self-Forcing), ou affinage complet sur un corpus maison de quelques milliers à dizaines de milliers de
     clips — faisable mais demande ingénierie (FSDP, parallélisme de contexte).
  Le pré-entraînement de zéro (niveau 4) est à exclure : 3 ordres de grandeur au-dessus du budget d'un studio.
- La « boîte à outils » d'un clone : code Wan2.1/2.2 (Apache-2.0) comme squelette, VAE Wan2.2 (4×16×16, 48 canaux),
  umT5 ou Qwen2.5-VL, flow matching, puis LightX2V/rCM pour la vitesse et VACE/Fun pour le contrôle.

### Gaps
- Pas de mesure officielle du temps d'entraînement d'une LoRA vidéo Wan 14B sur 24 Go (seulement retours d'utilisateurs).
- Coût réel d'un affinage complet (full fine-tune) d'un 14B : non publié par les éditeurs.
