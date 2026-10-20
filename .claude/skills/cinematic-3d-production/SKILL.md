---
name: cinematic-3d-production
description: Plan, create, and verify cinematic 3D stills or animations with Blender asset authoring and Unreal Engine final rendering. Use for product, architectural, scientific, or story-driven visualization when visual quality and recoverable production matter. Do not treat cinematic imagery as engineering or simulation proof.
category: 3D
upstream: https://github.com/Kian-hdr/cinematic-3d-production
source_license: MIT
triggers:
  - production cinématique
  - production cinematique
  - unreal
  - unreal engine
  - temps réel
  - temps reel
  - plan cinématique 3d
  - rendu final 3d
---

# Cinematic 3D production

Turn a visual brief into an editable, reviewable still or film. Blender is the default asset-authoring tool and Unreal Engine the default final 3D renderer. Adapt the scale of work to the request. If the user specifies another pipeline, resolve that choice with them before changing tools.

## Start with the brief

1. Inspect supplied assets, instructions, source manifests, current work, and feedback. Preserve selected versions and accepted decisions. Do not pick the newest filename merely because it is newest.
2. Use [the intake guide](references/intake.md) to establish the deliverable, audience, story or subject, accuracy needs, visual references, source rights, formats, timing, audio, budget, deadline, review points, and destination. Ask one concise batch of questions only for material gaps. A simple still needs fewer questions than a campaign film. Do not silently turn examples into requirements.
3. Summarize a short production brief with explicit assumptions and acceptance criteria. Distinguish a request to plan from a request to produce. For production, continue through the authorized work rather than inventing repeated approval gates.
4. Inspect [tool and host readiness](references/setup.md) before relying on a renderer or paid compute. Install missing tools when the user's environment and permissions allow it; record any interactive sign-in, license acceptance, hardware, or cost blocker precisely.

## Develop the visual direction

- For a film, cover the complete beginning-to-end story with a small useful set of concept boards. Each panel names the action, framing, movement, approximate timing, and sound or narration intent. Concept art is a planning aid, not verified geometry or physical behavior.
- Build a timed animatic at the intended playback speed before detailed production. Check action readability, transitions, and audio space. Label accelerated rig tests and low-quality previews accurately.
- For multiple aspect ratios, plan distinct compositions and edits where the brief requires them. Share assets and action, then adjust camera, framing, text clearance, and timing for each actual output gate. Do not assume a center crop is sufficient.
- For a single still, use a proportionate composition proof and proceed to the final image; a storyboard or scheduling system is unnecessary.

## Build and render

Read [production decisions](references/production.md) when creating or changing a scene.

- Keep editable Blender sources and an inventory of scale, axes, hierarchy, normals, UVs, materials, pivots, constraints, textures, and animation. Test a small real import into Unreal before committing the entire asset set. Recreate procedural appearances or drivers that do not transfer.
- Assemble final scenes, materials, lighting, effects, cameras, and animation in Unreal. Preserve independent moving pivots and verify intermediate poses and shutter-time behavior, not just keyed endpoints.
- Choose filmback, lens, focus, exposure, color, lighting, and effects for the brief. Check the installed engine's actual feature support. Lumen, Nanite, anamorphic treatment, and large-format framing are options to prove useful, not mandatory checkboxes.
- Compose across the full movement envelope. Check edge clearance, occlusion, subject size, text safe areas, and motion at normal speed. Author smooth camera moves; avoid frame-by-frame auto-fit zoom changes.
- Before bulk rendering, make a representative native-output moving proof for animation, including difficult effects, cuts, warm-up, color, text, and encoded audio if requested. A still needs a representative final-size proof. Inspect actual frames and playback, then lock an effective recipe per continuous shot.
- Run bounded, recoverable jobs. Preserve source revision, camera, timing, effective overrides, temporal history, frame ranges, and completion receipts. Reuse valid unaffected work; rerender a coherent shot when its recipe changes. Do not splice incompatible render recipes into one continuous shot.

## Finish and verify

Read [quality and delivery](references/quality-and-delivery.md) before export or handoff.

- Choose dimensions, frame rate, duration, codec, bitrate, color, captions, and audio from the brief and current destination rules. Do not inherit a previous project's values. Record native output size separately from internal render resolution or upscaling.
- Check frame coverage and order, cut boundaries, duration, constant frame rate when required, pixel aspect, color transformation and tags, codec, full decode, audio sync, and complete normal-speed playback. For animation, use representative contact sheets to find visual discontinuities, then watch the entire final edit and listen where audio exists.
- Deliver the editable sources and necessary dependencies, final media, shot or render recipes, asset attribution, and concise recovery instructions as agreed. Verify the actual destination rather than equating a local export with delivery.
- Report separate states: rendered, technically checked, visually reviewed, delivered, and user accepted. State what was not checked.

## Cost and boundaries

Read [cost-efficient production](references/cost-efficient-production.md) for long or repeated work. Measure total time and cost through finishing, encode, transfer, and review. Use inexpensive previews for decisions that do not need native quality; prove hard temporal effects at final settings. Do not buy software, start paid compute, upload private sources, or publish without the applicable user's authorization. Retain scientific or simulator-native evidence when required; label a cinematic reconstruction as an illustration.
