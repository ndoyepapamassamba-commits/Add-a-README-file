/**
 * Poids de skinning « parties + bandes harmoniques » (méthode de la note de veille 02, G6), centres de rotation CoR
 * et groupes de dessin. Module pur.
 *
 * 1. **Étiquettes de partie** par sommet (un os par sommet) :
 *    - carte des parties fournie (exacte, pour nos personnages procéduraux ou des planches découpées) ;
 *    - sinon automatique : zones forcées (polygones du `rig.json`, zone de la tête déduite des ancrages du visage),
 *      capsules normalisées `d/r` autour de chaque os visible depuis le sommet (la droite sommet → os reste dans le
 *      masque), puis propagation géodésique sur le maillage (Voronoï le long des arêtes : ne traverse aucun vide)
 *      et lissage par vote majoritaire.
 * 2. **Découpe des contacts** : un triangle qui relie deux parties non voisines dans l'arbre (main contre cuisse,
 *    coude contre torse…) est donné à sa partie majoritaire, avec des clones de ses autres sommets : le maillage est
 *    découpé le long du contact, les membres se décollent sans trou ni étirement. Entre parties à deux pas (bras et
 *    torse), la jonction est gardée si elle est peinte d'un seul tenant (couture), découpée si elle enjambe un vide
 *    du masque d'origine (simple contact comblé par la fermeture).
 * 3. **Bandes** : un sommet est « libre » s'il est à moins d'une largeur de bande (≈ 0,9 × rayon du membre le plus
 *    fin) de la frontière avec une partie voisine ; seul le côté le plus fin plie (cou sous la tête, bras contre le
 *    torse), sauf près de l'articulation où la bande est symétrique (coude, genou). Les autres sommets sont fixés à
 *    100 % sur leur os : aucune fuite (le flanc du torse ne suit jamais le bras).
 * 4. **Harmonique** : dans chaque composante libre, chaque poids résout `L·w = 0` (laplacien cotangent à poids
 *    positifs) avec les sommets fixés comme conditions aux limites. Principe du maximum : `0 ≤ w ≤ 1`, `Σ w = 1`.
 *    On garde les 4 plus forts et on renormalise.
 * 5. **Centres de rotation** pour les sommets à plusieurs influences. Paire parent/enfant : l'articulation (le sommet
 *    tourne autour du coude de l'angle mélangé, contour extérieur en arc exact). Sinon, centre optimisé
 *    (Le & Hodgins 2016) :
 *    `p* = Σ_t s(w_p, w_t)·A_t·c_t / Σ_t s(w_p, w_t)·A_t`, avec
 *    `s = Σ_{j≠k} w_pj·w_pk·w_tj·w_tk·exp(−(w_pj·w_tk − w_pk·w_tj)²/σ²)`, σ = 0,1, sommé seulement sur les triangles
 *    qui partagent au moins deux os avec le sommet.
 * 6. **Groupes de dessin** : chaque triangle va au membre de sa partie majoritaire (tête, bras G/D, jambes G/D,
 *    corps), triés par ordre de dessin.
 */
import type { AncresVisage, GroupeDessin, Squelette, Vec2 } from '../timeline/types';
import { echantillonner } from './distance';
import { construireAdjacence, dijkstra, gradientConjugue, type Adjacence } from './graphe';
import type { MaillageBrut } from './maillage';
import { articulationEntre, distanceArborescente, estAncetre, indexerSquelette, membreDe, ordreMembres } from './squelette';

/** Réglages des poids. */
export interface OptionsPoids {
  /** Étiquettes imposées par pixel (index d'os dans le squelette, −1 = aucune). */
  etiquettesPixels?: Int16Array;
  /** Zones forcées : nom d'os → polygone (px image). */
  zones?: Record<string, Vec2[]>;
  /** Ancrages du visage : zone automatique de la tête (au-dessus du menton). */
  visage?: AncresVisage | null;
  /** Largeur de bande = facteur × rayon du membre le plus fin. Défaut 0,9. */
  facteurBande?: number;
  /** Bornes de la largeur de bande (px). Défauts 6 et 40. */
  bandeMin?: number;
  bandeMax?: number;
  /** Poids minimal conservé. Défaut 0,004. */
  poidsMin?: number;
  /** σ de la similarité CoR. Défaut 0,1. */
  sigmaCor?: number;
  /** Orientation du dessin (ordre de dessin des membres). Défaut 0 (de face). */
  orientation?: 1 | -1 | 0;
  /** Distance arborescente maximale entre deux parties reliées par un triangle (au-delà : pont coupé). Défaut 2. */
  distancePontMax?: number;
}

