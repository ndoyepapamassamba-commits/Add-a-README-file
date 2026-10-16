# Audit de l'existant (lot 0 de la spécification) : code antérieur, architecture Workbench, kit de décors, outils du conteneur

Date : 16/10/2026. Audit sans écriture dans le code existant. Les mesures ont été faites dans ce conteneur (4 vCPU Xeon,
15 Go de RAM, sans GPU).

Conventions de source :
- **[B]** désigne le code antérieur lu sur la branche `claude/relaxed-noether-svkgiu`, commit `d869966` (15/10/2026),
  dépôt `https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/` suivi du chemin.
- **[kit]** désigne le kit privé `studio-troupe/.private/kit/` (ignoré par git, vérifié avec `git check-ignore` :
  règle `.private/` de `studio-troupe/.gitignore`).
- **[mesure]** désigne une mesure faite pendant cet audit. Les scripts sont restés dans le scratchpad et ne sont pas
  versionnés. La méthode est décrite à côté de chaque chiffre.

Réserve générale : la spécification vise `massamba-workbench-direct (18).html`. Ce fichier compilé n'est **pas** dans le
conteneur. Une recherche `find / -iname 'massamba-workbench*'` ne trouve rien. L'audit porte donc sur le **code source**
qui produit cette application (`workbench/`, `npm run build:direct`). La build (18) peut en différer.

---

## Q1. Inventaire du code antérieur : que fait chaque brique, où elle commence, ce qui a marché

### Takeaway
Le projet antérieur contient **cinq moteurs d'animation successifs** :
1. la Marionnette 2.5D, qui déforme une image fixe ;
2. le Corps entier 2D, méthode « Animated Drawings » ;
3. la Marionnette souple ARAP, qui déforme les planches ;
4. l'Acteur virtuel 3D en three.js ;
5. le moteur de film Blender, avec des cartes dessinées posées sur un décor en relief.

Ils sont accompagnés d'un outillage de qualité solide : mesure « comme vos TikTok », porte de qualité, visèmes sur la
voix, vocabulaire de mise en scène fermé. Les 81 tests unitaires des moteurs purs passent. Le moteur le plus abouti,
Blender, produit un film techniquement propre mais lent (2,57 s par image). Ses personnages restent des **cartes
quasi rigides** : seuls 3 os, racine, colonne et tête.

### Cited Findings
**Marionnette 2.5D**
- Fichiers : `server/jev/studio/puppet.ts` pour le cœur pur (`poseAt`, `warpGrid`, `springPose`) et
  `direct/lib/studio/puppetRender.ts` pour le rendu canvas, avec des triangles en mapping affine.
- Un modèle de vision localise tête, yeux, bouche, corps et bras en fractions d'image (`RIG_PROMPT`).
- La pose à l'instant t combine rotation et hochements de tête, respiration, balancement, squash and stretch et un
  bras qui salue.
- Une grille déforme le dessin et le fond reste fixe autour.
- Sources : [B puppet.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/puppet.ts) ; [B puppetRender.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/studio/puppetRender.ts)

**Calques et plaque de fond**
- `server/jev/studio/layers.ts` produit un cache couleur (matte) par personnage et une plaque de fond. Les trous sont
  remplis par une diffusion « push-pull » des couleurs voisines.
- Source : [B layers.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/layers.ts)

**Corps entier 2D**
- `server/jev/studio/body2d.ts` reprend la méthode d'« Animated Drawings », reconstruite et déclarée comme telle.
- Les articulations 2D sont lues dans le navigateur par MediaPipe (`direct/lib/studio/bodyDetect.ts`).
- Un maillage triangulaire est lié aux os les plus proches.
- Les clips (marche, saut, danse, chute, gifle…) sont écrits en angles d'os et adoucis par des ressorts amortis.
- Source : [B body2d.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/body2d.ts)

**Marionnette souple ARAP**
- `server/jev/studio/actor/arap.ts` applique « As-Rigid-As-Possible » (Sorkine & Alexa 2007) avec une factorisation
  de Cholesky **dense**. Le commentaire annonce « about a millisecond » pour « a few hundred vertices ».
- `actor/puppetMotion.ts` place les poignées selon le jeu : épaules qui respirent, haussement, avant-bras sur les
  accents de la voix, doigt accusateur.
- Sources : [B arap.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/actor/arap.ts) ; [B puppetMotion.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/actor/puppetMotion.ts)

**Acteur virtuel 3D**
- `server/jev/studio/actor/actor.ts` est le directeur de performance : actions `sit`, `standUp`, `walkTo`, `turnTo`,
  `arm` (wave, point, shrug, akimbo, cross, raise, facepalm), `emotion` et `look`.
- Le moteur comprend un planificateur de pas (pieds plantés), une IK à deux os, une posture émotionnelle
  (Wallbott/Ekman) et un regard ciblé (look-at).
- `perform(script, seconds, fps)` produit les images **en séquence** depuis t = 0.
- Rendu three.js : `direct/lib/studio/actorRender.ts`. Corps procédural : `actorBody.ts`.
- Sources : [B actor.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/actor/actor.ts) ; [B solver.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/actor/solver.ts) ; [B skeleton.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/actor/skeleton.ts)

**Visèmes et émotions**
- `actor/audioVisemes.ts` analyse la voix toutes les 20 ms par FFT : l'énergie ouvre la mâchoire, les formants
  donnent l'étirement (i, é) ou l'arrondi (o, ou).
- `mouthAt` applique une avance de 40 ms (`lead = 0.04`).
- `emotionLayer.ts` contient :
  - une table d'émotions corporelles (Wallbott 1998, Ekman), en décalages d'inclinaison, de tête, de bras, de tempo,
    de tremblement, de squash et de rebond ;
  - le tableau de bouches de Preston Blair (A/I, E, O, U, MBP, FV, L, WQ, etc, repos).
- Sources : [B audioVisemes.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/actor/audioVisemes.ts) ; [B emotionLayer.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/emotionLayer.ts)

**Kit troupe et casting**
- `direct/lib/studio/troupeKit.ts` installe une seule fois par version les planches, les galeries et les décors
  embarqués :
  - les visages sont déjà mesurés (bouche, menton, yeux) ;
  - chaque décor porte `depth`, `people`, `fit`, `plate`, `plateDepth` et `masks` ;
  - en build « en paquets », les décors viennent de fichiers `massamba-troupe-N.js` (`direct/lib/videogen/troupePacks.ts`).
- `actorsCast.ts` attribue à chaque personnage d'un film **son** acteur de la bibliothèque, le même d'un film à
  l'autre. Un nouveau personnage reçoit un acteur construit d'après sa fiche.
- Sources : [B troupeKit.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/studio/troupeKit.ts) ; [B actorsCast.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/studio/actorsCast.ts)
- Les planches (fond vert, 5 poses : neutre, accuse, choc, haussement, rire) sont découpées et riggées par
  `actor/sheet.ts`, `actor/face2d.ts` et `direct/lib/studio/sheetImport.ts`, avec un portage Python dans
  `scripts/blenderfilm/cutout.py`.
- Source : [B cutout.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/cutout.py)

**Le Réalisateur**
- Chaîne : prompt, puis consignes de jeu validées, puis moteur, sans coût vidéo.
- `scripts/blenderfilm/director.py` et `direction-vocab.json` forment un vocabulaire **fermé** :
  - 5 poses ;
  - 5 mouvements de caméra (punch, push, pull, drift, aucun) ;
  - 26 gestes, de « aucun » à « danse » ;
  - 12 entrées (normal, colère, fier, frimeur, ivre, pressé…) ;
  - un schéma JSON.
- `server/jev/studio/stageDirections.ts` en est le pendant dans l'app.
- Verdict mesuré antérieurement : « règles d'abord, modèle pour les trous ». Qwen3 1,7B tournait sur CPU à 5,3 jetons/s
  et 8,1 s par réplique, avec un JSON valide 5/5, mais une qualité faible.
- Sources : [B director.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/director.py) ; [B direction-vocab.json](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/direction-vocab.json) ; [B contournements_bac_a_sable.md §2](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/research_notes/Animer%20Blender%20par%20prompt/contournements_bac_a_sable.md)

