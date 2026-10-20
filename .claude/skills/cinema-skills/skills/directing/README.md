# 🎥 02 · Directing

Turns a script into scenes that play: intentions, staging, coverage and a shot
list that every downstream skill can execute.

## Planned skills

- [ ] `direct-scene-breakdown` — per scene: story purpose, emotional beat, character objectives, key moment, what the audience must notice
- [ ] `direct-shot-list` — scene → `shots.csv` (sizes, angles, lenses, moves, durations) with a coverage strategy and stable IDs
- [ ] `direct-blocking` — staging and geography: the 180° line, screen direction, eyelines, entrances/exits, motivated movement
- [ ] `direct-storyboard` — shot list → storyboard frame descriptions / sketch prompts with timing and dialogue per panel
- [ ] `direct-performance` — performance notes for actors, AI characters and voice-over (actions and intentions, not result words)
- [ ] `direct-lookbook` — reference board and tone document that feeds the style bible

## Inputs → outputs

`script/epNN.fountain` + `style-bible.md` → `shots/epNN_shots.csv`, storyboard notes, performance notes.
