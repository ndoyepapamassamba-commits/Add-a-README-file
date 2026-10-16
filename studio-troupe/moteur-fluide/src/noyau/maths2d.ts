/**
 * Maths 2D du moteur : vecteurs, angles, matrices affines. Fonctions pures, sans allocation cachée autre que les
 * objets retournés. Convention : y vers le bas, angle positif = sens horaire à l'écran (comme PixiJS).
 */
import type { Mat2D, Transform2D, Vec2 } from '../timeline/types';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

// ── Scalaires ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Borne `x` dans `[min, max]`. */
export function borner(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

/** Interpolation linéaire. */
export function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

/** Inverse de `lerp` : position de `x` entre `a` et `b` (non bornée). */
export function inverseLerp(a: number, b: number, x: number): number {
  return a === b ? 0 : (x - a) / (b - a);
}

/** Reprojette `x` de `[a0, a1]` vers `[b0, b1]` (non borné). */
export function reprojeter(x: number, a0: number, a1: number, b0: number, b1: number): number {
  return lerp(b0, b1, inverseLerp(a0, a1, x));
}

/** Degrés → radians. */
export function enRadians(deg: number): number {
  return deg * DEG;
}

/** Radians → degrés. */
export function enDegres(rad: number): number {
  return rad / DEG;
}

// ── Angles ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Ramène un angle dans `]−π, π]`. */
export function enroulerAngle(a: number): number {
  let r = a % TAU;
  if (r <= -Math.PI) r += TAU;
  else if (r > Math.PI) r -= TAU;
  return r;
}

/** Plus court écart angulaire de `a` vers `b`, dans `]−π, π]`. */
export function ecartAngle(a: number, b: number): number {
  return enroulerAngle(b - a);
}

/** Interpolation d'angle par le plus court chemin (résultat non enroulé, continu depuis `a`). */
export function lerpAngle(a: number, b: number, u: number): number {
  return a + ecartAngle(a, b) * u;
}

// ── Vecteurs ─────────────────────────────────────────────────────────────────────────────────────────────────────

export function v2(x = 0, y = 0): Vec2 {
  return { x, y };
}
export function ajouter(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
export function soustraire(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
export function multiplier(a: Vec2, k: number): Vec2 {
  return { x: a.x * k, y: a.y * k };
}
/** Produit composante par composante. */
export function multiplierComposantes(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x * b.x, y: a.y * b.y };
}
export function scalaire(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}
/** Produit vectoriel 2D (composante z). */
export function vectoriel(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}
export function longueur(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}
export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
/** Vecteur unitaire (le vecteur nul reste nul). */
export function normaliser(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y);
  return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}
export function lerpV(a: Vec2, b: Vec2, u: number): Vec2 {
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}
/** Rotation d'un vecteur de `angle` rad autour de l'origine. */
export function tourner(a: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: c * a.x - s * a.y, y: s * a.x + c * a.y };
}
/** Rotation d'un point autour d'un pivot. */
export function tournerAutour(p: Vec2, pivot: Vec2, angle: number): Vec2 {
  return ajouter(pivot, tourner(soustraire(p, pivot), angle));
}
/** Perpendiculaire (rotation de +90°). */
export function perpendiculaire(a: Vec2): Vec2 {
  return { x: -a.y, y: a.x };
}
/** Angle du vecteur (atan2). */
export function angleDe(a: Vec2): number {
  return Math.atan2(a.y, a.x);
}
/** Vecteur unitaire d'angle donné. */
export function direction(angle: number): Vec2 {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

// ── Matrices affines ─────────────────────────────────────────────────────────────────────────────────────────────

export function identite(): Mat2D {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

/** Produit `m·n` (applique `n` d'abord, puis `m`). */
export function composer(m: Mat2D, n: Mat2D): Mat2D {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    tx: m.a * n.tx + m.c * n.ty + m.tx,
    ty: m.b * n.tx + m.d * n.ty + m.ty,
  };
}

/** Applique la matrice à un point. */
export function appliquer(m: Mat2D, p: Vec2): Vec2 {
  return { x: m.a * p.x + m.c * p.y + m.tx, y: m.b * p.x + m.d * p.y + m.ty };
}

/** Applique la partie linéaire seulement (vecteur, sans translation). */
export function appliquerVecteur(m: Mat2D, v: Vec2): Vec2 {
  return { x: m.a * v.x + m.c * v.y, y: m.b * v.x + m.d * v.y };
}

/** Déterminant de la partie linéaire. */
export function determinant(m: Mat2D): number {
  return m.a * m.d - m.b * m.c;
}

/** Inverse (lève une erreur si la matrice est singulière). */
export function inverser(m: Mat2D): Mat2D {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-14) throw new Error('Matrice singulière : inversion impossible');
  const id = 1 / det;
  const a = m.d * id;
  const b = -m.b * id;
  const c = -m.c * id;
  const d = m.a * id;
  return { a, b, c, d, tx: -(a * m.tx + c * m.ty), ty: -(b * m.tx + d * m.ty) };
}

