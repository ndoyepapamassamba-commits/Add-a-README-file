/**
 * CORPS ENTIER — the drawn character itself walks, jumps, dances, falls, slaps, points… (0 $, in the browser).
 * The method of Meta's « Animated Drawings » (open source, MIT), rebuilt for our scene images:
 *  - SKELETON: 2D joints read on the picture (shoulders, elbows, wrists, hips, knees, ankles, eyes, mouth) by a pose
 *    model running in the browser (bodyDetect.ts) — no paid call;
 *  - SKIN: a triangle mesh over the character's cut-out, each vertex bound to its nearest bones (soft blend at the
 *    joints, hard split where an arm lies along the body or a hand along a thigh: no rubber smear);
 *  - MOTION: clips written as bone angles (walk, run, jump, dance, fall, slap, clap, cry…) applied as ROTATIONS of the
 *    drawing's own limbs, plus root moves (travel, jump, fall, turn around), eased through damped springs.
 * Pure: geometry, weights, transforms and clips. Tested in Node; the browser only draws the triangles.
 *
 * Space: « U » = image height units (X = x · aspect, Y = y), so rotations keep the picture's proportions.
 */
import { EMOTION_BODY, emotionOf } from './emotionLayer';
import { gestureEnvelope } from './viralFormat';

export type V2 = { x: number; y: number };
export const JOINTS = [
  'nose',
  'lEye',
  'rEye',
  'lEar',
  'rEar',
  'mouthL',
  'mouthR',
  'lSh',
  'rSh',
  'lEl',
  'rEl',
  'lWr',
  'rWr',
  'lHand',
  'rHand',
  'lHip',
  'rHip',
  'lKn',
  'rKn',
  'lAn',
  'rAn',
  'lFoot',
  'rFoot',
] as const;
export type JointName = (typeof JOINTS)[number];
/** Joints of one character, in image fractions (0..1). `l` / `r` = the character's own left / right. */
export interface BodyRig {
  joints: Partial<Record<JointName, V2>>;
  /** Mean landmark visibility (0..1). */
  score: number;
  by: string;
}
/** MediaPipe Pose (BlazePose, 33 landmarks) indices of our joints. */
export const MP_INDEX: Record<JointName, number> = {
  nose: 0,
  lEye: 2,
  rEye: 5,
  lEar: 7,
  rEar: 8,
  mouthL: 9,
  mouthR: 10,
  lSh: 11,
  rSh: 12,
  lEl: 13,
  rEl: 14,
  lWr: 15,
  rWr: 16,
  lHand: 19,
  rHand: 20,
  lHip: 23,
  rHip: 24,
  lKn: 25,
  rKn: 26,
  lAn: 27,
  rAn: 28,
  lFoot: 31,
  rFoot: 32,
};
export interface Landmark {
  x: number;
  y: number;
  visibility?: number;
}
const mid = (a: V2, b: V2): V2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: V2, b: V2, k = 1): V2 => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const len = (v: V2) => Math.hypot(v.x, v.y);
const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Landmarks of ONE person found in a crop of the picture → a body rig in image fractions, or null when the reading is
 * not a plausible standing / sitting body (shoulders above hips, legs below the hips, a real torso). Nothing is guessed:
 * a body that does not pass stays on the head-and-arms engine.
 */
export function bodyFromLandmarks(
  lm: Landmark[],
  crop: { x: number; y: number; w: number; h: number },
  by = 'mediapipe-pose',
): BodyRig | null {
  if (lm.length < 33) return null;
  const joints: Partial<Record<JointName, V2>> = {};
  let vis = 0;
  for (const j of JOINTS) {
    const p = lm[MP_INDEX[j]]!;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    joints[j] = { x: crop.x + p.x * crop.w, y: crop.y + p.y * crop.h };
    vis += p.visibility ?? 1;
  }
  const v = (j: JointName) => lm[MP_INDEX[j]]!.visibility ?? 1;
  if (Math.min(v('lSh'), v('rSh'), v('lHip'), v('rHip')) < 0.4) return null;
  const J = joints as Record<JointName, V2>;
  const neck = mid(J.lSh, J.rSh);
  const pelvis = mid(J.lHip, J.rHip);
  const torso = pelvis.y - neck.y;
  if (torso < crop.h * 0.08) return null;
  // Legs below the hips, knees above the ankles (a lying / upside-down reading is refused).
  for (const s of ['l', 'r'] as const) {
    const hip = J[`${s}Hip`];
    const kn = J[`${s}Kn`];
    const an = J[`${s}An`];
    if (kn.y < hip.y - torso * 0.1 || an.y < kn.y - torso * 0.15) return null;
  }
  return { joints, score: Math.round((vis / JOINTS.length) * 100) / 100, by };
}

