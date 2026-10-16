/**
 * Yeux : clignements et regard, déterministes (hachages à graine) et purs.
 *
 * **Clignements** : processus de renouvellement à taux variable λ(t) (15/min au repos, 21/min en parlant,
 * 9/min en écoute attentive ; avec 12 % de doublés, ≈ 17, 23 et 10 fermetures par minute). On intègre
 * `Λ(t) = ∫λ` (linéaire par morceaux) ; le clignement `i` tombe à `Λ⁻¹(i + u₀ + 0,8·(uᵢ − ½))` : apériodique
 * (coefficient de variation ≈ 0,33), jamais collé au précédent.
 * Durée 180 à 300 ms : fermeture 60 à 90 ms (accélérée), fermé 20 à 50 ms, ouverture 100 à 160 ms (freinée).
 * 12 % de doubles clignements. Clignements forcés aux grands changements de regard et aux prises ; aucun pendant
 * une prise (`sansClignement`) ni pendant un gel (le temps de jeu est figé).
 *
 * **Regard** : fixations de 0,5 à 2,6 s selon l'état (parole, écoute, repos), avec regards détournés
 * (30 % en parlant, 12 % en écoutant), micro-saccades de ±0,03 toutes les 0,5 à 1 s, saccades de durée
 * `25 + 2,5·A` ms (A en degrés, 1 unité de regard ≈ 30°) au profil smootherstep. Les yeux mènent : une saccade
 * forcée part à chaque changement de cible donné par l'animation (la tête suit 60 ms plus tard).
 */
import { hash01 } from '../noyau/aleatoire';
import { smootherstep } from '../noyau/courbes';
import { borner } from '../noyau/maths2d';
import type { Vec2 } from '../timeline/types';

/** Un clignement. */
export interface Clignement {
  t: number;
  fermeture: number;
  ferme: number;
  ouverture: number;
  amplitude: number;
  force: boolean;
}

/** Options de génération des clignements. */
export interface OptionsClignements {
  graine: number;
  debut: number;
  fin: number;
  /** Taux (clignements par minute), constant entre les `bornes`. */
  taux: (t: number) => number;
  bornes: readonly number[];
  forces?: readonly number[];
  /** Instants interdits (prise, regard fixe). */
  interdit?: (t: number) => boolean;
  probaDouble?: number;
}

/** Durée totale d'un clignement. */
export function dureeClignement(c: Clignement): number {
  return c.fermeture + c.ferme + c.ouverture;
}

function nouveau(graine: number, cle: number, t: number, force: boolean): Clignement {
  return {
    t,
    fermeture: 0.06 + 0.03 * hash01(graine, cle, 1),
    ferme: 0.02 + 0.03 * hash01(graine, cle, 2),
    ouverture: 0.1 + 0.06 * hash01(graine, cle, 3),
    amplitude: hash01(graine, cle, 4) < 0.1 ? 0.8 : 1,
    force,
  };
}

/** Clignements sur `[debut, fin]`, triés. */
export function genererClignements(o: OptionsClignements): Clignement[] {
  const bornes = [o.debut, ...o.bornes.filter((b) => b > o.debut && b < o.fin), o.fin].sort((a, b) => a - b);
  const lambda: number[] = [];
  const cumul: number[] = [0];
  for (let k = 0; k + 1 < bornes.length; k++) {
    const a = bornes[k]!;
    const b = bornes[k + 1]!;
    const l = Math.max(0, o.taux((a + b) / 2)) / 60;
    lambda.push(l);
    cumul.push(cumul[k]! + l * (b - a));
  }
  const total = cumul[cumul.length - 1]!;
  const inverse = (L: number): number => {
    for (let k = 0; k < lambda.length; k++) {
      if (L <= cumul[k + 1]! && lambda[k]! > 0) return bornes[k]! + (L - cumul[k]!) / lambda[k]!;
    }
    return o.fin;
  };
  const u0 = hash01(o.graine, 0x5eed);
  const r: Clignement[] = [];
  for (let i = 0; ; i++) {
    const L = i + u0 + 0.8 * (hash01(o.graine, i, 7) - 0.5);
    if (L > total) break;
    if (L < 0) continue;
    const t = inverse(L);
    const c = nouveau(o.graine, i, t, false);
    r.push(c);
    if (hash01(o.graine, i, 9) < (o.probaDouble ?? 0.12)) {
      const t2 = t + c.fermeture + c.ferme + 0.6 * c.ouverture;
      r.push(nouveau(o.graine, i + 100000, t2, false));
    }
  }
  const forces = (o.forces ?? []).filter((t) => t >= o.debut && t <= o.fin);
  const filtres = r.filter((c) => !forces.some((f) => Math.abs(c.t - f) < 0.4));
  forces.forEach((f, j) => filtres.push(nouveau(o.graine, 200000 + j, f, true)));
  const tous = filtres.filter((c) => !(o.interdit && o.interdit(c.t))).sort((a, b) => a.t - b.t);
  return tous;
}

/** Fermeture des paupières (0 … 1) d'un clignement à l'instant `t`. */
export function fermetureClignement(c: Clignement, t: number): number {
  const tau = t - c.t;
  if (tau <= 0) return 0;
  if (tau < c.fermeture) {
    const u = tau / c.fermeture;
    return c.amplitude * u * u;
  }
  if (tau < c.fermeture + c.ferme) return c.amplitude;
  const u = (tau - c.fermeture - c.ferme) / c.ouverture;
  if (u >= 1) return 0;
  return c.amplitude * (1 - u) * (1 - u);
}

