// SCÈNE COMMUNE — le décor, les personnages et la lumière d'un plan, décrits UNE fois en primitives (sphère,
// cylindre, cône, boîte, plan) avec leurs matériaux : le moteur HTML/WebGL (aperçu et MP4 rapide) et Blender (rendu
// haute qualité) instancient exactement la même liste. Même graine, même placement, mêmes couleurs : décors stables et
// identités visuelles conservées d'un moteur à l'autre et d'un rendu à l'autre (cohérence exigée par le cahier des
// charges « MASSAMBA CINEMA ENGINE »). Repère du plan : x à droite, y vers le haut, z vers la caméra. Pur.
import type { Quat, Vec3 } from './animate';
import { qAxis, qMul } from './animate';
import type { Character, ScenePlan } from './plan';

export interface MatSpec {
  color: string;
  rough: number;
  metal: number;
  emit: number;
}
export type Shape = 'sphere' | 'cyl' | 'cone' | 'box' | 'plane';
export interface Prim {
  shape: Shape;
  pos: Vec3;
  /** Full extents along x, y, z (diameters for round shapes). */
  size: Vec3;
  quat?: Quat;
  mat: MatSpec;
  /** Low-poly look: few segments. */
  seg?: number;
  /** For character parts: the joint they hang from, and their role in the face. */
  joint?: string;
  face?: 'mouth' | 'brow_l' | 'brow_r';
  /** Shadows: decorative far objects do not cast. */
  cast?: boolean;
}
export interface LightSpec {
  kind: 'sun' | 'area' | 'point';
  pos: Vec3;
  target: Vec3;
  color: string;
  /** Relative power 0..1 (each engine maps it to its own units). */
  power: number;
}
export interface SceneSpec {
  sky: string;
  skyStrength: number;
  fog: number;
  interior: boolean;
  lights: LightSpec[];
  world: Prim[];
  cast: { id: string; kind: Character['kind']; height: number; parts: Prim[] }[];
}

// Seeded PRNG (mulberry32): the same plan always gives the same set.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s: string) => [...s].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
const M = (color: string, rough = 0.7, metal = 0, emit = 0): MatSpec => ({ color, rough, metal, emit });
const rotY = (a: number): Quat => qAxis([0, 1, 0], a);
const rotX = (a: number): Quat => qAxis([1, 0, 0], a);
const rotZ = (a: number): Quat => qAxis([0, 0, 1], a);

const SKY: Record<string, string> = { dawn: '#f2b8a2', day: '#9cc9f0', golden: '#f3c27a', dusk: '#6b5b95', night: '#0c1226' };
const SUN: Record<string, [number, string, number]> = { dawn: [8, '#ffb48a', 0.6], day: [55, '#fff4e5', 1], golden: [14, '#ffc06b', 0.8], dusk: [4, '#ff8f6b', 0.4], night: [35, '#9fb4ff', 0.06] };
/** Clothes that read against every skin tone (the palette of the plan stays for the set). */
export const CLOTHES = ['#1f6feb', '#c1666b', '#2a9d8f', '#e9c46a', '#6d28d9', '#f4f1de', '#264653', '#e76f51'];

function freeRadius(plan: ScenePlan): number {
  const pts: number[] = [0];
  for (const c of plan.characters) pts.push(Math.abs(c.start[0]), Math.abs(c.start[1]));
  for (const s of plan.shots) for (const a of s.actions) if (a.to) pts.push(Math.abs(a.to[0]), Math.abs(a.to[1]));
  return Math.max(8, Math.max(...pts) + 4);
}