**Visage vivant (LivePortrait)**
- `scripts/blenderfilm/liveface.py` précalcule une bibliothèque d'états par pose : 5 ouvertures de lèvres × yeux
  ouverts, mi-clos ou fermés.
- Modèle : LivePortrait (KwaiVGI, MIT). Le détecteur InsightFace n'est **pas** utilisé parce que ses modèles sont non
  commerciaux.
- Mesures : 7,9 s par image sur 4 cœurs CPU, et 17,6 s par image avec FasterLivePortrait en ONNX.
- Sources : [B liveface.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/liveface.py) ; [B docs/production-video.md](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/docs/production-video.md)

**Lèvres avec Rhubarb**
- `lipsync.py` n'utilise Rhubarb (MIT) que pour **fermer** la bouche sur m, b, p. Ses fermetures tombent 2,25 fois
  plus souvent dans les mots à m/b/p.
- Ses autres formes, apprises sur l'anglais, ont été écartées.
- Source : [B docs/production-video.md §3](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/docs/production-video.md)

**Bac à sable WebGL**
- Studio 3D Pro : `direct/views/Lab3DView.tsx`, `direct/lib/lab3d/`, `direct/lib/studio3dCore.ts`. Les scènes y sont
  décrites par des **primitives** : `cube`, `sphere`, `cylinder`, `cone`, `torus`, `plane`, `capsule`, `roundedbox`,
  `icosphere`.
- Un pont Blender local répond sur `http://127.0.0.1:8765` (`direct/lib/blenderBridge.ts`, `scripts/blender-bridge.py`).
- La chaîne « Vidéo IA » (`direct/lib/videogen/`) comprend :
  - `videoScene.ts`, la scène three.js en relief avec plaque, profondeur et masques ;
  - `imageGL.ts`, une caméra virtuelle en WebGL2 ;
  - `encode.ts`, l'encodage MP4 avec WebCodecs H.264 et mp4-muxer.
- Sources : [B studio3dCore.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/studio3dCore.ts) ; [B videoScene.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/videogen/videoScene.ts) ; [B blenderBridge.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/blenderBridge.ts)

**Rendu image par image exact**
- `direct/lib/studio/exactRender.ts` calcule chaque image à son instant n/30 s, l'encode avec cet horodatage
  (Mediabunny) et mixe le son hors ligne sur la même horloge.
- Ce mode remplace la capture en temps réel (MediaRecorder). Celle-ci avait été mesurée à 4,9 images/s, avec une image
  en avance de 0,37 s sur le son.
- Source : [B exactRender.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/studio/exactRender.ts)

**Pipeline de film Blender (`scripts/blenderfilm/`)**
- La commande `film.py --story stories/<x>.json --troupe … --out …` enchaîne :
  1. la découpe des planches ;
  2. `plan.py` : voix, minutage, bouche, jeu, plans, sous-titres ;
  3. `scene.py` : la scène Blender, puis le rendu ;
  4. `finish.py` : montage en bandeau, sous-titres mot à mot, son, H.264 ;
  5. `gate.py` : la porte de qualité.
- Modules annexes : `acting.py`, `mocap.py`, `crowd.py`, `world.py`, `vehicles.py`, `atelier.py`, `procedural.py`,
  `preflight.py`, `ground.py`, `framing.py` et `tone.py`.
- 10 histoires sont disponibles dans `stories/`.
- Source : [B film.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/film.py)

**Mouvement réel par mocap**
- `mocap.py` utilise la base CMU (« free for all uses », produits commerciaux permis, revente des données interdite).
  Les clips sont téléchargés un par un et jamais redistribués.
- 100STYLE est référencé sous CC BY 4.0 (crédit obligatoire).
- Source : [B contournements_bac_a_sable.md §1](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/research_notes/Animer%20Blender%20par%20prompt/contournements_bac_a_sable.md)

**Ce qui a marché, d'après les mesures antérieures**
- Résultats techniques du film 9 : 0 saut de lumière hors coupe, −14,4 LUFS, image = son, conformité 3D à 100 %.
- Coût du rendu complet 576×1024 en Cycles CPU : **2,57 s par image**, 4 515 s au total.
- EEVEE sans GPU tombe à environ 150 s par image, avec des erreurs EGL : il a été écarté.
- Source : [B video_3d_etat_des_acquis.md](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/research_notes/Animer%20Blender%20par%20prompt/video_3d_etat_des_acquis.md)

**État actuel dans l'app**
- La chaîne 3D a été sortie de l'app le 14/10/2026 (`VIDEO_3D = false` dans `direct/lib/features.ts`). Rien n'a été
  supprimé.
- Source : [B features.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/features.ts)

**Tests**
- [mesure] Copie de `workbench/` dans le scratchpad, `npm ci --ignore-scripts` (12 s), puis `npx vitest run` sur les
  13 fichiers des moteurs purs : arap, body2d, puppet, puppetMotion, audioVisemes, actor, motion, clipInspect, sheet,
  face2d, relief, stageDirections et blenderfilm.
- Résultat : **13 fichiers, 81 tests réussis, en 2,45 s**.

### Inferences
- L'existant est riche en **outillage de mesure et de mise en scène** réutilisable : porte, mesure du rythme,
  vocabulaire fermé, visèmes, tables d'émotions, IK. Il est pauvre en **représentation du personnage**. Aucune des cinq
  voies n'a de personnage découpé en segments articulés avec pivots anatomiques, alors que la spécification §6 l'exige :
  tête, torse, bassin, bras, avant-bras, mains, cuisses, jambes et pieds.
- Le moteur Blender est lourd (Cycles CPU à 2,57 s par image) pour un rendu qui reste au fond une composition 2D :
  cartes émissives sur décor projeté. Une composition 2D/2.5D en WebGL obtient la même chose beaucoup plus vite (voir
  Q4 : 0,19 s par image en 1080×1920, export compris).

### Gaps
- Aucun film de la Marionnette 2D (puppet, body2d, ARAP) n'a été mesuré par la porte du rythme : je n'ai trouvé
  aucun `*.gate.json` ni aucune note chiffrée. Leur qualité visuelle reste non documentée en dehors de
  `docs/ETUDE-ANIMATION-3D.md`, qui la décrit qualitativement : « mouvements limités à quelques degrés ».
- Les MP4 des films 5 à 9 ne sont pas dans le conteneur. L'audit visuel image par image n'a pas pu être refait.

---

## Q2. Pourquoi les résultats faisaient « lego » ou irréels, et pourquoi le film 9 a échoué à la porte du rythme

### Takeaway
**Le film 9 n'a pas échoué par manque de mouvement, mais par EXCÈS de mouvement global.**
- Mouvement : 0,0271 pour un plafond de 0,027.
- Couverture : 0,53 pour un plafond de 0,435 avec la marge « monde vivant ». Les TikTok de la chaîne sont entre 0,15
  et 0,29.

C'était la carte dessinée entière qui bougeait (balancement, respiration) et le décor entier sous les mouvements de
caméra. Les membres, eux, ne s'articulaient pas. Ce mouvement à la fois global et pauvre en articulation est la cause
mesurable du rendu « lego » et « saccadé ». Les décors et véhicules 3D procéduraux expliquent probablement
« voitures irréelles ».

### Cited Findings
- **Seuils de la porte** (`gate.py` + `tiktok_reference.json`, 12 TikTok de la chaîne mesurés avec le même code) :

  | Mesure | min | médiane | max |
  |---|---|---|---|
  | mouvement | 0,0098 | 0,01845 | 0,027 |
  | couverture | 0,15 | 0,215 | 0,29 |
  | plans/min | 8,4 | 11,4 | 23,2 |
  | durée médiane d'un plan (s) | 1,17 | 5,17 | 9,17 |

  - La couverture admet un plafond relevé à 1,5 × max, la marge « monde vivant ».
  - Source : [B gate.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/gate.py) ; [B tiktok_reference.json](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/tiktok_reference.json)
- **Définition des mesures** (`clipInspect.measureFrames`, appelé par `measure.ts`) :
  - la vidéo est réduite en gris 96×170 à 12 i/s ;
  - le *mouvement* est la moyenne de |Δ| par pixel entre images consécutives, coupes exclues ;
  - la *couverture* est la part des 8×8 = 64 zones dont |Δ| moyen dépasse 0,012.
  - Source : [B clipInspect.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/clipInspect.ts) ; [B measure.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/measure.ts)
