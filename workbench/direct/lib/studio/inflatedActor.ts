/**
 * ACTEUR GONFLÉ — the owner's drawn character as a 3D body, built from the drawing itself, in the browser, in a second:
 * its silhouette is inflated into closed volumes (inflate.ts: Teddy / Monster Mash), the skeleton measured on the
 * drawing becomes its bones with bone-heat skin weights (boneHeat.ts: Blender's automatic weights), a drawn arm in
 * front of the body is its own layer over a body that continues behind it (parts.ts: Monster Mash), and the drawing
 * is projected back on it as its skin (projectedSkin.ts) with its measured face animated (faceWarp.ts). The engine
 * then drives it like any rigged model (GlbActor: T-pose normalisation, retarget, full-body acting). No model, no
 * GPU, nothing paid: the drawing is the only source.
 */
import * as THREE from 'three';
import type { SheetPose } from '../../../server/jev/studio/actor/cast3d';
import { gridMesh } from '../../../server/jev/studio/actor/arap';
import { inflateMesh, inflatedSolid } from '../../../server/jev/studio/actor/inflate';
import { bonesFromBody, heatWeights } from '../../../server/jev/studio/actor/boneHeat';
import { partLayers, splitParts, type PartMesh } from '../../../server/jev/studio/actor/parts';
import { GlbActor } from './glbActor';
import { toonRamp } from './actorBody';
import { FaceRig } from './faceWarp';

/** Rows of the lattice over the figure (the relief's resolution). */
const ROWS = 110;

/**
 * Builds the 3D actor of a drawn pose (its cut-out blob and measured skeleton). Returns null when the drawing has no
 * measured skeleton or no recognisable figure.
 */
