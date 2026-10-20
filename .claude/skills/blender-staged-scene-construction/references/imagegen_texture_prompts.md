# Imagegen prompt formula for material/environment textures

The recurring failure: ask an image model for "a cliff" and you get a painting
of a cliff — perspective, shadows, sky, composition. Useless on geometry.
The working prompts all share one skeleton:

1. **Declare the artifact type up front:** "seamless tileable photorealistic PBR base-color texture", "square texture atlas containing one continuous surface only", "panoramic 2:1 equirectangular sky dome".
2. **Force the camera:** "flat orthographic close-up surface scan", "no perspective".
3. **Kill lighting direction:** "even neutral diffuse lighting with no directional cast shadows, no specular highlights".
4. **Ban contaminants explicitly:** "no sky, no landscape, no objects, no text, no borders", "no plants growing out, no windows, no doors".
5. **Specify scale and structure** so it tiles at the right density: "irregular fractured slabs 30 cm to 1 m across; diagonal and vertical cracks, NOT regular masonry", "stone blocks about 40-70 cm wide and 20-35 cm high".
6. **Name the intended use, negatively:** "This is a seamless material texture for box projection onto a modeled cliff, **not a finished landscape illustration**."
7. **Record provenance and limits afterward:** in the README state these are *authored LDR appearance assets, not calibrated scans or a measured HDR environment*; bump is derived from color; applied with blended box projection.

## Worked example — rock base color

> A seamless tileable photorealistic PBR base-color texture of weathered grey-brown schist cliff bedrock, square texture atlas containing one continuous surface only. Flat orthographic close-up surface scan. Deep angular fractured geological plates, pale mineral quartz veins, fine craggy chips and cracks, subtle dark green lichen in sheltered seams, desaturated cool grey brown stone. Irregular fractured slabs 30cm to 1m across; diagonal and vertical cracks, NOT regular masonry and NOT horizontal wavy stripes. Even neutral diffuse lighting with no directional cast shadows, no perspective, no sky, no landscape, no objects, no text, no borders. Extremely sharp detailed realistic mineral grain. This is a seamless material texture for box projection onto a modeled castle cliff, not a finished landscape illustration.

## Worked example — weathered masonry

> A single seamless photographic base-color material texture of heavily weathered medieval limestone ashlar masonry, square orthographic surface scan. Small uneven rectangular stone courses, each individual stone irregularly chipped and worn, narrow eroded lime mortar, varied subtle warm grey, beige-grey and charcoal-grey mineral colors. Centuries-old vertical damp stains, scattered pale crusty lichen, damp dark crevices. Sophisticated organic non-repeating weathering; NO pristine regular modern brick grid. Stone blocks about 40-70 cm wide and 20-35 cm high. Fine rough pitted grain, extremely high photographic detail. Even neutral overcast diffuse illumination, no perspective, no directional cast shadows, no specular highlights. Edge-to-edge continuous stone wall texture only, no plants growing out, no windows, no doors, no text, no borders. Intended for physically based Blender material, not an illustration.

## Worked example — sky dome

> A photorealistic overcast storm sky environment texture, panoramic 2:1 equirectangular sky dome. Sky only, absolutely no ground, horizon objects, buildings, mountains or trees. Dense broad layered grey stratocumulus and dramatic soft rolling storm clouds, physically realistic large cloud masses and fine vapor edges, subtle pale bright opening high on the left as daylight source. Low near-horizon clouds lighter and hazier; overhead clouds darker blue-grey. Natural daylight, desaturated slate grey, atmospheric and cinematic but photographic, not fantasy, not painterly. Seamless left/right panorama, no visible sun disk, no text or borders. Avoid uniformly mottled noise; clouds must have large coherent sweeping layered shapes.

Note in the README: an LDR authored environment texture is not a calibrated
HDR light probe — separate scene lights and volume provide the actual lighting.
