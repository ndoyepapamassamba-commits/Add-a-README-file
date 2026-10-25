// Trafic : véhicules instanciés, voies, suivi de véhicule (modèle IDM), virages en Bézier,
// feux tricolores, trajets des habitants, marchandises, déménagements, véhicules de service.
import * as THREE from 'three';
import { G } from './state.js';
import { ROAD_TYPES, ROAD_Y, CAR_COLORS, VEHICLE_TYPES, QUALITY } from './config.js';
import { heightAt } from './terrain.js';
import { genVehicle, VEHICLE_LEN } from './buildgen.js';
import { MATS } from './materials.js';
import { findPath } from './path.js';
import { cbez, cbezTan, clamp } from './util.js';

const SPEED_K = 1.35;
const GREEN = 13;
const AMBER = 2.2;
const TYPE_SPEED = { car: 1, van: 0.95, truck: 0.82, bus: 0.85, garbage: 0.8, hearse: 0.9, ambulance: 1.1, firetruck: 1.05, police: 1.1, moving: 0.85 };

const _col = new THREE.Color();
const _p = { x: 0, y: 0, z: 0 };
const _t = { x: 0, y: 0, z: 0 };

export class Traffic {
  constructor(scene) {
    this.scene = scene;
    this.vehicles = new Set();
    this.slots = new Map();
    this.meshes = {};
    this.max = QUALITY[G.quality].maxVehicles;
    for (const t of VEHICLE_TYPES) this.createMesh(t, t === 'car' ? this.max + 50 : Math.ceil(this.max / 3) + 20);
    this.tripAcc = 0;
    this.nextId = 1;
    this.stamp = 0;
    this.pending = [];
    this.densT = 0;
    this.signalT = 0;
    this.enabled = true;
    this.counts = { trips: 0 };
    G.on('roads:changed', () => this.onRoadsChanged());
  }

  createMesh(type, cap) {
    const geo = genVehicle(type);
    const m = new THREE.InstancedMesh(geo, MATS.city, cap);
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(m);
    this.meshes[type] = { mesh: m, list: [], cap };
  }

  setMax(n) {
    this.max = n;
  }

  allocInst(v) {
    const M = this.meshes[v.type];
    if (M.list.length >= M.cap) return false;
    v.inst = M.list.length;
    M.list.push(v);
    M.mesh.count = M.list.length;
    _col.setHex(v.color);
    M.mesh.setColorAt(v.inst, _col);
    M.mesh.instanceColor.needsUpdate = true;
    return true;
  }

  freeInst(v) {
    const M = this.meshes[v.type];
    const last = M.list.pop();
    if (last !== v) {
      M.list[v.inst] = last;
      last.inst = v.inst;
      _col.setHex(last.color);
      M.mesh.setColorAt(last.inst, _col);
      M.mesh.instanceColor.needsUpdate = true;
    }
    M.mesh.count = M.list.length;
  }

  // ---------------------------------------------------------------- voies
  laneGeo(seg, dir, k) {
    if (!seg.lanes) seg.lanes = {};
    const key = dir + ':' + k;
    let L = seg.lanes[key];
    if (L) return L;
    const net = G.roads;
    const type = ROAD_TYPES[seg.type];
    const nF = type.lanes[0];
    const nB = type.lanes[1];
    const n = dir === 1 ? nF : nB;
    const off = nB === 0 ? ((n - 1) / 2 - k) * type.laneW : type.median / 2 + (n - k - 0.5) * type.laneW;
    const s0 = Math.min(seg.trimA, seg.len / 2 - 0.1);
    const s1 = Math.max(seg.len - seg.trimB, seg.len / 2 + 0.1);
    const ss = [s0];
    for (let i = 1; i < seg.cum.length - 1; i++) if (seg.cum[i] > s0 + 0.3 && seg.cum[i] < s1 - 0.3) ss.push(seg.cum[i]);
    ss.push(s1);
    if (dir === -1) ss.reverse();
    const pts = [];
    const cum = [0];
    for (const s of ss) {
      const p = net.pointAt(seg, s);
      const x = p.x - p.tz * off * dir;
      const z = p.z + p.tx * off * dir;
      pts.push({ x, y: heightAt(x, z) + ROAD_Y + 0.03, z });
      if (pts.length > 1) {
        const a = pts[pts.length - 2];
        cum.push(cum[cum.length - 1] + Math.hypot(x - a.x, z - a.z));
      }
    }
    L = { pts, cum, len: cum[cum.length - 1], s0, s1, dir, k };
    seg.lanes[key] = L;
    return L;
  }

