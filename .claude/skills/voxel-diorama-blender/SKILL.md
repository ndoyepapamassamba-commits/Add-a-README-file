---
name: voxel-diorama-blender
description: Author voxel dioramas in Blender with batched per-(group,palette,shade) meshes, deterministic epsilon insets that kill coincident-face artifacts, and sRGB-correct palette shading — plus export the same procedural scene to an interactive web viewer by replaying the generator with monkey-patched capture. Use when building voxel art, isometric dioramas, cube-based scenes, when coincident coplanar faces cause black patches, when object count explodes past thousands, when converting Blender Z-up to web Y-up, or when the user says "voxel", "diorama", "isometric cubes", "blender to web", "export scene as JSON", "instanced blocks".
category: 3D
upstream: https://github.com/oh-ashen-one/blender-agent-skills
source_license: MIT
triggers:
  - diorama
  - voxel
  - scène miniature
  - isométrique 3d
---

# Voxel diorama in Blender (+ Blender-to-web export)

One self-contained deterministic script in, renderable diorama and web-ready JSON out. Proven at **~28k voxel cells → ~57 Blender objects → 17,156 exported static blocks + 21 animated actors**.

## The method

1. **One deterministic bpy script** with clear component functions and a fixed `random.seed()` (reseed per pass: base build 82, detail pass 904, polish pass 905). Must run with `blender -b -P build.py -- OUTPUT_DIR`. No external assets, no addons.

2. **Batch every cube into per-(group, palette, shade) buckets.** `box()` only appends verts/faces to a `defaultdict` bucket keyed by `(GROUP, color, shade)`; a final `compile_scene()` builds one mesh per bucket with `from_pydata` and links it into a per-group collection. This is how 28k cells become ~57 objects — under any engine's per-object overhead and far under an 8,000-object budget. Full code: `references/voxel_core.py`.

3. **Kill coincident-face black patches with deterministic epsilon insets.** Adjacent unit cubes share exact coplanar faces → z-fighting/black patches. Inset every block by
   ```python
   eps = min(min(w, d, h) * 0.025, 0.0015 + (total_blocks_so_far % 17) * 0.00009)
   x += eps; y += eps; z += eps; w -= 2*eps; d -= 2*eps; h -= 2*eps
   ```
   The `min(dim)*.025` scales the gap with block size; the `%17` jitter makes gaps deterministic but non-uniform so no two neighbors re-share a plane. Invisible at diorama scale, fatal-looking when absent.

4. **Palette: hex table × 4 shade factors, converted sRGB→linear properly.** ~37 named hexes, each expanded with factors `[0.86, 0.95, 1.0, 1.07]`, each channel run through the real transfer curve:
   ```python
   def lin(c): return c/12.92 if c < .04045 else ((c+.055)/1.055)**2.4
   ```
   Pick shades via weighted `random.choices(range(4), [1,3,7,1])` so the mid shade dominates and variation reads as handcrafted, not noisy. Skipping the sRGB→linear step makes everything washed out or muddy — this was a real fix.

5. **Structure reads at thumbnail scale.** Terrain layers, a dominant stepped tower, a separate water feature, market/houses/trees/figures as named GROUPS — group names become Blender collections and later web scene-graph buckets. Keep one skyline-dominant silhouette; entrances and secondary towers smaller than the main tower.

6. **Presentation**: orthographic cameras (hero + 3 detail close-ups + a keyframed 20-second turntable with a TRACK_TO constraint), warm area "sun" with haze, AgX view transform with slight exposure lift, big neutral backdrop plane. Support a preview env var (`SCENE_PREVIEW=1`) that drops to one camera at half resolution and ~16 samples for a fast critique loop. Write `scene_stats.json` (per-group block counts, object count).

7. **Render low-res first, inspect, fix, re-render** — the same critique loop as any gated visual work. Verify: script exits 0, .blend reopens, PNG exists, and visual inspection confirms no cropping, missing materials, floating pieces, obstructed focal features, or illegible lighting. "Do not stop after merely writing code or creating files."

## Blender-to-web: export by replay

