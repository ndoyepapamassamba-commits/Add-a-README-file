/**
 * Déformation ARAP (« as-rigid-as-possible », Igarashi, Moscovich & Hughes 2005 ; forme en deux étapes de
 * T. Igarashi & Y. Igarashi, JGT 2009), telle qu'Animated Drawings (Meta, MIT) l'applique à un dessin unique :
 * les articulations du squelette sont des POIGNÉES (contraintes douces de poids w = 1000, en barycentriques dans un
 * triangle), et le maillage suit en gardant ses arêtes aussi rigides que possible. Les bras ne s'étirent plus en
 * ruban : chaque arête retrouve sa longueur de repos, tournée.
 *
 * - Étape 1 (similitude libre) : système 2V×2V. Chaque arête suit la similitude (rotation + échelle) estimée sur
 *   son pochoir (ses deux sommets et leurs voisins communs). Forme close vérifiée : `GᵀG = S·I₂`, donc
 *   `(c, s) = Σ_m B_m·v'_m` avec `B_m = [[p_x, p_y], [p_y, −p_x]]/S`, sans inversion 2×2.
 * - On garde la rotation de chaque arête (`(c, s)` normalisé).
 * - Étape 2 (rotation seule) : système V×V (laplacien + poignées), résolu pour x et pour y.
 * Les deux matrices sont constantes : factorisées UNE fois (Cholesky en ligne de ciel, `creux.ts`) ; chaque image
 * coûte trois descentes-remontées. Résolution directe à froid : fonction pure des cibles.
 *
 * Écarts volontaires par rapport à Animated Drawings (voir THIRD_PARTY_NOTICES.md) :
 * - matrices CREUSES factorisées une fois (AD construit A1 dense — ≈ 2,9 Go pour un rig de 8 000 sommets — et
 *   refactorise trois fois par image) ;
 * - maillage de CONTRÔLE (≈ 600 sommets, `decimation.ts`) où tourne ARAP, le maillage fin y étant plongé en
 *   barycentriques ;
 * - poignées par composante et par partie (une poignée n'est jamais jetée en silence ; pas de « premier triangle
 *   trouvé » à travers des pièces superposées) ;
 * - arêtes COUPÉES entre parties éloignées dans l'arbre (bras soudé au torse, cuisses soudées) : elles ne
 *   s'opposent plus à la séparation des membres ;
 * - attache douce de chaque sommet à la peau CoR (λ² par partie : tête quasi rigide pour les ancrages du visage),
 *   qui rend tout le système défini positif même pour une pièce sans poignée.
 */
import type { CharacterRig, Maillage, Vec2 } from '../timeline/types';
import { MatriceNonDefiniePositive, MatriceSymetrique, factoriserProfil, resoudreProfil, type FacteurProfil } from './creux';
import { barycentriques, composantesSommets, decimerMaillage, plongerSommets, type Plongement } from './decimation';
import type { EtatSquelette } from './fk';
import { deformerSommets, type MethodePeau } from './peau';
import { distanceArborescente, indexerSquelette } from './squelette';

/** Poignée : point d'un triangle (3 sommets, 3 poids barycentriques). */
export interface PoigneeArap {
  sommets: readonly [number, number, number];
  poids: readonly [number, number, number];
}

/** Système ARAP précalculé (immuable). */
export interface SystemeArap {
  readonly V: number;
  readonly E: number;
  readonly P: number;
  readonly w: number;
  readonly repos: Float64Array;
  /** 2E : (i, j), i < j. */
  readonly aretes: Int32Array;
  /** 2E : arêtes au repos. */
  readonly e0: Float64Array;
  /** E+1 : début du pochoir de chaque arête dans `pochoir` / `ab`. */
  readonly debutPochoir: Int32Array;
  readonly pochoir: Int32Array;
  /** 2 par entrée de pochoir : (a, b) de `B_m = [[a, b], [b, −a]]`. */
  readonly ab: Float64Array;
  /** 3P / 3P. */
  readonly poigneesSommets: Int32Array;
  readonly poigneesPoids: Float64Array;
  /** λ² par sommet (attache à une position de référence), ou null. */
  readonly attache: Float64Array | null;
  readonly n1: FacteurProfil;
  readonly n2: FacteurProfil;
}