/** The face and boxes the head engine needs (eyes, mouth, head, body, arms), read from the body joints. */
export function characterFromBody(b: BodyRig, name: string, aspect: number) {
  const J = b.joints as Record<JointName, V2>;
  const eyes = [J.lEye, J.rEye].sort((p, q) => p.x - q.x);
  // Distances measured in pixels-like units (x scaled by the aspect), returned in fractions.
  const dx = (p: V2, q: V2) => Math.hypot((p.x - q.x) * aspect, p.y - q.y);
  const eyeD = Math.max(1e-4, dx(J.lEye, J.rEye));
  const earD = dx(J.lEar, J.rEar);
  const neck = mid(J.lSh, J.rSh);
  const eyeC = mid(J.lEye, J.rEye);
  const headW = Math.max(eyeD * 2.3, earD * 1.15);
  const headH = Math.max(headW * 1.15, (neck.y - eyeC.y) * 1.6);
  const head = { x: eyeC.x - headW / 2 / aspect, y: eyeC.y - headH * 0.5, w: headW / aspect, h: headH };
  const mw = Math.max(eyeD * 0.55, dx(J.mouthL, J.mouthR) * 1.05);
  const mc = mid(J.mouthL, J.mouthR);
  const mouth = { x: mc.x - mw / 2 / aspect, y: mc.y - mw * 0.22, w: mw / aspect, h: mw * 0.44 };
  const xs = Object.values(J).map((p) => p.x);
  const ys = Object.values(J).map((p) => p.y);
  const x0 = Math.min(...xs, head.x) - head.w * 0.25;
  const x1 = Math.max(...xs, head.x + head.w) + head.w * 0.25;
  const y0 = Math.min(head.y, ...ys);
  const y1 = Math.max(...ys) + head.h * 0.15;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const box = { x: clamp(x0), y: clamp(y0), w: clamp(x1) - clamp(x0), h: clamp(y1) - clamp(y0) };
  return {
    name,
    box,
    head,
    body: { x: box.x, y: head.y + head.h, w: box.w, h: Math.max(0.02, box.y + box.h - head.y - head.h) },
    eyes: eyes.map((e) => ({ x: e.x, y: e.y, r: Math.max(0.004, (eyeD * 0.17) / aspect) })),
    mouth,
    arms: [
      { shoulder: J.lSh, hand: J.lHand },
      { shoulder: J.rSh, hand: J.rHand },
    ],
    body2d: b,
  };
}

// ── the model: bones in U space ─────────────────────────────────────────────────────────────────────────────────────
export const BONE_IDS = [
  'torso',
  'head',
  'lUp',
  'lLo',
  'rUp',
  'rLo',
  'lTh',
  'lShin',
  'rTh',
  'rShin',
] as const;
export type BoneId = (typeof BONE_IDS)[number];
export interface BoneModel {
  id: BoneId;
  parent: BoneId | null;
  /** Rotation pivot (rest), polyline used for the skin distance, capsule radius, draw layer. */
  pivot: V2;
  path: V2[];
  r: number;
  layer: number;
}
export interface BodyModel {
  aspect: number;
  /** Rest joints in U (with neck, pelvis, head top, feet centre). */
  P: Record<string, V2>;
  bones: BoneModel[];
  /** Head top → feet (U). */
  height: number;
  /** Outward sign of each side (+1: the limb is on the +X side of the body). */
  out: { l: number; r: number };
  /** Long dress / robe (boubou, wax dress): the fabric between the legs follows the body down to this hem (U), only
   *  the legs below it move; null = trousers / bare legs. */
  hem: number | null;
}
/** Rest joints → bones (pivots, skin paths, radii). */
export function bodyModel(b: BodyRig, aspect: number): BodyModel {
  const P: Record<string, V2> = {};
  for (const [k, p] of Object.entries(b.joints)) P[k] = { x: p.x * aspect, y: p.y };
  const neck = mid(P.lSh!, P.rSh!);
  const pelvis = mid(P.lHip!, P.rHip!);
  const eyeC = mid(P.lEye!, P.rEye!);
  const eyeD = Math.max(dist(P.lEye!, P.rEye!), 1e-4);
  const headW = Math.max(eyeD * 2.3, dist(P.lEar!, P.rEar!) * 1.15);
  const up = sub(eyeC, neck);
  const upL = Math.max(1e-4, len(up));
  const headTop = add(eyeC, { x: up.x / upL, y: up.y / upL }, headW * 0.62);
  // Hands / feet: the landmark when it continues the limb, else the wrist / ankle pushed along the limb.
  for (const s of ['l', 'r'] as const) {
    const wr = P[`${s}Wr`]!;
    const el = P[`${s}El`]!;
    const hand = P[`${s}Hand`]!;
    const fore = sub(wr, el);
    if (dist(hand, wr) < len(fore) * 0.12 || dist(hand, wr) > len(fore) * 0.8)
      P[`${s}Hand`] = add(wr, fore, 0.35);
    const an = P[`${s}An`]!;
    const kn = P[`${s}Kn`]!;
    if (dist(P[`${s}Foot`]!, an) > dist(an, kn) * 0.7) P[`${s}Foot`] = add(an, sub(an, kn), 0.15);
  }
  const feet = mid(P.lAn!, P.rAn!);
  Object.assign(P, { neck, pelvis, headTop, feet, eyeC });
  const sw = dist(P.lSh!, P.rSh!);
  const hw = dist(P.lHip!, P.rHip!);
  const torsoR = 0.33 * Math.max(sw, hw * 1.1);
  // The torso skin stops a little below the neck and the head skin starts at the chin: the head turns alone.
  const neckLow = add(neck, sub(pelvis, neck), 0.15);
  const chin = add(neck, sub(eyeC, neck), 0.45);
  const bones: BoneModel[] = [
    { id: 'torso', parent: null, pivot: pelvis, path: [pelvis, neckLow], r: torsoR, layer: 1 },
    { id: 'head', parent: 'torso', pivot: neck, path: [chin, headTop], r: headW * 0.42, layer: 2 },
  ];
  for (const s of ['l', 'r'] as const) {
    bones.push(
      {
        id: `${s}Up` as BoneId,
        parent: 'torso',
        pivot: P[`${s}Sh`]!,
        path: [P[`${s}Sh`]!, P[`${s}El`]!],
        r: 0,
        layer: 3,
      },
      {
        id: `${s}Lo` as BoneId,
        parent: `${s}Up` as BoneId,
        pivot: P[`${s}El`]!,
        path: [P[`${s}El`]!, P[`${s}Wr`]!, P[`${s}Hand`]!],
        r: 0,
        layer: 3,
      },
      {
        id: `${s}Th` as BoneId,
        parent: null,
        pivot: P[`${s}Hip`]!,
        path: [P[`${s}Hip`]!, P[`${s}Kn`]!],
        r: 0,
        layer: 0,
      },
      {
        id: `${s}Shin` as BoneId,
        parent: `${s}Th` as BoneId,
        pivot: P[`${s}Kn`]!,
        path: [P[`${s}Kn`]!, P[`${s}An`]!, P[`${s}Foot`]!],
        r: 0,
        layer: 0,
      },
    );
  }
  const height = Math.max(1e-4, Math.max(feet.y, P.lFoot!.y, P.rFoot!.y) - headTop.y);
  const sideOf = (a: V2, c: V2, dflt: number) =>
    Math.abs(a.x - c.x) > sw * 0.08 ? Math.sign(a.x - c.x) : dflt;
  // MediaPipe's « left » is the character's left: on the +X side of the picture when it faces the camera.
  const out = { l: sideOf(P.lSh!, neck, 1), r: sideOf(P.rSh!, neck, -1) };
  if (out.l === out.r) out.r = -out.l;
  return { aspect, P, bones, height, out, hem: null };
}
/**
 * A long dress hides the gap between the legs: at knee height the cut-out is full between the two knees. Returns the
 * hem (U, where the gap between the legs opens on the way down to the ankles), or null for trousers / bare legs.
 */
