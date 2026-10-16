/**
 * Expressions : préréglages d'émotion (visage + posture du corps) et chronologie des émotions d'un personnage.
 *
 * Sources de la chronologie : l'émotion des répliques du personnage (du début de la réplique à 0,7 s après sa
 * fin) et le paramètre `emotion` d'une action (pendant l'action). Les poids passent par un ressort (attaque et
 * relâche douces) ; le visage est la somme pondérée des préréglages, la posture est envoyée à `anim/` comme
 * couche additive.
 */
import { creerCanalRessort, type CanalRessort, type Consigne } from '../noyau/ressorts';
import type { Emotion, EtatSourcil, Projet, Vec2 } from '../timeline/types';
import { pistesPersonnage, versJeu } from './parole';

/** Expressions connues : les émotions du contrat, plus rire, choc et suspicion (= méfiance). */
export type NomExpression = Emotion | 'rire' | 'choc' | 'suspicion';

/** Toutes les expressions. */
export const EXPRESSIONS: readonly NomExpression[] = [
  'neutre',
  'joie',
  'colere',
  'surprise',
  'peur',
  'tristesse',
  'gene',
  'mefiance',
  'malice',
  'rire',
  'choc',
  'suspicion',
];

/** Contribution d'une expression au visage (écarts au repos). */
export interface VisageExpression {
  sourire: number;
  largeur: number;
  ouverture: number;
  arrondi: number;
  dents: number;
  plisserG: number;
  plisserD: number;
  ecarquillement: number;
  sourcilG: EtatSourcil;
  sourcilD: EtatSourcil;
  /** Décalage du regard ; `x` est compté **à l'opposé** du destinataire (regard fuyant > 0). */
  regard: Vec2;
}

/** Contribution d'une expression à la posture (lue par `anim/`). */
export interface PostureExpression {
  /** Buste penché vers le destinataire (+) ou en arrière (−), rad. */
  pencheBuste: number;
  /** Tête baissée (+) ou levée (−), −1 … 1. */
  tangageTete: number;
  /** Inclinaison de la tête (rad, + = vers le destinataire). */
  roulisTete: number;
  /** Épaules levées (fraction de la hauteur). */
  epaules: number;
  /** Poitrine gonflée (échelle y du torse − 1). */
  torseY: number;
  /** Bras écartés (+) ou serrés (−), rad. */
  bras: number;
}

/** Préréglage complet. */
export interface PresetExpression {
  visage: VisageExpression;
  posture: PostureExpression;
}

const S = (hauteur: number, froncement = 0, inclinaison = 0): EtatSourcil => ({ hauteur, froncement, inclinaison });

function preset(v: Partial<VisageExpression>, p: Partial<PostureExpression>): PresetExpression {
  return {
    visage: {
      sourire: 0,
      largeur: 0,
      ouverture: 0,
      arrondi: 0,
      dents: 0,
      plisserG: 0,
      plisserD: 0,
      ecarquillement: 0,
      sourcilG: S(0),
      sourcilD: S(0),
      regard: { x: 0, y: 0 },
      ...v,
    },
    posture: { pencheBuste: 0, tangageTete: 0, roulisTete: 0, epaules: 0, torseY: 0, bras: 0, ...p },
  };
}