function prop(kind: string, x: number, z: number, r: () => number, ctx: { pal: string[]; night: boolean; preset: string; lowpoly: boolean }, color?: string): Prim[] {
  const s = 0.85 + r() * 0.4;
  const pc = () => ctx.pal[Math.floor(r() * ctx.pal.length)]!;
  const seg = ctx.lowpoly ? 7 : undefined;
  const out: Prim[] = [];
  const P = (shape: Shape, pos: Vec3, size: Vec3, mat: MatSpec, quat?: Quat, cast = true) => out.push({ shape, pos, size, mat, quat, seg, cast });
  switch (kind) {
    case 'building': {
      const h = (6 + r() * 18) * (ctx.preset === 'night_city' ? 1.3 : 1);
      const w = 3 + r() * 3;
      const d = 3 + r() * 3;
      P('box', [x, h / 2, z], [w, h, d], M(color ?? pc(), 0.8));
      const win = ctx.night ? '#ffd27a' : '#a9c7e8';
      for (let k = 0; k < Math.floor(h / 3); k++) P('box', [x, 1.5 + k * 3, z + d / 2 + 0.01], [w * 0.8, 0.7, 0.02], M(win, 0.2, 0, ctx.night ? 3 : 0), undefined, false);
      break;
    }
    case 'tree':
    case 'plant': {
      const k = kind === 'plant' ? 0.35 : 1;
      P('cyl', [x, 1.2 * s * k, z], [0.25 * k, 2.4 * s * k, 0.25 * k], M('#6b4a2b', 0.9));
      P('sphere', [x, 3.0 * s * k, z], [2.2 * s * k, 2.0 * s * k, 2.2 * s * k], M(color ?? '#3f7d3a', 0.8));
      break;
    }
    case 'palm': {
      P('cyl', [x, 2.6 * s, z], [0.22, 5.2 * s, 0.22], M('#8a6a43', 0.9), rotZ(0.06));
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        P('cone', [x + Math.cos(a) * 0.9, 5.1 * s, z + Math.sin(a) * 0.9], [0.6, 2.0, 0.15], M(color ?? '#2f8f4e', 0.7), qMul(rotY(-a), rotZ(-1.35)));
      }
      break;
    }
    case 'baobab':
      P('cyl', [x, 2.0 * s, z], [1.6 * s, 4.0 * s, 1.6 * s], M('#9c7a5b', 0.95));
      P('sphere', [x, 4.6 * s, z], [4.2 * s, 1.4 * s, 4.2 * s], M(color ?? '#5d8a3c', 0.85));
      break;
    case 'hut':
      P('cyl', [x, 1.1, z], [3.2, 2.2, 3.2], M('#c49a6c', 0.95));
      P('cone', [x, 3.0, z], [4.0, 1.8, 4.0], M('#d8b46a', 0.95));
      break;
    case 'car': {
      const c = color ?? pc();
      const a = r() * Math.PI;
      const q = rotY(a);
      const rot = (dx: number, dz: number): [number, number] => [x + dx * Math.cos(a) + dz * Math.sin(a), z - dx * Math.sin(a) + dz * Math.cos(a)];
      P('box', [x, 0.55, z], [1.9, 0.7, 4.2], M(c, 0.3, 0.6), q);
      const [cx, cz] = rot(0, -0.2);
      P('box', [cx, 1.1, cz], [1.7, 0.6, 2.2], M('#1b2433', 0.1, 0.2), q);
      for (const dx of [-0.85, 0.85]) for (const dz of [-1.4, 1.4]) {
        const [wx, wz] = rot(dx, dz);
        P('cyl', [wx, 0.35, wz], [0.7, 0.3, 0.7], M('#111111', 0.8), qMul(q, rotZ(Math.PI / 2)));
      }
      break;
    }
    case 'bench':
      P('box', [x, 0.45, z], [1.8, 0.08, 0.5], M('#7a5534', 0.8));
      P('box', [x, 0.22, z], [1.6, 0.44, 0.4], M('#4a4a4a', 0.5, 0.8));
      break;
    case 'lamp':
      P('cyl', [x, 2.0, z], [0.12, 4.0, 0.12], M('#30343b', 0.4, 0.8));
      P('sphere', [x, 4.1, z], [0.5, 0.5, 0.5], M('#fff1c4', 0.2, 0, ctx.night ? 12 : 2), undefined, false);
      break;
    case 'rock':
      P('sphere', [x, 0.3 * s, z], [1.2 * s, 0.7 * s, 0.9 * s], M(color ?? '#8a8174', 0.95), qMul(rotY(r() * 6), rotX(r() * 0.5)));
      break;
    case 'crate':
      P('box', [x, 0.4, z], [0.8, 0.8, 0.8], M('#a0743f', 0.9), rotY(r() * 1.5));
      break;
    case 'desk':
      P('box', [x, 0.75, z], [1.6, 0.06, 0.8], M('#d8cfc0', 0.6));
      for (const dx of [-0.7, 0.7]) P('box', [x + dx, 0.37, z], [0.06, 0.74, 0.7], M('#3a3f47', 0.4, 0.7));
      break;
    case 'screen':
      P('box', [x, 1.6, z], [1.8, 1.05, 0.06], M(color ?? '#1f6feb', 0.2, 0, 3), undefined, false);
      break;
    case 'stall': {
      const c = color ?? pc();
      P('box', [x, 0.5, z], [2.4, 1.0, 1.4], M('#8a6239', 0.9));
      P('box', [x, 2.3, z], [2.8, 0.08, 1.8], M(c, 0.7), rotX(0.2));
      break;
    }
    case 'flag':
      P('cyl', [x, 3.0, z], [0.08, 6.0, 0.08], M('#d0d0d0', 0.3, 0.9));
      P('box', [x + 0.8, 5.4, z], [1.6, 1.0, 0.02], M(color ?? pc(), 0.7));
      break;
    case 'planet': {
      const rr = 2 + r() * 6;
      P('sphere', [x * 3, 10 + r() * 25, z * 3 - 40], [rr * 2, rr * 2, rr * 2], M(color ?? pc(), 0.6, 0, 0.6), undefined, false);
      break;
    }
    case 'column':
      P('cyl', [x, 3.0, z], [0.7, 6.0, 0.7], M('#efe7da', 0.4));
      break;
    case 'counter':
      P('box', [x, 0.55, z], [4.0, 1.1, 0.9], M(color ?? ctx.pal[1 % ctx.pal.length]!, 0.4));
      break;
  }
  return out;
}

