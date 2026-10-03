---
name: qualite-donnees
description: Contrôle qualité d'un fichier Excel/CSV avant tout reporting ou comité — doublons (lignes et clé), cellules vides, types incohérents, dates improbables, montants négatifs ou aberrants, rapprochement avec un total attendu ; rapport HTML confidentiel. Déclencheurs : « vérifie le fichier », « contrôle qualité », « rapprochement », « doublons », « avant le comité », « le fichier est-il propre ».
version: 1.0.0
metadata:
  openclaw:
    emoji: "🔎"
    os: [windows, linux, macos]
    requires:
      anyBins: [python, python3, py]
    install:
      - kind: uv
        package: openpyxl
---

# Qualité des données

S'applique avec `coffre-fort`. Lecture seule : le fichier n'est ni modifié ni envoyé.

1. Lancer : `py {baseDir}\scripts\qualite.py <fichier> --cle "<colonne unique>" --montant "<colonne montant>"
   [--total-attendu <total de la balance/du système source>] --html qualite.html`
2. Bloquants (doublons de clé, lignes en double, écart de rapprochement) : **pas de reporting** tant qu'ils ne
   sont pas expliqués ou corrigés à la source ; proposer la correction, ne jamais « arranger » les chiffres.
3. Alertes : les lister avec les numéros de ligne ; demander à l'utilisateur s'il faut exclure, corriger ou garder.
4. Dans le rapport final, afficher : lignes lues, lignes exclues et pourquoi, total de contrôle, date du fichier.
5. Ne jamais recopier de valeurs individuelles (noms, comptes) dans le chat : numéros de ligne et comptages seulement.
