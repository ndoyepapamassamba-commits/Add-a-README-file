# Chaîne « troupe générée » — vidéos TikTok d'une minute, cohérentes et rapides (16/10/2026)

Production en série d'animations au format de la chaîne de l'utilisateur, à partir de personnages et de scènes
générés **dans un même style**, contrôlés par **JEV**, puis animés sur place. Les images, voix et films produits sont
privés : ils ne sont jamais dans ce dépôt (scratchpad ou `workbench/.private/`).

| Étape | Script | Outils (licences) |
|---|---|---|
| Cartes d'identité visuelles des personnages et lieux | `adn.py` | bible `coeur/studio/actor/profiles/` |
| Génération (fiches, scènes) | `horde.py`, `lot.py` | Z-Image-Turbo (Apache-2.0) via AI Horde (sans compte) |
| Juge de cohérence | `jev_juge.py` | JEV 1.14 images (TypeSafe) : identité vs fiche, taille, cadrage, texte, nombre, lieu |
| Personnage raté → fiche incrustée à l'échelle | `incruste.py` | MagicTouch, BiRefNet, LaMa ; transfert de Reinhard (2001) |
| Préparation d'une scène (une fois) | `prepare_scene.py` | Pose / Face Landmarker, MagicTouch (Apache-2.0), LaMa (Apache-2.0) |
| Texte parasite effacé | `texte.py` | EasyOCR + LaMa (Apache-2.0) |
| Visages (une fois par scène) | `visages.py` | LivePortrait (MIT) — seules bouche et paupières sont greffées, alignées |
| Voix au ton de la chaîne | `voix.py`, `f0.py`, `ecoute.py` | Piper siwis (CC-BY) / gilles (CC0), WORLD (BSD), Whisper (MIT) |
| **Animation par outil** (plan par plan, arbitrée par JEV) | `anime_ia.py` | Wan2.2-S2V (Apache-2.0) : image + voix → bouche, tête, buste, gestes ; API Alibaba Model Studio (clé `DASHSCOPE_API_KEY`) ou Space public Wan-AI, ou ComfyUI + Wan (local, ou sur une carte T4 GRATUITE du compte Kaggle de l'utilisateur, pilotée d'ici : `kaggle_moteur.py` + `noyau_kaggle.py`, rien à installer sur le PC) ; JEV garde le plan de l'outil seulement s'il est fidèle, sans déformation et plus vivant ; sinon le plan du moteur reste |
| Visèmes depuis l'audio | `levres.py` | Rhubarb Lip Sync (MIT), mode phonétique (les voix Piper utilisées ne donnent pas d'alignement) |
| Tournage | `tourne.py` | jeu sur place, découpage mesuré, règles « tête entière ou absente » et « pas de corps sans tête », aucun plan < 0,5 s ; mâchoire paramétrique quand LivePortrait n'ouvre pas la bouche (barbe, lunettes noires) ; acteur en bicubique, cadre sous-pixel |
| Montage 9:16 | `compose.py` | sous-titres karaoké, cartes émoji Fluent (MIT), −14 LUFS |
| Contrôle avant livraison (tests 1–6, 5 bis) | `controle_video.py`, `mesure2.py`, `levres_roi.py` | durée, cadence, décodage, sonie EBU R128, images noires et gels, fluidité, lèvres mesurées sur l'image rendue (pistes de visages par plus proche voisin ; 5 bis : visage du locuteur retrouvé par corrélation, toutes les répliques), Whisper |
| Œil de JEV sur le film (test 7) | `jev_plans.py` | tête coupée, visage déformé, artefacts, style, une image par plan |
| Preuve différentielle (test 8) | `jev_diff.py`, `jev_paires.py` | même plan avant / après animation ; témoins « identique » et « encodage seul » pour séparer moteur, compression et bruit du juge |

