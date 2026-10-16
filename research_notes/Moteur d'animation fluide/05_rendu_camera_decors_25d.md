# Rendu, caméra et intégration aux décors 2.5D : parallaxe par la profondeur, décor vivant, grammaire caméra du sketch, personnages plats dans les décors peints, capture headless et encodage TikTok

Date : 16/10/2026. Piste « rendu_decors ». Les sources tierces ont été **lues pour apprendre**, jamais copiées. Les deux
dépôts lus (3D Ken Burns, 3D Photo Inpainting) sont clonés en lecture seule hors du dépôt, dans le scratchpad.

Conventions de source :
- **[mesure]** : mesure faite dans ce conteneur (4 vCPU Xeon, 15 Go, sans GPU). Les scripts restent dans le scratchpad
  (`bench-rendu/` et `scripts-rendu/`) et ne sont pas versionnés. Les images et vidéos dérivées du décor privé ont été
  effacées après mesure ; seuls les journaux chiffrés sont gardés.
- **[B]** : notre code antérieur, branche `claude/relaxed-noether-svkgiu`, commit `d869966`, lien GitHub suivi du chemin.
- **[kit]** : le kit privé `studio-troupe/.private/kit/` (191 décors, jamais versionné).
- **[audit]** : la note `00_audit_existant.md` de ce dossier, dont certains chiffres sont repris ici.

---

## Q1. Parallaxe 2.5D à partir d'une peinture et de sa profondeur : que retenir de 3D Ken Burns, de la « photo 3D » (LDI) et du DIBR ?

### Takeaway
Les deux références font la même chose en quatre étapes :
1. une profondeur par pixel ;
2. un maillage ou un nuage de points ;
3. une **déchirure** aux sauts de profondeur ;
4. un **remplissage** des trous découverts par la caméra (désoccultations).

Leur partie coûteuse, l'inpainting appris sur CUDA, peut être remplacée chez nous par ce que le kit fournit déjà : la
plaque sans figurants et sa profondeur. Il reste à construire une couche d'arrière-plan prolongée, calculée une fois par
décor sur CPU.

Les sauts de profondeur du kit sont grands : p95 médian de 0,28 sur une échelle de 0 à 1. Sans couche arrière,
l'amplitude de parallaxe tolérable ne dépasse donc pas une dizaine de pixels de sortie. Cela confirme la règle de
l'audit : une caméra posée par défaut et des mouvements courts et bornés.

