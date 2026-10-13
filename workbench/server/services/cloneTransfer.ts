/**
 * TRANSFERT SUR L'IMAGE (« Corriger à 100 % ») — the reproduction is the chosen image ITSELF, pixel for pixel, where only
 * the content is replaced: every text line is erased locally (interpolated from its own surroundings) and rewritten with
 * the user's words at the same place, size, colour, weight and outline; the chart marks are erased inside their plot area
 * only and redrawn with the user's data in the same colours and geometry (bars, lines, rings). Everything else — icons,
 * sparkline waves, logo plates, menu styling, gradients, borders, shadows — stays the image's own pixels, so the design
 * is identical by construction and the identity can be MEASURED outside the replaced zones.
 *
 * The plan also corrects what a pixel reading gets wrong on real thumbnails: a KPI card read as a pie because of its icon,
 * a text list read as a chart, a sticker (« #1 », « Go Down ») of a video thumbnail read as a panel, two gauges read as
 * columns. Pure (pixels in, plan out); the browser renders it (dashRender) and measures it (designClone).
 */
import type { PxBox, TextLine } from './cleanTemplate';
import type { Box, DashSpec, Panel, PanelKind } from './dashClone';

export type LineRole = 'title' | 'panelTitle' | 'stripTitle' | 'kpiValue' | 'kpiLabel' | 'pairValue' | 'pairLabel' | 'listHeader' | 'listItem' | 'brand' | 'subtitle' | 'erase';
export interface TransferLine {
  /** Fractions of the image. */
  box: Box;
  color: string;
  /** A contrasting rim around the glyphs (big thumbnail titles: white letters outlined in red). */
  outline: string | null;
  /** Font size (em), fraction of the image height — from the measured cap height, not the box. */
  size: number;
  /** Baseline, fraction of the image height. */
  base: number;
  weight: 400 | 700 | 800;
  anchor: 'start' | 'middle';
  role: LineRole;
  panel: number;
  /** KPI index (kpiValue / kpiLabel / pairValue / pairLabel), list section (listHeader / listItem). */
  slot: number;
  /** Position inside a list section (listItem). */
  item: number;
  /** Right limit the new text may reach (fraction of the width). */
  maxX: number;
}
export interface TransferRing {
  /** Centre and radius: fractions of the image WIDTH (x, r) and HEIGHT (y). */
  cx: number;
  cy: number;
  r: number;
  thick: number;
  track: string;
  color: string;
}
export interface TransferPlan {
  version: 1;
  lines: TransferLine[];
  /** Plot areas where a chart is redrawn (marks erased there only). */
  plots: { panel: number; box: Box }[];
  /** Ring charts (radial bars, progress rings, gauges drawn as full circles). */
  rings: { panel: number; concentric: boolean; rings: TransferRing[] }[];
  /** Every zone whose pixels were replaced (texts, plots, rings, overlays) — the identity is measured outside them. */
  zones: Box[];
  /** Thumbnail decorations removed (stickers, buttons of a video thumbnail). */
  overlays: Box[];
  /** Panel kinds corrected from the measured texts and marks. */
  kinds: { panel: number; from: PanelKind; to: PanelKind; why: string }[];
}

const CHARTS: ReadonlySet<PanelKind> = new Set(['bar', 'hbar', 'line', 'area', 'pie', 'donut', 'gauge', 'map', 'table']);
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const lumOf = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const parseHex = (c: string): [number, number, number] => {
  const v = c.replace('#', '');
  return [parseInt(v.slice(0, 2), 16) || 0, parseInt(v.slice(2, 4), 16) || 0, parseInt(v.slice(4, 6), 16) || 0];
};
const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)]!;
};
const area = (b: PxBox) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
const grow = (b: PxBox, d: number, w: number, h: number): PxBox => ({ x0: Math.max(0, b.x0 - d), y0: Math.max(0, b.y0 - d), x1: Math.min(w, b.x1 + d), y1: Math.min(h, b.y1 + d) });
const union = (a: PxBox, b: PxBox): PxBox => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const contains = (b: PxBox, x: number, y: number) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;

/** Median colour of a few pixels (robust to one glyph pixel). */
function med3(px: ArrayLike<number>, w: number, pts: [number, number][]): [number, number, number] {
  const c = [0, 1, 2].map((k) => median(pts.map(([x, y]) => px[(y * w + x) * 4 + k]!)));
  return [c[0]!, c[1]!, c[2]!];
}

/**
 * Erases a box by interpolating its own surroundings: vertical interpolation between the rows just above and below
 * (keeps horizontal gradients), horizontal between the columns just left and right (keeps vertical ones), weighted by
 * the box's shape. Samples skip pixels inside `blocked` boxes (other texts being erased).
 */
export function inpaintBox(out: Uint8ClampedArray, w: number, h: number, b0: PxBox, blocked: PxBox[] = []): void {
  const b = { x0: Math.max(0, Math.floor(b0.x0)), y0: Math.max(0, Math.floor(b0.y0)), x1: Math.min(w, Math.ceil(b0.x1)), y1: Math.min(h, Math.ceil(b0.y1)) };
  if (b.x1 - b.x0 < 1 || b.y1 - b.y0 < 1) return;
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !contains(b, x, y) && !blocked.some((o) => o !== b0 && contains(o, x, y));
  const sample = (x: number, y: number, dx: number, dy: number): [number, number, number] | null => {
    const pts: [number, number][] = [];
    for (let k = 1; k <= 12 && pts.length < 3; k++) {
      const sx = x + dx * k;
      const sy = y + dy * k;
      if (free(sx, sy)) pts.push([sx, sy]);
    }
    return pts.length ? med3(out, w, pts) : null;
  };
  const bw = b.x1 - b.x0;
  const bh = b.y1 - b.y0;
  const top = Array.from({ length: bw }, (_, i) => sample(b.x0 + i, b.y0, 0, -1));
  const bot = Array.from({ length: bw }, (_, i) => sample(b.x0 + i, b.y1 - 1, 0, 1));
  const left = Array.from({ length: bh }, (_, j) => sample(b.x0, b.y0 + j, -1, 0));
  const right = Array.from({ length: bh }, (_, j) => sample(b.x1 - 1, b.y0 + j, 1, 0));
  // Wide boxes (text lines) trust the vertical interpolation, tall ones the horizontal one.
  const wv = 1 / bh;
  const wh = 1 / bw;
  const fill = new Float32Array(bw * bh * 3);
  for (let j = 0; j < bh; j++)
    for (let i = 0; i < bw; i++) {
      const ty = (j + 0.5) / bh;
      const tx = (i + 0.5) / bw;
      const t = top[i] ?? bot[i];
      const bo = bot[i] ?? top[i];
      const l = left[j] ?? right[j];
      const r = right[j] ?? left[j];
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        let wt = 0;
        if (t && bo) {
          acc += (t[c]! * (1 - ty) + bo[c]! * ty) * wv;
          wt += wv;
        }
        if (l && r) {
          acc += (l[c]! * (1 - tx) + r[c]! * tx) * wh;
          wt += wh;
        }
        fill[(j * bw + i) * 3 + c] = wt ? acc / wt : out[((b.y0 + j) * w + b.x0 + i) * 4 + c]!;
      }
    }
  for (let j = 0; j < bh; j++)
    for (let i = 0; i < bw; i++) {
      const o = ((b.y0 + j) * w + b.x0 + i) * 4;
      out[o] = fill[(j * bw + i) * 3]!;
      out[o + 1] = fill[(j * bw + i) * 3 + 1]!;
      out[o + 2] = fill[(j * bw + i) * 3 + 2]!;
    }
}

