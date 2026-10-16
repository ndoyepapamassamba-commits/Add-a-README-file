/**
 * Visèmes français et coarticulation.
 *
 * 1. **Table phonème → visème** (API, SAMPA et symboles espeak) vers le jeu de la spécification : M/B/P, A, E, I,
 *    O, U, F/V, S/Z, CH/J, L/R, T/D/N, K/G, repos. Chaque phonème porte aussi une **cible continue**
 *    (ouverture de mâchoire, largeur, arrondi) : les voyelles antérieures arrondies (y, ø, œ) ont la mâchoire de
 *    i/e/ɛ et les lèvres de u/o, ce que les seules formes dessinées ne savent pas dire.
 * 2. **Coarticulation à dominances** (modèle de Cohen et Massaro, réécrit ici) : chaque segment domine autour de
 *    son centre avec une décroissance exponentielle, différente avant (anticipation) et après (persistance) ;
 *    les voyelles arrondies anticipent l'arrondi sur tout le groupe de consonnes qui les précède (« look-ahead »
 *    du français). Les consonnes sans cible labiale (t, d, n, k, g, l, ʁ, s, z) pèsent peu et héritent des
 *    voyelles voisines.
 * 3. **Contraintes dures** : M/B/P fermés au cœur du segment (au moins 45 ms, donc au moins une image à 30 i/s),
 *    dents sur la lèvre pour F/V, langue visible sur un l long.
 * 4. **Piste discrète** (`viseme` de l'état, bouches dessinées) : formes de moins de 60 ms absorbées par leurs
 *    voisines, sauf les fermetures M/B/P (jamais perdues), petites pauses fondues.
 */
import { smoothstep } from '../noyau/courbes';
import type { Viseme } from '../timeline/types';
import { AN, IN, ON, UN } from './phonetique';

/** Forme de bouche continue. */
export interface FormeBouche {
  /** Mâchoire 0 … 1. */
  ouverture: number;
  /** Étirement −1 (resserré) … 1 (étiré). */
  largeur: number;
  /** Arrondi / protrusion 0 … 1. */
  arrondi: number;
  /** Dents visibles 0 … 1. */
  dents: number;
  /** Langue visible 0 … 1. */
  langue: number;
}

/** Informations articulatoires d'un phonème. */
export interface InfoPhoneme {
  /** Symbole API normalisé (`sil` pour une pause). */
  api: string;
  viseme: Viseme;
  cible: { ouverture: number; largeur: number; arrondi: number };
  /** Dents sur la lèvre / dents visibles (0 … 1). */
  dents: number;
  /** Force de dominance labiale (0,15 = transparent) et de mâchoire. */
  forceLevres: number;
  forceMachoire: number;
  voyelle: boolean;
  /** Voyelle arrondie : anticipation longue de l'arrondi. */
  arrondie: boolean;
  pause: boolean;
}

