// Générateur procédural de bâtiments et de véhicules.
// Repère local : X = largeur (le long de la route), Z = profondeur (avant = -Z côté route), Y = haut.
// Attributs : position, normal, color (linéaire), aWin (type de fenêtre), aWuv (grille des fenêtres).
import * as THREE from 'three';
import { mulberry32 } from './util.js';

const C = (h) => new THREE.Color(h);
const P = (arr) => arr.map(C);

export const PAL = {
  houseWall: P([0xede5d3, 0xf3f0e9, 0xdccaab, 0xcad6da, 0xbccaa9, 0xe5c7b2, 0xd9d4c5, 0xc9b9a3, 0xaab7c4, 0xe9dcc0]),
  houseRoof: P([0x8d3c2e, 0x6d3b2a, 0x5b6067, 0x404752, 0x7c4b34, 0x52604a, 0x9c5437, 0x34383f]),
  aptWall: P([0xdacbaf, 0xb95d43, 0xd0c8bc, 0xe9e3d7, 0xaba59c, 0xc5a880, 0xa05b49, 0xd8d1c1, 0x8f9aa3]),
  shopWall: P([0xeae0ca, 0xd5c4a4, 0xc9714b, 0xf1ece1, 0xb8c5ca, 0xdaa96d, 0xa7b59a]),
  awning: P([0xc0392b, 0x2e86c1, 0x27ae60, 0xf39c12, 0x8e44ad, 0xd35400, 0x16a085, 0x34495e]),
  sign: P([0xff4f5e, 0x4fc3ff, 0xffd54f, 0x7cff8a, 0xff7ad9, 0xfff2c4]),
  indWall: P([0x9ba1a7, 0x8b97a4, 0xb9ac91, 0xa77050, 0x809581, 0xc3c1b9, 0x7d8b99]),
  indRoof: P([0x5c6167, 0x6c7074, 0x50565d, 0x7a5c48]),
  office: P([0x6f8ba4, 0x5e7e90, 0xa9b5c0, 0x8b9ba9, 0x50708a, 0xcac7be, 0x3f5468]),
  roofFlat: P([0x606368, 0x6d6b67, 0x56595d, 0x7a7570]),
  lawn: C(0x6a8d43),
  lawn2: C(0x7b9b51),
  hedge: C(0x3e6130),
  leaf: C(0x4e8a37),
  leaf2: C(0x3f6e2e),
  trunk: C(0x5e4532),
  path: C(0xbab3a4),
  drive: C(0x8e8b85),
  pool: C(0x56c8e4),
  paving: C(0xaaa598),
  concrete: C(0xb6b3ab),
  asphalt: C(0x505357),
  dark: C(0x2b2e33),
  darker: C(0x1d1f22),
  white: C(0xf3f3ef),
  glass: C(0x4b6478),
  red: C(0xc0392b),
  blue: C(0x2f6db5),
  yellow: C(0xf2c230),
  green: C(0x2f8f4e),
  brick: C(0xa4543c),
  sand: C(0xd8c58c),
  water: C(0x3d8fb3),
  earth: C(0x7b6247),
  metal: C(0x8c939a),
  rust: C(0x8a4b30),
  black: C(0x141517),
};

