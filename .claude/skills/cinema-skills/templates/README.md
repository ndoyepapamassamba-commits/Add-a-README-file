# Templates

Starting points for skills and for the production documents the skills read and write.

| File | What it is | Used by |
|---|---|---|
| [`skill-template/`](skill-template/) | A correct Claude Agent Skill: `SKILL.md` with YAML frontmatter and the standard sections, plus optional `references/` and `scripts/` folders explained | everyone adding a skill |
| [`style-bible.md`](style-bible.md) | Look, palette, grade/LUT notes, lenses, framing rules, lighting, character locks, sound palette, voice, AI prompt blocks | every skill — the style source of truth |
| [`screenplay.fountain`](screenplay.fountain) | Plain-text screenplay in [Fountain](https://fountain.io) format with a syntax cheat sheet | screenwriting, directing, sound-and-voice |
| [`shot-list.csv`](shot-list.csv) | Machine-readable shot list (one row per shot, stable IDs) | directing, cinematography, ai-generation, editing, color-grading |
| [`shot-list.md`](shot-list.md) | Human-readable scene/shot sheet + legend of shot sizes, angles, moves, statuses | review, directing |
| [`series-bible.md`](series-bible.md) | Series premise, world rules, characters, season arc, episode format, continuity log, production tracker | series-production |

## Project workspace layout

The pipeline skills expect (and `pipeline-project-init` will create) a project folder like this:

```text
my-film/
├── project.md            # status, decisions, what's next (pipeline memory)
├── brief.md              # one-page creative brief
├── style-bible.md        # from templates/style-bible.md
├── series-bible.md       # only for series
├── script/
│   └── ep01.fountain
├── shots/
│   └── ep01_shots.csv    # from templates/shot-list.csv
├── refs/                 # character / location reference images (CH01_front.png …)
├── prompts/              # keyframe and video prompts per scene
├── sources/              # camera footage, generated clips, stock (never edited in place)
├── audio/
│   ├── vo/               # voice-over lines VO01_L001.wav …
│   ├── sfx/
│   └── music/
├── edit/                 # timelines (OTIO/EDL/FCPXML), assemblies, subtitles
├── grade/                # LUTs (.cube), stills, grade notes
└── exports/              # masters and platform deliverables
```

## Naming

- Shots: `EP01_SC03_SH07` · takes/generations `_T01` / `_G01` · versions `_v001`
- Characters `CH01`, locations `LOC01`, voices `VO01`, voice lines `VO01_L001`, continuity facts `CT001`
