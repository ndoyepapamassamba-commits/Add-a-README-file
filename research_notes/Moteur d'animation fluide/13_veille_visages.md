# 13 — Veille « visages » : LivePortrait et ses dérivés, audio → visage, rigs paramétriques (Live2D, Inochi2D, THA), rotation de tête 2,5D — ce qu'on agrège dans `moteur-fluide` (banc du 16/10/2026)

Conventions (les mêmes que les notes 06 et 07) :
- **[mesure]** : mesure faite dans ce conteneur le 16/10/2026 (4 vCPU Xeon 2,10 GHz avec AVX-512, `avx512_bf16`,
  `amx_bf16` et `amx_int8`, 15 Go de RAM, sans GPU), **2 threads**. Le processeur était **partagé** avec d'autres
  pistes (charge moyenne relevée entre 5,7 et 11,2 sur 4 cœurs) : tous les temps sont des **majorants**.
- `S` = `/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad`.
  - Sources lues (clones superficiels, code seul, médias et `.git` supprimés après lecture) :
    `S/sources/veille2/visages/` ; commits dans `S/sources/veille2/visages/COMMITS.txt`.
    LivePortrait est lu au commit `9b294b3` (2 juin 2026), via le clone existant `S/sources/warping/LivePortrait`.
  - Scripts écrits pour ce banc (**aucun code tiers copié** ; ils importent les modules de LivePortrait pour les
    exécuter) : `S/veille2/visages/scripts/banc_lp.py` (coût par module, commandes paramétriques),
    `banc_lp2.py` (stitching, linéarité, composition, warp contre décodeur), `extraire_cles.py` (prototype de l'outil
    d'extraction des formes clés), `tete25d.py` (rotation de tête : plan, ellipsoïde, profondeur, LivePortrait),
    `proto_maillage.py` (formes clés appliquées comme le ferait notre moteur).
  - Sorties **privées** (images du visage de MODOU, champs, JSON), jamais poussées : `S/veille2/visages/out_front/`,
    `out2_front/`, `out2_tex/`, `cles/`, `tete25d_front/`, `proto/`.
- Personnage : **MODOU**, deux recadrages du visage (300 px → 512) :
  - « face » : `studio-troupe/.private/personnages/modou/modou.png` (planche frontale 576×1024, paupières lourdes,
    bouche fermée) ;
  - « 3/4 » : la texture réellement utilisée par le moteur, `studio-troupe/sorties/cache/personnages/modou/modou.texture.png`
    (vue de 3/4, sourire, agrandie par ESRGAN).
- Téléchargements de cette piste : poids LivePortrait « humains » (F, M, W, G, S) **522 Mo**, Depth Anything V2
  Small ONNX **99 Mo**, soit 621 Mo. Hachages vérifiés contre Hugging Face, puis **fichiers supprimés** à la fin
  pour garder plus de 4 Go libres (ils se re-téléchargent ; sha256 ci-dessous).
- Les notes 01 (Q2, G5, G7) et 06 (Q3) ont déjà décrit l'architecture de LivePortrait et MediaPipe sur nos cartoons.
  Cette note ne les répète pas : elle **mesure** ce qui manquait (bf16, stitching sur cartoon, champ de déformation
  réutilisable, rotation de tête) et décide de l'agrégation.

---

## Synthèse

**La découverte de cette piste : le module de déformation W de LivePortrait est un excellent « professeur » de
déformations 2,5D, et on peut l'utiliser sans son décodeur.** On extrait, une fois par personnage, le champ 2D que W
calcule pour une grille de poses de tête (lacet × tangage) et pour une dizaine d'expressions. Ce sont des **formes
clés** au sens de Live2D. Notre moteur les mélange ensuite en temps réel, de façon déterministe, en déplaçant les
pixels du dessin d'origine. L'identité reste donc exacte, et la tête tourne vraiment de 3/4 sans nouveau dessin.

Ce qui est mesuré sur MODOU :
- **Coût** : 27 champs (grille de tête 5×3 et 13 expressions) en **62 s** de CPU, en bf16 sur 2 threads. Le fichier
  fait **432 Ko** par personnage. Il faut compter environ 1 h 30 une seule fois pour toute la troupe, en ajoutant
  les incrustations ci-dessous.
- **Fidélité** : le warp seul explique l'essentiel de la géométrie de LivePortrait. Dans la zone qui change, le PSNR
  passe de 9,1 à 16,2 dB pour un lacet de 20°, de 10,4 à 20,1 dB pour un tangage de 10°, et de 12,1 à 17,2 dB pour
  l'ouverture de la bouche.
- **Ce que le warp ne crée pas** : il ne crée **rien** pour les paupières fermées (11,5 → 12,1 dB) ni pour
  l'intérieur de la bouche. Ce sont les seuls endroits où le décodeur SPADE apporte quelque chose. Il le fait **dans
  le style Pixar du dessin** : dents, langue et paupières sont crédibles. Ces zones deviennent des **incrustations**
  générées une fois, comme le fait l'élève de THA4 : `(1−α)·warp + α·couleur`.
- **Application** : les champs s'appliquent par une **grille à UV animées** (carte arrière). Inverser le champ pour
  déplacer les sommets échoue sur le lacet : résidu p99 de 36 px, oreille arrachée. Avec un pas de grille de 16 px,
  l'erreur est de 0,26 px en moyenne et de 1,6 px au p99.
- **Correction indispensable** : le stitching de LivePortrait, appliqué tel quel, déforme le cartoon au repos. Le
  PSNR tombe de 39,0 à 25,2 dB (face) et de 39,1 à 21,1 dB (3/4), et les paupières lourdes de MODOU s'ouvrent. Le
  **stitching relatif** `S(x_s, x_d) − S(x_s, x_s)` règle ce défaut et rend 39,0 dB.
- **Mélange** : les expressions sont quasi linéaires. L'erreur est de 0,33 px pour une amplitude de 15 px quand on
  additionne ouverture et sourire. La tête doit en revanche se mélanger sur une **grille d'au moins 5 lacets** :
  écart au linéaire de 9 px au maximum. Et l'expression doit se **composer** après la tête (parent puis enfant, comme
  les déformeurs de Live2D) plutôt que s'additionner : l'erreur moyenne dans la zone de la bouche passe de 3,1–3,5 px
  à 1,5–1,8 px.

Le reste de la veille donne des **concepts**, pas du code ni des poids utilisables :
- **Audio → visage** : SadTalker, EchoMimic v1–v3, Ditto, KDTalker et FLOAT sont soit GPU seulement, soit bloqués
  par leur licence. Seul **JoyVASA** (MIT, poids MIT) est propre ; il produit des mouvements dans l'espace de
  LivePortrait, donc **directement dans l'espace de nos formes clés** (plus tard).
- **Live2D, Inochi2D et THA** donnent le vocabulaire des paramètres, l'interpolation et l'architecture
  « warp + alpha + couleur ».
- **Rotation de tête par la profondeur** (Depth Anything V2 Small) : correcte en tangage (corrélation 0,87 avec
  LivePortrait), mais elle **déchire** oreilles et silhouette en lacet. Le champ appris de LivePortrait la remplace.

---

## Q1. LivePortrait sur CPU et sur nos dessins : coût réel, bf16, stitching, ce que voit le décodeur

### Takeaway
En bf16 (AMX), une image complète (W puis G) coûte **4,3 à 7,0 s** sur 2 threads chargés, contre 9 à 14 s en fp32.
Le gain vient surtout du décodeur SPADE (fp32 : 5,8 à 9,1 s ; bf16 : 2,1 à 4,9 s), et le bf16 ne coûte **rien en
qualité** : 39,04 dB contre 39,0 dB en reconstruction, et champ décalé de 0,23 à 0,25 px au plus. Le module W seul
coûte 1,7 à 2,2 s en bf16.

Sur nos cartoons, **le stitching absolu est nuisible**. Au repos, il modifie l'expression : il ouvre les paupières
lourdes de MODOU. Il faut le rendre **relatif**. Le décodeur dessine des intérieurs de bouche et des paupières
fermées **dans le style** du dessin. Avec le stitching relatif, il touche à peine le reste du visage quand on
ouvre la bouche : écart moyen de 1,3 à 1,9 sur 255 dans la zone des yeux. Mais il re-rend tout le visage en
l'adoucissant légèrement (39 dB au repos), et il barbouille tout ce qu'il doit inventer. Il faut donc **le cantonner
à des incrustations masquées**.

