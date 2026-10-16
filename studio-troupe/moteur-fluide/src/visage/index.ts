/**
 * Module VISAGE (à construire) : visèmes français et coarticulation, bouche (ouverture, largeur, arrondi), yeux
 * (clignements, saccades, regard), sourcils, prosodie.
 * Contrat : `fournisseurVisage(ctx) → EtatVisage` (fonction pure de `ctx.tJeu`).
 *
 * ÉTAT : ébauche du socle (visage neutre). Le constructeur du module remplace ce fichier.
 */
import { visageParDefaut } from '../timeline/fournisseursNeutres';
import type { FournisseurVisage } from '../timeline/types';

export const fournisseurVisage: FournisseurVisage = visageParDefaut;
