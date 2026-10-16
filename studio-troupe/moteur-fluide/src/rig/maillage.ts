/**
 * Maillage d'un personnage tiré de son masque alpha (import, une fois par image) :
 *
 * 1. masque binaire `α ≥ seuil` → champ de distance signé exact ;
 * 2. contours de l'iso-ligne `distance = marge` (masque dilaté de `marge` px) par **marching squares** avec
 *    interpolation linéaire (contours sous-pixel, lisses) ; levée des selles par la valeur au centre de la cellule ;
 * 3. simplification de Douglas-Peucker (tolérance < marge : le polygone contient toujours le masque) puis
 *    rééchantillonnage au **pas local** ;
 * 4. points de Steiner intérieurs à **densité adaptative** (fins aux articulations et au visage, larges ailleurs),
 *    gardés à distance du bord, par tirage glouton déterministe sur un réseau hexagonal fin ;
 * 5. Delaunay (delaunator) rendue **conforme** : tout segment de contour absent de la triangulation est coupé en son
 *    milieu, et les points de Steiner qui empiètent sur le cercle diamétral d'un segment sont retirés, jusqu'à ce que
 *    tous les segments soient des arêtes. Chaque triangle est alors entièrement dedans ou entièrement dehors :
 *    aucun triangle ne franchit un vide (entre le bras et le torse, entre les jambes) ;
 * 6. tri pair-impair des triangles (centroïde dans le polygone, trous compris), compactage, UV.
 *
 * Module pur (aucun accès disque) : l'image arrive en RGBA brut.
 */
import Delaunator from 'delaunator';
import type { Vec2 } from '../timeline/types';
import { distanceSignee, echantillonner } from './distance';

/** Image RGBA 8 bits non prémultipliée. */
export interface ImageRGBA {
  largeur: number;
  hauteur: number;
  donnees: Uint8Array | Uint8ClampedArray;
}

/** Zone de densité : pas `pas` jusqu'à `0,5·rayon` du centre, raccord doux vers le pas de base à `rayon`. */
export interface ZoneDensite {
  centre: Vec2;
  rayon: number;
  pas: number;
}

/** Réglages du maillage. */
export interface OptionsMaillage {
  /** Seuil d'alpha (0–255) du masque. Défaut 12 : les bords anticrénelés sont couverts. */
  seuilAlpha?: number;
  /** Dilatation du masque avant le contour (px). Défaut 1,5. */
  marge?: number;
  /** Tolérance de Douglas-Peucker (px). Défaut 0,6 (doit rester < marge). */
  tolerance?: number;
  /** Pas de base des sommets intérieurs (px). Défaut : hauteur du masque / 72. */
  pas?: number;
  /** Zones plus fines (articulations, visage). */
  zones?: ZoneDensite[];
  /** Pas du contour relatif au pas intérieur local. Défaut 0,7. */
  facteurBord?: number;
  /** Aire minimale d'une boucle de contour (px²) : les poussières et micro-trous sont ignorés. Défaut 24. */
  aireMinBoucle?: number;
  /** Itérations maximales de mise en conformité. Défaut 16. */
  iterationsConformite?: number;
}

/** Maillage brut (avant poids et groupes). */
export interface MaillageBrut {
  /** 2V, px image. */
  positions: Float64Array;
  /** 3T, sens quelconque. */
  triangles: Uint32Array;
  /** Boucles de contour (indices de sommets dans l'ordre), la plus grande d'abord. */
  boucles: number[][];
  /** Nombre de sommets du contour (les premiers sommets : `0 … nbBord − 1`). */
  nbBord: number;
  /** Champ de distance signé du masque (px), réutilisé par les poids. */
  distance: Float32Array;
  /** Masque binaire `α ≥ seuil`. */
  masque: Uint8Array;
  largeur: number;
  hauteur: number;
  /** Mesures de contrôle. */
  stats: StatsMaillage;
}

/** Mesures de contrôle du maillage. */
export interface StatsMaillage {
  sommets: number;
  triangles: number;
  boucles: number;
  /** Segments de contour absents de la triangulation après mise en conformité (0 attendu). */
  segmentsManquants: number;
  iterationsConformite: number;
  /** Angle minimal des triangles : 5e centile et minimum (degrés). */
  angleMinP5: number;
  angleMin: number;
  dureeMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Masque et contours
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Masque binaire `α ≥ seuil`. */
export function masqueAlpha(image: ImageRGBA, seuil = 12): Uint8Array {
  const n = image.largeur * image.hauteur;
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) m[i] = image.donnees[4 * i + 3]! >= seuil ? 1 : 0;
  return m;
}

