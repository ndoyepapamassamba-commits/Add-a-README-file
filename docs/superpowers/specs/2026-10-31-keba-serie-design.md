# KÉBA — série d'animation muette : design du moteur

Date : 31/10/2026 — statut : validé par l'utilisateur pour les sections 1 à 3 ; pour le reste, l'utilisateur a demandé
de « construire avec les recommandations les plus pertinentes, on itérera après ».

## 1. Intention

- Une **série phare** muette, dans l'esprit burlesque de *Lamput*, **sans rien copier** (ni personnages, ni prémisse,
  ni décor), et **plus drôle**.
- Publication d'abord sur **TikTok** (vertical 1080×1920), puis **vente à une chaîne de télévision** si ça marche.
- Des **milliers d'épisodes d'une minute**, un moteur neuf, construit de zéro avec des **logiciels libres et gratuits
  greffés** (méthode des skills `rea-d-abord` et `greffer-par-rea` : chercher, démonter avec REA, greffer, mesurer).
- **Ultra fluide** : 60 images par seconde. Qualité des personnages et des décors **au-dessus de Lamput**.

## 2. Décisions prises (avec l'utilisateur)

| Sujet | Décision |
|---|---|
| Organisation | Une série phare : un héros, des poursuivants récurrents, une troupe secondaire |
| Univers | Un quartier inspiré de Dakar et de l'Afrique de l'Ouest ; muet, donc compris partout |
| Mécanique comique | Les **catastrophes en chaîne** : le héros veut aider, chaque geste déclenche pire ; ses victimes le poursuivent |
| Héros | Un gamin du quartier, 8-10 ans, serviable et plein d'énergie |
| Moteur | Approche A : marionnettes vectorielles calculées en Python, physique simulée, rendu Skia, montage ffmpeg |
| Fluidité | 60 i/s, physique à 240 pas/s, flou de mouvement, caméra sur ressorts, contrôle de fluidité |

## 3. Barre de qualité (section 1 validée)

Personnages éclairés (ombrage 2 tons, reflet, ombre au sol, contour), bibliothèque d'expressions, principes de
l'animation calculés (écrasement-étirement, anticipation, mouvement secondaire, traînée, image d'impact), décors en
couches avec profondeur et lumière de l'heure, particules, caméra qui joue le gag. Garanties : bible visuelle validée
en images par l'utilisateur **avant** l'animation ; personnages principaux réglés à la main ; contrôles automatiques sur
chaque épisode.

## 4. Architecture (section 2 validée)

Chaque brique lit des données et en écrit d'autres ; un épisode est reproductible à l'identique depuis sa **graine**
(et peut être re-rendu en 16:9 / 4K pour la télévision sans rien refaire).

```
BIBLE → CASTING → SCÉNARISTE → METTEUR EN SCÈNE → SIMULATION + ANIMATION → RENDU → SON → MONTAGE → CONTRÔLE → MP4 + fiche TikTok
```

| Brique | Module | Logiciel greffé (licence) |
|---|---|---|
| Bible | `serie/bible/*.json`, `keba/bible.py` | — |
| Casting | `keba/casting.py` | — |
| Scénariste | `keba/scenariste.py` | grammaire de maillons ; plus tard : GitHub Models (gratuit) pour les idées |
| Metteur en scène | `keba/mise_en_scene.py`, `keba/maillons.py` | — |
| Simulation | `keba/simulation.py` | pymunk 7.3.1 (MIT) — preuve REA `ev_4e0663…`, `space.py` l. 611 `on_collision` |
| Animation | `keba/courbes.py`, `keba/pistes.py`, `keba/marionnette.py` | numpy (BSD) |
| Rendu | `keba/dessin.py`, `keba/decor.py`, `keba/rendu.py` | skia-python 144.1 (BSD) |
| Son | `keba/son.py`, `keba/musique.py` | FluidSynth (LGPL, outil externe) + FluidR3_GM (MIT) ; bruitages synthétisés |
| Montage | `keba/montage.py` | ffmpeg (outil externe) |
| Contrôle | `keba/controle.py` | ffmpeg (freezedetect, ebur128) |
| Usine | sous-projet suivant | GitHub Actions |

