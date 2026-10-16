# 14 — Runtimes squelettiques 2D (DragonBones, Rive, Godot) et systèmes d'animation (Spine, Live2D, Moho, Unity) : ce qui manque à notre moteur, et les composants à agréger

Piste « squelettes » de la veille 2 (« moteur puissant d'animation agrégé »). Rédigé le 16/10/2026. Cette note **ne
répète pas** les notes 02 (runtimes de rig, skinning CoR, IK douce, XPBD), 03 (couches, masques, inertialisation) et
09 (Animated Drawings lu ligne à ligne). Elle descend dans le **code** des trois runtimes libres pour en tirer ce qui
manque encore à `moteur-fluide`, le **mesure sur MODOU**, et fixe le modèle de données et l'ordre d'évaluation des
composants à agréger, compatibles avec notre `evaluer(projet, t)` pur.

Conventions (les mêmes que les notes 06, 07 et 12) :
- **[code lu]** : code tiers lu pour apprendre, **rien n'est copié** dans le dépôt. **[source]** : document lu, lien
  donné. **[mesure]** : mesure faite dans ce conteneur le 16/10/2026 (4 vCPU Xeon 2,1 GHz, sans GPU). Le processeur était
  **partagé** avec d'autres bancs (charge moyenne 7 à 10) : les temps sont des **majorants**.
- `S` = `/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad`.
  - Sources : `S/sources/veille2/squelettes/` (Godot en clone superficiel et partiel ; DragonBones et Rive sont des liens
    vers les clones de la note 02, même commit).
  - Bancs (notre code TypeScript, lancé par `tsx` depuis `studio-troupe/moteur-fluide`, un seul fil) :
    `S/bench_squelettes/bench_contraintes.ts`, `bench_poids.ts`, `bench_tete.ts`, `debug_ik.ts`, `debug_bras.ts` ;
    sorties `*.out.txt` ; planche `S/bench_squelettes/planche_tete_lacet_tangage.png`.
- Personnage des bancs : **MODOU de test** (`assets-test/modou-test/`, dessiné en code, versable au dépôt) : 18 os,
  2 957 sommets, 4 955 triangles, peau CoR.

| Dépôt | Commit lu | Licence (fichier lu) | Fichiers lus |
|---|---|---|---|
| DragonBones/DragonBonesJS | `64b6c69` (24/05/2025) | MIT | `armature/Constraint.ts`, `animation/{AnimationState,Animation,TimelineState,BaseTimelineState}.ts`, `core/DragonBones.ts` |
| rive-app/rive-runtime (C++) | `5e3de38` (16/10/2026) | MIT | `src/constraints/*`, `src/animation/{blend_*,state_*,linear_animation_instance,keyed_property,elastic_ease}.cpp`, `src/{joystick,solo,transform_component}.cpp`, `src/bones/skin.cpp`, `src/shapes/mesh.cpp` |
| godotengine/godot | `4d10419` (15/10/2026) | MIT (`LICENSE.txt` : « Permission is hereby granted, free of charge… ») | `scene/2d/{skeleton_2d,polygon_2d}`, `scene/resources/2d/skeleton/*` (pile de modifications 2D), `scene/animation/*` (mixer, arbre, espaces de mélange, machine à états), `scene/3d/*modifier*`, `*ik*`, `spring_bone*`, `scene/resources/animation.cpp` |

Concepts seulement (documentation, **aucun code**) : Spine 4.3 (runtimes sous licence par utilisateur d'éditeur),
Live2D Cubism (SDK propriétaire), Moho (logiciel commercial), Unity Animation Rigging et Mecanim (paquet sous *Unity
Companion License*, utilisable seulement avec le moteur Unity —
[texte de la licence](https://unity.com/legal/licenses/unity-companion-license)).

---

## En une page

1. **Le trou principal de notre moteur n'est pas le mélange, c'est l'après-mélange.** Les trois runtimes appliquent
   des **contraintes en espace monde après le mélange des animations** (IK, transformation, distance, chemin, visée),
   chacune avec une force mélangée. Chez nous, `appliquerIK` existe mais **n'est appelée nulle part dans la chaîne** : la
   pose sort des couches et des ressorts, puis la page fait FK + peau. La seule IK active est celle, analytique, codée
   **dans** la recette `marcher`. [mesure] Sur MODOU, une posture d'émotion (bassin qui roule de 6°, buste de 9°) fait
   **glisser les pieds de 86 px** ; avec un verrou de pied (IK dure + bassin abaissé), on obtient **0 px**, pour
   **55 à 81 µs** par image et par personnage, et une évaluation **pure** (même empreinte dans un ordre aléatoire).
2. **Deux défauts d'IK trouvés en mesurant**, chacun corrigé par une règle lue dans un runtime :
   - **Limites et enroulement des angles.** Une solution à −180° est bornée à −69° alors qu'elle vaut +180°, à 2° de la
     borne 178° : jusqu'à **350 px** d'écart main/cible, sur **150 images sur 1 800**. Rive ramène l'angle « dans le
     tour centré sur les limites » avant de borner. Avec ce recentrage : **0 image** au-delà de 5 px, **4,1 px** au pire.
     Le même défaut guette `limiterDoux` dans la FK.
   - **IK douce et pose de repos.** Les jambes de MODOU sont tendues au repos (d/L = 0,99998). Avec 5 % de douceur, le
     pied ne retrouve **jamais** sa position de repos : **8,9 px** d'écart, mesure qui colle à la formule. Il faut une
     douceur mesurée **depuis la distance de repos**, ou un genou pré-fléchi.
3. **Deuxième trou : les déformations de maillage pilotées par paramètre.** C'est Live2D (formes clés en grille + *blend
   shapes* additives), les clés de déformation de DragonBones et de Rive, les *sliders* de Spine 4.3, le *joystick* de
   Rive et les *smart bones* de Moho. `Pose.parametres` est déclaré dans `types.ts` (l. 251) mais **jamais lu**.
   [mesure] Sur la grille de poids 3×3 (lacet × tangage), quatre méthodes ont une **cassure de pente** :
   - la grille multilinéaire de Live2D ;
   - le barycentrique sur Delaunay de Godot ;
   - les bandes de gradient d'Unity ;
   - le barycentrique sur 5 points en croix.

   Leur pic de dérivée seconde va de 1 160 à 3 360 fois la médiane. La **grille de Hermite à tangentes de
   Catmull-Rom** reste C1 (3,3 fois), donne l'erreur la plus faible (0,17) et coûte autant.
4. **Tête pseudo-3D générée automatiquement** (l'équivalent de « Auto generation of facial motion » de Live2D). La
   formule de la note 01 (G7) a été mesurée puis corrigée :
   - ellipse calée du sommet du crâne au **menton** ;
   - masque par le poids de l'os `tete` ;
   - contour fixe ;
   - profil **paraboloïde** au lieu de la racine d'ellipsoïde.

   [mesure] Résultat : **0 triangle retourné** sur une grille 21×21 de lacet ±24° × tangage ±17°. Le rapport d'aire
   reste dans [0,55 ; 1,50], le décalage maximal est de 33 px, pour **8 à 14 µs** par évaluation. Avec la racine
   d'ellipsoïde : 43 à 110 triangles retournés, et un cou cassé.
5. **À agréger maintenant**, par ordre :
   1. pile de contraintes post-mélange (verrou de pied et bassin, IK de main avec cible et force C1, transfert de
      propriétés façon Spine 4.3 / Godot `ConvertTransformModifier3D`, visée à limite amortie de Godot) ;
   2. les deux correctifs d'IK ;
   3. paramètres et formes clés (grille C1 + formes additives + générateur de tête) ;
   4. marqueurs d'animation vers bruitages et caméra ;
   5. racine des cycles en forme close, avec la greffe mocap.

   **À ne pas prendre** :
   - une machine à états exécutée image par image ;
   - les ressorts « jiggle » à état de Godot 2D ;
   - le limiteur de vitesse angulaire à état ;
   - les espaces de mélange triangulés.

   Le tableau classé est à la fin.

---

## Q1 — Que fait déjà notre moteur, et que lui manque-t-il face aux runtimes ?

### Takeaway
Notre chaîne a déjà les mêmes briques que les runtimes, et parfois de meilleures : écarts au repos, couches, masques
graduels, priorités, ressorts analytiques, peau CoR, pendules analytiques, ordre de dessin animé. En revanche, elle
**s'arrête à la pose locale**. Elle n'a **ni étage de contraintes** après le mélange, **ni paramètres de déformation**
(formes clés), **ni marqueurs** d'animation hors clignements et saccades, **ni racine** pour des clips cycliques.

### Cited Findings
- [code lu, notre dépôt] **Chaîne actuelle.**
  - `fournisseurPose → compilerAnimation(ctx).pose(tJeu)` assemble les couches, les ressorts et les signaux directs
    (`src/anim/couches.ts`), puis renvoie une `Pose`.
  - La page fait `calculerFK` puis `deformerSommets` (`src/rendu/personnageRendu.ts`, l. 153-154), et ajoute le champ du
    visage par la partie linéaire de la matrice de la tête.
- [code lu, notre dépôt] **`appliquerIK`** (`src/rig/ik.ts`, l. 135) sait : force (mélange par l'arc le plus court),
  douceur, limites, orientation imposée de l'effecteur. Mais `grep` ne trouve **aucun appel** dans `anim/`, `timeline/`
  ou `rendu/`. La recette `marcher` (`src/anim/actions.ts`, l. 1686) résout ses jambes par sa propre IK analytique
  (`ikJambe`), calculée **avant** les autres couches : un buste ou un bassin animé par une autre couche n'est pas
  compensé.
- [code lu, notre dépôt] **Paramètres sans lecteur.** `Pose.parametres?: Record<string, number>` porte le commentaire
  « Paramètres continus du rig (correctifs, formes clés) » (`src/timeline/types.ts`, l. 251). Aucun module ne le lit.
- [code lu, notre dépôt] **Événements.** En plus des courbes et des signaux directs, `Contribution` ne porte comme
  événements que `ordres`, `clignements`, `saccades` et `regard` (`src/anim/actions.ts`, l. 108-115). Les sons viennent
  uniquement de la piste `sons` du projet.
- [code lu, notre dépôt] **Limites.** `limiterDoux(rot, min, max)` est appliqué tel quel à la rotation locale
  (`src/rig/fk.ts`, l. 114). Dans l'IK, la solution est ramenée dans ]−π, π] par `enrouler` puis bornée
  (`src/rig/ik.ts`, l. 179 et 188).

### Inferences
- Les runtimes évaluent tous : **animation → mélange → FK → contraintes → peau → ordre de dessin**. Notre moteur saute
  l'étape « contraintes ». Elle est pourtant ce qui rend un personnage **ancré** : pieds collés au sol, mains qui
  atteignent l'objet, épaule qui suit le bras. C'est un défaut que l'œil voit tout de suite, au-delà de la fluidité des
  courbes.
- Notre modèle « écarts au repos additionnés » est **celui de Godot 4** (`interpolate_via_rest`, Q4) et il est
  commutatif en 2D. Il n'y a rien à changer au mélange, seulement à ajouter après lui.

### Gaps
- Le pilote dans les vrais décors n'a pas été mesuré ici. Le glissement de 86 px vient d'une pose synthétique : une
  posture d'émotion plus un bassin qui roule.

---

## Q2 — Contraintes : comment les runtimes les écrivent, dans quel ordre, et que mesure-t-on sur MODOU ?

### Takeaway
- **Rive** applique les contraintes d'un composant **juste après** avoir composé sa matrice monde, et **avant** ses
  enfants. Un tri de dépendances garantit que la cible est résolue d'abord. Chaque contrainte interpole « source →
  cible » avec une `strength`, dans l'espace **décomposé** : angle par l'arc le plus court, échelles, cisaillement.
- **Godot 2D** empile des « modifications » qui écrivent un *local pose override* pondéré par la force de la pile.
- **Godot 3D** (4.5-4.6) offre la famille la plus riche, chacune lue dans le code :
  - visée à limite **amortie** ;
  - transfert d'une propriété vers une autre ;
  - IK à pôle ;
  - IK itératives avec option « déterministe » ;
  - ressorts façon VRM avec collisions.
- **Spine 4.3** a refondu sa contrainte de transformation dans le même sens : une propriété en pilote une autre, avec
  bornage.

Sur MODOU, une pile verrou de pied + IK de main + transfert coûte **55 à 81 µs** par image. Le glissement passe de
**86 px à 0 px**, et la chaîne reste **pure**.

### Cited Findings
**Rive (MIT), [code lu]**
- Ordre : `TransformComponent::updateWorldTransform()` fait `composeWorldTransform(); updateConstraints();`, et
  `updateConstraints` appelle `constraint->constrain(this)` pour chaque contrainte, dans l'ordre de la liste —
  [transform_component.cpp](https://github.com/rive-app/rive-runtime/blob/5e3de3857d6ae9e019f94da507f6385b96fbf3c3/src/transform_component.cpp).
  Les enfants composent ensuite **avec la matrice déjà contrainte**.
- Mélange : `constrainWorld` décompose les deux matrices. L'angle passe par l'arc le plus court (`diff` ramené dans
  [−π, π]) ; position, échelles et cisaillement sont interpolés linéairement par `strength` —
  [transform_constraint.cpp l. 61](https://github.com/rive-app/rive-runtime/blob/5e3de3857d6ae9e019f94da507f6385b96fbf3c3/src/constraints/transform_constraint.cpp).
- Limites de rotation : « *Decomposed angles wrap at half a turn, so compare them within the turn centered on the limits
  instead* ». Le code calcule `center = (min+max)/2`, ramène l'angle dans `[center − π, center + π]`, **puis** borne,
  dans l'espace local ou monde selon `minMaxSpace` —
  [rotation_constraint.cpp l. 81](https://github.com/rive-app/rive-runtime/blob/5e3de3857d6ae9e019f94da507f6385b96fbf3c3/src/constraints/rotation_constraint.cpp).
- Contrainte de distance, en trois modes (`Closer`, `Further`, `Exact`) : c'est une « laisse ». La position est ramenée
  sur le cercle de rayon `distance` autour de la cible, puis mélangée par `strength` —
  [distance_constraint.cpp](https://github.com/rive-app/rive-runtime/blob/5e3de3857d6ae9e019f94da507f6385b96fbf3c3/src/constraints/distance_constraint.cpp).
- Les contraintes de translation, de rotation et d'échelle ont `copyFactor`, `offset`, `min/max`, et des espaces
  source et destination (local ou monde) séparés (même dossier). `FollowPathConstraint` place le composant à un
  pourcentage de longueur d'un chemin mesuré, et l'oriente en option selon la tangente.

**DragonBones (MIT), [code lu]**
- `IKConstraint` (deux os, intersection de cercles) a déjà été décrit en note 02.
- `PathConstraint` (l. 230 et suivantes) : modes de position (`Fixed`, `Percent`), d'espacement (`Length`, `Fixed`,
  `Percent`) et de rotation (`Tangent`, `Chain`, `ChainScale`).
  - Il échantillonne des Bézier cubiques par **différences avant**, avec les constantes `0.1875`, `0.09375`, `0.03` et
    `0.006` ([Constraint.ts l. 476](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/DragonBones/src/dragonBones/armature/Constraint.ts)).
  - Ces constantes et cette structure sont **celles de la contrainte de chemin de Spine**. **Inférence** : ce fichier
    dérive du runtime Spine, dont la licence est restrictive. On ne reprend donc que le **concept** et on refait la
    mathématique, c'est-à-dire un paramétrage par longueur d'arc.

**Godot 2D (MIT), [code lu]**
- `Skeleton2D::execute_modifications` (l. 773) exécute la pile. Pour chaque os qui a un *override* :
  `final_trans = cache_transform.interpolate_with(local_pose_override, amount)` —
  [skeleton_2d.cpp](https://github.com/godotengine/godot/blob/4d10419cacd6d3009976e8f9fd3abd970fd58018/scene/2d/skeleton_2d.cpp).
- FABRIK 2D : chaque articulation a un `magnet_position`, **ajouté à chaque passe arrière**. C'est un biais qui choisit
  le côté du pli ; il y a aussi `use_target_rotation` pour l'effecteur —
  [skeleton_modification_2d_fabrik.cpp](https://github.com/godotengine/godot/blob/4d10419cacd6d3009976e8f9fd3abd970fd58018/scene/resources/2d/skeleton/skeleton_modification_2d_fabrik.cpp).
- Jiggle 2D (l. 162-229) : « *Adopted from: https://wiki.unity3d.com/index.php/JiggleBone* ».
  - Le code fait `force = (cible − pos)·stiffness·dt`, `velocity += acc·(1 − damping)`, puis
    `pos += velocity + force`.
  - **Intégration explicite à état**, qui dépend du pas d'image. Les collisions passent par lancer de rayon, et
    seulement en `physics_process` —
    [skeleton_modification_2d_jiggle.cpp](https://github.com/godotengine/godot/blob/4d10419cacd6d3009976e8f9fd3abd970fd58018/scene/resources/2d/skeleton/skeleton_modification_2d_jiggle.cpp).

**Godot 3D (MIT, 4.5-4.6), [code lu]**
- **Visée à limite amortie** (`LookAtModifier3D::remap_damped`, l. 709-733). Sous le seuil d'amortissement, l'angle est
  inchangé. Au-delà, il suit une **B-spline quadratique** de `(seuil, seuil)` vers `(1, 1)` puis `(π/limite, 1)`. C'est
  une saturation douce, C1, qui atteint la limite au demi-tour. Il existe des limites symétriques ou séparées
  (positive et négative).
  - Changement de cible : `init_transition()` part de la **rotation de l'image précédente** (`prev_q`) et interpole sur
    `duration` avec `Tween::run_equation(transition_type, ease_type, …)`. C'est **à état** —
    [look_at_modifier_3d.cpp](https://github.com/godotengine/godot/blob/4d10419cacd6d3009976e8f9fd3abd970fd58018/scene/3d/look_at_modifier_3d.cpp).
- **Transfert de propriété** (`ConvertTransformModifier3D::_process_convert`, l. 405). On lit une composante
  (position, rotation autour d'un axe, ou échelle) d'un os de référence. Puis
  `point = inverse_lerp(ref_min, ref_max, point)`, `point = lerp(app_min, app_max, clamp(point, 0, 1))`, et on l'écrit
  sur un autre os, en mode **additif**, **relatif au repos** ou absolu —
  [convert_transform_modifier_3d.cpp](https://github.com/godotengine/godot/blob/4d10419cacd6d3009976e8f9fd3abd970fd58018/scene/3d/convert_transform_modifier_3d.cpp).
- **IK itératives** (`IterateIK3D`, dont dérivent `CCDIK3D`, `FABRIK3D` et `JacobianIK3D` ; `SplineIK3D` dérive
  directement de `ChainIK3D`).
  - `angular_delta_limit` vaut 2° par défaut. Le commentaire dit : « *If the delta is too large, the results before and
    after iterating can change significantly, and divergence of calculations can easily occur* ».
  - Le drapeau `deterministic` **réinitialise les articulations à chaque image** (`init_joints`, l. 461). Par défaut,
    le solveur repart donc de l'image précédente —
    [iterate_ik_3d.h l. 283-285](https://github.com/godotengine/godot/blob/4d10419cacd6d3009976e8f9fd3abd970fd58018/scene/3d/iterate_ik_3d.h).
- `TwoBoneIK3D` exige une **cible de pôle** : « *TwoBoneIK3D must have a pole target to work* » (l. 204).
- `LimitAngularVelocityModifier3D` (l. 420-426) fait
  `bones[i].second = slerp(prev, dest, MIN(1, max_angular_velocity·dt / diff))`. C'est un filtre **à état**.
- `SpringBoneSimulator3D::_process_joints` (l. 1820 et suivantes) est un ressort VRM en **Verlet** :
  - `next_tail = tail + (tail − prev)·(1 − drag) + rot·forward·stiffness·dt + gravité·dt` ;
  - longueur imposée ;
  - collisions sphère, capsule et plan ;
  - simulation dans le repère d'un **« centre »** (un os ou un nœud), pour que le déplacement global du personnage ne
    fouette pas les chaînes.

**Spine 4.3 (concepts seulement), [source]**
- « *Sliders apply an animation and can control any keyable property […] A slider can optionally be driven by a bone:
  rotation, translation, scale, or shear sets the slider's frame* ».
- Contrainte de transformation refondue : « *You can now map transform properties to different properties. For
  example when you translate a bone, other bones can rotate […] You can "clamp" the constrained bone values […] World
  or local can be chosen separately* ».
- « *Physics and IK constraints now have a volume preserving scaleY setting, where scaleY grows or shrinks opposite to
  scaleX* ».
- Il y a aussi `TrackEntry.mixInterpolation` (fondus non linéaires) et des **dossiers d'ordre de dessin** avec leurs
  propres clés.
- Source : [Spine 4.3 released](https://en.esotericsoftware.com/blog/Spine-4.3-released).

**Unity Animation Rigging (concepts seulement), [source]**
- Douze contraintes, dont Two Bone IK, Multi-Aim, Damped Transform, Twist Correction, Multi-Parent et Override
  Transform —
  [liste](https://docs.unity3d.com/Packages/com.unity.animation.rigging@1.3/manual/ConstraintComponents.html).
- **Twist Correction** prend « *a percentage of a Source object's rotation around a chosen axis* » et la **répartit**
  sur des nœuds —
  [Twist Correction](https://docs.unity3d.com/Packages/com.unity.animation.rigging@1.3/manual/constraints/TwistCorrection.html).
- **Damped Transform** suit une source avec amortissement en position et en rotation —
  [Damped Transform](https://docs.unity3d.com/Packages/com.unity.animation.rigging@1.3/manual/constraints/DampedTransform.html).

**Moho 14 (concepts seulement), [source]**
- La liste des nouveautés cite « *Improved Dynamic Bones and Gravity for Dynamics, along with Delayed Constraints* ». Les
  dynamiques d'os sont des ressorts, avec influences ressort, couple et amortissement exposées au script —
  [Moho 14](https://moho.lostmarble.com/blogs/news/moho-14-what-is-new-tutorials-by-victor-paredes) ;
  [M_Bone](https://mohoscripting.com/classes/m-bone).

**Banc B, [mesure]** (`S/bench_squelettes/bench_contraintes.ts`, sorties `bench_contraintes.out.txt` et
`debug_*.out.txt`)
- Pose « mélangée » synthétique sur 1 800 images à 60 i/s :
  - bassin qui roule de ±6° et descend jusqu'à 18 px ;
  - buste à ±9° ;
  - bras D qui pointe à −70° ±25° ;
  - cuisses à ±4°.
- Pile testée :
  1. transfert « l'épaule monte de 30 % de l'élévation du bras au-delà de 50° », avec un genou quadratique C1 de 10° ;
  2. verrou des deux pieds sur leur position de repos (IK dure, pied gardé à plat) ;
  3. IK du bras D vers une cible mobile.

| Mesure | Résultat |
|---|---|
| FK + peau CoR seules (2 957 sommets) | 126 à 226 µs par image (machine chargée) |
| Contraintes seules (transfert + 2 verrous + 1 IK, `appliquerIK` refait la FK plusieurs fois) | **55 à 81 µs** par image |
| Glissement maximal des pieds sans verrou | **86,1 px** |
| Avec verrou, IK douce 5 % (réglage du rig) | 12,3 px |
| Avec verrou, IK dure | 5,0 px (une jambe hors de portée quand le bassin roule) |
| Avec verrou, IK dure + bassin abaissé (2 passes) | **0 px** |
| Écart main/cible, limites articulaires actives | **jusqu'à 373,8 px** ; 150 images sur 1 800 au-delà de 5 px |
| Écart main/cible, limites coupées | 0,7 px (IK douce du bras à 5 %) |
| Limites actives **recentrées sur leur intervalle** avant bornage (à la Rive) | **0 image au-delà de 5 px, pire écart 4,1 px** |
| Pureté : 240 images évaluées dans l'ordre puis dans un ordre aléatoire | empreintes identiques |

- **Cause de l'échec avec limites** (`debug_bras.ts`). L'IK sans limite donne `brasD = −180°`. L'intervalle du rig est
  [−69°, 178°] : la valeur vaut +180° modulo 2π, à 2° de la borne. Mais `enrouler` la place à −180°, et la borne la
  ramène à −69°.
- **Cause des 8,9 px de la douceur** (`debug_ik.ts`). Distance hanche–cheville au repos 484,10 px, chaîne de 484,11 px.
  La formule de `distanceDouce` donne `484,1 − 24,2·e^{−1} = 475,2` : il manque **8,9 px**, valeur mesurée à l'identique.

### Inferences
- **Ordre retenu.** Les contraintes viennent **après** le mélange et les ressorts, **avant** la peau. Elles sont
  réécrites en rotations locales, pour garder le contrat `Pose` de la page. Les **transferts** (local → local) passent
  d'abord, dans l'ordre topologique de l'os cible. Les **verrous de pieds** suivent, puis les **IK de mains**, puis les
  **visées** (tête et regard). Cet ordre va du plus ancré au plus libre : la main se pose sur un corps déjà stable.
- **Pas de contrainte à état.** Ni le jiggle de Godot 2D, ni le `LimitAngularVelocity`, ni la transition à état du
  LookAt, ni l'IK itérative non déterministe. Notre équivalent pur :
  - la visée change de cible à des **instants connus** de la timeline, et l'on y branche le ressort analytique existant
    (`noyau/ressorts`) ;
  - la vitesse angulaire maximale devient un **test de la porte qualité** plutôt qu'un filtre ;
  - toute IK itérative repart de la FK **du même instant** (le mode `deterministic` de Godot, imposé).
- **Recentrer les limites.** Une limite est un intervalle sur le cercle. Le correctif tient en une ligne :
  `x ← x − 2π·⌊(x − c + π)/2π⌋` avec `c = (min + max)/2`, appliqué **avant** `limiterDoux` et avant le bornage de l'IK.
  C'est exactement la règle de Rive.
- **La douceur part du repos.** La zone douce commence à `max(d_repos, (1 − σ)·L)`. Si `d_repos ≥ (1 − σ)·L`, comme pour
  des jambes tendues, la pose de repos du personnage debout descend le bassin de `κ·L` (κ ≈ 0,5 à 1 %) : genoux
  « déverrouillés ». C'est aussi un principe d'acteur (Disney : jamais de genoux bloqués). La chaîne retrouve alors une
  marge pour la douceur.
- **Bassin abaissé** (note 02, G4). Il est indispensable dès que le bassin tourne : la hanche haute ne peut plus
  atteindre son pied. Deux passes suffisent (mesuré : 0 px).
- **Le transfert de propriétés** (Spine 4.3 / Godot) est le composant le plus « puissant » par ligne de code. Une seule
  table de règles du rig agit sur **toutes** les actions existantes :
  - la clavicule suit l'élévation du bras ;
  - la colonne répartit une torsion du buste sur bassin, torse et cou (Twist Correction d'Unity) ;
  - le bassin descend quand les genoux plient ;
  - les sourcils montent quand la tête se baisse en regardant vers le haut.

  Nous ajoutons au simple `inverse_lerp → lerp` de Godot une **courbe C1** : genou quadratique ou Hermite.

### Gaps
- Le coût est mesuré avec `appliquerIK` tel quel, qui recalcule la FK complète plusieurs fois. Une FK **incrémentale**
  (sous-arbre seulement) diviserait ce coût. Non fait.
- Pas de collision main–corps : une main posée sur le ventre peut traverser. Non mesuré.
- La contrainte de chemin (bras « tuyau d'arrosage », queue, foulard sur trajectoire) n'a pas été prototypée.

---

## Q3 — Déformations pilotées par paramètre : clés de déformation, formes clés, *blend shapes*, curseurs de pose. Quelle interpolation, et que donne une tête pseudo-3D générée sur MODOU ?

### Takeaway
- **Mêmes données partout** : un **décalage par sommet**, appliqué **avant la peau**, pondéré par la valeur d'un
  paramètre ou par une piste.
  - **DragonBones** : `DeformTimelineState`, addition pondérée par `blendWeight`.
  - **Rive** : clés sur les sommets de `Mesh`, avant `Skin::deform`.
  - **Live2D** : formes clés en **grille** sur 1 à 3 paramètres, plus des **blend shapes additives** qui évitent
    l'explosion combinatoire.
- **Spine 4.3 (*sliders*), Rive (`Joystick`) et Moho (*smart bones*)** ajoutent l'idée d'un **curseur** : une valeur, ou
  la propriété d'un os, choisit un **instant** dans une petite animation de poses.
- **Interpolation.** [mesure] La grille multilinéaire, le barycentrique et les bandes de gradient ont tous des cassures
  de pente. La **grille de Hermite (Catmull-Rom)** est C1 et plus exacte, pour le même coût.
- **Tête pseudo-3D.** Générée sur MODOU avec un profil paraboloïde : **0 triangle retourné**, de −24° à +24° de lacet et
  de −17° à +17° de tangage.

### Cited Findings
**Clés de déformation, [code lu]**
- **DragonBones** `DeformTimelineState.blend`. Pour chaque valeur :
  - `result[i] += value·blendWeight` si l'état de mélange est déjà « sale », sinon `result[i] = value·blendWeight` ;
  - les valeurs hors de la plage animée sont lues dans un tableau « même valeur ».

  Les décalages sont ensuite ajoutés **par influence, dans le repère de l'os** (note 02) —
  [TimelineState.ts l. 858-958](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/DragonBones/src/dragonBones/animation/TimelineState.ts).
- **Rive** : `Mesh::update` appelle `skin()->deform(vertices)` sur les sommets du maillage, dont les positions locales
  sont animées par des clés. On déforme donc **après** avoir appliqué les clés de sommets —
  [mesh.cpp](https://github.com/rive-app/rive-runtime/blob/5e3de3857d6ae9e019f94da507f6385b96fbf3c3/src/shapes/mesh.cpp).
- **DragonBones** a aussi des pistes `AnimationProgress`, `AnimationWeight` et `AnimationParameter` : une animation
  pilote la **progression**, le **poids** ou le **paramètre 1D** d'animations enfants (`blendType = E1D`, l. 972) —
  [AnimationState.ts](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/DragonBones/src/dragonBones/animation/AnimationState.ts).
  Rive a l'équivalent avec `NestedRemapAnimation`.

**Curseurs, [code lu] et [source]**
- **Rive** `Joystick::apply` (l. 109) : l'animation X est appliquée à l'instant `((±x) + 1)/2 · durée`, et de même pour
  Y. La valeur x vient d'une entrée, ou de la position d'un composant « poignée » ramenée dans le repère du joystick
  (`handleSource`) —
  [joystick.cpp](https://github.com/rive-app/rive-runtime/blob/5e3de3857d6ae9e019f94da507f6385b96fbf3c3/src/joystick.cpp).
- **Spine 4.3** : un *slider* applique « *a specific frame of an animation* », piloté en option par un os —
  [blog](https://en.esotericsoftware.com/blog/Spine-4.3-released).
- **Moho** : les *Smart Bone Actions* sont des correctifs pilotés par l'angle d'un os (note 02).

**Live2D (concepts), [source]**
- Les **formes clés** sont posées sur des paramètres, avec des clés à −1, 0 et 1. Le guide les appelle « les étapes les
  plus importantes » de la création d'un modèle, et construit les **neuf poses** de l'angle X/Y —
  [Keyforms XY](https://docs.live2d.com/en/cubism-editor-manual/keyform-xydirection/).
- **Coins.** Les formes diagonales sont générées par la commande « Auto Generate 4 Corners », à partir des formes de
  bord autour de la valeur par défaut (ou du centre de la plage). La formule n'est pas publiée —
  [Four Corner Forms](https://docs.live2d.com/4.2/en/cubism-editor-manual/synthesize-corners).
- **Génération automatique du mouvement du visage** — [Auto generation of facial motion](https://docs.live2d.com/en/cubism-editor-manual/face-auto-edit/) :
  - elle exige des déformateurs pour le visage, chaque œil, chaque sourcil et la bouche ;
  - elle se règle par deux curseurs, « Shift Level » (amplitude du déplacement) et « Deformation Level » (degré de
    déformation) ;
  - elle est réservée aux visages **de face**.
- **Blend shapes** : la forme est « ajoutée à toutes » les formes clés normales de l'objet. Elle permet de modéliser
  « *without worrying about the number of parameter multiplications* ». Plage recommandée [0 ; 1]. Avertissement : des
  formes simultanées peuvent s'annuler —
  [Blend Shape](https://docs.live2d.com/en/cubism-editor-manual/blend-shape/).

**Espaces de mélange, [code lu]**
- **Godot** `AnimationNodeBlendSpace2D` :
  - triangulation de Delaunay automatique (l. 508), puis **barycentrique** dans le triangle (`_blend_triangle`, l. 550) ;
  - hors de l'enveloppe, point le plus proche sur les arêtes ;
  - modes `INTERPOLATED`, `DISCRETE` et `DISCRETE_CARRY` —
  [animation_blend_space_2d.cpp](https://github.com/godotengine/godot/blob/4d10419cacd6d3009976e8f9fd3abd970fd58018/scene/animation/animation_blend_space_2d.cpp).
- **Unity** : le type « 2D Freeform Cartesian » repose sur la *gradient band interpolation* du chapitre 6.3 du mémoire
  de R. S. Johansen (attribution relevée sur un forum Unity, non confirmée par Unity) —
  [Unity, 2D Blending](https://docs.unity3d.com/Manual/BlendTree-2DBlending.html) ;
  [fil Unity](https://discussions.unity.com/t/how-weights-of-2d-blending-are-calculated/167823).

**Banc C : continuité des poids, [mesure]** (`S/bench_squelettes/bench_poids.ts`)
- Fonction test non linéaire sur les nœuds : `f = sin(1,3x) + 0,5y² + 0,3xy`.
- Parcours : cercle de rayon 0,62, 7 200 pas.
- Indicateurs :
  - « saut de pente » = max |Δ² f| / médiane : plus de 100 signale une cassure C1 ;
  - erreur maximale par rapport à `f`.

| Méthode | Clés exactes | Erreur max | Saut de pente / médiane | ns par évaluation |
|---|---|---|---|---|
| Grille multilinéaire 3×3 (Live2D) | oui | 0,241 | **1 279** | 560 à 728 |
| **Grille Hermite, tangentes Catmull-Rom, 3×3 (notre proposition)** | oui | **0,171** | **3,3** | 699 |
| Grille multilinéaire lissée (smoothstep) 3×3 | oui | 0,323 | 3,8 (mais pente nulle à chaque clé) | 1 363 |
| Barycentrique sur Delaunay 3×3 (Godot) | oui | 0,314 | **1 191** | 330 à 516 |
| Bandes de gradient 3×3 (Unity Freeform) | oui | 0,292 | **1 885** | 1 766 à 1 873 |
| Shepard p = 2, 3×3 | oui | 0,457 | 9,8 (plats autour des clés) | 418 à 452 |
| Barycentrique, 5 points en croix | oui | 0,299 | **1 158** | 389 à 536 |
| Bandes de gradient, 5 points en croix | oui | 0,375 | **3 355** | 586 à 1 039 |

**Banc D : tête pseudo-3D générée, [mesure]** (`S/bench_squelettes/bench_tete.ts`, planche
`S/bench_squelettes/planche_tete_lacet_tangage.png`, 5 lacets × 3 tangages)
- **Ellipse du visage**, tirée des ancrages :
  - `cx` = milieu des yeux ;
  - `rx = 1,45 × écart des yeux` (110 px) ;
  - haut = sommet de la tête, pris sur les sommets de poids `tete` > 0,9 près de l'axe (y = 41) ;
  - bas = **menton** (y = 326).
- **Profondeur** : `z = profil(r²)` + bosse du nez, de hauteur 0,35, gaussienne de σ = 0,22·rx, centrée aux 55 % de
  l'écart yeux–bouche.
- **Décalage** :
  - `Δx = rx·0,45·sin θ·k − (x − cx)·(1 − cos θ)·k·0,6`, de même pour `Δy` en tangage (0,40 au lieu de 0,45) ;
  - `k = masque·z`, avec `masque = smoothstep(0,6 ; 0,98 ; poids tete)` ;
  - θ = lacet·24°, φ = tangage·17°.
- **Coins** par superposition additive des deux décalages.

| Variante | Triangles retournés (grille 21×21) | Rapport d'aire min / max | Décalage max |
|---|---|---|---|
| Racine d'ellipsoïde, ellipse jusque dans le cou, masque 0,35 | 110 (et cou cassé à l'œil) | −0,66 / 3,21 | 44,1 px |
| Racine d'ellipsoïde, ellipse arrêtée au menton, masque 0,6 | 43, tous au contour du visage | −0,18 / 2,74 | 34,5 px |
| **Paraboloïde `z = 1 − r²`**, ellipse au menton, masque 0,6 | **0** | **0,55 / 1,50** | 32,6 px |

- Coût : **8,3 à 14,2 µs** par évaluation du champ (704 sommets actifs), et 0,3 à 0,4 ms par cellule de contrôle
  (aires de 1 260 triangles).
- Sur la planche, le visage « tourne » de trois quarts à ±0,5 et ±1, sans changer de dessin ; le contour, les cheveux et
  le cou restent en place.

### Inferences
- **Pourquoi le paraboloïde.** La pente de la racine d'ellipsoïde est infinie au contour (`dz/du = −u/√(1 − u²)`). Le
  côté fuyant s'écrase donc jusqu'à retourner les triangles dès que `K·sin θ·|dz/du| > 1`. Le paraboloïde a une pente
  bornée (2 au bord) : avec `K·sin θ·2 < 1`, il ne peut **jamais** retourner un triangle. C'est une garantie, pas une
  constatation.
- **Contour fixe** (z = 0 au bord). Une peinture n'a pas de face cachée : on ne déplace que l'**intérieur** du visage, ce
  que Live2D appelle « Shift Level ». Sa « Deformation Level » correspond à notre terme `(1 − cos θ)`. Le contour,
  les oreilles et la coiffe restent fixes : ni trou, ni couture avec le cou.
- **Pourquoi Hermite plutôt que la grille de Live2D.** Notre fluidité vient de courbes C1, issues des ressorts
  analytiques. Si le lacet de tête passe par la pose de face (0) pendant un regard, une grille multilinéaire crée une
  **cassure de vitesse des sommets** exactement à la pose de face, la plus vue. La grille de Hermite l'efface pour le
  même coût. La note 02 (G7) proposait déjà « Hermite sur chaque axe » : le banc le confirme. Avec des tangentes de
  Catmull-Rom, les poids peuvent devenir légèrement négatifs (dépassement). C'est sans danger pour des décalages et des
  angles ; il faut seulement borner le résultat si un paramètre pilote une opacité.
- **Deux sortes de paramètres** (Live2D) :
  - **grille** (1 ou 2 axes, 3 nœuds par axe, Hermite) pour les déformations qui **se combinent géométriquement** :
    lacet × tangage de tête, torsion du buste ;
  - **additifs** (`Δv·w`, w ∈ [0 ; 1]) pour les formes qui **s'ajoutent** : joue gonflée, sourire de côté, correctifs
    de coude et de genou pilotés par l'angle (Moho), respiration du ventre.

  Les additifs s'appliquent après la grille, sans multiplier le nombre de formes.
- **Curseurs de pose** (Spine sliders, Rive joystick). C'est le même mécanisme appliqué **aux os** : une petite
  animation de poses, parcourue par un paramètre. Exemples : « hausser » de 0 à 1 piloté par l'épaule, « mains
  jointes » piloté par la distance des mains. Chez nous, les recettes sont déjà paramétriques, et ce composant apporte
  surtout la réutilisation de poses dessinées par le propriétaire. Il vient après les formes clés : décision « plus
  tard ».

### Gaps
- Testé sur un seul visage (MODOU de face). Les personnages de profil ou de trois quarts, ceux à coiffe haute
  (gélé, foulard) et ceux à barbe couvrante ne sont pas mesurés. La génération Live2D est aussi limitée aux visages de
  face.
- Les bandes de paupières et de lèvres de `rendu/visage.ts` doivent recevoir le **même** champ. Non branché, donc non
  vu à l'écran.
- Pas encore d'ARAP de lissage (note 01, G7) : à 0 retournement, il ne paraît pas nécessaire. À revoir sur des dessins
  plus irréguliers.
- **À coordonner** avec la piste « visages » de la veille 2 (dossier `S/sources/veille2/visages/` vu pendant ce
  travail), qui peut traiter la même question sous l'angle du visage.

---

## Q4 — Mélange, machines à états et arbres de mélange : que font exactement Rive, Godot et DragonBones, et qu'en reste-t-il pour un moteur hors ligne ?

### Takeaway
Rien de nouveau n'est indispensable : notre mélange par écarts au repos, avec masques graduels et priorités, couvre
déjà Godot et DragonBones (notes 03 et 09). Le code lu apporte trois règles précises :
1. **Godot « déterministe »** : on ne normalise pas les poids. Un poids manquant rend la pose de repos, ce qui est notre
   comportement.
2. **Rive** : la courbe d'easing s'applique **au mélange** d'une transition, pas au temps.
3. **DragonBones et Rive** : une animation peut piloter la **progression** d'une autre (remappage du temps).

La machine à états exécutée image par image ne sert pas un moteur dont toute la timeline est connue d'avance.

### Cited Findings
- **Godot** `AnimationMixer`.
  - En mode non déterministe, chaque poids est divisé par le poids total de la piste ; en mode `deterministic`, il ne
    l'est pas (l. 1281-1288).
  - Les rotations sont accumulées « via le repos » : `rot = from · slerp(I, rest⁻¹·to, w)`. En 2D :
    `θ = θ + w·(θ_i − θ_repos)` (`Animation::interpolate_via_rest`) —
    [animation_mixer.cpp](https://github.com/godotengine/godot/blob/4d10419cacd6d3009976e8f9fd3abd970fd58018/scene/animation/animation_mixer.cpp) ;
    [animation.cpp l. 5845-5866](https://github.com/godotengine/godot/blob/4d10419cacd6d3009976e8f9fd3abd970fd58018/scene/resources/animation.cpp).
- **Godot, racine.** Le déplacement de la piste racine est la différence entre `time − delta` et `time`. Un bouclage
  est **découpé** : de l'instant précédent à la fin, puis du début à l'instant courant, en option dans le repère de la
  rotation de la racine (même fichier, l. 1290 et suivantes).
- **Godot** `OneShot` : `fade_in_curve->sample(blend)`, et pour la sortie `1 − fade_out_curve->sample(1 − blend)`.
  `StateMachineTransition` a `xfade_time` et `xfade_curve` —
  [animation_blend_tree.cpp](https://github.com/godotengine/godot/blob/4d10419cacd6d3009976e8f9fd3abd970fd58018/scene/animation/animation_blend_tree.cpp).
- **Rive, mélange.** `BlendAccumulator::applyDouble` fait `current = current·(1 − mix) + value·mix`, en partant de la
  valeur de **réinitialisation** (l. 103). C'est un lerp **séquentiel**, qui dépend de l'ordre ; il est corrigé en ne
  publiant que la valeur finale de l'image —
  [blend_accumulator.cpp](https://github.com/rive-app/rive-runtime/blob/5e3de3857d6ae9e019f94da507f6385b96fbf3c3/src/animation/blend_accumulator.cpp).
- **Rive, états de mélange.**
  - `BlendState1D` : recherche dichotomique des deux voisins, puis `mix = (v − from)/(to − from)` (l. 129).
  - `BlendStateDirect` : `mix = clamp(valeur/100, 0, 1)` par animation.
  - `StateTransition` : durée et heure de sortie en ms **ou en % de l'animation** (l. 86 et 112), « pause à la sortie ».
    Le mélange est transformé par l'interpolateur de la transition : `interpolator->transform(m_mix)` —
    [state_machine_instance.cpp](https://github.com/rive-app/rive-runtime/blob/5e3de3857d6ae9e019f94da507f6385b96fbf3c3/src/animation/state_machine_instance.cpp).
- **Rive, courbes.** Le cubique (Bézier CSS) est résolu par table de 11 échantillons puis 4 itérations de Newton.
  L'*elastic* suit `A·2^{−10t}·sin((t − s)·2π/P) + 1`.
- **DragonBones.** `E1D` prend le plus proche voisin de chaque côté, puis `w_gauche = dR/(dL + dR)` (l. 972-1010). La
  courbe d'une clé est un tableau d'échantillons ×10 000 interpolés linéairement (`_getEasingCurveValue`, l. 253). Les
  types `QuadIn/Out/InOut` sont mélangés à la linéaire par `easing` —
  [BaseTimelineState.ts](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/DragonBones/src/dragonBones/animation/BaseTimelineState.ts).

### Inferences
- **Notre mélange est déjà juste.** Les écarts au repos sont sommés, ce qui reproduit l'`interpolate_via_rest` de Godot
  en mode déterministe, sans dépendre de l'ordre comme le lerp séquentiel de Rive. Il ne faut **pas** normaliser les
  poids : un geste à 60 % doit laisser 40 % de repos, pas « gonfler » l'autre geste.
- **Easing sur le mélange** (Rive, Godot) plutôt que fondus linéaires (DragonBones). C'est déjà notre choix :
  `presence()` en smoothstep dans `couches.ts`, et la règle C1 de la note 02 (G10). Rien à faire.
- **Remappage du temps** (DragonBones `AnimationProgress`, Rive `NestedRemapAnimation`). Une recette peut être jouée avec
  un temps `τ = g(t)` : ralenti comique local, maintien, « sur deux images » pour un accent. C'est pur et peu coûteux ;
  à garder pour la piste comique.
- **Racine des cycles en forme close** : pour un clip cyclique de période T et de déplacement Δ par cycle,
  `racine(t) = ⌊t/T⌋·Δ + (r(t mod T) − r(0))`. On n'a jamais besoin de l'image précédente. C'est la version pure du
  découpage de Godot, utile dès que la greffe mocap (note 09) fournit des marches en clips.

### Gaps
- La machine à états de Godot (`travel()` par A*, priorités) n'a pas été évaluée comme **outil d'écriture**, pour
  enchaîner automatiquement des actions valides. Hors piste.
- Les modes de synchronisation de cycles (`SYNC_MODE_CYCLIC_*`) ne sont pas utiles tant que la marche est calée sur la
  distance (`marcher`).

---

## Q5 — Événements, ordre de dessin, remplacement de dessins, dynamique : ce qui reste

### Takeaway
- **Événements.** Les trois runtimes en émettent aux instants clés (DragonBones `ActionTimeline` : `FRAME`, `SOUND`,
  `COMPLETE`, `LOOP_COMPLETE`), avec un **retard sous-image** chez Rive (`EventReport.secondsDelay`). Nos recettes
  n'en émettent aucun.
- **Remplacement de dessin.** Rive `Solo` ne garde visible qu'un enfant, avec une clé `activeComponentId`. C'est
  l'équivalent des attachements de Spine et des calques « switch » de Moho. Notre type `AncreBouche.formesDessinees`
  en est le germe.
- **Dynamique.** Les dynamiques à état (jiggle Godot 2D, Damped Transform d'Unity, dynamiques de Moho) sont exclues.
  Deux idées du ressort VRM de Godot sont à ajouter à notre cuisson XPBD (note 02, G9) : le **repère « centre »** et les
  **collisions capsules**.

### Cited Findings
- **DragonBones** `ActionTimelineState._onCrossFrame`. Il émet des événements `FRAME_EVENT` et `SOUND_EVENT` mis en
  tampon. L'instant est recalculé par `frameArray[offset]/frameRate`, avec le commentaire `// Precision problem`. Il y
  a aussi les événements de début et de fin de boucle (l. 27 et suivantes) —
  [TimelineState.ts](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/DragonBones/src/dragonBones/animation/TimelineState.ts).
- **Rive** : `EventReport(Event*, float secondsDelay)` —
  [event_report.hpp](https://github.com/rive-app/rive-runtime/blob/5e3de3857d6ae9e019f94da507f6385b96fbf3c3/include/rive/event_report.hpp).
- **Rive** `Solo::propagateCollapse` (l. 61-77) : `child->collapse(child != active)` —
  [solo.cpp](https://github.com/rive-app/rive-runtime/blob/5e3de3857d6ae9e019f94da507f6385b96fbf3c3/src/solo.cpp).
- **DragonBones** : pistes `ZOrder` et `SlotZIndex` (note 02). **Spine 4.3** : « *Draw order folders can now have their
  own keys* » ([blog](https://en.esotericsoftware.com/blog/Spine-4.3-released)).
- **Godot VRM** (`SpringBoneSimulator3D`) : repère « centre » et collisions sphère, capsule et plan (Q2).

### Inferences
- **Marqueurs** : chaque recette ajoute `marqueurs: {t, type, force}` à sa contribution. Exemples : pas au contact du
  talon (déjà calculé dans `marcher`), claque, impact de recul, frottement du boubou.
  - Ils sont compilés avec l'action, donc purs.
  - `timeline/` les verse dans les **sons** (bruitages synthétisés, `export/sfx.ts`) et dans la **caméra** (secousse
    d'impact).
  - Le temps exact est connu : il n'y a ni « problème de précision » ni retard d'image à gérer.
- **Repère « centre »** pour la cuisson XPBD (foulard, gélé, ourlet). La chaîne est simulée dans le repère du bassin, et
  seule une fraction réglable de l'accélération du monde y est injectée (`inertie`). Sans cela, un travelling de
  placement ou une marche rapide fouettent tous les pans. Les **capsules** des os (cuisses, bras) empêchent l'ourlet de
  traverser les jambes : c'est le *gap* « pas de collision » de la note 02.
- **Dessins de remplacement** (`Solo`) : un emplacement porte N dessins (mains ouvertes ou fermées, bouches
  dessinées), un seul étant visible, avec un **fondu de 2 images à pose égale** (règle de la note 07, complément 2). À
  faire quand arrivent les planches du propriétaire.

### Gaps
- Les synthèses de bruitages (pas sur terre battue, sur carrelage) ne sont pas mesurées ici.
- Le coût de la cuisson XPBD avec collisions capsules n'est pas mesuré.

---

## Ce que nous agrégeons dans `moteur-fluide`

Toutes les signatures sont **pures** : elles ne lisent que `(rig, pose du même instant, cibles(t))`. Le code est le
nôtre ; seuls les concepts viennent des runtimes.

### Ordre d'évaluation complet (par personnage, à l'instant `tJeu`)

```
anim/  fournisseurPose(ctx):
  P0 = couches(tJeu) ⊕ ressorts ⊕ signaux directs ⊕ secondaire       // existant (couches.ts)
  P1 = transferts(rig.transferts, P0)                                  // C3 : local → local, ordre topologique des os cibles
  P2 = contraintes(rig, ctx, P1, tJeu):                                // C1 + C2
         W = FK(P1)                                                    // une fois ; FK incrémentale par sous-arbre ensuite
         1. verrous de pieds (fenêtres d'appui) : bassin abaissé (2 passes) puis IK dure par jambe
         2. IK de mains : cibles (objet, épaule d'un autre personnage, point du décor), force m(t) C1
         3. visées : tête (roulis ≤ limite amortie), puis regard (les yeux mènent, la tête suit par ressort)
  P2.parametres = pilotes(rig.parametres, P2, ctx)                     // C4 : lacet/tangage de tête, correctifs par angle
  return P2

rendu/ (page) et rig/deformer:
  v_repos' = v_repos + Σ_grille Hermite(params) + Σ_additifs w·Δv      // C4, AVANT la peau (repère de repos)
  v = peauCoR(v_repos', FK(P2))                                        // existant
  v += champVisage(etatVisage) + champTete(params)                     // existant + même champ pour les bandes
  racine, placement, caméra ; ordre de dessin (ordreGroupes)           // existant
```

### C1. `rig/contraintes.ts` — pile de contraintes post-mélange (concepts : Rive, DragonBones, Godot, Spine)

```ts
// timeline/types.ts — ajouts
export type Valeur = number | ReadonlyArray<readonly [t: number, v: number]>;   // constante ou clés (Hermite C1)
export type CibleContrainte =
  | { type: 'decor'; point: PointDecor }                                       // point du décor (monde)
  | { type: 'os'; personnage?: string; os: string; decalage?: Vec2 }           // main sur l'épaule d'un autre
  | { type: 'figee'; instant: number };                                        // bout figé là où il était à t_k (appui)
export interface ContrainteIK {
  type: 'ik'; chaine: string;                    // DefinitionIK.nom
  cible: CibleContrainte; force: Valeur;         // 0..1, mélange FK→IK sur l'arc le plus court (Rive strength)
  pole?: 1 | -1;                                 // sens du pli imposé (Godot TwoBoneIK3D, magnets FABRIK)
  etirement?: { max: number; volume: boolean };  // Spine stretch + scaleY à volume conservé (4.3) — plus tard
}
export interface ContrainteVisee {
  type: 'visee'; os: string; cible: CibleContrainte; force: Valeur;
  limites: readonly [min: number, max: number];  // rad, recentrées (C2)
  seuilAmorti: number;                           // 0..1 : saturation douce de Godot (remap_damped), C1
}
export interface ContrainteDistance {           // laisse (Rive) : tête qui suit sans dépasser, objet tenu
  type: 'distance'; os: string; cible: CibleContrainte; distance: number;
  mode: 'auPlus' | 'auMoins' | 'exacte'; force: Valeur;
}
export type Contrainte = ContrainteIK | ContrainteVisee | ContrainteDistance;
// Rig : contraintes permanentes ;  Recette : contraintes datées (ActionCompilee.contraintes) ;
// appuis : fenêtres calculées par couches.ts (hors marcher/sauter → les deux pieds figés, rampes C1 de 0,1 s).
export function appliquerContraintes(rig: CharacterRig, pose: Pose, liste: readonly Contrainte[],
  ctx: { tJeu: number; resoudre: (c: CibleContrainte) => Vec2 | null }): Pose;
```

- **Cible « figée »** : position du bout de chaîne à l'instant `t_k`, calculée sur la pose **P1 du même plan à t_k**
  (sans contrainte, donc sans récursion). Elle est mémorisée par `(personnage, plan, t_k)`.
- **Force** : toujours une rampe C1 (smoothstep ou Hermite), jamais linéaire : c'est la leçon de DragonBones (note 02).
- **Tests vitest à ajouter** :
  - glissement des pieds = 0 px sur la pose du banc B ;
  - pose de repos reproduite à moins de 0,01 px ;
  - empreinte identique dans l'ordre et dans le désordre ;
  - continuité C1 de la force aux bords des fenêtres d'appui ;
  - coût < 0,15 ms par image et par personnage.

### C2. Correctifs d'IK et de limites (règle de Rive, constat du banc B)

```ts
// rig/fk.ts et rig/ik.ts
export function recentrer(x: number, min: number, max: number): number {     // tour centré sur l'intervalle
  const c = (min + max) / 2;
  return x - 2 * Math.PI * Math.floor((x - c + Math.PI) / (2 * Math.PI));
}
// calculerFK : rot = limiterDoux(recentrer(rot, min, max), min, max, marge)
// appliquerIK : rotA, rotB = recentrer(...) AVANT le bornage ; douceur à partir de max(d_repos, (1 − σ)·L)
// construireRig : genoux « déverrouillés » au repos (bassin abaissé de κ·L, κ ≈ 0,005–0,01) si d_repos/L > 0,995
```

- **Tests** :
  - cible exigeant ±180° sur `brasD` : écart < 5 px (aujourd'hui 350 px) ;
  - verrou au repos avec douceur 5 % : écart < 0,01 px (aujourd'hui 8,9 px).

### C3. `rig/transferts.ts` — une propriété en pilote une autre (Spine 4.3, Godot `ConvertTransformModifier3D`, Unity Twist Correction)

```ts
export interface Transfert {
  source: { os: string; prop: 'r' | 'tx' | 'ty' | 'sx' | 'sy' };
  plage: readonly [a: number, b: number];          // inverse_lerp sur la source, borné à [0, 1]
  vers: { os: string; prop: 'r' | 'tx' | 'ty' | 'sx' | 'sy' };
  plageVers: readonly [c: number, d: number];
  courbe?: 'lineaire' | 'genou' | readonly number[]; // 'genou' = quadratique C1 ; tableau = Hermite C1
  mode: 'additif' | 'relatif';                       // relatif = par rapport au repos
  force?: number;
}
// rig.json : transferts par défaut générés pour tout humanoïde (retouchables) :
//   bras* r ∈ [50°, 150°]   → epaule* r += 30 % (genou 10°)      : la clavicule suit le bras levé
//   torse r                 → bassin r −25 %, cou r +15 %         : torsion répartie (Twist Correction)
//   jambe* r (flexion)      → bassin ty += f(flexion)             : le bassin descend quand on plie
//   tete r (tangage, param) → sourcils +, paupières hautes −      : regard vers le haut
```

### C4. `rig/formes.ts` — paramètres, formes clés en grille C1, formes additives, tête pseudo-3D générée (Live2D, DragonBones, Rive, Moho)

```ts
export interface FormeCle { sommets: Uint32Array; dx: Float32Array; dy: Float32Array }  // creux, repère de repos
export type Pilote =
  | { type: 'parametre'; nom: string }                             // Pose.parametres (anim/ : lacet, tangage…)
  | { type: 'os'; os: string; prop: 'r' | 'sx' | 'sy'; plage: readonly [number, number] }   // smart bone (Moho)
  | { type: 'visage'; indice: IndiceVisage };                      // sourire, joue…
export interface ParametreGrille { nom: string; axes: readonly [Pilote, Pilote?]; noeuds: readonly number[];   // 3 nœuds
  formes: readonly (FormeCle | null)[] }                          // 3 ou 9 formes, null = repos ; Hermite C1 par axe
export interface ParametreAdditif { nom: string; pilote: Pilote; forme: FormeCle; courbe?: readonly number[] }
// CharacterRig.parametres?: { grilles: ParametreGrille[]; additifs: ParametreAdditif[] }
export function decalagesFormes(rig: CharacterRig, pose: Pose, sortie: Float32Array): void;  // Σ, avant la peau
export function genererTete(rig: CharacterRig, reglages?: { lacetMax?: number; tangageMax?: number;
  decalage?: number; nez?: number }): ParametreGrille;   // banc D : paraboloïde, contour fixe, masque poids « tete »
```

- **Contrôle d'import** (porte qualité) : sur la grille 21×21 de chaque paramètre, 0 triangle retourné et rapport
  d'aire dans [0,4 ; 2,5]. En cas d'échec, on baisse le « niveau de décalage » (`decalage`) jusqu'au succès.
- **Corrections par rapport à la note 01 (G7)** :
  - ellipse arrêtée au menton ;
  - profil paraboloïde au lieu de la racine d'ellipsoïde ;
  - contour fixe ;
  - masque par le poids `tete` ;
  - grille de Hermite au lieu de la bilinéaire.

  Toutes ces corrections sont mesurées en Q3.
- **Pilotage** par `anim/`. Le lacet suit la cible de regard horizontale, avec un ressort et un retard : les yeux mènent
  de 0,1 s (note 03). Le tangage vient des hochements et des accents prosodiques (notes 03 et 12). La bascule de
  dessin de trois quarts (note 07, complément 2) ne se déclenche qu'**au-delà** de |lacet| = 1.
- **Correctifs** de coude et de genou (note 02, G7) : formes additives pilotées par l'angle de l'os, générées par ARAP.
  Ce dernier point est à brancher sur la greffe ARAP de la note 09.

### C5. Marqueurs d'animation → bruitages et caméra (DragonBones `ActionTimeline`, Rive `EventReport`)

```ts
// anim/actions.ts : Contribution.marqueurs: Array<{ t: number; type: 'pas' | 'impact' | 'claque' | 'frottement'; force: number; os?: string }>
// timeline/ : fournisseurSons ajoute les bruitages ; scene/camera ajoute une secousse sur 'impact' (force > seuil)
```

### C6. Racine des cycles en forme close (Godot, rendu pur) — avec la greffe mocap (note 09, § 9.6)

`racine(t) = ⌊t/T⌋·Δ + r(t mod T) − r(0)`. Les fenêtres d'appui des pieds sont détectées dans le clip (hauteur et
vitesse sous des seuils) et alimentent C1.

### Propositions d'amélioration pour les pistes déjà en cours
- **Greffe (a) Animated Drawings / mocap** :
  - faire passer la sortie du reciblage BVH par **C1** : verrous de pieds aux contacts détectés, mains vers des
    accessoires ;
  - appliquer **C2** aux angles absolus reciblés : un angle reciblé tombe souvent près de ±180° pour un bras levé,
    exactement là où le bornage actuel casse.
- **Piste (b) décors vivants et parole** : les marqueurs C5 donnent les bruitages synchronisés des figurants et des pas,
  et le tangage piloté par la prosodie trouve une sortie visible dans C4.

---

## Tableau classé

| # | Composant | Gain visible | Coût d'intégration | Licence | Décision |
|---|---|---|---|---|---|
| 1 | **Pile de contraintes post-mélange** (C1) : verrou de pieds + bassin abaissé, IK de mains vers cibles avec force C1, visée à limite amortie | Très fort : pieds collés (86 → **0 px**), mains qui atteignent leur cible, personnages ancrés dans le décor | Moyen : environ 400–600 lignes TS + tests ; 55–81 µs par image | Notre code ; concepts Rive, DragonBones, Godot (MIT), Spine et Unity (concepts seulement) | **Agréger maintenant** |
| 2 | **Correctifs d'IK et de limites** (C2) : limites recentrées (Rive), douceur depuis le repos, genoux déverrouillés | Fort : supprime des sauts de 350 px (8 % des images du banc) et l'écart de 8,9 px au repos | Faible : environ 30 lignes + 2 tests | Notre code ; règle lue dans Rive (MIT) | **Agréger maintenant** (avant C1) |
| 3 | **Formes clés paramétrées** (C4) : grille de Hermite C1 + formes additives + tête pseudo-3D générée | Très fort : la tête tourne de trois quarts et hoche en volume sans redessin ; 0 triangle retourné, 8–14 µs | Moyen : environ 500 lignes (formes, générateur, bandes du visage) | Notre code ; concepts Live2D (SDK propriétaire, non utilisé), Moho et Spine (concepts), DragonBones et Rive (MIT) | **Agréger maintenant** (coordonner avec la piste « visages ») |
| 4 | **Transferts de propriétés** (C3) : clavicule, torsion répartie, bassin qui descend, sourcils | Fort : chaque geste existant gagne son « suivi » anatomique sans réécrire les recettes | Faible : environ 150 lignes + table par défaut | Notre code ; concepts Spine 4.3, Godot `ConvertTransformModifier3D` (MIT), Unity Twist Correction | **Agréger maintenant** (dans C1) |
| 5 | **Marqueurs d'animation** → bruitages et caméra (C5) | Moyen : pas, claques et impacts synchronisés à l'image près | Faible : environ 100 lignes | Notre code ; concepts DragonBones et Rive (MIT) | **Agréger maintenant** |
| 6 | **Racine des cycles en forme close** + appuis détectés (C6) | Fort pour la mocap : déplacement exact, pas de glissement | Faible : environ 80 lignes | Notre code ; concept Godot (MIT) | **Maintenant**, avec la greffe mocap (a) |
| 7 | Curseurs de pose (Spine sliders, Rive Joystick, Moho smart bones) appliqués aux os | Moyen : réutiliser des poses dessinées, pilotées par un os ou un paramètre | Moyen | Concepts ; Rive (MIT) | Plus tard |
| 8 | IK étirable à volume conservé (Spine 4.3, `stretch` + scaleY inverse) | Moyen : bras qui « s'allonge » en cartoon pour une saisie comique | Faible (après C1) | Concepts Spine | Plus tard |
| 9 | Dessins de remplacement (`Solo` de Rive, attachements Spine, switch Moho) : mains et bouches dessinées | Moyen, dès que les planches arrivent | Faible | Concepts ; Rive (MIT) | Plus tard |
| 10 | XPBD : repère « centre » + collisions capsules (ressort VRM de Godot) | Moyen : pans qui ne fouettent pas et ne traversent pas les jambes | Moyen | Concepts Godot (MIT) et VRM | Plus tard |
| 11 | Contrainte de chemin (bras « tuyau d'arrosage », queues, foulard sur trajectoire) | Faible à moyen | Moyen (paramétrage par longueur d'arc à écrire) | **Concept seulement** : le code DragonBones dérive de Spine | Plus tard |
| 12 | Remappage local du temps d'une action (DragonBones `AnimationProgress`, Rive `NestedRemap`) : maintiens, « sur deux images » | Moyen (accents comiques) | Faible | Concepts MIT | Plus tard (piste comique) |
| 13 | Machine à états exécutée image par image, transitions à état (Godot, Rive, Mecanim) | Nul pour nous : la timeline est connue, et nos transitions sont pures (notes 03 et 09) | — | MIT / concepts | **Non** |
| 14 | Espaces de mélange triangulés ou à bandes de gradient (Godot, Unity) | Négatif : cassures C1 mesurées (×1 160 à ×3 360) | — | MIT / concepts | **Non** (grille de Hermite à la place) |
| 15 | Jiggle 2D de Godot, Damped Transform d'Unity, `LimitAngularVelocity` à état | Négatif : dépend du pas et de l'image précédente (pas de scrub exact) | — | MIT / Unity Companion | **Non** (ressorts analytiques ; vitesse maximale contrôlée par la porte qualité) |
| 16 | Code des runtimes Spine, SDK Live2D, paquet Unity Animation Rigging | — | — | Licences restrictives ou non commerciales hors de leur moteur | **Non** (concepts seulement) |
