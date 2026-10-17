/**
 * RESSORTS DU SECOND ORDRE RÉSOLUS ANALYTIQUEMENT — greffe du 16/10/2026, reprise du « moteur fluide » de la troupe
 * (branche claude/youthful-pasteur-7wbiqt, studio-troupe/moteur-fluide/src/noyau/ressorts.ts, même dépôt, même auteur),
 * paramétrage (f, ζ, r) de t3ssel8r : `y + k1·y' + k2·y'' = x + k3·x'`, `ω = 2πf`, `k1 = 2ζ/ω`, `k2 = 1/ω²`,
 * `k3 = r·ζ/ω`.
 *
 * La consigne x(t) est une somme de marches et de rampes ; le système étant linéaire et parti du repos, la réponse est
 * la SOMME EXACTE des réponses élémentaires (formes fermées ζ < 1, ζ = 1, ζ > 1). Aucun pas de temps, aucune dérive :
 * n'importe quel instant, dans n'importe quel ordre (rendu parallèle en 4 morceaux, sous-images de flou de bougé).
 *
 * Ajouts propres au moteur squelettique de la troupe (armature2d.ts) :
 * - `canalEchantillonne` : un canal d'os échantillonné (pose brute calculée image par image : IK, capture, rencontre
 *   des dessins) devient une suite de rampes — le ressort donne le dépassement et le retour au calme ;
 * - AVANCE DE PHASE COMPENSÉE : le ressort retarde le geste de `k1 − k3` secondes (retard de groupe aux basses
 *   fréquences) ; la consigne est avancée d'autant, puis retardée seulement du CHEVAUCHEMENT voulu (profondeur de l'os
 *   dans sa chaîne × δ) — le coup de bras reste sur la syllabe accentuée, la main suit l'avant-bras qui suit le bras ;
 * - réglages par os aux noms du squelette dessiné (bonesFromBody : Hips, Spine…, LeftForeArm…).
 */

export interface ParametresRessort {
  /** fréquence propre (Hz) */
  f: number;
  /** amortissement (< 1 : dépassement) */
  zeta: number;
  /** réponse initiale (< 0 : anticipation, > 1 : attaque sèche) */
  r?: number;
}

const EPS_CRITIQUE = 1e-4;
const TOLERANCE_ABSORPTION = 1e-12;
const RAMPE_MIN = 1e-6;

