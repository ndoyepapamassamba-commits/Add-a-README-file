/**
 * Modèle de sol d'un décor : échelle des personnages, profondeur du sol, aplatissement des ombres, géométrie des
 * sujets (pieds, yeux, sommet de la tête) dans le repère monde. Fonctions pures, partagées par le placement et la
 * caméra pour qu'ils voient exactement les mêmes sujets.
 *
 * Échelle : une unité monde = la hauteur du décor = `fit.mH` mètres à la ligne de sol `fit.floor`. La caméra du
 * décor est supposée à hauteur d'œil (1,6 m) : un personnage de `tailleM` mètres dont les pieds sont en `v` mesure
 * `tailleM·(v − v_horizon)/1,6` unités monde (voir `timeline/projection`). Sur la ligne de sol, MODOU (1,76 m) dans
 * un décor de `mH = 4` occupe 0,44 de la hauteur du décor.
 */
import { borner } from '../noyau/maths2d';
import { hauteurMondePersonnage, ligneHorizon } from '../timeline/projection';
import { orientationA, positionAuSol } from '../timeline/trajets';
import type { CharacterRig, InfoDecor, Plan, PlacementPersonnage, Projet, Vec2 } from '../timeline/types';

/** Rapport largeur/hauteur supposé sans décor chargé. */
export const ASPECT_DEFAUT = 2;
/** Ligne de sol supposée sans décor chargé. */
export const SOL_DEFAUT = 0.95;
/** Hauteur d'œil de la caméra du décor (m). */
export const HAUTEUR_OEIL_M = 1.6;
/** Distance focale du décor en hauteurs de décor (champ vertical supposé ≈ 50°). */
export const FOCALE_DECOR = 0.5 / Math.tan((25 * Math.PI) / 180);
/** Hauteur d'image supposée sans rig chargé (px). */
export const HAUTEUR_PX_DEFAUT = 1000;

/** Pixels de l'image du décor par mètre, à la ligne de sol (`hauteurImage` px pour `fit.mH` mètres). */
export function pixelsParMetre(decor: Pick<InfoDecor, 'fit' | 'hauteur'>): number {
  return decor.hauteur / decor.fit.mH;
}

/**
 * Profondeur du sol (0 loin … 1 proche) sous des pieds placés en `v`. Utilise l'ajustement de la carte de
 * profondeur (`analyse.sol`) quand il est fiable (r² ≥ 0,5), sinon un modèle géométrique (profondeur ∝ inverse de
 * la distance, normalisée pour valoir 0,85 sur la ligne de sol).
 */
export function profondeurSol(decor: InfoDecor | null, v: number): number {
  if (decor?.analyse && decor.analyse.sol.r2 >= 0.5 && decor.analyse.sol.a > 0) {
    const s = decor.analyse.sol;
    return borner(s.a * v + s.b, 0, 1);
  }
  const sol = decor?.fit.floor ?? SOL_DEFAUT;
  const vh = decor ? ligneHorizon(decor, HAUTEUR_OEIL_M) : sol - 0.4;
  const ecart = Math.max(1e-4, sol - vh);
  return borner((0.85 * (v - vh)) / ecart, 0, 1);
}

/**
 * Aplatissement de l'ellipse d'ombre au sol vue depuis la caméra du décor : sinus de l'angle de plongée,
 * `(v − v_h)/√((v − v_h)² + f²)`, borné à [0,08 ; 0,5].
 */
export function aplatissementSol(decor: InfoDecor | null, v: number): number {
  const sol = decor?.fit.floor ?? SOL_DEFAUT;
  const vh = decor ? ligneHorizon(decor, HAUTEUR_OEIL_M) : sol - 0.4;
  const dv = Math.max(0, v - vh);
  return borner(dv / Math.hypot(dv, FOCALE_DECOR), 0.08, 0.5);
}

