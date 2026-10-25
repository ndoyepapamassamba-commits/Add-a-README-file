// Cases de zonage (8 m, 4 rangées) générées des deux côtés des routes, pinceaux, remplissage.
import * as THREE from 'three';
import { G } from './state.js';
import { ROAD_TYPES, CELL, ZONE_DEPTH, WATER_LEVEL, ZONES } from './config.js';
import { heightAt, inBuildArea } from './terrain.js';
import { SpatialHash, closestOnPolyline } from './util.js';

const keyOf = (seg, side, col, row) => seg + '|' + side + '|' + col + '|' + row;

function cellTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.42)';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 4;
  g.strokeRect(3, 3, 58, 58);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Zones {
  constructor(scene) {
    this.scene = scene;
    this.cells = new Map();
    this.nextId = 1;
    this.hash = new SpatialHash(16);
    this.bySeg = new Map();
    this.key = new Map();
    this.showAll = false;
    this.dirty = true;
    this.version = 0;
    this.freeCache = null;
    this.freeVersion = -1;
    const geo = new THREE.PlaneGeometry(7.3, 7.3);
    geo.rotateX(-Math.PI / 2);
    this.geo = geo;
    this.mat = new THREE.MeshBasicMaterial({
      map: cellTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -6,
    });
    this.mesh = null;
    this.cap = 0;
    this.colors = ZONES.map((z) => (z ? new THREE.Color(z.color) : new THREE.Color(0xffffff)));
    G.on('seg:added', (seg) => this.onSegAdded(seg));
    G.on('seg:removed', (seg) => this.onSegRemoved(seg));
    G.on('seg:split', (e) => this.onSplit(e));
    G.on('seg:replaced', (e) => this.onReplaced(e));
  }

  // ------------------------------------------------------------ gestion des cases
  addCell(data) {
    const c = { id: data.id || this.nextId++, seg: data.seg, side: data.side, col: data.col, row: data.row, s: data.s, x: data.x, z: data.z, ux: data.ux, uz: data.uz, zone: data.zone || 0, bld: 0 };
    if (data.id && data.id >= this.nextId) this.nextId = data.id + 1;
    c.y = heightAt(c.x, c.z);
    c.vx = -c.uz * c.side;
    c.vz = c.ux * c.side;
    this.cells.set(c.id, c);
    this.hash.insertPoint(c, c.x, c.z, 0);
    this.key.set(keyOf(c.seg, c.side, c.col, c.row), c);
    let set = this.bySeg.get(c.seg);
    if (!set) {
      set = new Set();
      this.bySeg.set(c.seg, set);
    }
    set.add(c);
    this.touch();
    return c;
  }

  removeCell(c, demolish = true) {
    if (!this.cells.has(c.id)) return;
    if (c.bld && demolish && G.buildings) G.buildings.demolish(c.bld, { silent: true });
    this.cells.delete(c.id);
    this.hash.remove(c);
    this.key.delete(keyOf(c.seg, c.side, c.col, c.row));
    const set = this.bySeg.get(c.seg);
    if (set) {
      set.delete(c);
      if (!set.size) this.bySeg.delete(c.seg);
    }
    this.touch();
  }

  reassign(c, segId, s, side, col) {
    this.key.delete(keyOf(c.seg, c.side, c.col, c.row));
    const set = this.bySeg.get(c.seg);
    if (set) {
      set.delete(c);
      if (!set.size) this.bySeg.delete(c.seg);
    }
    c.seg = segId;
    c.s = s;
    if (side !== undefined) {
      c.side = side;
      c.col = col;
      c.ux = -c.ux;
      c.uz = -c.uz;
      c.vx = -c.uz * c.side;
      c.vz = c.ux * c.side;
    }
    this.key.set(keyOf(c.seg, c.side, c.col, c.row), c);
    let s2 = this.bySeg.get(segId);
    if (!s2) {
      s2 = new Set();
      this.bySeg.set(segId, s2);
    }
    s2.add(c);
    this.touch();
  }

  touch() {
    this.dirty = true;
    this.version++;
  }

  get(segId, side, col, row) {
    return this.key.get(keyOf(segId, side, col, row));
  }

  // Une case à cette position est-elle constructible ?
  cellValid(x, z, ignore) {
    if (!inBuildArea(x, z)) return false;
    const h = heightAt(x, z);
    if (h < WATER_LEVEL + 0.9) return false;
    const e = 3.6;
    const hs = [heightAt(x + e, z + e), heightAt(x - e, z + e), heightAt(x + e, z - e), heightAt(x - e, z - e)];
    if (Math.max(...hs) - Math.min(...hs) > 2.6) return false;
    if (Math.min(...hs) < WATER_LEVEL + 0.5) return false;
    const net = G.roads;
    for (const seg of net.segHash.queryRadius(x, z, 26)) {
      const w = ROAD_TYPES[seg.type].width / 2;
      const pr = closestOnPolyline(seg.pts, seg.cum, x, z);
      if (pr.d < w + 3.55) return false;
    }
    for (const c of this.hash.queryRadius(x, z, 8)) {
      if (c === ignore) continue;
      if ((c.x - x) ** 2 + (c.z - z) ** 2 < 6.9 * 6.9) return false;
    }
    if (G.buildings && G.buildings.pointBlocked(x, z, 3.4)) return false;
    return true;
  }

  generate(seg) {
    const type = ROAD_TYPES[seg.type];
    if (!type.zoning) return;
    const net = G.roads;
    const h = type.width / 2;
    const n = Math.floor(seg.len / CELL);
    if (n < 1) return;
    const off = (seg.len - n * CELL) / 2;
    for (const side of [1, -1]) {
      for (let col = 0; col < n; col++) {
        const s = off + (col + 0.5) * CELL;
        const p = net.pointAt(seg, s);
        const rx = -p.tz * side;
        const rz = p.tx * side;
        for (let row = 0; row < ZONE_DEPTH; row++) {
          const existing = this.key.get(keyOf(seg.id, side, col, row));
          if (existing) continue;
          const d = h + CELL / 2 + row * CELL;
          const x = p.x + rx * d;
          const z = p.z + rz * d;
          if (!this.cellValid(x, z)) break;
          this.addCell({ seg: seg.id, side, col, row, s, x, z, ux: p.tx, uz: p.tz });
        }
      }
    }
  }

  // ------------------------------------------------------------ événements routiers
  clearAlong(seg) {
    const w = ROAD_TYPES[seg.type].width / 2 + 3.55;
    const b = seg.bbox;
    for (const c of this.hash.query(b.minx - 4, b.minz - 4, b.maxx + 4, b.maxz + 4)) {
      if (closestOnPolyline(seg.pts, seg.cum, c.x, c.z).d < w) this.removeCell(c, true);
    }
  }

  onSegAdded(seg) {
    this.clearAlong(seg);
    this.generate(seg);
  }

  onSegRemoved(seg) {
    const set = this.bySeg.get(seg.id);
    if (set) for (const c of [...set]) this.removeCell(c, false);
    // les cases bloquées par cette route peuvent réapparaître
    const b = seg.bbox;
    for (const other of G.roads.segHash.query(b.minx - 40, b.minz - 40, b.maxx + 40, b.maxz + 40)) {
      if (other !== seg && !other.dead) this.generate(other);
    }
  }

  onSplit({ old, s1, s2, at }) {
    const set = this.bySeg.get(old.id);
    if (!set) return;
    for (const c of [...set]) {
      if (c.s < at) this.reassign(c, s1.id, c.s);
      else this.reassign(c, s2.id, c.s - at);
    }
  }

  onReplaced({ old, seg, reversed }) {
    const set = this.bySeg.get(old.id);
    const type = ROAD_TYPES[seg.type];
    if (set) {
      for (const c of [...set]) {
        if (!type.zoning) {
          this.removeCell(c, false);
          continue;
        }
        if (reversed) this.reassign(c, seg.id, seg.len - c.s, -c.side, -c.col);
        else this.reassign(c, seg.id, c.s);
      }
    }
    // largeur modifiée : retirer ce qui chevauche, compléter le reste
    this.clearAlong(seg);
    this.generate(seg);
  }

  // ------------------------------------------------------------ pinceaux
  paint(x, z, radius, zone) {
    let n = 0;
    for (const c of this.hash.queryRadius(x, z, radius)) {
      if ((c.x - x) ** 2 + (c.z - z) ** 2 > radius * radius) continue;
      if (c.zone === zone) continue;
      if (c.bld && G.buildings) {
        const b = G.buildings.get(c.bld);
        if (b && b.zone !== zone) G.buildings.demolish(c.bld, { silent: true });
      }
      c.zone = zone;
      n++;
    }
    if (n) this.touch();
    return n;
  }

  nearestCell(x, z, r = 6) {
    let best = null;
    let bd = r * r;
    for (const c of this.hash.queryRadius(x, z, r)) {
      const d = (c.x - x) ** 2 + (c.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  fill(x, z, zone) {
    const start = this.nearestCell(x, z, 6);
    if (!start) return 0;
    const from = start.zone;
    if (from === zone) return 0;
    const seen = new Set([start]);
    const queue = [start];
    let n = 0;
    while (queue.length && n < 2000) {
      const c = queue.shift();
      if (c.bld && G.buildings) {
        const b = G.buildings.get(c.bld);
        if (b && b.zone !== zone) G.buildings.demolish(c.bld, { silent: true });
      }
      c.zone = zone;
      n++;
      for (const o of this.hash.queryRadius(c.x, c.z, 9)) {
        if (seen.has(o) || o.zone !== from) continue;
        if ((o.x - c.x) ** 2 + (o.z - c.z) ** 2 > 9.2 * 9.2) continue;
        seen.add(o);
        queue.push(o);
      }
    }
    this.touch();
    return n;
  }

  // ------------------------------------------------------------ croissance
  // Cases de façade libres d'une zone, reliées à l'extérieur
  freeFront(zone) {
    if (this.freeVersion !== this.version || !this.freeCache) {
      this.freeCache = {};
      for (let z = 1; z <= 6; z++) this.freeCache[z] = [];
      for (const c of this.cells.values()) {
        if (!c.zone || c.bld || c.row !== 0) continue;
        this.freeCache[c.zone].push(c);
      }
      this.freeVersion = this.version;
    }
    return this.freeCache[zone];
  }

  zonedFreeCount() {
    let n = 0;
    for (const c of this.cells.values()) if (c.zone && !c.bld) n++;
    return n;
  }

  // Cherche une empreinte w x d contenant la case donnée (même segment, même côté)
  tryFootprint(cell, w, d) {
    const starts = [];
    for (let c0 = cell.col - w + 1; c0 <= cell.col; c0++) starts.push(c0);
    for (let i = starts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [starts[i], starts[j]] = [starts[j], starts[i]];
    }
    for (const c0 of starts) {
      const cells = [];
      let ok = true;
      for (let col = c0; col < c0 + w && ok; col++) {
        for (let row = 0; row < d; row++) {
          const c = this.key.get(keyOf(cell.seg, cell.side, col, row));
          if (!c || c.zone !== cell.zone || c.bld) {
            ok = false;
            break;
          }
          cells.push(c);
        }
      }
      if (!ok) continue;
      const first = this.key.get(keyOf(cell.seg, cell.side, c0, 0));
      const last = this.key.get(keyOf(cell.seg, cell.side, c0 + w - 1, 0));
      if (first.ux * last.ux + first.uz * last.uz < 0.985) continue;
      return cells;
    }
    return null;
  }

  // ------------------------------------------------------------ rendu
  update() {
    if (!this.dirty) return;
    this.dirty = false;
    const list = [];
    for (const c of this.cells.values()) {
      if (this.showAll || (c.zone && !c.bld)) list.push(c);
    }
    if (!this.mesh || list.length > this.cap) {
      if (this.mesh) {
        this.scene.remove(this.mesh);
        this.mesh.dispose();
      }
      this.cap = Math.max(256, Math.ceil(list.length * 1.4));
      this.mesh = new THREE.InstancedMesh(this.geo, this.mat, this.cap);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 3;
      this.scene.add(this.mesh);
    }
    const m = new THREE.Matrix4();
    const ax = new THREE.Vector3();
    const ay = new THREE.Vector3();
    const az = new THREE.Vector3();
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const e = 3.6;
      const hu = heightAt(c.x + c.ux * e, c.z + c.uz * e) - heightAt(c.x - c.ux * e, c.z - c.uz * e);
      const hv = heightAt(c.x + c.vx * e, c.z + c.vz * e) - heightAt(c.x - c.vx * e, c.z - c.vz * e);
      ax.set(c.ux, hu / (2 * e), c.uz).normalize();
      az.set(c.vx, hv / (2 * e), c.vz).normalize();
      ay.crossVectors(az, ax).normalize();
      m.makeBasis(ax, ay, az);
      m.setPosition(c.x, c.y + 0.28, c.z);
      this.mesh.setMatrixAt(i, m);
      const col = c.zone ? this.colors[c.zone] : this.colors[0];
      this.mesh.setColorAt(i, col);
    }
    this.mesh.count = list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  setShowAll(v) {
    if (this.showAll !== v) {
      this.showAll = v;
      this.dirty = true;
    }
  }

  serialize() {
    const r = (v) => Math.round(v * 100) / 100;
    return [...this.cells.values()].map((c) => [c.id, c.seg, c.side, c.col, c.row, r(c.s), r(c.x), r(c.z), r(c.ux), r(c.uz), c.zone]);
  }

  load(arr) {
    for (const [id, seg, side, col, row, s, x, z, ux, uz, zone] of arr) this.addCell({ id, seg, side, col, row, s, x, z, ux, uz, zone });
  }

  clear() {
    for (const c of [...this.cells.values()]) this.removeCell(c, false);
    this.nextId = 1;
  }
}
