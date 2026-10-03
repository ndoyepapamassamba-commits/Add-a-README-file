# Rushes de « La sauce de belle-maman » (version animée)

- `wan_<scène>_<réplique>.mp4` : plans Wan 2.2 déjà générés (480×832, 16 i/s) — coûteux en quota, à garder.
- `voice_<scène>_<réplique>.flac` : voix Chatterbox validées par Whisper.

Pour reprendre : copier ces fichiers dans `output/anim-sauce/` (les .flac convertis en .wav 44,1 kHz),
puis `wananim.shots(...)` ne génère que les plans manquants et `render_clip` remonte la vidéo.