export interface CoefficientsRessort {
  omega: number;
  zeta: number;
  k1: number;
  k2: number;
  k3: number;
  regime: 'pseudoPeriodique' | 'critique' | 'aperiodique';
  omegaD: number;
  s1: number;
  s2: number;
  sigma: number;
  dureeEtablissement: number;
}

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
  let omegaD = 0, s1 = 0, s2 = 0, sigma: number, c: number;
  if (zeta < 1) {
    regime = 'pseudoPeriodique';
    omegaD = omega * Math.sqrt(1 - zeta * zeta);
    sigma = zeta * omega;
    c = 1 / Math.sqrt(1 - zeta * zeta);
  } else if (zeta === 1) {
    regime = 'critique';
    sigma = omega / 2;
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

/** S (réponse indicielle sans k3) et ses trois premières dérivées en τ ≥ 0. */
function derivesS(c: CoefficientsRessort, tau: number): [number, number, number, number] {
  const w = c.omega;
  if (c.regime === 'pseudoPeriodique') {
    const z = c.zeta, wd = c.omegaD, e = Math.exp(-z * w * tau), co = Math.cos(wd * tau), si = Math.sin(wd * tau);
    const q = Math.sqrt(1 - z * z), A = w / q;
    return [1 - e * (co + (z / q) * si), A * e * si, A * e * (wd * co - z * w * si), A * e * ((z * z * w * w - wd * wd) * si - 2 * z * w * wd * co)];
  }
  if (c.regime === 'critique') {
    const e = Math.exp(-w * tau);
    return [1 - (1 + w * tau) * e, w * w * tau * e, w * w * e * (1 - w * tau), w * w * w * e * (w * tau - 2)];
  }
  const { s1, s2 } = c, e1 = Math.exp(s1 * tau), e2 = Math.exp(s2 * tau), d = s1 - s2, p = s1 * s2;
  return [1 + (s2 * e1 - s1 * e2) / d, (p * (e1 - e2)) / d, (p * (s1 * e1 - s2 * e2)) / d, (p * (s1 * s1 * e1 - s2 * s2 * e2)) / d];
}

/** I(τ) = ∫₀^τ (1 − S). */
function integraleEcart(c: CoefficientsRessort, tau: number): number {
  const w = c.omega;
  if (c.regime === 'pseudoPeriodique') {
    const z = c.zeta, a = -z * w, b = c.omegaD, ww = w * w, e = Math.exp(a * tau), co = Math.cos(b * tau), si = Math.sin(b * tau);
    return (e * (a * co + b * si) - a) / ww + (z / Math.sqrt(1 - z * z)) * ((e * (a * si - b * co) + b) / ww);
  }
  if (c.regime === 'critique') { const e = Math.exp(-w * tau); return (2 - e * (2 + w * tau)) / w; }
  const { s1, s2 } = c;
  return -((s2 * Math.expm1(s1 * tau)) / s1 - (s1 * Math.expm1(s2 * tau)) / s2) / (s1 - s2);
}

/** Réponse à une marche unité : valeur, vitesse, accélération de `h = S + k3·S'` (0 si τ < 0). */
export function reponseIndicielle(c: CoefficientsRessort, tau: number): [number, number, number] {
  if (tau <= 0) return [0, 0, 0];
  const [S, S1, S2, S3] = derivesS(c, tau);
  return [S + c.k3 * S1, S1 + c.k3 * S2, S2 + c.k3 * S3];
}

/** Réponse à une rampe de pente 1 : `R(τ) = τ − I(τ) + k3·S(τ)` (0 si τ < 0). */
export function reponseRampe(c: CoefficientsRessort, tau: number): number {
  if (tau <= 0) return 0;
  return tau - integraleEcart(c, tau) + c.k3 * derivesS(c, tau)[0];
}

/** À l'instant `t`, la cible se met à aller vers `v`, d'un coup ou en `rampe` secondes. */
export interface Consigne { t: number; v: number; rampe?: number }

export interface CanalRessort {
  readonly coefficients: CoefficientsRessort;
  consigne(t: number): number;
  valeur(t: number): number;
  vitesse(t: number): number;
  acceleration(t: number): number;
}

interface ConsigneInterne { t: number; delta: number; rampe: number; cumul: number; finCible: number }

/** Canal scalaire : part du repos sur `valeurInitiale` et suit les consignes à travers le ressort. */
export function creerCanalRessort(valeurInitiale: number, consignes: readonly Consigne[], params: ParametresRessort): CanalRessort {
  const c = coefficientsRessort(params);
  const triees = consignes.map((k, i) => ({ k, i })).sort((a, b) => a.k.t - b.k.t || a.i - b.i).map((x) => x.k);
  const internes: ConsigneInterne[] = [];
  let precedente = valeurInitiale, fin = -Infinity;
  for (const k of triees) {
    if (!Number.isFinite(k.t) || !Number.isFinite(k.v)) throw new Error('Consigne de ressort non finie');
    const rampe = k.rampe !== undefined && k.rampe > RAMPE_MIN ? k.rampe : 0;
    const delta = k.v - precedente;
    precedente = k.v;
    fin = Math.max(fin, k.t + rampe);
    internes.push({ t: k.t, delta, rampe, cumul: k.v, finCible: fin });
  }
  const n = internes.length;
  const chercher = (x: number, cle: (i: number) => number): number => {
    let lo = 0, hi = n - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (cle(m) <= x) { r = m; lo = m + 1; } else hi = m - 1; }
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
      if (k.rampe === 0) somme += k.delta * reponseIndicielle(c, tau)[ordre];
      else {
        const pente = k.delta / k.rampe;
        if (ordre === 0) somme += pente * (reponseRampe(c, tau) - reponseRampe(c, tau - k.rampe));
        else { const a = reponseIndicielle(c, tau), b = reponseIndicielle(c, tau - k.rampe); somme += pente * (ordre === 1 ? a[0] - b[0] : a[1] - b[1]); }
      }
    }
    return somme;
  };
  const consigne = (t: number): number => {
    let v = valeurInitiale;
    for (const k of internes) { if (k.t > t) break; v += k.rampe === 0 ? k.delta : k.delta * Math.min(1, (t - k.t) / k.rampe); }
    return v;
  };
  return { coefficients: c, consigne, valeur: (t) => evaluer(t, 0), vitesse: (t) => evaluer(t, 1), acceleration: (t) => evaluer(t, 2) };
}

