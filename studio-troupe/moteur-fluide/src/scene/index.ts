/**
 * Module SCÈNE : décor 2,5D (parallaxe par la profondeur, figurants, ciel, lumières), placement au sol et échelle
 * réelle, ombres de contact, étalonnage couleur vers le décor, liseré de lumière ; réalisateur caméra (cadrages du
 * sketch vertical, suivi au ressort, punch-in, filé, tremblement, gel, main levée, zones sûres TikTok).
 *
 * Contrats : `fournisseurPlacement(ctx)`, `fournisseurCamera(ctx, personnages)`, `fournisseurDecor(ctx, camera)`,
 * fonctions pures. Ce point d'entrée est sans dépendance à Node (il est embarqué dans la page de rendu) ; l'analyse
 * des images dans Node est dans `scene/analyse.ts` (à importer directement).
 */
export { fournisseurPlacement, etalonnagePour, ombrePour, statsLocales, REGLAGES_PLACEMENT } from './placement';
export {
  fournisseurCamera,
  cameraDuPlan,
  compilerCamera,
  cadrer,
  melangerCadres,
  borneDansDecor,
  bornerDoux,
  versEcran,
  COUVERTURE_PAR_TAILLE,
  COMPOSITION,
  ZONES_SURES,
  REGLAGES_CAMERA,
  type CameraPlan,
  type Cadre,
} from './camera';
export { fournisseurDecor, deplacerParallaxe, REGLAGES_DECOR } from './decor';
export {
  geometrieSujet,
  profondeurSol,
  aplatissementSol,
  pixelsParMetre,
  yeuxRepos,
  ASPECT_DEFAUT,
  SOL_DEFAUT,
  HAUTEUR_OEIL_M,
  type GeometrieSujet,
} from './sol';
export * from './couleur';
export { analyserPixelsDecor, bilineaire, echantillon, type PixelsRGBA } from './analyse-pixels';
