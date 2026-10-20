import { describe, expect, it } from 'vitest';
import { characterLayer, inpaint, plateHole } from '../../coeur/studio/layers';
import { EMOTION_BODY, emotionOf, visemeAt } from '../../coeur/studio/emotionLayer';
import { poseAt } from '../../coeur/studio/puppet';

/** A synthetic scene: grey wall, a red character (disk head + rectangle body) and its arm reaching right. */
function scene(w = 120, h = 120, withChar = true) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const head = (x - 40) ** 2 + (y - 30) ** 2 < 12 ** 2;
      const body = x > 28 && x < 52 && y > 40 && y < 100;
      const arm = x >= 52 && x < 85 && y > 50 && y < 56;
      const on = withChar && (head || body || arm);
      px[i] = on ? 200 : 150;
      px[i + 1] = on ? 40 : 150;
      px[i + 2] = on ? 40 : 150;
      px[i + 3] = 255;
    }
  return px;
}
const C = {
  box: { x: 0.2, y: 0.12, w: 0.3, h: 0.75 },
  head: { x: 0.24, y: 0.14, w: 0.2, h: 0.2 },
  body: { x: 0.24, y: 0.34, w: 0.2, h: 0.5 },
  arms: [{ shoulder: { x: 0.44, y: 0.44 }, hand: { x: 0.7, y: 0.44 } }],
};

describe('CALQUES — the still becomes a 2.5D scene (plate + cut-outs)', () => {
  it('the colour matte cuts the character out (head, body, connected arm) and leaves the wall', () => {
    const { alpha, armsOk } = characterLayer(scene(), 120, 120, C);
    expect(alpha[30 * 120 + 40]).toBeGreaterThan(0.9); // head
    expect(alpha[70 * 120 + 40]).toBeGreaterThan(0.9); // body
    expect(alpha[53 * 120 + 75]).toBeGreaterThan(0.5); // arm
    expect(alpha[10 * 120 + 100]).toBe(0); // wall
    expect(armsOk).toEqual([true]);
  });
  it('with the generated empty plate the cut-out is by difference (exact, whatever the colours)', () => {
    const { alpha } = characterLayer(scene(), 120, 120, C, [], scene(120, 120, false));
    expect(alpha[70 * 120 + 40]).toBeGreaterThan(0.9);
    expect(alpha[70 * 120 + 10]).toBe(0);
  });
  it('the plate rebuilds the wall behind the character (push-pull), the rest untouched', () => {
    const src = scene();
    const { alpha } = characterLayer(src, 120, 120, C);
    const out = inpaint(src, 120, 120, plateHole([alpha], 120, 120));
    const i = (70 * 120 + 40) * 4;
    expect(Math.abs(out[i]! - 150)).toBeLessThan(12);
    expect(Math.abs(out[i + 1]! - 150)).toBeLessThan(12);
    expect(out[(5 * 120 + 110) * 4]).toBe(150);
  });
});

describe('CALQUE ÉMOTIONS & VISÈMES (Wallbott / Ekman, Preston Blair)', () => {
  it('reads the emotion and layers it on the body: anger leans in, sadness drops the head', () => {
    expect(emotionOf('furieuse')).toBe('colère');
    expect(emotionOf('très triste')).toBe('tristesse');
    expect(emotionOf('')).toBe('neutre');
    const c = { name: 'AWA', box: C.box, head: C.head, body: C.body, eyes: [], arms: [{ shoulder: { x: 0.44, y: 0.44 }, hand: { x: 0.7, y: 0.44 } }] };
    const neutral = poseAt(c as never, 1, { speaking: true, energy: 0.5, facing: 1 });
    const angry = poseAt(c as never, 1, { speaking: true, energy: 0.5, facing: 1, emotion: 'colère' });
    const sad = poseAt(c as never, 1, { speaking: true, energy: 0.5, facing: 1, emotion: 'tristesse' });
    expect(angry.lean).toBeGreaterThan(neutral.lean);
    expect(sad.headNod).toBeGreaterThan(neutral.headNod);
    expect(EMOTION_BODY['joie']!.arms).toBeGreaterThan(0);
  });
  it('the jaw follows the words: closed on M/B/P, wide on A', () => {
    expect(visemeAt('mmm', 0.5)).toBe(0);
    expect(visemeAt('aaa', 0.5)).toBe(1);
    expect(visemeAt('papa', 0.3)).toBeGreaterThan(visemeAt('papa', 0.01));
  });
});
