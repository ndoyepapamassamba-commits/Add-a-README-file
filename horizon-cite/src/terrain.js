// Relief procédural : collines, côte, plages, montagnes en bordure et col pour l'autoroute.
import * as THREE from 'three';
import { fbm, noise2, ridged, smoothstep, lerp, clamp } from './util.js';
import { WATER_LEVEL, TERRAIN_HALF, OUTSIDE_ENTRY, HIGHWAY_END, BUILD_LIMIT } from './config.js';

const HWY_Z = OUTSIDE_ENTRY.z;

// > 0 dans la mer, < 0 sur terre (≈ mètres jusqu'au rivage)
export function seaness(x, z) {
  return z + x * 0.08 - 250 + fbm(x * 0.0019 + 11.3, z * 0.0019 - 4.1, 4) * 190 + noise2(x * 0.011, z * 0.011) * 14;
}

export function heightAt(x, z) {
  const s = seaness(x, z);
  const b = fbm(x * 0.0015 + 3.7, z * 0.0015 + 1.9, 4);
  let h = 2.2 + (b + 0.6) * 6.5;
  const hill = fbm(x * 0.0034 - 8.0, z * 0.0034 + 2.2, 3);
  if (hill > 0.12) h += (hill - 0.12) * 26;
  // montagnes en bordure
  const edge = Math.max(Math.abs(x), Math.abs(z)) + fbm(x * 0.0021 - 31, z * 0.0021 + 17, 3) * 160;
  let m = smoothstep(860, 1200, edge);
  if (m > 0) {
    if (x < -560) m *= smoothstep(48, 150, Math.abs(z - HWY_Z));
    m *= 1 - smoothstep(-320, -80, s);
    if (m > 0) {
      const near = 18 + ridged(x * 0.0029, z * 0.0029, 4) * 105;
      const far = 30 + (fbm(x * 0.0007 + 3, z * 0.0007 - 7, 3) + 0.5) * 70;
      h += m * lerp(near, far, smoothstep(1500, 2600, edge));
    }
  }
  // côte : plage puis fond marin
  if (s > -70) {
    const t = smoothstep(-70, 0, s);
    h = lerp(h, WATER_LEVEL + 1.15, t);
    if (s > 0) h = WATER_LEVEL + 1.15 - Math.min(20, s * 0.24);
  }
  return h;
}

export function isWater(x, z) {
  return heightAt(x, z) < WATER_LEVEL + 0.25;
}

export function inBuildArea(x, z) {
  return Math.abs(x) < BUILD_LIMIT && Math.abs(z) < BUILD_LIMIT;
}

