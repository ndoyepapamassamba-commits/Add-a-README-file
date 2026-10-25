// Réseau routier : graphe nœuds/segments (Bézier quadratiques), aimantation, découpe aux croisements,
// validations, rognage des carrefours, composantes connexes, feux tricolores.
import { G } from './state.js';
import { ROAD_TYPES, ROAD_Y, WATER_LEVEL, BUILD_LIMIT, OUTSIDE_ENTRY, HIGHWAY_END } from './config.js';
import { heightAt } from './terrain.js';
import { SpatialHash, qbez, qbezTan, closestOnPolyline, segIntersect, clamp } from './util.js';
import { RoadMeshes } from './roadmesh.js';

const MIN_ANGLE = 0.42; // ≈ 24°

// Point de contrôle du sous-arc [t0,t1] d'une Bézier quadratique (forme polaire)
function blossom(c, t0, t1) {
  const a = (1 - t0) * (1 - t1);
  const m = (1 - t0) * t1 + t0 * (1 - t1);
  const b = t0 * t1;
  return { x: a * c.ax + m * c.cx + b * c.bx, z: a * c.az + m * c.cz + b * c.bz };
}

export class RoadNetwork {
  constructor(scene, renderer) {
    this.nodes = new Map();
    this.segs = new Map();
    this.nextNode = 1;
    this.nextSeg = 1;
    this.segHash = new SpatialHash(64);
    this.nodeHash = new SpatialHash(48);
    this.meshes = new RoadMeshes(this, scene, renderer);
    this.dirtyNodes = new Set();
    this.version = 0;
    this.outsideComps = new Set();
    this.treeGeo = null;
  }

