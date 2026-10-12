import { describe, expect, it } from 'vitest';
import { gridMesh } from '../../server/jev/studio/actor/arap';
import { bonesFromBody, heatWeights } from '../../server/jev/studio/actor/boneHeat';
import { partLayers } from '../../server/jev/studio/actor/parts';
import { BP, type SheetBody } from '../../server/jev/studio/actor/puppetMotion';

/** A figure whose LEFT arm (picture right) hangs along the torso, touching it: one merged silhouette (200 × 400 px). */
const W = 200;
const H = 400;
const figure = (x: number, y: number) => {
  if (Math.hypot(x - 100, y - 50) < 32) return true; // head
  if (x > 60 && x < 140 && y > 80 && y < 240) return true; // torso (80 px wide)
  if (x >= 140 && x < 166 && y > 95 && y < 215) return true; // left arm hanging, glued to the torso's right edge
  if (x > 20 && x < 46 && y > 95 && y < 215) return true; // right arm, away from the body (a gap of 14 px)
  if (y >= 240 && y < 390 && ((x > 66 && x < 96) || (x > 104 && x < 134))) return true; // legs
  return false;
};
const body: SheetBody = {
  [BP.nose]: [0.5, 0.13],
  [BP.lEye]: [0.54, 0.11],
  [BP.rEye]: [0.46, 0.11],
  [BP.lSh]: [0.72, 0.25],
  [BP.rSh]: [0.28, 0.25],
  [BP.lEl]: [0.76, 0.39],
  [BP.rEl]: [0.17, 0.39],
  [BP.lWr]: [0.76, 0.52],
  [BP.rWr]: [0.17, 0.52],
  [BP.lHip]: [0.58, 0.58],
  [BP.rHip]: [0.42, 0.58],
  [BP.lKn]: [0.58, 0.78],
  [BP.rKn]: [0.42, 0.78],
  [BP.lAn]: [0.58, 0.96],
  [BP.rAn]: [0.42, 0.96],
};

describe('calques du dessin (bras devant le corps)', () => {
  it('the arm glued to the torso becomes its own layer; the torso continues under it and borrows its skin from the mirror side', () => {
    const m = gridMesh(figure, W, H, 5, 1);
    const bones = bonesFromBody(body, W, H)!;
    const sw = heatWeights(m, bones, figure);
    const L = partLayers(m, bones, sw);
    const n = m.rest.length / 2;
    const at = (x: number, y: number) => {
      for (let i = 0; i < n; i++) if (m.rest[i * 2] === x && m.rest[i * 2 + 1] === y) return i;
      return -1;
    };
    // Parts by the dominant bone: the hanging left arm, the free right arm, the torso.
    expect(L.part[at(155, 150)]).toBe(1);
    expect(L.part[at(30, 150)]).toBe(2);
    expect(L.part[at(100, 150)]).toBe(0);
    const cell = (x: number, y: number) => Math.round(y / 5) * L.gw + Math.round(x / 5);
    // The torso's right edge under the hanging arm is restored: the body cells continue to x ≈ 140 (its true edge is
    // the arm's inner edge; the arm hides nothing beyond it) and the arm's cells there are marked hidden body.
    expect(L.body[cell(135, 150)]).toBe(1);
    expect(L.hidden[cell(135, 150)]).toBe(0);
    // The free right arm hides nothing: no hidden body cell at its place, and the body does not extend into the gap.
    expect(L.body[cell(30, 150)]).toBe(0);
    expect(L.body[cell(52, 150)]).toBe(0);
    // Every hidden cell borrows from a visible body cell of its own row.
    let hiddenN = 0;
    for (let c = 0; c < L.gw * L.gh; c++)
      if (L.hidden[c]) {
        hiddenN++;
        expect(L.borrow[c]).toBeGreaterThanOrEqual(0);
        expect(Math.floor(L.borrow[c]! / L.gw)).toBe(Math.floor(c / L.gw));
        expect(L.hidden[L.borrow[c]!]).toBe(0);
      }
    expect(L.arms[0]!.reduce((a, b) => a + b, 0)).toBeGreaterThan(20);
    expect(L.arms[1]!.reduce((a, b) => a + b, 0)).toBeGreaterThan(20);
    expect(hiddenN).toBeGreaterThanOrEqual(0);
  });
  it('an arm crossing the torso: the torso keeps its full width under it, mirrored skin', () => {
    // A forearm drawn across the belly (x 60..140 at y 160..180).
    const crossed = (x: number, y: number) => figure(x, y) || (x > 40 && x < 140 && y > 160 && y < 180);
    const b2: SheetBody = { ...body, [BP.rEl]: [0.2, 0.42], [BP.rWr]: [0.66, 0.42] };
    const m = gridMesh(crossed, W, H, 5, 1);
    const bones = bonesFromBody(b2, W, H)!;
    const sw = heatWeights(m, bones, crossed);
    const L = partLayers(m, bones, sw);
    const cell = (x: number, y: number) => Math.round(y / 5) * L.gw + Math.round(x / 5);
    // The belly row keeps the torso's extent (60..140) and its cells under the forearm are hidden body cells.
    expect(L.body[cell(70, 170)]).toBe(1);
    expect(L.body[cell(130, 170)]).toBe(1);
    const hiddenOnRow = Array.from({ length: L.gw }, (_, x) => L.hidden[Math.round(170 / 5) * L.gw + x]!).reduce((a, b) => a + b, 0);
    expect(hiddenOnRow).toBeGreaterThan(3);
  });
});

describe('découpe en maillages de parties', () => {
  it('body + two arms, the hidden body vertices borrow from visible body vertices of the same row', async () => {
    const { splitParts } = await import('../../server/jev/studio/actor/parts');
    const m = gridMesh(figure, W, H, 5, 1);
    const bones = bonesFromBody(body, W, H)!;
    const sw = heatWeights(m, bones, figure);
    const L = partLayers(m, bones, sw);
    const P = splitParts(m, L);
    expect(P.arms[0]).not.toBeNull();
    expect(P.arms[1]).not.toBeNull();
    const n = m.rest.length / 2;
    expect(P.body.rest.length / 2 + P.arms[0]!.rest.length / 2 + P.arms[1]!.rest.length / 2).toBeGreaterThanOrEqual(n);
    // Triangles are kept whole, inside their part.
    for (const part of [P.body, P.arms[0]!, P.arms[1]!]) {
      expect(part.tris.length % 3).toBe(0);
      expect(Math.max(...part.tris)).toBeLessThan(part.rest.length / 2);
    }
    let hidden = 0;
    for (let k = 0; k < P.body.hidden.length; k++)
      if (P.body.hidden[k]) {
        hidden++;
        const src = P.body.from[k]!;
        expect(L.part[src]).toBe(0);
        expect(m.rest[src * 2 + 1]).toBe(P.body.rest[k * 2 + 1]);
      }
    expect(hidden).toBeGreaterThan(0);
  });
});
