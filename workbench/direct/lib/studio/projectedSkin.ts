/**
 * PEAU 2D — the owner's drawing projected onto the 3D body (camera projection mapping, the VFX way: Nuke / Blender
 * « project from view »). Once per character, the model takes the pose of the drawing, an orthographic projector in
 * front of it casts the drawing onto every vertex that faces it and is not hidden (depth test from the projector);
 * the projected drawing coordinates and that visibility are BAKED as vertex attributes, so the painting sticks to the
 * skin and moves with the limbs. At render time: facing the camera, the pixel is the drawing itself (your painting,
 * unlit); turned away, it fades to the reconstructed 3D texture (toon-shaded).
 */
import * as THREE from 'three';

export interface ProjectionBake {
  /** Vertices that received the drawing (share of the skinned vertices). */
  coverage: number;
  /** Frame of the projector in actor space (metres): left/right/top/bottom of the drawing. */
  frame: { x0: number; x1: number; y0: number; y1: number };
}

/** The drawing's own bounds (its alpha), as fractions of the picture: left, top, right, bottom. */
export function alphaBounds(img: ImageBitmap | HTMLCanvasElement): [number, number, number, number] {
  const w = Math.min(256, img.width);
  const h = Math.max(1, Math.round((w * img.height) / img.width));
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, w, h);
  const a = g.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (a[(y * w + x) * 4 + 3]! > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? [0, 0, 1, 1] : [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h];
}

const DEPTH_SIZE = 1024;

/**
 * Bakes the projection of `drawing` onto every skinned mesh under `root` IN ITS CURRENT POSE (the pose of the drawing,
 * see pose2d). The projector looks down −Z from the front, fitted so the drawing's figure bounds cover the model's
 * silhouette bounds (height and centre). Adds the attributes `projUv` (vec2) and `projVis` (float) to each geometry.
 */
export function bakeProjection(root: THREE.Object3D, drawing: { width: number; height: number }, bounds: [number, number, number, number]): ProjectionBake {
  root.updateMatrixWorld(true);
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
  });
  // 1) The posed vertices in actor space (skinning applied on the CPU: three's boneTransform).
  const posed: { mesh: THREE.SkinnedMesh; pts: Float32Array; nrm: Float32Array }[] = [];
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const box = new THREE.Box3();
  for (const m of meshes) {
    m.skeleton.update();
    const g = m.geometry;
    const count = g.attributes.position!.count;
    const pts = new Float32Array(count * 3);
    const nrm = new Float32Array(count * 3);
    const normalMat = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(g.attributes.position as THREE.BufferAttribute, i);
      m.applyBoneTransform(i, v);
      v.applyMatrix4(m.matrixWorld).applyMatrix4(rootInv);
      pts.set([v.x, v.y, v.z], i * 3);
      box.expandByPoint(v);
      n.fromBufferAttribute(g.attributes.normal as THREE.BufferAttribute, i).applyMatrix3(normalMat).normalize();
      nrm.set([n.x, n.y, n.z], i * 3);
    }
    posed.push({ mesh: m, pts, nrm });
  }
  // 2) The projector frame: the drawing's figure bounds mapped onto the model's silhouette (height + centre).
  const [bx0, by0, bx1, by1] = bounds;
  const bh = Math.max(1e-6, by1 - by0);
  const bw = Math.max(1e-6, bx1 - bx0);
  const modelH = box.max.y - box.min.y;
  const unit = modelH / bh; // actor metres per drawing fraction (vertical)
  const aspect = drawing.width / drawing.height;
  const y1 = box.max.y + by0 * unit;
  const y0 = y1 - unit;
  const cx = (box.min.x + box.max.x) / 2;
  const x0 = cx - (bx0 + bw / 2) * unit * aspect;
  const x1 = x0 + unit * aspect;
  // 3) Depth from the projector: the nearest surface along each projection ray (orthographic, front, −Z).
  const depth = new Float32Array(DEPTH_SIZE * DEPTH_SIZE).fill(-Infinity);
  const cell = (t: number) => Math.min(DEPTH_SIZE - 1, Math.max(0, Math.floor(t * DEPTH_SIZE)));
  const toCell = (x: number, y: number): [number, number] => [cell((x - x0) / (x1 - x0)), cell((y1 - y) / (y1 - y0))];
  for (const { mesh, pts } of posed) {
    const idx = mesh.geometry.index;
    const tri = (a: number, b: number, c: number) => {
      // Rasterise the triangle's bounding cells (small triangles: a few cells) with its max z — conservative.
      const zs = Math.max(pts[a * 3 + 2]!, pts[b * 3 + 2]!, pts[c * 3 + 2]!);
      const xs = [pts[a * 3]!, pts[b * 3]!, pts[c * 3]!];
      const ys = [pts[a * 3 + 1]!, pts[b * 3 + 1]!, pts[c * 3 + 1]!];
      const [cx0, cy0] = toCell(Math.min(...xs), Math.max(...ys));
      const [cx1, cy1] = toCell(Math.max(...xs), Math.min(...ys));
      for (let y = Math.max(0, cy0); y <= Math.min(DEPTH_SIZE - 1, cy1); y++)
        for (let x = Math.max(0, cx0); x <= Math.min(DEPTH_SIZE - 1, cx1); x++) if (zs > depth[y * DEPTH_SIZE + x]!) depth[y * DEPTH_SIZE + x] = zs;
    };
    const nTri = idx ? idx.count / 3 : pts.length / 9;
    for (let t = 0; t < nTri; t++) tri(idx ? idx.getX(t * 3) : t * 3, idx ? idx.getX(t * 3 + 1) : t * 3 + 1, idx ? idx.getX(t * 3 + 2) : t * 3 + 2);
  }
  // 4) The attributes: drawing uv of each vertex, visibility = faces the projector and is the nearest surface.
  let got = 0;
  let total = 0;
  const tol = modelH * 0.012;
  for (const { mesh, pts, nrm } of posed) {
    const count = pts.length / 3;
    const uv = new Float32Array(count * 2);
    const vis = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const x = pts[i * 3]!;
      const y = pts[i * 3 + 1]!;
      const z = pts[i * 3 + 2]!;
      const u = (x - x0) / (x1 - x0);
      const w = 1 - (y - y0) / (y1 - y0);
      uv[i * 2] = u;
      uv[i * 2 + 1] = 1 - w; // three samples textures with v up
      const [cx, cy] = toCell(x, y);
      const front = Math.max(0, nrm[i * 3 + 2]!);
      const nearest = z >= depth[cy * DEPTH_SIZE + cx]! - tol;
      // Soft: full on surfaces squarely facing the front, fading on the sides (the 3D texture takes over).
      // Inside the drawing (a hair of tolerance: vertices sit exactly on the frame's edges).
      const inside = u >= -1e-4 && u <= 1 + 1e-4 && w >= -1e-4 && w <= 1 + 1e-4;
      vis[i] = nearest && inside ? Math.min(1, front * 1.6) : 0;
      if (vis[i]! > 0.5) got++;
      total++;
    }
    mesh.geometry.setAttribute('projUv', new THREE.BufferAttribute(uv, 2));
    mesh.geometry.setAttribute('projVis', new THREE.BufferAttribute(vis, 1));
  }
  return { coverage: total ? got / total : 0, frame: { x0, x1, y0, y1 } };
}

