import { describe, expect, it } from 'vitest';
import { captionChunk, fitBand, gestureEnvelope, parallelChunk, shockAfter } from '../../coeur/studio/viralFormat';

describe('FORMAT VIRAL « à mourir de rire » (mesuré sur le compte de référence)', () => {
  it('a landscape shot sits whole and sharp in a band across a 9:16 frame; a vertical shot fills it', () => {
    const b = fitBand(1280, 720, 720, 1280);
    expect(b.fill).toBe(true);
    expect(b.w).toBe(720);
    expect(Math.round(b.h)).toBe(405);
    expect(Math.round(b.y)).toBe(Math.round((1280 - 405) / 2));
    expect(fitBand(720, 1280, 720, 1280).fill).toBe(false);
  });
  it('karaoke captions 1–3 words at a time, the longest word highlighted; English follows the same progress', () => {
    const w = 'Faut la chasser de la maison'.split(' ');
    expect(captionChunk(w, 1)).toEqual({ words: ['Faut', 'la', 'chasser'], key: 2 });
    expect(captionChunk(w, 4)!.words).toEqual(['de', 'la', 'maison']);
    expect(captionChunk([], 0)).toBeNull();
    expect(parallelChunk('Chase her out of the house'.split(' '), 0.1)!.words).toEqual(['Chase', 'her', 'out']);
  });
  it('the « stupeur » insert plays after punchlines (every scene in a compilation), never after the last scene', () => {
    const sc = [{ beat: 'hook' }, { beat: 'chute' }, { beat: 'escalade' }, { beat: 'chute' }];
    expect(shockAfter(sc, false)).toEqual([false, true, false, false]);
    expect(shockAfter(sc, true)).toEqual([true, true, true, false]);
  });
  it('gestures follow the animation principles: anticipation (backwards), overshoot, then settle', () => {
    expect(gestureEnvelope(0.06)).toBeLessThan(0);
    const peak = Math.max(...[0.2, 0.25, 0.3, 0.35, 0.4].map(gestureEnvelope));
    expect(peak).toBeGreaterThan(1);
    expect(Math.abs(gestureEnvelope(1.5) - 1)).toBeLessThan(0.01);
  });
});
