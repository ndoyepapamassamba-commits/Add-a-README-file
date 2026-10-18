// ACTEURS 3D AFRIKATOON — le THÉÂTRE qui joue chaque scène du film avec les acteurs réutilisables : corps procédural
// « façon de la chaîne » (actorBody.ts) ou modèle .vrm importé (VRoid…) piloté par le même squelette ; mise en
// place, jeu du moteur d'acteur (regards, gestes de la réplique, émotions, entrées), jeu piloté par la voix (battements,
// hochements), lip-sync mot par mot, CHUTE des sketchs (choc : saut, yeux exorbités, mâchoire qui tombe, regard caméra ;
// rire plié en arrière), objet du gag en main, décors des sketchs (cours en parpaings ou en banco avec rideau, villages
// de cases, salons modestes, marchés, plages, cérémonies), découpage plan large / gros plan / réaction. 0 $, aucun quota.
import * as THREE from 'three';
import { SKELETON, jointIndex } from '../../coeur/studio/actor/skeleton';
import { Actor, type Frame } from '../../coeur/studio/actor/actor';
import { directScene, type CueLine } from '../../coeur/studio/actor/director';
import { actingAt, actorFor, mouthShape, propFor, setOf, shotAt, stagingFor, vrmVisemes, type Acting, type ActorLibrary, type ActorLook3D, type MouthShape, type Prop, type SetLook } from '../../coeur/studio/actor/cast3d';
import { speakerKey } from '../../coeur/studio/motion';
import { qRot } from '../../coeur/studio/actor/math';
import { AfroActor, buildProp, darker, inked, toon, type FaceState, type Puppet3D } from './actorBody';
import { SheetActor } from './sheetActor';
import { GlbActor } from './glbActor';
import { inflatedActor } from './inflatedActor';
import { livingSet, setAssets, type LivingSet, type SetAssets } from './livingSet';
import { extrasPlan, walkerX, type ExtraPlan } from '../../coeur/studio/actor/extras';
import type { DecorFit } from './store';
import { poseFor } from '../../coeur/studio/actor/sheet';
import { applyHands, handShapesFor, sameHands, type Hands } from '../../coeur/studio/actor/hands';

export { AfroActor, type FaceState, type Puppet3D };

