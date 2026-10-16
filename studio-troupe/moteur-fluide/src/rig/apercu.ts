/**
 * Aperçus du rig sur processeur (contrôle visuel, planches de poses) : maillage texturé déformé (application affine
 * par triangle, échantillonnage bilinéaire, ordre des groupes de dessin), fil de fer, parties en couleurs, carte
 * de poids d'un os. Module pur : écrit dans un tampon RGBA. Ce n'est PAS le rendu du film (`rendu/`, WebGL).
 */
import type { CharacterRig } from '../timeline/types';
import type { ImageRGBA } from './maillage';

/** Toile RGBA 8 bits (non prémultipliée) et transformation image → toile (échelle puis décalage). */
export interface Toile extends ImageRGBA {
  donnees: Uint8Array;
}

/** Crée une toile unie. */
export function creerToile(largeur: number, hauteur: number, fond: readonly [number, number, number] = [236, 233, 226]): Toile {
  const d = new Uint8Array(4 * largeur * hauteur);
  for (let i = 0; i < largeur * hauteur; i++) {
    d[4 * i] = fond[0];
    d[4 * i + 1] = fond[1];
    d[4 * i + 2] = fond[2];
    d[4 * i + 3] = 255;
  }
  return { largeur, hauteur, donnees: d };
}

/** Placement d'un dessin sur la toile : `p_toile = p_image·echelle + decalage`. */
export interface Placement {
  echelle: number;
  dx: number;
  dy: number;
}

function melangerPixel(t: Toile, x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= t.largeur || y >= t.hauteur || a <= 0) return;
  const i = 4 * (y * t.largeur + x);
  const d = t.donnees;
  d[i] = Math.round(r * a + d[i]! * (1 - a));
  d[i + 1] = Math.round(g * a + d[i + 1]! * (1 - a));
  d[i + 2] = Math.round(b * a + d[i + 2]! * (1 - a));
}

/** Échantillon bilinéaire prémultiplié d'une image RGBA (coordonnées px, centres en +0,5). */
function echantillon(img: ImageRGBA, x: number, y: number, sortie: Float64Array): void {
  const fx = Math.min(Math.max(x - 0.5, 0), img.largeur - 1);
  const fy = Math.min(Math.max(y - 0.5, 0), img.hauteur - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, img.largeur - 1);
  const y1 = Math.min(y0 + 1, img.hauteur - 1);
  const ux = fx - x0;
  const uy = fy - y0;
  sortie.fill(0);
  const coins: Array<[number, number, number]> = [
    [x0, y0, (1 - ux) * (1 - uy)],
    [x1, y0, ux * (1 - uy)],
    [x0, y1, (1 - ux) * uy],
    [x1, y1, ux * uy],
  ];
  for (const [cx, cy, w] of coins) {
    const i = 4 * (cy * img.largeur + cx);
    const a = (img.donnees[i + 3]! / 255) * w;
    sortie[0] = sortie[0]! + img.donnees[i]! * a;
    sortie[1] = sortie[1]! + img.donnees[i + 1]! * a;
    sortie[2] = sortie[2]! + img.donnees[i + 2]! * a;
    sortie[3] = sortie[3]! + a;
  }
}

/** Triangles dans l'ordre de dessin (groupes triés par ordre, puis par position dans le tableau). */
export function ordreTriangles(rig: CharacterRig, ordreGroupes?: Record<string, number>): number[] {
  const groupes = rig.groupes.map((g, k) => ({ g, k, ordre: ordreGroupes?.[g.nom] ?? g.ordre }));
  groupes.sort((a, b) => a.ordre - b.ordre || a.k - b.k);
  const r: number[] = [];
  for (const { g } of groupes) for (let t = g.premierTriangle; t < g.premierTriangle + g.nombreTriangles; t++) r.push(t);
  return r;
}

