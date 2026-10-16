/**
 * Fournisseurs par défaut injectés dans `evaluer` tant qu'un module n'a pas fourni les siens : pose de repos,
 * visage neutre, placement au sol par le modèle de sol du kit, caméra posée sur le cadrage du plan, décor immobile,
 * sous-titres, sons et effets tirés des pistes. Ils sont purs et servent aussi de référence de format aux modules.
 */
import { borner } from '../noyau/maths2d';
import { effetsParDefaut, sonsParDefaut, sousTitresParDefaut } from './derives';
import { cameraNeutre, decorNeutre, etalonnageNeutre, ombreNeutre, poseNeutre, visageNeutre } from './neutres';
import { hauteurMondePersonnage, ligneHorizon, pointDecorVersMonde } from './projection';
import { orientationA, positionAuSol } from './trajets';
import type {
  ContexteImage,
  ContextePersonnage,
  EtatCamera,
  EtatDecor,
  EtatPersonnage,
  EtatVisage,
  Fournisseurs,
  PlacementMonde,
  Pose,
  TaillePlan,
} from './types';

/** Rapport largeur/hauteur supposé quand le décor n'est pas chargé. */
const ASPECT_PAR_DEFAUT = 2;
/** Ligne de sol supposée quand le décor n'est pas chargé. */
const SOL_PAR_DEFAUT = 0.95;
/** Hauteur image supposée quand le rig n'est pas chargé (px). */
const HAUTEUR_PX_PAR_DEFAUT = 1000;

/** Zoom indicatif par taille de plan (1 = toute la hauteur du décor). `scene/` affine selon les sujets. */
export const ZOOM_PAR_TAILLE: Readonly<Record<TaillePlan, number>> = {
  ensemble: 1,
  large: 1.15,
  moyen: 1.5,
  americain: 1.8,
  rapproche: 2.4,
  gros: 3.4,
  tresGros: 4.8,
};

/** Retourne le dessin si le personnage regarde à l'opposé du sens dessiné. */
export function flipPour(ctx: ContextePersonnage): boolean {
  if (!ctx.plan || !ctx.rig || ctx.rig.orientationDessin === 0) return false;
  return orientationA(ctx.projet, ctx.plan, ctx.placement, ctx.tJeu) !== ctx.rig.orientationDessin;
}

/** Pose de repos (seul le miroir suit l'orientation). */
export function poseParDefaut(ctx: ContextePersonnage): Pose {
  return poseNeutre(flipPour(ctx));
}

/** Visage au repos. */
export function visageParDefaut(_ctx: ContextePersonnage): EtatVisage {
  return visageNeutre();
}

/**
 * Placement par le modèle de sol du kit : pieds en `(u·aspect, v)`, taille `tailleM·(v − v_horizon)/1,6`
 * (horizon à 1,6 m), ordre de dessin croissant avec `v` (plus bas = devant). La profondeur renvoyée est une
 * approximation par `v` ; `scene/` la lit dans la carte de profondeur.
 */
export function placementParDefaut(ctx: ContextePersonnage): PlacementMonde {
  const decor = ctx.decor;
  const aspect = decor?.aspect ?? ASPECT_PAR_DEFAUT;
  const sol = decor?.fit.floor ?? SOL_PAR_DEFAUT;
  const plan = ctx.plan;
  const pos = plan
    ? positionAuSol(ctx.projet, plan, ctx.placement, ctx.tJeu, sol, aspect)
    : { u: ctx.placement.u, v: ctx.placement.v ?? sol };
  const hauteurMonde = decor
    ? hauteurMondePersonnage(decor, ctx.declaration.tailleM, pos.v)
    : ctx.declaration.tailleM / 2;
  const hauteurPx = ctx.rig?.hauteurPx ?? HAUTEUR_PX_PAR_DEFAUT;
  const echelle = (hauteurMonde * (ctx.placement.echelle ?? 1)) / hauteurPx;
  const vh = decor ? ligneHorizon(decor) : sol - 0.5;
  const profondeur = borner((0.6 * (pos.v - vh)) / Math.max(1e-6, sol - vh), 0, 1);
  return {
    position: { x: pos.u * aspect, y: pos.v },
    echelle,
    profondeur,
    ordre: ctx.placement.ordre ?? pos.v * 1000,
    ombre: ombreNeutre(0.22 * hauteurMonde),
    etalonnage: etalonnageNeutre(),
    flou: 0,
    opacite: 1,
    visible: true,
  };
}

/**
 * Caméra posée : zoom par taille de plan (ou `cadrage.zoom`), centre imposé, sinon centre des sujets, sinon
 * `fit.cx` ; fenêtre gardée à l'intérieur du décor. Aucun mouvement (les mouvements sont l'affaire de `scene/`).
 */
export function cameraParDefaut(ctx: ContexteImage, personnages: readonly EtatPersonnage[]): EtatCamera {
  const plan = ctx.plan;
  const decor = ctx.decor;
  const aspect = decor?.aspect ?? ASPECT_PAR_DEFAUT;
  if (!plan) return cameraNeutre({ x: aspect / 2, y: 0.5 }, 1);
  const cadrage = plan.cadrage;
  const zoom = cadrage.zoom ?? ZOOM_PAR_TAILLE[cadrage.taille ?? 'moyen'];
  let centre = { x: (decor?.fit.cx ?? 0.5) * aspect, y: 0.5 };
  if (cadrage.centre) centre = pointDecorVersMonde(cadrage.centre, { aspect });
  else if (cadrage.sujets && cadrage.sujets.length > 0) {
    const sujets = personnages.filter((p) => cadrage.sujets!.includes(p.id));
    if (sujets.length > 0) {
      const x = sujets.reduce((s, p) => s + p.position.x, 0) / sujets.length;
      const pieds = sujets.reduce((s, p) => s + p.position.y, 0) / sujets.length;
      // Les pieds au tiers inférieur du cadre.
      centre = { x, y: pieds - 0.3 / zoom };
    }
  }
  const largeurSortie = ctx.projet.sortie.largeur;
  const hauteurSortie = ctx.projet.sortie.hauteur;
  const w = largeurSortie / hauteurSortie / zoom;
  const h = 1 / zoom;
  centre = {
    x: w >= aspect ? aspect / 2 : borner(centre.x, w / 2, aspect - w / 2),
    y: h >= 1 ? 0.5 : borner(centre.y, h / 2, 1 - h / 2),
  };
  return cameraNeutre(centre, zoom);
}

/** Décor immobile (figurants et ciel suivent le temps du jeu). */
export function decorParDefaut(ctx: ContexteImage, _camera: EtatCamera): EtatDecor | null {
  if (!ctx.plan) return null;
  return decorNeutre(ctx.plan.decor, ctx.tJeu);
}

/** Jeu complet de fournisseurs par défaut. */
export const FOURNISSEURS_NEUTRES: Readonly<Fournisseurs> = Object.freeze({
  pose: poseParDefaut,
  visage: visageParDefaut,
  placement: placementParDefaut,
  camera: cameraParDefaut,
  decor: decorParDefaut,
  sousTitres: sousTitresParDefaut,
  sons: sonsParDefaut,
  effets: effetsParDefaut,
});