/**
 * Contours de l'iso-ligne `champ = niveau` (champ défini aux centres des pixels, « dedans » = valeurs inférieures),
 * par marching squares. Le pourtour de l'image compte comme « dehors » : toutes les boucles sont fermées.
 * Renvoie des boucles de points `[x0, y0, x1, y1, …]` (px image, centres de pixels aux coordonnées entières + 0,5).
 */
export function contoursIso(champ: Float32Array, largeur: number, hauteur: number, niveau: number): Float64Array[] {
  // Grille complétée d'une bordure « dehors ».
  const L = largeur + 2;
  const H = hauteur + 2;
  const g = new Float64Array(L * H).fill(1e6);
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) g[(y + 1) * L + (x + 1)] = champ[y * largeur + x]! - niveau;
  }
  // Points de passage, indexés par arête de grille : 2·(j·L + i) (horizontale), +1 (verticale).
  const px = new Map<number, number>();
  const ptsX: number[] = [];
  const ptsY: number[] = [];
  const point = (cle: number, ax: number, ay: number, bx: number, by: number, fa: number, fb: number): number => {
    const deja = px.get(cle);
    if (deja !== undefined) return deja;
    const t = fa / (fa - fb);
    const id = ptsX.length;
    // Coordonnées image : centre du pixel (i − 1, j − 1) de la grille complétée = (i − 0,5, j − 0,5).
    ptsX.push(ax + (bx - ax) * t - 0.5);
    ptsY.push(ay + (by - ay) * t - 0.5);
    px.set(cle, id);
    return id;
  };
  // Adjacence non orientée : chaque point appartient à exactement deux segments.
  const voisins: number[] = []; // 2 par point, −1 = libre
  const lier = (a: number, b: number): void => {
    while (voisins.length < 2 * ptsX.length) voisins.push(-1);
    if (voisins[2 * a] === -1) voisins[2 * a] = b;
    else voisins[2 * a + 1] = b;
    if (voisins[2 * b] === -1) voisins[2 * b] = a;
    else voisins[2 * b + 1] = a;
  };
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < L - 1; i++) {
      const f0 = g[j * L + i]!; // haut gauche
      const f1 = g[j * L + i + 1]!; // haut droite
      const f2 = g[(j + 1) * L + i + 1]!; // bas droite
      const f3 = g[(j + 1) * L + i]!; // bas gauche
      const b0 = f0 < 0;
      const b1 = f1 < 0;
      const b2 = f2 < 0;
      const b3 = f3 < 0;
      const cas = (b0 ? 1 : 0) | (b1 ? 2 : 0) | (b2 ? 4 : 0) | (b3 ? 8 : 0);
      if (cas === 0 || cas === 15) continue;
      const haut = (): number => point(2 * (j * L + i), i, j, i + 1, j, f0, f1);
      const bas = (): number => point(2 * ((j + 1) * L + i), i, j + 1, i + 1, j + 1, f3, f2);
      const gauche = (): number => point(2 * (j * L + i) + 1, i, j, i, j + 1, f0, f3);
      const droite = (): number => point(2 * (j * L + i + 1) + 1, i + 1, j, i + 1, j + 1, f1, f2);
      switch (cas) {
        case 1:
        case 14:
          lier(gauche(), haut());
          break;
        case 2:
        case 13:
          lier(haut(), droite());
          break;
        case 4:
        case 11:
          lier(droite(), bas());
          break;
        case 8:
        case 7:
          lier(bas(), gauche());
          break;
        case 3:
        case 12:
          lier(gauche(), droite());
          break;
        case 6:
        case 9:
          lier(haut(), bas());
          break;
        case 5: {
          // Coins 0 et 2 dedans : selle.
          const centre = (f0 + f1 + f2 + f3) / 4 < 0;
          if (centre) {
            lier(haut(), droite());
            lier(bas(), gauche());
          } else {
            lier(gauche(), haut());
            lier(droite(), bas());
          }
          break;
        }
        case 10: {
          const centre = (f0 + f1 + f2 + f3) / 4 < 0;
          if (centre) {
            lier(gauche(), haut());
            lier(droite(), bas());
          } else {
            lier(haut(), droite());
            lier(bas(), gauche());
          }
          break;
        }
        default:
          break;
      }
    }
  }
  while (voisins.length < 2 * ptsX.length) voisins.push(-1);
  const vu = new Uint8Array(ptsX.length);
  const boucles: Float64Array[] = [];
  for (let depart = 0; depart < ptsX.length; depart++) {
    if (vu[depart]) continue;
    const suite: number[] = [];
    let precedent = -1;
    let courant = depart;
    while (courant >= 0 && !vu[courant]) {
      vu[courant] = 1;
      suite.push(courant);
      const a = voisins[2 * courant]!;
      const b = voisins[2 * courant + 1]!;
      const suivant = a !== precedent && !vu[a] ? a : b !== precedent && !vu[b] ? b : -1;
      precedent = courant;
      courant = suivant;
    }
    if (suite.length >= 3) {
      const boucle = new Float64Array(2 * suite.length);
      suite.forEach((p, k) => {
        boucle[2 * k] = ptsX[p]!;
        boucle[2 * k + 1] = ptsY[p]!;
      });
      boucles.push(boucle);
    }
  }
  return boucles;
}