/** Remplit un triangle (coordonnées toile) en appelant `pixel(x, y, l0, l1, l2)` avec les barycentriques. */
function remplirTriangle(
  t: Toile,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  pixel: (x: number, y: number, l0: number, l1: number, l2: number) => void,
): void {
  const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  if (Math.abs(det) < 1e-9) return;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const x1 = Math.min(t.largeur - 1, Math.ceil(Math.max(ax, bx, cx)));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const y1 = Math.min(t.hauteur - 1, Math.ceil(Math.max(ay, by, cy)));
  for (let y = y0; y <= y1; y++) {
    const qy = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const qx = x + 0.5;
      const l0 = ((bx - qx) * (cy - qy) - (cx - qx) * (by - qy)) / det;
      const l1 = ((cx - qx) * (ay - qy) - (ax - qx) * (cy - qy)) / det;
      const l2 = 1 - l0 - l1;
      if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) continue;
      pixel(x, y, l0, l1, l2);
    }
  }
}

/** Dessine le maillage déformé et texturé. `sommets` : positions déformées (2V, px image). */
export function dessinerMaillageTexture(
  toile: Toile,
  rig: CharacterRig,
  texture: ImageRGBA,
  sommets: ArrayLike<number>,
  placement: Placement,
  ordreGroupes?: Record<string, number>,
): void {
  const m = rig.maillage;
  const s = new Float64Array(4);
  const P = (v: number): [number, number] => [sommets[2 * v]! * placement.echelle + placement.dx, sommets[2 * v + 1]! * placement.echelle + placement.dy];
  for (const t of ordreTriangles(rig, ordreGroupes)) {
    const a = m.indices[3 * t]!;
    const b = m.indices[3 * t + 1]!;
    const c = m.indices[3 * t + 2]!;
    const [ax, ay] = P(a);
    const [bx, by] = P(b);
    const [cx, cy] = P(c);
    const ua = [m.uvs[2 * a]! * texture.largeur, m.uvs[2 * a + 1]! * texture.hauteur];
    const ub = [m.uvs[2 * b]! * texture.largeur, m.uvs[2 * b + 1]! * texture.hauteur];
    const uc = [m.uvs[2 * c]! * texture.largeur, m.uvs[2 * c + 1]! * texture.hauteur];
    remplirTriangle(toile, ax, ay, bx, by, cx, cy, (x, y, l0, l1, l2) => {
      const u = l0 * ua[0]! + l1 * ub[0]! + l2 * uc[0]!;
      const v = l0 * ua[1]! + l1 * ub[1]! + l2 * uc[1]!;
      echantillon(texture, u, v, s);
      const al = s[3]!;
      if (al <= 0.002) return;
      melangerPixel(toile, x, y, s[0]! / al, s[1]! / al, s[2]! / al, al);
    });
  }
}

