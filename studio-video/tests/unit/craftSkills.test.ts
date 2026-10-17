import { describe, expect, it } from 'vitest';
import {
  CRAFT,
  beatsFor,
  characterAnchor,
  craftStoryRules,
  directorBeats,
  pageCaptions,
  shapeVideoPrompt,
  shotPlan,
  styleBible,
  visualTheme,
} from '../../coeur/studio/craftSkills';
import { lockedVideoPrompt } from '../../coeur/studio/continuity';
import { timeSubtitles } from '../../coeur/studio/subtitles';
import type { CharacterSheet, Scene, StyleDNA } from '../../coeur/studio/types';

const scene = (over: Partial<Scene> = {}): Scene =>
  ({
    scene_id: 'S01',
    act: '1',
    beat: 'hook',
    duration: 12,
    location: 'Maquis',
    time: 'soir',
    characters: ['KOFFI', 'ADJO'],
    action: 'KOFFI renverse la sauce sur ADJO, puis ADJO hurle, ensuite KOFFI fuit vers la porte',
    dialogue: [{ speaker: 'ADJO', text: 'Mais tu es fou ou quoi, Koffi, regarde ma robe neuve de ce soir !', emotion: 'shock', pauseAfterMs: 200 }],
    emotion: 'panique',
    camera: 'gros plan',
    lighting: 'néons',
    sound: 'brouhaha',
    music: 'coupé-décalé',
    transition: 'cut',
    visual_prompt: '',
    video_prompt: 'Gros plan sur KOFFI qui renverse la sauce, travelling avant puis panoramique, 8 secondes, 9:16, style Veo 3',
    voice_prompt: '',
    subtitle_prompt: '',
    status: 'DRAFT',
    ...over,
  }) as Scene;
const style = { color: 'warm ochre and teal', lighting: 'soft evening neons', lens: '35 mm', texture: 'clean 3D', camera: 'steady, gentle push-ins', contrast: 'medium', postProcessing: 'warm grade', negative: 'no text' } as StyleDNA;

describe('craft skills — video-prompting', () => {
  it('translates the framing vocabulary, keeps ONE camera move, strips model / duration / format from the prompt', () => {
    const r = shapeVideoPrompt('Gros plan sur KOFFI, travelling avant puis panoramique, 8 secondes, 9:16, style Veo 3', { seconds: 8 });
    expect(r.text).toContain('close-up');
    expect(r.text).toContain('slow dolly in');
    expect(r.text).not.toMatch(/slow pan/);
    expect(r.text).not.toMatch(/8 secondes|9:16|Veo/);
    expect(r.notes.join(' ')).toMatch(/nom de modèle/);
    expect(r.notes.join(' ')).toMatch(/un seul mouvement/);
  });
  it('sizes the action beats to the clip length and adds a default framing when none is named', () => {
    expect(beatsFor(5)).toBe(2);
    expect(beatsFor(15)).toBe(5);
    const r = shapeVideoPrompt('il entre, puis il s’assoit, puis il boit, puis il tombe', { seconds: 5 });
    expect(r.beats).toBe(2);
    expect(r.notes.join(' ')).toMatch(/4 temps/);
    expect(r.text).toMatch(/Medium shot, steady camera/);
  });
});

