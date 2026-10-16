/**
 * Cinématique directe (FK) : de la pose (écarts au repos, par os) aux matrices de peau de chaque os.
 * Module pur.
 *
 * Modèle (contrat `TransformOs` de `timeline/types.ts`, lu à la lettre, comme `anim/`) :
 * - transformation locale d'un os, autour de son pivot de repos, dans le repère de son parent :
 *   `L_b = T(pivot_b + translation_b) · R(rotation_b) · S(echelle_b) · T(−pivot_b)` ;
 *   l'échelle agit sur les axes du repère du parent (au repos : axes de l'image ; `echelle.y` = hauteur), la
 *   translation est en px image du repère du parent ;
 * - composition hiérarchique : `K_b = K_parent · L_b` (rotation, translation ET échelle héritées par les enfants :
 *   écraser le torse écrase aussi la tête et les bras qu'il porte ; `anim/` compense au besoin) ;
 * - partie rigide `M_b(x) = K_b(pivot_b) + R(θ_b)·(x − pivot_b)`, où `θ_b` est l'angle de la décomposition polaire
 *   de la partie linéaire de `K_b` (forme close 2×2 : `θ = atan2(b − c, a + d)`). Elle sert au skinning CoR.
 *
 * Au repos (rotations 0, translations 0, échelles 1), toutes les matrices sont exactement l'identité.
 * Les limites `Os.limites` sont appliquées à la rotation en contrainte douce (voir `limiterDoux`).
 */
import type { Mat2D, Pose, Squelette, TransformOs, Vec2 } from '../timeline/types';
import { indexerSquelette } from './squelette';

/** Marge (rad) de la contrainte douce au-delà d'une limite. */
export const MARGE_LIMITE_DOUCE = 0.08;

/**
 * Contrainte douce dans `[min, max]` : identité à l'intérieur ; au-delà, la valeur s'approche de `limite ± marge`
 * sans l'atteindre (`limite + marge·tanh((x − limite)/marge)`), avec une dérivée continue (égale à 1 sur la limite).
 */
export function limiterDoux(x: number, min: number, max: number, marge = MARGE_LIMITE_DOUCE): number {
  if (x > max) return marge > 0 ? max + marge * Math.tanh((x - max) / marge) : max;
  if (x < min) return marge > 0 ? min - marge * Math.tanh((min - x) / marge) : min;
  return x;
}

/** État du squelette posé (px image, AVANT la transformation de racine de `Pose.racine`). */
export interface EtatSquelette {
  /** Matrices de peau `K_b` (repos → posé), dans l'ordre de `squelette.os`. */
  readonly peau: Mat2D[];
  /** Parties rigides `M_b` (rotation polaire de `K_b`, même image du pivot). */
  readonly rigide: Mat2D[];
  /** Angle de rotation (polaire) de `K_b` (rad). */
  readonly angles: Float64Array;
  /** Pivots posés `K_b(pivot_b)`. */
  readonly pivots: Vec2[];
  /** Rotation locale effectivement appliquée (après limites), par os. */
  readonly rotationsLocales: Float64Array;
  /** Vrai si une matrice de peau n'est pas rigide (échelle ≠ 1 quelque part) : le CoR mélange alors les étirements. */
  readonly etire: boolean;
}

/** Options de la FK. */
export interface OptionsFK {
  /** Appliquer les limites en contrainte douce (défaut : oui). */
  limites?: boolean;
  /** Marge de la contrainte douce (rad). */
  marge?: number;
}

const IDENTITE_OS: TransformOs = { rotation: 0, translation: { x: 0, y: 0 }, echelle: { x: 1, y: 1 } };

/** Transformation locale d'un os dans une pose (os absent ou champs manquants = repos). */
export function transformLocale(pose: Pose, nom: string): TransformOs {
  const t = pose.os[nom];
  if (!t) return IDENTITE_OS;
  return {
    rotation: Number.isFinite(t.rotation) ? t.rotation : 0,
    translation: t.translation ?? IDENTITE_OS.translation,
    echelle: t.echelle ?? IDENTITE_OS.echelle,
  };
}

