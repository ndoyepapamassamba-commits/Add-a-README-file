/**
 * Assemblage du moteur : branche les fournisseurs des modules dans `evaluer`. C'est le seul endroit qui importe
 * tous les modules ; chaque module n'exporte que ses fournisseurs (injection de dépendances).
 */
import { fournisseurPose } from './anim';
import { fournisseurCamera, fournisseurDecor, fournisseurPlacement } from './scene';
import { creerMoteur } from './timeline/evaluer';
import type { Moteur, Ressources } from './timeline/types';
import { fournisseurVisage } from './visage';

/** Moteur complet avec les ressources chargées (rigs, décors). */
export function creerMoteurComplet(ressources: Partial<Ressources> = {}): Moteur {
  return creerMoteur(
    {
      pose: fournisseurPose,
      visage: fournisseurVisage,
      placement: fournisseurPlacement,
      camera: fournisseurCamera,
      decor: fournisseurDecor,
    },
    ressources,
  );
}
