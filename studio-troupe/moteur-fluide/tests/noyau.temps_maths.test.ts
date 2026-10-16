import { describe, expect, it } from 'vitest';
import {
  imageVersTemps,
  instantsImages,
  lireTimecode,
  nombreImages,
  sousInstants,
  tempsVersImage,
  timecode,
} from '../src/noyau/temps';
import {
  appliquer,
  autourDuPivot,
  composer,
  decomposer,
  depuisTransform,
  ecartAngle,
  enroulerAngle,
  identite,
  inverser,
  lerpAngle,
  tourner,
} from '../src/noyau/maths2d';

describe('temps', () => {
  it('image ↔ temps sans dérive à 24, 25, 29,97, 30 et 60 i/s', () => {
    for (const fps of [24, 25, 30000 / 1001, 30, 60]) {
      for (let n = 0; n < 200000; n += 7) {
        expect(tempsVersImage(imageVersTemps(n, fps), fps)).toBe(n);
      }
    }
  });

  it("nombre d'images et liste des instants", () => {
    expect(nombreImages(6, 30)).toBe(180);
    expect(nombreImages(1 / 3, 30)).toBe(10);
    expect(nombreImages(0.1, 30)).toBe(3);
    expect(nombreImages(0, 30)).toBe(0);
    const ts = instantsImages(1, 30);
    expect(ts.length).toBe(30);
    expect(ts[29]).toBe(29 / 30);
  });

  it('timecode et lecture inverse', () => {
    expect(timecode(0, 30)).toBe('00:00:00:00');
    expect(timecode(61.5, 30)).toBe('00:01:01:15');
    expect(timecode(3661 + 29 / 30, 30)).toBe('01:01:01:29');
    expect(lireTimecode('00:01:01:15', 30)).toBeCloseTo(61.5, 12);
    expect(() => lireTimecode('abc', 30)).toThrow(/illisible/);
  });

  it("sous-instants d'obturation : premier = t, N valeurs, bornés au plan", () => {
    const s = sousInstants(1, 30, 4, 0.5);
    expect(s.length).toBe(4);
    expect(s[0]).toBe(1);
    expect(s[3]).toBeCloseTo(1 + (3 * 0.5) / 30 / 4, 12);
    const b = sousInstants(3.99, 30, 8, 1, { debut: 0, fin: 4 });
    for (const t of b) expect(t).toBeLessThan(4);
    expect(sousInstants(2, 30, 1, 0.5)).toEqual([2]);
  });

  it('refuse une cadence invalide', () => {
    expect(() => imageVersTemps(1, 0)).toThrow(/Cadence/);
  });
});

describe('maths 2D', () => {
  it('angles : enroulement et plus court chemin', () => {
    expect(enroulerAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(enroulerAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(ecartAngle(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 12);
    expect(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(Math.PI, 12);
  });

  it('rotation : angle positif = sens horaire à l’écran (y vers le bas)', () => {
    const p = tourner({ x: 1, y: 0 }, Math.PI / 2);
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(1, 12); // vers le bas de l'écran
  });

  it('composition, inverse et décomposition', () => {
    const m = depuisTransform({ position: { x: 3, y: -2 }, rotation: 0.7, echelle: { x: 2, y: 0.5 } });
    const id = composer(m, inverser(m));
    const ref = identite();
    for (const k of ['a', 'b', 'c', 'd', 'tx', 'ty'] as const) expect(id[k]).toBeCloseTo(ref[k], 12);
    const t = decomposer(m);
    expect(t.rotation).toBeCloseTo(0.7, 12);
    expect(t.echelle.x).toBeCloseTo(2, 12);
    expect(t.echelle.y).toBeCloseTo(0.5, 12);
    expect(t.position).toEqual({ x: 3, y: -2 });
  });

  it('transformation autour d’un pivot : le pivot ne bouge que de la translation', () => {
    const pivot = { x: 10, y: 20 };
    const m = autourDuPivot(pivot, { position: { x: 1, y: 2 }, rotation: 1.2, echelle: { x: 1.3, y: 0.7 } });
    const p = appliquer(m, pivot);
    expect(p.x).toBeCloseTo(11, 12);
    expect(p.y).toBeCloseTo(22, 12);
  });
});
