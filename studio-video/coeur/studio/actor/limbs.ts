/**
 * MEMBRES SÉPARÉS — the drawing's mesh is cut where two body parts that are NOT jointed touch in the drawing (director
 * review of film v4, 16/10: Modou's hand hung against his thigh, the grid mesh welded them, and when the arm opened the
 * hand was dragged between the moving wrist and the still leg — a bent wrist and claw-like fingers). Each triangle
 * belongs to the body part whose bone is nearest (BlazePose skeleton measured on the drawing); a vertex shared by parts
 * that are not jointed (hand–thigh, hand–cheek, forearm–flank, foot–other leg…) is duplicated, so those parts stay
 * joined at rest — same pixels, same picture — and separate when they move. Jointed parts (shoulder, elbow, wrist,
 * hip, knee, ankle, neck, and the two legs inside a dress) stay one mesh. Pure: no DOM.
 */
import type { Mesh2D } from './arap';

export type Pt = [number, number];
export interface Part {
  id: string;
  a: Pt;
  b: Pt;
  /** for an arm part: how far from its bone a triangle may still belong to it (px) — a headscarf's knot near a raised
   *  hand, a trouser pocket near a hanging hand stay with the head / the leg (v5 test frames, 16/10) */
  reach?: number;
  /** for a hand: its outline (hull of wrist, knuckles, thumb and finger tips, slightly enlarged) — exact, not a radius */
  poly?: Pt[];
}
/** Pairs of parts that are jointed (or one piece of clothing): never cut between them. */
export const LIMB_JOINTS: [string, string][] = [
  ['tete', 'torse'],
  ['torse', 'brasG'], ['brasG', 'avantBrasG'], ['avantBrasG', 'mainG'],
  ['torse', 'brasD'], ['brasD', 'avantBrasD'], ['avantBrasD', 'mainD'],
  ['torse', 'cuisseG'], ['cuisseG', 'jambeG'], ['jambeG', 'piedG'],
  ['torse', 'cuisseD'], ['cuisseD', 'jambeD'], ['jambeD', 'piedD'],
  // the two legs inside a dress or wide trousers are one piece of cloth
  ['cuisseG', 'cuisseD'], ['jambeG', 'jambeD'], ['piedG', 'piedD'],
];

const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];

/** Bones of the body from BlazePose points (pixels of the drawing); a part whose points are missing is skipped. */
export function bodyParts(bp: Record<number, Pt | undefined>): Part[] {
  const out: Part[] = [];
  const add = (id: string, a?: Pt, b?: Pt) => { if (a && b) out.push({ id, a, b }); };
  const sh = bp[11] && bp[12] ? mid(bp[11], bp[12]) : undefined;
  const hip = bp[23] && bp[24] ? mid(bp[23], bp[24]) : undefined;
  add('tete', bp[0], sh && bp[0] ? [bp[0][0] + 0.45 * (sh[0] - bp[0][0]), bp[0][1] + 0.45 * (sh[1] - bp[0][1])] : undefined);
  add('torse', sh, hip);
  if (bp[11] && bp[23]) add('torse', bp[11], bp[23]);
  if (bp[12] && bp[24]) add('torse', bp[12], bp[24]);
  // body height from the skeleton (top of the head ≈ 12 % above the nose-to-ankle span) gives the arms' reach
  const ys = Object.values(bp).filter((p): p is Pt => !!p).map((p) => p[1]);
  const Hb = ys.length ? 1.15 * (Math.max(...ys) - Math.min(...ys)) : 0;
  const arm = (id: string, a?: Pt, b?: Pt, k = 0.045) => { if (a && b) out.push({ id, a, b, reach: k * Hb }); };
  for (const [s, side] of [['G', 0], ['D', 1]] as const) {
    const S = bp[11 + side], E = bp[13 + side], W = bp[15 + side], P = bp[17 + side], I = bp[19 + side], H = bp[23 + side], K = bp[25 + side], A = bp[27 + side], T = bp[31 + side];
    arm('bras' + s, S, E, 0.045);
    arm('avantBras' + s, E, W, 0.03);
    // the hand: wrist → beyond the finger tips (index and pinky), or the forearm prolonged when the tips are unknown
    const tip: Pt | undefined = P && I ? mid(P, I) : W && E ? [W[0] + 0.55 * (W[0] - E[0]), W[1] + 0.55 * (W[1] - E[1])] : undefined;
    const Th = bp[21 + side];
    if (W && P && I) {
      // BlazePose gives the knuckles of the pinky and the index: the finger tips lie ≈ 1.8× as far from the wrist
      const kn = mid(P, I), ft: Pt = [W[0] + 1.8 * (kn[0] - W[0]), W[1] + 1.8 * (kn[1] - W[1])];
      const sideV: Pt = [P[0] - I[0], P[1] - I[1]];
      const pts: Pt[] = [W, P, I, ...(Th ? [Th] : []), [ft[0] + 0.5 * sideV[0], ft[1] + 0.5 * sideV[1]], [ft[0] - 0.5 * sideV[0], ft[1] - 0.5 * sideV[1]]];
      const c: Pt = [pts.reduce((a, q) => a + q[0], 0) / pts.length, pts.reduce((a, q) => a + q[1], 0) / pts.length];
      out.push({ id: 'main' + s, a: W, b: ft, poly: hull(pts).map((q) => [c[0] + 1.25 * (q[0] - c[0]), c[1] + 1.25 * (q[1] - c[1])] as Pt) });
    } else arm('main' + s, W, tip && W ? [W[0] + 1.3 * (tip[0] - W[0]), W[1] + 1.3 * (tip[1] - W[1])] : undefined, 0.035);
    add('cuisse' + s, H, K);
    add('jambe' + s, K, A);
    add('pied' + s, A, T);
  }
  return out;
}

