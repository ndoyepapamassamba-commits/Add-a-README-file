// ACTEUR VIRTUEL 3D — rendu WebGL (three.js) dans le navigateur. Le squelette du moteur (hiérarchie, rotations locales)
// est reproduit tel quel en os three.js : chaque articulation porte sa rotation, aucun reciblage n'est nécessaire.
// Sert à trois choses : l'aperçu de la scène jouée par les acteurs, la vidéo de « performance » (le mannequin qui joue
// la scène) et la vidéo de squelette OpenPose — les deux signaux qui pilotent le transfert de mouvement génératif.
import * as THREE from 'three';
import { SKELETON, jointIndex, type WorldPose } from '../../../server/jev/studio/actor/skeleton';
import { Actor, type Frame, type Script } from '../../../server/jev/studio/actor/actor';

export interface ActorLook {
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
}
export const DEFAULT_LOOKS: ActorLook[] = [
  { skin: '#5a3018', shirt: '#e8742a', pants: '#1b3a7a', hair: '#120c08' },
  { skin: '#4a2614', shirt: '#2a9d8f', pants: '#3b2a1a', hair: '#0d0806' },
];
const CHILD: Record<string, string> = { pelvis: 'spine1', spine1: 'spine2', spine2: 'spine3', spine3: 'neck', neck: 'head', hip: 'knee', knee: 'ankle', ankle: 'toe', collar: 'shoulder', shoulder: 'elbow', elbow: 'wrist', wrist: 'hand', index1: 'index2', index2: 'index3', thumb1: 'thumb2' };
const childOf = (n: string) => CHILD[n] ?? (n.includes('_') ? (CHILD[n.split('_')[1]!] ? `${n.split('_')[0]}_${CHILD[n.split('_')[1]!]}` : null) : null);
const RAD: Record<string, number> = { pelvis: 0.16, spine1: 0.17, spine2: 0.17, spine3: 0.15, neck: 0.05, collar: 0.065, shoulder: 0.05, elbow: 0.042, wrist: 0.04, hip: 0.08, knee: 0.058, ankle: 0.048, index1: 0.013, index2: 0.012, thumb1: 0.014 };
const radOf = (n: string) => RAD[n] ?? RAD[n.split('_')[1] ?? ''] ?? 0.035;

/** One rigged cartoon character: three.js bones mirroring the engine skeleton, toon-shaded capsules, an expressive head. */
export class ActorPuppet3D {
  readonly root = new THREE.Group();
  readonly bones: THREE.Bone[] = [];
  private mouth!: THREE.Mesh;
  private brows: THREE.Mesh[] = [];
  private eyes: THREE.Mesh[] = [];
  constructor(look: ActorLook) {
    const mat = (c: string) => new THREE.MeshToonMaterial({ color: c });
    const mSkin = mat(look.skin);
    const mShirt = mat(look.shirt);
    const mPants = mat(look.pants);
    SKELETON.forEach((j) => {
      const b = new THREE.Bone();
      b.name = j.name;
      b.position.set(...j.offset);
      this.bones.push(b);
      if (j.parent) this.bones[jointIndex(j.parent)]!.add(b);
      else this.root.add(b);
    });
    // Capsules along every bone (to its main child), clothes by region.
    SKELETON.forEach((j) => {
      const c = childOf(j.name);
      if (!c) return;
      const off = new THREE.Vector3(...SKELETON[jointIndex(c)]!.offset);
      const L = off.length();
      const r = radOf(j.name);
      const part = j.name.split('_')[1] ?? j.name;
      const m = ['hip', 'knee'].includes(part) || j.name === 'pelvis' ? mPants : ['ankle'].includes(part) ? mat('#1a1410') : ['elbow', 'wrist', 'index1', 'index2', 'thumb1'].includes(part) || j.name === 'neck' ? mSkin : mShirt;
      const g = new THREE.CapsuleGeometry(r, Math.max(0.001, L - r * 0.4), 6, 14);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.copy(off.clone().multiplyScalar(0.5));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), off.clone().normalize());
      this.bones[jointIndex(j.name)]!.add(mesh);
    });
    // Head: big cartoon head, hair, eyes, brows, nose, mouth.
    const head = this.bones[jointIndex('head')]!;
    const hc = new THREE.Vector3(0, 0.15, 0.01);
    const sph = (r: [number, number, number], m: THREE.Material, p: THREE.Vector3) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), m);
      s.scale.set(...r);
      s.position.copy(p);
      head.add(s);
      return s;
    };
    sph([0.19, 0.21, 0.18], mSkin, hc);
    sph([0.2, 0.16, 0.19], mat(look.hair), hc.clone().add(new THREE.Vector3(0, 0.09, -0.025)));
    sph([0.04, 0.035, 0.04], mSkin, hc.clone().add(new THREE.Vector3(0, -0.015, 0.19)));
    for (const k of [1, -1]) {
      const e = sph([0.045, 0.055, 0.025], mat('#f5f5f5'), hc.clone().add(new THREE.Vector3(0.07 * k, 0.035, 0.155)));
      e.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), mat('#111111')).translateZ(0.8).translateX(-0.06 * k));
      this.eyes.push(e);
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.016, 0.015), mat(look.hair));
      br.position.copy(hc.clone().add(new THREE.Vector3(0.07 * k, 0.11, 0.165)));
      br.userData.k = k;
      br.userData.y = br.position.y;
      head.add(br);
      this.brows.push(br);
    }
    this.mouth = sph([0.065, 0.016, 0.015], mat('#3a0d0f'), hc.clone().add(new THREE.Vector3(0, -0.09, 0.165)));
  }
  /** Applies one engine frame: local rotations + root, then the face channels. */
  apply(f: Frame) {
    f.pose.rot.forEach((q, i) => this.bones[i]!.quaternion.set(q[0], q[1], q[2], q[3]));
    this.bones[0]!.position.set(...f.pose.root);
    const fc = f.face;
    this.mouth.scale.set(0.065 * (1 + 0.25 * fc.smile - 0.1 * fc.frown), 0.016 + 0.05 * fc.mouthOpen, 0.015);
    this.mouth.rotation.z = 0;
    for (const e of this.eyes) e.scale.y = 0.055 * Math.max(0.08, 1 - fc.blink);
    for (const b of this.brows) {
      b.position.y = b.userData.y + 0.02 * fc.browUp - 0.012 * fc.browAngry;
      b.rotation.z = (0.35 * fc.browAngry - 0.15 * fc.browUp) * b.userData.k;
    }
  }
}

