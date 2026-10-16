/**
 * Cinématique directe (FK) : de la pose (écarts au repos, par os) aux matrices de peau de chaque os.
 * Module pur, sans allocation cachée entre deux appels.
 *
 * Modèle (rotation et position héritées, échelle NON héritée, comme les « segment scale compensate ») :
 * - `θ'_b = θ'_parent + rotation_b` (rotation absolue ajoutée au repos) ;
 * - `P'_b = K_parent(pivot_b) + R(θ'_parent)·translation_b` (le pivot suit le parent, y compris son étirement) ;
 *   pour la racine : `P'_b = pivot_b + translation_b` ;
 * - matrice de peau `K_b(x) = P'_b + R(θ'_b)·A_b·(x − pivot_b)`, où `A_b` est l'échelle de l'os exprimée dans SON
 *   repère de repos : `echelle.x` LE LONG de l'os (du pivot vers le bout : étirement), `echelle.y` en travers
 *   (épaisseur). Un enfant n'est donc jamais déformé par l'étirement de son parent ; il est seulement déplacé.
 * - partie rigide `M_b(x) = P'_b + R(θ'_b)·(x − pivot_b)` (sert au skinning CoR).
 *
 * Au repos (rotations 0, translations 0, échelles 1), toutes les matrices sont exactement l'identité.
 * Les limites `Os.limites` sont appliquées en contrainte douce (voir `limiterDoux`).
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
  /** Matrices de peau `K_b` (repos → posé), échelle propre de l'os comprise, dans l'ordre de `squelette.os`. */
  readonly peau: Mat2D[];
  /** Parties rigides `M_b` (sans l'échelle propre). */
  readonly rigide: Mat2D[];
  /** Rotation absolue ajoutée `θ'_b` (rad). */
  readonly angles: Float64Array;
  /** Pivots posés `P'_b`. */
  readonly pivots: Vec2[];
  /** Rotation locale effectivement appliquée (après limites), par os. */
  readonly rotationsLocales: Float64Array;
  /** Vrai si au moins un os a une échelle ≠ 1 (le skinning CoR mélange alors aussi les étirements). */
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
    const p = idx.parents[i]!;
    let px: number;
    let py: number;
    let theta: number;
    if (p < 0) {
      px = os.pivot.x + t.translation.x;
      py = os.pivot.y + t.translation.y;
      theta = rot;
    } else {
      const kp = peau[p]!;
      const tp = angles[p]!;
      const cp = Math.cos(tp);
      const sp = Math.sin(tp);
      px = kp.a * os.pivot.x + kp.c * os.pivot.y + kp.tx + cp * t.translation.x - sp * t.translation.y;
      py = kp.b * os.pivot.x + kp.d * os.pivot.y + kp.ty + sp * t.translation.x + cp * t.translation.y;
      theta = tp + rot;
    }
    angles[i] = theta;
    pivots[i] = { x: px, y: py };
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    // Partie rigide : R(θ)·(x − pivot) + P'.
    rigide[i] = { a: c, b: s, c: -s, d: c, tx: px - (c * os.pivot.x - s * os.pivot.y), ty: py - (s * os.pivot.x + c * os.pivot.y) };
    // Échelle dans le repère de l'os : A = R(α)·diag(sx, sy)·R(−α).
    const sx = t.echelle.x;
    const sy = t.echelle.y;
    if (sx === 1 && sy === 1) {
      peau[i] = rigide[i]!;
    } else {
      etire = true;
      const ca = Math.cos(os.angleRepos);
      const sa = Math.sin(os.angleRepos);
      const a11 = ca * ca * sx + sa * sa * sy;
      const a12 = ca * sa * (sx - sy);
      const a22 = sa * sa * sx + ca * ca * sy;
      // L = R(θ)·A ; disposition Pixi : x' = a·x + c·y + tx ; y' = b·x + d·y + ty.
      const la = c * a11 - s * a12;
      const lc = c * a12 - s * a22;
      const lb = s * a11 + c * a12;
      const ld = s * a12 + c * a22;
      peau[i] = { a: la, b: lb, c: lc, d: ld, tx: px - (la * os.pivot.x + lc * os.pivot.y), ty: py - (lb * os.pivot.x + ld * os.pivot.y) };
    }
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

/** Bout posé d'un os (extrémité, étirement compris). */
export function boutPose(squelette: Squelette, etat: EtatSquelette, i: number): Vec2 {
  const os = squelette.os[i]!;
  const m = etat.peau[i]!;
  const bx = os.pivot.x + Math.cos(os.angleRepos) * os.longueur;
  const by = os.pivot.y + Math.sin(os.angleRepos) * os.longueur;
  return { x: m.a * bx + m.c * by + m.tx, y: m.b * bx + m.d * by + m.ty };
}
