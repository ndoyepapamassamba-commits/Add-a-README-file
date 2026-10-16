/**
 * Maillage de CONTRÔLE pour ARAP : simplification d'un maillage triangulé 2D par effondrement d'arêtes (le sommet
 * retiré rejoint un voisin gardé : les sommets de contrôle sont un sous-ensemble des sommets fins), puis
 * plongement de chaque sommet fin dans un triangle de contrôle de sa composante (coordonnées barycentriques, non
 * bornées hors du maillage de contrôle : extension affine).
 *
 * Règles de l'effondrement `u → v` (on garde la topologie : les pièces séparées restent séparées, aucune arête ne
 * franchit un vide) :
 * - arête la plus courte d'abord (densité finale régulière) ;
 * - condition de lien (les voisins communs de u et v sont exactement les sommets opposés de l'arête) ;
 * - aucun triangle retourné ni dégénéré, angle minimal préservé (≥ `angleMin`, ou pas pire qu'avant) ;
 * - un sommet du bord ne glisse que le long du bord, et seulement si l'écart au nouveau contour reste faible ;
 * - chaque composante garde au moins `minParComposante` sommets.
 *
 * Module pur et déterministe (aucun hasard, tie-break par indices).
 */

/** Résultat de la simplification. */
export interface MaillageControle {
  /** Indice FIN de chaque sommet de contrôle (croissant). */
  garde: Int32Array;
  /** Triangles de contrôle (3T', indices de contrôle). */
  triangles: Int32Array;
}

/** Plongement des sommets fins dans le maillage de contrôle. */
export interface Plongement {
  /** 3V : sommets de contrôle du triangle porteur. */
  sommets: Int32Array;
  /** 3V : poids barycentriques (somme 1, non bornés). */
  poids: Float64Array;
}

/** Réglages de la simplification. */
export interface OptionsDecimation {
  /** Angle minimal visé des triangles (degrés, défaut 8). */
  angleMin?: number;
  /** Écart maximal au contour, en fraction du pas visé du maillage de contrôle (défaut 0,2). */
  toleranceBord?: number;
  /** Sommets minimaux par composante (défaut 8). */
  minParComposante?: number;
  /** Compteurs de refus par motif (diagnostic), remplis si fourni. */
  diagnostic?: Record<string, number>;
}

// ── Tas binaire (clé, a, b), tie-break déterministe ─────────────────────────────────────────────────────────────

class Tas {
  private cles = new Float64Array(1024);
  private as = new Int32Array(1024);
  private bs = new Int32Array(1024);
  taille = 0;

  private plusPetit(i: number, j: number): boolean {
    const ci = this.cles[i]!;
    const cj = this.cles[j]!;
    if (ci !== cj) return ci < cj;
    if (this.as[i] !== this.as[j]) return this.as[i]! < this.as[j]!;
    return this.bs[i]! < this.bs[j]!;
  }
  private echanger(i: number, j: number): void {
    const c = this.cles[i]!;
    this.cles[i] = this.cles[j]!;
    this.cles[j] = c;
    const a = this.as[i]!;
    this.as[i] = this.as[j]!;
    this.as[j] = a;
    const b = this.bs[i]!;
    this.bs[i] = this.bs[j]!;
    this.bs[j] = b;
  }
  pousser(cle: number, a: number, b: number): void {
    if (this.taille === this.cles.length) {
      const n = this.cles.length * 2;
      const c = new Float64Array(n);
      c.set(this.cles);
      this.cles = c;
      const x = new Int32Array(n);
      x.set(this.as);
      this.as = x;
      const y = new Int32Array(n);
      y.set(this.bs);
      this.bs = y;
    }
    let i = this.taille++;
    this.cles[i] = cle;
    this.as[i] = a;
    this.bs[i] = b;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.plusPetit(i, p)) break;
      this.echanger(i, p);
      i = p;
    }
  }
  /** Retire le minimum ; renvoie [a, b]. */
  extraire(): [number, number] {
    const a = this.as[0]!;
    const b = this.bs[0]!;
    this.taille--;
    if (this.taille > 0) {
      this.cles[0] = this.cles[this.taille]!;
      this.as[0] = this.as[this.taille]!;
      this.bs[0] = this.bs[this.taille]!;
      let i = 0;
      for (;;) {
        const g = 2 * i + 1;
        const d = g + 1;
        let m = i;
        if (g < this.taille && this.plusPetit(g, m)) m = g;
        if (d < this.taille && this.plusPetit(d, m)) m = d;
        if (m === i) break;
        this.echanger(i, m);
        i = m;
      }
    }
    return [a, b];
  }
}

