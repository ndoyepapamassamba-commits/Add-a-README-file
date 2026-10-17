/**
 * DÉCOR EN RELIEF — the math of the living set (pure): the owner's set picture becomes a relief the camera moves
 * through (the « 3D photo » / DepthFlow technique): every point of the picture is pushed along the ray of the reference
 * camera to the distance its depth says — seen from that camera the picture is unchanged, seen from anywhere else the
 * near stalls slide over the far walls (true parallax). The lens blur grows with the distance.
 */

/** Where the reference camera stands (the two-shot camera of the theatre) and the plane of the flat set. */
export const RELIEF = { eye: [0, 1.3, 3.0] as const, planeZ: -1.6, nearestZ: -0.45, farthest: 2.3, gain: 1.1 } as const;

/**
 * Distance factor along the camera ray for a point of depth `d` (0 = far … 1 = near, Depth Anything convention after
 * normalisation): 1 keeps the point on the plane; the reference depth `dRef` (the median of the picture) stays there,
 * nearer points come forward but never in front of the actors (`nearestZ`), farther ones go back (≤ `farthest`).
 */
export function reliefScale(d: number, dRef: number, eyeZ: number = RELIEF.eye[2], planeZ: number = RELIEF.planeZ): number {
  const sMin = (eyeZ - RELIEF.nearestZ) / (eyeZ - planeZ);
  const s = 1 + RELIEF.gain * (dRef - d);
  return Math.min(RELIEF.farthest, Math.max(sMin, s));
}

/** A point of the plane pushed along the ray from the eye: P' = E + (P − E)·s. */
export function pushAlongRay(p: readonly [number, number, number], s: number, eye: readonly [number, number, number] = RELIEF.eye): [number, number, number] {
  return [eye[0] + (p[0] - eye[0]) * s, eye[1] + (p[1] - eye[1]) * s, eye[2] + (p[2] - eye[2]) * s];
}

/**
 * The depth of a set without a measured depth map (a picture imported later): the floor comes towards the camera
 * under the floor line, the walls stand at mid-depth, the top recedes a little.
 * `y` and `floor` are fractions of the picture height from the top.
 */
export function fallbackDepth(y: number, floor: number): number {
  const s = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return 0.3 + 0.25 * s(0, floor * 0.85, y) + 0.4 * s(floor * 0.85, floor + 0.25, y);
}

/** The lens blur of a point (0 = sharp … 1 = the softest layer): far things blur, a close-up blurs the set more. */
export function lensBlur(d: number, closeUp: number): number {
  const far = 1 - d;
  return Math.max(0, Math.min(0.5, (far - 0.4) * 0.7 + closeUp * 0.35));
}
