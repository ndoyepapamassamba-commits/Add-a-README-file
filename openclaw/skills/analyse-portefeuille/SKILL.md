---
name: analyse-portefeuille
description: Indicateurs de risque de crédit calculés en local sur un arrêté de portefeuille (Excel/CSV) — ratio de créances en souffrance (NPL), couverture par provisions, ancienneté des retards, concentration (top 10/20, HHI clients et secteurs), matrice de migration entre deux arrêtés — sans afficher de noms de clients. Déclencheurs : « ratio NPL », « portefeuille », « concentration », « migration », « ancienneté des impayés », « couverture », « arrêté du mois ».
version: 1.0.0
metadata:
  openclaw:
    emoji: "🏦"
    os: [windows, linux, macos]
    requires:
      anyBins: [python, python3, py]
    install:
      - kind: uv
        package: openpyxl
---

# Analyse de portefeuille

S'applique avec `coffre-fort`, `qualite-donnees` et `export-securise`. Tout est calculé sur la machine.

1. **Toujours** passer d'abord le fichier par `qualite-donnees` (doublons de compte, rapprochement avec la balance).
2. Lancer :
   `py {baseDir}\scripts\portefeuille.py arrete.xlsx --encours "<col>" --classe "<col>" --retard "<col>"
    --client "<col>" --secteur "<col>" --provision "<col>" --cle "<col compte>" [--precedent arrete_M-1.xlsx]
    --json kpi.json`
   (`--douteux` liste les classes en souffrance ; `--seuil` les jours de retard si pas de classe).
3. Les définitions (classes douteuses, seuil de jours, provisions) sont des **paramètres** : les aligner avec
   l'utilisateur sur les règles en vigueur (BCEAO, IFRS 9, politique interne) et les rappeler dans la sortie.
4. Restitution : indicateurs, évolution vs arrêté précédent, 3 points d'attention et leur explication probable,
   marquée comme hypothèse. Jamais de nom de client dans le chat (rangs seulement) ; `--noms` uniquement pour un
   fichier local que l'utilisateur ouvre lui-même.
5. Pour diffuser : `reporting-securise` (tableau de bord) puis `export-securise`.
