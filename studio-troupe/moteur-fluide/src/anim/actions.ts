/**
 * Bibliothèque d'ACTIONS : recettes paramétrées (anticipation → action → dépassement → retour au calme).
 *
 * Chaque recette reçoit ses paramètres (durée, tempo, gain d'exagération, cible résolue, morphologie du rig,
 * accents de la parole…) et rend une **contribution** :
 * - des **courbes d'intention** par canal (os.r, os.tx…, `@racine.*`, `@visage.*`), en temps local, qui passent
 *   ensuite par les ressorts analytiques de chaque os (`couches.ts`) : le ressort fabrique le dépassement et le
 *   retour au calme, la profondeur de l'os dans la chaîne fabrique le chevauchement ;
 * - des **signaux directs** déjà lisses (respiration, bruit de vie, cycle de marche, secousses du rire,
 *   tremblement de colère) ajoutés après les ressorts ;
 * - des changements d'ordre de dessin, des clignements et saccades forcés, une cible de regard.
 *
 * Toutes les courbes partent de 0 et reviennent à 0 avant la fin de l'action : chaque action rend la pose de
 * repos après sa durée (plus le temps d'amortissement du ressort). Les amplitudes sont **amples** et lisibles sur
 * un téléphone : bras qui s'envolent à 55° dans la surprise, épaules qui montent de 5 % de la taille, buste qui
 * part de 12° dans le recul… multipliées par le gain `g` (intensité × exagération du personnage).
 */
import { bruitFractal1D, hash01, hashChaine } from '../noyau/aleatoire';
import { hermite, smoothstep, smootherstep } from '../noyau/courbes';
import { borner, ecartAngle } from '../noyau/maths2d';
import { DUREE_DEMI_TOUR_DEFAUT, DUREE_MARCHE_DEFAUT, marchesDansPlan, positionAuSol } from '../timeline/trajets';
import type { ActionPlacee, ParametresRessort, PointDecor, ValeurParametre } from '../timeline/types';
import { courbe, RACINE, VISAGE, type CourbePL, type IndiceVisage, type Propriete } from './canaux';
import { hauteurMonde, miroirA, type CibleResolue, type ContexteAnim } from './cibles';
import { aOs, angleRepos, limitesOs, longueurOs, pivotOs, signeAbduction, signeVers, type Morphologie } from './corps';
import type { ModifRessort, Zone } from './reglages';

const DEG = Math.PI / 180;

/** Points `[t, v]` d'une courbe (temps local, s). */
export type Points = ReadonlyArray<readonly [number, number]>;

/** Couche d'une action. */
export type Couche = 'base' | 'geste' | 'additif';

/** Côté du personnage. */
export type Cote = 'G' | 'D';
const COTES: readonly Cote[] = ['D', 'G'];
const autre = (c: Cote): Cote => (c === 'G' ? 'D' : 'G');

/** Paramètres donnés à une recette. */
export interface ParamsRecette {
  action: ActionPlacee;
  /** Identifiant canonique de la recette. */
  id: string;
  /** Début (temps de jeu, s). */
  debut: number;
  /** Durée effective (s). */
  D: number;
  /** Tempo (action × personnalité ; 2 = deux fois plus vite). */
  k: number;
  /** Gain d'exagération (intensité × exagération). */
  g: number;
  m: Morphologie;
  /** Sens du regard du personnage dans le repère du dessin, au début de l'action. */
  sens: 1 | -1;
  cible: CibleResolue | null;
  graine: number;
  /** Accents de la parole du personnage pendant l'action (temps local, force). */
  accents: ReadonlyArray<{ t: number; force: number }>;
  /** Intervalles de parole du personnage (temps local). */
  parole: ReadonlyArray<readonly [number, number]>;
  params: Readonly<Record<string, ValeurParametre>>;
  /** Action ajoutée par le moteur (vie de base, gestes de parole, regards d'écoute). */
  implicite: boolean;
  cc: ContexteAnim;
}

/** Fonction d'ajout d'un signal direct (zone de masque imposée pour des sorties couplées). */
export type Ajout = (os: string, prop: string, v: number, zone?: Zone) => void;

/** Courbe d'intention d'une action. */
export interface CourbeAction {
  os: string;
  prop: string;
  courbe: CourbePL;
  ressort?: ModifRessort;
  /** Zone de masquage (défaut : celle de l'os). */
  zone?: Zone;
  /** Retard de chevauchement imposé (s) ; défaut : profondeur de l'os × chevauchement. */
  retard?: number;
}

/** Signal direct (temps local). */
export interface DirectAction {
  debut: number;
  fin: number;
  fn: (tl: number, ajouter: Ajout) => void;
}

/** Changement d'ordre de dessin d'un groupe (temps local). */
export interface OrdreAction {
  groupe: string;
  ordre: number;
  debut: number;
  fin: number;
}

/** Cible de regard de base pendant une fenêtre (temps local, unités de regard). */
export interface RegardAction {
  debut: number;
  fin: number;
  x: number;
  y: number;
}

/** Contribution d'une action. */
export interface Contribution {
  courbes: CourbeAction[];
  directs: DirectAction[];
  ordres: OrdreAction[];
  clignements: number[];
  saccades: number[];
  regard: RegardAction | null;
}

/** Recette d'action. */
export interface Recette {
  id: string;
  alias: readonly string[];
  couche: Couche;
  priorite: number;
  /** Durée par défaut au tempo 1 (s). */
  dureeDefaut: number;
  /** Fenêtre non interruptible depuis le début (s, au tempo 1). */
  protection: number;
  /** Poids de masque par zone (fonction des paramètres pour les gestes latéralisés). */
  masque: (p: ParamsRecette) => Partial<Record<Zone, number>>;
  construire(p: ParamsRecette): Contribution;
}

/** Options d'une courbe. */
interface OptionsCourbe {
  ressort?: ModifRessort;
  zone?: Zone;
  retard?: number;
}

/** Os de repli quand le rig n'a pas l'os demandé (translations d'épaule portées par le bras, etc.). */
function repli(m: Morphologie, os: string, prop: string): string | null {
  if (os === RACINE || os === VISAGE || aOs(m, os)) return os;
  const cote = os.slice(-1);
  if (os.startsWith('epaule') && (prop === 'tx' || prop === 'ty')) return aOs(m, 'bras' + cote) ? 'bras' + cote : null;
  if (os === 'cou') return aOs(m, 'tete') ? 'tete' : null;
  if (os === 'poitrine') return aOs(m, 'torse') ? 'torse' : null;
  return null;
}

/**
 * Écriture d'une recette : helpers anatomiques qui produisent les courbes signées pour le rig réel.
 * Les angles sont en degrés « anatomiques », multipliés par le gain `g` sauf mention.
 */
export class Ecriture {
  readonly c: Contribution = { courbes: [], directs: [], ordres: [], clignements: [], saccades: [], regard: null };

  constructor(readonly p: ParamsRecette) {}

  get m(): Morphologie {
    return this.p.m;
  }
  get H(): number {
    return this.p.m.H;
  }
  get g(): number {
    return this.p.g;
  }
  /** Durée au tempo de l'action. */
  T(x: number): number {
    return x / this.p.k;
  }

  /** Courbe en valeurs finales (rad, px, échelle − 1, indice). */
  brut(os: string, prop: Propriete | IndiceVisage, pts: Points, o: OptionsCourbe = {}): void {
    const cible = repli(this.m, os, prop);
    if (!cible) return;
    if (pts.length === 0 || pts.every(([, v]) => v === 0)) return;
    this.c.courbes.push({ os: cible, prop, courbe: courbe(pts), ressort: o.ressort, zone: o.zone, retard: o.retard });
  }

  /** Rotation en degrés × gain × signe. */
  rot(os: string, signe: number, pts: Points, o: OptionsCourbe = {}, gain = this.g): void {
    this.brut(os, 'r', pts.map(([t, v]) => [t, v * DEG * signe * gain] as const), o);
  }

  /** Lève le bras du côté `c` vers l'extérieur (degrés, négatif = le serre contre le corps). */
  abduction(c: Cote, pts: Points, o: OptionsCourbe = {}): void {
    this.rot('bras' + c, signeAbduction(this.m, 'bras' + c, c), pts, o);
  }
  /**
   * Ouvre l'avant-bras vers l'extérieur et le haut (négatif = le replie vers le corps). Le coude ne s'ouvre pas
   * au-delà de sa limite articulaire : l'excédent passe au bras (la direction de la main est conservée, le bras
   * se lève davantage au lieu de casser le coude).
   */
  avantBras(c: Cote, pts: Points, o: OptionsCourbe = {}): void {
    const nom = 'avantBras' + c;
    const s = signeAbduction(this.m, nom, c);
    const lim = limitesOs(this.m, nom);
    if (!lim) {
      this.rot(nom, s, pts, o);
      return;
    }
    // Ouverture maximale (degrés anatomiques) avant la marge de la limite douce du rig.
    const marge = 0.1;
    const maxRad = s > 0 ? lim.max - marge : -(lim.min + marge);
    const max = Math.max(0, maxRad) / DEG / Math.max(1e-6, this.g);
    const garde = pts.map(([t, v]) => [t, Math.min(v, max)] as const);
    const exces = pts.map(([t, v]) => [t, Math.max(0, v - max)] as const);
    this.rot(nom, s, garde, o);
    if (exces.some(([, v]) => v > 0)) this.rot('bras' + c, signeAbduction(this.m, 'bras' + c, c), exces, o);
  }
  /** Ouvre la main vers l'extérieur (négatif = vers l'intérieur). */
  main(c: Cote, pts: Points, o: OptionsCourbe = {}): void {
    this.rot('main' + c, signeAbduction(this.m, 'main' + c, c), pts, o);
  }
  /** Monte l'épaule (fraction de la hauteur du personnage). */
  epaule(c: Cote, pts: Points, o: OptionsCourbe = {}): void {
    const os = aOs(this.m, 'epaule' + c) ? 'epaule' + c : 'bras' + c;
    this.brut(os, 'ty', pts.map(([t, v]) => [t, -v * this.H * this.g] as const), o);
  }
  /** Penche un os dressé (torse, cou, tête, racine) vers la direction image `dir` (degrés). */
  pencher(os: string, dir: number, pts: Points, o: OptionsCourbe = {}): void {
    const s = os === RACINE ? Math.sign(dir) || 1 : signeVers(this.m, os, dir, 0, dir >= 0 ? 1 : -1);
    this.rot(os, s, pts, o);
  }
  /** Tangage de la tête : + = baissée, − = levée (1 ≈ 25°). De face : glissement et écrasement ; de profil : rotation. */
  tangage(pts: Points, o: OptionsCourbe = {}): void {
    const or = this.m.orientation;
    if (or === 0) {
      this.brut('tete', 'ty', pts.map(([t, v]) => [t, 0.03 * this.H * v * this.g] as const), o);
      this.brut('tete', 'sy', pts.map(([t, v]) => [t, -0.08 * Math.abs(v) * this.g] as const), o);
      this.brut('cou', 'sy', pts.map(([t, v]) => [t, 0.08 * -v * this.g] as const), o);
    } else {
      this.brut('tete', 'r', pts.map(([t, v]) => [t, or * v * 0.42 * this.g] as const), o);
      this.brut('cou', 'r', pts.map(([t, v]) => [t, or * v * 0.12 * this.g] as const), o);
    }
  }
  /** Lacet de la tête vers la droite (+) ou la gauche (−) de l'image, −1 … 1 (de face : glissement + écrasement). */
  lacet(pts: Points, o: OptionsCourbe = {}): void {
    if (this.m.orientation === 0) {
      this.brut('tete', 'tx', pts.map(([t, v]) => [t, 0.018 * this.H * v * this.g] as const), o);
      this.brut('tete', 'sx', pts.map(([t, v]) => [t, -0.08 * Math.abs(v) * this.g] as const), o);
      this.brut('cou', 'tx', pts.map(([t, v]) => [t, 0.006 * this.H * v * this.g] as const), o);
    } else {
      this.brut('tete', 'sx', pts.map(([t, v]) => [t, -0.03 * Math.abs(v) * this.g] as const), o);
    }
  }
  /** Inclinaison de la tête vers `dir` (degrés). */
  roulis(dir: number, pts: Points, o: OptionsCourbe = {}): void {
    this.pencher('tete', dir, pts, o);
  }
  /** Canal de racine en valeurs finales. */
  racine(prop: Propriete, pts: Points, o: OptionsCourbe = {}): void {
    this.brut(RACINE, prop, pts, o);
  }
  /** Indication de visage (valeurs finales, sans gain). */
  visage(indice: IndiceVisage, pts: Points, o: OptionsCourbe = {}): void {
    this.brut(VISAGE, indice, pts, { zone: 'visage', retard: 0, ...o });
  }
  /** Signal direct. */
  direct(debut: number, fin: number, fn: (tl: number, ajouter: Ajout) => void): void {
    this.c.directs.push({ debut, fin, fn });
  }
  /** Monte les groupes de dessin d'un membre au premier plan pendant `[debut, fin]`. */
  devant(os: readonly string[], debut: number, fin: number, rang = 1): void {
    for (const nom of os) {
      for (const groupe of this.m.groupesParOs.get(nom) ?? []) {
        this.c.ordres.push({ groupe, ordre: this.m.ordreMax + rang, debut, fin });
      }
    }
  }
}

