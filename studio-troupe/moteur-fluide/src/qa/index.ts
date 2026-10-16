/**
 * Module QA (à construire) : porte qualité chiffrée sur l'ÉTAT du moteur et sur la vidéo — énergie de mouvement,
 * à-coups, sauts de pose, glissement des pieds, clignements, fermetures M/B/P, couverture des images, synchro
 * audio, vérification ffprobe et décodage intégral. Verdict PASS / FAIL avec les mesures.
 *
 * ÉTAT : types du rapport seulement. Le constructeur du module complète ce fichier.
 */

/** Un critère mesuré. */
export interface MesureQualite {
  nom: string;
  valeur: number;
  seuil: string;
  ok: boolean;
  detail?: string;
}

/** Rapport de la porte qualité. */
export interface RapportQualite {
  verdict: 'PASS' | 'FAIL';
  mesures: MesureQualite[];
}