- **Film 9 en pleine résolution** : « Porte : NON — mouvement 0,0271 (chaîne ≤ 0,027) et couverture 0,53 (≤ 0,435 avec
  la marge "monde vivant" ; chaîne ≤ 0,29) ».
  - L'aperçu, qui ne rendait qu'une image sur trois, sous-estimait le mouvement de 14 % et la couverture de 20 %. Les
    films 6 à 9, déclarés « OUI » en aperçu, ne l'étaient pas.
  - Source : [B contournements_bac_a_sable.md §10](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/research_notes/Animer%20Blender%20par%20prompt/contournements_bac_a_sable.md)
- **Où ça bouge** :
  - le centre de l'image bouge sur 60 à 83 % des pas ;
  - les différences entre deux images d'un gros plan moyen « montrent TOUT le contour du dessin (balancement,
    respiration, marionnette : la carte entière se déplace) et, en avancée ou glissement, tout le décor derrière » ;
  - « dans les TikTok de la chaîne le téléphone est posé et seule la personne bouge ».
  - Source : [B contournements_bac_a_sable.md §10](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/research_notes/Animer%20Blender%20par%20prompt/contournements_bac_a_sable.md)
- **Décomposition A/B sur 4 plans** :
  - sans jeu de corps ni gestes : mouvement 0,014, couverture 0,28, donc dans la cible ;
  - avec caméra fixe : couverture 0,47 ;
  - avec décor figé : 0,54, l'effet de la vie du décor est négligeable ;
  - le moteur corrigé ramène les plans serrés de 0,8 à 0,63, toujours au-dessus de la cible.
  - Source : [B video_3d_etat_des_acquis.md](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/research_notes/Animer%20Blender%20par%20prompt/video_3d_etat_des_acquis.md)
- **Rig des acteurs Blender** :
  - chaque pose est un maillage découpé sur l'alpha du dessin, en **matière émissive** ;
  - le squelette n'a que **3 os** : `bone('root')`, `bone('spine')`, `bone('head')`, vers la ligne 907 de `scene.py` ;
  - les poses s'enchaînent par un **fondu de 4 images** entre dessins (ligne 1309 : « crossfade of 4 frames between
    successive poses »).
  - Source : [B scene.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/scene.py)
- **Faux raccord mesuré sur le film 8** : la pose « haussement » d'une réaction claque en gros plan, avec un saut de
  luminance de +39,9 à l'image 910. « Un dessin plein cadre qui change d'un coup est un faux raccord ».
  - Source : [B contournements_bac_a_sable.md §8](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/research_notes/Animer%20Blender%20par%20prompt/contournements_bac_a_sable.md)
- **Diagnostic du film 5 (noté 10/100)** :
  - bouches qui s'ouvraient en étirant le menton ;
  - clignements en ovales plats ;
  - acteurs statiques avec une seule image par pose ;
  - 3 h de calcul pour 64 s.
  - Source : [B docs/production-video.md §1](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/docs/production-video.md)
- **Objets et véhicules générés en 3D procédurale** :
  - `vehicles.py` : « carrosserie continue lissée par sections » ;
  - `atelier.py` remplace « les primitives (un cube, des boules rouges) » ;
  - `procedural.py` : lieux en Geometry Nodes ;
  - Studio 3D Pro décrit les scènes en primitives.
  - Sources : [B vehicles.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/vehicles.py) ; [B atelier.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/atelier.py) ; [B studio3dCore.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/studio3dCore.ts)
- **Limites de la Marionnette 2.5D** : elle « déforme les pixels d'une image fixe » et a des « mouvements limités à
  quelques degrés autour de la pose de l'image (au-delà : déchirures, halos) ».
  - Source : [B docs/ETUDE-ANIMATION-3D.md](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/docs/ETUDE-ANIMATION-3D.md)
- **Ressorts dépendants du chemin** ([mesure], `tsx` sur `springPose` + `poseAt`, personnage synthétique qui parle en
  colère et pointe, écarts max sur headRot, headNod, lean, sway, squash, mouth, smile et arms, en radians ou en
  fractions) :

  | Comparaison | Écart max |
  |---|---|
  | 30 i/s contre 25 i/s à t = 2 s | 0,0096 |
  | 30 i/s contre 60 i/s à t = 2 s | 0,0183 |
  | lecture séquentielle contre saut direct à t = 2 s | **0,237**, soit environ 13,6° sur un bras |
  | retour arrière à t = 1 s contre lecture séquentielle | **0,249** |

  - Le code remet le ressort à zéro dès que `t < state.t` ou qu'un saut dépasse 0,5 s : un scrub fait claquer la pose.
  - Source du code : [B puppet.ts l.426-481](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/puppet.ts)
- **Coût et non-déterminisme d'ARAP** ([mesure]) :
  - silhouette 420×900 px, pas de grille 10 px, soit 2 395 sommets et 4 516 triangles, avec 8 poignées ;
  - maillage : 12,8 ms ; factorisation dense : **4 545 ms** ; **75 ms par résolution** (2 itérations) ;
  - même cible résolue « à chaud » (après 60 images) et « à froid » : **15,7 px d'écart**, et encore 10,8 px contre
    une résolution froide à 20 itérations.
  - Le démarrage à chaud (`cur`, « warm start of the next frame ») rend donc le résultat dépendant de l'historique.
- **Directeur 3D séquentiel** : `perform()` calcule les images en séquence avec un état (`new Actor(script)` puis
  `a.frame(i/fps, 1/fps)`). On ne peut pas évaluer un instant isolé.
  - Source : [B actor.ts l.404-409](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/actor/actor.ts)

### Inferences
- **Contradiction à signaler.** Le cadrage de la mission (« motion too weak ») et la note antérieure
  `fluidite_qualite_controle.md` interprètent 0,0271 comme un mouvement faible et procédural. Ils sont **contredits** par
  `gate.py` et par la note des acquis : 0,0271 dépasse le **plafond**. Il faut donc viser un mouvement **localisé**
  (membres, tête, bouche) avec une caméra posée, et non « plus de mouvement ».
- **« Lego » et « saccadé »** :
  - des cartes rigides à 3 os ne plient ni coudes, ni poignets, ni genoux ;
  - les changements d'expression se font par fondu entre 5 dessins, avec des pops et des faux raccords ;
  - la seule vie vient d'oscillations globales de la carte ;
  - sur le plan perceptif, des articulations absentes plus des oscillations de bloc donnent l'impression d'une figurine
    emboîtée.
- **« Personnage irréel »** : un dessin émissif posé sur un décor éclairé en Cycles ne reçoit ni la lumière, ni
  l'ombre de contact, ni la teinte du lieu. Il paraît collé (inférence).
- **« Voitures irréelles »** : les véhicules et objets procéduraux (`vehicles.py`, `atelier.py`) n'ont pas la facture
  peinte des décors (inférence). Les décors peints d'Abidjan contiennent déjà des voitures dessinées, retirées de la
  plaque par les masques R.
- **Contrats violés** : ressorts intégrés pas à pas, ARAP à chaud et directeur séquentiel violent tous trois le contrat
  de la spécification : « fonction pure evaluate(t) […] même entrée = même état », plus le scrub reproductible du §8.

### Gaps
- Aucun verbatim de l'utilisateur rattachant « voitures irréelles » à `vehicles.py` n'a été trouvé dans les notes.
  L'attribution reste une inférence.
- La porte n'a jamais été passée sur un film de la Marionnette 2D. On ne sait pas si ses déformations de grille
  dépassaient elles aussi la couverture.

---

## Q3. Ce qui est réutilisable (notre code) et ce qui doit être reconçu

### Takeaway
On garde **la mesure, la mise en scène et les données** : clipInspect et la porte, le vocabulaire fermé, les tables
d'émotions et de visèmes, l'analyse de la voix, l'IK analytique, le chargeur de kit et le découpeur de planches. On
reconçoit **la représentation et l'évaluation du personnage** : rig découpé en segments plutôt que carte ou grille,
évaluation analytique plutôt que ressorts intégrés, rendu WebGL plutôt que Cycles, caméra posée par défaut.

