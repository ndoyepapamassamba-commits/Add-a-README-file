# Comment la vidéo pilote « Modou et le poulet » a été réalisée

Note à transmettre à une autre session qui bute sur un moteur d'animation 3D. Code dans le dépôt
`ndoyepapamassamba-commits/Add-a-README-file`, branche `claude/youthful-pasteur-7wbiqt`, dossier
`studio-troupe/moteur-fluide/` (lire `README.md`, puis `CONCEPTION.md`). Les dessins de la troupe et les décors sont
privés : ils ne sont pas dans git.

## 1. Le choix de fond : pas de 3D, on déforme le dessin lui-même

- Le personnage, c'est **l'image du propriétaire** (fiche de Modou, détourée) : on en tire un maillage triangulé depuis
  le contour, on le raffine aux articulations et au visage, puis on pose un squelette (épaules, coudes, poignets,
  hanches, genoux, chevilles, cou, tête) et des poids en bandes étroites. La peau est déformée par skinning. Une greffe
  ARAP (« aussi rigide que possible », Animated Drawings de Meta, licence MIT) est en cours pour les grands gestes.
- Pourquoi : l'essai Blender/3D précédent faisait « lego ». Le maillage reconstruit perdait le rendu peint, et le
  mouvement était trop faible (porte qualité du film 9 : mouvement 0,0271). En déformant le dessin, l'identité et le
  style restent exacts.
- Texture : le dessin (883 px de haut) est remis à sa définition native, puis agrandi ×4 avec Real-ESRGAN anime
  (poids BSD-3, via `sd-cli`), alpha lissé (`src/outils/affiner/`).

## 2. Le mouvement : une fonction pure du temps, avec des ressorts résolus analytiquement

- Tout passe par `evaluer(projet, t) → état de l'image` : pas de pas de temps, pas de dérive, rendu possible à
  n'importe quelle cadence et dans n'importe quel ordre.
- **Ressorts du second ordre en forme fermée** (`src/noyau/ressorts.ts`, paramétrage f, ζ, r de t3ssel8r) :
  `y'' + 2ζω·y' + ω²·y = ω²·(x + k3·x')`, avec `ω = 2πf` et `k3 = r·ζ/ω`. La consigne est une somme de marches et de
  rampes ; la réponse est la somme exacte des réponses élémentaires.
  - ζ < 1 donne le dépassement et le retour au calme (follow-through, settle).
  - r < 0 donne l'anticipation.
  - Les os lourds ont une fréquence basse, la tête et les mains une fréquence haute : le décalage entre os
    (overlap) vient tout seul.
- **Actions = recettes paramétrées** (`src/anim/actions.ts`) : anticipation → action → dépassement → retour, avec un
  décalage par os. Exemples : respirer, attendre, regarder, hausser les épaules, pointer, rire, gestes de parole.
  - **Amplitudes plafonnées** pour un dessin de trois quarts : épaule ≤ 5 % de la hauteur ; pli du coude au rire
    ≤ 78° ; pendant le rire, seul le bras proche vient au ventre, sinon l'avant-bras paraît dédoublé.
- **Couches** (`src/anim/couches.ts`) : une base (attente, respiration) plus des gestes additifs, avec priorités,
  masques par os, fondus et interruptions. Le tout passe ensuite par les ressorts.
- **Flou de mouvement exact** : 4 sous-images par image (obturateur 0,5), possible justement parce que `evaluer` est
  pur.

## 3. Ce qui l'a ancré dans le décor (il flottait au début)

- **Choisir un décor dont le sol est visible** sous les pieds : dans « maquis », le sol n'est que tables et chaises.
- **Sol tiré de la carte de profondeur** : plan ajusté avec r² = 0,9997, plus une grille de « sol praticable » qui
  déclenche un avertissement si un pied tombe sur une table (`src/scene/sol.ts`).
- **Échelle** donnée par la hauteur de scène du décor. Celle du kit (`mH` 7,38) était fausse : elle a été recalée à
  3,0 sur les figurants.
- **Ombres de contact** par semelle, chacune sur la ligne de sol de son propre pied, plus une ombre du corps
  (`src/rendu/ombres.ts`).
- **Pieds verrouillés** (glissement mesuré : 0,54 px par image).
- **Occultation par la profondeur** : les objets plus proches passent devant le personnage.

## 4. Voix et lèvres

- Voix Piper « mls » (CC-BY, usage commercial permis), locuteur 16. Les durées exactes de chaque phonème sont tirées
  de la synthèse et fusionnées dans le projet (`src/outils/voix/`).
- Visèmes français avec coarticulation (anticipation d'environ 40 à 80 ms), clignements, sourcils sur les syllabes
  accentuées. Corrélation entre ouverture de la bouche et énergie de la voix : 0,70 à 0,73, sans décalage.

## 5. Rendu et export vérifié

- Rendu PixiJS v8 (WebGL) dans Chromium sans écran, piloté par Playwright 1.56. Capture d'environ 0,2 s par image en
  540×960.
- Encodage FFmpeg : H.264 High, yuv420p, CRF 18, AAC 48 kHz, sonie −14 LUFS, faststart.
- Vérification ffprobe et décodage intégral : nombre d'images exact, aucun doublon, audio aligné à une image près.
- **Porte qualité sur l'état du moteur** : énergie de mouvement minimale ET maximale (c'est ce qui manquait au
  film 9), à-coups, glissement des pieds, corrélation bouche/voix, détection d'immobilité, vitesse de caméra.

## 6. Leçons transposables à un moteur 3D (Three.js, Blender…)

1. Évaluer l'animation comme une **fonction pure du temps**, et filtrer chaque canal d'articulation par un **ressort
   du second ordre analytique**. Le dépassement, l'anticipation et le décalage entre os viennent sans images clés
   supplémentaires.
2. Construire les gestes comme des **recettes anticipation → action → dépassement → retour**, avec des amplitudes
   **calibrées sur les poses dessinées** par l'auteur : mesurer les angles des articulations sur les poses neutre,
   accuse, choc, haussement et rire.
3. Pour les grands mouvements naturels : **capture de mouvement BVH reciblée** (base CMU, usage commercial permis),
   plutôt que des images clés à la main.
4. Mettre une **porte qualité avec un mouvement minimum** : refuser automatiquement un rendu trop « sage ».
5. Ancrer au sol : contact par pied, ombres de contact, occultation par la profondeur, échelle calibrée.
6. Rendre de façon déterministe (cadence fixe, temps virtuel), avec un flou de mouvement par sous-images.
7. Si on garde la 3D : **projeter le dessin original sur le maillage** (projection depuis la caméra) au lieu de le
   retexturer, sinon on perd le rendu peint (c'est l'effet « lego »).
