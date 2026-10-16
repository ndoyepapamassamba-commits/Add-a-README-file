/**
 * Conventions de repères partagées par `scene/`, `rendu/` et `qa/` : décor normalisé → monde, monde → écran
 * (caméra), image du personnage → monde. Une seule définition, pour que le rendu et la porte qualité mesurent la
 * même chose.
 */
import { appliquer, composer, inverser, rotation, translation, echelle as matEchelle } from '../noyau/maths2d';
import type { EtatCamera, InfoDecor, Mat2D, PointDecor, PoseRacine, Vec2 } from './types';

/** Point du décor `{u, v}` → repère monde `(u·aspect, v)`. */
export function pointDecorVersMonde(p: PointDecor, decor: Pick<InfoDecor, 'aspect'>): Vec2 {
  return { x: p.u * decor.aspect, y: p.v };
}

/** Repère monde → point du décor `{u, v}`. */
export function mondeVersPointDecor(p: Vec2, decor: Pick<InfoDecor, 'aspect'>): PointDecor {
  return { u: p.x / decor.aspect, v: p.y };
}

/** Pixels de sortie par unité monde (hauteur du décor). */
export function pixelsParUnite(camera: Pick<EtatCamera, 'zoom'>, hauteurSortie: number): number {
  return camera.zoom * hauteurSortie;
}

/**
 * Matrice monde → pixels de sortie :
 * `p_écran = (L/2, H/2) + s·R(−(rotation + tremble.rotation))·(p − (centre + tremble.decalage))`, `s = zoom·H`.
 * La caméra « roule » de `rotation` ; le contenu tourne donc de `−rotation` à l'écran.
 */
export function matriceCamera(camera: EtatCamera, largeur: number, hauteur: number): Mat2D {
  const s = pixelsParUnite(camera, hauteur);
  const cx = camera.centre.x + camera.tremble.decalage.x;
  const cy = camera.centre.y + camera.tremble.decalage.y;
  const rot = -(camera.rotation + camera.tremble.rotation);
  return composer(
    translation(largeur / 2, hauteur / 2),
    composer(matEchelle(s, s), composer(rotation(rot), translation(-cx, -cy))),
  );
}

/** Point monde → pixels de sortie. */
export function mondeVersEcran(camera: EtatCamera, largeur: number, hauteur: number, p: Vec2): Vec2 {
  return appliquer(matriceCamera(camera, largeur, hauteur), p);
}

/** Pixels de sortie → point monde. */
export function ecranVersMonde(camera: EtatCamera, largeur: number, hauteur: number, p: Vec2): Vec2 {
  return appliquer(inverser(matriceCamera(camera, largeur, hauteur)), p);
}

/** Rectangle monde visible (sans tenir compte du roulis), pour le cadrage et les budgets de parallaxe. */
export function fenetreVisible(
  camera: EtatCamera,
  largeur: number,
  hauteur: number,
): { min: Vec2; max: Vec2; largeur: number; hauteur: number } {
  const s = pixelsParUnite(camera, hauteur);
  const w = largeur / s;
  const h = hauteur / s;
  const cx = camera.centre.x + camera.tremble.decalage.x;
  const cy = camera.centre.y + camera.tremble.decalage.y;
  return { min: { x: cx - w / 2, y: cy - h / 2 }, max: { x: cx + w / 2, y: cy + h / 2 }, largeur: w, hauteur: h };
}

/**
 * Matrice de la racine du personnage (px image → px image), autour de l'ancrage au sol :
 * `p' = ancrage + decalage + R(rotation)·S(echelle.x·(flip ? −1 : 1), echelle.y)·(p − ancrage)`.
 */
export function matriceRacine(racine: PoseRacine, ancrageSol: Vec2): Mat2D {
  const sx = racine.echelle.x * (racine.flip ? -1 : 1);
  return composer(
    translation(ancrageSol.x + racine.decalage.x, ancrageSol.y + racine.decalage.y),
    composer(rotation(racine.rotation), composer(matEchelle(sx, racine.echelle.y), translation(-ancrageSol.x, -ancrageSol.y))),
  );
}

/**
 * Matrice px image (après skinning et racine) → monde : `p_monde = position + echelle·(p − ancrage)`.
 * L'ancrage au sol tombe exactement sur `position`.
 */
export function matriceImageVersMonde(position: Vec2, echelleMonde: number, ancrageSol: Vec2): Mat2D {
  return composer(
    translation(position.x, position.y),
    composer(matEchelle(echelleMonde, echelleMonde), translation(-ancrageSol.x, -ancrageSol.y)),
  );
}

/** Ligne d'horizon (fraction de hauteur) pour une caméra à hauteur d'œil de 1,6 m (modèle de sol du kit). */
export function ligneHorizon(decor: Pick<InfoDecor, 'fit'>, hauteurOeilM = 1.6): number {
  return decor.fit.floor - hauteurOeilM / decor.fit.mH;
}

/**
 * Hauteur à l'écran (unités monde) d'un personnage de `tailleM` mètres dont les pieds sont en `v` :
 * `h(v) = tailleM·(v − v_horizon)/1,6`. Sur la ligne de sol : `tailleM / fit.mH`.
 */
export function hauteurMondePersonnage(decor: Pick<InfoDecor, 'fit'>, tailleM: number, v: number, hauteurOeilM = 1.6): number {
  const vh = ligneHorizon(decor, hauteurOeilM);
  return Math.max(0, (tailleM * (v - vh)) / hauteurOeilM);
}
