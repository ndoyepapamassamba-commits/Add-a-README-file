---
name: briefing-quotidien
description: Briefing du matin en 1 minute de lecture — priorités du jour, échéances, veille réglementaire du jour, performances TikTok de la veille, sauvegardes et alertes de sécurité — sans aucune donnée sensible dans le résumé. Déclencheurs : « briefing », « mon point du matin », « quoi de prévu aujourd'hui », « résumé du jour ».
version: 1.0.0
metadata:
  openclaw:
    emoji: "☀️"
    os: [windows, linux, macos]
---

# Briefing quotidien

Rassembler (seulement ce qui est disponible, sans rien inventer) :
1. **Priorités** : tâches et échéances notées en mémoire (`memory/`), réunions du jour si un agenda est connecté.
2. **Veille** : nouveautés des dernières 24 h via `veille-reglementaire` (sources officielles, liens).
3. **Afrikatoon** : vidéo prévue du jour, statistiques de la veille si un export est disponible (`tiktok-performance`).
4. **Santé du système** : date de la dernière sauvegarde (`sauvegarde-chiffree`) — alerte si > 7 jours ;
   résultat du dernier audit `coffre-fort` — alerte s'il y a des ⚠.
5. **3 actions suggérées** pour la journée, classées par importance.

Format : 10 lignes maximum, puces, heure de génération. Aucun nom de client, montant individuel ni secret.
Ne rien envoyer : le briefing s'affiche dans la conversation.
