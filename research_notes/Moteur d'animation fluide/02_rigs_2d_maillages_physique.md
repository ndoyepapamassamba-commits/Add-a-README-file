# Rigs 2D, maillages, déformation, IK et physique secondaire : ce qu'on apprend (Spine, DragonBones, Rive, Live2D, Moho, Synfig, PixiJS v8, Three.js) et ce qu'on greffe

Piste : `rigs_2d`. Rédigé le 16/10/2026. Complète la note `01_moteurs_image_vers_animation.md` (même dossier), qui
traite l'ARAP d'Igarashi, la TPS, le visage et l'ordre de rendu par profondeur. Cette note ne répète pas ces points :
elle couvre les **runtimes de rig 2D**, le **skinning** (poids, mélange des transformations), la **génération de maillage
depuis un masque**, l'**IK**, la **physique secondaire**, le **squash & stretch** et le **rendu PixiJS v8**. Elle se
termine par les structures de données du `CharacterRigAdapter`.

Code lu (jamais exécuté, jamais copié) dans des clones superficiels :
`/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/sources/rigs2d/`.

| Dépôt | Commit lu | Date | Licence (fichier LICENSE lu) |
|---|---|---|---|
| DragonBones/DragonBonesJS (v5.7.0, adaptateur `Pixi/8.x` v6.0.2) | `64b6c69ae35777c2404be68c9192e2c56906079e` | 24/05/2025 | MIT |
| rive-app/rive-runtime (C++) | `5e3de3857d6ae9e019f94da507f6385b96fbf3c3` | 16/10/2026 | MIT |
| pixijs/pixijs (v8.22.0) | `65552017d23255c1442a7d4ac7f0d49e3225fb1d` | 10/10/2026 | MIT |
| mapbox/earcut (v3.2.4) | `765470e73adfdfe5cd0dfc1c1a398f558cdea3a0` | 14/10/2026 | ISC |
| r3mi/poly2tri.js (v1.5.0) | `cb6b2220c70305c6b8c6483f2b1a2ad72616d070` | 17/04/2017 | BSD-3-Clause |
| mikolalysenko/cdt2d (v1.0.0) | `a2aba65b89f048890e8c9c78f40ea403497262d7` | 28/06/2015 | MIT |
| mrdoob/three.js (branche `dev`, 4 fichiers de skinning) | lus le 16/10/2026 | — | MIT (dépôt) |

Articles lus en texte intégral (PDF extraits localement) : Igarashi & Igarashi 2009 (implémentation ARAP), Matsuda, Kaji &
Ochiai 2016 (nombres duaux complexes anti-commutatifs), Le & Hodgins 2016 (centres de rotation optimisés).

Bancs écrits pour cette note, **avec notre propre code** (formules publiées, aucune ligne tierce), dans
`/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/bench_rig2d/` :
`bench_rig2d.mjs` (Node 22, un fil), `page.html` + `run_browser.mjs` (Chromium headless de Playwright 1.56, PixiJS 8.22.0
installé par npm dans ce dossier de travail uniquement), sorties dans `bench_rig2d.out.txt`. Le personnage du banc est une
silhouette synthétique en boubou de 600×1100 px, avec 19 os : bras légèrement écartés, avant-bras à environ 12–25 px du
torse, aisselle fusionnée au torse.

---

## Q1 — Que font les runtimes de rig 2D (Spine, DragonBones, Rive, Live2D, Moho, Synfig) ? Modèle de données, ordre d'évaluation, mélange, ordre de dessin, licences

### Takeaway
Les runtimes « cut-out » (Spine, DragonBones, Rive) partagent un même modèle :
- une hiérarchie d'os 2D affines ;
- des emplacements (slots) attachés aux os, portant une image rigide ou un **maillage pondéré** (jusqu'à 4 os par sommet
  chez Rive) ;
- des contraintes évaluées après la cinématique directe : IK à 1 ou 2 os, transformation, chemin, et physique chez Spine ;
- des pistes de **décalages de sommets** (FFD / deform) et une piste d'**ordre de dessin**.

Live2D remplace les os par des **déformateurs** imbriqués (grille « warp » et rotation) pilotés par des **paramètres à
formes clés**. Moho ajoute des **actions correctives pilotées par l'angle d'un os** (smart bones).

Licences :
- **DragonBones et le runtime Rive sont MIT** : on peut les lire et s'en inspirer.
- **Le runtime Spine exige une licence d'éditeur Spine par utilisateur**, et le SDK Live2D est propriétaire. Nous n'en
  prenons que les concepts documentés.

### Cited Findings
**DragonBones (MIT)**
- Licence : « The MIT License (MIT) Copyright (c) 2012-2025 The DragonBones team and other contributors » —
  [LICENSE](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/LICENSE).
- **IK à deux os** (`IKConstraint._computeB`). La position du coude est l'intersection de deux cercles :
  `h = (lPP − lLL + lTT)/(2·lTT)` et `r = √(lPP − h²·lTT)/lT`. Le côté du pli est choisi par `bendPositive`, corrigé si le
  repère du grand-parent est en miroir (déterminant < 0). Hors de portée, la chaîne s'aligne sur la cible. Le résultat
  est mélangé à la FK par `weight` sur l'angle normalisé —
  [Constraint.ts](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/DragonBones/src/dragonBones/armature/Constraint.ts).
- **Maillage pondéré** (adaptateur PixiJS 8). Pour chaque sommet, le runtime lit `boneCount`, puis pour chaque influence :
  l'indice d'os, le poids et la **position du sommet dans le repère local de cet os** (`xL, yL`), plus un éventuel
  décalage FFD propre à cette influence. Il calcule `xG += (a·xL + c·yL + tx)·w`, puis écrit directement dans
  `PIXI.MeshSimple.vertices`. C'est un **LBS sur CPU**, à nombre d'influences variable —
  [PixiSlot.ts](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/Pixi/8.x/src/dragonBones/pixi/PixiSlot.ts).
- **Surface** : un os spécial, grille de `segmentX × segmentY` sommets. Un point enfant cherche sa cellule et son
  triangle (`isDown`), puis reçoit la transformation affine de ce triangle (rotation, cisaillement, échelles). C'est un
  **déformateur de grille affine par morceaux**, l'équivalent d'un « warp » Live2D sans courbes de Bézier —
  [Surface.ts](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/DragonBones/src/dragonBones/armature/Surface.ts).
- **Mélange par couches**. La documentation du code dit : « High layer animation state will get the blend weight
  first ». `BlendState.update` tient, par cible (transformation d'os, alpha, surface, déformation, alpha et z-index de
  slot), un **poids restant** `leftWeight`. Chaque couche plus basse ne reçoit que `poids × leftWeight`, puis
  `leftWeight −= layerWeight`. Les fondus sont **linéaires** : `_fadeProgress = fadeTime / fadeTotalTime`. Il existe un
  mode `additive` —
  [AnimationState.ts](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/DragonBones/src/dragonBones/animation/AnimationState.ts).
- **Ordre de dessin animable** : cible de mélange `SLOT_Z_INDEX` (même fichier).

