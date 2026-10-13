# Concept target prompt — structural template

Battle-tested shape for a persistent visual target. The field names are the
point: they force composition authority, palette, and an explicit Avoid list
before any generation happens. (Example values are from a real two-person
event-photo recreation; substitute your subject.)

```text
Use case: stylized-concept

Asset type: persistent visual target for a Blender scene recreation

Primary request: Transform the reference photo into a polished cinematic
Blender 3D render concept while preserving the same composition, poses,
relative heights, clothing silhouettes, facial expressions, and room setting.

Input images: Image 1 is the sole composition, pose, wardrobe, identity, and
lighting reference.

Scene/backdrop: <architectural shell, fixed props, light sources, background
extras — name every element the camera will check later>.

Subject: <who/what, full wardrobe and pose description, relative heights in
percent, what each hand is doing>.

Style/medium: high-end stylized Blender 3D render, realistic proportions,
simplified but expressive likenesses, clean low-to-mid-poly forms, beveled
hard surfaces, physically plausible materials, not a flat illustration.

Composition/framing: vertical 3:4 portrait, eye-level slightly wide camera,
figures fill the frame head to shoes, left figure ~10 percent taller, bodies
nearly touching, <prop> clipped by left edge, <ceiling fixtures> visible.

Lighting/mood: vivid event lighting with saturated cobalt key and underlight,
hot magenta rim and ceiling glow, warm-white room fill, glossy floor
reflections, happy candid mood.

Color palette: electric blue, violet, magenta, charcoal black, white, subtle
warm skin tones under colored light.

Text (verbatim): "03"

Constraints: preserve the two-person layout and the suit-versus-jersey
wardrobe contrast; keep faces unobstructed and both smiles visible; keep all
anatomy plausible; no extra foreground people; no watermark.

Avoid: photoreal camera noise, distorted hands, extra fingers, fused bodies,
misplaced glass, illegible number, fantasy setting, generic studio backdrop.
```

Notes:

- "Input images: Image 1 is the sole … reference" establishes an authority
  split when multiple images are in play — later drift almost always traces
  back to an unstated authority.
- The **Avoid:** list is where you spend your scar tissue: every item in it
  was observed in a real failed generation.
- Save the exact final prompt next to the chosen image. "The prompt that
  worked" is an asset; regenerate-from-memory is not reproducible.
