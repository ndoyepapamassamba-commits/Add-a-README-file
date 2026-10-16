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
npm run rendre -- --aide    # toutes les options du rendu (en français)
npm run rendre -- projets/pilote.json                     # porte qualité sur l'état seulement (quelques secondes)
npm run rendre -- projets/pilote.json --sortie ../sorties/pilote.mp4   # MP4 vérifié + rapports + planche contact
npm run voix -- --aide      # voix française d'une réplique (durées exactes des phonèmes)
npm run preparer -- --aide  # préparation d'un personnage (coutures fines, calque dessous, texture affinée)
```

Les rendus qui utilisent les décors ou les dessins privés vont **uniquement** dans `studio-troupe/sorties/` (ignoré par
git). Le kit privé (`studio-troupe/.private/kit/`) et les dessins (`studio-troupe/.private/personnages/`) sont lus sur
place, jamais copiés ; les fichiers dérivés (rig préparé, texture, voix) vont dans `studio-troupe/sorties/cache/`.

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
| `rig/` | **fait** — maillage depuis le contour (Delaunay, raffiné aux articulations, au visage et, avec `npm run preparer`, aux frontières des parties), poids en bandes étroites, skinning à centres de rotation (coudes ronds), IK analytique à deux os, chargement des `rig.json` (source ou complet) — testé |
| `anim/` | **fait** — 23 actions du catalogue (anticipation, action, dépassement, retour), couches à priorités et fondus, ressorts par os avec retard de chaîne, respiration et vie au repos, gestes calés sur les syllabes accentuées, physique secondaire analytique ; amplitudes bornées pour les dessins de trois quarts — testé |
| `visage/` | **fait** — visèmes français (13 + repos), coarticulation et arrondi anticipé, fermetures M/B/P garanties, clignements, saccades, sourcils sur les accents, émotions ; phonétiseur français à règles (+ lexique nouchi) — testé |
| `scene/` | **fait** — échelle réelle (`fit.mH`, `fit.floor`, perspective du sol), profondeur du sol, ombres de contact, étalonnage Lab partiel vers le décor, liseré de lumière ; réalisateur caméra (cadrages 9:16 et zones sûres TikTok, suivi au ressort, recadrage, panoramique, punch-in, filé raccordé à la coupe, tremblement, gel, main levée) ; parallaxe par la profondeur bornée ; analyse des décors (Node et page) — testé (voir « Scène et rendu ») |
| `rendu/` | **fait** — page PixiJS : décor 2,5D en couches (plaque sous les personnes, peinture, ciel qui dérive, figurants vivants, halos), personnages déformés (peau, visage, bouche, paupières), ombres, occultation par le décor, sous-titres, flou de bougé exact par accumulation, effets ; `window.moteur` pour l'export — parties pures testées, rendu vérifié dans Chromium |
| `export/` | **fait** — capture Playwright image par image (segments repris après arrêt), x264 BT.709, mixage audio −14 LUFS, 6 bruitages synthétisés en code, vérification intégrale (ffprobe, décodage complet, horodatage, échantillons contre captures) — testé |
| `qa/` | **fait** — porte qualité chiffrée sur l'ÉTAT (énergie, à-coups, sauts de pose, glissement des pieds, clignements, lèvres, corrélation bouche ↔ voix, vitesse de caméra) et sur les PIXELS (dynamique, images figées, sauts de lumière), planche contact — testé |
| `outils/` | kit des décors (`kit.ts`, corrections de `fit` par projet) ; personnage de test peint en code ; **voix** (`voix/`, Piper mls par onnxruntime, durées exactes, phrase porteuse, recalage sur l'énergie) ; **préparation des personnages** (`affiner/preparer.ts` : coutures fines, calque dessous, texture Real-ESRGAN) |

## Scène et rendu

### Décor 2,5D (`scene/decor.ts`, `rendu/decorRendu.ts`)

Le décor est une grille de 129 × 65 sommets (débordant de 3 % du décor) déplacée par la profondeur : un point de
profondeur `d` bouge de `(d − dRef)·décalage` (plus une poussée), `dRef` étant la profondeur du sol sous les sujets.
Seuls les mouvements « posés » de la caméra (suivi, recadrage, panoramique) créent de la parallaxe ; le punch-in, le
filé et le tremblement n'en créent pas. Le déplacement est borné à 26 px de sortie. Quatre couches, qui redonnent
exactement la peinture quand rien ne bouge :

1. la **plaque** (sans figurants), seulement sous les personnes : c'est elle qu'on voit derrière un figurant qui
   bouge ou que la parallaxe décale (pas de déchirure) ;
2. la **peinture** (`src`, deux fois plus fine que la plaque), trouée là où sont les personnes ;
3. le **ciel** (masque vert), prolongé sous les toits par push-pull, qui dérive en boucle à deux phases ; les fils et
   ampoules devant le ciel restent fixes ;
4. les **figurants** : une cellule par personne (les foules fusionnées sont découpées à la largeur d'une personne),
   respiration, balancement autour des pieds et tête vivante, phases différentes ; les masses qui ne ressemblent pas à
   une personne (bus, façades) restent immobiles ;

plus des **halos** additifs qui scintillent doucement sur les ampoules et néons. L'échelle vient du kit : une unité
monde = la hauteur du décor = `fit.mH` mètres à la ligne de sol `fit.floor` ; MODOU (1,76 m) dans un décor de 4 m
mesure 0,44 de la hauteur du décor sur la ligne de sol, moins quand il recule.

### Caméra (`scene/camera.ts`)

Fonctions pures du temps, compilées une fois par plan. Tailles de plan rapportées au sujet réel (ensemble, large,
moyen = en pied, américain, rapproché, gros plan, très gros plan) ; yeux sur la ligne des 36 % de la hauteur, pieds
à 88 % pour les plans en pied ; zones sûres TikTok (visages : x 60–860, y 250–1150 ; sous-titres : x 100–860,
y 1150–1550). En 9:16, deux personnages côte à côte doivent être proches (écart de `u` ≤ 0,12) ou étagés en
profondeur, sinon le cadre s'élargit jusqu'au décor entier. Le zoom est borné par le grossissement de l'image du
personnage (3,2 au plus). Mouvements : suivi au ressort des sujets qui marchent, `recadrer`, `panoramique`,
`punchIn` (≈ 3 % de dépassement), `file` (flou directionnel = vitesse × obturateur, coupe raccordée en vitesse),
`tremblement`, `gel` (zoom 1,08), caméra à main levée discrète (`cadrage.mainLevee`, défaut 0,35).

### Personnages (`scene/placement.ts`, `rendu/personnageRendu.ts`, `rendu/visage.ts`)

Pieds sur le sol (ou sur leur trajet de marche), ombre de contact (ellipse douce sous le corps et noyau plus sombre
sous chaque pied, qui s'efface quand le pied se lève), étalonnage Lab partiel vers les statistiques locales du décor
(gain et décalage par canal dans le shader), liseré de lumière du côté de la lumière du décor, occultation par les
objets du décor plus proches que le sol sous les pieds. Le visage est **déformé** (mâchoire, coins, regard, sourcils)
et recouvert de l'intérieur de la bouche, des dents, de la langue, puis de bandes de lèvres et de paupières prélevées
sur la peinture du personnage.

### Page de rendu et flou de bougé (`rendu/moteurRendu.ts`, `rendu/page.ts`)

Chaque sous-état (`t + k·Δt/N`) est dessiné dans une texture puis ajouté avec le poids 1/N dans un tampon en
flottants 16 bits ; le filé ajoute un flou directionnel de la longueur parcourue pendant la sous-obturation. Les
sous-états identiques à 0,35 px près ne sont dessinés qu'une fois (même résultat, coût divisé). Passe finale :
désaturation, vignette, flash, fondu, tramage ; sous-titres par-dessus (ni flous ni désaturés).

Interface pour l'export (`window.moteur`) :

```js
await moteur.charger(projet, { ressources, urlRessources: '/fichiers', flouAdaptatif: true }); // → { images, fps, … }
await moteur.rendreImage(i);            // évalue les sous-états de l'image i et la dessine
moteur.derniereMesure;                  // durées (évaluation, préparation, rendu)
await moteurFluide.capturer('jpeg', 0.92);
```

Les images sont demandées à `urlRessources + '/' + encodeURIComponent(chemin)` (lues sur place par l'appelant ; page et
ressources servies depuis la même origine). Pour des états identiques dans Node et dans la page, compléter les
ressources avant de les passer : `enrichirRessources` (`scene/analyse.ts`, analyses des décors mises en cache dans
`studio-troupe/sorties/cache/`, statistiques de couleur des rigs) ; sinon la page fait la même analyse elle-même.
Chromium : `--use-angle=swiftshader --enable-unsafe-swiftshader`.

Essai de fumée et mesures (PNG de contrôle dans `studio-troupe/sorties/rendu-fumee/`, jamais versés) :

```bash
taskset -c 0-2 npx tsx scripts/fumee-rendu.ts exemples/pilote.projet.json --images 0,45,93 --mesures ../sorties/rendu-fumee/mesures.json
taskset -c 0-2 npx tsx scripts/fumee-rendu.ts exemples/demo-camera.projet.json --sortie ../sorties/rendu-demo
```

## Le pilote : « Modou et le poulet » (`projets/pilote.json`)

Dix secondes en 1080×1920 (9:16), 30 i/s, flou de bougé exact à 4 sous-images. Un seul personnage, **MODOU**, tiré de
la fiche de l'utilisateur (dessin de trois quarts, privé), dans le décor `rue-des-maquis-marcory` du kit privé.

| Instant | Jeu | Caméra et son |
|---|---|---|
| 0 – 2 s | attendre et respirer, regard caméra, clignements | plan moyen (en pied), fondu d'entrée |
| 1,6 s | « Walay, c'est pas moi qui ai mangé le poulet ! » (voix, lèvres, sourcils sur les accents) | sous-titres mot à mot |
| 2,05 s | haussement d'épaules | |
| 3,0 s | pointe vers la caméra | |
| 3,85 s | | punch-in ×2,2 sur le visage (« poulet »), whoosh |
| 4,55 s | gel 0,5 s | scratch de disque, désaturation |
| 5,1 s | rire (secousses, main au ventre) | tremblement |
| 7,6 s | retour au calme | recadrage en 1,4 s vers le plan moyen ; ba-dum-tss à 7,9 s ; fondu de sortie à 9,5 s |

### Refaire le pilote (commandes exactes)

```bash
cd studio-troupe/moteur-fluide
# 1. Voix de la réplique (Piper mls, locuteur 16, durées exactes, fusion dans le projet)
npm run voix -- --projet projets/pilote.json --replique r1 --sortie ../sorties/voix/pilote-r1 \
  --locuteur 16 --graine 3 --modele <dossier>/fr_FR-mls-medium.onnx --python <python avec onnxruntime, onnx, numpy>
