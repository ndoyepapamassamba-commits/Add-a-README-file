# Style Bible — `<Project title>`

> The single source of truth for how this project looks, moves and sounds.
> Every skill in the pipeline reads this file before it writes a shot, a prompt,
> a grade or a line of voice-over. Change it deliberately and log the change at
> the bottom. Fill in what you know, leave `TBD` where you do not.

## 1. Project

| Field | Value |
|---|---|
| Title / working title | |
| Format | short film · mini-series (N × M min) · vertical series · music video · ad |
| Delivery aspect ratio | 2.39:1 · 1.85:1 · 16:9 · 9:16 · 4:5 |
| Resolution / frame rate | 3840×2160 @ 24 fps |
| Runtime target | |
| Languages | EN · RU · subtitles |
| Platforms | YouTube · Reels/Shorts · festival · private |

## 2. Story & tone in one screen

- **Logline:**
- **Theme / controlling idea:**
- **Three tone words:** e.g. *lonely, humid, tender*
- **This, not that:** e.g. *quiet dread, not jump scares* · *warm nostalgia, not sepia kitsch*
- **Audience feeling at the end:**

## 3. References

Name the works; do not paste frames you do not have rights to into the repo.
Keep a private moodboard folder if needed.

| Reference (title, year, author/director) | What to take from it | What NOT to take |
|---|---|---|
| | palette of night exteriors | the handheld shake |
| | | |

## 4. Look

### 4.1 Palette

| Role | Hex | Where it appears |
|---|---|---|
| Key / dominant | `#` | walls, sky, wardrobe of lead |
| Shadows | `#` | never pure black? lifted into teal? |
| Highlights | `#` | practicals, skin highlights |
| Accent (rare) | `#` | only for the story object / danger |
| Skin reference | `#` | keep on the skin-tone line |

Colour rules (examples): *accent red appears only near the antagonist* ·
*day scenes warm, memory scenes desaturated* · *no saturated green anywhere*.

### 4.2 Contrast, exposure, texture

- Contrast: low / medium / high · black level: crushed / lifted to ~`N` IRE
- Exposure philosophy: e.g. *protect highlights, let faces fall half a stop under at night*
- Saturation: overall · per scene
- Texture: grain (size/amount) · halation · diffusion · sharpening · gate weave: yes/no

### 4.3 Grade & LUT notes

| Item | Value |
|---|---|
| Working colour space | Rec.709 Gamma 2.4 · DaVinci Wide Gamut/Intermediate · ACEScct |
| Input transform | camera log → working space (which LUT/CST) · AI clips: treat as Rec.709 |
| Show LUT / look | `looks/show_v001.cube` (creative look, applied after balance) |
| Node / filter order | balance → match → look → local fixes → texture → output transform |
| Skin tones | keep hue on the skin line, saturation cap `N` |
| Legal range / QC | full vs. video levels, no clipped highlights on faces |

Per-scene looks:

| Scene / sequence | Time of day | Look name | Notes (lift/gamma/gain, temp/tint, saturation) |
|---|---|---|---|
| SC01–03 | night, rain | `night_teal` | cool shadows, warm practicals |
| | | | |

## 5. Camera & lenses

- Sensor / format feel: Super 35 · full frame · 16 mm · anamorphic (oval bokeh, flares)
- Lens set (focal lengths allowed): e.g. 24 / 35 / 50 / 85 mm; forbidden: ultra-wide on faces
- Depth of field policy: deep for isolation of the world, shallow for inner states
- Camera movement rules: static by default; moves only when motivated (character, reveal)
- Support: tripod · dolly · handheld (when?) · drone (never?)

## 6. Framing rules

| Story beat | Shot size | Angle | Composition rule |
|---|---|---|---|
| Establishing | EWS / WS | eye level | horizon on lower third |
| Dialogue | MCU ↔ CU | slight low for power | clean singles, 180° line held |
| Revelation | ECU | | hold 2+ seconds |

- Headroom / lead room, symmetry vs. asymmetry, negative space
- Screen direction rules (e.g. *hero always moves left → right until the midpoint*)
- Recurring motifs in frame (doorframes, reflections, windows)

## 7. Lighting

- Key style: soft/hard, source direction, motivated by what
- Contrast ratios: day `2:1`, night `8:1` (example)
- Practicals and colour temperatures: tungsten 3200 K, sodium street light, monitor glow
- Time-of-day palette: dawn / noon / golden hour / blue hour / night

## 8. Production design & wardrobe

| Character / location | Palette | Materials / textures | Signature props |
|---|---|---|---|
| | | | |

## 9. Character locks (for AI consistency)

Fixed descriptors that must be pasted into every prompt for this character, plus
reference image IDs. Change only with a log entry.

| ID | Name | Fixed description (age, face, hair, build, wardrobe) | Reference images | Voice ID |
|---|---|---|---|---|
| `CH01` | | | `refs/CH01_front.png`, `refs/CH01_profile.png` | `VO01` |

## 10. Motion & editing rhythm

- Average shot length: e.g. 3–5 s; long takes allowed in … scenes
- Cutting style: invisible continuity · jump cuts · match cuts · montage
- Transitions allowed: cut · dissolve (time passage only) · smash cut · none else
- Speed changes: never / slow-motion only for …

## 11. Titles & typography

- Typeface(s) and weights, case, tracking
- Title card style, lower thirds, subtitle style (font, size, outline, position)
- Safe areas for 16:9 and 9:16 versions

## 12. Sound palette

- Ambience beds per location (room tone, city, rain, wind)
- SFX style: naturalistic · hyper-real · stylised
- Music: genre, instrumentation, tempo range, where music is forbidden
- Silence rules: where the film goes quiet and why
- Loudness targets: e.g. −14 LUFS integrated for web, −23 LUFS for broadcast, true peak ≤ −1 dBTP

## 13. Voice

| Voice ID | Role (narrator / character) | Gender · age · timbre | Pace (wpm) · energy | Accent / language | Engine & voice (TTS provider, model, voice name/ID, settings) |
|---|---|---|---|---|---|
| `VO01` | narrator | | ~140 wpm, restrained | EN (US) / RU | |

- Pronunciation dictionary: names, places, invented words
- Delivery notes: intimacy, mic distance feel, breaths kept/removed
- Consent: only use voices you have the rights to (your own, licensed, or synthetic)

## 14. AI generation prompt blocks

Reusable text blocks pasted into image/video prompts so that every shot shares
one look. Keep them short and concrete.

```text
STYLE BLOCK:   <film look, palette, lens, lighting, texture — 1–3 lines>
CAMERA BLOCK:  <default lens, height, movement vocabulary>
NEGATIVE:      <what must never appear>
```

| Shot type | Model | Resolution / duration limit | Seed policy | Notes |
|---|---|---|---|---|
| keyframes | | | fixed per character | |
| image-to-video | | | | |

## 15. Do / Don't

| Do | Don't |
|---|---|
| | |

## 16. Change log

| Date | Change | Why | Affects |
|---|---|---|---|
| YYYY-MM-DD | created | | all |