/** Phases standard : anticipation `a`, action `p`, retour `r` (s au tempo 1), comprimées pour tenir dans D. */
export function phases(D: number, k: number, a0: number, p0: number, r0: number): { A: number; P: number; tH: number; tR: number; r: number; fin: number } {
  let a = a0 / k;
  let p = p0 / k;
  let r = r0 / k;
  const total = a + p + r;
  if (total > D * 0.92) {
    const s = (D * 0.92) / total;
    a *= s;
    p *= s;
    r *= s;
  }
  const tR = D - r;
  return { A: a, P: p, tH: a + p, tR, r, fin: tR + 0.65 * r };
}

/** Bruit lisse de vie (deux octaves). */
function bruit(x: number, graine: number): number {
  return bruitFractal1D(x, graine, { octaves: 2 });
}

/** Côté du personnage dont le bras est du côté image `dir`. */
function coteVers(m: Morphologie, dir: number): Cote {
  return m.cote.G === (dir >= 0 ? 1 : -1) ? 'G' : 'D';
}

/** Côté de main imposé par le paramètre `main` (« G » / « D » / « gauche » / « droite »). */
function coteParametre(p: ParamsRecette): Cote | null {
  const v = p.params.main ?? p.params.cote;
  if (typeof v !== 'string') return null;
  const s = v.toLowerCase();
  if (s === 'g' || s.startsWith('gau')) return 'G';
  if (s === 'd' || s.startsWith('dro')) return 'D';
  return null;
}

/** Côté image de la cible, sinon sens du regard. */
function coteCible(p: ParamsRecette): 1 | -1 {
  return p.cible ? p.cible.cote : p.sens;
}

/** Hachage local d'une action. */
function h(p: ParamsRecette, ...n: number[]): number {
  return hash01(p.graine, ...n);
}

/** Ressort et zone communs des canaux liés (racine et jambes d'une flexion), sans retard de chaîne. */
const LIE: OptionsCourbe = { ressort: { absolu: { f: 2.1, zeta: 0.8 } }, retard: 0, zone: 'jambes' };

/** Échantillonne finement une courbe de clés (8 sous-points par segment) pour une fonction non linéaire. */
function affiner(pts: Points, f: (v: number) => number): Points {
  const r: Array<readonly [number, number]> = [];
  pts.forEach(([t, v], i) => {
    r.push([t, f(v)]);
    const s = pts[i + 1];
    if (s && s[0] > t) for (let k = 1; k < 8; k++) r.push([t + ((s[0] - t) * k) / 8, f(v + ((s[1] - v) * k) / 8)]);
  });
  return r;
}

/** Longueur hanche → cheville d'un côté (px). */
function longueurJambe(m: Morphologie, c: Cote): number {
  return longueurOs(m, 'cuisse' + c, 0.2) + longueurOs(m, 'jambe' + c, 0.18);
}

/**
 * Déplace le bassin horizontalement (px, courbe de clés) **sans faire glisser les pieds** : la racine se
 * translate, chaque jambe pivote à la hanche de `asin(−dx/L)` et le pied compense. Racine et jambes partagent
 * un ressort et n'ont pas de retard de chaîne.
 */
function deplacerBassin(e: Ecriture, pts: Points, ressort: ParametresRessort): void {
  // Une seule zone de masque pour les courbes couplées : une atténuation les touche toutes pareil.
  const o: OptionsCourbe = { ressort: { absolu: ressort }, retard: 0, zone: 'racine' };
  e.racine('tx', pts, o);
  for (const c of COTES) {
    const L = longueurJambe(e.m, c);
    const s = signeVers(e.m, 'cuisse' + c, -1, 0, -1);
    const angle = affiner(pts, (dx) => s * Math.asin(borner(dx / L, -0.9, 0.9)));
    e.brut('cuisse' + c, 'r', angle, o);
    e.brut('pied' + c, 'r', angle.map(([t, v]) => [t, -v] as const), o);
  }
}

/** Version directe : ajoute un déplacement `dx` (px) du bassin, pieds fixes. */
function deplacerBassinDirect(m: Morphologie, aj: Ajout, dx: number): void {
  if (dx === 0) return;
  aj(RACINE, 'tx', dx, 'racine');
  for (const c of COTES) {
    const a = signeVers(m, 'cuisse' + c, -1, 0, -1) * Math.asin(borner(dx / longueurJambe(m, c), -0.9, 0.9));
    aj('cuisse' + c, 'r', a, 'racine');
    aj('pied' + c, 'r', -a, 'racine');
  }
}

/** Masque plein corps. */
const CORPS_ENTIER: Partial<Record<Zone, number>> = { racine: 1, jambes: 0.5, torse: 1, tete: 1, brasG: 1, brasD: 1, visage: 1 };

// ── Recettes ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Respiration : cycle asymétrique (inspiration 40 %, expiration 60 %), poitrine, épaules, tête en retard. */
const respirer: Recette = {
  id: 'respirer',
  alias: ['respiration'],
  couche: 'additif',
  priorite: 0,
  dureeDefaut: 4,
  protection: 0,
  masque: () => ({}),
  construire(p) {
    const e = new Ecriture(p);
    const periode = (3.6 + 0.8 * h(p, 1)) / p.cc.perso.tempo;
    const phase0 = h(p, 2);
    const A = p.implicite ? p.g : 0.6 * p.g;
    const fondu = p.implicite ? 0 : Math.min(0.6, p.D / 3);
    const cycle = (t: number): number => {
      const u = ((t / periode + phase0) % 1 + 1) % 1;
      return u < 0.4 ? smootherstep(0, 1, u / 0.4) : 1 - smootherstep(0, 1, (u - 0.4) / 0.6);
    };
    const parle = (tl: number): number => {
      let w = 0;
      for (const [a, b] of p.parole) w = Math.max(w, smoothstep(a - 0.3, a, tl) * (1 - smoothstep(b, b + 0.4, tl)));
      return w;
    };
    const H = e.H;
    e.direct(0, p.D, (tl, aj) => {
      const env = fondu > 0 ? smoothstep(0, fondu, tl) * (1 - smoothstep(p.D - fondu, p.D, tl)) : 1;
      const a = A * env * (1 - 0.5 * parle(tl));
      if (a === 0) return;
      const b = cycle(tl);
      const bt = cycle(tl - 0.25);
      aj('torse', 'sy', 0.022 * a * b);
      aj('torse', 'sx', -0.005 * a * b);
      aj('ventre', 'sy', 0.02 * a * cycle(tl - 0.1));
      for (const c of COTES) {
        const os = aOs(e.m, 'epaule' + c) ? 'epaule' + c : 'bras' + c;
        aj(os, 'ty', -0.009 * H * a * b);
        aj('bras' + c, 'r', signeAbduction(e.m, 'bras' + c, c) * 1.2 * DEG * a * b);
      }
      aj('tete', 'ty', -0.005 * H * a * bt);
    });
    return e.c;
  },
};

/** Attente vivante : reports de poids (pose clé + ressort lent), micro-mouvements au bruit simplex. */
const attendre: Recette = {
  id: 'attendre',
  alias: ['idle', 'attente'],
  couche: 'additif',
  priorite: 0,
  dureeDefaut: 6,
  protection: 0,
  masque: () => ({}),
  construire(p) {
    const e = new Ecriture(p);
    const g = p.implicite ? 1 : 1 + 0.6 * p.g;
    const lent: ModifRessort = { facteurF: 0.55, zeta: 0.85 };
    // Reports de poids : instants et amplitudes par hachage, côtés alternés.
    const pts: Array<[number, number]> = [[0, 0]];
    let t = 0.6 + 1.5 * h(p, 10);
    let cote = h(p, 11) < 0.5 ? 1 : -1;
    let i = 0;
    const finPoids = p.D - 1.2;
    while (t < finPoids) {
      const a = cote * (0.6 + 0.4 * h(p, 12, i));
      pts.push([t, a], [t + 0.5, a]);
      t += (2.5 + 2 * h(p, 13, i)) / p.cc.perso.tempo;
      cote = -cote;
      i++;
    }
    pts.push([Math.max(finPoids, (pts[pts.length - 1]?.[0] ?? 0) + 0.5), 0], [p.D, 0]);
    // Les instants des reports se suivent (rampes de 0,5 s) : courbe en marches adoucies.
    const poids: Array<[number, number]> = [];
    for (let k = 0; k < pts.length; k++) {
      const [tk, vk] = pts[k]!;
      const prec = poids[poids.length - 1];
      if (prec && tk <= prec[0]) continue;
      poids.push([tk, vk]);
    }
    const H = e.H;
    const sur = (f: (v: number) => number): Points => poids.map(([tt, v]) => [tt, f(v)] as const);
    deplacerBassin(e, sur((v) => v * 0.014 * H * g), { f: 1.05, zeta: 0.85 });
    e.racine('r', sur((v) => v * 1.1 * DEG * g), { ressort: lent });
    e.brut('torse', 'r', sur((v) => -v * 1.6 * DEG * g * signeVers(e.m, 'torse', 1)), { ressort: lent });
    e.brut('tete', 'r', sur((v) => v * 0.8 * DEG * g * signeVers(e.m, 'tete', 1)), { ressort: lent });
    // Jambe libre : genou qui se relâche (cuisse +α, jambe −2α, pied +α : le pied reste en place, talon levé).
    const relache: OptionsCourbe = { ressort: { absolu: { f: 1.05, zeta: 0.85 } }, retard: 0, zone: 'racine' };
    for (const c of COTES) {
      const ext = e.m.cote[c];
      const libre = (v: number): number => (Math.sign(v) === ext ? 0 : Math.abs(v));
      const sC = signeAbduction(e.m, 'cuisse' + c, c);
      const sJ = signeAbduction(e.m, 'jambe' + c, c);
      e.brut('cuisse' + c, 'r', sur((v) => libre(v) * 2.2 * DEG * g * sC), relache);
      e.brut('jambe' + c, 'r', sur((v) => -libre(v) * 4.4 * DEG * g * sJ), relache);
      e.brut('pied' + c, 'r', sur((v) => libre(v) * 2.2 * DEG * g * sJ), relache);
    }
    const s = p.graine;
    e.direct(0, p.D, (tl, aj) => {
      const env = p.implicite ? 1 : smoothstep(0, 0.8, tl) * (1 - smoothstep(p.D - 0.8, p.D, tl));
      const a = g * env;
      aj('tete', 'r', 1.6 * DEG * a * bruit(tl * 0.23, s + 1));
      aj('tete', 'tx', 0.004 * H * a * bruit(tl * 0.19, s + 2));
      aj('cou', 'r', 0.6 * DEG * a * bruit(tl * 0.21, s + 3));
      aj('torse', 'r', 0.7 * DEG * a * bruit(tl * 0.17, s + 4));
      aj(RACINE, 'r', 0.35 * DEG * a * bruit(tl * 0.13, s + 5));
      for (const c of COTES) {
        const k = c === 'G' ? 10 : 20;
        aj('bras' + c, 'r', 2.2 * DEG * a * bruit(tl * 0.21, s + k));
        aj('avantBras' + c, 'r', 3 * DEG * a * bruit(tl * 0.29, s + k + 1));
        aj('main' + c, 'r', 5 * DEG * a * bruit(tl * 0.37, s + k + 2));
      }
    });
    return e.c;
  },
};

