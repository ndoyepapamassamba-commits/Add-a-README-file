/**
 * RIG AUTOMATIQUE DU DESSIN — the skeleton measured on the drawing (BlazePose) becomes a bone hierarchy inside its
 * inflated volume, and every vertex gets its skin weights by BONE HEAT (Baran & Popović 2007, « Pinocchio » — the
 * method behind Blender's « automatic weights »): each bone heats the vertices that see it, the heat diffuses over the
 * surface, and the equilibrium is the weight. Computed on the drawing's own lattice, so an arm along the body stays
 * the arm's (heat does not cross the gap between them). Pure, a fraction of a second.
 */
import type { Mesh2D } from './arap';
import { BP, type SheetBody } from './puppetMotion';
import { latticeNeighbours } from './inflate';

export interface Bone2D {
  /** Mixamo-style name (recognised by rig3d like any imported model's). */
  name: string;
  parent: number;
  /** Head and tail of the bone in the drawing (px, y down). */
  a: [number, number];
  b: [number, number];
  /** Radius of the bone (px): the trunk and the head are capsules as wide as the body, so their own flanks are theirs
   *  and not the hanging arm's (a plain segment loses the sides of the torso to the nearer arm bone). */
  r?: number;
}

type P = [number, number];
const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * The bones of a drawn figure from its measured skeleton (hips, spine ×3, neck, head, clavicles, arms, forearms,
 * hands, thighs, shins, feet). Needs both shoulders and both hips; a limb whose landmarks are missing is left out.
 */
export function bonesFromBody(body: SheetBody, w: number, h: number): Bone2D[] | null {
  const px = (k: number): P | null => (body[k] ? [body[k]![0] * w, body[k]![1] * h] : null);
  const lSh = px(BP.lSh);
  const rSh = px(BP.rSh);
  const lHip = px(BP.lHip);
  const rHip = px(BP.rHip);
  if (!lSh || !rSh || !lHip || !rHip) return null;
  const hips = mid(lHip, rHip);
  const chest = mid(lSh, rSh);
  const nose = px(BP.nose);
  const lEye = px(BP.lEye);
  const rEye = px(BP.rEye);
  const eyes = lEye && rEye ? mid(lEye, rEye) : nose;
  // The head: from the top of the neck to above the eyes (the crown), along the neck's direction.
  const up: P = eyes ? [eyes[0] - chest[0], eyes[1] - chest[1]] : [0, -(chest[1] - hips[1]) * 0.45];
  const neckTop: P = [chest[0] + up[0] * 0.38, chest[1] + up[1] * 0.38];
  const crown: P = [chest[0] + up[0] * 1.55, chest[1] + up[1] * 1.55];
  // Widths of the trunk: the landmarks sit inside the drawn body (shoulder joints, hip joints), the body is wider.
  const sw = Math.hypot(lSh[0] - rSh[0], lSh[1] - rSh[1]) / 2;
  const hw = Math.hypot(lHip[0] - rHip[0], lHip[1] - rHip[1]) / 2;
  const headR = lEye && rEye ? Math.hypot(lEye[0] - rEye[0], lEye[1] - rEye[1]) * 1.4 : sw * 0.6;
  const bones: Bone2D[] = [
    { name: 'Hips', parent: -1, a: hips, b: lerp(hips, chest, 0.2), r: hw * 1.35 },
    { name: 'Spine', parent: 0, a: lerp(hips, chest, 0.2), b: lerp(hips, chest, 0.5), r: Math.max(hw * 1.3, sw * 0.85) },
    { name: 'Spine1', parent: 1, a: lerp(hips, chest, 0.5), b: lerp(hips, chest, 0.8), r: sw * 0.95 },
    { name: 'Spine2', parent: 2, a: lerp(hips, chest, 0.8), b: chest, r: sw },
    { name: 'Neck', parent: 3, a: chest, b: neckTop, r: sw * 0.35 },
    { name: 'Head', parent: 4, a: neckTop, b: crown, r: headR },
  ];
  const limb = (side: 'Left' | 'Right', sh: P, el: P | null, wr: P | null) => {
    const clav = bones.push({ name: `${side}Shoulder`, parent: 3, a: chest, b: sh }) - 1;
    if (!el) return;
    const arm = bones.push({ name: `${side}Arm`, parent: clav, a: sh, b: el }) - 1;
    if (!wr) return;
    const fore = bones.push({ name: `${side}ForeArm`, parent: arm, a: el, b: wr }) - 1;
    bones.push({ name: `${side}Hand`, parent: fore, a: wr, b: [wr[0] + (wr[0] - el[0]) * 0.35, wr[1] + (wr[1] - el[1]) * 0.35] });
  };
  limb('Left', lSh, px(BP.lEl), px(BP.lWr));
  limb('Right', rSh, px(BP.rEl), px(BP.rWr));
  const leg = (side: 'Left' | 'Right', hip: P, kn: P | null, an: P | null, toe: P | null) => {
    if (!kn) return;
    const up = bones.push({ name: `${side}UpLeg`, parent: 0, a: hip, b: kn }) - 1;
    if (!an) return;
    const low = bones.push({ name: `${side}Leg`, parent: up, a: kn, b: an }) - 1;
    bones.push({ name: `${side}Foot`, parent: low, a: an, b: toe ?? [an[0], an[1] + h * 0.04] });
  };
  leg('Left', lHip, px(BP.lKn), px(BP.lAn), px(BP.lToe));
  leg('Right', rHip, px(BP.rKn), px(BP.rAn), px(BP.rToe));
  return bones;
}