/**
 * Makes a toon material show the projected drawing where it was baked: unlit (the painting carries its own light),
 * blended by the baked visibility and the current facing (the drawing fades out as the surface turns away).
 */
export function projectedToon(base: THREE.MeshToonMaterial, drawing: THREE.Texture, face?: { glsl: string; u: Record<string, THREE.IUniform> }): THREE.MeshToonMaterial {
  const mat = base.clone();
  const u = { tDrawing: { value: drawing }, uProjK: { value: 1 }, uFacing: { value: new THREE.Vector2(0.25, 0.75) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, face?.u ?? {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 projUv; attribute float projVis; varying vec2 vProjUv; varying float vProjVis; varying vec3 vWorldN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvProjUv = projUv; vProjVis = projVis;')
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvWorldN = normalize((modelMatrix * vec4(transformedNormal, 0.0)).xyz);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D tDrawing; uniform float uProjK; uniform vec2 uFacing; varying vec2 vProjUv; varying float vProjVis; varying vec3 vWorldN;\n${face?.glsl ?? ''}`)
      .replace(
        '#include <opaque_fragment>',
        `${face ? 'vec2 fP; vec2 fUv; float fGap;\n  vec4 drawn = faceSample(tDrawing, vProjUv, 0.0, fP, fUv, fGap);' : 'vec4 drawn = texture2D(tDrawing, vProjUv);'}
  // Facing the camera: the drawing; turned away: the 3D texture (uFacing: where the fade starts and ends, as the
  // cosine to the lens — a reconstructed model fades from 35°, a body inflated from the drawing keeps its drawing
  // over its sides, like the edge of a paper cut-out).
  float facing = smoothstep(uFacing.x, uFacing.y, dot(normalize(vWorldN), normalize(cameraPosition - vWorldPosition)));
  float k = vProjVis * drawn.a * uProjK * facing;
  outgoingLight = mix(outgoingLight, drawn.rgb, k);
  #include <opaque_fragment>`,
      )
;
    // vWorldPosition only exists with an environment map: declared and filled here when missing.
    sh.vertexShader = sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    if (!/varying vec3 vWorldPosition/.test(sh.vertexShader)) sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosition;');
    if (!/varying vec3 vWorldPosition/.test(sh.fragmentShader)) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosition;');
  };
  mat.customProgramCacheKey = () => (face ? 'projected-toon-face-v1' : 'projected-toon-v1');
  mat.userData.projection = u;
  return mat;
}
