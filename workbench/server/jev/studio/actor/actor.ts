/**
 * ACTEUR VIRTUEL — the performance director. A script of actions (sit, stand up, walk to, turn to, wave, point,
 * shrug, hands on hips, emotions, look at…) becomes, frame by frame, a full skeletal pose:
 *  - ROOT: the pelvis follows the walk path / turns; sitting ⇄ standing is a real sit-to-stand (lean forward, push up);
 *  - FEET: a procedural step planner plants the feet on the ground (no sliding) and steps when the body moves or turns;
 *  - LEGS / ARMS: two-bone IK towards foot / hand targets with knee / elbow pole vectors;
 *  - SPINE / HEAD: emotional posture (Wallbott / Ekman: anger leans in, sadness slumps…) and look-at;
 *  - HANDS: index finger pointing or relaxed curl; FACE: expression weights for the renderer (blend shapes).
 * The output (local rotations + root) drives any renderer: Blender armature, three.js skeleton, or the 2D pose video
 * that conditions a pose-driven video model.
 */
import { add, clamp, lerp3, len, norm, qAxis, qEuler, qMul, qRot, ramp, scale, smooth, sub, win, type Q, type V3 } from './math';
import { applyLimits, fk, jointIndex, restPose, type Pose, type WorldPose } from './skeleton';
import { lookAt, setWorldRot, twoBoneIK } from './solver';

export type ArmMode = 'wave' | 'point' | 'shrug' | 'akimbo' | 'cross' | 'raise' | 'facepalm';
export type Emotion = 'neutre' | 'joie' | 'colère' | 'tristesse' | 'peur' | 'surprise' | 'fierté' | 'mépris' | 'honte';
export type Action =
  | { kind: 'sit'; t0: number; t1: number; seat: V3; heading: number }
  | { kind: 'standUp'; t0: number; t1: number }
  | { kind: 'walkTo'; t0: number; t1: number; to: [number, number] }
  | { kind: 'turnTo'; t0: number; t1: number; heading: number }
  | { kind: 'arm'; t0: number; t1: number; side: 'l' | 'r' | 'both'; mode: ArmMode; target?: V3 }
  | { kind: 'emotion'; t0: number; t1: number; emotion: Emotion }
  | { kind: 'look'; t0: number; t1: number; at: V3 };
export interface Script {
  start: { pos: [number, number]; heading: number };
  actions: Action[];
}
export interface Face {
  smile: number;
  frown: number;
  browUp: number;
  browAngry: number;
  mouthOpen: number;
  blink: number;
}
export interface Frame {
  t: number;
  pose: Pose;
  world: WorldPose;
  face: Face;
  emotion: Emotion;
}
/** Body posture of each emotion: spine lean (rad, + forward), chest lift, head pitch (+ down), shoulder raise. */
const POSTURE: Record<Emotion, { lean: number; head: number; shoulders: number; tempo: number }> = {
  neutre: { lean: 0.02, head: 0, shoulders: 0, tempo: 1 },
  joie: { lean: -0.05, head: -0.12, shoulders: 0.05, tempo: 1.3 },
  colère: { lean: 0.18, head: 0.08, shoulders: 0.12, tempo: 1.4 },
  tristesse: { lean: 0.3, head: 0.35, shoulders: -0.08, tempo: 0.6 },
  peur: { lean: -0.08, head: 0.1, shoulders: 0.25, tempo: 1.5 },
  surprise: { lean: -0.12, head: -0.15, shoulders: 0.18, tempo: 1.2 },
  fierté: { lean: -0.1, head: -0.15, shoulders: -0.04, tempo: 0.9 },
  mépris: { lean: -0.06, head: -0.2, shoulders: 0, tempo: 0.8 },
  honte: { lean: 0.22, head: 0.45, shoulders: 0.1, tempo: 0.7 },
};
const FACE: Record<Emotion, Omit<Face, 'blink' | 'mouthOpen'>> = {
  neutre: { smile: 0.1, frown: 0, browUp: 0, browAngry: 0 },
  joie: { smile: 1, frown: 0, browUp: 0.4, browAngry: 0 },
  colère: { smile: 0, frown: 0.7, browUp: 0, browAngry: 1 },
  tristesse: { smile: 0, frown: 0.9, browUp: 0.7, browAngry: 0 },
  peur: { smile: 0, frown: 0.5, browUp: 1, browAngry: 0 },
  surprise: { smile: 0, frown: 0, browUp: 1, browAngry: 0 },
  fierté: { smile: 0.6, frown: 0, browUp: 0, browAngry: 0.1 },
  mépris: { smile: 0.35, frown: 0.2, browUp: 0.2, browAngry: 0.3 },
  honte: { smile: 0, frown: 0.6, browUp: 0.5, browAngry: 0 },
};
const ANKLE_H = 0.07;
const STAND_H = 0.93;
const SEAT_H = 0.55;
const fwd = (h: number): V3 => [Math.sin(h), 0, Math.cos(h)];
const rightOf = (h: number): V3 => [-Math.cos(h), 0, Math.sin(h)];
/** Shortest signed angle difference. */
const dAng = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

