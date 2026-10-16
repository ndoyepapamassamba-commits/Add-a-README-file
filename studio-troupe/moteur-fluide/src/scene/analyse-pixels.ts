/**
 * Analyse d'un décor à partir de ses pixels (pure, sans Node ni navigateur) : statistiques Lab globales et locales
 * hors figurants et hors ciel, lumière dominante (direction, couleur, contraste), profondeur du sol par ajustement
 * linéaire sur la carte de profondeur, parts du ciel et des figurants. Utilisée par `scene/analyse` (Node, décodage
 * par FFmpeg) et par la page de rendu (décodage par le navigateur).
 */
import type { AnalyseDecor, InfoDecor, Vec2 } from '../timeline/types';
import { AccumulateurLab, srgbVersLineaire } from './couleur';
import { HAUTEUR_OEIL_M } from './sol';

/** Image RGBA 8 bits. */
export interface PixelsRGBA {
  largeur: number;
  hauteur: number;
  donnees: Uint8Array | Uint8ClampedArray;
}

/** Échantillonne une image RGBA au point (u, v) ∈ [0, 1]² (plus proche voisin), canal `c`, en [0, 1]. */
export function echantillon(img: PixelsRGBA, u: number, v: number, c: number): number {
  const x = Math.min(img.largeur - 1, Math.max(0, Math.floor(u * img.largeur)));
  const y = Math.min(img.hauteur - 1, Math.max(0, Math.floor(v * img.hauteur)));
  return img.donnees[4 * (y * img.largeur + x) + c]! / 255;
}