/** Regarder : saccade des yeux, puis tête (+60 ms), puis buste si la cible est loin sur le côté. */
const regarder: Recette = {
  id: 'regarder',
  alias: ['regard', 'lookat'],
  couche: 'geste',
  priorite: 1,
  dureeDefaut: 2.5,
  protection: 0,
  masque: () => ({ regard: 1 }),
  construire(p) {
    const e = new Ecriture(p);
    const z: Zone = 'regard';
    const c = p.cible;
    const dx = c ? (c.camera ? 0 : c.dx) : p.sens;
    const dy = c ? (c.camera ? 0 : c.dy) : 0;
    const { tR, r } = phases(p.D, p.k, 0.06, 0.16, 0.35);
    const fin = tR + 0.65 * r;
    const t1 = e.T(0.06);
    const t2 = t1 + e.T(0.16);
    const de = (v: number): Points => [
      [0, 0],
      [t1, 0],
      [t2, v],
      [tR, v * 0.95],
      [fin, 0],
    ];
    const lacet = borner(dx, -1, 1) * (e.m.orientation === 0 ? 1 : 0);
    const tangage = borner(dy * 1.2, -0.8, 0.8);
    e.lacet(de(lacet), { zone: z });
    e.tangage(de(tangage), { zone: z });
    if (Math.abs(dx) > 0.2) e.roulis(Math.sign(dx), de(4.5 * Math.abs(dx)), { zone: z });
    if (Math.abs(dx) > 0.5 && e.m.orientation === 0) {
      e.pencher('torse', Math.sign(dx), [
        [0, 0],
        [t1 + e.T(0.08), 0],
        [t2 + e.T(0.12), 3.5 * Math.abs(dx)],
        [tR, 3 * Math.abs(dx)],
        [fin, 0],
      ], { zone: z });
    }
    e.c.regard = { debut: 0, fin: tR + 0.3 * r, x: borner(dx * 0.85, -1, 1), y: borner(dy * 0.85, -1, 1) };
    e.c.saccades.push(0, tR + 0.3 * r);
    if (!p.implicite && Math.abs(dx) > 0.5) e.c.clignements.push(0.02);
    return e.c;
  },
};

/** Hochement de tête (oui) : deux battements amortis, sourcils légèrement levés. */
const hocher: Recette = {
  id: 'hocher',
  alias: ['hochement', 'acquiescer'],
  couche: 'additif',
  priorite: 2,
  dureeDefaut: 0.8,
  protection: 0,
  masque: () => ({}),
  construire(p) {
    const e = new Ecriture(p);
    const s = p.D / 0.8;
    e.tangage([
      [0, 0],
      [0.04 * s, 0.6],
      [0.22 * s, -0.12],
      [0.34 * s, 0.42],
      [0.52 * s, 0],
    ], { zone: 'parole', ressort: { facteurF: 1.4 } });
    e.visage('sourcilHauteur', [
      [0, 0],
      [0.1 * s, 0.25],
      [0.5 * s, 0.2],
      [0.7 * s, 0],
    ]);
    return e.c;
  },
};

/** Hausser les épaules : épaules qui montent fort, coudes écartés, paumes ouvertes, tête qui s'enfonce et penche, moue. */
const hausserEpaules: Recette = {
  id: 'hausserEpaules',
  alias: ['haussement', 'hausser'],
  couche: 'geste',
  priorite: 5,
  dureeDefaut: 1.4,
  protection: 0,
  masque: () => ({ brasG: 1, brasD: 1, tete: 0.6, torse: 0.5, visage: 1 }),
  construire(p) {
    const e = new Ecriture(p);
    const { A, P, tR, fin } = phases(p.D, p.k, 0.1, 0.14, 0.5);
    const vif: ModifRessort = { facteurF: 1.3 };
    // Hauteur des épaules et écart des coudes : des CIBLES bornées (le gain d'exagération ne doit pas décoller la
    // manche du cou ni écarteler les bras d’un dessin unique). Épaules ≤ 5 % de la hauteur (≈ 6,5 % au dépassement) ; coudes ≤ 30°, et
    // ≤ 21° pour un dessin de trois quarts (le bras du fond se cache derrière le corps).
    const lev = Math.min(0.055, 0.05 / Math.max(1e-6, e.g));
    const ecart = Math.min(26, (e.m.orientation === 0 ? 30 : 21) / Math.max(1e-6, e.g));
    COTES.forEach((c, i) => {
      const d = i * e.T(0.03);
      e.epaule(c, [
        [0, 0],
        [A + d, -0.012],
        [A + P + d, lev],
        [tR, lev * 0.9],
        [fin, 0],
      ], { ressort: vif });
      // Coudes écartés, avant-bras pointés vers le spectateur (raccourcis en perspective), paumes ouvertes vers
      // l'extérieur : le haussement de face, sans casser le coude.
      e.abduction(c, [
        [0, 0],
        [A + d, -3],
        [A + P + d, ecart],
        [tR, ecart * 0.88],
        [fin, 0],
      ]);
      e.avantBras(c, [
        [0, 0],
        [A + d, -6],
        [A + P + d, 12],
        [tR, 10],
        [fin, 0],
      ]);
      e.brut('avantBras' + c, 'sy', [
        [0, 0],
        [A + P + d, -0.42],
        [tR, -0.38],
        [fin, 0],
      ]);
      e.main(c, [
        [0, 0],
        [A + P + d, 40],
        [tR, 36],
        [fin, 0],
      ]);
    });
    const dirTete = h(p, 3) < 0.5 ? 1 : -1;
    e.tangage([
      [0, 0],
      [A, -0.1],
      [A + P, 0.25],
      [tR, 0.22],
      [fin, 0],
    ]);
    e.roulis(dirTete, [
      [0, 0],
      [A + P, 7],
      [tR, 6],
      [fin, 0],
    ]);
    e.brut('torse', 'sy', [
      [0, 0],
      [A + P, 0.015 * e.g],
      [tR, 0.012 * e.g],
      [fin, 0],
    ]);
    e.racine('ty', [
      [0, 0],
      [A, 0.008 * e.H],
      [A + P, -0.006 * e.H * e.g],
      [A + P + e.T(0.2), 0],
    ]);
    const vis = (v: number): Points => [
      [0, 0],
      [A + P * 0.5, v],
      [tR, v * 0.85],
      [fin, 0],
    ];
    e.visage('sourcilHauteur', vis(0.85));
    e.visage('sourcilInclinaison', vis(-0.35));
    e.visage('sourire', vis(-0.5));
    e.visage('largeur', vis(-0.2));
    return e.c;
  },
};

/** Angle absolu (rad) du bras qui pointe vers une cible, borné en élévation, et côté du bras. */
function visee(p: ParamsRecette): { cote: Cote; angle: number; dir: 1 | -1 } {
  const dir = coteCible(p);
  const cote = coteParametre(p) ?? coteVers(p.m, dir);
  let angle: number;
  if (p.cible && !p.cible.camera) {
    angle = p.cible.angleEpaule;
  } else if (p.cible?.camera) {
    // Vers le spectateur : bras levé à 30° sous l'horizontale, du côté du bras.
    angle = dir > 0 ? 30 * DEG : Math.PI - 30 * DEG;
  } else {
    angle = dir > 0 ? 0 : Math.PI;
  }
  // Élévation bornée : de 45° au-dessus à 35° au-dessous de l'horizontale, côté de la cible.
  const horiz = Math.cos(angle) >= 0 ? 0 : Math.PI;
  const elev = ecartAngle(horiz, angle) * (horiz === 0 ? 1 : -1); // + = vers le bas
  const e = borner(elev, -45 * DEG, 35 * DEG);
  angle = horiz === 0 ? e : Math.PI - e;
  return { cote, angle, dir: Math.cos(angle) >= 0 ? 1 : -1 };
}

