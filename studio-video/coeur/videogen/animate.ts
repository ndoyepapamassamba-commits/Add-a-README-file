// CERVEAU D'ANIMATION — un seul calcul, deux moteurs : pour chaque image, la pose de chaque personnage (squelette
// articulé : quaternions par articulation, relatifs au parent), sa position et son orientation au sol, son expression
// (bouche, sourcils), la caméra (position, cible, focale) et les titres visibles. Blender applique ces images clés à
// son rig, l'aperçu WebGL à la même hiérarchie : le rendu final et l'aperçu racontent exactement la même chose.
// Repère du plan : x à droite, y vers le haut, z vers la caméra par défaut ; mètres ; secondes. Pur et déterministe.
import type { Action, Character, ScenePlan, Shot } from './plan';

export type Quat = [number, number, number, number]; // w, x, y, z
export type Vec3 = [number, number, number];

/** The articulated rig: joints, parent, rest offset (for a 1 m tall body — scaled by the height). */
export interface JointDef {
  name: string;
  parent: string | null;
  offset: Vec3;
}
export const HUMAN_RIG: JointDef[] = [
  { name: 'hips', parent: null, offset: [0, 0.52, 0] },
  { name: 'spine', parent: 'hips', offset: [0, 0.08, 0] },
  { name: 'chest', parent: 'spine', offset: [0, 0.14, 0] },
  { name: 'neck', parent: 'chest', offset: [0, 0.09, 0] },
  { name: 'head', parent: 'neck', offset: [0, 0.05, 0] },
  { name: 'shoulder_l', parent: 'chest', offset: [0.11, 0.07, 0] },
  { name: 'elbow_l', parent: 'shoulder_l', offset: [0, -0.17, 0] },
  { name: 'wrist_l', parent: 'elbow_l', offset: [0, -0.15, 0] },
  { name: 'shoulder_r', parent: 'chest', offset: [-0.11, 0.07, 0] },
  { name: 'elbow_r', parent: 'shoulder_r', offset: [0, -0.17, 0] },
  { name: 'wrist_r', parent: 'elbow_r', offset: [0, -0.15, 0] },
  { name: 'hip_l', parent: 'hips', offset: [0.055, -0.02, 0] },
  { name: 'knee_l', parent: 'hip_l', offset: [0, -0.24, 0] },
  { name: 'ankle_l', parent: 'knee_l', offset: [0, -0.24, 0] },
  { name: 'hip_r', parent: 'hips', offset: [-0.055, -0.02, 0] },
  { name: 'knee_r', parent: 'hip_r', offset: [0, -0.24, 0] },
  { name: 'ankle_r', parent: 'knee_r', offset: [0, -0.24, 0] },
];
export const ANIMAL_RIG: JointDef[] = [
  { name: 'body', parent: null, offset: [0, 0.62, 0] },
  { name: 'neck', parent: 'body', offset: [0, 0.08, 0.32] },
  { name: 'head', parent: 'neck', offset: [0, 0.14, 0.08] },
  { name: 'tail', parent: 'body', offset: [0, 0.04, -0.34] },
  { name: 'leg_fl', parent: 'body', offset: [0.12, -0.06, 0.26] },
  { name: 'leg_fr', parent: 'body', offset: [-0.12, -0.06, 0.26] },
  { name: 'leg_bl', parent: 'body', offset: [0.12, -0.06, -0.26] },
  { name: 'leg_br', parent: 'body', offset: [-0.12, -0.06, -0.26] },
];
export const rigOf = (c: Pick<Character, 'kind'>) => (c.kind === 'animal' ? ANIMAL_RIG : HUMAN_RIG);

// ── small math ────────────────────────────────────────────────────────────────────────────────────────────────────
const D = Math.PI / 180;
export function qAxis(ax: Vec3, ang: number): Quat {
  const s = Math.sin(ang / 2);
  return [Math.cos(ang / 2), ax[0] * s, ax[1] * s, ax[2] * s];
}
export function qMul(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}
/** Joint rotation from three angles in degrees: pitch (forward swing, about x), yaw (about y), roll (about z). */
export function qJoint(pitch = 0, yaw = 0, roll = 0): Quat {
  return qMul(qMul(qAxis([0, 1, 0], yaw * D), qAxis([1, 0, 0], -pitch * D)), qAxis([0, 0, 1], roll * D));
}
const ID: Quat = [1, 0, 0, 0];
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const rq = (q: Quat): Quat => [r4(q[0]), r4(q[1]), r4(q[2]), r4(q[3])];

