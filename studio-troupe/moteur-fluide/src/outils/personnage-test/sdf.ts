/**
 * Formes par champ de distance signé (SDF), en px image : négatif dedans, positif dehors. Chaque forme porte sa
 * boîte englobante (pour ne calculer que les pixels utiles). Sert au dessin du personnage de test.
 * Formules écrites d'après la géométrie (distance à un segment, à un polygone, approximation de l'ellipse par
 * gradient), sans code tiers.
 */
import type { Vec2 } from '../../timeline/types';
import { bruitFractal2D } from '../../noyau/aleatoire';

/** Boîte [x0, y0, x1, y1]. */
export type Boite = readonly [number, number, number, number];

/** Forme : distance signée et boîte englobante. */
export interface Forme {
  readonly f: (x: number, y: number) => number;
  readonly boite: Boite;
}

const unionBoites = (a: Boite, b: Boite): Boite => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const interBoites = (a: Boite, b: Boite): Boite => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
const grossir = (a: Boite, r: number): Boite => [a[0] - r, a[1] - r, a[2] + r, a[3] + r];

/** Disque. */
export function cercle(c: Vec2, r: number): Forme {
  return { f: (x, y) => Math.hypot(x - c.x, y - c.y) - r, boite: [c.x - r, c.y - r, c.x + r, c.y + r] };
}

/** Ellipse de demi-axes (rx, ry), tournée de `angle` (approximation au premier ordre, exacte sur le bord). */
export function ellipse(c: Vec2, rx: number, ry: number, angle = 0): Forme {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const r = Math.max(rx, ry);
  return {
    f: (x, y) => {
      const dx = x - c.x;
      const dy = y - c.y;
      const u = ca * dx + sa * dy;
      const v = -sa * dx + ca * dy;
      const k0 = Math.hypot(u / rx, v / ry);
      const k1 = Math.hypot(u / (rx * rx), v / (ry * ry));
      if (k1 < 1e-9) return -Math.min(rx, ry);
      return (k0 * (k0 - 1)) / k1;
    },
    boite: [c.x - r, c.y - r, c.x + r, c.y + r],
  };
}

/** Capsule effilée du point a (rayon ra) au point b (rayon rb). */
export function capsule(a: Vec2, b: Vec2, ra: number, rb = ra): Forme {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const r = Math.max(ra, rb);
  return {
    f: (x, y) => {
      const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / l2));
      return Math.hypot(x - a.x - t * dx, y - a.y - t * dy) - (ra + (rb - ra) * t);
    },
    boite: [Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.max(a.x, b.x) + r, Math.max(a.y, b.y) + r],
  };
}

/** Rectangle arrondi centré, demi-tailles (hx, hy), tourné de `angle`. */
export function boite(c: Vec2, hx: number, hy: number, arrondi = 0, angle = 0): Forme {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const r = Math.hypot(hx, hy);
  return {
    f: (x, y) => {
      const dx = x - c.x;
      const dy = y - c.y;
      const u = Math.abs(ca * dx + sa * dy) - (hx - arrondi);
      const v = Math.abs(-sa * dx + ca * dy) - (hy - arrondi);
      return Math.hypot(Math.max(u, 0), Math.max(v, 0)) + Math.min(Math.max(u, v), 0) - arrondi;
    },
    boite: [c.x - r, c.y - r, c.x + r, c.y + r],
  };
}

/** Polygone simple (distance exacte, signe par la règle pair-impair). */
export function polygone(points: readonly Vec2[]): Forme {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    f: (x, y) => {
      let d2 = Number.POSITIVE_INFINITY;
      let dedans = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[j]!;
        const b = points[i]!;
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const wx = x - a.x;
        const wy = y - a.y;
        const t = Math.min(1, Math.max(0, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
        const qx = wx - ex * t;
        const qy = wy - ey * t;
        d2 = Math.min(d2, qx * qx + qy * qy);
        if (a.y > y !== b.y > y && x < a.x + ((y - a.y) * ex) / ey) dedans = !dedans;
      }
      const d = Math.sqrt(d2);
      return dedans ? -d : d;
    },
    boite: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
  };
}

