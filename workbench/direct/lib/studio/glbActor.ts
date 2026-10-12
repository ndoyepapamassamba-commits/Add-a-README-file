/**
 * ACTEUR GLB — any rigged humanoid model (Mixamo, UniRig, Make-It-Animatable, Rigify, Khronos samples, a VRM read as a
 * plain glTF…): its bones are recognised and normalised to the engine's T-pose by rig3d (nothing set by hand), the
 * engine skeleton drives it exactly like the VRM actors, and it is toon-shaded to sit with the drawn cast. The 3D body
 * of the hybrid architecture (« corps 3D, peau 2D »): the drawing itself will be projected on it as its skin.
 */
import * as THREE from 'three';
import { buildRetarget, matchBones, retargetPose, type BoneMap, type Retarget, type RigBone } from '../../../server/jev/studio/actor/rig3d';
import { JOINT_INDEX, SKELETON, eulerOf } from '../../../server/jev/studio/actor/skeleton';
import { clamp, qEuler, qInv, qRot, type Q, type V3 } from '../../../server/jev/studio/actor/math';
import type { Frame } from '../../../server/jev/studio/actor/actor';
import type { Prop } from '../../../server/jev/studio/actor/cast3d';
import { buildProp, toonRamp, type FaceState, type Puppet3D } from './actorBody';
import { alphaBounds, bakeProjection, projectedToon, type ProjectionBake } from './projectedSkin';
import { poseFromBody } from '../../../server/jev/studio/actor/pose2d';
import type { SheetBody } from '../../../server/jev/studio/actor/puppetMotion';
import type { FaceRig } from './faceWarp';

/** Yaw allowed to each trunk joint of a flat (cut-out) body, radians. */
const FLAT_YAW: Record<string, number> = { pelvis: 0.28, spine1: 0.04, spine2: 0.04, spine3: 0.04, neck: 0.08, head: 0.14 };
function clampYaw(q: Q, lim: number | undefined): Q {
  if (lim === undefined) return q;
  const [x, y, z] = eulerOf(q);
  return Math.abs(y) <= lim ? q : qEuler(x, clamp(y, -lim, lim), z);
}