export interface Pose {
  joints: Record<string, Quat>;
  /** Extra lift of the hips / body (m, before scaling by the height). */
  lift: number;
  /** Mouth: open 0..1, smile −1..1 ; brows: −1 (sad) .. 1 (surprised / angry raise). */
  mouth: [number, number];
  brows: number;
}

/** The pose of an action at time `t` (s since the action started) — cycles are periodic, one-shots are eased. */
export function actionPose(kind: Character['kind'], action: Action, t: number, dur: number, emotion: string): Pose {
  const animal = kind === 'animal';
  const w = 2 * Math.PI;
  const j: Record<string, Quat> = {};
  let lift = 0;
  const emo: Record<string, [number, number, number]> = { happy: [0.15, 0.9, 0.3], sad: [0, -0.7, -0.8], surprised: [0.8, 0, 1], angry: [0.2, -0.5, -0.6], thinking: [0, 0.1, 0.4], neutral: [0, 0.2, 0] };
  const [mo, sm, br] = emo[emotion] ?? emo.neutral!;
  let mouth: [number, number] = [mo, sm];
  if (animal) {
    const speed = action === 'run' ? 2.4 : action === 'walk' ? 1.4 : 0;
    const s = Math.sin(w * speed * t);
    if (speed) {
      j.leg_fl = qJoint(28 * s);
      j.leg_br = qJoint(28 * s);
      j.leg_fr = qJoint(-28 * s);
      j.leg_bl = qJoint(-28 * s);
      lift = 0.02 * Math.abs(Math.cos(w * speed * t));
    }
    j.tail = qJoint(20 + 10 * Math.sin(w * 1.5 * t), 25 * Math.sin(w * 2 * t));
    j.head = qJoint(action === 'look' ? 0 : 6 * Math.sin(w * 0.5 * t), action === 'look' ? 35 * Math.sin(w * 0.25 * t) : 0);
    if (action === 'jump' || action === 'celebrate') lift = 0.35 * Math.max(0, Math.sin(Math.PI * ((t % 0.9) / 0.9)));
    if (action === 'sit') {
      j.body = qJoint(-18);
      j.leg_bl = qJoint(70);
      j.leg_br = qJoint(70);
      lift = -0.12;
    }
    return { joints: j, lift, mouth: action === 'talk' ? [0.6 * Math.abs(Math.sin(w * 3 * t)), sm] : mouth, brows: br };
  }
  // Breathing everywhere.
  j.chest = qJoint(1.5 * Math.sin(w * 0.25 * t));
  const arms = (l: number, r: number, le = 0, re = 0) => {
    j.shoulder_l = qJoint(l, 0, 6);
    j.shoulder_r = qJoint(r, 0, -6);
    j.elbow_l = qJoint(le);
    j.elbow_r = qJoint(re);
  };
  switch (action) {
    case 'walk':
    case 'run': {
      const f = action === 'run' ? 1.6 : 1.0;
      const a = action === 'run' ? 1.5 : 1;
      const s = Math.sin(w * f * t);
      j.hip_l = qJoint(28 * a * s);
      j.hip_r = qJoint(-28 * a * s);
      j.knee_l = qJoint(-Math.max(0, -s) * 45 * a - 5);
      j.knee_r = qJoint(-Math.max(0, s) * 45 * a - 5);
      arms(-24 * a * s, 24 * a * s, 15 * a, 15 * a);
      j.spine = qJoint(action === 'run' ? 10 : 2);
      j.hips = qJoint(0, 5 * s);
      lift = 0.018 * a * Math.abs(Math.cos(w * f * t));
      break;
    }
    case 'wave': {
      arms(0, 0, 5, 5);
      j.shoulder_r = qJoint(0, 0, -150);
      j.elbow_r = qJoint(0, 0, 25 * Math.sin(w * 2 * t));
      j.head = qJoint(0, 0, 6);
      mouth = [mo, Math.max(sm, 0.7)];
      break;
    }
    case 'point':
      arms(0, 85 * ease(t / 0.4), 5, 0);
      j.head = qJoint(-5, -10);
      break;
    case 'talk': {
      const g = Math.sin(w * 0.7 * t);
      arms(10 + 15 * Math.max(0, g), 10 + 15 * Math.max(0, -g), 50 + 20 * g, 50 - 20 * g);
      j.head = qJoint(4 * Math.sin(w * 1.3 * t), 6 * Math.sin(w * 0.4 * t));
      mouth = [0.15 + 0.5 * Math.abs(Math.sin(w * 3.1 * t)) * Math.abs(Math.sin(w * 0.9 * t)), sm];
      break;
    }
    case 'dance': {
      const s = Math.sin(w * 1.2 * t);
      j.hips = qJoint(0, 20 * s, 8 * s);
      j.spine = qJoint(0, -10 * s, -6 * s);
      j.shoulder_l = qJoint(30, 0, 100 + 40 * s);
      j.shoulder_r = qJoint(30, 0, -100 + 40 * s);
      j.elbow_l = qJoint(40 + 20 * s);
      j.elbow_r = qJoint(40 - 20 * s);
      j.hip_l = qJoint(15 * Math.max(0, s));
      j.knee_l = qJoint(-25 * Math.max(0, s));
      j.hip_r = qJoint(15 * Math.max(0, -s));
      j.knee_r = qJoint(-25 * Math.max(0, -s));
      lift = 0.04 * Math.abs(s);
      mouth = [0.3, 0.9];
      break;
    }
    case 'jump':
    case 'celebrate': {
      const p = (t % 1.1) / 1.1;
      const up = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (p - 0.25) / 0.6))));
      const crouch = p < 0.25 ? Math.sin((Math.PI * p) / 0.25) : 0;
      lift = (action === 'jump' ? 0.45 : 0.25) * up - 0.08 * crouch;
      j.hip_l = qJoint(35 * crouch + 10 * up);
      j.hip_r = qJoint(35 * crouch + 10 * up);
      j.knee_l = qJoint(-60 * crouch - 20 * up);
      j.knee_r = qJoint(-60 * crouch - 20 * up);
      if (action === 'celebrate') {
        j.shoulder_l = qJoint(0, 0, 160);
        j.shoulder_r = qJoint(0, 0, -160);
        j.elbow_l = qJoint(10);
        j.elbow_r = qJoint(10);
        mouth = [0.6, 1];
      } else arms(-30 * crouch + 60 * up, -30 * crouch + 60 * up, 20, 20);
      break;
    }
    case 'clap': {
      const c = Math.abs(Math.sin(w * 1.8 * t));
      j.shoulder_l = qJoint(55, -25 * c, 10);
      j.shoulder_r = qJoint(55, 25 * c, -10);
      j.elbow_l = qJoint(60, 30 * c);
      j.elbow_r = qJoint(60, -30 * c);
      mouth = [0.2, 0.9];
      break;
    }
    case 'sit': {
      const k = ease(t / 0.6);
      lift = -0.2 * k;
      j.hip_l = qJoint(85 * k);
      j.hip_r = qJoint(85 * k);
      j.knee_l = qJoint(-88 * k);
      j.knee_r = qJoint(-88 * k);
      arms(20 * k, 20 * k, 40 * k, 40 * k);
      break;
    }
    case 'bow': {
      const k = Math.sin(Math.PI * Math.min(1, t / Math.min(dur, 2)));
      j.spine = qJoint(35 * k);
      j.chest = qJoint(15 * k);
      arms(-5, -5);
      break;
    }
    case 'look':
      j.head = qJoint(0, 50 * Math.sin(w * 0.2 * t));
      j.chest = qJoint(0, 15 * Math.sin(w * 0.2 * t));
      arms(0, 0, 5, 5);
      break;
    case 'fall': {
      const k = ease(t / 0.8);
      j.hips = qJoint(-80 * k);
      lift = -0.42 * k;
      arms(-60 * k, -50 * k, 20, 20);
      mouth = [0.7, -0.2];
      break;
    }
    case 'turn':
    case 'idle':
    default:
      arms(2 * Math.sin(w * 0.3 * t), -2 * Math.sin(w * 0.3 * t), 6, 6);
      j.head = qJoint(2 * Math.sin(w * 0.2 * t), 4 * Math.sin(w * 0.13 * t));
  }
  if (emotion === 'sad') j.neck = qMul(j.neck ?? ID, qJoint(12));
  if (emotion === 'thinking') j.neck = qMul(j.neck ?? ID, qJoint(-6, 0, 8));
  return { joints: j, lift, mouth, brows: br };
}

