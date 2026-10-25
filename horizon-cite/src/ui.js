// Interface : écran titre, barre du bas (population, demande RCI, budget, date, vitesses),
// panneaux d'outils avec miniatures 3D, inspecteur, budget, vues d'information, Gazouille, menu.
import * as THREE from 'three';
import { G } from './state.js';
import { ROAD_TYPES, ZONES, SERVICES, SERVICE_BY_ID, CATEGORIES, MILESTONES, START_YEAR, QUALITY } from './config.js';
import { ICON, INFO_ICON } from './uiicons.js';
import { VIEWS } from './info.js';
import { PROBLEMS, iconURL } from './icons.js';
import { cityUniforms, MATS } from './materials.js';
import { fmtMoney, fmtInt, fmtSigned, MONTHS, clamp } from './util.js';
import { saveSlot, loadSlot, readMeta, deleteSlot, exportCode, importCode, hasAnySave } from './save.js';

const $ = (sel, root = document) => root.querySelector(sel);
const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function dateOf(day) {
  const d = new Date(START_YEAR, 0, 1);
  d.setDate(d.getDate() + day);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const CAT_LIST = [...CATEGORIES.map((c) => c.id), 'economy', 'bulldoze'];
const CAT_NAME = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name]));
CAT_NAME.economy = 'Économie';
CAT_NAME.bulldoze = 'Bulldozer';
const CAT_SHORT = { roads: 'Routes', zoning: 'Zonage', power: 'Électricité', water: 'Eau', garbage: 'Déchets', health: 'Santé', fire: 'Pompiers', police: 'Police', education: 'Éducation', transport: 'Transports', parks: 'Parcs', monuments: 'Monuments', economy: 'Économie', bulldoze: 'Bulldozer' };

export class UI {
  constructor() {
    this.root = $('#ui');
    this.cat = null;
    this.thumbs = new Map();
    this.inspected = null;
    this.tickT = 0;
    this.build();
    this.bindKeys();
    G.on('milestone', (e) => this.onMilestone(e));
    G.on('chirp', (m) => this.onChirp(m));
    G.on('info:mode', (m) => this.onInfoMode(m));
    G.on('bld:removed', (b) => {
      if (this.inspected === b) this.inspect(null);
    });
    G.on('game:new', () => this.afterStart());
    G.on('game:loaded', () => this.afterStart());
  }

