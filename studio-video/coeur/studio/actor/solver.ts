/**
 * Solvers of the actor: aim a bone at a direction, analytic two-bone IK (legs, arms) with a pole vector, look-at
 * distributed over neck + head. Everything works on local rotations and re-runs FK, so constraints and blending stay
 * possible on top.
 */
import { add, clamp, cross, dot, len, norm, qFromTo, qInv, qMul, qRot, scale, sub, type Q, type V3 } from './math';
import { SKELETON, fk, jointIndex, type Pose, type WorldPose } from './skeleton';

/** Turns joint `j` so that its bone (towards `child`) points along `dir` (world), keeping the parent untouched. */
export function aimBone(p: Pose, w: WorldPose, j: string, child: string, dir: V3): WorldPose {
  const ji = jointIndex(j);
  const ci = jointIndex(child);
  const cur = qRot(w.rot[ji]!, SKELETON[ci]!.offset);
  const arc = qFromTo(cur, dir);
  const world = qMul(arc, w.rot[ji]!);
  const parent = SKELETON[ji]!.parent;
  const pw = parent ? w.rot[jointIndex(parent)]! : ([0, 0, 0, 1] as Q);
  p.rot[ji] = qMul(qInv(pw), world);
  return fk(p);
}
/** Sets the WORLD orientation of joint j (its local rotation is solved from the parent's). */
export function setWorldRot(p: Pose, w: WorldPose, j: string, world: Q): WorldPose {
  const ji = jointIndex(j);
  const parent = SKELETON[ji]!.parent;
  const pw = parent ? w.rot[jointIndex(parent)]! : ([0, 0, 0, 1] as Q);
  p.rot[ji] = qMul(qInv(pw), world);
  return fk(p);
}
/**
 * Two-bone IK: joint a (hip / shoulder) → b (knee / elbow) → c (ankle / wrist) reaches `target`; the middle joint bends
 * towards `pole`. Unreachable targets are approached with the chain fully stretched (never a snap).
 */
export function twoBoneIK(p: Pose, w: WorldPose, a: string, b: string, c: string, target: V3, pole: V3): WorldPose {
  const A = w.pos[jointIndex(a)]!;
  const l1 = len(SKELETON[jointIndex(b)]!.offset);
  const l2 = len(SKELETON[jointIndex(c)]!.offset);
  const toT = sub(target, A);
  const d = clamp(len(toT), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-4);
  const dir = norm(toT);
  const ca = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - ca * ca));
  let pv = sub(pole, A);
  pv = sub(pv, scale(dir, dot(pv, dir)));
  if (len(pv) < 1e-6) pv = cross(dir, [1, 0, 0]);
  pv = norm(pv);
  const K = add(add(A, scale(dir, ca)), scale(pv, h));
  const T = add(A, scale(dir, d));
  let w2 = aimBone(p, w, a, b, sub(K, A));
  w2 = aimBone(p, w2, b, c, sub(T, w2.pos[jointIndex(b)]!));
  return w2;
}
/** Looks at a point: the yaw / pitch is shared between neck (40 %) and head (60 %), within the joint limits. */
export function lookAt(p: Pose, w: WorldPose, target: V3, weight = 1): WorldPose {
  const hi = jointIndex('head');
  const eye = add(w.pos[hi]!, [0, 0.12, 0]);
  const want = norm(sub(target, eye));
  // Current facing of the head (its local +Z in the world).
  const face = qRot(w.rot[hi]!, [0, 0, 1]);
  const full = qFromTo(face, norm([want[0] * weight + face[0] * (1 - weight), want[1] * weight + face[1] * (1 - weight), want[2] * weight + face[2] * (1 - weight)]));
  const half = (q: Q, k: number): Q => {
    const ang = 2 * Math.acos(clamp(q[3], -1, 1)) * k;
    const s = Math.sqrt(Math.max(1e-12, 1 - q[3] * q[3]));
    const ax: V3 = [q[0] / s, q[1] / s, q[2] / s];
    const sn = Math.sin(ang / 2);
    return [ax[0] * sn, ax[1] * sn, ax[2] * sn, Math.cos(ang / 2)];
  };
  let w2 = setWorldRot(p, w, 'neck', qMul(half(full, 0.4), w.rot[jointIndex('neck')]!));
  w2 = setWorldRot(p, w2, 'head', qMul(half(full, 1), w.rot[hi]!));
  return w2;
}