type Ligne = [Viseme, number, number, number, number, number, number, boolean, boolean];
// visème, ouverture, largeur, arrondi, dents, forceLèvres, forceMâchoire, voyelle, arrondie
const TABLE: Readonly<Record<string, Ligne>> = {
  // Voyelles
  a: ['A', 0.85, 0.25, 0.05, 0.3, 1, 1, true, false],
  ɑ: ['A', 0.85, 0.15, 0.1, 0.25, 1, 1, true, false],
  [AN]: ['A', 0.68, 0.05, 0.25, 0.2, 1, 1, true, false],
  e: ['E', 0.45, 0.45, 0.02, 0.45, 1, 1, true, false],
  ɛ: ['E', 0.55, 0.38, 0.03, 0.4, 1, 1, true, false],
  [IN]: ['E', 0.5, 0.3, 0.05, 0.35, 1, 1, true, false],
  ə: ['E', 0.38, 0.05, 0.45, 0.2, 0.8, 0.8, true, true],
  i: ['I', 0.22, 0.85, 0, 0.55, 1, 1, true, false],
  j: ['I', 0.18, 0.7, 0, 0.45, 0.6, 0.5, false, false],
  o: ['O', 0.5, -0.35, 0.8, 0.1, 1, 1, true, true],
  ɔ: ['O', 0.62, -0.2, 0.65, 0.15, 1, 1, true, true],
  [ON]: ['O', 0.48, -0.4, 0.85, 0.05, 1, 1, true, true],
  œ: ['O', 0.5, -0.12, 0.65, 0.2, 1, 1, true, true],
  [UN]: ['O', 0.5, -0.1, 0.6, 0.15, 1, 1, true, true],
  ø: ['U', 0.3, -0.42, 0.85, 0.1, 1, 1, true, true],
  u: ['U', 0.18, -0.65, 1, 0, 1, 1, true, true],
  y: ['U', 0.14, -0.6, 1, 0.05, 1, 1, true, true],
  w: ['U', 0.15, -0.6, 0.9, 0, 0.8, 0.5, false, true],
  ɥ: ['U', 0.14, -0.55, 0.9, 0.05, 0.8, 0.5, false, true],
  // Consonnes labiales
  p: ['MBP', 0, -0.05, 0.12, 0, 1, 1, false, false],
  b: ['MBP', 0, -0.05, 0.12, 0, 1, 1, false, false],
  m: ['MBP', 0, -0.02, 0.1, 0, 1, 1, false, false],
  f: ['FV', 0.12, 0.1, 0, 1, 0.9, 0.8, false, false],
  v: ['FV', 0.12, 0.1, 0, 1, 0.9, 0.8, false, false],
  // Sifflantes et chuintantes
  s: ['SZ', 0.1, 0.55, 0, 0.75, 0.5, 0.65, false, false],
  z: ['SZ', 0.1, 0.5, 0, 0.7, 0.5, 0.65, false, false],
  ʃ: ['CHJ', 0.2, -0.4, 0.85, 0.45, 0.85, 0.6, false, true],
  ʒ: ['CHJ', 0.2, -0.38, 0.8, 0.45, 0.85, 0.6, false, true],
  // Liquides (ʁ uvulaire : lèvres « transparentes »)
  l: ['LR', 0.35, 0.2, 0.05, 0.4, 0.15, 0.35, false, false],
  ʁ: ['LR', 0.3, 0.1, 0.08, 0.25, 0.15, 0.3, false, false],
  // Dentales et vélaires : sans cible labiale
  t: ['TDN', 0.18, 0.28, 0, 0.5, 0.15, 0.4, false, false],
  d: ['TDN', 0.18, 0.25, 0, 0.45, 0.15, 0.4, false, false],
  n: ['TDN', 0.2, 0.25, 0, 0.4, 0.15, 0.35, false, false],
  ɲ: ['TDN', 0.22, 0.3, 0, 0.4, 0.15, 0.35, false, false],
  k: ['KG', 0.3, 0.15, 0, 0.3, 0.15, 0.35, false, false],
  ɡ: ['KG', 0.3, 0.15, 0, 0.3, 0.15, 0.35, false, false],
  ŋ: ['KG', 0.28, 0.15, 0, 0.3, 0.15, 0.3, false, false],
  h: ['KG', 0.35, 0.1, 0, 0.2, 0.1, 0.2, false, false],
  ʔ: ['KG', 0.2, 0.1, 0, 0.2, 0.1, 0.2, false, false],
};

