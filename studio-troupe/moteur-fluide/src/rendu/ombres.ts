/**
 * Ombres de contact d'un personnage (fonction pure, sans PixiJS) : ce qui « pose » le dessin sur le sol du décor.
 *
 * - **occlusion sous chaque semelle** : noyau sombre et serré, plus une ombre douce un peu plus large, placés au
 *   point de contact AU REPOS de ce pied (pour un dessin de trois quarts, le pied du fond touche le sol plus haut dans
 *   l'image : chaque pied a sa propre ligne de sol) ; ils pâlissent et s'élargissent quand le pied se lève ;
 * - **ombre du corps** : ellipse douce entre les pieds, qui pâlit pendant un saut.
 *
 * Repères : `W` = image (après skinning) → monde, racine comprise ; `W0` = image → monde SANS la racine (sol fixe,
 * insensible aux sauts et à la respiration) ; `camera` = monde → écran.
 */
import { appliquer, composer } from '../noyau/maths2d';
import type { Couleur, EtatOmbre, Mat2D, Vec2 } from '../timeline/types';
import type { EllipseDouce } from './formes';

/** Réglages des ombres de contact (fractions de la hauteur du personnage). */
export const REGLAGES_OMBRES = Object.freeze({
  couleur: [0.04, 0.028, 0.024] as const,
  /** Ombre du corps : alpha relatif et marge latérale autour des pieds. */
  corps: 0.7,
  margeCorps: 0.11,
  /** Ombre douce sous chaque pied : demi-largeur et alpha relatif. */
  piedLarge: 0.075,
  pied: 1,
  /** Noyau d'occlusion sous la semelle : demi-largeur et alpha relatif. */
  piedNoyau: 0.04,
  noyau: 1,
  /** Hauteur de levée (fraction de la hauteur) à laquelle le contact tombe à 1/e. */
  levee: 0.03,
});

/** Entrées des ombres de contact. */
export interface EntreesOmbres {
  ombre: EtatOmbre;
  /** Hauteur du personnage dans le monde. */
  hauteurMonde: number;
  /** Semelles au repos (px image) et après la pose (px image, skinning compris). */
  piedsRepos: readonly [Vec2, Vec2];
  piedsPose: readonly [Vec2, Vec2];
  /** Image → monde avec la racine de la pose, et sans elle. */
  W: Mat2D;
  W0: Mat2D;
  camera: Mat2D;
}

/** Ellipses des ombres de contact, en px de sortie. */
export function ellipsesContact(e: EntreesOmbres): EllipseDouce[] {
  const o = e.ombre;
  if (o.opacite <= 0 || e.hauteurMonde <= 0) return [];
  const R = REGLAGES_OMBRES;
  const H = e.hauteurMonde;
  const C: Couleur = [R.couleur[0], R.couleur[1], R.couleur[2]];
  const s = Math.hypot(e.camera.a, e.camera.b);
  const rot = Math.atan2(e.camera.b, e.camera.a);
  const ecran = (p: Vec2): Vec2 => appliquer(e.camera, p);
  const ellipses: EllipseDouce[] = [];
  const pieds = [0, 1].map((i) => {
    const pose = appliquer(e.W, e.piedsPose[i]!);
    const sol = appliquer(e.W0, e.piedsRepos[i]!);
    const leve = Math.max(0, sol.y - pose.y);
    return { x: pose.x, sol: sol.y, leve, contact: Math.exp(-leve / (R.levee * H)) };
  });
  // Corps : entre les pieds, sur la moyenne de leurs lignes de sol.
  const xMin = Math.min(pieds[0]!.x, pieds[1]!.x);
  const xMax = Math.max(pieds[0]!.x, pieds[1]!.x);
  const solMoyen = (pieds[0]!.sol + pieds[1]!.sol) / 2;
  const contactMoyen = (pieds[0]!.contact + pieds[1]!.contact) / 2;
  const rxCorps = (xMax - xMin) / 2 + R.margeCorps * H;
  ellipses.push({
    centre: ecran({ x: (xMin + xMax) / 2, y: solMoyen }),
    rx: rxCorps * s,
    ry: rxCorps * o.aplatissement * s,
    rotation: rot,
    couleur: C,
    alpha: o.opacite * R.corps * (0.45 + 0.55 * contactMoyen),
  });
  for (const p of pieds) {
    const etale = 1 + p.leve / (0.06 * H);
    const rxL = R.piedLarge * H * etale;
    ellipses.push({
      centre: ecran({ x: p.x, y: p.sol }),
      rx: rxL * s,
      ry: rxL * o.aplatissement * 1.1 * s,
      rotation: rot,
      couleur: C,
      alpha: o.opacite * R.pied * p.contact,
    });
    const rxN = R.piedNoyau * H * etale;
    ellipses.push({
      centre: ecran({ x: p.x, y: p.sol + 0.004 * H }),
      rx: rxN * s,
      ry: rxN * o.aplatissement * 0.9 * s,
      rotation: rot,
      couleur: C,
      alpha: o.opacite * R.noyau * p.contact * p.contact,
    });
  }
  return ellipses;
}

/** Image → monde → écran composés (utilitaire de test). */
export function composerVersEcran(camera: Mat2D, W: Mat2D): Mat2D {
  return composer(camera, W);
}
