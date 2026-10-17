import { describe, expect, it } from 'vitest';
import {
  JOINTS,
  MP_INDEX,
  apply,
  bodyFromLandmarks,
  bodyModel,
  bodyTarget,
  boneMatrices,
  buildBodyMesh,
  findHem,
  characterFromBody,
  deformMesh,
  poseFromTarget,
  restLimbs,
  restPose,
  skinOf,
  springBody,
  type ClipCtx,
  type Landmark,
} from '../../coeur/studio/body2d';

// A standing, front-facing character (image fractions, aspect 1): its left side is on the +X side of the picture.
const STAND: Record<string, [number, number]> = {
  nose: [0.5, 0.12],
  lEye: [0.52, 0.1],
  rEye: [0.48, 0.1],
  lEar: [0.54, 0.11],
  rEar: [0.46, 0.11],
  mouthL: [0.51, 0.14],
  mouthR: [0.49, 0.14],
  lSh: [0.58, 0.22],
  rSh: [0.42, 0.22],
  lEl: [0.6, 0.38],
  rEl: [0.4, 0.38],
  lWr: [0.61, 0.52],
  rWr: [0.39, 0.52],
  lHand: [0.61, 0.56],
  rHand: [0.39, 0.56],
  lHip: [0.55, 0.52],
  rHip: [0.45, 0.52],
  lKn: [0.55, 0.72],
  rKn: [0.45, 0.72],
  lAn: [0.55, 0.92],
  rAn: [0.45, 0.92],
  lFoot: [0.56, 0.96],
  rFoot: [0.44, 0.96],
};
function landmarks(pts = STAND): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  for (const j of JOINTS) lm[MP_INDEX[j]] = { x: pts[j]![0], y: pts[j]![1], visibility: 0.95 };
  return lm;
}
const FULL = { x: 0, y: 0, w: 1, h: 1 };
const rig = bodyFromLandmarks(landmarks(), FULL)!;
const model = bodyModel(rig, 1);
const idx = (id: string) => model.bones.findIndex((b) => b.id === id);
const ctx = (o: Partial<ClipCtx> = {}): ClipCtx => ({
  t: 1,
  age: 1,
  speaking: false,
  energy: 0,
  beat: 0,
  rest: restLimbs(model, 1),
  room: 0.3,
  travel: true,
  phase: 0,
  ...o,
});