/** Fermeture des paupières à `t` (maximum des clignements en cours). */
export function paupiereA(clignements: readonly Clignement[], t: number): number {
  let lo = 0;
  let hi = clignements.length - 1;
  let j = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (clignements[m]!.t <= t) {
      j = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  let v = 0;
  for (let k = j; k >= 0 && k >= j - 3; k--) v = Math.max(v, fermetureClignement(clignements[k]!, t));
  return v;
}

// ── Regard ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Une fixation : saccade depuis `depart` à l'instant `t`, vers `cible`, en `duree` s. */
export interface Fixation {
  t: number;
  depart: Vec2;
  cible: Vec2;
  duree: number;
}

/** Durée d'une saccade (s) pour une amplitude en degrés. */
export function dureeSaccade(amplitudeDeg: number): number {
  return Math.min(0.12, 0.025 + 0.0025 * Math.abs(amplitudeDeg));
}

/** Degrés par unité de regard (décalage des iris = rayon de l'œil). */
export const DEGRES_PAR_UNITE = 30;

/** Options du regard. */
export interface OptionsRegard {
  graine: number;
  debut: number;
  fin: number;
  /** Cible de base (unités de regard). */
  cibleBase: (t: number) => Vec2;
  /** Changements de cible imposés (saccades forcées). */
  changements: readonly number[];
  parle: (t: number) => boolean;
  ecoute: (t: number) => boolean;
}

/** Fixations sur `[debut, fin]` (la première commence à `debut` sans saccade). */
export function genererFixations(o: OptionsRegard): Fixation[] {
  const forces = [...o.changements].filter((c) => c > o.debut && c < o.fin).sort((a, b) => a - b);
  const r: Fixation[] = [];
  const c0 = o.cibleBase(o.debut);
  r.push({ t: o.debut, depart: c0, cible: c0, duree: 0 });
  let t = o.debut;
  let i = 0;
  let iForce = 0;
  let finMacro = o.debut;
  let decalage: Vec2 = { x: 0, y: 0 };
  while (t < o.fin && i < 100000) {
    i++;
    // Prochaine frontière : micro-saccade (0,5 à 1 s), fin de fixation, ou changement imposé.
    let suivant = t + 0.5 + 0.5 * hash01(o.graine, i, 1);
    let macro = false;
    if (suivant >= finMacro) {
      suivant = Math.max(t + 0.2, finMacro);
      macro = true;
    }
    while (iForce < forces.length && forces[iForce]! <= t) iForce++;
    if (iForce < forces.length && forces[iForce]! < suivant) {
      suivant = forces[iForce]!;
      macro = true;
      iForce++;
    }
    if (suivant >= o.fin) break;
    t = suivant;
    if (macro) {
      const parle = o.parle(t);
      const ecoute = o.ecoute(t);
      const u = hash01(o.graine, i, 2);
      const pDetour = parle ? 0.3 : ecoute ? 0.12 : 0.25;
      const detour = hash01(o.graine, i, 3) < pDetour;
      if (detour) {
        const sx = hash01(o.graine, i, 4) < 0.5 ? -1 : 1;
        decalage = { x: sx * (0.3 + 0.25 * hash01(o.graine, i, 5)), y: (hash01(o.graine, i, 6) - 0.4) * 0.35 };
      } else {
        decalage = { x: (hash01(o.graine, i, 7) - 0.5) * 0.12, y: (hash01(o.graine, i, 8) - 0.5) * 0.08 };
      }
      const base = parle ? 0.5 + 1.0 * u : ecoute ? 1.0 + 1.8 * u : 0.8 + 1.8 * u;
      finMacro = t + (detour ? 0.5 * base : base);
    } else {
      decalage = {
        x: decalage.x + (hash01(o.graine, i, 9) - 0.5) * 0.06,
        y: decalage.y + (hash01(o.graine, i, 10) - 0.5) * 0.06,
      };
    }
    const b = o.cibleBase(t + 0.02);
    const cible = { x: borner(b.x + decalage.x, -1, 1), y: borner(b.y + decalage.y, -1, 1) };
    const prec = r[r.length - 1]!;
    const depart = positionFixation(prec, t);
    const amplitude = Math.hypot(cible.x - depart.x, cible.y - depart.y) * DEGRES_PAR_UNITE;
    r.push({ t, depart, cible, duree: dureeSaccade(amplitude) });
  }
  return r;
}

function positionFixation(f: Fixation, t: number): Vec2 {
  if (f.duree <= 0 || t >= f.t + f.duree) return f.cible;
  if (t <= f.t) return f.depart;
  const u = smootherstep(0, 1, (t - f.t) / f.duree);
  return { x: f.depart.x + (f.cible.x - f.depart.x) * u, y: f.depart.y + (f.cible.y - f.depart.y) * u };
}

/** Direction du regard à `t` (unités de regard). */
export function regardA(fixations: readonly Fixation[], t: number): Vec2 {
  if (fixations.length === 0) return { x: 0, y: 0 };
  let lo = 0;
  let hi = fixations.length - 1;
  let j = 0;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (fixations[m]!.t <= t) {
      j = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  return positionFixation(fixations[j]!, t);
}
