// Vues d'information : terrain grisé + calque coloré, bâtiments teintés selon leur état, routes selon le trafic.
import * as THREE from 'three';
import { G } from './state.js';
import { FIELD_RES } from './fields.js';
import { clamp } from './util.js';

const C = (h) => new THREE.Color(h);
const lerpHex = (a, b, t) => {
  const c = C(a).lerp(C(b), clamp(t, 0, 1));
  return c.getHex();
};
const GREY = 0xa9b0b8;
const ramp = (t, stops) => {
  t = Math.round(clamp(t, 0, 1) * 12) / 12;
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (t <= b) return lerpHex(ca, cb, (t - a) / (b - a || 1));
  }
  return stops[stops.length - 1][1];
};
const GOODBAD = [
  [0, 0xe0473f],
  [0.5, 0xf2c43a],
  [1, 0x4fc85a],
];

export const VIEWS = {
  power: {
    name: 'Électricité',
    legend: [
      ['#4fc85a', 'Alimenté'],
      ['#e0473f', 'Sans électricité'],
      ['#ffd23f', 'Production'],
    ],
    bld: (b) => (b.def && b.def.power ? 0xffd23f : b.power ? 0x4fc85a : 0xe0473f),
  },
  water: {
    name: 'Eau et égouts',
    legend: [
      ['#3fa0e8', 'Eau et égouts raccordés'],
      ['#e0473f', "Pas d'eau"],
      ['#9a6a3a', 'Égouts saturés'],
    ],
    bld: (b) => (b.def && (b.def.water || b.def.sewage) ? (b.polluted ? 0x9a6a3a : 0x1f6fd0) : !b.water ? 0xe0473f : !b.sewage ? 0x9a6a3a : 0x3fa0e8),
  },
  garbage: {
    name: 'Déchets',
    legend: [
      ['#4fc85a', 'Propre'],
      ['#e0473f', 'Déchets accumulés'],
    ],
    bld: (b) => (b.kind === 'service' ? (b.def.cat === 'garbage' ? 0x2f80d0 : GREY) : ramp(1 - b.garbage / (b.occ * 9 + 25), GOODBAD)),
  },
  health: {
    name: 'Santé',
    field: 'health',
    color: [79, 200, 90],
    legend: [
      ['#4fc85a', 'Bien couvert'],
      ['#e0473f', 'Malades'],
    ],
    bld: (b) => (b.kind === 'service' ? (b.def.cat === 'health' ? 0x2f80d0 : GREY) : b.sick ? 0xe0473f : ramp((b.cov ? b.cov.health : 0) + 0.15, GOODBAD)),
  },
  fire: {
    name: 'Pompiers',
    field: 'fire',
    color: [235, 110, 60],
    legend: [
      ['#4fc85a', 'Protégé'],
      ['#e0473f', 'Non couvert / en feu'],
    ],
    bld: (b) => (b.kind === 'service' ? (b.def.cat === 'fire' ? 0x2f80d0 : GREY) : b.fireT > 0 ? 0xff3010 : ramp((b.cov ? b.cov.fire : 0) + 0.1, GOODBAD)),
  },
  crime: {
    name: 'Criminalité',
    field: 'police',
    color: [70, 120, 220],
    legend: [
      ['#4fc85a', 'Sûr'],
      ['#e0473f', 'Criminalité élevée'],
    ],
    bld: (b) => (b.kind === 'service' ? (b.def.cat === 'police' ? 0x2f80d0 : GREY) : ramp(1 - b.crime / 80, GOODBAD)),
  },
  education: {
    name: 'Éducation',
    field: 'edu',
    color: [160, 110, 220],
    legend: [
      ['#4fc85a', 'Très éduqué'],
      ['#e0473f', 'Peu éduqué'],
    ],
    bld: (b) => (b.kind === 'service' ? (b.def.cat === 'education' ? 0x2f80d0 : GREY) : ramp(b.edu / 2.2, GOODBAD)),
  },
  pollution: {
    name: 'Pollution',
    field: 'pollution',
    color: [120, 80, 30],
    legend: [
      ['#7a5020', 'Sol pollué'],
      ['#a9b0b8', 'Sain'],
    ],
    bld: (b) => (b.kind === 'zone' && b.zone === 5 ? 0x8a6a40 : b.def && b.def.pollution ? 0x6a4a20 : GREY),
  },
  noise: {
    name: 'Bruit',
    field: 'noise',
    color: [200, 60, 200],
    legend: [
      ['#c03cc8', 'Bruyant'],
      ['#a9b0b8', 'Calme'],
    ],
    bld: () => GREY,
  },
  landvalue: {
    name: 'Valeur foncière',
    field: 'lv',
    legend: [
      ['#2fbf7f', 'Élevée'],
      ['#f2c43a', 'Moyenne'],
      ['#c0503f', 'Faible'],
    ],
    bld: (b) =>
      b.kind === 'zone'
        ? ramp(b.lv / 70, [
            [0, 0xc0503f],
            [0.5, 0xf2c43a],
            [1, 0x2fbf7f],
          ])
        : GREY,
  },
  happiness: {
    name: 'Bonheur',
    legend: [
      ['#4fc85a', 'Heureux'],
      ['#f2c43a', 'Mitigé'],
      ['#e0473f', 'Malheureux'],
    ],
    bld: (b) => (b.kind === 'zone' ? ramp((b.happy - 20) / 65, GOODBAD) : GREY),
  },
  traffic: {
    name: 'Trafic',
    legend: [
      ['#4fc85a', 'Fluide'],
      ['#f2c43a', 'Dense'],
      ['#e0473f', 'Embouteillé'],
    ],
    bld: () => GREY,
    roads: (seg) =>
      ramp(seg.density / 0.85, [
        [0, 0x4fc85a],
        [0.5, 0xf2c43a],
        [1, 0xe0473f],
      ]),
  },
  transport: {
    name: 'Transports',
    field: 'bus',
    color: [230, 130, 40],
    legend: [
      ['#e8842a', 'Desservi par les bus'],
      ['#a9b0b8', 'Non desservi'],
    ],
    bld: (b) => (b.defId === 'busdepot' ? 0xe8842a : GREY),
  },
  level: {
    name: 'Niveau des bâtiments',
    legend: [
      ['#3ed0ff', 'Niveau max'],
      ['#2f6fd0', 'Niveau intermédiaire'],
      ['#7a8a99', 'Niveau 1'],
    ],
    bld: (b) =>
      b.kind === 'zone'
        ? ramp((b.level - 1) / 4, [
            [0, 0x7a8a99],
            [0.5, 0x2f6fd0],
            [1, 0x3ed0ff],
          ])
        : GREY,
  },
};