export function findHem(m: BodyModel, alphaAt: (x: number, y: number) => number): number | null {
  const P = m.P;
  const gapAt = (t: number) => {
    // Points between the two legs at a fraction t from knees (0) to ankles (1).
    const l = add(P.lKn!, sub(P.lAn!, P.lKn!), t);
    const r = add(P.rKn!, sub(P.rAn!, P.rKn!), t);
    const c = mid(l, r);
    const span = Math.abs(l.x - r.x);
    if (span < m.height * 0.015) return false;
    let filled = 0;
    for (const k of [-0.2, 0, 0.2]) filled += alphaAt(c.x + k * span, c.y) > 0.5 ? 1 : 0;
    return filled < 2;
  };
  if (gapAt(0) || gapAt(-0.25)) return null;
  for (let t = 0.1; t <= 1.05; t += 0.05)
    if (gapAt(t)) return mid(add(P.lKn!, sub(P.lAn!, P.lKn!), t), add(P.rKn!, sub(P.rAn!, P.rKn!), t)).y;
  return mid(P.lAn!, P.rAn!).y;
}

// ── skin ────────────────────────────────────────────────────────────────────────────────────────────────────────────
function segDist(p: V2, a: V2, b: V2): number {
  const v = sub(b, a);
  const L2 = v.x * v.x + v.y * v.y;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * v.x + (p.y - a.y) * v.y) / L2)) : 0;
  return Math.hypot(p.x - a.x - v.x * t, p.y - a.y - v.y * t);
}
const pathDist = (p: V2, path: V2[]) => {
  let d = Infinity;
  for (let i = 0; i + 1 < path.length; i++) d = Math.min(d, segDist(p, path[i]!, path[i + 1]!));
  return d;
};
/**
 * The two bones a point follows and their weights: its nearest bone, blended with the second one only when the two
 * are connected and the point lies near their joint (an elbow, a knee, the neck) — never along an arm that hangs beside
 * the body, where a blend would leave pixels half-way when the arm moves.
 */
export function skinOf(m: BodyModel, p: V2): { i: [number, number]; w: [number, number] } {
  const dress = m.hem !== null && p.y < m.hem;
  // An arm only claims pixels near it (a hand hanging beside a dress must not carry the fabric away); in a long dress
  // the torso holds the fabric down to the hem.
  const armReach = m.height * 0.075;
  const s = m.bones.map((b) => {
    if (dress && b.layer === 0) return Infinity;
    const path = dress && b.id === 'torso' ? [{ x: b.pivot.x, y: m.hem! }, ...b.path] : b.path;
    const d = pathDist(p, path);
    if (b.layer === 3 && d > armReach) return Infinity;
    return Math.max(0, d - b.r);
  });
  let a = 0;
  for (let i = 1; i < s.length; i++) if (s[i]! < s[a]!) a = i;
  let b = a === 0 ? 1 : 0;
  for (let i = 0; i < s.length; i++) if (i !== a && s[i]! < s[b]!) b = i;
  const J = sharedJoint(m, m.bones[a]!, m.bones[b]!);
  if (!J || dist(p, J) > jointReach(m)) return { i: [a, a], w: [1, 0] };
  const sigma = m.height * 0.012;
  const wb = Math.exp(-(s[b]! - s[a]!) / sigma);
  return { i: [a, b], w: [1 / (1 + wb), wb / (1 + wb)] };
}
/** How far from a joint two connected bones still blend (and a triangle may span them). */
const jointReach = (m: BodyModel) => Math.max(m.height * 0.06, Math.min(m.height * 0.1, m.bones[0]!.r * 1.2));
/** The joint two bones share (null: they are not connected). */
function sharedJoint(m: BodyModel, a: BoneModel, b: BoneModel): V2 | null {
  if (a.parent === b.id) return a.pivot;
  if (b.parent === a.id) return b.pivot;
  // The thighs hang from the pelvis, as the torso does.
  if (a.id === 'torso' && b.id.endsWith('Th')) return b.pivot;
  if (b.id === 'torso' && a.id.endsWith('Th')) return a.pivot;
  return null;
}
export interface BodyMesh {
  /** Vertex rest positions (U, x/y interleaved), bone indices and weights (2 per vertex). */
  src: Float32Array;
  bi: Uint8Array;
  bw: Float32Array;
  /** Triangles (vertex indices), sorted back to front (legs, torso, head, arms). */
  tris: Uint32Array;
  /** Per triangle: −1 = the whole cut-out, else the bone whose pixels only it shows (border of two unconnected parts). */
  part: Int8Array;
}
/** The bone that owns a pixel of the drawing (its nearest bone): the part textures are cut along it. */
export const ownerOf = (m: BodyModel, p: V2): number => skinOf(m, p).i[0];
/**
 * A triangle mesh over the character's cut-out (alphaAt: 0..1 coverage in U). Where two unconnected bones meet (an arm
 * along the body, a hand on a thigh) the triangle is NOT stretched between them: its own vertices follow one bone.
 */
