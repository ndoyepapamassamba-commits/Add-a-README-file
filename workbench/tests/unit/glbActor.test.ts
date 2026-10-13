import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GlbActor, fingerFollowers } from '../../direct/lib/studio/glbActor';
import { applyHands } from '../../server/jev/studio/actor/hands';
import { JOINT_INDEX, SKELETON } from '../../server/jev/studio/actor/skeleton';
import { QI, type Q } from '../../server/jev/studio/actor/math';
import type { Frame } from '../../server/jev/studio/actor/actor';

/** A Mixamo-named rig with an index AND a middle finger on the left hand (positions as in rig3d.test). */
function mixamoScene(): THREE.Object3D {
  const spec: [string, string | null, [number, number, number]][] = [
    ['mixamorig:Hips', null, [0, 1.0, 0]],
    ['mixamorig:Spine', 'mixamorig:Hips', [0, 1.1, 0]],
    ['mixamorig:Spine1', 'mixamorig:Spine', [0, 1.22, 0]],
    ['mixamorig:Spine2', 'mixamorig:Spine1', [0, 1.34, 0]],
    ['mixamorig:Neck', 'mixamorig:Spine2', [0, 1.5, 0]],
    ['mixamorig:Head', 'mixamorig:Neck', [0, 1.6, 0]],
    ['mixamorig:LeftShoulder', 'mixamorig:Spine2', [0.05, 1.45, 0]],
    ['mixamorig:LeftArm', 'mixamorig:LeftShoulder', [0.18, 1.45, 0]],
    ['mixamorig:LeftForeArm', 'mixamorig:LeftArm', [0.38, 1.25, 0]],
    ['mixamorig:LeftHand', 'mixamorig:LeftForeArm', [0.58, 1.05, 0]],
    ['mixamorig:LeftHandIndex1', 'mixamorig:LeftHand', [0.65, 0.98, 0]],
    ['mixamorig:LeftHandIndex2', 'mixamorig:LeftHandIndex1', [0.68, 0.95, 0]],
    ['mixamorig:LeftHandIndex3', 'mixamorig:LeftHandIndex2', [0.7, 0.93, 0]],
    ['mixamorig:LeftHandMiddle1', 'mixamorig:LeftHand', [0.65, 0.98, 0.02]],
    ['mixamorig:LeftHandMiddle2', 'mixamorig:LeftHandMiddle1', [0.68, 0.95, 0.02]],
    ['mixamorig:LeftHandMiddle3', 'mixamorig:LeftHandMiddle2', [0.7, 0.93, 0.02]],
    ['mixamorig:LeftHandPinky1', 'mixamorig:LeftHand', [0.64, 0.98, 0.05]],
    ['mixamorig:RightShoulder', 'mixamorig:Spine2', [-0.05, 1.45, 0]],
    ['mixamorig:RightArm', 'mixamorig:RightShoulder', [-0.18, 1.45, 0]],
    ['mixamorig:RightForeArm', 'mixamorig:RightArm', [-0.38, 1.25, 0]],
    ['mixamorig:RightHand', 'mixamorig:RightForeArm', [-0.58, 1.05, 0]],
    ['mixamorig:LeftUpLeg', 'mixamorig:Hips', [0.1, 0.95, 0]],
    ['mixamorig:LeftLeg', 'mixamorig:LeftUpLeg', [0.1, 0.5, 0]],
    ['mixamorig:LeftFoot', 'mixamorig:LeftLeg', [0.1, 0.08, 0]],
    ['mixamorig:RightUpLeg', 'mixamorig:Hips', [-0.1, 0.95, 0]],
    ['mixamorig:RightLeg', 'mixamorig:RightUpLeg', [-0.1, 0.5, 0]],
    ['mixamorig:RightFoot', 'mixamorig:RightLeg', [-0.1, 0.08, 0]],
  ];
  const root = new THREE.Group();
  const nodes = new Map<string, THREE.Bone>();
  for (const [name, parent, pos] of spec) {
    const b = new THREE.Bone();
    b.name = name;
    const p = parent ? nodes.get(parent)! : null;
    const pp = p ? spec.find((s) => s[0] === parent)![2] : [0, 0, 0];
    b.position.set(pos[0] - pp[0], pos[1] - pp[1], pos[2] - pp[2]);
    (p ?? root).add(b);
    nodes.set(name, b);
  }
  // A body volume so the model has a height (the actor is scaled by it).
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.7, 0.2), new THREE.MeshStandardMaterial());
  body.position.y = 0.85;
  root.add(body);
  root.updateMatrixWorld(true);
  return root;
}

describe('GlbActor — the other fingers follow the index (J2 « mains »)', () => {
  it('middle and little phalanges are paired with the index phalanx of the same rank, on the hand that has them', () => {
    const actor = GlbActor.fromScene(mixamoScene(), 1.72);
    expect(actor.mapped.l_index1).toBe('mixamorig:LeftHandIndex1');
    const names = (actor as unknown as { followers: { from: number; to: number }[]; nodes: THREE.Object3D[] }).followers.map((f) => `${(actor as unknown as { nodes: THREE.Object3D[] }).nodes[f.from]!.name}→${(actor as unknown as { nodes: THREE.Object3D[] }).nodes[f.to]!.name}`);
    expect(names).toContain('mixamorig:LeftHandIndex1→mixamorig:LeftHandMiddle1');
    expect(names).toContain('mixamorig:LeftHandIndex3→mixamorig:LeftHandMiddle3');
    expect(names).toContain('mixamorig:LeftHandIndex1→mixamorig:LeftHandPinky1');
    expect(names.filter((n) => n.includes('Right')).length).toBe(0);
  });
  it('a fist curls the middle finger exactly like the index (rotation relative to rest)', () => {
    const actor = GlbActor.fromScene(mixamoScene(), 1.72);
    const rot: Q[] = SKELETON.map(() => [...QI] as Q);
    actor.apply({ pose: { rot: applyHands(rot, { l: 'fist', r: 'fist' }), root: [0, 0.95, 0] } } as unknown as Frame);
    const node = (n: string) => actor.root.getObjectByName(n)!;
    const idx = node('mixamorig:LeftHandIndex1').quaternion;
    const mid = node('mixamorig:LeftHandMiddle1').quaternion;
    expect(Math.abs(idx.angleTo(new THREE.Quaternion()))).toBeGreaterThan(0.5); // the index is curled by the engine
    expect(mid.angleTo(idx)).toBeLessThan(1e-6); // …and the middle follows exactly
    expect(JOINT_INDEX.get('l_index1')).toBeDefined();
    // An open hand: both straighten again (the retarget keeps the rig's own rest offset, so « open » ≠ identity here).
    const fist = idx.clone();
    actor.apply({ pose: { rot: applyHands(rot, { l: 'open', r: 'open' }), root: [0, 0.95, 0] } } as unknown as Frame);
    expect(node('mixamorig:LeftHandIndex1').quaternion.angleTo(fist)).toBeGreaterThan(0.8);
    expect(node('mixamorig:LeftHandMiddle1').quaternion.angleTo(node('mixamorig:LeftHandIndex1').quaternion)).toBeLessThan(1e-6);
  });
  it('fingerFollowers: nothing on a rig without extra fingers', () => {
    const actor = GlbActor.fromScene(mixamoScene(), 1.72);
    const f = fingerFollowers([{ name: 'hips', parent: -1 }], (actor as unknown as { rt: { bone: number[] } }).rt as never);
    expect(f).toEqual([]);
  });
});
