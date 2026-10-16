/**
 * Pistes à clés (nombre, Vec2, angle) : interpolation par segment (constant, linéaire, lisse = Hermite à tangentes
 * de Catmull-Rom, Hermite à vitesses imposées, Bézier de temps, courbe nommée), avec option « filtre ressort » :
 * la courbe devient la consigne d'un ressort analytique (`noyau/ressorts`), ce qui ajoute dépassement, retard et
 * retour au calme sans perdre la pureté. Avant la première clé et après la dernière, la valeur est tenue.
 */
import type { Cle, ModeInterpolation, NomEasing, ParametresRessort, Vec2 } from '../timeline/types';
import { EASINGS, courbeBezier, hermite, hermiteVitesse, pentesCatmullRom, type Easing } from './courbes';
import { ecartAngle, enroulerAngle } from './maths2d';
import { creerCanalRessort, type CanalRessort, type Consigne } from './ressorts';

/** Options d'une piste. */
export interface OptionsPiste<V> {
  /** Interpolation par défaut des segments (défaut `lisse`). */
  interpolation?: ModeInterpolation;
  /** Courbe par défaut du mode `easing` (défaut `lisse`). */
  easing?: NomEasing;
  /**
   * Filtre ressort : la courbe interpolée sert de consigne à ce ressort (marches pour `constant`, rampes pour
   * `lineaire`, 8 sous-rampes par segment pour les autres modes). La sortie part au repos sur la première valeur.
   */
  ressort?: ParametresRessort;
  /** Valeur tenue avant la première clé (défaut : valeur de la première clé). Avec ressort : état de départ. */
  valeurInitiale?: V;
  /** Pentes de Catmull-Rom bridées pour ne jamais dépasser les clés (mode `lisse`, sans ressort). */
  monotone?: boolean;
}

/** Piste évaluable à n'importe quel instant. */
export interface Piste<V> {
  /** Instant de la première et de la dernière clé (0 et 0 si vide). */
  readonly debut: number;
  readonly fin: number;
  valeur(t: number): V;
  /** Vitesse (unités/s). Exacte pour les modes polynomiaux et le ressort, différence centrée sinon. */
  vitesse(t: number): V;
}

/** Sous-rampes par segment non linéaire, pour le filtre ressort. */
const SOUS_RAMPES = 8;
/** Pas de la différence centrée (s). */
const PAS_DERIVEE = 1e-4;

interface Segment {
  mode: ModeInterpolation;
  courbe: Easing | null;
  v0: number;
  v1: number;
  /** Vitesses (unités/s) pour les Hermite. */
  p0: number;
  p1: number;
}

/** Piste scalaire de base, construite à partir de clés déjà normalisées. */
function construireScalaire(
  ts: number[],
  vs: number[],
  segments: Segment[],
  avant: number,
  ressort: ParametresRessort | undefined,
): Piste<number> {
  const n = ts.length;
  const debut = n > 0 ? ts[0]! : 0;
  const fin = n > 0 ? ts[n - 1]! : 0;

  const indiceSegment = (t: number): number => {
    let lo = 0;
    let hi = n - 2;
    let r = 0;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (ts[m]! <= t) {
        r = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    return r;
  };

  const brute = (t: number): number => {
    if (n === 0) return avant;
    if (t < ts[0]!) return avant;
    if (t >= ts[n - 1]!) return vs[n - 1]!;
    const k = indiceSegment(t);
    const s = segments[k]!;
    const h = ts[k + 1]! - ts[k]!;
    const u = h > 0 ? (t - ts[k]!) / h : 1;
    switch (s.mode) {
      case 'constant':
        return s.v0;
      case 'lineaire':
        return s.v0 + (s.v1 - s.v0) * u;
      case 'lisse':
      case 'hermite':
        return hermite(s.v0, s.p0, s.v1, s.p1, u, h);
      case 'bezier':
      case 'easing':
        return s.v0 + (s.v1 - s.v0) * s.courbe!(u);
    }
  };

  const vitesseBrute = (t: number): number => {
    if (n < 2 || t < ts[0]! || t >= ts[n - 1]!) return 0;
    const k = indiceSegment(t);
    const s = segments[k]!;
    const h = ts[k + 1]! - ts[k]!;
    const u = h > 0 ? (t - ts[k]!) / h : 1;
    switch (s.mode) {
      case 'constant':
        return 0;
      case 'lineaire':
        return h > 0 ? (s.v1 - s.v0) / h : 0;
      case 'lisse':
      case 'hermite':
        return hermiteVitesse(s.v0, s.p0, s.v1, s.p1, u, h);
      case 'bezier':
      case 'easing': {
        const a = Math.max(ts[k]!, t - PAS_DERIVEE);
        const b = Math.min(ts[k + 1]!, t + PAS_DERIVEE);
        return b > a ? (brute(b) - brute(a)) / (b - a) : 0;
      }
    }
  };

  if (!ressort) return { debut, fin, valeur: brute, vitesse: vitesseBrute };

  // Filtre ressort : consignes en marches / rampes reproduisant la courbe brute.
  const consignes: Consigne[] = [];
  if (n > 0) {
    if (vs[0] !== avant) consignes.push({ t: ts[0]!, v: vs[0]! });
    for (let k = 0; k < n - 1; k++) {
      const s = segments[k]!;
      const t0 = ts[k]!;
      const t1 = ts[k + 1]!;
      const h = t1 - t0;
      if (s.mode === 'constant' || h <= 0) {
        consignes.push({ t: t1, v: s.v1 });
      } else if (s.mode === 'lineaire') {
        consignes.push({ t: t0, v: s.v1, rampe: h });
      } else {
        for (let j = 0; j < SOUS_RAMPES; j++) {
          const ta = t0 + (h * j) / SOUS_RAMPES;
          const tb = j === SOUS_RAMPES - 1 ? t1 : t0 + (h * (j + 1)) / SOUS_RAMPES;
          const vb = j === SOUS_RAMPES - 1 ? s.v1 : brute(tb);
          consignes.push({ t: ta, v: vb, rampe: tb - ta });
        }
      }
    }
  }
  const canal: CanalRessort = creerCanalRessort(avant, consignes, ressort);
  return { debut, fin, valeur: (t) => canal.valeur(t), vitesse: (t) => canal.vitesse(t) };
}

/** Normalise des clés scalaires : tri stable par instant, segments typés. */
function preparer(
  cles: ReadonlyArray<Cle<number>>,
  options: OptionsPiste<number>,
): { ts: number[]; vs: number[]; segments: Segment[]; avant: number } {
  const triees = cles
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.t - b.c.t || a.i - b.i)
    .map((x) => x.c);
  for (const c of triees) {
    if (!Number.isFinite(c.t) || !Number.isFinite(c.v)) throw new Error('Clé de piste non finie');
  }
  const ts = triees.map((c) => c.t);
  const vs = triees.map((c) => c.v);
  const modeDefaut = options.interpolation ?? 'lisse';
  const easingDefaut = options.easing ?? 'lisse';
  const pentes = pentesCatmullRom(ts, vs, { extremites: 'nulles', monotone: options.monotone ?? false });
  const segments: Segment[] = [];
  for (let k = 0; k < triees.length - 1; k++) {
    const a = triees[k]!;
    const b = triees[k + 1]!;
    const mode = a.interpolation ?? modeDefaut;
    let courbe: Easing | null = null;
    if (mode === 'easing') courbe = EASINGS[a.easing ?? easingDefaut];
    else if (mode === 'bezier') {
      const z = a.bezier ?? [0.42, 0, 0.58, 1];
      courbe = courbeBezier(z[0], z[1], z[2], z[3]);
    }
    let p0 = 0;
    let p1 = 0;
    if (mode === 'lisse') {
      p0 = pentes[k]!;
      p1 = pentes[k + 1]!;
    } else if (mode === 'hermite') {
      p0 = a.vitesseSortie ?? 0;
      p1 = b.vitesseEntree ?? 0;
    }
    segments.push({ mode, courbe, v0: a.v, v1: b.v, p0, p1 });
  }
  const avant = options.valeurInitiale ?? (vs.length > 0 ? vs[0]! : 0);
  return { ts, vs, segments, avant };
}

