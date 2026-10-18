# REA — outils gratuits à greffer au moteur Blender pour reconstituer 041701 : personnage peint découpé et riggé, mouvement tiré de la vidéo, bouches, ombres, rendu CPU, mise en page TikTok

Date : 18/10/2026. Piste « REA Blender » : ce qu'il faut prendre sur Internet pour faire, dans Blender 4.5.14 LTS sans
écran ni GPU, une reconstitution de 041701 qui garde le **dessin peint** (pas l'aspect « lego » de la tentative en
volumes 3D) et un **jeu ample** (pas le mouvement trop faible de la tentative précédente).

Conventions de source :
- **[mesure]** : mesuré dans ce conteneur (4 vCPU, sans GPU, Blender 4.5.14 LTS en `-b`). Les scripts sont dans le
  scratchpad, dossier `rea-blender/` (non versionnés) ; les images dérivées de la référence privée y restent et ne
  sont ni versionnées ni envoyées nulle part.
- **[code lu]** : dépôt cloné en profondeur 1 dans `scratchpad/sources/blender/`, lu pour apprendre. **Rien n'est
  copié** dans le dépôt : la règle du projet (THIRD_PARTY_NOTICES du moteur fluide) n'admet que des licences
  permissives, et les idées sont réécrites.
- **[web]** : page consultée le 18/10/2026, lien en fin de section.
- **[notes]** : notes 00 à 14 de ce dossier.

Commits lus :

| Dépôt | Commit (date) | Licence lue dans le dépôt |
|---|---|---|
| Aodaruma/coa_tools2 | `a7f2634` (24/06/2026) | GPL-3.0-or-later (manifeste 2.2.1, Blender ≥ 4.2) |
| cgtinker/BlendArMocap | `ecb4c91` (19/04/2024) | GPL-3.0, projet déclaré « Discontinued » |
| pKrime/Expy-Kit | `3c4d5d7` (17/12/2025) | GPL-3.0 |
| Rokoko/rokoko-studio-live-blender | `b031e5a` (11/09/2025) | LGPL-3.0 |
| scaredyfish/blender-rhubarb-lipsync | `b6631c7` (22/09/2023) | aucun fichier de licence |
| Premik/blender_rhubarb_lipsync_ng | `4828303` (18/07/2026) | **MIT** (manifeste 1.8.1, Blender ≥ 3.3) |
| stuffmatic/fSpy-Blender | `eec40b0` (04/05/2022) | GPL-3.0 |
| EatTheFuture/camera_shakify | `a59d9f9` (07/02/2026) | code GPL-3.0, **données de secousse CC0** (manifeste 0.5.1, Blender ≥ 4.4) |
| shteeve3d/blender-wiggle-2 | `02c4f0f` (18/04/2024) | GPL-3.0 |
| artellblender/springbones | `77ee0fb` (30/03/2026) | aucun fichier de licence |
| ahujasid/blender-mcp | `7a0373e` (06/10/2026) | MIT |
| davidpagnon/Sports2D | `0cc325a` (06/10/2026) | **BSD-3-Clause** |

---

## Réponse courte : classement « à greffer maintenant »

Le bon geste n'est pas d'installer des add-ons. Il faut **réécrire en `bpy` les quatre ou cinq astuces** qui font le
travail. Elles tiennent chacune en quelques dizaines de lignes, et nos POC les ont validées en headless. Les add-ons
eux-mêmes sont soit GPL (lisibles, pas copiables chez nous), soit abandonnés, soit dépendants de l'interface ou de
gestionnaires d'images désactivés au rendu.

| Rang | À greffer | Source de l'idée (licence) | Ce qu'on prend | Preuve |
|---|---|---|---|---|
| **1** | **Personnage en pièces** : bras, jambes, tronc+tête ; une **grille dense** tirée de l'alpha par pièce ; **poids par chaleur restreints** aux os de la pièce ; **ordre z** par décalage en profondeur | COA Tools 2 (GPL-3, lu) + Armature/chaleur intégrées à Blender | os ramenés dans le plan du maillage avant `parent_set('ARMATURE_AUTO')`, `use_deform` coupé sur les autres os | [mesure] 5 pièces maillées en 0,34 s, pesées en 0,12 s, 0 sommet sans poids ; bras levé de 110° **sans déchirure**, alors que la pièce unique se déchire |
| **2** | **Réglages Cycles « peinture exacte »** : émission + transparence, transformée **Standard**, débruitage **coupé**, rebonds 0, 2 à 4 échantillons, 4 threads, petit capteur d'ombre, rendu de la **bande 1080×860 seulement** | Blender intégré | valeurs exactes en §6 | [mesure] **0,8 à 1,2 s par image** au lieu de 20 à 28 s avec les réglages par défaut ; fidélité des couleurs 0,16/255 (Standard) contre 7,4/255 (AgX par défaut) |
| **3** | **Vidéo → angles 2D → os** : RTMW (déjà chez nous) image par image, angles de segments dans le plan image, Hampel puis Butterworth sans déphasage, seuil de confiance, bornes articulaires ; écriture des courbes par `foreach_set` | Sports2D (BSD-3, lu) pour les filtres ; BlendArMocap (GPL-3, lu) pour le motif « repères → rotations sans saut » | une seule fonction `appliquer_angles()` sert aussi au BVH et au moteur fluide | [mesure] sur 041701 : bras 90 à 150° d'amplitude, tronc ±20°, bassin 44 à 72 px ; 0,19 s par personnage et par image |
| **4** | **Bouches par atlas** (`Mapping.location` animé en `CONSTANT`) pilotées par **Rhubarb 1.14 en reconnaisseur phonétique** + règles de nettoyage de Rhubarb Lipsync NG | Rhubarb (MIT) ; Rhubarb Lipsync NG (MIT, lu) | coupe des repères trop longs, prolongation des repères plus courts qu'une image, fusion des silences doubles | [mesure] l'atlas animé change bien de case à chaque image en rendu headless |
| **5** | **Mise en page TikTok par ffmpeg** : bande à y = 530, fond = bande agrandie ×2,23 et floutée | ffmpeg (déjà là) | un seul graphe de filtres | [mesure] 300 images composées et encodées en 15,3 s ; visuellement conforme à la référence |
| **6** | **Mouvement secondaire par nos ressorts analytiques** portés en Python, appliqués **après coup** aux os secondaires : ourlet de robe, vrilles, ventre, bouteilles | `moteur-fluide/src/noyau/ressorts.ts` (notre code) ; Wiggle 2 (GPL-3, lu) écarté | ζ < 1 pour le dépassement, r < 0 pour l'anticipation | Wiggle 2 se coupe pendant le rendu (`is_rendering`) et doit être cuit pas à pas ; nos ressorts sont déterministes |
| **7** | **Sol et ombres** : caméra calée par l'horizon (pieds + tailles des personnages), capteur d'ombre limité au sol sous les pieds, soleil d'angle 0 à 2° | notre `ground.horizon_fit` [notes 00/05] ; fSpy (GPL-3) lu, sans plus | ombres de contact, sans bruit à 2 à 4 échantillons | [mesure] ombre nette à 4 échantillons ; un soleil de 6° fait du bruit sans débruitage |
| **8** | **Outils intégrés d'appoint** : Import Images as Planes pour les accessoires et le décor, Lattice pour l'écrasement-étirement, NLA pour les actions en couches, clés de forme pour le ventre qui respire | Blender 4.5 | `image.import_as_mesh_planes(shader='SHADELESS'/'EMISSION')` | [mesure] l'opérateur tourne en headless (plan de 4 sommets) |

