# Moteur fluide de la troupe

Moteur d'animation **écrit en code**, gratuit, qui tourne sur un simple processeur. Il anime les personnages de la
troupe (style cartoon « Pixar » ouest-africain) dans les décors peints d'Abidjan, avec dialogue en français et
lèvres synchronisées, et exporte un MP4 vertical 9:16 vérifié.

Ce qui le distingue des essais précédents (« trop lego », « irréel », mouvement trop faible ou saccadé) :

- **les dessins ne sont jamais redessinés** : on déforme l'image peinte (maillage + squelette), on ne la remplace pas
  par des formes géométriques ;
- **le mouvement est fort et lisible** : anticipation, action, dépassement, retour au calme, respiration, clignements,
  grâce à des ressorts du second ordre **résolus exactement** (aucune intégration pas à pas, aucune dérive) ;
- **tout est une fonction pure du temps** : `evaluer(projet, t)` donne l'état complet d'une image, à n'importe quel
  instant, dans n'importe quel ordre — 30 ou 60 i/s, flou de bougé exact par sous-instants, reprise d'un rendu
  interrompu.

La conception complète (et ce qu'on apprend de chaque moteur existant) est dans [CONCEPTION.md](CONCEPTION.md).

## Commandes

```bash
npm install                 # dépendances aux versions exactes (navigateurs Playwright déjà installés : ne pas lancer « playwright install »)
npm test                    # tests (vitest, 2 fils au plus)
npm run typecheck           # vérification TypeScript stricte
npm run verifier            # les deux
npm run build               # page de rendu : src/rendu/page.ts → dist/page.html + dist/page.js
npm run rendre -- exemples/pilote.projet.json            # valide le projet et évalue toutes les images
npm run rendre -- exemples/pilote.projet.json --sortie ../sorties/pilote.mp4   # MP4 (module export à brancher)
npm run rendre -- --aide
```

Les rendus qui utilisent les décors ou les dessins privés vont **uniquement** dans `studio-troupe/sorties/` (ignoré par
git). Le kit privé (`studio-troupe/.private/kit/`) est lu sur place, jamais copié.

## Architecture

```
src/
  timeline/types.ts   CONTRAT PARTAGÉ : géométrie, squelette, pose, rig, visage, états d'une image, format du projet,
                      fournisseurs injectés, pont rendu ↔ export
  noyau/              temps, aléa à graine et bruit simplex, courbes, ressorts analytiques, pistes à clés, maths 2D
  timeline/           evaluer(), projet (validation), temps du jeu (gel, ralenti), répliques, trajets au sol, repères
  rig/                squelette, IK, maillage depuis le masque, poids, déformation     → deformer(rig, pose)
  anim/               actions, couches, chevauchement, micro-vie, physique secondaire   → fournisseurPose
  visage/             visèmes français, coarticulation, yeux, sourcils, prosodie        → fournisseurVisage
  scene/              décor 2,5D, placement au sol, ombres, caméra et réalisateur       → fournisseurPlacement/Camera/Decor
  rendu/              page PixiJS (Chromium) qui dessine les états                     → window.moteurFluide
  export/             capture Playwright, encodage FFmpeg, ffprobe, commande « rendre »
  qa/                 porte qualité chiffrée (PASS / FAIL)
  outils/             préparation hors moteur (kit des décors, personnages, voix)
  assemblage.ts       branche les fournisseurs des modules dans evaluer()
```

### Comment les modules se branchent (injection)

`evaluer(projet, t, moteur)` n'importe aucun module. Chaque module exporte des **fournisseurs** (fonctions pures dont
le type est dans `types.ts`) et `src/assemblage.ts` les injecte :

| Fournisseur | Module | Signature |
|---|---|---|
| `pose` | `anim/` | `(ctx: ContextePersonnage) => Pose` |
| `visage` | `visage/` | `(ctx: ContextePersonnage) => EtatVisage` |
| `placement` | `scene/` | `(ctx: ContextePersonnage) => PlacementMonde` |
| `camera` | `scene/` | `(ctx: ContexteImage, personnages) => EtatCamera` |
| `decor` | `scene/` | `(ctx: ContexteImage, camera) => EtatDecor \| null` |
| `sousTitres`, `sons`, `effets` | `timeline/` (défaut) | `(ctx: ContexteImage) => …` |

Ordre d'évaluation : plan actif → temps du jeu → pour chaque personnage : placement, pose, visage → tri par ordre de
dessin → caméra → décor → sous-titres → sons → effets. Tant qu'un module n'est pas prêt, un fournisseur neutre
(`timeline/fournisseursNeutres.ts`) donne un état valide.

### Règles communes

- **Pureté** : aucun état caché, aucune information d'une image à l'autre. L'aléa vient des hachages de
  `noyau/aleatoire` (`hash01(graine, canal, indice)`), jamais de `Math.random`.
- **Temps** : utiliser `ctx.tJeu` pour tout ce qui « joue » (corps, visage, figurants) — il se fige pendant un gel —
  et `ctx.t` pour la caméra.
- **États sérialisables** en JSON (pas de `Map`, pas de tableaux typés) : ils traversent `page.evaluate`.
- **Repères** : temps en s, angles en rad (positif = horaire à l'écran), repère monde = décor mis à l'échelle de sa
  hauteur (`x ∈ [0, aspect]`, `y ∈ [0, 1]`), projets écrits en fractions du décor `{u, v}`, `G`/`D` = côté du
  personnage. Une seule définition des matrices : `timeline/projection.ts`.
- **Ressources** chargées avant l'évaluation (`Ressources.rigs`, `Ressources.decors`), jamais pendant.
- **Processeur partagé** : au plus 2 à 3 fils pour les travaux lourds.
- Tout ce qui est montré à l'utilisateur est en **français**.

## État des modules

| Module | État |
|---|---|
| `noyau/` | **fait** — temps, aléa et bruit simplex 1D/2D, courbes (easing, Bézier de temps, Hermite, Catmull-Rom centripète), ressorts analytiques (ζ < 1, = 1, > 1 ; marches et rampes ; Vec2 et angles), pistes à clés avec filtre ressort, inertialisation quintique, maths 2D — testé |
| `timeline/` | **fait** — contrat partagé, `evaluer` pur avec injection, validation des projets, gel et ralenti, fondus, sous-titres, trajets au sol, repères — testé |
| `rig/` | à construire (ébauche : maillage au repos) |
| `anim/` | à construire (ébauche : pose de repos) |
| `visage/` | à construire (ébauche : visage neutre) |
| `scene/` | à construire (ébauche : modèle de sol du kit, caméra posée, décor immobile) |
| `rendu/` | à construire (ébauche : PixiJS initialisé, fond uni, capture) |
| `export/` | à construire (ébauche : `rendre` valide et évalue ; aucun MP4 n'est annoncé sans fichier réel) |
| `qa/` | à construire (types du rapport) |
| `outils/` | lecture du kit des décors (`outils/kit.ts`) ; le reste à construire |

## Licences

Uniquement des licences permissives ; détail et versions exactes dans
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