/** Échantillonnage bilinéaire d'un canal (u, v ∈ [0, 1], bords prolongés). */
export function bilineaire(img: PixelsRGBA, u: number, v: number, c: number): number {
  const x = Math.min(img.largeur - 1, Math.max(0, u * img.largeur - 0.5));
  const y = Math.min(img.hauteur - 1, Math.max(0, v * img.hauteur - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(img.largeur - 1, x0 + 1);
  const y1 = Math.min(img.hauteur - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const d = img.donnees;
  const L = img.largeur;
  const a = d[4 * (y0 * L + x0) + c]!;
  const b = d[4 * (y0 * L + x1) + c]!;
  const e = d[4 * (y1 * L + x0) + c]!;
  const f = d[4 * (y1 * L + x1) + c]!;
  return ((a * (1 - fx) + b * fx) * (1 - fy) + (e * (1 - fx) + f * fx) * fy) / 255;
}

/** Options de l'analyse. */
export interface OptionsAnalyse {
  colonnes?: number;
  lignes?: number;
}

/**
 * Analyse un décor. `plaque` : peinture sans figurants ; `masques` : rouge = figurants, vert = ciel ;
 * `profondeur` : profondeur de la plaque (gris, clair = proche). Les trois images peuvent avoir des tailles
 * différentes (échantillonnage en coordonnées normalisées).
 */
export function analyserPixelsDecor(
  plaque: PixelsRGBA,
  masques: PixelsRGBA,
  profondeur: PixelsRGBA,
  fit: InfoDecor['fit'],
  options: OptionsAnalyse = {},
): AnalyseDecor {
  const C = options.colonnes ?? 8;
  const R = options.lignes ?? 4;
  const W = plaque.largeur;
  const H = plaque.hauteur;
  const global = new AccumulateurLab();
  const cellules = Array.from({ length: C * R }, () => new AccumulateurLab());
  const comptes = new Array<number>(C * R).fill(0);
  let ciel = 0;
  let figurants = 0;
  const lums: number[] = [];
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    const ligne = Math.min(R - 1, Math.floor(v * R));
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const i = 4 * (y * W + x);
      const r = plaque.donnees[i]!;
      const g = plaque.donnees[i + 1]!;
      const b = plaque.donnees[i + 2]!;
      const mr = echantillon(masques, u, v, 0);
      const mg = echantillon(masques, u, v, 1);
      ciel += mg;
      figurants += mr;
      const lum = 0.2126 * srgbVersLineaire(r / 255) + 0.7152 * srgbVersLineaire(g / 255) + 0.0722 * srgbVersLineaire(b / 255);
      lums.push(lum);
      const w = (1 - mr) * (1 - mg);
      const k = ligne * C + Math.min(C - 1, Math.floor(u * C));
      comptes[k]!++;
      if (w <= 0.05) continue;
      global.ajouterOctets(r, g, b, w);
      cellules[k]!.ajouterOctets(r, g, b, w);
    }
  }
  const n = W * H;
  const lab = global.stats();
  const grille = {
    colonnes: C,
    lignes: R,
    moyennes: cellules.map((c) => arrondir3(c.stats().moyenne)),
    ecarts: cellules.map((c) => arrondir3(c.stats().ecart)),
    poids: cellules.map((c, k) => arrondir(c.poids / Math.max(1, comptes[k]!))),
  };

  // Lumière : barycentre des 3 % de pixels les plus lumineux, vu depuis le centre de l'image.
  const tri = Float64Array.from(lums).sort();
  const seuil = tri[Math.floor(0.97 * (tri.length - 1))]!;
  const p50 = tri[Math.floor(0.5 * (tri.length - 1))]!;
  const p95 = tri[Math.floor(0.95 * (tri.length - 1))]!;
  let sx = 0;
  let sy = 0;
  let sw = 0;
  const coul = [0, 0, 0];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const lum = lums[y * W + x]!;
      if (lum < seuil) continue;
      const w = lum;
      sx += w * ((x + 0.5) / W - 0.5);
      sy += w * ((y + 0.5) / H - 0.55);
      sw += w;
      const i = 4 * (y * W + x);
      coul[0]! += w * plaque.donnees[i]!;
      coul[1]! += w * plaque.donnees[i + 1]!;
      coul[2]! += w * plaque.donnees[i + 2]!;
    }
  }
  let direction: Vec2 = { x: 0, y: -1 };
  if (sw > 0) {
    const dx = sx / sw;
    const dy = sy / sw - 0.25; // biais vers le haut : la lumière vient presque toujours d'en haut
    const l = Math.hypot(dx, dy);
    if (l > 1e-6) direction = { x: arrondir(dx / l), y: arrondir(dy / l) };
  }
  let couleur: [number, number, number] = [1, 0.95, 0.85];
  if (sw > 0) {
    const c = coul.map((x) => x / sw / 255);
    const m = Math.max(1e-6, ...c);
    const norm = c.map((x) => x / m);
    const gris = (norm[0]! + norm[1]! + norm[2]!) / 3;
    couleur = norm.map((x) => arrondir(x * 0.7 + gris * 0.3)) as [number, number, number];
  }
  // Contraste de la lumière : écart entre les clartés L* des centiles 95 et 50, rapporté à 70.
  const clarte = (y: number) => (y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y);
  const contraste = arrondir(Math.min(1, Math.max(0, (clarte(p95) - clarte(p50)) / 70)));

  // Sol : profondeur médiane par ligne sous l'horizon, ajustée linéairement en v.
  const vh = fit.floor - HAUTEUR_OEIL_M / fit.mH;
  const v0 = Math.max(vh + 0.05, 0.55);
  const pts: Array<[number, number]> = [];
  const PH = profondeur.hauteur;
  const PW = profondeur.largeur;
  for (let y = 0; y < PH; y++) {
    const v = (y + 0.5) / PH;
    if (v < v0 || v > 0.99) continue;
    const vals: number[] = [];
    for (let x = 0; x < PW; x++) {
      const u = (x + 0.5) / PW;
      if (echantillon(masques, u, v, 0) > 0.5) continue;
      vals.push(profondeur.donnees[4 * (y * PW + x)]! / 255);
    }
    if (vals.length < PW * 0.2) continue;
    vals.sort((a, b) => a - b);
    pts.push([v, vals[Math.floor(vals.length / 2)]!]);
  }
  let sol = { a: 0, b: 0.8, r2: 0 };
  if (pts.length >= 4) {
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (const [x, y] of pts) {
      sxy += (x - mx) * (y - my);
      sxx += (x - mx) ** 2;
      syy += (y - my) ** 2;
    }
    const a = sxx > 0 ? sxy / sxx : 0;
    const b = my - a * mx;
    const r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
    sol = { a: arrondir(a), b: arrondir(b), r2: arrondir(r2) };
  }

  return {
    version: 1,
    lab: { moyenne: arrondir3(lab.moyenne), ecart: arrondir3(lab.ecart) },
    grille,
    lumiere: { direction, couleur, contraste },
    sol,
    ciel: arrondir(ciel / n),
    figurants: arrondir(figurants / n),
  };
}

function arrondir(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

function arrondir3(v: readonly number[]): [number, number, number] {
  return [arrondir(v[0]!), arrondir(v[1]!), arrondir(v[2]!)];
}
