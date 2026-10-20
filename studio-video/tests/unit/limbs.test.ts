import { describe, expect, it } from 'vitest';
import { ArapSolver, gridMesh } from '../../coeur/studio/actor/arap';
import { bodyParts, nearestVertexIn, partsOfLandmark, splitLimbs, trianglePart, type Pt } from '../../coeur/studio/actor/limbs';

// A body seen from the front, drawn with its left arm hanging AGAINST its left thigh (hand touching the leg), as in
// Modou's « neutre » drawing — the case of the bent wrist and claw fingers in film v4.
const W = 200, H = 400;
const inside = (x: number, y: number) =>
  (Math.hypot(x - 100, y - 40) < 25) || // head
  (y >= 65 && y < 200 && x >= 70 && x < 130) || // torso
  (y >= 200 && y < 390 && ((x >= 72 && x < 98) || (x >= 102 && x < 128))) || // legs
  (y >= 70 && y < 250 && x >= 130 && x < 146); // left arm hanging along the body, hand down to 250 px against the thigh
const bp: Record<number, Pt> = {
  0: [100, 40], 11: [138, 70], 12: [70, 70], 13: [138, 150], 14: [62, 150], 15: [138, 205], 16: [62, 205], 17: [133, 225], 19: [143, 225], 21: [146, 215],
  23: [115, 200], 24: [85, 200], 25: [115, 290], 26: [85, 290], 27: [115, 380], 28: [85, 380], 31: [115, 390], 32: [85, 390],
};

