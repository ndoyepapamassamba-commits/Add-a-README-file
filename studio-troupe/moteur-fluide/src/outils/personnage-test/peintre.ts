/**
 * Peintre de calques SDF : rendu « argile peinte » d'un personnage (relief par la distance au bord, lumière clé
 * chaude, débouchage froid, contre-jour, diffusion sous la peau, reflets doux, ombres portées et occlusion entre
 * calques), anticrénelé, sur fond transparent. Produit aussi la carte des parties (os de chaque pixel).
 * Calcul en lumière linéaire, sortie sRGB non prémultipliée.
 */
import type { Forme } from './sdf';

/** Couleur sRGB dans [0, 1]. */
export type Rvb = readonly [number, number, number];

/** Matière d'un calque. */
export interface Matiere {
  /** Couleur de base (sRGB), fixe ou variable (texture peinte). */
  albedo: Rvb | ((x: number, y: number) => Rvb);
  /** Rayon du relief (px) : profil circulaire de profondeur `relief` depuis le bord. 0 = plat. */
  relief: number;
  /** Intensité et dureté du reflet. */
  speculaire?: number;
  brillance?: number;
  /** Enveloppe de la diffuse (0 = Lambert dur ; 0,4 = doux). */
  enveloppe?: number;
  /** Diffusion sous la peau (terminateur chaud). */
  peau?: boolean;
  /** Contre-jour (0 … 1). */
  contreJour?: number;
  /** Assombrissement du lisere (0 … 1). */
  lisere?: number;
  /** Relief de surface (bosses) : hauteur en px, pour les cheveux, le tissu… */
  bosses?: (x: number, y: number) => number;
  /** Lumière propre (éclat des yeux) : la couleur est émise telle quelle. */
  emissif?: boolean;
}

/** Ombre portée ou occlusion d'une forme sur le calque. */
export interface Ombre {
  forme: Forme;
  dx: number;
  dy: number;
  flou: number;
  force: number;
}

/** Étiquette de partie : os fixe ou choisi par pixel. */
export type Etiquette = string | ((x: number, y: number) => string);

/** Un calque. */
export interface Calque {
  nom: string;
  forme: Forme;
  matiere: Matiere;
  /** Os porté (carte des parties). Une liste [forme, os] choisit l'os de la sous-forme la plus « intérieure ». */
  os?: Etiquette | Array<[Forme, Etiquette]>;
  ombres?: Ombre[];
  /** Découpe : le calque n'apparaît que dans cette forme. */
  decoupe?: Forme;
  /** `multiplier` : détail (couture, pli, salissure) qui teinte sans changer l'alpha ni les parties. */
  mode?: 'normal' | 'multiplier' | 'ecran';
  opacite?: number;
  /** Largeur de l'anticrénelage (px). Défaut 1. */
  flou?: number;
}

/** Résultat du rendu. */
export interface Peinture {
  largeur: number;
  hauteur: number;
  /** RGBA 8 bits non prémultiplié (sRGB). */
  rgba: Uint8Array;
  /** Index de partie par pixel (−1 = aucune) dans `parties`. */
  partieParPixel: Int16Array;
  parties: string[];
}

const versLin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const versSrgb = (c: number): number => {
  const x = Math.min(1, Math.max(0, c));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
};
const lisse = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const norm3 = (x: number, y: number, z: number): [number, number, number] => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

/** Éclairage de la scène (repère image : x droite, y bas, z vers le spectateur). */
const CLE = norm3(-0.5, -0.62, 0.6);
const COULEUR_CLE: Rvb = [1.08, 1.0, 0.9];
const DEBOUCHE = norm3(0.75, -0.1, 0.65);
const COULEUR_DEBOUCHE: Rvb = [0.3, 0.35, 0.45];
const CIEL: Rvb = [0.3, 0.33, 0.4];
const SOL: Rvb = [0.2, 0.16, 0.13];
const CONTRE: [number, number] = [0.86, -0.5];
const COULEUR_CONTRE: Rvb = [1.0, 0.88, 0.7];
const DEMI_CLE = norm3(CLE[0], CLE[1], CLE[2] + 1);

/** Flou boîte séparable (deux passes ≈ gaussien) d'une grille, bords répétés. */
function flouBoite(g: Float32Array, l: number, h: number, r: number): Float32Array {
  let a = Float32Array.from(g);
  const b = new Float32Array(g.length);
  for (let passe = 0; passe < 2; passe++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < l; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += a[y * l + Math.min(l - 1, Math.max(0, x + k))]!;
        b[y * l + x] = s / (2 * r + 1);
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < l; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += b[Math.min(h - 1, Math.max(0, y + k)) * l + x]!;
        a[y * l + x] = s / (2 * r + 1);
      }
    }
  }
  return a;
}

