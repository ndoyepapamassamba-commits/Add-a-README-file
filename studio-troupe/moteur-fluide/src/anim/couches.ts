/**
 * Couches et mélange : compile toutes les actions d'un personnage dans un plan (actions de la piste + vie de base
 * implicite : respiration, attente vivante, gestes de parole, regards d'écoute, posture d'émotion), puis évalue
 * la pose à n'importe quel instant de jeu.
 *
 * Règles de mélange (toutes pures) :
 * - **Couches** : `base` (locomotion, flexion…), `geste` (gestes à masque), `additif` (vie, respiration).
 * - **Masques par zone** (bras G/D, torse, tête, racine, jambes, visage, regard, parole), graduels.
 * - **Priorités et interruptions** : dans une zone partagée, l'action de plus haute priorité (à égalité : la plus
 *   récente) atténue les autres par `1 − masque·présence(t)`, présence lissée (entrée 0,2 s, sortie 0,35 s). Une
 *   action protégée (début d'une prise de surprise, d'un recul…) ne peut pas être interrompue : l'intruse attend
 *   la fin de la protection. Une action atténuée reprend quand l'intruse a fini.
 * - **Vie de base** (attente, respiration) : atténuée par l'occupation des zones par les gestes.
 * - **Ressorts par os** : les courbes d'intention pondérées deviennent des consignes ; chaque canal (os, propriété,
 *   réglage de ressort) est un ressort analytique (`noyau/ressorts`). Os lourds lents, mains et tête vives,
 *   amortissement plus faible aux extrémités, départ retardé selon la profondeur dans la chaîne : chevauchement et
 *   follow-through « gratuits ».
 * - **Signaux directs** (cycles, bruit) ajoutés après les ressorts, pondérés par les mêmes masques.
 * - **Secondaire** : chaînes du rig (`secondaire`) et ventre, en pendules analytiques (`physique.ts`).
 *
 * La compilation est mémorisée par (projet, rig, personnage, plan, décor) ; l'évaluation ne dépend que de `tJeu`.
 */
import { creerCanalRessort, type CanalRessort, type Consigne } from '../noyau/ressorts';
import { smoothstep } from '../noyau/courbes';

import type {
  ActionPlacee,
  Cible,
  ContextePersonnage,
  ParametresRessort,
  Pose,
  Vec2,
} from '../timeline/types';
import { chronologieEmotions, postureDe } from '../visage/expression';
import { pistesPersonnage, versJeu } from '../visage/parole';
import {
  dureeAction,
  Ecriture,
  graineAction,
  recette as trouverRecette,
  RECETTES,
  type Contribution,
  type ParamsRecette,
  type Recette,
} from './actions';
import {
  Accumulateur,
  assemblerPose,
  consignesDepuisEvenements,
  evenementsPL,
  idCanal,
  lireIndicesVisage,
  ponderePL,
  RACINE,
  transformerPL,
  VISAGE,
  type Evenement,
  type IndicesVisage,
  type IndiceVisage,
} from './canaux';
import { contexteAnim, miroirA, resoudreCible, sensImage, type ContexteAnim } from './cibles';
import { compilerChaine, creerRetard, type ChaineCompilee } from './physique';
import { cleRessort, profondeurOs, ressortCanal, zoneOs, type Zone } from './reglages';

/** Action compilée (introspection, tests). */
export interface ActionCompilee {
  index: number;
  action: ActionPlacee;
  recette: Recette;
  /** Début et fin (temps de jeu, s). */
  debut: number;
  D: number;
  fin: number;
  priorite: number;
  masque: Partial<Record<Zone, number>>;
  /** Fin de la protection (temps de jeu), = début si aucune. */
  finProtection: number;
  implicite: boolean;
  k: number;
  g: number;
  contribution: Contribution;
}

