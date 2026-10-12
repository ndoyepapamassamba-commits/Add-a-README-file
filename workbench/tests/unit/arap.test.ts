import { describe, expect, it } from 'vitest';
import { ArapSolver, gridMesh, nearestVertex } from '../../server/jev/studio/actor/arap';

describe('marionnette souple (ARAP)', () => {
  const bar = () => gridMesh((x, y) => x >= 0 && x < 200 && y >= 90 && y < 110, 200, 200, 10, 0);
  it('meshes only the figure (plus its padding)', () => {
    const m = bar();
    expect(m.tris.length / 3).toBe(2 * 20 * 2);
    const padded = gridMesh((x, y) => x >= 50 && x < 60 && y >= 50 && y < 60, 200, 200, 10, 1);
    expect(padded.tris.length / 3).toBe(2 * 5);
  });
  it('an arm swung at its wrist bends as a rigid piece: no stretching, the middle follows the rotation', () => {
    const m = bar();
    const left = [nearestVertex(m, 0, 90), nearestVertex(m, 0, 110)];
    const right = [nearestVertex(m, 200, 90), nearestVertex(m, 200, 110)];
    const s = new ArapSolver(m, [...left, ...right]);
    const a = Math.PI / 6;
    const rot = (x: number, y: number) => [x * Math.cos(a) - (y - 100) * Math.sin(a), 100 + x * Math.sin(a) + (y - 100) * Math.cos(a)];
    const ids = s.handleIds;
    const pos: number[] = [];
    for (const h of ids) pos.push(...rot(m.rest[h * 2]!, m.rest[h * 2 + 1]!));
    let p = s.solve(pos, 1);
    for (let k = 0; k < 30; k++) p = s.solve(pos, 1);
    const mid = nearestVertex(m, 100, 100);
    const [ex, ey] = rot(100, 100);
    expect(Math.hypot(p[mid * 2]! - ex!, p[mid * 2 + 1]! - ey!)).toBeLessThan(2);
    // Edge lengths kept (rigid): every edge within 3 % of its rest length.
    for (let t = 0; t < m.tris.length; t += 3)
      for (const [i, j] of [
        [m.tris[t]!, m.tris[t + 1]!],
        [m.tris[t + 1]!, m.tris[t + 2]!],
      ]) {
        const r = Math.hypot(m.rest[i! * 2]! - m.rest[j! * 2]!, m.rest[i! * 2 + 1]! - m.rest[j! * 2 + 1]!);
        const d = Math.hypot(p[i! * 2]! - p[j! * 2]!, p[i! * 2 + 1]! - p[j! * 2 + 1]!);
        expect(Math.abs(d - r) / r).toBeLessThan(0.03);
      }
  });
  it('handles at rest → the drawing does not move at all', () => {
    const m = bar();
    const s = new ArapSolver(m, [nearestVertex(m, 0, 100), nearestVertex(m, 200, 100)]);
    const pos = s.handleIds.flatMap((h) => [m.rest[h * 2]!, m.rest[h * 2 + 1]!]);
    const p = s.solve(pos, 3);
    let worst = 0;
    for (let i = 0; i < p.length; i++) worst = Math.max(worst, Math.abs(p[i]! - m.rest[i]!));
    expect(worst).toBeLessThan(1e-6);
  });
});