export class BGeo {
  constructor() {
    this.p = [];
    this.n = [];
    this.c = [];
    this.w = [];
    this.uv = [];
    this.smoke = [];
  }
  vert(x, y, z, nx, ny, nz, col, u, v, w) {
    this.p.push(x, y, z);
    this.n.push(nx, ny, nz);
    this.c.push(col.r, col.g, col.b);
    this.uv.push(u, v);
    this.w.push(w);
  }
  // quadrilatère ; l'ordre est corrigé pour que la face regarde vers n
  quad(a, b, c, d, n, col, uvs, win = 0) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    let flip = false;
    if (n) {
      if (nx * n[0] + ny * n[1] + nz * n[2] < 0) flip = true;
      nx = n[0];
      ny = n[1];
      nz = n[2];
    } else {
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
    }
    const pts = [a, b, c, d];
    const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const i of order) {
      const p = pts[i];
      const t = uvs ? uvs[i] : null;
      this.vert(p[0], p[1], p[2], nx, ny, nz, col, t ? t[0] : 0, t ? t[1] : 0, win);
    }
  }
  // quadrilatère dont la normale est calculée puis orientée selon un indice « vers l'extérieur »
  quadAuto(a, b, c, d, hint, col, win = 0, uvs = null) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    this.quad(a, b, c, d, [nx, ny, nz], col, uvs, win);
  }
  tri(a, b, c, hint, col, win = 0) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    let pts = [a, b, c];
    if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) {
      pts = [a, c, b];
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    for (const p of pts) this.vert(p[0], p[1], p[2], nx, ny, nz, col, 0, 0, win);
  }
  // pavé ; o.win (type de fenêtre), o.fh (hauteur d'étage), o.base (bas des étages), o.roof (couleur du toit)
  box(x0, y0, z0, x1, y1, z1, col, o = {}) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    const roof = o.roof || col;
    const win = o.win || 0;
    const fh = o.fh || 3.2;
    const base = o.base === undefined ? y0 : o.base;
    const ww = o.ww || 3.1;
    if (o.top !== false) this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], roof, null, 0);
    if (o.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], col, null, 0);
    const faces = [
      [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], x1 - x0, 'f'],
      [[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1], x1 - x0, 'b'],
      [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0], z1 - z0, 'l'],
      [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], z1 - z0, 'r'],
    ];
    for (const [a, b, c, d, n, L, key] of faces) {
      if (o.skip && o.skip.includes(key)) continue;
      let w = win;
      if (o.winFaces && !o.winFaces.includes(key)) w = 0;
      let uvs = null;
      if (w) {
        const cols = Math.max(1, Math.round(L / ww));
        const v0 = (y0 - base) / fh;
        const v1 = (y1 - base) / fh;
        uvs = [
          [0, v0],
          [cols, v0],
          [cols, v1],
          [0, v1],
        ];
      }
      this.quad(a, b, c, d, n, (o.faceCol && o.faceCol[key]) || col, uvs, w);
    }
  }
  // toit à deux pans ; faîtage parallèle à X (alongX) ou à Z
  gable(x0, z0, x1, z1, y, h, roof, wall, alongX = true, over = 0.35) {
    if (alongX) {
      const zm = (z0 + z1) / 2;
      const X0 = x0 - over;
      const X1 = x1 + over;
      const Z0 = z0 - over;
      const Z1 = z1 + over;
      const yo = y - over * (h / ((z1 - z0) / 2));
      this.quadAuto([X0, yo, Z0], [X1, yo, Z0], [X1, y + h, zm], [X0, y + h, zm], [0, 1, -1], roof);
      this.quadAuto([X1, yo, Z1], [X0, yo, Z1], [X0, y + h, zm], [X1, y + h, zm], [0, 1, 1], roof);
      this.tri([x0, y, z0], [x0, y, z1], [x0, y + h, zm], [-1, 0, 0], wall);
      this.tri([x1, y, z0], [x1, y, z1], [x1, y + h, zm], [1, 0, 0], wall);
    } else {
      const xm = (x0 + x1) / 2;
      const X0 = x0 - over;
      const X1 = x1 + over;
      const Z0 = z0 - over;
      const Z1 = z1 + over;
      const yo = y - over * (h / ((x1 - x0) / 2));
      this.quadAuto([X0, yo, Z0], [X0, yo, Z1], [xm, y + h, Z1], [xm, y + h, Z0], [-1, 1, 0], roof);
      this.quadAuto([X1, yo, Z1], [X1, yo, Z0], [xm, y + h, Z0], [xm, y + h, Z1], [1, 1, 0], roof);
      this.tri([x0, y, z0], [x1, y, z0], [xm, y + h, z0], [0, 0, -1], wall);
      this.tri([x0, y, z1], [x1, y, z1], [xm, y + h, z1], [0, 0, 1], wall);
    }
  }
  // toit en croupe
  hip(x0, z0, x1, z1, y, h, roof, over = 0.3) {
    x0 -= over;
    x1 += over;
    z0 -= over;
    z1 += over;
    const W = x1 - x0;
    const D = z1 - z0;
    const yt = y + h;
    if (W >= D) {
      const zm = (z0 + z1) / 2;
      const ra = x0 + D / 2;
      const rb = x1 - D / 2;
      this.quadAuto([x0, y, z0], [x1, y, z0], [rb, yt, zm], [ra, yt, zm], [0, 1, -1], roof);
      this.quadAuto([x1, y, z1], [x0, y, z1], [ra, yt, zm], [rb, yt, zm], [0, 1, 1], roof);
      this.tri([x0, y, z0], [x0, y, z1], [ra, yt, zm], [-1, 1, 0], roof);
      this.tri([x1, y, z0], [x1, y, z1], [rb, yt, zm], [1, 1, 0], roof);
    } else {
      const xm = (x0 + x1) / 2;
      const ra = z0 + W / 2;
      const rb = z1 - W / 2;
      this.quadAuto([x0, y, z0], [x0, y, z1], [xm, yt, rb], [xm, yt, ra], [-1, 1, 0], roof);
      this.quadAuto([x1, y, z1], [x1, y, z0], [xm, yt, ra], [xm, yt, rb], [1, 1, 0], roof);
      this.tri([x0, y, z0], [x1, y, z0], [xm, yt, ra], [0, 1, -1], roof);
      this.tri([x0, y, z1], [x1, y, z1], [xm, yt, rb], [0, 1, 1], roof);
    }
  }
  // cylindre / tronc de cône à normales lisses
  cyl(cx, cz, r0, r1, y0, y1, n, col, o = {}) {
    const top = o.top || col;
    const win = o.win || 0;
    const fh = o.fh || 3.2;
    const base = o.base === undefined ? y0 : o.base;
    const circ = Math.PI * (r0 + r1);
    const cols = Math.max(1, Math.round(circ / (o.ww || 3.1)));
    const slope = (r0 - r1) / Math.max(0.001, y1 - y0);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const n0 = new THREE.Vector3(c0, slope, s0).normalize();
      const n1 = new THREE.Vector3(c1, slope, s1).normalize();
      const u0 = (i / n) * cols;
      const u1 = ((i + 1) / n) * cols;
      const v0 = (y0 - base) / fh;
      const v1 = (y1 - base) / fh;
      const A = [cx + c0 * r0, y0, cz + s0 * r0];
      const B = [cx + c1 * r0, y0, cz + s1 * r0];
      const Cc = [cx + c1 * r1, y1, cz + s1 * r1];
      const D = [cx + c0 * r1, y1, cz + s0 * r1];
      // triangles A,C,B et A,D,C (vue extérieure)
      this.vert(A[0], A[1], A[2], n0.x, n0.y, n0.z, col, u0, v0, win);
      this.vert(Cc[0], Cc[1], Cc[2], n1.x, n1.y, n1.z, col, u1, v1, win);
      this.vert(B[0], B[1], B[2], n1.x, n1.y, n1.z, col, u1, v0, win);
      this.vert(A[0], A[1], A[2], n0.x, n0.y, n0.z, col, u0, v0, win);
      this.vert(D[0], D[1], D[2], n0.x, n0.y, n0.z, col, u0, v1, win);
      this.vert(Cc[0], Cc[1], Cc[2], n1.x, n1.y, n1.z, col, u1, v1, win);
      if (o.cap !== false && r1 > 0.001) {
        this.vert(cx, y1, cz, 0, 1, 0, top, 0, 0, 0);
        this.vert(D[0], D[1], D[2], 0, 1, 0, top, 0, 0, 0);
        this.vert(Cc[0], Cc[1], Cc[2], 0, 1, 0, top, 0, 0, 0);
      }
    }
  }
  cone(cx, cz, r, y0, y1, n, col) {
    this.cyl(cx, cz, r, 0.0001, y0, y1, n, col, { cap: false });
  }
  // révolution d'un profil [[r,y],...]
  lathe(cx, cz, prof, n, col, o = {}) {
    for (let k = 0; k < prof.length - 1; k++) {
      const [r0, y0] = prof[k];
      const [r1, y1] = prof[k + 1];
      const colk = o.cols ? o.cols[k] || col : col;
      const dy = y1 - y0;
      const dr = r1 - r0;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        const c0 = Math.cos(a0);
        const s0 = Math.sin(a0);
        const c1 = Math.cos(a1);
        const s1 = Math.sin(a1);
        const nl = Math.hypot(dy, dr) || 1;
        const ny = -dr / nl;
        const nr = dy / nl;
        const sgn = o.inside ? -1 : 1;
        const A = [cx + c0 * r0, y0, cz + s0 * r0];
        const B = [cx + c1 * r0, y0, cz + s1 * r0];
        const Cc = [cx + c1 * r1, y1, cz + s1 * r1];
        const D = [cx + c0 * r1, y1, cz + s0 * r1];
        const N0 = [c0 * nr * sgn, ny * sgn, s0 * nr * sgn];
        const N1 = [c1 * nr * sgn, ny * sgn, s1 * nr * sgn];
        const tris = o.inside
          ? [
              [A, N0],
              [B, N1],
              [Cc, N1],
              [A, N0],
              [Cc, N1],
              [D, N0],
            ]
          : [
              [A, N0],
              [Cc, N1],
              [B, N1],
              [A, N0],
              [D, N0],
              [Cc, N1],
            ];
        for (const [p, nn] of tris) this.vert(p[0], p[1], p[2], nn[0], nn[1], nn[2], colk, 0, 0, 0);
      }
    }
  }
  // disque horizontal
  disc(cx, cz, r, y, n, col) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      this.vert(cx, y, cz, 0, 1, 0, col, 0, 0, 0);
      this.vert(cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r, 0, 1, 0, col, 0, 0, 0);
      this.vert(cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r, 0, 1, 0, col, 0, 0, 0);
    }
  }
  slab(x0, z0, x1, z1, y, col) {
    this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0], col, null, 0);
  }
  // arbre décoratif
  tree(x, z, y, s, rnd, conifer = false) {
    this.cyl(x, z, 0.22 * s, 0.16 * s, y, y + 2.2 * s, 5, PAL.trunk, { cap: false });
    if (conifer) {
      this.cone(x, z, 1.9 * s, y + 1.6 * s, y + 6.5 * s, 7, PAL.leaf2);
    } else {
      const col = rnd() < 0.5 ? PAL.leaf : PAL.leaf2;
      this.lathe(
        x,
        z,
        [
          [0.01, y + 1.9 * s],
          [1.6 * s, y + 2.6 * s],
          [2.1 * s, y + 3.6 * s],
          [1.7 * s, y + 4.7 * s],
          [0.01, y + 5.4 * s],
        ],
        7,
        col
      );
    }
  }
  // parcelle : socle qui descend sous le terrain pour masquer les pentes
  lot(W, D, col, edge) {
    this.box(-W / 2, -3, -D / 2, W / 2, 0.12, D / 2, edge || col, { roof: col });
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aWin', new THREE.Float32BufferAttribute(this.w, 1));
    g.setAttribute('aWuv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];
const rr = (r, a, b) => a + r() * (b - a);

// ---------------------------------------------------------------------------
// Bâtiments de zone
function resLow(g, level, W, D, r) {
  g.lot(W, D, PAL.lawn, PAL.lawn2);
  const wall = pick(PAL.houseWall, r);
  const roof = pick(PAL.houseRoof, r);
  const y = 0.12;
  const floors = level >= 3 ? 2 : r() < 0.35 ? 2 : 1;
  const bw = Math.min(W - 3.2, rr(r, 7, 10) + level * 1.1);
  const bd = Math.min(D - 7.5, rr(r, 7, 9.5) + level * 0.8);
  const garage = W >= 15 && (level >= 2 || r() < 0.5);
  const gW = garage ? 3.8 : 0;
  const totalW = bw + gW;
  let x0 = -totalW / 2 + (r() - 0.5) * Math.max(0, W - 3 - totalW);
  x0 = Math.max(-W / 2 + 1.3, x0);
  const x1 = x0 + bw;
  const z0 = -D / 2 + rr(r, 4.2, 6);
  const z1 = z0 + bd;
  const H = floors * 3.0;
  g.box(x0, y, z0, x1, y + H, z1, wall, { win: 1, base: y, fh: 3.0, ww: 2.9 });
  // porte
  const dx = x0 + bw * rr(r, 0.3, 0.7);
  g.box(dx - 0.55, y, z0 - 0.08, dx + 0.55, y + 2.2, z0, PAL.dark);
  // toit
  const rh = rr(r, 2.2, 3.4);
  if (level >= 4 && r() < 0.35) {
    g.box(x0 - 0.2, y + H, z0 - 0.2, x1 + 0.2, y + H + 0.5, z1 + 0.2, PAL.white);
  } else if (r() < 0.55) g.gable(x0, z0, x1, z1, y + H, rh, roof, wall, bw >= bd);
  else g.hip(x0, z0, x1, z1, y + H, rh * 0.85, roof);
  // cheminée
  if (r() < 0.6) {
    const cx = x0 + bw * rr(r, 0.2, 0.8);
    const cz = z0 + bd * rr(r, 0.3, 0.7);
    g.box(cx - 0.4, y + H, cz - 0.4, cx + 0.4, y + H + rh + 0.8, cz + 0.4, PAL.brick);
  }
  // garage et allée
  if (garage) {
    const gx0 = x1;
    const gx1 = x1 + gW;
    g.box(gx0, y, z0 + 0.5, gx1, y + 2.8, z0 + 6.5, wall, { roof: PAL.roofFlat[0] });
    g.box(gx0 + 0.4, y, z0 + 0.42, gx1 - 0.4, y + 2.3, z0 + 0.5, PAL.metal);
    g.slab(gx0 + 0.3, -D / 2, gx1 - 0.3, z0 + 0.5, y + 0.02, PAL.drive);
  } else {
    g.slab(dx - 0.7, -D / 2, dx + 0.7, z0, y + 0.02, PAL.path);
  }
  // annexe pour les niveaux élevés
  if (level >= 3 && D - (z1 - -D / 2) > 8 && r() < 0.7) {
    const ax0 = x0 + bw * 0.15;
    const ax1 = x0 + bw * 0.65;
    g.box(ax0, y, z1, ax1, y + 3, z1 + 3.5, wall, { win: 1, base: y, fh: 3, roof: PAL.roofFlat[1] });
  }
  // piscine
  if (level >= 4 && D >= 24) {
    const pz0 = z1 + 2.5;
    const pz1 = Math.min(D / 2 - 1.5, pz0 + 5);
    if (pz1 - pz0 > 3) {
      g.slab(-3.2, pz0 - 0.6, 3.2, pz1 + 0.6, y + 0.03, PAL.white);
      g.slab(-2.6, pz0, 2.6, pz1, y + 0.05, PAL.pool);
    }
  }
  // haies et arbres
  g.box(-W / 2 + 0.2, y, D / 2 - 0.9, W / 2 - 0.2, y + 1.0, D / 2 - 0.2, PAL.hedge);
  if (r() < 0.8) g.tree(rr(r, -W / 2 + 2, W / 2 - 2), D / 2 - rr(r, 3, 5), y, rr(r, 0.7, 1.05), r, r() < 0.3);
  if (r() < 0.5) g.tree(x0 - 1.2 < -W / 2 + 1 ? W / 2 - 1.8 : -W / 2 + 1.8, -D / 2 + 2.2, y, rr(r, 0.55, 0.8), r);
  return H + rh;
}

function resHigh(g, level, W, D, r) {
  g.lot(W, D, PAL.paving, PAL.concrete);
  const wall = pick(PAL.aptWall, r);
  const accent = pick(PAL.aptWall, r);
  const y = 0.12;
  const fr = [
    [3, 4],
    [4, 7],
    [6, 10],
    [9, 16],
    [14, 28],
  ][level - 1];
  let floors = Math.round(rr(r, fr[0], fr[1]) * (W * D >= 512 ? 1 : 0.8));
  floors = Math.max(3, floors);
  const fh = 3.1;
  const x0 = -W / 2 + 1.6;
  const x1 = W / 2 - 1.6;
  const z0 = -D / 2 + 3.2;
  const z1 = D / 2 - 2;
  let top;
  if (level >= 4 && W >= 24 && D >= 24) {
    // socle + tour
    g.box(x0, y, z0, x1, y + 2 * fh, z1, accent, { win: 3, base: y, fh, roof: PAL.roofFlat[0] });
    const tx0 = x0 + rr(r, 2, 4);
    const tx1 = x1 - rr(r, 2, 4);
    const tz0 = z0 + rr(r, 2, 4);
    const tz1 = z1 - rr(r, 2, 4);
    top = y + floors * fh;
    g.box(tx0, y + 2 * fh, tz0, tx1, top, tz1, wall, { win: r() < 0.5 ? 1 : 2, base: y, fh, roof: PAL.roofFlat[2] });
    if (level === 5 && floors > 18) {
      const sx0 = tx0 + 2;
      const sx1 = tx1 - 2;
      const sz0 = tz0 + 2;
      const sz1 = tz1 - 2;
      g.box(sx0, top, sz0, sx1, top + 4 * fh, sz1, wall, { win: 2, base: y, fh });
      top += 4 * fh;
    }
    g.box(-1, top, -1, 1, top + 3, 1, PAL.metal);
  } else {
    top = y + floors * fh;
    g.box(x0, y, z0, x1, top, z1, wall, { win: 1, base: y, fh, roof: PAL.roofFlat[Math.floor(r() * 3)] });
    // balcons sur la façade avant
    if (level <= 3) {
      const bx0 = x0 + 1.2;
      const bx1 = x1 - 1.2;
      for (let f = 1; f < floors; f++) {
        const by = y + f * fh;
        g.box(bx0, by - 0.05, z0 - 1.1, bx1, by + 0.12, z0, PAL.concrete);
        g.box(bx0, by + 0.12, z0 - 1.12, bx1, by + 1.05, z0 - 1.0, accent);
      }
    }
    // pignon décoratif ou corniche
    g.box(x0 - 0.25, top, z0 - 0.25, x1 + 0.25, top + 0.6, z1 + 0.25, accent);
  }
  // auvent d'entrée
  g.box(-2, y + 2.7, z0 - 1.6, 2, y + 3.0, z0, PAL.dark);
  // toit : réservoir, clim, cage d'escalier
  const ry = top + 0.6;
  g.box(x0 + 1.5, ry, z1 - 5, x0 + 4.5, ry + 2.6, z1 - 2, PAL.concrete);
  if (r() < 0.7) {
    g.cyl(x1 - 3, z1 - 3.5, 1.3, 1.3, ry + 1.2, ry + 3.6, 8, PAL.metal, { top: PAL.dark });
    for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) g.box(x1 - 3 + lx - 0.08, ry, z1 - 3.5 + lz - 0.08, x1 - 3 + lx + 0.08, ry + 1.2, z1 - 3.5 + lz + 0.08, PAL.dark);
  }
  for (let i = 0; i < 3; i++) {
    const ax = rr(r, x0 + 2, x1 - 2);
    const az = rr(r, z0 + 2, z1 - 6);
    g.box(ax - 0.7, ry, az - 0.5, ax + 0.7, ry + 1, az + 0.5, PAL.metal);
  }
  // petits arbres sur la parcelle
  if (r() < 0.7) g.tree(-W / 2 + 0.9, -D / 2 + 1.4, y, 0.6, r);
  if (r() < 0.7) g.tree(W / 2 - 0.9, -D / 2 + 1.4, y, 0.6, r);
  return top + 3;
}

function shopFront(g, x0, x1, z0, y, h, r) {
  const aw = pick(PAL.awning, r);
  // auvent incliné
  g.quadAuto([x0 + 0.3, y + h - 0.2, z0], [x1 - 0.3, y + h - 0.2, z0], [x1 - 0.3, y + h - 0.9, z0 - 1.6], [x0 + 0.3, y + h - 0.9, z0 - 1.6], [0, 1, -1], aw);
  g.quadAuto([x0 + 0.3, y + h - 0.9, z0 - 1.6], [x1 - 0.3, y + h - 0.9, z0 - 1.6], [x1 - 0.3, y + h - 1.15, z0 - 1.6], [x0 + 0.3, y + h - 1.15, z0 - 1.6], [0, 0, -1], aw);
  // enseigne néon
  const sw = Math.min(x1 - x0 - 1.5, rr(r, 3, 7));
  const sx = (x0 + x1) / 2 + (r() - 0.5) * (x1 - x0 - sw - 1.5);
  const sc = pick(PAL.sign, r);
  g.box(sx - sw / 2, y + h + 0.1, z0 - 0.35, sx + sw / 2, y + h + 1.0, z0, sc, { win: 5, ww: 100 });
  // le pavé de l'enseigne : faces marquées néon
  const n = g.w.length;
  for (let i = n - 30; i < n; i++) g.w[i] = 5;
}

function comLow(g, level, W, D, r) {
  g.lot(W, D, PAL.paving, PAL.concrete);
  const wall = pick(PAL.shopWall, r);
  const y = 0.12;
  const upper = [
    [0, 1],
    [1, 2],
    [1, 3],
  ][level - 1];
  const floorsUp = Math.round(rr(r, upper[0], upper[1] + 0.49));
  const x0 = -W / 2 + 0.6;
  const x1 = W / 2 - 0.6;
  const z0 = -D / 2 + 1.8;
  const z1 = D / 2 - (D > 12 ? 3 : 1);
  const gh = 4.2;
  g.box(x0, y, z0, x1, y + gh, z1, wall, { win: 3, base: y, fh: gh, ww: 4.2, winFaces: ['f'], roof: PAL.roofFlat[0] });
  let top = y + gh;
  if (floorsUp > 0) {
    const fh = 3.1;
    g.box(x0, top, z0, x1, top + floorsUp * fh, z1, wall, { win: 1, base: top, fh, roof: PAL.roofFlat[1] });
    top += floorsUp * fh;
    if (r() < 0.5) g.gable(x0, z0, x1, z1, top, 2.2, pick(PAL.houseRoof, r), wall, true, 0.2);
    else g.box(x0 - 0.2, top, z0 - 0.2, x1 + 0.2, top + 0.5, z1 + 0.2, PAL.concrete);
  }
  shopFront(g, x0, x1, z0, y, gh, r);
  // climatisation sur le toit
  for (let i = 0; i < 2; i++) {
    const ax = rr(r, x0 + 1.2, x1 - 1.2);
    const az = rr(r, z0 + 2, z1 - 1.5);
    g.box(ax - 0.6, top + 0.5, az - 0.5, ax + 0.6, top + 1.4, az + 0.5, PAL.metal);
  }
  return top + 2;
}

function comHigh(g, level, W, D, r) {
  g.lot(W, D, PAL.paving, PAL.concrete);
  const wall = pick(PAL.shopWall.concat(PAL.office), r);
  const glassy = pick(PAL.office, r);
  const y = 0.12;
  const x0 = -W / 2 + 0.8;
  const x1 = W / 2 - 0.8;
  const z0 = -D / 2 + 2;
  const z1 = D / 2 - 1.5;
  const gh = 4.4;
  g.box(x0, y, z0, x1, y + gh, z1, wall, { win: 3, base: y, fh: gh, ww: 4.4, roof: PAL.roofFlat[0] });
  shopFront(g, x0, x1, z0, y, gh, r);
  let top = y + gh;
  if (level === 1) {
    const f = Math.round(rr(r, 3, 5));
    g.box(x0, top, z0, x1, top + f * 3.3, z1, wall, { win: 1, base: top, fh: 3.3, roof: PAL.roofFlat[1] });
    top += f * 3.3;
    // panneau publicitaire lumineux
    g.box(-W / 4, top, z0 + 1, W / 4, top + 3.2, z0 + 1.4, pick(PAL.sign, r), { win: 5, ww: 100 });
  } else {
    g.box(x0, top, z0, x1, top + 4.4, z1, glassy, { win: 2, base: top, fh: 4.4, roof: PAL.roofFlat[2] });
    top += 4.4;
    const f = level === 2 ? Math.round(rr(r, 7, 13)) : Math.round(rr(r, 14, 26));
    const tx0 = x0 + rr(r, 2, 4);
    const tx1 = x1 - rr(r, 2, 4);
    const tz0 = z0 + rr(r, 2, 5);
    const tz1 = z1 - rr(r, 2, 4);
    g.box(tx0, top, tz0, tx1, top + f * 3.4, tz1, glassy, { win: 2, base: top, fh: 3.4, roof: PAL.roofFlat[0] });
    top += f * 3.4;
    if (level === 3) {
      g.box(tx0 + 2, top, tz0 + 2, tx1 - 2, top + 6, tz1 - 2, glassy, { win: 2, base: top, fh: 3 });
      top += 6;
      g.cyl((tx0 + tx1) / 2, (tz0 + tz1) / 2, 0.3, 0.1, top, top + 12, 6, PAL.metal);
    }
    g.box(tx0 + 1, top, tz0 + 0.3, tx1 - 1, top + 2.6, tz0 + 0.6, pick(PAL.sign, r), { win: 5, ww: 100 });
  }
  return top + 2;
}

function industrial(g, level, W, D, r) {
  g.lot(W, D, PAL.concrete, PAL.asphalt);
  const wall = pick(PAL.indWall, r);
  const roof = pick(PAL.indRoof, r);
  const y = 0.12;
  // clôture
  const fz = D / 2 - 0.4;
  g.box(-W / 2 + 0.3, y, fz - 0.1, W / 2 - 0.3, y + 1.8, fz, PAL.metal);
  g.box(-W / 2 + 0.3, y, -D / 2 + 1, -W / 2 + 0.4, y + 1.8, fz, PAL.metal);
  g.box(W / 2 - 0.4, y, -D / 2 + 1, W / 2 - 0.3, y + 1.8, fz, PAL.metal);
  const x0 = -W / 2 + 2;
  const x1 = W / 2 - 2;
  const z0 = -D / 2 + 5;
  const z1 = D / 2 - 2.5;
  const H = [7, 9, 11][level - 1] + rr(r, 0, 2);
  const hallW = level === 3 && W > 26 ? (x1 - x0) * 0.6 : x1 - x0;
  g.box(x0, y, z0, x0 + hallW, y + H, z1, wall, { win: 4, base: y, fh: H, ww: 4, roof });
  // toit en sheds
  if (r() < 0.6 && z1 - z0 > 10) {
    const n = Math.max(2, Math.floor((z1 - z0) / 6));
    const step = (z1 - z0) / n;
    for (let i = 0; i < n; i++) {
      const a = z0 + i * step;
      g.quadAuto([x0, y + H, a], [x0 + hallW, y + H, a], [x0 + hallW, y + H + 2.4, a + step * 0.8], [x0, y + H + 2.4, a + step * 0.8], [0, 1, -1], roof);
      g.quad([x0, y + H, a + step * 0.8], [x0 + hallW, y + H, a + step * 0.8], [x0 + hallW, y + H + 2.4, a + step * 0.8], [x0, y + H + 2.4, a + step * 0.8], [0, 0, 1], PAL.glass, null, 0);
      g.tri([x0, y + H, a], [x0, y + H, a + step * 0.8], [x0, y + H + 2.4, a + step * 0.8], [-1, 0, 0], wall);
      g.tri([x0 + hallW, y + H, a], [x0 + hallW, y + H, a + step * 0.8], [x0 + hallW, y + H + 2.4, a + step * 0.8], [1, 0, 0], wall);
    }
  }
  // portes de quai
  const doors = Math.max(1, Math.floor(hallW / 6));
  for (let i = 0; i < doors; i++) {
    const cx = x0 + (i + 0.5) * (hallW / doors);
    g.box(cx - 1.6, y, z0 - 0.08, cx + 1.6, y + 4, z0, PAL.dark);
  }
  // cheminée(s)
  const chimneys = level >= 2 ? 2 : 1;
  for (let i = 0; i < chimneys; i++) {
    const cx = x0 + hallW * rr(r, 0.15, 0.85);
    const cz = z1 - rr(r, 2, 5);
    const ch = H + rr(r, 8, 14) + level * 4;
    g.cyl(cx, cz, 1.0, 0.7, y + H * 0.5, y + ch, 8, PAL.concrete, { top: PAL.dark });
    g.cyl(cx, cz, 0.75, 0.75, y + ch - 2, y + ch - 1.2, 8, PAL.red, { cap: false });
    g.smoke.push([cx, y + ch + 0.5, cz, 0.6 + level * 0.25]);
  }
  // silos / cuves
  if (level >= 2 || r() < 0.5) {
    const sx = level === 3 && W > 26 ? x0 + hallW + 4 : W / 2 - 3;
    const n = level === 3 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const sz = z0 + 2 + i * 5.5;
      if (sz > z1 - 2) break;
      g.cyl(sx, sz, 2.2, 2.2, y, y + 9 + level * 2, 10, PAL.metal, { top: PAL.concrete });
      g.cone(sx, sz, 2.2, y + 9 + level * 2, y + 11 + level * 2, 10, PAL.concrete);
    }
  }
  // bureau d'accueil
  g.box(-W / 2 + 1, y, -D / 2 + 0.8, -W / 2 + 6, y + 3.4, -D / 2 + 4.5, PAL.white, { win: 1, base: y, fh: 3.4 });
  return y + H + 6;
}