export function buildBodyMesh(
  m: BodyModel,
  alphaAt: (x: number, y: number) => number,
  bounds: { x0: number; y0: number; x1: number; y1: number },
  cells = 46,
): BodyMesh {
  const step = m.height / cells;
  const cols = Math.max(2, Math.ceil((bounds.x1 - bounds.x0) / step));
  const rows = Math.max(2, Math.ceil((bounds.y1 - bounds.y0) / step));
  const at = (i: number, j: number): V2 => ({ x: bounds.x0 + i * step, y: bounds.y0 + j * step });
  const alpha: number[] = [];
  const skin: ReturnType<typeof skinOf>[] = [];
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) {
      const p = at(i, j);
      alpha.push(alphaAt(p.x, p.y));
      skin.push(skinOf(m, p));
    }
  const src: number[] = [];
  const bi: number[] = [];
  const bw: number[] = [];
  const shared = new Map<number, number>();
  const vert = (k: number, rigid: number | null): number => {
    if (rigid === null && shared.has(k)) return shared.get(k)!;
    const p = at(k % (cols + 1), Math.floor(k / (cols + 1)));
    const n = src.length / 2;
    src.push(p.x, p.y);
    if (rigid === null) {
      bi.push(...skin[k]!.i);
      bw.push(...skin[k]!.w);
      shared.set(k, n);
    } else {
      bi.push(rigid, rigid);
      bw.push(1, 0);
    }
    return n;
  };
  const out: { tri: [number, number, number]; layer: number; part: number }[] = [];
  const linkR = jointReach(m);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const k00 = j * (cols + 1) + i;
      for (const t of [
        [k00, k00 + 1, k00 + cols + 1],
        [k00 + 1, k00 + cols + 2, k00 + cols + 1],
      ] as [number, number, number][]) {
        const c = {
          x: t.reduce((s, k) => s + at(k % (cols + 1), Math.floor(k / (cols + 1))).x, 0) / 3,
          y: t.reduce((s, k) => s + at(k % (cols + 1), Math.floor(k / (cols + 1))).y, 0) / 3,
        };
        const aMax = Math.max(...t.map((k) => alpha[k]!), alphaAt(c.x, c.y));
        if (aMax < 0.08) continue;
        const dom = t.map((k) => skin[k]!.i[0]);
        const kinds = [...new Set(dom)];
        if (kinds.length > 1) {
          const linked = kinds.every((x, u) =>
            kinds.slice(u + 1).every((y) => {
              const J = sharedJoint(m, m.bones[x]!, m.bones[y]!);
              return J !== null && dist(c, J) < linkR;
            }),
          );
          if (!linked) {
            // Where two unconnected parts meet, the triangle is drawn once per part, each copy following its own bone
            // and showing only that part's pixels (part textures): the border between them is the pixel border.
            for (const kb of kinds)
              out.push({
                tri: t.map((k) => vert(k, kb)) as [number, number, number],
                layer: m.bones[kb]!.layer,
                part: kb,
              });
            continue;
          }
        }
        out.push({
          tri: t.map((k) => vert(k, null)) as [number, number, number],
          layer: m.bones[dom[0]!]!.layer,
          part: -1,
        });
      }
    }
  out.sort((a, b) => a.layer - b.layer);
  const tris = new Uint32Array(out.length * 3);
  out.forEach((o, n) => tris.set(o.tri, n * 3));
  return {
    src: new Float32Array(src),
    bi: new Uint8Array(bi),
    bw: new Float32Array(bw),
    tris,
    part: Int8Array.from(out.map((o) => o.part)),
  };
}

// ── transforms ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** 2×3 affine matrix [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f (canvas convention). */
export type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
/** Rotation by θ around p (positive θ: the top of an upright bone goes to +X). */
const rotAt = (p: V2, t: number): M => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c, s, -s, c, p.x - c * p.x + s * p.y, p.y - s * p.x - c * p.y];
};
const scaleAt = (p: V2, sx: number, sy: number): M => [sx, 0, 0, sy, p.x - sx * p.x, p.y - sy * p.y];
export const apply = (m: M, p: V2): V2 => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
});

