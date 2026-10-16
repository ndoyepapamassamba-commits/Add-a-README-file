/**
 * `evaluer(projet, t, moteur)` : état complet d'une image, fonction PURE du temps.
 *
 * Les modules ne sont pas importés ici : ils sont **injectés** (`creerMoteur`). Chaque module exporte ses
 * fournisseurs (`anim/` → pose, `visage/` → visage, `scene/` → placement, caméra, décor) et `src/assemblage.ts`
 * les branche. Sans module, les fournisseurs neutres (`fournisseursNeutres.ts`) donnent un état valide.
 *
 * Ordre d'évaluation (fixe) :
 *   plan actif → temps du jeu (gel, ralenti) → pour chaque personnage du plan : placement, pose, visage →
 *   tri par ordre de dessin → caméra (connaît les personnages) → décor (connaît la caméra) → sous-titres → sons →
 *   effets.
 * Aucune information ne passe d'une image à l'autre : même `(projet, t)` → même état, dans n'importe quel ordre.
 */
import { sousInstants, nombreImages, imageVersTemps } from '../noyau/temps';
import { tempsDeJeu } from './derives';
import { FOURNISSEURS_NEUTRES } from './fournisseursNeutres';
import { planA } from './projet';
import type {
  ContexteImage,
  ContextePersonnage,
  EtatImage,
  EtatPersonnage,
  Fournisseurs,
  Moteur,
  Projet,
  Ressources,
} from './types';

/** Ressources vides. */
export function ressourcesVides(): Ressources {
  return { rigs: {}, decors: {} };
}

/**
 * Crée un moteur : les fournisseurs donnés remplacent les neutres, les autres restent neutres.
 * Le moteur est gelé (immuable) ; les ressources doivent être chargées avant (rigs, décors).
 */
export function creerMoteur(fournisseurs: Partial<Fournisseurs> = {}, ressources: Partial<Ressources> = {}): Moteur {
  const choisir = <K extends keyof Fournisseurs>(nom: K): Fournisseurs[K] => fournisseurs[nom] ?? FOURNISSEURS_NEUTRES[nom];
  const f: Fournisseurs = {
    pose: choisir('pose'),
    visage: choisir('visage'),
    placement: choisir('placement'),
    camera: choisir('camera'),
    decor: choisir('decor'),
    sousTitres: choisir('sousTitres'),
    sons: choisir('sons'),
    effets: choisir('effets'),
  };
  return Object.freeze({
    fournisseurs: Object.freeze(f),
    ressources: Object.freeze({ rigs: ressources.rigs ?? {}, decors: ressources.decors ?? {} }),
  });
}

/** Moteur entièrement neutre (sans ressources). */
export const MOTEUR_NEUTRE: Moteur = creerMoteur();

/**
 * État complet de l'image à l'instant `t` (s). Le projet doit être normalisé (`normaliserProjet` ou
 * `validerProjet`) : plans et pistes triés. Le projet n'est jamais modifié.
 */
export function evaluer(projet: Projet, t: number, moteur: Moteur = MOTEUR_NEUTRE): EtatImage {
  if (!Number.isFinite(t)) throw new Error(`evaluer : instant invalide (${t})`);
  const f = moteur.fournisseurs;
  const ressources = moteur.ressources;
  const { plan, index } = planA(projet, t);
  const tJeu = tempsDeJeu(projet, t);
  const decor = plan ? (ressources.decors[plan.decor] ?? null) : null;
  const ctx: ContexteImage = {
    projet,
    t,
    tJeu,
    plan,
    indexPlan: index,
    tPlan: plan ? t - plan.debut : 0,
    decor,
    ressources,
  };

  const personnages: EtatPersonnage[] = [];
  if (plan) {
    for (const placement of plan.personnages) {
      const declaration = projet.personnages.find((d) => d.id === placement.personnage);
      if (!declaration) continue; // signalé par validerProjet
      const rig = ressources.rigs[declaration.rig] ?? null;
      const cp: ContextePersonnage = { ...ctx, declaration, placement, rig };
      const pm = f.placement(cp);
      if (!pm.visible) continue;
      personnages.push({
        id: declaration.id,
        rig: declaration.rig,
        visible: true,
        opacite: pm.opacite,
        pose: f.pose(cp),
        visage: f.visage(cp),
        position: pm.position,
        echelle: pm.echelle,
        profondeur: pm.profondeur,
        ordre: pm.ordre,
        ombre: pm.ombre,
        etalonnage: pm.etalonnage,
        flou: pm.flou,
      });
    }
  }
  // Tri stable : à ordre égal, l'ordre du plan est conservé (pas de scintillement).
  personnages.sort((a, b) => a.ordre - b.ordre);

  const camera = f.camera(ctx, personnages);
  const etatDecor = f.decor(ctx, camera);
  return {
    t,
    tJeu,
    plan: plan ? { id: plan.id, index, debut: plan.debut, fin: plan.fin } : null,
    camera,
    decor: etatDecor,
    personnages,
    sousTitres: f.sousTitres(ctx),
    evenementsSon: f.sons(ctx),
    effets: f.effets(ctx),
  };
}

/**
 * Sous-états de l'image `n` pour le flou de bougé exact : `sortie.sousImages` instants dans l'obturation, bornés
 * au plan de l'image (aucun mélange à travers une coupe : la borne est le début du plan suivant). Le premier
 * sous-état est l'image `n` elle-même.
 */
export function etatsImage(projet: Projet, n: number, moteur: Moteur = MOTEUR_NEUTRE): EtatImage[] {
  const t = imageVersTemps(n, projet.fps);
  const { plan, index } = planA(projet, t);
  const suivant = projet.plans[index + 1];
  const limite = plan ? { debut: plan.debut, fin: suivant ? suivant.debut : Infinity } : undefined;
  const instants = sousInstants(t, projet.fps, projet.sortie.sousImages, projet.sortie.obturateur, limite);
  return instants.map((ti) => evaluer(projet, ti, moteur));
}

/** Nombre d'images du projet (`[0, duree[` à `fps`). */
export function nombreImagesProjet(projet: Projet): number {
  return nombreImages(projet.duree, projet.fps);
}
