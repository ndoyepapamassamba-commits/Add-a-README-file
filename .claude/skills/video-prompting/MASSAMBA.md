# video-prompting — adaptation MASSAMBA

- **Source** : https://github.com/square-zero-labs/video-prompting-skill (licence Apache-2.0).
- **Corps de la skill** : `SKILL.md` conservé tel quel (seul l'en-tête gagne `category`, `triggers` en français, `upstream`).
- **Activation** : la skill est installée dans la bibliothèque de l'app (activée par défaut) ; la désactiver coupe ses effets dans les moteurs.

## Branchement dans MASSAMBA Workbench
- **Circuit Grok / animation** : `lockedVideoPrompt` (server/jev/studio/continuity.ts) passe par `shapeVideoPrompt` (server/jev/studio/craftSkills.ts) quand cette skill est activée : vocabulaire de cadrage traduit (gros plan → close-up…), **un seul mouvement de caméra** par plan, nombre de temps d'action calé sur la durée du clip (≤ 5 s : 2, ≤ 10 s : 3, ≤ 15 s : 5), **aucun nom de modèle, durée, format ou résolution** dans le texte du prompt (règle globale de la skill ; ces paramètres restent dans la requête API). Ce qui a été retiré est écrit dans le journal de l'étape.
- **Agent (chat)** : méthode moteur `video_prompting` (server/engine/skillsCraft.ts) — déclencheurs FR ; le corps de la skill et ses références par modèle (`references/models/*/prompting.md`) sont lisibles avec `skill.read`.
- **Effet attendu** : moins de reprises Grok sur les plans clés (prompt conforme dès le premier essai) → coût par scène plus bas, mouvement plus lisible.
## Limites
- Les références modèle couvrent Veo 3, Wan 2.2, Seedance, LTX‑2, MiniMax, Ovi ; Grok Imagine suit les règles globales (pas de fiche dédiée).