/** Gain et déphasage (rad, négatif = retard) du ressort en régime établi à `frequence` Hz. */
export function reponseHarmonique(p: ParametresRessort, frequence: number): { gain: number; phase: number } {
  const omega = 2 * Math.PI * p.f, k1 = (2 * p.zeta) / omega, k2 = 1 / (omega * omega), k3 = ((p.r ?? 0) * p.zeta) / omega, W = 2 * Math.PI * frequence;
  return { gain: Math.hypot(1, k3 * W) / Math.hypot(1 - k2 * W * W, k1 * W), phase: Math.atan2(k3 * W, 1) - Math.atan2(k1 * W, 1 - k2 * W * W) };
}

/** Retard de groupe aux basses fréquences (s) : `k1 − k3` — ce que le ressort fait perdre au temps du geste. */
export const retardDeGroupe = (p: ParametresRessort): number => { const omega = 2 * Math.PI * p.f; return ((2 - (p.r ?? 0)) * p.zeta) / omega; };

/**
 * Canal d'os ÉCHANTILLONNÉ (pose brute image par image, à `fps`) filtré par le ressort : la consigne passe par chaque
 * échantillon (rampes d'une image), avancée du retard de groupe (`compenser`, par défaut oui) puis retardée de
 * `chevauchement` secondes. Part du repos sur le premier échantillon.
 */
export function canalEchantillonne(echantillons: ArrayLike<number>, fps: number, params: ParametresRessort, opts: { t0?: number; chevauchement?: number; compenser?: boolean } = {}): CanalRessort {
  const n = echantillons.length;
  if (n === 0) throw new Error('Canal échantillonné vide');
  const dt = 1 / fps;
  const decalage = (opts.chevauchement ?? 0) - (opts.compenser === false ? 0 : retardDeGroupe(params));
  const t0 = (opts.t0 ?? 0) + decalage;
  const cons: Consigne[] = [];
  for (let k = 1; k < n; k++) cons.push({ t: t0 + (k - 1) * dt, v: echantillons[k]!, rampe: dt });
  return creerCanalRessort(echantillons[0]!, cons, params);
}

/**
 * Réglages par os du squelette dessiné (noms de bonesFromBody), d'après le moteur fluide (reglages.ts : corps f 1,9
 * ζ 0,62 ; tête 2,8 / 0,52 ; bras 2,6 / 0,5 ; facteurs d'os : bassin lourd 0,85, avant-bras 1,12, main 1,3 ; extrémités
 * moins amorties) et PROFONDEUR DANS SA CHAÎNE (le chevauchement part du début de chaque chaîne : le buste depuis le
 * bassin, le bras depuis la clavicule — un geste du bras part à l'heure, la main suit).
 */
export const RESSORTS_OS: Readonly<Record<string, ParametresRessort & { profondeur: number }>> = Object.freeze({
  Hips: { f: 1.9 * 0.85, zeta: 0.67, profondeur: 0 },
  Spine: { f: 1.9, zeta: 0.62, profondeur: 1 },
  Spine1: { f: 1.9 * 1.05, zeta: 0.62, profondeur: 2 },
  Spine2: { f: 1.9 * 1.05, zeta: 0.62, profondeur: 2 },
  Neck: { f: 2.8 * 0.95, zeta: 0.52, profondeur: 3 },
  Head: { f: 2.8, zeta: 0.5, profondeur: 4 },
  Shoulder: { f: 2.6 * 0.95, zeta: 0.5, profondeur: 0 },
  Arm: { f: 2.6, zeta: 0.5, profondeur: 1 },
  ForeArm: { f: 2.6 * 1.12, zeta: 0.45, profondeur: 2 },
  Hand: { f: 2.6 * 1.3, zeta: 0.4, profondeur: 3 },
});

/** Réglage d'un os (`LeftForeArm` → `ForeArm`), ou null pour les jambes (pieds plantés par l'IK après le ressort). */
export function ressortOs(nom: string): (ParametresRessort & { profondeur: number }) | null {
  const base = nom.replace(/^(Left|Right)/, '');
  return RESSORTS_OS[base] ?? null;
}
