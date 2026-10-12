// ACTEUR PLANCHE — le personnage dessiné par le propriétaire (sa planche fond vert, ses poses) joue dans le théâtre :
// un panneau tourné vers la caméra, posé au sol du décor à sa marque ; la pose suit la réplique (accuse, choc,
// haussement, fou rire), change avec un « pop » (squash & stretch). Le VISAGE est celui du dessin, animé sur ses propres
// repères (mesurés à l'import : lèvres, menton, yeux) : la lèvre inférieure et la mâchoire DU DESSIN descendent sur les
// syllabes (l'intérieur de la bouche — dents, langue — apparaît entre les lèvres), la bouche s'arrondit (o, ou) ou
// s'étire (é, i), les paupières se ferment sur les yeux dessinés, la tête hoche autour du cou. Pose sans repères :
// aucune bouche inventée, la pose reste telle quelle.
import * as THREE from 'three';
import type { ActorLook3D, SheetPose } from '../../../server/jev/studio/actor/cast3d';
import type { PoseKind } from '../../../server/jev/studio/actor/sheet';
import { ArapSolver, gridMesh, nearestVertex } from '../../../server/jev/studio/actor/arap';
import { BP, puppetTargets } from '../../../server/jev/studio/actor/puppetMotion';
import { inflateMesh } from '../../../server/jev/studio/actor/inflate';
import { FACE_GLSL, faceUniforms, setFacePose } from './faceWarp';

/** The bending drawing of one pose: its mesh, its solver, which vertex holds which handle. */
interface PoseRig {
  geom: THREE.BufferGeometry;
  solver: ArapSolver;
  rest: Float64Array;
  /** handle vertex → BlazePose index (absent = ground or head cluster). */
  vertLm: Map<number, number>;
  head: Set<number>;
  pos: Float64Array;
}

export interface SheetPlay {
  t: number;
  pose: PoseKind;
  /** Mouth of the word (visemes, only while speaking): opening, stretch, rounding 0..1. */
  open: number;
  wide?: number;
  round?: number;
  energy: number;
  beat: number;
  hop: number;
  stretch: number;
  laugh: number;
  /** Mirror the art so the actor faces its partner. */
  flip: boolean;
  /** Listening (head sways slowly) — talking heads nod on the accents. */
  listening?: boolean;
  /** Shock (jaw drop) 0..1. */
  shock?: number;
  /** Where the partner stands on screen (−1 left, 1 right, 0 alone): the actor leans towards them to talk. */
  toward?: -1 | 0 | 1;
  /** A per-actor phase so two actors never sway in sync. */
  phase?: number;
  /** The line being said (a question raises the brows). */
  text?: string;
  /** Walking (figurants): step phase and direction — the legs step, the arms swing. */
  walk?: { phase: number; dir: 1 | -1 };
}

/** Dissolve between two drawings (0 = the clean pop of cut-out animation: a dissolve shows a double, even for 0.1 s). */
const DISSOLVE_S = 0;
/** Room around the art for the moving head and jaw (fraction of the art on each side). */
const MARGIN = 0.05;
/** Anticipation before a change of drawing (s): the old pose squashes, then the new one pops. */
const ANTICIP_S = 0.12;
/** Is the actor talking at this instant (voice or open mouth)? */
const talk0 = (s: SheetPlay) => s.energy > 0.02 || s.open > 0.05;