export interface BodyPose {
  /** Local rotation of each bone (radians, positive: the bone turns towards +X at its top / −X at its bottom). */
  ang: Record<BoneId, number>;
  /** Root: travel (body heights), rotation around the feet, scale (sx < 0: turned around). */
  root: { dx: number; dy: number; rot: number; sx: number; sy: number };
  /** Head pushed down along the torso (body heights): the nod. */
  headDy: number;
}
export const restPose = (): BodyPose => ({
  ang: Object.fromEntries(BONE_IDS.map((b) => [b, 0])) as Record<BoneId, number>,
  root: { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 },
  headDy: 0,
});
/** World matrix of every bone (same order as model.bones). */
export function boneMatrices(m: BodyModel, p: BodyPose): M[] {
  const h = m.height;
  const feet = m.P.feet!;
  const root = mul(
    mul([1, 0, 0, 1, p.root.dx * h, p.root.dy * h], scaleAt(feet, p.root.sx, p.root.sy)),
    rotAt(feet, p.root.rot),
  );
  const W = new Map<BoneId, M>();
  for (const b of m.bones) {
    let parent = b.parent ? W.get(b.parent)! : root;
    if (b.id === 'head' && p.headDy) {
      const down = sub(m.P.pelvis!, m.P.neck!);
      const L = Math.max(1e-6, len(down));
      parent = mul(parent, [1, 0, 0, 1, (down.x / L) * p.headDy * h, (down.y / L) * p.headDy * h]);
    }
    W.set(b.id, mul(parent, rotAt(b.pivot, p.ang[b.id] ?? 0)));
  }
  return m.bones.map((b) => W.get(b.id)!);
}
/** Deformed vertex positions (U) of the mesh for these bone matrices (linear blend skinning). */
export function deformMesh(mesh: BodyMesh, mats: M[], out?: Float32Array): Float32Array {
  const n = mesh.src.length / 2;
  const d = out ?? new Float32Array(n * 2);
  for (let v = 0; v < n; v++) {
    const x = mesh.src[v * 2]!;
    const y = mesh.src[v * 2 + 1]!;
    let X = 0;
    let Y = 0;
    for (let k = 0; k < 2; k++) {
      const w = mesh.bw[v * 2 + k]!;
      if (!w) continue;
      const q = mats[mesh.bi[v * 2 + k]!]!;
      X += w * (q[0] * x + q[2] * y + q[4]);
      Y += w * (q[1] * x + q[3] * y + q[5]);
    }
    d[v * 2] = X;
    d[v * 2 + 1] = Y;
  }
  return d;
}

// ── motion: targets in the character's own frame ────────────────────────────────────────────────────────────────────
/** A limb: a = upper bone angle from « hanging down » (positive = outward / up), b = bend of the lower bone (elbow
 *  flexion for an arm: the forearm at a + b; knee flexion for a leg: the shin at a − b). */
export interface Limb {
  a: number;
  b: number;
}
export interface BodyTarget {
  /** Lean of the torso and tilt of the head towards the other character (radians); head nod (body heights). */
  torso: number;
  head: number;
  headDy: number;
  /** « near » = the limb on the side of the other character. */
  arms: { near: Limb; far: Limb };
  legs: { near: Limb; far: Limb };
  /** dx towards the other character / dy down (body heights), fall rotation towards the other, scale, turned around. */
  root: { dx: number; dy: number; rot: number; sx: number; sy: number; flip: boolean };
}
export interface RestLimbs {
  arms: { near: Limb; far: Limb };
  legs: { near: Limb; far: Limb };
}
/** Angle of a direction in the outward frame of a limb, in [−π/2, 3π/2) (0: down, π/2: outward, π: up). */
const outAngle = (v: V2, o: number) => {
  let a = Math.atan2(o * v.x, v.y);
  if (a < -Math.PI / 2) a += 2 * Math.PI;
  return a;
};
/** Which side is near the other character (facing +1: the other one is on +X). */
export const nearSide = (m: BodyModel, facing: number): 'l' | 'r' => (m.out.l === facing ? 'l' : 'r');
/** The rest pose of the drawing in limb terms (what « keep the drawing as it is » means). */
export function restLimbs(m: BodyModel, facing: number): RestLimbs {
  const P = m.P;
  const limb = (s: 'l' | 'r', arm: boolean): Limb => {
    const o = m.out[s];
    const A = arm
      ? outAngle(sub(P[`${s}El`]!, P[`${s}Sh`]!), o)
      : outAngle(sub(P[`${s}Kn`]!, P[`${s}Hip`]!), o);
    const B = arm
      ? outAngle(sub(P[`${s}Wr`]!, P[`${s}El`]!), o)
      : outAngle(sub(P[`${s}An`]!, P[`${s}Kn`]!), o);
    // Arms: the forearm continues the raise (a + b); legs: the knee bends the shin back in (a − b).
    return { a: A, b: arm ? B - A : A - B };
  };
  const n = nearSide(m, facing);
  const f = n === 'l' ? 'r' : 'l';
  return {
    arms: { near: limb(n, true), far: limb(f, true) },
    legs: { near: limb(n, false), far: limb(f, false) },
  };
}
/** Target → local bone angles of the model. */
export function poseFromTarget(m: BodyModel, t: BodyTarget, facing: number): BodyPose {
  const p = restPose();
  const rest = restLimbs(m, facing);
  const n = nearSide(m, facing);
  const f = n === 'l' ? 'r' : 'l';
  const limb = (s: 'l' | 'r', tg: Limb, r: Limb, up: BoneId, lo: BoneId) => {
    const o = m.out[s];
    const k = up.endsWith('Th') ? -1 : 1;
    const dUp = o * (tg.a - r.a);
    const dLo = o * (tg.a + k * tg.b - (r.a + k * r.b));
    p.ang[up] = -dUp;
    p.ang[lo] = -dLo + dUp;
  };
  limb(n, t.arms.near, rest.arms.near, `${n}Up` as BoneId, `${n}Lo` as BoneId);
  limb(f, t.arms.far, rest.arms.far, `${f}Up` as BoneId, `${f}Lo` as BoneId);
  limb(n, t.legs.near, rest.legs.near, `${n}Th` as BoneId, `${n}Shin` as BoneId);
  limb(f, t.legs.far, rest.legs.far, `${f}Th` as BoneId, `${f}Shin` as BoneId);
  if (m.hem !== null) for (const b of ['lTh', 'lShin', 'rTh', 'rShin'] as const) p.ang[b] *= 0.3;
  p.ang.torso = facing * t.torso;
  p.ang.head = facing * t.head;
  p.headDy = t.headDy;
  p.root = {
    dx: facing * t.root.dx,
    dy: t.root.dy,
    rot: facing * t.root.rot,
    sx: (t.root.flip ? -1 : 1) * t.root.sx,
    sy: t.root.sy,
  };
  return p;
}

