// Outils mathématiques partagés : hasard reproductible, bruit, géométrie 2D, index spatial, tas binaire.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const TAU = Math.PI * 2;
export const normAngle = (a) => {
  a %= TAU;
  return a < 0 ? a + TAU : a;
};
// différence d'angle signée dans ]-PI, PI]
export const angleDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, z) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length) % arr.length];

// --- Bruit de Perlin 2D ---------------------------------------------------
const PERM = new Uint8Array(512);
(function initPerm() {
  const r = mulberry32(1337);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

function grad(h, x, y) {
  switch (h & 7) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    case 3: return -x - y;
    case 4: return x;
    case 5: return -x;
    case 6: return y;
    default: return -y;
  }
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export function noise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const X = xi & 255;
  const Y = yi & 255;
  const xf = x - xi;
  const yf = y - yi;
  const u = fade(xf);
  const v = fade(yf);
  const aa = PERM[PERM[X] + Y];
  const ab = PERM[PERM[X] + Y + 1];
  const ba = PERM[PERM[X + 1] + Y];
  const bb = PERM[PERM[X + 1] + Y + 1];
  const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
  const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
  return lerp(x1, x2, v) * 0.7071;
}

export function fbm(x, y, oct = 4, lac = 2.0, gain = 0.5) {
  let a = 1;
  let f = 1;
  let s = 0;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f);
    n += a;
    a *= gain;
    f *= lac;
  }
  return s / n;
}

export function ridged(x, y, oct = 5) {
  let a = 1;
  let f = 1;
  let s = 0;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    const v = 1 - Math.abs(noise2(x * f + i * 17.3, y * f - i * 9.1));
    s += a * v * v;
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

// --- Géométrie 2D (plan x/z) ----------------------------------------------
export const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));

// Intersection de deux segments [a,b] et [c,d]. Renvoie {t,u} (paramètres sur chaque segment) ou null.
export function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax;
  const rz = bz - az;
  const sx = dx - cx;
  const sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = cx - ax;
  const qz = cz - az;
  const t = (qx * sz - qz * sx) / den;
  const u = (qx * rz - qz * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

// Point le plus proche sur un segment
export function closestOnSeg(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const l2 = vx * vx + vz * vz;
  let t = l2 > 0 ? ((px - ax) * vx + (pz - az) * vz) / l2 : 0;
  t = clamp(t, 0, 1);
  const x = ax + vx * t;
  const z = az + vz * t;
  return { x, z, t, d2: dist2(px, pz, x, z) };
}

// Point le plus proche sur une polyligne échantillonnée {x,z} avec longueurs cumulées cum[]
export function closestOnPolyline(pts, cum, px, pz) {
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const c = closestOnSeg(px, pz, a.x, a.z, b.x, b.z);
    if (!best || c.d2 < best.d2) {
      best = { d2: c.d2, x: c.x, z: c.z, i, t: c.t, s: cum[i] + (cum[i + 1] - cum[i]) * c.t };
    }
  }
  if (best) best.d = Math.sqrt(best.d2);
  return best;
}

// Bézier quadratique
export function qbez(ax, az, cx, cz, bx, bz, t) {
  const m = 1 - t;
  return { x: m * m * ax + 2 * m * t * cx + t * t * bx, z: m * m * az + 2 * m * t * cz + t * t * bz };
}
export function qbezTan(ax, az, cx, cz, bx, bz, t) {
  const m = 1 - t;
  let x = 2 * m * (cx - ax) + 2 * t * (bx - cx);
  let z = 2 * m * (cz - az) + 2 * t * (bz - cz);
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}

// Bézier cubique (virages des véhicules)
export function cbez(p0, p1, p2, p3, t, out) {
  const m = 1 - t;
  const a = m * m * m;
  const b = 3 * m * m * t;
  const c = 3 * m * t * t;
  const d = t * t * t;
  out.x = a * p0.x + b * p1.x + c * p2.x + d * p3.x;
  out.y = a * p0.y + b * p1.y + c * p2.y + d * p3.y;
  out.z = a * p0.z + b * p1.z + c * p2.z + d * p3.z;
  return out;
}
export function cbezTan(p0, p1, p2, p3, t, out) {
  const m = 1 - t;
  const a = 3 * m * m;
  const b = 6 * m * t;
  const c = 3 * t * t;
  out.x = a * (p1.x - p0.x) + b * (p2.x - p1.x) + c * (p3.x - p2.x);
  out.z = a * (p1.z - p0.z) + b * (p2.z - p1.z) + c * (p3.z - p2.z);
  const l = Math.hypot(out.x, out.z) || 1;
  out.x /= l;
  out.z /= l;
  return out;
}

// Boîte orientée 2D : centre (x,z), axe largeur (ax,az) unitaire, demi-largeur hw, demi-profondeur hd.
export function obbCorners(o) {
  const bx = -o.az;
  const bz = o.ax;
  return [
    { x: o.x + o.ax * o.hw + bx * o.hd, z: o.z + o.az * o.hw + bz * o.hd },
    { x: o.x - o.ax * o.hw + bx * o.hd, z: o.z - o.az * o.hw + bz * o.hd },
    { x: o.x - o.ax * o.hw - bx * o.hd, z: o.z - o.az * o.hw - bz * o.hd },
    { x: o.x + o.ax * o.hw - bx * o.hd, z: o.z + o.az * o.hw - bz * o.hd },
  ];
}