### Cited Findings
**Réutilisable tel quel ou presque**

| Brique | Rôle à reprendre | Source |
|---|---|---|
| `clipInspect.measureFrames` + `tiktok_reference.json` + `gate.py` | partie « rythme » et « technique » d'AnimationQualityGate | [B clipInspect.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/clipInspect.ts) |
| `direction-vocab.json` + règles de `director.py` | vocabulaire d'actions de MotionController | [B direction-vocab.json](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/direction-vocab.json) |
| `emotionLayer.ts` (EMOTION_BODY, Preston Blair) | couche émotion additive | [B emotionLayer.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/emotionLayer.ts) |
| `audioVisemes.ts` (FFT, énergie, formants, avance de 40 ms) | caractéristiques audio pour VisemeTrack | [B audioVisemes.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/actor/audioVisemes.ts) |
| `solver.ts` (IK analytique à 2 os, visée, look-at), limites de `skeleton.ts` | IK des bras et jambes du rig découpé | [B solver.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/actor/solver.ts) |
| `tone.py`, `plan.py` (minutage comique mesuré), `subtitles.ts`, `finish.py` (bandeau, sous-titres mot à mot, LUFS) | timeline et finition | [B tone.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/tone.py) ; [B finish.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/finish.py) |
| `troupeKit.ts`, `troupePacks.ts`, `server/jev/videogen/troupePack.ts` | lecteur des paquets de décors pour AssetRegistry | [B troupePack.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/videogen/troupePack.ts) |
| `sheet.ts`, `face2d.ts`, `sheetImport.ts`, `cutout.py` | découpe des planches de l'utilisateur, plus tard | [B sheet.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/actor/sheet.ts) |
| `ground.horizon_fit`, `scene_layers.py` | échelle métrique et masques des décors | [B ground.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/ground.py) ; [B scene_layers.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/scene_layers.py) |
| principe d'`exactRender.ts` (image n à n/fps, son sur la même horloge) | ExportAdapter | [B exactRender.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/studio/exactRender.ts) |
| pont local Blender (`127.0.0.1:8765`, contrôle de santé, délai court, `fetch` injectable) | modèle de RenderAdapter, qui détecte et ne simule jamais | [B blenderBridge.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/blenderBridge.ts) |
| `secrets.ts` (scan des clés avant export), `server/security/redact.ts` | protection des secrets dans les logs et manifestes | [B secrets.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/secrets.ts) |

**À reconcevoir**

| Existant | Défaut mesuré ou constaté | Remplacement |
|---|---|---|
| `springPose` | dépend du chemin et de la fréquence d'images | ressorts **analytiques** évalués en t |
| ARAP dense à chaud | 4,5 s de factorisation, 75 ms par image, écart de 15,7 px | rig **découpé** en segments rigides à pivots ; un ARAP éventuel à froid, creux, sur ≤ 400 sommets |
| cartes Blender à 3 os et fondus de dessins | pas d'articulation, pops | mélange de poses sur **angles d'articulations** |
| mouvements de caméra par défaut | couverture du décor entier | caméra posée, mouvements rares et motivés |
| décor prolongé en miroir (`livingSet.ts`, `tx` impair retourné, bande retournée en haut) | interdit par la spéc §6 : « pas de duplication miroir visible » | caméra **bornée** dans la plaque |

- Source du miroir : [B livingSet.ts l.45-110](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/studio/livingSet.ts)

### Inferences
- Le code antérieur est le nôtre : il peut être repris. La règle « ne jamais coller de code tiers » ne vise que les
  dépôts externes. Les parties qui citent une méthode externe (« Animated Drawings », Sorkine & Alexa, Preston Blair)
  sont déjà des réimplémentations, sans copie.
- Les modules purs testés (81 tests) peuvent être portés avec leurs tests. C'est le moyen le plus sûr d'éviter des
  régressions.

### Gaps
- Je n'ai pas vérifié la licence de chaque échantillon de test et de fixture (`tests/fixtures/studio`) avant une
  éventuelle reprise.

---

## Q4. Architecture Workbench pour l'intégration future d'un « panneau Studio Animation » : noms confirmés par le code

### Takeaway
**Aucun** des noms `ToolProtocol`, `ToolExecutor`, `MissionEngine`, `AgentLoop`, `READ_BEFORE_WRITE` et `VFS` n'existe
comme symbole (recherche exhaustive par `grep`). Leurs **équivalents réels** sont les suivants :

| Nom de la spécification | Équivalent réel |
|---|---|
| VFS | `direct/lib/vfs.ts`, stocké en IndexedDB |
| ToolProtocol | `DirectTool` et `TOOLS`, dans `direct/lib/tools.ts` |
| ToolExecutor et AgentLoop | `runAgent()`, dans `direct/lib/agent.ts` |
| MissionEngine | `server/agent/mission.ts` (`MISSION_STAGES`, `MissionReport`) et `AgentOrchestrator` côté serveur |
| ToolFirewall | `toolFirewall()`, qui existe sous ce nom dans `server/jev/omni/toolfw.ts` |
| READ_BEFORE_WRITE | n'est qu'une **consigne de prompt**, sans contrôle dans le code |

### Cited Findings
**VFS**
- `direct/lib/vfs.ts` se présente comme un « Virtual workspace stored in the browser (IndexedDB) ». Fonctions :
  `normPath`, `files`, `getFile`, `writeText`, `writeBytes`, `removeFile`, `importBrowserFile`, `downloadZip`.
- Une portée par conversation est gérée par `CHAT_PREFIX = '@chat/'`, `setChatScope`, `scopeGate` et `acquireScope`.
- `isSource(f)` repère les sources par le préfixe `uploads/`.
- Base IndexedDB : `openrouter-workbench-direct`, magasin `kv` (`direct/lib/db.ts`). Le studio a sa propre base,
  `massamba-visual-studio` (`direct/lib/studio/blobs.ts`), et des clés `vs.*` (`direct/lib/studio/store.ts`, VS_KEYS).
- Sources : [B vfs.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/vfs.ts) ; [B db.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/db.ts) ; [B studio/blobs.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/studio/blobs.ts)

**Outils (équivalent de ToolProtocol)**
- Interface `DirectTool` : `name`, `description`, `parameters` (JSON Schema), `risk`, `assess`, `readOnly`, `label`,
  `preview`, `run(a, ctx)`. Les valeurs de risque sont `'read' | 'write' | 'delete' | 'execute' | 'external'`.
- Tableau `TOOLS` de **53 outils** intégrés, dont `filesystem.*`, `code.run`, `three.run`, `mission.stage`,
  `mission.report`, `timemachine.*` et `browser.*`. S'y ajoutent `toolByName`, `mcpTool` et `toolDefs`.
- Côté serveur, l'édition locale utilise `ALL_TOOLS`, `defineTool`, `ToolDef` et `ToolContext`
  (`server/tools/registry.ts`, `server/tools/types.ts`).
- Sources : [B tools.ts l.194-232, 705, 2720](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/tools.ts) ; [B server/tools/registry.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/tools/registry.ts)

**Boucle d'agent et missions**
- `export async function runAgent(` se trouve à la ligne 3066 de `direct/lib/agent.ts`.
- Les modes `safe`, `normal` et `autonomous` règlent les approbations : en mode `normal`, écriture, suppression et
  exécution demandent l'accord de l'utilisateur. `SAFE_HIDDEN` masque les outils d'écriture en mode `safe`.
- Les étapes de mission sont `analyse`, `plan`, `execution`, `test`, `review`, `correction`, `validation` et
  `delivery`, avec un verdict `PASSED | PARTIAL | FAILED` (`server/agent/mission.ts`).
- Le serveur porte `class AgentOrchestrator` à la ligne 169 de `server/agent/orchestrator.ts`.
- Sources : [B agent.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/agent.ts) ; [B server/agent/mission.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/agent/mission.ts) ; [B orchestrator.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/agent/orchestrator.ts)

**Pare-feu d'outils**
- `export function toolFirewall(o: { names, lane, reclass, text, attachments })` est défini dans
  `server/jev/omni/toolfw.ts`.