/** Pointer / accuser : recul armé, bras tendu vers la cible (dépassement), piques sur les accents, retrait. */
const pointer: Recette = {
  id: 'pointer',
  alias: ['accuser', 'montrer', 'designer'],
  couche: 'geste',
  priorite: 6,
  dureeDefaut: 1.2,
  protection: 0,
  masque: (p) => {
    const { cote } = visee(p);
    return { ['bras' + cote]: 1, ['bras' + autre(cote)]: 0.3, torse: 0.25, tete: 0.4, racine: 0.2, visage: 0.4 } as Partial<Record<Zone, number>>;
  },
  construire(p) {
    const e = new Ecriture(p);
    const { cote, angle, dir } = visee(p);
    const { A, P, tR, fin } = phases(p.D, p.k, 0.2, 0.18, 0.45);
    const m = e.m;
    const a1 = angleRepos(m, 'bras' + cote, Math.PI / 2);
    const a2 = angleRepos(m, 'avantBras' + cote, a1);
    const a3 = angleRepos(m, 'main' + cote, a2);
    const rotBras = ecartAngle(a1, angle);
    const rotAv = ecartAngle(a2, a1);
    const rotMain = ecartAngle(a3, a2);
    const frappe: ModifRessort = { facteurF: 1.35, zeta: 0.55 };
    e.brut('bras' + cote, 'r', [
      [0, 0],
      [A * 0.5, -0.25 * rotBras * Math.min(1.3, e.g)],
      [A, -0.25 * rotBras * Math.min(1.3, e.g)],
      [A + P * 0.5, rotBras],
      [tR, rotBras],
      [fin, 0],
    ], { ressort: frappe });
    const replie = -signeAbduction(m, 'avantBras' + cote, cote);
    e.brut('avantBras' + cote, 'r', [
      [0, 0],
      [A, replie * 25 * DEG * Math.min(1.3, e.g)],
      [A + P * 0.6, rotAv],
      [tR, rotAv],
      [fin, 0],
    ], { ressort: frappe });
    e.brut('main' + cote, 'r', [
      [0, 0],
      [A + P * 0.7, rotMain],
      [tR, rotMain],
      [fin, 0],
    ], { ressort: frappe });
    // Piques sur les accents de la parole pendant la tenue.
    const leve = signeVers(m, 'bras' + cote, 0, -1, 1);
    for (const ac of p.accents) {
      if (ac.t < A + P + 0.1 || ac.t > tR - 0.1) continue;
      e.brut('bras' + cote, 'r', [
        [ac.t - 0.09, 0],
        [ac.t - 0.03, leve * 6 * DEG * ac.force * e.g],
        [ac.t + 0.12, 0],
      ], { ressort: frappe });
    }
    const o = autre(cote);
    e.abduction(o, [
      [0, 0],
      [A + P, -4],
      [tR, -4],
      [fin, 0],
    ]);
    e.avantBras(o, [
      [0, 0],
      [A + P, -10],
      [tR, -10],
      [fin, 0],
    ]);
    e.pencher('torse', dir, [
      [0, 0],
      [A, -3],
      [A + P, 6],
      [tR, 5],
      [fin, 0],
    ]);
    e.pencher(RACINE, dir, [
      [0, 0],
      [A, -1],
      [A + P, 2],
      [tR, 1.6],
      [fin, 0],
    ]);
    const versTete = (v: number): Points => [
      [0, 0],
      [A * 0.5, v],
      [tR, v],
      [fin, 0],
    ];
    e.lacet(versTete(0.6 * dir), { zone: 'tete' });
    if (p.cible && !p.cible.camera) e.tangage(versTete(borner(p.cible.dy, -0.6, 0.6)));
    e.visage('sourcilFroncement', [
      [0, 0],
      [A + P, 0.35],
      [tR, 0.3],
      [fin, 0],
    ]);
    e.devant(['bras' + cote, 'avantBras' + cote, 'main' + cote], 0, fin + 0.2);
    if (p.cible) e.c.regard = { debut: 0, fin: tR, x: p.cible.camera ? 0 : p.cible.dx * 0.85, y: p.cible.camera ? 0 : p.cible.dy * 0.85 };
    e.c.saccades.push(0);
    return e.c;
  },
};

/** Mains ouvertes (« voilà ! ») : rapprochement, ouverture symétrique décalée de 30 ms, rebond, sourcils levés. */
const mainsOuvertes: Recette = {
  id: 'mainsOuvertes',
  alias: ['voila', 'ouvrirMains'],
  couche: 'geste',
  priorite: 4,
  dureeDefaut: 1,
  protection: 0,
  masque: () => ({ brasG: 1, brasD: 1, torse: 0.3, tete: 0.4, visage: 0.5 }),
  construire(p) {
    const e = new Ecriture(p);
    const { A, P, tR, fin } = phases(p.D, p.k, 0.12, 0.2, 0.4);
    const rebond: ModifRessort = { zeta: 0.42 };
    COTES.forEach((c, i) => {
      const d = i * e.T(0.03);
      e.abduction(c, [
        [0, 0],
        [A + d, -8],
        [A + P + d, 34],
        [tR, 30],
        [fin, 0],
      ], { ressort: rebond });
      e.avantBras(c, [
        [0, 0],
        [A + d, -12],
        [A + P + d, 12],
        [tR, 10],
        [fin, 0],
      ], { ressort: rebond });
      e.brut('avantBras' + c, 'sy', [
        [0, 0],
        [A + P + d, -0.2],
        [tR, -0.18],
        [fin, 0],
      ]);
      e.main(c, [
        [0, 0],
        [A + P + d, 42],
        [tR, 38],
        [fin, 0],
      ]);
      e.epaule(c, [
        [0, 0],
        [A + P + d, 0.012],
        [tR, 0.01],
        [fin, 0],
      ]);
    });
    const dir = coteCible(p);
    e.roulis(dir, [
      [0, 0],
      [A + P, 4],
      [tR, 3],
      [fin, 0],
    ]);
    e.tangage([
      [0, 0],
      [A + P, -0.15],
      [tR, -0.1],
      [fin, 0],
    ]);
    e.pencher('torse', dir, [
      [0, 0],
      [A + P, 2],
      [tR, 1.5],
      [fin, 0],
    ]);
    e.visage('sourcilHauteur', [
      [0, 0],
      [A + P, 0.45],
      [tR, 0.4],
      [fin, 0],
    ]);
    return e.c;
  },
};

/** Bras croisés : avant-bras qui se replient devant la poitrine (ordre de dessin commuté), buste en arrière. */
const brasCroises: Recette = {
  id: 'brasCroises',
  alias: ['croiserBras'],
  couche: 'geste',
  priorite: 3,
  dureeDefaut: 2.5,
  protection: 0.4,
  masque: () => ({ brasG: 1, brasD: 1, torse: 0.3, tete: 0.3 }),
  construire(p) {
    const e = new Ecriture(p);
    const { P, tR, fin } = phases(p.D, p.k, 0, 0.6, 0.5);
    COTES.forEach((c, i) => {
      const d = i * e.T(0.1);
      e.abduction(c, [
        [0, 0],
        [d + P * 0.5, 4],
        [d + P, 8],
        [tR, 8],
        [fin, 0],
      ]);
      e.brut('bras' + c, 'sy', [
        [0, 0],
        [d + P, -0.12],
        [tR, -0.12],
        [fin, 0],
      ]);
      e.avantBras(c, [
        [0, 0],
        [d + P * 0.5, -60],
        [d + P, -102],
        [tR, -100],
        [fin, 0],
      ], { ressort: { zeta: 0.7 } });
      e.main(c, [
        [0, 0],
        [d + P, -20],
        [tR, -20],
        [fin, 0],
      ]);
    });
    e.devant(['avantBrasD', 'mainD'], P * 0.4, tR + 0.3, 2);
    e.devant(['avantBrasG', 'mainG'], P * 0.4, tR + 0.3, 1);
    e.pencher('torse', p.sens, [
      [0, 0],
      [P, -2],
      [tR, -2],
      [fin, 0],
    ]);
    e.brut('torse', 'sy', [
      [0, 0],
      [P, 0.012 * e.g],
      [tR, 0.012 * e.g],
      [fin, 0],
    ]);
    e.tangage([
      [0, 0],
      [P, -0.15],
      [tR, -0.15],
      [fin, 0],
    ]);
    e.roulis(p.sens, [
      [0, 0],
      [P, 3],
      [tR, 3],
      [fin, 0],
    ]);
    const vis = (v: number): Points => [
      [0, 0],
      [P, v],
      [tR, v],
      [fin, 0],
    ];
    e.visage('sourcilFroncement', vis(0.2));
    e.visage('sourire', vis(-0.15));
    e.visage('plisser', vis(0.15));
    return e.c;
  },
};

/** Surprise (prise comique) : écrasement, détente en extension, petit saut, bras qui s'envolent, yeux exorbités. */
const surprise: Recette = {
  id: 'surprise',
  alias: ['sursaut', 'choc', 'prise'],
  couche: 'geste',
  priorite: 8,
  dureeDefaut: 1.2,
  protection: 0.25,
  masque: () => CORPS_ENTIER,
  construire(p) {
    const e = new Ecriture(p);
    const { A, P, tR, fin } = phases(p.D, p.k, 0.09, 0.08, 0.45);
    const prise: ModifRessort = { facteurF: 2, zeta: 0.4 };
    const saut: ModifRessort = { facteurF: 2, zeta: 0.75 };
    const g = e.g;
    const H = e.H;
    const t1 = A + P;
    e.racine('sy', [
      [0, 0],
      [A, -0.065 * g],
      [t1, 0.075 * g],
      [t1 + e.T(0.15), 0.015 * g],
      [tR, 0.01 * g],
      [fin, 0],
    ], { ressort: prise });
    e.racine('sx', [
      [0, 0],
      [A, 0.035 * g],
      [t1, -0.035 * g],
      [t1 + e.T(0.15), -0.006 * g],
      [tR, -0.004 * g],
      [fin, 0],
    ], { ressort: prise });
    e.racine('ty', [
      [0, 0],
      [A, 0.015 * H],
      [t1, -0.045 * H * g],
      [t1 + e.T(0.18), 0],
    ], { ressort: saut });
    const loin = -coteCible(p);
    e.pencher('torse', loin, [
      [0, 0],
      [A, -2],
      [t1, 8],
      [tR, 6],
      [fin, 0],
    ], { ressort: prise });
    e.pencher(RACINE, loin, [
      [0, 0],
      [t1, 3],
      [tR, 2.5],
      [fin, 0],
    ], { ressort: prise });
    e.tangage([
      [0, 0],
      [A, 0.3],
      [t1, -0.6],
      [tR, -0.45],
      [fin, 0],
    ], { ressort: prise });
    for (const c of COTES) {
      const bras: Points = [
        [0, 0],
        [A, -4],
        [t1 + e.T(0.04), 58],
        [tR, 50],
        [fin, 0],
      ];
      e.abduction(c, bras, { ressort: prise });
      e.avantBras(c, [
        [0, 0],
        [t1 + e.T(0.04), 38],
        [tR, 32],
        [fin, 0],
      ], { ressort: prise });
      e.main(c, [
        [0, 0],
        [t1 + e.T(0.06), 32],
        [tR, 28],
        [fin, 0],
      ], { ressort: prise });
      e.epaule(c, [
        [0, 0],
        [A, -0.01],
        [t1, 0.035],
        [tR, 0.028],
        [fin, 0],
      ], { ressort: prise });
    }
    const vite: ModifRessort = { facteurF: 2.5 };
    e.visage('plisser', [
      [0, 0],
      [A, 0.5],
      [t1, 0],
    ], { ressort: vite });
    e.visage('ecarquillement', [
      [0, 0],
      [A, 0],
      [t1, 1],
      [tR, 0.85],
      [fin, 0],
    ], { ressort: vite });
    e.visage('sourcilHauteur', [
      [0, 0],
      [A, -0.3],
      [t1, 1],
      [tR, 0.9],
      [fin, 0],
    ], { ressort: vite });
    e.visage('sourcilInclinaison', [
      [0, 0],
      [t1, -0.25],
      [tR, -0.2],
      [fin, 0],
    ]);
    e.visage('ouverture', [
      [0, 0],
      [A, 0],
      [t1, 0.6],
      [tR, 0.45],
      [fin, 0],
    ], { ressort: vite });
    e.visage('arrondi', [
      [0, 0],
      [t1, 0.55],
      [tR, 0.5],
      [fin, 0],
    ]);
    e.visage('sansClignement', [
      [0, 0],
      [A, 1],
      [tR, 1],
      [tR + 0.01, 0],
    ], { ressort: { facteurF: 5 } });
    // Pas de clignement forcé : le plissement d'anticipation en tient lieu, les yeux s'ouvrent net sur la prise.
    return e.c;
  },
};