export function obbOverlap(a, b, margin = 0) {
  const axes = [
    [a.ax, a.az],
    [-a.az, a.ax],
    [b.ax, b.az],
    [-b.az, b.ax],
  ];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [nx, nz] of axes) {
    const ra = Math.abs(a.hw * (a.ax * nx + a.az * nz)) + Math.abs(a.hd * (-a.az * nx + a.ax * nz));
    const rb = Math.abs(b.hw * (b.ax * nx + b.az * nz)) + Math.abs(b.hd * (-b.az * nx + b.ax * nz));
    if (Math.abs(dx * nx + dz * nz) > ra + rb - margin) return false;
  }
  return true;
}

export function pointInObb(o, px, pz, pad = 0) {
  const dx = px - o.x;
  const dz = pz - o.z;
  const u = dx * o.ax + dz * o.az;
  const v = -dx * o.az + dz * o.ax;
  return Math.abs(u) <= o.hw + pad && Math.abs(v) <= o.hd + pad;
}

// Distance d'un point à une boîte orientée (0 à l'intérieur)
export function distToObb(o, px, pz) {
  const dx = px - o.x;
  const dz = pz - o.z;
  const u = Math.abs(dx * o.ax + dz * o.az) - o.hw;
  const v = Math.abs(-dx * o.az + dz * o.ax) - o.hd;
  const ou = Math.max(u, 0);
  const ov = Math.max(v, 0);
  return Math.hypot(ou, ov);
}

// Enveloppe convexe (chaîne monotone). pts : [{x,z}]
export function convexHull(pts) {
  const p = pts.slice().sort((a, b) => (a.x === b.x ? a.z - b.z : a.x - b.x));
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-9) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-9) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// --- Index spatial en grille ------------------------------------------------
export class SpatialHash {
  constructor(cell = 32) {
    this.cell = cell;
    this.map = new Map();
    this.keysOf = new Map();
  }
  _k(ix, iz) {
    return (ix + 32768) * 65536 + (iz + 32768);
  }
  insert(obj, minx, minz, maxx, maxz) {
    if (this.keysOf.has(obj)) this.remove(obj);
    const c = this.cell;
    const x0 = Math.floor(minx / c);
    const x1 = Math.floor(maxx / c);
    const z0 = Math.floor(minz / c);
    const z1 = Math.floor(maxz / c);
    const keys = [];
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this._k(ix, iz);
        let b = this.map.get(k);
        if (!b) {
          b = [];
          this.map.set(k, b);
        }
        b.push(obj);
        keys.push(k);
      }
    }
    this.keysOf.set(obj, keys);
  }
  insertPoint(obj, x, z, r = 0) {
    this.insert(obj, x - r, z - r, x + r, z + r);
  }
  remove(obj) {
    const keys = this.keysOf.get(obj);
    if (!keys) return;
    for (const k of keys) {
      const b = this.map.get(k);
      if (!b) continue;
      const i = b.indexOf(obj);
      if (i >= 0) {
        b[i] = b[b.length - 1];
        b.pop();
      }
      if (!b.length) this.map.delete(k);
    }
    this.keysOf.delete(obj);
  }
  query(minx, minz, maxx, maxz, out = []) {
    const c = this.cell;
    const x0 = Math.floor(minx / c);
    const x1 = Math.floor(maxx / c);
    const z0 = Math.floor(minz / c);
    const z1 = Math.floor(maxz / c);
    const seen = out.length ? new Set(out) : null;
    const single = x0 === x1 && z0 === z1;
    const set = single ? null : seen || new Set();
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const b = this.map.get(this._k(ix, iz));
        if (!b) continue;
        for (const o of b) {
          if (set) {
            if (set.has(o)) continue;
            set.add(o);
          }
          out.push(o);
        }
      }
    }
    return out;
  }
  queryRadius(x, z, r, out = []) {
    return this.query(x - r, z - r, x + r, z + r, out);
  }
  clear() {
    this.map.clear();
    this.keysOf.clear();
  }
}

// --- Tas binaire (file de priorité min) -----------------------------------
export class MinHeap {
  constructor() {
    this.k = [];
    this.v = [];
  }
  get size() {
    return this.k.length;
  }
  push(key, val) {
    const k = this.k;
    const v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop() {
    const k = this.k;
    const v = this.v;
    const top = v[0];
    const lk = k.pop();
    const lv = v.pop();
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
  peekKey() {
    return this.k[0];
  }
}

// --- Formatage ----------------------------------------------------------------
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
export const fmtInt = (n) => nf.format(Math.round(n));
export const fmtMoney = (n) => (n < 0 ? '−₡ ' : '₡ ') + nf.format(Math.abs(Math.round(n)));
export const fmtSigned = (n) => (n >= 0 ? '+' : '−') + nf.format(Math.abs(Math.round(n)));
export const fmtPct = (x) => Math.round(x * 100) + ' %';

export const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
