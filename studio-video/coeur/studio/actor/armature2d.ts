/**
 * MOTEUR SQUELETTIQUE 2D — reproduction, en TypeScript pur, du cœur du runtime DragonBones (DragonBonesJS, licence MIT,
 * © The DragonBones team ; lu le 16/10 : armature/Bone.ts, armature/Constraint.ts, Pixi/PixiSlot.ts, animation/
 * AnimationState.ts, animation/BaseTimelineState.ts). Ce qui fait la puissance d'un moteur d'animation 2D (Spine,
 * DragonBones, Rive, Moho) et qui manquait à la marionnette ARAP de l'app :
 *  - des OS en hiérarchie qui TOURNENT (transformation locale → globale, le parent entraîne l'enfant) : un coude, un
 *    poignet, une épaule pivotent au lieu que le dessin soit tiré par des points ;
 *  - une PEAU PONDÉRÉE (skinning) : chaque sommet du dessin est rangé dans le repère de chacun de ses os (≤ 4) avec un
 *    poids, puis replacé par Σ poids × (matrice globale de l'os × position locale) — une main pondérée à son os reste
 *    une main, quelle que soit la cuisse qu'elle touche dans le dessin (le maillage ne la soude plus) ;
 *  - l'IK à deux os de DragonBones (_computeB : intersection de deux cercles, sens de pliage, poids de la contrainte) ;
 *  - des CLIPS (pistes par os et par propriété, images clés, interpolations linéaire, quad in/out/in-out, courbes
 *    échantillonnées) ;
 *  - un MÉLANGEUR à couches et fondus (BlendState : une couche haute prend son poids, le reste passe aux couches
 *    inférieures ; fondu entrant/sortant qui fait passer d'un geste à l'autre sans saut).
 * Pur, sans DOM, déterministe : même image quel que soit l'ordre de rendu.
 */

export interface Xf {
  x: number;
  y: number;
  /** radians */
  rot: number;
  sx: number;
  sy: number;
}
/** affine 2D [a c tx; b d ty] (convention DragonBones/Pixi) */
export interface Mat {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}
export const IDENT: Xf = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };
export const toMatrix = (t: Xf): Mat => {
  const cs = Math.cos(t.rot), sn = Math.sin(t.rot);
  return { a: cs * t.sx, b: sn * t.sx, c: -sn * t.sy, d: cs * t.sy, tx: t.x, ty: t.y };
};
/** parent ∘ child (child expressed in the parent's frame) */
export const concat = (p: Mat, c: Mat): Mat => ({
  a: p.a * c.a + p.c * c.b, b: p.b * c.a + p.d * c.b,
  c: p.a * c.c + p.c * c.d, d: p.b * c.c + p.d * c.d,
  tx: p.a * c.tx + p.c * c.ty + p.tx, ty: p.b * c.tx + p.d * c.ty + p.ty,
});
export const invert = (m: Mat): Mat => {
  const det = m.a * m.d - m.b * m.c, id = 1 / det;
  return { a: m.d * id, b: -m.b * id, c: -m.c * id, d: m.a * id, tx: (m.c * m.ty - m.d * m.tx) * id, ty: (m.b * m.tx - m.a * m.ty) * id };
};
export const apply = (m: Mat, x: number, y: number): [number, number] => [m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty];
export const normRad = (r: number) => { r = (r + Math.PI) % (2 * Math.PI); return (r < 0 ? r + 2 * Math.PI : r) - Math.PI; };

export interface BoneDef {
  name: string;
  /** index of the parent bone (−1 for the root); parents come before their children */
  parent: number;
  /** setup pose, LOCAL to the parent (DragonBones « origin ») */
  setup: Xf;
  /** length of the bone along its local x axis (for IK) */
  len: number;
}

