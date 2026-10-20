# remotion-marketing-video — adaptation MASSAMBA

- **Source** : https://github.com/EveryInc/product-launch-video (licence MIT) — nom amont : `product-launch-video`.
- **Corps de la skill** : `SKILL.md` conservé tel quel (seul l'en-tête gagne `category`, `triggers` en français, `upstream`).
- **Activation** : la skill est installée dans la bibliothèque de l'app (activée par défaut) ; la désactiver coupe ses effets dans les moteurs.

## Branchement dans MASSAMBA Workbench
- **Workflow structuré** : brief (titre, accroche, fonctionnalités, ton) → jetons de marque (polices, couleurs, logo — l'app lit le logo importé et la charte choisie dans la galerie de designs) → **storyboard avant tout code** (table temps / visuel / texte) → prévisualisation → validation (critiques design, lisibilité, rythme, cohérence de marque) → rendu par plateforme.
- **Règles reprises dans la méthode moteur** `marketing_video` : copie réelle du produit (jamais de libellés inventés), problème du spectateur d'abord, produit visible dans les 3 s, texte lisible à 720p (≥ 18 px), sous-titres incrustés (vues muettes).
- **Film Autopilot** : le storyboard de cette skill rejoint `shotPlan` (video-storyboard) pour les pubs et teasers.
## Limites
- Le scaffold Remotion du dépôt n'est pas embarqué ; le rendu se fait avec le moteur de montage de l'app ou un projet Remotion séparé.
