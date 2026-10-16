/**
 * Opérations d'image pour affiner la texture d'un personnage (fonctions pures, testées) :
 *
 * - `facteurPixels` : détecte un dessin agrandi « au plus proche voisin » (blocs de 2×2 pixels identiques) ;
 * - `remplirSousAlpha` : remplit la couleur sous les zones transparentes par « pousser-tirer » (moyennes
 *   pyramidales), pour qu'un agrandissement ou un filtrage linéaire n'amène pas de liseré sombre ou gris au bord ;
 * - `reduireBoite` : réduction d'un facteur entier (moyenne des blocs) ;
 * - `agrandirBicubique` : rééchantillonnage bicubique (Catmull-Rom) ;
 * - `alphaNet` : bord net mais adouci (smoothstep) de l'alpha agrandi.
 *
 * Images RGBA 8 bits non prémultipliées (`ImageRGBA` du rig).
 */
import type { ImageRGBA } from '../../rig/maillage';

/** Image vide. */
export function imageVide(largeur: number, hauteur: number): ImageRGBA {
  return { largeur, hauteur, donnees: new Uint8Array(largeur * hauteur * 4) };
}

/**
 * Part des blocs 2×2 (sur les pixels opaques) dont les 4 pixels sont identiques, sur la meilleure des 4 phases.
 * Un dessin agrandi ×2 au plus proche voisin donne une part élevée (> 0,25, souvent 0,3 à 0,6 après détourage) ;
 * un dessin natif peint, une part presque nulle (hors aplats).
 */
export function partBlocsIdentiques(img: ImageRGBA): number {
  const { largeur: L, hauteur: H, donnees: d } = img;
  let meilleure = 0;
  for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    let n = 0;
    let identiques = 0;
    for (let y = oy; y + 1 < H; y += 2)
      for (let x = ox; x + 1 < L; x += 2) {
        const i = 4 * (y * L + x);
        if (d[i + 3]! < 200) continue;
        n++;
        const j = i + 4;
        const k = i + 4 * L;
        const l = k + 4;
        let pareil = true;
        for (let c = 0; c < 4 && pareil; c++) pareil = d[i + c] === d[j + c] && d[i + c] === d[k + c] && d[i + c] === d[l + c];
        if (pareil) identiques++;
      }
    if (n > 0) meilleure = Math.max(meilleure, identiques / n);
  }
  return meilleure;
}

/** Facteur de pixelisation estimé : 2 si le dessin a été agrandi ×2 au plus proche voisin, sinon 1. */
export function facteurPixels(img: ImageRGBA, seuil = 0.25): 1 | 2 {
  return partBlocsIdentiques(img) >= seuil ? 2 : 1;
}

/**
 * Remplit la couleur des pixels transparents (alpha < `seuil`) par pousser-tirer : la couleur des bords se propage
 * en douceur vers l'extérieur. L'alpha est conservé.
 */
export function remplirSousAlpha(img: ImageRGBA, seuil = 128): ImageRGBA {
  const { largeur: L, hauteur: H } = img;
  const n = L * H;
  const rgb = new Float32Array(3 * n);
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = img.donnees[4 * i + 3]! >= seuil ? 1 : 0;
    w[i] = p;
    for (let c = 0; c < 3; c++) rgb[3 * i + c] = img.donnees[4 * i + c]! * p;
  }
  const plein = tirer(rgb, w, L, H);
  const r = imageVide(L, H);
  for (let i = 0; i < n; i++) {
    const p = w[i]!;
    for (let c = 0; c < 3; c++) r.donnees[4 * i + c] = Math.round(p > 0 ? img.donnees[4 * i + c]! : plein[3 * i + c]!);
    r.donnees[4 * i + 3] = img.donnees[4 * i + 3]!;
  }
  return r;
}

