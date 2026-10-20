---
name: blender-rig-verification
description: Build an analytically-defined, numerically-verified mechanical rig in Blender (constant-arclength folds, rigid linkages, constant-length cables), bake the scripted choreography into an editable shape-key timeline, validate the bake by independent re-render, and ship it as a scroll-driven render-sequence website. Use for product/mechanism visualization, folding devices, exploded views, when you need transforms that reverse exactly, shape-key baking, baked-animation verification, per-frame web label anchors, frame-sequence scroll sites, or when the user says "rig verification", "constant arclength", "bake animation", "scroll-driven render sequence", "frame sequence website".
category: 3D
upstream: https://github.com/oh-ashen-one/blender-agent-skills
source_license: MIT
triggers:
  - vérification de rig
  - verification de rig
  - rig cassé
  - os mal pesé
  - déformation du personnage
  - contrôle du squelette
---

# Blender rig verification (+ render-sequence web delivery)

Scripted choreography as a pure function of normalized time `t` → numeric proof it never stretches, collides, or drifts → baked editable timeline → pixel-verified → shipped as a scroll sequence. Proven on a 376-object folding-device assembly: 101-state sweep, reversibility < 1e-7, bake match < 0.02 mm over 16 sampled frames, independent re-render SSIM **0.999209**.

## The method

1. **Define the mechanism analytically, not with constraints.** All dimensions in illustrative millimeters in helper math; convert to Blender meters at the object boundary. The fold (`references/rig_math.py`):
   - **Constant-arclength centerline**: a flexible band of fixed arc length (5 mm); rigid halves stay tangent to it. `centerline(y, theta)` returns position + tangent angle along the band for fold angle theta (0 = flat, π = closed). Screen/shell vertices map through `fold_point(x,y,z,theta)` — the neutral plane can never stretch because length is imposed by the formula, not simulated.
   - **Rigid hinge linkage**: two links of exactly 5.8 mm meet at the *circle-intersection* of the two anchor points (`sqrt(max(0, L² - (d/2)²))` along the perpendicular bisector). Exact by construction.
   - **Constant-length service cables**: a cubic Bezier with slack loop whose control handle is found by **bisection** (24 iterations on arc length, target 31.5 mm), then resampled at equal arc length. The cable slack varies with theta; the total length cannot.

2. **Choreograph as `apply(t)`, t ∈ [0,1].** Camera position/target/lens, fold angle, explosion amount, hand presence — all keyframed against normalized scroll/timeline position with smoothstep interpolation, holds at extremes. Because every state derives from t alone, **reversibility is testable**.

3. **Verify numerically in a CLI harness** (`references/verify_harness.py`) before any render:
   - Sweep 101 states; assert rigid-link error < 1e-6, cable length within ±0.05 mm of target, display neutral-plane arclength within ±0.01 mm, object count constant, all vertices finite.
   - **Transform reversibility round-trip**: snapshot all `matrix_world`, drive t through `.12 → .62 → .73 → 1 → .73 → .62 → .12`, compare — max element error **< 1e-7** or the choreography has hidden state.
   - **Outward normals via signed volume**: `bmesh.calc_volume(signed=True)` must be positive per watertight part; negative = inward normals that will shade wrong.
   - **Clearance-envelope sweep**: transform other parts' vertices into the rigid halves' local frames across ~168 poses; count vertices inside a conservative box envelope and track max depth. Label the result conservative (rounded corners need visual review); assert depth < 0.1 mm.
   - Every report carries a `limitations` array ("illustrative kinematics, not manufacturing validation").

4. **Bake scripted motion into an editable timeline** (`references/bake_and_verify.md`): per-frame transform keys on moving objects, camera lens keys, custom-prop keys, plus a **Basis + one shape key per frame** on deforming meshes with the 0→1→0 value envelope at (prev, this, next) frame. Force LINEAR interpolation on all fcurves (CONSTANT for hide_render) — the sampled choreography already contains its easing. In Blender 5 traverse `action.layers → strips → channelbags → fcurves`. Result: a .blend that plays with **no auto-run Python and no MCP connection**.

5. **Verify the bake against the source**: snapshot matrices + sampled evaluated vertices at 16 spread frames via `apply(t)`; reopen the baked file, **clear all frame-change handlers**, `frame_set` each frame, compare — visible object sets equal, world-vertex error < 0.02 mm. Then **render one baked pose independently and SSIM-compare** against the corresponding scripted render: 0.999209 observed; residual difference consistent with independent Cycles sampling.

6. **Export per-frame label anchors** for the website: pick component points, `world_to_camera_view(scene, camera, obj.matrix_world @ local)` per frame, write `[x, 1-y, z>0]` per frame to `anchors.json`. Web labels track 3D parts through the scroll for free.