### Cited Findings
- **Licence** : code MIT. Le `LICENSE` ajoute : « The models of InsightFace are for non-commercial research purposes
  only. If you want to use the LivePortrait project for commercial purposes, you should remove and replace
  InsightFace's detection models » — [LICENSE](https://github.com/KwaiVGI/LivePortrait/blob/main/LICENSE).
  Poids : la fiche Hugging Face est `license: mit`. Le dépôt redirige désormais vers `KlingTeam/LivePortrait` —
  [HF KlingTeam/LivePortrait](https://huggingface.co/KlingTeam/LivePortrait).
  - **Nous n'utilisons ni InsightFace ni `landmark.onnx`** : le recadrage vient de nos ancrages (rig) ; MediaPipe
    (Apache-2.0) sert de secours.
  - sha256 des poids téléchargés (identiques aux objets LFS) : `appearance_feature_extractor.pth` `5279bb86…`,
    `motion_extractor.pth` `251e6a94…`, `warping_module.pth` `2f61a6f2…`, `spade_generator.pth` `4780afc7…`,
    `stitching_retargeting_module.pth` `3652d5a3…`.
- **Charger sans le pipeline** : `load_model(ckpt, config, device, type)` construit F, M, W, G, et un dictionnaire
  `{'stitching', 'lip', 'eye'}` de MLP —
  [src/utils/helper.py](https://github.com/KwaiVGI/LivePortrait/blob/main/src/utils/helper.py).
  - W renvoie `{'occlusion_map', 'deformation' (B×16×64×64×3), 'out'}` —
    [warping_network.py](https://github.com/KwaiVGI/LivePortrait/blob/main/src/modules/warping_network.py).
    **C'est ce `deformation` que nous réutilisons.**
- **Commandes paramétriques** (Gradio) : deltas sur des points-clés précis.
  - Sourire : `δ[20,y] −= 0,01·s`, `δ[14,y] −= 0,02·s`… ;
  - « lip close <-> open » : `δ[19,y] += 0,001·v`, avec v de −90 à 120 ;
  - « pursing » de −20 à 15, « grin » de 0 à 15, sourcils de −30 à 30, regard horizontal de ±30 et vertical de ±63 ;
  - tête : tangage ±15, lacet ±25, roulis ±15 ;
  - ratios cibles yeux et lèvres de 0 à 0,8 —
    [gradio_pipeline.py](https://github.com/KwaiVGI/LivePortrait/blob/main/src/gradio_pipeline.py),
    [app.py](https://github.com/KwaiVGI/LivePortrait/blob/main/app.py).
- **Groupes de points-clés implicites** (utiles pour nos masques par région) : lèvres `[6, 12, 14, 17, 19, 20]`,
  yeux `[11, 13, 15, 16, 18]` (`animation_region == "lip"` / `"eyes"`) —
  [live_portrait_pipeline.py](https://github.com/KwaiVGI/LivePortrait/blob/main/src/live_portrait_pipeline.py).
  Ditto reprend exactement ces deux listes (Q4).
- **Facteur d'amplitude entre visages** : `calc_motion_multiplier` = `√aire(enveloppe source) / √aire(enveloppe pilote)`
  sur les points-clés — [helper.py](https://github.com/KwaiVGI/LivePortrait/blob/main/src/utils/helper.py).
- **[mesure] Coût par module**, `banc_lp.py` et `banc_lp2.py`, recadrage 256 en entrée et 512 en sortie, 2 threads,
  minimum de 2 à 3 passages après chauffe :

| Module | fp32 (face, 1er banc) | bf16 (face, 1er banc) | fp32 / bf16 (face, 2e banc) | fp32 / bf16 (3/4) |
|---|---|---|---|---|
| F (apparence) | 0,68 s | 0,26 s | — | — |
| M (mouvement) | 0,17 s | 0,09 s | — | — |
| W (déformation) | 2,26 s | 2,10 s | 4,59 / 2,22 s | 3,18 / 1,68 s |
| G (SPADE 256→512) | 8,04 s | 4,85 s | 9,10 / 2,13 s | 5,78 / 2,57 s |
| **image W+G** | **10,3 s** | **7,0 s** | 13,7 / 4,35 s | 8,96 / **4,25 s** |
| S (MLP) | < 1 ms | < 1 ms | | |

  - La charge moyenne valait 8,3 à 8,6 pendant le premier et le deuxième banc, et 6,2 à 7,3 pendant le banc 3/4 :
    les écarts entre lignes viennent du partage du processeur.
  - Reconstruction au repos, sans stitching : **39,0 dB en fp32, 39,04 dB en bf16**.
  - Écart du champ de déformation bf16 face au fp32 : **0,23 px** (face) et **0,25 px** (3/4) au maximum, sur une
    image de 512 px.
  - La note 01 citait 7,9 s par image en fp32 sur 4 cœurs : c'est cohérent.
- **[mesure] Stitching au repos** (x_d = x_s), PSNR du rendu contre la source :

| Recadrage | sans stitching | stitching absolu `x_d + S(x_s,x_d)` | stitching relatif `x_d + S(x_s,x_d) − S(x_s,x_s)` |
|---|---|---|---|
| face | 39,0 dB | **25,19 dB** | 39,0 dB |
| 3/4 (texture du moteur) | 39,1 dB | **21,08 dB** | 39,1 dB |

  Au repos, le MLP de stitching ne renvoie pas zéro : sa norme max vaut 0,0137 (face) et 0,0229 (3/4) en unités de
  points-clés. Sur la planche de contrôle, les **paupières lourdes de MODOU deviennent rondes et ouvertes**.
- **[mesure] Ce que voit le décodeur** (planches `out_front/planche.jpg`, `out2_front/cmp_bouche.jpg`) :
  - le rétro-ciblage des lèvres à 0,8 et l'ouverture « 120 » produisent une bouche ouverte **avec dents et langue
    au style du dessin** ;
  - le rétro-ciblage des yeux à 0 et le clin d'œil de 30 produisent des **paupières fermées crédibles** ;
  - avec le stitching **absolu** (premier banc), l'œil s'arrondit dans toutes les variantes. Avec le stitching
    **relatif** (deuxième banc), la zone des yeux reste stable quand la bouche s'ouvre : écart moyen de 1,3/255
    (ouverture 60) et 1,9/255 (lèvres 0,8), avec 0,1 % et 0,5 % des pixels au-delà de 20/255. Fermer les yeux donne
    31,6/255 et 40 % ;
  - sur la vue de 3/4, tourner **vers le côté caché** (lacet +20) **barbouille** la moitié du visage, parce que le
    décodeur doit inventer ce qu'il ne voit pas. Tourner vers le profil reste propre, sauf là où le recadrage coupe
    le nez.
- **FasterLivePortrait** (MIT) : « If you want to use onnxruntime cpu inference, simply `pip install onnxruntime`.
  However, cpu inference is extremely slow and not recommended » — [README](https://github.com/warmshao/FasterLivePortrait).
  La note 01 avait mesuré 17,6 s par image en ONNX sur CPU.

### Inferences
- **Une passe neuronale complète en gros plan est possible, mais chère.** Un plan de 3 s à 30 i/s fait 90 images,
  soit **6,4 à 10,5 min** à 2 threads en bf16. Elle a deux défauts sur nos dessins :
  - adoucissement de la texture : le décodeur re-rend tout le visage (39 dB au repos), et barbouille ce qu'il
    invente ;
  - lissage temporel obligatoire : le Kalman de LivePortrait sur les points-clés.

  On la garde comme **option de finition** des gros plans (plus tard), jamais comme chemin principal.
- **Le stitching relatif n'est pas une option.** C'est une correction à intégrer d'office à tout usage de
  LivePortrait sur nos personnages. Il garde l'utilité du stitching (coller le mouvement aux épaules) sans son biais
  au repos.
- **Recadrage** : il faut une marge comme `crop_cfg` (échelle 2,3, `vy_ratio` −0,125). Notre recadrage de 3/4,
  trop serré, a coupé le nez au lacet −20. L'outil doit dériver le cadre des ancrages du rig (yeux, bouche, menton)
  et refuser un cadre qui coupe le visage.

### Gaps
- Pas de mesure à 4 threads ni sur machine libre. La compilation (`torch.compile`) et l'int8 n'ont pas été essayés :
  les convolutions dominent, et l'int8 dynamique ne touche que les couches linéaires.
- Un seul personnage (MODOU, deux vues). Il faudrait tester des visages avec foulard, des enfants, des aînés, des
  lunettes et des barbes épaisses.

---

## Q2. Le champ de déformation de LivePortrait comme « professeur » : formes clés 2D, linéarité, composition, maillage

### Takeaway
- **Projeter le champ 3D en 2D** : on fait la moyenne de `deformation[..., :2]` sur les 16 tranches de profondeur, pondérée par
  l'énergie des caractéristiques déformées. On obtient une carte arrière 64×64 qui, appliquée au **dessin d'origine**,
  reproduit la géométrie de LivePortrait : rotation de tête, mâchoire, coins de bouche, sourcils.
- **Expressions** : quasi additives.
- **Tête** : il faut une **grille de formes clés** (au moins 5 lacets × 3 tangages) avec interpolation cubique.
- **Expression et tête** : on **compose** les deux champs au lieu de les additionner.
- **Application** : par une **grille à UV animées** (chaque sommet de sortie lit la texture en `q + b(q)`), pas en
  inversant le champ.
- **Coût** : 27 champs en 62 s, puis quelques microsecondes par image dans le moteur.

### Cited Findings
- **[mesure] Le warp seul contre le rendu complet** (`banc_lp2.py`). On compare le rendu SPADE de chaque variante au
  rendu neutre, d'abord tel quel, puis déformé par notre champ 2D. Le PSNR est mesuré **dans la zone qui change**
  (pixels dont l'écart dépasse 20/255) :

| Variante | face : sans → avec warp | 3/4 : sans → avec warp | part de l'image qui change (face / 3/4) |
|---|---|---|---|
| lacet +10° | 10,2 → **18,4 dB** | 10,5 → 15,0 dB | 15,6 % / 23,6 % |
| lacet +20° | 9,1 → **16,2 dB** | 9,3 → 12,2 dB | 19,8 % / 32,0 % |
| lacet −20° | 9,4 → 15,0 dB | 9,3 → 13,8 dB | 19,8 % / 30,8 % |
| tangage +10° | 10,4 → **20,1 dB** | 8,3 → 14,4 dB | 15,7 % / 31,3 % |
| tangage +5° | 11,7 → 22,6 dB | 9,6 → 16,7 dB | 10,4 % / 22,3 % |
| ouverture « 60 » | 12,1 → 17,2 dB | 11,7 → 15,3 dB | 2,0 % / 4,8 % |
| lèvres rétro-ciblées 0,8 | 12,9 → 15,7 dB | 12,0 → 14,6 dB | 2,8 % / 6,2 % |
| **yeux fermés (rétro-ciblage 0)** | 11,5 → **12,1 dB** | 9,5 → 10,0 dB | 1,5 % / 1,7 % |

  Sur la planche de contrôle (`out2_front/cmp_lacet.jpg`), le warp seul du dessin d'origine donne un 3/4
  **convaincant**, plus net que le rendu SPADE. Le défaut se limite à un léger étirement du bord des cheveux et de
  l'oreille du côté qui s'éloigne.
- **[mesure] Linéarité** (déplacements en px sur l'image de 512) :

| Test | face | 3/4 |
|---|---|---|
| ouverture 60 + sourire 1,0 contre la somme des deux (1er banc) | **0,33 px** max pour 14,9 px d'amplitude | — |
| lacet +10 contre ½·(lacet +20) | max 9,0 px, moyenne 0,38 px (amplitude 51 px) | max 6,9 px, moyenne 0,45 px |
| tangage +5 contre ½·(tangage +10) | max 1,8 px (amplitude 27 px) | max 6,0 px (amplitude 28 px) |
| lacet +20 contre −(lacet −20) | résidu max 40 px : **pas antisymétrique** | — |

- **[mesure] Tête puis expression** : l'erreur est mesurée dans la zone où l'expression déplace de plus de 1 px. La
  composition arrière s'écrit `b(q) = b_tête(q) + b_expr(q + b_tête(q))`.

| Combinaison | addition (moyenne / max) | **composition** (moyenne / max) |
|---|---|---|
| lacet +20 + ouverture 60 (face) | 3,07 / 16,6 px | **1,56** / 16,6 px |
| lacet +20 + lèvres 0,8 (face) | 3,30 / 19,7 px | **1,49** / 19,7 px |
| lacet +20 + ouverture 60 (3/4) | 3,49 / 13,8 px | **1,82** / 11,4 px |
| lacet +20 + lèvres 0,8 (3/4) | 3,41 / 17,7 px | **1,62** / 9,0 px |

- **[mesure] Prototype de l'outil d'extraction** (`extraire_cles.py`, bf16, 2 threads, charge 5,7 à 7,9) :
  - champs extraits : grille de tête **5 lacets {−20, −10, 0, +10, +20} × 3 tangages {−10, 0, +10}**, plus 13
    expressions : ouverture, lèvres 0,8, sourire, étirement, arrondi, pincement, sourcils hauts, sourcils froncés,
    regard ±x, regard ±y, yeux fermés ;
  - **27 champs en 62,4 s au total**, dont chargement 0,84 s, F+M 0,57 s, et **2,18 s par champ** ;
  - fichier `npz` en float16 : **432 Ko** ;
  - pose source estimée par M : tangage 4,1°, lacet −1,8°, roulis 1,8°.
- **[mesure] Appliquer les champs comme notre moteur** (`proto_maillage.py`) :
  - **Champ avant aux sommets** (inversion par point fixe `f(p) = −b(p + f(p))`) : la méthode **échoue en lacet
    20°**, avec un résidu p99 de **36 px** dans la tête. Là où le côté qui s'éloigne est comprimé, `|∇b| > 1` et le
    point fixe diverge. Le clip rendu ainsi arrache l'oreille et cisaille le cou (`proto/clip_compare.jpg`, rangée du
    haut). Les autres champs s'inversent bien : tangage p99 0,22 px, lèvres 0,006 px.
  - **Grille à UV animées** (carte arrière, aucune inversion) : erreur d'une grille régulière interpolée
    bilinéairement, face au champ dense, sur l'image de 512 :

| Champ | pas 8 (4 225 sommets) | **pas 16 (1 089 sommets)** | pas 24 (484 sommets) | pas 32 (289 sommets) |
|---|---|---|---|---|
| lacet +20 | 0,10 / 0,56 px | **0,26 / 1,58 px** | 0,53 / 3,30 px | 0,78 / 4,30 px |
| tangage +10 | 0,06 / 0,38 px | 0,17 / 1,07 px | 0,38 / 1,96 px | 0,55 / 2,96 px |
| ouverture | 0,04 / 0,41 px | 0,11 / 1,50 px | 0,22 / 2,78 px | 0,33 / 4,59 px |
| lèvres 0,8 | 0,04 / 0,31 px | 0,10 / 1,08 px | 0,18 / 2,20 px | 0,34 / 4,36 px |
| sourire | 0,02 / 0,09 px | 0,03 / 0,16 px | 0,05 / 0,29 px | 0,05 / 0,25 px |

  (moyenne / p99 dans la silhouette)
  - Clip de 9 images, avec lacet de −20 à +20 interpolé entre les 5 formes clés et bouche 0 → 1 → 0 composée
    après la tête, grille de pas 16 : **rotation de 3/4 propre, oreilles et cou intacts, identité exacte**
    (`proto/clip_compare.jpg`, rangée du bas). Coût Python : 0,49 s pour les 9 images, champs denses compris.

### Inferences
- Un champ par forme clé suffit, sans réseau au rendu. C'est la version **analytique et sans entraînement** de la
  distillation de THA4 (Q5). THA4 entraîne un élève par personnage pendant environ 30 h de GPU ; nous
  **échantillonnons** le professeur sur une grille de paramètres, ce qui prend environ 1 min de CPU.
- **Pourquoi la grille arrière gagne** : LivePortrait rend lui-même par carte arrière (`grid_sample`). Une
  compression ou un repli n'y est jamais un trou : deux pixels de sortie lisent simplement le même endroit. Dans
  PixiJS, c'est un `Mesh` dont les **positions sont fixes** (grille dans le repère de la tête) et dont le **tampon
  d'UV change à chaque image**. La silhouette suit sans effort, puisque l'alpha est lu à travers les mêmes UV.
- **La tête n'est pas linéaire, l'expression l'est presque.** D'où la structure de Live2D : la tête est un
  paramètre 2D (lacet × tangage) à formes clés interpolées. Les expressions sont des **formes additives** (« Blend
  Shape » de Cubism 5), appliquées **dans le repère du visage**, donc composées avant la lecture du champ de tête.
- Le **pas 16 px** (sur une image de visage de 512) suffit pour les plans moyens. En très gros plan, où le visage
  dépasse 900 px à l'écran, on passe au **pas 8–12**. C'est encore moins de 5 000 sommets pour une tête.

### Gaps
- Le prototype est en numpy/OpenCV. Le rendu PixiJS (tampon d'UV dynamique) et le raccord au cou dans le vrai moteur
  ne sont pas mesurés.
- On n'a pas encore extrait de formes clés pour le roulis : il reste une rotation 2D de l'os de tête, ce qui suffit,
  ni pour les paliers de lèvres 0,4 / 0,8.
- Pas de test sur un personnage dont LivePortrait détecte mal le visage (masque, très grande stylisation).

---

## Q3. Variantes : animaux, ports ONNX/TensorRT, remplacement d'InsightFace — que garder ?

### Takeaway
Rien à télécharger de plus pour la troupe, qui est humaine. Le mode « animaux » n'a ni stitching ni rétro-ciblage, et
il dépend de X-Pose (non commercial) pour la détection. FasterLivePortrait n'apporte rien sur CPU. La seule leçon
utile de l'écosystème : **remplacer InsightFace par MediaPipe ou par nos ancrages**, ce que nous faisons déjà.

### Cited Findings
- **Mode animaux** : « fine-tuned on approximately 230K frames of various animals (mostly cats and dogs) ».
  - « we have not trained the stitching and retargeting modules for the animals model […] we recommend disabling
    stitching […] `paste-back` is also not recommended ».
  - « X-Pose is only for Non-commercial Scientific Research Purposes, you should remove and replace it with other
    detectors if you use it for commercial purposes ».
  - Version v1.1 du 1er janvier 2025, avec plus de données (chiens) —
    [changelog 2024-08-02](https://github.com/KwaiVGI/LivePortrait/blob/main/assets/docs/changelog/2024-08-02.md),
    [2025-01-01](https://github.com/KwaiVGI/LivePortrait/blob/main/assets/docs/changelog/2025-01-01.md).
  - Poids animaux sur la même fiche HF MIT, 520 Mo, plus `xpose.pth` de 435 Mo —
    [HF KlingTeam/LivePortrait](https://huggingface.co/KlingTeam/LivePortrait).
- **X-Pose** : « License for Non-commercial Scientific Research Purposes […] Any other use, in particular any use for
  commercial […] purposes is prohibited » — [LICENSE.txt](https://github.com/IDEA-Research/X-Pose/blob/master/LICENSE.txt).
- **FasterLivePortrait** : code MIT. Le LICENSE ajoute une « ADDITIONAL NOTICE FOR MODELS […] subject to their
  respective licenses ». Le 7 août 2024 il a ajouté « animal models and MediaPipe models, so you no longer need to
  worry about copyright issues » (`--mp`). On y trouve aussi un greffon `grid_sample_3d` pour TensorRT, et ONNX GPU
  seulement depuis une branche compilée —
  [README](https://github.com/warmshao/FasterLivePortrait), [LICENSE](https://github.com/warmshao/FasterLivePortrait/blob/master/LICENSE).
- **ComfyUI-LivePortraitKJ** « now includes MediaPipe as an alternative to InsightFace, ensuring the license remains
  under MIT and Apache 2.0 » — [changelog 2024-08-02](https://github.com/KwaiVGI/LivePortrait/blob/main/assets/docs/changelog/2024-08-02.md).
- **« expression-friendly »** : option de conduite ajoutée pour « reduce head wobbling », réglée par défaut, avec un
  `driving_multiplier` — même changelog.

### Inferences
- Si un jour un personnage animal entre dans la troupe, le mode animaux s'utilisera **sans X-Pose** : recadrage par
  nos ancrages, stitching coupé. La formule de stitching relatif ne s'applique pas, puisque le module S n'existe pas
  pour ce mode.
- L'export ONNX de FasterLivePortrait (W et SPADE fusionnés) ne sert que sur GPU. Sur CPU, PyTorch en bf16 avec AMX
  fait mieux.

### Gaps
- Le mode animaux n'a pas été téléchargé ni mesuré : la troupe n'en a pas besoin.

---

## Q4. Audio → mouvement du visage : SadTalker, EchoMimic v1–v3, Ditto, JoyVASA, KDTalker, FLOAT

### Takeaway
Aucun de ces systèmes ne doit remplacer notre chaîne phonèmes → visèmes, qui est exacte quand la voix vient de
notre synthèse (note 04). Il y a deux raisons. Ils sont **GPU seulement** (EchoMimic), ou **bloqués par la licence**
(Ditto sans licence de poids, SadTalker avec BFM et Wav2Lip, KDTalker et FLOAT en CC-BY-NC). Et ils sont
**stochastiques** par fenêtres. **JoyVASA** est l'exception propre (code MIT, poids MIT, encodeur audio MIT). Il
génère tête et expressions **dans l'espace de mouvement de LivePortrait**, donc directement projetables sur nos formes
clés : une piste « plus tard » pour la micro-gestuelle de tête.

Les concepts à prendre tout de suite : les groupes de points yeux et lèvres, la **compensation du regard** pendant la
rotation de tête (Ditto), le **mélange VAD** des lèvres, la génération par **fenêtres avec recouvrement et fondu**, et
le clignement découplé de l'audio.

### Cited Findings
- **SadTalker** : « The license has been updated to Apache 2.0, and we've removed the non-commercial restriction » —
  [README](https://github.com/OpenTalker/SadTalker), [LICENSE](https://github.com/OpenTalker/SadTalker/blob/main/LICENSE).
  - Les poids (fiche HF `mit`) embarquent `BFM_Fitting/01_MorphableModel.mat` (Basel Face Model), `wav2lip.pth` et
    `facevid2vid_00189-model.pth.tar` (2,1 Go) — [HF vinthony/SadTalker](https://huggingface.co/vinthony/SadTalker).
    BFM et Wav2Lip ont leurs propres licences, de recherche ou non commerciales **à notre connaissance** (non revérifié
    ici) : **concepts seulement**.
  - **ExpNet** : 64 coefficients 3DMM par fenêtre de 10 trames mel, conditionnés par l'expression de référence
    (`ref`) **et un ratio de clignement explicite** (`ratio_gt`) —
    [audio2exp_models/networks.py](https://github.com/OpenTalker/SadTalker/blob/main/src/audio2exp_models/networks.py),
    [audio2exp.py](https://github.com/OpenTalker/SadTalker/blob/main/src/audio2exp_models/audio2exp.py).
  - **PoseVAE** : CVAE sur fenêtres de 32 images, `NUM_CLASSES: 46` (styles de locuteurs), latent de 64 ou 256. Il
    prédit un mouvement de pose (6 valeurs) **résiduel par rapport à la première image**, avec z tiré au hasard —
    [audio2pose_models/](https://github.com/OpenTalker/SadTalker/tree/main/src/audio2pose_models), `src/config/*.yaml`.
- **EchoMimic v1, v2, v3** : code Apache-2.0 —
  [v1](https://github.com/antgroup/echomimic), [v2](https://github.com/antgroup/echomimic_v2),
  [v3](https://github.com/antgroup/echomimic_v3).
  - v1 : conditionnement par repères éditables (« Editable Landmark Conditioning »). Version accélérée « from
    ~7mins/240frames to ~50s/240frames on V100 GPU ».
  - v2 : « ~50s/120frames on A100 ».
  - v3 : base Wan2.1-Fun 1.3B, « 12G VRAM », « 5 steps for talking head ».
  - GPU testés : A100, RTX 4090D, V100.
  - Fiches HF : pas de licence pour EchoMimic et EchoMimicV2 (34 Go et 11 Go de poids), `apache-2.0` pour
    EchoMimicV3 — [HF BadToBest](https://huggingface.co/BadToBest).
  - **Infaisable sur notre CPU** : il faudrait de l'ordre de la minute par image, au mieux.
- **Ditto** (Ant Group, ACM MM 2025) : code Apache-2.0 —
  [LICENSE](https://github.com/antgroup/ditto-talkinghead/blob/main/LICENSE).
  - **La fiche HF ne déclare aucune licence** pour les poids (6,9 Go, dont `hubert` de 1,46 Go) —
    [HF digital-avatar/ditto-talkinghead](https://huggingface.co/digital-avatar/ditto-talkinghead).
  - Le pipeline charge `insightface_det` et `landmark106`, des modèles InsightFace —
    `core/atomic_components/source2info.py`.
  - **Espace de mouvement = celui de LivePortrait** : vecteur de 265 valeurs = échelle 1 + tangage, lacet et roulis
    en 3×66 classes + t 3 + exp 63 — `audio2motion.py`.
  - Diffusion LMDM sur **fenêtres de 80 images**, conditionnée par HuBERT (1 024 dimensions) et par l'émotion
    (8 classes : Angry, Disgust, Fear, Happy, Neutral, Sad, Surprise, Contempt), l'ouverture des yeux et la position
    des globes oculaires.
  - Fenêtres raccordées par un **recouvrement de 10 images avec fondu linéaire** ; lissage par moyenne glissante
    (k = 3) sur les dimensions de pose ; 50 pas d'échantillonnage par défaut —
    `audio2motion.py`, `condition_handler.py`.
  - Contrôles : `_fix_gaze` **compense le regard quand la tête tourne** (`dx = Δlacet·0,26`, `dy = Δtangage·0,28`,
    en unités du curseur de regard de LivePortrait).
  - Clignements imposés : `blink_n = 15` images, intervalles tirés entre 60 et 100 images.
  - `ctrl_vad` ramène les points-clés des lèvres vers la source quand la voix se tait ; `fade` assure le retour au
    repos.
  - Mêmes listes lèvres et yeux que LivePortrait — `core/atomic_components/motion_stitch.py`.
- **JoyVASA** (JD Health) : code MIT, « Copyright (c) 2024 xuyangcao » —
  [LICENSE](https://github.com/jdh-algo/JoyVASA/blob/main/LICENSE). Poids : fiche HF `license: mit`,
  `motion_generator_hubert_chinese.pt` de 414 Mo — [HF jdh-algo/JoyVASA](https://huggingface.co/jdh-algo/JoyVASA).
  - Encodeur `TencentGameMate/chinese-hubert-base` : `license: mit` (fiche HF).
  - « decoupled facial representation […] a diffusion transformer is trained to generate motion sequences directly
    from audio cues, independent of character identity » — ce qui permet aussi les visages d'animaux.
  - Entraîné sur des données chinoises privées et anglaises publiques — README HF.
  - Code : `motion_feat_dim = 76`, fenêtre de 100 images à 25 i/s, plus 10 images précédentes, `n_diff_steps = 500`,
    `cfg_scale = 2.8` par défaut, `animation_mode = "animal"` par défaut —
    `src/modules/dit_talking_head.py`, `src/config/argument_config.py`.
  - Le rendu passe par LivePortrait. **Le mode animal passe par X-Pose (non commercial) : à remplacer.**
- **KDTalker** : diffusion spatio-temporelle sur les points-clés implicites de LivePortrait. « Our code is under the
  CC-BY-NC 4.0 license » — [README](https://github.com/chaolongy/KDTalker).
- **FLOAT** (ICCV 2025) : « flow matching » dans un « learned orthogonal motion latent space », avec renforcement
  d'émotion par la parole. Licence CC BY-NC 4.0 —
  [README et LICENSE.md](https://github.com/deepbrainai-research/float).

### Inferences
- **Notre force reste la voix synthétique avec durées de phonèmes** : les lèvres sont exactes par construction. Les
  réseaux audio → visage visent les voix enregistrées et inconnues. Pour la troupe, ils n'apporteraient que la
  **micro-gestuelle de tête et de sourcils** naturelle, ce que notre couche prosodie → tête fait déjà en règles
  (note 03).
- **JoyVASA est le seul à évaluer plus tard**, pour trois raisons :
  - licence propre de bout en bout, sans InsightFace si l'on recadre nous-mêmes ;
  - sortie **dans l'espace de LivePortrait** : tangage, lacet et roulis en degrés vont sur notre grille de tête, et
    `Δexp` (63 valeurs) se projette par moindres carrés sur les directions `e_k` de nos expressions (voir G4) ;
  - transformeur de dimension 512 : sur CPU, l'ordre de grandeur est la dizaine de secondes par fenêtre de 4 s
    (estimation non mesurée).

  Il faut une **graine fixée** et une piste **cuite une fois** pour garder `evaluer(t)` pur.
- **À prendre dès maintenant, sans réseau** :
  - la **compensation du regard** de Ditto : quand la tête tourne, l'iris contre-tourne d'une fraction du lacet ;
  - le **clignement découplé** de l'audio (ExpNet et Ditto le traitent comme une entrée à part ; c'est déjà notre
    choix) ;
  - le **fondu de fenêtres** à recouvrement de 10 images, pour toute piste générée par morceaux ;
  - le **style de tête par personnage** : les 46 classes de PoseVAE deviennent nos paramètres d'amplitude, de
    fréquence et de tendance au hochement par membre de la troupe.

### Gaps
- JoyVASA n'a pas été mesuré : 414 Mo de poids plus l'encodeur, hors budget disque de cette piste. Sa tenue sur du
  français n'est pas connue.
- La licence exacte de BFM et de Wav2Lip n'a pas été revérifiée : de toute façon, ces poids ne sont pas retenus.

---

## Q5. Rigs paramétriques : Live2D (paramètres, formes clés, Blend Shapes), Inochi2D (code BSD), THA3/THA4 (45 paramètres, élève distillé)

### Takeaway
Les trois systèmes convergent sur une même architecture, que nos mesures de Q2 confirment :
- des **paramètres nommés et bornés** ;
- des **formes clés** sur une grille pour les paramètres non linéaires (tête) ;
- des **formes additives** pour les expressions ;
- une **hiérarchie parent → enfant** (composition) ;
- l'interpolation **linéaire ou cubique**.

THA4 ajoute l'idée qui manque pour l'apparence : la sortie vaut `(1−α)·warp(image) + α·couleur`. Le warp fait la
géométrie ; une couleur générée, masquée par α, couvre seulement ce que le warp ne peut pas inventer.

### Cited Findings
- **Live2D, paramètres standard** (min / défaut / max) :
  - `ParamAngleX` −30 / 0 / 30 (« Turn to the right of the screen when + », à élargir à ±45) ; `ParamAngleY` et
    `ParamAngleZ` ±30 ;
  - `ParamEyeLOpen` et `ParamEyeROpen` 0 / 1 / 1 (« To close tightly, set the minimum value to −0.5 ») ;
  - `ParamEyeLSmile` 0 à 1, `ParamEyeBallX` et `ParamEyeBallY` ±1, `ParamEyeBallForm` ±1 ;
  - `ParamBrowLY`, `ParamBrowLX`, `ParamBrowLAngle` et `ParamBrowLForm` ±1 ;
  - `ParamMouthForm` ±1 (« smiling mouth when +. angry mouth when − ») ; `ParamMouthOpenY` 0 à 1 ; `ParamCheek` ;
  - `ParamBodyAngleX`, `ParamBodyAngleY` et `ParamBodyAngleZ` ±10 ; `ParamBreath` ;
  - `ParamHairFront`, `ParamHairSide` et `ParamHairBack`, « Usually set by physics » —
  [Standard Parameter List](https://docs.live2d.com/en/cubism-editor-manual/standard-parametor-list/).
- **Live2D, Blend Shape (Cubism 5)** : des clés « Blend Shape » **s'ajoutent** aux formes clés normales. Combiner
  deux Blend Shapes à 1,0 peut donner une forme involontaire, que corrige un réglage « Limit Settings for Blend Shape
  Weights » — [Blend Shape](https://docs.live2d.com/en/cubism-editor-manual/blend-shape/).
- **Live2D, déformeurs** : déformeur de distorsion (« warp ») et déformeur de rotation. L'interpolation linéaire d'une
  grande rotation « will create a shrunken shape » ; il faut alors un déformeur de rotation —
  [About Deformers](https://docs.live2d.com/en/cubism-editor-manual/deformer/).
  Le Cubism SDK est propriétaire : **concepts seulement**.
- **Inochi2D** (BSD-2-Clause) :
  - Dans la v0.8.7, `binding.d` interpole les valeurs de liaison en modes `Nearest`, `Linear` (bilinéaire entre
    4 clés) et `Cubic`. Le cubique fait 4 interpolations cubiques sur les rangées voisines, puis une sur la colonne
    (voisinage 4×4, indices bornés aux bords).
  - `reInterpolate()` **remplit les clés non définies** en interpolant linéairement le long d'un axe, puis de
    l'autre —
    [binding.d v0.8.7](https://github.com/Inochi2D/inochi2d/blob/v0.8.7/source/inochi2d/core/param/binding.d).
  - Sur `main` (commit `4975d24`, 3 octobre 2026), la liaison de déformation est **commentée** : réécriture en cours —
    `source/inochi2d/param/bindings/deform.d`. Les paramètres 2D portent `hpoints` et `vpoints`, les positions des
    clés sur chaque axe — `param/parameters/param2d.d`.
- **THA3 et THA4** (Pramook Khungurn, pixiv) : code MIT. « The THA4 models and the images under the `data/images`
  directory are released under the Creative Commons Attribution-NonCommercial 4.0 International » —
  [README THA4](https://github.com/pkhungurn/talking-head-anime-4-demo).
  - Les **45 paramètres** :
    - sourcils `troubled`, `angry`, `lowered`, `raised`, `happy`, `serious`, chacun à gauche et à droite ;
    - yeux `wink`, `happy_wink`, `surprised`, `relaxed`, `unimpressed`, `raised_lower_eyelid`, à gauche et à droite ;
    - `iris_small` ;
    - bouche `aaa`, `iii`, `uuu`, `eee`, `ooo`, `delta`, `lowered_corner`, `raised_corner`, `smirk` ;
    - `iris_rotation_x` et `iris_rotation_y` ;
    - `head_x`, `head_y`, `neck_z`, `body_y`, `body_z`, `breathing` —
    `src/tha4/poser/modes/pose_parameters.py`.
  - **Élève** : « a small (< 2MB) and fast machine learning model that knows how to animate that particular image ».
    Il est entraîné en « about 30 hours on a computer with an Nvidia RTX A6000 GPU ».
  - Sa sortie : `warped_image = apply(grid_change, image)` puis
    `blended_image = (1 − alpha) * warped_image + alpha * color_change`. C'est un SIREN conditionné par la pose et
    la position — `src/tha4/nn/siren/morpher/siren_morpher_03.py`, `siren/face_morpher/siren_face_morpher_00.py`.

### Inferences
- **Vocabulaire** : nos paramètres actuels (`EtatVisage`) couvrent ouverture, largeur, arrondi, dents, langue,
  sourire, paupières, écarquillement, regard et sourcils. Il leur manque **la tête en 2,5D** (lacet, tangage), le
  **sourire des yeux** (`EyeSmile`, `happy_wink`), la **paupière basse relevée**, et la **forme du sourcil**
  (`BrowForm` / `troubled` / `serious`).
  - Les voyelles de THA (`aaa`, `iii`, `uuu`, `eee`, `ooo`) valident notre approche par visèmes plutôt que par la
    seule ouverture.
- **Interpolation** : la grille de tête 5×3 se lit en **cubique façon Inochi2D**. Nos mesures montrent que la
  tête n'est pas linéaire (9 px d'écart entre 0 et 20°). Les expressions sont des **Blend Shapes** additives avec
  **limites de poids** (somme bornée par région), parce que deux formes à 1,0 se cumulent mal.
- **Hiérarchie** : la tête est le parent, l'expression l'enfant. C'est la composition mesurée en Q2 (erreur divisée
  par deux). Le roulis reste un **déformeur de rotation** (notre os de tête), jamais une forme clé linéaire, à cause
  du « shrunken shape ».
- **THA4 est la preuve de concept de notre agrégat** : un « élève » par personnage qui sépare **géométrie (warp)** et
  **couleur (α)**. Nos formes clés tirées de LivePortrait jouent le rôle de `grid_change`. Les incrustations SPADE
  générées une fois jouent celui de `color_change` et `alpha`. On n'entraîne rien.

### Gaps
- Le code des modèles THA4 n'a pas été exécuté : licence NC, GPU.
- Live2D n'a été lu que dans sa documentation publique.

---

## Q6. Rotation de tête 2,5D depuis une seule image : plan, ellipsoïde, profondeur Depth Anything V2 Small, champ LivePortrait

### Takeaway
Pour le **lacet**, le champ appris de LivePortrait est nettement meilleur que les modèles analytiques. Les deux modèles
à relief tournent bien le visage, mais **déchirent l'oreille et le contour**, et la profondeur ajoute un liseré au
bord de la silhouette. Pour le **tangage**, la profondeur de DAv2 suit bien LivePortrait (corrélation 0,87).
L'ellipsoïde prévu en G7 (note 01) est donc **remplacé** par les formes clés de LivePortrait. La profondeur reste
un **secours**, pour un personnage que LivePortrait comprendrait mal.

### Cited Findings
- **Depth Anything V2 Small** : `license: apache-2.0` (ONNX `onnx-community/depth-anything-v2-small`, `model.onnx`
  99,1 Mo, sha256 `afb6a5c2…`) — [HF](https://huggingface.co/onnx-community/depth-anything-v2-small).
  Les tailles Base, Large et Giant sont CC-BY-NC-4.0 (note 05).
- **[mesure]** `tete25d.py` sur le recadrage de face de MODOU (512 px, rotation dans la tête avec extinction dans le
  cou entre y = 410 et y = 478) :
  - DAv2 Small en 518×518 : **1,13 s** (onnxruntime, 2 threads) ;
  - modèles comparés au champ LivePortrait :
    - lacet +20° : amplitude p95 de LivePortrait 50,1 px ;
    - tangage +10° : amplitude p95 de 26,1 px ;
    - erreur moyenne en px, et corrélation de la partie non uniforme (relief) :

| Modèle | lacet : erreur / corrélation | tangage : erreur / corrélation |
|---|---|---|
| plan (aplatissement cos θ) | 35,3 px / −0,60 | 20,2 px / −0,23 |
| ellipsoïde (z = 0,8·Rx·√(1−u²−v²)) | 35,2 px / 0,28 | 19,8 px / 0,46 |
| profondeur DAv2 (relief 0,9·Rx) | 36,2 px / 0,21 | 20,2 px / **0,87** |

  - L'erreur absolue est dominée par la **translation d'ensemble** que fait LivePortrait : la tête pivote autour
    d'un axe situé derrière le visage, alors que nos modèles tournent autour du centre de la tête.
  - Visuel (`tete25d_front/tete25d_lacet.png`) :
    - ellipsoïde et DAv2 : l'oreille du côté qui s'éloigne **se détache**, le cou est cisaillé ;
    - DAv2 : un liseré apparaît au bord du crâne, là où la profondeur saute sur la silhouette ;
    - LivePortrait : rotation cohérente des cheveux, des oreilles et du nez, et le cou reste en place.

### Inferences
- Un modèle analytique de tête unique ne sait pas où sont les **parties détachées** (oreilles, cheveux, chapeau). La
  profondeur monoculaire saute au bord de la silhouette. LivePortrait, entraîné sur des têtes, a appris ces
  comportements. C'est la même raison qui rend ses formes clés supérieures au G7 de la note 01.
- Si l'on garde la profondeur en secours, il faut deux corrections :
  - lisser z près du contour (érosion de l'alpha, puis diffusion de z vers l'extérieur) ;
  - traiter les oreilles comme des calques à part, avec leur propre profondeur.
- **Pivot** : nos rotations analytiques doivent pivoter autour d'un axe **derrière** le visage, comme le cou réel,
  pas autour du centre de l'image. La translation latérale observée chez LivePortrait (environ 30 px pour 20° sur
  512) est le geste naturel.

### Gaps
- Une seule vue (face) a été comparée. L'asymétrie des vues de 3/4 (côté caché) n'a pas été mesurée finement.
- La profondeur des personnages n'a pas été comparée à celle des décors (même producteur DAv2, note 05).

---

## Ce que nous greffons dans notre moteur

Principe inchangé : **rien n'est régénéré au rendu**.
- On déplace les pixels du dessin à travers des champs **précalculés une fois**.
- Les seuls pixels nouveaux sont des **incrustations générées une fois par personnage et par état** (bouche ouverte,
  paupières fermées). On les contrôle par une porte d'identité, puis on les fige.
- `evaluer(t)` reste une fonction pure.

### G1. Outil hors moteur `outils/visage-lp/extraire_cles.py` — les formes clés tirées de LivePortrait

- **Entrées** : la texture du personnage, les ancrages du rig (yeux, bouche, menton), les poids LivePortrait MIT
  (F, M, W, S ; pas d'InsightFace, pas de `landmark.onnx`).
- **Recadrage** : un carré centré entre les yeux et la bouche, de côté **2,3 × la taille du visage**, décalé vers le
  haut de 0,125, comme `crop_cfg`. L'outil refuse un cadre qui sort de la texture du côté du visage.
- **Calcul** : bf16 (AMX), 2 threads.
  ```
  x_s = s·(x_c R_s + δ_s) + t ; pour chaque clé k : x_d,k = s·(x_c R_k + δ_s + Δδ_k) + t (+ Δlèvres/yeux par les MLP)
  stitching RELATIF : x_d,k ← x_d,k + S(x_s, x_d,k) − S(x_s, x_s)
  champ_k = Σ_d w_d·deformation_k[d,…,:2] / Σ_d w_d,  w_d = ‖grid_sample(f_s, deformation_k)[:,d]‖
  b_k = champ_k − champ_repos            (carte ARRIÈRE 64×64×2, unités [−1,1] de l'image 512)
  ```
- **Clés** :
  - tête : **5 lacets {−20, −10, 0, +10, +20} × 3 tangages {−10, 0, +10}** ;
  - expressions (commandes de `gradio_pipeline.py`) : ouverture, lèvres 0,4 et 0,8 (rétro-ciblage), sourire,
    étirement, arrondi, pincement, sourcils hauts et froncés, regard ±x et ±y, yeux fermés ;
  - pour un dessin de 3/4, le lacet **vers le côté caché est limité à 10°** : le warp étire et SPADE barbouille.
- **Sortie** : `sorties/cache/personnages/<id>/visage_lp.json` + `visage_lp.bin`, environ 450 Ko par personnage,
  soit 25 Mo pour 54 personnages.
  ```json
  {
    "format": "cles-lp/1",
    "source": { "texture": "modou.texture.png", "sha256": "…", "cadre": { "cx": 240, "cy": 150, "cote": 300 } },
    "lp": { "commit": "9b294b3", "poids_sha256": { "W": "2f61a6f2…", "…": "…" }, "precision": "bf16", "stitching": "relatif" },
    "grille": 64,
    "tete": { "lacet": [-20, -10, 0, 10, 20], "tangage": [-10, 0, 10], "pivot_px": [0, 0] },
    "expressions": ["ouverture", "levres_0.4", "levres_0.8", "sourire", "etire", "arrondi", "pince",
                    "sourcils_haut", "sourcils_fronces", "regard_x+", "regard_x-", "regard_y+", "regard_y-", "yeux_0"],
    "binaire": { "type": "float16", "ordre": "tete[i_tangage][i_lacet] puis expressions", "taille_cle": [64, 64, 2] }
  }
  ```
- **Coût** [mesure] : 62 s par personnage pour 27 clés, soit environ 1 h pour la troupe, une seule fois.
- **Licence** : ajouter LivePortrait (MIT) à `THIRD_PARTY_NOTICES.md`. Les **champs** sont des données dérivées de
  nos dessins.

### G2. `src/visage/clesLP.ts` — évaluation pure des champs (TypeScript)

```ts
export interface ClesVisage {
  grille: 64;
  cadre: { cx: number; cy: number; cote: number };   // texture px ↔ image 512 du professeur
  lacets: readonly number[]; tangages: readonly number[];
  tete: Float32Array[][];                            // [iTangage][iLacet] → 64·64·2 (arrière)
  expr: Readonly<Record<NomCleExpr, Float32Array>>;  // formes additives
}
/** Champ de tête : Catmull-Rom 2D sur la grille (mode « Cubic » d'Inochi2D), bornes aux bords. */
export function champTete(c: ClesVisage, lacet: number, tangage: number, out: Float32Array): void;
/** Formes additives (Blend Shapes) avec limite de poids par région (lèvres, yeux, sourcils). */
export function champExpression(c: ClesVisage, poids: PoidsExpr, out: Float32Array): void;
/** UV d'un sommet de grille q (repère du visage, px 512) : q' = q + bTête(q) ; uv = q' + bExpr(q'). */
export function uvVisage(c: ClesVisage, tete: Float32Array, expr: Float32Array, q: Vec2): Vec2;
```
- **Composition parent → enfant**, mesurée : erreur moyenne de 1,5 à 1,8 px dans la bouche, contre 3,1 à 3,5 px en
  addition.
- Échantillonnage bilinéaire des grilles 64×64.
- Coût : environ 1 100 à 4 200 sommets × (4×4 clés de tête + 3 à 6 expressions actives), soit environ 0,1 ms en JS.
- **Pureté** : aucune intégration ni état, donc le test de « scrub » à 0 px est trivialement satisfait.

### G3. Rendu : la tête devient une **grille à UV animées** (`rendu/visage.ts`, `rendu/personnageRendu.ts`)

- **Grille régulière** dans le repère de l'os `tete` (pas 16 px sur l'image 512 du professeur ; pas 8 à 12 en très
  gros plan). Elle couvre la boîte de la tête plus une marge pour la silhouette qui tourne.
  - **Positions fixes**, transformées par l'os de tête (translation, **roulis**, échelle et squash, déjà dans
    `anim/`).
  - **UV recalculées à chaque image** par `uvVisage`. L'alpha suit, puisqu'il est lu à travers les UV.
- **Raccord au cou** : le corps garde son maillage et son skinning. La grille de tête se fond sur une bande de 10 à
  20 px sous le menton, par un masque en dégradé (le `paste_back` de LivePortrait :
  `masque·tête + (1−masque)·corps`). Les champs de LivePortrait sont déjà quasi nuls aux épaules (stitching), et
  l'on force `b = 0` sur la dernière rangée de la grille.
- **Ne jamais inverser** les champs pour déplacer des sommets : divergence mesurée en lacet (p99 de 36 px,
  oreille arrachée).
- Les incrustations actuelles (bandes de lèvres, intérieur de bouche, paupières) **migrent en espace texture** (G4)
  et passent par les mêmes UV. Plus besoin de connaître la position déformée de chaque ancrage.
- **Voie A, code pur** (`champVisage` actuel) : elle reste le **secours** pour un personnage dont les formes clés
  échouent à la porte G6.

### G4. Incrustations générées une fois (`PatchesLP`) : bouche ouverte et paupières fermées, à la THA4

- **Hors moteur** (même outil que G1, avec le décodeur G en bf16, 2 à 5 s par rendu) :
  - rendus SPADE de quelques états : lèvres 0,4 et 0,8 ; « O » (arrondi + 0,5) ; « I/E » (étirement + 0,3) ;
    yeux fermés ; clin gauche et clin droit ;
  - environ 7 rendus, soit 15 à 35 s par personnage.
- **Extraction** :
  - On ramène chaque rendu en **espace texture** en lui appliquant l'inverse de sa propre carte. Dans les zones de
    la bouche et des yeux, l'inversion converge : résidu p99 de 0,006 px pour les lèvres, 1,5 px pour l'ouverture.
  - On découpe **seulement** l'intérieur des lèvres (masque entre les lignes de lèvres, dilaté de 2 px) et la
    paupière (entre les lignes de cils). Le reste du rendu est jeté : SPADE adoucit tout le visage, et notre dessin
    d'origine reste la référence.
- **Composition au rendu** (shader du maillage de tête, en UV) :
  ```
  couleur(uv) = (1 − α(uv))·texture(uv) + α(uv)·patch_k(uv),   α = masque_k(uv)·w_k(t)
  ```
  `w_k` vient de l'état du visage : paliers d'ouverture pour la bouche, `paupiereG` et `paupiereD` pour les yeux.
  C'est exactement la sortie de l'élève de THA4.
- **Porte d'identité** (règles de la note 07) : ΔE de la peau ≤ 3 sur l'anneau autour du patch ; pas de dents
  au-delà de la ligne des lèvres. Sinon on garde nos calques dessinés actuels.

### G5. `EtatVisage` élargi et pilotage

- **Nouveaux champs** :
  - `lacet` et `tangage` en degrés (±20 / ±10) ;
  - `yeuxRieurs`, `paupiereBasse` et `formeSourcil` (vocabulaire Live2D et THA, voir Q5).
- Le module `anim` (prosodie → tête, note 03) ne pilote plus seulement la rotation 2D : il pilote aussi `lacet` et
  `tangage`, avec ressorts analytiques et plafonds par vue (10° vers le côté caché d'un dessin de 3/4).
- **Compensation du regard** (Ditto) :
  `regard.x −= kx·Δlacet/30`, `regard.y −= ky·Δtangage/30`, avec kx ≈ 0,26 et ky ≈ 0,28 au départ, en unités du
  curseur de LivePortrait, à recalibrer en unités `DEGRES_PAR_UNITE` sur nos dessins. Le personnage garde ainsi le
  contact visuel pendant qu'il tourne la tête.
- **Visèmes → poids** de formes clés :
  - `ouverture` sur les paliers `levres_0.4` et `levres_0.8`, en interpolation linéaire par morceaux comme
    `ParamMouthOpenY` ;
  - `largeur > 0` → `etire` ; `largeur < 0` → `pince` ;
  - `arrondi` → `arrondi` ; `sourire` → `sourire`.

  Les paliers de dents et de langue passent par les incrustations G4. La coarticulation de la note 04 reste
  inchangée en amont.

### G6. Portes qualité des formes clés (`qa/`)

- **Repli** : le jacobien de `q ↦ q + b(q)` doit garder un déterminant positif sur au moins 99 % de la zone du visage,
  pour chaque clé.
- **Amplitude** : pour le lacet ±20, le déplacement p95 doit valoir 0,15 à 0,35 × la largeur du visage. **Sens** :
  le nez doit aller du bon côté.
- **Composition** : écart entre la composition et le rendu LivePortrait d'une combinaison test (lacet +20 avec
  lèvres 0,8) ≤ 2 px en moyenne dans la bouche (mesuré : 1,5 à 1,6 px).
- **Grille** : erreur p99 de la grille face au champ dense ≤ 1,6 px au pas choisi.

### G7. Plus tard

1. **Passe neuronale complète des gros plans** (W+G bf16, 4,3 à 7 s par image) pour les plans « signature », avec
   lissage des points-clés (Kalman de LivePortrait), et seulement si G3 et G4 ne suffisent pas à l'œil.
2. **Jeu capturé sur la vidéo du créateur** : on lance M (0,09 à 0,17 s par image) sur son visage, recadré par
   MediaPipe (Apache-2.0). On obtient tangage, lacet et roulis, plus `Δexp`. On projette `Δexp` sur les directions
   `e_k` de nos expressions par moindres carrés avec rappel vers 0. Les poids et la pose pilotent alors nos formes
   clés, et MODOU joue comme le créateur.
3. **JoyVASA** (MIT) pour une micro-gestuelle de tête générée depuis l'audio : même projection, graine fixée, piste
   cuite une fois.

### Ce que nous NE prenons pas
- InsightFace (non commercial), X-Pose (non commercial).
- Les poids de Ditto (aucune licence déclarée), de THA3/THA4, KDTalker et FLOAT (CC-BY-NC), et de SadTalker (BFM et
  Wav2Lip embarqués).
- EchoMimic v1–v3 : GPU seulement.
- FasterLivePortrait ONNX : aucun gain sur CPU.
- Le stitching **absolu** sur nos dessins, l'inversion des champs pour déplacer les sommets, et l'ellipsoïde G7 de
  la note 01 (remplacé).

---

## Tableau classé

| # | Composant | Gain visible | Coût d'intégration | Licence | Décision |
|---|---|---|---|---|---|
| 1 | **Formes clés de tête LivePortrait** (grille lacet 5 × tangage 3, champ W seul) rendues par **grille à UV animées** (G1–G3) | **Très fort** : vraie rotation 3/4 et hochements sans nouveau dessin, identité exacte (clip propre de −20 à +20°) | 3–4 j (outil Python 1 j, `clesLP.ts` 1 j, maillage de tête et raccord du cou 1–2 j) ; 62 s de CPU par personnage, une fois | Code et poids LivePortrait **MIT**, sans InsightFace | **Agréger maintenant** |
| 2 | **Formes d'expression LivePortrait** additives, composées après la tête (mâchoire, coins, sourcils, regard) | **Fort** : mâchoire et joues cohérentes avec le volume, pas seulement des points déplacés | 1–2 j après le n° 1 (mêmes fichiers) | MIT | **Agréger maintenant** |
| 3 | **Stitching relatif** `S(x_s,x_d) − S(x_s,x_s)` | Évite que le cartoon change d'expression au repos (25,2 → 39,0 dB face, 21,1 → 39,1 dB 3/4) | 1 ligne dans l'outil | Concept (sur MIT) | **Agréger maintenant** |
| 4 | **Incrustations générées une fois** (intérieur de bouche, paupières fermées, au style du dessin), composées `(1−α)·warp + α·patch` (G4) | **Fort en plan rapproché** : dents et langue crédibles, vraies paupières | 2 j + porte d'identité ; 15–35 s de CPU par personnage | MIT (poids G) ; concept THA4 | **Agréger maintenant** (gros plans d'abord) |
| 5 | **Compensation du regard** pendant la rotation (Ditto) + masques de régions lèvres et yeux | Moyen : contact visuel conservé, tête plus vivante | 0,5 j | Concept (Apache-2.0) | **Agréger maintenant** |
| 6 | **Vocabulaire de paramètres Live2D / THA** (EyeSmile, paupière basse, BrowForm, voyelles) + interpolation cubique et remplissage des clés d'Inochi2D | Moyen : plus d'expressions comiques, mélanges propres | 1 j | Concepts ; Inochi2D BSD-2 | **Agréger maintenant** |
| 7 | Passe neuronale complète LivePortrait (W+G) sur les gros plans | Fort mais risqué : texture adoucie, côté caché barbouillé, scintillement | 4,3–7 s par image en bf16 (un plan de 3 s ≈ 6–10 min) + lissage | MIT | **Plus tard** (option de finition) |
| 8 | Jeu capturé : M de LivePortrait sur la vidéo du créateur → poids de nos formes clés | Fort pour l'expressivité « signature » du créateur | 2 j ; 0,1–0,2 s par image | MIT + MediaPipe Apache-2.0 | **Plus tard** |
| 9 | JoyVASA : audio → mouvement dans l'espace de LivePortrait → nos formes clés | Moyen : micro-gestuelle de tête naturelle | 2–3 j + banc (414 Mo + encodeur) | MIT (code, poids, chinese-hubert-base) | **Plus tard** |
| 10 | Rotation de tête par la profondeur (DAv2 Small) ou par l'ellipsoïde | Faible en lacet (oreille et silhouette déchirées), bon en tangage | 1 j | Apache-2.0 (Small seulement) | **Non** (secours seulement, si LivePortrait échoue) |
| 11 | LivePortrait mode animaux | Nul pour la troupe humaine | — | Poids MIT, **X-Pose non commercial** | **Non** |
| 12 | FasterLivePortrait (ONNX, TensorRT) | Aucun sur CPU (« extremely slow ») | — | MIT (modèles : licences propres) | **Non** |
| 13 | Ditto (LMDM) | — | — | Code Apache-2.0, **poids sans licence**, InsightFace | **Non** (concepts seulement) |
| 14 | SadTalker (ExpNet, PoseVAE) | — | — | Code Apache-2.0, poids avec **BFM et Wav2Lip** | **Non** (concepts seulement) |
| 15 | EchoMimic v1–v3 | — | GPU seulement (V100, A100, 12 Go de VRAM et plus) | Code Apache-2.0 ; poids v1/v2 sans licence, v3 Apache-2.0 | **Non** |
| 16 | KDTalker, FLOAT, modèles THA3/THA4 | — | — | **CC-BY-NC 4.0** | **Non** (concepts seulement) |
| 17 | Live2D Cubism SDK | — | — | Propriétaire | **Non** (concepts seulement) |