Mesure de départ (31/10/2026, 1 cœur) : 76 ms par image 1080×1920 dessinée + encodée → rendu découpé en tranches
parallèles (une par cœur), assemblées sans ré-encodage.

## 5. Casting (section 3 présentée ; noms modifiables)

- **Kéba** (héros) : petit, grosse tête, une mèche dressée, dents du bonheur, maillot trop grand, claquettes
  « clac-clac » dont une s'envole au pire moment.
- **Tonton Bara** (boutiquier) : énorme, rond, lent, crayon sur l'oreille ; trésor : pyramide de boîtes de tomate ;
  colère : devient rouge tomate ; son : tiroir-caisse.
- **Tata Coumba** (voisine) : très grande, très mince, foulard immense qui **grandit avec sa colère** ; trésor : boubou
  neuf ; son : talons « toc-toc ».
- **Lamine & Mbaye** (car rapide) : chauffeur nerveux à lunettes noires et apprenti maigre accroché au car ; klaxon à
  trois tons. *(Arrivent à l'itération 2.)*
- **Gaïndé** (le mouton) : se prend pour un lion, fonce tête baissée : déclencheur de dominos.
- **Troupe secondaire** générée par réglages (morphologie, teintes de peau, vêtements, motifs wax), garde-fous : jamais
  confondable avec un principal, palette de la bible, aucun stéréotype dégradant.
- Avant commercialisation : vérifier la disponibilité des noms comme marques (OAPI).

## 6. Scénariste (recommandation appliquée)

- Un épisode = une **partition** JSON : lieu, distribution, liste de **maillons** (gags élémentaires paramétrés).
- Chaque maillon déclare ce qu'il **requiert** et ce qu'il **produit** (étiquettes d'état : « objets qui roulent »,
  « victime mouillée », « tissu rouge qui flotte »…). Le scénariste enchaîne des maillons compatibles par une marche
  aléatoire **graine-déterministe**, de l'intention d'aider jusqu'au bouquet final et à la poursuite.
- Structure imposée : accroche < 3 s (la catastrophe se voit venir), escalade, faux soulagement, bouquet, regard de
  toutes les victimes vers Kéba, poursuite, gag de fin qui donne envie de revoir.
- La variété vient du produit lieux × victimes × objets × maillons × paramètres ; l'itération 2 ajoute des maillons et
  des lieux (marché, car rapide, cour commune) et un modèle de langage gratuit pour proposer des idées — toujours
  vérifiées par la grammaire.

## 7. Son (recommandation appliquée)

- **Bruitages synthétisés** (numpy) : boing, tink, bonk, splash, whoosh, sifflet à coulisse, clac des claquettes,
  tiroir-caisse, bêlement ; volume dosé par la force du choc (impulsion pymunk).
- **Musique composée note à note** (MIDI → FluidSynth, banque FluidR3_GM) : marimba/kalimba façon balafon, basse,
  congas/bongos/shaker ; sections calées sur la mise en scène (calme, suspense, **silence avant la chute**, chaos,
  poursuite) et ponctuations aux chocs.
- Mixage numpy, niveau visé autour de −14 LUFS.

## 8. Contrôles (recommandation appliquée)

Bloquent l'épisode s'ils échouent : durée 55-65 s, 1080×1920, 60 i/s, piste audio présente, aucune image figée
(freezedetect), aucun saut de personnage (téléportation dans le monde), niveau sonore, partition valide.

## 9. Livrables du pilote

1. `python -m keba bible` → planches PNG (personnages, expressions de Kéba, décor) **à valider par l'utilisateur**.
2. `python -m keba episode --graine 1` → `ep0001.mp4` (60 s, 1080×1920, 60 i/s) + `ep0001.json` (partition) +
   `ep0001-tiktok.txt` (titre, légende, hashtags).
3. Tests unitaires `pytest`.

## 10. Hors périmètre du pilote

Usine de production en série et publication TikTok automatique ; format 16:9 ; Lamine & Mbaye ; lieux supplémentaires.