describe('CORPS ENTIER — squelette 2D depuis la pose', () => {
  it('maps a crop back to image fractions and refuses an upside-down reading', () => {
    const r = bodyFromLandmarks(landmarks(), { x: 0.2, y: 0.1, w: 0.5, h: 0.8 })!;
    expect(r.joints.lSh!.x).toBeCloseTo(0.2 + 0.58 * 0.5, 6);
    expect(r.joints.lSh!.y).toBeCloseTo(0.1 + 0.22 * 0.8, 6);
    const flipped = Object.fromEntries(
      Object.entries(STAND).map(([k, [x, y]]) => [k, [x, 1 - y]]),
    ) as typeof STAND;
    expect(bodyFromLandmarks(landmarks(flipped), FULL)).toBeNull();
    const hidden = landmarks();
    hidden[MP_INDEX.lHip] = { ...hidden[MP_INDEX.lHip]!, visibility: 0.1 };
    expect(bodyFromLandmarks(hidden, FULL)).toBeNull();
  });
  it('gives the head engine eyes, a mouth, a head box and arms', () => {
    const c = characterFromBody(rig, 'A', 1);
    expect(c.eyes).toHaveLength(2);
    expect(c.mouth.y).toBeGreaterThan(c.eyes[0]!.y);
    expect(c.head.y).toBeLessThan(0.1);
    expect(c.box.y + c.box.h).toBeGreaterThan(0.95);
    expect(c.arms).toHaveLength(2);
  });
  it('knows which side each limb is on', () => {
    expect(model.out).toEqual({ l: 1, r: -1 });
    expect(model.height).toBeGreaterThan(0.85);
  });
  it('binds each part of the drawing to the right bone', () => {
    expect(skinOf(model, { x: 0.605, y: 0.47 }).i[0]).toBe(idx('lLo'));
    expect(skinOf(model, { x: 0.39, y: 0.3 }).i[0]).toBe(idx('rUp'));
    expect(skinOf(model, { x: 0.5, y: 0.35 }).i[0]).toBe(idx('torso'));
    expect(skinOf(model, { x: 0.5, y: 0.08 }).i[0]).toBe(idx('head'));
    expect(skinOf(model, { x: 0.45, y: 0.82 }).i[0]).toBe(idx('rShin'));
    const w = skinOf(model, { x: 0.5, y: 0.3 }).w;
    expect(w[0] + w[1]).toBeCloseTo(1, 6);
  });
  it('the rest target keeps the drawing exactly where it is', () => {
    const rest = restLimbs(model, 1);
    const p = poseFromTarget(
      model,
      {
        torso: 0,
        head: 0,
        headDy: 0,
        arms: rest.arms,
        legs: rest.legs,
        root: { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, flip: false },
      },
      1,
    );
    for (const v of Object.values(p.ang)) expect(Math.abs(v)).toBeLessThan(1e-9);
    const box = { x0: 0.3, y0: 0, x1: 0.7, y1: 1 };
    const mesh = buildBodyMesh(model, () => 1, box, 20);
    const d = deformMesh(mesh, boneMatrices(model, restPose()));
    for (let i = 0; i < d.length; i++) expect(d[i]).toBeCloseTo(mesh.src[i]!, 9);
  });
  it('never stretches a triangle between an arm and the body side or a hand and a thigh', () => {
    const mesh = buildBodyMesh(model, () => 1, { x0: 0.3, y0: 0, x1: 0.7, y1: 1 }, 30);
    const dom = (v: number) => mesh.bi[v * 2]!;
    const okPair = new Set([
      'torso|head',
      'torso|lUp',
      'torso|rUp',
      'lUp|lLo',
      'rUp|rLo',
      'torso|lTh',
      'torso|rTh',
      'lTh|lShin',
      'rTh|rShin',
    ]);
    for (let t = 0; t < mesh.tris.length; t += 3) {
      if (mesh.part[t / 3]! >= 0) {
        // A border copy: all its corners follow the one part it shows.
        for (const k of [0, 1, 2]) expect(dom(mesh.tris[t + k]!)).toBe(mesh.part[t / 3]);
        continue;
      }
      const ids = [...new Set([0, 1, 2].map((k) => model.bones[dom(mesh.tris[t + k]!)]!.id))];
      for (let a = 0; a < ids.length; a++)
        for (let b = a + 1; b < ids.length; b++) {
          const key = [ids[a], ids[b]]
            .sort(
              (x, y) => model.bones.findIndex((q) => q.id === x) - model.bones.findIndex((q) => q.id === y),
            )
            .join('|');
          expect(okPair.has(key), key).toBe(true);
        }
    }
    // Back to front: legs, torso, head, arms.
    const layers = Array.from(
      { length: mesh.tris.length / 3 },
      (_, t) => model.bones[dom(mesh.tris[t * 3]!)]!.layer,
    );
    expect([...layers].sort((a, b) => a - b)).toEqual(layers);
  });
  it('waving raises the near hand above the shoulder; walking travels towards the other one', () => {
    const facing = 1;
    const wave = poseFromTarget(model, bodyTarget('wave', ctx({ age: 1.5 })), facing);
    const m = boneMatrices(model, wave);
    const hand = apply(m[idx('lLo')]!, model.P.lHand!);
    expect(hand.y).toBeLessThan(model.P.lSh!.y);
    expect(hand.x).toBeGreaterThan(model.P.lSh!.x);
    const walk = poseFromTarget(model, bodyTarget('walk', ctx({ age: 0.6 })), facing);
    expect(walk.root.dx).toBeGreaterThan(0.15);
    expect(Math.abs(walk.ang.lTh) + Math.abs(walk.ang.rTh)).toBeGreaterThan(0.05);
    const still = poseFromTarget(model, bodyTarget('walk', ctx({ age: 0.6, travel: false })), facing);
    expect(still.root.dx).toBeCloseTo(0, 6);
    const left = poseFromTarget(model, bodyTarget('walk', ctx({ age: 0.6, rest: restLimbs(model, -1) })), -1);
    expect(left.root.dx).toBeLessThan(-0.15);
  });
  it('a fall tips the body over to the chosen side; an exit turns the character around', () => {
    for (const dir of [-1, 1]) {
      const fall = poseFromTarget(model, bodyTarget('fall', ctx({ age: 2, fallDir: dir })), 1);
      const head = apply(boneMatrices(model, fall)[idx('head')]!, model.P.headTop!);
      expect(head.y).toBeGreaterThan(model.P.headTop!.y + 0.4);
      expect(Math.sign(head.x - model.P.headTop!.x)).toBe(dir);
    }
    const exit = poseFromTarget(model, bodyTarget('exit', ctx({ age: 1.5 })), 1);
    expect(exit.root.sx).toBeLessThan(0);
    expect(exit.root.dx).toBeLessThan(-0.3);
  });
  it('the springs ease every change and settle on the target', () => {
    const target = poseFromTarget(model, bodyTarget('wave', ctx({ age: 2 })), 1);
    let s = springBody(undefined, restPose(), 0).state;
    const first = springBody(s, target, 1 / 30);
    expect(Math.abs(first.pose.ang.lUp)).toBeLessThan(Math.abs(target.ang.lUp));
    s = first.state;
    let p = first.pose;
    for (let k = 2; k < 90; k++) ({ pose: p, state: s } = springBody(s, target, k / 30));
    expect(p.ang.lUp).toBeCloseTo(target.ang.lUp, 2);
  });
  it('a long dress keeps its fabric whole: the legs only move below the hem', () => {
    // Trousers: a gap between the legs from the knees down. Dress: full down to 0.86, then the ankles part.
    const trousers = (x: number, y: number) => (y > 0.6 && Math.abs(x - 0.5) < 0.025 ? 0 : 1);
    const dress = (x: number, y: number) => (y > 0.86 && Math.abs(x - 0.5) < 0.025 ? 0 : 1);
    expect(findHem(model, trousers)).toBeNull();
    const hem = findHem(model, dress)!;
    expect(hem).toBeGreaterThan(0.8);
    const m2 = { ...model, hem };
    // Between the knees, inside the dress: the torso holds the fabric (no leg tears it).
    expect(m2.bones[skinOf(m2, { x: 0.5, y: 0.72 }).i[0]]!.id).toBe('torso');
    const dance = poseFromTarget(m2, bodyTarget('dance', ctx({ age: 1, t: 1.3 })), 1);
    const free = poseFromTarget(model, bodyTarget('dance', ctx({ age: 1, t: 1.3 })), 1);
    expect(Math.abs(dance.ang.lTh)).toBeLessThan(Math.abs(free.ang.lTh) + 1e-9);
  });
});
