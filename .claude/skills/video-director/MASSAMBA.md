# video-director — adaptation MASSAMBA

- **Source** : https://github.com/zlbigger/story-video-director (licence MIT) — nom amont : `story-video-director`.
- **Corps de la skill** : `SKILL.md` conservé tel quel (seul l'en-tête gagne `category`, `triggers` en français, `upstream`).
- **Activation** : la skill est installée dans la bibliothèque de l'app (activée par défaut) ; la désactiver coupe ses effets dans les moteurs.

## Branchement dans MASSAMBA Workbench
- **Étape SCÈNES** : `directorBeats` (server/jev/studio/craftSkills.ts) applique les invariants de la skill à chaque scène : **clip de 15 s au plus** (une scène plus longue est signalée et comptée en N clips), **un événement principal**, **2 à 5 temps** (l'action est découpée en temps ; un temps de réaction est ajouté quand il n'y en a qu'un), **état d'ouverture et état final explicites**. Les temps deviennent la phrase de mouvement du prompt vidéo (first…, then…, finally…).
- **Brief scénariste** : règle ajoutée (15 s max, un événement, 2–5 temps filmables).
- **Circuit Grok (qualité / coût)** : un clip = un événement lisible → moins de plans ratés (morphing, actions entassées) et moins de reprises payantes.
- **Agent (chat)** : méthode moteur `video_director` ; références `references/*.md` (traitement, continuité, props, dialogue).
## Limites
- Le rendu MiniMax‑H3 et les scripts Python de la skill ne sont pas utilisés : l'app rend avec ses moteurs (troupe 3D, circuit Grok).