/** Per-row background of a box, interpolated between samples left and right of it (handles horizontal gradients). */
function rowBackground(px: ArrayLike<number>, w: number, h: number, b: PxBox) {
  // The box's dominant colour (a text box is mostly its background): used on a row whose two sides disagree (the box
  // straddles a surface edge — a search field inside a band, a card corner).
  const bins = new Map<number, { n: number; c: [number, number, number] }>();
  for (let y = Math.max(0, b.y0); y < Math.min(h, b.y1); y += 1)
    for (let x = Math.max(0, b.x0); x < Math.min(w, b.x1); x += 2) {
      const i = (y * w + x) * 4;
      const key = ((px[i]! >> 4) << 8) | ((px[i + 1]! >> 4) << 4) | (px[i + 2]! >> 4);
      const e = bins.get(key) ?? { n: 0, c: [0, 0, 0] };
      e.n++;
      e.c[0] += px[i]!;
      e.c[1] += px[i + 1]!;
      e.c[2] += px[i + 2]!;
      bins.set(key, e);
    }
  const top = [...bins.values()].sort((a, c) => c.n - a.n)[0];
  const dom: [number, number, number] = top ? [top.c[0] / top.n, top.c[1] / top.n, top.c[2] / top.n] : [0, 0, 0];
  const far = (a: [number, number, number]) => Math.abs(a[0] - dom[0]) + Math.abs(a[1] - dom[1]) + Math.abs(a[2] - dom[2]) > 60;
  const m = Math.max(2, Math.round((b.y1 - b.y0) * 0.25));
  const rows: { l: [number, number, number]; r: [number, number, number] }[] = [];
  for (let y = b.y0; y < b.y1; y++) {
    const yy = Math.max(0, Math.min(h - 1, y));
    const lp: [number, number][] = [];
    const rp: [number, number][] = [];
    for (let k = 2; k < 2 + m; k++) {
      if (b.x0 - k >= 0) lp.push([b.x0 - k, yy]);
      if (b.x1 + k - 1 < w) rp.push([b.x1 + k - 1, yy]);
    }
    let l = lp.length ? med3(px, w, lp) : rp.length ? med3(px, w, rp) : dom;
    let r = rp.length ? med3(px, w, rp) : l;
    if (far(l) !== far(r)) {
      // One side is another surface: the dominant colour on both sides.
      if (far(l)) l = dom;
      if (far(r)) r = dom;
    }
    rows.push({ l, r });
  }
  return (x: number, y: number): [number, number, number] => {
    const row = rows[Math.max(0, Math.min(rows.length - 1, y - b.y0))]!;
    const t = (x - b.x0 + 0.5) / Math.max(1, b.x1 - b.x0);
    return [row.l[0] * (1 - t) + row.r[0] * t, row.l[1] * (1 - t) + row.r[1] * t, row.l[2] * (1 - t) + row.r[2] * t];
  };
}

/** Ink of a box (pixels far from the interpolated background), with fill / outline colours and stroke density. */
export function measureInk(px: ArrayLike<number>, w: number, h: number, b: PxBox, thr = 90, bandRows = false) {
  const bg = rowBackground(px, w, h, b);
  const bw = b.x1 - b.x0;
  const bh = b.y1 - b.y0;
  const ink = new Uint8Array(Math.max(0, bw * bh));
  const rowShare: number[] = [];
  for (let y = b.y0; y < b.y1; y++) {
    let n = 0;
    for (let x = b.x0; x < b.x1; x++) {
      const i = (y * w + x) * 4;
      const m = bg(x, y);
      if (Math.abs(px[i]! - m[0]) + Math.abs(px[i + 1]! - m[1]) + Math.abs(px[i + 2]! - m[2]) > thr) {
        ink[(y - b.y0) * bw + x - b.x0] = 1;
        n++;
      }
    }
    rowShare.push(n / Math.max(1, bw));
  }
  // Rows almost fully « ink » are another band (the box crosses a band edge), not glyphs.
  if (bandRows)
    rowShare.forEach((s, j) => {
      if (s > 0.6) for (let i = 0; i < bw; i++) ink[j * bw + i] = 0;
    });
  let x0 = bw;
  let y0 = bh;
  let x1 = -1;
  let y1 = -1;
  let n = 0;
  const interior: number[][] = [[], [], []];
  const rim: number[][] = [[], [], []];
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < bw && j < bh && ink[j * bw + i] === 1;
  for (let j = 0; j < bh; j++)
    for (let i = 0; i < bw; i++) {
      if (!ink[j * bw + i]) continue;
      n++;
      if (i < x0) x0 = i;
      if (i > x1) x1 = i;
      if (j < y0) y0 = j;
      if (j > y1) y1 = j;
      const o = ((b.y0 + j) * w + b.x0 + i) * 4;
      const inner = at(i - 2, j) && at(i + 2, j) && at(i, j - 2) && at(i, j + 2);
      const dst = inner ? interior : rim;
      for (let c = 0; c < 3; c++) dst[c]!.push(px[o + c]!);
    }
  const col = (a: number[][]) => (a[0]!.length ? hex(median(a[0]!), median(a[1]!), median(a[2]!)) : null);
  const fill = col(interior) ?? col(rim);
  const edge = col(rim);
  let outline: string | null = null;
  if (fill && edge && interior[0]!.length > 30) {
    const [a, b2, c] = parseHex(fill);
    const [d, e, f] = parseHex(edge);
    if (Math.abs(a - d) + Math.abs(b2 - e) + Math.abs(c - f) > 140) outline = edge;
  }
  // Baseline: the last row still carrying a good share of the ink (descenders below it are sparse).
  let base = y1;
  if (n) {
    const rows = Array.from({ length: y1 - y0 + 1 }, (_, j) => {
      let c = 0;
      for (let i = x0; i <= x1; i++) c += ink[(y0 + j) * bw + i]!;
      return c;
    });
    const mx = Math.max(...rows);
    for (let j = rows.length - 1; j >= 0; j--)
      if (rows[j]! >= mx * 0.3) {
        base = y0 + j;
        break;
      }
  }
  // Core rows (between the top of the capitals and the baseline): stroke runs and ink / background transitions.
  let runs = 0;
  let runLen = 0;
  let maxTr = 0;
  if (n) {
    const capPx = base - y0 + 1;
    for (let j = y0 + Math.floor(capPx * 0.25); j <= base - Math.floor(capPx * 0.25); j++) {
      let tr = 0;
      let len = 0;
      for (let i = x0; i <= x1; i++) {
        const v = ink[j * bw + i];
        if (v) len++;
        else if (len) {
          runs++;
          runLen += len;
          len = 0;
        }
        if (i > x0 && v !== ink[j * bw + i - 1]) tr++;
      }
      if (len) {
        runs++;
        runLen += len;
      }
      if (tr > maxTr) maxTr = tr;
    }
  }
  const capH = n ? base - y0 + 1 : 0;
  return {
    /** Transitions per em along the line: text ≥ 2.6 (glyph after glyph), a wave, an icon or a curve far less. */
    tpe: n ? maxTr / Math.max(1, (x1 - x0 + 1) / Math.max(1, y1 - y0 + 1)) : 0,
    /** Stroke width over cap height, corrected for anti-aliasing: ≥ 0.17 is bold. */
    stroke: runs && capH ? (runLen / runs - 0.8) / capH : 0,
    box: n ? { x0: b.x0 + x0, y0: b.y0 + y0, x1: b.x0 + x1 + 1, y1: b.y0 + y1 + 1 } : null,
    density: n / Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1)),
    fill,
    outline,
    /** Baseline row and cap height (pixels), when there is ink. */
    baseline: n ? b.y0 + base + 1 : null,
    cap: n ? base - y0 + 1 : 0,
    ink,
    bw,
    bh,
  };
}