/** Engine joint → VRM humanoid bone (VRM: T-pose rest, faces +Z, left = +X — the engine's own convention). */
const VRM_BONES: Record<string, string> = {
  pelvis: 'hips', spine1: 'spine', spine2: 'chest', spine3: 'upperChest', neck: 'neck', head: 'head',
  l_collar: 'leftShoulder', l_shoulder: 'leftUpperArm', l_elbow: 'leftLowerArm', l_wrist: 'leftHand', l_index1: 'leftIndexProximal', l_index2: 'leftIndexIntermediate', l_index3: 'leftIndexDistal', l_thumb1: 'leftThumbMetacarpal', l_thumb2: 'leftThumbProximal',
  r_collar: 'rightShoulder', r_shoulder: 'rightUpperArm', r_elbow: 'rightLowerArm', r_wrist: 'rightHand', r_index1: 'rightIndexProximal', r_index2: 'rightIndexIntermediate', r_index3: 'rightIndexDistal', r_thumb1: 'rightThumbMetacarpal', r_thumb2: 'rightThumbProximal',
  l_hip: 'leftUpperLeg', l_knee: 'leftLowerLeg', l_ankle: 'leftFoot', l_toe: 'leftToes', r_hip: 'rightUpperLeg', r_knee: 'rightLowerLeg', r_ankle: 'rightFoot', r_toe: 'rightToes',
};
type VrmLike = {
  scene: THREE.Object3D;
  humanoid: { getNormalizedBoneNode(n: string): THREE.Object3D | null; getRawBoneNode(n: string): THREE.Object3D | null };
  expressionManager?: { setValue(n: string, v: number): void } | null;
  update(dt: number): void;
};
/** A .vrm model (VRoid Studio, VRoid Hub, Booth…) driven by the engine skeleton, with its own lip-sync expressions. */
export class VrmActor implements Puppet3D {
  readonly root: THREE.Object3D;
  private hipsY: number;
  private propHolder = new THREE.Group();
  private prop: Prop | null = null;
  private constructor(private vrm: VrmLike) {
    this.root = vrm.scene;
    this.hipsY = vrm.humanoid.getNormalizedBoneNode('hips')?.position.y ?? 0.95;
    vrm.humanoid.getRawBoneNode('rightHand')?.add(this.propHolder);
  }
  static async load(blob: Blob): Promise<VrmActor> {
    const [{ GLTFLoader }, vrmLib] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('@pixiv/three-vrm')]);
    const loader = new GLTFLoader();
    loader.register((p) => new vrmLib.VRMLoaderPlugin(p));
    const url = URL.createObjectURL(blob);
    try {
      const gltf = await loader.loadAsync(url);
      const vrm = gltf.userData.vrm as (VrmLike & { meta?: { metaVersion?: string } }) | undefined;
      if (!vrm) throw new Error('ce fichier n’est pas un modèle VRM');
      vrmLib.VRMUtils.removeUnnecessaryVertices(gltf.scene);
      vrmLib.VRMUtils.combineSkeletons(gltf.scene);
      // VRM 0.x models face −Z: turned to face +Z like VRM 1.0 and the engine.
      vrmLib.VRMUtils.rotateVRM0(vrm as never);
      vrm.scene.traverse((o) => (o.frustumCulled = false));
      return new VrmActor(vrm);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  bone(name: string) {
    const b = VRM_BONES[name];
    return b ? this.vrm.humanoid.getNormalizedBoneNode(b) : null;
  }
  apply(f: Frame) {
    SKELETON.forEach((j, i) => {
      const n = this.bone(j.name);
      const q = f.pose.rot[i]!;
      if (n) n.quaternion.set(q[0], q[1], q[2], q[3]);
    });
    const hips = this.bone('pelvis');
    if (hips) hips.position.set(f.pose.root[0], (f.pose.root[1] / 0.95) * this.hipsY, f.pose.root[2]);
  }
  face(s: FaceState) {
    const em = this.vrm.expressionManager;
    if (!em) return;
    const v = vrmVisemes({ ...s.mouth, open: Math.min(1, s.mouth.open + s.laugh * 0.6 + s.shock) });
    for (const [k, x] of Object.entries(v)) em.setValue(k, x);
    em.setValue('blink', s.shock > 0.3 ? 0 : s.blink);
    em.setValue('happy', Math.min(1, s.smile * 0.6 + s.laugh));
    em.setValue('angry', s.browAngry * 0.8);
    em.setValue('sad', s.frown * 0.7);
    em.setValue('surprised', Math.min(1, Math.max(0, s.browUp - s.smile) * 0.6 + s.shock));
  }
  setProp(p: Prop | null) {
    if (p === this.prop) return;
    this.prop = p;
    this.propHolder.clear();
    if (p) this.propHolder.add(buildProp(p));
  }
  update(dt: number) {
    this.vrm.update(dt);
  }
  dispose() {
    this.vrm.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const tq = new THREE.Quaternion();
const turn = (o: THREE.Object3D | null, axis: keyof typeof AX, a: number) => {
  if (o && a) o.quaternion.multiply(tq.setFromAxisAngle(AX[axis], a));
};
/** The voice-driven acting layered on top of the skeletal performance (local rotations of head, spine, arms). */
export function applyActing(p: Puppet3D, a: Acting) {
  turn(p.bone('head'), 'x', a.headPitch);
  turn(p.bone('head'), 'y', a.headYaw);
  turn(p.bone('head'), 'z', a.headRoll);
  turn(p.bone('spine2'), 'x', a.spinePitch);
  turn(p.bone('spine2'), 'z', a.spineRoll);
  // Forearm lifted forward (beats of the speaker's hands, hands to the cheeks in shock): −Y bends the left arm, +Y the right.
  turn(p.bone('l_elbow'), 'y', -(0.15 + a.armL * 0.9));
  turn(p.bone('r_elbow'), 'y', 0.15 + a.armR * 0.9);
  if (a.armL > 1) turn(p.bone('l_shoulder'), 'z', -(a.armL - 1) * 1.2);
  if (a.armR > 1) turn(p.bone('r_shoulder'), 'z', (a.armR - 1) * 1.2);
  turn(p.bone('l_collar'), 'z', a.shoulders);
  turn(p.bone('r_collar'), 'z', -a.shoulders);
  // Jump of surprise + squash-and-stretch of the whole body.
  const pel = p.bone('pelvis');
  if (pel && a.hop) pel.position.y += a.hop;
  p.root.scale.set(1 - a.stretch * 0.5, 1 + a.stretch, 1 - a.stretch * 0.5);
}

const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number]) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
/** Wall surfaces of the sets: cement blocks (grey, with stains), mud bricks, wallpaper. */
function wallTexture(set: SetLook): THREE.Texture | undefined {
  if (set.surface === 'parpaings' || set.surface === 'briques') {
    const blocks = set.surface === 'parpaings';
    return canvasTex(
      256,
      256,
      (g) => {
        g.fillStyle = set.wall;
        g.fillRect(0, 0, 256, 256);
        const bw = blocks ? 128 : 64;
        const bh = blocks ? 64 : 32;
        for (let y = 0; y < 256; y += bh)
          for (let x = (y / bh) % 2 ? -bw / 2 : 0; x < 256; x += bw) {
            g.fillStyle = darker(set.wall, 0.86 + ((x * 7 + y * 13) % 17) / 100);
            g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
          }
        // Stains and cracks: a lived-in courtyard.
        g.strokeStyle = darker(set.wall, 0.6);
        g.lineWidth = 2;
        for (const [x, y] of [[40, 70], [170, 150], [90, 210]] as const) {
          g.beginPath();
          g.ellipse(x, y, 26, 10, 0.2, 0, Math.PI * 1.6);
          g.stroke();
        }
      },
      blocks ? [7, 3] : [10, 4],
    );
  }
  if (set.surface === 'tapisserie')
    return canvasTex(
      64,
      64,
      (g) => {
        g.fillStyle = set.wall;
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = darker(set.wall, 1.25);
        for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 3, 64);
        g.fillStyle = '#ffffff33';
        for (let y = 8; y < 64; y += 16) {
          g.beginPath();
          g.arc(32, y, 4, 0, Math.PI * 2);
          g.fill();
        }
      },
      [14, 6],
    );
  return undefined;
}
function groundTexture(set: SetLook): THREE.Texture {
  return canvasTex(
    128,
    128,
    (g) => {
      g.fillStyle = set.floor;
      g.fillRect(0, 0, 128, 128);
      // Sand / laterite grain, or wooden floor boards inside.
      if (set.outdoor)
        for (let i = 0; i < 900; i++) {
          g.fillStyle = darker(set.floor, 0.8 + ((i * 37) % 40) / 100);
          g.fillRect((i * 53) % 128, (i * 97) % 128, 2, 2);
        }
      else {
        g.fillStyle = darker(set.floor, 0.82);
        for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 128, 2);
      }
    },
    [12, 10],
  );
}

