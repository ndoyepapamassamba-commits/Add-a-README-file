import { describe, expect, it } from 'vitest';
import { crowdSize, extrasPlan, walkerX } from '../../server/jev/studio/actor/extras';

describe('figurants', () => {
  it('public places have life behind the actors, private rooms none', () => {
    expect(crowdSize('au marché', true)).toBe(3);
    expect(crowdSize('salon de la maison', false)).toBe(0);
    expect(crowdSize('salon de coiffure', false)).toBe(1);
    expect(crowdSize('dans le taxi', false)).toBe(0);
    expect(crowdSize('cour de l’école', true)).toBe(2);
  });
  it('deterministic, distinct, never more than the troupe, always behind the actors', () => {
    const a = extrasPlan('au marché', true, 2, 30);
    expect(a).toEqual(extrasPlan('au marché', true, 2, 30));
    expect(new Set(a.map((e) => e.pick)).size).toBe(a.length);
    expect(extrasPlan('au marché', true, 0, 1)).toHaveLength(1);
    for (const e of a) {
      expect(e.z).toBeLessThan(-0.9);
      expect(e.z).toBeGreaterThan(-1.5);
    }
    expect(a.some((e) => e.walking)).toBe(true);
  });
  it('a walker crosses at its speed and comes back from the other side', () => {
    const [w] = extrasPlan('au marché', true, 3, 30).filter((e) => e.walking);
    const dx = walkerX(w!, 1.0) - walkerX(w!, 0.0);
    expect(Math.abs(Math.abs(dx) - w!.speed)).toBeLessThan(1e-9);
    for (let t = 0; t < 60; t += 0.7) {
      const x = walkerX(w!, t);
      expect(Math.abs(x)).toBeLessThanOrEqual(2.8 + 1e-9);
    }
  });
});
