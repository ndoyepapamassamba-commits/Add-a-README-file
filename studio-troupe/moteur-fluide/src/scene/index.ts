/**
 * Module SCÈNE (à construire) : décor 2,5D (plaque, profondeur, figurants, ciel), placement au sol et échelle,
 * occlusion, ombres, étalonnage ; caméra et réalisateur (cadrages, punch-in, filé, tremblement, gel).
 * Contrats : `fournisseurPlacement(ctx)`, `fournisseurCamera(ctx, personnages)`, `fournisseurDecor(ctx, camera)`.
 *
 * ÉTAT : ébauche du socle (modèle de sol du kit, caméra posée, décor immobile). Le constructeur du module
 * remplace ce fichier.
 */
import { cameraParDefaut, decorParDefaut, placementParDefaut } from '../timeline/fournisseursNeutres';
import type { FournisseurCamera, FournisseurDecor, FournisseurPlacement } from '../timeline/types';

export const fournisseurPlacement: FournisseurPlacement = placementParDefaut;
export const fournisseurCamera: FournisseurCamera = cameraParDefaut;
export const fournisseurDecor: FournisseurDecor = decorParDefaut;