function office(g, level, W, D, r) {
  g.lot(W, D, PAL.paving, PAL.concrete);
  const col = pick(PAL.office, r);
  const y = 0.12;
  const x0 = -W / 2 + 1.5;
  const x1 = W / 2 - 1.5;
  const z0 = -D / 2 + 3.5;
  const z1 = D / 2 - 2;
  const fh = 3.6;
  let top;
  if (level === 1) {
    const f = Math.round(rr(r, 4, 7));
    top = y + f * fh;
    g.box(x0, y, z0, x1, top, z1, col, { win: r() < 0.5 ? 1 : 2, base: y, fh, roof: PAL.roofFlat[0] });
    g.box(x0 - 0.2, top, z0 - 0.2, x1 + 0.2, top + 0.7, z1 + 0.2, PAL.concrete);
  } else if (level === 2) {
    const f = Math.round(rr(r, 9, 16));
    top = y + f * fh;
    g.box(x0, y, z0, x1, top, z1, col, { win: 2, base: y, fh, roof: PAL.roofFlat[1] });
    g.box(x0 + 2, top, z0 + 2, x1 - 2, top + 2 * fh, z1 - 2, col, { win: 2, base: y, fh });
    top += 2 * fh;
  } else {
    const f = Math.round(rr(r, 18, 34));
    const h1 = Math.round(f * 0.6);
    top = y + h1 * fh;
    g.box(x0, y, z0, x1, top, z1, col, { win: 2, base: y, fh, roof: PAL.roofFlat[2] });
    const ix = Math.min(3, (x1 - x0) * 0.15);
    const iz = Math.min(3, (z1 - z0) * 0.15);
    g.box(x0 + ix, top, z0 + iz, x1 - ix, top + (f - h1) * fh, z1 - iz, col, { win: 2, base: y, fh });
    top += (f - h1) * fh;
    g.box(x0 + ix * 2, top, z0 + iz * 2, x1 - ix * 2, top + 5, z1 - iz * 2, PAL.metal);
    top += 5;
    g.cyl(0, (z0 + z1) / 2, 0.35, 0.12, top, top + 16, 6, PAL.white);
  }
  // entrée vitrée et plantations
  g.box(-3, y, z0 - 2, 3, y + 3.4, z0, PAL.glass, { win: 2, fh: 3.4, base: y });
  g.box(-W / 2 + 1, y, -D / 2 + 0.6, -W / 2 + 3.2, y + 0.6, -D / 2 + 2.6, PAL.concrete, { roof: PAL.hedge });
  g.box(W / 2 - 3.2, y, -D / 2 + 0.6, W / 2 - 1, y + 0.6, -D / 2 + 2.6, PAL.concrete, { roof: PAL.hedge });
  return top + 2;
}

