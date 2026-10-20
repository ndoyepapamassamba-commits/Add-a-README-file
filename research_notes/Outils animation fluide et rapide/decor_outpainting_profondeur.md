# Décor peint → plateau 2,5D extensible pour la vidéo verticale (CPU, octobre 2026)

Veille du 16/10/2026. Contexte : décor peint 1024×506 (village, baobab), profondeur Depth Anything V2 Small déplacée en maillage three.js ; en 9:16 la caméra voit au-dessus, au-dessous et sur les côtés ; aujourd'hui bande de sol en MIROIR + fondu du ciel (interdit par la spécification : « pas de duplication miroir visible du sol ») ; coutures à réparer ; zones masquées étirées en « feuille de caoutchouc ». Conteneur : 4 cœurs, sans GPU, Python 3.12, Node 22. Règle maison : code et poids exécutés chez nous en MIT, Apache-2.0 ou BSD seulement.

Les mesures marquées **MESURÉ** ont été faites dans ce conteneur le 16/10/2026 (onnxruntime 1.31.0, 4 fils). **Attention** : la charge de la machine variait (charge moyenne relevée à 14,3 pour 4 cœurs pendant la seconde série, car d'autres agents tournaient en parallèle) ; les deux séries sont données. Scripts : `/tmp/claude-0/-home-user-Add-a-README-file/b47568ca-f920-5025-9cd6-5f833e2dbfb0/scratchpad/bench_scripts/` ; images de comparaison (décor privé de l'utilisateur, hors dépôt) : `/tmp/claude-0/-home-user-Add-a-README-file/b47568ca-f920-5025-9cd6-5f833e2dbfb0/scratchpad/out/planche_comparaison.jpg` et `.../out/planche_bandes.jpg`.

Rappel des acquis du projet (pour ne pas refaire) : LaMa ONNX (Carve) déjà en cache et utilisé pour le décor reconstruit sous les personnages, « ≈ 5–40 s par décor en CPU » ; Depth Anything V2 Small ONNX mesuré 0,87 s/image (630×518) ; Mask2Former écarté (poids CC BY-NC) au profit d'UperNet MIT ([note du projet](../../workbench/research_notes/veille-video-html-3d/2026-10-14.md), §5–6).

## 1. Inpainting / outpainting « léger » (LaMa, IOPaint, MI-GAN, ONNX) : licences, vitesse CPU, qualité sur un sol peint

### Takeaway
LaMa (code Apache-2.0, ONNX Apache-2.0) et MI-GAN (code MIT, poids MIT) sont les seuls inpainteurs rapides entièrement compatibles avec la règle maison ; ils réparent bien les petits trous (coutures, désocclusions de quelques dizaines de pixels) mais **échouent sur une bande de sol de +30 % en haut et en bas** (mesuré sur le décor du village : sol qui vire au gris flou ou en taches, coutures visibles avec MI-GAN). Dans IOPaint, MAT est non commercial (CC BY-NC 4.0) et les modèles de diffusion reposent sur des licences OpenRAIL, hors règle.

