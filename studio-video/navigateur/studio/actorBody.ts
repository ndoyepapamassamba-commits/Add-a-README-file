// CORPS DES ACTEURS 3D — l'acteur procédural « façon @comedyvideos_100 » : silhouettes des sketchs (femmes en
// courbes, hommes élancés au ventre rond, tatas et tontons ronds, enfants à grosse tête), visage expressif à
// paupières (yeux mi-clos au repos, exorbités dans le choc), mâchoire qui tombe, lèvres des visèmes, coiffures
// (twists + bandeau, tresses, foulard / gélé, dégarni…), tenues imprimées (wax, pois, fleurs, broderie, maillot),
// chemise ouverte sur débardeur, tongs / chaussures / baskets, accessoires (montre, chapelet, lunettes, casquette,
// chapeau de paille) et l'objet tenu en main (bouteille, téléphone, balai…). Rig = squelette du moteur, sans reciblage.
import * as THREE from 'three';
import { SKELETON, jointIndex } from '../../coeur/studio/actor/skeleton';
import type { Frame } from '../../coeur/studio/actor/actor';
import type { ActorLook3D, MouthShape, Pattern, Prop } from '../../coeur/studio/actor/cast3d';

/** Face state of one frame (engine emotion + live lip-sync + the acting layer). */
export interface FaceState {
  blink: number;
  smile: number;
  frown: number;
  browUp: number;
  browAngry: number;
  mouth: MouthShape;
  laugh: number;
  shock: number;
}
/** What every actor body (procedural or VRM) offers to the theatre. */
export interface Puppet3D {
  readonly root: THREE.Object3D;
  bone(name: string): THREE.Object3D | null;
  apply(f: Frame): void;
  face(s: FaceState): void;
  /** The object held in the right hand (null = empty hand). */
  setProp(p: Prop | null): void;
  update(dt: number): void;
  dispose(): void;
}

