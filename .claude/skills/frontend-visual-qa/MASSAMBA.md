# frontend-visual-qa — adaptation MASSAMBA

- **Source** : https://github.com/daymade/claude-code-skills (licence MIT).
- **Corps de la skill** : `SKILL.md` conservé tel quel (seul l'en-tête gagne `category`, `triggers` en français, `upstream`).
- **Activation** : la skill est installée dans la bibliothèque de l'app (activée par défaut) ; la désactiver coupe ses effets dans les moteurs.

## Branchement dans MASSAMBA Workbench
- **Agent (chat)** : méthode moteur `frontend_visual_qa` — contrat d'audit (cible, état, viewport prouvés), captures et inspection réelles avec les outils `browser.open` / `browser.snapshot` / `browser.click` (navigateur embarqué), `apex.qa` (application HTML dans un cadre isolé : erreurs de page, bibliothèques chargées), **Contrôle frontend-design** (déjà exécuté à chaque écriture de page HTML : viewport, focus clavier, mouvement réduit, tics de page générée) et `visual.compare` (diff pixel de deux captures).
- **Agent Product / UX** : porte la skill `frontend-design` ; `frontend_visual_qa` s'y ajoute à la demande.
- **Scripts** (`scripts/*.mjs`, `verify_delivery.py`) : utilisables dans le conteneur avec Playwright (vérification de livraison, sondes de texte peint, dégradation silencieuse).
## Limites
- Dans l'app monofichier, une page ouverte dans un cadre ne peut pas être photographiée pixel à pixel ; la comparaison `visual.compare` s'applique aux images disponibles (captures importées, exports, rendus).
