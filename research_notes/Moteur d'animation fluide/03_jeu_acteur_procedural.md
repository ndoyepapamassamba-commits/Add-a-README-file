# Jeu d'acteur procédural pour la comédie : principes Disney en code, dynamiques du second ordre, micro-vie, prosodie → corps, couches d'animation, données de mouvement

Date : 16/10/2026. Piste « jeu_acteur » de la veille du moteur d'animation fluide. Note écrite pour être greffée dans
notre moteur 2D découpé (PixiJS, `TimelineEvaluator.evaluate(t)` pur, voir la spécification §4 et §6).

Conventions :
- **[B]** : notre code antérieur, branche `claude/relaxed-noether-svkgiu`, commit `d869966`, lu en lecture seule.
  Liens de la forme `https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/<chemin>`.
- **[audit]** : note sœur `00_audit_existant.md` de ce dossier (mesures faites le même jour).
- **[mesure]** : banc exécuté dans ce conteneur (4 vCPU « Intel Xeon Processor @ 2.10GHz », 15 Go, sans GPU ; Node
  v22.22.0 ; MediaPipe 1.1.1 et OpenCV 5.0.0 dans un venv isolé). Les scripts sont dans le scratchpad, non versionnés :
  `bench-jeu/sod.mjs`, `bench-jeu/inertial.mjs`, `bench-mp/bench_pose.py`, `bench-mp/overlay.py`.
- Aucun code tiers n'est copié. Les formules publiques sont réécrites, et chaque greffe dit ce que nous changeons.

Lien avec les notes sœurs : l'audit a déjà posé les ressorts **analytiques** (G1), le rig découpé (G2), le budget de
mouvement localisé (G3) et la mocap CMU/100STYLE (G4). Cette note y ajoute le **jeu** : la personnalité des courbes,
la micro-vie, la synchronisation voix → corps, les couches, le timing comique et le catalogue des actions.

---

## Q1 — Les 12 principes de Disney : que disent-ils précisément, et quels opérateurs de code en tirer ?

### Takeaway
Lasseter (SIGGRAPH 1987) donne des règles **quantifiables** : le nombre d'intervalles d'un même mouvement de tête
change son sens, du coup reçu (0 intervalle) à la réflexion (9 intervalles). L'action se découpe en préparation,
action et terminaison. Les parties ne partent pas ensemble : la hanche mène et la jambe suit. On ne montre **qu'une idée
à la fois**. Chacun de ces points devient un opérateur de code : durée, signe de vitesse initiale, décalage par
profondeur d'os, jeton d'attention. Notre ancien moteur n'en appliquait que des ersatz : oscillations globales de la carte
et fondus entre dessins.