/** convex hull (monotone chain) */
function hull(ps: Pt[]): Pt[] {
  const p = [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cr(up[up.length - 2]!, up[up.length - 1]!, q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
const inPoly = (c: Pt, poly: Pt[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (yi > c[1] !== yj > c[1] && c[0] < ((xj - xi) * (c[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const u = L > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy);
};

/** The part each triangle belongs to: inside a hand's outline → that hand; else within an arm bone's reach → the
 *  nearest arm part; else the nearest of the other parts (head, torso, legs) — cloth near a hand stays with the body. */
export function trianglePart(mesh: Mesh2D, parts: Part[]): string[] {
  const out: string[] = [];
  const r = mesh.rest, T = mesh.tris;
  const hands = parts.filter((p) => p.poly), arms = parts.filter((p) => !p.poly && p.reach !== undefined), body = parts.filter((p) => !p.poly && p.reach === undefined);
  for (let t = 0; t < T.length; t += 3) {
    const c: Pt = [(r[T[t]! * 2]! + r[T[t + 1]! * 2]! + r[T[t + 2]! * 2]!) / 3, (r[T[t]! * 2 + 1]! + r[T[t + 1]! * 2 + 1]! + r[T[t + 2]! * 2 + 1]!) / 3];
    const h = hands.find((p) => inPoly(c, p.poly!));
    if (h) { out.push(h.id); continue; }
    let best = '', bd = Infinity;
    for (const p of arms) { const d = segDist(c, p.a, p.b); if (d <= p.reach! && d < bd) { bd = d; best = p.id; } }
    if (!best) for (const p of body) { const d = segDist(c, p.a, p.b); if (d < bd) { bd = d; best = p.id; } }
    out.push(best || 'torse');
  }
  return out;
}

/**
 * Cut the mesh between parts that are not jointed. Returns a new mesh (rest positions of duplicated vertices are the
 * same: the picture at rest is unchanged), the part of every vertex copy, the original vertex of every copy, and the
 * number of vertices duplicated.
 */
export function splitLimbs(mesh: Mesh2D, parts: Part[], joints: [string, string][] = LIMB_JOINTS): { mesh: Mesh2D; vertPart: string[]; origin: Int32Array; dup: number; welded: number } {
  const tp = trianglePart(mesh, parts);
  const ok = new Set(joints.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  const n = mesh.rest.length / 2;
  const inc: number[][] = Array.from({ length: n }, () => []);
  for (let t = 0; t < tp.length; t++) for (let k = 0; k < 3; k++) inc[mesh.tris[t * 3 + k]!]!.push(t);
  const rest: number[] = Array.from(mesh.rest);
  const origin: number[] = Array.from({ length: n }, (_, i) => i);
  const vertPart: string[] = new Array(n).fill('');
  const tris = Uint32Array.from(mesh.tris);
  let dup = 0;
  for (let v = 0; v < n; v++) {
    const ps = [...new Set(inc[v]!.map((t) => tp[t]!))];
    if (!ps.length) continue;
    // group the parts meeting at this vertex by joints (connected components)
    const group = new Map<string, number>();
    let g = 0;
    for (const p of ps) {
      if (group.has(p)) continue;
      const stack = [p];
      group.set(p, g);
      while (stack.length) { const q = stack.pop()!; for (const o of ps) if (!group.has(o) && ok.has(`${q}|${o}`)) { group.set(o, g); stack.push(o); } }
      g++;
    }
    vertPart[v] = ps[0]!;
    if (g === 1) continue;
    // first group keeps the vertex; each other group gets its own copy at the same place
    const copyOf = new Map<number, number>([[group.get(ps[0]!)!, v]]);
    for (let k = 1; k < g; k++) {
      const id = rest.length / 2;
      rest.push(mesh.rest[v * 2]!, mesh.rest[v * 2 + 1]!);
      origin.push(v);
      vertPart.push(ps.find((p) => group.get(p) === k)!);
      copyOf.set(k, id);
      dup++;
    }
    for (const t of inc[v]!) { const nv = copyOf.get(group.get(tp[t]!)!)!; for (let k = 0; k < 3; k++) if (tris[t * 3 + k] === v) tris[t * 3 + k] = nv; }
  }
  // an ISLAND cut off with no joint in it (a bit of trouser whose centroid was nearer to the hand bone) would hold no
  // handle and leave the solver undetermined: it is welded back to its original vertices, unused copies are dropped
  const nv = rest.length / 2, parent = Int32Array.from({ length: nv }, (_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; } return x; };
  for (let t = 0; t < tris.length; t += 3) { const a = find(tris[t]!), b = find(tris[t + 1]!), c = find(tris[t + 2]!); parent[b] = a; parent[find(c)] = find(a); }
  const joint = new Uint8Array(nv), reach = 1.5 * mesh.step;
  for (let i = 0; i < nv; i++) for (const p of parts) for (const q of [p.a, p.b]) if (Math.hypot(rest[i * 2]! - q[0], rest[i * 2 + 1]! - q[1]) <= reach) joint[find(i)] = 1;
  let welded = 0;
  for (let t = 0; t < tris.length; t++) { const v = tris[t]!; if (origin[v] !== v && !joint[find(v)]) { tris[t] = origin[v]!; welded++; } }
  const used = new Uint8Array(nv);
  for (const v of tris) used[v] = 1;
  for (let i = 0; i < n; i++) used[i] = 1; // original vertices keep their index
  const remap = new Int32Array(nv).fill(-1), R2: number[] = [], P2: string[] = [], O2: number[] = [];
  for (let i = 0; i < nv; i++) if (used[i]) { remap[i] = R2.length / 2; R2.push(rest[i * 2]!, rest[i * 2 + 1]!); P2.push(vertPart[i]!); O2.push(origin[i]!); }
  for (let t = 0; t < tris.length; t++) tris[t] = remap[tris[t]!]!;
  return { mesh: { rest: Float64Array.from(R2), tris, step: mesh.step }, vertPart: P2, origin: Int32Array.from(O2), dup: R2.length / 2 - n, welded };
}

/** Nearest vertex among the copies that belong to one of the allowed parts (a wrist handle goes on the arm's copy). */
export function nearestVertexIn(mesh: Mesh2D, vertPart: string[], x: number, y: number, allowed: Set<string>): number {
  let best = -1, bd = Infinity;
  for (let i = 0; i < mesh.rest.length / 2; i++) {
    if (!allowed.has(vertPart[i]!)) continue;
    const d = (mesh.rest[i * 2]! - x) ** 2 + (mesh.rest[i * 2 + 1]! - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Which parts a BlazePose landmark may hold (its own bone and the next one). */
export function partsOfLandmark(k: number): Set<string> {
  const s = k % 2 === 1 ? 'G' : 'D';
  if (k <= 10) return new Set(['tete']);
  if (k === 11 || k === 12) return new Set(['torse', 'bras' + s]);
  if (k === 13 || k === 14) return new Set(['bras' + s, 'avantBras' + s]);
  if (k === 15 || k === 16) return new Set(['avantBras' + s, 'main' + s]);
  if (k >= 17 && k <= 22) return new Set(['main' + s]);
  if (k === 23 || k === 24) return new Set(['torse', 'cuisse' + s]);
  if (k === 25 || k === 26) return new Set(['cuisse' + s, 'jambe' + s]);
  return new Set(['jambe' + s, 'pied' + s]);
}
