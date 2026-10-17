/**
 * CALQUES DE LA MARIONNETTE — how a single still becomes a 2.5D scene, like the layered rigs of animation studios:
 *  - a colour MATTE per character (pixels far from the background palette sampled around it, plus the head / body cores),
 *    feathered so its edge is soft;
 *  - a clean BACKGROUND PLATE: the characters are removed and the holes filled by push-pull diffusion of the
 *    surrounding colours;
 * then the renderer draws the plate still and only the character layers deformed on top — the background never bends,
 * no streak is left where a character moved. Pure functions over RGBA buffers (no DOM), tested in Node.
 */
export type Box = { x: number; y: number; w: number; h: number };
export interface MatteCharacter {
  box: Box;
  head: Box;
  body: Box;
  arms?: { shoulder: { x: number; y: number }; hand: { x: number; y: number } }[];
}
/** Distance from a point to the arm segments of a character (image fractions). */
const armDist = (c: MatteCharacter, x: number, y: number) =>
  Math.min(
    Infinity,
    ...(c.arms ?? []).map((a) => {
      const vx = a.hand.x - a.shoulder.x;
      const vy = a.hand.y - a.shoulder.y;
      const t = clamp(((x - a.shoulder.x) * vx + (y - a.shoulder.y) * vy) / (vx * vx + vy * vy || 1e-9), 0, 1);
      return Math.hypot(x - a.shoulder.x - vx * t, y - a.shoulder.y - vy * t);
    }),
  );
/** The region a character can occupy: its box grown to include its hands. */
export function reachBox(c: MatteCharacter): Box {
  let x0 = c.box.x;
  let y0 = c.box.y;
  let x1 = c.box.x + c.box.w;
  let y1 = c.box.y + c.box.h;
  for (const a of c.arms ?? []) {
    x0 = Math.min(x0, a.hand.x - 0.03);
    x1 = Math.max(x1, a.hand.x + 0.03);
    y0 = Math.min(y0, a.hand.y - 0.04);
    y1 = Math.max(y1, a.hand.y + 0.04);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Separable box blur of a float map (radius r), in place. */
export function boxBlur(m: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return m;
  const tmp = new Float32Array(m.length);
  const d = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += m[y * w + clamp(x, 0, w - 1)]!;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / d;
      acc += m[y * w + clamp(x + r + 1, 0, w - 1)]! - m[y * w + clamp(x - r, 0, w - 1)]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x]!;
    for (let y = 0; y < h; y++) {
      m[y * w + x] = acc / d;
      acc += tmp[clamp(y + r + 1, 0, h - 1) * w + x]! - tmp[clamp(y - r, 0, h - 1) * w + x]!;
    }
  }
  return m;
}

/** Background palette: colours sampled on a ring just outside the character's box (not on another character). */
export function backgroundPalette(src: Uint8ClampedArray, w: number, h: number, c: MatteCharacter, others: MatteCharacter[]): number[][] {
  const rb = reachBox(c);
  const ring = { x: rb.x - c.box.w * 0.08, y: rb.y - c.box.h * 0.05, w: rb.w + c.box.w * 0.16, h: rb.h + c.box.h * 0.1 };
  const bins = new Map<string, { col: number[]; n: number }>();
  let total = 0;
  const add = (fx: number, fy: number) => {
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
    if (others.some((o) => fx > o.box.x && fx < o.box.x + o.box.w && fy > o.box.y && fy < o.box.y + o.box.h)) return;
    // Never sample on an arm (an outstretched arm leaves the box: its skin is not background).
    if ([c, ...others].some((o) => armDist(o, fx, fy) < 0.05)) return;
    const i = (Math.round(fy * (h - 1)) * w + Math.round(fx * (w - 1))) * 4;
    const col = [src[i]!, src[i + 1]!, src[i + 2]!];
    const key = col.map((v) => v >> 4).join(',');
    const b = bins.get(key);
    if (b) b.n++;
    else bins.set(key, { col, n: 1 });
    total++;
  };
  for (let k = 0; k <= 64; k++) {
    const u = k / 64;
    add(ring.x + ring.w * u, ring.y);
    add(ring.x + ring.w * u, ring.y + ring.h);
    add(ring.x, ring.y + ring.h * u);
    add(ring.x + ring.w, ring.y + ring.h * u);
  }
  // Keep the colours seen at least twice (a stray hand / prop crossing the ring is dropped).
  return [...bins.values()].filter((b) => b.n >= 2 || total < 40).map((b) => b.col);
}