  // ------------------------------------------------------------------ géométrie
  static curve(ax, az, cx, cz, bx, bz, step = 4) {
    let L = 0;
    let px = ax;
    let pz = az;
    for (let i = 1; i <= 24; i++) {
      const p = qbez(ax, az, cx, cz, bx, bz, i / 24);
      L += Math.hypot(p.x - px, p.z - pz);
      px = p.x;
      pz = p.z;
    }
    const n = Math.max(2, Math.ceil(L / step));
    const pts = [];
    const cum = [0];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = qbez(ax, az, cx, cz, bx, bz, t);
      pts.push({ x: p.x, z: p.z, y: heightAt(p.x, p.z) + ROAD_Y, t });
      if (i > 0) cum.push(cum[i - 1] + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z));
    }
    return { pts, cum, len: cum[n] };
  }

  idxAt(seg, s) {
    const cum = seg.cum;
    let lo = 0;
    let hi = cum.length - 1;
    if (s <= 0) return 0;
    if (s >= cum[hi]) return hi - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cum[m] <= s) lo = m;
      else hi = m;
    }
    return lo;
  }

  pointAt(seg, s) {
    s = clamp(s, 0, seg.len);
    const i = this.idxAt(seg, s);
    const a = seg.pts[i];
    const b = seg.pts[i + 1];
    const l = seg.cum[i + 1] - seg.cum[i] || 1;
    const f = (s - seg.cum[i]) / l;
    const tx = (b.x - a.x) / l;
    const tz = (b.z - a.z) / l;
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, y: a.y + (b.y - a.y) * f, tx, tz };
  }

  tAt(seg, s) {
    const i = this.idxAt(seg, s);
    const a = seg.pts[i];
    const b = seg.pts[i + 1];
    const l = seg.cum[i + 1] - seg.cum[i] || 1;
    return a.t + (b.t - a.t) * clamp((s - seg.cum[i]) / l, 0, 1);
  }

  // direction (unitaire) en partant du nœud le long du segment
  dirAway(seg, nodeId, dist = 6) {
    const atA = seg.a === nodeId;
    const d = Math.min(dist, seg.len * 0.5);
    const n = this.nodes.get(nodeId);
    const p = this.pointAt(seg, atA ? d : seg.len - d);
    const x = p.x - n.x;
    const z = p.z - n.z;
    const l = Math.hypot(x, z) || 1;
    return { x: x / l, z: z / l };
  }

  project(seg, x, z) {
    const r = closestOnPolyline(seg.pts, seg.cum, x, z);
    const p = this.pointAt(seg, r.s);
    // côté : + à droite du sens a->b
    const side = (x - p.x) * -p.tz + (z - p.z) * p.tx >= 0 ? 1 : -1;
    return { s: r.s, d: r.d, x: r.x, z: r.z, side };
  }

  nearestSeg(x, z, maxDist, filter) {
    let best = null;
    for (const seg of this.segHash.queryRadius(x, z, maxDist + 20)) {
      if (filter && !filter(seg)) continue;
      const pr = this.project(seg, x, z);
      if (pr.d <= maxDist && (!best || pr.d < best.d)) best = { seg, ...pr };
    }
    return best;
  }

  // ------------------------------------------------------------------ topologie
  addNode(x, z, outside = false, id = null) {
    const n = { id: id || this.nextNode++, x, z, y: heightAt(x, z) + ROAD_Y, segs: [], outside, mesh: null, signal: null, comp: 0 };
    if (id && id >= this.nextNode) this.nextNode = id + 1;
    this.nodes.set(n.id, n);
    this.nodeHash.insertPoint(n, x, z, 0);
    return n;
  }

  removeNode(n) {
    this.meshes.removeNode(n);
    this.nodes.delete(n.id);
    this.nodeHash.remove(n);
    this.dirtyNodes.delete(n.id);
  }

  addSegment(a, b, cx, cz, type, id = null) {
    const seg = {
      id: id || this.nextSeg++,
      a: a.id,
      b: b.id,
      type,
      cx,
      cz,
      trimA: 0,
      trimB: 0,
      mesh: null,
      lanes: null,
      comp: 0,
      density: 0,
      volume: 0,
    };
    if (id && id >= this.nextSeg) this.nextSeg = id + 1;
    Object.assign(seg, RoadNetwork.curve(a.x, a.z, cx, cz, b.x, b.z));
    this.segs.set(seg.id, seg);
    a.segs.push(seg.id);
    b.segs.push(seg.id);
    this.indexSeg(seg);
    this.dirtyNodes.add(a.id);
    this.dirtyNodes.add(b.id);
    this.version++;
    return seg;
  }

  indexSeg(seg) {
    let minx = Infinity;
    let minz = Infinity;
    let maxx = -Infinity;
    let maxz = -Infinity;
    for (const p of seg.pts) {
      minx = Math.min(minx, p.x);
      maxx = Math.max(maxx, p.x);
      minz = Math.min(minz, p.z);
      maxz = Math.max(maxz, p.z);
    }
    const h = ROAD_TYPES[seg.type].width / 2;
    seg.bbox = { minx: minx - h, minz: minz - h, maxx: maxx + h, maxz: maxz + h };
    this.segHash.insert(seg, seg.bbox.minx, seg.bbox.minz, seg.bbox.maxx, seg.bbox.maxz);
  }

  detach(seg) {
    this.segs.delete(seg.id);
    this.segHash.remove(seg);
    for (const nid of [seg.a, seg.b]) {
      const n = this.nodes.get(nid);
      if (!n) continue;
      n.segs = n.segs.filter((id) => id !== seg.id);
      this.dirtyNodes.add(nid);
    }
    this.meshes.removeSeg(seg);
    seg.dead = true;
    this.version++;
  }

  removeSegment(seg, flush = true) {
    if (!this.segs.has(seg.id)) return;
    this.detach(seg);
    G.emit('seg:removed', seg);
    for (const nid of [seg.a, seg.b]) {
      const n = this.nodes.get(nid);
      if (n && n.segs.length === 0 && !n.outside) this.removeNode(n);
    }
    if (flush) this.flush();
  }

  splitSegment(seg, s) {
    const t = this.tAt(seg, s);
    const A = this.nodes.get(seg.a);
    const B = this.nodes.get(seg.b);
    const c = { ax: A.x, az: A.z, cx: seg.cx, cz: seg.cz, bx: B.x, bz: B.z };
    const P = qbez(c.ax, c.az, c.cx, c.cz, c.bx, c.bz, t);
    const c1 = blossom(c, 0, t);
    const c2 = blossom(c, t, 1);
    const N = this.addNode(P.x, P.z);
    this.detach(seg);
    const s1 = this.addSegment(A, N, c1.x, c1.z, seg.type);
    const s2 = this.addSegment(N, B, c2.x, c2.z, seg.type);
    G.emit('seg:split', { old: seg, s1, s2, at: s });
    return N;
  }

  segBetween(a, b) {
    for (const sid of a.segs) {
      const s = this.segs.get(sid);
      if ((s.a === a.id && s.b === b.id) || (s.a === b.id && s.b === a.id)) return s;
    }
    return null;
  }

  // ------------------------------------------------------------------ aimantation
  findSnap(x, z, typeId, opts = {}) {
    const w = ROAD_TYPES[typeId].width / 2;
    let best = null;
    for (const n of this.nodeHash.queryRadius(x, z, 30)) {
      let maxW = w;
      for (const sid of n.segs) maxW = Math.max(maxW, ROAD_TYPES[this.segs.get(sid).type].width / 2);
      const r = Math.max(9, maxW + 2);
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < r && (!best || d < best.d)) best = { kind: 'node', node: n, x: n.x, z: n.z, d };
    }
    if (best) return best;
    const hit = this.nearestSeg(x, z, 14, opts.filter);
    if (hit) {
      const half = ROAD_TYPES[hit.seg.type].width / 2;
      if (hit.d < half + 3) {
        if (hit.s < 10) {
          const n = this.nodes.get(hit.seg.a);
          return { kind: 'node', node: n, x: n.x, z: n.z, d: 0 };
        }
        if (hit.s > hit.seg.len - 10) {
          const n = this.nodes.get(hit.seg.b);
          return { kind: 'node', node: n, x: n.x, z: n.z, d: 0 };
        }
        return { kind: 'seg', seg: hit.seg, s: hit.s, x: hit.x, z: hit.z, d: hit.d };
      }
    }
    return { kind: 'free', x, z };
  }

  // Directions existantes à une jonction (pour les contrôles d'angle)
  junctionDirs(j) {
    if (j.kind === 'node') return j.node.segs.map((sid) => ({ ...this.dirAway(this.segs.get(sid), j.node.id), w: ROAD_TYPES[this.segs.get(sid).type].width / 2 }));
    if (j.kind === 'split') {
      const p = this.pointAt(j.seg, j.s);
      const w = ROAD_TYPES[j.seg.type].width / 2;
      return [
        { x: p.tx, z: p.tz, w },
        { x: -p.tx, z: -p.tz, w },
      ];
    }
    return [];
  }

  // ------------------------------------------------------------------ planification
  // start/end : résultats de findSnap ; ctrl : {x,z} ou null pour une ligne droite
  planRoad(start, end, ctrl, typeId, opts = {}) {
    const type = ROAD_TYPES[typeId];
    const half = type.width / 2;
    const plan = { valid: false, reason: '', typeId, cost: 0, len: 0, junctions: [], demolish: [] };
    const ax = start.x;
    const az = start.z;
    const bx = end.x;
    const bz = end.z;
    const cx = ctrl ? ctrl.x : (ax + bx) / 2;
    const cz = ctrl ? ctrl.z : (az + bz) / 2;
    const curve = RoadNetwork.curve(ax, az, cx, cz, bx, bz);
    plan.curve = { ax, az, cx, cz, bx, bz, ...curve };
    plan.len = curve.len;
    plan.cost = Math.round(curve.len * type.cost);
    const fail = (r) => {
      plan.reason = r;
      return plan;
    };
    if (curve.len < 10) return fail('Trop court');
    if (start.kind === 'node' && end.kind === 'node' && start.node === end.node) return fail('Trop court');
    const pts = curve.pts;
    // virage trop serré
    for (let i = 1; i < pts.length - 1; i++) {
      const ax1 = pts[i].x - pts[i - 1].x;
      const az1 = pts[i].z - pts[i - 1].z;
      const ax2 = pts[i + 1].x - pts[i].x;
      const az2 = pts[i + 1].z - pts[i].z;
      const l1 = Math.hypot(ax1, az1);
      const l2 = Math.hypot(ax2, az2);
      if (l1 < 1e-3 || l2 < 1e-3) continue;
      const cosA = clamp((ax1 * ax2 + az1 * az2) / (l1 * l2), -1, 1);
      const ang = Math.acos(cosA);
      const radius = ((l1 + l2) / 2) / Math.max(ang, 1e-6);
      if (radius < half * 1.2) return fail('Virage trop serré');
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!opts.ignoreLimits && (Math.abs(p.x) > BUILD_LIMIT || Math.abs(p.z) > BUILD_LIMIT)) return fail('Hors des limites de la ville');
      if (heightAt(p.x, p.z) < WATER_LEVEL + 0.35) return fail("Impossible de construire sur l'eau");
      if (i > 0) {
        const dl = curve.cum[i] - curve.cum[i - 1];
        if (dl > 0.5 && Math.abs(p.y - pts[i - 1].y) / dl > 0.17) return fail('Pente trop raide');
      }
    }
    // croisements avec les routes existantes
    const crossings = [];
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
    const cands = this.segHash.query(minx - 2, minz - 2, maxx + 2, maxz + 2);
    for (const seg of cands) {
      for (let j = 0; j < seg.pts.length - 1; j++) {
        const c0 = seg.pts[j];
        const c1 = seg.pts[j + 1];
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i];
          const p1 = pts[i + 1];
          if (Math.max(p0.x, p1.x) < Math.min(c0.x, c1.x) || Math.min(p0.x, p1.x) > Math.max(c0.x, c1.x)) continue;
          if (Math.max(p0.z, p1.z) < Math.min(c0.z, c1.z) || Math.min(p0.z, p1.z) > Math.max(c0.z, c1.z)) continue;
          const hit = segIntersect(p0.x, p0.z, p1.x, p1.z, c0.x, c0.z, c1.x, c1.z);
          if (!hit) continue;
          const sNew = curve.cum[i] + (curve.cum[i + 1] - curve.cum[i]) * hit.t;
          const sOld = seg.cum[j] + (seg.cum[j + 1] - seg.cum[j]) * hit.u;
          crossings.push({ seg, sNew, sOld, x: p0.x + (p1.x - p0.x) * hit.t, z: p0.z + (p1.z - p0.z) * hit.t, t: p0.t + (p1.t - p0.t) * hit.t });
        }
      }
    }
    crossings.sort((a, b) => a.sNew - b.sNew);
    const isAtStart = (cr) => {
      if (cr.sNew > 7) return false;
      if (start.kind === 'node') return start.node.segs.includes(cr.seg.id) || cr.sNew < 2;
      if (start.kind === 'seg') return cr.seg === start.seg || cr.sNew < 2;
      return cr.sNew < 1;
    };
    const isAtEnd = (cr) => {
      if (cr.sNew < curve.len - 7) return false;
      if (end.kind === 'node') return end.node.segs.includes(cr.seg.id) || cr.sNew > curve.len - 2;
      if (end.kind === 'seg') return cr.seg === end.seg || cr.sNew > curve.len - 2;
      return cr.sNew > curve.len - 1;
    };
    const mid = [];
    for (const cr of crossings) {
      if (isAtStart(cr) || isAtEnd(cr)) continue;
      const last = mid[mid.length - 1];
      if (last && cr.sNew - last.sNew < 3) continue;
      let j;
      if (cr.sOld < 10) j = { kind: 'node', node: this.nodes.get(cr.seg.a) };
      else if (cr.sOld > cr.seg.len - 10) j = { kind: 'node', node: this.nodes.get(cr.seg.b) };
      else j = { kind: 'split', seg: cr.seg, s: cr.sOld, x: cr.x, z: cr.z };
      j.sNew = cr.sNew;
      j.t = cr.t;
      if (j.kind === 'node') {
        j.x = j.node.x;
        j.z = j.node.z;
        if (last && last.kind === 'node' && last.node === j.node) continue;
      }
      mid.push(j);
    }
    const toJ = (snap, t, sNew) => {
      if (snap.kind === 'node') return { kind: 'node', node: snap.node, x: snap.node.x, z: snap.node.z, t, sNew };
      if (snap.kind === 'seg') return { kind: 'split', seg: snap.seg, s: snap.s, x: snap.x, z: snap.z, t, sNew };
      return { kind: 'new', x: snap.x, z: snap.z, t, sNew };
    };
    const js = [toJ(start, 0, 0), ...mid, toJ(end, 1, curve.len)];
    plan.junctions = js;
    // longueurs des tronçons
    for (let i = 0; i < js.length - 1; i++) {
      if (js[i + 1].sNew - js[i].sNew < 7) return fail("Trop proche d'une intersection");
      if (js[i].kind === 'node' && js[i + 1].kind === 'node' && this.segBetween(js[i].node, js[i + 1].node)) return fail('Route déjà existante');
    }
    // angles
    const zoneR = [];
    for (let i = 0; i < js.length; i++) {
      const j = js[i];
      const tan = qbezTan(ax, az, cx, cz, bx, bz, clamp(j.t, 0.001, 0.999));
      const mine = [];
      if (i > 0) mine.push({ x: -tan.x, z: -tan.z });
      if (i < js.length - 1) mine.push({ x: tan.x, z: tan.z });
      let R = half + 4;
      for (const d of this.junctionDirs(j)) {
        for (const m of mine) {
          const cosA = clamp(m.x * d.x + m.z * d.z, -1, 1);
          const ang = Math.acos(cosA);
          if (ang < MIN_ANGLE) return fail('Angle trop aigu');
          // distance le long de la nouvelle route au-delà de laquelle elle ne touche plus la route existante
          R = Math.max(R, (d.w + half) / (ang < Math.PI / 2 ? Math.sin(ang) : 1) + 2);
        }
      }
      if (j.kind === 'node' && j.node.segs.length >= 6) return fail('Trop de routes à ce carrefour');
      zoneR.push(Math.min(R, 90));
    }
    // chevauchement d'une route existante
    for (let i = 0; i < pts.length; i++) {
      const s = curve.cum[i];
      let skip = false;
      for (let k = 0; k < js.length; k++) {
        if (Math.abs(s - js[k].sNew) < zoneR[k]) {
          skip = true;
          break;
        }
      }
      if (skip) continue;
      const p = pts[i];
      for (const seg of this.segHash.queryRadius(p.x, p.z, half + 20)) {
        const w2 = ROAD_TYPES[seg.type].width / 2;
        const pr = closestOnPolyline(seg.pts, seg.cum, p.x, p.z);
        if (pr.d < half + w2 - 1) return fail("Trop près d'une autre route");
      }
    }
    // bâtiments
    if (G.buildings) {
      const col = G.buildings.collideCorridor(pts, half);
      if (col.blocked) return fail(col.blocked);
      plan.demolish = col.demolish;
    }
    if (!opts.free && G.sim && G.sim.money < plan.cost) {
      plan.valid = false;
      plan.reason = 'Fonds insuffisants';
      plan.noMoney = true;
      return plan;
    }
    plan.valid = true;
    return plan;
  }

  buildPlan(plan) {
    const c = plan.curve;
    const nodes = [];
    for (const j of plan.junctions) {
      let n = null;
      if (j.kind === 'node') n = this.nodes.has(j.node.id) ? j.node : this.addNode(j.x, j.z);
      else if (j.kind === 'new') {
        const near = this.nodeHash.queryRadius(j.x, j.z, 1).find((q) => Math.hypot(q.x - j.x, q.z - j.z) < 0.5);
        n = near || this.addNode(j.x, j.z);
      } else {
        const hit = this.nearestSeg(j.x, j.z, 4);
        if (!hit) n = this.addNode(j.x, j.z);
        else if (hit.s < 3) n = this.nodes.get(hit.seg.a);
        else if (hit.s > hit.seg.len - 3) n = this.nodes.get(hit.seg.b);
        else n = this.splitSegment(hit.seg, hit.s);
      }
      nodes.push({ n, t: j.t });
    }
    if (plan.demolish && plan.demolish.length && G.buildings) for (const id of plan.demolish) G.buildings.demolish(id, { silent: true });
    const created = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const A = nodes[i].n;
      const B = nodes[i + 1].n;
      if (A === B || this.segBetween(A, B)) continue;
      const ctl = blossom(c, nodes[i].t, nodes[i + 1].t);
      created.push(this.addSegment(A, B, ctl.x, ctl.z, plan.typeId));
    }
    for (const seg of created) G.emit('seg:added', seg);
    if (G.trees) {
      for (const seg of created) {
        const h = ROAD_TYPES[seg.type].width / 2 + 2.5;
        G.trees.removeWhere(seg.bbox.minx - 3, seg.bbox.minz - 3, seg.bbox.maxx + 3, seg.bbox.maxz + 3, (t) => closestOnPolyline(seg.pts, seg.cum, t.x, t.z).d < h);
      }
    }
    this.flush();
    return created;
  }

  upgradeSegment(seg, typeId) {
    const old = seg.type;
    if (old === typeId && typeId !== 'oneway') return 0;
    const A = this.nodes.get(seg.a);
    const B = this.nodes.get(seg.b);
    let a = A;
    let b = B;
    if (old === typeId && typeId === 'oneway') {
      // inverser le sens unique
      a = B;
      b = A;
    }
    const cost = old === typeId ? 0 : Math.round(seg.len * ROAD_TYPES[typeId].cost * 0.7);
    this.detach(seg);
    const ns = this.addSegment(a, b, seg.cx, seg.cz, typeId);
    G.emit('seg:replaced', { old: seg, seg: ns, reversed: a !== A });
    this.flush();
    return cost;
  }

  // ------------------------------------------------------------------ carrefours
  computeTrims(node) {
    const segs = node.segs.map((id) => this.segs.get(id)).filter(Boolean);
    const info = segs.map((seg) => ({ seg, atA: seg.a === node.id, d: this.dirAway(seg, node.id, 8), h: ROAD_TYPES[seg.type].width / 2 }));
    for (const I of info) {
      let trim = 0;
      if (info.length >= 2) {
        for (const J of info) {
          if (J === I) continue;
          const cosA = clamp(I.d.x * J.d.x + I.d.z * J.d.z, -1, 1);
          const ang = Math.acos(cosA);
          if (ang > Math.PI - 0.26) {
            trim = Math.max(trim, info.length >= 3 ? 0 : 0.3);
            continue;
          }
          trim = Math.max(trim, (J.h + I.h * cosA) / Math.sin(ang) + 1.2);
        }
        if (info.length >= 3) {
          let maxH = 0;
          for (const J of info) if (J !== I) maxH = Math.max(maxH, J.h);
          trim = Math.max(trim, maxH + 1.2);
        }
      }
      trim = clamp(trim, 0, I.seg.len * 0.46);
      if (I.atA) I.seg.trimA = trim;
      else I.seg.trimB = trim;
    }
  }

  setupSignal(node) {
    const segs = node.segs.map((id) => this.segs.get(id)).filter(Boolean);
    const k = segs.length;
    // comme dans l'original : pas de feux entre petites rues, feux dès qu'une route plus large est concernée
    const big = segs.filter((s) => s.type === 'medium' || s.type === 'large' || s.type === 'highway').length;
    const needs = k >= 3 && big >= 1 && (k >= 4 || big >= 2 || segs.some((s) => s.type === 'large'));
    if (!needs) {
      node.signal = null;
      return;
    }
    const ref = this.dirAway(segs[0], node.id);
    const refA = Math.atan2(ref.z, ref.x);
    const groups = {};
    let n0 = 0;
    let n1 = 0;
    for (const s of segs) {
      const d = this.dirAway(s, node.id);
      let a = Math.atan2(d.z, d.x) - refA;
      a = ((a % Math.PI) + Math.PI) % Math.PI;
      const gidx = a < Math.PI / 4 || a > (3 * Math.PI) / 4 ? 0 : 1;
      groups[s.id] = gidx;
      if (gidx) n1++;
      else n0++;
    }
    if (!n0 || !n1) {
      node.signal = null;
      return;
    }
    // durée du vert proportionnelle au nombre de voies du groupe (les grands axes passent plus longtemps)
    const green = [8, 8];
    for (const s of segs) {
      const t = ROAD_TYPES[s.type];
      green[groups[s.id]] = Math.max(green[groups[s.id]], 8 + 3.5 * Math.max(t.lanes[0], t.lanes[1]));
    }
    const prev = node.signal;
    node.signal = { groups, green, phase: prev ? prev.phase : 0, timer: prev ? prev.timer : Math.random() * 12, amber: false };
  }

  flush() {
    if (!this.dirtyNodes.size) return;
    const segsToBuild = new Set();
    for (const nid of this.dirtyNodes) {
      const n = this.nodes.get(nid);
      if (!n) continue;
      this.computeTrims(n);
      for (const sid of n.segs) segsToBuild.add(sid);
    }
    for (const sid of segsToBuild) {
      const seg = this.segs.get(sid);
      if (!seg) continue;
      seg.lanes = null;
      this.meshes.buildSeg(seg);
    }
    for (const nid of this.dirtyNodes) {
      const n = this.nodes.get(nid);
      if (!n) continue;
      this.setupSignal(n);
      this.meshes.buildNode(n);
    }
    this.dirtyNodes.clear();
    this.computeComponents();
    this.meshes.furniture.rebuild(this, this.treeGeo);
    this.version++;
    G.emit('roads:changed');
  }

  computeComponents() {
    let comp = 0;
    for (const n of this.nodes.values()) n.comp = 0;
    this.outsideComps = new Set();
    for (const start of this.nodes.values()) {
      if (start.comp) continue;
      comp++;
      const stack = [start];
      start.comp = comp;
      while (stack.length) {
        const n = stack.pop();
        if (n.outside) this.outsideComps.add(comp);
        for (const sid of n.segs) {
          const seg = this.segs.get(sid);
          if (!seg) continue;
          seg.comp = comp;
          const o = this.nodes.get(seg.a === n.id ? seg.b : seg.a);
          if (o && !o.comp) {
            o.comp = comp;
            stack.push(o);
          }
        }
      }
    }
    this.compCount = comp;
  }

  connectedToOutside(seg) {
    return seg && this.outsideComps.has(seg.comp);
  }

  // ------------------------------------------------------------------ départ et sauvegarde
  buildInitialHighway() {
    const out = this.addNode(OUTSIDE_ENTRY.x, OUTSIDE_ENTRY.z, true);
    const midX = (OUTSIDE_ENTRY.x + HIGHWAY_END.x) / 2;
    const mid = this.addNode(midX, OUTSIDE_ENTRY.z + 6);
    const end = this.addNode(HIGHWAY_END.x, HIGHWAY_END.z);
    this.addSegment(out, mid, (OUTSIDE_ENTRY.x + midX) / 2, OUTSIDE_ENTRY.z + 4, 'highway');
    this.addSegment(mid, end, (midX + HIGHWAY_END.x) / 2, HIGHWAY_END.z + 5, 'highway');
    for (const seg of this.segs.values()) G.emit('seg:added', seg);
    if (G.trees) {
      for (const seg of this.segs.values()) {
        G.trees.removeWhere(seg.bbox.minx - 3, seg.bbox.minz - 3, seg.bbox.maxx + 3, seg.bbox.maxz + 3, (t) => closestOnPolyline(seg.pts, seg.cum, t.x, t.z).d < 22);
      }
    }
    this.flush();
    return end;
  }

  serialize() {
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      nodes: [...this.nodes.values()].map((n) => [n.id, r2(n.x), r2(n.z), n.outside ? 1 : 0]),
      segs: [...this.segs.values()].map((s) => [s.id, s.a, s.b, s.type, r2(s.cx), r2(s.cz)]),
    };
  }

  load(data) {
    for (const [id, x, z, out] of data.nodes) this.addNode(x, z, !!out, id);
    for (const [id, a, b, type, cx, cz] of data.segs) {
      const A = this.nodes.get(a);
      const B = this.nodes.get(b);
      if (A && B) this.addSegment(A, B, cx, cz, type, id);
    }
    if (G.trees) {
      for (const seg of this.segs.values()) {
        const h = ROAD_TYPES[seg.type].width / 2 + 2.5;
        G.trees.removeWhere(seg.bbox.minx - 3, seg.bbox.minz - 3, seg.bbox.maxx + 3, seg.bbox.maxz + 3, (t) => closestOnPolyline(seg.pts, seg.cum, t.x, t.z).d < h);
      }
    }
    this.flush();
  }

  clear() {
    for (const seg of [...this.segs.values()]) this.detach(seg);
    for (const n of [...this.nodes.values()]) this.removeNode(n);
    this.nextNode = 1;
    this.nextSeg = 1;
    this.dirtyNodes.clear();
    this.meshes.furniture.rebuild(this, this.treeGeo);
  }
}