/** Préréglages (valeurs de départ, à régler à l'œil sur les planches de la troupe). */
export const PRESETS: Readonly<Record<NomExpression, PresetExpression>> = Object.freeze({
  neutre: preset({}, {}),
  joie: preset(
    { sourire: 0.75, largeur: 0.35, ouverture: 0.12, dents: 0.25, plisserG: 0.2, plisserD: 0.2, sourcilG: S(0.25, 0, -0.1), sourcilD: S(0.25, 0, -0.1) },
    { torseY: 0.02, tangageTete: -0.15, roulisTete: 0.06, pencheBuste: 0.02, epaules: -0.005 },
  ),
  rire: preset(
    { sourire: 1, largeur: 0.6, ouverture: 0.55, dents: 0.6, plisserG: 0.6, plisserD: 0.6, sourcilG: S(0.35, 0, -0.3), sourcilD: S(0.35, 0, -0.3) },
    { tangageTete: -0.35, epaules: 0.015, torseY: 0.02 },
  ),
  colere: preset(
    { sourire: -0.6, largeur: 0.25, ouverture: 0.05, dents: 0.5, plisserG: 0.25, plisserD: 0.25, sourcilG: S(-0.45, 1, 1), sourcilD: S(-0.45, 1, 1) },
    { pencheBuste: 0.07, tangageTete: 0.25, epaules: 0.02, bras: 0.05 },
  ),
  surprise: preset(
    { ouverture: 0.45, arrondi: 0.5, ecarquillement: 0.8, sourcilG: S(0.9, 0, -0.2), sourcilD: S(0.9, 0, -0.2) },
    { pencheBuste: -0.05, tangageTete: -0.3, epaules: 0.015 },
  ),
  choc: preset(
    { ouverture: 0.65, arrondi: 0.4, ecarquillement: 1, sourcilG: S(1, 0, -0.4), sourcilD: S(1, 0, -0.4) },
    { pencheBuste: -0.09, tangageTete: -0.4, epaules: 0.03, bras: 0.15 },
  ),
  peur: preset(
    { sourire: -0.3, largeur: 0.45, ouverture: 0.25, dents: 0.3, ecarquillement: 0.7, sourcilG: S(0.6, 0.4, -0.8), sourcilD: S(0.6, 0.4, -0.8) },
    { pencheBuste: -0.07, tangageTete: 0.1, epaules: 0.035, bras: -0.05 },
  ),
  tristesse: preset(
    { sourire: -0.55, largeur: -0.1, plisserG: 0.25, plisserD: 0.25, sourcilG: S(0.1, 0.3, -0.9), sourcilD: S(0.1, 0.3, -0.9), regard: { x: 0, y: 0.35 } },
    { tangageTete: 0.35, epaules: -0.015, pencheBuste: -0.02, torseY: -0.02 },
  ),
  gene: preset(
    { sourire: 0.3, largeur: 0.35, plisserG: 0.15, plisserD: 0.15, sourcilG: S(0.15, 0, -0.5), sourcilD: S(0.15, 0, -0.5), regard: { x: 0.45, y: 0.45 } },
    { tangageTete: 0.3, roulisTete: -0.1, epaules: 0.025, torseY: -0.015, bras: -0.06 },
  ),
  mefiance: preset(
    { sourire: -0.15, largeur: -0.2, plisserG: 0.45, plisserD: 0.15, sourcilG: S(0.45, 0.2, 0), sourcilD: S(-0.35, 0.6, 0.6), regard: { x: -0.15, y: 0 } },
    { pencheBuste: -0.03, tangageTete: 0.12, roulisTete: 0.08 },
  ),
  suspicion: preset(
    { sourire: -0.15, largeur: -0.2, plisserG: 0.45, plisserD: 0.15, sourcilG: S(0.45, 0.2, 0), sourcilD: S(-0.35, 0.6, 0.6), regard: { x: -0.15, y: 0 } },
    { pencheBuste: -0.03, tangageTete: 0.12, roulisTete: 0.08 },
  ),
  malice: preset(
    { sourire: 0.55, largeur: 0.25, plisserG: 0.35, plisserD: 0.3, sourcilG: S(0.35, 0, 0.3), sourcilD: S(-0.1, 0.2, 0.3) },
    { roulisTete: 0.08, tangageTete: 0.1, epaules: 0.01 },
  ),
});

/** Vrai si `x` est un nom d'expression. */
export function estExpression(x: unknown): x is NomExpression {
  return typeof x === 'string' && (EXPRESSIONS as readonly string[]).includes(x);
}

/** Segment d'émotion (instants de jeu). */
export interface SegmentEmotion {
  emotion: NomExpression;
  debut: number;
  fin: number;
  intensite: number;
}

/** Attaque et relâche des segments d'émotion (s). */
const ATTAQUE = 0.2;
const RELACHE = 0.35;

/** Segments d'émotion d'un personnage (instants de jeu). */
export function segmentsEmotion(projet: Projet, personnage: string): SegmentEmotion[] {
  const r: SegmentEmotion[] = [];
  for (const p of pistesPersonnage(projet, personnage)) {
    const e = p.replique.emotion;
    if (!e || e === 'neutre') continue;
    r.push({ emotion: e, debut: versJeu(projet, p.debut - 0.15), fin: versJeu(projet, p.fin + 0.7), intensite: 1 });
  }
  for (const a of projet.pistes.actions) {
    if (a.personnage !== personnage) continue;
    const e = a.parametres?.emotion;
    if (!estExpression(e) || e === 'neutre') continue;
    const duree = (a.duree ?? 1.5) / (a.tempo ?? 1);
    r.push({ emotion: e, debut: a.debut, fin: a.debut + duree, intensite: Math.min(1.5, a.intensite ?? 1) });
  }
  return r.sort((a, b) => a.debut - b.debut);
}