describe('craft skills — character-design, storyboard, director, cinema', () => {
  it('builds an immutable identity anchor from the sheet', () => {
    const a = characterAnchor({ name: 'Koffi', age: '30 ans', face: 'round face', skin: 'dark brown skin', hair: 'short black hair', body: 'stocky', clothing: 'blue shirt', accessories: 'red cap' } as Partial<CharacterSheet> & { name: string }, 'Afrikatoon 3D');
    expect(a.startsWith('KOFFI: 30 ans;')).toBe(true);
    expect(a).toContain('blue shirt + red cap');
    expect(a).toContain('Afrikatoon 3D');
    expect(a.length).toBeLessThanOrEqual(270);
  });
  it('plans ~5 s shots with a size, one move and a purpose, and one visual theme', () => {
    const shots = shotPlan(scene({ duration: 12, beat: 'hook' }));
    expect(shots).toHaveLength(3);
    expect(shots[0]).toMatchObject({ n: 1, start: 0, end: 4, size: 'CU', purpose: 'Hook' });
    expect(shots[2]!.end).toBe(12);
    expect(new Set(shots.map((s) => s.move)).size).toBe(3);
    expect(visualTheme(style)).toContain('palette: warm ochre and teal');
  });
  it('enforces the director invariants: ≤ 15 s per clip, 2–5 beats, explicit opening and final state', () => {
    const p = directorBeats(scene({ duration: 22 }));
    expect(p.clips).toBe(2);
    expect(p.beats).toHaveLength(3);
    expect(p.opening).toMatch(/renverse/);
    expect(p.final).toMatch(/fuit/);
    expect(p.warnings[0]).toMatch(/22 s > 15 s/);
    const one = directorBeats(scene({ duration: 6, action: 'KOFFI dort.' }));
    expect(one.beats).toHaveLength(2);
    expect(one.beats[1]).toMatch(/ADJO réagit/);
  });
  it('writes the style bible from the Style DNA and the story rules of the enabled skills', () => {
    const b = styleBible({ title: 'Le maquis', style, aspect: '9:16', duration: 60 });
    expect(b).toMatch(/BIBLE DE STYLE — Le maquis/);
    expect(b).toContain('Palette : warm ochre and teal');
    expect(b).toContain('Jamais : no text');
    const rules = craftStoryRules(new Set([CRAFT.director, CRAFT.cinema]));
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatch(/15 s au plus/);
    expect(craftStoryRules(undefined)).toEqual([]);
  });
});

describe('craft skills — wired into the video prompt and the captions', () => {
  const cast = [{ name: 'KOFFI', age: '30 ans', clothing: 'blue shirt', accessories: 'red cap', skin: 'dark brown skin' } as Partial<CharacterSheet> & { name: string }];
  it('without craft skills the prompt is unchanged (same as before)', () => {
    const p = lockedVideoPrompt(scene(), cast);
    expect(p).toContain('Gros plan');
    expect(p).toContain('KOFFI (30 ans, blue shirt, red cap)');
  });
  it('with the skills: shaped motion, director beats, first-shot framing and the identity anchor', () => {
    const sc = scene();
    const plan = directorBeats(sc);
    const shots = shotPlan(sc);
    const p = lockedVideoPrompt({ ...sc, craft: { beats: plan.beats, shots } }, cast, { craft: new Set([CRAFT.prompt, CRAFT.character, CRAFT.director, CRAFT.storyboard]), style: 'Afrikatoon 3D' });
    expect(p.startsWith('KOFFI renverse la sauce sur ADJO, then ADJO hurle, finally KOFFI fuit vers la porte')).toBe(true);
    expect(p).toContain('close-up, locked-off camera');
    expect(p).not.toMatch(/Veo|9:16|8 secondes/);
    expect(p).toContain('KOFFI: 30 ans; dark brown skin; blue shirt + red cap; Afrikatoon 3D');
    expect(p).toContain('same face, skin tone, hair');
  });
  it('pages a long caption into ≤ 34-character pages timed on their words', () => {
    const lines = timeSubtitles([scene({ duration: 8 })]);
    expect(lines[0]!.text.length).toBeGreaterThan(34);
    const pages = pageCaptions(lines);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) expect(p.text.length).toBeLessThanOrEqual(34);
    expect(pages[0]!.start).toBeCloseTo(lines[0]!.start, 5);
    expect(pages[pages.length - 1]!.end).toBeCloseTo(lines[0]!.end, 5);
    expect(pages[0]!.emoji).toBe('😱');
    expect(pages[1]!.emoji).toBeUndefined();
    expect(pageCaptions([{ ...lines[0]!, text: 'Court.', words: lines[0]!.words.slice(0, 1) }])).toHaveLength(1);
  });
});
