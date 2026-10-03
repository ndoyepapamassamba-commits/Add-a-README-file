---
name: tiktok-performance
description: Analyse les performances TikTok de @comedyvideos_100 à partir de l'export TikTok Studio (CSV/XLSX) — classement, engagement, partages, rétention, thèmes et personnages qui marchent — et en tire les prochains sketchs ; alimente state/stats.json pour le skill afrikatoon-video. Déclencheurs : « stats TikTok », « performances », « quelle vidéo a marché », « analyse mes vidéos », « quoi faire ensuite ».
version: 1.0.0
metadata:
  openclaw:
    emoji: "📈"
    os: [windows, linux, macos]
    requires:
      anyBins: [python, python3, py]
---

# Performances TikTok

S'applique avec `coffre-fort` (pas de connexion au compte TikTok avec le mot de passe ; l'utilisateur exporte
lui-même ses statistiques depuis TikTok Studio).

1. `py {baseDir}\scripts\tiktok_stats.py <export.csv|xlsx> --json <afrikatoon-auto>\state\stats.json`
2. Lire le résultat et répondre en 5 points : ce qui marche (thèmes, personnages, duos, longueur, accroche),
   ce qui ne marche pas, rétention (objectif > 15 % regardé en entier), partages pour 1000 vues (signal viral
   n° 1), et **3 idées de sketchs** qui combinent les éléments gagnants sans refaire un conflit × twist de
   `state/history.json`.
3. Ne jamais promettre de résultats ; distinguer corrélation et cause (peu de vidéos = tendance fragile).
