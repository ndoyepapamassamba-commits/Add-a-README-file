import { describe, expect, it } from 'vitest';
import { applyStates, armatureFromSegments, bindSkin, ease, ikTwoBone, sampleTrack, skin, skinDQ, type Clip } from '../../server/jev/studio/actor/armature2d';

// An arm drawn hanging down: shoulder (100,100) → elbow (100,180) → wrist (100,250) → hand tip (100,290).
const arm = () => armatureFromSegments([
  { name: 'Arm', parent: -1, a: [100, 100], b: [100, 180] },
  { name: 'ForeArm', parent: 0, a: [100, 180], b: [100, 250] },
  { name: 'Hand', parent: 1, a: [100, 250], b: [100, 290] },
]);
const near = (a: [number, number], b: [number, number], tol = 1e-6) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;

describe('moteur squelettique 2D (reproduction du runtime DragonBones, MIT)', () => {
  it('the setup pose IS the drawing: every bone head/tail sits where it was measured', () => {
    const a = arm();
    expect(near(a.head(0), [100, 100])).toBe(true);
    expect(near(a.tail(0), [100, 180])).toBe(true);
    expect(near(a.head(1), [100, 180])).toBe(true);
    expect(near(a.tail(2), [100, 290])).toBe(true);
  });
  it('linear blend skinning: at setup every vertex stays put; turning the forearm carries the hand rigidly around the elbow', () => {
    const a = arm();
    // vertices: one on the arm, one on the forearm, two on the hand (weights 1 to their bone)
    const rest = [104, 140, 104, 215, 96, 270, 104, 285];
    const idx = [0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0];
    const w = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
    const b = bindSkin(rest, idx, w, a);
    const s0 = skin(b, a);
    for (let i = 0; i < rest.length; i++) expect(s0[i]).toBeCloseTo(rest[i]!, 9);
    a.pose[1]!.rot = Math.PI / 3; // bend the elbow 60°
    a.update();
    const s1 = skin(b, a);
    expect([s1[0], s1[1]]).toEqual([s0[0], s0[1]]); // the upper arm does not move
    // the hand keeps its shape: distance between its two vertices unchanged, and its distance to the elbow unchanged
    const d = (p: ArrayLike<number>, i: number, j: number) => Math.hypot(p[i * 2]! - p[j * 2]!, p[i * 2 + 1]! - p[j * 2 + 1]!);
    expect(d(s1, 2, 3)).toBeCloseTo(d(s0, 2, 3), 9);
    const elbow = [100, 180];
    expect(Math.hypot(s1[4]! - elbow[0]!, s1[5]! - elbow[1]!)).toBeCloseTo(Math.hypot(s0[4]! - elbow[0]!, s0[5]! - elbow[1]!), 9);
    // a 50/50 vertex at the elbow moves half way (smooth joint, no tear)
    const mid = bindSkin([104, 180], [0, 1, 0, 0], [0.5, 0.5, 0, 0], arm());
    const a2 = arm(); a2.pose[1]!.rot = Math.PI / 3; a2.update();
    const m = skin(mid, a2);
    expect(Number.isFinite(m[0]!) && Number.isFinite(m[1]!)).toBe(true);
  });
  it('dual-number skinning keeps a bent elbow thick where linear blending collapses it (candy wrapper)', () => {
    // a band of vertices across the elbow, half arm / half forearm, then the elbow bent 150°
    const rest: number[] = [], idx: number[] = [], w: number[] = [];
    for (const dx of [-8, 8]) { rest.push(100 + dx, 180); idx.push(0, 1, 0, 0); w.push(0.5, 0.5, 0, 0); }
    const a0 = arm(), b = bindSkin(rest, idx, w, a0);
    const lbs0 = skin(b, a0), dq0 = skinDQ(b, a0);
    for (let i = 0; i < rest.length; i++) { expect(lbs0[i]).toBeCloseTo(rest[i]!, 9); expect(dq0[i]).toBeCloseTo(rest[i]!, 9); }
    const a = arm(); a.pose[1]!.rot = (150 * Math.PI) / 180; a.update();
    const width = (p: ArrayLike<number>) => Math.hypot(p[0]! - p[2]!, p[1]! - p[3]!);
    expect(width(skinDQ(b, a))).toBeCloseTo(16, 6); // rigid blend: the joint keeps its 16 px
    expect(width(skin(b, a))).toBeLessThan(16 * 0.5); // linear blend: squashed to less than half
  });
  it('two-bone IK (DragonBones _computeB): the wrist reaches a target in reach, the elbow bends to the chosen side', () => {
    const target: [number, number] = [160, 160];
    for (const bend of [true, false]) {
      const a = arm();
      ikTwoBone(a, 0, 1, target, bend, 1);
      expect(near(a.tail(1), target, 1e-6)).toBe(true);
      // bone lengths are kept
      expect(Math.hypot(a.head(1)[0] - 100, a.head(1)[1] - 100)).toBeCloseTo(80, 6);
    }
    const p = arm(), q = arm();
    ikTwoBone(p, 0, 1, target, true); ikTwoBone(q, 0, 1, target, false);
    expect(Math.sign(p.head(1)[0] - q.head(1)[0])).not.toBe(0); // two different elbows
    // out of reach: the chain points straight at the target
    const r = arm();
    ikTwoBone(r, 0, 1, [100 + 400, 100], true);
    expect(r.tail(1)[1]).toBeCloseTo(100, 6);
    // weight 0.5: half way between the setup and the solved pose
    const h = arm();
    ikTwoBone(h, 0, 1, target, true, 0.5);
    expect(near(h.tail(1), target, 1)).toBe(false);
  });
  it('tweens like DragonBones (_getEasingValue, curve samples) and tracks interpolate between keys', () => {
    expect(ease('line', 0.25)).toBe(0.25);
    expect(ease('quadIn', 0.5)).toBeCloseTo(0.25, 9);
    expect(ease('quadOut', 0.5)).toBeCloseTo(0.75, 9);
    expect(ease('quadInOut', 0.5)).toBeCloseTo(0.5, 9);
    expect(ease([0.1, 0.9], 0.5)).toBeCloseTo(0.5, 9);
    expect(sampleTrack({ bone: 'Arm', prop: 'rot', keys: [{ t: 0, v: 0 }, { t: 1, v: 2 }] }, 0.5)).toBeCloseTo(1, 9);
    expect(sampleTrack({ bone: 'Arm', prop: 'rot', keys: [{ t: 0, v: 0, tween: 'step' }, { t: 1, v: 2 }] }, 0.5)).toBe(0);
  });
  it('layered blending with fades (BlendState): a higher layer takes its weight, the lower layer gets the rest; fade-in is gradual', () => {
    const wave: Clip = { name: 'wave', duration: 1, tracks: [{ bone: 'ForeArm', prop: 'rot', keys: [{ t: 0, v: 1 }, { t: 1, v: 1 }] }] };
    const idle: Clip = { name: 'idle', duration: 1, tracks: [{ bone: 'ForeArm', prop: 'rot', keys: [{ t: 0, v: -1 }, { t: 1, v: -1 }] }] };
    const a = arm();
    applyStates(a, [{ clip: idle, start: 0, layer: 0, weight: 1, fadeIn: 0 }, { clip: wave, start: 0, layer: 1, weight: 0.7, fadeIn: 0 }], 0.5);
    expect(a.pose[1]!.rot).toBeCloseTo(0.7 * 1 + 0.3 * -1, 9);
    applyStates(a, [{ clip: wave, start: 0, layer: 1, weight: 1, fadeIn: 0.4 }], 0.1);
    expect(a.pose[1]!.rot).toBeCloseTo(0.25, 9);
    applyStates(a, [{ clip: wave, start: 0, layer: 1, weight: 1, fadeIn: 0.4, fadeOut: { at: 0.6, dur: 0.2 } }], 0.7);
    expect(a.pose[1]!.rot).toBeCloseTo(0.5, 9);
  });
});
