// Particules : fumée des cheminées, vapeur, flammes des incendies, poussière de démolition.
import * as THREE from 'three';
import { G } from './state.js';

const VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying float vA;
varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;
  vA = aAlpha;
  vC = aColor;
}`;
const FRAG = `
uniform float uLight;
uniform float uAdd;
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float a = smoothstep(0.5, 0.05, r) * vA;
  if (a < 0.01) discard;
  vec3 c = uAdd > 0.5 ? vC : vC * uLight;
  gl_FragColor = vec4(c, a);
}`;

class Pool {
  constructor(scene, n, additive) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.col = new Float32Array(n * 3);
    this.a0 = new Float32Array(n);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 600 }, uLight: { value: 1 }, uAdd: { value: additive ? 1 : 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 8 : 7;
    scene.add(this.points);
    this.geo = g;
  }
  emit(x, y, z, vx, vy, vz, size, grow, life, r, gC, b, alpha) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.size[i] = size;
    this.grow[i] = grow;
    this.life[i] = 0;
    this.max[i] = life;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = gC;
    this.col[i * 3 + 2] = b;
    this.a0[i] = alpha;
    this.alpha[i] = alpha;
  }
  update(dt, wx, wz) {
    for (let i = 0; i < this.n; i++) {
      if (this.max[i] <= 0) continue;
      this.life[i] += dt;
      const t = this.life[i] / this.max[i];
      if (t >= 1) {
        this.max[i] = 0;
        this.alpha[i] = 0;
        continue;
      }
      this.pos[i * 3] += (this.vel[i * 3] + wx) * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += (this.vel[i * 3 + 2] + wz) * dt;
      this.vel[i * 3 + 1] *= 1 - dt * 0.3;
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = this.a0[i] * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }
}

export class FX {
  constructor(scene) {
    this.smoke = new Pool(scene, 3000, false);
    this.fire = new Pool(scene, 900, true);
    this.emitters = new Map();
    this.windX = 1.6;
    this.windZ = 0.7;
    G.on('bld:completed', (b) => this.addEmitters(b));
    G.on('bld:added', (b) => {
      if (b.state === 'active') this.addEmitters(b);
    });
    G.on('bld:level', (b) => this.addEmitters(b));
  }

  addEmitters(b) {
    this.emitters.delete(b.id);
    if (!b.smoke || !b.smoke.length || b.state !== 'active') return;
    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    const list = b.smoke.map(([lx, ly, lz, rate, kind]) => ({
      x: b.x + lx * c + lz * s,
      y: b.y + ly,
      z: b.z - lx * s + lz * c,
      rate,
      kind: kind || 'smoke',
      acc: Math.random(),
    }));
    this.emitters.set(b.id, { b, list });
  }

  removeEmitters(b) {
    this.emitters.delete(b.id);
  }

  dust(x, y, z, r) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * r;
      this.smoke.emit(x + Math.cos(a) * d, y + 1 + Math.random() * 3, z + Math.sin(a) * d, Math.cos(a) * 2, 1 + Math.random() * 2, Math.sin(a) * 2, 6 + Math.random() * 6, 5, 2.5 + Math.random(), 0.55, 0.47, 0.38, 0.75);
    }
  }

  update(realDt, simDt, camPos, uScale) {
    const day = G.env ? 1 - G.env.night * 0.75 : 1;
    this.smoke.uniforms.uLight.value = day;
    this.smoke.uniforms.uScale.value = uScale;
    this.fire.uniforms.uScale.value = uScale;
    const active = simDt > 0;
    if (active) {
      for (const { b, list } of this.emitters.values()) {
        if (b.state !== 'active' || b.power === false) continue;
        const dx = b.x - camPos.x;
        const dz = b.z - camPos.z;
        if (dx * dx + dz * dz > 2200 * 2200) continue;
        for (const e of list) {
          e.acc += realDt * e.rate * 6;
          while (e.acc >= 1) {
            e.acc -= 1;
            const steam = e.kind === 'steam';
            const g = steam ? 0.95 : 0.5 + Math.random() * 0.12;
            this.smoke.emit(
              e.x + (Math.random() - 0.5) * 0.8,
              e.y,
              e.z + (Math.random() - 0.5) * 0.8,
              (Math.random() - 0.5) * 0.6,
              steam ? 3 + Math.random() : 2.4 + Math.random() * 1.2,
              (Math.random() - 0.5) * 0.6,
              steam ? 9 : 3 + e.rate * 1.5,
              steam ? 7 : 3.2,
              steam ? 5 : 7 + Math.random() * 3,
              g,
              g,
              g * (steam ? 1 : 1.02),
              steam ? 0.55 : 0.5
            );
          }
        }
      }
      // incendies
      for (const id of G.sim.needs.fire) {
        const b = G.buildings.get(id);
        if (!b || !(b.fireT > 0)) continue;
        const h = Math.max(4, (b.height || 8) * 0.7);
        for (let k = 0; k < 3; k++) {
          const x = b.x + (Math.random() - 0.5) * b.hw * 1.4;
          const z = b.z + (Math.random() - 0.5) * b.hd * 1.4;
          this.fire.emit(x, b.y + Math.random() * h, z, 0, 3 + Math.random() * 3, 0, 5 + Math.random() * 4, -2, 0.9 + Math.random() * 0.5, 1.0, 0.45 + Math.random() * 0.25, 0.1, 0.9);
        }
        this.smoke.emit(b.x, b.y + h + 2, b.z, 0, 4, 0, 8, 6, 6, 0.18, 0.17, 0.16, 0.7);
      }
    }
    const sd = active ? realDt * Math.min(2, Math.max(1, simDt / Math.max(realDt, 1e-4))) : 0;
    this.smoke.update(sd, this.windX, this.windZ);
    this.fire.update(sd, this.windX * 0.3, this.windZ * 0.3);
  }

  clear() {
    this.emitters.clear();
  }
}