/** Résultat : maillage final (après coupure des ponts) avec poids, centres, étiquettes et groupes. */
export interface MaillagePondere {
  positions: Float64Array;
  /** Triangles triés par groupe de dessin. */
  triangles: Uint32Array;
  boucles: number[][];
  etiquettes: Int32Array;
  /** 4V. */
  influences: Int32Array;
  /** 4V. */
  poids: Float64Array;
  /** 2V, NaN = sommet rigide. */
  centres: Float64Array;
  groupes: GroupeDessin[];
  stats: StatsPoids;
}

/** Mesures de contrôle des poids. */
export interface StatsPoids {
  /** Triangles de contact découpés (donnés à une partie, sommets clonés). */
  pontsRetires: number;
  sommetsLibres: number;
  sommetsCor: number;
  composantesLibres: number;
  iterationsCG: number;
  /** Rayon estimé de chaque partie (px). */
  rayons: Record<string, number>;
  /** Nombre de sommets par partie. */
  sommetsParOs: Record<string, number>;
  /** Écart maximal |Σw − 1| avant renormalisation finale. */
  ecartPartition: number;
  etiquetage: 'carte' | 'automatique';
  dureeMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Étiquettes
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function dansPolygone(x: number, y: number, poly: readonly Vec2[]): boolean {
  let impair = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)) impair = !impair;
  }
  return impair;
}

/** Étiquettes depuis une carte de parties par pixel (−1 aux sommets sans étiquette proche). */
function etiquettesDepuisCarte(pos: Float64Array, carte: Int16Array, l: number, h: number): Int32Array {
  const n = pos.length / 2;
  const e = new Int32Array(n).fill(-1);
  for (let v = 0; v < n; v++) {
    const cx = Math.floor(pos[2 * v]!);
    const cy = Math.floor(pos[2 * v + 1]!);
    const ici = cx >= 0 && cy >= 0 && cx < l && cy < h ? carte[cy * l + cx]! : -1;
    if (ici >= 0) {
      e[v] = ici;
      continue;
    }
    // Sommet du bord (masque dilaté) : étiquette la plus fréquente à proximité.
    const compte = new Map<number, number>();
    for (let r = 1; r <= 5 && compte.size === 0; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= l || y >= h) continue;
          const k = carte[y * l + x]!;
          if (k >= 0) compte.set(k, (compte.get(k) ?? 0) + 1 / (1 + dx * dx + dy * dy));
        }
      }
    }
    let best = -1;
    let bestN = 0;
    for (const [k, c] of compte) if (c > bestN) {
      best = k;
      bestN = c;
    }
    e[v] = best;
  }
  return e;
}

/** Rayon dessiné d'un os, mesuré le long de son segment dans le champ de distance. */
function rayonSegment(brut: MaillageBrut, a: Vec2, b: Vec2): number {
  const prof: number[] = [];
  for (let k = 1; k < 16; k++) {
    const t = 0.1 + (0.8 * k) / 16;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const sd = echantillonner(brut.distance, brut.largeur, brut.hauteur, x - 0.5, y - 0.5);
    if (sd < 0) prof.push(-sd);
  }
  if (!prof.length) return 10;
  prof.sort((p, q) => p - q);
  return Math.max(3, prof[Math.floor(prof.length / 2)]!);
}

/** Vrai si la droite p → q reste dans le masque (dilaté de `marge`). */
function visible(brut: MaillageBrut, px: number, py: number, qx: number, qy: number, marge = 2): boolean {
  const l = Math.hypot(qx - px, qy - py);
  const n = Math.max(1, Math.ceil(l / 2));
  for (let k = 1; k < n; k++) {
    const x = px + ((qx - px) * k) / n;
    const y = py + ((qy - py) * k) / n;
    if (echantillonner(brut.distance, brut.largeur, brut.hauteur, x - 0.5, y - 0.5) > marge) return false;
  }
  return true;
}