  toLanePos(L, sSeg) {
    const f = (L.dir === 1 ? sSeg - L.s0 : L.s1 - sSeg) / Math.max(0.01, L.s1 - L.s0);
    return clamp(f, 0, 1) * L.len;
  }

  fromLanePos(L, pos) {
    const f = clamp(pos / Math.max(0.01, L.len), 0, 1);
    return L.dir === 1 ? L.s0 + f * (L.s1 - L.s0) : L.s1 - f * (L.s1 - L.s0);
  }

  slot(seg, dir, k) {
    const key = seg.id + ':' + dir + ':' + k;
    let s = this.slots.get(key);
    if (!s) {
      s = { key, seg, dir, k, list: [], geo: this.laneGeo(seg, dir, k), node: dir === 1 ? seg.b : seg.a };
      this.slots.set(key, s);
    }
    return s;
  }

  laneCount(seg, dir) {
    const t = ROAD_TYPES[seg.type];
    return dir === 1 ? t.lanes[0] : t.lanes[1];
  }

  endDir(st) {
    const p = G.roads.pointAt(st.seg, st.dir === 1 ? st.seg.len - st.seg.trimB : st.seg.trimA);
    return { x: p.tx * st.dir, z: p.tz * st.dir };
  }
  startDir(st) {
    const p = G.roads.pointAt(st.seg, st.dir === 1 ? st.seg.trimA : st.seg.len - st.seg.trimB);
    return { x: p.tx * st.dir, z: p.tz * st.dir };
  }

  // voies compatibles avec le virage suivant (droite : voie extérieure, gauche : voie intérieure)
  allowedLanes(steps, i) {
    const st = steps[i];
    const n = this.laneCount(st.seg, st.dir);
    if (n <= 1) return [0];
    if (i >= steps.length - 1) return n === 2 ? [0, 1] : [0, 1];
    const a = this.endDir(st);
    const b = this.startDir(steps[i + 1]);
    const cross = a.x * b.z - a.z * b.x;
    const dot = a.x * b.x + a.z * b.z;
    if (dot < -0.6) return [n - 1];
    if (cross > 0.35) return [0];
    if (cross < -0.35) return [n - 1];
    const all = [];
    for (let k = 0; k < n; k++) all.push(k);
    return all;
  }

  // au moment d'atteindre la fin de la voie : la voie suivante la plus dégagée
  pickNextLane(v) {
    const i = v.si + 1;
    const st = v.steps[i];
    const opts = v.allowed && v.allowed[i] ? v.allowed[i] : (v.allowed = v.allowed || [])[i] = this.allowedLanes(v.steps, i);
    if (opts.length === 1) return opts[0];
    let best = v.lanesK[i];
    let bestRoom = -Infinity;
    for (const k of opts) {
      const sl = this.slots.get(st.seg.id + ':' + st.dir + ':' + k);
      let room = 1e6;
      if (sl && sl.list.length) {
        let tail = sl.list[0];
        for (const o of sl.list) if (o.pos < tail.pos) tail = o;
        room = tail.pos - tail.len - sl.list.length * 0.5;
      }
      if (k === v.lanesK[i]) room += 2;
      if (room > bestRoom) {
        bestRoom = room;
        best = k;
      }
    }
    return best;
  }