/** Animation compilée d'un personnage dans un plan. */
export interface AnimationCompilee {
  readonly cc: ContexteAnim;
  readonly actions: readonly ActionCompilee[];
  /** Pose à l'instant de jeu `tJeu`. */
  pose(tJeu: number): Pose;
  /** Indications de visage des actions à `tJeu`. */
  indicesVisage(tJeu: number): IndicesVisage;
  /** Cible de regard de base (unités de regard, repère du dessin). */
  cibleRegard(tJeu: number): Vec2;
  /** Instants (jeu) où la cible de regard change : saccades forcées. */
  readonly changementsRegard: readonly number[];
  /** Clignements forcés (jeu). */
  readonly clignementsForces: readonly number[];
  /** Intervalles de parole du personnage (jeu). */
  readonly parole: ReadonlyArray<readonly [number, number]>;
  /** Intervalles où un autre personnage parle (jeu). */
  readonly ecoute: ReadonlyArray<readonly [number, number]>;
  /** Sens du regard du personnage dans le repère du dessin. */
  sens(tJeu: number): 1 | -1;
}

/** Priorités des actions implicites. */
const PRIORITE_REGARD_ECOUTE = 0.5;
const PRIORITE_REGARD_PAROLE = 0.8;
const PRIORITE_PAROLE_IMPLICITE = 1;

/** Marges de la fenêtre compilée autour du plan (s de jeu). */
const MARGE_AVANT = 8;
const MARGE_APRES = 8;

const cache = new WeakMap<object, WeakMap<object, Map<string, AnimationCompilee>>>();

/** Animation compilée pour le contexte d'un personnage (`null` sans rig ou sans plan). Mémorisée. */
export function compilerAnimation(ctx: ContextePersonnage): AnimationCompilee | null {
  if (!ctx.plan || !ctx.rig) return null;
  let parRig = cache.get(ctx.projet);
  if (!parRig) cache.set(ctx.projet, (parRig = new WeakMap()));
  let m = parRig.get(ctx.rig);
  if (!m) parRig.set(ctx.rig, (m = new Map()));
  const d = ctx.decor;
  const cle = `${ctx.declaration.id}|${ctx.indexPlan}|${d ? `${d.id}:${d.aspect}:${d.fit.floor}:${d.fit.mH}` : '-'}`;
  let a = m.get(cle);
  if (!a) {
    a = compiler(contexteAnim(ctx.projet, ctx.plan, ctx.indexPlan, ctx.decor, ctx.declaration, ctx.placement, ctx.rig));
    m.set(cle, a);
  }
  return a;
}

/** Présence lissée d'une action (0 → 1 → 0). */
function presence(a: ActionCompilee, t: number): number {
  return smoothstep(a.debut - 0.08, a.debut + 0.12, t) * (1 - smoothstep(a.fin - 0.35, a.fin, t));
}

/** Facteur d'atténuation d'une action dans une zone. */
interface Poids {
  fn: (t: number) => number;
  transitions: Array<readonly [number, number]>;
  /** Vrai si le poids vaut 1 partout. */
  unite: boolean;
}

const POIDS_UN: Poids = { fn: () => 1, transitions: [], unite: true };

/** Vrai si `j` l'emporte sur `i`. */
function lEmporte(j: ActionCompilee, i: ActionCompilee): boolean {
  if (j.priorite !== i.priorite) return j.priorite > i.priorite;
  if (j.debut !== i.debut) return j.debut > i.debut;
  return j.index > i.index;
}

function chevauchent(i: ActionCompilee, j: ActionCompilee): boolean {
  return j.debut - 0.1 < i.fin + 1 && i.debut - 0.1 < j.fin + 0.05;
}

