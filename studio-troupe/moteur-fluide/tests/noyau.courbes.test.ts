import { describe, expect, it } from 'vitest';
import {
  BEZIER_CSS,
  EASINGS,
  appliquerEasing,
  bezierCubique,
  catmullRom,
  cheminCatmullRom,
  courbeBezier,
  hermite,
  hermiteAcceleration,
  hermiteVitesse,
  pentesCatmullRom,
  smootherstep,
  smoothstep,
} from '../src/noyau/courbes';
import type { NomEasing, Vec2 } from '../src/timeline/types';

describe('courbes d’accélération', () => {
  for (const nom of Object.keys(EASINGS) as NomEasing[]) {
    it(`${nom} : f(0) = 0 et f(1) = 1, valeurs finies`, () => {
      const f = EASINGS[nom];
      expect(Math.abs(f(0))).toBeLessThan(1e-9);
      expect(Math.abs(f(1) - 1)).toBeLessThan(1e-9);
      for (let u = 0; u <= 1; u += 0.01) expect(Number.isFinite(f(u))).toBe(true);
    });
  }

  it('appliquerEasing borne u dans [0, 1]', () => {
    expect(appliquerEasing('sortieDos', -3)).toBe(0);
    expect(appliquerEasing('sortieDos', 4)).toBe(1);
  });

  it('les courbes « dos » anticipent et dépassent', () => {
    let min = 0;
    let max = 0;
    for (let u = 0; u <= 1; u += 0.001) {
      min = Math.min(min, EASINGS.entreeDos(u));
      max = Math.max(max, EASINGS.sortieDos(u));
    }
    expect(min).toBeLessThan(-0.05);
    expect(max).toBeGreaterThan(1.05);
  });

  it('smoothstep et smootherstep : bornes, milieu, saturation', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(2, 4, 3)).toBe(0.5);
    expect(smootherstep(0, 1, 0.5)).toBe(0.5);
    expect(smootherstep(0, 1, 0)).toBe(0);
    expect(smootherstep(0, 1, 1)).toBe(1);
  });
});

describe('Bézier cubique', () => {
  it('cubic-bezier linéaire = identité', () => {
    const f = courbeBezier(0, 0, 1, 1);
    for (let u = 0; u <= 1; u += 0.05) expect(f(u)).toBeCloseTo(u, 9);
  });

  it('ease-in-out symétrique : f(0,5) = 0,5 et monotone', () => {
    const f = courbeBezier(...BEZIER_CSS.easeInOut);
    expect(f(0.5)).toBeCloseTo(0.5, 9);
    let prec = -1;
    for (let u = 0; u <= 1; u += 0.001) {
      const y = f(u);
      expect(y).toBeGreaterThanOrEqual(prec - 1e-12);
      prec = y;
    }
  });

  it('la courbe de temps retombe sur la Bézier paramétrique', () => {
    const [x1, y1, x2, y2] = [0.3, -0.4, 0.7, 1.4];
    const f = courbeBezier(x1, y1, x2, y2);
    for (let s = 0.05; s < 1; s += 0.1) {
      const x = bezierCubique(0, x1, x2, 1, s);
      const y = bezierCubique(0, y1, y2, 1, s);
      expect(f(x)).toBeCloseTo(y, 9);
    }
  });

  it('refuse x hors de [0, 1]', () => {
    expect(() => courbeBezier(-0.1, 0, 1, 1)).toThrow(/x1 et x2/);
  });
});

describe('Hermite cubique', () => {
  it('passe par les extrémités avec les vitesses imposées', () => {
    const [p0, v0, p1, v1, h] = [2, -3, 5, 1.5, 0.8];
    expect(hermite(p0, v0, p1, v1, 0, h)).toBe(p0);
    expect(hermite(p0, v0, p1, v1, 1, h)).toBeCloseTo(p1, 12);
    expect(hermiteVitesse(p0, v0, p1, v1, 0, h)).toBeCloseTo(v0, 12);
    expect(hermiteVitesse(p0, v0, p1, v1, 1, h)).toBeCloseTo(v1, 12);
  });

  it('vitesse et accélération cohérentes avec les différences finies', () => {
    const [p0, v0, p1, v1, h] = [0, 4, 1, -2, 0.5];
    const d = 1e-6;
    for (const u of [0.1, 0.4, 0.77]) {
      const dv = (hermite(p0, v0, p1, v1, u + d, h) - hermite(p0, v0, p1, v1, u - d, h)) / (2 * d * h);
      const da = (hermiteVitesse(p0, v0, p1, v1, u + d, h) - hermiteVitesse(p0, v0, p1, v1, u - d, h)) / (2 * d * h);
      expect(hermiteVitesse(p0, v0, p1, v1, u, h)).toBeCloseTo(dv, 5);
      expect(hermiteAcceleration(p0, v0, p1, v1, u, h)).toBeCloseTo(da, 3);
    }
  });
});

describe('Catmull-Rom centripète', () => {
  const points: Vec2[] = [
    { x: 0, y: 0 },
    { x: 1, y: 2 },
    { x: 1.1, y: 2.05 },
    { x: 4, y: -1 },
    { x: 5, y: 0 },
  ];

  it('passe exactement par tous les points', () => {
    for (let i = 0; i < points.length; i++) {
      const p = cheminCatmullRom(points, i);
      expect(p.x).toBeCloseTo(points[i]!.x, 9);
      expect(p.y).toBeCloseTo(points[i]!.y, 9);
    }
  });

  it('est continue aux jonctions de segments', () => {
    for (let i = 1; i < points.length - 1; i++) {
      const a = cheminCatmullRom(points, i - 1e-9);
      const b = cheminCatmullRom(points, i + 1e-9);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);
    }
  });

  it('reste finie avec des points confondus', () => {
    const p = catmullRom({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }, 0.5);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });

  it('ne forme pas de boucle sur un segment court entre deux longs (centripète)', () => {
    // Segment court p1→p2 encadré de longs segments : la paramétrisation uniforme y fait une boucle.
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 10, y: 0 };
    const p2 = { x: 10.5, y: 0.2 };
    const p3 = { x: 0, y: 1 };
    const echantillons = Array.from({ length: 201 }, (_, k) => catmullRom(p0, p1, p2, p3, k / 200, 0.5));
    const xMax = Math.max(...echantillons.map((p) => p.x));
    expect(xMax).toBeLessThan(10.5 + 0.5); // pas d'excursion lointaine
  });

  it('pentes de Catmull-Rom : nulles aux extrémités par défaut, monotones sur demande', () => {
    const ts = [0, 1, 2, 3];
    const vs = [0, 1, 1, 2];
    const p = pentesCatmullRom(ts, vs);
    expect(p[0]).toBe(0);
    expect(p[3]).toBe(0);
    const m = pentesCatmullRom(ts, vs, { monotone: true });
    expect(m[1]).toBe(0);
    expect(m[2]).toBe(0);
  });
});
