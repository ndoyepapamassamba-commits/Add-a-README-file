import { describe, expect, it } from 'vitest';
import { RELIEF, fallbackDepth, lensBlur, pushAlongRay, reliefScale } from '../../coeur/studio/actor/relief';

describe('décor en relief', () => {
  it('the median depth stays on the plane; near comes forward, far goes back', () => {
    expect(reliefScale(0.5, 0.5)).toBeCloseTo(1);
    expect(reliefScale(0.9, 0.5)).toBeLessThan(1);
    expect(reliefScale(0.1, 0.5)).toBeGreaterThan(1);
    expect(reliefScale(0.0, 1.0)).toBeLessThanOrEqual(RELIEF.farthest);
  });
  it('nothing of the set ever comes in front of the actors', () => {
    for (const d of [0, 0.3, 0.7, 1]) {
      const p = pushAlongRay([0.4, 1, RELIEF.planeZ], reliefScale(d, 0));
      expect(p[2]).toBeLessThanOrEqual(RELIEF.nearestZ + 1e-9);
    }
  });
  it('seen from the reference camera the picture is unchanged (points move along its rays)', () => {
    const p: [number, number, number] = [1.2, 0.4, RELIEF.planeZ];
    const q = pushAlongRay(p, 1.7);
    const e = RELIEF.eye;
    const dir = (a: readonly number[]) => {
      const v = [a[0]! - e[0], a[1]! - e[1], a[2]! - e[2]];
      const n = Math.hypot(...v);
      return v.map((x) => x / n);
    };
    dir(p).forEach((c, i) => expect(c).toBeCloseTo(dir(q)[i]!, 9));
  });
  it('a guessed depth: the floor comes towards the camera, the top recedes', () => {
    expect(fallbackDepth(1.0, 0.9)).toBeGreaterThan(fallbackDepth(0.5, 0.9));
    expect(fallbackDepth(0.5, 0.9)).toBeGreaterThan(fallbackDepth(0.0, 0.9));
  });
  it('the lens blurs the far set more, and more again in a close-up', () => {
    expect(lensBlur(0.2, 0)).toBeGreaterThan(lensBlur(0.8, 0));
    expect(lensBlur(0.5, 1)).toBeGreaterThan(lensBlur(0.5, 0));
  });
});