/** Trait le long d'une polyligne, épaisseur (rayon) interpolée de r0 à r1 sur la longueur. */
export function trait(points: readonly Vec2[], r0: number, r1 = r0): Forme {
  const cumul = [0];
  for (let i = 1; i < points.length; i++) cumul.push(cumul[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  const total = cumul[cumul.length - 1]! || 1;
  const segs = points.slice(1).map((b, i) => capsule(points[i]!, b, r0 + ((r1 - r0) * cumul[i]!) / total, r0 + ((r1 - r0) * cumul[i + 1]!) / total));
  return union(...segs);
}

/** Courbe de Bézier quadratique échantillonnée (pour les traits). */
export function bezier2(a: Vec2, c: Vec2, b: Vec2, n = 12): Vec2[] {
  const r: Vec2[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const u = 1 - t;
    r.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  return r;
}

/** Union. */
export function union(...formes: Forme[]): Forme {
  return {
    f: (x, y) => {
      let d = Number.POSITIVE_INFINITY;
      for (const s of formes) {
        const v = s.f(x, y);
        if (v < d) d = v;
      }
      return d;
    },
    boite: formes.map((s) => s.boite).reduce(unionBoites),
  };
}

/** Union douce (minimum polynomial de largeur k). */
export function unionDouce(k: number, ...formes: Forme[]): Forme {
  return {
    f: (x, y) => {
      let d = formes[0]!.f(x, y);
      for (let i = 1; i < formes.length; i++) {
        const b = formes[i]!.f(x, y);
        const h = Math.max(k - Math.abs(d - b), 0) / k;
        d = Math.min(d, b) - (h * h * k) / 4;
      }
      return d;
    },
    boite: grossir(formes.map((s) => s.boite).reduce(unionBoites), k / 4),
  };
}

/** Intersection. */
export function inter(a: Forme, b: Forme): Forme {
  return { f: (x, y) => Math.max(a.f(x, y), b.f(x, y)), boite: interBoites(a.boite, b.boite) };
}

/** Intersection douce. */
export function interDouce(k: number, a: Forme, b: Forme): Forme {
  return {
    f: (x, y) => {
      const p = a.f(x, y);
      const q = b.f(x, y);
      const h = Math.max(k - Math.abs(p - q), 0) / k;
      return Math.max(p, q) + (h * h * k) / 4;
    },
    boite: interBoites(a.boite, b.boite),
  };
}

/** Différence a − b. */
export function moins(a: Forme, b: Forme): Forme {
  return { f: (x, y) => Math.max(a.f(x, y), -b.f(x, y)), boite: a.boite };
}

/** Différence douce. */
export function moinsDouce(k: number, a: Forme, b: Forme): Forme {
  return interDouce(k, a, { f: (x, y) => -b.f(x, y), boite: a.boite });
}

/** Gonfle (r > 0) ou creuse (r < 0) une forme. */
export function decaler(a: Forme, r: number): Forme {
  return { f: (x, y) => a.f(x, y) - r, boite: grossir(a.boite, Math.max(0, r)) };
}

/** Bord irrégulier : ajoute un bruit fractal d'amplitude `amp` px et d'échelle `echelle` px. */
export function bruiter(a: Forme, amp: number, echelle: number, graine: number): Forme {
  return { f: (x, y) => a.f(x, y) + amp * bruitFractal2D(x / echelle, y / echelle, graine, { octaves: 3 }), boite: grossir(a.boite, amp) };
}

/** Demi-plan « au-dessus » d'une courbe y = h(x) (dedans : y < h(x)). Distance approchée verticale. */
export function auDessus(h: (x: number) => number, boiteMax: Boite): Forme {
  return { f: (x, y) => y - h(x), boite: boiteMax };
}

/** Demi-plan « au-dessous » d'une courbe y = h(x). */
export function auDessous(h: (x: number) => number, boiteMax: Boite): Forme {
  return { f: (x, y) => h(x) - y, boite: boiteMax };
}

/** Miroir horizontal d'une forme autour de x = axe. */
export function miroir(a: Forme, axe: number): Forme {
  return {
    f: (x, y) => a.f(2 * axe - x, y),
    boite: [2 * axe - a.boite[2], a.boite[1], 2 * axe - a.boite[0], a.boite[3]],
  };
}
