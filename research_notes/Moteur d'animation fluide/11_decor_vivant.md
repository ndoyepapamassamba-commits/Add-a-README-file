# Décor vivant : parallaxe en couches, figurants marionnettes, effets d'environnement et budget de rendu

Date : 16/10/2026. Piste « décor vivant ». Demande du propriétaire : « N'oublie pas l'arrière-plan aussi, il va falloir
l'animer. La fluidité des personnages, des discours, de la vidéo de manière générale. » La cible est le niveau Pixar ou
Disney. Cette note couvre **le fond** : caméra 2,5D, figurants, environnement et coût.

Conventions de source (comme les notes 05 et 07) :
- **[mesure]** : mesure faite dans ce conteneur, avec 4 vCPU partagés. La machine était **chargée** pendant les mesures
  (charge moyenne 8 à 9, un `sd-cli` tournait à côté). Les durées absolues sont donc pessimistes. Les écarts entre
  configurations, mesurés en alternance dans la même session, restent comparables. Scripts et images dérivées :
  `scratchpad/vivant/` uniquement, jamais versionnés.
- **[kit]** : le kit privé `studio-troupe/.private/kit/` (191 décors, jamais versionné).
- **[code]** : notre moteur `studio-troupe/moteur-fluide/` à la date de la note (commit `6d67ce3`).
- Sources tierces **lues pour apprendre**. Aucun code n'est copié. 3D Ken Burns (CC BY-NC-SA) : idées seulement.

---

## Résumé des décisions

1. **Caméra 2,5D : des couches plutôt que des tranches.** On garde la grille déplacée par la profondeur, qui marche,
   mais on la déchire là où il faut :
   - **une couche arrière complète** (plaque prolongée sous les objets proches) ;
   - **une ou deux couches avant** (les objets plus proches que leur entourage), détourées au pixel près ;
   - chaque couche a **sa propre profondeur aux sommets**, prolongée hors de son contour (« dilatation des couches
     proches »). Rien ne s'étire donc dans une partie visible.

   Les couches avant sont **désentrelacées** (`P = C − (1 − α)·B`). Au repos, l'empilement redonne **exactement** la
   peinture, comme aujourd'hui. Le budget de parallaxe passe de 26 px à **60 px** pour les mouvements posés, et à
   **90 px** quand un filé masque les bords.

2. **Figurants : de vraies marionnettes.**
   - Instances et masques par personne : **MediaPipe Pose multi-personnes** (Apache-2.0), sur l'image et sur
     6 tuiles.
   - Squelette affiné par RTMW sur la découpe de l'instance.
   - **Rig complet** construit par notre propre `rig/construire` (maillage, poids, CoR).
   - Jeu donné par un **« acteur de fond »** déterministe : conversations à tours de parole dans un groupe, écoute,
     rires, boire, regards vers celui qui parle, réactions aux gags. Une **retenue** baisse leur jeu quand un
     personnage principal parle.
   - Occultation au pixel par la profondeur, avec le shader d'occultation existant.
   - Mocap et ARAP de l'autre chantier : branchés par un **registre**, sans importer leurs fichiers.

3. **Environnement : une seule cause par phénomène.**
   - Un **vent spectral** par décor (méthode de Chuang et al. 2005, spectre en −5/3) pilote feuillages, palmes,
     rideaux, fumées, guirlandes et rides de l'eau.
   - **Une** modulation de lumière pilote les halos, les flaques de lumière et le gain des personnages.
   - Particules **analytiques**, fonctions pures du temps : fumée, vapeur, poussière, bokeh, braises.
   - Eau par texture de déplacement précalculée. Ombres de nuages. Respiration de la température de couleur par uniforme.

4. **Passants et véhicules : désactivés par défaut.**
   - Activables pour les **véhicules du décor lui-même** : leur plaque est propre, ils roulent le long d'une ligne
     d'iso-profondeur, sans changer d'échelle, avec occultation et flou de bougé.
   - Pas de passant glissant. Un passant n'est permis qu'avec un vrai cycle de marche, sur une marionnette debout de
     niveau A.

5. **Budget.**
   - Le temps de la vie du décor est **quantifié à l'image**. Le cache du décor entre sous-images reste valide ; sans
     cela, le coût est multiplié par N sous-images.
   - Aucun bruit procédural par fragment. Aucune passe plein écran nouvelle : pas de vrai bloom, la teinte est un
     uniforme.
   - Cible : **+30 à +70 ms par image** en 1080×1920, sur machine chargée, pour un plan riche. C'est ≈ 2 à 4 % du coût
     actuel du pilote, environ 1,8 s par image avec flou de bougé.

---

## Q1. Parallaxe 2,5D : couches de profondeur ou grille unique, et jusqu'où peut aller la caméra ?

### Takeaway
La grille unique actuelle (`decorRendu.ts`, 64 lignes) s'étire comme un drap aux sauts de profondeur. Elle tient parce
que le budget est petit : 26 px de déplacement relatif aux profondeurs extrêmes.

Les **tranches de profondeur uniformes** (3 à 5 seuils) sont à proscrire. Le sol, les murs et les tables sont des
rampes continues : un seuil les couperait, et une couture glisserait au milieu du sol.

La bonne découpe suit les **discontinuités**. Un objet est « avant » s'il est plus proche que **son entourage**, et non
que le reste du décor. Le chapeau haut-de-forme morphologique sur la profondeur fait exactement cela. L'ouverture
préserve les rampes, donc le sol en pente n'est pas détecté.

Sur le kit, les sauts aux bords des objets avant valent 0,26 au 95e centile, en médiane sur les décors. Un mouvement de
60 px ouvre donc des trous de 15 px de sortie, soit 4 à 6 px de plaque. **Seule une bande étroite le long du bord se
découvre**, et un remplissage « miroir » qui garde la texture y suffit.

