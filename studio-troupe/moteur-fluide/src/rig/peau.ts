/**
 * Skinning : positions déformées des sommets à partir de l'état FK du squelette. Module pur, rapide (tableaux typés
 * préparés une fois par maillage et mémoïsés).
 *
 * Deux méthodes :
 * - `lbs` (linear blend skinning) : `v' = Σ w_j·K_j(v)`. Exact pour les sommets à une seule influence ; s'effondre au
 *   coude au-delà d'environ 60° (rayon extérieur à 50 % à 120°, mesuré dans la note de veille 02).
 * - `cor` (défaut quand le maillage porte des centres de rotation) : skinning à centres de rotation optimisés
 *   (Le & Hodgins 2016), ramené au plan. Pour un sommet à plusieurs influences, de centre p* précalculé :
 *   rotation mélangée `θ = θ_ref + Σ w_j·enrouler(θ_j − θ_ref)` (moyenne exacte des angles dans le plan),
 *   translation `q = Σ w_j·K_j(p*)`, et `v' = q + R(θ)·(v_s − p*_s)`, où `v_s = Σ w_j·S_j(v)` est le sommet après
 *   mélange LINÉAIRE des étirements propres des os (proches de l'identité) et `p*_s` son équivalent pour p*.
 *   Les sommets rigides (une influence, ou centre absent) restent en LBS exact.
 *   Au repos, les deux méthodes rendent exactement les positions de repos.
 */
import type { Maillage, Squelette } from '../timeline/types';
import type { EtatSquelette } from './fk';

/** Méthode de skinning. */
export type MethodePeau = 'lbs' | 'cor';

/** Données d'un maillage converties en tableaux typés (mémoïsées par maillage). */
export interface MaillagePrepare {
  readonly n: number;
  readonly positions: Float64Array;
  readonly influences: Int32Array;
  readonly poids: Float64Array;
  /** Centres CoR (NaN = rigide), présents si le maillage en porte. */
  readonly centres: Float64Array | null;
  /** Nombre d'influences non nulles par sommet. */
  readonly nbInfluences: Uint8Array;
}

const CACHE = new WeakMap<Maillage, MaillagePrepare>();

/** Prépare (une fois) les tableaux typés d'un maillage. */
export function preparerMaillage(m: Maillage): MaillagePrepare {
  const deja = CACHE.get(m);
  if (deja) return deja;
  const n = m.positions.length / 2;
  const positions = Float64Array.from(m.positions);
  const influences = new Int32Array(4 * n);
  const poids = new Float64Array(4 * n);
  const nbInfluences = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    let k = 0;
    for (let s = 0; s < 4; s++) {
      const os = m.influences[4 * v + s] ?? -1;
      const w = m.poids[4 * v + s] ?? 0;
      if (os >= 0 && w > 0) {
        influences[4 * v + k] = os;
        poids[4 * v + k] = w;
        k++;
      }
    }
    for (let s = k; s < 4; s++) influences[4 * v + s] = -1;
    nbInfluences[v] = k;
  }
  let centres: Float64Array | null = null;
  if (m.centresRotation && m.centresRotation.length === 2 * n) {
    centres = new Float64Array(2 * n);
    for (let i = 0; i < 2 * n; i++) {
      const c = m.centresRotation[i];
      centres[i] = typeof c === 'number' && Number.isFinite(c) ? c : Number.NaN; // null (JSON) → NaN
    }
  }
  const p: MaillagePrepare = { n, positions, influences, poids, centres, nbInfluences };
  CACHE.set(m, p);
  return p;
}

