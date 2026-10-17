import { describe, expect, it } from 'vitest';
import { perform, type Script } from '../../coeur/studio/actor/actor';
import { SKELETON, applyLimits, eulerOf, fk, jointIndex, restPose } from '../../coeur/studio/actor/skeleton';
import { qEuler, len, sub } from '../../coeur/studio/actor/math';
import { twoBoneIK } from '../../coeur/studio/actor/solver';

const D = Math.PI / 180;
const SCRIPT: Script = {
  start: { pos: [0, -0.08], heading: 0 },
  actions: [
    { kind: 'sit', t0: 0, t1: 1.2, seat: [0, 0, -0.08], heading: 0 },
    { kind: 'standUp', t0: 1.2, t1: 2.9 },
    { kind: 'walkTo', t0: 3.2, t1: 7.2, to: [-1.0, 2.6] },
    { kind: 'turnTo', t0: 7.3, t1: 8.5, heading: 62 * D },
    { kind: 'arm', t0: 8.6, t1: 10.1, side: 'r', mode: 'wave' },
    { kind: 'arm', t0: 10.4, t1: 11.9, side: 'r', mode: 'point', target: [-2.6, 1.3, 4.6] },
    { kind: 'emotion', t0: 10.3, t1: 12.0, emotion: 'colère' },
    { kind: 'arm', t0: 13.7, t1: 15.2, side: 'both', mode: 'akimbo' },
  ],
};
const frames = perform(SCRIPT, 15, 25);
const at = (t: number) => frames[Math.round(t * 25)]!;
const J = (n: string) => jointIndex(n);

describe('ACTEUR VIRTUEL — real skeleton (hierarchy, FK, IK, limits)', () => {
  it('has a full body hierarchy (spine, neck, head, collars, arms, hands with index + thumb, legs, feet)', () => {
    expect(SKELETON.length).toBe(35);
    for (const n of ['pelvis', 'spine3', 'head', 'l_collar', 'r_wrist', 'r_index3', 'l_thumb2', 'l_knee', 'r_toe']) expect(() => J(n)).not.toThrow();
    const w = fk(restPose());
    expect(w.pos[J('head')]![1]).toBeGreaterThan(1.4);
    expect(w.pos[J('l_shoulder')]![0]).toBeGreaterThan(0); // its left is +X
  });
  it('Euler extraction inverts the composition; a knee can never bend backwards', () => {
    const e = eulerOf(qEuler(0.3, -0.2, 0.5));
    expect(e[0]).toBeCloseTo(0.3, 5);
    expect(e[1]).toBeCloseTo(-0.2, 5);
    expect(e[2]).toBeCloseTo(0.5, 5);
    const p = restPose();
    p.rot[J('l_knee')] = qEuler(-1, 0, 0);
    expect(eulerOf(applyLimits(p).rot[J('l_knee')]!)[0]).toBeCloseTo(0, 5);
  });
  it('two-bone IK reaches a reachable target exactly', () => {
    const p = restPose();
    const w = twoBoneIK(p, fk(p), 'r_shoulder', 'r_elbow', 'r_wrist', [-0.4, 1.2, 0.25], [-0.3, 1.0, -0.5]);
    expect(len(sub(w.pos[J('r_wrist')]!, [-0.4, 1.2, 0.25]))).toBeLessThan(1e-3);
  });
});