export function genZoneBuilding(zone, level, wc, dc, seed) {
  const g = new BGeo();
  const r = mulberry32(seed);
  const W = wc * 8;
  const D = dc * 8;
  let h = 10;
  if (zone === 1) h = resLow(g, level, W, D, r);
  else if (zone === 2) h = resHigh(g, level, W, D, r);
  else if (zone === 3) h = comLow(g, level, W, D, r);
  else if (zone === 4) h = comHigh(g, level, W, D, r);
  else if (zone === 5) h = industrial(g, level, W, D, r);
  else h = office(g, level, W, D, r);
  const geo = g.build();
  return { geo, height: h, smoke: g.smoke };
}

// ---------------------------------------------------------------------------
// Bâtiments de service
function fence(g, W, D, y, col, gap = 8) {
  g.box(-W / 2 + 0.3, y, D / 2 - 0.4, W / 2 - 0.3, y + 1.8, D / 2 - 0.3, col);
  g.box(-W / 2 + 0.3, y, -D / 2 + 0.3, -W / 2 + 0.4, y + 1.8, D / 2 - 0.3, col);
  g.box(W / 2 - 0.4, y, -D / 2 + 0.3, W / 2 - 0.3, y + 1.8, D / 2 - 0.3, col);
  g.box(-W / 2 + 0.3, y, -D / 2 + 0.3, -gap / 2, y + 1.8, -D / 2 + 0.4, col);
  g.box(gap / 2, y, -D / 2 + 0.3, W / 2 - 0.3, y + 1.8, -D / 2 + 0.4, col);
}

