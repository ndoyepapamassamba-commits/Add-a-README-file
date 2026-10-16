/**
 * Module RIG : squelette, cinématique directe et inverse (2 os, IK douce), maillage tiré du masque alpha (Delaunay
 * conforme, densité adaptative), poids « parties + bandes harmoniques », skinning CoR-2D (LBS en secours).
 * Contrat : `deformer(rig, pose) → sommets` (positions déformées, px image, AVANT la racine de la pose).
 *
 * Ce point d'entrée est PUR et sans dépendance à Node : il peut être embarqué dans la page de rendu.
 * La lecture des fichiers (`rig.json`, PNG) est dans `rig/charger.ts` (Node seulement, à importer directement).
 */
import type { CharacterRig, Pose } from '../timeline/types';
import { calculerFK, type OptionsFK } from './fk';
import { deformerSommets, type MethodePeau } from './peau';

export * from './squelette';
export * from './fk';
export * from './ik';
export * from './peau';
export { construireMaillage, contoursIso, couvertureMasque, masqueAlpha, simplifierBoucle, aireBoucle, pasLocal } from './maillage';
export type { ImageRGBA, MaillageBrut, OptionsMaillage, StatsMaillage, ZoneDensite } from './maillage';
export { calculerPoids } from './poids';
export type { MaillagePondere, OptionsPoids, StatsPoids } from './poids';
export { construireRig, etiquettesDeCarte, squeletteDeSource, validerSourceRig, FORMAT_SOURCE_RIG } from './construire';
export type { RapportRig, SourceRig } from './construire';
export { distanceSignee, transformeeDistance } from './distance';

/** Options de `deformer`. */
export interface OptionsDeformer extends OptionsFK {
  /** Méthode de skinning (défaut : `cor` si le maillage a des centres de rotation, sinon `lbs`). */
  methode?: MethodePeau;
  /** Tableau de sortie réutilisé (2V), pour éviter une allocation par image. */
  sortie?: Float32Array;
}

/**
 * Positions déformées des sommets (2V, px image, AVANT la transformation de racine `Pose.racine`, que
 * `timeline/projection.matriceRacine` applique ensuite). Pure : même rig et même pose → mêmes sommets.
 * Au repos (pose vide), renvoie exactement les positions de repos.
 */
export function deformer(rig: CharacterRig, pose: Pose, options: OptionsDeformer = {}): Float32Array {
  const etat = calculerFK(rig.squelette, pose, options);
  return deformerSommets(rig.maillage, rig.squelette, etat, options.methode, options.sortie);
}
