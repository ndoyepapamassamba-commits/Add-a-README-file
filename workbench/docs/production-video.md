# Chaîne de production vidéo — outils puissants, gratuits, sans abonnement

État au 14/10/2026. Règles de l'utilisateur : outils **puissants mais gratuits**, **sans abonnement** ; chercher
d'abord les meilleurs outils à chaque requête, les améliorer, les intégrer (compétence
`.claude/skills/outils-puissants-d-abord`). Une vidéo doit sortir en **minutes**, pas en heures.

## 1. Diagnostic du film 5 (« Les tomates de Maman Nounou », noté 10/100)

Audit image par image, comparé aux vidéos de la chaîne de l'utilisateur :

| Défaut constaté | Cause | Réponse |
|---|---|---|
| Bouches et traits du visage qui se déforment (menton étiré) | la bouche s'ouvrait en ÉTIRANT le dessin sous la ligne des lèvres | visage vivant appris (LivePortrait, MIT) — §3 |
| Clignements = ovales orange plats collés sur les yeux | paupières dessinées en aplat de couleur | supprimés : les yeux se ferment dans l'image produite par le modèle |
| Acteurs statiques | une seule image par pose ; seule la mâchoire bougeait | visage vivant ; ensuite corps (respiration, gestes sur les mots forts) |
| Arrière-plan inanimé, flou | foule peinte figée ; profondeur de champ forte | à traiter : flou réduit, foule peinte animée (§4) |
| Pose de fou rire pendant une réplique parlée | l'histoire impose `rire` sur « Pour toi, mon fils ? Mille francs. » | à traiter : sourire produit par le modèle sur le dessin neutre (§4) |
| Gros plan qui coupe le visage, titre sur la tête | cadrage du premier plan | à traiter (§4) |
| 3 h de calcul pour 64 s | modèle exécuté image par image sur le processeur | animation par remplacement (§3) + aperçu rapide (§3) |

## 2. Veille — ce qui existe et ce qui est retenu

| Capacité | Outil | Licence | Gratuit sans compte ? | Mesures / sources | Verdict |
|---|---|---|---|---|---|
| Visage vivant depuis un dessin | LivePortrait (KwaiVGI / Kling) | MIT | oui (local) | **mesuré** : 7,9 s/image sur 4 cœurs CPU | **intégré** (`scripts/blenderfilm/liveface.py`) |
| LivePortrait accéléré | FasterLivePortrait (ONNX / TensorRT) | MIT | oui (local) | **mesuré** 17,6 s/image en ONNX sur ce CPU ; 30+ i/s sur RTX 3090 (annoncé) | pour un GPU |
| Plans animés image → vidéo (ouvert) | Wan 2.2 (TI2V-5B, Animate-14B) | Apache-2.0 (annoncé) | oui sur GPU local | 5B : GPU 24 Go ; 14B : 80 Go (officiel) | sur GPU de l'utilisateur s'il en a un |
| Lip-sync sur vidéo | LatentSync (ByteDance) | Apache-2.0 | oui sur GPU local | 8–18 Go VRAM | sur GPU |
| Lip-sync rapide | MuseTalk (Tencent) | MIT (à revérifier) | oui sur GPU local | 4 Go VRAM | sur GPU |
| Vidéo + son | LTX-2 (Lightricks) | licence maison (< 10 M$ de revenus) | — | — | hors règle MIT/Apache |
| Vidéo → mocap | GVHMR | non commercial | — | — | refusé |
| Visage 3D depuis la voix | NVIDIA Audio2Face-3D | NVIDIA Open Model License | — | — | hors règle |
| Plans animés avec voix | Veo 3.1, Grok Imagine, Kling 2.6/3.0 | API payantes | **non** | ≈ 0,04–0,40 $/s selon modèle (tiers, 2026) | non proposés (payants) |
| GPU loué | Runpod, Modal, Kaggle | services à compte | **non** | — | non proposés (compte requis) |

## 3. Ce qui est intégré maintenant

**Visage vivant par remplacement** (`liveface.py`, appelé par `film.py`) :
- une BIBLIOTHÈQUE d'états par pose de chaque personnage (5 ouvertures de lèvres × yeux ouverts / mi-clos / fermés),
  calculée UNE fois par LivePortrait et gardée dans le kit privé (`.private/troupe/visages/`) ;
- chaque film pioche, image par image, l'état le plus proche de sa voix et de ses clignements (liens physiques, pas
  de copie) ; Blender lit la suite d'images sur la carte de la pose (`scene.py`), sans étirer le dessin ni poser de
  paupière plate ;
- coût : ≈ 2 min par pose la première fois sur ce processeur, ~0 s par film ensuite ; secondes sur un GPU.

**Aperçu rapide** (« processeur fictif ») : `film.py --apercu` — demi-résolution, 4 échantillons, une image rendue sur
trois — pour valider histoire, lieux, cadrages et voix en quelques minutes ; le rendu final se lance sans l'option.

**Lieux d'Abidjan** : 8 planches de l'utilisateur → vues nommées, groupées par lieu, à l'échelle de la foule peinte ;
un film change de vue d'un même lieu entre deux plans (`lieux-planches.py`, `plan.py`).

**Corps vivants** (`scripts/blenderfilm/acting.py`, testé) : le corps joue la voix — en parlant, le buste se penche
vers le partenaire et la tête le suit ; battement des syllabes, respiration visible, report du poids toutes les 2,5 à
4,5 s, hochements d'écoute. **Mesuré dans Blender** (film 6) : la tête de Nounou se déplace de 6,8 cm vers Modou quand
elle parle (≈ 1 cm avant : la tête tournait contre le buste et annulait le penché).

