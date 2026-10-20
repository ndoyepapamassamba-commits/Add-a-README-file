---
name: blender-staged-scene-construction
description: Build large procedural Blender scenes in numbered, checkpointed stages that keep Blender responsive, survive crashes, render in a separate background process, and export verified GLBs. Use when a scene has hundreds of objects or millions of triangles, when bpy.ops operators freeze Blender, when you need deterministic rebuilds (build_all.py), background Cycles renders, honest viewport performance numbers, GLB export hygiene, or validation.json/known_limits reporting. Triggers: "procedural Blender scene", "staged build", "Blender froze", "from_pydata", "background render", "export GLB", "rebuild script".
category: 3D
upstream: https://github.com/oh-ashen-one/blender-agent-skills
source_license: MIT
triggers:
  - scène blender par étapes
  - construction par étapes
  - scène procédurale
  - grande scène blender
  - checkpoint blender
---

# Blender staged scene construction

The core discipline: **many small numbered stages, each saving the .blend, each inspected before the next — and never a mesh operator in a hot loop.**

## The method

1. **Numbered stage scripts.** One file per stage: `01_foundation.py`, `02a_hall.py`, `02b_towers.py`, … `19_scene_record.py`. Run them in order through your Blender MCP wrapper (see the `blender-mcp-isolated-sessions` skill). **Inspect the viewport between stages.** These are sequential construction scripts, not an idempotent editor — replaying a stage into a finished scene duplicates geometry; say so in the README.

2. **Direct mesh construction, not operators.** Build repeated detail with `mesh.from_pydata(verts, [], faces)` + `bpy.data.objects.new` + collection link. Reserve `bpy.ops` for one-off actions. This single change is what took a real build from "Blender froze, owner force-quit" to a responsive 7-million-triangle scene. See `references/mesh_checkpoint_pattern.py` for the `box()`/`cone()` helpers and the `checkpoint()` merge.

3. **Checkpoint after every stage.** Snapshot `_before = set(scene.objects)` at stage start; at the end, merge **only this stage's new meshes**, grouped by material, by concatenating `matrix_world`-transformed verts/faces into one mesh per material — no `bpy.ops.object.join` loops. Then `bpy.ops.wm.save_as_mainfile`. If a later stage crashes or freezes, you reopen the last checkpoint, not the whole project.

4. **Instance what repeats.** 210 render mesh instances sharing 63 unique meshes kept unique geometry at 406,383 polygons while the visible scene totalled ~7.02M rendered triangles. Keep hidden source meshes for repeated forests/architecture and instance them.

5. **Deterministic full rebuild path.** A `build_all.py` that execs every stage into one namespace (`{'__name__': '<build>', 'PROJECT_ROOT': ...}`) reproduces the scene headlessly:
   ```sh
   blender --factory-startup --python outputs/source/build_all.py
   ```
   Document that it replaces the active scene — run it in a new file.

6. **Render in a separate background process, never in the live session.** `references/render_preview.py` sets Cycles explicitly (engine, samples, denoising, adaptive threshold, bounces, `threads_mode='FIXED'` with a thread count that leaves cores for the GUI), then:
   ```sh
   blender -b scene.blend --python render_preview.py
   ```
   The interactive Blender stays open and usable while the final render runs (observed: ~84 s for a 1440×1800, 128-sample Cycles frame on an Apple-silicon box).

7. **Measure viewport performance honestly.** `references/viewport_cadence.py` records intervals between `SpaceView3D.draw_handler_add(..., 'WINDOW', 'POST_PIXEL')` callbacks during a bounded scripted orbit (2 s warmup, 20 s measurement, restores the view after), and writes a JSON whose `metric` field states in words: *"draw callback cadence … not GPU-present frame time or a gameplay FPS guarantee."* A real result looked like: median 11.55 ms, p95 16.95 ms, p99 21.56 ms at a 2137×1222 region. Never present screenshot time, render time, or cadence as an FPS benchmark.

8. **GLB export hygiene** (see `references/glb_export_and_verify.md`):
   - Keep CURVE/FONT objects editable in the .blend; for export only, create **evaluated mesh copies** (`bpy.data.meshes.new_from_object(o.evaluated_get(deps), depsgraph=deps)`), select them plus all meshes, export with `use_selection=True, export_apply=True, export_cameras=False, export_lights=False`, then delete the copies.
   - Stamp provenance into scene custom properties: `S['Reference']`, `S['Concept']`, `S['Authoring']`, `S['Limitations']`.
   - `bpy.ops.file.pack_all()` before saving so textures travel with the .blend.
   - **Verify the GLB in a SEPARATE background Blender process** that re-imports it and records mesh count, triangle count, materials-present, bytes into `export-verification.json` (real: 446 meshes / 657,568 tris / 33 materials / all materials present / 14.4 MB).

