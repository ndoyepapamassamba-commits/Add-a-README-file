import { describe, expect, it } from 'vitest';
import { dailyPicks, gdeltUrl, isStale, laughable, parseGdelt, parseWikiNews } from '../../server/jev/studio/news';
import { lockShortSetting, lockedVideoPrompt } from '../../server/jev/studio/continuity';
import { charLine } from '../../server/jev/studio/genome';
import { ideaText, IDEA_LIBRARY } from '../../server/jev/studio/ideas';
import type { CharacterSheet, Scene } from '../../server/jev/studio/types';

const sc = (id: string, location: string, extra: Partial<Scene> = {}) => ({ scene_id: id, location, characters: ['KOFFI', 'ADJO'], action: 'KOFFI aligne des dossiers', video_prompt: '', dialogue: [], ...extra }) as unknown as Scene;

describe('actualité gratuite', () => {
  it('GDELT: Ivorian French press, recent first, parsed with its date', () => {
    const u = gdeltUrl();
    expect(decodeURIComponent(u)).toContain('sourcecountry:IV sourcelang:french');
    expect(u).toContain('format=json');
    const h = parseGdelt({ articles: [{ title: 'Le prix de l’attiéké augmente encore à Adjamé', domain: 'abidjan.net', seendate: '20261011T081500Z' }, { title: 'court' }] });
    expect(h).toEqual([{ title: 'Le prix de l’attiéké augmente encore à Adjamé', source: 'abidjan.net', date: '2026-10-11' }]);
    expect(parseGdelt(null)).toEqual([]);
  });
  it('Wikipédia: only the dated briefs, never the « on this day » history', () => {
    const html = '<ul><li>7 octobre : <a href="#">Justina</a> devient présidente de la république du Kosovo.</li><li>1428 : début du siège d&#39;Orléans, opposant les Français aux Anglais.</li><li>1er octobre – les Éléphants gagnent leur match amical à Abidjan.</li></ul>';
    const h = parseWikiNews({ parse: { text: html } });
    expect(h.map((x) => x.date)).toEqual(['7 octobre', '1er octobre']);
    expect(h[0]!.title).toContain('Justina devient présidente');
  });
  it('tragedies and duplicates are dropped before the writer sees them', () => {
    const h = laughable([
      { title: 'Embouteillages monstres sur le pont HKB', source: 'a' },
      { title: 'Embouteillages monstres sur le pont HKB !', source: 'b' },
      { title: 'Un accident fait trois morts à Yopougon', source: 'c' },
    ]);
    expect(h.map((x) => x.source)).toEqual(['a']);
  });
  it('automatic refresh every 6 h; library ideas of the day are stable per day', () => {
    expect(isStale(undefined, 1)).toBe(true);
    expect(isStale(0, 5 * 3600_000)).toBe(false);
    expect(isStale(0, 7 * 3600_000)).toBe(true);
    const a = dailyPicks(IDEA_LIBRARY, '2026-10-12', 4);
    expect(a).toHaveLength(4);
    expect(new Set(a.map((i) => i.id)).size).toBe(4);
    expect(dailyPicks(IDEA_LIBRARY, '2026-10-12', 4)).toEqual(a);
    expect(dailyPicks(IDEA_LIBRARY, '2026-10-13', 4)).not.toEqual(a);
    expect(ideaText(IDEA_LIBRARY[0]!)).toMatch(/^Le canapé est occupé — .+ Chute : /);
  });
});

