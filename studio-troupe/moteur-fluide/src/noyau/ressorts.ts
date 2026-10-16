/**
 * Ressorts du second ordre résolus ANALYTIQUEMENT (fonction pure du temps).
 *
 * Système (paramétrage f, ζ, r de t3ssel8r) : `y + k1·y' + k2·y'' = x + k3·x'`, avec `ω = 2πf`, `k1 = 2ζ/ω`,
 * `k2 = 1/ω²`, `k3 = r·ζ/ω`. Soit `y'' + 2ζω·y' + ω²·y = ω²·(x + k3·x')`.
 *
 * La consigne `x(t)` est une somme de **marches** et de **rampes** (les « clés d'intention »). Le système étant
 * linéaire et parti du repos, la réponse est la superposition exacte des réponses élémentaires :
 * - marche Δ à `t_k` : `Δ·h(t − t_k)` avec `h = S + k3·S'` (S = réponse indicielle classique) ;
 * - rampe Δ sur `[t_k, t_k + d]` : `(Δ/d)·[R(τ) − R(τ − d)]` avec `R(τ) = ∫₀^τ h = τ − I(τ) + k3·S(τ)` et
 *   `I(τ) = ∫₀^τ (1 − S)`.
 * Formes fermées pour ζ < 1 (pseudo-périodique), ζ = 1 (critique) et ζ > 1 (apériodique).
 *
 * Effets de jeu : ζ < 1 → dépassement et retour au calme (follow-through, settle) ; r < 0 → anticipation (la
 * vitesse initiale `Δ·r·ζ·ω` part à l'envers) ; r > 1 → attaque sèche. Aucun pas de temps, aucune dérive : on peut
 * évaluer n'importe quel instant, dans n'importe quel ordre (scrub, reprise, 60 i/s).
 */
import type { ParametresRessort, Vec2 } from '../timeline/types';
import { enroulerAngle, ecartAngle } from './maths2d';

/** Écart à ζ = 1 en deçà duquel on utilise la forme critique exacte (stabilité numérique). */
const EPS_CRITIQUE = 1e-4;
/** Tolérance d'absorption des consignes anciennes (contribution résiduelle relative). */
const TOLERANCE_ABSORPTION = 1e-12;

/** Coefficients dérivés d'un ressort. */
export interface CoefficientsRessort {
  omega: number;
  zeta: number;
  k1: number;
  k2: number;
  k3: number;
  /** Régime utilisé. */
  regime: 'pseudoPeriodique' | 'critique' | 'aperiodique';
  /** Pulsation amortie (ζ < 1). */
  omegaD: number;
  /** Racines (ζ > 1), négatives : s1 (lente) > s2 (rapide). */
  s1: number;
  s2: number;
  /** Taux de décroissance de l'enveloppe la plus lente (1/s). */
  sigma: number;
  /** Durée au-delà de laquelle une consigne est considérée comme totalement établie. */
  dureeEtablissement: number;
}

/** Vérifie et complète les paramètres, puis calcule les coefficients. */
export function coefficientsRessort(p: ParametresRessort): CoefficientsRessort {
  const f = p.f;
  let zeta = p.zeta;
  const r = p.r ?? 0;
  if (!(Number.isFinite(f) && f > 0)) throw new Error(`Ressort : fréquence invalide (${f} Hz)`);
  if (!(Number.isFinite(zeta) && zeta > 0)) throw new Error(`Ressort : amortissement invalide (ζ = ${zeta})`);
  if (!Number.isFinite(r)) throw new Error(`Ressort : réponse initiale invalide (r = ${r})`);
  const omega = 2 * Math.PI * f;
  if (Math.abs(zeta - 1) < EPS_CRITIQUE) zeta = 1;
  const k3 = (r * zeta) / omega;
  let regime: CoefficientsRessort['regime'];
  let omegaD = 0;
  let s1 = 0;
  let s2 = 0;
  let sigma: number;
  let c: number;
  if (zeta < 1) {
    regime = 'pseudoPeriodique';
    omegaD = omega * Math.sqrt(1 - zeta * zeta);
    sigma = zeta * omega;
    c = 1 / Math.sqrt(1 - zeta * zeta);
  } else if (zeta === 1) {
    regime = 'critique';
    sigma = omega / 2; // (1 + ωτ)·e^{−ωτ} ≤ 2·e^{−ωτ/2}
    c = 2;
  } else {
    regime = 'aperiodique';
    const q = Math.sqrt(zeta * zeta - 1);
    s1 = -omega * (zeta - q);
    s2 = -omega * (zeta + q);
    sigma = -s1;
    c = zeta / q;
  }
  const borne = c * (1 + Math.abs(k3) * omega) * (1 + omega);
  const dureeEtablissement = Math.log(borne / TOLERANCE_ABSORPTION) / sigma;
  return { omega, zeta, k1: (2 * zeta) / omega, k2: 1 / (omega * omega), k3, regime, omegaD, s1, s2, sigma, dureeEtablissement };
}