### Cited Findings
**La liste et les définitions (Lasseter 1987)**
- La liste comprend Squash and Stretch, Timing, Anticipation, Staging, Follow Through and Overlapping Action, Straight
  Ahead / Pose-to-Pose, Slow In and Out, Arcs (« The visual path of action for natural movement »), Exaggeration,
  Secondary Action (« The action of an object resulting from another action ») et Appeal —
  [Lasseter 1987, PDF UCI](https://www.ics.uci.edu/~fowlkes/class/ics162/exercises/lasseter.pdf) ;
  [résumé SIGGRAPH HyperGraph](https://education.siggraph.org/static/HyperGraph/animation/character_animation/principles/prin_trad_anim.htm).
- Squash and stretch : quelle que soit la déformation, « its volume remains » constant ; en 3D, on étire en Z et on
  réduit en X et Y pour garder le volume, dans l'axe de la trajectoire — [Lasseter 1987](https://www.ics.uci.edu/~fowlkes/class/ics162/exercises/lasseter.pdf).

**Le timing chiffré**
- Lasseter cite Thomas et Johnston : deux dessins de tête (penchée à droite, puis à gauche, menton relevé) et le nombre
  d'intervalles entre eux font le sens. « NO inbetweens » : frappé par une force énorme ; « ONE » : frappé par une
  brique ou un rouleau à pâtisserie ; « TWO » : tic nerveux, spasme ; « THREE » : esquive une brique ; « FOUR » : donne
  un ordre sec (« Get going! ») ; « FIVE » : plus amical (« Over here ») ; « SIX » : voit quelque chose de désirable ;
  « SEVEN » : essaie de mieux voir ; « EIGHT » : cherche le beurre de cacahuète sur l'étagère ; « NINE » : jauge,
  réfléchit ; « TEN » : étire un muscle douloureux — [Lasseter 1987](https://www.ics.uci.edu/~fowlkes/class/ics162/exercises/lasseter.pdf).

**Anticipation**
- « An action occurs in three parts: the preparation for the action, the action proper, and the termination of the
  action. » Un pied doit reculer avant de frapper un ballon ; sans anticipation, beaucoup d'actions sont « abrupt,
  stiff and unnatural » — [Lasseter 1987](https://www.ics.uci.edu/~fowlkes/class/ics162/exercises/lasseter.pdf).
- L'anticipation dirige l'œil. Plus le public s'attend à l'action, plus elle peut être rapide. Le départ de Wally B.
  ne dure que 3 ou 4 images, mais il est anticipé assez longtemps pour être compris. Une anticipation exagérée
  (se baisser très bas) donne le poids d'un objet lourd ; un personnage gros se lève en se penchant d'abord, les mains
  sur les accoudoirs — [Lasseter 1987](https://www.ics.uci.edu/~fowlkes/class/ics162/exercises/lasseter.pdf).

**Mise en scène (staging)**
- « only one idea be seen by the audience at a time » ; dans une scène calme, l'œil va au mouvement, et dans une scène
  très agitée, à ce qui est immobile — [Lasseter 1987](https://www.ics.uci.edu/~fowlkes/class/ics162/exercises/lasseter.pdf).
- Dans Luxo Jr., « only Dad or Jr. was doing an important action at any one time, never both ». Quand Jr. joue, les
  gestes de Dad restent très discrets, et inversement — [Lasseter 1987](https://www.ics.uci.edu/~fowlkes/class/ics162/exercises/lasseter.pdf).
- Il vaut toujours mieux montrer une action en silhouette : André se gratte le **côté**, pas le ventre, sinon le geste
  disparaît devant le corps — [Lasseter 1987](https://www.ics.uci.edu/~fowlkes/class/ics162/exercises/lasseter.pdf).

**Follow-through, chevauchement, exagération**
- Les actions s'arrêtent rarement net, elles dépassent leur point d'arrivée. Les parties ne bougent pas en même temps :
  « some part must initiate the move » ; à la marche, la hanche mène et la jambe suit — [Lasseter 1987](https://www.ics.uci.edu/~fowlkes/class/ics162/exercises/lasseter.pdf).
- L'exagération ne veut pas dire déformer au hasard : il faut aller à l'essence (« If a character is sad, make him
  sadder »). Les composantes exagérées doivent rester **équilibrées** : une seule chose exagérée dans une scène réaliste
  « will stick out and seem unrealistic » — [Lasseter 1987](https://www.ics.uci.edu/~fowlkes/class/ics162/exercises/lasseter.pdf).

**Ce que faisait notre code antérieur**
- Audit du film 5 : « respiration ±1 %, balancement ±0,7°, hochement 1,2 cm — invisibles ». La correction a ajouté un
  buste qui se penche vers le partenaire en parlant, une tête qui bat les syllabes, un report du poids toutes les 2,5 à
  4,5 s (rampe de 0,6 s) et de petits hochements d'écoute — [B acting.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/acting.py).
- Le même fichier réduit le corps en plan serré (`BODY_SCALE = {'cu': 0.2, 'mcu': 0.35, 'two': 1.0}`). Il note qu'en
  vidéo de téléphone « a person's torso holds still, the head and the mouth carry the life » — [B acting.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/acting.py).
- Les acteurs Blender n'avaient que 3 os et enchaînaient les poses par un fondu de 4 images entre dessins. Le film 9
  dépassait le plafond de couverture (0,53 pour ≤ 0,435) parce que la carte entière bougeait — [audit Q2](00_audit_existant.md).

### Inferences
- **Correspondance principe → opérateur** de notre moteur. Chaque ligne est implémentée dans les greffes G1 à G8.

  | Principe | Opérateur dans `evaluate(t)` |
  |---|---|
  | Timing | durée d'action en images, table « nombre d'intervalles » (G8) ; fréquence propre `f` des canaux (G1) |
  | Anticipation | réponse initiale `r < 0` (creux opposé) ou clé explicite de contre-mouvement (G1, G7) |
  | Slow in / out | réponse d'ordre 2 à vitesse initiale nulle (`r = 0`) ou Hermite à tangentes nulles (G1, G2) |
  | Follow-through, chevauchement | décalage temporel et `f` décroissante par profondeur d'os (G3) |
  | Arcs | interpolation en **angles** d'os (rig découpé) plutôt qu'en positions : les mains décrivent des arcs |
  | Squash & stretch | échelle `(1+s, 1/(1+s))` pilotée par l'accélération du canal, volume conservé (G3) |
  | Secondary action | couches additives (respiration, mains, accessoires) sous le geste principal (G6) |
  | Staging | jeton d'attention : un seul personnage joue à plein gain (G6) ; gestes en silhouette (latéraux) (G7) |
  | Exaggeration | gain global par personnage et par scène, appliqué à **toutes** les composantes à la fois (G7) |
  | Straight ahead / pose-to-pose | pose-to-pose : clés d'intention + réponse dynamique (G1) |
  | Appeal | hors code : dessin des segments (note 01) |
- La table de Lasseter donne une **échelle de durées** pour un changement de pose de tête. À 24 i/s, n intervalles
  correspondent à n+1 pas, soit environ (n+1)/24 s : 42 ms pour un coup reçu, 125 ms pour un tic, 208 ms pour un ordre
  sec, 417 ms pour la réflexion (inférence ; voir Gaps sur la cadence).
- « Une idée à la fois » rejoint le diagnostic de l'audit : notre film bougeait partout à la fois (carte entière, décor),
  donc ni « vivant » ni lisible. Le jeton d'attention (G6) est à la fois une règle d'acting et une règle de **budget de
  mouvement**.

### Gaps
- Lasseter ne dit pas si la table des intervalles suppose une animation « en uns » ou « en deux ». En deux, les durées
  doublent. *The Illusion of Life* (source de la table) n'a pas été lu.
- Aucune source primaire lue ne chiffre l'amplitude « juste » d'un squash cartoon. Elle reste à régler à l'œil sur nos
  personnages.

---

## Q2 — Dynamiques du second ordre, ressorts critiques et courbes de temps : quelles formules, quelle stabilité, quel coût ?

### Takeaway
La « personnalité procédurale » de t3ssel8r tient en **trois paramètres** : fréquence `f`, amortissement `ζ` et réponse
initiale `r`, pour un système `y + k1·y' + k2·y'' = x + k3·x'`. Intégré pas à pas, il dépend du pas de temps et peut
diverger. Évalué en **forme fermée** (superposition de réponses à des marches), il devient une fonction pure de t.
Notre banc le vérifie : 14 µs pour 60 canaux de 120 clés, scrub avant = arrière, anticipation réglable par `r`.
L'inertialisation quintique de Bollo (Gears of War) donne les transitions sans dépassement.

### Cited Findings
**Second ordre selon t3ssel8r**
- La vidéo « Giving Personality to Procedural Animations using Math » (t3ssel8r) propose un système à trois paramètres :
  fréquence, amortissement et réponse initiale. Il est résolu par Euler semi-implicite. Un grand pas de temps peut faire
  diverger la position, et une analyse des valeurs propres fixe un pas maximal stable —
  [Hackaday](https://hackaday.com/2022/page/250) ; [vidéo (miroir)](https://yt.dorper.me/v/yt/KPoeNZZ6H4s).
- Les notes Patreon de l'auteur décrivent la fonction de transfert d'ordre 2 en ωn = 2πf et ζ, ainsi qu'une variante
  en quaternions pour les rotations. Le texte complet n'a pas été lisible (HTTP 403) —
  [Patreon](https://www.patreon.com/posts/procedural-video-82487305).
- La crate Rust `spring_motion` (MIT OR Apache-2.0), « based on » cette vidéo, code exactement :
  `k_1 = z / (PI * f)`, `k_2 = 1 / (2πf)²`, `k_3 = r * z / (2πf)`. Son pas est
  `acceleration = (target + target_velocity * k_3 - position - velocity * k_1) / k_2`, et le pas est borné par
  `max_safe_time_delta = sqrt(4·k_2 + k_1²) − k_1` — [docs.rs spring_motion](https://docs.rs/spring_motion) ;
  [source lib.rs](https://docs.rs/crate/spring_motion/latest/source/src/lib.rs).

**Ressorts selon Holden (« Spring-It-On », The Orange Duck)**
- Paramétrage par demi-vie : `halflife_to_damping = 4·ln2 / (halflife + eps)` ; cas critique `y = d/2`.
- Ressort critique exact (cible g, vitesse cible q, raideur s) : `c = g + d·q/s`, `j0 = x − c`, `j1 = v + j0·y`,
  `x' = e·(j0 + j1·dt) + c`, `v' = e·(v − j1·y·dt)`, avec `e = exp(−y·dt)`. L'auteur l'approche par
  `fast_negexp(x) = 1/(1 + x + 0,48x² + 0,235x³)`.
- **Inertialisation** : à la transition, on stocke l'écart `off = (src + off) − dst` en position et en vitesse, on le
  laisse décroître par un ressort vers 0, et on affiche `in + off`. Elle « does not provide a fixed blend time and can
  easily overshoot ».
- **Double ressort** : deux ressorts en série, chacun à demi-vie moitié, donnent une réponse en « S ».
- **Ressort minuté** : on vise une cible future, avec `lag = halflife / ln2`, pour arriver à l'heure.
- Aucune licence du code n'est indiquée sur la page —
  [Holden, Spring-It-On](https://theorangeduck.com/page/spring-roll-call).

**Inertialisation selon Bollo (Gears of War 4)**
- À la transition, on enregistre la vitesse de la source et l'écart de pose. On construit « a quintic polynomial »
  qui reproduit l'écart et la vitesse au départ et tend vers zéro à la fin, puis on l'ajoute à l'animation cible. En
  contrôlant l'accélération initiale, la transition est « overshoot-free ».
- Coût : 12 µs, contre 30 µs (20 + 10) pour le fondu classique, soit 60 % de moins, car la source n'est plus évaluée —
  [Bollo, SIGGRAPH 2017 Talks](https://history.siggraph.org/wp-content/uploads/2022/09/2017-Talks-Bollo_High-Performance-Animation-in-Gears-of-War-4.pdf) ;
  [GDC 2018, Inertialization](https://www.gdcvault.com/play/1025165/Inertialization).

**Courbes d'accélération standard**
- CSS Easing (W3C) : `ease` = cubic-bezier(0.25, 0.1, 0.25, 1), `ease-in` = (0.42, 0, 1, 1), `ease-out` =
  (0, 0, 0.58, 1), `ease-in-out` = (0.42, 0, 0.58, 1). Les x des points de contrôle doivent être dans [0,1]. `steps()`
  découpe le temps en intervalles égaux — [W3C css-easing-1](https://www.w3.org/TR/css-easing-1/).
- Godot `AnimationNodeOneShot` : `fadein_time` et `fadeout_time`, avec des courbes d'easing optionnelles
  (`fadein_curve`, linéaire par défaut) — [Godot docs](https://docs.godotengine.org/en/stable/classes/class_animationnodeoneshot.html).

**Notre existant**
- Table `SPRINGS` (ω en rad/s) : bouche ω=38 ζ=0,9 ; tête ω=16 ζ=0,7 ; hochement ω=18 ζ=0,7 ; inclinaison ω=9
  ζ=0,8 ; balancement ω=8 ζ=0,9 ; squash ω=16 ζ=0,55 ; bras ω=13 ζ=0,62. Intégration par pas de 8 ms depuis l'état
  précédent — [B puppet.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/puppet.ts).
- Cette intégration dépend du chemin : 0,237 d'écart entre lecture séquentielle et saut direct, 0,249 au retour
  arrière — [audit Q2](00_audit_existant.md).

**[mesure] Forme fermée du système de t3ssel8r (`bench-jeu/sod.mjs`)**
- Méthode : la cible x est une suite de marches (clés d'intention) et la réponse exacte à une marche Δ vaut
  `Δ·[S(τ) + k3·S'(τ)]`. On compare à Euler semi-implicite à 10 kHz sur 2,5 s, puis on mesure la réponse à une marche
  unité.

  | f (Hz) | ζ | r | anticipation (creux / marche) | dépassement | t90 (ms) | écart max vs Euler 10 kHz |
  |---|---|---|---|---|---|---|
  | 2 | 0,5 | 0 | 0 | 0,163 | 170 | 7,7·10⁻⁴ |
  | 2 | 1,0 | 0 | 0 | 0 | 310 | 5,9·10⁻⁴ |
  | 3 | 0,6 | −1,5 | **0,225** | 0,116 | 158 | 1,1·10⁻³ |
  | 1,5 | 0,4 | 2 | 0 | 0,364 | 118 | 8,4·10⁻⁴ |
  | 2 | 1,4 | 0 | 0 | 0 | 473 | 5,0·10⁻⁴ |

  - L'écart de l'ordre de 10⁻³ est l'erreur de discrétisation d'Euler sur le terme `k3·x'` (dérivée d'une marche). La
    forme fermée est la référence.
- Coût et pureté : 60 canaux × 120 clés sur 60 s, évalués à des t aléatoires. On fait une recherche binaire, puis on
  absorbe les clés de plus de `τ_s = ln(10⁴)/(ζω)`.
  - **14,2 µs** par évaluation des 60 canaux (Node 22, un cœur) ;
  - écart avec la somme naïve : 4,4·10⁻¹⁶ ;
  - hachage de 300 instants identique en avant et en arrière.

**[mesure] Inertialisation quintique (`bench-jeu/inertial.mjs`)**
- Quintique `x(0)=x0, x'(0)=v0, x''(0)=a0, x(t1)=x'(t1)=x''(t1)=0`. On ramène `x0 > 0`, on force `v0 ≤ 0`, on borne
  `t1 ≤ −5·x0/v0` et on prend `a0 = max(0, (−8·v0·t1 − 20·x0)/t1²)`.
- Sur 100 000 tirages (x0 ∈ ±1,5, v0 ∈ ±20, t1 ∈ [0,1 ; 0,6] s) : dépassement maximal 7,9·10⁻¹⁵·|x0|, et résidu à t1 de
  1,1·10⁻¹⁴. La propriété « sans dépassement » est donc vérifiée numériquement.

### Inferences
- **Pourquoi ces trois paramètres conviennent au jeu.**
  - `f` règle la vitesse de réaction (t90 ≈ 0,62/f pour ζ = 1 : 310 ms à 2 Hz dans le banc) ;
  - `ζ < 1` fait le dépassement et le *settle* (follow-through) ;
  - `r < 0` fait l'**anticipation** : la vitesse initiale vaut `Δ·r·ζ·ω`, donc opposée à la marche quand r < 0 ;
  - `r > 1` donne une attaque « nerveuse » qui dépasse.
- Un personnage se décrit ainsi par un petit tableau `(f, ζ, r)` par groupe d'os. C'est une manière directe de donner du
  caractère à 54 personnages sans animer chaque clé.
- La forme fermée supprime les deux défauts mesurés de l'existant : dépendance au chemin et au pas, instabilité aux
  grands pas. Elle coûte moins de 0,1 ms par personnage et par image, ce qui est négligeable devant le rendu.
- Avec des cibles en **marches**, l'ease-in et l'ease-out sont automatiques : la réponse part avec une vitesse nulle si
  r = 0. Les courbes Hermite et Bézier (G2) servent quand un **chemin** doit être tenu (pointage, arc de bras) ou quand
  l'arrivée doit tomber pile sur une image (contact, accent). Pour l'arrivée à l'heure, on peut aussi viser une cible
  anticipée, comme le « timed spring » de Holden.
- L'inertialisation de Bollo convient aux **interruptions** : un geste coupé par un autre plus prioritaire. Elle ne
  demande que l'écart et la vitesse à l'instant de coupure, deux quantités que notre `evaluate` pur sait calculer
  analytiquement.

### Gaps
- La définition originale de `r` par t3ssel8r n'a été lue que dans une réimplémentation (spring_motion), le Patreon
  ayant répondu 403. Sa variante quaternion n'est pas utile en 2D.
- Licence du code de Holden : non indiquée. On n'en reprend que des formules mathématiques, réécrites.
- La formule de `a0` de Bollo n'est pas dans le résumé SIGGRAPH lu. Celle du banc est la nôtre, validée seulement par
  le test d'absence de dépassement.

---

## Q3 — Micro-vie : clignements, saccades, regards, respiration, transfert de poids, bruit

### Takeaway
Un clignement n'est pas périodique : environ 17 par minute au repos, 26 en conversation, 4,5 en lecture. La fermeture
(≈ 0,10 s) est deux fois plus rapide que la réouverture (≈ 0,21 s). Une saccade dure de 20 à 37 ms + 2 à 2,7 ms par
degré. L'auditeur regarde longuement le locuteur, et le locuteur alterne regard et détournement. Notre ancien code
clignait de façon **strictement périodique et symétrique**, un indice de « mécanique » facile à corriger.

### Cited Findings
**Clignements**
- Fréquence (150 sujets sains) : repos ≈ 17/min, conversation ≈ 26/min, lecture ≈ 4,5/min. L'ordre
  conversation > repos > lecture est le plus fréquent (67,3 % des sujets). Le taux dépend des processus cognitifs plus
  que de l'âge — [Bentivoglio et al. 1997, notice](https://wicri-demo.istex.fr/Wicri/Sante/explor/MovDisordV3/Site/fr/Main/Exploration/bibRecord.php?hk=005409) ;
  [arXiv 1605.02037 (cite l'étude)](https://arxiv.org/pdf/1605.02037).
- Clignement spontané (8 volontaires) : ouverture 0,21 ± 0,04 s, nettement plus longue que la fermeture 0,10 ± 0,02 s ;
  le clignement volontaire ferme plus vite — [Graefe's Arch. 2007](https://link.springer.com/doi/10.1007/s00417-007-0611-8).
- Clignement **volontaire** à 600 i/s (25 sujets) : fermeture 76 ± 2 ms, fermé 58 ± 4 ms, ouverture 438 ± 24 ms,
  total 572 ± 25 ms ; « a much faster closing action than opening action » —
  [Kwon et al. 2013, J R Soc Interface](https://pmc.ncbi.nlm.nih.gov/articles/PMC4043155).

**Saccades**
- Séquence principale linéaire `MT = a + b·A` (ms, A en degrés) : a = 37, b = 2,7 (Baloh 1975) ; a = 23, b = 2,7
  (Collewijn 1988) ; a ∈ [20, 30], b ∈ [2 ; 2,7] (Lee, Badler et Badler 2002, pour la synthèse graphique).
- Vitesse de crête `Vp = Va·(1 − exp(−A/A0))`, avec Va = 551 °/s et A0 = 14° —
  [Duchowski 2017, JEMR](https://bop.unibe.ch/JEMR/article/download/3603/Duchowski_JEMR_10-3-4/13042).
- La relation reste linéaire jusqu'à environ 80°, mais les saccades naturelles vont surtout jusqu'à 15 à 20° ; des
  microsaccades (< 0,5°) de 14 ms sont rapportées (Becker 1989) —
  [Duchowski 2017, JEMR](https://bop.unibe.ch/JEMR/article/download/3603/Duchowski_JEMR_10-3-4/13042).

**Regard en conversation**
- Kendon (1967) : les auditeurs donnent au locuteur de longs regards coupés de brefs détournements ; les locuteurs
  alternent regards et détournements de durées à peu près égales. Plusieurs auteurs (Kendon, Duncan) soutiennent que le
  locuteur détourne le regard en début de tour et le ramène vers la fin.
- Torres et al. (1997) ne trouvent un regard vers l'auditeur que dans 16 % des fins de tour. Des différences culturelles
  sont rapportées : les Afro-Américains regardent davantage leur interlocuteur en parlant qu'en écoutant (Erickson 1979 ;
  LaFrance) ; les locuteurs tzeltal regardent peu le visage du locuteur —
  [Rossano 2012, Handbook of Conversation Analysis](https://www.eva.mpg.de/documents/Wiley-Blackwell/Rossano_Gaze_Handbook-of-conversation-analysis_2012_1658279.pdf).
- S. Andrist (HRI 2014), rapporté par IEEE Spectrum : « When listening, we look at the speaker around 70 percent of the
  time » ; les locuteurs ne regardent l'autre « around 40 percent of the time when talking » —
  [IEEE Spectrum](https://spectrum.ieee.org/what-robot-behavior-makes-people-feel-uncomfortable).

**Respiration**
- Au repos, l'inspiration et l'expiration ont des durées voisines. En parole, l'inspiration raccourcit et s'accélère, et
  l'expiration s'allonge — [PubMed 454139](https://pubmed.ncbi.nlm.nih.gov/454139/).
- La durée d'inspiration est la mesure qui distingue le mieux la respiration calme de la respiration de parole —
  [JSLHR 2001](https://pubs.asha.org/doi/10.1044/1092-4388(2001/012)).
- Rapport TE/TI toujours > 1, entre 1,2 et 1,9 — [thèse d'Édimbourg](https://era.ed.ac.uk/handle/1842/6716).

**Bruit pour l'idle**
- OpenSimplex2 (KdotJPG) est sous **CC0 1.0** (fichier `LICENSE` lu sur la branche master) —
  [LICENSE](https://raw.githubusercontent.com/KdotJPG/OpenSimplex2/master/LICENSE).
- OpenSimplex est né pour éviter le brevet du Simplex (US6867776) — [opensimplex (PyPI)](https://pypi.python.org/pypi/opensimplex).

**Notre existant**
- `puppet.ts` : clignement toutes les 2,6 à 4,6 s selon le personnage, d'une période **fixe**, et 140 ms en demi-sinus
  **symétrique**. Il ne tient compte ni de la parole ni des regards — [B puppet.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/puppet.ts).
- `actor.ts` : période fixe de 3,4 s, 0,14 s — [B actor.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/actor/actor.ts).
- `acting.py` : respiration sinusoïdale de période 3,6 s ; report du poids tiré au hasard toutes les 2,5 à 4,5 s avec une
  rampe cosinus de 0,6 s — [B acting.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/acting.py).
- Le diagnostic du film 5 relevait des « clignements en ovales plats » — [audit Q2](00_audit_existant.md).

### Inferences
- Le taux de l'ancien clignement (13 à 23 par minute) était plausible. Sa **régularité** et sa **symétrie** ne
  l'étaient pas : un œil humain ferme en 3 images à 30 i/s et rouvre en 6.
- Une saccade de 10° dure 40 à 64 ms, soit 1 à 2 images à 30 i/s. À l'écran, un regard « saute » donc en 1 ou 2 images,
  puis se tient. Le mouvement lent des yeux est un défaut, pas de la fluidité.
- Écoute : la tête est stable et les yeux posés sur le locuteur, avec de brefs détournements. Parole : alternance.
  C'est aussi la répartition du mouvement que réclame le budget de couverture (Q4 : la tête du locuteur bouge, celle de
  l'auditeur beaucoup moins).
- Respiration en parole : une inspiration brève dans les pauses avant une phrase, et une longue expiration pendant la
  phrase. C'est un indice de « voix incarnée » peu coûteux (épaules et torse, en BODY_SCALE).

### Gaps
- Aucune source primaire lue ne donne la durée des fixations en conversation, ni la répartition des amplitudes de
  saccade pendant un dialogue. Les valeurs de G4 sont des choix à calibrer.
- Le couplage clignement-saccade (clignement déclenché par les grands changements de regard) n'a pas été sourcé ici.
- Les pourcentages souvent attribués à Argyle (auditeur 75 %, locuteur 40 %, regard mutuel 30 %) n'ont pas été lus dans
  une source vérifiable : seul le couple 70 % / 40 % d'Andrist (via IEEE Spectrum) est retenu.
- La fréquence de repos de 12 à 20 respirations par minute n'a pas été confirmée par une source fiable dans cette
  recherche.
- Intervalle naturel entre reports du poids : seule source, notre propre code (2,5 à 4,5 s).
- Le statut d'expiration du brevet Simplex n'a pas été vérifié : Google Patents a répondu 503. On l'évite en écrivant
  notre propre bruit de gradient 1D (G4).

---

## Q4 — Prosodie → tête, sourcils, mains ; écoute ; timing comique

### Takeaway
- **Gestes.** L'apex d'un geste de battement tombe sur l'accent, à quelques dizaines de ms près : en anglais, l'accent
  suit l'apex de 17 ms en moyenne. En **français**, l'alignement est plus lâche et se fait surtout sur l'accent de fin
  de groupe accentuel, ou sur les premières syllabes du groupe. Les gestes précèdent légèrement la parole (environ 90 %
  des cas) et le public tolère ±0,6 s.
- **Sourcils.** Ils montent environ 270 ms avant leur pic, et le pic précède l'accent suivant.
- **Écoute.** L'auditeur réagit après une zone de F0 basse d'au moins 110 ms. Les réponses de tour arrivent avec un
  décalage modal de 0 à 200 ms.
- **Chute.** Les données sur les blagues contredisent le cliché de la « pause avant la chute ».

### Cited Findings
**Gestes et accents**
- Loehr (anglais américain, conversation) : la distance entre accent et apex est distribuée autour de zéro, l'accent
  arrivant en moyenne 17 ms **après** l'apex. Une autre étude trouve 95,7 % de co-occurrence apex-accent, une troisième
  83,13 % d'apex de gestes non référentiels sur une syllabe accentuée.
- Un apex jusqu'à **200 ms avant** la syllabe accentuée est encore perçu comme aligné. La syllabe moyenne du locuteur
  étudié dure 148 ms — [Rohrer, Prieto et Delais-Roussarie, ICPhS 2019](https://assta.org/proceedings/ICPhS2019Microsite/pdf/full-paper_550.pdf).
- **Français** (18 min de discours, 645 apex de battements) :
  - alignement strict : 45,58 % sur l'accent final de groupe accentuel (T*), 9,76 % sur l'accent initial (Hi), 44,65 %
    sans alignement ;
  - alignement non strict (tolérance de 120 ms) : 59,22 %, 12,87 % et 27,91 % ;
  - parmi les non alignés, plus de 72 % tombent sur les **trois premières syllabes** du groupe accentuel.
  - [Rohrer et al. 2019](https://assta.org/proceedings/ICPhS2019Microsite/pdf/full-paper_550.pdf)
- Allemand (6 vidéos éducatives, 120 battements) : le stroke commence avant ou sur la syllabe accentuée ; « the apex
  mostly falls on the accented syllable (74%) », parfois sur les suivantes, et d'autant plus sur l'accent que la
  proéminence est forte —
  [Aberdeen, alignment of beat gestures in German](https://abdn.elsevierpure.com/en/publications/alignment-of-beat-gestures-and-prosodic-prominence-in-german).
- Phases du geste : préparation, tenue avant le *stroke*, *stroke* (seule phase obligatoire), tenue après, rétraction.
  La tenue avant le stroke retarde celui-ci jusqu'à la parole correspondante.
- « About 90% of the time, the gesture occurs slightly before the co-expressive speech » et rarement après. Les
  spectateurs semblent peu sensibles aux erreurs de timing « within a +/- .6 second range » (Wang & Neff 2013).
- Des **unités gestuelles** enchaînant plusieurs gestes sans retour au repos sont jugées plus naturelles, amicales et
  dignes de confiance ; des gestes isolés, chacun revenant au repos, paraissent « more nervous » —
  [Neff, Hand Gesture Synthesis for Conversational Characters](https://www.cs.ucdavis.edu/~neff/papers/HandGestureSynthesisForConversationalCharacters_PREPRINT.pdf).

**Sourcils et tête**
- Sourcils (interviews de late-night shows, 5 locuteurs, 1 850 s) :
  - la montée commence environ 270 ms avant le pic ;
  - le relèvement couvre environ 10 à 20 images autour du pic, soit 300 à 600 ms ;
  - la hauteur tonale reste élevée environ 670 ms après le pic pour les grands relèvements.
- Études citées par le même article :
  - Flecha-García : distance entre relèvement et accent le plus proche de μ = 63 ms, σ = 458 ms, les relèvements étant
    plus proches de l'accent **suivant** ;
  - Kim et al. : action des sourcils dans une région d'environ 250 ms **avant** le constituant prosodiquement saillant.
  - [Gast 2023, Behavioral Sciences](https://pmc.ncbi.nlm.nih.gov/articles/PMC9854528)
- Relèvements de sourcils et hochements sont des « battements » visuels qui marquent la proéminence, et 33 auditeurs les
  perçoivent comme des indices forts de proéminence (House et al.) — [Swerts et al., AVSP 2007](https://www.isca-archive.org/avsp_2007/swerts07_avsp.pdf) ;
  [House, Beskow et Granström, Eurospeech 2001](https://www.isca-archive.org/eurospeech_2001/house01_eurospeech.pdf).
- Hochements en **français** : deux stratégies d'alignement selon les locuteurs, l'apex sur le pic de F0, ou la vitesse
  maximale sur l'articulation consonantique — [Carignan et al., ISSP 2020](https://issp2020.yale.edu/S06/carignan_06_01_013_poster.pdf).
- Hadar et al. (1983) : la tête bouge sur **89,9 %** des images pendant les tours de parole, contre 12,8 % pendant les
  pauses et l'écoute. L'amplitude est corrélée au pic d'intensité de la voix —
  [Frontiers in Psychology 2019 (cite Hadar)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2019.02459/pdf) ;
  [notice Hadar et al.](https://cris.tau.ac.il/en/publications/kinematics-of-head-movements-accompanying-speech-during-conversat-2/).

**Tours de parole et écoute**
- Toutes les langues étudiées (10) évitent le chevauchement et minimisent les silences entre tours ; les moyennes
  diffèrent dans une plage de 250 ms — [Stivers et al. 2009, PNAS (notice)](https://forms.mpi.nl/node/50939).
- Réponses aux questions fermées : mode entre 0 et +200 ms selon la langue, mode global 0 ms, médianes de 0 à +300 ms
  (globale +100 ms) — [Language Log](https://languagelog.ldc.upenn.edu/nll/?p=7997).
- Indice de *back-channel* : une région de hauteur tonale basse en fin d'énoncé. Règle opérationnelle : F0 sous le
  28ᵉ centile pendant au moins 110 ms —
  [Ward & Tsukahara 2000](https://www.cs.utep.edu/nigel/abstracts/jprag00.html) ;
  [Ward, ICSLP 1996](https://www.isca-archive.org/icslp_1996/ward96_icslp.html).

**Chute et rire**
- Attardo & Pickering 2011 (20 performances) : aucune preuve que la chute soit précédée d'une pause, et pas de hausse
  ni de baisse significative du débit autour de la chute —
  [notice (Texas A&M-Commerce)](https://lair.etamu.edu/chssa-faculty-publications/8).
- Pickering et al. 2009 : les chutes ne sont pas dites plus fort ni précédées de pauses significatives. Elles sont dites
  plus **bas** et plus **lentement** que le texte qui précède, souvent avec une voix rieuse ou souriante. Les auteurs
  l'expliquent par la position finale — [Pickering et al. 2009, Discourse Processes](https://pure.psu.edu/en/publications/prosodic-markers-of-saliency-in-humorous-narratives/).
  - Contradiction : les deux études divergent sur le débit (plus lent en 2009, pas de différence en 2011).
- Rire (Provine, sources secondaires) : notes vocaliques d'environ 75 ms répétées à intervalles réguliers d'environ
  210 ms, avec une intensité qui décroît sur la salve —
  [Mental Floss](https://www.mentalfloss.com/science/lab-worlds-leading-laugh-scientist) ;
  [Bryant 2020](https://scholar.ss.ucla.edu/wp-content/uploads/sites/20/2020/08/Evolution_Laughter_HCB_2020.pdf).
  - Les sources ne s'accordent pas sur le sens exact des 210 ms : écart d'attaque à attaque, ou silence entre notes.

**Notre existant**
- `puppetMotion.ts` : l'avant-bras se lève sur les syllabes accentuées (`beat`), le doigt accusateur pique sur les
  accents, et les paumes montent avec l'enveloppe de haussement (montée en 0,25 s, puis décroissance `exp(−1,1·t)`) —
  [B puppetMotion.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/actor/puppetMotion.ts).
- `acting.py` : hochements d'écoute retardés de 5 images sur les mots forts du partenaire, avec la tête qui bat les
  syllabes — [B acting.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/acting.py).

### Inferences
- **Placement des battements en français.** On aligne l'apex sur la **dernière syllabe pleine du groupe accentuel**,
  avec une avance de 0 à 60 ms. Un battement sur trois ou quatre peut aller sur l'une des trois premières syllabes du
  groupe, pour imiter l'accent initial. Appliquer la règle anglaise (« chaque accent lexical ») au français ivoirien
  produirait un métronome.
- **Sourcils.** Un sourcil se lève sur une **minorité** d'accents (ceux d'emphase, de surprise, de question), avec un
  pic 60 à 250 ms avant l'accent et une montée de 270 ms. Sinon, le visage « clignote ».
- **Répartition du mouvement.** Les chiffres de Hadar (89,9 % contre 12,8 %) confirment qu'il faut beaucoup de
  mouvement de tête chez le locuteur et presque rien chez l'auditeur, en dehors des hochements de *back-channel* et des
  réactions. Cela rejoint la règle « une idée à la fois » (Q1) et le budget de couverture de l'audit.
- **Réactions d'écoute** : déclencheur F0 basse ≥ 110 ms (ou fin de groupe), puis hochement 150 à 300 ms plus tard,
  dans l'ordre de grandeur des écarts de tour de Stivers. Pour la réaction à une chute : départ 100 à 250 ms après la
  syllabe finale, plus tard si le personnage est « lent à comprendre » (effet comique de double prise).
- **Chute.** Ne pas insérer automatiquement de silence avant la chute : les données ne le soutiennent pas. Le « beat »
  comique doit plutôt être **visuel** :
  - immobilité de l'auditeur juste avant la chute ;
  - prise sèche (take) ;
  - tenue sur la réaction (hold) ;
  - éventuel gel final.
  Ce sont précisément les marqueurs du format TikTok de l'utilisateur (« punchline freeze on a shocked face »).
- **Rire.** Un rire visible bat à environ 4 à 5 Hz (notes toutes les ≈ 210 ms) : épaules, tête et mâchoire synchronisés
  sur l'audio du rire s'il existe, avec une enveloppe décroissante.

### Gaps
- Aucune étude sur le français **ivoirien** (rythme, accentuation, gestualité) n'a été trouvée. Les règles du français
  de référence sont à valider sur les dialogues de l'utilisateur.
- Les valeurs de Leonard & Cummins (2011) n'ont pas été lues directement.
- Aucune norme chiffrée de la durée « préparation → stroke » n'a été trouvée dans une source vérifiée : les 350 ms de G5
  sont un choix à calibrer.
- Le délai précis d'un hochement de *back-channel* après l'indice n'a pas été trouvé (la borne de 700 ms parfois citée
  n'a pas été confirmée).
- Une étude récente sur le stand-up chinois (828 performances, pauses allongées avant les chutes très surprenantes) a été
  signalée par un moteur de recherche, sans source primaire lue. Elle n'est pas retenue.

---

## Q5 — Couches, masques d'os, priorités, interruptions et transitions : que retenir de Godot, Unity et Unreal ?

### Takeaway
Les moteurs de jeu convergent sur quatre briques :
1. mélanges pondérés et **additifs** ;
2. **filtres ou masques** par os ou par piste ;
3. actions ponctuelles (« OneShot ») avec fondu d'entrée et de sortie, requêtes FIRE, ABORT et FADE_OUT ;
4. machines à états à transitions typées (immédiate, synchronisée, en fin de clip), avec durées de fondu et priorités.

L'**inertialisation** remplace le fondu croisé par un écart qui décroît, sans réévaluer la source. Tout cela se
transpose dans un `evaluate(t)` pur, parce que notre timeline est **connue d'avance**.

### Cited Findings
**Godot `AnimationTree` (Godot sous licence MIT, selon la spécification §2 : [licence](https://godotengine.org/license/))**
- Blend2 et Blend3 mélangent deux ou trois entrées selon une valeur. Le mélange peut être restreint à des pistes par des
  **filtres**, par exemple le haut du corps sur le bas.
- `OneShot` joue une animation une fois, avec temps de fondu d'entrée et de sortie et filtres, piloté par
  `request = FIRE / ABORT`.
- `TimeScale` (0 = pause, négatif = lecture inverse) ; `TimeSeek` (repositionne en secondes) ; `Transition`
  (sélecteur avec fondu croisé).
- BlendSpace2D : triangulation de Delaunay et interpolation dans le triangle. Modes de synchronisation des cycles :
  `None`, `Independent`, `Cyclic Mutable`, `Cyclic Constant`.
- StateMachine :
  - transitions `Immediate`, `Sync` (la cible reprend à la position de lecture de la source) ou `At End` ;
  - `Xfade Time` et `Xfade Curve` ;
  - `Priority` (« Lower priority transitions are preferred ») ;
  - conditions et expressions d'avance ;
  - `travel()` par A*.
- Root motion : la piste racine est annulée visuellement et son déplacement est relu par
  `get_root_motion_position()`.
- [Godot, Using AnimationTree](https://docs.godotengine.org/en/stable/tutorials/animation/animation_tree.html)
- `OneShot` en détail : `fadein_time` et `fadeout_time` ; courbes d'easing de fondu ; `mix_mode` BLEND ou ADD
  (additif) ; `autorestart` avec `autorestart_delay` et `autorestart_random_delay` ; `break_loop_at_end` ; requêtes
  `FIRE`, `ABORT`, `FADE_OUT` — [Godot, AnimationNodeOneShot](https://docs.godotengine.org/en/stable/classes/class_animationnodeoneshot.html).

**Unity Mecanim**
- Couches **Override** (remplace les couches précédentes) ou **Additive** (s'ajoute par-dessus). L'**Avatar Mask**
  spécifie les parties du corps concernées, par exemple un lancer du haut du corps pendant la marche.
- Couches synchronisées : elles réutilisent la machine à états d'une autre couche avec d'autres clips.
- Pour l'additif, la couche doit animer les mêmes propriétés que les couches précédentes —
  [Unity Manual, Animation Layers](https://docs.unity3d.com/Manual/AnimationLayers.html).

**Transitions par inertialisation**
- Bollo (Gears of War 4) : la transition est traitée en post-traitement. Le fondu classique double à peu près le coût
  d'évaluation ; l'inertialisation coûte 60 % de moins — [GDC 2018](https://www.gdcvault.com/play/1025165/Inertialization) ;
  [SIGGRAPH 2017](https://history.siggraph.org/wp-content/uploads/2022/09/2017-Talks-Bollo_High-Performance-Animation-in-Gears-of-War-4.pdf).
- Holden : un écart de position et de vitesse décroît par un ressort critique, sans durée fixe et avec dépassement
  possible — [Spring-It-On](https://theorangeduck.com/page/spring-roll-call).

**Notre existant**
- Fondu de 4 images entre dessins de pose (Blender) : le saut de luminance de +39,9 à l'image 910 du film 8 est un faux
  raccord — [audit Q2](00_audit_existant.md).
- Mise à l'échelle du jeu par type de plan (`SHOT_SCALE`, `BODY_SCALE`), lissée sur 0,2 s autour des coupes —
  [B acting.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/acting.py).

### Inferences
- En production hors ligne, **toutes** les transitions sont connues à la compilation de la timeline. Un `OneShot` FIRE,
  ABORT ou FADE_OUT devient donc un intervalle `[t_on, t_off]` avec des fondus. Une interruption devient un instant
  `t_i`, où l'écart `(x0, v0)` est calculé par évaluation analytique de la source en `t_i`. Aucune mémoire d'état n'est
  nécessaire : l'`evaluate(t)` reste pur.
- Les masques binaires d'Unity créent des coutures (torse figé sous un bras qui gesticule). Pour un rig découpé, un
  masque **graduel le long de la chaîne** est préférable : bassin 0, torse 0,3, poitrine 0,6, épaule 1, bras 1.
- L'additif de Godot et d'Unity correspond, en 2D, à **sommer des angles** et à **multiplier des échelles**. C'est la
  bonne représentation pour superposer respiration, battements, émotion et bruit d'idle sans les écraser.

### Gaps
- La documentation Unreal (Layered Blend per Bone, Inertialization node) n'a pas été lue dans cette recherche.
- Les coûts de Godot et d'Unity ne sont pas transposables. Seul notre banc (Q2) compte pour notre moteur.

---

## Q6 — Données de mouvement utilisables commercialement, et MediaPipe Pose sur CPU pour piloter un rig 2D depuis la vidéo du téléphone

### Takeaway
- **Données utilisables** : CMU (commercial permis, revente des données interdite) et 100STYLE (CC BY 4.0, crédit
  obligatoire). Mixamo est permis dans les films, sans redistribution des fichiers bruts ni entraînement de modèles,
  mais demande un compte Adobe.
- **Données exclues (non commerciales)** : LAFAN1 (CC BY-NC-ND 4.0) et Bandai Namco (CC BY-NC 4.0).
- **MediaPipe Pose Landmarker** (modèle Apache-2.0) tourne **plus vite que le temps réel** sur ce CPU : 15 à 28 ms par
  image en lite ou full, environ 62 ms en heavy. Il détecte aussi nos personnages cartoon. Sa gigue impose un filtrage
  (1€) et une réduction en clés avant de piloter un rig.

### Cited Findings
**Bases de mouvement**
- **CMU**, page d'accueil : « This dataset of motions is free for all uses » ; « You may include this data in
  commercially-sold products, but you may not resell this data directly, even in converted form ». Un remerciement
  est demandé dans les publications.
  - La FAQ dit aussi : « The motion capture data may be copied, modified, or redistributed without permission ».
  - Données ASF/AMC, Vicon à 120 Hz ; conversion en mètres par (1,0/0,45)·2,54/100 = 0,056444.
  - [mocap.cs.cmu.edu (page lue par curl le 16/10/2026)](http://mocap.cs.cmu.edu/) ; [FAQ](http://mocap.cs.cmu.edu/faqs.php)
- Les miroirs de CMU portent des étiquettes contradictoires : CC BY 4.0 sur un miroir Hugging Face, CC BY-NC 4.0 sur la
  conversion FBX de 4TU — [4TU](https://data.4tu.nl/datasets/0448aab2-3332-449f-a8e2-d208cb58c7df) ;
  [HF CMUMDB](https://huggingface.co/datasets/ckinpdx/CMUMDB).
- **100STYLE** : licence « Creative Commons Attribution 4.0 International » ; plus de quatre millions d'images de
  mocap stylisée ; BVH d'origine fournis. Projet lié : « Real-Time Style Modelling of Human Locomotion via Feature-Wise
  Transformations and Local Motion Phases » — [Zenodo 100STYLE](https://zenodo.org/records/8127870).
- **Bandai Namco Research Motiondataset** : jeux 1 et 2 sous « CC BY-NC 4.0 », BVH ; 17 contenus et 15 styles
  « including expression variety » (jeu 1) ; scripts de visualisation sous MIT —
  [GitHub Bandai Namco](https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset).
- **LAFAN1** (Ubisoft) : « Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 » —
  [Papers with Code LAFAN1](https://astro.paperswithcode.com/dataset/lafan1).
- **Mixamo** (FAQ Adobe citée sur le forum officiel, 29/09/2022) :
  - « available for free, with no licensing or royalty fees, for unlimited commercial or non commercial use » pendant
    un « limited duration technology preview » ;
  - « the only thing you can't do is distribute the raw character and animation files » ;
  - interdit pour « training machine-learning models ».
  - [Adobe Community, Mixamo FAQ](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/m-p/13234775)
- La note antérieure retenait déjà CMU (jamais redistribué) et AnimatedDrawings (MIT) pour le reciblage BVH → 2D. Elle
  écartait DrawingSpinUp à cause du compte Mixamo, contraire à la consigne « pas de compte » —
  [B animation_personnages_dessines.md](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/research_notes/Animer%20Blender%20par%20prompt/animation_personnages_dessines.md).
- Notre `mocap.py` lisait déjà ASF/AMC de CMU, faisait la cinématique directe et projetait la colonne et la tête dans le
  plan des cartes — [B mocap.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/mocap.py).

**MediaPipe Pose Landmarker**
- Fiche modèle « BlazePose GHUM 3D » : « LICENSED UNDER Apache License, Version 2.0 » ; 33 points 3D.
  - Usage prévu : pose du corps entier, vidéos à **une seule personne**, mobile, bureau et navigateur.
  - Hors champ : plusieurs personnes, personnes à plus de 4 m (14 pieds), tête non visible, profondeur métrique,
    surveillance.
  - Entraîné sur des images consenties (30 k) prises au smartphone.
  - [Model Card BlazePose GHUM 3D](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf)
- Trois paquets lite, full et heavy, en float16 : détecteur 224×224, repères 256×256 —
  [Google AI Edge, Pose landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker).
- Anciennes latences publiées (Pixel 3 GPU, MacBook Pro 2017) : lite ≈ 20 et 25 ms, full ≈ 25 et 27 ms, heavy ≈ 53 et
  38 ms — [docs MediaPipe Pose (archive npm)](https://cdn.jsdelivr.net/npm/@subhajit-gorai/react-native-mediapipe-llm@1.0.3/mediapipe/docs/solutions/pose.md).

**Filtre 1€ (One Euro)**
- Deux paramètres, `fcmin` (mincutoff) et `beta`. Réglage : `beta = 0` et `fcmin ≈ 1 Hz`, on baisse `fcmin` à l'arrêt
  contre la gigue, puis on monte `beta` en mouvement rapide contre le retard (ordres de grandeur 0,001, 0,0001…).
- Implémentations de référence sous BSD (Python, C++, Java, JS, TypeScript) ou MIT (C) —
  [Casiez, 1€ filter](https://gery.casiez.net/1euro).

**[mesure] Banc MediaPipe sur ce CPU (`bench-mp/bench_pose.py`)**
- MediaPipe 1.1.1 (PyPI), modèles float16 « latest » téléchargés le 16/10/2026, délégué CPU, mode VIDEO, 1 personne.
- Les images sont agrandies à **1 080 px** de petit côté pour simuler un téléphone. On fait 4 passages aller-retour, et
  les 3 premières images sont exclues du chronométrage.
- Pour charger la bibliothèque C, il a fallu installer `libegl1` (apt). Sans elle : `OSError: libEGL.so.1`.

  | Vidéo (contenu) | Modèle | ms moy. | ms p95 | i/s | Taux de détection | Visibilité moy. (13 pts) |
  |---|---|---|---|---|---|---|
  | `Wan2.1_14B_vace_v2v` (danseuse photoréaliste générée, plein pied) | lite | 18,3 | 24,3 | 54,7 | 0,985 | 0,65 |
  | | full | 21,8 | 34,0 | 45,9 | 0,894 | 0,648 |
  | | heavy | 61,0 | 79,5 | 16,4 | 1,000 | 0,555 |
  | `Wan2.1_1.3B_vace_v2v` (femme en robe blanche sur fond blanc) | lite | 19,4 | 32,7 | 51,6 | 0,727 | 0,622 |
  | | full | 27,8 | 43,2 | 36,0 | 0,508 | 0,596 |
  | | heavy | 64,5 | 83,4 | 15,5 | 0,977 | 0,555 |
  | `dmd2` (notre personnage cartoon rendu sur CPU, plein pied, salue) | lite | 15,4 | 20,9 | 64,8 | 1,000 | 0,776 |
  | | full | 20,7 | 26,4 | 48,3 | 1,000 | 0,807 |
  | | heavy | 62,7 | 81,5 | 16,0 | 1,000 | 0,705 |
  | `dmd3` (cartoon, plan taille, main levée) | lite | 14,8 | 20,3 | 67,7 | 1,000 | 0,442 |
  | | full | 19,3 | 26,4 | 51,8 | 1,000 | 0,427 |
  | | heavy | 62,5 | 82,1 | 16,0 | 1,000 | 0,332 |

- Gigue sur la séquence la plus statique (`dmd2`, corps presque immobile, bras qui salue) : médiane de la norme de la
  différence seconde des 13 points clés, à 1 080 px de large. On mesure 6,45 px en lite, 5,41 px en full et 3,48 px en
  heavy.
  - Sur les danseuses, la mesure est dominée par le vrai mouvement (31 à 74 px) : ce n'est pas une mesure de gigue.
- Contrôle visuel (`bench-mp/overlay.py`, modèle full, 3 images) :
  - sur les deux personnages cartoon, épaules, hanches et le bras qui salue sont bien placés malgré la grosse tête ;
  - sur la danseuse en robe blanche, les bras sont en partie faux (robe et bras fondus dans le fond).

### Inferences
- **Vitesse.** Pour un clip de téléphone de 60 s à 30 i/s (1 800 images), l'extraction prend environ 30 s en lite,
  40 à 50 s en full et environ 2 min en heavy. C'est largement acceptable hors ligne.
  - Le **full** est le bon défaut : détection robuste sur un corps entier, pour un coût proche du lite.
  - Le **heavy** est un recours quand la détection chute (fond uni et vêtements clairs, cas de la robe blanche).
- **Cartoon.** MediaPipe ne sert pas à « détecter » nos personnages en production, puisque le rig est déjà connu. Il sert
  à **capter le jeu de l'utilisateur** sur son téléphone. Le transfert vers un corps cartoon (grosse tête, membres
  courts) doit se faire en **angles d'os**, pas en positions, comme le reciblage d'AnimatedDrawings (note 01).
- **Bruit.** La gigue de 3,5 à 6,5 px par image sur un corps presque immobile serait visible en gros plan. Il faut donc :
  1. un filtre 1€ ;
  2. une **réduction en clés** (le jeu capté devient des clés éditables) ;
  3. une relecture par nos courbes, ce qui réintroduit anticipation et follow-through au lieu de la raideur captée.
- **Licences.**
  - Le modèle MediaPipe est Apache-2.0, à déclarer dans `THIRD_PARTY_NOTICES.md` et `tool-manifest.json`.
  - La vidéo de l'utilisateur lui appartient.
  - CMU et 100STYLE sont permis pour une sortie commerciale. 100STYLE impose un crédit. CMU ne doit **jamais** être
    redistribué dans le dépôt public : la FAQ et la page d'accueil se contredisent, on applique la règle la plus stricte.
  - Mixamo est écarté par défaut (compte Adobe, statut de « technology preview »).
  - LAFAN1 et Bandai Namco sont exclus (NC).

### Gaps
- Pas de vraie vidéo de téléphone dans le conteneur. Les deux vidéos « humaines » sont des échantillons générés par Wan.
  Le taux de détection sur une vidéo de l'utilisateur (Abidjan, lumière forte, plusieurs personnes dans le champ) reste à
  mesurer.
- MediaPipe FaceLandmarker et HandLandmarker (visage, doigts) n'ont pas été mesurés.
- Le texte officiel actuel de la FAQ Mixamo (helpx.adobe.com) n'a pas pu être lu (HTTP 403). L'obligation de compte
  vient de la note antérieure, pas d'une lecture faite ici.
- Licence exacte de la conversion BVH de CMU que nous utiliserions : à choisir parmi des miroirs aux étiquettes
  contradictoires. Il vaut mieux partir des ASF/AMC originaux.

---

## Ce que nous greffons dans notre moteur

Principes communs :
- Tout est fonction **pure** de `(timeline, t)`. L'aléa vient d'un hachage entier `H(personnage, canal, indice)`, jamais
  d'un générateur à état.
- Angles en degrés dans le repère écran, `side = ±1` vers le partenaire.
- Les durées sont données à vitesse 1 ; chaque action reçoit un facteur de tempo `k` (durées / k).

### G1. Canal « intention → réponse » : second ordre en forme fermée, avec personnalité (améliore t3ssel8r et notre `springPose`)

Pour chaque canal (angle d'os, échelle, paramètre facial), la timeline fournit des **clés d'intention** `(t_k, y_k)`,
constantes par morceaux. La réponse est exacte et pure :
```
ω = 2πf ;  k3 = r·ζ/ω
S(τ)  = 1 − e^{−ζωτ}[cos(ω_d τ) + ζ/√(1−ζ²)·sin(ω_d τ)],  ω_d = ω√(1−ζ²)          (ζ<1)
S(τ)  = 1 − (1+ωτ)e^{−ωτ}                                                        (ζ=1)
S'(τ) = ω/√(1−ζ²)·e^{−ζωτ} sin(ω_d τ)   |   ω²τ e^{−ωτ}
y(t)  = y0 + Σ_{t_k ≤ t} Δ_k·[S(τ_k) + k3·S'(τ_k)],  Δ_k = y_k − y_{k−1},  τ_k = t − t_k
vitesse initiale après une clé = Δ·r·ζ·ω  → r<0 : anticipation ; r=0 : départ doux ; r>1 : attaque qui dépasse
```
- Évaluation : recherche binaire de la dernière clé active, puis remontée tant que `τ < τ_s = ln(10⁴)/(ζω)` ; les clés
  plus anciennes sont absorbées. Banc : 14,2 µs pour 60 canaux de 120 clés, scrub avant = arrière.
- **Personnalité par personnage**, dérivée de `troupe.json` (champs `details.body`, `age`, `role`). Valeurs de départ,
  à régler à l'œil :

  | Trait | Effet sur (f, ζ, r) du corps / de la tête |
  |---|---|
  | corps « plump, round, large » | f × 0,8 (plus lourd), ζ + 0,1 ; squash du torse autorisé |
  | âge ≥ 50 | f × 0,85, ζ + 0,1, r ≥ 0 (pas d'anticipation nerveuse) |
  | enfant / ado | f × 1,25, ζ − 0,1, r = −0,5 sur les gestes |
  | rôle « nerveux, peureux » | r = −1,0 sur la tête (sursauts anticipés), ζ = 0,45 |
  | rôle « autoritaire, mère qui gère tout » | f tête × 1,1, ζ = 0,8, gestes à r = 1,2 (attaque sèche) |

- Valeurs de base, reprises de notre table `SPRINGS` (f = ω/2π) : bouche f = 6 Hz ζ = 0,9 ; tête f = 2,5 Hz ζ = 0,7 ;
  inclinaison f = 1,4 Hz ζ = 0,8 ; bras f = 2,1 Hz ζ = 0,62.
- **Amélioration par rapport à la source** : t3ssel8r intègre pas à pas, ce qui donne de l'instabilité et une
  dépendance au pas. Nous gardons ses paramètres intuitifs, mais avec la solution exacte : déterministe, scrubbable, sans
  pas maximal.

### G2. Courbes de temps à vitesse contrôlée (Hermite / Bézier / Catmull-Rom centripète)
Pour un **chemin** (trajectoire de main, pointage) ou une arrivée à l'image près, on utilise une Hermite cubique par
segment `[t_a, t_b]`, avec `u = (t − t_a)/(t_b − t_a)` et `h = t_b − t_a` :
```
p(u) = (2u³−3u²+1)·p_a + (u³−2u²+u)·h·v_a + (−2u³+3u²)·p_b + (u³−u²)·h·v_b
```
- `v_a = v_b = 0` donne slow-in/slow-out (smoothstep `3u²−2u³`).
- La « moving hold » met `v_b` à une petite valeur de même signe, puis ajoute un second segment de dérive de 1 à 2 % sur
  0,3 à 0,6 s. La pose n'est jamais parfaitement figée, sauf sur un **gel** voulu (G8).
- Easing préfabriqué : les quatre cubic-bezier CSS (W3C) plus `easeOutBack(s)` pour un dépassement contrôlé. On inverse
  x(u) = t par 4 itérations de Newton et 8 de bissection en secours, pour un résultat déterministe.
- Clés de mocap ou de MediaPipe : Catmull-Rom **centripète** (α = 0,5) entre les clés réduites, sans boucle ni
  rebroussement (voir audit G1).
- Vitesse et accélération exposées pour la qualité : `|p''| ≤ a_max` hors coupes, et aucune vitesse discontinue à une
  jonction de segments (C¹ imposé par les tangentes partagées).

### G3. Chevauchement, follow-through et squash/stretch par la chaîne d'os
Pour une action qui pilote une chaîne (hanche → torse → épaule → bras → avant-bras → main → doigts, ou
torse → cou → tête), avec `d` la profondeur dans la chaîne à partir de l'os meneur :
```
t_k(d) = t_k + d·δ               δ = 40–80 ms (2 images à 30 i/s ; 1 pour un personnage nerveux, 3 pour un lourd)
f(d)   = f0 · 0,85^d             (l'extrémité réagit plus lentement : elle « traîne »)
ζ(d)   = max(0,35 ; ζ0 − 0,08·d) (l'extrémité dépasse davantage : follow-through)
```
- Squash/stretch du torse et de la tête, conservant l'aire : `s = clamp(κ·ÿ/ω², −0,12, 0,12)`,
  `scaleY = 1 + s`, `scaleX = 1/(1 + s)`, avec ÿ l'accélération analytique du canal porteur, dérivée de S.
- **Amélioration** : chez Unity et Godot, le chevauchement est animé à la main ou simulé physiquement, donc pas à pas.
  Ici, c'est une simple transformation des clés, donc pure et gratuite.

### G4. Micro-vie déterministe : clignements, saccades, regard, respiration, poids, bruit
**Clignements**
- Processus de renouvellement à **taux d'état** λ(t) : 17/min au repos, 26/min en parole, 8/min en écoute attentive,
  0 pendant un gel ou un choc. On intègre `Λ(t) = ∫λ`, linéaire par morceaux. L'événement i tombe à
  `Λ⁻¹(i + 0,8·(u_i − 0,5))`, avec `u_i = H(perso, "blink", i)`. Le résultat est pur, apériodique et sans paire
  collée.
- Clignements forcés : au début d'un changement de regard de plus de 20°, et au début d'une « prise » (take).
- Cinématique : fermeture 100 ms (ease-in), fermé 30 à 50 ms, ouverture 200 ms (ease-out), soit 3 + 1 + 6 images à
  30 i/s. Paupière inférieure à +20 % de la course.
- Remplace le demi-sinus périodique et symétrique de 140 ms de l'ancien code.

**Saccades et regard**
- Cible de regard = politique de conversation :
  - l'**auditeur** regarde le locuteur environ 70 % du temps, avec de brefs détournements de 0,3 à 0,8 s ;
  - le **locuteur** alterne regard et détournement de durées comparables, détourne au début d'un long tour, et revient
    sur l'auditeur avant la dernière phrase ou la chute.
- Fixations de 0,6 à 2,5 s (valeur à calibrer, non sourcée). Micro-saccades de ±0,5° toutes les 0,5 à 1 s pendant les
  fixations longues.
- Durée d'une saccade : `D = 25 + 2,5·A` ms, dans la fourchette publiée, avec un profil smoothstep. Une saccade est
  pure : elle est définie entre deux événements de la liste précalculée par hachage.
- Les yeux mènent et la tête suit (G3 avec `d = 1`, `δ = 60 ms`), avec un gain de tête de 0,3 à 0,6 de l'angle total
  au-delà de 10°.

**Respiration**
- Au repos : cycle de 3,5 à 4,5 s, montée (inspiration) et descente presque égales.
- En parole : inspiration de 0,25 à 0,45 s placée dans chaque pause d'au moins 250 ms avant une phrase, puis expiration
  lente pendant la phrase (TE/TI ≥ 1,2).
- Elle agit sur les épaules (Δy), le torse (scaleY de 1 à 1,5 %) et la tête (suit à `d = 1`), multipliée par
  `BODY_SCALE` du plan.

**Poids**
- Report toutes les 2,5 à 4,5 s, hors parole intense, dans des intervalles fournis par hachage. Le bassin glisse de 1 à
  2 % de la hauteur vers le pied d'appui, avec une contre-rotation du torse de 1 à 2° (G3).
- Les pieds restent verrouillés par l'IK (audit G2).

**Bruit**
- Bruit de gradient 1D écrit par nous : gradients `g_i = 2·H(i)/2³² − 1` aux entiers et interpolation quintique
  `6u⁵ − 15u⁴ + 10u³`. Deux octaves, de fréquence 0,15 à 0,6 Hz.
- Amplitudes : tête ≤ 1,5°, torse ≤ 0,8°, mains ≤ 2°, à multiplier par `SHOT_SCALE` et `BODY_SCALE`.
- Aucun code tiers (OpenSimplex2 CC0 reste une référence si un bruit 2D est nécessaire).

### G5. Prosodie → acteur (français) : accents, battements, sourcils, hochements, écoute
1. **Accents** sur la voix (trames de 10 ms) :
   - F0 par autocorrélation normalisée (notre code), énergie RMS ;
   - score `a(t) = z(F0) + z(énergie)` lissé sur 40 ms, maxima locaux sur les noyaux syllabiques (alignement texte →
     phonèmes de l'audit G5) ;
   - en **français**, on retient en priorité la dernière syllabe pleine de chaque groupe accentuel (fin de groupe
     syntaxique ou ponctuation), et l'accent initial seulement si son score dépasse le 80ᵉ centile.
2. **Battements de main**, groupés en **unités gestuelles** :
   - pas de retour au repos entre deux accents distants de moins de 1,2 s ;
   - préparation à partir de `t_apex − 350 ms` (ou tenue avant le stroke) ;
   - stroke de 150 à 250 ms, apex à `t_accent − 30 ms` (fourchette admise de −200 à +60 ms) ;
   - tenue après le stroke jusqu'à la fin du mot, puis rétraction de 400 à 600 ms à la fin de l'unité ;
   - amplitude ∝ score de l'accent, plafonnée par le budget de mouvement.
3. **Hochements** du locuteur sur les accents de fin de groupe : le canal de hochement reçoit une clé `+Δ` à
   `t_accent − 60 ms`, puis `0` 120 ms plus tard. La réponse du second ordre fait le rebond.
4. **Sourcils** sur une minorité d'accents (≤ 1 sur 3 : emphase, question, surprise) : montée sur 270 ms, pic à
   `t_accent − 100 ms`, maintien de 150 ms, retour sur 300 ms.
5. **Auditeur** :
   - tête quasi immobile (mouvement ≤ 15 % de celui du locuteur) ;
   - *back-channel* si le locuteur produit une zone de F0 sous son 28ᵉ centile pendant au moins 110 ms, ou à chaque
     fin de groupe longue : hochement de 3 à 6° à `t_indice + 200 ms`, au plus un toutes les 1,5 s ;
   - réaction aux mots forts du locuteur après 150 à 250 ms.
6. **Prise de parole** : le nouveau locuteur commence son geste ou sa respiration 200 ms avant sa première syllabe.
   C'est cohérent avec l'avance des gestes sur la parole.
- **Amélioration** : notre ancien code battait chaque accent du même geste (`beat * 0.2`), donc un métronome, et
  revenait au repos. Les systèmes de type BEAT supposent des accents à l'anglaise. Ici, le placement suit l'accentuation
  française mesurée, les gestes forment des unités et l'auditeur reste presque immobile, conformément aux données.

### G6. Pile de couches, masques graduels, priorités, interruptions sans fondu croisé
```
L0  posture/locomotion (override, corps entier)      ← clip de base ou BlendSpace1D vitesse
L1  actions OneShot (override, masque graduel, prio)  ← catalogue G7 : FIRE=[t_on], FADE_OUT=[t_off], ABORT=[t_i]
L2  additif : émotion (offsets d'angles), respiration, poids, bruit, battements, hochements
L3  visage : visèmes (override bouche), clignements, sourcils, regard
L4  contraintes : IK pieds verrouillés, contacts main-objet, limites articulaires (clamp doux)
L5  inertialisation : écarts décroissants aux interruptions et aux changements de clip
Combinaison :  θ = θ_L0 ⊕_{masque,w} θ_L1 + Σ w_i·Δθ_i ;   échelle = Π(1 + w_i·Δs_i) ;   puis L4, puis + off(t)
```
- **Masques graduels** par action : par exemple pointage `{bassin: 0, torse: 0,25, poitrine: 0,5, épaule: 1, bras: 1}`.
  Pas de couture entre parties masquées.
- **Priorités** : un geste de priorité supérieure qui démarre pendant un autre déclenche, si l'action courante est
  `interruptible`, un ABORT à `t_i = t_on(nouveau)`.
  - On calcule l'écart `x0 = θ_ancien(t_i) − θ_nouveau(t_i)` et `v0` par dérivée analytique.
  - On ajoute la quintique sans dépassement (banc Q2), avec `t1 = 0,15 à 0,3 s`.
  - Sinon, la nouvelle action attend `t_off` (mode « At End » de Godot).
- **Jeton d'attention (staging)** : pour chaque instant, un seul personnage porte le jeton (le locuteur, ou le réacteur
  pendant une réaction). Les gestes L1 et L2 des autres sont multipliés par 0,3, sauf les événements de réaction et de
  *back-channel*.
- **Améliorations** :
  - transitions **pures** : le fondu croisé à état de Godot et Unity devient une fonction de t, parce que la timeline
    est connue ;
  - inertialisation sans dépassement plutôt que fondu croisé, qui causait les « pops » de notre film 8 ;
  - masques continus au lieu de binaires.

### G7. Catalogue des actions réutilisables (recettes paramétriques)
Notations :
- **A** = anticipation, **P** = action principale, **F** = follow-through/dépassement, **S** = settle ;
- durées en ms à tempo k = 1, angles en degrés relatifs à la pose neutre ;
- `g` = gain d'exagération du personnage (0,7 sobre … 1,4 cartoon), `side` = ±1 vers la cible ;
- `(f, ζ, r)` = réponse G1 ; « δ » = décalage de chevauchement par profondeur (G3).
- Chaque action déclare sa couche, son masque, sa priorité (0 à 9) et si elle est interruptible.

| Action | Recette (clés d'intention et timing) | Courbes / overlap | Couche, prio, interr. |
|---|---|---|---|
| **Idle / respiration** | G4 : respiration, poids, bruit, clignements, regard ; aucune clé | bruit 2 octaves ; G1 tête (2,5 Hz ; 0,7 ; 0) | L2+L3, prio 0, toujours |
| **Marche** | cycle T = 1,0 à 1,2 s (2 pas) ; contact 0 % et 50 %, appui ≈ 60 % ; cuisse ±18·g°, genou 0 à 35° en phase de vol ; bassin ↓ 1,5 % de H deux fois par cycle ; bras en opposition ±15·g°, coude +10° en arrière ; tête stabilisée (contre-rotation) | pieds par IK verrouillés pendant l'appui ; bras δ = 60 ms derrière l'épaule ; à calibrer sur 100STYLE ou CMU | L0, prio 2 |
| **Arrêt** | A : dernier pas raccourci de 30 % ; P : pied arrière rejoint (250 ms) ; F : torse +4° vers l'avant puis −1,5° (ζ = 0,5) ; S : 400 ms | torse (1,8 Hz ; 0,5 ; 0) ; bras δ = 80 ms | L0 → L0, transition « At End » du pas |
| **Rotation / demi-tour** | A : tête et yeux d'abord vers la cible (saccade puis tête, 120 ms) ; P : torse à +80 ms, bassin à +160 ms, pieds en 2 pas (500 à 700 ms) ; S : 300 ms | chaîne yeux → tête → torse → bassin, δ = 80 ms ; squash 0 | L0, prio 3 |
| **Regard** (look-at) | saccade (G4), puis tête jusqu'à 0,5 de l'angle restant à +60 ms, puis torse 0,15 à +140 ms si l'angle dépasse 30° ; maintien ; retour quand la cible change | tête (2,5 Hz ; 0,75 ; 0) ; clignement forcé si l'angle dépasse 20° | L3+L2 additif, prio 1, oui |
| **Haussement d'épaules** | A : épaules −2 % de H (100 ms, r = −0,8) ; P : épaules +4·g % de H et tête −4° (enfoncée) en 250 ms ; avant-bras paumes en l'air +25·g°, mains ouvertes ; sourcils hauts (pic +100 ms) ; tenue 400 à 800 ms ; F : retour en 600 ms (ζ = 0,6) | épaules → coudes δ = 60 ms → mains δ = 60 ms | L1 masque haut du corps, prio 5, oui |
| **Pointage / accuser** | A : bras recule de −15° et torse −3° (150 ms) ; P : épaule vers la cible (angle IK), coude tendu à 170°, index tendu (sprite main « pointe ») en 180 ms, apex sur l'accent (G5) ; F : dépassement 8 % (ζ = 0,45) ; répétition « pique » ±6° sur chaque accent suivant ; S : rétraction 500 ms | torse → épaule → coude → main, δ = 40 ms ; geste latéral (silhouette) | L1 masque bras + 0,25 torse, prio 6, oui |
| **Mains ouvertes** (« voilà, ça ») | A : mains se rapprochent du centre (−10°, 120 ms) ; P : avant-bras s'ouvrent symétriquement de +30·g°, paumes vers le haut, en 220 ms sur l'accent ; tenue 300 à 600 ms ; F : léger rebond (ζ = 0,55) | droite et gauche décalées de 30 ms (asymétrie naturelle) | L1 bras, prio 4, oui |
| **Bras croisés** | P : bras montent et se croisent en 600 ms (sprites de croisement, ordre de dessin bras avant-arrière commuté à 50 %) ; torse −2° en arrière ; tenue indéfinie avec respiration ; sortie 500 ms | chemin Hermite des mains (passer devant le torse sans le traverser) | L1 bras + torse 0,3, prio 3, non pendant 400 ms |
| **Surprise (take)** | A : tête et torse descendent de 3·g° et yeux plissés (80 ms, « squash ») ; P : extension rapide, tête +8·g°, torse +5° en arrière, sourcils au maximum, yeux grands ouverts, bouche « O », en 1 à 2 intervalles (≈ 80 ms) ; F : dépassement 15 à 25 % (ζ = 0,35) ; tenue 400 à 1 200 ms, sans clignement | stretch +10 % sur l'extension ; mains δ = 80 ms (se lèvent après le visage) | L1 corps entier, prio 8, non pendant A+P |
| **Colère** | additif L2 : sourcils internes −, torse +4° vers l'adversaire, épaules +1,5 %, poings ; gestes à attaque sèche (r = 1,2) et f × 1,2 ; tête par à-coups sur les accents (hochement de 6° vers le bas) | ζ tête = 0,55 | L2 additif, prio 4 ; combine avec pointage |
| **Gêne** | tête −6° et inclinée de 5° de côté, regard bas et détourné (saccades plus fréquentes, toutes les 0,4 à 0,8 s) ; épaules +2 % ; une main à la nuque ou au bras opposé (Hermite) ; sourire crispé ; poids d'un pied sur l'autre toutes les 1,2 à 2 s | lent : f × 0,8, ζ = 0,9 | L1 bras + L2, prio 4 |
| **Rire** | A : inspiration (épaules +2 %, 200 ms) ; P : salve de 4 à 8 « ha » à 4,5 à 5 Hz (sur l'audio si présent) : épaules et tête ±(3 à 6)·g°, mâchoire ouverte ; enveloppe d'amplitude `e^{−t/1,2 s}` ; torse fléchi de +10° (G3) | tête δ = 40 ms derrière les épaules ; squash ±4 % en phase | L1 haut du corps + L3 bouche, prio 6 |
| **Rire + flexion** (spéc. « rire + flexion ») | rire, plus flexion du bassin de 25 à 40° et main sur le ventre ou le genou ; IK des pieds verrouillée | bassin → torse → tête, δ = 80 ms | L1 corps entier, prio 7 |
| **Recul** | A : léger penché vers la menace (+3°, 80 ms) ; P : torse −12·g° en arrière, tête −8° plus loin à +60 ms, pas arrière (pied avant recule, 300 ms), mains devant la poitrine ; F : dépassement 10 % ; S : 500 ms | squash −6 % puis stretch | L0 + L1, prio 7, non pendant P |
| **Flexion** (se pencher) | A : bassin recule de 2 % (contrepoids) ; P : bassin fléchi 30 à 60°, genoux 15 à 30°, tête compense pour garder le regard (−0,5 × flexion) ; 500 à 800 ms ; retour 600 ms | colonne : bassin → torse → cou, δ = 60 ms | L0, prio 4 |
| **S'asseoir** | A : regard vers le siège (look-at), recul d'un pas ; P : bassin descend sur une Hermite (vitesse max au milieu), torse +25° en avant pour équilibrer, mains vers les accoudoirs ; contact 700 à 900 ms ; S : tassement, squash −5 % puis rebond ζ = 0,6 | torse en avance de 100 ms sur le bassin | L0, prio 5 |
| **Se lever** | A : torse +30° en avant, mains sur les cuisses ou accoudoirs (300 ms) ; P : poussée, bassin monte (500 à 700 ms, heavy × 1,3) ; F : torse revient à 0 avec un dépassement de −3° ; S : 300 ms | bassin → torse δ = 120 ms (le torse finit après) | L0, prio 5 |
| **Prendre un objet** | A : regard vers l'objet (300 ms avant), main s'ouvre ; P : IK de la main vers la poignée de l'objet (Hermite, 400 à 600 ms, vitesse nulle au contact), flexion si l'objet est bas ; contact : l'objet devient l'**enfant** de la main à t_c ; F : bras remonte avec la charge (f × 0,8 si l'objet est lourd), anticipation exagérée pour le lourd | main δ = 60 ms derrière le coude ; contact exact (pas de glissement) | L1 bras (+ L0 flexion), prio 6, non entre contact −100 ms et +100 ms |
| **Poser un objet** | inverse : approche avec vitesse nulle au point de dépose, l'objet devient enfant du décor à t_d, la main s'ouvre puis se retire (300 ms), regard sur l'objet jusqu'à t_d + 200 ms | idem | idem |

Mélanges exigés par la spécification :
- **marcher + parler** : L0 marche ; battements G5 réduits à 50 % ; bras porteurs du geste masqués à 0,7 sur le
  balancier ;
- **écouter + regarder** : L3 regard sur le locuteur ; L2 *back-channel* ; corps sous le jeton (×0,3) ;
- **colère + geste** : additif colère + pointage, f × 1,2 et r = 1,2 ;
- **rire + flexion** : recette ci-dessus.

### G8. Timing comique (hook, escalation, twist, punchline freeze)
- **Échelle de prises** (Lasseter, ≈ (n+1)/24 s par changement de pose). Coup ou choc : 1 à 2 images (42 à 83 ms) ;
  réaction comique sèche : 3 à 4 (125 à 167 ms) ; ordre : 5 (≈ 210 ms) ; regard intéressé : 7 (≈ 290 ms) ;
  réflexion ou jugement : 10 (≈ 420 ms). Le moteur choisit la durée `P` de G7 sur cette échelle, selon l'intention
  du script (« sec », « lent à comprendre »).
- **Avant la chute** :
  - pas de silence imposé dans l'audio (les données ne le soutiennent pas) ;
  - l'auditeur gèle son micro-jeu (bruit × 0,2, pas de clignement) pendant 300 à 600 ms avant la syllabe finale de la
    chute ;
  - le locuteur ramène son regard sur l'auditeur (G4).
- **Réaction** : départ de la prise 120 à 250 ms après la syllabe finale (double prise : un premier petit hochement
  « normal », puis la vraie prise 400 à 700 ms plus tard). Tenue 0,6 à 1,5 s.
- **Gel final (punchline freeze)** :
  - à `t_freeze`, tous les canaux de jeu passent en mode « tenue exacte » (dérivée nulle imposée, aucun bruit, aucun
    clignement) sur le visage choqué ;
  - zoom ou recadrage seulement si la scène le demande (la spécification interdit le zoom automatique instable) ;
  - gel de 0,8 à 1,5 s, contrôlé par la timeline.
- **Exagération équilibrée** : le gain `g` d'une scène s'applique à toutes les composantes (corps, visage, timing), pas
  à une seule, comme le demande Lasseter.

### G9. Sources de mouvement : mocap et capture par téléphone
**Mocap**
- CMU (ASF/AMC d'origine, jamais commités) et 100STYLE (CC BY 4.0, crédit « 100STYLE Dataset — I. Mason, S. Starke,
  T. Komura » dans `THIRD_PARTY_NOTICES.md` et la description des vidéos si exigé).
- Projection en angles 2D (audit G4), puis réduction en clés (ci-dessous), puis relecture par G1, G2 et G3.
- LAFAN1, Bandai Namco et Mixamo sont **exclus** par défaut (NC, ou compte et FAQ non stable).

**Capture par téléphone** (outil hors ligne `capture/phone_to_keys`)
1. Décodage ffmpeg à 30 i/s, MediaPipe Pose Landmarker **full** (heavy si le taux de détection tombe sous 0,9),
   délégué CPU, mode VIDEO. Coût mesuré : 19 à 28 ms par image, soit environ 45 s pour 60 s de vidéo.
2. Filtre 1€ sur chaque coordonnée : `fcmin = 1,0 Hz`, `beta` réglé par la procédure de Casiez (démarrer à 0,001 en
   unités de pixels normalisés), `dcutoff = 1 Hz`. Les points de visibilité < 0,5 sont remplacés par l'interpolation
   des voisins.
3. Angles relatifs au parent (épaule→coude, coude→poignet, hanche→genou, genou→cheville, axe des épaules, axe tronc
   cou→nez) : `θ = atan2(v_y, v_x) − θ_parent`, déroulés (unwrap). Seuls les **angles** sont transférés, jamais les
   longueurs.
4. **Exagération cartoon** : `θ' = θ_neutre + g·(θ − θ_neutre)` avec `g = 1,2 à 1,5`, puis limites articulaires du rig.
5. **Réduction en clés** par Ramer-Douglas-Peucker sur chaque courbe (tolérance de 1,5°, 3° pour les doigts), ce qui
   donne des clés éditables dans la timeline.
6. Relecture par G1 (réponse du second ordre) et G3 (chevauchement). Le jeu capté retrouve ainsi anticipation et
   follow-through au lieu de la raideur ou de la gigue du tracker.
- **Amélioration par rapport aux usages courants** (marionnette pilotée image par image par les points, comme
  Pose Animator ou notre ancien `bodyDetect`) : nous ne recopions jamais la gigue image par image. Le jeu de
  l'utilisateur devient **des clés**, retouchables et rejouées par nos courbes, avec la personnalité du personnage
  cible (G1).
- `tool-manifest.json` : `{id: "mediapipe-pose-landmarker", version: "1.1.1", license: "Apache-2.0", mode: "local",
  model: "pose_landmarker_full float16", health: "detect 1 image test"}` ; dépendance système `libegl1`.

### G10. Tests de jeu pour l'AnimationQualityGate (en plus des tests de l'audit G8)
- **Pureté** : hachage de `evaluate(t)` identique en avant, en arrière, dans un ordre aléatoire et à 24, 25, 30 et
  60 i/s (banc Q2 : OK).
- **Clignements** :
  - taux par état dans [10, 30] par minute ;
  - coefficient de variation des intervalles ≥ 0,3, donc non périodique ;
  - fermeture plus courte que l'ouverture ;
  - aucun clignement pendant un gel ou une prise.
- **Saccades** : durée ≤ `30 + 3·A` ms ; aucune poursuite lente des yeux sans cible mobile.
- **Prosodie** :
  - médiane de `t_apex − t_accent` dans [−120, +40] ms ;
  - ≥ 70 % des battements à moins de 200 ms d'un accent ;
  - gestes en unités (≤ 30 % de retours au repos entre deux battements distants de moins de 1,2 s).
- **Staging** :
  - ≥ 90 % des images avec au plus un personnage au-dessus du seuil de mouvement des gestes ;
  - mouvement de tête de l'auditeur ≤ 25 % de celui du locuteur (même mesure que `measureFrames`, par boîte de
    personnage).
- **Principes** :
  - toute action de priorité ≥ 5 présente une vitesse de signe opposé dans les 200 ms précédant son stroke
    (anticipation), sauf « pas d'anticipation » déclaré ;
  - dépassement ≤ 25 % sauf prise cartoon ;
  - continuité C¹ aux transitions (|Δv| ≤ seuil) et aucun NaN.
- **Budget** : couverture prédite (audit G3) dans [0,15 ; 0,29] par plan, après application du jeton d'attention et de
  `BODY_SCALE`.
