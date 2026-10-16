# 09 — Animated Drawings lu ligne à ligne : carte de portage vers le moteur fluide (TypeScript)

Piste : greffe d'un moteur d'animation puissant. Rédigé le 16/10/2026. La note `01_moteurs_image_vers_animation.md`
(même dossier) présente déjà Animated Drawings (AD) à grands traits (licence, détection, taux de réussite). **Celle-ci est
une carte de portage** : structures de données, formules, tailles des matrices, ce qu'on précalcule, coût par image, et
comment tout cela se branche sur `rig.json`, `calculerFK`, `deformerSommets` et les couches d'`anim/`.

## Sources lues

| Dépôt | Commit | Date | Licence |
|---|---|---|---|
| facebookresearch/AnimatedDrawings | `b859684857519c7424da51a0b0862fbd1fd258f4` | 03/09/2025 (archivé) | MIT, « Copyright (c) Meta Platforms, Inc. and affiliates » |
| DragonBones/DragonBonesJS | `64b6c69ae35777c2404be68c9192e2c56906079e` | 24/05/2025 | MIT |
| rive-app/rive-runtime | `5e3de3857d6ae9e019f94da507f6385b96fbf3c3` | 16/10/2026 | MIT |

Clone superficiel, sans LFS :
`/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/sources/AnimatedDrawings/`.
Les runtimes DragonBones et Rive sont déjà dans `.../scratchpad/sources/rigs2d/`.

Fichiers AD lus en entier :

- `model/arap.py` (329 lignes) ;
- `model/animated_drawing.py` (715) ;
- `model/retargeter.py` (345) ;
- `model/bvh.py` (284) ;
- `model/joint.py` (50), `model/transform.py` (233) ;
- les parties utiles de `model/quaternions.py` et `model/vectors.py` ;
- `config.py` (validation des yaml) ;
- `controller/video_render_controller.py` ;
- `examples/image_to_annotations.py` (segmentation et squelette) ;
- les 8 `examples/config/retarget/*.yaml`, les 6 `motion/*.yaml` et `char_cfg.yaml` ;
- `examples/config/README.md`, `tests/test_arap.py`, `tests/test_bvh.py`.

Deux vérifications ont été faites avec **notre propre code**, dans
`/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/scripts_arap/` :

- `arap_forme_close.py` réécrit l'ARAP avec la forme close du § 2.2. Il retrouve les **trois jeux de valeurs de
  référence** de `tests/test_arap.py`, avec un écart maximal de 4,4·10⁻⁹ (un seul fil, numpy).
- `essai.py` mesure les matrices sur le maillage préparé de Modou. Ce rig est privé : il a été lu sur place, et seuls
  des comptes sont reportés ici.

---

## 0. En une page

1. **Pipeline d'AD par image** :
   - temps → indice d'image BVH (arrondi, sans interpolation) ;
   - angles **absolus** des os projetés dans le plan de leur groupe : c'est la « perspective tordue » ;
   - rotation des articulations du dessin ;
   - **ARAP à deux étapes**, dont les poignées sont les 16 articulations ;
   - ordre de dessin des parties selon la profondeur des articulations BVH.
2. **ARAP (Igarashi 2005/2009)** :
   - **étape 1** : système 2V×2V. Il trouve des positions où chaque arête suit une similitude (rotation + échelle libres)
     estimée sur ses 3 ou 4 sommets voisins ;
   - on extrait alors la rotation de chaque arête (on normalise `(c, s)`) ;
   - **étape 2** : système V×V (laplacien + poignées), résolu pour x et pour y. Il ramène chaque arête à sa longueur de
     repos, tournée.
   - Les poignées sont des contraintes **douces**, de poids w = 1000, sur des combinaisons barycentriques.
   - Les deux matrices sont **constantes** tant que l'ensemble des poignées ne change pas. On factorise une fois, puis
     chaque image coûte trois paires de descente/remontée.
3. **Forme close** vérifiée : `G_kᵀG_k = S_k·I₂` avec `S_k = Σ|p_m|²`. La pseudo-inverse d'AD se réduit donc à
   `G_kᵀ / S_k`, sans inversion 2×2.
4. **AD ne passe pas à notre échelle telle quelle.** Il construit A1 **dense** : `2(E+P) × 2V` en float32. Pour Modou
   (V = 8 175, E = 22 042), cela ferait 44 100 × 16 350 × 4 octets ≈ **2,9 Go**. Il appelle aussi `spsolve` (donc une
   refactorisation) **3 fois par image**. Le portage doit être **creux et factorisé une fois**.
5. **Mesures sur Modou** :
   - 8 composantes connexes (6 454, 993, 352, 246, 87, 21, 14, 8 sommets) : le bras G est une pièce à part, et il y a le
     calque « dessous » et des îlots ;
   - Cuthill-McKee inverse : largeur de bande 179, enveloppe **516 830** coefficients pour le système V×V, soit environ
     **2,07 M** pour le 2V×2V entrelacé ;
   - degré minimum (SuperLU) : nnz(L+U) = 171 312, factorisation 18 ms et résolution 0,55 ms en C.
   - **Estimation** pour le TypeScript, non mesurée : 10 à 20 ms par image (enveloppe) ; 3 à 6 ms en variante « une seule
     étape » ; factorisation 0,3 à 1 s une fois par rig.
6. **Branchement** :
   - nouvelle méthode de peau `'arap'` à côté de `'lbs' | 'cor'`, avec le même contrat
     (`deformer(rig, pose) → sommets`, px image, avant la racine) ;
   - poignées = **nos points d'articulation** (pivots et bouts d'os de `rig.json`), posés par `calculerFK` ;
   - **défaut inchangé** (CoR) tant que la nouvelle voie n'est pas prouvée.
7. **Retargeting** : un module `mocap/` pur, qui précalcule au chargement, pour chaque image du clip, l'angle absolu à
   l'écran de chaque os mappé, les profondeurs et la racine. À l'évaluation, on interpole (arc le plus court) en `t`
   continu, puis on convertit en `Pose.os[b].rotation` (rotations **locales** exactes). Le clip entre dans les couches
   existantes comme une action de la couche `base`.
8. **DragonBones et Rive** : nos couches ont déjà masques, priorités et fondus. Il reste à reproduire :
   - la règle « reste du poids » par os (DragonBones) ;
   - le mélange 1D entre clips par un paramètre (Rive `BlendState1D`) ;
   - le fondu avec interpolateur et « heure de sortie » (Rive), ou mieux, notre inertialisation quintique ;
   - la force d'IK mélangée à l'arc le plus court (Rive `IKConstraint.strength`), pour verrouiller les pieds.

---

## 1. Pipeline d'AD par image (ordre exact des appels)

Construction : `AnimatedDrawing.__init__`.

1. `_load_mask` et `_load_txtr` (rotation de 270° et carré de côté `img_dim = max(h, w)` : détail interne, **à ne pas
   porter**).
2. `_generate_mesh` (§ 3).
3. `AnimatedDrawingRig(char_cfg)` : articulations → transformations (§ 4).
4. `_modify_retargeting_cfg_for_character` : test « above » (§ 6.7).
5. `_initialize_joint_to_triangles_dict` : BFS triangles → os (§ 7).
6. `_initialize_retargeter_bvh` : BVH, échelle de la racine, angles pour **toutes** les images (§ 6).
7. `ARAP(rig.get_joints_2D_positions(), triangles, vertices)` : les poignées sont les positions **au repos** des
   articulations (§ 2).