```
python3 voix.py                         # histoire.json → voix/ + timeline.json
python3 prepare_scene.py scenes/x.png prep/x "A,B"
python3 visages.py prep/x               # environnement avec torch
python3 levres.py timeline.json        # visèmes Rhubarb → timeline.json
python3 tourne.py montage.json sortie   # puis : python3 compose.py sortie sortie/film.mp4
python3 controle_video.py sortie/film.mp4 timeline.json sortie/tournage.json sortie/controle.json
python3 jev_plans.py sortie/film.mp4 sortie/tournage.json sortie/jev_plans.json
python3 jev_diff.py sortie/film.mp4 sortie/tournage.json sortie/source sortie/jev_diff.json
python3 levres_roi.py sortie/film.mp4 timeline.json montage.json sortie/levres_roi.json
# animation par outil : préparer les plans parlants, animer, réinsérer (JEV arbitre), puis remonter
python3 anime_ia.py prepare sortie timeline.json && python3 anime_ia.py genere sortie dashscope && python3 anime_ia.py insere sortie
# même chose sur une carte graphique gratuite (Kaggle), sans rien installer sur le PC (jeton KAGGLE_API_TOKEN dans l'environnement)
pip install kaggle && python3 kaggle_moteur.py a-blanc sortie s2v      # contrôle du paquet et du carnet, rien n'est envoyé
python3 anime_ia.py genere sortie kaggle && python3 anime_ia.py insere sortie
```

### ComfyUI + Wan sans PowerShell (16/10/2026)

L'organisation de l'utilisateur interdit l'installation par PowerShell : la carte graphique est donc empruntée à distance.

| Fichier | Rôle |
|---|---|
| `kaggle_moteur.py` | Dépose les plans parlants (image + son exact, `config.json`) dans un jeu de données **privé** du compte Kaggle de l'utilisateur, lance le carnet sur une T4, attend la fin et rapatrie `<cle>.mp4` + `kaggle_mesures.json` (temps mesurés, mémoire maximale, erreurs). Commandes : `a-blanc`, `envoie`, `suit`, `tout`, `quota`. |
| `noyau_kaggle.py` | Tourne sur la T4 : ComfyUI figé (0.41.0, commit `fc04da9`) + ComfyUI-GGUF figé (`6ea2651`) installés dans `/tmp`, kit téléchargé en parallèle, version GGUF choisie d'après la mémoire de la carte, un serveur par carte, contrôle « vidéo noire », mesures écrites au fil de l'eau. Essai hors Kaggle : `NOYAU_ESSAI=1`. |
| `comfy_wan.py` | Graphes ComfyUI Wan2.2-S2V et InfiniteTalk (une ou deux voix), chargeur fp8 ou GGUF, client HTTP (adresse par serveur). |
| `modeles_wan.json`, `installer_comfyui_wan.sh` | Manifeste des fichiers du kit (liens vérifiés) et installation Linux/macOS. `installer_comfyui_wan.ps1` reste pour les postes Windows où PowerShell est permis. |

Contrôles du 16/10/2026 sur le ComfyUI d'essai : graphes S2V et InfiniteTalk en GGUF acceptés par le serveur (`node_errors` vide), exécution lancée jusqu'au chargement des fichiers ; noyau exécuté de bout en bout en mode essai (21 plans, 51,7 s à animer) ; paquet de 10,5 Mo ; récupération des versions figées vérifiée ; refus propre sans jeton ou avec un jeton invalide. Le temps réel sur T4 sera celui écrit par le noyau dans `kaggle_mesures.json` au premier passage.

### Corps entier, visage dessiné, regard et décor contrôlé (17/10/2026)

Chaque scène est préparée **une fois** (`prepare_rig.py prep/<scène>`, résultat dans `<scène>/rig/`), puis tous les épisodes
tournés dans ce lieu la réutilisent. `tourne.py` l'utilise dès que `"rig": 1` est dans les réglages du montage.