export interface CharFrame {
  pos: Vec3;
  yaw: number; // radians about y (0 = facing +z, toward the default camera)
  joints: Record<string, Quat>;
  mouth: [number, number];
  brows: number;
}
export interface CamFrame {
  pos: Vec3;
  target: Vec3;
  lens: number;
  shot: number;
}
export interface Baked {
  fps: number;
  frames: number;
  chars: Record<string, CharFrame[]>;
  cams: CamFrame[];
  titles: { text: string; f0: number; f1: number; position: 'center' | 'bottom' | 'top'; caption?: boolean }[];
}

interface Segment {
  t0: number;
  t1: number;
  action: Action;
  emotion: string;
  from: [number, number];
  to: [number, number];
  yaw0: number;
  yaw1: number;
}
/** The timeline of a character: its actions laid end to end across the shots, positions and headings carried over. */
export function segmentsOf(plan: ScenePlan, c: Character): Segment[] {
  let pos: [number, number] = [c.start[0], c.start[1]];
  let yaw = (c.facing * Math.PI) / 180;
  const out: Segment[] = [];
  const shots = [...plan.shots].sort((a, b) => a.start - b.start);
  for (const s of shots) {
    const acts = s.actions.filter((a) => a.who === c.id).sort((a, b) => a.at - b.at);
    let t = s.start;
    const end = s.start + s.duration;
    for (const a of acts) {
      const t0 = Math.max(t, s.start + a.at);
      if (t0 > t) out.push({ t0: t, t1: t0, action: 'idle', emotion: 'neutral', from: pos, to: pos, yaw0: yaw, yaw1: yaw });
      const t1 = Math.min(end, t0 + (a.duration ?? end - t0));
      const moving = a.action === 'walk' || a.action === 'run';
      const to: [number, number] = moving ? (a.to ?? [pos[0], pos[1] + (a.action === 'run' ? 3 : 1.6)]) : pos;
      const dx = to[0] - pos[0];
      const dz = to[1] - pos[1];
      const yaw1 = moving && Math.hypot(dx, dz) > 0.05 ? Math.atan2(dx, dz) : a.action === 'turn' ? yaw + Math.PI : yaw;
      out.push({ t0, t1, action: a.action, emotion: a.emotion, from: pos, to, yaw0: yaw, yaw1 });
      pos = to;
      yaw = moving ? yaw1 : a.action === 'turn' ? yaw1 : yaw;
      t = t1;
    }
    if (t < end) out.push({ t0: t, t1: end, action: 'idle', emotion: 'neutral', from: pos, to: pos, yaw0: yaw, yaw1: yaw });
  }
  return out;
}