- Principe : « AVAILABLE ≠ EXPOSED ». Les outils exposés au modèle dépendent de la mission, par familles
  `TOOL_FAMILIES` (`server/jev/tools.ts`).
- Il est appelé à la ligne 104 de `direct/lib/omni.ts` (gouverneur « OMNIPOTENT V4.1 »).
- Sources : [B toolfw.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/omni/toolfw.ts) ; [B omni.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/omni.ts)

**Lire avant d'écrire**
- La règle n'existe que dans les prompts : agent.ts l.185 (« Read before editing ») et roles.ts l.64.
- L'outil `filesystem.write` écrase sans vérifier qu'une lecture a eu lieu : il note seulement `existed`. La
  protection repose sur l'approbation en mode `normal` et sur `timemachine.*`.
- Source : [B tools.ts l.798-826](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/tools.ts)

**Navigation et point d'insertion d'un panneau**
- Le groupe `sandbox` (« Bac à sable ») porte les vues `videogen`, `realize`, `prompts` et `lab3d` dans
  `direct/lib/nav.ts`.
- Le type `View` est défini dans `direct/lib/types.ts`, le routage se fait dans `direct/App.tsx` (lignes ~376-379).
- Une vue absente de la navigation retombe sur le cockpit.
- Sources : [B nav.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/nav.ts) ; [B App.tsx](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/App.tsx)

**Chargement de PixiJS dans le bac à sable « Réalisation »**
- PixiJS est déjà déclaré, chargé depuis esm.sh : `{ name: 'pixi.js', version: '8.22.0', license: 'MIT', url:
  esm('pixi.js@8.22.0') }`. Ce chargement se fait sans contrôle d'intégrité SRI : aucun `integrity` dans `realize/`.
- Source : [B realize.ts l.67](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/realize/realize.ts)

**Skills et protection des secrets**
- Le dépôt antérieur contient 80 skills dans `.claude/skills/`, dont `blender-*`, `scenario-sprite-animation`,
  `remotion-*`, `cinema-*`, `secret-detection` et `veille-permanente`.
- L'app embarque les skills intégrées `apex-credit-risk` et `frontend-design` (`direct/lib/builtinSkills.ts`).
- La clé OpenRouter est lue « ONLY » au moment de construire l'en-tête (`direct/lib/studio/net.ts`). L'exécution se
  fait dans une iframe à origine opaque (`direct/lib/sandbox.ts`).
- Sources : [B builtinSkills.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/builtinSkills.ts) ; [B sandbox.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/sandbox.ts)

### Inferences
- **Brancher le panneau sans recréer l'app** demande trois choses :
  1. une `View` `'animation'` ajoutée au groupe `sandbox` ;
  2. deux `DirectTool` (`animation.evaluate`, en lecture seule, et `animation.render`, en risque `write`) ;
  3. une famille `animation` dans `TOOL_FAMILIES`, pour que `toolFirewall` l'expose seulement quand la mission le
     demande.
- Les sorties passent par `writeBytes`/`writeText` sous `outputs/`, et le stockage binaire va dans une base IndexedDB
  dédiée, comme `massamba-visual-studio`.
- Comme `READ_BEFORE_WRITE` n'est pas appliqué par le code, notre `AnimationProjectService` doit l'appliquer
  lui-même : refuser d'écrire un chemin existant qui n'a pas été lu dans la session.
- Le chargement de PixiJS par esm.sh sans SRI contredit la spéc §5. Pour la production, il faut un module **épinglé et
  embarqué** (bundle Vite), pas une URL CDN.

### Gaps
- La version compilée (18) de l'app n'est pas dans le conteneur. Je n'ai pas pu confirmer que ces noms y sont
  identiques.
- Je n'ai pas exécuté l'app (Vite et Playwright e2e). La non-régression du Workbench (spéc §8) reste à faire au lot 1.

---

## Q5. Format du kit de décors (191 décors privés) : résolutions, convention de profondeur, masques, qualité des plaques, champs `fit`

### Takeaway
Les 191 décors sont complets. Chacun a `src`, `plate`, `depth`, `plateDepth` et `masks` ; 13 ont aussi `people`. Les
points mesurés :
- La profondeur est **relative**, normalisée 0-255 par image, avec **clair = proche**.
- Les masques suivent `scene_layers.py` : R = premier plan retiré (personnes, véhicules…), G = ciel, B = eau (255) ou
  végétation (128). Le cadrage de la mission disait « bleu = autre » : c'est inexact.
- Les sources sont **plus petites qu'annoncé** : médiane 1300×796, et non environ 2000×976.
- Les plaques font **1024 px de large**, avec une hauteur médiane de 656 px. Pour sortir en 1080×1920, il faut un
  agrandissement de 2,9× en médiane.
- `fit` vient d'une estimation par l'horizon. `floor` et `cx` restent aux valeurs par défaut sur plus de 93 % des
  décors.

### Cited Findings
- **Manifeste** ([kit] `decors.json`) : `version: 17df47bbbaf19c68`, 191 décors répartis en 4 parties (42, 49, 52, 48).
  - Chaque entrée porte `nom`, `id`, `partie`, `fit{mH, floor, cx[, blur]}` et `fichiers{src, depth, plate,
    plateDepth, masks[, people]}`.
  - La même version figure dans les 4 paquets envoyés par l'utilisateur
    (`massamba-troupe-1..4.js`, format `self.__MASSAMBA_TROUPE__.push({kind:"massamba-troupe", version:"17df47bbbaf19c68", part, of:4, decors:[…data:image…]})`).
  - [mesure]
- **Résolutions** ([mesure], PIL sur les 191 décors) :
  - `src` : largeur 992-2728 (médiane 1300), hauteur 660-1080 (médiane 796), rapport 1,18-3,11 (médiane 1,56) ;
    144 décors sur 191 entre 1000 et 1499 px de large ;
  - `plate` : 1024 de large, hauteur 329-869 (médiane 656) ;
  - `depth`, `plateDepth` et `masks` : 512 de large (L 8 bits pour les profondeurs, RGB pour les masques) ;
  - `people` : 512 de large, en RGBA ;
  - aucun écart de rapport d'aspect entre `src`, `plate` et `masks`.
- **Convention de profondeur** ([mesure]) :
  - la moyenne des 15 % de lignes du bas dépasse celle des 15 % du haut sur **381 des 382** cartes (`depth` et
    `plateDepth`), donc clair = proche ;
  - chaque carte est étirée de 0 à 255, ce qui en fait une profondeur relative (disparité), non métrique ;
  - `depth` et `plateDepth` diffèrent (écart absolu moyen de 39,6 sur `marche`) : elles mesurent la source avec ses
    figurants, puis la plaque.
  - Producteur : Depth Anything V2 Small, Apache-2.0. Source : [B scene_layers.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/scene_layers.py)
- **Masques** ([mesure]) :
  - R est quasi binaire : 72,6 % des pixels à 0, 26,1 % à 255, environ 1,3 % intermédiaires (bords). Il couvre en
    moyenne **27,4 %** de l'image, jusqu'à 76,8 % ;
  - G (ciel) couvre en moyenne 14,5 %, jusqu'à 38,9 % ;
  - B vaut {0,128} sur 127 décors et {0,128,255} sur 47 ;
  - c'est la convention de `scene_layers.py` : « R premier plan, G ciel, B eau 255 / végétation 128 » ;
  - le premier plan regroupe les classes ADE20K personne, voiture, bateau, bus, camion, avion, van, navire, deux-roues,
    animal et vélo ;
  - sur la planche de contrôle, les palmiers de `marcory-2` sont bien à B = 128.
  - Source : [B scene_layers.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/scene_layers.py)
- **`people.png`** ([mesure], 13 décors, tous de la partie 1) :
  - c'est un masque doux des figurants, codé en **gris dans RGB** (R = G = B), avec une corrélation de 0,70 avec le
    masque R ;
  - l'alpha vaut 255 partout sauf sur la première ligne et la première colonne (80) : c'est un artefact, l'alpha n'est
    pas le masque ;
  - `livingSet.ts` s'en servait pour faire onduler les figurants.
  - Source : [B livingSet.ts l.195-201, 316](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/studio/livingSet.ts)