**Rive (MIT)**
- Licence : « MIT License Copyright (c) 2020 Rive » —
  [LICENSE](https://github.com/rive-app/rive-runtime/blob/5e3de3857d6ae9e019f94da507f6385b96fbf3c3/LICENSE).
- **IK** : `solve1` (un os : viser) et `solve2` (deux os, loi des cosinus avec bornage `acos(max(−1, min(1, …)))`). Le
  sens du pli vient de `invertDirection`. **Pour plus de 2 os**, Rive applique `solve2(maillon_i, pointe)` de la racine
  vers la pointe, en recalculant les inverses des repères parents. La FK et l'IK sont mélangées par `strength` sur le
  **plus court chemin angulaire** (différence ramenée dans ]−π, π]) —
  [ik_constraint.cpp](https://github.com/rive-app/rive-runtime/blob/5e3de3857d6ae9e019f94da507f6385b96fbf3c3/src/constraints/ik_constraint.cpp).
- **Skin** : chaque « tendon » donne `monde_os × inverseBind`, rangé dans un tampon de 6 flottants par os —
  [skin.cpp](https://github.com/rive-app/rive-runtime/blob/5e3de3857d6ae9e019f94da507f6385b96fbf3c3/src/bones/skin.cpp).
- **Poids** : **4 influences par sommet**. Indices et poids sont empaquetés sur 8 bits dans deux entiers 32 bits
  (`(data >> (i·8)) & 0xFF`, poids/255) —
  [weight.cpp](https://github.com/rive-app/rive-runtime/blob/5e3de3857d6ae9e019f94da507f6385b96fbf3c3/src/bones/weight.cpp).

**Spine (concepts seulement)**
- Licence des runtimes : on peut intégrer ou dériver les runtimes « provided that each user of the Products must obtain
  their own Spine Editor license », et toute redistribution doit garder la notice —
  [Spine Runtimes License](https://esotericsoftware.com/spine-runtimes-license).
- **IK** : 1 ou 2 os par contrainte (pas 3 ou plus), avec `mix` (0 = FK, 100 = IK, animable). Il y a aussi :
  - `softness` : « slows down the bones as the constrained bones straighten » ;
  - `positive` : sens du pli ;
  - `stretch` : « causes the constrained bones to be scaled larger » ;
  - `compress` (un os) et `uniform`.

  Source : [Spine IK constraints](https://esotericsoftware.com/spine-ik-constraints).
- **Contraintes physiques** :
  - `inertia` : part du mouvement de l'os transmise au décalage physique ;
  - `strength` : force de rappel vers la pose non contrainte ;
  - `damping` : freine davantage les grandes vitesses ;
  - `mass` : résistance à l'accélération ;
  - `wind` et `gravity` : forces constantes selon X et Y du monde ;
  - `mix` : part d'influence, animable ;
  - `limit` : vitesse de translation maximale prise en compte ;
  - `FPS` : la physique tourne à **pas fixe** ; « The lower the FPS the more likely the simulation is to fail » ;
  - `reference scale` : à mettre à l'échelle avec le squelette.

  Source : [Spine physics constraints](https://esotericsoftware.com/spine-physics-constraints).

**Live2D Cubism (concepts seulement)**
- Déformateurs : un **warp deformer** déforme les maillages qu'il contient. Un **rotation deformer** fait tourner son
  contenu « without changing its shape ». Une forte rotation d'un ArtMesh ou d'un warp **rétrécit** la forme, parce que
  l'interpolation est linéaire : les sommets passent par une forme contractée. Le correctif s'appelle « Extended
  Interpolation » — [Live2D, About Deformers](https://docs.live2d.com/en/cubism-editor-manual/deformer/).
- **Physique** : groupes « paramètres d'entrée (avec influence) → pendule à plusieurs étages → paramètres de sortie ».
  Les réglages sont la durée (« the smaller the value, the quicker the swinging »), la facilité de balancement (0,7 à
  0,99 conseillé), le temps de réaction, la vitesse de convergence et l'option « reflect ». Le multi-étage exige un
  numéro de pendule par sortie — [Live2D, physics settings](https://docs.live2d.com/en/cubism-editor-manual/physical-operation-setting/).
- SDK : deux contrats (« Proprietary Software License Agreement » et « Open Software License Agreement »). « Individuals
  and Small-Scale Enterprises are exempted from the license and payment ». La licence n'est requise qu'à la publication,
  à signer au moins un mois avant — [Live2D SDK license](https://www.live2d.com/en/sdk/license/).
- Alternative ouverte déjà repérée : Inochi2D (Creator et Session sous BSD 2-Clause) —
  [inochi-creator LICENSE](https://github.com/Inochi2D/inochi-creator/blob/main/LICENSE).

**Moho (concepts seulement)**
- Les **Smart Bone Actions** servent à corriger les déformations dans certaines poses, comme les formes correctives en
  3D. Le principe est celui d'un « cadran » : tourner un os pilote d'autres éléments (lip-sync, rotation de tête). Un
  tutoriel conseille au plus deux actions par os —
  [Lester Banks, Moho smart bone actions](https://lesterbanks.com/2016/11/working-mohos-smart-bone-actions/).
- Selon des utilisateurs du forum, seules les **rotations d'os** pilotent les smart actions ; les pilotes par position ou
  par échelle sont demandés — [forum Lost Marble](https://lostmarble.com/forum/viewtopic.php?p=217007).

**Synfig (GPL-3.0)**
- Le **Skeleton Deformation Layer** déforme le rendu **raster** des couches inférieures sur une grille rectangulaire
  subdivisée. L'influence de chaque os vient de poignées de largeur. Des parties peuvent disparaître (recadrage à la zone
  d'influence). La page est un brouillon, sans mathématiques du mélange —
  [Synfig wiki](https://wiki.synfig.org/Skeleton_Deformation_Layer).

### Inferences
- L'ordre d'évaluation commun, que nous reprenons, est : pose locale (pistes) → mélange de couches → FK (matrices monde)
  → contraintes dans un ordre fixe (IK, puis transformation, puis physique) → skinning des maillages → ordre de dessin.
  Dans Spine, la physique est une **contrainte à pas fixe** ; dans le dépôt Rive lu, `src/constraints/` ne contient
  aucune physique d'os, seulement une physique de défilement d'interface (`scrolling/`). Pour notre `evaluate(t)` pur, elle devra être
  **pré-cuite** (voir Q5).
- Stocker chaque sommet **dans le repère local de chacun de ses os** (DragonBones) évite une multiplication par
  l'inverse de liaison au moment de l'exécution. Cela rend aussi les décalages FFD solidaires de l'os. Nous gardons
  plutôt les positions de repos et un tampon `monde × inverseBind` par os (Rive, Three.js), qui se prête au GPU et au CoR
  (Q2). C'est équivalent mathématiquement.
- Les fondus **linéaires** de DragonBones donnent une vitesse discontinue (C0) au début et à la fin de chaque
  transition. C'est une source plausible d'« à-coups » ; nous utilisons une rampe de Hermite (C1, voir G10).
- Le « rétrécissement » signalé par Live2D en interpolation linéaire est le même phénomène que l'effondrement du LBS au
  coude, mesuré en Q2. C'est la raison de choisir un mélange **rigide** des rotations.
- Les smart bones de Moho et les formes clés de Live2D sont deux variantes de la même idée : des **correctifs pilotés
  par un paramètre**, qui peut être l'angle d'un os, un paramètre libre comme le lacet de tête, ou une sortie de
  physique. C'est l'outil qui manquait à notre ancien moteur contre l'aspect « Lego » (voir G7).

### Gaps
- Le code des runtimes Spine n'a pas été lu : licence par utilisateur. Le format de poids de Spine est donc décrit
  seulement par analogie avec DragonBones, non vérifié.
- Les formules exactes des pendules Live2D (intégrateur, normalisation des entrées) ne sont pas publiées dans la page
  lue.
- La page Synfig ne documente pas le mélange des influences : impossible de dire si c'est un LBS.

---

## Q2 — Mathématiques de déformation : LBS, nombres duaux complexes (DCN), centres de rotation optimisés (CoR), poids harmoniques ou BBW. Que mesurent-ils sur notre silhouette ?

### Takeaway
Sur la silhouette du banc (1 580 sommets, coude plié de 120°) :
- le **LBS effondre l'extérieur du coude à 50 % de son rayon** ;
- le **DCN** (le « dual quaternion » du plan) garde le rayon à 100 %, mais **gonfle** la zone de 18 à 28 % ;
- le **CoR-2D**, notre portage au plan de Le & Hodgins 2016, garde 88 % (minimum) à 97 % (moyenne) du rayon avec
  seulement +7 % d'aire.

Pour les poids :
- les **poids euclidiens** font fuir 69 % d'influence du bras sur le flanc du torse ;
- les **poids harmoniques** 17 % ;
- les **poids « parties + bandes harmoniques »** 0,0 %, tout en gardant la partition de l'unité.

Les retournements restants viennent de l'**aisselle fusionnée** : un seul maillage ne peut pas plier un bras collé au
corps sans se recouvrir. Il faut des **calques ou des sous-maillages** par membre.

### Cited Findings
**Formules (sources primaires)**
- DCN : `p̂ = p0 + p1·ε`, avec `(p0 + p1ε)(q0 + q1ε) = p0q0 + (p1·q̃0 + p0q1)ε`. Un point v ∈ ℂ est envoyé sur
  `p0²·v + 2·p0·p1`, et chaque rigide de SE(2) a exactement deux représentants ±p̂. Le mélange est
  `DLB(p̂_i; w_i) = Σ w_i p̂_i / |Σ w_i p̂_i|`, avec `|p0 + p1ε| = |p0|`. Il est indéfini si le dénominateur s'annule. Les
  auteurs annoncent une bibliothèque C++ sous licence MIT —
  [arXiv 1601.01754](https://arxiv.org/abs/1601.01754).
- CoR : similarité de poids
  `s(w_p, w_v) = Σ_{j≠k} w_pj·w_pk·w_vj·w_vk·exp(−(w_pj·w_vk − w_pk·w_vj)²/σ²)`, puis
  `p* = ∫ s(w_p, w_v)·v dv / ∫ s(w_p, w_v) dv`. À l'exécution, `t_p = Σ_j w_pj (R_j p* + t_j) − R_p p*`, où la rotation
  `R_p` vient du mélange de quaternions. Les auteurs utilisent σ = 0,1. Le précalcul par sommation sur tous les triangles
  « can take up to an hour » sur un grand modèle 3D ; ils l'accélèrent par subdivision et regroupement —
  [Le & Hodgins 2016, PDF](https://la.disneyresearch.com/wp-content/uploads/Real-time-Skeletal-Skinning-with-Optimized-Centers-of-Rotation-Paper.pdf).
- Même article : le DQS crée des **renflements** près des articulations pliées ; le CoR les évite en calculant les
  centres au repos (même PDF).
- BBW : minimiser `Σ_i ∫ (Δw_i)² dA` sous contraintes d'interpolation (1 sur la poignée i, 0 sur les autres),
  `0 ≤ w_i ≤ 1` et `Σ w_i = 1`. C'est un programme quadratique résolu par ensemble actif ou par Mosek —
  [libigl tutorial](https://libigl.github.io/tutorial/) ; article : Jacobson, Baran, Popović, Sorkine, ACM TOG 30(4),
  2011 — [page du projet](https://www.cs.toronto.edu/~jacobson/weblog/1784.html).
- ARAP en deux étapes (forme close, w = 1000 sur les poignées, normalisation `T_k / √(c_k² + s_k²)` à l'étape 2) —
  [Igarashi & Igarashi 2009, PDF](https://www-ui.is.s.u-tokyo.ac.jp/~takeo/papers/takeo_jgt09_arapFlattening.pdf).
  Les mesures sont dans la note 01.

**Notre ancien moteur (branche lue en lecture seule)**
- `body2d.ts` : « each vertex bound to its nearest bones (soft blend at the joints, hard split where an arm lies along
  the body […]) », rotations du dessin amorties par des ressorts —
  `workbench/server/jev/studio/body2d.ts`.
- `puppetRender.ts` dessine le maillage déformé en Canvas 2D par « affine-mapped triangles » —
  `workbench/direct/lib/studio/puppetRender.ts`.
- `sheetActor.ts` change de pose de planche avec un « pop » (squash & stretch) —
  `workbench/direct/lib/studio/sheetActor.ts`.
- `boneHeat.ts` calcule déjà des poids « bone heat » (Baran & Popović 2007) — `workbench/server/jev/studio/actor/boneHeat.ts`.

**Mesures de ce banc** (`bench_rig2d.out.txt`)

Poids, 19 os, maillage de Q3 :
- **Euclidiens 1/d⁴**, 4 meilleurs : 19,5 ms. Fuite des os du tronc vers l'avant-bras gauche : 0,0 % (n = 67). Fuite des
  os du bras gauche vers le flanc du torse : **68,7 %** (n = 12).
- **Harmoniques** : Laplacien de graphe à poids positifs 1/longueur, Dirichlet sur le « cœur » de chaque os, gradient
  conjugué préconditionné Jacobi.
  - Coût : 251 ms, 847 itérations au total.
  - `|Σw − 1|` ≤ 6,0·10⁻⁹ ; bornes [−2,3·10⁻¹⁰ ; 1,000000].
  - Fuites : 0,33 % et **17,41 %**.
- **Parties + bandes**. Chaque sommet est étiqueté par la partie dont la capsule normalisée `d_j/r_j` est la plus
  proche. Il est contraint à 100 % sur cet os s'il est à plus de 26 px de toute articulation de cet os ; le harmonique ne
  se résout que dans ces bandes.
  - Coût : 81 ms, 283 itérations ; 1 381 sommets contraints sur 1 580.
  - Fuites : 0,45 % et **0,00 %**.

Skinning, pose « épaule −40°, coude +120°, poignet +20° » puis « épaule −20°, coude +60° ». Les mesures portent sur
l'aire de la zone de mélange du coude et sur le rayon extérieur du coude (sommets de contour à 15–60 px du coude, n = 8,
distance au coude déformé ÷ distance au repos) :

| Pose | Poids | Méthode | Aire zone coude | Rayon coude min / moyen | Triangles retournés / 2 923 (os dominant) |
|---|---|---|---|---|---|
| 120° | euclidien | LBS | 103,6 % | **50 % / 64 %** | 77 (brasG 41, ventre 20) |
| 120° | euclidien | DCN | 128,3 % | 100 % / 100 % | 81 |
| 120° | euclidien | CoR | 110,1 % | 98 % / 125 % | 82 |
| 120° | harmonique | LBS | 97,1 % | **50 % / 80 %** | 83 (brasG 48, ventre 28) |
| 120° | harmonique | DCN | **127,6 %** | 100 % / 100 % | 83 |
| 120° | harmonique | **CoR** | **106,6 %** | **88 % / 97 %** | 77 |
| 120° | parties+bandes | LBS | 109,6 % | 100 % / 100 % | 32 (brasG 20, poitrine 5) |
| 120° | parties+bandes | DCN | 118,0 % | 100 % / 100 % | 36 |
| 120° | parties+bandes | CoR | 114,1 % | 100 % / 100 % | 34 |
| 60° | harmonique | LBS | 101,4 % | 87 % / 94 % | 0 |
| 60° | harmonique | DCN | 104,7 % | 100 % / 100 % | 0 |
| 60° | harmonique | CoR | 103,1 % | 96 % / 99 % | 0 |
| 60° | parties+bandes | LBS / DCN / CoR | 100,8 / 102,6 / 102,0 % | 100 % | 24 (brasG 18) |

- Précalcul CoR-2D, en O(sommets × triangles) : 3,0 s avec les poids harmoniques (734 sommets reçoivent un centre
  propre), **0,36 s avec parties + bandes** (199 sommets), 5,9 s avec les poids euclidiens (1 472 sommets).
- Chrono par image, 1 580 sommets, 4 influences, tableaux Float32 : **LBS 31 µs**, **DCN 108 µs**. Le CoR n'a pas été
  chronométré à part (voir Gaps).

### Inferences
- **Choix du mélange** :
  - le LBS est exclu dès que le coude ou le genou dépasse environ 60° (rayon 87 % à 60°, 50 % à 120°) ;
  - le DCN est exclu pour les bras et le ventre, car il gonfle l'aire de 18 à 28 %, et un gros ventre ou un boubou qui
    gonfle au coude se voit tout de suite ;
  - le **CoR-2D devient notre défaut** : rigide comme le DCN pour la rotation, fidèle comme le LBS pour l'aire ;
  - son précalcul se limite aux sommets à plusieurs influences ; avec des poids en bandes, il coûte moins de 0,4 s à
    l'import.
- **Choix des poids** :
  - les poids purement géométriques, euclidiens ou harmoniques sur tout le masque, sont incapables de séparer un bras
    collé au corps ;
  - l'**étiquette de partie** (connue exactement pour nos personnages procéduraux, peinte ou issue des calques pour les
    planches), combinée au harmonique **seulement dans les bandes d'articulation**, donne une fuite nulle ;
  - par principe du maximum, elle garantit `0 ≤ w ≤ 1` et `Σw = 1` sans programme quadratique ;
  - les BBW restent une option hors ligne de qualité, non nécessaire.
- **Retournements** : avec des bandes étroites, il reste 24 à 36 triangles retournés, tous dans `brasG` (aisselle) et
  `poitrine`. C'est la signature d'un **recouvrement physique** : le bras levé passe sur le torse. Aucun mélange ne
  corrige cela dans un maillage unique. Spine, DragonBones et Live2D le traitent par des **calques séparés et un ordre de
  dessin**. D'où la règle de G1 : un membre qui peut croiser le corps est un sous-maillage à part, même pour un
  « personnage image unique ».
- **Diagnostic « trop Lego »** (hypothèse, non mesurée sur les anciens films). Notre ancien moteur combinait plusieurs
  défauts :
  - liaison « nearest bones » avec coupure dure ;
  - triangles affines en Canvas 2D, avec coutures et anticrénelage par triangle ;
  - changements de pose de planche par « pop ».

  Ce sont précisément les trois défauts que corrigent le CoR, les poids en bandes, le rendu WebGL d'un maillage continu
  et des correctifs pilotés par paramètre (G7).
- **Rappel sur la porte de rythme du film 9** : le film a échoué avec un mouvement de 0,0271 et une couverture de 0,53,
  pour des plafonds de 0,027 et 0,435. La couverture des TikTok de l'utilisateur est de 0,15–0,29 (notes
  `contournements_bac_a_sable.md` §10 et `video_3d_etat_des_acquis.md`, branche lue). Le défaut était donc un mouvement
  **trop étalé sur l'image** : caméra, décor, figurants. Ce n'était pas un manque d'amplitude. Le rig 2D doit concentrer
  le mouvement **dans les personnages** (gestes amples, secondaire, squash), avec une caméra sobre.

### Gaps
- Le coût par image du CoR-2D n'a pas été isolé. Il devrait être de l'ordre du DCN : par sommet, une somme pondérée de
  demi-angles complexes (précalculés une fois par os et par image), une normalisation et une transformation affine.
- L'ARAP d'Igarashi (note 01) n'a pas été comparé au CoR **sur le même maillage et la même pose**. C'est à faire avant de
  figer le défaut ; l'ARAP reste l'outil des déformations par poignées sans squelette.
- Les BBW exactes n'ont pas été calculées : pas de solveur QP en JS. Une version Python hors ligne (scipy ou osqp) reste
  à évaluer si les bandes harmoniques s'avèrent insuffisantes sur les planches réelles.
- La licence de libigl n'a pas été vérifiée dans cette session. Nous ne l'utilisons pas.
- Le rayon du coude est mesuré sur 8 sommets de contour seulement : métrique indicative.

---

## Q3 — Générer un maillage depuis un masque alpha : contour, simplification, triangulation (earcut, poly2tri, cdt2d, Triangle), coût et qualité

### Takeaway
Notre chaîne (suivi de contour → Douglas-Peucker → rééchantillonnage à pas fixe → réseau triangulaire intérieur →
Delaunay de Bowyer-Watson → filtre « centroïde et milieux d'arêtes dans le masque ») produit **1 580 sommets et 2 923
triangles en environ 100 ms** sur une silhouette de 600×1100. Les angles sont de bonne qualité : p5 = 35°, médiane 60°.

Mais **6,8 % des segments du contour manquent** : la Delaunay non contrainte coupe les coins concaves. Il faut une
étape de **récupération d'arêtes contraintes**, à écrire nous-mêmes ou à prendre dans cdt2d (MIT) ou poly2tri (BSD-3).
earcut (ISC, déjà embarqué par PixiJS) accepte des points de Steiner et propose depuis peu un raffinement de Delaunay,
mais sans garantie de correction. Triangle (Shewchuk) est **exclu** : sa distribution commerciale exige un accord direct
avec l'auteur.

### Cited Findings
- **earcut** :
  - il privilégie « raw speed and simplicity over triangulation quality » et « does **not** guarantee a correct
    triangulation on arbitrary input » ;
  - « If you pass a single vertex as a hole, Earcut treats it as a Steiner point » ;
  - `refine(triangles, vertices)` légalise les arêtes intérieures par flips de Delaunay en préservant le bord et les
    trous ;
  - version 3.2.4 publiée le 28/09/2026 sur npm ; licence ISC.

  Sources : [README](https://github.com/mapbox/earcut/blob/765470e73adfdfe5cd0dfc1c1a398f558cdea3a0/README.md),
  [LICENSE](https://github.com/mapbox/earcut/blob/765470e73adfdfe5cd0dfc1c1a398f558cdea3a0/LICENSE).
- **PixiJS v8.22.0** dépend déjà de `earcut ^3.0.2` —
  [package.json](https://github.com/pixijs/pixijs/blob/65552017d23255c1442a7d4ac7f0d49e3225fb1d/package.json).
- **poly2tri.js** : Delaunay contrainte par balayage (Domiter & Žalik). Il accepte trous et points de Steiner intérieurs,
  mais seulement des polygones simples : les trous ne doivent toucher ni d'autres trous ni le contour, et il n'accepte
  ni points dupliqués ni points colinéaires. BSD-3-Clause —
  [README](https://github.com/r3mi/poly2tri.js/blob/cb6b2220c70305c6b8c6483f2b1a2ad72616d070/README.md).
- **cdt2d** : « A robust 2D constrained Delaunay triangulation library ». Il prend `cdt2d(points, edges, {exterior:
  false})`, avec des options `delaunay` et `interior`. MIT, dernière publication en 2015 —
  [README](https://github.com/mikolalysenko/cdt2d/blob/a2aba65b89f048890e8c9c78f40ea403497262d7/README.md).
- **Triangle** (Shewchuk) : « Distribution of this code for any commercial purpose is permissible ONLY BY DIRECT
  ARRANGEMENT WITH THE COPYRIGHT OWNER » — notice reproduite dans [MeshPy LICENSE](https://gitlab.tiker.net/inducer/meshpy/-/raw/main/LICENSE).
  Le mainteneur de Triangle.NET recommande de ne pas utiliser ce code dans un contexte commercial —
  [Triangle.NET](https://github.com/wo80/Triangle.NET).
- **Mesures de ce banc**, notre code (`bench_rig2d.out.txt`) :
  - contour (Moore) : 2 844 px ;
  - Douglas-Peucker à ε = 1,2 px : 105 sommets ;
  - rééchantillonnage au pas de 14 px : 219 points, en 7,7 ms ;
  - transformée de distance (chanfrein 3-4) : 73 ms ;
  - Bowyer-Watson **naïf** : 1 580 points, 3 216 triangles bruts, **89 à 107 ms** ;
  - filtre masque : 3,4 à 4,9 ms ;
  - résultat : 2 923 triangles, 37 triangles dégénérés (colinéaires) retirés ;
  - **15 segments de contour sur 219 absents** ;
  - angle minimal : p5 = 35,1°, médiane 60,0°.

### Inferences
- **Pas de dépendance obligatoire.** Notre Bowyer-Watson (une centaine de lignes) est assez rapide pour l'import : le
  maillage est calculé une fois par calque, pas par image. Il manque deux pièces, à écrire nous-mêmes :
  - la **récupération des arêtes de contour** par retournements successifs (algorithme classique de Sloan, à vérifier
    dans l'article avant d'écrire) ;
  - un **raffinement** si un angle descend sous 20° (insertion du circumcentre, Ruppert ou Chew).
  
  Si l'on préfère une dépendance, cdt2d (MIT) ou poly2tri (BSD-3) conviennent, avec notice dans THIRD_PARTY_NOTICES.
  earcut ne convient que pour les calques sans sommets intérieurs : accessoires rigides, bouches.
- La **densité doit être adaptative** : pas fin (8 px) dans les bandes d'articulation et autour de la bouche et des yeux,
  pas large (16 à 20 px) au cœur des parties rigides. Le coût du skinning (31 µs pour 1 580 sommets) laisse une grande
  marge.
- Le filtre « milieux d'arêtes dans le masque » est l'amélioration la plus rentable sur Animated Drawings, qui filtre par
  centroïde seul (voir note 01). Il évite les ponts entre l'avant-bras et le torse quand l'écart dépasse le pas.

### Gaps
- La récupération d'arêtes contraintes et le raffinement de Ruppert ne sont pas implémentés ni mesurés dans ce banc.
- Le banc utilise un masque synthétique net. Les masques des planches (anticrénelage, cheveux, franges du boubou)
  demanderont un seuil d'alpha et un lissage du contour non testés ici.
- Le pas de 14 px n'a pas été optimisé : il faut une courbe qualité/coût avec densité adaptative.

---

## Q4 — IK et contacts : deux os analytique, IK douce, FABRIK, verrouillage des pieds. Quel solveur pour pointer, poser la main, garder les pieds au sol ?

### Takeaway
Pour les bras et les jambes, l'**IK analytique à deux os** suffit (loi des cosinus, comme Rive et DragonBones). Elle
coûte **0,11 µs par solution**. Il faut lui ajouter une **IK douce** : sans elle, le coude « claque » de 4,77° par pas
de 0,3 px quand la cible atteint la portée ; avec 5 % de douceur, le saut tombe à 0,32°.

Pour les chaînes plus longues (colonne, queue de foulard pilotée, doigts), **FABRIK** converge en 6,3 itérations en
moyenne (3,7 à 4,5 µs pour 4 os, tolérance 0,1 px). Le verrouillage des pieds se construit au-dessus de l'IK à deux os,
avec des fenêtres de contact et des fondus.

### Cited Findings
- **Rive** : `solve2` calcule `A = acos((−a² + b² + c²)/(2bc))` et `C = acos((a² + b² − c²)/(2ab))` avec bornage. Les
  angles sont `r1 = atan2(c⃗) ± A` et `r2 = ±(C − π)`, selon `invertDirection`. Les chaînes de plus de 2 os sont résolues
  par `solve2` répétés vers la pointe. Le mélange FK/IK par `strength` suit le plus court chemin angulaire —
  [ik_constraint.cpp](https://github.com/rive-app/rive-runtime/blob/5e3de3857d6ae9e019f94da507f6385b96fbf3c3/src/constraints/ik_constraint.cpp).
- **DragonBones** : intersection de cercles, avec un sens du pli corrigé si le repère est en miroir —
  [Constraint.ts](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/DragonBones/src/dragonBones/armature/Constraint.ts).
- **Spine** : `softness` ralentit les os quand ils se redressent, `stretch` allonge la chaîne hors portée, et pas plus de
  2 os par contrainte — [Spine IK](https://esotericsoftware.com/spine-ik-constraints).
- **FABRIK** (Aristidou & Lasenby, Graphical Models 73(5), 2011) : le solveur trouve chaque articulation sur une droite,
  sans angles ni matrices. Il demande peu d'itérations, accepte des contraintes et plusieurs effecteurs —
  [page de l'auteur](https://www.andreasaristidou.com/FABRIK). Une suite de 2015 traite les cibles inaccessibles et
  donne une preuve de convergence — [UCY](https://gnosis.library.ucy.ac.cy/handle/7/53580?show=full).
- **Mesures de ce banc**, notre code :
  - IK deux os (L1 = 175, L2 = 170 px) : **0,111 µs** par solution ;
  - balayage de la cible de 300 à 360 px par pas de 0,3 px : saut maximal de l'angle du coude **4,77°** en IK dure,
    **0,32°** en IK douce (douceur 5 %) ;
  - FABRIK, 4 os (100/90/80/60 px), cibles atteignables sur 360° : **3,70 à 4,53 µs** par solution, **6,3 itérations**
    en moyenne.

### Inferences
- **IK douce** (notre formulation, inspirée du réglage `softness` de Spine). Pour `L = L1 + L2`, `d_s = (1 − σ)·L` et
  `d > d_s`, on prend `d' = L − (L − d_s)·exp(−(d − d_s)/(L − d_s))`. Elle est continue avec une dérivée égale à 1 en
  `d_s` : **aucune cassure de vitesse**. Elle tend vers L sans l'atteindre, ce qui supprime le « snap » de l'extension
  complète, défaut classique des gestes d'accusation (« c'est toi ! », bras tendu).
- **FABRIK plutôt que CCD** pour les chaînes de plus de 2 os : il travaille en positions et garde naturellement les
  longueurs. Les mesures montrent qu'il est assez rapide pour tourner dans `evaluate(t)` sans cache. Il reste
  déterministe si l'on fixe la pose initiale (la pose FK du même instant, jamais l'image précédente) et le nombre maximal
  d'itérations.
- Les **pieds** se traitent par fenêtres de contact explicites dans la timeline. Pendant un contact, le pied est
  verrouillé dans le monde et la jambe est résolue par IK deux os. À l'entrée et à la sortie, la position du pied est
  fondue sur 3 images par une rampe C1. Si la cible est hors de portée, on **baisse la hanche** au lieu d'étirer la
  jambe : `Δy_hanche = max(0, d − 0,98·L)`.

### Gaps
- CCD n'a pas été mesuré ni sourcé ici ; nous ne prévoyons pas de l'utiliser.
- Les limites articulaires dans FABRIK (cônes 2D, c'est-à-dire des intervalles d'angle) ne sont pas implémentées dans
  le banc.
- Pas de mesure du glissement des pieds sur une vraie marche ; à faire avec le pilote, en reprenant la métrique de la
  note 01.

---

## Q5 — Physique secondaire et squash & stretch : pendules Live2D, contraintes physiques Spine, XPBD. Comment rester déterministe (`evaluate(t)` pur) ?

### Takeaway
La physique secondaire sert aux pans de foulard, au gélé, à l'ourlet du boubou, au ventre et aux boucles d'oreilles.
C'est ce qui donne le « suivi » et le « settle » demandés par la spec. Spine et Live2D la font **à pas fixe**, avec des
réglages d'artiste : inertie, raideur, amortissement, masse, vent, gravité, mélange ; durée, réaction, convergence.

Le **XPBD** (Macklin, Müller, Chentanez 2016) donne une raideur **indépendante du pas et du nombre d'itérations**. Il
est très bon marché : 2 chaînes (10 + 24 particules), 60 i/s × 8 sous-pas, **30 s de film en 62 à 86 ms**. Il est
**reproductible au bit près** d'une exécution à l'autre.

Pour garder `evaluate(t)` pur, on **pré-cuit** la physique de chaque plan, du début du plan à pas fixe, et
`evaluate(t)` lit cette piste.

### Cited Findings
- XPBD (« XPBD: position-based simulation of compliant constrained dynamics », MIG'16, p. 49–54) résout la dépendance de
  la raideur au pas et au nombre d'itérations du PBD. Le multiplicateur est mis à jour à chaque itération, avec une
  compliance divisée par le carré du pas (`α̃ = α/Δt²`) — résumé et citation dans
  [DiffXPBD, arXiv 2301.01396](https://arxiv.org/pdf/2301.01396). Le rapport IPSJ précise qu'il permet aussi d'estimer
  les forces de contrainte — [IPSJ CG17167010](https://ipsj.ixsq.nii.ac.jp/record/183598/files/IPSJ-CG17167010.pdf).
- Spine fait tourner la physique à une fréquence propre, et plus elle est basse, plus la simulation risque d'échouer.
  `limit` borne la vitesse prise en compte et `reference scale` met les distances à l'échelle —
  [Spine physics](https://esotericsoftware.com/spine-physics-constraints).
- Live2D : pendule à plusieurs étages, entrées pondérées (angles de tête et de corps), sorties en pourcentage de la
  course du paramètre, option « reflect » —
  [Live2D physics](https://docs.live2d.com/en/cubism-editor-manual/physical-operation-setting/).
- **Mesures de ce banc**, notre code : une chaîne de 10 particules (pas de 14 px, flexion α = 10⁻⁴) et une de 24
  (pas de 12 px, α = 5·10⁻⁵). Contraintes de distance rigides (α = 0), « flexion » par distance i ↔ i+2 en compliance,
  ancre animée, gravité 980 px/s², amortissement de vitesse 0,995. Résultat : **62 à 86 ms pour 1 800 images**
  (34 à 48 µs par image). Deux passes donnent la **même empreinte** (1812620006).

### Inferences
- **Pré-cuisson par plan** :
  - l'entrée est la pose FK + IK du personnage aux instants des sous-pas, calculée par la même fonction pure ;
  - la sortie est une piste d'angles d'os secondaires, rangée à chaque sous-pas ;
  - `evaluate(t)` interpole cette piste par Hermite ;
  - l'empreinte de la piste est indexée par le hachage (rig, segment de timeline, paramètres) ;
  - le scrub avant/arrière reste exact, et un changement de timeline invalide seulement les plans touchés.
- Le **déterminisme inter-machines** n'est pas garanti si la physique appelle `Math.sin` ou `Math.exp` : leur précision
  n'est pas imposée par ECMAScript. La simulation ne doit donc dépendre que de `+ − × ÷ √`. Les entrées trigonométriques
  (pose) sont calculées une fois et stockées. La cuisson se fait **dans Node, en dehors du navigateur**, et le résultat
  est écrit dans le projet.
- Les **paramètres d'artiste** de Spine se traduisent ainsi en XPBD (notre correspondance, à calibrer à l'œil) :
  - `strength` → compliance de la contrainte de rappel vers la pose animée, `α = 1/k` ;
  - `damping` → amortissement relatif de la vitesse par sous-pas ;
  - `inertia` → part de l'accélération de l'ancre injectée dans les particules ;
  - `mass` → masse inverse w ;
  - `wind` et `gravity` → forces externes ;
  - `limit` → écrêtage de la vitesse de l'ancre ;
  - `mix` → mélange final de l'angle simulé et de l'angle animé.
- Le **squash & stretch** est un rig, pas une physique : une échelle conservant l'aire 2D (`s_x·s_y = 1`) le long d'un
  axe, appliquée autour d'un pivot (point de contact au sol ou centre de masse). Elle est pilotée par une courbe
  analytique d'impact ou par la vitesse verticale (formules en G8). Tout reste pur.

### Gaps
- Pas de collision dans le banc : ourlet contre jambes, foulard contre épaule. Il faut des contraintes d'inégalité contre
  des capsules d'os, non mesurées.
- La correspondance entre paramètres Spine et XPBD est une proposition, non validée visuellement.
- La rampe de Hermite des fondus n'a pas été comparée aux fondus linéaires de DragonBones sur une vraie transition.

---

## Q6 — PixiJS v8 et Three.js : API Mesh, batching, shaders personnalisés, limites de texture, coût mesuré dans ce conteneur

### Takeaway
Dans ce conteneur, Chromium headless rend avec **SwiftShader via ANGLE/Vulkan**, en **WebGL2**. Les limites sont :
`MAX_TEXTURE_SIZE = 8192`, 4 096 vecteurs uniformes de sommet, 32 unités de texture, 16 attributs.

Le **skinning des maillages ne coûte presque rien** : 0,1 à 0,5 ms par image pour 1 à 8 personnages de 1 580 sommets en
CPU. Le skinning **GPU par shader personnalisé fonctionne dans PixiJS 8.22.0** et donne les **mêmes pixels** que le CPU.

Le coût d'une image 1080×1920 **lue en mémoire** (`readPixels`) est de **74 à 96 ms**, dont 74–79 ms pour le décor seul.
C'est donc la capture qui borne l'export, pas le rig.

### Cited Findings
- PixiJS v8 : un `Mesh` est **groupé (batched)** automatiquement seulement si sa géométrie a ≤ 100 sommets (mode
  `'auto'`), s'il n'a pas de shader propre et si l'état ne demande ni test de profondeur ni culling —
  [Mesh.ts](https://github.com/pixijs/pixijs/blob/65552017d23255c1442a7d4ac7f0d49e3225fb1d/src/scene/mesh/shared/Mesh.ts).
- `MeshGeometry` expose `positions`, `uvs` et `indices`, adossés aux tampons `aPosition` et `aUV`. Le setter remplace les
  données du tampon —
  [MeshGeometry.ts](https://github.com/pixijs/pixijs/blob/65552017d23255c1442a7d4ac7f0d49e3225fb1d/src/scene/mesh/shared/MeshGeometry.ts).
- Un shader de maillage personnalisé reçoit `uProjectionMatrix`, `uWorldTransformMatrix` et `uTransformMatrix`
  (`mvp = P·W·T`) —
  [triangle.vert](https://github.com/pixijs/pixijs/blob/65552017d23255c1442a7d4ac7f0d49e3225fb1d/examples/mesh_custom_shader_geometry/triangle.vert).
  Les tableaux d'uniformes se déclarent `{ type: 'vec4<f32>', size: N }` —
  [types.ts](https://github.com/pixijs/pixijs/blob/65552017d23255c1442a7d4ac7f0d49e3225fb1d/src/rendering/renderers/shared/shader/types.ts).
- L'adaptateur PixiJS 8 de DragonBones fait le LBS sur CPU et écrit dans `MeshSimple.vertices` —
  [PixiSlot.ts](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/Pixi/8.x/src/dragonBones/pixi/PixiSlot.ts).
- Three.js :
  - le shader de skinning calcule `skinned = Σ_{X,Y,Z,W} boneMat·(bindMatrix·v)·skinWeight`, puis
    `bindMatrixInverse·skinned`, avec 4 influences —
    [skinning_vertex.glsl.js](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/skinning_vertex.glsl.js) ;
  - les matrices d'os sont lues dans une **texture de données** par `texelFetch`, à 4 texels RGBA par matrice —
    [skinning_pars_vertex.glsl.js](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/skinning_pars_vertex.glsl.js) ;
  - la taille de cette texture vaut `max(4, ceil(√(4·nOs)/4)·4)` —
    [Skeleton.js](https://github.com/mrdoob/three.js/blob/dev/src/objects/Skeleton.js) ;
  - en mode `attached`, `bindMatrixInverse` suit `matrixWorld` ; en mode `detached`, il reste l'inverse de
    `bindMatrix` — [SkinnedMesh.js](https://github.com/mrdoob/three.js/blob/dev/src/objects/SkinnedMesh.js).
- **Mesures de ce banc** (`run_browser.mjs`, médianes sur 40 images, 1080×1920, décor plein cadre + N personnages) :
  - limites : `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))`, WebGL2 vrai, MAX_TEXTURE_SIZE 8192,
    MAX_VERTEX_UNIFORM_VECTORS 4096, MAX_TEXTURE_IMAGE_UNITS 32, MAX_VERTEX_ATTRIBS 16 ;
  - mesures par configuration :

    | Personnages | Skinning | Skin (ms) | Rendu + `readPixels` (ms) | Pixels « boubou » |
    |---|---|---|---|---|
    | 0 | — | 0 | 74,3–79,0 | 0 |
    | 1 | CPU (MeshSimple) | 0,10 | 82,8–84,8 | 132 443 |
    | 1 | GPU (shader, 64 vec4 d'os) | 0,00–0,10 | 77,4–78,8 | 132 443 |
    | 4 | CPU | 0,20–0,30 | 83,8–96,3 | 402 970 |
    | 4 | GPU | 0,10 | 85,1–90,1 | 402 970 |
    | 8 | CPU / GPU | 0,50 / 0,00 | 88,0 / 88,3 | (hors cadre) |

  - « rendu + finish » ne vaut que 0,2–0,3 ms : la commande est différée et le vrai coût apparaît au `readPixels` ;
  - les comptes de pixels identiques entre CPU et GPU valident le shader de skinning.

### Inferences
- **Garder le skinning sur CPU** (MeshSimple, comme DragonBones) comme voie de référence :
  - il est en Float64 côté JS, donc **identique d'une machine à l'autre** pour les tests de la porte qualité ;
  - le CoR, les correctifs et la physique s'y écrivent plus simplement ;
  - il ne coûte qu'environ 0,1 ms par personnage.

  Le shader GPU est validé et reste une option pour des maillages beaucoup plus denses. Avec plus de 100 sommets, chaque
  maillage fait de toute façon son propre appel de dessin. Pour 4 personnages × environ 15 calques, cela fait une
  soixantaine d'appels, ce qui est négligeable.
- **Budget texture** : atlas de personnage ≤ 4096² (sous la limite de 8192 de SwiftShader et des GPU courants). Les
  planches d'environ 2 000 px tiennent sans découpe.
- **Export** : environ 80 ms de capture par image 1080×1920. Un sketch de 60 s à 30 i/s coûte donc environ 2,4 min de
  capture, et 25 i/s environ 2 min. C'est acceptable, mais cela concerne la piste export : rendre à 30 i/s plutôt que
  60, tester `canvas.toBlob` ou WebCodecs. Le rig n'est pas le goulot.

### Gaps
- Les masques PixiJS (`mask`) et les filtres (contours, ombres portées des personnages) n'ont pas été mesurés.
- Le rendu WebGPU de PixiJS n'a pas été testé : pas de GPU, et SwiftShader WebGPU non vérifié.
- La version 8.22.0 a moins de 2 semaines (publiée le 10/10/2026, d'après `npm view`). Pour le projet, il faudra figer
  une version plus ancienne et éprouvée de la branche 8.

---

## Ce que nous greffons dans notre moteur

Principe : **rig déterministe en TypeScript, rendu PixiJS v8, skinning CPU de référence**. Les composants ci-dessous
sont réécrits à partir des formules ; aucune ligne de DragonBones, Rive, PixiJS, Three.js ou des articles n'est copiée.
Les calculs lourds (maillage, poids, centres CoR, cuisson de la physique) se font **à l'import ou par plan, dans Node**,
et sont stockés dans le projet. Ce qui tourne par image est pur et léger.

### G1. `CharacterRigAdapter` — un seul format pour « image unique » et « cut-out »

```ts
type BoneId = number; type SlotId = number;

interface BoneDef {
  id: BoneId; name: string; parent: BoneId | -1;
  rest: { x: number; y: number; rot: number; sx: number; sy: number; shear: number }; // repère local au repos
  length: number;                       // px, pour l'IK et le stretch
  limits?: { min: number; max: number }; // rad, appliquées après IK
  inherit: { rotation: boolean; scale: boolean };
  role?: 'hips' | 'spine' | 'chest' | 'neck' | 'head' | 'clavicle' | 'upperArm' | 'foreArm' | 'hand'
       | 'thigh' | 'shin' | 'foot' | 'tail' | 'belly' | 'hem';
}

interface SkinMesh {                    // calculé à l'import (G5), immuable
  rest: Float32Array;                   // 2V, px du calque
  uv: Float32Array;                     // 2V
  indices: Uint16Array | Uint32Array;   // 3T
  boundary: Uint16Array;                // contour ordonné (contrôles qualité, filtres de contour)
  infl: { bone: Uint8Array; w: Float32Array }; // 4 influences par sommet, Σw = 1
  cor?: Float32Array;                   // 2V : centre p* (NaN si une seule influence) — G3
  band: Uint8Array;                     // 1 si sommet de bande d'articulation (pour les correctifs)
  label: Uint8Array;                    // partie (os) d'origine du sommet
}

type Attachment =
  | { kind: 'region'; texture: string; pivot: [number, number] }     // pièce rigide (accessoire, œil fermé)
  | { kind: 'mesh'; texture: string; mesh: SkinMesh };               // maillage pondéré

interface SlotDef { id: SlotId; name: string; bone: BoneId; attachments: Record<string, Attachment>;
                    z: number; blend?: 'normal' | 'multiply'; clipBy?: SlotId }

interface IkDef     { id: string; bones: [BoneId] | [BoneId, BoneId]; target: BoneId; bend: 1 | -1;
                      softness: number; stretch: boolean; mix: number }
interface ChainDef  { id: string; bones: BoneId[]; target: BoneId; maxIter: number; tol: number } // FABRIK
interface PhysDef   { id: string; bones: BoneId[]; inertia: number; strength: number; damping: number; mass: number;
                      gravity: number; wind: number; limit: number; mix: number; hz: number }
interface ParamDef  { id: string; min: number; max: number; def: number;
                      driver?: { bone: BoneId; from: number; to: number };   // « smart bone » Moho
                      keys: { at: number[]; deltas: Map<SlotId, Float32Array> }[] } // formes clés (Live2D)
interface ContactDef { foot: BoneId; sole: [number, number][]; ik: string }

interface RigDef {
  version: 1; kind: 'single-image' | 'cutout'; pxPerMetre: number;
  bones: BoneDef[]; slots: SlotDef[]; drawOrder: SlotId[];
  ik: IkDef[]; chains: ChainDef[]; physics: PhysDef[]; params: ParamDef[]; contacts: ContactDef[];
  provenance: { assetIds: string[]; licence: string; hash: string };  // AssetRegistry
}

interface RigPose  { local: Float32Array /* B×6 : rot, sx, sy, shear, tx, ty */; params: Float32Array;
                     attach: Record<SlotId, string>; zOverride: Record<SlotId, number>; ikMix: Float32Array }
interface RigFrame { world: Float32Array /* B×6 affine */; verts: Map<SlotId, Float32Array>; order: SlotId[] }

interface CharacterRigAdapter {
  build(input: CutoutLayers | SingleImage, skeleton: SkeletonGuess): RigDef;        // import (Node)
  bakePhysics(rig: RigDef, shot: ShotTimeline): PhysicsTrack;                        // par plan (Node)
  evaluate(rig: RigDef, pose: RigPose, phys: PhysicsTrack | null, t: number): RigFrame; // pur
  validate(rig: RigDef): RigQualityReport;                                           // poses extrêmes (G11)
}
```

- **Cut-out** : un calque par partie, comme le demande la spec : tête, torse, bassin, bras, avant-bras, mains, cuisses,
  jambes, pieds.
  - Chaque calque est un `mesh` pondéré **sur son os et sur l'os parent dans la bande d'articulation**. Le calque déborde
    sous son voisin (recouvrement d'environ 1,5 × la bande), si bien que le coude **plie** au lieu de pivoter. C'est la
    correction directe du « Lego ».
  - Les pièces sans déformation (yeux de rechange, accessoires) restent des `region`.
- **Image unique** : un maillage pour le corps, puis un **découpage automatique** en sous-maillages par groupe d'étiquette
  (bras G, bras D, jambes, tête) dès qu'un groupe peut croiser le corps (Q2 : retournements à l'aisselle).
  - Chaque sous-maillage reçoit son propre slot et son z.
  - Le torse caché sous le bras est complété une fois (G6 de la note 01). Tant que ce n'est pas fait, le bras est
    **contraint** à ne pas quitter sa zone d'origine (limites d'angle plus serrées).

### G2. Ordre d'évaluation pur (repris de Spine, DragonBones et Rive, rendu pur)

```
evaluate(rig, pose, phys, t):
  L = pose.local                                   // déjà mélangé par PoseBlend (G10)
  W = fk(rig.bones, L)                             // monde_j = monde_parent · local_j (ordre topologique fixe)
  pour ik dans rig.ik (ordre fixe)       : W = twoBone(ik, W)      // G4, FK du MÊME instant comme départ
  pour ch dans rig.chains                : W = fabrik(ch, W)       // départ = FK du même instant
  pour c dans rig.contacts actifs à t    : W = footLock(c, W, t)   // G4
  si phys                                : W = applyPhysics(phys.sample(t), W, rig.physics)   // G9 (pré-cuit)
  W = squashStretch(W, pose.params)                // G8
  K_j = W_j · inverseBind_j                        // 6 flottants par os
  pour chaque slot mesh : v = skinCoR(mesh, K) + Σ correctifs(params, W)                      // G3, G7
  order = stableSort(slots, (z + zOverride(t)), slotIndex)                                   // G9b
  return { world: W, verts, order }
```

Aucune entrée ne vient de l'image précédente. Le scrub et la reprise après erreur sont exacts par construction.

### G3. Skinning CoR-2D (Le & Hodgins 2016 ramené au plan) — défaut ; LBS en secours

- **Import**, seulement pour les sommets à au moins 2 influences et sur les triangles des bandes :
  ```
  w_t = moyenne des poids des 3 sommets du triangle t ; A_t = aire ; c_t = centroïde
  s(w_p, w_t) = Σ_{j≠k} w_pj·w_pk·w_tj·w_tk·exp(−(w_pj·w_tk − w_pk·w_tj)²/σ²),  σ = 0,1
  p*_p = Σ_t s·A_t·c_t / Σ_t s·A_t        (NaN si Σ = 0 → sommet rigide, LBS exact)
  ```
  Mesuré : 0,36 s avec des poids en bandes. Amélioration sur l'article : on restreint le calcul aux triangles qui
  partagent au moins 2 os avec le sommet, grâce à une grille spatiale des triangles de bande.
- **Par image** (B = nombre d'os, V = nombre de sommets) :
  ```
  pour chaque os j : θ_j = atan2(K_j.b, K_j.a) ; h_j = (cos θ_j/2, sin θ_j/2)          // B appels trigonométriques
  pour chaque sommet p :
    h = Σ_j w_pj·σ_j·h_j   (σ_j = signe de ⟨h_j, h_ref⟩, h_ref = os de plus fort poids) ; h /= |h|
    R = h² = (h.x² − h.y², 2·h.x·h.y)                                                    // rotation complexe
    q = Σ_j w_pj·K_j(p*)  ;  t = q − R·p*                                                 // LBS du centre seulement
    v'_p = R·v_p + t
  ```
- **Squash/stretch et étirement d'os** : le CoR est rigide. On décompose `K_j = R_j·S_j` (décomposition polaire 2×2,
  forme close) et on applique d'abord l'étirement mélangé linéairement, `v_s = Σ_j w_pj·S_j·v_p`. Ce mélange est sans
  danger, car les étirements sont proches de l'identité et ne tournent pas. On applique ensuite le CoR. C'est notre
  adaptation, à valider au banc.
- **Pourquoi pas le DCN** : +18 à 28 % d'aire au coude (Q2), soit un boubou ou un bras « gonflé ». Le DCN reste utile
  pour **interpoler deux rigides** (transitions d'accessoires), pas pour le skinning.
- **Seuils de la porte qualité** (G11) : rayon extérieur du coude ≥ 85 % à 120°, aire de bande entre 95 et 115 %.

### G4. IK, IK douce, FABRIK et verrouillage des pieds

```
twoBone(L1, L2, cible, bend, σ, stretch):
  d = |cible − racine| ; L = L1 + L2 ; d_s = (1 − σ)·L
  si d > d_s :  d = L − (L − d_s)·exp(−(d − d_s)/(L − d_s))        // IK douce, C1 en d_s
  si stretch et |cible − racine| > L : échelle = |cible − racine| / d  (appliquée aux 2 os, option « élastique »)
  d = clamp(d, |L1 − L2| + ε, L − ε)
  A = acos((L1² + d² − L2²)/(2·L1·d)) ; C = acos((L1² + L2² − d²)/(2·L1·L2))
  θ1 = atan2(cible − racine) + bend·A ;  θ2 = bend·(C − π)
  mélange FK→IK : θ = θ_FK + mix·wrap(θ_IK − θ_FK)                  // plus court chemin (Rive)
  limites : θ = clamp(θ, min, max) puis re-viser l'os terminal si nécessaire
```
- **Pointer, accuser** : contrainte de visée de la main, avec un coude libre (bend fixé par le personnage).
  `softness = 0,05`. Mesuré : 0,32° de saut au lieu de 4,77°.
- **Pieds** : fenêtres de contact dans la timeline (début et fin en images). Pendant un contact, `pied_monde` est figé à
  sa position au début du contact. Fondus d'entrée et de sortie sur 3 images (Hermite). Si la cible est hors de portée,
  la hanche descend de `max(0, d − 0,98·L)`. La racine se déplace d'après le pied d'appui (note 01, G3).
- **FABRIK** pour la colonne (hanches → tête, 3–4 os), les doigts et les chaînes de queue pilotées : départ = FK du même
  instant, `maxIter = 10`, `tol = 0,1 px`. Mesuré : 6,3 itérations, moins de 5 µs.

### G5. Maillage depuis le masque (import, Node)

```
masque α ≥ 0,5 → suivi de Moore → Douglas-Peucker (ε = 1,0–1,2 px) → rééchantillonnage
pas(x) = 8 px si dist(x, articulation) < 1,5·bande, 8 px autour des yeux et de la bouche, 16–20 px ailleurs
points intérieurs : réseau triangulaire au même pas, gardés si distance au bord > 0,6·pas
Delaunay (Bowyer-Watson, notre code) → récupération des arêtes de contour (flips) → filtre :
  garder t si centroïde ∈ masque ET les 3 milieux d'arêtes ∈ masque ; retirer |aire| < 1e-3
raffinement : insérer le circumcentre des triangles d'angle < 20° (hors bord)
étiquettes : label(v) = argmin_j d(v, os_j)/r_j  (r_j = rayon dessiné ; pour les planches : calque ou peinture)
```
Mesuré sans la récupération d'arêtes : environ 100 ms, 2 923 triangles, p5 de l'angle = 35°. Critères d'acceptation :
**0 segment de contour manquant**, aucun triangle sous 15°.

### G6. Poids « parties + bandes harmoniques » (notre méthode ; BBW en option)

```
fixé(v) = label(v) si  min_{articulations a de label(v)} |v − a| > BANDE  (26 px au banc ; ~0,6 × rayon du membre)
résoudre pour chaque os j :  L_ff·w_j,f = −L_fc·w_j,c   avec L = D − A, A_uv = 1/|u − v| > 0   (CG Jacobi)
garder les 4 plus forts, renormaliser ; lisser 1 passe dans la bande si besoin (moyenne pondérée par A)
```
- Garanties : `0 ≤ w ≤ 1` et `Σw = 1` par principe du maximum (mesuré : 6·10⁻⁹). Fuite bras → torse mesurée à 0,00 %,
  contre 17,4 % en harmonique global et 68,7 % en euclidien. Coût : 81 ms à l'import.
- Améliorations sur Pinocchio (bone heat, notre `boneHeat.ts`) et sur les poids euclidiens d'Animated Drawings :
  l'étiquette de partie **interdit** le passage par l'aisselle. La bande donne une largeur de pli **contrôlée par
  l'artiste**, par articulation : plus large au ventre, plus étroite au poignet.
- Option qualité hors ligne : BBW (`min Σ_j w_jᵀ·L·M⁻¹·L·w_j`, bornes 0–1) en Python (scipy ou osqp), seulement si la
  porte qualité échoue sur une planche réelle.

### G7. Correctifs pilotés par paramètre (« smart bones » de Moho et formes clés de Live2D) — anti-« Lego »

- Un `ParamDef` est piloté soit par la timeline (lacet de tête, respiration, intensité d'émotion), soit par **l'angle
  d'un os** (`driver`). Ses formes clés sont des décalages de sommets **dans le repère de l'os dominant**, comme les FFD
  de DragonBones. Ils restent donc solidaires du membre.
  ```
  u = clamp((θ_os − from)/(to − from), 0, 1)        // ou valeur du paramètre
  Δv = interp_multilinéaire(keys, u, …)  (Hermite sur chaque axe, pour être C1, pas linéaire)
  v_final = skin(v + Δv)                            // appliqué AVANT le skinning, dans le repère de repos
  ```
- Correctifs par défaut, générés automatiquement à l'import puis retouchables :
  - **coude et genou à 90° et à 140°** : on gonfle l'extérieur et on creuse l'intérieur pour que le contour reste
    continu ;
  - **épaule levée** : la clavicule remonte et le col du boubou se plisse ;
  - **ventre** : respiration.

  On les obtient en lançant une passe ARAP (note 01, G2) sur la pose extrême, puis en stockant `Δv = ARAP − CoR`.
  Ensuite, à l'exécution, l'ARAP n'est plus nécessaire : on garde la vitesse du CoR et la qualité de l'ARAP aux poses
  clés.
- **Tête de trois quarts** : les formes clés ellipsoïdales de la note 01 (G7) se branchent ici, comme paramètres.

### G8. Squash & stretch (rig pur)

```
axe u (unitaire), pivot c (point de contact ou centre de masse), facteur s > 0 :
  S = R(φ)·diag(s, 1/s)·R(−φ)    // aire 2D conservée : s·(1/s) = 1
  v' = c + S·(v − c)

pilotes :
  impact (au contact)   s(τ) = 1 − A·e^{−ζωτ}·cos(ω_d·τ),  A ≈ 0,15–0,25, ζ ≈ 0,35, ω ≈ 2π·3 Hz
  vitesse verticale     s = 1 + k·clamp(v_y/v_ref, −1, 1),  k ≈ 0,08
  anticipation          s < 1 sur 3–6 images avant un saut ou un « choc » (courbe de la timeline)
```
Le squash s'applique au **niveau racine** (personnage entier) ou par os (tête, ventre). C'est un paramètre analytique du
temps : pur, sans état.

### G9. Physique secondaire XPBD pré-cuite + ordre de dessin animé

- **Chaînes** : foulard ou gélé (8–10 particules), ourlet de boubou (5–7 os répartis sur la largeur, chacun en
  pendule), boucles d'oreilles, **ventre** (un os `belly` avec une particule rappelée vers sa pose animée).
  ```
  par sous-pas (Δt = 1/480 s) :
    v_i = (x_i − x_i^prev)·(1 − damping) ; x_i^prev = x_i ; x_i += v_i + Δt²·(g + wind)·w_i
    x_0 = ancre(t)                                 // pose animée pure, échantillonnée au sous-pas
    distance (α = 0) :  C = |x_j − x_i| − ℓ
    flexion / rappel (α = 1/strength) : α̃ = α/Δt² ; Δλ = (−C − α̃·λ)/(w_i + w_j + α̃) ; λ += Δλ
                                       x_i −= w_i·Δλ·n ; x_j += w_j·Δλ·n
  sortie : angle de l'os k = atan2(x_{k+1} − x_k) − angle animé  →  piste mélangée par mix
  ```
  Opérations limitées à `+ − × ÷ √`, cuisson dans Node, piste indexée par le hachage du plan. Mesuré : 34–48 µs par
  image et deux passes identiques.
- **Ordre de dessin (G9b)** : z de base par slot, plus des **événements de z** dans la timeline, comme le `SLOT_Z_INDEX`
  de DragonBones (par exemple « bras D devant le ventre » pendant un geste). Tri stable par (z, index du slot), pour
  éviter tout scintillement à égalité. Les échanges automatiques par profondeur, avec hystérésis et fondu de
  recouvrement, sont ceux de la note 01 (G4).

### G10. Mélange de couches (`PoseBlend`) — repris de DragonBones, rendu C1

- Couches de priorité décroissante, par exemple :
  1. réaction ou choc ;
  2. geste du bras ;
  3. regard et tête ;
  4. locomotion ou posture ;
  5. respiration (additive).

  Pour **chaque os**, le poids restant `r` part de 1. Chaque couche prend `w_eff = w·fade(t)·r`, puis `r −= w_eff`. Les
  couches additives (respiration, tremblement de rire) s'ajoutent en local **après** le mélange : `θ += w·Δθ_add`.
- **Fondus C1** au lieu des fondus linéaires de DragonBones : `fade(u) = 3u² − 2u³`, avec `u = (t − t0)/durée`. Les angles
  sont mélangés sur le plus court chemin, avec `wrap` dans ]−π, π]. Les masques d'os par couche (le geste ne touche que
  l'épaule, le bras et la main) évitent qu'un geste « tire » la colonne.

### G11. Tests de la porte qualité issus de ce banc (`AnimationQualityGate`)

| Test | Seuil | Mesuré au banc |
|---|---|---|
| Partition de l'unité des poids | \|Σw − 1\| ≤ 10⁻⁶, w ∈ [0, 1] | 6·10⁻⁹ ; [−2·10⁻¹⁰, 1] |
| Fuite d'influence entre parties non adjacentes | ≤ 1 % | 0,00–0,45 % (parties + bandes) |
| Segments de contour présents dans le maillage | 100 % | 93 % (récupération d'arêtes à écrire) |
| Triangles retournés par slot, aux poses extrêmes déclarées | 0 (hors slot de recouvrement déclaré) | 24–36 à l'aisselle d'un maillage unique → sous-maillages obligatoires |
| Rayon extérieur coude ou genou à 120° | ≥ 85 % | LBS 50 %, CoR 88 % |
| Aire de la bande d'articulation | 95–115 % | CoR 106,6 % ; DCN 127,6 % |
| Saut d'angle IK par pas de 0,3 px près de l'extension | ≤ 0,5° | dure 4,77° ; douce 0,32° |
| Reproductibilité de la physique | empreintes identiques sur 2 cuissons | identiques |
| Scrub : image jouée = image sautée | 0 px | vrai par construction (G2) ; à tester sur le pilote |

### Ce que nous NE prenons pas
- **Runtimes Spine** (licence d'éditeur par utilisateur) et **SDK Live2D** (contrats propriétaires) : concepts seulement.
- **Triangle de Shewchuk** : distribution commerciale seulement par accord direct avec l'auteur.
- **Code Synfig** (GPL-3.0) : rien à en tirer sur les mathématiques, la page étant un brouillon.
- **DCN ou DQS comme skinning par défaut** : gonflement mesuré.
- **LBS au-delà de 60°** : effondrement mesuré.
- **Poids euclidiens ou harmoniques globaux** : fuites mesurées de 69 % et 17 %.
- **Fondus linéaires** ; **physique simulée pendant la lecture**, qui dépend du chemin parcouru ; **IK démarrée depuis
  l'image précédente**.
