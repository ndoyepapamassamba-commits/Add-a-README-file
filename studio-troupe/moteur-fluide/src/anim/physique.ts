/**
 * Mouvement secondaire en fonctions pures : pendules et chaînes (foulards, pans de pagne, ourlet de boubou,
 * boucles d'oreilles), ventre qui ballotte, réponse établie aux mouvements périodiques (marche).
 *
 * Idée clé : un pendule de longueur `L` dont le point d'attache se déplace de `X(t)` obéit à
 * `θ'' + 2ζω·θ' + ω²·θ = −X''/L`. Sa solution exacte est `θ = (Y − X)/L`, où `Y` est la réponse du ressort
 * `(f, ζ, r = 2)` (`k3 = 2ζ/ω`) à la consigne `X`. Comme `noyau/ressorts` résout ce ressort analytiquement
 * pour des consignes en marches et rampes, le pendule l'est aussi : aucune intégration, aucun état, aucune dérive.
 * Une chaîne est une suite de pendules de plus en plus lents et souples (chevauchement, follow-through).
 */
import { creerCanalRessort, type CanalRessort, type Consigne } from '../noyau/ressorts';
import { borner } from '../noyau/maths2d';
import type { ChaineSecondaire, ParametresRessort } from '../timeline/types';

/** Gain et déphasage (rad, négatif = retard) du ressort `(f, ζ, r)` en régime établi à `frequence` Hz. */
export function reponseHarmonique(p: ParametresRessort, frequence: number): { gain: number; phase: number } {
  const omega = 2 * Math.PI * p.f;
  const k1 = (2 * p.zeta) / omega;
  const k2 = 1 / (omega * omega);
  const k3 = ((p.r ?? 0) * p.zeta) / omega;
  const W = 2 * Math.PI * frequence;
  // H(jW) = (1 + j·k3·W) / ((1 − k2·W²) + j·k1·W)
  const nr = 1;
  const ni = k3 * W;
  const dr = 1 - k2 * W * W;
  const di = k1 * W;
  return {
    gain: Math.hypot(nr, ni) / Math.hypot(dr, di),
    phase: Math.atan2(ni, nr) - Math.atan2(di, dr),
  };
}

/** Pendule analytique. */
export interface Pendule {
  /** Angle (rad) par rapport à la verticale de l'attache, positif = sens horaire à l'écran. */
  angle(t: number): number;
  vitesse(t: number): number;
}

/**
 * Pendule dont l'attache suit les consignes `deplacement` (px, horizontal, x vers la droite), de longueur
 * `longueur` px et de ressort `pendule` (f = fréquence propre, ζ = amortissement ; `r` est imposé à 2).
 * Si `support` est donné, l'attache suit elle-même ce ressort (approximation : on compare deux réponses à la
 * même consigne, exacte quand le support est rapide).
 * Un déplacement vers la droite laisse la masse en arrière : la tige penche vers la gauche par le bas, ce qui
 * est une rotation positive (horaire) pour un pendule qui pend vers le bas.
 */
export function creerPendule(
  deplacement: readonly Consigne[],
  longueur: number,
  pendule: ParametresRessort,
  support?: ParametresRessort,
): Pendule {
  const L = Math.max(1e-6, longueur);
  const masse = creerCanalRessort(0, deplacement, { f: pendule.f, zeta: pendule.zeta, r: 2 });
  const attache: Pick<CanalRessort, 'valeur' | 'vitesse'> = support
    ? creerCanalRessort(0, deplacement, support)
    : { valeur: (t) => masse.consigne(t), vitesse: (t) => (masse.consigne(t + 1e-4) - masse.consigne(t - 1e-4)) / 2e-4 };
  // θ = (Y − X)/L avec y vers le bas : la masse à gauche de l'attache (Y < X) = rotation horaire (> 0).
  return {
    angle: (t) => (attache.valeur(t) - masse.valeur(t)) / L + 0,
    vitesse: (t) => (attache.vitesse(t) - masse.vitesse(t)) / L + 0,
  };
}

/**
 * Retard d'un suiveur souple sur un meneur : `lent(x) − rapide(x)` pour la même consigne `x`. Nul au repos et en
 * régime établi ; négatif pendant que le meneur part (traîne), puis rebond (follow-through) si `lent` est peu amorti.
 */
