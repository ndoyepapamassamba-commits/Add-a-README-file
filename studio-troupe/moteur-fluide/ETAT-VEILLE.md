# Moteur fluide — état au moment de la mise en veille (16/10/2026, 15 h 20)

Le projet est en **pause, à la demande du propriétaire**. Aucun calcul ne tourne. Tout le code est poussé sur la
branche `claude/youthful-pasteur-7wbiqt` du dépôt `ndoyepapamassamba-commits/Add-a-README-file`, dossier
`studio-troupe/moteur-fluide/`.

- **Tests au moment de la pause** : `npm run typecheck` passe ; `npm test` passe **443/443** (30 fichiers).
- **Données privées, pas dans git** : dessins, fiches, décors, vidéos de référence et rendus. Elles se trouvent dans
  `studio-troupe/.private/` et `studio-troupe/sorties/` du conteneur de cette session, et restent chez le
  propriétaire.

## Documentation à lire, dans l'ordre

| Fichier | Contenu |
|---|---|
| `NOTE-METHODE.md` | Comment la vidéo pilote a été faite, et les leçons transposables à un moteur 3D |
| `CONCEPTION.md` | Architecture (fonction pure du temps, ressorts analytiques, flou exact), ce qu'on apprend de chaque moteur, règle d'amélioration continue |
| `README.md` | Commandes exactes, état de chaque module, résultats mesurés du pilote, licences |
| `THIRD_PARTY_NOTICES.md` | Toutes les dépendances, avec versions et licences (et crédit CC-BY de la voix) |
| `../../research_notes/Moteur d'animation fluide/` | Veille numérotée 00 à 14 (voir la liste ci-dessous) |
| `../../reports/Moteurs vidéo IA pour la troupe.md` | Rapport de recherche : comment marchent Veo, Kling et Grok, et le plan gratuit |
| `../MOTEURS-A-DUPLIQUER.md` + `../vendor/moteurs.json` | 23 dépôts open source vérifiés (licence, commit épinglé) et script de clonage |
| `../mini-moteur/` | Moteur de diffusion miniature recréé de zéro (pédagogique, 32×32) |
| `../banc-cpu/README.md` | Wan2.1 1,3B exécuté sur processeur (2 s de vidéo en 24 min) |

Notes de veille du moteur fluide :

| N° | Sujet |
|---|---|
| 00 | Audit de l'existant |
| 01 | Moteurs qui animent une image (Animated Drawings, LivePortrait, TPS) |
| 02 | Rigs 2D, maillages, physique |
| 03 | Jeu d'acteur procédural |
| 04 | Voix françaises et lèvres sur CPU |
| 05 | Rendu, caméra, décors 2,5D |
| 06 | Création de personnages sur CPU |
| 07 | Compléments |
| 09 | Plan de reproduction du code d'Animated Drawings |
| 10 | Bibliothèque de mouvements captés |
| 11 | Décor vivant |
| 12 | Parole naturelle |
| 13 | Visages |
| 14 | Moteurs de squelette 2D (DragonBones, Rive, Godot) |

## Ce qui est terminé

- **Le moteur et ses modules** : noyau (temps, courbes, ressorts du second ordre en forme fermée, bruit), rig
  (maillage depuis le contour, poids, skinning à centres de rotation, IK deux os), jeu d'acteur en couches, visage
  (visèmes français, clignements, sourcils), décor 2,5D (sol tiré de la profondeur, sol praticable, ombres de contact,
  occultation, figurants animés, ampoules), caméra (plans, punch-in, gel), rendu PixiJS avec flou exact, export
  Playwright + FFmpeg, vérificateur ffprobe, porte qualité sur l'état et sur les pixels.
- **Outils** : `npm run voix` (Piper fr_FR-mls, CC-BY, durées exactes des phonèmes, fusion dans le projet),
  `npm run preparer` (coutures fines, calque sous les bras, texture Real-ESRGAN), `npm run affiner`, `npm run rendre`.
- **Pilote « Modou et le poulet »** en 1080×1920 : MP4 conforme, porte qualité 24/24. Énergie 0,124 H/s, glissement
  des pieds 1,1 px, corrélation lèvres/voix 0,735.

## Ce qui était en cours (arrêté proprement)