export interface SkinWeights {
  /** 4 bone indices per vertex (into the bones array). */
  idx: Uint16Array;
  /** 4 weights per vertex, summing to 1. */
  w: Float32Array;
}

/** Distance from p to segment ab and the nearest point. */
function toSegment(p: P, a: P, b: P): { d: number; q: P } {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  const t = l2 > 1e-9 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2)) : 0;
  const q: P = [a[0] + vx * t, a[1] + vy * t];
  return { d: Math.hypot(p[0] - q[0], p[1] - q[1]), q };
}

/**
 * Bone-heat skin weights on the mesh. `inside` tells whether a drawing point is in the figure: a bone is visible from
 * a vertex when the straight line to its nearest point stays inside (so the heat of an arm does not reach the hip it
 * passes in front of). For every bone i: (−Δ + H) wᵢ = H pᵢ, with H = c/d² on vertices whose nearest visible bone is
 * at distance d, pᵢ = 1 on vertices whose nearest visible bone is i. The 4 strongest weights per vertex are kept.
 */
export function heatWeights(m: Mesh2D, bones: Bone2D[], inside: (x: number, y: number) => boolean, iters = 400): SkinWeights {
  const n = m.rest.length / 2;
  const nb = latticeNeighbours(m);
  const B = bones.length;
  const nearest = new Int32Array(n).fill(-1);
  const H = new Float64Array(n);
  const unit = m.step; // heat scale: a vertex one cell from its bone is fully its own
  for (let i = 0; i < n; i++) {
    const p: P = [m.rest[i * 2]!, m.rest[i * 2 + 1]!];
    let best = -1;
    let bd = Infinity;
    let anyD = Infinity;
    let any = -1;
    for (let k = 0; k < B; k++) {
      const seg = toSegment(p, bones[k]!.a, bones[k]!.b);
      const q = seg.q;
      const d = Math.max(0, seg.d - (bones[k]!.r ?? 0));
      if (d < anyD) {
        anyD = d;
        any = k;
      }
      if (d >= bd) continue;
      // Visibility: the segment p→q sampled, every sample inside the figure.
      let seen = true;
      const steps = Math.max(1, Math.ceil(seg.d / (unit * 0.75)));
      for (let s = 1; s < steps && seen; s++) {
        const t = s / steps;
        seen = inside(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t);
      }
      if (seen) {
        best = k;
        bd = d;
      }
    }
    if (best < 0) {
      best = any;
      bd = anyD;
    }
    nearest[i] = best;
    H[i] = 1 / Math.max(0.25, (bd / unit) * (bd / unit));
  }
  // Gauss-Seidel on every bone's field at once.
  const w = new Float64Array(n * B);
  for (let i = 0; i < n; i++) w[i * B + nearest[i]!] = 1;
  for (let it = 0; it < iters; it++) {
    let maxD = 0;
    for (let i = 0; i < n; i++) {
      let deg = 0;
      for (let k = 0; k < 4; k++) if (nb[i * 4 + k]! >= 0) deg++;
      const den = deg + H[i]!;
      for (let b = 0; b < B; b++) {
        let s = 0;
        for (let k = 0; k < 4; k++) {
          const j = nb[i * 4 + k]!;
          if (j >= 0) s += w[j * B + b]!;
        }
        const next = (s + (nearest[i] === b ? H[i]! : 0)) / den;
        const d = Math.abs(next - w[i * B + b]!);
        if (d > maxD) maxD = d;
        w[i * B + b] = next;
      }
    }
    if (maxD < 1e-4) break;
  }
  const idx = new Uint16Array(n * 4);
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const order = Array.from({ length: B }, (_, b) => b).sort((x, y) => w[i * B + y]! - w[i * B + x]!);
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const b = order[k];
      if (b === undefined) break;
      idx[i * 4 + k] = b;
      out[i * 4 + k] = w[i * B + b]!;
      sum += w[i * B + b]!;
    }
    for (let k = 0; k < 4; k++) out[i * 4 + k] = sum > 0 ? out[i * 4 + k]! / sum : k === 0 ? 1 : 0;
  }
  return { idx, w: out };
}