/** Étiquetage automatique (capsules normalisées + zones + propagation géodésique). */
function etiquettesAutomatiques(
  brut: MaillageBrut,
  pos: Float64Array,
  adj: Adjacence,
  squelette: Squelette,
  options: OptionsPoids,
): Int32Array {
  const n = pos.length / 2;
  const os = squelette.os;
  const idx = indexerSquelette(squelette);
  const segs = os.map((o) => {
    const b = { x: o.pivot.x + Math.cos(o.angleRepos) * o.longueur, y: o.pivot.y + Math.sin(o.angleRepos) * o.longueur };
    return { a: o.pivot, b, r: rayonSegment(brut, o.pivot, b) };
  });
  const force = new Int32Array(n).fill(-1);
  // Zones explicites.
  for (const [nom, poly] of Object.entries(options.zones ?? {})) {
    const j = idx.index.get(nom);
    if (j === undefined || poly.length < 3) continue;
    for (let v = 0; v < n; v++) if (dansPolygone(pos[2 * v]!, pos[2 * v + 1]!, poly)) force[v] = j;
  }
  // Zone automatique de la tête : au-dessus du menton, autour du visage.
  const iTete = idx.index.get('tete');
  if (options.visage && iTete !== undefined && !(options.zones && options.zones['tete'])) {
    const vis = options.visage;
    const menton = vis.bouche.menton ?? { x: vis.bouche.centre.x, y: vis.bouche.centre.y + 1.2 * vis.bouche.largeur };
    const cx = (vis.oeilG.centre.x + vis.oeilD.centre.x) / 2;
    const demiLargeur = Math.max(segs[iTete]!.r, Math.abs(vis.oeilG.centre.x - vis.oeilD.centre.x) * 1.3) * 1.35;
    for (let v = 0; v < n; v++) {
      if (force[v]! >= 0) continue;
      const x = pos[2 * v]!;
      const y = pos[2 * v + 1]!;
      if (y <= menton.y + 1 && Math.abs(x - cx) <= demiLargeur && visible(brut, x, y, cx, (vis.oeilG.centre.y + menton.y) / 2)) {
        force[v] = iTete;
      }
    }
  }
  // Cœurs : capsules normalisées, os visibles (les zones forcées gardent la priorité).
  const sources: Array<[number, number, number]> = [];
  for (let v = 0; v < n; v++) {
    const x = pos[2 * v]!;
    const y = pos[2 * v + 1]!;
    if (force[v]! >= 0) {
      sources.push([v, 0, force[v]!]);
      continue;
    }
    let best = -1;
    let bestScore = 1;
    for (let j = 0; j < os.length; j++) {
      const s = segs[j]!;
      const dx = s.b.x - s.a.x;
      const dy = s.b.y - s.a.y;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? ((x - s.a.x) * dx + (y - s.a.y) * dy) / l2 : 0;
      const tc = Math.min(1, Math.max(0, t));
      const qx = s.a.x + tc * dx;
      const qy = s.a.y + tc * dy;
      const d = Math.hypot(x - qx, y - qy);
      const score = t >= 0 && t <= 1 ? d / s.r : d / (0.5 * s.r);
      if (score < bestScore && visible(brut, x, y, qx, qy)) {
        bestScore = score;
        best = j;
      }
    }
    if (best >= 0) sources.push([v, bestScore * segs[best]!.r * 0.25, best]);
  }
  const { etiquettes } = dijkstra(adj, sources);
  // Zones forcées prioritaires.
  for (let v = 0; v < n; v++) if (force[v]! >= 0) etiquettes[v] = force[v]!;
  return etiquettes;
}