interface Foot {
  pos: V3;
  heading: number;
  swing: { from: V3; to: V3; h0: number; h1: number; t0: number; dur: number } | null;
}

export class Actor {
  private feet: Record<'l' | 'r', Foot>;
  private lastStep = -1;
  constructor(private script: Script) {
    const p = this.rootAt(0);
    this.feet = {
      l: { pos: this.footHome('l', p.pos, p.heading), heading: p.heading, swing: null },
      r: { pos: this.footHome('r', p.pos, p.heading), heading: p.heading, swing: null },
    };
  }
  private acts<K extends Action['kind']>(kind: K): Extract<Action, { kind: K }>[] {
    return this.script.actions.filter((a) => a.kind === kind) as Extract<Action, { kind: K }>[];
  }
  /** Where the pelvis is (ground x/z), its heading and how « seated » the actor is (1 = seated, 0 = standing). */
  rootAt(t: number): { pos: V3; heading: number; seated: number; rise: number } {
    let x = this.script.start.pos[0];
    let z = this.script.start.pos[1];
    let heading = this.script.start.heading;
    let seated = 0;
    let rise = 0;
    const timeline = [...this.script.actions].sort((a, b) => a.t0 - b.t0);
    for (const a of timeline) {
      if (a.t0 > t) break;
      const k = smooth((t - a.t0) / Math.max(1e-6, a.t1 - a.t0));
      if (a.kind === 'walkTo') {
        const dx = a.to[0] - x;
        const dz = a.to[1] - z;
        // The body faces where it walks (turns within the first steps).
        const dir = Math.atan2(dx, dz);
        if (Math.hypot(dx, dz) > 0.05) heading = heading + dAng(heading, dir) * ramp(t, a.t0, a.t0 + 0.5);
        // Constant cruising speed with soft start / stop.
        const u = t >= a.t1 ? 1 : easeWalk((t - a.t0) / (a.t1 - a.t0));
        x += dx * u;
        z += dz * u;
      } else if (a.kind === 'turnTo') heading = heading + dAng(heading, a.heading) * k;
      else if (a.kind === 'sit') {
        x = a.seat[0];
        z = a.seat[2];
        heading = a.heading;
        seated = t < a.t1 ? 1 : seated;
      } else if (a.kind === 'standUp') {
        rise = clamp((t - a.t0) / (a.t1 - a.t0), 0, 1);
        seated = t < a.t1 ? 1 - smooth(rise) * 0 : 0;
        // Pelvis travels forward over the feet while rising.
        const f = fwd(heading);
        const travel = 0.4 * smooth(clamp((rise - 0.15) / 0.75, 0, 1));
        x += f[0] * travel;
        z += f[2] * travel;
        if (t >= a.t1) seated = 0;
      }
    }
    return { pos: [x, 0, z], heading, seated, rise };
  }
  private footHome(s: 'l' | 'r', pelvis: V3, heading: number): V3 {
    const r = rightOf(heading);
    const k = s === 'l' ? -1 : 1;
    return [pelvis[0] + r[0] * 0.1 * k, ANKLE_H, pelvis[2] + r[2] * 0.1 * k];
  }
  private activeArm(t: number, s: 'l' | 'r') {
    let best: { mode: ArmMode; w: number; target?: V3; age: number } | null = null;
    for (const a of this.acts('arm')) {
      if (a.side !== s && a.side !== 'both') continue;
      const w = win(t, a.t0, a.t1, 0.5);
      if (w > 0 && (!best || w > best.w)) best = { mode: a.mode, w, ...(a.target ? { target: a.target } : {}), age: t - a.t0 };
    }
    return best;
  }
  private emotionAt(t: number): { e: Emotion; w: number; prev: Emotion } {
    let e: Emotion = 'neutre';
    let w = 0;
    for (const a of this.acts('emotion')) {
      const k = win(t, a.t0, a.t1, 0.6);
      if (k > w) {
        w = k;
        e = a.emotion;
      }
    }
    return { e, w, prev: 'neutre' };
  }
  private lookTarget(t: number, head: V3, heading: number): { at: V3; w: number } {
    let at = add(head, scale(fwd(heading), 3));
    let w = 0;
    for (const a of this.acts('look')) {
      const k = win(t, a.t0, a.t1, 0.5);
      if (k > w) {
        w = k;
        at = a.at;
      }
    }
    return { at, w };
  }