export function translation(tx: number, ty: number): Mat2D {
  return { a: 1, b: 0, c: 0, d: 1, tx, ty };
}

export function rotation(angle: number): Mat2D {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { a: c, b: s, c: -s, d: c, tx: 0, ty: 0 };
}

export function echelle(sx: number, sy: number = sx): Mat2D {
  return { a: sx, b: 0, c: 0, d: sy, tx: 0, ty: 0 };
}

/** Matrice d'une `Transform2D` : `T·R·S`. */
export function depuisTransform(t: Transform2D): Mat2D {
  const c = Math.cos(t.rotation);
  const s = Math.sin(t.rotation);
  return {
    a: c * t.echelle.x,
    b: s * t.echelle.x,
    c: -s * t.echelle.y,
    d: c * t.echelle.y,
    tx: t.position.x,
    ty: t.position.y,
  };
}

/**
 * Transformation `T·R·S` appliquée autour d'un pivot : `p' = pivot + T + R·S·(p − pivot)`.
 */
export function autourDuPivot(pivot: Vec2, t: Transform2D): Mat2D {
  const m = depuisTransform({ position: v2(0, 0), rotation: t.rotation, echelle: t.echelle });
  return composer(translation(pivot.x + t.position.x, pivot.y + t.position.y), composer(m, translation(-pivot.x, -pivot.y)));
}

/**
 * Décompose une matrice en `T·R·S` (sans cisaillement : le cisaillement éventuel est perdu).
 * Un déterminant négatif est porté par `echelle.y < 0`.
 */
export function decomposer(m: Mat2D): Transform2D {
  const sx = Math.hypot(m.a, m.b);
  const rot = Math.atan2(m.b, m.a);
  const det = m.a * m.d - m.b * m.c;
  const sy = sx > 0 ? det / sx : Math.hypot(m.c, m.d);
  return { position: v2(m.tx, m.ty), rotation: rot, echelle: v2(sx, sy) };
}

/** Interpolation de deux transformations (angle par le plus court chemin). */
export function lerpTransform(a: Transform2D, b: Transform2D, u: number): Transform2D {
  return {
    position: lerpV(a.position, b.position, u),
    rotation: lerpAngle(a.rotation, b.rotation, u),
    echelle: lerpV(a.echelle, b.echelle, u),
  };
}

// ── Géométrie ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Aire signée d'un triangle (positive si sommets dans le sens horaire à l'écran, y vers le bas). */
export function aireTriangle(a: Vec2, b: Vec2, c: Vec2): number {
  return 0.5 * ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));
}

/** Aire signée d'un polygone (formule du lacet). */
export function airePolygone(points: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % n]!;
    s += p.x * q.y - q.x * p.y;
  }
  return 0.5 * s;
}

/** Coordonnées barycentriques de `p` dans le triangle `abc` (`null` si dégénéré). */
export function barycentriques(p: Vec2, a: Vec2, b: Vec2, c: Vec2): [number, number, number] | null {
  const d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(d) < 1e-14) return null;
  const l1 = ((b.y - c.y) * (p.x - c.x) + (c.x - b.x) * (p.y - c.y)) / d;
  const l2 = ((c.y - a.y) * (p.x - c.x) + (a.x - c.x) * (p.y - c.y)) / d;
  return [l1, l2, 1 - l1 - l2];
}

/** Vrai si `p` est dans le triangle `abc` (bords inclus, tolérance `eps`). */
export function dansTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2, eps = 1e-12): boolean {
  const l = barycentriques(p, a, b, c);
  return l !== null && l[0] >= -eps && l[1] >= -eps && l[2] >= -eps;
}

/** Vrai si `p` est dans le polygone (règle pair-impair). */
export function dansPolygone(p: Vec2, points: readonly Vec2[]): boolean {
  let dedans = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

/** Boîte englobante d'un nuage de points. */
export function boiteEnglobante(points: readonly Vec2[]): { min: Vec2; max: Vec2 } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { min: v2(x0, y0), max: v2(x1, y1) };
}
