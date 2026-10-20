# excel-pro — adaptation MASSAMBA

- **Source** : texte original MASSAMBA (licence du dépôt), pratiques inspirées des skills Office d'Anthropic sans en copier le texte (licence propriétaire : pas de copie, pas de dérivé, pas de redistribution).

## Correspondance avec la skill « xlsx » (Anthropic)
Pratiques reprises : formules plutôt que valeurs, recalcul et zéro erreur, fonctions qui survivent à la vérification, police professionnelle, hypothèses documentées, respect des conventions d'un fichier existant, spécification suivie à la lettre. Non reprises (hors app) : scripts `recalc.py` / LibreOffice (remplacés par `excelStrict`, `xlsx-repair.ts` et la vérification M365 du conteneur), openpyxl (l'app écrit le xlsx elle-même).
## Branchement
- Méthode moteur `office_xlsx` (server/engine/skillsCraft.ts), compagnon de `excel_analysis` et `advanced_reporting`.
- Outils : `report.export` (xlsx), `data.inspect`, `report.analyse`, `designQA`, `excelStrict`, `maisonBand` (Sommaire, k/M, sparklines).