9. **Low-res critique loop before the final.** Render ≥3 lower-resolution review frames, inspect each, write down what was wrong (lettering, silhouette overlap, framing, lighting), fix, and only then render the high-res final. Record the reviews in the README.

10. **Ship `validation.json` with `known_limits`.** Geometry counts, render config, what was verified (each item an action you actually performed), and a `known_limits` list that states plainly what the scene is NOT (interpretation not replica, LDR authored textures not scanned PBR, cadence not FPS, no interior, etc.). Template in `references/validation.json`.

11. **Imagegen textures: prompt for a material, not a picture.** The working formula (full prompts in `references/imagegen_texture_prompts.md`): *"seamless tileable PBR base-color texture … flat orthographic close-up surface scan … even neutral diffuse lighting, no directional cast shadows, no perspective, no sky, no objects, no text, no borders … this is a material texture for box projection, not a finished landscape illustration."* Then apply with blended box projection and record in the README that these are authored LDR appearance assets, not calibrated scans.

## LESSONS LEARNED

- **bpy.ops mesh operators at scale freeze Blender.** A detail pass built from operator calls made the GUI unresponsive; the owner closed Blender and work was lost. The recovered build did all repeated detail via `from_pydata` and per-material merging — same machine, 295 objects, 7.02M rendered triangles, responsive 11.55 ms median viewport cadence.
- Per-stage `.blend` checkpoints convert any crash into a one-stage redo. A 19-stage build with no checkpoints is 19 stages of risk.
- Merging "everything so far" each stage re-processes old geometry; merging only `set(scene.objects) - _before` grouped by material keeps stage cost proportional to what the stage added.
- A background `blender -b` render with `threads_mode='FIXED'` (e.g. 6 of many cores) finishes the final frame without freezing the interactive review session. Rendering in the live session blocked exactly when the owner wanted to keep inspecting.
- Three review renders caught lettering, beard/smile overlap, sleeve contour, lighting, and framing errors that the geometry queries never could. Geometry validity ≠ visual correctness.
- Honest metrics build trust: labeling the cadence JSON "not a 60-fps guarantee" and listing `known_limits` is what let the results be quoted without caveats later.

## FAILURE CATALOG

| Symptom | Root cause | Fix |
| --- | --- | --- |
| Blender UI freezes during a detail pass; must be force-quit | Hundreds/thousands of `bpy.ops.mesh.*` operator calls, each doing context switches and depsgraph churn | Build repeated geometry with `mesh.from_pydata`; merge per material at stage end with the checkpoint pattern |
| Re-running a stage duplicates everything | Stage scripts are sequential constructors, not idempotent editors | Restore from the previous checkpoint .blend before re-running; document non-idempotency in the README |
| Final render blocks the interactive session for minutes | Rendering in the live GUI process | Render via `blender -b scene.blend --python render_preview.py` with fixed thread count; keep the GUI for review |
| GLB has no text / missing curve geometry | CURVE/FONT objects don't export as intended directly | Create evaluated mesh copies for export, `export_apply=True`, delete copies after; keep editable sources in the .blend |
| GLB looks wrong in viewers vs Cycles render | glTF can't carry Cycles area lights or all procedural shader detail | `export_cameras=False, export_lights=False`; state the limitation in `S['Limitations']` and validation.json; verify by re-import in a separate background process |
| "60 fps" claim collapses under scrutiny | FPS inferred from a still, render time, or unlabeled draw callbacks | Measure POST_PIXEL draw-callback intervals in a bounded orbit and label the JSON as cadence, not GPU-present timing |
| Textures look like photos of landscapes when applied | Imagegen prompt asked for a scene, not a surface | Use the material-texture prompt formula: flat orthographic scan, even lighting, no shadows/perspective/borders, "not an illustration" |
| Merged meshes lose smooth/flat shading | Polygon `use_smooth` flags dropped during manual merge | Carry `p.use_smooth` through the merge (see reference code) |

## BEST PRACTICES

- Save the .blend at the end of every stage AND keep at least one versioned earlier .blend (`*-v1.blend`) as a recovery point.
- Put shared helpers (`box`, `cone`, `beam`, `arch`, `checkpoint`, `mesh`) in a `common.py` imported by all stages; stages stay short and declarative.
- Multiple named cameras (portrait, hero, low-angle, aerial) cost nothing and make review renders comparable across stages.
- Save the .blend in a maximized material-preview viewport with the deliverable camera active — the next person (or agent) opens the file already looking at the product.
- Write the README's performance and limits sections BEFORE declaring done; if you can't state what it is not, you haven't verified what it is.
