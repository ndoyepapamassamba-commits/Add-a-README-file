/**
 * GONFLAGE DU DESSIN — a drawn figure becomes a 3D volume from its own silhouette, the way sketch-based modellers do it
 * (Teddy, Igarashi 1999; Monster Mash, Dvorožňák et al. 2020): a Poisson field Δp = −1 is solved inside the silhouette
 * (p = 0 on the contour), and the thickness is √p — a circular cross-section for round parts, an elliptic one for
 * long parts (limbs, torso). Nothing is invented: the contour IS the owner's drawing, the volume follows it. Pure,
 * deterministic, instant (a few thousand lattice points), no model, no GPU.
 */
import type { Mesh2D } from './arap';

export interface Relief {
  /** Thickness at each vertex (px, ≥ 0; 0 on the contour). */
  z: Float32Array;
  /** Unit normal of the front surface at each vertex, in picture axes (x right, y DOWN, z towards the viewer). */
  nrm: Float32Array;
  /** 1 for contour vertices (thickness 0). */
  boundary: Uint8Array;
}

/** Lattice neighbours of each vertex of a gridMesh (±step on x, ±step on y), −1 when absent. */
export function latticeNeighbours(m: Mesh2D): Int32Array {
  const n = m.rest.length / 2;
  const key = (x: number, y: number) => `${Math.round(x / m.step)},${Math.round(y / m.step)}`;
  const at = new Map<string, number>();
  for (let i = 0; i < n; i++) at.set(key(m.rest[i * 2]!, m.rest[i * 2 + 1]!), i);
  const nb = new Int32Array(n * 4).fill(-1);
  for (let i = 0; i < n; i++) {
    const x = m.rest[i * 2]!;
    const y = m.rest[i * 2 + 1]!;
    nb[i * 4] = at.get(key(x + m.step, y)) ?? -1;
    nb[i * 4 + 1] = at.get(key(x - m.step, y)) ?? -1;
    nb[i * 4 + 2] = at.get(key(x, y + m.step)) ?? -1;
    nb[i * 4 + 3] = at.get(key(x, y - m.step)) ?? -1;
  }
  return nb;
}

/** Contour vertices: the ends of every edge that belongs to a single triangle (the rim of the padded grid). */
export function contourOf(m: Mesh2D): Uint8Array {
  const n = m.rest.length / 2;
  const count = new Map<number, number>();
  const key = (a: number, b: number) => (a < b ? a * n + b : b * n + a);
  for (let t = 0; t < m.tris.length / 3; t++)
    for (let k = 0; k < 3; k++) {
      const e = key(m.tris[t * 3 + k]!, m.tris[t * 3 + ((k + 1) % 3)]!);
      count.set(e, (count.get(e) ?? 0) + 1);
    }
  const b = new Uint8Array(n);
  for (const [e, c] of count)
    if (c === 1) {
      b[Math.floor(e / n)] = 1;
      b[e % n] = 1;
    }
  return b;
}

/**
 * Inflates a gridMesh. `depth` = half-thickness over half-width for a long part (0.8: a torso 0.8× as deep as it is
 * wide at its thickest; limbs and heads come out rounder). Solved by over-relaxation to a 1e-4 residual.
 */
