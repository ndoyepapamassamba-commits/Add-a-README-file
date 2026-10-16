/**
 * Canaux d'animation : identifiants, courbes d'intention linéaires par morceaux, conversion en consignes de
 * ressort, pondération (fondus, interruptions) et assemblage de la `Pose` finale.
 *
 * Un **canal** est une grandeur scalaire additive :
 * - `os.<prop>` pour un os du rig : `r` (rotation ajoutée, rad), `tx`/`ty` (translation, px image),
 *   `sx`/`sy` (échelle − 1) ;
 * - `@racine.<prop>` pour la racine (`PoseRacine`) : `r`, `tx`/`ty` (décalage px), `sx`/`sy` (échelle − 1) ;
 * - `@visage.<indice>` pour les indications de visage données par les actions (voir `INDICES_VISAGE`).
 *
 * Une **courbe d'intention** (`CourbePL`) est linéaire par morceaux ; deux instants égaux de suite font une marche.
 * Elle sert de consigne à un ressort analytique (`noyau/ressorts`) : le ressort fabrique le dépassement, le
 * retard et le retour au calme. Tout est pur.
 */
import type { Consigne } from '../noyau/ressorts';
import { racineNeutre } from '../timeline/neutres';
import type { Pose, TransformOs } from '../timeline/types';

/** Propriétés d'un canal d'os ou de racine. */
export type Propriete = 'r' | 'tx' | 'ty' | 'sx' | 'sy';

/** Pseudo-os de la racine (`PoseRacine`). */
export const RACINE = '@racine';
/** Pseudo-os des indications de visage. */
export const VISAGE = '@visage';

/**
 * Indications de visage que les actions peuvent donner (additives, sans unité sauf mention) :
 * sourcils (hauteur −1…1, froncement 0…1, inclinaison −1…1, asymétrie = G − D), écarquillement, plisser (paupières),
 * bouche (sourire, ouverture, arrondi, largeur, dents), regard (décalage des iris), `sansClignement` (≥ 0,5 :
 * clignements suspendus, prise comique).
 */
export const INDICES_VISAGE = [
  'sourcilHauteur',
  'sourcilFroncement',
  'sourcilInclinaison',
  'sourcilAsymetrie',
  'ecarquillement',
  'plisser',
  'sourire',
  'ouverture',
  'arrondi',
  'largeur',
  'dents',
  'regardX',
  'regardY',
  'sansClignement',
] as const;

/** Nom d'une indication de visage. */
export type IndiceVisage = (typeof INDICES_VISAGE)[number];

/** Valeurs des indications de visage à un instant. */
export type IndicesVisage = Record<IndiceVisage, number>;

/** Indications nulles. */
export function indicesVisageNuls(): IndicesVisage {
  const r = {} as IndicesVisage;
  for (const k of INDICES_VISAGE) r[k] = 0;
  return r;
}

/** Identifiant de canal. */
export function idCanal(os: string, prop: string): string {
  return `${os}.${prop}`;
}

/** Découpe un identifiant de canal. */
export function decouperCanal(id: string): { os: string; prop: string } {
  const i = id.lastIndexOf('.');
  return { os: id.slice(0, i), prop: id.slice(i + 1) };
}

// ── Courbes linéaires par morceaux ───────────────────────────────────────────────────────────────────────────────

/** Courbe linéaire par morceaux : `t` croissant (égalités = marches), valeur tenue avant et après. */
export interface CourbePL {
  t: number[];
  v: number[];
}

/** Construit une courbe à partir de points `[t, v]` (triés par t, stable). Un point seul = constante. */
export function courbe(points: ReadonlyArray<readonly [number, number]>): CourbePL {
  const tries = points
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p[0] - b.p[0] || a.i - b.i)
    .map((x) => x.p);
  return { t: tries.map((p) => p[0]), v: tries.map((p) => p[1]) };
}