# 2. Personnage préparé (coutures fines, épaules en fondu, calque dessous, texture Real-ESRGAN ×2)
npm run preparer -- ../.private/personnages/modou --sortie ../sorties/cache/personnages/modou \
  --sd-cli <stable-diffusion.cpp/build/bin/sd-cli> --modele <RealESRGAN_x4plus_anime_6B.pth>
# 3. Porte qualité sur l'état (quelques secondes), puis rendu complet vérifié
npm run rendre -- projets/pilote.json --rig modou=../sorties/cache/personnages/modou/rig.json
taskset -c 0-2 npm run rendre -- projets/pilote.json --sortie ../sorties/pilote.mp4 \
  --rig modou=../sorties/cache/personnages/modou/rig.json
```

Crédit obligatoire dans la description de la vidéo : « Voix : Piper fr_FR mls medium (CC BY 4.0) » (voir
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)). Sans `sd-cli` ni les poids Real-ESRGAN, `npm run preparer -- … --methode bicubique` donne une texture plus douce. Sans
`--rig`, le rendu prend le `rig.json` source du dossier privé (maillage grossier, image ×2 au plus proche voisin :
pixels visibles et « dents » aux coutures — à éviter).

### Échelle du décor : pourquoi `"decors": {"rue-des-maquis-marcory": {"mH": 3}}`

`fit.mH` est la hauteur de scène, en mètres, au niveau de la ligne de sol `fit.floor`. Pour cette peinture, le kit
donne 7,38 m, ce qui rend MODOU (1,76 m) minuscule à côté des figurants assis. On l'a recalibré **par projet** en
mesurant les figurants de la peinture près de la ligne de sol : ≈ 3,0 m pour toute la hauteur de l'image (horizon
≈ 0,42). Pour calibrer un autre décor : mesurer en pixels la
hauteur d'un figurant debout (ou assis) dont les pieds sont près de `floor`, puis `mH ≈ taille réelle × hauteur de
l'image / hauteur du figurant`. La correction s'écrit dans le projet (`decors.<id>.mH`), le kit n'est pas modifié ;
la CLI l'annonce (« correction du décor … »).

