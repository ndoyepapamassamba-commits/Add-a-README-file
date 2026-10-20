# pdf-livrable — adaptation MASSAMBA

- **Source** : texte original MASSAMBA (licence du dépôt), pratiques inspirées des skills Office d'Anthropic sans en copier le texte (licence propriétaire : pas de copie, pas de dérivé, pas de redistribution).

## Correspondance avec la skill « pdf » (Anthropic)
Pratiques reprises : extraction texte/tableaux, fusion/scission, formulaires, création maîtrisée, vérification visuelle. Non reprises : exemples de code pypdf/pdfplumber/reportlab (le conteneur et Pyodide exécutent nos propres scripts).
## Branchement
- Méthode moteur `office_pdf`, compagnon de `pdf_extraction` et `document_reporting`.
- Outils : `report.export` (html imprimable), `data.inspect`, `code.run`.