**Caméra qui suit le visage** (`scene.py`, `follow_faces`) : dans un gros plan (cadre ≈ 30 cm), le penché faisait
sortir le visage ; la caméra reprend 85 % du déplacement réel de la tête, lissé sur 0,4 s, comme un cadreur.

**Foule peinte vivante, personne par personne** (`crowd.py`) : la segmentation voyait la foule du Grand Marché comme
UNE tache (99,7 %) — animée telle quelle, toute la foule aurait glissé d'un bloc. Mask R-CNN (torchvision, BSD-3)
sépare 27 personnes (49 s par vue, une fois) ; chacune se balance et respire à son rythme, **pieds fixes**, sans
déchirure entre voisins (champ lissé, étirement local ≤ 9 %). Vérifié par A/B dans Blender (`--decor-fixe`).

**Lèvres** (`lipsync.py`) : Rhubarb Lip Sync (MIT) ferme la bouche sur m / b / p par-dessus l'ouverture au volume de
la voix (mesuré : ses fermetures tombent 2,25× plus dans les mots à m/b/p ; ses autres formes, apprises sur l'anglais,
ouvraient moins que la voix → écartées).

**Plans à deux au format de la chaîne** (`finish.py`) : le carré net se pose sur les visages du plan (positions
mesurées par `scene.py`, `ecran-plans.json`) — au milieu fixe, les têtes tombaient dans la bande floue.

**Son** : compression douce des dialogues avant la normalisation quand le gain linéaire ne peut atteindre −14 LUFS
(film 6 : −15,2 → −14,2 LUFS, crête −0,8 dBFS).

**Vitesse mesurée** : aperçu complet du film 6 (64 s, 1 600 images, demi-résolution, une image sur trois) en
**14 min 54 s** sur 4 cœurs de processeur — contre ≈ 3 h pour le film 5.

### 3 bis. Le réalisateur (14/10/2026) — prompt → consignes de jeu validées → moteur, 0 $ de vidéo
- `scripts/blenderfilm/director.py` tourne avant `plan.py` (`film.py`, désactivable par `--sans-realisateur`). Pour chaque
  réplique : la pose dessinée de celui qui parle, un **geste capturé** (étiquette de `direction-vocab.json` → clip CMU),
  l'**énergie** (dose l'amplitude du clip), les **réactions** des partenaires présents, un mouvement de caméra.
- Trois réalisateurs combinés « règles d'abord, modèle pour les trous » : règles mesurables (mots du vocabulaire, « ?! »,
  chute, pose demandée) ; modèle local llama.cpp (MIT) + Qwen3 1,7B (Apache-2.0, `~/.cache/massamba-models/llm/`) ;
  modèle gratuit OpenRouter (« :free », une requête par film, clé dans l'environnement). Le modèle n'écrit jamais de bpy.
- Mesuré sur le film 6 : règles en 0,2 s ; modèle local en 161 s (5,3 jetons/s sur 4 cœurs) ; une réaction proposée par le
  modèle n'est gardée que sous déclencheur (question, cri, chute, énergie ≥ 0,7).
- Dans l'app : onglet **Réalisateur** du Studio 3D Pro — « QUI : réplique » → consignes validées → `story.directed.json`
  à donner à `film.py --story`. Même vocabulaire (`server/jev/studio/stageDirections.ts`).
- Gestes disponibles (25) : rire, joie, triste, pleure, peur, dispute, explique, pointe, haussement, salut de la main,
  révérence, bâille, poignée de main, tape dans la main, menace, frappe, boit, mange, téléphone, cherche, réfléchit,
  ramasse, lance, balaie, danse.
- Entrées en scène stylées (100STYLE, CC BY 4.0, lecteur BVH, clips lus un par un dans le zip Zenodo) : colère, fier,
  frimeur, ivre, pressé, joyeux, abattu, zombie, discret, téléphone, vieux, normal — choisis d'après la première réplique
  de l'acteur, l'accroche, puis sa fiche (âge ≥ 60 → vieux).
- Budget de mouvement (mesuré sur le film 6 : 14 gestes sur 18 répliques → mouvement 0,0294 > 0,027 de la chaîne) : la
  moitié la plus forte des répliques garde son geste ; les gains vont de 0,35 à 0,9, sous les limites cartoon.
- Réactions proposées par le modèle : seulement sur un cri, la chute ou une réplique énergique, et jamais en gros plan
  sur celui qui réagit (mesuré : un dessin qui claque plein cadre = saut de lumière, faux raccord).

## 4. Feuille de route (gratuit, sans abonnement)

1. Expressions produites par le modèle sur le dessin neutre (sourire, sourcils, regard) au lieu de changer de dessin ;
   formes de bouche par voyelle (a / é / ou) depuis les phonèmes de la voix.
2. Corps : respiration, balancement du poids, gestes calés sur les mots forts (animation procédurale, instantanée).
3. Décor vivant : foule peinte animée personne par personne (masque de la segmentation), parasols et feuillages qui
   bougent, flou de fond réduit.
4. Cadrages : plans moyens et larges comme les vidéos de référence, jamais de visage coupé, titre hors du visage.
5. Sur la machine de l'utilisateur, s'il a une carte graphique NVIDIA : Wan 2.2 (Apache-2.0) anime les plans entiers
   à partir de l'image de départ rendue par Blender (lieu, troupe, mise en scène cohérents d'un plan à l'autre).
