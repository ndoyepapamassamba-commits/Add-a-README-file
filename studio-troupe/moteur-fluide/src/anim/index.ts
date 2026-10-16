/**
 * Module ANIM : jeu d'acteur procédural du moteur fluide.
 *
 * - `actions.ts` : bibliothèque de recettes paramétrées (respirer, attendre, regarder, hocher, hausser les
 *   épaules, pointer, mains ouvertes, bras croisés, surprise, colère, gêne, rire, rire plié, recul, flexion,
 *   marcher, s'arrêter, se tourner, gestes de parole, s'asseoir, se lever, prendre, poser), chacune avec
 *   anticipation → action → dépassement → retour au calme, amples et lisibles sur téléphone.
 * - `couches.ts` : couches, masques par zone, priorités, interruptions, vie de base implicite, ressorts
 *   analytiques par os (chevauchement et follow-through), signaux directs, secondaire.
 * - `physique.ts` : pendules et chaînes analytiques (foulards, pagnes, ourlets, ventre).
 * - `corps.ts` : lecture du rig (sens des rotations, longueurs), rig de référence.
 * - `cibles.ts` : cibles de regard et de geste dans le repère du dessin.
 *
 * Contrat : `fournisseurPose(ctx) → Pose`, fonction pure de `ctx.tJeu` (compilation mémorisée par plan).
 */
import { poseParDefaut } from '../timeline/fournisseursNeutres';
import type { FournisseurPose } from '../timeline/types';
import { compilerAnimation } from './couches';

/** Pose d'un personnage (pose de repos si le rig ou le plan manque). */
export const fournisseurPose: FournisseurPose = (ctx) => {
  const a = compilerAnimation(ctx);
  if (!a) return poseParDefaut(ctx);
  return a.pose(ctx.tJeu);
};

export { compilerAnimation, compiler, type AnimationCompilee, type ActionCompilee } from './couches';
export { RECETTES, recette, dureeAction, phases, Ecriture, type Recette, type ParamsRecette, type Contribution } from './actions';
export { rigReference, morphologie, signeAbduction, signeVers, type Morphologie } from './corps';
export { contexteAnim, resoudreCible, sensImage, miroirA, type ContexteAnim, type CibleResolue } from './cibles';
export { reponseHarmonique, creerPendule, creerRetard, compilerChaine, oscillationAmortie } from './physique';
export { RESSORTS_DEFAUT, resoudrePersonnalite, ressortCanal, ZONES, type Zone } from './reglages';
export { INDICES_VISAGE, indicesVisageNuls, type IndicesVisage, type IndiceVisage } from './canaux';