function charAt(plan: ScenePlan, c: Character, segs: Segment[], t: number): CharFrame {
  const s = segs.find((x) => t >= x.t0 && t < x.t1) ?? segs[segs.length - 1] ?? { t0: 0, t1: plan.seconds, action: 'idle' as Action, emotion: 'neutral', from: c.start, to: c.start, yaw0: 0, yaw1: 0 };
  const k = s.t1 > s.t0 ? Math.min(1, (t - s.t0) / (s.t1 - s.t0)) : 1;
  const moving = s.action === 'walk' || s.action === 'run';
  const mk = moving ? k : ease(k);
  const x = lerp(s.from[0], s.to[0], mk);
  const z = lerp(s.from[1], s.to[1], mk);
  // Turn toward the walking direction in the first 0.4 s, then keep it.
  const yk = moving ? ease(Math.min(1, (t - s.t0) / 0.4)) : s.action === 'turn' ? ease(k) : 1;
  let dy = s.yaw1 - s.yaw0;
  while (dy > Math.PI) dy -= 2 * Math.PI;
  while (dy < -Math.PI) dy += 2 * Math.PI;
  const yaw = s.yaw0 + dy * yk;
  const p = actionPose(c.kind, s.action, t - s.t0, s.t1 - s.t0, s.emotion);
  const h = c.height;
  const joints: Record<string, Quat> = {};
  for (const jd of rigOf(c)) joints[jd.name] = rq(p.joints[jd.name] ?? ID);
  return { pos: [r4(x), r4(p.lift * h), r4(z)], yaw: r4(yaw), joints, mouth: [r4(p.mouth[0]), r4(p.mouth[1])], brows: r4(p.brows) };
}

/** Where a camera target is at time t: a character's chest, or the centre of the cast / the scene. */
function targetAt(plan: ScenePlan, segs: Record<string, Segment[]>, who: string, t: number): Vec3 {
  const c = plan.characters.find((x) => x.id === who);
  if (c) {
    const f = charAt(plan, c, segs[c.id]!, t);
    return [f.pos[0], c.height * 0.72 + f.pos[1], f.pos[2]];
  }
  if (!plan.characters.length) return [0, 1.5, 0];
  const fs = plan.characters.map((x) => charAt(plan, x, segs[x.id]!, t));
  return [fs.reduce((a, f) => a + f.pos[0], 0) / fs.length, 1.1, fs.reduce((a, f) => a + f.pos[2], 0) / fs.length];
}

