# Geometry, surfaces and cinematic light

## Structural detail

Build a coherent object before adding surface density. In architectural interiors, separate the continuous structural envelope from decorative panels. Inspect connections between different-radius volumes, window throats, hatch collars, ceilings, floors and terminal walls. Intentional panel joints should reveal believable backing, not unintended vacuum or an empty scene.

Use detail according to construction: fasteners on mounting flanges, hinges with plausible pivots, conduits with support and endpoints, recessed equipment with enough clearance to operate. Avoid obstructing an optical instrument with its rack frame or placing an inward-facing fitting behind a bulkhead. Choose detail scale for the closest intended viewing distance.

Use bevels to catch light, not to erase proportions. Share repeated geometry while varying layouts where references warrant variation. Review backsides and elevated viewpoints as well as the main camera. If Booleans are used, inspect the result for degeneracy, internal caps and missing faces; successful modifier execution is not geometry verification.

## Material response

Use layered node materials with appropriate base reflectance, roughness and normal variation. Distinguish painted metal, bare metal, stone, fabric, rubber and glazing. Assign physical depth to features that require it; reserve normal/bump detail for smaller relief.

Place wear where contact, runoff, exposure or maintenance would cause it. Vary seams, fabric weave, machining direction and paint finish at plausible scales. Avoid heavy universal noise that makes every surface look like the same damaged material.

Inspect transmission in the actual preview engine as well as the final renderer. A glass material can be technically assigned yet appear opaque under the chosen settings. Any cheaper preview approximation should remain visually coherent and be documented.

## Lighting and atmosphere

Use motivated sources: windows, practical fixtures, sky/environment light and plausible reflected fill. Establish readable value separation, contact shadows and a deliberate warm/cool relationship. Strong cinematic grading is welcome when requested; preserve material identity and avoid clipped highlights or unreadable interiors.

Keep atmosphere local to where a medium exists. Do not fill outer-space vacuum with fog to manufacture beams. Use volumetrics selectively and compare their benefit against noise and render cost. Bloom should support bright sources rather than conceal poor detail.

Review matched camera angles under consistent exposure when comparing iterations. An attractive final still and an interactive preview are different deliverables: inspect both if both are requested.
