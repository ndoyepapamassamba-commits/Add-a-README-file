# documents — adaptation MASSAMBA (lot 3, catalogue des 50 skills)

- **Source** : https://github.com/magnus919/agent-skills (licence MIT).
- **Fiches du catalogue couvertes** :
- Fiche 48 — Automatisation de reporting récurrent : Réduire le temps consacré aux rapports récurrents et améliorer leur reproductibilité et leur archivage.
- Fiche 49 — Extraction et contrôle de PDF : Accélérer l’exploitation des PDF tout en signalant les cas qui nécessitent OCR ou vérification visuelle.
- **Corps de la skill** : `SKILL.md` conservé tel quel (en-tête : `category`, `triggers` FR, `upstream`).
- **Activation** : installée dans la bibliothèque de l'app (activée par défaut) ; la désactiver la retire des suggestions.

## Branchement dans MASSAMBA Workbench
Workflow commun « produire, inspecter, corriger » des livrables Office et PDF (carte n° 4 du premier lot) : branché sur `documents-validation` (designQA, excelStrict, m365-verification) ; ses scripts Python tournent dans le conteneur.