### Cited Findings
- **Chuang et al., « Animating Pictures with Stochastic Motion Textures »** (SIGGRAPH 2005, ACM TOG 24(3) 853-860) :
  - le tableau est découpé en couches (« Bayesian matting ») ;
  - chaque trou laissé dans le fond est comblé par un inpainting par l'exemple (Criminisi 2003) ;
  - « the inpainting algorithm does not have to be perfect since only pixels near the boundary of the hole are likely
    to become visible ».
  - Sources : [page du projet](https://grail.cs.washington.edu/projects/StochasticMotionTextures/), [PDF SIGGRAPH](https://grail.cs.washington.edu/wp-content/uploads/2015/08/chuang-2005-apw.pdf)
- **3D Photo (Shih et al. 2020, code MIT)** : seuil de discontinuité de 0,04 sur la disparité, LDI à deux couches,
  petits mouvements (note 05 Q1).
- **SLIDE (Jampani 2021)** : couches **douces** plutôt que dures, pour les détails fins (note 05 Q1).
- **Guided filter** (He, Sun, Tang, ECCV 2010 ; TPAMI 2013) : `q = ā·I + b̄`, avec `a = cov(I,p)/(var(I)+ε)` et
  `b = p̄ − a·Ī` sur des fenêtres de rayon r.
  - Lissage qui préserve les contours, lié au laplacien de matting.
  - Il recale un masque grossier sur les contours de couleur du guide, pour un coût O(1) par pixel.
  - Source : [projet](https://people.csail.mit.edu/kaiming/eccv10/index.html), [PDF](https://people.csail.mit.edu/kaiming/publications/eccv10guidedfilter.pdf)
- [code] La grille du décor :
  - `projeterGrille` applique `p' = c + (p − c)·(1 + e·poussee) + e·decalage`, avec `e = d − dRef` ;
  - le budget `REGLAGES_DECOR.budgetPx = 26` est appliqué sur `|decalage|·dMax·ppu + |poussee|·dMax·demiDiag` ;
  - la plaque n'est dessinée que sous les personnes.
  - Aucune couche arrière n'existe pour les objets du décor : le G1 de la note 05 n'est pas implémenté.

**[mesure] Couches par chapeau haut-de-forme à hystérésis** (`couches_profondeur.py`, `plateDepth` 512, 191 décors) :
- Chapeau : `t = max_r (d − ouverture(d, disque r))`, avec r ∈ {6, 16, 40, 90} px de carte.
- Hystérésis : graines `t > 0,09`, croissance `t > 0,04`. Le sol est exclu, à moins de 0,05 du profil du sol, lui-même
  pris au quantile 30 % par ligne et rendu croissant vers le bas, sur la moitié basse. Les îlots de moins de 0,05 %
  sont supprimés.
- Deuxième niveau : la même opération dans l'avant, le dehors étant remplacé par la valeur de l'avant le plus proche.

| Indicateur (191 décors) | p10 | médiane | p90 |
|---|---|---|---|
| Part de l'image en couche avant 1 | 8,2 % | **22,1 %** | 37,3 % |
| Part en couche avant 2 (objet devant objet) | 1,8 % | 11,9 % | 25,6 % |
| Objets avant (composantes) | 3 | 6 | 10 |
| Saut de profondeur au bord, médiane du décor | 0,035 | 0,071 | 0,106 |
| Saut au bord, 95e centile du décor | 0,153 | **0,259** | 0,380 |

- Contrôle visuel des planches (scratchpad) :
  - `maquis` : toits, poteaux, télé, chaises et table ;
  - `plage` : palmiers, pirogue, rochers, panier ;
  - `marche` : parasols, pagnes suspendus, paniers de devant.
  - Ce sont les bons objets.
- Défaut restant : sur `plage`, une partie du sable du bas reste marquée. La profondeur y sature à 1, et le profil par
  ligne n'y suffit pas. Il faut le **modèle de sol** de `AnalyseDecor.sol` (`d = a·v + b`, r²) et le `praticable`
  existant, plutôt qu'un quantile.
- **Remplissage de la couche arrière** par miroir à travers le bord le plus proche, valide jusqu'à 12 px de plaque,
  puis fondu vers le push-pull au cœur. Résultat :
  - une texture crédible dans la bande qui se découvre ;
  - une bouillie au cœur des grands objets, que la caméra ne montre jamais avec le budget retenu.

### Inferences
**Algorithme retenu : « couches par discontinuité ».** Il est hors ligne, une fois par décor, en Node, pur et testable.
1. `d` = `plateDepth`. Sol = |d − (a·v + b)| < 0,05 sous l'horizon, d'après `AnalyseDecor.sol` (repli sur le quantile
   par ligne si r² < 0,8).
2. `t` = chapeau multi-échelle. Couche 1 = hystérésis (0,09 ; 0,04) hors sol, puis ouverture et îlots supprimés.
   Couche 2 = même chose dans la couche 1. On s'arrête là : un troisième niveau couvre moins de 2 % sur le kit.
3. **Détourage** : masque binaire agrandi à la résolution de la peinture, puis guided filter guidé par la peinture
   (gris, r = 4 px, ε = 10⁻³). On obtient un α doux recalé sur les contours peints. Les cartes de profondeur de Depth
   Anything ont des bords mous, décalés d'1 à 3 px.
4. **Couche arrière B** : peinture sans figurants (`src` hors figurants, `plate` dessous), là où l'α dilaté de 2 px est
   nul. Ailleurs : miroir à travers le bord le plus proche (transformée de distance avec indices, Felzenszwalb et
   Huttenlocher, déjà dans `rig/distance.ts`), fondu vers le push-pull (`remplirPushPull` existant) au-delà de 12 px.
5. **Couches avant désentrelacées** : texture prémultipliée `P1 = clamp(C − (1 − α1)·B, 0, α1)`. De même
   `P2 = clamp(C1 − (1 − α2)·B1, 0, α2)`, où C1 est l'image sous la couche 2, elle-même remplie.
   - Au repos, `P + (1 − α)·B = C` **exactement** : l'invariant actuel « l'empilement redonne la peinture » est gardé.
   - En mouvement, aucun liseré du fond ne suit l'objet. C'est le défaut du « découpage aux ciseaux ».
6. **Profondeur aux sommets par couche, sensible aux bords** :
   - pour la couche k, la profondeur de ses pixels est prolongée au-dehors par la valeur la plus proche : l'objet et
     sa marge bougent d'un bloc ;
   - pour B, la profondeur du fond est prolongée sous les objets avant : c'est le côté lointain qui s'étend ;
   - flou de 2 px de carte dans chaque couche, jamais à travers une couche.
   - Le seul étirement restant se trouve dans des zones transparentes, ou dans le remplissage, côté lointain et peu
     texturé.
7. **Rendu** : B opaque, puis couche 1, puis couche 2. Ce sont des grilles 129×65 dont les indices se limitent aux
   cellules où α > 0,01, comme `cellulesCouvertes` aujourd'hui. Il y a une seule texture de peinture et une texture
   prémultipliée par couche.

**Jusqu'où va la caméra.** Un trou mesure `w = Δd·A`, où A est le déplacement relatif en px de sortie à Δd = 1. En
9:16, au zoom 1, 1 px de plaque ≈ 3,6 à 3,9 px de sortie (plaque de 494 à 540 lignes pour 1920).

| Budget A (px) | Trou au saut p95 médian (0,26) | Au saut p95 du décor p90 (0,38) | En px de plaque (zoom 1) | Verdict |
|---|---|---|---|---|
| 26 (actuel, sans couches) | 6,7 px d'étirement | 9,9 px | – | drap visible si l'on regarde le bord |
| 60 (couches) | 15,5 px | 22,8 px | 4 à 6 | dans la bande miroir (12 px) : **retenu, mouvements posés** |
| 90 (couches + filé) | 23 px | 34 px | 6 à 9 | acceptable sous flou de bougé (filé, punch-in) |
| 120 et plus | 31 à 46 px | – | 8 à 12 | atteint le push-pull et l'effet « carton » : **refusé** |

- Au-delà de 60 px, la limite n'est plus le trou mais l'**effet carton**. Les objets sont plats : une translation
  relative de plus de ≈ 5 % de la largeur du cadre trahit la découpe.
- Le budget reste **analytique** par décor (G2 de la note 05) : `A_max = min(60, w_bande / Δd_p95)`. Ce n'est presque
  jamais `w_bande` qui limite.
- **Mode plat.** Quand la parallaxe de l'image est sous 0,5 px (caméra posée, cas par défaut), on dessine le chemin
  actuel : peinture opaque, plaque sous les personnes. Grâce à l'invariant de repos, la bascule plat ↔ couches est
  invisible, même au milieu d'un plan.

### Gaps
- Le guided filter n'a pas été mesuré sur le kit. La qualité de son recalage contre un α binaire est supposée, d'après
  l'article.
- Le modèle de sol par `AnalyseDecor.sol` n'a pas été rejoué dans le script (le quantile par ligne a suffi pour la
  statistique).
- Aucune vidéo de parallaxe à 60 px n'a été rendue : la limite « carton » vient du raisonnement, non d'un visionnage.

---

## Q2. Figurants : comment en faire des marionnettes crédibles ?

### Takeaway
Les figurants sont souvent **grands** à l'écran. Au zoom 1, la hauteur du décor fait 1920 px. Les deux rieurs du
`maquis` font 0,6 à 0,7 de cette hauteur, soit la taille d'un personnage principal.

La déformation de grille actuelle (64 lignes, respiration, balancement, tête) ne peut pas leur donner un vrai jeu. Il
leur faut un rig.

Le maillon faible n'est pas le squelette mais la **séparation des personnes** :
- les masses du masque rouge sont fusionnées (note 05 : 156 décors sur 191) ;
- couper en colonnes par le profil supérieur coupe des personnes en deux, puis RTMW invente des squelettes sur ces
  découpes ;
- **la confiance de RTMW ne détecte pas ces erreurs.**

**MediaPipe Pose en multi-personnes** règle la séparation : un masque de segmentation par personne, propre même quand
les personnes se chevauchent. RTMW sert ensuite d'affinage sur une découpe juste.

### Cited Findings
**[mesure] Plaque contre peinture** : ΔE Lab, après un flou de 1,2 px, sur 14 décors.
- Hors figurants : médiane 1,0 à 2,3, 95e centile 2,9 à 7,1. La plaque est **fidèle** hors figurants.
- Dans le masque des personnes : 16,6 à 45,2. La différence isole bien les figurants.
- Conséquence : la plaque peut servir de fond sous un figurant qui bouge, sans couture de couleur. Elle reste
  barbouillée **sous** les figurants, d'où des amplitudes qui gardent la silhouette.

**[mesure] RTMW sur des colonnes coupées au profil supérieur** (`figurants_rtmw.py`, 14 décors) :
- 0 à 28 découpes par décor, 0,2 à 0,3 s par découpe sur 2 fils.
- Sur `maquis`, plusieurs boîtes coupent une personne (buste et jambes séparés) ou mêlent deux personnes. Les
  squelettes y sont faux.
- Pourtant 8 découpes sur 11 passent le test de confiance « tête et épaules > 0,5 ».
- **Ne jamais se fier à la confiance de RTMW seule.**

**[mesure] MediaPipe Pose Landmarker heavy**, `num_poses = 12`, masques de segmentation, image entière + 2×3 tuiles
chevauchantes, fusion par IoU de masques > 0,3 :

| Décor | Instances (grossier) | Couverture des pixels personnes | s/décor | Instances (+ tuiles fines 3×6) | Couverture |
|---|---|---|---|---|---|
| maquis | 4 | 0,65 | 1,3 | 6 | 0,71 |
| marche | 3 | 0,79 | 0,7 | 4 | 0,82 |
| plage | 3 | 0,73 | 0,9 | 4 | 0,80 |
| rue-des-maquis-marcory | 6 | 0,32 | 1,1 | 12 | 0,37 |
| ecole | 7 | 0,55 | 1,4 | 11 | 0,65 |
| tribunal | 4 | 0,58 | 1,3 | 7 | 0,71 |
| salon-de-coiffure | 6 | 0,66 | 1,4 | 9 | 0,73 |
| village | 3 | 0,47 | 0,7 | 7 | 0,71 |

- Visuellement :
  - les grands figurants sont bien séparés, avec des squelettes plausibles (le professeur d'`ecole` qui montre le
    tableau, les deux rieurs du `maquis`) ;
  - les jambes des personnes assises sont moins sûres ;
  - les petites personnes lointaines (dîneurs de `rue-des-maquis`) manquent.
- Les **tuiles fines** gagnent des instances, mais créent des masques coupés net au bord des tuiles, et des poses à cheval
  sur deux enfants (`ecole`). Il faut rejeter tout masque qui touche un bord intérieur de tuile.
- Fiche du modèle : Apache-2.0, conçu pour « une seule personne » à moins de 4 m (note 03 Q6). Notre usage sort de ce
  cadre. Il est hors ligne et contrôlé par planche : acceptable, mais à surveiller.
- RTMW et MediaPipe s'accordent à 3,7 % de la longueur du torse sur un cartoon (note 06 Q3). Les poids de RTMW (données
  Cocktail14) restent **à confirmer côté licence** : ils servent à l'affinage optionnel, jamais seuls.

