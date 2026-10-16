/**
 * Géométrie et traitements d'image du rendu, purs (testés dans Node, utilisés par la page) :
 * - grille de maillage du décor (débordant légèrement du décor, texture prolongée au bord) ;
 * - parallaxe et caméra appliquées aux sommets (mêmes formules que `scene/decor` et `timeline/projection`) ;
 * - cellules de figurants (une par personne, découpées dans les masses fusionnées du masque) et leur mouvement
 *   (respiration, balancement autour des pieds, tête vivante), sous forme de déplacements de sommets ;
 * - taches de lumière (ampoules, néons) pour les halos qui scintillent ;
 * - remplissage « push-pull » (ciel prolongé sous les toits) et flou de boîte.
 */
import { bruit1D, hash01 } from '../noyau/aleatoire';
import type { EtatDecor, Mat2D, Vec2 } from '../timeline/types';

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Grille du décor
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Grille régulière du décor. */
export interface GrilleDecor {
  /** Nombre de sommets par ligne et par colonne. */
  nx: number;
  ny: number;
  /** Positions de repos (monde, 2V). */
  repos: Float32Array;
  /** Coordonnées de texture (0 … 1, bornées, 2V). */
  uvs: Float32Array;
  /** Coordonnées (u, v) non bornées des sommets (2V), pour échantillonner les cartes. */
  uvLibres: Float32Array;
}

/** Crée la grille : `colonnes × lignes` cellules, débordant de `marge` (fraction) de chaque côté. */
export function creerGrille(aspect: number, colonnes: number, lignes: number, marge = 0.03): GrilleDecor {
  const nx = colonnes + 1;
  const ny = lignes + 1;
  const n = nx * ny;
  const repos = new Float32Array(2 * n);
  const uvs = new Float32Array(2 * n);
  const uvLibres = new Float32Array(2 * n);
  for (let j = 0; j < ny; j++) {
    const v = -marge + ((1 + 2 * marge) * j) / lignes;
    for (let i = 0; i < nx; i++) {
      const u = -marge + ((1 + 2 * marge) * i) / colonnes;
      const k = j * nx + i;
      repos[2 * k] = u * aspect;
      repos[2 * k + 1] = v;
      uvLibres[2 * k] = u;
      uvLibres[2 * k + 1] = v;
      uvs[2 * k] = Math.min(1, Math.max(0, u));
      uvs[2 * k + 1] = Math.min(1, Math.max(0, v));
    }
  }
  return { nx, ny, repos, uvs, uvLibres };
}