/** The COCO / OpenPose body keypoints (18) taken from the skeleton, and the standard limb colours. */
const OP_JOINTS = ['head', 'neck', 'r_shoulder', 'r_elbow', 'r_wrist', 'l_shoulder', 'l_elbow', 'l_wrist', 'r_hip', 'r_knee', 'r_ankle', 'l_hip', 'l_knee', 'l_ankle'];
const OP_LIMBS: [number, number][] = [[1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], [1, 8], [8, 9], [9, 10], [1, 11], [11, 12], [12, 13], [1, 0]];
const OP_COLORS = ['#ff0000', '#ff5500', '#ffaa00', '#ffff00', '#aaff00', '#55ff00', '#00ff00', '#00ff55', '#00ffaa', '#00ffff', '#00aaff', '#0055ff', '#0000ff'];
/** Draws the OpenPose skeleton of a world pose seen by the camera (the conditioning picture of pose-driven video models). */
export function drawOpenPose(ctx: CanvasRenderingContext2D, w: WorldPose, cam: THREE.Camera, W: number, H: number) {
  const pts = OP_JOINTS.map((n) => {
    const p = n === 'head' ? new THREE.Vector3(...w.pos[jointIndex('head')]!).add(new THREE.Vector3(0, 0.15, 0)) : new THREE.Vector3(...w.pos[jointIndex(n)]!);
    const v = p.project(cam);
    return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H] as const;
  });
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(3, W * 0.012);
  OP_LIMBS.forEach(([a, b], i) => {
    ctx.strokeStyle = OP_COLORS[i]!;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(pts[a]![0], pts[a]![1]);
    ctx.lineTo(pts[b]![0], pts[b]![1]);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  pts.forEach((p, i) => {
    ctx.fillStyle = OP_COLORS[i % OP_COLORS.length]!;
    ctx.beginPath();
    ctx.arc(p[0], p[1], Math.max(3, W * 0.01), 0, Math.PI * 2);
    ctx.fill();
  });
}

export interface ActorStageOptions {
  width?: number;
  height?: number;
  /** Background picture (the scene's plate) behind the actors; a neutral studio otherwise. */
  background?: CanvasImageSource | null;
}
/** A WebGL stage with the actors of a scene, frame-stepped (deterministic, not real time). */
export class ActorStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private actors: { name: string; actor: Actor; puppet: ActorPuppet3D; last: Frame | null }[] = [];
  private aim: THREE.Vector3 | null = null;
  readonly W: number;
  readonly H: number;
  constructor(scripts: Record<string, Script>, o: ActorStageOptions = {}) {
    this.W = o.width ?? 540;
    this.H = o.height ?? 960;
    const canvas = document.createElement('canvas');
    canvas.width = this.W;
    canvas.height = this.H;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: !!o.background });
    this.renderer.setSize(this.W, this.H, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = o.background ? null : new THREE.Color('#d9c3a5');
    this.scene.add(new THREE.HemisphereLight('#fff4e0', '#6b4a2b', 1.4));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(2.5, 4, 3);
    this.scene.add(sun);
    if (!o.background) {
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshToonMaterial({ color: '#b8956a' }));
      ground.rotation.x = -Math.PI / 2;
      this.scene.add(ground);
    }
    this.camera = new THREE.PerspectiveCamera(36, this.W / this.H, 0.05, 50);
    this.camera.position.set(0, 1.35, 5.2);
    this.camera.lookAt(0, 1.0, 0.3);
    Object.entries(scripts).forEach(([name, s], i) => {
      const puppet = new ActorPuppet3D(DEFAULT_LOOKS[i % DEFAULT_LOOKS.length]!);
      this.scene.add(puppet.root);
      this.actors.push({ name, actor: new Actor(s), puppet, last: null });
    });
  }
  /** Advances every actor to time t (call with increasing t) and renders. */
  render(t: number, dt = 1 / 25): HTMLCanvasElement {
    for (const a of this.actors) {
      a.last = a.actor.frame(t, dt);
      a.puppet.apply(a.last);
    }
    // Camera operator: frames the group of actors (centre of their pelvises), follows them smoothly.
    const ps = this.actors.map((a) => a.last?.world.pos[0]).filter((p): p is [number, number, number] => !!p);
    if (ps.length) {
      const cx = ps.reduce((a, p) => a + p[0], 0) / ps.length;
      const cz = ps.reduce((a, p) => a + p[2], 0) / ps.length;
      const spread = Math.max(0, ...ps.map((p) => Math.abs(p[0] - cx))) * 2;
      const want = new THREE.Vector3(cx, 1.0, cz);
      this.aim = this.aim ? this.aim.lerp(want, 0.08) : want.clone();
      const dist = 4.6 + spread * 1.2;
      this.camera.position.set(this.aim.x + dist * 0.25, 1.4, this.aim.z + dist);
      this.camera.lookAt(this.aim);
    }
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement;
  }
  /** The OpenPose picture of the current frame (black background, all actors). */
  openPose(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.W, this.H);
    for (const a of this.actors) if (a.last) drawOpenPose(ctx, a.last.world, this.camera, this.W, this.H);
  }
  dispose() {
    this.renderer.dispose();
  }
}