let ramp: THREE.DataTexture | null = null;
/** 3-tone cel-shading ramp (shadow, mid, light), shared by every toon material. */
export function toonRamp(): THREE.DataTexture {
  if (ramp) return ramp;
  ramp = new THREE.DataTexture(new Uint8Array([105, 105, 105, 255, 185, 185, 185, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  ramp.minFilter = THREE.NearestFilter;
  ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}
export const toon = (color: string, map?: THREE.Texture) => new THREE.MeshToonMaterial({ color: map ? '#ffffff' : color, gradientMap: toonRamp(), ...(map ? { map } : {}) });
const INK = new THREE.MeshBasicMaterial({ color: '#1b100b', side: THREE.BackSide });
/** Cartoon contour (inverted hull): the same shape, slightly bigger, dark, back faces only. */
export function inked<T extends THREE.Mesh>(m: T, k = 0.06): T {
  const o = new THREE.Mesh(m.geometry, INK);
  o.scale.setScalar(1 + k);
  m.add(o);
  return m;
}
export const darker = (hex: string, k = 0.75) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1]) => {
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
/** Fabric prints of the sketches: wax lozenges, polka dots, flowers, gold embroidery, football jersey. */
export function fabricTexture(p: Pattern, base: string, accent: string): THREE.CanvasTexture | undefined {
  if (p === 'uni') return undefined;
  return canvasTex(
    64,
    64,
    (g) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = accent;
      g.strokeStyle = accent;
      if (p === 'wax') {
        for (let y = 0; y < 64; y += 16)
          for (let x = (y / 16) % 2 ? 8 : 0; x < 64; x += 16) {
            g.beginPath();
            g.moveTo(x + 8, y + 2);
            g.lineTo(x + 14, y + 8);
            g.lineTo(x + 8, y + 14);
            g.lineTo(x + 2, y + 8);
            g.closePath();
            g.fill();
          }
        g.fillStyle = '#ffffff55';
        g.fillRect(0, 30, 64, 4);
      } else if (p === 'pois') {
        g.fillStyle = accent === base ? '#ffffff' : accent;
        for (let y = 4; y < 64; y += 16)
          for (let x = (y / 16) % 2 ? 12 : 4; x < 64; x += 16) {
            g.beginPath();
            g.arc(x, y, 4.5, 0, Math.PI * 2);
            g.fill();
          }
      } else if (p === 'fleurs') {
        for (const [x, y] of [[14, 14], [46, 30], [22, 50], [54, 58]] as const) {
          for (let k = 0; k < 5; k++) {
            g.beginPath();
            g.arc(x + Math.cos((k * 2 * Math.PI) / 5) * 6, y + Math.sin((k * 2 * Math.PI) / 5) * 6, 4, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = '#f2c12e';
          g.beginPath();
          g.arc(x, y, 3, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = accent;
        }
      } else if (p === 'brodé') {
        g.lineWidth = 3;
        for (let y = 6; y < 64; y += 20) {
          g.beginPath();
          for (let x = 0; x <= 64; x += 8) g.lineTo(x, y + (x % 16 ? 5 : 0));
          g.stroke();
        }
      } else if (p === 'maillot') {
        g.fillRect(0, 0, 64, 8);
        g.fillRect(0, 56, 64, 8);
        g.fillStyle = '#ffffffaa';
        g.font = 'bold 26px sans-serif';
        g.fillText('10', 18, 42);
      }
    },
    p === 'maillot' ? [1, 1] : [3, 3],
  );
}
const CHILD: Record<string, string> = { neck: 'head', hip: 'knee', knee: 'ankle', shoulder: 'elbow', elbow: 'wrist', index1: 'index2', index2: 'index3', thumb1: 'thumb2' };
const childOf = (n: string) => {
  const [s, part] = n.includes('_') ? (n.split('_') as [string, string]) : ['', n];
  const c = CHILD[part];
  return c ? (s ? `${s}_${c}` : c) : null;
};

/** The objects of the gags, held in the right hand (axis along the forearm, towards the elbow). */
export function buildProp(p: Prop): THREE.Group {
  const g = new THREE.Group();
  const mat = (c: string) => toon(c);
  const add = (geo: THREE.BufferGeometry, c: string, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], ink = true) => {
    const m = new THREE.Mesh(geo, mat(c));
    m.position.set(...pos);
    m.rotation.set(...rot);
    g.add(ink ? inked(m, 0.05) : m);
    return m;
  };
  if (p === 'bouteille') {
    add(new THREE.CylinderGeometry(0.032, 0.034, 0.17, 14), '#2f8a3a', [0, 0.02, 0]);
    add(new THREE.CylinderGeometry(0.012, 0.03, 0.06, 12), '#2f8a3a', [0, 0.135, 0]);
    add(new THREE.CylinderGeometry(0.013, 0.013, 0.02, 10), '#d4a017', [0, 0.175, 0], [0, 0, 0], false);
  } else if (p === 'téléphone') add(new THREE.BoxGeometry(0.075, 0.15, 0.014), '#1c1c1f', [0, 0.03, 0.02]);
  else if (p === 'balai') {
    add(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 8), '#a0703f', [0, 0.1, 0]);
    add(new THREE.ConeGeometry(0.09, 0.28, 12), '#d9b45a', [0, -0.55, 0], [Math.PI, 0, 0]);
  } else if (p === 'sac') {
    add(new THREE.BoxGeometry(0.26, 0.2, 0.09), '#8b3a2a', [0, -0.16, 0]);
    add(new THREE.TorusGeometry(0.06, 0.008, 6, 16, Math.PI), '#5a2a1a', [0, -0.05, 0]);
  } else if (p === 'assiette') {
    add(new THREE.CylinderGeometry(0.12, 0.1, 0.02, 20), '#f7f4ec', [0, 0.02, 0.06], [Math.PI / 2, 0, 0]);
    add(new THREE.SphereGeometry(0.06, 12, 8), '#e8742a', [0, 0.02, 0.075], [0, 0, 0], false);
  } else if (p === 'journal') add(new THREE.BoxGeometry(0.22, 0.3, 0.01), '#ece6d6', [0, 0.08, 0.03]);
  else if (p === 'verre') add(new THREE.CylinderGeometry(0.035, 0.03, 0.1, 14), '#c9e6f2', [0, 0.03, 0]);
  else if (p === 'chapelet') add(new THREE.TorusGeometry(0.06, 0.009, 6, 20), '#7a3b1a', [0, -0.07, 0]);
  else if (p === 'valise') add(new THREE.BoxGeometry(0.42, 0.3, 0.13), '#f2c12e', [0, -0.2, 0]);
  else if (p === 'bâton') add(new THREE.CylinderGeometry(0.014, 0.014, 0.95, 8), '#6b4226', [0, -0.05, 0]);
  return g;
}

/** A procedural Afrikatoon actor built from its look: rigged on the engine skeleton (no retargeting). */
export class AfroActor implements Puppet3D {
  readonly root = new THREE.Group();
  private bones: THREE.Bone[] = [];
  private eyes: THREE.Object3D[] = [];
  private lids: THREE.Mesh[] = [];
  private brows: THREE.Mesh[] = [];
  private mouth!: THREE.Group;
  private mouthIn!: THREE.Mesh;
  private lipUp!: THREE.Mesh;
  private lipDown!: THREE.Mesh;
  private teeth!: THREE.Mesh;
  private tongue!: THREE.Mesh;
  private jaw!: THREE.Object3D;
  private propHolder = new THREE.Group();
  private prop: Prop | null = null;
  private mats: THREE.Material[] = [];
  private s: number;
  constructor(readonly look: ActorLook3D) {
    this.s = look.height;
    const L = look;
    const m = (c: string, map?: THREE.Texture) => {
      const x = toon(c, map);
      this.mats.push(x);
      return x;
    };
    const skin = m(L.skin);
    const pattern = L.pattern ?? 'uni';
    const topMap = fabricTexture(pattern, L.top, L.accent);
    const top = m(L.top, topMap);
    const bottom = m(L.bottom, L.dress && topMap ? topMap : undefined);
    const inner = L.inner ? m(L.inner) : null;
    const shoes = m(L.shoes);
    const b = L.build;
    SKELETON.forEach((j) => {
      const bone = new THREE.Bone();
      bone.name = j.name;
      bone.position.set(...j.offset);
      this.bones.push(bone);
      if (j.parent) this.bones[jointIndex(j.parent)]!.add(bone);
      else this.root.add(bone);
    });
    // Every body scales from the pelvis (feet stay on the ground).
    this.bones[0]!.scale.setScalar(this.s);
    const at = (name: string) => this.bones[jointIndex(name)]!;
    const blob = (parent: THREE.Object3D, r: [number, number, number], mat: THREE.Material, p: [number, number, number], ink = 0.035) => {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), mat);
      sp.scale.set(...r);
      sp.position.set(...p);
      parent.add(ink ? inked(sp, ink / Math.max(0.04, Math.min(...r)) * 0.012) : sp);
      return sp;
    };
    const limb = (name: string, r: number, mat: THREE.Material, r2 = r) => {
      const c = childOf(name);
      if (!c) return;
      const off = new THREE.Vector3(...SKELETON[jointIndex(c)]!.offset);
      const len = off.length();
      // Tapered limb (thigh → knee, upper arm → elbow): a cylinder with round ends.
      const geo = new THREE.CylinderGeometry(r2, r, Math.max(0.001, len), 14, 1);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(off.clone().multiplyScalar(0.5));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), off.clone().normalize());
      at(name).add(inked(mesh, 0.16 / (r * 100)));
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
      at(name).add(cap);
    };
    // Limb thickness per silhouette: the lanky men of the sketches have stick limbs.
    const th = L.shape === 'élancé' ? 0.72 : L.shape === 'rond' ? 1.25 : L.shape === 'courbes' ? 1.0 : 0.92;
    const fem = L.gender === 'f';
    const kid = L.age === 'enfant';
    const shorts = !L.dress && /short|bermuda/i.test(L.role ?? '') ? true : kid && !L.dress;
    for (const k of ['l', 'r'] as const) {
      const side = k === 'l' ? 1 : -1;
      const upper = L.sleeves === 'sans' ? skin : top;
      const fore = L.sleeves === 'longues' ? top : skin;
      const boubou = L.dress && !fem;
      limb(`${k}_shoulder`, 0.046 * th * (boubou ? 1.6 : 1), upper, 0.04 * th * (boubou ? 1.7 : 1));
      limb(`${k}_elbow`, 0.038 * th * (boubou ? 1.7 : 1), fore, 0.034 * th * (boubou ? 1.8 : 1));
      // Hands: readable cartoon hands (palm + index + thumb).
      blob(at(`${k}_wrist`), [0.05, 0.045, 0.034], skin, [side * 0.05, 0, 0], 0.025);
      limb(`${k}_index1`, 0.014, skin);
      limb(`${k}_index2`, 0.013, skin);
      limb(`${k}_thumb1`, 0.015, skin);
      blob(at(`${k}_shoulder`), [0.05 * th, 0.05 * th, 0.05 * th], upper, [side * -0.005, 0, 0], 0.02);
      const thigh = fem && L.shape === 'courbes' ? 0.085 : 0.068 * th * (L.shape === 'rond' ? 1.15 : 1);
      const legMat = L.dress || shorts ? skin : bottom;
      limb(`${k}_hip`, thigh, L.dress ? skin : bottom, thigh * 0.75);
      limb(`${k}_knee`, 0.05 * th, legMat, 0.04 * th);
      // Feet: big cartoon shoes / sneakers, or bare feet in flip-flops.
      const ankle = at(`${k}_ankle`);
      if (L.feet === 'tongs') {
        blob(ankle, [0.042, 0.028, 0.1], skin, [0, -0.045, 0.055], 0.02);
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.014, 0.23), shoes);
        sole.position.set(0, -0.075, 0.055);
        ankle.add(inked(sole, 0.04));
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.015), shoes);
        strap.position.set(0, -0.045, 0.1);
        ankle.add(strap);
      } else {
        const big = L.feet === 'chaussures' ? [0.066, 0.05, 0.15] : [0.06, 0.055, 0.13];
        blob(ankle, big as [number, number, number], shoes, [0, -0.04, 0.065], 0.02);
        if (L.feet === 'baskets') {
          const sole = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.02, 0.27), m('#d9d4c7'));
          sole.position.set(0, -0.08, 0.065);
          ankle.add(sole);
        }
      }
    }
    // Neck: long and thin for women, thick for round uncles.
    limb('neck', (fem ? 0.042 : 0.05) * (L.shape === 'rond' ? 1.25 : 1), skin);
    // TORSO by silhouette.
    const chestMat = L.inner ? inner! : top;
    if (L.shape === 'élancé') {
      blob(at('spine3'), [0.155 * b, 0.15, 0.105 * b], chestMat, [0, 0, 0]);
      blob(at('spine1'), [0.13 * b, 0.19, 0.1 * b], chestMat, [0, 0.05, 0]);
      blob(at('pelvis'), [0.135 * b, 0.11, 0.105 * b], L.dress ? top : bottom, [0, 0.02, 0]);
    } else if (L.shape === 'rond') {
      blob(at('spine3'), [0.24 * b, 0.18, 0.17 * b], chestMat, [0, 0, 0]);
      blob(at('spine1'), [0.25 * b, 0.22, 0.2 * b], chestMat, [0, 0.03, 0.01]);
      blob(at('pelvis'), [0.22 * b, 0.14, 0.17 * b], L.dress ? top : bottom, [0, 0.02, 0]);
    } else if (L.shape === 'courbes') {
      blob(at('spine3'), [0.155 * b, 0.13, 0.115 * b], top, [0, -0.01, 0]);
      for (const x of [0.06, -0.06]) blob(at('spine3'), [0.078, 0.075, 0.075], top, [x, -0.04, 0.085], 0.02);
      blob(at('spine1'), [0.125 * b, 0.18, 0.105 * b], top, [0, 0.06, 0]);
      // Big hips and bottom: the signature of the women of the sketches.
      blob(at('pelvis'), [0.26 * b, 0.17, 0.185 * b], L.dress ? top : bottom, [0, -0.03, -0.01]);
      blob(at('pelvis'), [0.2 * b, 0.15, 0.13], L.dress ? top : bottom, [0, -0.05, -0.09]);
    } else {
      blob(at('spine3'), [(fem ? 0.16 : 0.19) * b, 0.15, 0.13 * b], chestMat, [0, 0, 0]);
      blob(at('spine1'), [(fem ? 0.15 : 0.165) * b, 0.2, 0.125 * b], chestMat, [0, 0.05, 0]);
      blob(at('pelvis'), [(fem ? 0.19 : 0.165) * b, 0.12, 0.13 * b], L.dress ? top : bottom, [0, 0.02, 0]);
    }
    // Round pot belly (the lanky men often have one; aunties / uncles always).
    if (L.belly) {
      const r = L.shape === 'rond' ? 0.24 : L.shape === 'élancé' ? 0.16 : 0.18;
      blob(at('spine1'), [r * b * 1.05, r * 1.02, r * b], chestMat, [0, -0.02, L.shape === 'élancé' ? 0.09 : 0.07]);
    }
    // Open shirt over the vest: two panels of the shirt on the sides of the chest.
    if (L.inner) for (const x of [0.105, -0.105]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.36, 0.05), top);
      panel.position.set(x * b, 0.05, (L.belly ? 0.16 : 0.1) * b);
      panel.rotation.y = x > 0 ? 0.35 : -0.35;
      at('spine2').add(inked(panel, 0.03));
    }
    if (L.dress) {
      // Fitted long dress (women) or wide boubou (men, round aunties): a lathe from the waist to the calves.
      const wide = !fem || L.shape === 'rond';
      const hip = (L.shape === 'courbes' ? 0.27 : wide ? 0.27 : 0.2) * b;
      // Profile from the hem UP to the waist: the lathe's faces then point outwards (the contour stays behind).
      const pts = [new THREE.Vector2((wide ? 0.34 : 0.205) * b, -0.66), new THREE.Vector2((wide ? 0.33 : 0.2) * b, -0.62), new THREE.Vector2(hip * 0.92, -0.25), new THREE.Vector2(hip, -0.03), new THREE.Vector2(0.13 * b, 0.18)];
      const skirt = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), top);
      at('pelvis').add(inked(skirt, 0.02));
      if (!fem) {
        // The boubou covers the chest too, with an embroidered neckline.
        blob(at('spine3'), [0.23 * b, 0.17, 0.16 * b], top, [0, -0.01, 0]);
        const neckline = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 24), m(L.accent));
        neckline.rotation.x = Math.PI / 2 - 0.3;
        neckline.position.set(0, 0.11, 0.03);
        at('spine3').add(neckline);
      }
    }
    // A tie on a suit.
    if (!L.dress && L.sleeves === 'longues' && L.top === L.bottom) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 0.02), m(L.accent));
      tie.position.set(0, 0.0, 0.14 * b);
      at('spine3').add(tie);
    }
    if (L.watch) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14), m('#d4a017'));
      w.rotation.z = Math.PI / 2;
      w.position.set(0.0, 0, 0);
      at('l_wrist').add(w);
    }
    if (L.beads) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), m('#7a3b1a'));
        bead.position.set(Math.cos(a) * 0.075, 0.1 - Math.max(0, Math.sin(a)) * 0.07, Math.sin(a) * 0.06 + 0.04);
        at('spine3').add(bead);
      }
    }
    at('r_wrist').add(this.propHolder);
    // Held along the forearm, in front of the palm (right hand: the forearm points to −X).
    this.propHolder.position.set(-0.07, -0.005, 0.045);
    this.propHolder.rotation.z = -Math.PI / 2;
    this.buildHead(at('head'), skin, m);
  }
  private buildHead(head: THREE.Bone, skin: THREE.Material, m: (c: string, map?: THREE.Texture) => THREE.Material) {
    const L = this.look;
    const F = L.face ?? { lid: 0.18, smile: 0.1, angry: 0, raise: 0, chin: 1, eyes: 1 };
    const fem = L.gender === 'f';
    const hair = m(L.hair);
    const g = new THREE.Group();
    // Big expressive heads (bigger still for a child), raised so the chin clears the collar.
    const hs = L.age === 'enfant' ? 1.42 : L.age === 'ado' ? 1.22 : 1.12;
    g.scale.setScalar(hs);
    g.position.set(0, 0.06 + 0.12 * hs, 0.01);
    head.add(g);
    const sph = (r: [number, number, number], mat: THREE.Material, p: [number, number, number], ink = 0, seg = 26, parent: THREE.Object3D = g) => {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75)), mat);
      sp.scale.set(...r);
      sp.position.set(...p);
      parent.add(ink ? inked(sp, ink) : sp);
      return sp;
    };
    // Cranium + lower face (a long jaw and a marked chin for the men of the sketches).
    sph([0.165, 0.185, 0.17], skin, [0, 0.04, -0.005], 0.045, 32);
    const chin = F.chin;
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.04, 0.02);
    g.add(this.jaw);
    sph(fem ? [0.145, 0.125, 0.145] : [0.15, 0.13 * chin, 0.15], skin, [0, -0.04 - (chin - 1) * 0.05, 0.005], 0.04, 26, this.jaw);
    if (!fem && L.age !== 'enfant') sph([0.065, 0.055 * chin, 0.06], skin, [0, -0.13 * chin, 0.065], 0.08, 18, this.jaw);
    for (const k of [1, -1]) sph([0.052, 0.042, 0.042], skin, [0.085 * k, -0.055, 0.105]);
    // Ears (bigger on the men), nose wide with nostrils.
    for (const k of [1, -1]) sph([0.028, 0.05, 0.02].map((x) => x * (fem ? 1 : 1.25)) as [number, number, number], skin, [0.166 * k, -0.01, 0], 0.15);
    sph([0.046, 0.033, 0.04], m(darker(L.skin, 0.88)), [0, -0.04, 0.162], 0.12);
    for (const k of [1, -1]) sph([0.009, 0.006, 0.006], new THREE.MeshBasicMaterial({ color: '#1a0c06' }), [0.019 * k, -0.056, 0.178]);
    // EYES: white, iris, pupil, light spot, and a skin EYELID that closes from the top (sleepy at rest, gone in shock).
    const white = m('#fbfbf8');
    const iris = new THREE.MeshBasicMaterial({ color: '#3b2314' });
    const pupil = new THREE.MeshBasicMaterial({ color: '#0b0705' });
    const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const ek = F.eyes;
    for (const k of [1, -1]) {
      const eye = new THREE.Group();
      eye.position.set(0.062 * k, 0.022, 0.138);
      eye.userData = { base: ek };
      g.add(eye);
      const w = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), white);
      w.scale.set(0.042 * ek, 0.047 * ek, 0.026);
      eye.add(inked(w, 0.12));
      const ir = new THREE.Mesh(new THREE.CircleGeometry(0.022 * ek, 20), iris);
      ir.position.set(-0.004 * k, -0.003, 0.027);
      eye.add(ir);
      const pu = new THREE.Mesh(new THREE.CircleGeometry(0.011 * ek, 16), pupil);
      pu.position.set(-0.004 * k, -0.003, 0.028);
      eye.add(pu);
      const sh = new THREE.Mesh(new THREE.CircleGeometry(0.006, 10), shine);
      sh.position.set(0.005, 0.008, 0.029);
      eye.add(sh);
      // Upper eyelid: the top half of a slightly bigger sphere, rotated down over the eye to close it.
      const lid = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), skin);
      lid.scale.set(0.046 * ek, 0.051 * ek, 0.031);
      eye.add(lid);
      this.lids.push(lid);
      if (fem)
        for (const dx of [-0.022, 0, 0.022]) {
          const lash = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.022, 0.005), pupil);
          lash.position.set(dx * k + 0.016 * k, 0.05 * ek, 0.012);
          lash.rotation.z = -0.5 * k + dx * 8 * k;
          eye.add(lash);
        }
      this.eyes.push(eye);
      const br = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.06, 4, 8), m(L.age === 'senior' ? '#9a958e' : '#120c08'));
      br.rotation.z = Math.PI / 2;
      br.position.set(0.064 * k, 0.092, 0.152);
      br.userData = { k, y: 0.092 };
      g.add(br);
      this.brows.push(br);
    }
    // MOUTH: dark inside, teeth, tongue, two full lips — on the jaw (it drops in shock).
    this.mouth = new THREE.Group();
    this.mouth.position.set(0, -0.06, 0.14);
    this.jaw.add(this.mouth);
    this.mouthIn = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), new THREE.MeshBasicMaterial({ color: '#3a0b0e' }));
    this.mouthIn.scale.set(0.06, 0.01, 0.02);
    this.mouth.add(this.mouthIn);
    this.teeth = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.016, 0.012), new THREE.MeshBasicMaterial({ color: '#f7f4ec' }));
    this.teeth.position.set(0, 0.006, 0.012);
    this.mouth.add(this.teeth);
    this.tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: '#c0505a' }));
    this.tongue.scale.set(0.035, 0.012, 0.015);
    this.tongue.position.set(0, -0.012, 0.004);
    this.mouth.add(this.tongue);
    const lip = m(fem ? '#7a2a3a' : darker(L.skin, 0.72));
    this.lipUp = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.075, 4, 10), lip);
    this.lipUp.rotation.z = Math.PI / 2;
    this.lipDown = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.07, 4, 10), lip);
    this.lipDown.rotation.z = Math.PI / 2;
    this.mouth.add(this.lipUp, this.lipDown);
    // HAIR.
    const st = L.hairStyle;
    const capR: [number, number, number] = [0.172, 0.168, 0.178];
    if (st === 'court' || st === 'tresses' || st === 'chignon' || st === 'twists') sph(capR, hair, [0, 0.07, -0.015], 0.03);
    if (st === 'dégarni') {
      // Hair only on the sides and the back (the bald top of the tonton of the reference clip).
      const band = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 12, Math.PI / 2 + 1.0, Math.PI * 2 - 2.0, Math.PI * 0.3, Math.PI * 0.27), hair);
      band.scale.set(0.172, 0.19, 0.178);
      band.position.set(0, 0.04, -0.005);
      g.add(band);
    }
    if (st === 'afro') {
      const afro = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), hair);
      afro.scale.set(0.25, 0.22, 0.23);
      afro.position.set(0, 0.11, -0.045);
      g.add(inked(afro, 0.03));
    }
    if (st === 'twists') {
      // Puffy twists on the top and the back of the head.
      for (let i = 0; i < 34; i++) {
        const a = i * 2.39996;
        const yv = 0.25 + 0.75 * ((i * 0.618) % 1);
        const r = Math.sqrt(1 - yv * yv);
        const dir = new THREE.Vector3(Math.cos(a) * r, yv, Math.sin(a) * r * (Math.sin(a) > 0 ? 0.55 : 1));
        const tw = new THREE.Mesh(new THREE.SphereGeometry(0.036 + (i % 3) * 0.006, 10, 8), hair);
        tw.position.copy(dir.multiplyScalar(0.19)).add(new THREE.Vector3(0, 0.07, -0.03));
        g.add(tw);
      }
    }
    if (st === 'chignon') sph([0.08, 0.08, 0.08], hair, [0, 0.2, -0.11], 0.06);
    if (st === 'tresses') {
      const beads = m(L.accent);
      for (const side of [1, -1])
        for (let j = 0; j < 5; j++) {
          const a = (j / 4) * (Math.PI / 2);
          const x = side * Math.cos(a) * 0.17;
          const z = -Math.sin(a) * 0.16;
          const brd = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.26, 4, 8), hair);
          brd.position.set(x, -0.07, z);
          g.add(brd);
          const bd = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), beads);
          bd.position.set(x, -0.21, z);
          g.add(bd);
        }
    }
    if (st === 'foulard') {
      const wrapC = L.wrap ?? L.accent;
      const wrap = m(wrapC, fabricTexture('wax', wrapC, L.top === wrapC ? L.accent : L.top));
      sph([0.2, 0.19, 0.205], wrap, [0, 0.1, -0.025], 0.03);
      // Gélé: the tall knot of the head-wrap.
      const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.07, 0.03, 40, 8, 2, 3), wrap);
      knot.position.set(0.02, 0.29, -0.03);
      knot.scale.set(1, 0.8, 0.8);
      g.add(inked(knot, 0.04));
    }
    if (L.headband) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 10, 36), m(L.headband));
      band.rotation.x = Math.PI / 2 - 0.35;
      band.position.set(0, 0.11, 0.0);
      g.add(band);
    }
    if (L.cap) {
      const cm = m(L.cap.color);
      if (L.cap.kind === 'chapeau') {
        // Straw hat: crown + wide brim.
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.12, 24), cm);
        crown.position.set(0, 0.2, -0.01);
        g.add(inked(crown, 0.03));
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.012, 32), cm);
        brim.position.set(0, 0.15, -0.01);
        g.add(inked(brim, 0.02));
      } else {
        sph([0.18, 0.11, 0.185], cm, [0, 0.14, -0.01], 0.03);
        const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), cm);
        visor.position.set(0, L.cap.kind === 'béret' ? 0.11 : 0.12, 0.13);
        visor.rotation.x = 0.1;
        g.add(visor);
      }
    }
    if (L.glasses) {
      const frame = new THREE.MeshBasicMaterial({ color: '#141414' });
      for (const k of [1, -1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.007, 8, 24), frame);
        ring.position.set(0.062 * k, 0.022, 0.172);
        g.add(ring);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.007, 0.007), frame);
      bridge.position.set(0, 0.03, 0.175);
      g.add(bridge);
    }
    if (L.beard) sph([0.14, 0.09, 0.1], hair, [0, -0.1, 0.06], 0.05, 20, this.jaw);
    if (L.moustache || L.beard) {
      const mo = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.08, 4, 8), hair);
      mo.rotation.z = Math.PI / 2;
      mo.position.set(0, -0.072, 0.17);
      g.add(mo);
    }
  }
  bone(name: string) {
    const i = SKELETON.findIndex((j) => j.name === name);
    return i >= 0 ? this.bones[i]! : null;
  }
  apply(f: Frame) {
    f.pose.rot.forEach((q, i) => this.bones[i]!.quaternion.set(q[0], q[1], q[2], q[3]));
    // The engine works for a 1 m-tall body: a child / a tall adult keeps its feet on the ground.
    this.bones[0]!.position.set(f.pose.root[0], f.pose.root[1] * this.s, f.pose.root[2]);
  }
  setProp(p: Prop | null) {
    if (p === this.prop) return;
    this.prop = p;
    this.propHolder.clear();
    if (p) this.propHolder.add(buildProp(p));
  }
  face(s: FaceState) {
    const F = this.look.face ?? { lid: 0.18, smile: 0.1, angry: 0, raise: 0, chin: 1, eyes: 1 };
    const angry = Math.max(s.browAngry, F.angry);
    // Eyelid closure: the resting lid of the character, squinted by anger / laughter, wide open in surprise / shock.
    const close = Math.max(s.blink, Math.min(1, Math.max(0, F.lid + angry * 0.2 + s.laugh * 0.45 - s.shock * 1.2 - s.browUp * 0.35)));
    for (const l of this.lids) l.rotation.x = -1.25 + 2.85 * close;
    const pop = 1 + 0.6 * s.shock + 0.12 * s.browUp;
    for (const e of this.eyes) e.scale.set(pop, pop, 1);
    for (const b of this.brows) {
      const k = b.userData.k as number;
      const raise = k < 0 ? F.raise : 0;
      b.position.y = b.userData.y + 0.024 * s.browUp + 0.035 * s.shock - 0.014 * angry + 0.024 * raise;
      b.rotation.z = Math.PI / 2 + (0.42 * angry - 0.22 * s.browUp - 0.15 * raise + 0.12 * s.frown) * k;
    }
    const mo = s.mouth;
    // Jaw drop in shock, open laugh, the visemes of the words.
    const open = Math.min(1.25, Math.max(mo.open, s.shock * 1.25, s.laugh * 0.8));
    const smile = Math.max(-1, Math.min(1, s.smile + F.smile - s.frown * 0.8));
    const wide = 1 + 0.35 * mo.wide - 0.45 * mo.round + 0.25 * Math.max(0, smile) + 0.25 * s.laugh - 0.2 * s.shock;
    this.jaw.position.y = -0.04 - 0.035 * Math.max(0, open - 0.5) * 1.4;
    this.mouthIn.scale.set(0.055 * wide, 0.006 + 0.05 * open, 0.02);
    this.mouthIn.position.y = -0.02 * open;
    this.teeth.visible = open > 0.18;
    this.teeth.scale.x = wide * 0.85;
    this.tongue.visible = open > 0.45;
    this.lipUp.scale.set(1, wide, 1);
    this.lipDown.scale.set(1, wide, 1);
    const curve = 0.012 * smile;
    this.lipUp.position.set(0, 0.008 + curve * 0.4, 0);
    this.lipDown.position.set(0, -0.006 - 0.05 * open + curve, 0.002);
  }
  update() {
    /* procedural actor: nothing to simulate */
  }
  dispose() {
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.mats.forEach((x) => x.dispose());
  }
}
