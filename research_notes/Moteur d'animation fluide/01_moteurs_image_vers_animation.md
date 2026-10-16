# Moteurs « image unique → animation » : Animated Drawings, LivePortrait, TPS-MM / FOMM, approches 2025-2026 — ce qu'on apprend et ce qu'on greffe

Piste : `moteurs_warping`. Rédigé le 16/10/2026. Code lu (jamais exécuté, jamais copié) dans des clones superficiels :
`/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/sources/warping/`.

| Dépôt | Commit lu | Date du commit |
|---|---|---|
| facebookresearch/AnimatedDrawings | `b859684857519c7424da51a0b0862fbd1fd258f4` | 03/09/2025 (dépôt archivé) |
| KwaiVGI/LivePortrait | `9b294b3d0536135442ea73cb01e6cb3ca7029dd3` | 02/06/2026 (même commit que notre `liveface.py`) |
| yoyo-nb/Thin-Plate-Spline-Motion-Model | `c616878812c9870ed81ac72561be2676fd7180e2` | 08/07/2023 |
| AliaksandrSiarohin/first-order-model | `c0274845cb2dd8f0f2fe6da580d97b60fef90c91` | 13/11/2024 |

Les bancs CPU ont été faits avec **notre propre code**, écrit pour ce banc à partir des formules publiées (aucune ligne tierce) :
`/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/scripts/bench_warp.mjs` et `bench_scrub.mjs`,
sorties dans `bench_warp.out.txt` et `bench_scrub.out.txt` (même dossier). Node 22, un seul fil, Xeon 2,1 GHz du conteneur.

---

## Q1 — Meta Animated Drawings : comment un dessin unique devient une animation, licences, CPU, échecs

### Takeaway
Animated Drawings (AD) est un pipeline **non génératif**. Il détecte et segmente le personnage, estime 16 articulations et
triangule le masque par Delaunay. Il anime ensuite le maillage par **ARAP d'Igarashi en deux étapes**, piloté par des
**angles d'os** extraits d'un BVH 3D. Ces angles sont projetés sur un plan frontal ou sagittal **choisi séparément pour
chaque groupe de membres** : c'est la « perspective tordue ». L'ordre de rendu des parties suit la profondeur des
articulations du BVH. Le code, les poids et le jeu de données sont sous MIT. Mais le dépôt est archivé, et plusieurs choix
expliquent des mouvements raides ou saccadés : pas d'interpolation entre images du BVH, temps cumulé par additions,
un seul maillage sans calques cachés et aucun verrouillage des pieds. Nous pouvons faire mieux.

