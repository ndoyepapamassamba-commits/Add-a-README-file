---
name: documents-validation
description: Validation des livrables Office et PDF avant livraison (MASSAMBA) — produire, inspecter (rendu page par page), valider (schéma Open XML, formules, mise en page), corriger, relancer ; détecte pages coupées, tableaux illisibles, exports défectueux. Se déclenche avec "vérifie le livrable", "valide le fichier", "contrôle avant livraison", "erreur à l'ouverture", "fichier corrompu".
category: Office
triggers:
  - vérifie le livrable
  - verifie le livrable
  - valide le fichier
  - validation du livrable
  - contrôle avant livraison
  - controle avant livraison
  - erreur à l'ouverture
  - fichier corrompu
  - problème dans le contenu
  - qualité du livrable
  - qa document
  - inspecte le fichier
---
# Validation des livrables — workflow commun MASSAMBA (xlsx, docx, pptx, pdf, html)

## Le cycle, à chaque livraison
1. **Produire** le fichier avec le moteur de l'app (`report.export`, exports Studio) — jamais de donnée client réelle dans le dépôt public.
2. **Inspecter** : rendu image par feuille / page / diapositive, lu une à une (vision) : `#####`, texte coupé, tableau illisible, graphique absent, logo mal placé, contraste faible, page vide.
3. **Valider** :
   - dans l'app : `designQA` (contrastes, largeurs, débordements — corrige automatiquement), `excelStrict` (styles, plages, formules), `designGate` (design verrouillé), **Contrôle frontend-design** pour une page HTML ;
   - en conteneur : `bash .claude/skills/m365-verification/scripts/verify.sh <fichiers>` — SDK Open XML de Microsoft (0 erreur exigée), contrôle sémantique Excel, aperçus LibreOffice.
4. **Corriger** la cause (pas le symptôme), **relancer** 2 et 3, puis **livrer** en disant ce qui a été vérifié, comment, et la limite (rendu LibreOffice ≈ Microsoft 365, pas identique).

## Critères de réussite
- 0 erreur de schéma ; 0 erreur de formule ; aucun `#####` ; aucun texte coupé ; tous les graphiques présents ; logo et thème conformes ; sommaire / pagination à jour ; fichier qui s'ouvre sans « réparation ».
- Un livrable qui échoue à un critère n'est pas livré ; on ne masque jamais un contrôle.

## Dans l'app
- Méthode moteur `documents_validation` ; compagnons `office_xlsx`, `office_pptx`, `office_docx`, `office_pdf`.
