# Studio IA — sketchs d'Abidjan pour TikTok

Chaîne de production de micro-sketchs 3D (style Pixar), personnages ivoiriens, voix à l'accent d'Abidjan,
assemblés en compilations d'au moins 62 s (seuil de monétisation).

| Étape | Outil | Coût mesuré |
|---|---|---|
| Image de départ 4:3 | `google/gemini-3.1-flash-lite-image` (OpenRouter) | 0,034 $ |
| Vidéo parlante 6 à 10 s, 480p | `x-ai/grok-imagine-video-1.5-lite` (OpenRouter) | 0,02 $/s + 0,01 $ |
| Contrôle du dialogue | faster-whisper (local, gratuit) | — |
| Contrôle de l'accent à l'oreille | `google/gemini-3.8-flash` (ecouter.py) | < 0,01 $ |
| Musique de fond originale | `google/lyria-3-pro-preview` | 0,08 $ le morceau |
| Habillage et compilations | ffmpeg + Pillow (local, gratuit) | — |

Environ 0,18 $ par sketch.

## Fichiers

- `sketchs/lot1.json` … `lot4.json` : les 100 sketchs (décor, personnages, poses, dialogue, jeu d'acteur, emoji, mots-clés colorés).
- `generer.py` : images → vidéos → contrôle. Ne relance jamais une vidéo déjà payée ; s'arrête avant d'épuiser la clé.
- `monter.py` : fond flou 9:16, sous-titres mot à mot, transitions emoji, compilations ≥ 62 s.
- `or_api.py` : appels OpenRouter et journal des dépenses (`sortie/depenses.jsonl`).
- `transcrire.py` : transcription mot à mot.
- `ecouter.py` : fait écouter un son par Gemini (accent, voix dans une musique, rires).
- `comparer.py` : comparatif de moteurs vidéo sur un même sketch.
- `musique.py` : compose une musique de fond avec Lyria 3.
- `habillage/` : police Poppins (licence OFL), emojis 3D Fluent de Microsoft (licence MIT), boucle de musique
  `fond_musical.m4a` (Lyria, passage sans voix) et rires `rires/` (générés par Grok).
- `sortie/` : images, clips et compilations (non suivis par git).

## Leçons des tests (24/10/2026)

- L'accent ivoirien vient surtout du **texte** : un dialogue en français populaire d'Abidjan (« tu as marié papa-là ? »,
  « il avait cheveux et salaire dêh ! », « Tonton », « mon vieux ») sort avec l'accent ; un français standard sort
  « accent de France », même avec la consigne. La consigne de voix est aussi placée en tête du prompt.
- Grok Imagine 1.5 Lite + cette consigne : 7 clips sur 7 jugés ivoiriens / ouest-africains au 2ᵉ test ; Veo 3.1 Lite
  (option `--moteur=veo`) sert de secours, 2,4 fois plus cher.
- Chaque sketch a une chute propre (`chute`) au lieu du même gros plan choqué.

## Utilisation

```bash
pip install faster-whisper requests pillow
python3 generer.py devis                 # coût estimé de ce qui reste à faire
python3 generer.py images                # toutes les images (ou des ids : 001 002…)
python3 generer.py planche               # planches pour relire les images
python3 generer.py videos                # toutes les vidéos
python3 generer.py controle              # vérifie que le dialogue est bien prononcé
python3 monter.py audio                  # rires + boucle de musique (une fois)
python3 monter.py segments               # habille chaque clip
python3 monter.py compilations           # compilations d'au moins 62 s
```

La clé OpenRouter est lue dans `OPENROUTER_API_KEY` (ou ajoutée par le proxy de la session Claude).
