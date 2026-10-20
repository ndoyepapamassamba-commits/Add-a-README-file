---
name: pdf-livrable
description: PDF (MASSAMBA) — lire et extraire texte et tableaux, fusionner / scinder, remplir un formulaire, produire un PDF imprimable fidèle, vérifier page par page. Se déclenche avec "pdf", "fusionne", "scinde", "extrait du pdf", "formulaire pdf", "imprimable".
category: Office
triggers:
  - pdf
  - fusionne les pdf
  - fusionner
  - scinde
  - découpe le pdf
  - extrait du pdf
  - extraction pdf
  - formulaire pdf
  - imprimable
  - version pdf
---
# PDF — méthode MASSAMBA

## Lire et extraire
- Texte et tableaux : `data.inspect` / lecture du PDF par l'app (extraction avec mise en page) ; un tableau extrait est relu contre la page rendue (colonnes décalées = erreur fréquente).
- Un PDF scanné passe par la vision (`ocr_vision`) ; indiquer la fiabilité de l'OCR.

## Manipuler
- Fusionner, scinder, tourner, extraire des pages : `code.run` (python : pypdf) dans le conteneur ou Pyodide dans l'app ; conserver les métadonnées utiles.
- Formulaires : lister les champs, remplir sans déformer, vérifier l'aplatissement si demandé.

## Produire
- Un PDF de livrable vient d'un document maîtrisé (HTML imprimable de l'app avec le thème choisi, ou docx converti) : marges, en-tête/pied, numéros de page, sauts de page avant chaque titre de niveau 1, tableaux qui ne se coupent pas au milieu d'une ligne.
- **Vérifier page par page** (rendu image) avant de livrer : rien de coupé, polices présentes, logo bien placé ; **aucune donnée inventée**.

## Dans l'app
- `report.export` html (imprimable) ; `pdf_extraction` / `data.inspect` ; `code.run` python.
