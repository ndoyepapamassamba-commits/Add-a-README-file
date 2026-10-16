/**
 * Page de rendu (Chromium sans écran, PixiJS v8) : reçoit des `EtatImage` et dessine l'image de sortie en DÉFORMANT
 * les dessins (maillages texturés), jamais en les redessinant.
 *
 * Deux interfaces :
 * - `window.moteurFluide` (contrat `ApiPageRendu`) : `initialiser(options)`, `dessiner(sousEtats)`, `capturer()` —
 *   l'appelant évalue les états lui-même (Node) ;
 * - `window.moteur` (banc d'export) : `charger(projet, options?)` valide le projet, précharge décors et rigs,
 *   assemble le moteur dans la page ; `rendreImage(i)` évalue les sous-états de l'image `i` (flou de bougé exact)
 *   et la dessine ; `derniereMesure` donne les durées.
 */
import { creerMoteurComplet } from '../assemblage';
import { etatsImage, nombreImagesProjet } from '../timeline/evaluer';
import { validerProjet } from '../timeline/projet';
import type { ApiPageRendu, EtatImage, Moteur, OptionsPageRendu, Projet, Ressources } from '../timeline/types';
import { MoteurRendu, type MesureImage } from './moteurRendu';

/** Version de la page. */
export const VERSION_PAGE = '0.2.0';

/** Options de `moteur.charger`. */
export interface OptionsChargement {
  ressources?: Partial<Ressources>;
  urlRessources?: string;
  /** Sous-états identiques dessinés une seule fois (défaut vrai ; faux pour mesurer le coût plein). */
  flouAdaptatif?: boolean;
}

/** Informations rendues par `moteur.charger`. */
export interface InfoChargement {
  images: number;
  fps: number;
  duree: number;
  largeur: number;
  hauteur: number;
  avertissements: string[];
  formatAccumulation: string;
  msChargement: number;
}

/** Interface du banc d'export. */
export interface ApiMoteurPage {
  readonly version: string;
  charger(projet: unknown, options?: OptionsChargement): Promise<InfoChargement>;
  rendreImage(i: number): Promise<void>;
  /** Sous-états de l'image `i` (diagnostic, QA). */
  etats(i: number): EtatImage[];
  nombreImages(): number;
  derniereMesure: (MesureImage & { msEvaluation: number }) | null;
}

declare global {
  interface Window {
    moteurFluide?: ApiPageRendu;
    moteur?: ApiMoteurPage;
  }
}

const rendu = new MoteurRendu();
let projetCourant: Projet | null = null;
let moteurCourant: Moteur | null = null;

const apiRendu: ApiPageRendu = {
  version: VERSION_PAGE,
  async initialiser(options: OptionsPageRendu): Promise<void> {
    await rendu.initialiser(options);
  },
  async dessiner(sousEtats: EtatImage[]): Promise<void> {
    await rendu.dessiner(sousEtats);
  },
  async capturer(format: 'jpeg' | 'png', qualite = 0.95): Promise<string> {
    return rendu.capturer(format, qualite);
  },
};

const apiMoteur: ApiMoteurPage = {
  version: VERSION_PAGE,
  derniereMesure: null,
  async charger(projet: unknown, options: OptionsChargement = {}): Promise<InfoChargement> {
    const t0 = performance.now();
    const v = validerProjet(projet);
    if (!v.ok || !v.projet) throw new Error(`Projet invalide :\n- ${v.erreurs.join('\n- ')}`);
    const p = v.projet;
    if (!rendu.pret) {
      await rendu.initialiser({
        largeur: p.sortie.largeur,
        hauteur: p.sortie.hauteur,
        fond: p.sortie.fond,
        ressources: { rigs: options.ressources?.rigs ?? {}, decors: options.ressources?.decors ?? {} },
        urlRessources: options.urlRessources ?? '/fichiers',
      });
    } else if (options.ressources) {
      rendu.ajouterRessources(options.ressources);
    }
    if (options.flouAdaptatif !== undefined) rendu.flouAdaptatif = options.flouAdaptatif;
    const avertissements = [...v.avertissements];
    const decors = [...new Set(p.plans.map((pl) => pl.decor))];
    for (const d of decors) if (!rendu.ressources.decors[d]) avertissements.push(`décor « ${d} » absent des ressources`);
    const rigs = [...new Set(p.personnages.map((d) => d.rig))];
    for (const r of rigs) if (!rendu.ressources.rigs[r]) avertissements.push(`rig « ${r} » absent des ressources`);
    // Le préchargement complète les analyses (décors) et les statistiques de couleur (rigs) avant l'assemblage.
    await rendu.precharger(decors, rigs);
    projetCourant = p;
    moteurCourant = creerMoteurComplet(rendu.ressources);
    return {
      images: nombreImagesProjet(p),
      fps: p.fps,
      duree: p.duree,
      largeur: p.sortie.largeur,
      hauteur: p.sortie.hauteur,
      avertissements,
      formatAccumulation: rendu.formatAccumulation,
      msChargement: performance.now() - t0,
    };
  },
  etats(i: number): EtatImage[] {
    if (!projetCourant || !moteurCourant) throw new Error('Aucun projet chargé (moteur.charger)');
    return etatsImage(projetCourant, i, moteurCourant);
  },
  nombreImages(): number {
    return projetCourant ? nombreImagesProjet(projetCourant) : 0;
  },
  async rendreImage(i: number): Promise<void> {
    if (!projetCourant || !moteurCourant) throw new Error('Aucun projet chargé (moteur.charger)');
    const t0 = performance.now();
    const etats = etatsImage(projetCourant, i, moteurCourant);
    const msEvaluation = performance.now() - t0;
    const m = await rendu.dessiner(etats);
    apiMoteur.derniereMesure = { ...m, msEvaluation };
  },
};

window.moteurFluide = apiRendu;
window.moteur = apiMoteur;
// Accès de diagnostic (mesures par couche, essais) : non contractuel.
(window as unknown as { moteurDiagnostic: MoteurRendu }).moteurDiagnostic = rendu;
