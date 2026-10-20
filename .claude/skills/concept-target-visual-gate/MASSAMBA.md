# concept-target-visual-gate — adaptation MASSAMBA (lot 3, catalogue des 50 skills)

- **Source** : https://github.com/oh-ashen-one/blender-agent-skills (licence MIT).
- **Fiches du catalogue couvertes** :
- Fiche 11 — Blender — contrôle visuel par référence : Comparer les rendus à une référence visuelle et limiter les dérives entre le brief et le résultat livré.
- **Corps de la skill** : `SKILL.md` conservé tel quel (en-tête : `category`, `triggers` FR, `upstream`).
- **Activation** : installée dans la bibliothèque de l'app (activée par défaut) ; la désactiver la retire des suggestions.

## Branchement dans MASSAMBA Workbench
Porte de qualité A/B et comparateur d’images (`visual.compare`, `cloneCompare`) : rendu comparé à la référence avant validation.