/** The character's body parts, hanging from the joints of its rig (joint-local positions, plan axes). */
export function characterParts(c: Character): Prim[] {
  const h = c.height;
  const S = (x: number, y: number, z: number): Vec3 => [x * h, y * h, z * h];
  const robot = c.kind === 'robot';
  const metal = robot ? 0.9 : 0;
  const skin = M(robot ? '#b8c0cc' : c.colors.skin, robot ? 0.25 : 0.5, metal);
  const top = M(c.colors.top, 0.7, metal);
  const bottom = M(c.colors.bottom, 0.75, metal);
  const acc = M(c.colors.accent, 0.5, metal);
  const dark = M('#1a1a1a', 0.6);
  const parts: Prim[] = [];
  const P = (joint: string, shape: Shape, pos: Vec3, size: Vec3, mat: MatSpec, extra: Partial<Prim> = {}) => parts.push({ joint, shape, pos, size, mat, ...extra });
  if (c.kind === 'animal') {
    P('body', 'sphere', [0, 0, 0], S(0.34, 0.36, 0.8), top);
    P('head', 'sphere', S(0, 0.08, 0.1), S(0.24, 0.24, 0.3), top);
    for (const e of [-1, 1]) P('head', 'sphere', S(e * 0.06, 0.12, 0.27), S(0.035, 0.035, 0.035), dark);
    P('tail', 'cyl', S(0, 0.02, -0.12), S(0.05, 0.3, 0.05), acc, { quat: rotX(-1.05) });
    for (const leg of ['leg_fl', 'leg_fr', 'leg_bl', 'leg_br']) P(leg, 'cyl', S(0, -0.27, 0), S(0.09, 0.54, 0.09), bottom);
    return parts;
  }
  const big = c.kind === 'child' ? 1.25 : 1;
  P('hips', 'sphere', [0, 0, 0], S(0.2, 0.12, 0.14), bottom);
  P('spine', 'sphere', S(0, 0.12, 0), S(0.26, 0.3, 0.17), top);
  P('neck', 'cyl', S(0, 0.05, 0), S(0.06, 0.1, 0.06), skin);
  if (robot) {
    P('head', 'box', S(0, 0.08 * big, 0), S(0.17 * big, 0.17 * big, 0.17 * big), skin);
    P('head', 'cyl', S(0, 0.21 * big, 0), S(0.01, 0.1, 0.01), acc);
  } else {
    P('head', 'sphere', S(0, 0.075 * big, 0), S(0.16 * big, 0.19 * big, 0.17 * big), skin);
    P('head', 'sphere', S(0, 0.12 * big, -0.01), S(0.165 * big, 0.12 * big, 0.175 * big), c.kind === 'child' ? acc : M('#1b1410', 0.8));
  }
  for (const e of [-1, 1]) {
    P('head', 'sphere', S(e * 0.04 * big, 0.09 * big, 0.075 * big), S(0.03, 0.03, 0.02), M('#ffffff', 0.3));
    P('head', 'sphere', S(e * 0.04 * big, 0.09 * big, 0.088 * big), S(0.016, 0.016, 0.01), dark);
  }
  P('head', 'sphere', S(0, 0.035 * big, 0.078 * big), S(0.05, 0.012, 0.015), M('#5a1f1f', 0.6), { face: 'mouth' });
  P('head', 'box', S(-0.04 * big, 0.125 * big, 0.08 * big), S(0.045, 0.008, 0.01), dark, { face: 'brow_l' });
  P('head', 'box', S(0.04 * big, 0.125 * big, 0.08 * big), S(0.045, 0.008, 0.01), dark, { face: 'brow_r' });
  for (const side of ['l', 'r']) {
    P(`shoulder_${side}`, 'cyl', S(0, -0.085, 0), S(0.075, 0.17, 0.075), top);
    P(`elbow_${side}`, 'cyl', S(0, -0.075, 0), S(0.06, 0.15, 0.06), robot ? top : skin);
    P(`wrist_${side}`, 'sphere', S(0, -0.03, 0), S(0.07, 0.08, 0.07), skin);
    P(`hip_${side}`, 'cyl', S(0, -0.12, 0), S(0.1, 0.24, 0.1), bottom);
    P(`knee_${side}`, 'cyl', S(0, -0.12, 0), S(0.085, 0.24, 0.085), bottom);
    P(`ankle_${side}`, 'box', S(0, -0.02, 0.04), S(0.09, 0.06, 0.2), dark);
  }
  return parts;
}

