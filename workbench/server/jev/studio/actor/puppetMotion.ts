/**
 * LE JEU DU CORPS DE LA MARIONNETTE SOUPLE — where the handles of a drawn pose go at each instant (the drawing then
 * bends around them, ARAP): the feet and the ground line stay put, the hips sway with the weight, the shoulders breathe,
 * rise in a shrug, shake in a laugh, tremble in a shock; the arms beat the accents of the voice (the forearm lifts on a
 * stressed syllable), the accusing arm jabs and wags its finger, the shrugging palms rise; the head follows the
 * shoulders so the neck never stretches. Motions are ROTATIONS of the drawn bones (lengths kept, like the retargeting
 * of Animated Drawings), sized on the figure's height. Pure.
 */
import type { PoseKind } from './sheet';

/** BlazePose indices used by the puppet. */
export const BP = { nose: 0, lEye: 2, rEye: 5, lEar: 7, rEar: 8, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16, lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28, lHeel: 29, rHeel: 30, lToe: 31, rToe: 32 } as const;
/** The skeleton of a drawn pose: BlazePose index → [x, y] in fractions of the pose (x of its width, y of its height). */
export type SheetBody = Record<number, [number, number]>;

export interface PuppetDrive {
  t: number;
  talking: boolean;
  listening: boolean;
  energy: number;
  /** Accent of the voice 0..1 (stressed syllable). */
  beat: number;
  pose: PoseKind;
  /** Seconds since the pose began. */
  age: number;
  phase: number;
  laugh: number;
  shock: number;
  /** Walking (figurants crossing the set): the step phase (radians, 2π = two steps) and the direction of travel. */
  walk?: { phase: number; dir: 1 | -1 };
}
type P = [number, number];
const rot = (v: P, a: number): P => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];

/** A rotation that LIFTS the end of a bone (image y points down): its sign follows the bone's horizontal direction. */
const liftSign = (bone: P) => (Math.abs(bone[0]) < 1e-6 ? 0 : bone[0] > 0 ? -1 : 1);

/** Shrug envelope: up in 0.25 s, held, back down over ~1.5 s. */
const shrugEnv = (age: number) => (age < 0.25 ? age / 0.25 : Math.exp(-(age - 0.25) * 1.1));

/**
 * Targets of the handles at this instant, in PIXELS of the pose (w × h): landmark index → position. Points absent from
 * the skeleton are absent from the result (the drawing there just follows).
 */
