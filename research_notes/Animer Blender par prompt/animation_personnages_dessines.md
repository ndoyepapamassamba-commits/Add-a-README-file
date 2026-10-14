# Animer des personnages DESSINÉS (planche d'un seul dessin) par pose, vidéo, voix ou texte — état de l'art au 14/10/2026

Méthode (14/10/2026) : chaque licence ci-dessous a été LUE sur la source d'origine — fichier LICENSE du dépôt GitHub officiel
(lu via raw.githubusercontent.com) et/ou métadonnées de la fiche Hugging Face officielle (API `huggingface.co/api/models/…`).
« Vérifiée » = texte lu ; « annoncée » = vue seulement dans un README ou un résumé ; « introuvable » = aucun fichier LICENSE
sur `main`/`master`. Code et POIDS sont distingués : une licence de code MIT/Apache ne couvre pas des poids non commerciaux,
et une dépendance (détecteur, modèle de corps SMPL, éditeur d'image) peut bloquer à elle seule. Règle maison : MIT,
Apache-2.0, BSD seulement. Toutes les pages ont été consultées le 14/10/2026 ; les dates de sortie sont celles des dépôts.

## 1. Animation d'une image de personnage pilotée par pose / vidéo de référence — lesquels tiennent les proportions cartoon (grosses têtes) ?

### Takeaway
Trois modèles 2026 changent la donne et sont sous licence libre vérifiée : **Wan-Animate-2** (Apache-2.0, 07/08/2026,
« de bout en bout » sans extracteur de pose intermédiaire, démo avec un chat anthropomorphe), **SCAIL-2** (code Apache-2.0,
poids MIT, mode « end-to-end » qui contourne le squelette et accepte même des animaux comme source) et **One-to-All
Animation** (Apache-2.0, « alignment-free », données cartoon dans l'entraînement, tourne sur un T4 gratuit en 1.3B). Le
classique **Wan2.2-Animate** (Apache-2.0) reste le plus intégré (modes animation ET remplacement, LoRA de ré-éclairage)
mais son prétraitement dépend d'un squelette humain, d'un détecteur YOLOv10 sous AGPL-3.0 et, pour le reciblage
« amélioré », de FLUX.1-Kontext-dev non commercial. MimicMotion, MusePose, MultiAnimate (poids) et Animate Anyone 2
(aucun code) sont exclus.

### Cited Findings

**Tableau de licences vérifiées (code / poids / dépendances bloquantes)**

| Modèle | Code | Poids | Dépendance à signaler | Sources |
|---|---|---|---|---|
| Wan-Animate-2 (Wan2.2-Animate-2-14B, Base + Distillation) | Apache-2.0 vérifiée | Apache-2.0 (fiche HF) | légende de l'image par un LLM (Qwen3.7-Plus suggéré) ; aucune autre dépendance repérée dans le README | [LICENSE](https://github.com/Wan-Video/Wan-Animate-2/blob/main/LICENSE), [HF](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B), [HF distillé](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B-Distilled-Diffusers) |
| Wan2.2-Animate-14B | Apache-2.0 vérifiée | Apache-2.0 (fiche HF) | prétraitement : `yolov10m.onnx` (YOLOv10 = AGPL-3.0), ViTPose (Apache-2.0), SAM2 (Apache-2.0), FLUX.1-Kontext-dev optionnel (licence « flux-1-dev-non-commercial-license ») | [LICENSE](https://github.com/Wan-Video/Wan2.2/blob/main/LICENSE.txt), [HF](https://huggingface.co/Wan-AI/Wan2.2-Animate-14B), [guide](https://github.com/Wan-Video/Wan2.2/blob/main/wan/modules/animate/preprocess/UserGuider.md), [YOLOv10](https://github.com/THU-MIG/yolov10/blob/main/LICENSE), [ViTPose](https://github.com/ViTAE-Transformer/ViTPose/blob/main/LICENSE), [SAM2](https://github.com/facebookresearch/sam2), [FLUX Kontext](https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev) |
| SCAIL-2 (zai-org) | Apache-2.0 vérifiée | MIT (fiche HF, maj 15/07/2026) | prétraitement SCAIL-Pose (Apache-2.0) : SAM3 (« SAM License » maison, accès sur formulaire), DWPose, mention SMPL | [LICENSE](https://github.com/zai-org/SCAIL-2/blob/master/LICENSE), [HF](https://huggingface.co/zai-org/SCAIL-2), [SCAIL-Pose](https://github.com/zai-org/SCAIL-Pose), [SAM3 LICENSE](https://github.com/facebookresearch/sam3/blob/main/LICENSE) |
| SCAIL (Preview, CVPR 2026 Findings) | Apache-2.0 vérifiée | MIT (fiche HF) | poses par NLF : code MIT mais modèles « noncommercial research use » | [LICENSE](https://github.com/zai-org/SCAIL/blob/master/LICENSE), [HF](https://huggingface.co/zai-org/SCAIL-Preview), [NLF](https://github.com/isarandi/nlf) |
| One-to-All Animation (1.3B v1/v2, 14B) | Apache-2.0 vérifiée | Apache-2.0 (fiches HF) | — | [LICENSE](https://github.com/ssj9596/One-to-All-Animation/blob/main/LICENSE), [HF 14B](https://huggingface.co/MochunniaN1/One-to-All-14b), [HF 1.3B](https://huggingface.co/MochunniaN1/One-to-All-1.3b_2) |
| SteadyDancer-14B | Apache-2.0 vérifiée | Apache-2.0 (fiche HF, + GGUF officiel) | DWPose, YOLOX | [LICENSE](https://github.com/MCG-NJU/SteadyDancer/blob/main/LICENSE), [HF](https://huggingface.co/MCG-NJU/SteadyDancer-14B) |
| UniAnimate-DiT | **introuvable** (aucun LICENSE sur main/master ; README « intended for academic research ») | MIT (fiche HF) | DWPose, YOLOX | [GitHub](https://github.com/ali-vilab/UniAnimate-DiT), [HF](https://huggingface.co/ZheWang123/UniAnimate-DiT) |
| Animate-X (ICLR 2025) | Apache-2.0 vérifiée | **non indiquée** sur la fiche HF | DWPose, YOLOX | [LICENSE](https://github.com/antgroup/animate-x/blob/main/LICENSE), [HF](https://huggingface.co/Shuaishuai0219/Animate-X) |
| StableAnimator | MIT vérifiée (dépôt) — la fiche HF dit Apache-2.0 (incohérence) | Apache-2.0 (fiche HF) | **antelopev2 / InsightFace** (12 mentions dans le README) | [LICENSE](https://github.com/Francis-Rings/StableAnimator/blob/main/LICENSE), [HF](https://huggingface.co/FrancisRing/StableAnimator) |
| MimicMotion | Apache-2.0 (hors composants tiers) | **recherche/éducation seulement** + licence communautaire Stability (SVD) | — | [LICENSE code](https://github.com/Tencent/MimicMotion/blob/main/LICENSE), [LICENSE poids](https://huggingface.co/tencent/MimicMotion/blob/main/LICENSE) |
| MusePose | MIT | **« non-commercial research purposes only »** | — | [README/LICENSE](https://github.com/TMElyralab/MusePose) |
| MultiAnimate (CVPR 2026, multi-personnages) | Apache-2.0 vérifiée | **CC-BY-NC-4.0** (fiche HF liée par le README officiel) | DWPose | [LICENSE](https://github.com/hyc001/MultiAnimate/blob/main/LICENSE), [HF](https://huggingface.co/N00B0DY/MultiAnimate) |
| DisPose | **introuvable** | non indiquée (fiche HF) | InsightFace | [GitHub](https://github.com/lihxxx/DisPose), [HF](https://huggingface.co/lihxxx/DisPose) |
| RealisDance | Apache-2.0 (fichier) mais README « released for academic use » | — | — | [GitHub](https://github.com/theFoxofSky/RealisDance) |
| Champ / MagicAnimate (2023-2024) | MIT / BSD-3 | non vérifiés | non vérifié | [Champ](https://github.com/fudan-generative-vision/champ), [MagicAnimate](https://github.com/magic-research/magic-animate) |
| VACE (Wan2.1-VACE 1.3B/14B) | Apache-2.0 vérifiée | Apache-2.0 (tableau du README ; VACE-LTX = RAIL-M) | — | [GitHub](https://github.com/ali-vilab/VACE) |
| AniCrafter | introuvable (GitHub) | Apache-2.0 (fiche HF, maj 14/07/2026) | non vérifié | [HF](https://huggingface.co/MyNiuuu/Anicrafter_release) |
| Animate Anyone 2 | **aucun code** : le dépôt ne contient que « Project Page for Animate Anyone 2 » | — | — | [GitHub](https://github.com/HumanAIGC/animate-anyone-2) |
| HumanDiT | aucun dépôt de code trouvé | — | — | [arXiv 2502.04847](https://arxiv.org/abs/2502.04847) |

**Wan-Animate-2 (nouveau, août 2026)**
- Inférence + poids Base et Distillation publiés le 07/08/2026 ; intégrations Diffusers, DiffSynth-Studio et ComfyUI cochées
  dans la fiche — [HF Wan2.2-Animate-2-14B](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B).
- « end-to-end character animation framework that directly consumes driving videos … by eliminating intermediate motion
  extractors » ; « text-driven viewpoint control to decouple the output camera perspective from the driving video » ;
  variante Wan-Animate-2-Lite « real-time thresholds for streaming » — [HF](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B),
  [arXiv 2608.06009 (06/08/2026)](https://arxiv.org/abs/2608.06009).
- Le résumé arXiv ne promet que la publication des poids **Base** ; rien sur les poids Lite, aucun chiffre d'i/s —
  [arXiv 2608.06009](https://arxiv.org/abs/2608.06009).
- Réglages par défaut prévus pour 8× A800 en 720p ; 480p testé sur 2× A800 ; version distillée = 10 pas sans CFG —
  [HF](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B).
- L'exemple officiel anime « un petit chat tigré gris argent … aux grands yeux ronds, en uniforme bleu marine à boutons dorés »
  (personnage anthropomorphe stylisé) ; la légende de l'image doit être écrite en chinois selon un gabarit — [HF](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B).

**Wan2.2-Animate-14B (sept. 2025)**
- Deux modes : « animation » (le personnage imite le mouvement humain de la vidéo) et « replacement » (le personnage remplace
  celui de la vidéo) — [README Wan2.2](https://github.com/Wan-Video/Wan2.2).
- Article : signaux squelettiques alignés spatialement pour le corps, traits faciaux implicites pour les expressions,
  « auxiliary Relighting LoRA » pour accorder lumière et couleurs en remplacement ; le résumé ne mentionne PAS les
  personnages stylisés/cartoon — [arXiv 2509.14055](https://arxiv.org/abs/2509.14055).
- Proportions : « highly recommended to enable pose retargeting, especially if the body proportions of the reference and
  driving characters are dissimilar » ; le reciblage de base exige que les deux personnages soient de face, bras tendus ; le
  reciblage « amélioré » passe par FLUX.1-Kontext-dev et « is NOT guaranteed » ; en mode remplacement le reciblage est
  désactivé et « artifacts or deformations may appear » si les proportions diffèrent ; extraction du masque « single-person
  videos ONLY » — [UserGuider](https://github.com/Wan-Video/Wan2.2/blob/main/wan/modules/animate/preprocess/UserGuider.md).
- Intégré à Diffusers le 13/11/2025 — [README Wan2.2](https://github.com/Wan-Video/Wan2.2) ; GGUF communautaire
  (QuantStack, étiquette Apache-2.0) — [HF](https://huggingface.co/QuantStack/Wan2.2-Animate-14B-GGUF).

**SCAIL / SCAIL-2 (Zhipu / zai-org)**
- SCAIL-2 : le squelette « restricts the driving source to be exocentric human movements and thus cannot handle driving
  sources like animals » → mode « end-to-end » sans pose ; mode pose aussi disponible ; remplacement ; multi-références
  (13/06/2026, ComfyUI 17/06/2026) ; LoRA de ré-éclairage pour le remplacement (15/07/2026) ; code d'entraînement
  (06/08/2026) ; 512p et 704p — [README SCAIL-2](https://github.com/zai-org/SCAIL-2).
- Données d'entraînement de SCAIL-2 synthétisées avec SCAIL-Preview, Wan-Animate et MoCha (60K paires) + « Bias-Aware DPO »
  (LoRA DPO publiée) — [README SCAIL-2](https://github.com/zai-org/SCAIL-2).
- Reconditionnement ComfyUI officiel Comfy-Org (fp16, fp8, int8, mxfp8, nvfp4 + LoRA DPO et relight), étiquette MIT —
  [HF Comfy-Org/SCAIL-2](https://huggingface.co/Comfy-Org/SCAIL-2).
- SCAIL-1 : « only 1.5% of SCAIL's training samples are anime data … the model can generalize towards many complex anime
  characters » ; fiche des poids : « stylized characters, and multi-character interactions » ; WanGP l'exécute en faible
  VRAM (19/12/2025), Kijai l'a intégré (16/12/2025) — [README SCAIL](https://github.com/zai-org/SCAIL),
  [HF SCAIL-Preview](https://huggingface.co/zai-org/SCAIL-Preview).

**Autres modèles pose/vidéo**
- One-to-All Animation : « Alignment-Free Character Animation » ; données « pre-processed open-source datasets +
  self-collected cartoon data » ; accepte une pose reciblée ou la pose directe de la vidéo ; 14B intégré au wrapper Kijai —
  [README](https://github.com/ssj9596/One-to-All-Animation).
- SteadyDancer : paradigme image-vers-vidéo avec « robust first-frame preservation », traite les « spatial-structural
  inconsistencies » entre image source et vidéo pilote (benchmark X-Dance) — [README](https://github.com/MCG-NJU/SteadyDancer).
- Animate-X : « universal animation framework … for various character types (collectively named X), including
  anthropomorphic characters » ; construit sur UniAnimate, MimicMotion, MusePose — [README](https://github.com/antgroup/animate-x).
- Animate-X++ (arXiv 2508.09454, août 2025) : passage au DiT, arrière-plans dynamiques ; aucun code trouvé — [arXiv](https://arxiv.org/abs/2508.09454).
- MultiAnimate (CVPR 2026) : entraîné sur des paires à 2 personnages, produit 3 et 4 personnages ; modèle « étendu » —
  [README](https://github.com/hyc001/MultiAnimate) (poids non commerciaux, voir tableau).
- UniAnimate-DiT : ≈ 23 Go de VRAM pour 81 images 832×480, ≈ 36 Go en 1280×720 — [HF](https://huggingface.co/ZheWang123/UniAnimate-DiT).

**Piloter par TEXTE (prompt) plutôt que par vidéo**
- Wan-Animate-2 prend un texte, mais pour l'apparence et le point de vue ; le mouvement vient de la vidéo pilote —
  [HF](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B).
- HY-Motion 1.0 (Tencent, texte → mouvement 3D, 30/12/2025) : « TENCENT HY-MOTION 1.0 COMMUNITY LICENSE … DOES NOT APPLY IN
  THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA » → hors règle — [License.txt](https://github.com/Tencent-Hunyuan/HY-Motion-1.0/blob/master/License.txt).

**Runtimes communautaires (communauté)**
- ComfyUI-WanVideoWrapper (Kijai) : Apache-2.0 vérifiée — [LICENSE](https://github.com/kijai/ComfyUI-WanVideoWrapper/blob/main/LICENSE) ;
  LightX2V (distillation 4 pas) : Apache-2.0 vérifiée — [LICENSE](https://github.com/ModelTC/LightX2V/blob/main/LICENSE).
- Wan2GP / WanGP : « WanGP Community License 2.0 » (licence maison, gratuite en local) → hors règle MIT/Apache/BSD ;
  revendique 6 Go de VRAM pour certains modèles ; v17.17 du 07/10/2026 — [LICENSE.txt](https://github.com/deepbeepmeep/Wan2GP/blob/main/LICENSE.txt),
  [README](https://github.com/deepbeepmeep/Wan2GP).
- DWPose (poids) : Apache-2.0 sur la fiche HF — [HF](https://huggingface.co/yzd-v/DWPose).

### Inferences
- Pour des personnages à grosse tête, les approches SANS squelette humain intermédiaire (Wan-Animate-2, SCAIL-2 end-to-end)
  ou explicitement « alignment-free » (One-to-All) sont a priori les plus adaptées : le guide officiel de Wan2.2-Animate
  reconnaît lui-même que des proportions différentes dégradent le résultat. À MESURER sur nos planches (aucun banc public
  cartoon/grosse-tête trouvé).
- Wan2.2-Animate reste utilisable sous la règle maison à condition de NE PAS activer `use_flux` (FLUX Kontext non commercial)
  et de remplacer le détecteur YOLOv10 (AGPL-3.0) par un détecteur Apache (YOLOX, déjà utilisé par DWPose/SteadyDancer) —
  adaptation à tester, pas une option officielle.
- SCAIL-2 est utilisable si les masques sont produits sans SAM3 (ex. SAM2 Apache-2.0 ou BiRefNet MIT déjà au registre) et si
  la voie end-to-end évite les poses NLF/SMPL ; à vérifier dans le code de SCAIL-Pose.
- Le texte ne pilote pas directement le geste dans ces modèles : pour une animation « par prompt », chaîner un générateur
  de vidéo-pilote (T2V Apache, ex. Wan2.2) ou nos propres clips Blender (marionnette actuelle) comme vidéo pilote, puis
  Wan-Animate-2 / SCAIL-2 pour l'identité du dessin.
- Animate Anyone 2 est de fait remplacé par Wan-Animate (même équipe HumanAIGC : la page Wan-Animate est sur
  humanaigc.github.io, cf. lien du README Wan2.2).

### Gaps
- Aucune mesure indépendante de qualité sur personnages cartoon à grosse tête pour Wan-Animate-2, SCAIL-2, One-to-All,
  SteadyDancer (seules des affirmations d'auteurs).
- VRAM minimale de Wan-Animate-2 sur UN GPU grand public : non publiée (seulement 8× / 2× A800).
- Poids de Wan-Animate-2-Lite (temps réel) : publication non annoncée.
- Licence des poids `yolov10m.onnx` fournis avec Wan2.2-Animate : non lue (seul le code YOLOv10 AGPL-3.0 est vérifié).
- Licence exacte des poids Animate-X : absente de la fiche HF. Code d'Animate-X++ et de HumanDiT : non trouvés.
- Les licences des modèles InsightFace antelopev2 (StableAnimator, DisPose) n'ont pas été relues ici ; le registre maison
  classe déjà InsightFace buffalo_l en « non commercial ».

## 2. Outils d'animation de DESSINS 2D : rig automatique d'un seul dessin, calques, Live2D, interpolation

### Takeaway
**Meta AnimatedDrawings est bien MIT (code, poids ET jeu de données Amateur Drawings, vérifié)** et fait exactement
« dessin → squelette → mouvement BVH reciblé », mais son squelette n'a que 16 articulations (mains = un point, pas de doigts,
pas de tête séparée). La vraie nouveauté 2026 est la **décomposition d'une illustration en calques animables** (See-through,
fév. 2026 ; Bunraku, juil. 2026 → maillages par calque façon Live2D) — sans code public trouvé — et, côté libre,
**Qwen-Image-Layered (Apache-2.0)** et **Inochi2D (BSD-2)**. ToonCrafter, ToonComposer, LayerAnimate et AniDoc sont sous
licences libres mais servent à l'interpolation/colorisation entre images clés, pas au rig.

### Cited Findings
- AnimatedDrawings : « Animated Drawings code, model weights, and Amateur Drawings dataset is released under the MIT license »
  (ChildlikeSHAPES en CC-BY 4.0) ; fichier LICENSE = MIT — [README](https://github.com/facebookresearch/AnimatedDrawings),
  [LICENSE](https://github.com/facebookresearch/AnimatedDrawings/blob/main/LICENSE).
- AnimatedDrawings : l'image est « detected, segmented, and rigged, and it was animated using BVH motion data » ; « any
  motion clip … as long as it is in BVH format » ; squelette différent → nouveaux fichiers motion/retarget (exemple Rokoko
  au preset Mixamo) — [README](https://github.com/facebookresearch/AnimatedDrawings) ; exemple de mouvement
  `examples/bvh/fair1/dab.bvh` — [dab.yaml](https://github.com/facebookresearch/AnimatedDrawings/blob/main/examples/config/motion/dab.yaml).
- AnimatedDrawings, articulations du personnage : root, hip, torso, neck, épaules, coudes, mains, hanches, genoux, pieds
  (16) — [char_cfg.yaml](https://github.com/facebookresearch/AnimatedDrawings/blob/main/examples/characters/char1/char_cfg.yaml).
- AnimatedDrawings : export MP4 ou **GIF transparent**, rendu sans écran via `USE_MESA: True` ; détection/pose servies par
  un conteneur Docker TorchServe — [README](https://github.com/facebookresearch/AnimatedDrawings).
- DrawingSpinUp (SIGGRAPH Asia 2024) : aucun fichier LICENSE ; reconstruit le dessin en 3D, rig « generated by Mixamo »
  (service Adobe en ligne), rendu Blender 3.6 ; expériences sur une RTX 4090 (2080 Ti « OK ») — [README](https://github.com/LordLiang/DrawingSpinUp).
- ToonCrafter : LICENSE Apache-2.0 sur GitHub ; fiche HF : « Feel free to use it under the Apache-2.0 license » (une phrase
  « only be used for personal/research/non-commercial purposes » subsiste en commentaire HTML) ; README : « open-source
  research exploration, instead of commercial products » — [LICENSE](https://github.com/Doubiiu/ToonCrafter/blob/main/LICENSE),
  [HF](https://huggingface.co/Doubiiu/ToonCrafter), [README](https://github.com/Doubiiu/ToonCrafter).
- ToonCrafter : interpolation entre 2 images clés + texte, ≈ 2 s (16 images, 512×320, 8 i/s) ; 24–27 Go de VRAM signalés,
  ≈ 10 Go selon la communauté, version fp16 à 12 Go — [HF](https://huggingface.co/Doubiiu/ToonCrafter), [README](https://github.com/Doubiiu/ToonCrafter).
- ToonComposer (Tencent ARC, 2025) : « licensed under the MIT License except for the third-party components » ; poids HF
  MIT — [LICENSE](https://github.com/TencentARC/ToonComposer/blob/main/LICENSE), [HF](https://huggingface.co/TencentARC/ToonComposer).
- LayerAnimate (ICCV 2025) : contrôle par calques (ex. un calque immobile, un calque à trajectoire) ; variante DiT sur
  Wan2.1 1.3B, 81 images 480×832 ; code Apache-2.0, poids HF MIT — [README](https://github.com/IamCreateAI/LayerAnimate),
  [LICENSE](https://github.com/IamCreateAI/LayerAnimate/blob/main/LICENSE.txt), [HF](https://huggingface.co/Yuppie1204/LayerAnimate-DiT).
- AniDoc : colorise une SUITE de croquis d'après une planche de personnage ; 14 images attendues ; ≈ 14 Go de VRAM en
  inférence ; pas de fichier LICENSE (badge Apache dans le README), poids HF MIT — [README](https://github.com/yihao-meng/AniDoc),
  [HF](https://huggingface.co/Yhmeng1106/anidoc).
- Sketch2Anim : le dépôt ne contient que le site du projet (licence du site CC BY-SA 4.0) ; aucun code — [GitHub](https://github.com/zhongleilz/Sketch2Anim).
- See-through (arXiv 2602.03749, 03/02/2026) : une illustration anime → calques sémantiques entièrement repeints sous les
  occlusions, ordre de dessin par pseudo-profondeur, supervision tirée de modèles Live2D commerciaux, vise des « modèles
  2.5D manipulables » ; code/poids non confirmés ; article sous CC BY-NC-SA 4.0 — [arXiv](https://arxiv.org/abs/2602.03749).
  Nombre de calques non donné par arXiv ; les sources secondaires se contredisent (19 calques selon un résumé de recherche,
  23 selon le titre de note.com) ; acceptation conditionnelle à SIGGRAPH 2026 évoquée, non confirmée —
  [note.com (communauté)](https://note.com/ai_driven/n/nafe907059646?hl=en).
- Bunraku (arXiv 2607.27348, 29/07/2026) : illustration unique → pile RGBA ordonnée (diffusion par calques, parties
  cachées complétées) → maillage triangulaire par calque depuis l'alpha → décalages de sommets par « keypose » prédits
  conjointement ; corpus de 8 884 modèles Live2D ; cosinus de direction par sommet 0,768 (médiane 0,828) sur 50 personnages
  ; aucun code annoncé sur arXiv (page projet bunraku-live2d.github.io) — [arXiv](https://arxiv.org/abs/2607.27348).
- Qwen-Image-Layered (déc. 2025) : « licensed under Apache 2.0 » (code) et étiquette apache-2.0 sur la fiche HF ; GGUF et
  version ComfyUI disponibles — [LICENSE](https://github.com/QwenLM/Qwen-Image-Layered/blob/main/LICENSE),
  [HF](https://huggingface.co/Qwen/Qwen-Image-Layered).
- Inochi2D (alternative ouverte à Live2D) : Inochi Creator et Inochi Session sous BSD 2-Clause — [creator](https://github.com/Inochi2D/inochi-creator/blob/main/LICENSE),
  [session](https://github.com/Inochi2D/inochi-session/blob/main/LICENSE).
- Pose Animator (2020) : personnages SVG animés par capture de mouvement dans le navigateur, Apache-2.0 — [LICENSE](https://github.com/yemount/pose-animator/blob/master/LICENSE),
  [blog TensorFlow](https://blog.tensorflow.org/2020/05/pose-animator-open-source-tool-to-bring-svg-characters-to-life.html).
- Rig automatique 3D (utile si le dessin est « gonflé » en 3D comme dans notre architecture corps 3D / peau 2D) : UniRig
  (MIT) et Make-It-Animatable (MIT) — [UniRig](https://github.com/VAST-AI-Research/UniRig/blob/main/LICENSE),
  [Make-It-Animatable](https://github.com/jasongzy/Make-It-Animatable/blob/main/LICENSE).
- Outil commercial (non retenu) : générateur « AI Spine » qui découpe et auto-rigge vers Spine — [page produit](https://www.godmodeai.co/ai-spine-animation).

### Inferences
- Le verrou « les bras ne bougent pas indépendamment du dessin » est un problème de CALQUES, pas de modèle vidéo : une
  décomposition en calques (Qwen-Image-Layered Apache-2.0 aujourd'hui ; See-through / Bunraku si leur code sort) + un
  maillage par calque (ARAP déjà dans le moteur) + un squelette avec mains donnerait des gestes réels dans Blender, en
  temps réel et sans GPU au rendu.
- AnimatedDrawings (MIT) apporte surtout une chaîne éprouvée BVH → squelette 2D ; son squelette sans doigts ni tête est
  inférieur à notre rig actuel pour les gestes de mains — à réutiliser pour le reciblage BVH, pas comme moteur.
- DrawingSpinUp est hors règle en pratique (pas de licence + compte Mixamo, contraire à la consigne « pas de compte »).
- ToonCrafter / ToonComposer / AniDoc / LayerAnimate conviennent à une finition « dessin animé » (intervalles entre deux
  poses dessinées de la troupe) plutôt qu'à l'animation pilotée par prompt.

### Gaps
- Code et licence de See-through et de Bunraku : non trouvés (articles sous CC BY-NC-SA ; ne dit rien des futurs poids).
- Qualité de Qwen-Image-Layered sur nos planches (séparation bras/torse, parties cachées) : non mesurée ; fonction exacte
  non relue en détail dans la fiche.
- ToonComposer : fonctionnement et base (Wan ?) non relus ici ; licences des composants tiers non détaillées.
- Aucun outil libre vérifié ne fait aujourd'hui « dessin unique → rig Live2D/Spine complet avec doigts » de bout en bout.

## 3. Personnages qui parlent ET jouent (haut du corps, gestes) pilotés par la voix — licences, styles cartoon, dialogues à plusieurs, vitesse

### Takeaway
Sous licence libre vérifiée, trois familles couvrent le besoin « dialogue à plusieurs personnages cartoon avec gestes » :
**LongCat-Video-Avatar 1.5** (Meituan, **MIT**, 21/05/2026 : anime, animaux, multi-personnes, 8 pas distillés, INT8),
**MultiTalk / InfiniteTalk** (MeiGen, **Apache-2.0** : conversation multi-personnes, cartoon, prompt d'interaction,
faible VRAM) et **Wan2.2-S2V / Live Avatar** (Apache-2.0, plein corps, Live Avatar revendique la généralisation aux
personnages cartoon). Plus légers : **EchoMimic v3** (Apache-2.0, 1,3 B, 12–16 Go), **StableAvatar** (MIT, 18 Go,
3 min pour 5 s sur 4090), **OmniAvatar** et **FantasyTalking** (Apache-2.0, modes 5–8 Go). Exclus : HunyuanVideo-Avatar
(licence communautaire Tencent hors UE/RU/Corée), Hallo3 (licence CogVideoX), Sonic (CC BY-NC-SA).

### Cited Findings

| Modèle | Code | Poids | Multi-perso. / cartoon (affirmations des auteurs) | Sources |
|---|---|---|---|---|
| LongCat-Video-Avatar 1.5 (21/05/2026) | MIT vérifiée (LongCat-Video) | MIT (fiche HF) | « Robustly generalizes to anime, animals … multi-person interactions and object handling » | [LICENSE](https://github.com/meituan-longcat/LongCat-Video/blob/main/LICENSE), [HF](https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5) |
| MultiTalk (NeurIPS 2025) | Apache-2.0 vérifiée | Apache-2.0 (fiche HF) | multi-personnes, « cartoon character and singing », interactions suivant le prompt | [LICENSE](https://github.com/MeiGen-AI/MultiTalk/blob/main/LICENSE.txt), [HF](https://huggingface.co/MeiGen-AI/MeiGen-MultiTalk) |
| InfiniteTalk | Apache-2.0 vérifiée | Apache-2.0 (fiche HF) | doublage vidéo→vidéo et image→vidéo, longueur illimitée | [LICENSE](https://github.com/MeiGen-AI/InfiniteTalk/blob/main/LICENSE.txt), [HF](https://huggingface.co/MeiGen-AI/InfiniteTalk) |
| Wan2.2-S2V-14B | Apache-2.0 vérifiée | Apache-2.0 | voix → vidéo | [HF](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B) |
| Live Avatar (Quark, déc. 2025) | Apache-2.0 vérifiée | Apache-2.0 (fiche HF) | « Strong generalization across cartoon characters » ; multi-personnages pas encore | [LICENSE](https://github.com/Alibaba-Quark/LiveAvatar/blob/main/LICENSE), [HF](https://huggingface.co/Quark-Vision/Live-Avatar) |
| EchoMimic v3 (1,3 B, août 2025) | Apache-2.0 vérifiée | Apache-2.0 (fiche HF) | aucune mention cartoon trouvée | [LICENSE](https://github.com/antgroup/echomimic_v3/blob/main/LICENSE.txt), [HF](https://huggingface.co/BadToBest/EchoMimicV3) |
| EchoMimic v2 | Apache-2.0 | non indiquée (fiche HF) ; README « academic research » | demi-corps piloté par pose + voix | [GitHub](https://github.com/antgroup/echomimic_v2), [HF](https://huggingface.co/BadToBest/EchoMimicV2) |
| StableAvatar | MIT vérifiée | MIT (fiche HF) | — | [LICENSE](https://github.com/Francis-Rings/StableAvatar/blob/main/LICENSE.txt), [HF](https://huggingface.co/FrancisRing/StableAvatar) |
| OmniAvatar 14B | Apache-2.0 vérifiée | Apache-2.0 (14B) ; 1.3B sans étiquette | plein corps (article) | [LICENSE](https://github.com/Omni-Avatar/OmniAvatar/blob/main/LICENSE.txt), [HF](https://huggingface.co/OmniAvatar/OmniAvatar-14B) |
| FantasyTalking | Apache-2.0 vérifiée | Apache-2.0 (fiche HF) | — | [LICENSE](https://github.com/Fantasy-AMAP/fantasy-talking/blob/main/LICENSE), [HF](https://huggingface.co/acvlab/FantasyTalking) |
| HuMo (17B / 1.7B) | Apache-2.0 vérifiée | Apache-2.0 (fiche HF) | texte + image + voix | [LICENSE](https://github.com/Phantom-video/HuMo/blob/main/LICENSE), [HF](https://huggingface.co/bytedance-research/HuMo) |
| HunyuanVideo-Avatar | **Tencent Hunyuan Community License** (« DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA ») | idem | « multi-style avatars », dialogue multi-personnages | [LICENSE](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar/blob/main/LICENSE) |
| Hallo3 | MIT (code) | dérivé de CogVideoX-5B-I2V → **CogVideoX License** (académique ; commercial sur inscription, ≤ 1 M visites) | — | [README](https://github.com/fudan-generative-vision/hallo3), [CogVideoX LICENSE](https://huggingface.co/zai-org/CogVideoX-5b-I2V/blob/main/LICENSE) |
| Sonic | **CC BY-NC-SA 4.0** (« our license is non-commercial ») | idem | — | [LICENSE](https://github.com/jixiaozhong/Sonic/blob/main/LICENSE) |
| Ovi (vidéo + son) | Apache-2.0 vérifiée | non vérifiés | — | [LICENSE](https://github.com/character-ai/Ovi/blob/main/LICENSE) |

- Encodeurs audio utilisés : chinese-wav2vec2-base (MultiTalk, InfiniteTalk, EchoMimic v3) = MIT ; whisper-large-v3
  (LongCat 1.5, HuMo) = Apache-2.0 ; wav2vec2-base-960h = Apache-2.0 — [chinese-wav2vec2-base](https://huggingface.co/TencentGameMate/chinese-wav2vec2-base),
  [whisper-large-v3](https://huggingface.co/openai/whisper-large-v3), [wav2vec2-base-960h](https://huggingface.co/facebook/wav2vec2-base-960h).
- MultiTalk : « Given a multi-stream audio input, a reference image and a prompt, MultiTalk generates a video containing
  interactions following the prompt » ; jusqu'à 15 s ; LoRA FusioniX et lightx2v supportées (01/07/2025) ; 480p sur une
  seule RTX 4090 en mode faible VRAM (14/06/2025) ; Wan2GP « very low VRAM hardware (8 GB) » ; « decrease the sampling
  steps to even 10 that will not hurt the lip synchronization accuracy, but affects the motion and visual quality » —
  [README MultiTalk](https://github.com/MeiGen-AI/MultiTalk).
- InfiniteTalk : `--max_frame_num` par défaut 40 s (1 000 images) ; mode « very low VRAM » (`--num_persistent_param_in_dit 0`) ;
  TeaCache — [README InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk).
- LongCat-Video-Avatar 1.5 : Whisper-Large à la place de Wav2Vec2, distillation DMD2 à 8 pas (obligatoire pour la v1.5),
  INT8 ; exemples officiels lancés sur 2 GPU (`--nproc_per_node=2`), aussi en multi-personnages ; benchmark humain avec
  2 styles visuels (réaliste et autre) ; GGUF ComfyUI communautaire (étiquette MIT) — [HF](https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5),
  [GGUF (communauté)](https://huggingface.co/vantagewithai/LongCat-Video-Avatar-1.5-GGUF-ComfyUI).
- Wan2.2-S2V : la commande mono-GPU « can run on a GPU with at least 80GB VRAM » — [HF](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B).
- Live Avatar : 14 B, « 20 FPS on 5×H800 GPUs with 4-step sampling », 10 000+ s en continu ; mono-GPU hors ligne et
  multi-personnages encore non cochés — [HF](https://huggingface.co/Quark-Vision/Live-Avatar).
- EchoMimic v3 : « 12G VRAM is All YOU NEED » (12/08/2025), 16 Go via ComfyUI ; testé A100 80G / RTX 4090D 24G / V100 16G ;
  5 pas pour une tête parlante, 15–25 pour un corps — [README](https://github.com/antgroup/echomimic_v3).
- EchoMimic v2 accéléré : « from ~7mins/120frames to ~50s/120frames on A100 » — [HF EchoMimicV2](https://huggingface.co/BadToBest/EchoMimicV2).
- StableAvatar : « For the 5s video (480x832, fps=25) … approximately 18GB VRAM and finishes in 3 minutes on a 4090 GPU » ;
  ComfyUI en 10 pas « 3x faster » — [README](https://github.com/Francis-Rings/StableAvatar).
- OmniAvatar 14B (1 GPU, bf16) : 16,0 s/it à 36 Go ; 19,4 s/it à 21 Go ; 22,1 s/it à 8 Go ; 4 GPU : 4,8 s/it à 14,3 Go ;
  20–50 pas recommandés — [README](https://github.com/Omni-Avatar/OmniAvatar).
- FantasyTalking : 15,5 s/it à 40 Go ; 32,8 s/it à 20 Go ; 42,6 s/it à 5 Go — [README](https://github.com/Fantasy-AMAP/fantasy-talking).
- HuMo : 1.7B « generate a 480P video in 8 minutes on a 32G GPU » ; 17B dans ComfyUI-Wan « can be run on a NVIDIA 3090 » —
  [README](https://github.com/Phantom-video/HuMo).
- HunyuanVideo-Avatar : minimum 24 Go (704×768, 129 images) « but very slow », 96 Go recommandés ; 10 Go via Wan2GP —
  [README](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar).
- AudioAvatar (CVPR 2026, corps entier depuis la voix, une image) : pas de code signalé (source secondaire) —
  [article CVPR](https://openaccess.thecvf.com/content/CVPR2026/papers/Lee_AudioAvatar_Personalized_Audio-driven_Whole-body_Talking_Avatars_CVPR_2026_paper.pdf),
  [papernotes (secondaire)](https://en.papernotes.org/CVPR2026/human_understanding/audioavatar_personalized_audio-driven_whole-body_talking_avatars/).

### Inferences
- Pour nos dialogues de troupe (2–4 personnages dans un même plan), LongCat-Video-Avatar 1.5 (MIT, anime + multi-personnes
  revendiqués) et MultiTalk (Apache-2.0, cartoon + prompt d'interaction) sont les deux candidats prioritaires à mesurer sur
  nos planches ; InfiniteTalk sert à « redoubler » un plan Blender déjà rendu (vidéo → vidéo) sans changer la mise en scène.
- Tous ces modèles produisent un plan complet (personnage + fond de l'image de référence) : l'intégration Blender passe par
  une image de référence = notre rendu de scène (personnages déjà placés sur le décor peint), ou par un fond uni puis
  détourage (voir §4).
- Le lip-sync français n'est revendiqué par aucun de ces modèles ; les encodeurs (wav2vec2 chinois, Whisper multilingue)
  laissent penser que Whisper (LongCat 1.5, HuMo) est mieux armé pour le français — à mesurer.

### Gaps
- Aucune mesure publique de qualité sur personnages cartoon à grosse tête ou sur le français.
- VRAM/vitesse mono-GPU de LongCat-Video-Avatar 1.5 : non publiées (exemples sur 2 GPU).
- Licence du runtime audio.cpp (GGUF de Live Avatar) : non lue.
- s/it d'OmniAvatar / FantasyTalking non convertibles en « secondes par clip de 5 s » sans connaître le nombre de fenêtres.

## 4. Sortie avec transparence (alpha) ou incrustation sur nos décors peints

### Takeaway
Aucun modèle d'animation de personnage vérifié ne sort nativement de l'alpha. Les voies libres : (a) **Wan-Alpha**
(code MIT, poids v2.0 Apache-2.0) génère de la vidéo RGBA mais seulement en texte→vidéo (I2V pas encore publié) ;
(b) **mode remplacement** de Wan2.2-Animate / SCAIL-2 (le personnage est réinséré dans une vidéo existante avec LoRA de
ré-éclairage) ; (c) génération sur fond uni puis détourage image par image avec **BiRefNet (MIT)** ou **SAM2
(Apache-2.0)** ; (d) AnimatedDrawings exporte un GIF transparent. Les matteurs vidéo récents (MatAnyone 1/2, VideoMaMa,
TransPixar, RVM) sont tous hors règle.

### Cited Findings
- Wan-Alpha : code MIT (« Copyright (c) 2026 WeChat Vision ») ; v2.0 publiée le 16/12/2025, poids Apache-2.0 ; adaptation
  de Wan2.1-14B-T2V ; tâches « Image-to-Video » et « Training Code » encore non cochées ; prompts du type « The background of
  this video is transparent » ; gère cheveux, objets semi-transparents, lueurs — [LICENSE](https://github.com/WeChatCV/Wan-Alpha/blob/main/LICENSE),
  [HF v2.0](https://huggingface.co/htdong/Wan-Alpha-v2.0).
- Wan2.2-Animate mode remplacement : le prétraitement produit `src_bg.mp4` et `src_mask.mp4` ; taille/forme du masque réglables
  (`iterations`, `k`, `w_len`, `h_len`) ; masque fin = plus de fond conservé mais « shape leakage » possible —
  [UserGuider](https://github.com/Wan-Video/Wan2.2/blob/main/wan/modules/animate/preprocess/UserGuider.md) ; LoRA de
  ré-éclairage pour accorder lumière et teinte — [arXiv 2509.14055](https://arxiv.org/abs/2509.14055).
- SCAIL-2 : mode remplacement + « Relighting LoRA » (15/07/2026) ; workflows ComfyUI « Character Replacement » —
  [README](https://github.com/zai-org/SCAIL-2), [Comfy-Org](https://huggingface.co/Comfy-Org/SCAIL-2).
- AnimatedDrawings : « Export transparent .gif » — [README](https://github.com/facebookresearch/AnimatedDrawings).
- Détourage libre : BiRefNet MIT (attention : les poids RMBG-2.0 de briaai cités dans son README sont « only for
  non-commercial use ») ; SAM 2 : checkpoints et code Apache-2.0 — [BiRefNet](https://github.com/ZhengPeng7/BiRefNet),
  [SAM2](https://github.com/facebookresearch/sam2).
- Hors règle : SAM 3 = « SAM License » maison (accès sur formulaire) — [LICENSE](https://github.com/facebookresearch/sam3/blob/main/LICENSE),
  [HF](https://huggingface.co/facebook/sam3) ; MatAnyone et MatAnyone 2 (CVPR 2026) = NTU S-Lab License 1.0, usage non
  commercial — [MatAnyone](https://github.com/pq-yang/MatAnyone/blob/main/LICENSE), [MatAnyone2](https://github.com/pq-yang/MatAnyone2/blob/main/LICENSE.txt) ;
  VideoMaMa = code CC BY-NC 4.0 + checkpoints sous Stability AI Community License — [README](https://github.com/cvlab-kaist/VideoMaMa) ;
  TransPixar = « ADOBE RESEARCH LICENSE » — [LICENSE](https://github.com/wileewang/TransPixar/blob/main/LICENSE.md) ;
  RobustVideoMatting = GPL-3.0 — [LICENSE](https://github.com/PeterL1n/RobustVideoMatting/blob/master/LICENSE).

### Inferences
- Voie la plus « Blender » : rendre notre scène actuelle (marionnette sur décor peint, lumière du lieu) → la donner comme
  vidéo pilote en mode REMPLACEMENT (Wan2.2-Animate ou SCAIL-2) → le personnage reprend des gestes naturels DANS notre
  décor, sans détourage. Risque : le guide prévient des déformations si les proportions diffèrent et du masque mono-personne.
- Voie « carte » (calque dans Blender) : générer le personnage sur fond uni (couleur choisie hors palette de la troupe),
  détourer avec BiRefNet (déjà au registre, MIT) image par image, importer en séquence PNG RGBA sur un plan Blender. Le
  bord flou de la diffusion peut laisser une frange : contrôle visuel nécessaire.
- Wan-Alpha est la seule génération RGBA native libre, mais sans I2V il ne préserve pas l'identité d'un dessin donné : à
  surveiller (I2V annoncé).

### Gaps
- Aucune mesure de qualité de détourage BiRefNet/SAM2 sur des personnages cartoon générés (franges, cheveux, ombres).
- Pas de modèle d'animation de personnage libre vérifié qui sorte directement de l'alpha.
- Date de sortie de Wan-Alpha I2V : non annoncée.

## 5. Matériel et vitesse par clip de 5 s (GPU grand public / T4 gratuit) ; options faisables sur CPU

### Takeaway
Tous les modèles génératifs de qualité sont des DiT de 1,3 à 17 milliards de paramètres sur GPU. Chiffres publiés :
StableAvatar ≈ 3 min pour 5 s en 480×832 sur RTX 4090 (18 Go) ; Wan2.2 Fun fp8 (14B selon l'article) 81 images 640×640 en ≈ 520 s
sur RTX 4090D, ≈ 79–138 s avec la LoRA 4 pas (mouvement appauvri) ; Live Avatar en GGUF ≈ 276 s pour 5,8 s de 720p sur
RTX 5090 (16 Go) ; One-to-All 1.3B ≈ 11 min pour 10 s 832×480 sur T4 gratuit (Kaggle) — seul chiffre T4 trouvé. Sur CPU,
seuls les outils non génératifs (AnimatedDrawings, Inochi2D, notre rig) et LivePortrait (mesuré 7,9 s/image) sont
réalistes.

### Cited Findings
- StableAvatar : 5 s, 480×832, 25 i/s → ≈ 18 Go, 3 min sur 4090 — [README](https://github.com/Francis-Rings/StableAvatar).
- Wan2.2 Fun (fp8_scaled ; le tableau ne nomme pas la taille, l'article présente le 14B comme option haute performance) sur RTX 4090D 24 Go, 640×640, 81 images : ≈ 524 s (1ʳᵉ) / ≈ 520 s (2ᵉ), VRAM 83 % ; avec LoRA 4 pas :
  ≈ 138 s / ≈ 79 s, VRAM 89 % ; « the acceleration with LoRA is significant but the video dynamic is lost » —
  [docs ComfyUI (communauté/éditeur)](https://docs.comfy.org/tutorials/video/wan/wan2-2-fun-inp).
- Live Avatar GGUF (audio.cpp, base Wan2.2-S2V-14B + LoRA Live Avatar) : 1280×720, 93 images à 16 i/s (5,81 s) en 276 s,
  pic 15 993 Mio de VRAM sur RTX 5090 en mode faible VRAM ; une variante demande ≈ 43 Gio de RAM hôte —
  [HF audio-cpp/LiveAvatar-GGUF (communauté)](https://huggingface.co/audio-cpp/LiveAvatar-GGUF).
- One-to-All 1.3B : « Run … for free on Kaggle's 16 GB T4 … It takes 11 minutes to generate a 10-second 832×480 video »
  (22/12/2025) — [README](https://github.com/ssj9596/One-to-All-Animation).
- EchoMimic v3 : 12 Go (Gradio app_mm) / 16 Go (ComfyUI) ; testé sur V100 16 Go — [README](https://github.com/antgroup/echomimic_v3).
- MultiTalk : 8 Go via Wan2GP ; 480p sur une 4090 — [README](https://github.com/MeiGen-AI/MultiTalk).
- OmniAvatar 14B : 8 Go à 22,1 s/it — [README](https://github.com/Omni-Avatar/OmniAvatar) ; FantasyTalking : 5 Go à 42,6 s/it —
  [README](https://github.com/Fantasy-AMAP/fantasy-talking).
- HuMo 1.7B : 480p en 8 min sur GPU 32 Go — [README](https://github.com/Phantom-video/HuMo).
- UniAnimate-DiT : 23 Go (480p) / 36 Go (720p) — [HF](https://huggingface.co/ZheWang123/UniAnimate-DiT) ; AniDoc ≈ 14 Go —
  [README](https://github.com/yihao-meng/AniDoc) ; ToonCrafter 12 Go en fp16 — [README](https://github.com/Doubiiu/ToonCrafter).
- Wan-Animate-2 : 8× A800 (720p) / 2× A800 (480p) dans la configuration officielle — [HF](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B) ;
  Wan2.2-S2V mono-GPU ≥ 80 Go — [HF](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B) ; Live Avatar temps réel = 5× H800 —
  [HF](https://huggingface.co/Quark-Vision/Live-Avatar).
- T4 (Turing) : FlashAttention-2 vise Ampere/Ada/Hopper ; « bf16 requires Ampere, Ada, or Hopper GPUs » ; pour Turing (T4)
  un dépôt séparé ne couvre qu'un sous-ensemble — [README flash-attention](https://github.com/Dao-AILab/flash-attention).
- CPU : AnimatedDrawings rend sans écran (Mesa) et sert la détection via TorchServe en Docker — [README](https://github.com/facebookresearch/AnimatedDrawings) ;
  LivePortrait (MIT) mesuré chez nous à 7,9 s/image sur 4 cœurs CPU (registre interne `outils-puissants-d-abord`, mesure du
  14/10/2026) — [LICENSE LivePortrait](https://github.com/KwaiVGI/LivePortrait/blob/main/LICENSE).

### Inferences
- Pour un clip de 5 s sur une RTX 4090/5090 grand public, compter de l'ordre de 1,5 à 9 minutes selon le modèle et la
  distillation (StableAvatar 3 min ; Wan 14B 81 images ≈ 1,3–9 min) — un film d'une minute (12 clips) = ~20 min à ~2 h sur
  un seul GPU : incompatible avec « des minutes » sans plusieurs GPU ou modèles distillés (Wan-Animate-2 distillé 10 pas,
  LongCat 1.5 8 pas, LoRA 4 pas). À mesurer.
- Le T4 gratuit (16 Go, pas de bf16 matériel, pas de FlashAttention-2 standard) ne convient qu'aux modèles 1,3 B
  (One-to-All 1.3B, EchoMimic v3) ou aux 14B fortement quantifiés/délestés, avec des temps de l'ordre de dizaines de
  minutes par clip.
- Le conteneur actuel (4 cœurs, sans GPU) ne peut faire tourner aucun modèle génératif de cette note en temps utile ;
  l'intégration réaliste = GPU de l'utilisateur ou GPU loué, résultats mis en cache comme bibliothèque (méthode déjà
  appliquée à LivePortrait).

### Gaps
- Aucun chiffre publié de Wan2.2-Animate, Wan-Animate-2, SCAIL-2, MultiTalk ou LongCat 1.5 sur T4 ni sur RTX 3060/4060.
- Aucun chiffre officiel de VRAM pour Wan2.2-Animate dans la section « Run Wan-Animate » du README (le registre interne
  indiquait 80 Go, non revérifié ici).
- Les durées « par clip de 5 s » ci-dessus sont rarement mesurées à résolution et nombre de pas identiques : la comparaison
  directe n'est pas fiable sans banc maison sur nos planches.
