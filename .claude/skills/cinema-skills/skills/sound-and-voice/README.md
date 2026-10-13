# 🎙️ 06 · Sound & voice

Voice-over, dialogue, sound design, music and the final mix.

## Planned skills

- [ ] `voice-casting` — voice design per character/narrator (timbre, age, pace, accent), engine and voice selection, pronunciation dictionary → style bible §13
- [ ] `voice-tts` — generates voice-over line by line from the script (`[[VO01_L001]]` IDs): cloud TTS or local models, retakes, consistent settings per voice
- [ ] `voice-dialogue-edit` — timing to picture, breaths, room tone, noise cleanup, lip-sync preparation
- [ ] `voice-dubbing` — translation + re-voicing RU ↔ EN with timing constraints
- [ ] `sound-design` — spotting session, ambience beds, SFX layers, silence as a tool
- [ ] `sound-music` — music brief and cue sheet, temp tracks, AI music generation (e.g. local ACE-Step via [AceDeck](https://github.com/DenisHumen/ace-step-deck)), licensing notes
- [ ] `sound-mix` — stems (dialogue/music/effects), ducking, EQ basics, loudness to platform targets (ffmpeg `loudnorm`, EBU R128)

## Inputs → outputs

`script/*.fountain` + `style-bible.md` §12–13 + picture cut → `audio/vo/`, `audio/sfx/`, `audio/music/`, mixed stems and master.

Only use voices you have the right to use: your own, licensed, or fully synthetic.
