/**
 * Courbes de temps et de chemin : smoothstep, courbes d'accélération (easing), Bézier cubique (avec courbe de temps
 * à vitesse contrôlée, comme `cubic-bezier` CSS), Hermite cubique (valeur et vitesse imposées), Catmull-Rom
 * centripète (passe par les points, sans boucle ni rebroussement). Fonctions pures.
 */
import type { NomEasing, Vec2 } from '../timeline/types';

// ── Smoothstep ───────────────────────────────────────────────────────────────────────────────────────────────────

/** smoothstep borné : 0 avant `e0`, 1 après `e1`, `3u² − 2u³` entre (C¹). */
export function smoothstep(e0: number, e1: number, x: number): number {
  if (e0 === e1) return x < e0 ? 0 : 1;
  let u = (x - e0) / (e1 - e0);
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return u * u * (3 - 2 * u);
}

/** smootherstep borné : `6u⁵ − 15u⁴ + 10u³` (C², vitesse et accélération nulles aux bords). */
export function smootherstep(e0: number, e1: number, x: number): number {
  if (e0 === e1) return x < e0 ? 0 : 1;
  let u = (x - e0) / (e1 - e0);
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return u * u * u * (u * (u * 6 - 15) + 10);
}

// ── Courbes d'accélération ───────────────────────────────────────────────────────────────────────────────────────

/** Courbe d'accélération : `[0, 1] → ℝ`, avec f(0) = 0 et f(1) = 1. */
export type Easing = (u: number) => number;

/** Dépassement par défaut des courbes « dos » (≈ 10 %). */
export const DEPASSEMENT_DOS = 1.70158;

/** Courbe « entrée dos » paramétrable : recule de `s` avant de partir (anticipation). */
export function entreeDos(s = DEPASSEMENT_DOS): Easing {
  return (u) => u * u * ((s + 1) * u - s);
}

/** Courbe « sortie dos » paramétrable : dépasse puis revient (dépassement contrôlé). */
export function sortieDos(s = DEPASSEMENT_DOS): Easing {
  return (u) => {
    const v = u - 1;
    return 1 + v * v * ((s + 1) * v + s);
  };
}

/** Courbe « entrée-sortie dos » paramétrable. */
export function entreeSortieDos(s = DEPASSEMENT_DOS): Easing {
  const k = s * 1.525;
  return (u) => {
    const v = u * 2;
    if (v < 1) return 0.5 * (v * v * ((k + 1) * v - k));
    const w = v - 2;
    return 0.5 * (w * w * ((k + 1) * w + k) + 2);
  };
}

function rebondSortie(u: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (u < 1 / d) return n * u * u;
  if (u < 2 / d) {
    const v = u - 1.5 / d;
    return n * v * v + 0.75;
  }
  if (u < 2.5 / d) {
    const v = u - 2.25 / d;
    return n * v * v + 0.9375;
  }
  const v = u - 2.625 / d;
  return n * v * v + 0.984375;
}

/**
 * Courbe de temps Bézier cubique `cubic-bezier(x1, y1, x2, y2)` (points extrêmes (0,0) et (1,1)).
 * `x1`, `x2` doivent être dans `[0, 1]` (fonction du temps bien définie) ; `y1`, `y2` libres (dépassement possible).
 * Inversion de x(s) = u par Newton (6 itérations) avec repli par dichotomie : résultat déterministe.
 */
export function courbeBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  if (!(x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1)) {
    throw new Error(`courbeBezier : x1 et x2 doivent être dans [0, 1] (reçu ${x1}, ${x2})`);
  }
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const X = (s: number) => ((ax * s + bx) * s + cx) * s;
  const dX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  const Y = (s: number) => ((ay * s + by) * s + cy) * s;
  const resoudre = (u: number): number => {
    let s = u;
    for (let i = 0; i < 6; i++) {
      const e = X(s) - u;
      if (Math.abs(e) < 1e-12) return s;
      const d = dX(s);
      if (Math.abs(d) < 1e-9) break;
      s -= e / d;
    }
    let lo = 0;
    let hi = 1;
    s = u;
    for (let i = 0; i < 60; i++) {
      const e = X(s) - u;
      if (Math.abs(e) < 1e-12) break;
      if (e > 0) hi = s;
      else lo = s;
      s = 0.5 * (lo + hi);
    }
    return s;
  };
  return (u) => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    return Y(resoudre(u));
  };
}

