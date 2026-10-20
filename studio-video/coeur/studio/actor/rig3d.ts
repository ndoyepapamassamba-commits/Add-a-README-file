/**
 * RIG HUMANOÏDE UNIVERSEL — any rigged model (Mixamo, VRM / VRoid, UniRig, Make-It-Animatable, Rigify, Khronos samples…)
 * is recognised from its bone NAMES and HIERARCHY, normalised to the engine's T-pose the way Unity's humanoid Avatar
 * does (the correction of every bone's rest orientation is computed from the rest pose, never set by hand), and driven
 * by the engine skeleton (retargeting). Pure: plain arrays, no three.js.
 *
 * Conventions of the engine (skeleton.ts): Y up, the character faces +Z, its left is +X, rest = T-pose with every
 * joint's rest orientation = identity. A model may face anywhere and stand in A-pose: the normalisation absorbs it.
 */
import { JOINT_INDEX, SKELETON, type JointDef } from './skeleton';
import { cross, dot, norm, qFromTo, qInv, qMul, qNorm, qRot, scale, sub, type Q, type V3 } from './math';

/** A bone of a rigged model: its name and the index of its parent in the same array (−1 = a root). */
export interface RigBone {
  name: string;
  parent: number;
}
/** Engine joint name → bone index. */
export type BoneMap = Partial<Record<string, number>>;

/** Control / helper bones that never deform (Rigify, Mixamo end sites…). */
const SKIP = /(^|[_.\-\s])(end|top|ik|pole|target|ctrl|mch|org|root|tweak|fk|master|eye|jaw|breast|tail|prop)([_.\-\s0-9]|$)|_end$|top_end|^(armature|z_up|y_up|scene|skeleton|rig|proxy)$/;

/** The name without its rig prefix, lower-case, separators kept as `_`. */
export function normalizeName(raw: string): string {
  let n = raw.trim().toLowerCase();
  n = n.replace(/^(mixamorig[:_]?|skeleton_|bip0?1[_\s]?|character1_|def-|armature\|)/, '');
  n = n.replace(/^j_bip_[clr]_/, (m) => (m === 'j_bip_c_' ? '' : m[6] === 'l' ? 'left_' : 'right_'));
  n = n.replace(/[.\-\s:|]+/g, '_').replace(/__+/g, '_');
  return n;
}

/** Which side a bone belongs to, from its name (null = centre). */
export function sideOf(n: string): 'l' | 'r' | null {
  if (/(^|_)(left|l)(_|$|[a-z](?=[a-z]))/.test(n) || /^left/.test(n) || /(^|_)l(?=[a-z])/.test(n.replace(/leg|lower|lip|low/g, ''))) {
    if (!/(^|_)(right|r)(_|$)/.test(n) && !/^right/.test(n)) return 'l';
  }
  if (/(^|_)(right|r)(_|$)/.test(n) || /^right/.test(n) || /(^|_)r(?=[a-z])/.test(n.replace(/ring|root|rot/g, ''))) return 'r';
  if (/(^|_)(left|l)(_|$)/.test(n) || /^left/.test(n)) return 'l';
  return null;
}

type Limb = { joints: string[]; broad: RegExp; specific: (RegExp | null)[]; optional: 'first' | 'last' };
/**
 * Per side: the engine joints of a limb in chain order, the broad test of the limb, the specific test of each joint
 * and which joint a shorter chain lacks (an arm without clavicle, a leg without toes).
 */
const LIMBS: Record<string, Limb> = {
  arm: {
    joints: ['collar', 'shoulder', 'elbow', 'wrist'],
    broad: /shoulder|clavicle|collar|arm|elbow|hand|wrist/,
    specific: [/shoulder|clavicle|collar/, /upperarm|upper_arm|uparm|(^|_)arm(_|$)|humerus/, /forearm|fore_arm|lowerarm|lower_arm|elbow|radius|ulna/, /hand|wrist|palm/],
    optional: 'first',
  },
  leg: {
    joints: ['hip', 'knee', 'ankle', 'toe'],
    broad: /leg|thigh|shin|calf|knee|foot|ankle|toe|hip(?!s)/,
    specific: [/upleg|up_leg|upperleg|upper_leg|thigh|femur|(^|_)hip(_|$)/, /lowerleg|lower_leg|shin|calf|knee|tibia|(^|_)leg(_|$)/, /foot|ankle/, /toe/],
    optional: 'last',
  },
  index: { joints: ['index1', 'index2', 'index3'], broad: /index/, specific: [null, null, null], optional: 'last' },
  thumb: { joints: ['thumb1', 'thumb2'], broad: /thumb/, specific: [null, null], optional: 'last' },
};
const isFinger = (n: string) => /index|thumb|middle|ring|pinky|little|finger/.test(n);
/** The name without its trailing number (« arm_joint_l_2 » → « arm_joint_l », « upper_arm_l_001 » → « upper_arm_l »). */
const stem = (n: string) => n.replace(/_?\d+$/, '');