/** Options du système. */
export interface OptionsSystemeArap {
  /** Poids des poignées (défaut 1000, comme Animated Drawings). */
  w?: number;
  /** λ² par sommet : attache douce à une position de référence fournie à chaque résolution. */
  attache?: ArrayLike<number>;
  /** Arêtes prises en compte (défaut : toutes). */
  areteActive?: (i: number, j: number) => boolean;
}

/** Arêtes uniques triées (i < j) et voisins triés d'un maillage triangulé. */
function aretesEtVoisins(V: number, triangles: ArrayLike<number>): { aretes: Int32Array; voisins: number[][] } {
  const cles = new Set<number>();
  const voisins: Array<Set<number>> = Array.from({ length: V }, () => new Set<number>());
  for (let t = 0; t < triangles.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = triangles[t + k]!;
      const b = triangles[t + ((k + 1) % 3)]!;
      if (a === b) continue;
      const i = a < b ? a : b;
      const j = a < b ? b : a;
      cles.add(i * V + j);
      voisins[a]!.add(b);
      voisins[b]!.add(a);
    }
  }
  const tries = [...cles].sort((x, y) => x - y);
  const aretes = new Int32Array(2 * tries.length);
  tries.forEach((c, k) => {
    aretes[2 * k] = Math.floor(c / V);
    aretes[2 * k + 1] = c % V;
  });
  return { aretes, voisins: voisins.map((s) => [...s].sort((x, y) => x - y)) };
}

/** Factorise, avec une régularisation minime en secours (pièce sans poignée en mode fidèle, comme AD). */
function factoriserSur(A: MatriceSymetrique): FacteurProfil {
  try {
    return factoriserProfil(A);
  } catch (e) {
    if (!(e instanceof MatriceNonDefiniePositive)) throw e;
    let trace = 0;
    for (let i = 0; i < A.n; i++) trace += A.lire(i, i);
    const eps = 1e-8 * Math.max(1, trace / Math.max(1, A.n));
    for (let i = 0; i < A.n; i++) A.ajouter(i, i, eps);
    return factoriserProfil(A);
  }
}

