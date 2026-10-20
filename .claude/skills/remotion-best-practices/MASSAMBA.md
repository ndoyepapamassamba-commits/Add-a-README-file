# remotion-best-practices — adaptation MASSAMBA

- **Source** : https://github.com/remotion-dev/skills (licence MIT (package.json du dépôt)).
- **Corps de la skill** : `SKILL.md` conservé tel quel (seul l'en-tête gagne `category`, `triggers` en français, `upstream`).
- **Activation** : la skill est installée dans la bibliothèque de l'app (activée par défaut) ; la désactiver coupe ses effets dans les moteurs.

## Branchement dans MASSAMBA Workbench
- **Sous-titres du montage** : `pageCaptions` (server/jev/studio/craftSkills.ts) applique la règle des captions Remotion (pages courtes calées sur les mots, jamais un mur de texte) aux sous-titres calculés par `compileSubtitles` / `srtOf` (direct/lib/studio/actions2.ts) quand la skill est activée : une réplique longue devient plusieurs pages de ≤ 34 caractères, chacune avec les timings de ses mots (karaoké conservé).
- **Moteur de montage (exactRender)** : déjà déterministe image par image (30 i/s garanties) — les règles « tout est fonction de l'image courante », « pas d'animation CSS non déterministe » et « prévisualiser avant de rendre » sont celles de l'app.
- **Agent (chat)** : méthode moteur `remotion_best_practices` ; sous‑skills embarquées : création, rendu, captions, multimédia (Mediabunny), studio, docs, markup, interactivité. Non embarquées (taille / hors besoin) : cartes (maps), SaaS, upgrade.
## Limites
- La skill est un routeur vers des fichiers REFERENCE.md : lire celui du besoin (`skill.read remotion-best-practices remotion-captions/REFERENCE.md`).