/** Aire signée d'une boucle `[x0, y0, …]` (formule du lacet). */
export function aireBoucle(b: Float64Array | readonly number[]): number {
  const n = b.length / 2;
  let s = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) s += b[2 * j]! * b[2 * i + 1]! - b[2 * i]! * b[2 * j + 1]!;
  return s / 2;
}

/** Douglas-Peucker sur une polyligne ouverte (indices `debut … fin` inclus), marque les points gardés. */
function dpOuvert(b: Float64Array, debut: number, fin: number, eps2: number, garder: Uint8Array): void {
  const pile: Array<[number, number]> = [[debut, fin]];
  while (pile.length) {
    const [a, c] = pile.pop()!;
    if (c <= a + 1) continue;
    const ax = b[2 * a]!;
    const ay = b[2 * a + 1]!;
    const cx = b[2 * c]!;
    const cy = b[2 * c + 1]!;
    const dx = cx - ax;
    const dy = cy - ay;
    const l2 = dx * dx + dy * dy;
    let max = -1;
    let imax = -1;
    for (let i = a + 1; i < c; i++) {
      const px = b[2 * i]! - ax;
      const py = b[2 * i + 1]! - ay;
      let d2: number;
      if (l2 < 1e-12) d2 = px * px + py * py;
      else {
        const t = Math.min(1, Math.max(0, (px * dx + py * dy) / l2));
        const ex = px - t * dx;
        const ey = py - t * dy;
        d2 = ex * ex + ey * ey;
      }
      if (d2 > max) {
        max = d2;
        imax = i;
      }
    }
    if (max > eps2) {
      garder[imax] = 1;
      pile.push([a, imax], [imax, c]);
    }
  }
}