/** Précalcule le système ARAP d'un maillage (positions 2V, triangles 3T) et de ses poignées. */
export function construireSystemeArap(
  positions: ArrayLike<number>,
  triangles: ArrayLike<number>,
  poignees: readonly PoigneeArap[],
  options: OptionsSystemeArap = {},
): SystemeArap {
  const V = positions.length / 2;
  const w = options.w ?? 1000;
  const w2 = w * w;
  const repos = Float64Array.from(positions as ArrayLike<number>);
  const { aretes: toutes, voisins } = aretesEtVoisins(V, triangles);
  const actif = options.areteActive;
  const garder: number[] = [];
  for (let k = 0; k < toutes.length / 2; k++) {
    const i = toutes[2 * k]!;
    const j = toutes[2 * k + 1]!;
    const ex = repos[2 * j]! - repos[2 * i]!;
    const ey = repos[2 * j + 1]! - repos[2 * i + 1]!;
    if (ex * ex + ey * ey < 1e-18) continue; // positions en double (coutures)
    if (actif && !actif(i, j)) continue;
    garder.push(k);
  }
  const E = garder.length;
  const aretes = new Int32Array(2 * E);
  const e0 = new Float64Array(2 * E);
  const debutPochoir = new Int32Array(E + 1);
  const pochoir: number[] = [];
  const ab: number[] = [];
  const N1 = new MatriceSymetrique(2 * V);
  const N2 = new MatriceSymetrique(V);
  const actifePaire = (a: number, b: number): boolean => (actif ? actif(a < b ? a : b, a < b ? b : a) : true);
  for (let e = 0; e < E; e++) {
    const k = garder[e]!;
    const i = toutes[2 * k]!;
    const j = toutes[2 * k + 1]!;
    aretes[2 * e] = i;
    aretes[2 * e + 1] = j;
    const ex = repos[2 * j]! - repos[2 * i]!;
    const ey = repos[2 * j + 1]! - repos[2 * i + 1]!;
    e0[2 * e] = ex;
    e0[2 * e + 1] = ey;
    // Pochoir : i, j, puis les voisins communs (triés) reliés à i ET à j par des arêtes actives.
    const st = [i, j];
    const vi = voisins[i]!;
    const vj = voisins[j]!;
    let a = 0;
    let b = 0;
    while (a < vi.length && b < vj.length) {
      if (vi[a]! < vj[b]!) a++;
      else if (vi[a]! > vj[b]!) b++;
      else {
        const m = vi[a]!;
        if (actifePaire(i, m) && actifePaire(j, m)) st.push(m);
        a++;
        b++;
      }
    }
    let S = 0;
    for (let q = 1; q < st.length; q++) {
      const px = repos[2 * st[q]!]! - repos[2 * i]!;
      const py = repos[2 * st[q]! + 1]! - repos[2 * i + 1]!;
      S += px * px + py * py;
    }
    debutPochoir[e] = pochoir.length;
    const coeffs: Array<[number, number]> = [];
    let ai = 0;
    let bi = 0;
    for (let q = 1; q < st.length; q++) {
      const px = repos[2 * st[q]!]! - repos[2 * i]!;
      const py = repos[2 * st[q]! + 1]! - repos[2 * i + 1]!;
      coeffs.push([px / S, py / S]);
      ai -= px / S;
      bi -= py / S;
    }
    coeffs.unshift([ai, bi]);
    for (let q = 0; q < st.length; q++) {
      pochoir.push(st[q]!);
      ab.push(coeffs[q]![0], coeffs[q]![1]);
    }
    // Blocs C_m = δ_m·I − E·B_m = [[δ − P, −Q], [Q, δ − P]], P = ex·a + ey·b, Q = ex·b − ey·a.
    const n = st.length;
    const C = new Float64Array(4 * n);
    for (let q = 0; q < n; q++) {
      const [ca, cb] = coeffs[q]!;
      const P = ex * ca + ey * cb;
      const Q = ex * cb - ey * ca;
      const delta = q === 0 ? -1 : q === 1 ? 1 : 0;
      C[4 * q] = delta - P;
      C[4 * q + 1] = -Q;
      C[4 * q + 2] = Q;
      C[4 * q + 3] = delta - P;
    }
    // N1 += Σ C_mᵀ C_n (seulement les coefficients ligne ≥ colonne, stockage symétrique).
    for (let q = 0; q < n; q++) {
      for (let r = 0; r < n; r++) {
        const m = st[q]!;
        const o = st[r]!;
        for (let u = 0; u < 2; u++) {
          for (let v = 0; v < 2; v++) {
            const gi = 2 * m + u;
            const gj = 2 * o + v;
            if (gi < gj) continue;
            // (C_mᵀ C_n)_{u,v} = Σ_s C_m[s,u]·C_n[s,v]
            const val = C[4 * q + u]! * C[4 * r + v]! + C[4 * q + 2 + u]! * C[4 * r + 2 + v]!;
            N1.ajouter(gi, gj, val);
          }
        }
      }
    }
    N2.ajouter(i, i, 1);
    N2.ajouter(j, j, 1);
    N2.ajouter(i, j, -1);
  }
  debutPochoir[E] = pochoir.length;
  const P = poignees.length;
  const poigneesSommets = new Int32Array(3 * P);
  const poigneesPoids = new Float64Array(3 * P);
  poignees.forEach((p, h) => {
    for (let a = 0; a < 3; a++) {
      poigneesSommets[3 * h + a] = p.sommets[a]!;
      poigneesPoids[3 * h + a] = p.poids[a]!;
    }
    // Terme w²·ββᵀ : chaque coefficient (va, vb) du triangle reçoit w²·β_a·β_b ; stockage symétrique → on
    // n'ajoute que les paires va ≥ vb (la paire symétrique désigne le même coefficient stocké).
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        const va = p.sommets[a]!;
        const vb = p.sommets[b]!;
        if (va < vb) continue;
        const val = w2 * p.poids[a]! * p.poids[b]!;
        N2.ajouter(va, vb, val);
        N1.ajouter(2 * va, 2 * vb, val);
        N1.ajouter(2 * va + 1, 2 * vb + 1, val);
      }
    }
  });
  let attache: Float64Array | null = null;
  if (options.attache) {
    attache = Float64Array.from(options.attache);
    for (let v = 0; v < V; v++) {
      const l = attache[v]!;
      if (!(l > 0)) continue;
      N1.ajouter(2 * v, 2 * v, l);
      N1.ajouter(2 * v + 1, 2 * v + 1, l);
      N2.ajouter(v, v, l);
    }
  }
  return {
    V,
    E,
    P,
    w,
    repos,
    aretes,
    e0,
    debutPochoir,
    pochoir: Int32Array.from(pochoir),
    ab: Float64Array.from(ab),
    poigneesSommets,
    poigneesPoids,
    attache,
    n1: factoriserSur(N1),
    n2: factoriserSur(N2),
  };
}

