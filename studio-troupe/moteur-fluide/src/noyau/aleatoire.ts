/**
 * Aléa déterministe : hachages entiers à graine, générateur pseudo-aléatoire à graine, bruit simplex 1D et 2D
 * (écrit ici, sans table de permutation tierce).
 *
 * Règle du moteur : dans `evaluer` et les fournisseurs, l'aléa vient **uniquement des hachages**
 * (`hash01(graine, canal, indice)`), jamais d'un générateur à état ; ainsi l'image `t` ne dépend pas des images
 * déjà calculées. Le générateur `creerAleatoire` sert aux outils hors ligne (échantillonnage, maillage…).
 */

const DEUX_32 = 4294967296;

/** Mélange final 32 bits (avalanche complète ; constantes du finaliseur de MurmurHash3, domaine public). */
export function melanger32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const tampon = new DataView(new ArrayBuffer(8));

/** Mots 32 bits d'un nombre : entier 32 bits tel quel, sinon les deux moitiés de sa représentation IEEE 754. */
function motsDe(v: number): [number, number] | number {
  if (Number.isInteger(v) && v >= -2147483648 && v <= 4294967295) return v | 0;
  tampon.setFloat64(0, v === 0 ? 0 : v); // −0 et +0 hachent pareil
  return [tampon.getInt32(0), tampon.getInt32(4)];
}

function combiner(h: number, mot: number): number {
  return melanger32((h ^ (mot + 0x9e3779b9 + (h << 6) + (h >>> 2))) | 0);
}

/** Hachage 32 bits non signé d'une suite de nombres (entiers ou réels). */
export function hash32(...valeurs: number[]): number {
  let h = 0x811c9dc5;
  for (const v of valeurs) {
    const m = motsDe(v);
    if (typeof m === 'number') h = combiner(h, m);
    else h = combiner(combiner(h, m[0]), m[1]);
  }
  return melanger32(h ^ valeurs.length);
}

/** Hachage 32 bits d'une chaîne (FNV-1a sur les unités UTF-16, puis mélange). */
export function hashChaine(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return melanger32(h);
}

/** Valeur uniforme dans `[0, 1[` dérivée du hachage des arguments. */
export function hash01(...valeurs: number[]): number {
  return hash32(...valeurs) / DEUX_32;
}

/** Valeur uniforme dans `[−1, 1[` dérivée du hachage des arguments. */
export function hashSigne(...valeurs: number[]): number {
  return (hash32(...valeurs) / DEUX_32) * 2 - 1;
}

/** Hachage 2D d'une cellule entière `(ix, iy)` avec graine, dans `[0, 1[`. */
export function hash2D(ix: number, iy: number, graine = 0): number {
  return hash32(graine, ix, iy) / DEUX_32;
}

/** Graine dérivée de chaînes et de nombres (« modou », « clignement », 3 …). */
export function graineDe(...parties: Array<string | number>): number {
  const mots = parties.map((p) => (typeof p === 'string' ? hashChaine(p) : hash32(p)));
  return hash32(...mots);
}

/** Générateur pseudo-aléatoire à graine (outils hors ligne). Séquence identique pour une même graine. */
export interface Aleatoire {
  /** Uniforme dans `[0, 1[`. */
  suivant(): number;
  /** Uniforme dans `[a, b[`. */
  plage(a: number, b: number): number;
  /** Entier uniforme dans `[min, max]` (bornes incluses). */
  entier(min: number, max: number): number;
  /** Loi normale (Box-Muller), moyenne `m`, écart-type `s`. */
  normal(m?: number, s?: number): number;
  /** Élément au hasard d'un tableau non vide. */
  choisir<T>(t: readonly T[]): T;
}

