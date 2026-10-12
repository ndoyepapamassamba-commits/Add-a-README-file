/**
 * PLANCHES DE PERSONNAGES — the owner's own character sheets (Pixar-like art on a green screen, one character in
 * several poses: neutral, accusing, shocked, shrugging, laughing) become the ACTORS of the film: each pose is cut out
 * (chroma key + spill removal), separated from the others, labelled, and played in the montage (pose of the line,
 * mouth that talks, the chute). Pure part: masks, pose boxes, labels, mouth position.
 */
import { plain } from './cast3d';

export type PoseKind = 'neutre' | 'accuse' | 'choc' | 'haussement' | 'rire';
/** Order of the sheets of the account: neutral, pointing (angry), hands on the cheeks (shock), palms open, bent laughing. */
export const POSE_ORDER: PoseKind[] = ['neutre', 'accuse', 'choc', 'haussement', 'rire'];
export const POSE_LABEL: Record<PoseKind, string> = { neutre: 'Neutre', accuse: 'Accuse / colère', choc: 'Choc', haussement: 'Haussement d’épaules', rire: 'Fou rire' };

/** Is this pixel the green screen? (bright, green clearly above red and blue). */
export const isGreen = (r: number, g: number, b: number) => g > 90 && g > r * 1.28 && g > b * 1.28;
/** Foreground mask (1 = character) of an RGBA picture on a green screen. */
export function chromaMask(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = isGreen(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!) ? 0 : 1;
  return m;
}
/**
 * Removes the green screen from the cut-out in place, like a compositing keyer: a SOFT matte from the green excess
 * (hair and edges keep their partial coverage, no jagged outline), the green of the screen un-mixed from the edge
 * pixels, and the spill (green reflected on skin, hair, fabric edges) pulled back — while the character's own greens
 * (a green t-shirt, olive trousers: little green excess) stay opaque and untouched.
 */
export function keyOut(rgba: Uint8ClampedArray, w: number, h: number): void {
  // The screen colour: median of the clearly green pixels.
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let i = 0; i < w * h; i += 7) {
    const r = rgba[i * 4]!;
    const g = rgba[i * 4 + 1]!;
    const b = rgba[i * 4 + 2]!;
    if (isGreen(r, g, b) && g - Math.max(r, b) > 60) {
      rs.push(r);
      gs.push(g);
      bs.push(b);
    }
  }
  const med = (a: number[], d: number) => (a.length ? a.sort((x, y) => x - y)[a.length >> 1]! : d);
  const kr = med(rs, 30);
  const kg = med(gs, 230);
  const kb = med(bs, 30);
  const kE = Math.max(60, kg - Math.max(kr, kb));
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4]!;
    const g = rgba[i * 4 + 1]!;
    const b = rgba[i * 4 + 2]!;
    const e = g - Math.max(r, b);
    // Matte: opaque under 25 % of the screen's green excess, transparent above 80 %.
    const t = Math.min(1, Math.max(0, (e / kE - 0.25) / 0.55));
    const a = isGreen(r, g, b) && e > kE * 0.8 ? 0 : 1 - t * t * (3 - 2 * t);
    if (a <= 0.02) {
      rgba[i * 4 + 3] = 0;
      continue;
    }
    let R = r;
    let G = g;
    let B = b;
    if (a < 0.999) {
      // Un-mix the screen from the edge pixel: c = (p − (1 − a)·key) / a.
      R = (r - (1 - a) * kr) / a;
      G = (g - (1 - a) * kg) / a;
      B = (b - (1 - a) * kb) / a;
    }
    // Spill: an edge pixel or a clearly green-tinted one is pulled back to the max of red and blue.
    const lim = Math.max(R, B);
    if (G > lim && (a < 0.999 || e > kE * 0.18)) G = lim + (G - lim) * 0.15;
    rgba[i * 4] = Math.max(0, Math.min(255, Math.round(R)));
    rgba[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(G)));
    rgba[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(B)));
    rgba[i * 4 + 3] = Math.round(a * 255);
  }
}
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
/**
 * The figures of the sheet, left to right: connected parts of the mask (on a 1/`k` grid), the small ones (a strand
 * of hair, a hand) joined to the figure they overlap horizontally the most.
 */