- **Qualité des plaques** ([mesure], planche de contrôle de 4 décors) :
  - sur `marche` et `maquis`, le différentiel source/plaque vaut 62,1 et 42,4 dans le masque R contre 3,5 et 2,9 hors
    masque : les figurants ont bien été retirés ;
  - visuellement, `maquis` est propre ;
  - `marche-villageois-boundiali` et `marcory-2` montrent de **larges zones barbouillées et floues** là où la foule ou
    les voitures ont été effacées (LaMa, Apache-2.0, fenêtres de 512×512).
  - Source du procédé : [B scene_layers.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/scene_layers.py)
- **Sens de `fit`**, d'après le code qui le calcule (`ground.horizon_fit`) :
  - *« on the ground plane, one pixel at row y measures eye / (y - y_horizon) metres »* ;
  - avec `eye = 1.6` et `feet = 0.95`, on obtient `mH = clip(1.6·H/(y_f − y_h), 2, 8)` ;
  - l'horizon est lu sur les têtes des passants, sinon sur la ligne des têtes de la foule, sinon sur le bout du sol
    praticable ;
  - `cx` vaut 0,5 par défaut. `mH` est donc la hauteur en mètres de l'image au plan des pieds, et `floor` la ligne des
    pieds en fraction de la hauteur depuis le haut.
  - Source : [B ground.py l.255-291](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/ground.py)
- **Valeurs réelles de `fit`** ([mesure]) :
  - `mH` va de 1,8 à 8 (médiane 4,43 ; déciles 2,66 et 7,38 ; 142 valeurs distinctes) ;
  - **12 décors sont bloqués au plafond de 8,0** et 4 au plancher de 2,0, donc leur échelle n'est pas fiable ;
  - `floor` vaut 0,95 sur **180 décors sur 191** (autres valeurs : 1,05, 1, 0,88, 0,86, 0,92, 1,1, 0,75) ;
  - `cx` vaut 0,5 sur **178 décors sur 191** ;
  - `blur` (1,5 ou 2) n'apparaît que sur 5 décors : hôpital, taxi, salon de coiffure, douane, bureau.
- **Usage dans le code antérieur** :
  - `livingSet.ts` : `ppm = ih / mH`. L'image est placée pour que la ligne `floor·h` tombe sur le sol (Y = 0) et la
    colonne `cx·w` sur X = 0. Elle est prolongée **en miroir** sur les côtés et vers le haut ; sous l'image, la dernière
    bande est étirée et non retournée.
  - Blender (`world.py`, `scene.py`) : `Wm = mH·W/H`, `x0 = −cx·Wm`, `ztop = floor·mH`. Le décor est projeté depuis une
    caméra de référence C0 sur un relief tiré de la profondeur.
  - Sources : [B livingSet.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/studio/livingSet.ts) ; [B world.py l.2416-2437](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/world.py)
- **Taille des personnages à l'échelle du décor** ([mesure]) : un personnage de 1,60 m mesure de **65 à 620 px**
  (médiane **226 px**) sur la plaque. La bible donne `taille_m` de 1,08 à 1,84 m pour 54 personnages, dont 7 ont une
  planche, 32 une galerie, 7 un catalogue et 8 sont « à dessiner » ([troupe.json](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/f98a1ed/studio-troupe/troupe/troupe.json)).

