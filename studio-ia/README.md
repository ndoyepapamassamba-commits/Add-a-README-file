# Studio IA — sketchs d'Abidjan pour TikTok

Chaîne de production de micro-sketchs 3D (style Pixar), personnages ivoiriens, voix à l'accent d'Abidjan,
assemblés en compilations d'au moins 62 s (seuil de monétisation).

| Étape | Outil | Coût mesuré |
|---|---|---|
| Image de départ 4:3 | `google/gemini-3.1-flash-lite-image` (OpenRouter) | 0,034 $ |
| Vidéo parlante 6 à 10 s, 480p | `x-ai/grok-imagine-video-1.5-lite` (OpenRouter) | 0,02 $/s + 0,01 $ |
| Contrôle du dialogue | faster-whisper (local, gratuit) | — |
| Habillage et compilations | ffmpeg (local, gratuit) | — |

Environ 0,18 $ par sketch.

## Fichiers

- `sketchs/lot1.json` … `lot4.json` : les 100 sketchs (décor, personnages, poses, dialogue, jeu d'acteur, emoji, mots-clés colorés).
- `generer.py` : images → vidéos → contrôle. Ne relance jamais une vidéo déjà payée ; s'arrête avant d'épuiser la clé.
- `monter.py` : fond flou 9:16, sous-titres mot à mot, transitions emoji, compilations ≥ 62 s.
- `or_api.py` : appels OpenRouter et journal des dépenses (`sortie/depenses.jsonl`).
- `transcrire.py` : transcription mot à mot.
- `habillage/` : police Poppins (licence OFL) et emojis 3D Fluent de Microsoft (licence MIT).
- `sortie/` : images, clips et compilations (non suivis par git).

## Utilisation

```bash
pip install faster-whisper requests pillow
python3 generer.py devis                 # coût estimé de ce qui reste à faire
python3 generer.py images                # toutes les images (ou des ids : 001 002…)
python3 generer.py planche               # planches pour relire les images
python3 generer.py videos                # toutes les vidéos
python3 generer.py controle              # vérifie que le dialogue est bien prononcé
python3 monter.py segments               # habille chaque clip
python3 monter.py compilations           # compilations d'au moins 62 s
```

La clé OpenRouter est lue dans `OPENROUTER_API_KEY` (ou ajoutée par le proxy de la session Claude).