| Étape | Module | Ce qui est fait | Outils (licences) |
|---|---|---|---|
| Découpe de chaque personne entière | `rig2d.decoupe` | segmentation « personne », pièce reliée au cœur de l'ancien masque, bords par filtre guidé ; **les meubles restent au décor** : là où MediaPipe dit « personne » et ADE20K dit « chaise », la couleur tranche (GrabCut local) | MediaPipe (Apache-2.0), UperNet ConvNeXt ADE20K (MIT, ONNX), OpenCV GrabCut (Apache-2.0) |
| Pixels orphelins | `prepare_rig.orphelins` | tout pixel « personne » sans propriétaire est rattaché à l'acteur le plus proche (bande de robe coincée entre deux acteurs) | — |
| Squelette affiné | `prepare_rig.squelette` | pose re-détectée sur le recadrage agrandi ×2 de chaque acteur, gardée si elle est meilleure (visibilité × articulations dans la découpe) | Pose Landmarker heavy (Apache-2.0) |
| Décor sans acteur | `plaque.py` | remplissage progressif à pleine résolution, grain rendu, **restes et objets inventés rebouchés** (couleur absente du décor autour, ou personne), fils prolongés jusqu'à leur appui, parties cachées complétées | LaMa (Apache-2.0), LSD (OpenCV) |
| Contrôle de cohérence | `coherence.py` | restes de personne, netteté reconstituée, découpes, et l'œil de JEV (fil dans le vide, objet coupé, flotte, membre, texte, ombres, échelle ; taches et restes dans la plaque) | JEV 1.14 (TypeSafe) |
| Squelette 2D de la tête aux pieds | `rig2d.py` | ARAP sur grille (cœurs rigides, articulations libres), mains et avant-bras en calques, tête en 3D (relief du visage), **enveloppe mesurée** de chaque mouvement (buste, tête, épaules, bassin, souffle, lacets de tête et de buste) que le jeu ne dépasse jamais | SciPy (BSD) |
| Expressions dessinées | `expressions_lp.py`, `lp_onnx.py`, `prepare_expressions.py` | 15 émotions × 4 ouvertures de bouche + yeux clos par personnage ; **recette cherchée pour chaque visage** (recette de base, « sourcils + », « bouche + », recettes de rechange, jugées en parallèle par l'œil de JEV : la plus lisible qui n'abîme pas ce visage, défaut toléré +0,12 au neutre) ; passage d'une émotion à l'autre par **morphing** (flux optique DIS), pas de fondu | LivePortrait (MIT, ONNX Runtime), JEV 1.14 |
| Jeu | `jeu.py` | ressenti (événements des répliques), orientation de la tête et du regard vers l'interlocuteur, regard vers le bas quand on est triste, ressorts amortis | — |
| Caméra | `tourne.py` (`cadres_du_plan`, `frame_scene`) | glissement vers le côté libre, **grue** (toute la place en hauteur, un plan sur deux) et **travelling avant** (`pousse`, 10 %) validés par la règle « tête entière ou absente » ; parallaxe latérale ET avant : pendant la poussée le décor lointain grossit moins que les acteurs (z^kpar, carte de profondeur) ; `TOURNE_CADRES=1` écrit les cadres de chaque plan sans rien rendre | Depth Anything V2 (Apache-2.0, carte déjà préparée) |
| Mesure | `cadre.py`, `mesure2.py` | mêmes instruments que pour les TikTok de l'utilisateur | — |

```
python3 prepare_rig.py prep/cour                 # une fois par scène (cache : la plaque est reprise si les découpes n'ont pas changé)
python3 prepare_expressions.py prep/cour         # une fois par personnage et par scène (≈ 6 min par personnage sur 4 cœurs)
ETIREMENT=1 python3 tourne.py montage.json sortie [sketch]   # ETIREMENT=1 : étirement, pose et ressenti mesurés image par image
python3 cadre.py juge sortie/film.mp4            # tableau film / TikTok / studios
```

Mesures du 17/10/2026 (sketch « la cachette », 22,5 s) : étirement du corps (99e centile, médiane des images) Baye 4,2 %,
Maman 3,7 %, Petit Mamadou 2,9 % ; 8 mesures sur 9 dans la fourchette des TikTok de l'utilisateur ; rendu 670 images en
≈ 2 min 30 sur 4 cœurs ; colère de Petit Mamadou lisible à 0,76 selon JEV (défaut 0,27).