export function poseBoxes(mask: Uint8Array, w: number, h: number, k = 4): Box[] {
  const gw = Math.ceil(w / k);
  const gh = Math.ceil(h / k);
  const grid = new Uint8Array(gw * gh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) grid[Math.floor(y / k) * gw + Math.floor(x / k)] = 1;
  const label = new Int32Array(gw * gh).fill(-1);
  const comps: (Box & { n: number })[] = [];
  const stack: number[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i] || label[i]! >= 0) continue;
    const id = comps.length;
    const c = { x0: gw, y0: gh, x1: 0, y1: 0, n: 0 };
    label[i] = id;
    stack.push(i);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % gw;
      const y = (p - x) / gw;
      c.n++;
      c.x0 = Math.min(c.x0, x);
      c.x1 = Math.max(c.x1, x);
      c.y0 = Math.min(c.y0, y);
      c.y1 = Math.max(c.y1, y);
      for (const q of [x > 0 ? p - 1 : -1, x < gw - 1 ? p + 1 : -1, y > 0 ? p - gw : -1, y < gh - 1 ? p + gw : -1])
        if (q >= 0 && grid[q] && label[q]! < 0) {
          label[q] = id;
          stack.push(q);
        }
    }
    comps.push(c);
  }
  const total = comps.reduce((a, c) => a + c.n, 0);
  const big = comps.filter((c) => c.n >= total * 0.04 && c.y1 - c.y0 >= gh * 0.25).map((c) => ({ ...c }));
  for (const c of comps) {
    if (big.includes(c) || c.n < 3) continue;
    // A detached piece goes to the figure it overlaps horizontally the most (or the nearest one).
    let best: (typeof big)[number] | null = null;
    let score = -Infinity;
    for (const b of big) {
      const ov = Math.min(b.x1, c.x1) - Math.max(b.x0, c.x0);
      const s = ov >= 0 ? ov : -Math.min(Math.abs(b.x0 - c.x1), Math.abs(c.x0 - b.x1)) * 4;
      if (s > score) {
        score = s;
        best = b;
      }
    }
    if (best && score > -gw * 0.05 * 4) {
      best.x0 = Math.min(best.x0, c.x0);
      best.x1 = Math.max(best.x1, c.x1);
      best.y0 = Math.min(best.y0, c.y0);
      best.y1 = Math.max(best.y1, c.y1);
    }
  }
  return big
    .sort((a, b) => a.x0 - b.x0)
    .map((b) => ({ x0: Math.max(0, b.x0 * k - k), y0: Math.max(0, b.y0 * k - k), x1: Math.min(w, (b.x1 + 2) * k), y1: Math.min(h, (b.y1 + 2) * k) }));
}
/**
 * The poses of a SHEET whose figures touch (an arm, a wide dress): n poses side by side → cut at the emptiest column
 * near each n-th of the width, then the tight box of each slice.
 */
export function columnBoxes(mask: Uint8Array, w: number, h: number, n = 5): Box[] {
  const prof = new Float64Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) prof[x] = prof[x]! + mask[y * w + x]!;
  const cuts = [0];
  for (let k = 1; k < n; k++) {
    const t = Math.round((w * k) / n);
    const r = Math.round(w / n / 2.6);
    let best = t;
    for (let x = Math.max(1, t - r); x < Math.min(w - 1, t + r); x++) if (prof[x]! < prof[best]!) best = x;
    cuts.push(best);
  }
  cuts.push(w);
  const out: Box[] = [];
  for (let k = 0; k < n; k++) {
    const x0 = cuts[k]!;
    const x1 = cuts[k + 1]!;
    let bx0 = x1;
    let bx1 = x0;
    let by0 = h;
    let by1 = 0;
    for (let y = 0; y < h; y++)
      for (let x = x0; x < x1; x++)
        if (mask[y * w + x]) {
          if (x < bx0) bx0 = x;
          if (x > bx1) bx1 = x;
          if (y < by0) by0 = y;
          if (y > by1) by1 = y;
        }
    if (bx1 > bx0 && by1 > by0) out.push({ x0: bx0, y0: by0, x1: bx1 + 1, y1: by1 + 1 });
  }
  return out;
}
/** The poses of a sheet: separate figures when they are; the 5-column cut of the account's sheets when some touch. */
export function sheetBoxes(mask: Uint8Array, w: number, h: number): Box[] {
  const b = poseBoxes(mask, w, h);
  if (b.length >= 5 || w / h < 1.3) return b;
  const c = columnBoxes(mask, w, h, 5);
  return c.length === 5 ? c : b;
}
/** Tight box of the mask inside a rectangle (null when empty). */
function tightBox(mask: Uint8Array, w: number, x0: number, x1: number, y0: number, y1: number): Box | null {
  let bx0 = x1;
  let bx1 = x0;
  let by0 = y1;
  let by1 = y0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (mask[y * w + x]) {
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        if (y > by1) by1 = y;
      }
  return bx1 > bx0 && by1 > by0 ? { x0: bx0, y0: by0, x1: bx1 + 1, y1: by1 + 1 } : null;
}
/** Smoothed profile (moving average over 2r+1). */
function smooth(a: Float64Array, r: number): Float64Array {
  const o = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, i - r); k <= Math.min(a.length - 1, i + r); k++) {
      s += a[k]!;
      n++;
    }
    o[i] = s / n;
  }
  return o;
}
/**
 * The figures of a GALLERY whose characters touch (an arm on the neighbour, a selfie stick): rows split on the empty
 * bands, then each row cut at the valleys of its column profile (where only an arm crosses), in reading order.
 */
