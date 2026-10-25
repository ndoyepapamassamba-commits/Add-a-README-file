// Bâtiments terminés fusionnés par zones de terrain : un appel de dessin par zone (et par passe d'ombre),
// quel que soit le nombre de modèles différents. Chaque bâtiment occupe une plage de sommets du tampon de
// sa zone ; l'ajouter, le retirer ou changer son état ne réécrit que cette plage.
// L'état visuel (normal, abandonné, survol, vue d'information) est une couleur par sommet (aState.rgb),
// la graine d'allumage des fenêtres la quatrième composante (aState.a).
import * as THREE from 'three';

const ATTRS = [
  ['position', 3],
  ['normal', 3],
  ['color', 3],
  ['aWin', 1],
  ['aWuv', 2],
];
const _c = new THREE.Color();

export class CityChunks {
  constructor(group, mat, size = 256) {
    this.group = group;
    this.mat = mat;
    this.CH = size;
    this.map = new Map();
    this.pending = new Set();
  }

  key(x, z) {
    return Math.floor(x / this.CH) + ':' + Math.floor(z / this.CH);
  }

  chunk(key) {
    let C = this.map.get(key);
    if (!C) {
      const [i, j] = key.split(':').map(Number);
      C = { key, cx: (i + 0.5) * this.CH, cz: (j + 0.5) * this.CH, cap: 0, used: 0, live: 0, free: [], blds: new Set(), arrays: null, geo: null, mesh: null, minY: Infinity, maxY: -Infinity, ranges: new Map() };
      this.map.set(key, C);
      this.grow(C, 4096);
    }
    return C;
  }

  // (ré)alloue les tampons d'une zone ; les données déjà écrites sont recopiées
  grow(C, cap) {
    const arrays = {};
    for (const [name, size] of ATTRS) {
      arrays[name] = new Float32Array(cap * size);
      if (C.arrays) arrays[name].set(C.arrays[name].subarray(0, C.used * size));
    }
    arrays.aState = new Uint8Array(cap * 4);
    if (C.arrays) arrays.aState.set(C.arrays.aState.subarray(0, C.used * 4));
    const geo = new THREE.BufferGeometry();
    for (const [name, size] of ATTRS) geo.setAttribute(name, new THREE.BufferAttribute(arrays[name], size).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aState', new THREE.BufferAttribute(arrays.aState, 4, true).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, C.used);
    if (C.mesh) {
      this.group.remove(C.mesh);
      C.geo.dispose();
    }
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    C.arrays = arrays;
    C.geo = geo;
    C.mesh = mesh;
    C.cap = cap;
    // les nouveaux tampons partent en entier au prochain rendu
    C.ranges.clear();
    this.bounds(C);
  }

  // sphère englobante calculée depuis la zone et la hauteur des bâtiments (pas de parcours des sommets)
  bounds(C) {
    const lo = Number.isFinite(C.minY) ? C.minY : 0;
    const hi = Number.isFinite(C.maxY) ? C.maxY : 40;
    const r = Math.hypot(this.CH * 0.7072 + 40, (hi - lo) / 2 + 10);
    C.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(C.cx, (lo + hi) / 2, C.cz), r);
  }

  alloc(C, n) {
    let best = -1;
    for (let i = 0; i < C.free.length; i++) {
      const f = C.free[i];
      if (f.count >= n && (best < 0 || f.count < C.free[best].count)) best = i;
    }
    if (best >= 0) {
      const f = C.free[best];
      const start = f.start;
      if (f.count === n) C.free.splice(best, 1);
      else {
        f.start += n;
        f.count -= n;
      }
      return start;
    }
    if (C.used + n > C.cap) this.grow(C, Math.max(C.cap * 2, C.used + n));
    const start = C.used;
    C.used += n;
    C.geo.setDrawRange(0, C.used);
    return start;
  }

  release(C, start, n) {
    // sommets ramenés à l'origine : triangles dégénérés, rien n'est dessiné
    C.arrays.position.fill(0, start * 3, (start + n) * 3);
    this.mark(C, 'position', start, n);
    C.free.push({ start, count: n });
    C.free.sort((a, b) => a.start - b.start);
    for (let i = C.free.length - 2; i >= 0; i--) {
      const a = C.free[i];
      const b = C.free[i + 1];
      if (a.start + a.count === b.start) {
        a.count += b.count;
        C.free.splice(i + 1, 1);
      }
    }
    const last = C.free[C.free.length - 1];
    if (last && last.start + last.count === C.used) {
      C.used = last.start;
      C.free.pop();
      C.geo.setDrawRange(0, C.used);
    }
  }

  add(b, geo, height) {
    const C = this.chunk(this.key(b.x, b.z));
    const n = geo.attributes.position.count;
    const start = this.alloc(C, n);
    b.chunk = C;
    b.cStart = start;
    b.cCount = n;
    C.blds.add(b);
    C.live += n;
    this.write(C, b, geo, start);
    const lo = b.y - 2;
    const hi = b.y + (height || 30) + 2;
    if (lo < C.minY || hi > C.maxY) {
      C.minY = Math.min(C.minY, lo);
      C.maxY = Math.max(C.maxY, hi);
      this.bounds(C);
    }
  }