export function inflateMesh(m: Mesh2D, depth = 0.8): Relief {
  const n = m.rest.length / 2;
  const nb = latticeNeighbours(m);
  const boundary = contourOf(m);
  const p = new Float64Array(n);
  // Poisson Δp = −1 on the lattice (spacing 1): p_i = (Σ p_nbr + 1) / 4, contour at 0.
  const omega = 1.85;
  for (let it = 0; it < 4000; it++) {
    let maxD = 0;
    for (let i = 0; i < n; i++) {
      if (boundary[i]) continue;
      let s = 1;
      for (let k = 0; k < 4; k++) {
        const j = nb[i * 4 + k]!;
        if (j >= 0) s += p[j]!;
      }
      const next = p[i]! + omega * (s / 4 - p[i]!);
      const d = Math.abs(next - p[i]!);
      if (d > maxD) maxD = d;
      p[i] = next;
    }
    if (maxD < 1e-4) break;
  }
  // Thickness: for a strip of half-width a, p_max = a²/2 → z = depth·a needs z = depth·√2·√p (in lattice units).
  const c = depth * Math.SQRT2 * m.step;
  const z = new Float32Array(n);
  for (let i = 0; i < n; i++) z[i] = c * Math.sqrt(Math.max(0, p[i]!));
  // Normals of the height field (picture axes): n ∝ (−∂z/∂x, −∂z/∂y, 1).
  const nrm = new Float32Array(n * 3);
  const slope = (i: number, plus: number, minus: number) => {
    const a = nb[i * 4 + plus]!;
    const b = nb[i * 4 + minus]!;
    if (a >= 0 && b >= 0) return (z[a]! - z[b]!) / (2 * m.step);
    if (a >= 0) return (z[a]! - z[i]!) / m.step;
    if (b >= 0) return (z[i]! - z[b]!) / m.step;
    return 0;
  };
  for (let i = 0; i < n; i++) {
    const dx = slope(i, 0, 1);
    const dy = slope(i, 2, 3);
    const l = Math.hypot(dx, dy, 1);
    nrm[i * 3] = -dx / l;
    nrm[i * 3 + 1] = -dy / l;
    nrm[i * 3 + 2] = 1 / l;
  }
  return { z, nrm, boundary };
}

export interface Solid {
  /** Positions (x right, y UP, z towards the viewer), in px of the drawing with the origin at its top-left corner. */
  pos: Float32Array;
  nrm: Float32Array;
  /** Drawing coordinates of each vertex (fractions: u right, v DOWN). */
  uv: Float32Array;
  idx: Uint32Array;
  /** Vertices 0..frontCount−1 are the front surface (and the shared contour); the rest is the back. */
  frontCount: number;
  /** Front-surface index of each back vertex (the vertex it mirrors). */
  mirror: Int32Array;
}

/**
 * The closed volume: the inflated front, its mirror as the back, both sewn on the contour (shared vertices, so the
 * surface is watertight). `w`/`h`: the drawing's size (px).
 */
export function inflatedSolid(m: Mesh2D, r: Relief, w: number, h: number): Solid {
  const n = m.rest.length / 2;
  const backIndex = new Int32Array(n);
  let nb = 0;
  for (let i = 0; i < n; i++) backIndex[i] = r.boundary[i] ? i : n + nb++;
  const total = n + nb;
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const mirror = new Int32Array(nb);
  for (let i = 0; i < n; i++) {
    const x = m.rest[i * 2]!;
    const y = m.rest[i * 2 + 1]!;
    pos[i * 3] = x;
    pos[i * 3 + 1] = h - y;
    pos[i * 3 + 2] = r.z[i]!;
    nrm[i * 3] = r.nrm[i * 3]!;
    nrm[i * 3 + 1] = -r.nrm[i * 3 + 1]!;
    nrm[i * 3 + 2] = r.nrm[i * 3 + 2]!;
    uv[i * 2] = x / w;
    uv[i * 2 + 1] = y / h;
    const b = backIndex[i]!;
    if (b !== i) {
      pos[b * 3] = x;
      pos[b * 3 + 1] = h - y;
      pos[b * 3 + 2] = -r.z[i]!;
      nrm[b * 3] = r.nrm[i * 3]!;
      nrm[b * 3 + 1] = -r.nrm[i * 3 + 1]!;
      nrm[b * 3 + 2] = -r.nrm[i * 3 + 2]!;
      uv[b * 2] = x / w;
      uv[b * 2 + 1] = y / h;
      mirror[b - n] = i;
    }
  }
  // Front triangles keep their winding (counter-clockwise seen from +z once y is flipped: swap two corners), the back
  // ones are mirrored.
  const nt = m.tris.length / 3;
  const idx = new Uint32Array(nt * 6);
  for (let t = 0; t < nt; t++) {
    const a = m.tris[t * 3]!;
    const b = m.tris[t * 3 + 1]!;
    const c = m.tris[t * 3 + 2]!;
    idx[t * 3] = a;
    idx[t * 3 + 1] = c;
    idx[t * 3 + 2] = b;
    idx[nt * 3 + t * 3] = backIndex[a]!;
    idx[nt * 3 + t * 3 + 1] = backIndex[b]!;
    idx[nt * 3 + t * 3 + 2] = backIndex[c]!;
  }
  return { pos, nrm, uv, idx, frontCount: n, mirror };
}