/** Colère : buste vers l'adversaire, épaules hautes, poings, tremblement, coups de tête sur les accents. */
const colere: Recette = {
  id: 'colere',
  alias: ['enerve', 'fache'],
  couche: 'geste',
  priorite: 4,
  dureeDefaut: 1.6,
  protection: 0,
  masque: () => ({ torse: 1, tete: 0.8, brasG: 0.6, brasD: 0.6, racine: 0.5, visage: 1 }),
  construire(p) {
    const e = new Ecriture(p);
    const { A, P, tR, fin } = phases(p.D, p.k, 0.12, 0.16, 0.45);
    const sec: ModifRessort = { facteurF: 1.2, r: 0.6 };
    const dir = coteCible(p);
    const t1 = A + P;
    e.pencher('torse', dir, [
      [0, 0],
      [A, -2],
      [t1, 7],
      [tR, 6],
      [fin, 0],
    ], { ressort: sec });
    e.pencher(RACINE, dir, [
      [0, 0],
      [t1, 2.2],
      [tR, 2],
      [fin, 0],
    ], { ressort: sec });
    e.tangage([
      [0, 0],
      [A, -0.1],
      [t1, 0.35],
      [tR, 0.3],
      [fin, 0],
    ], { ressort: sec });
    e.roulis(dir, [
      [0, 0],
      [t1, 2],
      [tR, 2],
      [fin, 0],
    ]);
    for (const c of COTES) {
      e.epaule(c, [
        [0, 0],
        [t1, 0.025],
        [tR, 0.022],
        [fin, 0],
      ], { ressort: sec });
      e.abduction(c, [
        [0, 0],
        [t1, 15],
        [tR, 13],
        [fin, 0],
      ], { ressort: sec });
      e.avantBras(c, [
        [0, 0],
        [t1, -38],
        [tR, -35],
        [fin, 0],
      ], { ressort: sec });
      e.main(c, [
        [0, 0],
        [t1, -22],
        [tR, -20],
        [fin, 0],
      ]);
    }
    for (const ac of p.accents) {
      if (ac.t < t1 || ac.t > tR) continue;
      e.tangage([
        [ac.t - 0.08, 0],
        [ac.t - 0.04, 0.3 * ac.force],
        [ac.t + 0.1, 0],
      ], { zone: 'parole', ressort: { facteurF: 1.5 } });
    }
    const s = p.graine;
    const H = e.H;
    e.direct(0, p.D, (tl, aj) => {
      const env = smoothstep(A, t1 + 0.1, tl) * (1 - smoothstep(tR, tR + 0.3, tl));
      if (env === 0) return;
      const a = env * e.g;
      aj('torse', 'r', 1.3 * DEG * a * bruit(tl * 10.5, s + 31));
      aj('tete', 'r', 1.1 * DEG * a * bruit(tl * 9, s + 32));
      aj('brasG', 'r', 1.6 * DEG * a * bruit(tl * 11, s + 33));
      aj('brasD', 'r', 1.6 * DEG * a * bruit(tl * 11.5, s + 34));
      deplacerBassinDirect(e.m, aj, 0.002 * H * a * bruit(tl * 11, s + 35));
    });
    const vis = (v: number): Points => [
      [0, 0],
      [A, 0],
      [t1, v],
      [tR, v],
      [fin, 0],
    ];
    e.visage('sourcilFroncement', vis(1));
    e.visage('sourcilInclinaison', vis(1));
    e.visage('sourcilHauteur', vis(-0.45));
    e.visage('sourire', vis(-0.6));
    e.visage('dents', vis(0.6));
    e.visage('largeur', vis(0.3));
    e.visage('plisser', vis(0.3));
    if (p.cible) e.c.regard = { debut: 0, fin: tR, x: p.cible.camera ? 0 : p.cible.dx * 0.85, y: p.cible.camera ? 0 : p.cible.dy * 0.85 };
    return e.c;
  },
};

/** Gêne : épaules rentrées, tête basse et penchée, main à la nuque qui gratte, regard fuyant, sourire crispé. */
const gene: Recette = {
  id: 'gene',
  alias: ['embarras', 'embarrasse', 'genee'],
  couche: 'geste',
  priorite: 4,
  dureeDefaut: 2,
  protection: 0,
  masque: (p) => {
    const c = coteParametre(p) ?? (coteVers(p.m, -coteCible(p)) as Cote);
    return { ['bras' + c]: 1, ['bras' + autre(c)]: 0.5, tete: 0.8, torse: 0.6, visage: 1, regard: 1 } as Partial<Record<Zone, number>>;
  },
  construire(p) {
    const e = new Ecriture(p);
    const { A, P, tR, fin } = phases(p.D, p.k, 0.15, 0.35, 0.55);
    const versCible = coteCible(p);
    const c = coteParametre(p) ?? coteVers(e.m, -versCible);
    const t1 = A + P;
    const lent: ModifRessort = { facteurF: 0.85, zeta: 0.75 };
    for (const cc of COTES) {
      e.epaule(cc, [
        [0, 0],
        [t1, 0.022],
        [tR, 0.02],
        [fin, 0],
      ], { ressort: lent });
    }
    e.brut('torse', 'sy', [
      [0, 0],
      [t1, -0.02 * e.g],
      [tR, -0.02 * e.g],
      [fin, 0],
    ]);
    e.tangage([
      [0, 0],
      [t1, 0.45],
      [tR, 0.4],
      [fin, 0],
    ], { ressort: lent });
    e.roulis(-versCible, [
      [0, 0],
      [t1, 8],
      [tR, 7],
      [fin, 0],
    ], { ressort: lent });
    e.abduction(c, [
      [0, 0],
      [A + P * 0.6, 70],
      [t1, 112],
      [tR, 110],
      [fin, 0],
    ]);
    e.avantBras(c, [
      [0, 0],
      [A + P * 0.5, -40],
      [t1, -138],
      [tR, -135],
      [fin, 0],
    ]);
    e.main(c, [
      [0, 0],
      [t1, -25],
      [tR, -25],
      [fin, 0],
    ]);
    e.abduction(autre(c), [
      [0, 0],
      [t1, -5],
      [tR, -5],
      [fin, 0],
    ]);
    e.devant(['avantBras' + c, 'main' + c], A, tR + 0.2);
    const signeGratte = -signeAbduction(e.m, 'avantBras' + c, c);
    const H = e.H;
    e.direct(0, p.D, (tl, aj) => {
      const env = smoothstep(t1, t1 + 0.2, tl) * (1 - smoothstep(tR - 0.25, tR, tl));
      if (env > 0) aj('avantBras' + c, 'r', signeGratte * 5 * DEG * env * Math.sin(2 * Math.PI * 4.5 * (tl - t1)));
      const envP = smoothstep(A, t1, tl) * (1 - smoothstep(tR, fin, tl));
      if (envP > 0) deplacerBassinDirect(e.m, aj, 0.008 * H * envP * e.g * Math.sin((2 * Math.PI * (tl - A)) / 1.6));
    });
    const vis = (v: number): Points => [
      [0, 0],
      [t1, v],
      [tR, v],
      [fin, 0],
    ];
    e.visage('sourire', vis(0.3));
    e.visage('largeur', vis(0.35));
    e.visage('sourcilInclinaison', vis(-0.5));
    e.visage('sourcilHauteur', vis(0.15));
    e.visage('plisser', vis(0.15));
    e.c.regard = { debut: A, fin: tR, x: -versCible * 0.55, y: 0.45 };
    e.c.saccades.push(A, tR);
    return e.c;
  },
};

/** Construit le rire (inspiration, tête en arrière puis pliée, mains au ventre, secousses rythmées ~4,7 Hz). */
function construireRire(e: Ecriture, p: ParamsRecette): { A: number; tR: number; fin: number } {
  const { A, tR, fin } = phases(p.D, p.k, 0.2, 0.3, 0.5);
  const milieu = A + (tR - A) * 0.5;
  // « Mains au ventre » est une CIBLE, pas une amplitude : le gain d'exagération ne doit pas replier l'avant-bras
  // au-delà de la cible.
  // Pli total (pli × gain) ≤ 78° : au-delà, sur un dessin unique, la main remonte vers le visage et le coude se
  // replie en boucle (avant-bras « doublé »).
  const pli = Math.min(78, 78 / Math.max(1e-6, e.g));
  for (const c of COTES) {
    e.epaule(c, [
      [0, 0],
      [A, 0.02],
      [A + 0.15, 0.008],
      [tR, 0.006],
      [fin, 0],
    ]);
    e.abduction(c, [
      [0, 0],
      [A + 0.25, -8],
      [tR, -8],
      [fin, 0],
    ]);
    e.avantBras(c, [
      [0, 0],
      [A + 0.25, -pli],
      [tR, -pli * 0.97],
      [fin, 0],
    ]);
    e.main(c, [
      [0, 0],
      [A + 0.25, -15],
      [tR, -15],
      [fin, 0],
    ]);
  }
  e.devant(['avantBrasG', 'mainG', 'avantBrasD', 'mainD'], A, tR + 0.2);
  e.tangage([
    [0, 0],
    [A, -0.2],
    [A + 0.1, -0.5],
    [milieu, -0.45],
    [A + (tR - A) * 0.65, 0.25],
    [tR, 0.2],
    [fin, 0],
  ]);
  e.brut('torse', 'sy', [
    [0, 0],
    [A, 0.02 * e.g],
    [A + 0.3, -0.01 * e.g],
    [A + (tR - A) * 0.6, -0.035 * e.g],
    [tR, -0.03 * e.g],
    [fin, 0],
  ]);
  const f = 4.7 * p.k;
  const H = e.H;
  e.direct(0, p.D, (tl, aj) => {
    const env = smoothstep(A, A + 0.12, tl) * (0.45 + 0.55 * Math.exp(-Math.max(0, tl - A) / 1.3)) * (1 - smoothstep(tR - 0.1, tR + 0.25, tl));
    if (env === 0) return;
    const a = env * e.g;
    const ph = 2 * Math.PI * f * (tl - A);
    const b = Math.sin(ph);
    for (const c of COTES) {
      const os = aOs(e.m, 'epaule' + c) ? 'epaule' + c : 'bras' + c;
      aj(os, 'ty', -0.013 * H * a * b);
    }
    aj(RACINE, 'ty', 0.008 * H * a * b);
    aj('tete', 'r', 3.5 * DEG * a * Math.sin(ph - 0.6));
    aj('torse', 'sy', 0.018 * a * b);
    aj(VISAGE, 'ouverture', 0.22 * env * (0.5 + 0.5 * b));
  });
  const vis = (v: number): Points => [
    [0, 0],
    [A, v * 0.4],
    [A + 0.15, v],
    [tR, v * 0.9],
    [fin, 0],
  ];
  e.visage('sourire', vis(1));
  e.visage('largeur', vis(0.6));
  e.visage('ouverture', vis(0.5));
  e.visage('dents', vis(0.6));
  e.visage('plisser', vis(0.65));
  e.visage('sourcilHauteur', vis(0.3));
  e.visage('sourcilInclinaison', vis(-0.35));
  return { A, tR, fin };
}

/** Rire : secousses rythmées, tête en arrière puis pliée en avant, mains au ventre. */
const rire: Recette = {
  id: 'rire',
  alias: ['eclatDeRire', 'rigoler'],
  couche: 'geste',
  priorite: 6,
  dureeDefaut: 2.2,
  protection: 0,
  masque: () => ({ brasG: 1, brasD: 1, torse: 1, tete: 1, visage: 1, racine: 0.4 }),
  construire(p) {
    const e = new Ecriture(p);
    construireRire(e, p);
    return e.c;
  },
};

/**
 * Flexion des genoux d'angle `alpha` (rad) : cuisses vers l'extérieur (de face) ou l'avant (de profil), jambes
 * repliées, pieds gardés à plat, racine abaissée de `(L1 + L2)(1 − cos α)` pour garder les pieds au sol.
 */