/** Soft alpha matte (0..1, full image size) of one character. */
export function characterMatte(src: Uint8ClampedArray, w: number, h: number, c: MatteCharacter, others: MatteCharacter[] = [], plate?: Uint8ClampedArray): Float32Array {
  return characterLayer(src, w, h, c, others, plate).alpha;
}
/**
 * The cut-out of one character: its matte, and for each arm whether the matte really covers it (an arm lost in the
 * background must not move: its hand alone would float away).
 */
export function characterLayer(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  c: MatteCharacter,
  others: MatteCharacter[] = [],
  /** The same shot without the characters: difference matting (exact, whatever the colours). */
  plate?: Uint8ClampedArray,
): { alpha: Float32Array; armsOk: boolean[] } {
  const m = new Float32Array(w * h);
  /** Colour distance to the background palette (kept for the head / arm priors). */
  const dist = new Float32Array(w * h);
  const bg = backgroundPalette(src, w, h, c, others);
  const rb = reachBox(c);
  const x0 = Math.max(0, Math.floor((rb.x - c.box.w * 0.06) * w));
  const x1 = Math.min(w - 1, Math.ceil((rb.x + rb.w + c.box.w * 0.06) * w));
  const y0 = Math.max(0, Math.floor((rb.y - c.box.h * 0.04) * h));
  const y1 = Math.min(h - 1, Math.ceil((rb.y + rb.h + c.box.h * 0.04) * h));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (plate) {
        // Difference with the clean plate (generated pictures differ slightly everywhere: a margin absorbs it).
        dist[i] = Math.hypot(src[i * 4]! - plate[i * 4]!, src[i * 4 + 1]! - plate[i * 4 + 1]!, src[i * 4 + 2]! - plate[i * 4 + 2]!);
        const v = (dist[i]! - 26) / 30;
        m[i] = v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);
        continue;
      }
      if (!bg.length) {
        m[i] = 1;
        continue;
      }
      const r = src[i * 4]!;
      const g = src[i * 4 + 1]!;
      const b = src[i * 4 + 2]!;
      let best = Infinity;
      for (const q of bg) {
        const d = (r - q[0]!) ** 2 + (g - q[1]!) ** 2 + (b - q[2]!) ** 2;
        if (d < best) best = d;
      }
      dist[i] = Math.sqrt(best);
      const v = (dist[i]! - 20) / 34;
      m[i] = v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);
    }
  // Close small holes / remove speckles.
  boxBlur(m, w, h, 2);
  for (let i = 0; i < m.length; i++) m[i] = clamp((m[i]! - 0.3) / 0.4, 0, 1);
  // Fill the enclosed holes (parts of the character whose colour looks like the background, e.g. a grey shirt on a grey
  // wall): everything not reachable from the box border through background pixels belongs to the character.
  const reach = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return;
    const i = y * w + x;
    if (reach[i] || m[i]! >= 0.5) return;
    reach[i] = 1;
    stack.push(i);
  };
  for (let x = x0; x <= x1; x++) {
    push(x, y0);
    push(x, y1);
  }
  for (let y = y0; y <= y1; y++) {
    push(x0, y);
    push(x1, y);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!reach[y * w + x] && m[y * w + x]! < 0.5) m[y * w + x] = 1;
  // Head prior: the face often sits on a background of a close colour (dark doorway behind dark skin) — the inner
  // ellipse of the head box is always the character.
  // Only where the colour matte failed (< half of the head ellipse found) and with a weaker colour test.
  const hx = (c.head.x + c.head.w / 2) * w;
  const hy = (c.head.y + c.head.h / 2) * h;
  const hrx = c.head.w * w * 0.38;
  const hry = c.head.h * h * 0.42;
  let hon = 0, hn = 0;
  const inHead: number[] = [];
  for (let y = Math.max(0, Math.floor(hy - hry)); y <= Math.min(h - 1, hy + hry); y++)
    for (let x = Math.max(0, Math.floor(hx - hrx)); x <= Math.min(w - 1, hx + hrx); x++)
      if (((x - hx) / hrx) ** 2 + ((y - hy) / hry) ** 2 <= 1) {
        const i = y * w + x;
        inHead.push(i);
        hn++;
        if (m[i]! >= 0.5) hon++;
      }
  if (hn && hon / hn < 0.5) for (const i of inHead) if (dist[i]! > 8) m[i] = 1;
  // Arm prior: a capsule along each arm, weaker colour test (thin limbs are easily lost by the blur).
  for (const a of c.arms ?? []) {
    const rad = Math.max(3, c.box.w * w * 0.07);
    const ax = a.shoulder.x * w;
    const ay = a.shoulder.y * h;
    const vx = a.hand.x * w - ax;
    const vy = a.hand.y * h - ay;
    const L2 = vx * vx + vy * vy || 1;
    for (let y = Math.max(0, Math.floor(Math.min(ay, ay + vy) - rad)); y <= Math.min(h - 1, Math.max(ay, ay + vy) + rad); y++)
      for (let x = Math.max(0, Math.floor(Math.min(ax, ax + vx) - rad)); x <= Math.min(w - 1, Math.max(ax, ax + vx) + rad); x++) {
        const t = clamp(((x - ax) * vx + (y - ay) * vy) / L2, 0, 1);
        if (Math.hypot(x - ax - vx * t, y - ay - vy * t) <= rad && dist[y * w + x]! > 14) m[y * w + x] = Math.max(m[y * w + x]!, 1);
      }
  }
  // Keep only the parts connected to the head or the body (drops shadows / specks of the floor, floating hands).
  const keep = new Uint8Array(w * h);
  const seeds: number[] = [];
  const seed = (fx: number, fy: number) => {
    const x = Math.round(fx * (w - 1));
    const y = Math.round(fy * (h - 1));
    const i = y * w + x;
    if (x >= 0 && y >= 0 && x < w && y < h && m[i]! >= 0.5 && !keep[i]) {
      keep[i] = 1;
      seeds.push(i);
    }
  };
  seed(c.head.x + c.head.w / 2, c.head.y + c.head.h / 2);
  for (let k = 1; k < 8; k++) seed(c.body.x + c.body.w / 2, c.body.y + (c.body.h * k) / 8);
  while (seeds.length) {
    const i = seeds.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
      const j = ny * w + nx;
      if (!keep[j] && m[j]! >= 0.5) {
        keep[j] = 1;
        seeds.push(j);
      }
    }
  }
  // An arm is « cut » when its hand is connected to the body in the matte (otherwise the hand alone would float away:
  // the arm then stays in the background and does not move).
  const armsOk = (c.arms ?? []).map((a) => {
    const hx = Math.round(a.hand.x * (w - 1));
    const hy = Math.round(a.hand.y * (h - 1));
    for (let dy = -10; dy <= 10; dy += 2) for (let dx = -10; dx <= 10; dx += 2) if (keep[clamp(hy + dy, 0, h - 1) * w + clamp(hx + dx, 0, w - 1)]) return true;
    return false;
  });
  for (let i = 0; i < m.length; i++) if (!keep[i]) m[i] = 0;
  return { alpha: boxBlur(m, w, h, 1), armsOk };
}