/** Piste de nombres. */
export function creerPisteNombre(cles: ReadonlyArray<Cle<number>>, options: OptionsPiste<number> = {}): Piste<number> {
  const p = preparer(cles, options);
  return construireScalaire(p.ts, p.vs, p.segments, p.avant, options.ressort);
}

/** Piste de `Vec2` (composantes indépendantes, mêmes instants et modes). */
export function creerPisteVec2(cles: ReadonlyArray<Cle<Vec2>>, options: OptionsPiste<Vec2> = {}): Piste<Vec2> {
  const composante = (axe: 'x' | 'y'): Piste<number> =>
    creerPisteNombre(
      cles.map((c) => {
        const r: Cle<number> = { t: c.t, v: c.v[axe] };
        if (c.interpolation !== undefined) r.interpolation = c.interpolation;
        if (c.easing !== undefined) r.easing = c.easing;
        if (c.bezier !== undefined) r.bezier = c.bezier;
        if (c.vitesseEntree !== undefined) r.vitesseEntree = c.vitesseEntree[axe];
        if (c.vitesseSortie !== undefined) r.vitesseSortie = c.vitesseSortie[axe];
        return r;
      }),
      {
        ...(options.interpolation !== undefined ? { interpolation: options.interpolation } : {}),
        ...(options.easing !== undefined ? { easing: options.easing } : {}),
        ...(options.ressort !== undefined ? { ressort: options.ressort } : {}),
        ...(options.monotone !== undefined ? { monotone: options.monotone } : {}),
        ...(options.valeurInitiale !== undefined ? { valeurInitiale: options.valeurInitiale[axe] } : {}),
      },
    );
  const px = composante('x');
  const py = composante('y');
  return {
    debut: px.debut,
    fin: px.fin,
    valeur: (t) => ({ x: px.valeur(t), y: py.valeur(t) }),
    vitesse: (t) => ({ x: px.vitesse(t), y: py.vitesse(t) }),
  };
}

/**
 * Piste d'angles (rad). Les clés sont déroulées : chaque clé est rejointe par le plus court chemin depuis la
 * précédente. Sortie continue ; `enrouler: true` la ramène dans ]−π, π].
 */
export function creerPisteAngle(
  cles: ReadonlyArray<Cle<number>>,
  options: OptionsPiste<number> & { enrouler?: boolean } = {},
): Piste<number> {
  const triees = cles
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.t - b.c.t || a.i - b.i)
    .map((x) => x.c);
  let courant: number | null = null;
  const deroulees = triees.map((c) => {
    courant = courant === null ? c.v : courant + ecartAngle(courant, c.v);
    return { ...c, v: courant };
  });
  const opts: OptionsPiste<number> = { ...options };
  if (options.valeurInitiale !== undefined && deroulees.length > 0) {
    const v0 = deroulees[0]!.v;
    opts.valeurInitiale = v0 + ecartAngle(v0, options.valeurInitiale);
  }
  const p = creerPisteNombre(deroulees, opts);
  if (!options.enrouler) return p;
  return { ...p, valeur: (t) => enroulerAngle(p.valeur(t)) };
}
