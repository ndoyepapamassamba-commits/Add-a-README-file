# Séparation vidéo / Workbench — inventaire et carte (16-17/10/2026)

Demande : « Inventaire de tout ce qui, dans Workbench, concerne la vidéo et le bac à sable … 1. Nouvelle application vidéo,
dans son propre dossier, avec son lanceur et sa propre livraison … 2. Workbench finalisé sans ces parties. »

## Méthode

1. **Graphe d'imports réel** de l'édition directe (esbuild, sans écriture) : 443 modules. Les fichiers atteignables
   seulement depuis les écrans vidéo (Vidéo IA, Réalisation, Studio 3D, studio de film) sont **vidéo seule** (166).
   Ceux qu'atteignent aussi les écrans de Workbench forment le **socle partagé** (172). Aucun fichier mort.
2. **Couplages Workbench → vidéo** relevés dans ce graphe, puis coupés un par un (tableau plus bas).
3. Les scripts, tests, carnets et docs qui ne passent pas par les imports (lancés en Python ou en ligne de commande) ont
   été repérés par leurs chemins (`scripts/blenderfilm`, `troupe-generee`, `filmbench`…) et par l'exécution des tests.
4. Déplacement par `git mv` (l'historique de chaque fichier est gardé), puis **réécriture automatique des imports** :
   vers le nouveau chemin quand la cible part aussi, vers l'alias `@workbench/…` quand la cible reste dans le socle.

## Ce qui est parti dans `studio-video/` (360 fichiers déplacés)

| Dossier | Fichiers | Venu de (Workbench) |
|---|---|---|
| `interface/` | 20 | `direct/views/` : VideoGenView, VideoSceneMode, RealizeView, Lab3DView, `studio/` (Film Autopilot et 15 écrans du studio) |
| `navigateur/` | 57 | `direct/lib/` : `studio/`, `videogen/`, `lab3d/`, `realize/`, `blenderBridge.ts`, `studio3dCore.ts`, `features.ts` |
| `coeur/` | 95 | `server/jev/` : `studio/` (dont `actor/`, `world/`), `videogen/`, `realize/`, `lab3d/`, `sandbox/` |
| `blender/` | 47 | `scripts/blender-bridge.py`, `blender-render.py`, `asset-forge.py`, `scripts/blenderfilm/` → `blender/film/` |
| `moteur-troupe/` | 35 | `scripts/troupe-generee/` (+ `acteurs.py`, `choix_voix.py` du brouillon, rendus portables) |
| `carnets/` | 4 | carnets Colab v16 Drive, essai OpenRouter, `troupe-3d/` |
| `outils/` | 20 | `scripts/` : profondeur, couches de scène, lieux, voix, troupe, santé des outils, `filmbench/`, `video-scene-page.ts`, `eye-check.ts` |
| `docs/` | 5 | AI-VISUAL-STUDIO, ETUDE-ANIMATION-3D, FILM-AUTOPILOT, production-video, veille vidéo HTML 3D |
| `tests/` | 76 | 62 tests unitaires, 6 suites de bout en bout, fixtures `studio/` et `scenes/`, bouchon three.js |
| racine | 2 | `tool-manifest.json`, `THIRD_PARTY_NOTICES.md` (avis de la chaîne d'animation) |

Bibliothèques npm parties avec la vidéo (retirées de `workbench/package.json`, installées dans `studio-video/`) : three,
@types/three, @pixiv/three-vrm, cannon-es, mediabunny, mp4-muxer, mp4box, @gltf-transform/core et extensions.

## Couplages coupés dans Workbench

| Endroit | Avant | Après |
|---|---|---|
| `direct/App.tsx`, `lib/nav.ts`, `lib/types.ts` | rubrique « Bac à sable » (Vidéo IA, Réalisation, Prompt Studio, Studio 3D) | 11 rubriques ; **Prompt Studio** passe dans « Outils » |
| `lib/builtinPlugins.ts` | extension « Studio 3D → Blender » (`blender.scene`, `blender.render`) | retirée (code dans `navigateur/studio3dCore.ts`) |
| `lib/tools.ts`, `lib/skills.ts` | outil `three.run` du chat | retiré |
| `lib/jev.ts` | `jevSceneSpec` (lecture de scène) | API générique `jevAsk` ; la lecture de scène est dans `navigateur/jevScene.ts` |
| `lib/fabricRegression.ts` | 12 vérifications du studio | retirées (couvertes par les tests de Studio Vidéo) |
| `lib/store.ts`, `server/jev/metrics.ts` | types importés du studio | types génériques (`media`, `MediaLogTag`) |
| `views/SettingsViews.tsx`, `lib/types.ts` | clés Pollinations, Hugging Face, fal.ai, pont Blender | dans les Réglages de Studio Vidéo (`navigateur/reglages.ts`) |
| `server/engine/skillsCraft.ts`, `skillsCatalogue.ts` | 25 fiches vidéo / 3D / Blender | retirées, gardées mot pour mot dans `docs/savoir-faire-video.md` |
| `server/engine/capabilities.ts`, `jev/tools.ts`, `agent/intelligence.ts` | outil `blender.scene` | retiré (le connecteur MCP tiers `blender-mcp` reste) |
| `vite.direct.config.ts`, `package.json`, `scripts/livraison.mjs` | three/cannon en IIFE, kit troupe, paquets de décors | retirés : l'app Workbench passe de 21 à 13,6 Mo |
| `lib/db.ts` | base unique | une autre app du socle peut nommer sa base (`__MASSAMBA_DB__`) |

## Socle partagé (contrat)

Studio Vidéo réutilise le socle de Workbench sans le copier, par l'alias `@workbench/` : composants d'interface
(`web/components/ui`), client OpenRouter (`direct/lib/llm`), état (`direct/lib/store`), fichiers (`direct/lib/vfs`), JEV
(`direct/lib/jev`, `server/jev/eye`, `server/jev/provider`), routage des modèles et quelques services. `grep -r
"@workbench/" studio-video` donne la liste exacte. Workbench, lui, n'importe **rien** de Studio Vidéo.

## Données de l'utilisateur

- Studio Vidéo a **sa propre base** dans le navigateur (`massamba-studio-video`).
- Au premier lancement, il **recopie** depuis la base de Workbench les données du studio (clés `vs.*` : projets,
  acteurs, décors, travaux, mémoire, réglages du studio) et les clés des moteurs vidéo. Workbench n'est ni modifié ni vidé.
- Médias (blobs) et paquets de décors importés sont dans des bases séparées, lues telles quelles.
- Clés OpenRouter et JEV : les mêmes que celles de Workbench (stockage local du navigateur).

## Défauts corrigés au passage (relevés par les tests de bout en bout du studio, rejoués ici)

Ces tests ne tournaient plus dans Workbench depuis la refonte de la navigation ; dans Studio Vidéo ils tournent de nouveau
et ont relevé quatre défauts :

| Défaut | Correction |
|---|---|
| Avec une clé OpenRouter, l'écriture du film pouvait être confiée à un service gratuit sans clé (LLM7, Pollinations) ou au petit modèle intégré au navigateur (Qwen3 0,6 B, recommandé « 8,6/10 a priori » par le plan de modèles) : sans eux, l'histoire restait bloquée | une seule règle, `writingCatalog` (`navigateur/studio/textModel.ts`), pour le choix automatique **et** le plan de modèles : avec une clé, le film s'écrit avec le catalogue OpenRouter (mode JSON, coût mesuré, plafond) ; les services sans clé restent le filet de secours automatique du client |
| Le journal du montage ne disait pas quel moteur de rendu tournait ; le test attendait encore une pause « onglet caché » que le rendu image par image (WebCodecs) ne fait plus | le journal du MONTAGE note « rendu du film image par image (30 i/s) : un onglet caché ne fige aucune image », ou « en temps réel » quand l'enregistreur de secours tourne (`preview.ts`, option `onMode`) |
| Les tests des acteurs 3D attendaient 25 min un écran caché (la chaîne 3D est éteinte, `VIDEO_3D = false`) | ces tests sont sautés tant que la chaîne 3D est éteinte, et tournent dès qu'elle est rallumée |
| Les scripts d'initialisation des tests écrivaient dans `localStorage` jusque dans les iframes isolées du bac à sable (origine opaque) | écriture protégée ; l'app elle-même n'y touche pas |