// ── Géométrie ─────────────────────────────────────────────────────────────────────────────────────────────────────

function aire2(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
}

/** Plus petit angle d'un triangle (rad). */
function angleMinimal(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const a2 = (bx - cx) ** 2 + (by - cy) ** 2;
  const b2 = (ax - cx) ** 2 + (ay - cy) ** 2;
  const c2 = (ax - bx) ** 2 + (ay - by) ** 2;
  const a = Math.sqrt(a2);
  const b = Math.sqrt(b2);
  const c = Math.sqrt(c2);
  if (a < 1e-12 || b < 1e-12 || c < 1e-12) return 0;
  const cosA = Math.min(1, Math.max(-1, (b2 + c2 - a2) / (2 * b * c)));
  const cosB = Math.min(1, Math.max(-1, (a2 + c2 - b2) / (2 * a * c)));
  const A = Math.acos(cosA);
  const B = Math.acos(cosB);
  return Math.min(A, B, Math.PI - A - B);
}

/** Distance d'un point au segment [p, q]. */
function distanceSegment(x: number, y: number, px: number, py: number, qx: number, qy: number): number {
  const dx = qx - px;
  const dy = qy - py;
  const l2 = dx * dx + dy * dy;
  const u = l2 > 1e-18 ? Math.min(1, Math.max(0, ((x - px) * dx + (y - py) * dy) / l2)) : 0;
  return Math.hypot(x - px - u * dx, y - py - u * dy);
}

/** Étiquettes de composantes connexes (par triangles) ; −1 pour un sommet hors de tout triangle. */
export function composantesSommets(V: number, triangles: ArrayLike<number>): Int32Array {
  const parent = new Int32Array(V);
  for (let i = 0; i < V; i++) parent[i] = i;
  const racine = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const unir = (a: number, b: number): void => {
    const ra = racine(a);
    const rb = racine(b);
    if (ra !== rb) parent[ra > rb ? ra : rb] = ra > rb ? rb : ra;
  };
  const utilise = new Uint8Array(V);
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t]!;
    const b = triangles[t + 1]!;
    const c = triangles[t + 2]!;
    utilise[a] = utilise[b] = utilise[c] = 1;
    unir(a, b);
    unir(b, c);
  }
  const etiquette = new Int32Array(V).fill(-1);
  const numero = new Map<number, number>();
  for (let v = 0; v < V; v++) {
    if (!utilise[v]) continue;
    const r = racine(v);
    let k = numero.get(r);
    if (k === undefined) numero.set(r, (k = numero.size));
    etiquette[v] = k;
  }
  return etiquette;
}

/**
 * Simplifie un maillage jusqu'à environ `cible` sommets (réparti entre composantes au prorata de leurs sommets).
 * Si le maillage a déjà au plus `cible` sommets, il est rendu tel quel.
 */
