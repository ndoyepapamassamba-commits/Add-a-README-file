---
name: blender-cinematic-scene
description: Create or refine detailed Blender scenes with procedural bpy modeling, reference-based reconstruction, cinematic PBR lighting, interactive exploration, animation and visual verification. Use for substantial Blender modeling or scene-quality work, especially accurate buildings, vehicles and interiors.
category: 3D
upstream: https://github.com/Evan1108-Coder/blender-cinematic-modeling-skill
upstream_name: blender-cinematic-modeling
source_license: MIT
triggers:
  - blender
  - bpy
  - scène 3d
  - scene 3d
  - éclairage cinématographique
  - eclairage cinematographique
  - lumière trois points
  - caméra 3d
  - camera 3d
  - rendu 3d
  - animation de caméra
  - animation de camera
  - objet 3d
  - modélisation
  - modelisation
  - glb
  - studio 3d
---

# Blender Cinematic Modeling

Turn the requested subject into an editable, visually inspected Blender project. Favor convincing construction, material response and composition over raw polygon count. This workflow supports both original designs and reconstructions; do not require external reference research for a purely abstract or deliberately original scene.

## Establish the target

Identify the subject/version, required interior coverage, deliverables and whether the task is a still, animation or interactive scene. Use existing conversation context before asking questions. Ask when a missing choice would materially change the build; otherwise state reasonable assumptions and proceed.

For a reconstruction, research verified photographs, footage or drawings before fixing the layout. Record source URLs, captions/timestamps, depicted area and confidence. Separate final imagery from concepts, construction photos and unrelated locations. Map rooms, doors, circulation and major equipment before adding detail. Mark unseen dimensions and placements as inferred; more images do not automatically establish accuracy.

Inspect the available Blender version, hardware and render devices. Use the actual supported bpy API and check unfamiliar/version-sensitive behavior against Blender's official documentation or runtime. Do not assume that a GPU setting means an available device is being used.

## Build and evaluate

Read [visual-quality.md](references/visual-quality.md) when planning geometry, materials and lighting.

- Establish silhouette, scale, connected volumes and major camera views first. Compare blockout renders to references before multiplying fine detail.
- Model thickness, recesses, layered interfaces and mechanisms where they affect silhouette, shadows, close inspection or function. Textures complement geometry; neither arbitrary greebles nor uniform noise substitute for correct construction.
- Keep the scene reproducible with clearly separated geometry, materials, layout and optional interaction code when complexity warrants it. Use deterministic seeds where useful.
- Execute the code in Blender, capture logs, correct failures and rerun affected checks. Save revisions before replacing working scenes. Preserve user edits and avoid closing or steering an active preview without authorization.
- Produce representative renders early enough to correct structural and lighting mistakes. Use actual Blender output for verification; concept images are not evidence that the model works.

## Optional exploration and mechanisms

Implement these only when requested. Do not turn a still-image task into an application or switch engines merely because another engine is available.

For keyboard exploration, default to WASD movement, arrow-key viewing, Space/Shift vertical motion and Control boost unless the user chooses otherwise. Document focus requirements, activation, exit and restart. Bind modal controls to the correct displayed window and view region. State whether navigation is free flight or collision-aware.

Make relevant doors or mechanisms operable with documented keys. Provide a standard editable timeline as well as interactive playback when practical. Verify deployment, operation, stopping and return, including mid-transition reversals if supported. Check attachment endpoints, clearances and angular continuity. Describe cinematic motion assumptions separately from physical simulation claims.

## Performance and delivery

Read [verification.md](references/verification.md) before approving the scene.

For an interactive project with no other target, aim for approximately 20 moving FPS on the user's actual machine while prioritizing visual quality. Treat this as a preference, not a guaranteed floor. Use shared meshes, instancing, sensible batching and appropriately sized textures before sacrificing important geometry. Never hide nearby solid structure based on a faulty room or altitude test.

Measure representative moving views and record viewport size, quality settings, hardware and frame-time variability. Do not present idle redraw rates, background render times or historical measurements as current interactive FPS. Separate preview settings from final render quality.

Deliver the editable blend, reproducible source and required assets, useful opening views, representative renders and concise operating instructions. Resolve asset paths or pack assets as appropriate. Report completed changes, actual checks, measured performance and remaining approximations. If execution or inspection is unavailable, state that limitation instead of claiming a finished, tested scene.

For a reusable user brief, adapt [request-template.md](references/request-template.md).
