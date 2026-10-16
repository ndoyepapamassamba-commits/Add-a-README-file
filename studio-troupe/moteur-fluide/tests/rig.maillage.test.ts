import { describe, expect, it } from 'vitest';
import { distanceSignee, transformeeDistance } from '../src/rig/distance';
import { aireBoucle, construireMaillage, contoursIso, couvertureMasque, masqueAlpha, simplifierBoucle } from '../src/rig/maillage';
import { imageFigure } from './rig.figure';

describe('transformée de distance', () => {
  it('est exacte sur un point isolé', () => {
    const l = 21;
    const s = new Uint8Array(l * l);
    s[10 * l + 10] = 1;
    const d = transformeeDistance(s, l, l);
    for (let y = 0; y < l; y++) for (let x = 0; x < l; x++) expect(d[y * l + x]).toBeCloseTo(Math.hypot(x - 10, y - 10), 5);
  });

  it('donne un champ signé négatif dedans, positif dehors', () => {
    const l = 30;
    const m = new Uint8Array(l * l);
    for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) m[y * l + x] = 1;
    const sd = distanceSignee(m, l, l);
    expect(sd[15 * l + 15]!).toBeLessThan(0);
    expect(sd[15 * l + 10]!).toBeCloseTo(-0.5, 6);
    expect(sd[15 * l + 9]!).toBeCloseTo(0.5, 6);
    expect(sd[2 * l + 2]!).toBeGreaterThan(5);
  });
});

describe('contours (marching squares) et simplification', () => {
  it('trouve un disque, son aire et un trou', () => {
    const l = 80;
    const champ = new Float32Array(l * l);
    for (let y = 0; y < l; y++) {
      for (let x = 0; x < l; x++) {
        const r = Math.hypot(x + 0.5 - 40, y + 0.5 - 40);
        champ[y * l + x] = Math.max(r - 30, 12 - r); // anneau : disque de rayon 30 percé d'un trou de rayon 12
      }
    }
    const boucles = contoursIso(champ, l, l, 0);
    expect(boucles.length).toBe(2);
    const aires = boucles.map((b) => Math.abs(aireBoucle(b))).sort((a, b) => b - a);
    expect(aires[0]).toBeCloseTo(Math.PI * 900, -1);
    expect(aires[1]).toBeCloseTo(Math.PI * 144, -1);
    const s = simplifierBoucle(boucles[0]!, 0.5);
    expect(s.length).toBeLessThan(boucles[0]!.length);
    expect(Math.abs(aireBoucle(s))).toBeGreaterThan(0.98 * aires[0]!);
  });
});

describe('maillage depuis le masque', () => {
  const { image } = imageFigure();
  const brut = construireMaillage(image, { pas: 10 });

  it('couvre le masque (> 0,97) sans triangle dehors (au-delà de marge + fermeture = 3,5 px)', () => {
    const masque = masqueAlpha(image, 12);
    const c = couvertureMasque(brut.positions, brut.triangles, masque, image.largeur, image.hauteur, brut.distance, 3.5);
    expect(c.couverture).toBeGreaterThan(0.97);
    expect(c.trianglesDehors).toBe(0);
  });

  it('sans fermeture, aucun triangle n’est à plus de 2 px du masque', () => {
    const sans = construireMaillage(image, { pas: 10, fermeture: 0 });
    const c = couvertureMasque(sans.positions, sans.triangles, masqueAlpha(image, 12), image.largeur, image.hauteur, sans.distance, 2);
    expect(c.trianglesDehors).toBe(0);
    expect(c.couverture).toBeGreaterThan(0.999);
  });

  it('est conforme : tous les segments du contour sont des arêtes', () => {
    expect(brut.stats.segmentsManquants).toBe(0);
  });

  it('ne relie jamais le bras au torse par-dessus le vide', () => {
    // Le point (95, 250) est dans le vide entre le coude droit (x ≈ 80) et le torse (x ≥ 108).
    const px = 95;
    const py = 250;
    const t = brut.triangles;
    const p = brut.positions;
    let traverse = 0;
    for (let k = 0; k < t.length; k += 3) {
      const a = t[k]!;
      const b = t[k + 1]!;
      const c = t[k + 2]!;
      const ax = p[2 * a]!;
      const ay = p[2 * a + 1]!;
      const bx = p[2 * b]!;
      const by = p[2 * b + 1]!;
      const cx = p[2 * c]!;
      const cy = p[2 * c + 1]!;
      const d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      const d2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
      const d3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
      const neg = d1 < 0 || d2 < 0 || d3 < 0;
      const pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) traverse++;
    }
    expect(traverse).toBe(0);
  });

  it('a des triangles de bonne qualité et une densité adaptative', () => {
    expect(brut.stats.angleMinP5).toBeGreaterThan(18);
    const fin = construireMaillage(image, { pas: 10, zones: [{ centre: { x: 150, y: 68 }, rayon: 45, pas: 3.5 }] });
    expect(fin.stats.sommets).toBeGreaterThan(brut.stats.sommets + 60);
  });

  it('est déterministe', () => {
    const b2 = construireMaillage(image, { pas: 10 });
    expect(Array.from(b2.positions)).toEqual(Array.from(brut.positions));
    expect(Array.from(b2.triangles)).toEqual(Array.from(brut.triangles));
  });
});
