---
name: studio-media
description: Studio photo/vidéo local (ffmpeg + Pillow) — infos et détection GPS, suppression des métadonnées (EXIF, GPS, appareil), format TikTok 9:16 avec fond flouté et son à -14 LUFS, compression WhatsApp à taille cible, lot d'images redimensionnées en WebP, planche contact, filigrane, extraction audio, GIF, découpe sans réencodage. Déclencheurs : « mets au format TikTok », « compresse pour WhatsApp », « enlève la localisation », « filigrane », « fais un GIF », « extrais le son ».
version: 1.0.0
metadata:
  openclaw:
    emoji: "🎞️"
    os: [windows, linux, macos]
    requires:
      bins: [ffmpeg, ffprobe]
      anyBins: [python, python3, py]
    install:
      - kind: brew
        formula: ffmpeg
        bins: [ffmpeg, ffprobe]
      - kind: uv
        package: pillow
---

# Studio média

Windows : `winget install Gyan.FFmpeg` puis **nouveau terminal**. Script : `py {baseDir}\scripts\media.py <action> <fichier>`.
Les résultats vont dans un sous-dossier `sorties\` à côté du fichier ; **l'original n'est jamais modifié**.

| Besoin | Commande |
|---|---|
| Que contient ce fichier ? (GPS ?) | `media.py infos video.mp4` |
| Enlever localisation, appareil, auteur | `media.py anonymiser photo.jpg` ou un dossier entier |
| Format TikTok / Reels / Shorts | `media.py tiktok video.mp4 --flou` |
| Envoyer par WhatsApp (< 16 Mo) | `media.py whatsapp video.mp4 --mo 15` |
| Alléger des photos | `media.py images dossier --max 1920 --format webp` |
| Vérifier une vidéo d'un coup d'œil | `media.py planche final.mp4 --n 16` |
| Signer ses vidéos | `media.py filigrane final.mp4 --texte "@comedyvideos_100"` |
| Son seul / GIF / extrait | `media.py audio …`, `media.py gif … --debut 3 --duree 4`, `media.py couper … --debut 00:00:05 --fin 00:01:10` |

## Règles
- **Avant toute publication ou envoi** d'une photo/vidéo : `infos` puis `anonymiser` si GPS ou nom d'appareil ;
  le script le signale par « ⚠ POSITION GPS PRÉSENTE ».
- Pas de photos de documents bancaires, de clients ni d'écrans professionnels dans les vidéos TikTok.
- Publication : seulement après accord explicite (règle n° 4 de `coffre-fort`).
- Pour Afrikatoon, `tiktok` est déjà fait par le moteur ; utiliser `planche` pour contrôler avant d'envoyer.
