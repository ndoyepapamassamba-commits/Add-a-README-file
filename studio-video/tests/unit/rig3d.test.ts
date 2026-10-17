import { describe, expect, it } from 'vitest';
import { buildRetarget, matchBones, normalizeName, qFromTwo, retargetPose, sideOf, type RigBone, type RigRest } from '../../coeur/studio/actor/rig3d';
import { SKELETON, jointIndex } from '../../coeur/studio/actor/skeleton';
import { qAxis, qRot, type Q, type V3 } from '../../coeur/studio/actor/math';

const near = (a: V3, b: V3, eps = 1e-3) => a.every((x, i) => Math.abs(x - b[i]!) < eps);

/** A rig from (name, parent name, rest position, rest rotation = identity). */
function rig(spec: [string, string | null, V3][]): { bones: RigBone[]; rest: RigRest } {
  const bones = spec.map(([name, parent]) => ({ name, parent: parent === null ? -1 : spec.findIndex((s) => s[0] === parent) }));
  return { bones, rest: { pos: spec.map((s) => s[2]), rot: spec.map(() => [0, 0, 0, 1] as Q) } };
}
/** Mixamo A-pose (arms 45° down), facing +Z, left = +X. */
const mixamo = rig([
  ['mixamorig:Hips', null, [0, 1.0, 0]],
  ['mixamorig:Spine', 'mixamorig:Hips', [0, 1.1, 0]],
  ['mixamorig:Spine1', 'mixamorig:Spine', [0, 1.22, 0]],
  ['mixamorig:Spine2', 'mixamorig:Spine1', [0, 1.34, 0]],
  ['mixamorig:Neck', 'mixamorig:Spine2', [0, 1.5, 0]],
  ['mixamorig:Head', 'mixamorig:Neck', [0, 1.6, 0]],
  ['mixamorig:HeadTop_End', 'mixamorig:Head', [0, 1.8, 0]],
  ['mixamorig:LeftShoulder', 'mixamorig:Spine2', [0.05, 1.45, 0]],
  ['mixamorig:LeftArm', 'mixamorig:LeftShoulder', [0.18, 1.45, 0]],
  ['mixamorig:LeftForeArm', 'mixamorig:LeftArm', [0.18 + 0.2, 1.45 - 0.2, 0]],
  ['mixamorig:LeftHand', 'mixamorig:LeftForeArm', [0.18 + 0.4, 1.45 - 0.4, 0]],
  ['mixamorig:LeftHandIndex1', 'mixamorig:LeftHand', [0.18 + 0.47, 1.45 - 0.47, 0]],
  ['mixamorig:RightShoulder', 'mixamorig:Spine2', [-0.05, 1.45, 0]],
  ['mixamorig:RightArm', 'mixamorig:RightShoulder', [-0.18, 1.45, 0]],
  ['mixamorig:RightForeArm', 'mixamorig:RightArm', [-0.38, 1.25, 0]],
  ['mixamorig:RightHand', 'mixamorig:RightForeArm', [-0.58, 1.05, 0]],
  ['mixamorig:LeftUpLeg', 'mixamorig:Hips', [0.1, 0.95, 0]],
  ['mixamorig:LeftLeg', 'mixamorig:LeftUpLeg', [0.1, 0.5, 0]],
  ['mixamorig:LeftFoot', 'mixamorig:LeftLeg', [0.1, 0.08, 0]],
  ['mixamorig:LeftToeBase', 'mixamorig:LeftFoot', [0.1, 0.02, 0.12]],
  ['mixamorig:LeftToe_End', 'mixamorig:LeftToeBase', [0.1, 0.0, 0.2]],
  ['mixamorig:RightUpLeg', 'mixamorig:Hips', [-0.1, 0.95, 0]],
  ['mixamorig:RightLeg', 'mixamorig:RightUpLeg', [-0.1, 0.5, 0]],
  ['mixamorig:RightFoot', 'mixamorig:RightLeg', [-0.1, 0.08, 0]],
  ['mixamorig:RightToeBase', 'mixamorig:RightFoot', [-0.1, 0.02, 0.12]],
]);