8. **Don't parse the .blend — replay the generator.** The exporter (`references/export_to_web_json.py`) reads the generator's source, truncates everything from its final build-call line onward, `exec()`s the prefix, then **monkey-patches `box()` and `person()`** to capture records instead of meshing:
   - patched `box()` appends `[x,y,z,w,d,h,color,shade,GROUP]` (rounded to 4 decimals) to a static list — skipping fluid/overlay groups that the web viewer re-implements;
   - patched `person()` lets the real function run into a per-call capture buffer, recenters the parts to the figure origin, and stores `{x,y,z, parts, pose}` as an animated actor.
   Because the capture runs the *same deterministic code*, the JSON reproduces the Blender scene exactly — a captured export matched the committed `village.json` byte-for-byte.

9. **Web side**: Z-up (Blender) → Y-up (three.js) conversion; one `InstancedMesh` per (color, shade) bucket; palette JSON carries the exact hexes; ground-level actors become independently articulated assemblies (walk poses, flapping, ripples — *procedural visual animation, not a fluid simulation*, and say so). Validate: all exported blocks have positive dimensions, all corners fit the enclosure, TypeScript + production build pass — and record honestly what was NOT tested (e.g. "interactive browser behaviour has not been manually QA-tested").

10. **The one-shot agent prompt** that produced the whole thing is in `references/one_shot_agent_prompt.md`. Its load-bearing clauses: run heavy work on a dedicated workstation in a task-unique directory; discover the installed Blender version first; no external assets; integer-grid unit cubes with shared/batched geometry under an explicit object budget; one self-contained deterministic script; use the installed version's supported settings, "not obsolete ambient-occlusion properties"; success criteria include *visual inspection*, not just exit codes.

## LESSONS LEARNED

- Object count, not polygon count, was the bottleneck: batching by (group, palette, shade) is what makes tens of thousands of voxels cheap. 28k cubes as objects is a frozen UI; as 57 meshes it's nothing.
- Coincident faces don't just shimmer — at grazing angles they render as large black patches that read as "broken scene". The epsilon inset is cheaper than any merge-by-distance cleanup.
- Writing colors as hex then naively scaling in sRGB space produces dead, muddy shading. Do the linear conversion once at material creation.
- Deterministic seeds per pass let you regenerate the whole scene after any tweak and diff renders meaningfully. Non-determinism makes "did my fix help?" unanswerable.
- Export-by-replay beats .blend parsing because the generator is the single source of truth — the web scene can never drift from the Blender scene, it IS the Blender scene.
- Keep water/sky/overlay effects out of the static export and re-implement them natively on the web; baked sim geometry exports badly and animates worse.

## FAILURE CATALOG

| Symptom | Root cause | Fix |
| --- | --- | --- |
| Black patches on flat surfaces at some angles | Coplanar faces of adjacent cubes z-fighting | Deterministic epsilon inset: `min(dim)*.025` capped by `0.0015 + (count%17)*0.00009` |
| Blender unresponsive / export takes forever | Thousands of individual cube objects | Batch buckets keyed by (group, palette, shade); one `from_pydata` mesh per bucket (28k cells → ~57 objects) |
| Scene looks washed out / shades indistinguishable | Shade factors applied in sRGB without linearization | Convert each channel with the sRGB→linear transfer function before multiplying |
| Regenerating the scene changes everything, reviews impossible | Single unseeded (or re-seeded mid-run) RNG | Fixed seed per pass: build / detail / polish each reseed explicitly |
| Web viewer scene drifts from Blender original | Separate hand-ported web geometry | Export-by-replay: truncate generator before its build call, exec prefix, monkey-patch box()/person() to capture JSON |
| Old script fails on newer Blender (e.g. AO properties gone) | Settings written against a different version's API | Discover the installed Blender version first; use only its supported settings; state the version in outputs |
| "Done" scene has floating pieces / cropped focal features | Declared done on exit code, never inspected the render | Success criteria must include opening the PNG and checking framing, materials, floaters, occlusion, legibility |

## BEST PRACTICES

- Quarter-unit sub-blocks (faces, limbs, embroidery, garlands) keep the cubic language while reading as detail from the hero camera.
- Give every named camera a purpose (hero / craftsmanship / street life / market detail) and keep a turntable camera for motion review.
- Save the .blend in a clean material-preview camera view, nothing selected, overlays off — first-open impression matters.
- `scene_stats.json` per-group block counts double as a changelog: detail passes show up as new groups.
- When the composition mixes architectural periods or takes artistic license, label it: "an artistic inspired-by scene, not an archaeological reconstruction."
