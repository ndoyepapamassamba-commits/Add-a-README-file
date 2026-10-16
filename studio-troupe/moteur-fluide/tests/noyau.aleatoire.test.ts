import { describe, expect, it } from 'vitest';
import {
  bruit1D,
  bruit2D,
  bruitFractal1D,
  bruitFractal2D,
  creerAleatoire,
  graineDe,
  hash01,
  hash2D,
  hash32,
  hashChaine,
} from '../src/noyau/aleatoire';

describe('hachages', () => {
  it('sont déterministes et sensibles à chaque argument', () => {
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(1, 2, 3)).not.toBe(hash32(1, 2, 4));
    expect(hash32(1, 2, 3)).not.toBe(hash32(3, 2, 1));
    expect(hash32(1, 2)).not.toBe(hash32(1, 2, 0));
    expect(hash32(0.5)).toBe(hash32(0.5));
    expect(hash32(0.5)).not.toBe(hash32(0.5000001));
    expect(hash32(0)).toBe(hash32(-0));
    expect(hashChaine('modou')).toBe(hashChaine('modou'));
    expect(hashChaine('modou')).not.toBe(hashChaine('coumba'));
    expect(graineDe('modou', 'clignement', 3)).toBe(graineDe('modou', 'clignement', 3));
  });

  it('hash01 est uniforme dans [0, 1[', () => {
    const n = 20000;
    const cases = new Array<number>(10).fill(0);
    for (let i = 0; i < n; i++) {
      const u = hash01(17, i);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      cases[Math.floor(u * 10)]!++;
    }
    for (const c of cases) expect(Math.abs(c - n / 10)).toBeLessThan(n / 10 * 0.08);
    expect(hash2D(3, 4, 9)).toBe(hash2D(3, 4, 9));
  });
});

describe('générateur à graine', () => {
  it('reproduit la même suite pour la même graine', () => {
    const a = creerAleatoire(123);
    const b = creerAleatoire(123);
    const c = creerAleatoire(124);
    const sa = Array.from({ length: 50 }, () => a.suivant());
    const sb = Array.from({ length: 50 }, () => b.suivant());
    const sc = Array.from({ length: 50 }, () => c.suivant());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });

  it('entier reste dans les bornes et couvre la plage', () => {
    const a = creerAleatoire(5);
    const vus = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const k = a.entier(-2, 3);
      expect(k).toBeGreaterThanOrEqual(-2);
      expect(k).toBeLessThanOrEqual(3);
      vus.add(k);
    }
    expect(vus.size).toBe(6);
  });
});

describe('bruit simplex', () => {
  it('1D : déterministe, borné dans [−1, 1], nul aux entiers, de moyenne ≈ 0, non dégénéré', () => {
    let somme = 0;
    let carres = 0;
    let max = 0;
    const n = 200000;
    for (let i = 0; i < n; i++) {
      const x = i * 0.0137 - 500;
      const v = bruit1D(x, 11);
      expect(v).toBe(bruit1D(x, 11));
      max = Math.max(max, Math.abs(v));
      somme += v;
      carres += v * v;
    }
    expect(max).toBeLessThanOrEqual(1);
    expect(Math.abs(somme / n)).toBeLessThan(0.02);
    expect(Math.sqrt(carres / n)).toBeGreaterThan(0.1);
    for (let i = -5; i <= 5; i++) expect(bruit1D(i, 3)).toBe(0);
    expect(bruit1D(0.37, 1)).not.toBe(bruit1D(0.37, 2));
  });

  it('1D : continu (petit pas → petit écart)', () => {
    for (let x = -3; x < 3; x += 0.0731) {
      expect(Math.abs(bruit1D(x + 1e-5, 4) - bruit1D(x, 4))).toBeLessThan(1e-3);
    }
  });

  it('2D : déterministe, borné dans [−1, 1], de moyenne ≈ 0, non dégénéré, continu', () => {
    let somme = 0;
    let carres = 0;
    let max = 0;
    let n = 0;
    for (let i = 0; i < 300; i++) {
      for (let j = 0; j < 300; j++) {
        const x = i * 0.071 - 10;
        const y = j * 0.053 + 4;
        const v = bruit2D(x, y, 8);
        expect(v).toBe(bruit2D(x, y, 8));
        max = Math.max(max, Math.abs(v));
        somme += v;
        carres += v * v;
        n++;
        expect(Math.abs(bruit2D(x + 1e-5, y, 8) - v)).toBeLessThan(2e-3);
      }
    }
    expect(max).toBeLessThanOrEqual(1);
    expect(Math.abs(somme / n)).toBeLessThan(0.03);
    expect(Math.sqrt(carres / n)).toBeGreaterThan(0.1);
  });

  it('fractal : borné dans [−1, 1] et déterministe', () => {
    for (let i = 0; i < 5000; i++) {
      const v1 = bruitFractal1D(i * 0.031, 2, { octaves: 3 });
      const v2 = bruitFractal2D(i * 0.031, i * 0.017, 2, { octaves: 3 });
      expect(Math.abs(v1)).toBeLessThanOrEqual(1);
      expect(Math.abs(v2)).toBeLessThanOrEqual(1);
      expect(v1).toBe(bruitFractal1D(i * 0.031, 2, { octaves: 3 }));
    }
  });
});