/**
 * Push-pull inpainting: the pixels where hole ≥ 0.5 are rebuilt from the surrounding colours (multi-scale weighted
 * average), giving a smooth plausible background behind the characters.
 */
export function inpaint(src: Uint8ClampedArray, w: number, h: number, hole: Float32Array): Uint8ClampedArray {
  type Lv = { w: number; h: number; c: Float32Array; a: Float32Array };
  const base: Lv = { w, h, c: new Float32Array(w * h * 3), a: new Float32Array(w * h) };
  for (let i = 0; i < w * h; i++) {
    const a = hole[i]! >= 0.5 ? 0 : 1;
    base.a[i] = a;
    for (let k = 0; k < 3; k++) base.c[i * 3 + k] = src[i * 4 + k]! * a;
  }
  const levels: Lv[] = [base];
  while (levels.at(-1)!.w > 2 || levels.at(-1)!.h > 2) {
    const p = levels.at(-1)!;
    const nw = Math.max(1, Math.ceil(p.w / 2));
    const nh = Math.max(1, Math.ceil(p.h / 2));
    const n: Lv = { w: nw, h: nh, c: new Float32Array(nw * nh * 3), a: new Float32Array(nw * nh) };
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const j = (y >> 1) * nw + (x >> 1);
        const i = y * p.w + x;
        n.a[j] = n.a[j]! + p.a[i]!;
        for (let k = 0; k < 3; k++) n.c[j * 3 + k] = n.c[j * 3 + k]! + p.c[i * 3 + k]!;
      }
    // Normalise to « premultiplied colour with coverage ≤ 1 ».
    for (let j = 0; j < nw * nh; j++) {
      const a = n.a[j]!;
      if (a > 0) {
        const s = Math.min(1, a) / a;
        for (let k = 0; k < 3; k++) n.c[j * 3 + k] = n.c[j * 3 + k]! * s;
        n.a[j] = Math.min(1, a);
      }
    }
    levels.push(n);
    if (nw === 1 && nh === 1) break;
  }
  for (let l = levels.length - 2; l >= 0; l--) {
    const p = levels[l]!;
    const q = levels[l + 1]!;
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const i = y * p.w + x;
        const a = p.a[i]!;
        if (a >= 1) continue;
        // Bilinear sample of the coarser level (no blocks).
        const fx = clamp((x + 0.5) / 2 - 0.5, 0, q.w - 1);
        const fy = clamp((y + 0.5) / 2 - 0.5, 0, q.h - 1);
        const ax = Math.floor(fx);
        const ay = Math.floor(fy);
        const bx = Math.min(q.w - 1, ax + 1);
        const by = Math.min(q.h - 1, ay + 1);
        const tx = fx - ax;
        const ty = fy - ay;
        const col = (jx: number, jy: number, k: number) => {
          const j = jy * q.w + jx;
          return q.c[j * 3 + k]! / (q.a[j]! || 1e-6);
        };
        for (let k = 0; k < 3; k++) {
          const v = (col(ax, ay, k) * (1 - tx) + col(bx, ay, k) * tx) * (1 - ty) + (col(ax, by, k) * (1 - tx) + col(bx, by, k) * tx) * ty;
          p.c[i * 3 + k] = p.c[i * 3 + k]! + (1 - a) * v;
        }
        p.a[i] = 1;
      }
  }
  const out = new Uint8ClampedArray(src);
  for (let i = 0; i < w * h; i++)
    if (hole[i]! >= 0.5) for (let k = 0; k < 3; k++) out[i * 4 + k] = base.c[i * 3 + k]!;
  return out;
}

/** The hole of the plate: union of the mattes, grown a few pixels so no character edge stays in the background. */
export function plateHole(mattes: Float32Array[], w: number, h: number, grow = 4): Float32Array {
  const u = new Float32Array(w * h);
  for (const m of mattes) for (let i = 0; i < u.length; i++) u[i] = Math.max(u[i]!, m[i]! > 0.1 ? 1 : 0);
  boxBlur(u, w, h, grow);
  for (let i = 0; i < u.length; i++) u[i] = u[i]! > 0.02 ? 1 : 0;
  return u;
}
