// LA BIBLIOTHÈQUE SCIENTIFIQUE DE JEV POUR LE BAC À SABLE (v64 — « JEV doit apprendre les mouvements humains, la
// physique quantique, les mathématiques, la projection 3D… pour diriger le bac à sable »).
// Un module ES autonome, importé par son nom dans chaque page réalisée (`import * as jev from "jev"`) : le modèle n'a plus
// à réinventer (et à rater) les formules — il compose des fonctions JUSTES, vérifiées numériquement par
// tests/unit/sandboxKnowledge.test.ts (normalisations quantiques, projection aller-retour, intégrateurs…).
// Valeurs du mouvement humain : approximations lissées de courbes de manuel (marche normale), signalées comme telles.

import { JEVLIB_ANIM_SOURCE } from './jevlibAnim';

export const JEVLIB_VERSION = '1.1.0';

const JEVLIB_CORE = String.raw`
// jev ${'1.1.0'} — bibliothèque scientifique du bac à sable MASSAMBA (code maison).
export const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
export const deg = (r) => r / DEG;
export const rad = (d) => d * DEG;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const ease = {
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
};

// ── vecteurs et quaternions ([x, y, z], [x, y, z, w]) ──
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
export const quat = {
  fromAxisAngle: (ax, a) => { const n = v3.norm(ax), s = Math.sin(a / 2); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(a / 2)]; },
  mul: (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ],
  slerp: (a, b, t) => {
    let c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let bb = b;
    if (c < 0) { c = -c; bb = [-b[0], -b[1], -b[2], -b[3]]; }
    if (c > 0.9995) { const r = a.map((x, i) => x + (bb[i] - x) * t); const l = Math.hypot(...r); return r.map((x) => x / l); }
    const th = Math.acos(c), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return a.map((x, i) => wa * x + wb * bb[i]);
  },
  rotate: (q, v) => {
    const u = [q[0], q[1], q[2]], s = q[3];
    const t = v3.scale(v3.cross(u, v), 2);
    return v3.add(v3.add(v, v3.scale(t, s)), v3.cross(u, t));
  },
};

// ── courbes, bruit, intégration ──
export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return Array.isArray(p0) ? p0.map((_, i) => f(p0[i], p1[i], p2[i], p3[i])) : f(p0, p1, p2, p3);
}
export function bezier(points, t) {
  let p = points.map((q) => (Array.isArray(q) ? q.slice() : [q]));
  while (p.length > 1) p = p.slice(1).map((q, i) => q.map((x, k) => p[i][k] + (x - p[i][k]) * t));
  return Array.isArray(points[0]) ? p[0] : p[0][0];
}
/** Seeded gradient noise (Perlin, 2D / 3D) + fractal sum. */
export function makeNoise(seed = 1) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const P = new Uint8Array(512); for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const g3 = (h, x, y, z) => { const u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : z; return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); };
  const noise3 = (x, y, z = 0) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
    const L = (a, b, t) => a + t * (b - a);
    return L(L(L(g3(P[AA] & 15, x, y, z), g3(P[BA] & 15, x - 1, y, z), u), L(g3(P[AB] & 15, x, y - 1, z), g3(P[BB] & 15, x - 1, y - 1, z), u), v),
      L(L(g3(P[AA + 1] & 15, x, y, z - 1), g3(P[BA + 1] & 15, x - 1, y, z - 1), u), L(g3(P[AB + 1] & 15, x, y - 1, z - 1), g3(P[BB + 1] & 15, x - 1, y - 1, z - 1), u), v), w);
  };
  const fbm = (x, y, z = 0, oct = 5) => { let a = 0.5, f = 1, sum = 0; for (let i = 0; i < oct; i++) { sum += a * noise3(x * f, y * f, z * f); a *= 0.5; f *= 2; } return sum; };
  return { noise2: (x, y) => noise3(x, y, 0.5), noise3, fbm, random: rnd };
}
/** One Runge–Kutta 4 step for y' = f(t, y) (y: array). */
export function rk4(f, y, t, dt) {
  const add = (a, b, k) => a.map((x, i) => x + b[i] * k);
  const k1 = f(t, y), k2 = f(t + dt / 2, add(y, k1, dt / 2)), k3 = f(t + dt / 2, add(y, k2, dt / 2)), k4 = f(t + dt, add(y, k3, dt));
  return y.map((x, i) => x + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}
export function solveQuadratic(a, b, c) {
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b];
  const d = b * b - 4 * a * c;
  if (d < 0) return [];
  const q = -0.5 * (b + Math.sign(b || 1) * Math.sqrt(d));
  return d === 0 ? [-b / (2 * a)] : [q / a, c / q].sort((x, y) => x - y);
}
/** Fourier series: a0/2 + Σ a_k cos(kωt) + b_k sin(kωt). */
export const fourier = (a0, a, b, w, t) => a.reduce((s, ak, k) => s + ak * Math.cos((k + 1) * w * t) + (b[k] ?? 0) * Math.sin((k + 1) * w * t), a0 / 2);

// ── projection 3D (matrices 4×4 en colonnes, comme WebGL / three.js) ──
const m4mulv = (m, v) => [0, 1, 2, 3].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
export const proj = {
  perspective(fovYDeg, aspect, near, far) {
    const f = 1 / Math.tan(rad(fovYDeg) / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  },
  lookAt(eye, target, up = [0, 1, 0]) {
    const z = v3.norm(v3.sub(eye, target)), x = v3.norm(v3.cross(up, z)), y = v3.cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -v3.dot(x, eye), -v3.dot(y, eye), -v3.dot(z, eye), 1];
  },
  /** World point → pixel (y down) + depth in [0, 1] + visibility, for a camera {eye, target, up, fov, near, far, width, height}. */
  project(p, cam) {
    const view = proj.lookAt(cam.eye, cam.target, cam.up), P = proj.perspective(cam.fov, cam.width / cam.height, cam.near, cam.far);
    const c = m4mulv(P, m4mulv(view, [p[0], p[1], p[2], 1]));
    const ndc = [c[0] / c[3], c[1] / c[3], c[2] / c[3]];
    return { x: (ndc[0] * 0.5 + 0.5) * cam.width, y: (1 - (ndc[1] * 0.5 + 0.5)) * cam.height, depth: ndc[2] * 0.5 + 0.5, visible: c[3] > 0 && Math.abs(ndc[0]) <= 1 && Math.abs(ndc[1]) <= 1 && ndc[2] >= -1 && ndc[2] <= 1 };
  },
  /** Pixel → ray {origin, dir} in world space (picking, raycasting). */
  unproject(px, py, cam) {
    const z = v3.norm(v3.sub(cam.eye, cam.target)), x = v3.norm(v3.cross(cam.up ?? [0, 1, 0], z)), y = v3.cross(z, x);
    const th = Math.tan(rad(cam.fov) / 2), a = cam.width / cam.height;
    const nx = (px / cam.width) * 2 - 1, ny = 1 - (py / cam.height) * 2;
    const dir = v3.norm(v3.add(v3.add(v3.scale(x, nx * th * a), v3.scale(y, ny * th)), v3.scale(z, -1)));
    return { origin: cam.eye.slice(), dir };
  },
  /** Vertical field of view (degrees) of a lens on a sensor of given height (24 mm = full frame). */
  fovFromFocal: (focalMm, sensorMm = 24) => deg(2 * Math.atan(sensorMm / (2 * focalMm))),
  focalFromFov: (fovDeg, sensorMm = 24) => sensorMm / (2 * Math.tan(rad(fovDeg) / 2)),
};

// ── physique classique (SI) ──
export const physics = {
  g: 9.80665,
  projectile: (v0, angleDeg, t, g = 9.80665) => ({ x: v0 * Math.cos(rad(angleDeg)) * t, y: v0 * Math.sin(rad(angleDeg)) * t - 0.5 * g * t * t }),
  range: (v0, angleDeg, g = 9.80665) => (v0 * v0 * Math.sin(2 * rad(angleDeg))) / g,
  /** Mass–spring–damper, semi-implicit Euler (stable for animation): returns [x, v]. */
  springDamper: (x, v, k, c, m, dt, rest = 0) => { const a = (-k * (x - rest) - c * v) / m; const nv = v + a * dt; return [x + nv * dt, nv]; },
  /** Pendulum period with the large-amplitude series (θ0 in degrees). */
  pendulumPeriod: (L, theta0Deg = 0, g = 9.80665) => { const t = rad(theta0Deg); return 2 * Math.PI * Math.sqrt(L / g) * (1 + (t * t) / 16 + (11 * t ** 4) / 3072); },
  /** Position-based Verlet for ropes and cloth: points {x,y,z,px,py,pz,pinned}, sticks [i, j, rest]. */
  verlet(points, sticks, dt, gravity = [0, -9.80665, 0], iterations = 8, damping = 0.995) {
    for (const p of points) {
      if (p.pinned) continue;
      const vx = (p.x - p.px) * damping, vy = (p.y - p.py) * damping, vz = (p.z - p.pz) * damping;
      p.px = p.x; p.py = p.y; p.pz = p.z;
      p.x += vx + gravity[0] * dt * dt; p.y += vy + gravity[1] * dt * dt; p.z += vz + gravity[2] * dt * dt;
    }
    for (let it = 0; it < iterations; it++)
      for (const [i, j, rest] of sticks) {
        const a = points[i], b = points[j], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1e-9, k = (d - rest) / d / 2;
        if (!a.pinned) { a.x += dx * k; a.y += dy * k; a.z += dz * k; }
        if (!b.pinned) { b.x -= dx * k; b.y -= dy * k; b.z -= dz * k; }
      }
    return points;
  },
  /** 1D elastic collision with restitution e (1 = elastic). */
  collide1D: (m1, v1, m2, v2, e = 1) => [(m1 * v1 + m2 * v2 + m2 * e * (v2 - v1)) / (m1 + m2), (m1 * v1 + m2 * v2 + m1 * e * (v1 - v2)) / (m1 + m2)],
  /** Kepler orbit: position at mean anomaly M (rad) for semi-major axis a and eccentricity e (Newton on E). */
  keplerPosition(a, e, M) { let E = M; for (let i = 0; i < 12; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); return [a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E)]; },
  buoyancy: (rhoFluid, volume, g = 9.80665) => rhoFluid * volume * g,
  drag: (rho, v, cd, area) => 0.5 * rho * v * v * cd * area,
};

// ── physique quantique (unités SI ; orbitales en unités de a0) ──
const fact = (n) => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };
const laguerre = (n, a, x) => { if (n === 0) return 1; let l0 = 1, l1 = 1 + a - x; for (let k = 1; k < n; k++) { const l2 = ((2 * k + 1 + a - x) * l1 - (k + a) * l0) / (k + 1); l0 = l1; l1 = l2; } return l1; };
const hermite = (n, x) => { if (n === 0) return 1; let h0 = 1, h1 = 2 * x; for (let k = 1; k < n; k++) { const h2 = 2 * x * h1 - 2 * k * h0; h0 = h1; h1 = h2; } return h1; };
export const quantum = {
  h: 6.62607015e-34, hbar: 1.054571817e-34, me: 9.1093837015e-31, eV: 1.602176634e-19, a0: 5.29177210903e-11, c: 299792458,
  /** Particle in a box of width L: E_n (J) and ψ_n(x). */
  boxEnergy: (n, L, m = 9.1093837015e-31) => (n * n * 6.62607015e-34 ** 2) / (8 * m * L * L),
  boxPsi: (n, x, L) => (x < 0 || x > L ? 0 : Math.sqrt(2 / L) * Math.sin((n * Math.PI * x) / L)),
  hermite,
  /** Harmonic oscillator, dimensionless ξ: ψ_n(ξ) = H_n(ξ) e^(−ξ²/2) / √(2ⁿ n! √π). */
  oscillatorPsi: (n, xi) => (hermite(n, xi) * Math.exp((-xi * xi) / 2)) / Math.sqrt(2 ** n * fact(n) * Math.sqrt(Math.PI)),
  /** Hydrogen energy level (eV). */
  hydrogenEnergy: (n) => -13.605693122994 / (n * n),
  /** Normalised radial function R_nl(r), r in units of a0. */
  hydrogenRadial(n, l, r) {
    const rho = (2 * r) / n;
    const norm = Math.sqrt((2 / n) ** 3 * (fact(n - l - 1) / (2 * n * fact(n + l))));
    return norm * Math.exp(-rho / 2) * rho ** l * laguerre(n - l - 1, 2 * l + 1, rho);
  },
  /** Real spherical harmonics Y_lm (l ≤ 3), normalised on the sphere. */
  realY(l, m, theta, phi) {
    const x = Math.sin(theta) * Math.cos(phi), y = Math.sin(theta) * Math.sin(phi), z = Math.cos(theta), pi = Math.PI;
    const T = {
      '0,0': () => 0.5 * Math.sqrt(1 / pi),
      '1,-1': () => Math.sqrt(3 / (4 * pi)) * y, '1,0': () => Math.sqrt(3 / (4 * pi)) * z, '1,1': () => Math.sqrt(3 / (4 * pi)) * x,
      '2,-2': () => 0.5 * Math.sqrt(15 / pi) * x * y, '2,-1': () => 0.5 * Math.sqrt(15 / pi) * y * z, '2,0': () => 0.25 * Math.sqrt(5 / pi) * (3 * z * z - 1),
      '2,1': () => 0.5 * Math.sqrt(15 / pi) * x * z, '2,2': () => 0.25 * Math.sqrt(15 / pi) * (x * x - y * y),
      '3,-3': () => 0.25 * Math.sqrt(35 / (2 * pi)) * y * (3 * x * x - y * y), '3,-2': () => 0.5 * Math.sqrt(105 / pi) * x * y * z,
      '3,-1': () => 0.25 * Math.sqrt(21 / (2 * pi)) * y * (5 * z * z - 1), '3,0': () => 0.25 * Math.sqrt(7 / pi) * (5 * z ** 3 - 3 * z),
      '3,1': () => 0.25 * Math.sqrt(21 / (2 * pi)) * x * (5 * z * z - 1), '3,2': () => 0.25 * Math.sqrt(105 / pi) * z * (x * x - y * y),
      '3,3': () => 0.25 * Math.sqrt(35 / (2 * pi)) * x * (x * x - 3 * y * y),
    };
    const f = T[l + ',' + m];
    if (!f) throw new Error('realY : l ≤ 3 et |m| ≤ l');
    return f();
  },
  /** |ψ_nlm|² at (x, y, z) in units of a0 (real orbitals). */
  hydrogenDensity(n, l, m, x, y, z) {
    const r = Math.hypot(x, y, z) || 1e-12, theta = Math.acos(z / r), phi = Math.atan2(y, x);
    const v = quantum.hydrogenRadial(n, l, r) * quantum.realY(l, m, theta, phi);
    return v * v;
  },
  /** Point cloud of an orbital (rejection sampling), for three.js Points: returns Float32Array [x,y,z,…] in a0. */
  sampleOrbital(n, l, m, count = 20000, seed = 7) {
    const rnd = makeNoise(seed).random, R = 4 * n * n, out = new Float32Array(count * 3);
    let max = 0;
    for (let i = 0; i < 4000; i++) { const p = [(rnd() * 2 - 1) * R, (rnd() * 2 - 1) * R, (rnd() * 2 - 1) * R]; max = Math.max(max, quantum.hydrogenDensity(n, l, m, ...p)); }
    let k = 0, guard = 0;
    while (k < count && guard++ < count * 400) {
      const x = (rnd() * 2 - 1) * R, y = (rnd() * 2 - 1) * R, z = (rnd() * 2 - 1) * R;
      if (rnd() * max * 1.2 < quantum.hydrogenDensity(n, l, m, x, y, z)) { out[k * 3] = x; out[k * 3 + 1] = y; out[k * 3 + 2] = z; k++; }
    }
    return out.subarray(0, k * 3);
  },
  /** Young's double slit (Fraunhofer): relative intensity at angle θ (rad), wavelength λ, slit spacing d, slit width a. */
  doubleSlit(theta, lambda, d, a) {
    const s = Math.sin(theta), b = (Math.PI * a * s) / lambda, sinc = b === 0 ? 1 : Math.sin(b) / b;
    return Math.cos((Math.PI * d * s) / lambda) ** 2 * sinc * sinc;
  },
  /** Transmission through a rectangular barrier (E < V0), energies in eV, width in metres. */
  tunneling(E, V0, width, m = 9.1093837015e-31) {
    const e = 1.602176634e-19, hb = 1.054571817e-34;
    const k = Math.sqrt(2 * m * (V0 - E) * e) / hb, sh = Math.sinh(k * width);
    return 1 / (1 + (V0 * V0 * sh * sh) / (4 * E * (V0 - E)));
  },
  /** Free Gaussian wave packet |ψ(x,t)|² (natural units ħ = m = 1). */
  wavePacket(x, t, sigma0 = 1, k0 = 2, x0 = 0) {
    const s2 = sigma0 * sigma0 * (1 + (t * t) / (4 * sigma0 ** 4)), xc = x0 + k0 * t;
    return Math.exp(-((x - xc) ** 2) / (2 * s2)) / Math.sqrt(2 * Math.PI * s2);
  },
  /** Qubit state on the Bloch sphere: θ, φ → [x, y, z]. */
  bloch: (theta, phi) => [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)],
};

// ── mouvement humain (approximations de manuel, marche normale ; angles en degrés, flexion > 0) ──
const gauss = (p, mu, s) => { let d = Math.abs(p - mu); d = Math.min(d, 1 - d); return Math.exp(-(d * d) / (2 * s * s)); };
export const human = {
  /** Segment lengths for a standing height H (m): proportions of Drillis & Contini (1966) as quoted by Winter — approximate. */
  segments: (H) => ({ head: 0.130 * H, upperArm: 0.186 * H, forearm: 0.146 * H, hand: 0.108 * H, thigh: 0.245 * H, shank: 0.246 * H, footHeight: 0.039 * H, footLength: 0.152 * H, shoulderWidth: 0.259 * H, hipWidth: 0.191 * H, shoulderHeight: 0.818 * H, hipHeight: 0.530 * H, kneeHeight: 0.285 * H }),
  /** Typical stride length (m) for a speed (m/s) and height — approximate relation (≈ 1.4 m at 1.4 m/s for 1.75 m). */
  strideLength: (speed, H = 1.75) => H * (0.6 + 0.15 * speed),
  /** Sagittal pose over the gait cycle (phase 0 = heel strike, ≈ 60 % stance / 40 % swing) — smoothed textbook curves. */
  gait(phase, speed = 1.4) {
    const p = ((phase % 1) + 1) % 1, k = clamp(speed / 1.4, 0.5, 1.6);
    const hip = 10 + 20 * Math.cos(TAU * p) * k;
    const knee = 3 + 15 * k * gauss(p, 0.15, 0.06) + 57 * k * gauss(p, 0.72, 0.1);
    const ankle = -5 * gauss(p, 0.07, 0.04) + 10 * gauss(p, 0.45, 0.1) - 20 * k * gauss(p, 0.63, 0.06) + 2 * gauss(p, 0.85, 0.08);
    return {
      hip, knee, ankle,
      pelvisY: -0.02 * k * Math.cos(2 * TAU * p),
      pelvisSway: 0.02 * Math.sin(TAU * p),
      armSwing: -15 * k * Math.cos(TAU * p),
      stance: p < 0.6,
    };
  },
  /** Normal ranges of motion (degrees, adult) — approximate clinical values. */
  limits: {
    neck: { flex: 45, ext: 45, rot: 70 }, shoulder: { flex: 180, ext: 60, abd: 180 }, elbow: { flex: 150, ext: 0 },
    wrist: { flex: 80, ext: 70 }, hip: { flex: 120, ext: 30, abd: 45 }, knee: { flex: 135, ext: 0 }, ankle: { dorsi: 20, plantar: 50 },
  },
  /** Breathing (0..1, rest ≈ 12–20 / min) and blinking (1 = closed, ≈ 15 / min, 120 ms). */
  breath: (t, perMin = 14) => 0.5 - 0.5 * Math.cos((TAU * t * perMin) / 60),
  blink: (t, perMin = 15, seed = 3) => { const period = 60 / perMin, jitter = (Math.sin(seed * 12.9898 + Math.floor(t / period) * 78.233) * 43758.5453) % 1; const u = (t % period) - Math.abs(jitter) * period * 0.5; return u >= 0 && u < 0.12 ? Math.sin((Math.PI * u) / 0.12) : 0; },
};
`;
/** The module served to the pages: core science + animation, cinema and the character-animation procedure (v1.1). */
export const JEVLIB_SOURCE = JEVLIB_CORE + JEVLIB_ANIM_SOURCE;

