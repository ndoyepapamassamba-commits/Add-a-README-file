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
| Tournage | `tourne.py` | jeu sur place, découpage mesuré, règle « tête entière ou absente » |
| Montage 9:16 | `compose.py` | sous-titres karaoké, cartes émoji Fluent (MIT), −14 LUFS |

```
python3 voix.py                         # histoire.json → voix/ + timeline.json
python3 prepare_scene.py scenes/x.png prep/x "A,B"
python3 visages.py prep/x               # environnement avec torch
python3 tourne.py montage.json sortie   # puis : python3 compose.py sortie sortie/film.mp4
```
