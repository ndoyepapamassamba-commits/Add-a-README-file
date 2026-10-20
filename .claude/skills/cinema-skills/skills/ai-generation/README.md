# 🤖 07 · AI generation

Image and video models with one consistent style and the same characters in
every shot — driven by the style bible and the shot list, not by adjectives.

## Planned skills

- [ ] `gen-style-lock` — turns the style bible into short reusable prompt blocks (look, palette, lens, lighting, texture, negatives) per model
- [ ] `gen-character-sheet` — consistent characters: reference sheets (front/profile/¾, expressions, wardrobe), fixed descriptors, reference-image / LoRA strategies
- [ ] `gen-keyframes` — shot list → keyframe prompts for text-to-image, seed and reference policy, variant selection
- [ ] `gen-image-to-video` — keyframe → clip prompts with motion vocabulary, per-model syntax and duration limits
- [ ] `gen-model-matrix` — which model for which shot type, cost/length/resolution limits, fallbacks
- [ ] `gen-continuity-check` — detects drift in faces, wardrobe, props, lighting and screen direction across generated shots
- [ ] `gen-upscale-interpolate` — upscaling, frame interpolation, deflicker, fixing common artifacts

## Inputs → outputs

`style-bible.md` §9 and §14 + `shots.csv` → `prompts/`, `refs/`, generated clips in `sources/` with IDs matching the shot list.

Respect model terms of service and people's likeness rights; do not generate real people without consent.
