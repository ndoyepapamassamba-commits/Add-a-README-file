import { describe, expect, it } from 'vitest';
import { deformPoint, gestureOf, jawOffset, parseRig, poseAt, warpGrid } from '../../coeur/studio/puppet';

const RIG = parseRig('{"characters":[{"name":"AWA","box":{"x":0.26,"y":0.17,"w":0.56,"h":0.72},"head":{"x":0.34,"y":0.19,"w":0.33,"h":0.29},"body":{"x":0.29,"y":0.47,"w":0.42,"h":0.41},"eyes":[{"x":0.44,"y":0.32,"r":0.035}],"mouth":{"x":0.45,"y":0.39,"w":0.1,"h":0.05},"arms":[{"shoulder":{"x":0.62,"y":0.5},"hand":{"x":0.79,"y":0.36}}]}]}', 'vision-x')!;
const awa = RIG.characters[0]!;

describe('MARIONNETTE AFRIKATOON — moteur d’animation maison', () => {
  it('reads the rig from the vision answer; drops what is unusable, invents nothing', () => {
    expect(RIG.characters).toHaveLength(1);
    expect(awa.eyes).toHaveLength(1);
    expect(parseRig('{"characters":[{"name":"X","box":{"x":0.1}}]}', 'm')!.characters).toEqual([]);
    expect(parseRig('pas de json', 'm')).toBeNull();
  });
  it('blinks now and then, talks only while speaking (mouth follows the voice), waves when the action says so', () => {
    const blinks = Array.from({ length: 200 }, (_, i) => poseAt(awa, i * 0.05, { speaking: false, energy: 0 }).blink).filter((b) => b > 0.5).length;
    expect(blinks).toBeGreaterThan(0);
    expect(blinks).toBeLessThan(20);
    expect(poseAt(awa, 1, { speaking: false, energy: 0.8 }).mouth).toBe(0);
    expect(poseAt(awa, 1.03, { speaking: true, energy: 0.5 }).mouth).toBeGreaterThan(0);
    expect(poseAt(awa, 0.3, { speaking: false, energy: 0, action: 'Awa salue la foule' }).wave).toBeGreaterThan(0.2);
    expect(Math.abs(poseAt(awa, 0.3, { speaking: false, energy: 0, action: 'Awa boit son thé' }).wave)).toBeLessThan(0.05);
  });
  it('plays a gesture per line: the [gesture] or the action keywords pick it, talkers lean towards the listener', () => {
    expect(gestureOf('[montre du doigt] Toi là !')).toBe('point');
    expect(gestureOf('Il éclate de rire')).toBe('laugh');
    expect(gestureOf('Elle hausse les épaules')).toBe('shrug');
    expect(gestureOf('Il boit son thé')).toBeNull();
    const talk = poseAt(awa, 1, { speaking: true, energy: 0.6, facing: 1 });
    expect(talk.lean).toBeGreaterThan(0);
    expect(poseAt(awa, 1, { speaking: true, energy: 0.6, facing: -1 }).lean).toBeLessThan(0);
    expect(poseAt(awa, 1, { speaking: false, energy: 0, gesture: 'head-hands' }).arms.every((a) => a > 0.9)).toBe(true);
    const j = [0.1, 0.2, 0.3].map((t) => poseAt(awa, t, { speaking: false, energy: 0, gesture: 'jump' }).jump);
    expect(Math.max(...j)).toBeGreaterThan(0.02);
    // The jaw: a closed mouth opens by dropping the chin; a mouth painted open closes at rest (lower lip rises).
    expect(jawOffset(130, 100, 20, 1, 0)).toBeGreaterThan(0);
    expect(jawOffset(130, 100, 20, 0, 0)).toBe(0);
    expect(jawOffset(110, 100, 20, 0, 1)).toBeLessThan(0);
    expect(Math.abs(jawOffset(110, 100, 20, 1, 1))).toBe(0);
    expect(jawOffset(80, 100, 20, 1, 0)).toBe(0); // above the mouth: nothing moves
  });
  it('the mesh moves the character but its border stays put (attached to the background)', () => {
    const pose = poseAt(awa, 0.4, { speaking: true, energy: 0.6, action: 'salue' });
    const g = warpGrid(awa, pose);
    const idx = (i: number, j: number) => j * (g.cols + 1) + i;
    for (const [i, j] of [[0, 0], [g.cols, 0], [0, g.rows], [g.cols, g.rows], [5, 0]] as const) expect(g.dst[idx(i, j)]).toEqual(g.src[idx(i, j)]);
    const moved = g.dst.filter((d, k) => Math.hypot(d.x - g.src[k]!.x, d.y - g.src[k]!.y) > 0.001).length;
    expect(moved).toBeGreaterThan(10);
    const eye = deformPoint(awa, pose, awa.eyes[0]!);
    expect(Math.hypot(eye.x - awa.eyes[0]!.x, eye.y - awa.eyes[0]!.y)).toBeLessThan(0.05);
  });
});
