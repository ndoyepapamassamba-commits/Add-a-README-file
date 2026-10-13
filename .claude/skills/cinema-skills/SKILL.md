---
name: cinema-skills
description: Chaîne de production cinématographique (Cinema Skills) — scénario, bible de style, découpage, sources (caméra / IA / stock), montage, étalonnage, son et voix, titres, export, continuité de série ; un seul look du premier au dernier plan. Se déclenche avec "cinéma", "cadrage", "lumière", "étalonnage", "montage", "son", "voix off", "bible de style", "série".
category: Vidéo
upstream: https://github.com/DenisHumen/cinema-skills (pipeline, modèles) + https://github.com/Benitoow/cinema-skills (5 skills)
source_license: MIT
triggers:
  - cinéma
  - cinema
  - cadrage
  - lumière
  - lumiere
  - étalonnage
  - etalonnage
  - montage
  - son
  - voix off
  - bible de style
  - style bible
  - série
  - serie
  - épisode
  - episode
  - scénario
  - scenario
  - chaîne de production
  - production cinématographique
---
# Cinema Skills — la chaîne de production, un seul look

Pipeline (dépôt DenisHumen/cinema-skills, structure et modèles) : **Brief → Script → Bible de style → Liste de plans → Sources
(caméra · IA · stock) → Montage → Étalonnage → Son & voix → Export**. La bible de style est la source de vérité de tout le
film : chaque étape la lit avant d'écrire un plan, un prompt, un étalonnage ou une ligne de voix off.

## Étapes et documents
| Étape | Ce qui se passe | Document / skill |
|---|---|---|
| Brief | idée, public, format, ton, références, budget | `templates/README.md` |
| Script | prémisse → structure → scènes → dialogues (Fountain) | `templates/screenplay.fountain` |
| Bible de style | palette, étalonnage, objectifs, règles de cadrage, palette sonore, voix, verrous personnages | `templates/style-bible.md` |
| Dépouillement | lieux, moments, distribution, accessoires, son, VFX, risques, ordre de tournage | skill `cinema-scene-breakdown` |
| Liste de plans | valeur de plan, angle, mouvement, focale, action, durée — identifiants stables | skill `cinema-shot-list`, `templates/shot-list.md` |
| Sources | prises caméra, images clés IA → image-vers-vidéo, stock — toutes conformes à la bible | skills `video-prompting`, `character-design`, `video-storyboard` |
| Montage | assemblage, rythme, sous-titres, export timeline | skill `cinema-cut-list` |
| Étalonnage | gestion couleur, raccord des plans, LUT de show, texture, QC | skill `cinema-color-script` |
| Son & voix | voix off, dialogue, design sonore, musique, mixage et loudness | moteur voix / son de l'app |
| Export | masters et versions plateforme (16:9 / 9:16), sous-titres, vignettes | skill `cinema-export-checklist` |

Pour une série, une **bible de série** (`templates/series-bible.md`) enveloppe la chaîne : arcs, format d'épisode, journal de continuité.

## Règles
- Une seule bible de style par projet ; tout changement est délibéré et consigné.
- Chaque plan respecte palette, lumière, objectif et grain de la bible ; les personnages gardent leurs verrous (visage, tenue, voix).
- Le montage se juge au rythme (durée des plans variée, raccords motivés), l'étalonnage au raccord entre plans, le son à la loudness et au silence utile.

## Périmètre des disciplines (README du dépôt)
`skills/*/README.md` : pipeline, scénario, réalisation, cinématographie, montage, étalonnage, son et voix, génération IA, titres et VFX, production de série.
