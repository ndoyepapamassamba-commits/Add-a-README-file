/**
 * Algèbre creuse minimale pour les systèmes symétriques définis positifs du moteur (ARAP) : assemblage par
 * coefficients, ordre de Cuthill-McKee inverse (réduit la largeur de bande), factorisation de Cholesky « en ligne de
 * ciel » (stockage par profil : le remplissage reste dans l'enveloppe), descente et remontée.
 *
 * Écrit depuis la description classique des algorithmes (George & Liu, « Computer Solution of Large Sparse Positive
 * Definite Systems », 1981) : aucun code tiers. Module pur, déterministe (aucun ordre de parcours de table de
 * hachage n'influe sur le résultat), embarquable dans la page de rendu.
 */

/** Matrice symétrique en cours d'assemblage : seuls les coefficients `i ≥ j` sont stockés (et additionnés). */
export class MatriceSymetrique {
  readonly n: number;
  private readonly lignes: Array<Map<number, number>>;

  constructor(n: number) {
    this.n = n;
    this.lignes = Array.from({ length: n }, () => new Map<number, number>());
  }

  /** Ajoute `v` au coefficient (i, j) (et donc à (j, i)). */
  ajouter(i: number, j: number, v: number): void {
    if (v === 0) return;
    const a = i >= j ? i : j;
    const b = i >= j ? j : i;
    const l = this.lignes[a]!;
    l.set(b, (l.get(b) ?? 0) + v);
  }

  /** Coefficient (i, j). */
  lire(i: number, j: number): number {
    const a = i >= j ? i : j;
    const b = i >= j ? j : i;
    return this.lignes[a]!.get(b) ?? 0;
  }

  /** Coefficients de la ligne `i` en dessous de la diagonale (colonnes `j ≤ i`), triés par colonne. */
  ligneInferieure(i: number): Array<[number, number]> {
    return [...this.lignes[i]!.entries()].sort((x, y) => x[0] - y[0]);
  }

  /** Produit `y = A·x` (contrôles). */
  produit(x: ArrayLike<number>, y: Float64Array = new Float64Array(this.n)): Float64Array {
    y.fill(0);
    for (let i = 0; i < this.n; i++) {
      for (const [j, v] of this.lignes[i]!) {
        y[i] += v * x[j]!;
        if (j !== i) y[j] += v * x[i]!;
      }
    }
    return y;
  }
}

/**
 * Ordre de Cuthill-McKee inverse. `voisins[i]` : voisins de i (sans i). Renvoie `perm` (nouvel indice → ancien).
 * Chaque composante part d'un sommet pseudo-périphérique (George-Liu) ; à égalité, le plus petit indice (déterminisme).
 */
export function ordreCuthillMcKeeInverse(voisins: ReadonlyArray<ReadonlyArray<number>>): Int32Array {
  const n = voisins.length;
  const degre = new Int32Array(n);
  for (let i = 0; i < n; i++) degre[i] = voisins[i]!.length;
  const tries = voisins.map((v) => [...v].sort((a, b) => degre[a]! - degre[b]! || a - b));
  const vu = new Uint8Array(n);
  const ordre: number[] = [];
  const niveaux = (depart: number, marque: Uint8Array): { dernier: number[]; profondeur: number } => {
    // Parcours en largeur limité à la composante : renvoie le dernier niveau et la profondeur.
    marque.fill(0);
    let courant = [depart];
    marque[depart] = 1;
    let profondeur = 0;
    for (;;) {
      const suivant: number[] = [];
      for (const u of courant) {
        for (const w of tries[u]!) {
          if (!marque[w]) {
            marque[w] = 1;
            suivant.push(w);
          }
        }
      }
      if (suivant.length === 0) return { dernier: courant, profondeur };
      courant = suivant;
      profondeur++;
    }
  };
  const marque = new Uint8Array(n);
  const indices = Array.from({ length: n }, (_, i) => i).sort((a, b) => degre[a]! - degre[b]! || a - b);
  for (const s of indices) {
    if (vu[s]) continue;
    // Sommet pseudo-périphérique : on part du degré minimal et on s'éloigne tant que la profondeur augmente.
    let depart = s;
    let { dernier, profondeur } = niveaux(depart, marque);
    for (let essai = 0; essai < 6; essai++) {
      let candidat = dernier[0]!;
      for (const x of dernier) if (degre[x]! < degre[candidat]! || (degre[x] === degre[candidat] && x < candidat)) candidat = x;
      const r = niveaux(candidat, marque);
      if (r.profondeur <= profondeur) break;
      depart = candidat;
      dernier = r.dernier;
      profondeur = r.profondeur;
    }
    // Cuthill-McKee depuis `depart`.
    const file = [depart];
    vu[depart] = 1;
    for (let k = 0; k < file.length; k++) {
      const u = file[k]!;
      ordre.push(u);
      for (const w of tries[u]!) {
        if (!vu[w]) {
          vu[w] = 1;
          file.push(w);
        }
      }
    }
  }
  const perm = new Int32Array(n);
  for (let k = 0; k < n; k++) perm[k] = ordre[n - 1 - k]!;
  return perm;
}

