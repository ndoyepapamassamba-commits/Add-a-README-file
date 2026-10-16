/**
 * Contexte d'animation d'un personnage dans un plan, et résolution des cibles (personnage, point du décor,
 * caméra) en directions dans le **repère du dessin** (avant le miroir de la racine). Fonctions pures.
 */
import { graineDe } from '../noyau/aleatoire';
import { hauteurMondePersonnage } from '../timeline/projection';
import { orientationA, positionAuSol } from '../timeline/trajets';
import type {
  CharacterRig,
  Cible,
  DeclarationPersonnage,
  InfoDecor,
  PlacementPersonnage,
  Plan,
  Projet,
} from '../timeline/types';
import { morphologie, type Morphologie } from './corps';
import { resoudrePersonnalite, type PersonnaliteResolue } from './reglages';

/** Rapport largeur/hauteur supposé sans décor (comme les fournisseurs neutres). */
const ASPECT_DEFAUT = 2;
/** Ligne de sol supposée sans décor. */
const SOL_DEFAUT = 0.95;

/** Tout ce qu'il faut pour compiler l'animation d'un personnage dans un plan. */
export interface ContexteAnim {
  projet: Projet;
  plan: Plan;
  indexPlan: number;
  decor: InfoDecor | null;
  declaration: DeclarationPersonnage;
  placement: PlacementPersonnage;
  rig: CharacterRig;
  morph: Morphologie;
  perso: PersonnaliteResolue;
  /** Graine du personnage (projet × personnage). */
  graine: number;
  aspect: number;
  sol: number;
}

/** Construit le contexte d'animation. */
export function contexteAnim(
  projet: Projet,
  plan: Plan,
  indexPlan: number,
  decor: InfoDecor | null,
  declaration: DeclarationPersonnage,
  placement: PlacementPersonnage,
  rig: CharacterRig,
): ContexteAnim {
  return {
    projet,
    plan,
    indexPlan,
    decor,
    declaration,
    placement,
    rig,
    morph: morphologie(rig),
    perso: resoudrePersonnalite(declaration.personnalite),
    graine: graineDe(projet.sortie?.graine ?? 1, declaration.id),
    aspect: decor?.aspect ?? ASPECT_DEFAUT,
    sol: decor?.fit.floor ?? SOL_DEFAUT,
  };
}

/** Hauteur monde d'un personnage dont les pieds sont en `v` (comme le placement par défaut). */
export function hauteurMonde(cc: ContexteAnim, tailleM: number, v: number): number {
  return cc.decor ? Math.max(1e-3, hauteurMondePersonnage(cc.decor, tailleM, v)) : tailleM / 2;
}

/** Miroir du dessin à l'instant de jeu `tJeu` (même règle que `flipPour`). */
export function miroirA(cc: ContexteAnim, tJeu: number): boolean {
  if (cc.rig.orientationDessin === 0) return false;
  return orientationA(cc.projet, cc.plan, cc.placement, tJeu) !== cc.rig.orientationDessin;
}

/** Sens du regard du personnage dans le repère du dessin (±1) à `tJeu`. */
export function sensImage(cc: ContexteAnim, tJeu: number): 1 | -1 {
  const monde = orientationA(cc.projet, cc.plan, cc.placement, tJeu);
  return (miroirA(cc, tJeu) ? -monde : monde) as 1 | -1;
}

/** Position des pieds (monde) et hauteur monde d'un personnage du plan à `tJeu`, ou `null` s'il est absent. */
export function corpsDans(
  cc: ContexteAnim,
  id: string,
  tJeu: number,
): { x: number; y: number; h: number } | null {
  const placement = cc.plan.personnages.find((p) => p.personnage === id);
  const decl = cc.projet.personnages.find((d) => d.id === id);
  if (!placement || !decl) return null;
  const pos = positionAuSol(cc.projet, cc.plan, placement, tJeu, cc.sol, cc.aspect);
  return { x: pos.u * cc.aspect, y: pos.v, h: hauteurMonde(cc, decl.tailleM, pos.v) };
}

/** Cible résolue dans le repère du dessin. */
export interface CibleResolue {
  /** Vecteur unitaire des yeux vers la cible (repère du dessin, y vers le bas). */
  dx: number;
  dy: number;
  /** Côté image de la cible (±1) ; vers l'avant du personnage si la cible est droit devant. */
  cote: 1 | -1;
  /** Vers la caméra (spectateur). */
  camera: boolean;
  /** Angle image (rad) de l'épaule vers la cible. */
  angleEpaule: number;
}

/**
 * Résout une cible à l'instant de jeu `tJeu`. Un personnage absent du plan est supposé hors champ, du côté où le
 * personnage regarde.
 */
export function resoudreCible(cc: ContexteAnim, cible: Cible | undefined, tJeu: number): CibleResolue | null {
  if (!cible) return null;
  const sens = sensImage(cc, tJeu);
  if ('camera' in cible) return { dx: 0, dy: 0, cote: sens, camera: true, angleEpaule: sens === 1 ? 0 : Math.PI };
  const moi = corpsDans(cc, cc.declaration.id, tJeu);
  if (!moi) return null;
  const yeux = { x: moi.x, y: moi.y - 0.93 * moi.h };
  const epaule = { x: moi.x, y: moi.y - 0.8 * moi.h };
  let p: { x: number; y: number };
  if ('personnage' in cible) {
    const autre = corpsDans(cc, cible.personnage, tJeu);
    if (!autre) {
      const dx = sens;
      return { dx, dy: 0, cote: sens, camera: false, angleEpaule: dx > 0 ? 0 : Math.PI };
    }
    p = { x: autre.x, y: autre.y - 0.85 * autre.h };
  } else {
    p = { x: cible.point.u * cc.aspect, y: cible.point.v };
  }
  const miroir = miroirA(cc, tJeu) ? -1 : 1;
  let dx = (p.x - yeux.x) * miroir;
  let dy = p.y - yeux.y;
  const n = Math.hypot(dx, dy);
  if (n < 1e-9) {
    dx = sens;
    dy = 0;
  } else {
    dx /= n;
    dy /= n;
  }
  const ex = (p.x - epaule.x) * miroir;
  const ey = p.y - epaule.y;
  const cote: 1 | -1 = Math.abs(dx) < 0.05 ? sens : dx > 0 ? 1 : -1;
  return { dx, dy, cote, camera: false, angleEpaule: Math.hypot(ex, ey) < 1e-9 ? (cote > 0 ? 0 : Math.PI) : Math.atan2(ey, ex) };
}
