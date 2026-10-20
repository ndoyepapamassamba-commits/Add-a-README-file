# docx-editorial — adaptation MASSAMBA

- **Source** : texte original MASSAMBA (licence du dépôt), pratiques inspirées des skills Office d'Anthropic sans en copier le texte (licence propriétaire : pas de copie, pas de dérivé, pas de redistribution).

## Correspondance avec les skills « docx » et « pdf » (Anthropic)
Pratiques reprises : page de garde, sommaire sur styles, tableaux à largeurs explicites, listes réelles, vérification par rendu des pages, PDF fidèle. Non reprises : scripts docx-js / pandoc / python (l'app écrit le docx avec `officeCore`).
## Branchement
- Méthode moteur `office_docx`, compagnon de `document_reporting` et `executive_writing`.
- Outils : `report.export` (docx, html, pdf), `designQA`, vérification M365 (conteneur).
