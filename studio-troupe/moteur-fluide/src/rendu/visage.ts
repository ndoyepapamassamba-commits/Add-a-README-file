/**
 * Visage du personnage au rendu : on DÉFORME la peinture, on ne la redessine pas.
 *
 * Un champ de déplacement `d(p)` défini dans le repère de repos de l'image (px), à partir des ancrages du visage,
 * est ajouté aux sommets du maillage après le skinning (via la partie linéaire de la matrice de l'os de la tête) :
 * - **mâchoire** : sous la ligne des lèvres, la mâchoire descend de `D = ouverture·Dmax`, avec un profil elliptique
 *   le long de la bouche (coins immobiles) qui s'élargit jusqu'au menton (toute la mâchoire bouge), puis s'éteint
 *   dans le cou ; la lèvre supérieure se soulève un peu ;
 * - **coins** : sourire (coins hauts), largeur (étirés / resserrés), arrondi (resserrés) — noyaux gaussiens ;
 * - **yeux** : regard (l'iris glisse dans l'œil, le contour reste fixe), écarquillement (l'œil grandit) ;
 * - **sourcils** : hauteur, froncement (l'intérieur descend et se rapproche), inclinaison (tristesse / colère).
 *
 * Le champ est discontinu sur la ligne des lèvres (lèvre haute / lèvre basse) : les triangles qui la traversent
 * s'étirent, et l'ouverture est recouverte, dans cet ordre, par l'intérieur de la bouche (couleur prélevée sur la
 * peinture), les dents du haut, la langue, puis deux **bandes de lèvres** texturées par la peinture elle-même
 * (positions déformées, coordonnées de texture au repos, bords fondus). Les paupières sont des **bandes de peau**
 * prélevées au-dessus de la ligne des cils et étirées jusqu'à la ligne de fermeture : les cils descendent avec la
 * paupière. Fonctions pures (testées dans Node).
 */
import type { AncreOeil, AncresVisage, Couleur, EtatVisage, Vec2 } from '../timeline/types';

/** Réglages des amplitudes (fractions des dimensions du visage). */
export const REGLAGES_VISAGE = Object.freeze({
  /** Ouverture maximale de la mâchoire, en largeurs de bouche (bornée par 0,9 × la hauteur du menton). */
  machoire: 0.55,
  /** Soulèvement de la lèvre supérieure, en fraction de l'ouverture. */
  leveeLevreHaute: 0.12,
  /** Coins : sourire (vertical) et largeur (horizontal), en demi-largeurs de bouche. */
  sourire: 0.16,
  largeur: 0.17,
  arrondi: 0.3,
  /** Course de l'iris, en rayons de l'œil. */
  regard: 0.42,
  /** Agrandissement de l'œil écarquillé. */
  ecarquillement: 0.14,
  /** Course des sourcils, en distance sourcil–œil. */
  sourcil: 0.3,
  /** Hauteur de la bande de peau des paupières, en rayon vertical de l'œil. */
  paupiere: 0.55,
});

/** Côté de la ligne des lèvres. */
export type Cote = 'haut' | 'bas';

/** Repère de la bouche (repos). */
export interface RepereBouche {
  centre: Vec2;
  ex: Vec2;
  ey: Vec2;
  /** Demi-largeur (px). */
  w: number;
  /** Profondeur du menton sous le centre (px, repère local). */
  menton: number;
  /** Ligne des lèvres : y local en fonction de s ∈ [−1, 1] (échantillonnée). */
  ligne: Float64Array;
}