/** The set of a location (walls, floor, sky, props), behind the actors — the same set for the same place. */
function buildSet(set: SetLook, vertical: boolean): THREE.Group {
  const g = new THREE.Group();
  const mat = (c: string, map?: THREE.Texture) => toon(c, map);
  const box = (w: number, h: number, d: number, c: string | THREE.Material, x: number, y: number, z: number, ink = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c) : c);
    m.position.set(x, y, z);
    g.add(ink ? inked(m, 0.01) : m);
    return m;
  };
  const cyl = (rt: number, rb: number, h: number, c: string, x: number, y: number, z: number, seg = 16) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c));
    m.position.set(x, y, z);
    g.add(inked(m, 0.02));
    return m;
  };
  const ball = (r: number, c: string, x: number, y: number, z: number, s: [number, number, number] = [1, 1, 1]) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(c));
    m.position.set(x, y, z);
    m.scale.set(...s);
    g.add(inked(m, 0.02));
    return m;
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), mat('#ffffff', groundTexture(set)));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 1;
  g.add(floor);
  const W = vertical ? 1.2 : 1.9;
  // The back wall: a whole room wall indoors; outdoors a house facade (height 2.6 m) with the sky above.
  if (set.surface !== 'ciel') {
    const h = set.outdoor ? 2.6 : 6;
    const wt = wallTexture(set);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, h), wt ? mat('#ffffff', wt) : mat(set.wall));
    wall.position.set(0, h / 2, -1.8);
    g.add(wall);
    box(16, 0.12, 0.04, darker(set.wall, 0.7), 0, 0.06, -1.78, false);
    if (!set.outdoor) box(16, 0.08, 0.03, set.accent, 0, 1.25, -1.78, false);
  } else {
    // Distant trees on the horizon.
    for (let i = -4; i <= 4; i++) ball(0.9, i % 2 ? '#2e7d4a' : '#3a9a5a', i * 1.6, 1.1 + (i % 3) * 0.2, -7.5, [1.2, 1, 1]);
  }
  let slot = 0;
  const xs = [-W, W, -W * 0.45, W * 0.55, -W * 1.6, W * 1.6];
  const nextX = () => xs[slot++ % xs.length]!;
  for (const p of set.props) {
    if (p === 'toit tôle') {
      // Corrugated sheet roof over the facade.
      const roof = box(16, 0.06, 1.0, '#8d8a84', 0, 2.68, -1.45);
      roof.rotation.x = 0.18;
      continue;
    }
    if (p === 'linge') {
      // Laundry line with colourful clothes.
      const x0 = W * 0.2;
      box(0.04, 1.9, 0.04, '#6b4226', x0 - 0.9, 0.95, -1.3);
      box(0.04, 1.9, 0.04, '#6b4226', x0 + 0.9, 0.95, -1.3);
      box(1.8, 0.01, 0.01, '#333333', x0, 1.85, -1.3, false);
      ['#e0559a', '#2456b8', '#f2c12e', '#2e8b57'].forEach((c, i) => box(0.32, 0.4 + (i % 2) * 0.12, 0.01, c, x0 - 0.6 + i * 0.4, 1.62 - (i % 2) * 0.06, -1.3));
      continue;
    }
    if (p === 'mur bas') {
      box(16, 0.9, 0.2, darker(set.wall, 0.85), 0, 0.45, -1.6);
      continue;
    }
    const x = nextX();
    if (p === 'rideau' || p === 'porte') {
      // Doorway: dark opening + a cloth curtain with folds (the yellow curtain of the reference clip).
      box(0.9, 2.0, 0.05, '#2a1d14', x, 1.0, -1.79, false);
      if (p === 'rideau') {
        const geo = new THREE.PlaneGeometry(0.85, 1.95, 24, 1);
        const pos = geo.attributes.position!;
        for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 40) * 0.025);
        geo.computeVertexNormals();
        const cur = new THREE.Mesh(geo, mat(set.kind === 'cour' || set.kind === 'neutre' ? '#f2c12e' : set.accent));
        (cur.material as THREE.Material).side = THREE.DoubleSide;
        cur.position.set(x, 1.0, -1.74);
        g.add(cur);
      } else box(0.8, 1.9, 0.05, darker(set.accent, 0.6), x, 0.95, -1.76);
    } else if (p === 'fenêtre' || p === 'volets') {
      box(0.95, 1.0, 0.04, '#ffffff', x, 1.75, -1.77);
      box(0.82, 0.87, 0.04, p === 'volets' ? '#2a1d14' : '#9fd3f2', x, 1.75, -1.75, false);
      if (p === 'volets')
        for (const dx of [-0.6, 0.6]) {
          // Wooden louvered shutters, open.
          const sh = box(0.42, 0.9, 0.04, '#8b6a4a', x + dx, 1.75, -1.72);
          for (let k = 0; k < 6; k++) box(0.4, 0.02, 0.05, '#6b4a2a', x + dx, 1.4 + k * 0.14, -1.7, false);
          sh.rotation.y = dx > 0 ? -0.4 : 0.4;
        }
    } else if (p === 'tableau') {
      box(1.1, 0.75, 0.04, set.kind === 'école' ? '#6b4226' : '#d4a017', x, 1.8, -1.77);
      box(0.98, 0.63, 0.04, set.kind === 'école' ? '#1f4d3a' : set.accent, x, 1.8, -1.75, false);
    } else if (p === 'photos') {
      [-0.3, 0, 0.3].forEach((dx, i) => {
        box(0.22, 0.28, 0.03, '#d4a017', x + dx, 1.85 + (i % 2) * 0.12, -1.77);
        box(0.17, 0.22, 0.03, ['#8fb3d9', '#d99a8f', '#a3c98f'][i]!, x + dx, 1.85 + (i % 2) * 0.12, -1.755, false);
      });
    } else if (p === 'télé') {
      box(0.9, 0.55, 0.45, '#6b4a2a', x, 0.28, -1.5);
      box(0.6, 0.45, 0.4, '#2b2b2b', x, 0.8, -1.5);
      box(0.48, 0.34, 0.02, '#4a6a7a', x, 0.82, -1.29, false);
    } else if (p === 'bureau' || p === 'table' || p === 'comptoir') {
      const w = p === 'comptoir' ? 1.4 : 1.1;
      box(w, 0.08, 0.6, p === 'bureau' ? '#8a6a4a' : '#a0703f', x, p === 'comptoir' ? 1.0 : 0.75, -1.15);
      if (p === 'comptoir') box(w, 0.95, 0.5, darker(set.accent, 0.8), x, 0.5, -1.2);
      else for (const dx of [-w / 2 + 0.06, w / 2 - 0.06]) box(0.06, 0.72, 0.06, '#5a3e28', x + dx, 0.36, -1.15);
      if (p === 'bureau') box(0.4, 0.28, 0.04, '#222831', x + 0.2, 0.95, -1.25);
    } else if (p === 'chaise') {
      box(0.45, 0.06, 0.45, set.accent, x, 0.46, -1.1);
      box(0.45, 0.5, 0.06, set.accent, x, 0.72, -1.32);
    } else if (p === 'chaises plastique') {
      // White / red monobloc chairs.
      [0, 0.55].forEach((dx, i) => {
        const c = i ? '#c62828' : '#f2f0ea';
        box(0.44, 0.05, 0.42, c, x + dx, 0.44, -1.15);
        box(0.44, 0.48, 0.05, c, x + dx, 0.7, -1.34);
        for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]] as const) box(0.04, 0.44, 0.04, c, x + dx + lx, 0.22, -1.15 + lz, false);
      });
    } else if (p === 'banc') {
      box(1.3, 0.07, 0.35, '#8b5a2b', x, 0.42, -1.2);
      for (const dx of [-0.55, 0.55]) box(0.08, 0.42, 0.3, '#6b4226', x + dx, 0.21, -1.2);
    } else if (p === 'canapé') {
      const sofa = mat('#ffffff', canvasTex(64, 64, (g2) => {
        g2.fillStyle = set.accent;
        g2.fillRect(0, 0, 64, 64);
        g2.fillStyle = '#ffffff44';
        for (let y = 0; y < 64; y += 16) for (let xx = (y / 16) % 2 ? 8 : 0; xx < 64; xx += 16) g2.fillRect(xx, y, 6, 6);
      }, [4, 2]));
      box(1.7, 0.45, 0.75, sofa, x, 0.3, -1.35);
      box(1.7, 0.6, 0.2, sofa, x, 0.65, -1.62);
      for (const dx of [-0.85, 0.85]) box(0.2, 0.6, 0.75, sofa, x + dx, 0.45, -1.35);
    } else if (p === 'étal') {
      box(1.2, 0.08, 0.6, '#a0703f', x, 0.8, -1.2);
      for (let i = 0; i < 6; i++) ball(0.08, ['#ef7d1a', '#f2c12e', '#2e8b57', '#c62828'][i % 4]!, x - 0.45 + i * 0.18, 0.9, -1.2 + (i % 2) * 0.12);
      ['#e0559a', '#2456b8', '#f2c12e'].forEach((c, i) => box(0.35, 0.5, 0.02, c, x - 0.4 + i * 0.4, 1.4, -1.5));
    } else if (p === 'parasol') {
      cyl(0.02, 0.02, 2.1, '#5a3e28', x, 1.05, -1.3, 8);
      const um = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.35, 8), mat(set.accent));
      um.position.set(x, 2.15, -1.3);
      g.add(inked(um, 0.02));
    } else if (p === 'arbre') {
      cyl(0.11, 0.16, 1.7, '#6b4226', x, 0.85, -1.6);
      for (const [dx, dy, r] of [[0, 2.1, 0.75], [-0.45, 1.85, 0.5], [0.45, 1.9, 0.55]] as const) ball(r, '#2e8b57', x + dx, dy, -1.6);
    } else if (p === 'cocotier') {
      for (let k = 0; k < 5; k++) cyl(0.07, 0.09, 0.55, '#8b6a4a', x + k * 0.06, 0.27 + k * 0.52, -2.2, 8);
      for (let k = 0; k < 7; k++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.1, 4), mat('#2e8b57'));
        leaf.position.set(x + 0.3, 2.75, -2.2);
        leaf.rotation.set(Math.cos(k) * 1.2, (k / 7) * Math.PI * 2, 1.2);
        g.add(leaf);
      }
    } else if (p === 'case') {
      // Thatched mud hut (village).
      cyl(1.0, 1.0, 1.6, '#b07a4a', x * 1.3, 0.8, -3.2, 24);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.35, 1.1, 24), mat('#c9a14a'));
      roof.position.set(x * 1.3, 2.15, -3.2);
      g.add(inked(roof, 0.02));
      box(0.5, 1.0, 0.05, '#2a1d14', x * 1.3, 0.5, -2.2, false);
    } else if (p === 'barque') {
      box(1.6, 0.3, 0.5, '#2456b8', x, 0.18, -2.0);
      box(1.6, 0.06, 0.52, '#f2c12e', x, 0.3, -2.0, false);
    } else if (p === 'tente') {
      box(4.5, 0.08, 2.4, '#f2f0ea', 0, 2.6, -1.0);
      for (const dx of [-2.1, 2.1]) box(0.06, 2.6, 0.06, '#c9c9c9', dx, 1.3, -1.9);
      box(4.5, 0.25, 0.02, set.accent, 0, 2.45, 0.2, false);
    } else if (p === 'marmites') {
      for (const dx of [0, 0.5]) cyl(0.22, 0.2, 0.32, '#4a4a4a', x + dx, 0.16, -1.3);
    } else if (p === 'plante') {
      box(0.3, 0.35, 0.3, '#b5653a', x, 0.18, -1.4);
      ball(0.28, '#3a9a5a', x, 0.6, -1.4);
    }
  }
  if (set.kind === 'plage') {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(30, 6), mat('#2a9dc8'));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.01, -5);
    g.add(sea);
  }
  if (set.kind === 'salon' || set.kind === 'maquis' || set.kind === 'bureau') {
    // A rug under the actors: depth and colour on the floor.
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1, 40), mat(darker(set.accent, 0.8)));
    rug.rotation.x = -Math.PI / 2;
    rug.scale.set(1.5, 0.85, 1);
    rug.position.set(0, 0.004, 0.15);
    g.add(rug);
  }
  return g;
}

