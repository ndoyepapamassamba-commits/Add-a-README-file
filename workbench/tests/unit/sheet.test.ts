import { describe, expect, it } from 'vitest';
import { chromaMask, keyOut, mouthOf, poseBoxes, poseFor, poseKinds } from '../../server/jev/studio/actor/sheet';

/** Synthetic sheet: green screen, `n` figures (head + body + one arm) of skin / dress colours. */
function sheet(n: number, W = 600, H = 300) {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) px.set([30, 230, 20, 255], i * 4);
  const fill = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px.set([...c, 255], (y * W + x) * 4);
  };
  for (let k = 0; k < n; k++) {
    const cx = Math.round((W / n) * (k + 0.5));
    fill(cx - 14, 20, cx + 14, 60, [120, 70, 40]); // head
    fill(cx - 25, 60, cx + 25, 270, [220, 60, 160]); // dress
    fill(cx + 25, 80, cx + 45, 90, [120, 70, 40]); // arm
    // a detached strand of hair above the head
    fill(cx - 4, 10, cx + 4, 16, [20, 10, 5]);
  }
  return { px, W, H };
}

describe('planches de personnages (fond vert)', () => {
  it('cuts the five poses of a sheet, left to right, the stray hair joined to its figure', () => {
    const { px, W, H } = sheet(5);
    const m = chromaMask(px, W, H);
    const b = poseBoxes(m, W, H);
    expect(b).toHaveLength(5);
    expect(b.map((x) => x.x0)).toEqual([...b.map((x) => x.x0)].sort((a, c) => a - c));
    expect(b[0]!.y0).toBeLessThanOrEqual(12);
    expect(b[0]!.y1).toBeGreaterThanOrEqual(268);
    expect(poseKinds(5)).toEqual(['neutre', 'accuse', 'choc', 'haussement', 'rire']);
  });
  it('the green is keyed out with a soft matte: edges keep partial coverage, spill pulled back, the character’s own greens kept', () => {
    // screen · olive t-shirt · skin · a hair edge mixed with the screen
    const px = new Uint8ClampedArray([30, 230, 20, 255, 110, 130, 80, 255, 200, 80, 60, 255, 90, 170, 60, 255]);
    keyOut(px, 4, 1);
    expect(px[3]).toBe(0);
    // An olive green garment (little green excess) stays opaque and green.
    expect(px[7]).toBe(255);
    expect(px[5]).toBe(130);
    expect(px[11]).toBe(255);
    // The edge pixel is partly transparent and its green spill is gone (green no longer above red / blue).
    expect(px[15]).toBeGreaterThan(0);
    expect(px[15]).toBeLessThan(255);
    expect(px[13]).toBeLessThanOrEqual(Math.max(px[12]!, px[14]!) + 12);
  });
  it('the mouth is found under the top of the head, on its axis', () => {
    const { px, W, H } = sheet(1);
    const m = chromaMask(px, W, H);
    const [b] = poseBoxes(m, W, H);
    const [mx, my] = mouthOf(m, W, H, b!);
    expect(my).toBeGreaterThan(0.1);
    expect(my).toBeLessThan(0.25);
    expect(mx).toBeGreaterThan(0.3);
    expect(mx).toBeLessThan(0.7);
  });
  it('the pose of each moment: the line’s gesture, the listener neutral, the chute', () => {
    expect(poseFor({ speaking: true, gesture: 'point', emotion: 'colère' })).toBe('accuse');
    expect(poseFor({ speaking: true, gesture: 'laugh' })).toBe('rire');
    expect(poseFor({ speaking: true, gesture: 'shrug' })).toBe('haussement');
    expect(poseFor({ speaking: true, emotion: 'surprise' })).toBe('choc');
    expect(poseFor({ speaking: true, text: 'Qui a pris mon crédit ?' })).toBe('accuse');
    expect(poseFor({ speaking: false, gesture: 'point' })).toBe('neutre');
    expect(poseFor({ speaking: false, react: 'choc' })).toBe('choc');
  });
});