/** The depth of every bone (root = 0). */
function depths(bones: RigBone[]): number[] {
  const d: number[] = [];
  bones.forEach((b, i) => (d[i] = b.parent < 0 ? 0 : d[b.parent]! + 1));
  return d;
}

/**
 * Recognises the humanoid bones of a model: hips and spine chain, neck and head, arms, legs, index and thumb.
 * Bones are expected parents-first (any traversal order of the hierarchy).
 */
export function matchBones(bones: RigBone[]): BoneMap {
  const names = bones.map((b) => normalizeName(b.name));
  const dep = depths(bones);
  const map: BoneMap = {};
  const usable = names.map((n) => !SKIP.test(n));
  // 1) The torso chain: hips / pelvis / spine / chest / torso, by depth.
  const torso = bones
    .map((_, i) => i)
    .filter((i) => usable[i] && !sideOf(names[i]!) && /hips|pelvis|spine|chest|torso|waist|body/.test(names[i]!) && !isFinger(names[i]!) && !/neck|head/.test(names[i]!))
    .sort((a, b) => dep[a]! - dep[b]!);
  if (torso.length) {
    map.pelvis = torso[0];
    const rest = torso.slice(1);
    if (rest.length === 1) map.spine2 = rest[0];
    else if (rest.length === 2) {
      map.spine1 = rest[0];
      map.spine3 = rest[1];
    } else if (rest.length >= 3) {
      map.spine1 = rest[0];
      map.spine2 = rest[1];
      map.spine3 = rest[rest.length - 1];
    }
  }
  // 2) Neck and head, by depth.
  const neckHead = bones
    .map((_, i) => i)
    .filter((i) => usable[i] && !sideOf(names[i]!) && /neck|head/.test(names[i]!))
    .sort((a, b) => dep[a]! - dep[b]!);
  const heads = neckHead.filter((i) => /head/.test(names[i]!));
  const necks = neckHead.filter((i) => /neck/.test(names[i]!));
  if (heads.length && necks.length) {
    map.neck = necks[0];
    map.head = heads[0];
  } else if (neckHead.length >= 2) {
    map.neck = neckHead[0];
    map.head = neckHead[1];
  } else if (neckHead.length === 1) map.head = neckHead[0];
  // 3) Limbs per side: candidates by depth, assigned in chain order (a specific keyword may jump ahead).
  for (const side of ['l', 'r'] as const)
    for (const [kind, limb] of Object.entries(LIMBS)) {
      const cands = bones
        .map((_, i) => i)
        .filter((i) => usable[i] && sideOf(names[i]!) === side && limb.broad.test(names[i]!) && (kind === 'index' || kind === 'thumb' ? true : !isFinger(names[i]!)))
        .sort((a, b) => dep[a]! - dep[b]!);
      if (!cands.length) continue;
      // A NUMBERED chain (« arm_joint_l_1/2/3 », « lefthandindex1/2/3 »): the bones in depth order, a short chain
      // lacking its optional joint.
      if (new Set(cands.map((i) => stem(names[i]!))).size === 1) {
        const joints = cands.length < limb.joints.length ? (limb.optional === 'first' ? limb.joints.slice(1) : limb.joints.slice(0, -1)) : limb.joints;
        cands.slice(0, joints.length).forEach((i, k) => (map[`${side}_${joints[k]}`] = i));
        continue;
      }
      // Named bones: each keyword takes its joint (a keyword may jump ahead: no clavicle, no toes); a segmented
      // duplicate (Rigify's « upper_arm.L.001 ») shares the stem of an assigned bone and is skipped.
      const taken = new Set<string>();
      let j = 0;
      for (const i of cands) {
        if (j >= limb.joints.length) break;
        const n = names[i]!;
        if (taken.has(stem(n))) continue;
        let at = -1;
        for (let k = j; k < limb.joints.length; k++)
          if (limb.specific[k]?.test(n)) {
            at = k;
            break;
          }
        if (at < 0) {
          if (limb.specific.some((re, k) => k < j && re?.test(n))) continue;
          at = j;
        }
        map[`${side}_${limb.joints[at]}`] = i;
        taken.add(stem(n));
        j = at + 1;
      }
    }
  return map;
}

