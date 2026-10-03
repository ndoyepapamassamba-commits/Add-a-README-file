---
name: taches-pro
description: Gestion des tâches 100 % locale — ajout en langage naturel, matrice d'Eisenhower (faire / planifier / déléguer / abandonner), échéances relatives (demain, +3j, 15/10), plan du jour limité à 6 h, revue hebdomadaire, export .ics vers Outlook/Google Agenda sans connexion. Déclencheurs : « ajoute une tâche », « rappelle-moi de », « qu'est-ce que j'ai à faire », « plan du jour », « revue de la semaine », « mets dans mon agenda ».
version: 1.0.0
metadata:
  openclaw:
    emoji: "✅"
    os: [windows, linux, macos]
    requires:
      anyBins: [python, python3, py]
    envVars:
      - name: TACHES_FICHIER
        required: false
        description: Chemin du fichier de tâches (défaut ~/.taches/taches.json).
---

# Tâches pro

Script : `py {baseDir}\scripts\taches.py <action>`. Données : `~\.taches\taches.json` (local, copie `.bak` à
chaque écriture, écriture atomique). Inclus dans `sauvegarde-chiffree` si l'utilisateur ajoute ce dossier.

## Traduire la demande
« Rappelle-moi d'envoyer le reporting NPL à la DG vendredi, c'est urgent » →
`taches.py ajouter "Envoyer reporting NPL à la DG" --echeance 2026-10-09 --urgent --important --projet Reporting --duree 30`
- **urgent** = échéance ≤ 2 jours ou quelqu'un attend ; **important** = lié aux objectifs (Comité, régulateur,
  hiérarchie, Afrikatoon) ; en cas de doute, demander en une question.
- Durée estimée (`--duree`, minutes) : elle sert au plan du jour.

## Routines
- **Matin** : `taches.py jour` (repris par `briefing-quotidien`).
- **Après chaque tâche** : `taches.py fait <n>`.
- **Vendredi** : `taches.py revue --sortie revue.md` puis proposer : abandonner ou déléguer ce qui a été reporté
  3 fois ou plus.
- **Agenda** : `taches.py ics --sortie taches.ics` → l'utilisateur l'ouvre dans Outlook (aucun envoi automatique).

## Règles
- Titres courts et **sans données sensibles** (pas de nom de client, numéro de compte, mot de passe) :
  « Relancer client dossier 12 » et non le nom du client.
- Supprimer = corbeille interne (`suppr`), récupérable dans le fichier.