  chooseLanes(steps) {
    return steps.map((st, i) => {
      const n = this.laneCount(st.seg, st.dir);
      if (n <= 1) return 0;
      if (i === steps.length - 1) return 0;
      const a = this.endDir(st);
      const b = this.startDir(steps[i + 1]);
      const cross = a.x * b.z - a.z * b.x;
      const dot = a.x * b.x + a.z * b.z;
      if (dot < -0.6) return n - 1;
      if (cross > 0.35) return 0;
      if (cross < -0.35) return n - 1;
      return Math.floor(Math.random() * n);
    });
  }

  // ---------------------------------------------------------------- accès
  accessOf(b) {
    if (!b || !b.seg) return null;
    const seg = G.roads.segs.get(b.seg);
    if (!seg) return null;
    return { seg, s: clamp(b.s, 1, seg.len - 1) };
  }

  outsideAccess() {
    const outs = [];
    for (const n of G.roads.nodes.values()) {
      if (!n.outside || !n.segs.length) continue;
      const seg = G.roads.segs.get(n.segs[0]);
      outs.push({ seg, s: seg.a === n.id ? 3 : seg.len - 3, node: n });
    }
    return outs.length ? outs[Math.floor(Math.random() * outs.length)] : null;
  }

  // ---------------------------------------------------------------- création
  spawn(type, from, to, opts = {}) {
    if (!from || !to) return null;
    if (!opts.force && this.vehicles.size >= this.max) return null;
    const steps = findPath(G.roads, from, to);
    if (!steps) return null;
    const v = {
      id: this.nextId++,
      type,
      len: VEHICLE_LEN[type] || 4.5,
      v: 0,
      maxV: 10,
      steps,
      si: 0,
      lanesK: this.chooseLanes(steps),
      allowed: null,
      pickedFor: -1,
      pos: 0,
      turn: null,
      slot: null,
      color: opts.color !== undefined ? opts.color : 0xffffff,
      stuck: 0,
      kind: opts.kind || 'trip',
      wait: 0,
      onArrive: opts.onArrive || null,
      afterWait: null,
      dest: opts.dest || null,
      x: from.seg.pts[0].x,
      y: 0,
      z: from.seg.pts[0].z,
      ci: 0,
      data: opts.data || null,
    };
    if (!this.allocInst(v)) return null;
    this.enterStep(v, 0, this.toLanePos(this.laneGeo(steps[0].seg, steps[0].dir, v.lanesK[0]), steps[0].s0));
    v.v = Math.min(4, v.maxV);
    this.vehicles.add(v);
    this.place(v);
    return v;
  }

  enterStep(v, si, pos) {
    const st = v.steps[si];
    const slot = this.slot(st.seg, st.dir, v.lanesK[si]);
    v.si = si;
    v.slot = slot;
    v.pos = pos;
    v.ci = 0;
    v.maxV = ROAD_TYPES[st.seg.type].speed * SPEED_K * (TYPE_SPEED[v.type] || 1) * (v.phase === 'go' && (v.svc === 'fire' || v.svc === 'sick') ? 1.25 : 1);
    v.endPos = si === v.steps.length - 1 ? this.toLanePos(slot.geo, st.s1) : slot.geo.len;
    v.nextTurnLen = 8;
    slot.list.push(v);
  }

  leaveSlot(v) {
    const list = v.slot.list;
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
  }

  despawn(v) {
    if (!this.vehicles.has(v)) return;
    this.leaveSlot(v);
    this.freeInst(v);
    this.vehicles.delete(v);
    if (v.onDespawn) v.onDespawn(v);
  }

  // Nouvel itinéraire depuis la position courante
  setPath(v, to) {
    if (!to) return false;
    const L = v.slot.geo;
    const st = v.steps[v.si];
    const from = { seg: st.seg, s: this.fromLanePos(L, Math.max(0, v.pos)), dir: st.dir };
    const steps = findPath(G.roads, from, to);
    if (!steps) return false;
    this.leaveSlot(v);
    v.steps = steps;
    v.allowed = null;
    v.pickedFor = -1;
    v.lanesK = this.chooseLanes(steps);
    v.lanesK[0] = Math.min(v.slot.k, this.laneCount(steps[0].seg, steps[0].dir) - 1);
    const keepPos = v.pos;
    this.enterStep(v, 0, 0);
    v.pos = keepPos < 0 ? keepPos : this.toLanePos(v.slot.geo, from.s);
    return true;
  }

