/**
 * VISAGE DESSINÉ — the face of the owner's drawing, animated on its own measured marks (lips, chin, eyes), as a GLSL
 * warp of the drawing itself: the lower lip and the jaw drop on the syllables (the inside of the mouth appears between
 * the lips), the mouth rounds (o, ou) or stretches (é, i), the brows rise or frown, the lids close over the drawn
 * eyes, the head turns about the neck. Shared by the flat cut-out (SheetActor) and the 3D body inflated from the
 * drawing (the projected skin): one face, whatever the body. Pose without marks: nothing is invented, the drawing stays.
 */
import * as THREE from 'three';
import type { SheetPose } from '../../../server/jev/studio/actor/cast3d';
import type { FaceState } from './actorBody';

export const FACE_GLSL = `
uniform float uA; uniform float uScaleM; uniform float uFace;
uniform vec2 uL; uniform vec2 uR; uniform vec2 uSeam; uniform vec2 uChin; uniform float uOpenArt; uniform vec3 uCav;
uniform float uJaw; uniform float uWide; uniform float uRound;
uniform float uHeadA; uniform vec2 uPivot; uniform float uNeck;
uniform vec4 uEye0; uniform vec4 uEye1; uniform float uEyes; uniform float uBlink; uniform vec3 uLid; uniform float uBrow;
vec2 toIso(vec2 uv) { return vec2(uv.x * uA, 1.0 - uv.y); }
vec2 fromIso(vec2 q) { return vec2(q.x / uA, 1.0 - q.y); }
float lumS(vec3 c) { vec3 s = pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); return dot(s, vec3(0.299, 0.587, 0.114)); }
float satS(vec3 c) { vec3 s = pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); return max(s.r, max(s.g, s.b)) - min(s.r, min(s.g, s.b)); }
// The brow above one drawn eye moves up (raised) or down (frown): the band above the eye is sampled lower / higher,
// fading out at the eye (which never moves) and at the forehead.
float browShift(vec2 p, vec4 e, float b) {
  float top = e.y - e.w;
  float dx = abs(p.x - e.x) / (e.z * 1.6);
  if (dx >= 1.0 || p.y > top || p.y < top - e.w * 2.6) return 0.0;
  float k = (top - p.y) / (e.w * 2.6);
  float w = smoothstep(0.0, 0.25, k) * (1.0 - smoothstep(0.55, 1.0, k)) * (1.0 - dx * dx);
  return b * e.w * 0.45 * w;
}
// Closing lid over one drawn eye (only over the eye's own pixels: its white, iris, lashes).
vec3 lidOver(vec3 col, vec2 p, vec4 e, float b) {
  vec2 u = (p - e.xy) / (e.zw * vec2(1.15, 1.25));
  if (dot(u, u) >= 1.0 || b <= 0.001) return col;
  float h = sqrt(max(0.0, 1.0 - u.x * u.x));
  float top = e.y - e.w * 1.25 * h;
  float bot = e.y + e.w * 1.05 * h;
  float yl = mix(top, bot, b);
  float L = lumS(col);
  float S = satS(col);
  float eye = max(step(0.6, L) * step(S, 0.3), step(L, 0.42));
  float lash = e.w * 0.16;
  if (p.y < yl - lash * 0.5) {
    float k = clamp((p.y - top) / max(1e-5, yl - top), 0.0, 1.0);
    return mix(col, uLid * (0.86 + 0.16 * k), eye);
  }
  if (p.y < yl + lash * 0.5) return mix(col, vec3(0.012, 0.008, 0.007), eye * smoothstep(0.0, 0.25, b));
  return col;
}
// The drawn face at a drawing coordinate (uvi: u right, v up, the whole drawing = 0..1): head turn, brows, jaw and
// lips, lids. Un-premultiplied colour + alpha; pOut = the (turned) iso point, uvsOut = where the drawing was read,
// gapOut = 1 inside the open mouth.
vec4 faceSample(sampler2D map, vec2 uvi, float lod, out vec2 pOut, out vec2 uvsOut, out float gapOut) {
  vec2 p = toIso(uvi);
  vec2 src = p;
  float inGap = 0.0;
  vec3 gapCol = vec3(0.0);
  if (uFace > 0.5) {
    // Head turns about the top of the neck (weight 1 above the chin, 0 under the neck).
    float hw = 1.0 - smoothstep(uChin.y, uPivot.y + uNeck, p.y);
    float a = uHeadA * hw;
    vec2 d = p - uPivot;
    p = uPivot + vec2(cos(a) * d.x - sin(a) * d.y, sin(a) * d.x + cos(a) * d.y);
    // Brows (only on faces whose two eyes were measured).
    if (uEyes > 1.5 && abs(uBrow) > 0.001) p.y += browShift(p, uEye0, uBrow) + browShift(p, uEye1, uBrow);
    // Mouth frame: s along the lips (corner to corner), t downwards.
    vec2 ax = normalize(uR - uL);
    vec2 nr = vec2(-ax.y, ax.x);
    if (nr.y < 0.0) nr = -nr;
    vec2 C = 0.5 * (uL + uR);
    float hwM = 0.5 * length(uR - uL);
    vec2 q = p - C;
    float s = dot(q, ax);
    float t = dot(q, nr);
    // O / OU purse the lips (narrower), É / I stretch them (wider): the lips themselves, sampled further or closer.
    float mreg = exp(-((s * s) / (hwM * hwM * 2.4) + (t * t) / (hwM * hwM * 0.7)));
    s *= 1.0 + (uRound * 0.32 - uWide * 0.12) * mreg;
    float sM = dot(uSeam - C, ax);
    float tM = dot(uSeam - C, nr);
    float tS = tM * max(0.0, hwM * hwM - s * s) / max(1e-6, hwM * hwM - sM * sM);
    float tc = max(dot(uChin - C, nr), tM + 0.2 * hwM);
    // The jaw of the drawing drops: the lower lip opens in an arc (corners stay closed), the chin goes down as a block,
    // the neck takes it back.
    float D = min(uJaw * 0.84 * hwM, 0.5 * (tc - tM));
    float below = t - tS;
    float g = pow(max(0.0, 1.0 - (s * s) / (hwM * hwM * 1.1)), 0.6);
    float gj = 1.0 - smoothstep(1.25 * hwM, 2.5 * hwM, abs(s));
    float blend = smoothstep(0.0, 0.85 * (tc - tM), below);
    float fade = 1.0 - smoothstep(tc, tc + (tc - tM) + 2.0 * D, t);
    float dd = below > 0.0 ? D * mix(g, gj, blend) * fade : 0.0;
    if (below > 0.0 && t - dd < tS && dd > 1e-5) {
      // Inside of the mouth, between the upper lip and the lowered lower lip.
      inGap = 1.0;
      float k = below / dd;
      float side = clamp(abs(s) / hwM, 0.0, 1.0);
      gapCol = uCav * (0.6 + 0.4 * (1.0 - side * side)) * (0.8 + 0.2 * k);
      if (uOpenArt < 0.12) {
        float teethH = min(0.5 * dd, 0.32 * hwM);
        float teeth = step(below, teethH) * (1.0 - smoothstep(0.62, 0.8, side));
        vec3 tc3 = vec3(0.86, 0.84, 0.78) * (1.0 - 0.25 * smoothstep(teethH * 0.55, teethH, below));
        gapCol = mix(gapCol, tc3, teeth);
        vec2 tg = vec2(s / (0.62 * hwM), (k - 1.0) / 0.42);
        float tongue = 1.0 - smoothstep(0.8, 1.0, length(tg));
        gapCol = mix(gapCol, vec3(0.42, 0.075, 0.085) * (0.75 + 0.25 * (1.0 - length(tg))), tongue * step(0.6 * hwM, dd));
      }
      // Soft edge under the upper lip.
      gapCol *= 0.55 + 0.45 * smoothstep(0.0, 0.12 * dd + 1e-4, below);
    }
    src = C + ax * s + nr * (t - dd);
  }
  vec2 uvs = fromIso(src);
  vec4 col = texture2D(map, uvs, lod);
  col.rgb /= max(col.a, 1e-4);
  if (uvs.x < 0.0 || uvs.x > 1.0 || uvs.y < 0.0 || uvs.y > 1.0) col.a = 0.0;
  if (inGap > 0.5) col = vec4(gapCol, 1.0);
  if (uFace > 0.5 && uEyes > 1.5 && uBlink > 0.0) {
    col.rgb = lidOver(col.rgb, src, uEye0, uBlink);
    col.rgb = lidOver(col.rgb, src, uEye1, uBlink);
  }
  pOut = p;
  uvsOut = uvs;
  gapOut = inGap;
  return col;
}
`;

