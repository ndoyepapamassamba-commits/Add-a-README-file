import { describe, expect, it } from 'vitest';
import { eyesOf, faceRig, facingOf, seamRow, type Pt } from '../../coeur/studio/actor/face2d';
import { galleryBoxes, isolateFigure, poseFor } from '../../coeur/studio/actor/sheet';

/** A drawn face on skin: closed lips (dark seam), two eyes (white + dark iris), a chin. */
function face(o: { open?: boolean; eyes?: boolean } = {}) {
  const w = 200;
  const h = 200;
  const data = new Uint8ClampedArray(w * h * 4);
  const put = (x: number, y: number, c: [number, number, number]) => {
    const i = (y * w + x) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = 255;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, [176, 110, 70]);
  // Lips 70..130 × 120..140, seam at y = 131 (closed) or a dark opening 126..136.
  for (let y = 120; y < 141; y++) for (let x = 70; x < 131; x++) put(x, y, [150, 70, 60]);
  if (o.open) for (let y = 126; y < 137; y++) for (let x = 78; x < 123; x++) put(x, y, [40, 10, 12]);
  else for (let x = 70; x < 131; x++) put(x, 131, [50, 20, 18]);
  if (o.eyes !== false)
    for (const cx of [70, 130]) {
      for (let y = 62; y < 79; y++) for (let x = cx - 16; x < cx + 17; x++) put(x, y, [245, 244, 240]);
      for (let y = 63; y < 78; y++) for (let x = cx - 6; x < cx + 7; x++) put(x, y, [40, 25, 20]);
    }
  return { data, width: w, height: h };
}
const marks = (o: { open?: boolean } = {}) => {
  const m = new Map<number, Pt>([
    [61, [70, 131]],
    [291, [130, 131]],
    [13, [100, o.open ? 126 : 129]],
    [14, [100, o.open ? 136 : 133]],
    [0, [100, 120]],
    [17, [100, 140]],
    [152, [100, 175]],
    [1, [100, 100]],
    [468, [70, 70]],
    [473, [130, 70]],
    [234, [40, 100]],
    [454, [160, 100]],
  ]);
  // Eye rings of the detector: human-sized (smaller than the cartoon eyes).
  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246].forEach((k, i) => m.set(k, [62 + (i % 8) * 2.2, 66 + (i % 3) * 3]));
  [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398].forEach((k, i) => m.set(k, [122 + (i % 8) * 2.2, 66 + (i % 3) * 3]));
  return (k: number) => m.get(k);
};

describe('visage mesuré sur le dessin (bouche, menton, yeux)', () => {
  it('closed lips: the seam is the dark line of the art, corners and chin kept, mouth closed', () => {
    const f = faceRig(face(), marks())!;
    expect(f).toBeTruthy();
    expect(f.open).toBeLessThan(0.12);
    expect(Math.abs(f.seam[1] * 200 - 131)).toBeLessThanOrEqual(1);
    expect(f.l[0]).toBeCloseTo(0.35, 2);
    expect(f.r[0]).toBeCloseTo(0.65, 2);
    expect(f.chin[1]).toBeCloseTo(0.875, 2);
    expect(Math.abs(seamRow(face(), 100, 120, 140)! - 131)).toBeLessThanOrEqual(1);
  });
  it('an open drawn mouth (laughing pose): its opening is measured, the inside colour read on the art', () => {
    const f = faceRig(face({ open: true }), marks({ open: true }))!;
    expect(f.open).toBeGreaterThan(0.12);
    expect(f.cavity[0]).toBeLessThan(0.25);
  });
  it('the eyes are the WHITE of the drawing around the iris (bigger than the detector’s), never invented', () => {
    const f = faceRig(face(), marks())!;
    expect(f.eyes).toHaveLength(2);
    const e = f.eyes[0]!;
    expect(Math.abs(e.c[0] * 200 - 70)).toBeLessThan(1);
    expect(e.rx * 200).toBeGreaterThan(14);
    // Closed (laughing) or hidden eyes: no white → no eye, no blink.
    expect(faceRig(face({ eyes: false }), marks())!.eyes).toHaveLength(0);
    expect(eyesOf(face({ eyes: false }), [[70, 70]], 20, 100)).toEqual([]);
  });
  it('no landmarks → no face (the pose keeps its drawn mouth, nothing simulated)', () => {
    expect(faceRig(face(), () => undefined)).toBeNull();
  });
  it('which way the face looks: the nose off the middle of the face', () => {
    const m = marks();
    expect(facingOf(m)).toBe(0);
    expect(facingOf((k) => (k === 1 ? [125, 100] : m(k)))).toBe(1);
    expect(facingOf((k) => (k === 1 ? [70, 100] : m(k)))).toBe(-1);
  });
});

describe('galeries fond vert : figures qui se touchent', () => {
  it('two rows of touching figures are cut at the valleys between bodies, in reading order', () => {
    const w = 600;
    const h = 400;
    const mask = new Uint8Array(w * h);
    const body = (cx: number, y0: number, y1: number, half: number) => {
      for (let y = y0; y < y1; y++) for (let x = cx - half; x <= cx + half; x++) mask[y * w + x] = 1;
    };
    for (const cx of [60, 160, 260, 360, 460, 540]) body(cx, 20, 180, 30);
    for (const cx of [80, 200, 320, 440]) body(cx, 220, 390, 35);
    // Arms touching the neighbours (a thin bridge at shoulder height).
    for (let x = 60; x < 540; x++) for (let y = 70; y < 76; y++) mask[y * w + x] = 1;
    const b = galleryBoxes(mask, w, h);
    expect(b).toHaveLength(10);
    expect(b[0]!.y1).toBeLessThan(200);
    expect(b[6]!.y0).toBeGreaterThan(200);
    expect(b.slice(0, 6).every((x, i, a) => i === 0 || x.x0 >= a[i - 1]!.x0)).toBe(true);
  });
  it('a neighbour’s hand crossing the cut is removed from the figure', () => {
    const w = 50;
    const h = 50;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 5; y < 45; y++) for (let x = 15; x < 35; x++) px[(y * w + x) * 4 + 3] = 255;
    for (let y = 20; y < 24; y++) for (let x = 0; x < 6; x++) px[(y * w + x) * 4 + 3] = 255;
    isolateFigure(px, w, h);
    expect(px[(21 * w + 2) * 4 + 3]).toBe(0);
    expect(px[(20 * w + 20) * 4 + 3]).toBe(255);
  });
});

describe('pose de la réplique', () => {
  it('the written gesture wins over the emotion (a shrug said in surprise is a shrug)', () => {
    expect(poseFor({ speaking: true, gesture: 'shrug', emotion: 'surprise' })).toBe('haussement');
    expect(poseFor({ speaking: true, emotion: 'surprise' })).toBe('choc');
    expect(poseFor({ speaking: true, gesture: 'point', emotion: 'joie' })).toBe('accuse');
  });
});
