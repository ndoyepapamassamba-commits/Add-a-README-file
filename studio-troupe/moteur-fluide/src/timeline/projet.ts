/**
 * Projet : validation d'un fichier `*.projet.json`, normalisation (valeurs par défaut, tris stables), accès aux
 * plans, personnages et actions. Messages d'erreur en français, avec le chemin JSON fautif.
 */
import { estNomEasing } from '../noyau/courbes';
import { sortieParDefaut } from './neutres';
import {
  ACTIONS_CATALOGUE,
  FORMAT_PROJET,
  VISEMES,
  type ActionPlacee,
  type DeclarationPersonnage,
  type MouvementCamera,
  type Plan,
  type Projet,
} from './types';

/** Résultat de validation. */
export interface ResultatValidation {
  ok: boolean;
  erreurs: string[];
  avertissements: string[];
  /** Projet normalisé si `ok`. */
  projet?: Projet;
}

const TYPES_CAMERA: ReadonlySet<MouvementCamera['type']> = new Set([
  'recadrer',
  'panoramique',
  'punchIn',
  'file',
  'tremblement',
  'gel',
  'ralenti',
  'fondu',
]);
const TYPES_SON = new Set(['voix', 'effet', 'musique', 'ambiance']);
const TAILLES_PLAN = new Set(['ensemble', 'large', 'moyen', 'americain', 'rapproche', 'gros', 'tresGros']);