/** Indices des cellules retenues par `garder(i, j)` (toutes par défaut). */
export function indicesGrille(g: Pick<GrilleDecor, 'nx' | 'ny'>, garder: (i: number, j: number) => boolean = () => true): Uint32Array {
  const idx: number[] = [];
  for (let j = 0; j < g.ny - 1; j++) {
    for (let i = 0; i < g.nx - 1; i++) {
      if (!garder(i, j)) continue;
      const a = j * g.nx + i;
      const b = a + 1;
      const c = a + g.nx;
      const d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  return Uint32Array.from(idx);
}

/**
 * Sommets de la grille à l'écran : déplacement de vie (facultatif, monde), parallaxe par la profondeur, puis
 * caméra. `sortie` reçoit des px de sortie (2V).
 */
export function projeterGrille(
  repos: Float32Array,
  profondeurs: Float32Array,
  parallaxe: EtatDecor['parallaxe'],
  centre: Vec2,
  camera: Mat2D,
  sortie: Float32Array,
  vie?: Float32Array | null,
): void {
  const n = profondeurs.length;
  const { decalage, poussee, profondeurReference } = parallaxe;
  const { a, b, c, d, tx, ty } = camera;
  for (let k = 0; k < n; k++) {
    let x = repos[2 * k]!;
    let y = repos[2 * k + 1]!;
    if (vie) {
      x += vie[2 * k]!;
      y += vie[2 * k + 1]!;
    }
    const e = profondeurs[k]! - profondeurReference;
    const s = 1 + e * poussee;
    const px = centre.x + (x - centre.x) * s + e * decalage.x;
    const py = centre.y + (y - centre.y) * s + e * decalage.y;
    sortie[2 * k] = a * px + c * py + tx;
    sortie[2 * k + 1] = b * px + d * py + ty;
  }
}

/** Applique une matrice à un tableau plat de points (en place ou vers `sortie`). */
export function appliquerMatrice(m: Mat2D, points: ArrayLike<number>, sortie: Float32Array, n = points.length / 2): void {
  for (let k = 0; k < n; k++) {
    const x = points[2 * k]!;
    const y = points[2 * k + 1]!;
    sortie[2 * k] = m.a * x + m.c * y + m.tx;
    sortie[2 * k + 1] = m.b * x + m.d * y + m.ty;
  }
}

/** Écart maximal (px) entre deux jeux de sommets de même taille. */
export function ecartMax(a: Float32Array, b: Float32Array): number {
  let m = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 2) {
    const d = Math.hypot(a[i]! - b[i]!, a[i + 1]! - b[i + 1]!);
    if (d > m) m = d;
  }
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Cartes (canaux flottants)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Carte flottante (un canal). */
export interface Carte {
  largeur: number;
  hauteur: number;
  valeurs: Float32Array;
}

/** Extrait un canal d'une image RGBA en carte [0, 1]. */
export function canal(donnees: ArrayLike<number>, largeur: number, hauteur: number, c: number): Carte {
  const v = new Float32Array(largeur * hauteur);
  for (let i = 0; i < v.length; i++) v[i] = donnees[4 * i + c]! / 255;
  return { largeur, hauteur, valeurs: v };
}

/** Flou de boîte séparable de rayon `r` (bords prolongés), répété `passes` fois (≈ gaussien). */
export function flouBoite(c: Carte, r: number, passes = 2): Carte {
  if (r <= 0) return c;
  const { largeur: L, hauteur: H } = c;
  let src = Float32Array.from(c.valeurs);
  let dst = new Float32Array(L * H);
  const norme = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[y * L + Math.min(L - 1, Math.max(0, k))]!;
      for (let x = 0; x < L; x++) {
        dst[y * L + x] = s * norme;
        s += src[y * L + Math.min(L - 1, x + r + 1)]! - src[y * L + Math.max(0, x - r)]!;
      }
    }
    [src, dst] = [dst, src];
    for (let x = 0; x < L; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[Math.min(H - 1, Math.max(0, k)) * L + x]!;
      for (let y = 0; y < H; y++) {
        dst[y * L + x] = s * norme;
        s += src[Math.min(H - 1, y + r + 1) * L + x]! - src[Math.max(0, y - r) * L + x]!;
      }
    }
    [src, dst] = [dst, src];
  }
  return { largeur: L, hauteur: H, valeurs: src };
}