function flechirJambes(e: Ecriture, alphaPts: Points, sens: 1 | -1): void {
  const m = e.m;
  const L1 = longueurOs(m, 'cuisseG', 0.2);
  const L2 = longueurOs(m, 'jambeG', 0.18);
  // Même ressort, sans retard de chaîne, pour la racine et les jambes : les pieds restent au sol.
  const lie = LIE;
  for (const c of COTES) {
    const dir = m.orientation === 0 ? m.cote[c] : sens;
    const sC = signeVers(m, 'cuisse' + c, dir, 0, dir);
    const sJ = signeVers(m, 'jambe' + c, dir, 0, dir);
    e.brut('cuisse' + c, 'r', alphaPts.map(([t, a]) => [t, sC * a] as const), lie);
    e.brut('jambe' + c, 'r', alphaPts.map(([t, a]) => [t, -2 * sJ * a] as const), lie);
    e.brut('pied' + c, 'r', alphaPts.map(([t, a]) => [t, sJ * a] as const), lie);
  }
  // La descente (1 − cos α) n'est pas linéaire en α : courbe échantillonnée finement entre les clés.
  e.racine('ty', affiner(alphaPts, (a) => (L1 + L2) * (1 - Math.cos(a))), lie);
}

/** Rire avec flexion : le rire, plus les genoux qui plient et le buste qui se plie. */
const rireFlexion: Recette = {
  id: 'rireFlexion',
  alias: ['rirePlie', 'mortDeRire'],
  couche: 'geste',
  priorite: 7,
  dureeDefaut: 2.6,
  protection: 0,
  masque: () => ({ ...CORPS_ENTIER, jambes: 1 }),
  construire(p) {
    const e = new Ecriture(p);
    const { A, tR, fin } = construireRire(e, p);
    const alpha = Math.min(38, 26 * e.g) * DEG;
    flechirJambes(e, [
      [0, 0],
      [A + 0.3, alpha * 0.4],
      [A + (tR - A) * 0.55, alpha],
      [tR, alpha * 0.9],
      [fin, 0],
    ], p.sens);
    e.pencher('torse', p.sens, [
      [0, 0],
      [A + (tR - A) * 0.5, 0],
      [A + (tR - A) * 0.65, 8],
      [tR, 7],
      [fin, 0],
    ]);
    return e.c;
  },
};

/** Recul : penché vers la menace, puis buste et tête qui partent en arrière, pas de recul, mains en défense. */
const recul: Recette = {
  id: 'recul',
  alias: ['reculer', 'sursautArriere'],
  couche: 'geste',
  priorite: 7,
  dureeDefaut: 1.2,
  protection: 0.22,
  masque: () => ({ ...CORPS_ENTIER, jambes: 0.3 }),
  construire(p) {
    const e = new Ecriture(p);
    const { A, P, tR, fin } = phases(p.D, p.k, 0.08, 0.14, 0.5);
    const t1 = A + P;
    const vif: ModifRessort = { facteurF: 1.5, zeta: 0.45 };
    const dir = coteCible(p);
    const H = e.H;
    e.pencher('torse', dir, [
      [0, 0],
      [A, 3],
      [t1, -12],
      [tR, -10],
      [fin, 0],
    ], { ressort: vif });
    e.pencher('tete', dir, [
      [0, 0],
      [t1 + 0.06, -8],
      [tR, -7],
      [fin, 0],
    ], { ressort: vif });
    e.tangage([
      [0, 0],
      [t1, -0.2],
      [tR, -0.15],
      [fin, 0],
    ]);
    e.pencher(RACINE, dir, [
      [0, 0],
      [t1, -4],
      [tR, -3.5],
      [fin, 0],
    ], { ressort: vif });
    deplacerBassin(e, [
      [0, 0],
      [A, 0.006 * H * dir],
      [t1 + 0.1, -0.035 * H * dir * e.g],
      [tR, -0.035 * H * dir * e.g],
      [fin, 0],
    ], { f: 2.6 * p.k, zeta: 0.5 });
    e.racine('sy', [
      [0, 0],
      [A, -0.03 * e.g],
      [t1, 0.03 * e.g],
      [t1 + 0.2, 0],
    ], { ressort: vif });
    for (const c of COTES) {
      e.abduction(c, [
        [0, 0],
        [t1, 18],
        [tR, 16],
        [fin, 0],
      ], { ressort: vif });
      e.avantBras(c, [
        [0, 0],
        [t1, -115],
        [tR, -110],
        [fin, 0],
      ], { ressort: vif });
      e.main(c, [
        [0, 0],
        [t1, 30],
        [tR, 25],
        [fin, 0],
      ]);
    }
    e.devant(['avantBrasG', 'mainG', 'avantBrasD', 'mainD'], A, tR + 0.2);
    const vis = (v: number): Points => [
      [0, 0],
      [A, 0],
      [t1, v],
      [tR, v * 0.9],
      [fin, 0],
    ];
    e.visage('ecarquillement', vis(0.6));
    e.visage('sourcilHauteur', vis(0.6));
    e.visage('sourcilInclinaison', vis(-0.6));
    e.visage('ouverture', vis(0.25));
    e.visage('largeur', vis(0.4));
    e.visage('dents', vis(0.3));
    return e.c;
  },
};

/** Flexion (se pencher) : contrepoids, genoux qui plient, buste et tête qui plongent, retour. */
const flexion: Recette = {
  id: 'flexion',
  alias: ['sePencher', 'plier', 'accroupir'],
  couche: 'base',
  priorite: 4,
  dureeDefaut: 1.6,
  protection: 0,
  masque: () => ({ jambes: 1, racine: 1, torse: 1, tete: 0.6, brasG: 0.4, brasD: 0.4 }),
  construire(p) {
    const e = new Ecriture(p);
    const { A, P, tR, fin } = phases(p.D, p.k, 0.12, 0.45, 0.6);
    const t1 = A + P;
    // α ≤ 38° : jambe repliée de 2α et pied de α, dans les limites du genou (≈ 92°) et de la cheville (40°).
    const alpha = Math.min(38, 32 * e.g) * DEG;
    flechirJambes(e, [
      [0, 0],
      [A, -0.08 * alpha],
      [t1, alpha],
      [tR, alpha],
      [fin, 0],
    ], p.sens);
    if (e.m.orientation === 0) {
      e.brut('torse', 'sy', [
        [0, 0],
        [t1, -0.06 * e.g],
        [tR, -0.06 * e.g],
        [fin, 0],
      ]);
      e.pencher('torse', p.sens, [
        [0, 0],
        [A, -2],
        [t1, 6],
        [tR, 6],
        [fin, 0],
      ]);
    } else {
      e.pencher('torse', p.sens, [
        [0, 0],
        [A, -2],
        [t1, 35],
        [tR, 35],
        [fin, 0],
      ]);
    }
    e.tangage([
      [0, 0],
      [t1, 0.4],
      [tR, 0.4],
      [fin, 0],
    ]);
    for (const c of COTES) {
      e.abduction(c, [
        [0, 0],
        [t1, 5],
        [tR, 5],
        [fin, 0],
      ]);
      e.avantBras(c, [
        [0, 0],
        [t1, -15],
        [tR, -15],
        [fin, 0],
      ]);
    }
    return e.c;
  },
};

/** Géométrie d'une marche du plan (`marcher` avec `vers`). */
interface GeometrieMarche {
  longueur: number;
  /** Distance parcourue au début de la marche (monde). */
  d0: number;
  /** Longueur d'un cycle (deux pas), ajustée pour finir à mi-pas (monde). */
  cycle: number;
  /** px image par unité monde. */
  pxParMonde: number;
  /** Sens de marche dans le repère du dessin. */
  dir: 1 | -1;
  /** Part latérale du déplacement (1 = de côté, 0 = vers la caméra). */
  lateral: number;
}

function geometrieMarche(p: ParamsRecette): GeometrieMarche | null {
  const cc = p.cc;
  const vers = p.params.vers as PointDecor | undefined;
  if (!vers || typeof vers !== 'object') return null;
  const marches = marchesDansPlan(cc.projet, cc.plan, cc.declaration.id);
  if (!marches.includes(p.action)) return null;
  const depart = positionAuSol(cc.projet, cc.plan, cc.placement, p.debut, cc.sol, cc.aspect);
  const du = vers.u - depart.u;
  const dv = vers.v - depart.v;
  const longueur = Math.hypot(du * cc.aspect, dv);
  if (longueur < 1e-6) return null;
  const hm = hauteurMonde(cc, cc.declaration.tailleM, depart.v);
  // Pas nominal ≈ 0,62 × la taille ; nombre de demi-cycles arrondi au-dessus (pas jamais plus longs que le
  // nominal), au moins deux pas.
  const nominal = 0.62 * hm;
  const n = Math.max(2, Math.ceil(longueur / (nominal / 2) - 1e-9));
  const miroir = miroirA(cc, p.debut + 1e-3) ? -1 : 1;
  const dirW = du >= 0 ? 1 : -1;
  return {
    longueur,
    d0: depart.distance,
    cycle: (2 * longueur) / n,
    pxParMonde: p.m.H / hm,
    dir: (dirW * miroir) as 1 | -1,
    lateral: Math.abs(du * cc.aspect) / longueur,
  };
}

/** Extrémité d'un os au repos (px image), ou `null`. */
function extremite(m: Morphologie, nom: string): { x: number; y: number } | null {
  const o = m.os.get(nom);
  if (!o) return null;
  return { x: o.pivot.x + Math.cos(o.angle) * o.longueur, y: o.pivot.y + Math.sin(o.angle) * o.longueur };
}

/** Résout une jambe à deux os : angles absolus de la cuisse et de la jambe pour atteindre `T` (depuis la hanche). */
function ikJambe(T: { x: number; y: number }, L1: number, L2: number, pli: number): { a1: number; a2: number } {
  const d = Math.max(1e-6, Math.hypot(T.x, T.y));
  const dd = Math.min(d, (L1 + L2) * 0.9999);
  const phi = Math.atan2(T.y, T.x);
  const cosA = borner((L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd), -1, 1);
  const alpha = Math.acos(cosA);
  const a1 = phi - pli * alpha;
  const kx = L1 * Math.cos(a1);
  const ky = L1 * Math.sin(a1);
  const tx = (T.x * dd) / d;
  const ty = (T.y * dd) / d;
  return { a1, a2: Math.atan2(ty - ky, tx - kx) };
}

/**
 * Marcher : cycle de deux pas calé sur la **distance** parcourue (aucun glissement d'appui), jambes résolues par
 * IK (pied d'appui fixe au sol, pied libre levé en arc d'Hermite), bassin qui descend aux contacts, bras en
 * opposition avec retard de l'avant-bras, buste penché dans le sens de la marche, arrêt avec dépassement du buste.
 */