const FRAG = `
uniform vec3 uGrade; uniform vec3 uWrap; uniform float uWrapK; uniform vec2 uTexel; uniform float uDefocus;
uniform vec3 uLightDir; uniform float uRelief; varying vec3 vN;
`;
const MAP = `
  vec2 uvi = (vMapUv - 0.5) * uScaleM + 0.5;
  vec2 p;
  vec2 uvs;
  float inGap;
  vec4 sampledDiffuseColor = faceSample(map, uvi, uDefocus, p, uvs, inGap);
  sampledDiffuseColor.rgb *= uGrade;
  // RELIEF: the drawing is a volume (inflated from its own silhouette, see inflate.ts): the key light of the set models
  // it, the sides turn away from the lens and catch the set's light. The face keeps its drawn light (the identity of
  // the character): the relief is half as strong above the chin.
  if (uRelief > 0.0 && inGap < 0.5) {
    vec3 nn = normalize(vN);
    float nl = max(0.0, dot(nn, uLightDir));
    float away = pow(1.0 - max(0.0, nn.z), 2.5);
    float k = uRelief * (uFace > 0.5 && p.y < uChin.y + 0.02 ? 0.45 : 1.0);
    sampledDiffuseColor.rgb *= mix(1.0, 0.8 + 0.3 * nl, k);
    sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, uWrap, away * uWrapK * 1.5 * k);
  }
  // LIGHT WRAP: the light of the set behind spills over the edge of the figure (it sits IN the picture, not on it).
  if (uWrapK > 0.0 && inGap < 0.5) {
    float aMin = min(min(texture2D(map, uvs + vec2(uTexel.x, 0.0)).a, texture2D(map, uvs - vec2(uTexel.x, 0.0)).a),
                     min(texture2D(map, uvs + vec2(0.0, uTexel.y)).a, texture2D(map, uvs - vec2(0.0, uTexel.y)).a));
    float edge = clamp(1.0 - aMin, 0.0, 1.0) * sampledDiffuseColor.a;
    sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, uWrap, edge * uWrapK);
  }
  diffuseColor *= sampledDiffuseColor;
`;

/** Floor orientation of the cast shadows: local +Y along the ground away from the key light (2.2, 4, 3.5), normal up. */
const SHADOW_Q = (() => {
  const away = new THREE.Vector3(-2.2, 0, -3.5).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(away, up);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, away, up));
})();