/** Matrice locale `T(pivot + tr)·R(rot)·S(sx, sy)·T(−pivot)`. */
export function matriceLocale(pivot: Vec2, rotation: number, translation: Vec2, sx: number, sy: number): Mat2D {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const a = c * sx;
  const b = s * sx;
  const cc = -s * sy;
  const d = c * sy;
  return { a, b, c: cc, d, tx: pivot.x + translation.x - (a * pivot.x + cc * pivot.y), ty: pivot.y + translation.y - (b * pivot.x + d * pivot.y) };
}

function composer(m: Mat2D, n: Mat2D): Mat2D {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    tx: m.a * n.tx + m.c * n.ty + m.tx,
    ty: m.b * n.tx + m.d * n.ty + m.ty,
  };
}

/** Angle de la rotation polaire d'une matrice 2×2 (partie linéaire). */
export function anglePolaire(m: Mat2D): number {
  return Math.atan2(m.b - m.c, m.a + m.d);
}

/** Cinématique directe complète. */
export function calculerFK(squelette: Squelette, pose: Pose, options: OptionsFK = {}): EtatSquelette {
  const idx = indexerSquelette(squelette);
  const n = squelette.os.length;
  const avecLimites = options.limites ?? true;
  const marge = options.marge ?? MARGE_LIMITE_DOUCE;
  const peau: Mat2D[] = new Array(n);
  const rigide: Mat2D[] = new Array(n);
  const angles = new Float64Array(n);
  const pivots: Vec2[] = new Array(n);
  const rotationsLocales = new Float64Array(n);
  let etire = false;
  for (let i = 0; i < n; i++) {
    const os = squelette.os[i]!;
    const t = transformLocale(pose, os.nom);
    let rot = t.rotation;
    if (avecLimites && os.limites) rot = limiterDoux(rot, os.limites.min, os.limites.max, marge);
    rotationsLocales[i] = rot;
    if (t.echelle.x !== 1 || t.echelle.y !== 1) etire = true;
    const L = matriceLocale(os.pivot, rot, t.translation, t.echelle.x, t.echelle.y);
    const p = idx.parents[i]!;
    const K = p < 0 ? L : composer(peau[p]!, L);
    peau[i] = K;
    const px = K.a * os.pivot.x + K.c * os.pivot.y + K.tx;
    const py = K.b * os.pivot.x + K.d * os.pivot.y + K.ty;
    pivots[i] = { x: px, y: py };
    const theta = anglePolaire(K);
    angles[i] = theta;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    rigide[i] = { a: c, b: s, c: -s, d: c, tx: px - (c * os.pivot.x - s * os.pivot.y), ty: py - (s * os.pivot.x + c * os.pivot.y) };
  }
  return { peau, rigide, angles, pivots, rotationsLocales, etire };
}

/** Matrice de peau d'un os par son nom (identité si l'os n'existe pas). */
export function matriceOs(squelette: Squelette, etat: EtatSquelette, nom: string): Mat2D {
  const i = indexerSquelette(squelette).index.get(nom);
  return i === undefined ? { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } : etat.peau[i]!;
}

/** Position posée d'un point de repos attaché rigidement à un os (ancrages du visage, pieds, mains…). */
export function pointAttache(squelette: Squelette, etat: EtatSquelette, nom: string, p: Vec2): Vec2 {
  const m = matriceOs(squelette, etat, nom);
  return { x: m.a * p.x + m.c * p.y + m.tx, y: m.b * p.x + m.d * p.y + m.ty };
}

/** Bout posé d'un os (extrémité, échelles comprises). */
export function boutPose(squelette: Squelette, etat: EtatSquelette, i: number): Vec2 {
  const os = squelette.os[i]!;
  const m = etat.peau[i]!;
  const bx = os.pivot.x + Math.cos(os.angleRepos) * os.longueur;
  const by = os.pivot.y + Math.sin(os.angleRepos) * os.longueur;
  return { x: m.a * bx + m.c * by + m.tx, y: m.b * bx + m.d * by + m.ty };
}