8. `update()` une première fois.

Image : `AnimatedDrawing.update()`, avec `time` cumulé par le contrôleur, `delta_t = bvh.frame_time`.

```
orientations, profondeurs, racine = retargeter.get_retargeted_frame_data(t)  # images précalculées, round(t/dt), borné
rig.root_joint.set_position(racine)                     # racine = char_start_loc + char_root_positions[f]
rig.set_global_orientations(orientations)               # § 4.3 (rotation posée sur le PARENT de l'articulation)
poignees = rig.get_joints_2D_positions() - racine.xy    # 16 points (ordre parcours en profondeur)
vertices.xy = arap.solve(poignees) + racine.xy          # § 2
vertices.z  = racine.z                                  # tous les sommets à la profondeur de la racine
_set_draw_indices(profondeurs)                          # § 7 : ordre des triangles, test de profondeur coupé
```

Le rendu dessine les triangles texturés **dans l'ordre du tampon d'indices**, test de profondeur désactivé (algorithme du
peintre). Plusieurs personnages se départagent par `char_starting_location.z`.

---

## 2. ARAP (`model/arap.py`)

### 2.1 Données d'entrée

- `vertices` : `V × 2`, positions au repos. Dans AD, elles sont normalisées par `img_dim`. Pour nous : **px image**,
  sans normaliser, car le rapport arêtes/poignées ne dépend pas de l'unité (les deux résidus sont linéaires dans les
  coordonnées).
- `triangles` : `T × 3`.
- `pins_xy` : `P × 2`, poignées au repos, w = 1000.
- **Arêtes** : chaque triangle donne (v0,v1), (v1,v2), (v2,v0), triées (min, max) puis dédoublonnées.
  `E` ≈ 3V − (contour) ; pour Modou, E = 22 042.

  > **Piège.** AD dédoublonne avec un `set` Python : l'ordre des arêtes n'est pas déterministe d'un processus à
  > l'autre. Nous trions.

- **Voisinage d'arête** k = (i, j) : l'intersection des voisins de i et de j, c'est-à-dire le ou les sommets opposés
  l et r. On obtient 1 sommet sur le bord, 2 à l'intérieur (davantage seulement sur un maillage non-variété).
  Le pochoir est `ids_k = [i, j, l, (r)]`.
- **Poignées en barycentriques** : pour chaque poignée, le **premier** triangle qui la contient (ou la touche au bord),
  puis `(u, v, w)` selon Ericson. Une poignée hors du maillage est **retirée en silence** (`pin_mask`) et ignorée à
  chaque `solve`.

### 2.2 Formules (avec la forme close)

Notations : `v_m` au repos, `v'_m` déformé, `e_k = v_j − v_i`, et `p_m = v_m − v_i` pour m ∈ ids_k \ {i}.

- **Somme des carrés** : `S_k = Σ_m |p_m|²`.
- **Similitude d'arête.** `T_k = [[c, s], [−s, c]]` est rotation × échelle. On estime `(c, s)` aux moindres carrés sur
  le pochoir déformé :

  ```
  G_k = empiler_m [[p_mx, p_my], [p_my, −p_mx]]                  (2m × 2)
  G_kᵀ G_k = S_k · I₂   ⇒   G_k* = (G_kᵀG_k)⁻¹ G_kᵀ = G_kᵀ / S_k   (vérifié numériquement)

  [c_k ; s_k] = Σ_{m≠i} B_{k,m} (v'_m − v'_i)     avec  B_{k,m} = (1/S_k)·[[p_mx, p_my], [p_my, −p_mx]]
              = Σ_{m ∈ ids_k} B_{k,m} v'_m         avec  B_{k,i} = −Σ_{m≠i} B_{k,m}
  ```

- **Arête transformée.** Avec `E_k = [[e_x, e_y], [e_y, −e_x]]` :
  `T_k e_k = E_k·[c ; s] = (c·e_x + s·e_y ; −s·e_x + c·e_y)`.
- **Étape 1** (similitude libre). C'est linéaire en v', car `(c, s)` est linéaire en v' :

  ```
  E1(v') = Σ_k |(v'_j − v'_i) − E_k Σ_m B_{k,m} v'_m|²  +  Σ_p |w·Σ_{t∈tri(p)} β_pt v'_t − w·q_p|²
  ```

  Le bloc 2×2 de la ligne d'arête k sur le sommet m vaut `C_{k,m} = δ(m=j)·I − δ(m=i)·I − E_k B_{k,m}`.
- **Extraction de la rotation** : `(c, s) ← (c, s)/√(c²+s²)`, puis `ê_k = (c·e_x + s·e_y, −s·e_x + c·e_y)`.
- **Étape 2** (rotation seule, longueurs de repos). Elle est séparable en x et en y :

  ```
  E2(v'') = Σ_k |(v''_j − v''_i) − ê_k|²  +  Σ_p |w·Σ β_pt v''_t − w·q_p|²
  ```

### 2.3 Matrices : formes et contenu

| Objet | Forme | Contenu |
|---|---|---|
| A1 | (2E + 2P) × 2V | lignes d'arête `C_{k,m}`, puis lignes de poignée `w·β` (une par coordonnée) |
| G | 2E × 2V | blocs `B_{k,m}` : `(c,s)_k = (G·v')_{2k..2k+1}` |
| **N1 = A1ᵀA1** | **2V × 2V**, symétrique définie positive si chaque composante a ≥ 2 poignées | `Σ_k Σ_{a,b∈ids_k} C_{k,a}ᵀ C_{k,b}` + `w² Σ_p β_pa β_pb I₂` ; motif « distance 2 » (≈ 13 blocs voisins par sommet) |
| A2 | (E + P) × V | −1 / +1 par arête ; `w·β` par poignée |
| **N2 = A2ᵀA2** | **V × V** | **laplacien combinatoire uniforme** (`L_ii = degré`, `L_ij = −1`) + `w² Σ_p β_p β_pᵀ` |

Seconds membres (seules les lignes de poignée de b1 sont non nulles) :

```
r1[2t+d] = w² · Σ_p β_pt · q_p,d                                    (2V)
r2x[i] = Σ_{k: début i} (−ê_kx) + Σ_{k: fin i} ê_kx + w² Σ_p β_pi q_px   (de même pour r2y)
```

AD résout les **équations normales** : `spsolve(tA1xA1, tA1 @ b1)`, puis `T1 = G @ v1`, puis
`spsolve(tA2xA2, tA2 @ b2x)` et `spsolve(tA2xA2, tA2 @ b2y)`. Si `det == 0`, il ajoute 1e-8·I en boucle.

### 2.4 Ce qu'on précalcule (une fois par rig et par ensemble de poignées)