export class GlbActor implements Puppet3D {
  readonly root = new THREE.Group();
  private inner = new THREE.Group();
  private propHolder = new THREE.Group();
  private prop: Prop | null = null;
  /** Bones recognised: engine joint → node name (for diagnostics and tests). */
  readonly mapped: Record<string, string>;
  /** The drawn face animated on the projected skin (set before skin() by the inflated actor); null = no face. */
  faceRig: FaceRig | null = null;
  /**
   * A body inflated from a drawing is a cut-out: it can lean and nod, not turn its back (its sides and back are the
   * mirrored drawing). The trunk's yaw towards a partner or the lens is kept small (≈ 30° in all).
   */
  flat = false;
  private constructor(
    private scene: THREE.Object3D,
    private nodes: THREE.Object3D[],
    private rig: RigBone[],
    private rt: Retarget,
    map: BoneMap,
    private restLocalPos: THREE.Vector3[],
    private restLocalRot: THREE.Quaternion[],
    private restWorldRot: Q[],
    /** Model units per engine metre. */
    private unitsPerMetre: number,
    heightM: number,
    modelHeight: number,
    footY: number,
  ) {
    this.mapped = Object.fromEntries(Object.entries(map).map(([k, b]) => [k, nodes[b!]!.name]));
    const s = heightM / Math.max(1e-6, modelHeight);
    this.inner.scale.setScalar(s);
    this.inner.position.y = -footY * s;
    this.inner.add(scene);
    this.root.add(this.inner);
    this.bone('r_wrist')?.add(this.propHolder);
  }
  /** Loads a rigged glTF/GLB; throws when no humanoid skeleton is recognised. */
  static async load(blob: Blob, heightM = 1.72): Promise<GlbActor> {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const url = URL.createObjectURL(blob);
    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      return GlbActor.fromScene(gltf.scene, heightM);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  /** Any rigged scene (a loaded model, or a body built in memory — the inflated drawing); throws when no humanoid skeleton is recognised. */
  static fromScene(scene: THREE.Object3D, heightM = 1.72): GlbActor {
    {
      scene.updateMatrixWorld(true);
      // Every node of the hierarchy, parents first (three's traverse is depth-first, parents before children).
      const nodes: THREE.Object3D[] = [];
      const index = new Map<THREE.Object3D, number>();
      scene.traverse((o) => {
        if (o === scene || (o as THREE.Mesh).isMesh) return;
        index.set(o, nodes.length);
        nodes.push(o);
      });
      const rig: RigBone[] = nodes.map((o) => ({ name: o.name, parent: o.parent && index.has(o.parent) ? index.get(o.parent)! : -1 }));
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const rest = {
        pos: nodes.map((o) => {
          o.getWorldPosition(pos);
          return [pos.x, pos.y, pos.z] as V3;
        }),
        rot: nodes.map((o) => {
          o.getWorldQuaternion(quat);
          return [quat.x, quat.y, quat.z, quat.w] as Q;
        }),
      };
      const map = matchBones(rig);
      if (map.pelvis === undefined || map.l_shoulder === undefined || map.r_shoulder === undefined || map.head === undefined)
        throw new Error(`squelette humanoïde non reconnu (${Object.keys(map).length} os trouvés sur ${nodes.length})`);
      const rt = buildRetarget(rig, rest, map);
      // The model's height and feet along ITS up axis (the body fix tells which one it is).
      const up = qRot(qInv(rt.body), [0, 1, 0]);
      const box = new THREE.Box3().setFromObject(scene);
      const along = (v: THREE.Vector3) => v.x * up[0] + v.y * up[1] + v.z * up[2];
      const lo = Math.min(along(box.min), along(box.max));
      const hi = Math.max(along(box.min), along(box.max));
      const modelHeight = Math.max(1e-6, hi - lo);
      // Toon shading, the look of the drawn cast (the drawing projection comes on top of it).
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.frustumCulled = false;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        const next = mats.map((old) => {
          const src = old as THREE.MeshStandardMaterial;
          const t = new THREE.MeshToonMaterial({ color: src.color ?? new THREE.Color('#ffffff'), map: src.map ?? null, gradientMap: toonRamp(), transparent: !!src.transparent, alphaTest: src.alphaTest || 0, side: src.side ?? THREE.FrontSide });
          return t;
        });
        m.material = Array.isArray(m.material) ? next : next[0]!;
      });
      const restLocalPos = nodes.map((o) => o.position.clone());
      const restLocalRot = nodes.map((o) => o.quaternion.clone());
      return new GlbActor(scene, nodes, rig, rt, map, restLocalPos, restLocalRot, rest.rot, modelHeight / heightM, heightM, modelHeight, lo);
    }
  }
  bone(name: string): THREE.Object3D | null {
    const i = JOINT_INDEX.get(name);
    const b = i === undefined ? -1 : this.rt.bone[i]!;
    return b >= 0 ? this.nodes[b]! : null;
  }
  apply(f: Frame) {
    const rot = this.flat ? f.pose.rot.map((q, i) => clampYaw(q, FLAT_YAW[SKELETON[i]!.name])) : f.pose.rot;
    const { local, hipsOffset } = retargetPose(this.rt, this.rig, rot, f.pose.root, this.unitsPerMetre);
    for (let b = 0; b < this.nodes.length; b++) {
      const q = local[b]!;
      this.nodes[b]!.quaternion.set(q[0], q[1], q[2], q[3]);
    }
    const hips = this.rt.bone[0]!;
    if (hips >= 0) {
      // The hips move in their parent's frame.
      const parent = this.rig[hips]!.parent;
      const d = parent >= 0 ? qRot(qInv(this.restWorldRot[parent]!), hipsOffset) : hipsOffset;
      const r = this.restLocalPos[hips]!;
      this.nodes[hips]!.position.set(r.x + d[0], r.y + d[1], r.z + d[2]);
    }
  }
  /**
   * THE DRAWING AS SKIN: the model takes the pose of the drawing (its measured skeleton), the drawing is projected and
   * baked onto it, the materials show it wherever the surface faces the lens. `body` = the drawing's BlazePose skeleton
   * (fractions of the picture); without it the drawing is assumed to be in the model's rest pose.
   */
  skin(drawing: ImageBitmap | HTMLCanvasElement, body?: SheetBody, w = drawing.width, h = drawing.height): ProjectionBake {
    if (body) {
      const pose = poseFromBody(body, w, h);
      this.apply({ pose: { rot: pose.rot, root: pose.root } } as unknown as Frame);
    } else {
      // No measured skeleton: the drawing is assumed to be the model's OWN rest pose (a body inflated from the drawing
      // is exactly that), so every bone goes back to its rest transform — not to the engine's T-pose.
      this.nodes.forEach((o, i) => {
        o.position.copy(this.restLocalPos[i]!);
        o.quaternion.copy(this.restLocalRot[i]!);
      });
    }
    this.root.updateMatrixWorld(true);
    const bake = bakeProjection(this.scene, drawing, alphaBounds(drawing));
    // The drawing as a canvas texture (v up, like three's default) at full resolution.
    const c = Object.assign(document.createElement('canvas'), { width: drawing.width, height: drawing.height });
    c.getContext('2d')!.drawImage(drawing, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const next = mats.map((x) => projectedToon(x as THREE.MeshToonMaterial, tex, this.faceRig ? { glsl: this.faceRig.glsl, u: this.faceRig.u } : undefined));
      m.material = Array.isArray(m.material) ? next : next[0]!;
    });
    return bake;
  }
  face(s: FaceState) {
    // A plain GLB has no expressions; the hybrid actor's face is the drawing projected on its head, warped by its marks.
    this.faceRig?.update(s);
  }
  setProp(p: Prop | null) {
    if (p === this.prop) return;
    this.prop = p;
    this.propHolder.clear();
    if (p) this.propHolder.add(buildProp(p));
  }
  update(_dt: number) {
    /* no secondary motion yet (spring bones come with the clothes) */
  }
  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const x of mats) x.dispose();
    });
  }
  /** Diagnostics: the joints the engine drives on this model. */
  get drivenJoints(): string[] {
    return SKELETON.filter((_, i) => this.rt.bone[i]! >= 0).map((j) => j.name);
  }
}
