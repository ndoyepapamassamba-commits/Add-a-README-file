# blender-cinematic-scene — adaptation MASSAMBA

- **Source** : https://github.com/Evan1108-Coder/blender-cinematic-modeling-skill (licence MIT) — nom amont : `blender-cinematic-modeling`.
- **Corps de la skill** : `SKILL.md` conservé tel quel (seul l'en-tête gagne `category`, `triggers` en français, `upstream`).
- **Activation** : la skill est installée dans la bibliothèque de l'app (activée par défaut) ; la désactiver coupe ses effets dans les moteurs.

## Branchement dans MASSAMBA Workbench
- **Studio 3D → Blender** : l'outil `blender.scene` (direct/lib/builtinPlugins.ts) écrit le script bpy avec `blenderScript(spec, { cinematic })` (direct/lib/studio3dCore.ts). Quand cette skill est activée (ou `cinematic: true`), le script ajoute : **éclairage trois points** (key / fill / rim en lumières de surface placées autour de la scène), **caméra cinéma** (focale 50 mm, profondeur de champ calée sur le centre de la scène), **transformation d'affichage filmique** (AgX ou Filmic selon la version de Blender) et une **image de vérification** (`blender --python script.py -- --verify` rend `verify.png`) — la skill exige de vérifier sur un rendu réel, pas sur un concept.
- **Acteurs 3D / troupe** : le même principe (rendu de contrôle avant le film) est déjà celui de la porte A/B et du banc de preuve.
- **Agent (chat)** : méthode moteur `blender_cinematic` ; références `references/visual-quality.md`, `verification.md`, `request-template.md`.
## Limites
- Blender n'est pas dans le navigateur : le script est produit par l'app, exécuté par l'utilisateur (ou par le conteneur quand Blender y est installé).