```ts
/** Précalcul ARAP d'un maillage : immuable, mémoïsé par rig (WeakMap, comme preparerMaillage). */
interface PrecalculArap {
  V: number; E: number; P: number;
  aretes: Int32Array;       // 2E : (i, j), i < j, ordre trié (déterministe)
  pochoirs: Int32Array;     // 4E : (i, j, l, r), −1 si absent
  B: Float64Array;          // 16E : 4 blocs 2×2 par arête → (c,s) = Σ_m B_{k,m}·v'_m
  e0: Float64Array;         // 2E : arêtes au repos
  epTri: Int32Array;        // 3P : sommets du triangle de chaque poignée
  epBary: Float64Array;     // 3P : β
  w: number;                // 1000
  n1: FacteurCreux;         // LDLᵀ de A1ᵀA1 (2V, x/y entrelacés)
  n2: FacteurCreux;         // LDLᵀ de A2ᵀA2 (V)
  attache?: Float64Array;   // V : λ_v² (mode hybride § 9.4), 0 sinon
}
interface FacteurCreux { n: number; perm: Int32Array; debutLigne: Int32Array; offset: Int32Array; val: Float64Array; diag: Float64Array }
```

Factorisation, première version simple et sûre :

- **ordre de Cuthill-McKee inverse** : parcours en largeur depuis un sommet pseudo-périphérique, voisins par degré
  croissant, puis inversion ;
- **Cholesky ou LDLᵀ « en ligne de ciel »** (stockage par profil) ;
- x et y **entrelacés** (2t, 2t+1) pour N1.

Le remplissage reste dans l'enveloppe : environ 517 k coefficients pour N2 et 2,07 M pour N1 sur Modou, soit 4 Mo et
16,5 Mo en Float64. Pour mieux faire plus tard, une dissection emboîtée géométrique (coupe à la médiane de l'axe long,
séparateur en dernier) se rapproche du degré minimum mesuré (≈ 90 k coefficients dans L pour N2).

> **Licence.** CSparse/LDL (T. Davis) sont LGPL : on réécrit depuis la description de l'algorithme, sans copier.

### 2.5 Par image

1. Cibles des poignées `q` (2P), tirées de la FK (§ 9.2).
2. `r1` : P × 3 accumulations, puis une descente/remontée sur N1, ce qui donne v1.
3. Pour chaque arête : `(c, s) = Σ_m B_{k,m} v1_m`, normalisation, puis `ê_k` (≈ 20 flops par arête).
4. `r2x`, `r2y` : 2 accumulations par arête, plus les poignées.
5. Deux résolutions sur N2 (même facteur, deux seconds membres).

Coût en enveloppe : ≈ 2·2·|env1| + 2·2·2·|env2| ≈ 8,3 + 4,1 ≈ **12 Mflop** par image et par personnage pour Modou.
C'est une **estimation** de 10 à 20 ms en V8, à mesurer. Le **flou de bougé par sous-instants multiplie ce coût** par le
nombre de sous-échantillons.

**Pureté** : la résolution est à froid, directe et déterministe (aucun démarrage à chaud). Cela répond au défaut mesuré
dans `00_audit_existant.md` : 15,7 px d'écart entre un calcul à chaud et un calcul à froid, et 4,5 s de factorisation
dense.

### 2.6 Tests de référence à porter dans vitest (valeurs d'AD)

- **1 triangle** : `(2,2) (3,3) (4,2)`, poignées `(2,2) (4,2)` → `(−5,0) (5,0)`. Attendu `(−5,0) (0,1) (5,0)` à 1e-5
  près (relatif) ; la forme close donne −4,999988. La hauteur reste 1 : ARAP refuse l'échelle.
- **2 triangles** : carré `(1,0) (1,1) (2,1) (2,0)`, poignées `(1,0) (2,0)` → `(1,0) (1.7,0.7)`. Attendu
  `(1,0) (0.291472,0.705685) (0.997157,1.411371) (1.7,0.7)`.
- **8 triangles** sur une grille 3×3, poignées `(0,0) (0,2) (2,0)` → `(0,0) (0,3) (6,0)` : 9 valeurs dans
  `tests/test_arap.py`.

À ajouter chez nous :

- repos → identité exacte ;
- translation ou rotation rigide de toutes les poignées → maillage transformé rigidement ;
- même résultat quel que soit l'ordre des appels.

---

## 3. Maillage depuis le masque (`_generate_mesh`) et segmentation

- **Masque de production** (`image_to_annotations.segment`) : minimum des canaux RGB, seuil adaptatif gaussien
  (bloc 115, C = 8), inversion, fermeture et dilatation 3×3 (×2 chacune), remplissage depuis les bords tous les 10 px,
  plus grand contour, `binary_fill_holes`. **Pour nous, inutile** : nos dessins ont un alpha (`masqueAlpha(image, 12)`).
- **Contour** : `find_contours(mask, 128)`, le plus long ; `approximate_polygon(tolérance 0,25 px)`, ce qui garde
  beaucoup de points. Seul le plus grand contour est conservé : **les îlots disparaissent**.
- **Intérieur** : grille 40 × 40 sur le carré `img_dim`, points dans le polygone (pas ≈ img_dim/39).
- **Delaunay non contrainte** sur tous les points, puis on retire les triangles dont le **centroïde** sort du polygone.
  **Défaut** : des arêtes peuvent enjamber une concavité étroite, par exemple entre le bras et le torse. Notre
  `construireMaillage` (Delaunay conforme, raffinement aux articulations) est meilleur : on le garde.
- **Conséquence chez AD** : un bras dessiné **devant** le torse est soudé au torse dans un maillage unique (pas de
  calques). Notre rig sépare déjà le bras G (composante de 993 sommets) et ajoute un calque « dessous ».

---

## 4. Squelette et articulations

### 4.1 Format AD (`char_cfg.yaml`)

```yaml
height: 602
width: 508
skeleton:   # loc en px image, (0,0) en haut à gauche
  - {name: root, loc: [264, 397], parent: null}
  - {name: hip, loc: [264, 397], parent: root}
  - {name: torso, loc: [247, 232], parent: hip}
  - {name: neck, loc: [231, 119], parent: torso}
  # …
```

16 articulations construites depuis les points COCO :

| AD | Point COCO | Parent |
|---|---|---|
| `root`, `hip` | milieu des hanches 11/12 | — / root |
| `torso` | milieu des épaules 5/6 | hip |
| `neck` | **nez**, point 0 | torso |
| `right_shoulder`, `right_elbow`, `right_hand` | 6, 8, 10 (poignet) | torso, puis chaîne |
| `left_*` (bras) | 5, 7, 9 | torso, puis chaîne |
| `right_hip`, `right_knee`, `right_foot` | 12, 14, 16 (cheville) | **root**, puis chaîne |
| `left_*` (jambe) | 11, 13, 15 | **root**, puis chaîne |

`right` désigne le côté du personnage, comme notre `D`.

### 4.2 Transformations

- `Transform` : `local = T·R·S` (matrices 4×4), `monde = monde_parent · local`, bit « sale » propagé.
- Une articulation AD est un **point**. « L'os » d'une articulation va de son parent jusqu'à elle (os distal).
- `starting_theta(j)` = angle de (j − parent) en degrés, **compté dans le sens antihoraire depuis +Y**, repère y vers
  le haut (`offset = (x, 1 − y, 0)`), modulo 360.

### 4.3 Application des angles (`_set_global_orientations`) et défaut à ne pas recopier

Pour chaque articulation mappée j (parcours en profondeur) :

