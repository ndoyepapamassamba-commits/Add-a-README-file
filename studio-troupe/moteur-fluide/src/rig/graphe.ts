/**
 * Outils de graphe sur un maillage triangulaire : adjacence compacte (CSR), Dijkstra multi-sources borné,
 * laplacien cotangent à poids positifs et gradient conjugué préconditionné (Jacobi). Module pur.
 */

/** Adjacence compacte d'un maillage. */
export interface Adjacence {
  readonly n: number;
  /** Début des voisins du sommet i dans `voisins` (n + 1 entrées). */
  readonly debut: Int32Array;
  readonly voisins: Int32Array;
  /** Longueur de l'arête correspondante. */
  readonly longueurs: Float64Array;
  /** Poids du laplacien cotangent (≥ plancher), même disposition que `voisins`. */
  readonly cotangentes: Float64Array;
}

/** Construit l'adjacence (arêtes uniques) et les poids cotangents d'un maillage. */
export function construireAdjacence(positions: ArrayLike<number>, triangles: ArrayLike<number>, n: number): Adjacence {
  const parSommet: Array<Map<number, number>> = Array.from({ length: n }, () => new Map());
  const ajouterCot = (u: number, v: number, w: number): void => {
    parSommet[u]!.set(v, (parSommet[u]!.get(v) ?? 0) + w);
    parSommet[v]!.set(u, (parSommet[v]!.get(u) ?? 0) + w);
  };
  for (let t = 0; t < triangles.length; t += 3) {
    const ids = [triangles[t]!, triangles[t + 1]!, triangles[t + 2]!];
    for (let e = 0; e < 3; e++) {
      const o = ids[e]!; // sommet opposé à l'arête (u, v)
      const u = ids[(e + 1) % 3]!;
      const v = ids[(e + 2) % 3]!;
      const ux = positions[2 * u]! - positions[2 * o]!;
      const uy = positions[2 * u + 1]! - positions[2 * o + 1]!;
      const vx = positions[2 * v]! - positions[2 * o]!;
      const vy = positions[2 * v + 1]! - positions[2 * o + 1]!;
      const croix = Math.abs(ux * vy - uy * vx);
      const cot = croix > 1e-12 ? (ux * vx + uy * vy) / croix : 0;
      ajouterCot(u, v, 0.5 * cot);
    }
  }
  const debut = new Int32Array(n + 1);
  let total = 0;
  for (let i = 0; i < n; i++) {
    debut[i] = total;
    total += parSommet[i]!.size;
  }
  debut[n] = total;
  const voisins = new Int32Array(total);
  const longueurs = new Float64Array(total);
  const cotangentes = new Float64Array(total);
  let somme = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    let k = debut[i]!;
    for (const [j, w] of parSommet[i]!) {
      voisins[k] = j;
      longueurs[k] = Math.hypot(positions[2 * j]! - positions[2 * i]!, positions[2 * j + 1]! - positions[2 * i + 1]!);
      cotangentes[k] = w;
      if (w > 0) {
        somme += w;
        nb++;
      }
      k++;
    }
  }
  // Plancher positif : principe du maximum garanti (poids dans [0, 1], partition de l'unité).
  const plancher = 1e-3 * (nb ? somme / nb : 1);
  for (let k = 0; k < total; k++) if (!(cotangentes[k]! > plancher)) cotangentes[k] = plancher;
  return { n, debut, voisins, longueurs, cotangentes };
}

/** Tas binaire minimal (clé réelle, valeur entière). */
class Tas {
  private cles: number[] = [];
  private vals: number[] = [];
  get taille(): number {
    return this.cles.length;
  }
  pousser(cle: number, val: number): void {
    this.cles.push(cle);
    this.vals.push(val);
    let i = this.cles.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cles[p]! <= this.cles[i]!) break;
      [this.cles[p], this.cles[i]] = [this.cles[i]!, this.cles[p]!];
      [this.vals[p], this.vals[i]] = [this.vals[i]!, this.vals[p]!];
      i = p;
    }
  }
  extraire(): [number, number] {
    const cle = this.cles[0]!;
    const val = this.vals[0]!;
    const dc = this.cles.pop()!;
    const dv = this.vals.pop()!;
    if (this.cles.length) {
      this.cles[0] = dc;
      this.vals[0] = dv;
      let i = 0;
      for (;;) {
        const g = 2 * i + 1;
        const d = g + 1;
        let m = i;
        if (g < this.cles.length && this.cles[g]! < this.cles[m]!) m = g;
        if (d < this.cles.length && this.cles[d]! < this.cles[m]!) m = d;
        if (m === i) break;
        [this.cles[m], this.cles[i]] = [this.cles[i]!, this.cles[m]!];
        [this.vals[m], this.vals[i]] = [this.vals[i]!, this.vals[m]!];
        i = m;
      }
    }
    return [cle, val];
  }
}