  /** The pose at time t (call with increasing t: the feet keep their planted positions between frames). */
  frame(t: number, dt = 1 / 25): Frame {
    const R = this.rootAt(t);
    const prev = this.rootAt(Math.max(0, t - dt));
    const vel = scale(sub(R.pos, prev.pos), 1 / dt);
    const sitA = this.acts('sit')[0];
    const standA = this.acts('standUp')[0];
    const em = this.emotionAt(t);
    const post = POSTURE[em.e];
    const ew = em.w;
    const f = fwd(R.heading);

    // ---- pelvis height & trunk lean (sit-to-stand: lean forward first, then push up) ----
    let pelvisH = STAND_H;
    let lean = POSTURE.neutre.lean + (post.lean - POSTURE.neutre.lean) * ew;
    const seatedNow = sitA && t < (standA?.t0 ?? Infinity) && t >= sitA.t0;
    if (seatedNow) pelvisH = SEAT_H;
    let standing = 1;
    if (standA && t >= standA.t0 && t < standA.t1) {
      const r = R.rise;
      lean += 0.65 * Math.sin(Math.PI * clamp(r / 0.85, 0, 1)) * (r < 0.85 ? 1 : 0);
      pelvisH = SEAT_H + (STAND_H - SEAT_H) * smooth(clamp((r - 0.3) / 0.65, 0, 1));
      standing = 0;
    }
    if (seatedNow) standing = 0;
    // Walking bob + breathing.
    const swingK = Math.max(this.swingProgress('l', t), this.swingProgress('r', t));
    pelvisH += standing * (0.018 * Math.sin(Math.PI * swingK) - (len(vel) > 0.1 ? 0.02 : 0)) + 0.004 * Math.sin(t * 2.2);

    // ---- feet: step planner (standing) or planted in front of the chair (seated / rising) ----
    if (!standing && sitA) {
      for (const s of ['l', 'r'] as const) {
        const k = s === 'l' ? -1 : 1;
        const base = add(sitA.seat, scale(f, 0.42));
        const r = rightOf(R.heading);
        this.feet[s] = { pos: [base[0] + r[0] * 0.12 * k, ANKLE_H, base[2] + r[2] * 0.12 * k], heading: R.heading, swing: null };
      }
    } else this.planSteps(t, R.pos, R.heading, vel);

    // ---- build the pose ----
    const p = restPose();
    const yaw = qAxis([0, 1, 0], R.heading);
    // Pelvis: follows the heading, a little hip sway while walking.
    const sway = standing * 0.06 * Math.sin(Math.PI * swingK) * (this.feet.l.swing ? 1 : -1);
    p.rot[0] = qMul(yaw, qEuler(0, sway, 0));
    p.root = [R.pos[0], pelvisH, R.pos[2]];
    // Spine: lean forward + counter-twist of the chest while walking + breathing.
    const twist = -sway * 1.4;
    for (const [i, k] of [['spine1', 0.35], ['spine2', 0.35], ['spine3', 0.3]] as const) p.rot[jointIndex(i)] = qEuler(lean * k + 0.01 * Math.sin(t * 2.2), twist * k, 0);
    let w = fk(p);

    // Legs: IK to the feet, knees towards the toes.
    for (const s of ['l', 'r'] as const) {
      const ft = this.footPos(s, t);
      const hip = w.pos[jointIndex(`${s}_hip`)]!;
      const knPole = add(add(hip, scale(fwd(this.feet[s].heading), 1.2)), [0, -0.3, 0]);
      w = twoBoneIK(p, w, `${s}_hip`, `${s}_knee`, `${s}_ankle`, ft, knPole);
      // Foot flat on the ground, pointing where it stepped (toes lift during the swing).
      const lift = this.feet[s].swing ? 0.25 * Math.sin(Math.PI * this.swingProgress(s, t)) : 0;
      w = setWorldRot(p, w, `${s}_ankle`, qMul(qAxis([0, 1, 0], this.footHeading(s, t)), qAxis([1, 0, 0], -lift)));
    }

    // Shoulders (shrug / emotion).
    const shrugW = Math.max(this.armWeight(t, 'shrug'), 0);
    const sh = post.shoulders * ew + 0.22 * shrugW;
    p.rot[jointIndex('l_collar')] = qEuler(0, 0, sh);
    p.rot[jointIndex('r_collar')] = qEuler(0, 0, -sh);
    w = fk(p);

    // Arms: hanging + walk swing, blended with the acting modes (targets are blended, so motions stay continuous).
    for (const s of ['l', 'r'] as const) w = this.solveArm(p, w, s, t, R, vel);

    // Head: emotion pitch + look-at.
    const hp = POSTURE.neutre.head + (post.head - POSTURE.neutre.head) * ew;
    p.rot[jointIndex('neck')] = qEuler(hp * 0.4, 0, 0);
    p.rot[jointIndex('head')] = qEuler(hp * 0.6, 0, 0);
    w = fk(p);
    const headPos = w.pos[jointIndex('head')]!;
    const look = this.lookTarget(t, headPos, R.heading);
    if (look.w > 0.01) lookAt(p, w, look.at, look.w);

    const limited = applyLimits(p);
    // Limits only for spine / neck / head (IK limbs are already anatomical).
    for (const n of ['spine1', 'spine2', 'spine3', 'neck', 'head']) p.rot[jointIndex(n)] = limited.rot[jointIndex(n)]!;
    w = fk(p);

    // Face.
    const fx = FACE[em.e];
    const neutral = FACE.neutre;
    const mix = (a: number, b: number) => a + (b - a) * ew;
    const blinkPh = (t % 3.4) / 0.14;
    const face: Face = {
      smile: mix(neutral.smile, fx.smile),
      frown: mix(neutral.frown, fx.frown),
      browUp: mix(neutral.browUp, fx.browUp),
      browAngry: mix(neutral.browAngry, fx.browAngry),
      mouthOpen: Math.max(this.armWeight(t, 'wave') * 0.5, em.e === 'surprise' || em.e === 'colère' ? 0.5 * ew * (0.6 + 0.4 * Math.sin(t * 9)) : 0),
      blink: blinkPh < 1 ? Math.sin(blinkPh * Math.PI) : 0,
    };
    return { t, pose: p, world: w, face, emotion: em.e };
  }