/** The whole scene of a plan, ready for both engines. */
export function sceneSpec(plan: ScenePlan): SceneSpec {
  const env = plan.environment;
  const tod = plan.style.timeOfDay;
  const interior = ['bank_lobby', 'office', 'studio'].includes(env.preset);
  const night = tod === 'night' || tod === 'dusk';
  const r = rng(hashStr(`${plan.title}|${env.preset}|${plan.seconds}`));
  const ctx = { pal: plan.style.palette, night, preset: env.preset, lowpoly: plan.style.look === 'lowpoly' };
  const world: Prim[] = [{ shape: 'plane', pos: [0, 0, 0], size: [220, 0, 220], mat: M(env.ground, 0.95), cast: false }];
  if (interior) {
    const wall = env.preset === 'studio' ? '#15171c' : '#e9e3d8';
    world.push({ shape: 'box', pos: [0, 4, -12], size: [40, 8, 0.4], mat: M(env.preset === 'studio' ? '#15171c' : ctx.pal[2 % ctx.pal.length]!, 0.9), cast: false });
    for (const sx of [-14, 14]) world.push({ shape: 'box', pos: [sx, 4, -2], size: [0.4, 8, 24], mat: M(wall, 0.9), cast: false });
    for (let k = 0; k < 4; k++) world.push({ shape: 'box', pos: [-9 + k * 6, 7.9, -4], size: [3, 0.05, 1], mat: M('#ffffff', 0.2, 0, 6), cast: false });
  }
  const r0 = freeRadius(plan);
  for (const p of env.props)
    for (let i = 0; i < p.count; i++) {
      let x: number, z: number;
      if (interior) {
        x = -12 + r() * 24;
        z = ['screen', 'counter', 'column', 'desk'].includes(p.kind) ? -11 + r() * 8 : -10 + r() * 14;
        if (Math.abs(x) < 3.5 && z > -4) x += x >= 0 ? 6 : -6;
      } else {
        const a = -Math.PI + r() * 2 * Math.PI;
        const rad = r0 + r() * (18 + p.count * 0.6);
        x = Math.cos(a) * rad;
        z = Math.sin(a) * rad;
        if (z > 2) z = -Math.abs(z); // keep the space between the cast and the camera clear
      }
      world.push(...prop(p.kind, x, z, r, ctx, p.color));
    }
  if (env.preset === 'beach') world.push({ shape: 'plane', pos: [0, 0.02, -45], size: [220, 0, 70], mat: M('#1f6f9e', 0.05, 0.1), cast: false });
  if (env.preset === 'space')
    for (let i = 0; i < 160; i++) {
      const a = r() * Math.PI * 2;
      const b = 0.2 + r() * 1.2;
      world.push({ shape: 'sphere', pos: [Math.cos(a) * 120 * Math.cos(b), 120 * Math.sin(b), Math.sin(a) * 120 * Math.cos(b) - 60], size: [0.8, 0.8, 0.8], mat: M('#ffffff', 0.5, 0, 8), seg: 6, cast: false });
    }
  const [elev, scol, spow] = SUN[tod]!;
  const el = (elev * Math.PI) / 180;
  const lights: LightSpec[] = [
    { kind: 'sun', pos: [Math.cos(el) * 30 * 0.57, Math.sin(el) * 30, Math.cos(el) * 30 * 0.82], target: [0, 0, 0], color: scol, power: spow * (interior ? 0.5 : 1) },
    { kind: 'area', pos: [4, 5, 5], target: [0, 1.2, 0], color: '#ffd9b0', power: 0.6 },
    { kind: 'area', pos: [-5, 3, 4], target: [0, 1.2, 0], color: '#b9d4ff', power: 0.25 },
    { kind: 'area', pos: [0, 4, -6], target: [0, 1.4, 0], color: '#ffffff', power: 0.4 },
  ];
  const cast = plan.characters.map((c, i) => {
    // Clothes that read against the skin: if the plan's top is too close to the skin tone, a contrasting one.
    const near = (a: string, b: string) => {
      const p = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
      const [x, y] = [p(a), p(b)];
      return Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!) < 90;
    };
    const fixed = near(c.colors.top, c.colors.skin) ? { ...c, colors: { ...c.colors, top: CLOTHES[i % CLOTHES.length]! } } : c;
    return { id: c.id, kind: c.kind, height: c.height, parts: characterParts(fixed) };
  });
  return {
    sky: env.preset === 'space' ? SKY.night! : interior ? '#2a2c33' : SKY[tod]!,
    skyStrength: tod === 'night' ? 0.35 : interior ? 0.6 : 1,
    fog: plan.style.weather === 'fog' ? 0.035 : plan.style.weather === 'rain' ? 0.015 : 0,
    interior,
    lights,
    world,
    cast,
  };
}