/** An armature: setup pose + animation pose (additive, DragonBones OffsetMode.Additive) → world matrices. */
export class Armature2D {
  readonly bones: BoneDef[];
  /** additive animation pose per bone (rot/x/y added, scales multiplied) */
  readonly pose: Xf[];
  readonly world: Mat[];
  private byName: Map<string, number>;
  constructor(bones: BoneDef[]) {
    this.bones = bones;
    this.pose = bones.map(() => ({ ...IDENT }));
    this.world = bones.map(() => toMatrix(IDENT));
    this.byName = new Map(bones.map((b, i) => [b.name, i]));
    this.update();
  }
  index(name: string): number { return this.byName.get(name) ?? -1; }
  resetPose(): void { for (const p of this.pose) Object.assign(p, IDENT); }
  /** local transform = setup + animation pose */
  local(i: number): Xf {
    const s = this.bones[i]!.setup, p = this.pose[i]!;
    return { x: s.x + p.x, y: s.y + p.y, rot: s.rot + p.rot, sx: s.sx * p.sx, sy: s.sy * p.sy };
  }
  /** world matrices, parents first (Bone._updateGlobalTransformMatrix with inherited translation/rotation/scale) */
  update(): void {
    for (let i = 0; i < this.bones.length; i++) {
      const m = toMatrix(this.local(i)), par = this.bones[i]!.parent;
      this.world[i] = par >= 0 ? concat(this.world[par]!, m) : m;
    }
  }
  /** world position of the bone's head and its world rotation */
  head(i: number): [number, number] { return [this.world[i]!.tx, this.world[i]!.ty]; }
  tail(i: number): [number, number] { return apply(this.world[i]!, this.bones[i]!.len, 0); }
  worldRot(i: number): number { return Math.atan2(this.world[i]!.b, this.world[i]!.a); }
  /** set a bone's WORLD rotation by changing its animation pose (children follow at the next update) */
  setWorldRot(i: number, rot: number): void {
    const par = this.bones[i]!.parent, pr = par >= 0 ? this.worldRot(par) : 0;
    this.pose[i]!.rot = normRad(rot - pr - this.bones[i]!.setup.rot);
  }
  /** recompute the world matrices of i and of all its descendants (bones are ordered parents first) */
  updateFrom(i: number): void {
    const dirty = new Set([i]);
    for (let k = i; k < this.bones.length; k++) {
      const par = this.bones[k]!.parent;
      if (k !== i && !dirty.has(par)) continue;
      dirty.add(k);
      const m = toMatrix(this.local(k));
      this.world[k] = par >= 0 ? concat(this.world[par]!, m) : m;
    }
  }
}

/**
 * IK à deux os (DragonBones IKConstraint._computeB) : la racine (bras) et l'os (avant-bras) visent la cible ; le coude
 * est l'un des deux points d'intersection des cercles (longueurs des os), choisi par bendPositive ; weight dose l'effet.
 */
export function ikTwoBone(arm: Armature2D, root: number, bone: number, target: [number, number], bendPositive: boolean, weight = 1): void {
  if (weight <= 0) return;
  const P = arm.head(root), B = arm.head(bone);
  const lP = Math.hypot(B[0] - P[0], B[1] - P[1]), lL = arm.bones[bone]!.len * Math.hypot(arm.world[bone]!.a, arm.world[bone]!.b);
  const rawRootRot = arm.worldRot(root), rawBoneRot = arm.worldRot(bone), rawA = Math.atan2(B[1] - P[1], B[0] - P[0]);
  let dX = target[0] - P[0], dY = target[1] - P[1];
  const lTT = dX * dX + dY * dY, lT = Math.sqrt(lTT);
  let radA: number;
  let elbow: [number, number];
  if (lL + lP <= lT || lT + lL <= lP || lT + lP <= lL || lT < 1e-9) {
    // out of reach (or folded): the chain points straight at the target
    radA = Math.atan2(dY, dX);
    if (!(lL + lP <= lT) && lP < lL) radA += Math.PI;
    elbow = [P[0] + Math.cos(radA) * lP, P[1] + Math.sin(radA) * lP];
  } else {
    const h = (lP * lP - lL * lL + lTT) / (2 * lTT), r = Math.sqrt(Math.max(0, lP * lP - h * h * lTT)) / lT;
    const hX = P[0] + dX * h, hY = P[1] + dY * h, rX = -dY * r, rY = dX * r;
    elbow = bendPositive ? [hX + rX, hY + rY] : [hX - rX, hY - rY];
    radA = Math.atan2(elbow[1] - P[1], elbow[0] - P[0]);
  }
  const dR = normRad(radA - rawA);
  arm.setWorldRot(root, rawRootRot + dR * weight);
  arm.updateFrom(root);
  const E = arm.head(bone);
  dX = target[0] - E[0]; dY = target[1] - E[1];
  const radB = Math.atan2(dY, dX);
  // the bone keeps its own offset to the bone axis (its setup angle relative to the elbow→target line)
  const boneAxis = Math.atan2(arm.tail(bone)[1] - E[1], arm.tail(bone)[0] - E[0]);
  const cur = arm.worldRot(bone);
  arm.setWorldRot(bone, cur + normRad(radB - boneAxis) * weight);
  arm.updateFrom(bone);
  void rawBoneRot;
}