### Cited Findings
**Licences (code ≠ poids)**
- LaMa (advimman/lama) : fichier LICENSE = Apache License 2.0 — [LICENSE LaMa](https://raw.githubusercontent.com/advimman/lama/main/LICENSE). Les poids big-lama sont distribués via le dépôt sans licence séparée trouvée ; la conversion ONNX Carve/LaMa-ONNX porte l'étiquette `license:apache-2.0` — [Carve/LaMa-ONNX (API HF)](https://huggingface.co/Carve/LaMa-ONNX).
- simple-lama-inpainting : Apache License 2.0 — [LICENSE simple-lama-inpainting](https://raw.githubusercontent.com/enesmsahin/simple-lama-inpainting/main/LICENSE).
- IOPaint (ex lama-cleaner) : Apache License 2.0 — [LICENSE IOPaint](https://raw.githubusercontent.com/Sanster/IOPaint/main/LICENSE). Modèles enregistrés dans le code : LaMa, AnimeLaMa, LDM, ZITS, MAT, FcF, OpenCV2, Manga, MIGAN, SD15, Anything4, RealisticVision14, SD2, PaintByExample, InstructPix2Pix, Kandinsky22, SDXL, PowerPaint, AnyText — [iopaint/model/__init__.py](https://raw.githubusercontent.com/Sanster/IOPaint/main/iopaint/model/__init__.py). La page des modèles recommande LaMa, MAT et MI-GAN (MI-GAN « minimal in size, requiring the least amount of resources ») et présente un outil « Expander » d'outpainting ainsi que PowerPaint pour l'outpainting ; elle ne donne aucune licence — [IOPaint, Models](https://www.iopaint.com/models).
- MAT : LICENSE = Creative Commons **Attribution-NonCommercial 4.0** ; le README dit « The code and models in this repo are for research purposes only » ; sorties en multiples de 512 — [LICENSE MAT](https://raw.githubusercontent.com/fenglinglwb/MAT/main/LICENSE), [README MAT](https://github.com/fenglinglwb/MAT). → **NON COMMERCIAL, exclu.**
- ZITS : code Apache-2.0 ; licence des poids non indiquée (Google Drive / BaiduDrive) ; le script ne traite que des images carrées — [ZITS_inpainting](https://github.com/DQiaole/ZITS_inpainting).
- FcF-Inpainting (SHI Labs) : Apache License 2.0 « except for the third-party components » — [LICENSE FcF](https://raw.githubusercontent.com/SHI-Labs/FcF-Inpainting/main/LICENSE). Poids : licence non vérifiée.
- LDM (CompVis latent-diffusion) : code MIT — [LICENSE latent-diffusion](https://raw.githubusercontent.com/CompVis/latent-diffusion/main/LICENSE). Licence des poids utilisés par IOPaint : non vérifiée.
- PowerPaint : code MIT ; poids PowerPaint-v2-1 étiquetés Apache-2.0 sur Hugging Face ; la v2 est « BrushNet-based » et l'outpainting se fait par curseurs d'expansion sans prompt — [PowerPaint (GitHub)](https://github.com/open-mmlab/PowerPaint), [JunhaoZhuang/PowerPaint-v2-1](https://huggingface.co/JunhaoZhuang/PowerPaint-v2-1). Mais il s'appuie sur un modèle de base SD 1.5, lui-même sous CreativeML OpenRAIL-M — [stable-diffusion-inpainting](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-inpainting).
- BrushNet : « licensed under the Apache License Version 2.0 except for the third-party components » ; bases SD 1.5 / SDXL ; option d'évaluation `outpainting_mask` — [LICENSE BrushNet](https://raw.githubusercontent.com/TencentARC/BrushNet/main/LICENSE), [BrushNet](https://github.com/TencentARC/BrushNet).
- SD inpainting : CreativeML OpenRAIL-M ; SDXL inpainting 0.1 : OpenRAIL++ — [SD 1.5 inpainting](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-inpainting), [SDXL inpainting 0.1](https://huggingface.co/diffusers/stable-diffusion-xl-1.0-inpainting-0.1). → **hors règle MIT/Apache/BSD** (licences à restrictions d'usage).
- AnyText (Sanster) : aucune licence déclarée sur la fiche — [Sanster/AnyText](https://huggingface.co/Sanster/AnyText).
- MI-GAN (Picsart) : code MIT ; fichier LICENSE-WEIGHTS = **MIT** (« Copyright (c) 2024 Picsart AI Research ») — [MI-GAN](https://github.com/Picsart-AI-Research/MI-GAN), [LICENSE-WEIGHTS](https://raw.githubusercontent.com/Picsart-AI-Research/MI-GAN/main/LICENSE-WEIGHTS). Modèles 256 (Places2, FFHQ) et 512 (Places2) ; pipeline ONNX « arbitrary resolution inputs » ; « one order of magnitude smaller and faster than recent SOTA » (pas de chiffre CPU dans le README) — [MI-GAN](https://github.com/Picsart-AI-Research/MI-GAN). L'ONNX pré-converti est sur Hugging Face, étiqueté MIT — [andraniksargsyan/migan](https://huggingface.co/andraniksargsyan/migan).

**Comportement connu de LaMa sur les grands trous / l'outpainting**
- Le titre même de l'article LaMa revendique la robustesse en résolution (« Resolution-robust Large Mask Inpainting with Fourier Convolutions ») — [arXiv 2109.07161](https://arxiv.org/abs/2109.07161).
- L'article PowerPaint rapporte que les sorties de LaMa en outpainting sont souvent peu nettes, faute de capacité générative — [arXiv 2312.03594](https://arxiv.org/pdf/2312.03594) (via résumé de recherche).
- LaMa reproduit bien les textures répétitives mais les structures et contours s'estompent quand le trou grandit — [arXiv 2208.03382](https://arxiv.org/pdf/2208.03382v1) ; LaMa est décrit comme conçu pour répéter des motifs réguliers — [arXiv 2205.01741](https://arxiv.org/pdf/2205.01741).

**MESURÉ (décor village 1024×506, extension +60 % en hauteur → 1024×810, 152 px en haut et en bas)**
- LaMa ONNX fp32 (entrée fixe 512×512) : **2,5–2,7 s par inférence** (1re série) ; **12–16 s** sous forte charge (charge moyenne 14,3 sur 4 cœurs).
- B — LaMa pleine résolution, 3 tuiles 512 qui se chevauchent par bande (6 inférences) : **27,2 s**. Visuel : ciel correct mais la couronne du baobab se prolonge en tache floue ; bande de sol floue, désaturée, gris-brun.
- C — LaMa global basse résolution (canevas entier réduit à 512², remplissage agrandi, collé seulement dans les bandes) : **7,0 s**. Visuel : meilleure continuité de la couronne et du ciel ; sol = bande grise uniforme (mauvaise couleur).
- D — MI-GAN pipeline v2 ONNX pleine résolution : **1,3–1,55 s** pour 1024×810 ; 1,50 s à 512² ; 1,76 s à 1024² (temps presque constant). Visuel : feuillage du baobab plus texturé, mais **ligne sombre horizontale à la jonction** et sol en taches brun foncé répétées.
- E — LaMa en bandes successives de 48 px (24 inférences) : 415,7 s sous forte charge ; le sol dérive vers un gris-bleu flou à chaque bande.
- F — MI-GAN en bandes de 48 px (4 inférences, 5,2 s) : **une ligne sombre à chaque couture**, sol transformé en mur gris avec pseudo-texte → inutilisable.
- A — Miroir (référence actuelle) : cases et baobab dupliqués et renversés, clairement visibles → contraire à la spécification.

### Inferences
- Le temps presque constant de MI-GAN entre 512² et 1024² laisse penser que le pipeline ONNX recadre autour du masque et génère à 512 avant de recoller (à confirmer dans `scripts/create_onnx_pipeline.py`).
- La ligne sombre de MI-GAN se forme à chaque bord de masque : un masque élargi de quelques pixels vers l'intérieur (recouvrement de 4–8 px) puis un fondu devrait la supprimer. Non testé.
- Répartition des rôles : LaMa ou MI-GAN pour les **petits trous** (coutures, désocclusions derrière les personnages, retouches), LaMa « global basse résolution » pour le **haut** (ciel, couronne) ; **jamais** pour une grande bande de sol. Le sol demande soit un modèle génératif (§2), soit une synthèse de texture sur le plan du sol (proposition ci-dessous).
- Proposition (à créer, aucune source) : **sol re-synthétisé sur son plan**. On redresse le sol peint en vue de dessus (homographie tirée de `floor.png` ou de la profondeur), on synthétise par patchs aléatoires un sol plus grand **sans symétrie**, puis on le reprojette. Critères d'acceptation : (1) aucune autocorrélation forte avec l'image retournée (test anti-miroir) ; (2) écart de couleur moyen entre la bande ajoutée et les 40 px de sol voisins inférieur à ΔE00 = 5 ; (3) aucune ligne de couture (gradient vertical à la jonction ≤ celui du sol d'origine).
- Calculer la marge à partir des mouvements de caméra prévus (inclinaison, recul, champ) au lieu d'un +60 % fixe : moins de surface à inventer, moins d'artefacts.

### Gaps
- Licences des poids ZITS, FcF, LDM (version IOPaint), Manga et AnimeLaMa : non trouvées.
- Aucun chiffre CPU publié par les auteurs de MI-GAN pour le pipeline ONNX (ils précisent que les temps de l'article ne viennent pas de l'ONNX).
- Pas de banc public LaMa contre MI-GAN sur de l'art peint ; seul notre test sur un décor existe.

## 2. Outpainting par diffusion (CPU local ou API bon marché) : licences, temps, prix, fidélité au style peint

### Takeaway
Le seul modèle de diffusion récent sous Apache-2.0 pour l'édition est **FLUX.2 [klein] 4B** (4 étapes, environ 13 Go de VRAM ; outpainting démontré par la communauté, pas par BFL). FLUX.1 Fill/Kontext [dev] et FLUX.2 klein 9B sont non commerciaux, et SD/SDXL/SD3.5 sont hors règle. Pour le CPU local, aucun chiffre d'inpainting publié. Par API, compter environ **0,014 à 0,05 $ par décor**, à payer une seule fois puis mettre en cache.

### Cited Findings
- FLUX.1 Fill [dev] : « FluxDev Non-Commercial License Agreement » (étiquette `flux-1-dev-non-commercial-license`) ; 12 milliards de paramètres ; exemple diffusers en 50 étapes, guidage 30 ; la page cite un Space « flux-fill-outpaint » — [FLUX.1-Fill-dev](https://huggingface.co/black-forest-labs/FLUX.1-Fill-dev). → **NON COMMERCIAL.**
- FLUX.1 Kontext [dev] : `flux-1-dev-non-commercial-license` ; FLUX.1 [schnell] : `apache-2.0` (aucune variante Fill officielle dérivée de schnell trouvée) — [FLUX.1-Kontext-dev](https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev), [FLUX.1-schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell).
- FLUX.2 [klein] 4B : « Open weights available for commercial use under the Apache 2.0 license » ; génération et édition multi-référence dans un même modèle ; exemple en 4 étapes ; « fits in ~13GB VRAM » ; les modèles klein 9B sont sous licence non commerciale — [FLUX.2-klein-4B](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B), [FLUX.2-klein-9B (étiquette flux-non-commercial-license)](https://huggingface.co/black-forest-labs/FLUX.2-klein-9B).
- Outpainting avec klein : démontré seulement par des workflows communautaires (inpainting masqué en 4 étapes, extension de canevas) — [RunComfy, FLUX.2 Klein Unified Image Editing](https://www.runcomfy.com/comfyui-workflows/flux-klein-unified-image-editing-inpaint-remove-outpaint-in-comfyui-advanced-image-restoration), [Civitai 2322343](https://civitai.com/models/2322343).
- Qwen-Image-Edit-2511 : étiquette `apache-2.0` — [Qwen-Image-Edit-2511](https://huggingface.co/Qwen/Qwen-Image-Edit-2511). SD 3.5 Large : `stabilityai-ai-community` (licence maison) — [SD 3.5 Large](https://huggingface.co/stabilityai/stable-diffusion-3.5-large).
- CPU : FastSD CPU (MIT) annonce 0,82 s pour une image 512×512 (SDXS + OpenVINO, Core i7-12700) en texte-vers-image ; il faut au moins 11 Go de RAM en mode OpenVINO ; aucun mode d'inpainting chiffré — [fastsdcpu](https://github.com/rupeshs/fastsdcpu), [LICENSE MIT](https://raw.githubusercontent.com/rupeshs/fastsdcpu/main/LICENSE). Tableau secondaire : SD Turbo 1,7 s et SDXL Turbo 2,5 s avec le petit décodeur — [localaimaster](https://localaimaster.com/blog/image-generation-without-gpu) (source secondaire).
- **Prix API** :
  - fal FLUX.1 Fill [pro] : « $0.05 per megapixel », mégapixel entamé = dû, masque obligatoire, « Commercial use permitted via fal partnership » — [fal flux-pro/v1/fill](https://fal.ai/models/fal-ai/flux-pro/v1/fill).
  - fal Bria Expand : 0,04 $ par image (même tarif chez Bria et Segmind ; 302.ai affiche 0,10 $) — [fal bria/expand](https://fal.ai/models/fal-ai/bria/expand), [Bria pricing](https://bria.ai/pricing).
  - FLUX.2 klein 4B (BFL) : 0,014 $ le premier mégapixel + 0,001 $ par mégapixel supplémentaire, même tarif pour l'édition (relevé via résultat de recherche, à reconfirmer) — [BFL, FLUX.2 pricing guide](https://help.bfl.ai/articles/7686530342-flux-2-pricing-guide), [OpenRouter klein 4b](https://openrouter.ai/models/black-forest-labs/flux.2-klein-4b).
  - Replicate flux-fill-pro : « state-of-the-art inpainting and outpainting », gère l'agrandissement du canevas ; prix non affiché sur la page — [Replicate flux-fill-pro](https://replicate.com/black-forest-labs/flux-fill-pro).
  - Pollinations (liste en direct `/image/models`, 16/10/2026) : `black-forest-labs/flux.2-klein-4b` « Fast image generation and editing up to 2.4 megapixels », 0,005 pollen par image, `paid_only: false` ; `qwen/qwen-image` (édition) 0,025 pollen ; `flux.2-pro` 0,01125 pollen ; `prunaai/p-image-edit` 0,01 pollen — [gen.pollinations.ai/image/models](https://gen.pollinations.ai/image/models).
  - Stability AI Outpaint : aucun prix officiel vérifié ; les agrégateurs se contredisent (taux de crédit 10 $ = 1 000 crédits) — [cloudprice](https://cloudprice.net/models/stability/outpaint), [puter](https://developer.puter.com/tutorials/stability-ai-api-pricing/).

### Inferences
- Coût unique : les 191 décors déjà en couches du projet coûteraient environ 191 × 0,014 $ ≈ 2,7 $ avec klein 4B chez BFL, ou 191 × 0,04 $ ≈ 7,6 $ avec Bria Expand (calcul fait sur les prix ci-dessus). Le résultat est mis en cache par décor ; aucun appel pendant le rendu.
- Pour garder le style peint, le plus prometteur est un modèle d'**édition par référence** (klein 4B, Kontext pro, Qwen-Image-Edit) qui reçoit le décor entier, plus qu'un Fill qui ne voit que le pourtour. Hypothèse à vérifier sur 3 à 5 décors avec le critère couleur/couture du §1.
- Voie locale conforme : klein 4B en Apache-2.0. Le temps CPU n'est pas connu et il faudrait au moins 13 Go de mémoire en bf16 d'après la fiche ; à mesurer avant tout plan. Sinon, klein 4B en API (Pollinations ou BFL) comme option payante.

### Gaps
- Aucun temps CPU publié pour l'inpainting SD/SDXL/FLUX ; aucun banc de « fidélité au style peint » entre Fill, Expand, Kontext et klein.
- Prix officiel BFL (la page charge ses prix dynamiquement), valeur du pollen en dollars, prix Stability Outpaint et Ideogram (reframe) : non confirmés.
- Support officiel de l'outpainting par klein 4B : non confirmé par BFL.

## 3. Profondeur pour l'art stylisé : licences, CPU, qualité sur peinture et dessin animé

### Takeaway
Options conformes : Depth Anything V2 **Small** (Apache-2.0) ; Depth Anything 3 **Small, Base, Mono-Large, Metric-Large** (Apache-2.0) ; **MoGe / MoGe-2** (code MIT, poids MIT sur HF). Base/Large de DA V2, Large/Giant de DA3, UniDepth, DepthCrafter, Depth Pro et SHARP sont **non commerciaux ou réservés à la recherche**. Aucun banc public ne couvre les peintures ou les dessins animés : il faut mesurer sur nos décors.

### Cited Findings
- Depth Anything V2 : Small-hf `apache-2.0`, Base-hf et Large-hf `cc-by-nc-4.0` — [V2-Small](https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf), [V2-Base](https://huggingface.co/depth-anything/Depth-Anything-V2-Base-hf), [V2-Large](https://huggingface.co/depth-anything/Depth-Anything-V2-Large-hf).
- Depth Anything 3 (14/11/2025) : code Apache-2.0 ; DA3-SMALL (0,08 Md) et DA3-BASE (0,12 Md) Apache 2.0 ; **DA3MONO-LARGE (0,35 Md) et DA3METRIC-LARGE (0,35 Md) Apache 2.0** ; DA3-LARGE(-1.1), GIANT et NESTED **CC BY-NC 4.0** ; DA3MONO-LARGE prédit directement la profondeur (pas la disparité) ; profondeur métrique = `focal * net_output / 300` — [Depth-Anything-3](https://github.com/ByteDance-Seed/Depth-Anything-3), [DA3MONO-LARGE](https://huggingface.co/depth-anything/DA3MONO-LARGE). ONNX communautaire de DA3 Small : Apache-2.0 ; sorties profondeur, confiance, extrinsèques, intrinsèques — [onnx-community/depth-anything-v3-small](https://huggingface.co/onnx-community/depth-anything-v3-small).
- Video Depth Anything : code Apache-2.0 ; Small `apache-2.0`, Large `cc-by-nc-4.0` — [LICENSE VDA](https://raw.githubusercontent.com/DepthAnything/Video-Depth-Anything/main/LICENSE), [VDA-Small](https://huggingface.co/depth-anything/Video-Depth-Anything-Small), [VDA-Large](https://huggingface.co/depth-anything/Video-Depth-Anything-Large).
- MoGe : code MIT (DINOv2 Apache-2.0) ; MoGe-2 ViT-S normal 35 M, ViT-B 104 M, ViT-L 326–331 M (métrique, normales) ; MoGe-3 publié le 18/08/2026 (370 M et 1,25 Md) ; 60 ms par image sur A100/3090 (FP16, ViT-L) ; export ONNX documenté — [MoGe](https://github.com/microsoft/MoGe). Poids sur HF étiquetés `mit` (moge-2-vitl-normal, moge-2-vits-normal, moge-vitl) — [moge-2-vits-normal](https://huggingface.co/Ruicheng/moge-2-vits-normal), [moge-2-vitl-normal](https://huggingface.co/Ruicheng/moge-2-vitl-normal). Licence des poids MoGe-3 : non vérifiée.
- Marigold : code Apache-2.0 ; poids marigold-depth-v1-1 sous **CreativeML Open RAIL++-M** (affiné depuis SD2, environ 768 px, 1 à 50 étapes DDIM) ; marigold-depth-lcm-v1-0 étiqueté `apache-2.0` — [LICENSE Marigold](https://raw.githubusercontent.com/prs-eth/Marigold/main/LICENSE.txt), [marigold-depth-v1-1](https://huggingface.co/prs-eth/marigold-depth-v1-1), [marigold-depth-lcm-v1-0](https://huggingface.co/prs-eth/marigold-depth-lcm-v1-0).
- Apple Depth Pro et SHARP : poids sous `apple-amlr`, réservés aux « Research Purposes », ce qui « does not include any commercial exploitation, product development » ; Depth Pro produit une carte de 2,25 Mpx en 0,3 s sur GPU — [LICENSE DepthPro (HF)](https://huggingface.co/apple/DepthPro), [ml-depth-pro](https://github.com/apple/ml-depth-pro), [apple/Sharp](https://huggingface.co/apple/Sharp). → **exclus.**
- UniDepth : LICENSE = Attribution-NonCommercial 4.0 → **exclu** — [LICENSE UniDepth](https://raw.githubusercontent.com/lpiccinelli-eth/UniDepth/main/LICENSE).
- DepthCrafter : « only for academic, research and education purposes … refrain from using it for any commercial or production purposes », code et poids — [LICENSE DepthCrafter](https://raw.githubusercontent.com/Tencent/DepthCrafter/main/LICENSE). → **exclu.**
- Metric3D : code BSD 2-Clause ; aucune licence déclarée sur la fiche des poids HF — [LICENSE Metric3D](https://raw.githubusercontent.com/YvanYin/Metric3D/main/LICENSE), [JUGGHM/Metric3D](https://huggingface.co/JUGGHM/Metric3D).
- Art stylisé : un article sur la profondeur des bandes dessinées souligne l'absence de vérité terrain, la variété des styles et des images « sparse and noisy » ; il traduit d'abord la BD en style photo — [EPFL, comics depth](https://graphsearch.epfl.ch/en/publication/289107). Sur images naturelles, Depth Anything donne des cartes moins nettes, Marigold des cartes nettes mais granuleuses, et les deux peinent sur le ciel — [PrimeDepth, arXiv 2409.09144](https://arxiv.org/pdf/2409.09144).
- **MESURÉ** (même série, sous charge moyenne 14,3) : DA3-Small ONNX 1,13–1,23 s à 518×266 et 5,35–7,03 s à 1008×504 ; DA V2 Small ONNX 0,92–1,17 s à 518×266 et 4,47–5,66 s à 1008×504.

### Inferences
- La montée en qualité sans licence non commerciale passe par **DA3MONO-LARGE** (0,35 Md, Apache) ou **MoGe-2 ViT-S/ViT-B** (MIT, normales en plus, utiles pour orienter le plan du sol). DA3-Small coûte à peu près le même temps CPU que DA V2 Small dans nos mesures.
- Le ciel est un point faible connu de tous les modèles : pour le décor, forcer la profondeur du ciel à l'infini par la segmentation (UperNet « sky ») plutôt que de croire la carte.

### Gaps
- Aucun banc public de profondeur sur peintures ou dessins animés comparant DA V2, DA3, MoGe et Marigold.
- Temps CPU de DA3MONO-LARGE, MoGe-2 et Marigold-LCM : non mesurés.
- Licence des poids Metric3D et MoGe-3 : non trouvée.

## 4. Profondeur en couches (LDI), photo 3D, séparation en plans, splatting depuis une seule image

### Takeaway
La recette conforme et faisable sur CPU consiste à découper l'image en plans par profondeur (et SAM 2.1, Apache-2.0, ou UperNet déjà en place), puis à remplir derrière chaque plan avec LaMa ou MI-GAN sur des bandes étroites. Les solutions toutes faites sont exclues par leur licence (DepthFlow AGPL-3.0, SHARP réservé à la recherche, LucidDreamer CC BY-NC-SA, Wonderland non commercial, SAM 3 sous licence maison) ou trop anciennes et pensées pour le GPU (3D Photo Inpainting : code MIT, 2–3 min par image, PyTorch 1.4 et CUDA 10.1).

### Cited Findings
- 3D Photography using Context-aware Layered Depth Inpainting (Shih et al. 2020) : code MIT ; profondeur MiDaS et trois réseaux d'inpainting (contours, profondeur, couleur) ; « usually takes about 2-3 minutes » ; PyTorch 1.4, cudatoolkit 10.1, testé sous Ubuntu 18.04 ; sorties `.ply` et vidéos ; licence des poids non indiquée — [3d-photo-inpainting](https://github.com/vt-vl-lab/3d-photo-inpainting), [LICENSE MIT](https://raw.githubusercontent.com/vt-vl-lab/3d-photo-inpainting/master/LICENSE).
- DepthFlow : **GNU AGPL-3.0** ; « up to 8k50fps rendering with an RTX 3060-class GPU » ; aucune fonction d'inpainting ni d'outpainting décrite — [DepthFlow](https://github.com/BrokenSource/DepthFlow), [license.txt](https://raw.githubusercontent.com/BrokenSource/DepthFlow/main/license.txt). → **hors règle** (le journal du 14/10 notait « licence non confirmée » : c'est maintenant confirmé).
- Apple SHARP (Gaussiennes 3D depuis une photo, « less than a second on a standard GPU ») : poids `apple-amlr` (recherche) ; code sous licence Apple — [ml-sharp README](https://cdn.jsdelivr.net/gh/apple/ml-sharp@main/README.md), [apple/Sharp](https://huggingface.co/apple/Sharp), [LICENSE ml-sharp](https://raw.githubusercontent.com/apple/ml-sharp/main/LICENSE). → **exclu.**
- LucidDreamer : Attribution-NonCommercial-ShareAlike 4.0 — [LICENSE LucidDreamer](https://raw.githubusercontent.com/luciddreamer-cvlab/LucidDreamer/main/LICENSE). Wonderland (Snap) : « for non-commercial, research purposes only » — [LICENSE Wonderland](https://raw.githubusercontent.com/snap-research/wonderland/main/LICENSE.txt). WonderWorld : aucun fichier LICENSE trouvé (branches main et master) — [WonderWorld](https://github.com/KovenYu/WonderWorld). → **exclus** (sans licence = tous droits réservés).
- Segmentation : SAM 2 code Apache-2.0, poids sam2.1-hiera-large `apache-2.0` — [LICENSE SAM 2](https://raw.githubusercontent.com/facebookresearch/sam2/main/LICENSE), [sam2.1-hiera-large](https://huggingface.co/facebook/sam2.1-hiera-large). SAM 3 : licence « SAM License » maison, accès soumis à acceptation (`gated: manual`) — [facebook/sam3](https://huggingface.co/facebook/sam3), [ScanCode sam-2025-11-19](https://scancode-licensedb.aboutcode.org/sam-2025-11-19.html). → **hors règle.**

### Inferences
- Remède à la « feuille de caoutchouc » sans nouveau modèle : (1) découper le maillage là où le gradient de profondeur dépasse un seuil (les triangles étirés sont supprimés ou rendus transparents) ; (2) derrière, un second maillage « plaque propre » remplie par LaMa ou MI-GAN sur un masque **dilaté de l'amplitude maximale de parallaxe** prévue (bande étroite, donc là où ces modèles sont bons) ; (3) poursuivre la profondeur du plan arrière dans la zone remplie. C'est le principe LDI de Shih et al., réduit à 2–3 couches. Critère d'acceptation : 0 triangle dont l'allongement dépasse 3 fois la taille d'origine dans le rendu, sur la trajectoire de caméra prévue.
- Le projet a déjà la séparation premier plan / plaque (`scene_layers.py`, UperNet + LaMa) : il manque l'étape (1) et la dilatation calculée d'après la caméra.

### Gaps
- SLIDE (Google, 2021) et « Single-image layered depth » : aucun code ni licence vérifiés dans cette veille.
- Pas d'alternative ouverte et conforme à Immersity trouvée ; pas de splatting depuis une seule image sous licence MIT/Apache trouvé.

## 5. Décor vivant à partir d'une peinture fixe (vent dans le feuillage, nuages)

### Takeaway
Les codes de cinémagraphe génératif sont sous licence permissive (3D Cinemagraphy Apache-2.0, LivePhoto Apache-2.0, Animate-Anything MIT, Text2Cinemagraph MIT, glb99/cinemagraph Apache-2.0), mais ils demandent un GPU et souvent des poids de base SD/ModelScope dont la licence n'a pas été vérifiée. La voie CPU temps réel reste le **shader procédural guidé par masque** (technique de Crysis, GPU Gems 3 chap. 16), à appliquer au maillage 2,5D existant.

### Cited Findings
- Licences des codes : 3D Cinemagraphy Apache-2.0 — [License](https://raw.githubusercontent.com/xingyi-li/3d-cinemagraphy/main/License) ; glb99/cinemagraph Apache-2.0 — [LICENSE](https://raw.githubusercontent.com/glb99/cinemagraph/main/LICENSE) ; LivePhoto Apache-2.0 — [LICENSE](https://raw.githubusercontent.com/XavierCHEN34/LivePhoto/main/LICENSE) ; Animate-Anything (Alibaba) MIT — [LICENSE](https://raw.githubusercontent.com/alibaba/animate-anything/main/LICENSE) ; Text2Cinemagraph MIT (« Copyright (c) 2023 pix2pixzero ») — [LICENSE](https://raw.githubusercontent.com/text2cinemagraph/text2cinemagraph/master/LICENSE). L'article Text2Cinemagraph est sous CC BY 4.0 (publication, pas le code) — [Crossref 10.1145/3618326](https://api.crossref.org/works/10.1145%2F3618326).
- Journal du projet (14/10/2026) : glb99/cinemagraph propose des effets procéduraux (oscillation, ondulation, vent), poids optionnels à part ; 3D Cinemagraphy demande un GPU — [veille-permanente](../../.claude/skills/veille-permanente/SKILL.md) (ligne du 14/10/2026).
- Technique procédurale de référence (Crysis) : « main bending » par les composantes xy du vent, pondéré par la hauteur, avec renormalisation `vPos.xyz = normalize(vNewPos.xyz) * fLength` ; « detail bending » piloté par couleurs de sommet (R raideur des bords, G décalage de phase par feuille, B raideur globale) ; ondes triangulaires lissées `SmoothCurve(x)=x*x*(3-2x)`, `TriangleWave(x)=abs(frac(x+0.5)*2-1)`, fréquences 1.975, 0.793, 0.375, 0.193 ; coût par sommet constant — [GPU Gems 3, ch. 16](https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis).

### Inferences
- Adaptation au maillage 2,5D : les canaux R/G/B de Crysis deviennent des **textures de masques** calculées une fois par décor. Hauteur relative dans l'objet (depuis la segmentation « tree/palm/plant »), distance au tronc (transformée de distance), phase = bruit à faible fréquence par composante connexe. Les nuages sont un défilement d'UV dans le masque « sky » avec une rafale commune corrélée au vent du feuillage. Tout tourne dans le shader three.js existant, à 0 s de calcul hors ligne, hors masques.
- Critères d'acceptation : boucle sans saut (première et dernière image identiques au pixel près pour une période choisie) ; déplacement maximal ≤ 2 % de la hauteur de l'arbre ; aucun pixel du sol déplacé (le masque du sol vaut 0).

### Gaps
- Licences des poids de LivePhoto, Animate-Anything et Text2Cinemagraph (modèles de base) : non vérifiées.
- Temps CPU de ces modèles : non publiés ; tous sont décrits ou dépendants d'un GPU.
- Eulerian Motion Fields et « Make-It-Move » : aucun code officiel ni licence vérifiés dans cette veille.

## 6. Synthèse des temps CPU vers 1024 px (mesurés ou publiés)

### Takeaway
Sur 4 cœurs, MI-GAN est l'inpainteur le plus rapide (environ 1,3–1,8 s, quelle que soit la taille jusqu'à 1024²). Une inférence LaMa 512² prend 2,5–2,7 s (et jusqu'à 16 s si la machine est chargée). La profondeur Small (DA V2 ou DA3) prend environ 1 s à 518 px et 4,5–7 s à 1008 px. Les modèles génératifs (diffusion, cinémagraphes, LDI 2020) n'ont aucun temps CPU publié : ils passent par l'API ou un GPU.

### Cited Findings
- **MESURÉ** : LaMa ONNX 512² 2,5–2,7 s (puis 12–16 s sous charge 14,3) ; extension +60 % : B 27,2 s, C 7,0 s, E 415,7 s (sous charge) ; MI-GAN v2 ONNX : 1,50 s à 512², 1,76 s à 1024², 1,3–1,55 s à 1024×810, 5,2 s pour 4 bandes ; DA3-Small ONNX 1,13–1,23 s à 518×266 et 5,35–7,03 s à 1008×504 ; DA V2 Small ONNX 0,92–1,17 s et 4,47–5,66 s.
- Mesure précédente du projet : DA V2 Small 0,87 s à 630×518 ; LaMa ≈ 5–40 s par décor — [note du 14/10/2026](../../workbench/research_notes/veille-video-html-3d/2026-10-14.md).
- Publiés (GPU) : MoGe ViT-L 60 ms sur A100/3090 FP16 — [MoGe](https://github.com/microsoft/MoGe) ; Depth Pro 0,3 s pour 2,25 Mpx — [ml-depth-pro](https://github.com/apple/ml-depth-pro) ; 3D Photo Inpainting 2–3 min — [3d-photo-inpainting](https://github.com/vt-vl-lab/3d-photo-inpainting) ; FastSD CPU 0,82 s pour 512² en texte-vers-image (pas d'inpainting) — [fastsdcpu](https://github.com/rupeshs/fastsdcpu).

### Inferences
- Budget réaliste par décor, entièrement local et conforme : profondeur DA3/DA V2 Small (≈ 1–6 s) + désocclusions MI-GAN ou LaMa (quelques secondes) + haut du cadre par LaMa global (≈ 7 s) + masques de vent (< 1 s, non mesuré). Soit **moins de 30 s par décor sur 4 cœurs libres**, hors sol étendu. Le sol étendu passe par l'API klein 4B (≈ 0,014 $, une fois) ou par la synthèse de texture sur plan proposée au §1.
- Les temps mesurés varient d'un facteur 5 selon la charge : un banc de qualification doit relever la charge moyenne avec chaque mesure (déjà fait ici).

### Gaps
- Temps CPU de FLUX.2 klein 4B, DA3MONO-LARGE, MoGe-2 et Marigold-LCM : non mesurés (téléchargements lourds non tentés dans cette veille).
- Aucune série de mesures sur une machine sans autre charge.
