# Moteur fluide de la troupe — conception

Moteur d'animation **écrit en code**, gratuit, qui tourne sur un simple processeur (aucune carte graphique, aucun
service payant). Il anime les personnages de la troupe dans les décors d'Abidjan, avec voix et lèvres en français, et
exporte un MP4 vérifié.

Il apprend des autres moteurs sans copier leur code. Le tableau ci-dessous indique ce qu'on reprend de chacun et ce
qu'on améliore.

| Appris de | Idée reprise | Notre amélioration |
|---|---|---|
| Wan / Veo (diffusion) | image de départ fixée, cohérence du personnage | l'identité est **exacte** : on déforme le dessin lui-même, on ne le régénère jamais |
| Animated Drawings (Meta) | maillage tiré du contour du dessin + squelette + skinning | poids lissés, cinématique inverse, physique secondaire, jeu d'acteur |
| LivePortrait | petits déplacements du visage (yeux, lèvres, tête) par champ de déformation | visage piloté par visèmes et prosodie, de façon déterministe |
| RIFE / FILM (interpolation) | fluidité par images intermédiaires | inutile : le mouvement est une **fonction continue du temps**, rendue à n'importe quelle cadence (30/60 i/s) |
| Rhubarb Lip Sync | phonèmes → formes de bouche, anticipation | visèmes français, et timings exacts quand la voix vient de notre synthèse |
| VBench | mesures automatiques de fluidité | porte qualité calculée sur l'**état** du moteur (vitesses, à-coups, glissement des pieds), pas seulement sur les pixels |
| CameraCtrl / 3D Ken Burns | caméra en profondeur | parallaxe 2,5D tirée des cartes de profondeur fournies avec chaque décor |

## Le principe qui donne la fluidité

1. **Tout est une fonction pure du temps** : `evaluer(projet, t) → EtatImage`. Même entrée, même état, à n'importe quel
   instant, dans n'importe quel ordre. On peut donc rendre à 60 i/s, revenir en arrière ou reprendre un rendu
   interrompu, sans dérive cumulée.
2. **Les ressorts sont résolus analytiquement.** Un ressort du second ordre (fréquence `f`, amortissement `ζ`, réponse
   `r`) répond à une suite de consignes en escalier comme la somme de ses réponses indicielles : `x(t) = Σ_k Δ_k·h(t − t_k)`.
   On obtient dépassement, rebond et retour au calme (anticipation, follow-through, settle) **sans intégration pas à
   pas**, donc sans dépendance au chemin.
3. **Le flou de mouvement est exact** : comme `evaluer` est pur, on moyenne `N` sous-instants `t + k·Δt/N` par image.
4. **Les actions sont des recettes paramétrées** (anticipation → action → dépassement → retour) superposées en couches
   avec priorités, masques par os et fondus, puis filtrées par les ressorts.

## Les couches du moteur (TypeScript, `src/`)

| Dossier | Rôle | Contrat |
|---|---|---|
| `noyau/` | temps, nombres aléatoires à graine, bruit simplex, courbes (easing, Bézier, Hermite, Catmull-Rom), ressorts analytiques, maths 2D | fonctions pures, testées |
| `rig/` | squelette (os, pivots, limites), cinématique directe et inverse (2 os), maillage tiré d'un masque alpha, poids de skinning, déformation (LBS) | `deformer(rig, pose) → sommets` |
| `anim/` | bibliothèque d'actions (respirer, attendre, regarder, hausser les épaules, pointer, mains ouvertes, bras croisés, surprise, colère, gêne, rire, recul, flexion, marcher, s'arrêter, se tourner…), couches et mélange, physique secondaire (pans, foulards) | `poseA(personnage, t) → Pose` |
| `visage/` | visèmes français, coarticulation, bouche (ouverture/largeur/arrondi), yeux (clignements, saccades, regard), sourcils | `visageA(personnage, t) → EtatVisage` |
| `scene/` | décor 2,5D (plaque, figurants, ciel, profondeur), placement au sol et échelle, caméra et réalisateur (plans, punch-in, panoramique filé, tremblé, gel) | `cameraA(t)`, `decorA(t)` |
| `timeline/` | format du projet (sketch → plans → pistes), `evaluer(projet, t)` | état complet d'une image |
| `rendu/` | rendu PixiJS (WebGL) dans le navigateur à partir de l'état | `dessiner(etat)` |
| `export/` | capture image par image dans Chromium sans écran (Playwright), encodage FFmpeg, mixage audio, vérification ffprobe et décodage intégral | MP4 + rapport |
| `qa/` | porte qualité : énergie de mouvement, à-coups, sauts de pose, glissement des pieds, couverture des images, synchro audio | PASS / FAIL chiffré |

Outils hors moteur (`outils/`, Python ou Node) : préparation des personnages (détourage, maillage, squelette, ancrages
du visage), préparation des décors depuis le kit privé, voix française et timings de phonèmes.

## Personnages

- **Personnage d'une seule image** (cas principal) : image détourée en pose neutre bras légèrement écartés → maillage
  triangulé depuis le contour → squelette posé sur l'image (`rig.json`) → poids lissés → déformation.
  Ancrages du visage (yeux, bouche, sourcils) pour les visèmes et les clignements.
- **Personnage découpé** (planches de l'utilisateur, plus tard) : calques séparés avec pivots ; même interface.
- En attendant les planches, les personnages sont **créés sur ce processeur** avec un modèle d'image libre (licence
  Apache), d'après la description verbatim de la bible ; un personnage de test dessiné en code sert au développement.

## Décors (kit privé, jamais poussé)

Chaque décor fournit la peinture avec figurants, la plaque sans figurants, une carte de profondeur et des masques
(figurants, ciel). Le moteur s'en sert pour la parallaxe 2,5D, les figurants qui respirent, le ciel qui dérive et
l'échelle des personnages (ligne de sol `fit.floor`, hauteur de scène `fit.mH`).

## Ce que le moteur refuse de faire

- Simuler un rendu : aucun MP4 n'est annoncé sans fichier réel, décodé en entier et contrôlé par ffprobe.
- Pousser les dessins ou les décors de la troupe sur le dépôt public : ils restent dans `studio-troupe/.private/`.
- Dépendre d'un modèle ou d'une voix dont la licence interdit l'usage commercial des vidéos.