// Pente approximative (m/m)
export function slopeAt(x, z) {
  const e = 4;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

// Distance au couloir de l'autoroute d'entrée (pour éviter arbres et montagnes)
export function highwayCorridorDist(x, z) {
  if (x > HIGHWAY_END.x + 40) return Infinity;
  return Math.abs(z - HWY_Z);
}

function makeDetailTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // bruit périodique : on échantillonne sur un tore
      const a = (x / size) * Math.PI * 2;
      const bb = (y / size) * Math.PI * 2;
      const nx = Math.cos(a) * 4;
      const ny = Math.sin(a) * 4;
      const nz = Math.cos(bb) * 4;
      const nw = Math.sin(bb) * 4;
      let v = noise2(nx + nz * 0.7, ny + nw * 0.7) * 0.5 + noise2(nx * 3.1 + nw, ny * 3.1 - nz) * 0.3;
      v += (Math.random() - 0.5) * 0.18;
      const k = clamp(0.86 + v * 0.22, 0.62, 1);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = k * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const C = (hex) => new THREE.Color(hex);
const COL = {
  grass: C(0x7a9850),
  grassDry: C(0x9fa165),
  grassDark: C(0x5d7d44),
  forest: C(0x4a6638),
  sand: C(0xd8c58c),
  sandWet: C(0xb9a674),
  seabed: C(0x7c8a6c),
  rock: C(0x8b8476),
  rockDark: C(0x6d675d),
  snow: C(0xf3f5f8),
};

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.size = TERRAIN_HALF * 2;
    this.res = 384; // 8 m par case
    this.uniforms = {
      uOverlay: { value: null },
      uOverlayOn: { value: 0 },
      uOverlayRect: { value: new THREE.Vector4(-1024, -1024, 2048, 2048) },
      uGrid: { value: 0 },
    };
    this.build();
  }

  colorAt(x, z, h, slope, out) {
    const s = seaness(x, z);
    const n1 = fbm(x * 0.006 + 5, z * 0.006 - 3, 3);
    const n2 = noise2(x * 0.03, z * 0.03);
    out.copy(COL.grass).lerp(COL.grassDry, smoothstep(0.05, 0.45, n1) * 0.7);
    out.lerp(COL.grassDark, smoothstep(-0.1, -0.45, n1) * 0.8);
    const forest = fbm(x * 0.0045 + 40, z * 0.0045 - 12, 3);
    out.lerp(COL.forest, smoothstep(0.1, 0.32, forest) * 0.55);
    out.multiplyScalar(0.94 + n2 * 0.08);
    // montagne
    const rockT = smoothstep(0.5, 0.9, slope) + smoothstep(55, 100, h) * 0.55;
    if (rockT > 0) out.lerp(n2 > 0 ? COL.rock : COL.rockDark, clamp(rockT, 0, 1));
    if (h > 120) out.lerp(COL.snow, smoothstep(120, 150, h + n2 * 14) * 0.9);
    // plage et fond
    if (s > -45) {
      const sandT = smoothstep(-45, -18, s);
      out.lerp(COL.sand, sandT);
      if (h < WATER_LEVEL + 0.4) out.lerp(COL.sandWet, smoothstep(WATER_LEVEL + 0.4, WATER_LEVEL - 0.6, h));
      if (h < WATER_LEVEL - 1) out.lerp(COL.seabed, smoothstep(WATER_LEVEL - 1, WATER_LEVEL - 9, h));
    }
    return out;
  }

  build() {
    const N = this.res;
    const size = this.size;
    const geo = new THREE.PlaneGeometry(size, size, N, N);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const heights = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z);
      heights[i] = h;
      pos.setY(i, h);
    }
    this.heights = heights;
    const tmp = new THREE.Color();
    const row = N + 1;
    const step = size / N;
    for (let i = 0; i < pos.count; i++) {
      const ix = i % row;
      const iz = Math.floor(i / row);
      const hL = heights[iz * row + Math.max(0, ix - 1)];
      const hR = heights[iz * row + Math.min(N, ix + 1)];
      const hU = heights[Math.max(0, iz - 1) * row + ix];
      const hD = heights[Math.min(N, iz + 1) * row + ix];
      const slope = Math.hypot(hR - hL, hD - hU) / (2 * step);
      this.colorAt(pos.getX(i), pos.getZ(i), heights[i], slope, tmp);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.addSkirt(geo, N);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (size / 20), uv.getY(i) * (size / 20));

    const detail = makeDetailTexture();
    this.detail = detail;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detail });
    this.material = mat;
    this.patchMaterial(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.mesh = mesh;
    this.scene.add(mesh);

    this.buildOuter();
    this.buildDepthTexture();
  }

  // Jupe verticale sur le pourtour : masque les fissures avec l'anneau extérieur plus grossier
  addSkirt(geo, N) {
    const pos = geo.attributes.position;
    const col = geo.attributes.color;
    const nor = geo.attributes.normal;
    const uv = geo.attributes.uv;
    const row = N + 1;
    const border = [];
    for (let i = 0; i <= N; i++) border.push(i); // haut
    for (let i = 1; i <= N; i++) border.push(i * row + N); // droite
    for (let i = N - 1; i >= 0; i--) border.push(N * row + i); // bas
    for (let i = N - 1; i >= 0; i--) border.push(i * row); // gauche
    const base = pos.count;
    const n = border.length;
    const P = new Float32Array((base + n) * 3);
    P.set(pos.array);
    const Cc = new Float32Array((base + n) * 3);
    Cc.set(col.array);
    const Nn = new Float32Array((base + n) * 3);
    Nn.set(nor.array);
    const U = new Float32Array((base + n) * 2);
    U.set(uv.array);
    for (let k = 0; k < n; k++) {
      const v = border[k];
      const j = base + k;
      P[j * 3] = pos.getX(v);
      P[j * 3 + 1] = pos.getY(v) - 90;
      P[j * 3 + 2] = pos.getZ(v);
      Cc[j * 3] = col.getX(v) * 0.8;
      Cc[j * 3 + 1] = col.getY(v) * 0.8;
      Cc[j * 3 + 2] = col.getZ(v) * 0.8;
      Nn[j * 3 + 1] = 1;
      U[j * 2] = uv.getX(v);
      U[j * 2 + 1] = uv.getY(v);
    }
    const idx = Array.from(geo.index.array);
    for (let k = 0; k < n - 1; k++) {
      const a = border[k];
      const b = border[k + 1];
      const a2 = base + k;
      const b2 = base + k + 1;
      idx.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    geo.setIndex(idx);
  }

  // Anneau extérieur moins détaillé jusqu'à l'horizon
  buildOuter() {
    const inner = TERRAIN_HALF;
    const outer = 7000;
    const step = 96;
    const positions = [];
    const colors = [];
    const tmp = new THREE.Color();
    const verts = new Map();
    const indices = [];
    const n = Math.ceil((outer * 2) / step);
    const coords = [];
    for (let i = 0; i <= n; i++) coords.push(-outer + i * step);
    // on force des lignes exactement sur la frontière intérieure
    const all = Array.from(new Set(coords.concat([-inner, inner]))).sort((a, b) => a - b);
    const idx = (ix, iz) => {
      const k = ix * 10000 + iz;
      let v = verts.get(k);
      if (v === undefined) {
        const x = all[ix];
        const z = all[iz];
        let h = heightAt(x, z);
        // fondu doux vers une altitude constante très loin
        positions.push(x, h, z);
        const sl = Math.hypot(heightAt(x + 24, z) - heightAt(x - 24, z), heightAt(x, z + 24) - heightAt(x, z - 24)) / 48;
        this.colorAt(x, z, h, sl, tmp);
        colors.push(tmp.r, tmp.g, tmp.b);
        v = positions.length / 3 - 1;
        verts.set(k, v);
      }
      return v;
    };
    for (let ix = 0; ix < all.length - 1; ix++) {
      for (let iz = 0; iz < all.length - 1; iz++) {
        const x0 = all[ix];
        const x1 = all[ix + 1];
        const z0 = all[iz];
        const z1 = all[iz + 1];
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        if (Math.abs(cx) < inner && Math.abs(cz) < inner) continue;
        const a = idx(ix, iz);
        const b = idx(ix + 1, iz);
        const c = idx(ix + 1, iz + 1);
        const d = idx(ix, iz + 1);
        indices.push(a, d, b, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const uvs = new Float32Array((positions.length / 3) * 2);
    for (let i = 0; i < positions.length / 3; i++) {
      uvs[i * 2] = positions[i * 3] / 20;
      uvs[i * 2 + 1] = -positions[i * 3 + 2] / 20;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = false;
    this.outer = mesh;
    this.scene.add(mesh);
  }

  // Texture de profondeur d'eau pour le shader de la mer (écume, couleur des hauts-fonds)
  buildDepthTexture() {
    const N = this.res + 1;
    const data = new Uint8Array(N * N * 4);
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const h = this.heights[iz * N + ix];
        const d = clamp((WATER_LEVEL - h) / 24, 0, 1);
        // la ligne iz=0 correspond à z = -TERRAIN_HALF ; le shader lit (x,z) -> (u,v)
        const i = (iz * N + ix) * 4;
        data[i] = d * 255;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.depthTexture = tex;
  }

  patchMaterial(mat) {
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec2 vWXZ;
uniform sampler2D uOverlay;
uniform float uOverlayOn;
uniform vec4 uOverlayRect;
uniform float uGrid;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
if (uOverlayOn > 0.5) {
  float g = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  vec3 grey = vec3(g * 0.55 + 0.32);
  vec2 ouv = (vWXZ - uOverlayRect.xy) / uOverlayRect.zw;
  vec4 o = vec4(0.0);
  if (ouv.x > 0.0 && ouv.x < 1.0 && ouv.y > 0.0 && ouv.y < 1.0) o = texture2D(uOverlay, ouv);
  diffuseColor.rgb = mix(grey, o.rgb, o.a);
}
if (uGrid > 0.5) {
  vec2 lim = abs(vWXZ);
  float edge = max(lim.x, lim.y);
  float line = 1.0 - smoothstep(0.0, 2.5, abs(edge - ${BUILD_LIMIT.toFixed(1)}));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.95, 0.6), line * 0.8);
}`
        );
    };
    mat.customProgramCacheKey = () => 'terrain-v1';
  }
}