/**
 * The owner's set picture as the back of the stage, AT THE SCALE OF THE ACTORS: its picture covers its real height
 * (metres, measured per set) at a depth behind the actors, its floor line lies on their floor, the part of the picture
 * without people stands behind them. Where a vertical 9:16 frame sees more than the picture holds, the set is
 * continued in mirror around it, more blurred and a little darker (depth of field), never stretched.
 */
/** A soft shadow under each actor (no shadow maps: cheap and always clean). */
function blobShadow(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.45)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.005;
  return m;
}

/** What the montage knows at time t: who speaks, how loud, the mouth of the word, the gesture of the line. */
export interface LiveCue {
  speaker: string | null;
  /** Text of the line being said (a question accuses, an exclamation shrugs). */
  text?: string;
  energy: number;
  beat: number;
  mouth: MouthShape;
  gesture?: string | null;
  emotion?: string;
  lineAge?: number;
  /** Test / bench override of the face state (mouth, blink, brows…) merged over the computed one. */
  face?: Partial<FaceState>;
}
export interface Scene3DInput {
  /** The owner's empty set (their décor image) behind the actors, instead of the procedural set. */
  backdrop?: Blob | null;
  /** Its stored id (the textures and relief of a set are built once and shared by its scenes). */
  backdropId?: string;
  /** Its depth map (Depth Anything V2, measured once per set): the set becomes a relief. */
  backdropDepth?: Blob | null;
  /** The soft mask of the people painted in the set (they breathe and sway). */
  backdropPeople?: Blob | null;
  /** The troupe's other characters: figurants passing by or chatting behind the actors in a public place. */
  extras?: ActorLook3D[];
  /** Its scale, floor line and the part without people (measured per set). */
  backdropFit?: DecorFit;
  names: string[];
  lines: CueLine[];
  seconds: number;
  action: string;
  location: string;
  cast: ActorLibrary;
}
interface Cast3D {
  key: string;
  engine: Actor;
  puppet: Puppet3D;
  /** The owner's drawn character (its sheet), played instead of the 3D body. */
  sheet: SheetActor | null;
  shadow: THREE.Mesh;
  last: Frame | null;
  lastT: number;
  /** Hand shapes of the moment and the previous ones (blended over a quarter second). */
  hands?: { cur: Hands; prev: Hands; since: number };
  phase: number;
  /** Object held in this scene (named by the action, or the actor's signature prop). */
  prop: Prop | null;
  /** Heading of the mark (to turn the head into the camera at the chute). */
  heading: number;
  /** Body scale (a child is 0.62): the engine positions are for a standard body. */
  scale: number;
}
interface Rig {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  actors: Cast3D[];
  aim: THREE.Vector3 | null;
  dist: number;
  lines: CueLine[];
  names: string[];
  /** Current shot (a change is a hard cut: the camera snaps instead of gliding). */
  shot: string;
  /** Direction of the camera for the current close-up (fixed for the whole shot: no swaying). */
  dir: THREE.Vector3 | null;
  /** The living set (relief, lens, light, dust) when the owner's picture is behind the actors. */
  life: LivingSet | null;
  /** Figurants of the place (behind the actors, out of focus). */
  extras: { sheet: SheetActor; plan: ExtraPlan }[];
}
/** A VRM model is loaded once per asset and cloned for each scene (VRMs are heavy). */
export type VrmSource = (assetId: string) => Promise<Blob | undefined>;

