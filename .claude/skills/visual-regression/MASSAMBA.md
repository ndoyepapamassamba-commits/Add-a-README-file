# visual-regression — adaptation MASSAMBA

- **Source** : https://github.com/PramodDutta/qaskills (licence MIT) — nom amont : `Visual Regression Testing`.
- **Corps de la skill** : `SKILL.md` conservé tel quel (seul l'en-tête gagne `category`, `triggers` en français, `upstream`).
- **Activation** : la skill est installée dans la bibliothèque de l'app (activée par défaut) ; la désactiver coupe ses effets dans les moteurs.

## Branchement dans MASSAMBA Workbench
- **Outil `visual.compare`** (direct/lib/tools.ts → server/services/visualDiff.ts) : compare deux images de l'espace de travail (PNG/JPEG/WebP), rapporte la part de pixels changés, le verdict (identique / stable / changé selon un seuil), les zones modifiées (boîtes) et écrit une image de diff. Seuil par canal et ratio toléré paramétrables (règles « comparaison à seuil » de la skill).
- **Tests du dépôt** : les tests Playwright e2e de l'app peuvent adopter la structure proposée (`tests/visual/`, baselines, masquage des zones dynamiques, animations désactivées, polices chargées).
- **Agent (chat)** : méthode moteur `visual_regression` ; compagnon de `frontend_visual_qa`.
## Limites
- La capture d'écran pixel d'une page vivante n'est possible que dans le conteneur (Playwright) ; dans l'app, la comparaison porte sur des images déjà rendues.