  // ---------------------------------------------------------------- structure
  build() {
    const r = this.root;
    r.innerHTML = '';
    // barre du haut
    r.appendChild(
      h(`<div class="top-left">
        <button class="hud-btn" id="btn-info" title="Vues d'information (I)">${ICON.info}<span>Vues</span></button>
        <div class="advisor" id="advisor" hidden><div class="adv-title">Conseil</div><div class="adv-text" id="adv-text"></div></div>
      </div>`)
    );
    r.appendChild(
      h(`<div class="top-center">
        <button class="chirp-btn" id="btn-chirp" title="Gazouille, le fil des habitants">${ICON.bird}<span class="badge" id="chirp-badge" hidden>0</span></button>
        <div class="chirp-bubble" id="chirp-bubble" hidden></div>
      </div>`)
    );
    r.appendChild(
      h(`<div class="top-right">
        <button class="hud-btn icon-only" id="btn-sound" title="Son">${ICON.sound}</button>
        <button class="hud-btn icon-only" id="btn-help" title="Commandes (F1)">${ICON.help}</button>
        <button class="hud-btn icon-only" id="btn-menu" title="Menu (Échap)">${ICON.menu}</button>
      </div>`)
    );
    // panneaux flottants
    r.appendChild(h(`<div class="panel info-panel" id="info-panel" hidden></div>`));
    r.appendChild(h(`<div class="panel legend" id="legend" hidden></div>`));
    r.appendChild(h(`<div class="panel chirp-feed" id="chirp-feed" hidden></div>`));
    r.appendChild(h(`<div class="panel inspector" id="inspector" hidden></div>`));
    r.appendChild(h(`<div class="panel tool-panel" id="tool-panel" hidden></div>`));
    r.appendChild(h(`<div class="toasts" id="toasts"></div>`));
    r.appendChild(h(`<div class="tooltip" id="tooltip" hidden></div>`));
    r.appendChild(h(`<div class="modal-wrap" id="modal" hidden><div class="panel modal" id="modal-body"></div></div>`));
    // barre du bas
    r.appendChild(
      h(`<div class="bottom">
        <div class="milestone" id="milestone" title=""><div class="ms-fill" id="ms-fill"></div><div class="ms-label" id="ms-label"></div></div>
        <div class="bar">
          <div class="bar-left">
            <div class="stat pop" title="Population">${ICON.people}<div><b id="st-pop">0</b><small id="st-popd"></small></div></div>
            <div class="stat happy" id="st-happy" title="Bonheur">${ICON.smile}</div>
            <div class="rci" title="Demande : Résidentiel, Commercial, Industrie et bureaux">
              <div class="rci-col"><div class="rci-bar"><i id="rci-r" style="--c:var(--r)"></i></div><span>R</span></div>
              <div class="rci-col"><div class="rci-bar"><i id="rci-c" style="--c:var(--c)"></i></div><span>C</span></div>
              <div class="rci-col"><div class="rci-bar"><i id="rci-i" style="--c:var(--i)"></i></div><span>I</span></div>
            </div>
          </div>
          <div class="bar-center" id="cats"></div>
          <div class="bar-right">
            <div class="money" title="Trésorerie et solde hebdomadaire estimé"><b id="st-money">₡ 0</b><small id="st-net"></small></div>
            <div class="date"><b id="st-date"></b><small id="st-clock"></small></div>
            <div class="speeds" id="speeds">
              <button data-sp="0" title="Pause (Espace)">${ICON.pause}</button>
              <button data-sp="1" title="Vitesse normale (1)">${ICON.play1}</button>
              <button data-sp="2" title="Rapide (2)">${ICON.play2}</button>
              <button data-sp="4" title="Très rapide (3)">${ICON.play3}</button>
            </div>
          </div>
        </div>
      </div>`)
    );
    const cats = $('#cats');
    for (const id of CAT_LIST) {
      const b = h(`<button class="cat" data-cat="${id}" title="${CAT_NAME[id]}">${ICON[id]}<span>${CAT_SHORT[id]}</span></button>`);
      cats.appendChild(b);
    }
    cats.addEventListener('click', (e) => {
      const b = e.target.closest('.cat');
      if (!b) return;
      this.click();
      this.openCat(b.dataset.cat);
    });
    $('#speeds').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.click();
      this.setSpeed(+b.dataset.sp);
    });
    $('#btn-info').addEventListener('click', () => {
      this.click();
      this.toggleInfoPanel();
    });
    $('#btn-chirp').addEventListener('click', () => {
      this.click();
      this.toggleChirp();
    });
    $('#btn-menu').addEventListener('click', () => {
      this.click();
      this.openMenu();
    });
    $('#btn-help').addEventListener('click', () => {
      this.click();
      this.openHelp();
    });
    $('#btn-sound').addEventListener('click', () => {
      if (!G.audio) return;
      G.audio.unlock();
      G.audio.setMuted(!G.audio.muted);
      this.refreshSound();
    });
    $('#modal').addEventListener('pointerdown', (e) => {
      if (e.target.id === 'modal' && this.modalClosable) this.closeModal();
    });
    this.refreshSound();
    this.buildInfoPanel();
    this.buildTitle();
  }

  click() {
    if (G.audio) G.audio.play('click');
  }

  refreshSound() {
    const b = $('#btn-sound');
    if (b) b.innerHTML = G.audio && G.audio.muted ? ICON.mute : ICON.sound;
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!G.running) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.setSpeed(G.sim.paused ? G.sim.speed : 0);
      } else if (e.code === 'Digit1' || e.code === 'Numpad1') this.setSpeed(1);
      else if (e.code === 'Digit2' || e.code === 'Numpad2') this.setSpeed(2);
      else if (e.code === 'Digit3' || e.code === 'Numpad3') this.setSpeed(4);
      else if (e.key === 'Escape') {
        if (!$('#modal').hidden) this.closeModal();
        else if (this.cat) this.closeCat();
        else if (!$('#inspector').hidden) this.inspect(null);
        else if (!$('#info-panel').hidden || G.info.mode) {
          $('#info-panel').hidden = true;
          G.info.setMode(null);
        } else this.openMenu();
      } else if (e.code === 'KeyB' || e.code === 'Delete') this.openCat('bulldoze');
      else if (e.code === 'KeyI') this.toggleInfoPanel();
      else if (e.code === 'F1') {
        e.preventDefault();
        this.openHelp();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        e.preventDefault();
        this.quickSave();
      }
    });
  }

  // ---------------------------------------------------------------- vitesse
  setSpeed(sp) {
    const sim = G.sim;
    if (sp === 0) sim.paused = true;
    else {
      sim.paused = false;
      sim.speed = sp;
    }
    for (const b of document.querySelectorAll('#speeds button')) {
      const v = +b.dataset.sp;
      b.classList.toggle('on', sim.paused ? v === 0 : v === sim.speed);
    }
    document.body.classList.toggle('paused', sim.paused);
  }

  // ---------------------------------------------------------------- catégories
  openCat(id) {
    if (this.cat === id && id !== 'bulldoze') return this.closeCat();
    if (id === 'economy') {
      this.closeCat();
      return this.openBudget();
    }
    this.cat = id;
    for (const b of document.querySelectorAll('.cat')) b.classList.toggle('on', b.dataset.cat === id);
    if (id === 'bulldoze') {
      if (G.tools.tool === 'bulldoze') return this.closeCat();
      $('#tool-panel').hidden = true;
      G.tools.set('bulldoze');
      return;
    }
    if (G.audio) G.audio.play('open');
    this.renderToolPanel();
  }

  closeCat() {
    this.cat = null;
    for (const b of document.querySelectorAll('.cat')) b.classList.remove('on');
    $('#tool-panel').hidden = true;
    if (G.tools.tool !== 'none') G.tools.set('none');
  }

  onTool(tool, opts) {
    if (tool === 'none' && this.cat === 'bulldoze') {
      this.cat = null;
      for (const b of document.querySelectorAll('.cat')) b.classList.remove('on');
    }
    for (const el of document.querySelectorAll('.item')) {
      const on =
        (tool === 'road' && el.dataset.kind === 'road' && el.dataset.id === opts.type) ||
        (tool === 'zone' && el.dataset.kind === 'zone' && +el.dataset.id === opts.zone) ||
        (tool === 'service' && el.dataset.kind === 'service' && el.dataset.id === opts.id) ||
        (tool === el.dataset.kind && (tool === 'trees' || tool === 'busline'));
      el.classList.toggle('on', on);
    }
  }

  itemsFor(cat) {
    const sim = G.sim;
    if (cat === 'roads') {
      return Object.values(ROAD_TYPES).map((t) => ({
        kind: 'road',
        id: t.id,
        name: t.name,
        price: `${fmtMoney(t.cost * 100).replace('₡ ', '₡ ')} / 100 m`,
        desc: t.desc,
        unlock: t.unlock,
        thumb: this.roadThumb(t),
      }));
    }
    if (cat === 'zoning') {
      const z = ZONES.slice(1).map((zn) => ({ kind: 'zone', id: zn.id, name: zn.name, price: 'Gratuit', desc: `Les bâtiments ${zn.short.toLowerCase()} poussent selon la demande.`, unlock: zn.unlock, thumb: this.zoneThumb(zn) }));
      z.push({ kind: 'zone', id: 0, name: 'Dézoner', price: 'Gratuit', desc: 'Retire le zonage des cases (les bâtiments présents sont démolis).', unlock: 0, thumb: this.zoneThumb(null) });
      return z;
    }
    const list = SERVICES.filter((s) => s.cat === cat).map((s) => ({
      kind: 'service',
      id: s.id,
      name: s.name,
      price: fmtMoney(s.cost),
      desc: `${s.desc}<br><span class="muted">Entretien ${fmtMoney(s.upkeep)}/sem.${s.power ? ` · ${s.power} MW` : ''}${s.water ? ` · ${s.water} m³` : ''}${s.sewage ? ` · ${s.sewage} m³ traités` : ''}${s.cov ? ` · rayon ${s.cov.r} m` : ''}${s.veh ? ` · ${s.veh.count} véhicules` : ''}</span>`,
      unlock: s.unlock,
      unique: s.unique,
      built: s.unique && G.buildings.uniques.has(s.id),
      thumb: null,
    }));
    if (cat === 'transport') list.push({ kind: 'busline', id: 'busline', name: 'Ligne de bus', price: '₡ 120/sem. + bus', desc: 'Cliquez sur les routes pour placer les arrêts, revenez au premier pour fermer la ligne.', unlock: 4, thumb: null, icon: ICON.busline });
    if (cat === 'parks') list.push({ kind: 'trees', id: 'trees', name: 'Planter des arbres', price: '₡ 10 / arbre', desc: 'Pinceau de plantation. Les arbres embellissent la ville.', unlock: 0, thumb: null, icon: ICON.tree });
    return list.map((it) => ({ ...it, locked: !sim.unlocked(it.unlock) }));
  }

  renderToolPanel() {
    const cat = this.cat;
    const p = $('#tool-panel');
    p.hidden = false;
    const items = this.itemsFor(cat);
    let modes = '';
    if (cat === 'roads') {
      const m = G.tools.tool === 'road' ? G.tools.opts.mode : 'straight';
      modes = `<div class="modes" id="modes">
        <button data-mode="straight" class="${m === 'straight' ? 'on' : ''}" title="Route droite">${ICON.straight}<span>Droite</span></button>
        <button data-mode="curve" class="${m === 'curve' ? 'on' : ''}" title="Route courbe">${ICON.curve}<span>Courbe</span></button>
        <button data-mode="upgrade" class="${m === 'upgrade' ? 'on' : ''}" title="Améliorer une route existante">${ICON.upgrade}<span>Améliorer</span></button>
      </div>`;
    } else if (cat === 'zoning') {
      const br = G.tools.tool === 'zone' ? G.tools.opts.brush : 'small';
      modes = `<div class="modes" id="modes">
        <button data-brush="fill" class="${br === 'fill' ? 'on' : ''}" title="Remplir un îlot">${ICON.fill}<span>Remplir</span></button>
        <button data-brush="small" class="${br === 'small' ? 'on' : ''}" title="Petit pinceau">${ICON.brushS}<span>Petit</span></button>
        <button data-brush="large" class="${br === 'large' ? 'on' : ''}" title="Grand pinceau">${ICON.brushL}<span>Grand</span></button>
      </div>`;
    }
    let extra = '';
    if (cat === 'transport' && G.transit && G.transit.lines.length) {
      extra = `<div class="lines">${G.transit.lines
        .map(
          (l) => `<div class="line-row"><i style="background:#${l.color.toString(16).padStart(6, '0')}"></i><span>Ligne ${l.id} · ${esc(G.transit.describe(l))}</span><button class="mini danger" data-del-line="${l.id}" title="Supprimer la ligne">${ICON.trash}</button></div>`
        )
        .join('')}</div>`;
    }
    p.innerHTML = `<div class="tp-head"><h3>${CAT_NAME[cat]}</h3>${modes}<button class="mini close" id="tp-close" title="Fermer">${ICON.close}</button></div>
      <div class="items" id="items">${items
        .map(
          (it) => `<button class="item ${it.locked ? 'locked' : ''} ${it.built ? 'built' : ''}" data-kind="${it.kind}" data-id="${it.id}" data-tip="${esc(`<b>${it.name}</b><br>${it.desc}${it.locked ? `<br><span class="bad">Débloqué au palier « ${MILESTONES[it.unlock].name} » (${fmtInt(MILESTONES[it.unlock].pop)} hab.)</span>` : ''}${it.built ? '<br><span class="bad">Déjà construit</span>' : ''}`)}">
            <span class="thumb">${it.thumb ? `<img alt="" src="${it.thumb}">` : it.icon ? it.icon : '<span class="ph"></span>'}</span>
            <span class="iname">${it.name}</span>
            <span class="iprice">${it.price}</span>
            ${it.locked ? `<span class="lock">${MILESTONES[it.unlock].name}</span>` : ''}
          </button>`
        )
        .join('')}</div>${extra}`;
    $('#tp-close').onclick = () => this.closeCat();
    const modesEl = $('#modes');
    if (modesEl) {
      modesEl.onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        this.click();
        for (const x of modesEl.querySelectorAll('button')) x.classList.toggle('on', x === b);
        if (b.dataset.mode) {
          const type = G.tools.tool === 'road' ? G.tools.opts.type : 'small';
          G.tools.set('road', { type, mode: b.dataset.mode });
        }
        if (b.dataset.brush) {
          const zone = G.tools.tool === 'zone' ? G.tools.opts.zone : 1;
          G.tools.set('zone', { zone, brush: b.dataset.brush });
        }
      };
    }
    const itemsEl = $('#items');
    itemsEl.onclick = (e) => {
      const b = e.target.closest('.item');
      if (!b) return;
      if (b.classList.contains('locked') || b.classList.contains('built')) {
        if (G.audio) G.audio.play('error');
        return;
      }
      this.click();
      const kind = b.dataset.kind;
      const id = b.dataset.id;
      if (kind === 'road') {
        const mode = $('#modes .on') ? $('#modes .on').dataset.mode : 'straight';
        G.tools.set('road', { type: id, mode });
      } else if (kind === 'zone') {
        const brush = $('#modes .on') ? $('#modes .on').dataset.brush : 'small';
        G.tools.set('zone', { zone: +id, brush });
      } else if (kind === 'service') G.tools.set('service', { id });
      else if (kind === 'trees') G.tools.set('trees');
      else if (kind === 'busline') G.tools.set('busline');
    };
    itemsEl.onpointermove = (e) => {
      const b = e.target.closest('.item');
      if (!b) return this.hideTip();
      const r = b.getBoundingClientRect();
      this.tip(b.dataset.tip, r.left + r.width / 2, r.top - 8, false, 'above');
    };
    itemsEl.onpointerleave = () => this.hideTip();
    p.onclick = (e) => {
      const d = e.target.closest('[data-del-line]');
      if (!d) return;
      const l = G.transit.lines.find((x) => x.id === +d.dataset.delLine);
      if (l) G.transit.removeLine(l);
      this.renderToolPanel();
    };
    // sélection par défaut
    if (cat === 'roads' && G.tools.tool !== 'road') G.tools.set('road', { type: 'small', mode: 'straight' });
    else if (cat === 'zoning' && G.tools.tool !== 'zone') G.tools.set('zone', { zone: 1, brush: 'small' });
    else if (!['roads', 'zoning'].includes(cat) && G.tools.tool !== 'none' && !['service', 'trees', 'busline'].includes(G.tools.tool)) G.tools.set('none');
    else this.onTool(G.tools.tool, G.tools.opts);
    // miniatures 3D des services (paresseuses)
    requestAnimationFrame(() => {
      for (const el of itemsEl.querySelectorAll('.item[data-kind="service"]')) {
        const img = this.serviceThumb(el.dataset.id);
        if (img) el.querySelector('.thumb').innerHTML = `<img alt="" src="${img}">`;
      }
    });
  }

  // ---------------------------------------------------------------- miniatures
  roadThumb(t) {
    const key = 'road:' + t.id;
    if (this.thumbs.has(key)) return this.thumbs.get(key);
    const tex = G.roads.meshes.textures[t.id];
    const src = tex.image;
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = 90;
    const g = c.getContext('2d');
    g.fillStyle = '#6d8f45';
    g.fillRect(0, 0, 120, 90);
    g.save();
    g.translate(60, 45);
    g.rotate(-0.5);
    const w = 22 + t.width * 1.4;
    g.drawImage(src, 0, 0, src.width, src.height / 2, -w / 2, -80, w, 160);
    g.restore();
    const url = c.toDataURL();
    this.thumbs.set(key, url);
    return url;
  }

  zoneThumb(z) {
    const key = 'zone:' + (z ? z.id : 0);
    if (this.thumbs.has(key)) return this.thumbs.get(key);
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = 90;
    const g = c.getContext('2d');
    g.fillStyle = '#5e7f3e';
    g.fillRect(0, 0, 120, 90);
    const col = z ? '#' + z.color.toString(16).padStart(6, '0') : '#ffffff';
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        g.fillStyle = col;
        g.globalAlpha = z ? 0.85 : 0.35;
        g.fillRect(12 + i * 25, 10 + j * 25, 22, 22);
      }
    }
    g.globalAlpha = 1;
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillText(z ? (z.cat === 'O' ? 'B' : z.cat) : '×', 61, 47);
    g.fillStyle = '#fff';
    g.fillText(z ? (z.cat === 'O' ? 'B' : z.cat) : '×', 60, 45);
    const url = c.toDataURL();
    this.thumbs.set(key, url);
    return url;
  }

  serviceThumb(id) {
    const key = 'svc:' + id;
    if (this.thumbs.has(key)) return this.thumbs.get(key);
    try {
      const W = 160;
      const H = 120;
      if (!this.thumbScene) {
        const sc = new THREE.Scene();
        sc.add(new THREE.HemisphereLight(0xdfeaff, 0x5a5040, 1.3));
        const d = new THREE.DirectionalLight(0xfff2e0, 2.6);
        d.position.set(1, 1.6, 0.8);
        sc.add(d);
        this.thumbScene = sc;
        this.thumbCam = new THREE.PerspectiveCamera(30, W / H, 0.5, 4000);
        this.thumbRT = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
      }
      const geo = G.buildings.serviceGeo(id).geo;
      const mesh = new THREE.Mesh(geo, MATS.city);
      this.thumbScene.add(mesh);
      if (id === 'wind') {
        const rot = new THREE.Mesh(G.buildings.rotorGeo, MATS.city);
        rot.position.set(0, 53.7, -2.7);
        mesh.add(rot);
      }
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const size = bb.getSize(new THREE.Vector3());
      const ctr = bb.getCenter(new THREE.Vector3());
      const R = Math.max(size.x, size.y * 1.15, size.z) * 0.95 + 4;
      const cam = this.thumbCam;
      cam.position.set(ctr.x - R * 1.05, ctr.y + R * 0.85, ctr.z - R * 1.25);
      cam.lookAt(ctr);
      cam.near = R * 0.05;
      cam.far = R * 10;
      cam.updateProjectionMatrix();
      const r = G.renderer;
      const prevNight = cityUniforms.uNight.value;
      const prevInfo = cityUniforms.uInfo.value;
      cityUniforms.uNight.value = 0;
      cityUniforms.uInfo.value = 0;
      const prevTarget = r.getRenderTarget();
      r.setRenderTarget(this.thumbRT);
      r.setClearColor(0x000000, 0);
      r.clear();
      r.render(this.thumbScene, cam);
      const px = new Uint8Array(W * H * 4);
      r.readRenderTargetPixels(this.thumbRT, 0, 0, W, H, px);
      r.setRenderTarget(prevTarget);
      cityUniforms.uNight.value = prevNight;
      cityUniforms.uInfo.value = prevInfo;
      this.thumbScene.remove(mesh);
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      const img = g.createImageData(W, H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const si = ((H - 1 - y) * W + x) * 4;
          const di = (y * W + x) * 4;
          for (let k = 0; k < 3; k++) {
            const v = px[si + k] / 255;
            const lin = v / (1 + v * 0.15);
            img.data[di + k] = Math.round(255 * Math.pow(Math.min(1, lin * 1.05), 1 / 2.2));
          }
          img.data[di + 3] = px[si + 3];
        }
      }
      g.putImageData(img, 0, 0);
      const url = c.toDataURL();
      this.thumbs.set(key, url);
      return url;
    } catch (e) {
      console.warn('miniature impossible', id, e);
      return null;
    }
  }

  // ---------------------------------------------------------------- infobulle
  tip(html, x, y, bad = false, pos = 'cursor') {
    const t = $('#tooltip');
    t.hidden = false;
    t.innerHTML = html;
    t.classList.toggle('bad', bad);
    const w = t.offsetWidth;
    const hgt = t.offsetHeight;
    let left;
    let top;
    if (pos === 'above') {
      left = x - w / 2;
      top = y - hgt;
    } else {
      left = x + 18;
      top = y + 18;
    }
    left = clamp(left, 8, window.innerWidth - w - 8);
    top = clamp(top, 8, window.innerHeight - hgt - 8);
    t.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  hideTip() {
    const t = $('#tooltip');
    if (t) t.hidden = true;
  }

  toast(text, kind = 'info', ms = 4200) {
    const el = h(`<div class="toast ${kind}">${text}</div>`);
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 500);
  }

  // ---------------------------------------------------------------- vues d'information
  buildInfoPanel() {
    const p = $('#info-panel');
    p.innerHTML = `<div class="ip-head"><h3>Vues d'information</h3></div><div class="ip-grid">${Object.entries(VIEWS)
      .map(([k, v]) => `<button data-view="${k}" title="${v.name}">${INFO_ICON[k] || ICON.info}<span>${v.name}</span></button>`)
      .join('')}</div>`;
    p.onclick = (e) => {
      const b = e.target.closest('button[data-view]');
      if (!b) return;
      this.click();
      const v = b.dataset.view;
      G.tools.prevInfo = null;
      G.info.setMode(G.info.mode === v ? null : v);
    };
  }

  toggleInfoPanel() {
    const p = $('#info-panel');
    p.hidden = !p.hidden;
    if (p.hidden && G.info.mode && G.tools.prevInfo === null) G.info.setMode(null);
  }

  onInfoMode(mode) {
    for (const b of document.querySelectorAll('#info-panel button')) b.classList.toggle('on', b.dataset.view === mode);
    const lg = $('#legend');
    if (!mode) {
      lg.hidden = true;
      return;
    }
    const v = VIEWS[mode];
    lg.hidden = false;
    lg.innerHTML = `<h4>${INFO_ICON[mode] || ''}${v.name}</h4>${v.legend.map(([c, t]) => `<div class="lg-row"><i style="background:${c}"></i>${t}</div>`).join('')}${this.infoSummary(mode)}`;
  }

  infoSummary(mode) {
    const U = G.sim.util;
    const r = (a, b, unit) => `<div class="lg-sum">${fmtInt(a)} / ${fmtInt(b)} ${unit}</div>`;
    if (mode === 'power') return `<div class="lg-sum">Production ${fmtInt(U.powerProd)} MW · Consommation ${fmtInt(U.powerUse)} MW</div>`;
    if (mode === 'water') return `<div class="lg-sum">Eau ${fmtInt(U.waterProd)} / ${fmtInt(U.waterUse)} m³ · Égouts ${fmtInt(U.sewageCap)} / ${fmtInt(U.sewageUse)} m³</div>`;
    if (mode === 'garbage') return U.garbageCap ? r(U.garbageStock, U.garbageCap, 'en décharge') : '';
    return '';
  }

  // ---------------------------------------------------------------- Gazouille
  toggleChirp() {
    const f = $('#chirp-feed');
    f.hidden = !f.hidden;
    if (!f.hidden) {
      G.chirper.markRead();
      this.renderChirps();
      $('#chirp-bubble').hidden = true;
    }
    this.refreshBadge();
  }

  renderChirps() {
    const f = $('#chirp-feed');
    f.innerHTML = `<div class="cf-head"><h3>${ICON.bird}Gazouille</h3><button class="mini close" id="cf-close">${ICON.close}</button></div><div class="cf-list">${
      G.chirper.feed.map((m) => `<div class="chirp"><div class="av" style="background:hsl(${m.hue} 55% 45%)">${esc(m.name[0])}</div><div><div class="who"><b>${esc(m.name)}</b> <span>${esc(m.handle)} · ${dateOf(m.day)}</span></div><div class="txt">${esc(m.text)}</div></div></div>`).join('') || '<div class="empty">Aucun message pour le moment.</div>'
    }</div>`;
    $('#cf-close').onclick = () => this.toggleChirp();
  }

  onChirp(m) {
    if (!$('#chirp-feed').hidden) {
      G.chirper.markRead();
      this.renderChirps();
    } else {
      const b = $('#chirp-bubble');
      b.hidden = false;
      b.innerHTML = `<b>${esc(m.name)}</b> ${esc(m.text)}`;
      clearTimeout(this.bubbleT);
      this.bubbleT = setTimeout(() => (b.hidden = true), 6500);
    }
    this.refreshBadge();
  }

  refreshBadge() {
    const n = G.chirper ? G.chirper.unread : 0;
    const bd = $('#chirp-badge');
    bd.hidden = n === 0;
    bd.textContent = n > 9 ? '9+' : String(n);
  }

  // ---------------------------------------------------------------- paliers
  onMilestone({ index, m }) {
    const unlocked = [];
    for (const t of Object.values(ROAD_TYPES)) if (t.unlock === index) unlocked.push(t.name);
    for (const z of ZONES) if (z && z.unlock === index) unlocked.push(z.name);
    for (const s of SERVICES) if (s.unlock === index) unlocked.push(s.name);
    if (index === 4) unlocked.push('Lignes de bus');
    if (G.audio) G.audio.play('milestone');
    const el = h(`<div class="milestone-pop"><div class="mp-kicker">Nouveau palier atteint</div><div class="mp-title">${m.name}</div><div class="mp-reward">Récompense : ${fmtMoney(m.reward)}</div>${unlocked.length ? `<div class="mp-unlock"><b>Débloqué :</b> ${unlocked.join(' · ')}</div>` : ''}</div>`);
    this.root.appendChild(el);
    setTimeout(() => el.classList.add('out'), 6500);
    setTimeout(() => el.remove(), 7200);
    if (this.cat) this.renderToolPanel();
  }

  // ---------------------------------------------------------------- inspecteur
  inspect(b) {
    this.inspected = b;
    const p = $('#inspector');
    if (!b) {
      p.hidden = true;
      return;
    }
    p.hidden = false;
    this.renderInspector();
    if (G.audio) G.audio.play('open');
  }

  bar(label, v, max, good = true, txt = null) {
    const f = clamp(v / max, 0, 1);
    const col = good ? (f > 0.66 ? 'var(--good)' : f > 0.33 ? 'var(--warn)' : 'var(--bad)') : f > 0.66 ? 'var(--bad)' : f > 0.33 ? 'var(--warn)' : 'var(--good)';
    return `<div class="ib-row"><span>${label}</span><div class="ib-bar"><i style="width:${Math.round(f * 100)}%;background:${col}"></i></div><em>${txt === null ? Math.round(f * 100) + ' %' : txt}</em></div>`;
  }

  renderInspector() {
    const b = this.inspected;
    if (!b) return;
    const p = $('#inspector');
    const sim = G.sim;
    let kindLine;
    let body = '';
    const yes = (ok) => (ok ? '<span class="ok">Oui</span>' : '<span class="bad">Non</span>');
    if (b.kind === 'zone') {
      const z = ZONES[b.zone];
      const max = z.maxLevel;
      kindLine = `${z.name} · niveau ${b.level}/${max}`;
      const stars = Array.from({ length: max }, (_, i) => `<i class="${i < b.level ? 'on' : ''}"></i>`).join('');
      const res = b.zone <= 2;
      const cap = b.cap || sim.capacity(b);
      body += `<div class="levels" style="--zc:#${z.color.toString(16).padStart(6, '0')}">${stars}</div>`;
      body += `<div class="kv"><span>${res ? 'Habitants' : 'Employés'}</span><b>${fmtInt(b.occ)} / ${fmtInt(cap)}</b></div>`;
      if (b.state === 'building') body += `<div class="kv"><span>Chantier</span><b>${Math.round(b.progress * 100)} %</b></div>`;
      body += this.bar('Bonheur', b.happy, 100);
      body += this.bar('Valeur foncière', b.lv, 80, true, `₡ ${Math.round(b.lv * 9)}/m²`);
      body += this.bar('Éducation', b.edu, 3, true, ['Aucune', 'Primaire', 'Secondaire', 'Supérieure'][Math.min(3, Math.round(b.edu))]);
      body += this.bar('Criminalité', b.crime, 100, false);
      body += this.bar('Déchets', b.garbage, b.occ * 9 + 25, false);
      body += `<div class="kv-grid"><div><span>Électricité</span>${yes(b.power)}</div><div><span>Eau</span>${yes(b.water)}</div><div><span>Égouts</span>${yes(b.sewage)}</div><div><span>Accès routier</span>${yes(!!b.seg)}</div></div>`;
      if (b.dead || b.sick) body += `<div class="kv"><span>Malades / défunts</span><b>${b.sick} / ${b.dead}</b></div>`;
      if (b.level < max && b.zone <= 4) {
        const need = b.zone <= 2 ? [0, 22, 36, 50, 64][b.level] : [0, 30, 52][b.level];
        body += `<div class="hint">Prochain niveau : valeur foncière ${Math.round(b.lv)} / ${need}${b.zone <= 2 && b.level >= 2 ? ` · éducation ${b.edu.toFixed(1)} / ${[0, 0, 0.45, 0.9, 1.4][b.level]}` : ''}</div>`;
      }
    } else {
      const d = b.def;
      kindLine = `${CAT_NAME[d.cat] || ''} · entretien ${fmtMoney(d.upkeep)}/sem.`;
      if (d.power) body += `<div class="kv"><span>Production</span><b>${Math.round(d.power * (d.id === 'wind' ? sim.wind : 1))} MW</b></div>`;
      if (d.water) body += `<div class="kv"><span>Pompage</span><b>${fmtInt(d.water)} m³</b></div>`;
      if (d.sewage) body += `<div class="kv"><span>Évacuation</span><b>${fmtInt(d.sewage)} m³</b></div>`;
      if (d.capacity) body += this.bar(d.id === 'cemetery' ? 'Remplissage' : 'Remplissage', b.stock, d.capacity, false, `${fmtInt(b.stock)} / ${fmtInt(d.capacity)}`);
      if (d.veh) body += `<div class="kv"><span>Véhicules en service</span><b>${b.busy || 0} / ${d.veh.count}</b></div>`;
      if (d.cov) body += `<div class="kv"><span>Rayon d'action</span><b>${d.cov.r} m</b></div>`;
      if (d.jobs) body += `<div class="kv"><span>Employés</span><b>${fmtInt(b.occ)} / ${d.jobs}</b></div>`;
      if (d.happy) body += `<div class="kv"><span>Bonheur dans toute la ville</span><b>+${d.happy}</b></div>`;
      if (b.polluted) body += `<div class="hint bad">Cette pompe puise une eau polluée par un rejet d'eaux usées : éloignez-la.</div>`;
      body += `<div class="kv-grid"><div><span>Électricité</span>${d.power ? '<span class="ok">Produit</span>' : yes(b.power)}</div><div><span>Accès routier</span>${yes(!!b.seg)}</div></div>`;
    }
    const prob = b.problem ? `<div class="problem"><img alt="" src="${iconURL(b.problem)}"><span>${PROBLEMS[b.problem].label}</span></div>` : '';
    p.innerHTML = `<div class="in-head"><div><h3>${esc(b.name)}</h3><div class="muted">${kindLine}</div></div><button class="mini close" id="in-close" title="Fermer">${ICON.close}</button></div>
      ${prob}${body}
      <div class="in-actions"><button class="btn" id="in-focus">${ICON.target}Centrer</button><button class="btn danger" id="in-del">${ICON.bulldoze}Démolir</button></div>`;
    $('#in-close').onclick = () => this.inspect(null);
    $('#in-focus').onclick = () => G.cam.flyTo(b.x, b.z, Math.min(G.cam.want.dist, 260));
    $('#in-del').onclick = () => {
      const refund = G.tools.refundOf(b);
      G.buildings.demolish(b.id);
      if (!G.sim.sandbox) G.sim.money += refund;
      if (G.audio) G.audio.play('demolish');
      this.inspect(null);
    };
  }

  // ---------------------------------------------------------------- budget
  openBudget() {
    this.modalClosable = true;
    this.showModal(this.budgetHTML(), 'budget');
    this.bindBudget();
  }

  budgetHTML() {
    const sim = G.sim;
    const W = sim.estWeek || { income: {}, expense: {} };
    const wk = (o, k) => (o[k] || 0) * 7;
    const inc = [
      ['Résidentiel', wk(W.income, 'res')],
      ['Commercial', wk(W.income, 'com')],
      ['Industriel', wk(W.income, 'ind')],
      ['Bureaux', wk(W.income, 'office')],
      ['Transports', wk(W.income, 'transport')],
    ];
    const exp = [
      ['Services publics', wk(W.expense, 'services')],
      ['Entretien des routes', wk(W.expense, 'roads')],
      ['Transports', wk(W.expense, 'transport')],
      ['Remboursement des emprunts', wk(W.expense, 'loans')],
    ];
    const ti = inc.reduce((a, b) => a + b[1], 0);
    const te = exp.reduce((a, b) => a + b[1], 0);
    const tax = (k, label, color) => `<div class="tax"><span><i style="background:${color}"></i>${label}</span><input type="range" min="1" max="29" step="1" value="${sim.taxes[k]}" id="tax-${k}"><b id="taxv-${k}">${sim.taxes[k]} %</b></div>`;
    const offers = [
      [20000, 52, 0.03],
      [50000, 104, 0.05],
      [120000, 208, 0.08],
    ];
    const loans = sim.loans
      .map((l) => `<div class="loan-row">${fmtMoney(l.amount)} · reste ${fmtMoney(l.left)} · ${fmtMoney(l.weekly)}/sem.</div>`)
      .join('');
    return `<div class="md-head"><h2>${ICON.economy}Budget de ${esc(G.cityName)}</h2><button class="mini close" data-close>${ICON.close}</button></div>
      <div class="budget">
        <section><h4>Recettes / semaine</h4>${inc.map(([k, v]) => `<div class="kv"><span>${k}</span><b class="ok">${fmtMoney(v)}</b></div>`).join('')}<div class="kv total"><span>Total</span><b>${fmtMoney(ti)}</b></div></section>
        <section><h4>Dépenses / semaine</h4>${exp.map(([k, v]) => `<div class="kv"><span>${k}</span><b class="bad">${fmtMoney(v)}</b></div>`).join('')}<div class="kv total"><span>Total</span><b>${fmtMoney(te)}</b></div></section>
        <section class="wide"><h4>Impôts</h4>${tax('res', 'Résidentiel', 'var(--r)')}${tax('com', 'Commercial', 'var(--c)')}${tax('ind', 'Industriel', 'var(--i)')}${tax('office', 'Bureaux', 'var(--o)')}<p class="muted small">Au-delà de 12 %, la demande et le bonheur baissent nettement. En dessous de 9 %, la ville attire plus de monde.</p></section>
        <section class="wide"><h4>Solde : <span class="${ti - te >= 0 ? 'ok' : 'bad'}">${fmtSigned(ti - te)} ₡ / semaine</span></h4><canvas id="hist" width="680" height="120"></canvas></section>
        <section class="wide"><h4>Emprunts</h4><div class="loans">${offers.map(([a, w, r], i) => `<button class="btn" data-loan="${i}" ${sim.loans.length >= 3 ? 'disabled' : ''}>${fmtMoney(a)} · ${w} sem. · ${Math.round(r * 100)} %</button>`).join('')}</div>${loans || '<p class="muted small">Aucun emprunt en cours.</p>'}</section>
      </div>`;
  }

  bindBudget() {
    const sim = G.sim;
    for (const k of ['res', 'com', 'ind', 'office']) {
      const el = $('#tax-' + k);
      el.oninput = () => {
        sim.taxes[k] = +el.value;
        $('#taxv-' + k).textContent = el.value + ' %';
      };
    }
    for (const b of document.querySelectorAll('[data-loan]')) {
      b.onclick = () => {
        const offers = [
          [20000, 52, 0.03],
          [50000, 104, 0.05],
          [120000, 208, 0.08],
        ];
        const [a, w, r] = offers[+b.dataset.loan];
        sim.takeLoan(a, w, r);
        if (G.audio) G.audio.play('coin');
        this.openBudget();
      };
    }
    this.drawHistory();
  }

  drawHistory() {
    const c = $('#hist');
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(c.clientWidth * dpr) || 680;
    c.height = Math.round(120 * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const H = G.sim.history.slice(-80);
    const W = c.width / dpr;
    const Hh = c.height / dpr;
    g.clearRect(0, 0, W, Hh);
    g.strokeStyle = 'rgba(160,190,220,0.15)';
    g.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, (Hh * i) / 4);
      g.lineTo(W, (Hh * i) / 4);
      g.stroke();
    }
    if (H.length < 2) {
      g.fillStyle = '#93a6ba';
      g.font = '13px system-ui, sans-serif';
      g.fillText("L'historique apparaîtra au fil des semaines.", 12, Hh / 2);
      return;
    }
    const plot = (key, color) => {
      const vals = H.map((x) => x[key]);
      const mn = Math.min(...vals);
      const mx = Math.max(...vals);
      const span = mx - mn || 1;
      g.beginPath();
      vals.forEach((v, i) => {
        const x = (i / (vals.length - 1)) * (W - 10) + 5;
        const y = Hh - 8 - ((v - mn) / span) * (Hh - 16);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.stroke();
    };
    plot('money', '#f2c43a');
    plot('pop', '#74d04c');
    g.font = '12px system-ui, sans-serif';
    g.fillStyle = '#74d04c';
    g.fillText('Population', 10, 16);
    g.fillStyle = '#f2c43a';
    g.fillText('Trésorerie', 90, 16);
  }

  // ---------------------------------------------------------------- fenêtres
  showModal(html, kind) {
    const m = $('#modal');
    m.hidden = false;
    m.dataset.kind = kind;
    $('#modal-body').innerHTML = html;
    $('#modal-body').className = 'panel modal m-' + kind;
    for (const c of document.querySelectorAll('[data-close]')) c.onclick = () => this.closeModal();
  }

  closeModal() {
    $('#modal').hidden = true;
    $('#modal').dataset.kind = '';
    if (this.menuPaused) {
      this.menuPaused = false;
      this.setSpeed(G.sim.speed);
    }
  }

  openMenu() {
    if (!G.sim.paused) {
      this.menuPaused = true;
      this.setSpeed(0);
    }
    this.modalClosable = true;
    this.showModal(
      `<div class="md-head"><h2>${esc(G.cityName)}</h2><button class="mini close" data-close>${ICON.close}</button></div>
      <div class="menu-grid">
        <button class="btn big" data-act="resume">Reprendre</button>
        <button class="btn big" data-act="save">Sauvegarder</button>
        <button class="btn big" data-act="load">Charger</button>
        <button class="btn big" data-act="options">Options</button>
        <button class="btn big" data-act="help">Commandes</button>
        <button class="btn big danger" data-act="title">Quitter vers l'écran titre</button>
      </div>`,
      'menu'
    );
    $('#modal-body').onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      this.click();
      const a = b.dataset.act;
      if (a === 'resume') this.closeModal();
      else if (a === 'save') this.openSaves('save');
      else if (a === 'load') this.openSaves('load');
      else if (a === 'options') this.openOptions();
      else if (a === 'help') this.openHelp();
      else if (a === 'title') {
        this.closeModal();
        this.showTitle();
      }
    };
  }

  openSaves(mode) {
    const meta = readMeta();
    const slots = ['1', '2', '3', 'auto'];
    const row = (s) => {
      const m = meta[s];
      const label = s === 'auto' ? 'Sauvegarde auto' : `Emplacement ${s}`;
      const info = m ? `${esc(m.name)} · ${fmtInt(m.pop)} hab. · ${fmtMoney(m.money)} · ${new Date(m.at).toLocaleString('fr-FR')}` : 'Vide';
      const canAct = mode === 'save' ? s !== 'auto' : !!m;
      return `<div class="slot"><div><b>${label}</b><div class="muted small">${info}</div></div><div class="slot-actions">${
        canAct ? `<button class="btn" data-slot="${s}">${mode === 'save' ? 'Sauvegarder ici' : 'Charger'}</button>` : ''
      }${m && s !== 'auto' ? `<button class="mini danger" data-del="${s}" title="Supprimer">${ICON.trash}</button>` : ''}</div></div>`;
    };
    this.modalClosable = true;
    this.showModal(
      `<div class="md-head"><h2>${mode === 'save' ? 'Sauvegarder la ville' : 'Charger une ville'}</h2><button class="mini close" data-close>${ICON.close}</button></div>
      <div class="slots">${slots.map(row).join('')}</div>
      <h4>Code de sauvegarde</h4>
      <p class="muted small">Pour transférer une ville vers un autre navigateur : copiez le code, puis collez-le dans « Importer ».</p>
      <div class="code-row"><button class="btn" id="exp">Copier le code de cette ville</button><button class="btn" id="imp">Importer un code</button></div>
      <textarea id="code" rows="3" placeholder="Collez ici un code de sauvegarde…" hidden></textarea>
      <p class="muted small" id="save-msg" role="status"></p>`,
      'saves'
    );
    const msg = (t, bad) => {
      const el = $('#save-msg');
      el.textContent = t;
      el.className = 'small ' + (bad ? 'bad' : 'ok');
    };
    $('#modal-body').onclick = async (e) => {
      const s = e.target.closest('[data-slot]');
      const d = e.target.closest('[data-del]');
      if (s) {
        if (mode === 'save') {
          const r = await saveSlot(s.dataset.slot);
          if (r.ok) {
            this.toast('Ville sauvegardée.', 'good');
            this.openSaves('save');
          } else msg(r.error, true);
        } else {
          const r = await loadSlot(s.dataset.slot);
          if (r.ok) {
            this.closeModal();
            this.toast('Ville chargée.', 'good');
          } else msg(r.error, true);
        }
      } else if (d) {
        deleteSlot(d.dataset.del);
        this.openSaves(mode);
      }
    };
    $('#exp').onclick = async (e) => {
      e.stopPropagation();
      const code = await exportCode();
      const ta = $('#code');
      ta.hidden = false;
      ta.value = code;
      try {
        await navigator.clipboard.writeText(code);
        msg(`Code copié (${Math.round(code.length / 1024)} Ko).`);
      } catch (err) {
        ta.select();
        msg('Copie automatique refusée : le code est sélectionné, copiez-le avec Ctrl+C.', false);
      }
    };
    $('#imp').onclick = async (e) => {
      e.stopPropagation();
      const ta = $('#code');
      if (ta.hidden || !ta.value.trim()) {
        ta.hidden = false;
        ta.value = '';
        ta.focus();
        msg('Collez le code puis cliquez de nouveau sur « Importer un code ».');
        return;
      }
      const r = await importCode(ta.value);
      if (r.ok) {
        this.closeModal();
        this.toast('Ville importée.', 'good');
      } else msg(r.error, true);
    };
  }

  async quickSave() {
    const r = await saveSlot('1');
    this.toast(r.ok ? 'Sauvegarde rapide (emplacement 1).' : r.error, r.ok ? 'good' : 'bad');
  }

  openOptions() {
    const q = G.quality;
    const vol = G.audio ? G.audio.volume : 0.7;
    this.modalClosable = true;
    this.showModal(
      `<div class="md-head"><h2>Options</h2><button class="mini close" data-close>${ICON.close}</button></div>
      <div class="opt"><span>Qualité graphique</span><div class="seg" id="opt-q">${Object.entries(QUALITY)
        .map(([k, v]) => `<button data-q="${k}" class="${k === q ? 'on' : ''}">${v.name}</button>`)
        .join('')}</div></div>
      <p class="muted small">La qualité règle la résolution, les ombres et le nombre maximal de véhicules. Un changement recharge la page : sauvegardez avant.</p>
      <div class="opt"><span>Volume</span><input type="range" id="opt-vol" min="0" max="1" step="0.05" value="${vol}"></div>
      <div class="opt"><span>Icônes de problèmes</span><div class="seg" id="opt-icons"><button data-v="1" class="${G.icons.visible ? 'on' : ''}">Affichées</button><button data-v="0" class="${G.icons.visible ? '' : 'on'}">Masquées</button></div></div>
      <div class="opt"><span>Cycle jour / nuit</span><div class="seg" id="opt-dn"><button data-v="1" class="${G.env.lockDay ? '' : 'on'}">Actif</button><button data-v="0" class="${G.env.lockDay ? 'on' : ''}">Toujours le jour</button></div></div>`,
      'options'
    );
    $('#opt-q').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || b.dataset.q === G.quality) return;
      try {
        localStorage.setItem('hc-quality', b.dataset.q);
      } catch (err) {
        /* stockage indisponible */
      }
      saveSlot('auto').finally(() => {
        try {
          localStorage.setItem('hc-resume-auto', '1');
        } catch (err) {
          /* stockage indisponible */
        }
        location.reload();
      });
    };
    $('#opt-vol').oninput = (e) => G.audio && G.audio.setVolume(+e.target.value);
    $('#opt-icons').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      G.icons.visible = b.dataset.v === '1';
      this.openOptions();
    };
    $('#opt-dn').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      G.env.lockDay = b.dataset.v === '0';
      this.openOptions();
    };
  }

  openHelp() {
    this.modalClosable = true;
    const k = (t) => `<kbd>${t}</kbd>`;
    this.showModal(
      `<div class="md-head"><h2>Commandes</h2><button class="mini close" data-close>${ICON.close}</button></div>
      <div class="help">
        <section><h4>Caméra</h4>
          <div class="kv"><span>Se déplacer</span><b>${k('Z')}${k('Q')}${k('S')}${k('D')} ou flèches, ou glisser (clic gauche, sans outil)</b></div>
          <div class="kv"><span>Pivoter / incliner</span><b>${k('A')}${k('E')} · clic droit glissé · ${k('T')}${k('G')}</b></div>
          <div class="kv"><span>Zoomer</span><b>molette (vers le curseur) · ${k('R')}${k('F')}</b></div>
          <div class="kv"><span>Accélérer le déplacement</span><b>${k('Maj')} enfoncée</b></div>
          <div class="kv"><span>Tactile</span><b>un doigt : déplacer · deux doigts : zoom et rotation</b></div>
        </section>
        <section><h4>Jeu</h4>
          <div class="kv"><span>Pause</span><b>${k('Espace')}</b></div>
          <div class="kv"><span>Vitesses</span><b>${k('1')}${k('2')}${k('3')}</b></div>
          <div class="kv"><span>Annuler / fermer</span><b>clic droit · ${k('Échap')}</b></div>
          <div class="kv"><span>Bulldozer</span><b>${k('B')} ou ${k('Suppr')}</b></div>
          <div class="kv"><span>Vues d'information</span><b>${k('I')}</b></div>
          <div class="kv"><span>Sauvegarde rapide</span><b>${k('Ctrl')}+${k('S')}</b></div>
          <div class="kv"><span>Désactiver l'aimantation des routes</span><b>${k('Maj')} pendant le tracé</b></div>
        </section>
        <section class="wide"><h4>Bien démarrer</h4>
          <ol class="steps">
            <li>Tracez une route depuis la sortie d'autoroute (à l'ouest), puis quelques rues.</li>
            <li>Ouvrez <b>Zonage</b> et peignez du résidentiel (vert), du commercial (bleu) et de l'industrie (jaune) le long des rues. Gardez l'industrie à l'écart des maisons.</li>
            <li>Construisez une éolienne ou une centrale à charbon reliée par la route.</li>
            <li>Placez une station de pompage au bord de la mer, et un rejet d'eaux usées loin des pompes.</li>
            <li>Surveillez les barres R, C, I : elles indiquent ce que la ville demande.</li>
            <li>À chaque palier de population, de nouveaux services se débloquent : déchets, santé, pompiers, police, éducation, bus…</li>
          </ol>
          <p class="muted small">Les réseaux d'électricité et d'eau passent automatiquement sous les routes.</p>
        </section>
      </div>`,
      'help'
    );
  }

  // ---------------------------------------------------------------- écran titre
  buildTitle() {
    const t = h(`<div class="title-screen" id="title">
      <div class="ts-inner">
        <div class="ts-kicker">Bâtisseur de villes</div>
        <h1 class="ts-title">Horizon<span>Cité</span></h1>
        <p class="ts-sub">Tracez les routes, dessinez les quartiers, gérez l'eau, l'électricité et le trafic, et regardez votre ville grandir du hameau à la mégalopole.</p>
        <label class="ts-label" for="city-name">Nom de la ville</label>
        <input id="city-name" class="ts-input" maxlength="32" value="Horizon Cité" autocomplete="off">
        <div class="ts-actions">
          <button class="btn primary big" data-start="empty">Nouvelle ville</button>
          <button class="btn big" data-start="demo">Ville de démonstration</button>
          <button class="btn big" data-start="sandbox">Bac à sable</button>
          <button class="btn big" data-start="continue" id="ts-continue" hidden>Continuer</button>
        </div>
        <p class="ts-note">Nouvelle ville : ₡ 70 000 et une sortie d'autoroute. Démonstration : une ville déjà construite. Bac à sable : argent illimité, tout débloqué.</p>
        <p class="ts-foot">Hommage non officiel aux grands city-builders, inspiré de Cities: Skylines. Tous les modèles sont générés par le code.</p>
      </div>
    </div>`);
    this.root.appendChild(t);
    t.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-start]');
      if (!b) return;
      if (G.audio) {
        G.audio.unlock();
        G.audio.play('open');
      }
      const mode = b.dataset.start;
      const name = ($('#city-name').value || '').trim() || 'Horizon Cité';
      if (mode === 'continue') {
        const meta = readMeta();
        const best = Object.entries(meta).sort((a, b2) => b2[1].at - a[1].at)[0];
        if (best) {
          const r = await loadSlot(best[0]);
          if (!r.ok) return this.toast(r.error, 'bad');
        }
      } else {
        G.newGame(mode, { name });
      }
      this.hideTitle();
    });
  }

  showTitle() {
    G.running = false;
    G.tools.set('none');
    this.closeCat();
    this.inspect(null);
    $('#title').hidden = false;
    document.body.classList.add('on-title');
    $('#ts-continue').hidden = !hasAnySave();
    G.cam.autoOrbit = true;
  }

  hideTitle() {
    $('#title').hidden = true;
    document.body.classList.remove('on-title');
    G.cam.autoOrbit = false;
    this.setSpeed(1);
  }

  afterStart() {
    this.inspect(null);
    this.closeCat();
    if (G.info) G.info.setMode(null);
    $('#info-panel').hidden = true;
    this.refreshBadge();
    this.setSpeed(G.sim.paused ? 0 : G.sim.speed || 1);
  }

  // ---------------------------------------------------------------- conseils
  advice() {
    const sim = G.sim;
    const S = sim.stats;
    const U = sim.util;
    const R = G.roads;
    if (!G.running) return null;
    let playerSegs = 0;
    for (const s of R.segs.values()) if (!sim.freeSegs.has(s.id)) playerSegs++;
    if (!playerSegs) return "Ouvrez <b>Routes</b> et tracez une rue depuis la sortie d'autoroute, à l'ouest de la carte.";
    let zoned = 0;
    for (const c of G.zones.cells.values()) if (c.zone) zoned++;
    if (!zoned) return 'Ouvrez <b>Zonage</b> et peignez des zones résidentielles, commerciales et industrielles le long des rues.';
    if (!R.outsideComps.size) return "Vos rues ne sont pas reliées à l'autoroute : personne ne peut emménager.";
    if (sim.lists.all.length > 3 && U.powerUse > U.powerProd + 0.05) return "<b>Électricité insuffisante.</b> Construisez une éolienne ou une centrale reliée à vos routes.";
    if (sim.lists.all.length > 3 && U.waterUse > U.waterProd + 0.5) return "<b>Pas assez d'eau.</b> Placez une station de pompage au bord de la mer (Eau et égouts).";
    if (sim.lists.all.length > 3 && U.sewageUse > U.sewageCap + 0.5) return "<b>Les eaux usées débordent.</b> Placez un rejet d'eaux usées sur la côte, loin des pompes.";
    if (U.polluted) return "<b>Eau polluée !</b> Une pompe aspire près d'un rejet d'eaux usées. Déplacez l'une des deux.";
    if (sim.money < 0) return '<b>Trésorerie négative.</b> Augmentez les impôts, réduisez les services, ou empruntez (Économie).';
    if (sim.needs.garbage.size > 6 && sim.unlocked(1) && !sim.lists.services.some((b) => b.def.cat === 'garbage')) return "Les déchets s'accumulent : construisez une <b>décharge</b>.";
    if (sim.needs.dead.size > 4 && !sim.lists.services.some((b) => b.defId === 'cemetery' || b.defId === 'crematorium')) return 'Des défunts attendent : construisez un <b>cimetière</b>.';
    if (S.unemployment > 0.15 && S.pop > 100) return 'Chômage élevé : zonez davantage de commerces et d’industrie.';
    if (sim.demand.C > 65 && S.pop > 80) return 'Les habitants réclament des <b>commerces</b> (barre C).';
    if (sim.demand.I > 70 && S.pop > 80) return "La demande d'<b>industrie</b> est forte (barre I).";
    if (sim.demand.R > 70 && G.zones.freeFront(1).length + G.zones.freeFront(2).length < 6) return 'Forte demande de <b>logements</b> : zonez plus de résidentiel.';
    return null;
  }

  // ---------------------------------------------------------------- mise à jour
  update(dt) {
    this.tickT += dt;
    if (this.tickT < 0.25) return;
    this.tickT = 0;
    if (!G.running) return;
    const sim = G.sim;
    const S = sim.stats;
    $('#st-pop').textContent = fmtInt(S.pop);
    const d = S.pop - (this.lastPop === undefined ? S.pop : this.lastPop);
    if (sim.day !== this.lastDay) {
      this.lastDay = sim.day;
      this.popDelta = d;
      this.lastPop = S.pop;
    }
    const pd = $('#st-popd');
    pd.textContent = this.popDelta ? fmtSigned(this.popDelta) : '';
    pd.className = this.popDelta > 0 ? 'ok' : this.popDelta < 0 ? 'bad' : '';
    const hp = $('#st-happy');
    const face = S.happy > 65 ? 'smile' : S.happy > 40 ? 'meh' : 'sad';
    if (hp.dataset.face !== face) {
      hp.dataset.face = face;
      hp.innerHTML = ICON[face];
    }
    hp.style.color = S.happy > 65 ? 'var(--good)' : S.happy > 40 ? 'var(--warn)' : 'var(--bad)';
    hp.title = `Bonheur : ${Math.round(S.happy)} %`;
    const D = sim.demand;
    $('#rci-r').style.height = Math.round(D.R) + '%';
    $('#rci-c').style.height = Math.round(D.C) + '%';
    $('#rci-i').style.height = Math.round(Math.max(D.I, D.O)) + '%';
    $('#st-money').textContent = sim.sandbox ? '∞' : fmtMoney(sim.money);
    $('#st-money').className = sim.money < 0 ? 'bad' : '';
    const net = sim.weeklyNet();
    const nt = $('#st-net');
    nt.textContent = `${fmtSigned(net)} ₡/sem.`;
    nt.className = net >= 0 ? 'ok' : 'bad';
    $('#st-date').textContent = dateOf(sim.day);
    $('#st-clock').textContent = (G.env.night > 0.5 ? '☾ ' : '☀ ') + G.env.hourString();
    // palier
    const mi = sim.milestone;
    const next = MILESTONES[mi + 1];
    const cur = MILESTONES[mi];
    if (next) {
      const f = clamp((S.pop - cur.pop) / (next.pop - cur.pop), 0, 1);
      $('#ms-fill').style.width = f * 100 + '%';
      $('#ms-label').textContent = `${cur.name} → ${next.name} · ${fmtInt(S.pop)} / ${fmtInt(next.pop)} habitants`;
    } else {
      $('#ms-fill').style.width = '100%';
      $('#ms-label').textContent = `${cur.name} · palier maximal atteint`;
    }
    // conseil
    const adv = this.advice();
    const ad = $('#advisor');
    if (adv) {
      ad.hidden = false;
      if ($('#adv-text').innerHTML !== adv) $('#adv-text').innerHTML = adv;
    } else ad.hidden = true;
    if (this.inspected && !$('#inspector').hidden) {
      this.inspT = (this.inspT || 0) + 1;
      if (this.inspT % 2 === 0) this.renderInspector();
    }
    if (G.info.mode && !$('#legend').hidden) {
      const sum = $('#legend .lg-sum');
      const s2 = this.infoSummary(G.info.mode);
      if (sum && s2) sum.outerHTML = s2;
    }
    // autosauvegarde toutes les 4 minutes
    this.autoT = (this.autoT || 0) + 0.25;
    if (this.autoT > 240) {
      this.autoT = 0;
      saveSlot('auto');
    }
  }
}