**Plus tard** (utile mais pas pour 041701, dont la caméra est fixe) : déplacement d'un plan de décor par une profondeur
Depth Anything V2 **Small** (Apache-2.0) pour les mouvements de caméra ; données CC0 de Camera Shakify pour la caméra
à l'épaule ; COA Tools 2 installé **dans l'interface** pour que le propriétaire retouche un rig à la main ; outil de
reciblage de Rokoko (LGPL-3) si un jour on vise un rig 3D.

**Écartés** : BlendArMocap (abandonné, installe MediaPipe dans le Python de Blender), Wiggle 2 et Spring Bones
(gestionnaires d'images coupés au rendu ; Spring Bones n'a pas de licence), l'add-on Rhubarb de scaredyfish (cassé
depuis Blender 3.2, sans licence), l'importeur Papagayo (ancien ; Rhubarb suffit), Blender MCP (pont vers l'interface,
télémétrie anonyme active par défaut), Expy Kit (conversion de rigs 3D), tracé Grease Pencil (perd la peinture), tissu
et corps mous sur un maillage plat (plis hors du plan), EEVEE (environ 150 s par image sur CPU [notes 00]), débruitage
OIDN et données persistantes (coûteux ou sans gain, mesuré ci-dessous).

---

## 1. Animer un personnage peint en 2D/2,5D dans Blender, sans perdre la peinture

### Takeaway
Un personnage peint s'anime dans Blender comme dans un logiciel de découpage : **une grille dense par pièce**, posée
dans le plan de l'image, texturée par le dessin en **émission** et **pesée par la chaleur sur les seuls os de sa
pièce**. Les pièces se superposent par de petits décalages en profondeur.

Le maillage d'un seul tenant est la cause directe de l'effet « déchiré ». Mesuré ici :
- en une seule pièce, lever le bras étire des toiles de peau entre bras et tronc ;
- en cinq pièces, le même geste est propre.

La seule vraie difficulté n'est pas dans Blender : c'est le **trou du tronc** derrière le bras. Il faut donc demander à
la fabrique de personnages une **planche de rig en pose A**, bras écartés du corps. Le remplissage OpenCV suffit alors
pour les coutures.

### Cited Findings
**COA Tools 2 : maillage automatique tiré de l'alpha** [code lu, `operators/automesh.py`]
- Les étapes :
  1. `cv2.findContours` sur l'alpha seuillé à 127, après réduction ×0,25 et marge de 50 px ;
  2. relaxation et rééchantillonnage régulier du contour (`relax_closed_loop`, `space_closed_loop`) ;
  3. remplissage par `bmesh.ops.triangle_fill(use_beauty=True)`.
- Il n'y a **aucun sommet intérieur** : le maillage ne contient que les points du contour. COA ajoute ensuite des
  sommets à la main, dans `edit_mesh.py` (`subdivide_edges`, `beautify_fill`).
- L'opérateur exige `cv2` et `numpy` dans le Python de Blender. En l'absence d'interface, il se contente d'un
  avertissement (`has_interactive_ui`).

**COA Tools 2 : poids par chaleur sur un maillage plat** [code lu, `functions.py` l. 255-290]
- Avant `bpy.ops.object.parent_set(type="ARMATURE_AUTO")` :
  - les os sélectionnés sont **ramenés à y = 0** (tête et queue) ;
  - les autres os reçoivent `use_deform = False` ;
  - l'objet est décalé de `location[1] = 0.00001`.
- Après le calcul, tout est remis en place. C'est l'astuce qui rend la chaleur fiable sur un maillage plat :
  - os et maillage sont dans le même plan ;
  - les poids sont **restreints** aux os choisis.

**COA Tools 2 : changement de dessin (« slots »)** [code lu, `__init__.py` l. 468-474, `functions.py` l. 1017-1050]
- Le changement de maillage se fait dans des gestionnaires `frame_change_post` et `depsgraph_update_post`.
- C'est fragile en rendu par lots. On lui préfère un **atlas** animé dans le shader (§3).

