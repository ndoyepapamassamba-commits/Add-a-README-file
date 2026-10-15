// LE MOTEUR PROCÉDURAL DE SCÈNE (v64) — exécuté DANS la page du bac à sable : sceneHtml() sérialise cette fonction telle
// quelle (`sceneMain.toString()`), elle ne doit donc utiliser QUE ses paramètres (THREE, OrbitControls, S) et le
// navigateur : aucune variable ni aide du module. TypeScript la vérifie comme le reste de l'app.
// Terrain (colline, vallée, montagnes, rivière, lac) maillé plus finement au centre ; tout ce qui est nombreux est
// instancié (maisons, toits, arbres, épis de blé, merlons, lanternes, étals, habitants, oiseaux) ; le vent est calculé
// sur la carte graphique (blé qui ondule, arbres, bannières) ; lumière de cinéma (soleil posé sur la crête calculée,
// lumière d'appoint dorée, ciel dégradé, brume, reflets de l'eau). Même graine → même scène.
import type * as T from 'three';
import type { OrbitControls as OC } from 'three/examples/jsm/controls/OrbitControls.js';
import type { EffectComposer as EC } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { RenderPass as RP } from 'three/examples/jsm/postprocessing/RenderPass.js';
import type { UnrealBloomPass as UB } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { OutputPass as OP } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { ShaderPass as SPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { SceneSpec } from './sceneKit';

/** The post-processing modules (three/addons), passed by the page when they load. */
export interface ScenePost {
  EffectComposer: typeof EC;
  RenderPass: typeof RP;
  UnrealBloomPass: typeof UB;
  OutputPass: typeof OP;
  ShaderPass: typeof SPass;
}

export function sceneMain(THREE: typeof T, OrbitControls: typeof OC, S: SceneSpec, PP?: ScenePost): void {
  const tStart = performance.now();
  const has = (c: string) => (S.comps as string[]).includes(c);
  const boost = (c: string) => (S.boost as Record<string, number | undefined>)[c] ?? 1;
  const made = new Set<string>();
  // ── hasard reproductible et bruit ──────────────────────────────────────────────────────────────────────────────
  let seed = S.seed >>> 0 || 1;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rr = (a: number, b: number) => a + (b - a) * rnd();
  const hash = (x: number, y: number) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(S.seed | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u0 = x - xi;
    const v0 = y - yi;
    const u = u0 * u0 * (3 - 2 * u0);
    const v = v0 * v0 * (3 - 2 * v0);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x: number, y: number, o = 4) => {
    let s = 0;
    let a = 0.5;
    let f = 1;
    let n = 0;
    for (let i = 0; i < o; i++) {
      s += a * noise(x * f + i * 17.1, y * f - i * 9.7);
      n += a;
      a *= 0.5;
      f *= 2.03;
    }
    return s / n;
  };
  const ridged = (x: number, y: number) => {
    let s = 0;
    let a = 0.55;
    let f = 1;
    for (let i = 0; i < 5; i++) {
      const n = 1 - Math.abs(noise(x * f + 31.7 * i, y * f) * 2 - 1);
      s += a * n * n;
      a *= 0.5;
      f *= 2.1;
    }
    return s;
  };
  const sstep = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  // ── plan d'ensemble : axes de la caméra (F vers la caméra, R à droite de l'image) ────────────────────────────────
  const F = { x: 0.56, z: 0.83 };
  const R = { x: 0.83, z: -0.56 };
  const W = (a: number, b: number) => ({ x: a * F.x + b * R.x, z: a * F.z + b * R.z });
  const AB = (x: number, z: number) => ({ a: x * F.x + z * F.z, b: x * R.x + z * R.z });
  const FOREST = S.theme === 'forest';
  const MARS = S.theme === 'mars';
  const city = has('houses') || has('castle') || has('walls');
  const hilly = has('hill') || has('castle') || has('walls');
  const HILL = hilly ? 46 * Math.min(1.35, Math.sqrt(boost('hill'))) : city ? 4 : 0;
  // La cité est dimensionnée par le nombre de maisons demandé (« immense » = plus grande enceinte).
  const RW = city ? Math.max(95, Math.min(175, 60 + Math.sqrt(S.counts.houses) * 4.4)) : 112;
  const K = RW / 112;
  const WL = 0.8; // niveau de l'eau
  const SNOW = S.season === 'winter';

  type P2 = { x: number; z: number };
  /** Catmull-Rom through points, sampled every `step` units. */
  const spline = (pts: P2[], step: number): P2[] => {
    const out: P2[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
      const len = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      const n = Math.max(2, Math.ceil(len / step));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const t2 = t * t;
        const t3 = t2 * t;
        const cr = (a: number, b: number, c: number, d: number) =>
          0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push({ x: cr(p0.x, p1.x, p2.x, p3.x), z: cr(p0.z, p1.z, p2.z, p3.z) });
      }
    }
    out.push(pts[pts.length - 1]!);
    return out;
  };
  const distTo = (pts: P2[], x: number, z: number) => {
    let best = 1e9;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
      const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
      if (d < best) best = d;
    }
    return best;
  };
  const toW = (list: [number, number][]) => list.map(([a, b]) => W(a * K, b * K));
  const Wk = (a: number, b: number) => W(a * K, b * K);
  const toW0 = (fa: number, list: [number, number][]) => list.map(([a, b]) => W(a * K * fa, b * K));

  const river = FOREST && has('streams')
    ? spline(toW0(1, [[-700, 60], [-420, -40], [-200, 30], [-60, -20], [80, 40], [230, 10], [420, -50]]), 5)
    : has('river')
    ? spline(
        toW0(0.85, [
          [-420, 980],
          [-140, 660],
          [120, 480],
          [300, 270],
          [355, 50],
          [325, -170],
          [190, -330],
          [-30, -420],
          [-250, -470],
        ]),
        6,
      )
    : [];
  const RIVW = (FOREST ? 4.5 : 12) * Math.min(1.8, Math.sqrt(boost(FOREST ? 'streams' : 'river')));
  const LAKE = has('lake') ? { ...Wk(has('river') ? -300 : 260, has('river') ? -490 : -260), r: 150 * K * Math.min(1.6, Math.sqrt(boost('lake'))) } : null;
  // Routes : de chaque porte vers la campagne (la principale passe le pont, vers la caméra).
  const roadsAB: [number, number][][] = city
    ? [
        [
          [116, 0],
          [152, 8],
          [230, 30],
          [330, 52],
          [430, 80],
          [600, 150],
          [900, 230],
        ],
        [
          [0, -116],
          [-40, -170],
          [-90, -270],
          [-150, -350],
          [-215, -390],
        ],
        [
          [0, 116],
          [-30, 190],
          [-110, 300],
          [-230, 430],
          [-420, 560],
        ],
      ]
    : [];
  const roads = roadsAB.map((r) => spline(toW(r), 4));

  const HALF = 2000;
  const MT0 = Math.max(860, RW * 7.2);
  // Grilles de distance (routes, rivière) : une requête = une lecture, au lieu de parcourir des centaines de segments.
  const GC = 4;
  const GN = Math.ceil((HALF * 2) / GC);
  const distGrid = (lines: P2[][], radius: number) => {
    const g = new Float32Array(GN * GN).fill(1e9);
    const rc = Math.ceil(radius / GC);
    for (const pts of lines)
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const ci = Math.floor((p.x + HALF) / GC);
        const cj = Math.floor((p.z + HALF) / GC);
        for (let dj = -rc; dj <= rc; dj++)
          for (let di = -rc; di <= rc; di++) {
            const ii = ci + di;
            const jj = cj + dj;
            if (ii < 0 || jj < 0 || ii >= GN || jj >= GN) continue;
            const d = Math.hypot((ii + 0.5) * GC - HALF - p.x, (jj + 0.5) * GC - HALF - p.z);
            if (d < g[jj * GN + ii]!) g[jj * GN + ii] = d;
          }
      }
    return (x: number, z: number) => {
      const ii = Math.floor((x + HALF) / GC);
      const jj = Math.floor((z + HALF) / GC);
      return ii < 0 || jj < 0 || ii >= GN || jj >= GN ? 1e9 : g[jj * GN + ii]!;
    };
  };
  const waterD = river.length ? distGrid([river], 60) : () => 1e9;

  const CRATERS: { x: number; z: number; r: number; depth: number }[] = [];
  if (MARS)
    for (let k = 0; k < 26; k++) {
      const r = rr(220, 900);
      const th = rnd() * Math.PI * 2;
      CRATERS.push({ x: Math.cos(th) * r, z: Math.sin(th) * r, r: rr(14, 70), depth: rr(4, 14) });
    }
  // ── relief ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const H = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    const { a } = AB(x, z);
    let h = 2.2 + 3.2 * fbm(x * 0.0035 + 3, z * 0.0035 - 2, 4);
    if (HILL) {
      const top = HILL + 9 * sstep(40 * K, -90 * K, a); // la cité monte vers le château
      h += top * sstep(RW * 2.25, RW * 0.8, r) + sstep(RW * 2.25, RW * 1.1, r) * (1 - sstep(RW * 1.1, RW * 0.8, r)) * 6 * (fbm(x * 0.02, z * 0.02) - 0.5);
    }
    {
      // les montagnes ferment l'horizon, loin derrière la vallée (la brume les bleuit)
      const m = sstep(MT0, MT0 + 380, r) * (1 - 0.5 * sstep(HALF - 260, HALF - 20, r));
      if (m > 0) h += m * (90 + 270 * ridged(x * 0.0017 + 5, z * 0.0017 - 7) * Math.min(1.5, Math.sqrt(boost('mountains'))));
    }
    if (FOREST) {
      h += 7 * fbm(x * 0.012 + 3, z * 0.012, 3) + 16 * sstep(-50, -66, a); // sous-bois vallonné, une marche rocheuse : les cascades
      if (river.length) h -= 2.4 * sstep(RIVW * 2.2, RIVW * 0.6, waterD(x, z));
      return h;
    }
    if (MARS) {
      for (const c of CRATERS) {
        const d = Math.hypot(x - c.x, z - c.z) / c.r;
        if (d < 1.35) h += d < 1 ? -c.depth * (1 - d * d) + c.depth * 0.35 * d ** 6 : c.depth * 0.35 * Math.exp(-((d - 1) ** 2) * 18);
      }
      return h;
    }
    if (river.length && r > RW * 1.7) {
      const d = waterD(x, z);
      if (d < RIVW * 3) h = lerp(h, WL - 2.6, sstep(RIVW * 2.2, RIVW * 0.7, d));
    }
    if (LAKE) {
      const d = Math.hypot(x - LAKE.x, z - LAKE.z) + 18 * (fbm(x * 0.01, z * 0.01) - 0.5);
      h = lerp(h, WL - 3.5, sstep(LAKE.r + 45, LAKE.r - 15, d));
    }
    return h;
  };

  // ── maillage du terrain (plus fin au centre) et hauteur exacte du maillage ─────────────────────────────────────
  const SEG = 340;
  const A0 = 0.17;
  const warp = (u: number) => HALF * (A0 * u + (1 - A0) * u * u * u);
  const unwarp = (x: number) => {
    let u = Math.max(-1, Math.min(1, x / HALF));
    for (let k = 0; k < 7; k++) {
      const f = A0 * u + (1 - A0) * u * u * u - x / HALF;
      u -= f / (A0 + 3 * (1 - A0) * u * u);
    }
    return Math.max(-1, Math.min(1, u));
  };
  const N = SEG + 1;
  const GX = new Float32Array(N);
  for (let i = 0; i < N; i++) GX[i] = warp((i / SEG) * 2 - 1);
  const HG = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) HG[j * N + i] = H(GX[i]!, GX[j]!);
  const cellOf = (x: number) => {
    const fi = ((unwarp(x) + 1) / 2) * SEG;
    const i = Math.max(0, Math.min(SEG - 1, Math.floor(fi)));
    const f = Math.max(0, Math.min(1, (x - GX[i]!) / (GX[i + 1]! - GX[i]!)));
    return [i, f] as const;
  };
  /** The height of the MESH at (x, z): everything placed on the ground touches it exactly. */
  const Hm = (x: number, z: number) => {
    const [i, fx] = cellOf(x);
    const [j, fz] = cellOf(z);
    const h00 = HG[j * N + i]!;
    const h10 = HG[j * N + i + 1]!;
    const h01 = HG[(j + 1) * N + i]!;
    const h11 = HG[(j + 1) * N + i + 1]!;
    return fx + fz <= 1 ? h00 + (h10 - h00) * fx + (h01 - h00) * fz : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  };
  const slopeAt = (x: number, z: number) => Math.hypot(Hm(x + 3, z) - Hm(x - 3, z), Hm(x, z + 3) - Hm(x, z - 3)) / 6;
  const Htop = Hm(0, 0);

  // ── occupation du sol : champs, forêts, routes, eau ──────────────────────────────────────────────────────────────
  let roadD: (x: number, z: number) => number = () => 1e9;
  const nearRoad = (x: number, z: number, w: number) => roadD(x, z) < w;
  const nearWater = (x: number, z: number, w: number) =>
    (river.length > 0 && waterD(x, z) < RIVW * 1.6 + w) || (LAKE !== null && Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + w);
  // Champs en lanières (openfield médiéval) : quartiers de 240 m, chacun avec sa propre orientation.
  const ZONE = 240;
  const PL = 64; // longueur d'une lanière
  const PW = 15; // largeur d'une lanière
  const zoneAngle = (zi: number, zj: number) => (hash(zi * 31 + 7, zj * 17 - 3) - 0.5) * 1.3;
  const toCell = (x: number, z: number) => {
    const zi = Math.floor(x / ZONE);
    const zj = Math.floor(z / ZONE);
    const a = zoneAngle(zi, zj);
    const c = Math.cos(a);
    const s2 = Math.sin(a);
    return { zi, zj, ca: Math.floor((x * c + z * s2) / PL), cb: Math.floor((-x * s2 + z * c) / PW), a };
  };
  const cellCorner = (a: number, ca: number, cb: number) => {
    const u = ca * PL;
    const v = cb * PW;
    return { x: u * Math.cos(a) - v * Math.sin(a), z: u * Math.sin(a) + v * Math.cos(a) };
  };
  const parcelKind = (x: number, z: number): 'wheat' | 'green' | 'plough' | 'meadow' | null => {
    if (!has('fields')) return null;
    const c = toCell(x, z);
    return cellKind(c.zi, c.zj, c.ca, c.cb);
  };
  /** One parcel = one strip of its quarter: its crop is decided at its centre (map, colours and wheat agree). */
  const cellKind = (zi: number, zj: number, ca: number, cb: number): 'wheat' | 'green' | 'plough' | 'meadow' | null => {
    const a = zoneAngle(zi, zj);
    const m = cellCorner(a, ca + 0.5, cb + 0.5);
    const x = m.x;
    const z = m.z;
    if (Math.floor(x / ZONE) !== zi || Math.floor(z / ZONE) !== zj) return null;
    const r = Math.hypot(x, z);
    if (r < RW * 1.3 || r > Math.min(MT0 - 120, RW * 5.6 * Math.min(1.25, Math.sqrt(boost('fields'))))) return null;
    if (fbm(x * 0.004 - 11, z * 0.004 + 4) > 0.62) return null; // bosquets entre les champs
    if (river.length && waterD(x, z) < RIVW * 2.4) return null;
    // les lanières voisines se ressemblent (même exploitant) : le type change par groupes de 3 à 5
    const grp = Math.floor(cb / (3 + (Math.abs(ca) % 3)));
    const h = hash(zi * 1013 + ca * 7 + 3, zj * 917 + grp * 13 - 5);
    return h < 0.62 ? 'wheat' : h < 0.78 ? 'green' : h < 0.84 ? 'plough' : 'meadow';
  };
  const forestAt = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    if (r < RW * 2 || Hm(x, z) > 330) return 0;
    let d = fbm(x * 0.0045 + 7, z * 0.0045 - 3, 4) - 0.38 + 0.35 * sstep(MT0 - 300, MT0 + 60, r);
    if (parcelKind(x, z)) d -= 0.6;
    return Math.max(0, Math.min(1, d * 2.4));
  };

  // ── rendu ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  let PR = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(PR);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const C = (h: string) => new THREE.Color(h);

  const LOOK = {
    sunset: { zen: '#24336f', hor: '#ffb172', glow: '#ffd08a', sun: '#ffe2a8', key: '#ffb15e', keyI: 3.2, fill: '#ffb57a', fillI: 1.25, hemiS: '#7f95d8', hemiG: '#5a4434', hemiI: 0.75, fog: '#d99f8c', exp: 1.0, win: 0.75, lamp: 1.0 },
    dawn: { zen: '#3d5ea8', hor: '#ffc7a2', glow: '#ffe1c0', sun: '#fff0d8', key: '#ffd0a0', keyI: 2.6, fill: '#c9a6d6', fillI: 0.6, hemiS: '#a9bbea', hemiG: '#5a4a3e', hemiI: 0.6, fog: '#e9c2b4', exp: 1.0, win: 0.35, lamp: 0.5 },
    day: { zen: '#3f7fd6', hor: '#cfe2f4', glow: '#ffffff', sun: '#fffbe8', key: '#fff3dc', keyI: 3.0, fill: '#d6e4ff', fillI: 0.45, hemiS: '#cfe0ff', hemiG: '#6b5a40', hemiI: 0.8, fog: '#c8d9ea', exp: 1.0, win: 0, lamp: 0 },
    night: { zen: '#050a1c', hor: '#1d2a4e', glow: '#6d82c8', sun: '#dfe8ff', key: '#9db2ff', keyI: 0.55, fill: '#41507e', fillI: 0.25, hemiS: '#2c3a66', hemiG: '#100c0a', hemiI: 0.35, fog: '#1a2440', exp: 1.15, win: 1.5, lamp: 1.8 },
  }[S.time];
  if (S.mood === 'dark') Object.assign(LOOK, { zen: '#1d2333', hor: '#7b6a66', fog: '#59545a', keyI: LOOK.keyI * 0.6 });
  // Mars : ciel ocre poussiéreux (coucher de soleil bleuté) ; forêt : aube dorée et brume verte
  if (MARS)
    Object.assign(
      LOOK,
      S.time === 'sunset'
        ? { zen: '#2c2434', hor: '#7d98c4', glow: '#b6d0ff', sun: '#eef4ff', key: '#c9d8ff', keyI: 1.6, fill: '#c27a52', fillI: 0.5, hemiS: '#8a7a90', hemiG: '#4a2418', hemiI: 0.5, fog: '#8a6a6a' }
        : { zen: '#8c5a40', hor: '#e8b48a', glow: '#ffe6c4', sun: '#fff6e6', key: '#ffe0bc', keyI: 2.7, fill: '#d68a5a', fillI: 0.6, hemiS: '#e0a47c', hemiG: '#5a2e1e', hemiI: 0.75, fog: '#c88c66', exp: 1.0, win: 0.4, lamp: 0.2 },
    );
  if (FOREST) Object.assign(LOOK, { zen: '#5b7fb8', hor: '#ffd8a8', glow: '#fff0c8', sun: '#fff4dc', key: '#ffd99e', keyI: 3.0, fill: '#a8c8a0', fillI: 0.45, hemiS: '#b8d8ff', hemiG: '#24361e', hemiI: 0.6, fog: '#9fb39a', exp: 1.05, win: 0, lamp: 0 });
  renderer.toneMappingExposure = LOOK.exp;

  // Caméra (cadrage de cinéma) — la position décide où se pose le soleil.
  const camera = new THREE.PerspectiveCamera(34, window.innerWidth / Math.max(1, window.innerHeight), 1, 16000);
  const centre = city ? { x: 0, z: 0 } : LAKE ? { x: LAKE.x * 0.6, z: LAKE.z * 0.6 } : { x: 0, z: 0 };
  // distance et hauteur en rayons de cité ; « pitch » = inclinaison vers le bas (degrés) : le ciel garde un tiers du cadre
  const CAM = {
    panorama: { d: 5.6, h: 0.62, pitch: 4 },
    aerial: { d: 3.4, h: 2.9, pitch: 30 },
    ground: { d: 3.0, h: 0.1, pitch: -4 },
    flythrough: { d: 4.4, h: 1.1, pitch: 8 },
    descent: { d: 3.4, h: 2.9, pitch: 30 },
  }[S.camera];
  const camDist = CAM.d * RW;
  const camBase = new THREE.Vector3(centre.x + F.x * camDist, 0, centre.z + F.z * camDist);
  camBase.y = Math.max(Hm(camBase.x, camBase.z) + 12, Htop + CAM.h * RW);
  const target = new THREE.Vector3(centre.x - F.x * 20, camBase.y - Math.tan((CAM.pitch * Math.PI) / 180) * camDist, centre.z - F.z * 20);
  camera.position.copy(camBase);
  camera.lookAt(target);

  // Le soleil : 22° à gauche de l'axe de visée, posé sur la crête réellement calculée (il se couche DERRIÈRE les montagnes).
  const V = { x: -F.x, z: -F.z };
  const side = S.time === 'dawn' ? 1 : -1;
  const azc = Math.cos((22 * Math.PI) / 180);
  const azs = Math.sin((22 * Math.PI) / 180);
  const sunH = { x: V.x * azc + side * R.x * azs, z: V.z * azc + side * R.z * azs };
  let ridge = 0;
  for (let dd = 150; dd < 1900; dd += 15) {
    const x = camBase.x + sunH.x * dd;
    const z = camBase.z + sunH.z * dd;
    if (Math.abs(x) > HALF || Math.abs(z) > HALF) break;
    ridge = Math.max(ridge, Math.atan2(Hm(x, z) - camBase.y, dd));
  }
  const DISC = 0.016; // rayon apparent du disque (rad)
  const elev = S.time === 'sunset' ? ridge + DISC * 0.35 : S.time === 'dawn' ? ridge + DISC * 1.6 : S.time === 'night' ? 0.62 : 0.85;
  const sunDir = new THREE.Vector3(sunH.x * Math.cos(elev), Math.sin(elev), sunH.z * Math.cos(elev)).normalize();
  made.add('sun');

  // ── ciel ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zen: { value: C(LOOK.zen) },
      hor: { value: C(LOOK.hor) },
      glow: { value: C(LOOK.glow) },
      sunC: { value: C(LOOK.sun) },
      sunDir: { value: sunDir },
      disc: { value: Math.cos(DISC) },
      night: { value: S.time === 'night' ? 1 : 0 },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; }',
    fragmentShader: [
      'uniform vec3 zen; uniform vec3 hor; uniform vec3 glow; uniform vec3 sunC; uniform vec3 sunDir; uniform float disc; uniform float night;',
      'varying vec3 vDir;',
      'void main(){',
      '  vec3 d = normalize(vDir);',
      '  float h = d.y;',
      '  vec3 col = mix(hor, zen, pow(smoothstep(-0.03, 0.62, h), 0.62));',
      '  float s = max(dot(d, sunDir), 0.0);',
      '  float band = exp(-abs(h - sunDir.y) * 7.0);',
      '  col += glow * (pow(s, 14.0) * 0.5 + pow(s, 120.0) * 1.1) * (1.0 - night * 0.6);',
      '  col += glow * band * pow(s, 4.0) * 0.22 * (1.0 - night);',
      '  col = mix(col, sunC * 6.0, smoothstep(disc - 0.00012, disc + 0.00004, s));',
      '  if (h < 0.0) col = mix(hor, hor * 0.55, smoothstep(0.0, -0.25, h));',
      '  gl_FragColor = vec4(col, 1.0);',
      '  #include <tonemapping_fragment>',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 48, 24), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);
  scene.fog = new THREE.FogExp2(C(LOOK.fog), 0.00029 * (0.7 + S.fog));
  // L'environnement (reflets de l'eau, éclairage d'ambiance) est rendu depuis ce ciel.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat));
  const env = pmrem.fromScene(skyScene, 0.02).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.32;

  // ── lumières ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const key = new THREE.DirectionalLight(C(LOOK.key), LOOK.keyI);
  key.position.set(sunDir.x * 1400, Math.max(60, sunDir.y * 1400), sunDir.z * 1400);
  key.target.position.set(0, Htop, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -300;
  sc.right = 300;
  sc.top = 300;
  sc.bottom = -300;
  sc.near = 10;
  sc.far = 3600;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.9;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(C(LOOK.fill), LOOK.fillI);
  fill.position.set(F.x * 900, 420, F.z * 900);
  scene.add(fill);
  scene.add(new THREE.HemisphereLight(C(LOOK.hemiS), C(LOOK.hemiG), LOOK.hemiI));

  // ── textures dessinées (aucun fichier) ───────────────────────────────────────────────────────────────────────────
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, color = true) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  };
  const shade = (base: [number, number, number], k: number) =>
    `rgb(${Math.round(Math.min(255, base[0] * k))},${Math.round(Math.min(255, base[1] * k))},${Math.round(Math.min(255, base[2] * k))})`;
  const STONE_TILE = 7; // mètres par répétition
  const stoneTex = tex(256, 256, (g) => {
    g.fillStyle = '#8a7f70';
    g.fillRect(0, 0, 256, 256);
    let y = 0;
    let row = 0;
    while (y < 256) {
      const rh = 18 + Math.floor(rnd() * 8);
      let x = row % 2 ? -Math.floor(rnd() * 30) : 0;
      while (x < 256) {
        const bw = 26 + Math.floor(rnd() * 30);
        g.fillStyle = shade([196, 182, 158], 0.82 + rnd() * 0.3);
        g.fillRect(x + 1.5, y + 1.5, bw - 3, rh - 3);
        x += bw;
      }
      y += rh;
      row++;
    }
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + rnd() * 0.06})`;
      g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
    }
  });
  stoneTex.repeat.set(1 / STONE_TILE, 1 / STONE_TILE);
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: C('#f4e6c8'), roughness: 0.9 });
  const darkStoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: C('#b9ad9a'), roughness: 0.95 });
  const slateMat = new THREE.MeshStandardMaterial({ color: C('#3c4a6a'), roughness: 0.7, metalness: 0.05 });
  const timberTex = tex(256, 128, (g) => {
    g.fillStyle = '#f2ead8';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#4a3222';
    g.fillRect(0, 0, 256, 9);
    g.fillRect(0, 119, 256, 9);
    for (const x of [0, 124, 248]) g.fillRect(x, 0, 9, 128);
    g.lineWidth = 7;
    g.strokeStyle = '#4a3222';
    g.beginPath();
    g.moveTo(8, 120);
    g.lineTo(60, 10);
    g.moveTo(248, 120);
    g.lineTo(196, 10);
    g.stroke();
    g.fillStyle = '#2b2a33';
    g.fillRect(84, 40, 26, 40);
    g.fillRect(146, 40, 26, 40);
    g.fillStyle = '#4a3222';
    g.fillRect(80, 36, 34, 5);
    g.fillRect(142, 36, 34, 5);
  });
  const windowTex = tex(256, 128, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#ffb04a';
    g.fillRect(86, 42, 22, 36);
    g.fillStyle = '#7a4a18';
    g.fillRect(148, 42, 22, 36);
  });
  const tileTex = tex(128, 128, (g) => {
    g.fillStyle = '#d9d9d9';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 10) {
      g.fillStyle = '#8f8f8f';
      g.fillRect(0, y, 128, 2);
      for (let x = (y / 10) % 2 ? 0 : 8; x < 128; x += 16) {
        g.fillStyle = shade([220, 220, 220], 0.85 + rnd() * 0.25);
        g.fillRect(x + 1, y + 2, 14, 8);
      }
    }
  });
  const cobbleTex = tex(128, 128, (g) => {
    g.fillStyle = '#6d645a';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 230; i++) {
      g.fillStyle = shade([150, 138, 122], 0.75 + rnd() * 0.4);
      g.beginPath();
      g.ellipse(rnd() * 128, rnd() * 128, 4 + rnd() * 3, 3 + rnd() * 3, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
  const dirtTex = tex(128, 128, (g) => {
    g.fillStyle = '#9b8463';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = shade([150, 126, 92], 0.7 + rnd() * 0.5);
      g.fillRect(rnd() * 128, rnd() * 128, 2, 2);
    }
    g.fillStyle = 'rgba(70,52,34,.35)';
    g.fillRect(0, 34, 128, 8);
    g.fillRect(0, 86, 128, 8);
  });
  const glowTex = tex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,220,160,.55)');
    gr.addColorStop(1, 'rgba(255,180,90,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });

  // ── outils de géométrie ──────────────────────────────────────────────────────────────────────────────────────────
  const dummy = new THREE.Object3D();
  const boxW = (w: number, h: number, d: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv as T.BufferAttribute;
    const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) uv.setXY(f * 4 + k, uv.getX(f * 4 + k) * dims[f]![0], uv.getY(f * 4 + k) * dims[f]![1]);
    return g;
  };
  const cylW = (rt: number, rb: number, h: number, seg = 16) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, false);
    const uv = g.attributes.uv as T.BufferAttribute;
    const circ = 2 * Math.PI * Math.max(rt, rb);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * h);
    return g;
  };
  const merge = (list: T.BufferGeometry[]) => {
    const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const arrs = parts.map((p) => (p.attributes[name] as T.BufferAttribute).array as Float32Array);
      const total = arrs.reduce((s, a) => s + a.length, 0);
      const buf = new Float32Array(total);
      let o = 0;
      for (const a of arrs) {
        buf.set(a, o);
        o += a.length;
      }
      out.setAttribute(name, new THREE.BufferAttribute(buf, name === 'uv' ? 2 : 3));
    }
    return out;
  };
  /** A gable roof of unit size: ridge along z at x = 0, height 1. */
  const prism = () => {
    const p = [
      [-0.5, 0, -0.5], [0, 1, -0.5], [0, 1, 0.5], [-0.5, 0, -0.5], [0, 1, 0.5], [-0.5, 0, 0.5],
      [0.5, 0, 0.5], [0, 1, 0.5], [0, 1, -0.5], [0.5, 0, 0.5], [0, 1, -0.5], [0.5, 0, -0.5],
      [-0.5, 0, 0.5], [0, 1, 0.5], [0.5, 0, 0.5],
      [0.5, 0, -0.5], [0, 1, -0.5], [-0.5, 0, -0.5],
    ];
    const uv = [
      [0, 0], [0, 1], [3, 1], [0, 0], [3, 1], [3, 0],
      [0, 0], [0, 1], [3, 1], [0, 0], [3, 1], [3, 0],
      [0, 0], [0.5, 1], [1, 0],
      [0, 0], [0.5, 1], [1, 0],
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p.flat()), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv.flat()), 2));
    g.computeVertexNormals();
    return g;
  };
  const ribbon = (pts: P2[], width: number, lift: number, mat: T.Material, skip?: (p: P2) => boolean) => {
    const pos: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    let len = 0;
    let n = 0;
    let open = false;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const q = pts[Math.min(pts.length - 1, i + 1)]!;
      const o = pts[Math.max(0, i - 1)]!;
      if (i > 0) len += Math.hypot(p.x - o.x, p.z - o.z);
      if (skip?.(p)) {
        open = false;
        continue;
      }
      const dx = q.x - o.x;
      const dz = q.z - o.z;
      const l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l;
      const nz = dx / l;
      for (const s of [-1, 1]) {
        const x = p.x + nx * s * width * 0.5;
        const z = p.z + nz * s * width * 0.5;
        pos.push(x, Hm(x, z) + lift, z);
        uvs.push(s < 0 ? 0 : 1, len / width);
      }
      if (open) idx.push(n - 2, n - 1, n, n - 1, n + 1, n);
      n += 2;
      open = true;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const instanced = (geo: T.BufferGeometry, mat: T.Material, n: number, shadow = true) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    m.count = 0;
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  const put = (m: T.InstancedMesh, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, color?: T.Color) => {
    // jamais au-delà de la capacité réservée (la carte graphique lirait hors du tampon : image noire)
    if (m.count >= m.instanceMatrix.count) return -1;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    m.setMatrixAt(m.count, dummy.matrix);
    if (color) m.setColorAt(m.count, color);
    m.count++;
  };
  // Le vent, calculé par la carte graphique (blé, feuillages).
  const windU = { uTime: { value: 0 }, uWind: { value: S.wind } };
  const addWind = (mat: T.Material, height: number, amp: number, sheen: boolean, ao = 0.5) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = windU.uTime;
      sh.uniforms.uWind = windU.uWind;
      sh.vertexShader =
        'uniform float uTime;\nuniform float uWind;\nvarying float vWave;\nvarying float vH;\n' +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          [
            '#include <begin_vertex>',
            'vec4 wp0 = vec4(transformed, 1.0);',
            '#ifdef USE_INSTANCING',
            'wp0 = instanceMatrix * wp0;',
            '#endif',
            `float hh = clamp(position.y / ${height.toFixed(2)}, 0.0, 1.0);`,
            'float wv = sin(wp0.x * 0.045 + wp0.z * 0.028 - uTime * 1.7) * 0.7 + sin(wp0.x * 0.13 - uTime * 2.9 + wp0.z * 0.09) * 0.3;',
            'vWave = wv;',
            'vH = hh;',
            `transformed.x += wv * uWind * ${amp.toFixed(3)} * hh * hh;`,
            `transformed.z += wv * uWind * ${(amp * 0.5).toFixed(3)} * hh * hh;`,
          ].join('\n'),
        );
      sh.fragmentShader =
        'varying float vWave;\nvarying float vH;\n' +
        sh.fragmentShader.replace(
          '#include <color_fragment>',
          '#include <color_fragment>\n' +
            `diffuseColor.rgb *= ${(1 - ao).toFixed(2)} + ${(ao * 1.25).toFixed(2)} * vH;\n` +
            (sheen ? 'diffuseColor.rgb *= 0.8 + 0.34 * smoothstep(-0.9, 0.9, vWave);' : ''),
        );
    };
  };

  // ── terrain (couleurs par sommet : herbe, blé, labours, forêt, roche, neige, berges, terre battue) ───────────────
  {
    const pos = new Float32Array(N * N * 3);
    const col = new Float32Array(N * N * 3);
    const grass = C(S.season === 'autumn' ? '#7c7a3a' : S.season === 'spring' ? '#76a24a' : '#6e8d40');
    const forestC = C(S.season === 'autumn' ? '#6b4a26' : '#34512a');
    const wheat = [C('#d9b45c'), C('#cfa548'), C('#e3c472')];
    const rock = C('#7f776e');
    const snow = C('#eef2f7');
    const bank = C('#a48d68');
    const earth = C('#8e7d62');
    const haze = C(MARS ? '#b98466' : S.time === 'night' ? '#1c2440' : S.time === 'day' ? '#8a9ab8' : '#4f5a8a');
    const tmp = new THREE.Color();
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const x = GX[i]!;
        const z = GX[j]!;
        const h = HG[k]!;
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        const r = Math.hypot(x, z);
        const sl = slopeAt(x, z);
        tmp.copy(grass).offsetHSL(0, 0, (fbm(x * 0.02, z * 0.02) - 0.5) * 0.08);
        if (MARS) tmp.set('#a5532f').lerp(C('#c47a4a'), fbm(x * 0.008, z * 0.008)).offsetHSL(0, 0, (fbm(x * 0.03, z * 0.03) - 0.5) * 0.1);
        if (FOREST) tmp.set('#3c6628').lerp(C('#6f8a34'), fbm(x * 0.02 + 5, z * 0.02)).offsetHSL(0, 0, (fbm(x * 0.05, z * 0.05) - 0.5) * 0.08);
        const pk = parcelKind(x, z);
        if (pk === 'wheat') tmp.copy(wheat[Math.floor(hash(Math.floor(x / 40), Math.floor(z / 40)) * 3)]!);
        else if (pk === 'green') tmp.copy(C('#7f9c48'));
        else if (pk === 'plough') tmp.copy(C('#9a7a52'));
        const fo = forestAt(x, z);
        if (fo > 0) tmp.lerp(forestC, Math.min(0.85, fo));
        if (city && r < RW + 4) tmp.lerp(earth, 0.75);
        if (h < 2.4 && (river.length || LAKE)) tmp.lerp(bank, sstep(2.4, 0.6, h));
        tmp.offsetHSL(0, 0, (fbm(x * 0.006 + 40, z * 0.006) - 0.5) * 0.12);
        tmp.lerp(MARS ? C('#7a3e28') : rock, sstep(0.55, 1.1, sl) * 0.9);
        tmp.lerp(MARS ? C('#8a4a30') : rock, sstep(240, 330, h) * 0.6);
        tmp.lerp(haze, 0.78 * sstep(MT0 - 150, MT0 + 600, r));
        const snowK = MARS ? 0 : SNOW ? sstep(0.9, 0.5, sl) * 0.9 : sstep(330, 420, h) * sstep(1.2, 0.6, sl);
        tmp.lerp(snow, snowK);
        col[k * 3] = tmp.r;
        col[k * 3 + 1] = tmp.g;
        col[k * 3 + 2] = tmp.b;
      }
    const idx = new Uint32Array(SEG * SEG * 6);
    let o = 0;
    for (let j = 0; j < SEG; j++)
      for (let i = 0; i < SEG; i++) {
        const a = j * N + i;
        const b = a + 1;
        const c = a + N;
        const d = c + 1;
        idx[o++] = a;
        idx[o++] = c;
        idx[o++] = b;
        idx[o++] = d;
        idx[o++] = b;
        idx[o++] = c;
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 });
    const FEXT = Math.min(MT0, RW * 6.2);
    // carte des parcelles (2 048 px) : bords nets, sillons dans le sens de la parcelle, haies sombres
    const wheatMask = document.createElement('canvas');
    wheatMask.width = wheatMask.height = 512;
    const wm = wheatMask.getContext('2d')!;
    wm.fillStyle = '#000';
    wm.fillRect(0, 0, 512, 512);
    const fieldMap = has('fields')
      ? tex(2048, 2048, (g2) => {
          g2.clearRect(0, 0, 2048, 2048);
          const px = (x: number) => ((x + FEXT) / (2 * FEXT)) * 2048;
          const pal: Record<string, [number, number, number][]> = {
            wheat: [[219, 184, 100], [208, 170, 82], [226, 194, 112], [201, 164, 86]],
            green: [[134, 156, 80], [120, 146, 74]],
            plough: [[158, 126, 90], [146, 114, 80]],
            meadow: [[118, 144, 74], [130, 152, 80]],
          };
          const nz = Math.ceil(FEXT / ZONE);
          for (let zi = -nz; zi < nz; zi++)
            for (let zj = -nz; zj < nz; zj++) {
              const a = zoneAngle(zi, zj);
              g2.save();
              g2.beginPath();
              g2.rect(px(zi * ZONE), px(zj * ZONE), (ZONE / (2 * FEXT)) * 2048, (ZONE / (2 * FEXT)) * 2048);
              g2.clip();
              // les lanières qui couvrent le quartier (dans le repère tourné du quartier)
              const cx0 = (zi + 0.5) * ZONE;
              const cz0 = (zj + 0.5) * ZONE;
              const uc = cx0 * Math.cos(a) + cz0 * Math.sin(a);
              const vc = -cx0 * Math.sin(a) + cz0 * Math.cos(a);
              const ra = Math.ceil((ZONE * 0.75) / PL) + 1;
              const rb = Math.ceil((ZONE * 0.75) / PW) + 1;
              for (let ca = Math.floor(uc / PL) - ra; ca <= Math.floor(uc / PL) + ra; ca++)
                for (let cb = Math.floor(vc / PW) - rb; cb <= Math.floor(vc / PW) + rb; cb++) {
              const k = cellKind(zi, zj, ca, cb);
              if (!k) continue;
              const corner = (du: number, dv: number) => {
                const w = cellCorner(a, ca + du, cb + dv);
                return [px(w.x), px(w.z)] as const;
              };
              const cs = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
              const base = pal[k]![Math.floor(hash(zi * 5 + ca * 3, zj * 3 + cb * 5) * pal[k]!.length)]!;
              g2.fillStyle = shade(base, 0.93 + hash(ca, cb) * 0.12);
              g2.beginPath();
              cs.forEach(([a, b], i) => (i ? g2.lineTo(a, b) : g2.moveTo(a, b)));
              g2.closePath();
              g2.fill();
              if (k === 'wheat') {
                wm.fillStyle = '#fff';
                wm.beginPath();
                cs.forEach(([a2, b2], i) => (i ? wm.lineTo(a2 / 4, b2 / 4) : wm.moveTo(a2 / 4, b2 / 4)));
                wm.closePath();
                wm.fill();
              }
              // sillons : lignes parallèles au grand côté de la parcelle
              g2.save();
              g2.clip();
              g2.strokeStyle = k === 'plough' ? 'rgba(70,48,30,.45)' : k === 'wheat' ? 'rgba(120,88,40,.22)' : 'rgba(40,70,30,.25)';
              g2.lineWidth = 1;
              const [ax, ay] = cs[0]!;
              const [bx, by] = cs[1]!;
              const [dx, dy] = cs[3]!;
              const steps = k === 'meadow' ? 0 : 6;
              for (let t = 0; t <= steps; t++) {
                const f = t / steps;
                g2.beginPath();
                g2.moveTo(ax + (dx - ax) * f, ay + (dy - ay) * f);
                g2.lineTo(bx + (dx - ax) * f, by + (dy - ay) * f);
                g2.stroke();
              }
              g2.restore();
              // haie : bord sombre avec quelques taches d'arbustes
              g2.strokeStyle = 'rgba(70,84,44,.45)';
              g2.lineWidth = 1.2;
              g2.beginPath();
              cs.forEach(([a, b], i) => (i ? g2.lineTo(a, b) : g2.moveTo(a, b)));
              g2.closePath();
              g2.stroke();
              g2.fillStyle = 'rgba(44,64,30,.8)';
              for (let q = 0; q < (hash(ca, cb * 3) < 0.35 ? 5 : 0); q++) {
                const e = Math.floor(hash(ca * 11 + q, cb * 17) * 4);
                const [x0, y0] = cs[e]!;
                const [x1, y1] = cs[(e + 1) % 4]!;
                const f = hash(ca + q * 7, cb - q);
                g2.beginPath();
                g2.arc(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, 1.6 + hash(q, ca) * 1.6, 0, Math.PI * 2);
                g2.fill();
              }
                }
              g2.restore();
            }
        })
      : null;
    if (fieldMap) fieldMap.flipY = false;
    const wheatTex = new THREE.CanvasTexture(wheatMask);
    wheatTex.flipY = false;
    // texture de détail (bruit à deux échelles) : grain du sol, rochers, herbe — rompt l'aspect lisse
    const detail = tex(
      256,
      256,
      (g2) => {
        const img = g2.createImageData(256, 256);
        for (let y = 0; y < 256; y++)
          for (let x = 0; x < 256; x++) {
            const v = fbm(x / 22, y / 22, 5) * 0.7 + noise(x / 3.1, y / 3.1) * 0.3;
            const c = Math.max(0, Math.min(255, Math.round(v * 255)));
            const k = (y * 256 + x) * 4;
            img.data[k] = img.data[k + 1] = img.data[k + 2] = c;
            img.data[k + 3] = 255;
          }
        g2.putImageData(img, 0, 0);
      },
      false,
    );
    // roche en strates (falaises, montagnes) et herbe fine (premier plan), dessinées ici
    const rockTex = tex(512, 512, (g2) => {
      const img = g2.createImageData(512, 512);
      for (let y = 0; y < 512; y++)
        for (let x = 0; x < 512; x++) {
          const strata = 0.5 + 0.5 * Math.sin(y / 9 + fbm(x / 60, y / 40, 3) * 6);
          const grain = fbm(x / 7, y / 7, 3);
          const crack = Math.abs(noise(x / 26 + 100, y / 70) - 0.5) < 0.02 ? 0.55 : 1;
          const v = (0.55 + 0.25 * strata + 0.3 * (grain - 0.5)) * crack;
          const k = (y * 512 + x) * 4;
          img.data[k] = Math.min(255, 150 * v + 18);
          img.data[k + 1] = Math.min(255, 140 * v + 14);
          img.data[k + 2] = Math.min(255, 128 * v + 12);
          img.data[k + 3] = 255;
        }
      g2.putImageData(img, 0, 0);
    });
    const grassTex = tex(256, 256, (g2) => {
      g2.fillStyle = 'rgb(156,160,146)';
      g2.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 5200; i++) {
        const x = rnd() * 256;
        const y = rnd() * 256;
        const l = 0.78 + rnd() * 0.44;
        g2.strokeStyle = `rgba(${Math.round(150 * l)},${Math.round(166 * l)},${Math.round(132 * l)},.55)`;
        g2.lineWidth = 1;
        g2.beginPath();
        g2.moveTo(x, y);
        g2.lineTo(x + (rnd() - 0.5) * 3, y - 2 - rnd() * 4);
        g2.stroke();
      }
    });
    groundMat.onBeforeCompile = (sh) => {
      sh.uniforms.uRock = { value: rockTex };
      sh.uniforms.uWheat = { value: wheatTex };
      sh.uniforms.uTime = windU.uTime;
      sh.uniforms.uWind = windU.uWind;
      sh.uniforms.uGrass = { value: grassTex };
      sh.uniforms.uField = { value: fieldMap };
      sh.uniforms.uHasField = { value: fieldMap ? 1 : 0 };
      sh.uniforms.uExt = { value: FEXT };
      sh.uniforms.uDetail = { value: detail };
      sh.vertexShader =
        'varying vec3 vWPos;\nvarying vec3 vWNorm;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNorm = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader =
        'varying vec3 vWPos;\nvarying vec3 vWNorm;\nuniform sampler2D uField;\nuniform float uHasField;\nuniform float uExt;\nuniform sampler2D uDetail;\nuniform sampler2D uRock;\nuniform sampler2D uGrass;\nuniform sampler2D uWheat;\nuniform float uTime;\nuniform float uWind;\n' +
        sh.fragmentShader.replace(
          '#include <color_fragment>',
          [
            '#include <color_fragment>',
            'if (uHasField > 0.5 && abs(vWPos.x) < uExt && abs(vWPos.z) < uExt) {',
            '  vec4 fm = texture2D(uField, (vWPos.xz + uExt) / (2.0 * uExt));',
            '  diffuseColor.rgb = mix(diffuseColor.rgb, fm.rgb, fm.a);',
            // le vent sur le blé : des vagues de lumière qui traversent les champs
            '  float wmk = texture2D(uWheat, (vWPos.xz + uExt) / (2.0 * uExt)).r;',
            '  float gust = sin(dot(vWPos.xz, vec2(0.032, 0.019)) - uTime * 1.5) * 0.6 + sin(dot(vWPos.xz, vec2(0.071, -0.043)) - uTime * 2.3) * 0.4;',
            '  diffuseColor.rgb *= 1.0 + wmk * uWind * 0.22 * gust;',
            '}',
            'float dt = texture2D(uDetail, vWPos.xz / 6.0).r * 0.5 + texture2D(uDetail, vWPos.xz / 47.0).r * 0.5;',
            'diffuseColor.rgb *= 0.72 + 0.56 * dt;',
            // roche projetée sur les trois axes (aucun étirement sur les pentes), dosée par la pente
            'vec3 bw = pow(abs(vWNorm), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);',
            'vec3 rock = texture2D(uRock, vWPos.zy / 24.0).rgb * bw.x + texture2D(uRock, vWPos.xz / 24.0).rgb * bw.y + texture2D(uRock, vWPos.xy / 24.0).rgb * bw.z;',
            'float slope = 1.0 - clamp(vWNorm.y, 0.0, 1.0);',
            'float rk = smoothstep(0.3, 0.55, slope + (dt - 0.5) * 0.3) * (1.0 - smoothstep(0.82, 0.9, diffuseColor.r * 0.33 + diffuseColor.g * 0.33 + diffuseColor.b * 0.34));',
            'diffuseColor.rgb = mix(diffuseColor.rgb, rock * 0.92, rk);',
            // herbe fine au premier plan, variations de teinte à grande échelle
            'vec3 grass = texture2D(uGrass, vWPos.xz / 2.6).rgb;',
            'diffuseColor.rgb *= mix(vec3(1.0), grass * 1.62, (1.0 - rk) * 0.55);',
            'float mac = texture2D(uDetail, vWPos.xz / 310.0 + 0.37).r;',
            'diffuseColor.rgb *= 0.86 + 0.28 * mac;',
          ].join('\n'),
        );
    };
    const ground = new THREE.Mesh(g, groundMat);
    ground.receiveShadow = true;
    scene.add(ground);
    if (hilly) made.add('hill');
    if (HILL || river.length) made.add('valley');
    made.add('mountains');
  }

  // ── eau (rivière et lac : un plan qui reflète le ciel, rides animées) ──────────────────────────────────────────
  let waterNormal: T.Texture | null = null;
  if (!FOREST && (river.length || LAKE)) {
    const n = 128;
    const data = new Uint8Array(n * n * 4);
    const hh = (x: number, y: number) => fbm(x / 9, y / 9, 3) + 0.5 * fbm(x / 3.5 + 40, y / 3.5, 2);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const dx = hh(x + 1, y) - hh(x - 1, y);
        const dy = hh(x, y + 1) - hh(x, y - 1);
        const k = (y * n + x) * 4;
        data[k] = Math.round((0.5 - dx * 2.2) * 255);
        data[k + 1] = Math.round((0.5 - dy * 2.2) * 255);
        data[k + 2] = 255;
        data[k + 3] = 255;
      }
    const dt = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
    dt.wrapS = dt.wrapT = THREE.RepeatWrapping;
    dt.magFilter = THREE.LinearFilter;
    dt.minFilter = THREE.LinearMipmapLinearFilter;
    dt.generateMipmaps = true;
    dt.anisotropy = maxAniso;
    dt.repeat.set(90, 90);
    dt.needsUpdate = true;
    waterNormal = dt;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2, HALF * 2),
      new THREE.MeshStandardMaterial({ color: C(S.time === 'night' ? '#0d1a2c' : '#2a5671'), roughness: 0.06, metalness: 0.35, normalMap: dt, normalScale: new THREE.Vector2(0.22, 0.22), envMapIntensity: 1.5 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = WL;
    water.receiveShadow = true;
    scene.add(water);
    if (river.length) made.add('river');
    if (LAKE) made.add('lake');
  }

  // ── la cité ──────────────────────────────────────────────────────────────────────────────────────────────────────
  type Box = { x: number; z: number; r: number };
  // occupation du sol par cases de 16 m (une maison ne regarde que ses voisines)
  const cells = new Map<number, Box[]>();
  const keyOf = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);
  const blocked = {
    push(b: Box) {
      const i0 = Math.floor((b.x - b.r) / 16);
      const i1 = Math.floor((b.x + b.r) / 16);
      const j0 = Math.floor((b.z - b.r) / 16);
      const j1 = Math.floor((b.z + b.r) / 16);
      for (let i = i0; i <= i1; i++)
        for (let j = j0; j <= j1; j++) {
          const k = keyOf(i, j);
          const l = cells.get(k);
          if (l) l.push(b);
          else cells.set(k, [b]);
        }
    },
  };
  const free = (x: number, z: number, r: number) => {
    const i0 = Math.floor((x - r - 12) / 16);
    const i1 = Math.floor((x + r + 12) / 16);
    const j0 = Math.floor((z - r - 12) / 16);
    const j1 = Math.floor((z + r + 12) / 16);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) for (const b of cells.get(keyOf(i, j)) ?? []) if (Math.hypot(b.x - x, b.z - z) < b.r + r) return false;
    return true;
  };
  const streets: P2[][] = [];
  const lampSpots: P2[] = [];
  const flagSpots: { x: number; y: number; z: number; s: number; long?: boolean; ry?: number }[] = [];
  const SQ = Wk(34, -6);
  const SQR = 30 * Math.pow(K, 0.7);
  const CASTLE = { a0: -84 * K, a1: -16 * K, b0: -42 * K, b1: 34 * K };
  const inCastle = (x: number, z: number, m: number) => {
    const p = AB(x, z);
    return p.a > CASTLE.a0 - m && p.a < CASTLE.a1 + m && p.b > CASTLE.b0 - m && p.b < CASTLE.b1 + m;
  };
  const CH = { a: 16 * K, b: 60 * K, w: 16, l: 38 };
  const inChurch = (x: number, z: number, m: number) => {
    if (!has('church')) return false;
    const p = AB(x, z);
    return Math.abs(p.a - CH.a) < CH.w / 2 + m && Math.abs(p.b - CH.b) < CH.l / 2 + 6 + m;
  };
  const ringR = (th: number) => RW * (1 + 0.035 * Math.sin(3 * th + (S.seed % 7)));
  const thF = Math.atan2(F.z, F.x);
  const NT = Math.max(8, S.counts.towers);
  const gates = [0, Math.round(NT / 4), Math.round((3 * NT) / 4)];

  if (city) {
    // Rues pavées : de la place vers chaque porte et vers le château.
    const gateAt = (k: number) => {
      const th = thF + (2 * Math.PI * k) / NT;
      const r = ringR(th);
      return { x: Math.cos(th) * r, z: Math.sin(th) * r };
    };
    const g0 = gateAt(gates[0]!);
    const g1 = gateAt(gates[1]!);
    const g2 = gateAt(gates[2]!);
    // Les portes latérales réorientent les routes extérieures vers elles.
    roads[1] = spline([g1, ...toW(roadsAB[1]!.slice(1))], 4);
    roads[2] = spline([g2, ...toW(roadsAB[2]!.slice(1))], 4);
    roads[0] = spline([g0, ...toW(roadsAB[0]!.slice(1))], 4);
    const mid = (p: P2, q: P2, k: number, bend: number) => ({ x: lerp(p.x, q.x, k) + bend * R.x, z: lerp(p.z, q.z, k) + bend * R.z });
    streets.push(spline([SQ, mid(SQ, g0, 0.5, 6), g0], 3));
    streets.push(spline([SQ, mid(SQ, g1, 0.45, 10), g1], 3));
    streets.push(spline([SQ, Wk(52, 34), mid(Wk(52, 34), g2, 0.5, -8), g2], 3));
    streets.push(spline([SQ, Wk(-14, -2)], 3));
    const ring: P2[] = [];
    for (let k = 0; k <= 48; k++) {
      const th = thF + (k / 48) * Math.PI * 2;
      if (Math.abs(Math.sin((th - thF) / 2)) < 0.42) continue; // l'anneau ne traverse pas le château
      ring.push({ x: Math.cos(th) * (RW - 15), z: Math.sin(th) * (RW - 15) });
    }
    if (ring.length > 3) streets.push(ring);
    const streetMat = new THREE.MeshStandardMaterial({ map: cobbleTex, color: C('#cbbfae'), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    cobbleTex.repeat.set(1, 1);
    for (const st of streets) ribbon(st, 5.2, 0.28, streetMat);
    made.add('streets');
    for (const st of streets)
      for (let i = 6; i < st.length - 2; i += 5) {
        const p = st[i]!;
        const q = st[i + 1]!;
        const l = Math.hypot(q.x - p.x, q.z - p.z) || 1;
        const s = i % 10 < 5 ? 1 : -1;
        lampSpots.push({ x: p.x + (-(q.z - p.z) / l) * 3.6 * s, z: p.z + ((q.x - p.x) / l) * 3.6 * s });
      }
    for (const st of streets) for (let i = 0; i < st.length; i += 2) blocked.push({ x: st[i]!.x, z: st[i]!.z, r: 3.4 });

    // Place centrale (pavée) et fontaine.
    if (has('square') || has('market') || has('houses')) {
      const sq = new THREE.CircleGeometry(SQR, 72);
      sq.rotateX(-Math.PI / 2);
      const p = sq.attributes.position as T.BufferAttribute;
      const uv = sq.attributes.uv as T.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + SQ.x;
        const z = p.getZ(i) + SQ.z;
        p.setXYZ(i, x, Hm(x, z) + 0.34, z);
        uv.setXY(i, uv.getX(i) * 7, uv.getY(i) * 7);
      }
      sq.computeVertexNormals();
      const sm = new THREE.Mesh(sq, new THREE.MeshStandardMaterial({ map: cobbleTex, color: C('#d8ccb8'), roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
      sm.receiveShadow = true;
      scene.add(sm);
      const fountain = new THREE.Mesh(cylW(3.4, 3.8, 1.4, 20), stoneMat);
      fountain.position.set(SQ.x, Hm(SQ.x, SQ.z) + 0.9, SQ.z);
      fountain.castShadow = true;
      scene.add(fountain);
      blocked.push({ x: SQ.x, z: SQ.z, r: SQR + 3 });
      made.add('square');
      for (let k = 0; k < 10; k++) {
        const th = (k / 10) * Math.PI * 2;
        lampSpots.push({ x: SQ.x + Math.cos(th) * (SQR - 1.5), z: SQ.z + Math.sin(th) * (SQR - 1.5) });
      }
    }

    // ── remparts, tours de guet, portes, merlons ──────────────────────────────────────────────────────────────
    if (has('walls') || has('castle')) {
      const wallH = 11 * Math.min(1.5, Math.sqrt(boost('walls')));
      const towerR = 5.6 * Math.min(1.4, Math.sqrt(boost('towers')));
      const towerH = wallH + 10;
      const towerBody = instanced(cylW(1, 1, 1, 18), stoneMat, NT * 2);
      const towerCap = instanced(cylW(1.16, 1.0, 1, 18), stoneMat, NT * 2);
      const towerRoof = instanced(new THREE.ConeGeometry(1, 1, 18), slateMat, NT * 2);
      const merlonGeo = boxW(1.5, 1.7, 1.1);
      const merlons = instanced(merlonGeo, stoneMat, 9000);
      const verts: { x: number; z: number; th: number }[] = [];
      for (let k = 0; k < NT; k++) {
        const th = thF + (2 * Math.PI * k) / NT;
        const r = ringR(th);
        verts.push({ x: Math.cos(th) * r, z: Math.sin(th) * r, th });
      }
      for (let k = 0; k < NT; k++) {
        const p = verts[k]!;
        const q = verts[(k + 1) % NT]!;
        const len = Math.hypot(q.x - p.x, q.z - p.z);
        let lo = 1e9;
        let hi = -1e9;
        for (let s = 0; s <= 8; s++) {
          const h = Hm(lerp(p.x, q.x, s / 8), lerp(p.z, q.z, s / 8));
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
        const base = lo - 4;
        const top = hi + wallH;
        const g = boxW(len, top - base, 3.6);
        const wall = new THREE.Mesh(g, stoneMat);
        wall.position.set((p.x + q.x) / 2, (base + top) / 2, (p.z + q.z) / 2);
        wall.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
        // merlons sur le bord extérieur
        const ox = Math.cos((p.th + q.th) / 2);
        const oz = Math.sin((p.th + q.th) / 2);
        const nm = Math.floor(len / 2.7);
        for (let m = 1; m < nm; m++) {
          const t = m / nm;
          put(merlons, lerp(p.x, q.x, t) + ox * 1.25, top + 0.85, lerp(p.z, q.z, t) + oz * 1.25, 1, 1, 1, wall.rotation.y);
        }
        for (let i = 0; i <= 8; i++) blocked.push({ x: lerp(p.x, q.x, i / 8), z: lerp(p.z, q.z, i / 8), r: 6 });
      }
      for (let k = 0; k < NT; k++) {
        const p = verts[k]!;
        const g = Hm(p.x, p.z);
        const isGate = gates.includes(k);
        const rT = isGate ? towerR * 0.85 : towerR;
        const pairs = isGate
          ? [-1, 1].map((s) => ({ x: p.x - Math.sin(p.th) * s * 8.5, z: p.z + Math.cos(p.th) * s * 8.5 }))
          : [{ x: p.x, z: p.z }];
        for (const t of pairs) {
          const base = Hm(t.x, t.z) - 5;
          const h = towerH + (isGate ? 4 : 0) + 5;
          put(towerBody, t.x, base + h / 2, t.z, rT, h, rT);
          put(towerCap, t.x, base + h + 1, t.z, rT, 2.2, rT);
          put(towerRoof, t.x, base + h + 2.1 + rT * 0.9, t.z, rT * 1.25, rT * 1.8, rT * 1.25);
          if (isGate || k % 3 === 1) flagSpots.push({ x: t.x, y: base + h + 2.1 + rT * 1.8, z: t.z, s: 0.8 });
        }
        if (isGate) {
          const gh = new THREE.Mesh(boxW(13, towerH + 2, 10), stoneMat);
          gh.position.set(p.x, g - 3 + (towerH + 2) / 2, p.z);
          gh.rotation.y = -p.th;
          gh.castShadow = true;
          scene.add(gh);
          const arch = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 8), new THREE.MeshBasicMaterial({ color: C('#16110d') }));
          arch.position.set(p.x + Math.cos(p.th) * 5.05, g + 3.6, p.z + Math.sin(p.th) * 5.05);
          arch.rotation.y = Math.PI / 2 - p.th;
          scene.add(arch);
        }
        blocked.push({ x: p.x, z: p.z, r: towerR + 7 });
      }
      for (const m of [towerBody, towerCap, towerRoof, merlons]) m.instanceMatrix.needsUpdate = true;
      made.add('walls');
      made.add('towers');
    }

    // ── le château royal : enceinte intérieure, donjon carré, donjons ronds, grande salle ────────────────────────
    if (has('castle')) {
      const cb = Math.min(1.5, Math.sqrt(boost('castle')));
      const corners = [W(CASTLE.a0, CASTLE.b0), W(CASTLE.a1, CASTLE.b0), W(CASTLE.a1, CASTLE.b1), W(CASTLE.a0, CASTLE.b1)];
      const base0 = Math.min(...corners.map((c) => Hm(c.x, c.z))) - 3;
      const cwH = 16 * cb;
      for (let k = 0; k < 4; k++) {
        const p = corners[k]!;
        const q = corners[(k + 1) % 4]!;
        const len = Math.hypot(q.x - p.x, q.z - p.z);
        const top = Math.max(Hm(p.x, p.z), Hm(q.x, q.z)) + cwH;
        const wall = new THREE.Mesh(boxW(len, top - base0, 4), stoneMat);
        wall.position.set((p.x + q.x) / 2, (base0 + top) / 2, (p.z + q.z) / 2);
        wall.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
        wall.castShadow = wall.receiveShadow = true;
        scene.add(wall);
        const ct = new THREE.Mesh(cylW(7, 7.4, top - base0 + 10, 20), stoneMat);
        ct.position.set(p.x, (base0 + top + 10) / 2, p.z);
        ct.castShadow = true;
        scene.add(ct);
        const cr = new THREE.Mesh(new THREE.ConeGeometry(8.6, 15, 20), slateMat);
        cr.position.set(p.x, top + 10 + 7.5, p.z);
        cr.castShadow = true;
        scene.add(cr);
        flagSpots.push({ x: p.x, y: top + 25, z: p.z, s: 0.9 });
      }
      // donjon carré (le plus haut volume) avec bannières pendantes face à la caméra
      const dj = Wk(-58, -6);
      const djH = 50 * cb;
      const djB = Hm(dj.x, dj.z) - 3;
      const donjon = new THREE.Mesh(boxW(24, djH, 24), stoneMat);
      donjon.position.set(dj.x, djB + djH / 2, dj.z);
      donjon.rotation.y = -Math.atan2(R.z, R.x);
      donjon.castShadow = donjon.receiveShadow = true;
      scene.add(donjon);
      const djRoof = new THREE.Mesh(new THREE.ConeGeometry(18.5, 20, 4), slateMat);
      djRoof.position.set(dj.x, djB + djH + 10, dj.z);
      djRoof.rotation.y = donjon.rotation.y + Math.PI / 4;
      djRoof.castShadow = true;
      scene.add(djRoof);
      flagSpots.push({ x: dj.x, y: djB + djH + 20, z: dj.z, s: 1.3 });
      for (const s of [-6.5, 6.5]) {
        const bx = dj.x + F.x * 12.3 + R.x * s;
        const bz = dj.z + F.z * 12.3 + R.z * s;
        flagSpots.push({ x: bx, y: djB + djH - 6, z: bz, s: 1, long: true, ry: donjon.rotation.y });
      }
      const merl = instanced(boxW(1.6, 2, 1.2), stoneMat, 200);
      for (let k = 0; k < 4; k++)
        for (let m = 0; m < 9; m++) {
          const t = -10.5 + m * 2.6;
          const [lx, lz] = k === 0 ? [t, 12] : k === 1 ? [t, -12] : k === 2 ? [12, t] : [-12, t];
          put(merl, dj.x + R.x * lx + F.x * lz, djB + djH + 1, dj.z + R.z * lx + F.z * lz, 1, 1, 1, donjon.rotation.y);
        }
      merl.instanceMatrix.needsUpdate = true;
      // donjons ronds
      const spots = [Wk(-36, 16), Wk(-74, 20), Wk(-30, -28), Wk(-76, -30), Wk(-50, 26), Wk(-24, 2), Wk(-80, -6)];
      const nk = Math.max(1, Math.min(spots.length, S.counts.keeps));
      for (let k = 0; k < nk; k++) {
        const p = spots[k]!;
        const r = (k === 0 ? 8 : 6.2) * Math.min(1.3, Math.sqrt(boost('keeps')));
        const h = (k === 0 ? 66 : 46 + ((k * 7) % 14)) * cb;
        const b = Hm(p.x, p.z) - 3;
        const t = new THREE.Mesh(cylW(r, r * 1.06, h, 22), stoneMat);
        t.position.set(p.x, b + h / 2, p.z);
        t.castShadow = t.receiveShadow = true;
        scene.add(t);
        const ring = new THREE.Mesh(cylW(r * 1.18, r, 2.6, 22), stoneMat);
        ring.position.set(p.x, b + h + 1.3, p.z);
        scene.add(ring);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.32, r * 3.2, 22), slateMat);
        roof.position.set(p.x, b + h + 2.6 + r * 1.6, p.z);
        roof.castShadow = true;
        scene.add(roof);
        flagSpots.push({ x: p.x, y: b + h + 2.6 + r * 3.2, z: p.z, s: 1.1 });
      }
      // grande salle
      const gs = Wk(-34, -8);
      const gsb = Hm(gs.x, gs.z) - 2;
      const hall = new THREE.Mesh(boxW(14, 16, 30), darkStoneMat);
      hall.position.set(gs.x, gsb + 8, gs.z);
      hall.rotation.y = -Math.atan2(R.z, R.x) + Math.PI / 2;
      hall.castShadow = true;
      scene.add(hall);
      const hr = new THREE.Mesh(prism(), new THREE.MeshStandardMaterial({ map: tileTex, color: C('#9b4a36'), roughness: 0.8 }));
      hr.scale.set(15.5, 8, 31);
      hr.position.set(gs.x, gsb + 16, gs.z);
      hr.rotation.y = hall.rotation.y;
      hr.castShadow = true;
      scene.add(hr);
      blocked.push({ x: Wk(-50, -4).x, z: Wk(-50, -4).z, r: 0 });
      made.add('castle');
      made.add('keeps');
    }

    // ── l'église en pierre : nef, toit d'ardoise, clocher et flèche, abside, vitraux éclairés ──────────────────────
    if (has('church')) {
      const c = W(CH.a, CH.b);
      const rot = -Math.atan2(R.z, R.x);
      const base = Hm(c.x, c.z) - 3;
      const cbz = Math.min(1.5, Math.sqrt(boost('church')));
      const nave = new THREE.Mesh(boxW(CH.l, 19 * cbz, CH.w), stoneMat);
      nave.position.set(c.x, base + (19 * cbz) / 2, c.z);
      nave.rotation.y = rot;
      nave.castShadow = nave.receiveShadow = true;
      scene.add(nave);
      const roof = new THREE.Mesh(prism(), slateMat);
      roof.scale.set(CH.w * 1.12, 11 * cbz, CH.l * 1.03);
      roof.position.set(c.x, base + 19 * cbz, c.z);
      roof.rotation.y = rot + Math.PI / 2;
      roof.castShadow = true;
      scene.add(roof);
      const tw = { x: c.x - R.x * (CH.l / 2 + 4), z: c.z - R.z * (CH.l / 2 + 4) };
      const twH = 40 * cbz;
      const tower = new THREE.Mesh(boxW(10, twH, 10), stoneMat);
      tower.position.set(tw.x, base + twH / 2, tw.z);
      tower.rotation.y = rot;
      tower.castShadow = true;
      scene.add(tower);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(7.4, 26 * cbz, 4), slateMat);
      spire.position.set(tw.x, base + twH + 13 * cbz, tw.z);
      spire.rotation.y = rot + Math.PI / 4;
      spire.castShadow = true;
      scene.add(spire);
      const ap = { x: c.x + R.x * (CH.l / 2), z: c.z + R.z * (CH.l / 2) };
      const apse = new THREE.Mesh(cylW(CH.w / 2, CH.w / 2, 16 * cbz, 18), stoneMat);
      apse.position.set(ap.x, base + 8 * cbz, ap.z);
      apse.castShadow = true;
      scene.add(apse);
      const apr = new THREE.Mesh(new THREE.ConeGeometry(CH.w / 2 + 0.6, 8, 18), slateMat);
      apr.position.set(ap.x, base + 16 * cbz + 4, ap.z);
      scene.add(apr);
      const glass = new THREE.MeshStandardMaterial({ color: C('#2a2030'), emissive: C('#ffb768'), emissiveIntensity: 0.4 + LOOK.win, roughness: 0.4 });
      for (let k = 0; k < 5; k++) {
        const s = -CH.l / 2 + 5 + k * ((CH.l - 10) / 4);
        const wdw = new THREE.Mesh(new THREE.PlaneGeometry(2, 7.5 * cbz), glass);
        wdw.position.set(c.x + R.x * s + F.x * (CH.w / 2 + 0.05), base + 10 * cbz, c.z + R.z * s + F.z * (CH.w / 2 + 0.05));
        wdw.rotation.y = rot + Math.PI / 2;
        scene.add(wdw);
      }
      const rose = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), glass);
      rose.position.set(tw.x + F.x * 5.05, base + twH * 0.62, tw.z + F.z * 5.05);
      rose.rotation.y = rot + Math.PI / 2;
      scene.add(rose);
      for (let i = -3; i <= 3; i++) blocked.push({ x: c.x + R.x * i * 7, z: c.z + R.z * i * 7, r: 11 });
      blocked.push({ x: tw.x, z: tw.z, r: 9 });
      made.add('church');
    }

    // ── le marché animé : étals aux auvents de couleur, habitants qui vont et viennent ───────────────────────────
    const stallsXZ: { x: number; z: number; ry: number }[] = [];
    if (has('market')) {
      const n = S.counts.stalls;
      const table = instanced(boxW(2.8, 1.1, 1.7), new THREE.MeshStandardMaterial({ color: C('#6b4a2e'), roughness: 0.9 }), n);
      const awning = instanced(new THREE.BoxGeometry(3.4, 0.18, 2.6), new THREE.MeshStandardMaterial({ roughness: 0.8 }), n);
      const posts = instanced(new THREE.BoxGeometry(0.16, 2.6, 0.16), new THREE.MeshStandardMaterial({ color: C('#3d2a1c') }), n * 2, false);
      const cols = ['#b5302a', '#e9d8b4', '#2f5d9a', '#d39b2a', '#3d7a4a', '#9b3d6b'].map(C);
      for (let k = 0; k < n; k++) {
        const th = (k / n) * Math.PI * 2 + 0.2;
        const rr0 = k % 2 ? SQR - 6 : SQR - 13;
        const x = SQ.x + Math.cos(th) * rr0;
        const z = SQ.z + Math.sin(th) * rr0;
        const g = Hm(x, z);
        put(table, x, g + 0.9, z, 1, 1, 1, -th);
        dummy.position.set(x, g + 3.0, z);
        dummy.rotation.set(0.18, -th, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        awning.setMatrixAt(awning.count, dummy.matrix);
        awning.setColorAt(awning.count++, cols[k % cols.length]!);
        put(posts, x + 1.4 * Math.sin(th), g + 1.6, z + 1.4 * Math.cos(th), 1, 1, 1);
        put(posts, x - 1.4 * Math.sin(th), g + 1.6, z - 1.4 * Math.cos(th), 1, 1, 1);
        stallsXZ.push({ x, z, ry: th });
      }
      for (const m of [table, awning, posts]) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
      made.add('market');
    }

    // ── des centaines de maisons à colombages, serrées autour de la place ────────────────────────────────────────
    if (has('houses')) {
      const target2 = S.counts.houses;
      const wallsByFloor = [1, 2, 3].map((fl) => {
        const g = new THREE.BoxGeometry(1, 1, 1);
        g.translate(0, 0.5, 0);
        const uv = g.attributes.uv as T.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1, uv.getY(i) * fl);
        const mat = new THREE.MeshStandardMaterial({ map: timberTex, emissiveMap: windowTex, emissive: C('#ffffff'), emissiveIntensity: LOOK.win, roughness: 0.88 });
        return instanced(g, mat, target2 + 40);
      });
      const roofMat = new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.78 });
      const roofs = instanced(prism(), roofMat, target2 + 40);
      const plaster = ['#f3ead6', '#ead2a8', '#efd9c8', '#f6f1e6', '#e4cfa0'].map(C);
      const roofCols = (S.season === 'winter' ? ['#e9eef4', '#dde4ec'] : ['#a4513a', '#8e4532', '#b4623f', '#7e3d2c', '#5a6070', '#9a5a3c']).map(C);
      let placed = 0;
      let tries = 0;
      // faubourgs seulement quand la demande en parle (sinon des maisons isolées dans les champs)
      const outside = /faubourg|hameau|ferme/.test(S.light + S.view) ? Math.min(24, Math.round(target2 * 0.04)) : 0;
      while (placed < target2 && tries < target2 * 60) {
        tries++;
        let x: number;
        let z: number;
        const extra = placed >= target2 - outside && has('roads') && roads[0];
        if (extra) {
          const rd = roads[0]!;
          const p = rd[Math.floor(rr(6, Math.min(rd.length - 1, 90)))]!;
          const s = rnd() < 0.5 ? -1 : 1;
          const off = rr(8, 40);
          x = p.x + R.x * s * off + F.x * rr(-15, 15);
          z = p.z + R.z * s * off + F.z * rr(-15, 15);
          if (Math.hypot(x, z) < RW + 14 || nearWater(x, z, 8)) continue;
        } else {
          const r = Math.sqrt(rnd()) * (RW - 9);
          const th = rnd() * Math.PI * 2;
          x = Math.cos(th) * r;
          z = Math.sin(th) * r;
          if (r > RW - 9) continue;
          const dS = Math.hypot(x - SQ.x, z - SQ.z);
          if (rnd() > 0.35 + 0.65 * Math.exp(-dS / 75)) continue;
        }
        if (inCastle(x, z, 5) || inChurch(x, z, 3)) continue;
        const w = rr(4.6, 7.2);
        const d = rr(6, 10);
        if (!free(x, z, Math.max(w, d) * 0.5)) continue;
        const fl = rnd() < 0.25 ? 1 : rnd() < 0.7 ? 2 : 3;
        // orientation : le long de la rue la plus proche, sinon tournée vers la place
        let ry = Math.atan2(SQ.x - x, SQ.z - z) + Math.PI / 2;
        let best = 14;
        for (const st of streets)
          for (let i = 0; i < st.length - 1; i += 2) {
            const p = st[i]!;
            const dd = Math.hypot(p.x - x, p.z - z);
            if (dd < best) {
              best = dd;
              const q = st[i + 1]!;
              ry = Math.atan2(q.x - p.x, q.z - p.z);
            }
          }
        ry += (rnd() - 0.5) * 0.18;
        let lo = 1e9;
        let hi = -1e9;
        for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          const hx = x + Math.cos(ry) * cx * w * 0.5 + Math.sin(ry) * cz * d * 0.5;
          const hz = z - Math.sin(ry) * cx * w * 0.5 + Math.cos(ry) * cz * d * 0.5;
          const h = Hm(hx, hz);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
        const wallTop = hi + fl * 3.3 + 0.4;
        put(wallsByFloor[fl - 1]!, x, lo - 1.2, z, w, wallTop - lo + 1.2, d, ry, plaster[Math.floor(rnd() * plaster.length)]);
        put(roofs, x, wallTop, z, w * 1.16, w * rr(0.5, 0.75), d * 1.1, ry, roofCols[Math.floor(rnd() * roofCols.length)]);
        blocked.push({ x, z, r: Math.max(w, d) * 0.5 });
        placed++;
      }
      for (const m of [...wallsByFloor, roofs]) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
      (window as unknown as { REALIZE_STATS: Record<string, number> }).REALIZE_STATS = { maisons: placed };
      if (placed) made.add('houses');
    }
  }

  roadD = roads.length ? distGrid(roads, 30) : () => 1e9;
  // ── routes, pont de pierre, charrettes ─────────────────────────────────────────────────────────────────────────
  const dirtMat = new THREE.MeshStandardMaterial({ map: dirtTex, color: C('#e2d2b6'), roughness: 0.96, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const overWater = (p: P2) => nearWater(p.x, p.z, -RIVW * 0.2) && Hm(p.x, p.z) < WL + 1.2;
  for (const rd of roads) ribbon(rd, 4.6, 0.3, dirtMat, overWater);
  if (roads.length) made.add('roads');
  let bridgeAt: { x: number; z: number; ry: number; y: number } | null = null;
  if (river.length && (has('bridge') || roads.length)) {
    // le point où la route principale croise la rivière (sinon le point de la rivière le plus proche de la caméra)
    const rd = roads[0] ?? spline(toW([[300, -40], [420, 140]]), 4);
    let bi = -1;
    let bd = 1e9;
    for (let i = 0; i < rd.length; i++) {
      const d = distTo(river, rd[i]!.x, rd[i]!.z);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    const p = rd[Math.max(0, bi)]!;
    const q = rd[Math.min(rd.length - 1, bi + 2)]!;
    const o = rd[Math.max(0, bi - 2)]!;
    const ry = Math.atan2(q.x - o.x, q.z - o.z);
    let span = 0;
    for (let s = 0; s < 120; s += 1) if (Hm(p.x + Math.sin(ry) * s, p.z + Math.cos(ry) * s) < WL + 1.4) span = s;
    let span2 = 0;
    for (let s = 0; s < 120; s += 1) if (Hm(p.x - Math.sin(ry) * s, p.z - Math.cos(ry) * s) < WL + 1.4) span2 = s;
    const L = (span + span2 + 16) * Math.min(1.3, Math.sqrt(boost('bridge')));
    const cx = p.x + (Math.sin(ry) * (span - span2)) / 2;
    const cz = p.z + (Math.cos(ry) * (span - span2)) / 2;
    const bank = Math.max(Hm(cx + Math.sin(ry) * L * 0.5, cz + Math.cos(ry) * L * 0.5), Hm(cx - Math.sin(ry) * L * 0.5, cz - Math.cos(ry) * L * 0.5), WL + 2);
    const shape = new THREE.Shape();
    const bot = WL - 4;
    const topEnd = bank - WL + 1.2;
    const topMid = topEnd + 4.5;
    shape.moveTo(-L / 2, bot - WL);
    shape.lineTo(L / 2, bot - WL);
    shape.lineTo(L / 2, topEnd);
    shape.quadraticCurveTo(0, topMid + 4.5, -L / 2, topEnd);
    shape.closePath();
    const na = Math.max(2, Math.min(5, Math.round(L / 16)));
    const span0 = L / (na + 0.6);
    for (let k = 0; k < na; k++) {
      const sx = -L / 2 + span0 * 0.3 + span0 * (k + 0.5);
      const ra = span0 * 0.36;
      const hole = new THREE.Path();
      hole.moveTo(sx - ra, bot - WL);
      hole.lineTo(sx - ra, 0.6);
      hole.absarc(sx, 0.6, ra, Math.PI, 0, true);
      hole.lineTo(sx + ra, bot - WL);
      hole.closePath();
      shape.holes.push(hole);
    }
    const bg = new THREE.ExtrudeGeometry(shape, { depth: 7, bevelEnabled: false, curveSegments: 14 });
    bg.translate(0, 0, -3.5);
    bg.rotateY(Math.PI / 2);
    const bm = new THREE.Mesh(bg, stoneMat);
    bm.position.set(cx, WL, cz);
    bm.rotation.y = ry;
    bm.castShadow = bm.receiveShadow = true;
    scene.add(bm);
    bridgeAt = { x: cx, z: cz, ry, y: WL + topMid };
    for (const s of [-0.3, 0.3]) lampSpots.push({ x: cx + Math.sin(ry) * L * s + Math.cos(ry) * 3, z: cz + Math.cos(ry) * L * s - Math.sin(ry) * 3 });
    made.add('bridge');
  }
  const carts: { g: T.Group; road: P2[]; s: number; v: number }[] = [];
  if (roads.length && (has('carts') || has('roads'))) {
    const wood = new THREE.MeshStandardMaterial({ color: C('#6e4c2e'), roughness: 0.9 });
    const hay = new THREE.MeshStandardMaterial({ color: C('#d8b75c'), roughness: 1 });
    const ox = new THREE.MeshStandardMaterial({ color: C('#5b4636'), roughness: 0.9 });
    const n = has('carts') ? S.counts.carts : 3;
    const sz = Math.min(1.8, Math.sqrt(boost('carts'))) * 1.25;
    for (let k = 0; k < n; k++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 3), wood);
      body.position.y = 1.2;
      const load = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 2.4), hay);
      load.position.y = 2.0;
      g.add(body, load);
      for (const s of [-1, 1]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.2, 14), wood);
        wh.rotation.z = Math.PI / 2;
        wh.position.set(s * 1.0, 0.75, 0);
        g.add(wh);
      }
      const animal = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.1, 2.2), ox);
      animal.position.set(0, 1.25, 3.0);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.8), ox);
      head.position.set(0, 1.6, 4.3);
      g.add(animal, head);
      g.scale.setScalar(sz);
      g.traverse((o) => ((o as T.Mesh).castShadow = true));
      scene.add(g);
      const road = roads[k % roads.length]!;
      carts.push({ g, road, s: rnd() * (road.length - 2), v: (rnd() < 0.5 ? -1 : 1) * rr(0.35, 0.6) });
    }
    if (has('carts')) made.add('carts');
  }

  // ── champs de blé qui ondulent (des dizaines de milliers d'épis instanciés, vent calculé par la carte graphique) ─
  if (has('fields')) {
    const ear = tex(64, 64, (g) => {
      g.clearRect(0, 0, 64, 64);
      for (let i = 0; i < 16; i++) {
        const x = 3 + rnd() * 58;
        const top = 6 + rnd() * 14;
        g.strokeStyle = shade([214, 178, 92], 0.8 + rnd() * 0.3);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, 64);
        g.quadraticCurveTo(x + (rnd() - 0.5) * 6, 36, x + (rnd() - 0.5) * 4, top + 8);
        g.stroke();
        g.fillStyle = shade([232, 196, 104], 0.85 + rnd() * 0.25);
        g.beginPath();
        g.ellipse(x, top + 4, 2.4, 6, 0, 0, Math.PI * 2);
        g.fill();
      }
    });
    const planes: T.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++) {
      const p = new THREE.PlaneGeometry(2.2, 1.25);
      p.translate(0, 0.62, 0);
      p.rotateY((k * Math.PI) / 3);
      planes.push(p);
    }
    const tuft = merge(planes);
    const nrm = tuft.attributes.normal as T.BufferAttribute;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    const wmat = new THREE.MeshStandardMaterial({ map: ear, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, color: C(S.season === 'spring' ? '#a7c46a' : '#ffffff') });
    addWind(wmat, 1.25, 0.55, true);
    const max = Math.round(S.counts.wheat * Math.min(1.6, boost('fields')));
    const wheatM = instanced(tuft, wmat, max, false);
    // les parcelles proches de la caméra d'abord (au loin, la couleur du terrain suffit)
    const cand: { x: number; z: number; d: number }[] = [];
    const ext = Math.min(MT0, RW * 5.8);
    for (let x = -ext; x < ext; x += 2.4)
      for (let z = -ext; z < ext; z += 2.4) {
        if (Math.abs(Math.hypot(x, z) - RW * 3.6) > RW * 2.1) continue;
        const jx = x + (hash(Math.round(x * 10), Math.round(z * 10)) - 0.5) * 2;
        const jz = z + (hash(Math.round(z * 10), Math.round(x * 7)) - 0.5) * 2;
        if (parcelKind(jx, jz) !== 'wheat' || nearRoad(jx, jz, 3.4) || nearWater(jx, jz, 5)) continue;
        const dc = Math.hypot(jx - camBase.x, jz - camBase.z);
        if (dc > 270) continue;
        cand.push({ x: jx, z: jz, d: dc });
      }
    cand.sort((a, b) => a.d - b.d);
    const gold = new THREE.Color();
    for (const c of cand.slice(0, max)) {
      gold.setHSL(0.11 + rnd() * 0.02, 0.55, 0.62 + rnd() * 0.12);
      put(wheatM, c.x, Hm(c.x, c.z) - 0.05, c.z, rr(0.85, 1.25), rr(0.85, 1.2), rr(0.85, 1.25), 0, gold);
    }
    wheatM.instanceMatrix.needsUpdate = true;
    if (wheatM.instanceColor) wheatM.instanceColor.needsUpdate = true;
    made.add('fields');
  }

  // ── forêts : des milliers d'arbres (conifères et feuillus), en massifs, jusqu'au pied des montagnes ────────────
  if (!FOREST && !MARS) {
    const nTrees = has('forest') ? Math.round(S.counts.trees * Math.min(1.7, boost('forest'))) : 500;
    const trunkGeo = cylW(0.16, 0.24, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const coneA = new THREE.ConeGeometry(1, 1.6, 8);
    coneA.translate(0, 1.4, 0);
    const coneB = new THREE.ConeGeometry(0.75, 1.3, 8);
    coneB.translate(0, 2.25, 0);
    const conifer = merge([coneA, coneB]);
    const leafy = new THREE.IcosahedronGeometry(1, 1);
    leafy.scale(1, 0.85, 1);
    leafy.translate(0, 1.7, 0);
    const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.92, flatShading: true });
    const conMat = new THREE.MeshStandardMaterial({ roughness: 0.92, flatShading: true });
    addWind(leafMat, 2.6, 0.2, false);
    addWind(conMat, 3.0, 0.12, false);
    const trunks = instanced(trunkGeo, new THREE.MeshStandardMaterial({ color: C('#4b3626'), roughness: 1 }), nTrees);
    const cons = instanced(conifer, conMat, nTrees);
    const leaves = instanced(leafy, leafMat, nTrees);
    const greens = S.season === 'autumn' ? ['#b4542a', '#d08a2e', '#8f3b22', '#c9a23c', '#5d6b2c'] : S.season === 'winter' ? ['#e9eef3', '#c9d6dc', '#3f5a40'] : ['#2f5a2b', '#3d6b30', '#29482a', '#4b7a35', '#355f37'];
    const conCols = S.season === 'winter' ? ['#dfe7ec', '#2c4a33'] : ['#1f4029', '#26502f', '#1a3a25', '#2c5532'];
    let placed = 0;
    let tries = 0;
    const clr = new THREE.Color();
    while (placed < nTrees && tries < nTrees * 30) {
      tries++;
      // anneaux autour de la cité jusqu'aux montagnes ; quelques bosquets de premier plan pour la profondeur
      const fg = rnd() < 0.06;
      const r = fg ? rr(80, 260) : rr(RW * 2, HALF - 80);
      const th = rnd() * Math.PI * 2;
      const x = fg ? camBase.x + Math.cos(th) * r : Math.cos(th) * r;
      const z = fg ? camBase.z + Math.sin(th) * r : Math.sin(th) * r;
      if (Math.abs(x) > HALF - 20 || Math.abs(z) > HALF - 20) continue;
      if (fg) {
        // pas devant l'objectif : seulement sur les côtés du cadre
        const v = { x: x - camBase.x, z: z - camBase.z };
        const ahead = -(v.x * F.x + v.z * F.z);
        const lat = Math.abs(v.x * R.x + v.z * R.z);
        if (ahead > 0 && lat < ahead * 0.5) continue;
      } else if (rnd() > forestAt(x, z)) continue;
      if (nearRoad(x, z, 5) || nearWater(x, z, 6) || parcelKind(x, z) || Math.hypot(x, z) < RW + 30) continue;
      const g = Hm(x, z);
      if (g > 300 || slopeAt(x, z) > 1.2) continue;
      const s = rr(3.4, 6.2) * (1 + 0.25 * fbm(x * 0.01, z * 0.01));
      const coniferous = g > 160 || rnd() < 0.5;
      put(trunks, x, g - 0.4, z, s, s * (coniferous ? 1.1 : 1.3), s);
      if (coniferous) put(cons, x, g - 0.4, z, s * rr(0.85, 1.1), s * rr(1.1, 1.5), s * rr(0.85, 1.1), rnd() * 6, clr.set(conCols[Math.floor(rnd() * conCols.length)]!));
      else put(leaves, x, g - 0.4, z, s * rr(1.0, 1.35), s * rr(0.9, 1.2), s * rr(1.0, 1.35), rnd() * 6, clr.set(greens[Math.floor(rnd() * greens.length)]!).offsetHSL(0, 0, (rnd() - 0.5) * 0.06));
      placed++;
    }
    for (const m of [trunks, cons, leaves]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    const st = (window as unknown as { REALIZE_STATS?: Record<string, number> }).REALIZE_STATS ?? {};
    (window as unknown as { REALIZE_STATS: Record<string, number> }).REALIZE_STATS = { ...st, arbres: placed };
    if (has('forest') && placed) made.add('forest');
  }

  // ── moulin, barques ─────────────────────────────────────────────────────────────────────────────────────────────
  let blades: T.Group | null = null;
  if (has('windmill')) {
    const p = Wk(380, -230);
    const g = Hm(p.x, p.z);
    const tw = new THREE.Mesh(cylW(2.6, 4.2, 15, 12), new THREE.MeshStandardMaterial({ color: C('#efe6d4'), roughness: 0.9 }));
    tw.position.set(p.x, g + 7, p.z);
    tw.castShadow = true;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.4, 4.5, 12), new THREE.MeshStandardMaterial({ color: C('#7b3d2c') }));
    cap.position.set(p.x, g + 16.6, p.z);
    blades = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 9, 0.15), new THREE.MeshStandardMaterial({ color: C('#d9cdb4') }));
      b.position.y = 4.8;
      const arm = new THREE.Group();
      arm.rotation.z = (k * Math.PI) / 2;
      arm.add(b);
      blades.add(arm);
    }
    blades.position.set(p.x + F.x * 3.4, g + 14.5, p.z + F.z * 3.4);
    blades.rotation.y = Math.atan2(F.x, F.z);
    scene.add(tw, cap, blades);
    made.add('windmill');
  }
  const boats: { m: T.Mesh; a: number; r: number; v: number }[] = [];
  if (has('boats') && LAKE) {
    for (let k = 0; k < 6; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 4.2), new THREE.MeshStandardMaterial({ color: C('#5b3b22') }));
      scene.add(m);
      boats.push({ m, a: rnd() * 6.28, r: rr(20, LAKE.r * 0.7), v: rr(0.02, 0.05) });
    }
    made.add('boats');
  }

  // ── lanternes (allumées au crépuscule), bannières au vent ───────────────────────────────────────────────────────
  if (lampSpots.length && (has('lanterns') || has('streets'))) {
    const post = instanced(cylW(0.12, 0.14, 1, 6), new THREE.MeshStandardMaterial({ color: C('#2a2420'), roughness: 0.7 }), lampSpots.length, false);
    const head = instanced(new THREE.BoxGeometry(0.6, 0.75, 0.6), new THREE.MeshStandardMaterial({ color: C('#3a2a18'), emissive: C('#ffc46b'), emissiveIntensity: 0.4 + LOOK.lamp * 2.2 }), lampSpots.length, false);
    const glowPos: number[] = [];
    for (const l of lampSpots) {
      const g = Hm(l.x, l.z);
      put(post, l.x, g + 1.9, l.z, 1, 3.8, 1);
      put(head, l.x, g + 4.0, l.z, 1, 1, 1);
      glowPos.push(l.x, g + 4.0, l.z);
    }
    post.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    if (LOOK.lamp > 0) {
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(glowPos), 3));
      const glow = new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTex, size: 9 * Math.min(1.6, boost('lanterns')), sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: C('#ffc068'), opacity: Math.min(1, 0.55 + LOOK.lamp * 0.35) }));
      scene.add(glow);
      for (let k = 0; k < 4 && city; k++) {
        const th = (k / 4) * Math.PI * 2 + 0.4;
        const pl = new THREE.PointLight(C('#ffb35c'), 160 * LOOK.lamp, 46, 2);
        pl.position.set(SQ.x + Math.cos(th) * 18, Hm(SQ.x, SQ.z) + 6, SQ.z + Math.sin(th) * 18);
        scene.add(pl);
      }
    }
    if (has('lanterns')) made.add('lanterns');
  }
  const flags: { geo: T.BufferGeometry; base: Float32Array; ph: number; long: boolean }[] = [];
  if (flagSpots.length && (has('banners') || has('castle'))) {
    const fb = Math.min(1.8, Math.sqrt(boost('banners')));
    const emblem = (bg: string) =>
      tex(128, 80, (g) => {
        g.fillStyle = bg;
        g.fillRect(0, 0, 128, 80);
        g.fillStyle = '#e8c45a';
        g.beginPath();
        g.moveTo(64, 14);
        g.lineTo(80, 40);
        g.lineTo(64, 66);
        g.lineTo(48, 40);
        g.closePath();
        g.fill();
        g.fillRect(0, 0, 128, 5);
      });
    const red = new THREE.MeshStandardMaterial({ map: emblem('#a3172c'), side: THREE.DoubleSide, roughness: 0.7 });
    const blue = new THREE.MeshStandardMaterial({ map: emblem('#1d3d8f'), side: THREE.DoubleSide, roughness: 0.7 });
    const pole = new THREE.MeshStandardMaterial({ color: C('#2b2622') });
    flagSpots.forEach((f, k) => {
      const s = f.s * fb;
      if (f.long) {
        const geo = new THREE.PlaneGeometry(4.4 * s, 15 * s, 4, 12);
        geo.translate(0, -7.5 * s, 0);
        const m = new THREE.Mesh(geo, red);
        m.position.set(f.x, f.y, f.z);
        m.rotation.y = (f.ry ?? 0) + Math.PI / 2;
        scene.add(m);
        flags.push({ geo, base: Float32Array.from(geo.attributes.position!.array as Float32Array), ph: k, long: true });
        return;
      }
      const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7 * s, 5), pole);
      pm.position.set(f.x, f.y + 3.5 * s, f.z);
      scene.add(pm);
      const geo = new THREE.PlaneGeometry(7 * s, 4.2 * s, 14, 4);
      geo.translate(3.5 * s, 0, 0);
      const m = new THREE.Mesh(geo, k % 3 === 2 ? blue : red);
      m.position.set(f.x, f.y + 5.2 * s, f.z);
      m.rotation.y = Math.atan2(F.z, -F.x) + 0.5; // le vent souffle de gauche à droite de l'image
      m.castShadow = true;
      scene.add(m);
      flags.push({ geo, base: Float32Array.from(geo.attributes.position!.array as Float32Array), ph: k, long: false });
    });
    if (has('banners')) made.add('banners');
  }

  // ── habitants (marché animé) ────────────────────────────────────────────────────────────────────────────────────
  const people: { x: number; z: number; r: number; a: number; v: number }[] = [];
  let bodies: T.InstancedMesh | null = null;
  let heads: T.InstancedMesh | null = null;
  if (city && (has('market') || has('crowd'))) {
    const n = S.counts.people;
    bodies = instanced(cylW(0.3, 0.42, 1.5, 7), new THREE.MeshStandardMaterial({ roughness: 0.9 }), n, false);
    heads = instanced(new THREE.SphereGeometry(0.26, 8, 6), new THREE.MeshStandardMaterial({ color: C('#b88a68'), roughness: 0.8 }), n, false);
    const cloth = ['#7a2e2a', '#2f4a6e', '#5d6b2c', '#8a6a3a', '#4a3a5e', '#a5774a', '#dcd2bc'].map(C);
    for (let k = 0; k < n; k++) {
      const th = rnd() * Math.PI * 2;
      const r0 = rr(3, SQR - 3);
      people.push({ x: SQ.x + Math.cos(th) * r0, z: SQ.z + Math.sin(th) * r0, r: rr(0.6, 2.6), a: rnd() * 6.28, v: rr(0.2, 0.6) * (rnd() < 0.5 ? -1 : 1) });
      bodies.setColorAt(k, cloth[k % cloth.length]!);
    }
    bodies.count = heads.count = n;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    if (has('crowd')) made.add('crowd');
  }

  // ── nuages, oiseaux, étoiles, halo du soleil ────────────────────────────────────────────────────────────────────
  const clouds: T.Sprite[] = [];
  if (has('clouds') || (S.time !== 'night' && !MARS)) {
    const ctex = tex(256, 128, (g) => {
      g.clearRect(0, 0, 256, 128);
      for (let i = 0; i < 26; i++) {
        const x = 40 + rnd() * 176;
        const y = 50 + rnd() * 40 - Math.abs(x - 128) * 0.12;
        const r = 18 + rnd() * 26;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,.8)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    });
    const n = has('clouds') ? Math.round(S.counts.clouds * Math.min(1.6, boost('clouds'))) : 4;
    const tint = S.time === 'sunset' ? '#ffc0a0' : S.time === 'dawn' ? '#ffd6c8' : '#ffffff';
    for (let k = 0; k < n; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex, color: C(tint), transparent: true, depthWrite: false, opacity: 0.92, fog: false }));
      const d = rr(1300, 2600);
      const lat = rr(-0.75, 0.75) * d * 0.6;
      const el = (rr(5, 11) * Math.PI) / 180;
      sp.position.set(camBase.x - F.x * d + R.x * lat, camBase.y + Math.tan(el) * d * Math.min(1.3, boost('clouds')), camBase.z - F.z * d + R.z * lat);
      const w = rr(320, 640) * Math.min(1.5, boost('clouds'));
      sp.scale.set(w, w * 0.42, 1);
      scene.add(sp);
      clouds.push(sp);
    }
    if (has('clouds')) made.add('clouds');
  }
  const flock: { cx: number; cz: number; r: number; a: number; v: number; y: number; ph: number; s: number }[] = [];
  let wingL: T.InstancedMesh | null = null;
  let wingR: T.InstancedMesh | null = null;
  if (has('birds')) {
    const n = Math.round(S.counts.birds * Math.min(1.5, boost('birds')));
    const tri = (s: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.35, 0, 0, -0.45, s * 1.25, 0.05, -0.1]), 3));
      g.computeVertexNormals();
      return g;
    };
    const bmat = new THREE.MeshBasicMaterial({ color: C(S.time === 'night' ? '#c9d3e8' : '#2b211b'), side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    wingL = instanced(tri(-1), bmat, n, false);
    wingR = instanced(tri(1), bmat, n, false);
    wingL.count = wingR.count = n;
    const bs = Math.min(2.2, boost('birds'));
    for (let k = 0; k < n; k++) {
      // deux vols : un grand cercle lent au-dessus de la cité, un vol plus proche de la caméra
      const near = k % 3 === 0;
      flock.push({
        cx: near ? camBase.x - F.x * 260 : 0,
        cz: near ? camBase.z - F.z * 260 : 0,
        r: near ? rr(40, 90) : rr(70, 190),
        a: rnd() * 6.28,
        v: rr(0.05, 0.11) * (k % 2 ? 1 : -1),
        y: camBase.y + (near ? rr(-10, 40) : rr(10, 110)),
        ph: rnd() * 6.28,
        s: (near ? 1.6 : 3.0) * bs,
      });
    }
    made.add('birds');
  }
  if (S.time === 'night') {
    const sp: number[] = [];
    for (let k = 0; k < 2500; k++) {
      const u = rnd() * 2 - 1;
      const th = rnd() * 6.28;
      const y = Math.abs(u) * 0.9 + 0.05;
      const r = Math.sqrt(1 - y * y);
      sp.push(Math.cos(th) * r * 5000, y * 5000, Math.sin(th) * r * 5000);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sp), 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: C('#dfe6ff'), size: 1.6, sizeAttenuation: false, fog: false })));
  }
  if (S.time !== 'day') {
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: C(LOOK.glow), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: S.time === 'night' ? 0.35 : 0.85 }));
    halo.position.copy(camBase).addScaledVector(sunDir, 4200);
    halo.scale.setScalar(S.time === 'night' ? 500 : 1500);
    scene.add(halo);
  }

  // ── animations des univers (appelées à chaque image) ───────────────────────────────────────────────────────
  const tickers: ((t: number, dt: number) => void)[] = [];
  const softTex = tex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,.9)');
    gr.addColorStop(0.5, 'rgba(255,255,255,.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
  const nearView = (ahead0: number, ahead1: number, spread: number) => {
    const d = rr(ahead0, ahead1);
    const lat = (rnd() - 0.5) * 2 * d * spread;
    const x = camBase.x - F.x * d + R.x * lat;
    const z = camBase.z - F.z * d + R.z * lat;
    return { x, z, y: Hm(x, z) };
  };

  // ── FORÊT MAGIQUE : arbres géants, fougères, rayons, lucioles, cristaux, brume, cascades, cerfs, créatures ──────
  if (FOREST) {
    const barkTex = tex(128, 256, (g) => {
      g.fillStyle = '#5a4636';
      g.fillRect(0, 0, 128, 256);
      for (let i = 0; i < 90; i++) {
        g.strokeStyle = shade([92, 74, 58], 0.6 + rnd() * 0.8);
        g.lineWidth = 1 + rnd() * 3;
        const x = rnd() * 128;
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + (rnd() - 0.5) * 20, 80, x + (rnd() - 0.5) * 20, 170, x + (rnd() - 0.5) * 10, 256);
        g.stroke();
      }
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `rgba(80,120,50,${0.15 + rnd() * 0.25})`;
        g.fillRect(rnd() * 128, 180 + rnd() * 76, 3, 2);
      }
    });
    barkTex.repeat.set(1, 1);
    const n = Math.round(S.counts.trees * Math.min(1.6, boost('giant_trees')));
    const trunkG = new THREE.CylinderGeometry(0.62, 1, 1, 12, 1, true);
    trunkG.translate(0, 0.5, 0);
    const rootG = new THREE.ConeGeometry(1, 1, 9, 1, true);
    rootG.translate(0, 0.5, 0);
    const crownG = new THREE.IcosahedronGeometry(1, 2);
    crownG.scale(1, 0.5, 1);
    const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95, side: THREE.DoubleSide });
    const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    addWind(leafMat, 0.6, 0.05, false, 0.55);
    const trunks = instanced(trunkG, barkMat, n);
    const roots = instanced(rootG, barkMat, n);
    const crowns = instanced(crownG, leafMat, n * 2);
    const leafCols = (S.mood === 'fairy' ? ['#2f6b3a', '#3c7d45', '#2a5a36', '#4a8a4a', '#5b8d3a'] : ['#2f5a2b', '#3d6b30', '#29482a']).map(C);
    let placed = 0;
    for (let tries = 0; placed < n && tries < n * 30; tries++) {
      // densité plus forte dans le champ de la caméra, clairière autour d'elle
      const p = rnd() < 0.55 ? nearView(30, 700, 0.75) : { x: rr(-HALF * 0.7, HALF * 0.7), z: rr(-HALF * 0.7, HALF * 0.7), y: 0 };
      const dc = Math.hypot(p.x - camBase.x, p.z - camBase.z);
      if (dc < 22 || waterD(p.x, p.z) < RIVW * 2.6) continue;
      const rT = rr(1.3, 3.2) * (dc < 120 ? 1.15 : 1);
      if (!free(p.x, p.z, rT * 4)) continue;
      blocked.push({ x: p.x, z: p.z, r: rT * 4 });
      const g = Hm(p.x, p.z);
      const h = rr(38, 78) * (rT / 2.2);
      const ry = rnd() * 6.28;
      put(trunks, p.x, g - 1, p.z, rT, h, rT, ry);
      put(roots, p.x, g - 1, p.z, rT * 2.3, rT * 3.2, rT * 2.3, ry);
      const cr = rr(9, 17) * (rT / 2.2);
      put(crowns, p.x + rr(-2, 2), g + h * 0.96, p.z + rr(-2, 2), cr, cr, cr, ry, leafCols[Math.floor(rnd() * leafCols.length)]);
      put(crowns, p.x + rr(-4, 4), g + h * 0.78, p.z + rr(-4, 4), cr * 0.75, cr * 0.75, cr * 0.75, ry + 1, leafCols[Math.floor(rnd() * leafCols.length)]);
      placed++;
    }
    for (const m of [trunks, roots, crowns]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    (window as unknown as { REALIZE_STATS: Record<string, number> }).REALIZE_STATS = { 'arbres géants': placed };
    made.add('giant_trees');
    made.add('moss');
    // fougères au premier plan (vent)
    const fernTex = tex(128, 128, (g) => {
      g.clearRect(0, 0, 128, 128);
      for (let f = 0; f < 7; f++) {
        const a = -Math.PI / 2 + (f - 3) * 0.32;
        g.strokeStyle = shade([90, 150, 70], 0.7 + rnd() * 0.5);
        g.lineWidth = 2;
        const L = 50 + rnd() * 14;
        g.beginPath();
        g.moveTo(64, 128);
        const ex = 64 + Math.cos(a) * L;
        const ey = 128 + Math.sin(a) * L;
        g.quadraticCurveTo(64 + Math.cos(a) * L * 0.5, 128 + Math.sin(a) * L * 0.7, ex, ey);
        g.stroke();
        for (let l = 0; l < 12; l++) {
          const k = l / 12;
          const px = 64 + (ex - 64) * k;
          const py = 128 + (ey - 128) * k;
          g.beginPath();
          g.ellipse(px - 4, py, 5 * (1 - k * 0.6), 1.6, a + 0.6, 0, Math.PI * 2);
          g.ellipse(px + 4, py, 5 * (1 - k * 0.6), 1.6, a - 0.6, 0, Math.PI * 2);
          g.fillStyle = shade([96, 160, 72], 0.7 + rnd() * 0.5);
          g.fill();
        }
      }
    });
    const fernG = merge([0, 1, 2].map((k) => {
      const pl = new THREE.PlaneGeometry(1.6, 1.4);
      pl.translate(0, 0.7, 0);
      pl.rotateY((k * Math.PI) / 3);
      return pl;
    }));
    const fn = fernG.attributes.normal as T.BufferAttribute;
    for (let i = 0; i < fn.count; i++) fn.setXYZ(i, 0, 1, 0);
    const fernMat = new THREE.MeshStandardMaterial({ map: fernTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });
    addWind(fernMat, 1.4, 0.25, false, 0.5);
    const ferns = instanced(fernG, fernMat, 7000, false);
    for (let k = 0; k < 7000; k++) {
      const p = nearView(4, 260, 0.9);
      if (waterD(p.x, p.z) < RIVW * 1.4) continue;
      const s2 = rr(0.9, 2.2);
      put(ferns, p.x, p.y - 0.1, p.z, s2, s2, s2, rnd() * 6.28);
    }
    ferns.instanceMatrix.needsUpdate = true;
    // l'eau des ruisseaux : un ruban qui suit le lit ; là où il plonge, la cascade (écume animée)
    if (river.length) {
      const wPos: number[] = [];
      const wUv: number[] = [];
      const wIdx: number[] = [];
      let len = 0;
      for (let i = 0; i < river.length; i++) {
        const p = river[i]!;
        const q = river[Math.min(river.length - 1, i + 1)]!;
        const o = river[Math.max(0, i - 1)]!;
        if (i) len += Math.hypot(p.x - o.x, p.z - o.z);
        const dx = q.x - o.x;
        const dz = q.z - o.z;
        const l = Math.hypot(dx, dz) || 1;
        for (const sd of [-1, 1]) {
          const x = p.x + (-dz / l) * sd * RIVW * 1.15;
          const z = p.z + (dx / l) * sd * RIVW * 1.15;
          wPos.push(x, Hm(p.x, p.z) + 1.4, z);
          wUv.push(sd < 0 ? 0 : 1, len / 10);
        }
        if (i) wIdx.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2);
      }
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
      wg.setAttribute('uv', new THREE.Float32BufferAttribute(wUv, 2));
      wg.setIndex(wIdx);
      wg.computeVertexNormals();
      const flowU = { value: 0 };
      const wm = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uT: flowU, deep: { value: C('#2e6a66') }, foam: { value: C('#f2fbff') } },
        vertexShader: 'varying vec2 vUv; varying float vSteep; void main(){ vUv = uv; vSteep = 1.0 - normal.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: [
          'uniform float uT; uniform vec3 deep; uniform vec3 foam; varying vec2 vUv; varying float vSteep;',
          'float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
          'float n(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }',
          'void main(){',
          '  float speed = 1.0 + vSteep * 14.0;',
          '  float ripple = n(vec2(vUv.x * 6.0, vUv.y * 3.0 - uT * speed)) * 0.6 + n(vec2(vUv.x * 14.0, vUv.y * 9.0 - uT * speed * 1.7)) * 0.4;',
          '  float fall = smoothstep(0.18, 0.5, vSteep);',
          '  vec3 c = mix(deep, foam, clamp(fall * (0.55 + ripple * 0.6) + ripple * 0.18, 0.0, 1.0));',
          '  float edge = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);',
          '  gl_FragColor = vec4(c, (0.55 + 0.4 * fall) * edge);',
          '}',
        ].join('\n'),
      });
      scene.add(new THREE.Mesh(wg, wm));
      tickers.push((t) => (flowU.value = t));
      made.add('streams');
      made.add('waterfalls');
    }
    // rayons de lumière à travers la canopée (cônes additifs alignés sur le soleil)
    const rayMat = new THREE.MeshBasicMaterial({ map: softTex, color: C('#ffe2a8'), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const rays: T.Mesh[] = [];
    for (let k = 0; k < 34; k++) {
      const p = nearView(25, 420, 0.7);
      const len = rr(70, 130);
      const g = new THREE.CylinderGeometry(rr(2, 5), rr(5, 11), len, 12, 1, true);
      g.translate(0, len / 2, 0);
      const m = new THREE.Mesh(g, rayMat.clone());
      m.position.set(p.x, p.y, p.z);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunDir.clone().setY(Math.max(0.35, sunDir.y)).normalize());
      scene.add(m);
      rays.push(m);
    }
    tickers.push((t) => rays.forEach((m, i) => ((m.material as T.MeshBasicMaterial).opacity = 0.1 + 0.07 * Math.sin(t * 0.3 + i))));
    made.add('god_rays');
    // lucioles qui flottent et clignotent
    if (has('fireflies') || S.mood === 'fairy') {
      const nf = 900;
      const base = new Float32Array(nf * 3);
      const pos = new Float32Array(nf * 3);
      for (let k = 0; k < nf; k++) {
        const p = nearView(3, 160, 0.9);
        base.set([p.x, p.y + rr(0.6, 7), p.z], k * 3);
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const ff = new THREE.Points(fg, new THREE.PointsMaterial({ map: softTex, color: C('#d9ff8a'), size: 0.9, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      ff.frustumCulled = false;
      scene.add(ff);
      tickers.push((t) => {
        for (let k = 0; k < nf; k++) {
          pos[k * 3] = base[k * 3]! + Math.sin(t * 0.4 + k) * 1.6;
          pos[k * 3 + 1] = base[k * 3 + 1]! + Math.sin(t * 0.7 + k * 1.7) * 0.8;
          pos[k * 3 + 2] = base[k * 3 + 2]! + Math.cos(t * 0.35 + k * 0.6) * 1.6;
        }
        fg.attributes.position!.needsUpdate = true;
        (ff.material as T.PointsMaterial).opacity = 0.75 + 0.25 * Math.sin(t * 2.1);
      });
      made.add('fireflies');
    }
    // cristaux lumineux qui sortent du sol
    if (has('crystals') || S.mood === 'fairy') {
      const cg = new THREE.OctahedronGeometry(1, 0);
      cg.scale(0.45, 1.6, 0.45);
      cg.translate(0, 1.2, 0);
      const cm = new THREE.MeshStandardMaterial({ color: C('#7fe0ff'), emissive: C('#4ab8ff'), emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 });
      const crystals = instanced(cg, cm, 400, false);
      const tints = ['#7fe0ff', '#c38bff', '#8affc8'].map(C);
      for (let c = 0; c < 60; c++) {
        const p = nearView(10, 330, 0.8);
        if (waterD(p.x, p.z) < RIVW * 1.6) continue;
        const col = tints[c % 3]!;
        for (let k = 0; k < 2 + Math.floor(rnd() * 5); k++) {
          const s2 = rr(0.5, 1.6);
          dummy.position.set(p.x + rr(-1.5, 1.5), p.y - 0.4, p.z + rr(-1.5, 1.5));
          dummy.rotation.set(rr(-0.4, 0.4), rnd() * 6, rr(-0.4, 0.4));
          dummy.scale.set(s2, s2 * rr(0.8, 1.8), s2);
          dummy.updateMatrix();
          crystals.setMatrixAt(crystals.count, dummy.matrix);
          crystals.setColorAt(crystals.count++, col);
        }
      }
      crystals.instanceMatrix.needsUpdate = true;
      if (crystals.instanceColor) crystals.instanceColor.needsUpdate = true;
      tickers.push((t) => (cm.emissiveIntensity = 1.3 + 0.5 * Math.sin(t * 1.3)));
      made.add('crystals');
    }
    // brume matinale qui se déplace lentement entre les arbres
    const mists: T.Sprite[] = [];
    for (let k = 0; k < 46; k++) {
      const p = nearView(15, 520, 0.8);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: C('#e8f2e0'), transparent: true, opacity: 0.16, depthWrite: false }));
      sp.position.set(p.x, p.y + rr(2, 9), p.z);
      sp.scale.set(rr(50, 120), rr(10, 22), 1);
      scene.add(sp);
      mists.push(sp);
    }
    tickers.push((_t, dt) => mists.forEach((m, i) => m.position.addScaledVector(R as unknown as T.Vector3, 0) && (m.position.x += R.x * dt * (0.8 + (i % 3) * 0.3), m.position.z += R.z * dt * (0.8 + (i % 3) * 0.3))));
    made.add('mist');
    // cerfs (silhouettes low-poly qui broutent) et créatures lumineuses
    if (has('deer')) {
      const fur = new THREE.MeshStandardMaterial({ color: C('#8a5a36'), roughness: 0.9 });
      const herd: { g: T.Group; head: T.Object3D; ph: number }[] = [];
      for (let k = 0; k < 7; k++) {
        const p = nearView(30, 160, 0.6);
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 1.7), fur);
        body.position.y = 1.25;
        g.add(body);
        for (const [lx, lz] of [[-0.25, 0.65], [0.25, 0.65], [-0.25, -0.65], [0.25, -0.65]] as const) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), fur);
          leg.position.set(lx, 0.5, lz);
          g.add(leg);
        }
        const neck = new THREE.Group();
        neck.position.set(0, 1.5, 0.75);
        const nk = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.8, 0.3), fur);
        nk.position.y = 0.35;
        nk.rotation.x = 0.35;
        const hd = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.55), fur);
        hd.position.set(0, 0.8, 0.22);
        const antl = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.6, 4), new THREE.MeshStandardMaterial({ color: C('#d8c8a8') }));
        antl.position.set(0.12, 1.15, 0.1);
        const antr = antl.clone();
        antr.position.x = -0.12;
        neck.add(nk, hd, antl, antr);
        g.add(neck);
        g.position.set(p.x, p.y, p.z);
        g.rotation.y = rnd() * 6.28;
        g.scale.setScalar(1.3);
        scene.add(g);
        herd.push({ g, head: neck, ph: rnd() * 10 });
      }
      // brouter : la tête descend et remonte, à des rythmes différents
      tickers.push((t) => herd.forEach((d) => (d.head.rotation.x = 0.9 * Math.max(0, Math.sin(t * 0.35 + d.ph)))));
      made.add('deer');
    }
    if (has('creatures') || S.mood === 'fairy') {
      const wisps: { sp: T.Sprite; c: { x: number; y: number; z: number }; ph: number }[] = [];
      for (let k = 0; k < 16; k++) {
        const p = nearView(12, 140, 0.7);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: C(k % 2 ? '#9fe8ff' : '#e2a8ff'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        sp.scale.setScalar(1.6);
        scene.add(sp);
        wisps.push({ sp, c: { x: p.x, y: p.y + 3, z: p.z }, ph: rnd() * 10 });
      }
      tickers.push((t) =>
        wisps.forEach((w) => w.sp.position.set(w.c.x + Math.sin(t * 0.5 + w.ph) * 5, w.c.y + Math.sin(t * 0.9 + w.ph) * 1.5, w.c.z + Math.cos(t * 0.4 + w.ph * 2) * 5)),
      );
      made.add('creatures');
    }
  }

  // ── COLONIE MARTIENNE : dômes, cités, pistes, rovers, serres, panneaux solaires, spatioport, fusées, tempêtes ────
  if (MARS) {
    const glass = new THREE.MeshStandardMaterial({ color: C('#d8ecff'), roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2.2 });
    const ribs = new THREE.MeshBasicMaterial({ color: C('#d9d2c8'), wireframe: true, transparent: true, opacity: 0.35 });
    const domes: { x: number; z: number; r: number }[] = [];
    const nd = Math.max(1, Math.min(9, S.counts.houses));
    for (let k = 0; k < nd; k++) {
      const a = (k / nd) * Math.PI * 2 + 0.4;
      const rd = k === 0 ? 0 : rr(150, 300);
      const r = k === 0 ? 120 : rr(55, 95);
      domes.push({ x: Math.cos(a) * rd, z: Math.sin(a) * rd, r });
    }
    const bld = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: C('#e9e4dc'), emissiveMap: windowTex, emissive: C('#ffffff'), emissiveIntensity: 0.6, map: timberTex, roughness: 0.6 }), 4000);
    const park = new THREE.MeshStandardMaterial({ color: C('#4f8a3a'), roughness: 0.9 });
    for (const d of domes) {
      const g = Hm(d.x, d.z);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(d.r, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), glass);
      dome.position.set(d.x, g - 1, d.z);
      scene.add(dome);
      const frame = new THREE.Mesh(new THREE.SphereGeometry(d.r * 1.002, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), ribs);
      frame.position.copy(dome.position);
      scene.add(frame);
      const base = new THREE.Mesh(new THREE.TorusGeometry(d.r, 2.2, 8, 64), new THREE.MeshStandardMaterial({ color: C('#bdb6ac'), roughness: 0.6, metalness: 0.4 }));
      base.rotation.x = Math.PI / 2;
      base.position.set(d.x, g, d.z);
      scene.add(base);
      const lawn = new THREE.Mesh(new THREE.CircleGeometry(d.r * 0.98, 48), park);
      lawn.rotation.x = -Math.PI / 2;
      lawn.position.set(d.x, g + 0.25, d.z);
      scene.add(lawn);
      // une ville entière sous le dôme : plus haute au centre
      for (let k = 0; k < Math.round(d.r * 1.6); k++) {
        const rr0 = Math.sqrt(rnd()) * d.r * 0.82;
        const th = rnd() * 6.28;
        const hmax = Math.sqrt(Math.max(0, d.r * d.r - rr0 * rr0)) * 0.78;
        const h = Math.min(hmax, rr(6, 28) * (1.4 - rr0 / d.r));
        if (h < 4) continue;
        put(bld, d.x + Math.cos(th) * rr0, g, d.z + Math.sin(th) * rr0, rr(5, 11), h, rr(5, 11), rnd() * 3);
      }
    }
    bld.instanceMatrix.needsUpdate = true;
    made.add('domes');
    // pistes rouges entre les dômes et le spatioport, rovers qui y roulent
    const PORT = W(-260, 320);
    const trackPts = [domes[0]!, ...domes.slice(1), { x: PORT.x, z: PORT.z, r: 0 }].map((d) => ({ x: d.x, z: d.z }));
    const tracks = trackPts.slice(1).map((p) => spline([trackPts[0]!, { x: (p.x + trackPts[0]!.x) / 2 + rr(-40, 40), z: (p.z + trackPts[0]!.z) / 2 + rr(-40, 40) }, p], 4));
    const trackMat = new THREE.MeshStandardMaterial({ map: dirtTex, color: C('#b0603a'), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    for (const tr of tracks) ribbon(tr, 7, 0.3, trackMat);
    made.add('tracks');
    const rovers: { g: T.Group; tr: P2[]; s: number; v: number }[] = [];
    const roverMat = new THREE.MeshStandardMaterial({ color: C('#e8e2d6'), roughness: 0.4, metalness: 0.5 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: C('#2a2624') });
    for (let k = 0; k < 10; k++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 5.5), roverMat);
      body.position.y = 1.8;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 2), new THREE.MeshStandardMaterial({ color: C('#88b8d8'), roughness: 0.1, metalness: 0.6 }));
      cab.position.set(0, 3, 1.3);
      g.add(body, cab);
      for (const z of [-1.8, 0, 1.8])
        for (const x of [-1.7, 1.7]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.6, 12), wheelMat);
          w.rotation.z = Math.PI / 2;
          w.position.set(x, 0.75, z);
          g.add(w);
        }
      scene.add(g);
      const tr = tracks[k % tracks.length]!;
      rovers.push({ g, tr, s: rnd() * (tr.length - 2), v: (rnd() < 0.5 ? -1 : 1) * rr(1.2, 2.2) });
    }
    tickers.push((_t, dt) =>
      rovers.forEach((r) => {
        r.s += r.v * dt * 3;
        if (r.s < 0 || r.s > r.tr.length - 2) r.v = -r.v;
        r.s = Math.max(0, Math.min(r.tr.length - 2.001, r.s));
        const i = Math.floor(r.s);
        const p = r.tr[i]!;
        const q = r.tr[i + 1]!;
        const k = r.s - i;
        const x = lerp(p.x, q.x, k);
        const z = lerp(p.z, q.z, k);
        r.g.position.set(x, Hm(x, z), z);
        r.g.rotation.y = Math.atan2(q.x - p.x, q.z - p.z) + (r.v < 0 ? Math.PI : 0);
      }),
    );
    made.add('rovers');
    // fermes hydroponiques : tunnels de culture éclairés
    const farm = W(150, -260);
    const tunnelMat = new THREE.MeshStandardMaterial({ color: C('#cfe8d0'), emissive: C('#6aff8a'), emissiveIntensity: 0.55, transparent: true, opacity: 0.75, roughness: 0.3, side: THREE.DoubleSide });
    for (let row = 0; row < 5; row++)
      for (let c = 0; c < 7; c++) {
        const x = farm.x + R.x * (c - 3) * 13 + F.x * row * 28;
        const z = farm.z + R.z * (c - 3) * 13 + F.z * row * 28;
        const tn = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 24, 16, 1, true, 0, Math.PI), tunnelMat);
        tn.rotation.set(0, Math.atan2(F.x, F.z), Math.PI / 2);
        tn.rotation.order = 'YXZ';
        tn.position.set(x, Hm(x, z), z);
        scene.add(tn);
      }
    made.add('hydroponics');
    // champs de panneaux solaires jusqu'à l'horizon
    const solarG = new THREE.BoxGeometry(4, 0.15, 2.2);
    const solar = instanced(solarG, new THREE.MeshStandardMaterial({ color: C('#1c2a48'), roughness: 0.15, metalness: 0.85, envMapIntensity: 1.6 }), 9000, false);
    const tilt = Math.atan2(sunDir.y, Math.hypot(sunDir.x, sunDir.z));
    for (let k = 0; k < 9000; k++) {
      const u = (k % 90) - 45;
      const v = Math.floor(k / 90);
      const x = W(-520 - v * 6, u * 5.2).x;
      const z = W(-520 - v * 6, u * 5.2).z;
      const g = Hm(x, z);
      dummy.position.set(x, g + 1.2, z);
      dummy.rotation.set(Math.PI / 2 - tilt - Math.PI / 2 + 0.6, Math.atan2(sunDir.x, sunDir.z), 0, 'YXZ');
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      solar.setMatrixAt(solar.count++, dummy.matrix);
    }
    solar.instanceMatrix.needsUpdate = true;
    made.add('solar');
    // spatioport : pas de tir, tours de service, fusées ; l'une décolle régulièrement
    const portMat = new THREE.MeshStandardMaterial({ color: C('#9a948a'), roughness: 0.8 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 1, 48), portMat);
    pad.position.set(PORT.x, Hm(PORT.x, PORT.z) + 0.3, PORT.z);
    scene.add(pad);
    const rocketMat = new THREE.MeshStandardMaterial({ color: C('#eeeae2'), roughness: 0.35, metalness: 0.4 });
    const mkRocket = () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 46, 20), rocketMat);
      body.position.y = 23;
      const nose = new THREE.Mesh(new THREE.ConeGeometry(3.4, 10, 20), rocketMat);
      nose.position.y = 51;
      g.add(body, nose);
      for (let f = 0; f < 4; f++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9, 4), new THREE.MeshStandardMaterial({ color: C('#2a2f3a') }));
        fin.position.set(Math.cos((f * Math.PI) / 2) * 3.6, 4.5, Math.sin((f * Math.PI) / 2) * 3.6);
        fin.rotation.y = -(f * Math.PI) / 2;
        g.add(fin);
      }
      return g;
    };
    const rockets: T.Group[] = [];
    for (let k = 0; k < 3; k++) {
      const r = mkRocket();
      const x = PORT.x + R.x * (k - 1) * 40;
      const z = PORT.z + R.z * (k - 1) * 40;
      r.position.set(x, Hm(x, z) + 0.8, z);
      scene.add(r);
      rockets.push(r);
      const tower = new THREE.Mesh(boxW(5, 62, 5), portMat);
      tower.position.set(x + F.x * 9, Hm(x, z) + 31, z + F.z * 9);
      scene.add(tower);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(3, 26, 16, 1, true), new THREE.MeshBasicMaterial({ color: C('#ffb04a'), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    flame.rotation.x = Math.PI;
    const plume: { sp: T.Sprite; age: number }[] = [];
    for (let k = 0; k < 60; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: C('#e8d6c4'), transparent: true, opacity: 0, depthWrite: false }));
      scene.add(sp);
      plume.push({ sp, age: k * 0.18 });
    }
    const launcher = rockets[1]!;
    const pad0 = launcher.position.clone();
    launcher.add(flame);
    flame.position.y = -11;
    tickers.push((t, dt) => {
      const cycle = 30;
      const u = t % cycle;
      const lift = u < 4 ? 0 : 0.5 * 6 * (u - 4) ** 2; // accélération ≈ 6 m/s²
      launcher.position.set(pad0.x, pad0.y + lift, pad0.z);
      flame.visible = u > 2 && lift < 4000;
      flame.scale.setScalar(0.85 + 0.25 * Math.sin(t * 40));
      for (const p of plume) {
        p.age += dt;
        if (p.age > 6) p.age = 0;
        const k = p.age / 6;
        if (u > 2 && u < 22) {
          p.sp.position.set(pad0.x + Math.sin(p.age * 3) * 8 * k, pad0.y + Math.min(lift, 260) * (1 - k) + k * 30, pad0.z + Math.cos(p.age * 2) * 8 * k);
          p.sp.scale.setScalar(10 + k * 70);
          (p.sp.material as T.SpriteMaterial).opacity = 0.35 * (1 - k);
        } else (p.sp.material as T.SpriteMaterial).opacity = 0;
      }
    });
    made.add('spaceport');
    made.add('rockets');
    // tempêtes de poussière : nappes ocre qui balaient l'horizon
    const dust: T.Sprite[] = [];
    for (let k = 0; k < 18; k++) {
      const p = nearView(700, 1800, 0.9);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: C('#c88a5e'), transparent: true, opacity: 0.32, depthWrite: false }));
      sp.position.set(p.x, p.y + rr(30, 120), p.z);
      sp.scale.set(rr(400, 900), rr(120, 260), 1);
      scene.add(sp);
      dust.push(sp);
    }
    tickers.push((t, dt) => {
      dust.forEach((d, i) => {
        d.position.x += R.x * dt * (12 + i);
        d.position.z += R.z * dt * (12 + i);
        (d.material as T.SpriteMaterial).opacity = 0.18 + 0.16 * Math.sin(t * 0.08 + i);
      });
      (scene.fog as T.FogExp2).density = 0.00029 * (0.7 + S.fog) * (1 + 0.6 * Math.max(0, Math.sin(t * 0.05)));
    });
    made.add('dust_storm');
    made.add('red_sky');
  }

  // ── contrôles, mouvement de caméra de cinéma, boucle ────────────────────────────────────────────────────────────
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 40;
  controls.maxDistance = 2200;
  let auto = true;
  controls.addEventListener('start', () => (auto = false));
  const camR = Math.hypot(camBase.x - target.x, camBase.z - target.z);
  const camA0 = Math.atan2(camBase.z - target.z, camBase.x - target.x);
  const cap = document.getElementById('cap');
  if (cap) {
    const st = (window as unknown as { REALIZE_STATS?: Record<string, number> }).REALIZE_STATS ?? {};
    const parts = [st.maisons ? `${st.maisons} maisons` : '', st.arbres ? `${st.arbres.toLocaleString('fr-FR')} arbres` : '', flock.length ? `${flock.length} oiseaux` : ''].filter(Boolean);
    cap.textContent = `✨ JEV · scène instantanée — ${parts.join(' · ')} — glisser pour tourner`;
  }
  // Post-production de cinéma : halo (soleil, eau, lanternes), étalonnage chaud / ombres froides, vignettage, grain.
  let composer: EC | null = null;
  let grade: SPass | null = null;
  if (PP) {
    try {
      composer = new PP.EffectComposer(renderer);
      composer.addPass(new PP.RenderPass(scene, camera));
      const night = S.time === 'night';
      composer.addPass(new PP.UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), night ? 0.6 : 0.24, 0.7, night ? 0.55 : 0.86));
      grade = new PP.ShaderPass({
        uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uWarm: { value: night ? -0.6 : S.time === 'day' ? 0.35 : 1 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: [
          'uniform sampler2D tDiffuse; uniform float uTime; uniform float uWarm; varying vec2 vUv;',
          'void main(){',
          '  vec4 c = texture2D(tDiffuse, vUv);',
          '  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));',
          '  vec3 warm = vec3(1.07, 1.0, 0.88); vec3 cool = vec3(0.9, 0.97, 1.1);',
          '  vec3 split = mix(cool, warm, smoothstep(0.04, 0.55, l));',
          '  c.rgb *= mix(vec3(1.0), uWarm >= 0.0 ? split : cool, abs(uWarm));',
          '  vec2 d = vUv - 0.5; c.rgb *= 1.0 - dot(d, d) * 0.85;',
          '  float n = fract(sin(dot(vUv * (1.0 + fract(uTime)), vec2(12.9898, 78.233))) * 43758.5453);',
          '  c.rgb += (n - 0.5) * 0.01;',
          '  gl_FragColor = c;',
          '}',
        ].join('\n'),
      });
      composer.addPass(grade);
      composer.addPass(new PP.OutputPass());
    } catch {
      composer = null;
    }
  }
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer?.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  const t0 = performance.now();
  const buildMs = Math.round(t0 - tStart);
  let firstFrameMs = 0;
  let last = t0;
  let frames = 0;
  let slow = 0;
  const flap = new THREE.Euler();
  const frame = () => {
    const now = performance.now();
    const t = (now - t0) / 1000;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    windU.uTime.value = t;
    if (auto) {
      const a = camA0 + 0.1 * Math.sin(t * 0.045);
      camera.position.set(target.x + Math.cos(a) * camR, camBase.y + 6 * Math.sin(t * 0.07), target.z + Math.sin(a) * camR);
      camera.lookAt(target);
      controls.target.copy(target);
    } else controls.update();
    sky.position.copy(camera.position);
    if (waterNormal) waterNormal.offset.set(t * 0.004, t * 0.0027);
    for (const f of flags) {
      const p = f.geo.attributes.position as T.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const bx = f.base[i * 3]!;
        const by = f.base[i * 3 + 1]!;
        if (f.long) p.setZ(i, Math.sin(by * 0.5 + t * 2.2 + f.ph) * 0.35 * (-by / 15));
        else p.setZ(i, Math.sin(bx * 0.9 - t * (5 + 3 * S.wind) + f.ph) * 0.55 * (bx / 7) * (0.6 + S.wind));
      }
      p.needsUpdate = true;
      f.geo.computeVertexNormals();
    }
    for (const c of carts) {
      c.s += c.v * dt * 4;
      if (c.s < 0 || c.s > c.road.length - 2) c.v = -c.v;
      c.s = Math.max(0, Math.min(c.road.length - 2.001, c.s));
      const i = Math.floor(c.s);
      const k = c.s - i;
      const p = c.road[i]!;
      const q = c.road[i + 1]!;
      const x = lerp(p.x, q.x, k);
      const z = lerp(p.z, q.z, k);
      const onBridge = bridgeAt && Math.hypot(x - bridgeAt.x, z - bridgeAt.z) < 30 && Hm(x, z) < WL + 2;
      c.g.position.set(x, onBridge && bridgeAt ? bridgeAt.y : Hm(x, z) + 0.2, z);
      c.g.rotation.y = Math.atan2(q.x - p.x, q.z - p.z) + (c.v < 0 ? Math.PI : 0);
    }
    if (bodies && heads) {
      for (let k = 0; k < people.length; k++) {
        const pp = people[k]!;
        pp.a += pp.v * dt;
        const x = pp.x + Math.cos(pp.a) * pp.r;
        const z = pp.z + Math.sin(pp.a) * pp.r;
        const g = Hm(x, z) + 0.34;
        dummy.position.set(x, g + 0.75 + Math.abs(Math.sin(t * 6 + k)) * 0.06, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bodies.setMatrixAt(k, dummy.matrix);
        dummy.position.y += 1.0;
        dummy.updateMatrix();
        heads.setMatrixAt(k, dummy.matrix);
      }
      bodies.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
    }
    if (wingL && wingR) {
      for (let k = 0; k < flock.length; k++) {
        const b = flock[k]!;
        const a = b.a + b.v * t;
        dummy.position.set(b.cx + Math.cos(a) * b.r, b.y + Math.sin(t * 0.4 + b.ph) * 5, b.cz + Math.sin(a) * b.r);
        const yaw = -a + (b.v > 0 ? 0 : Math.PI);
        const fl = Math.sin(t * 6.5 + b.ph) * 0.6;
        dummy.scale.setScalar(b.s);
        flap.set(0, yaw, fl, 'YXZ');
        dummy.rotation.copy(flap);
        dummy.updateMatrix();
        wingR.setMatrixAt(k, dummy.matrix);
        flap.set(0, yaw, -fl, 'YXZ');
        dummy.rotation.copy(flap);
        dummy.updateMatrix();
        wingL.setMatrixAt(k, dummy.matrix);
      }
      wingL.instanceMatrix.needsUpdate = true;
      wingR.instanceMatrix.needsUpdate = true;
    }
    for (let k = 0; k < clouds.length; k++) {
      const c = clouds[k]!;
      c.position.x += R.x * dt * (4 + k % 3);
      c.position.z += R.z * dt * (4 + k % 3);
    }
    if (blades) blades.children.forEach((a) => (a.rotation.z += dt * 0.6));
    for (const tk of tickers) tk(t, dt);
    for (const b of boats) {
      b.a += b.v * dt;
      if (LAKE) b.m.position.set(LAKE.x + Math.cos(b.a) * b.r, WL + 0.2, LAKE.z + Math.sin(b.a) * b.r);
      b.m.rotation.y = -b.a;
    }
    if (composer) {
      if (grade) grade.uniforms.uTime!.value = t;
      composer.render(dt);
    } else renderer.render(scene, camera);
    if (!frames) firstFrameMs = Math.round(performance.now() - now);
    // l'ombre de la cité est calculée une fois (elle ne bouge pas) ; qualité adaptée à la machine
    if (frames === 2) renderer.shadowMap.autoUpdate = false;
    frames++;
    if (frames > 4 && frames < 40 && dt > 0.05) slow++;
    if (slow === 12 && PR > 0.8) {
      PR = Math.max(0.75, PR * 0.7);
      renderer.setPixelRatio(PR);
      composer?.setPixelRatio(PR);
      resize();
      // redessiner tout de suite : un redimensionnement vide l'image (une capture ne doit jamais tomber sur du noir)
      if (composer) composer.render(0);
      else renderer.render(scene, camera);
      slow++;
    }
    requestAnimationFrame(frame);
  };
  frame();
  const ld = document.getElementById('load');
  if (ld) {
    ld.style.opacity = '0';
    setTimeout(() => ld.remove(), 700);
  }
  // Ce qui est réellement dessiné, déclaré au bac à sable (contrôle de fidélité) et à l'œil de JEV.
  (window as unknown as { REALIZE_ELEMENTS: string[] }).REALIZE_ELEMENTS = S.elements.filter((e) => made.has(e.comp)).map((e) => e.name);
  (window as unknown as { __scene: unknown }).__scene = { renderer, scene, camera, heightAt: Hm, made: [...made], buildMs, firstFrameMs: () => firstFrameMs, frames: () => frames };
}
