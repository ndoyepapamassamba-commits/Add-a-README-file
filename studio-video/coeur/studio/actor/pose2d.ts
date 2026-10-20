/**
 * POSE DU DESSIN — the engine pose that matches a drawn character (its BlazePose skeleton measured on the planche): the
 * limbs are read in the picture plane (a drawing is a flat view), so the 3D body can take the SAME pose as the drawing
 * before the drawing is projected onto it as its skin (camera projection, the VFX way). Pure.
 */
import { BP, type SheetBody } from './puppetMotion';
import { SKELETON, restPose, type Pose } from './skeleton';
import { JOINT_INDEX } from './skeleton';
import { qAxis, qMul, qInv, type Q } from './math';

type P = [number, number];
/** Angle (radians, counter-clockwise, y UP) of the picture direction from a to b (picture y points down). */
const angleOf = (a: P, b: P) => Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
/** The engine's T-pose angle of a bone whose canonical direction is `dir` (x right, y up). */
const canonAngle = (dir: P) => Math.atan2(dir[1], dir[0]);
const wrap = (a: number) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

/**
 * The pose of the drawing: rotations about the picture axis (Z) that bring each bone from the T-pose onto its drawn
 * direction; bones not measured keep the rest pose. `w`/`h` scale the fractions to pixels (aspect matters for angles).
 */
export function poseFromBody(body: SheetBody, w: number, h: number): Pose {
  const pose = restPose();
  const px = (k: number): P | null => (body[k] ? [body[k]![0] * w, body[k]![1] * h] : null);
  const set = (joint: string, q: Q) => {
    const i = JOINT_INDEX.get(joint)!;
    pose.rot[i] = q;
  };
  // World angle wanted for a bone (from its two landmarks) → local rotation given the parent's world rotation.
  const worldZ = new Map<string, number>();
  const chain = (joints: [string, number, number, P][]) => {
    for (const [joint, a, b, canon] of joints) {
      const pa = px(a);
      const pb = px(b);
      const j = SKELETON[JOINT_INDEX.get(joint)!]!;
      let parentZ = 0;
      for (let p = j.parent; p; p = SKELETON[JOINT_INDEX.get(p)!]!.parent) {
        const z = worldZ.get(p);
        if (z !== undefined) {
          parentZ = z;
          break;
        }
      }
      if (!pa || !pb) {
        worldZ.set(joint, parentZ);
        continue;
      }
      const want = wrap(angleOf(pa, pb) - canonAngle(canon));
      worldZ.set(joint, want);
      set(joint, qAxis([0, 0, 1], wrap(want - parentZ)));
    }
  };
  // Torso: hips → shoulders (canonical +Y); the pelvis itself stays upright, the spine leans.
  const lSh = px(BP.lSh);
  const rSh = px(BP.rSh);
  const lHip = px(BP.lHip);
  const rHip = px(BP.rHip);
  if (lSh && rSh && lHip && rHip) {
    const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const lean = wrap(angleOf(mid(lHip, rHip), mid(lSh, rSh)) - Math.PI / 2);
    // Spread over the three spine joints.
    for (const s of ['spine1', 'spine2', 'spine3']) set(s, qAxis([0, 0, 1], lean / 3));
    worldZ.set('spine3', lean);
  }
  // Head: the line from the shoulders' middle to the nose (canonical +Y), on neck + head.
  const nose = px(BP.nose);
  if (nose && lSh && rSh) {
    const tilt = wrap(angleOf([(lSh[0] + rSh[0]) / 2, (lSh[1] + rSh[1]) / 2], nose) - Math.PI / 2) - (worldZ.get('spine3') ?? 0);
    set('neck', qAxis([0, 0, 1], tilt * 0.4));
    set('head', qAxis([0, 0, 1], tilt * 0.6));
  }
  // Arms: upper arm then forearm, each relative to its parent (canonical +X left, −X right).
  chain([
    ['l_shoulder', BP.lSh, BP.lEl, [1, 0]],
    ['l_elbow', BP.lEl, BP.lWr, [1, 0]],
    ['r_shoulder', BP.rSh, BP.rEl, [-1, 0]],
    ['r_elbow', BP.rEl, BP.rWr, [-1, 0]],
  ]);
  // Legs (canonical −Y).
  chain([
    ['l_hip', BP.lHip, BP.lKn, [0, -1]],
    ['l_knee', BP.lKn, BP.lAn, [0, -1]],
    ['r_hip', BP.rHip, BP.rKn, [0, -1]],
    ['r_knee', BP.rKn, BP.rAn, [0, -1]],
  ]);
  return pose;
}

/** The world (picture-plane) rotation of a joint from a pose — for tests and the projector fit. */
export function worldRotZ(pose: Pose, joint: string): Q {
  let q: Q = [0, 0, 0, 1];
  const chainUp: string[] = [];
  for (let j: string | null = joint; j; j = SKELETON[JOINT_INDEX.get(j)!]!.parent) chainUp.unshift(j);
  for (const j of chainUp) q = qMul(q, pose.rot[JOINT_INDEX.get(j)!]!);
  return q;
}
export const invQ = qInv;
