// Piétons décoratifs sur les trottoirs, autour de la caméra (visibles de près).
import * as THREE from 'three';
import { G } from './state.js';
import { ROAD_TYPES, ROAD_Y } from './config.js';
import { heightAt } from './terrain.js';
import { BGeo, PAL } from './buildgen.js';
import { MATS } from './materials.js';

const CLOTHES = [0x3d5a80, 0xc0392b, 0x2c3e50, 0xe0a030, 0x7f8c8d, 0x27ae60, 0x8e44ad, 0xd35400, 0xecf0f1, 0x34495e, 0xb03a5b, 0x16a085];
const _c = new THREE.Color();

function pedGeometry() {
  const g = new BGeo();
  const skin = new THREE.Color(0xd9a77f);
  g.box(-0.17, 0, -0.1, -0.03, 0.85, 0.1, PAL.dark);
  g.box(0.03, 0, -0.1, 0.17, 0.85, 0.1, PAL.dark);
  g.box(-0.22, 0.85, -0.13, 0.22, 1.45, 0.13, PAL.white);
  g.box(-0.11, 1.47, -0.11, 0.11, 1.72, 0.11, skin);
  return g.build();
}

export class Pedestrians {
  constructor(scene) {
    this.cap = 700;
    this.mesh = new THREE.InstancedMesh(pedGeometry(), MATS.city, this.cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3).fill(1), 3);
    scene.add(this.mesh);
    this.list = [];
    this.spawnT = 0;
    G.on('roads:changed', () => {
      this.list = this.list.filter((p) => !p.seg.dead && G.roads.segs.has(p.seg.id));
    });
  }

  walkable(seg) {
    return seg && !seg.dead && ROAD_TYPES[seg.type].sidewalk && seg.len - seg.trimA - seg.trimB > 6;
  }

  spawnNear(cx, cz) {
    const segs = G.roads.segHash.queryRadius(cx, cz, 260).filter((s) => this.walkable(s));
    if (!segs.length) return;
    const seg = segs[Math.floor(Math.random() * segs.length)];
    const s = seg.trimA + Math.random() * (seg.len - seg.trimA - seg.trimB);
    this.list.push({
      seg,
      s,
      side: Math.random() < 0.5 ? 1 : -1,
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: 1.1 + Math.random() * 0.6,
      lat: (Math.random() - 0.5) * 1.6,
      color: CLOTHES[Math.floor(Math.random() * CLOTHES.length)],
      phase: Math.random() * 10,
      life: 40 + Math.random() * 80,
    });
  }

  // passage au segment voisin à un carrefour
  turn(p) {
    const net = G.roads;
    const nodeId = p.dir === 1 ? p.seg.b : p.seg.a;
    const node = net.nodes.get(nodeId);
    const options = node ? node.segs.map((id) => net.segs.get(id)).filter((s) => s !== p.seg && this.walkable(s)) : [];
    if (!options.length) {
      p.dir = -p.dir;
      return;
    }
    const next = options[Math.floor(Math.random() * options.length)];
    const atA = next.a === nodeId;
    p.seg = next;
    p.dir = atA ? 1 : -1;
    p.s = atA ? next.trimA : next.len - next.trimB;
    p.side = Math.random() < 0.5 ? 1 : -1;
  }

  update(realDt, simDt) {
    const cam = G.cam;
    const near = cam.cur.dist < 520 && G.running !== false;
    this.mesh.visible = near;
    if (!near) return;
    const S = G.sim.stats;
    const night = G.env ? G.env.night : 0;
    const want = Math.min(this.cap, Math.round((S.pop / 8 + S.jobs / 25) * (1 - night * 0.7) * (cam.cur.dist < 250 ? 1 : 0.6)));
    const cx = cam.target.x;
    const cz = cam.target.z;
    this.spawnT += realDt;
    while (this.list.length < want && this.spawnT > 0.02) {
      this.spawnT -= 0.02;
      this.spawnNear(cx + (Math.random() - 0.5) * 300, cz + (Math.random() - 0.5) * 300);
    }
    const dt = simDt > 0 ? Math.min(0.1, realDt * Math.min(2, G.sim.speed)) : 0;
    const arr = this.mesh.instanceMatrix.array;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= realDt;
      const dx = p.seg.pts[0].x - cx;
      const dz = p.seg.pts[0].z - cz;
      if (p.life < 0 || dx * dx + dz * dz > 520 * 520 || this.list.length > want + 40) {
        this.list[i] = this.list[this.list.length - 1];
        this.list.pop();
        continue;
      }
      p.s += p.dir * p.speed * dt;
      p.phase += dt * p.speed * 5;
      if (p.s > p.seg.len - p.seg.trimB || p.s < p.seg.trimA) this.turn(p);
    }
    for (const p of this.list) {
      if (n >= this.cap) break;
      const seg = p.seg;
      const pt = G.roads.pointAt(seg, p.s);
      const t = ROAD_TYPES[seg.type];
      const off = (t.width / 2 - (t.width - t.carriage) / 4 + p.lat * 0.4) * p.side;
      const x = pt.x - pt.tz * off;
      const z = pt.z + pt.tx * off;
      const y = heightAt(x, z) + ROAD_Y + 0.2 + Math.abs(Math.sin(p.phase)) * 0.05;
      const yaw = Math.atan2(pt.tx * p.dir, pt.tz * p.dir);
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const o = n * 16;
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
      arr[o + 12] = x;
      arr[o + 13] = y;
      arr[o + 14] = z;
      arr[o + 15] = 1;
      if (p.inst !== n) {
        p.inst = n;
        _c.setHex(p.color);
        this.mesh.setColorAt(n, _c);
        this.mesh.instanceColor.needsUpdate = true;
      }
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.list = [];
    this.mesh.count = 0;
  }
}