/** Compile l'animation d'un contexte. */
export function compiler(cc: ContexteAnim): AnimationCompilee {
  const { projet, plan, perso } = cc;
  const id = cc.declaration.id;
  const W0 = versJeu(projet, plan.debut) - 0.5;
  const W1 = versJeu(projet, plan.fin) + 0.5;
  const pistes = pistesPersonnage(projet, id);
  const parole: Array<[number, number]> = pistes.map((p) => [versJeu(projet, p.debut), versJeu(projet, p.fin)]);
  const presents = new Set(plan.personnages.map((p) => p.personnage));
  const ecoute: Array<[number, number]> = [];
  for (const r of projet.pistes.dialogue) {
    if (r.personnage === id || !presents.has(id)) continue;
    for (const p of pistesPersonnage(projet, r.personnage)) {
      if (p.replique === r) ecoute.push([versJeu(projet, p.debut), versJeu(projet, p.fin)]);
    }
  }
  const accentsJeu = pistes.flatMap((p) => p.accents.map((a) => ({ t: versJeu(projet, a.t), force: a.force })));

  // ── Inventaire des actions ──
  interface Brouillon {
    action: ActionPlacee;
    recette: Recette;
    debut: number;
    D: number;
    implicite: boolean;
    priorite?: number;
  }
  const brouillons: Brouillon[] = [];
  const explicites = projet.pistes.actions.filter((a) => a.personnage === id);
  for (const a of explicites) {
    const r = trouverRecette(String(a.action));
    if (!r) continue;
    const D = dureeAction(a, r, perso.tempo);
    if (!(D > 0) || a.debut >= W1 + 0.5 || a.debut + D + 5 <= W0) continue;
    brouillons.push({ action: a, recette: r, debut: a.debut, D, implicite: false });
  }
  const implicite = (action: string, debut: number, D: number, extra: Partial<ActionPlacee> = {}, priorite?: number): void => {
    const r = RECETTES[action]!;
    brouillons.push({ action: { personnage: id, action, debut, duree: D, ...extra }, recette: r, debut, D, implicite: true, priorite });
  };
  implicite('respirer', W0 - MARGE_AVANT, W1 - W0 + MARGE_AVANT + MARGE_APRES);
  implicite('attendre', W0 - MARGE_AVANT, W1 - W0 + MARGE_AVANT + MARGE_APRES);
  const couvre = (nom: string, a: number, b: number): boolean =>
    brouillons.some((x) => !x.implicite && x.recette.id === nom && x.debut < b && x.debut + x.D > a);
  for (const p of pistes) {
    const a = versJeu(projet, p.debut);
    const b = versJeu(projet, p.fin);
    if (b < W0 - 2 || a > W1 + 1) continue;
    if (!couvre('parler', a, b)) {
      const dest = p.replique.destinataire;
      implicite('parler', a - 0.4, b - a + 0.9, dest ? { cible: { personnage: dest } } : {}, PRIORITE_PAROLE_IMPLICITE);
    }
    if (p.replique.destinataire && !couvre('regarder', a, b)) {
      implicite('regarder', a - 0.25, b - a + 0.85, { cible: { personnage: p.replique.destinataire } }, PRIORITE_REGARD_PAROLE);
    }
  }
  for (const r of projet.pistes.dialogue) {
    if (r.personnage === id || !presents.has(id)) continue;
    const pp = pistesPersonnage(projet, r.personnage).find((x) => x.replique === r);
    if (!pp) continue;
    const a = versJeu(projet, pp.debut) + 0.15;
    const b = versJeu(projet, pp.fin);
    if (b < W0 - 2 || a > W1 + 1 || couvre('regarder', a, b)) continue;
    implicite('regarder', a, b - a + 0.6, { cible: { personnage: r.personnage } }, PRIORITE_REGARD_ECOUTE);
  }

  // ── Construction des contributions ──
  // La graine d'une action implicite ne dépend pas des actions explicites (vie de base identique avec ou sans geste).
  const rangExplicite = (index: number): number => brouillons.slice(0, index).filter((x) => !x.implicite).length;
  const actions: ActionCompilee[] = brouillons.map((b, index) => {
    const a = b.action;
    const k = Math.max(0.1, (a.tempo ?? 1) * perso.tempo);
    const g = Math.min(2, Math.max(0, (a.intensite ?? 1) * perso.exageration));
    const tApex = b.debut + Math.min(0.3, b.D / 2);
    const cible: Cible | undefined = a.cible;
    const p: ParamsRecette = {
      action: a,
      id: b.recette.id,
      debut: b.debut,
      D: b.D,
      k,
      g: b.implicite ? Math.min(1.3, perso.exageration) : g,
      m: cc.morph,
      sens: sensImage(cc, b.debut + 1e-3),
      cible: resoudreCible(cc, cible, tApex),
      graine: graineAction(cc.graine, a, b.implicite ? -1 : rangExplicite(index)),
      accents: accentsJeu
        .filter((x) => x.t >= b.debut - 0.5 && x.t <= b.debut + b.D + 0.5)
        .map((x) => ({ t: x.t - b.debut, force: x.force })),
      parole: parole.filter(([x, y]) => y >= b.debut - 1 && x <= b.debut + b.D + 1).map(([x, y]) => [x - b.debut, y - b.debut] as const),
      params: a.parametres ?? {},
      implicite: b.implicite,
      cc,
    };
    const contribution = b.recette.construire(p);
    const priorite = b.priorite ?? a.priorite ?? b.recette.priorite;
    return {
      index,
      action: a,
      recette: b.recette,
      debut: b.debut,
      D: b.D,
      fin: b.debut + b.D,
      priorite,
      masque: b.recette.couche === 'additif' ? {} : b.recette.masque(p),
      finProtection: b.debut + b.recette.protection / k,
      implicite: b.implicite,
      k,
      g: p.g,
      contribution,
    };
  });
  // Posture d'émotion : couche additive non atténuée.
  const posture = contributionPosture(cc, accentsJeu);

  // ── Poids (dominance, protection, occupation) ──
  const actifs = actions.filter((a) => a.recette.couche !== 'additif');
  const cachePoids = new Map<string, Poids>();
  const poidsDe = (a: ActionCompilee, z: Zone): Poids => {
    const cle = `${a.index}|${z}`;
    const deja = cachePoids.get(cle);
    if (deja) return deja;
    const facteurs: Array<(t: number) => number> = [];
    const transitions: Array<readonly [number, number]> = [];
    if (a.recette.couche === 'additif') {
      const force = a.recette.id === 'respirer' ? 0.5 : a.recette.id === 'attendre' ? 0.85 : 0;
      if (force > 0) {
        for (const j of actifs) {
          const mj = j.masque[z] ?? 0;
          if (mj < 0.3) continue;
          facteurs.push((t) => (t < j.debut - 0.1 || t > j.fin + 0.01 ? 1 : 1 - force * mj * presence(j, t)));
          transitions.push([j.debut - 0.08, j.debut + 0.12], [j.fin - 0.35, j.fin]);
        }
      }
    } else {
      const mi = a.masque[z] ?? 0;
      if (mi > 0) {
        for (const j of actifs) {
          if (j === a) continue;
          const mj = j.masque[z] ?? 0;
          if (mj <= 0 || !chevauchent(a, j)) continue;
          if (lEmporte(j, a)) {
            const bloque = j.debut >= a.debut && j.debut < a.finProtection;
            const fp = a.finProtection;
            facteurs.push((t) => {
              if (t < j.debut - 0.1 || t > j.fin + 0.01) return 1;
              const pj = presence(j, t) * (bloque ? smoothstep(fp - 0.05, fp + 0.1, t) : 1);
              return 1 - mj * pj;
            });
            transitions.push([j.debut - 0.08, j.debut + 0.12], [j.fin - 0.35, j.fin]);
            if (bloque) transitions.push([fp - 0.05, fp + 0.1]);
          } else if (a.debut >= j.debut && a.debut < j.finProtection) {
            // `a` arrive pendant la protection de `j` (qui perdrait sinon) : `a` attend.
            const fp = j.finProtection;
            facteurs.push((t) => (t > fp + 0.16 ? 1 : 1 - mj * (1 - smoothstep(fp, fp + 0.15, t))));
            transitions.push([fp, fp + 0.15]);
          }
        }
      }
    }
    const p: Poids =
      facteurs.length === 0
        ? POIDS_UN
        : {
            fn: (t) => {
              let w = 1;
              for (const f of facteurs) w *= f(t);
              return w;
            },
            transitions,
            unite: false,
          };
    cachePoids.set(cle, p);
    return p;
  };

  // ── Canaux à ressort ──
  interface Groupe {
    id: string;
    params: ParametresRessort;
    evts: Evenement[];
  }
  const groupes = new Map<string, Groupe>();
  const evenementsRotation = new Map<string, Evenement[]>();
  const ajouterContribution = (a: ActionCompilee | null, c: Contribution, debut: number, k: number): void => {
    const profs = c.courbes.filter((x) => x.os !== VISAGE).map((x) => (x.os === RACINE ? 0 : profondeurOs(x.os)));
    const profMin = profs.length > 0 ? Math.min(...profs) : 0;
    for (const ca of c.courbes) {
      const indice = ca.os === VISAGE ? (ca.prop as IndiceVisage) : null;
      const zone = ca.zone ?? zoneOs(ca.os);
      const prof = ca.os === RACINE ? 0 : profondeurOs(ca.os);
      const retard = ca.retard ?? (ca.os === VISAGE ? 0 : ((prof - profMin) * perso.chevauchement) / k);
      let abs = transformerPL(ca.courbe, debut + retard);
      if (a) {
        const w = poidsDe(a, zone);
        if (!w.unite) {
          const t0 = abs.t[0] ?? 0;
          const t1 = abs.t[abs.t.length - 1] ?? 0;
          const tr = w.transitions.filter(([x, y]) => y > t0 - 0.05 && x < t1 + 0.05);
          abs = ponderePL(abs, w.fn, tr);
        }
      }
      const params = ressortCanal(ca.os, indice, perso, k, ca.ressort);
      const idc = idCanal(ca.os, ca.prop);
      const cle = `${idc}|${cleRessort(params)}`;
      let gr = groupes.get(cle);
      if (!gr) groupes.set(cle, (gr = { id: idc, params, evts: [] }));
      const evts = evenementsPL(abs);
      gr.evts.push(...evts);
      if (ca.prop === 'r' || (ca.os === RACINE && ca.prop === 'tx')) {
        const l = evenementsRotation.get(idc) ?? [];
        l.push(...evts);
        evenementsRotation.set(idc, l);
      }
    }
  };
  for (const a of actions) ajouterContribution(a, a.contribution, a.debut, a.k);
  ajouterContribution(null, posture, 0, perso.tempo);
  const canaux: Array<{ id: string; canal: CanalRessort }> = [];
  for (const gr of groupes.values()) {
    if (gr.evts.length === 0) continue;
    const { initiale, consignes } = consignesDepuisEvenements(gr.evts);
    canaux.push({ id: gr.id, canal: creerCanalRessort(initiale, consignes, gr.params) });
  }

  // ── Signaux directs ──
  const directs = actions.flatMap((a) =>
    a.contribution.directs.map((d) => ({ a, d, cacheZones: new Map<Zone, Poids>() })),
  );

  // ── Secondaire ──
  const secondaires = compilerSecondaire(cc, evenementsRotation, groupes);

  // ── Regard, événements ──
  const fenetresRegard = actions
    .filter((a) => a.contribution.regard)
    .map((a) => ({ a, r: a.contribution.regard!, debut: a.debut + a.contribution.regard!.debut, fin: a.debut + a.contribution.regard!.fin }));
  const changements = new Set<number>();
  for (const f of fenetresRegard) {
    changements.add(f.debut);
    changements.add(f.fin);
  }
  for (const a of actions) for (const s of a.contribution.saccades) changements.add(a.debut + s);
  const clignements = actions.flatMap((a) => a.contribution.clignements.map((x) => a.debut + x)).sort((x, y) => x - y);
  const ordres = actions.flatMap((a) =>
    a.contribution.ordres.map((o) => ({ groupe: o.groupe, ordre: o.ordre, debut: a.debut + o.debut, fin: a.debut + o.fin })),
  );
  const osPresents = new Set(cc.rig.squelette.os.map((o) => o.nom));

  let dernier: { t: number; acc: Accumulateur } | null = null;
  const evaluerAcc = (t: number): Accumulateur => {
    if (dernier && dernier.t === t) return dernier.acc;
    const acc = new Accumulateur();
    for (const c of canaux) acc.ajouterId(c.id, c.canal.valeur(t));
    for (const x of directs) {
      const tl = t - x.a.debut;
      if (tl < x.d.debut || tl > x.d.fin) continue;
      x.d.fn(tl, (os, prop, v) => {
        if (v === 0) return;
        const z = zoneOs(os);
        let w = x.cacheZones.get(z);
        if (!w) x.cacheZones.set(z, (w = poidsDe(x.a, z)));
        acc.ajouter(os, prop, w.unite ? v : v * w.fn(t));
      });
    }
    for (const s of secondaires) s(t, acc);
    dernier = { t, acc };
    return acc;
  };

  return {
    cc,
    actions,
    pose(t) {
      const acc = evaluerAcc(t);
      const ordre: Record<string, number> = {};
      for (const o of ordres) if (t >= o.debut && t < o.fin) ordre[o.groupe] = Math.max(ordre[o.groupe] ?? -Infinity, o.ordre);
      return assemblerPose(acc, osPresents, miroirA(cc, t), ordre);
    },
    indicesVisage(t) {
      return lireIndicesVisage(evaluerAcc(t));
    },
    cibleRegard(t) {
      let meilleur: (typeof fenetresRegard)[number] | null = null;
      for (const f of fenetresRegard) {
        if (t < f.debut || t >= f.fin) continue;
        if (!meilleur || lEmporte(f.a, meilleur.a)) meilleur = f;
      }
      if (meilleur) return { x: meilleur.r.x, y: meilleur.r.y };
      return { x: 0.12 * sensImage(cc, t), y: 0 };
    },
    changementsRegard: [...changements].sort((x, y) => x - y),
    clignementsForces: clignements,
    parole,
    ecoute,
    sens: (t) => sensImage(cc, t),
  };
}