/** Point a bone (its tail) at a world point, with a weight (DragonBones IKConstraint._computeA). */
export function aimBone(arm: Armature2D, i: number, target: [number, number], weight = 1): void {
  const H = arm.head(i), T = arm.tail(i);
  const cur = Math.atan2(T[1] - H[1], T[0] - H[0]), want = Math.atan2(target[1] - H[1], target[0] - H[0]);
  arm.setWorldRot(i, arm.worldRot(i) + normRad(want - cur) * weight);
  arm.updateFrom(i);
}

// ── PEAU PONDÉRÉE ──────────────────────────────────────────────────────────────────────────────────────────────────
export interface SkinBinding {
  n: number;
  /** rest positions (world px of the drawing) and the setup world matrices, for dual-number skinning */
  rest?: Float64Array;
  setup?: Mat[];
  /** per vertex: up to 4 (bone, weight, xL, yL) — the vertex in the bone's SETUP frame (PixiSlot._updateMesh data) */
  bone: Int32Array;
  w: Float32Array;
  xl: Float64Array;
  yl: Float64Array;
}
/** Bind rest vertices (world px of the drawing) to an armature in its setup pose, with 4 weights per vertex. */
export function bindSkin(rest: ArrayLike<number>, idx: ArrayLike<number>, w: ArrayLike<number>, arm: Armature2D): SkinBinding {
  const n = rest.length / 2, inv = arm.world.map(invert);
  const out: SkinBinding = { n, bone: new Int32Array(n * 4).fill(-1), w: new Float32Array(n * 4), xl: new Float64Array(n * 4), yl: new Float64Array(n * 4), rest: Float64Array.from(rest), setup: arm.world.map((m) => ({ ...m })) };
  for (let v = 0; v < n; v++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += w[v * 4 + k]!;
    for (let k = 0; k < 4; k++) {
      const wk = s > 0 ? w[v * 4 + k]! / s : k === 0 ? 1 : 0, b = idx[v * 4 + k]!;
      if (wk <= 0) continue;
      const [x, y] = apply(inv[b]!, rest[v * 2]!, rest[v * 2 + 1]!);
      out.bone[v * 4 + k] = b; out.w[v * 4 + k] = wk; out.xl[v * 4 + k] = x; out.yl[v * 4 + k] = y;
    }
  }
  return out;
}
/** Σ weight × (bone world matrix × local vertex) — linear blend skinning, exactly PixiSlot._updateMesh. */
export function skin(b: SkinBinding, arm: Armature2D, out: Float64Array = new Float64Array(b.n * 2)): Float64Array {
  for (let v = 0; v < b.n; v++) {
    let x = 0, y = 0;
    for (let k = 0; k < 4; k++) {
      const bi = b.bone[v * 4 + k]!;
      if (bi < 0) continue;
      const m = arm.world[bi]!, wk = b.w[v * 4 + k]!, xl = b.xl[v * 4 + k]!, yl = b.yl[v * 4 + k]!;
      x += (m.a * xl + m.c * yl + m.tx) * wk;
      y += (m.b * xl + m.d * yl + m.ty) * wk;
    }
    out[v * 2] = x; out[v * 2 + 1] = y;
  }
  return out;
}

