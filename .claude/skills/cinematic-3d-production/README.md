# Cinematic 3D Production

An agent skill for taking a cinematic 3D still or animation from brief to verified delivery. It interviews the user for missing creative and technical decisions, authors editable assets in Blender, renders final 3D imagery in Unreal Engine, and checks the finished media.

The skill is a production guide. It does not include Blender, Unreal Engine, paid assets, credentials, or a render farm. It scales from one still to a multi-shot film and keeps project-specific formats, providers, budgets, and approvals in the user's brief.

## Start here

1. Paste the [setup prompt](SETUP_PROMPT.md) into a coding agent that can inspect and install software on your machine. It will install or link this skill, check existing tools and hardware, help set up missing components, and report what is actually ready.
2. Ask the agent: `Use $cinematic-3d-production to help me create a cinematic 3D render.` It will ask a short project interview and prepare a brief before production.

If you prefer manual installation, clone this repository as the skill directory:

```bash
mkdir -p ~/.agents/skills
git clone https://github.com/Kian-hdr/cinematic-3d-production.git ~/.agents/skills/cinematic-3d-production
```

For Claude Code, clone into `~/.claude/skills/cinematic-3d-production` instead. A project-level installation can use `.agents/skills/` for Codex or `.claude/skills/` for Claude Code. Preserve an existing skill directory with the same name before installing; do not overwrite it. Restart or refresh the agent if it does not discover a newly installed skill. The agent must have access to the actual files and the tools needed for the work. [Codex skills documentation](https://developers.openai.com/codex/skills) and [Claude Code skills documentation](https://code.claude.com/docs/en/skills) describe their current discovery rules.

## What it covers

- A brief and adaptive intake interview for stills, films, and multiple formats
- Concept boards and a timed animatic for story-driven films
- Blender source asset and animation preparation, with an actual Unreal import check
- Unreal camera, lighting, effects, motion, native-quality proof, and recoverable rendering
- Technical media checks, full visual/audio review, source retention, and delivery evidence
- Cost control through measured previews, locked shot recipes, and selective rerendering

The skill is intentionally separate from engineering validation and native simulator evidence. Cinematic effects and reconstructions must be labeled accurately when scientific or safety claims matter.

## Tools and accounts

Blender and Unreal Engine are required for the default production route. FFmpeg or an equivalent encoder/probe is useful for films. Image generation, speech, music, cloud compute, and paid plugins are optional and should be chosen for the actual brief. Check current [Blender system requirements](https://www.blender.org/download/requirements/) and [Unreal hardware requirements](https://dev.epicgames.com/documentation/unreal-engine/hardware-and-software-specifications-for-unreal-engine) before installing; an Epic account and license acceptance may be needed for an Unreal download. See [setup guidance](references/setup.md).

## Repository map

| File | Purpose |
| --- | --- |
| [SKILL.md](SKILL.md) | Agent entry point and production decisions |
| [SETUP_PROMPT.md](SETUP_PROMPT.md) | Copy-ready installation and readiness prompt |
| [references/intake.md](references/intake.md) | Interview and brief template |
| [references/setup.md](references/setup.md) | Tool, hardware, and smoke-check guidance |
| [references/production.md](references/production.md) | Asset transfer, look, motion, and render recipe |
| [references/quality-and-delivery.md](references/quality-and-delivery.md) | Export, QA, and handoff |
| [references/cost-efficient-production.md](references/cost-efficient-production.md) | Cost and revision discipline |

## Scope and prior art

This is an original, general-purpose adaptation of a production workflow. For specialized execution, [cc-blender-skill](https://github.com/RobLe3/cc-blender-skill) covers Blender automation and visual checks, while [unreal-engine-skills](https://github.com/quodsoler/unreal-engine-skills) has version-specific Unreal Sequencer guidance. They are optional complements, not bundled dependencies. Their tool assumptions and engine versions should be checked before use.

Contributions are welcome under [CONTRIBUTING.md](CONTRIBUTING.md). The repository text is [MIT licensed](LICENSE); Blender, Unreal Engine, FFmpeg, and third-party assets retain their own licenses and terms.
