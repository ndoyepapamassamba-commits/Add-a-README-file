# cinema-skills — adaptation MASSAMBA

- **Source** : https://github.com/DenisHumen/cinema-skills (pipeline, bible de style, modèles) + https://github.com/Benitoow/cinema-skills (5 skills) (licence MIT).
- **Corps de la skill** : `SKILL.md` conservé tel quel (seul l'en-tête gagne `category`, `triggers` en français, `upstream`).
- **Activation** : la skill est installée dans la bibliothèque de l'app (activée par défaut) ; la désactiver coupe ses effets dans les moteurs.

## Branchement dans MASSAMBA Workbench
- **Bible de style** : `styleBible` (server/jev/studio/craftSkills.ts) rédige, à partir du Style DNA du projet (palette, lumière, objectif, contraste, texture, étalonnage, interdits), la bible « un seul look du premier au dernier plan » ; elle est écrite dans le journal du projet à l'étape SCÈNES et sa règle de cohérence (lumière et son constants entre scènes) est ajoutée au brief du scénariste.
- **Cinq compétences opérationnelles** (dépôt Benitoow, installées à côté) : `cinema-scene-breakdown`, `cinema-shot-list`, `cinema-cut-list`, `cinema-color-script`, `cinema-export-checklist`.
- **Agent (chat)** : méthode moteur `cinema_craft` (scénario → découpage → sources → montage → étalonnage → son/voix → export) ; modèles `templates/style-bible.md`, `shot-list.md`, `series-bible.md`, `screenplay.fountain`.
## Limites
- Le dépôt DenisHumen est « structure d'abord » : les dossiers par discipline contiennent pour l'instant un README (périmètre), pas encore de SKILL.md ; la bibliographie (148 ouvrages) est une liste de titres.
