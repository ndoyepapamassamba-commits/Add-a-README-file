# character-design — adaptation MASSAMBA

- **Source** : https://github.com/fal-ai-community/skills (licence MIT).
- **Corps de la skill** : `SKILL.md` conservé tel quel (seul l'en-tête gagne `category`, `triggers` en français, `upstream`).
- **Activation** : la skill est installée dans la bibliothèque de l'app (activée par défaut) ; la désactiver coupe ses effets dans les moteurs.

## Branchement dans MASSAMBA Workbench
- **Ancre d'identité** : `characterAnchor` (server/jev/studio/craftSkills.ts) construit, à partir de la fiche personnage, un bloc immuable (âge, visage, carnation, coiffure, corps/posture, tenue + accessoire signature, style) répété tel quel dans le prompt vidéo de chaque scène (`lockedVideoPrompt`) à la place du résumé court — le modèle d'animation reçoit la même description à chaque plan.
- **Planches de la troupe** : les planches importées restent les références (jamais redessinées) ; l'ancre textuelle les complète.
- **Histoire** : règle ajoutée au brief du scénariste (visage, coiffure, carnation, tenue et accessoire gardés dans toutes les scènes) quand la skill est activée.
- **Agent (chat)** : méthode moteur `character_design` ; références `references/anchor-system.md`, `prompt-patterns.md`, `examples.md` via `skill.read`.
## Limites
- Les commandes `genmedia` de la skill (CLI fal.ai) ne sont pas utilisées : l'app passe par ses propres fournisseurs d'images/vidéo.