**[code]** Briques déjà présentes, pures, embarquables dans la page :
- `rig/construire.construireRig(SourceRig, image)` : squelette humanoïde de 18 os depuis `ArticulationsHumanoide`,
  maillage Delaunay conforme tiré de l'alpha, poids en bandes harmoniques, centres CoR ;
- `rig/peau.deformerSommets` (CoR / LBS) ;
- `visage/yeux` : clignements apériodiques, saccades ;
- `noyau/ressorts`, `noyau/aleatoire` (`hash01`, `bruit1D`) ;
- le shader `FRAGMENT_OCCULTATION` : redessine la peinture devant un personnage selon `plateDepth`.

**ARAP** (note 01) : l'ARAP d'Igarashi en deux étapes coûte 3,8 ms par image et par maillage de 500 à 1 800 sommets en
JS. Le skinning CoR coûte moins de 0,1 ms. Pour 10 à 20 figurants, le skinning s'impose. L'ARAP se réserve aux un ou
deux plus grands, s'il est disponible.

### Inferences
**Pipeline hors ligne par décor** (Python pour la détection, Node pour le reste) :
1. **α des figurants.** `α = P·(0,35 + 0,65·s(ΔE))`, avec `s = smoothstep(6, 16)` et P = `people.png`, ou R adouci
   s'il manque (13 décors seulement ont `people.png`). Puis guided filter sur `src`.
2. **Instances.**
   - MediaPipe heavy, sur l'image et sur 2×3 tuiles (0,62 H × 0,42 L).
   - Rejet des masques qui touchent un bord intérieur de tuile ; NMS par IoU > 0,3 ou inclusion > 0,6.
   - Instance = segmentation > 0,5 ∩ α > 0,25.
   - Les restes de α passent par le découpage en colonnes actuel (`detecterFigurants`) et deviennent des niveaux B ou C.
3. **Squelette.**
   - MediaPipe 33 points → `ArticulationsHumanoide` :
     - bassin = milieu des hanches ;
     - taille = 35 % du bassin vers les épaules ;
     - base du cou = milieu des épaules, relevé de 8 % du torse ;
     - base de la tête = entre la base du cou et le nez ;
     - sommet de la tête = haut du masque au-dessus du nez ;
     - mains et pieds = points 19/20 et 31/32.
   - Affinage RTMW (coudes, poignets, tête) sur la découpe de l'instance, fond gris. On ne garde un point RTMW que s'il
     est à moins de 10 % du torse de MediaPipe.
   - Une articulation de visibilité < 0,5 est **gelée** : limite ±0, le poids reste au parent.
4. **Niveaux** :
   - **A (marionnette)** : hauteur ≥ 120 px de `src`, nez et épaules visibles ≥ 0,6, largeur des épaules sur longueur
     du torse dans [0,3 ; 1,2], accord RTMW/MP ≤ 8 % du torse.
   - **A+** : niveau A avec un visage ≥ 40 px de large et des yeux trouvés par Face Landmarker (Apache-2.0). Il reçoit
     en plus des clignements.
   - **B (buste)** : hauteur ≥ 50 px. Colonne bassin → torse → cou → tête tirée du masque : tête = cercle ajusté au
     minimum du profil supérieur ; cou = largeur minimale sous la tête.
   - **C (foule)** : le reste. La vie de grille actuelle suffit (`deplacementsFigurants`).
5. **Rig.**
   - `SourceRig` avec `orientationDessin` tirée du décalage nez/épaules.
   - Limites serrées : tête ±12°, cou ±8°, torse ±5°, bras ±25°, avant-bras ±35°.
   - Pas de maillage `max(6, h/40)` px.
   - `construireRig`, puis rig complet en cache.
   - Texture **désentrelacée** contre la plaque : `P = clamp(src − (1 − α)·plate, 0, α)`. Plus de liseré du fond.
     Toutes les marionnettes du décor tiennent dans un atlas.
6. **Profondeur et occultation.**
   - `d_e` = médiane de `depth.png` sur le cœur de l'instance.
   - Le figurant est dessiné à sa profondeur (parallaxe de `d_e`), puis la peinture est redessinée par-dessus là où
     `plateDepth > d_e + 0,05`, dans sa boîte. On réutilise `FRAGMENT_OCCULTATION` avec un seuil par figurant : la
     table devant un convive assis reste devant quand il bouge.