describe('rig humanoïde universel', () => {
  it('names: prefixes stripped, sides read in every convention', () => {
    expect(normalizeName('mixamorig:LeftForeArm')).toBe('leftforearm');
    expect(normalizeName('DEF-upper_arm.L.001')).toBe('upper_arm_l_001');
    expect(normalizeName('J_Bip_L_UpperArm')).toBe('left_upperarm');
    expect(sideOf('leftforearm')).toBe('l');
    expect(sideOf('upper_arm_l_001')).toBe('l');
    expect(sideOf('arm_joint_r_2')).toBe('r');
    expect(sideOf('leg_joint_l_1')).toBe('l');
    expect(sideOf('spine')).toBeNull();
    expect(sideOf('lowerleg_r')).toBe('r');
  });
  it('Mixamo: every engine joint finds its bone, end sites are ignored', () => {
    const m = matchBones(mixamo.bones);
    const name = (k: string) => mixamo.bones[m[k]!]?.name;
    expect(name('pelvis')).toBe('mixamorig:Hips');
    expect(name('spine1')).toBe('mixamorig:Spine');
    expect(name('spine2')).toBe('mixamorig:Spine1');
    expect(name('spine3')).toBe('mixamorig:Spine2');
    expect(name('neck')).toBe('mixamorig:Neck');
    expect(name('head')).toBe('mixamorig:Head');
    expect(name('l_collar')).toBe('mixamorig:LeftShoulder');
    expect(name('l_shoulder')).toBe('mixamorig:LeftArm');
    expect(name('l_elbow')).toBe('mixamorig:LeftForeArm');
    expect(name('l_wrist')).toBe('mixamorig:LeftHand');
    expect(name('l_index1')).toBe('mixamorig:LeftHandIndex1');
    expect(name('r_wrist')).toBe('mixamorig:RightHand');
    expect(name('l_hip')).toBe('mixamorig:LeftUpLeg');
    expect(name('l_knee')).toBe('mixamorig:LeftLeg');
    expect(name('l_ankle')).toBe('mixamorig:LeftFoot');
    expect(name('l_toe')).toBe('mixamorig:LeftToeBase');
    expect(Object.values(m)).not.toContain(mixamo.bones.findIndex((b) => b.name === 'mixamorig:HeadTop_End'));
  });
  it('VRM, Khronos (numbered chains) and Rigify (segmented bones) are recognised too', () => {
    const vrm = matchBones([
      { name: 'hips', parent: -1 }, { name: 'spine', parent: 0 }, { name: 'chest', parent: 1 }, { name: 'upperChest', parent: 2 }, { name: 'neck', parent: 3 }, { name: 'head', parent: 4 },
      { name: 'leftShoulder', parent: 3 }, { name: 'leftUpperArm', parent: 6 }, { name: 'leftLowerArm', parent: 7 }, { name: 'leftHand', parent: 8 },
      { name: 'leftUpperLeg', parent: 0 }, { name: 'leftLowerLeg', parent: 10 }, { name: 'leftFoot', parent: 11 }, { name: 'leftToes', parent: 12 },
    ]);
    expect([vrm.pelvis, vrm.spine1, vrm.spine2, vrm.spine3, vrm.neck, vrm.head]).toEqual([0, 1, 2, 3, 4, 5]);
    expect([vrm.l_collar, vrm.l_shoulder, vrm.l_elbow, vrm.l_wrist]).toEqual([6, 7, 8, 9]);
    expect([vrm.l_hip, vrm.l_knee, vrm.l_ankle, vrm.l_toe]).toEqual([10, 11, 12, 13]);
    const kh = matchBones([
      { name: 'Z_UP', parent: -1 }, { name: 'Armature', parent: 0 }, { name: 'torso_joint_1', parent: 1 }, { name: 'torso_joint_2', parent: 2 }, { name: 'torso_joint_3', parent: 3 },
      { name: 'neck_joint_1', parent: 4 }, { name: 'neck_joint_2', parent: 5 },
      { name: 'arm_joint_L_1', parent: 4 }, { name: 'arm_joint_L_2', parent: 7 }, { name: 'arm_joint_L_3', parent: 8 },
      { name: 'leg_joint_L_1', parent: 2 }, { name: 'leg_joint_L_2', parent: 10 }, { name: 'leg_joint_L_3', parent: 11 }, { name: 'leg_joint_L_5', parent: 12 },
    ]);
    expect([kh.pelvis, kh.spine1, kh.spine3, kh.neck, kh.head]).toEqual([2, 3, 4, 5, 6]);
    expect([kh.l_shoulder, kh.l_elbow, kh.l_wrist]).toEqual([7, 8, 9]);
    expect(kh.l_collar).toBeUndefined();
    expect([kh.l_hip, kh.l_knee, kh.l_ankle, kh.l_toe]).toEqual([10, 11, 12, 13]);
    const rf = matchBones([
      { name: 'DEF-spine', parent: -1 }, { name: 'DEF-spine.001', parent: 0 }, { name: 'DEF-spine.003', parent: 1 }, { name: 'DEF-spine.004', parent: 2 }, { name: 'DEF-spine.006', parent: 3 },
      { name: 'DEF-shoulder.L', parent: 2 }, { name: 'DEF-upper_arm.L', parent: 5 }, { name: 'DEF-upper_arm.L.001', parent: 6 }, { name: 'DEF-forearm.L', parent: 7 }, { name: 'DEF-forearm.L.001', parent: 8 }, { name: 'DEF-hand.L', parent: 9 },
      { name: 'MCH-upper_arm_ik.L', parent: 5 },
    ]);
    expect([rf.l_collar, rf.l_shoulder, rf.l_elbow, rf.l_wrist]).toEqual([5, 6, 8, 10]);
  });
  it('T-pose normalisation: an A-pose arm is driven as if it pointed along +X; the body faces +Z', () => {
    const m = matchBones(mixamo.bones);
    const rt = buildRetarget(mixamo.bones, mixamo.rest, m);
    // The virtual T-pose: the upper arm's rest direction (down-outward) is mapped onto +X.
    const b = m.l_shoulder!;
    const restDir: V3 = [Math.SQRT1_2, -Math.SQRT1_2, 0];
    const t = rt.tpose[b]!;
    // tpose = fix × rest(identity) → applying it to the rest direction gives +X.
    expect(near(qRot(t, restDir), [1, 0, 0])).toBe(true);
    expect(near(qRot(rt.body, [0, 1, 0]), [0, 1, 0])).toBe(true);
    // Identity engine pose → the arm hangs along +X (T-pose); −90° about Z on the shoulder → arm straight down.
    const rest = SKELETON.map(() => [0, 0, 0, 1] as Q);
    const out = retargetPose(rt, mixamo.bones, rest, [0, 0.95, 0]);
    const world = (loc: Q[], i: number): Q => {
      const chain: number[] = [];
      for (let k = i; k >= 0; k = mixamo.bones[k]!.parent) chain.unshift(k);
      return chain.reduce<Q>((acc, k) => {
        const q = loc[k]!;
        const [ax, ay, az, aw] = acc;
        const [bx, by, bz, bw] = q;
        return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
      }, [0, 0, 0, 1]);
    };
    expect(near(qRot(world(out.local, b), restDir), [1, 0, 0])).toBe(true);
    const down = rest.map((q, i) => (i === jointIndex('l_shoulder') ? qAxis([0, 0, 1], -Math.PI / 2) : q));
    const out2 = retargetPose(rt, mixamo.bones, down, [0, 0.95, 0]);
    expect(near(qRot(world(out2.local, b), restDir), [0, -1, 0])).toBe(true);
    // The hips offset follows the engine root (a crouch of 10 cm).
    expect(near(retargetPose(rt, mixamo.bones, rest, [0, 0.85, 0]).hipsOffset, [0, -0.1, 0])).toBe(true);
  });
  it('a model facing −Z (left at −X) is turned to face +Z by the body fix', () => {
    const mirrored = rig(mixamo.bones.map((b, i) => [b.name, b.parent < 0 ? null : mixamo.bones[b.parent]!.name, [-mixamo.rest.pos[i]![0], mixamo.rest.pos[i]![1], -mixamo.rest.pos[i]![2]] as V3]));
    const rt = buildRetarget(mirrored.bones, mirrored.rest, matchBones(mirrored.bones));
    expect(near(qRot(rt.body, [-1, 0, 0]), [1, 0, 0])).toBe(true);
    expect(near(qRot(rt.body, [0, 0, -1]), [0, 0, 1])).toBe(true);
  });
  it('qFromTwo aligns a frame exactly', () => {
    const q = qFromTwo([0, 0, 1], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    expect(near(qRot(q, [0, 0, 1]), [0, 1, 0])).toBe(true);
    expect(near(qRot(q, [1, 0, 0]), [0, 0, 1])).toBe(true);
  });
});