### Cited Findings
**3D Ken Burns (Niklaus et al., ACM TOG 2019)**
- Le pipeline :
  - une profondeur « pensée pour la synthèse de vues » : réseau sensible à la sémantique, ajustement par segmentation,
    puis raffinement des bords d'objets ;
  - l'image est relevée en nuage de points et rendue le long du chemin de caméra ;
  - les zones découvertes aux positions extrêmes sont comblées par un inpainting « contextuel » de la couleur **et** de
    la profondeur, qui prolonge la géométrie.
  - Source : [arXiv 1909.05483](https://arxiv.org/abs/1909.05483)
- **Licence CC BY-NC-SA 4.0** (projet Adobe Research) : « may only be used for non-commercial purposes ». Le jeu de
  données a la même licence. Plusieurs fonctions sont écrites en CUDA via CuPy, avec `CUDA_HOME` requis.
  - Conséquence : **inutilisable chez nous**, ni en code (non commercial) ni en exécution (CUDA). Seules les idées sont
    retenues.
  - Source : [README 3d-ken-burns](https://github.com/sniklaus/3d-ken-burns)
- **Cadrage automatique** (`process_autozoom`, lu dans le code, commit `1245471`) :
  - le cadre de départ fait 97 % de l'image ;
  - le cadre d'arrivée est zoomé ×1,25 ;
  - son centre est cherché sur une **grille de 16×16 décalages** de ±100 px ;
  - chaque candidat est rendu, et l'on garde celui qui **maximise le nombre de pixels couverts**, c'est-à-dire qui
    minimise les trous ;
  - la vidéo fait 75 pas à 25 i/s, jouée en aller-retour.
  - Source : [common.py](https://github.com/sniklaus/3d-ken-burns/blob/master/common.py) ; [autozoom.py](https://github.com/sniklaus/3d-ken-burns/blob/master/autozoom.py)

**3D Photography using Context-aware Layered Depth Inpainting (Shih et al., CVPR 2020)**
- Représentation : une **Layered Depth Image (LDI) à connectivité explicite**. Un modèle appris synthétise de façon
  itérative couleur et profondeur dans la zone occultée, à partir du contexte local. Le rendu se fait ensuite par un
  moteur graphique standard. Les auteurs annoncent moins d'artefacts que l'état de l'art.
  - Source : [arXiv 2004.04727](https://arxiv.org/abs/2004.04727)
- **Licence du code : MIT**. Les checkpoints de MiDaS et des trois réseaux sont à auditer à part.
  - L'installation prévoit `cudatoolkit 10.1` et le calcul « prend environ 2 à 3 minutes » par image.
  - Source : [README 3d-photo-inpainting](https://github.com/vt-vl-lab/3d-photo-inpainting)
- **Paramètres de déchirure, documentés** :
  - `depth_threshold: 0.04` : deux pixels voisins sont une discontinuité si leur écart **de disparité** dépasse 0,04 ;
  - `redundant_number: 12` : les bords plus courts sont supprimés ;
  - `background_thickness: 70` (zone à synthétiser) et `context_thickness: 140` (zone de contexte), en pixels ;
  - `depth_edge_dilate: 10` ;
  - `extrapolation_thickness: 60` pour prolonger le bord du cadre ;
  - un filtre médian bilatéral sur 5 itérations lisse la profondeur avant la détection ;
  - inpainting en échelle log (`log_depth: True`).
  - Source : [DOCUMENTATION.md](https://github.com/vt-vl-lab/3d-photo-inpainting/blob/master/DOCUMENTATION.md)
- **Trajectoires par défaut** (`argument.yml`) :
  - « zoom-in », « dolly-zoom-in », « circle » et « swing » ;
  - décalages x et y de ±0,015 et z de −0,05, en unités de la scène normalisée ;
  - 240 images à 40 i/s.
  - Ce sont des mouvements **petits**, choisis pour limiter les trous.
  - Source : [argument.yml](https://github.com/vt-vl-lab/3d-photo-inpainting/blob/master/argument.yml)
- Dans `mesh.py`, la fonction `tear_edges` casse toute arête du maillage dont la différence de disparité dépasse un
  seuil, et des « îlots flottants » sont réassignés par composantes connexes. Tout est en graphes `networkx` en Python,
  donc lent. Source : [mesh.py](https://github.com/vt-vl-lab/3d-photo-inpainting/blob/master/mesh.py)

**SLIDE (Jampani et al., ICCV 2021)**
- Les méthodes à couches **dures** ne rendent pas les détails fins (« thin hair-like structures »). SLIDE propose une
  **stratification douce** (soft layering) et un inpainting entraîné en tenant compte de la profondeur, en une seule
  passe.
- La page arXiv n'indique **aucun dépôt de code**. Le texte de l'article est sous CC BY-NC-SA 4.0.
- Source : [arXiv 2109.01068](https://arxiv.org/abs/2109.01068)

**DIBR (rendu à partir d'image et de profondeur)**
- Le lissage gaussien de la carte de profondeur avant déformation réduit les trous : la qualité perçue augmente avec la
  force du lissage (Tam et al., SPIE 2004).
  - Source : [SPIE 5599](https://www.spiedigitallibrary.org/conference-proceedings-of-spie/5599/0000/Smoothing-depth-maps-for-improved-steroscopic-image-quality/10.1117/12.583105.full)
- Lisser toute la carte introduit en revanche des distorsions géométriques et du temps de calcul. Des travaux
  ultérieurs pondèrent le flou par la distance aux contours, ou remplissent les trous de façon hiérarchique sans
  prétraitement de la profondeur.
  - Source : extraits de résultats de recherche, articles non lus en entier : [IEEE 2011 (notice Infona)](https://www.infona.pl/resource/bwmeta1.element.ieee-art-000004412880) ; [brevet « Hierarchical hole-filling »](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9094660). L'attribution exacte de chaque phrase à chaque article n'a pas été vérifiée.

**Profondeur du kit**
- Producteur : Depth Anything V2 **Small**, sous Apache-2.0.
- Attention : **les modèles Base, Large et Giant sont sous CC-BY-NC-4.0**. Il ne faut jamais régénérer les profondeurs
  avec eux.
- Source : [Depth-Anything-V2](https://github.com/DepthAnything/Depth-Anything-V2) ; [audit]

**Notre moteur antérieur (three.js)**
- Il appliquait déjà l'idée « photo 3D » dans le shader :
  - chaque sommet est poussé le long de son rayon selon la profondeur ;
  - `vEdge` est l'écart maximal de profondeur avec les 4 voisins ;
  - un triangle n'est un trou que s'il est **réellement étiré à l'écran** (`fwidth(vUv)` comparé à la densité au repos) ;
  - le trou est alors peint avec la couleur cherchée du côté lointain, sur 8 pas le long du gradient ;
  - en mode calques, le trou est laissé transparent sur la plaque reconstruite.
- Source : [B videoScene.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/videogen/videoScene.ts)

**[mesure] Discontinuités du kit** (`plateDepth`, 191 décors, seuil 0,04 de 3D Photo)

| Indicateur | Valeur |
|---|---|
| Pixels de discontinuité | médiane **2,0 %**, p90 4,4 %, max 7,9 % |
| Saut de profondeur au 95e centile, par décor (sur 2 px) | médiane **0,278**, p10 0,173, p90 0,467 |
| Saut maximal | médiane 0,435, p90 0,710 |
| `maquis` | 5,3 % de pixels de discontinuité |

### Inferences
- **Trou attendu.** Dans notre modèle de déformation, un sommet se déplace de `Δ = (d − d_focus)·A`, où A est
  l'amplitude en pixels de sortie. Un trou s'ouvre donc d'une largeur `w ≈ Δd·A` sur un saut Δd.
  - Avec Δd = 0,28 (p95 médian) et w ≤ 3 px, la limite est **A ≤ 11 px** sans couche arrière.
  - Les « travellings » du film 9 dépassaient cette limite de loin. D'où la nécessité de la couche d'arrière-plan (G1)
    **et** d'un budget de parallaxe calculé par décor (G2).
- **Ce que nous reprenons** de 3D Ken Burns : l'idée de choisir le cadre d'arrivée en minimisant les trous. En
  l'améliorant :
  - la fonction de coût devient **analytique**, calculée sur le graphe des discontinuités, au lieu de 256 rendus ;
  - elle pénalise aussi les zones « barbouillées » de la plaque relevées par l'audit ;
  - elle intègre les contraintes de composition (visages hors des zones d'interface TikTok, voir Q3).
- **Ce que nous reprenons** de 3D Photo : le seuil sur la **disparité** et non sur la profondeur (notre carte est déjà
  une disparité relative, claire = proche), la suppression des bords courts et la LDI à deux couches. Nous ne gardons
  pas le réseau.
- **Ce que nous reprenons** de SLIDE : des bords **doux** (alpha en rampe sur 1 à 2 px) plutôt qu'un découpage binaire.
  C'est ce qui évite le liseré « découpé aux ciseaux », visible sur les cheveux et les feuillages des peintures.
- Le lissage DIBR global est à proscrire, car il déforme les personnages peints. Il faut un lissage **guidé**, limité
  aux bandes autour des discontinuités.

### Gaps
- Le détail de l'ajustement de profondeur par segmentation de 3D Ken Burns n'a pas été lu dans l'article. Seuls
  l'abrégé et le code de cadrage l'ont été.
- La formule exacte de la stratification douce de SLIDE n'a pas été lue (abrégé seulement, pas de code publié).
- Les licences des checkpoints de 3D Photo (edge, depth, color) n'ont pas été vérifiées. C'est sans objet puisque nous
  ne les utilisons pas.
- Aucune mesure n'a été faite de la qualité visuelle d'une couche arrière par push-pull comparée à LaMa sur nos
  décors.

---

## Q2. Faire vivre le décor sans « mouvement global » : figurants, ciel, eau, lumières

### Takeaway
La vie du décor doit rester **sous le seuil de la porte de rythme**. Le film 9 a échoué par excès de mouvement global
([audit] : couverture 0,53 pour un plafond de 0,435).

Les figurants doivent bouger comme des **calques séparés au-dessus de la plaque**, et non par une déformation d'UV à
l'intérieur de la peinture. Cette dernière méthode, celle de notre code antérieur, étale le fond.

Sur 156 décors sur 191, le masque des figurants est une masse fusionnée (foule et véhicules). Il faut donc découper
des « cellules de personne » à partir des têtes du contour supérieur, et non par composantes connexes.

Pour le ciel, une boucle « eulérienne » à deux phases suffit, à condition de lui donner une profondeur infinie, sans
parallaxe de translation.

### Cited Findings
- **Boucle eulérienne** (Holynski et al., CVPR 2021) :
  - un **champ de mouvement eulérien statique**, constant dans le temps, suffit à reproduire les mouvements de fluide
    (eau, fumée) ;
  - la boucle sans couture s'obtient en propageant **en avant et en arrière** dans le temps, puis en mélangeant les deux.
  - Source : [arXiv 2011.15128](https://arxiv.org/abs/2011.15128)
- **Code antérieur, ciel** : « a constant slow drift seen through two crossfaded phases → a seamless loop (Eulerian
  motion) ». La période vaut 30 s et le décalage 0,05 de largeur. Un pixel n'est échantillonné que si la cible est
  aussi du ciel. Les palmiers (B = 128) oscillent de `0,0035·(0,4 + v)`, l'eau (B > 0,75) ondule.
  - Source : [B videoScene.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/videogen/videoScene.ts)
- **Code antérieur, figurants** : « The people of the set live: each sways and nods at its own pace (a soft warp
  inside their silhouettes) ». C'est un décalage d'UV `pm·sway·(0,0011 ; 0,0009)` à l'intérieur du masque doux
  `people`. Le même fichier ajoute lumière dérivante, chatoiement de l'air et poussières.
  - Source : [B livingSet.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/studio/livingSet.ts)
- **[audit] Effet mesuré de la vie du décor** :
  - décor figé : couverture 0,54, contre 0,53 avec le décor vivant, soit un effet négligeable ;
  - la cause de l'échec du film 9 était la carte entière du personnage et le décor entier sous la caméra.
  - Seuil de couverture : zone 8×8 à |Δ| moyen supérieur à 0,012 (gris 96×170, 12 i/s).
- **[mesure] Masques du kit** (`masks.png` R, 191 décors, ouverture morphologique, composantes > 0,04 % de l'image) :
  - nombre de composantes R : médiane 3, p90 8, max 16 ;
  - composantes de **forme personne** (h/l > 1,3 et h < 0,6·H) : médiane 0, présentes dans **75 décors sur 191**
    seulement ;
  - **156 décors sur 191** ont une masse R plus large que 35 % de l'image (foule ou véhicules fusionnés) ;
  - ciel (G > 127) : plus de 5 % de l'image sur 169 décors, plus de 20 % sur 48, moins de 0,5 % sur 11.
- [audit] `people.png` n'existe que pour 13 décors. C'est un masque doux en gris, corrélé à 0,70 avec R. Le premier
  plan R regroupe personnes, voitures, bus, motos, animaux, etc.

### Inferences
- **Figurants en vrai calque.** Le kit contient `src` (avec figurants) et `plate` (sans). Le calque des figurants est
  donc `src` avec un alpha égal au masque R adouci, posé sur la plaque. Le déplacer ne tire jamais le fond, puisque la
  plaque est intacte dessous. C'est le défaut corrigé par rapport à la déformation d'UV de `livingSet.ts`.
- **Cellules de personne par les têtes.** Les composantes connexes ne marchent pas, puisque 82 % des décors ont des
  masses fusionnées. On procède ainsi :
  1. on prend le profil supérieur `y_top(x)` du masque R ;
  2. on le lisse ;
  3. les minima locaux sont des têtes ;
  4. leur espacement est comparé à la largeur attendue d'une personne à cette ligne, donnée par la formule `fit`
     (`h_px(y) = 1,7·(y − y_h)/1,6`, largeur ≈ 0,28·h_px) ;
  5. un pic plus large que 1,8 fois la largeur attendue, et plus bas que 0,8·h_px, est un **véhicule** : il reste
     immobile.
- **Amplitude.** Il faut au plus **1,5 px de sortie** de déplacement par figurant, et des périodes de 2,8 à 4,5 s tirées
  d'une graine. Le mouvement reste ainsi sous le seuil de 0,012 par zone de la porte, sauf pour les figurants très
  proches. Pour ceux-là, l'amplitude est réduite selon leur taille à l'écran.
- **Ciel.** Le ciel est à l'infini : il ne doit pas suivre la parallaxe de translation, seulement les rotations ou
  panoramiques et le zoom. On pré-remplit une « plaque de ciel » par push-pull sous les bâtiments, pour que la dérive
  ne tire jamais la couleur d'un toit. La vitesse de dérive est faible et la période longue (20-30 s), ce qui évite tout
  « fantôme » visible dans le fondu des deux phases.
- **Lumières.** Guirlandes du maquis, néons et écrans : on détecte des petites taches très claires (L > 85,
  surface < 0,3 % de l'image) et on y ajoute des **sprites de halo additifs** dont l'intensité suit un bruit
  déterministe. On ne déforme pas la peinture. Le coût est quasi nul : quelques sprites.

### Gaps
- Le compte de « têtes » par le profil supérieur n'a pas été validé visuellement sur les 191 décors : c'est une
  proposition.
- Le masque G « ciel » n'a pas été vérifié sur les intérieurs. 11 décors seulement ont moins de 0,5 % de ciel, alors
  que le kit compte plusieurs intérieurs (salon, bureau, hôpital) : des faux positifs sont possibles.
- La contribution réelle des figurants animés à la couverture de la porte n'a pas été mesurée sur un plan rendu.

---

## Q3. Grammaire caméra du sketch comique en 9:16, et zones sûres TikTok

### Takeaway
Dans la comédie, la caméra **ponctue**, elle n'accompagne pas. Elle reste posée par défaut, ce qui correspond aux
TikTok de la chaîne ([audit]). Les mouvements sont rares et datés sur le gag :
- zoom éclair (crash zoom) sur la réaction ;
- panoramique filé (whip pan) pour changer de lieu ou de sujet en cachant la coupe ;
- secousse « trauma » brève sur un choc ;
- plan de réaction ;
- arrêt sur image avec disque rayé pour la chute.

TikTok ne publie **pas** de marges en pixels : la zone sûre dépend du ratio et de la longueur de la légende. Une capture
iOS mesurée donne :
- en haut : y 42-131 ;
- à droite : la colonne de boutons, x ≥ 880 pour y ≥ 803 ;
- en bas : la légende, à partir de y ≈ 1744 pour une légende courte.

Les sous-titres incrustés vont donc dans la bande **y ≈ 1150-1550, x ≈ 100-860**, et les visages dans
**y ≈ 250-1150**.

### Cited Findings
- **Zoom éclair.**
  - Un zoom exécuté très vite, dont l'usage principal est de **dynamiser un plan de réaction**, avec « an inherent
    comedic aspect baked into the crash zoom ». Source : [StudioBinder](https://studiobinder.com/blog/what-is-a-zoom-shot-definition)
  - Un zoom rapide et abrupt, utilisé pour le timing comique, surtout pince-sans-rire, pour souligner une réaction ou un
    malaise. Source : [How to Film School](https://howtofilmschool.com/dictionary/crash-zoom-film/)
- **Panoramique filé.** Une rotation si rapide que l'image se fond en traînées. Le flou de bougé « is integral to making
  the transition work since it helps to hide the cut ». Il faut raccorder la luminosité et les couleurs au point de
  coupe. Source : [No Film School](https://nofilmschool.com/2017/09/5-steps-create-perfect-whip-pan-transition)
- **Comédie visuelle (essai « How to Do Visual Comedy » sur Edgar Wright).** La comédie passe par :
  - le cadrage ;
  - les entrées et sorties de champ ;
  - les transitions raccordées ;
  - les **effets sonores parfaitement synchronisés** ;
  - l'action calée sur la musique ;
  - un mouvement de caméra (zoom, grue, panoramique) qui peut faire rire à lui seul.
  - Source : [Laughing Squid](https://laughingsquid.com/how-to-do-visual-comedy-an-analysis-of-director-edgar-wrights-humorous-cinematic-styles-and-techniques/) ; [MovieMaker](https://www.moviemaker.com/edgar-wright-visual-comedy-video/amp/)
- **Secousse « trauma »** (Squirrel Eiserloh, GDC 2016, « Juicing Your Cameras With Math ») :
  - une valeur de trauma entre 0 et 1, qui **décroît avec le temps** ;
  - un bruit continu (Perlin) plutôt que de l'aléatoire, pour une secousse lisse ;
  - une **amplitude ∝ trauma²**, car une secousse linéaire « ne claque pas ».
  - Sources : [Bevy, exemple 2D screen shake](https://bevy.org/examples/camera/2d-screen-shake/) ; [Game Developer](https://www.gamedeveloper.com/programming/video-sprucing-up-cameras-with-math)
    (ce sont des implémentations secondaires ; la vidéo d'origine n'a pas été vue).
- **TikTok, sources officielles (Ads)** :
  - 9:16 recommandé, au moins 540×960 ;
  - formats .mp4, .mov, etc. ; au plus 500 Mo ; au moins 516 kb/s ;
  - « the safe zone depends on the dimension, caption length, and any additional formats ». Seuls des **fichiers de
    zone sûre téléchargeables** sont fournis, **sans valeur en pixels** ;
  - ni fréquence d'images ni audio ne sont précisés.
  - Source : [TikTok Ads Help](https://ads.tiktok.com/help/article/tiktok-auction-in-feed-ads)
- **Zones sûres tierces.** Elles sont **divergentes** :
  - en haut, de 110 à 270 px selon l'outil ;
  - en bas, de 250 à 660 px ;
  - à droite, de 100 à 180 px.
  - Source : [synthèse de recherche : Flixier](https://flixier.com/tools/safe-zones-for-social-media-videos/tiktok-safe-zone-overlay), [AICarousels](https://www.aicarousels.com/free-tools/tiktok-safe-zone-checker), [House of Marketers](https://www.houseofmarketers.com/guide-to-safe-zones-tiktok-facebook-instagram-stories)
- **[mesure] Zone d'interface TikTok** (calque de Remotion, « measured at 9:16 from representative iOS captures »,
  1080×1920, pixels d'alpha > 20) :
  - barre du haut : y 42-131, x 42-1039 ;
  - colonne de droite : x 880-1052, éléments de y 803 à 1733 ;
  - bloc de légende : x 29-387, y 1744-1887, pour une légende courte ;
  - barre du bas : y 1831-1903.
  - Source du calque : [Remotion, Social safe zones](https://www.remotion.dev/elements/overlays/social-safe-zones/) (calque téléchargé dans un dossier isolé et mesuré, non réutilisé)
- **Fréquence d'images.** Les sources tierces donnent 30 i/s par défaut et 60 i/s acceptés. Aucune page officielle n'a
  été trouvée. Source : [GrowthScribe](https://growthscribe.com/tiktok-video-size/)

### Inferences
**Tailles de plan en 9:16**, rapportées à la hauteur visible du corps (H = 1920) :

| Plan | Cadrage |
|---|---|
| plan d'ensemble | personnages à 25-35 % de H |
| plan pied | corps à 75 % de H |
| plan américain | mi-cuisse à la tête = 85 % de H |
| plan taille | 80 % de H |
| plan poitrine | 75 % de H |
| gros plan | tête à 55 % de H |

- La ligne des yeux se place à y ≈ 0,30-0,38·H, sous la barre du haut. Le visage du « réagissant » tient dans
  x ≤ 860 pour ne pas passer sous la colonne de boutons.
- **Champ deux personnages en vertical.** On ne met pas les deux personnages côte à côte en plan large, car ils
  deviennent petits. Il vaut mieux **les étager en profondeur** : l'un plus proche, plus grand et décalé sur le bord,
  l'autre plus loin, au centre. Le 2.5D le permet à coût nul (échelle par `fit`, ombre, flou).
- **Amorce par-dessus l'épaule (OTS) en 2.5D.** Le personnage d'amorce est le même sprite :
  - agrandi ×1,6 à ×2 ;
  - décalé en bas à gauche ;
  - flouté (niveau de flou précalculé) ;
  - assombri de 30 % ;
  - le visage du partenaire au tiers supérieur.
- **Zoom éclair** : changement de focale, donc **sans changement de parallaxe**. C'est une mise à l'échelle 2D de toute
  la pile de calques autour du visage cible a. Le centre de caméra suit `c(t) = a + (c₀ − a)·s₀/s(t)`, avec
  s(t) qui passe de s₀ à k·s₀ (k = 1,25-1,6) en **3 à 5 images**, en ease-out cubique avec 3 % de dépassement.
- **Poussée (dolly) dramatique**, à opposer au zoom éclair : c'est la seule qui montre la parallaxe. Elle doit respecter
  le budget de Q1.
- **Panoramique filé** : 6 à 10 images à 30 i/s, en smootherstep. La **coupe tombe sur l'image de vitesse maximale**.
  Le flou directionnel a une longueur `b = |v|·0,5 image` (obturateur 180°). On raccorde la luminance moyenne des deux
  plans au point de coupe.
- **Secousse.** On applique `offset(t) = A·T(t)²·(n₁(f·t), n₂(f·t))` et `roll = R·T(t)²·n₃(f·t)`, avec une **forme
  close** :
  - `T(t) = clamp(Σᵢ aᵢ·max(0, 1 − λ(t − tᵢ)), 0, 1)` sur les impulsions passées ;
  - un bruit de valeur à graine ;
  - c'est donc une fonction pure de t, que l'on peut parcourir dans les deux sens.
  - Valeurs : A ≈ 18 px, R ≈ 1,5°, f ≈ 12 Hz et λ ≈ 2,5 /s.
- **Réaction et chute.** Coupe sur le gros plan du réagissant environ 0,3 à 0,5 s après le mot-chute (valeur d'usage,
  non sourcée). Puis arrêt sur image : remappage du temps `t_eval = min(t, t_freeze)`, zoom de 1,0 à 1,08 en 4 images,
  désaturation de 40 %, vignette, et un **son de disque rayé synchronisé à t_freeze** (« perfectly timed sound
  effects »).
- **Sous-titres** : 2 lignes au plus, boîte de 760 px de large au plus (x 100-860), ligne de base vers y ≈ 1400. Le
  bloc reste au-dessus de la légende TikTok, même longue (estimée à 4 lignes depuis y ≈ 1590), et hors de la colonne de
  droite.

### Gaps
- Pas de valeurs officielles TikTok en pixels : les fichiers de zone sûre officiels n'ont pas été téléchargés (page
  Ads uniquement). Android n'a pas été mesuré.
- L'essai vidéo sur Edgar Wright n'a pas été visionné : les techniques viennent de résumés.
- Aucune source primaire trouvée pour le délai de coupe de réaction ni pour la convention arrêt sur image + disque
  rayé : ce sont des usages de montage, à calibrer sur les TikTok de la chaîne avec `clipInspect`.

---

## Q4. Intégrer des personnages plats dans des décors peints qui ont l'air 3D : sol, échelle, occlusion, ombres, couleur, flou

### Takeaway
Le kit permet une intégration **géométriquement juste sans moteur 3D** :
- `fit` donne l'horizon et l'échelle en pixels par mètre à chaque ligne ;
- la profondeur de la plaque est **affine en y sur le sol**, avec R² > 0,9 sur 138 décors sur 191 ;
- on peut donc convertir la ligne des pieds d'un personnage en disparité, puis **tester l'occlusion pixel par pixel**
  contre la plaque : un personnage passe derrière la table.

Le reste de « l'irréel » se corrige à coût de rendu nul, avec des valeurs précalculées par plan :
- une ombre de contact et une ombre portée cisaillée ;
- un décalage **partiel** de couleur vers les statistiques Lab du décor, pour garder l'identité des personnages ;
- un liseré de lumière (rim) cuit à partir de l'alpha ;
- un flou de profondeur par niveaux précalculés, et non par filtre.

### Cited Findings
- **Insertion d'objets dans une photo** (Karsch et al., SIGGRAPH Asia 2011) :
  - on construit un modèle physique minimal de la scène depuis une seule image et quelques annotations de lumière
    (géométrie englobante, surfaces extrudées, sources surfaciques, caméra) ;
  - ce modèle permet les interactions de lumière entre l'objet inséré et la scène ;
  - une étude utilisateurs juge les résultats difficiles à distinguer de photos réelles.
  - Sources : [PDF UIUC](https://vision.cs.illinois.edu/~vhedau2/Publications/sigasia2011_insertingobjects.pdf) ; [SIGGRAPH History](https://history.siggraph.org/?p=197622)
- **Transfert de couleur** (Reinhard et al., IEEE CG&A 2001) : on fait correspondre, canal par canal, **moyenne et
  écart-type** dans l'espace lαβ, dont les canaux sont presque décorrélés. Source : [revue arXiv 2204.13339](https://arxiv.org/pdf/2204.13339)
- **`fit` du kit** ([audit], d'après `ground.horizon_fit`) :
  - `mH = clip(1,6·H/(y_f − y_h), 2, 8)`, donc `y_h = y_f − 1,6·H/mH`, avec `y_f = floor·H` ;
  - hauteur à l'écran d'un personnage dont les pieds sont à la ligne y : `h_px(y) = taille_m·(y − y_h)/1,6` ;
  - 12 décors sont bloqués à mH = 8, et `floor` vaut 0,95 par défaut sur 180 décors sur 191 ;
  - un personnage de 1,60 m mesure de 65 à 620 px sur la plaque (médiane 226 px).
- **[mesure] Le sol dans la profondeur** :
  - méthode : bande centrale x 30-70 %, de 0,55·H à `floor`, hors ciel et premier plan, médiane par ligne, ajustement
    `d(y) = α·y + β` ;
  - **R² > 0,9 sur 138 décors sur 191**, R² > 0,8 sur 162, médiane 0,961 ;
  - **pente positive** (plus proche en bas) sur 185 décors sur 191 ; pente médiane de 1,73 unité de disparité par
    hauteur d'image ;
  - `maquis` : R² 0,65 (sol encombré de tables) ; `abidjan` : 0,984 ; `plage` : 0,919.
- **[mesure] Couleur des plaques** (Lab moyen, 191 décors) :
  - L : médiane 49,3, de 26,6 à 64,0 ; 7 décors sombres (L < 35, dont `maquis`, L = 26,6, a = 17,9, b = 15,2) et
    13 clairs (L > 60) ;
  - a moyen : de −13,2 à 34,7 ; b moyen : de −18,2 à 42,8 ;
  - écart-type de L : de 14,6 à 29,9.
  - Les dominantes varient donc nettement d'un décor à l'autre.
- **[mesure] Coût du flou de profondeur par filtre** : PixiJS `BlurFilter` (strength 4, quality 2) sur le maillage du
  décor fait passer le rendu seul de **137,5 à 316,2 ms/image** en 1080×1920 (+130 %) et de 57,4 à 246,6 ms en
  720×1280 (voir Q6).
- **Code antérieur** : `livingSet.ts` calculait déjà la couleur moyenne du décor (« the light the actors take on ») et
  préparait des textures `sharp` et `soft` (flou de lentille selon la distance). Source : [B livingSet.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/studio/livingSet.ts)
- [audit] **« Personnage irréel »** : un dessin émissif posé sur un décor éclairé ne reçoit ni la lumière ni l'ombre du
  décor.

### Inferences
- **Disparité d'un personnage.** On calcule `d_c = α·y_pieds + β`. Un pixel de la plaque **occulte** le personnage si
  `d(x, y) > d_c + τ`, avec τ ≈ 0,03-0,05, et s'il n'est pas du ciel.
  - Rendu par l'algorithme du peintre en N+1 passes : plaque complète, puis pour chaque personnage du plus loin au plus
    proche, le personnage suivi d'une « passe d'occultation » de la plaque.
  - Cette passe est limitée par un **scissor** au rectangle du personnage, avec un fragment qui ne garde que
    `d > d_c + τ`.
  - Pour les décors où R² < 0,8 (29 décors), on se replie sur l'occlusion par la seule ligne des pieds et l'on signale
    le cas dans l'AssetRegistry.
- **Ombre de contact.** Une ellipse sous les pieds :
  - largeur ≈ 0,9 × épaules ;
  - aplatissement `r = (y_f − y_h)/√((y_f − y_h)² + f²)`, où f est la focale en pixels, estimée à partir d'un champ
    vertical supposé d'environ 50°, ce qui reste à calibrer ;
  - opacité de 0,35 à 0,6, d'autant plus forte et nette que l'écart-type de L du décor est grand (contraste de la
    lumière).
- **Ombre portée.** C'est la silhouette alpha du personnage, cisaillée sur le sol :
  - `x' = x + (y_f − y)·s_x`, `y' = y_f + (y_f − y)·s_y`, avec s_y ≈ −0,25 ;
  - la direction de lumière vient d'un champ `light` à ajouter au manifeste du décor (par défaut : soleil zénithal
    dehors, plafonnier dedans) ;
  - le flou croît avec la distance aux pieds, par mélange de deux niveaux de flou précalculés.
- **Couleur, version améliorée de Reinhard.** Le transfert complet détruirait l'identité des personnages : costumes et
  peau sont des repères de la bible. On applique un **décalage partiel** vers les statistiques locales du décor, prises
  autour du personnage, hors masque R :
  - `L' = L + w_L·(μ_L,décor − 55)` ;
  - `a' = a + w_ab·μ_a,décor` et `b' = b + w_ab·μ_b,décor` ;
  - avec w_L ≈ 0,35 et w_ab ≈ 0,25.
  - On l'approxime par une **matrice couleur 3×4 par personnage et par plan**, en RGB linéaire. Le coût est nul : un
    uniforme.
  - Sur les mesures, cela donne jusqu'à environ −10 en L dans un maquis de nuit (0,35 × (26,6 − 55)) et +10,7 en b
    dans le décor le plus chaud (0,25 × 42,8) : visible, mais pas destructeur.
- **Liseré de lumière (rim).** À partir de l'alpha flouté sur 3 px :
  - la normale 2D vaut `n = −∇α/|∇α|` ;
  - `rim = clamp(n·l₂D, 0, 1)·(1 − α_intérieur)·k` ;
  - la couleur est celle de la source la plus claire du décor (ciel ou lampe).
  - Ce masque de bord est **cuit une fois par texture**, pas par image.
- **Flou de profondeur.** On précalcule 2 niveaux de flou de la plaque (σ ≈ 2 et 5 px de sortie) une fois au chargement.
  Le fragment fait `mix(net, flou1, flou2)` selon `CoC = |d − d_focus|·k`, soit 2 lectures de texture de plus au lieu
  d'une passe plein écran (+180 ms mesurés). Le champ `blur` existant de `fit` (5 décors) sert de défaut.
- **Échelle.** On utilise `h_px(y_pieds)` (Q4) et la `taille_m` de la bible : la taille relative des 54 personnages est
  respectée quand ils avancent ou reculent.

### Gaps
- Aucune source n'a été trouvée sur l'estimation de la direction de lumière dans une **peinture** : c'est à annoter à
  la main (ou par une heuristique de gradient de luminance), puis à valider.
- La focale et le champ des décors sont inconnus. Ils ne sont pas dans `fit`, et ne sont estimables que par l'horizon
  et une hypothèse de hauteur d'œil (1,6 m), déjà faite par `horizon_fit`.
- Les poids w_L et w_ab n'ont pas été validés par un test visuel. Une planche de contrôle sur 6 décors contrastés
  (maquis, plage, abidjan, marché, salon, bureau) est à prévoir.
- La méthode d'ombres de Karsch n'a pas été lue au-delà de l'abrégé et des légendes.

---

## Q5. Qualité d'image en WebGL logiciel : anticrénelage, flou de bougé, densité de maillage. Mesures PixiJS 8 sous SwiftShader

### Takeaway
Sous SwiftShader, sans GPU, **le MSAA 4× coûte environ 45 à 60 ms par image en 1080×1920**. Le rendu seul passe de
137,5 ms avec MSAA à 76-92 ms sans MSAA. Or nos découpes sont des textures à bords alpha : il suffit de **marges
transparentes et d'alpha prémultiplié** pour se passer du MSAA.

Le flou de bougé par accumulation de sous-images coûte ×5,8 avec 4 sous-images : il faut le réserver aux 6 à 10 images
d'un panoramique filé. Pour les membres, on utilise le **smear** cartoon, un étirement du maillage le long de la
vitesse, à coût nul.

La densité du maillage du décor coûte peu tant qu'elle reste raisonnable : 129×65 sommets est un bon point.

### Cited Findings
**[mesure] Banc PixiJS 8.22.0** (MIT, vérifié dans `package.json`)
- Configuration :
  - Chromium 141 headless shell, ANGLE/SwiftShader, WebGL 2.0 ;
  - plaque `maquis` (1024×494) en `MeshPlane` de 129×65 sommets, déformée chaque image par sa `plateDepth` (parallaxe
    et dolly) ;
  - deux personnages découpés en `MeshPlane` de 9×21 (flexion du buste, respiration) et deux ombres de contact ;
  - rendu piloté image par image (`autoStart: false`, sans rAF), synchronisation par `readPixels` d'1 px ;
  - 60 images par mesure.

| Mesure | 1080×1920 | 720×1280 |
|---|---|---|
| A. rendu seul, MSAA activé (`antialias: true`) | **137,5 ms** (7,3 i/s) | 57,4 ms (17,4 i/s) |
| M. rendu seul, **sans MSAA** | **76,2 ms** ; 91,7 ms au 2e passage (10,9-13,1 i/s) | 48,7 ms (20,6 i/s) |
| N. maillage du décor 257×129 (33k sommets), MSAA | 159,2 ms (+16 % sur A) | 123,6 ms |
| L. + `BlurFilter` sur le décor (flou de profondeur) | 316,2 ms (+130 %) | 246,6 ms |
| K. flou de bougé, accumulation de **4** sous-images | 793,9 ms (×5,8) | 412,5 ms |
| K. flou de bougé, accumulation de **8** sous-images | 1 089,2 ms (×7,9) | 746,2 ms |

- Variance : le même rendu sans MSAA a donné 76,2 puis 91,7 ms dans deux passages séparés. Il faut compter ±10-20 %
  de bruit de mesure.
- **Rappel [audit]** : en WebGL2 brut (quad 2048×1024 + 120 sprites), Chromium complet en 1080×1920 donnait 35,6 ms,
  et le headless shell 90-95 ms avec lecture `readPixels`. PixiJS n'ajoute donc pas de surcoût notable à
  configuration égale.
- **Limites de WebGL** ([audit]) : `MAX_SAMPLES` 4 en WebGL2, texture maximale 8192, pas de WebGPU.

**Documentation**
- PixiJS 8 `MeshPlane` est une grille subdivisée « useful for distortion or grid-based warping ».
  - Les sommets s'écrivent directement dans `geometry.positions`. Le banc appelle en plus
    `geometry.getBuffer('aPosition').update()` pour forcer l'envoi au GPU. La page ne décrit pas d'appel séparé, et le
    banc n'a pas testé sans cet appel.
  - `PerspectiveMesh` corrige la perspective par les UV, à partir de 4 coins.
  - Source : [PixiJS, Mesh](https://pixijs.com/8.x/guides/components/scene-objects/mesh)
- `TextureSource` : `antialias` « mainly affects RenderTextures… a Blit operation is needed to resolve » ;
  `autoGenerateMipmaps` est à éviter sur les RenderTextures mises à jour chaque image. Source : [PixiJS, TextureSourceOptions](https://pixijs.download/release/docs/rendering.TextureSourceOptions.html)
- **Flou de bougé par reconstruction** (McGuire et al., I3D 2012) : un post-traitement en espace écran sur un tampon de
  vitesse. L'image est découpée en **tuiles**, chacune prend la vitesse maximale de son voisinage, puis on mélange des
  échantillons le long de cette direction dominante. La méthode produit des artefacts quand la vitesse varie fortement à
  l'intérieur d'une tuile. La suite de Guertin et al. critique cette hypothèse d'une seule vitesse par tuile.
  - Sources : [G3D, MotionBlur](https://casual-effects.com/g3d/G3D10/build/manual/class_g3_d_1_1_motion_blur.html) ; [Unity, Camera Motion Blur](https://docs.unity3d.com/410/Documentation/Components/script-CameraMotionBlur.html) ; [Guertin et al. 2014](https://mail.casual-effects.com/research/Guertin2014MotionBlur/Guertin2014MotionBlur-small.pdf)

### Inferences
- **Anticrénelage sans MSAA.** Dans une scène 2D texturée, les bords visibles sont ceux de **l'alpha des textures**,
  pas ceux des triangles, à condition que la géométrie dépasse l'opaque. Règles :
  - au moins 2 px de marge transparente autour de chaque pièce ;
  - alpha prémultiplié ;
  - mipmaps quand une pièce est réduite plus de 2 fois (plans d'ensemble) ;
  - bords des déchirures du décor en rampe alpha avec `fwidth`.
  - Gain mesuré : **−45 à −60 ms par image**. Un FXAA final reste une option à mesurer, si des crénelages subsistent sur
    les bords de déchirure.
- **Flou de bougé.** Le tampon de vitesse façon McGuire coûterait au moins deux passes plein écran, soit l'ordre de
  grandeur du `BlurFilter` mesuré (+180 ms). C'est trop cher partout et inutile en cartoon, où l'on attend des
  **smears**.
  - **Smear** : les sommets « en retard » d'une pièce se déplacent le long de `−v` :
    `p' = p − v·Δt_obt·w(p)`, avec `w = smoothstep(0, 1, −(p − c)·v̂/L)`. Il faut un historique de vitesse, que l'on
    tire de la dérivée analytique de `evaluate(t)`, donc sans état.
  - Le **flou directionnel** plein écran est réservé aux images d'un panoramique filé. Toute l'image a alors la même
    vitesse : un seul flou 1D de 8 à 16 échantillons suffit.
  - **Accumulation** (×5,8) : seulement pour un plan exceptionnel, rendu hors ligne.
- **Densité du maillage.** 129×65 sommets (environ 1 sommet pour 4 px de la profondeur 512) suffit : passer à 257×129
  coûte +16 % pour un gain invisible, car la profondeur est à 512 px de large.

### Gaps
- Le FXAA n'a pas été mesuré.
- La qualité visuelle sans MSAA (bords des pièces) n'a pas été jugée sur de vrais personnages, seulement sur des
  silhouettes de test.
- Les accumulations ont été faites en RGBA 8 bits (moyenne glissante par alpha 1/(j+1)). Le banding n'a pas été
  mesuré ; le flottant 16 bits n'a pas été testé.

---

## Q6. Capture headless déterministe, débit réel en 1080×1920, réglages FFmpeg pour TikTok et vérification ffprobe

### Takeaway
**Méthode retenue, mesurée de bout en bout** : on rend l'image i par un appel explicite, sans rAF, puis on capture par
`canvas.toDataURL('image/jpeg', 0.95)`. La chaîne base64 remonte vers Node, puis passe en tube dans `ffmpeg -f image2pipe -c:v mjpeg`
vers libx264.

Résultats :
- **183 ms par image en 1080×1920 sans MSAA** (5,5 i/s), 250 ms avec MSAA ; 94 ms en 720×1280 avec toBlob JPEG ;
- la capture JPEG q95 perd **moins** (43 dB) que la conversion yuv420p + x264 crf 18 qui suit (≈ 40 dB pour la chaîne
  complète) ;
- les **pixels rendus sont identiques au bit près** à la même image, que l'on rejoue dans la même page, après un
  retour arrière, dans une autre page ou dans un autre navigateur (SwiftShader).

`readPixels` brut est **le plus lent** : 967 ms, car le transfert de 8 Mo passe par la pile réseau. Le débit agrégé
double avec **4 navigateurs séparés** (84 ms par image), mais pas avec 4 onglets d'un même navigateur (132 ms).

Il faut convertir explicitement en **BT.709 et étiqueter** le flux, sinon les tons chair dérivent (mesuré).

### Cited Findings
**[mesure] Capture, 1080×1920, 60 images, avec MSAA sauf mention contraire**

| Méthode | ms/image | i/s | Taille par image |
|---|---|---|---|
| B. `page.screenshot` JPEG q95 | 305,5 | 3,27 | – |
| C. `page.screenshot` PNG | 937,8 | 1,07 | – |
| D. `canvas.toDataURL` JPEG 0,95 → `evaluate` | **177,1** ; 166,6 sans MSAA | 5,65 ; 6,00 | 421 Ko en base64 |
| E. `canvas.toBlob` JPEG → POST binaire vers Node | 226,0 | 4,43 | 316 Ko |
| F. `canvas.toBlob` PNG → POST binaire | 306,8 | 3,26 | 1 939 Ko |
| G. `readPixels` RGBA brut → POST binaire | 967,3 | 1,03 | 7,9 Mo |
| H. bout en bout, brut → ffmpeg | 960,7 | 1,04 | – |
| I. bout en bout, toBlob JPEG → ffmpeg | 205,0 | 4,88 | – |
| J. bout en bout, toBlob PNG → ffmpeg | 247,2 | 4,05 | – |
| **O. bout en bout, toDataURL JPEG → ffmpeg, sans MSAA** | **183,3** | **5,46** | – |
| O. idem, avec MSAA | 249,9 | 4,00 | – |
| CDP `HeadlessExperimental.beginFrame` + capture JPEG q95 (`--deterministic-mode`), sans MSAA | 193,4 | 5,17 | – |
| idem, avec MSAA | 242,9 | 4,12 | – |

- L'encodage du tableau est `libx264 -preset veryfast -crf 18 -profile:v high -pix_fmt yuv420p -movflags +faststart`.
- Vérification `ffprobe -count_frames` : `h264,High,1080,1920,yuv420p,30/1,60`, soit 60 images lues sur 60 pour
  chaque sortie.
- **En 720×1280** (avec MSAA) :
  - toDataURL JPEG : 120,8 ms ;
  - bout en bout toBlob JPEG : **93,9 ms (10,65 i/s)** ;
  - bout en bout PNG : 122,4 ms ;
  - bout en bout brut : 367,1 ms ;
  - screenshot JPEG : 127,2 ms.
- **Parallélisme**, en débit agrégé (60 images réparties, toDataURL, sans MSAA ni encodage) :

  | Configuration | ms/image agrégé | i/s |
  |---|---|---|
  | 1 onglet | 165,1 | 6,06 |
  | 2 onglets du même navigateur | 155,6 | 6,42 |
  | 4 onglets du même navigateur | 132,5 | 7,55 |
  | **2 navigateurs** | **108,9** | 9,19 |
  | **4 navigateurs** | **84,0** | **11,91** |

- **Déterminisme** :
  - empreinte des pixels (`readPixels`) de l'image 37 identique dans la même page, après rendu d'une autre image, dans
    une nouvelle page et dans un nouveau navigateur : `9e740f46` en 1080×1920 et `27739c0b` en 720×1280 ;
  - `beginFrame` : deux captures PNG de la même image rejouée sont identiques.
- **Qualité**, image 37, mesurée par le filtre `psnr` de ffmpeg en RGB :
  - JPEG q95 contre pixels exacts : **43,05 dB** ;
  - JPEG q85 : 41,40 dB ;
  - chaîne complète JPEG q95 + x264 crf 18 veryfast (image dans le GOP) : **40,60 dB** ;
  - x264 crf 18 seul sur une image isolée : 39,43 dB (conditions différentes : image I seule).
- **Matrice couleur.** Une couleur orange de peau (217,130,43) est encodée deux fois :
  - conversion par défaut, non étiquetée (`unknown`), puis lue en BT.709 comme le fait un lecteur HD : **(223,131,37)**,
    soit +6 en R et −6 en B ;
  - avec `scale=out_color_matrix=bt709:out_range=tv` et les étiquettes `bt709/tv` : **(217,129,42)**.
- **FFmpeg du conteneur** ([audit]) : 6.1.1, `--enable-gpl --enable-libx264`, aac présent.
  `ffmpeg -h encoder=libx264` donne les options `-crf`, `-preset`, `-tune`, `-profile`, `-x264-params` et les formats
  `yuv420p`… [mesure]

**Documentation**
- `+faststart` : « Run a second pass moving the index (moov atom) to the beginning of the file ». L'option n'est pas
  active par défaut et ne marche pas en sortie fragmentée. Source : [FFmpeg Formats](https://ffmpeg.org/ffmpeg-formats.html)
- **Horloge Playwright** (`page.clock`) : elle remplace `Date`, `setTimeout`/`setInterval`,
  `requestAnimationFrame`, `requestIdleCallback`, `performance` et `Event.timeStamp`. Ses fonctions sont `install`,
  `pauseAt`, `runFor` (fait avancer le temps en déclenchant timers et frames d'animation) et `fastForward`. Source : [Playwright, Clock](https://playwright.dev/docs/clock)
- **timesnap (BSD-3-Clause)** :
  - même principe de temps virtuel, par `evaluateOnNewDocument` : il remplace `Date`, `performance.now`, rAF et les
    timers ;
  - option `unrandomize` (graine pour `Math.random`) ;
  - mode « canvas » plus rapide que la capture d'écran ;
  - **les animations CSS ne sont pas couvertes**.
  - Source : [timesnap](https://github.com/tungs/timesnap)
- **Remotion** : licence propre et non libre. Elle est gratuite pour les individus et les entreprises de **3 employés
  au plus**, au-delà il faut une licence entreprise. Les vidéos produites sont utilisables commercialement. Nous ne
  l'utilisons pas. Source : [LICENSE.md Remotion](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)
- **Playwright 1.56.1** : Apache-2.0 (`package.json` local) [mesure].
- La page de référence CDP `HeadlessExperimental` n'a pas pu être lue (redirection). Le comportement de `beginFrame` est
  seulement **vérifié empiriquement** ci-dessus, sur `chrome-headless-shell` 141 : `Target.createTarget` avec
  `enableBeginFrameControl: true`, puis `HeadlessExperimental.beginFrame({screenshot})`.

### Inferences
- **Pourquoi D bat E** : `toDataURL` est synchrone dans le fil de rendu, alors que `toBlob` ajoute un aller-retour
  asynchrone et un POST HTTP. Le base64 (+33 %) coûte moins que la pile réseau. **Pourquoi G est si lent** : 8 Mo par
  image traversent le réseau de Chromium. Le format compressé gagne toujours en logiciel.
- **Le JPEG intermédiaire n'est pas le goulot de qualité.** 43 dB, contre environ 40 dB pour la chaîne finale : la
  perte dominante vient du sous-échantillonnage 4:2:0 et de x264. Pour un master, on peut passer à PNG (+20 à +30 % de
  temps en bout en bout, J contre I).
- **Temps pour un sketch de 45 s à 30 i/s** (1 350 images) :
  - 1 navigateur sans MSAA : 1 350 × 0,183 s ≈ **4,1 min** ;
  - 4 navigateurs : ≈ **1,9 min** de capture, plus l'encodage, non mesuré en concurrence ;
  - en 720×1280 : ≈ 2,1 min sur un seul navigateur ;
  - 60 i/s double ces temps. Avec des courbes analytiques, 30 i/s suffit (sources tierces : 30 i/s par défaut).
- **Parallélisme correct** : chaque navigateur rend une **plage disjointe** (c'est possible parce que `evaluate(t)` est
  pur) et l'encode en segment x264 avec des paramètres identiques. On assemble ensuite par le démultiplexeur
  `concat -c copy`. Chaque segment commence par une image IDR, puisque chaque encodage démarre sur une IDR. L'audio est
  multiplexé à la fin.
- **Réglages de livraison TikTok proposés** :

  ```
  ffmpeg -f image2pipe -c:v mjpeg -r 30 -i - -i mix.wav
    -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"
    -c:v libx264 -preset slow -crf 18 -tune animation -profile:v high -level 4.1 -g 60 -bf 2
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv
    -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest -movflags +faststart out.mp4
  ```

  - Le niveau 4.1 tient en 1080×1920 à 30 i/s : 68 × 120 = 8 160 macroblocs ≤ 8 192, et 244 800 macroblocs/s
    ≤ 245 760.
  - À 60 i/s, il faut le **niveau 4.2**.
  - Ces limites de niveau H.264 viennent de mes connaissances et sont à vérifier dans la table de l'annexe A de la
    norme.
  - `-tune animation` est proposé pour l'aplat cartoon ; son effet n'a pas été mesuré.
- **Gate ffprobe (ExportAdapter)** :
  - `v:0` : h264, High, 1080×1920, yuv420p, `r_frame_rate = 30/1`, `nb_read_frames` (avec `-count_frames`) égal au
    nombre attendu, étiquettes bt709 et tv ;
  - `a:0` : aac à 48 000 Hz ;
  - écart entre durée vidéo et durée audio inférieur à une image ;
  - `ffmpeg -v error -i out.mp4 -f null -` sans erreur (décodage intégral) ;
  - atome `moov` avant `mdat`, vérifié en lisant les en-têtes d'atomes de premier niveau ;
  - empreinte `-f framemd5` pour la non-régression.
- **Déterminisme au service de la QA** : comme les pixels sont identiques au bit près sous SwiftShader, on peut garder
  des **empreintes de référence** par image clé dans les tests de régression. Il faut épingler la build de Chromium.
  Sur le GPU de l'utilisateur, on passe à une tolérance perceptuelle.
- **Temps virtuel.** Notre moteur n'a pas besoin de rAF : on appelle `renderFrame(i)`. On installe quand même
  `page.clock` en pause et l'on remplace `Math.random` par une graine, pour qu'une bibliothèque tierce ne lise jamais
  l'heure réelle. Si des calques DOM ou CSS entrent dans l'image (sous-titres HTML), `beginFrame` en mode déterministe
  les capture de façon reproductible, pour un coût proche de D (193 ms contre 167 ms). Sinon, on dessine les
  sous-titres **dans le canvas**.

### Gaps
- Pas de mesure avec 4 navigateurs **et** encodage x264 concurrent : les 4 vCPU sont partagés, le gain réel sera
  inférieur à ×2.
- Pas de mesure à 60 i/s, ni sur un sketch complet de 45 s.
- La recommandation de débit de TikTok et le comportement de son réencodage n'ont pas de source officielle : les
  sources tierces divergent (2-8 Mb/s contre 10-15 Mb/s).
- Les limites de niveau H.264 et l'effet de `-tune animation` n'ont pas été vérifiés dans une source primaire. La page
  trac de FFmpeg H.264 était bloquée par un anti-robot.
- `beginFrame` est propre au headless shell ancien. Sa pérennité dans les futures versions de Chromium n'a pas été
  vérifiée.

---

## Ce que nous greffons dans notre moteur

Ce sont des algorithmes publics, réimplémentés. Aucun code tiers n'est copié. Les licences des sources de **code**
lues sont : 3D Photo (MIT, lu), 3D Ken Burns (CC BY-NC-SA, **idées seulement, aucun code**) et timesnap (BSD-3, idée).
Nos dépendances d'exécution sont PixiJS (MIT), Playwright (Apache-2.0) et FFmpeg (build GPL, usage local, consigné dans
`tool-manifest.json`).

### G1. `SetPrep` (hors ligne, une fois par décor, CPU) : LDI à deux couches sans réseau
On remplace l'inpainting appris de 3D Photo et de 3D Ken Burns par nos données : la plaque, plus une diffusion.

```
entrées : plate (1024), plateDepth d∈[0,1] (512, clair = proche), masks
1. d ← filtre médian bilatéral guidé par la couleur, 3 itérations (comme le prétraitement de 3D Photo),
   appliqué SEULEMENT dans une bande de 6 px autour des discontinuités (pas de lissage global, cf. DIBR)
2. arêtes E = {(p,q) voisins : |d_p − d_q| > τ_e}, τ_e = 0,04 (disparité) ;
   supprimer les composantes de bords < 12 px ; côté proche N = argmax d, côté lointain F
3. bande B = dilatation de N le long de −∇d, largeur b = 24 texels (budget, G2)
4. couche 1 (arrière) : couleur = push-pull (pyramide moyenne pondérée) des pixels hors B ∪ N ;
   profondeur d1 = min-filtre de d (érosion de disparité) sur B, sinon d
5. sorties privées : <id>.bg.jpg, <id>.bgDepth.png, <id>.edges.json (polylignes + Δd), <id>.floor.json (α, β, R²)
```

- Amélioration sur 3D Photo : déterministe, quelques secondes sur CPU contre 2-3 min en CUDA, et sans checkpoint à
  licence inconnue.
- Amélioration sur notre `videoScene.ts` : le trou montre une **vraie couche arrière**, et non une couleur tirée sur
  8 pas.
- Les zones « barbouillées » (faible variance haute fréquence sous l'ancien masque R) sont marquées dans `edges.json`
  comme interdites au cadrage serré.

### G2. `ParallaxBudget` et choix du cadrage : le 3D Ken Burns analytique

```
largeur de trou à une arête e pour un déplacement caméra (direction u, amplitude A px de sortie) :
  w_e(A,u) = Δd_e · A · |n_e · u|                (n_e normale de l'arête dans l'image)
contrainte : max_e w_e ≤ w_max,   w_max = 2 px sans couche 1,  w_max = b·S px avec couche 1 (S = px sortie / texel)
⇒ A_max(u) = w_max / max_e(Δd_e·|n_e·u|)
direction : u* = argmin_u Σ_e Δd_e·len_e·|n_e·u|   (énergie de trous ; 16 directions)
cadre final (zoom k) : argmax_c [ couverture(c) − λ1·barbouillé(c) − λ2·visage_hors_zone_sûre(c) ]
```

- C'est l'idée de 3D Ken Burns (maximiser la couverture), sans les 256 rendus et avec composition et zones sûres. Sur
  le kit, Δd p95 ≈ 0,28 donne A_max ≈ 7 px sans couche arrière (w_max = 2) : la caméra posée est la bonne valeur par
  défaut, et la parallaxe se réserve aux poussées motivées.

### G3. `ReliefMesh` (PixiJS) : maillage de profondeur à déchirure douce
- On utilise un `MeshPlane` de 129×65 pour la couche 0 et un autre pour la couche 1, juste derrière.
- Sommet : `p' = c + (p − c)·(1 + (d − d_f)·δ(t)) + (d − d_f)·A(t)·u`. C'est la formule du banc, à deux paramètres de
  caméra. Le ciel prend d = 0 : il n'a pas de parallaxe de translation.
- Attribut `aEdge` par sommet : `e = max_voisins |d − d_n|`. Dans le fragment de la couche 0 :

  ```
  α = 1 − smoothstep(τ0, τ1, e · |A(t)| / w_max)
  ```

  Il en résulte une rampe de 1 à 2 px, la stratification douce façon SLIDE : la couche 0 s'efface **seulement** quand
  le trou serait visible, et la couche 1 apparaît dessous.
- Envoi des positions : `geometry.positions` puis `getBuffer('aPosition').update()` (fonctionne au banc). Le coût est
  inclus dans les 76-92 ms mesurés.

### G4. `LivingSet2` : figurants en calques, ciel, eau, lumières, sous un budget de porte
- **Figurants.** Le calque est `src` avec un alpha égal au masque R adouci (gaussienne de 1,5 px), au-dessus de la
  plaque.
  - Les cellules de personne viennent du profil supérieur : `y_top(x)`, lissé, dont les minima locaux sont des têtes.
    La largeur attendue est `0,28·h_px(y_bas)`. Un véhicule (largeur > 1,8× l'attendue et hauteur < 0,8·h_px) reste
    immobile.
  - Mouvement de la cellule i, avec un poids `w_i(x)` en partition de l'unité (gaussiennes normalisées entre têtes) et
    `v` la hauteur relative depuis les pieds :

    ```
    respiration : y' = y_f − (y_f − y)·(1 + 0,006·sin(2πt/T_i + φ_i))
    balancement : rotation de θ_i(t) = 0,4°·sin(2πt/(1,7·T_i) + φ_i) autour des pieds, pondérée par v
    regard : décalage horizontal de la tête (25 % supérieurs) de ±1 px, par bruit de valeur à graine
    ```

  - Contraintes : déplacement d'au plus 1,5 px de sortie, T_i ∈ [2,8 ; 4,5] s, graine = hash(id du décor, i).
  - Test : la couverture de la porte avec acteurs absents doit être inférieure à 0,05 sur un plan de 3 s.
- **Ciel.** Masque G, plaque de ciel pré-remplie. La boucle à deux phases est
  `c = mix(S(u − v·φ), S(u − v·(φ − 1)), φ)` avec `φ = fract(t/T)`, T = 24 s et v = 0,04 largeur par période.
  C'est le principe avant/arrière de Holynski, réduit à un champ uniforme ; on est en profondeur infinie.
- **Eau** (B > 0,75) et **végétation** (B = 128) : on reprend les ondulations et balancements de `videoScene.ts` en
  divisant les amplitudes par 2 et en ajoutant une pondération par la taille à l'écran.
- **Lumières.** Détection hors ligne des taches L > 85 de surface < 0,3 %. On ajoute un halo additif par tache, avec
  `m_i(t) = 1 + a_i·(bruit(f_i·t + φ_i) − 0,5)`, où a_i vaut 0,06-0,12 et f_i 2-6 Hz. Pour les néons, des coupures
  rares sont tirées d'un processus de Poisson à graine. L'ambiance globale reste à 1 ± 0,01 (feu, écran).

### G5. `GroundModel` et `Compositor` : échelle, occlusion, ombres, couleur, flou
- **Sol** : `y_h = floor·H − 1,6·H/mH`, `h_px(y) = taille_m·(y − y_h)/1,6`, `d_sol(y) = α·y + β` (pris dans
  `floor.json`). Indicateur de fiabilité : R² ≥ 0,9 « sûr », entre 0,8 et 0,9 « vérifier », sous 0,8 « repli
  pieds-seuls ». Les décors à mH = 8 ou 2 sont signalés.
- **Occlusion** : ordre du peintre en N+1 passes (voir Q4), avec une passe d'occultation **scissorée** au rectangle de
  chaque personnage et le test `d > α·y_pieds + β + τ`.
- **Ombres** :
  - contact : ellipse d'aplatissement `r = (y_f − y_h)/√((y_f − y_h)² + f²)`, opacité `0,35 + 0,25·σ_L/30` ;
  - portée : silhouette cisaillée `(x + (y_f − y)·s_x, y_f + (y_f − y)·s_y)`, floutée par mélange de 2 niveaux.
- **Couleur** : matrice 3×4 par personnage et par plan, qui approxime en RGB linéaire le décalage partiel
  `L' = L + 0,35·(μ_L − 55)`, `a' = a + 0,25·μ_a`, `b' = b + 0,25·μ_b`. Les statistiques sont prises dans une fenêtre
  autour du personnage, hors masque R. C'est un Reinhard amélioré : il préserve l'identité de la bible.
- **Rim** : masque de bord cuit une fois par texture (normale `−∇α` sur l'alpha flouté de 3 px). Son intensité suit la
  direction de lumière du manifeste.
- **Flou de profondeur** : 2 niveaux précalculés et `mix` selon `CoC = |d − d_focus|·k` dans le fragment. On évite le
  `BlurFilter`, mesuré à +130 %.
- **Anticrénelage** : pas de MSAA. Marges de 2 px, alpha prémultiplié, mipmaps pour les réductions de plus de 2 fois.

### G6. `CameraDirector` : grammaire comique en fonctions pures de t
Chaque mouvement est une fonction analytique, ce qui rend le parcours avant et arrière bit à bit identique :

```
punchIn(a, k=1.4, n=4)  : s(t) = s0·(1 + (k−1)·easeOutCubicOvershoot((t−t0)/(n/fps), 0.03)) ;
                          c(t) = a + (c0 − a)·s0/s(t)             // zoom autour du visage a, sans parallaxe
whipPan(Δx, n=8)        : x(t) = x0 + Δx·smootherstep((t−t0)/(n/fps)) ; coupe à l'image de |x'| max ;
                          flou directionnel b = |x'(t)|·0,5/fps (1 passe 1D, ces n images seulement)
shake(impulses)         : T(t) = clamp(Σ a_i·max(0, 1 − λ(t − t_i)), 0, 1) ;
                          off = 18px·T²·(n1(12t), n2(12t)) ; roll = 1,5°·T²·n3(12t)   // bruit de valeur à graine
freeze(t_f)             : t_eval = min(t, t_f) ; zoom 1→1,08 en 4 images ; désaturation 40 % ; vignette ; SFX à t_f
reactionCut(listener)   : coupe au gros plan du réagissant à t_chute + 0,3-0,5 s (à calibrer)
ots(fg, bg)             : fg ×1,6-2, en bas à gauche, flou niveau 2, −30 % de luminance
stagger2(a, b)          : deux personnages étagés en profondeur (échelle par h_px), au lieu d'un plan large côte à côte
```

- Chaque cadrage est validé contre les **zones sûres** :
  - visages dans y ∈ [250, 1150] et x ≤ 860 ;
  - sous-titres dans y ∈ [1150, 1550] et x ∈ [100, 860] ;
  - ces zones sont stockées dans `safe_zones.json`, avec la source du calque mesuré.
- Pas de zoom automatique instable (spéc §6 : « caméra anticipant l'action sans zoom automatique instable »). Les
  mouvements ne naissent que d'événements de la timeline : chute, choc, entrée.

### G7. `ExportAdapter` pour le conteneur : capture, encodage, vérification
- Capture : `renderFrame(i)` (sans rAF, PixiJS `autoStart: false`, `preserveDrawingBuffer: true`), puis
  `toDataURL('image/jpeg', 0.95)` et `ffmpeg image2pipe mjpeg`. Mesure de référence : **183 ms par image en
  1080×1920**.
  - Option master : PNG (+20 à +30 %).
  - Option 720×1280 : environ 94 ms par image.
- Parallélisme : P navigateurs séparés (P = 2 à 4) sur des plages disjointes, chacun encodant un segment, puis
  `concat -c copy`. Mesure de référence : 84 ms par image en capture seule avec P = 4.
- Encodage : ligne de commande BT.709 étiquetée de Q6. Niveau 4.1 à 30 i/s, 4.2 à 60 i/s.
- Gate ffprobe et décodage intégral : liste de Q6. Échec si `nb_read_frames ≠ N`, si les étiquettes bt709 manquent,
  si l'audio n'est pas à 48 kHz, si l'écart audio-vidéo dépasse une image ou si `moov` vient après `mdat`.
- Journal : on consigne `ffmpeg -version` et `-buildconf` dans `tool-manifest.json` (spéc §9).

### G8. `AnimationQualityGate`, ajouts de rendu
- **Empreintes de référence.** Le rendu SwiftShader est déterministe au bit près (mesuré) : on garde des empreintes
  d'images clés par `(build Chromium, scène, t)`. Le test parcourt avant, arrière et au hasard, et doit retrouver des
  empreintes identiques.
- **Budget de trous.** Pour chaque plan, on calcule `max_e w_e(A(t), u(t))` sur toute la durée. Échec si la valeur
  dépasse w_max.
- **Budget de vie du décor.** On rend le plan sans acteurs et on mesure la couverture de la porte : elle doit rester
  sous 0,05.
- **Zones sûres.** Le rectangle englobant des sous-titres et des visages, à chaque image, doit rester dans les zones de
  G6.
- **Couleur.** Une mire de peau orange passe par toute la chaîne d'export. L'écart doit rester inférieur ou égal à 3
  niveaux par canal (le défaut non étiqueté donnait ±6).

### Ce que nous NE prenons pas
- Le code de 3D Ken Burns (CC BY-NC-SA, CUDA), ses jeux de données et ses poids.
- Les réseaux de 3D Photo (CUDA, checkpoints non audités) : nous gardons leurs seuils et leur structure LDI.
- Les profondeurs Depth Anything V2 Base, Large ou Giant (CC-BY-NC-4.0).
- Remotion : licence non libre, payante au-delà de 3 employés.
- Le flou de bougé par tampon de vitesse ou par accumulation généralisée : trop cher sous SwiftShader (mesuré). Nous
  utilisons les smears.
- La capture `readPixels` brute (la plus lente mesurée) et `page.screenshot` PNG.
- Le prolongement en miroir des décors (interdit par la spéc §6, déjà relevé dans l'audit).
