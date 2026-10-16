/**
 * Module ANIM (à construire) : bibliothèque d'actions (recettes anticipation → action → dépassement → retour),
 * couches et mélange par os, chevauchement, micro-vie (respiration, poids, bruit), physique secondaire.
 * Contrat : `fournisseurPose(ctx) → Pose` (fonction pure de `ctx.tJeu`).
 *
 * ÉTAT : ébauche du socle (pose de repos). Le constructeur du module remplace ce fichier.
 */
import { poseParDefaut } from '../timeline/fournisseursNeutres';
import type { FournisseurPose } from '../timeline/types';

export const fournisseurPose: FournisseurPose = poseParDefaut;