  // ---------------------------------------------------------------- mise à jour
  updateSignals(dt) {
    for (const n of G.roads.nodes.values()) {
      const s = n.signal;
      if (!s) continue;
      s.timer += dt;
      const green = s.green ? s.green[s.phase] : GREEN;
      if (!s.amber && s.timer > green) {
        s.amber = true;
        s.timer = 0;
      } else if (s.amber && s.timer > AMBER) {
        s.amber = false;
        s.timer = 0;
        s.phase = 1 - s.phase;
      }
    }
  }

  update(realDt, simDt) {
    if (simDt > 0) {
      this.updateSignals(simDt);
      const sub = Math.max(1, Math.ceil(simDt / 0.1));
      const dt = simDt / sub;
      for (let k = 0; k < sub; k++) this.stepAll(dt);
      if (this.enabled) this.spawnTrips(simDt);
      this.densT += simDt;
      if (this.densT > 1) {
        this.densT = 0;
        this.computeDensity();
      }
    }
    this.signalT += realDt;
    if (this.signalT > 0.2) {
      this.signalT = 0;
      this.paintSignals();
    }
    this.render();
  }

  stepAll(dt) {
    const stamp = ++this.stamp;
    for (const slot of this.slots.values()) {
      const list = slot.list;
      if (!list.length) continue;
      if (list.length > 1) list.sort((a, b) => b.pos - a.pos);
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        if (v.stamp === stamp) continue;
        v.stamp = stamp;
        this.stepVehicle(v, slot, i > 0 ? list[i - 1] : null, dt);
      }
    }
    if (this.pending.length) {
      const P = this.pending;
      this.pending = [];
      for (const [v, act] of P) {
        if (!this.vehicles.has(v)) continue;
        if (act === 'advance') this.advance(v);
        else if (act === 'arrive') this.arrive(v);
        else if (act === 'wait') this.afterWait(v);
        else this.despawn(v);
      }
    }
  }

  stepVehicle(v, slot, leader, dt) {
    if (v.wait > 0) {
      v.wait -= dt;
      v.v = 0;
      if (v.wait <= 0) this.pending.push([v, 'wait']);
      return;
    }
    const L = slot.geo.len;
    const last = v.si === v.steps.length - 1;
    let gap = 1e9;
    let vl = 0;
    if (leader) {
      gap = leader.pos - leader.len - v.pos - 1.2;
      vl = leader.v;
    }
    if (!last) {
      if (L - v.pos < 45 && v.pickedFor !== v.si) {
        v.lanesK[v.si + 1] = this.pickNextLane(v);
        v.pickedFor = v.si;
      }
      if (!leader) {
        const st = v.steps[v.si + 1];
        const ns = this.slots.get(st.seg.id + ':' + st.dir + ':' + v.lanesK[v.si + 1]);
        if (ns && ns.list.length) {
          let tail = ns.list[0];
          for (const o of ns.list) if (o.pos < tail.pos) tail = o;
          const g2 = L - v.pos + v.nextTurnLen + tail.pos - tail.len - 1.2;
          if (g2 < gap) {
            gap = g2;
            vl = tail.v;
          }
        }
      }
      const node = G.roads.nodes.get(slot.node);
      const sig = node && node.signal;
      const urgent = v.kind === 'service' && (v.svc === 'fire' || v.svc === 'sick' || v.svc === 'crime') && v.phase === 'go';
      if (sig && v.pos > -0.5 && !urgent) {
        const grp = sig.groups[slot.seg.id];
        const toLine = L - 1.2 - v.pos;
        const green = sig.phase === grp && !sig.amber;
        const amberGo = sig.phase === grp && sig.amber && toLine < v.v * 1.1 + 0.5;
        if (!green && !amberGo && toLine > -0.8 && toLine < gap) {
          gap = Math.max(0, toLine);
          vl = 0;
        }
      }
    } else {
      // la destination est un point d'arrêt : on compense la distance de sécurité du modèle
      const sg = v.endPos - v.pos + 1.6;
      if (sg < gap) {
        gap = sg;
        vl = 0;
      }
    }
    const v0 = v.maxV * (v.pos < 0 ? 0.55 : 1);
    const a = 2.6;
    const b = 4.0;
    const sStar = 1.8 + Math.max(0, v.v * 1.1 + (v.v * (v.v - vl)) / (2 * Math.sqrt(a * b)));
    const acc = a * (1 - Math.pow(v.v / v0, 4) - (gap < 1e8 ? (sStar / Math.max(gap, 0.05)) ** 2 : 0));
    v.v = clamp(v.v + acc * dt, 0, v0 * 1.05);
    if (gap < 0.05) v.v = 0;
    let move = v.v * dt;
    if (gap < 1e8 && move > Math.max(0, gap)) move = Math.max(0, gap);
    v.pos += move;
    if (v.v < 0.2) {
      v.stuck += dt;
      if (v.stuck > (v.kind === 'service' ? 70 : 40)) this.pending.push([v, 'despawn']);
    } else v.stuck = 0;
    if (last) {
      if (v.endPos - v.pos < 2.2 && v.v < 2.5) this.pending.push([v, 'arrive']);
    } else if (v.pos >= L) this.pending.push([v, 'advance']);
  }

  advance(v) {
    const oldGeo = v.slot.geo;
    const overflow = v.pos - oldGeo.len;
    this.leaveSlot(v);
    this.enterStep(v, v.si + 1, 0);
    const ng = v.slot.geo;
    const pa = oldGeo.pts;
    const p0 = pa[pa.length - 1];
    const pb = pa[pa.length - 2] || p0;
    let t0x = p0.x - pb.x;
    let t0z = p0.z - pb.z;
    const l0 = Math.hypot(t0x, t0z) || 1;
    t0x /= l0;
    t0z /= l0;
    const p3 = ng.pts[0];
    const pc = ng.pts[1] || p3;
    let t3x = pc.x - p3.x;
    let t3z = pc.z - p3.z;
    const l3 = Math.hypot(t3x, t3z) || 1;
    t3x /= l3;
    t3z /= l3;
    const d = Math.hypot(p3.x - p0.x, p3.z - p0.z);
    if (d < 0.6) {
      v.turn = null;
      v.pos = overflow;
    } else {
      const uturn = t0x * t3x + t0z * t3z < -0.7;
      const h = uturn ? Math.max(d * 0.85, 4) : clamp(d * 0.45, 0.8, 18);
      const turn = {
        p0: { x: p0.x, y: p0.y, z: p0.z },
        p1: { x: p0.x + t0x * h, y: p0.y, z: p0.z + t0z * h },
        p2: { x: p3.x - t3x * h, y: p3.y, z: p3.z - t3z * h },
        p3: { x: p3.x, y: p3.y, z: p3.z },
        len: 0,
      };
      let L = 0;
      let px = p0.x;
      let pz = p0.z;
      for (let i = 1; i <= 8; i++) {
        cbez(turn.p0, turn.p1, turn.p2, turn.p3, i / 8, _p);
        L += Math.hypot(_p.x - px, _p.z - pz);
        px = _p.x;
        pz = _p.z;
      }
      turn.len = Math.max(0.5, L);
      v.turn = turn;
      v.pos = -turn.len + overflow;
    }
    // prévoir la longueur du prochain virage
    v.nextTurnLen = 8;
  }

  arrive(v) {
    const r = v.onArrive ? v.onArrive(v) : false;
    if (!r) this.despawn(v);
  }

  afterWait(v) {
    const r = v.afterWait ? v.afterWait(v) : false;
    if (!r) this.despawn(v);
  }

  // ---------------------------------------------------------------- trajets
  spawnTrips(simDt) {
    const S = G.sim.stats;
    if (!S.pop || !G.env) return;
    const hour = G.env.cycle * 24;
    let tod;
    if (hour < 5) tod = 0.22;
    else if (hour < 7) tod = 0.22 + (hour - 5) * 0.6;
    else if (hour < 9.5) tod = 1.6;
    else if (hour < 16) tod = 1.0;
    else if (hour < 19.5) tod = 1.65;
    else if (hour < 23) tod = 0.85;
    else tod = 0.4;
    const rate = (S.pop / 1300 + S.jobs / 3000) * tod;
    this.tripAcc += rate * simDt;
    let guard = 0;
    while (this.tripAcc >= 1 && guard++ < 20) {
      this.tripAcc -= 1;
      if (this.vehicles.size >= this.max) {
        this.tripAcc = 0;
        break;
      }
      this.spawnTrip(hour);
    }
  }

  pickActive(list, near) {
    let best = null;
    let bd = Infinity;
    const tries = near ? 3 : 1;
    for (let k = 0, found = 0; k < 8 && found < tries; k++) {
      const b = list[Math.floor(Math.random() * list.length)];
      if (!b || b.state !== 'active' || !b.seg) continue;
      found++;
      const d = near ? (b.x - near.x) ** 2 + (b.z - near.z) ** 2 : 0;
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  spawnTrip(hour) {
    const Ls = G.sim.lists;
    if (!Ls.res.length) return;
    const r = Math.random();
    let from = null;
    let to = null;
    let type = 'car';
    let color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    let origin = null;
    let dest = null;
    const outside = () => this.outsideAccess();
    if (r < 0.52 && Ls.work.length) {
      const home = this.pickActive(Ls.res);
      const work = home && this.pickActive(Ls.work, home);
      if (!home || !work) return;
      const morning = hour > 5 && hour < 12;
      const evening = hour > 15 && hour < 22;
      const toWork = morning ? true : evening ? false : Math.random() < 0.5;
      origin = toWork ? home : work;
      dest = toWork ? work : home;
    } else if (r < 0.76 && Ls.com.length) {
      const home = this.pickActive(Ls.res);
      const shop = home && this.pickActive(Ls.com, home);
      if (!home || !shop) return;
      if (Math.random() < 0.5) {
        origin = home;
        dest = shop;
      } else {
        origin = shop;
        dest = home;
      }
    } else if (r < 0.94 && (Ls.ind.length || Ls.com.length)) {
      // marchandises
      type = Math.random() < 0.6 ? 'truck' : 'van';
      color = 0xffffff;
      const src = Ls.ind.length && Math.random() < 0.75 ? this.pickActive(Ls.ind) : null;
      const dst = Ls.com.length ? this.pickActive(Ls.com, src) : null;
      if (src && dst && Math.random() < 0.75) {
        origin = src;
        dest = dst;
      } else if (src && Math.random() < 0.5) {
        origin = src;
        to = outside();
      } else if (dst) {
        from = outside();
        dest = dst;
      } else if (src) {
        from = outside();
        dest = src;
      }
    } else {
      // échanges avec l'extérieur
      const b = this.pickActive(Math.random() < 0.5 ? Ls.res : Ls.work.length ? Ls.work : Ls.res);
      if (!b) return;
      if (Math.random() < 0.5) {
        origin = b;
        to = outside();
      } else {
        from = outside();
        dest = b;
      }
    }
    if (origin) from = this.accessOf(origin);
    if (dest) to = this.accessOf(dest);
    if (!from || !to || from.seg.comp !== to.seg.comp) return;
    if (from.seg === to.seg && Math.abs(from.s - to.s) < 30) return;
    if (G.transit && origin && dest && G.transit.tryRide(origin, dest)) return;
    const v = this.spawn(type, from, to, { color, kind: 'trip', dest: dest ? { b: dest.id } : { outside: true } });
    if (v) this.counts.trips++;
  }

  spawnMoving(b) {
    let moving = 0;
    for (const v of this.vehicles) if (v.kind === 'moving') moving++;
    if (moving > 8 + G.sim.stats.pop / 400) return null;
    const from = this.outsideAccess();
    const to = this.accessOf(b);
    if (!from || !to || from.seg.comp !== to.seg.comp) return null;
    return this.spawn('moving', from, to, { kind: 'moving', color: 0xffffff, dest: { b: b.id } });
  }

  // Véhicule de service : aller, travail sur place, retour
  spawnService(home, target, vtype, kind) {
    const from = this.accessOf(home);
    const to = this.accessOf(target);
    if (!from || !to) return false;
    const v = this.spawn(vtype, from, to, { kind: 'service', force: true, color: 0xffffff, dest: { b: target.id } });
    if (!v) return false;
    v.home = home.id;
    v.target = target.id;
    v.svc = kind;
    v.phase = 'go';
    v.onDespawn = () => {
      if (v.phase !== 'done') {
        const h = G.buildings.get(v.home);
        if (h) G.sim.serviceReturn(h);
      }
    };
    v.onArrive = () => {
      if (v.phase === 'go') {
        v.phase = 'work';
        v.wait = kind === 'fire' ? 6 : kind === 'garbage' ? 2.5 : 3.5;
        v.afterWait = () => {
          const t = G.buildings.get(v.target);
          const h = G.buildings.get(v.home);
          if (t && h) G.sim.serviceArrive(h, t, kind);
          if (!h) return false;
          v.phase = 'back';
          v.dest = { b: h.id };
          return this.setPath(v, this.accessOf(h));
        };
        return true;
      }
      if (v.phase === 'back') {
        v.phase = 'done';
        const h = G.buildings.get(v.home);
        if (h) G.sim.serviceReturn(h);
      }
      return false;
    };
    return true;
  }

  // ---------------------------------------------------------------- routes modifiées
  onRoadsChanged() {
    const dead = [];
    for (const [key, slot] of this.slots) {
      if (slot.seg.dead || !G.roads.segs.has(slot.seg.id)) {
        for (const v of slot.list) dead.push(v);
        slot.list.length = 0;
        this.slots.delete(key);
        continue;
      }
      slot.geo = this.laneGeo(slot.seg, slot.dir, slot.k);
      for (const v of slot.list) {
        v.ci = 0;
        if (v.si === v.steps.length - 1) v.endPos = this.toLanePos(slot.geo, v.steps[v.si].s1);
        else v.endPos = slot.geo.len;
        if (v.pos > slot.geo.len) v.pos = slot.geo.len;
      }
    }
    for (const v of dead) this.relocate(v);
    for (const v of [...this.vehicles]) {
      if (!this.vehicles.has(v)) continue;
      let broken = false;
      for (let i = v.si; i < v.steps.length; i++) if (v.steps[i].seg.dead) broken = true;
      if (broken) this.rerouteToDest(v);
    }
  }

  destAccess(v) {
    if (!v.dest) return null;
    if (v.dest.b) return this.accessOf(G.buildings.get(v.dest.b));
    if (v.dest.outside) return this.outsideAccess();
    if (v.dest.access) return v.dest.access();
    return null;
  }

  rerouteToDest(v) {
    if (!this.setPath(v, this.destAccess(v))) this.despawn(v);
  }

  relocate(v) {
    const hit = G.roads.nearestSeg(v.x, v.z, 10);
    if (!hit) {
      this.vehicles.has(v) && this.forceRemove(v);
      return;
    }
    const seg = hit.seg;
    const p = G.roads.pointAt(seg, hit.s);
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    let dir = fx * p.tx + fz * p.tz >= 0 ? 1 : -1;
    if (this.laneCount(seg, dir) === 0) dir = -dir;
    if (this.laneCount(seg, dir) === 0) {
      this.forceRemove(v);
      return;
    }
    v.steps = [{ seg, dir, s0: hit.s, s1: dir === 1 ? seg.len : 0 }];
    v.lanesK = [0];
    v.allowed = null;
    v.pickedFor = -1;
    this.enterStep(v, 0, this.toLanePos(this.laneGeo(seg, dir, 0), hit.s));
    v.turn = null;
    if (!this.setPath(v, this.destAccess(v))) this.despawn(v);
  }

  forceRemove(v) {
    this.freeInst(v);
    this.vehicles.delete(v);
    if (v.onDespawn) v.onDespawn(v);
  }

  computeDensity() {
    for (const seg of G.roads.segs.values()) seg._vc = 0;
    for (const slot of this.slots.values()) slot.seg._vc += slot.list.length;
    for (const seg of G.roads.segs.values()) {
      const t = ROAD_TYPES[seg.type];
      const lanes = t.lanes[0] + t.lanes[1];
      const cap = Math.max(1, ((seg.len - seg.trimA - seg.trimB) * lanes) / 9);
      seg.density = seg.density * 0.7 + Math.min(1.5, seg._vc / cap) * 0.3;
    }
  }

  paintSignals() {
    const F = G.roads.meshes.furniture;
    if (!F.signalLamps) return;
    const refs = F.signalRefs;
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      const node = G.roads.nodes.get(ref.node);
      if (!node || !node.signal) continue;
      const s = node.signal;
      const g = s.groups[ref.seg];
      if (s.phase === g) _col.setHex(s.amber ? 0xffb020 : 0x30ff70);
      else _col.setHex(0xff3030);
      F.signalLamps.setColorAt(i, _col);
    }
    if (F.signalLamps.instanceColor) F.signalLamps.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- rendu
  place(v) {
    let x;
    let y;
    let z;
    let tx;
    let tz;
    if (v.pos < 0 && v.turn) {
      const T = v.turn;
      const t = clamp((v.pos + T.len) / T.len, 0, 1);
      cbez(T.p0, T.p1, T.p2, T.p3, t, _p);
      cbezTan(T.p0, T.p1, T.p2, T.p3, t, _t);
      x = _p.x;
      y = _p.y;
      z = _p.z;
      tx = _t.x;
      tz = _t.z;
    } else {
      const L = v.slot.geo;
      const pos = clamp(v.pos, 0, L.len);
      let i = v.ci || 0;
      if (i >= L.pts.length - 1 || L.cum[i] > pos) i = 0;
      while (i < L.pts.length - 2 && L.cum[i + 1] < pos) i++;
      v.ci = i;
      const a = L.pts[i];
      const b = L.pts[i + 1] || a;
      const seg = L.cum[i + 1] - L.cum[i] || 1;
      const f = clamp((pos - L.cum[i]) / seg, 0, 1);
      x = a.x + (b.x - a.x) * f;
      y = a.y + (b.y - a.y) * f;
      z = a.z + (b.z - a.z) * f;
      tx = (b.x - a.x) / seg;
      tz = (b.z - a.z) / seg;
    }
    v.x = x;
    v.y = y;
    v.z = z;
    if (tx || tz) v.yaw = Math.atan2(tx, tz);
  }

  render() {
    for (const type in this.meshes) {
      const M = this.meshes[type];
      const arr = M.mesh.instanceMatrix.array;
      for (const v of M.list) {
        this.place(v);
        const c = Math.cos(v.yaw);
        const s = Math.sin(v.yaw);
        const o = v.inst * 16;
        arr[o] = c;
        arr[o + 1] = 0;
        arr[o + 2] = -s;
        arr[o + 3] = 0;
        arr[o + 4] = 0;
        arr[o + 5] = 1;
        arr[o + 6] = 0;
        arr[o + 7] = 0;
        arr[o + 8] = s;
        arr[o + 9] = 0;
        arr[o + 10] = c;
        arr[o + 11] = 0;
        arr[o + 12] = v.x;
        arr[o + 13] = v.y;
        arr[o + 14] = v.z;
        arr[o + 15] = 1;
      }
      M.mesh.count = M.list.length;
      M.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  clear() {
    for (const v of [...this.vehicles]) this.forceRemove(v);
    for (const s of this.slots.values()) s.list.length = 0;
    this.slots.clear();
  }

  countByKind() {
    const c = {};
    for (const v of this.vehicles) c[v.kind] = (c[v.kind] || 0) + 1;
    return c;
  }
}