/** What the model is told the library offers (kept short: names and signatures). */
export const JEVLIB_API = [
  'import * as jev from "jev" — bibliothèque scientifique vérifiée (code maison, aucune dépendance) :',
  '• jev.human.gait(phase 0..1, vitesse m/s) → {hip, knee, ankle (°), pelvisY, pelvisSway (m), armSwing (°), stance} ; jev.human.segments(taille m) ; jev.human.limits (amplitudes articulaires) ; jev.human.strideLength ; jev.human.breath(t) ; jev.human.blink(t)',
  '• jev.physics : projectile, range, springDamper(x,v,k,c,m,dt), pendulumPeriod, verlet(points, sticks, dt) (cordes, tissus), collide1D, keplerPosition(a,e,M), buoyancy, drag ; jev.physics.g',
  '• jev.quantum : boxEnergy/boxPsi (puits infini), oscillatorPsi(n, ξ), hydrogenRadial(n,l,r), realY(l,m,θ,φ), hydrogenDensity(n,l,m,x,y,z), sampleOrbital(n,l,m,count) → Float32Array pour THREE.Points, doubleSlit(θ,λ,d,a), tunneling(E,V0,largeur), wavePacket(x,t), bloch(θ,φ), hydrogenEnergy(n) ; constantes h, hbar, me, eV, a0, c',
  '• jev.proj : perspective, lookAt, project(point, {eye,target,up,fov,near,far,width,height}) → {x,y,depth,visible}, unproject(px,py,cam) → rayon, fovFromFocal(mm), focalFromFov(°)',
  '• jev.v3, jev.quat (fromAxisAngle, mul, slerp, rotate), jev.catmullRom, jev.bezier, jev.makeNoise(seed) → {noise2, noise3, fbm}, jev.rk4, jev.solveQuadratic, jev.fourier, jev.ease.*, jev.clamp, jev.lerp, jev.smoothstep, jev.rad, jev.deg',
  '• jev.motion (mouvements humains et non humains) : flap(t,hz) / glide, wingHz{…}, swim(x,t,vitesse) (Strouhal), slither, sway (vent), flag(u,v,t) (tissu), flicker (flamme), bob (flotter), breathe, wag, headBob (poule), leg(allure "pas|trot|amble|galop", patte "LF|RF|LH|RH", phase) → {stance, lift, reach}, hop(t,h), find(texte) → recettes',
  '• jev.speech (parole FR) : plan(texte, {start, rate}) → {syllables, visemes (bouches A–H, X), accents (fin de groupe), start, end} ; mouthAt(plan, t) → {open, wide, round, shape} (coarticulation, bouche en avance) ; blinks(plan) ; lidAt(blinks, t)',
  '• jev.music : beat(t, bpm) → {index, phase, bar, downbeat}, pulse(t, bpm), dance(t, bpm, "groove|afro|coupe-decale") → {hipY, sway, shoulders, chest, armL, armR, head}, detectBpm(Float32Array, sampleRate)',
  '• jev.smooth : damp(x, cible, demi-vie, dt), spring(x, v, cible, demi-vie, dt) → [x, v], oneEuro() → filtre(x, t), deadBlend(x0, v0, cible, t), inertialize(x0, v0, durée, t)',
  '• jev.qa (contrôle du mouvement) : jitter(série, dt), footSkate(pied[[x,y,z]], dt), penetration(points), kinematicBeats(vitesses, dt), beatAlignment(mvt, musique), lipSync(bouche[], énergie[], fps) → {offset, verdict}, frameJumps(écarts entre images, {fps, cuts, allowed}) → coupes, changements de dessin, sauts imprévus, mouvements rapides, limits(pose)',
  '• jev.cine : sizes (TGP GP PR PA PM PE PG), lenses, aspects, letterbox(w,h,ratio), frame(sujet{pos,height,facing}, taille, {angle, mm}) → {eye, target, fov}, twoShot(A,B), overShoulder(A,B), move("dolly-in|dolly-out|truck|crane|drone|pan|tilt|orbit|vertigo", plan, u), shake(t), dof(mm, N, mise au point m), miniatureRisk, bokeh(), grades{…} + gradeShader(nom) pour ShaderPass, thirds(x,y,w,h), coverage(répliques, {maxSize}) → découpage (maxSize : plan le plus serré permis par la résolution du dessin), check(plans) → faux raccords (180°, 30°)',
  '• jev.character : procedure (14 étapes), plan(répliques[{who,text,emotion}]) → {lines, tracks, shots, issues}, pose(plan, qui, t) → {mouth, lid, gaze, headGaze, nod, gesture, breath, speaking}',
].join('\n');

/** The module as a data: URL for the sandbox import map (the page's CSP allows data: scripts). */
export function jevlibUrl(): string {
  const bytes = new TextEncoder().encode(JEVLIB_SOURCE);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const b64 = btoa(bin);
  return `data:text/javascript;base64,${b64}`;
}