/** S et ses trois premières dérivées en τ ≥ 0 (réponse indicielle du système sans terme k3). */
function derivesS(c: CoefficientsRessort, tau: number): [number, number, number, number] {
  const w = c.omega;
  if (c.regime === 'pseudoPeriodique') {
    const z = c.zeta;
    const wd = c.omegaD;
    const e = Math.exp(-z * w * tau);
    const co = Math.cos(wd * tau);
    const si = Math.sin(wd * tau);
    const q = Math.sqrt(1 - z * z);
    const A = w / q;
    const S = 1 - e * (co + (z / q) * si);
    const S1 = A * e * si;
    const S2 = A * e * (wd * co - z * w * si);
    const S3 = A * e * ((z * z * w * w - wd * wd) * si - 2 * z * w * wd * co);
    return [S, S1, S2, S3];
  }
  if (c.regime === 'critique') {
    const e = Math.exp(-w * tau);
    const S = 1 - (1 + w * tau) * e;
    const S1 = w * w * tau * e;
    const S2 = w * w * e * (1 - w * tau);
    const S3 = w * w * w * e * (w * tau - 2);
    return [S, S1, S2, S3];
  }
  const { s1, s2 } = c;
  const e1 = Math.exp(s1 * tau);
  const e2 = Math.exp(s2 * tau);
  const d = s1 - s2;
  const S = 1 + (s2 * e1 - s1 * e2) / d;
  const p = s1 * s2; // = ω²
  const S1 = (p * (e1 - e2)) / d;
  const S2 = (p * (s1 * e1 - s2 * e2)) / d;
  const S3 = (p * (s1 * s1 * e1 - s2 * s2 * e2)) / d;
  return [S, S1, S2, S3];
}

/** I(τ) = ∫₀^τ (1 − S(s)) ds, pour τ ≥ 0 (tend vers 2ζ/ω). */
function integraleEcart(c: CoefficientsRessort, tau: number): number {
  const w = c.omega;
  if (c.regime === 'pseudoPeriodique') {
    const z = c.zeta;
    const a = -z * w;
    const b = c.omegaD;
    const ww = w * w; // a² + b²
    const e = Math.exp(a * tau);
    const co = Math.cos(b * tau);
    const si = Math.sin(b * tau);
    const iCos = (e * (a * co + b * si) - a) / ww;
    const iSin = (e * (a * si - b * co) + b) / ww;
    return iCos + (z / Math.sqrt(1 - z * z)) * iSin;
  }
  if (c.regime === 'critique') {
    const e = Math.exp(-w * tau);
    return (2 - e * (2 + w * tau)) / w;
  }
  const { s1, s2 } = c;
  // 1 − S = −(s2·e^{s1τ} − s1·e^{s2τ})/(s1 − s2) ; ∫₀^τ e^{sτ'} = (e^{sτ} − 1)/s (avec expm1 pour la précision)
  return -((s2 * Math.expm1(s1 * tau)) / s1 - (s1 * Math.expm1(s2 * tau)) / s2) / (s1 - s2);
}

/** Réponse élémentaire à une marche unité : valeur, vitesse, accélération de `h = S + k3·S'` (0 si τ < 0). */
export function reponseIndicielle(c: CoefficientsRessort, tau: number): [number, number, number] {
  if (tau <= 0) return [0, 0, 0];
  const [S, S1, S2, S3] = derivesS(c, tau);
  return [S + c.k3 * S1, S1 + c.k3 * S2, S2 + c.k3 * S3];
}

/** Réponse à une rampe unité de pente 1 (intégrale de h) : `R(τ) = τ − I(τ) + k3·S(τ)` (0 si τ < 0). */
export function reponseRampe(c: CoefficientsRessort, tau: number): number {
  if (tau <= 0) return 0;
  const [S] = derivesS(c, tau);
  return tau - integraleEcart(c, tau) + c.k3 * S;
}

/**
 * Consigne d'un canal : à l'instant `t`, la cible se met à aller vers `v` — d'un coup (marche, `rampe` absente ou
 * nulle) ou linéairement en `rampe` secondes. Les rampes qui se chevauchent s'additionnent (la cible reste continue
 * et finit exactement sur la dernière valeur).
 */
export interface Consigne {
  t: number;
  v: number;
  rampe?: number;
}