export type FaceUniforms = ReturnType<typeof faceUniforms>;
/** The uniforms of the drawn face (one set per actor: the pose's marks and the instant's expression). */
export function faceUniforms() {
  return {
    uA: { value: 0.33 },
    uScaleM: { value: 1 },
    uFace: { value: 0 },
    uL: { value: new THREE.Vector2() },
    uR: { value: new THREE.Vector2() },
    uSeam: { value: new THREE.Vector2() },
    uChin: { value: new THREE.Vector2() },
    uOpenArt: { value: 0 },
    uCav: { value: new THREE.Vector3() },
    uJaw: { value: 0 },
    uWide: { value: 0 },
    uRound: { value: 0 },
    uHeadA: { value: 0 },
    uPivot: { value: new THREE.Vector2() },
    uNeck: { value: 0.05 },
    uEye0: { value: new THREE.Vector4() },
    uEye1: { value: new THREE.Vector4() },
    uEyes: { value: 0 },
    uBlink: { value: 0 },
    uLid: { value: new THREE.Vector3() },
    uBrow: { value: 0 },
  };
}

const lin = (c: [number, number, number]) => new THREE.Vector3(...c.map((x) => Math.pow(x, 2.2)));

/** The marks of a drawn pose (measured lips, chin, eyes) into the uniforms; a pose without marks gets no face warp. */
export function setFacePose(u: FaceUniforms, p: SheetPose) {
  const A = p.w / p.h;
  u.uA.value = A;
  const f = p.face;
  u.uFace.value = f ? 1 : 0;
  if (!f) return;
  const iso = (q: [number, number]) => new THREE.Vector2(q[0] * A, q[1]);
  u.uL.value.copy(iso(f.l));
  u.uR.value.copy(iso(f.r));
  u.uSeam.value.copy(iso(f.seam));
  u.uChin.value.copy(iso(f.chin));
  u.uOpenArt.value = f.open;
  u.uCav.value.copy(lin(f.cavity));
  const faceH = Math.max(0.01, f.chin[1] - f.seam[1]);
  u.uPivot.value.set(f.chin[0] * A, f.chin[1] + faceH * 0.55);
  u.uNeck.value = faceH * 0.6;
  const eyes = f.eyes;
  u.uEyes.value = eyes.length;
  if (eyes[0]) u.uEye0.value.set(eyes[0].c[0] * A, eyes[0].c[1], eyes[0].rx, eyes[0].ry);
  if (eyes[1]) u.uEye1.value.set(eyes[1].c[0] * A, eyes[1].c[1], eyes[1].rx, eyes[1].ry);
  u.uLid.value.copy(lin(f.lid));
}

