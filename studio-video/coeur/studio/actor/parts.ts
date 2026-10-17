/**
 * CALQUES DU DESSIN — a drawn limb in front of the body is its own layer (Monster Mash): the body's volume continues
 * BEHIND the limb (its contour interpolated from the rows above and below the limb), the limb's volume sits in front,
 * so lifting the arm reveals the dress instead of tearing it. Where the body is hidden by the limb, its skin is
 * borrowed from the nearest visible body pixels of the same row (mirrored about the body's axis when that side shows
 * the body, else the nearest one) — the pattern of the dress, never an invented patch. Pure, on the drawing lattice.
 */
import type { Mesh2D } from './arap';
import type { Bone2D, SkinWeights } from './boneHeat';

export type PartName = 'body' | 'l_arm' | 'r_arm';

export interface PartLayers {
  /** Part of each lattice vertex of the ORIGINAL mesh: 0 body (incl. head and legs), 1 left arm, 2 right arm. */
  part: Uint8Array;
  /** Lattice cells (gx, gy → index) of the body EXTENDED under the arms (1 = body cell, hidden ones included). */
  body: Uint8Array;
  /** 1 on body cells hidden by an arm. */
  hidden: Uint8Array;
  /** For a hidden body cell, the visible body cell its skin is borrowed from (index into the lattice), else −1. */
  borrow: Int32Array;
  /** Lattice size. */
  gw: number;
  gh: number;
  /** Cells of each arm (1 = arm cell). */
  arms: [Uint8Array, Uint8Array];
}

const ARM_RE = /^(Left|Right)(Shoulder|Arm|ForeArm|Hand)$/;

/** The part a bone belongs to (clavicles count as the body: the shoulder stays with the torso). */
export function partOfBone(b: Bone2D): PartName {
  const m = ARM_RE.exec(b.name);
  if (!m || m[2] === 'Shoulder') return 'body';
  return m[1] === 'Left' ? 'l_arm' : 'r_arm';
}

/**
 * Splits the figure into layers from its bone-heat weights: a vertex is an arm's when its dominant bone is an arm bone
 * (upper arm, forearm, hand). The body is extended under each arm row by row: on a row where an arm hides part of the
 * body, the body's extent is interpolated between the nearest rows above and below where that side is unoccluded.
 */
export function partLayers(m: Mesh2D, bones: Bone2D[], w: SkinWeights): PartLayers {
  const n = m.rest.length / 2;
  const gw = Math.ceil(Math.max(...Array.from({ length: n }, (_, i) => m.rest[i * 2]!)) / m.step) + 1;
  const gh = Math.ceil(Math.max(...Array.from({ length: n }, (_, i) => m.rest[i * 2 + 1]!)) / m.step) + 1;
  const partOf = bones.map(partOfBone);
  const part = new Uint8Array(n);
  const cell = (i: number) => Math.round(m.rest[i * 2 + 1]! / m.step) * gw + Math.round(m.rest[i * 2]! / m.step);
  const occupied = new Uint8Array(gw * gh);
  const armCell: [Uint8Array, Uint8Array] = [new Uint8Array(gw * gh), new Uint8Array(gw * gh)];
  const bodyCell = new Uint8Array(gw * gh);
  for (let i = 0; i < n; i++) {
    const p = partOf[w.idx[i * 4]!]!;
    part[i] = p === 'body' ? 0 : p === 'l_arm' ? 1 : 2;
    const c = cell(i);
    occupied[c] = 1;
    if (part[i] === 0) bodyCell[c] = 1;
    else armCell[part[i]! - 1]![c] = 1;
  }
  // Body extent per row (leftmost / rightmost body cell), and whether an arm touches that side on the row.
  const left = new Int32Array(gh).fill(-1);
  const right = new Int32Array(gh).fill(-1);
  const armLeft = new Uint8Array(gh);
  const armRight = new Uint8Array(gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++)
      if (bodyCell[y * gw + x]) {
        if (left[y]! < 0) left[y] = x;
        right[y] = x;
      }
    if (left[y]! < 0) continue;
    // An arm hides the body on a side when arm cells sit right beside the body's edge on that row.
    for (let x = 0; x < gw; x++) {
      const a = armCell[0]![y * gw + x] || armCell[1]![y * gw + x];
      if (!a) continue;
      if (x < left[y]! && left[y]! - x <= 2) armLeft[y] = 1;
      if (x > right[y]! && x - right[y]! <= 2) armRight[y] = 1;
      // An arm crossing the body (inside its extent) hides it too.
      if (x > left[y]! && x < right[y]!) {
        armLeft[y] = 1;
        armRight[y] = 1;
      }
    }
  }
  // Interpolate the hidden edges from the nearest unoccluded rows.
  const fixEdge = (edge: Int32Array, occl: Uint8Array) => {
    const out = new Int32Array(edge);
    for (let y = 0; y < gh; y++) {
      if (edge[y]! < 0 || !occl[y]) continue;
      let a = y - 1;
      while (a >= 0 && (edge[a]! < 0 || occl[a])) a--;
      let b = y + 1;
      while (b < gh && (edge[b]! < 0 || occl[b])) b++;
      const ea = a >= 0 ? edge[a]! : -1;
      const eb = b < gh ? edge[b]! : -1;
      if (ea >= 0 && eb >= 0) out[y] = Math.round(ea + ((eb - ea) * (y - a)) / (b - a));
      else if (ea >= 0) out[y] = ea;
      else if (eb >= 0) out[y] = eb;
    }
    return out;
  };
  const L = fixEdge(left, armLeft);
  const R = fixEdge(right, armRight);
  const body = new Uint8Array(gw * gh);
  const hidden = new Uint8Array(gw * gh);
  const borrow = new Int32Array(gw * gh).fill(-1);
  for (let y = 0; y < gh; y++) {
    if (L[y]! < 0) continue;
    // The body spans its (restored) extent, but only where the figure is drawn or an arm hides it.
    for (let x = L[y]!; x <= R[y]!; x++) {
      const c = y * gw + x;
      if (bodyCell[c]) {
        body[c] = 1;
        continue;
      }
      if (!armCell[0]![c] && !armCell[1]![c]) continue;
      body[c] = 1;
      hidden[c] = 1;
      // Borrow the skin: the mirror cell about the body's axis when it is visible body, else the nearest visible body
      // cell on the row.
      const axis = (L[y]! + R[y]!) / 2;
      const mx = Math.round(2 * axis - x);
      if (mx >= 0 && mx < gw && bodyCell[y * gw + mx]) {
        borrow[c] = y * gw + mx;
        continue;
      }
      let best = -1;
      let bd = Infinity;
      for (let xx = L[y]!; xx <= R[y]!; xx++)
        if (bodyCell[y * gw + xx] && Math.abs(xx - x) < bd) {
          bd = Math.abs(xx - x);
          best = y * gw + xx;
        }
      borrow[c] = best;
    }
  }
  return { part, body, hidden, borrow, gw, gh, arms: armCell };
}

