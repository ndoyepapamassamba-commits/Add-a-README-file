// Forêts instanciées par blocs (culling par bloc), suppression/plantation dynamiques.
import * as THREE from 'three';
import { mulberry32, fbm, smoothstep, SpatialHash, clamp } from './util.js';
import { heightAt, seaness, highwayCorridorDist } from './terrain.js';
import { WATER_LEVEL } from './config.js';

const CHUNK = 512;
const EXTENT = 1500;
const NCH = Math.ceil((EXTENT * 2) / CHUNK);

function colorGeo(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function merge(geos) {
  // fusion simple non indexée
  let total = 0;
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of parts) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

export function makeTreeGeometries() {
  // conifère
  const trunk1 = colorGeo(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 5).translate(0, 1.1, 0), 0x5a4030);
  const c1 = colorGeo(new THREE.ConeGeometry(2.4, 5.2, 7).translate(0, 4.2, 0), 0x2f5a2a);
  const c2 = colorGeo(new THREE.ConeGeometry(1.8, 4.2, 7).translate(0, 6.6, 0), 0x356530);
  const conifer = merge([trunk1, c1, c2]);
  // feuillu
  const trunk2 = colorGeo(new THREE.CylinderGeometry(0.25, 0.38, 2.6, 5).translate(0, 1.3, 0), 0x5e4532);
  const crownA = new THREE.IcosahedronGeometry(2.6, 0);
  crownA.scale(1, 0.85, 1).translate(0, 4.4, 0);
  const crownB = new THREE.IcosahedronGeometry(1.7, 0);
  crownB.translate(1.1, 5.4, 0.5);
  const broad = merge([trunk2, colorGeo(crownA, 0x4f8a35), colorGeo(crownB, 0x5a9440)]);
  conifer.computeBoundingSphere();
  broad.computeBoundingSphere();
  return [conifer, broad];
}

export class Trees {
  constructor(scene, quality) {
    this.scene = scene;
    this.geos = makeTreeGeometries();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.hash = new SpatialHash(32);
    this.chunks = [];
    this.castShadow = quality ? quality.treeShadows : true;
    for (let i = 0; i < NCH * NCH; i++) this.chunks.push([[], []]);
    this.meshes = [];
    this.dirty = new Set();
    this.generate();
    this.buildMeshes();
  }

  chunkIndex(x, z) {
    const cx = clamp(Math.floor((x + EXTENT) / CHUNK), 0, NCH - 1);
    const cz = clamp(Math.floor((z + EXTENT) / CHUNK), 0, NCH - 1);
    return cz * NCH + cx;
  }

  canGrow(x, z, h) {
    if (h < WATER_LEVEL + 1.6) return false;
    if (seaness(x, z) > -14) return false;
    if (highwayCorridorDist(x, z) < 34) return false;
    return true;
  }

  generate() {
    const r = mulberry32(4242);
    const step = 10;
    for (let x = -EXTENT; x < EXTENT; x += step) {
      for (let z = -EXTENT; z < EXTENT; z += step) {
        const px = x + (r() - 0.5) * step * 0.9;
        const pz = z + (r() - 0.5) * step * 0.9;
        const h = heightAt(px, pz);
        if (!this.canGrow(px, pz, h)) continue;
        const f = fbm(px * 0.0045 + 40, pz * 0.0045 - 12, 3);
        let p = smoothstep(0.06, 0.26, f) * 0.92 + 0.006;
        let conifer = 0.25;
        if (h > 22) {
          p = Math.max(p, 0.55 * (1 - smoothstep(95, 140, h)));
          conifer = 0.85;
        }
        if (r() > p) continue;
        this.addTree(px, pz, r() < conifer ? 0 : 1, 1.05 + r() * 0.75, r(), false, h);
      }
    }
  }

  addTree(x, z, type, scale = 1, seed = Math.random(), mark = true, h = null) {
    const t = {
      x,
      z,
      y: h === null ? heightAt(x, z) : h,
      type,
      s: scale,
      rot: seed * Math.PI * 2,
      tint: 0.82 + ((seed * 7.31) % 1) * 0.3,
      ci: this.chunkIndex(x, z),
      idx: -1,
      user: mark,
    };
    const list = this.chunks[t.ci][type];
    t.idx = list.length;
    list.push(t);
    this.hash.insertPoint(t, x, z, 0);
    if (mark) this.dirty.add(t.ci);
    return t;
  }

  removeTree(t) {
    const list = this.chunks[t.ci][t.type];
    const last = list.pop();
    if (last !== t) {
      list[t.idx] = last;
      last.idx = t.idx;
    }
    this.hash.remove(t);
    this.dirty.add(t.ci);
  }

  removeWhere(minx, minz, maxx, maxz, test) {
    const found = this.hash.query(minx, minz, maxx, maxz);
    let n = 0;
    for (const t of found) {
      if (test(t)) {
        this.removeTree(t);
        n++;
      }
    }
    return n;
  }

  removeInRadius(x, z, r) {
    const r2 = r * r;
    return this.removeWhere(x - r, z - r, x + r, z + r, (t) => (t.x - x) ** 2 + (t.z - z) ** 2 < r2);
  }

  buildMeshes() {
    for (let ci = 0; ci < this.chunks.length; ci++) {
      for (let type = 0; type < 2; type++) {
        const list = this.chunks[ci][type];
        const cap = Math.max(64, Math.ceil(list.length * 1.25) + 32);
        const m = new THREE.InstancedMesh(this.geos[type], this.material, cap);
        m.castShadow = this.castShadow;
        m.receiveShadow = true;
        m.userData.cap = cap;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.meshes.push({ ci, type, mesh: m });
        this.scene.add(m);
        this.fill(ci, type);
      }
    }
  }

  meshFor(ci, type) {
    return this.meshes[ci * 2 + type];
  }

  fill(ci, type) {
    const entry = this.meshFor(ci, type);
    let m = entry.mesh;
    const list = this.chunks[ci][type];
    if (list.length > m.userData.cap) {
      // agrandir
      this.scene.remove(m);
      m.dispose();
      const cap = Math.ceil(list.length * 1.5) + 32;
      m = new THREE.InstancedMesh(this.geos[type], this.material, cap);
      m.castShadow = this.castShadow;
      m.receiveShadow = true;
      m.userData.cap = cap;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      entry.mesh = m;
      this.scene.add(m);
    }
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      q.setFromAxisAngle(up, t.rot);
      s.set(t.s, t.s * (0.9 + (t.tint - 0.82) * 0.6), t.s);
      p.set(t.x, t.y - 0.2, t.z);
      mat.compose(p, q, s);
      m.setMatrixAt(i, mat);
      col.setRGB(t.tint, t.tint * (0.98 + (t.rot % 0.1)), t.tint * 0.95);
      m.setColorAt(i, col);
    }
    m.count = list.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }

  setShadows(on) {
    this.castShadow = on;
    for (const e of this.meshes) e.mesh.castShadow = on;
  }

  update() {
    if (!this.dirty.size) return;
    for (const ci of this.dirty) {
      this.fill(ci, 0);
      this.fill(ci, 1);
    }
    this.dirty.clear();
  }

  setInfoMode(on) {
    this.material.color.setScalar(on ? 0.75 : 1);
  }

  // Données de sauvegarde : arbres plantés et arbres d'origine supprimés
  count() {
    let n = 0;
    for (const c of this.chunks) n += c[0].length + c[1].length;
    return n;
  }
}