/** THE THEATRE: one WebGL renderer for the whole film, one 3D scene per film scene. */
export class Theater3D {
  readonly renderer: THREE.WebGLRenderer;
  private rigs = new Map<number, Rig>();
  /** ONE body per actor for the whole film (a .vrm is parsed once): it moves to the scene being rendered. */
  private puppets = new Map<string, Promise<Puppet3D | null>>();
  private sheets = new Map<string, Promise<SheetActor | null>>();
  /** The sets' textures and relief, built once per picture. */
  private sets = new Map<Blob | string, Promise<SetAssets>>();
  readonly vertical: boolean;
  constructor(
    readonly W: number,
    readonly H: number,
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(W, H, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.vertical = H > W;
  }
  has(k: number) {
    return this.rigs.has(k);
  }
  /** Prepares film scene k: set, actors on their marks, the skeletal performance of the scene. */
  async addScene(k: number, s: Scene3DInput, vrmOf?: VrmSource): Promise<{ vrmFailed: string[] }> {
    const scene = new THREE.Scene();
    const set = setOf(s.location);
    // Outdoors: blue sky and warm sun (the light of the sketches); indoors: the room wall.
    scene.background = new THREE.Color(set.outdoor ? '#8ecdf2' : set.wall);
    scene.add(new THREE.HemisphereLight(set.outdoor ? '#e8f4ff' : '#fff6e6', '#7a5a3a', 1.5));
    const key = new THREE.DirectionalLight(set.outdoor ? '#fff1d6' : '#ffffff', set.outdoor ? 2.4 : 2.0);
    key.position.set(2.2, 4, 3.5);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#ffd9a0', 1.1);
    rim.position.set(-2.5, 3, -3);
    scene.add(rim);
    let grade: [number, number, number] | null = null;
    let life: LivingSet | null = null;
    if (s.backdrop) {
      const key = s.backdropId ?? s.backdrop;
      if (!this.sets.has(key)) this.sets.set(key, setAssets(s.backdrop, s.backdropDepth ?? null, s.backdropFit, set.outdoor, Math.min(3072, this.renderer.capabilities.maxTextureSize), s.backdropPeople ?? null));
      const assets = await this.sets.get(key)!.catch(() => null);
      const bd = assets ? livingSet(assets, this.H) : null;
      if (bd) {
        life = bd;
        scene.add(bd.group);
        scene.background = bd.tint;
        // The drawn actors take on a little of the set's light (colour and exposure), so they sit IN the picture.
        const [ar, ag, ab] = bd.avg;
        const lum = Math.max(0.05, 0.299 * ar + 0.587 * ag + 0.114 * ab);
        const ex = Math.min(1.04, Math.max(0.86, 0.9 + 0.35 * (lum - 0.42)));
        grade = [ar, ag, ab].map((c) => (1 + 0.12 * (c / lum - 1)) * ex) as [number, number, number];
      } else scene.add(buildSet(set, this.vertical));
    } else scene.add(buildSet(set, this.vertical));
    const names = s.names.slice(0, 4);
    const staging = stagingFor(names, s.seconds, this.vertical);
    // Drawn actors (flat cut-outs facing the camera) stand closer together, like the characters of the sketches.
    if (names.every((n) => actorFor(s.cast, n).sheet)) for (const m of Object.values(staging.marks)) m.pos = [m.pos[0] * 0.8, m.pos[1]];
    const scripts = directScene(names, s.lines, staging, s.action);
    const actors: Cast3D[] = [];
    const vrmFailed: string[] = [];
    for (const [i, name] of names.entries()) {
      const script = scripts[name];
      if (!script) continue;
      const look = actorFor(s.cast, name);
      // The owner's drawn character first (its sheet), else its VRM, else the procedural body.
      // CORPS 3D: the drawn character inflated into a 3D body from its neutral drawing (its measured skeleton drives
      // the bones) — the engine's full-body acting then plays it like a rigged model, the drawing stays its skin.
      const neutral = look.body3d ? look.sheet?.poses.find((p) => p.kind === 'neutre' && p.body) : undefined;
      const sid = `sheet|${look.key}|${look.sheet?.sourceAssetId ?? ''}`;
      if (look.sheet && vrmOf && !neutral && !this.sheets.has(sid)) this.sheets.set(sid, SheetActor.load(look, vrmOf).catch(() => null));
      const sheet = look.sheet && vrmOf && !neutral ? await this.sheets.get(sid)! : null;
      sheet?.setGrade(grade);
      sheet?.setWrap(life ? life.avg : null);
      const id = `${look.key}|${look.vrmAssetId ?? ''}|${neutral ? `3d:${neutral.assetId}` : ''}|${look.updatedAt ?? 0}`;
      if (!this.puppets.has(id))
        this.puppets.set(
          id,
          neutral && vrmOf
            ? vrmOf(neutral.assetId)
                .then((b) => (b ? inflatedActor(neutral, b, 1.72 * look.height) : null))
                .catch(() => null)
            : look.vrmAssetId && vrmOf
              ? vrmOf(look.vrmAssetId)
                  // A VRM keeps its expressions; any other rigged glTF/GLB (Mixamo, UniRig, Rigify…) is driven as a GlbActor.
                  .then((b) => (b ? VrmActor.load(b).catch(() => GlbActor.load(b, 1.72 * look.height)) : null))
                  .catch(() => null)
              : Promise.resolve(null),
        );
      let puppet = await this.puppets.get(id)!;
      if (!puppet) {
        if (look.vrmAssetId) vrmFailed.push(look.name);
        puppet = new AfroActor(look);
        this.puppets.set(id, Promise.resolve(puppet));
      }
      if (!sheet) scene.add(puppet.root);
      const shadow = blobShadow();
      scene.add(shadow);
      actors.push({ key: speakerKey(name), engine: new Actor(script), puppet, sheet, shadow, last: null, lastT: -1, phase: i * 1.7 + k * 0.9, prop: propFor(name, s.action, look.prop), heading: staging.marks[name]?.heading ?? 0, scale: puppet instanceof AfroActor ? look.height : 1 });
    }
    // FIGURANTS: in a public place, a few of the troupe's other characters pass by or chat behind the actors.
    const extras: Rig['extras'] = [];
    const pool = (s.extras ?? []).filter((l) => l.sheet?.poses.length && !names.some((n) => speakerKey(n) === l.key));
    if (life && vrmOf)
      for (const plan of extrasPlan(s.location, set.outdoor, k, pool.length)) {
        const look = pool[plan.pick]!;
        const sid = `extra|${look.key}|${look.sheet?.sourceAssetId ?? ''}`;
        if (!this.sheets.has(sid)) this.sheets.set(sid, SheetActor.load(look, vrmOf).catch(() => null));
        const sh = await this.sheets.get(sid)!;
        if (!sh) continue;
        sh.setGrade(grade ? (grade.map((c) => c * 0.94) as [number, number, number]) : null);
        sh.setWrap(life.avg);
        extras.push({ sheet: sh, plan });
      }
    const camera = new THREE.PerspectiveCamera(this.vertical ? 46 : 32, this.W / this.H, 0.05, 60);
    this.rigs.set(k, { scene, camera, actors, aim: null, dist: 0, lines: s.lines, names, shot: '', dir: null, life, extras });
    return { vrmFailed };
  }
  /** Renders film scene k at its local time t (seconds since the scene start). */
  render(k: number, t: number, live: LiveCue): HTMLCanvasElement {
    const rig = this.rigs.get(k);
    if (!rig) return this.renderer.domElement;
    const speakerK = live.speaker ? speakerKey(live.speaker) : null;
    for (const a of rig.actors) {
      // The actor's body joins the scene being rendered (one body per actor for the whole film).
      const body = a.sheet ? a.sheet.root : a.puppet.root;
      if (body.parent !== rig.scene) rig.scene.add(body);
      // Time only moves forward (the step planner keeps state): a repeated instant reuses its frame.
      if (t > a.lastT + 1e-4 || !a.last) {
        const dt = a.lastT < 0 ? 1 / 30 : Math.min(0.1, t - a.lastT);
        a.last = a.engine.frame(t, dt);
        a.lastT = t;
      }
      const f = a.last;
      const speaking = speakerK === a.key;
      // THE CHUTE: after the last line, the listener freezes in shock looking at the camera, the speaker laughs.
      const last = rig.lines.at(-1);
      const after = last && !speakerK ? t - last.end : -1;
      const react = after > 0.05 && rig.actors.length > 1 ? (speakerKey(last!.speaker) === a.key ? 'rire' : 'choc') : null;
      const acting = actingAt({ t, speaking, listening: !!speakerK && !speaking, energy: speaking ? live.energy : 0, beat: speaking ? live.beat : 0, gesture: speaking ? live.gesture : null, emotion: speaking ? live.emotion : undefined, lineAge: live.lineAge, phase: a.phase, react, reactAge: after, toCamera: -a.heading * 0.85 });
      const p0 = f.world.pos[0]!;
      if (a.sheet) {
        // The drawn actor: its mark on the ground, the pose of the moment, facing its partner. In the two-shot its ink
        // lines are softened a touch (the same lens as the set — v51 measured the actors far sharper than the décor).
        a.sheet.setDefocus(/^(close|react)/.test(rig.shot) ? 0 : 0.6);
        a.sheet.root.position.set(p0[0], 0, p0[2]);
        const pose = poseFor({ speaking, gesture: speaking ? live.gesture : null, emotion: speaking ? live.emotion : undefined, text: speaking ? live.text : undefined, react });
        // Each drawn pose has its own direction (read on its face): mirrored when it would turn its back to the partner.
        const facing = a.sheet.facingFor(pose);
        const wantRight = rig.actors.length > 1 ? p0[0] < 0 : facing === -1 ? false : true;
        a.sheet.play(
          {
            t: t + a.phase,
            pose,
            open: speaking ? live.mouth.open : 0,
            wide: speaking ? live.mouth.wide : 0,
            round: speaking ? live.mouth.round : 0,
            shock: react === 'choc' ? acting.shock : 0,
            energy: speaking ? live.energy : 0,
            beat: speaking ? live.beat : 0,
            hop: acting.hop,
            stretch: acting.stretch,
            laugh: acting.laugh,
            listening: !!speakerK && !speaking,
            toward: rig.actors.length > 1 ? (p0[0] < 0 ? 1 : -1) : 0,
            text: speaking ? live.text : undefined,
            phase: a.phase,
            flip: facing !== 0 && (facing === 1) !== wantRight,
          },
          rig.camera,
        );
        a.shadow.position.set(p0[0], 0.005, p0[2]);
        continue;
      }
      // MAINS (J2): the hand shapes of the line (open, fist, point, thumb) as engine joints, blended, before the retarget.
      const want = handShapesFor({ gesture: speaking ? live.gesture : null, emotion: speaking ? live.emotion : undefined, react });
      if (!a.hands) a.hands = { cur: want, prev: want, since: t };
      else if (!sameHands(a.hands.cur, want)) a.hands = { cur: want, prev: a.hands.cur, since: t };
      const mix = Math.min(1, (t - a.hands.since) / 0.25);
      a.puppet.apply({ ...f, pose: { ...f.pose, rot: applyHands(f.pose.rot, a.hands.cur, a.hands.prev, mix) } });
      a.puppet.setProp(a.prop);
      applyActing(a.puppet, acting);
      const faceState: FaceState = {
        blink: f.face.blink,
        smile: Math.max(f.face.smile, acting.laugh),
        frown: f.face.frown,
        browUp: f.face.browUp,
        browAngry: f.face.browAngry,
        // Only the speaker's mouth moves with the words; the others keep it closed (v44: « des bouches qui parlent sans son »).
        mouth: speaking ? live.mouth : { open: f.face.mouthOpen * 0.5, wide: 0, round: 0 },
        laugh: acting.laugh,
        shock: acting.shock,
      };
      a.puppet.face(live.face ? { ...faceState, ...live.face } : faceState);
      a.puppet.update(1 / 30);
      const p = f.world.pos[0]!;
      a.shadow.position.set(p[0], 0.005, p[2]);
    }
    this.frame(rig, t, speakerK, live.energy);
    // The drawn actors face the camera of THIS frame (placed just above), never the previous one.
    // The figurants: walking across or chatting, out of focus (more in a close-up).
    const closeShot = /^(close|react)/.test(rig.shot);
    for (const e of rig.extras) {
      if (e.sheet.root.parent !== rig.scene) rig.scene.add(e.sheet.root);
      const x = walkerX(e.plan, t);
      e.sheet.root.position.set(x, 0, e.plan.z);
      const chat = e.plan.talk && Math.sin(t * 0.9 + e.plan.phase) > 0.2;
      e.sheet.setDefocus(closeShot ? 3.2 : 1.6);
      e.sheet.play(
        {
          t: t + e.plan.phase,
          pose: 'neutre',
          open: chat ? 0.25 + 0.25 * Math.abs(Math.sin(t * 8.5 + e.plan.phase)) : 0,
          energy: chat ? 0.25 : 0,
          beat: 0,
          hop: 0,
          stretch: 0,
          laugh: 0,
          listening: e.plan.talk && !chat,
          toward: 0,
          phase: e.plan.phase,
          flip: e.plan.walking ? e.plan.dir < 0 : x > 0,
          ...(e.plan.walking ? { walk: { phase: ((t * e.plan.speed) / 0.32) * Math.PI, dir: e.plan.dir } } : {}),
        },
        rig.camera,
      );
    }
    rig.camera.updateMatrixWorld();
    for (const a of rig.actors) a.sheet?.faceCamera(rig.camera);
    for (const e of rig.extras) e.sheet.faceCamera(rig.camera);
    rig.life?.update(t, /^(close|react)/.test(rig.shot) ? 1 : 0);
    this.renderer.render(rig.scene, rig.camera);
    return this.renderer.domElement;
  }
  /** Camera operator: two-shot of the group, a gentle push-in at the start, then closer on whoever speaks. */
  private frame(rig: Rig, t: number, speakerK: string | null, energy: number) {
    // Where each FACE is (the engine works for a standard body: a child's head is lower; the big cartoon head sits above the head joint).
    const faceOf = (a: Cast3D | undefined): [number, number, number] | undefined => {
      if (a?.sheet && a.last) {
        const r = a.last.world.pos[0]!;
        return [r[0], a.sheet.faceY(), r[2]];
      }
      const p = a?.last?.world.pos[jointIndex('head')];
      return p ? [p[0], p[1] * a!.scale + 0.12 * a!.scale, p[2]] : undefined;
    };
    const ps = rig.actors.map((a) => faceOf(a)).filter((p): p is [number, number, number] => !!p);
    if (!ps.length) {
      rig.camera.position.set(0, 1.4, 4);
      rig.camera.lookAt(0, 1.2, 0);
      return;
    }
    const cx = ps.reduce((a, p) => a + p[0], 0) / ps.length;
    const cz = ps.reduce((a, p) => a + p[2], 0) / ps.length;
    const cy = ps.reduce((a, p) => a + p[1], 0) / ps.length;
    const spread = Math.max(0.35, ...ps.map((p) => Math.abs(p[0] - cx)));
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(rig.camera.fov / 2)) * rig.camera.aspect);
    // Wide enough for the whole group (+ the arms), never further than needed; drawn actors (their art holds the arms)
    // are framed tighter, knees up, like the characters of the sketches.
    const drawn = rig.actors.every((a) => a.sheet);
    const wide = (spread + (drawn ? 0.36 : 0.55)) / Math.tan(hfov / 2);
    const sp = speakerK ? faceOf(rig.actors.find((a) => a.key === speakerK)) : undefined;
    const push = Math.min(1, t / 2.5);
    let want = new THREE.Vector3(cx, cy - 0.47, cz);
    let dist = wide * (1.12 - 0.12 * push);
    const side = 0.08;
    // DÉCOUPAGE: two-shot / close-up on the speaker / reaction of the listener after the punchline (hard cuts).
    const shot = shotAt(t, rig.lines, rig.names);
    const subject = shot.who ? rig.actors.find((a) => a.key === speakerKey(shot.who!)) : undefined;
    const hp = faceOf(subject);
    const close = (shot.kind === 'close' || shot.kind === 'react') && hp && subject?.last;
    if (close) {
      // Medium close-up (head + chest) in 3/4: the camera stands in the direction the actor faces and looks
      // (shot / reverse shot), pulled towards the front so the other actor never blocks the view.
      want = new THREE.Vector3(hp[0], hp[1] - 0.12, hp[2]);
      dist = (this.vertical ? 1.45 : 1.75) * (1 - Math.min(0.06, energy * 0.15)) - (shot.kind === 'react' ? Math.min(0.2, Math.max(0, t - (rig.lines.at(-1)?.end ?? t)) * 0.1) : 0);
    } else if (sp && rig.actors.length > 1) {
      // Two-shot towards the speaker, a bit closer when the voice is loud — the listener always stays in the frame.
      want = want.lerp(new THREE.Vector3(sp[0], sp[1] - 0.42, sp[2]), 0.18);
      dist = Math.max(wide * 0.95, dist * (0.95 - Math.min(0.05, energy * 0.12)));
    } else if (rig.actors.length === 1) dist *= 0.82;
    // A new speaker in the two-shot is a camera MOVE (it glides towards them), not a cut.
    const key = shot.kind === 'two' ? 'two' : `${shot.kind}:${shot.who ?? ''}`;
    const cut = key !== rig.shot;
    rig.shot = key;
    if (cut && close) {
      const f = subject.last!.world;
      const body = qRot(f.rot[0]!, [0, 0, 1]);
      const face = qRot(f.rot[jointIndex('head')]!, [0, 0, 1]);
      rig.dir = new THREE.Vector3(body[0] * 0.5 + face[0] * 0.25, 0, body[2] * 0.5 + face[2] * 0.25 + 0.3).normalize();
    }
    rig.aim = rig.aim && !cut ? rig.aim.lerp(want, 0.06) : want.clone();
    rig.dist = rig.dist && !cut ? rig.dist + (dist - rig.dist) * 0.06 : dist;
    // Hand-held operator: a breath of movement (never still, never shaky).
    const hx = Math.sin(t * 1.31) * 0.006 + Math.sin(t * 2.97 + 1.2) * 0.003;
    const hy = Math.sin(t * 1.73 + 0.4) * 0.005 + Math.sin(t * 3.41) * 0.002;
    // The punchline: a slow push-in on the face while it lands; the shock of the listener: a short jolt.
    const lastLine = rig.lines.at(-1);
    const punch = close && shot.kind === 'close' && lastLine && t >= lastLine.start ? Math.min(1, (t - lastLine.start) / Math.max(0.5, lastLine.end - lastLine.start)) * 0.1 : 0;
    const jolt = shot.kind === 'react' && lastLine ? Math.exp(-Math.max(0, t - lastLine.end - 0.25) * 9) * Math.sin(t * 60) * 0.012 : 0;
    const dd = rig.dist * (1 - punch);
    if (close && rig.dir) {
      const drift = Math.sin(t * 0.4) * 0.03;
      rig.camera.position.set(rig.aim.x + rig.dir.x * dd + drift + hx + jolt, rig.aim.y + 0.1 + hy, rig.aim.z + rig.dir.z * dd);
    } else {
      // The two-shot breathes: a slow dolly in and out and a sideways glide (parallax on the set behind).
      const drift = Math.sin(t * 0.31) * 0.2;
      const dolly = 1 + Math.sin(t * 0.47 + 0.6) * 0.06;
      rig.camera.position.set(rig.aim.x + drift + dd * side + hx, rig.aim.y + 0.12 + hy, rig.aim.z + dd * dolly);
    }
    rig.camera.lookAt(rig.aim.x + hx * 0.5, rig.aim.y + hy * 0.5, rig.aim.z);
  }
  /** Forgets scene k (its actors' bodies stay cached for the other scenes). */
  drop(k: number) {
    this.rigs.delete(k);
  }
  dispose() {
    for (const p of this.puppets.values()) void p.then((x) => x?.dispose());
    for (const p of this.sheets.values()) void p.then((x) => x?.dispose());
    this.sheets.clear();
    this.puppets.clear();
    this.rigs.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}