export interface PartMesh extends Mesh2D {
  /** Original vertex index of each vertex of the part mesh. */
  orig: Int32Array;
  /** For each vertex: the ORIGINAL vertex whose skin and weights it borrows (itself unless it is hidden body). */
  from: Int32Array;
  /** 1 on hidden body vertices (under an arm): their skin is borrowed, their volume sits behind the arm. */
  hidden: Uint8Array;
}

/**
 * Splits the lattice mesh into part meshes: the body (its own vertices + the hidden ones under the arms, borrowing
 * their skin from `borrow`) and each arm. A triangle belongs to a part when its three vertices do.
 */
export function splitParts(m: Mesh2D, L: PartLayers): { body: PartMesh; arms: [PartMesh | null, PartMesh | null] } {
  const n = m.rest.length / 2;
  const cellOf = (i: number) => Math.round(m.rest[i * 2 + 1]! / m.step) * L.gw + Math.round(m.rest[i * 2]! / m.step);
  const atCell = new Int32Array(L.gw * L.gh).fill(-1);
  for (let i = 0; i < n; i++) atCell[cellOf(i)] = i;
  const build = (member: (i: number) => boolean, borrowOf: (i: number) => number): PartMesh | null => {
    const map = new Int32Array(n).fill(-1);
    const orig: number[] = [];
    for (let i = 0; i < n; i++)
      if (member(i)) {
        map[i] = orig.length;
        orig.push(i);
      }
    if (orig.length < 3) return null;
    const tris: number[] = [];
    for (let t = 0; t < m.tris.length / 3; t++) {
      const a = map[m.tris[t * 3]!]!;
      const b = map[m.tris[t * 3 + 1]!]!;
      const c = map[m.tris[t * 3 + 2]!]!;
      if (a >= 0 && b >= 0 && c >= 0) tris.push(a, b, c);
    }
    if (!tris.length) return null;
    const rest = new Float64Array(orig.length * 2);
    const from = new Int32Array(orig.length);
    const hidden = new Uint8Array(orig.length);
    orig.forEach((i, k) => {
      rest[k * 2] = m.rest[i * 2]!;
      rest[k * 2 + 1] = m.rest[i * 2 + 1]!;
      const b = borrowOf(i);
      from[k] = b >= 0 ? b : i;
      hidden[k] = b >= 0 && b !== i ? 1 : 0;
    });
    return { rest, tris: Uint32Array.from(tris), step: m.step, orig: Int32Array.from(orig), from, hidden };
  };
  const body = build(
    (i) => L.part[i] === 0 || L.hidden[cellOf(i)] === 1,
    (i) => {
      const c = cellOf(i);
      if (L.part[i] === 0 || !L.hidden[c]) return i;
      const src = L.borrow[c]!;
      return src >= 0 && atCell[src]! >= 0 ? atCell[src]! : i;
    },
  )!;
  const arm = (k: 1 | 2) => build((i) => L.part[i] === k, (i) => i);
  return { body, arms: [arm(1), arm(2)] };
}