**COA Tools 2 : compatibilité** [code lu]
- Manifeste : `blender_version_min = "4.2.0"`, licence `GPL-3.0-or-later`.
- Le README annonce « tested with Blender 5.1 ».
- Les exportateurs Photoshop, GIMP et Krita produisent un JSON de sprites que l'add-on importe.
- Source : [coa_tools2](https://github.com/Aodaruma/coa_tools2)

**Outils intégrés à Blender 4.5** [mesure, `probe.py`]
- Opérateurs présents : `image.import_as_mesh_planes` (Images as Planes, désormais intégré),
  `grease_pencil.trace_image`, `object.parent_set`, `nla.bake`, `import_anim.bvh`.
- Add-ons livrés : `rigify`, `io_anim_bvh`, `pose_library`, `node_wrangler`.
- Modificateurs disponibles : `MESH_DEFORM`, `SURFACE_DEFORM`, `LAPLACIANDEFORM`, `LATTICE`, `CORRECTIVE_SMOOTH`,
  `DISPLACE`, `CLOTH`, `SOFT_BODY`, `NODES`, `GREASE_PENCIL_ARMATURE`.
- `image.import_as_mesh_planes` tourne en headless :
  - options de shader `PRINCIPLED` / `SHADELESS` / `EMISSION` ;
  - `use_auto_refresh` pour les séquences d'images ;
  - résultat : un plan de **4 sommets**, donc bon pour un accessoire ou une couche de décor, pas pour un corps qui se
    plie.

**POC 1 — une seule pièce** [mesure, `poc_decoupe.py`, personnage « modou » 576×1024 détouré ISNet, repères RTMW]
- Grille de 6 px tirée de l'alpha : **4 599 sommets, 4 296 faces, en 0,17 s**.
- 17 os posés sur les repères (bassin, colonne, poitrine, cou, tête, et bras/avant-bras/main/cuisse/jambe/pied de
  chaque côté).
- Chaleur en headless : **0,14 s**, 17 groupes, **0 sommet sans poids**.
- Visuel : au repos, le dessin est rendu à l'identique. Bras levé : des **toiles** de peau tirées entre bras et tronc
  (`scratchpad/rea-blender/zoom_poses.png`).

**POC 2 — cinq pièces** [mesure, `decouper_pieces.py` puis `poc_pieces.py`]
- Découpe automatique dans le venv (OpenCV) :
  - chaque pixel opaque va à la pièce de plus petite distance normalisée à sa chaîne d'os (capsule) ;
  - rayons : bras 4 %, jambes 5 %, tronc 11 % de la hauteur ;
  - les jambes ne montent pas au-dessus des hanches ;
  - les îlots isolés sont rattachés au membre voisin ;
  - couture élargie de 2 px ;
  - remplissage (`cv2.inpaint`, Telea) des pixels de membres à moins de 1 % de hauteur du tronc.
- Pièces obtenues : bras 9 529 et 9 685 px, jambes 21 685 et 21 633 px, tronc 53 882 px, trou rebouché 2 624 px.
- Dans Blender (grille de 5 px) :
  - maillages en **0,34 s** : tronc 2 910 sommets, bras 765 et 775, jambes 1 355 et 1 334 ;
  - chaleur **restreinte** aux os de chaque pièce en **0,115 s**, **0 sommet sans poids** ;
  - ordre z : bras à −4 mm (devant), jambes à +3 mm (derrière).
- Visuel :
  - bras droit levé de 110° et avant-bras gauche ramené sur le ventre, **sans déchirure** ;
  - l'avant-bras passe proprement devant le tee-shirt ;
  - défauts restants : deux bouts de doigts attribués aux jambes (îlots) et une petite encoche à l'épaule (couture) ;
  - fichier : `scratchpad/rea-blender/zoom_pieces.png`.
- Une première version remplissait le trou du tronc jusqu'à son enveloppe convexe. Elle peignait des **fantômes de
  bras** couleur peau le long du tee-shirt. D'où la limite à 1 % : le remplissage ne fait que raccorder la couture, il
  ne reconstruit pas le corps.

**Grease Pencil v3, tissu, corps mous** [mesure + inférence]
- `grease_pencil.trace_image` existe en 4.5, mais il vectorise des **traits**. C'est hors sujet pour une peinture.
- Tissu et corps mous ne savent pas qu'un maillage plat doit rester dans son plan : ils plient hors du plan.

### Inferences
- Pour 041701, chaque personnage (la voisine, le tonton) doit avoir une **planche de rig en pose A**. On l'obtient par
  notre chaîne de création [notes 06], avec les mêmes vêtements et la même palette que dans la vidéo. On la découpe
  ensuite comme ci-dessus.
  - Découper directement une image de la vidéo ne marche pas : main sur la hanche, bouteilles contre le ventre, ce qui
    fait de grands trous à remplir.
- Pièces à prévoir :

| Personnage | Pièces en plus des 5 de base | Raison |
|---|---|---|
| Voisine | avant-bras + main en pièce séparée | la main passe devant puis derrière la hanche |
| Voisine | ourlet de robe en 2 ou 3 os de ressort | mouvement secondaire |
| Voisine | vrilles de cheveux en 1 ou 2 os de ressort | mouvement secondaire |
| Tonton | chaque bouteille, attachée **à l'os de la main** (parent `BONE`, sans poids) | accessoire rigide |
| Tonton | ventre avec un os de ressort ou une clé de forme « respire » | mouvement secondaire |
| Tous | mâchoire et bouche (atlas, §3) | parole |

- Pour l'**ordre z variable** (une main qui passe derrière la hanche), il suffit d'animer `location.y` de la pièce par
  clés `CONSTANT`. Cela ne coûte rien.
- Le remplissage OpenCV (Telea, BSD/Apache) suffit pour des coutures de quelques pixels. Pour un vrai trou, prendre
  LaMa (Apache-2.0), déjà employé par l'ancienne chaîne pour effacer des voitures des décors, en fenêtres de 512×512
  [notes 00]. La meilleure solution reste de ne pas créer le trou : pose A.

---

## 2. De la vidéo au mouvement dans Blender (et BVH, et moteur fluide)

### Takeaway
Pour un rig plat, il ne faut **ni 3D ni reciblage de squelette**. Il faut des **angles de segments dans le plan
image**, filtrés, puis convertis en rotations autour de l'axe de visée.

On ne recopie donc pas les positions des repères, seulement les angles. Ainsi :
- les proportions peintes du personnage restent intactes ;
- l'amplitude du jeu de la référence passe entière.

La même fonction sert à trois sources :
- la vidéo (RTMW) ;
- un BVH projeté (CMU, 100STYLE) ;
- la timeline du moteur fluide.

Sur 041701, RTMW suit bien les membres visibles. Il produit du **bruit franc** sur les membres masqués (avant-bras sur
la hanche) et sur les inversions gauche/droite. Le seuil de confiance et les bornes articulaires sont donc obligatoires.

### Cited Findings
**BlendArMocap** [code lu]
- Chaîne : MediaPipe → objets vides clés image par image (`mp_out_utils.py`, `keyframe_insert` pour chaque repère).
- Calcul de rotations par `vec.to_track_quat` (`cgt_math.rotate_towards`).
- Anti-saut : `try_get_euler` convertit chaque quaternion en Euler **compatible avec l'Euler précédent**.
- Transfert vers Rigify par contraintes et pilotes (`cgt_drivers.py`).
- Projet « Discontinued ». `bl_info.blender = (3, 0, 0)`. Dépendances `mediapipe>=0.8.10` et `protobuf==3.20.2`,
  installées dans le Python de Blender.
- Un ticket MediaPipe rapporte l'échec de ce type d'installation en Blender 4.2 (bac à sable des extensions, sous
  Windows) [web].
- Sources : [BlendArMocap](https://github.com/cgtinker/BlendArMocap) ;
  [mediapipe#5769](https://github.com/google-ai-edge/mediapipe/issues/5769)

**Sports2D** [code lu + web]
- Calcule des angles d'articulations et de segments 2D depuis une vidéo, avec RTMLib (famille RTMPose).
- Réglages par défaut lus dans `Demo/Config_demo.toml` :

| Réglage | Valeur |
|---|---|
| Seuil de confiance par point | 0,3 |
| Remplissage des trous | si plus courts que 100 images, sinon `last_value` |
| Rejet des aberrants | **Hampel**, fenêtre 7 à 30 i/s, 2 écarts robustes |
| Filtre | **Butterworth d'ordre 4 à 6 Hz** sans déphasage (option One-Euro 4 Hz, β = 1,5) |

- Le projet prévient lui-même : résultats valables « only if the persons move in the 2D plane ». C'est exactement notre
  cas, puisque nos personnages sont plats.
- Sources : [Sports2D](https://github.com/davidpagnon/Sports2D) ; [PyPI sports2d](https://pypi.org/project/sports2d)

**Rokoko Studio Live** [code lu]
- Le reciblage (`operators/retargeting.py`) :
  - pose des contraintes `COPY_ROTATION` / `COPY_LOCATION` d'un rig source vers un rig cible ;
  - cuit par `bpy.ops.nla.bake(visual_keying=True)`.
- Les opérateurs `rsl.build_bone_list` et `rsl.retarget_animation` sont enregistrés **même sans connexion**
  (`classes_always_enable`). Seuls les panneaux exigent un compte Rokoko.
- LGPL-3. C'est du reciblage 3D → 3D, inutile pour un rig plat.
- Source : [rokoko-studio-live-blender](https://github.com/Rokoko/rokoko-studio-live-blender)

**Expy Kit** [code lu]
- Outils de conversion de rigs : Rigify vers rig de jeu, extraction de métarig, « Bind to Active Armature »,
  « Bake Constrained Actions ».
- Notes de version 0.6 : « Blender 4.3+ compatibility ». GPL-3. Inutile ici.
- Source : [Expy-Kit](https://github.com/pKrime/Expy-Kit)

**BVH** [mesure]
- `import_anim.bvh` (`io_anim_bvh`) est livré avec Blender 4.5 et tourne en headless.
- Les licences des banques sont déjà tranchées [notes 00, 10] :
  - CMU : « free for all uses », revente des données interdite ;
  - 100STYLE : CC BY 4.0.

**Mesure sur 041701** [mesure, `mocap_ref.py`]
- Protocole : RTMW-x 384×288 sur la bande de scène, 2 boîtes fixes (caméra fixe), une image sur deux (15 i/s).
  - 330 inférences à **0,186 s** chacune (3 threads) ;
  - angles de segments déroulés (`np.unwrap`) ;
  - Hampel (7 ; 2σ) puis Butterworth (4 ; 6 Hz ; `filtfilt`) ;
  - mêmes réglages que Sports2D.
- **Fin de scène** : le score moyen du corps passe de 4,7 à 0,6 entre les images 300 et 302 (10,07 s). La carte de
  fin dure donc environ **2,2 s**, pas 1,3 s.
- Amplitudes p5→p95, membres bien vus :

| Personnage | Segment | Amplitude | Gigue filtrée (°/image²) |
|---|---|---|---|
| Voisine | bras droit | 92° | 3,8 |
| Voisine | avant-bras droit | 115° | 4,1 |
| Voisine | cuisses et jambes | 7 à 15° | |
| Voisine | inclinaison du tronc | −6 à +22° | |
| Tonton | bras gauche | 117° | |
| Tonton | avant-bras gauche | 109° | |
| Tonton | bras droit | 118° | |
| Tonton | avant-bras droit | 153° | |
| Tonton | jambes | 16 à 22° | |
| Tonton | inclinaison du tronc | −18 à +24° | |

- Déplacement du bassin dans une bande de 860 px : voisine 44×50 px, tonton 68×72 px.
- **Pistes fausses** :
  - avant-bras gauche de la voisine (main sur la hanche, masqué) : score médian 2,1, amplitude absurde de 242° ;
  - cuisse droite du tonton : 311°, inversion gauche/droite probable malgré un score de 4,5.
- Une première passe sans couper la carte de fin donnait des amplitudes de 300 à 390° et un bassin qui « bougeait » de
  400 px. Il faut **couper la carte de fin** avant tout filtrage.

### Inferences
- **Cible de jeu pour le tonton et la voisine** : bras de 90 à 150°, tronc de ±20°, bassin de 5 à 8 % de la hauteur de
  la bande. C'est la réponse chiffrée au « mouvement trop faible » : la reconstitution doit atteindre ces amplitudes,
  à vérifier avec `blender/outils/mesures.py`.
- Les pistes masquées ne se réparent pas par filtrage. Règle :
  1. score sous 3 (échelle SimCC de RTMW) ou angle hors bornes : on **garde la pose clé** du plan (« main sur la
     hanche ») ;
  2. les inversions gauche/droite se détectent par un saut de plus de 90° d'une image à l'autre sur une paire
     symétrique.
- Le motif BlendArMocap (vides clés puis contraintes) est inutilement lent pour nous : un `keyframe_insert` par repère
  et par image. Écrire directement les courbes de rotation des os :
  `fcurve.keyframe_points.add(n)` puis `foreach_set("co", ...)`.

---

## 3. Lèvres : Rhubarb, Papagayo, clés de forme, atlas

### Takeaway
Rhubarb 1.14 est déjà dans le scratchpad (`bench-voix/rhubarb/`), sous MIT, et nos notes 04 et 12 en ont tiré les
règles. Il reste à le brancher sur une **bouche en atlas**, c'est-à-dire une image qui contient les 8 à 9 formes A à
H et X. On choisit la case en animant la position d'un nœud Mapping, avec des clés `CONSTANT`.

Le procédé est mesuré : il est sûr en headless, et n'utilise ni gestionnaire d'images ni bibliothèque de poses.

Rhubarb Lipsync NG (MIT, Blender 4.2+ en extension) fournit trois règles de nettoyage utiles à réécrire.

### Cited Findings
**Add-on Rhubarb de scaredyfish** [code lu]
- Le README dit : « does not work on Blender 3.2 and above ».
- Il s'appuie sur l'ancien `pose_library` (`context.object.pose_library.mouth_shapes`), supprimé depuis.
- Ligne de commande utilisée : `-f json --machineReadable --extendedShapes GHX -r <recognizer>`.
- Il « tient » une forme 4 images avant la suivante (`hold_frame_threshold = 4`).
- Aucun fichier de licence dans le dépôt.
- Source : [blender-rhubarb-lipsync](https://github.com/scaredyfish/blender-rhubarb-lipsync)

**Rhubarb Lipsync NG** [code lu]
- Licence **MIT**. Manifeste 1.8.1, `blender_version_min = "3.3.0"`. S'installe comme extension en 4.2+.
- Propose le reconnaisseur `phonetic` : « language-independent. Use it if your recordings are not in English ».
- Cuit chaque repère en bandes NLA d'actions, sur deux pistes alternées.
- `optimize_cues` (`rhubarb/cue_processor.py`) applique trois règles :
  1. `trim_long_cues` : coupe les repères plus longs que 0,2 s et ajoute un X ;
  2. `ensure_frame_intersection` : prolonge jusqu'à l'image la plus proche un repère qui ne couvre aucune image ;
  3. `merge_double_x` : fusionne deux silences consécutifs.
- `action_support.ensure_action_fcurves(action, slot_name, ...)` gère les « slots » d'actions de Blender 4.4+.
- Source : [blender_rhubarb_lipsync_ng](https://github.com/Premik/blender_rhubarb_lipsync_ng)

**Papagayo-NG** [web]
- Le seul importeur Blender connu (« Lipsync Importer & Blinker ») date de Blender 2.5 à 2.8.
- Le format Moho est trivial, mais Rhubarb le rend inutile.
- Source : [papagayo-ng](https://github.com/morevnaproject-org/papagayo-ng)

**Atlas animé** [mesure, `test_atlas.py`]
- Montage : atlas de 8 cases, `ShaderNodeMapping` (échelle x = 1/8) et clés `CONSTANT` sur `inputs["Location"]`.
- Rendu Cycles headless de 3 images, cases 0, 3 et 7 : pixels (0, 255, 128), (109, 146, 128) et (255, 0, 128),
  comme attendu.
- Les courbes sont accessibles en 4.5 par `node_tree.animation_data.action.fcurves`. Cette API héritée disparaît en
  Blender 5.0 : passer par les slots, comme le fait Rhubarb NG, si on monte de version.

### Inferences
- **Bouche de chaque personnage** :
  1. un petit plan maillé sur la tête, parenté à l'os `head` (ou `jaw`), placé devant le visage à −1 mm ;
  2. son atlas est peint dans le style du personnage (fabrique, notes 06 et 13) ;
  3. la mâchoire peut en plus s'ouvrir d'un petit angle sur les voyelles ouvertes (A et D), comme dans le moteur
     fluide.
- **Source des repères** :
  - pour une reconstitution : Rhubarb phonétique sur la piste audio de 041701, segmentée par locuteur à la main
    (2 voix, 10 s) ;
  - pour nos sketchs : directement les visèmes du TTS [notes 04, 12].
- Clignements : même mécanisme sur un atlas d'yeux.

---

## 4. Caméra et décor : fSpy, profondeur, capteur d'ombre, Camera Shakify

### Takeaway
041701 a une **caméra fixe**. Pour la reconstituer, il faut seulement :
- un **plan de sol** qui corresponde au sol peint, pour que les ombres tombent juste ;
- un **capteur d'ombre** limité à ce sol.

Le décor lui-même reste l'image peinte, composée derrière (ou plaque d'émission). Il n'a pas à être en relief.

Le calage par l'horizon, calculé à partir des pieds et des tailles des deux personnages, suffit. fSpy sert pour des
décors à fuyantes fortes, mais son importeur n'est plus fiable en 4.x. La profondeur Depth Anything V2 Small ne devient
utile qu'avec un mouvement de caméra.

### Cited Findings
**fSpy-Blender** [code lu + web]
- Version 1.0.3, `bl_info.blender = (2, 80, 0)`, dernier commit en mai 2022, GPL-3.
- Un fil BlenderArtists sur 4.2.2 LTS note que beaucoup d'utilisateurs se plaignent qu'il ne marche plus. Le projet
  paraît abandonné.
- L'application fSpy elle-même est une interface graphique, inutilisable en lot.
- Alternatives payantes et GPL : Perspective Plotter (extension 3.0 → 5.2, 18 $), Blenspy.
- Sources : [fSpy-Blender](https://github.com/stuffmatic/fSpy-Blender) ;
  [BlenderArtists 4.2.2](https://blenderartists.org/t/install-fspy-on-blender-4-2-2-lts/1561632) ;
  [Perspective Plotter](https://superhivemarket.com/products/perspective-plotter)

**Capteur d'ombre** [mesure, POC 1 et 2]
- Montage : `obj.is_shadow_catcher = True` + `film_transparent = True` + composition sur le décor.
- Le personnage plat en émission projette bien sa **silhouette** au sol, grâce à la transparence du mélange.
- Un sol de 30 m et un soleil d'angle 6° donnent une ombre **bruitée** sans débruitage. Ramené à la zone des pieds
  (2,4 × 1,6 m), avec un soleil à 0°, l'ombre est nette dès 2 à 4 échantillons et le rendu baisse nettement (§6).

**Camera Shakify** [code lu]
- Versions 0.5.x pour Blender ≥ 4.4 (manifeste).
- Mécanisme : contrainte `ACTION` sur un objet de secousse, dont le temps est piloté par une expression, puis
  `COPY_LOCATION` / `COPY_ROTATION` vers la caméra.
- Les 9 secousses de `shake_data.py` (« Investigation », « The Closeup », « Handycam Run »…) sont des enregistrements
  réels **sous CC0**. On peut reprendre ces nombres tels quels, comme clés de caméra.
- Le code est GPL-3.
- Source : [camera_shakify](https://github.com/EatTheFuture/camera_shakify)

**Depth Anything V2 Small** [notes 05, 13]
- Apache-2.0 ; les versions Base et Large sont CC-BY-NC.
- ONNX déjà présent : `scratchpad/veille2/eclairage/dl/dav2/model.onnx`.
- **1,13 s** pour une image 518×518 (onnxruntime, 2 threads).
- Script existant : `scratchpad/repo/workbench/scripts/depth_onnx.py`.

### Inferences
- **Sol de 041701** : estimer l'horizon et la hauteur d'œil avec l'ancien `ground.horizon_fit` (taille apparente
  proportionnelle à la distance des pieds à l'horizon). Puis poser la caméra Blender, de focale quelconque, avec le
  même horizon.
  - Un écart résiduel ne se voit que sur l'ombre. On le règle à l'œil par l'angle du soleil, puisque l'ombre de
    référence tombe vers l'avant droit.
- **Profondeur** : à réserver aux plans à caméra mobile. Le décor déplacé (`DISPLACE` sur une grille subdivisée) donne
  alors la parallaxe, avec les limites de déchirure mesurées dans la note 05.

---

## 5. Mouvement secondaire : tissu, corps mous, ressorts d'os, pilotes

### Takeaway
Les add-ons de ressorts d'os simulent **pendant la lecture**, dans des gestionnaires `frame_change`. Ces gestionnaires
se coupent pendant le rendu ; il faut donc les cuire pas à pas avant. Wiggle 2 a de plus des soucis de cuisson
rapportés en 4.5.

Nous avons déjà mieux : les **ressorts analytiques** du moteur fluide, qui sont des fonctions pures du temps sans
dérive. Une fois portés en Python, on les applique **après** l'animation primaire, aux angles des os secondaires, et on
écrit le résultat en courbes. C'est déterministe et ne coûte rien au rendu.

### Cited Findings
**Wiggle 2** [code lu]
- Intégration de Verlet :
  - `move` : amortissement `1 − damp·dt`, gravité et vent ;
  - `constrain` : `iterations` passes de contraintes et de ressorts (`stiff`) ;
  - collisions possibles.
- `wiggle_post` sort immédiatement si `scene.wiggle.is_rendering` (activé par `render_pre`). Les écarts d'image de plus
  de 4 sont traités comme un pas d'une image.
- v2.2.4, `bl_info.blender = (3, 0, 0)`.
- [web] Des utilisateurs rapportent que la cuisson échoue en 4.5. Des forks existent sur extensions.blender.org :
  « Wiggle 2: RTX Edition » (4.2+) et « Wiggle Bones » (4.5+).
- Sources : [blender-wiggle-2](https://github.com/shteeve3d/blender-wiggle-2) ;
  [extensions wiggle-2](https://extensions.blender.org/add-ons/wiggle-2/) ;
  [BlenderArtists](https://blenderartists.org/t/wiggle-bones-2/1602337)

**Spring Bones** [code lu]
- README : « very early state, alpha-proof of concept… not production ready ».
- Gestionnaire `frame_change_post`, cuisson par `NLA Bake`.
- Pas de fichier de licence.
- Source : [springbones](https://github.com/artellblender/springbones)

**Ressorts du moteur fluide** [notre code, `moteur-fluide/src/noyau/ressorts.ts`]
- Système `y + k1·y' + k2·y'' = x + k3·x'`, paramétré par :
  - `f` : fréquence ;
  - `ζ` : amortissement (ζ < 1 donne dépassement et retour au calme) ;
  - `r` : réponse initiale (r < 0 donne l'anticipation).
- Résolution en forme fermée, couverte par 443 tests au moment de la pause (`ETAT-VEILLE.md`).

### Inferences
- **Port Python**, prévu en `blender/mouvement/ressorts.py`, en version discrète sur des angles déjà échantillonnés.
  Entrées :
  - pour la robe et les vrilles : l'angle **monde** du parent (bassin pour la robe, tête pour les vrilles) ;
  - pour le ventre et les bouteilles : la vitesse du bassin ou de la main.
- Réglages de départ :

| Os secondaire | f | ζ |
|---|---|---|
| Ourlet de robe | 2,5 Hz | 0,35 |
| Vrilles | 3 Hz | 0,3 |
| Ventre | 2 Hz | 0,5 |
| Bouteille (rotation propre) | 4 Hz | 0,4 |

- Les **pilotes** Blender à expression Python non « simple » restent bloqués tant que l'exécution automatique des
  scripts n'est pas autorisée (option `-y` en ligne de commande). Ils ralentissent aussi l'évaluation. Ne pas en
  dépendre : tout cuire en courbes.

---

## 6. Rendu Cycles CPU pour ce contenu, et mise en page TikTok

### Takeaway
Les **réglages d'usine de Blender 4.5 sont faits pour la 3D réaliste**. Ils coûtent ici ×20 en temps et altèrent la
peinture.

Une fois corrigés (débruitage coupé, transformée Standard, rebonds 0, 2 à 4 échantillons, capteur d'ombre limité, bande
seule), Cycles rend une image 1080×860 de la scène en **0,8 à 1,2 s**. Cela fait **4 à 6 min pour les 302 images** de la
scène de 041701.

Workbench (sans ombres) marche aussi en headless, malgré des messages EGL, entre 0,57 et 1,0 s par image. Il sert
d'aperçu.

La mise en page TikTok se fait en ffmpeg, pas dans le compositeur.

### Cited Findings
**Valeurs d'usine** [mesure, `--factory-startup`]

| Réglage | Valeur d'usine |
|---|---|
| `use_denoising` | `True` (OIDN) |
| `samples` | 4096 |
| Échantillonnage adaptatif | oui, seuil 0,01 |
| `max_bounces` | 12 |
| `transparent_max_bounces` | 8 |
| `film_transparent` | `False` |
| Transformée de vue | **`AgX`** |
| Anticrénelage Workbench | 8 |

**Fidélité des couleurs** [mesure]
- Écart moyen du décor rendu au décor source, hors personnage :
  - transformée **Standard** : **0,16/255** (p99 : 1,0) ;
  - **AgX** : **7,38/255** (p99 : **48**).
- AgX change donc visiblement une peinture : il faut mettre `view_transform = 'Standard'`, `look = 'None'`.

**Temps de rendu, bande 1080×860** [mesure]

| Configuration | Temps par image |
|---|---|
| POC 1, gros sol, 3 threads, interpolation Cubic : 1 / 4 / 16 échantillons | 1,17 / 2,60 / 8,62 s |
| POC 1, 16 échantillons **+ OIDN** | **20,23 s** (le débruitage seul coûte environ 11,6 s) |
| POC 1, 540×430, 8 échantillons | 1,30 s |
| POC 1, compositeur coupé | 2,53 s (au lieu de 2,60 : coût négligeable) |
| POC 2 lancé sans couper le débruitage par défaut | 18,9 à 28,2 s |
| POC 2, débruitage coupé, petit capteur, interpolation Linear, 4 échantillons, 3 threads | 0,96 à 1,24 s |
| POC 2, idem, 2 échantillons | **0,81 s** |
| POC 2, idem, 4 échantillons, 4 threads | **0,89 s** |
| POC 2, idem, 4 échantillons, rendu limité à 30 % × 75 % du cadre | 0,53 s |

- Données persistantes, animation de 6 images : 13,20 s sans, 12,28 s avec, soit environ −7 %. Négligeable, car le
  maillage déformé est réévalué à chaque image de toute façon.

**Workbench** [mesure]
- Réglages : `light = 'FLAT'`, `color_type = 'TEXTURE'`. Le rendu se fait malgré les messages
  « EGL Error (0x3009) », aussi bien avec `blender` qu'avec `blender-softwaregl`.
- Temps par image : 0,57 s (AA coupé), 0,68 (AA 5), 1,02 (AA 8), 1,68 (AA 16).
- Image identique au dessin. Pas de capteur d'ombre : il apparaît comme un plan blanc, à masquer.

**Mise en page** [mesure]
- La bande nette de 041701 occupe les lignes **530 à 1390** (1080×860), mesurées sur l'énergie du gradient par ligne.
- Le fond est la même bande agrandie à 1920 de haut (×2,23), centrée et floutée.
- Graphe ffmpeg, 300 images composées et encodées en x264 `veryfast` CRF 18 en **15,3 s** :
  `[0]crop=1080:860:0:530,split[b][f];[f]scale=-2:1920,crop=1080:1920,boxblur=20:2[fond];[fond][b]overlay=0:530`
- Rendu visuellement conforme à la référence (`scratchpad/rea-blender/layout_cmp.png`).

### Inferences
- **Réglages à figer**, dans `blender/rendu/reglages.py` :
  - `engine = 'CYCLES'`, `device = 'CPU'`, `threads_mode = 'FIXED'`, `threads = 4` ;
  - `samples = 4`, `use_adaptive_sampling = False`, `use_denoising = False` ;
  - `max_bounces = 0`, `transparent_max_bounces = 4`, caustiques coupées ;
  - `film_transparent = True`, `view_transform = 'Standard'`, `look = 'None'` ;
  - textures en `Linear` ;
  - capteur d'ombre aux dimensions du sol utile ;
  - soleil d'angle 0 à 2° ;
  - résolution **1080×860** (la bande seule) ;
  - fond composé dans le compositeur (Image → Scale `RENDER_SIZE`/`CROP` → Alpha Over), ou dans ffmpeg.
- Il est inutile de rendre 1080×1920 : la bande seule représente 45 % des pixels, et le fond flou se calcule en ffmpeg.
- **Région de rendu** : pour des retouches locales (une bouche), limiter le rendu au rectangle utile (0,5 s par image).

---

## 7. Automatisation : bpy headless et Blender MCP

### Takeaway
Tout se pilote par `blender -b --factory-startup --python script.py -- args`. Toutes les étapes ont tourné ainsi :
- `mode_set('EDIT')` pour créer les os ;
- `parent_set('ARMATURE_AUTO')` avec sélection et objet actif posés dans le `view_layer` ;
- le compositeur ;
- les rendus d'images fixes et d'animations.

Blender MCP est un pont vers une **interface ouverte** : un socket dans l'add-on et un serveur MCP. Il n'apporte rien à
un lot sans écran.

### Cited Findings
**Blender MCP** [code lu]
- Licence MIT. `bl_info.blender = (3, 0, 0)`, version 1.8.
- Ses conditions (`TERMS_AND_CONDITIONS.md`, août 2026) décrivent la collecte de données :
  - la collecte de contenus (prompts, code, captures) est en opt-in ;
  - mais un « minimal anonymous usage record » est envoyé par défaut (identifiant d'installation, nom d'outil, versions,
    OS), sauf si `DISABLE_TELEMETRY=true`.
- Source : [blender-mcp](https://github.com/ahujasid/blender-mcp)

**Licence Blender** [web]
- « What you create with Blender is your sole property ». Les vidéos produites ne sont donc pas concernées par la GPL.
- En revanche, les scripts qui utilisent l'API Python, « if published », doivent l'être sous une licence compatible GPL.
- Source : [blender.org/about/license](https://www.blender.org/about/license/)

**Pièges headless relevés** [mesure]
- Débruitage et AgX actifs par défaut (§6).
- Les add-ons à gestionnaires d'images (COA « slots », Wiggle 2, Spring Bones) ne s'exécutent pas, ou se coupent,
  pendant le rendu : il faut tout cuire avant.
- Les messages EGL de Workbench sont sans conséquence. EEVEE, lui, est inutilisable sur CPU [notes 00].

### Inferences
- Nos scripts `bpy` restent internes, donc rien à faire pour la licence. S'ils étaient un jour publiés, ce serait sous
  une licence compatible GPL. Les vidéos restent la propriété du créateur.

---

## Étapes d'intégration exactes

Ces étapes sont pensées pour le dossier versionné `studio-troupe/blender/`, qui contient déjà `outils/mesures.py`. Les
fichiers marqués POC existent dans le scratchpad (`rea-blender/`). Ils sont écrits ici, sans code tiers, et peuvent
servir de point de départ.

1. **Planches de rig (données privées)** : pour la voisine et le tonton, générer une planche **en pose A**, avec les
   bras écartés du corps et les bouteilles à part. Fond neutre, 576×1024 ou plus.
   - Détourage : ISNet-anime (`scratchpad/modeles/vision/isnet-anime.onnx`).
   - Repères : RTMW (`bench-perso/scripts/reperes.py`).
   - Les PNG vont dans `.private/references/041701/rig/`.
2. **`blender/rig/pieces.py`** (venv, OpenCV), à partir du POC `decouper_pieces.py`.
   - Entrée : RGBA + repères. Sortie : `piece_<nom>.png` + `pieces.json` (os de chaque pièce, ordre z).
   - Corrections à faire : îlots rattachés **au bras le plus proche** (le POC envoyait des bouts de doigts aux jambes) ;
     pièces supplémentaires (avant-bras+main, ourlet, vrilles) ; couture à 1 % de hauteur ; LaMa pour un trou de plus
     de 2 % de la pièce.
   - Commande : `venv/bin/python -I pieces.py <rgba> <kp.json> <sortie>`.
3. **`blender/rig/construire.py`** (bpy), à partir du POC `poc_pieces.py`.
   - Une grille de 5 px par pièce, avec UV par `foreach_set`.
   - Matériau Émission + Transparent mélangés par l'alpha.
   - Squelette de 17 os (+ os secondaires) placé sur les repères.
   - Pour chaque pièce : `use_deform` limité à ses os, pièce ramenée à `y = 1e-5`, puis `parent_set('ARMATURE_AUTO')`.
   - Contrôle : **0 sommet sans poids**.
   - Ordre z : bras −4 mm, jambes +3 mm. Bouteilles en parent `BONE`. Plan de bouche en atlas sur `head`.
   - Enregistre `rig_<perso>.blend` dans `sorties/041701/`.
4. **`blender/mouvement/angles2d.py`** (venv), à partir du POC `mocap_ref.py`.
   - RTMW sur la bande (y = 530, h = 860), images 0 à 301 seulement.
   - Boîtes par personnage, suivies d'image en image.
   - Angles de segments → `np.unwrap` → Hampel (7 ; 2σ) → Butterworth (4 ; 6 Hz ; `filtfilt`).
   - Seuil : score SimCC < 3, angle hors bornes ou saut > 90° (inversion G/D) → pose clé du plan.
   - Sortie : `angles_<perso>.json`, qui contient pour chaque image l'angle monde par os et la position du bassin en px.
   - Les BVH (projetés dans le plan caméra) et le moteur fluide (export de sa timeline) écrivent **le même format**.
5. **`blender/mouvement/appliquer.py`** (bpy).
   - Rotation locale de chaque os :
     `q = q_reposᴮ⁻¹ · R_Y(φ) · q_reposᴮ`, avec `φ = −[(α_os − α_os⁰) − (α_parent − α_parent⁰)]`.
     Ici α est l'angle dans le plan caméra (x à droite, z en haut, sens trigonométrique), et α⁰ l'angle au repos de la
     planche.
     - Vérifié dans le POC : un φ positif lève vers l'extérieur le bras situé à gauche de l'image.
   - Racine : le bassin suit la position mesurée, mise à l'échelle de la planche.
   - Écriture par `keyframe_points.add(n)` + `foreach_set("co")`, interpolation `LINEAR`.
   - Option **exagération** ×1,1 à 1,3 sur les écarts au repos, pour viser les amplitudes mesurées (§2).
6. **`blender/mouvement/ressorts.py`** : port Python de `ressorts.ts`, appliqué aux os secondaires après l'étape 5
   (réglages au §5), écrit en courbes.
7. **`blender/visage/bouche.py`**.
   - Commande : `rhubarb -f json --machineReadable --extendedShapes GHX -r phonetic <wav>`, sur chaque segment de
     locuteur.
   - Nettoyage : coupe des repères > 0,2 s, prolongation d'un repère qui ne couvre aucune image, fusion des X doubles.
   - Clés `CONSTANT` sur `Mapping.location.x` de l'atlas. Clignements sur l'atlas des yeux.
8. **`blender/rendu/reglages.py`** et **`blender/rendu/scene_041701.py`**.
   - Réglages du §6. Caméra calée par l'horizon. Capteur d'ombre aux pieds.
   - Décor 041701 : plaque nette sans personnages, obtenue par remplissage LaMa sur une image de la bande.
   - Rendu : `blender -b scene.blend -E CYCLES -a` vers `sorties/041701/rendu/####.png`. Option `--apercu` en Workbench
     pour un contrôle rapide.
9. **`blender/rendu/mise_en_page.py`** (ffmpeg).
   - Le graphe du §6 sur les PNG rendus.
   - Ajout de la carte de fin : environ 2,2 s, à partir de l'image 302.
   - Son de la référence pour la comparaison privée uniquement ; notre voix pour une publication.
   - H.264 1080×1920 30 i/s, AAC 44,1 kHz.
10. **Contrôle** : `blender/outils/mesures.py` sur la sortie et sur la référence. Les amplitudes d'angles se mesurent
    avec la même chaîne que l'étape 4 appliquée au rendu. Porte : amplitudes ≥ 80 % de celles de la référence, aucune
    déchirure (contrôle visuel des pièces aux poses extrêmes), couleurs Standard.

Coût attendu par personnage :
- découpe : moins de 1 s ;
- construction du rig : moins de 1 s ;
- mouvement : RTMW en 0,19 s par image et par personnage, soit environ 2 min pour 302 images × 2.

Rendu : 302 images × environ 1 s, soit environ 5 min. Mise en page : environ 15 s.

---

## Tableau de synthèse par outil

| Outil | Licence | Blender 4.5 | Sans écran | Ce qu'on prend |
|---|---|---|---|---|
| COA Tools 2 | GPL-3.0+ | oui (≥ 4.2, testé en 5.1) | partiel (dépend de cv2, gestionnaires) | idées : maillage par contour, chaleur avec os à plat et `use_deform` restreint ; réécrit |
| Grease Pencil v3 (intégré) | GPL (Blender) | oui | oui | rien pour la peinture (tracé = traits) |
| Import Images as Planes (intégré) | GPL (Blender) | oui (`image.import_as_mesh_planes`) | oui [mesure] | plans d'accessoires et de décor, séquences |
| Maillage depuis l'alpha + Armature + chaleur (intégrés) | GPL (Blender) | oui | oui [mesure] | **cœur du rig** (rang 1) |
| Mesh Deform / Lattice (intégrés) | GPL (Blender) | oui | oui | Lattice pour l'écrasement-étirement ; Mesh Deform inutile (liaison lente, pas nécessaire) |
| BlendArMocap | GPL-3.0 | non garanti (3.0, abandonné) | non (MediaPipe dans Blender) | idée : rotations sans saut ; réécrit sur RTMW |
| Sports2D | BSD-3 | hors Blender | oui | réglages Hampel + Butterworth 6 Hz, seuils de confiance |
| Import BVH (intégré) | GPL (Blender) | oui | oui | sources de mouvements projetées en angles 2D |
| Expy Kit | GPL-3.0 | oui (0.6 : 4.3+) | oui | rien (rigs 3D) |
| Rokoko Studio Live | LGPL-3.0 | oui (1.4.2 sans maximum) | opérateurs oui, panneaux derrière un compte | rien pour 041701 (3D → 3D) |
| Rhubarb Lip Sync 1.14 | MIT | hors Blender | oui (déjà dans le scratchpad) | repères de bouche, reconnaisseur phonétique |
| Rhubarb Lipsync NG | MIT | oui (extension 4.2+) | non nécessaire | règles de nettoyage des repères, gestion des slots |
| Rhubarb (scaredyfish) | aucune | non (≤ 3.1) | — | rien |
| Papagayo-NG + importeur | GPL | importeur 2.5 à 2.8 | — | rien |
| fSpy + fSpy-Blender | GPL-3.0 | douteux (2022, plaintes en 4.2) | non (application graphique) | idée seulement ; calage par l'horizon à la place |
| Depth Anything V2 Small | Apache-2.0 | hors Blender | oui (1,13 s par image) | plus tard : décor déplacé pour caméra mobile |
| Capteur d'ombre Cycles (intégré) | GPL (Blender) | oui | oui [mesure] | ombres de contact (rang 7) |
| Camera Shakify | code GPL-3.0, données CC0 | oui (0.5.x ≥ 4.4) | oui | plus tard : données CC0 en clés de caméra |
| Tissu / corps mous (intégrés) | GPL (Blender) | oui | oui | rien (plis hors du plan) |
| Wiggle 2 | GPL-3.0 | cuisson signalée cassée en 4.5 | non au rendu (`is_rendering`) | idée Verlet ; nos ressorts à la place |
| Spring Bones | aucune | non garanti | non au rendu | rien |
| Pilotes (intégrés) | GPL (Blender) | oui | oui, si les scripts sont autorisés | éviter, tout cuire |
| Cycles CPU (intégré) | GPL (Blender) | oui | oui [mesure] | réglages du §6 (rang 2) |
| Workbench (intégré) | GPL (Blender) | oui | oui malgré les messages EGL [mesure] | aperçu rapide sans ombres |
| Compositeur / VSE | GPL (Blender) | oui | compositeur oui [mesure] | Alpha Over du décor ; mise en page en ffmpeg |
| Blender MCP | MIT | oui (≥ 3.0) | non (pont vers l'interface) | rien |

---

## Fichiers produits par cette piste (scratchpad, non versionnés)

- `rea-blender/probe.py` : opérateurs, add-ons et modificateurs disponibles.
- `rea-blender/poc_decoupe.py` : pièce unique, poids par chaleur, rendus et temps.
- `rea-blender/decouper_pieces.py` : découpe en pièces et remplissage.
- `rea-blender/poc_pieces.py` : rig en 5 pièces, poses, variantes de rendu.
- `rea-blender/test_atlas.py` : bouche en atlas animé.
- `rea-blender/mocap_ref.py` : RTMW sur la bande de 041701, angles et filtres. Les sorties `mocap_ref_valide.json` et
  `mocap_ref_brut.npz` contiennent des nombres seulement.
- `rea-blender/wb.py`, `wb2.py`, `iap.py` : Workbench, Images as Planes.
- Images de contrôle : `zoom_poses.png` (pièce unique, déchirure), `zoom_pieces.png` et `wb_zoom.png` (5 pièces),
  `pieces_viz.png`, `layout_cmp.png`. Elles sont dérivées de la référence privée : rester dans le scratchpad.
- Clones : `scratchpad/sources/blender/` (12 dépôts listés en tête).