/** Rest pose of the model: world (model-space) position and rotation of every bone. */
export interface RigRest {
  pos: V3[];
  rot: Q[];
}
export interface Retarget {
  /** Engine joint index → bone index (−1 = none). */
  bone: Int32Array;
  /** Per bone: engine joint index (−1 = not driven). */
  joint: Int32Array;
  /** Per bone: its world rotation in the virtual T-pose (fix × rest). */
  tpose: Q[];
  /** Per bone: rest local rotation (kept by undriven bones). */
  local: Q[];
  /** The whole-body fix (model rest → engine axes): facing +Z, left +X, up +Y. */
  body: Q;
  /** Model height axis length of the rest pose used for the scale (hips height, model units). */
  hipsHeight: number;
}

/** The rotation taking the frame (a1, a2) onto (b1, b2): a1 → b1 exactly, then a2 → b2 around b1. */
export function qFromTwo(a1: V3, a2: V3, b1: V3, b2: V3): Q {
  const q1 = qFromTo(a1, b1);
  const bn = norm(b1);
  const proj = (v: V3): V3 => sub(v, scale(bn, dot(v, bn)));
  const a2r = proj(qRot(q1, a2));
  const b2p = proj(b2);
  if (Math.hypot(...a2r) < 1e-6 || Math.hypot(...b2p) < 1e-6) return q1;
  // Opposite second axes: a half turn AROUND the first axis (never a flip of it).
  const an = norm(a2r);
  const bp = norm(b2p);
  if (dot(an, bp) < -0.999999) return qNorm(qMul([bn[0], bn[1], bn[2], 0], q1));
  return qNorm(qMul(qFromTo(a2r, b2p), q1));
}

/** Engine rest direction of the bone that goes from joint `from` to joint `to` (unit, engine axes). */
function canonDir(from: string, to: string): V3 {
  const j = SKELETON[JOINT_INDEX.get(to)!]!;
  if (j.parent !== from) {
    // Not a direct child: sum the offsets along the chain.
    let acc: V3 = [0, 0, 0];
    let cur: string | null = to;
    while (cur && cur !== from) {
      const d: JointDef = SKELETON[JOINT_INDEX.get(cur)!]!;
      acc = [acc[0] + d.offset[0], acc[1] + d.offset[1], acc[2] + d.offset[2]];
      cur = d.parent;
    }
    return norm(acc);
  }
  return norm(j.offset);
}

/** The engine child joint whose bone gives the direction of a driven bone (the first mapped one along the chain). */
const CHILD: Record<string, string[]> = {
  pelvis: ['spine1', 'spine2', 'spine3', 'neck'],
  spine1: ['spine2', 'spine3', 'neck'],
  spine2: ['spine3', 'neck'],
  spine3: ['neck', 'head'],
  neck: ['head'],
  l_collar: ['l_shoulder'],
  l_shoulder: ['l_elbow'],
  l_elbow: ['l_wrist'],
  l_wrist: ['l_index1'],
  l_index1: ['l_index2'],
  l_index2: ['l_index3'],
  l_thumb1: ['l_thumb2'],
  l_hip: ['l_knee'],
  l_knee: ['l_ankle'],
  l_ankle: ['l_toe'],
  r_collar: ['r_shoulder'],
  r_shoulder: ['r_elbow'],
  r_elbow: ['r_wrist'],
  r_wrist: ['r_index1'],
  r_index1: ['r_index2'],
  r_index2: ['r_index3'],
  r_thumb1: ['r_thumb2'],
  r_hip: ['r_knee'],
  r_knee: ['r_ankle'],
  r_ankle: ['r_toe'],
};