```
Δ_j = θ_bvh(j) − starting_theta(j)                        (absolu : l'os prend l'angle du BVH, quel que soit le dessin)
rot_locale(parent(j)) = Δ_j − Δ_parent(j)   si le parent est lui-même mappé (attribut current_theta présent)
                      = Δ_j                 sinon
```

- **La rotation est posée sur le PARENT** (l'os parent → j tourne autour du parent). Deux enfants mappés d'un même
  parent s'écrasent : le dernier gagne. Les configs évitent donc de mapper `right_shoulder`, `left_shoulder`, `hip` et
  les hanches.
- **Défaut réel.** Si le parent n'est pas mappé (épaule) mais que **son** parent l'est (torse via `neck`), la rotation
  du tronc **s'ajoute** à celle du bras. On obtient `monde(bras) = Δ_neck + Δ_elbow` au lieu de `Δ_elbow`, car
  l'attribut `current_theta` n'existe que pour les articulations mappées.
- **Chez nous** : on calcule les rotations locales exactes (§ 9.3).

---

## 5. BVH (`model/bvh.py`)

### 5.1 Lecture

- `HIERARCHY` ; `ROOT|JOINT nom` ; `{` ; `OFFSET x y z` ; `CHANNELS n …` ; enfants ; `}`.
- `End Site` devient une articulation nommée **littéralement « End Site »**, sans canaux.
- `MOTION` ; `Frames: N` ; `Frame Time: dt` ; N lignes de flottants.

Canaux :

- On garde **les rotations de toutes les articulations** et **les 3 premiers canaux** de la racine
  (`mask[:3] = True`, « hack »).
- Les canaux de position hors racine sont jetés.
- Rotations : Euler en **degrés**, dans l'ordre des canaux.
- Conversion : `Q = q_a1 · q_a2 · q_a3` (produit de Hamilton, `[w, x, y, z]`, `from_euler_angles` + `reduce`).
  C'est-à-dire `R = R_a1 · R_a2 · R_a3`, intrinsèque, la convention BVH standard.

Image f :

```
W_root(f) = G · T(pos(f)) · R_root(f)          (pos(f) remplace l'OFFSET de la racine)
W_j(f)    = W_parent(f) · T(offset_j) · R_j(f)
```

Test AD (`zombie.bvh`) : 34 articulations, End Sites compris ; 779 images ; `frame_time` = 0,0333333.

### 5.2 Pièges de lecture (à corriger dans le portage)

- `split(' ')` casse sur les tabulations et les doubles espaces. Découper sur `/\s+/`.
- Noms « End Site » en double : les nommer `${parent}_fin`.
- Le hack `mask[:3]` suppose que la racine commence par Xposition, Yposition, Zposition. Lire l'ordre réel des canaux.
- Les positions par articulation, présentes dans certains BVH, sont perdues. Les appliquer comme translation locale.
- Pas d'interpolation entre images, et `BVH.update` boucle (`% frame_max_num`) alors que le retargeter **borne** à la
  dernière image : deux comportements différents.

Clips fournis dans le dépôt (MIT avec le dépôt ; voir § 12) :

| Clip | Images | dt | Haut |
|---|---|---|---|
| `fair1/dab` | 339 | 1/30 | +z |
| `fair1/wave_hello` | 839 | 0,008342 (≈ 120 i/s) | +z |
| `fair1/jumping` | 654 | 0,008342 | +z |
| `fair1/zombie` | 779 | 1/30 | +z |
| `cmu1/jumping_jacks` | 125 | 1/30 | +y |
| `rokoko/jesse_dance` | 1 007 | 0,01 | +y, squelette type Mixamo |

---

## 6. Retargeter (`model/retargeter.py`)

### 6.1 Normalisation globale (au chargement, à l'image 0)

1. Si `up: +z` : rotation du BVH par `Q_up = Ry(−90°)·Rx(−90°)`, posée sur l'objet BVH (parent de la racine).
2. `fwd` à l'image 0, puis `rotation_offset(rotate_between(fwd, +X))`.
3. `set_scale(motion_cfg.scale)`, par exemple 0,025 pour fair1.
4. Décalage pour que la racine soit à l'origine, puis translation en y pour que `groundplane_joint` (LeftFoot ou
   LeftAnkle) soit à y = 0.

### 6.2 Avant par image

```
fwd(f) = normaliser( Y × moyenne_k normaliser(P_bk(f) − P_ak(f)) )   paires : (LeftShoulder→RightShoulder), (LeftUpLeg→RightUpLeg)
```

`Y × v` est perpendiculaire à Y : fwd est donc horizontal. Pour un acteur face à +Z, le vecteur gauche → droite vaut
−X, et Y × (−X) = +Z, ce qui est correct.

### 6.3 Positions normalisées (toutes les images, tableau `F × 3J`)

```
N_j(f) = Ry(α_f) · (P_j(f) − P_root(f)),   α_f = atan2(fwd_z, fwd_x),
Ry(α) = [[cos α, 0, sin α], [0, 1, 0], [−sin α, 0, cos α]]   ⇒ fwd(f) ↦ +X
```

Chaque image regarde +X, la racine est à l'origine. Gauche du personnage = −Z, droite = +Z.

### 6.4 Plan de projection par groupe : la « perspective tordue »

`bvh_projection_bodypart_groups` donne des groupes (Upper Limbs, Lower Limbs, Trunk), chacun avec une méthode :

- `frontal` : normale X, `π(v) = (−v_z, v_y)`. Caméra devant le personnage : la gauche du personnage va à droite de
  l'écran.
- `sagittal` : normale Z, `π(v) = (v_x, v_y)`. Profil vu depuis le côté droit, avant = +x à l'écran.
- `pca` : on prend tous les `N_j(f)` du groupe, toutes images confondues ; PCA **centrée** ; e3 = vecteur propre de la
  plus petite valeur propre ; on choisit frontal si |e3·X| > |e3·Z|, sinon sagittal.
  - **Un seul plan par groupe et par clip** (statique).
  - Chez nous : covariance 3×3 et Jacobi (30 lignes).

Configs livrées :

| Config | Bras | Jambes | Tronc |
|---|---|---|---|
| `fair1_ppf`, `cmu1_pfp`, `six_arms`, `four_legs` | pca | pca | frontal |
| `fair1_spf` | sagittal | pca | frontal |
| `mixamo_fff` | frontal | frontal | frontal |

Cas typique : bras de face (gestes lisibles), jambes de profil quand on marche ou qu'on saute, tronc de face.

### 6.5 Angles des os du dessin

Pour chaque entrée `char_joint: (bvh_prox, bvh_dist)` :

```
u(f) = π_{plan(bvh_dist)} (N_dist(f) − N_prox(f))       ← plan de l'articulation DISTALE
θ_AD(f) = degrés(atan2(u_y, u_x) − atan2(1, 0)) mod 360   (antihoraire depuis +Y, y vers le haut)
```

- Les longueurs du dessin sont conservées : aucun raccourci perspectif.
- Les deux articulations BVH ne sont pas forcément voisines. Par exemple `neck: (Hips, Neck)` : la tête suit la
  direction de tout le tronc.

### 6.6 Profondeurs et racine

- **Profondeur** : `d_j(f) = N_j(f)·normale(groupe(j))`, soit x en frontal, z en sagittal. Plus grand = plus près de la
  caméra.