7. **Groupes.** Des figurants à |Δd| < 0,06, séparés de moins de 1,2 largeur d'épaules, forment une tablée. Leur
   orientation donne qui regarde qui.

**Jeu : l'acteur de fond.** Module pur, fonction de (graine, t, état du décor).
- **Programme d'activités** par groupe : semi-Markov, tiré des graines et parcouru depuis le début du plan.
  - Tours de parole : durée log-normale, médiane 2,5 s, σ = 0,5 ; pauses de 0,3 à 1 s.
  - Les auditeurs **regardent l'orateur** et hochent la tête aux fins de tour (p = 0,5).
  - Rires : Poisson de 1/40 s par groupe.
  - Boire : Poisson de 1/45 s, niveau A, si la main est à portée de la bouche (IK de l'avant-bras).
  - Isolés : promenade du regard toutes les 2 à 6 s, vers l'action, un voisin ou ailleurs.
- **Recettes de pose**, relatives à la hauteur h :
  - respiration : torse ±0,6°, épaules +0,3 % h, période de 3 à 5 s ;
  - parler : battements de tête de 2 à 4 Hz de faible amplitude, accents de 0,6 à 1,2 Hz, avant-bras ±8°, buste
    penché de 1 à 2° vers l'auditeur ;
  - écouter : hochements lents de 0,3 à 0,5 Hz ;
  - rire : tête en arrière de 6 à 10°, épaules de 4 à 6 Hz amorties ;
  - boire : avant-bras vers la bouche, tête en arrière de 10°, 2,5 s ;
  - regarder : rotation de la tête de ±4° et cisaillement horizontal de ±2 % de la tête.
  - Les transitions passent par des ressorts critiques (`noyau/ressorts`) : la tête mène, le buste suit 60 à 120 ms
    après (chevauchement).
- **Plafonds** :
  - tête ≤ 1,5 % de h au repos, ≤ 4 % en parlant ou en riant ;
  - ≤ 12 px de sortie pour un niveau A proche.
  - Les limites du rig empêchent de découvrir la plaque barbouillée.
- **Retenue (mise en scène)** : amplitude × `(1 − 0,6·s(t))`, où s est l'indicateur lissé « un personnage principal
  parle » (`pistes.dialogue`). Dans un rayon de 0,25 largeur de cadre autour de sa tête, le facteur devient
  `(1 − 0,8·s)`. **Le fond ne vole jamais la réplique.**
- **Attention** : 35 % des figurants libres tournent la tête vers le point d'attention, c'est-à-dire la position de
  celui qui parle.
- **Réactions** : rire, surprise ou colère d'un personnage principal (`pistes.actions`), ou son `effet` marqué. Chaque
  figurant réagit avec une probabilité fonction de la distance, une latence U(0,12 ; 0,5) s et une durée de 0,8 à
  2,5 s. Un rire de salle qui se propage.
- **Mocap.** Registre `enregistrerSourceMouvement('mocap', fabrique)`.
  - Le chantier Animated Drawings l'enregistre depuis son propre module, ou depuis `assemblage.ts` en une ligne quand
    son API existe.
  - Les activités parler, rire et boire prennent alors des extraits de clips BVH (CMU, 100STYLE) reciblés, avec des
    décalages aléatoires.
  - Sinon : recettes procédurales.
  - Aucune importation de `anim/bvh.ts`, `anim/reciblage.ts` ou `rig/arap.ts` ; aucune modification de ces fichiers.

### Gaps
- La couverture des petites personnes reste de 32 à 82 % : les autres restent en niveau C (vie de grille).
- Les jambes des assis : le gel des articulations peu visibles est la parade supposée, non mesurée.
- Aucun rendu de marionnette de figurant n'a été fait. Le rendu sur une vraie découpe (bords, plaque révélée) est à
  vérifier au jalon M3.
- La licence des poids RTMW (données d'entraînement) n'est pas tranchée : RTMW reste optionnel.

---

## Q3. Effets d'environnement en code : quels modèles, quelles détections ?

### Takeaway
Ce qui fait « Pixar » n'est pas la quantité de mouvement. C'est la **cohérence des causes** :
- **un** vent par décor, avec des rafales qui traversent le décor, fait plier les palmes, frémir les feuilles, onduler
  les pagnes, pencher les fumées et rider l'eau, avec des retards propres à chaque objet ;
- **une** source de lumière qui grésille fait varier à la fois son halo, la flaque de lumière autour et le liseré des
  personnages proches.

Une somme de sinus est périodique et sans lien physique : Chuang et al. l'ont essayée et rejetée. Leur méthode
spectrale coûte presque rien si on la précalcule une fois par décor.

### Cited Findings
- **Chuang et al. 2005**, modèles par type : `plants and trees, water, floating objects such as boats, and clouds`.
  - **Vent** : spectre de puissance empirique de la vitesse (Simiu et Scanlan), `P_V(f) ~ v̄/(1 + κf/v̄)^{5/3}`. On
    module un bruit gaussien complexe : `V(f) = G(f)·√P_V(f)`.
  - **Branche** : oscillateur harmonique amorti forcé par le vent, `d̈ + γḋ + 4π²f₀²d = w(t)/m`, résolu dans le domaine
    fréquentiel : `D(f) = W(f)e^{i2πθ} / (2πm[(2π(f² − f₀²))² + γ²f²]^{1/2})`. Le déplacement est appliqué **comme une
    rotation autour de la racine**.
  - **Eau** : champ de hauteur au spectre de Phillips (Tessendorf).
  - **Bateaux** : ballottement. **Nuages** : translation.
  - Le spectre tuile sans couture : on synthétise un morceau et on le répète.
  - Source : [PDF](https://grail.cs.washington.edu/wp-content/uploads/2015/08/chuang-2005-apw.pdf)
- **Curl noise** (Bridson, Hourihan, Nordenstam, SIGGRAPH 2007, ACM TOG 26(3) art. 46) : champ de vitesse turbulent,
  incompressible, tiré du rotationnel d'un bruit de Perlin. C'est la dérive idéale des fumées et poussières. Source :
  [notice SIGGRAPH](https://history.siggraph.org/?p=115355)
- **Boucle eulérienne** (Holynski 2021) et ciel à deux phases : déjà dans le moteur (note 05 Q2, `FRAGMENT_CIEL`).
- **Systèmes de particules** (Reeves 1983) : émetteurs, durée de vie, attributs fonctions de l'âge. Classique.

**[mesure] Masques du kit** (`masks.png`, 191 décors) :
- B = 128 (végétation) : 157 décors, médiane 9,3 % de l'image quand présente, p90 22,3 %. **44 %** (médiane) du bord
  de la végétation touche le ciel : derrière lui, le ciel prolongé (push-pull existant) peut se découvrir.
- B = 255 (eau) : 30 décors, médiane 12 %.
- G (ciel) : 180 décors au-dessus de 1 %.
- R : valeurs douces, pas de canal propre pour les véhicules. Les composantes « en forme de véhicule » (largeur > 1,8×
  celle d'une personne à ces pieds, hauteur < 0,8×) se trouvent dans 21 décors (31 composantes).

### Inferences
**Vent** (`scene/vivant/vent.ts`, précalculé au chargement, puis pur) :
- Série de 2048 échantillons à 30 Hz (68 s, bouclée par construction), graine = hash(id du décor).
- Classes d'oscillateurs (`f₀`, `γ`) : palme (0,35 Hz ; 0,9), feuillage (0,8 Hz ; 1,4), tissu (1,2 Hz ; 2,0), fil de
  guirlande (0,5 Hz ; 0,6), frémissement (2,5 à 4 Hz, amplitude ×0,15). Une transformée inverse par classe (2048
  points : moins d'une milliseconde).
- **Front de rafale** : un sommet en p lit `pointe(t − (p·ŵ)/c)`, avec c ≈ 5 m/s converti en px par l'échelle `fit`.
  On voit la rafale traverser le décor.
- Force par plan : `ambiance.vent`. Défaut : 0,35 dehors (ciel > 5 %), 0 dedans.

**Végétation** (B = 128, 157 décors) :
- Couche propre : peinture désentrelacée contre le ciel prolongé, avec α = masque B affiné. Elle est dessinée sur le
  ciel.
- Ancre par composante : point le plus bas (tronc, racine) ; pour un feuillage qui pend, point le plus haut.
- Poids `w = clamp(|p − a|/L)^{1,5}`.
- Déplacement : rotation d'angle θ(t) autour de l'ancre (petits angles : `w·θ·R90(p − a)`), plus un frémissement de
  ≤ 0,3 px.
- Amplitude maximale : **3 px** de sortie là où la végétation borde le ciel (le ciel prolongé comble), **1,2 px**
  ailleurs (c'est la plaque, qui contient encore la feuille, qui se découvre).
- Sommets : la grille du décor est densifiée ×2 dans les cellules de végétation. Le calcul se fait **sur le processeur,
  aux sommets**. Jamais de bruit par fragment (voir Q5).

**Tissus et rideaux** : pas de masque. Ils sont proposés par `effets.ts` : composantes avant fines et verticales
suspendues (pagnes du marché), validées sur la planche ou par le fichier de corrections. Même modèle, classe « tissu »,
ancre en haut.

**Eau** (B = 255, 30 décors) :
- Variante du shader de peinture **restreinte aux cellules d'eau** : décalage d'UV lu dans une texture de déplacement
  256² précalculée et tuilable (spectre de Phillips orienté par ŵ), défilant avec le vent.
- Amplitude de 0,6 à 1,5 px de sortie, à dominante horizontale, plus forte au premier plan.
- **Reflets** : pixels de l'eau au-delà du 98e centile de luminance, en petits sprites additifs scintillant de 1 à 4 Hz.
- **Bateaux** : une composante avant posée sur l'eau ballotte (±0,5 % h à 0,3-0,5 Hz, roulis de 0,5°), selon la
  méthode de Chuang.

**Ciel et nuages** :
- La boucle à deux phases existante est gardée.
- Ajout, pour les décors de jour avec ciel > 5 % : **ombres de nuages**, de grandes taches douces multiplicatives
  (−5 à −8 %) qui glissent sur le sol à la vitesse des nuages. Elles s'accordent avec la respiration de la température
  de couleur.

**Lumières et écrans** :
- Les halos existants (`detecterLumieres`, `intensiteHalo`) deviennent la **source unique** de trois effets :
  1. halo ;
  2. **flaque de lumière** : grand sprite additif doux à 3-6 % sur le décor autour des grappes d'ampoules ;
  3. `eclairageLocal(u, v, t)`, qui module le gain `uGain` des personnages proches, pour qu'ils grésillent avec la
     guirlande.
- Guirlandes dehors : les halos suivent le fil (classe « fil de guirlande ») de ±1 px.
- **Écrans** (télé du maquis) : rectangle clair et saturé, de profondeur plane, de rapport 1,3 à 1,9. Coupes de
  luminosité ou de teinte toutes les 3 à 7 s, et défilement lent du contenu de ±3 % de l'écran à l'intérieur du
  rectangle (le panoramique de la retransmission).

**Fumée, vapeur, braises, poussière, bokeh** (`particules.ts`) :
- **Particules analytiques**. La particule i a un instant de naissance `b_i = (i + u_i)·T/N` (bouclé), un âge
  `a = (t − b_i) mod L`, une position `p₀ + v₀·a + flottaison(a) + ∫₀ᵃ curl(…)` intégrée en ≤ 8 pas fixes **de
  l'âge seul**, plus la dérive du vent.
- Taille, alpha et couleur sont des fonctions de l'âge.
- **Pure en t** : la capture parallèle par segments reste déterministe.
- Fumée et vapeur : 40 à 80 sprites doux par source, alpha de 0,05 à 0,12, couleur prise sur la peinture locale.
- Poussière : 20 à 40 grains autour des fenêtres de jour et des ampoules de nuit, scintillant quand ils traversent la
  lumière. Bokeh : seulement en gros plan (zoom > 1,6), quelques disques de 10 à 30 px.
- Les sources de fumée ne se détectent pas de façon fiable (braises, grills). Elles viennent du **fichier de
  corrections** du décor ou d'une option de la CLI (`--fumee u,v`). Pas de détection devinée par défaut.

**Brume de chaleur** : même shader que l'eau, défilement vertical, 0,3 à 0,7 px, dans une bande au-dessus du sol
lointain ou d'un grill. Sur option `ambiance.chaleur`, de jour dehors.

**Respiration de la température de couleur** : uniforme `uTeinte` (vec3) dans `FRAGMENT_DECOR`.
- De jour : ±0,8 % sur 20 à 40 s, couplé aux ombres de nuages.
- De nuit : ±1,5 %, couplé à la moyenne des grésillements.
- Coût nul. Défaut (1, 1, 1) : rétrocompatible.

### Gaps
- Les constantes `f₀` et `γ` par classe sont des choix d'animateur, non mesurés sur des vidéos de palmiers.
- Les écrans ne sont détectés qu'en principe : non essayés sur le kit.
- Les sources de fumée restent manuelles.

---

## Q4. Véhicules et passants dans le lointain : comment éviter le faux ?

### Takeaway
Un sprite qui glisse sans cycle de marche est le défaut le plus visible. **Pas de passant par défaut.**

Les **véhicules** sont le bon cas : un véhicule est rigide, donc une translation est physiquement juste. Le décor en
fournit déjà (31 composantes dans 21 décors), avec une plaque propre dessous.

### Inferences
**Véhicules** (`ambiance.passants = true`) :
- On découpe le véhicule du décor (désentrelacé contre la plaque) et on le fait rouler **le long d'une ligne
  d'iso-profondeur**, perpendiculaire au gradient de profondeur du sol. L'échelle reste donc constante : pas de mise à
  l'échelle approximative.
- Vitesse de 3 à 8 m/s, convertie par `fit` à cette profondeur.
- Il entre et sort hors champ ou derrière une couche avant, jamais par apparition.
- Suspension ±0,3 % h à 1,5-2 Hz.
- C'est la seule exception à la quantification du temps : il est évalué au temps de chaque sous-image, pour profiter
  du flou de bougé exact. Il est petit, donc peu coûteux.

**Passants** : seulement si une marionnette de niveau A **debout, jambes visibles**, existe hors du cadre du plan.
- Elle traverse à profondeur lointaine (≤ 15 % de la hauteur du cadre), avec le cycle `marcher` de `anim/`.
- Teinte des vêtements décalée de ±8° pour qu'on ne reconnaisse pas le figurant d'origine.
- Sinon : rien.

### Gaps
- Le sens de la route n'est déduit que du gradient de profondeur. Une rue qui s'enfonce vers l'horizon (et non latérale)
  demanderait une mise à l'échelle le long de la trajectoire : exclue pour l'instant.

---

## Q5. Budget de rendu en 1080×1920 sous Chromium sans écran (SwiftShader)

### Takeaway
Sous SwiftShader, le coût est celui des **pixels remplis × le travail par pixel**. Une couche plein écran mélangée coûte
autant qu'une partie de la scène.

Il y a trois règles :
1. aucune passe plein écran nouvelle ;
2. aucun bruit calculé par fragment ;
3. chaque couche limitée à ses cellules.

Surtout, le décor est déjà **mis en cache entre les sous-images du flou de bougé** quand il ne bouge pas
(`moteurRendu.dessiner`, `decorFige`). Si sa vie avançait à chaque sous-image, ce cache tomberait et le décor serait
dessiné N fois. Le temps de la vie doit être **quantifié à l'image**.

### Cited Findings
**[mesure] Micro-banc WebGL 2 brut** (`bench_vivant.mjs`) :
- Conditions : 1080×1920, SwiftShader, 24 images par configuration, 3 tours alternés, médiane, synchronisation par
  `readPixels` d'1 px.
- Base : grille 128×64 opaque, texture 2048×1024.
- **Machine chargée** (charge moyenne 8,4).

| Configuration | ms/image | Écart à la base | Lecture |
|---|---|---|---|
| base | 108,9 | – | – |
| + 2 couches plein écran mélangées | 279,8 | +170,9 | ≈ **85 ms par écran mélangé** : limiter aux cellules couvertes |
| + vent par fragment (bruit procédural) sur ½ écran | 200,3 | +91,4 | **à proscrire** : faire le vent aux sommets |
| + 20 maillages de figurants (≈ 200×400 px chacun) | 191,6 | +82,7 | même surface que la couche de figurants actuelle |
| + 300 particules additives | 136,0 | +27,1 | ≈ 0,09 ms par sprite : ≤ 150 par image |
| + passe plein écran de teinte | 222,1 | +113,2 | **à proscrire** : uniforme dans les shaders existants |
| + bloom au quart + teinte | 256,4 | +147,5 | le bloom seul ≈ +34 : **remplacé par les halos** |
| tout | 532,4 | +423,5 | – |

- Rappels : note 05, rendu seul de 76 à 92 ms sans MSAA, machine calme. Le rendu final du pilote mesure **≈ 1,6 à
  2,6 s par image** en 1080 avec flou de bougé (`sorties/pilote.journal.txt`).

### Inferences
**Règles de code**
1. `tVie = round(tJeu·fps)/fps` pour toute la vie du décor (figurants, vent, eau, ciel, lumières, particules). Les
   sous-états d'une image ont alors le même décor. `DecorRendu.ecart` reste sous 0,35 px si la caméra est posée, et le
   cache tient.
   - Exception : les véhicules et les mouvements de caméra.
   - Le flou de bougé perdu porte sur des mouvements de fond inférieurs au pixel par image : invisible.
2. Bruit et vent sur le **processeur, aux sommets** (8 400 sommets par grille : moins d'1 ms), ou par **une lecture**
   d'une texture de bruit précalculée (eau, chaleur).
3. Couches avant, végétation, eau : indices limités aux cellules couvertes, comme `cellulesCouvertes` aujourd'hui.
4. Particules, reflets, flaques : **un seul maillage par lot** (un appel de dessin), ≤ 150 sprites.
5. Teinte : uniforme `uTeinte` dans `FRAGMENT_DECOR`. Pas de bloom réel. Pas de flou de profondeur plein écran (note
   05 : +180 ms).
6. Mode plat dès que la parallaxe de l'image est sous 0,5 px. On ne paie les couches que dans les plans qui bougent.
7. Marionnettes : skinning CoR sur le processeur (≈ 600 sommets × 20 : 1 à 3 ms), mémoïsé par `tVie`. Atlas unique.

**Budget par image, plan riche, machine chargée** (estimé d'après le banc, surfaces médianes du kit) :

| Élément | Surface ou coût | ms |
|---|---|---|
| Couche arrière + peinture | inchangé | 0 |
| Couches avant (plans en mouvement seulement) | 0,22 + 0,12 du décor, marge de cellules ×1,3 | +25 à 35 (0 en mode plat) |
| Végétation | ≈ 0,09 du décor | +5 à 10 |
| Eau, chaleur (une lecture de plus, cellules restreintes) | ≈ 0,12 du décor | +3 à 6 |
| Marionnettes + occulteurs | remplacent la couche de figurants | +5 à 15 |
| Particules et reflets (≤ 150) | – | +5 à 14 |
| Flaques de lumière | quelques sprites | +2 à 4 |
| Teinte | uniforme | 0 |
| **Total** | – | **+30 à 70** |

Ce total représente ≈ 2 à 4 % du coût actuel d'une image du pilote. La mesure devient `MesureImage.msDecorVivant`.

**Porte de rythme.** Elle reste celle de la note 05 G4 et de la note 07 Q5 : la couverture du plan rendu **sans
acteurs** doit être < 0,05. La retenue et les plafonds en Q2 sont faits pour cela.

---

## Les principes « Pixar » traduits en règles de code

| Principe | Règle du moteur |
|---|---|
| Mise en scène : le fond ne vole pas la scène | retenue de 0,6 (0,8 près de l'orateur) pendant les répliques ; plafonds d'amplitude ; porte de couverture < 0,05 |
| Tout vit un peu, rien n'est synchrone | graines par figurant, par branche et par ampoule ; périodes et phases tirées ; pas de sinusoïde pure (spectres) |
| Une cause, plusieurs effets | un vent par décor (végétation, tissus, fumée, eau, guirlandes) ; une lumière (halo, flaque, liseré des personnages) |
| Chevauchement et suite d'action | oscillateurs amortis (retards naturels) ; la tête mène, le buste suit ; front de rafale qui traverse |
| Le fond regarde l'action | attention vers l'orateur ; réactions de salle aux gags, avec latence |
| Cohérence de profondeur | parallaxe par couche, occultation au pixel, figurants à leur profondeur |
| Rien ne surgit | entrées hors champ ou derrière un objet ; bascule plat ↔ couches invisible (invariant de repos) |

---

## Ce que nous greffons dans notre moteur

### G1. `outils/vivant` : préparation hors ligne du « paquet vivant » d'un décor
- La commande est `npm run vivant -- <id…> | --tous`. Elle écrit dans `studio-troupe/sorties/cache/decors/<id>/vivant/`
  (ignoré par git), jamais dans `.private`.
- Contenu du paquet :
  - `vivant.json` ;
  - `fond.jpg` ;
  - `couche1.png`, `couche2.png` (prémultipliées) ;
  - `masques.png` (R végétation, G eau, B tissus, A réserve) ;
  - `profCouches.bin`, les profondeurs aux sommets ;
  - `figurants.png` (atlas) et `figurants/<k>.rig.json` ;
  - `planche.jpg`, la planche de contrôle.
- Clé de cache : version + empreintes des fichiers sources, comme `scene/analyse.ts`.
- Corrections manuelles facultatives : `studio-troupe/.private/kit/vivant/<id>.json`, lu seulement (sources de fumée,
  tissus, rejets d'instances, force du vent).

### G2. Parallaxe en couches (Q1)
- Chapeau à hystérésis, détourage par guided filter, fond par miroir et push-pull, couches désentrelacées, profondeur
  aux sommets prolongée par couche.
- Mode plat ou mode couches, choisi par image.
- Budget de 60 px (90 px sous filé).

### G3. Figurants marionnettes (Q2)
- MediaPipe multi-personnes, puis RTMW optionnel, niveaux A, A+, B et C, `construireRig`, atlas désentrelacé, `d_e`,
  occulteurs.
- Acteur de fond : groupes, tours de parole, attention, réactions, retenue. Registre de sources de mouvement.

### G4. Environnement (Q3)
- Vent spectral et oscillateurs, végétation et tissus aux sommets, eau et chaleur par texture.
- Ombres de nuages, flaques de lumière couplées aux personnages, écrans, particules analytiques, `uTeinte`.

### G5. Véhicules du décor (Q4), sur option

### G6. Budget et portes (Q5)
- `tVie` quantifié, `msDecorVivant`.
- Portes :
  - **repos** : décor vivant figé = peinture, PSNR ≥ 45 dB ;
  - **trous** : `Δd_p95·A ≤ w_bande` ;
  - **fond seul** : couverture < 0,05.

---

## Plan d'implémentation, fichier par fichier

Aucun fichier du chantier Animated Drawings n'est touché : `src/rig/arap.ts`, `src/anim/bvh.ts`,
`src/anim/reciblage.ts`, l'action `mocap` et les options de déformation du rig. Nous **appelons** seulement les
exportations existantes de `rig/` (`construireRig`, `deformerSommets`, `transformeeDistance`), sans les modifier.

Tous les ajouts au contrat sont **facultatifs**. Sans paquet vivant, le rendu est identique au bit près à aujourd'hui.

### Contrat (`src/timeline/types.ts`, champs facultatifs seulement)
- `InfoDecor.fichiers.vivant?: string` : chemin de `vivant.json`.
- `InfoDecor.vivant?: { version: 1; couches: 0 | 1 | 2; budgetPx: number; figurants: { A: number; B: number; C: number }; effets: string[] }` :
  résumé pour la caméra et la CLI.
- `AmbiancePlan` :
  - `vent?: number` (0 à 1) ;
  - `foule?: 'calme' | 'normale' | 'animee'` ;
  - `reactions?: boolean` (défaut vrai) ;
  - `effets?: boolean` (défaut vrai) ;
  - `chaleur?: boolean` ;
  - `passants?: boolean` (défaut faux).
- `EtatDecor.vivant?: EtatVivant`, avec `EtatVivant` =
  `{ tVie; vent: { force; temps }; attention: Vec2 | null; retenue: number; reactions: Array<{ type: 'rire' | 'surprise' | 'colere'; age: number; intensite: number; source: Vec2 | null }>; effets: boolean; chaleur: boolean; passants: boolean; foule: number }`.
- `timeline/neutres.ts` : `decorNeutre` est inchangé (`vivant` absent = comportement actuel). Le validateur de projet
  accepte les nouveaux champs d'ambiance.

### Hors ligne (Node + un script Python)
| Fichier | Rôle |
|---|---|
| `src/outils/vivant/preparer.ts` | CLI : lit le kit (`outils/kit`), enchaîne les étapes, écrit le paquet et la planche, gère le cache. Script `"vivant"` dans `package.json`. |
| `src/outils/vivant/morpho.ts` | Pur : érosion et dilatation en O(1) par pixel (van Herk / Gil-Werman), ouverture par disque, chapeau multi-échelle, composantes à hystérésis, guided filter (filtres boîte), plus proche voisin par `rig/distance` (étendu par un **nouveau** helper local, sans toucher `rig/`). |
| `src/outils/vivant/couches.ts` | Pur : sol (`AnalyseDecor.sol`, repli quantile), couches 1-2, détourage, fond miroir + push-pull (`rendu/geometrie.remplirPushPull`), désentrelacement `P = C − (1 − α)·B`, profondeurs aux sommets prolongées, statistiques de bord, `A_max`. |
| `src/outils/vivant/figurants.ts` | Lit `poses.json`, construit α, instances, niveaux, `SourceRig` (correspondance MP33/RTMW → `ArticulationsHumanoide`, limites serrées, gel des articulations), appelle `construireRig`, assemble l'atlas désentrelacé, calcule `d_e`, les boîtes d'occulteurs et les groupes. |
| `src/outils/vivant/effets.ts` | Pur : ancres et poids de végétation (B = 128), tissus candidats, eau et reflets (B = 255), écrans, grappes de lumières (`detecterLumieres`), véhicules candidats ; lecture des corrections. |
| `scripts/vivant/poses_figurants.py` | Python, lancé en processus séparé (`MOTEUR_PYTHON`, `MOTEUR_MP_POSE`, `MOTEUR_RTMW`, `MOTEUR_MP_VISAGE` ; ≤ 2 fils) : MediaPipe heavy, image + 2×3 tuiles, rejet des bords de tuile, NMS, RTMW optionnel, Face Landmarker optionnel. Écrit `poses.json` et les masques d'instance (PNG). Outils externes non fournis, comme ESRGAN dans `outils/affiner`. |
| `src/outils/kit.ts` | `rattacherVivant(decors, dossierCache)` : ajoute `fichiers.vivant` et `vivant` (résumé) quand le paquet existe. Appelé par la CLI de rendu. |

### Temps réel, pur (Node et page) : `src/scene/vivant/`
| Fichier | Rôle |
|---|---|
| `types.ts` | Types du paquet (`PaquetVivant`, `CoucheVivante`, `Marionnette`, `SourceEffet`) : internes, hors contrat. |
| `vent.ts` | Spectre en −5/3, bruit gaussien à graine, DFT inverse de 2048 points, oscillateurs par classe (fonction de transfert de Chuang), lecture interpolée, front de rafale `pointe(t − p·ŵ/c)`. |
| `vegetation.ts` | Déplacements aux sommets (rotation autour de l'ancre, frémissement), plafonds selon le bord de ciel, classes palme, feuillage, tissu et fil. |
| `acteurs.ts` | Acteur de fond : programme semi-Markov par groupe, recettes de pose → `Pose`, ressorts, retenue, attention, réactions, plafonds ; registre `enregistrerSourceMouvement`. |
| `particules.ts` | Particules analytiques (fumée, vapeur, braises, poussière, bokeh, reflets) : sprites purs en t, plafond de 150. |
| `lumiere.ts` | Flaques de lumière, `eclairageLocal(u, v, t)` (même bruit que `intensiteHalo`), écrans (coupes, défilement), `uTeinte`, ombres de nuages. |
| `budget.ts` | `A_max` du plan (couches ou non), choix plat ou couches, contrôle des trous, porte de repos (composition de référence en Node, basse résolution). |
| `index.ts` | Exportations. |

### Fournisseur et caméra
- `src/scene/decor.ts` (`fournisseurDecor`) :
  - remplit `etat.vivant` : `tVie` quantifié, vent tiré de `ambiance.vent` ou du défaut du décor ;
  - attention = position des pieds et de la tête de l'orateur courant (`pistes.dialogue`) ;
  - retenue = indicateur de parole lissé (ressort de 0,25 s) ;
  - réactions = actions `rire`, `surprise` et `colere` des principaux, plus les sons `effet` ;
  - budget de parallaxe : `REGLAGES_DECOR.budgetPx` reste 26 sans paquet ; avec couches, 60, ou 90 quand
    `flouBouge` dépasse 6 px.
  - Toutes les valeurs sont arrondies comme aujourd'hui (états identiques entre Node et la page).
- `src/scene/camera.ts` : aucun changement obligatoire. Le budget plus grand est lu par `decor.ts`.

### Rendu
- `src/rendu/decorRendu.ts`, changements :
  1. `charger` : si `info.fichiers.vivant` existe, charger en parallèle `vivant.json` et ses textures. Sinon, chemin
     actuel inchangé.
  2. `preparer` :
     - mode couches : `fondEtendu` (opaque, profondeurs du fond prolongées), `couche1` et `couche2` (grilles limitées
       aux cellules α > 0,01, textures prémultipliées, profondeurs propres) ;
     - mode plat : maillages actuels ;
     - dans les deux modes, les nouvelles vies : `vegetation` (grille densifiée ×2 dans ses cellules, sur le ciel),
       `eau` (variante de shader dans ses cellules), `FigurantsRendu` (niveaux A et B ; le niveau C garde la vie de
       grille actuelle sur sa seule couche), `EffetsRendu` (particules, reflets, flaques ; les halos actuels y passent).
  3. `preparerImage` :
     - choix du mode : parallaxe < 0,5 px → plat ;
     - projection par couche (`projeterGrille`, un tableau de profondeurs par couche) ;
     - vent aux sommets ;
     - poses des marionnettes, puis `deformerSommets`, puis placement et parallaxe à `d_e` ;
     - sprites ;
     - `uTeinte`.
     - `GeometrieDecor` reçoit des champs facultatifs : `mode`, `couches?`, `vegetation?`, `marionnettes?`,
       `effets?`, `teinte?`.
  4. `appliquer` : envoi des tampons et visibilité selon le mode.
  5. `DecorRendu.ecart` : prend en compte **tous** les nouveaux tampons de positions, pour que le cache entre
     sous-images reste juste.
  6. `occultation` : en mode couches, maximum de profondeur des couches par cellule. L'API ne change pas.
  7. `detruire` : libère les nouvelles textures.
  8. L'en-tête du fichier documente l'empilement : fond étendu → ciel → végétation → couches avant → marionnettes
     triées par profondeur, chacune suivie de son occulteur → ombres et personnages (inchangé) → effets additifs.
- `src/rendu/vivant/figurantsRendu.ts` (nouveau) : atlas, un `MaillageLibre` par marionnette, skinning sur le
  processeur, occulteur par marionnette (`FRAGMENT_OCCULTATION` avec seuil `d_e + 0,05`), tri par profondeur,
  mémoïsation par `tVie`.
- `src/rendu/vivant/effetsRendu.ts` (nouveau) : un maillage par lot (additif et normal), sprite doux 32², sprites
  orientés par la dérive pour la fumée.
- `src/rendu/shaders.ts` :
  - `FRAGMENT_DECOR` reçoit `uniform vec3 uTeinte` (défaut 1) ;
  - nouveau `FRAGMENT_ONDULATION` (eau et chaleur : une lecture de la texture de déplacement + masque) ;
  - `FRAGMENT_COUCHE` est inutile : les couches prémultipliées passent par `FRAGMENT_DECOR`.
- `src/rendu/moteurRendu.ts` : `MesureImage.msDecorVivant` (facultatif) ; aucun autre changement (le cache utilise
  `DecorRendu.ecart`).
- `src/rendu/personnageRendu.ts` : facultatif. Multiplier `uGain` par `eclairageLocal` aux pieds et à la tête du
  personnage (couplage aux guirlandes). C'est un réglage, désactivé par défaut au premier jalon.
- `src/export/serveur.ts`, `src/assemblage.ts` : servir les fichiers du paquet comme les autres fichiers du décor
  (liste blanche par chemin).

### Tests (vitest, Node)
- `tests/vivant.couches.test.ts` :
  - profondeur synthétique (sol en rampe + boîte devant + boîte sur la boîte) : seules les boîtes sont détectées, aux
    bons niveaux, et le sol jamais ;
  - repos exact : `P + (1 − α)·B = C` à 1/255 près ;
  - continuité du miroir au bord ;
  - profondeur aux sommets constante à travers le bord du détourage.
- `tests/vivant.vent.test.ts` :
  - déterminisme et bouclage sans saut ;
  - pente log-log du spectre ≈ −5/3 ±0,2 ;
  - pic de la réponse d'une branche près de `f₀` ;
  - retard du front de rafale égal à `p·ŵ/c`.
- `tests/vivant.acteurs.test.ts` :
  - même graine, même t → même pose ;
  - un seul orateur par groupe à chaque instant ;
  - la retenue réduit l'amplitude pendant une réplique ;
  - latences des réactions dans [0,12 ; 0,5] s ;
  - pose de repos = identité ;
  - plafonds respectés.
- `tests/vivant.particules.test.ts` : pureté en t, durées de vie, plafond de 150, bouclage.
- `tests/rendu.geometrie.test.ts` (ajouts) : déplacement de végétation nul à l'ancre ; `ecart` sensible aux nouveaux
  tampons.
- `tests/scene.camera.test.ts` (ajouts) : budget de 26 px sans paquet (inchangé), 60 px avec couches.
- Contrôle de rendu dans la CLI : option `--fond-seul` (plan sans acteurs), porte de couverture < 0,05, PSNR de repos
  ≥ 45 dB.
- Avant chaque livraison : `npm run typecheck` et `npm test`.

### Jalons, du plus rentable au plus lourd
- **M1, fond vivant sans apprentissage** (masques du kit seuls) :
  - `tVie` quantifié : c'est aussi un gain de vitesse ;
  - vent et végétation, eau, `uTeinte`, ombres de nuages ;
  - flaques de lumière couplées, écrans, particules de poussière et de bokeh.
  - Effet immédiat sur 157 décors (végétation), 30 (eau) et 180 (ciel).
- **M2, parallaxe en couches** : `outils/vivant/couches`, mode couches dans `decorRendu`, budget de 60/90 px, portes de
  repos et de trous.
- **M3, figurants marionnettes** : `poses_figurants.py`, `outils/vivant/figurants`, `scene/vivant/acteurs`,
  `figurantsRendu`, occulteurs, retenue, attention, réactions. D'abord sur les décors du prochain sketch (`maquis`,
  `rue-des-maquis-marcory`, `marche`).
- **M4, sur option** :
  - véhicules du décor ;
  - source mocap par le registre, quand l'API du chantier Animated Drawings est publiée ;
  - clignements des niveaux A+ ;
  - ARAP pour les un ou deux plus grands figurants, si le chantier l'expose.

---

## Ce que nous NE faisons pas
- Tranches de profondeur uniformes : elles coupent sol et murs.
- Bruit procédural par fragment, bloom réel, passe plein écran de teinte, flou de profondeur plein écran : mesurés trop
  chers.
- Vie du décor au temps de chaque sous-image : elle casse le cache, sauf pour les véhicules.
- Passants en sprites glissants.
- Sommes de sinusoïdes pour le vent : périodiques et sans cause commune (Chuang 2005).
- Se fier à la confiance de RTMW seule, ou aux colonnes du profil supérieur, pour séparer les figurants.
- Toucher aux fichiers du chantier ARAP et mocap, ou les importer en dur.
- Le code ou les données de 3D Ken Burns (CC BY-NC-SA). Inpainting appris (LaMa ou autre) : non nécessaire, puisque
  seule une bande de 4 à 6 px de plaque se découvre.

## Gaps
- Toutes les durées viennent d'une machine chargée. Il faut refaire le micro-banc sur machine calme avant de figer les
  plafonds.
- Aucun rendu de bout en bout du décor vivant n'a été fait. Les jugements « crédible » viennent de planches fixes et du
  raisonnement.
- Le guided filter et le modèle de sol par `AnalyseDecor.sol` n'ont pas été mesurés sur le kit.
- La couverture des petits figurants par MediaPipe est faible sur les foules (0,32 sur `rue-des-maquis-marcory`).
- La licence des poids RTMW reste à trancher. MediaPipe seul suffit à M3.

## Sources
- Chuang, Goldman, Zheng, Curless, Salesin, Szeliski, « Animating Pictures with Stochastic Motion Textures », SIGGRAPH 2005 — [projet](https://grail.cs.washington.edu/projects/StochasticMotionTextures/), [PDF](https://grail.cs.washington.edu/wp-content/uploads/2015/08/chuang-2005-apw.pdf)
- He, Sun, Tang, « Guided Image Filtering », ECCV 2010 — [projet](https://people.csail.mit.edu/kaiming/eccv10/index.html), [PDF](https://people.csail.mit.edu/kaiming/publications/eccv10guidedfilter.pdf)
- Bridson, Hourihan, Nordenstam, « Curl-noise for procedural fluid flow », SIGGRAPH 2007 — [notice SIGGRAPH](https://history.siggraph.org/?p=115355)
- Notes internes : 01 (ARAP, coût), 03 Q6 (MediaPipe, mocap CMU et 100STYLE), 05 Q1-Q2 et G1-G4 (couches, LDI, vie du
  décor, budget), 06 Q3 (RTMW contre MediaPipe), 07 Q5 (porte de rythme par mise en page).
- Mesures : `scratchpad/vivant/scripts/{figurants_rtmw.py, figurants_mp.py, couches_profondeur.py}`,
  `scratchpad/vivant/bench/bench_vivant.mjs`, sorties dans `scratchpad/vivant/out/` (non versionnées : elles dérivent du
  kit privé).