/** Tampons de travail (un jeu par système, réutilisé : la résolution reste pure). */
const TAMPONS = new WeakMap<SystemeArap, { r1: Float64Array; v1: Float64Array; rx: Float64Array; ry: Float64Array; t1: Float64Array; t2: Float64Array }>();

/**
 * Résout ARAP pour des cibles de poignées (2P) ; `reference` (2V) : positions visées par l'attache douce
 * (obligatoire si le système a une attache). Renvoie les positions (2V).
 */
export function resoudreArap(
  sys: SystemeArap,
  cibles: ArrayLike<number>,
  sortie: Float64Array = new Float64Array(2 * sys.V),
  reference?: ArrayLike<number>,
): Float64Array {
  const { V, E, P, w } = sys;
  const w2 = w * w;
  let tp = TAMPONS.get(sys);
  if (!tp) {
    tp = { r1: new Float64Array(2 * V), v1: new Float64Array(2 * V), rx: new Float64Array(V), ry: new Float64Array(V), t1: new Float64Array(2 * V), t2: new Float64Array(V) };
    TAMPONS.set(sys, tp);
  }
  const { r1, v1, rx, ry, t1, t2 } = tp;
  r1.fill(0);
  rx.fill(0);
  ry.fill(0);
  for (let h = 0; h < P; h++) {
    const qx = cibles[2 * h]!;
    const qy = cibles[2 * h + 1]!;
    for (let a = 0; a < 3; a++) {
      const v = sys.poigneesSommets[3 * h + a]!;
      const b = sys.poigneesPoids[3 * h + a]!;
      r1[2 * v] += w2 * b * qx;
      r1[2 * v + 1] += w2 * b * qy;
      rx[v] += w2 * b * qx;
      ry[v] += w2 * b * qy;
    }
  }
  if (sys.attache) {
    if (!reference) throw new Error('resoudreArap : positions de référence requises (système avec attache)');
    for (let v = 0; v < V; v++) {
      const l = sys.attache[v]!;
      if (!(l > 0)) continue;
      r1[2 * v] += l * reference[2 * v]!;
      r1[2 * v + 1] += l * reference[2 * v + 1]!;
      rx[v] += l * reference[2 * v]!;
      ry[v] += l * reference[2 * v + 1]!;
    }
  }
  // Étape 1 : similitudes libres.
  resoudreProfil(sys.n1, r1, v1, t1);
  // Rotations d'arêtes, seconds membres de l'étape 2.
  const { aretes, e0, debutPochoir, pochoir, ab } = sys;
  for (let e = 0; e < E; e++) {
    let c = 0;
    let s = 0;
    for (let q = debutPochoir[e]!; q < debutPochoir[e + 1]!; q++) {
      const m = pochoir[q]!;
      const a = ab[2 * q]!;
      const b = ab[2 * q + 1]!;
      const x = v1[2 * m]!;
      const y = v1[2 * m + 1]!;
      c += a * x + b * y;
      s += b * x - a * y;
    }
    const r = Math.hypot(c, s);
    if (r < 1e-12) {
      c = 1;
      s = 0;
    } else {
      c /= r;
      s /= r;
    }
    const ex = e0[2 * e]!;
    const ey = e0[2 * e + 1]!;
    const fx = c * ex + s * ey;
    const fy = -s * ex + c * ey;
    const i = aretes[2 * e]!;
    const j = aretes[2 * e + 1]!;
    rx[i] -= fx;
    rx[j] += fx;
    ry[i] -= fy;
    ry[j] += fy;
  }
  // Étape 2 : rotations seules (séparable en x et y).
  resoudreProfil(sys.n2, rx, rx, t2);
  resoudreProfil(sys.n2, ry, ry, t2);
  for (let v = 0; v < V; v++) {
    sortie[2 * v] = rx[v]!;
    sortie[2 * v + 1] = ry[v]!;
  }
  return sortie;
}

