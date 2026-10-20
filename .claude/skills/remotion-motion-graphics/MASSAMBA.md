# remotion-motion-graphics — adaptation MASSAMBA

- **Source** : https://github.com/fernandokaraka/remotion-motion-graphics-skill (licence MIT).
- **Corps de la skill** : `SKILL.md` conservé tel quel (seul l'en-tête gagne `category`, `triggers` en français, `upstream`).
- **Activation** : la skill est installée dans la bibliothèque de l'app (activée par défaut) ; la désactiver coupe ses effets dans les moteurs.

## Branchement dans MASSAMBA Workbench
- **Montage (rendu image par image, WebCodecs)** : les règles de la skill s'appliquent au moteur de montage de l'app, qui est lui aussi « chaque image est une fonction du temps » : entrée → tenue → sortie complètes (rien à l'image 0, rien qui bouge encore à la dernière image), jamais de linéaire (ressort / easing), décalage de 3–5 images entre éléments, marges de sécurité 5–10 %, une seule audace lumineuse, timing lu (~1 s par ligne courte), son sur les entrées/sorties.
- **Agent (chat)** : méthode moteur `remotion_motion_graphics` pour tout habillage (titres, lower thirds, génériques, compte à rebours) ; références `traps.md` (pannes silencieuses, p. ex. `interpolate` sans clamp), `patterns.md`, `polish.md`, `scaffold.md`.
## Limites
- Remotion (React) n'est pas embarqué dans l'app monofichier : la méthode guide le moteur de montage interne et les projets Remotion du dépôt.
