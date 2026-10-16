/**
 * Couleur : conversions sRGB ↔ linéaire ↔ CIE Lab (D65), statistiques Lab d'une image, et étalonnage d'un
 * personnage vers son décor.
 *
 * L'étalonnage est un transfert de Reinhard **partiel** (moyenne et écart-type en Lab) : un transfert complet
 * effacerait l'identité du dessin (peau, costume de la bible). On décale donc seulement une part de l'écart :
 *   L' = μL,p + (L − μL,p)·kσ + wL·(μL,d − 55)      (le décor sombre assombrit, le décor clair éclaircit)
 *   a' = a + wab·(μa,d − μa,p·0,5)                    (dominante de couleur du décor)
 *   b' = b + wab·(μb,d − μb,p·0,5)
 * avec kσ = 1 + wσ·(σL,d/σL,p − 1) borné. Le transfert est ensuite approché par un gain et un décalage par
 * canal sRGB (`Etalonnage`, appliqué par le shader du personnage), ajustés aux moindres carrés sur des couleurs
 * tirées des statistiques du personnage. Fonctions pures.
 */
import type { Couleur, Etalonnage, StatsLab } from '../timeline/types';

/** Composante sRGB [0, 1] → linéaire. */
export function srgbVersLineaire(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Composante linéaire → sRGB [0, 1]. */
export function lineaireVersSrgb(c: number): number {
  const x = Math.max(0, c);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
}

const XN = 0.95047;
const YN = 1;
const ZN = 1.08883;
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

function fLab(t: number): number {
  return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

function fLabInverse(t: number): number {
  const t3 = t * t * t;
  return t3 > EPS ? t3 : (116 * t - 16) / KAPPA;
}

/** sRGB [0, 1] → Lab (L 0 … 100). */
export function rgbVersLab(c: Couleur): [number, number, number] {
  const r = srgbVersLineaire(c[0]);
  const g = srgbVersLineaire(c[1]);
  const b = srgbVersLineaire(c[2]);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / XN;
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / YN;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / ZN;
  const fx = fLab(x);
  const fy = fLab(y);
  const fz = fLab(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Lab → sRGB [0, 1] (non borné : peut sortir de la gamme). */
export function labVersRgb(lab: readonly [number, number, number]): [number, number, number] {
  const fy = (lab[0] + 16) / 116;
  const fx = fy + lab[1] / 500;
  const fz = fy - lab[2] / 200;
  const x = fLabInverse(fx) * XN;
  const y = fLabInverse(fy) * YN;
  const z = fLabInverse(fz) * ZN;
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return [lineaireVersSrgb(r), lineaireVersSrgb(g), lineaireVersSrgb(b)];
}

/** Luminance relative (linéaire) d'une couleur sRGB. */
export function luminance(c: Couleur): number {
  return 0.2126 * srgbVersLineaire(c[0]) + 0.7152 * srgbVersLineaire(c[1]) + 0.0722 * srgbVersLineaire(c[2]);
}

/** Accumulateur de statistiques Lab (moyenne et écart-type pondérés). */
export class AccumulateurLab {
  private s = [0, 0, 0];
  private s2 = [0, 0, 0];
  private w = 0;

  /** Ajoute une couleur sRGB 8 bits avec un poids. */
  ajouterOctets(r: number, g: number, b: number, poids = 1): void {
    if (poids <= 0) return;
    const lab = labOctets(r, g, b);
    for (let k = 0; k < 3; k++) {
      this.s[k]! += poids * lab[k]!;
      this.s2[k]! += poids * lab[k]! * lab[k]!;
    }
    this.w += poids;
  }

  /** Poids total accumulé. */
  get poids(): number {
    return this.w;
  }

  /** Statistiques (repli neutre si vide). */
  stats(): StatsLab {
    if (this.w <= 0) return { moyenne: [50, 0, 0], ecart: [20, 8, 8] };
    const m = this.s.map((x) => x / this.w);
    const e = this.s2.map((x, k) => Math.sqrt(Math.max(0, x / this.w - m[k]! * m[k]!)));
    return { moyenne: [m[0]!, m[1]!, m[2]!], ecart: [e[0]!, e[1]!, e[2]!] };
  }
}

/** Table de conversion octet sRGB → linéaire (accélère les statistiques sur de grandes images). */
const LIN8 = (() => {
  const t = new Float64Array(256);
  for (let i = 0; i < 256; i++) t[i] = srgbVersLineaire(i / 255);
  return t;
})();

/** Lab d'une couleur sRGB 8 bits. */
export function labOctets(r: number, g: number, b: number): [number, number, number] {
  const rl = LIN8[r & 255]!;
  const gl = LIN8[g & 255]!;
  const bl = LIN8[b & 255]!;
  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / XN;
  const y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl;
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / ZN;
  const fy = fLab(y);
  return [116 * fy - 16, 500 * (fLab(x) - fy), 200 * (fy - fLab(z))];
}

/**
 * Statistiques Lab des pixels d'une image RGBA 8 bits, pondérés par l'alpha (× un poids facultatif par pixel).
 * `pas` sous-échantillonne (1 = tous les pixels).
 */
export function statsLabImage(
  donnees: ArrayLike<number>,
  largeur: number,
  hauteur: number,
  options: { pas?: number; poids?: (x: number, y: number) => number; seuilAlpha?: number } = {},
): StatsLab {
  const pas = Math.max(1, Math.floor(options.pas ?? 1));
  const seuil = options.seuilAlpha ?? 0.5;
  const acc = new AccumulateurLab();
  for (let y = 0; y < hauteur; y += pas) {
    for (let x = 0; x < largeur; x += pas) {
      const i = 4 * (y * largeur + x);
      const a = (donnees[i + 3] ?? 255) / 255;
      if (a < seuil) continue;
      const w = options.poids ? options.poids(x, y) : 1;
      if (w > 0) acc.ajouterOctets(donnees[i]!, donnees[i + 1]!, donnees[i + 2]!, w * a);
    }
  }
  return acc.stats();
}

/** Réglages du transfert partiel. */
export interface ReglagesTransfert {
  /** Part du décalage de luminance vers celle du décor (défaut 0,35). */
  wL: number;
  /** Part de la dominante a/b du décor (défaut 0,25). */
  wab: number;
  /** Part de l'adaptation du contraste (défaut 0,2). */
  wSigma: number;
  /** Luminance de référence d'un décor « neutre » (défaut 55). */
  Lref: number;
}

export const TRANSFERT_DEFAUT: Readonly<ReglagesTransfert> = Object.freeze({ wL: 0.35, wab: 0.25, wSigma: 0.2, Lref: 55 });

/** Transfert partiel d'une couleur Lab du personnage vers le décor. */
export function transfererLab(
  lab: readonly [number, number, number],
  perso: StatsLab,
  decor: StatsLab,
  r: ReglagesTransfert = TRANSFERT_DEFAUT,
): [number, number, number] {
  const ratio = decor.ecart[0] / Math.max(1e-3, perso.ecart[0]);
  const k = Math.min(1.25, Math.max(0.8, 1 + r.wSigma * (ratio - 1)));
  const L = perso.moyenne[0] + (lab[0] - perso.moyenne[0]) * k + r.wL * (decor.moyenne[0] - r.Lref);
  const a = lab[1] + r.wab * (decor.moyenne[1] - 0.5 * perso.moyenne[1]);
  const b = lab[2] + r.wab * (decor.moyenne[2] - 0.5 * perso.moyenne[2]);
  return [L, a, b];
}

/** Étalonnage identité. */
export function etalonnageIdentite(): Etalonnage {
  return { gain: [1, 1, 1], decalage: [0, 0, 0] };
}

/**
 * Étalonnage par canal (gain, décalage) qui approche au mieux le transfert partiel sur 27 couleurs tirées des
 * statistiques du personnage (μ ± 1,3σ sur chaque axe Lab). Gains bornés à [0,6 ; 1,4], décalages à ±0,2.
 */
export function etalonnageVersDecor(
  perso: StatsLab,
  decor: StatsLab,
  r: ReglagesTransfert = TRANSFERT_DEFAUT,
  force = 1,
): Etalonnage {
  const xs: number[][] = [[], [], []];
  const ys: number[][] = [[], [], []];
  const pas = [-1.3, 0, 1.3];
  for (const i of pas)
    for (const j of pas)
      for (const k of pas) {
        const lab: [number, number, number] = [
          Math.min(98, Math.max(2, perso.moyenne[0] + i * perso.ecart[0])),
          perso.moyenne[1] + j * perso.ecart[1],
          perso.moyenne[2] + k * perso.ecart[2],
        ];
        const avant = labVersRgb(lab).map((c) => Math.min(1, Math.max(0, c)));
        const apres = labVersRgb(transfererLab(lab, perso, decor, r)).map((c) => Math.min(1, Math.max(0, c)));
        for (let c = 0; c < 3; c++) {
          xs[c]!.push(avant[c]!);
          ys[c]!.push(avant[c]! + force * (apres[c]! - avant[c]!));
        }
      }
  const gain: number[] = [];
  const decalage: number[] = [];
  for (let c = 0; c < 3; c++) {
    const x = xs[c]!;
    const y = ys[c]!;
    const n = x.length;
    const mx = x.reduce((s, v) => s + v, 0) / n;
    const my = y.reduce((s, v) => s + v, 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      sxy += (x[i]! - mx) * (y[i]! - my);
      sxx += (x[i]! - mx) ** 2;
    }
    const g = Math.min(1.4, Math.max(0.6, sxx > 1e-9 ? sxy / sxx : 1));
    const o = Math.min(0.2, Math.max(-0.2, my - g * mx));
    gain.push(arrondir(g));
    decalage.push(arrondir(o));
  }
  return { gain: [gain[0]!, gain[1]!, gain[2]!], decalage: [decalage[0]!, decalage[1]!, decalage[2]!] };
}

/** Mélange de deux statistiques Lab (`u` = part de `b`). */
export function melangerStats(a: StatsLab, b: StatsLab, u: number): StatsLab {
  const m = (x: readonly number[], y: readonly number[]): [number, number, number] => [
    x[0]! + (y[0]! - x[0]!) * u,
    x[1]! + (y[1]! - x[1]!) * u,
    x[2]! + (y[2]! - x[2]!) * u,
  ];
  return { moyenne: m(a.moyenne, b.moyenne), ecart: m(a.ecart, b.ecart) };
}

function arrondir(x: number): number {
  return Math.round(x * 1e5) / 1e5;
}
