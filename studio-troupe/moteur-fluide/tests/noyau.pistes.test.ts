import { describe, expect, it } from 'vitest';
import { creerPisteAngle, creerPisteNombre, creerPisteVec2 } from '../src/noyau/pistes';
import type { Cle, ModeInterpolation } from '../src/timeline/types';

const CLES: Cle<number>[] = [
  { t: 0.5, v: 0 },
  { t: 1.0, v: 2 },
  { t: 1.3, v: -1 },
  { t: 2.5, v: 1 },
  { t: 3.0, v: 1.5 },
];

describe('pistes à clés', () => {
  const modesContinus: ModeInterpolation[] = ['lineaire', 'lisse', 'hermite', 'easing', 'bezier'];
  for (const mode of modesContinus) {
    it(`mode ${mode} : passe par les clés et reste continu aux clés`, () => {
      const p = creerPisteNombre(CLES, { interpolation: mode, easing: 'sortieDos' });
      for (const k of CLES) {
        expect(p.valeur(k.t)).toBeCloseTo(k.v, 9);
        expect(Math.abs(p.valeur(k.t - 1e-9) - p.valeur(k.t + 1e-9))).toBeLessThan(1e-6);
      }
    });
  }

  it('tient la valeur avant la première et après la dernière clé', () => {
    const p = creerPisteNombre(CLES);
    expect(p.valeur(-10)).toBe(0);
    expect(p.valeur(99)).toBe(1.5);
    expect(p.vitesse(-10)).toBe(0);
    expect(p.vitesse(99)).toBe(0);
    expect(p.debut).toBe(0.5);
    expect(p.fin).toBe(3);
  });

  it('mode constant : marche exactement à la clé suivante', () => {
    const p = creerPisteNombre(CLES, { interpolation: 'constant' });
    expect(p.valeur(0.99999)).toBe(0);
    expect(p.valeur(1.0)).toBe(2);
  });

  it('mode lisse : C¹ (vitesse continue) aux clés intérieures, vitesse nulle aux extrémités', () => {
    const p = creerPisteNombre(CLES, { interpolation: 'lisse' });
    for (const k of CLES) {
      expect(Math.abs(p.vitesse(k.t - 1e-7) - p.vitesse(k.t + 1e-7))).toBeLessThan(1e-4);
    }
    expect(Math.abs(p.vitesse(0.5 + 1e-9))).toBeLessThan(1e-6);
  });

  it('interpolation et courbe par clé', () => {
    const p = creerPisteNombre([
      { t: 0, v: 0, interpolation: 'easing', easing: 'entreeQuad' },
      { t: 1, v: 1, interpolation: 'lineaire' },
      { t: 2, v: 3 },
    ]);
    expect(p.valeur(0.5)).toBeCloseTo(0.25, 12);
    expect(p.valeur(1.5)).toBeCloseTo(2, 12);
  });

  it('filtre ressort : continu, dépasse avec ζ < 1, se stabilise sur la dernière clé, déterministe', () => {
    const p = creerPisteNombre(
      [
        { t: 0, v: 0 },
        { t: 0.2, v: 1, interpolation: 'constant' },
        { t: 0.4, v: 1 },
      ],
      { interpolation: 'constant', ressort: { f: 2, zeta: 0.35 } },
    );
    let max = -Infinity;
    let prec = p.valeur(0);
    for (let t = 0; t < 3; t += 0.001) {
      const v = p.valeur(t);
      expect(Math.abs(v - prec)).toBeLessThan(0.02);
      prec = v;
      max = Math.max(max, v);
    }
    expect(max).toBeGreaterThan(1.2);
    expect(p.valeur(30)).toBeCloseTo(1, 9);
    expect(p.valeur(1.234)).toBe(p.valeur(1.234));
  });

  it('filtre ressort sur un segment lisse : suit la courbe avec retard puis la rejoint', () => {
    const brute = creerPisteNombre(CLES, { interpolation: 'lisse' });
    const filtree = creerPisteNombre(CLES, { interpolation: 'lisse', ressort: { f: 6, zeta: 1 } });
    expect(Math.abs(filtree.valeur(1.8) - brute.valeur(1.8))).toBeLessThan(0.3);
    expect(filtree.valeur(20)).toBeCloseTo(1.5, 9);
  });

  it("piste d'angles : plus court chemin entre les clés", () => {
    const d = Math.PI / 180;
    const p = creerPisteAngle(
      [
        { t: 0, v: 170 * d },
        { t: 1, v: -170 * d },
      ],
      { interpolation: 'lineaire' },
    );
    expect(p.valeur(0.5)).toBeCloseTo(180 * d, 9);
    const e = creerPisteAngle(
      [
        { t: 0, v: 170 * d },
        { t: 1, v: -170 * d },
      ],
      { interpolation: 'lineaire', enrouler: true },
    );
    expect(e.valeur(1)).toBeCloseTo(-170 * d, 9);
  });

  it('piste Vec2 : composantes indépendantes', () => {
    const p = creerPisteVec2(
      [
        { t: 0, v: { x: 0, y: 10 } },
        { t: 2, v: { x: 4, y: 0 } },
      ],
      { interpolation: 'lineaire' },
    );
    expect(p.valeur(1)).toEqual({ x: 2, y: 5 });
    expect(p.vitesse(1)).toEqual({ x: 2, y: -5 });
  });

  it('tri stable des clés non triées', () => {
    const a = creerPisteNombre([...CLES].reverse());
    const b = creerPisteNombre(CLES);
    for (let t = 0; t < 3.5; t += 0.05) expect(a.valeur(t)).toBe(b.valeur(t));
  });
});
