# One-shot agent prompt for a voxel diorama (battle-tested)

This prompt produced a complete, inspected, fixed, and delivered diorama in a
single autonomous run. The load-bearing clauses are the isolation, the object
budget, the determinism requirement, the version-awareness clause, and
success criteria that include LOOKING at the render.

```text
Build and render a polished <setting> voxel diorama in Blender on my
dedicated workstation. Complete the actual scene, render it, inspect the
image, and fix visible issues. Deliver the runnable Python source, editable
.blend, and final PNG. Make routine artistic decisions yourself and continue
until the result is verified.

Run all Blender processing in a task-unique directory with a separate
headless Blender process; do not interact with other sessions, projects, or
running GUI scenes. Discover the installed Blender executable and version
first. No external assets, paid services, or add-ons are needed.

Art direction: a handcrafted isometric voxel diorama with a roughly 64×64
ground plate. <Palette sentence: warm sandstone, terracotta, ochre and
saffron, muted green foliage, turquoise water, selective lapis details.>
Use small deliberate shade variations, warm directional light, soft shadows,
and a quiet background. Keep silhouettes crisp and the composition readable
at thumbnail size.

Include <the dominant structure>; <a separate water feature>; <market/life
elements>; <trees>; <creatures/vehicles>; <people>; <a river/edge condition>;
<housing and a perimeter>. <If mixing periods: describe it as an artistic
inspired-by scene, not an archaeological reconstruction.>

Construct the scene from integer-grid unit cubes. Use shared geometry or
batch visible voxel faces by material to keep the Blender object count below
8,000. A neutral presentation backdrop may be a plane. Write one
self-contained deterministic bpy script with clear component functions and
configurable output directory. It must run with `blender -b -P script.py`.
Use the installed Blender version's supported rendering settings, not
obsolete ambient-occlusion properties. Prefer EEVEE at 1024×1024; if another
renderer materially improves the result and works headlessly, explain the
change.

Success criteria: the script exits successfully, the .blend reopens, the PNG
exists, and visual inspection confirms no cropping, missing materials,
unintended floating pieces, obstructed focal features, or illegible
lighting. Show the final render and link the script and scene. Do not stop
after merely writing code or creating files.
```

Why each clause earns its place:

- "Discover the installed Blender executable and version first" — scripts
  written against a remembered API die on properties the installed version
  removed.
- "batch … to keep the object count below 8,000" — without an explicit
  budget the agent happily makes 20k objects and freezes the scene.
- "deterministic" — you cannot review or diff a scene that rerolls itself.
- "visual inspection confirms …" + "Do not stop after merely writing code" —
  the difference between a delivered diorama and an unrun script.