/** Records the performance (and its OpenPose video) frame by frame: deterministic, smooth whatever the machine. */
export async function recordPerformance(
  scripts: Record<string, Script>,
  seconds: number,
  o: ActorStageOptions & { fps?: number; pose?: boolean; onProgress?: (p: number) => void; signal?: AbortSignal } = {},
): Promise<{ performance: Blob; pose: Blob | null; mime: string }> {
  const fps = o.fps ?? 25;
  const stage = new ActorStage(scripts, o);
  const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
  const out = document.createElement('canvas');
  out.width = stage.W;
  out.height = stage.H;
  const octx = out.getContext('2d')!;
  const poseCanvas = o.pose ? Object.assign(document.createElement('canvas'), { width: stage.W, height: stage.H }) : null;
  const pctx = poseCanvas?.getContext('2d') ?? null;
  const streams = [out.captureStream(0), ...(poseCanvas ? [poseCanvas.captureStream(0)] : [])];
  const recs = streams.map((s) => new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: 4_000_000 }));
  const chunks: Blob[][] = recs.map(() => []);
  recs.forEach((r, i) => (r.ondataavailable = (e) => e.data.size && chunks[i]!.push(e.data)));
  const stops = recs.map((r) => new Promise<void>((ok) => (r.onstop = () => ok())));
  recs.forEach((r) => r.start());
  const n = Math.round(seconds * fps);
  for (let i = 0; i <= n; i++) {
    if (o.signal?.aborted) break;
    const t = i / fps;
    if (o.background) octx.drawImage(o.background, 0, 0, stage.W, stage.H);
    else octx.clearRect(0, 0, stage.W, stage.H);
    octx.drawImage(stage.render(t, 1 / fps), 0, 0);
    if (pctx) stage.openPose(pctx);
    // Push exactly one frame per tick (captureStream(0) + requestFrame): no dropped or doubled frames.
    for (const s of streams) (s.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined)?.requestFrame?.();
    o.onProgress?.(i / n);
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }
  recs.forEach((r) => r.stop());
  await Promise.all(stops);
  stage.dispose();
  return { performance: new Blob(chunks[0]!, { type: mime }), pose: poseCanvas ? new Blob(chunks[1]!, { type: mime }) : null, mime };
}
