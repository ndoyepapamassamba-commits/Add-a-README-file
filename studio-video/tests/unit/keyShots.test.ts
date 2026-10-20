import { describe, expect, it } from 'vitest';
import { chooseKeyShots, heuristicKeyShots, keyShotQuestions, pickFromAnswers } from '../../navigateur/studio/keyShots';
import type { Scene } from '../../coeur/studio/types';

const sc = (id: string, beat: string): Scene =>
  ({ scene_id: id, act: '1', beat, duration: 3, location: '', time: '', characters: [], action: `action ${id}`, dialogue: [{ text: `ligne ${id}` }], emotion: 'joie', camera: '', lighting: '', sound: '', music: '', transition: '', visual_prompt: '', video_prompt: '', voice_prompt: '' }) as unknown as Scene;
const scenes = [sc('S01', 'hook'), sc('S02', 'escalade'), sc('S03', 'chute'), sc('S04', 'twist'), sc('S05', 'fin')];

describe('key shots judged by JEV (heuristic fallback)', () => {
  it('one Noul per scene, over the same state', () => {
    const q = keyShotQuestions(scenes);
    expect(Object.keys(q)).toEqual(['key_0', 'key_1', 'key_2', 'key_3', 'key_4']);
    expect(q.key_2).toMatchObject({ type: 'noul' });
    expect((q.key_2 as { instructions: string }).instructions).toContain('S03');
  });
  it('picks the scenes rated ≥ 0.6 (best first, at most max), keeps a writer beat rated ≥ 0.4, in story order', () => {
    const r = pickFromAnswers(scenes, { key_0: { noul: 0.1 }, key_1: { noul: 0.95 }, key_2: { noul: 0.45 }, key_3: { noul: 0.2 }, key_4: { noul: 0.7 } }, 3);
    expect(r.scenes.map((s) => s.scene_id)).toEqual(['S02', 'S03', 'S05']); // S03 = chute at 0.45 kept, S04 twist at 0.2 dropped
    expect(r.scores.S02).toBe(0.95);
    expect(pickFromAnswers(scenes, { key_1: { noul: 0.9 }, key_4: { noul: 0.8 }, key_0: { noul: 0.7 } }, 2).scenes.map((s) => s.scene_id)).toEqual(['S02', 'S05']); // the two best, in story order
  });
  it('without a JEV key: the structure decides (chute + twist) and the note says so', async () => {
    const r = await chooseKeyShots(scenes, 'Test', 3, { key: '', cfg: { enabled: true } as never });
    expect(r.source).toBe('heuristique');
    expect(r.scenes.map((s) => s.scene_id)).toEqual(['S03', 'S04']);
    expect(r.note).toContain('JEV non configuré');
    expect(heuristicKeyShots(scenes).length).toBe(2);
  });
  it('JEV unreachable: the fallback is used, never an exception', async () => {
    const r = await chooseKeyShots(scenes, 'Test', 3, { key: 'k', cfg: { enabled: true, endpoint: 'https://relay.invalid/x', model: 'jev', timeoutMs: 500, budgetDaily: 1, provider: 'typesafe' } as never, fetchFn: () => Promise.reject(new Error('réseau')) });
    expect(r.source).toBe('heuristique');
    expect(r.note).toMatch(/indisponible|heuristique|structure/);
  });
});