export function galleryBoxes(mask: Uint8Array, w: number, h: number): Box[] {
  const rowP = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) s += mask[y * w + x]!;
    rowP[y] = s;
  }
  // Rows: runs of lines with figure pixels, separated by (nearly) empty bands.
  const bands: [number, number][] = [];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    const full = y < h && rowP[y]! > w * 0.004;
    if (full && start < 0) start = y;
    if (!full && start >= 0) {
      if (y - start > h * 0.12) bands.push([start, y]);
      else if (bands.length && start - bands.at(-1)![1] < h * 0.02) bands.at(-1)![1] = y;
      start = -1;
    }
  }
  const out: Box[] = [];
  for (const [ya, yb] of bands) {
    const col = new Float64Array(w);
    for (let y = ya; y < yb; y++) for (let x = 0; x < w; x++) col[x] = col[x]! + mask[y * w + x]!;
    const c = smooth(col, Math.max(1, Math.round(w * 0.004)));
    const gap = Math.max(4, Math.round((yb - ya) * 0.12));
    // Valleys: the lowest column within ±gap, clearly under the bodies on both sides.
    const cuts: number[] = [0];
    for (let x = gap; x < w - gap; x++) {
      let low = true;
      let peakL = 0;
      let peakR = 0;
      for (let k = x - gap; k <= x + gap; k++) if (c[k]! < c[x]! || (c[k] === c[x] && k < x)) low = false;
      if (!low) continue;
      for (let k = Math.max(0, x - gap * 3); k < x; k++) peakL = Math.max(peakL, c[k]!);
      for (let k = x + 1; k <= Math.min(w - 1, x + gap * 3); k++) peakR = Math.max(peakR, c[k]!);
      if (c[x]! < 0.45 * Math.min(peakL, peakR)) cuts.push(x);
    }
    cuts.push(w);
    const row: Box[] = [];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const b = tightBox(mask, w, cuts[k]!, cuts[k + 1]!, ya, yb);
      if (b) row.push(b);
    }
    // Two figures pressed together (a wide skirt against a dress): a box much wider than the others is cut at its
    // lowest column in its middle part.
    const ws = row.map((b) => b.x1 - b.x0).sort((a, b) => a - b);
    const medW = ws[Math.floor(ws.length / 2)] ?? 0;
    const split: Box[] = [];
    for (const b of row) {
      const bw = b.x1 - b.x0;
      if (row.length < 3 || bw < medW * 1.65) {
        split.push(b);
        continue;
      }
      let at = b.x0 + Math.round(bw * 0.3);
      for (let x = at; x < b.x0 + Math.round(bw * 0.7); x++) if (c[x]! < c[at]!) at = x;
      for (const part of [tightBox(mask, w, b.x0, at, ya, yb), tightBox(mask, w, at, b.x1, ya, yb)]) if (part) split.push(part);
    }
    // Slivers (a hand, a stick) are not figures.
    const hs = split.map((b) => b.y1 - b.y0).sort((a, b) => a - b);
    const med = hs[Math.floor(hs.length / 2)] ?? 0;
    out.push(...split.filter((b) => b.y1 - b.y0 > med * 0.45 && b.x1 - b.x0 > 6));
  }
  return out;
}
/**
 * One figure cut out of a gallery slice: the pieces of a NEIGHBOUR that cross the cut (a hand, a stick touching the
 * slice's left or right edge) are made transparent; the figure (largest piece) and its own detached parts stay.
 */