7. **Ship as a scroll-driven frame sequence** (`references/render_sequence_web.md`): 480 frames at 24 fps (20 s master), dual-resolution WebP sets (desktop 1280×1000 ~24.9 MB, mobile 832×650 ~12.8 MB), a canvas player with an ImageBitmap decode cache capped at **24 bitmaps desktop / 12 mobile** (evict farthest-from-target), adjacent-frame `globalAlpha` cross-blending during continuous motion, DPR capped at 1.5, reduced-motion fallback to chapter stills, and a `?qa=1` perf panel logging rAF intervals, draw ms, long tasks, cache peak. Measured on an Apple-silicon laptop: **rAF p99 ≈ 10.4 ms, zero intervals over 33.4 ms in ~5,800 frames** — and the report states these are browser playback measurements, with canvas resolution and cold-load caveats.

8. **Imagegen-as-targets discipline**: concept images set intent ("resolve a smooth bend radius and sufficient cavity with a functioning rig") — but **never deform geometry to match a still**. "The generated seam is only a visual suggestion. Do not put geometry through itself to match a still."

## LESSONS LEARNED

- Analytic rigs beat constraint stacks for verification: when the fold IS a formula, "does it stretch?" becomes a numeric assertion instead of a hope. The 101-state sweep runs in seconds and catches regressions permanently.
- Baking with per-frame shape keys (480 of them) sounds insane and works beautifully: the deliverable .blend needs no scripts, no handlers, no connection — and the 0.02 mm bake-vs-script check proves nothing was lost in translation.
- **Handlers must be cleared when validating a baked file** — a lingering `frame_change_pre` handler re-applying the script would make the bake verify itself vacuously.
- Signed volume is the cheapest normal-direction test: one bmesh call per part, no ray casting.
- SSIM against an independent re-render is the right "did the bake change the picture?" metric; demanding 1.0 is wrong because Cycles sampling differs run to run — 0.9992 is what "identical scene, different seed" looks like.
- Cross-blending adjacent frames is what makes 24 rendered poses/second feel like 60 fps on scroll — and the honest report says exactly that: "smooth browser presentation does not mean 60 independently rendered poses per second."
- A capped ImageBitmap cache with farthest-eviction is the difference between a scroll site and a browser crash: 480 frames × full-res bitmaps does not fit in memory; 24 does.

## FAILURE CATALOG

| Symptom | Root cause | Fix |
| --- | --- | --- |
| Cable/strap visibly stretches during fold | Spline length free to vary with control handles | Bisection-solve the handle for constant arc length (target ±0.05 mm), then resample at equal arclength |
| Assembly doesn't return to its start pose after scrubbing | Choreography has hidden accumulated state | Make all state a pure function of t; enforce with the reversibility round-trip (<1e-7) |
| Part shades black/wrong from some angles | Inward face normals | `bmesh.calc_volume(signed=True) > 0` assert per part; recalc/fix geometry |
| Baked .blend plays wrong without the script | Reliance on frame-change handlers at playback | Bake transforms + per-frame shape keys; verify with handlers cleared at 16 sampled frames (<0.02 mm) |
| Bake verification passes vacuously | Handler still registered re-applies the script during checks | `bpy.app.handlers.frame_change_pre.clear()` (and `_post`) before comparing baked frames |
| Easing looks stepped after baking | Nonlinear fcurve interpolation resampling the keys | Set every fcurve keyframe to LINEAR (CONSTANT for visibility); easing lives in the sampled choreography |
| Web labels drift off their components | Labels positioned in CSS, not projected from the scene | Export per-frame `world_to_camera_view` anchors; lerp between frames client-side |
| Scroll animation stutters / tab dies | All 480 frames decoded and held as bitmaps | createImageBitmap cache capped 24/12, farthest-from-target eviction, ≤4 inflight fetches, DPR cap 1.5 |
| "60 fps" claim for a frame sequence | Blending conflated with rendered poses | State the truth: 480 rendered poses, adjacent-frame blend during motion, rAF percentiles measured in-browser |
| Geometry interpenetrates to match a concept still | Pushing meshes to match a 2D suggestion | Concept = intent; solve with mechanism math and clearance envelopes; keep the still as a visual target only |

## BEST PRACTICES

- Keep rig math in units that read well (mm) and convert once at the object boundary (×0.001) — avoids both float noise and unreadable literals.
- Store rig parameters as custom props on a single CONTROL object (`fold_degrees`, `explode`) so the baked timeline and the script share one interface.
- Timeline markers named per chapter ("Held open", "Closed", "Exploded"…) double as web scroll chapters.
- Write the verification JSON's `limitations` before the marketing copy; quote only what the harness measured.
- Version the render source commit next to the frames (`render-source-commit.txt`) so any pixel can be traced to the exact code that made it.
