/** Minimal 3D math for the actor engine (Y up, right-handed, metres). Quaternions are [x, y, z, w]. */
export type V3 = [number, number, number];
export type Q = [number, number, number, number];

export const v = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const smooth = (t: number) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};
/** Smooth 0→1 between t0 and t1. */
export const ramp = (t: number, t0: number, t1: number) => smooth((t - t0) / Math.max(1e-6, t1 - t0));
/** Smooth window: 0 before a, up over `fade`, 1 inside, down to 0 after b. */
export const win = (t: number, a: number, b: number, fade = 0.35) => Math.min(ramp(t, a - fade / 2, a + fade / 2), 1 - ramp(t, b - fade / 2, b + fade / 2));

export const QI: Q = [0, 0, 0, 1];
export const qMul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const qInv = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]];
export const qNorm = (q: Q): Q => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};
export const qAxis = (axis: V3, angle: number): Q => {
  const a = norm(axis);
  const s = Math.sin(angle / 2);
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(angle / 2)];
};
/** Intrinsic X then Y then Z (radians). */
export const qEuler = (x: number, y: number, z: number): Q => qMul(qMul(qAxis([1, 0, 0], x), qAxis([0, 1, 0], y)), qAxis([0, 0, 1], z));
export const qRot = (q: Q, p: V3): V3 => {
  const u: V3 = [q[0], q[1], q[2]];
  const t = scale(cross(u, p), 2);
  return add(add(p, scale(t, q[3])), cross(u, t));
};
/** Shortest rotation taking unit vector a onto unit vector b. */
export const qFromTo = (a: V3, b: V3): Q => {
  const an = norm(a);
  const bn = norm(b);
  const d = dot(an, bn);
  if (d < -0.999999) {
    let ax = cross([1, 0, 0], an);
    if (len(ax) < 1e-6) ax = cross([0, 1, 0], an);
    return qAxis(ax, Math.PI);
  }
  const c = cross(an, bn);
  return qNorm([c[0], c[1], c[2], 1 + d]);
};
export const qSlerp = (a: Q, b: Q, t: number): Q => {
  let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (cos < 0) {
    cos = -cos;
    bb = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (cos > 0.9995) return qNorm([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]);
  const th = Math.acos(cos);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
};
/** Rotation angle (radians) of a quaternion. */
export const qAngle = (q: Q) => 2 * Math.acos(clamp(Math.abs(q[3]), 0, 1));
