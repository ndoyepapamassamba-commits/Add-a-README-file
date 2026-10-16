/**
 * Transformées de distance exactes sur une grille de pixels (algorithme de l'enveloppe inférieure de paraboles,
 * Felzenszwalb & Huttenlocher 2012, réécrit d'après l'article) et champ de distance signé d'un masque.
 * Module pur.
 */

const INFINI = 1e20;

/** Transformée 1D du carré de la distance (enveloppe inférieure de paraboles), en place sur `f` (longueur n). */
function transformee1D(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INFINI;
  z[1] = INFINI;
  for (let q = 1; q < n; q++) {
    let s: number;
    for (;;) {
      const p = v[k]!;
      s = (f[q]! + q * q - (f[p]! + p * p)) / (2 * q - 2 * p);
      if (s <= z[k]! && k > 0) k--;
      else break;
    }
    if (s <= z[k]!) {
      // k == 0 et la nouvelle parabole domine aussi la première : on la remplace.
      v[0] = q;
      z[0] = -INFINI;
      z[1] = INFINI;
      k = 0;
      continue;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INFINI;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const p = v[k]!;
    d[q] = (q - p) * (q - p) + f[p]!;
  }
}

/**
 * Distance euclidienne (px) de chaque pixel au pixel « source » le plus proche (`sources[i] ≠ 0`).
 * Les sources valent 0. Sans aucune source, toutes les distances valent `+∞` (1e10).
 */
export function transformeeDistance(sources: Uint8Array, largeur: number, hauteur: number): Float32Array {
  const n = Math.max(largeur, hauteur);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const carre = new Float64Array(largeur * hauteur);
  for (let i = 0; i < carre.length; i++) carre[i] = sources[i] ? 0 : INFINI;
  // Colonnes.
  for (let x = 0; x < largeur; x++) {
    for (let y = 0; y < hauteur; y++) f[y] = carre[y * largeur + x]!;
    transformee1D(f, hauteur, d, v, z);
    for (let y = 0; y < hauteur; y++) carre[y * largeur + x] = d[y]!;
  }
  // Lignes.
  for (let y = 0; y < hauteur; y++) {
    const o = y * largeur;
    for (let x = 0; x < largeur; x++) f[x] = carre[o + x]!;
    transformee1D(f, largeur, d, v, z);
    for (let x = 0; x < largeur; x++) carre[o + x] = d[x]!;
  }
  const r = new Float32Array(largeur * hauteur);
  for (let i = 0; i < r.length; i++) r[i] = carre[i]! >= INFINI / 2 ? 1e10 : Math.sqrt(carre[i]!);
  return r;
}

/**
 * Champ de distance signé d'un masque binaire (px) : négatif dedans, positif dehors, le zéro passant à mi-chemin
 * entre un pixel intérieur et son voisin extérieur. Hors de l'image, tout est « dehors ».
 */
export function distanceSignee(masque: Uint8Array, largeur: number, hauteur: number): Float32Array {
  const dehors = new Uint8Array(masque.length);
  for (let i = 0; i < masque.length; i++) dehors[i] = masque[i] ? 0 : 1;
  const dIn = transformeeDistance(masque, largeur, hauteur); // distance au masque (pour les pixels dehors)
  const dOut = transformeeDistance(dehors, largeur, hauteur); // distance au dehors (pour les pixels dedans)
  const sd = new Float32Array(masque.length);
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const i = y * largeur + x;
      if (masque[i]) {
        // Le bord de l'image compte comme dehors.
        const bord = Math.min(x + 1, y + 1, largeur - x, hauteur - y);
        sd[i] = -(Math.min(dOut[i]!, bord) - 0.5);
      } else {
        sd[i] = dIn[i]! - 0.5;
      }
    }
  }
  return sd;
}

/** Échantillonnage bilinéaire d'un champ (bornes : valeur du bord). */
export function echantillonner(champ: Float32Array, largeur: number, hauteur: number, x: number, y: number): number {
  const fx = Math.min(Math.max(x, 0), largeur - 1);
  const fy = Math.min(Math.max(y, 0), hauteur - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, largeur - 1);
  const y1 = Math.min(y0 + 1, hauteur - 1);
  const ux = fx - x0;
  const uy = fy - y0;
  const a = champ[y0 * largeur + x0]!;
  const b = champ[y0 * largeur + x1]!;
  const c = champ[y1 * largeur + x0]!;
  const d = champ[y1 * largeur + x1]!;
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}