  private armWeight(t: number, mode: ArmMode) {
    let w = 0;
    for (const a of this.acts('arm')) if (a.mode === mode) w = Math.max(w, win(t, a.t0, a.t1, 0.5));
    return w;
  }
  private solveArm(p: Pose, w: WorldPose, s: 'l' | 'r', t: number, R: { heading: number }, vel: V3): WorldPose {
    const k = s === 'l' ? 1 : -1;
    const f = fwd(R.heading);
    const r = rightOf(R.heading);
    const out = scale(r, -k); // towards this arm's side
    const shoulder = w.pos[jointIndex(`${s}_shoulder`)]!;
    const pelvis = w.pos[0]!;
    // Rest: arm hanging, elbow slightly bent; walking swing opposite to the same-side leg.
    const other = s === 'l' ? 'r' : 'l';
    const legFwd = this.feet[other].swing ? Math.sin(Math.PI * this.swingProgress(other, t)) : -0.3;
    const swing = clamp(len(vel) / 0.6, 0, 1) * 0.22 * legFwd;
    let target = add(add(add(shoulder, [0, -0.47, 0]), scale(out, 0.07)), scale(f, 0.06 + swing));
    let pole = add(add(shoulder, scale(f, -0.6)), scale(out, 0.3));
    const act = this.activeArm(t, s);
    if (act) {
      let tgt = target;
      let pl = pole;
      switch (act.mode) {
        case 'wave': {
          const osc = Math.sin(act.age * 9);
          tgt = add(add(add(shoulder, [0, 0.3, 0]), scale(out, 0.26 + 0.09 * osc)), scale(f, 0.12));
          pl = add(add(shoulder, scale(out, 0.4)), [0, -0.6, 0]);
          break;
        }
        case 'point': {
          const at = act.target ?? add(shoulder, scale(f, 2));
          // A small jab on the accent (anticipation back, then forward).
          const jab = 0.05 * Math.sin(Math.min(1, act.age / 0.35) * Math.PI) + 0.02 * Math.sin(act.age * 6);
          tgt = add(shoulder, scale(norm(sub(at, shoulder)), 0.46 + jab));
          pl = add(add(shoulder, [0, -0.5, 0]), scale(out, 0.3));
          break;
        }
        case 'shrug':
          tgt = add(add(add(shoulder, [0, -0.32, 0]), scale(out, 0.3)), scale(f, 0.2));
          pl = add(add(shoulder, scale(out, 0.2)), [0, -0.5, -0.2]);
          break;
        case 'akimbo':
          tgt = add(add(add(pelvis, [0, 0.06, 0]), scale(out, 0.17)), scale(f, -0.02));
          pl = add(add(shoulder, scale(out, 0.8)), scale(f, -0.2));
          break;
        case 'cross':
          tgt = add(add(add(shoulder, [0, -0.3, 0]), scale(out, -0.3)), scale(f, 0.2));
          pl = add(add(shoulder, scale(out, 0.4)), [0, -0.5, 0]);
          break;
        case 'raise':
          tgt = add(add(shoulder, [0, 0.5, 0]), scale(out, 0.1));
          pl = add(shoulder, scale(out, 0.6));
          break;
        case 'facepalm': {
          const head = w.pos[jointIndex('head')]!;
          tgt = add(add(head, [0, 0.1, 0]), scale(f, 0.14));
          pl = add(add(shoulder, scale(out, 0.3)), [0, -0.6, 0]);
          break;
        }
      }
      target = lerp3(target, tgt, act.w);
      pole = lerp3(pole, pl, act.w);
    }
    twoBoneIK(p, w, `${s}_shoulder`, `${s}_elbow`, `${s}_wrist`, target, pole);
    // Hand: follows the forearm; fingers: index straight when pointing, relaxed curl otherwise.
    const pointing = act && act.mode === 'point' ? act.w : 0;
    const curl = (1 - pointing) * 0.7;
    const bend = (a: number): Q => qEuler(0, 0, -k * a);
    p.rot[jointIndex(`${s}_index1`)] = bend(curl * 0.9);
    p.rot[jointIndex(`${s}_index2`)] = bend(curl * 1.0);
    p.rot[jointIndex(`${s}_index3`)] = bend(curl * 0.7);
    p.rot[jointIndex(`${s}_thumb1`)] = bend(0.3 + pointing * 0.4);
    // Palm: up for the shrug, forward for the wave.
    const palm = act ? (act.mode === 'shrug' ? -k * 1.4 : act.mode === 'wave' ? k * 0.0 : 0) * act.w : 0;
    p.rot[jointIndex(`${s}_wrist`)] = qMul(p.rot[jointIndex(`${s}_wrist`)]!, qEuler(palm, 0, 0));
    return fk(p);
  }