export function decimerMaillage(positions: ArrayLike<number>, triangles: ArrayLike<number>, cible: number, options: OptionsDecimation = {}): MaillageControle {
  const V = positions.length / 2;
  const T = triangles.length / 3;
  const angleMin = ((options.angleMin ?? 8) * Math.PI) / 180;
  const tolBordRelative = options.toleranceBord ?? 0.2;
  const minC = Math.max(3, options.minParComposante ?? 8);
  const P = positions;
  const tri = Int32Array.from(triangles as ArrayLike<number>);
  const triVivant = new Uint8Array(T).fill(1);
  const incid: number[][] = Array.from({ length: V }, () => []);
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) incid[tri[3 * t + k]!]!.push(t);
  const vivant = new Uint8Array(V);
  for (let v = 0; v < V; v++) vivant[v] = incid[v]!.length > 0 ? 1 : 0;
  const comp = composantesSommets(V, tri);
  const nbComp = comp.reduce((m, c) => Math.max(m, c + 1), 0);
  const compte = new Int32Array(nbComp);
  let total = 0;
  for (let v = 0; v < V; v++) {
    if (comp[v]! >= 0) {
      compte[comp[v]!]++;
      total++;
    }
  }
  if (total <= cible) {
    const garde: number[] = [];
    for (let v = 0; v < V; v++) if (vivant[v]) garde.push(v);
    return reindexer(garde, tri, triVivant, V);
  }
  const ratio = cible / total;
  // Pas visé (px) : aire totale / sommets visés, en triangles équilatéraux (≈ 2 triangles par sommet).
  let aire = 0;
  for (let t = 0; t < T; t++) {
    const a = tri[3 * t]!;
    const b = tri[3 * t + 1]!;
    const c = tri[3 * t + 2]!;
    aire += Math.abs(aire2(P[2 * a]!, P[2 * a + 1]!, P[2 * b]!, P[2 * b + 1]!, P[2 * c]!, P[2 * c + 1]!)) / 2;
  }
  const pasVise = Math.sqrt((4 * aire) / (Math.sqrt(3) * 2 * Math.max(1, cible)));
  const tolBord = tolBordRelative * pasVise;
  const objectif = new Int32Array(nbComp);
  for (let c = 0; c < nbComp; c++) objectif[c] = Math.min(compte[c]!, Math.max(minC, Math.round(compte[c]! * ratio)));

  const trianglesDe = (u: number): number[] => {
    const l = incid[u]!;
    let k = 0;
    for (const t of l) if (triVivant[t]) l[k++] = t;
    l.length = k;
    return l;
  };
  /** Compte, pour chaque voisin w de u, le nombre de triangles vivants contenant (u, w). */
  const comptesVoisins = (u: number): Map<number, number> => {
    const m = new Map<number, number>();
    for (const t of trianglesDe(u)) {
      for (let k = 0; k < 3; k++) {
        const w = tri[3 * t + k]!;
        if (w !== u) m.set(w, (m.get(w) ?? 0) + 1);
      }
    }
    return m;
  };
  const x = (v: number): number => P[2 * v]!;
  const y = (v: number): number => P[2 * v + 1]!;

  /** Qualité (angle minimal des triangles modifiés) de l'effondrement u → v, ou −1 s'il est interdit. */
  const diag = options.diagnostic;
  const refus = (motif: string): number => {
    if (diag) diag[motif] = (diag[motif] ?? 0) + 1;
    return -1;
  };
  const essai = (u: number, v: number): number => {
    const cu = comptesVoisins(u);
    const nUV = cu.get(v);
    if (!nUV) return refus('arete-absente');
    const cv = comptesVoisins(v);
    const bordU = [...cu.entries()].filter(([, n]) => n === 1).map(([w]) => w);
    const bordV = [...cv.values()].some((n) => n === 1);
    const areteBord = nUV === 1;
    if (bordU.length > 0) {
      // u sur le bord : il ne peut glisser que le long du bord, vers un voisin de bord.
      if (!areteBord) return refus('bord:arete-interieure');
      if (bordU.length !== 2) return refus('bord:non-variete');
      const w = bordU[0] === v ? bordU[1]! : bordU[0]!;
      if (distanceSegment(x(u), y(u), x(w), y(w), x(v), y(v)) > tolBord) return refus('bord:ecart');
    } else if (areteBord) return refus('bord:incoherent');
    if (areteBord && !bordV) return refus('bord:incoherent');
    // Condition de lien.
    const opposes = new Set<number>();
    for (const t of trianglesDe(u)) {
      let a = false;
      for (let k = 0; k < 3; k++) if (tri[3 * t + k] === v) a = true;
      if (!a) continue;
      for (let k = 0; k < 3; k++) {
        const w = tri[3 * t + k]!;
        if (w !== u && w !== v) opposes.add(w);
      }
    }
    let communs = 0;
    for (const w of cu.keys()) if (w !== v && cv.has(w)) communs++;
    if (communs !== opposes.size) return refus('lien');
    // Géométrie des triangles qui restent.
    let qualite = Math.PI;
    for (const t of trianglesDe(u)) {
      const i0 = tri[3 * t]!;
      const i1 = tri[3 * t + 1]!;
      const i2 = tri[3 * t + 2]!;
      if (i0 === v || i1 === v || i2 === v) continue;
      const a0 = aire2(x(i0), y(i0), x(i1), y(i1), x(i2), y(i2));
      const j0 = i0 === u ? v : i0;
      const j1 = i1 === u ? v : i1;
      const j2 = i2 === u ? v : i2;
      const a1 = aire2(x(j0), y(j0), x(j1), y(j1), x(j2), y(j2));
      if (a0 * a1 <= 0 || Math.abs(a1) < 1e-9 * Math.abs(a0) + 1e-12) return refus('retournement');
      const avant = angleMinimal(x(i0), y(i0), x(i1), y(i1), x(i2), y(i2));
      const apres = angleMinimal(x(j0), y(j0), x(j1), y(j1), x(j2), y(j2));
      if (apres < angleMin && apres < avant - 1e-12) return refus('angle');
      if (apres < qualite) qualite = apres;
    }
    return qualite;
  };

  const effondrer = (u: number, v: number): void => {
    for (const t of trianglesDe(u)) {
      let contientV = false;
      for (let k = 0; k < 3; k++) if (tri[3 * t + k] === v) contientV = true;
      if (contientV) {
        triVivant[t] = 0;
        continue;
      }
      for (let k = 0; k < 3; k++) if (tri[3 * t + k] === u) tri[3 * t + k] = v;
      incid[v]!.push(t);
    }
    incid[u]!.length = 0;
    vivant[u] = 0;
    compte[comp[u]!]--;
    total--;
    // Nouvelles arêtes autour de v.
    for (const w of comptesVoisins(v).keys()) pousserArete(v, w);
  };

  const tas = new Tas();
  const pousserArete = (a: number, b: number): void => {
    const i = a < b ? a : b;
    const j = a < b ? b : a;
    tas.pousser((x(i) - x(j)) ** 2 + (y(i) - y(j)) ** 2, i, j);
  };
  const initiales = new Set<number>();
  for (let t = 0; t < T; t++) {
    for (let k = 0; k < 3; k++) {
      const a = tri[3 * t + k]!;
      const b = tri[3 * t + ((k + 1) % 3)]!;
      const cle = a < b ? a * V + b : b * V + a;
      if (initiales.has(cle)) continue;
      initiales.add(cle);
      pousserArete(a, b);
    }
  }
  const dejaVu = new Set<number>();
  let derniereTaille = -1;
  while (tas.taille > 0 && total > cible) {
    const [a, b] = tas.extraire();
    if (!vivant[a] || !vivant[b]) continue;
    const c = comp[a]!;
    if (compte[c]! <= objectif[c]!) continue;
    // Doublons exacts consécutifs (même arête poussée deux fois sans changement) : ignorés.
    if (derniereTaille !== total) {
      dejaVu.clear();
      derniereTaille = total;
    }
    const cle = a * V + b;
    if (dejaVu.has(cle)) continue;
    dejaVu.add(cle);
    const qa = essai(a, b);
    const qb = essai(b, a);
    if (qa < 0 && qb < 0) continue;
    if (qa >= qb) effondrer(a, b);
    else effondrer(b, a);
  }
  const garde: number[] = [];
  for (let v = 0; v < V; v++) if (vivant[v] && trianglesDe(v).length > 0) garde.push(v);
  return reindexer(garde, tri, triVivant, V);
}

