# blender-mcp-isolated-sessions — adaptation MASSAMBA (lot 3, catalogue des 50 skills)

- **Source** : https://github.com/oh-ashen-one/blender-agent-skills (licence MIT).
- **Fiches du catalogue couvertes** :
- Fiche 15 — Blender — sessions MCP isolées : Éviter les conflits entre tâches Blender concurrentes et améliorer la reproductibilité des opérations.
- **Corps de la skill** : `SKILL.md` conservé tel quel (en-tête : `category`, `triggers` FR, `upstream`).
- **Activation** : installée dans la bibliothèque de l'app (activée par défaut) ; la désactiver la retire des suggestions.

## Branchement dans MASSAMBA Workbench
Voie Blender : sessions headless (`bpy` en module, `blender -b --python`) pilotées par `scripts/blender-render.py`.