/** État dérivable d'un canal à un instant. */
export interface EtatCanal {
  valeur: number;
  vitesse: number;
  acceleration: number;
}

/** Canal scalaire filtré par ressort, évaluable à n'importe quel instant. */
export interface CanalRessort {
  readonly coefficients: CoefficientsRessort;
  /** Valeur de la consigne brute (avant ressort) à `t`. */
  consigne(t: number): number;
  valeur(t: number): number;
  vitesse(t: number): number;
  acceleration(t: number): number;
  etat(t: number): EtatCanal;
}

interface ConsigneInterne {
  t: number;
  delta: number;
  rampe: number;
  /** Valeur cible cumulée une fois cette consigne (et les précédentes) établie. */
  cumul: number;
  /** max_{j ≤ k}(t_j + rampe_j) : fin d'établissement de la cible jusqu'à cette consigne. */
  finCible: number;
}

/** Durée sous laquelle une rampe est traitée comme une marche. */
const RAMPE_MIN = 1e-6;

/**
 * Crée un canal scalaire : part du repos sur `valeurInitiale`, suit les `consignes` (triées ou non ; un tri stable
 * par instant est appliqué) à travers le ressort `params`. Évaluation : recherche binaire, puis somme exacte des
 * consignes encore actives (les plus anciennes, totalement établies, sont absorbées à 10⁻¹² près).
 */