/** Préréglages CSS (W3C css-easing-1). */
export const BEZIER_CSS = {
  ease: [0.25, 0.1, 0.25, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
} as const;

/** Garantit des extrémités exactes : f(u ≤ 0) = 0 et f(u ≥ 1) = 1 (raccords sans micro-saut). */
function exacte(f: Easing): Easing {
  return (u) => (u <= 0 ? 0 : u >= 1 ? 1 : f(u));
}

const COURBES: Record<NomEasing, Easing> = {
  lineaire: (u) => u,
  lisse: (u) => u * u * (3 - 2 * u),
  tresLisse: (u) => u * u * u * (u * (u * 6 - 15) + 10),
  entreeQuad: (u) => u * u,
  sortieQuad: (u) => u * (2 - u),
  entreeSortieQuad: (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)),
  entreeCubique: (u) => u * u * u,
  sortieCubique: (u) => 1 - (1 - u) ** 3,
  entreeSortieCubique: (u) => (u < 0.5 ? 4 * u * u * u : 1 - 4 * (1 - u) ** 3),
  entreeQuart: (u) => u ** 4,
  sortieQuart: (u) => 1 - (1 - u) ** 4,
  entreeSortieQuart: (u) => (u < 0.5 ? 8 * u ** 4 : 1 - 8 * (1 - u) ** 4),
  entreeSinus: (u) => 1 - Math.cos((u * Math.PI) / 2),
  sortieSinus: (u) => Math.sin((u * Math.PI) / 2),
  entreeSortieSinus: (u) => 0.5 * (1 - Math.cos(Math.PI * u)),
  entreeExpo: (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 2 ** (10 * u - 10)),
  sortieExpo: (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - 2 ** (-10 * u)),
  entreeSortieExpo: (u) =>
    u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 2 ** (20 * u - 10) / 2 : (2 - 2 ** (-20 * u + 10)) / 2,
  entreeDos: entreeDos(),
  sortieDos: sortieDos(),
  entreeSortieDos: entreeSortieDos(),
  sortieElastique: (u) => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    return 2 ** (-10 * u) * Math.sin((u * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  sortieRebond: rebondSortie,
  cssEase: courbeBezier(...BEZIER_CSS.ease),
  cssEntree: courbeBezier(...BEZIER_CSS.easeIn),
  cssSortie: courbeBezier(...BEZIER_CSS.easeOut),
  cssEntreeSortie: courbeBezier(...BEZIER_CSS.easeInOut),
};

/** Table de toutes les courbes nommées (extrémités exactes). */
export const EASINGS: Readonly<Record<NomEasing, Easing>> = Object.freeze(
  Object.fromEntries(Object.entries(COURBES).map(([nom, f]) => [nom, exacte(f)])) as Record<NomEasing, Easing>,
);

/** Applique la courbe nommée à `u` borné dans `[0, 1]`. */
export function appliquerEasing(nom: NomEasing, u: number): number {
  const v = u < 0 ? 0 : u > 1 ? 1 : u;
  return EASINGS[nom](v);
}

/** Vrai si `nom` est une courbe connue. */
export function estNomEasing(nom: string): nom is NomEasing {
  return Object.prototype.hasOwnProperty.call(EASINGS, nom);
}

// ── Bézier cubique (chemins) ─────────────────────────────────────────────────────────────────────────────────────

/** Bézier cubique scalaire au paramètre `s ∈ [0, 1]`. */
export function bezierCubique(p0: number, p1: number, p2: number, p3: number, s: number): number {
  const m = 1 - s;
  return m * m * m * p0 + 3 * m * m * s * p1 + 3 * m * s * s * p2 + s * s * s * p3;
}

/** Dérivée (par rapport à `s`) de la Bézier cubique scalaire. */
export function bezierCubiqueDerivee(p0: number, p1: number, p2: number, p3: number, s: number): number {
  const m = 1 - s;
  return 3 * m * m * (p1 - p0) + 6 * m * s * (p2 - p1) + 3 * s * s * (p3 - p2);
}

/** Bézier cubique 2D (chemin d'une main, d'une caméra). */
export function bezierCubique2D(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, s: number): Vec2 {
  return {
    x: bezierCubique(p0.x, p1.x, p2.x, p3.x, s),
    y: bezierCubique(p0.y, p1.y, p2.y, p3.y, s),
  };
}

// ── Hermite cubique ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Hermite cubique sur un segment de durée `h` (s) : valeur `p0` et vitesse `v0` (unités/s) au départ, `p1` et `v1`
 * à l'arrivée ; `u ∈ [0, 1]` est la fraction du segment. `v0 = v1 = 0` donne le slow-in / slow-out.
 */
export function hermite(p0: number, v0: number, p1: number, v1: number, u: number, h = 1): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * v0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * h * v1;
}

/** Vitesse (unités/s) de l'Hermite `hermite(…)` au même point. */
export function hermiteVitesse(p0: number, v0: number, p1: number, v1: number, u: number, h = 1): number {
  const u2 = u * u;
  const d = (6 * u2 - 6 * u) * p0 + (3 * u2 - 4 * u + 1) * h * v0 + (-6 * u2 + 6 * u) * p1 + (3 * u2 - 2 * u) * h * v1;
  return h > 0 ? d / h : 0;
}

/** Accélération (unités/s²) de l'Hermite. */
export function hermiteAcceleration(p0: number, v0: number, p1: number, v1: number, u: number, h = 1): number {
  const d2 = (12 * u - 6) * p0 + (6 * u - 4) * h * v0 + (-12 * u + 6) * p1 + (6 * u - 2) * h * v1;
  return h > 0 ? d2 / (h * h) : 0;
}

/** Hermite cubique 2D. */
export function hermite2D(p0: Vec2, v0: Vec2, p1: Vec2, v1: Vec2, u: number, h = 1): Vec2 {
  return { x: hermite(p0.x, v0.x, p1.x, v1.x, u, h), y: hermite(p0.y, v0.y, p1.y, v1.y, u, h) };
}

// ── Catmull-Rom centripète ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Point du segment `p1 → p2` d'une Catmull-Rom paramétrée par `alpha` (0 uniforme, **0,5 centripète**, 1 cordale),
 * `s ∈ [0, 1]`. Formulation pyramidale (Barry-Goldman) : passe exactement par `p1` (s = 0) et `p2` (s = 1).
 */
export function catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, s: number, alpha = 0.5): Vec2 {
  const ecart = (a: Vec2, b: Vec2) => {
    const d = Math.hypot(b.x - a.x, b.y - a.y) ** alpha;
    return d < 1e-9 ? 1e-9 : d;
  };
  const t0 = 0;
  const t1 = t0 + ecart(p0, p1);
  const t2 = t1 + ecart(p1, p2);
  const t3 = t2 + ecart(p2, p3);
  const t = t1 + (t2 - t1) * s;
  const melange = (a: Vec2, b: Vec2, ta: number, tb: number): Vec2 => {
    const w = (t - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
  };
  const A1 = melange(p0, p1, t0, t1);
  const A2 = melange(p1, p2, t1, t2);
  const A3 = melange(p2, p3, t2, t3);
  const B1 = melange(A1, A2, t0, t2);
  const B2 = melange(A2, A3, t1, t3);
  return melange(B1, B2, t1, t2);
}

/**
 * Chemin Catmull-Rom centripète à travers `points` (≥ 2), au paramètre global `s ∈ [0, n − 1]` (segment
 * `floor(s)`). Les extrémités sont prolongées par réflexion du point voisin.
 */
export function cheminCatmullRom(points: readonly Vec2[], s: number, alpha = 0.5): Vec2 {
  const n = points.length;
  if (n === 0) throw new Error('cheminCatmullRom : aucun point');
  if (n === 1) return { ...points[0]! };
  const sMax = n - 1;
  const sc = s < 0 ? 0 : s > sMax ? sMax : s;
  let i = Math.floor(sc);
  if (i >= n - 1) i = n - 2;
  const u = sc - i;
  const p1 = points[i]!;
  const p2 = points[i + 1]!;
  const p0 = i > 0 ? points[i - 1]! : { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
  const p3 = i + 2 < n ? points[i + 2]! : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
  return catmullRom(p0, p1, p2, p3, u, alpha);
}

/**
 * Tangentes de Catmull-Rom pour des clés **datées** `(t_k, v_k)` irrégulières (pentes en unités/s), utilisées par
 * le mode `lisse` des pistes : pente moyenne pondérée des deux segments voisins (Hermite C¹, passe par les clés).
 * - `extremites: 'nulles'` (défaut) : pente nulle à la première et à la dernière clé, pour enchaîner sans à-coup
 *   avec la tenue avant et après la piste ; `'libres'` : pente du seul segment voisin.
 * - `monotone: true` : bride les pentes (Fritsch-Carlson) pour ne jamais dépasser les clés.
 */
export function pentesCatmullRom(
  ts: readonly number[],
  vs: readonly number[],
  options: { extremites?: 'nulles' | 'libres'; monotone?: boolean } = {},
): number[] {
  const { extremites = 'nulles', monotone = false } = options;
  const n = ts.length;
  const r = new Array<number>(n).fill(0);
  if (n < 2) return r;
  const pente = (k: number) => (vs[k + 1]! - vs[k]!) / Math.max(1e-9, ts[k + 1]! - ts[k]!);
  for (let k = 0; k < n; k++) {
    if (k === 0) r[k] = extremites === 'nulles' ? 0 : pente(0);
    else if (k === n - 1) r[k] = extremites === 'nulles' ? 0 : pente(n - 2);
    else {
      const h0 = Math.max(1e-9, ts[k]! - ts[k - 1]!);
      const h1 = Math.max(1e-9, ts[k + 1]! - ts[k]!);
      const d0 = pente(k - 1);
      const d1 = pente(k);
      r[k] = (h1 * d0 + h0 * d1) / (h0 + h1);
      if (monotone) {
        if (d0 * d1 <= 0) r[k] = 0;
        else {
          const lim = 3 * Math.min(Math.abs(d0), Math.abs(d1));
          if (Math.abs(r[k]!) > lim) r[k] = Math.sign(r[k]!) * lim;
        }
      }
    }
  }
  return r;
}