/** Live casting preview of one actor (it waves and says a line, in a loop). */
export interface ActorPreview {
  canvas: HTMLCanvasElement;
  ready: Promise<void>;
  tick: (t: number) => void;
  /** VISUAL CONTROL: force a face state and freeze the instant (null = back to the live loop). */
  face: (s: Partial<FaceState> | null) => void;
  dispose: () => void;
}
export function actorPreview(look: ActorLook3D, W = 220, H = 300, vrmOf?: VrmSource): ActorPreview {
  const th = new Theater3D(W, H);
  const line: CueLine = { speaker: look.name, start: 0.6, end: 3.2, text: 'Akwaba ! C’est moi la vedette.', gesture: 'wave', emotion: 'joie' };
  const cast = { [look.key]: look };
  let loop = 0;
  const mount = () => th.addScene(loop, { names: [look.name], lines: [line], seconds: 4, action: '', location: '', cast }, vrmOf);
  let ready = mount().then(() => undefined);
  const keys = ['AI', 'E', 'MBP', 'O', 'AI', 'L', 'U', 'E'];
  let override: Partial<FaceState> | null = null;
  return {
    canvas: th.renderer.domElement,
    ready,
    face: (s) => {
      override = s;
    },
    tick: (t0: number) => {
      // Frozen on one instant of the line while a face state is forced: only the face changes between two frames.
      const t = override ? 1.0 : t0;
      const lt = t % 4;
      const n = Math.floor(t / 4);
      if (n !== loop) {
        // The step planner keeps state: each loop starts on a fresh scene.
        const old = loop;
        loop = n;
        ready = mount().then(() => undefined);
        void ready.then(() => th.drop(old));
        return;
      }
      if (!th.has(loop)) return;
      const talking = lt >= line.start && lt < line.end;
      th.render(loop, lt, { speaker: talking ? look.name : null, energy: talking ? 0.35 : 0, beat: talking && Math.floor(lt * 3) % 2 ? 0.6 : 0, mouth: mouthShape(talking ? keys[Math.floor(lt * 9) % keys.length]! : 'rest', 0.4), gesture: 'wave', emotion: 'joie', lineAge: lt - line.start , face: override ?? undefined });
    },
    dispose: () => th.dispose(),
  };
}