/**
 * Is this « line » really text? Text is a row of several narrow glyphs; a sparkline wave, a chart curve or an axis line
 * is one long stroke — design or data, never a line to rewrite.
 */
export function isGlyphRow(ink: Uint8Array, bw: number, bh: number): boolean {
  const seen = new Uint8Array(ink.length);
  let count = 0;
  let widest = 0;
  for (let s0 = 0; s0 < ink.length; s0++) {
    if (!ink[s0] || seen[s0]) continue;
    let x0 = bw;
    let x1 = -1;
    let n = 0;
    const st = [s0];
    seen[s0] = 1;
    while (st.length) {
      const k = st.pop()!;
      const x = k % bw;
      const y = (k - x) / bw;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
          const nk = ny * bw + nx;
          if (ink[nk] && !seen[nk]) {
            seen[nk] = 1;
            st.push(nk);
          }
        }
    }
    if (n >= 3) {
      count++;
      widest = Math.max(widest, x1 - x0 + 1);
    }
  }
  if (!count) return false;
  // One or two glyphs (« 6 », « 29 »): compact; longer text: no glyph spans most of the line.
  if (count <= 2) return widest <= Math.max(bh * 1.6, 6);
  return widest <= Math.max(bw * 0.55, bh * 1.8);
}

/** Connected components of a mask inside a box (8-neighbourhood). */
function components(mask: Uint8Array, w: number, b: PxBox, minN: number) {
  const seen = new Uint8Array(mask.length);
  const out: { pts: number[]; box: PxBox }[] = [];
  for (let y = b.y0; y < b.y1; y++)
    for (let x = b.x0; x < b.x1; x++) {
      const s = y * w + x;
      if (!mask[s] || seen[s]) continue;
      const pts: number[] = [];
      const st = [s];
      seen[s] = 1;
      const bb = { x0: x, y0: y, x1: x + 1, y1: y + 1 };
      while (st.length) {
        const k = st.pop()!;
        pts.push(k);
        const kx = k % w;
        const ky = (k - kx) / w;
        if (kx < bb.x0) bb.x0 = kx;
        if (kx + 1 > bb.x1) bb.x1 = kx + 1;
        if (ky < bb.y0) bb.y0 = ky;
        if (ky + 1 > bb.y1) bb.y1 = ky + 1;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = kx + dx;
            const ny = ky + dy;
            if (nx < b.x0 || ny < b.y0 || nx >= b.x1 || ny >= b.y1) continue;
            const nk = ny * w + nx;
            if (mask[nk] && !seen[nk]) {
              seen[nk] = 1;
              st.push(nk);
            }
          }
      }
      if (pts.length >= minN) out.push({ pts, box: bb });
    }
  return out;
}

/** A ring (progress circle, radial bar, gauge track): pixels at a nearly constant distance from the box centre. */
function asRing(px: ArrayLike<number>, w: number, c: { pts: number[]; box: PxBox }): TransferRing | null {
  const bw = c.box.x1 - c.box.x0;
  const bh = c.box.y1 - c.box.y0;
  if (bw < 20 || bh < 20 || Math.abs(bw - bh) > Math.max(bw, bh) * 0.2) return null;
  const cx = (c.box.x0 + c.box.x1) / 2;
  const cy = (c.box.y0 + c.box.y1) / 2;
  const rs = c.pts.map((k) => Math.hypot((k % w) + 0.5 - cx, Math.floor(k / w) + 0.5 - cy)).sort((a, b) => a - b);
  const r05 = rs[Math.floor(rs.length * 0.05)]!;
  const r95 = rs[Math.floor(rs.length * 0.95)]!;
  const rOut = Math.max(bw, bh) / 2;
  const thick = r95 - r05;
  if (thick > rOut * 0.45 || thick < 2 || r95 < rOut * 0.85) return null;
  // Track and value colours: the two main colours of the ring, the more saturated being the value.
  const bins = new Map<string, { n: number; c: [number, number, number] }>();
  for (const k of c.pts) {
    const r = px[k * 4]!;
    const g = px[k * 4 + 1]!;
    const b = px[k * 4 + 2]!;
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const e = bins.get(key) ?? { n: 0, c: [0, 0, 0] };
    e.n++;
    e.c[0] += r;
    e.c[1] += g;
    e.c[2] += b;
    bins.set(key, e);
  }
  const top = [...bins.values()].sort((a, b) => b.n - a.n).slice(0, 2).map((e) => e.c.map((v) => v / e.n) as [number, number, number]);
  const sat = (c2: [number, number, number]) => Math.max(...c2) - Math.min(...c2);
  const [a, b] = top.length > 1 && sat(top[1]!) > sat(top[0]!) ? [top[1]!, top[0]!] : [top[0]!, top[1] ?? top[0]!];
  return { cx, cy, r: (r05 + r95) / 2, thick: Math.max(2, thick), color: hex(...a), track: hex(...b) };
}

export interface TransferInput {
  px: ArrayLike<number>;
  w: number;
  h: number;
  spec: DashSpec;
  /** cleanTemplate() of the image with the spec's panels: text lines, erased content mask, content-free background. */
  texts: TextLine[];
  erased: Uint8Array;
  cleanBg: ArrayLike<number>;
  /** Thumbnail decorations named by the vision model (fractions). */
  overlays?: Box[];
}

/**
 * The plan: every line's role, the corrected panel kinds, the plot / ring geometry, the overlays — plus the transferred
 * background (the image with only those zones replaced) and the spec the exports read.
 */