  // ---- step planner ----
  private swingProgress(s: 'l' | 'r', t: number) {
    const sw = this.feet[s].swing;
    return sw ? clamp((t - sw.t0) / sw.dur, 0, 1) : 0;
  }
  private footPos(s: 'l' | 'r', t: number): V3 {
    const ft = this.feet[s];
    if (!ft.swing) return ft.pos;
    const u = this.swingProgress(s, t);
    const e = smooth(u);
    const p = lerp3(ft.swing.from, ft.swing.to, e);
    return [p[0], ANKLE_H + 0.1 * Math.sin(Math.PI * u), p[2]];
  }
  private footHeading(s: 'l' | 'r', t: number) {
    const ft = this.feet[s];
    if (!ft.swing) return ft.heading;
    return ft.swing.h0 + dAng(ft.swing.h0, ft.swing.h1) * smooth(this.swingProgress(s, t));
  }
  private planSteps(t: number, pelvis: V3, heading: number, vel: V3) {
    // Finish swings.
    for (const s of ['l', 'r'] as const) {
      const ft = this.feet[s];
      if (ft.swing && t >= ft.swing.t0 + ft.swing.dur) this.feet[s] = { pos: ft.swing.to, heading: ft.swing.h1, swing: null };
    }
    if (this.feet.l.swing || this.feet.r.swing || t - this.lastStep < 0.04) return;
    const speed = len(vel);
    const dur = speed > 0.2 ? 0.34 : 0.3;
    // The foot that is furthest from where it should be steps first.
    const err = (s: 'l' | 'r') => {
      const home = add(this.footHome(s, pelvis, heading), scale(vel, dur * 1.6));
      return { s, home, d: len(sub(home, this.feet[s].pos)), a: Math.abs(dAng(this.feet[s].heading, heading)) };
    };
    const c = [err('l'), err('r')].sort((a, b) => b.d + b.a * 0.3 - (a.d + a.a * 0.3))[0]!;
    if (c.d > 0.08 || c.a > 0.3) {
      this.feet[c.s] = { ...this.feet[c.s], swing: { from: this.feet[c.s].pos, to: [c.home[0], ANKLE_H, c.home[2]], h0: this.feet[c.s].heading, h1: heading, t0: t, dur } };
      this.lastStep = t;
    }
  }
}
/** Walk progress with a soft start and stop (accelerate over 15 %, cruise, decelerate). */
function easeWalk(u: number): number {
  const a = 0.15;
  const x = clamp(u, 0, 1);
  // Piecewise: quadratic ease-in, linear cruise, quadratic ease-out; normalised to reach 1.
  const vmax = 1 / (1 - a);
  if (x < a) return (vmax * x * x) / (2 * a);
  if (x > 1 - a) return 1 - (vmax * (1 - x) * (1 - x)) / (2 * a);
  return (vmax * a) / 2 + vmax * (x - a);
}
/** Runs a script into frames (fps). */
export function perform(script: Script, seconds: number, fps = 25): Frame[] {
  const a = new Actor(script);
  const out: Frame[] = [];
  for (let i = 0; i <= Math.round(seconds * fps); i++) out.push(a.frame(i / fps, 1 / fps));
  return out;
}
/** Handy: world-space quaternion of a joint as a plain object (for exporters). */
export const qOf = (q: Q) => ({ x: q[0], y: q[1], z: q[2], w: q[3] });
export { qRot };
