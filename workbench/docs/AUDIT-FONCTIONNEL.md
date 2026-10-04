# Audit fonctionnel — MASSAMBA Workbench (04/10/2026)

Chaque fonctionnalité est prouvée par un test qui l'exécute réellement : unitaire, intégration serveur avec faux OpenRouter, e2e Playwright sur le fichier HTML construit, ou exécution réelle. Résultat au moment de la livraison :

- 167 tests unitaires et d'intégration passent ;
- 26 tests e2e passent (2 éditions) ;
- lint et formatage sont propres.

| Fonctionnalité | Preuve |
| --- | --- |
| Routage le moins cher × le plus intelligent, neutre ; secours = suivants de la liste | `tests/unit/orchestration.test.ts`, groupe « value routing ». Cas testés :<br>- un modèle Claude plus cher et moins intelligent perd ;<br>- les variantes contributor / free / pro sont exclues ;<br>- le tri par prix est vérifié.<br>Exécution réelle : GPT-6 Luna choisi au palier CHEAP, secours mimo-v2.6-flash → glm-5.3-flash, $0.0018. |
| Scores OpenRouter / Artificial Analysis (instantané + actualisation + import) | `parseIntel` (test unitaire), `IntelSync` (serveur, toutes les 12 h), import `.json` (vue Modèles). |
| Vue Modèles : priorités par tâche, catégories, classement, Routing Lab, mon classement | e2e « all views render » et « auto-benchmark ». Captures vérifiées. |
| Enjeux critiques jamais au palier CHEAP | Test « profiles difficulty » (COMEX / IFRS9). |
| Style maison Word / HTML / Excel / mail `.eml` | `tests/unit/house.test.ts`. Fichiers ouverts avec openpyxl et python-docx : couleurs, polices, formats `# ##0`. |
| APEX Studio (guide, référence, build, QA) | Application de référence du kit assemblée et exécutée dans Chromium, sans erreur.<br>e2e « APEX Studio », intégration serveur « APEX Studio (server) ».<br>Rejet du code invalide testé. |
| Kit maison importable en `.zip` | Build sans kit (`HOUSE_KIT=off`), import, rechargement : kit « importé » conservé. |
| Terminal intégré | `tests/unit/shell.test.ts` : tubes, redirections, `&&`, `\|\|`, jokers, `rm` confirmé, shim Node.<br>e2e « embedded terminal ». |
| Navigateur intégré (snapshot, clic, saisie, chargement de fichier, capture des téléchargements) | e2e « embedded browser ».<br>Exécution réelle : clic sur l'export PNG d'une scène 3D, fichier récupéré. |
| Mode lecture web | Exécution réelle de `https://example.com` via r.jina.ai. |
| Studio 3D → Blender | `tests/unit/studio3d.test.ts`. Script exécuté dans **Blender 5.0.1** (`bpy`) :<br>- 9 formes, matériaux, lumières, animation ;<br>- rendu Cycles ;<br>- `.glb` importé dans Blender avec les bons noms d'objets.<br>e2e « built-in plugins ». Exécution réelle : `.html` / `.glb` / `.py` générés. |
| Plugins intégrés (diagrammes, images, taux XOF, Banque mondiale, météo, jours fériés, Wikipédia, Crossref, OSM, crypto) | CORS et réponses vérifiés en direct sur chaque API. e2e : `fx.rates`, présence des outils. |
| Préréglages MCP | Paquets npm / PyPI vérifiés existants.<br>Serveurs distants de l'édition directe vérifiés par `initialize` + CORS. |
| Intelligence Engine : Task DNA, stratégie apprise, mémoire des échecs | `tests/unit/intelligence.test.ts` (15 tests). |
| Shadow agent | Test unitaire.<br>e2e : alerte « donnée source modifiée » injectée à l'agent.<br>Intégration serveur. |
| Contrôle des preuves (chiffres sans source) | e2e : seul le chiffre inventé est signalé, puis corrigé.<br>Intégration serveur. |
| Red team → correction → juge | e2e « critical mission ».<br>Intégration serveur « critical mission ». |
| Apprentissage (registre), classement personnel par type, coût par réussite | e2e : la 2e mission voit la 1re.<br>Auto-benchmark e2e (4/5 et ✗ code-fn).<br>Serveur : `brain/ledger.json`, `board.json`. |
| Manuel personnel | e2e et intégration : la règle est appliquée dès la même tâche. Bug trouvé et corrigé. |
| Time Machine + diff fonctionnel + restauration | e2e « Time Machine » : diff « fonctions ajoutées », restauration de la version 1. |
| Compression intelligente, résumé de reprise | Test unitaire `compressTrajectory`. Résumé enregistré à l'interruption. |
| Graphe de connaissances, jumeau numérique, impact, simulateur, valeur de l'information | Tests unitaires : formule sûre, point de bascule, impact transitif. |
| Non-régression : fonctions existantes | Tous les tests e2e antérieurs passent (chat, approbations, plan, mission, skills, workflows, renommage, édition serveur). |

## Limites connues (honnêtes)

- **Scores d'intelligence**
  - Les modèles absents des mesures Artificial Analysis ne sont pas routés automatiquement ; ils restent choisissables à la main.
  - Dans l'édition directe, l'actualisation en ligne est bloquée par CORS. On importe alors le JSON ; l'édition serveur s'actualise seule.
- **Indices mesurés à un effort donné.** La référence est l'effort « high » quand il a été mesuré ; sinon c'est la variante mesurée, parfois « max ».
- **Terminal de l'édition directe**
  - Ce n'est pas un vrai système : pas de npm, git ni pip.
  - Python passe par Pyodide, chargé depuis un CDN (Internet requis).
- **Navigateur intégré.** Les sites web tiers sont en lecture seule : un navigateur ne peut pas piloter un site d'une autre origine. Les applications de l'espace de travail, elles, sont entièrement pilotables.
- **Blender**
  - L'édition directe génère `.glb` et script `bpy`, qu'on exécute dans Blender.
  - Le pilotage en direct de Blender passe par l'édition serveur (`blender-mcp`).
- **Ce qui ne peut pas être promis.** Aucun système ne rend un modèle « 1000 fois plus intelligent ». Les gains réels viennent de trois sources :
  - les vérifications (preuves, red team, juge) ;
  - le choix du modèle le moins cher suffisant ;
  - l'apprentissage sur vos propres missions.
