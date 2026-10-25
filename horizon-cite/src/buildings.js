// Gestion des bâtiments : création (zones et services), chantiers, niveaux, abandon, ruines,
// collisions, raccordement à la route, vues d'information, sauvegarde.
import * as THREE from 'three';
import { G } from './state.js';
import { SERVICE_BY_ID, ROAD_TYPES, ZONES } from './config.js';
import { genZoneBuilding, genService, genRotor, genCrane, BGeo, PAL } from './buildgen.js';
import { MATS, infoMaterial } from './materials.js';
import { heightAt } from './terrain.js';
import { SpatialHash, obbOverlap, distToObb, obbCorners, mulberry32 } from './util.js';
import { buildingName } from './names.js';

const VARIANTS = 6;

export class Buildings {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'buildings';
    scene.add(this.group);
    this.list = new Map();
    this.nextId = 1;
    this.hash = new SpatialHash(32);
    this.bySeg = new Map();
    this.geoCache = new Map();
    this.rotorGeo = genRotor();
    this.padGeo = new THREE.BoxGeometry(1, 1, 1);
    this.padMat = new THREE.MeshLambertMaterial({ color: 0x8a6d4c });
    this.craneCache = new Map();
    this.ruinCache = new Map();
    this.uniques = new Set();
    this.infoFn = null;
    this.highlighted = null;
    this.version = 0;
    G.on('seg:split', (e) => this.onSplit(e));
    G.on('seg:removed', (seg) => this.onSegRemoved(seg));
    G.on('seg:replaced', (e) => this.onReplaced(e));
  }

  get(id) {
    return this.list.get(id);
  }

  // ---------------------------------------------------------------- géométries
  zoneGeo(zone, level, w, d, seed) {
    const v = seed % VARIANTS;
    const key = `${zone}|${level}|${w}|${d}|${v}`;
    let e = this.geoCache.get(key);
    if (!e) {
      e = genZoneBuilding(zone, level, w, d, 1000 + v * 7919 + zone * 31 + level * 101 + w * 13 + d * 17);
      this.geoCache.set(key, e);
    }
    return e;
  }

  serviceGeo(defId) {
    const key = 'svc|' + defId;
    let e = this.geoCache.get(key);
    if (!e) {
      const def = SERVICE_BY_ID[defId];
      e = genService(defId, def.w, def.d, 4242 + defId.length * 77);
      this.geoCache.set(key, e);
    }
    return e;
  }

  ruinGeo(W, D) {
    const key = W + 'x' + D;
    let g = this.ruinCache.get(key);
    if (!g) {
      const b = new BGeo();
      const r = mulberry32(W * 31 + D);
      b.lot(W, D, PAL.earth, PAL.earth);
      for (let i = 0; i < 10; i++) {
        const x = (r() - 0.5) * (W - 4);
        const z = (r() - 0.5) * (D - 4);
        const s = 1 + r() * 3;
        b.box(x - s, 0.1, z - s * 0.7, x + s, 0.1 + r() * 2.4, z + s * 0.7, r() < 0.5 ? PAL.black : PAL.darker);
      }
      g = b.build();
      this.ruinCache.set(key, g);
    }
    return g;
  }

  craneGeo(h) {
    const k = Math.round(h / 10) * 10;
    let g = this.craneCache.get(k);
    if (!g) {
      g = genCrane(k);
      this.craneCache.set(k, g);
    }
    return g;
  }

  // ---------------------------------------------------------------- création
  makeRecord(o) {
    const b = {
      id: o.id || this.nextId++,
      kind: o.kind,
      zone: o.zone || 0,
      defId: o.defId || null,
      def: o.defId ? SERVICE_BY_ID[o.defId] : null,
      level: o.level || 1,
      w: o.w || 0,
      d: o.d || 0,
      W: o.W,
      D: o.D,
      x: o.x,
      z: o.z,
      vx: o.vx,
      vz: o.vz,
      seg: o.seg || 0,
      s: o.s || 0,
      side: o.side || 1,
      cells: o.cells || [],
      seed: o.seed === undefined ? Math.floor(Math.random() * 1e9) : o.seed,
      state: o.state || 'active',
      progress: 1,
      buildTime: 1,
      mesh: null,
      pad: null,
      crane: null,
      rotor: null,
      smoke: [],
      // simulation
      cap: 0,
      occ: 0,
      happy: 60,
      lv: 15,
      edu: 0,
      power: true,
      water: true,
      sewage: true,
      garbage: 0,
      crime: 0,
      sick: 0,
      dead: 0,
      fireT: 0,
      t: {},
      problem: null,
      upT: 0,
      busy: 0,
      stock: 0,
      age: 0,
    };
    if (o.id && o.id >= this.nextId) this.nextId = o.id + 1;
    if (b.id >= this.nextId) this.nextId = b.id + 1;
    b.ax = b.vz;
    b.az = -b.vx;
    b.yaw = Math.atan2(b.vx, b.vz);
    b.hw = b.W / 2;
    b.hd = b.D / 2;
    b.obb = { x: b.x, z: b.z, ax: b.ax, az: b.az, hw: b.hw, hd: b.hd };
    let y = heightAt(b.x, b.z);
    for (const c of obbCorners({ ...b.obb, hw: b.hw * 0.85, hd: b.hd * 0.85 })) y = Math.max(y, heightAt(c.x, c.z));
    b.y = y;
    b.name = b.kind === 'zone' ? buildingName(b.zone, b.seed) : b.def.name;
    return b;
  }

  register(b) {
    this.list.set(b.id, b);
    const r = Math.hypot(b.hw, b.hd);
    this.hash.insertPoint(b, b.x, b.z, r);
    this.linkSeg(b, b.seg);
    if (b.def && b.def.unique) this.uniques.add(b.defId);
    this.version++;
  }

  linkSeg(b, segId) {
    if (b.seg) {
      const set = this.bySeg.get(b.seg);
      if (set) {
        set.delete(b.id);
        if (!set.size) this.bySeg.delete(b.seg);
      }
    }
    b.seg = segId;
    if (segId) {
      let set = this.bySeg.get(segId);
      if (!set) {
        set = new Set();
        this.bySeg.set(segId, set);
      }
      set.add(b.id);
    }
  }

  // Bâtiment de zone sur un ensemble de cases (même segment, même côté)
  spawnZone(cells, zone, opts = {}) {
    const cols = [...new Set(cells.map((c) => c.col))];
    const w = cols.length;
    const d = cells.length / w;
    let x = 0;
    let z = 0;
    let ux = 0;
    let uz = 0;
    let s = 0;
    let nf = 0;
    for (const c of cells) {
      x += c.x;
      z += c.z;
      if (c.row === 0) {
        ux += c.ux;
        uz += c.uz;
        s += c.s;
        nf++;
      }
    }
    x /= cells.length;
    z /= cells.length;
    const ul = Math.hypot(ux, uz) || 1;
    ux /= ul;
    uz /= ul;
    const side = cells[0].side;
    const vx = -uz * side;
    const vz = ux * side;
    const b = this.makeRecord({
      kind: 'zone',
      zone,
      level: opts.level || 1,
      w,
      d,
      W: w * 8,
      D: d * 8,
      x,
      z,
      vx,
      vz,
      seg: cells[0].seg,
      s: s / nf,
      side,
      cells: cells.map((c) => c.id),
      seed: opts.seed,
      id: opts.id,
    });
    for (const c of cells) c.bld = b.id;
    G.zones.touch();
    this.register(b);
    if (opts.instant) {
      b.state = 'active';
      b.progress = 1;
    } else {
      b.state = 'building';
      b.progress = 0;
      b.buildTime = 6 + b.level * 1.5 + w * d * 0.35;
    }
    this.buildMesh(b);
    if (G.trees) G.trees.removeWhere(b.x - b.hw - 4, b.z - b.hd - 4, b.x + b.hw + 4, b.z + b.hd + 4, (t) => distToObb(b.obb, t.x, t.z) < 1.5);
    G.emit('bld:added', b);
    return b;
  }

  // Bâtiment de service posé par le joueur
  placeService(defId, x, z, vx, vz, seg, s, side, opts = {}) {
    const def = SERVICE_BY_ID[defId];
    const b = this.makeRecord({ kind: 'service', defId, W: def.w, D: def.d, x, z, vx, vz, seg, s, side, seed: opts.seed, id: opts.id, level: 1 });
    this.register(b);
    // retirer les cases de zonage recouvertes
    for (const c of G.zones.hash.queryRadius(x, z, Math.hypot(b.hw, b.hd) + 6)) {
      if (distToObb(b.obb, c.x, c.z) < 3.6) G.zones.removeCell(c, true);
    }
    b.state = 'active';
    b.progress = opts.instant ? 1 : 0;
    b.buildTime = 0.7;
    b.rising = !opts.instant;
    this.buildMesh(b);
    if (G.trees) G.trees.removeWhere(b.x - b.hw - 4, b.z - b.hd - 4, b.x + b.hw + 4, b.z + b.hd + 4, (t) => distToObb(b.obb, t.x, t.z) < 2);
    G.emit('bld:added', b);
    return b;
  }

  buildMesh(b) {
    this.disposeMesh(b);
    let geoInfo;
    if (b.state === 'burned') geoInfo = { geo: this.ruinGeo(b.W, b.D), height: 3, smoke: [] };
    else if (b.kind === 'zone') geoInfo = this.zoneGeo(b.zone, b.level, b.w, b.d, b.seed);
    else geoInfo = this.serviceGeo(b.defId);
    b.height = geoInfo.height;
    b.smoke = geoInfo.smoke;
    const mat = this.baseMaterial(b);
    const m = new THREE.Mesh(geoInfo.geo, mat);
    m.position.set(b.x, b.y, b.z);
    m.rotation.y = b.yaw;
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.bid = b.id;
    b.mesh = m;
    this.group.add(m);
    if (b.defId === 'wind') {
      const rot = new THREE.Mesh(this.rotorGeo, mat);
      rot.position.set(0, 53.7, -2.7);
      rot.castShadow = true;
      m.add(rot);
      b.rotor = rot;
      b.rotSpeed = 1.2 + Math.random() * 0.6;
    }
    if (b.state === 'building') {
      const pad = new THREE.Mesh(this.padGeo, this.padMat);
      pad.scale.set(b.W - 1, 0.4, b.D - 1);
      pad.position.set(b.x, b.y, b.z);
      pad.rotation.y = b.yaw;
      pad.receiveShadow = true;
      b.pad = pad;
      this.group.add(pad);
      if (b.height > 22) {
        const cr = new THREE.Mesh(this.craneGeo(b.height + 10), MATS.city);
        cr.position.set(b.x + b.ax * (b.hw + 2), b.y, b.z + b.az * (b.hw + 2));
        cr.rotation.y = Math.random() * Math.PI * 2;
        cr.castShadow = true;
        b.crane = cr;
        this.group.add(cr);
      }
      m.scale.y = 0.02;
    } else if (b.rising) m.scale.y = 0.05;
  }

  disposeMesh(b) {
    for (const k of ['mesh', 'pad', 'crane']) {
      if (b[k]) {
        this.group.remove(b[k]);
        b[k] = null;
      }
    }
    b.rotor = null;
  }

  baseMaterial(b) {
    if (this.infoFn) return infoMaterial(this.infoFn(b));
    if (b.state === 'abandoned' || b.state === 'burned') return MATS.abandoned;
    return MATS.city;
  }

  refreshMaterial(b) {
    if (!b.mesh) return;
    const m = this === null ? null : this.highlighted === b ? (this.highlightMat || MATS.highlight) : this.baseMaterial(b);
    b.mesh.material = m;
    if (b.rotor) b.rotor.material = m;
  }

  setHighlight(b, mat) {
    const prev = this.highlighted;
    this.highlighted = b;
    this.highlightMat = mat;
    if (prev && prev !== b) this.refreshMaterial(prev);
    if (b) this.refreshMaterial(b);
  }

  setInfoFn(fn) {
    this.infoFn = fn;
    for (const b of this.list.values()) this.refreshMaterial(b);
  }

  setLevel(b, level) {
    b.level = level;
    b.state = 'active';
    b.rising = true;
    b.progress = 0;
    b.buildTime = 1.2;
    this.buildMesh(b);
    this.version++;
    G.emit('bld:level', b);
  }

  abandon(b) {
    if (b.state === 'abandoned') return;
    b.state = 'abandoned';
    b.occ = 0;
    b.t.aband = 0;
    this.refreshMaterial(b);
    if (G.fx) G.fx.removeEmitters(b);
    this.version++;
    G.emit('bld:abandoned', b);
  }

  burnDown(b) {
    b.state = 'burned';
    b.occ = 0;
    b.fireT = 0;
    b.t.aband = 0;
    if (G.fx) G.fx.removeEmitters(b);
    this.buildMesh(b);
    this.version++;
    G.emit('bld:burned', b);
  }

  demolish(id, opts = {}) {
    const b = this.list.get(id);
    if (!b) return null;
    this.disposeMesh(b);
    for (const cid of b.cells) {
      const c = G.zones.cells.get(cid);
      if (c && c.bld === b.id) c.bld = 0;
    }
    G.zones.touch();
    this.hash.remove(b);
    this.linkSeg(b, 0);
    this.list.delete(id);
    if (b.def && b.def.unique) this.uniques.delete(b.defId);
    if (this.highlighted === b) this.highlighted = null;
    if (G.fx) {
      G.fx.removeEmitters(b);
      if (!opts.quiet) G.fx.dust(b.x, b.y, b.z, Math.max(b.hw, b.hd));
    }
    // les cases libérées par un bâtiment de service peuvent être regénérées
    if (b.kind === 'service' && G.roads) {
      for (const seg of G.roads.segHash.queryRadius(b.x, b.z, Math.hypot(b.hw, b.hd) + 40)) G.zones.generate(seg);
    }
    this.version++;
    G.emit('bld:removed', b);
    return b;
  }

  // ---------------------------------------------------------------- collisions
  pointBlocked(x, z, r) {
    for (const b of this.hash.queryRadius(x, z, r + 60)) {
      if (b.kind !== 'service') continue;
      if (distToObb(b.obb, x, z) < r) return true;
    }
    return false;
  }

  obbBlocked(obb) {
    for (const b of this.hash.queryRadius(obb.x, obb.z, Math.hypot(obb.hw, obb.hd) + 60)) {
      if (obbOverlap(obb, b.obb, 0.6)) return b;
    }
    return null;
  }

  collideCorridor(pts, half) {
    let minx = Infinity;
    let minz = Infinity;
    let maxx = -Infinity;
    let maxz = -Infinity;
    for (const p of pts) {
      minx = Math.min(minx, p.x);
      maxx = Math.max(maxx, p.x);
      minz = Math.min(minz, p.z);
      maxz = Math.max(maxz, p.z);
    }
    const res = { blocked: '', demolish: [] };
    for (const b of this.hash.query(minx - half - 40, minz - half - 40, maxx + half + 40, maxz + half + 40)) {
      let hit = false;
      for (const p of pts) {
        if (distToObb(b.obb, p.x, p.z) < half - 0.4) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
      if (b.kind === 'service') {
        res.blocked = 'Un bâtiment est sur le chemin';
        return res;
      }
      res.demolish.push(b.id);
    }
    return res;
  }

  at(x, z) {
    let best = null;
    for (const b of this.hash.queryRadius(x, z, 4)) {
      if (distToObb(b.obb, x, z) < 0.5) {
        if (!best || b.height > best.height) best = b;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- routes
  onSplit({ old, s1, s2, at }) {
    const set = this.bySeg.get(old.id);
    if (!set) return;
    for (const id of [...set]) {
      const b = this.list.get(id);
      if (!b) continue;
      if (b.s < at) this.linkSeg(b, s1.id);
      else {
        this.linkSeg(b, s2.id);
        b.s -= at;
      }
    }
  }

  onReplaced({ old, seg, reversed }) {
    const set = this.bySeg.get(old.id);
    if (!set) return;
    for (const id of [...set]) {
      const b = this.list.get(id);
      if (!b) continue;
      this.linkSeg(b, seg.id);
      if (reversed) {
        b.s = seg.len - b.s;
        b.side = -b.side;
      }
    }
  }

  onSegRemoved(seg) {
    const set = this.bySeg.get(seg.id);
    if (!set) return;
    for (const id of [...set]) {
      const b = this.list.get(id);
      if (!b) continue;
      this.linkSeg(b, 0);
      b.cells = b.cells.filter((cid) => G.zones.cells.has(cid));
      this.reattach(b);
    }
  }

  // Cherche une route devant la façade
  reattach(b) {
    const fx = b.x - b.vx * b.hd;
    const fz = b.z - b.vz * b.hd;
    const hit = G.roads.nearestSeg(fx, fz, 26, (s) => s.type !== 'highway' && !s.dead);
    if (hit) {
      b.s = hit.s;
      b.side = hit.side;
      this.linkSeg(b, hit.seg.id);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- animation
  update(realDt, simDt) {
    for (const b of this.list.values()) {
      if (b.state === 'building') {
        b.progress += simDt / b.buildTime;
        const p = Math.min(1, b.progress);
        if (b.mesh) b.mesh.scale.y = 0.02 + 0.98 * (p < 0.7 ? p * 0.35 / 0.7 : 0.35 + ((p - 0.7) / 0.3) * 0.65);
        if (b.crane) b.crane.rotation.y += realDt * 0.15;
        if (b.progress >= 1) {
          b.state = 'active';
          b.mesh.scale.y = 1;
          if (b.pad) this.group.remove(b.pad);
          if (b.crane) this.group.remove(b.crane);
          b.pad = null;
          b.crane = null;
          this.version++;
          G.emit('bld:completed', b);
        }
      } else if (b.rising) {
        b.progress += realDt / b.buildTime;
        const p = Math.min(1, b.progress);
        const e = 1 - Math.pow(1 - p, 3);
        if (b.mesh) b.mesh.scale.y = 0.05 + 0.95 * e;
        if (p >= 1) b.rising = false;
      }
      if (b.rotor && b.state === 'active') b.rotor.rotation.z += realDt * b.rotSpeed * (b.power === false ? 0.2 : 1);
    }
  }

  // ---------------------------------------------------------------- sauvegarde
  serialize() {
    const r = (v) => Math.round(v * 100) / 100;
    return [...this.list.values()].map((b) => ({
      id: b.id,
      k: b.kind === 'zone' ? 0 : 1,
      zo: b.zone,
      df: b.defId,
      lv: b.level,
      w: b.w,
      d: b.d,
      x: r(b.x),
      z: r(b.z),
      vx: r(b.vx),
      vz: r(b.vz),
      sg: b.seg,
      s: r(b.s),
      sd: b.side,
      c: b.cells,
      sd2: b.seed,
      st: b.state,
      oc: r(b.occ),
      g: r(b.garbage),
      cr: r(b.crime),
      ed: r(b.edu),
      h: r(b.happy),
      dd: b.dead,
      sk: b.sick,
      stk: r(b.stock || 0),
      ag: r(b.age || 0),
    }));
  }

  load(arr) {
    for (const o of arr) {
      let b;
      if (o.k === 0) {
        const cells = o.c.map((id) => G.zones.cells.get(id)).filter(Boolean);
        if (!cells.length) continue;
        b = this.makeRecord({ kind: 'zone', zone: o.zo, level: o.lv, w: o.w, d: o.d, W: o.w * 8, D: o.d * 8, x: o.x, z: o.z, vx: o.vx, vz: o.vz, seg: o.sg, s: o.s, side: o.sd, cells: o.c, seed: o.sd2, id: o.id });
        for (const c of cells) c.bld = b.id;
      } else {
        const def = SERVICE_BY_ID[o.df];
        if (!def) continue;
        b = this.makeRecord({ kind: 'service', defId: o.df, W: def.w, D: def.d, x: o.x, z: o.z, vx: o.vx, vz: o.vz, seg: o.sg, s: o.s, side: o.sd, seed: o.sd2, id: o.id });
      }
      b.state = o.st === 'building' ? 'active' : o.st;
      b.occ = o.oc || 0;
      b.garbage = o.g || 0;
      b.crime = o.cr || 0;
      b.edu = o.ed || 0;
      b.happy = o.h || 60;
      b.dead = o.dd || 0;
      b.sick = o.sk || 0;
      b.stock = o.stk || 0;
      b.age = o.ag || 0;
      this.register(b);
      if (b.seg && !G.roads.segs.has(b.seg)) {
        this.linkSeg(b, 0);
        this.reattach(b);
      }
      this.buildMesh(b);
      if (G.trees) G.trees.removeWhere(b.x - b.hw - 4, b.z - b.hd - 4, b.x + b.hw + 4, b.z + b.hd + 4, (t) => distToObb(b.obb, t.x, t.z) < 1.5);
    }
    G.zones.touch();
  }

  clear() {
    for (const id of [...this.list.keys()]) this.demolish(id, { quiet: true });
    this.nextId = 1;
  }
}

export function zoneName(zone) {
  return ZONES[zone] ? ZONES[zone].name : '';
}

export function roadHalf(seg) {
  return ROAD_TYPES[seg.type].width / 2;
}
