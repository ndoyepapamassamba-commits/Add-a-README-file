# MASSAMBA Studio Vidéo

L'application vidéo de MASSAMBA, séparée de Workbench le 16/10/2026. Un seul fichier HTML qui fonctionne seul dans le
navigateur (comme Workbench en accès direct), plus le moteur Python de la troupe et ses carnets GPU gratuits.

| Écran | Rôle |
|---|---|
| **Film Autopilot** | une idée → histoire, scènes, images, animation, montage ; studio de film complet (20 espaces en mode expert), circuit Grok, acteurs de la troupe |
| **Vidéo IA** | vidéo → scène 3D (profondeur image par image), idée → plan → MP4, image → animation, décors de la troupe |
| **Réalisation** | bac à sable : tout prompt devient une page exécutée, corrigée (œil de JEV) et filmée |
| **Studio 3D** | bac à sable three.js : erreurs JS/GLSL avec leur ligne, physique, export GLB/Draco, génération IA corrigée, pont Blender |
| **Moteur de la troupe** | la chaîne Python, étape par étape, avec la commande à copier |
| **Réglages** | clés OpenRouter et JEV (partagées avec Workbench), clés des moteurs vidéo, pont Blender |

## Dossiers

```
app/            coquille de l'app (entrée, navigation, réglages, reprise des données de Workbench)
interface/      écrans React            navigateur/  logique côté navigateur      coeur/  modules purs (studio, scènes, JEV)
moteur-troupe/  chaîne Python des films (voix, scène, visages, tournage, animation par outil, fluidité RIFE, montage, contrôle)
blender/        pont Blender local, rendu sans écran, moteur de film Blender     carnets/  Colab / Kaggle
outils/         préparation, livraison, vérification du moteur, scripts de la troupe    tests/  unitaires et de bout en bout
docs/           études, veille, inventaire de la séparation (SEPARATION.md), savoir-faire vidéo
```

## Préparer, construire, tester

```
cd workbench && npm ci            # le socle partagé (une fois)
cd ../studio-video && npm ci      # les bibliothèques vidéo (three.js, VRM, mediabunny…)
npm run preparer                  # relie le socle et le dossier privé (workbench/.private)
npm run build                     # app + paquets de décors + dossier de livraison et « A ENVOYER »
npm run typecheck && npm test && npm run test:e2e && npm run test:moteur
```

- `npm run build` écrit `dist/massamba-studio-video.html`, les paquets `massamba-troupe-N.js` (< 30 Mio chacun), puis
  `dist/livraison/MASSAMBA Studio Video/` et `dist/livraison/A ENVOYER/` (seulement ce qui a changé depuis le dernier
  envoi). Après l'envoi : `npm run livraison:envoyee` ; dossier complet : `npm run livraison:complet`.
- `npm run dev` : l'app en développement (port 5175).
- `npm run test:moteur` : compile les 76 scripts Python et vérifie la fluidité (cadre, couleur, saccade ; RIFE quand
  `RIFE_DIR` pointe vers ses poids). Les modèles se rangent dans `~/.cache/massamba-models` (ou `MASSAMBA_MODELS`).

## Lanceurs (dossier livré)

- **Lancer Studio Video.cmd** (Windows) ou `lancer-studio-video.sh` (Mac, Linux) : ouvre l'app.
- **Lancer le pont Blender.cmd** : démarre `blender/blender-bridge.py` avec votre Blender (rendu local, 0 $).

## Socle partagé avec Workbench

Studio Vidéo importe le socle de Workbench par l'alias `@workbench/…` (interface, client OpenRouter, état, JEV,
routage). Workbench n'importe rien d'ici. Les données vidéo de l'utilisateur sont reprises de Workbench au premier
lancement, sans rien y modifier. Détails : `docs/SEPARATION.md`.