/** Correspondances SAMPA, espeak et variantes → API. */
const ALIAS: Readonly<Record<string, string>> = {
  A: 'ɑ',
  E: 'ɛ',
  O: 'ɔ',
  '@': 'ə',
  '9': 'œ',
  '2': 'ø',
  H: 'ɥ',
  S: 'ʃ',
  Z: 'ʒ',
  J: 'ɲ',
  N: 'ŋ',
  R: 'ʁ',
  r: 'ʁ',
  ʀ: 'ʁ',
  χ: 'ʁ',
  x: 'ʁ',
  ɾ: 'ʁ',
  g: 'ɡ',
  W: 'œ',
  Y: 'ø',
  ɐ: 'a',
  æ: 'a',
  ɪ: 'i',
  ʊ: 'u',
  ʏ: 'y',
  ɒ: 'ɔ',
  ʌ: 'ə',
  ɜ: 'ə',
  ɘ: 'ə',
  ɵ: 'ø',
  ʎ: 'j',
  'a~': AN,
  'A~': AN,
  'ɑ~': AN,
  'e~': IN,
  'E~': IN,
  'ɛ~': IN,
  'o~': ON,
  'O~': ON,
  'ɔ~': ON,
  '9~': UN,
  'W~': UN,
  'œ~': UN,
  ã: AN,
  õ: ON,
  ẽ: IN,
};

/** Symboles de pause. */
const PAUSES = new Set(['sil', 'sp', 'pau', 'spn', '_', '#', '', '|', '||', 'SIL', '<sil>', '<eps>']);

const INFO_PAUSE: InfoPhoneme = {
  api: 'sil',
  viseme: 'repos',
  cible: { ouverture: 0.03, largeur: 0, arrondi: 0 },
  dents: 0,
  forceLevres: 0.9,
  forceMachoire: 0.9,
  voyelle: false,
  arrondie: false,
  pause: true,
};