export function creerCanalRessort(
  valeurInitiale: number,
  consignes: readonly Consigne[],
  params: ParametresRessort,
): CanalRessort {
  const c = coefficientsRessort(params);
  const triees = consignes
    .map((k, i) => ({ k, i }))
    .sort((a, b) => a.k.t - b.k.t || a.i - b.i)
    .map((x) => x.k);
  const internes: ConsigneInterne[] = [];
  let precedente = valeurInitiale;
  let fin = -Infinity;
  for (const k of triees) {
    if (!Number.isFinite(k.t) || !Number.isFinite(k.v)) throw new Error('Consigne de ressort non finie');
    const rampe = k.rampe !== undefined && k.rampe > RAMPE_MIN ? k.rampe : 0;
    const delta = k.v - precedente;
    precedente = k.v;
    fin = Math.max(fin, k.t + rampe);
    internes.push({ t: k.t, delta, rampe, cumul: k.v, finCible: fin });
  }
  const n = internes.length;

  /** Dernière consigne d'indice ≤ `haut` dont `cle(i) ≤ x` (−1 si aucune) ; `cle` croissante. */
  const chercher = (x: number, cle: (i: number) => number): number => {
    let lo = 0;
    let hi = n - 1;
    let r = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (cle(m) <= x) {
        r = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    return r;
  };

  const evaluer = (t: number, ordre: 0 | 1 | 2): number => {
    const dernier = chercher(t, (i) => internes[i]!.t);
    if (dernier < 0) return ordre === 0 ? valeurInitiale : 0;
    const absorbe = chercher(t - c.dureeEtablissement, (i) => internes[i]!.finCible);
    let somme = ordre === 0 ? (absorbe >= 0 ? internes[absorbe]!.cumul : valeurInitiale) : 0;
    for (let i = absorbe + 1; i <= dernier; i++) {
      const k = internes[i]!;
      if (k.delta === 0) continue;
      const tau = t - k.t;
      if (k.rampe === 0) {
        const h = reponseIndicielle(c, tau);
        somme += k.delta * h[ordre];
      } else {
        const pente = k.delta / k.rampe;
        if (ordre === 0) somme += pente * (reponseRampe(c, tau) - reponseRampe(c, tau - k.rampe));
        else {
          const a = reponseIndicielle(c, tau);
          const b = reponseIndicielle(c, tau - k.rampe);
          somme += pente * (ordre === 1 ? a[0] - b[0] : a[1] - b[1]);
        }
      }
    }
    return somme;
  };

  const consigne = (t: number): number => {
    let v = valeurInitiale;
    for (const k of internes) {
      if (k.t > t) break;
      v += k.rampe === 0 ? k.delta : k.delta * Math.min(1, (t - k.t) / k.rampe);
    }
    return v;
  };

  return {
    coefficients: c,
    consigne,
    valeur: (t) => evaluer(t, 0),
    vitesse: (t) => evaluer(t, 1),
    acceleration: (t) => evaluer(t, 2),
    etat: (t) => ({ valeur: evaluer(t, 0), vitesse: evaluer(t, 1), acceleration: evaluer(t, 2) }),
  };
}

/** Évaluation ponctuelle sans conserver le canal (pratique, mais recrée le canal à chaque appel). */
export function reponseRessort(
  valeurInitiale: number,
  consignes: readonly Consigne[],
  params: ParametresRessort,
  t: number,
): number {
  return creerCanalRessort(valeurInitiale, consignes, params).valeur(t);
}

// ── Vec2 et angles ───────────────────────────────────────────────────────────────────────────────────────────────

/** Consigne vectorielle. */
export interface ConsigneVec2 {
  t: number;
  v: Vec2;
  rampe?: number;
}

/** Canal 2D filtré par ressort (deux canaux scalaires indépendants, mêmes paramètres). */
export interface CanalRessortVec2 {
  valeur(t: number): Vec2;
  vitesse(t: number): Vec2;
  acceleration(t: number): Vec2;
}

export function creerCanalRessortVec2(
  valeurInitiale: Vec2,
  consignes: readonly ConsigneVec2[],
  params: ParametresRessort,
): CanalRessortVec2 {
  const cx = creerCanalRessort(
    valeurInitiale.x,
    consignes.map((k) => ({ t: k.t, v: k.v.x, rampe: k.rampe })),
    params,
  );
  const cy = creerCanalRessort(
    valeurInitiale.y,
    consignes.map((k) => ({ t: k.t, v: k.v.y, rampe: k.rampe })),
    params,
  );
  return {
    valeur: (t) => ({ x: cx.valeur(t), y: cy.valeur(t) }),
    vitesse: (t) => ({ x: cx.vitesse(t), y: cy.vitesse(t) }),
    acceleration: (t) => ({ x: cx.acceleration(t), y: cy.acceleration(t) }),
  };
}

/**
 * Canal d'angle (rad) : chaque consigne est rejointe par le **plus court chemin** depuis la précédente
 * (écart enroulé dans ]−π, π]). La sortie est continue (non enroulée) ; `enrouler: true` la ramène dans ]−π, π].
 */
export function creerCanalRessortAngle(
  angleInitial: number,
  consignes: readonly Consigne[],
  params: ParametresRessort,
  options: { enrouler?: boolean } = {},
): CanalRessort {
  const triees = [...consignes].map((k, i) => ({ k, i })).sort((a, b) => a.k.t - b.k.t || a.i - b.i);
  let courant = angleInitial;
  const deroulees: Consigne[] = triees.map(({ k }) => {
    courant = courant + ecartAngle(courant, k.v);
    return { t: k.t, v: courant, rampe: k.rampe };
  });
  const canal = creerCanalRessort(angleInitial, deroulees, params);
  if (!options.enrouler) return canal;
  return {
    ...canal,
    consigne: (t) => enroulerAngle(canal.consigne(t)),
    valeur: (t) => enroulerAngle(canal.valeur(t)),
    etat: (t) => {
      const e = canal.etat(t);
      return { ...e, valeur: enroulerAngle(e.valeur) };
    },
  };
}

// ── Inertialisation (interruptions sans dépassement) ─────────────────────────────────────────────────────────────

/**
 * Décroissance quintique d'un écart (inertialisation) : part de l'écart `x0` avec la vitesse `v0` (unités/s), et
 * atteint 0 avec vitesse et accélération nulles à `duree`. On l'ajoute à la nouvelle animation lors d'une
 * interruption : transition C¹, sans dépassement (la vitesse initiale est ramenée vers 0 si elle éloigne de 0, et
 * la durée raccourcie si la vitesse ferait traverser 0). Renvoie 0 pour τ ≥ duree.
 */
export function decroissanceQuintique(x0: number, v0: number, duree: number, tau: number): number {
  if (x0 === 0 && v0 === 0) return 0;
  if (tau >= duree || duree <= 0) return 0;
  if (tau <= 0) return x0;
  const signe = x0 < 0 ? -1 : 1;
  const x = x0 * signe;
  let v = v0 * signe;
  if (v > 0) v = 0; // ne jamais s'éloigner de 0 : pas de dépassement
  let t1 = duree;
  if (v < 0) t1 = Math.min(t1, (-5 * x) / v);
  if (tau >= t1) return 0;
  const a0 = Math.max(0, (-8 * v * t1 - 20 * x) / (t1 * t1));
  const t2 = t1 * t1;
  const t3 = t2 * t1;
  const t4 = t3 * t1;
  const t5 = t4 * t1;
  const A = -(a0 * t2 + 6 * v * t1 + 12 * x) / (2 * t5);
  const B = (3 * a0 * t2 + 16 * v * t1 + 30 * x) / (2 * t4);
  const C = -(3 * a0 * t2 + 12 * v * t1 + 20 * x) / (2 * t3);
  const y = (((A * tau + B) * tau + C) * tau + a0 / 2) * tau * tau + v * tau + x;
  return y * signe;
}
