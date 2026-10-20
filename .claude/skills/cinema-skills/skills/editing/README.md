# ✂️ 04 · Editing

From a folder of shots to a timeline with rhythm — done with ffmpeg and open
timeline formats so it works with or without an NLE.

## Planned skills

- [ ] `edit-assembly` — builds an assembly from `shots.csv` + `sources/` (selects, order, handles) and renders a reference cut
- [ ] `edit-rhythm` — pacing and cut points: emotion first, J/L cuts, match cuts, holding vs. cutting, scene transitions
- [ ] `edit-ffmpeg-recipes` — trims, concat, frame-rate conform, speed ramps, crossfades, reframing 16:9 ↔ 9:16, proxies
- [ ] `edit-subtitles` — SRT/ASS from the script or a transcript, timing, line length rules, burn-in styles, RU/EN versions
- [ ] `edit-timeline-exchange` — export/import OpenTimelineIO, EDL, FCPXML for DaVinci Resolve / Premiere / Final Cut
- [ ] `edit-review` — cut review: clarity, pacing, continuity errors, jump-cut accidents, audio pops

## Inputs → outputs

`shots.csv` + `sources/` → `edit/epNN_vNNN.otio` (or EDL/FCPXML), reference renders, subtitles.
