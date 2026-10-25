// Grilles de champs (couverture des services, pollution, bruit) sur la carte, 16 m par case.
import { MAP_HALF } from './config.js';
import { clamp } from './util.js';

export const FIELD_RES = 128;
const SIZE = MAP_HALF * 2;
const CELLM = SIZE / FIELD_RES;

export class Fields {
  constructor(names) {
    this.names = names;
    this.g = {};
    for (const n of names) this.g[n] = new Float32Array(FIELD_RES * FIELD_RES);
  }
  clear(name) {
    this.g[name].fill(0);
  }
  // ajoute une contribution radiale (décroissance douce jusqu'au rayon)
  addRadial(name, x, z, r, s) {
    const g = this.g[name];
    const ix0 = Math.max(0, Math.floor((x - r + MAP_HALF) / CELLM));
    const ix1 = Math.min(FIELD_RES - 1, Math.floor((x + r + MAP_HALF) / CELLM));
    const iz0 = Math.max(0, Math.floor((z - r + MAP_HALF) / CELLM));
    const iz1 = Math.min(FIELD_RES - 1, Math.floor((z + r + MAP_HALF) / CELLM));
    const r2 = r * r;
    for (let iz = iz0; iz <= iz1; iz++) {
      const cz = -MAP_HALF + (iz + 0.5) * CELLM;
      for (let ix = ix0; ix <= ix1; ix++) {
        const cx = -MAP_HALF + (ix + 0.5) * CELLM;
        const d2 = (cx - x) ** 2 + (cz - z) ** 2;
        if (d2 >= r2) continue;
        const t = 1 - Math.sqrt(d2) / r;
        g[iz * FIELD_RES + ix] += s * Math.min(1, t * 1.6);
      }
    }
  }
  sample(name, x, z) {
    const ix = Math.floor((x + MAP_HALF) / CELLM);
    const iz = Math.floor((z + MAP_HALF) / CELLM);
    if (ix < 0 || iz < 0 || ix >= FIELD_RES || iz >= FIELD_RES) return 0;
    return this.g[name][iz * FIELD_RES + ix];
  }
  sample01(name, x, z) {
    return clamp(this.sample(name, x, z), 0, 1);
  }
  cellCenter(ix, iz) {
    return { x: -MAP_HALF + (ix + 0.5) * CELLM, z: -MAP_HALF + (iz + 0.5) * CELLM };
  }
}