/**
 * Localise un point dans un maillage : triangle qui le contient (le mieux centré à égalité), sinon le plus proche
 * (barycentriques bornées : le point du maillage le plus proche). `filtre` restreint les triangles admissibles.
 * Renvoie la poignée et le point effectivement épinglé (sur le maillage), ou `null` si aucun triangle admissible.
 */
export function localiserPoint(
  positions: ArrayLike<number>,
  triangles: ArrayLike<number>,
  x: number,
  y: number,
  filtre?: (t: number) => boolean,
  distanceMax = Infinity,
): { poignee: PoigneeArap; point: Vec2; distance: number } | null {
  let meilleur: { poignee: PoigneeArap; point: Vec2; distance: number; score: number } | null = null;
  for (let t = 0; t < triangles.length / 3; t++) {
    if (filtre && !filtre(t)) continue;
    const a = triangles[3 * t]!;
    const b = triangles[3 * t + 1]!;
    const c = triangles[3 * t + 2]!;
    const ax = positions[2 * a]!;
    const ay = positions[2 * a + 1]!;
    const bx = positions[2 * b]!;
    const by = positions[2 * b + 1]!;
    const cx = positions[2 * c]!;
    const cy = positions[2 * c + 1]!;
    const l = barycentriques(x, y, ax, ay, bx, by, cx, cy);
    if (!l) continue;
    let poids: [number, number, number] = l;
    let point: Vec2 = { x, y };
    let distance = 0;
    const minL = Math.min(l[0], l[1], l[2]);
    if (minL < -1e-12) {
      // Point le plus proche du triangle (sur un côté ou un sommet).
      const proj = (px: number, py: number, qx: number, qy: number): [number, number, number] => {
        const dx = qx - px;
        const dy = qy - py;
        const L2 = dx * dx + dy * dy;
        const u = L2 > 0 ? Math.min(1, Math.max(0, ((x - px) * dx + (y - py) * dy) / L2)) : 0;
        return [u, px + u * dx, py + u * dy];
      };
      const cotes: Array<[number, number, number, [number, number, number]]> = [];
      const [u0, x0, y0] = proj(ax, ay, bx, by);
      cotes.push([Math.hypot(x - x0, y - y0), x0, y0, [1 - u0, u0, 0]]);
      const [u1, x1, y1] = proj(bx, by, cx, cy);
      cotes.push([Math.hypot(x - x1, y - y1), x1, y1, [0, 1 - u1, u1]]);
      const [u2, x2, y2] = proj(cx, cy, ax, ay);
      cotes.push([Math.hypot(x - x2, y - y2), x2, y2, [u2, 0, 1 - u2]]);
      cotes.sort((p, q) => p[0] - q[0]);
      distance = cotes[0]![0];
      point = { x: cotes[0]![1], y: cotes[0]![2] };
      poids = cotes[0]![3];
    }
    if (distance > distanceMax) continue;
    const score = distance > 0 ? -distance : minL;
    if (!meilleur || score > meilleur.score + 1e-12) meilleur = { poignee: { sommets: [a, b, c], poids }, point, distance, score };
  }
  return meilleur ? { poignee: meilleur.poignee, point: meilleur.point, distance: meilleur.distance } : null;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ARAP d'un rig : maillage de contrôle, poignées = articulations, attache à la peau, plongement du maillage fin
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Réglages de l'ARAP d'un rig. */
export interface OptionsArapRig {
  /** Sommets du maillage de contrôle (défaut 600 ; 0 = maillage complet). */
  controle?: number;
  /** Poignées au milieu des os des membres et du torse (défaut oui). */
  poigneesMilieu?: boolean;
  /** Attache à la peau : `'defaut'` (λ par partie), un λ uniforme, ou 0 (ARAP pur). */
  attache?: 'defaut' | number;
  /** Couper les arêtes entre parties distantes de ≥ 2 dans l'arbre (défaut oui). */
  couper?: boolean;
  /** Peau de référence de l'attache (défaut : celle du maillage, CoR s'il a des centres). */
  peau?: MethodePeau;
  /** Poids des poignées (défaut 1000). */
  w?: number;
}

/** λ d'attache par os de base (sans côté). */
const ATTACHE_PAR_OS: Readonly<Record<string, number>> = {
  tete: 3,
  cou: 1,
  main: 0.6,
  pied: 0.6,
  bassin: 0.25,
  torse: 0.25,
  ventre: 0.25,
  poitrine: 0.25,
  epaule: 0.2,
  bras: 0.06,
  avantBras: 0.06,
  cuisse: 0.06,
  jambe: 0.06,
};

function osDeBase(nom: string): string {
  return /^(epaule|bras|avantBras|main|cuisse|jambe|pied)[GD]$/.test(nom) ? nom.slice(0, -1) : nom;
}

/** Poignée d'un rig : point de repos (sur le maillage de contrôle) porté par un os. */
export interface PoigneeRig {
  os: number;
  repos: Vec2;
  poignee: PoigneeArap;
}

/** ARAP préparé pour un rig. */
export interface ArapRig {
  readonly systeme: SystemeArap;
  /** Indice fin de chaque sommet de contrôle. */
  readonly garde: Int32Array;
  readonly triangles: Int32Array;
  readonly poignees: readonly PoigneeRig[];
  readonly plongement: Plongement;
  /** Sous-maillage (sommets de contrôle) pour la peau de référence. */
  readonly sousMaillage: Maillage;
  /** Diagnostic : composantes de contrôle et poignées par composante. */
  readonly composantes: number;
  readonly poigneesParComposante: readonly number[];
  readonly dureePreparationMs: number;
}

const CACHE_RIG = new WeakMap<CharacterRig, Map<string, ArapRig>>();

/** Partie (index d'os) de chaque sommet fin : `maillage.partie`, sinon l'influence dominante. */
function partiesFines(rig: CharacterRig): Int32Array {
  const m = rig.maillage;
  const V = m.positions.length / 2;
  const r = new Int32Array(V);
  if (m.partie && m.partie.length === V) {
    for (let v = 0; v < V; v++) r[v] = m.partie[v]!;
    return r;
  }
  for (let v = 0; v < V; v++) {
    let best = -1;
    let wb = -1;
    for (let s = 0; s < 4; s++) {
      const os = m.influences[4 * v + s] ?? -1;
      const w = m.poids[4 * v + s] ?? 0;
      if (os >= 0 && w > wb) {
        wb = w;
        best = os;
      }
    }
    r[v] = Math.max(0, best);
  }
  return r;
}

/** Prépare (une fois, mémoïsé par rig et options) l'ARAP d'un rig. */
export function preparerArapRig(rig: CharacterRig, options: OptionsArapRig = {}): ArapRig {
  const cle = JSON.stringify(options);
  let parOptions = CACHE_RIG.get(rig);
  if (!parOptions) CACHE_RIG.set(rig, (parOptions = new Map()));
  const deja = parOptions.get(cle);
  if (deja) return deja;
  const debut = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const m = rig.maillage;
  const sq = rig.squelette;
  const idx = indexerSquelette(sq);
  const positions = Float64Array.from(m.positions);
  const V = positions.length / 2;
  const cible = options.controle ?? 600;
  const controle = cible > 0 ? decimerMaillage(positions, m.indices, cible) : decimerMaillage(positions, m.indices, Infinity);
  const { garde, triangles } = controle;
  const Vc = garde.length;
  const posC = new Float64Array(2 * Vc);
  for (let k = 0; k < Vc; k++) {
    posC[2 * k] = positions[2 * garde[k]!]!;
    posC[2 * k + 1] = positions[2 * garde[k]! + 1]!;
  }
  const parties = partiesFines(rig);
  const partieC = new Int32Array(Vc);
  for (let k = 0; k < Vc; k++) partieC[k] = parties[garde[k]!]!;
  const compC = composantesSommets(Vc, triangles);
  const nbComp = compC.reduce((a, c) => Math.max(a, c + 1), 0);
  const H = rig.hauteurPx > 0 ? rig.hauteurPx : 1000;
  const rayon = 0.05 * H;
  // Points d'articulation : pivots (os et parent admissibles), bouts des os feuilles, milieux des os longs.
  interface PointSquelette {
    os: number;
    p: Vec2;
    admis: Set<number>;
  }
  const points: PointSquelette[] = [];
  const milieu = options.poigneesMilieu ?? true;
  sq.os.forEach((o, b) => {
    const parent = idx.parents[b]!;
    const admis = new Set<number>([b]);
    if (parent >= 0) admis.add(parent);
    points.push({ os: b, p: { ...o.pivot }, admis });
    const bout = { x: o.pivot.x + Math.cos(o.angleRepos) * o.longueur, y: o.pivot.y + Math.sin(o.angleRepos) * o.longueur };
    if (idx.enfants[b]!.length === 0) points.push({ os: b, p: bout, admis: new Set([b]) });
    const base = osDeBase(o.nom);
    if (milieu && ['bras', 'avantBras', 'cuisse', 'jambe', 'torse'].includes(base)) {
      points.push({ os: b, p: { x: (o.pivot.x + bout.x) / 2, y: (o.pivot.y + bout.y) / 2 }, admis: new Set([b]) });
    }
  });
  const poignees: PoigneeRig[] = [];
  const parComp = new Array<number>(nbComp).fill(0);
  for (const ps of points) {
    for (let c = 0; c < nbComp; c++) {
      const r = localiserPoint(
        posC,
        triangles,
        ps.p.x,
        ps.p.y,
        (t) => {
          const a = triangles[3 * t]!;
          if (compC[a] !== c) return false;
          return ps.admis.has(partieC[a]!) && ps.admis.has(partieC[triangles[3 * t + 1]!]!) && ps.admis.has(partieC[triangles[3 * t + 2]!]!);
        },
        rayon,
      );
      if (!r) continue;
      poignees.push({ os: ps.os, repos: r.point, poignee: r.poignee });
      parComp[c]!++;
    }
  }
  // Attache à la peau.
  let attache: Float64Array | undefined;
  const choix = options.attache ?? 'defaut';
  if (choix === 'defaut' || (typeof choix === 'number' && choix > 0)) {
    attache = new Float64Array(Vc);
    for (let k = 0; k < Vc; k++) {
      const os = sq.os[partieC[k]!];
      const l = typeof choix === 'number' ? choix : os ? (ATTACHE_PAR_OS[osDeBase(os.nom)] ?? 0.3) : 0.3;
      attache[k] = l * l;
    }
  }
  const couper = options.couper ?? true;
  const distances = new Map<number, number>();
  const distanceParties = (a: number, b: number): number => {
    if (a === b) return 0;
    const cleD = a < b ? a * 4096 + b : b * 4096 + a;
    let d = distances.get(cleD);
    if (d === undefined) distances.set(cleD, (d = distanceArborescente(idx, a, b)));
    return d;
  };
  const systeme = construireSystemeArap(
    posC,
    triangles,
    poignees.map((p) => p.poignee),
    {
      ...(options.w !== undefined ? { w: options.w } : {}),
      ...(attache ? { attache } : {}),
      ...(couper ? { areteActive: (i: number, j: number) => distanceParties(partieC[i]!, partieC[j]!) <= 1 } : {}),
    },
  );
  const plongement = plongerSommets(positions, m.indices, controle);
  // Sous-maillage des sommets de contrôle (peau de référence de l'attache).
  const sousMaillage: Maillage = { positions: [], uvs: [], indices: [], influences: [], poids: [] };
  const centres: number[] = [];
  for (let k = 0; k < Vc; k++) {
    const v = garde[k]!;
    sousMaillage.positions.push(positions[2 * v]!, positions[2 * v + 1]!);
    for (let s = 0; s < 4; s++) {
      sousMaillage.influences.push(m.influences[4 * v + s] ?? -1);
      sousMaillage.poids.push(m.poids[4 * v + s] ?? 0);
    }
    if (m.centresRotation && m.centresRotation.length === 2 * V) centres.push(m.centresRotation[2 * v]!, m.centresRotation[2 * v + 1]!);
  }
  if (centres.length === 2 * Vc) sousMaillage.centresRotation = centres;
  const fin = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const r: ArapRig = {
    systeme,
    garde,
    triangles,
    poignees,
    plongement,
    sousMaillage,
    composantes: nbComp,
    poigneesParComposante: parComp,
    dureePreparationMs: fin - debut,
  };
  parOptions.set(cle, r);
  return r;
}

/** Tampons par ARAP de rig (cibles, sortie de contrôle). */
const TAMPONS_RIG = new WeakMap<ArapRig, { cibles: Float64Array; controle: Float64Array }>();

/**
 * Positions déformées par ARAP (2V, px image, AVANT la racine), à partir de l'état FK. Même contrat que
 * `deformerSommets`. Au repos, renvoie exactement les positions de repos.
 */
export function deformerArap(rig: CharacterRig, etat: EtatSquelette, sortie?: Float32Array, options: OptionsArapRig = {}): Float32Array {
  const a = preparerArapRig(rig, options);
  const sys = a.systeme;
  const V = rig.maillage.positions.length / 2;
  const out = sortie && sortie.length === 2 * V ? sortie : new Float32Array(2 * V);
  let tp = TAMPONS_RIG.get(a);
  if (!tp) TAMPONS_RIG.set(a, (tp = { cibles: new Float64Array(2 * a.poignees.length), controle: new Float64Array(2 * sys.V) }));
  const { cibles, controle } = tp;
  let ecart = 0;
  a.poignees.forEach((p, h) => {
    const K = etat.peau[p.os]!;
    const x = K.a * p.repos.x + K.c * p.repos.y + K.tx;
    const y = K.b * p.repos.x + K.d * p.repos.y + K.ty;
    cibles[2 * h] = x;
    cibles[2 * h + 1] = y;
    ecart = Math.max(ecart, Math.abs(x - p.repos.x), Math.abs(y - p.repos.y));
  });
  const reference = sys.attache ? deformerSommets(a.sousMaillage, rig.squelette, etat, options.peau) : null;
  if (reference) for (let k = 0; k < sys.V; k++) ecart = Math.max(ecart, Math.abs(reference[2 * k]! - sys.repos[2 * k]!), Math.abs(reference[2 * k + 1]! - sys.repos[2 * k + 1]!));
  const pos = rig.maillage.positions;
  if (ecart < 1e-9) {
    // Repos exact (aucune erreur d'arrondi du solveur).
    for (let i = 0; i < 2 * V; i++) out[i] = pos[i]!;
    return out;
  }
  resoudreArap(sys, cibles, controle, reference ?? undefined);
  const { sommets, poids } = a.plongement;
  for (let v = 0; v < V; v++) {
    let x = 0;
    let y = 0;
    for (let k = 0; k < 3; k++) {
      const c = sommets[3 * v + k]!;
      const w = poids[3 * v + k]!;
      if (w === 0) continue;
      x += w * controle[2 * c]!;
      y += w * controle[2 * c + 1]!;
    }
    out[2 * v] = x;
    out[2 * v + 1] = y;
  }
  return out;
}