export class SheetActor {
  readonly root = new THREE.Group();
  private mesh: THREE.Mesh;
  /** The previous pose, dissolving over the new one (0.1 s: a smear, never a visible double) — no hard jump. */
  private ghost: THREE.Mesh;
  private shadow: THREE.Mesh;
  /** Lays the shadow on the floor, along the direction away from the key light (fixed in the world). */
  private shadowPivot = new THREE.Group();
  private last: { tex: THREE.Texture; sx: number; sy: number; x: number; y: number; rz: number } | null = null;
  private poses = new Map<PoseKind, { tex: THREE.Texture; p: SheetPose; rig?: PoseRig }>();
  private quad: THREE.BufferGeometry;
  private cur: PoseKind | null = null;
  private since = 0;
  /** A pose change waiting for its anticipation (the old drawing gathers itself, then the new one springs up). */
  private pending: { pose: PoseKind; at: number } | null = null;
  private nextBlink = 1.2 + Math.random() * 2;
  private leanNow = 0;
  /** The accents of the voice, smoothed (fast attack, slower release): the body answers them, it never jumps. */
  private beatNow = 0;
  private browNow = 0;
  private blinkAt = -10;
  private u = {
    ...faceUniforms(),
    uGrade: { value: new THREE.Vector3(1, 1, 1) },
    uWrap: { value: new THREE.Vector3(1, 1, 1) },
    uWrapK: { value: 0 },
    uTexel: { value: new THREE.Vector2(0.004, 0.002) },
    uDefocus: { value: 0 },
    uLightDir: { value: new THREE.Vector3(0, 0, 1) },
    uRelief: { value: 0 },
  };
  /** Height of the figure in metres (the cut-out spans head to feet). */
  readonly heightM: number;
  /** Pixel height of the standing pose: every pose keeps the same scale (a bent laughing pose is shorter, not bigger). */
  private refH = 0;
  private constructor(look: ActorLook3D) {
    this.heightM = 1.72 * look.height;
    this.u.uScaleM.value = 1 + 2 * MARGIN;
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    geo.translate(0, 0.5, 0);
    this.quad = geo;
    const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.01, depthWrite: false, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvN = normalize(normalMatrix * normal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${FACE_GLSL}\n${FRAG}`).replace('#include <map_fragment>', MAP);
    };
    mat.customProgramCacheKey = () => 'sheet-actor-v7';
    this.mesh = new THREE.Mesh(geo, mat);
    this.root.add(this.mesh);
    const gmat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
    gmat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <map_fragment>',
        `vec2 guv = (vMapUv - 0.5) * ${(1 + 2 * MARGIN).toFixed(3)} + 0.5;
  vec4 sampledDiffuseColor = texture2D(map, guv);
  sampledDiffuseColor.rgb /= max(sampledDiffuseColor.a, 1e-4);
  if (guv.x < 0.0 || guv.x > 1.0 || guv.y < 0.0 || guv.y > 1.0) sampledDiffuseColor.a = 0.0;
  diffuseColor *= sampledDiffuseColor;`,
      );
    };
    gmat.customProgramCacheKey = () => 'sheet-ghost-v1';
    this.ghost = new THREE.Mesh(geo, gmat);
    this.ghost.renderOrder = 1;
    this.ghost.visible = false;
    this.root.add(this.ghost);
    // THE CAST SHADOW: the figure's own silhouette laid on the ground, away from the key light, soft and fading with
    // the distance from the feet (the actor stands ON the floor of the set, not in front of it).
    const smat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, color: 0x000000, opacity: 0.32 });
    smat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <map_fragment>',
        `vec2 suv = (vMapUv - 0.5) * ${(1 + 2 * MARGIN).toFixed(3)} + 0.5;
  float sa = texture2D(map, suv, 2.5).a;
  if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) sa = 0.0;
  diffuseColor = vec4(0.0, 0.0, 0.0, diffuseColor.a * sa * (1.0 - smoothstep(0.02, 0.85, suv.y)));`,
      );
    };
    smat.customProgramCacheKey = () => 'sheet-shadow-v1';
    this.shadow = new THREE.Mesh(geo, smat);
    this.shadow.renderOrder = -1;
    this.shadowPivot.add(this.shadow);
    this.root.add(this.shadowPivot);
  }
  static async load(look: ActorLook3D, blobOf: (id: string) => Promise<Blob | undefined>): Promise<SheetActor | null> {
    if (!look.sheet?.poses.length) return null;
    const a = new SheetActor(look);
    for (const p of look.sheet.poses) {
      if (a.poses.has(p.kind)) continue;
      const b = await blobOf(p.assetId).catch(() => undefined);
      if (!b) continue;
      // Flipped at decode time (an ImageBitmap ignores the texture's flipY): uv (0,1) is the top of the art. Premultiplied,
      // so the soft edges of the cut-out filter cleanly (no dark or green halo); un-premultiplied in the shader.
      const bmp = await createImageBitmap(b, { imageOrientation: 'flipY', premultiplyAlpha: 'premultiply' });
      const tex = new THREE.Texture(bmp as unknown as HTMLImageElement);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      // The drawing bends like a puppet when its skeleton is measured (ARAP mesh, prepared once per pose).
      const rig = p.body ? await SheetActor.rigOf(b, p).catch(() => undefined) : undefined;
      a.poses.set(p.kind, { tex, p, ...(rig ? { rig } : {}) });
    }
    if (!a.poses.size) return null;
    a.refH = a.poses.get('neutre')?.p.h ?? Math.max(...[...a.poses.values()].map((x) => x.p.h));
    return a;
  }
  /** The mesh of a pose over its drawing (alpha read once, small), its handles: skeleton, ground line, head. */
  private static async rigOf(b: Blob, p: SheetPose): Promise<PoseRig | undefined> {
    const body = p.body;
    if (!body) return undefined;
    const bmp = await createImageBitmap(b);
    const f = Math.min(1, 256 / p.h);
    const cw = Math.max(1, Math.round(p.w * f));
    const ch = Math.max(1, Math.round(p.h * f));
    const c = Object.assign(document.createElement('canvas'), { width: cw, height: ch });
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0, cw, ch);
    bmp.close();
    const alpha = g.getImageData(0, 0, cw, ch).data;
    const inside = (x: number, y: number) => {
      const xi = Math.min(cw - 1, Math.floor(x * f));
      const yi = Math.min(ch - 1, Math.floor(y * f));
      return alpha[(yi * cw + xi) * 4 + 3]! >= 128;
    };
    const mesh = gridMesh(inside, p.w, p.h, Math.max(6, Math.round(p.h / 38)), 2);
    const n = mesh.rest.length / 2;
    if (n < 12) return undefined;
    const vertLm = new Map<number, number>();
    for (const [k, xy] of Object.entries(body)) {
      const v = nearestVertex(mesh, xy[0] * p.w, xy[1] * p.h);
      if (v >= 0) vertLm.set(v, Number(k));
    }
    // The ground line (feet, hem of a long dress) never moves; the head moves as one block (the face never bends).
    const handles = new Set<number>(vertLm.keys());
    for (let i = 0; i < n; i++) if (mesh.rest[i * 2 + 1]! >= p.h * 0.965) handles.add(i);
    const head = new Set<number>();
    const nose = body[BP.nose];
    const sl = body[BP.lSh];
    const sr = body[BP.rSh];
    if (nose && sl && sr) {
      const nx = nose[0] * p.w;
      const ny = nose[1] * p.h;
      const r = 0.55 * Math.hypot(nx - ((sl[0] + sr[0]) / 2) * p.w, ny - ((sl[1] + sr[1]) / 2) * p.h);
      for (let i = 0; i < n; i++) if (Math.hypot(mesh.rest[i * 2]! - nx, mesh.rest[i * 2 + 1]! - ny) < r) head.add(i);
      for (const i of head) handles.add(i);
    }
    const solver = new ArapSolver(mesh, [...handles]);
    const geom = new THREE.BufferGeometry();
    const M = 1 + 2 * MARGIN;
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      uv[i * 2] = (mesh.rest[i * 2]! / p.w - 0.5) / M + 0.5;
      uv[i * 2 + 1] = (1 - mesh.rest[i * 2 + 1]! / p.h - 0.5) / M + 0.5;
    }
    // The RELIEF of the drawing: its silhouette inflated (thickness + normals), the volume the light models.
    const relief = inflateMesh(mesh, 0.8);
    const position = new Float32Array(n * 3);
    const normal = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      position[i * 3] = uv[i * 2]! - 0.5;
      position[i * 3 + 1] = uv[i * 2 + 1]!;
      // z in the units of y (1 = p.h × M px), towards the lens; the mesh is scaled alike on y and z.
      position[i * 3 + 2] = relief.z[i]! / (p.h * M);
      normal[i * 3] = relief.nrm[i * 3]!;
      normal[i * 3 + 1] = -relief.nrm[i * 3 + 1]!;
      normal[i * 3 + 2] = relief.nrm[i * 3 + 2]!;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geom.setIndex(new THREE.BufferAttribute(mesh.tris, 1));
    return { geom, solver, rest: mesh.rest, vertLm, head, pos: new Float64Array(solver.handleIds.length * 2) };
  }
  /** Bends the drawing of a pose for this instant (targets of the skeleton handles → ARAP → mesh vertices). */
  private bend(rig: PoseRig, p: SheetPose, s: SheetPlay, age: number) {
    const tg = puppetTargets(p.body!, p.w, p.h, {
      t: s.t,
      talking: talk0(s),
      listening: !!s.listening,
      energy: s.energy,
      beat: s.beat,
      pose: s.pose,
      age,
      phase: s.phase ?? 0,
      laugh: s.laugh,
      shock: s.shock ?? 0,
      ...(s.walk ? { walk: s.walk } : {}),
    });
    const nose = p.body![BP.nose];
    const nt = tg.get(BP.nose);
    const hd: [number, number] = nose && nt ? [nt[0] - nose[0] * p.w, nt[1] - nose[1] * p.h] : [0, 0];
    const ids = rig.solver.handleIds;
    for (let k = 0; k < ids.length; k++) {
      const v = ids[k]!;
      const lm = rig.vertLm.get(v);
      const t = lm !== undefined ? tg.get(lm) : undefined;
      if (t) {
        rig.pos[k * 2] = t[0];
        rig.pos[k * 2 + 1] = t[1];
      } else if (rig.head.has(v)) {
        rig.pos[k * 2] = rig.rest[v * 2]! + hd[0];
        rig.pos[k * 2 + 1] = rig.rest[v * 2 + 1]! + hd[1];
      } else {
        rig.pos[k * 2] = rig.rest[v * 2]!;
        rig.pos[k * 2 + 1] = rig.rest[v * 2 + 1]!;
      }
    }
    const q = rig.solver.solve(rig.pos, 2);
    const M = 1 + 2 * MARGIN;
    const attr = rig.geom.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < q.length / 2; i++) {
      arr[i * 3] = (q[i * 2]! / p.w - 0.5) / M;
      arr[i * 3 + 1] = (1 - q[i * 2 + 1]! / p.h - 0.5) / M + 0.5;
    }
    attr.needsUpdate = true;
  }
  /** Does the art of this pose face left (−1), right (1) or the camera (0)? (the mouth off the axis of the figure). */
  facing(): -1 | 0 | 1 {
    // Read on the face when the detector saw it; otherwise the pointing pose tells it (the arm goes where the character
    // looks, the head stays on the other side of the cut-out), then the neutral pose.
    const n = this.poses.get('neutre')?.p;
    if (n?.facing !== undefined) return n.facing;
    const a = this.poses.get('accuse')?.p;
    if (a) return a.mouth[0] < 0.47 ? 1 : a.mouth[0] > 0.53 ? -1 : 0;
    const p = (n ?? [...this.poses.values()][0]!.p)!;
    return p.mouth[0] < 0.45 ? -1 : p.mouth[0] > 0.55 ? 1 : 0;
  }
  /** The direction of ONE drawn pose (read on its own face), else the actor's. */
  facingFor(kind: PoseKind): -1 | 0 | 1 {
    const p = this.poses.get(kind)?.p;
    return p?.facing ?? this.facing();
  }
  /** The light of the set the actor stands in (colour × exposure), or none. */
  setGrade(g: [number, number, number] | null) {
    this.u.uGrade.value.set(...(g ?? [1, 1, 1]));
  }
  /** Out of focus (figurants behind the actors): a mip-map bias, 0 = sharp. */
  setDefocus(bias: number) {
    this.u.uDefocus.value = bias;
  }
  /** The light of the set that wraps the figure's edges (its mean colour), or none. */
  setWrap(avg: [number, number, number] | null) {
    if (!avg) {
      this.u.uWrapK.value = 0;
      return;
    }
    // v51 showed a bright rim with a brightened colour: the spill is the set's own mean colour, faint and thin.
    this.u.uWrap.value.set(...(avg.map((c) => Math.pow(c, 2.2)) as [number, number, number]));
    this.u.uWrapK.value = 0.16;
  }
  /** Height of the face (for the camera). */
  faceY() {
    const p = (this.poses.get(this.cur ?? 'neutre') ?? [...this.poses.values()][0])!.p;
    // Between the eyes and the mouth (the nose) when the face is measured.
    const y = p.face ? p.face.seam[1] - 0.5 * (p.face.chin[1] - p.face.seam[1]) : p.mouth[1];
    const hM = this.heightM * Math.min(1.15, p.h / (this.refH || p.h));
    return hM * (1 - y) + 0.04;
  }
  /** Is the face of this pose rigged (measured lips)? */
  rigged(kind?: PoseKind) {
    const p = this.poses.get(kind ?? this.cur ?? 'neutre')?.p;
    return !!p?.face;
  }
  private setPose(p: SheetPose) {
    setFacePose(this.u, p);
    // The spill reaches ~0.25 % of the figure's height into it.
    this.u.uTexel.value.set((0.0025 * p.h) / p.w, 0.0025);
  }
  play(s: SheetPlay, camera: THREE.Camera) {
    this.beatNow += (s.beat - this.beatNow) * (s.beat > this.beatNow ? 0.45 : 0.12);
    s = { ...s, beat: this.beatNow };
    let want = this.poses.has(s.pose) ? s.pose : this.poses.has('neutre') ? 'neutre' : [...this.poses.keys()][0]!;
    // ANTICIPATION: a new drawing never pops at once (v51: a hard jump between two poses read as a cut). For 0.12 s the
    // drawing being left squashes down (the body gathers itself), then the new one springs up and settles — the
    // timing of cut-out animation, which the eye reads as one movement.
    let antic = 0;
    if (this.cur && want !== this.cur) {
      if (!this.pending || this.pending.pose !== want) this.pending = { pose: want, at: s.t };
      const k = (s.t - this.pending.at) / ANTICIP_S;
      if (k < 1) {
        antic = k;
        want = this.cur;
      } else this.pending = null;
    } else this.pending = null;
    const { tex, p, rig } = this.poses.get(want)!;
    if (want !== this.cur) {
      // The drawing being left dissolves over the new one.
      if (DISSOLVE_S > 0 && this.cur && this.last) {
        const g = this.ghost.material as THREE.MeshBasicMaterial;
        g.map = this.last.tex;
        g.needsUpdate = true;
        this.ghost.geometry = this.mesh.geometry;
        this.ghost.scale.set(this.last.sx, this.last.sy, 1);
        this.ghost.position.set(this.last.x, this.last.y, 0.002);
        this.ghost.rotation.z = this.last.rz;
        this.ghost.visible = true;
      }
      this.cur = want;
      this.since = s.t;
      this.setPose(p);
      // A change of pose often comes with a blink (the eyes reset).
      if (s.t - this.blinkAt > 0.8 && Math.random() < 0.5) this.nextBlink = s.t + 0.05;
    }
    // The puppet's body: its drawing bends around the skeleton (or stays the rigid drawing when none was measured).
    const geom = rig ? rig.geom : this.quad;
    if (this.mesh.geometry !== geom) this.mesh.geometry = geom;
    if (rig) this.bend(rig, p, { ...s, pose: want }, s.t - this.since);
    const m = this.mesh.material as THREE.MeshBasicMaterial;
    if (m.map !== tex) {
      m.map = tex;
      m.needsUpdate = true;
    }
    // The art keeps its proportions and the scale of the standing pose; its head axis stays on the actor's mark.
    const hM = this.heightM * Math.min(1.15, p.h / (this.refH || p.h));
    const w = (hM * p.w) / p.h;
    const age = s.t - this.since;
    // « Pop » of a new pose: squash & stretch that settles in 0.3 s.
    const pop = 0.07 * Math.exp(-age * 10) * Math.cos(age * 26);
    const breath = 0.007 * Math.sin(s.t * 2.1);
    // The accents of the voice punch the body (a short stretch on each stressed syllable).
    const sy = 1 + pop + breath + s.stretch + s.beat * 0.018 - 0.09 * antic;
    const sx = 1 - pop * 0.6 - s.stretch * 0.5 + 0.06 * antic;
    const M = 1 + 2 * MARGIN;
    this.mesh.scale.set(w * sx * M * (s.flip ? -1 : 1), hM * sy * M, hM * sy * M);
    this.u.uRelief.value = rig ? 1 : 0;
    // The key light of the set (world, front-right and high), in the lens' frame for the shading of the relief.
    this.u.uLightDir.value.set(2.2, 4, 3.5).normalize().applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()).invert());
    const axis = p.face ? (p.face.l[0] + p.face.r[0]) / 2 : p.mouth[0];
    // Weight shifts from one foot to the other (slow, never in sync with the partner).
    const ph = s.phase ?? 0;
    const shift = Math.sin(s.t * 0.85 + ph) * 0.012 * hM;
    this.mesh.position.x = (0.5 - axis) * w * sx * (s.flip ? -1 : 1) + shift;
    // Body: bounce on the accents of the voice, the laugh shakes, the jump of the shock (feet stay on the ground line).
    this.mesh.position.y = -MARGIN * hM * sy + s.hop + s.beat * 0.035 + (s.laugh ? Math.abs(Math.sin(s.t * 22)) * 0.012 * s.laugh : 0);
    // The talker leans TOWARDS the partner (more when accusing), the listener gives way a little; pivot = the feet.
    const toward = s.toward ?? 0;
    const lean = toward * (talk0(s) ? (s.pose === 'accuse' ? 0.05 : 0.03) * (0.6 + 0.4 * Math.min(1, s.energy * 2)) : s.listening ? -0.012 : 0);
    this.leanNow += (lean - this.leanNow) * 0.12;
    this.mesh.rotation.z = -this.leanNow + Math.sin(s.t * 1.7 + ph) * 0.012 * (1 + s.energy * 1.5) + (s.laugh ? Math.sin(s.t * 22) * 0.012 * s.laugh : 0);
    // The shadow follows the drawing (same mesh, same pose), flattened to 55 % of its height on the floor.
    if (this.shadow.geometry !== geom) this.shadow.geometry = geom;
    const sm = this.shadow.material as THREE.MeshBasicMaterial;
    if (sm.map !== tex) {
      sm.map = tex;
      sm.needsUpdate = true;
    }
    this.shadow.scale.set(this.mesh.scale.x, this.mesh.scale.y * 0.55, 0.0001);
    this.shadow.position.set(this.mesh.position.x, -MARGIN * hM * sy * 0.55, 0);
    sm.opacity = 0.32 * Math.max(0.35, 1 - s.hop * 3);
    // Dissolve of the previous drawing.
    if (this.ghost.visible) {
      const k = age / Math.max(1e-3, DISSOLVE_S);
      (this.ghost.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k);
      if (k >= 1) this.ghost.visible = false;
    }
    this.last = { tex, sx: this.mesh.scale.x, sy: this.mesh.scale.y, x: this.mesh.position.x, y: this.mesh.position.y, rz: this.mesh.rotation.z };
    // Head: nods on the accents while talking, slow sway while listening, shakes with the laugh.
    const talk = talk0(s);
    // Listening: slow sway and, now and then, a small nod of agreement (or of « hmm, really? »).
    const listenNod = s.listening ? Math.max(0, Math.sin(s.t * 2.4 + ph)) * 0.035 * (Math.sin(s.t * 0.41 + ph) > 0.55 ? 1 : 0) : 0;
    const nod = talk ? Math.sin(s.t * 4.7) * 0.03 * Math.min(1, s.energy * 2) + s.beat * 0.045 : Math.sin(s.t * 1.1 + 0.7 + ph) * 0.014 + listenNod;
    this.u.uHeadA.value = (nod + (s.laugh ? Math.sin(s.t * 11) * 0.03 * s.laugh : 0)) * (s.flip ? -1 : 1);
    // Brows: up on the accents and the questions, down when accusing, very high in the shock.
    // (v51 measured the drawn faces drifting from themselves a little more than the references: brows kept expressive
    // but within the drawing — the identity stays.)
    const question = /\?\s*$/.test(s.text ?? '') ? 0.25 : 0;
    const browT =
      want === 'choc' ? 0.7 : want === 'accuse' && talk ? -0.28 - 0.3 * s.beat : talk ? Math.min(0.75, s.beat * 0.6 + question) : s.listening ? 0.08 * Math.max(0, Math.sin(s.t * 0.7 + (s.phase ?? 0))) : 0;
    this.browNow += (browT - this.browNow) * 0.25;
    this.u.uBrow.value = this.browNow;
    // Mouth: the word's viseme; the laugh bounces the jaw (ha-ha-ha); the shock drops it.
    const laughJaw = s.laugh ? s.laugh * (0.25 + 0.35 * Math.abs(Math.sin(s.t * 13))) : 0;
    this.u.uJaw.value = Math.min(1, Math.max(s.open, laughJaw, (s.shock ?? 0) * 0.55));
    this.u.uWide.value = s.open > 0.05 ? (s.wide ?? 0) : 0;
    this.u.uRound.value = s.open > 0.03 || (s.round ?? 0) > 0.5 ? (s.round ?? 0) : 0;
    // Blinks every 2.5–5.5 s (0.16 s: closes fast, opens a bit slower).
    if (s.t >= this.nextBlink) {
      this.blinkAt = s.t;
      this.nextBlink = s.t + 2.5 + Math.random() * 3;
    }
    const ba = s.t - this.blinkAt;
    this.u.uBlink.value = ba < 0 ? 0 : ba < 0.06 ? ba / 0.06 : ba < 0.09 ? 1 : ba < 0.17 ? 1 - (ba - 0.09) / 0.08 : 0;
    this.faceCamera(camera);
  }
  /** Turned to the camera around the vertical axis (called again once the camera of the frame is placed). */
  faceCamera(camera: THREE.Camera) {
    const cp = camera.getWorldPosition(new THREE.Vector3());
    this.root.lookAt(cp.x, this.root.position.y, cp.z);
    // The shadow keeps its WORLD direction (away from the key light, front-right and high) whatever the facing.
    this.root.updateMatrixWorld();
    const parentQ = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.shadowPivot.quaternion.copy(parentQ.multiply(SHADOW_Q));
  }
  dispose() {
    this.quad.dispose();
    for (const { rig } of this.poses.values()) rig?.geom.dispose();
    (this.mesh.material as THREE.Material).dispose();
    (this.ghost.material as THREE.Material).dispose();
    (this.shadow.material as THREE.Material).dispose();
    for (const { tex } of this.poses.values()) tex.dispose();
  }
}
