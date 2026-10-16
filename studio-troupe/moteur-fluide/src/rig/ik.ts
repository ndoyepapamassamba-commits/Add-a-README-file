/**
 * Cinématique inverse analytique à deux os (bras → avant-bras, cuisse → jambe), avec sens du pli, IK douce près de
 * l'extension (pas de « claquement » du coude) et respect des limites articulaires. Module pur.
 *
 * Le solveur part TOUJOURS de la pose FK du même instant (jamais d'une image précédente) : le résultat est une
 * fonction pure de (squelette, pose, cible).
 *
 * Sens du pli (`plier`) : `+1` = l'os inférieur tourne dans le sens HORAIRE par rapport à l'os supérieur (angle
 * relatif positif, y vers le bas). De face, le bras GAUCHE du personnage (à droite de l'image) plie à `+1` quand la main
 * revient vers le corps ; le bras droit plie à `−1`.
 */
import type { DefinitionIK, Pose, Squelette, TransformOs, Vec2 } from '../timeline/types';
import { calculerFK, limiterDoux, transformLocale, type OptionsFK } from './fk';
import { indexerSquelette } from './squelette';

/** Ramène un angle dans ]−π, π]. */
function enrouler(a: number): number {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  else if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

/**
 * IK douce : distance effective atteinte pour une cible à distance `d`, chaîne de longueur totale `L`, douceur `σ`
 * (fraction de L, 0 = IK dure). Identité jusqu'à `d_s = (1 − σ)·L`, puis `L − (L − d_s)·exp(−(d − d_s)/(L − d_s))` :
 * continue, de dérivée 1 en `d_s`, tend vers L sans l'atteindre.
 */
export function distanceDouce(d: number, L: number, douceur: number): number {
  if (!(douceur > 0)) return Math.min(d, L);
  const ds = (1 - douceur) * L;
  if (d <= ds) return d;
  const marge = L - ds;
  return L - marge * Math.exp(-(d - ds) / marge);
}

/** Résultat géométrique d'une IK à deux segments. */
export interface SolutionDeuxOs {
  /** Direction absolue du segment supérieur (rad). */
  angleHaut: number;
  /** Direction absolue du segment inférieur (rad). */
  angleBas: number;
  /** Position du coude / genou. */
  coude: Vec2;
  /** Position atteinte par le bout de la chaîne. */
  bout: Vec2;
  /** Vrai si la cible est atteinte (écart < 1e-6 px). */
  atteinte: boolean;
  /** Distance entre le bout atteint et la cible (px). */
  ecart: number;
}

/**
 * IK analytique à deux segments : racine `racine`, longueurs `L1` et `L2`, cible, sens du pli, douceur.
 * La distance utile est bornée dans `[|L1 − L2|, L1 + L2]`.
 */
export function resoudreDeuxSegments(
  racine: Vec2,
  L1: number,
  L2: number,
  cible: Vec2,
  plier: 1 | -1,
  douceur = 0,
): SolutionDeuxOs {
  const dx = cible.x - racine.x;
  const dy = cible.y - racine.y;
  const dBrute = Math.hypot(dx, dy);
  const base = dBrute > 1e-12 ? Math.atan2(dy, dx) : Math.PI / 2;
  const L = L1 + L2;
  let d = distanceDouce(dBrute, L, douceur);
  const dMin = Math.abs(L1 - L2);
  d = Math.min(Math.max(d, dMin), L);
  // Angle au pivot entre la direction de la cible et le segment supérieur (loi des cosinus).
  let cosA = d > 1e-12 ? (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d) : 1;
  cosA = Math.min(1, Math.max(-1, cosA));
  const A = Math.acos(cosA);
  const angleHaut = base - plier * A;
  const coude = { x: racine.x + L1 * Math.cos(angleHaut), y: racine.y + L1 * Math.sin(angleHaut) };
  const cibleEff = { x: racine.x + d * Math.cos(base), y: racine.y + d * Math.sin(base) };
  const angleBas = Math.atan2(cibleEff.y - coude.y, cibleEff.x - coude.x);
  const bout = { x: coude.x + L2 * Math.cos(angleBas), y: coude.y + L2 * Math.sin(angleBas) };
  const ecart = Math.hypot(bout.x - cible.x, bout.y - cible.y);
  return { angleHaut, angleBas, coude, bout, atteinte: ecart < 1e-6, ecart };
}

/** Options d'application d'une IK sur une pose. */
export interface OptionsIK extends OptionsFK {
  /** Mélange FK → IK (0 = FK, 1 = IK, défaut 1), sur le plus court chemin angulaire. */
  melange?: number;
  /** Douceur (remplace celle de la définition). */
  douceur?: number;
  /** Respecter les limites articulaires des deux os (défaut : `limites`, donc oui). */
  limitesIK?: boolean;
  /**
   * Orientation absolue imposée à l'effecteur (rad, direction pivot → bout, dans le repère image posé), par exemple
   * pour garder un pied à plat pendant un verrouillage au sol. Absent = l'effecteur garde sa rotation locale.
   */
  angleEffecteur?: number;
}

/** Résultat d'une IK appliquée. */
export interface ResultatIK {
  pose: Pose;
  /** Rotations locales calculées pour l'os supérieur et l'os inférieur (avant mélange). */
  rotationHaut: number;
  rotationBas: number;
  /** Position atteinte par le bout de la chaîne et écart à la cible (px), après mélange et limites. */
  bout: Vec2;
  ecart: number;
}

function avecRotation(t: TransformOs, rotation: number): TransformOs {
  return { rotation, translation: { ...t.translation }, echelle: { ...t.echelle } };
}

/**
 * Applique une IK à deux os sur une pose : renvoie une NOUVELLE pose (la pose d'entrée n'est pas modifiée) dont les
 * rotations de `def.os[0]` et `def.os[1]` amènent le bout de la chaîne (pivot de l'effecteur s'il est donné, sinon
 * bout de l'os inférieur) sur `cible` (px image, repère posé avant la racine).
 */
export function appliquerIK(
  squelette: Squelette,
  pose: Pose,
  def: DefinitionIK,
  cible: Vec2,
  options: OptionsIK = {},
): ResultatIK {
  const idx = indexerSquelette(squelette);
  const ia = idx.index.get(def.os[0]);
  const ib = idx.index.get(def.os[1]);
  if (ia === undefined || ib === undefined) throw new Error(`IK « ${def.nom} » : os inconnu (${def.os.join(', ')})`);
  if (idx.parents[ib] !== ia) throw new Error(`IK « ${def.nom} » : « ${def.os[1]} » doit être l'enfant direct de « ${def.os[0]} »`);
  const ie = def.effecteur !== undefined ? idx.index.get(def.effecteur) : undefined;
  if (def.effecteur !== undefined && (ie === undefined || idx.parents[ie] !== ib)) {
    throw new Error(`IK « ${def.nom} » : l'effecteur « ${def.effecteur} » doit être l'enfant direct de « ${def.os[1]} »`);
  }
  const osA = squelette.os[ia]!;
  const osB = squelette.os[ib]!;
  const etat = calculerFK(squelette, pose, options);
  const ta = transformLocale(pose, osA.nom);
  const tb = transformLocale(pose, osB.nom);
  // Géométrie de la chaîne dans les repères de repos (échelles propres comprises).
  const appliquerA = (o: typeof osA, t: TransformOs, v: Vec2): Vec2 => {
    const ca = Math.cos(o.angleRepos);
    const sa = Math.sin(o.angleRepos);
    const u = ca * v.x + sa * v.y;
    const w = -sa * v.x + ca * v.y;
    const us = u * t.echelle.x;
    const ws = w * t.echelle.y;
    return { x: ca * us - sa * ws, y: sa * us + ca * ws };
  };
  const finRepos: Vec2 =
    ie !== undefined
      ? squelette.os[ie]!.pivot
      : { x: osB.pivot.x + Math.cos(osB.angleRepos) * osB.longueur, y: osB.pivot.y + Math.sin(osB.angleRepos) * osB.longueur };
  const v1a = appliquerA(osA, ta, { x: osB.pivot.x - osA.pivot.x, y: osB.pivot.y - osA.pivot.y });
  const v1 = { x: v1a.x + tb.translation.x, y: v1a.y + tb.translation.y };
  const v2 = appliquerA(osB, tb, { x: finRepos.x - osB.pivot.x, y: finRepos.y - osB.pivot.y });
  const L1 = Math.hypot(v1.x, v1.y);
  const L2 = Math.hypot(v2.x, v2.y);
  const beta1 = Math.atan2(v1.y, v1.x);
  const beta2 = Math.atan2(v2.y, v2.x);
  const pa = idx.parents[ia]!;
  const thetaParent = pa >= 0 ? etat.angles[pa]! : 0;
  const P = etat.pivots[ia]!;
  const douceur = options.douceur ?? def.douceur ?? 0;
  const sol = resoudreDeuxSegments(P, L1, L2, cible, def.plier, douceur);
  let rotA = enrouler(sol.angleHaut - thetaParent - beta1);
  let rotB = enrouler(sol.angleBas - sol.angleHaut + beta1 - beta2);
  const avecLimites = options.limitesIK ?? options.limites ?? true;
  if (avecLimites && osB.limites && (rotB < osB.limites.min || rotB > osB.limites.max)) {
    // Coude borné : on fige l'angle relatif et on vise la cible avec la chaîne rigide obtenue.
    rotB = Math.min(osB.limites.max, Math.max(osB.limites.min, rotB));
    const delta = rotB + beta2 - beta1; // angleBas − angleHaut
    const ex = L1 + L2 * Math.cos(delta);
    const ey = L2 * Math.sin(delta);
    const gamma = Math.atan2(ey, ex);
    const versCible = Math.atan2(cible.y - P.y, cible.x - P.x);
    rotA = enrouler(versCible - gamma - thetaParent - beta1);
  }
  if (avecLimites && osA.limites) rotA = Math.min(osA.limites.max, Math.max(osA.limites.min, rotA));
  const rotationHaut = rotA;
  const rotationBas = rotB;
  const melange = Math.min(1, Math.max(0, options.melange ?? 1));
  if (melange < 1) {
    rotA = ta.rotation + melange * enrouler(rotA - ta.rotation);
    rotB = tb.rotation + melange * enrouler(rotB - tb.rotation);
  }
  const os: Record<string, TransformOs> = { ...pose.os };
  os[osA.nom] = avecRotation(ta, rotA);
  os[osB.nom] = avecRotation(tb, rotB);
  if (options.angleEffecteur !== undefined && ie !== undefined) {
    const osE = squelette.os[ie]!;
    const te = transformLocale(pose, osE.nom);
    const thetaB = thetaParent + rotA + rotB;
    let rotE = enrouler(options.angleEffecteur - osE.angleRepos - thetaB);
    if (avecLimites && osE.limites) rotE = limiterDoux(rotE, osE.limites.min, osE.limites.max, 0);
    os[osE.nom] = avecRotation(te, rotE);
  }
  const nouvelle: Pose = { ...pose, os };
  // Bout effectivement atteint (FK de la nouvelle pose, mêmes options).
  const etatFinal = calculerFK(squelette, nouvelle, { ...options, limites: false });
  const kb = etatFinal.peau[ib]!;
  const bout = { x: kb.a * finRepos.x + kb.c * finRepos.y + kb.tx, y: kb.b * finRepos.x + kb.d * finRepos.y + kb.ty };
  return { pose: nouvelle, rotationHaut, rotationBas, bout, ecart: Math.hypot(bout.x - cible.x, bout.y - cible.y) };
}

/** Définitions d'IK standard d'un humanoïde (bras et jambes), sens du pli selon l'orientation du dessin. */
export function ikStandard(orientation: 1 | -1 | 0, douceur = 0.05): DefinitionIK[] {
  // De face : le côté G (droite de l'image) plie en sens horaire. De profil (regard vers +x), coudes et genoux
  // plient dans le sens du regard pour les bras (main vers l'avant) et à l'opposé pour les genoux.
  const brasG: 1 | -1 = orientation === 0 ? 1 : orientation === 1 ? -1 : 1;
  const brasD: 1 | -1 = orientation === 0 ? -1 : brasG;
  const jambeG: 1 | -1 = orientation === 0 ? 1 : orientation === 1 ? 1 : -1;
  const jambeD: 1 | -1 = orientation === 0 ? -1 : jambeG;
  return [
    { nom: 'brasG', os: ['brasG', 'avantBrasG'], effecteur: 'mainG', plier: brasG, douceur },
    { nom: 'brasD', os: ['brasD', 'avantBrasD'], effecteur: 'mainD', plier: brasD, douceur },
    { nom: 'jambeG', os: ['cuisseG', 'jambeG'], effecteur: 'piedG', plier: jambeG, douceur },
    { nom: 'jambeD', os: ['cuisseD', 'jambeD'], effecteur: 'piedD', plier: jambeD, douceur },
  ];
}