/**
 * PEAU PAR NOMBRES DUAUX (dual quaternion skinning, Kavan et al. 2007, restreint au plan) : au lieu de mélanger des
 * matrices (le coude s'écrase en « papillote » quand l'avant-bras plie fort — LBS), on mélange des transformations
 * RIGIDES (rotation par demi-angles + translation duale), on normalise, on applique : une articulation garde son
 * épaisseur. Os rigides (échelle 1). Même résultat que skin() à la pose de départ.
 */
export function skinDQ(b: SkinBinding, arm: Armature2D, out: Float64Array = new Float64Array(b.n * 2)): Float64Array {
  if (!b.rest || !b.setup) return skin(b, arm, out);
  const B = arm.world.length, cr = new Float64Array(B), sr = new Float64Array(B), dx = new Float64Array(B), dy = new Float64Array(B);
  for (let i = 0; i < B; i++) {
    const S = concat(arm.world[i]!, invert(b.setup[i]!)), th = Math.atan2(S.b, S.a), c = Math.cos(th / 2), sn = Math.sin(th / 2);
    cr[i] = c; sr[i] = sn;
    // dual part of a rotation about z by th then a translation t: qd = ½ (0, t) ⊗ qr
    dx[i] = 0.5 * (c * S.tx + sn * S.ty); dy[i] = 0.5 * (c * S.ty - sn * S.tx);
  }
  for (let v = 0; v < b.n; v++) {
    let W = 0, Z = 0, X = 0, Y = 0, ref = -1;
    for (let k = 0; k < 4; k++) {
      const bi = b.bone[v * 4 + k]!;
      if (bi < 0) continue;
      let wk = b.w[v * 4 + k]!;
      if (ref < 0) ref = bi;
      else if (cr[bi]! * cr[ref]! + sr[bi]! * sr[ref]! < 0) wk = -wk; // antipodal: same hemisphere as the first bone
      W += wk * cr[bi]!; Z += wk * sr[bi]!; X += wk * dx[bi]!; Y += wk * dy[bi]!;
    }
    const nrm = Math.hypot(W, Z) || 1;
    W /= nrm; Z /= nrm; X /= nrm; Y /= nrm;
    // t = 2 qd ⊗ conj(qr), rotation by 2·atan2(Z, W)
    const tx = 2 * (W * X - Z * Y), ty = 2 * (W * Y + Z * X), c2 = W * W - Z * Z, s2 = 2 * W * Z;
    const px = b.rest[v * 2]!, py = b.rest[v * 2 + 1]!;
    out[v * 2] = c2 * px - s2 * py + tx; out[v * 2 + 1] = s2 * px + c2 * py + ty;
  }
  return out;
}

// ── CLIPS ET MÉLANGEUR ─────────────────────────────────────────────────────────────────────────────────────────────
export type Tween = 'line' | 'quadIn' | 'quadOut' | 'quadInOut' | 'step' | number[];
export interface Key { t: number; v: number; tween?: Tween }
export interface Track { bone: string; prop: 'rot' | 'x' | 'y' | 'sx' | 'sy'; keys: Key[] }
export interface Clip { name: string; duration: number; loop?: boolean; tracks: Track[] }