/** Courbe d'intention (0 → intensité → 0) d'un segment, en consignes de ressort. */
export function consignesSegment(s: SegmentEmotion): Consigne[] {
  const montee = Math.min(ATTAQUE, (s.fin - s.debut) / 2);
  return [
    { t: s.debut, v: s.intensite, rampe: montee },
    { t: Math.max(s.debut + montee, s.fin - RELACHE), v: 0, rampe: RELACHE },
  ];
}

/** Chronologie compilée : poids de chaque expression en fonction du temps de jeu. */
export interface ChronologieEmotions {
  segments: SegmentEmotion[];
  poids(tJeu: number): Partial<Record<NomExpression, number>>;
}

const cache = new WeakMap<Projet, Map<string, ChronologieEmotions>>();

/** Chronologie des émotions d'un personnage (ressort f = 2,5 Hz, ζ = 0,8 ; mémorisée par projet). */
export function chronologieEmotions(projet: Projet, personnage: string): ChronologieEmotions {
  let m = cache.get(projet);
  if (!m) cache.set(projet, (m = new Map()));
  const deja = m.get(personnage);
  if (deja) return deja;
  const segments = segmentsEmotion(projet, personnage);
  const parEmotion = new Map<NomExpression, Consigne[]>();
  for (const s of segments) {
    const e = s.emotion === 'suspicion' ? 'mefiance' : s.emotion;
    const l = parEmotion.get(e) ?? [];
    // Les segments d'une même émotion s'additionnent en variations.
    l.push(...consignesSegment(s));
    parEmotion.set(e, l);
  }
  const canaux = new Map<NomExpression, CanalRessort>();
  for (const [e, l] of parEmotion) canaux.set(e, creerCanalRessort(0, cumuler(l), { f: 2.5, zeta: 0.8 }));
  const c: ChronologieEmotions = {
    segments,
    poids(tJeu) {
      const r: Partial<Record<NomExpression, number>> = {};
      for (const [e, canal] of canaux) {
        const w = canal.valeur(tJeu);
        if (Math.abs(w) > 1e-6) r[e] = w;
      }
      return r;
    },
  };
  m.set(personnage, c);
  return c;
}

/** Les consignes de plusieurs segments (chacun 0 → v → 0) deviennent des variations cumulées. */
function cumuler(l: readonly Consigne[]): Consigne[] {
  // Chaque segment produit [montée vers v, descente vers 0] : variations +v puis −v.
  const evts: Array<{ t: number; d: number; rampe?: number }> = [];
  for (let i = 0; i + 1 < l.length; i += 2) {
    const a = l[i]!;
    const b = l[i + 1]!;
    evts.push({ t: a.t, d: a.v, rampe: a.rampe }, { t: b.t, d: -a.v, rampe: b.rampe });
  }
  evts.sort((x, y) => x.t - y.t);
  let v = 0;
  return evts.map((e) => {
    v += e.d;
    return e.rampe ? { t: e.t, v, rampe: e.rampe } : { t: e.t, v };
  });
}

/** Visage d'expression pour des poids donnés (somme pondérée, normalisée si Σ poids > 1). */
export function visageDepuisPoids(poids: Partial<Record<NomExpression, number>>): VisageExpression {
  const r = preset({}, {}).visage;
  let somme = 0;
  for (const w of Object.values(poids)) somme += Math.max(0, w ?? 0);
  const k = somme > 1 ? 1 / somme : 1;
  for (const [nom, w0] of Object.entries(poids) as Array<[NomExpression, number]>) {
    const w = Math.max(0, w0) * k;
    if (w === 0) continue;
    const v = PRESETS[nom].visage;
    r.sourire += w * v.sourire;
    r.largeur += w * v.largeur;
    r.ouverture += w * v.ouverture;
    r.arrondi += w * v.arrondi;
    r.dents += w * v.dents;
    r.plisserG += w * v.plisserG;
    r.plisserD += w * v.plisserD;
    r.ecarquillement += w * v.ecarquillement;
    for (const c of ['sourcilG', 'sourcilD'] as const) {
      r[c].hauteur += w * v[c].hauteur;
      r[c].froncement += w * v[c].froncement;
      r[c].inclinaison += w * v[c].inclinaison;
    }
    r.regard.x += w * v.regard.x;
    r.regard.y += w * v.regard.y;
  }
  return r;
}

/** Posture d'une expression à l'intensité `w`. */
export function postureDe(nom: NomExpression, w = 1): PostureExpression {
  const p = PRESETS[nom].posture;
  return {
    pencheBuste: p.pencheBuste * w,
    tangageTete: p.tangageTete * w,
    roulisTete: p.roulisTete * w,
    epaules: p.epaules * w,
    torseY: p.torseY * w,
    bras: p.bras * w,
  };
}