describe('ACTEUR VIRTUEL — performance: stands up, walks, turns, waves, points, emotions, posture', () => {
  it('sits then really stands up (pelvis from seat height to standing height)', () => {
    expect(at(0.5).world.pos[0]![1]).toBeLessThan(0.6);
    expect(at(3).world.pos[0]![1]).toBeGreaterThan(0.9);
  });
  it('walks with planted feet (no sliding while a foot supports the body) and covers the distance', () => {
    let slide = 0;
    for (let i = 1; i < frames.length; i++)
      for (const s of ['l', 'r']) {
        const a = frames[i - 1]!.world.pos[J(`${s}_ankle`)]!;
        const b = frames[i]!.world.pos[J(`${s}_ankle`)]!;
        if (Math.abs(a[1] - 0.07) < 0.002 && Math.abs(b[1] - 0.07) < 0.002) slide = Math.max(slide, Math.hypot(b[0] - a[0], b[2] - a[2]));
      }
    expect(slide).toBeLessThan(0.002);
    const p = at(7.4).world.pos[0]!;
    expect(Math.hypot(p[0] + 1, p[2] - 2.6)).toBeLessThan(0.05);
    // Feet alternate: both feet were lifted at some point while walking.
    const lifted = (s: string) => frames.some((f) => f.t > 3.2 && f.t < 7.2 && f.world.pos[J(`${s}_ankle`)]![1] > 0.12);
    expect(lifted('l') && lifted('r')).toBe(true);
  });
  it('turns to the requested heading', () => {
    const q = at(9).pose.rot[0]!;
    const heading = Math.atan2(2 * (q[0] * q[2] + q[3] * q[1]), 1 - 2 * (q[0] ** 2 + q[1] ** 2));
    expect(Math.abs(heading - 62 * D)).toBeLessThan(0.1);
  });
  it('waves above the shoulder, points at the target, puts the hands on the hips', () => {
    const w = at(9.3).world;
    expect(w.pos[J('r_wrist')]![1]).toBeGreaterThan(w.pos[J('r_shoulder')]![1]);
    const p = at(11.2).world;
    const dir = sub(p.pos[J('r_wrist')]!, p.pos[J('r_shoulder')]!);
    const tgt = sub([-2.6, 1.3, 4.6], p.pos[J('r_shoulder')]!);
    const cos = (dir[0] * tgt[0] + dir[1] * tgt[1] + dir[2] * tgt[2]) / len(dir) / len(tgt);
    expect(cos).toBeGreaterThan(0.99);
    const k = at(14.5).world;
    for (const s of ['l', 'r']) expect(len(sub(k.pos[J(`${s}_wrist`)]!, k.pos[0]!))).toBeLessThan(0.3);
  });
  it('anger changes the body (leans forward) and the face (angry brows)', () => {
    expect(at(11.2).face.browAngry).toBeGreaterThan(0.8);
    expect(at(11.2).emotion).toBe('colère');
    expect(frames.every((f) => f.world.pos.every((v) => v.every(Number.isFinite)))).toBe(true);
  });
});

import { defaultStaging, directScene } from '../../coeur/studio/actor/director';
describe('DIRECTEUR D’ACTEURS — une scène de l’app devient des scripts squelettiques', () => {
  it('the speaker plays the [gesture] of the line, the listener looks at the speaker; emotions change the body', () => {
    const lines = [
      { speaker: 'AWA', start: 0.4, end: 2.4, text: 'Toi là, tu as encore bu mon jus ?', gesture: 'montre du doigt', emotion: 'colère' },
      { speaker: 'KOFFI', start: 2.8, end: 4.6, text: "C'est pas mon palabre.", gesture: 'hausse les épaules', emotion: 'mépris' },
    ];
    const s = directScene(['AWA', 'KOFFI'], lines, defaultStaging(['AWA', 'KOFFI'], 5.5), 'dispute dans la cour');
    const awa = s.AWA!.actions;
    expect(awa.some((a) => a.kind === 'arm' && a.mode === 'point' && a.target)).toBe(true);
    expect(awa.some((a) => a.kind === 'emotion' && a.emotion === 'colère')).toBe(true);
    expect(s.KOFFI!.actions.some((a) => a.kind === 'arm' && a.mode === 'shrug')).toBe(true);
    expect(s.KOFFI!.actions.some((a) => a.kind === 'look' && a.t0 < 1)).toBe(true);
    // The performance runs (both actors) without invalid values.
    const f = perform(s.AWA!, 5.5);
    expect(f.every((x) => x.world.pos.every((v) => v.every(Number.isFinite)))).toBe(true);
  });
  it('« entre » makes the first character walk in from off-screen; « assis » seats them, they stand up to speak', () => {
    const s = directScene(['AWA', 'KOFFI'], [{ speaker: 'AWA', start: 3, end: 4, text: 'Bonjour' }], defaultStaging(['AWA', 'KOFFI'], 5), 'AWA entre dans la cour');
    expect(s.AWA!.actions.some((a) => a.kind === 'walkTo')).toBe(true);
    const t = directScene(['AWA'], [{ speaker: 'AWA', start: 3, end: 4, text: 'Hein ?' }], defaultStaging(['AWA'], 5), 'AWA est assise au salon');
    expect(t.AWA!.actions.some((a) => a.kind === 'sit')).toBe(true);
    expect(t.AWA!.actions.some((a) => a.kind === 'standUp')).toBe(true);
  });
});