/** Normalise un symbole (accents toniques, longueur, chiffres de ton retirés ; tilde combinant). */
export function normaliserPhoneme(ph: string): string {
  let s = ph.normalize('NFC').replace(/[ˈˌːˑ'"]/g, '').trim();
  // Marque de longueur SAMPA et chiffre d'accent final (« a1 ») ; « 9 » et « 2 » seuls sont des voyelles SAMPA.
  if (s.length > 1) s = s.replace(/:$/, '');
  if (/^[^\d]+\d$/.test(s)) s = s.slice(0, -1);
  if (PAUSES.has(s)) return 'sil';
  // Tilde ASCII → combinant (SAMPA « a~ »).
  const ali = ALIAS[s] ?? ALIAS[s.normalize('NFC')];
  if (ali) return ali;
  s = s.normalize('NFC');
  if (TABLE[s]) return s;
  // Forme décomposée d'une nasale.
  if (s.length === 2 && s.endsWith('̃')) {
    const base = ALIAS[s[0]!] ?? s[0]!;
    const comp = base + '̃';
    if (TABLE[comp]) return comp;
  }
  // Diphtongues ou affriquées (« dʒ », « tʃ ») : on garde le dernier élément.
  if (s.length > 1) {
    const dernier = normaliserPhoneme(s.slice(-1));
    if (dernier !== '?') return dernier;
  }
  return '?';
}

/** Vrai si le symbole est reconnu (après normalisation). */
export function phonemeConnu(ph: string): boolean {
  return normaliserPhoneme(ph) !== '?';
}

/** Informations d'un phonème ; un symbole inconnu devient une consonne transparente (T/D/N). */
export function infoPhoneme(ph: string): InfoPhoneme {
  const api = normaliserPhoneme(ph);
  if (api === 'sil') return INFO_PAUSE;
  const l = TABLE[api] ?? TABLE['t']!;
  return {
    api: TABLE[api] ? api : '?',
    viseme: l[0],
    cible: { ouverture: l[1], largeur: l[2], arrondi: l[3] },
    dents: l[4],
    forceLevres: l[5],
    forceMachoire: l[6],
    voyelle: l[7],
    arrondie: l[8],
    pause: false,
  };
}

/** Visème d'un phonème. */
export function visemeDe(ph: string): Viseme {
  return infoPhoneme(ph).viseme;
}

/** Cibles par visème (pour les clés manuelles et le choix de la forme la plus proche). */
export const CIBLES_VISEMES: Readonly<Record<Viseme, FormeBouche>> = Object.freeze({
  repos: { ouverture: 0.03, largeur: 0, arrondi: 0, dents: 0, langue: 0 },
  MBP: { ouverture: 0, largeur: -0.05, arrondi: 0.12, dents: 0, langue: 0 },
  A: { ouverture: 0.85, largeur: 0.25, arrondi: 0.05, dents: 0.3, langue: 0 },
  E: { ouverture: 0.5, largeur: 0.4, arrondi: 0.03, dents: 0.4, langue: 0 },
  I: { ouverture: 0.22, largeur: 0.85, arrondi: 0, dents: 0.55, langue: 0 },
  O: { ouverture: 0.55, largeur: -0.3, arrondi: 0.75, dents: 0.1, langue: 0 },
  U: { ouverture: 0.18, largeur: -0.62, arrondi: 1, dents: 0, langue: 0 },
  FV: { ouverture: 0.12, largeur: 0.1, arrondi: 0, dents: 1, langue: 0 },
  SZ: { ouverture: 0.1, largeur: 0.55, arrondi: 0, dents: 0.75, langue: 0 },
  CHJ: { ouverture: 0.2, largeur: -0.4, arrondi: 0.85, dents: 0.45, langue: 0 },
  LR: { ouverture: 0.35, largeur: 0.2, arrondi: 0.05, dents: 0.4, langue: 0.5 },
  TDN: { ouverture: 0.18, largeur: 0.28, arrondi: 0, dents: 0.5, langue: 0 },
  KG: { ouverture: 0.3, largeur: 0.15, arrondi: 0, dents: 0.3, langue: 0 },
});

/** Pseudo-phonème d'une clé de visème manuelle (force pleine). */
export function infoViseme(v: Viseme): InfoPhoneme {
  if (v === 'repos') return INFO_PAUSE;
  const c = CIBLES_VISEMES[v];
  return {
    api: v,
    viseme: v,
    cible: { ouverture: c.ouverture, largeur: c.largeur, arrondi: c.arrondi },
    dents: c.dents,
    forceLevres: 1,
    forceMachoire: 1,
    voyelle: v === 'A' || v === 'E' || v === 'I' || v === 'O' || v === 'U',
    arrondie: v === 'O' || v === 'U' || v === 'CHJ',
    pause: false,
  };
}

/** Visème dont la cible est la plus proche d'une forme (poids 2 / 1 / 1,5 sur ouverture / largeur / arrondi). */
export function visemeLePlusProche(f: Pick<FormeBouche, 'ouverture' | 'largeur' | 'arrondi'>): Viseme {
  let meilleur: Viseme = 'repos';
  let d = Infinity;
  for (const v of Object.keys(CIBLES_VISEMES) as Viseme[]) {
    if (v === 'MBP' && f.ouverture > 0.05) continue;
    const c = CIBLES_VISEMES[v];
    const e = 2 * (f.ouverture - c.ouverture) ** 2 + (f.largeur - c.largeur) ** 2 + 1.5 * (f.arrondi - c.arrondi) ** 2;
    if (e < d) {
      d = e;
      meilleur = v;
    }
  }
  return meilleur;
}

// ── Coarticulation ───────────────────────────────────────────────────────────────────────────────────────────────

/** Segment articulé (instants absolus, s). */
export interface SegmentArticule {
  debut: number;
  fin: number;
  info: InfoPhoneme;
  accent: boolean;
}

/** Réglages de la coarticulation. */
export interface ReglagesCoarticulation {
  /** Constante de temps d'anticipation (s). */
  anticipation: number;
  /** Constante de temps de persistance (s). */
  persistance: number;
  /** Anticipation de l'arrondi des voyelles arrondies (s) : look-ahead français. */
  anticipationArrondi: number;
  /** Fraction du segment où la cible est pleinement dominante (plateau). */
  plateau: number;
  /** Durée minimale de fermeture des M/B/P (s). */
  fermetureMin: number;
}

/** Réglages par défaut. */
export const COARTICULATION_DEFAUT: Readonly<ReglagesCoarticulation> = Object.freeze({
  anticipation: 0.045,
  persistance: 0.04,
  anticipationArrondi: 0.14,
  plateau: 0.6,
  fermetureMin: 0.045,
});

/** Fenêtre d'influence (s) au-delà de laquelle un segment est ignoré (poids < e⁻¹²). */
const PORTEE = 0.6;

/** Plateau lissé : 1 sur `[a, b]`, rampes smoothstep de `r` de part et d'autre. */
function plateauLisse(t: number, a: number, b: number, r: number): number {
  if (t < a) return smoothstep(a - r, a, t);
  if (t > b) return 1 - smoothstep(b, b + r, t);
  return 1;
}

/** Premier indice dont la fin dépasse `t` (segments triés). */
function premierApres(segments: readonly SegmentArticule[], t: number): number {
  let lo = 0;
  let hi = segments.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (segments[m]!.fin < t) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/**
 * Forme de bouche coarticulée à l'instant `t` (absolu). Hors de la portée des segments : repos.
 * Continue en `t` (dominances continues, contraintes lissées).
 */
export function formeCoarticulee(
  segments: readonly SegmentArticule[],
  t: number,
  r: ReglagesCoarticulation = COARTICULATION_DEFAUT,
): FormeBouche {
  const repos = CIBLES_VISEMES.repos;
  if (segments.length === 0) return { ...repos };
  // Pauses implicites avant et après la réplique.
  let sO = INFO_PAUSE.forceMachoire * domin(t, -Infinity, segments[0]!.debut, r.persistance, r.anticipation);
  let sOT = sO * repos.ouverture;
  let sL = INFO_PAUSE.forceLevres * domin(t, -Infinity, segments[0]!.debut, r.persistance, r.anticipation);
  let sLT = 0;
  let sA = sL;
  let sAT = 0;
  const dernier = segments[segments.length - 1]!;
  const apres = domin(t, dernier.fin, Infinity, r.persistance, r.anticipation);
  sO += 0.9 * apres;
  sOT += 0.9 * apres * repos.ouverture;
  sL += 0.9 * apres;
  sA += 0.9 * apres;
  let dents = 0;
  let langue = 0;
  let fermeture = 0;
  const i0 = premierApres(segments, t - PORTEE);
  for (let i = i0; i < segments.length; i++) {
    const s = segments[i]!;
    if (s.debut > t + PORTEE) break;
    const duree = Math.max(1e-3, s.fin - s.debut);
    const c = (s.debut + s.fin) / 2;
    const h = (r.plateau * duree) / 2;
    const info = s.info;
    const d = domin(t, c - h, c + h, r.persistance, r.anticipation);
    const wO = info.forceMachoire * d;
    sO += wO;
    sOT += wO * info.cible.ouverture;
    const wL = info.forceLevres * d;
    sL += wL;
    sLT += wL * info.cible.largeur;
    const dA = info.arrondie && info.voyelle ? domin(t, c - h, c + h, r.persistance, r.anticipationArrondi) : d;
    const wA = (info.arrondie ? Math.max(info.forceLevres, 0.9) : info.forceLevres) * dA;
    sA += wA;
    sAT += wA * info.cible.arrondi;
    if (info.viseme === 'FV') dents = Math.max(dents, plateauLisse(t, c - h, c + h, 0.03));
    else dents = Math.max(dents, info.dents * d * 0.8);
    if (info.api === 'l' && duree > 0.12) langue = Math.max(langue, plateauLisse(t, c - h, c + h, 0.04));
    if (info.viseme === 'MBP') {
      const hf = Math.max(h, r.fermetureMin / 2);
      fermeture = Math.max(fermeture, plateauLisse(t, c - hf, c + hf, 0.025));
    }
  }
  let ouverture = sO > 0 ? sOT / sO : repos.ouverture;
  let largeur = sL > 0 ? sLT / sL : 0;
  let arrondi = sA > 0 ? sAT / sA : 0;
  if (fermeture > 0) {
    ouverture *= 1 - fermeture;
    largeur += (CIBLES_VISEMES.MBP.largeur - largeur) * fermeture * 0.5;
    arrondi += (CIBLES_VISEMES.MBP.arrondi - arrondi) * fermeture * 0.5;
    dents *= 1 - fermeture;
  }
  return { ouverture, largeur, arrondi, dents, langue };
}

/** Dominance : 1 sur `[a, b]`, décroissance exp. de constante `avant` (anticipation) et `apres` (persistance). */
function domin(t: number, a: number, b: number, apres: number, avant: number): number {
  if (t < a) return Math.exp(-(a - t) / avant);
  if (t > b) return Math.exp(-(t - b) / apres);
  return 1;
}

// ── Piste discrète ───────────────────────────────────────────────────────────────────────────────────────────────

/** Segment de visème discret. */
export interface SegmentViseme {
  debut: number;
  fin: number;
  viseme: Viseme;
}

/**
 * Piste discrète : un visème par segment, puis fusion des égaux, absorption des formes plus courtes que
 * `dureeMin` (sauf M/B/P, allongés à `fermetureMin` au moins), pauses courtes (< 0,12 s) fondues dans la forme
 * précédente.
 */
export function pisteVisemesDiscrete(
  segments: readonly SegmentArticule[],
  dureeMin = 0.06,
  fermetureMin = COARTICULATION_DEFAUT.fermetureMin,
): SegmentViseme[] {
  let l: SegmentViseme[] = segments.map((s) => ({ debut: s.debut, fin: s.fin, viseme: s.info.viseme }));
  // Pauses courtes : on garde la forme précédente.
  l = l.map((s, i) => (s.viseme === 'repos' && s.fin - s.debut < 0.12 && i > 0 ? { ...s, viseme: l[i - 1]!.viseme } : s));
  const fusionner = (x: SegmentViseme[]): SegmentViseme[] => {
    const r: SegmentViseme[] = [];
    for (const s of x) {
      const p = r[r.length - 1];
      if (p && p.viseme === s.viseme && Math.abs(p.fin - s.debut) < 1e-9) p.fin = s.fin;
      else r.push({ ...s });
    }
    return r;
  };
  l = fusionner(l);
  for (let passe = 0; passe < 3; passe++) {
    const r: SegmentViseme[] = [];
    for (let i = 0; i < l.length; i++) {
      const s = l[i]!;
      const d = s.fin - s.debut;
      if (s.viseme !== 'MBP' && d < dureeMin && l.length > 1) {
        const p = r[r.length - 1];
        const n = l[i + 1];
        // Absorbé par le voisin le plus long (jamais par une fermeture, qui garde sa durée).
        if (p && p.viseme !== 'MBP' && (!n || n.viseme === 'MBP' || p.fin - p.debut >= n.fin - n.debut)) {
          p.fin = s.fin;
          continue;
        }
        if (n && n.viseme !== 'MBP') {
          n.debut = s.debut;
          continue;
        }
      }
      r.push(s);
    }
    l = fusionner(r);
  }
  // Fermetures M/B/P : au moins `fermetureMin`, centrées, en rognant les voisins.
  for (let i = 0; i < l.length; i++) {
    const s = l[i]!;
    if (s.viseme !== 'MBP') continue;
    const d = s.fin - s.debut;
    if (d >= fermetureMin) continue;
    const c = (s.debut + s.fin) / 2;
    s.debut = c - fermetureMin / 2;
    s.fin = c + fermetureMin / 2;
    const p = l[i - 1];
    const n = l[i + 1];
    if (p) p.fin = Math.min(p.fin, s.debut);
    if (n) n.debut = Math.max(n.debut, s.fin);
  }
  return l.filter((s) => s.fin > s.debut);
}

/** Visème discret à l'instant `t` (repos hors piste). */
export function visemeA(piste: readonly SegmentViseme[], t: number): Viseme {
  let lo = 0;
  let hi = piste.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    const s = piste[m]!;
    if (t < s.debut) hi = m - 1;
    else if (t >= s.fin) lo = m + 1;
    else return s.viseme;
  }
  return 'repos';
}