export function puppetTargets(body: SheetBody, w: number, h: number, d: PuppetDrive): Map<number, P> {
  const px = (k: number): P | null => (body[k] ? [body[k]![0] * w, body[k]![1] * h] : null);
  const out = new Map<number, P>();
  const wk = d.walk;
  // Feet and knees: planted — or, walking, each foot in turn lifts and swings forward while the other carries.
  for (const [side, ks] of [
    [0, [BP.lAn, BP.lHeel, BP.lToe, BP.lKn]],
    [1, [BP.rAn, BP.rHeel, BP.rToe, BP.rKn]],
  ] as const) {
    const ph = wk ? wk.phase + side * Math.PI : 0;
    const lift = wk ? Math.max(0, Math.sin(ph)) * 0.035 * h : 0;
    const swing = wk ? Math.cos(ph) * 0.045 * h * wk.dir : 0;
    ks.forEach((k, j) => {
      const p = px(k);
      // The knee moves half as much as the foot.
      if (p) out.set(k, j === 3 ? [p[0] + swing * 0.5, p[1] - lift * 0.5] : [p[0] + swing, p[1] - lift]);
    });
  }
  // Hips: the weight shifts slowly from one foot to the other (walking: the body rises on each step).
  const sway = Math.sin(d.t * 0.9 + d.phase) * 0.004 * h;
  const bob = wk ? -Math.abs(Math.sin(wk.phase)) * 0.008 * h : 0;
  for (const k of [BP.lHip, BP.rHip]) {
    const p = px(k);
    if (p) out.set(k, [p[0] + sway, p[1] + bob]);
  }
  // Shoulders: breath, shrug, laugh, shock.
  const breath = -Math.sin(d.t * 2.1 + d.phase) * 0.003 * h;
  const shrug = d.pose === 'haussement' && d.talking ? -shrugEnv(d.age) * 0.016 * h : 0;
  const laugh = -Math.abs(Math.sin(d.t * 13)) * 0.007 * h * d.laugh;
  const tremble = d.pose === 'choc' ? Math.sin(d.t * 47) * 0.0025 * h * Math.max(d.shock, Math.exp(-d.age * 2)) : 0;
  const lean = sway * 1.6;
  const shDy = breath + shrug + laugh + bob;
  const shoulder = (k: number): P | null => {
    const p = px(k);
    return p ? [p[0] + lean + tremble, p[1] + shDy] : null;
  };
  const lS = shoulder(BP.lSh);
  const rS = shoulder(BP.rSh);
  if (lS) out.set(BP.lSh, lS);
  if (rS) out.set(BP.rSh, rS);
  // Head: follows the shoulders (no stretched neck).
  const nose = px(BP.nose);
  const headD: P = [lean + tremble, shDy];
  for (const k of [BP.nose, BP.lEye, BP.rEye, BP.lEar, BP.rEar]) {
    const p = px(k);
    if (p) out.set(k, add(p, headD));
  }
  // Arms: rotations of the upper arm and forearm (lengths kept).
  const shoulderMidX = ((px(BP.lSh)?.[0] ?? 0) + (px(BP.rSh)?.[0] ?? 0)) / 2;
  const arms = [
    { s: BP.lSh, e: BP.lEl, wr: BP.lWr, side: 1 },
    { s: BP.rSh, e: BP.rEl, wr: BP.rWr, side: -1 },
  ];
  // The accusing arm: the one whose wrist is the furthest from the body's axis.
  const reach = arms.map((a) => Math.abs((px(a.wr)?.[0] ?? shoulderMidX) - shoulderMidX));
  const pointing = d.pose === 'accuse' ? (reach[0]! >= reach[1]! ? 0 : 1) : -1;
  arms.forEach((a, i) => {
    const s0 = px(a.s);
    const e0 = px(a.e);
    const w0 = px(a.wr);
    if (!s0 || !e0 || !w0) return;
    // A hand on the face (hands on the cheeks) moves with the head.
    if (nose && Math.hypot(w0[0] - nose[0], w0[1] - nose[1]) < 0.13 * h) {
      out.set(a.e, add(e0, headD));
      out.set(a.wr, add(w0, headD));
      return;
    }
    const s1 = out.get(a.s) ?? s0;
    const up = sub(e0, s0);
    const fore = sub(w0, e0);
    let a1: number;
    let a2: number;
    const ph = d.phase + a.side * 1.3;
    if (wk) {
      // Walking: the arms swing against the legs (left arm with the right foot).
      const sw = Math.sin(wk.phase + (i === 0 ? Math.PI : 0)) * wk.dir;
      a1 = sw * 0.22;
      a2 = sw * 0.12 + 0.05 * (liftSign(fore) || 1);
    } else if (i === pointing && d.talking) {
      // The accusation: the finger wags and jabs on the accents.
      a1 = Math.sin(d.t * 6.5 + ph) * 0.035;
      a2 = (Math.sin(d.t * 6.5 + ph + 0.6) * 0.06 + d.beat * 0.12) * (liftSign(fore) || 1);
    } else if (d.pose === 'haussement' && d.talking) {
      // Palms up with the shrug.
      a2 = shrugEnv(d.age) * 0.22 * (liftSign(fore) || 1);
      a1 = shrugEnv(d.age) * 0.05 * (liftSign(up) || 1);
    } else if (d.talking) {
      // The beat gestures of a talker: the forearm lifts on the stressed syllables, a little life in between.
      const amp = 0.6 + 0.4 * Math.min(1, d.energy * 2);
      a2 = (d.beat * 0.2 + Math.sin(d.t * 3.1 + ph) * 0.04) * amp * (liftSign(fore) || 1);
      a1 = (d.beat * 0.05 + Math.sin(d.t * 2.3 + ph) * 0.02) * amp * (liftSign(up) || 1);
    } else {
      // Listening / idle: the arms hang and sway a little.
      a2 = Math.sin(d.t * 1.2 + ph) * 0.03;
      a1 = Math.sin(d.t * 0.9 + ph) * 0.015;
    }
    if (d.laugh) a2 += Math.sin(d.t * 13) * 0.04 * d.laugh;
    const e1 = add(s1, rot(up, a1));
    const w1 = add(e1, rot(fore, a1 + a2));
    out.set(a.e, e1);
    out.set(a.wr, w1);
  });
  return out;
}

/** The skeleton of a pose from BlazePose landmarks in pixels of the pose ([x, y, visibility] × 33), visible points only. */
export function bodyFromLandmarks(pts: ArrayLike<number>, w: number, h: number, minVis = 0.5): SheetBody | null {
  const out: SheetBody = {};
  let n = 0;
  for (const k of Object.values(BP)) {
    const x = pts[k * 3];
    const y = pts[k * 3 + 1];
    const v = pts[k * 3 + 2] ?? 1;
    if (x === undefined || y === undefined || v < minVis) continue;
    if (x < -0.05 * w || x > 1.05 * w || y < -0.05 * h || y > 1.05 * h) continue;
    out[k] = [Math.round((x / w) * 10000) / 10000, Math.round((y / h) * 10000) / 10000];
    n++;
  }
  // A usable skeleton has its shoulders and at least one arm.
  return n >= 6 && out[BP.lSh] && out[BP.rSh] && ((out[BP.lEl] && out[BP.lWr]) || (out[BP.rEl] && out[BP.rWr])) ? out : null;
}
