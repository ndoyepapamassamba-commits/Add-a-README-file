/**
 * Trajets au sol et orientation des personnages, partagés par `scene/` (placement monde, cadrage) et `anim/`
 * (cycle de marche calé sur la distance parcourue, demi-tours). Une seule source de vérité : les actions
 * `marcher` (paramètre `vers`) et `seTourner` (paramètre `orientation`) de la piste.
 */
import type { ActionPlacee, Plan, PlacementPersonnage, PointDecor, Projet } from './types';

/** Durée par défaut d'une marche sans `duree` (s). */
export const DUREE_MARCHE_DEFAUT = 1.6;
/** Durée par défaut d'un demi-tour (s). */
export const DUREE_DEMI_TOUR_DEFAUT = 0.5;
/** Part de la durée consacrée à l'accélération (et autant au freinage). */
const PART_ACCELERATION = 0.2;

/**
 * Profil de déplacement normalisé `s ∈ [0, 1] → [0, 1]` : accélération douce (smoothstep de la vitesse), vitesse
 * constante, freinage symétrique. Position C², vitesse continue et nulle aux extrémités.
 */
export function profilMarche(s: number, a = PART_ACCELERATION): number {
  if (s <= 0) return 0;
  if (s >= 1) return 1;
  const V = 1 / (1 - a);
  const montee = (x: number) => {
    const u = x / a;
    return V * a * (u * u * u - (u * u * u * u) / 2);
  };
  if (s < a) return montee(s);
  if (s <= 1 - a) return V * (a / 2 + (s - a));
  return 1 - montee(1 - s);
}

/** Dérivée du profil (par rapport à `s`). */
export function vitesseProfilMarche(s: number, a = PART_ACCELERATION): number {
  if (s <= 0 || s >= 1) return 0;
  const V = 1 / (1 - a);
  const ramp = (x: number) => {
    const u = x / a;
    return V * u * u * (3 - 2 * u);
  };
  if (s < a) return ramp(s);
  if (s <= 1 - a) return V;
  return ramp(1 - s);
}

function estPointDecor(x: unknown): x is PointDecor {
  return typeof x === 'object' && x !== null && typeof (x as PointDecor).u === 'number' && typeof (x as PointDecor).v === 'number';
}

/** Marches (avec destination) d'un personnage qui commencent dans le plan, triées par début. */
export function marchesDansPlan(projet: Projet, plan: Plan, personnage: string): ActionPlacee[] {
  return projet.pistes.actions.filter(
    (a) =>
      a.personnage === personnage &&
      a.action === 'marcher' &&
      a.debut >= plan.debut &&
      a.debut < plan.fin &&
      estPointDecor(a.parametres?.vers),
  );
}

/** Position des pieds dans le décor à un instant, avec vitesse et distance parcourue depuis le début du plan. */
export interface PositionSol {
  u: number;
  v: number;
  /** Vitesse en fractions de décor par seconde. */
  vitesseU: number;
  vitesseV: number;
  /** Distance cumulée parcourue dans le plan (en hauteurs de décor, repère monde) : phase du cycle de marche. */
  distance: number;
  /** Vrai pendant une marche. */
  enMarche: boolean;
}

/**
 * Position au sol d'un personnage à l'instant de jeu `tJeu` : départ au placement du plan, puis enchaînement des
 * marches (`parametres.vers`, durée `duree` ou 1,6 s) avec le profil `profilMarche`. `vDefaut` est la ligne de sol
 * utilisée quand le placement n'a pas de `v` ; `aspect` convertit la distance en repère monde.
 */
export function positionAuSol(
  projet: Projet,
  plan: Plan,
  placement: PlacementPersonnage,
  tJeu: number,
  vDefaut: number,
  aspect = 2,
): PositionSol {
  let u = placement.u;
  let v = placement.v ?? vDefaut;
  let distance = 0;
  for (const m of marchesDansPlan(projet, plan, placement.personnage)) {
    if (m.debut > tJeu) break;
    const vers = m.parametres!.vers as PointDecor;
    const duree = (m.duree ?? DUREE_MARCHE_DEFAUT) / (m.tempo ?? 1);
    const du = vers.u - u;
    const dv = vers.v - v;
    const longueur = Math.hypot(du * aspect, dv);
    const s = duree > 0 ? (tJeu - m.debut) / duree : 1;
    if (s < 1) {
      const p = profilMarche(s);
      const dp = duree > 0 ? vitesseProfilMarche(s) / duree : 0;
      return { u: u + du * p, v: v + dv * p, vitesseU: du * dp, vitesseV: dv * dp, distance: distance + longueur * p, enMarche: true };
    }
    u = vers.u;
    v = vers.v;
    distance += longueur;
  }
  return { u, v, vitesseU: 0, vitesseV: 0, distance, enMarche: false };
}

/**
 * Orientation (1 = regarde vers la droite de l'image, −1 = vers la gauche) à l'instant de jeu `tJeu`.
 * Événements, dans l'ordre : chaque `marcher` oriente vers sa destination dès son début (sauf
 * `parametres.orientation` explicite) ; chaque `seTourner` bascule (ou impose `parametres.orientation`) à la moitié
 * de sa durée.
 */
export function orientationA(projet: Projet, plan: Plan, placement: PlacementPersonnage, tJeu: number): 1 | -1 {
  let orientation: 1 | -1 = placement.orientation ?? 1;
  let u = placement.u;
  const evts: Array<{ t: number; appliquer: () => void }> = [];
  for (const a of projet.pistes.actions) {
    if (a.personnage !== placement.personnage || a.debut < plan.debut || a.debut >= plan.fin) continue;
    const imposee = a.parametres?.orientation;
    if (a.action === 'marcher' && estPointDecor(a.parametres?.vers)) {
      const vers = a.parametres!.vers as PointDecor;
      evts.push({
        t: a.debut,
        appliquer: () => {
          if (imposee === 1 || imposee === -1) orientation = imposee;
          else if (Math.abs(vers.u - u) > 1e-6) orientation = vers.u > u ? 1 : -1;
          u = vers.u;
        },
      });
    } else if (a.action === 'seTourner') {
      const duree = (a.duree ?? DUREE_DEMI_TOUR_DEFAUT) / (a.tempo ?? 1);
      evts.push({
        t: a.debut + duree / 2,
        appliquer: () => {
          orientation = imposee === 1 || imposee === -1 ? imposee : orientation === 1 ? -1 : 1;
        },
      });
    }
  }
  evts
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.t - b.e.t || a.i - b.i)
    .forEach(({ e }) => {
      if (e.t <= tJeu) e.appliquer();
    });
  return orientation;
}