export function planTransfer(o: TransferInput): { plan: TransferPlan; spec: DashSpec; bg: Uint8ClampedArray; notes: string[] } {
  const { px, w, h } = o;
  const N = w * h;
  const notes: string[] = [];
  const toPx = (b: Box): PxBox => ({ x0: Math.round(b.x * w), y0: Math.round(b.y * h), x1: Math.round((b.x + b.w) * w), y1: Math.round((b.y + b.h) * h) });
  const toFr = (b: PxBox): Box => ({ x: b.x0 / w, y: b.y0 / h, w: (b.x1 - b.x0) / w, h: (b.y1 - b.y0) / h });
  let panels: Panel[] = o.spec.panels.map((p) => ({ ...p }));
  const pbox = panels.map((p) => toPx(p.box));
  // Only real text rows, re-measured on a slightly larger box (a panel edge may have cut a line in two): a sparkline,
  // a curve, an icon or a ring found by the cleaner is design or data, not text.
  const med0 = median(o.texts.map((t) => t.size)) || 12;
  const decorations: PxBox[] = [];
  type Line = TextLine & { em: number; base: number; weight: 400 | 700 | 800 };
  let lines: Line[] = [];
  for (const t of o.texts) {
    // Re-measured on a box a little larger (a panel edge may have cut the line), then cut back to the band of rows
    // holding the original line — a neighbour line above or below is separated by an empty row.
    const ext = { x0: Math.max(0, t.box.x0 - Math.ceil(t.size * 0.5) - 1), y0: Math.max(0, t.box.y0 - Math.ceil(t.size * 0.6) - 1), x1: Math.min(w, t.box.x1 + Math.ceil(t.size * 0.5) + 1), y1: Math.min(h, t.box.y1 + Math.ceil(t.size * 0.6) + 1) };
    let m = measureInk(px, w, h, ext, 60);
    if (m.box) {
      const rows = Array.from({ length: m.bh }, (_, j) => {
        let c = 0;
        for (let i = 0; i < m.bw; i++) c += m.ink[j * m.bw + i]!;
        return c;
      });
      const mid = Math.max(0, Math.min(m.bh - 1, Math.round((t.box.y0 + t.box.y1) / 2) - ext.y0));
      let top = mid;
      let bot = mid;
      while (top > 0 && rows[top - 1]! > 0) top--;
      while (bot < m.bh - 1 && rows[bot + 1]! > 0) bot++;
      if (rows[mid] === 0) {
        top = Math.max(0, t.box.y0 - ext.y0);
        bot = Math.min(m.bh - 1, t.box.y1 - ext.y0 - 1);
      }
      m = measureInk(px, w, h, { x0: ext.x0, y0: ext.y0 + top, x1: ext.x1, y1: ext.y0 + bot + 1 }, 60);
    }
    if (!m.box) continue;
    const size = m.box.y1 - m.box.y0;
    if (m.tpe < 2.6 || size > med0 * 3.4) {
      decorations.push(t.box);
      continue;
    }
    const cap = m.cap >= 3 ? m.cap : size * 0.75;
    // Colour: the cleaner's « core ink » (the most contrasting pixels) — thin anti-aliased strokes fool a median.
    lines.push({ box: m.box, color: t.color, size, em: cap / 0.72, base: m.baseline ?? m.box.y1, weight: m.stroke >= 0.17 ? 700 : 400 });
  }
  // Two halves of one line (cut by a panel edge) are one line.
  lines.sort((a, b) => a.box.x0 - b.box.x0);
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]!;
      const b = lines[j]!;
      const ix = Math.min(a.box.x1, b.box.x1) - Math.max(a.box.x0, b.box.x0);
      const iy = Math.min(a.box.y1, b.box.y1) - Math.max(a.box.y0, b.box.y0);
      if (ix > 0 && iy > 0 && ix * iy >= Math.min(area(a.box), area(b.box)) * 0.3) {
        const big = area(a.box) >= area(b.box) ? a : b;
        lines[i] = { ...big, box: union(a.box, b.box), size: Math.max(a.box.y1, b.box.y1) - Math.min(a.box.y0, b.box.y0) };
        lines.splice(j, 1);
        j = i;
      }
    }
  const med = median(lines.map((t) => t.size)) || 12;
  const panelOf = (b: PxBox) => {
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    let best = -1;
    pbox.forEach((p, i) => {
      if (contains(p, cx, cy) && (best < 0 || area(p) < area(pbox[best]!))) best = i;
    });
    return best;
  };
  // ── 1. overlays: the vision model's, then saturated stickers on the image edges and small saturated « panels » with a
  //    big text (a « #1 », a « Go Down » button) — never a card of the dashboard grid. ─────────────────────────────────
  const overlays: PxBox[] = (o.overlays ?? []).map(toPx).filter((b) => area(b) > 0 && area(b) < N * 0.06);
  const chromaOf = (c: string) => {
    const [r, g, b] = parseHex(c);
    return Math.max(r, g, b) - Math.min(r, g, b);
  };
  const edgeNear = (b: PxBox) => b.x0 < w * 0.06 || b.x1 > w * 0.94 || b.y1 > h * 0.94;
  panels.forEach((p, i) => {
    const b = pbox[i]!;
    const own = lines.filter((t) => panelOf(t.box) === i);
    const bigText = own.some((t) => t.size >= med * 1.8);
    if (area(b) < N * 0.03 && chromaOf(p.fill) >= 70 && edgeNear(b) && (bigText || !own.length) && (p.kind === 'text' || p.kind === 'image' || p.kind === 'kpi')) overlays.push(grow(b, 2, w, h));
  });
  {
    // Compact saturated blobs outside every panel, on an edge of the image (a sticker, a « scroll » button).
    const g = Math.max(2, Math.round(Math.min(w, h) / 260));
    const gw = Math.ceil(w / g);
    const gh = Math.ceil(h / g);
    const m = new Uint8Array(gw * gh);
    const titleB = o.spec.title ? grow(toPx(o.spec.title.box), Math.round(h * 0.03), w, h) : null;
    for (let gy = 0; gy < gh; gy++)
      for (let gx = 0; gx < gw; gx++) {
        const x = Math.min(w - 1, gx * g);
        const y = Math.min(h - 1, gy * g);
        if (pbox.some((b) => contains(b, x, y)) || (titleB && contains(titleB, x, y))) continue;
        const i = (y * w + x) * 4;
        const r = px[i]!;
        const gg = px[i + 1]!;
        const bb = px[i + 2]!;
        if (Math.max(r, gg, bb) - Math.min(r, gg, bb) >= 90 && Math.max(r, gg, bb) >= 110) m[gy * gw + gx] = 1;
      }
    for (const c of components(m, gw, { x0: 0, y0: 0, x1: gw, y1: gh }, 4)) {
      const b = { x0: c.box.x0 * g, y0: c.box.y0 * g, x1: Math.min(w, c.box.x1 * g), y1: Math.min(h, c.box.y1 * g) };
      const a = area(b);
      const fillRatio = c.pts.length / Math.max(1, (c.box.x1 - c.box.x0) * (c.box.y1 - c.box.y0));
      const touchesBoth = b.x0 <= g && b.x1 >= w - g;
      if (a >= N * 0.0012 && a <= N * 0.025 && fillRatio >= 0.5 && !touchesBoth && edgeNear(b) && b.x1 - b.x0 < w * 0.12) overlays.push(grow(b, 3, w, h));
    }
  }
  const isOverlay = (b: PxBox) => overlays.some((ov) => {
    const ix = Math.min(ov.x1, b.x1) - Math.max(ov.x0, b.x0);
    const iy = Math.min(ov.y1, b.y1) - Math.max(ov.y0, b.y0);
    return ix > 0 && iy > 0 && ix * iy >= area(b) * 0.5;
  });
  // Panels that are overlays leave the spec; lines inside an overlay are erased with it.
  const keepIdx = panels.map((_, i) => !isOverlay(pbox[i]!));
  const inner = (b: PxBox) => {
    const m = Math.max(3, Math.round(Math.min(b.x1 - b.x0, b.y1 - b.y0) * 0.03));
    return { x0: b.x0 + m, y0: b.y0 + m, x1: b.x1 - m, y1: b.y1 - m };
  };
  // ── 1b. rings (progress circles, radial bars, gauges drawn as circles): measured on the whole content BEFORE any
  //    text is read — an arc crossing a row looks like letters to a text detector. ────────────────────────────────────
  const ringOf = new Map<number, { rings: TransferRing[]; boxes: PxBox[] }>();
  panels.forEach((p, i) => {
    if (!keepIdx[i] || p.kind === 'kpi' || p.kind === 'filter' || p.kind === 'title' || p.kind === 'image') return;
    const b = inner(pbox[i]!);
    // What differs from the panel's own background (an enclosed hole of the panel colour is not content).
    const [fr, fg, fb] = parseHex(p.fill);
    const diff = new Uint8Array(N);
    for (let y = b.y0; y < b.y1; y++)
      for (let x = b.x0; x < b.x1; x++) {
        const k = (y * w + x) * 4;
        if (Math.abs(px[k]! - fr) + Math.abs(px[k + 1]! - fg) + Math.abs(px[k + 2]! - fb) > 45) diff[y * w + x] = 1;
      }
    const comps = components(diff, w, b, Math.max(40, Math.round(N * 0.00004)));
    const rs = comps.map((c) => ({ c, ring: asRing(px, w, c) })).filter((x) => x.ring);
    if (!rs.length) return;
    const ringPts = rs.reduce((a, x) => a + x.c.pts.length, 0);
    const bigPts = comps.filter((c) => c.pts.length >= 300).reduce((a, c) => a + c.pts.length, 0);
    if (ringPts < bigPts * 0.6) return;
    ringOf.set(i, { rings: rs.map((x) => x.ring!).sort((a, c) => c.r - a.r), boxes: rs.map((x) => grow(x.c.box, 2, w, h)) });
  });
  // Lines lying on a ring are pieces of it (or its old figures), never text to keep.
  const onRing = (b: PxBox) =>
    [...ringOf.values()].some((r) =>
      r.boxes.some((rb) => {
        const ix = Math.min(rb.x1, b.x1) - Math.max(rb.x0, b.x0);
        const iy = Math.min(rb.y1, b.y1) - Math.max(rb.y0, b.y0);
        return ix > 0 && iy > 0 && ix * iy >= area(b) * 0.5;
      }),
    );
  lines = lines.filter((t) => !onRing(t.box));
  // ── 2. text mask and per-panel content (marks = erased content that is not a text line) ────────────────────────
  const textBoxes = lines.map((t) => grow(t.box, 3, w, h));
  const inText = new Uint8Array(N);
  for (const b of textBoxes) for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) inText[y * w + x] = 1;
  const marks = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (o.erased[i] && !inText[i]) marks[i] = 1;
  const markCount = (b: PxBox) => {
    let n = 0;
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) n += marks[y * w + x]!;
    return n;
  };
  // ── 3. kinds corrected from the evidence ─────────────────────────────────────────────────────────────────────────
  const kinds: TransferPlan['kinds'] = [];
  panels.forEach((p, i) => {
    if (!keepIdx[i]) return;
    const b = pbox[i]!;
    const own = lines.filter((t) => panelOf(t.box) === i && !isOverlay(t.box));
    const pa = area(b);
    const mk = markCount(inner(b));
    const textA = own.reduce((a, t) => a + area(t.box), 0);
    const big = [...own].sort((a, c) => c.size - a.size)[0];
    const set = (to: PanelKind, why: string) => {
      if (to === p.kind) return;
      kinds.push({ panel: i, from: p.kind, to, why });
      // The form measured on the pixels is now this one (the comparator stops flagging it).
      panels[i] = { ...panels[i]!, kind: to, tiles: 1, pixelKind: to };
    };
    if (p.kind === 'kpi' || p.kind === 'filter' || p.kind === 'title' || ringOf.has(i)) return;
    // A thin strip across the page (a header band of labels and figures) is never a chart.
    if (b.y1 - b.y0 < h * 0.075 && b.x1 - b.x0 > (b.y1 - b.y0) * 4 && own.length) return set('title', 'un bandeau de libellés');
    if (big && big.size >= med * 1.45 && (big.box.y0 + big.box.y1) / 2 < b.y0 + (b.y1 - b.y0) * 0.55 && b.y1 - b.y0 <= h * 0.33 && mk < pa * 0.35) set('kpi', 'un grand chiffre en tête de carte');
    else if (own.length >= 2 && mk < Math.max(pa * 0.02, textA * 0.4)) {
      const lefts = own.map((t) => t.box.x0);
      const aligned = own.length >= 3 && Math.max(...lefts) - Math.min(...lefts) < w * 0.02;
      set(aligned ? 'filter' : 'title', aligned ? 'une liste de libellés sans tracé' : 'des libellés sans tracé');
    }
  });
  for (const k of kinds) notes.push(`panneau ${k.panel + 1} : ${k.from} → ${k.to} (${k.why})`);
  // ── 4. rings and plot areas of the chart panels ─────────────────────────────────────────────────────────────────
  const rings: TransferPlan['rings'] = [];
  const plots: TransferPlan['plots'] = [];
  const zones: PxBox[] = [];
  const absorbed = new Set<number>();
  const ringLabels = new Set<number>();
  const plotOf = new Map<number, PxBox>();
  panels.forEach((p, i) => {
    if (!keepIdx[i] || !CHARTS.has(p.kind)) return;
    const b = inner(pbox[i]!);
    const comps = components(marks, w, b, Math.max(12, Math.round(N * 0.00002)));
    const ro = ringOf.get(i);
    if (ro) {
      const rr = ro.rings;
      const concentric = rr.length > 1 && rr.every((r) => Math.hypot(r.cx - rr[0]!.cx, r.cy - rr[0]!.cy) < rr[0]!.r * 0.08);
      rings.push({ panel: i, concentric, rings: rr.map((r) => ({ cx: r.cx / w, cy: r.cy / h, r: r.r / w, thick: r.thick / w, track: r.track, color: r.color })) });
      if (p.kind !== 'donut') {
        kinds.push({ panel: i, from: p.kind, to: 'donut', why: `${rr.length} anneau(x) mesuré(s)` });
        notes.push(`panneau ${i + 1} : ${p.kind} → donut (${rr.length} anneau(x) mesuré(s) sur les pixels)`);
      }
      panels[i] = { ...panels[i]!, kind: 'donut', pixelKind: 'donut' };
      for (const rb of ro.boxes) zones.push(rb);
      // Labels inside the ring panel (old percentages, legend) are redrawn with the rings.
      lines.forEach((t, k) => {
        if (panelOf(t.box) === i && t.box.y0 > pbox[i]!.y0 + (pbox[i]!.y1 - pbox[i]!.y0) * 0.2) ringLabels.add(k);
      });
      return;
    }
    const head = lines.filter((t) => panelOf(t.box) === i && t.box.y0 < pbox[i]!.y0 + (pbox[i]!.y1 - pbox[i]!.y0) * 0.25).reduce((m, t) => Math.max(m, t.box.y1), b.y0);
    let pb = comps.length ? comps.reduce((a, c) => union(a, c.box), comps[0]!.box) : { x0: b.x0, y0: Math.min(b.y1 - 8, head + 4), x1: b.x1, y1: b.y1 };
    // Axis labels hugging the marks belong to the plot (the redraw writes its own).
    lines.forEach((t, k) => {
      if (panelOf(t.box) !== i) return;
      const gap = Math.max(4, t.size * 1.6);
      const ovX = Math.min(t.box.x1, pb.x1) - Math.max(t.box.x0, pb.x0) > 0;
      const ovY = Math.min(t.box.y1, pb.y1) - Math.max(t.box.y0, pb.y0) > 0;
      const below = ovX && t.box.y0 >= pb.y1 - 2 && t.box.y0 - pb.y1 < gap;
      const leftOf = ovY && t.box.x1 <= pb.x0 + 2 && pb.x0 - t.box.x1 < gap * 2;
      const within = t.box.x0 >= pb.x0 - 2 && t.box.x1 <= pb.x1 + 2 && t.box.y0 >= pb.y0 - 2 && t.box.y1 <= pb.y1 + 2;
      if (below || leftOf || within) {
        pb = union(pb, t.box);
        absorbed.add(k);
      }
    });
    pb = { x0: Math.max(b.x0, pb.x0 - 4), y0: Math.max(b.y0, pb.y0 - 6), x1: Math.min(b.x1, pb.x1 + 4), y1: Math.min(b.y1, pb.y1 + 4) };
    plotOf.set(i, pb);
    plots.push({ panel: i, box: toFr(pb) });
    zones.push(pb);
  });
  // ── 5. the big title: its whole ink (thick outlined letters are not « thin text » for the cleaner) ─────────────
  const out: TransferLine[] = [];
  const titleIdx = new Set<number>();
  if (o.spec.title) {
    const tb = toPx(o.spec.title.box);
    const th = tb.y1 - tb.y0;
    const zone = { x0: Math.max(0, tb.x0 - Math.round(th * 0.8)), y0: Math.max(0, tb.y0 - Math.round(th * 0.25)), x1: Math.min(w, tb.x1 + Math.round(th * 0.8)), y1: Math.min(h, tb.y1 + Math.round(th * 0.25)) };
    const ink = measureInk(px, w, h, zone, 90, true);
    const box = ink.box ? grow(ink.box, Math.max(2, Math.round(th * 0.06)), w, h) : tb;
    lines.forEach((t, k) => {
      const ix = Math.min(t.box.x1, box.x1) - Math.max(t.box.x0, box.x0);
      const iy = Math.min(t.box.y1, box.y1) - Math.max(t.box.y0, box.y0);
      if (ix > 0 && iy > 0 && ix * iy >= area(t.box) * 0.4) titleIdx.add(k);
    });
    const cap = ink.cap || (box.y1 - box.y0) * 0.75;
    out.push({ box: toFr(box), color: ink.fill ?? o.spec.title.color, outline: ink.outline, size: cap / 0.72 / h, base: (ink.baseline ?? box.y1) / h, weight: 800, anchor: o.spec.title.align === 'center' ? 'middle' : 'start', role: 'title', panel: -1, slot: 0, item: 0, maxX: 1 });
    zones.push(box);
    if (ink.outline) notes.push(`titre : contour ${ink.outline} autour du texte ${ink.fill} conservé`);
  }
  // ── 6. roles of the other lines ─────────────────────────────────────────────────────────────────────────────────
  type L = Line & { k: number; panel: number };
  const live: L[] = [];
  lines.forEach((t, k) => {
    if (titleIdx.has(k) || isOverlay(t.box)) return;
    const pi = panelOf(t.box);
    if (pi >= 0 && !keepIdx[pi]) return;
    live.push({ ...t, k, panel: pi });
  });
  const lineOut = (t: L, role: LineRole, slot = 0, item = 0, anchor: 'start' | 'middle' = 'start') => {
    const pi = t.panel;
    const right = pi >= 0 ? pbox[pi]!.x1 - Math.max(4, (pbox[pi]!.x1 - pbox[pi]!.x0) * 0.04) : Math.min(w, t.box.x1 + (t.box.x1 - t.box.x0) * 0.6);
    out.push({ box: toFr(t.box), color: t.color, outline: null, size: t.em / h, base: t.base / h, weight: t.weight, anchor, role, panel: pi >= 0 ? pi : -1, slot, item, maxX: right / w });
    zones.push(grow(t.box, 3, w, h));
  };
  const used = new Set<number>();
  const centred = (t: L) => t.panel >= 0 && Math.abs((t.box.x0 + t.box.x1) / 2 - (pbox[t.panel]!.x0 + pbox[t.panel]!.x1) / 2) < (pbox[t.panel]!.x1 - pbox[t.panel]!.x0) * 0.1;
  let kpi = 0;
  // KPI cards in reading order: the biggest line is the figure, the closest other line its label.
  const kpiPanels = panels.map((p, i) => ({ p, i })).filter(({ p, i }) => keepIdx[i] && p.kind === 'kpi').sort((a, b) => pbox[a.i]!.y0 - pbox[b.i]!.y0 || pbox[a.i]!.x0 - pbox[b.i]!.x0);
  for (const { i } of kpiPanels) {
    const own = live.filter((t) => t.panel === i);
    if (!own.length) continue;
    const v = [...own].sort((a, b) => b.size - a.size)[0]!;
    const rest = own.filter((t) => t !== v).sort((a, b) => Math.abs((a.box.y0 + a.box.y1) / 2 - (v.box.y0 + v.box.y1) / 2) - Math.abs((b.box.y0 + b.box.y1) / 2 - (v.box.y0 + v.box.y1) / 2));
    const lab = rest[0];
    lineOut(v, 'kpiValue', kpi, 0, centred(v) ? 'middle' : 'start');
    used.add(v.k);
    if (lab) {
      lineOut(lab, 'kpiLabel', kpi, 0, centred(lab) ? 'middle' : 'start');
      used.add(lab.k);
    }
    // Updated for the exports: the figure and its label at their measured places.
    panels[i] = { ...panels[i]!, tiles: 1, valueBox: toFr(v.box), valueColor: v.color, ...(lab ? { titleBox: toFr(lab.box), titleColor: lab.color } : {}) };
    kpi++;
  }
  // Chart panels: the title line (top band) is the chart's title; axis labels are redrawn with the chart.
  panels.forEach((p, i) => {
    if (!keepIdx[i] || !CHARTS.has(p.kind)) return;
    const own = live.filter((t) => t.panel === i && !used.has(t.k) && !absorbed.has(t.k));
    const pl = plotOf.get(i);
    const top = own.filter((t) => t.box.y0 < pbox[i]!.y0 + (pbox[i]!.y1 - pbox[i]!.y0) * 0.25 && (!pl || t.box.y1 <= pl.y0 + 4)).sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0)[0];
    if (top) {
      lineOut(top, 'panelTitle', 0, 0, centred(top) ? 'middle' : 'start');
      used.add(top.k);
      panels[i] = { ...panels[i]!, titleBox: toFr(top.box), titleColor: top.color };
    }
    for (const t of live) if (t.panel === i && absorbed.has(t.k)) used.add(t.k);
  });
  // The old labels of a ring chart are erased (the rings are redrawn with their own).
  for (const t of live)
    if (ringLabels.has(t.k) && !used.has(t.k)) {
      lineOut(t, 'erase');
      used.add(t.k);
    }
  // A label whose figure the text reader missed (« #Trans. » over a lone « 6 »): the ink just below it is that figure.
  for (const a of live.filter((t) => !used.has(t.k))) {
    const hasBelow = live.some((c) => c !== a && c.box.y0 >= a.box.y1 - 2 && c.box.y0 - a.box.y1 <= a.size * 1.3 && Math.min(a.box.x1, c.box.x1) - Math.max(a.box.x0, c.box.x0) > 0);
    const hasAbove = live.some((c) => c !== a && a.box.y0 >= c.box.y1 - 2 && a.box.y0 - c.box.y1 <= a.size * 1.3 && Math.min(a.box.x1, c.box.x1) - Math.max(a.box.x0, c.box.x0) > 0);
    if (hasBelow || hasAbove || (a.panel >= 0 && panels[a.panel]!.kind !== 'title')) continue;
    const lim = a.panel >= 0 ? pbox[a.panel]! : { x0: 0, y0: 0, x1: w, y1: h };
    const probe = { x0: a.box.x0, y0: a.box.y1 + 1, x1: Math.min(lim.x1 - 2, a.box.x1 + a.size), y1: Math.min(lim.y1 - 2, a.box.y1 + Math.round(a.size * 2)) };
    if (probe.y1 - probe.y0 < 4 || probe.x1 - probe.x0 < 4) continue;
    if (a.panel < 0 && pbox.some((pb) => Math.min(pb.x1, probe.x1) > Math.max(pb.x0, probe.x0) && Math.min(pb.y1, probe.y1) > Math.max(pb.y0, probe.y0))) continue;
    const m = measureInk(px, w, h, probe, 60);
    if (!m.box || m.box.y1 - m.box.y0 < a.size * 0.6 || m.box.y0 - a.box.y1 > a.size * 1.2) continue;
    const cap = m.cap >= 3 ? m.cap : (m.box.y1 - m.box.y0) * 0.75;
    const t: L = { box: m.box, color: m.fill ?? a.color, size: m.box.y1 - m.box.y0, em: cap / 0.72, base: m.baseline ?? m.box.y1, weight: m.stroke >= 0.17 ? 700 : 400, k: 10_000 + a.k, panel: a.panel };
    live.push(t);
  }
  // Label / figure PAIRS anywhere else (a header strip, figures under a chart): the next KPIs.
  const pool = live.filter((t) => !used.has(t.k)).sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0);
  for (const a of pool) {
    if (used.has(a.k)) continue;
    const b = pool.find((c) => {
      if (c === a || used.has(c.k) || c.panel !== a.panel) return false;
      const gap = c.box.y0 - a.box.y1;
      const ov = Math.min(a.box.x1, c.box.x1) - Math.max(a.box.x0, c.box.x0);
      return gap >= -2 && gap <= Math.max(a.size, c.size) * 1.1 && ov >= Math.min(a.box.x1 - a.box.x0, c.box.x1 - c.box.x0) * 0.4 && (Math.abs(a.em - c.em) >= Math.min(a.em, c.em) * 0.12 || a.weight !== c.weight);
    });
    if (!b) continue;
    // The figure: the bigger type, or the bolder one at a similar size.
    const score = (x: L) => x.em * (x.weight >= 700 ? 1.15 : 1);
    const [val, lab] = score(b) > score(a) ? [b, a] : [a, b];
    lineOut(val, 'pairValue', kpi);
    lineOut(lab, 'pairLabel', kpi);
    used.add(a.k);
    used.add(b.k);
    kpi++;
  }
  // LISTS (menus, sidebars, slicers): left-aligned columns; a line in another colour / bigger opens a section.
  const rest = live.filter((t) => !used.has(t.k) && (t.panel < 0 || panels[t.panel]!.kind === 'filter' || panels[t.panel]!.kind === 'title'));
  // A brand / logo plate near the top-left: a big line standing alone above the menu.
  for (const t of rest) {
    const below = rest.filter((u) => u !== t && u.box.y0 > t.box.y1 && Math.abs(u.box.x0 - t.box.x0) < w * 0.06).sort((a, b) => a.box.y0 - b.box.y0)[0];
    if (t.size >= med * 1.35 && t.box.x0 < w * 0.25 && t.box.y0 < h * 0.35 && (!below || below.box.y0 - t.box.y1 > t.size * 1.6)) {
      lineOut(t, 'brand', 0, 0, 'middle');
      used.add(t.k);
    }
  }
  const cols: L[][] = [];
  for (const t of rest.filter((x) => !used.has(x.k)).sort((a, b) => a.box.y0 - b.box.y0)) {
    // Same left edge, and close below the column's last line (a far line starts another list).
    const c = cols.find((col) => Math.abs(col[0]!.box.x0 - t.box.x0) < w * 0.02 && t.box.y0 - col[col.length - 1]!.box.y1 < Math.max(t.size, col[col.length - 1]!.size) * 4);
    if (c) c.push(t);
    else cols.push([t]);
  }
  let section = 0;
  for (const col of cols.filter((c) => c.length >= 3).sort((a, b) => a[0]!.box.x0 - b[0]!.box.x0)) {
    col.sort((a, b) => a.box.y0 - b.box.y0);
    // The items' colour: the line colour with the most look-alikes (anti-aliasing makes every measure a bit different).
    const near = (a: string, b: string) => {
      const [r1, g1, b1] = parseHex(a);
      const [r2, g2, b2] = parseHex(b);
      return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) <= 60;
    };
    const itemColor = [...col].sort((a, b) => col.filter((u) => near(u.color, b.color)).length - col.filter((u) => near(u.color, a.color)).length)[0]!.color;
    const [ir, ig, ib] = parseHex(itemColor);
    const itemEm = median(col.map((t) => t.em));
    // A section header: another colour (« Stores » in orange over white items), or clearly bigger type.
    const isHeader = (t: L) => {
      const [r, g, b] = parseHex(t.color);
      const d = Math.abs(r - ir) + Math.abs(g - ig) + Math.abs(b - ib);
      return d > 90 || (t.em >= itemEm * 1.3 && d > 30);
    };
    let item = 0;
    let opened = false;
    for (const t of col) {
      if (isHeader(t)) {
        if (opened) section++;
        lineOut(t, 'listHeader', section);
        opened = true;
        item = 0;
      } else {
        lineOut(t, 'listItem', section, item++);
        opened = true;
      }
      used.add(t.k);
    }
    section++;
  }
  // Left: a big line near the top-left (a brand / logo plate) takes the dashboard's name; a lone line in a strip is its
  // heading; anything else is erased (the image's words are never kept).
  for (const t of live) {
    if (used.has(t.k)) continue;
    if (t.panel < 0 && t.size >= med * 1.3 && t.box.x0 < w * 0.25 && t.box.y0 < h * 0.35) lineOut(t, 'brand');
    else if (t.panel >= 0 && panels[t.panel]!.kind === 'title' && t.box.x0 > (pbox[t.panel]!.x0 + pbox[t.panel]!.x1) / 2) lineOut(t, 'subtitle');
    else if (t.panel >= 0 && panels[t.panel]!.kind === 'title' && t.size >= med * 1.2 && !out.some((x) => x.role === 'stripTitle' && x.panel === t.panel)) lineOut(t, 'stripTitle');
    else lineOut(t, 'erase');
    used.add(t.k);
  }
  for (const ov of overlays) zones.push(ov);
  if (overlays.length) notes.push(`${overlays.length} incrustation(s) de miniature retirée(s) (autocollant, bouton)`);
  // ── 7. the transferred background: the image, with only the zones replaced ──────────────────────────────────────
  const bg = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N * 4; i++) bg[i] = px[i]!;
  // Marks: the cleaner's content-free surface, inside the plot / ring zones only.
  const markZones = [...plots.map((p) => toPx(p.box)), ...rings.flatMap((r) => r.rings.map((g) => ({ x0: Math.round((g.cx - g.r - g.thick) * w) - 2, y0: Math.round(g.cy * h - (g.r + g.thick) * w) - 2, x1: Math.round((g.cx + g.r + g.thick) * w) + 2, y1: Math.round(g.cy * h + (g.r + g.thick) * w) + 2 })))];
  for (const z of markZones)
    for (let y = Math.max(0, z.y0); y < Math.min(h, z.y1); y++)
      for (let x = Math.max(0, z.x0); x < Math.min(w, z.x1); x++) {
        const i = y * w + x;
        if (!o.erased[i]) continue;
        bg[i * 4] = o.cleanBg[i * 4]!;
        bg[i * 4 + 1] = o.cleanBg[i * 4 + 1]!;
        bg[i * 4 + 2] = o.cleanBg[i * 4 + 2]!;
      }
  // Texts: their ink pixels take the cleaner's surface (panel background model, or the diffusion of the kept pixels
  // around) — the rest of the box stays the image's own pixels. Residual ink (thick outlined letters, overlays) is
  // interpolated from the box's surroundings.
  const textBoxes2 = out.map((l) => grow(toPx(l.box), 3, w, h));
  for (const b of textBoxes2)
    for (let y = b.y0; y < b.y1; y++)
      for (let x = b.x0; x < b.x1; x++) {
        const i = y * w + x;
        if (!o.erased[i]) continue;
        bg[i * 4] = o.cleanBg[i * 4]!;
        bg[i * 4 + 1] = o.cleanBg[i * 4 + 1]!;
        bg[i * 4 + 2] = o.cleanBg[i * 4 + 2]!;
      }
  const flatBoxes = new Set<PxBox>();
  // Halo: the faint anti-aliased rim of the old glyphs (kept by the cleaner, too close to the surface to be « content »)
  // takes the box's surface colour where it touches erased ink.
  {
    const near = new Uint8Array(N);
    const R = 3;
    for (const b of textBoxes2)
      for (let y = b.y0; y < b.y1; y++)
        for (let x = b.x0; x < b.x1; x++) {
          if (!o.erased[y * w + x]) continue;
          for (let dy = -R; dy <= R; dy++)
            for (let dx = -R; dx <= R; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && ny >= 0 && nx < w && ny < h) near[ny * w + nx] = 1;
            }
        }
    for (const b of textBoxes2) {
      const bins = new Map<number, { n: number; c: [number, number, number] }>();
      for (let y = b.y0; y < b.y1; y++)
        for (let x = b.x0; x < b.x1; x++) {
          const i = (y * w + x) * 4;
          const key = ((bg[i]! >> 4) << 8) | ((bg[i + 1]! >> 4) << 4) | (bg[i + 2]! >> 4);
          const e = bins.get(key) ?? { n: 0, c: [0, 0, 0] };
          e.n++;
          e.c[0] += bg[i]!;
          e.c[1] += bg[i + 1]!;
          e.c[2] += bg[i + 2]!;
          bins.set(key, e);
        }
      const top = [...bins.values()].sort((a, c) => c.n - a.n)[0];
      if (!top) continue;
      const dom = [top.c[0] / top.n, top.c[1] / top.n, top.c[2] / top.n];
      // A flat surface (most of the box's untouched pixels are its colour): the ink and its rim take that exact colour
      // (the cleaner's diffusion would leave a soft ghost); on a gradient or a picture the cleaner's fill is kept.
      let flatN = 0;
      let keptN = 0;
      for (let y = b.y0; y < b.y1; y++)
        for (let x = b.x0; x < b.x1; x++) {
          const k = y * w + x;
          if (o.erased[k] || near[k]) continue;
          keptN++;
          const i = k * 4;
          if (Math.abs(px[i]! - dom[0]!) + Math.abs(px[i + 1]! - dom[1]!) + Math.abs(px[i + 2]! - dom[2]!) <= 24) flatN++;
        }
      const flat = keptN > 0 && flatN >= keptN * 0.85;
      if (flat) flatBoxes.add(b);
      for (let y = b.y0; y < b.y1; y++)
        for (let x = b.x0; x < b.x1; x++) {
          const k = y * w + x;
          // Flat surface: the whole box is that surface (a glyph cut by a panel edge included).
          if (!flat && (!near[k] || o.erased[k])) continue;
          const i = k * 4;
          const d = Math.abs(bg[i]! - dom[0]!) + Math.abs(bg[i + 1]! - dom[1]!) + Math.abs(bg[i + 2]! - dom[2]!);
          if (d > 14 && (flat || d < 140)) {
            bg[i] = dom[0]!;
            bg[i + 1] = dom[1]!;
            bg[i + 2] = dom[2]!;
          }
        }
    }
  }
  const residual: PxBox[] = [];
  for (const b of textBoxes2) {
    if (flatBoxes.has(b)) continue;
    const m = measureInk(bg, w, h, b, 70);
    if (m.box && area(m.box) > 0 && m.density * area(m.box) > area(b) * 0.03) residual.push(grow(m.box, 2, w, h));
  }
  const erase = [...residual, ...overlays];
  const blocked = [...erase, ...textBoxes2];
  for (const b of [...erase].sort((a, c) => area(c) - area(a))) inpaintBox(bg, w, h, b, blocked.filter((x) => x !== b));
  // The spec the exports read: overlays out, kinds corrected, the plan attached.
  const remap = new Map<number, number>();
  const kept: Panel[] = [];
  panels.forEach((p, i) => {
    if (!keepIdx[i]) return;
    remap.set(i, kept.length);
    kept.push(p);
  });
  const fix = (i: number) => (i >= 0 ? (remap.get(i) ?? -1) : -1);
  const plan: TransferPlan = {
    version: 1,
    lines: out.map((l) => ({ ...l, panel: fix(l.panel) })),
    plots: plots.filter((p) => remap.has(p.panel)).map((p) => ({ ...p, panel: remap.get(p.panel)! })),
    rings: rings.filter((r) => remap.has(r.panel)).map((r) => ({ ...r, panel: remap.get(r.panel)! })),
    zones: zones.map(toFr),
    overlays: overlays.map(toFr),
    kinds: kinds.filter((k) => remap.has(k.panel)).map((k) => ({ ...k, panel: remap.get(k.panel)! })),
  };
  panels = kept;
  const spec: DashSpec = { ...o.spec, panels, transfer: plan };
  return { plan, spec, bg, notes };
}