### Inferences
- **Résolution.** Une fenêtre 9:16 tient toujours dans la plaque (191 sur 191, car la plaque est en paysage), mais sa
  hauteur médiane de 656 px impose ×2,93 pour 1920 et ×1,95 pour 1280. Pistes :
  - composer le **fond en 1280** (720×1280) et dessiner les personnages en vectoriel à pleine résolution ;
  - ou, pour du 1080×1920, agrandir la plaque en Lanczos avec un léger flou de profondeur (le champ `blur` existe déjà),
    ce qui justifie aussi un net personnage/fond ;
  - ou utiliser `src` (796 px en médiane, jusqu'à 1080), avec ses figurants vivants au lieu de la plaque.
- **Perspective.** La formule `horizon_fit` donne directement la **taille en pixels d'un personnage selon la ligne où
  sont ses pieds** : `y_h = y_f − 1,6·H/mH`, puis `h_px(y) = taille_m·(y − y_h)/1,6`. On obtient une mise à l'échelle
  correcte quand un personnage avance ou recule, sans moteur 3D.
- Les 12 décors à `mH = 8` et les décors à `floor` par défaut doivent être signalés « échelle à vérifier » dans
  l'AssetRegistry. La mesure de l'horizon peut être refaite à partir de `masks` R (têtes des figurants) et de
  `plateDepth` (gradient du sol).
- Les plaques barbouillées sont à repérer automatiquement : faible variance haute fréquence dans le masque R par
  rapport au reste de l'image. On choisit alors de cadrer hors de ces zones, ou de les couvrir par nos personnages ou
  par les figurants de `src`.

### Gaps
- La licence et la provenance des peintures des décors ne sont pas documentées dans le manifeste : aucun champ
  `licence` ni `origine`. Or la spéc exige licence, origine et hash dans l'AssetRegistry. C'est à demander à
  l'utilisateur, qui les présente comme son propre art.
- La valeur `floor > 1` (pieds sous le bord de l'image, 6 décors) n'a pas été vérifiée visuellement un par un.

---

## Q6. Inventaire des outils du conteneur et bancs d'essai

### Takeaway
On peut tout faire dans ce conteneur :
- Chromium 141 en mode headless offre **WebGL1 et WebGL2** par logiciel (ANGLE, Vulkan, SwiftShader), avec une texture
  maximale de 8192. Il n'a **pas de WebGPU**.
- Ce Chromium **n'encode pas le H.264 ni l'AAC** en WebCodecs. Il n'encode que VP8, VP9, AV1 et Opus.
- FFmpeg 6.1.1 (build `--enable-gpl`) a libx264 et aac.

Le chemin de production est donc : rendu WebGL dans Chromium, capture de chaque image, puis tube vers ffmpeg
libx264/aac. Mesuré à **190 ms par image en 1080×1920** et à **102 ms en 720×1280**, export compris, sur un seul
processus. C'est environ 13 fois plus rapide que Blender Cycles (2,57 s par image en 576×1024).

### Cited Findings
- **Machine** ([mesure], `lscpu`, `free`, `df`) :
  - 4 vCPU Intel Xeon à 2,1 GHz avec AVX-512 (f, dq, bw, vl, vnni, bf16, fp16) et AMX (bf16, int8, tile) ;
  - 15 Go de RAM et 25 Go libres sur `/`.
- **Node et paquets** ([mesure]) :
  - Node v22.22.0 et npm 10.9.4 ;
  - Playwright 1.56.1 global (`/opt/node-tools/node_modules/playwright`) ; navigateurs dans `/opt/pw-browsers`
    (`chromium-1194`, `chromium_headless_shell-1194`, `ffmpeg-1011`), via `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`,
    déjà défini dans l'environnement ;
    version 141.0.7390.37 ;
  - `npm view pixi.js` : 8.22.0, la dernière (publiée le 01/10/2026), précédée de 8.21.0 (17/09/2026) ; licence MIT ;
    76 Mo décompressés.
- **WebGL** ([mesure], `getContext('webgl'|'webgl2')` + `WEBGL_debug_renderer_info`, identique en headless shell et en
  Chromium complet) :
  - renderer : `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)` ;
  - WebGL1 : OpenGL ES 2.0 ; WebGL2 : OpenGL ES 3.0 ;
  - `MAX_TEXTURE_SIZE` 8192, `MAX_RENDERBUFFER_SIZE` 8192, `MAX_VIEWPORT_DIMS` 8192×8192, 32 unités de texture ;
  - `MAX_SAMPLES` 4 (MSAA en WebGL2) ;
  - `EXT_color_buffer_float` présent en WebGL2, absent en WebGL1 ;
  - OffscreenCanvas présent ;
  - `navigator.gpu` (WebGPU) **absent**, y compris avec `--enable-unsafe-webgpu`.
- **WebCodecs et MediaRecorder** ([mesure], page servie en `http://127.0.0.1`, `isSecureContext = true`) :
  - `VideoEncoder.isConfigSupported` : avc1 en 720p et en 1080p **false** ; vp09, vp8 et av01 **true** ;
  - `AudioEncoder` : mp4a.40.2 (AAC) **false**, opus **true** ;
  - MediaRecorder : `video/mp4;codecs=avc1` false, `video/webm;codecs=vp9` true ;
  - sur `about:blank` (contexte non sécurisé), `VideoEncoder` est **indéfini**.
- **Rendu WebGL2** ([mesure] : quad plein écran texturé 2048×1024 + 120 sprites alpha 512², `readPixels` RGBA) :

  | Variante | Résolution | Image + synchronisation | Avec lecture complète `readPixels` |
  |---|---|---|---|
  | Chromium complet | 1080×1920 | 35,6 ms | 62,2 ms (16 i/s) |
  | Chromium complet | 720×1280 | 20,4 ms | 23,5 ms (42,6 i/s) |
  | headless shell | 1080×1920 | – | 90-95 ms |

- **Export de bout en bout** ([mesure], headless shell, 40 sprites, 30 images, un seul onglet, en séquence, tube vers
  `ffmpeg -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p`) :

  | Méthode | 1080×1920 | 720×1280 |
  |---|---|---|
  | capture JPEG q95 de l'élément | **190 ms/image** | **102 ms/image** |
  | capture PNG | 288 | 159 |
  | `readPixels` brut + base64 + `vflip` | 418 | 142 |

  - Vérification `ffprobe -count_frames` : `h264 1080x1920 30/1 nb_read_frames=30` et `h264 720x1280 30/1
    nb_read_frames=30`.
- **FFmpeg** ([mesure], `ffmpeg -version`, `-encoders`) :
  - version 6.1.1-3ubuntu5 ; configuration avec `--enable-gpl --enable-libx264 --enable-libx265 --enable-libsvtav1
    --enable-libaom --enable-libvpx --enable-libopus --enable-libmp3lame --enable-librubberband --enable-libvidstab
    --enable-libass --enable-libfreetype`… ;
  - encodeurs présents : `libx264`, `libx264rgb`, `libx265`, `libsvtav1`, `libaom-av1`, `libvpx(-vp9)`, `ffv1`,
    `prores_ks`, `png`, `mjpeg`, `aac`, `libopus` et `libmp3lame` ;
  - `ffprobe` : `/usr/bin/ffprobe`.
- **Absents** ([mesure], `which`) : Blender, Rhubarb, Piper, espeak-ng, sox, Inkscape, Krita, Synfig et Godot.
  - Le venv Python ne contient que torch 2.14.1+cpu, numpy 2.5.4 et pillow 12.3.0 : pas d'onnxruntime, d'opencv ni de
    scipy.
  - gcc et cmake sont présents.
  - `sd-cli` (stable-diffusion.cpp) est compilé dans le scratchpad, d'après la mission.
- **Référence antérieure de vitesse** : Blender Cycles CPU à 2,57 s par image en 576×1024. L'aperçu à demi-résolution
  tournait à 0,68 s par image, et EEVEE logiciel à environ 150 s par image.
  - Source : [B video_3d_etat_des_acquis.md](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/research_notes/Animer%20Blender%20par%20prompt/video_3d_etat_des_acquis.md)

### Inferences
- **Export dans le conteneur** : le chemin `encode.ts` de l'app (WebCodecs H.264 + mp4-muxer) **ne marche pas dans ce
  Chromium**, qui n'a pas les codecs propriétaires. L'ExportAdapter du conteneur doit encoder côté Node avec ffmpeg.
  Dans le Chrome ou l'Edge de l'utilisateur, on garde WebCodecs avec un repli VP9/Opus, et le RenderAdapter détecte la
  capacité réelle (`isConfigSupported`) au lieu de la supposer.
- **Ordre de grandeur pour un sketch de 45 s à 30 i/s** (1 350 images) :
  - 1 350 × 0,19 s ≈ **4,3 min** sur un seul onglet en 1080×1920 ;
  - environ 2,3 min en 720×1280 ;
  - jusqu'à 3 ou 4 fois moins avec 4 onglets ou processus sur des plages d'images disjointes, ce qui n'est possible
    que si `evaluate(t)` est pur ;
  - à comparer à environ 58 min en Blender Cycles à 2,57 s par image.
- La capture JPEG q95 est la plus rapide, mais elle ajoute une génération de compression avant x264. Pour la version
  finale, on peut préférer la capture PNG (+50 % de temps) ou `readPixels` dans un `SharedArrayBuffer` relayé par CDP.
  La comparaison PSNR/SSIM avec et sans JPEG reste à faire.
- **Licence FFmpeg.** La build est en GPL. L'utiliser localement pour encoder nos vidéos ne rend pas les vidéos GPL ;
  la question ne se pose qu'en cas de redistribution de ffmpeg (inférence, à confirmer sur https://ffmpeg.org/legal.html,
  page non relue ici). Il faut consigner `ffmpeg -version` et `-buildconf` dans tool-manifest.json (spéc §9).
- **Pas de voix locale.** Piper est absent. Les voix viendront des fichiers audio de l'utilisateur, ou d'une
  installation de Piper (MIT) avec des voix dont la licence est à vérifier une par une. La bible référence les voix
  Piper `siwis`, `jessica`, `tom`, `gilles` et `pierre`.

### Gaps
- Le gain réel de plusieurs onglets en parallèle (SwiftShader utilise déjà plusieurs fils) n'a pas été mesuré.
- PixiJS 8 n'a pas été testé sous SwiftShader. Seul du WebGL2 brut l'a été. Le banc PixiJS est pour le lot 1.
- La qualité, par PSNR, de la chaîne JPEG q95 puis x264 crf 18 n'a pas été mesurée.

---

## Ce que nous greffons dans notre moteur

Il s'agit de notre propre code antérieur, réécrit, et d'algorithmes publics réimplémentés. Aucun code tiers n'est
copié.

### G1. TimelineEvaluator pur avec ressorts analytiques (remplace `springPose`)
Une cible par canal, constante par morceaux : clés `(t_k, y_k)` triées, avec y₀ la valeur de repos. La solution de
l'oscillateur amorti est une **superposition exacte de réponses à des échelons** :

```
x(t) = y0 + Σ_{k : t_k ≤ t} (y_k − y_{k−1}) · S(t − t_k)
ζ < 1 : S(τ) = 1 − e^{−ζωτ} [cos(ω_d τ) + (ζ/√(1−ζ²)) sin(ω_d τ)],  ω_d = ω√(1−ζ²)
ζ = 1 : S(τ) = 1 − (1 + ωτ) e^{−ωτ}
vitesse : S'(τ) = (ω/√(1−ζ²)) e^{−ζωτ} sin(ω_d τ)   |   ω² τ e^{−ωτ}
```

- On reprend les paramètres de la table `SPRINGS` antérieure pour garder le « look » : bouche ω=38 ζ=0,9, tête
  ω=16 ζ=0,7, inclinaison ω=9 ζ=0,8, bras ω=13 ζ=0,62.
- Optimisation : une clé dont τ dépasse `τ_s = ln(10⁴)/(ζω)` est absorbée dans une ligne de base, par somme
  préfixe. Une recherche binaire sur `t` donne alors un coût O(log K + clés actives).
- Les courbes continues (respiration, regard) restent des fonctions analytiques de t. Les clés de pose utilisent une
  interpolation **Catmull-Rom centripète**, puis S(τ) pour le dépassement et le follow-through.
- Gain par rapport à l'existant :
  - indépendant de la fréquence d'images ;
  - scrub avant et arrière identique au bit près ;
  - plus de claquement au retour arrière (écart mesuré auparavant : 0,24).
- Test : `hash(evaluate(t))` identique quel que soit l'ordre d'appel (aléatoire, avant, arrière) et à 24, 25, 30 et
  60 i/s pour un même t.

### G2. Rig découpé en segments (spéc §6), en remplacement des cartes à 3 os et de l'ARAP dense
- Hiérarchie : bassin, torse, tête, puis de chaque côté bras, avant-bras et main, puis cuisse, jambe et pied. Chaque
  segment est un sprite avec un **pivot anatomique** et un angle local θ borné par `[θmin, θmax]` (reprise des limites
  de `skeleton.ts`).
- Pas de trous aux articulations : chaque segment porte une **coiffe ronde** de rayon r égal à la demi-largeur, centrée
  sur son pivot proximal. Elle est dessinée sous le parent, donc la jointure reste couverte pour tout angle.
- **IK à 2 os** (reprise de `solver.ts` en 2D), avec les longueurs a et b, la cible T et
  `d = clamp(|T|, |a−b|+ε, a+b−ε)` :
  `θ1 = atan2(T_y, T_x) ∓ acos((a² + d² − b²)/(2ad))` et `θ2 = ±(π − acos((a² + b² − d²)/(2ab)))`, le signe étant
  donné par le côté du coude ou du genou.
- **Verrou de pied** : pendant une phase de contact `[t_a, t_b]`, la cible de cheville est fixée à l'ancre au sol. La
  métrique de glissement vaut `max_t |x_cheville(t) − ancre|`, avec un seuil de 2 px par image.
- Mélange de poses **sur les angles** (somme pondérée par couches : base, posture, geste, émotion additive, respiration)
  au lieu des fondus entre dessins. Il n'y a plus de pop.
- Si une planche de l'utilisateur doit vraiment se plier, on garde ARAP à froid, avec un nombre fixe d'itérations
  depuis le repos, sur ≤ 400 sommets et une Cholesky **creuse**. Le résultat est déterministe et le coût visé reste
  sous 5 ms. Mesuré pour l'existant : 75 ms et un écart de 15,7 px.

### G3. Budget de mouvement localisé, prévu avant le rendu
- Cible issue de `tiktok_reference.json` : mouvement entre 0,0098 et 0,027, couverture entre 0,15 et 0,29, soit 10 à
  19 zones sur 64 en mouvement par pas de 1/12 s.
- Prédiction bon marché : on rastérise en 96×170 les boîtes des segments qui bougent entre t et t + 1/12. Une zone est
  comptée si `Σ aire_déplacée·contraste > 0,012·aire_zone`. On en tire `cov_pred(plan)`.
- Ajustement : si `cov_pred > 0,29`, on baisse d'abord les gains **secondaires** (balancement global, respiration du
  torse), jamais les gestes principaux ni la bouche. Si `cov_pred < 0,15`, on ajoute de la micro-vie : clignements,
  regards, mains.
