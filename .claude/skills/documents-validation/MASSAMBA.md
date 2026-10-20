# documents-validation — adaptation MASSAMBA

- **Source** : texte original MASSAMBA (licence du dépôt), pratiques inspirées des skills Office d'Anthropic sans en copier le texte (licence propriétaire : pas de copie, pas de dérivé, pas de redistribution).

## Correspondance avec la skill « documents / validation » de la carte
Le workflow commun « produire → inspecter → corriger avant livraison » est celui des validateurs de l'app (`designQA`, `excelStrict`, `designGate`, contrôle frontend-design) et de la skill `m365-verification` du dépôt (SDK Open XML + rendu LibreOffice). Les scripts de validation Office d'Anthropic (licence propriétaire) ne sont pas copiés.
## Branchement
- Méthode moteur `documents_validation` (server/engine/skillsCraft.ts), compagnon de `document_reporting`.
- Outils : `report.export`, `designQA`, `excelStrict`, `m365-verification` (conteneur).