/** The body clips: gesture ids of puppet.ts + full-body ones. */
export const BODY_CLIPS = [
  'idle',
  'talk',
  'wave',
  'point',
  'shrug',
  'head-hands',
  'laugh',
  'jump',
  'yes',
  'no',
  'angry',
  'dance',
  'clap',
  'think',
  'startle',
  'cry',
  'run',
  'walk',
  'fall',
  'slap',
  'beg',
  'exit',
] as const;
export interface ClipCtx {
  /** Global time (idle phases), seconds since the gesture / action began. */
  t: number;
  age: number;
  speaking: boolean;
  energy: number;
  beat: number;
  emotion?: string;
  rest: RestLimbs;
  /** Room to travel towards the other character (body heights) — 0 when the background plate is a guess. */
  room: number;
  /** Travel allowed (exact background plate). */
  travel: boolean;
  /** Per-character phase (no two characters in sync). */
  phase: number;
  /** Side a fall goes to: +1 towards the other character, −1 away (the renderer picks the side with room). */
  fallDir?: number;
}
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const S = Math.sin;
const L = (a: number, b: number): Limb => ({ a, b });
/** Idle / talking body (what every gesture blends from). */
function baseTarget(c: ClipCtx): BodyTarget {
  const { t, phase: ph } = c;
  const r = c.rest;
  const talk = c.speaking ? Math.min(1, c.energy * 2.2) : 0;
  const bt = c.speaking ? c.beat : 0;
  const tg: BodyTarget = {
    torso: 0.012 * S(t * 0.9 + ph) + (c.speaking ? 0.035 + 0.03 * bt : -0.01),
    head: 0.025 * S(t * 1.3 + ph) + (c.speaking ? 0.04 * bt + 0.02 * S(t * 2.1 + ph) * talk : 0),
    headDy: c.speaking ? 0.004 * talk + 0.01 * bt : 0.002 * S(t * 1.1 + ph),
    arms: {
      // The speaker explains with the near hand (forearm up on the accents of the voice); the listener idles.
      near: c.speaking
        ? L(r.arms.near.a + 0.22 + 0.3 * bt + 0.06 * S(t * 1.7 + ph), r.arms.near.b + 0.55 + 0.45 * bt)
        : L(r.arms.near.a + 0.03 * S(t * 1.2 + ph), r.arms.near.b + 0.03 * S(t * 1.5 + ph)),
      far: L(
        r.arms.far.a + 0.04 * S(t * 1.1 + ph + 1) + (c.speaking ? 0.08 * bt : 0),
        r.arms.far.b + (c.speaking ? 0.15 * bt : 0),
      ),
    },
    legs: { near: { ...r.legs.near }, far: { ...r.legs.far } },
    root: { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 + 0.008 * S(t * 2 + ph), flip: false },
  };
  // Emotion layer (Wallbott / Ekman), amplified for a full body.
  const em = EMOTION_BODY[emotionOf(c.emotion)]!;
  const k = c.speaking ? 1 : 0.6;
  const tt = t * em.tempo;
  tg.torso += em.lean * 2.5 * k;
  tg.head += em.headTilt * 1.6 * k;
  tg.headDy += em.headDrop * 0.12 * k;
  tg.arms.near.a += em.arms * 0.9 * k;
  tg.arms.far.a += em.arms * 0.9 * k;
  tg.root.dx += em.tremble * 1.2 * k * S(tt * 40 + ph);
  tg.root.sy += em.squash * 0.5 * k;
  tg.root.dy -= em.bounce * 1.4 * k * Math.abs(S(tt * 6 + ph));
  return tg;
}
/** The gesture pose itself (absolute limb targets). */
function gestureTarget(id: string, c: ClipCtx, b: BodyTarget): BodyTarget {
  const g: BodyTarget = JSON.parse(JSON.stringify(b)) as BodyTarget;
  const { age: a, t } = c;
  const r = c.rest;
  const both = (x: Limb) => {
    g.arms.near = { ...x };
    g.arms.far = { ...x };
  };
  switch (id) {
    case 'wave':
      g.arms.near = L(2.45, 0.35 + 0.45 * S(t * 9));
      g.head += 0.06;
      g.torso += 0.02;
      break;
    case 'point':
      g.arms.near = L(1.5 + 0.1 * c.beat, 0.05);
      g.torso += 0.06;
      g.head += 0.04;
      break;
    case 'shrug': {
      const s = ease(Math.min(1, a / 0.3)) * (0.75 + 0.25 * S(t * 2.6));
      both(L(r.arms.near.a + 0.35 * s, 1.5 * s));
      g.head += 0.12 * s;
      g.root.dy -= 0.008 * s;
      break;
    }
    case 'head-hands':
      both(L(2.7, 2.0));
      g.head += 0.08 * S(t * 4);
      g.torso += 0.03 * S(t * 3);
      break;
    case 'laugh':
      g.torso = -0.12 + 0.1 * S(t * 12);
      g.head = -0.1 + 0.06 * S(t * 12);
      both(L(0.25, -1.9));
      g.root.dy -= 0.008 * Math.abs(S(t * 12));
      break;
    case 'jump': {
      const p = (a % 1.2) / 1.2;
      if (p < 0.2) {
        const k = S((Math.PI * p) / 0.2);
        g.root.dy += 0.04 * k;
        g.legs.near = L(r.legs.near.a + 0.3 * k, r.legs.near.b + 0.6 * k);
        g.legs.far = L(r.legs.far.a + 0.3 * k, r.legs.far.b + 0.6 * k);
        both(L(0.4 * k, 0.3));
      } else if (p < 0.75) {
        const q = (p - 0.2) / 0.55;
        g.root.dy -= 0.14 * S(Math.PI * q);
        g.legs.near = L(0.22, 0.55);
        g.legs.far = L(0.22, 0.55);
        both(L(2.6, 0.2));
        g.root.sy = 1.04;
      } else {
        const q = (p - 0.75) / 0.25;
        g.root.dy += 0.03 * (1 - q);
        g.root.sy = 1 - 0.07 * (1 - q);
        both(L(1.2 * (1 - q), 0.3));
      }
      break;
    }
    case 'yes':
      g.headDy += 0.012 * Math.max(0, S(t * 9));
      g.head += 0.03 * S(t * 9);
      break;
    case 'no':
      g.head += 0.14 * S(t * 9);
      break;
    case 'angry': {
      g.arms.near = L(2.3, 1.2 + 0.3 * S(t * 22));
      g.torso += 0.1;
      g.root.dx += 0.004 * S(t * 40);
      const st = Math.max(0, S(t * 6));
      g.legs.near = L(r.legs.near.a + 0.3 * st, r.legs.near.b + 0.6 * st);
      g.root.dy -= 0.006 * st;
      break;
    }
    case 'dance': {
      const w = 2 * Math.PI * 1.8;
      g.root.dx += 0.03 * S(t * w);
      g.root.dy -= 0.016 * Math.abs(S(t * w));
      g.torso = 0.12 * S(t * w * 0.5);
      g.head = -0.1 * S(t * w * 0.5);
      g.arms.near = L(1.0 + 0.7 * S(t * w), 1.3);
      g.arms.far = L(1.0 + 0.7 * S(t * w + Math.PI), 1.3);
      g.legs.near = L(0.15 + 0.15 * S(t * w), 0.3 + 0.35 * Math.max(0, S(t * w)));
      g.legs.far = L(0.15 + 0.15 * S(t * w + Math.PI), 0.3 + 0.35 * Math.max(0, S(t * w + Math.PI)));
      break;
    }
    case 'clap':
      both(L(0.5, -2.1 - 0.25 * S(t * 14)));
      g.torso += 0.03;
      break;
    case 'think':
      g.arms.near = L(0.4, -2.9);
      g.head += 0.1;
      g.torso -= 0.02;
      break;
    case 'startle': {
      const k = a < 0.28 ? S((Math.PI * a) / 0.28) : 0;
      g.root.dy -= 0.08 * k;
      g.torso = -0.12;
      g.head = -0.08;
      both(L(2.0, 0.9));
      g.root.dx += -0.02 * ease(a / 0.3) + 0.003 * S(t * 35);
      break;
    }
    case 'cry':
      g.torso = 0.12;
      g.head = 0.16;
      g.headDy += 0.012;
      both(L(0.35, -2.7));
      g.root.dy += 0.004 * S(t * 28);
      break;
    case 'walk':
    case 'run':
    case 'exit': {
      const run = id === 'run';
      const speed = run ? 0.9 : 0.32;
      // Arrived (or no room to walk): the body stops and goes back to the idle / talking pose, the travel is kept.
      if (id !== 'exit' && (c.travel ? speed * a >= c.room : a > 1.2))
        return { ...b, root: { ...b.root, dx: c.travel ? c.room : 0 } };
      const w = run ? 12 : 7;
      const sw = run ? 0.7 : 0.36;
      const s = S(t * w);
      g.legs.near = L(sw * s, (run ? 0.6 : 0.15) + (run ? 0.6 : 0.4) * Math.max(0, -s));
      g.legs.far = L(-sw * s, (run ? 0.6 : 0.15) + (run ? 0.6 : 0.4) * Math.max(0, s));
      g.arms.near = L(-(run ? 0.6 : 0.28) * s, run ? 1.4 : 0.25);
      g.arms.far = L((run ? 0.6 : 0.28) * s, run ? 1.4 : 0.25);
      g.torso = run ? 0.16 : 0.04;
      g.root.dy -= (run ? 0.025 : 0.012) * Math.abs(S(t * w + Math.PI / 2));
      if (id === 'exit') {
        // Turns around and walks out of the shot.
        g.root.flip = a > 0.25;
        g.root.dx = c.travel ? -speed * Math.max(0, a - 0.25) : 0;
      } else g.root.dx = c.travel ? Math.min(c.room, speed * a) : 0;
      break;
    }
    case 'fall': {
      // The cartoon « timber » fall: a wobble, then the stiff body tips over around its feet (towards the side with
      // the most room), hits the ground with a bounce; arms flail on the way down.
      const dir = c.fallDir ?? -1;
      const wob = a < 0.25 ? 0.06 * S(a * 40) : 0;
      const k = ease((a - 0.2) / 0.45);
      const hit = a > 0.65 ? 0.06 * Math.max(0, S((a - 0.65) * 18)) * Math.exp(-(a - 0.65) * 8) : 0;
      g.root.rot = dir * (1.35 * k - hit) + wob;
      g.torso = dir * 0.1 * k;
      g.head = dir * 0.15 * k;
      g.legs.near = L(r.legs.near.a + 0.1 * k, 0.15 * k);
      g.legs.far = L(r.legs.far.a + 0.05 * k, 0.1 * k);
      both(L(1.7 + (a < 0.7 ? 0.5 * S(a * 24) : 0.1 * S(t * 3)), 0.4));
      break;
    }
    case 'slap': {
      const p = a % 1.4;
      const k = p < 0.25 ? ease(p / 0.25) : p < 0.4 ? 1 - ease((p - 0.25) / 0.15) : 0;
      const strike = p >= 0.25 && p < 0.55;
      g.arms.near =
        p < 0.25
          ? L(1.2 + 1.4 * k, 0.4)
          : strike
            ? L(2.6 - 1.7 * ease((p - 0.25) / 0.15), 0.1)
            : L(0.9 - 0.6 * ease((p - 0.55) / 0.5), 0.2);
      g.torso += strike ? 0.14 : 0.04;
      g.root.dx += strike ? 0.02 : 0;
      break;
    }
    case 'beg':
      both(L(0.7, -2.3));
      g.torso = 0.15;
      g.head = 0.1;
      g.root.dy += 0.015;
      g.root.dx += 0.002 * S(t * 30);
      break;
  }
  return g;
}
const mixL = (a: Limb, b: Limb, k: number): Limb => ({ a: a.a + (b.a - a.a) * k, b: a.b + (b.b - a.b) * k });
function mixTarget(a: BodyTarget, b: BodyTarget, k: number): BodyTarget {
  const m = (x: number, y: number) => x + (y - x) * k;
  return {
    torso: m(a.torso, b.torso),
    head: m(a.head, b.head),
    headDy: m(a.headDy, b.headDy),
    arms: { near: mixL(a.arms.near, b.arms.near, k), far: mixL(a.arms.far, b.arms.far, k) },
    legs: { near: mixL(a.legs.near, b.legs.near, k), far: mixL(a.legs.far, b.legs.far, k) },
    // Travel, turning around and falling are not blended away (the character does not slide back).
    root: {
      dx: m(a.root.dx, b.root.dx),
      dy: m(a.root.dy, b.root.dy),
      rot: m(a.root.rot, b.root.rot),
      sx: m(a.root.sx, b.root.sx),
      sy: m(a.root.sy, b.root.sy),
      flip: k > 0.5 ? b.root.flip : a.root.flip,
    },
  };
}
/**
 * The body at this instant: idle / talking base, the gesture blended in with anticipation → overshoot → settle
 * (age = seconds since the gesture began). Locomotion, falls and exits are played without the overshoot.
 */