const marcher: Recette = {
  id: 'marcher',
  alias: ['marche', 'avancer'],
  couche: 'base',
  priorite: 2,
  dureeDefaut: DUREE_MARCHE_DEFAUT,
  protection: 0,
  masque: () => ({ jambes: 1, racine: 1, torse: 0.5, brasG: 0.6, brasD: 0.6 }),
  construire(p) {
    const e = new Ecriture(p);
    const geo = geometrieMarche(p);
    if (!geo) return e.c;
    const m = e.m;
    const cc = p.cc;
    const D = p.D;
    const H = m.H;
    const g = Math.min(1.4, e.g);
    const jambes = COTES.map((c) => {
      const hanche = pivotOs(m, 'cuisse' + c, { x: m.cote[c] * 0.04, y: -0.45 });
      const genou = aOs(m, 'jambe' + c) ? pivotOs(m, 'jambe' + c, { x: 0, y: 0 }) : extremite(m, 'cuisse' + c) ?? pivotOs(m, '', { x: m.cote[c] * 0.05, y: -0.25 });
      const cheville = aOs(m, 'pied' + c) ? pivotOs(m, 'pied' + c, { x: 0, y: 0 }) : extremite(m, 'jambe' + c) ?? pivotOs(m, '', { x: m.cote[c] * 0.06, y: -0.06 });
      const L1 = Math.hypot(genou.x - hanche.x, genou.y - hanche.y) || longueurOs(m, 'cuisse' + c, 0.2);
      const L2 = Math.hypot(cheville.x - genou.x, cheville.y - genou.y) || longueurOs(m, 'jambe' + c, 0.18);
      const V0 = { x: cheville.x - hanche.x, y: cheville.y - hanche.y };
      const n0 = Math.hypot(V0.x, V0.y);
      const rho = Math.min(n0, 0.998 * (L1 + L2));
      // De face, le genou ne plie que vers l'extérieur (limites des rigs) ; de profil, vers l'avant.
      const pli = m.orientation !== 0 && geo.lateral >= 0.3 ? geo.dir : m.cote[c];
      // Même bornage qu'en marche : au repos, la jambe résolue doit redonner exactement la pose de repos.
      const k0 = n0 > rho ? rho / n0 : 1;
      const repos = ikJambe({ x: V0.x * k0, y: V0.y * k0 }, L1, L2, pli);
      return { c, L1, L2, V0, rho, pli, repos, decalage: c === 'G' ? 0 : 0.5 };
    });
    const pas = geo.cycle * geo.pxParMonde;
    const hLift = 0.055 * H * g;
    const cible = (q: number, poidsLevee: number): { X: number; lift: number } => {
      if (q < 0.5) return { X: (0.25 - q) * pas * geo.dir * geo.lateral, lift: 0 };
      const u = (q - 0.5) / 0.5;
      return {
        X: hermite(-0.25, -0.5, 0.25, -0.5, u) * pas * geo.dir * geo.lateral,
        lift: hLift * Math.sin(Math.PI * u) ** 2 * poidsLevee,
      };
    };
    const descenteRequise = (j: (typeof jambes)[number], X: number, lift: number): number => {
      const x = j.V0.x + X;
      const r2 = j.rho * j.rho - x * x;
      return j.V0.y - lift - Math.sqrt(Math.max(0, r2));
    };
    const reposDescente = jambes.map((j) => descenteRequise(j, 0, 0));
    const sBras = (c: Cote): number => signeVers(m, 'bras' + c, geo.dir, 0, geo.dir);
    const sAv = (c: Cote): number => signeVers(m, 'avantBras' + c, geo.dir, 0, geo.dir);
    e.direct(0, D + 1e-3, (tl, aj) => {
      if (tl < 0 || tl > D) return;
      const pos = positionAuSol(cc.projet, cc.plan, cc.placement, p.debut + tl, cc.sol, cc.aspect);
      const dRel = borner(pos.distance - geo.d0, 0, geo.longueur);
      const ph = 0.25 + dRel / geo.cycle;
      const wL = smoothstep(0, 0.3, tl) * (1 - smoothstep(D - 0.3, D, tl));
      const wA = smoothstep(0, 0.4, tl) * (1 - smoothstep(D - 0.45, D, tl));
      const etats = jambes.map((j) => {
        const q = (((ph + j.decalage) % 1) + 1) % 1;
        return { j, q, ...cible(q, wL) };
      });
      let dy = 0;
      etats.forEach((s, i) => {
        dy = Math.max(dy, descenteRequise(s.j, s.X, s.lift) - reposDescente[i]!);
      });
      dy = Math.max(0, dy);
      aj(RACINE, 'ty', dy);
      for (const s of etats) {
        const { j } = s;
        const T = { x: j.V0.x + s.X, y: j.V0.y - dy - s.lift };
        const nT = Math.hypot(T.x, T.y);
        const k = nT > j.rho ? j.rho / nT : 1;
        const ik = ikJambe({ x: T.x * k, y: T.y * k }, j.L1, j.L2, j.pli);
        const r1 = ecartAngle(j.repos.a1, ik.a1);
        const r2 = ecartAngle(j.repos.a2, ik.a2) - r1;
        aj('cuisse' + j.c, 'r', r1);
        aj('jambe' + j.c, 'r', r2);
        aj('pied' + j.c, 'r', -(r1 + r2));
      }
      // Bras en opposition : le bras G recule quand la jambe G avance.
      for (const s of etats) {
        const c = s.j.c;
        const avance = Math.cos(2 * Math.PI * s.q);
        const ampl = 16 * DEG * g * wA * (0.4 + 0.6 * geo.lateral);
        aj('bras' + c, 'r', -sBras(c) * avance * ampl);
        aj('avantBras' + c, 'r', -sAv(c) * Math.cos(2 * Math.PI * s.q - 0.6) * ampl * 0.55 + sAv(c) * 8 * DEG * wA);
      }
      aj('torse', 'r', signeVers(m, 'torse', geo.dir, 0, geo.dir) * 3 * DEG * wA * geo.lateral * g);
      aj('torse', 'sy', -0.008 * wA * Math.cos(4 * Math.PI * ph));
      aj('tete', 'ty', -0.25 * dy);
      aj('tete', 'r', -0.6 * DEG * wA * Math.sin(4 * Math.PI * ph));
      aj('ventre', 'sy', 0.012 * wA * Math.sin(4 * Math.PI * ph - 0.9));
      if (geo.lateral < 0.7) aj(RACINE, 'tx', 0.01 * H * wA * (1 - geo.lateral) * Math.sin(2 * Math.PI * ph)); // balancement de face (pieds en l'air à tour de rôle)
    });
    // Arrêt : le buste continue sur sa lancée, dépasse, revient (ressort peu amorti).
    const arret: ModifRessort = { zeta: 0.45 };
    e.pencher('torse', geo.dir, [
      [D - 0.15, 0],
      [D, 3.5 * geo.lateral],
      [D + 0.25, -1.2 * geo.lateral],
      [D + 0.5, 0],
    ], { ressort: arret });
    e.racine('ty', [
      [D - 0.1, 0],
      [D + 0.05, 0.008 * H],
      [D + 0.3, 0],
    ], { ressort: arret });
    return e.c;
  },
};

/** S'arrêter : le buste continue sur sa lancée (4°), dépasse, revient ; petit tassement ; bras qui balancent. */
const sArreter: Recette = {
  id: 'sArreter',
  alias: ['arreter', 'stop'],
  couche: 'base',
  priorite: 2,
  dureeDefaut: 0.8,
  protection: 0,
  masque: () => ({ torse: 0.6, racine: 0.6 }),
  construire(p) {
    const e = new Ecriture(p);
    const d = p.D / 0.8;
    const arret: ModifRessort = { zeta: 0.45 };
    e.pencher('torse', p.sens, [
      [0, 0],
      [0.12 * d, 4],
      [0.35 * d, -1.5],
      [0.6 * d, 0],
    ], { ressort: arret });
    e.racine('ty', [
      [0, 0],
      [0.1 * d, 0.01 * e.H],
      [0.35 * d, 0],
    ], { ressort: arret });
    for (const c of COTES) {
      e.rot('bras' + c, signeVers(e.m, 'bras' + c, p.sens, 0, p.sens), [
        [0, 0],
        [0.15 * d, 6],
        [0.4 * d, -2],
        [0.65 * d, 0],
      ], { ressort: arret });
    }
    return e.c;
  },
};

/**
 * Se tourner : la tête part d'abord, puis le corps s'écrase en largeur (≈ 12 % au milieu, instant du miroir),
 * s'étire en hauteur, petit saut, puis léger dépassement en largeur. Le miroir (`flip`) bascule au milieu, comme
 * le décide `timeline/trajets.orientationA` : l'écrasement le cache.
 */
const seTourner: Recette = {
  id: 'seTourner',
  alias: ['tourner', 'demiTour', 'retourner'],
  couche: 'base',
  priorite: 3,
  dureeDefaut: DUREE_DEMI_TOUR_DEFAUT,
  protection: 0,
  masque: () => ({ racine: 1, torse: 0.5, tete: 0.5 }),
  construire(p) {
    const e = new Ecriture(p);
    const D = p.D;
    const H = e.H;
    const g = Math.min(1.3, e.g);
    const bosse = (u: number): number => (u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u) ** 1.5);
    e.direct(0, D + 0.7, (tl, aj) => {
      const u = tl / D;
      if (u > 0 && u < 1) {
        const b = bosse(u);
        aj(RACINE, 'sx', -0.88 * b);
        aj(RACINE, 'sy', 0.05 * g * b);
        aj(RACINE, 'ty', -0.012 * H * g * b);
      } else if (u >= 1) {
        const tau = tl - D;
        aj(RACINE, 'sx', 0.045 * g * (0.5 - 0.5 * Math.cos((2 * Math.PI * tau) / 0.5)) * Math.exp(-tau / 0.25));
      }
    });
    const nouveau = -p.sens;
    e.pencher(RACINE, p.sens, [
      [0, 0],
      [D * 0.2, -2],
      [D * 0.5, 0],
    ]);
    e.lacet([
      [0, 0],
      [D * 0.3, 0.6 * nouveau],
      [D * 0.55, 0],
    ], { ressort: { facteurF: 1.5 } });
    e.c.clignements.push(D * 0.1);
    e.c.saccades.push(D * 0.5);
    return e.c;
  },
};

/** Gestes de parole : unités gestuelles, battements de main calés sur les syllabes accentuées, hochements. */
const parler: Recette = {
  id: 'parler',
  alias: ['parlerGestes', 'gestesParole', 'battements'],
  couche: 'geste',
  priorite: 3,
  dureeDefaut: 2,
  protection: 0,
  // Sans parole pendant l'action, aucun battement : le geste ne réclame alors aucune zone.
  masque: (p) => (p.accents.length > 0 || p.parole.length > 0 ? { brasG: 1, brasD: 1 } : {}),
  construire(p) {
    const e = new Ecriture(p);
    const g = p.implicite ? 0.65 : 1;
    const accents = [...p.accents].filter((a) => a.t >= -0.05 && a.t <= p.D).sort((a, b) => a.t - b.t);
    if (accents.length === 0 && p.parole.length > 0) {
      const [a, b] = p.parole[0]!;
      accents.push({ t: (a + b) / 2, force: 0.6 });
    }
    // Unités gestuelles : pas de retour au repos entre deux accents à moins de 1,2 s.
    const unites: Array<Array<{ t: number; force: number }>> = [];
    for (const a of accents) {
      const u = unites[unites.length - 1];
      if (u && a.t - u[u.length - 1]!.t < 1.2) u.push(a);
      else unites.push([a]);
    }
    const versCible = coteCible(p);
    unites.forEach((u, iu) => {
      const c: Cote = iu % 2 === 0 ? coteVers(e.m, versCible) : coteVers(e.m, -versCible);
      const debut = Math.max(-0.1, u[0]!.t - 0.35);
      const fin = u[u.length - 1]!.t + 0.45;
      const fin2 = fin + 0.45;
      const k = g * (0.8 + 0.2 * h(p, 40, iu));
      e.abduction(c, [
        [debut, 0],
        [debut + 0.25, 10 * k],
        [fin, 10 * k],
        [fin2, 0],
      ]);
      e.avantBras(c, [
        [debut, 0],
        [debut + 0.25, -55 * k],
        [fin, -52 * k],
        [fin2, 0],
      ]);
      e.main(c, [
        [debut, 0],
        [debut + 0.25, 15 * k],
        [fin, 15 * k],
        [fin2, 0],
      ]);
      for (const a of u) {
        const apex = a.t - 0.03;
        e.avantBras(c, [
          [apex - 0.15, 0],
          [apex, 20 * a.force * k],
          [apex + 0.15, 0],
        ], { ressort: { facteurF: 1.4, zeta: 0.45 }, retard: 0 });
        if (a.force >= 1) {
          e.avantBras(autre(c), [
            [apex - 0.15, 0],
            [apex, -14 * k],
            [apex + 0.2, 0],
          ], { ressort: { facteurF: 1.2 }, retard: 0 });
        }
        e.tangage([
          [a.t - 0.12, 0],
          [a.t - 0.06, 0.3 * a.force * (p.implicite ? 0.8 : 1)],
          [a.t + 0.12, 0],
        ], { zone: 'parole', ressort: { facteurF: 1.3 }, retard: 0 });
      }
      const derive = (h(p, 41, iu) - 0.5) * 6;
      e.roulis(1, [
        [debut, 0],
        [debut + 0.4, derive],
        [fin, derive],
        [fin2, 0],
      ], { zone: 'parole' });
    });
    // Inspiration avant chaque phrase, expiration lente pendant.
    for (const [a, b] of p.parole) {
      for (const c of COTES) {
        e.epaule(c, [
          [a - 0.4, 0],
          [a - 0.08, 0.012],
          [b, 0.002],
          [b + 0.3, 0],
        ], { zone: 'parole' });
      }
      e.brut('torse', 'sy', [
        [a - 0.4, 0],
        [a - 0.08, 0.018],
        [b, 0.003],
        [b + 0.3, 0],
      ], { zone: 'parole' });
    }
    return e.c;
  },
};

