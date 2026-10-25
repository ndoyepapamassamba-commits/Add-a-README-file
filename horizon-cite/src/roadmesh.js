// Maillages des routes : textures de chaussée, rubans, carrefours (trottoirs arrondis, passages piétons),
// mobilier urbain (lampadaires, feux tricolores, arbres d'alignement).
import * as THREE from 'three';
import { ROAD_TYPES, ROAD_Y } from './config.js';
import { heightAt } from './terrain.js';
import { convexHull, mulberry32 } from './util.js';

const SIDEWALK_H = 0.2;

function drawNoise(g, x, y, w, h, base, amount, count, rnd) {
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  for (let i = 0; i < count; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${amount * rnd()})`;
    const s = 1 + rnd() * 2.5;
    g.fillRect(x + rnd() * w, y + rnd() * h, s, s);
  }
}

// Texture de chaussée par type de route : u = travers (0 = bord gauche), v = longueur (période P mètres)
export function makeRoadTexture(type, maxAniso) {
  const W = type.width;
  const P = type.id === 'oneway' ? 24 : 12;
  const cw = 512;
  const ch = P === 24 ? 1024 : 512;
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d');
  const rnd = mulberry32(99 + W);
  const ppm = cw / W;
  const ppv = ch / P;
  const X = (m) => m * ppm;
  // la toile est dessinée de haut en bas = v décroissant ; on raisonne en "mètres le long" depuis le bas
  const Y = (m) => ch - m * ppv;
  drawNoise(g, 0, 0, cw, ch, '#3b3e42', 0.08, 9000, rnd);
  // traces de roulement plus sombres au centre des voies
  const sw = (W - type.carriage) / 2;
  const half = W / 2;
  const med = type.median || 0;
  const lanesF = type.lanes[0];
  const lanesB = type.lanes[1];
  const lw = type.laneW;
  const laneCenters = [];
  if (lanesB === 0) {
    for (let k = 0; k < lanesF; k++) laneCenters.push(half + (k - (lanesF - 1) / 2) * lw);
  } else {
    for (let k = 0; k < lanesF; k++) laneCenters.push(half + med / 2 + (k + 0.5) * lw);
    for (let k = 0; k < lanesB; k++) laneCenters.push(half - med / 2 - (k + 0.5) * lw);
  }
  g.fillStyle = 'rgba(20,20,22,0.18)';
  for (const lc of laneCenters) {
    g.fillRect(X(lc - 1.1), 0, X(0.5) - X(0), ch);
    g.fillRect(X(lc + 0.6), 0, X(0.5) - X(0), ch);
  }
  // trottoirs
  if (type.sidewalk) {
    const drawWalk = (m0) => {
      drawNoise(g, X(m0), 0, X(sw) - X(0), ch, '#b4b0a6', 0.1, 1500, rnd);
      g.strokeStyle = 'rgba(80,76,70,0.28)';
      g.lineWidth = 1;
      for (let a = 0; a <= sw; a += 1.5) {
        g.beginPath();
        g.moveTo(X(m0 + a), 0);
        g.lineTo(X(m0 + a), ch);
        g.stroke();
      }
      for (let v = 0; v <= P; v += 1.5) {
        g.beginPath();
        g.moveTo(X(m0), Y(v));
        g.lineTo(X(m0 + sw), Y(v));
        g.stroke();
      }
    };
    drawWalk(0);
    drawWalk(W - sw);
    // bordures
    g.fillStyle = '#d2cec5';
    g.fillRect(X(sw - 0.28), 0, X(0.28) - X(0), ch);
    g.fillRect(X(W - sw), 0, X(0.28) - X(0), ch);
  } else {
    // accotements d'autoroute
    g.fillStyle = 'rgba(80,80,80,0.25)';
    g.fillRect(0, 0, X(1.4), ch);
    g.fillRect(X(W - 1.4), 0, X(1.4), ch);
  }
  // terre-plein central
  if (med > 0) {
    if (type.id === 'highway') {
      g.fillStyle = '#a8a7a2';
      g.fillRect(X(half - med / 2), 0, X(med) - X(0), ch);
      g.fillStyle = '#c9c8c2';
      g.fillRect(X(half - 0.35), 0, X(0.7) - X(0), ch);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(X(half - 0.05), 0, X(0.1) - X(0), ch);
    } else {
      g.fillStyle = '#d2cec5';
      g.fillRect(X(half - med / 2), 0, X(med) - X(0), ch);
      drawNoise(g, X(half - med / 2 + 0.3), 0, X(med - 0.6) - X(0), ch, '#5d7d3c', 0.12, 900, rnd);
    }
  }
  // marquages
  const white = '#e9e9e4';
  const line = (m, w = 0.15) => {
    g.fillStyle = white;
    g.fillRect(X(m - w / 2), 0, Math.max(1.5, X(w) - X(0)), ch);
  };
  const dashes = (m, len, w = 0.15) => {
    g.fillStyle = white;
    for (let v = 0; v < P; v += 12) g.fillRect(X(m - w / 2), Y(v + len), Math.max(1.5, X(w) - X(0)), len * ppv);
  };
  if (lanesB === 0) {
    for (let k = 1; k < lanesF; k++) dashes(half + (k - lanesF / 2) * lw, 4.5);
    // flèches
    g.fillStyle = white;
    for (const lc of laneCenters) {
      const by = 6;
      g.beginPath();
      g.moveTo(X(lc), Y(by + 4.2));
      g.lineTo(X(lc - 0.9), Y(by + 2.6));
      g.lineTo(X(lc - 0.25), Y(by + 2.6));
      g.lineTo(X(lc - 0.25), Y(by));
      g.lineTo(X(lc + 0.25), Y(by));
      g.lineTo(X(lc + 0.25), Y(by + 2.6));
      g.lineTo(X(lc + 0.9), Y(by + 2.6));
      g.closePath();
      g.fill();
    }
  } else {
    if (med === 0) {
      if (lanesF + lanesB >= 4) {
        line(half - 0.18);
        line(half + 0.18);
      } else dashes(half, 4.5);
    }
    for (let k = 1; k < lanesF; k++) dashes(half + med / 2 + k * lw, 4.5);
    for (let k = 1; k < lanesB; k++) dashes(half - med / 2 - k * lw, 4.5);
    if (type.id === 'highway') {
      line(1.5, 0.2);
      line(W - 1.5, 0.2);
      line(half - med / 2 - 0.3, 0.2);
      line(half + med / 2 + 0.3, 0.2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.userData = { period: P };
  return tex;
}

function makeNoiseTexture(maxAniso) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  drawNoise(g, 0, 0, 256, 256, '#ececec', 0.13, 7000, mulberry32(5));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

const _tint = new THREE.Color();

// fusion de géométries non indexées aux mêmes attributs ; renvoie les plages de sommets
function mergeGeos(geos) {
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const sizes = new Map();
  for (const g of geos) for (const name in g.attributes) sizes.set(name, g.attributes[name].itemSize);
  const out = new THREE.BufferGeometry();
  const ranges = [];
  for (const [name, size] of sizes) {
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of geos) {
      const a = g.attributes[name];
      const n = g.attributes.position.count;
      if (a) arr.set(a.array, o * size);
      else if (name === 'color') arr.fill(1, o * size, (o + n) * size);
      o += n;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  let o = 0;
  for (const g of geos) {
    ranges.push([o, g.attributes.position.count]);
    o += g.attributes.position.count;
  }
  out.computeBoundingSphere();
  return { geo: out, ranges };
}

const COL_ASPHALT = new THREE.Color('#3b3e42');
const COL_WALK = new THREE.Color('#b4b0a6');
const COL_CURB = new THREE.Color('#d2cec5');
const COL_ZEBRA = new THREE.Color('#e9e9e4');

// Accumulateur de géométrie non indexée
class Geo {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.c = [];
  }
  v(x, y, z, nx, ny, nz, u, w, col) {
    this.p.push(x, y, z);
    this.n.push(nx, ny, nz);
    this.uv.push(u, w);
    if (col) this.c.push(col.r, col.g, col.b);
  }
  // quadrilatère a,b,c,d (sens trigonométrique vu du dessus pour une normale vers le haut)
  quad(a, b, c, d, nrm, col, uvs) {
    const [n0, n1, n2] = nrm;
    const U = uvs || [
      [a.x / 8, a.z / 8],
      [b.x / 8, b.z / 8],
      [c.x / 8, c.z / 8],
      [d.x / 8, d.z / 8],
    ];
    this.v(a.x, a.y, a.z, n0, n1, n2, U[0][0], U[0][1], col);
    this.v(b.x, b.y, b.z, n0, n1, n2, U[1][0], U[1][1], col);
    this.v(c.x, c.y, c.z, n0, n1, n2, U[2][0], U[2][1], col);
    this.v(a.x, a.y, a.z, n0, n1, n2, U[0][0], U[0][1], col);
    this.v(c.x, c.y, c.z, n0, n1, n2, U[2][0], U[2][1], col);
    this.v(d.x, d.y, d.z, n0, n1, n2, U[3][0], U[3][1], col);
  }
  tri(a, b, c, col) {
    this.v(a.x, a.y, a.z, 0, 1, 0, a.x / 8, a.z / 8, col);
    this.v(b.x, b.y, b.z, 0, 1, 0, b.x / 8, b.z / 8, col);
    this.v(c.x, c.y, c.z, 0, 1, 0, c.x / 8, c.z / 8, col);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.c.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

// orientation : face vers le haut => sens anti-horaire vu de +Y. On vérifie et on inverse si besoin.
function upTri(g, a, b, c, col) {
  const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  if (cross > 0) g.tri(a, c, b, col);
  else g.tri(a, b, c, col);
}

export class RoadMeshes {
  constructor(net, scene, renderer) {
    this.net = net;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'roads';
    scene.add(this.group);
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.textures = {};
    this.mats = {};
    for (const id of Object.keys(ROAD_TYPES)) {
      const t = makeRoadTexture(ROAD_TYPES[id], aniso);
      this.textures[id] = t;
      this.mats[id] = new THREE.MeshLambertMaterial({ map: t, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    }
    this.noise = makeNoiseTexture(aniso);
    this.nodeMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: this.noise,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x5bc0ff, transparent: true, opacity: 0.55, depthWrite: false });
    this.ghostBad = new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.55, depthWrite: false });
    this.furniture = new Furniture(scene, this);
    // routes regroupées par zones de 384 m : un appel de dessin par type de route et par zone
    this.CH = 384;
    this.chunks = new Map();
    this.dirtyChunks = new Set();
  }

  chunkKey(x, z) {
    return Math.floor(x / this.CH) + ':' + Math.floor(z / this.CH);
  }

  chunk(key) {
    let C = this.chunks.get(key);
    if (!C) {
      C = { segs: new Set(), nodes: new Set(), meshes: [] };
      this.chunks.set(key, C);
    }
    return C;
  }

  flushChunks() {
    for (const key of this.dirtyChunks) this.rebuildChunk(key);
    this.dirtyChunks.clear();
  }

  rebuildChunk(key) {
    const C = this.chunks.get(key);
    if (!C) return;
    for (const m of C.meshes) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    C.meshes = [];
    const byType = new Map();
    for (const seg of C.segs) {
      if (!byType.has(seg.type)) byType.set(seg.type, []);
      byType.get(seg.type).push(seg);
    }
    for (const [type, segs] of byType) {
      const { geo, ranges } = mergeGeos(segs.map((sg) => sg.geo));
      const m = new THREE.Mesh(geo, this.mats[type]);
      m.receiveShadow = true;
      this.group.add(m);
      C.meshes.push(m);
      segs.forEach((sg, i) => {
        sg.range = { mesh: m, start: ranges[i][0], count: ranges[i][1] };
        if (sg.tint !== undefined && sg.tint !== null) this.applyTint(sg, sg.tint);
      });
    }
    if (C.nodes.size) {
      const { geo } = mergeGeos([...C.nodes].map((n) => n.geo));
      const m = new THREE.Mesh(geo, this.nodeMat);
      m.receiveShadow = true;
      this.group.add(m);
      C.meshes.push(m);
    }
    if (!C.segs.size && !C.nodes.size) this.chunks.delete(key);
  }

  // Ruban de chaussée d'un segment entre ses deux rognages
  ribbonGeometry(seg, s0, s1, type, opts = {}) {
    const net = this.net;
    const W = type.width;
    const h = W / 2;
    const c = type.carriage / 2;
    const P = this.textures[type.id].userData.period;
    const g = new Geo();
    // abscisses d'échantillonnage
    const ss = [s0];
    for (let i = 1; i < seg.cum.length - 1; i++) if (seg.cum[i] > s0 + 0.5 && seg.cum[i] < s1 - 0.5) ss.push(seg.cum[i]);
    ss.push(s1);
    const frames = ss.map((s) => {
      const p = net.pointAt(seg, s);
      const y = opts.flatY !== undefined ? opts.flatY : heightAt(p.x, p.z) + ROAD_Y;
      return { x: p.x, z: p.z, y, rx: -p.tz, rz: p.tx, v: s / P };
    });
    const at = (f, off, dy) => ({ x: f.x + f.rx * off, y: f.y + dy, z: f.z + f.rz * off });
    const uOf = (off) => (off + h) / W;
    const strip = (o0, dy0, o1, dy1, nrm) => {
      for (let i = 0; i < frames.length - 1; i++) {
        const f0 = frames[i];
        const f1 = frames[i + 1];
        const a = at(f0, o0, dy0);
        const b = at(f0, o1, dy1);
        const cc = at(f1, o1, dy1);
        const d = at(f1, o0, dy0);
        let n = nrm;
        if (nrm === 'r+') n = [f0.rx, 0, f0.rz];
        else if (nrm === 'r-') n = [-f0.rx, 0, -f0.rz];
        const u0 = uOf(o0);
        const u1 = uOf(o1);
        // ordre pour une face visible depuis le haut / depuis l'extérieur
        g.quad(a, b, cc, d, n, null, [
          [u0, f0.v],
          [u1, f0.v],
          [u1, f1.v],
          [u0, f1.v],
        ]);
      }
    };
    const up = [0, 1, 0];
    if (type.sidewalk && !opts.ghost) {
      const H = SIDEWALK_H;
      strip(-h, H, -c, H, up);
      strip(-c, H, -c + 0.001, 0, 'r+');
      strip(-c, 0, c, 0, up);
      strip(c - 0.001, 0, c, H, 'r-');
      strip(c, H, h, H, up);
      strip(-h, -0.9, -h, H, 'r-');
      strip(h, H, h, -0.9, 'r+');
    } else {
      strip(-h, 0, h, 0, up);
      if (!opts.ghost) {
        strip(-h, -0.9, -h, 0, 'r-');
        strip(h, 0, h, -0.9, 'r+');
      }
    }
    return g.build();
  }

  buildSeg(seg) {
    this.removeSeg(seg);
    const type = ROAD_TYPES[seg.type];
    const s0 = seg.trimA;
    const s1 = seg.len - seg.trimB;
    if (s1 - s0 < 0.2) return;
    const geo = this.ribbonGeometry(seg, s0, s1, type);
    if (!geo.attributes.color) geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
    seg.geo = geo;
    const mid = this.net.pointAt(seg, seg.len / 2);
    seg.chunkKey = this.chunkKey(mid.x, mid.z);
    this.chunk(seg.chunkKey).segs.add(seg);
    this.dirtyChunks.add(seg.chunkKey);
  }

  removeSeg(seg) {
    if (!seg.geo) return;
    const C = this.chunks.get(seg.chunkKey);
    if (C) C.segs.delete(seg);
    this.dirtyChunks.add(seg.chunkKey);
    seg.geo.dispose();
    seg.geo = null;
    seg.range = null;
  }

  removeNode(node) {
    if (!node.geo) return;
    const C = this.chunks.get(node.chunkKey);
    if (C) C.nodes.delete(node);
    this.dirtyChunks.add(node.chunkKey);
    node.geo.dispose();
    node.geo = null;
  }

  // Carrefour : enveloppe d'asphalte, trottoirs d'angle, passages piétons
  buildNode(node) {
    this.removeNode(node);
    const net = this.net;
    const segs = node.segs.map((id) => net.segs.get(id)).filter(Boolean);
    const k = segs.length;
    if (k === 0) return;
    const g = new Geo();
    const Y = (x, z, dy = 0) => heightAt(x, z) + ROAD_Y + 0.01 + dy;
    const P = (x, z, dy) => ({ x, z, y: Y(x, z, dy) });
    const ends = segs.map((seg) => {
      const type = ROAD_TYPES[seg.type];
      const atA = seg.a === node.id;
      const trim = atA ? seg.trimA : seg.trimB;
      const s = atA ? trim : seg.len - trim;
      const p = net.pointAt(seg, s);
      const dx = atA ? p.tx : -p.tx;
      const dz = atA ? p.tz : -p.tz;
      return { seg, type, atA, trim, s, x: p.x, z: p.z, dx, dz, rx: -dz, rz: dx, h: type.width / 2, c: type.carriage / 2, ang: Math.atan2(dz, dx) };
    });
    if (k === 1) {
      const e = ends[0];
      const rc = e.type.sidewalk ? e.c * 1.3 : e.c;
      const n = 28;
      const ctr = P(node.x, node.z);
      const ring = [];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        ring.push({ x: node.x + Math.cos(a) * rc, z: node.z + Math.sin(a) * rc });
      }
      for (let i = 0; i < n; i++) upTri(g, ctr, P(ring[i].x, ring[i].z), P(ring[i + 1].x, ring[i + 1].z), COL_ASPHALT);
      if (e.type.sidewalk) {
        const ro = rc + (e.h - e.c);
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2;
          const a1 = ((i + 1) / n) * Math.PI * 2;
          // ne pas recouvrir la chaussée qui arrive
          const mid = (a0 + a1) / 2;
          const dirx = Math.cos(mid);
          const dirz = Math.sin(mid);
          if (dirx * e.dx + dirz * e.dz > 0.55) continue;
          const i0 = P(node.x + Math.cos(a0) * rc, node.z + Math.sin(a0) * rc, SIDEWALK_H);
          const i1 = P(node.x + Math.cos(a1) * rc, node.z + Math.sin(a1) * rc, SIDEWALK_H);
          const o0 = P(node.x + Math.cos(a0) * ro, node.z + Math.sin(a0) * ro, SIDEWALK_H);
          const o1 = P(node.x + Math.cos(a1) * ro, node.z + Math.sin(a1) * ro, SIDEWALK_H);
          upTri(g, i0, o0, o1, COL_WALK);
          upTri(g, i0, o1, i1, COL_WALK);
          // bordure
          const b0 = P(node.x + Math.cos(a0) * rc, node.z + Math.sin(a0) * rc, 0);
          const b1 = P(node.x + Math.cos(a1) * rc, node.z + Math.sin(a1) * rc, 0);
          g.quad(b0, b1, i1, i0, [-Math.cos(mid), 0, -Math.sin(mid)], COL_CURB);
        }
      }
    } else {
      // enveloppe d'asphalte
      const corners = [];
      for (const e of ends) {
        corners.push({ x: e.x + e.rx * e.h, z: e.z + e.rz * e.h });
        corners.push({ x: e.x - e.rx * e.h, z: e.z - e.rz * e.h });
      }
      corners.push({ x: node.x, z: node.z });
      const hull = convexHull(corners);
      let cx = 0;
      let cz = 0;
      for (const q of hull) {
        cx += q.x;
        cz += q.z;
      }
      cx /= hull.length;
      cz /= hull.length;
      const ctr = P(cx, cz);
      for (let i = 0; i < hull.length; i++) {
        const a = hull[i];
        const b = hull[(i + 1) % hull.length];
        upTri(g, ctr, P(a.x, a.z), P(b.x, b.z), COL_ASPHALT);
      }
      // trottoirs d'angle entre segments voisins
      const sorted = ends.slice().sort((a, b) => a.ang - b.ang);
      for (let i = 0; i < sorted.length; i++) {
        const A = sorted[i];
        const B = sorted[(i + 1) % sorted.length];
        if (!A.type.sidewalk || !B.type.sidewalk) continue;
        let gap = B.ang - A.ang;
        if (gap <= 0) gap += Math.PI * 2;
        if (sorted.length === 1) continue;
        const Ci = { x: A.x + A.rx * A.c, z: A.z + A.rz * A.c };
        const Oi = { x: A.x + A.rx * A.h, z: A.z + A.rz * A.h };
        const Cj = { x: B.x - B.rx * B.c, z: B.z - B.rz * B.c };
        const Oj = { x: B.x - B.rx * B.h, z: B.z - B.rz * B.h };
        // courbe de bordure : contrôle à l'intersection des deux lignes de bordure
        let ctl = null;
        if (gap < Math.PI - 0.15) {
          const den = A.dx * B.dz - A.dz * B.dx;
          if (Math.abs(den) > 1e-4) {
            const qx = Cj.x - Ci.x;
            const qz = Cj.z - Ci.z;
            const t = (qx * B.dz - qz * B.dx) / den;
            ctl = { x: Ci.x + A.dx * t, z: Ci.z + A.dz * t };
            const d1 = Math.hypot(ctl.x - Ci.x, ctl.z - Ci.z);
            if (d1 > 60) ctl = null;
          }
        }
        const n = ctl ? 8 : 1;
        const inner = [];
        const outer = [];
        for (let j = 0; j <= n; j++) {
          const t = j / n;
          let ix;
          let iz;
          if (ctl) {
            const m = 1 - t;
            ix = m * m * Ci.x + 2 * m * t * ctl.x + t * t * Cj.x;
            iz = m * m * Ci.z + 2 * m * t * ctl.z + t * t * Cj.z;
          } else {
            ix = Ci.x + (Cj.x - Ci.x) * t;
            iz = Ci.z + (Cj.z - Ci.z) * t;
          }
          inner.push({ x: ix, z: iz });
          outer.push({ x: Oi.x + (Oj.x - Oi.x) * t, z: Oi.z + (Oj.z - Oi.z) * t });
        }
        for (let j = 0; j < n; j++) {
          const i0 = P(inner[j].x, inner[j].z, SIDEWALK_H);
          const i1 = P(inner[j + 1].x, inner[j + 1].z, SIDEWALK_H);
          const o0 = P(outer[j].x, outer[j].z, SIDEWALK_H);
          const o1 = P(outer[j + 1].x, outer[j + 1].z, SIDEWALK_H);
          upTri(g, i0, o0, o1, COL_WALK);
          upTri(g, i0, o1, i1, COL_WALK);
          const b0 = P(inner[j].x, inner[j].z, 0);
          const b1 = P(inner[j + 1].x, inner[j + 1].z, 0);
          const nx = -(inner[j + 1].z - inner[j].z);
          const nz = inner[j + 1].x - inner[j].x;
          const l = Math.hypot(nx, nz) || 1;
          g.quad(b0, b1, i1, i0, [nx / l, 0, nz / l], COL_CURB);
        }
      }
      // passages piétons
      if (k >= 3) {
        for (const e of ends) {
          if (!e.type.sidewalk) continue;
          const seg = e.seg;
          const sMid = e.atA ? e.trim + 2.2 : seg.len - e.trim - 2.2;
          if (sMid < 0 || sMid > seg.len) continue;
          const p = net.pointAt(seg, sMid);
          const tx = p.tx;
          const tz = p.tz;
          const rx = -tz;
          const rz = tx;
          for (let off = -e.c + 0.8; off <= e.c - 0.8; off += 1.1) {
            const a = { x: p.x + rx * (off - 0.27) - tx * 1.5, z: p.z + rz * (off - 0.27) - tz * 1.5 };
            const b = { x: p.x + rx * (off + 0.27) - tx * 1.5, z: p.z + rz * (off + 0.27) - tz * 1.5 };
            const c2 = { x: p.x + rx * (off + 0.27) + tx * 1.5, z: p.z + rz * (off + 0.27) + tz * 1.5 };
            const d = { x: p.x + rx * (off - 0.27) + tx * 1.5, z: p.z + rz * (off - 0.27) + tz * 1.5 };
            const pa = P(a.x, a.z, 0.02);
            const pb = P(b.x, b.z, 0.02);
            const pc = P(c2.x, c2.z, 0.02);
            const pd = P(d.x, d.z, 0.02);
            upTri(g, pa, pb, pc, COL_ZEBRA);
            upTri(g, pa, pc, pd, COL_ZEBRA);
          }
        }
      }
    }
    node.geo = g.build();
    node.chunkKey = this.chunkKey(node.x, node.z);
    this.chunk(node.chunkKey).nodes.add(node);
    this.dirtyChunks.add(node.chunkKey);
  }

  // Aperçu translucide pendant le tracé
  ghostMesh(seg, type, valid) {
    const geo = this.ribbonGeometry(seg, 0, seg.len, type, { ghost: true });
    const m = new THREE.Mesh(geo, valid ? this.ghostMat : this.ghostBad);
    m.renderOrder = 5;
    return m;
  }

  // Vue d'information : teinte des routes (trafic), par couleur de sommet dans le maillage regroupé
  setInfoTint(seg, color) {
    if (seg.tint === color) return;
    seg.tint = color;
    if (seg.range) this.applyTint(seg, color);
  }

  applyTint(seg, color) {
    const attr = seg.range.mesh.geometry.attributes.color;
    if (color === null) _tint.setRGB(1, 1, 1);
    else _tint.setHex(color);
    const end = seg.range.start + seg.range.count;
    for (let i = seg.range.start; i < end; i++) attr.setXYZ(i, _tint.r, _tint.g, _tint.b);
    attr.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Mobilier urbain instancié
function lampGeometry() {
  const parts = [];
  const pole = new THREE.CylinderGeometry(0.09, 0.13, 7.6, 6).translate(0, 3.8, 0);
  const arm = new THREE.BoxGeometry(0.1, 0.1, 1.9).translate(0, 7.45, -0.9);
  const head = new THREE.BoxGeometry(0.42, 0.16, 0.8).translate(0, 7.36, -1.75);
  parts.push(pole, arm, head);
  return mergeSimple(parts, 0x4a4f55);
}

function signalGeometry() {
  const pole = new THREE.CylinderGeometry(0.08, 0.1, 4.2, 6).translate(0, 2.1, 0);
  const box = new THREE.BoxGeometry(0.35, 1.0, 0.3).translate(0, 3.7, 0);
  return mergeSimple([pole, box], 0x2a2d31);
}

function mergeSimple(geos, hex) {
  const col = new THREE.Color(hex);
  let n = 0;
  const parts = geos.map((g) => g.toNonIndexed());
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const c = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    o += p.attributes.position.count;
  }
  for (let i = 0; i < n; i++) {
    c[i * 3] = col.r;
    c[i * 3 + 1] = col.g;
    c[i * 3 + 2] = col.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.computeBoundingSphere();
  return g;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,240,200,0.8)');
  grd.addColorStop(0.5, 'rgba(255,200,120,0.25)');
  grd.addColorStop(1, 'rgba(255,180,100,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Furniture {
  constructor(scene, meshes) {
    this.scene = scene;
    this.meshes = meshes;
    this.lampGeo = lampGeometry();
    this.signalGeo = signalGeometry();
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.lamps = null;
    this.signals = null;
    this.signalLamps = null;
    this.medianTrees = null;
    this.signalRefs = [];
    this.glowMat = new THREE.PointsMaterial({
      size: 16,
      map: glowTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xffd9a0,
      opacity: 0,
      sizeAttenuation: true,
    });
    this.glow = null;
    this.pools = null;
    const poolGeo = new THREE.PlaneGeometry(1, 1);
    poolGeo.rotateX(-Math.PI / 2);
    this.poolGeo = poolGeo;
    this.poolMat = new THREE.MeshBasicMaterial({
      map: poolTexture(),
      color: 0xffb468,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
    const lampHead = new THREE.SphereGeometry(0.22, 8, 6);
    this.signalLampGeo = lampHead;
    this.signalLampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.dirty = true;
  }

  rebuild(net, treeGeo) {
    const lamps = [];
    const glows = [];
    const pools = [];
    const trees = [];
    for (const seg of net.segs.values()) {
      const type = ROAD_TYPES[seg.type];
      const s0 = seg.trimA + 8;
      const s1 = seg.len - seg.trimB - 8;
      if (s1 <= s0) continue;
      if (type.sidewalk) {
        const step = 34;
        for (let s = s0; s <= s1; s += step) {
          for (const side of [1, -1]) {
            const ss = side === 1 ? s : s + step / 2;
            if (ss > s1) continue;
            const p = net.pointAt(seg, ss);
            const rx = -p.tz;
            const rz = p.tx;
            const off = type.width / 2 - 0.7;
            const x = p.x + rx * off * side;
            const z = p.z + rz * off * side;
            const y = heightAt(x, z) + ROAD_Y + 0.2;
            // le bras pointe vers la chaussée : -side*r
            const yaw = Math.atan2(rx * side, rz * side);
            lamps.push({ x, y, z, yaw });
            glows.push(x - rx * side * 1.75, y + 7.2, z - rz * side * 1.75);
            pools.push(x - rx * side * 3.2, y + 0.05, z - rz * side * 3.2, 24);
          }
        }
        if (type.trees) {
          for (let s = s0 + 4; s <= s1; s += 13) {
            const p = net.pointAt(seg, s);
            trees.push({ x: p.x, y: heightAt(p.x, p.z) + ROAD_Y, z: p.z, r: s * 1.7 });
          }
        }
      } else if (seg.type === 'highway') {
        for (let s = s0; s <= s1; s += 46) {
          const p = net.pointAt(seg, s);
          const y = heightAt(p.x, p.z) + ROAD_Y;
          const rx = -p.tz;
          const rz = p.tx;
          for (const side of [1, -1]) {
            lamps.push({ x: p.x, y, z: p.z, yaw: Math.atan2(-rx * side, -rz * side) });
            glows.push(p.x + rx * side * 1.75, y + 7.2, p.z + rz * side * 1.75);
            pools.push(p.x + rx * side * 6, y + 0.05, p.z + rz * side * 6, 26);
          }
        }
      }
    }
    this.lamps = this.instanced(this.lamps, this.lampGeo, this.mat, lamps.length, true);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const v = new THREE.Vector3();
    lamps.forEach((l, i) => {
      q.setFromAxisAngle(up, l.yaw);
      m.compose(v.set(l.x, l.y, l.z), q, one);
      this.lamps.setMatrixAt(i, m);
    });
    this.lamps.count = lamps.length;
    this.lamps.instanceMatrix.needsUpdate = true;
    this.lamps.computeBoundingSphere();

    if (this.glow) {
      this.scene.remove(this.glow);
      this.glow.geometry.dispose();
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(glows, 3));
    this.glow = new THREE.Points(gg, this.glowMat);
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 6;
    this.scene.add(this.glow);

    // halos de lumière au sol (visibles la nuit)
    const np = pools.length / 4;
    this.pools = this.instanced(this.pools, this.poolGeo, this.poolMat, np, false);
    this.pools.renderOrder = 4;
    this.pools.castShadow = false;
    for (let i = 0; i < np; i++) {
      const r = pools[i * 4 + 3];
      m.compose(v.set(pools[i * 4], pools[i * 4 + 1], pools[i * 4 + 2]), q.identity(), v.clone().set(r, 1, r));
      this.pools.setMatrixAt(i, m);
    }
    this.pools.count = np;
    this.pools.instanceMatrix.needsUpdate = true;
    this.pools.computeBoundingSphere();

    // arbres d'alignement
    if (treeGeo) {
      this.medianTrees = this.instanced(this.medianTrees, treeGeo, this.mat, trees.length, true);
      trees.forEach((t, i) => {
        q.setFromAxisAngle(up, t.r);
        m.compose(v.set(t.x, t.y, t.z), q, v.clone().set(0.8, 0.8, 0.8));
        this.medianTrees.setMatrixAt(i, m);
      });
      this.medianTrees.count = trees.length;
      this.medianTrees.instanceMatrix.needsUpdate = true;
      this.medianTrees.computeBoundingSphere();
    }

    // feux tricolores
    const sig = [];
    this.signalRefs = [];
    for (const node of net.nodes.values()) {
      if (!node.signal) continue;
      for (const sid of node.segs) {
        const seg = net.segs.get(sid);
        if (!seg) continue;
        const type = ROAD_TYPES[seg.type];
        const atA = seg.a === node.id;
        const trim = atA ? seg.trimA : seg.trimB;
        const s = atA ? trim : seg.len - trim;
        const p = net.pointAt(seg, s);
        const dx = atA ? p.tx : -p.tx;
        const dz = atA ? p.tz : -p.tz;
        // voies entrantes du côté -r (r = droite du sens sortant)
        const rx = -dz;
        const rz = dx;
        const off = type.carriage / 2 + 0.8;
        const x = p.x - rx * off;
        const z = p.z - rz * off;
        const y = heightAt(x, z) + ROAD_Y + 0.2;
        sig.push({ x, y, z, yaw: Math.atan2(dx, dz) });
        this.signalRefs.push({ node: node.id, seg: seg.id, x, y: y + 3.75, z, dx, dz });
      }
    }
    this.signals = this.instanced(this.signals, this.signalGeo, this.mat, sig.length, true);
    this.signalLamps = this.instanced(this.signalLamps, this.signalLampGeo, this.signalLampMat, sig.length, false);
    sig.forEach((s, i) => {
      q.setFromAxisAngle(up, s.yaw);
      m.compose(v.set(s.x, s.y, s.z), q, one);
      this.signals.setMatrixAt(i, m);
      m.compose(v.set(s.x + Math.sin(s.yaw) * 0.2, s.y + 3.75, s.z + Math.cos(s.yaw) * 0.2), q, one);
      this.signalLamps.setMatrixAt(i, m);
      this.signalLamps.setColorAt(i, new THREE.Color(0x30ff60));
    });
    this.signals.count = sig.length;
    this.signals.instanceMatrix.needsUpdate = true;
    this.signals.computeBoundingSphere();
    this.signalLamps.count = sig.length;
    this.signalLamps.instanceMatrix.needsUpdate = true;
    if (this.signalLamps.instanceColor) this.signalLamps.instanceColor.needsUpdate = true;
    this.signalLamps.computeBoundingSphere();
    this.dirty = false;
  }

  instanced(prev, geo, mat, n, shadow) {
    const cap = prev ? prev.userData.cap : 0;
    if (prev && n <= cap) return prev;
    if (prev) {
      this.scene.remove(prev);
      prev.dispose();
    }
    const newCap = Math.max(64, Math.ceil(n * 1.5));
    const m = new THREE.InstancedMesh(geo, mat, newCap);
    m.userData.cap = newCap;
    m.castShadow = shadow;
    m.receiveShadow = false;
    m.count = 0;
    this.scene.add(m);
    return m;
  }

  setNight(night) {
    this.glowMat.opacity = night * 0.95;
    this.glow && (this.glow.visible = night > 0.02);
    this.poolMat.opacity = night * 0.55;
    if (this.pools) this.pools.visible = night > 0.02;
  }

  setSignalColor(i, color) {
    if (!this.signalLamps || i >= this.signalLamps.count) return;
    this.signalLamps.setColorAt(i, color);
  }
}