  // modèle tourné autour de la verticale puis placé : positions et normales en coordonnées monde
  write(C, b, geo, start) {
    const n = geo.attributes.position.count;
    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    const P = geo.attributes.position.array;
    const N = geo.attributes.normal.array;
    const op = C.arrays.position;
    const on = C.arrays.normal;
    for (let i = 0, o = start * 3; i < n * 3; i += 3, o += 3) {
      const x = P[i];
      const z = P[i + 2];
      op[o] = b.x + x * c + z * s;
      op[o + 1] = b.y + P[i + 1];
      op[o + 2] = b.z - x * s + z * c;
      const nx = N[i];
      const nz = N[i + 2];
      on[o] = nx * c + nz * s;
      on[o + 1] = N[i + 1];
      on[o + 2] = -nx * s + nz * c;
    }
    C.arrays.color.set(geo.attributes.color.array, start * 3);
    C.arrays.aWin.set(geo.attributes.aWin.array, start);
    C.arrays.aWuv.set(geo.attributes.aWuv.array, start * 2);
    for (const [name] of ATTRS) this.mark(C, name, start, n);
    b.cSeed = (b.seed >>> 3) % 251;
    if (b.cRGB === undefined) b.cRGB = [255, 255, 255];
    this.fillState(C, b);
  }

  remove(b) {
    const C = b.chunk;
    if (!C) return;
    this.release(C, b.cStart, b.cCount);
    C.blds.delete(b);
    C.live -= b.cCount;
    b.chunk = null;
    if (!C.blds.size) {
      this.group.remove(C.mesh);
      C.geo.dispose();
      this.map.delete(C.key);
      this.pending.delete(C);
    }
  }

  // hex : couleur d'état ; sinon gris d'intensité scale (1 = normal)
  color(b, hex, scale = 1) {
    if (hex === null || hex === undefined) _c.setRGB(scale, scale, scale);
    else _c.setHex(hex);
    const r = Math.round(_c.r * 255);
    const g = Math.round(_c.g * 255);
    const bl = Math.round(_c.b * 255);
    const prev = b.cRGB;
    if (prev && prev[0] === r && prev[1] === g && prev[2] === bl) return;
    b.cRGB = [r, g, bl];
    if (b.chunk) this.fillState(b.chunk, b);
  }

  fillState(C, b) {
    const a = C.arrays.aState;
    const [r, g, bl] = b.cRGB;
    const w = b.cSeed;
    for (let i = b.cStart * 4, e = (b.cStart + b.cCount) * 4; i < e; i += 4) {
      a[i] = r;
      a[i + 1] = g;
      a[i + 2] = bl;
      a[i + 3] = w;
    }
    this.mark(C, 'aState', b.cStart, b.cCount);
  }

  mark(C, name, start, n) {
    let list = C.ranges.get(name);
    if (!list) {
      list = [];
      C.ranges.set(name, list);
    }
    list.push(start, n);
    this.pending.add(C);
  }

  // regroupe les plages modifiées pendant l'image et les confie au moteur de rendu
  flush() {
    for (const C of this.pending) {
      // tampon trop fragmenté : on recompacte
      if (C.used - C.live > Math.max(16384, C.live)) this.compact(C);
      for (const [name, list] of C.ranges) {
        const attr = C.geo.attributes[name];
        const size = attr.itemSize;
        if (list.length > 64 || attr.updateRanges.length + list.length / 2 > 48) attr.clearUpdateRanges();
        else for (let i = 0; i < list.length; i += 2) attr.addUpdateRange(list[i] * size, list[i + 1] * size);
        attr.needsUpdate = true;
      }
      C.ranges.clear();
    }
    this.pending.clear();
  }

  compact(C) {
    const blds = [...C.blds].sort((a, b) => a.cStart - b.cStart);
    const cap = Math.max(4096, C.live * 2);
    const old = C.arrays;
    const arrays = {};
    for (const [name, size] of ATTRS) arrays[name] = new Float32Array(cap * size);
    arrays.aState = new Uint8Array(cap * 4);
    let o = 0;
    for (const b of blds) {
      for (const [name, size] of ATTRS) arrays[name].set(old[name].subarray(b.cStart * size, (b.cStart + b.cCount) * size), o * size);
      arrays.aState.set(old.aState.subarray(b.cStart * 4, (b.cStart + b.cCount) * 4), o * 4);
      b.cStart = o;
      o += b.cCount;
    }
    C.arrays = null;
    C.used = 0;
    C.free = [];
    this.grow(C, cap);
    for (const [name, size] of ATTRS) C.arrays[name].set(arrays[name].subarray(0, o * size));
    C.arrays.aState.set(arrays.aState.subarray(0, o * 4));
    C.used = o;
    C.geo.setDrawRange(0, o);
  }

  clear() {
    for (const C of this.map.values()) {
      this.group.remove(C.mesh);
      C.geo.dispose();
      for (const b of C.blds) b.chunk = null;
    }
    this.map.clear();
    this.pending.clear();
  }

  stats() {
    let verts = 0;
    let used = 0;
    for (const C of this.map.values()) {
      verts += C.live;
      used += C.used;
    }
    return { chunks: this.map.size, verts, used };
  }
}
