/**
 * MARIONNETTE SOUPLE — the owner's drawing itself bends like a puppet: a triangle mesh laid over the cut-out, a few
 * handles on its skeleton (shoulders, elbows, wrists, hips, feet), and an AS-RIGID-AS-POSSIBLE deformation (Sorkine &
 * Alexa 2007, local/global) — when a wrist moves, the forearm and the arm follow without stretching, the rest of the
 * body stays drawn as it is. Pure: no DOM. Solved per frame in about a millisecond (dense Cholesky, prefactored once per
 * pose, a few hundred vertices).
 */

export interface Mesh2D {
  /** Rest positions (x, y pairs, pixels of the pose). */
  rest: Float64Array;
  /** Triangles (vertex indices, 3 per triangle). */
  tris: Uint32Array;
  /** Grid size of the mesh (pixels). */
  step: number;
}

/**
 * A grid mesh over the figure: the vertices of every grid cell that touches the figure (alpha ≥ 0.5), dilated by
 * `pad` cells so the mouth / head warps of the face never run out of the mesh.
 */
export function gridMesh(inside: (x: number, y: number) => boolean, w: number, h: number, step: number, pad = 2): Mesh2D {
  const gw = Math.ceil(w / step);
  const gh = Math.ceil(h / step);
  const cell = new Uint8Array(gw * gh);
  for (let cy = 0; cy < gh; cy++)
    for (let cx = 0; cx < gw; cx++) {
      let hit = false;
      for (let y = cy * step; y < Math.min(h, (cy + 1) * step) && !hit; y += Math.max(1, step >> 2))
        for (let x = cx * step; x < Math.min(w, (cx + 1) * step) && !hit; x += Math.max(1, step >> 2)) hit = inside(x, y);
      cell[cy * gw + cx] = hit ? 1 : 0;
    }
  // Dilation (pad cells).
  let cur = cell;
  for (let k = 0; k < pad; k++) {
    const nx = new Uint8Array(cur);
    for (let cy = 0; cy < gh; cy++)
      for (let cx = 0; cx < gw; cx++) {
        if (cur[cy * gw + cx]) continue;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && y >= 0 && x < gw && y < gh && cur[y * gw + x]) {
            nx[cy * gw + cx] = 1;
            break;
          }
        }
      }
    cur = nx;
  }
  const id = new Int32Array((gw + 1) * (gh + 1)).fill(-1);
  const rest: number[] = [];
  const tris: number[] = [];
  const v = (gx: number, gy: number) => {
    const k = gy * (gw + 1) + gx;
    if (id[k]! < 0) {
      id[k] = rest.length / 2;
      rest.push(Math.min(w, gx * step), Math.min(h, gy * step));
    }
    return id[k]!;
  };
  for (let cy = 0; cy < gh; cy++)
    for (let cx = 0; cx < gw; cx++) {
      if (!cur[cy * gw + cx]) continue;
      const a = v(cx, cy);
      const b = v(cx + 1, cy);
      const c = v(cx + 1, cy + 1);
      const d = v(cx, cy + 1);
      tris.push(a, b, c, a, c, d);
    }
  return { rest: Float64Array.from(rest), tris: Uint32Array.from(tris), step };
}

