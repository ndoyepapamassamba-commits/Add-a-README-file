/**
 * ACTEUR VIRTUEL — the skeleton (SMPL-like body hierarchy + pointing hands), forward kinematics and joint limits.
 * Y up, the character faces +Z, its left is +X; rest pose = T-pose; every joint's rest orientation is the identity, so a
 * joint's local rotation is directly « how much it turned » (easy to retarget: Blender, three.js, SMPL, Mixamo).
 */
import { QI, add, qMul, qRot, clamp, qEuler, type Q, type V3 } from './math';

export interface JointDef {
  name: string;
  parent: string | null;
  /** Offset from the parent joint in the parent's rest frame (metres). */
  offset: V3;
  /** Euler limits (degrees) [minX, maxX, minY, maxY, minZ, maxZ], when the joint is constrained. */
  limits?: [number, number, number, number, number, number];
}
const J = (name: string, parent: string | null, offset: V3, limits?: JointDef['limits']): JointDef => ({ name, parent, offset, ...(limits ? { limits } : {}) });
const side = (s: 'l' | 'r') => (s === 'l' ? 1 : -1);
const arm = (s: 'l' | 'r'): JointDef[] => {
  const k = side(s);
  return [
    J(`${s}_collar`, 'spine3', [0.05 * k, 0.1, 0]),
    J(`${s}_shoulder`, `${s}_collar`, [0.11 * k, 0.0, 0]),
    J(`${s}_elbow`, `${s}_shoulder`, [0.26 * k, 0, 0]),
    J(`${s}_wrist`, `${s}_elbow`, [0.24 * k, 0, 0]),
    J(`${s}_hand`, `${s}_wrist`, [0.08 * k, 0, 0]),
    J(`${s}_index1`, `${s}_wrist`, [0.09 * k, 0, 0.02]),
    J(`${s}_index2`, `${s}_index1`, [0.035 * k, 0, 0]),
    J(`${s}_index3`, `${s}_index2`, [0.03 * k, 0, 0]),
    J(`${s}_thumb1`, `${s}_wrist`, [0.03 * k, -0.01, 0.04]),
    J(`${s}_thumb2`, `${s}_thumb1`, [0.03 * k, 0, 0.02]),
  ];
};
const leg = (s: 'l' | 'r'): JointDef[] => {
  const k = side(s);
  return [
    J(`${s}_hip`, 'pelvis', [0.09 * k, -0.06, 0]),
    // Knee: flexion only (rotation about +X), small twist.
    J(`${s}_knee`, `${s}_hip`, [0, -0.42, 0], [0, 150, -10, 10, -5, 5]),
    J(`${s}_ankle`, `${s}_knee`, [0, -0.4, 0], [-45, 40, -25, 25, -20, 20]),
    J(`${s}_toe`, `${s}_ankle`, [0, -0.06, 0.13]),
  ];
};
/** The bone hierarchy (parents always listed before their children). */
export const SKELETON: JointDef[] = [
  J('pelvis', null, [0, 0.95, 0]),
  J('spine1', 'pelvis', [0, 0.1, 0], [-30, 40, -30, 30, -25, 25]),
  J('spine2', 'spine1', [0, 0.12, 0], [-25, 35, -30, 30, -25, 25]),
  J('spine3', 'spine2', [0, 0.12, 0], [-25, 35, -30, 30, -25, 25]),
  J('neck', 'spine3', [0, 0.13, 0], [-40, 45, -60, 60, -35, 35]),
  J('head', 'neck', [0, 0.1, 0.01], [-40, 40, -70, 70, -35, 35]),
  J('head_top', 'head', [0, 0.3, 0]),
  ...arm('l'),
  ...arm('r'),
  ...leg('l'),
  ...leg('r'),
];
export const JOINT_INDEX = new Map(SKELETON.map((j, i) => [j.name, i]));
export const jointIndex = (name: string) => {
  const i = JOINT_INDEX.get(name);
  if (i === undefined) throw new Error(`articulation inconnue : ${name}`);
  return i;
};

export interface Pose {
  /** World position of the pelvis (root). */
  root: V3;
  /** Local rotation of every joint (index = SKELETON order). */
  rot: Q[];
}
export const restPose = (): Pose => ({ root: [...SKELETON[0]!.offset] as V3, rot: SKELETON.map(() => [...QI] as Q) });

export interface WorldPose {
  pos: V3[];
  rot: Q[];
}
/** Forward kinematics: world position and orientation of every joint. */
export function fk(p: Pose): WorldPose {
  const pos: V3[] = [];
  const rot: Q[] = [];
  SKELETON.forEach((j, i) => {
    if (j.parent === null) {
      pos.push(p.root);
      rot.push(p.rot[i]!);
      return;
    }
    const pi = jointIndex(j.parent);
    pos.push(add(pos[pi]!, qRot(rot[pi]!, j.offset)));
    rot.push(qMul(rot[pi]!, p.rot[i]!));
  });
  return { pos, rot };
}

/** Euler (X, Y, Z intrinsic) of a quaternion, radians. */
export function eulerOf(q: Q): V3 {
  const [x, y, z, w] = q;
  const sy = clamp(2 * (x * z + w * y), -1, 1);
  const ay = Math.asin(sy);
  const ax = Math.atan2(2 * (w * x - y * z), 1 - 2 * (x * x + y * y));
  const az = Math.atan2(2 * (w * z - x * y), 1 - 2 * (y * y + z * z));
  return [ax, ay, az];
}
const D = Math.PI / 180;
/** Clamps every constrained joint into its anatomical range (the actor can never bend a knee backwards). */
export function applyLimits(p: Pose): Pose {
  const rot = p.rot.map((q, i) => {
    const lim = SKELETON[i]!.limits;
    if (!lim) return q;
    const [x, y, z] = eulerOf(q);
    return qEuler(clamp(x, lim[0] * D, lim[1] * D), clamp(y, lim[2] * D, lim[3] * D), clamp(z, lim[4] * D, lim[5] * D));
  });
  return { root: p.root, rot };
}
