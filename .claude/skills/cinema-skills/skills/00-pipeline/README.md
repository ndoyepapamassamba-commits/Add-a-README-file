# 🎬 00 · Pipeline

The conductor. These skills do not replace the craft skills — they decide which
one runs next, keep the project state in `project.md`, and stop for the user's
approval at every gate where money is spent or creative direction is fixed.

```text
brief → script → style bible → shot list → sources → edit → grade → sound/voice → export
```

## Planned skills

- [ ] `pipeline-orchestrator` — runs the whole chain for a film or an episode: detects the current stage from the project folder, calls the right skill, records decisions and next steps in `project.md`
- [ ] `pipeline-brief` — short interview → one-page creative brief (logline, audience, runtime, aspect ratio, tone words, references, constraints, generation budget)
- [ ] `pipeline-project-init` — creates the project workspace (see [templates/README.md](../../templates/README.md)) and copies the style bible, screenplay and shot-list templates
- [ ] `pipeline-style-bible` — turns the brief + references into a filled `style-bible.md`; the one document every other skill must obey
- [ ] `pipeline-review-gate` — stage-exit checklist (script locked? shots cover every scene? style drift? continuity?) before moving on
- [ ] `pipeline-export` — delivery: masters and platform versions (16:9 / 9:16), codecs, subtitles, loudness, thumbnails, file naming

## Hands off to

Every other discipline. Owns `project.md`, `brief.md`, `style-bible.md`.