/** Posture des émotions (repliques, paramètre `emotion`) en courbes additives absolues. */
function contributionPosture(cc: ContexteAnim, accents: ReadonlyArray<{ t: number; force: number }>): Contribution {
  const seg = chronologieEmotions(cc.projet, cc.declaration.id).segments;
  const p: ParamsRecette = {
    action: { personnage: cc.declaration.id, action: 'emotion', debut: 0 },
    id: 'emotion',
    debut: 0,
    D: 0,
    k: cc.perso.tempo,
    g: cc.perso.exageration,
    m: cc.morph,
    sens: 1,
    cible: null,
    graine: cc.graine,
    accents,
    parole: [],
    params: {},
    implicite: true,
    cc,
  };
  const e = new Ecriture(p);
  for (const s of seg) {
    const w = s.intensite;
    const pos = postureDe(s.emotion, w);
    const montee = Math.min(0.25, (s.fin - s.debut) / 3);
    const pts = (v: number): Array<readonly [number, number]> => [
      [s.debut, 0],
      [s.debut + montee, v],
      [Math.max(s.debut + montee, s.fin - 0.35), v],
      [Math.max(s.debut + montee + 0.01, s.fin), 0],
    ];
    const dir = sensImage(cc, s.debut + 1e-3);
    const deg = 180 / Math.PI;
    if (pos.pencheBuste) e.pencher('torse', dir, pts(pos.pencheBuste * deg), { zone: 'parole' });
    if (pos.tangageTete) e.tangage(pts(pos.tangageTete), { zone: 'parole' });
    if (pos.roulisTete) e.roulis(dir, pts(pos.roulisTete * deg), { zone: 'parole' });
    if (pos.torseY) e.brut('torse', 'sy', pts(pos.torseY * e.g), { zone: 'parole' });
    for (const c of ['G', 'D'] as const) {
      if (pos.epaules) e.epaule(c, pts(pos.epaules), { zone: 'parole' });
      if (pos.bras) e.abduction(c, pts(pos.bras * deg), { zone: 'parole' });
    }
  }
  return e.c;
}