/** Simplification de Douglas-Peucker d'une boucle fermée. */
export function simplifierBoucle(b: Float64Array, tolerance: number): Float64Array {
  const n = b.length / 2;
  if (n <= 8) return b;
  // Deux ancres éloignées : le point 0 et le point le plus loin de lui.
  let loin = 0;
  let dmax = -1;
  for (let i = 1; i < n; i++) {
    const d = (b[2 * i]! - b[0]!) ** 2 + (b[2 * i + 1]! - b[1]!) ** 2;
    if (d > dmax) {
      dmax = d;
      loin = i;
    }
  }
  // Boucle déroulée : 0 … loin … n (n = 0 répété).
  const deroule = new Float64Array(2 * (n + 1));
  deroule.set(b);
  deroule[2 * n] = b[0]!;
  deroule[2 * n + 1] = b[1]!;
  const garder = new Uint8Array(n + 1);
  garder[0] = 1;
  garder[loin] = 1;
  const eps2 = tolerance * tolerance;
  dpOuvert(deroule, 0, loin, eps2, garder);
  dpOuvert(deroule, loin, n, eps2, garder);
  const r: number[] = [];
  for (let i = 0; i < n; i++) if (garder[i]) r.push(b[2 * i]!, b[2 * i + 1]!);
  return Float64Array.from(r);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Densité
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function lisse(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Pas local (px) en un point : pas de base, réduit dans les zones fines avec un raccord doux. */
export function pasLocal(x: number, y: number, pasBase: number, zones: readonly ZoneDensite[]): number {
  let h = pasBase;
  for (const z of zones) {
    const d = Math.hypot(x - z.centre.x, y - z.centre.y);
    if (d >= z.rayon) continue;
    const t = lisse(0.5 * z.rayon, z.rayon, d);
    h = Math.min(h, z.pas + (pasBase - z.pas) * t);
  }
  return h;
}

/** Grille de hachage spatial de points (pour les voisinages). */
class GrillePoints {
  private readonly cases = new Map<number, number[]>();
  constructor(private readonly taille: number) {}
  private cle(ix: number, iy: number): number {
    return (iy + 4096) * 16384 + (ix + 4096);
  }
  ajouter(id: number, x: number, y: number): void {
    const k = this.cle(Math.floor(x / this.taille), Math.floor(y / this.taille));
    const c = this.cases.get(k);
    if (c) c.push(id);
    else this.cases.set(k, [id]);
  }
  /** Identifiants des points des cases qui touchent le disque (x, y, r). */
  voisins(x: number, y: number, r: number, rappel: (id: number) => boolean | void): void {
    const x0 = Math.floor((x - r) / this.taille);
    const x1 = Math.floor((x + r) / this.taille);
    const y0 = Math.floor((y - r) / this.taille);
    const y1 = Math.floor((y + r) / this.taille);
    for (let iy = y0; iy <= y1; iy++) {
      for (let ix = x0; ix <= x1; ix++) {
        const c = this.cases.get(this.cle(ix, iy));
        if (!c) continue;
        for (const id of c) if (rappel(id) === true) return;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Construction
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Bande horizontale de segments pour le test pair-impair. */
class TestPairImpair {
  private readonly bandes = new Map<number, number[]>();
  constructor(
    private readonly segs: Float64Array, // x1, y1, x2, y2 par segment
    private readonly hauteurBande = 4,
  ) {
    const n = segs.length / 4;
    for (let s = 0; s < n; s++) {
      const y1 = segs[4 * s + 1]!;
      const y2 = segs[4 * s + 3]!;
      const b0 = Math.floor(Math.min(y1, y2) / hauteurBande);
      const b1 = Math.floor(Math.max(y1, y2) / hauteurBande);
      for (let b = b0; b <= b1; b++) {
        const l = this.bandes.get(b);
        if (l) l.push(s);
        else this.bandes.set(b, [s]);
      }
    }
  }
  dedans(x: number, y: number): boolean {
    const l = this.bandes.get(Math.floor(y / this.hauteurBande));
    if (!l) return false;
    let impair = false;
    for (const s of l) {
      const x1 = this.segs[4 * s]!;
      const y1 = this.segs[4 * s + 1]!;
      const x2 = this.segs[4 * s + 2]!;
      const y2 = this.segs[4 * s + 3]!;
      if (y1 > y === y2 > y) continue;
      const xi = x1 + ((y - y1) * (x2 - x1)) / (y2 - y1);
      if (xi > x) impair = !impair;
    }
    return impair;
  }
}

/** Angles (degrés) d'un triangle. */
function anglesTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const a = Math.hypot(bx - cx, by - cy);
  const b = Math.hypot(ax - cx, ay - cy);
  const c = Math.hypot(ax - bx, ay - by);
  const angle = (o: number, p: number, q: number): number => {
    const v = (p * p + q * q - o * o) / (2 * p * q);
    return (Math.acos(Math.min(1, Math.max(-1, v))) * 180) / Math.PI;
  };
  return Math.min(angle(a, b, c), angle(b, a, c), angle(c, a, b));
}

/**
 * Construit le maillage d'une image détourée. Lève une erreur si le masque est vide.
 */
export function construireMaillage(image: ImageRGBA, options: OptionsMaillage = {}): MaillageBrut {
  const debutChrono = performance.now();
  const { largeur, hauteur } = image;
  const seuil = options.seuilAlpha ?? 12;
  const marge = options.marge ?? 1.5;
  const tolerance = Math.min(options.tolerance ?? 0.6, marge * 0.8);
  const facteurBord = options.facteurBord ?? 0.7;
  const aireMin = options.aireMinBoucle ?? 24;
  const zones = options.zones ?? [];
  const masque = masqueAlpha(image, seuil);
  // Boîte du masque (pour le pas par défaut).
  let yMin = hauteur;
  let yMax = -1;
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      if (masque[y * largeur + x]) {
        if (y < yMin) yMin = y;
        yMax = y;
        break;
      }
    }
  }
  if (yMax < 0) throw new Error('Maillage : le masque alpha est vide (image entièrement transparente ?)');
  const pasBase = options.pas ?? Math.max(6, (yMax - yMin + 1) / 72);
  const distance = distanceSignee(masque, largeur, hauteur);

  // 1. Contours du masque dilaté, simplifiés, rééchantillonnés au pas local.
  const brutes = contoursIso(distance, largeur, hauteur, marge)
    .filter((b) => Math.abs(aireBoucle(b)) >= aireMin)
    .sort((a, b) => Math.abs(aireBoucle(b)) - Math.abs(aireBoucle(a)));
  const px: number[] = [];
  const py: number[] = [];
  const suivant: number[] = []; // segment de contour sortant de chaque point de bord
  const bouclesDepart: number[] = [];
  for (const brute of brutes) {
    const s = simplifierBoucle(brute, tolerance);
    const n = s.length / 2;
    const depart = px.length;
    bouclesDepart.push(depart);
    for (let i = 0; i < n; i++) {
      const ax = s[2 * i]!;
      const ay = s[2 * i + 1]!;
      const bx = s[2 * ((i + 1) % n)]!;
      const by = s[2 * ((i + 1) % n) + 1]!;
      const l = Math.hypot(bx - ax, by - ay);
      const h = facteurBord * Math.min(pasLocal(ax, ay, pasBase, zones), pasLocal(bx, by, pasBase, zones));
      const k = Math.max(1, Math.ceil(l / h));
      for (let m = 0; m < k; m++) {
        px.push(ax + ((bx - ax) * m) / k);
        py.push(ay + ((by - ay) * m) / k);
      }
    }
    const fin = px.length;
    for (let i = depart; i < fin; i++) suivant.push(i + 1 < fin ? i + 1 : depart);
  }
  const nbBordInitial = px.length;

  // 2. Points de Steiner : réseau hexagonal fin, tirage glouton du plus fin au plus large.
  let pasMin = pasBase;
  for (const z of zones) pasMin = Math.min(pasMin, z.pas);
  const ecart = Math.max(1.5, pasMin / 2);
  const candidats: Array<{ x: number; y: number; h: number }> = [];
  const dy = ecart * Math.sqrt(3) / 2;
  for (let j = 0, y = 0.5; y < hauteur; j++, y += dy) {
    for (let x = 0.5 + (j % 2 ? ecart / 2 : 0); x < largeur; x += ecart) {
      const sd = distance[Math.floor(y) * largeur + Math.floor(x)]!;
      if (sd > marge) continue;
      const h = pasLocal(x, y, pasBase, zones);
      // Distance au bord du polygone ≈ marge − sd.
      if (marge - echantillonner(distance, largeur, hauteur, x - 0.5, y - 0.5) < 0.55 * h) continue;
      candidats.push({ x, y, h });
    }
  }
  candidats.sort((a, b) => a.h - b.h || a.y - b.y || a.x - b.x);
  const grille = new GrillePoints(pasBase);
  const steinerX: number[] = [];
  const steinerY: number[] = [];
  const steinerH: number[] = [];
  for (const c of candidats) {
    let libre = true;
    grille.voisins(c.x, c.y, pasBase, (id) => {
      const lim = 0.5 * (c.h + steinerH[id]!) * 0.95;
      if ((steinerX[id]! - c.x) ** 2 + (steinerY[id]! - c.y) ** 2 < lim * lim) {
        libre = false;
        return true;
      }
      return false;
    });
    if (!libre) continue;
    grille.ajouter(steinerX.length, c.x, c.y);
    steinerX.push(c.x);
    steinerY.push(c.y);
    steinerH.push(c.h);
  }

  // 3. Delaunay conforme.
  const actifSteiner = new Uint8Array(steinerX.length).fill(1);
  const grilleSteiner = new GrillePoints(pasBase);
  for (let i = 0; i < steinerX.length; i++) grilleSteiner.ajouter(i, steinerX[i]!, steinerY[i]!);
  const maxIter = options.iterationsConformite ?? 16;
  let triangles: Uint32Array = new Uint32Array(0);
  let indexGlobal: Int32Array = new Int32Array(0); // index compact → index global (bord : 0…, Steiner : nbBord + i)
  let manquants = 0;
  let iter = 0;
  for (iter = 0; iter < maxIter; iter++) {
    // Retirer les points de Steiner dans le cercle diamétral d'un segment.
    for (let a = 0; a < px.length; a++) {
      const b = suivant[a]!;
      const mx = (px[a]! + px[b]!) / 2;
      const my = (py[a]! + py[b]!) / 2;
      const r = Math.hypot(px[b]! - px[a]!, py[b]! - py[a]!) / 2;
      grilleSteiner.voisins(mx, my, r, (id) => {
        if (actifSteiner[id] && (steinerX[id]! - mx) ** 2 + (steinerY[id]! - my) ** 2 < r * r) actifSteiner[id] = 0;
      });
    }
    const nbBord = px.length;
    const coords: number[] = [];
    const glob: number[] = [];
    for (let i = 0; i < nbBord; i++) {
      coords.push(px[i]!, py[i]!);
      glob.push(i);
    }
    for (let i = 0; i < steinerX.length; i++) {
      if (!actifSteiner[i]) continue;
      coords.push(steinerX[i]!, steinerY[i]!);
      glob.push(-(i + 1));
    }
    const d = new Delaunator(Float64Array.from(coords));
    triangles = d.triangles;
    indexGlobal = Int32Array.from(glob);
    // Arêtes présentes (entre points de bord seulement : clé a·N + b).
    const aretes = new Set<number>();
    const N = nbBord + 1;
    for (let t = 0; t < triangles.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const u = triangles[t + e]!;
        const v = triangles[t + ((e + 1) % 3)]!;
        if (u < nbBord && v < nbBord) aretes.add(u < v ? u * N + v : v * N + u);
      }
    }
    const aCouper: number[] = [];
    for (let a = 0; a < nbBord; a++) {
      const b = suivant[a]!;
      const cle = a < b ? a * N + b : b * N + a;
      if (!aretes.has(cle)) aCouper.push(a);
    }
    manquants = aCouper.length;
    if (manquants === 0) break;
    if (iter === maxIter - 1) break;
    for (const a of aCouper) {
      const b = suivant[a]!;
      const m = px.length;
      px.push((px[a]! + px[b]!) / 2);
      py.push((py[a]! + py[b]!) / 2);
      suivant[a] = m;
      suivant.push(b);
    }
  }
  const nbBord = px.length;

  // 4. Triangles intérieurs (pair-impair sur les segments de contour).
  const segs = new Float64Array(4 * nbBord);
  for (let a = 0; a < nbBord; a++) {
    const b = suivant[a]!;
    segs.set([px[a]!, py[a]!, px[b]!, py[b]!], 4 * a);
  }
  const test = new TestPairImpair(segs);
  const coordGlobal = (gi: number): [number, number] => (gi >= 0 ? [px[gi]!, py[gi]!] : [steinerX[-gi - 1]!, steinerY[-gi - 1]!]);
  const gardes: number[] = [];
  for (let t = 0; t < triangles.length; t += 3) {
    const [ax, ay] = coordGlobal(indexGlobal[triangles[t]!]!);
    const [bx, by] = coordGlobal(indexGlobal[triangles[t + 1]!]!);
    const [cx, cy] = coordGlobal(indexGlobal[triangles[t + 2]!]!);
    const aire = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(aire) < 1e-6) continue;
    if (!test.dedans((ax + bx + cx) / 3, (ay + by + cy) / 3)) continue;
    gardes.push(t);
  }

  // 5. Compactage : bord d'abord (dans l'ordre des boucles), puis Steiner utilisés.
  const nouveau = new Map<number, number>();
  const positions: number[] = [];
  const ajouter = (gi: number): number => {
    const deja = nouveau.get(gi);
    if (deja !== undefined) return deja;
    const id = positions.length / 2;
    const [x, y] = coordGlobal(gi);
    positions.push(x, y);
    nouveau.set(gi, id);
    return id;
  };
  const utilises = new Set<number>();
  for (const t of gardes) for (let e = 0; e < 3; e++) utilises.add(indexGlobal[triangles[t + e]!]!);
  const boucles: number[][] = [];
  for (const depart of bouclesDepart) {
    const boucle: number[] = [];
    let a = depart;
    do {
      if (utilises.has(a)) boucle.push(ajouter(a));
      a = suivant[a]!;
    } while (a !== depart);
    if (boucle.length >= 3) boucles.push(boucle);
  }
  const nbBordFinal = positions.length / 2;
  const tri = new Uint32Array(3 * gardes.length);
  gardes.forEach((t, k) => {
    for (let e = 0; e < 3; e++) tri[3 * k + e] = ajouter(indexGlobal[triangles[t + e]!]!);
  });
  const pos = Float64Array.from(positions);

  // 6. Qualité.
  const angles: number[] = [];
  for (let k = 0; k < tri.length; k += 3) {
    const a = tri[k]!;
    const b = tri[k + 1]!;
    const c = tri[k + 2]!;
    angles.push(anglesTriangle(pos[2 * a]!, pos[2 * a + 1]!, pos[2 * b]!, pos[2 * b + 1]!, pos[2 * c]!, pos[2 * c + 1]!));
  }
  angles.sort((a, b) => a - b);
  void nbBordInitial;
  return {
    positions: pos,
    triangles: tri,
    boucles,
    nbBord: nbBordFinal,
    distance,
    masque,
    largeur,
    hauteur,
    stats: {
      sommets: pos.length / 2,
      triangles: tri.length / 3,
      boucles: boucles.length,
      segmentsManquants: manquants,
      iterationsConformite: iter + 1,
      angleMinP5: angles.length ? angles[Math.floor(0.05 * (angles.length - 1))]! : 0,
      angleMin: angles.length ? angles[0]! : 0,
      dureeMs: performance.now() - debutChrono,
    },
  };
}

/**
 * Couverture du masque par un maillage : fraction des pixels du masque dont le centre tombe dans au moins un
 * triangle, et nombre de triangles dont le centroïde est hors du masque dilaté de `tolerance` px.
 */
export function couvertureMasque(
  positions: ArrayLike<number>,
  triangles: ArrayLike<number>,
  masque: Uint8Array,
  largeur: number,
  hauteur: number,
  distance?: Float32Array,
  tolerance = 2,
): { couverture: number; pixelsMasque: number; trianglesDehors: number } {
  const couvert = new Uint8Array(largeur * hauteur);
  for (let k = 0; k < triangles.length; k += 3) {
    const a = triangles[k]!;
    const b = triangles[k + 1]!;
    const c = triangles[k + 2]!;
    const ax = positions[2 * a]!;
    const ay = positions[2 * a + 1]!;
    const bx = positions[2 * b]!;
    const by = positions[2 * b + 1]!;
    const cx = positions[2 * c]!;
    const cy = positions[2 * c + 1]!;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const x1 = Math.min(largeur - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const y1 = Math.min(hauteur - 1, Math.ceil(Math.max(ay, by, cy)));
    const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(det) < 1e-12) continue;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const qx = x + 0.5;
        const qy = y + 0.5;
        const l1 = ((bx - qx) * (cy - qy) - (cx - qx) * (by - qy)) / det;
        const l2 = ((cx - qx) * (ay - qy) - (ax - qx) * (cy - qy)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) couvert[y * largeur + x] = 1;
      }
    }
  }
  let total = 0;
  let ok = 0;
  for (let i = 0; i < masque.length; i++) {
    if (!masque[i]) continue;
    total++;
    if (couvert[i]) ok++;
  }
  const sd = distance ?? distanceSignee(masque, largeur, hauteur);
  let dehors = 0;
  for (let k = 0; k < triangles.length; k += 3) {
    const a = triangles[k]!;
    const b = triangles[k + 1]!;
    const c = triangles[k + 2]!;
    const gx = (positions[2 * a]! + positions[2 * b]! + positions[2 * c]!) / 3;
    const gy = (positions[2 * a + 1]! + positions[2 * b + 1]! + positions[2 * c + 1]!) / 3;
    if (echantillonner(sd, largeur, hauteur, gx - 0.5, gy - 0.5) > tolerance) dehors++;
  }
  return { couverture: total ? ok / total : 1, pixelsMasque: total, trianglesDehors: dehors };
}