function estObjet(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
function estNombre(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}
function estTexte(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

/**
 * Valide un projet lu depuis JSON. Ne lève pas d'exception : renvoie la liste des erreurs (bloquantes) et des
 * avertissements (actions hors catalogue, chevauchements de gels…). Si `ok`, `projet` est la version normalisée.
 */
export function validerProjet(entree: unknown): ResultatValidation {
  const erreurs: string[] = [];
  const avertissements: string[] = [];
  const err = (chemin: string, msg: string): void => {
    erreurs.push(`${chemin} : ${msg}`);
  };

  if (!estObjet(entree)) return { ok: false, erreurs: ['projet : un objet JSON est attendu'], avertissements };
  const p = entree;
  if (p.format !== FORMAT_PROJET) err('format', `« ${FORMAT_PROJET} » attendu (reçu ${JSON.stringify(p.format)})`);
  if (typeof p.titre !== 'string') err('titre', 'texte attendu');
  if (!estNombre(p.fps) || p.fps <= 0 || p.fps > 240) err('fps', 'cadence entre 1 et 240 i/s attendue');
  if (!estNombre(p.duree) || p.duree <= 0) err('duree', 'durée positive (s) attendue');
  const duree = estNombre(p.duree) ? p.duree : 0;

  if (p.sortie !== undefined) {
    if (!estObjet(p.sortie)) err('sortie', 'objet attendu');
    else {
      for (const k of ['largeur', 'hauteur', 'sousImages', 'obturateur', 'graine'] as const) {
        if (p.sortie[k] !== undefined && !estNombre(p.sortie[k])) err(`sortie.${k}`, 'nombre attendu');
      }
      const L = p.sortie.largeur;
      const H = p.sortie.hauteur;
      if (estNombre(L) && (L <= 0 || L % 2 !== 0)) err('sortie.largeur', 'entier pair positif attendu (H.264)');
      if (estNombre(H) && (H <= 0 || H % 2 !== 0)) err('sortie.hauteur', 'entier pair positif attendu (H.264)');
      if (estNombre(p.sortie.sousImages) && (p.sortie.sousImages < 1 || p.sortie.sousImages > 64)) {
        err('sortie.sousImages', 'entre 1 et 64');
      }
      if (estNombre(p.sortie.obturateur) && (p.sortie.obturateur < 0 || p.sortie.obturateur > 1)) {
        err('sortie.obturateur', 'entre 0 et 1');
      }
    }
  }

  const ids = new Set<string>();
  if (!Array.isArray(p.personnages)) err('personnages', 'tableau attendu');
  else {
    p.personnages.forEach((d: unknown, i) => {
      const c = `personnages[${i}]`;
      if (!estObjet(d)) return err(c, 'objet attendu');
      if (!estTexte(d.id)) err(`${c}.id`, 'identifiant attendu');
      else if (ids.has(d.id)) err(`${c}.id`, `identifiant en double « ${d.id} »`);
      else ids.add(d.id);
      if (typeof d.nom !== 'string') err(`${c}.nom`, 'texte attendu');
      if (!estTexte(d.rig)) err(`${c}.rig`, 'identifiant de rig attendu');
      if (!estNombre(d.tailleM) || d.tailleM <= 0.3 || d.tailleM > 3) err(`${c}.tailleM`, 'taille en mètres attendue');
    });
  }

  const idsPlans = new Set<string>();
  if (!Array.isArray(p.plans)) err('plans', 'tableau attendu');
  else {
    const plans = p.plans as unknown[];
    plans.forEach((pl, i) => {
      const c = `plans[${i}]`;
      if (!estObjet(pl)) return err(c, 'objet attendu');
      if (!estTexte(pl.id)) err(`${c}.id`, 'identifiant attendu');
      else if (idsPlans.has(pl.id)) err(`${c}.id`, `identifiant en double « ${pl.id} »`);
      else idsPlans.add(pl.id);
      if (!estNombre(pl.debut) || !estNombre(pl.fin) || pl.fin <= pl.debut) err(c, 'debut < fin attendus (s)');
      if (!estTexte(pl.decor)) err(`${c}.decor`, 'identifiant de décor attendu');
      if (!estObjet(pl.cadrage)) err(`${c}.cadrage`, 'objet attendu');
      else {
        if (pl.cadrage.taille !== undefined && !TAILLES_PLAN.has(String(pl.cadrage.taille))) {
          err(`${c}.cadrage.taille`, `taille inconnue « ${String(pl.cadrage.taille)} »`);
        }
        if (Array.isArray(pl.cadrage.sujets)) {
          for (const s of pl.cadrage.sujets) if (!ids.has(String(s))) err(`${c}.cadrage.sujets`, `personnage inconnu « ${String(s)} »`);
        }
        if (pl.cadrage.zoom !== undefined && (!estNombre(pl.cadrage.zoom) || pl.cadrage.zoom <= 0)) {
          err(`${c}.cadrage.zoom`, 'nombre positif attendu');
        }
      }
      if (!Array.isArray(pl.personnages)) err(`${c}.personnages`, 'tableau attendu');
      else {
        pl.personnages.forEach((pp: unknown, j) => {
          const cj = `${c}.personnages[${j}]`;
          if (!estObjet(pp)) return err(cj, 'objet attendu');
          if (!ids.has(String(pp.personnage))) err(`${cj}.personnage`, `personnage inconnu « ${String(pp.personnage)} »`);
          if (!estNombre(pp.u)) err(`${cj}.u`, 'fraction de largeur attendue');
          if (pp.v !== undefined && !estNombre(pp.v)) err(`${cj}.v`, 'fraction de hauteur attendue');
          if (pp.orientation !== undefined && pp.orientation !== 1 && pp.orientation !== -1) {
            err(`${cj}.orientation`, '1 ou -1 attendu');
          }
        });
      }
    });
    // Chevauchements (après tri par début).
    const tries = plans
      .filter((x): x is Record<string, unknown> => estObjet(x) && estNombre(x.debut) && estNombre(x.fin))
      .sort((a, b) => (a.debut as number) - (b.debut as number));
    for (let i = 1; i < tries.length; i++) {
      if ((tries[i]!.debut as number) < (tries[i - 1]!.fin as number) - 1e-9) {
        err('plans', `les plans « ${String(tries[i - 1]!.id)} » et « ${String(tries[i]!.id)} » se chevauchent`);
      }
    }
    if (tries.length > 0 && duree > 0) {
      const finDernier = tries[tries.length - 1]!.fin as number;
      if (finDernier < duree - 1e-9) avertissements.push(`plans : le dernier plan finit à ${finDernier} s, avant la fin du projet (${duree} s)`);
      if ((tries[0]!.debut as number) > 1e-9) avertissements.push('plans : aucun plan ne couvre le début du projet');
    }
  }

  if (!estObjet(p.pistes)) err('pistes', 'objet attendu');
  else {
    const pistes = p.pistes;
    const catalogue = new Set<string>(ACTIONS_CATALOGUE);
    if (!Array.isArray(pistes.actions)) err('pistes.actions', 'tableau attendu');
    else {
      pistes.actions.forEach((a: unknown, i) => {
        const c = `pistes.actions[${i}]`;
        if (!estObjet(a)) return err(c, 'objet attendu');
        if (!ids.has(String(a.personnage))) err(`${c}.personnage`, `personnage inconnu « ${String(a.personnage)} »`);
        if (!estTexte(a.action)) err(`${c}.action`, "identifiant d'action attendu");
        else if (!catalogue.has(a.action)) avertissements.push(`${c}.action : « ${a.action} » hors catalogue`);
        if (!estNombre(a.debut)) err(`${c}.debut`, 'instant (s) attendu');
        if (a.duree !== undefined && (!estNombre(a.duree) || a.duree <= 0)) err(`${c}.duree`, 'durée positive attendue');
        if (a.intensite !== undefined && (!estNombre(a.intensite) || a.intensite < 0)) err(`${c}.intensite`, 'nombre ≥ 0 attendu');
        if (a.tempo !== undefined && (!estNombre(a.tempo) || a.tempo <= 0)) err(`${c}.tempo`, 'nombre > 0 attendu');
        if (a.cible !== undefined) {
          const ci = a.cible;
          const okCible =
            estObjet(ci) &&
            ((typeof ci.personnage === 'string' && ids.has(ci.personnage)) ||
              (estObjet(ci.point) && estNombre(ci.point.u) && estNombre(ci.point.v)) ||
              ci.camera === true);
          if (!okCible) err(`${c}.cible`, '{personnage}, {point: {u, v}} ou {camera: true} attendu');
        }
      });
    }
    const idsRepliques = new Set<string>();
    if (!Array.isArray(pistes.dialogue)) err('pistes.dialogue', 'tableau attendu');
    else {
      pistes.dialogue.forEach((r: unknown, i) => {
        const c = `pistes.dialogue[${i}]`;
        if (!estObjet(r)) return err(c, 'objet attendu');
        if (!estTexte(r.id)) err(`${c}.id`, 'identifiant attendu');
        else if (idsRepliques.has(r.id)) err(`${c}.id`, `identifiant en double « ${r.id} »`);
        else idsRepliques.add(r.id);
        if (!ids.has(String(r.personnage))) err(`${c}.personnage`, `personnage inconnu « ${String(r.personnage)} »`);
        if (typeof r.texte !== 'string') err(`${c}.texte`, 'texte attendu');
        if (!estNombre(r.debut)) err(`${c}.debut`, 'instant (s) attendu');
        if (r.fin !== undefined && (!estNombre(r.fin) || (estNombre(r.debut) && r.fin <= r.debut))) err(`${c}.fin`, 'fin > debut attendue');
        if (r.phonemes !== undefined) {
          if (!Array.isArray(r.phonemes)) err(`${c}.phonemes`, 'tableau attendu');
          else {
            let precedent = -Infinity;
            r.phonemes.forEach((ph: unknown, j) => {
              const cj = `${c}.phonemes[${j}]`;
              if (!estObjet(ph) || typeof ph.ph !== 'string' || !estNombre(ph.debut) || !estNombre(ph.fin)) {
                return err(cj, '{ph, debut, fin} attendu');
              }
              if (ph.fin < ph.debut) err(cj, 'fin < debut');
              if (ph.debut < precedent - 1e-9) err(cj, 'phonèmes non triés');
              precedent = ph.debut;
            });
          }
        }
        if (r.visemes !== undefined) {
          if (!Array.isArray(r.visemes)) err(`${c}.visemes`, 'tableau attendu');
          else {
            const vis = new Set<string>(VISEMES);
            r.visemes.forEach((k: unknown, j) => {
              if (!estObjet(k) || !estNombre(k.t) || !vis.has(String(k.viseme))) err(`${c}.visemes[${j}]`, '{t, viseme} attendu');
            });
          }
        }
      });
    }
    if (!Array.isArray(pistes.camera)) err('pistes.camera', 'tableau attendu');
    else {
      pistes.camera.forEach((m: unknown, i) => {
        const c = `pistes.camera[${i}]`;
        if (!estObjet(m)) return err(c, 'objet attendu');
        if (!TYPES_CAMERA.has(m.type as MouvementCamera['type'])) err(`${c}.type`, `mouvement inconnu « ${String(m.type)} »`);
        if (!estNombre(m.debut)) err(`${c}.debut`, 'instant (s) attendu');
        if (!estNombre(m.duree) || m.duree <= 0) err(`${c}.duree`, 'durée positive attendue');
        if (m.easing !== undefined && !(typeof m.easing === 'string' && estNomEasing(m.easing))) {
          err(`${c}.easing`, `courbe inconnue « ${String(m.easing)} »`);
        }
        if (m.type === 'punchIn' && !ids.has(String(m.sujet))) err(`${c}.sujet`, `personnage inconnu « ${String(m.sujet)} »`);
        if (m.type === 'ralenti' && (!estNombre(m.facteur) || m.facteur < 0)) err(`${c}.facteur`, 'facteur ≥ 0 attendu');
        if ((m.type === 'panoramique' || m.type === 'file') && !(estObjet(m.vers) && estNombre(m.vers.u) && estNombre(m.vers.v))) {
          err(`${c}.vers`, '{u, v} attendu');
        }
        if (m.type === 'fondu' && m.sens !== 'entree' && m.sens !== 'sortie') err(`${c}.sens`, '« entree » ou « sortie » attendu');
      });
    }
    if (!Array.isArray(pistes.sons)) err('pistes.sons', 'tableau attendu');
    else {
      pistes.sons.forEach((s: unknown, i) => {
        const c = `pistes.sons[${i}]`;
        if (!estObjet(s)) return err(c, 'objet attendu');
        if (!estTexte(s.id)) err(`${c}.id`, 'identifiant attendu');
        if (!estTexte(s.fichier)) err(`${c}.fichier`, 'chemin attendu');
        if (!estNombre(s.debut)) err(`${c}.debut`, 'instant (s) attendu');
        if (!TYPES_SON.has(String(s.type))) err(`${c}.type`, `type inconnu « ${String(s.type)} »`);
      });
    }
  }

  if (erreurs.length > 0) return { ok: false, erreurs, avertissements };
  return { ok: true, erreurs, avertissements, projet: normaliserProjet(entree as unknown as Projet) };
}

/** Tri stable par une clé numérique. */
function trierStable<T>(t: readonly T[], cle: (x: T) => number): T[] {
  return t
    .map((x, i) => ({ x, i }))
    .sort((a, b) => cle(a.x) - cle(b.x) || a.i - b.i)
    .map((e) => e.x);
}

/**
 * Copie normalisée d'un projet (l'original n'est jamais modifié) : réglages de sortie complétés, plans, actions,
 * répliques, mouvements de caméra et sons triés de façon stable par début.
 */
export function normaliserProjet(projet: Projet): Projet {
  const copie = structuredClone(projet) as Projet;
  copie.sortie = { ...sortieParDefaut(), ...(copie.sortie ?? {}) };
  copie.plans = trierStable(copie.plans, (p) => p.debut);
  copie.pistes = {
    actions: trierStable(copie.pistes?.actions ?? [], (a) => a.debut),
    dialogue: trierStable(copie.pistes?.dialogue ?? [], (r) => r.debut),
    camera: trierStable(copie.pistes?.camera ?? [], (m) => m.debut),
    sons: trierStable(copie.pistes?.sons ?? [], (s) => s.debut),
  };
  return copie;
}

/** Projet vide valide (9:16, 30 i/s). */
export function creerProjetVide(titre: string, duree = 5, fps = 30): Projet {
  return {
    format: FORMAT_PROJET,
    titre,
    fps,
    duree,
    sortie: sortieParDefaut(),
    personnages: [],
    plans: [],
    pistes: { actions: [], dialogue: [], camera: [], sons: [] },
  };
}

/**
 * Plan actif à l'instant `t` : celui qui contient `t` (`[debut, fin[`). Dans un trou entre deux plans, le plan
 * précédent est tenu ; avant le premier plan, le premier ; après le dernier, le dernier. `null` sans plan.
 * Les plans doivent être triés par début (voir `normaliserProjet`).
 */
export function planA(projet: Projet, t: number): { plan: Plan | null; index: number } {
  const plans = projet.plans;
  if (plans.length === 0) return { plan: null, index: -1 };
  let lo = 0;
  let hi = plans.length - 1;
  let r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (plans[m]!.debut <= t) {
      r = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  const index = r < 0 ? 0 : r;
  return { plan: plans[index]!, index };
}

/** Déclaration d'un personnage par identifiant. */
export function declarationDe(projet: Projet, id: string): DeclarationPersonnage | undefined {
  return projet.personnages.find((d) => d.id === id);
}

/** Actions d'un personnage, dans l'ordre de début (stable). */
export function actionsDe(projet: Projet, personnage: string): ActionPlacee[] {
  return projet.pistes.actions.filter((a) => a.personnage === personnage);
}