export async function inflatedActor(pose: SheetPose, blob: Blob, heightM = 1.72): Promise<GlbActor | null> {
  const body = pose.body;
  if (!body) return null;
  const bones2d = bonesFromBody(body, pose.w, pose.h);
  if (!bones2d) return null;
  const bmp = await createImageBitmap(blob);
  // The figure's alpha, read once at a small size.
  const f = Math.min(1, 320 / pose.h);
  const cw = Math.max(1, Math.round(pose.w * f));
  const ch = Math.max(1, Math.round(pose.h * f));
  const c = Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, cw, ch);
  const px = g.getImageData(0, 0, cw, ch).data;
  const inside = (x: number, y: number) => {
    const xi = Math.min(cw - 1, Math.max(0, Math.floor(x * f)));
    const yi = Math.min(ch - 1, Math.max(0, Math.floor(y * f)));
    return px[(yi * cw + xi) * 4 + 3]! >= 128;
  };
  const step = Math.max(3, Math.round(pose.h / ROWS));
  const mesh2d = gridMesh(inside, pose.w, pose.h, step, 1);
  const n = mesh2d.rest.length / 2;
  if (n < 24) {
    bmp.close();
    return null;
  }
  const weights = heatWeights(mesh2d, bones2d, inside);
  // LAYERS: the body continues behind a drawn arm; each arm is its own volume in front of it.
  const layers = partLayers(mesh2d, bones2d, weights);
  const parts = splitParts(mesh2d, layers);
  const s = heightM / pose.h; // metres per px
  // The body first (its relief gives the arms their forward offset where they cover it).
  const bodyRelief = inflateMesh(parts.body, 0.8);
  const bodyZAt = new Map<string, number>();
  parts.body.orig.forEach((_, k) => bodyZAt.set(`${parts.body.rest[k * 2]},${parts.body.rest[k * 2 + 1]}`, bodyRelief.z[k]!));
  const pieces: { pm: PartMesh; geo: THREE.BufferGeometry; frontCount: number; mirror: Int32Array }[] = [];
  const build = (pm: PartMesh, relief = inflateMesh(pm, 0.8), lift = false) => {
    const solid = inflatedSolid(pm, relief, pose.w, pose.h);
    const total = solid.pos.length / 3;
    const pos = new Float32Array(total * 3);
    const skinIndex = new Uint16Array(total * 4);
    const skinWeight = new Float32Array(total * 4);
    const uv = new Float32Array(total * 2);
    for (let i = 0; i < total; i++) {
      const k = i < solid.frontCount ? i : solid.mirror[i - solid.frontCount]!;
      // An arm over the body sits in front of the body's surface there.
      const z = lift ? (bodyZAt.get(`${pm.rest[k * 2]},${pm.rest[k * 2 + 1]}`) ?? 0) : 0;
      pos[i * 3] = (solid.pos[i * 3]! - pose.w / 2) * s;
      pos[i * 3 + 1] = solid.pos[i * 3 + 1]! * s;
      pos[i * 3 + 2] = (solid.pos[i * 3 + 2]! + z) * s;
      const src = pm.from[k]!;
      for (let j = 0; j < 4; j++) {
        skinIndex[i * 4 + j] = weights.idx[src * 4 + j]!;
        skinWeight[i * 4 + j] = weights.w[src * 4 + j]!;
      }
      uv[i * 2] = solid.uv[i * 2]!;
      uv[i * 2 + 1] = 1 - solid.uv[i * 2 + 1]!;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(solid.nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    geo.setIndex(new THREE.BufferAttribute(solid.idx, 1));
    pieces.push({ pm, geo, frontCount: solid.frontCount, mirror: solid.mirror });
  };
  build(parts.body, bodyRelief);
  for (const arm of parts.arms) if (arm) build(arm, undefined, true);
  // The bones, Mixamo-named, at the drawing's joints (z = 0, the middle of the volume).
  const bones = bones2d.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    return bone;
  });
  const world = bones2d.map((b) => new THREE.Vector3((b.a[0] - pose.w / 2) * s, (pose.h - b.a[1]) * s, 0));
  bones2d.forEach((b, i) => {
    const w = world[i]!;
    if (b.parent >= 0) {
      bones[b.parent]!.add(bones[i]!);
      bones[i]!.position.copy(w).sub(world[b.parent]!);
    } else bones[i]!.position.copy(w);
  });
  const root = new THREE.Group();
  root.name = 'inflated-actor';
  root.add(bones[0]!);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  // A paper-pale body under the drawing (the mean colour of the drawing, where no pixel of it lands).
  const avg = meanColour(px);
  const meshes = pieces.map((p, i) => {
    const m = new THREE.SkinnedMesh(p.geo, new THREE.MeshToonMaterial({ color: avg, gradientMap: toonRamp() }));
    m.name = i === 0 ? 'inflated-body' : `inflated-arm-${i}`;
    m.frustumCulled = false;
    root.add(m);
    m.updateMatrixWorld(true);
    m.bind(skeleton, m.matrixWorld);
    return m;
  });
  const actor = GlbActor.fromScene(root, heightM);
  // The drawing as the skin, in the drawing's own pose (the rest pose of this body), its measured face animated on it.
  actor.faceRig = new FaceRig(pose);
  actor.skin(bmp);
  bmp.close();
  pieces.forEach((p, i) => {
    const geo = meshes[i]!.geometry;
    // A cut-out has a drawing on both faces (the back is its mirror) and over its thickness: every vertex shows it,
    // whatever its angle to the lens (a stretched drawing reads as the puppet's skin, a paper-coloured patch does not).
    const vis = geo.getAttribute('projVis') as THREE.BufferAttribute | undefined;
    if (vis) {
      (vis.array as Float32Array).fill(1);
      vis.needsUpdate = true;
    }
    // Hidden body (under an arm): its skin is the visible body's of the same row (mirrored), never the arm's pixels.
    const puv = geo.getAttribute('projUv') as THREE.BufferAttribute | undefined;
    if (puv && i === 0) {
      const at = new Map<number, number>();
      p.pm.orig.forEach((o, k) => at.set(o, k));
      const arr = puv.array as Float32Array;
      const total = arr.length / 2;
      for (let v = 0; v < total; v++) {
        const k = v < p.frontCount ? v : p.mirror[v - p.frontCount]!;
        if (!p.pm.hidden[k]) continue;
        const src = at.get(p.pm.from[k]!);
        if (src === undefined) continue;
        arr[v * 2] = arr[src * 2]!;
        arr[v * 2 + 1] = arr[src * 2 + 1]!;
      }
      puv.needsUpdate = true;
    }
    const mats = Array.isArray(meshes[i]!.material) ? (meshes[i]!.material as THREE.Material[]) : [meshes[i]!.material as THREE.Material];
    for (const m of mats) {
      const u = m.userData.projection as { uFacing?: { value: THREE.Vector2 } } | undefined;
      u?.uFacing?.value.set(-1, -0.99);
    }
  });
  return actor;
}

/** Mean colour of the opaque pixels (sRGB), a little darker — the paper under the drawing. */
function meanColour(px: Uint8ClampedArray): THREE.Color {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < px.length; i += 4)
    if (px[i + 3]! >= 128) {
      r += px[i]!;
      g += px[i + 1]!;
      b += px[i + 2]!;
      n++;
    }
  if (!n) return new THREE.Color('#c9b8a0');
  return new THREE.Color(((r / n) * 0.8) / 255, ((g / n) * 0.8) / 255, ((b / n) * 0.8) / 255);
}