/** Crée un générateur à graine (pas de 32 bits à incrément de Weyl, sortie mélangée). */
export function creerAleatoire(graine: number): Aleatoire {
  let etat = hash32(graine) | 0;
  const suivant = (): number => {
    etat = (etat + 0x9e3779b9) | 0;
    return melanger32(etat) / DEUX_32;
  };
  return {
    suivant,
    plage: (a, b) => a + (b - a) * suivant(),
    entier: (min, max) => min + Math.floor(suivant() * (max - min + 1)),
    normal: (m = 0, s = 1) => {
      const u1 = 1 - suivant();
      const u2 = suivant();
      return m + s * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
    choisir: <T>(t: readonly T[]): T => {
      if (t.length === 0) throw new Error('choisir : tableau vide');
      return t[Math.floor(suivant() * t.length)]!;
    },
  };
}

// ── Bruit simplex ────────────────────────────────────────────────────────────────────────────────────────────────

/** Gradient 1D dans `[−1, 1]` attaché à l'entier `i`. */
function gradient1D(i: number, graine: number): number {
  return (hash32(graine, i, 0x51ed) / DEUX_32) * 2 - 1;
}

/**
 * Facteur de normalisation du simplex 1D : le maximum de `|n0 + n1|` pour des gradients de module 1 vaut
 * 81/256 ≈ 0,3164 (atteint au milieu de la cellule, gradients opposés). On divise par lui : sortie dans [−1, 1].
 */
const NORME_1D = 256 / 81;

/**
 * Bruit simplex 1D déterministe, continu et dérivable (C²), dans `[−1, 1]`, de moyenne nulle.
 * Une « cellule » = 1 unité de `x` : multiplier `x` par une fréquence (Hz × temps) pour régler la vitesse.
 */
export function bruit1D(x: number, graine = 0): number {
  const i0 = Math.floor(x);
  const x0 = x - i0;
  const x1 = x0 - 1;
  const t0 = 1 - x0 * x0;
  const t1 = 1 - x1 * x1;
  const n0 = t0 * t0 * t0 * t0 * gradient1D(i0, graine) * x0;
  const n1 = t1 * t1 * t1 * t1 * gradient1D(i0 + 1, graine) * x1;
  const n = (n0 + n1) * NORME_1D;
  return n > 1 ? 1 : n < -1 ? -1 : n + 0; // + 0 : jamais de −0
}

/** 16 directions unitaires régulières pour les gradients 2D. */
const GRADIENTS_2D: ReadonlyArray<readonly [number, number]> = Array.from({ length: 16 }, (_, k) => {
  const a = (k * Math.PI * 2) / 16 + Math.PI / 16;
  return [Math.cos(a), Math.sin(a)] as const;
});

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

/**
 * Facteur de normalisation du simplex 2D : borne du pire cas (chaque coin avec le gradient le mieux aligné parmi les
 * 16), mesurée par balayage : max |somme| ≈ 0,010059. La sortie reste ainsi dans [−1, 1] (bornée par sécurité).
 */
const NORME_2D = 1 / 0.010059;

function contribution2D(ix: number, iy: number, dx: number, dy: number, graine: number): number {
  const t = 0.5 - dx * dx - dy * dy;
  if (t <= 0) return 0;
  const g = GRADIENTS_2D[hash32(graine, ix, iy, 0x2d) & 15]!;
  const t2 = t * t;
  return t2 * t2 * (g[0] * dx + g[1] * dy);
}

/**
 * Bruit simplex 2D déterministe, continu, dans `[−1, 1]` (borné), de moyenne nulle. Grille simplexe classique
 * (inclinaison F2, désinclinaison G2), gradients unitaires tirés par hachage de la cellule.
 */
export function bruit2D(x: number, y: number, graine = 0): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const n =
    contribution2D(i, j, x0, y0, graine) +
    contribution2D(i + i1, j + j1, x1, y1, graine) +
    contribution2D(i + 1, j + 1, x2, y2, graine);
  const r = n * NORME_2D;
  return r > 1 ? 1 : r < -1 ? -1 : r + 0;
}

/** Options du bruit fractal (somme d'octaves). */
export interface OptionsFractal {
  /** Nombre d'octaves (défaut 2). */
  octaves?: number;
  /** Multiplicateur de fréquence entre octaves (défaut 2). */
  lacunarite?: number;
  /** Multiplicateur d'amplitude entre octaves (défaut 0,5). */
  gain?: number;
}

/** Bruit fractal 1D normalisé dans `[−1, 1]`. */
export function bruitFractal1D(x: number, graine = 0, options: OptionsFractal = {}): number {
  const { octaves = 2, lacunarite = 2, gain = 0.5 } = options;
  let somme = 0;
  let norme = 0;
  let amp = 1;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    somme += amp * bruit1D(x * freq + o * 17.31, graine + o * 1013);
    norme += amp;
    amp *= gain;
    freq *= lacunarite;
  }
  return norme > 0 ? somme / norme : 0;
}

/** Bruit fractal 2D normalisé dans `[−1, 1]`. */
export function bruitFractal2D(x: number, y: number, graine = 0, options: OptionsFractal = {}): number {
  const { octaves = 2, lacunarite = 2, gain = 0.5 } = options;
  let somme = 0;
  let norme = 0;
  let amp = 1;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    somme += amp * bruit2D(x * freq + o * 17.31, y * freq - o * 9.17, graine + o * 1013);
    norme += amp;
    amp *= gain;
    freq *= lacunarite;
  }
  return norme > 0 ? somme / norme : 0;
}