- La caméra est **posée** par défaut, comme le téléphone de la chaîne. Les mouvements de caméra sont rares, motivés par
  l'action et bornés.
- Contrôle après rendu : `measureFrames`, avec le même code que la chaîne, sur un rendu **complet**. On n'utilise
  jamais un aperçu qui répète des images (biais de −14 % et −20 % mesuré antérieurement).

### G4. Actions réutilisables tirées de la mocap, projetées en 2D
- Sources : CMU (« free for all uses », jamais redistribué) et 100STYLE (CC BY 4.0, crédit « The 100STYLE Dataset -
  Ian Mason »). Les clips sont choisis à la main par étiquette de `direction-vocab.json`.
- Projection planaire de chaque os : `θ = atan2(v·e_y, v·e_x)` dans le plan de la caméra. Le mouvement de racine vient
  des hanches projetées, avec les contacts détectés par `|v_pied| < seuil`.
- Les clips sont rééchantillonnés en courbes analytiques (G1) puis stockés comme clips d'angles versionnés. Cela
  réalise l'idée notée dans `texte_vers_mouvement_agents_bpy.md`, mais en 2D découpé.

### G5. Piste de visèmes en français (spéc §6) éditable
- Classes : M/B/P, A, E, I, O, U, F/V, S/Z, CH/J, L/R, T/D/N, K/G, plus repos.
- Le texte est converti en phonèmes par des **règles graphème-phonème du français** (à écrire), puis regroupé en
  classes.
- Alignement : DTW entre la suite des classes (durées a priori par classe) et les caractéristiques audio reprises
  d'`audioVisemes.ts` (énergie, voisement, centroïde ou formants, trames de 20 ms). On applique une avance de 40 ms.
- Coarticulation : chaque poids de forme suit le ressort analytique de la bouche (ω=38, ζ=0,9).
- Garantie : sur M/B/P, la bouche reste fermée au moins 60 ms. C'était la seule apport utile de Rhubarb, mesuré
  antérieurement à 2,25 fois plus de fermetures dans les mots à m/b/p.
- Sortie `visemes.json` : `{t0, t1, classe, poids, source: auto|manuel}`. Une correction manuelle prime toujours. Le
  décalage mesuré est publié et n'est jamais déclaré « parfait ».

### G6. Décor 2.5D sans miroir, à l'échelle métrique
- Échelle : `y_f = floor·H` et `y_h = y_f − 1,6·H/mH`. Pour un personnage dont les pieds sont à la ligne y :
  `h_px(y) = taille_m·(y − y_h)/1,6`, avec la perspective juste en avançant ou en reculant.
- Parallaxe : on découpe la `plateDepth` en 3 à 5 couches. Le ciel (masque G) est à d = 0. Décalage d'une couche :
  `Δx = cam_dx·(d − d_focus)·k`.
- La fenêtre 9:16 est **bornée** à la plaque : aucune extension en miroir, et la plaque la contient toujours (191 sur
  191).
- Les décors à `mH ∈ {2, 8}` sont signalés « échelle à vérifier ». Les plaques barbouillées sont repérées par la
  variance des hautes fréquences dans le masque R.
- Fond composé en 1280 de haut si la plaque fait moins de 700 px. Les personnages sont rendus à la résolution finale.

### G7. Rendu exact et ExportAdapter du conteneur
- L'image n est calculée par `evaluate(n/fps)` : WebGL2 (PixiJS épinglé et embarqué) dans Chromium headless, puis
  capture, puis tube vers `ffmpeg -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -ar 48000`. On répartit sur 4
  processus par plages d'images.
- Vérification :
  - `ffprobe -count_frames` donne exactement N images, et la durée et la piste audio sont présentes ;
  - hachage d'un échantillon d'images pour les tests de non-régression ;
  - journaux et manifeste (`ffmpeg -version` / `-buildconf`).
- Le RenderAdapter **détecte** les capacités (`VideoEncoder.isConfigSupported`, présence de ffmpeg, pont Blender
  `127.0.0.1:8765`). Si une capacité manque, il est marqué `BLOCKED` ; il ne simule jamais.

### G8. AnimationQualityGate (spéc §8), en reprenant `gate.py`
- Contrôles techniques repris de `gate.py` :
  - nombre d'images exact ;
  - écart image/son ≤ 40 ms ;
  - −14 ± 1 LUFS, crête ≤ −0,5 dBFS ;
  - premier mot ≤ 0,5 s ;
  - aucun saut de lumière hors coupe.
- Fourchettes de rythme **à deux côtés** issues de `tiktok_reference.json`.
- Ajouts propres au moteur :
  - aucun NaN ;
  - continuité `|x(t+h) − 2x(t) + x(t−h)| ≤ a_max·h²` par canal, hors coupes ;
  - scrub reproductible (hachages identiques en avant et en arrière) ;
  - glissement des pieds ≤ 2 px par image pendant les contacts ;
  - visèmes M/B/P fermés à ≥ 90 % ;
  - poses extrêmes dans les limites.

### G9. Intégration future dans le Workbench (sans recréer l'app)
- Ajouter une `View` `'animation'` au groupe `sandbox` (`nav.ts`, `types.ts`, `App.tsx`).
- Ajouter les `DirectTool` `animation.evaluate` (lecture seule) et `animation.render` (risque `write`), ainsi qu'une
  famille `animation` dans `TOOL_FAMILIES`, pour que `toolFirewall` les expose à la demande.
- Les sorties vont dans le VFS via `writeBytes` sous `outputs/`, et les binaires dans une base IndexedDB dédiée.
- Appliquer **dans notre service** la règle de lecture avant écriture, que le code existant n'applique pas.
- Écrire `tool-manifest.json` et `THIRD_PARTY_NOTICES.md` : PixiJS MIT 8.21.0 ou 8.22.0 épinglé, ffmpeg GPL local,
  CMU, 100STYLE CC BY 4.0.
