# Vidéo 3D — état des acquis et reprise (14/10/2026)

Décision du propriétaire : la vidéo 3D sort de l'app et devient un sujet à part (« vidéo 3D »). Rien n'est supprimé :
le drapeau `workbench/direct/lib/features.ts` → `VIDEO_3D = false` retire Studio 3D Pro de la navigation et les options
3D du Film Studio (acteurs 3D, tournage Blender) ; le remettre à `true` ramène tous les écrans.

## Où tout se trouve
| Acquis | Emplacement |
|---|---|
| Moteur de film Blender (histoire → voix → plan → scène → rendu → montage → porte) | `workbench/scripts/blenderfilm/` (`film.py`, `plan.py`, `scene.py`, `finish.py`, `gate.py`, `director.py`, `mocap.py`, `acting.py`, `liveface.py`, `crowd.py`, `preflight.py`…) |
| Réalisateur (prompt → consignes de jeu validées) | `director.py`, `direction-vocab.json`, `server/jev/studio/stageDirections.ts`, onglet Réalisateur de `Lab3DView.tsx` |
| Studio 3D Pro (bac à sable Three.js, physique, shaders, GLB, pont Blender) | `direct/views/Lab3DView.tsx`, `direct/lib/lab3d/`, `direct/lib/studio3dCore.ts`, `direct/lib/blenderBridge.ts`, `scripts/blender-bridge.py` |
| Acteurs 3D réutilisables, tournage Blender du Film Studio | `direct/views/studio/actor3d.tsx`, `actorCasting.tsx`, `blenderShoot.tsx` |
| Tests | `tests/unit/blenderLaws.test.ts` (27), `stageDirections.test.ts` (5), `circuit.test.ts` (13) |
| Notes de recherche et mesures | ce dossier : `contournements_bac_a_sable.md` (§1–10), `reverification_catalogue_openrouter.md`, `texte_vers_mouvement_agents_bpy.md`… ; `docs/production-video.md` |
| Veille et registre d'outils | `.claude/skills/veille-permanente/SKILL.md` (journal daté), `.claude/skills/outils-puissants-d-abord/SKILL.md` |
| Caches locaux (hors dépôt) | `~/.cache/massamba-models/` (LivePortrait, Qwen3 1,7B GGUF, clips CMU, 100STYLE), kit troupe `workbench/.private/troupe` |

## Dernier état mesuré (film 9, 14/10/2026)
- Rendu complet 576×1024, 1 600 images, Cycles CPU 4 cœurs : **2,57 s/image**, 4 515 s au total. Technique : 0 saut de
  lumière, −14,4 LUFS, image = son, conformité 3D 100 %. Porte : **NON** sur le rythme de la chaîne — mouvement 0,0271
  (≤ 0,027), couverture 0,53 (≤ 0,435 avec la marge « monde vivant » ; vos TikTok : 0,15–0,29).
- L'aperçu (une image sur trois) sous-estimait mouvement (−14 %) et couverture (−20 %) : corrigé (`held_share`, porte
  « non mesurable sur un aperçu », `--apercu --pas 1`).
- Décomposition mesurée sur 4 plans (demi-résolution, toutes les images, même mesure) :

| Variante | mouvement | couverture | plan 2 (gpm glissement) | plan 7 (gpm avancée) | plan 10 (deux, glissement) | plan 21 (deux, recul) |
|---|---|---|---|---|---|---|
| e0 tel quel | 0,031 | 0,55 | 0,79 | 0,83 | 0,77 | 0,22 |
| e1 décor figé | 0,031 | 0,54 | 0,77 | 0,82 | 0,77 | 0,20 |
| e3 caméra fixe | 0,028 | 0,47 | 0,79 | 0,83 | 0,41 | 0,20 |
| e4 caméra fixe + décor figé (plans 2 et 7) | 0,053* | 0,80* | 0,78 | 0,82 | — | — |
| e2 sans jeu de corps ni gestes | 0,014 | 0,28 | 0,67 | 0,40 | 0,12 | 0,14 |
| e5 moteur corrigé (corps 0,35 sur plans serrés, caméra posée, zoom 3 %) | 0,031* | 0,55* | 0,63 | 0,64 | 0,40 | (en cours) |

  \* sur les plages mesurées seulement.
- Lecture : sur un gros plan moyen, c'est la silhouette dessinée entière qui bouge (jeu de corps, respiration, gestes)
  et la mesure déclenche dès une fraction de pixel sur un dessin à motifs fins ; la caméra pèse sur les plans à deux.
  Les correctifs poussés (`BODY_SCALE`, caméra posée, `--camera-fixe`) ramènent les plans serrés de 0,8 à 0,63 : encore
  au-dessus de la cible. Pistes à la reprise : corps totalement immobile en plan serré (seuls tête, bouche, bras),
  cadrage moins serré, ou décision du propriétaire sur la marge « monde vivant » de la porte.
- EEVEE sans carte graphique (OpenGL logiciel) : ≈ 150 s par image fixe, erreurs EGL → écarté. Cycles CPU reste la voie.

## Pour reprendre
1. `VIDEO_3D = true` dans `features.ts` (écrans), `npm run build:direct`.
2. `cd workbench/scripts/blenderfilm && python3 film.py --story stories/tomates.json --troupe ../../.private/troupe --out <dossier> --voices <piper> --apercu --pas 1` (rythme mesurable en ≈ 20 min), puis sans `--apercu` pour le rendu final (≈ 75 min sur 4 cœurs).
3. Lire `contournements_bac_a_sable.md` §10 avant de toucher au jeu de corps.