/** Lissage par vote : un sommet isolé (aucun voisin de même étiquette) prend l'étiquette majoritaire. */
function lisserEtiquettes(e: Int32Array, adj: Adjacence, passes = 2): void {
  for (let p = 0; p < passes; p++) {
    const copie = Int32Array.from(e);
    for (let v = 0; v < adj.n; v++) {
      const compte = new Map<number, number>();
      let memes = 0;
      for (let k = adj.debut[v]!; k < adj.debut[v + 1]!; k++) {
        const u = adj.voisins[k]!;
        const l = copie[u]!;
        if (l === copie[v]) memes++;
        if (l >= 0) compte.set(l, (compte.get(l) ?? 0) + 1);
      }
      if (memes > 0 && copie[v]! >= 0) continue;
      let best = copie[v]!;
      let bestN = 0;
      for (const [l, c] of compte) if (c > bestN) {
        best = l;
        bestN = c;
      }
      e[v] = best;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Construction complète
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Compacte un maillage après retrait de triangles (sommets non référencés supprimés). */
function compacter(
  pos: Float64Array,
  tri: number[],
  boucles: number[][],
  etiquettes: Int32Array,
): { pos: Float64Array; tri: Uint32Array; boucles: number[][]; etiquettes: Int32Array } {
  const n = pos.length / 2;
  const nouveau = new Int32Array(n).fill(-1);
  let k = 0;
  const utilise = new Uint8Array(n);
  for (const i of tri) utilise[i] = 1;
  for (let v = 0; v < n; v++) if (utilise[v]) nouveau[v] = k++;
  const p = new Float64Array(2 * k);
  const e = new Int32Array(k);
  for (let v = 0; v < n; v++) {
    if (nouveau[v]! < 0) continue;
    p[2 * nouveau[v]!] = pos[2 * v]!;
    p[2 * nouveau[v]! + 1] = pos[2 * v + 1]!;
    e[nouveau[v]!] = etiquettes[v]!;
  }
  const t = Uint32Array.from(tri.map((i) => nouveau[i]!));
  const b = boucles.map((l) => l.filter((i) => nouveau[i]! >= 0).map((i) => nouveau[i]!)).filter((l) => l.length >= 3);
  return { pos: p, tri: t, boucles: b, etiquettes: e };
}

/** Calcule étiquettes, poids, centres CoR et groupes de dessin d'un maillage brut. */
export function calculerPoids(brut: MaillageBrut, squelette: Squelette, options: OptionsPoids = {}): MaillagePondere {
  const debutChrono = performance.now();
  const idx = indexerSquelette(squelette);
  const nOs = squelette.os.length;
  const distancePontMax = options.distancePontMax ?? 2;
  let pos = brut.positions;
  let tri: Uint32Array = brut.triangles;
  let boucles = brut.boucles;
  let n = pos.length / 2;

  // 1. Étiquettes.
  let adj = construireAdjacence(pos, tri, n);
  let etiquettes: Int32Array;
  let mode: 'carte' | 'automatique';
  if (options.etiquettesPixels) {
    mode = 'carte';
    etiquettes = etiquettesDepuisCarte(pos, options.etiquettesPixels, brut.largeur, brut.hauteur);
    // Sommets sans étiquette : propagation depuis les sommets étiquetés.
    if (etiquettes.some((e) => e < 0)) {
      const src: Array<[number, number, number]> = [];
      for (let v = 0; v < n; v++) if (etiquettes[v]! >= 0) src.push([v, 0, etiquettes[v]!]);
      etiquettes = dijkstra(adj, src).etiquettes;
    }
    lisserEtiquettes(etiquettes, adj, 1);
  } else {
    mode = 'automatique';
    etiquettes = etiquettesAutomatiques(brut, pos, adj, squelette, options);
    lisserEtiquettes(etiquettes, adj, 2);
  }
  // Sommets encore sans étiquette (composante sans aucun os) : racine.
  const iRacine = idx.index.get(squelette.racine) ?? 0;
  for (let v = 0; v < n; v++) if (etiquettes[v]! < 0) etiquettes[v] = iRacine;

  // 2. Rayon de chaque partie : 90e centile de la profondeur de ses sommets.
  const profondeurs: number[][] = Array.from({ length: nOs }, () => []);
  for (let v = 0; v < n; v++) {
    const sd = echantillonner(brut.distance, brut.largeur, brut.hauteur, pos[2 * v]! - 0.5, pos[2 * v + 1]! - 0.5);
    profondeurs[etiquettes[v]!]!.push(Math.max(0, -sd));
  }
  const rayons = new Float64Array(nOs);
  const statsRayons: Record<string, number> = {};
  const statsSommets: Record<string, number> = {};
  for (let j = 0; j < nOs; j++) {
    const p = profondeurs[j]!.sort((a, b) => a - b);
    rayons[j] = p.length ? Math.max(3, p[Math.floor(0.9 * (p.length - 1))]!) : 10;
    statsRayons[squelette.os[j]!.nom] = Math.round(rayons[j]! * 10) / 10;
    statsSommets[squelette.os[j]!.nom] = p.length;
  }

  // 3. Découpe des contacts. Parties non voisines (distance > 2 dans l'arbre) : toujours découpées. Parties à distance 2
  //    (bras contre torse, cuisse contre cuisse) : la jonction est gardée quand elle est peinte d'un seul tenant
  //    (couture de la manche), découpée quand une arête mixte traverse le vide du masque d'origine : c'est alors un
  //    simple contact (l'intérieur du bras qui frôle le flanc), comblé par la fermeture ou la dilatation.
  const gardes: number[] = [];
  let pontsRetires = 0;
  const distCache = new Map<number, number>();
  const distOs = (a: number, b: number): number => {
    const k = a * 4096 + b;
    let d = distCache.get(k);
    if (d === undefined) {
      d = distanceArborescente(idx, a, b);
      distCache.set(k, d);
    }
    return d;
  };
  // Un segment traverse-t-il le vide du masque d'origine (avant fermeture et dilatation) ?
  const traverseVide = (u: number, v: number): boolean => {
    const ax = pos[2 * u]!;
    const ay = pos[2 * u + 1]!;
    const bx = pos[2 * v]!;
    const by = pos[2 * v + 1]!;
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let k = 1; k < n; k++) {
      const x = Math.floor(ax + ((bx - ax) * k) / n);
      const y = Math.floor(ay + ((by - ay) * k) / n);
      if (x < 0 || y < 0 || x >= brut.largeur || y >= brut.hauteur || !brut.masque[y * brut.largeur + x]) return true;
    }
    return false;
  };
  const pontAccepte = (a: number, b: number, u: number, v: number): boolean => {
    if (a === b) return true;
    const d = distOs(a, b);
    if (d <= 1) return true;
    if (d > distancePontMax) return false;
    return !traverseVide(u, v);
  };
  // Un triangle de contact n'est pas supprimé (sa peinture compte) : il est donné à la partie qui y possède le plus
  // de peinture, et ses
  // sommets des autres parties sont remplacés par des CLONES étiquetés comme elle. Le maillage est ainsi découpé le
  // long du contact : au repos rien ne change, en mouvement les deux parties se séparent sans trou ni étirement.
  const posListe = Array.from(pos);
  const etiquettesListe = Array.from(etiquettes);
  const clones = new Map<number, number>(); // (sommet, partie) → clone
  const cloner = (v: number, partie: number): number => {
    const cle = v * 4096 + partie;
    let c = clones.get(cle);
    if (c === undefined) {
      c = etiquettesListe.length;
      posListe.push(pos[2 * v]!, pos[2 * v + 1]!);
      etiquettesListe.push(partie);
      clones.set(cle, c);
    }
    return c;
  };
  for (let t = 0; t < tri.length; t += 3) {
    const sommets = [tri[t]!, tri[t + 1]!, tri[t + 2]!];
    const parties = sommets.map((v) => etiquettes[v]!);
    const [la, lb, lc] = parties as [number, number, number];
    if (la !== lb || lb !== lc) {
      const [va, vb, vc] = sommets as [number, number, number];
      if (!pontAccepte(la, lb, va, vb) || !pontAccepte(lb, lc, vb, vc) || !pontAccepte(la, lc, va, vc)) {
        pontsRetires++;
        // Partie qui possède le plus de peinture dans le triangle (chaque échantillon peint va au sommet le plus
        // proche en barycentriques). Un triangle presque vide (le vide comblé du contact) est abandonné.
        const compte = new Map<number, number>();
        let peints = 0;
        let total = 0;
        const N = 6;
        for (let i = 0; i <= N; i++) {
          for (let j = 0; i + j <= N; j++) {
            const b0 = (i + 0.33) / (N + 1);
            const b1 = (j + 0.33) / (N + 1);
            const b2 = 1 - b0 - b1;
            if (b2 < 0) continue;
            total++;
            const x = Math.floor(b0 * pos[2 * va]! + b1 * pos[2 * vb]! + b2 * pos[2 * vc]!);
            const y = Math.floor(b0 * pos[2 * va + 1]! + b1 * pos[2 * vb + 1]! + b2 * pos[2 * vc + 1]!);
            if (x < 0 || y < 0 || x >= brut.largeur || y >= brut.hauteur || !brut.masque[y * brut.largeur + x]) continue;
            peints++;
            const k = b0 >= b1 && b0 >= b2 ? 0 : b1 >= b2 ? 1 : 2;
            compte.set(parties[k]!, (compte.get(parties[k]!) ?? 0) + 1);
          }
        }
        if (peints < 0.25 * total) continue;
        let maj = la;
        let best = -1;
        for (const [l, c] of compte) if (c > best) {
          best = c;
          maj = l;
        }
        for (let k = 0; k < 3; k++) gardes.push(parties[k] === maj ? sommets[k]! : cloner(sommets[k]!, maj));
        continue;
      }
    }
    gardes.push(sommets[0]!, sommets[1]!, sommets[2]!);
  }
  if (pontsRetires > 0) {
    const c = compacter(Float64Array.from(posListe), gardes, boucles, Int32Array.from(etiquettesListe));
    pos = c.pos;
    tri = c.tri;
    boucles = c.boucles;
    etiquettes = c.etiquettes;
    n = pos.length / 2;
    adj = construireAdjacence(pos, tri, n);
  }

  // 4. Bandes : sommets libres près des frontières entre parties voisines.
  const facteur = options.facteurBande ?? 0.9;
  const bMin = options.bandeMin ?? 6;
  const bMax = options.bandeMax ?? 40;
  const libre = new Uint8Array(n);
  const paires = new Set<number>();
  for (let v = 0; v < n; v++) {
    for (let k = adj.debut[v]!; k < adj.debut[v + 1]!; k++) {
      const u = adj.voisins[k]!;
      const a = etiquettes[v]!;
      const b = etiquettes[u]!;
      if (a !== b && distOs(a, b) <= distancePontMax) paires.add(a * 4096 + b);
    }
  }
  for (const cle of paires) {
    const j = Math.floor(cle / 4096);
    const k = cle % 4096;
    const rj = rayons[j]!;
    const rk = rayons[k]!;
    const bande = Math.min(bMax, Math.max(bMin, facteur * Math.min(rj, rk)));
    // Côté j : plie-t-il ?
    let mode: 'oui' | 'non' | 'articulation';
    if (rj < 0.6 * rk) mode = 'oui';
    else if (rk < 0.6 * rj) mode = 'non';
    else if (estAncetre(idx, k, j) || !estAncetre(idx, j, k)) mode = 'oui';
    else mode = 'articulation';
    if (mode === 'non') continue;
    const articulation = articulationEntre(squelette, j, k);
    const sources: Array<[number, number, number]> = [];
    for (let v = 0; v < n; v++) {
      if (etiquettes[v] !== j) continue;
      for (let q = adj.debut[v]!; q < adj.debut[v + 1]!; q++) {
        if (etiquettes[adj.voisins[q]!] === k) {
          sources.push([v, adj.longueurs[q]! / 2, 0]);
          break;
        }
      }
    }
    const { distances } = dijkstra(adj, sources, (v) => etiquettes[v] === j, bande);
    for (let v = 0; v < n; v++) {
      if (etiquettes[v] !== j || !(distances[v]! < bande)) continue;
      if (mode === 'articulation') {
        if (!articulation) continue;
        if (Math.hypot(pos[2 * v]! - articulation.x, pos[2 * v + 1]! - articulation.y) > 2 * bande) continue;
      }
      libre[v] = 1;
    }
  }

  // 5. Harmonique par composante libre.
  const influences = new Int32Array(4 * n).fill(-1);
  const poids = new Float64Array(4 * n);
  const poidsMin = options.poidsMin ?? 0.004;
  let composantes = 0;
  let iterationsCG = 0;
  let ecartPartition = 0;
  let sommetsLibres = 0;
  const vu = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    if (!libre[v]) {
      influences[4 * v] = etiquettes[v]!;
      poids[4 * v] = 1;
    } else sommetsLibres++;
  }
  for (let depart = 0; depart < n; depart++) {
    if (!libre[depart] || vu[depart]) continue;
    composantes++;
    const comp: number[] = [];
    const pile = [depart];
    vu[depart] = 1;
    while (pile.length) {
      const v = pile.pop()!;
      comp.push(v);
      for (let k = adj.debut[v]!; k < adj.debut[v + 1]!; k++) {
        const u = adj.voisins[k]!;
        if (libre[u] && !vu[u]) {
          vu[u] = 1;
          pile.push(u);
        }
      }
    }
    const local = new Map<number, number>();
    comp.forEach((v, i) => local.set(v, i));
    const bords = new Set<number>();
    for (const v of comp) {
      for (let k = adj.debut[v]!; k < adj.debut[v + 1]!; k++) {
        const u = adj.voisins[k]!;
        if (!libre[u]) bords.add(etiquettes[u]!);
      }
    }
    const m = comp.length;
    if (bords.size <= 1) {
      const os = bords.size === 1 ? [...bords][0]! : etiquettes[comp[0]!]!;
      for (const v of comp) {
        influences[4 * v] = os;
        poids[4 * v] = 1;
      }
      continue;
    }
    const diag = new Float64Array(m);
    comp.forEach((v, i) => {
      let s = 0;
      for (let k = adj.debut[v]!; k < adj.debut[v + 1]!; k++) s += adj.cotangentes[k]!;
      diag[i] = s;
    });
    const appliquer = (x: Float64Array, sortie: Float64Array): void => {
      for (let i = 0; i < m; i++) {
        const v = comp[i]!;
        let s = diag[i]! * x[i]!;
        for (let k = adj.debut[v]!; k < adj.debut[v + 1]!; k++) {
          const li = local.get(adj.voisins[k]!);
          if (li !== undefined) s -= adj.cotangentes[k]! * x[li]!;
        }
        sortie[i] = s;
      }
    };
    const solutions = new Map<number, Float64Array>();
    for (const b of bords) {
      const rhs = new Float64Array(m);
      comp.forEach((v, i) => {
        let s = 0;
        for (let k = adj.debut[v]!; k < adj.debut[v + 1]!; k++) {
          const u = adj.voisins[k]!;
          if (!libre[u] && etiquettes[u] === b) s += adj.cotangentes[k]!;
        }
        rhs[i] = s;
      });
      const x = new Float64Array(m);
      iterationsCG += gradientConjugue(appliquer, diag, rhs, x, 1e-11, 4000);
      solutions.set(b, x);
    }
    for (let i = 0; i < m; i++) {
      const v = comp[i]!;
      const liste: Array<[number, number]> = [];
      let somme = 0;
      for (const [b, x] of solutions) {
        const w = Math.min(1, Math.max(0, x[i]!));
        somme += w;
        liste.push([b, w]);
      }
      ecartPartition = Math.max(ecartPartition, Math.abs(somme - 1));
      liste.sort((p, q) => q[1] - p[1]);
      let gardesW = liste.slice(0, 4).filter(([, w]) => w >= poidsMin);
      if (!gardesW.length) gardesW = [liste[0]!];
      const s = gardesW.reduce((a, [, w]) => a + w, 0);
      gardesW.forEach(([b, w], k) => {
        influences[4 * v + k] = b;
        poids[4 * v + k] = w / s;
      });
    }
  }

  // 6. Centres de rotation CoR.
  const sigma = options.sigmaCor ?? 0.1;
  const centres = new Float64Array(2 * n).fill(Number.NaN);
  const poidsDe = (v: number): Map<number, number> => {
    const r = new Map<number, number>();
    for (let s = 0; s < 4; s++) {
      const j = influences[4 * v + s]!;
      if (j >= 0) r.set(j, poids[4 * v + s]!);
    }
    return r;
  };
  // Triangles à plusieurs os, indexés par paire d'os.
  const nT = tri.length / 3;
  const parPaire = new Map<number, number[]>();
  const triPoids: Array<Map<number, number>> = new Array(nT);
  const triAire = new Float64Array(nT);
  const triCx = new Float64Array(nT);
  const triCy = new Float64Array(nT);
  for (let t = 0; t < nT; t++) {
    const a = tri[3 * t]!;
    const b = tri[3 * t + 1]!;
    const c = tri[3 * t + 2]!;
    const wt = new Map<number, number>();
    for (const v of [a, b, c]) for (const [j, w] of poidsDe(v)) wt.set(j, (wt.get(j) ?? 0) + w / 3);
    triPoids[t] = wt;
    if (wt.size < 2) continue;
    triAire[t] = Math.abs((pos[2 * b]! - pos[2 * a]!) * (pos[2 * c + 1]! - pos[2 * a + 1]!) - (pos[2 * c]! - pos[2 * a]!) * (pos[2 * b + 1]! - pos[2 * a + 1]!)) / 2;
    triCx[t] = (pos[2 * a]! + pos[2 * b]! + pos[2 * c]!) / 3;
    triCy[t] = (pos[2 * a + 1]! + pos[2 * b + 1]! + pos[2 * c + 1]!) / 3;
    const os = [...wt.keys()].sort((p, q) => p - q);
    for (let i = 0; i < os.length; i++) {
      for (let k = i + 1; k < os.length; k++) {
        const cle = os[i]! * 4096 + os[k]!;
        const l = parPaire.get(cle);
        if (l) l.push(t);
        else parPaire.set(cle, [t]);
      }
    }
  }
  let sommetsCor = 0;
  for (let v = 0; v < n; v++) {
    const wp = poidsDe(v);
    if (wp.size < 2) continue;
    const os = [...wp.keys()].sort((p, q) => p - q);
    if (os.length === 2) {
      // Paire parent/enfant (coude, genou, poignet, cou…) : le centre est l'articulation elle-même. Les deux os
      // l'envoient au même point, si bien que le sommet tourne autour du coude de l'angle mélangé : le contour
      // extérieur reste un arc exact (rayon conservé à 100 %).
      const [a, b] = os as [number, number];
      const enfant = idx.parents[b] === a ? b : idx.parents[a] === b ? a : -1;
      if (enfant >= 0) {
        centres[2 * v] = squelette.os[enfant]!.pivot.x;
        centres[2 * v + 1] = squelette.os[enfant]!.pivot.y;
        sommetsCor++;
        continue;
      }
    }
    let num = 0;
    let numX = 0;
    let numY = 0;
    for (let i = 0; i < os.length; i++) {
      for (let k = i + 1; k < os.length; k++) {
        const j1 = os[i]!;
        const j2 = os[k]!;
        const l = parPaire.get(j1 * 4096 + j2);
        if (!l) continue;
        const a1 = wp.get(j1)!;
        const a2 = wp.get(j2)!;
        for (const t of l) {
          const wt = triPoids[t]!;
          const b1 = wt.get(j1)!;
          const b2 = wt.get(j2)!;
          const e = (a1 * b2 - a2 * b1) / sigma;
          const s = 2 * a1 * a2 * b1 * b2 * Math.exp(-e * e) * triAire[t]!;
          num += s;
          numX += s * triCx[t]!;
          numY += s * triCy[t]!;
        }
      }
    }
    if (num > 1e-12) {
      centres[2 * v] = numX / num;
      centres[2 * v + 1] = numY / num;
      sommetsCor++;
    }
  }

  // 7. Groupes de dessin.
  const orientation = options.orientation ?? 0;
  const ordres = ordreMembres(orientation);
  const membreOs = squelette.os.map((_, j) => membreDe(squelette, j));
  const triMembre: string[] = new Array(nT);
  for (let t = 0; t < nT; t++) {
    const score = new Map<number, number>();
    for (let e = 0; e < 3; e++) {
      const v = tri[3 * t + e]!;
      const l = etiquettes[v]!;
      score.set(l, (score.get(l) ?? 0) + 1 + 0.01 * (poidsDe(v).get(l) ?? 0));
    }
    let best = -1;
    let bestS = -1;
    for (const [l, s] of score) if (s > bestS) {
      best = l;
      bestS = s;
    }
    triMembre[t] = membreOs[best]!;
  }
  const nomsGroupes = [...new Set(triMembre)].sort((a, b) => (ordres[a] ?? 2) - (ordres[b] ?? 2) || a.localeCompare(b));
  const ordreTri: number[] = [];
  const groupes: GroupeDessin[] = [];
  for (const g of nomsGroupes) {
    const premier = ordreTri.length;
    for (let t = 0; t < nT; t++) if (triMembre[t] === g) ordreTri.push(t);
    const osPrincipal = g === 'corps' ? 'torse' : g === 'tete' ? 'tete' : g.startsWith('jambe') ? `cuisse${g.slice(-1)}` : g;
    groupes.push({ nom: g, premierTriangle: premier, nombreTriangles: ordreTri.length - premier, ordre: ordres[g] ?? 2, os: osPrincipal });
  }
  const triTrie = new Uint32Array(tri.length);
  ordreTri.forEach((t, k) => {
    triTrie[3 * k] = tri[3 * t]!;
    triTrie[3 * k + 1] = tri[3 * t + 1]!;
    triTrie[3 * k + 2] = tri[3 * t + 2]!;
  });

  return {
    positions: pos,
    triangles: triTrie,
    boucles,
    etiquettes,
    influences,
    poids,
    centres,
    groupes,
    stats: {
      pontsRetires,
      sommetsLibres,
      sommetsCor,
      composantesLibres: composantes,
      iterationsCG,
      rayons: statsRayons,
      sommetsParOs: statsSommets,
      ecartPartition,
      etiquetage: mode,
      dureeMs: performance.now() - debutChrono,
    },
  };
}
