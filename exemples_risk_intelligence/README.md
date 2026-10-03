# Exemples Credit Risk Intelligence — APEX 38

Exports produits par APEX 38 à partir de **données synthétiques et fictives**. Aucune donnée client réelle n'est
utilisée.

- **Arrêtés** : 9 arrêtés ACTE 7 synthétiques, du 31/01 au 30/09/2026. Dix grands clients portent des noms de groupe
  fictifs (`outils_export/fixtures/noms_demo.py`).
- **Retours des gestionnaires** : 30 dossiers, dont 27 commentés et 6 situations complexes. Commentaires et secteurs sont fictifs.
  Ils ont été enrichis par l'analyse sémantique sur poste connecté (`retour_semantique_demo.xlsx`).

| Fichier | Contenu |
|---|---|
| `ECOBANK_Credit_Risk_Intelligence_<date>.xlsx` | Classeur complet : EXECUTIVE, RISK (avec STRESS NARRATIF), MOVEMENT, CONCENTRATION (avec BÉNÉFICIAIRES POTENTIELLEMENT LIÉS), WATCHLIST, ACTIONS, INSIGHTS, DETAIL, AUDIT |
| `ECOBANK_Executive_Report_…`, `Risk_Report_…`, `Watchlist_…`, `Action_Plan_…`, `Audit_Report_…`, `Data_Export_…` | Les six autres variantes, issues de la même source `riModel` |
| `ECOBANK_Credit_Risk_Intelligence_<date>.docx` / `.pdf` | Rapport Word et PDF (visuels 3D, Risk Outlook, analyses avancées, stress narratif, bénéficiaires liés) |
| `ECOBANK_Credit_Risk_Intelligence_<date>.pptx` | Présentation Comité : sommaire interactif, cascade 3D, stress narratif 3D, audit |
| `Apercu_*.png` | Aperçus de rendu (LibreOffice) des pages clés |

Les noms des outils internes n'apparaissent dans aucun de ces fichiers : on y lit « Analyse sémantique » et
« Risk Outlook ».

Pour régénérer ces fichiers, voir `outils_export/README.md` (script `outils_export/tests/exemples.js`).