/** Données préparées du visage d'un rig (immuables). */
export interface VisagePrepare {
  ancres: AncresVisage;
  bouche: RepereBouche;
  /** Rectangle d'influence (repos, px). */
  boite: { x0: number; y0: number; x1: number; y1: number };
  /** Indices des sommets du maillage dans le rectangle d'influence. */
  sommets: Int32Array;
  /** Côté de chaque sommet retenu (1 = sous la ligne des lèvres). */
  bas: Uint8Array;
  /** Couleur de la peau, de l'intérieur de la bouche. */
  peau: Couleur;
  interieur: Couleur;
  /** Paupières rééchantillonnées (intérieur → extérieur), par œil. */
  paupieres: { G: { haut: Vec2[]; bas: Vec2[]; oeil: AncreOeil }; D: { haut: Vec2[]; bas: Vec2[]; oeil: AncreOeil } };
}

const N_LIGNE = 33;

function sous(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}
function smooth(e0: number, e1: number, x: number): number {
  const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
}

/** Rééchantillonne une polyligne en `n` points régulièrement espacés (longueur d'arc). */
export function reechantillonner(points: readonly Vec2[], n: number): Vec2[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: n }, () => ({ ...points[0]! }));
  const cumul = [0];
  for (let i = 1; i < points.length; i++) cumul.push(cumul[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  const L = cumul[cumul.length - 1]!;
  const r: Vec2[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (L * k) / (n - 1);
    while (j < points.length - 2 && cumul[j + 1]! < s) j++;
    const a = points[j]!;
    const b = points[j + 1]!;
    const seg = cumul[j + 1]! - cumul[j]!;
    const u = seg > 0 ? (s - cumul[j]!) / seg : 0;
    r.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  }
  return r;
}

/** Paupières d'un œil : celles du rig, sinon des demi-ellipses. Orientées du coin intérieur vers l'extérieur. */
function paupieresDe(oeil: AncreOeil, centreVisageX: number): { haut: Vec2[]; bas: Vec2[] } {
  const n = 9;
  const interieurAGauche = centreVisageX < oeil.centre.x; // le coin intérieur est du côté du nez
  const ellipse = (signeY: number): Vec2[] =>
    Array.from({ length: n }, (_, k) => {
      const u = k / (n - 1);
      const a = Math.PI * (interieurAGauche ? 1 - u : u);
      return { x: oeil.centre.x + oeil.rayon.x * Math.cos(a), y: oeil.centre.y + signeY * 0.9 * oeil.rayon.y * Math.sin(a) };
    });
  const oriente = (pts: readonly Vec2[] | undefined, defaut: Vec2[]): Vec2[] => {
    if (!pts || pts.length < 2) return defaut;
    const p = [...pts];
    const premierInterieur = Math.abs(p[0]!.x - centreVisageX) < Math.abs(p[p.length - 1]!.x - centreVisageX);
    return reechantillonner(premierInterieur ? p : p.reverse(), n);
  };
  return { haut: oriente(oeil.paupiereHaute, ellipse(-1)), bas: oriente(oeil.paupiereBasse, ellipse(1)) };
}

/** Prépare le visage d'un rig : repère de la bouche, sommets concernés, côtés de la ligne des lèvres. */
export function preparerVisage(ancres: AncresVisage, positions: ArrayLike<number>): VisagePrepare {
  const b = ancres.bouche;
  const centre = { x: (b.coinG.x + b.coinD.x) / 2, y: (b.coinG.y + b.coinD.y) / 2 };
  const axe = sous(b.coinG, b.coinD);
  const lx = Math.hypot(axe.x, axe.y) || 1;
  // ex orienté vers la droite de l'image ; ey vers le bas.
  let ex = { x: axe.x / lx, y: axe.y / lx };
  if (ex.x < 0) ex = { x: -ex.x, y: -ex.y };
  const ey = { x: -ex.y, y: ex.x };
  const w = Math.max(2, lx / 2);
  const mentonP = b.menton ?? { x: b.centre.x, y: b.centre.y + 1.2 * b.largeur };
  const menton = Math.max(0.3 * w, dot(sous(mentonP, centre), ey));
  // Ligne des lèvres (contact) : moyenne des deux lignes du rig, en y local selon s.
  const pts = [...b.levreHaute, ...b.levreBasse].map((p) => {
    const d = sous(p, centre);
    return { s: dot(d, ex) / w, y: dot(d, ey) };
  });
  pts.sort((p, q) => p.s - q.s);
  const ligne = new Float64Array(N_LIGNE);
  for (let k = 0; k < N_LIGNE; k++) {
    const s = -1 + (2 * k) / (N_LIGNE - 1);
    let y = 0;
    if (pts.length > 0) {
      if (s <= pts[0]!.s) y = pts[0]!.y;
      else if (s >= pts[pts.length - 1]!.s) y = pts[pts.length - 1]!.y;
      else {
        for (let i = 0; i < pts.length - 1; i++) {
          const p = pts[i]!;
          const q = pts[i + 1]!;
          if (s >= p.s && s <= q.s) {
            y = q.s > p.s ? p.y + ((q.y - p.y) * (s - p.s)) / (q.s - p.s) : (p.y + q.y) / 2;
            break;
          }
        }
      }
    }
    ligne[k] = y;
  }
  const bouche: RepereBouche = { centre, ex, ey, w, menton, ligne };

  // Rectangle d'influence : yeux, sourcils, bouche, menton, avec marges.
  const pointsCles: Vec2[] = [
    ...ancres.sourcilG.points,
    ...ancres.sourcilD.points,
    b.coinG,
    b.coinD,
    mentonP,
    { x: ancres.oeilG.centre.x - 1.8 * ancres.oeilG.rayon.x, y: ancres.oeilG.centre.y - 1.8 * ancres.oeilG.rayon.y },
    { x: ancres.oeilG.centre.x + 1.8 * ancres.oeilG.rayon.x, y: ancres.oeilG.centre.y + 1.8 * ancres.oeilG.rayon.y },
    { x: ancres.oeilD.centre.x - 1.8 * ancres.oeilD.rayon.x, y: ancres.oeilD.centre.y - 1.8 * ancres.oeilD.rayon.y },
    { x: ancres.oeilD.centre.x + 1.8 * ancres.oeilD.rayon.x, y: ancres.oeilD.centre.y + 1.8 * ancres.oeilD.rayon.y },
  ];
  const marge = 1.2 * w;
  const boite = {
    x0: Math.min(...pointsCles.map((p) => p.x)) - marge,
    y0: Math.min(...pointsCles.map((p) => p.y)) - marge,
    x1: Math.max(...pointsCles.map((p) => p.x)) + marge,
    y1: Math.max(...pointsCles.map((p) => p.y)) + 2 * menton,
  };
  const ids: number[] = [];
  const bas: number[] = [];
  const n = positions.length / 2;
  for (let i = 0; i < n; i++) {
    const x = positions[2 * i]!;
    const y = positions[2 * i + 1]!;
    if (x < boite.x0 || x > boite.x1 || y < boite.y0 || y > boite.y1) continue;
    ids.push(i);
    bas.push(estSousLevres(bouche, { x, y }) ? 1 : 0);
  }
  const milieu = (ancres.oeilG.centre.x + ancres.oeilD.centre.x) / 2;
  const pg = paupieresDe(ancres.oeilG, milieu);
  const pd = paupieresDe(ancres.oeilD, milieu);
  return {
    ancres,
    bouche,
    boite,
    sommets: Int32Array.from(ids),
    bas: Uint8Array.from(bas),
    peau: ancres.couleurPeau ?? [0.55, 0.36, 0.25],
    interieur: b.interieur ?? [0.28, 0.07, 0.08],
    paupieres: { G: { ...pg, oeil: ancres.oeilG }, D: { ...pd, oeil: ancres.oeilD } },
  };
}

/** y local de la ligne des lèvres en `s`. */
export function ligneLevres(b: RepereBouche, s: number): number {
  const x = Math.min(N_LIGNE - 1, Math.max(0, ((s + 1) / 2) * (N_LIGNE - 1)));
  const i = Math.min(N_LIGNE - 2, Math.floor(x));
  const u = x - i;
  return b.ligne[i]! * (1 - u) + b.ligne[i + 1]! * u;
}

/** Vrai si le point (repos) est sous la ligne des lèvres. */
export function estSousLevres(b: RepereBouche, p: Vec2): boolean {
  const d = sous(p, b.centre);
  const s = dot(d, b.ex) / b.w;
  return dot(d, b.ey) > ligneLevres(b, s);
}

/**
 * Profil d'ouverture le long des lèvres, nul aux coins : proche d'une demi-ellipse mais de pente finie aux coins
 * (`(1 − s²)(1 + 0,6·s²)`), pour que les triangles voisins des coins ne s'étirent pas brutalement.
 */
function profilLevres(s: number): number {
  const s2 = s * s;
  return s2 >= 1 ? 0 : (1 - s2) * (1 + 0.6 * s2);
}

/** Ouverture de la mâchoire (px) pour un état. */
export function ouvertureMachoire(prep: VisagePrepare, etat: EtatVisage): number {
  const b = prep.bouche;
  const dmax = Math.min(REGLAGES_VISAGE.machoire * 2 * b.w, 0.9 * b.menton);
  return Math.max(0, Math.min(1, etat.ouvertureBouche)) * dmax;
}

/** Options du champ. */
export interface OptionsChamp {
  /** Ignorer le regard (bandes de paupières : la paupière ne suit pas l'iris). */
  sansRegard?: boolean;
}

/** Déplacement (repos, px) au point `p`, du côté `cote` de la ligne des lèvres. */
export function champVisage(prep: VisagePrepare, etat: EtatVisage, p: Vec2, cote: Cote, options: OptionsChamp = {}): Vec2 {
  const R = REGLAGES_VISAGE;
  const b = prep.bouche;
  let dx = 0;
  let dy = 0;

  // ── Bouche ──
  const rel = sous(p, b.centre);
  const s = dot(rel, b.ex) / b.w;
  const yl = dot(rel, b.ey);
  const t = yl - ligneLevres(b, s);
  const D = ouvertureMachoire(prep, etat);
  if (D > 0) {
    if (cote === 'bas') {
      const gl = profilLevres(s);
      const gj = 1 - smooth(1.15, 2.4, Math.abs(s));
      const g = (gl + (gj - gl) * smooth(0, 0.75 * b.menton, Math.max(0, t))) * (1 - smooth(b.menton, 1.9 * b.menton, Math.max(0, t)));
      dx += D * g * b.ey.x;
      dy += D * g * b.ey.y;
    } else {
      const lift = R.leveeLevreHaute * D * profilLevres(s) * (1 - smooth(0, 0.9 * b.w, Math.max(0, -t)));
      dx -= lift * b.ey.x;
      dy -= lift * b.ey.y;
    }
  }
  // Coins de la bouche (des deux côtés de la ligne : la bouche reste fermée aux coins).
  const sourire = etat.sourire;
  const largeur = etat.largeur;
  const arrondi = etat.arrondi;
  if (sourire !== 0 || largeur !== 0 || arrondi !== 0) {
    const sig2 = 2 * (0.55 * b.w) * (0.55 * b.w);
    for (const signe of [-1, 1]) {
      const coin = { x: b.centre.x + signe * b.w * b.ex.x, y: b.centre.y + signe * b.w * b.ex.y };
      const r2 = (p.x - coin.x) ** 2 + (p.y - coin.y) ** 2;
      const phi = Math.exp(-r2 / sig2);
      if (phi < 1e-4) continue;
      const h = signe * (R.largeur * largeur + 0.04 * sourire - R.arrondi * arrondi) * b.w;
      const v = -R.sourire * sourire * b.w;
      dx += phi * (h * b.ex.x + v * b.ey.x);
      dy += phi * (h * b.ex.y + v * b.ey.y);
    }
  }

  // ── Yeux ──
  for (const oeil of [prep.ancres.oeilG, prep.ancres.oeilD]) {
    const qx = (p.x - oeil.centre.x) / oeil.rayon.x;
    const qy = (p.y - oeil.centre.y) / oeil.rayon.y;
    const rho = Math.hypot(qx, qy);
    if (rho > 1.8) continue;
    if (!options.sansRegard) {
      const w = 1 - smooth(0.3, 0.95, rho);
      dx += w * R.regard * etat.regard.x * oeil.rayon.x;
      dy += w * R.regard * 0.6 * etat.regard.y * oeil.rayon.y;
    }
    if (etat.ecarquillement > 0) {
      const w = R.ecarquillement * etat.ecarquillement * (1 - smooth(0.9, 1.7, rho));
      dx += w * (p.x - oeil.centre.x);
      dy += w * (p.y - oeil.centre.y);
    }
  }

  // ── Sourcils ──
  const milieu = (prep.ancres.oeilG.centre.x + prep.ancres.oeilD.centre.x) / 2;
  const sourcils: Array<[readonly Vec2[], AncreOeil, EtatVisage['sourcilG']]> = [
    [prep.ancres.sourcilG.points, prep.ancres.oeilG, etat.sourcilG],
    [prep.ancres.sourcilD.points, prep.ancres.oeilD, etat.sourcilD],
  ];
  for (const [pts, oeil, es] of sourcils) {
    if (pts.length === 0 || (es.hauteur === 0 && es.froncement === 0 && es.inclinaison === 0)) continue;
    // Intérieur = point le plus proche du milieu du visage.
    const ordre = Math.abs(pts[0]!.x - milieu) <= Math.abs(pts[pts.length - 1]!.x - milieu) ? pts : [...pts].reverse();
    const m = ordre.length - 1;
    const mx = ordre.reduce((a, q) => a + q.x, 0) / ordre.length;
    const my = ordre.reduce((a, q) => a + q.y, 0) / ordre.length;
    const A = R.sourcil * Math.hypot(mx - oeil.centre.x, my - oeil.centre.y);
    const longueur = Math.hypot(ordre[m]!.x - ordre[0]!.x, ordre[m]!.y - ordre[0]!.y) || A;
    const sigLong = 0.55 * longueur / Math.max(1, m) + 0.25 * longueur;
    const versNez = Math.sign(milieu - ordre[0]!.x) || 1;
    let sk = 0;
    let sx = 0;
    let sy = 0;
    let dmin = Infinity;
    let dyMin = 0;
    for (let i = 0; i <= m; i++) {
      const q = ordre[i]!;
      const wi = m > 0 ? 1 - i / m : 1;
      const r2 = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      const k = Math.exp(-r2 / (2 * sigLong * sigLong));
      const ddx = wi * es.froncement * 0.25 * A * versNez;
      const ddy = -es.hauteur * A + wi * (es.froncement * 0.4 * A + es.inclinaison * 0.5 * A);
      sk += k;
      sx += k * ddx;
      sy += k * ddy;
      const dist = Math.sqrt(r2);
      if (dist < dmin) {
        dmin = dist;
        dyMin = p.y - q.y;
      }
    }
    if (sk <= 1e-9) continue;
    // Enveloppe autour du sourcil : plus courte vers l'œil (la paupière ne doit presque pas bouger).
    const distOeil = A / R.sourcil;
    const sigEnv = dyMin > 0 ? 0.25 * distOeil : 0.35 * distOeil;
    const env = Math.exp(-(dmin * dmin) / (2 * sigEnv * sigEnv));
    dx += env * (sx / sk);
    dy += env * (sy / sk);
  }
  return { x: dx, y: dy };
}

/**
 * Déplacements (repos, px) des sommets retenus du maillage : `sortie[2k], sortie[2k+1]` pour `prep.sommets[k]`.
 */
export function deplacementsVisage(prep: VisagePrepare, etat: EtatVisage, positions: ArrayLike<number>, sortie: Float32Array): void {
  const n = prep.sommets.length;
  for (let k = 0; k < n; k++) {
    const i = prep.sommets[k]!;
    const d = champVisage(prep, etat, { x: positions[2 * i]!, y: positions[2 * i + 1]! }, prep.bas[k] ? 'bas' : 'haut');
    sortie[2 * k] = d.x;
    sortie[2 * k + 1] = d.y;
  }
}

/** Visage au repos (aucun déplacement) ? */
export function visageAuRepos(e: EtatVisage): boolean {
  return (
    e.ouvertureBouche <= 0 &&
    e.sourire === 0 &&
    e.largeur === 0 &&
    e.arrondi === 0 &&
    e.paupiereG <= 0 &&
    e.paupiereD <= 0 &&
    e.ecarquillement <= 0 &&
    e.regard.x === 0 &&
    e.regard.y === 0 &&
    e.sourcilG.hauteur === 0 &&
    e.sourcilG.froncement === 0 &&
    e.sourcilG.inclinaison === 0 &&
    e.sourcilD.hauteur === 0 &&
    e.sourcilD.froncement === 0 &&
    e.sourcilD.inclinaison === 0
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Recouvrements : intérieur, dents, langue (couleurs), bandes de lèvres et de paupières (texture du dessin)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Bande texturée : positions (repos déplacé, px), coordonnées de texture (px de l'image), alpha par sommet. */
export interface BandeTexturee {
  nom: string;
  positions: number[];
  uvs: number[];
  alphas: number[];
  indices: number[];
}

/** Zone colorée : positions (repos déplacé, px), couleurs RVBA non prémultipliées par sommet. */
export interface ZoneCouleur {
  nom: string;
  positions: number[];
  couleurs: number[];
  indices: number[];
}

/** Recouvrements du visage, dans l'ordre de dessin. */
export interface RecouvrementsVisage {
  zones: ZoneCouleur[];
  bandes: BandeTexturee[];
}

/** Indices d'une bande de `rangees` rangées de `n` points (quadrilatères coupés en deux triangles). */
function indicesBande(rangees: number, n: number): number[] {
  const idx: number[] = [];
  for (let r = 0; r < rangees - 1; r++) {
    for (let i = 0; i < n - 1; i++) {
      const a = r * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  return idx;
}

function bande(nom: string, rangees: Array<{ pos: Vec2[]; uv: Vec2[]; alpha: number }>): BandeTexturee {
  const positions: number[] = [];
  const uvs: number[] = [];
  const alphas: number[] = [];
  for (const r of rangees) {
    r.pos.forEach((p, i) => {
      positions.push(p.x, p.y);
      uvs.push(r.uv[i]!.x, r.uv[i]!.y);
      alphas.push(r.alpha);
    });
  }
  return { nom, positions, uvs, alphas, indices: indicesBande(rangees.length, rangees[0]!.pos.length) };
}

function zone(nom: string, rangees: Array<{ pos: Vec2[]; couleur: Couleur; alpha: number }>): ZoneCouleur {
  const positions: number[] = [];
  const couleurs: number[] = [];
  for (const r of rangees) {
    for (const p of r.pos) {
      positions.push(p.x, p.y);
      couleurs.push(r.couleur[0], r.couleur[1], r.couleur[2], r.alpha);
    }
  }
  return { nom, positions, couleurs, indices: indicesBande(rangees.length, rangees[0]!.pos.length) };
}

function plus(p: Vec2, d: Vec2): Vec2 {
  return { x: p.x + d.x, y: p.y + d.y };
}

function echelleCouleur(c: Couleur, k: number): Couleur {
  return [c[0] * k, c[1] * k, c[2] * k];
}

/**
 * Recouvrements du visage pour un état. `pxImage` = taille d'un pixel de sortie en px de l'image (largeur des fondus).
 * Toutes les positions sont dans le repère de repos de l'image, déjà déplacées par le champ.
 */
export function recouvrementsVisage(prep: VisagePrepare, etat: EtatVisage, pxImage = 1): RecouvrementsVisage {
  const zones: ZoneCouleur[] = [];
  const bandes: BandeTexturee[] = [];
  const b = prep.bouche;
  const fondu = Math.max(0.6, 1.3 * pxImage);
  const D = ouvertureMachoire(prep, etat);
  const champ = (p: Vec2, cote: Cote, o?: OptionsChamp) => plus(p, champVisage(prep, etat, p, cote, o));

  if (D > 0.35) {
    const N = 15;
    const ligne = (s: number): Vec2 => {
      const y = ligneLevres(b, s);
      return { x: b.centre.x + s * b.w * b.ex.x + y * b.ey.x, y: b.centre.y + s * b.w * b.ex.y + y * b.ey.y };
    };
    const ss = Array.from({ length: N }, (_, k) => -1 + (2 * k) / (N - 1));
    const repos = ss.map(ligne);
    const haut = repos.map((p) => champ(p, 'haut'));
    const bas = repos.map((p) => champ(p, 'bas'));
    const ey = b.ey;
    const decale = (pts: Vec2[], k: number): Vec2[] => pts.map((p) => ({ x: p.x + k * ey.x, y: p.y + k * ey.y }));
    // Intérieur : plus sombre en haut (ombre de la lèvre).
    const interieur = prep.interieur;
    zones.push(
      zone('interieur', [
        { pos: decale(haut, -0.5 * fondu), couleur: echelleCouleur(interieur, 0.55), alpha: 1 },
        { pos: decale(bas, 0.5 * fondu), couleur: interieur, alpha: 1 },
      ]),
    );
    // Dents du haut : visibles dès que la bouche s'ouvre franchement, ou demandées (F/V, dents serrées).
    const ouverture = Math.min(1, Math.max(0, etat.ouvertureBouche));
    const dents = Math.min(1, Math.max(etat.dents, 0.85 * smooth(0.12, 0.45, ouverture)));
    if (dents > 0.02) {
      const NS = 11;
      const sd = Array.from({ length: NS }, (_, k) => -0.78 + (1.56 * k) / (NS - 1));
      const h0 = sd.map((s) => champ(ligne(s), 'haut'));
      const b0 = sd.map((s) => champ(ligne(s), 'bas'));
      const hDents = 0.17 * 2 * b.w * dents;
      const bordBas = h0.map((p, i) => {
        const ecart = Math.max(0, (b0[i]!.x - p.x) * ey.x + (b0[i]!.y - p.y) * ey.y);
        const forme = Math.sqrt(Math.max(0, 1 - (sd[i]! / 0.8) ** 2));
        const h = Math.min(hDents * (0.55 + 0.45 * forme), 0.55 * ecart);
        return { x: p.x + h * ey.x, y: p.y + h * ey.y };
      });
      zones.push(
        zone('dents', [
          { pos: decale(h0, -fondu), couleur: [0.93, 0.91, 0.86], alpha: 1 },
          { pos: bordBas, couleur: [0.8, 0.78, 0.73], alpha: 1 },
          { pos: decale(bordBas, fondu), couleur: [0.8, 0.78, 0.73], alpha: 0 },
        ]),
      );
    }
    // Langue : posée au fond de la bouche ouverte.
    const langue = Math.min(1, etat.langue + 0.5 * smooth(0.3, 0.8, ouverture));
    if (langue > 0.02) {
      const NS = 11;
      const sl = Array.from({ length: NS }, (_, k) => -0.7 + (1.4 * k) / (NS - 1));
      const h0 = sl.map((s) => champ(ligne(s), 'haut'));
      const b0 = sl.map((s) => champ(ligne(s), 'bas'));
      const haut2 = b0.map((p, i) => {
        const ecart = Math.max(0, (p.x - h0[i]!.x) * ey.x + (p.y - h0[i]!.y) * ey.y);
        const forme = Math.sqrt(Math.max(0, 1 - (sl[i]! / 0.72) ** 2));
        const h = ecart * (0.22 + 0.3 * langue) * forme;
        return { x: p.x - h * ey.x, y: p.y - h * ey.y };
      });
      zones.push(
        zone('langue', [
          { pos: decale(haut2, -fondu), couleur: [0.72, 0.32, 0.33], alpha: 0 },
          { pos: haut2, couleur: [0.72, 0.32, 0.33], alpha: 1 },
          { pos: decale(b0, fondu), couleur: [0.55, 0.2, 0.22], alpha: 1 },
        ]),
      );
    }
    // Bandes de lèvres (texture du dessin) : la lèvre du haut couvre le bord supérieur, celle du bas le bord inférieur.
    const hu = Math.max(0.9 * prep.ancres.bouche.hauteur, 0.3 * b.w, 4);
    const hl = Math.max(1.2 * prep.ancres.bouche.hauteur, 0.38 * b.w, 5);
    const r = (k: number) => repos.map((p) => ({ x: p.x + k * ey.x, y: p.y + k * ey.y }));
    bandes.push(
      bande('levreHaute', [
        { pos: r(-hu).map((p) => champ(p, 'haut')), uv: r(-hu), alpha: 0 },
        { pos: r(-0.5 * hu).map((p) => champ(p, 'haut')), uv: r(-0.5 * hu), alpha: 1 },
        { pos: haut, uv: repos, alpha: 1 },
        { pos: decale(haut, fondu), uv: repos, alpha: 0 },
      ]),
    );
    bandes.push(
      bande('levreBasse', [
        { pos: decale(bas, -fondu), uv: repos, alpha: 0 },
        { pos: bas, uv: repos, alpha: 1 },
        { pos: r(0.55 * hl).map((p) => champ(p, 'bas')), uv: r(0.55 * hl), alpha: 1 },
        { pos: r(hl).map((p) => champ(p, 'bas')), uv: r(hl), alpha: 0 },
      ]),
    );
  }

  // Paupières : bande de peau au-dessus des cils, étirée jusqu'à la ligne de fermeture.
  for (const [cle, fermeture] of [
    ['G', etat.paupiereG],
    ['D', etat.paupiereD],
  ] as const) {
    if (fermeture <= 0.01) continue;
    const p = prep.paupieres[cle];
    const h = REGLAGES_VISAGE.paupiere * p.oeil.rayon.y;
    const c = Math.min(1, fermeture);
    const haut = p.haut;
    const ferme = haut.map((q, i) => ({ x: q.x + (p.bas[i]!.x - q.x) * c, y: q.y + (p.bas[i]!.y - q.y) * c }));
    const dessus = haut.map((q) => ({ x: q.x, y: q.y - h }));
    const milieu = haut.map((q) => ({ x: q.x, y: q.y - 0.55 * h }));
    const pos = (pts: Vec2[]) => pts.map((q) => champ(q, 'haut', { sansRegard: true }));
    const posFerme = pos(ferme);
    const posDessus = pos(dessus);
    const lerpPos = (u: number) => posDessus.map((q, i) => ({ x: q.x + (posFerme[i]!.x - q.x) * u, y: q.y + (posFerme[i]!.y - q.y) * u }));
    bandes.push(
      bande(`paupiere${cle}`, [
        { pos: posDessus, uv: dessus, alpha: 0 },
        { pos: lerpPos(0.45), uv: milieu, alpha: 1 },
        { pos: posFerme, uv: haut, alpha: 1 },
        { pos: posFerme.map((q) => ({ x: q.x, y: q.y + fondu })), uv: haut, alpha: 0 },
      ]),
    );
  }
  return { zones, bandes };
}