export function bodyTarget(clip: string | null, c: ClipCtx): BodyTarget {
  const base = baseTarget(c);
  if (!clip || clip === 'idle' || clip === 'talk' || !(BODY_CLIPS as readonly string[]).includes(clip))
    return base;
  const g = gestureTarget(clip, c, base);
  const k = ['walk', 'run', 'exit', 'fall', 'jump', 'dance', 'slap'].includes(clip)
    ? ease(c.age / 0.2)
    : Math.max(0, Math.min(1.15, gestureEnvelope(c.age)));
  return mixTarget(base, g, k);
}

// ── secondary motion ────────────────────────────────────────────────────────────────────────────────────────────────
export interface BodySpring {
  t: number;
  x: number[];
  v: number[];
}
const SPR: Record<string, { w: number; z: number }> = {
  arm: { w: 17, z: 0.62 },
  leg: { w: 24, z: 0.8 },
  torso: { w: 12, z: 0.75 },
  head: { w: 16, z: 0.7 },
  root: { w: 30, z: 0.8 },
  scale: { w: 18, z: 0.6 },
};
const flat = (p: BodyPose) => [
  ...BONE_IDS.map((b) => p.ang[b]),
  p.root.dx,
  p.root.dy,
  p.root.rot,
  p.root.sx,
  p.root.sy,
  p.headDy,
];
const kindOf = (i: number) =>
  i < BONE_IDS.length
    ? BONE_IDS[i]!.match(/Up|Lo/)
      ? 'arm'
      : BONE_IDS[i]!.match(/Th|Shin/)
        ? 'leg'
        : BONE_IDS[i]!
    : i - BONE_IDS.length >= 3 && i - BONE_IDS.length <= 4
      ? 'scale'
      : i - BONE_IDS.length === 5
        ? 'head'
        : 'root';
