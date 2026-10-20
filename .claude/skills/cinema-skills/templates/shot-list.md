# Shot List — `<Project>` · Episode `01` · Scene `01`

> Human-readable companion to `shot-list.csv`. The CSV is what scripts and skills
> read; this page is for reviewing a scene at a glance. Keep both in sync (the
> CSV wins if they disagree).

## Scene header

| Field | Value |
|---|---|
| Scene | `EP01_SC01` — EXT. ROOFTOP — NIGHT |
| Script pages | 1–2 (Fountain: `script/ep01.fountain`) |
| Story purpose | Introduce Mira alone above the city; plant the missing car |
| Emotional beat | stillness → decision |
| Characters | `CH01` Mira |
| Look | `night_teal` (style bible §4.3) |
| Coverage strategy | wide master, one clean single, one POV insert; 180° line on the roof edge |
| Estimated screen time | 12 s |

## Shots

| Shot | Size | Angle | Lens | Move | Dur | Action / content | Sound / VO | Status |
|---|---|---|---|---|---|---|---|---|
| `SH01` | EWS | eye level | 24 mm | static | 5 s | Mira enters frame left, stops at the edge | rain bed · `VO01_L001` | planned |
| `SH02` | CU | slight low | 85 mm | slow push-in | 4 s | She looks down; city lights in her eyes | rain closer, low heartbeat | planned |
| `SH03` | WS | high (POV) | 35 mm | static | 3 s | Empty street, one car passes L→R | car pass-by | planned |

## Continuity notes

- Hood up, left hand in pocket, wet strand of hair on the forehead from `SH02` on.
- Car in `SH03` moves left → right (matches Mira's screen direction).

## Generation / capture notes

- Keyframes: `KF_EP01_SC01_SH01…03` (prompts in `prompts/ep01_sc01.md`), character refs `CH01_front`.
- Image-to-video: max clip length per model — see style bible §14.

---

## Legend

**Shot sizes** — `EWS` extreme wide · `WS` wide · `MWS` medium wide (knees up) ·
`MS` medium (waist up) · `MCU` medium close-up (chest up) · `CU` close-up (face) ·
`ECU` extreme close-up (detail) · `INS` insert · `OTS` over-the-shoulder · `POV` point of view · `2S` two-shot

**Angles** — eye level · low · high · bird's-eye (top-down) · worm's-eye · Dutch (canted)

**Moves** — static · pan · tilt · push-in / pull-out (dolly) · truck (lateral) ·
pedestal (vertical) · crane / jib · handheld · Steadicam / gimbal · zoom · orbit

**Status** — `planned` → `prompted` / `scheduled` → `generated` / `shot` →
`selected` → `in edit` → `graded` → `final`

**IDs** — `EP01_SC01_SH01`; takes / generations append `_T01` or `_G01`;
versions of any file append `_v001`.