/** Géométrie d'un sujet dans le monde (repère du décor), pose de repos : sert au cadrage et au placement. */
export interface GeometrieSujet {
  /** Pieds (ancrage au sol). */
  pieds: Vec2;
  /** Milieu des yeux. */
  yeux: Vec2;
  /** Sommet de la tête. */
  sommet: Vec2;
  /** Hauteur du personnage (unités monde). */
  hauteur: number;
  /** Unités monde par px image. */
  echelle: number;
  /** Position au sol en fractions du décor. */
  u: number;
  v: number;
  /** Sens du regard (1 = vers la droite de l'image). */
  orientation: 1 | -1;
  /** Vrai pendant une marche. */
  enMarche: boolean;
}

/** Position des yeux au repos dans l'image du personnage (px), ou estimation à 91 % de la hauteur. */
export function yeuxRepos(rig: CharacterRig | null): Vec2 | null {
  if (!rig?.visage) return null;
  const g = rig.visage.oeilG.centre;
  const d = rig.visage.oeilD.centre;
  return { x: (g.x + d.x) / 2, y: (g.y + d.y) / 2 };
}

/**
 * Géométrie d'un sujet du plan à l'instant de jeu `tJeu`. `echelle` est le facteur supplémentaire du placement.
 * Le miroir (orientation opposée au dessin) est appliqué aux décalages horizontaux des yeux.
 */
export function geometrieSujet(
  projet: Projet,
  plan: Plan,
  placement: PlacementPersonnage,
  tailleM: number,
  rig: CharacterRig | null,
  decor: InfoDecor | null,
  tJeu: number,
): GeometrieSujet {
  const aspect = decor?.aspect ?? ASPECT_DEFAUT;
  const sol = decor?.fit.floor ?? SOL_DEFAUT;
  const pos = positionAuSol(projet, plan, placement, tJeu, sol, aspect);
  const hauteur =
    (decor ? hauteurMondePersonnage(decor, tailleM, pos.v, HAUTEUR_OEIL_M) : tailleM / 2) * (placement.echelle ?? 1);
  const hauteurPx = rig?.hauteurPx ?? HAUTEUR_PX_DEFAUT;
  const echelle = hauteur / Math.max(1e-6, hauteurPx);
  const orientation = orientationA(projet, plan, placement, tJeu);
  const pieds = { x: pos.u * aspect, y: pos.v };
  const flip = rig ? rig.orientationDessin !== 0 && orientation !== rig.orientationDessin : false;
  const yr = yeuxRepos(rig);
  let yeux: Vec2;
  if (rig && yr) {
    const dx = (yr.x - rig.ancrageSol.x) * (flip ? -1 : 1);
    yeux = { x: pieds.x + dx * echelle, y: pieds.y + (yr.y - rig.ancrageSol.y) * echelle };
  } else {
    yeux = { x: pieds.x, y: pieds.y - 0.91 * hauteur };
  }
  const sommet = { x: yeux.x, y: pieds.y - hauteur };
  return { pieds, yeux, sommet, hauteur, echelle, u: pos.u, v: pos.v, orientation, enMarche: pos.enMarche };
}

/**
 * Part de sol praticable sous des pieds placés en `(u, v)` (0 … 1, moyenne sur une petite fenêtre autour des pieds),
 * ou `null` si le décor n'a pas d'analyse du sol. Une valeur basse signale des pieds posés sur un meuble, une table
 * ou un figurant : le personnage semblera flotter.
 */
export function partSolPraticable(decor: InfoDecor | null, u: number, v: number): number | null {
  const p = decor?.analyse?.praticable;
  if (!p) return null;
  if (v < p.v0) return 0;
  const vs = [v - 0.02, v, Math.min(0.999, v + 0.02)];
  const us = [u - 0.02, u, u + 0.02];
  let s = 0;
  let n = 0;
  for (const vv of vs)
    for (const uu of us) {
      const i = Math.min(p.colonnes - 1, Math.max(0, Math.floor(uu * p.colonnes)));
      const j = Math.min(p.lignes - 1, Math.max(0, Math.floor(((vv - p.v0) / Math.max(1e-6, 1 - p.v0)) * p.lignes)));
      s += p.part[j * p.colonnes + i] ?? 0;
      n++;
    }
  return n > 0 ? s / n : null;
}