function reindexer(garde: number[], tri: Int32Array, triVivant: Uint8Array, V: number): MaillageControle {
  const nouvel = new Int32Array(V).fill(-1);
  garde.forEach((v, k) => (nouvel[v] = k));
  const t: number[] = [];
  for (let k = 0; k < triVivant.length; k++) {
    if (!triVivant[k]) continue;
    const a = nouvel[tri[3 * k]!]!;
    const b = nouvel[tri[3 * k + 1]!]!;
    const c = nouvel[tri[3 * k + 2]!]!;
    if (a < 0 || b < 0 || c < 0 || a === b || b === c || a === c) continue;
    t.push(a, b, c);
  }
  return { garde: Int32Array.from(garde), triangles: Int32Array.from(t) };
}

/** Distance d'un point au triangle (a, b, c), supposé hors du triangle. */
function distanceTriangle(x: number, y: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return Math.min(distanceSegment(x, y, ax, ay, bx, by), distanceSegment(x, y, bx, by, cx, cy), distanceSegment(x, y, cx, cy, ax, ay));
}

/** Barycentriques de (px, py) dans le triangle (a, b, c) ; `null` si dégénéré. */
export function barycentriques(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): [number, number, number] | null {
  const d = aire2(ax, ay, bx, by, cx, cy);
  if (Math.abs(d) < 1e-12) return null;
  const l0 = aire2(px, py, bx, by, cx, cy) / d;
  const l1 = aire2(ax, ay, px, py, cx, cy) / d;
  return [l0, l1, 1 - l0 - l1];
}