/** Peint une pile de calques (du fond vers l'avant). */
export function peindre(largeur: number, hauteur: number, calques: readonly Calque[]): Peinture {
  const n = largeur * hauteur;
  const rgb = new Float32Array(3 * n); // linéaire prémultiplié
  const alpha = new Float32Array(n);
  const partieParPixel = new Int16Array(n).fill(-1);
  const parties: string[] = [];
  const indexPartie = (nom: string): number => {
    let i = parties.indexOf(nom);
    if (i < 0) {
      i = parties.length;
      parties.push(nom);
    }
    return i;
  };
  for (const c of calques) {
    const flou = c.flou ?? 1;
    const b = c.decoupe ? [Math.max(c.forme.boite[0], c.decoupe.boite[0]), Math.max(c.forme.boite[1], c.decoupe.boite[1]), Math.min(c.forme.boite[2], c.decoupe.boite[2]), Math.min(c.forme.boite[3], c.decoupe.boite[3])] : c.forme.boite;
    const x0 = Math.max(0, Math.floor(b[0]! - 3));
    const y0 = Math.max(0, Math.floor(b[1]! - 3));
    const x1 = Math.min(largeur - 1, Math.ceil(b[2]! + 3));
    const y1 = Math.min(hauteur - 1, Math.ceil(b[3]! + 3));
    if (x1 < x0 || y1 < y0) continue;
    // Grille des distances (marge d'un pixel pour le gradient).
    const gl = x1 - x0 + 3;
    const gh = y1 - y0 + 3;
    const g = new Float32Array(gl * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gl; i++) g[j * gl + i] = c.forme.f(x0 - 1 + i + 0.5, y0 - 1 + j + 0.5);
    const m = c.matiere;
    // Champ lissé pour les normales des grands reliefs : efface les arêtes de l'axe médian (coins de polygone).
    const rayonFlou = Math.round(m.relief * 0.1);
    const gn = rayonFlou >= 2 ? flouBoite(g, gl, gh, rayonFlou) : g;
    const albedoFixe = typeof m.albedo === 'function' ? null : m.albedo;
    const opacite = c.opacite ?? 1;
    const mode = c.mode ?? 'normal';
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const gi = (y - y0 + 1) * gl + (x - x0 + 1);
        const d = g[gi]!;
        if (d > flou) continue;
        let couv = Math.min(1, Math.max(0, 0.5 - d / flou));
        const px = x + 0.5;
        const py = y + 0.5;
        if (c.decoupe) couv *= Math.min(1, Math.max(0, 0.5 - c.decoupe.f(px, py)));
        couv *= opacite;
        if (couv <= 0) continue;
        const albedo = albedoFixe ?? (m.albedo as (x: number, y: number) => Rvb)(px, py);
        let r = versLin(albedo[0]);
        let v = versLin(albedo[1]);
        let bl = versLin(albedo[2]);
        if (!m.emissif && mode === 'normal') {
          // Normale : profil circulaire de rayon `relief` depuis le bord.
          let gx = (gn[gi + 1]! - gn[gi - 1]!) / 2;
          let gy = (gn[gi + gl]! - gn[gi - gl]!) / 2;
          const lg = Math.hypot(gx, gy) || 1;
          gx /= lg;
          gy /= lg;
          const prof = Math.max(0, -Math.max(d, gn[gi]!));
          let nx = 0;
          let ny = 0;
          let nz = 1;
          if (m.relief > 0) {
            const s = Math.min(1, Math.max(0, 1 - prof / m.relief)) ** 1.15 * 0.97;
            nx = gx * s;
            ny = gy * s;
            nz = Math.sqrt(Math.max(0, 1 - s * s));
          }
          if (m.bosses) {
            const h0 = m.bosses(px, py);
            const bx = m.bosses(px + 1, py) - h0;
            const by = m.bosses(px, py + 1) - h0;
            nx -= bx;
            ny -= by;
          }
          [nx, ny, nz] = norm3(nx, ny, nz);
          const env = m.enveloppe ?? 0.25;
          const ndl = nx * CLE[0] + ny * CLE[1] + nz * CLE[2];
          const diff = Math.max(0, (ndl + env) / (1 + env));
          const ndf = Math.max(0, (nx * DEBOUCHE[0] + ny * DEBOUCHE[1] + nz * DEBOUCHE[2] + 0.3) / 1.3);
          const ciel = 0.5 - 0.5 * ny;
          let kr = COULEUR_CLE[0] * diff;
          let kv = COULEUR_CLE[1] * diff;
          let kb = COULEUR_CLE[2] * diff;
          if (m.peau) {
            // Terminateur chaud : la lumière rasante rougit.
            const t = lisse(0, 0.55, diff);
            kr *= 1.12 - 0.12 * t;
            kv *= 0.78 + 0.22 * t;
            kb *= 0.68 + 0.32 * t;
          }
          // Ombres portées / occlusion des calques supérieurs ou voisins.
          let ombre = 1;
          for (const o of c.ombres ?? []) {
            const od = o.forme.f(px - o.dx, py - o.dy);
            ombre *= 1 - o.force * (1 - lisse(-o.flou, o.flou, od));
          }
          const ar = SOL[0] + (CIEL[0] - SOL[0]) * ciel + COULEUR_DEBOUCHE[0] * ndf;
          const av = SOL[1] + (CIEL[1] - SOL[1]) * ciel + COULEUR_DEBOUCHE[1] * ndf;
          const ab = SOL[2] + (CIEL[2] - SOL[2]) * ciel + COULEUR_DEBOUCHE[2] * ndf;
          const occl = 0.55 + 0.45 * ombre;
          let or = r * (ar * occl + kr * ombre);
          let ov = v * (av * occl + kv * ombre);
          let ob = bl * (ab * occl + kb * ombre);
          if (m.peau) {
            const sss = (1 - diff) * 0.1;
            or += r * sss * 1.0;
            ov += v * sss * 0.35;
            ob += bl * sss * 0.25;
          }
          const spec = (m.speculaire ?? 0.05) * Math.max(0, nx * DEMI_CLE[0] + ny * DEMI_CLE[1] + nz * DEMI_CLE[2]) ** (m.brillance ?? 12) * ombre;
          const contre = (m.contreJour ?? 0.25) * (1 - nz) ** 2 * Math.max(0, nx * CONTRE[0] + ny * CONTRE[1]);
          or += spec * COULEUR_CLE[0] + contre * COULEUR_CONTRE[0] * (0.3 + r);
          ov += spec * COULEUR_CLE[1] + contre * COULEUR_CONTRE[1] * (0.3 + v);
          ob += spec * COULEUR_CLE[2] + contre * COULEUR_CONTRE[2] * (0.3 + bl);
          const lis = (m.lisere ?? 0.15) * (1 - lisse(0, 3.5, prof));
          r = or * (1 - lis);
          v = ov * (1 - lis);
          bl = ob * (1 - lis);
        }
        const i = y * largeur + x;
        if (mode === 'multiplier') {
          const k = couv;
          rgb[3 * i] = rgb[3 * i]! * (1 - k + k * r);
          rgb[3 * i + 1] = rgb[3 * i + 1]! * (1 - k + k * v);
          rgb[3 * i + 2] = rgb[3 * i + 2]! * (1 - k + k * bl);
          continue;
        }
        if (mode === 'ecran') {
          const k = couv * alpha[i]!;
          rgb[3 * i] = rgb[3 * i]! + k * r * (1 - rgb[3 * i]! / Math.max(alpha[i]!, 1e-6));
          rgb[3 * i + 1] = rgb[3 * i + 1]! + k * v * (1 - rgb[3 * i + 1]! / Math.max(alpha[i]!, 1e-6));
          rgb[3 * i + 2] = rgb[3 * i + 2]! + k * bl * (1 - rgb[3 * i + 2]! / Math.max(alpha[i]!, 1e-6));
          continue;
        }
        rgb[3 * i] = r * couv + rgb[3 * i]! * (1 - couv);
        rgb[3 * i + 1] = v * couv + rgb[3 * i + 1]! * (1 - couv);
        rgb[3 * i + 2] = bl * couv + rgb[3 * i + 2]! * (1 - couv);
        alpha[i] = couv + alpha[i]! * (1 - couv);
        if (c.os !== undefined && couv >= 0.5) {
          let nom: string;
          if (Array.isArray(c.os)) {
            let best = Number.POSITIVE_INFINITY;
            let e: Etiquette = c.os[0]![1];
            for (const [f, et] of c.os) {
              const dv = f.f(px, py);
              if (dv < best) {
                best = dv;
                e = et;
              }
            }
            nom = typeof e === 'function' ? e(px, py) : e;
          } else nom = typeof c.os === 'function' ? c.os(px, py) : c.os;
          partieParPixel[i] = indexPartie(nom);
        }
      }
    }
  }
  const rgba = new Uint8Array(4 * n);
  for (let i = 0; i < n; i++) {
    const a = alpha[i]!;
    if (a <= 1e-4) continue;
    rgba[4 * i] = Math.round(255 * versSrgb(rgb[3 * i]! / a));
    rgba[4 * i + 1] = Math.round(255 * versSrgb(rgb[3 * i + 1]! / a));
    rgba[4 * i + 2] = Math.round(255 * versSrgb(rgb[3 * i + 2]! / a));
    rgba[4 * i + 3] = Math.round(255 * Math.min(1, a));
  }
  return { largeur, hauteur, rgba, partieParPixel, parties };
}
