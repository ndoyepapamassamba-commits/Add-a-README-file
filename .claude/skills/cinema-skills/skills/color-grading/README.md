# 🎨 05 · Color grading

One look across every shot — whether it came from a camera or a video model.

## Planned skills

- [ ] `grade-color-management` — log vs. Rec.709 vs. wide-gamut/ACES, input transforms, working space, output transforms; how to treat AI-generated clips
- [ ] `grade-primary-correction` — exposure, white balance, contrast, saturation; reading waveform/vectorscope/histogram (ffmpeg scopes)
- [ ] `grade-look-builder` — builds the show look from the style bible and bakes it to a `.cube` LUT (ffmpeg `lut3d`, OCIO)
- [ ] `grade-shot-matching` — matches shots and scenes to a hero frame; removes colour drift between generated clips
- [ ] `grade-davinci-resolve` — node-tree recipes, PowerGrades and Resolve scripting API automation
- [ ] `grade-film-emulation` — grain, halation, bloom, gate weave, print-like tone curves — tasteful, per style bible
- [ ] `grade-qc` — legal levels, clipping, banding, skin-tone line, consistency report per scene

## Inputs → outputs

reference cut + `style-bible.md` §4 → `grade/looks/*.cube`, graded renders, grade notes per scene.
