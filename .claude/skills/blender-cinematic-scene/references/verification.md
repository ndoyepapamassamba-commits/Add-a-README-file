# Verification and handoff

Choose checks for the actual scene and its failure modes. Do not generate a large test suite simply to count assertions.

## Geometry and visual review

- Compare exterior silhouette and major interior layouts to identified references.
- Render each major room and several connecting passages. Include reverse and elevated views where gaps could be hidden.
- Inspect wall thickness, window openings, hatch surrounds, floor continuity, equipment intersections, normals and coplanar artifacts.
- Where useful, sample rays through a structural boundary independently of decorative fittings, so furniture cannot mask a hole.
- Test more than one passage centerline when rails, shoulders or equipment could obstruct the opening. A ray test is not a body-clearance or collision test.
- Inspect glazing from inside and outside using the delivery preview settings.

Record what a check actually establishes. Finite ray samples do not prove a manifold, airtight or flightworthy pressure vessel. Mesh closure does not establish structural engineering adequacy.

## Motion and controls

Exercise the real input handler and confirm that the intended window receives input when native testing is available. Headless handler tests are useful but do not prove focus, key delivery or live FPS.

Inspect a complete motion cycle, not only a fully deployed pose. Look for angle wrapping that interpolates backward, tracking singularities, cable endpoints drifting from anchors, disconnected pivots and clipping through surrounding structures. Use continuous rotations, compatible orientation representations or constraints as appropriate; do not impose one representation on every rig.

Check baked animation as well as the live controller. A controller can work while sampled keyframes interpolate incorrectly. Choose baking frequency according to measured error, not a universal every-frame rule. Test stop/restart/reverse behavior only when that behavior is supported.

## Performance

Measure while moving through demanding interior and exterior views. Record machine, Blender version, render engine, viewport dimensions, resolution scaling, sampling, shadows and volumetrics. Include average FPS and a frame-time percentile or equivalent indication of stutter when measurements permit.

Repeat comparisons under the same conditions. If hardware, window size, thermal state or quality settings change, identify the difference. Do not convert background rendering throughput into viewport FPS.

## Delivery record

Include the blend path/version, rebuild command, launcher or activation instructions, key map, asset dependencies, renderer settings, inspected views, test results and limitations. Keep referenced third-party photographs out of public redistribution unless their license permits it; source links and original reconstruction code can be delivered separately.

If a failure repeats, diagnose its cause or narrow the blocked operation. Do not loop indefinitely, rerun unrelated checks or claim success because time is running out. Finish independent work and report a genuine blocker when the needed environment or evidence is unavailable.