/** Valeur d'une courbe à l'instant `t` (à une marche, la valeur d'après). */
export function valeurPL(c: CourbePL, t: number): number {
  const n = c.t.length;
  if (n === 0) return 0;
  if (t < c.t[0]!) return c.v[0]!;
  if (t >= c.t[n - 1]!) return c.v[n - 1]!;
  // Dernier indice i tel que t_i ≤ t.
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (c.t[m]! <= t) lo = m;
    else hi = m - 1;
  }
  const i = lo;
  const t0 = c.t[i]!;
  const t1 = c.t[i + 1]!;
  if (t1 <= t0) return c.v[i + 1]!;
  return c.v[i]! + ((c.v[i + 1]! - c.v[i]!) * (t - t0)) / (t1 - t0);
}

/** Courbe transformée : `t → t·echelleT + decalageT`, `v → v·gain`. */
export function transformerPL(c: CourbePL, decalageT: number, gain = 1, echelleT = 1): CourbePL {
  return { t: c.t.map((x) => x * echelleT + decalageT), v: c.v.map((x) => x * gain) };
}

/** Variation élémentaire de consigne : marche (`rampe` = 0) ou rampe linéaire de `delta`. */
export interface Evenement {
  t: number;
  delta: number;
  rampe: number;
}

/** Variations d'une courbe (la valeur avant le premier point est supposée être `c.v[0]`, prise comme base). */
export function evenementsPL(c: CourbePL): Evenement[] {
  const r: Evenement[] = [];
  const base = c.v.length > 0 ? c.v[0]! : 0;
  if (base !== 0 && c.t.length > 0) r.push({ t: -Infinity, delta: base, rampe: 0 });
  for (let i = 0; i + 1 < c.t.length; i++) {
    const d = c.v[i + 1]! - c.v[i]!;
    if (d === 0) continue;
    const rampe = c.t[i + 1]! - c.t[i]!;
    r.push({ t: c.t[i]!, delta: d, rampe: rampe > 1e-6 ? rampe : 0 });
  }
  return r;
}

/**
 * Consignes absolues (format `noyau/ressorts`) depuis des variations : tri stable par instant, cumul.
 * Les variations « depuis toujours » (`t = −∞`) forment la valeur initiale.
 */
export function consignesDepuisEvenements(evts: readonly Evenement[]): { initiale: number; consignes: Consigne[] } {
  let initiale = 0;
  const finis = evts.filter((e) => {
    if (e.t === -Infinity) {
      initiale += e.delta;
      return false;
    }
    return true;
  });
  const tries = finis
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.t - b.e.t || a.i - b.i)
    .map((x) => x.e);
  let cumul = initiale;
  const consignes: Consigne[] = [];
  for (const e of tries) {
    cumul += e.delta;
    consignes.push(e.rampe > 0 ? { t: e.t, v: cumul, rampe: e.rampe } : { t: e.t, v: cumul });
  }
  return { initiale, consignes };
}

/**
 * Courbe pondérée `w(t)·c(t)`, échantillonnée : aux points de `c`, et tous les `pas` secondes dans les
 * intervalles où `w` varie (`transitions`). Les marches de `c` restent des marches (pondérées par `w` à cet
 * instant). Le résultat est linéaire par morceaux (erreur ≤ courbure × pas², invisible derrière un ressort).
 */
