/**
 * Aides de test des modules ANIM et VISAGE : projet minimal, contexte de personnage identique à celui
 * qu'`evaluer` construit (sans dépendre des fournisseurs de `scene/`), échantillonnage de poses.
 */
import { rigReference } from '../../src/anim/corps';
import { tempsDeJeu } from '../../src/timeline/derives';
import { normaliserProjet, planA } from '../../src/timeline/projet';
import type {
  ActionPlacee,
  CharacterRig,
  ContextePersonnage,
  InfoDecor,
  Pose,
  Projet,
  Replique,
} from '../../src/timeline/types';

/** Décor fictif (aspect 2, sol à 0,95, 4 m de scène). */
export const DECOR_TEST: InfoDecor = {
  id: 'test',
  nom: 'Décor de test',
  largeur: 2048,
  hauteur: 1024,
  aspect: 2,
  fit: { mH: 4, floor: 0.95, cx: 0.5 },
  fichiers: { src: '', plate: '', depth: '', plateDepth: '', masks: '' },
};

/** Rig de référence partagé (de face). */
export const RIG_TEST: CharacterRig = rigReference(1000, 0, 'ref');

/** Projet à deux personnages face à face (modou à gauche, coumba à droite), un plan de `duree` s. */
export function projetTest(
  actions: Array<Omit<ActionPlacee, 'personnage'> & { personnage?: string }> = [],
  dialogue: Replique[] = [],
  duree = 8,
  fps = 60,
  extra: Partial<Projet> = {},
): Projet {
  return normaliserProjet({
    format: 'moteur-fluide/projet@1',
    titre: 'test',
    fps,
    duree,
    sortie: { largeur: 1080, hauteur: 1920, sousImages: 1, obturateur: 0.5, graine: 3 },
    personnages: [
      { id: 'modou', nom: 'MODOU', rig: 'ref', tailleM: 1.76 },
      { id: 'coumba', nom: 'COUMBA', rig: 'ref', tailleM: 1.7 },
    ],
    plans: [
      {
        id: 'p1',
        debut: 0,
        fin: duree,
        decor: 'test',
        cadrage: { taille: 'moyen' },
        personnages: [
          { personnage: 'modou', u: 0.4, orientation: 1 },
          { personnage: 'coumba', u: 0.6, orientation: -1 },
        ],
      },
    ],
    pistes: {
      actions: actions.map((a) => ({ personnage: 'modou', ...a })),
      dialogue,
      camera: [],
      sons: [],
    },
    ...extra,
  } as Projet);
}

/** Contexte d'un personnage à l'instant `t` (comme `evaluer`). */
export function contexte(projet: Projet, t: number, id = 'modou', rig: CharacterRig | null = RIG_TEST): ContextePersonnage {
  const { plan, index } = planA(projet, t);
  const declaration = projet.personnages.find((d) => d.id === id)!;
  const placement = plan!.personnages.find((p) => p.personnage === id)!;
  return {
    projet,
    t,
    tJeu: tempsDeJeu(projet, t),
    plan,
    indexPlan: index,
    tPlan: plan ? t - plan.debut : 0,
    decor: DECOR_TEST,
    ressources: { rigs: rig ? { ref: rig } : {}, decors: { test: DECOR_TEST } },
    declaration,
    placement,
    rig,
  };
}

/** Canaux scalaires d'une pose (os.r/tx/ty/sx/sy, racine.*). */
export function canauxPose(p: Pose): Record<string, number> {
  const r: Record<string, number> = {};
  for (const [nom, o] of Object.entries(p.os)) {
    r[`${nom}.r`] = o.rotation;
    r[`${nom}.tx`] = o.translation.x;
    r[`${nom}.ty`] = o.translation.y;
    r[`${nom}.sx`] = o.echelle.x - 1;
    r[`${nom}.sy`] = o.echelle.y - 1;
  }
  r['racine.r'] = p.racine.rotation;
  r['racine.tx'] = p.racine.decalage.x;
  r['racine.ty'] = p.racine.decalage.y;
  r['racine.sx'] = p.racine.echelle.x - 1;
  r['racine.sy'] = p.racine.echelle.y - 1;
  return r;
}

/** Écart maximal entre deux poses, séparé en rotations (rad), translations (px) et échelles. */
export function ecartPoses(a: Pose, b: Pose): { rotation: number; translation: number; echelle: number; pire: string } {
  const ca = canauxPose(a);
  const cb = canauxPose(b);
  const cles = new Set([...Object.keys(ca), ...Object.keys(cb)]);
  let rotation = 0;
  let translation = 0;
  let echelle = 0;
  let pire = '';
  let pireV = 0;
  for (const k of cles) {
    const d = Math.abs((ca[k] ?? 0) - (cb[k] ?? 0));
    const type = k.slice(k.lastIndexOf('.') + 1);
    if (type === 'r') rotation = Math.max(rotation, d);
    else if (type === 'tx' || type === 'ty') translation = Math.max(translation, d);
    else echelle = Math.max(echelle, d);
    const norme = type === 'r' ? d : type === 'tx' || type === 'ty' ? d / 100 : d * 2;
    if (norme > pireV) {
      pireV = norme;
      pire = k;
    }
  }
  return { rotation, translation, echelle, pire };
}
