# Production decisions

## Story and source control

Select a source manifest and retain a concise decision log. Model and animation assets must be traceable to the chosen source revision. Keep concept art separate from source geometry, and label physically unverified effects. An animatic should demonstrate the whole story at normal speed before full-detail film production.

## Blender to Unreal

- Confirm a known dimension, coordinate axes, units, normals, UVs, material slots, pivots, skeletal or object hierarchy, constraints, animation evaluation, and texture dependencies in Blender.
- Export one representative moving component and import it into Unreal. Compare dimensions, stowed/deployed silhouettes, intermediate poses, pivot behavior, and appearance before bulk export.
- Recreate unsupported procedural shaders, drivers, geometry nodes, simulations, and compositing deliberately. A successful file import is not visual parity.
- Keep editable sources and export settings. Record deliberate simplifications and separately preserve any engineering source.

## Camera, look, and motion

- Set camera sensor/filmback, focal length, focus, aperture, framing, crop, and output resolution deliberately. A named film preset is an artistic starting point, not proof of physical camera emulation.
- Frame each requested aspect ratio on its actual output gate. Inspect the entire swept action, shutter subframes, occlusion, caption areas, and cut transitions. A detail shot may frame only the agreed detail.
- Test source-driven flares, bloom, translucency, reflective metal, thin geometry, volumetrics, emissive surfaces, exposure, depth of field, and motion blur in moving clips. An attractive still does not establish temporal quality.
- Evaluate Lumen, Nanite, shadows, texture residency, and antialiasing against the installed engine and actual hardware. Use conventional alternatives where they better preserve motion or detail. Document internal screen percentage separately from output pixels.

## Prove the recipe

Before a long queue, render a representative continuous clip at final dimensions, frame rate, color path, and intended effects. Include a difficult action and the first frame after a cut or warm-up. Compare raw frames, finished frames, and encoded output at the same timestamps when a defect appears. Inspect at normal playback speed, not just as isolated frames.

Bind the effective shot recipe to source version, camera, animation, materials, lighting, effects, engine/platform, output dimensions, temporal samples, warm-up, shutter, color transform, and encoder. Record runtime overrides. A later setting change requires a coherent affected-shot result; preserve valid unaffected work.

Queue jobs with exact ranges and receipts so recovery can identify completed frames. Keep one owner per mutable scene and active renderer. Measure rendering, saving, finishing, encoding, and transfer together; a fast frame alone does not predict the total schedule.
