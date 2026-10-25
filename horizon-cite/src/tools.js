// Outils du joueur : sélection, routes (droites, courbes, amélioration), zonage, services,
// bulldozer, arbres, lignes de bus. Gère la souris, le tactile et les raccourcis clavier.
import * as THREE from 'three';
import { G } from './state.js';
import { ROAD_TYPES, SERVICE_BY_ID, ZONES, WATER_LEVEL, MILESTONES } from './config.js';
import { heightAt } from './terrain.js';
import { serviceSpot } from './placement.js';
import { MATS } from './materials.js';
import { fmtMoney, fmtInt, angleDiff, obbCorners, distToObb } from './util.js';

const SVC_VIEW = { power: 'power', water: 'water', garbage: 'garbage', health: 'health', fire: 'fire', police: 'crime', education: 'education', transport: 'transport', parks: 'landvalue', monuments: 'happiness' };

function ringMesh(inner, color, opacity = 0.9) {
  const g = new THREE.RingGeometry(inner, 1, 72);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false }));
  m.renderOrder = 30;
  m.visible = false;
  return m;
}

export class Tools {
  constructor(scene, canvas) {
    this.scene = scene;
    this.canvas = canvas;
    this.tool = 'none';
    this.opts = {};
    this.mouse = { x: 0, y: 0, inside: false };
    this.hover = null;
    this.shift = false;
    this.down = false;
    this.ghost = null;
    this.cursor = ringMesh(0.86, 0xffffff, 0.85);
    this.snapRing = ringMesh(0.7, 0x7fd4ff, 0.95);
    this.covRing = ringMesh(0.985, 0x7fd4ff, 0.7);
    this.covDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.12, depthTest: false, depthWrite: false })
    );
    this.covDisc.renderOrder = 29;
    this.covDisc.visible = false;
    scene.add(this.cursor, this.snapRing, this.covRing, this.covDisc);
    this.road = { stage: 0 };
    this.tintedSeg = null;
    this.prevInfo = null;
    this.lastPaint = 0;
    this.bind();
  }

  bind() {
    const c = this.canvas;
    c.addEventListener('pointermove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = true;
      this.shift = e.shiftKey;
      if (this.down && G.cam.pointers.size < 2) this.drag();
    });
    c.addEventListener('pointerleave', () => {
      this.mouse.inside = false;
      if (G.ui) G.ui.hideTip();
    });
    c.addEventListener('pointerdown', (e) => {
      if (!G.running) return;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (e.button === 2) this.rightAt = { x: e.clientX, y: e.clientY };
      if (e.button === 0) {
        this.down = true;
        this.downAt = { x: e.clientX, y: e.clientY };
        this.refreshHover();
        this.press();
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 2) {
        // un clic droit annule ; un glisser au clic droit fait seulement pivoter la caméra
        const r = this.rightAt;
        this.rightAt = null;
        if (r && Math.hypot(e.clientX - r.x, e.clientY - r.y) < 6) this.cancel();
        return;
      }
      if (e.button !== 0 || !this.down) return;
      this.down = false;
      const moved = this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 6;
      if (G.cam.pointers.size > 0 && e.pointerType === 'touch') return;
      if (!moved || this.tool === 'zone' || this.tool === 'bulldoze' || this.tool === 'trees') this.click(moved);
      this.release();
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.shift = e.shiftKey;
      if (e.key === 'Escape') {
        if (this.tool !== 'none') {
          if (this.tool === 'road' && this.road.stage > 0) this.road = { stage: 0 };
          else this.set('none');
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    });
    window.addEventListener('keyup', (e) => (this.shift = e.shiftKey));
  }

  // ---------------------------------------------------------------- état
  set(tool, opts = {}) {
    this.clearGhost();
    this.untint();
    if (G.buildings) G.buildings.setHighlight(null);
    if (this.tool === 'busline' && G.transit) G.transit.toolCancel();
    this.tool = tool;
    this.opts = opts;
    this.road = { stage: 0 };
    this.cursor.visible = false;
    this.snapRing.visible = false;
    this.covRing.visible = false;
    this.covDisc.visible = false;
    G.cam.allowLeftPan = tool === 'none';
    G.zones.setShowAll(tool === 'zone');
    if (G.terrain) G.terrain.uniforms.uGrid.value = tool === 'road' || tool === 'zone' || tool === 'service' ? 1 : 0;
    // vue d'information associée (comme dans l'original)
    if (G.info) {
      const want = tool === 'service' ? SVC_VIEW[SERVICE_BY_ID[opts.id].cat] : tool === 'busline' ? 'transport' : null;
      if (want) {
        if (this.prevInfo === null) this.prevInfo = G.info.mode || '';
        G.info.setMode(want);
      } else if (this.prevInfo !== null) {
        G.info.setMode(this.prevInfo || null);
        this.prevInfo = null;
      }
    }
    if (tool === 'service') {
      const geo = G.buildings.serviceGeo(opts.id).geo;
      this.ghost = new THREE.Mesh(geo, MATS.ghost);
      this.ghost.renderOrder = 6;
      this.scene.add(this.ghost);
    }
    if (G.ui) {
      G.ui.hideTip();
      G.ui.onTool(tool, opts);
    }
    G.emit('tool', { tool, opts });
  }

  clearGhost() {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      if (this.tool !== 'service') this.ghost.geometry.dispose();
      this.ghost = null;
    }
  }

  untint() {
    if (this.tintedSeg) {
      const seg = this.tintedSeg;
      this.tintedSeg = null;
      if (!seg.dead) G.roads.meshes.setInfoTint(seg, G.info ? G.info.roadTint(seg) : null);
    }
  }

  tintSeg(seg, color) {
    if (this.tintedSeg === seg && this.tintColor === color) return;
    this.untint();
    if (!seg) return;
    this.tintedSeg = seg;
    this.tintColor = color;
    G.roads.meshes.setInfoTint(seg, color);
  }

  cancel() {
    if (this.tool === 'road' && this.road.stage > 0) {
      this.road = { stage: 0 };
      this.clearGhost();
      return;
    }
    if (this.tool === 'busline' && G.transit && G.transit.toolHasStops()) {
      G.transit.toolCancel();
      return;
    }
    if (this.tool !== 'none') this.set('none');
  }

  refreshHover() {
    if (!this.mouse.inside) {
      this.hover = null;
      return;
    }
    this.hover = G.cam.pickGround(this.mouse.x, this.mouse.y);
  }

  tip(html, bad = false) {
    if (G.ui) G.ui.tip(html, this.mouse.x, this.mouse.y, bad);
  }

  money() {
    return G.sim.money;
  }

  canPay(cost) {
    return G.sim.sandbox || G.sim.money >= cost;
  }

  pay(cost) {
    if (!G.sim.sandbox) G.sim.money -= cost;
    G.emit('money:spent', cost);
  }

  // ---------------------------------------------------------------- boucle
  update() {
    if (!G.running) return;
    this.refreshHover();
    const p = this.hover;
    this.cursor.visible = false;
    this.snapRing.visible = false;
    if (!p) {
      if (this.tool === 'none' && G.buildings) G.buildings.setHighlight(null);
      return;
    }
    switch (this.tool) {
      case 'none':
        return this.selectMove(p);
      case 'road':
        return this.roadMove(p);
      case 'zone':
        return this.zoneMove(p);
      case 'service':
        return this.serviceMove(p);
      case 'bulldoze':
        return this.bullMove(p);
      case 'trees':
        return this.treesMove(p);
      case 'busline':
        return G.transit && G.transit.toolMove(p, this);
    }
  }

  press() {
    const p = this.hover;
    if (!p) return;
    if (this.tool === 'zone' && this.opts.brush !== 'fill') this.zonePaint(p);
    if (this.tool === 'bulldoze') this.bullDrag = true;
    if (this.tool === 'trees') this.plant(p);
  }

  drag() {
    this.refreshHover();
    const p = this.hover;
    if (!p) return;
    if (this.tool === 'zone' && this.opts.brush !== 'fill') this.zonePaint(p);
    if (this.tool === 'bulldoze') this.bullAt(p, true);
    if (this.tool === 'trees') {
      const now = performance.now();
      if (now - this.lastPaint > 90) {
        this.lastPaint = now;
        this.plant(p);
      }
    }
  }

  release() {
    this.bullDrag = false;
  }

  click(moved) {
    const p = this.hover;
    if (!p) return;
    switch (this.tool) {
      case 'none':
        if (!moved) this.selectClick(p);
        break;
      case 'road':
        this.roadClick(p);
        break;
      case 'zone':
        if (this.opts.brush === 'fill' && !moved) this.zoneFill(p);
        break;
      case 'service':
        this.serviceClick();
        break;
      case 'bulldoze':
        if (!moved) this.bullAt(p, false);
        break;
      case 'busline':
        if (G.transit) G.transit.toolClick(p, this);
        break;
    }
  }

  placeRing(ring, x, z, r, color) {
    ring.visible = true;
    ring.position.set(x, Math.max(heightAt(x, z), WATER_LEVEL) + 0.6, z);
    ring.scale.set(r, 1, r);
    if (color !== undefined) ring.material.color.setHex(color);
  }

  // ---------------------------------------------------------------- sélection
  selectMove(p) {
    const b = G.buildings.at(p.x, p.z);
    G.buildings.setHighlight(b, MATS.highlight);
    this.canvas.style.cursor = b ? 'pointer' : '';
  }

  selectClick(p) {
    const b = G.buildings.at(p.x, p.z);
    if (b && G.ui) G.ui.inspect(b);
    else if (G.ui) G.ui.inspect(null);
  }

  // ---------------------------------------------------------------- routes
  angleSnap(st, snap) {
    const s = st.start;
    const dx = snap.x - s.x;
    const dz = snap.z - s.z;
    const len = Math.hypot(dx, dz);
    if (len < 4) return snap;
    let ang = Math.atan2(dz, dx);
    const bases = [0];
    if (s.kind === 'node') {
      for (const sid of s.node.segs) {
        const d = G.roads.dirAway(G.roads.segs.get(sid), s.node.id);
        bases.push(Math.atan2(d.z, d.x));
      }
    } else if (s.kind === 'seg') {
      const p = G.roads.pointAt(s.seg, s.s);
      bases.push(Math.atan2(p.tz, p.tx));
    }
    let best = null;
    let err = 0.055;
    for (const b of bases) {
      for (let k = 0; k < 24; k++) {
        const a = b + (k * Math.PI) / 12;
        const e = Math.abs(angleDiff(ang, a));
        if (e < err) {
          err = e;
          best = a;
        }
      }
    }
    if (best !== null) ang = best;
    let L = len;
    const Lr = Math.round(L / 8) * 8;
    if (Math.abs(Lr - L) < 2.2) L = Lr;
    return { kind: 'free', x: s.x + Math.cos(ang) * L, z: s.z + Math.sin(ang) * L, snapped: best !== null };
  }

  roadMove(p) {
    const st = this.road;
    const typeId = this.opts.type;
    const type = ROAD_TYPES[typeId];
    if (this.opts.mode === 'upgrade') {
      const hit = G.roads.nearestSeg(p.x, p.z, 14);
      if (hit) {
        const same = hit.seg.type === typeId;
        const cost = same ? 0 : Math.round(hit.seg.len * type.cost * 0.7);
        const up = this.upgradePlan(hit.seg, typeId);
        const locked = G.sim.freeSegs.has(hit.seg.id);
        const bad = locked || !up.valid;
        this.tintSeg(hit.seg, bad ? 0xff6b6b : 0x7fd4ff);
        let txt = same ? (typeId === 'oneway' ? 'Cliquez pour inverser le sens' : 'Déjà de ce type') : `Améliorer en ${type.name}<br><b>${fmtMoney(cost)}</b>`;
        if (locked) txt = 'La connexion autoroutière ne peut pas être modifiée';
        else if (!up.valid) txt = `${up.reason}<br><span class="muted">Améliorer en ${type.name}</span>`;
        else if (up.demolish.length) txt += `<br><span class="muted">${up.demolish.length} bâtiment${up.demolish.length > 1 ? 's' : ''} à raser</span>`;
        this.tip(txt, bad || (!same && !this.canPay(cost)));
      } else {
        this.untint();
        this.tip('Survolez une route à améliorer');
      }
      return;
    }
    let snap = this.shift ? { kind: 'free', x: p.x, z: p.z } : G.roads.findSnap(p.x, p.z, typeId);
    if (st.stage >= 1 && snap.kind === 'free' && !this.shift && !(this.opts.mode === 'curve' && st.stage === 2)) snap = this.angleSnap(st, snap);
    st.cur = snap;
    this.placeRing(this.snapRing, snap.x, snap.z, snap.kind === 'free' ? 3 : type.width / 2 + 1.5, snap.kind === 'free' ? 0xffffff : 0x7fd4ff);
    if (st.stage === 0) {
      this.clearGhost();
      const locked = !G.sim.unlocked(type.unlock);
      this.tip(locked ? `${type.name}<br>Débloqué au palier « ${MILESTONES[type.unlock].name} »` : `${type.name}<br><span class="muted">Cliquez pour commencer la route</span>`, locked);
      return;
    }
    let plan;
    if (this.opts.mode === 'curve' && st.stage === 1) {
      plan = G.roads.planRoad(st.start, snap, null, typeId);
      this.showGhost(plan, typeId, true);
      this.tip(`Point de courbure<br><span class="muted">Cliquez pour plier la route</span>`);
      st.plan = null;
      return;
    }
    plan = G.roads.planRoad(st.start, snap, st.stage === 2 ? st.ctrl : null, typeId);
    st.plan = plan;
    this.showGhost(plan, typeId, plan.valid);
    const len = `${Math.round(plan.len)} m`;
    if (plan.valid) this.tip(`${len} · <b>${fmtMoney(plan.cost)}</b>`);
    else this.tip(`${plan.reason}<br>${len} · ${fmtMoney(plan.cost)}`, true);
  }

  upgradePlan(seg, typeId) {
    const ver = G.roads.version + ':' + G.buildings.version;
    const c = this.upCache;
    if (c && c.seg === seg && c.typeId === typeId && c.ver === ver) return c.plan;
    const plan = seg.type === typeId ? { valid: true, reason: '', demolish: [] } : G.roads.planUpgrade(seg, typeId);
    this.upCache = { seg, typeId, ver, plan };
    return plan;
  }

  showGhost(plan, typeId, valid) {
    this.clearGhost();
    if (!plan || !plan.curve || plan.curve.len < 1) return;
    const pseudo = { pts: plan.curve.pts, cum: plan.curve.cum, len: plan.curve.len };
    this.ghost = G.roads.meshes.ghostMesh(pseudo, ROAD_TYPES[typeId], valid);
    this.ghost.position.y = 0.25;
    this.scene.add(this.ghost);
  }

  roadClick() {
    const st = this.road;
    const typeId = this.opts.type;
    const type = ROAD_TYPES[typeId];
    if (!G.sim.unlocked(type.unlock)) {
      if (G.audio) G.audio.play('error');
      return;
    }
    if (this.opts.mode === 'upgrade') {
      const p = this.hover;
      const hit = G.roads.nearestSeg(p.x, p.z, 14);
      if (!hit) return;
      if (G.sim.freeSegs.has(hit.seg.id)) {
        if (G.ui) G.ui.toast("La connexion autoroutière ne peut pas être modifiée.", 'bad');
        return;
      }
      const cost = hit.seg.type === typeId ? 0 : Math.round(hit.seg.len * type.cost * 0.7);
      const up = this.upgradePlan(hit.seg, typeId);
      if (!up.valid) {
        if (G.ui) G.ui.toast(up.reason, 'bad');
        if (G.audio) G.audio.play('error');
        return;
      }
      if (!this.canPay(cost)) {
        if (G.audio) G.audio.play('error');
        return;
      }
      this.untint();
      G.roads.upgradeSegment(hit.seg, typeId, up.demolish);
      this.pay(cost);
      if (G.audio) G.audio.play('build');
      return;
    }
    if (!st.cur) return;
    if (st.stage === 0) {
      st.start = st.cur;
      st.stage = 1;
      return;
    }
    if (this.opts.mode === 'curve' && st.stage === 1) {
      st.ctrl = { x: st.cur.x, z: st.cur.z };
      st.stage = 2;
      return;
    }
    const plan = st.plan;
    if (!plan) return;
    if (!plan.valid) {
      if (G.audio) G.audio.play('error');
      return;
    }
    const segs = G.roads.buildPlan(plan);
    const now = performance.now();
    for (const s of segs) s.builtAt = now;
    this.pay(plan.cost);
    if (G.audio) G.audio.play('build');
    G.emit('built:road', plan);
    // on enchaîne depuis l'extrémité
    const end = G.roads.findSnap(plan.curve.bx, plan.curve.bz, typeId);
    st.start = end;
    st.ctrl = null;
    st.stage = 1;
    this.clearGhost();
  }

  // ---------------------------------------------------------------- zonage
  brushRadius() {
    return this.opts.brush === 'large' ? 22 : this.opts.brush === 'small' ? 5 : 4;
  }

  zoneMove(p) {
    const z = this.opts.zone;
    const col = z ? ZONES[z].color : 0xffffff;
    this.placeRing(this.cursor, p.x, p.z, this.brushRadius(), col);
    if (z && !G.sim.zoneUnlocked(z)) this.tip(`${ZONES[z].name}<br>Débloqué au palier « ${MILESTONES[ZONES[z].unlock].name} »`, true);
    else if (G.zones.cells.size === 0) this.tip('Construisez des routes : les cases de zonage apparaissent le long des routes.');
    else if (G.ui) G.ui.hideTip();
  }

  zonePaint(p) {
    const z = this.opts.zone;
    if (z && !G.sim.zoneUnlocked(z)) return;
    const n = G.zones.paint(p.x, p.z, this.brushRadius(), z);
    if (n && G.audio) G.audio.play('zone');
  }

  zoneFill(p) {
    const z = this.opts.zone;
    if (z && !G.sim.zoneUnlocked(z)) return;
    const n = G.zones.fill(p.x, p.z, z);
    if (n && G.audio) G.audio.play('zone');
  }

  // ---------------------------------------------------------------- services
  serviceMove(p) {
    const def = SERVICE_BY_ID[this.opts.id];
    const hit = G.roads.nearestSeg(p.x, p.z, 75, (s) => s.type !== 'highway');
    const g = this.ghost;
    let spot = null;
    if (hit) spot = serviceSpot(def.id, hit.seg, hit.s, hit.side);
    this.spot = spot;
    let reason = '';
    if (!G.sim.unlocked(def.unlock)) reason = `Débloqué au palier « ${MILESTONES[def.unlock].name} »`;
    else if (!spot) reason = 'Placez-le le long d’une route';
    else if (!spot.valid) reason = spot.reason;
    else if (!this.canPay(def.cost)) reason = 'Fonds insuffisants';
    const ok = !reason;
    if (g) {
      if (spot) {
        let y = heightAt(spot.x, spot.z);
        for (const c of obbCorners({ ...spot.obb, hw: spot.obb.hw * 0.85, hd: spot.obb.hd * 0.85 })) y = Math.max(y, heightAt(c.x, c.z));
        g.position.set(spot.x, y + 0.05, spot.z);
        g.rotation.y = Math.atan2(spot.vx, spot.vz);
      } else {
        g.position.set(p.x, heightAt(p.x, p.z), p.z);
      }
      g.material = ok ? MATS.ghost : MATS.ghostBad;
    }
    const r = def.cov ? def.cov.r : def.veh ? Math.min(def.veh.radius, 900) : 0;
    const cx = spot ? spot.x : p.x;
    const cz = spot ? spot.z : p.z;
    if (r) {
      this.placeRing(this.covRing, cx, cz, r, ok ? 0x7fd4ff : 0xff6060);
      this.covDisc.visible = true;
      this.covDisc.position.copy(this.covRing.position);
      this.covDisc.scale.set(r, 1, r);
      this.covDisc.material.color.setHex(ok ? 0x7fd4ff : 0xff6060);
    } else {
      this.covRing.visible = false;
      this.covDisc.visible = false;
    }
    const head = `<b>${def.name}</b> · ${fmtMoney(def.cost)}<br><span class="muted">Entretien ${fmtMoney(def.upkeep)}/sem.</span>`;
    this.tip(ok ? head : `${head}<br>${reason}`, !ok);
  }

  serviceClick() {
    const def = SERVICE_BY_ID[this.opts.id];
    const spot = this.spot;
    if (!spot || !spot.valid || !G.sim.unlocked(def.unlock) || !this.canPay(def.cost)) {
      if (G.audio) G.audio.play('error');
      return;
    }
    const b = G.buildings.placeService(def.id, spot.x, spot.z, spot.vx, spot.vz, spot.seg.id, spot.s, spot.side);
    b.placedAt = performance.now();
    this.pay(def.cost);
    if (G.audio) G.audio.play('build');
    G.emit('built:service', b);
    if (def.unique) this.set('none');
  }

  // ---------------------------------------------------------------- bulldozer
  bullMove(p) {
    const b = G.buildings.at(p.x, p.z);
    if (b) {
      this.untint();
      G.buildings.setHighlight(b, MATS.bad);
      const refund = this.refundOf(b);
      this.tip(`Démolir <b>${b.name}</b>${refund ? `<br>Remboursement ${fmtMoney(refund)}` : ''}`);
      return;
    }
    G.buildings.setHighlight(null);
    const hit = G.roads.nearestSeg(p.x, p.z, 12);
    if (hit && hit.d < ROAD_TYPES[hit.seg.type].width / 2 + 1) {
      this.tintSeg(hit.seg, 0xff5050);
      this.tip(G.sim.freeSegs.has(hit.seg.id) ? 'Connexion autoroutière (indestructible)' : `Démolir la route (${Math.round(hit.seg.len)} m)`, G.sim.freeSegs.has(hit.seg.id));
    } else {
      this.untint();
      this.placeRing(this.cursor, p.x, p.z, 6, 0xff5050);
      this.tip('Cliquez sur un bâtiment ou une route');
    }
  }

  refundOf(b) {
    if (b.kind !== 'service') return 0;
    const recent = b.placedAt && performance.now() - b.placedAt < 20000;
    return Math.round(b.def.cost * (recent ? 1 : 0.25));
  }

  bullAt(p, dragging) {
    const b = G.buildings.at(p.x, p.z);
    if (b) {
      const refund = this.refundOf(b);
      G.buildings.demolish(b.id);
      if (!G.sim.sandbox) G.sim.money += refund;
      if (G.audio) G.audio.play('demolish');
      if (G.ui) G.ui.inspect(null);
      return;
    }
    const hit = G.roads.nearestSeg(p.x, p.z, 12);
    if (hit && hit.d < ROAD_TYPES[hit.seg.type].width / 2 + 1) {
      if (G.sim.freeSegs.has(hit.seg.id)) return;
      const recent = hit.seg.builtAt && performance.now() - hit.seg.builtAt < 20000;
      const refund = recent ? Math.round(hit.seg.len * ROAD_TYPES[hit.seg.type].cost) : 0;
      this.untint();
      G.roads.removeSegment(hit.seg);
      if (!G.sim.sandbox) G.sim.money += refund;
      if (G.audio) G.audio.play('demolish');
    } else if (!dragging && G.trees) {
      if (G.trees.removeInRadius(p.x, p.z, 6) && G.audio) G.audio.play('demolish');
    }
  }

  // ---------------------------------------------------------------- arbres
  treesMove(p) {
    this.placeRing(this.cursor, p.x, p.z, 9, 0x7fe07f);
    this.tip(`Planter des arbres · ${fmtMoney(10)} l'arbre<br><span class="muted">Cliquez ou glissez</span>`);
  }

  plant(p) {
    let n = 0;
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * 9;
      const x = p.x + Math.cos(a) * d;
      const z = p.z + Math.sin(a) * d;
      const h = heightAt(x, z);
      if (h < WATER_LEVEL + 0.8) continue;
      if (G.buildings.at(x, z)) continue;
      const hit = G.roads.nearestSeg(x, z, 30);
      if (hit && hit.d < ROAD_TYPES[hit.seg.type].width / 2 + 1.5) continue;
      if (!this.canPay(10)) break;
      G.trees.addTree(x, z, Math.random() < 0.35 ? 0 : 1, 0.8 + Math.random() * 0.6, Math.random(), true, h);
      this.pay(10);
      n++;
    }
    if (n && G.audio) G.audio.play('plant');
  }
}