/** Lecture bilinéaire d'une carte en (u, v) ∈ [0, 1] (bords prolongés). */
export function lireCarte(c: Carte, u: number, v: number): number {
  const x = Math.min(c.largeur - 1, Math.max(0, u * c.largeur - 0.5));
  const y = Math.min(c.hauteur - 1, Math.max(0, v * c.hauteur - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(c.largeur - 1, x0 + 1);
  const y1 = Math.min(c.hauteur - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const L = c.largeur;
  const t = c.valeurs;
  return (t[y0 * L + x0]! * (1 - fx) + t[y0 * L + x1]! * fx) * (1 - fy) + (t[y1 * L + x0]! * (1 - fx) + t[y1 * L + x1]! * fx) * fy;
}

/** Échantillonne une carte aux sommets d'une grille. */
export function carteAuxSommets(c: Carte, g: GrilleDecor): Float32Array {
  const n = g.nx * g.ny;
  const r = new Float32Array(n);
  for (let k = 0; k < n; k++) r[k] = lireCarte(c, g.uvLibres[2 * k]!, g.uvLibres[2 * k + 1]!);
  return r;
}

/** Vrai si une cellule de la grille touche une zone où la carte dépasse `seuil` (avec une marge en cellules). */
export function cellulesCouvertes(c: Carte, g: GrilleDecor, seuil: number, marge = 1): (i: number, j: number) => boolean {
  const cx = g.nx - 1;
  const cy = g.ny - 1;
  const occ = new Uint8Array(cx * cy);
  // Maximum de la carte par cellule.
  for (let y = 0; y < c.hauteur; y++) {
    const v = (y + 0.5) / c.hauteur;
    for (let x = 0; x < c.largeur; x++) {
      if (c.valeurs[y * c.largeur + x]! <= seuil) continue;
      const u = (x + 0.5) / c.largeur;
      const fi = (u - g.uvLibres[0]!) / (g.uvLibres[2 * (g.nx - 1)]! - g.uvLibres[0]!);
      const fj = (v - g.uvLibres[1]!) / (g.uvLibres[2 * (g.nx * (g.ny - 1)) + 1]! - g.uvLibres[1]!);
      const i = Math.min(cx - 1, Math.max(0, Math.floor(fi * cx)));
      const j = Math.min(cy - 1, Math.max(0, Math.floor(fj * cy)));
      occ[j * cx + i] = 1;
    }
  }
  return (i, j) => {
    for (let dj = -marge; dj <= marge; dj++)
      for (let di = -marge; di <= marge; di++) {
        const a = i + di;
        const b = j + dj;
        if (a >= 0 && b >= 0 && a < cx && b < cy && occ[b * cx + a]) return true;
      }
    return false;
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Figurants
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Une cellule de figurant (une personne) en fractions du décor. */
export interface CelluleFigurant {
  /** Colonne de la personne : [u0, u1]. */
  u0: number;
  u1: number;
  /** Haut de la tête et pieds (v). */
  vHaut: number;
  vPieds: number;
  /** Phase, période (s) et activité (0 calme … 1 bavard). */
  phase: number;
  periode: number;
  activite: number;
  graine: number;
  /**
   * Amplitude propre de la cellule (0 = immobile) : nulle pour les masses qui ne ressemblent pas à une personne
   * (véhicule, foule fusionnée très haute), réduite pour les figurants très proches (grands à l'écran).
   */
  amplitude: number;
}

/**
 * Découpe le masque des personnes en cellules : composantes connexes, puis colonnes de la largeur attendue d'une
 * personne à la hauteur de ses pieds (modèle de sol : `h(v) = 1,7·(v − v_h)/1,6`, largeur ≈ 0,3·h). Renvoie les
 * cellules et la carte des étiquettes (indice de cellule par pixel, −1 hors masque).
 */
export function detecterFigurants(
  masque: Carte,
  fit: { mH: number; floor: number },
  graine: number,
  seuil = 0.4,
): { cellules: CelluleFigurant[]; etiquettes: Int32Array } {
  const { largeur: L, hauteur: H, valeurs } = masque;
  const comp = new Int32Array(L * H).fill(-1);
  const vh = fit.floor - 1.6 / fit.mH;
  const cellules: CelluleFigurant[] = [];
  const etiquettes = new Int32Array(L * H).fill(-1);
  let nComp = 0;
  const pile: number[] = [];
  for (let depart = 0; depart < L * H; depart++) {
    if (valeurs[depart]! <= seuil || comp[depart]! >= 0) continue;
    const pixels: number[] = [];
    comp[depart] = nComp;
    pile.push(depart);
    let x0 = L;
    let x1 = -1;
    let y0 = H;
    let y1 = -1;
    while (pile.length > 0) {
      const p = pile.pop()!;
      pixels.push(p);
      const x = p % L;
      const y = (p - x) / L;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const voisins = [x > 0 ? p - 1 : -1, x < L - 1 ? p + 1 : -1, y > 0 ? p - L : -1, y < H - 1 ? p + L : -1];
      for (const q of voisins) {
        if (q >= 0 && comp[q]! < 0 && valeurs[q]! > seuil) {
          comp[q] = nComp;
          pile.push(q);
        }
      }
    }
    nComp++;
    if (pixels.length < 12) continue;
    // Largeur attendue d'une personne à la hauteur des pieds de la composante.
    const vPieds = (y1 + 1) / H;
    const hPers = Math.max(0.04, (1.7 * (vPieds - vh)) / 1.6);
    const largeurAttendue = Math.max(3, 0.3 * hPers * H); // en px du masque (repère uniforme : H px = 1 unité)
    const nCol = Math.max(1, Math.round((x1 - x0 + 1) / largeurAttendue));
    const pas = (x1 - x0 + 1) / nCol;
    const base = cellules.length;
    const hauts = new Array<number>(nCol).fill(H);
    const bas = new Array<number>(nCol).fill(-1);
    for (const p of pixels) {
      const x = p % L;
      const y = (p - x) / L;
      const k = Math.min(nCol - 1, Math.floor((x - x0) / pas));
      if (y < hauts[k]!) hauts[k] = y;
      if (y > bas[k]!) bas[k] = y;
      etiquettes[p] = base + k;
    }
    for (let k = 0; k < nCol; k++) {
      const g = (graine ^ Math.imul(base + k + 1, 0x9e3779b1)) >>> 0;
      // Hauteur de la colonne rapportée à celle d'une personne debout à ces pieds : une personne (debout ou
      // assise) fait 0,35 à 1,4 fois la hauteur attendue ; au-delà (bus, façade) ou en deçà (débris), immobile.
      const hCol = (bas[k]! + 1 - hauts[k]!) / H;
      const r = hCol / hPers;
      const personne = r >= 0.35 && r <= 1.4;
      cellules.push({
        u0: (x0 + k * pas) / L,
        u1: (x0 + (k + 1) * pas) / L,
        vHaut: hauts[k]! / H,
        vPieds: (bas[k]! + 1) / H,
        phase: 2 * Math.PI * hash01(g, 1),
        periode: 2.8 + 1.7 * hash01(g, 2),
        activite: hash01(g, 3) < 0.35 ? 0.6 + 0.4 * hash01(g, 4) : 0.15 * hash01(g, 5),
        graine: g,
        amplitude: personne ? Math.min(1, 0.25 / Math.max(1e-3, hCol)) : 0,
      });
    }
  }
  return { cellules, etiquettes };
}

/** Données de vie des figurants par sommet de la grille. */
export interface VieFigurants {
  cellules: CelluleFigurant[];
  /** Cellule de chaque sommet (−1 = aucune). */
  cellule: Int32Array;
  /** Poids du mouvement (masque adouci) par sommet. */
  poids: Float32Array;
}

/** Associe les sommets de la grille aux cellules (étiquette du pixel le plus proche dans un petit voisinage). */
export function vieAuxSommets(g: GrilleDecor, cellules: CelluleFigurant[], etiquettes: Int32Array, masqueDoux: Carte, L: number, H: number): VieFigurants {
  const n = g.nx * g.ny;
  const cellule = new Int32Array(n).fill(-1);
  const poids = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const u = g.uvLibres[2 * k]!;
    const v = g.uvLibres[2 * k + 1]!;
    const w = lireCarte(masqueDoux, u, v);
    if (w < 0.02) continue;
    const x = Math.round(u * L - 0.5);
    const y = Math.round(v * H - 0.5);
    let best = -1;
    let bestD = Infinity;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= L || yy >= H) continue;
        const e = etiquettes[yy * L + xx]!;
        if (e < 0) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
    if (best < 0) continue;
    cellule[k] = best;
    poids[k] = Math.min(1, w * 1.25);
  }
  return { cellules, cellule, poids };
}

/** Réglages de la vie des figurants (fractions de la hauteur de la personne). */
export const REGLAGES_FIGURANTS = Object.freeze({
  respiration: 0.011,
  balancementRad: 0.8 * (Math.PI / 180),
  teteX: 0.026,
  teteY: 0.01,
  /** Salves de jeu des figurants actifs (rire, conversation) : sautillement et rotation de la tête. */
  salve: 0.016,
});

/** Enveloppe (0 … 1) des salves de jeu d'un figurant : quelques secondes de rire ou de conversation, à des
 * instants différents pour chacun (bruit lent seuillé en douceur). */
function salve(c: CelluleFigurant, temps: number): number {
  const x = (bruit1D(0.11 * temps + c.phase, c.graine + 11) - 0.2) / 0.4;
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/**
 * Déplacements (monde, 2V) des sommets de la grille pour les figurants à l'instant `temps` :
 * respiration (mise à l'échelle verticale autour des pieds), balancement (rotation autour des pieds), tête vivante
 * (bruit lent, plus marqué chez les « bavards »). Nul hors des personnes.
 */
export function deplacementsFigurants(g: GrilleDecor, vie: VieFigurants, temps: number, amplitude: number, sortie: Float32Array): void {
  sortie.fill(0);
  if (amplitude <= 0) return;
  const R = REGLAGES_FIGURANTS;
  const n = g.nx * g.ny;
  // Paramètres par cellule pour cet instant.
  const pc = vie.cellules.map((c) => {
    const w = (2 * Math.PI) / c.periode;
    return {
      a: c.amplitude,
      resp: R.respiration * Math.sin(w * temps + c.phase),
      bal: R.balancementRad * Math.sin((w / 1.7) * temps + 1.3 * c.phase),
      tx: c.activite * (R.teteX * bruit1D(0.55 * temps + c.phase, c.graine) + 0.6 * R.salve * salve(c, temps) * Math.sin(2 * Math.PI * 1.3 * temps + c.phase)),
      ty: c.activite * (R.teteY * bruit1D(0.9 * temps + c.phase, c.graine + 7) + R.salve * salve(c, temps) * Math.sin(2 * Math.PI * 4.2 * temps + 2 * c.phase)),
      h: Math.max(1e-3, c.vPieds - c.vHaut),
      pieds: c.vPieds,
    };
  });
  for (let k = 0; k < n; k++) {
    const ci = vie.cellule[k]!;
    if (ci < 0) continue;
    const p = pc[ci]!;
    const w = vie.poids[k]! * amplitude * p.a;
    if (w === 0) continue;
    const y = g.repos[2 * k + 1]!;
    const hauteur = Math.max(0, p.pieds - y); // au-dessus des pieds (monde)
    const rel = Math.min(1, hauteur / p.h);
    const tete = rel > 0.55 ? Math.min(1, (rel - 0.55) / 0.3) : 0;
    const dx = hauteur * p.bal + tete * p.tx * p.h;
    const dy = -hauteur * p.resp + tete * p.ty * p.h;
    sortie[2 * k] = w * dx;
    sortie[2 * k + 1] = w * dy;
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Lumières
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Tache de lumière du décor. */
export interface TacheLumiere {
  u: number;
  v: number;
  /** Rayon en fraction de la hauteur du décor. */
  rayon: number;
  couleur: [number, number, number];
  frequence: number;
  phase: number;
  graine: number;
}

/**
 * Taches de lumière : petites composantes très claires (luminance > `seuil`), d'aire limitée (ampoules, néons,
 * fenêtres éclairées). Les plus brillantes d'abord, au plus `max`.
 */
export function detecterLumieres(
  donnees: ArrayLike<number>,
  L: number,
  H: number,
  graine: number,
  options: { seuil?: number; aireMax?: number; max?: number; masqueExclu?: Carte | null } = {},
): TacheLumiere[] {
  const seuil = options.seuil ?? 0.86;
  const aireMax = (options.aireMax ?? 0.0025) * L * H;
  const max = options.max ?? 40;
  const lum = new Float32Array(L * H);
  for (let i = 0; i < L * H; i++) {
    const r = donnees[4 * i]! / 255;
    const g = donnees[4 * i + 1]! / 255;
    const b = donnees[4 * i + 2]! / 255;
    lum[i] = Math.max(r, g, b) * 0.6 + (0.2126 * r + 0.7152 * g + 0.0722 * b) * 0.4;
  }
  const vu = new Uint8Array(L * H);
  const taches: Array<TacheLumiere & { eclat: number }> = [];
  const pile: number[] = [];
  for (let d = 0; d < L * H; d++) {
    if (vu[d] || lum[d]! < seuil) continue;
    vu[d] = 1;
    pile.push(d);
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let eclat = 0;
    while (pile.length > 0) {
      const p = pile.pop()!;
      const x = p % L;
      const y = (p - x) / L;
      n++;
      sx += x;
      sy += y;
      sr += donnees[4 * p]!;
      sg += donnees[4 * p + 1]!;
      sb += donnees[4 * p + 2]!;
      eclat = Math.max(eclat, lum[p]!);
      for (const q of [x > 0 ? p - 1 : -1, x < L - 1 ? p + 1 : -1, y > 0 ? p - L : -1, y < H - 1 ? p + L : -1]) {
        if (q >= 0 && !vu[q] && lum[q]! >= seuil) {
          vu[q] = 1;
          pile.push(q);
        }
      }
    }
    if (n < 2 || n > aireMax) continue;
    const u = (sx / n + 0.5) / L;
    const v = (sy / n + 0.5) / H;
    if (options.masqueExclu && lireCarte(options.masqueExclu, u, v) > 0.5) continue;
    const m = Math.max(sr, sg, sb, 1);
    const k = taches.length;
    const gk = (graine ^ Math.imul(k + 1, 0x85ebca6b)) >>> 0;
    taches.push({
      u,
      v,
      rayon: Math.sqrt(n / Math.PI) / H,
      couleur: [sr / m, sg / m, sb / m],
      frequence: 0.7 + 2.3 * hash01(gk, 1),
      phase: 10 * hash01(gk, 2),
      graine: gk,
      eclat,
    });
  }
  taches.sort((a, b) => b.eclat - a.eclat || a.v - b.v || a.u - b.u);
  return taches.slice(0, max).map(({ eclat: _e, ...t }) => t);
}

/** Intensité d'un halo à l'instant `temps` (0 … 1) : respiration lente + scintillement doux, déterministe. */
export function intensiteHalo(t: TacheLumiere, temps: number): number {
  const lent = bruit1D(t.frequence * temps + t.phase, t.graine);
  const vif = bruit1D(3.1 * t.frequence * temps + t.phase, t.graine + 3);
  let i = 0.5 + 0.3 * lent + 0.2 * vif;
  // Une ampoule sur quatre « grésille » : brèves baisses franches, à des instants propres à chacune.
  if ((t.graine >>> 3) % 4 === 0) {
    const g = bruit1D(9 * t.frequence * temps + 2 * t.phase, t.graine + 17);
    if (g > 0.45) i *= 0.35 + 0.65 * Math.min(1, (0.75 - g) / 0.3);
  }
  return Math.min(1, Math.max(0, i));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Remplissage push-pull
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Remplit les pixels inconnus (poids 0) d'une image RGBA par diffusion « push-pull » (pyramide de moyennes
 * pondérées, puis remontée) : les couleurs connues se prolongent en douceur. `poids` ∈ [0, 1] par pixel.
 * Renvoie une nouvelle image (alpha 255).
 */
export function remplirPushPull(donnees: ArrayLike<number>, L: number, H: number, poids: Float32Array): Uint8ClampedArray {
  interface Niveau {
    l: number;
    h: number;
    c: Float32Array; // r,g,b prémultipliés par le poids
    w: Float32Array;
  }
  const n0: Niveau = { l: L, h: H, c: new Float32Array(3 * L * H), w: new Float32Array(L * H) };
  for (let i = 0; i < L * H; i++) {
    const w = poids[i]!;
    n0.w[i] = w;
    n0.c[3 * i] = (donnees[4 * i]! / 255) * w;
    n0.c[3 * i + 1] = (donnees[4 * i + 1]! / 255) * w;
    n0.c[3 * i + 2] = (donnees[4 * i + 2]! / 255) * w;
  }
  const niveaux: Niveau[] = [n0];
  while (niveaux[niveaux.length - 1]!.l > 1 || niveaux[niveaux.length - 1]!.h > 1) {
    const p = niveaux[niveaux.length - 1]!;
    const l = Math.max(1, Math.ceil(p.l / 2));
    const h = Math.max(1, Math.ceil(p.h / 2));
    const q: Niveau = { l, h, c: new Float32Array(3 * l * h), w: new Float32Array(l * h) };
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.l; x++) {
        const i = y * p.l + x;
        const j = (y >> 1) * l + (x >> 1);
        q.w[j]! += p.w[i]!;
        q.c[3 * j]! += p.c[3 * i]!;
        q.c[3 * j + 1]! += p.c[3 * i + 1]!;
        q.c[3 * j + 2]! += p.c[3 * i + 2]!;
      }
    // Normalise le poids (≤ 1) en gardant la couleur moyenne.
    for (let j = 0; j < l * h; j++) {
      const w = q.w[j]!;
      if (w > 1) {
        q.c[3 * j]! /= w;
        q.c[3 * j + 1]! /= w;
        q.c[3 * j + 2]! /= w;
        q.w[j] = 1;
      }
    }
    niveaux.push(q);
  }
  // Remontée : complète chaque niveau par le niveau plus grossier.
  for (let k = niveaux.length - 2; k >= 0; k--) {
    const p = niveaux[k]!;
    const q = niveaux[k + 1]!;
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.l; x++) {
        const i = y * p.l + x;
        const j = (y >> 1) * q.l + (x >> 1);
        const w = Math.min(1, p.w[i]!);
        const reste = 1 - w;
        if (reste <= 0) continue;
        const wq = Math.max(1e-6, q.w[j]!);
        p.c[3 * i]! += (reste * q.c[3 * j]!) / wq;
        p.c[3 * i + 1]! += (reste * q.c[3 * j + 1]!) / wq;
        p.c[3 * i + 2]! += (reste * q.c[3 * j + 2]!) / wq;
        p.w[i] = 1;
      }
  }
  const r = new Uint8ClampedArray(4 * L * H);
  for (let i = 0; i < L * H; i++) {
    const w = Math.max(1e-6, n0.w[i]!);
    r[4 * i] = Math.round((255 * n0.c[3 * i]!) / w);
    r[4 * i + 1] = Math.round((255 * n0.c[3 * i + 1]!) / w);
    r[4 * i + 2] = Math.round((255 * n0.c[3 * i + 2]!) / w);
    r[4 * i + 3] = 255;
  }
  return r;
}