function redCross(g, x, y, z) {
  g.box(x - 1.2, y - 0.35, z - 0.25, x + 1.2, y + 0.35, z, PAL.red, { win: 5, ww: 100 });
  g.box(x - 0.35, y - 1.2, z - 0.25, x + 0.35, y + 1.2, z, PAL.red, { win: 5, ww: 100 });
  const n = g.w.length;
  for (let i = n - 60; i < n; i++) g.w[i] = 5;
}

const SERVICE_GEN = {
  coal(g, W, D, r) {
    g.lot(W, D, PAL.asphalt, PAL.concrete);
    const y = 0.12;
    g.box(-W / 2 + 2, y, -D / 2 + 6, 4, y + 15, 6, PAL.indWall[1], { win: 4, fh: 15, roof: PAL.indRoof[0] });
    g.box(-W / 2 + 4, y, 6, -2, y + 24, 16, PAL.indWall[0], { win: 4, fh: 24, roof: PAL.indRoof[2] });
    for (const cx of [-12, -6]) {
      g.cyl(cx, 19, 1.9, 1.3, y + 24, y + 62, 10, PAL.white, { top: PAL.dark });
      for (const band of [44, 52, 58]) g.cyl(cx, 19, 1.55, 1.45, y + band, y + band + 2.2, 10, PAL.red, { cap: false });
      g.smoke.push([cx, y + 63, 19, 1.6]);
    }
    // tour de refroidissement
    g.lathe(
      10,
      12,
      [
        [11, y],
        [9.5, y + 10],
        [7.6, y + 22],
        [7.9, y + 28],
        [8.6, y + 33],
      ],
      18,
      PAL.concrete
    );
    g.lathe(
      10,
      12,
      [
        [8.6, y + 33],
        [7.9, y + 28],
        [7.6, y + 22],
      ],
      18,
      PAL.dark,
      { inside: true }
    );
    g.smoke.push([10, y + 35, 12, 3.2, 'steam']);
    // tas de charbon
    for (const [x, z] of [[12, -14], [4, -16], [16, -6]]) g.cone(x, z, 5, y, y + 3.6, 9, PAL.black);
    g.box(-2, y + 6, -10, 12, y + 7, -8.6, PAL.metal);
    return 63;
  },
  wind(g, W, D, r) {
    g.lot(W, D, PAL.lawn, PAL.lawn2);
    g.box(-2.5, 0.12, -6.5, 2.5, 3, -2.5, PAL.concrete);
    g.cyl(0, 0, 1.5, 0.75, 0.12, 54, 12, PAL.white);
    g.box(-1.1, 52.6, -2.4, 1.1, 54.8, 3.6, PAL.white);
    return 72;
  },
  solar(g, W, D, r) {
    g.lot(W, D, PAL.lawn2, PAL.lawn);
    const y = 0.12;
    for (let z = -D / 2 + 10; z < D / 2 - 3; z += 6.5) {
      for (let x = -W / 2 + 3; x < W / 2 - 6; x += 9) {
        g.quadAuto([x, y + 0.9, z], [x + 8, y + 0.9, z], [x + 8, y + 2.9, z + 3.6], [x, y + 2.9, z + 3.6], [0, 1, -1], C(0x1f3a63));
        g.box(x + 3.9, y, z + 1.6, x + 4.1, y + 1.8, z + 1.8, PAL.metal);
      }
    }
    g.box(-W / 2 + 2, y, -D / 2 + 1, -W / 2 + 10, y + 3.5, -D / 2 + 7, PAL.white, { win: 1, fh: 3.5 });
    return 6;
  },
  pump(g, W, D, r) {
    g.lot(W, D, PAL.concrete, PAL.concrete);
    const y = 0.12;
    g.box(-6, y, -D / 2 + 2, 6, y + 6.5, 2, C(0x6c8fae), { win: 1, fh: 3.2, roof: PAL.roofFlat[0] });
    g.cyl(0, 6, 1.2, 1.2, y, y + 3.5, 10, PAL.metal);
    g.box(-0.9, y + 1.4, 2, 0.9, y + 2.8, D / 2 + 10, PAL.metal);
    g.box(-2.5, -3, D / 2 + 6, 2.5, y + 1.2, D / 2 + 11, PAL.concrete);
    return 9;
  },
  watertower(g, W, D, r) {
    g.lot(W, D, PAL.lawn, PAL.lawn2);
    const y = 0.12;
    for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) g.cyl(x, z, 0.35, 0.3, y, y + 20, 6, PAL.metal);
    g.cyl(0, 0, 0.9, 0.9, y, y + 20, 8, PAL.metal);
    g.cyl(0, 0, 5.5, 5.5, y + 20, y + 26, 16, C(0x8fb8d8));
    g.cone(0, 0, 5.8, y + 26, y + 29, 16, PAL.metal);
    return 29;
  },
  outlet(g, W, D, r) {
    g.lot(W, D, PAL.concrete, PAL.concrete);
    const y = 0.12;
    g.box(-4, y, -4, 4, y + 3.2, 3, PAL.concrete, { roof: PAL.roofFlat[1] });
    g.cyl(0, 2, 1.3, 1.3, y, y + 1.4, 10, PAL.rust);
    g.box(-1.1, -1.2, 3, 1.1, 0.6, D / 2 + 9, PAL.rust);
    return 4;
  },
  treatment(g, W, D, r) {
    g.lot(W, D, PAL.concrete, PAL.concrete);
    const y = 0.12;
    for (const [x, z] of [[-10, 2], [8, 2], [-10, 14], [8, 14]]) {
      g.cyl(x, z, 6.5, 6.5, y, y + 2.2, 18, PAL.concrete, { top: C(0x5d7a5a) });
      g.box(x - 6, y + 2.25, z - 0.2, x + 6, y + 2.5, z + 0.2, PAL.metal);
    }
    g.box(-W / 2 + 2, y, -D / 2 + 1, 6, y + 5.5, -8, PAL.white, { win: 1, fh: 3.2, roof: PAL.roofFlat[0] });
    return 7;
  },
  landfill(g, W, D, r) {
    g.lot(W, D, PAL.earth, PAL.earth);
    const y = 0.12;
    fence(g, W, D, y, PAL.metal);
    const cols = [C(0x6b6158), C(0x7d7365), C(0x5c5a55), C(0x8a7a5e)];
    for (let i = 0; i < 6; i++) {
      const x = rr(r, -W / 2 + 7, W / 2 - 7);
      const z = rr(r, -D / 2 + 12, D / 2 - 7);
      const s = rr(r, 4, 8);
      g.lathe(
        x,
        z,
        [
          [s, y],
          [s * 0.8, y + s * 0.35],
          [s * 0.45, y + s * 0.6],
          [0.01, y + s * 0.7],
        ],
        9,
        pick(cols, r)
      );
    }
    g.box(-W / 2 + 2, y, -D / 2 + 1.5, -W / 2 + 10, y + 3.4, -D / 2 + 6, PAL.white, { win: 1, fh: 3.4 });
    g.box(W / 2 - 14, y, -D / 2 + 1.5, W / 2 - 2, y + 6, -D / 2 + 9, PAL.indWall[1], { win: 4, fh: 6, roof: PAL.indRoof[0] });
    return 8;
  },
  incinerator(g, W, D, r) {
    g.lot(W, D, PAL.asphalt, PAL.concrete);
    const y = 0.12;
    g.box(-W / 2 + 3, y, -D / 2 + 6, W / 2 - 10, y + 16, D / 2 - 4, PAL.indWall[6], { win: 4, fh: 16, roof: PAL.indRoof[0] });
    g.box(W / 2 - 9, y, -6, W / 2 - 2, y + 9, 10, PAL.indWall[0], { win: 4, fh: 9 });
    g.cyl(W / 2 - 6, D / 2 - 6, 2, 1.5, y, y + 48, 10, PAL.concrete, { top: PAL.dark });
    g.cyl(W / 2 - 6, D / 2 - 6, 1.6, 1.55, y + 42, y + 44, 10, PAL.red, { cap: false });
    g.smoke.push([W / 2 - 6, y + 49, D / 2 - 6, 1.4]);
    return 49;
  },
  clinic(g, W, D, r) {
    g.lot(W, D, PAL.paving, PAL.concrete);
    const y = 0.12;
    g.box(-W / 2 + 2, y, -D / 2 + 5, W / 2 - 2, y + 7, D / 2 - 2, PAL.white, { win: 1, fh: 3.5, roof: PAL.roofFlat[0] });
    g.box(-3, y, -D / 2 + 3, 3, y + 3.2, -D / 2 + 5, PAL.glass, { win: 2, fh: 3.2 });
    redCross(g, 0, y + 5.4, -D / 2 + 5);
    return 9;
  },
  hospital(g, W, D, r) {
    g.lot(W, D, PAL.paving, PAL.concrete);
    const y = 0.12;
    g.box(-W / 2 + 2, y, -D / 2 + 6, W / 2 - 2, y + 8, D / 2 - 2, C(0xe8eef2), { win: 1, fh: 4, roof: PAL.roofFlat[0] });
    g.box(-W / 2 + 7, y + 8, -D / 2 + 9, W / 2 - 7, y + 22, D / 2 - 6, C(0xdfe8ee), { win: 1, fh: 3.5, base: y + 8, roof: PAL.roofFlat[1] });
    g.cyl(0, 6, 6, 6, y + 22, y + 22.3, 20, PAL.concrete, { top: C(0x3a4a3a) });
    g.box(-2.2, y + 22.32, 5.6, 2.2, y + 22.4, 6.4, PAL.white);
    g.box(-2.2, y + 22.32, 3.5, -1.4, y + 22.4, 8.5, PAL.white);
    g.box(1.4, y + 22.32, 3.5, 2.2, y + 22.4, 8.5, PAL.white);
    g.box(-5, y, -D / 2 + 2, 5, y + 4, -D / 2 + 6, PAL.glass, { win: 2, fh: 4 });
    redCross(g, 0, y + 6, -D / 2 + 6);
    return 24;
  },
  cemetery(g, W, D, r) {
    g.lot(W, D, PAL.lawn, PAL.lawn2);
    const y = 0.12;
    g.box(-W / 2 + 0.3, y, -D / 2 + 0.3, W / 2 - 0.3, y + 1.4, -D / 2 + 0.6, C(0x8a8478));
    g.slab(-1.5, -D / 2, 1.5, D / 2 - 2, y + 0.02, PAL.path);
    for (let x = -W / 2 + 3; x < W / 2 - 2; x += 2.6) {
      if (Math.abs(x) < 2.6) continue;
      for (let z = -D / 2 + 8; z < D / 2 - 2; z += 3) g.box(x - 0.4, y, z - 0.12, x + 0.4, y + rr(r, 0.7, 1.1), z + 0.12, C(0x9c9a94));
    }
    g.box(-4, y, -D / 2 + 1.5, 4, y + 5, -D / 2 + 7, C(0xd8d0bf));
    g.gable(-4, -D / 2 + 1.5, 4, -D / 2 + 7, y + 5, 3, PAL.houseRoof[3], C(0xd8d0bf), false);
    g.box(-1, y + 5, -D / 2 + 2, 1, y + 11, -D / 2 + 4, C(0xd8d0bf));
    g.cone(0, -D / 2 + 3, 1.3, y + 11, y + 14, 4, PAL.houseRoof[3]);
    for (let i = 0; i < 8; i++) g.tree(rr(r, -W / 2 + 2, W / 2 - 2), rr(r, -D / 2 + 9, D / 2 - 2), y, rr(r, 0.7, 1), r, true);
    return 14;
  },
  crematorium(g, W, D, r) {
    g.lot(W, D, PAL.lawn, PAL.paving);
    const y = 0.12;
    g.box(-W / 2 + 4, y, -D / 2 + 6, W / 2 - 4, y + 7, D / 2 - 4, C(0xcfc6b5), { win: 1, fh: 3.5, roof: PAL.roofFlat[0] });
    g.cyl(W / 2 - 8, D / 2 - 8, 1.2, 1, y + 7, y + 22, 8, PAL.brick, { top: PAL.dark });
    g.smoke.push([W / 2 - 8, y + 23, D / 2 - 8, 0.7]);
    for (let i = 0; i < 5; i++) g.tree(rr(r, -W / 2 + 2, W / 2 - 2), D / 2 - 2, y, 0.8, r, true);
    return 22;
  },
  fire(g, W, D, r) {
    g.lot(W, D, PAL.asphalt, PAL.concrete);
    const y = 0.12;
    g.box(-W / 2 + 1.5, y, -D / 2 + 6, W / 2 - 1.5, y + 8, D / 2 - 2, PAL.brick, { win: 1, fh: 4, roof: PAL.roofFlat[0] });
    for (const x of [-7, 0, 7]) g.box(x - 2.6, y, -D / 2 + 5.9, x + 2.6, y + 4.2, -D / 2 + 6, C(0xb0332a));
    g.box(W / 2 - 6, y, D / 2 - 7, W / 2 - 1.5, y + 16, D / 2 - 2, PAL.brick, { win: 1, fh: 4 });
    g.box(-W / 2 + 2, y + 6.2, -D / 2 + 5.6, W / 2 - 2, y + 7.2, -D / 2 + 5.95, PAL.red, { win: 5, ww: 100 });
    return 16;
  },
  police(g, W, D, r) {
    g.lot(W, D, PAL.asphalt, PAL.concrete);
    const y = 0.12;
    g.box(-W / 2 + 1.5, y, -D / 2 + 6, W / 2 - 1.5, y + 10, D / 2 - 2, C(0xc9ced6), { win: 1, fh: 3.4, roof: PAL.roofFlat[0] });
    g.box(-W / 2 + 1.5, y + 3.4, -D / 2 + 5.8, W / 2 - 1.5, y + 4.2, -D / 2 + 6, PAL.blue);
    g.box(-3, y + 7.2, -D / 2 + 5.6, 3, y + 8.6, -D / 2 + 6, PAL.blue, { win: 5, ww: 100 });
    g.box(-3, y, -D / 2 + 3.5, 3, y + 3.2, -D / 2 + 6, PAL.glass, { win: 2, fh: 3.2 });
    g.cyl(W / 2 - 3, -D / 2 + 2, 0.1, 0.1, y, y + 9, 5, PAL.metal);
    return 11;
  },
  school(g, W, D, r) {
    g.lot(W, D, PAL.lawn, PAL.paving);
    const y = 0.12;
    const col = C(0xe6c98f);
    g.box(-W / 2 + 2, y, -D / 2 + 4, W / 2 - 2, y + 7, -D / 2 + 13, col, { win: 1, fh: 3.5, roof: PAL.houseRoof[0] });
    g.box(-W / 2 + 2, y, -D / 2 + 13, -W / 2 + 11, y + 7, D / 2 - 3, col, { win: 1, fh: 3.5, roof: PAL.houseRoof[0] });
    g.slab(-W / 2 + 13, -D / 2 + 15, W / 2 - 2, D / 2 - 2, y + 0.02, C(0xc96f4b));
    g.box(W / 2 - 8, y, -D / 2 + 18, W / 2 - 6, y + 2.5, -D / 2 + 20, PAL.yellow);
    g.box(W / 2 - 12, y, -D / 2 + 22, W / 2 - 4, y + 1.5, -D / 2 + 23, PAL.blue);
    g.cyl(-W / 2 + 18, D / 2 - 6, 0.08, 0.08, y, y + 8, 5, PAL.metal);
    return 9;
  },
  highschool(g, W, D, r) {
    g.lot(W, D, PAL.lawn, PAL.paving);
    const y = 0.12;
    const col = C(0xc9b28a);
    g.box(-W / 2 + 2, y, -D / 2 + 4, W / 2 - 2, y + 11, -D / 2 + 16, col, { win: 1, fh: 3.6, roof: PAL.roofFlat[0] });
    // piste d'athlétisme
    const cz = D / 2 - 14;
    g.cyl(0, cz, 12, 12, y, y + 0.06, 24, C(0xb84a3a), { top: C(0xb84a3a) });
    g.cyl(0, cz, 9, 9, y + 0.07, y + 0.1, 24, PAL.lawn2, { top: PAL.lawn2 });
    return 12;
  },
  university(g, W, D, r) {
    g.lot(W, D, PAL.lawn, PAL.paving);
    const y = 0.12;
    const col = C(0xd8c7a6);
    g.box(-W / 2 + 3, y, -D / 2 + 6, -6, y + 12, -D / 2 + 22, col, { win: 1, fh: 4, roof: PAL.roofFlat[0] });
    g.box(6, y, -D / 2 + 6, W / 2 - 3, y + 12, -D / 2 + 22, col, { win: 1, fh: 4, roof: PAL.roofFlat[0] });
    g.box(-W / 2 + 3, y, D / 2 - 18, W / 2 - 3, y + 15, D / 2 - 4, col, { win: 1, fh: 3.75, roof: PAL.roofFlat[1] });
    g.box(-6, y, -D / 2 + 10, 6, y + 14, -D / 2 + 22, PAL.white, { win: 1, fh: 4.6 });
    g.lathe(
      0,
      -D / 2 + 16,
      [
        [5.5, y + 14],
        [5.2, y + 16.5],
        [4, y + 19],
        [2, y + 20.5],
        [0.01, y + 21],
      ],
      16,
      C(0x6b8f8a)
    );
    g.slab(-1.5, -D / 2, 1.5, -D / 2 + 10, y + 0.02, PAL.path);
    for (let i = 0; i < 10; i++) g.tree(rr(r, -W / 2 + 3, W / 2 - 3), rr(r, -D / 2 + 24, D / 2 - 20), y, rr(r, 0.8, 1.2), r);
    return 22;
  },
  busdepot(g, W, D, r) {
    g.lot(W, D, PAL.asphalt, PAL.concrete);
    const y = 0.12;
    g.box(-W / 2 + 2, y, -D / 2 + 12, W / 2 - 2, y + 8, D / 2 - 2, PAL.indWall[1], { win: 4, fh: 8, roof: PAL.indRoof[1] });
    for (let i = 0; i < 3; i++) {
      const x = -W / 2 + 6 + i * 9;
      g.box(x - 1.3, y, -D / 2 + 1.5, x + 1.3, y + 3.2, -D / 2 + 11.5, C(0xe0832f), { win: 2, fh: 3.2, roof: PAL.white });
    }
    return 9;
  },
  park_small(g, W, D, r) {
    g.lot(W, D, PAL.lawn2, PAL.lawn);
    const y = 0.12;
    g.slab(-1, -D / 2, 1, D / 2, y + 0.02, PAL.path);
    g.slab(-W / 2, -1, W / 2, 1, y + 0.02, PAL.path);
    for (const [x, z] of [[-4.5, -4.5], [4.5, 4.5], [-4.5, 4.5], [4.5, -4.5]]) g.tree(x, z, y, rr(r, 0.8, 1.1), r);
    g.box(-2.5, y, 1.6, -0.5, y + 0.5, 2.1, PAL.trunk);
    return 6;
  },
  playground(g, W, D, r) {
    g.lot(W, D, PAL.lawn2, PAL.lawn);
    const y = 0.12;
    g.slab(-6, -6, 6, 6, y + 0.02, PAL.sand);
    g.box(-4, y, -3, -3.2, y + 2.6, -2.2, PAL.red);
    g.quadAuto([-3.2, y + 2.6, -3], [-3.2, y + 2.6, -2.2], [0.5, y + 0.3, -2.2], [0.5, y + 0.3, -3], [0, 1, 0], PAL.yellow);
    g.box(2, y, 1, 2.2, y + 2.4, 1.2, PAL.blue);
    g.box(5, y, 1, 5.2, y + 2.4, 1.2, PAL.blue);
    g.box(2, y + 2.3, 1, 5.2, y + 2.45, 1.2, PAL.blue);
    g.tree(-6, 6, y, 0.9, r);
    g.tree(6, -6, y, 0.9, r);
    return 5;
  },
  plaza(g, W, D, r) {
    g.lot(W, D, C(0xc4b8a2), PAL.paving);
    const y = 0.12;
    g.cyl(0, 0, 4.2, 4.2, y, y + 0.7, 20, C(0xd6d0c4), { top: PAL.water });
    g.cyl(0, 0, 0.6, 0.4, y + 0.7, y + 2.8, 8, C(0xd6d0c4));
    g.cyl(0, 0, 1.2, 1.2, y + 2.8, y + 3.0, 10, C(0xd6d0c4), { top: PAL.water });
    for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) {
      g.box(x - 1.3, y, z - 1.3, x + 1.3, y + 0.7, z + 1.3, PAL.concrete);
      g.tree(x, z, y + 0.7, 0.9, r);
    }
    return 6;
  },
  park_large(g, W, D, r) {
    g.lot(W, D, PAL.lawn2, PAL.lawn);
    const y = 0.12;
    g.cyl(4, 4, 9, 9, y - 0.2, y + 0.04, 20, C(0x3d7f9f), { top: C(0x3f8fb0) });
    g.slab(-1.2, -D / 2, 1.2, -4, y + 0.02, PAL.path);
    g.slab(-W / 2 + 2, -6, -3, -3.6, y + 0.02, PAL.path);
    g.cyl(-12, 10, 3, 3, y, y + 0.4, 8, PAL.white);
    for (const [x, z] of [[-14, 11.5], [-10, 11.5]]) g.box(x - 0.15, y + 0.4, z - 0.15, x + 0.15, y + 3, z + 0.15, PAL.white);
    g.cone(-12, 10, 3.6, y + 3, y + 4.6, 8, PAL.houseRoof[1]);
    for (let i = 0; i < 16; i++) {
      const x = rr(r, -W / 2 + 2, W / 2 - 2);
      const z = rr(r, -D / 2 + 2, D / 2 - 2);
      if ((x - 4) ** 2 + (z - 4) ** 2 < 110) continue;
      g.tree(x, z, y, rr(r, 0.9, 1.5), r, r() < 0.3);
    }
    return 8;
  },
  sports(g, W, D, r) {
    g.lot(W, D, PAL.lawn, PAL.paving);
    const y = 0.12;
    g.slab(-W / 2 + 3, -D / 2 + 3, W / 2 - 3, D / 2 - 8, y + 0.03, C(0x5f9e47));
    g.slab(-0.1, -D / 2 + 3, 0.1, D / 2 - 8, y + 0.05, PAL.white);
    for (const x of [-W / 2 + 3.2, W / 2 - 3.6]) g.box(x, y, -1.5, x + 0.4, y + 2.2, 1.5, PAL.white);
    for (let i = 0; i < 4; i++) g.box(-W / 2 + 4, y, D / 2 - 7 + i * 1.2, W / 2 - 4, y + 0.6 + i * 0.6, D / 2 - 5.8 + i * 1.2, i % 2 ? PAL.blue : PAL.concrete);
    return 4;
  },
  townhall(g, W, D, r) {
    g.lot(W, D, C(0xc9bda5), PAL.paving);
    const y = 0.12;
    const stone = C(0xe3dac6);
    g.box(-W / 2 + 4, y, -D / 2 + 9, W / 2 - 4, y + 13, D / 2 - 4, stone, { win: 1, fh: 4.3, roof: PAL.roofFlat[0] });
    g.box(-10, y, -D / 2 + 3, 10, y + 1, -D / 2 + 9, stone);
    for (let i = 0; i < 6; i++) g.cyl(-8.5 + i * 3.4, -D / 2 + 5, 0.55, 0.5, y + 1, y + 12, 10, PAL.white);
    g.box(-10, y + 12, -D / 2 + 3.5, 10, y + 13, -D / 2 + 9, stone);
    g.tri([-10.4, y + 13, -D / 2 + 3.4], [10.4, y + 13, -D / 2 + 3.4], [0, y + 17.5, -D / 2 + 3.4], [0, 0, -1], stone);
    g.quadAuto([-10.4, y + 13, -D / 2 + 3.4], [0, y + 17.5, -D / 2 + 3.4], [0, y + 17.5, -D / 2 + 9], [-10.4, y + 13, -D / 2 + 9], [-1, 1, 0], PAL.houseRoof[2]);
    g.quadAuto([10.4, y + 13, -D / 2 + 3.4], [0, y + 17.5, -D / 2 + 3.4], [0, y + 17.5, -D / 2 + 9], [10.4, y + 13, -D / 2 + 9], [1, 1, 0], PAL.houseRoof[2]);
    g.cyl(0, 3, 6, 6, y + 13, y + 17, 16, stone);
    g.lathe(
      0,
      3,
      [
        [6.2, y + 17],
        [5.8, y + 20],
        [4.2, y + 23],
        [2, y + 24.6],
        [0.01, y + 25],
      ],
      16,
      C(0x5c8a80)
    );
    g.cyl(0, 3, 0.08, 0.08, y + 25, y + 31, 4, PAL.metal);
    g.box(0.1, y + 29, 2.95, 2.4, y + 30.4, 3.05, PAL.blue);
    return 31;
  },
  stadium(g, W, D, r) {
    g.lot(W, D, PAL.paving, PAL.concrete);
    const y = 0.12;
    g.lathe(
      0,
      0,
      [
        [33, y],
        [33, y + 16],
        [31, y + 16.5],
      ],
      36,
      C(0xd9d6cf)
    );
    g.lathe(
      0,
      0,
      [
        [31, y + 16.5],
        [21, y + 3],
        [19, y + 1],
      ],
      36,
      C(0x3d6fb3),
      { inside: true }
    );
    g.cyl(0, 0, 19, 19, y, y + 0.9, 36, C(0x4f9c3e), { top: C(0x4f9c3e) });
    g.slab(-0.15, -12, 0.15, 12, y + 0.95, PAL.white);
    for (const [x, z] of [[-27, -27], [27, -27], [-27, 27], [27, 27]]) {
      g.cyl(x, z, 0.6, 0.45, y, y + 30, 6, PAL.metal);
      g.box(x - 2, y + 29, z - 0.4, x + 2, y + 31.5, z + 0.4, PAL.white, { win: 5, ww: 100 });
    }
    return 32;
  },
  tvtower(g, W, D, r) {
    g.lot(W, D, PAL.paving, PAL.concrete);
    const y = 0.12;
    g.box(-8, y, -8, 8, y + 6, 8, PAL.concrete, { win: 2, fh: 3 });
    g.cyl(0, 0, 3.2, 2.1, y, y + 150, 14, C(0xe0ddd5));
    g.lathe(
      0,
      0,
      [
        [2.2, y + 118],
        [9, y + 124],
        [10, y + 128],
        [9.6, y + 132],
        [4, y + 136],
        [2.1, y + 138],
      ],
      20,
      C(0xcfd4d8),
      { cols: [C(0xcfd4d8), PAL.glass, PAL.glass, C(0xcfd4d8), C(0xcfd4d8)] }
    );
    g.cyl(0, 0, 0.9, 0.35, y + 150, y + 192, 8, C(0xc0392b));
    g.box(-0.6, y + 191, -0.6, 0.6, y + 192.2, 0.6, PAL.red, { win: 5, ww: 100 });
    return 192;
  },
  cathedral(g, W, D, r) {
    g.lot(W, D, PAL.paving, PAL.concrete);
    const y = 0.12;
    const stone = C(0xcfc3a8);
    const roof = C(0x55606a);
    g.box(-8, y, -D / 2 + 12, 8, y + 20, D / 2 - 6, stone, { win: 1, fh: 10, ww: 5 });
    g.gable(-8, -D / 2 + 12, 8, D / 2 - 6, y + 20, 10, roof, stone, false, 0.4);
    g.box(-W / 2 + 2, y, 4, W / 2 - 2, y + 17, 14, stone, { win: 1, fh: 8.5, ww: 5 });
    g.gable(-W / 2 + 2, 4, W / 2 - 2, 14, y + 17, 8, roof, stone, true, 0.4);
    for (const x of [-6, 6]) {
      g.box(x - 4, y, -D / 2 + 3, x + 4, y + 36, -D / 2 + 12, stone, { win: 1, fh: 9, ww: 4 });
      g.cone(x, -D / 2 + 7.5, 4.6, y + 36, y + 52, 4, roof);
    }
    g.cyl(0, -D / 2 + 11.9, 3, 3, y + 20, y + 20.2, 16, C(0x5277a8));
    g.lathe(
      0,
      D / 2 - 6,
      [
        [8, y],
        [8, y + 18],
        [0.01, y + 24],
      ],
      12,
      stone
    );
    return 52;
  },
};