const HEIGHTS: Record<Shot['camera']['height'], number> = { low: 0.45, eye: 1.55, high: 4.5, aerial: 14 };
/** The camera of a shot at local progress k ∈ [0, 1]: one slow move, eased, around its target. */
export function cameraAt(s: Shot, target: Vec3, k: number, spread: number): { pos: Vec3; target: Vec3 } {
  const e = ease(k);
  const base = Math.max(4.5, spread * 1.6 + 3) * (s.camera.lens / 40) ** 0.6;
  let dist = base;
  let h = HEIGHTS[s.camera.height];
  let ang = 0.18; // radians around the target, 0 = in front (+z)
  const tg: Vec3 = [...target];
  switch (s.camera.move) {
    case 'dolly_in':
      dist = lerp(base * 1.35, base * 0.75, e);
      break;
    case 'dolly_out':
      dist = lerp(base * 0.75, base * 1.35, e);
      break;
    case 'orbit':
      ang = lerp(-0.7, 0.7, e);
      break;
    case 'crane_up':
      h = lerp(0.6, Math.max(h, 5), e);
      break;
    case 'crane_down':
      h = lerp(Math.max(h, 5), 1.2, e);
      break;
    case 'pan_left':
      tg[0] += lerp(2.5, -2.5, e);
      break;
    case 'pan_right':
      tg[0] += lerp(-2.5, 2.5, e);
      break;
    case 'tracking':
      ang = 0.9;
      dist = base * 0.85;
      break;
    case 'aerial_flyover':
      h = lerp(16, 9, e);
      dist = lerp(base * 2.6, base * 1.2, e);
      ang = lerp(-0.3, 0.3, e);
      break;
    case 'push_in_low':
      h = 0.4;
      dist = lerp(base * 1.4, base * 0.6, e);
      break;
    case 'handheld':
      ang = 0.15 + 0.02 * Math.sin(k * 37) + 0.012 * Math.sin(k * 91);
      h += 0.03 * Math.sin(k * 53);
      break;
    case 'static':
    default:
      break;
  }
  return { pos: [tg[0] + Math.sin(ang) * dist, Math.max(0.25, h), tg[2] + Math.cos(ang) * dist], target: tg };
}

/** Everything both engines need, image by image. */
export function bake(plan: ScenePlan, fps = 24): Baked {
  const frames = Math.max(1, Math.round(plan.seconds * fps));
  const segs: Record<string, Segment[]> = Object.fromEntries(plan.characters.map((c) => [c.id, segmentsOf(plan, c)]));
  const chars: Baked['chars'] = Object.fromEntries(plan.characters.map((c) => [c.id, [] as CharFrame[]]));
  const cams: CamFrame[] = [];
  const shots = [...plan.shots].sort((a, b) => a.start - b.start);
  const xs = plan.characters.map((c) => c.start[0]);
  const spread = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    for (const c of plan.characters) chars[c.id]!.push(charAt(plan, c, segs[c.id]!, t));
    const si = Math.max(0, shots.findIndex((s, i) => t >= s.start && (t < s.start + s.duration || i === shots.length - 1)));
    const s = shots[si]!;
    const k = Math.min(1, Math.max(0, (t - s.start) / s.duration));
    const target = targetAt(plan, segs, s.camera.target, t);
    const cam = cameraAt(s, target, k, s.camera.target === 'scene' ? spread : 0);
    cams.push({ pos: cam.pos.map(r4) as Vec3, target: cam.target.map(r4) as Vec3, lens: s.camera.lens, shot: si });
  }
  const fr = (sec: number) => Math.max(0, Math.min(frames - 1, Math.round(sec * fps)));
  const titles: Baked['titles'] = [
    ...plan.titles.map((x) => ({ text: x.text, f0: fr(x.start), f1: fr(x.start + x.duration), position: x.position })),
    ...shots.filter((s) => s.caption).map((s) => ({ text: s.caption!, f0: fr(s.start + 0.2), f1: fr(s.start + s.duration - 0.1), position: 'bottom' as const, caption: true })),
  ];
  return { fps, frames, chars, cams, titles };
}