| Chantier | Où il en était | Fichiers déjà là | Pour reprendre |
|---|---|---|---|
| Greffe Animated Drawings (déformation ARAP + mouvements captés BVH) | étude finie (note 09), bibliothèque de mouvements constituée (note 10, fichiers privés), ARAP en cours d'écriture | `src/rig/arap.ts`, `decimation.ts`, `creux.ts` (pas encore branchés, non testés) | finir l'ARAP sur un maillage de contrôle décimé, écrire `anim/bvh.ts` et `anim/reciblage.ts`, ajouter l'action `mocap`, rendre la démo |
| Décor vivant + parole naturelle | conceptions écrites (notes 11 et 12) | — | construire `scene/vivant/*` (figurants marionnettes, effets) et la voix plus naturelle |
| Veille des moteurs puissants | notes 13 et 14 écrites ; éclairage, mouvement, physique et mise en scène pas faits | — | finir les 4 axes restants puis le plan d'agrégation |
| Boucle d'écarts n°1 | 5 vidéos TikTok du compte récupérées (privées), comparateur commencé | `outils/comparer/` (seuls les modèles sont téléchargés, et ignorés par git) | écrire le comparateur, mesurer, chercher les outils par écart |
| Troupe | 7 personnages principaux et 32 de la galerie préparés (privé) ; 15 à créer | — | créer les 7 du catalogue et les 8 « à dessiner » dans le style de la troupe |

## Défauts connus du pilote

- Les bras paraissent fins et étirés dans les grands gestes. La réponse prévue est l'ARAP ou la peau par nombres
  duaux, que la session « troupe village » a déjà.
- Le décor est flou en gros plan, parce que la peinture ne fait que 1336×704.
- La voix synthétique n'a pas l'accent ivoirien, et « Walay » est entendu « voilày ».

## Retours de la session « troupe village », à intégrer à la reprise

Reçus pendant la veille, par messages de session à session ; rien n'a été codé ici.

- **Lèvres mesurées sur l'image rendue, pas seulement sur le signal du moteur.** Le défaut « Modou est muet » passait
  la porte qualité.
  - Mesure : Δ moyen de la zone de bouche projetée à l'écran, d'une image à l'autre.
  - Repères : Δ ≥ 11 et bouche en mouvement sur au moins 64 % des images pour celui qui parle ; Δ de 2 à 5 pour celui qui
    écoute.
  - Ouverture : énergie normalisée par réplique (p90), courbe γ 0,7.
  - Déformeur de mâchoire : le menton descend de 0,6 × la largeur de la bouche à pleine ouverture.
- **Rire** piloté par les éclats du son, avec un plan sur celui qui rit et des secousses du buste.
- **Format de la vidéo de référence du propriétaire** (sa plus vue) : clip 576 × 460 posé sur un fond qui est la même
  image agrandie et floutée ; sous-titres karaoké en majuscules, mot prononcé en vert, groupes de 2 à 4 mots ; caméra
  fixe.
- **Règle bloquante « tête entière ou absente »** pour tous les acteurs visibles, sur les 4 bords du cadre.
- **Voix Piper mls : à contrôler avec Whisper** (faster-whisper, MIT).
  - Chez eux, les locuteurs 33, 91 et 13 sortent du charabia.
  - Notre locuteur 16 a été relu en « voilày c'est pas moi qui ai mangé le poulet », donc compréhensible ; la
    vérification reste à généraliser.
  - Leur solution : sources siwis (CC-BY) et gilles (CC0), et WORLD (pyworld) pour la hauteur et le timbre de chaque
    personnage.
  - Ne jamais accélérer une chute : à 6,5 syllabes par seconde, elle n'est plus comprise.
- **LivePortrait sur visages Pixar** : il redessine toute la tête.
  - Leur correction : aligner l'original et la sortie par similitude sur les points stables (yeux, nez, contour), puis ne
    greffer que la bouche et les paupières sous un masque doux.
  - S'y ajoutent un fondu entre états voisins et un lissage de la mâchoire sur ±2 images.
  - Résultat : 1,41 saute/s ramenées vers la référence de 0,13 à 0,35.
- **Leurs modules disponibles sur demande**, envoyés en texte brut avec les tests (ils n'ont pas le droit de pousser) :
  `armature2d.ts` (peau duale), `boneHeat.ts`, contacts et contraintes refaites après le ressort, `ressorts.ts` avec
  retard de groupe compensé.