### Cited Findings
- **Licence** : fichier LICENSE = MIT, « Copyright (c) Meta Platforms, Inc. and affiliates ». Le README annonce le code, les
  poids et le jeu Amateur Drawings sous MIT. Nos notes précédentes le confirment —
  [LICENSE](https://github.com/facebookresearch/AnimatedDrawings/blob/main/LICENSE),
  [README](https://github.com/facebookresearch/AnimatedDrawings) ; note interne
  `research_notes/Animer Blender par prompt/animation_personnages_dessines.md` (branche lue en lecture seule).
- **Dépôt archivé** : « Update 09-03-25 […] I've chosen to archive it » — [README](https://github.com/facebookresearch/AnimatedDrawings).
- **Détection et pose** : deux modèles servis par TorchServe dans Docker. Le détecteur est un Mask R-CNN (mmdet 2.27.0).
  La pose vient de mmpose 0.29.0 avec un backbone ResNet-50 et une tête par cartes de chaleur, sur une entrée de 192×256.
  Les dépendances sont figées : torch 2.0.0, mmcv-full 1.7.0, Python 3.8 —
  [torchserve/Dockerfile](https://github.com/facebookresearch/AnimatedDrawings/blob/main/torchserve/Dockerfile) ;
  [article arXiv 2303.12741](https://arxiv.org/abs/2303.12741) (« ResNet-50 backbone […] top-down heat map keypoint head […]
  resized to 192x256 »).
- **Segmentation de production** : elle ne passe pas par Mask R-CNN mais par un traitement d'image classique. On prend le
  minimum des canaux RGB, puis un seuil adaptatif gaussien (bloc 115, C = 8). Suivent une fermeture et une dilatation 3×3
  (2 itérations chacune), un remplissage depuis les bords tous les 10 px et la conservation du plus grand contour.
  `binary_fill_holes` termine le masque —
  [image_to_annotations.py](https://github.com/facebookresearch/AnimatedDrawings/blob/main/examples/image_to_annotations.py).
- **Taux de réussite publiés** (2 500 exemples d'affinage) : boîte englobante 92,5 %, masque Mask R-CNN 24,7 %,
  masque par traitement d'image 42,4 %, pose 90,2 %. Le pipeline entièrement automatique réussit dans 39,4 % des cas avec
  la segmentation par traitement d'image. Les échecs du traitement d'image viennent des ombres dures, du papier ligné et
  des membres non connectés — [arXiv 2303.12741, tableau 2 et §4.2](https://arxiv.org/pdf/2303.12741).
- **Squelette** : 16 articulations construites depuis les points COCO. On a `root` et `hip` au milieu des hanches, `torso`
  au milieu des épaules, et `neck` sur le **nez** (point 0). S'y ajoutent les épaules, coudes, mains, hanches, genoux et
  pieds — [image_to_annotations.py](https://github.com/facebookresearch/AnimatedDrawings/blob/main/examples/image_to_annotations.py).
- **Maillage** : contour par `measure.find_contours(mask, 128)`, simplifié par `approximate_polygon(tolerance=0.25)`.
  Une grille de points 40×40 est ajoutée à l'intérieur, puis une Delaunay **non contrainte** est calculée sur l'enveloppe
  convexe. Les triangles dont le centroïde tombe hors du contour sont supprimés —
  [animated_drawing.py `_generate_mesh`](https://github.com/facebookresearch/AnimatedDrawings/blob/main/animated_drawings/model/animated_drawing.py).
- **Attribution des triangles aux parties** : un parcours de Dijkstra sur les pixels du masque (8-voisinage, coûts 1 et
  1,414) part de 20 graines par os. Chaque triangle prend l'os le plus proche de son centroïde, puis les triangles de chaque
  partie sont triés du plus loin au plus proche de l'os —
  [animated_drawing.py `_initialize_joint_to_triangles_dict`](https://github.com/facebookresearch/AnimatedDrawings/blob/main/animated_drawings/model/animated_drawing.py).
- **ARAP** : implémentation d'Igarashi & Igarashi, JGT 2009 (« Implementing As-Rigid-As-Possible Shape Manipulation »).
  L'étape 1 résout une similitude par arête à partir de ses 4 sommets voisins, avec `G_k* = (G_kᵀG_k)⁻¹G_kᵀ`. L'étape 2
  normalise en rotation pure puis résout pour la position. Les articulations servent de poignées, exprimées en
  coordonnées barycentriques, avec un poids w = 1000. **Chaque image** appelle `spsolve` (factorisation à chaque appel),
  et les matrices sont d'abord construites **denses** (`np.zeros([2(E+P), 2V])`). Un `det == 0` déclenche une perturbation
  de +1e-8·I — [arap.py](https://github.com/facebookresearch/AnimatedDrawings/blob/main/animated_drawings/model/arap.py).
- **Retargeting** : on retire la translation XZ de la racine du BVH et on tourne le squelette pour qu'il regarde +X.
  L'avant est le vecteur perpendiculaire à la moyenne des vecteurs épaules et hanches. Pour chaque os mappé, on calcule
  l'**angle global** de l'os projeté dans son plan, puis on tourne l'os du dessin pour qu'il prenne cet angle.
  **Les longueurs d'os du dessin sont conservées (aucun raccourci perspectif, choix délibéré).** La racine se déplace de
  l'offset du BVH multiplié par le rapport des longueurs de jambes —
  [retargeter.py](https://github.com/facebookresearch/AnimatedDrawings/blob/main/animated_drawings/model/retargeter.py) ;
  [arXiv 2303.12741 §3.4](https://arxiv.org/pdf/2303.12741).
- **Perspective tordue** : pour chaque groupe (membres supérieurs, membres inférieurs, tronc), on fait une ACP du nuage
  des positions d'articulations sur **tout le clip**. On choisit le plan frontal (normale X) ou sagittal (normale Z) selon
  le cosinus le plus élevé avec la **3e composante principale**. Le tronc est fixé en frontal dans la configuration
  fournie. Étude perceptive : 66 participants, 20 vidéos ; préférence significative pour la perspective tordue dans
  **16 vidéos sur 20**, pas de préférence dans les 4 autres (dont 3 « Wave Hello », peu de flexion des jambes) —
  [retargeter.py `_determine_projection_plane_normal`](https://github.com/facebookresearch/AnimatedDrawings/blob/main/animated_drawings/model/retargeter.py),
  [fair1_ppf.yaml](https://github.com/facebookresearch/AnimatedDrawings/blob/main/examples/config/retarget/fair1_ppf.yaml),
  [arXiv 2303.12741 §4.3](https://arxiv.org/pdf/2303.12741).
- **Ordre de rendu (occlusion)** : à chaque image, les groupes de parties (tronc, bras gauche, bras droit, jambes) sont
  triés par la profondeur moyenne de leurs « depth drivers » BVH, c'est-à-dire leur distance au plan de projection.
  Dans un groupe placé derrière le plan, l'ordre interne est inversé. Une vérification à l'exécution retire la tête du
  retargeting si le nez se trouve sous la ligne des épaules —
  [animated_drawing.py `_set_draw_indices`](https://github.com/facebookresearch/AnimatedDrawings/blob/main/animated_drawings/model/animated_drawing.py).
- **Temps** : l'image BVH est choisie par `round(time / frame_time)`, sans interpolation. Le rendu vidéo utilise le
  `frame_time` du BVH comme cadence (souvent 0,0333 s), et le temps avance par `self._time += delta_t` —
  [retargeter.py `get_retargeted_frame_data`](https://github.com/facebookresearch/AnimatedDrawings/blob/main/animated_drawings/model/retargeter.py),
  [video_render_controller.py](https://github.com/facebookresearch/AnimatedDrawings/blob/main/animated_drawings/controller/video_render_controller.py),
  [time_manager.py](https://github.com/facebookresearch/AnimatedDrawings/blob/main/animated_drawings/model/time_manager.py).
- **Limites déclarées** : seules certaines motions se retargettent bien. Les gestes « en rayon » ou en arc passent ; les
  gestes « carving », qui varient dans les 3 dimensions, passent mal. Les utilisateurs demandaient sourire, clignements,
  regard et plusieurs personnages — [arXiv 2303.12741 §6](https://arxiv.org/pdf/2303.12741).
- **Service en ligne** : le flux image → animation prenait moins de 10 s sur AWS (g4dn.2xlarge + c5.4xlarge) —
  [arXiv 2303.12741 §3.5](https://arxiv.org/pdf/2303.12741).

### Inferences
- Nous **n'avons pas besoin de ses modèles de détection et de pose**. Nos personnages procéduraux ont un squelette par
  construction, et les planches de l'utilisateur ont déjà des repères mesurés. Seuls ses **algorithmes géométriques**
  (maillage, ARAP, perspective tordue, ordre de rendu) valent d'être réimplémentés. On évite ainsi la pile
  mmcv/mmdet/torch 2.0 en Python 3.8, figée et archivée.
- AD anime **un seul maillage texturé par le dessin**. Quand un bras dessiné contre le corps s'écarte, il n'y a rien
  derrière : pas de calque de torse complété. Cela convient aux dessins d'enfants en « T », pas à nos poses (bras croisés,
  mains sur les hanches). D'où l'exigence de **calques complétés sous les membres**.
- Trois défauts d'AD produisent exactement ce que l'utilisateur reproche (« saccadé », « mou ») :
  1. l'arrondi à l'image BVH la plus proche donne des à-coups dès que la cadence de sortie diffère de celle du BVH ;
  2. le temps cumulé par additions dérive, ce que la spec interdit (« aucune dérive cumulative ») ;
  3. aucun verrouillage des pieds : la racine est seulement mise à l'échelle par le rapport des jambes, donc les pieds
     glissent.
- Son tri de profondeur sans hystérésis fait « sauter » un bras devant ou derrière le corps quand deux profondeurs se
  croisent. C'est un artefact typique à corriger.

### Gaps
- Pas de mesure CPU des modèles Mask R-CNN et ResNet-50 d'AD dans ce conteneur (inutile pour nous, non exécuté).
- Le temps de rendu d'AD par image (OpenGL/Mesa) n'a pas été mesuré.

---

## Q2 — LivePortrait : points-clés implicites, champ de déformation, stitching, retargeting yeux/lèvres, identité, CPU

### Takeaway
LivePortrait ne génère pas l'image : il **déplace les caractéristiques de l'image source**, puis un décodeur SPADE les
redessine. L'identité tient donc bien, et les artefacts apparaissent là où il faut inventer du contenu (intérieur de la
bouche, grands angles). Le mouvement passe par 21 points-clés 3D implicites : `x = s·(x_c R + δ) + t`. Trois petits MLP
(stitching, yeux, lèvres) corrigent ces points pour coller l'animation dans l'image d'origine et forcer l'ouverture des
yeux et des lèvres. Code et poids « humains » sont sous MIT, mais les détecteurs InsightFace sont non commerciaux. Sur
notre CPU, le réseau coûte **7,9 s par image** (mesure interne). D'où la stratégie déjà retenue : une **bibliothèque
d'états précalculée** plutôt qu'un calcul image par image.

### Cited Findings
- **Licence** : code MIT, « Copyright (c) 2024 Kuaishou Visual Generation and Interaction Center ». Le même fichier
  précise : « The models of InsightFace are for non-commercial research purposes only. If you want to use the
  LivePortrait project for commercial purposes, you should remove and replace InsightFace's detection models » —
  [LICENSE](https://github.com/KwaiVGI/LivePortrait/blob/main/LICENSE).
- **Notre intégration existante** contourne déjà InsightFace : le visage est localisé par nos repères de troupe, puis
  affiné par le `landmark.onnx` de LivePortrait —
  `workbench/scripts/blenderfilm/liveface.py` et `.claude/skills/outils-puissants-d-abord/SKILL.md` (branche lue).
- **Architecture** (models.yaml) :
  - F : extracteur d'apparence, volume de caractéristiques 32×16×64×64 ;
  - M : extracteur de mouvement, ConvNeXt-V2-Tiny, 21 points-clés ;
  - W : module de déformation (warping), avec carte d'occlusion ;
  - G : générateur SPADE, upscale ×2 de 256 vers 512 ;
  - S : modules de stitching et de retargeting (MLP 126→65, 65→63 et 66→63) —
  [src/config/models.yaml](https://github.com/KwaiVGI/LivePortrait/blob/main/src/config/models.yaml).
- **Coût par module** (RTX 4090, torch.compile) : F 0,82 ms, M 0,84 ms, SPADE 7,59 ms, W 5,21 ms, S 0,31 ms. Les
  paramètres : 0,84 M, 28,12 M, 55,37 M, 45,53 M et 0,23 M —
  [assets/docs/speed.md](https://github.com/KwaiVGI/LivePortrait/blob/main/assets/docs/speed.md). L'article annonce
  12,8 ms par image sur RTX 4090 — [arXiv 2407.03168](https://arxiv.org/abs/2407.03168).
- **Le goulot de calcul est commenté dans le code** : le `hourglass` du réseau de mouvement dense est marqué « ~60+G »,
  et la convolution 3D `mask` (noyau 7) « 65G! NOTE: computation cost is large » —
  [src/modules/dense_motion.py](https://github.com/KwaiVGI/LivePortrait/blob/main/src/modules/dense_motion.py).
- **Mesures CPU internes** : LivePortrait prend 7,9 s/image sur les 4 cœurs du conteneur. FasterLivePortrait en ONNX
  prend 17,6 s/image (aucun gain sur CPU). D'où l'« animation par remplacement » : une bibliothèque d'états lèvres × yeux
  par pose, environ 2 min par pose au premier passage puis environ 0 s par film —
  `workbench/scripts/blenderfilm/liveface.py`, `.claude/skills/outils-puissants-d-abord/SKILL.md` (branche lue).
  FasterLivePortrait est sous MIT — [LICENSE](https://github.com/warmshao/FasterLivePortrait/blob/master/LICENSE).
- **Transformation des points-clés** (Éq. 2 de l'article, et `transform_keypoint` dans le code) :
  `x_s = s_s·(x_c,s R_s + δ_s) + t_s` et `x_d = s_d·(x_c,s R_d + δ_d) + t_d`, avec tz mis à 0.
  - Les auteurs ont **ajouté le facteur d'échelle** parce que la projection orthographique à l'échelle
    `x = s·(x_c+δ)R + t` « leads to overly flexible learned expressions δ, causing texture flickering when driving
    across different identities » — [arXiv 2407.03168 §3.2](https://arxiv.org/pdf/2407.03168),
    [live_portrait_wrapper.py](https://github.com/KwaiVGI/LivePortrait/blob/main/src/live_portrait_wrapper.py).
- **Mouvement relatif** (pilotage par vidéo), dans le code :
  - rotation : `R_new = (R_d,i · R_d,0ᵀ) · R_s` ;
  - expression : `δ_new = δ_s + (δ_d,i − δ_d,0)` ;
  - échelle : `s_new = s_s · s_d,i / s_d,0` ;
  - translation : `t_new = t_s + (t_d,i − t_d,0)` ;
  - points finaux : `x_d,i,new = s_new·(x_c,s R_new + δ_new) + t_new` ;
  - un `driving_multiplier` amplifie l'écart : `x = x_s + (x − x_s)·m` —
  [live_portrait_pipeline.py](https://github.com/KwaiVGI/LivePortrait/blob/main/src/live_portrait_pipeline.py).
- **Champ de déformation** : pour chaque point-clé k, le flux « clairsemé » vaut `z − x_d,k + x_s,k`. Il est
  translationnel : le code note « there lacks an one-order flow ». On y ajoute un flux identité pour le fond. Un hourglass 3D
  prédit `K+1` masques passés par un softmax, et la déformation est `Σ_k m_k(z)·flux_k(z)`. Une carte d'occlusion
  sigmoïde multiplie les caractéristiques déformées. Les entrées comprennent aussi des différences de gaussiennes
  `exp(−‖z−x‖²/(2·0,01))` (driving − source) —
  [dense_motion.py](https://github.com/KwaiVGI/LivePortrait/blob/main/src/modules/dense_motion.py),
  [warping_network.py](https://github.com/KwaiVGI/LivePortrait/blob/main/src/modules/warping_network.py),
  [util.py `kp2gaussian`](https://github.com/KwaiVGI/LivePortrait/blob/main/src/modules/util.py).
- **Stitching** : `Δ_st = S(x_s, x_d)`, appliqué comme `x'_d = x_d + Δ_st`, avec une correction tx, ty en sortie. Il est
  entraîné en reconstitution croisée d'identités, avec une perte sur la **région des épaules** et une régularisation
  `‖Δ_st‖₁`. But : coller l'animation dans l'image d'origine sans décalage de pixels, ce qui permet les grandes images
  et plusieurs visages — [arXiv 2407.03168 §3.3](https://arxiv.org/pdf/2407.03168).
- **Collage final** : `résultat = masque·warp(crop) + (1−masque)·original`, avec un `mask_template.png` fixe transformé
  par la matrice crop→original —
  [src/utils/crop.py `paste_back`](https://github.com/KwaiVGI/LivePortrait/blob/main/src/utils/crop.py).
- **Retargeting des yeux et des lèvres** : chacun est un MLP qui prend `x_s` et les ratios d'ouverture (source, cible) et
  renvoie `Δ ∈ R^{21×3}`. Le ratio cible va de 0 à 0,8.
  - L'œil se mesure par des rapports de distances de repères : paupières sur largeur, repères 6/18 sur 0/12 et 30/42
    sur 24/36.
  - La bouche se mesure par 90/102 sur 48/66.
  - Une valeur hors distribution (−0,2) donne encore des résultats raisonnables d'après les auteurs.
  - L'article montre un **personnage cartoon** dont les grands yeux ne se ferment pas sans le retargeting —
  [arXiv 2407.03168 §3.3 et Fig. 8](https://arxiv.org/pdf/2407.03168),
  [retargeting_utils.py](https://github.com/KwaiVGI/LivePortrait/blob/main/src/utils/retargeting_utils.py),
  [app.py, curseurs 0–0,8](https://github.com/KwaiVGI/LivePortrait/blob/main/app.py).
- **Commandes paramétriques sans vidéo pilote** : l'interface modifie directement `δ` (expression) sur des indices de
  points précis.
  - Sourire : `δ[20,y] −= 0,01·s`, `δ[14,y] −= 0,02·s`, etc.
  - Clin d'œil, sourcil et direction du regard.
  - Lèvres : « pouting », « pursing », « grin », « lip close <-> open ».
  - Tête : tangage ±15°, lacet ±25°, roulis ±15°.
  - [gradio_pipeline.py](https://github.com/KwaiVGI/LivePortrait/blob/main/src/gradio_pipeline.py), [app.py](https://github.com/KwaiVGI/LivePortrait/blob/main/app.py).
- **Lissage** : un lisseur de Kalman (pykalman), avec une variance d'observation de 3e-7 et une variance de processus de
  1e-5 sur les séquences `exp` et `R` — [src/utils/filter.py](https://github.com/KwaiVGI/LivePortrait/blob/main/src/utils/filter.py).
- **Données et styles** : 69 M images vidéo issues d'environ 18,9 K identités, et 60 K portraits stylisés statiques. Le
  modèle entraîné sur des vidéos réalistes « generalizes poorly to styled portraits, e.g., anime ». L'entraînement mixte
  images + vidéos corrige cela. Des points de repère 2D (Wing loss, N = 10, yeux et lèvres) guident les points
  implicites ; sans eux, le regard reste « bound to the head pose » — [arXiv 2407.03168 §3.2](https://arxiv.org/pdf/2407.03168).
- **Limites déclarées** : la reconstitution croisée se dégrade aux grandes variations de pose, et de forts mouvements
  d'épaules peuvent produire du tremblement (jitter) — [arXiv 2407.03168, Conclusion](https://arxiv.org/pdf/2407.03168).
- **Ouverture de bouche** : notre moteur l'utilisait à environ 0,47, alors que le modèle accepte jusqu'à 0,8 (point
  repéré dans notre registre de veille) — `.claude/skills/veille-permanente/SKILL.md` (branche lue).

### Inferences
- **Pourquoi l'identité tient** : la sortie est `D(W(f_s; x_s, x_d))`. Les caractéristiques de la source sont déplacées,
  pas réinventées, et l'apparence n'est extraite qu'une fois. Notre équivalent en code pur est encore plus strict : **on
  déplace les pixels du dessin** (maillage) et on n'invente rien. Seules les zones découvertes (intérieur de bouche,
  dents) viennent de **calques dessinés exprès**.
- **Pourquoi des artefacts** : il faut halluciner du contenu là où la carte d'occlusion est faible (dents, langue,
  profil caché). Sur un dessin cartoon, le décodeur entraîné surtout sur du réalisme peut « réaliser » la texture. C'est
  une raison de garder LivePortrait pour **de petites amplitudes** (paupières, lèvres, micro-mouvements de tête) et de
  confier les grands mouvements au maillage.
- **Le « stitching » est un concept réutilisable sans réseau** : une déformation locale (visage) doit avoir un
  **déplacement nul et une dérivée continue sur l'anneau de raccord**. On l'obtient par une TPS ou un ARAP local avec
  ancres fixes sur l'anneau, plus un masque de mélange en dégradé. C'est le rôle que joue le MLP S.
- Ses commandes paramétriques (`δ` sur des indices précis) sont en fait des **blendshapes implicites**. C'est exactement
  ce qui manque à une bibliothèque de visèmes : on peut composer une forme « O arrondi » (pursing + ouverture), « I/E
  étiré » (grin + ouverture moyenne) ou « M/B/P » (lèvres closes). C'est plus riche que le seul ratio d'ouverture que
  nous utilisions.
- Le lissage de LivePortrait est **non causal** (`kf.smooth` de pykalman = lisseur RTS sur tout le clip) : il convient à
  un précalcul hors ligne des pistes, ce qui reste compatible avec un `evaluate(t)` pur.

### Gaps
- Le gain du bf16 ou de l'AMX (le CPU l'a : `amx_bf16`, `amx_int8`) sur LivePortrait n'a **pas été mesuré**. Il aurait
  fallu exécuter le code tiers, ce que cette piste n'autorisait pas. La mesure fp32 de 7,9 s/image reste la référence.
- Licence de X-Pose (mode animaux) non vérifiée ; nous n'en avons pas besoin.
- Aucune mesure de la qualité de LivePortrait sur nos planches au style Pixar ouest-africain, au-delà de l'intégration
  existante : pas de comptage d'artefacts.

---

## Q3 — Thin-Plate-Spline Motion Model, FOMM (et MRAA) : TPS, approximation du premier ordre, masques d'occlusion

### Takeaway
Ces trois modèles non supervisés (256×256) déforment la source vers la pose pilote. Ils combinent K transformations
locales et une transformation de fond par des cartes de contribution apprises (softmax), puis un réseau
« inpainting » comble les zones occultées. FOMM approxime chaque région par une transformation affine locale au premier
ordre. TPS-MM remplace cette affine par des splines plaque-mince à 5 points, plus souples. MRAA tire l'affine de l'ACP
d'une carte de chaleur. Le code de FOMM et de TPS-MM est sous MIT, mais leurs poids sont entraînés sur VoxCeleb, TaiChi,
TED et MGif et distribués sans licence claire. MRAA est **sans licence du tout**. Ce que nous en gardons : les
**formules** (TPS, premier ordre, normalisation d'amplitude, ACP de régions) et l'**idée des masques d'occlusion
explicites**. Pas les réseaux.

### Cited Findings
- **Licences** : TPS-MM est sous MIT, « Copyright (c) 2021 yoyo-nb »
  ([LICENSE](https://github.com/yoyo-nb/Thin-Plate-Spline-Motion-Model/blob/main/LICENSE)). FOMM est sous MIT,
  « Copyright (c) 2019-2023 Aliaksandr Siarohin », au commit lu
  ([LICENSE.md](https://github.com/AliaksandrSiarohin/first-order-model/blob/master/LICENSE.md)). Pour MRAA
  (snap-research/articulated-animation), « No license, whether implied or otherwise, is granted in or to such code
  (including any rights to copy, modify, publish, distribute and/or commercialize such code) »
  ([LICENSE.md](https://github.com/snap-research/articulated-animation/blob/master/LICENSE.md)).
- **Poids** : ceux de TPS-MM et de FOMM sont hébergés sur Google Drive ou Yandex, sans fichier de licence propre aux
  poids — [README TPS](https://github.com/yoyo-nb/Thin-Plate-Spline-Motion-Model),
  [README FOMM](https://github.com/AliaksandrSiarohin/first-order-model).
- **TPS** : on minimise l'énergie de flexion `∬ (T_xx² + 2T_xy² + T_yy²)` sous les contraintes `T(P_i^S) = P_i^D`. La
  solution s'écrit `T_k(p) = A_k·[p;1] + Σ_i w_ki·U(‖P_ki^D − p‖)` avec `U(r) = r²·log r²`. Le modèle utilise
  **K = 10 TPS de N = 5 points**, plus une affine de fond `A_bg`, et en combine `K+1` par softmax des cartes de
  contribution — [arXiv 2203.14367 §3.1](https://arxiv.org/abs/2203.14367),
  [config/vox-256.yaml (`num_tps: 10`)](https://github.com/yoyo-nb/Thin-Plate-Spline-Motion-Model/blob/main/config/vox-256.yaml).
- **TPS dans le code** :
  - K se calcule par `K = ‖p_i − p_j‖²·log(‖p_i − p_j‖² + 1e-9)` ;
  - la matrice du système `L = [[K, P],[Pᵀ, 0]]` reçoit une **régularisation `+0,01·I`** ;
  - les paramètres s'obtiennent par `inverse(L)·Y` ;
  - il y a un mode « random » pour la perte d'équivariance —
  [modules/util.py, classe TPS](https://github.com/yoyo-nb/Thin-Plate-Spline-Motion-Model/blob/main/modules/util.py).
- **Dropout des TPS** : en début d'entraînement, certaines contributions sont mises à zéro, pour que chaque TPS serve.
  Les **masques d'occlusion sont multi-résolution** : un par niveau du décodeur. On fusionne ensuite par
  `out·(1−occ) + encode_i` puis `out·(1−occ) + source_déformée·occ` —
  [arXiv 2203.14367 §3.1-3.2](https://arxiv.org/abs/2203.14367),
  [modules/inpainting_network.py](https://github.com/yoyo-nb/Thin-Plate-Spline-Motion-Model/blob/main/modules/inpainting_network.py),
  [modules/dense_motion.py](https://github.com/yoyo-nb/Thin-Plate-Spline-Motion-Model/blob/main/modules/dense_motion.py).
- **FOMM, premier ordre** (« Eq 4. in the paper ») : `T_{S←D}(z) ≈ p_k^S + J_k·(z − p_k^D)`, avec
  `J_k = J_k^S·(J_k^D)⁻¹`. Il y a 10 points-clés avec jacobiennes (`estimate_jacobian: True`) —
  [modules/dense_motion.py `create_sparse_motions`](https://github.com/AliaksandrSiarohin/first-order-model/blob/master/modules/dense_motion.py),
  [config/vox-256.yaml](https://github.com/AliaksandrSiarohin/first-order-model/blob/master/config/vox-256.yaml).
- **FOMM, normalisation d'animation relative** :
  - amplitude adaptée : `scale = √aire(enveloppe convexe des kp source) / √aire(kp pilote initiaux)` ;
  - mouvement relatif : `kp = kp_s + (kp_d − kp_d,0)·scale` ;
  - jacobienne relative : `J = (J_d·J_d,0⁻¹)·J_s` —
  [animate.py `normalize_kp`](https://github.com/AliaksandrSiarohin/first-order-model/blob/master/animate.py).
- **MRAA (article seulement)** : translation `µ_k = Σ_z M_k(z)·z`. Rotation et échelles viennent de la SVD de la
  covariance pondérée `Σ_z M_k(z)(z−µ_k)(z−µ_k)ᵀ = U S Vᵀ`. On compose ensuite
  `A_{S←D} = A_{S←R}·A_{D←R}⁻¹`. Les auteurs jugent que la régression des paramètres affines de FOMM « generalizes
  poorly » — [arXiv 2104.11280 §3.2](https://arxiv.org/abs/2104.11280).

### Inferences
- Pour nous, les **contributions sont connues** : nos parties (bras, avant-bras, tête…) ont des masques dessinés ou
  calculés. On n'a pas besoin d'apprendre de softmax, on prend des **poids de peau lisses** (bone heat, déjà dans
  `boneHeat.ts`) ou des poids barycentriques de parties.
- La TPS est l'outil idéal pour les **déformations locales lisses** : traits du visage, squash & stretch du corps,
  vêtement qui suit. Mais elle doit s'évaluer **sur les sommets du maillage**, pas par pixel sur CPU (banc Q5 : 844 ms
  contre 0,78 ms).
- La normalisation `√(aire_s/aire_d)` de FOMM est une **règle simple de retargeting d'amplitude** entre gabarits (enfant,
  adulte, personnage trapu) pour les gestes des mains et des épaules.
- L'ACP de MRAA donne l'**axe principal d'une partie à partir de son masque**. Cela sert de secours quand un repère de
  planche manque : l'axe d'un avant-bras vient de son masque, sans réseau.
- Le message central des trois modèles est que **l'occlusion est un problème de premier rang**. Leur réponse est un
  inpainting appris. La nôtre sera **un calque complété à l'avance** (torse sous le bras, intérieur de bouche, œil sous
  la paupière), sélectionné par un masque d'occlusion **explicite** calculé à partir de la géométrie.

### Gaps
- Aucune mesure CPU de TPS-MM ou de FOMM en 256×256. Non exécutés : ils ne servent qu'à apprendre.
- Licence des poids TPS-MM et FOMM non trouvée, donc non utilisables pour une sortie commerciale sans clarification.
  Aucun besoin pour nous.

---

## Q4 — Approches 2025-2026 « légères » pour animer un personnage cartoon d'une seule image

### Takeaway
Il n'y a pas de percée « Animate Anyone sans diffusion » qui tourne sur CPU. La nouveauté 2026 est la **décomposition
d'une illustration en calques complétés avec ordre de dessin** (See-through, SIGGRAPH 2026), donc la préparation d'un
rig façon Live2D. Elle demande un GPU de 8 à 16 Go et des poids SDXL sous openrail++. Côté exécution, l'état de l'art
reste le **maillage déformé par paramètres** (Live2D, Inochi2D sous BSD-2) et l'ARAP (AniClipart y ajoute des a priori
vidéo pour l'optimiser). Notre voie est donc : calques complétés une fois, puis maillage, ARAP et paramètres en code pur.

### Cited Findings
- **See-through** (shitagaki-lab, SIGGRAPH 2026) : il décompose une image unique en calques sémantiques **inpaintés**
  (jusqu'à 23 : cheveux, visage, yeux, vêtements, accessoires) avec un ordre de dessin inféré, et exporte un PSD.
  - Le code est sous **Apache-2.0** (fichier LICENSE).
  - Il faut environ 12–16 Go de VRAM en bf16 à 1280 px, environ 10 Go avec délestage et environ 8 Go en NF4.
  - Le README ne mentionne pas de CPU.
  - Il note que la chaîne complète vers Live2D demande encore du travail.
  - [README et LICENSE](https://github.com/shitagaki-lab/see-through), [arXiv 2602.03749](https://arxiv.org/html/2602.03749v1).
- **Poids See-through (LayerDiff 3D)** : étiquette `openrail++`. Le texte précise Apache-2.0 pour les contributions des
  auteurs, avec héritage de CreativeML Open RAIL++-M (SDXL 1.0, Animagine XL 4.0) et Open RAIL-M (LayerDiffuse). La page
  dit « Commercial use is permitted », mais les restrictions d'usage RAIL s'appliquent —
  [HF layerdifforg/seethroughv0.0.2_layerdiff3d](https://huggingface.co/layerdifforg/seethroughv0.0.2_layerdiff3d).
  **Correction de nos notes précédentes**, qui disaient « See-through […] n'ont pas de code public » —
  `research_notes/Moteurs vidéo IA pour la troupe/coherence_personnages_lipsync.md`.
- **Inochi2D** : « a library for realtime 2D puppet animation […] works by deforming 2D meshes created from layered
  art at runtime based on parameters ». Licence BSD-2-Clause, écrit en D —
  [GitHub Inochi2D](https://github.com/Inochi2D/inochi2d), [LICENSE](https://github.com/Inochi2D/inochi2d/blob/main/LICENSE).
- **CartoonAlive** (arXiv 2507.17327, juillet 2025) : il part d'un portrait et produit un modèle Live2D. Il reprend
  l'idée des bases de formes 3D pour créer des blendshapes Live2D, estime les poids depuis les points du visage, et met
  « less than half a minute ». La page ne dit rien du code ni des poids — [arXiv 2507.17327](https://arxiv.org/abs/2507.17327).
- **AniClipart** : il anime un clipart en optimisant des trajectoires de points-clés guidées par un a priori
  texte→vidéo, avec un « differentiable As-Rigid-As-Possible shape deformation » — [arXiv 2404.12347](https://arxiv.org/abs/2404.12347).
  Pas de dépôt ni de licence trouvés dans la recherche.
- **DrawingSpinUp** (SIGGRAPH Asia 2024) : aucun fichier LICENSE. Il reconstruit le dessin en 3D, fait faire le rig par
  le service en ligne Mixamo, rend dans Blender et a été testé sur RTX 4090 — note interne
  `research_notes/Animer Blender par prompt/animation_personnages_dessines.md`, [README](https://github.com/LordLiang/DrawingSpinUp).
- **ToonCrafter** : code sous Apache-2.0, poids sans licence claire, interpolation entre images clés par diffusion —
  `coherence_personnages_lipsync.md` (notes précédentes), [LICENSE](https://github.com/Doubiiu/ToonCrafter/blob/main/LICENSE).

### Inferences
- See-through pourrait produire **une fois par planche** les calques complétés qui manquent à Animated Drawings (torse
  sous les bras, cou sous le menton). Mais il faut un GPU. Sans GPU, la complétion se fait **à la main ou
  procéduralement** pour nos personnages créés en code, puisqu'on dessine chaque partie entière. Pour les planches,
  c'est une tâche ponctuelle à budgéter.
- L'outil « paramètres → déformation du maillage » de Live2D et Inochi2D est la technique qui donne l'illusion de volume
  (tête qui tourne de trois quarts) **sans 3D**. C'est le remède direct au « trop lego » des pièces rigides.

### Gaps
- « From Rigging to Waving » (TOG, décembre 2025) n'a pas pu être retrouvé ni vérifié par la recherche. Non utilisé.
- See-through n'a pas été mesuré sur CPU ; un SDXL sur 4 cœurs est probablement très lent. Non testé.
- Licence d'AniClipart et de CartoonAlive inconnue.

---

## Q5 — Banc CPU (ce conteneur) : quelle déformation est fluide, sûre et déterministe ?

### Takeaway
Sur un bras de 561 sommets et sur une silhouette entière, l'**ARAP d'Igarashi en deux étapes**, résolu en forme close
avec factorisations précalculées, gagne. Il ne retourne pratiquement aucun triangle jusqu'à 135° de coude, coûte 0,9 à
3,8 ms par image en JS pour 500 à 1 800 sommets, et c'est une **fonction pure des poignées**. L'ARAP local/global
« réchauffé » par l'image précédente, avec 2 itérations comme notre `arap.ts` actuel, dépend du chemin : jusqu'à
**98,6 px d'écart** entre « jouer jusqu'à l'image 30 » et « sauter à l'image 30 ». Cela viole le `evaluate(t)` pur de la
spec. Le LBS plie mal le coude (3,7 % de triangles retournés à 135°). La TPS par pixel est impraticable sur CPU ; sur les
sommets, elle est gratuite.

### Cited Findings (mesures de ce banc)
Source : `/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/scripts/bench_warp.out.txt`
et `bench_scrub.out.txt`. Le code a été écrit pour ce banc.

**Bras de 300×60 px (561 sommets, 1 000 triangles), poignées sur les articulations (épaule, coude, poignet)**

« Retournés » est la part de triangles inversés. « Aire min » est le plus petit rapport d'aire, et une valeur négative
signifie un triangle retourné. « Anisotropie » est le pire rapport σ1/σ2. « |σ−1| moy. » est l'écart moyen des valeurs
singulières à 1 : plus il est petit, plus la déformation est rigide.

| Coude | Méthode | Retournés | Aire min | Anisotropie | \|σ−1\| moy. |
|---|---|---|---|---|---|
| 90° | ARAP Igarashi 2 étapes | 0 % | 0,367 | 2,50 | 0,083 |
| 90° | ARAP Sorkine 2 it. (depuis le repos) | 0,3 % | −0,719 | 451 | 0,261 |
| 90° | ARAP Sorkine 20 it. | 0 % | 0,372 | 2,61 | 0,079 |
| 90° | Igarashi + 2 it. Sorkine | 0 % | 0,423 | 2,28 | **0,075** |
| 90° | LBS (poids 1/d⁴) | 0,3 % | −0,009 | 2 840 | 0,104 |
| 90° | MLS rigide (Schaefer) | 0 % | 0,73 | 2,48 | 0,217 |
| 135° | ARAP Igarashi 2 étapes | 0,3 % | −0,199 | 65,6 | 0,114 |
| 135° | Igarashi + 2 it. Sorkine | 0,1 % | −0,038 | 45,7 | **0,089** |
| 135° | LBS | 3,7 % | −0,193 | 81,1 | 0,135 |
| 135° | MLS rigide | 0 % | 0,083 | 29,3 | 0,263 |
| 160° | ARAP Igarashi 2 étapes | 0,2 % | −0,141 | 626 | 0,122 |
| 160° | ARAP Sorkine 2 it. | **32,2 %** | −2,27 | 5 941 | 0,423 |
| 160° | ARAP Sorkine 20 it. | 0,2 % | −0,05 | 18,9 | 0,100 |
| 160° | LBS | 3,8 % | −0,138 | 347 | 0,147 |
| 160° | MLS rigide | 2 % | −1,67 | 96,1 | 0,230 |

- **Épingler tout l'os** (5 à 6 poignées échantillonnées le long de chaque os) n'aide pas : à 45°, l'Igarashi passe à
  une aire min de 0,054 et une anisotropie de 13,8, contre 0,766 et 1,31 avec les seules articulations. La déformation
  se concentre au coude.
- **Coût sur une silhouette entière** (600×1100 px, 16 articulations, 60 images d'un bras qui salue). Le premier temps
  d'Igarashi sur le bras (12 ms) inclut la mise en route du JIT.

| Pas de grille | Sommets | Triangles | Préparation | Igarashi / image | Sorkine 4 it. / image |
|---|---|---|---|---|---|
| 24 px | 486 | 796 | 29 ms | 0,89 ms | 1,08 ms |
| 16 px | 1 018 | 1 774 | 90 ms | 1,90 ms | 1,28 ms |
| 12 px | 1 763 | 3 176 | 90 ms | 3,79 ms | 2,65 ms |
| 8 px | 3 828 | 7 102 | 343 ms | 15,5 ms | 7,49 ms |

- **TPS à 24 points de contrôle** : résolution du système 1,18 ms ; évaluation **par pixel** en 1080×1920 **844 ms** ;
  sur 2 000 sommets **0,78 ms**.
- **Dépendance au chemin (scrub)** : image 30 jouée 0→30 comparée à un saut direct, puis retour 30→0 comparé à la
  pose de repos.

| Méthode | Écart max., image 30 jouée vs sautée | Écart max., retour à l'image 0 vs repos |
|---|---|---|
| Sorkine réchauffé, 2 it. | 98,6 px | 12,27 px |
| Sorkine réchauffé, 4 it. | 77,6 px | 4,88 px |
| Sorkine réchauffé, 8 it. | 49,4 px | 1,72 px |
| Igarashi forme close | **0** | **0** |

- Notre `arap.ts` actuel est un ARAP local/global à poids uniformes, « warm-started from the previous frame, 2 are
  enough while moving smoothly », appelé avec `solve(rig.pos, 2)` —
  `workbench/server/jev/studio/actor/arap.ts`, `workbench/direct/lib/studio/sheetActor.ts:312` (branche lue).

### Inferences
- Notre solveur actuel **dépend de l'historique**. La même image ne donne pas le même maillage selon qu'on y arrive en
  lecture ou en saut, et un aller-retour ne revient pas au repos (12 px). C'est incompatible avec la spec (« même entrée =
  même état », scrub avant/arrière reproductible). C'est aussi un candidat sérieux aux à-coups observés lors des coupes et
  des reprises. Il faut le remplacer par Igarashi en forme close, plus éventuellement k itérations Sorkine **initialisées
  par Igarashi**, jamais par l'image précédente.
- Le budget est confortable : 4 personnages à 1 000–1 800 sommets coûtent 8 à 15 ms par image de CPU en JS. Le rendu
  final se fait image par image hors temps réel, donc cela tient même à 25 i/s en prévisualisation.
- Les métriques de ce banc (part de triangles retournés, aire min, anisotropie, écart de scrub) se transforment
  directement en **tests de l'AnimationQualityGate**.

### Gaps
- Le banc utilise une grille régulière. Un maillage contour + Delaunay contrainte, plus dense aux articulations, n'a pas
  été mesuré ; c'est l'étape suivante.
- L'ARAP à rigidité pondérée (arêtes d'os plus raides) n'a pas été mesuré.
- Le rendu WebGL ou PixiJS du maillage déformé n'a pas été mesuré ici ; c'est une autre piste.

---

## Ce que nous greffons dans notre moteur

Principe : **rien n'est généré, tout est déplacé**. L'identité est garantie par construction : on ne peint jamais un
pixel qui n'existe pas dans un calque dessiné. Chaque composant ci-dessous est réimplémenté en TypeScript (moteur web,
PixiJS pour le rendu) à partir des formules, sans copier de code. Les composants Python ne servent que hors ligne.

### G1. `CharacterRigAdapter` — maillage par calque, à partir du masque (amélioration d'Animated Drawings)
- **Entrée** : un calque RGBA par partie (tête, torse, bassin, bras, avant-bras, mains, cuisses, jambes, pieds), avec
  pivots anatomiques. Nos personnages procéduraux sont dessinés **entiers**, sans trou caché sous un autre membre. Les
  planches de l'utilisateur passent par une complétion faite une fois (voir G6).
- **Maillage** : contour du masque, simplifié par Douglas-Peucker (tolérance d'environ 1 px), plus des points intérieurs
  à densité adaptative : pas de 8 px à moins de 1,5 rayon d'une articulation, 16 px ailleurs. Triangulation de
  **Delaunay contrainte** par les arêtes du contour, avec de petites bibliothèques permissives : `delaunator` (ISC) +
  `@kninnug/constrainautor` (ISC), ou `cdt2d` (MIT), ou `poly2tri` (BSD-3) —
  [npm delaunator](https://www.npmjs.com/package/delaunator), [npm @kninnug/constrainautor](https://www.npmjs.com/package/@kninnug/constrainautor),
  [npm cdt2d](https://www.npmjs.com/package/cdt2d), [npm poly2tri](https://www.npmjs.com/package/poly2tri).
  *Mieux qu'AD*, qui fait une Delaunay non contrainte puis filtre par centroïdes, ce qui crée des ponts entre deux
  membres proches. Nous ajoutons aussi un raffinement si un angle descend sous 20°.
- **Attribution aux os** : Dijkstra géodésique dans le masque depuis des graines le long des os (idée d'AD). Elle sert à
  l'**ordre de rendu par partie**. Les **poids de peau lisses** viennent de `boneHeat.ts`, déjà écrit, pour la
  transition au coude.
- **Secours sans repère** : l'axe d'une partie se tire de l'ACP de son masque (idée de MRAA, article seul).
  ```
  µ = Σ m(z)·z / Σ m(z) ;  C = Σ m(z)(z−µ)(z−µ)ᵀ / Σ m(z) ;  axe = vecteur propre de la plus grande valeur propre de C
  ```

### G2. `PoseBlend / MotionController` → `DeformSolver` : ARAP Igarashi en forme close, déterministe
- **Précalcul** (une fois par calque et par jeu de poignées) :
  - pour chaque arête k = (i, j), on prend les voisins N_k = {i, j, l, r}, on construit `G_k` (2|N|×2, lignes
    `[x y ; y −x]` relatives à v_i), puis `g_k = (G_kᵀG_k)⁻¹G_kᵀ·E_N` ;
  - on factorise une fois `K1 = A1ᵀA1 + w²·Σ_h BᵀB` (taille 2V) et `K2 = A2ᵀA2 + w²·Σ_h BᵀB` (taille V ; A2ᵀA2 est le
    Laplacien du graphe des arêtes) par **Cholesky bande
    après renumérotation Cuthill-McKee inverse**. *Mieux qu'AD*, qui refactorise à chaque image avec `spsolve` et
    construit d'abord des matrices denses.
- **Par image** (forme close, sans itération, donc **pure**) :
  ```
  v1 = K1⁻¹ · (w²·Σ_h Bᵀ c_h)                          // étape 1 : similitudes
  pour chaque arête k : (c,s) = g_k · v1[N_k] ; (c,s) /= ‖(c,s)‖
                        r_k = [[c, s],[−s, c]] · e_k⁰   // rotation pure
  b2 = Σ_k ±r_k + w²·Σ_h Bᵀ c_h
  x = K2⁻¹ b2x ; y = K2⁻¹ b2y                           // étape 2 : ajustement d'échelle
  option qualité : 2 itérations local/global (Sorkine) INITIALISÉES PAR (x, y), jamais par l'image précédente
  ```
  Mesuré : 0,9 à 3,8 ms par image pour 486 à 1 763 sommets. L'écart de scrub vaut 0 px. L'option qualité ramène |σ−1|
  moyen de 0,083 à 0,075 à 90°.
- **Rigidité pondérée** (notre amélioration, à valider au banc) : les arêtes intérieures au « cœur » d'un os reçoivent
  un poids `κ = 4–10`, celles de la zone d'articulation `κ = 1`. Dans les deux étapes, on minimise
  `Σ κ_k ‖e'_k − T_k e_k‖²`. Effet attendu : avant-bras droits (« pas en caoutchouc ») et pli concentré au coude.
  Épingler l'os entier, lui, a été **mesuré et rejeté** (aire min 0,054 à 45°).
- **Retournements** : si le test signé `det(J_t) ≤ 0` touche plus de 0,5 % des triangles, on bascule ce calque sur
  **deux sous-maillages** (bras et avant-bras) superposés au coude, avec un recouvrement en dégradé. C'est la méthode
  cut-out des studios, et elle est sûre au-delà de 135°.

### G3. Retargeting « perspective tordue » amélioré (d'AD), avec temps exact
- On choisit un plan **par groupe de membres** (bras, jambes, tronc), et **par fenêtre d'action** plutôt que sur tout le
  clip :
  ```
  pc3 = 3e vecteur propre de la covariance des positions du groupe sur la fenêtre [t0, t1]
  plan = argmax(|cos(pc3, n_frontal)|, |cos(pc3, n_sagittal)|)
  ```
  avec une **hystérésis** (on ne change de plan que si l'écart des cosinus dépasse 0,15) et un fondu de 6 images entre
  deux plans. Les normales de plan tournent du **lacet du personnage** (plan de 3/4 possible), pas seulement X/Z.
- **Angles, longueurs** : on garde les longueurs d'os dessinées (règle d'AD). On ajoute une option de **raccourci
  limité** `ℓ' = ℓ·max(0,85, cos φ)` pour les membres qui pointent vers la caméra, pour le jeu comique (bras qui accuse
  vers le spectateur).
- **Temps** : `t = frameIndex / fps` exact. Les courbes du clip sont échantillonnées en continu : interpolation d'angles
  **dépliés** (unwrap) par spline cubique de Hermite avec tangentes de Catmull-Rom, ou slerp pour les quaternions. *Mieux
  qu'AD*, qui arrondit à l'image BVH la plus proche et cumule `time += dt`.
- **Pieds sans glisser** : on détecte les contacts (pied sous 2 cm du sol et vitesse inférieure à 0,15 m/s, avec
  hystérésis). Pendant un contact, la position du pied est verrouillée et la jambe est résolue par **IK analytique à
  deux os**, loi des cosinus :
  ```
  cos θ_genou = (a² + b² − d²) / (2ab) ;  θ_hanche = atan2(d_y, d_x) ± acos((a² + d² − b²) / (2ad))
  ```
  Le racine, elle, est déplacée à partir du pied d'appui : `Δracine = −Δpied_appui`. AD n'a rien de tel.
- **Amplitude entre gabarits** (de FOMM) : `échelle = √(aire_enveloppe(perso) / aire_enveloppe(source))` appliquée aux
  translations des mains et de la racine. On garde séparément le rapport des longueurs de jambes d'AD pour la racine.

### G4. Ordre de rendu sans « saut » (correction d'AD)
- La profondeur de chaque groupe est `d_g(t)` = moyenne des profondeurs de ses articulations motrices. L'ordre est
  calculé sur `d_g` **avec une marge d'hystérésis ε = 2 cm**. Quand deux groupes s'échangent, au lieu de permuter d'un
  coup, on dessine le groupe qui passe devant en double pendant 2 à 3 images avec un alpha 0 → 1 limité au masque de
  recouvrement.
- Les échanges sont des **événements de la timeline**, éditables : le réalisateur peut forcer « bras devant » pendant un
  geste d'accusation.
- On garde le test d'AD « tête au-dessus de la ligne des épaules » comme garde-fou.

### G5. `Dialogue & VisemeTrack` — visage : deux voies, une même interface
- **Voie A, code pur** : nos personnages créés sur CPU, et les planches en secours.
  - Rig de visage : environ 20 points de contrôle (paupières hautes et basses, sourcils, coins des lèvres, lèvre
    supérieure et inférieure au milieu, menton).
  - Déformation : **TPS régularisée** sur les sommets du maillage du visage.
    ```
    [K + λI  P ; Pᵀ 0] [w ; a] = [y ; 0] ;  K_ij = U(‖p_i − p_j‖) ;  U(r) = r² log r² ;  λ = 0,01 (comme TPS-MM)
    ```
    Les sommets de l'**anneau de raccord** (contour du visage, cheveux, cou) sont des points de contrôle à déplacement
    nul. C'est notre « stitching » sans réseau : raccord invisible, comme le module S de LivePortrait.
  - **Intérieur de bouche et dents** : un calque **sous** les lèvres, révélé par le masque d'ouverture. C'est notre
    « carte d'occlusion » explicite, à la place de l'inpainting appris de FOMM et TPS-MM.
  - **Visèmes français** (13 classes de la spec) = combinaisons de 5 commandes, suivant le principe des commandes
    paramétriques de LivePortrait :
    - ouverture (0–0,8) ;
    - étirement (grin) ;
    - arrondi et projection (pursing / pouting) ;
    - lèvre inférieure rentrée (F/V) ;
    - dents visibles (S/Z, T/D/N).

    | Visème | Commandes |
    |---|---|
    | M/B/P | ouverture 0, lèvres pressées |
    | A | 0,7 |
    | E | 0,4 + étirement 0,5 |
    | I | 0,25 + étirement 0,8 |
    | O | 0,45 + arrondi 0,7 |
    | U/OU | 0,2 + arrondi 1 + projection 0,6 |
    | F/V | 0,1 + lèvre inférieure rentrée 1 |
    | S/Z | 0,15 + étirement 0,4 + dents 1 |
    | CH/J | 0,2 + projection 0,8 |
    | L/R | 0,3 |
    | T/D/N | 0,2 + dents 0,6 |
    | K/G | 0,35 |

    Ces valeurs sont initiales et **éditables**, à calibrer à l'œil.
  - Coarticulation : chaque commande est une courbe **Hermite** entre cibles, avec anticipation de 40 à 60 ms avant
    l'audio. Les fermetures M/B/P sont **prioritaires** (elles écrasent les autres pendant au moins 2 images).
- **Voie B, LivePortrait** (MIT, planches raster de l'utilisateur seulement) : on garde le **remplacement par
  bibliothèque**. On l'étend à une grille « visème × yeux (ouvert, mi-clos, fermé) × pose » construite **une fois** en
  composant `δ` comme les commandes de `gradio_pipeline.py` : lip close/open, grin, pursing, pouting, smile, puis les
  modules de retargeting yeux et lèvres jusqu'à 0,8.
  - Coût de construction ponctuel, à 7,9 s/image mesuré : 13 visèmes × 3 états d'yeux × 5 poses × 7 personnages =
    1 365 images, soit **environ 3 h de CPU une fois**, puis 0 s par film.
  - Le collage dans la planche passe par un masque en dégradé, comme `paste_back` de LivePortrait.
  - Jamais InsightFace (non commercial).
  - Lissage hors ligne des pistes (lisseur RTS, comme le Kalman de LivePortrait) pour rester compatible avec un
    `evaluate(t)` pur.

### G6. Calques complétés (« amodal ») — la vraie réponse à l'occlusion
- **Personnages procéduraux** : chaque partie est dessinée entière ; le torse existe sous le bras. C'est un coût nul et
  la solution la plus robuste.
- **Planches de l'utilisateur** : découpe manuelle assistée (masques de parties) et complétion **une fois** des zones
  cachées.
  - Option GPU future : See-through (code Apache-2.0, poids openrail++ avec restrictions d'usage, 8–16 Go de VRAM).
  - Option CPU : dessin de la zone cachée par l'utilisateur, ou par notre `stable-diffusion.cpp` local en inpainting,
    **non mesuré**.
- **Masque d'occlusion géométrique** à chaque image : `occ(z) = 1` là où un triangle d'un calque d'avant-plan couvre z.
  On n'invente rien : le calque de dessous, complété, apparaît.

### G7. Profondeur « Live2D » par paramètres (keyforms) — remède au « trop lego »
- On ajoute des paramètres de déformation, comme Inochi2D (BSD-2) l'expose : « deforming 2D meshes […] based on
  parameters ».
  - Tête : lacet ∈ [−1, 1] et tangage ∈ [−1, 1].
  - Torse : torsion.
- Pour chacun, on précalcule des **formes clés** (keyforms) en projetant le maillage du visage sur un ellipsoïde
  `z(x, y) = R·√(1 − ((x−cx)/Rx)² − ((y−cy)/Ry)²)`. Les calques de traits (nez, yeux, bouche, oreilles) reçoivent un z
  propre : le nez est plus en avant que les yeux.
  ```
  x'(θ) = cx + (x − cx)·cos θ + z·sin θ        (θ = lacet·25°, même borne que l'interface de LivePortrait)
  ```
  On fait une interpolation **bilinéaire** entre 3×3 formes clés, puis un ARAP de lissage (G2) sur le résultat.
  L'effet attendu est une tête qui « tourne » de trois quarts, sans changer de dessin, avec un vrai volume.

### G8. `TimelineEvaluator` et `AnimationQualityGate` — tests issus des bancs
- **Pureté** : `evaluate(t)` = Igarashi en forme close sur des poignées issues de courbes analytiques. Le test « scrub »
  exige un écart de **0 px** entre une image jouée et une image sautée, et entre un aller-retour et l'original. Notre
  `arap.ts` actuel échoue aujourd'hui : 98,6 px.
- **Géométrie** : par calque et par image, triangles retournés = **0 %**, aire min > 0,3, anisotropie max < 4 hors
  articulations. Ces seuils viennent du banc, où Igarashi tient jusqu'à 90°.
- **Mouvement** : énergie et couverture du mouvement (critères du film 9, qui avait échoué : motion 0,0271, couverture
  0,53). On les mesure **sur les sommets déformés**, pas sur les pixels. C'est moins bruité et 1 000 fois moins cher.
- **Temps** : aucun cumul flottant, frame k ⇔ t = k/fps. Vérification de la continuité C¹ des courbes aux coupes de
  plans d'action (G3).

### Ce que nous NE prenons pas
- Aucun réseau de FOMM, TPS-MM ou MRAA : poids sans licence claire pour FOMM et TPS-MM, code non licencié pour MRAA. Ils
  sont trop chers sur CPU, et le mouvement appris réalise mal les dessins.
- Ni les détecteurs mmdet/mmpose d'AD, ni InsightFace (non commercial).
- Ni la perspective tordue figée sur tout un clip, ni le tri de profondeur sans hystérésis, ni l'ARAP refactorisé à
  chaque image : ce sont les points faibles d'AD que nous corrigeons.