/**
 * S'asseoir (sans siège modélisé) : regard vers le bas, descente du bassin (de face : cuisses raccourcies en
 * perspective ; de profil : cuisses à l'horizontale), buste qui compense, tassement, tenue, puis relevé.
 */
const sAsseoir: Recette = {
  id: 'sAsseoir',
  alias: ['asseoir', 'assis'],
  couche: 'base',
  priorite: 5,
  dureeDefaut: 2.5,
  protection: 0.5,
  masque: () => ({ jambes: 1, racine: 1, torse: 0.8, tete: 0.4, brasG: 0.4, brasD: 0.4 }),
  construire(p) {
    const e = new Ecriture(p);
    const { A, P, tR, fin } = phases(p.D, p.k, 0.25, 0.8, 0.9);
    const t1 = A + P;
    const m = e.m;
    const L1 = longueurOs(m, 'cuisseG', 0.2);
    // Jambes et racine en signal direct exactement couplé : les pieds ne quittent pas le sol, même en transition.
    // Profil de descente C² (smootherstep), tenue, remontée ; le rebond vient du tassement à ressort plus bas.
    const s = (tl: number): number => smootherstep(A, t1, tl) * (1 - smootherstep(tR, fin, tl));
    if (m.orientation === 0) {
      // De face : cuisses raccourcies en perspective (la jambe, enfant de la cuisse, est compensée).
      const k = 0.72;
      e.direct(0, p.D, (tl, aj) => {
        const v = s(tl);
        if (v === 0) return;
        for (const c of COTES) {
          aj('cuisse' + c, 'sy', -k * v, 'jambes');
          aj('jambe' + c, 'sy', 1 / (1 - k * v) - 1, 'jambes');
        }
        aj(RACINE, 'ty', k * L1 * v, 'jambes');
      });
      e.brut('torse', 'sy', [
        [0, 0],
        [A + P * 0.5, -0.05],
        [t1, 0],
        [tR, -0.05],
        [tR + 0.3, 0],
      ]);
    } else {
      // De profil : cuisses à l'horizontale, jambes verticales.
      const a = 85 * DEG;
      e.direct(0, p.D, (tl, aj) => {
        const v = s(tl);
        if (v === 0) return;
        for (const c of COTES) {
          const sg = signeVers(m, 'cuisse' + c, p.sens, 0, p.sens);
          aj('cuisse' + c, 'r', sg * a * v, 'jambes');
          aj('jambe' + c, 'r', -sg * a * v, 'jambes');
        }
        aj(RACINE, 'ty', L1 * (1 - Math.cos(a * v)), 'jambes');
      });
      e.pencher('torse', p.sens, [
        [0, 0],
        [A + P * 0.5, 25],
        [t1, 2],
        [tR, 25],
        [tR + 0.35, 0],
      ]);
    }
    e.tangage([
      [0, 0],
      [A, 0.3],
      [t1, 0],
      [fin, 0],
    ]);
    e.racine('sy', [
      [t1 - 0.05, 0],
      [t1 + 0.05, -0.03],
      [t1 + 0.3, 0],
    ], { ressort: { zeta: 0.5 } });
    for (const c of COTES) {
      e.abduction(c, [
        [0, 0],
        [t1, 6],
        [tR, 6],
        [fin, 0],
      ]);
      e.avantBras(c, [
        [0, 0],
        [t1, -30],
        [tR, -30],
        [fin, 0],
      ]);
    }
    return e.c;
  },
};

/** Se lever (sans siège modélisé) : petit fléchi d'élan, buste en avant, poussée sur la pointe, dépassement. */
const seLever: Recette = {
  id: 'seLever',
  alias: ['lever', 'debout'],
  couche: 'base',
  priorite: 5,
  dureeDefaut: 1.2,
  protection: 0.3,
  masque: () => ({ jambes: 1, racine: 1, torse: 0.8, tete: 0.4 }),
  construire(p) {
    const e = new Ecriture(p);
    const { A, P, tR, fin } = phases(p.D, p.k, 0.3, 0.45, 0.35);
    const t1 = A + P;
    flechirJambes(e, [
      [0, 0],
      [A, 14 * DEG],
      [t1, -2 * DEG],
      [tR, 0],
      [fin, 0],
    ], p.sens);
    e.pencher('torse', p.sens, [
      [0, 0],
      [A, 10],
      [t1, -3],
      [tR, 0],
    ], { ressort: { zeta: 0.5 } });
    e.racine('ty', [
      [A, 0],
      [t1, -0.012 * e.H * e.g],
      [tR, 0],
    ]);
    return e.c;
  },
};

/** Prendre / poser : regard vers l'objet, approche du bras (vitesse nulle au contact), fléchi si l'objet est bas. */
function construirePrise(p: ParamsRecette, poser: boolean): Contribution {
  const e = new Ecriture(p);
  const { A, P, tR, fin } = phases(p.D, p.k, 0.25, 0.45, 0.45);
  const t1 = A + P;
  const { cote, angle, dir } = visee(p);
  const m = e.m;
  const a1 = angleRepos(m, 'bras' + cote, Math.PI / 2);
  const a2 = angleRepos(m, 'avantBras' + cote, a1);
  const rotBras = ecartAngle(a1, angle) * 0.85;
  const rotAv = ecartAngle(a2, a1) - signeAbduction(m, 'avantBras' + cote, cote) * 15 * DEG;
  const doux: ModifRessort = { zeta: 0.85 };
  e.brut('bras' + cote, 'r', [
    [0, 0],
    [A, 0.1 * rotBras],
    [t1, rotBras],
    [tR, rotBras],
    [fin, 0],
  ], { ressort: doux });
  e.brut('avantBras' + cote, 'r', [
    [0, 0],
    [t1, rotAv],
    [tR, rotAv],
    [fin, 0],
  ], { ressort: doux });
  e.main(cote, [
    [0, 0],
    [A, poser ? -15 : 20],
    [t1, poser ? -15 : 20],
    [t1 + 0.12, poser ? 20 : -20],
    [tR, poser ? 20 : -20],
    [fin, 0],
  ]);
  const bas = p.cible && !p.cible.camera ? borner(p.cible.dy, 0, 1) : 0.5;
  if (bas > 0.3) {
    const alpha = Math.min(38, 50 * bas) * DEG;
    flechirJambes(e, [
      [0, 0],
      [A, 0],
      [t1, alpha],
      [tR, alpha],
      [fin, 0],
    ], p.sens);
    e.pencher('torse', dir, [
      [0, 0],
      [t1, 10 * bas],
      [tR, 10 * bas],
      [fin, 0],
    ]);
  }
  e.tangage([
    [0, 0],
    [A * 0.5, 0.35 + 0.3 * bas],
    [tR, 0.3],
    [fin, 0],
  ]);
  if (p.cible) e.c.regard = { debut: 0, fin: tR + 0.2, x: p.cible.camera ? 0 : p.cible.dx * 0.85, y: p.cible.camera ? 0.3 : p.cible.dy * 0.85 };
  e.c.saccades.push(0, tR + 0.2);
  return e.c;
}

const prendre: Recette = {
  id: 'prendre',
  alias: ['attraper', 'saisir'],
  couche: 'geste',
  priorite: 6,
  dureeDefaut: 1.4,
  protection: 0,
  masque: (p) => {
    const { cote } = visee(p);
    return { ['bras' + cote]: 1, torse: 0.5, tete: 0.5, jambes: 0.5 } as Partial<Record<Zone, number>>;
  },
  construire: (p) => construirePrise(p, false),
};

const poser: Recette = {
  id: 'poser',
  alias: ['deposer', 'lacher'],
  couche: 'geste',
  priorite: 6,
  dureeDefaut: 1.4,
  protection: 0,
  masque: prendre.masque,
  construire: (p) => construirePrise(p, true),
};

/** Toutes les recettes, par identifiant canonique. */
export const RECETTES: Readonly<Record<string, Recette>> = Object.freeze(
  Object.fromEntries(
    [
      respirer,
      attendre,
      regarder,
      hocher,
      hausserEpaules,
      pointer,
      mainsOuvertes,
      brasCroises,
      surprise,
      colere,
      gene,
      rire,
      rireFlexion,
      recul,
      flexion,
      marcher,
      sArreter,
      seTourner,
      parler,
      sAsseoir,
      seLever,
      prendre,
      poser,
    ].map((r) => [r.id, r]),
  ),
);

/** Clé de recherche : minuscules, sans accents, sans séparateurs. */
function cleNom(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

const INDEX_NOMS: ReadonlyMap<string, Recette> = (() => {
  const m = new Map<string, Recette>();
  for (const r of Object.values(RECETTES)) {
    m.set(cleNom(r.id), r);
    for (const a of r.alias) m.set(cleNom(a), r);
  }
  return m;
})();

/** Recette d'un identifiant d'action (catalogue, alias, `snake_case` accepté), ou `null`. */
export function recette(id: string): Recette | null {
  return INDEX_NOMS.get(cleNom(id)) ?? null;
}

/** Durée effective d'une action (s). `marcher` et `seTourner` suivent exactement `timeline/trajets`. */
export function dureeAction(a: ActionPlacee, r: Recette, tempoPerso: number): number {
  const tempo = a.tempo ?? 1;
  if (r.id === 'marcher' || r.id === 'seTourner') return (a.duree ?? r.dureeDefaut) / tempo;
  if (a.duree !== undefined) return a.duree / tempo;
  return r.dureeDefaut / (tempo * tempoPerso);
}

/** Graine d'une action (personnage × action × début). */
export function graineAction(graine: number, a: ActionPlacee, index: number): number {
  return hashChaine(`${graine}|${a.action}|${a.debut}|${index}`);
}