export class InfoViews {
  constructor() {
    this.mode = null;
    this.data = new Uint8Array(FIELD_RES * FIELD_RES * 4);
    this.tex = new THREE.DataTexture(this.data, FIELD_RES, FIELD_RES, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.timer = 0;
    G.on('fields:changed', () => this.mode && this.refresh());
    G.on('bld:added', () => this.mode && this.refreshBuildings());
    G.on('roads:changed', () => this.mode && this.refreshRoads());
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode && VIEWS[mode] ? mode : null;
    const on = !!this.mode;
    G.terrain.uniforms.uOverlay.value = this.tex;
    G.terrain.uniforms.uOverlayOn.value = on ? 1 : 0;
    G.env.waterU.uInfo.value = on ? 1 : 0;
    G.trees.setInfoMode(on);
    this.refresh();
    G.emit('info:mode', this.mode);
  }

  refresh() {
    this.refreshOverlay();
    this.refreshBuildings();
    this.refreshRoads();
    if (G.transit) G.transit.setLinesVisible(this.mode === 'transport');
  }

  refreshBuildings() {
    const v = this.mode ? VIEWS[this.mode] : null;
    G.buildings.setInfoFn(v ? v.bld : null);
  }

  roadTint(seg) {
    const v = this.mode ? VIEWS[this.mode] : null;
    if (!v) return null;
    if (v.roads) return v.roads(seg);
    return 0xb9c0c8;
  }

  refreshRoads() {
    for (const seg of G.roads.segs.values()) G.roads.meshes.setInfoTint(seg, this.roadTint(seg));
  }

  refreshOverlay() {
    const v = this.mode ? VIEWS[this.mode] : null;
    const d = this.data;
    d.fill(0);
    if (v && v.field) {
      const F = G.sim.fields;
      const N = FIELD_RES;
      for (let iz = 0; iz < N; iz++) {
        for (let ix = 0; ix < N; ix++) {
          const i = iz * N + ix;
          let val;
          let col = v.color;
          if (v.field === 'edu') val = clamp((F.g.edu1[i] + F.g.edu2[i] + F.g.edu3[i]) / 2, 0, 1);
          else if (v.field === 'lv') {
            const p = F.cellCenter(ix, iz);
            const lv = G.sim.landValueAt(p.x, p.z);
            const t = clamp(lv / 70, 0, 1);
            const c = C(ramp(t, [
              [0, 0xc0503f],
              [0.5, 0xf2c43a],
              [1, 0x2fbf7f],
            ]));
            col = [c.r * 255, c.g * 255, c.b * 255];
            val = 0.25 + t * 0.6;
          } else val = clamp(F.g[v.field][i], 0, 1);
          d[i * 4] = col[0];
          d[i * 4 + 1] = col[1];
          d[i * 4 + 2] = col[2];
          d[i * 4 + 3] = Math.round(clamp(val, 0, 1) * 200);
        }
      }
    }
    this.tex.needsUpdate = true;
  }

  update(dt) {
    if (!this.mode) return;
    this.timer += dt;
    if (this.timer > 1.5) {
      this.timer = 0;
      this.refreshBuildings();
      if (this.mode === 'traffic') this.refreshRoads();
      if (VIEWS[this.mode].field === 'lv') this.refreshOverlay();
    }
  }
}
