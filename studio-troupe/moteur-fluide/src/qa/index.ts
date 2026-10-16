/**
 * Module QA : porte qualité chiffrée sur l'ÉTAT du moteur et sur la vidéo — énergie de mouvement (minimum ET
 * maximum : l'échec « trop lego » était un mouvement trop faible), à-coups et tremblement, sauts de pose, glissement
 * des pieds, immobilité, clignements, fermetures M/B/P et synchro labiale, vitesses de caméra, valeurs non finies,
 * déterminisme ; puis, sur le MP4, différences entre images (degré de dynamique, images figées, sauts de lumière) et
 * planche contact. Verdict PASS / FAIL avec les mesures.
 *
 * - `metriques.ts` : séries et mesures (fonctions pures) ;
 * - `porte.ts` : seuils, verdict, rapport Markdown ;
 * - `pixels.ts` : mesures sur les pixels du MP4 et planche contact (FFmpeg).
 */

export type { MesureQualite, RapportQualite } from './types';
export * from './metriques';
export * from './porte';
export * from './pixels';