/** DragonBones TweenTimelineState._getEasingValue / _getEasingCurveValue (samples in 0..1 at even steps). */
export function ease(tw: Tween | undefined, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  if (!tw || tw === 'line') return p;
  if (tw === 'step') return 0;
  if (tw === 'quadIn') return p * p;
  if (tw === 'quadOut') return 1 - (1 - p) * (1 - p);
  if (tw === 'quadInOut') return 0.5 * (1 - Math.cos(p * Math.PI));
  const seg = tw.length + 1, i = Math.floor(p * seg), from = i === 0 ? 0 : tw[i - 1]!, to = i >= tw.length ? 1 : tw[i]!;
  return from + (to - from) * (p * seg - i);
}
/** value of a track at time t (keys sorted; the tween of a key shapes the way to the next key) */
export function sampleTrack(tr: Track, t: number): number {
  const k = tr.keys;
  if (!k.length) return 0;
  if (t <= k[0]!.t) return k[0]!.v;
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i]!, b = k[i + 1]!;
    if (t < b.t) return a.v + (b.v - a.v) * ease(a.tween, (t - a.t) / Math.max(1e-9, b.t - a.t));
  }
  return k[k.length - 1]!.v;
}
export interface PlayState { clip: Clip; start: number; layer: number; weight: number; fadeIn: number; fadeOut?: { at: number; dur: number } }
/** fade progress of a state at time t (AnimationState._fadeProgress) */
export function fadeOf(s: PlayState, t: number): number {
  let f = s.fadeIn > 0 ? Math.min(1, Math.max(0, (t - s.start) / s.fadeIn)) : t >= s.start ? 1 : 0;
  if (s.fadeOut) f *= 1 - Math.min(1, Math.max(0, (t - s.fadeOut.at) / Math.max(1e-9, s.fadeOut.dur)));
  return f;
}
/**
 * Apply all playing states to the armature's animation pose at time t, with DragonBones' layered blending
 * (BlendState.update): states are taken from the highest layer down; a layer consumes up to its weight of what is
 * left, the lower layers share the rest. Rotation/translation blend linearly, scales blend toward 1.
 */
export function applyStates(arm: Armature2D, states: PlayState[], t: number): void {
  arm.resetPose();
  const byBone = new Map<string, { left: number; layer: number; layerW: number }>();
  const sorted = [...states].sort((a, b) => b.layer - a.layer);
  for (const s of sorted) {
    const w0 = s.weight * fadeOf(s, t);
    if (w0 <= 0) continue;
    const lt = s.clip.loop ? (((t - s.start) % s.clip.duration) + s.clip.duration) % s.clip.duration : Math.min(s.clip.duration, Math.max(0, t - s.start));
    const done = new Map<string, number>();
    for (const tr of s.clip.tracks) {
      const bi = arm.index(tr.bone);
      if (bi < 0) continue;
      let w = done.get(tr.bone);
      if (w === undefined) {
        let st = byBone.get(tr.bone);
        if (!st) { st = { left: 1, layer: s.layer, layerW: 0 }; byBone.set(tr.bone, st); }
        if (st.layer !== s.layer) { st.left = Math.max(0, st.left - st.layerW); st.layer = s.layer; st.layerW = 0; }
        w = w0 * st.left;
        st.layerW += w;
        done.set(tr.bone, w);
      }
      if (w <= 0) continue;
      const v = sampleTrack(tr, lt), p = arm.pose[bi]!;
      if (tr.prop === 'sx' || tr.prop === 'sy') p[tr.prop] *= 1 + (v - 1) * w;
      else p[tr.prop] += v * w;
    }
  }
  arm.update();
}

// ── DU DESSIN À L'ARMATURE ─────────────────────────────────────────────────────────────────────────────────────────
/** Bones measured on a drawing (head a → tail b, px, parent index) → armature with its setup pose = the drawing. */
export function armatureFromSegments(segs: { name: string; parent: number; a: [number, number]; b: [number, number] }[]): Armature2D {
  const world: Mat[] = [];
  const defs: BoneDef[] = segs.map((s, i) => {
    const rot = Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]), len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const wm = toMatrix({ x: s.a[0], y: s.a[1], rot, sx: 1, sy: 1 });
    world[i] = wm;
    const lm = s.parent >= 0 ? concat(invert(world[s.parent]!), wm) : wm;
    return { name: s.name, parent: s.parent, setup: { x: lm.tx, y: lm.ty, rot: Math.atan2(lm.b, lm.a), sx: 1, sy: 1 }, len };
  });
  return new Armature2D(defs);
}