/**
 * TEST D'ANIMATION — two actors of the library play a short dispute in a set of the library, live and in a loop: the
 * accusation, the denial, the punchline, then the chute (shock / laugh). What the owner sees is what the film plays.
 */
export function duoPreview(
  a: ActorLook3D,
  b: ActorLook3D,
  W: number,
  H: number,
  blobOf: VrmSource,
  set?: { blob: Blob; fit?: DecorFit; location: string } | null,
): { canvas: HTMLCanvasElement; ready: Promise<void>; tick: (t: number) => void; dispose: () => void } {
  const th = new Theater3D(W, H);
  const lines: CueLine[] = [
    { speaker: a.name, start: 0.5, end: 2.6, text: 'Où est passé l’argent du marché ?', gesture: 'point', emotion: 'colère' },
    { speaker: b.name, start: 2.9, end: 4.6, text: 'Quel argent ? Moi je dormais !', gesture: 'shrug', emotion: 'surprise' },
    { speaker: a.name, start: 4.9, end: 6.4, text: 'Avec tes chaussures neuves ?', emotion: 'colère' },
    { speaker: b.name, start: 6.7, end: 8.2, text: 'Ce sont les chaussures du rêve !', gesture: 'laugh', emotion: 'joie' },
  ];
  const LOOP = 10.5;
  const cast = { [a.key]: a, [b.key]: b };
  let loop = 0;
  const mount = () =>
    th.addScene(loop, { names: [a.name, b.name], lines, seconds: LOOP, action: '', location: set?.location ?? 'salon', cast, backdrop: set?.blob ?? null, ...(set?.fit ? { backdropFit: set.fit } : {}) }, blobOf);
  let ready = mount().then(() => undefined);
  const keys = ['AI', 'E', 'MBP', 'O', 'AI', 'L', 'U', 'E', 'etc', 'FV'];
  return {
    canvas: th.renderer.domElement,
    ready,
    tick: (t: number) => {
      const lt = t % LOOP;
      const n = Math.floor(t / LOOP);
      if (n !== loop) {
        const old = loop;
        loop = n;
        ready = mount().then(() => undefined);
        void ready.then(() => th.drop(old));
        return;
      }
      if (!th.has(loop)) return;
      const l = lines.find((x) => lt >= x.start && lt < x.end);
      const e = l ? 0.3 + 0.25 * Math.abs(Math.sin(lt * 7.3)) : 0;
      th.render(loop, lt, {
        speaker: l?.speaker ?? null,
        energy: e,
        beat: l && Math.floor(lt * 3.2) % 3 === 0 ? 0.7 : 0,
        mouth: mouthShape(l ? keys[Math.floor(lt * 9.5) % keys.length]! : 'rest', e),
        gesture: l?.gesture ?? null,
        emotion: l?.emotion,
        lineAge: l ? lt - l.start : 0,
        text: l?.text,
      });
    },
    dispose: () => th.dispose(),
  };
}