describe('continuité (défauts mesurés sur « Le chef invisible » v44)', () => {
  it('a short sketch keeps ONE set: the odd scene takes the dominant location', () => {
    const scenes = [sc('S01', 'Bureau open space'), sc('S02', 'bureau open-space'), sc('S03', 'Cour devant le bureau'), sc('S04', 'Bureau open space'), sc('S05', 'Bureau open space')];
    const r = lockShortSetting(scenes, 42);
    expect(r.location).toBe('Bureau open space');
    expect(r.changed).toEqual(['S03']);
    expect(r.scenes[2]!.location).toBe('Bureau open space');
    expect(r.scenes[1]!.location).toBe('bureau open-space');
  });
  it('a long film, or a story split evenly between two places, is left as written', () => {
    const scenes = [sc('S01', 'Bureau'), sc('S02', 'Cour')];
    expect(lockShortSetting([sc('S01', 'Bureau'), sc('S02', 'Marché'), sc('S03', 'Bureau')], 180).changed).toEqual([]);
    expect(lockShortSetting([...scenes, sc('S03', 'Bureau'), sc('S04', 'Cour')], 40).changed).toEqual([]);
  });
  it('image → video prompt locks the first frame and names the deformations to avoid', () => {
    const p = lockedVideoPrompt(sc('S04', 'Bureau', { video_prompt: 'KOFFI tamponne une feuille blanche avec énergie' }));
    expect(p.startsWith('KOFFI tamponne')).toBe(true);
    expect(p).toContain('(KOFFI, ADJO)');
    expect(p).toContain('same face, skin tone, hair, glasses, clothes and body proportions');
    expect(p).toMatch(/stretching arms.*extra arms/);
    expect(p.length).toBeLessThan(1500);
  });
  it('a character whose sheet says nothing of skin is drawn Ivorian (the v44 patron came out pale)', () => {
    const base = { name: 'PATRON', age: '55 ans', skin: '', ethnicity: '', hair: 'grey hair', clothing: 'navy suit', accessories: 'glasses' } as unknown as CharacterSheet;
    expect(charLine(base)).toContain('Black West-African (Ivorian)');
    expect(charLine({ ...base, skin: 'dark brown skin' })).not.toContain('Ivorian');
  });
});

import { ageLock } from '../../server/jev/studio/genome';
import { speakingOrder } from '../../server/jev/studio/continuity';
import { characterGender, speakerKey } from '../../server/jev/studio/motion';
import { parseClipJudgement } from '../../server/jev/studio/clipInspect';

describe('v49 — cohérence « La dot négociée »', () => {
  it('a suitor, a patron, a parent are ADULTS; a child stays a child', () => {
    expect(ageLock('32 ans', 'prétendant')).toContain('ADULT');
    expect(ageLock('', 'le prétendant')).toContain('never a child');
    expect(ageLock('8 ans', 'petit frère')).toContain('CHILD');
    expect(ageLock('15 ans')).toContain('TEENAGER');
    expect(ageLock('62 ans', 'grand-père')).toContain('OLDER ADULT');
  });
  it('the same speaker whatever the spelling; gender from the name when the sheet is silent', () => {
    expect(speakerKey('Frère (off)')).toBe('FRERE');
    expect(speakerKey('FRÈRE')).toBe(speakerKey('frere'));
    expect(characterGender({ name: 'KOUASSI' })).toBe('m');
    expect(characterGender({ name: 'FRÈRE' })).toBe('m');
    expect(characterGender({ name: 'AYA' })).toBe('f');
    expect(characterGender({ name: 'TOGO', gender: 'homme' })).toBe('m');
    expect(characterGender({ name: 'KOUASSI', role: 'le prétendant' })).toBe('m');
  });
  it('the video prompt says who talks, in order, and who listens with the mouth closed', () => {
    const o = speakingOrder({ characters: ['TOGO', 'KOUASSI'], dialogue: [{ speaker: 'TOGO', text: 'a' }, { speaker: 'KOUASSI', text: 'b' }] as never });
    expect(o).toMatch(/^First TOGO talks .* while KOUASSI listens with the mouth closed.*then KOUASSI talks .* while TOGO listens/);
    expect(o).toContain('Only one person talks at a time');
    expect(speakingOrder({ characters: ['TOGO'], dialogue: [] })).toContain('mouths stay closed');
  });
  it('the clip judge accepts « cohérence », nested scores and « 7/10 »', () => {
    const j = parseClipJudgement('{"scores":{"Rire":"7/10","mouvement":6,"expressions":"8","bouche":5,"anatomie":9,"cohérence":"7,5"},"defects":[],"fix":""}');
    expect(j!.scores.coherence).toBe(7.5);
    expect(j!.scores.rire).toBe(7);
  });
});
