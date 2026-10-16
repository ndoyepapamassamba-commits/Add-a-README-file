/**
 * Cinématique directe minimale pour les tests (même convention que le contrat : transformations locales autour
 * du pivot de repos, dans le repère du parent, puis racine autour de l'ancrage au sol). Sert à mesurer les pieds
 * (glissement, contact au sol) sans dépendre du module `rig/`.
 */
import { appliquer, composer, echelle, identite, rotation, translation } from '../../src/noyau/maths2d';
import { matriceRacine } from '../../src/timeline/projection';
import type { CharacterRig, Mat2D, Pose, Vec2 } from '../../src/timeline/types';

/** Matrices monde (px image, racine comprise) de chaque os. */
export function matricesOs(rig: CharacterRig, pose: Pose): Map<string, Mat2D> {
  const locales = new Map<string, Mat2D>();
  const R = matriceRacine(pose.racine, rig.ancrageSol);
  for (const o of rig.squelette.os) {
    const P = o.parent ? locales.get(o.parent)! : identite();
    const t = pose.os[o.nom];
    let L = translation(o.pivot.x, o.pivot.y);
    if (t) {
      L = composer(L, composer(translation(t.translation.x, t.translation.y), composer(rotation(t.rotation), echelle(t.echelle.x, t.echelle.y))));
    }
    L = composer(L, translation(-o.pivot.x, -o.pivot.y));
    locales.set(o.nom, composer(P, L));
  }
  const r = new Map<string, Mat2D>();
  for (const [k, m] of locales) r.set(k, composer(R, m));
  return r;
}

/** Position (px image, après racine) d'un point de repos porté par un os. */
export function pointOs(rig: CharacterRig, pose: Pose, os: string, p: Vec2): Vec2 {
  return appliquer(matricesOs(rig, pose).get(os)!, p);
}

/** Extrémité d'un os (px image, après racine). */
export function extremiteOs(rig: CharacterRig, pose: Pose, nom: string): Vec2 {
  const o = rig.squelette.os.find((x) => x.nom === nom)!;
  const tip = { x: o.pivot.x + Math.cos(o.angleRepos) * o.longueur, y: o.pivot.y + Math.sin(o.angleRepos) * o.longueur };
  return pointOs(rig, pose, nom, tip);
}