function enrouler(a: number): number {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  else if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

/**
 * Positions déformées (2V, px image, avant la racine). `sortie` peut être fourni pour éviter une allocation.
 * Méthode par défaut : `cor` si le maillage a des centres de rotation, sinon `lbs`.
 */
export function deformerSommets(
  maillage: Maillage,
  squelette: Squelette,
  etat: EtatSquelette,
  methode?: MethodePeau,
  sortie?: Float32Array,
): Float32Array {
  const m = preparerMaillage(maillage);
  const nOs = squelette.os.length;
  const out = sortie && sortie.length === 2 * m.n ? sortie : new Float32Array(2 * m.n);
  // Matrices aplaties (6 flottants par os) : peau K et rigide M.
  const K = new Float64Array(6 * nOs);
  const M = new Float64Array(6 * nOs);
  for (let j = 0; j < nOs; j++) {
    const k = etat.peau[j]!;
    K.set([k.a, k.b, k.c, k.d, k.tx, k.ty], 6 * j);
    const r = etat.rigide[j]!;
    M.set([r.a, r.b, r.c, r.d, r.tx, r.ty], 6 * j);
  }
  const utiliserCor = (methode ?? (m.centres ? 'cor' : 'lbs')) === 'cor' && m.centres !== null;
  const etire = etat.etire;
  const angles = etat.angles;
  const pos = m.positions;
  const inf = m.influences;
  const w = m.poids;
  for (let v = 0; v < m.n; v++) {
    const x = pos[2 * v]!;
    const y = pos[2 * v + 1]!;
    const nb = m.nbInfluences[v]!;
    const cx = utiliserCor && nb > 1 ? m.centres![2 * v]! : Number.NaN;
    if (Number.isNaN(cx)) {
      // LBS : v' = Σ w_j K_j v.
      let ox = 0;
      let oy = 0;
      for (let s = 0; s < nb; s++) {
        const j = inf[4 * v + s]!;
        const wj = w[4 * v + s]!;
        const o = 6 * j;
        ox += wj * (K[o]! * x + K[o + 2]! * y + K[o + 4]!);
        oy += wj * (K[o + 1]! * x + K[o + 3]! * y + K[o + 5]!);
      }
      if (nb === 0) {
        ox = x;
        oy = y;
      }
      out[2 * v] = ox;
      out[2 * v + 1] = oy;
      continue;
    }
    const cy = m.centres![2 * v + 1]!;
    // Rotation mélangée (moyenne des angles autour de l'os dominant).
    let jRef = inf[4 * v]!;
    let wRef = w[4 * v]!;
    for (let s = 1; s < nb; s++) {
      if (w[4 * v + s]! > wRef) {
        wRef = w[4 * v + s]!;
        jRef = inf[4 * v + s]!;
      }
    }
    const thetaRef = angles[jRef]!;
    let theta = thetaRef;
    let qx = 0;
    let qy = 0;
    let vsx = 0;
    let vsy = 0;
    let psx = 0;
    let psy = 0;
    for (let s = 0; s < nb; s++) {
      const j = inf[4 * v + s]!;
      const wj = w[4 * v + s]!;
      theta += wj * enrouler(angles[j]! - thetaRef);
      const o = 6 * j;
      qx += wj * (K[o]! * cx + K[o + 2]! * cy + K[o + 4]!);
      qy += wj * (K[o + 1]! * cx + K[o + 3]! * cy + K[o + 5]!);
      if (etire) {
        // Étirement seul S_j = M_j⁻¹ ∘ K_j (M_j rigide : inverse = transposée).
        const kx = K[o]! * x + K[o + 2]! * y + K[o + 4]! - M[o + 4]!;
        const ky = K[o + 1]! * x + K[o + 3]! * y + K[o + 5]! - M[o + 5]!;
        vsx += wj * (M[o]! * kx + M[o + 1]! * ky);
        vsy += wj * (M[o + 2]! * kx + M[o + 3]! * ky);
        const kcx = K[o]! * cx + K[o + 2]! * cy + K[o + 4]! - M[o + 4]!;
        const kcy = K[o + 1]! * cx + K[o + 3]! * cy + K[o + 5]! - M[o + 5]!;
        psx += wj * (M[o]! * kcx + M[o + 1]! * kcy);
        psy += wj * (M[o + 2]! * kcx + M[o + 3]! * kcy);
      }
    }
    if (!etire) {
      vsx = x;
      vsy = y;
      psx = cx;
      psy = cy;
    }
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const dx = vsx - psx;
    const dy = vsy - psy;
    out[2 * v] = qx + c * dx - s * dy;
    out[2 * v + 1] = qy + s * dx + c * dy;
  }
  return out;
}