/** Facteur de Cholesky `PᵀAP = L·Lᵀ` stocké par profil (lignes de L de la première colonne non nulle à la diagonale). */
export interface FacteurProfil {
  readonly n: number;
  /** Nouvel indice → ancien. */
  readonly perm: Int32Array;
  /** Première colonne stockée de chaque ligne (indices permutés). */
  readonly debut: Int32Array;
  /** Position dans `val` du coefficient (i, debut[i]). */
  readonly decalage: Int32Array;
  /** Coefficients de L, ligne par ligne ; le dernier de chaque ligne est la diagonale. */
  readonly val: Float64Array;
  /** Taille de l'enveloppe (nombre de coefficients stockés). */
  readonly enveloppe: number;
}

/** Erreur levée quand la matrice n'est pas définie positive (pivot ≤ 0). */
export class MatriceNonDefiniePositive extends Error {}

/**
 * Factorise une matrice symétrique définie positive. `perm` facultatif (défaut : Cuthill-McKee inverse sur le motif
 * de la matrice). Coût : O(Σ largeur de ligne²).
 */
export function factoriserProfil(A: MatriceSymetrique, permDonnee?: Int32Array): FacteurProfil {
  const n = A.n;
  const lignes = Array.from({ length: n }, (_, i) => A.ligneInferieure(i));
  let perm = permDonnee;
  if (!perm) {
    const voisins: number[][] = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      for (const [j] of lignes[i]!) {
        if (j === i) continue;
        voisins[i]!.push(j);
        voisins[j]!.push(i);
      }
    }
    perm = ordreCuthillMcKeeInverse(voisins);
  }
  const inv = new Int32Array(n);
  for (let k = 0; k < n; k++) inv[perm[k]!] = k;
  // Profil dans l'ordre permuté.
  const debut = new Int32Array(n);
  for (let k = 0; k < n; k++) debut[k] = k;
  for (let i = 0; i < n; i++) {
    for (const [j] of lignes[i]!) {
      const a = inv[i]!;
      const b = inv[j]!;
      const hi = a > b ? a : b;
      const lo = a > b ? b : a;
      if (lo < debut[hi]!) debut[hi] = lo;
    }
  }
  const decalage = new Int32Array(n + 1);
  for (let k = 0; k < n; k++) decalage[k + 1] = decalage[k]! + (k - debut[k]! + 1);
  const val = new Float64Array(decalage[n]!);
  for (let i = 0; i < n; i++) {
    for (const [j, v] of lignes[i]!) {
      const a = inv[i]!;
      const b = inv[j]!;
      const hi = a > b ? a : b;
      const lo = a > b ? b : a;
      val[decalage[hi]! + (lo - debut[hi]!)] += v;
    }
  }
  // Cholesky ligne par ligne (méthode de la bordure) dans l'enveloppe.
  for (let i = 0; i < n; i++) {
    const fi = debut[i]!;
    const oi = decalage[i]! - fi; // val[oi + j] = L_ij
    for (let j = fi; j < i; j++) {
      const fj = debut[j]!;
      const oj = decalage[j]! - fj;
      let s = val[oi + j]!;
      const k0 = fi > fj ? fi : fj;
      for (let k = k0; k < j; k++) s -= val[oi + k]! * val[oj + k]!;
      val[oi + j] = s / val[oj + j]!;
    }
    let d = val[oi + i]!;
    for (let k = fi; k < i; k++) d -= val[oi + k]! * val[oi + k]!;
    if (!(d > 0)) throw new MatriceNonDefiniePositive(`Cholesky : pivot ${d} ≤ 0 à la ligne ${i} (matrice non définie positive)`);
    val[oi + i] = Math.sqrt(d);
  }
  return { n, perm, debut, decalage, val, enveloppe: val.length };
}

/**
 * Résout `A·x = b` avec le facteur. `travail` (n) évite une allocation. `x` peut être `b`.
 */
export function resoudreProfil(F: FacteurProfil, b: ArrayLike<number>, x: Float64Array, travail: Float64Array = new Float64Array(F.n)): Float64Array {
  const { n, perm, debut, decalage, val } = F;
  const y = travail;
  for (let k = 0; k < n; k++) y[k] = b[perm[k]!]!;
  // Descente : L·z = y.
  for (let i = 0; i < n; i++) {
    const fi = debut[i]!;
    const oi = decalage[i]! - fi;
    let s = y[i]!;
    for (let k = fi; k < i; k++) s -= val[oi + k]! * y[k]!;
    y[i] = s / val[oi + i]!;
  }
  // Remontée : Lᵀ·w = z (par colonnes, en lisant les lignes de L).
  for (let i = n - 1; i >= 0; i--) {
    const fi = debut[i]!;
    const oi = decalage[i]! - fi;
    const xi = y[i]! / val[oi + i]!;
    y[i] = xi;
    for (let k = fi; k < i; k++) y[k] -= val[oi + k]! * xi;
  }
  for (let k = 0; k < n; k++) x[perm[k]!] = y[k]!;
  return x;
}