/**
 * Prepares the retargeting: the T-pose correction of every driven bone from the model's rest pose. `bones` are
 * parents-first; `rest` is their rest pose in model space.
 */
export function buildRetarget(bones: RigBone[], rest: RigRest, map: BoneMap): Retarget {
  const n = bones.length;
  const bone = new Int32Array(SKELETON.length).fill(-1);
  const joint = new Int32Array(n).fill(-1);
  for (const [name, b] of Object.entries(map)) {
    const i = JOINT_INDEX.get(name);
    if (i !== undefined && b !== undefined) {
      bone[i] = b;
      joint[b] = i;
    }
  }
  // The body fix: up = pelvis → spine (or hips → head), left–right = right hip → left hip (or the shoulders).
  const p = (k: string) => (map[k] !== undefined ? rest.pos[map[k]!]! : null);
  const hips = p('pelvis') ?? [0, 0, 0];
  const upTo = p('neck') ?? p('head') ?? p('spine3') ?? p('spine2') ?? p('spine1');
  const up: V3 = upTo ? norm(sub(upTo, hips)) : [0, 1, 0];
  const lHip = p('l_hip') ?? p('l_shoulder');
  const rHip = p('r_hip') ?? p('r_shoulder');
  const lr: V3 = lHip && rHip ? norm(sub(lHip, rHip)) : norm(cross([0, 0, 1], up));
  const body = qFromTwo(up, lr, [0, 1, 0], [1, 0, 0]);
  const tpose: Q[] = [];
  const local: Q[] = [];
  const fix: Q[] = [];
  for (let b = 0; b < n; b++) {
    const parent = bones[b]!.parent;
    local[b] = parent < 0 ? rest.rot[b]! : qMul(qInv(rest.rot[parent]!), rest.rot[b]!);
    const j = joint[b]!;
    let f: Q = parent >= 0 ? fix[parent]! : body;
    if (j >= 0) {
      const name = SKELETON[j]!.name;
      const childName = (CHILD[name] ?? []).find((c) => map[c] !== undefined);
      if (childName) {
        const d = qRot(body, norm(sub(rest.pos[map[childName]!]!, rest.pos[b]!)));
        f = qNorm(qMul(qFromTo(d, canonDir(name, childName)), body));
      } else f = parent >= 0 && joint[parent]! >= 0 ? fix[parent]! : body;
    }
    fix[b] = f;
    tpose[b] = qNorm(qMul(f, rest.rot[b]!));
  }
  const hipsHeight = map.pelvis !== undefined ? Math.abs(dot(rest.pos[map.pelvis]!, qRot(qInv(body), [0, 1, 0]))) : 1;
  return { bone, joint, tpose, local, body, hipsHeight };
}

/**
 * The model's bones for an engine pose: local rotation of every bone (parents-first) and the hips offset in model
 * space (to add to the hips' rest position). `rot` = the engine's local joint rotations, `root` its pelvis position
 * (metres); `scale` = model units per engine metre.
 */
export function retargetPose(rt: Retarget, bones: RigBone[], rot: Q[], root: V3, scale = 1): { local: Q[]; hipsOffset: V3 } {
  // Engine world rotations (rest = identity, parents first).
  const we: Q[] = [];
  SKELETON.forEach((j, i) => {
    const q = rot[i] ?? [0, 0, 0, 1];
    we[i] = j.parent === null ? q : qMul(we[JOINT_INDEX.get(j.parent)!]!, q);
  });
  const world: Q[] = [];
  const local: Q[] = [];
  for (let b = 0; b < bones.length; b++) {
    const parent = bones[b]!.parent;
    const wp: Q = parent < 0 ? [0, 0, 0, 1] : world[parent]!;
    const j = rt.joint[b]!;
    const w: Q = j >= 0 ? qNorm(qMul(we[j]!, rt.tpose[b]!)) : qMul(wp, rt.local[b]!);
    world[b] = w;
    local[b] = qNorm(qMul(qInv(wp), w));
  }
  const restRoot = SKELETON[0]!.offset;
  const delta: V3 = [root[0] - restRoot[0], root[1] - restRoot[1], root[2] - restRoot[2]];
  // Engine metres → model space (the model's own axes), then model units.
  const d: V3 = qRot(qInv(rt.body), [delta[0] * scale, delta[1] * scale, delta[2] * scale]);
  return { local, hipsOffset: d };
}