### Résultats mesurés (rendu final)

Rendu du 16/10/2026 (`sorties/pilote.mp4`, rapport `sorties/pilote.rapport.md`), machine partagée (4 vCPU, autres
travaux en cours), Chromium sans écran avec SwiftShader :

| Mesure | Valeur |
|---|---|
| Vérification du MP4 | **CONFORME** : H.264 High 1080×1920 yuv420p, 30/1, BT.709, 300 images décodées sans erreur, horodatage exact, 18/18 échantillons identiques aux captures (PSNR min 45,3 dB), AAC 48 kHz de 10,000 s, −14,4 LUFS, crête −1,3 dBTP, moov en tête |
| Porte qualité sur l'état | **PASS**, 24/24 critères : énergie 0,124 H/s, part de mouvement franc 0,38, à-coups c99 324 H/s³ (≤ 3000), 0 saut de pose, glissement des pieds c95 1,13 px/image (≤ 2), 2 clignements, fermetures M/B/P 4/4, corrélation bouche ↔ voix 0,735 au décalage 0, caméra ≤ 0,55 écran/s |
| Porte qualité sur les pixels | **PASS** : 97,7 % d'images qui changent, aucune image figée hors gel, aucun saut de lumière |
| Rendu 1080×1920, flou 4 sous-images | **1,44 s par image** (1,42 s dans la page) ; capture 7 min 18 s ; commande complète 7 min 40 s pour 10 s de vidéo |
| Aperçu 540×960 sans flou | 0,15 à 0,17 s par image ; ≈ 1 min pour tout le pilote |
| Voix (Piper mls, 2 fils) | 2,3 s pour la réplique de 2,5 s (phrase porteuse comprise) |
| Préparation du personnage | 80 s la première fois (Real-ESRGAN sur CPU, 2 fils), 3 à 4 s ensuite (cache) ; 6 956 sommets, 13 076 triangles |
| Évaluation de l'état d'une image | ≈ 1 ms |