/** Couleur distincte d'un index (teinte dorée). */
export function couleurIndex(i: number): [number, number, number] {
  const h = (i * 0.618034) % 1;
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return 255 * (0.82 - 0.62 * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [Math.round(f(5)), Math.round(f(3)), Math.round(f(1))];
}

/** Colore les triangles selon une valeur par sommet (fonction → couleur RVB + alpha). */
export function dessinerChamp(
  toile: Toile,
  rig: CharacterRig,
  sommets: ArrayLike<number>,
  placement: Placement,
  couleur: (v: number) => [number, number, number, number],
): void {
  const m = rig.maillage;
  const P = (v: number): [number, number] => [sommets[2 * v]! * placement.echelle + placement.dx, sommets[2 * v + 1]! * placement.echelle + placement.dy];
  for (const t of ordreTriangles(rig)) {
    const a = m.indices[3 * t]!;
    const b = m.indices[3 * t + 1]!;
    const c = m.indices[3 * t + 2]!;
    const ca = couleur(a);
    const cb = couleur(b);
    const cc = couleur(c);
    const [ax, ay] = P(a);
    const [bx, by] = P(b);
    const [cx, cy] = P(c);
    remplirTriangle(toile, ax, ay, bx, by, cx, cy, (x, y, l0, l1, l2) => {
      melangerPixel(
        toile,
        x,
        y,
        l0 * ca[0] + l1 * cb[0] + l2 * cc[0],
        l0 * ca[1] + l1 * cb[1] + l2 * cc[1],
        l0 * ca[2] + l1 * cb[2] + l2 * cc[2],
        l0 * ca[3] + l1 * cb[3] + l2 * cc[3],
      );
    });
  }
}

/** Trace un segment anticrénelé (algorithme de Wu simplifié par échantillonnage). */
export function tracerSegment(t: Toile, x0: number, y0: number, x1: number, y1: number, couleur: readonly [number, number, number], alpha = 1): void {
  const l = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(l * 1.5));
  for (let k = 0; k <= n; k++) {
    const x = x0 + ((x1 - x0) * k) / n - 0.5;
    const y = y0 + ((y1 - y0) * k) / n - 0.5;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    melangerPixel(t, ix, iy, couleur[0], couleur[1], couleur[2], alpha * (1 - fx) * (1 - fy) * 0.75);
    melangerPixel(t, ix + 1, iy, couleur[0], couleur[1], couleur[2], alpha * fx * (1 - fy) * 0.75);
    melangerPixel(t, ix, iy + 1, couleur[0], couleur[1], couleur[2], alpha * (1 - fx) * fy * 0.75);
    melangerPixel(t, ix + 1, iy + 1, couleur[0], couleur[1], couleur[2], alpha * fx * fy * 0.75);
  }
}

/** Fil de fer du maillage. */
export function dessinerFilDeFer(toile: Toile, rig: CharacterRig, sommets: ArrayLike<number>, placement: Placement, couleur: readonly [number, number, number] = [30, 30, 30], alpha = 0.5): void {
  const m = rig.maillage;
  const vues = new Set<number>();
  const n = m.positions.length / 2;
  for (let t = 0; t < m.indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = m.indices[t + e]!;
      const b = m.indices[t + ((e + 1) % 3)]!;
      const cle = a < b ? a * n + b : b * n + a;
      if (vues.has(cle)) continue;
      vues.add(cle);
      tracerSegment(
        toile,
        sommets[2 * a]! * placement.echelle + placement.dx,
        sommets[2 * a + 1]! * placement.echelle + placement.dy,
        sommets[2 * b]! * placement.echelle + placement.dx,
        sommets[2 * b + 1]! * placement.echelle + placement.dy,
        couleur,
        alpha,
      );
    }
  }
}

/** Disque plein (repère, articulation). */
export function point(t: Toile, x: number, y: number, r: number, couleur: readonly [number, number, number], alpha = 1): void {
  for (let j = Math.floor(y - r - 1); j <= Math.ceil(y + r + 1); j++) {
    for (let i = Math.floor(x - r - 1); i <= Math.ceil(x + r + 1); i++) {
      const d = Math.hypot(i + 0.5 - x, j + 0.5 - y);
      melangerPixel(t, i, j, couleur[0], couleur[1], couleur[2], alpha * Math.min(1, Math.max(0, r + 0.5 - d)));
    }
  }
}

/** Colle une image (RGBA) sur la toile avec mise à l'échelle bilinéaire. */
export function collerImage(t: Toile, img: ImageRGBA, placement: Placement): void {
  const s = new Float64Array(4);
  const x0 = Math.max(0, Math.floor(placement.dx));
  const y0 = Math.max(0, Math.floor(placement.dy));
  const x1 = Math.min(t.largeur - 1, Math.ceil(placement.dx + img.largeur * placement.echelle));
  const y1 = Math.min(t.hauteur - 1, Math.ceil(placement.dy + img.hauteur * placement.echelle));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      echantillon(img, (x + 0.5 - placement.dx) / placement.echelle, (y + 0.5 - placement.dy) / placement.echelle, s);
      if (s[3]! <= 0.002) continue;
      melangerPixel(t, x, y, s[0]! / s[3]!, s[1]! / s[3]!, s[2]! / s[3]!, s[3]!);
    }
  }
}