/**
 * Plonge chaque sommet fin dans un triangle de contrôle de SA composante (celui qui le contient, sinon le plus
 * proche au sens des barycentriques). Un sommet gardé est plongé exactement sur lui-même.
 */
export function plongerSommets(positions: ArrayLike<number>, trianglesFins: ArrayLike<number>, controle: MaillageControle): Plongement {
  const V = positions.length / 2;
  const { garde, triangles } = controle;
  const Tc = triangles.length / 3;
  const compFin = composantesSommets(V, trianglesFins);
  const indiceControle = new Int32Array(V).fill(-1);
  garde.forEach((v, k) => (indiceControle[v] = k));
  const px = (c: number): number => positions[2 * garde[c]!]!;
  const py = (c: number): number => positions[2 * garde[c]! + 1]!;
  // Grille des triangles de contrôle.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let somme = 0;
  for (let t = 0; t < Tc; t++) {
    for (let k = 0; k < 3; k++) {
      const c = triangles[3 * t + k]!;
      minX = Math.min(minX, px(c));
      maxX = Math.max(maxX, px(c));
      minY = Math.min(minY, py(c));
      maxY = Math.max(maxY, py(c));
    }
    const a = triangles[3 * t]!;
    const b = triangles[3 * t + 1]!;
    somme += Math.hypot(px(a) - px(b), py(a) - py(b));
  }
  const pas = Math.max(1e-6, (2 * somme) / Math.max(1, Tc));
  const nx = Math.max(1, Math.ceil((maxX - minX) / pas) + 1);
  const ny = Math.max(1, Math.ceil((maxY - minY) / pas) + 1);
  const cases: number[][] = Array.from({ length: nx * ny }, () => []);
  const caseDe = (x: number, y: number): [number, number] => [
    Math.min(nx - 1, Math.max(0, Math.floor((x - minX) / pas))),
    Math.min(ny - 1, Math.max(0, Math.floor((y - minY) / pas))),
  ];
  const compTri = new Int32Array(Tc);
  for (let t = 0; t < Tc; t++) {
    const a = triangles[3 * t]!;
    const b = triangles[3 * t + 1]!;
    const c = triangles[3 * t + 2]!;
    compTri[t] = compFin[garde[a]!]!;
    const [i0, j0] = caseDe(Math.min(px(a), px(b), px(c)), Math.min(py(a), py(b), py(c)));
    const [i1, j1] = caseDe(Math.max(px(a), px(b), px(c)), Math.max(py(a), py(b), py(c)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cases[j * nx + i]!.push(t);
  }
  const sommets = new Int32Array(3 * V);
  const poids = new Float64Array(3 * V);
  for (let v = 0; v < V; v++) {
    const k = indiceControle[v]!;
    if (k >= 0) {
      sommets[3 * v] = sommets[3 * v + 1] = sommets[3 * v + 2] = k;
      poids[3 * v] = 1;
      continue;
    }
    const x = positions[2 * v]!;
    const y = positions[2 * v + 1]!;
    const c = compFin[v]!;
    let meilleur = -1;
    let distance = Infinity;
    let centrage = -Infinity;
    let bary: [number, number, number] = [1, 0, 0];
    const [ci, cj] = caseDe(x, y);
    const rMax = Math.max(nx, ny);
    for (let r = 0; r <= rMax; r++) {
      for (let j = cj - r; j <= cj + r; j++) {
        if (j < 0 || j >= ny) continue;
        for (let i = ci - r; i <= ci + r; i++) {
          if (i < 0 || i >= nx) continue;
          if (r > 0 && Math.abs(i - ci) !== r && Math.abs(j - cj) !== r) continue;
          for (const t of cases[j * nx + i]!) {
            if (c >= 0 && compTri[t] !== c) continue;
            const a = triangles[3 * t]!;
            const b = triangles[3 * t + 1]!;
            const d = triangles[3 * t + 2]!;
            const l = barycentriques(x, y, px(a), py(a), px(b), py(b), px(d), py(d));
            if (!l) continue;
            const s = Math.min(l[0], l[1], l[2]);
            // Distance euclidienne au triangle (0 dedans) ; à égalité, le mieux centré, puis le plus petit indice.
            const dt = s >= 0 ? 0 : distanceTriangle(x, y, px(a), py(a), px(b), py(b), px(d), py(d));
            if (dt < distance - 1e-9 || (Math.abs(dt - distance) <= 1e-9 && (s > centrage + 1e-12 || (Math.abs(s - centrage) <= 1e-12 && t < meilleur)))) {
              distance = dt;
              centrage = s;
              meilleur = t;
              bary = l;
            }
          }
        }
      }
      // Arrêt : triangle contenant trouvé, ou anneau déjà plus loin que le meilleur trouvé.
      if (meilleur >= 0 && (distance === 0 || r * pas > distance + pas)) break;
    }
    if (meilleur < 0) {
      // Composante sans triangle de contrôle (sommet isolé) : plongé sur le sommet de contrôle le plus proche.
      let best = 0;
      let dmin = Infinity;
      for (let k2 = 0; k2 < garde.length; k2++) {
        const d = (px(k2) - x) ** 2 + (py(k2) - y) ** 2;
        if (d < dmin) {
          dmin = d;
          best = k2;
        }
      }
      sommets[3 * v] = sommets[3 * v + 1] = sommets[3 * v + 2] = best;
      poids[3 * v] = 1;
      continue;
    }
    for (let k2 = 0; k2 < 3; k2++) {
      sommets[3 * v + k2] = triangles[3 * meilleur + k2]!;
      poids[3 * v + k2] = bary[k2]!;
    }
  }
  return { sommets, poids };
}
