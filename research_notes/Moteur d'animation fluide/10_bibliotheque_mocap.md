# 10 — Bibliothèque mocap BVH de la troupe (jeu comique, usage commercial)

Conventions des notes précédentes :
- **[vérifié]** : licence lue à la source le 16/10/2026 (citation exacte ci-dessous).
- **[mesure]** : chiffre calculé dans ce conteneur le 16/10/2026 par nos scripts.
- `S` = `/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad`.
- Scripts écrits pour cette note (**aucun code tiers copié**) :
  - `S/scripts/mocap/remote_zip.py` : lit le répertoire central d'un ZIP distant par requêtes HTTP Range et n'extrait que
    les membres voulus (contrôle CRC).
  - `S/scripts/mocap/analyse_bvh.py` : parseur BVH + cinématique directe numpy + mesures.
  - `S/scripts/mocap/construire_bibliotheque.py` : sélection éditoriale, copie et manifeste.
  - `S/scripts/mocap/planche_batons.py` : planche de contrôle en bâtons.

---

## En bref

- **64 clips BVH** (dont **5 longues séquences** de parole ou d'attente), **37 min 28 s** de mouvement, **117 Mo**.
  Ils sont rangés dans `studio-troupe/sorties/cache/mocap/`, un dossier **git-ignoré** (règle `sorties/` de
  `studio-troupe/.gitignore`).
- Le manifeste `mocap.json` décrit chaque clip :
  - identité : id, fichier, source, licence ;
  - mesures : images, i/s, durée, image de départ ;
  - contenu : catégorie, description, usages en sketch ;
  - analyse numérique et indices de reciblage ;
  - sha256 du fichier.
- **4 sources, toutes utilisables commercialement** [vérifié] :

  | Source | Clips | Licence |
  |---|---|---|
  | CMU Graphics Lab, conversion BVH Hahne | 41 | « free for all uses », revente des données interdite |
  | 100STYLE | 15 | CC BY 4.0 |
  | ACCAD Open Motion Project | 4 | CC BY 3.0 |
  | BVH d'exemple d'Animated Drawings | 4 | MIT |

  - Les 4 clips d'Animated Drawings servent de **références de portage** : leurs configs `motion/*.yaml` d'origine
    existent.
- **Volume téléchargé : ≈ 210 Mo** [mesure], sous le plafond de 600 Mo.
  - ≈ 180 Mo pour le clone partiel CMU.
    - Une partie vient d'un `git ls-tree -l` qui a déclenché le téléchargement paresseux d'objets (« blobs ») inutiles.
      Il a été interrompu.
  - ≈ 25 Mo extraits un par un de l'archive 100STYLE de 1,47 Go.
  - ≈ 1 Mo pour ACCAD.
  - Les copies de travail ont été supprimées ensuite pour garder plus de 4 Go libres sur le disque.
- **Catégories couvertes** :

  | Catégorie | Clips | Catégorie | Clips | Catégorie | Clips |
  |---|---|---|---|---|---|
  | marcher | 12 | danse/victoire | 8 | colère | 7 |
  | quotidien | 6 | bras croisés/attente | 5 | geste de parole | 5 |
  | sursaut | 4 | s'asseoir | 3 | émotion | 3 |
  | salutation | 3 | hausser les épaules | 2 | rire | 2 |
  | chute | 2 | pointer | 1 dédié, + 2 pointages dans d'autres clips | se gratter la tête | 1, approché |

- **Deux manques réels** dans les sources commerciales :
  - « se gratter la tête » : on part de « se coiffer », CMU 79_84.
  - un « pointer » court et isolé : on coupe dans 14_24, 139_25 ou 23_21.
  - Voir « Manques et pistes ».

---

## 1. Où sont les fichiers

```
studio-troupe/sorties/cache/mocap/          (git-ignoré — NE JAMAIS COMMITTER)
├── mocap.json                              manifeste (64 clips, sources, conventions, résumé)
├── cmu/            41 × .bvh   (noms d'origine : 141_21.bvh …)
├── 100style/       15 × .bvh   (ArmsFolded_ID.bvh …)
├── accad/           4 × .bvh   (Female1_D3_ConversationGestures.bvh …)
├── animated_drawings/ 4 × .bvh (dab.bvh, wave_hello.bvh, zombie.bvh, jesse_dance.bvh)
└── index/                       pour choisir d'autres clips plus tard sans tout retélécharger
    ├── cmu-mocap-index-text.txt        index des ~2 550 mouvements CMU avec descriptions
    ├── cmu-bvh-READMEFIRST-hahne.txt   texte de licence et notes de conversion de Hahne
    ├── 100style-membres.json           100 styles × (FW, BW, SW, FR, BR, SR, ID, TR…) avec tailles
    └── accad-*-membres.jsonl           contenu des ZIP BVH Female1 / Male1 / Male2
```

### Champs du manifeste, pour le moteur TypeScript

Chaque entrée de `clips[]` contient :

- `id`, `file` (relatif au dossier `mocap/`), `source`, `licence`.
- `frames`, `fps`, `duration` (s).
- `start_frame` : **1 pour CMU**, car l'image 0 est une T-pose ajoutée par Hahne.
- `category`, `description`, `suggested_use[]`.
- `long_sequence` et `paired_with` (paires de dialogue synchrones CMU 18/19).
- `numeric_description` : une phrase française, par exemple *« 2.3 s, sur place, debout ; segments les plus actifs :
  avant-bras D 111°/s, avant-bras G 106°/s, bras D 98°/s ; mains symétriques. »*
- `analysis` :
  - `skeleton_schema`, `up_axis`, `body_height_units`, `approx_meters_per_unit` ;
  - `root` : déplacement net, chemin parcouru, vitesse, rotation cumulée ;
  - `hips_height_ratio` : avec `frac_cuisses_horizontales`, détecte assis ou accroupi ;
  - `segment_activity_deg_s` : vitesse angulaire de chaque segment dans le repère du bassin, moyenne et p95 ;
  - `extremity_speed_heights_s` : vitesse des poignets, chevilles et tête en tailles de corps par seconde ;
  - `hands` : fraction du temps avec une main au-dessus de la tête ou près de la tête ;
  - `useful_range_s` et `activity_peak_s` : où couper ;
  - `suspicious_jumps` : sauts d'image ;
  - `frozen_joints` : joints figés, défauts de capture.
- `retarget_hints` :
  - `up`, `groundplane_joint`, `forward_perp_joint_vectors` : même format que les configs `motion/*.yaml` d'Animated
    Drawings ;
  - correspondance des noms de joints.
- `remarks[]` : défauts connus, par exemple une jambe figée ou des poignets non capturés.
- `sha256`, `bytes`.

---

## 2. Sources retenues et licences [vérifié le 16/10/2026]

### 2.1 CMU Graphics Lab Motion Capture Database — 41 clips

- Page d'accueil de http://mocap.cs.cmu.edu/ : *« This dataset of motions is free for all uses. »*
- Plus bas sur la même page : *« This data is free for use in research projects. You may include this data in
  commercially-sold products, but you may not resell this data directly, even in converted form. If you publish results
  obtained using this data, we would appreciate it if you would send the citation [...] and also would add this text to
  your acknowledgments section: The data used in this project was obtained from mocap.cs.cmu.edu. The database was
  created with funding from NSF EIA-0196217. »*
- Conversion BVH « MotionBuilder-friendly » 2010 de **Bruce Hahne** (cgspeed). La page CMU y renvoie (« Bruce Hahn has
  released both 3D Studio Max and MotionBuilder bvh's, hosted at cgspeed »).
  - Son READMEFIRST : *« CMU places no restrictions on the use of the original dataset, and I (Bruce) place no
    additional restrictions on the use of this particular BVH conversion. »*
  - Copie dans `index/cmu-bvh-READMEFIRST-hahne.txt`.
- Récupération :
  - depuis le miroir GitHub `una-dinosauria/cmu-mocap` (commit `09a07f54`), qui reprend tel quel le ZIP de cgspeed ;
  - avec un clone **partiel** (`--filter=blob:none --depth 1`) et un *sparse-checkout* des seuls fichiers retenus.
- **Obligations pour nous** :
  1. Les vidéos rendues sont autorisées, y compris monétisées.
  2. **Ne jamais redistribuer les .bvh** : pas de dépôt public, pas de pack vendu, même convertis.
  3. Mettre la phrase de remerciement CMU dans les crédits. Elle est demandée pour les publications ; c'est la pratique
     sûre.

### 2.2 100STYLE — 15 clips

- Zenodo, record **8127870** (https://zenodo.org/records/8127870), métadonnées `license: cc-by-4.0`.
- Auteurs : **Ian Mason, Sebastian Starke, Taku Komura**.
- Article : *Real-Time Style Modelling of Human Locomotion via Feature-Wise Transformations and Local Motion Phases*,
  Proc. ACM CGIT 5(1), 2022, doi:10.1145/3522618.
- Récupération sans télécharger l'archive entière :
  - `100STYLE.zip` pèse 1 468 515 354 octets, et le serveur accepte les requêtes HTTP Range (réponse `206`).
  - `remote_zip.py` lit le répertoire central de l'archive (1 828 entrées, 100 styles).
  - Il télécharge ensuite **uniquement** les 15 membres compressés voulus et vérifie leur CRC.
- **Obligations (CC BY 4.0)** :
  - citer auteurs, titre et lien ;
  - donner le lien de la licence ;
  - **indiquer que le mouvement a été modifié** (reciblage 2D).

### 2.3 ACCAD Open Motion Project (The Ohio State University) — 4 clips

- Page https://accad.osu.edu/research/motion-lab/mocap-system-and-data : *« Open Motion Project by ACCAD/The Ohio State
  University is licensed under a Creative Commons Attribution 3.0 Unported License. »*
- 4 membres extraits par requêtes Range de `Female1_bvh.zip` (5,2 Mo) et `Male2_bvh.zip` (7,2 Mo).
- Obligations : attribution avec la formule exacte ci-dessus, lien de la licence, mention de la modification.

### 2.4 Animated Drawings (Meta) — 4 clips de référence

- Dépôt `facebookresearch/AnimatedDrawings`, commit `b8596848`, `LICENSE` MIT, « Copyright (c) Meta Platforms, Inc. and
  affiliates ».
- Le README précise : *« Animated Drawings code, model weights, and Amateur Drawings dataset is released under the MIT
  license »*. Les BVH d'exemple font partie de l'arborescence couverte par ce `LICENSE`.
- `fair1/` (dab, wave_hello, zombie) : captures FAIR.
- `rokoko/jesse_dance.bvh` :
  - l'auteur d'AD l'a produite en filmant sa propre danse au téléphone, puis en l'exportant en BVH avec Rokoko (README
    d'AD) ;
  - provenance un peu moins nette : à garder comme **test de squelette différent** (Mixamo avec doigts) plutôt que comme
    clip de production.
- `cmu1/jumping_jacks.bvh` n'est pas repris : c'est du CMU, déjà couvert.
- Si du **code** d'AD est porté (ARAP, reciblage), la notice MIT va dans `moteur-fluide/THIRD_PARTY_NOTICES.md`. C'est
  l'objet d'une autre tâche.

### 2.5 Texte de crédits prêt à coller (description de vidéo, générique)

Français :

> Animation : données de capture de mouvement issues de la base CMU Graphics Lab Motion Capture Database
> (mocap.cs.cmu.edu — base financée par la NSF, EIA-0196217 ; conversion BVH de Bruce Hahne), du jeu de données
> 100STYLE de Ian Mason, Sebastian Starke et Taku Komura (zenodo.org/records/8127870, licence CC BY 4.0 :
> creativecommons.org/licenses/by/4.0), de l'Open Motion Project de l'ACCAD / The Ohio State University (licence CC BY
> 3.0 : creativecommons.org/licenses/by/3.0) et des exemples d'Animated Drawings (© Meta Platforms, Inc., licence MIT).
> Mouvements modifiés et reciblés sur nos personnages 2D.

English:

> Motion data: CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu; created with funding from NSF EIA-0196217;
> BVH conversion by Bruce Hahne); 100STYLE dataset by Ian Mason, Sebastian Starke and Taku Komura
> (zenodo.org/records/8127870, CC BY 4.0); Open Motion Project by ACCAD/The Ohio State University (CC BY 3.0); Animated
> Drawings example motions (© Meta Platforms, Inc., MIT License). Motions were modified and retargeted to 2D characters.

À ne citer que si un clip de la source est réellement utilisé dans la vidéo. Le champ `source` de `mocap.json` permet de
le générer automatiquement.

---

## 3. Sources écartées

| Source | Pourquoi | Statut |
|---|---|---|
| **SFU Motion Capture Database** (mocap.cs.sfu.ca) | *« This dataset of motions is free for research purposes. The data cannot be used for commercial products or resale, unfortunately. »* | [vérifié] non commercial |
| **Bandai Namco Research Motion Dataset 1 & 2** | README GitHub : « Bandai-Namco-Research-Motiondataset-1: CC BY-NC 4.0 », idem pour le 2 | [vérifié] non commercial, malgré des styles très utiles (tired, happy…) |
| **Ubisoft LAFAN1** | `license.txt` : « Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 » | [vérifié] non commercial, sans modification |
| Mixamo | redistribution des fichiers bruts exclue par la consigne ; compte Adobe requis | exclu par principe |
| AMASS, BEAT, Talking With Hands, ZeroEGGS, jeux GENEA | licences non commerciales ou à vérifier, non téléchargés | non vérifié ici : ne pas utiliser sans relecture de la licence |

---

## 4. Conventions techniques utiles au portage (parseur BVH du moteur)

[mesure] Lu dans les fichiers et vérifié par cinématique directe et planche en bâtons.

| Source | i/s | Ordre des canaux de rotation | Axe vertical | Unités | Noms de joints | Défauts |
|---|---|---|---|---|---|---|
| CMU (Hahne) | 120 (`Frame Time .0083333`) | `Zrotation Yrotation Xrotation` | +Y | ≈ 0,0564 m/unité (FAQ CMU) ; taille mesurée ≈ 20–23 u | MotionBuilder : Hips, LHipJoint, LeftUpLeg, LeftLeg, LeftFoot, LowerBack, Spine, Spine1, Neck, Neck1, Head, LeftShoulder (clavicule), LeftArm, LeftForeArm, LeftHand… (31 joints) | **image 0 = T-pose ajoutée** ; jambe figée sur 141_21, 79_84, 79_36 et 79_16 (rotations nulles : jambe écartée) |
| 100STYLE | 60 | `Yrotation Xrotation Zrotation` | +Y | cm (taille ≈ 150 u) | Hips, Chest…Chest4, Neck, Head, LeftCollar, **LeftShoulder = bras**, **LeftElbow = avant-bras**, **LeftWrist = main**, LeftHip, LeftKnee, LeftAnkle, LeftToe (23 joints) | `_FW` = allers-retours dans la salle avec demi-tours : couper un cycle |
| ACCAD | 30 | `Zrotation Xrotation Yrotation` | +Y | cm | Hips, ToSpine, Spine, Spine1, Neck, Head, LeftShoulder, LeftArm… (22 joints sur Male2) | Male2 : poignets non capturés |
| AD fair1 | 30 ou 119,9 | `Xrotation Yrotation Zrotation` | **+Z** | config AD : `scale: 0.025` | Hips, Spine…Spine3, Neck, Head, RightShoulder, RightArm…, RightHandEnd, RightHandThumb1 | — |
| AD rokoko | 100 | `Yrotation Xrotation Zrotation` | +Y | config AD : `scale: 0.005` | Mixamo avec 15 phalanges par main | cou et poignets figés (rotations constantes) |

Règle de rotation BVH, vérifiée : la rotation locale est le produit des matrices dans l'ordre listé (pour
`Z Y X` : `R = Rz·Ry·Rx`), puis on compose avec le parent. La position mondiale vaut position du parent +
R_parent · OFFSET. Avec cette règle, les postures attendues apparaissent sur la planche de contrôle
`S/scripts/mocap/out/planche1.png` et `planche2.png` : bras croisés, poings sur les hanches, téléphone à l'oreille,
assis, glissade, dab.

Pour le reciblage façon Animated Drawings, chaque clip porte `retarget_hints` :
- même syntaxe que `examples/config/motion/*.yaml` : `up`, `groundplane_joint`, paires `forward_perp_joint_vectors` ;
- AD lui-même utilise `LeftShoulder/RightShoulder` et `LeftUpLeg/RightUpLeg` pour les squelettes MotionBuilder ;
- pour 100STYLE, les hanches s'appellent `LeftHip/RightHip`.

---

## 5. Les 64 clips (tri par catégorie)

Colonnes :
- « Ce qui bouge le plus » : vitesse angulaire moyenne de chaque segment par rapport au bassin [mesure]. Les mains sont
  exclues du classement, car la rotation du poignet est bruitée.
- « tailles » : distances en tailles de corps.
- Le détail complet (p95, extrémités, plage utile, pic) est dans `mocap.json`.

| Catégorie | id | Source | Durée | Images @ i/s | Ce qui bouge le plus (analyse) | Usage dans les sketchs |
|---|---|---|---|---|---|---|
| hausser_epaules | `hausser_epaules_cmu141_21` | CMU | 2.3 s | 273 @ 120 | avant_bras_d 111°/s, avant_bras_g 106°/s, bras_d 98°/s ; sur place, debout | hausser les épaules / « je sais pas moi » |
| hausser_epaules | `hausser_epaules_lent_cmu113_16` | CMU | 5.8 s | 700 @ 120 | avant_bras_d 41°/s, avant_bras_g 41°/s, bras_d 41°/s ; sur place, debout | hausser les épaules (version discrète) / embarras |
| pointer | `pointer_cmu14_24` | CMU | 30.9 s | 3703 @ 120 | avant_bras_d 150°/s, avant_bras_g 149°/s, bras_g 138°/s ; sur place, debout | pointer quelqu'un/quelque chose / « toi, viens ici ! » |
| rire | `rire_cmu13_14` | CMU | 20.2 s | 2425 @ 120 | avant_bras_d 192°/s, bras_d 163°/s, avant_bras_g 139°/s ; va-et-vient dans une zone (6.0 tailles parcourues, 0.2 net), debout | rire franc / se moquer |
| rire | `rire_cmu79_70` | CMU | 6.4 s | 764 @ 120 | tete 286°/s, avant_bras_d 236°/s, bras_d 205°/s ; sur place, debout | rire / « ah ah, celui-là ! » |
| sursaut | `sursaut_cartoon_cmu120_15` | CMU | 12.3 s | 1471 @ 120 | avant_bras_g 235°/s, avant_bras_d 215°/s, bras_g 211°/s ; va-et-vient dans une zone (4.3 tailles parcourues, 0.5 net), debout | sursaut / surprise exagérée |
| sursaut | `peur_cmu79_73` | CMU | 7.4 s | 888 @ 120 | tete 112°/s, cou 66°/s, avant_bras_g 55°/s ; sur place, debout | avoir peur / reculer devant un chien / un patron fâché |
| sursaut | `esquive_cmu77_09` | CMU | 8.2 s | 989 @ 120 | tete 151°/s, avant_bras_g 134°/s, avant_bras_d 118°/s ; sur place, assis/accroupi 46 % du temps | esquiver une claquette/une chaussure lancée / se baisser |
| sursaut | `marche_bras_fous_100style` | 100STYLE | 129.3 s | 7761 @ 60 | avant_bras_d 298°/s, bras_d 271°/s, avant_bras_g 267°/s ; va-et-vient dans une zone (55.9 tailles parcourues, 0.3 net), debout | panique / fuir en criant |
| colere | `taper_pointer_cmu23_21` | CMU | 3.2 s | 390 @ 120 | bras_d 66°/s, avant_bras_d 62°/s, bras_g 54°/s ; sur place, surtout assis/accroupi | colère qui monte / accusation (« c'est toi ! ») |
| colere | `dispute_A_cmu18_10` | CMU | 15.1 s | 1806 @ 120 | avant_bras_g 199°/s, avant_bras_d 185°/s, bras_g 174°/s ; se déplace (1.5 tailles net, 4.5 parcourues), debout | colère / dispute de voisins |
| colere | `dispute_B_cmu19_10` | CMU | 15.1 s | 1806 @ 120 | avant_bras_d 255°/s, avant_bras_g 241°/s, bras_d 226°/s ; se déplace (1.2 tailles net, 4.7 parcourues), debout | colère / dispute à deux personnages |
| colere | `engueulade_cmu80_48` | CMU | 9.6 s | 1151 @ 120 | avant_bras_d 430°/s, avant_bras_g 333°/s, bras_d 316°/s ; sur place, debout | se disputer au téléphone / râler |
| colere | `poings_hanches_100style` | 100STYLE | 27.6 s | 1654 @ 60 | avant_bras_d 43°/s, avant_bras_g 40°/s, tibia_d 32°/s ; sur place, debout | gronder / la maman qui attend des explications |
| colere | `marche_colere_100style` | 100STYLE | 82.4 s | 4942 @ 60 | avant_bras_g 181°/s, avant_bras_d 167°/s, tibia_d 155°/s ; va-et-vient dans une zone (62.8 tailles parcourues, 0.1 net), debout | marcher fâché / foncer vers quelqu'un |
| colere | `provocation_accad` | ACCAD | 5.4 s | 162 @ 30 | avant_bras_d 96°/s, avant_bras_g 77°/s, bras_g 46°/s ; sur place, debout | provoquer / « viens si t'es un homme » |
| marcher | `marche_normale_cmu137_29` | CMU | 9.4 s | 1129 @ 120 | tibia_d 114°/s, tibia_g 113°/s, cuisse_g 101°/s ; se déplace (4.0 tailles net, 6.4 parcourues), debout | marcher (référence neutre) / entrer/sortir du cadre |
| marcher | `marche_joyeuse_cmu142_08` | CMU | 25.3 s | 3034 @ 120 | avant_bras_g 180°/s, avant_bras_d 138°/s, bras_g 124°/s ; va-et-vient dans une zone (15.8 tailles parcourues, 0.2 net), debout | marcher content / arriver avec une bonne nouvelle |
| marcher | `marche_sournoise_cmu142_22` | CMU | 43.5 s | 5222 @ 120 | tibia_g 69°/s, tibia_d 69°/s, cuisse_g 58°/s ; va-et-vient dans une zone (16.8 tailles parcourues, 0.0 net), debout | s'approcher en cachette / voler un beignet |
| marcher | `marche_sifflote_cmu17_06` | CMU | 51.7 s | 6201 @ 120 | tibia_d 110°/s, tibia_g 106°/s, avant_bras_g 105°/s ; va-et-vient dans une zone (25.2 tailles parcourues, 0.1 net), debout | marcher insouciant / flâner au maquis |
| marcher | `marche_fier_100style` | 100STYLE | 109.4 s | 6563 @ 60 | avant_bras_g 145°/s, avant_bras_d 132°/s, tibia_d 122°/s ; va-et-vient dans une zone (61.7 tailles parcourues, 0.1 net), debout | frimer / le grand patron qui arrive |
| marcher | `marche_deprime_100style` | 100STYLE | 161.1 s | 9664 @ 60 | tibia_g 84°/s, tibia_d 78°/s, avant_bras_d 66°/s ; va-et-vient dans une zone (63.2 tailles parcourues, 0.8 net), debout | tristesse / après un échec |
| marcher | `marche_ivre_100style` | 100STYLE | 128.7 s | 7719 @ 60 | avant_bras_g 145°/s, avant_bras_d 135°/s, tibia_g 120°/s ; va-et-vient dans une zone (72.0 tailles parcourues, 0.2 net), debout | sortie de maquis tardive / étourdi |
| marcher | `marche_vieux_100style` | 100STYLE | 266.8 s | 16010 @ 60 | tibia_g 40°/s, tibia_d 36°/s, cuisse_g 22°/s ; sur place, debout | le vieux / grand-père / fatigue |
| marcher | `marche_mains_poches_100style` | 100STYLE | 123.3 s | 7399 @ 60 | tibia_g 112°/s, tibia_d 104°/s, cuisse_g 63°/s ; va-et-vient dans une zone (60.5 tailles parcourues, 0.4 net), debout | nonchalance / faire semblant de rien |
| marcher | `marche_frimeur_100style` | 100STYLE | 149.0 s | 8938 @ 60 | tibia_g 99°/s, tibia_d 99°/s, avant_bras_g 86°/s ; va-et-vient dans une zone (60.4 tailles parcourues, 0.6 net), debout | frimer / draguer |
| marcher | `marche_pointe_pieds_100style` | 100STYLE | 134.3 s | 8059 @ 60 | tibia_d 104°/s, tibia_g 97°/s, cuisse_g 68°/s ; va-et-vient dans une zone (59.8 tailles parcourues, 0.2 net), debout | entrer en cachette / ne pas réveiller quelqu'un |
| marcher | `zombie_ad` | AD (MIT) | 26.0 s | 779 @ 30 | tibia_d 109°/s, avant_bras_d 108°/s, tibia_g 107°/s ; va-et-vient dans une zone (10.7 tailles parcourues, 0.1 net), debout | zombie / somnambule / test de portage AD (config zombie.yaml) |
| s_asseoir | `s_asseoir_cmu143_18` | CMU | 6.3 s | 753 @ 120 | avant_bras_g 160°/s, bras_g 134°/s, cuisse_g 87°/s ; sur place, assis/accroupi 50 % du temps | s'asseoir / se lever pour protester |
| s_asseoir | `s_asseoir_chaise_cmu113_15` | CMU | 8.0 s | 954 @ 120 | avant_bras_d 113°/s, bras_d 103°/s, avant_bras_g 78°/s ; sur place, assis/accroupi 44 % du temps | s'asseoir sur une chaise en plastique / se relever difficilement |
| s_asseoir | `assis_reflechir_cmu13_04` | CMU | 39.7 s | 4760 @ 120 | avant_bras_g 66°/s, bras_g 58°/s, avant_bras_d 49°/s ; sur place, surtout assis/accroupi | réfléchir / s'ennuyer assis |
| danse_victoire | `danse_macarena_cmu143_35` | CMU | 10.7 s | 1280 @ 120 | avant_bras_g 178°/s, avant_bras_d 158°/s, bras_g 150°/s ; sur place, debout | danse de victoire / fêter |
| danse_victoire | `danse_poulet_cmu143_34` | CMU | 6.5 s | 784 @ 120 | avant_bras_g 238°/s, avant_bras_d 218°/s, bras_g 208°/s ; sur place, debout | danse ridicule / se moquer en dansant |
| danse_victoire | `frimer_muscles_cmu79_94` | CMU | 7.8 s | 936 @ 120 | avant_bras_d 137°/s, avant_bras_g 128°/s, bras_d 124°/s ; sur place, debout | frimer / victoire |
| danse_victoire | `joie_cmu79_69` | CMU | 6.8 s | 818 @ 120 | avant_bras_d 338°/s, bras_d 301°/s, avant_bras_g 249°/s ; sur place, debout | joie / victoire |
| danse_victoire | `frapper_poitrine_100style` | 100STYLE | 37.4 s | 2242 @ 60 | avant_bras_d 88°/s, avant_bras_g 71°/s, bras_d 43°/s ; sur place, debout | victoire / défi |
| danse_victoire | `victoire_accad` | ACCAD | 13.2 s | 397 @ 30 | avant_bras_d 180°/s, avant_bras_g 148°/s, bras_d 147°/s ; sur place, assis/accroupi 12 % du temps | danse de victoire / but marqué |
| danse_victoire | `dab_ad` | AD (MIT) | 11.3 s | 339 @ 30 | avant_bras_d 380°/s, avant_bras_g 367°/s, bras_g 338°/s ; sur place, assis/accroupi 17 % du temps | dab de victoire / test de portage AD (config dab.yaml) |
| danse_victoire | `danse_jesse_ad` | AD (MIT) | 10.1 s | 1007 @ 100 | tibia_g 258°/s, avant_bras_d 235°/s, bras_d 218°/s ; sur place, debout | danse comique / test de squelette différent (config jesse_dance.yaml) |
| se_gratter_la_tete | `gratter_tete_cmu79_84` | CMU | 7.3 s | 877 @ 120 | avant_bras_d 231°/s, bras_d 197°/s, avant_bras_g 174°/s ; sur place, debout | se gratter la tête (n'utiliser qu'un bras, raccourcir l'amplitude) / s'arranger les cheveux |
| bras_croises | `attendre_cmu141_20` | CMU | 6.4 s | 764 @ 120 | avant_bras_g 412°/s, avant_bras_d 333°/s, bras_g 295°/s ; va-et-vient dans une zone (2.9 tailles parcourues, 0.2 net), debout | attendre / s'impatienter |
| bras_croises | `attendre_long_cmu137_28` | CMU | 31.0 s | 3723 @ 120 | avant_bras_g 42°/s, avant_bras_d 36°/s, bras_g 35°/s ; sur place, debout | fond de scène (personnage qui écoute) / attendre le gbaka |
| bras_croises | `bras_croises_100style` | 100STYLE | 30.5 s | 1828 @ 60 | avant_bras_d 40°/s, avant_bras_g 38°/s, tibia_d 30°/s ; sur place, debout | bras croisés / attendre fâché |
| bras_croises | `marche_bras_croises_100style` | 100STYLE | 131.4 s | 7886 @ 60 | tibia_g 104°/s, tibia_d 99°/s, cuisse_g 58°/s ; va-et-vient dans une zone (59.6 tailles parcourues, 0.6 net), debout | s'éloigner vexé / marcher fâché |
| bras_croises | `attente_longue_accad` **(long)** | ACCAD | 38.6 s | 1157 @ 30 | avant_bras_d 81°/s, avant_bras_g 72°/s, bras_d 66°/s ; sur place, debout | attendre / s'impatienter |
| geste_parole | `expliquer_A_cmu18_08` **(long)** | CMU | 17.4 s | 2087 @ 120 | avant_bras_d 95°/s, avant_bras_g 85°/s, bras_d 72°/s ; sur place, debout | geste de parole pendant un dialogue / expliquer un plan |
| geste_parole | `expliquer_B_cmu19_08` **(long)** | CMU | 17.4 s | 2087 @ 120 | avant_bras_d 165°/s, avant_bras_g 158°/s, bras_d 150°/s ; sur place, debout | geste de parole / dialogue à deux |
| geste_parole | `enseigner_cmu80_14` **(long)** | CMU | 14.5 s | 1736 @ 120 | avant_bras_d 170°/s, bras_d 162°/s, tete 48°/s ; sur place, debout | faire la leçon / le vieux qui donne des conseils |
| geste_parole | `indiquer_chemin_cmu139_25` | CMU | 5.5 s | 664 @ 120 | avant_bras_d 134°/s, tete 132°/s, avant_bras_g 130°/s ; sur place, debout | indiquer le chemin / pointer au loin |
| geste_parole | `conversation_longue_accad` **(long)** | ACCAD | 50.7 s | 1522 @ 30 | avant_bras_d 78°/s, avant_bras_g 55°/s, bras_d 50°/s ; sur place, debout | geste de parole sur une longue réplique / monologue |
| chute | `glissade_banane_cmu90_17` | CMU | 5.0 s | 606 @ 120 | avant_bras_g 177°/s, bras_g 170°/s, avant_bras_d 115°/s ; se déplace (1.5 tailles net, 1.8 parcourues), passe au sol | chute burlesque / glisser |
| chute | `se_relever_cmu140_08` | CMU | 7.5 s | 899 @ 120 | avant_bras_d 104°/s, bras_d 101°/s, avant_bras_g 90°/s ; sur place, passe au sol | se relever après une chute |
| emotion | `pleurer_cmu79_72` | CMU | 8.0 s | 954 @ 120 | avant_bras_d 91°/s, tete 89°/s, avant_bras_g 84°/s ; sur place, debout | pleurer / faux chagrin |
| emotion | `desespoir_assis_cmu22_03` | CMU | 6.8 s | 813 @ 120 | tete 78°/s, cou 50°/s, bras_g 50°/s ; sur place, surtout assis/accroupi | désespoir / « on est fatigués ! » |
| emotion | `bouder_cmu141_27` | CMU | 4.6 s | 556 @ 120 | tibia_g 157°/s, avant_bras_g 152°/s, cuisse_g 150°/s ; se déplace (2.0 tailles net, 2.4 parcourues), debout | bouder / repartir vexé |
| salutation | `saluer_main_cmu141_16` | CMU | 2.5 s | 300 @ 120 | avant_bras_d 386°/s, bras_d 354°/s, tibia_g 55°/s ; sur place, debout | saluer / « ça va ? » |
| salutation | `serrer_main_cmu141_23` | CMU | 2.1 s | 257 @ 120 | tibia_d 231°/s, avant_bras_d 220°/s, tibia_g 210°/s ; se déplace (1.4 tailles net, 2.1 parcourues), debout | serrer la main / conclure un marché |
| salutation | `saluer_ad` | AD (MIT) | 7.0 s | 839 @ 120 | avant_bras_d 101°/s, bras_d 85°/s, avant_bras_g 33°/s ; sur place, debout | saluer / test de portage AD (config wave_hello.yaml) |
| quotidien | `telephone_cmu79_36` | CMU | 4.3 s | 519 @ 120 | avant_bras_d 133°/s, bras_d 103°/s, tete 38°/s ; sur place, debout | répondre au téléphone |
| quotidien | `acheter_cmu79_16` | CMU | 6.0 s | 721 @ 120 | bras_d 132°/s, avant_bras_d 120°/s, avant_bras_g 55°/s ; sur place, debout | payer au marché / acheter des beignets |
| quotidien | `bailler_etirer_cmu141_13` | CMU | 3.1 s | 369 @ 120 | avant_bras_g 198°/s, avant_bras_d 152°/s, bras_g 145°/s ; sur place, debout | se réveiller / s'ennuyer |
| quotidien | `regarder_autour_cmu139_01` | CMU | 9.1 s | 1091 @ 120 | tete 127°/s, cou 67°/s, bassin 59°/s ; sur place, assis/accroupi 8 % du temps | chercher quelqu'un / méfiance |
| quotidien | `telephone_debout_100style` | 100STYLE | 34.9 s | 2092 @ 60 | avant_bras_d 36°/s, avant_bras_g 32°/s, tibia_d 29°/s ; sur place, debout | parler au téléphone / négocier au téléphone |
| quotidien | `chasser_moustique_100style` | 100STYLE | 29.7 s | 1781 @ 60 | avant_bras_g 43°/s, avant_bras_d 42°/s, tibia_g 34°/s ; sur place, debout | chasser un moustique / agacement |

Remarques par clip, reprises dans `remarks[]` :
- **Jambe figée** :
  - CMU 141_21, 79_84, 79_36 et 79_16 : jambe droite.
  - CMU 111_25, non retenu : jambe gauche.
  - Dans la capture, ces rotations sont nulles. Cadrer en plan taille ou forcer la jambe du rig en pose de repos.
- **Sauts d'image** (extrémité qui bouge de plus de 0,15 taille en 1/30 s) :
  - sursaut cartoon 120_15, glissade 90_17 : mouvement réellement rapide ;
  - engueulade 80_48, serrer la main 141_23, attendre 141_20, victoire ACCAD : prévoir un lissage léger.
- **Paires synchrones** pour des dialogues à deux personnages : 18_10 ↔ 19_10 (dispute), 18_08 ↔ 19_08 (explication).
  Même prise, même horloge.
- **100STYLE `_FW`** : 80 à 270 s d'allers-retours. Utiliser `useful_range_s` et couper un cycle de marche (environ
  1 s), à boucler.
- **Clips CMU longs** (14_24, 13_04, 17_06, 142_22) : choisir le segment autour de `activity_peak_s`.

---

## 6. Manques et pistes

1. **Se gratter la tête** : aucun vrai clip dans les sources commerciales.
   - Partir de `gratter_tete_cmu79_84` (se coiffe : main au-dessus de la tête 73 % du temps [mesure]).
   - Garder un seul bras, réduire l'amplitude, ajouter une petite oscillation procédurale du poignet.
   - Autre voie : un geste procédural pur, qui est le point fort actuel du moteur.
2. **Pointer court** : couper 1 à 2 s dans `pointer_cmu14_24` autour d'un pic, dans `indiquer_chemin_cmu139_25` ou dans
   `taper_pointer_cmu23_21` (version penchée et en colère).
3. **Mains, doigts, visage** : la mocap ne couvre que le corps.
   - Mains et lèvres restent gérées par le moteur : poses de main, visèmes.
   - Seul `jesse_dance` a des doigts.
4. **100STYLE contient encore 85 styles non téléchargés**, utiles pour la comédie. Exemples : `Chicken`, `Robot`,
   `Zombie`, `Penguin`, `Monk`, `Superman`, `Elated`, `Heavyset`, `LookUp`, `Followed` (se sentir suivi), `InTheDark`,
   `Roadrunner`, `Teapot`, `Rushed`, `Skip`, `BentForward`, `OnPhoneLeft`.
   - Chacun existe en FW, BW, SW, FR, BR, SR, ID et TR (`index/100style-membres.json`).
   - Pour un style, extraire le membre voulu avec :
     ```
     python3 -I S/scripts/mocap/remote_zip.py "https://zenodo.org/api/records/8127870/files/100STYLE.zip/content" \
       get 100STYLE/<Style>/<Style>_FW.bvh <dossier_vide>/<Style>_FW.bvh
     ```
     Coût : environ 2 Mo par fichier.
5. **CMU contient environ 2 550 mouvements** (`index/cmu-mocap-index-text.txt`). Pistes non retenues mais notées :
   - 141_28 « Slap Hands, Throw it Back » ;
   - 90_16 « fall on face », 90_18 « RugPullFall » ;
   - 79_68 « cold », 80_41 « freezing » ;
   - 79_88 « swatting at a fly » ;
   - 111_02 et 113_02 « Bow », 113_03 « Curtsey » ;
   - 104_13 « StumbleWalk », 105_09 « DrunkWalk », 105_32 « ScaredWalk », 105_33 « MachoWalk » ;
   - séries 137_* « Cat/Chicken/Dinosaur/Drunk/Old Man/Strong Man… Coffee Mug/Pick Up/Wait/Walk » : très comiques ;
   - 132_54 « Walk With Wild Arms ».
   - Pour récupérer un fichier :
     ```
     git clone --filter=blob:none --no-checkout --depth 1 https://github.com/una-dinosauria/cmu-mocap
     git sparse-checkout set --no-cone /data/NNN/NNN_MM.bvh
     git checkout master
     ```
   - **Surtout pas** `git ls-tree -l` : il télécharge tous les objets.
6. **ACCAD** : d'autres clips Female1, Male1 et Male2 sont listés dans `index/accad-*-membres.jsonl`. Exemples :
   `Female1_D4_RandomStuff`, `Male2_D10_Victory2`, `Male2_D7_WalkToBow`, `Male1_A4_LookAround`.

---

## 7. Reproduire ou mettre à jour

```
# 1) analyse (≈ 9 s pour 85 fichiers, 1 cœur) — fichiers passés en arguments, script hors du dossier de téléchargement
OMP_NUM_THREADS=1 python3 -I S/scripts/mocap/analyse_bvh.py S/scripts/mocap/out/analyse_final.json <fichiers .bvh>
# 2) manifeste (relit les .bvh déjà en cache si les sources temporaires ont été effacées)
python3 -I S/scripts/mocap/construire_bibliotheque.py S/scripts/mocap/out/analyse_final.json \
  studio-troupe/sorties/cache/mocap S
# 3) contrôle visuel
python3 -I S/scripts/mocap/planche_batons.py studio-troupe/sorties/cache/mocap/mocap.json planche.png <id> <id> ...
```

Pour ajouter un clip, ajouter une ligne `clip(...)` dans `construire_bibliotheque.py` (id, source, catégorie,
description, usages, remarques), puis relancer les étapes 1 et 2.