export function creerRetard(
  consignes: readonly Consigne[],
  rapide: ParametresRessort,
  lent: ParametresRessort,
): (t: number) => number {
  if (consignes.length === 0) return () => 0;
  const a = creerCanalRessort(0, consignes, rapide);
  const b = creerCanalRessort(0, consignes, lent);
  return (t) => b.valeur(t) - a.valeur(t);
}

/**
 * Oscillation amortie déclenchée par des impulsions (atterrissage, coup de rire) : somme de
 * `a·e^{−ζω(t−tₖ)}·sin(ω_d(t−tₖ))` pour `t > tₖ`. Continue (nulle au départ de chaque impulsion).
 */
export function oscillationAmortie(
  t: number,
  impulsions: ReadonlyArray<{ t: number; amplitude: number }>,
  frequence: number,
  zeta: number,
): number {
  const w = 2 * Math.PI * frequence;
  const z = borner(zeta, 0.01, 0.99);
  const wd = w * Math.sqrt(1 - z * z);
  let s = 0;
  for (const i of impulsions) {
    const tau = t - i.t;
    if (tau <= 0) continue;
    const e = Math.exp(-z * w * tau);
    if (e < 1e-6) continue;
    s += i.amplitude * e * Math.sin(wd * tau);
  }
  return s;
}

/** Chaîne secondaire compilée. */
export interface ChaineCompilee {
  nom: string;
  os: string[];
  /** Rotations locales (rad) des maillons à l'instant `t`. */
  rotations(t: number): number[];
}

/**
 * Chaîne secondaire : le maillon `i` a un ressort de fréquence `f·0,85^i` et d'amortissement `ζ − 0,03·i`.
 * Entrées : rotation absolue voulue de l'os porteur (consignes, rad) et déplacement horizontal de l'attache
 * (consignes, px), avec le ressort du porteur. Sortie : rotations locales des maillons.
 * - Raideur (1 − gravité) : le maillon suit la rotation du porteur avec retard → traîne puis rebondit.
 * - Gravité : le maillon tend à rester vertical → il compense la rotation du porteur, avec inertie.
 * - Déplacement : chaque maillon est un pendule (longueur cumulée) excité par l'attache ; `sensPendule` = −1
 *   pour une chaîne dressée vers le haut (le signe de la rotation s'inverse).
 */
export function compilerChaine(
  chaine: ChaineSecondaire,
  longueurs: readonly number[],
  rotationPorteur: readonly Consigne[],
  deplacementAttache: readonly Consigne[],
  ressortPorteur: ParametresRessort,
  sensPendule: 1 | -1 = 1,
): ChaineCompilee {
  const gravite = borner(chaine.gravite ?? 0.5, 0, 1);
  const n = chaine.os.length;
  const porteur = rotationPorteur.length > 0 ? creerCanalRessort(0, rotationPorteur, ressortPorteur) : null;
  const maillons = chaine.os.map((_, i) => {
    const p: ParametresRessort = {
      f: Math.max(0.2, chaine.ressort.f * 0.85 ** i),
      zeta: Math.max(0.08, chaine.ressort.zeta - 0.03 * i),
      r: chaine.ressort.r ?? 0,
    };
    const suiveur = rotationPorteur.length > 0 ? creerCanalRessort(0, rotationPorteur, p) : null;
    let cumul = 0;
    for (let k = 0; k <= i; k++) cumul += Math.max(1, longueurs[k] ?? longueurs[longueurs.length - 1] ?? 50);
    const pendule = deplacementAttache.length > 0 ? creerPendule(deplacementAttache, cumul, p, ressortPorteur) : null;
    return { suiveur, pendule };
  });
  return {
    nom: chaine.nom,
    os: [...chaine.os],
    rotations(t) {
      const porte = porteur ? porteur.valeur(t) : 0;
      const absolus = maillons.map((m) => {
        // Angle absolu du maillon relativement au repos.
        const suivi = m.suiveur ? m.suiveur.valeur(t) : 0;
        const raide = (1 - gravite) * suivi;
        const pend = m.pendule ? sensPendule * m.pendule.angle(t) : 0;
        return raide + pend;
      });
      const r: number[] = [];
      for (let i = 0; i < n; i++) {
        const parent = i === 0 ? porte : porte + r.slice(0, i).reduce((s, x) => s + x, 0);
        r.push(absolus[i]! - parent);
      }
      return r;
    },
  };
}