- **Racine**, avec `Δ(f) = P_root(f) − P_root(f−1)` (repère global, après échelle) :
  - horizontal : `h = Δ·fwd(f)` si le groupe `bvh_projection_bodypart_group_for_offset` (en général Lower Limbs) est
    sagittal ;
  - sinon `h = Δ·lat(f)`, avec `lat = (−fwd_z, fwd_y, −fwd_x)` (gauche du personnage, donc droite de l'écran en
    frontal) ;
  - `R(f) = R(f−1) + k·(h, Δ_y)`, avec `R(0) = 0` ;
  - `k = L_dessin / L_bvh` = rapport des sommes de longueurs des chaînes de jambes
    (`char_bvh_root_offset.char_joints` / `bvh_joints`).
- Position finale : `char_starting_location + (R_x, R_y, 0)`.
- **Aucun contact au sol** : le sol n'est calé qu'à l'image 0, et un saut, c'est Δ_y mis à l'échelle.

### 6.7 Tests à l'exécution

`char_runtime_checks: [[above, neck, right_shoulder, left_shoulder]]`.

- Si le nez du dessin est **sous** la droite épaule D → épaule G, on retire `neck` du mapping (personnages « têtards »).
- Notre équivalent : ne pas mapper `tete`/`cou` si leur `angleRepos` pointe vers le bas.

### 6.8 Échantillonnage

`frame_idx = round(t / dt)`, borné à [0, N−1]. Pas d'interpolation, temps cumulé par additions. C'est la cause des
saccades notées en note 01. **Chez nous** : t continu, interpolation à l'arc le plus court entre ⌊f⌋ et ⌈f⌉.

---

## 7. Ordre de rendu par partie (`_initialize_joint_to_triangles_dict`, `_set_draw_indices`)

- **Attribution des triangles** :
  - Dijkstra multi-sources sur les pixels du masque (8-voisinage, coûts 1 et 1,414) ;
  - 20 graines par os, échantillonnées de l'articulation distale vers son parent ;
  - chaque triangle prend l'os le plus proche de son centroïde ;
  - les triangles de chaque os sont triés par distance **décroissante** : le plus proche de l'os est dessiné en dernier,
    donc dessus.
- **Ordre par image** :

  ```
  pour chaque groupe g de char_bodypart_groups :  prof_g = moyenne_{d ∈ bvh_depth_drivers(g)} d_j(f)
  trier les groupes par prof_g croissante (loin → près)
  dans chaque groupe : char_joints dans l'ordre listé si prof_g > 0, en ordre inverse sinon
  ```

  fair1_ppf : `{Hips: épaules, hanches, hip, torso, neck}`, `{LeftHand: left_elbow, left_hand}`, `{RightHand: …}`,
  `{LeftFoot: left_knee, left_foot}`, `{RightFoot: …}`.