/** Index of the mesh vertex nearest to a point. */
export function nearestVertex(m: Mesh2D, x: number, y: number): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < m.rest.length / 2; i++) {
    const d = (m.rest[i * 2]! - x) ** 2 + (m.rest[i * 2 + 1]! - y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * ARAP solver of one mesh with FIXED handle vertices (their positions given per frame). Uniform edge weights on the
 * grid (all edges of a regular grid are alike); the constrained Laplacian is factored once (dense Cholesky).
 */
export class ArapSolver {
  readonly n: number;
  private nbr: number[][];
  private free: number[];
  private freeIdx: Int32Array;
  private handles: number[];
  private Lc: Float64Array; // Cholesky factor of L_ff (lower, row-major, nf × nf)
  private nf: number;
  /** Current solution (warm start of the next frame). */
  readonly cur: Float64Array;
  private rot: Float64Array;
  constructor(
    readonly mesh: Mesh2D,
    handles: number[],
  ) {
    const n = mesh.rest.length / 2;
    this.n = n;
    const sets: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
    for (let t = 0; t < mesh.tris.length; t += 3) {
      const [a, b, c] = [mesh.tris[t]!, mesh.tris[t + 1]!, mesh.tris[t + 2]!];
      sets[a]!.add(b).add(c);
      sets[b]!.add(a).add(c);
      sets[c]!.add(a).add(b);
    }
    this.nbr = sets.map((s) => [...s]);
    this.handles = [...new Set(handles.filter((h) => h >= 0 && h < n))];
    const isH = new Uint8Array(n);
    for (const h of this.handles) isH[h] = 1;
    this.free = [];
    this.freeIdx = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++)
      if (!isH[i]) {
        this.freeIdx[i] = this.free.length;
        this.free.push(i);
      }
    const nf = this.free.length;
    this.nf = nf;
    // L_ff (graph Laplacian on the free vertices) then its Cholesky factor.
    const A = new Float64Array(nf * nf);
    for (const i of this.free) {
      const r = this.freeIdx[i]!;
      A[r * nf + r] = this.nbr[i]!.length;
      for (const j of this.nbr[i]!) {
        const c = this.freeIdx[j]!;
        if (c >= 0) A[r * nf + c] = A[r * nf + c]! - 1;
      }
    }
    for (let j = 0; j < nf; j++) {
      let s = A[j * nf + j]!;
      for (let k = 0; k < j; k++) s -= A[j * nf + k]! ** 2;
      const d = Math.sqrt(Math.max(s, 1e-12));
      A[j * nf + j] = d;
      for (let i = j + 1; i < nf; i++) {
        let t = A[i * nf + j]!;
        for (let k = 0; k < j; k++) t -= A[i * nf + k]! * A[j * nf + k]!;
        A[i * nf + j] = t / d;
      }
    }
    this.Lc = A;
    this.cur = Float64Array.from(mesh.rest);
    this.rot = new Float64Array(n * 2);
  }
  /** The handle vertices, in the order positions are given to solve(). */
  get handleIds(): readonly number[] {
    return this.handles;
  }
  private chol(b: Float64Array): Float64Array {
    const nf = this.nf;
    const L = this.Lc;
    const y = new Float64Array(nf);
    for (let i = 0; i < nf; i++) {
      let s = b[i]!;
      for (let k = 0; k < i; k++) s -= L[i * nf + k]! * y[k]!;
      y[i] = s / L[i * nf + i]!;
    }
    for (let i = nf - 1; i >= 0; i--) {
      let s = y[i]!;
      for (let k = i + 1; k < nf; k++) s -= L[k * nf + i]! * y[k]!;
      y[i] = s / L[i * nf + i]!;
    }
    return y;
  }
  /**
   * Deforms the mesh: `pos` = the handles' positions (x, y pairs, in handleIds order). `iters` local/global steps
   * (warm-started from the previous frame, 2 are enough while moving smoothly).
   */
  solve(pos: ArrayLike<number>, iters = 2): Float64Array {
    const { rest } = this.mesh;
    const p = this.cur;
    this.handles.forEach((h, k) => {
      p[h * 2] = pos[k * 2]!;
      p[h * 2 + 1] = pos[k * 2 + 1]!;
    });
    for (let it = 0; it < iters; it++) {
      // Local: the best rotation of each vertex's neighbourhood.
      for (let i = 0; i < this.n; i++) {
        let s00 = 0;
        let s01 = 0;
        let s10 = 0;
        let s11 = 0;
        for (const j of this.nbr[i]!) {
          const ex = rest[i * 2]! - rest[j * 2]!;
          const ey = rest[i * 2 + 1]! - rest[j * 2 + 1]!;
          const fx = p[i * 2]! - p[j * 2]!;
          const fy = p[i * 2 + 1]! - p[j * 2 + 1]!;
          s00 += ex * fx;
          s01 += ex * fy;
          s10 += ey * fx;
          s11 += ey * fy;
        }
        const a = Math.atan2(s01 - s10, s00 + s11);
        this.rot[i * 2] = Math.cos(a);
        this.rot[i * 2 + 1] = Math.sin(a);
      }
      // Global: L p = Σ ½ (Ri + Rj)(rest_i − rest_j), handles fixed.
      const bx = new Float64Array(this.nf);
      const by = new Float64Array(this.nf);
      for (const i of this.free) {
        const r = this.freeIdx[i]!;
        let sx = 0;
        let sy = 0;
        for (const j of this.nbr[i]!) {
          const ex = rest[i * 2]! - rest[j * 2]!;
          const ey = rest[i * 2 + 1]! - rest[j * 2 + 1]!;
          const c = (this.rot[i * 2]! + this.rot[j * 2]!) / 2;
          const s = (this.rot[i * 2 + 1]! + this.rot[j * 2 + 1]!) / 2;
          sx += c * ex - s * ey;
          sy += s * ex + c * ey;
          if (this.freeIdx[j]! < 0) {
            sx += p[j * 2]!;
            sy += p[j * 2 + 1]!;
          }
        }
        bx[r] = sx;
        by[r] = sy;
      }
      const X = this.chol(bx);
      const Y = this.chol(by);
      for (const i of this.free) {
        const r = this.freeIdx[i]!;
        p[i * 2] = X[r]!;
        p[i * 2 + 1] = Y[r]!;
      }
    }
    return p;
  }
}