/** Couleur moyenne pondérée propagée (rgb déjà multiplié par w), niveau par niveau. */
function tirer(rgbW: Float32Array, w: Float32Array, L: number, H: number): Float32Array {
  const n = L * H;
  const sortie = new Float32Array(3 * n);
  if (L <= 2 || H <= 2) {
    let s = 0;
    const m = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      s += w[i]!;
      for (let c = 0; c < 3; c++) m[c]! += rgbW[3 * i + c]!;
    }
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) sortie[3 * i + c] = s > 0 ? m[c]! / s : 128;
    return sortie;
  }
  const L2 = Math.ceil(L / 2);
  const H2 = Math.ceil(H / 2);
  const rgb2 = new Float32Array(3 * L2 * H2);
  const w2 = new Float32Array(L2 * H2);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++) {
      const i = y * L + x;
      const j = (y >> 1) * L2 + (x >> 1);
      w2[j]! += w[i]!;
      for (let c = 0; c < 3; c++) rgb2[3 * j + c]! += rgbW[3 * i + c]!;
    }
  // Normalise au niveau inférieur (poids bornés à 1 : couleur moyenne × présence).
  for (let j = 0; j < L2 * H2; j++) {
    const s = w2[j]!;
    if (s > 0) {
      const k = Math.min(1, s) / s;
      for (let c = 0; c < 3; c++) rgb2[3 * j + c]! *= k;
      w2[j] = Math.min(1, s);
    }
  }
  const bas = tirer(rgb2, w2, L2, H2);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++) {
      const i = y * L + x;
      // Interpolation bilinéaire du niveau inférieur (centres de pixels).
      const fx = Math.min(L2 - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
      const fy = Math.min(H2 - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(L2 - 1, x0 + 1);
      const y1 = Math.min(H2 - 1, y0 + 1);
      const ax = fx - x0;
      const ay = fy - y0;
      const p = w[i]!;
      for (let c = 0; c < 3; c++) {
        const v =
          (1 - ay) * ((1 - ax) * bas[3 * (y0 * L2 + x0) + c]! + ax * bas[3 * (y0 * L2 + x1) + c]!) +
          ay * ((1 - ax) * bas[3 * (y1 * L2 + x0) + c]! + ax * bas[3 * (y1 * L2 + x1) + c]!);
        sortie[3 * i + c] = p > 0 ? rgbW[3 * i + c]! / p : v;
      }
    }
  return sortie;
}

/** Réduction d'un facteur entier `f` : moyenne de chaque bloc f×f (couleur pondérée par l'alpha). */
export function reduireBoite(img: ImageRGBA, f: number): ImageRGBA {
  if (f <= 1) return { largeur: img.largeur, hauteur: img.hauteur, donnees: new Uint8Array(img.donnees) };
  const L = Math.floor(img.largeur / f);
  const H = Math.floor(img.hauteur / f);
  const r = imageVide(L, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++) {
      let a = 0;
      const c = [0, 0, 0];
      const brut = [0, 0, 0];
      for (let dy = 0; dy < f; dy++)
        for (let dx = 0; dx < f; dx++) {
          const i = 4 * ((y * f + dy) * img.largeur + x * f + dx);
          const ai = img.donnees[i + 3]!;
          a += ai;
          for (let k = 0; k < 3; k++) {
            c[k]! += img.donnees[i + k]! * ai;
            brut[k]! += img.donnees[i + k]!;
          }
        }
      const o = 4 * (y * L + x);
      for (let k = 0; k < 3; k++) r.donnees[o + k] = Math.round(a > 0 ? c[k]! / a : brut[k]! / (f * f));
      r.donnees[o + 3] = Math.round(a / (f * f));
    }
  return r;
}

/** Noyau de Catmull-Rom (bicubique, a = −0,5). */
function cubique(t: number): number {
  const x = Math.abs(t);
  if (x < 1) return 1.5 * x * x * x - 2.5 * x * x + 1;
  if (x < 2) return -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2;
  return 0;
}

/**
 * Rééchantillonnage bicubique vers `L × H` (centres de pixels alignés). La couleur est interpolée prémultipliée
 * par l'alpha (pas de liseré au bord), puis divisée.
 */
export function agrandirBicubique(img: ImageRGBA, L: number, H: number): ImageRGBA {
  const { largeur: l, hauteur: h, donnees: d } = img;
  const r = imageVide(L, H);
  const sx = l / L;
  const sy = h / H;
  const acc = [0, 0, 0, 0];
  for (let y = 0; y < H; y++) {
    const fy = (y + 0.5) * sy - 0.5;
    const y0 = Math.floor(fy);
    for (let x = 0; x < L; x++) {
      const fx = (x + 0.5) * sx - 0.5;
      const x0 = Math.floor(fx);
      acc[0] = acc[1] = acc[2] = acc[3] = 0;
      let wt = 0;
      for (let j = -1; j <= 2; j++) {
        const yy = Math.min(h - 1, Math.max(0, y0 + j));
        const wy = cubique(fy - (y0 + j));
        for (let i = -1; i <= 2; i++) {
          const xx = Math.min(l - 1, Math.max(0, x0 + i));
          const w = wy * cubique(fx - (x0 + i));
          const p = 4 * (yy * l + xx);
          const a = d[p + 3]! / 255;
          acc[0]! += w * d[p]! * a;
          acc[1]! += w * d[p + 1]! * a;
          acc[2]! += w * d[p + 2]! * a;
          acc[3]! += w * a;
          wt += w;
        }
      }
      const a = Math.min(1, Math.max(0, acc[3]! / wt));
      const o = 4 * (y * L + x);
      for (let k = 0; k < 3; k++) r.donnees[o + k] = a > 1e-4 ? Math.min(255, Math.max(0, Math.round(acc[k]! / wt / a))) : 0;
      r.donnees[o + 3] = Math.round(a * 255);
    }
  }
  return r;
}

/** Alpha « net mais adouci » : smoothstep(bas, haut) appliqué à l'alpha (0 … 1). */
export function alphaNet(img: ImageRGBA, bas = 0.3, haut = 0.7): ImageRGBA {
  const r = { largeur: img.largeur, hauteur: img.hauteur, donnees: new Uint8Array(img.donnees) };
  for (let i = 3; i < r.donnees.length; i += 4) {
    const t = Math.min(1, Math.max(0, (r.donnees[i]! / 255 - bas) / (haut - bas)));
    r.donnees[i] = Math.round(255 * t * t * (3 - 2 * t));
  }
  return r;
}

/** Remplace l'alpha de `couleur` par celui de `alpha` (mêmes dimensions). */
export function avecAlpha(couleur: ImageRGBA, alpha: ImageRGBA): ImageRGBA {
  if (couleur.largeur !== alpha.largeur || couleur.hauteur !== alpha.hauteur) throw new Error('avecAlpha : dimensions différentes');
  const r = { largeur: couleur.largeur, hauteur: couleur.hauteur, donnees: new Uint8Array(couleur.donnees) };
  for (let i = 3; i < r.donnees.length; i += 4) r.donnees[i] = alpha.donnees[i]!;
  return r;
}

/** Image opaque (alpha = 255), pour l'envoyer à un agrandisseur qui ignore l'alpha. */
export function opaque(img: ImageRGBA): ImageRGBA {
  const r = { largeur: img.largeur, hauteur: img.hauteur, donnees: new Uint8Array(img.donnees) };
  for (let i = 3; i < r.donnees.length; i += 4) r.donnees[i] = 255;
  return r;
}

/**
 * Flou de l'alpha seul (trois passes de boîte séparables de rayon `r` ≈ gaussienne σ ≈ r) : arrondit les marches
 * d'un contour agrandi avant `alphaNet`. La couleur est inchangée.
 */
export function flouAlpha(img: ImageRGBA, r: number): ImageRGBA {
  const { largeur: L, hauteur: H } = img;
  let a = new Float32Array(L * H);
  for (let i = 0; i < L * H; i++) a[i] = img.donnees[4 * i + 3]!;
  const R = Math.max(0, Math.round(r));
  if (R > 0) {
    const tmp = new Float32Array(L * H);
    const passe = (src: Float32Array, dst: Float32Array, horizontal: boolean): void => {
      const n = horizontal ? L : H;
      const m = horizontal ? H : L;
      for (let k = 0; k < m; k++) {
        const at = (i: number): number => {
          const j = Math.min(n - 1, Math.max(0, i));
          return horizontal ? src[k * L + j]! : src[j * L + k]!;
        };
        let s = 0;
        for (let i = -R; i <= R; i++) s += at(i);
        for (let i = 0; i < n; i++) {
          if (horizontal) dst[k * L + i] = s / (2 * R + 1);
          else dst[i * L + k] = s / (2 * R + 1);
          s += at(i + R + 1) - at(i - R);
        }
      }
    };
    for (let p = 0; p < 3; p++) {
      passe(a, tmp, true);
      passe(tmp, a, false);
    }
  }
  const r2 = { largeur: L, hauteur: H, donnees: new Uint8Array(img.donnees) };
  for (let i = 0; i < L * H; i++) r2.donnees[4 * i + 3] = Math.round(Math.min(255, Math.max(0, a[i]!)));
  return r2;
}
