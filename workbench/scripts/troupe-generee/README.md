# Chaîne « troupe générée » — vidéos TikTok d'une minute, cohérentes et rapides (16/10/2026)

Production en série d'animations au format de la chaîne de l'utilisateur, à partir de personnages et de scènes
générés **dans un même style**, contrôlés par **JEV**, puis animés sur place. Les images, voix et films produits sont
privés : ils ne sont jamais dans ce dépôt (scratchpad ou `workbench/.private/`).

| Étape | Script | Outils (licences) |
|---|---|---|
| Cartes d'identité visuelles des personnages et lieux | `adn.py` | bible `server/jev/studio/actor/profiles/` |
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
