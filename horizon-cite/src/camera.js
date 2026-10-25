// Caméra de city-builder : déplacement ZQSD/flèches, rotation, inclinaison, zoom vers le curseur, tactile.
import * as THREE from 'three';
import { clamp, lerp } from './util.js';
import { heightAt } from './terrain.js';
import { WATER_LEVEL } from './config.js';

export class CameraController {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.want = { x: -560, z: 0, yaw: 0.9, pitch: 0.82, dist: 420 };
    this.cur = { ...this.want };
    this.keys = new Set();
    this.drag = null;
    this.pointers = new Map();
    this.enabled = true;
    this.allowLeftPan = true;
    this.target = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.onLeftClick = null;
    this.autoOrbit = false;
    this.bind();
  }

  bind() {
    const d = this.dom;
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        const k = Math.exp(clamp(e.deltaY, -120, 120) * 0.0016);
        this.zoomAt(e.clientX, e.clientY, k);
      },
      { passive: false }
    );
    d.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
  }

  onDown(e) {
    if (!this.enabled) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (e.pointerType === 'touch') {
      if (this.pointers.size === 2) {
        this.drag = { mode: 'touch2', ...this.touchState() };
      } else if (this.pointers.size === 1) {
        this.drag = { mode: 'touch1', x: e.clientX, y: e.clientY, moved: false, panning: this.allowLeftPan };
      }
      return;
    }
    if (e.button === 2) this.drag = { mode: 'rotate', x: e.clientX, y: e.clientY, moved: false };
    else if (e.button === 1) {
      e.preventDefault();
      this.drag = { mode: 'pan', x: e.clientX, y: e.clientY, moved: false };
    } else if (e.button === 0 && this.allowLeftPan) this.drag = { mode: 'leftpan', x: e.clientX, y: e.clientY, moved: false };
  }

  touchState() {
    const p = [...this.pointers.values()];
    const cx = (p[0].x + p[1].x) / 2;
    const cy = (p[0].y + p[1].y) / 2;
    const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    const ang = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x);
    return { cx, cy, dist, ang };
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (p) {
      p.x = e.clientX;
      p.y = e.clientY;
    }
    const dr = this.drag;
    if (!dr) return;
    if (dr.mode === 'touch2' && this.pointers.size >= 2) {
      const s = this.touchState();
      const k = dr.dist / Math.max(10, s.dist);
      this.want.dist = clamp(this.want.dist * k, 22, 2400);
      this.want.yaw -= s.ang - dr.ang;
      this.panPixels(s.cx - dr.cx, s.cy - dr.cy);
      Object.assign(dr, s);
      return;
    }
    const dx = e.clientX - dr.x;
    const dy = e.clientY - dr.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) dr.moved = true;
    if (dr.mode === 'rotate') {
      this.want.yaw -= dx * 0.005;
      this.want.pitch = clamp(this.want.pitch + dy * 0.004, 0.16, 1.52);
    } else if (dr.mode === 'pan' || dr.mode === 'leftpan' || (dr.mode === 'touch1' && dr.panning)) {
      if (dr.moved) this.panPixels(dx, dy);
    }
    dr.x = e.clientX;
    dr.y = e.clientY;
  }

  onUp(e) {
    this.pointers.delete(e.pointerId);
    const dr = this.drag;
    if (dr && dr.mode === 'touch2' && this.pointers.size < 2) {
      this.drag = null;
      return;
    }
    if (dr && this.pointers.size === 0) this.drag = null;
    if (e.pointerType !== 'touch' && dr && (e.button === 2 || e.button === 1 || e.button === 0)) this.drag = null;
  }

  // Le dernier glissement a-t-il bougé (pour distinguer clic et glissé) ?
  isDragging() {
    return this.drag && this.drag.moved;
  }

  panPixels(dx, dy) {
    const k = (this.cur.dist * 1.15) / Math.max(400, this.dom.clientHeight);
    const yaw = this.cur.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    this.want.x += (-dx * rx + dy * fx) * k;
    this.want.z += (-dx * rz + dy * fz) * k;
    this.clampTarget();
  }

  clampTarget() {
    this.want.x = clamp(this.want.x, -1150, 1150);
    this.want.z = clamp(this.want.z, -1150, 1150);
  }

  zoomAt(sx, sy, k) {
    const before = this.want.dist;
    const after = clamp(before * k, 22, 2400);
    const hit = this.pickGround(sx, sy);
    if (hit && after < before) {
      const f = 1 - after / before;
      this.want.x += (hit.x - this.want.x) * f * 0.9;
      this.want.z += (hit.z - this.want.z) * f * 0.9;
    }
    this.want.dist = after;
    // à faible distance on autorise une vue plus rasante
    this.clampTarget();
  }

  // Lancer de rayon analytique sur le relief (ou la surface de l'eau)
  pickGround(sx, sy, ndcIn) {
    const rect = this.dom.getBoundingClientRect();
    const ndc = ndcIn || new THREE.Vector2(((sx - rect.left) / rect.width) * 2 - 1, -((sy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const o = this.raycaster.ray.origin;
    const dir = this.raycaster.ray.direction;
    const f = (t) => {
      const x = o.x + dir.x * t;
      const z = o.z + dir.z * t;
      return o.y + dir.y * t - Math.max(heightAt(x, z), WATER_LEVEL);
    };
    let t0 = 0;
    let v0 = f(0);
    if (v0 < 0) return null;
    let step = Math.max(4, this.cur.dist * 0.02);
    let t = step;
    const maxT = 12000;
    while (t < maxT) {
      const v = f(t);
      if (v < 0) {
        let a = t0;
        let b = t;
        for (let i = 0; i < 24; i++) {
          const m = (a + b) / 2;
          if (f(m) > 0) a = m;
          else b = m;
        }
        const x = o.x + dir.x * b;
        const z = o.z + dir.z * b;
        const h = heightAt(x, z);
        return { x, z, y: Math.max(h, WATER_LEVEL), water: h < WATER_LEVEL };
      }
      t0 = t;
      v0 = v;
      step *= 1.06;
      t += step;
    }
    return null;
  }

  flyTo(x, z, dist) {
    this.want.x = x;
    this.want.z = z;
    if (dist) this.want.dist = dist;
  }

  update(dt) {
    const w = this.want;
    const k = this.keys;
    if (this.enabled) {
      const sp = w.dist * 1.1 * dt * (k.has('ShiftLeft') || k.has('ShiftRight') ? 2.5 : 1);
      let mx = 0;
      let mz = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) mz += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) mz -= 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
      if (mx || mz) {
        const yaw = this.cur.yaw;
        w.x += (mz * -Math.sin(yaw) + mx * Math.cos(yaw)) * sp;
        w.z += (mz * -Math.cos(yaw) + mx * -Math.sin(yaw)) * sp;
        this.clampTarget();
      }
      if (k.has('KeyQ')) w.yaw += dt * 1.6;
      if (k.has('KeyE')) w.yaw -= dt * 1.6;
      if (k.has('KeyR')) w.dist = clamp(w.dist * Math.exp(-dt * 1.8), 22, 2400);
      if (k.has('KeyF')) w.dist = clamp(w.dist * Math.exp(dt * 1.8), 22, 2400);
      if (k.has('KeyT')) w.pitch = clamp(w.pitch + dt * 0.9, 0.16, 1.52);
      if (k.has('KeyG')) w.pitch = clamp(w.pitch - dt * 0.9, 0.16, 1.52);
    }
    if (this.autoOrbit) w.yaw += dt * 0.05;
    const a = clamp(1 - Math.exp(-dt * 10), 0, 1);
    const c = this.cur;
    c.x = lerp(c.x, w.x, a);
    c.z = lerp(c.z, w.z, a);
    c.yaw = lerp(c.yaw, w.yaw, a);
    c.pitch = lerp(c.pitch, w.pitch, a);
    c.dist = Math.exp(lerp(Math.log(c.dist), Math.log(w.dist), a));
    if (!Number.isFinite(c.x + c.z + c.yaw + c.pitch + c.dist)) Object.assign(c, w);

    const ty = Math.max(heightAt(c.x, c.z), WATER_LEVEL);
    this.target.set(c.x, ty, c.z);
    // vue plus rasante permise quand on est proche
    const minPitch = lerp(0.12, 0.42, clamp((c.dist - 60) / 1200, 0, 1));
    const pitch = Math.max(c.pitch, minPitch);
    const cp = Math.cos(pitch);
    let px = c.x + Math.sin(c.yaw) * cp * c.dist;
    let pz = c.z + Math.cos(c.yaw) * cp * c.dist;
    let py = ty + Math.sin(pitch) * c.dist;
    const ground = Math.max(heightAt(px, pz), WATER_LEVEL) + 4;
    if (py < ground) py = ground;
    this.camera.position.set(px, py, pz);
    this.camera.lookAt(this.target);
    // plan proche/lointain adaptés
    this.camera.near = clamp(c.dist * 0.02, 0.5, 20);
    this.camera.far = 20000;
    this.camera.updateProjectionMatrix();
  }

  info() {
    return { target: this.target, dist: this.cur.dist, camPos: this.camera.position };
  }
}
