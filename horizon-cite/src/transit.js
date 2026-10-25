// Transports en commun : lignes de bus en boucle, arrêts, autobus, fréquentation et recettes.
import * as THREE from 'three';
import { G } from './state.js';
import { ROAD_TYPES, ROAD_Y } from './config.js';
import { heightAt } from './terrain.js';
import { findPath } from './path.js';
import { BGeo, PAL } from './buildgen.js';
import { MATS } from './materials.js';
import { fmtMoney } from './util.js';

const LINE_COLORS = [0xe8842a, 0x2f9be8, 0x45c45a, 0xd94a8c, 0x9b59d6, 0xe8c23a, 0x26b5a8, 0xe0473f];
const FARE = 2;
const STOP_RADIUS = 230;

function stopGeometry() {
  const g = new BGeo();
  g.box(-1.6, 0, -0.6, 1.6, 0.15, 0.6, PAL.concrete);
  g.box(-1.5, 0.15, 0.45, 1.5, 2.4, 0.55, PAL.glass);
  g.box(-1.7, 2.4, -0.7, 1.7, 2.55, 0.7, PAL.white);
  g.box(1.75, 0, -0.1, 1.85, 2.9, 0.1, PAL.metal);
  g.box(1.6, 2.5, -0.3, 2.0, 2.9, 0.3, PAL.blue, { win: 5, ww: 100 });
  return g.build();
}