/** Os parent d'un os du rig. */
function parentDe(cc: ContexteAnim, nom: string): string | null {
  return cc.morph.os.get(nom)?.parent ?? null;
}

/**
 * Secondaire : chaînes déclarées par le rig (pendules analytiques pilotés par la rotation voulue de l'os porteur
 * et le déplacement de la racine), et ventre qui ballotte (retard sur les mouvements verticaux de la racine).
 */
function compilerSecondaire(
  cc: ContexteAnim,
  evenementsRotation: ReadonlyMap<string, Evenement[]>,
  groupes: ReadonlyMap<string, { id: string; evts: Evenement[] }>,
): Array<(t: number, acc: Accumulateur) => void> {
  const r: Array<(t: number, acc: Accumulateur) => void> = [];
  const versConsignes = (evts: Evenement[]): Consigne[] => consignesDepuisEvenements(evts).consignes;
  const deplacement = versConsignes(evenementsRotation.get(idCanal(RACINE, 'tx')) ?? []);
  for (const ch of cc.rig.secondaire ?? []) {
    if (ch.os.length === 0) continue;
    const porteur = parentDe(cc, ch.os[0]!);
    // Rotation absolue voulue du porteur : somme des rotations de ses ancêtres.
    const evts: Evenement[] = [];
    let o: string | null = porteur;
    while (o) {
      evts.push(...(evenementsRotation.get(idCanal(o, 'r')) ?? []));
      o = parentDe(cc, o);
    }
    evts.push(...(evenementsRotation.get(idCanal(RACINE, 'r')) ?? []));
    const longueurs = ch.os.map((n) => cc.morph.os.get(n)?.longueur ?? cc.morph.H * 0.05);
    const a0 = cc.morph.os.get(ch.os[0]!)?.angle ?? Math.PI / 2;
    const ressortPorteur = ressortCanal(porteur ?? 'torse', null, cc.perso, cc.perso.tempo);
    const chaine: ChaineCompilee = compilerChaine(
      ch,
      longueurs,
      versConsignes(evts),
      deplacement,
      ressortPorteur,
      Math.sin(a0) >= 0 ? 1 : -1,
    );
    r.push((t, acc) => {
      const rot = chaine.rotations(t);
      chaine.os.forEach((n, i) => acc.ajouter(n, 'r', rot[i]!));
    });
  }
  const dansChaine = new Set((cc.rig.secondaire ?? []).flatMap((c) => c.os));
  if (cc.morph.os.has('ventre') && !dansChaine.has('ventre')) {
    const evtsY: Evenement[] = [];
    for (const g of groupes.values()) if (g.id === idCanal(RACINE, 'ty')) evtsY.push(...g.evts);
    const consY = versConsignes(evtsY);
    if (consY.length > 0) {
      const retard = creerRetard(consY, ressortCanal(RACINE, null, cc.perso, cc.perso.tempo), { f: 2.2, zeta: 0.22 });
      r.push((t, acc) => {
        const d = retard(t);
        acc.ajouter('ventre', 'ty', -0.6 * d);
        acc.ajouter('ventre', 'sy', (0.25 * d) / cc.morph.H);
      });
    }
  }
  return r;
}