/**
 * The drawn face on a 3D body: the theatre's face state (visemes, blink, brows, laugh, shock) drives the warp; the head
 * itself is turned by the body's neck bones, never by the warp.
 */
export class FaceRig {
  readonly u = faceUniforms();
  readonly glsl = FACE_GLSL;
  private browNow = 0;
  private t = 0;
  constructor(pose: SheetPose) {
    setFacePose(this.u, pose);
  }
  /** Is the face measured (lips, chin, eyes)? */
  get rigged() {
    return this.u.uFace.value > 0.5;
  }
  update(s: FaceState, dt = 1 / 30) {
    this.t += dt;
    const u = this.u;
    const laughJaw = s.laugh ? s.laugh * (0.25 + 0.35 * Math.abs(Math.sin(this.t * 13))) : 0;
    u.uJaw.value = Math.min(1, Math.max(s.mouth.open, laughJaw, s.shock * 0.55));
    u.uWide.value = s.mouth.open > 0.05 ? s.mouth.wide : 0;
    u.uRound.value = s.mouth.open > 0.03 || s.mouth.round > 0.5 ? s.mouth.round : 0;
    u.uBlink.value = Math.min(1, Math.max(0, s.blink));
    const browT = Math.max(-0.6, Math.min(0.75, s.browUp * 0.6 - s.browAngry * 0.5 + s.shock * 0.7));
    this.browNow += (browT - this.browNow) * 0.25;
    u.uBrow.value = this.browNow;
    u.uHeadA.value = 0;
  }
}