export class Transit {
  constructor(scene) {
    this.scene = scene;
    this.lines = [];
    this.nextId = 1;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.stopGeo = stopGeometry();
    this.draft = null;
    this.ridersDay = 0;
    this.linesVisible = false;
    this.marker = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.6, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false }));
    this.marker.renderOrder = 31;
    this.marker.visible = false;
    scene.add(this.marker);
    G.on('roads:changed', () => this.onRoadsChanged());
  }

  hasDepot() {
    for (const b of G.buildings.list.values()) if (b.defId === 'busdepot' && b.state === 'active') return b;
    return null;
  }

  // ---------------------------------------------------------------- arrêts
  stopAt(p) {
    const hit = G.roads.nearestSeg(p.x, p.z, 26, (s) => s.type !== 'highway');
    if (!hit) return null;
    const seg = hit.seg;
    const t = ROAD_TYPES[seg.type];
    // le bus circule du côté de l'arrêt : sens +1 si l'arrêt est à droite (side=+1)
    let dir = hit.side;
    if ((dir === 1 ? t.lanes[0] : t.lanes[1]) === 0) dir = -dir;
    const s = Math.min(seg.len - seg.trimB - 3, Math.max(seg.trimA + 3, hit.s));
    const pt = G.roads.pointAt(seg, s);
    const off = (t.width / 2 - 1.8) * dir;
    const x = pt.x - pt.tz * off;
    const z = pt.z + pt.tx * off;
    return { seg, s, dir, x, z, yaw: Math.atan2(-pt.tz * dir, pt.tx * dir) };
  }

  stopAccess(st) {
    return { seg: st.seg, s: st.s, dir: st.dir };
  }

  // ---------------------------------------------------------------- outil
  toolHasStops() {
    return this.draft && this.draft.stops.length > 0;
  }

  toolCancel() {
    if (this.draft) {
      for (const m of this.draft.meshes) this.group.remove(m);
    }
    this.draft = null;
    this.marker.visible = false;
  }

  toolMove(p, tools) {
    const st = this.stopAt(p);
    if (!this.hasDepot()) {
      tools.tip("Construisez d'abord un dépôt de bus", true);
      this.marker.visible = false;
      return;
    }
    if (!st) {
      this.marker.visible = false;
      tools.tip('Cliquez sur une route pour placer un arrêt');
      return;
    }
    this.marker.visible = true;
    this.marker.position.set(st.x, heightAt(st.x, st.z) + 1, st.z);
    const n = this.draft ? this.draft.stops.length : 0;
    const closing = n >= 2 && Math.hypot(this.draft.stops[0].x - st.x, this.draft.stops[0].z - st.z) < 18;
    tools.tip(closing ? 'Cliquez pour fermer la ligne' : n === 0 ? 'Nouvelle ligne : placez le premier arrêt' : `Arrêt n°${n + 1}<br><span class="muted">Revenez au premier arrêt pour fermer la ligne</span>`);
  }

  toolClick(p) {
    if (!this.hasDepot()) {
      if (G.audio) G.audio.play('error');
      return;
    }
    const st = this.stopAt(p);
    if (!st) return;
    if (!this.draft) this.draft = { stops: [], meshes: [], color: LINE_COLORS[(this.nextId - 1) % LINE_COLORS.length] };
    const d = this.draft;
    if (d.stops.length >= 2 && Math.hypot(d.stops[0].x - st.x, d.stops[0].z - st.z) < 18) {
      const line = this.createLine(d.stops, d.color);
      this.toolCancel();
      if (line) {
        if (G.audio) G.audio.play('build');
        G.emit('transit:line', line);
      } else {
        if (G.audio) G.audio.play('error');
        if (G.ui) G.ui.toast("Impossible de relier tous les arrêts : vérifiez le sens de circulation.", 'bad');
      }
      return;
    }
    // vérifier que l'arrêt précédent mène à celui-ci
    if (d.stops.length) {
      const prev = d.stops[d.stops.length - 1];
      if (!findPath(G.roads, this.stopAccess(prev), this.stopAccess(st))) {
        if (G.audio) G.audio.play('error');
        if (G.ui) G.ui.toast('Cet arrêt est inaccessible depuis le précédent.', 'bad');
        return;
      }
    }
    d.stops.push(st);
    const m = this.stopMesh(st, d.color);
    d.meshes.push(m);
    if (d.stops.length >= 2) d.meshes.push(this.pathMesh(d.stops[d.stops.length - 2], st, d.color, true));
    if (G.audio) G.audio.play('click');
  }

  stopMesh(st, color) {
    const m = new THREE.Mesh(this.stopGeo, MATS.city);
    m.position.set(st.x, heightAt(st.x, st.z) + ROAD_Y + 0.2, st.z);
    m.rotation.y = st.yaw;
    m.castShadow = true;
    this.group.add(m);
    return m;
  }

  pathMesh(a, b, color, visible) {
    const steps = findPath(G.roads, this.stopAccess(a), this.stopAccess(b));
    const pts = [];
    if (steps) {
      for (const stp of steps) {
        const L = G.traffic.laneGeo(stp.seg, stp.dir, 0);
        const p0 = G.traffic.toLanePos(L, stp.s0);
        const p1 = G.traffic.toLanePos(L, stp.s1);
        for (let i = 0; i < L.pts.length; i++) {
          if (L.cum[i] < p0 - 0.1 || L.cum[i] > p1 + 0.1) continue;
          pts.push(L.pts[i]);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    const pos = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * 1.2;
      const nz = (dx / l) * 1.2;
      const y0 = p.y + 1.2;
      const y1 = q.y + 1.2;
      pos.push(p.x + nx, y0, p.z + nz, q.x + nx, y1, q.z + nz, q.x - nx, y1, q.z - nz);
      pos.push(p.x + nx, y0, p.z + nz, q.x - nx, y1, q.z - nz, p.x - nx, y0, p.z - nz);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }));
    m.renderOrder = 25;
    m.visible = visible;
    this.group.add(m);
    return m;
  }

  // ---------------------------------------------------------------- lignes
  createLine(stops, color, id) {
    for (let i = 0; i < stops.length; i++) {
      const a = stops[i];
      const b = stops[(i + 1) % stops.length];
      if (!findPath(G.roads, this.stopAccess(a), this.stopAccess(b))) return null;
    }
    const line = { id: id || this.nextId++, color, stops, buses: new Set(), riders: 0, weekRiders: 0, meshes: [], waiting: stops.map(() => 0) };
    if (line.id >= this.nextId) this.nextId = line.id + 1;
    this.buildLineMeshes(line);
    let total = 0;
    for (let i = 0; i < stops.length; i++) {
      const a = stops[i];
      const b = stops[(i + 1) % stops.length];
      total += Math.hypot(a.x - b.x, a.z - b.z);
    }
    line.length = total;
    line.wantBuses = Math.max(1, Math.min(8, Math.round(total / 650)));
    this.lines.push(line);
    G.sim.covDirty = true;
    return line;
  }

  buildLineMeshes(line) {
    for (const m of line.meshes) this.group.remove(m);
    line.meshes = [];
    for (const st of line.stops) line.meshes.push(this.stopMesh(st, line.color));
    for (let i = 0; i < line.stops.length; i++) {
      const pm = this.pathMesh(line.stops[i], line.stops[(i + 1) % line.stops.length], line.color, this.linesVisible);
      pm.userData.path = true;
      line.meshes.push(pm);
    }
  }

  removeLine(line) {
    for (const v of line.buses) G.traffic.despawn(v);
    for (const m of line.meshes) this.group.remove(m);
    this.lines = this.lines.filter((l) => l !== line);
    G.sim.covDirty = true;
  }

  setLinesVisible(on) {
    this.linesVisible = on;
    for (const l of this.lines) for (const m of l.meshes) if (m.userData.path) m.visible = on;
  }

  allStops() {
    const out = [];
    for (const l of this.lines) for (const s of l.stops) out.push(s);
    return out;
  }

  // ---------------------------------------------------------------- autobus
  spawnBus(line) {
    const depot = this.hasDepot();
    if (!depot) return;
    const from = G.traffic.accessOf(depot);
    const k = Math.floor(Math.random() * line.stops.length);
    const v = G.traffic.spawn('bus', from, this.stopAccess(line.stops[k]), { kind: 'bus', force: true, color: 0xffffff });
    if (!v) return;
    v.line = line;
    v.stopIdx = k;
    v.load = 0;
    v.dest = { access: () => this.stopAccess(line.stops[v.stopIdx]) };
    line.buses.add(v);
    v.onDespawn = () => line.buses.delete(v);
    v.onArrive = () => {
      // montée / descente des voyageurs
      const drop = Math.round(v.load * (0.3 + Math.random() * 0.4));
      v.load -= drop;
      const pick = Math.min(40 - v.load, line.waiting[v.stopIdx]);
      line.waiting[v.stopIdx] -= pick;
      v.load += pick;
      line.riders += pick;
      line.weekRiders += pick;
      this.ridersDay += pick;
      v.wait = 3.5;
      v.afterWait = () => {
        v.stopIdx = (v.stopIdx + 1) % line.stops.length;
        return G.traffic.setPath(v, this.stopAccess(line.stops[v.stopIdx]));
      };
      return true;
    };
  }

  // Un habitant prend le bus au lieu de la voiture ?
  tryRide(origin, dest) {
    if (!this.lines.length) return false;
    for (const l of this.lines) {
      let a = -1;
      let b = -1;
      for (let i = 0; i < l.stops.length; i++) {
        const s = l.stops[i];
        if (a < 0 && (s.x - origin.x) ** 2 + (s.z - origin.z) ** 2 < STOP_RADIUS * STOP_RADIUS) a = i;
        if (b < 0 && (s.x - dest.x) ** 2 + (s.z - dest.z) ** 2 < STOP_RADIUS * STOP_RADIUS) b = i;
      }
      if (a >= 0 && b >= 0 && a !== b && Math.random() < 0.65) {
        l.waiting[a] = Math.min(300, l.waiting[a] + 1 + Math.floor(Math.random() * 3));
        return true;
      }
    }
    return false;
  }

  update(simDt) {
    if (simDt <= 0) return;
    const depot = this.hasDepot();
    for (const l of this.lines) {
      if (!depot) continue;
      if (l.buses.size < l.wantBuses && Math.random() < simDt * 0.5) this.spawnBus(l);
    }
  }

  fareIncomeDay() {
    const r = this.ridersDay * FARE;
    this.ridersDay = 0;
    return r;
  }

  costDay() {
    let c = 0;
    for (const l of this.lines) c += (120 + l.buses.size * 260) / 7;
    return c;
  }

  onRoadsChanged() {
    if (this.roadsVer === G.roads.version) return;
    this.roadsVer = G.roads.version;
    for (const l of [...this.lines]) {
      let broken = false;
      for (let i = 0; i < l.stops.length; i++) {
        const st = l.stops[i];
        if (!st.seg.dead && G.roads.segs.has(st.seg.id)) continue;
        const ns = this.stopAt({ x: st.x, z: st.z });
        if (ns) l.stops[i] = ns;
        else broken = true;
      }
      if (broken) {
        this.removeLine(l);
        if (G.ui) G.ui.toast('Une ligne de bus a été supprimée : un arrêt n’est plus desservi.', 'bad');
        continue;
      }
      this.buildLineMeshes(l);
    }
  }

  serialize() {
    return this.lines.map((l) => ({ id: l.id, c: l.color, r: l.riders, s: l.stops.map((s) => [Math.round(s.x * 10) / 10, Math.round(s.z * 10) / 10]) }));
  }

  load(arr) {
    for (const o of arr || []) {
      const stops = o.s.map(([x, z]) => this.stopAt({ x, z })).filter(Boolean);
      if (stops.length < 2) continue;
      const l = this.createLine(stops, o.c, o.id);
      if (l) l.riders = o.r || 0;
    }
  }

  clear() {
    for (const l of [...this.lines]) this.removeLine(l);
    this.toolCancel();
    this.nextId = 1;
  }

  describe(l) {
    return `${l.stops.length} arrêts · ${l.buses.size} bus · ${Math.round(l.weekRiders)} voyageurs · coût ${fmtMoney(120 + l.buses.size * 260)}/sem.`;
  }
}
