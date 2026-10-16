/**
 * LE JEU DU CORPS DE LA MARIONNETTE SOUPLE — where the handles of a drawn pose go at each instant (the drawing then
 * bends around them, ARAP): the feet and the ground line stay put, the hips sway with the weight, the shoulders breathe,
 * rise in a shrug, shake in a laugh, tremble in a shock; the arms beat the accents of the voice (the forearm lifts on a
 * stressed syllable), the accusing arm jabs and wags its finger, the shrugging palms rise; the head follows the
 * shoulders so the neck never stretches. Motions are ROTATIONS of the drawn bones (lengths kept, like the retargeting
 * of Animated Drawings), sized on the figure's height. Pure.
 */
import type { PoseKind } from './sheet';

import { BP } from './bp';
import { applyMoves, guardBody, type GuardReport, type MoveCue } from './bodyMoves';
export { BP };
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
  /**
   * Where the partner of the conversation stands, in the DRAWING's x (+1 = towards the right of the drawing, −1 = left).
   * The body is then DIRECTED: the idle sway is halved, the torso leans in towards the partner (a talker thrusts in on
   * each stressed syllable, an accuser more), a listener leans in a little, and the accusing hand jabs towards them.
   * Without it, the body only sways in place (the sway can then lean away from the person addressed).
   */
  toward?: 1 | -1;
  /** Movements of the repertoire being played (bodyMoves.MOVES), each with its phase. */
  moves?: MoveCue[];
  /** Acting amplitude: every handle's offset from the drawing is multiplied (feet excepted) BEFORE the guard. */
  amplitude?: number;
  /**
   * How much the character is talking, 0..1, ramped by the caller over a few tenths of a second around each line. The
   * talking and listening gestures are BLENDED with it (16/10, measured: switching on the `talking` boolean made the
   * arms and the lean jump in one frame at the end of every line). Defaults to `talking ? 1 : 0`.
   */
  talkW?: number;
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
  return puppetPose(body, w, h, d).targets;
}

export interface PuppetPose {
  targets: Map<number, P>;
  /** What the anatomical guard had to correct this frame (0 everywhere = a clean, human pose). */
  guard: GuardReport;
  /** Whole-body lift (pixels, up) for hops; the caller moves the drawing. */
  lift: number;
  /** Feet that leave their drawn place this frame (a tapping toe): their ground handles must follow. */
  freeFeet: number[];
}
const FEET = new Set<number>([BP.lAn, BP.rAn, BP.lHeel, BP.rHeel, BP.lToe, BP.rToe]);

/**
 * The full pose of a frame: the base acting below (breath, weight, beats, shrug, laugh, accusation, walking, directed
 * body), then the amplitude, then the movements of the repertoire, then the ANATOMICAL GUARD (elbows and knees on their
 * natural side, flexion limits, bone lengths, neck and torso caps).
 */
export function puppetPose(body: SheetBody, w: number, h: number, d: PuppetDrive): PuppetPose {
  const out = baseTargets(body, w, h, d);
  const rest = new Map<number, P>();
  for (const [k, v] of Object.entries(body)) rest.set(Number(k), [v[0] * w, v[1] * h]);
  const amp = d.amplitude ?? 1;
  if (amp !== 1) for (const [k, p] of out) { const r = rest.get(k); if (r && !FEET.has(k)) out.set(k, [r[0] + amp * (p[0] - r[0]), r[1] + amp * (p[1] - r[1])]); }
  const mv = d.moves?.length ? applyMoves(rest, out, h, d.moves, d.toward ?? 0, d.t) : { lift: 0, freeFeet: [] };
  const guard = guardBody(rest, out, h);
  return { targets: out, guard, lift: mv.lift, freeFeet: mv.freeFeet };
}

function baseTargets(body: SheetBody, w: number, h: number, d: PuppetDrive): Map<number, P> {
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
  const to = wk ? 0 : (d.toward ?? 0);
  const sway = Math.sin(d.t * 0.9 + d.phase) * 0.004 * h * (to ? 0.5 : 1);
  // Directed body: towards the partner — held lean + a thrust on the stressed syllables (stronger when accusing).
  const tw = Math.min(1, Math.max(0, d.talkW ?? (d.talking ? 1 : 0)));
  const thrust = tw * (d.pose === 'accuse' ? 0.014 : 0.006) * h * d.beat;
  const lean0 = to * ((0.0025 + 0.0015 * tw) * h * (d.talking || d.listening || tw > 0 ? 1 : 0) + thrust);
  const bob = wk ? -Math.abs(Math.sin(wk.phase)) * 0.008 * h : 0;
  for (const k of [BP.lHip, BP.rHip]) {
    const p = px(k);
    if (p) out.set(k, [p[0] + sway + 0.35 * lean0, p[1] + bob]);
  }
  // Shoulders: breath, shrug, laugh, shock.
  const breath = -Math.sin(d.t * 2.1 + d.phase) * 0.003 * h;
  const shrug = d.pose === 'haussement' ? -shrugEnv(d.age) * 0.016 * h * tw : 0;
  const laugh = -Math.abs(Math.sin(d.t * 13)) * 0.007 * h * d.laugh;
  const tremble = d.pose === 'choc' ? Math.sin(d.t * 47) * 0.0025 * h * Math.max(d.shock, Math.exp(-d.age * 2)) : 0;
  const lean = sway * 1.6 + lean0;
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
    } else {
      // Listening / idle: the arms hang and sway a little…
      const i2 = Math.sin(d.t * 1.2 + ph) * 0.03, i1 = Math.sin(d.t * 0.9 + ph) * 0.015;
      // …and talking: the accusation (the finger wags and jabs on the accents, less when aimed at someone), the shrug's
      // palms up, or the beat gestures (the forearm lifts on the stressed syllables) — blended by the talk weight
      let t1 = 0, t2 = 0;
      if (i === pointing) {
        const wag = to ? 0.5 : 1;
        t1 = Math.sin(d.t * 6.5 + ph) * 0.035 * wag;
        t2 = (Math.sin(d.t * 6.5 + ph + 0.6) * 0.06 * wag + d.beat * 0.12) * (liftSign(fore) || 1);
      } else if (d.pose === 'haussement') {
        t2 = shrugEnv(d.age) * 0.22 * (liftSign(fore) || 1);
        t1 = shrugEnv(d.age) * 0.05 * (liftSign(up) || 1);
      } else {
        const amp = 0.6 + 0.4 * Math.min(1, d.energy * 2);
        t2 = (d.beat * 0.2 + Math.sin(d.t * 3.1 + ph) * 0.04) * amp * (liftSign(fore) || 1);
        t1 = (d.beat * 0.05 + Math.sin(d.t * 2.3 + ph) * 0.02) * amp * (liftSign(up) || 1);
      }
      a1 = i1 + tw * (t1 - i1);
      a2 = i2 + tw * (t2 - i2);
    }
    if (d.laugh) a2 += Math.sin(d.t * 13) * 0.04 * d.laugh;
    let e1 = add(s1, rot(up, a1));
    let w1 = add(e1, rot(fore, a1 + a2));
    // Aimed accusation: the whole hand thrusts towards the partner on the accent (the elbow half as much).
    if (i === pointing && tw > 0 && to) {
      const jab = to * 0.01 * h * d.beat * tw;
      e1 = [e1[0] + 0.5 * jab, e1[1]];
      w1 = [w1[0] + jab, w1[1]];
    }
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
