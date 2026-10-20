# video-storyboard — adaptation MASSAMBA

- **Source** : https://github.com/aicontentskills/ai-video-storyboard-skill (licence MIT) — nom amont : `ai-video-storyboard`.
- **Corps de la skill** : `SKILL.md` conservé tel quel (seul l'en-tête gagne `category`, `triggers` en français, `upstream`).
- **Activation** : la skill est installée dans la bibliothèque de l'app (activée par défaut) ; la désactiver coupe ses effets dans les moteurs.

## Branchement dans MASSAMBA Workbench
- **Étape SCÈNES du Film Autopilot** : `shotPlan` (server/jev/studio/craftSkills.ts) découpe chaque scène en plans d'environ 5 s (la fenêtre des générateurs vidéo) avec cadrage (WS/MS/MCU/CU), **un mouvement** et une fonction (accroche, situation, action, détail, chute) ; `visualTheme` fige le langage visuel commun (palette, lumière, objectif, grain, mouvement) issu du Style DNA. Le plan est stocké dans `scene.craft.shots` et le cadrage du premier plan alimente le prompt vidéo.
- **Brief scénariste** : "camera" doit nommer un cadrage et un seul mouvement ; même langage visuel entre scènes.
- **Agent (chat)** : méthode moteur `video_storyboard` (reel, TikTok, pub, explainer…) ; exemple complet `examples/tiktok-reel-30s-coffee.md`.
## Limites
- Les durées restent celles de l'histoire (pas de données inventées) : le découpage ne fait que les répartir en plans.