- **Défauts** :
  - clignotement quand une profondeur passe par 0 (pas d'hystérésis) ;
  - on ne réordonne que des parties d'un **même** maillage soudé ;
  - une partie jamais peinte reste invisible.

---

## 8. Format des configurations (récapitulatif pour notre format)

| Fichier AD | Rôle | Équivalent proposé |
|---|---|---|
| `char_cfg.yaml` | taille, squelette de 16 points | `rig.json` (déjà plus riche : os, pivots, limites, groupes, ancrages) |
| `motion_cfg.yaml` | `filepath`, `start/end_frame_idx`, `frame_time`, `groundplane_joint`, `forward_perp_joint_vectors`, `scale`, `up` | `mocap/<clip>.json` : mêmes champs + `licence`, `boucle`, `contactsPieds` (calculés) |
| `retarget_cfg.yaml` | groupes de projection, `char_bodypart_groups`, `char_bvh_root_offset`, `char_joint_bvh_joints_mapping`, `char_runtime_checks`, `char_starting_location` | `mocap/squelettes/<type>.json` (fair1, mixamo, cmu) : mapping **vers nos noms d'os** (§ 9.2), groupes, chaînes de jambes ; la position de départ vient du placement de la scène |
| `mvc_cfg.yaml` | scène, caméra, sortie | inutile : `projet@1` |

Extrait du mapping fair1 (`fair1_ppf.yaml`) :

```yaml
char_joint_bvh_joints_mapping:
  torso: [Hips, Spine3]
  neck: [Hips, Neck]
  right_elbow: [RightArm, RightForeArm]
  right_hand: [RightForeArm, RightHand]
  right_knee: [RightUpLeg, RightLeg]
  right_foot: [RightLeg, RightFoot]
  # left_* idem
```

Variantes :

- `mixamo_fff` : `torso: [Hips, Spine2]`, `neck: [Hips, Head]` ;
- `cmu1_pfp` : `torso: [Hips, Chest2]`, `neck: [Hips, Head]`, bras `RightShoulder→RightElbow→RightWrist`, jambes
  `RightHip→RightKnee→RightAnkle`.

---

## 9. Carte de portage TypeScript

### 9.1 Fichiers

| Fichier (nouveau) | Contenu | Pur / page |
|---|---|---|
| `src/rig/creux.ts` | matrice creuse symétrique (assemblage par triplets), Cuthill-McKee inverse, LDLᵀ en ligne de ciel, descente et remontée | pur, embarquable |
| `src/rig/arap.ts` | `precalculerArap(rig, options)`, `resoudreArap(pc, cibles, sortie, peau?)`, choix des poignées par composante (§ 9.2) | pur, embarquable |
| `src/rig/index.ts` | `MethodePeau = 'lbs' \| 'cor' \| 'arap'` ; `deformer(…, {methode})` | — |
| `src/rendu/personnageRendu.ts` l. 154 | `deformerSommets(…)` → `deformerPeau(rig, fk, methode)` (défaut CoR, ARAP sur option du projet ou du personnage) | page |
| `src/mocap/bvh.ts` | lecture BVH robuste, FK (quaternions ou matrices 3×3), positions `Float32Array(F·J·3)` | pur (le texte est lu en Node, les pistes passent par `Ressources`) |
| `src/mocap/retarget.ts` | normalisation, `fwd`, plans (frontal / sagittal / PCA par Jacobi), angles écran par os, profondeurs, racine, contacts des pieds | pur, au chargement |
| `src/mocap/squelettes/*.json` | fair1, mixamo, cmu : mapping vers nos os, groupes, chaînes de jambes | données |
| `src/anim/actions.ts` / `couches.ts` | action `mocap` (`IdAction` accepte déjà une chaîne libre) → contributions de couche `base` par os | pur |
| `THIRD_PARTY_NOTICES.md` | bloc MIT d'AD (§ 12) si une ligne est portée | — |

### 9.2 Poignées = nos articulations (`rig.json`)

Points du squelette posés par `calculerFK` :

- `etat.pivots[b]` : pivot posé de chaque os ;
- `boutPose(squelette, etat, b)` : bout des os feuilles (tête, mains, pieds) ;
- cibles de poignées : `q = [pivots…, bouts…]` (2P).

Correspondance (os `rig.json` → articulation AD → BVH fair1 / mixamo / cmu) :

| Point de poignée (nos os) | AD | Os mappé (angle) | fair1 (prox → dist) | mixamo / rokoko | cmu1 |
|---|---|---|---|---|---|
| `bassin.pivot` | `root` = `hip` | — (racine : `PoseRacine`) | — | — | — |
| `torse.pivot` (taille) | — (poignée en plus) | `torse` ← | Hips → Spine3 | Hips → Spine2 | Hips → Chest2 |
| `cou.pivot` (base du cou) | `torso` (milieu des épaules) | `cou` ← | Spine3 → Neck | Spine2 → Neck | Chest2 → Neck |
| `tete.pivot` + ½ longueur | `neck` (= nez) | `tete` ← | Neck → Head | Neck → Head | Neck → Head |
| `brasD.pivot` (= bout d'`epauleD`) | `right_shoulder` | `epauleD` : non mappé (rigide avec le torse), comme AD | — | — | — |
| `avantBrasD.pivot` (coude) | `right_elbow` | `brasD` ← | RightArm → RightForeArm | idem | RightShoulder → RightElbow |
| `mainD.pivot` (poignet) | `right_hand` | `avantBrasD` ← | RightForeArm → RightHand | idem | RightElbow → RightWrist |
| `mainD` bout | — (en plus) | `mainD` ← | RightHand → RightHandEnd | RightHand → RightHandMiddle1 | RightWrist → rhand |
| `cuisseD.pivot` (hanche) | `right_hip` | — | — | — | — |
| `jambeD.pivot` (genou) | `right_knee` | `cuisseD` ← | RightUpLeg → RightLeg | idem | RightHip → RightKnee |
| `piedD.pivot` (cheville) | `right_foot` | `jambeD` ← | RightLeg → RightFoot | idem | RightKnee → RightAnkle |
| `piedD` bout | — (en plus) | `piedD` ← | RightFoot → RightToeBase | idem | RightAnkle → RightToe |

Le côté G est symétrique (`Left*`). Notre `D` est le côté droit du personnage, comme `right_` chez AD : aucun miroir à
ajouter.

**Poignées par composante.** C'est indispensable chez nous : 8 composantes, avec des pièces qui se recouvrent (le bras G
passe sur le torse). Pour chaque point du squelette appartenant à l'os b, on crée une poignée dans chaque composante qui
contient un triangle **admissible** près du point. Un triangle est admissible si la `partie` (étiquette par sommet,
présente dans `rig.json`) de ses sommets vaut b, parent(b) ou un enfant de b.

- On prend le triangle admissible qui contient le point, sinon le plus proche, avec des barycentriques bornées à [0, 1].
- Une poignée n'est **jamais** jetée en silence, contrairement au `pin_mask` d'AD.
- Exemple : l'épaule `brasG.pivot` donne une poignée dans la pièce du bras (étiquette `brasG`) et une dans la pièce
  principale (`epauleG`/`torse`).
- Une composante sans poignée, ou avec une seule poignée (rotation libre), est singulière. AD masque le problème par
  +1e-8·I. **Chez nous**, au choix :
  1. la composante suit la peau CoR (pas d'ARAP sur elle) ;
  2. mode hybride : attache douce à la peau (§ 9.4), qui rend tout le système défini positif.

### 9.3 Angles du BVH → `Pose.os[b].rotation`

Nos conventions : y vers le bas, angles en radians, **positif = horaire à l'écran**, `angleRepos` absolu du pivot vers
le bout.

```
u_b(f) = π_plan(dist)(N_dist(f) − N_prox(f))        (repère y haut, § 6.4)
φ_b(f) = atan2(−u_by, u_bx)                         (angle écran absolu, y bas, horaire positif)
```

Mode **absolu**, comme AD :

```
Δ_b = enrouler(φ_b − angleRepos_b)    si b est mappé
Δ_b = Δ_parent(b)                     sinon (suit son parent rigidement)
Δ_bassin = 0                          (l'inclinaison du corps entier passe par PoseRacine.rotation, facultatif)
rotation_b = enrouler(Δ_b − Δ_parent(b))     ← exact : angle absolu posé = angleRepos_b + Σ_{ancêtres∪b} rotation = φ_b
```

Mode **relatif**, qui garde la pose dessinée : `Δ_b = enrouler(θ_b(f) − θ_b(f_ref))`, avec `f_ref` = image de
référence (pose neutre du clip). Un mélange des deux par os est possible avec un poids α ∈ [0, 1].

Précalcul au chargement :

- on stocke `φ_b(f)` pour toutes les images, **déroulé dans le temps** (sans sauts de 2π) ;
- quand `|u_b| < 0,25·|N_dist − N_prox|` (os pointé vers la caméra), l'angle est instable : on remplace ces images par
  une interpolation entre leurs voisines fiables ;
- filtre ressort facultatif (`noyau/pistes`).

À l'évaluation, `f = (tJeu − t0)·vitesse/dt` (boucle ou butée selon l'action), puis interpolation linéaire des angles
déroulés.

**Limites** : nos limites douces (`limiterDoux`) écrêtent la mocap. Il faut les élargir pour les actions mocap, ou
passer `limites: false` à la FK.

Miroir :

- dessin tourné vers la gauche (`orientationDessin = −1`) : inverser `u_x` des groupes sagittaux ;
- regard retourné en scène : `PoseRacine.flip`, appliqué après.

### 9.4 Modes de peau proposés

| Mode | Système | Par image | Rôle |
|---|---|---|---|
| `cor` (défaut actuel) | — | O(V) | inchangé tant que la nouvelle voie n'est pas prouvée |
| `arap` (fidèle à AD) | N1 (2V) + N2 (V), poignées = § 9.2 | 1 + 2 résolutions | reproduction exacte d'AD (tests de référence § 2.6) |
| `arap-peau` (hybride, recommandé ensuite) | N1 + Λ², N2 + Λ² (diagonale `λ_v²` ajoutée) | idem, seconds membres + `λ_v²·x_cor` | chaque composante est bien posée ; tête et mains quasi rigides |
| `arap-squelette` (extension, pas dans AD) | N2 + Λ² seulement | 2 résolutions V×V | rotations d'arête tirées des os, ≈ 3× moins cher |

Valeurs de départ pour `arap-peau`, **à régler par mesure** (erreur de longueur d'arête et écart à la peau) :

- tête (`partie` = tete) : λ ≈ 2 à 3 ;
- mains et pieds : ≈ 1 ;
- torse : ≈ 0,3 ;
- bras et jambes : ≈ 0,05 à 0,15.

Le cas de la tête compte : les ancrages du visage sont transportés par la matrice de l'os de la tête
(`personnageRendu`, partie linéaire de `K_tete`). Il faut que la tête reste rigide, sinon les yeux et la bouche se
décalent de la peinture.

Pour `arap-squelette`, la rotation de chaque arête vaut `θ_k = ½(θ_i + θ_j)`, où θ_v est l'angle mélangé du sommet
(formule déjà dans `peau.ts` : `θ_ref + Σ w_j·enrouler(θ_j − θ_ref)`). Cible : `ê_k = R(θ_k)·e_k`. Les longueurs de repos
sont imposées, donc pas d'effet « ruban ».

### 9.5 Ordre de dessin → `Pose.ordreGroupes`

Nos groupes (Modou) : `brasG` 0, `jambeG` 1, `jambeD` 2, `corps` 3, `tete` 4, `brasD` 5, `dessous` −1.

Pilotes de profondeur :

| Groupe | Pilote |
|---|---|
| `brasG` / `brasD` | LeftHand / RightHand (moyenne avec ForeArm) |
| `jambeG` / `jambeD` | LeftFoot / RightFoot |
| `corps`, `tete` | Hips |

Règle :

```
devant si d_g − d_Hips > +m  →  ordre = ordre(corps) + 0.5 (+ ordre de repos / 10)
derrière si < −m             →  ordre de repos s'il est déjà derrière, sinon ordre(corps) − 0.5
entre les deux               →  ordre de repos
```

- La marge `m` vaut environ 0,08 × longueur des jambes BVH.
- On précalcule sur tout le clip, puis on **supprime les bascules plus courtes que 6 images**. C'est une hystérésis
  déterministe : le clip est connu à l'avance.
- `dessous` reste toujours à −1.
- Dessin de trois quarts : ne pas faire passer devant un membre dont la partie cachée n'est pas peinte. C'est une liste
  par rig, par exemple `brasG` autorisé seulement si `rig.groupes` le dit complet.
- **À l'intérieur d'un groupe**, l'ordre d'AD (proximal puis distal, inversé si le groupe est derrière ; triangles triés
  par distance à l'os) se reproduit en triant **au chargement** les triangles d'un groupe par `(rang de l'os dans la
  chaîne, −distance à l'os)`. On garde les deux sens prêts, le choix est fait à l'image. Cela compte quand ARAP replie
  l'avant-bras sur le bras.

### 9.6 Racine et pieds

- `k_px = (Σ longueurs cuisse + jambe, G et D, en px) / (Σ longueurs BVH correspondantes)`.
- `PoseRacine.decalage = (k_px·R_x(f), −k_px·R_y(f))`. Le y est inversé, et les sauts deviennent des y négatifs.
- **Choix à faire par action** :
  - `surPlace` : x = 0, y gardé, pour les gestes et les danses ;
  - ou bien la translation x alimente le **trajet au sol** de la scène (`scene/`), plutôt que le décalage. Sinon le
    personnage quitte son placement.
- **Contacts des pieds** : à détecter au chargement (hauteur de la cheville < seuil et vitesse < seuil). Pendant un
  contact, l'IK à deux os existante (`appliquerIK`) verrouille le pied à sa position de contact, avec une **force**
  mélangée à l'arc le plus court (§ 11). AD n'a rien de tel, et notre porte qualité mesure déjà le glissement des pieds.

### 9.7 Coût total par image et par personnage

| Poste | Coût |
|---|---|
| Retarget | interpolation d'environ 14 angles, négligeable |
| FK | inchangée |
| ARAP fidèle sur le maillage dense de Modou | environ 12 Mflop, estimé 10 à 20 ms |
| Variante V×V seule | environ 4 Mflop |
| Factorisations | une fois par rig, à la préparation des ressources de la page : estimé 0,3 à 1 s en ligne de ciel |

Si c'est trop lourd (flou de bougé, trois personnages), deux leviers :

- dissection emboîtée géométrique : facteur environ 5 sur le remplissage ;
- maillage ARAP grossier par composante (≤ 400 à 1 500 sommets, `construireMaillage` avec un pas plus grand), sur
  lequel on **plonge** le maillage fin en barycentriques par composante. C'est la règle « ARAP creux à froid sur
  ≤ 400 sommets » de l'audit.

---

## 10. Pièges (liste de contrôle du portage)

### Algèbre et maillage

1. **Jamais de construction dense** : 2,9 Go pour A1 sur Modou. Assembler par triplets creux.
2. **Factoriser une fois.** AD refactorise à chaque `spsolve`, trois fois par image. Ensemble de poignées et `w` fixes :
   activer ou retirer une poignée impose de refactoriser.
3. **Le test `det == 0`** sur une matrice 16 k × 16 k est faux (le déterminant déborde ou s'annule) et coûte O(n³). On
   vérifie plutôt le nombre de poignées par composante.
4. **Poignées hors maillage** jetées en silence chez AD. Chez nous : triangle admissible le plus proche, avec un
   journal.
5. **Pièces superposées** : AD prend le *premier* triangle qui contient le point, quelle que soit la pièce. Filtrer par
   `partie` (§ 9.2).
6. **Positions en double** : 705 dans Modou (coutures). Si `S_k < ε` ou si une arête a une longueur nulle, on ignore
   l'arête.
7. **`(c, s)` presque nul** : garde `r < 1e-12 ⇒ (1, 0)`.
8. **ARAP refuse l'échelle** : en mode fidèle, le squash & stretch par os (`TransformOs.echelle`) ne passe que par les
   poignées. `PoseRacine.echelle`, appliquée après, n'est pas touchée.
9. **Visage** : rendre la tête rigide (λ fort), sinon les ancrages portés par `K_tete` se décalent.

### Conventions et retargeting

10. **Conventions d'angle.** AD : degrés, antihoraire depuis +Y, y vers le haut, modulo 360. Nous : radians, horaire
    depuis +X, y vers le bas : `φ = atan2(−u_y, u_x)`. Enrouler **avant** toute différence ou tout mélange.
11. **Défaut d'AD** sur un parent non mappé : la rotation du tronc s'ajoute à celle du bras (§ 4.3). On calcule les
    rotations locales exactes.
12. **Plan de l'articulation distale** pour chaque os (pas celui de l'articulation proximale).
13. **Plan PCA statique par clip.** Deux clips dont les plans diffèrent, mélangés, peuvent faire basculer un bras.
    Mélanger les **angles écran** et non les positions 3D, et prévenir quand les plans diffèrent.
14. **Os pointé vers la caméra** : angle instable, à combler au précalcul (§ 9.3).
15. **Échantillonnage** : `round` sans interpolation chez AD. Pour nous : `t` continu, interpolation, et boucle ou butée
    explicites.
16. **Sol** calé à l'image 0 seulement, pas de contacts : verrouillage par IK (§ 9.6).
17. **Le « neck » d'AD est le nez.** Test « above » pour les têtes qui pointent vers le bas.
18. **Plusieurs enfants mappés d'un même parent** (AD : le dernier gagne). Chez nous, un os = une transformation : pas
    de conflit, mais il faut garder le mapping « os distal ».

### Rendu et intégration

19. **Clignotement d'ordre** : hystérésis par précalcul (§ 9.5).
20. **Repliement** dans un groupe : trier les triangles (§ 9.5).
21. **Limites douces** : elles écrêtent les grands gestes de la mocap.
22. **Flou de bougé** : le coût d'ARAP est multiplié par le nombre de sous-instants.
23. **Miroir** : `orientationDessin = −1` → inverser x des groupes sagittaux.
24. **Ne pas porter** les rotations de 270° du masque et l'échange u/v d'AD : nos coordonnées sont des px image, y vers
    le bas.
25. **Temps cumulé** (`TimeManager`) chez AD. Chez nous, `evaluer(projet, t)` reste pur.

---

## 11. DragonBones et Rive : mélange d'animations, ce qu'il faut reproduire

Notre `anim/couches.ts` a déjà :

- les couches `base`, `geste` et `additif` ;
- les masques par zone, graduels ;
- les priorités et l'atténuation `1 − masque·présence(t)` ;
- les fondus lissés (0,2 s / 0,35 s) ;
- les ressorts par os ;
- l'inertialisation quintique dans `noyau/`.

Voici ce que les deux runtimes apportent en plus pour **mélanger de la mocap avec notre jeu procédural**.

1. **Reste du poids par os** (DragonBones `BlendState.update`, `AnimationState.ts` l. 1553-1592) :
   - les états sont parcourus de la couche la plus haute à la plus basse ;
   - le premier fixe `leftWeight = 1` ;
   - dans une même couche, les poids `w·leftWeight` s'additionnent (`layerWeight`) ;
   - au changement de couche, `leftWeight −= layerWeight`, et les couches inférieures sont ignorées si
     `layerWeight ≥ leftWeight` ;
   - la valeur d'un os vaut `Σ blendWeight·valeur` : le premier écrit, les suivants ajoutent.

   Pour nous : la mocap occupe la couche `base`. Un geste procédural masqué sur `brasD` lui prend ses poids, et la mocap
   ne reçoit que le reste. C'est normalisé, déterministe et indépendant de l'ordre, contrairement à Rive.
2. **Poids des fondus** :
   - DragonBones : `poids = weight × fadeProgress`, linéaire. Un fondu de sortie démarre de la progression courante
     (`fadeTotalTime = fadeOutTime / fadeProgress`, l. 1162), donc sans saut ;
   - Rive (`state_machine_instance.cpp` l. 1016-1027) : on applique l'état de départ au mix `mixFrom` (valeur figée à
     l'interruption), puis l'état d'arrivée avec `mix ∈ [0, 1]`, transformé par l'**interpolateur** de la transition ;
   - chaque clé Rive fait `valeur = courant·(1 − mix) + clé·mix` (`keyframe_double.cpp`). C'est un lerp séquentiel qui
     **dépend de l'ordre** : à éviter.

   Pour nous : fondus de poids normalisés en fonction pure de `t` (cubique), et, entre deux clips, **inertialisation**
   (l'écart au moment du changement décroît en quintique) plutôt qu'un fondu croisé « mou ».
3. **Rotations mélangées à l'arc le plus court** :
   - DragonBones normalise les différences d'angle (`normalizeRadian`, `TimelineState.ts` l. 300-321) ;
   - Rive `IKConstraint` (l. 298-317) mélange FK et IK par `strength` sur la différence enroulée dans ]−π, π].

   Pour nous : tout mélange d'angles mocap (entre clips, mocap ↔ procédural, FK ↔ IK des pieds) passe par
   `enrouler(b − a)`.
4. **Mélange 1D entre clips** :
   - Rive `BlendState1DInstance::apply` : on trie les animations par valeur, on cherche les deux qui encadrent l'entrée,
     et `mix = (v − a)/(b − a)` ;
   - DragonBones `E1D` : les deux voisins les plus proches d'un paramètre.

   Pour nous : un paramètre `energie` ou `vitesse` par action mocap (marche ↔ course, salut calme ↔ salut exubérant),
   avec les poids des deux clips encadrants.
5. **Heure de sortie et synchronisation de phase** :
   - Rive `StateTransition::exitTimeSeconds` (l. 112-131) : une transition ne part qu'après un pourcentage du clip
     source.

   Pour nous : un changement de clip cyclique ne commence qu'à une marque de phase (contact de pied), et les deux cycles
   tournent en temps normalisé (phase commune), pour ne pas croiser les jambes.
6. **Additif au-dessus de la mocap** (DragonBones `additive`, `result += valeur·poids`) : respiration, micro-vie, hochements
   de tête de la parole et regards s'**ajoutent** en rotations locales après la mocap. Ce sont nos couches `additif`
   actuelles : il suffit de vérifier qu'elles s'appliquent après les contributions mocap.

Ce qu'on **ne** reprend **pas** : l'état mutable de DragonBones et Rive (`advance(dt)`, objets en pool). Toutes les
grandeurs ci-dessus sont des fonctions pures de `tJeu` et des heures de début et de fin des actions.

---

## 12. Licence et notices

- AD : MIT, « Copyright (c) Meta Platforms, Inc. and affiliates ».
- Si une ligne ou une structure est **portée** (et pas seulement réécrite depuis les formules d'Igarashi et Igarashi),
  ajouter à `moteur-fluide/THIRD_PARTY_NOTICES.md` :

```
### Animated Drawings (facebookresearch/AnimatedDrawings) — MIT
Portage partiel en TypeScript de model/arap.py, model/retargeter.py et model/bvh.py
(commit b859684857519c7424da51a0b0862fbd1fd258f4, 03/09/2025) dans src/rig/arap.ts et src/mocap/.

MIT License
Copyright (c) Meta Platforms, Inc. and affiliates.
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### Clips BVH

- Les 6 clips sont livrés dans le dépôt MIT. Le README ne leur donne pas de licence séparée.
- `cmu1/jumping_jacks` vient de la base CMU. Conditions CMU, **à revérifier** avant publication : usage libre, y compris
  dans un produit commercial, mais sans revendre les données elles-mêmes.

Autres sources (**licences à vérifier une à une** ; nos vidéos TikTok sont monétisables, donc pas de « NC ») :

| Source | Statut |
|---|---|
| CMU (≈ 2 500 clips) | utilisable sous les conditions ci-dessus |
| 100STYLE | annoncé CC BY 4.0 |
| Bandai Namco Research Motiondataset | CC BY-NC : **non** |
| LAFAN1 | CC BY-NC-ND : **non** |
| Mixamo | licence Adobe, usage dans une œuvre, pas de redistribution des fichiers bruts : **ne pas versionner** |

Les clips vont dans `studio-troupe/sorties/cache/mocap/` ou dans un dossier `assets-test/` avec une provenance écrite.

---

## 13. Ordre de travail proposé (court, vérifiable)

1. **`rig/creux.ts`** : ordre de Cuthill-McKee inverse et LDLᵀ en ligne de ciel. Tests contre une résolution dense sur
   des matrices aléatoires définies positives et sur le laplacien de Modou.
2. **`rig/arap.ts`** en mode fidèle :
   - les 3 tests de référence d'AD (§ 2.6), repos = identité, invariance rigide, déterminisme ;
   - mesure du temps par image sur Modou (cible : moins de 20 ms).
3. **Méthode `'arap'`** dans `deformer` et `personnageRendu`, sur option. Défaut CoR inchangé ; `npm test` et
   `npm run typecheck` au vert.
4. **`mocap/bvh.ts`** : tests sur `zombie.bvh` d'AD (34 articulations, 779 images, dt = 0,0333333), et une égalité FK
   d'un clip `+z` contre `+y` après correction.
5. **`mocap/retarget.ts`** et `squelettes/fair1.json` : angles écran, plans, profondeurs, racine. Test : rendu `dab` sur
   le rig de référence (`rigReference`), puis sur Modou.
6. **Action `mocap`** dans les couches (base, masque, poids, fondu, `surPlace`), avec l'additif de vie au-dessus.
7. `ordreGroupes` par profondeurs, IK des pieds sur contact, mode `arap-peau`.
8. **Comparaison** CoR contre ARAP sur `dab`, `wave_hello` et `jumping`, avec la porte qualité. Ensuite seulement, on
   bascule le défaut.