export function genService(id, W, D, seed) {
  const g = new BGeo();
  const r = mulberry32(seed);
  const f = SERVICE_GEN[id];
  const h = f ? f(g, W, D, r) : (g.lot(W, D, PAL.concrete), g.box(-W / 2 + 2, 0, -D / 2 + 2, W / 2 - 2, 8, D / 2 - 2, PAL.white), 8);
  return { geo: g.build(), height: h, smoke: g.smoke };
}

// Pales d'éolienne (tournent autour de Z local)
export function genRotor() {
  const g = new BGeo();
  g.cyl(0, 0, 0.6, 0.6, -0.6, 0.6, 8, PAL.white);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const L = 21;
    const w0 = 1.1;
    const w1 = 0.35;
    const p = (s, t) => [ca * s - sa * t, sa * s + ca * t, 0];
    g.quad(p(0.6, -w0 / 2), p(L, -w1 / 2), p(L, w1 / 2), p(0.6, w0 / 2), [0, 0, -1], PAL.white, null, 0);
    g.quad(p(0.6, w0 / 2), p(L, w1 / 2), p(L, -w1 / 2), p(0.6, -w0 / 2), [0, 0, 1], PAL.white, null, 0);
  }
  const geo = g.build();
  // la géométrie est dans le plan XY : on la couche face au vent (le moyeu regarde -Z)
  return geo;
}