Intelligibilité de la voix (reconnaissance automatique wav2vec2 français) : « voilày c'est pas moi qui ai mangé le
poulet » — seul « Walay », mot nouchi, est entendu « voilày ».

### Ce qui est honnêtement atteint, et ce qui ne l'est pas encore

**Atteint.** Un MP4 9:16 réel, vérifié de bout en bout, avec le dessin de l'utilisateur déformé (jamais redessiné),
net et peint grâce à la texture affinée ; des gestes francs avec anticipation, dépassement et retour au calme ; la
respiration, les clignements, le regard caméra, les sourcils qui montent sur les accents ; une vraie voix française
dont la bouche suit l'énergie (corrélation 0,735, fermetures sur M/B/P) ; un décor vivant (figurants, ampoules,
bokeh) ; punch-in, gel avec scratch, tremblement au rire et sous-titres mot à mot.

**Pas encore au niveau voulu.**
- **Bras dans les grands gestes** : au rire, l'avant-bras proche passe à l'horizontale devant le ventre et se lit
  encore un peu comme une bande plate (coude arrondi « caoutchouc ») ; au haussement, les bras de trois quarts restent
  longs et fins. Un dessin unique n'a ni l'avant-bras vu de face ni la main de profil : il faudra des planches de
  poses (main, avant-bras raccourci) ou des segments découpés à part.
- **Coutures** : de petites marches restent visibles au haut de l'épaule et le long du flanc dans le gros plan figé
  (4,5–5 s).
- **Dessin source petit** (≈ 350 px de haut réels) : l'agrandisseur Real-ESRGAN réinterprète un peu les détails fins
  (moustache, dents) ; une fiche en plus haute définition réglera cela à la source.
- **Décor** : la peinture `rue-des-maquis-marcory` ne fait que 1 336 px de large ; en gros plan, l'arrière-plan est
  très flou (assumé comme un flou de profondeur).
- **Voix** : accent de France (aucune voix libre ivoirienne) ; « Walay » est prononcé « wa-la-ï » par notre
  phonétiseur, le modèle le rend proche de « voilà-y ».
- **Rythme** : après le recadrage (8–10 s), MODOU ne fait que respirer ; il faudrait une réaction finale.

## Licences

Uniquement des licences permissives ; détail et versions exactes dans
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