export function isolateFigure(rgba: Uint8ClampedArray, w: number, h: number): void {
  const label = new Int32Array(w * h).fill(-1);
  const comps: { n: number; edge: boolean }[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (label[i]! >= 0 || rgba[i * 4 + 3]! < 128) continue;
    const id = comps.length;
    const c = { n: 0, edge: false };
    label[i] = id;
    stack.push(i);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      c.n++;
      if (x === 0 || x === w - 1) c.edge = true;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (label[q]! < 0 && rgba[q * 4 + 3]! >= 128) {
            label[q] = id;
            stack.push(q);
          }
        }
    }
    comps.push(c);
  }
  if (comps.length < 2) return;
  const big = comps.reduce((a, c) => Math.max(a, c.n), 0);
  const drop = comps.map((c) => c.n < big && c.edge && c.n < big * 0.15);
  for (let i = 0; i < w * h; i++) if (label[i]! >= 0 && drop[label[i]!]) rgba[i * 4 + 3] = 0;
}
/** Labels of n poses: the account's order when there are 5, otherwise neutral first and the others in order. */
export function poseKinds(n: number): PoseKind[] {
  return Array.from({ length: n }, (_, i) => POSE_ORDER[i % POSE_ORDER.length]!);
}
/**
 * Where the mouth is in a cut-out (fractions of its box): the head is the top of the figure; the mouth sits about 16 %
 * of the figure's height under its top, on the axis of the head (centre of the topmost rows).
 */
export function mouthOf(mask: Uint8Array, w: number, h: number, b: Box): [number, number] {
  const bh = b.y1 - b.y0;
  let top = b.y1;
  for (let y = b.y0; y < b.y1 && top === b.y1; y++) for (let x = b.x0; x < b.x1; x++) if (mask[y * w + x]) {
    top = y;
    break;
  }
  const figH = b.y1 - top;
  const my = top + figH * 0.155;
  // Axis of the face: centre of the mask on the row of the mouth, inside the head (the widest run around the axis of the top).
  let sx = 0;
  let n = 0;
  const y0 = Math.round(top + figH * 0.1);
  const y1 = Math.round(top + figH * 0.17);
  for (let y = y0; y <= y1; y++) for (let x = b.x0; x < b.x1; x++) if (mask[y * w + x]) {
    sx += x;
    n++;
  }
  const mx = n ? sx / n : (b.x0 + b.x1) / 2;
  return [Math.round(((mx - b.x0) / Math.max(1, b.x1 - b.x0)) * 1000) / 1000, Math.round(((my - b.y0) / Math.max(1, bh)) * 1000) / 1000];
}

/** The pose a character takes for a line (its gesture / emotion), when listening, and at the chute. */
export function poseFor(o: { speaking: boolean; gesture?: string | null; emotion?: string; text?: string; react?: 'choc' | 'rire' | null }): PoseKind {
  if (o.react === 'choc') return 'choc';
  if (o.react === 'rire') return 'rire';
  if (!o.speaking) return 'neutre';
  // The written GESTURE first (it is what the actor does), then the emotion of the line.
  const of = (t: string): PoseKind | null => {
    if (/\b(laugh|rire|rit|joie|rigole|mdr|haha|moque)\b/.test(t)) return 'rire';
    if (/\b(point|angry|colere|furieux|accuse|menace|crie|clap|mepris)\b/.test(t)) return 'accuse';
    if (/\b(surprise|peur|choc|shock|startle|head-hands|cry|tristesse|honte)\b/.test(t)) return 'choc';
    if (/\b(shrug|no|haussement|innocent|nie|think|doute|fierte)\b/.test(t)) return 'haussement';
    return null;
  };
  const byGesture = of(plain(o.gesture ?? ''));
  if (byGesture) return byGesture;
  const byEmotion = of(plain(o.emotion ?? ''));
  if (byEmotion) return byEmotion;
  // No gesture written: a question accuses, an exclamation shrugs, otherwise neutral.
  const x = (o.text ?? '').trim();
  if (/\?\s*$/.test(x)) return 'accuse';
  if (/!\s*$/.test(x)) return 'haussement';
  return 'neutre';
}

/** Reading order of the figures of a GALLERY (several characters on one green screen, in rows): row by row, left to right. */
export function readingOrder(boxes: Box[], h: number): Box[] {
  const rows: Box[][] = [];
  for (const b of [...boxes].sort((a, c) => (a.y0 + a.y1) / 2 - (c.y0 + c.y1) / 2)) {
    const cy = (b.y0 + b.y1) / 2;
    const row = rows.find((r) => Math.abs((r[0]!.y0 + r[0]!.y1) / 2 - cy) < h * 0.2);
    if (row) row.push(b);
    else rows.push([b]);
  }
  return rows.flatMap((r) => r.sort((a, c) => a.x0 - c.x0));
}
/** The names typed for a gallery (one per line or separated by commas), as many as the figures. */
export function galleryNames(text: string, n: number): string[] {
  const names = text
    .split(/[\n,;]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  return Array.from({ length: n }, (_, i) => names[i] ?? `PERSONNAGE ${i + 1}`);
}