// Grue de chantier
export function genCrane(h) {
  const g = new BGeo();
  const yel = C(0xf0b429);
  g.box(-0.9, 0, -0.9, 0.9, h, 0.9, yel);
  g.box(-0.95, h, -14, 0.95, h + 1.4, 5, yel);
  g.box(-1.6, h - 1, 2.5, 1.6, h + 1.6, 6, PAL.concrete);
  g.box(-1.1, h + 1.4, -1.1, 1.1, h + 3.8, 1.1, yel);
  return g.build();
}

// ---------------------------------------------------------------------------
// Véhicules (avant = +Z)
export function genVehicle(type) {
  const g = new BGeo();
  const body = PAL.white;
  const glass = C(0x26313c);
  const tire = PAL.black;
  const wheels = (len, w, r0, positions) => {
    for (const z of positions)
      for (const x of [-w / 2, w / 2]) g.box(x - 0.14, 0, z - r0, x + 0.14, r0 * 2, z + r0, tire);
  };
  const lights = (len, w, y0) => {
    g.box(-w / 2 + 0.15, y0, len / 2 - 0.02, -w / 2 + 0.55, y0 + 0.22, len / 2 + 0.04, PAL.white);
    g.box(w / 2 - 0.55, y0, len / 2 - 0.02, w / 2 - 0.15, y0 + 0.22, len / 2 + 0.04, PAL.white);
    let n = g.w.length;
    for (let i = n - 60; i < n; i++) g.w[i] = 6;
    g.box(-w / 2 + 0.15, y0, -len / 2 - 0.04, -w / 2 + 0.5, y0 + 0.2, -len / 2 + 0.02, PAL.red);
    g.box(w / 2 - 0.5, y0, -len / 2 - 0.04, w / 2 - 0.15, y0 + 0.2, -len / 2 + 0.02, PAL.red);
    n = g.w.length;
    for (let i = n - 60; i < n; i++) g.w[i] = 7;
  };
  const beacon = (y, z, colA, colB) => {
    g.box(-0.5, y, z - 0.15, 0, y + 0.18, z + 0.15, colA);
    g.box(0, y, z - 0.15, 0.5, y + 0.18, z + 0.15, colB);
    const n = g.w.length;
    for (let i = n - 60; i < n; i++) g.w[i] = 5;
  };
  switch (type) {
    case 'car':
      g.box(-0.9, 0.3, -2.15, 0.9, 1.0, 2.15, body);
      g.box(-0.8, 1.0, -1.25, 0.8, 1.48, 0.95, glass, { roof: body });
      wheels(4.3, 1.8, 0.33, [-1.35, 1.35]);
      lights(4.3, 1.8, 0.62);
      break;
    case 'van':
      g.box(-1.0, 0.32, -2.5, 1.0, 2.1, 2.5, body);
      g.box(-0.95, 1.2, 1.7, 0.95, 2.0, 2.52, glass);
      wheels(5, 2, 0.36, [-1.6, 1.6]);
      lights(5, 2, 0.7);
      break;
    case 'truck':
      g.box(-1.2, 0.45, 2.0, 1.2, 2.7, 3.6, body);
      g.box(-1.15, 1.7, 3.0, 1.15, 2.55, 3.62, glass);
      g.box(-1.25, 0.6, -4.2, 1.25, 3.4, 1.8, C(0xd9d6cf));
      wheels(7.8, 2.4, 0.45, [-3.2, -2.1, 2.7]);
      lights(7.8, 2.4, 0.9);
      break;
    case 'bus':
      g.box(-1.25, 0.4, -5.9, 1.25, 3.1, 5.9, C(0xe0832f), { win: 2, fh: 1.4, base: 1.7, ww: 1.6, roof: PAL.white });
      g.box(-1.26, 0.4, -5.9, 1.26, 1.6, 5.9, PAL.white);
      g.box(-1.2, 1.4, 5.85, 1.2, 2.9, 5.95, glass);
      wheels(11.8, 2.5, 0.48, [-4, 3.8]);
      lights(11.8, 2.5, 0.8);
      break;
    case 'garbage':
      g.box(-1.15, 0.45, 2.1, 1.15, 2.6, 3.5, C(0xe9e9e4));
      g.box(-1.1, 1.6, 2.9, 1.1, 2.45, 3.52, glass);
      g.box(-1.25, 0.6, -3.6, 1.25, 3.2, 2.0, C(0x3f8f4e));
      wheels(7.1, 2.3, 0.45, [-2.6, 2.6]);
      lights(7.1, 2.3, 0.9);
      break;
    case 'hearse':
      g.box(-0.95, 0.32, -2.8, 0.95, 1.05, 2.6, C(0x16181b));
      g.box(-0.88, 1.05, -2.6, 0.88, 1.65, 1.0, C(0x22262b));
      wheels(5.4, 1.9, 0.34, [-1.8, 1.7]);
      lights(5.4, 1.9, 0.62);
      break;
    case 'ambulance':
      g.box(-1.05, 0.35, -2.8, 1.05, 2.5, 2.6, PAL.white);
      g.box(-1.07, 1.2, -2.8, 1.07, 1.5, 2.6, PAL.red);
      g.box(-1.0, 1.5, 1.9, 1.0, 2.3, 2.62, glass);
      beacon(2.5, 1.9, PAL.blue, PAL.red);
      wheels(5.4, 2.1, 0.38, [-1.8, 1.8]);
      lights(5.4, 2.1, 0.75);
      break;
    case 'firetruck':
      g.box(-1.25, 0.45, -4.2, 1.25, 2.9, 4.2, C(0xc0251d));
      g.box(-1.2, 1.8, 3.0, 1.2, 2.7, 4.22, glass);
      g.box(-0.4, 2.9, -4.4, 0.4, 3.3, 2.5, PAL.metal);
      beacon(2.9, 3.4, PAL.red, PAL.blue);
      wheels(8.4, 2.5, 0.48, [-2.8, -1.7, 2.8]);
      lights(8.4, 2.5, 0.9);
      break;
    case 'police':
      g.box(-0.9, 0.3, -2.25, 0.9, 1.0, 2.25, PAL.white);
      g.box(-0.92, 0.55, -2.25, 0.92, 0.8, 2.25, PAL.blue);
      g.box(-0.8, 1.0, -1.25, 0.8, 1.48, 0.95, glass, { roof: PAL.white });
      beacon(1.48, -0.2, PAL.blue, PAL.blue);
      wheels(4.5, 1.8, 0.33, [-1.4, 1.4]);
      lights(4.5, 1.8, 0.62);
      break;
    case 'moving':
      g.box(-1.15, 0.45, 2.0, 1.15, 2.5, 3.4, PAL.white);
      g.box(-1.1, 1.6, 2.8, 1.1, 2.4, 3.42, glass);
      g.box(-1.2, 0.6, -3.4, 1.2, 3.1, 1.9, C(0xf3f1ea));
      g.box(-1.22, 1.6, -3.4, 1.22, 2.0, 1.9, C(0xe0832f));
      wheels(6.8, 2.3, 0.42, [-2.4, 2.5]);
      lights(6.8, 2.3, 0.85);
      break;
    default:
      g.box(-0.9, 0.3, -2.1, 0.9, 1.4, 2.1, body);
  }
  return g.build();
}

export const VEHICLE_LEN = { car: 4.3, van: 5, truck: 7.8, bus: 11.8, garbage: 7.1, hearse: 5.4, ambulance: 5.4, firetruck: 8.4, police: 4.5, moving: 6.8 };