/** Every value follows its target through a damped spring (follow-through; turning around = the classic cartoon turn,
 *  the drawing thins to a line and opens mirrored). */
export function springBody(
  s: BodySpring | undefined,
  target: BodyPose,
  t: number,
): { pose: BodyPose; state: BodySpring } {
  const goal = flat(target);
  if (!s || t < s.t || t - s.t > 0.5) return { pose: target, state: { t, x: goal, v: goal.map(() => 0) } };
  const total = t - s.t;
  const steps = Math.max(1, Math.ceil(total / 0.008));
  const dt = total / steps;
  const sxI = BONE_IDS.length + 3;
  for (let k = 0; k < steps; k++)
    for (let i = 0; i < goal.length; i++) {
      const { w, z } = SPR[kindOf(i)] ?? SPR.root!;
      const acc = w * w * (goal[i]! - s.x[i]!) - 2 * z * w * s.v[i]!;
      s.v[i] = s.v[i]! + acc * dt;
      s.x[i] = s.x[i]! + s.v[i]! * dt;
    }
  s.t = t;
  const x = s.x;
  const pose: BodyPose = {
    ang: Object.fromEntries(BONE_IDS.map((b, i) => [b, x[i]!])) as Record<BoneId, number>,
    root: {
      dx: x[BONE_IDS.length]!,
      dy: x[BONE_IDS.length + 1]!,
      rot: x[BONE_IDS.length + 2]!,
      sx: x[sxI]!,
      sy: x[BONE_IDS.length + 4]!,
    },
    headDy: x[BONE_IDS.length + 5]!,
  };
  return { pose, state: s };
}
