# debugging-and-error-recovery — adaptation MASSAMBA (lot 3, catalogue des 50 skills)

- **Source** : https://github.com/JPeetz/agent-skills (licence MIT (README)).
- **Fiches du catalogue couvertes** :
- Fiche 27 — Recherche de bugs et débogage : Diminuer le temps de diagnostic en reproduisant les erreurs et en testant des corrections ciblées.
- **Corps de la skill** : `SKILL.md` conservé tel quel (en-tête : `category`, `triggers` FR, `upstream`).
- **Activation** : installée dans la bibliothèque de l'app (activée par défaut) ; la désactiver la retire des suggestions.

## Branchement dans MASSAMBA Workbench
Méthode `systematic_debugging` + boucle d’auto-correction du code (`code.run`, préflight).
