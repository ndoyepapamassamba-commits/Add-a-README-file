import { describe, expect, it } from 'vitest';
import { betterTake, clipJudgePrompt, clipVerdict, measureFrames, parseClipJudgement, segmentFilm, silentGaps, type FrameSeries } from '../../coeur/studio/clipInspect';

const W = 96;
const H = 170;
/** Synthetic clip: `n` frames; `draw(i, px)` paints frame i. */
function clip(n: number, draw: (i: number, f: Float32Array) => void, fps = 12): FrameSeries {
  const frames = Array.from({ length: n }, (_, i) => {
    const f = new Float32Array(W * H).fill(0.4);
    draw(i, f);
    return f;
  });
  return { w: W, h: H, fps, frames };
}
const rect = (f: Float32Array, x0: number, y0: number, w: number, h: number, v: number) => {
  for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) f[y * W + x] = v;
};
// Lively: big bodies that move a lot all over the frame.
const lively = (n: number) =>
  clip(n, (i, f) => {
    for (let k = 0; k < 6; k++) rect(f, Math.round(10 + 30 * Math.sin(i / 3 + k)), 10 + k * 26, 40, 22, 0.9);
  });

describe('mesures locales (étalonnées sur « Le chef invisible » v44)', () => {
  it('a lively clip: motion and coverage high, nothing frozen → ok', () => {
    const m = measureFrames(lively(60));
    expect(m.motion).toBeGreaterThan(0.009);
    expect(m.coverage).toBeGreaterThan(0.2);
    expect(m.frozen).toEqual([]);
    expect(clipVerdict(m, null).verdict).toBe('ok');
  });
  it('a frozen passage (render at 1 frame/s, clip ended) is found with its times', () => {
    const fs = clip(60, (i, f) => rect(f, i < 24 ? 10 + (i % 12) * 5 : 60, 40, 30, 60, 0.9));
    const m = measureFrames(fs);
    expect(m.frozen.length).toBe(1);
    expect(m.frozen[0]!.start).toBeCloseTo(2, 0);
    expect(m.frozen[0]!.end).toBeCloseTo(5, 0);
    const r = clipVerdict(m, null);
    expect(r.verdict).toBe('retry');
    expect(r.reasons.join(' ')).toContain('image figée');
    expect(r.fix).toContain('never a frozen pose');
  });
  it('a caption changing word does not count as motion (only a small band moves)', () => {
    const fs = clip(48, (i, f) => rect(f, 10, 150, 70, 10, i % 6 < 3 ? 1 : 0));
    const m = measureFrames(fs);
    expect(m.frozen.length).toBe(1);
    expect(m.frozen[0]!.end - m.frozen[0]!.start).toBeGreaterThan(3.5);
  });
  it('a stiff clip (only one small zone moves) → « manque d’animation »', () => {
    const r = clipVerdict(measureFrames(clip(48, (i, f) => rect(f, 40, 60, 8, 8, i % 2 ? 0.9 : 0.1))), null);
    expect(r.reasons.join(' ')).toContain('manque d’animation');
    expect(r.fix).toContain('lively exaggerated cartoon acting');
  });
  it('flicker / tearing: a zone that flashes for one frame and comes back', () => {
    const fs = clip(48, (i, f) => {
      for (let k = 0; k < 6; k++) rect(f, Math.round(10 + 30 * Math.sin(i / 3 + k)), 10 + k * 26, 40, 22, 0.9);
      // A hand that tears for one frame and comes back (local, like the v44 arm).
      if (i % 2) rect(f, 60, 0, 30, 40, 0.05);
    });
    expect(measureFrames(fs).flicker).toBeGreaterThan(0.01);
  });
  it('a film is cut into its shots at the hard cuts', () => {
    const a = lively(36).frames;
    const b = clip(36, (i, f) => {
      f.fill(0.95);
      rect(f, 20 + i, 30, 40, 100, 0.1);
    }).frames;
    const shots = segmentFilm({ w: W, h: H, fps: 12, frames: [...a, ...b] });
    expect(shots.length).toBe(2);
    expect(shots[0]!.end).toBeCloseTo(3, 1);
  });
});

describe('juge visuel + verdict', () => {
  it('the prompt carries the action, the lines and every criterion', () => {
    const p = clipJudgePrompt({ action: 'KOFFI aligne des trombones', location: 'bureau', characters: 'KOFFI: lunettes', lines: [{ speaker: 'PATRON', text: 'Koffi, pourquoi tes trombones sont en rang ?' }], frames: 6 });
    for (const k of ['rire', 'mouvement', 'expressions', 'bouche', 'anatomie', 'coherence']) expect(p).toContain(`- ${k} :`);
    expect(p).toContain('PATRON : « Koffi, pourquoi');
  });
  it('parses the judge; a missing score → null (never invented)', () => {
    const j = parseClipJudgement('voici {"rire":7,"mouvement":3,"expressions":6,"bouche":2,"anatomie":3,"coherence":8,"defects":["bras du patron étiré jusqu’à l’épaule de Koffi"],"fix":"keep arm length"}');
    expect(j!.scores.anatomie).toBe(3);
    expect(j!.defects[0]).toContain('bras du patron');
    expect(parseClipJudgement('{"rire":7}')).toBeNull();
    expect(parseClipJudgement('rien')).toBeNull();
  });
  it('the v44 patron shot: stretched arm + silent mouths → retake with the written correction', () => {
    const j = parseClipJudgement('{"rire":5,"mouvement":3,"expressions":6,"bouche":2,"anatomie":3,"coherence":7,"defects":["bras du patron étiré"],"fix":"the boss points with a normal-length arm"}')!;
    const r = clipVerdict(measureFrames(lively(48)), j, { expectedS: 9 });
    expect(r.verdict).toBe('retry');
    const all = r.reasons.join(' | ');
    expect(all).toContain('déformation');
    expect(all).toContain('bouches qui ne parlent pas');
    expect(all).toContain('clip de 4.0 s pour 9.0 s');
    expect(r.fix).toContain('correct anatomy');
    expect(r.fix).toContain('the boss points with a normal-length arm');
  });
  it('the better take is kept, never a blind replacement', () => {
    const good = clipVerdict(measureFrames(lively(48)), null);
    const bad = clipVerdict(measureFrames(clip(48, () => undefined)), null);
    expect(betterTake(good, bad)).toBe('a');
    expect(betterTake(bad, good)).toBe('b');
  });
  it('silent gaps of the sound track', () => {
    const env = [...Array(20).fill(0.5), ...Array(40).fill(0.001), ...Array(20).fill(0.6)];
    expect(silentGaps(env, 0.05)).toEqual([{ start: 1, end: 3 }]);
    expect(silentGaps(env, 0.05, { minS: 3 })).toEqual([]);
  });
});