/**
 * Dijkstra multi-sources sur les arêtes du maillage. `sources` : (sommet, distance initiale, étiquette).
 * `permis(v)` restreint les sommets traversés ; `limite` coupe la propagation.
 * Renvoie distances (∞ si non atteint) et étiquette de la source la plus proche (−1 si non atteint).
 */
export function dijkstra(
  adj: Adjacence,
  sources: ReadonlyArray<readonly [sommet: number, distance: number, etiquette: number]>,
  permis: (v: number) => boolean = () => true,
  limite = Number.POSITIVE_INFINITY,
): { distances: Float64Array; etiquettes: Int32Array } {
  const distances = new Float64Array(adj.n).fill(Number.POSITIVE_INFINITY);
  const etiquettes = new Int32Array(adj.n).fill(-1);
  const tas = new Tas();
  for (const [s, d, e] of sources) {
    if (d < distances[s]!) {
      distances[s] = d;
      etiquettes[s] = e;
      tas.pousser(d, s);
    }
  }
  while (tas.taille) {
    const [d, u] = tas.extraire();
    if (d > distances[u]!) continue;
    for (let k = adj.debut[u]!; k < adj.debut[u + 1]!; k++) {
      const v = adj.voisins[k]!;
      if (!permis(v)) continue;
      const nd = d + adj.longueurs[k]!;
      if (nd < distances[v]! && nd <= limite) {
        distances[v] = nd;
        etiquettes[v] = etiquettes[u]!;
        tas.pousser(nd, v);
      }
    }
  }
  return { distances, etiquettes };
}

/**
 * Résout `A·x = b` (A symétrique définie positive, donnée par produit `appliquer`) par gradient conjugué
 * préconditionné par la diagonale. Renvoie le nombre d'itérations.
 */
export function gradientConjugue(
  appliquer: (x: Float64Array, sortie: Float64Array) => void,
  diagonale: Float64Array,
  b: Float64Array,
  x: Float64Array,
  tolerance = 1e-10,
  maxIter = 5000,
): number {
  const n = b.length;
  const r = new Float64Array(n);
  const z = new Float64Array(n);
  const p = new Float64Array(n);
  const Ap = new Float64Array(n);
  appliquer(x, Ap);
  let normeB = 0;
  for (let i = 0; i < n; i++) {
    r[i] = b[i]! - Ap[i]!;
    normeB += b[i]! * b[i]!;
  }
  normeB = Math.sqrt(normeB) || 1;
  let rz = 0;
  for (let i = 0; i < n; i++) {
    z[i] = r[i]! / diagonale[i]!;
    p[i] = z[i]!;
    rz += r[i]! * z[i]!;
  }
  let it = 0;
  for (; it < maxIter; it++) {
    let nr = 0;
    for (let i = 0; i < n; i++) nr += r[i]! * r[i]!;
    if (Math.sqrt(nr) <= tolerance * normeB) break;
    appliquer(p, Ap);
    let pAp = 0;
    for (let i = 0; i < n; i++) pAp += p[i]! * Ap[i]!;
    if (!(pAp > 0)) break;
    const alpha = rz / pAp;
    let rzNouveau = 0;
    for (let i = 0; i < n; i++) {
      x[i] = x[i]! + alpha * p[i]!;
      r[i] = r[i]! - alpha * Ap[i]!;
      z[i] = r[i]! / diagonale[i]!;
      rzNouveau += r[i]! * z[i]!;
    }
    const beta = rzNouveau / rz;
    rz = rzNouveau;
    for (let i = 0; i < n; i++) p[i] = z[i]! + beta * p[i]!;
  }
  return it;
}