describe('membres séparés (revue du film v4 : main soudée à la cuisse)', () => {
  it('a headscarf knot beside a raised hand stays with the head (the hand is its own outline, not a radius)', () => {
    // raised right hand next to the head, with a knot of cloth hanging from the head between them (Maman, v5 test)
    const ins = (x: number, y: number) => Math.hypot(x - 100, y - 40) < 25 || (x >= 124 && x < 140 && y >= 30 && y < 70) || (y >= 65 && y < 200 && x >= 70 && x < 130) || (x >= 140 && x < 156 && y >= 20 && y < 120) || (y >= 200 && y < 390 && x >= 72 && x < 128);
    const pose: Record<number, Pt> = { ...bp, 13: [148, 110], 15: [148, 60], 17: [142, 42], 19: [154, 42], 21: [156, 52] };
    const m = gridMesh(ins, W, H, 8, 0);
    const parts = bodyParts(pose);
    // no triangle of the knot (x 124–140, y 30–70) belongs to the hand: the knot cannot leave with it
    const tp = trianglePart(m, parts);
    let knot = 0;
    for (let t = 0; t < m.tris.length; t += 3) {
      const cx = (m.rest[m.tris[t]! * 2]! + m.rest[m.tris[t + 1]! * 2]! + m.rest[m.tris[t + 2]! * 2]!) / 3, cy = (m.rest[m.tris[t]! * 2 + 1]! + m.rest[m.tris[t + 1]! * 2 + 1]! + m.rest[m.tris[t + 2]! * 2 + 1]!) / 3;
      if (cx > 124 && cx < 138 && cy > 30 && cy < 70) { knot++; expect(tp[t / 3]).not.toBe('mainG'); }
    }
    expect(knot).toBeGreaterThan(0);
    // and the raised hand itself is recognised as the hand
    expect(splitLimbs(m, parts).vertPart).toContain('mainG');
  });
  it('cuts the mesh between the hand and the thigh, never at a joint, and leaves the picture unchanged at rest', () => {
    const m = gridMesh(inside, W, H, 8, 0);
    const parts = bodyParts(bp);
    expect(parts.map((p) => p.id)).toEqual(expect.arrayContaining(['tete', 'torse', 'brasG', 'avantBrasG', 'mainG', 'cuisseG', 'jambeG']));
    const s = splitLimbs(m, parts);
    expect(s.dup).toBeGreaterThan(0);
    expect(s.mesh.tris.length).toBe(m.tris.length);
    // copies sit exactly where their original vertex is (same picture at rest)
    for (let i = m.rest.length / 2; i < s.mesh.rest.length / 2; i++) {
      const o = s.origin[i]!;
      expect([s.mesh.rest[i * 2], s.mesh.rest[i * 2 + 1]]).toEqual([m.rest[o * 2], m.rest[o * 2 + 1]]);
    }
    // every piece of the cut mesh holds a joint (no island the solver could not place)
    const nv = s.mesh.rest.length / 2, par = Array.from({ length: nv }, (_, i) => i);
    const f = (x: number): number => (par[x] === x ? x : (par[x] = f(par[x]!)));
    for (let t = 0; t < s.mesh.tris.length; t += 3) { par[f(s.mesh.tris[t + 1]!)] = f(s.mesh.tris[t]!); par[f(s.mesh.tris[t + 2]!)] = f(s.mesh.tris[t]!); }
    const used = new Set(Array.from(s.mesh.tris)), roots = new Set([...used].map((v) => f(v)));
    for (const r of roots) expect([...used].some((v) => f(v) === r && parts.some((p) => [p.a, p.b].some((q) => Math.hypot(s.mesh.rest[v * 2]! - q[0], s.mesh.rest[v * 2 + 1]! - q[1]) <= 12)))).toBe(true);
    // a wrist handle lands on the arm, not on the thigh copy
    const wr = nearestVertexIn(s.mesh, s.vertPart, 138, 205, partsOfLandmark(15));
    expect(['avantBrasG', 'mainG']).toContain(s.vertPart[wr]);
  });
  it('the arm swings away from the body: the hand follows the wrist instead of being dragged by the leg', () => {
    const run = (mesh: ReturnType<typeof gridMesh>, pick: (x: number, y: number) => number) => {
      const fixed = [pick(100, 40), pick(85, 380), pick(115, 380), pick(85, 200), pick(115, 200), pick(70, 70)];
      const sh = pick(138, 70), el = pick(138, 150), wr = pick(138, 205);
      const solver = new ArapSolver(mesh, [...fixed, sh, el, wr]);
      const target = new Map<number, Pt>([[el, [160, 140]], [wr, [190, 185]]]);
      const pos: number[] = [];
      for (const h of solver.handleIds) { const t = target.get(h); pos.push(t ? t[0] : mesh.rest[h * 2]!, t ? t[1] : mesh.rest[h * 2 + 1]!); }
      solver.cur.set(mesh.rest);
      return solver.solve(pos, 12);
    };
    const m = gridMesh(inside, W, H, 8, 0);
    const near = (mm: typeof m) => (x: number, y: number) => { let b = 0, d = Infinity; for (let i = 0; i < mm.rest.length / 2; i++) { const e = (mm.rest[i * 2]! - x) ** 2 + (mm.rest[i * 2 + 1]! - y) ** 2; if (e < d) { d = e; b = i; } } return b; };
    const welded = run(m, near(m));
    const s = splitLimbs(m, bodyParts(bp));
    const cut = run(s.mesh, (x, y) => { const parts = x > 128 ? new Set(['brasG', 'avantBrasG', 'mainG']) : new Set(['tete', 'torse', 'cuisseG', 'cuisseD', 'jambeG', 'jambeD', 'piedG', 'piedD', 'brasD']); return nearestVertexIn(s.mesh, s.vertPart, x, y, parts); });
    // finger tip of the hand: rest (140, 245); with a free hand it swings out with the wrist (x ≫ 146)
    const tipW = near(m)(140, 245), tipC = nearestVertexIn(s.mesh, s.vertPart, 140, 245, new Set(['mainG']));
    expect(cut[tipC * 2]!).toBeGreaterThan(welded[tipW * 2]! + 15);
    expect(cut[tipC * 2]!).toBeGreaterThan(175);
  });
});