export function ponderePL(
  c: CourbePL,
  w: (t: number) => number,
  transitions: ReadonlyArray<readonly [number, number]>,
  pas = 0.03,
): CourbePL {
  const n = c.t.length;
  if (n === 0) return c;
  if (transitions.length === 0) {
    const k = w(c.t[0]!);
    return { t: [...c.t], v: c.v.map((x) => x * k) };
  }
  const instants = new Set<number>();
  for (const [a, b] of transitions) {
    if (!(b > a)) continue;
    const m = Math.max(1, Math.ceil((b - a) / pas));
    for (let i = 0; i <= m; i++) instants.add(a + ((b - a) * i) / m);
  }
  const debut = c.t[0]!;
  const fin = c.t[n - 1]!;
  const echantillons = [...instants].filter((x) => x > debut && x < fin).sort((a, b) => a - b);
  const t: number[] = [];
  const v: number[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const ti = c.t[i]!;
    while (j < echantillons.length && echantillons[j]! < ti) {
      const x = echantillons[j]!;
      t.push(x);
      v.push(valeurPL(c, x) * w(x));
      j++;
    }
    while (j < echantillons.length && echantillons[j]! === ti) j++;
    t.push(ti);
    v.push(c.v[i]! * w(ti));
  }
  // Avant le premier point et après le dernier, `c` est constante : on prolonge par les échantillons de `w`.
  const avant = [...instants].filter((x) => x < debut).sort((a, b) => a - b);
  const apres = [...instants].filter((x) => x > fin).sort((a, b) => a - b);
  const v0 = c.v[0]!;
  const vn = c.v[n - 1]!;
  const tt = [...avant, ...t, ...apres];
  const vv = [...avant.map((x) => v0 * w(x)), ...v, ...apres.map((x) => vn * w(x))];
  return { t: tt, v: vv };
}

// ── Accumulation et assemblage de la pose ────────────────────────────────────────────────────────────────────────

/** Accumulateur de canaux (valeurs additives). */
export class Accumulateur {
  readonly valeurs = new Map<string, number>();

  ajouter(os: string, prop: string, v: number): void {
    if (v === 0 || !Number.isFinite(v)) return;
    const id = idCanal(os, prop);
    this.valeurs.set(id, (this.valeurs.get(id) ?? 0) + v);
  }

  ajouterId(id: string, v: number): void {
    if (v === 0 || !Number.isFinite(v)) return;
    this.valeurs.set(id, (this.valeurs.get(id) ?? 0) + v);
  }

  lire(os: string, prop: string): number {
    return this.valeurs.get(idCanal(os, prop)) ?? 0;
  }
}

/** Bornes de sécurité de l'échelle d'un os (jamais nulle ni négative). */
const ECHELLE_MIN = 0.05;

/**
 * Assemble la pose : os du rig présents seulement (les autres canaux sont ignorés), racine, miroir, ordre de
 * dessin. Les échelles sont `1 + Σ(échelle − 1)`, bornées à ≥ 0,05.
 */
export function assemblerPose(
  acc: Accumulateur,
  osPresents: ReadonlySet<string>,
  flip: boolean,
  ordreGroupes?: Record<string, number>,
): Pose {
  const os: Record<string, TransformOs> = {};
  const parOs = new Map<string, Partial<Record<Propriete, number>>>();
  for (const [id, v] of acc.valeurs) {
    const { os: nom, prop } = decouperCanal(id);
    if (nom === VISAGE) continue;
    let e = parOs.get(nom);
    if (!e) parOs.set(nom, (e = {}));
    e[prop as Propriete] = v;
  }
  for (const [nom, e] of parOs) {
    if (nom === RACINE || !osPresents.has(nom)) continue;
    os[nom] = {
      rotation: e.r ?? 0,
      translation: { x: e.tx ?? 0, y: e.ty ?? 0 },
      echelle: { x: Math.max(ECHELLE_MIN, 1 + (e.sx ?? 0)), y: Math.max(ECHELLE_MIN, 1 + (e.sy ?? 0)) },
    };
  }
  const r = parOs.get(RACINE) ?? {};
  const racine = racineNeutre(flip);
  racine.decalage = { x: r.tx ?? 0, y: r.ty ?? 0 };
  racine.rotation = r.r ?? 0;
  racine.echelle = { x: Math.max(ECHELLE_MIN, 1 + (r.sx ?? 0)), y: Math.max(ECHELLE_MIN, 1 + (r.sy ?? 0)) };
  const pose: Pose = { os, racine };
  if (ordreGroupes && Object.keys(ordreGroupes).length > 0) pose.ordreGroupes = ordreGroupes;
  return pose;
}

/** Indications de visage lues dans l'accumulateur. */
export function lireIndicesVisage(acc: Accumulateur): IndicesVisage {
  const r = indicesVisageNuls();
  for (const k of INDICES_VISAGE) r[k] = acc.lire(VISAGE, k);
  return r;
}