/** Share (0–100) of the pixels OUTSIDE the replaced zones that are identical to the image (within a small tolerance). */
export function identityOutside(src: ArrayLike<number>, cur: ArrayLike<number>, w: number, h: number, zones: Box[], tol = 36): number {
  const z = zones.map((b) => ({ x0: Math.floor(b.x * w) - 1, y0: Math.floor(b.y * h) - 1, x1: Math.ceil((b.x + b.w) * w) + 1, y1: Math.ceil((b.y + b.h) * h) + 1 }));
  let n = 0;
  let ok = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (z.some((b) => contains(b, x, y))) continue;
      const i = (y * w + x) * 4;
      n++;
      if (Math.abs(src[i]! - cur[i]!) + Math.abs(src[i + 1]! - cur[i + 1]!) + Math.abs(src[i + 2]! - cur[i + 2]!) <= tol) ok++;
    }
  return n ? Math.round((ok / n) * 1000) / 10 : 0;
}

/** Share (0–100) of the image covered by the replaced zones (what the identity measure leaves out). */
export function zonesShare(zones: Box[], w: number, h: number): number {
  const m = new Uint8Array(w * h);
  for (const b of zones) {
    const x0 = Math.max(0, Math.floor(b.x * w) - 1);
    const y0 = Math.max(0, Math.floor(b.y * h) - 1);
    const x1 = Math.min(w, Math.ceil((b.x + b.w) * w) + 1);
    const y1 = Math.min(h, Math.ceil((b.y + b.h) * h) + 1);
    for (let y = y0; y < y1; y++) m.fill(1, y * w + x0, y * w + x1);
  }
  let n = 0;
  for (let i = 0; i < m.length; i++) n += m[i]!;
  return Math.round((n / Math.max(1, m.length)) * 1000) / 10;
}

/** Luminance contrast helper for the texts drawn on the transferred background. */
export const lumHexT = (c: string) => {
  const [r, g, b] = parseHex(c);
  return lumOf(r, g, b);
};
