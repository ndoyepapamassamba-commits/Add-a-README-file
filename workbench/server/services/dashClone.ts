/**
 * DASHBOARD CLONE — a dashboard image found on the Internet rebuilt as a PHOTO-FAITHFUL copy filled with the user's data.
 * The reproduction comes from the image's PIXELS, never from a model's summary:
 *  1. geometry: page background, outer frame, title band and every panel (recursive XY-cut on the non-background mask,
 *     the classic document-layout algorithm), as fractions of the image;
 *  2. style per panel, measured: fill, border colour / width, corner radius, and the EXACT series colours (k-means on the
 *     panel's chromatic pixels — a blue sequential palette stays a blue sequential palette);
 *  3. kind per panel: a vision model labels the NUMBERED boxes drawn on the image (set-of-marks prompting); a pixel
 *     classifier (circularity, run lengths, fill ratio) is the fallback and the tie-breaker;
 *  4. rendering: one SVG at the image's aspect ratio, each panel at its exact place with its exact colours, the user's
 *     figures inside; a fidelity score compares the reproduction with the image.
 * Pure functions (RGBA in → spec / SVG / score out); the browser decodes, annotates and rasterises.
 */
import { analyzeLogo, rgbToHex, type RGB } from './logoHarmony';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type PanelKind = 'kpi' | 'bar' | 'hbar' | 'line' | 'area' | 'pie' | 'donut' | 'gauge' | 'table' | 'text' | 'title' | 'map' | 'image' | 'filter';
export const PANEL_KINDS: PanelKind[] = ['kpi', 'bar', 'hbar', 'line', 'area', 'pie', 'donut', 'gauge', 'table', 'text', 'title', 'map', 'image', 'filter'];
export interface PanelStyle {
  fill: string;
  border: string | null;
  borderWidth: number;
  radius: number;
  /** Series colours measured in the panel, most used first. */
  colors: string[];
  /** Same colours from dark to light (sequential palettes: biggest value = darkest). */
  ramp: string[];
  text: string;
  /** The colours form one hue family (shades of one colour). */
  sequential: boolean;
}
export interface Panel extends PanelStyle {
  /** Box in fractions of the image (0..1). */
  box: Box;
  kind: PanelKind;
  /** Several KPI tiles in one box (a row of cards). */
  tiles: number;
  /** Measured fill of each tile (cards of different colours). */
  tileFills?: string[];
  titleAlign: 'left' | 'center';
  valueLabels: boolean;
  legend: 'none' | 'right' | 'bottom';
  /** Where the image's own panel title was (fractions of the image), its colour and height — the new title goes there. */
  titleBox?: Box;
  titleColor?: string;
  /** KPI: where the big figure was, and its colour. */
  valueBox?: Box;
  valueColor?: string;
  /** Navigation / slicer panels: every text slot of the image (menu items, buttons) — filled with the user's labels. */
  slots?: { box: Box; color: string }[];
}
export interface DashSpec {
  version: 1;
  /** Aspect ratio of the source image (width / height). */
  aspect: number;
  outer: string;
  frame: { color: string; width: number; radius: number } | null;
  page: string;
  /** Page area inside the frame, fractions of the image. */
  pageBox: Box;
  title: { box: Box; color: string; align: 'left' | 'center'; fill: string | null } | null;
  panels: Panel[];
  font: string;
  /** Main colours of the whole design (for Office exports): primary, accent, dark text. */
  palette: { primary: string; accent: string; dark: string; series: string[] };
  source?: string;
  /**
   * The image's design with its content removed (data URL, same size as the analysed image): backgrounds, gradients,
   * cards, bands, frames, shadows. When present the reproduction is drawn ON it (only texts and data are new).
   */
  background?: string;
  /** The first free text line of the image below its title (subtitle, brand strip): the source / date goes there. */
  subtitle?: { box: Box; color: string } | null;
}

/**
 * Places the image's text lines on the spec: the main title (biggest line above the panels), each panel's title (first
 * line in its top band) and each KPI's big figure (tallest line in the tile) — boxes and colours as measured.
 */
export function attachTexts(spec: DashSpec, texts: { box: { x0: number; y0: number; x1: number; y1: number }; color: string; size: number }[], w: number, h: number): DashSpec {
  const fr = (b: { x0: number; y0: number; x1: number; y1: number }): Box => ({ x: b.x0 / w, y: b.y0 / h, w: (b.x1 - b.x0) / w, h: (b.y1 - b.y0) / h });
  const inside = (t: { box: { x0: number; y0: number; x1: number; y1: number } }, p: Box) => t.box.x0 >= p.x * w - 2 && t.box.x1 <= (p.x + p.w) * w + 2 && t.box.y0 >= p.y * h - 2 && t.box.y1 <= (p.y + p.h) * h + 2;
  const panels = spec.panels.map((p) => {
    // Lines of the panel — not the anti-aliased slivers of its rounded corners (they touch its edges).
    const m = Math.max(3, Math.min(p.box.w * w, p.box.h * h) * 0.02);
    const own = texts.filter((t) => inside(t, p.box) && t.box.x0 > p.box.x * w + m && t.box.y0 > p.box.y * h + m && t.box.x1 < (p.box.x + p.box.w) * w - m && t.box.y1 < (p.box.y + p.box.h) * h - m);
    if (!own.length) return p;
    // The title: on the first text row of the panel (lines whose top is within half a line of the highest one), the
    // leftmost line — not the legend that shares the row.
    const upper = own.filter((t) => t.box.y0 < (p.box.y + p.box.h * 0.3) * h);
    const y0 = Math.min(...upper.map((t) => t.box.y0));
    const row = upper.filter((t) => t.box.y0 <= y0 + Math.max(4, Math.min(...upper.map((u) => u.size)) * 0.6));
    const top = row.sort((a, b) => a.box.x0 - b.box.x0)[0];
    const out: Panel = { ...p };
    if (p.kind === 'filter' || p.kind === 'title') out.slots = own.map((t) => ({ box: fr(t.box), color: t.color }));
    if (top) {
      out.titleBox = fr(top.box);
      out.titleColor = top.color;
      out.titleAlign = Math.abs((top.box.x0 + top.box.x1) / 2 / w - (p.box.x + p.box.w / 2)) < p.box.w * 0.12 ? 'center' : 'left';
    }
    if (p.kind === 'kpi') {
      const big = [...own].sort((a, b) => b.size - a.size)[0];
      if (big) {
        out.valueBox = fr(big.box);
        out.valueColor = big.color;
        // One line only: it is the figure, the label goes small above it.
        if (big === top) {
          delete out.titleBox;
          delete out.titleColor;
        }
      }
    }
    return out;
  });
  // Main title: a big line (≥ 1.3 × the median text) outside every panel (with a margin), in the top fifth. None in the
  // image (title inside a sidebar logo…): none drawn.
  const sizes = texts.map((t) => t.size).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] ?? 0;
  const near = (t: (typeof texts)[number], p: Box) => t.box.x1 > (p.x - 0.01) * w && t.box.x0 < (p.x + p.w + 0.01) * w && t.box.y1 > (p.y - 0.01) * h && t.box.y0 < (p.y + p.h + 0.01) * h;
  const free = texts
    .filter((t) => t.box.y0 < h * 0.2 && t.size >= median * 1.3 && t.box.x1 - t.box.x0 >= w * 0.12 && !spec.panels.some((p) => near(t, p.box)))
    .sort((a, b) => b.size * (b.box.x1 - b.box.x0) - a.size * (a.box.x1 - a.box.x0));
  // No free big line: the biggest line inside the title zone the pixels found (a title right above the panels).
  const zone = spec.title?.box;
  const inZone = zone ? texts.filter((t) => t.box.x0 >= (zone.x - 0.01) * w && t.box.x1 <= (zone.x + zone.w + 0.01) * w && t.box.y0 >= (zone.y - 0.02) * h && t.box.y1 <= (zone.y + zone.h + 0.02) * h).sort((a, b) => b.size * (b.box.x1 - b.box.x0) - a.size * (a.box.x1 - a.box.x0)) : [];
  const main = free[0] ?? inZone[0];
  const title = main ? { box: fr(main.box), color: main.color, align: (Math.abs((main.box.x0 + main.box.x1) / 2 - w / 2) < w * 0.08 ? 'center' : 'left') as 'left' | 'center', fill: null } : spec.background ? null : spec.title;
  const sub = texts
    .filter((t) => t !== main && t.box.y0 < h * 0.3 && (!main || t.box.y0 >= main.box.y1 - 2) && !spec.panels.some((p) => near(t, p.box)))
    .sort((a, b) => a.box.x0 - b.box.x0 || a.box.y0 - b.box.y0)[0];
  return { ...spec, panels, title, subtitle: sub ? { box: fr(sub.box), color: sub.color } : null };
}

// ── colour helpers ───────────────────────────────────────────────────────────────────────────────────────────────────
const d2 = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const chroma = (c: RGB) => (Math.max(...c) - Math.min(...c)) / 255;
const lum = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const hue = (c: RGB) => {
  const [r, g, b] = c.map((x) => x / 255) as RGB;
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (!d) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const hueGap = (a: RGB, b: RGB) => {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
};
const hexRgb = (h: string): RGB => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16)) as RGB;
const at = (px: ArrayLike<number>, w: number, x: number, y: number): RGB => {
  const o = (y * w + x) * 4;
  return [px[o]!, px[o + 1]!, px[o + 2]!];
};
/** Most frequent colour (quantised to 8 levels per channel, averaged inside the winning bucket). */
function modeColor(px: ArrayLike<number>, w: number, pts: Iterable<[number, number]>): RGB {
  const buckets = new Map<number, [number, number, number, number]>();
  for (const [x, y] of pts) {
    const c = at(px, w, x, y);
    const k = ((c[0] >> 5) << 6) | ((c[1] >> 5) << 3) | (c[2] >> 5);
    const b = buckets.get(k) ?? [0, 0, 0, 0];
    b[0] += c[0];
    b[1] += c[1];
    b[2] += c[2];
    b[3]++;
    buckets.set(k, b);
  }
  let best: [number, number, number, number] = [255, 255, 255, 1];
  for (const b of buckets.values()) if (b[3] > best[3]) best = b;
  return [Math.round(best[0] / best[3]), Math.round(best[1] / best[3]), Math.round(best[2] / best[3])];
}
function* grid(x0: number, y0: number, x1: number, y1: number, step = 1): Generator<[number, number]> {
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) yield [x, y];
}

// ── 1. geometry ──────────────────────────────────────────────────────────────────────────────────────────────────────
interface PxBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface Detection {
  page: RGB;
  outer: RGB;
  frame: { color: RGB; width: number; radius: number } | null;
  pageBox: PxBox;
  title: PxBox | null;
  panels: PxBox[];
  /** How well the panel edges are explained by the image (0–1): low = ask the vision model for the boxes. */
  score: number;
  /** Header strip at the top of a framed container (brand / subtitle band). */
  band?: PxBox | null;
}

/**
 * NESTED CONTAINER (dark dashboards): the page colour forms one big region framed by a thin line inside a different
 * (often gradient) background; a header strip may run along its top; the title sits ABOVE it, on the background.
 * Returns the container box (strip included), the strip, the frame line colour, or null.
 */
function findContainer(px: ArrayLike<number>, w: number, h: number, page: RGB): { box: PxBox; strip: PxBox | null; line: RGB | null } | null {
  const s = Math.max(2, Math.round(Math.min(w, h) / 160));
  const gw = Math.ceil(w / s);
  const gh = Math.ceil(h / s);
  const isPage = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) if (d2(at(px, w, Math.min(w - 1, gx * s), Math.min(h - 1, gy * s)), page) < 11 ** 2) isPage[gy * gw + gx] = 1;
  // Largest 4-connected component of page cells.
  const seen = new Uint8Array(gw * gh);
  let best: PxBox | null = null;
  let bestN = 0;
  const stack: number[] = [];
  for (let i = 0; i < gw * gh; i++) {
    if (!isPage[i] || seen[i]) continue;
    let n = 0;
    let x0 = gw;
    let y0 = gh;
    let x1 = 0;
    let y1 = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % gw;
      const y = (k - x) / gw;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const nb of [x > 0 ? k - 1 : -1, x < gw - 1 ? k + 1 : -1, y > 0 ? k - gw : -1, y < gh - 1 ? k + gw : -1])
        if (nb >= 0 && isPage[nb] && !seen[nb]) {
          seen[nb] = 1;
          stack.push(nb);
        }
    }
    if (n > bestN) {
      bestN = n;
      best = { x0: x0 * s, y0: y0 * s, x1: Math.min(w, (x1 + 1) * s), y1: Math.min(h, (y1 + 1) * s) };
    }
  }
  if (!best) return null;
  const bw = best.x1 - best.x0;
  const bh = best.y1 - best.y0;
  // A container is inset (by a margin above it at least) and big; the whole image being the page is not one.
  // It spans most of the image (a single panel's interior does not) and leaves a title zone above it.
  if (bw < w * 0.7 || bh < h * 0.55 || best.y0 < h * 0.06) return null;
  // Above it: not the page colour (the background the title sits on).
  let notPage = 0;
  let total = 0;
  for (let y = 0; y < best.y0 * 0.6; y += s)
    for (let x = best.x0; x < best.x1; x += s * 2) {
      total++;
      if (d2(at(px, w, x, y), page) > 22 ** 2) notPage++;
    }
  if (!total || notPage / total < 0.7) return null;
  // The frame line: the brightest thin horizontal line just above the component (and its strip below it).
  const L = (x: number, y: number) => lum(at(px, w, x, Math.max(0, Math.min(h - 1, y))));
  const xs: number[] = [];
  for (let x = best.x0 + Math.round(bw * 0.05); x < best.x1 - bw * 0.05; x += Math.max(1, Math.round(bw / 60))) xs.push(x);
  let lineY = -1;
  let lineScore = 0;
  for (let y = best.y0 - 1; y > Math.max(2, best.y0 - h * 0.15); y--) {
    const sc = xs.reduce((a, x) => a + (L(x, y) - (L(x, y - 3) + L(x, y + 3)) / 2), 0) / xs.length;
    if (sc > lineScore) {
      lineScore = sc;
      lineY = y;
    }
  }
  const hasLine = lineScore > 0.04;
  const top = hasLine ? lineY : best.y0;
  // The header strip under the frame line: rows whose typical colour is not the page's (a horizontal gradient strip
  // fades into the page colour on one side: the median distance is what counts).
  let stripEnd = hasLine ? lineY + 2 : best.y0;
  if (hasLine) {
    const xs2 = xs.filter((_, k) => k % 2 === 0);
    for (let y = lineY + 2; y < Math.min(h - 1, lineY + h * 0.12); y++) {
      const ds = xs2.map((x) => Math.sqrt(d2(at(px, w, x, y), page))).sort((a, b) => a - b);
      if ((ds[Math.floor(ds.length / 2)] ?? 0) <= 9) break;
      stripEnd = y + 1;
    }
  }
  const strip = hasLine && stripEnd - lineY > h * 0.025 ? { x0: best.x0, y0: lineY + 2, x1: best.x1, y1: stripEnd } : null;
  // Left frame line, if any, just left of the component.
  let x0 = best.x0;
  for (let x = best.x0 - 1; x > Math.max(1, best.x0 - w * 0.04); x--) {
    const ys = [0.3, 0.5, 0.7].map((f) => Math.round(best!.y0 + bh * f));
    const sc = ys.reduce((a, y) => a + (L(x, y) - (L(x - 3, y) + L(x + 3, y)) / 2), 0) / ys.length;
    if (sc > 0.04) {
      x0 = x;
      break;
    }
  }
  const line = hasLine ? modeColor(px, w, xs.map((x) => [x, lineY] as [number, number])) : null;
  return { box: { x0, y0: top, x1: best.x1, y1: best.y1 }, strip, line };
}
/** The title on the background above a container: the biggest cluster of bright (or dark) text, not an annotation. */
function titleOutside(px: ArrayLike<number>, w: number, h: number, below: number, bg: RGB): PxBox | null {
  if (below < h * 0.04) return null;
  const bgL = lum(bg);
  const ink = (c: RGB) => Math.abs(lum(c) - bgL) > 0.32;
  const colInk = new Float64Array(w);
  let rows: number[] = [];
  for (let y = 1; y < below - 1; y++) {
    let n = 0;
    for (let x = 0; x < w; x++)
      if (ink(at(px, w, x, y))) {
        colInk[x]!++;
        n++;
      }
    if (n > 2) rows.push(y);
  }
  if (!rows.length) return null;
  // Column segments separated by gaps wider than 3 % of the width: keep the one with the most ink.
  const gap = Math.round(w * 0.03);
  let segs: { a: number; b: number; ink: number }[] = [];
  let cur: { a: number; b: number; ink: number } | null = null;
  let empty = 0;
  for (let x = 0; x < w; x++) {
    if (colInk[x]! > 0) {
      if (!cur) cur = { a: x, b: x, ink: 0 };
      cur.b = x;
      cur.ink += colInk[x]!;
      empty = 0;
    } else if (cur && ++empty > gap) {
      segs.push(cur);
      cur = null;
    }
  }
  if (cur) segs.push(cur);
  segs = segs.sort((p, q) => q.ink - p.ink);
  const seg = segs[0];
  if (!seg || seg.b - seg.a < w * 0.08) return null;
  rows = rows.filter((y) => {
    for (let x = seg.a; x <= seg.b; x++) if (ink(at(px, w, x, y))) return true;
    return false;
  });
  if (!rows.length) return null;
  return { x0: seg.a, y0: rows[0]!, x1: seg.b + 1, y1: rows[rows.length - 1]! + 1 };
}

/** Recursive XY-cut: split a box at background gutters (largest first) until panels remain. */
function xyCut(mask: Uint8Array, w: number, h: number, b: PxBox, depth: number, out: PxBox[]): void {
  // Trim empty margins.
  const rowSum = (y: number) => {
    let s = 0;
    for (let x = b.x0; x < b.x1; x++) s += mask[y * w + x]!;
    return s;
  };
  const colSum = (x: number) => {
    let s = 0;
    for (let y = b.y0; y < b.y1; y++) s += mask[y * w + x]!;
    return s;
  };
  let { x0, y0, x1, y1 } = b;
  const tolR = Math.max(1, Math.round((x1 - x0) * 0.004));
  const tolC = Math.max(1, Math.round((y1 - y0) * 0.004));
  while (y0 < y1 && rowSum(y0) <= tolR) y0++;
  while (y1 > y0 && rowSum(y1 - 1) <= tolR) y1--;
  while (x0 < x1 && colSum(x0) <= tolC) x0++;
  while (x1 > x0 && colSum(x1 - 1) <= tolC) x1--;
  if (x1 - x0 < 4 || y1 - y0 < 4) return;
  const box = { x0, y0, x1, y1 };
  if (depth > 7) return void out.push(box);
  const minGap = Math.max(2, Math.round(Math.min(w, h) * 0.008));
  const gutters = (n0: number, n1: number, sum: (i: number) => number, tol: number) => {
    const g: [number, number][] = [];
    let start = -1;
    for (let i = n0; i < n1; i++) {
      const empty = sum(i) <= tol;
      if (empty && start < 0) start = i;
      if (!empty && start >= 0) {
        if (i - start >= minGap) g.push([start, i]);
        start = -1;
      }
    }
    return g;
  };
  const rowsG = gutters(y0, y1, (y) => {
    let s = 0;
    for (let x = x0; x < x1; x++) s += mask[y * w + x]!;
    return s;
  }, Math.max(1, Math.round((x1 - x0) * 0.004)));
  const colsG = gutters(x0, x1, (x) => {
    let s = 0;
    for (let y = y0; y < y1; y++) s += mask[y * w + x]!;
    return s;
  }, Math.max(1, Math.round((y1 - y0) * 0.004)));
  const widest = (g: [number, number][]) => g.reduce((m, [a, z]) => Math.max(m, z - a), 0);
  const useRows = rowsG.length && (!colsG.length || widest(rowsG) >= widest(colsG));
  const g = useRows ? rowsG : colsG;
  if (!g.length) return void out.push(box);
  let start = useRows ? y0 : x0;
  for (const [a, z] of [...g, [useRows ? y1 : x1, useRows ? y1 : x1] as [number, number]]) {
    const part = useRows ? { x0, y0: start, x1, y1: a } : { x0: start, y0, x1: a, y1 };
    if (part.x1 - part.x0 >= 3 && part.y1 - part.y0 >= 3) xyCut(mask, w, h, part, depth + 1, out);
    start = z;
  }
}

/**
 * Panels drawn with thin borders: long thin runs of ONE colour in both directions are the borders; flood-filling the
 * page without them gives one region per panel interior (bars and gridlines are thick or of another colour).
 */
export function panelsFromLines(px: ArrayLike<number>, w: number, h: number, pg: PxBox, isBg: (c: RGB) => boolean, isWall: (c: RGB) => boolean = () => false): PxBox[] {
  const pw = pg.x1 - pg.x0;
  const ph = pg.y1 - pg.y0;
  type Seg = { a: number; b: number; at: number; c: RGB; horiz: boolean };
  const segs: Seg[] = [];
  const same = (p: RGB, q: RGB) => d2(p, q) < 42 ** 2;
  const thin = (x: number, y: number, c: RGB, horiz: boolean) => {
    let n = 1;
    for (let k = 1; k <= 7; k++) {
      const q = horiz ? (y - k >= 0 ? at(px, w, x, y - k) : null) : x - k >= 0 ? at(px, w, x - k, y) : null;
      if (!q || !same(q, c)) break;
      n++;
    }
    for (let k = 1; k <= 7; k++) {
      const q = horiz ? (y + k < h ? at(px, w, x, y + k) : null) : x + k < w ? at(px, w, x + k, y) : null;
      if (!q || !same(q, c)) break;
      n++;
    }
    return n <= 6;
  };
  for (let y = pg.y0; y < pg.y1; y++) {
    let x = pg.x0;
    while (x < pg.x1) {
      const c = at(px, w, x, y);
      if (isBg(c)) {
        x++;
        continue;
      }
      let e = x + 1;
      while (e < pg.x1 && same(at(px, w, e, y), c)) e++;
      if (e - x >= pw * 0.12 && thin(Math.floor((x + e) / 2), y, c, true)) segs.push({ a: x, b: e, at: y, c, horiz: true });
      x = e;
    }
  }
  for (let x = pg.x0; x < pg.x1; x++) {
    let y = pg.y0;
    while (y < pg.y1) {
      const c = at(px, w, x, y);
      if (isBg(c)) {
        y++;
        continue;
      }
      let e = y + 1;
      while (e < pg.y1 && same(at(px, w, x, e), c)) e++;
      if (e - y >= ph * 0.12 && thin(x, Math.floor((y + e) / 2), c, false)) segs.push({ a: y, b: e, at: x, c, horiz: false });
      y = e;
    }
  }
  if (!segs.length) return [];
  // Border colour: the colour with the longest total of thin lines, present in BOTH directions.
  const groups: { c: RGB; hLen: number; vLen: number }[] = [];
  for (const s of segs) {
    let g = groups.find((x) => same(x.c, s.c));
    if (!g) groups.push((g = { c: s.c, hLen: 0, vLen: 0 }));
    if (s.horiz) g.hLen += s.b - s.a;
    else g.vLen += s.b - s.a;
  }
  // The DARKEST well-represented line colour (a blurred thin line also yields lighter « halo » runs: same line).
  const pageRgb = modeColor(px, w, grid(pg.x0, pg.y0, pg.x1, pg.y1, Math.max(1, Math.floor(Math.min(pw, ph) / 120))));
  const contrast = (c: RGB) => Math.sqrt(d2(c, pageRgb)) / 441.7;
  const border = groups
    .filter((g) => g.hLen > pw * 0.8 && g.vLen > ph * 0.5 && contrast(g.c) > 0.14)
    .sort((a, b) => (b.hLen + b.vLen) * contrast(b.c) ** 2 - (a.hLen + a.vLen) * contrast(a.c) ** 2)[0];
  if (process.env.DBG) console.log('border', border?.c);
  if (!border) return [];
  // A pixel belongs to the line when its colour lies between the page and the border colour (anti-aliased halo).
  const seg: RGB = [border.c[0] - pageRgb[0], border.c[1] - pageRgb[1], border.c[2] - pageRgb[2]];
  const len = seg[0] ** 2 + seg[1] ** 2 + seg[2] ** 2;
  const inLine = (c: RGB) => {
    const t = ((c[0] - pageRgb[0]) * seg[0] + (c[1] - pageRgb[1]) * seg[1] + (c[2] - pageRgb[2]) * seg[2]) / len;
    if (t < 0.3) return false;
    const tt = Math.min(1.2, t);
    return d2(c, [pageRgb[0] + seg[0] * tt, pageRgb[1] + seg[1] * tt, pageRgb[2] + seg[2] * tt]) < 34 ** 2;
  };
  const L = new Uint8Array(w * h);
  for (const s2 of segs) {
    if (!inLine(s2.c)) continue;
    for (let i = s2.a; i < s2.b; i++)
      for (let k = -5; k <= 5; k++) {
        const x = s2.horiz ? i : s2.at + k;
        const y = s2.horiz ? s2.at + k : i;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (inLine(at(px, w, x, y))) L[y * w + x] = 1;
      }
  }
  // The frame and the outside are walls too (a rounded frame corner must not let a panel leak into the title band).
  for (let y = pg.y0; y < pg.y1; y++) for (let x = pg.x0; x < pg.x1; x++) if (isWall(at(px, w, x, y))) L[y * w + x] = 1;
  // Close the small gaps of the lines (a label touching a border, anti-aliasing): dilate by ~0.25 % of the size.
  const rad = Math.max(1, Math.round(Math.min(w, h) / 400));
  const L2 = new Uint8Array(L);
  for (let y = pg.y0; y < pg.y1; y++)
    for (let x = pg.x0; x < pg.x1; x++) {
      if (!L[y * w + x]) continue;
      for (let dy = -rad; dy <= rad; dy++)
        for (let dx = -rad; dx <= rad; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= pg.x0 && xx < pg.x1 && yy >= pg.y0 && yy < pg.y1) L2[yy * w + xx] = 1;
        }
    }
  L.set(L2);
  // Flood-fill the regions closed by the lines.
  const label = new Int32Array(w * h).fill(-1);
  const out: PxBox[] = [];
  const stack: number[] = [];
  let id = 0;
  for (let y0 = pg.y0; y0 < pg.y1; y0++)
    for (let x0 = pg.x0; x0 < pg.x1; x0++) {
      const i0 = y0 * w + x0;
      if (L[i0] || label[i0]! >= 0) continue;
      let area = 0;
      let bx0 = x0;
      let bx1 = x0;
      let by0 = y0;
      let by1 = y0;
      label[i0] = id;
      stack.push(i0);
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % w;
        const y = (i - x) / w;
        area++;
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        if (y > by1) by1 = y;
        const nb = [x > pg.x0 ? i - 1 : -1, x < pg.x1 - 1 ? i + 1 : -1, y > pg.y0 ? i - w : -1, y < pg.y1 - 1 ? i + w : -1];
        for (const j of nb)
          if (j >= 0 && !L[j] && label[j]! < 0) {
            label[j] = id;
            stack.push(j);
          }
      }
      id++;
      const bw = bx1 - bx0 + 1;
      const bh = by1 - by0 + 1;
      // A panel interior: big enough, rectangular, not the whole page (the area outside the panels).
      if (bw < pw * 0.06 || bh < ph * 0.05) continue;
      if (area / (bw * bh) < 0.82) continue;
      if (bw > pw * 0.97 && bh > ph * 0.9) continue;
      // A short band across the top of the page is the title band, not a panel.
      if (bh < ph * 0.12 && bw > pw * 0.6 && by0 - pg.y0 < ph * 0.08) continue;
      out.push({ x0: Math.max(pg.x0, bx0 - 2 - rad), y0: Math.max(pg.y0, by0 - 2 - rad), x1: Math.min(pg.x1, bx1 + 3 + rad), y1: Math.min(pg.y1, by1 + 3 + rad) });
    }
  // Panels separated by a faint line (a light grey rule, a soft shadow): a thin line crossing a region from edge to
  // edge splits it. Gridlines never cross a whole panel (they start after the axis labels).
  const res: PxBox[] = [];
  const queue = [...out];
  while (queue.length) {
    const b = queue.pop()!;
    const cut = crossingLine(px, w, b, pageRgb, h);
    if (!cut) {
      res.push(b);
      continue;
    }
    const parts = cut.vertical ? [{ ...b, x1: cut.at }, { ...b, x0: cut.at + 1 }] : [{ ...b, y1: cut.at }, { ...b, y0: cut.at + 1 }];
    if (parts.every((q) => q.x1 - q.x0 >= pw * 0.06 && q.y1 - q.y0 >= ph * 0.05)) queue.push(...parts);
    else res.push(b);
  }
  return res;
}

/** A thin line (any colour distinct from the page) crossing the whole box, away from its edges. */
function crossingLine(px: ArrayLike<number>, w: number, b: PxBox, page: RGB, h = 0): { vertical: boolean; at: number } | null {
  const bw = b.x1 - b.x0;
  const bh = b.y1 - b.y0;
  // « Thin » is relative to the image size (a blurred 1 px rule is ~1 % of a small image once enlarged).
  const off = Math.max(5, Math.round(Math.max(w, h) / 120));
  const ink = (c: RGB) => d2(c, page) > 26 ** 2;
  const test = (vertical: boolean) => {
    const n0 = vertical ? b.x0 + Math.round(bw * 0.12) : b.y0 + Math.round(bh * 0.12);
    const n1 = vertical ? b.x1 - Math.round(bw * 0.12) : b.y1 - Math.round(bh * 0.12);
    const m0 = vertical ? b.y0 + 3 : b.x0 + 3;
    const m1 = vertical ? b.y1 - 3 : b.x1 - 3;
    let best: { at: number; share: number } | null = null;
    for (let i = n0; i < n1; i++) {
      let hit = 0;
      let tot = 0;
      for (let j = m0; j < m1; j += 2) {
        tot++;
        const c = vertical ? at(px, w, i, j) : at(px, w, j, i);
        if (!ink(c)) continue;
        // Thin: the pixels 5 px on both sides are (nearly) page.
        const a = vertical ? at(px, w, i - off, j) : at(px, w, j, i - off);
        const z = vertical ? at(px, w, i + off, j) : at(px, w, j, i + off);
        if (!ink(a) && !ink(z)) hit++;
      }
      const share = hit / Math.max(1, tot);
      if (share >= 0.9 && (!best || share > best.share)) best = { at: i, share };
    }
    return best;
  };
  const v = test(true);
  const hz = test(false);
  if (v && (!hz || v.share >= hz.share)) return { vertical: true, at: v.at };
  return hz ? { vertical: false, at: hz.at } : null;
}

/** Reading order: rows (tops within 4 % of the page height), then left to right. */
export function readingOrder(bs: PxBox[], pageH: number): PxBox[] {
  const sorted = [...bs].sort((a, b) => a.y0 - b.y0);
  const rows: PxBox[][] = [];
  for (const b of sorted) {
    const row = rows.find((r) => Math.abs(r[0]!.y0 - b.y0) < pageH * 0.04);
    if (row) row.push(b);
    else rows.push([b]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.x0 - b.x0));
}

/** Page background, frame, title band and panels of a dashboard image. */
export function detectLayout(px: ArrayLike<number>, w: number, h: number): Detection {
  const outer = modeColor(px, w, [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]]);
  // The page colour is the most frequent colour of the central area.
  const page = modeColor(px, w, grid(Math.floor(w * 0.1), Math.floor(h * 0.1), Math.ceil(w * 0.9), Math.ceil(h * 0.9), Math.max(1, Math.floor(Math.min(w, h) / 200))));
  const far = (c: RGB) => d2(c, page) > 38 ** 2;
  // Frame: bands at the edges that are not the page colour.
  const rowCover = (y: number) => {
    let n = 0;
    for (let x = 0; x < w; x++) if (far(at(px, w, x, y))) n++;
    return n / w;
  };
  const colCover = (x: number) => {
    let n = 0;
    for (let y = 0; y < h; y++) if (far(at(px, w, x, y))) n++;
    return n / h;
  };
  let t = 0;
  let bm = h;
  let l = 0;
  let r = w;
  const maxBand = 0.12;
  while (t < h * maxBand && rowCover(t) > 0.8) t++;
  while (bm > h * (1 - maxBand) && rowCover(bm - 1) > 0.8) bm--;
  while (l < w * maxBand && colCover(l) > 0.8) l++;
  while (r > w * (1 - maxBand) && colCover(r - 1) > 0.8) r--;
  let frame: Detection['frame'] = null;
  // Each side on its own: a cropped image may have the frame on 2 or 3 sides only.
  const sides = [t, h - bm, l, w - r].filter((x) => x >= 2);
  let frameRgb: RGB | null = null;
  if (sides.length >= 2) {
    const band: [number, number][] = [];
    for (let y = 0; y < t; y++) for (let x = Math.floor(w * 0.2); x < w * 0.8; x += 2) band.push([x, y]);
    for (let y = bm; y < h; y++) for (let x = Math.floor(w * 0.2); x < w * 0.8; x += 2) band.push([x, y]);
    for (let x = 0; x < l; x++) for (let y = Math.floor(h * 0.2); y < h * 0.8; y += 2) band.push([x, y]);
    for (let x = r; x < w; x++) for (let y = Math.floor(h * 0.2); y < h * 0.8; y += 2) band.push([x, y]);
    const notOuter = band.filter(([x, y]) => d2(at(px, w, x, y), outer) > 30 ** 2);
    frameRgb = modeColor(px, w, notOuter.length > band.length * 0.15 ? notOuter : band);
    // Rounded frame: along the diagonal of a framed corner the outer colour lasts longer than on the straight edge.
    const corner = t >= 2 && r < w ? [w - 1, 0, -1, 1] : t >= 2 && l >= 2 ? [0, 0, 1, 1] : [w - 1, h - 1, -1, -1];
    let diag = 0;
    while (diag < Math.min(w, h) / 4 && d2(at(px, w, corner[0]! + corner[2]! * diag, corner[1]! + corner[3]! * diag), outer) < 30 ** 2) diag++;
    frame = { color: frameRgb, width: Math.max(...sides), radius: Math.max(0, Math.round(diag * 2.4)) };
  }
  let pageBox = { x0: l, y0: t, x1: r, y1: bm };
  // A framed container inside a different background wins over the edge bands.
  const cont = findContainer(px, w, h, page);
  let band: PxBox | null = null;
  let outsideTitle: PxBox | null = null;
  if (cont) {
    pageBox = cont.box;
    band = cont.strip;
    frame = { color: cont.line ?? outer, width: Math.max(1, Math.round(Math.min(w, h) / 400)), radius: Math.round(Math.min(w, h) * 0.012) };
    frameRgb = null;
    outsideTitle = titleOutside(px, w, h, cont.box.y0, modeColor(px, w, grid(0, 0, w, Math.max(1, cont.box.y0), Math.max(1, Math.round(w / 200)))));
  }
  // Non-background mask inside the page (the frame colour and the outside colour count as background: a rounded
  // frame's corners must not glue panels together).
  const isBg = (c: RGB) => !far(c) || (frameRgb !== null && d2(c, frameRgb) < 34 ** 2) || (frameRgb !== null && d2(c, outer) < 24 ** 2);
  const mask = new Uint8Array(w * h);
  for (let y = band ? band.y1 : pageBox.y0; y < pageBox.y1; y++) for (let x = pageBox.x0; x < pageBox.x1; x++) if (!isBg(at(px, w, x, y))) mask[y * w + x] = 1;
  // Several segmentations compete; the one whose box edges are best explained by the image wins:
  //  A — bordered panels (often glued to each other): thin border lines close the panels;
  //  B — cards separated by background gutters: recursive XY-cut on the non-background mask;
  //  C — subtle cards (white on light grey, soft shadows): XY-cut on a finer mask.
  const isWall = (c: RGB) => frameRgb !== null && (d2(c, frameRgb) < 34 ** 2 || d2(c, outer) < 24 ** 2);
  const pw = pageBox.x1 - pageBox.x0;
  const ph = pageBox.y1 - pageBox.y0;
  const pageArea = Math.max(1, pw * ph);
  const titleAbove = (panels: PxBox[]): PxBox | null => {
    const top = Math.min(...panels.map((b) => b.y0));
    if (top - pageBox.y0 <= ph * 0.03) return null;
    let x0 = pageBox.x1;
    let x1 = pageBox.x0;
    let y0 = top;
    let y1 = pageBox.y0;
    for (let y = pageBox.y0; y < top; y++)
      for (let x = pageBox.x0; x < pageBox.x1; x++)
        if (mask[y * w + x]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    return x1 > x0 && y1 > y0 ? { x0, y0, x1: x1 + 1, y1: y1 + 1 } : null;
  };
  const fromLeaves = (input: PxBox[]): { title: PxBox | null; panels: PxBox[] } => {
    const leaves = [...input].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    let title: PxBox | null = null;
    const first = leaves[0];
    if (first && first.y0 - pageBox.y0 < ph * 0.12 && first.y1 - first.y0 < ph * 0.1 && leaves.length > 1) {
      const line = leaves.filter((b) => b.y0 < first.y1 && b.y1 - b.y0 < ph * 0.1);
      title = { x0: Math.min(...line.map((b) => b.x0)), y0: Math.min(...line.map((b) => b.y0)), x1: Math.max(...line.map((b) => b.x1)), y1: Math.max(...line.map((b) => b.y1)) };
      for (const b of line) leaves.splice(leaves.indexOf(b), 1);
    }
    const minW = pw * 0.06;
    const minH = ph * 0.05;
    let panels = leaves.filter((b) => b.x1 - b.x0 >= 2 && b.y1 - b.y0 >= 2).map((b) => ({ ...b }));
    for (const s2 of [...panels]) {
      if (s2.y1 - s2.y0 >= minH * 1.2) continue;
      const below = panels.find((b) => b !== s2 && b.y0 >= s2.y1 && b.y0 - s2.y1 < ph * 0.04 && Math.min(b.x1, s2.x1) - Math.max(b.x0, s2.x0) > (s2.x1 - s2.x0) * 0.5);
      if (below) {
        below.y0 = s2.y0;
        below.x0 = Math.min(below.x0, s2.x0);
        below.x1 = Math.max(below.x1, s2.x1);
        panels = panels.filter((b) => b !== s2);
      }
    }
    return { title, panels: panels.filter((b) => b.x1 - b.x0 >= minW && b.y1 - b.y0 >= minH) };
  };
  const candidates: { name: string; title: PxBox | null; panels: PxBox[] }[] = [];
  const byLines = panelsFromLines(px, w, h, pageBox, isBg, isWall);
  if (byLines.length) candidates.push({ name: 'lines', title: titleAbove(byLines), panels: byLines });
  const leaves: PxBox[] = [];
  xyCut(mask, w, h, pageBox, 0, leaves);
  candidates.push({ name: 'gutters', ...fromLeaves(leaves) });
  const soft = new Uint8Array(w * h);
  for (let y = band ? band.y1 : pageBox.y0; y < pageBox.y1; y++) for (let x = pageBox.x0; x < pageBox.x1; x++) {
    const c = at(px, w, x, y);
    if (d2(c, page) > 11 ** 2 && !isWall(c)) soft[y * w + x] = 1;
  }
  const softLeaves: PxBox[] = [];
  xyCut(soft, w, h, pageBox, 0, softLeaves);
  candidates.push({ name: 'cards', ...fromLeaves(softLeaves) });
  // Evidence: along each box edge, is there a real transition (inside ≠ outside) or a drawn line?
  const k = Math.max(2, Math.round(Math.min(w, h) / 220));
  const evidence = (b: PxBox) => {
    let hit = 0;
    let n = 0;
    const probe = (xi: number, yi: number, xo: number, yo: number, xl: number, yl: number, onEdge: boolean) => {
      // A side on the page border proves nothing (any box can touch the border).
      if (onEdge) return;
      n++;
      const ci = at(px, w, Math.min(w - 1, Math.max(0, xi)), Math.min(h - 1, Math.max(0, yi)));
      const co = at(px, w, Math.min(w - 1, Math.max(0, xo)), Math.min(h - 1, Math.max(0, yo)));
      const cl = at(px, w, Math.min(w - 1, Math.max(0, xl)), Math.min(h - 1, Math.max(0, yl)));
      if (d2(ci, co) > 22 ** 2 || (d2(cl, page) > 30 ** 2 && d2(cl, ci) > 20 ** 2)) hit++;
    };
    const sx = Math.max(1, Math.floor((b.x1 - b.x0) / 40));
    const sy = Math.max(1, Math.floor((b.y1 - b.y0) / 30));
    for (let x = b.x0 + sx; x < b.x1 - sx; x += sx) {
      probe(x, b.y0 + k, x, b.y0 - k, x, b.y0, b.y0 - k < pageBox.y0);
      probe(x, b.y1 - 1 - k, x, b.y1 - 1 + k, x, b.y1 - 1, b.y1 - 1 + k >= pageBox.y1);
    }
    for (let y = b.y0 + sy; y < b.y1 - sy; y += sy) {
      probe(b.x0 + k, y, b.x0 - k, y, b.x0, y, b.x0 - k < pageBox.x0);
      probe(b.x1 - 1 - k, y, b.x1 - 1 + k, y, b.x1 - 1, y, b.x1 - 1 + k >= pageBox.x1);
    }
    return n < 8 ? 0.5 : hit / n;
  };
  let best: { name: string; title: PxBox | null; panels: PxBox[]; score: number } | null = null;
  for (const c of candidates) {
    const kept = c.panels.filter((b) => evidence(b) >= 0.42 && (b.x1 - b.x0) * (b.y1 - b.y0) < pageArea * 0.8);
    const area = kept.reduce((sum, b) => sum + (b.x1 - b.x0) * (b.y1 - b.y0) * evidence(b), 0) / pageArea;
    // Plausible dashboards have ~3–16 panels; one giant box explains nothing.
    const n = kept.length;
    const plaus = n === 0 ? 0 : n === 1 ? 0.25 : n === 2 ? 0.7 : n <= 18 ? 1 : n <= 28 ? 0.8 : 0.5;
    const score = Math.min(1, area) * plaus;
    if (process.env.DBG) console.log('cand', c.name, c.panels.length, kept.length, score.toFixed(3));
    if (!best || score > best.score) best = { ...c, panels: kept, score };
  }
  const chosen = best ?? { title: null, panels: [], score: 0 };
  return { page, outer, frame, pageBox, title: outsideTitle ?? chosen.title, panels: readingOrder(chosen.panels, ph), score: chosen.score, band };
}

// ── 2. style per panel ───────────────────────────────────────────────────────────────────────────────────────────────
function crop(px: ArrayLike<number>, w: number, b: PxBox): Uint8ClampedArray {
  const cw = b.x1 - b.x0;
  const ch = b.y1 - b.y0;
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const o = ((y + b.y0) * w + x + b.x0) * 4;
      const d = (y * cw + x) * 4;
      out[d] = px[o]!;
      out[d + 1] = px[o + 1]!;
      out[d + 2] = px[o + 2]!;
      out[d + 3] = 255;
    }
  return out;
}

export function panelStyle(px: ArrayLike<number>, w: number, b: PxBox, page: RGB, avoid: RGB[] = []): PanelStyle {
  const bw = b.x1 - b.x0;
  const bh = b.y1 - b.y0;
  const inset = Math.max(3, Math.round(Math.min(bw, bh) * 0.04));
  const fill = modeColor(px, w, grid(b.x0 + inset, b.y0 + inset, b.x1 - inset, b.y1 - inset, Math.max(1, Math.floor(Math.min(bw, bh) / 60))));
  // Border: the most contrasted ring among the first pixels inside the box edges (anti-aliased lines are a few px wide).
  let border: RGB | null = null;
  let borderWidth = 0;
  let bestScore = 0;
  for (let k = 0; k <= 5; k++) {
    const ring: [number, number][] = [];
    for (let x = b.x0 + inset; x < b.x1 - inset; x += 2) ring.push([x, b.y0 + k], [x, b.y1 - 1 - k]);
    for (let y = b.y0 + inset; y < b.y1 - inset; y += 2) ring.push([b.x0 + k, y], [b.x1 - 1 - k, y]);
    const edge = modeColor(px, w, ring);
    const share = ring.filter(([x, y]) => d2(at(px, w, x, y), edge) < 30 ** 2).length / Math.max(1, ring.length);
    // The line's core (most contrasted ring) beats its lighter anti-aliased halo.
    const score = Math.sqrt(d2(edge, fill)) * (share > 0.45 ? 1 : 0);
    if (share > 0.45 && d2(edge, fill) > 35 ** 2 && score > bestScore) {
      bestScore = score;
      border = edge;
    }
  }
  if (border) {
    const mx = Math.floor((b.x0 + b.x1) / 2);
    let k = 0;
    while (k < 6 && d2(at(px, w, mx, b.y0 + k), border) > 40 ** 2) k++;
    while (k < 12 && d2(at(px, w, mx, b.y0 + k), border) < 45 ** 2) {
      borderWidth++;
      k++;
    }
    borderWidth = Math.max(1, Math.min(4, borderWidth));
  }
  // A card whose fill differs from the page and has no drawn border: no border.
  if (border && d2(border, page) < 20 ** 2) border = null;
  // Corner radius: the page colour survives along the diagonal of a rounded corner.
  let k = 0;
  while (k < Math.min(bw, bh) / 4 && d2(at(px, w, b.x0 + k, b.y0 + k), page) < 30 ** 2 && d2(page, fill) > 15 ** 2) k++;
  const radius = Math.round(k * 2.4);
  // Series colours: k-means on the panel interior, without fill / border / page / text-like greys.
  const inner = { x0: b.x0 + inset, y0: b.y0 + inset, x1: b.x1 - inset, y1: b.y1 - inset };
  const fams = inner.x1 - inner.x0 > 4 && inner.y1 - inner.y0 > 4 ? analyzeLogo(crop(px, w, inner), inner.x1 - inner.x0, inner.y1 - inner.y0, 8, 0.012) : [];
  const excluded = [fill, page, ...avoid, ...(border ? [border] : [])];
  const total = fams.reduce((s, f) => s + f.count, 0) || 1;
  // Colours of the frame / outside bleed into panels that touch them (anti-aliasing): kept far away.
  const series = fams
    .filter((f) => excluded.every((e) => d2(f.color, e) > 34 ** 2) && avoid.every((e) => d2(f.color, e) > 80 ** 2) && f.count / total > 0.004)
    .filter((f) => chroma(f.color) >= 0.12 || (lum(f.color) < 0.35 && f.count / total > 0.05))
    .sort((a, c) => c.count - a.count);
  const colors = series.map((f) => rgbToHex(f.color));
  // Text: the darkest low-chroma family (or white on dark fills).
  const greys = fams.filter((f) => chroma(f.color) < 0.12 && excluded.every((e) => d2(f.color, e) > 34 ** 2));
  const textC = lum(fill) < 0.4 ? [245, 245, 245] as RGB : (greys.sort((a, c) => lum(a.color) - lum(c.color))[0]?.color ?? [40, 40, 40] as RGB);
  const rgbs = series.map((f) => f.color);
  const sequential = rgbs.length >= 2 && rgbs.every((c) => hueGap(c, rgbs[0]!) < 28 || chroma(c) < 0.15);
  return {
    fill: rgbToHex(fill),
    border: border ? rgbToHex(border) : null,
    borderWidth,
    radius,
    colors,
    ramp: [...series].sort((a, c) => lum(a.color) - lum(c.color)).map((f) => rgbToHex(f.color)),
    text: rgbToHex(textC),
    sequential,
  };
}

// ── 3. kind per panel: pixel classifier (fallback / tie-breaker for the vision labels) ──────────────────────────────
export function classifyPanel(px: ArrayLike<number>, w: number, b: PxBox, style: PanelStyle): PanelKind {
  const cols = style.colors.slice(0, 6).map(hexRgb);
  const bw = b.x1 - b.x0;
  const bh = b.y1 - b.y0;
  // Leave the panel title out (top 16 %) and the border ring out (5 % margins); a series drawn in the border's colour
  // (a navy line in a navy-bordered panel) is still ink.
  const y0 = b.y0 + Math.round(bh * 0.16);
  const bRgb = style.border ? hexRgb(style.border) : null;
  const mx0 = b.x0 + Math.round(bw * 0.05);
  const mx1 = b.x1 - Math.round(bw * 0.05);
  const my1 = b.y1 - Math.round(bh * 0.05);
  const isInk = (c: RGB) => cols.some((s) => d2(c, s) < 40 ** 2) || (bRgb !== null && d2(c, bRgb) < 40 ** 2);
  let n = 0;
  let minX = b.x1;
  let maxX = b.x0;
  let minY = b.y1;
  let maxY = y0;
  let hRun = 0;
  let hRuns = 0;
  let vRun = 0;
  let vRuns = 0;
  for (let y = y0; y < my1; y++) {
    let run = 0;
    for (let x = mx0; x < mx1; x++) {
      if (isInk(at(px, w, x, y))) {
        n++;
        run++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else if (run) {
        hRun += run;
        hRuns++;
        run = 0;
      }
    }
    if (run) {
      hRun += run;
      hRuns++;
    }
  }
  for (let x = mx0; x < mx1; x += 2) {
    let run = 0;
    for (let y = y0; y < my1; y++) {
      if (isInk(at(px, w, x, y))) run++;
      else if (run) {
        vRun += run;
        vRuns++;
        run = 0;
      }
    }
    if (run) {
      vRun += run;
      vRuns++;
    }
  }
  const area = (mx1 - mx0) * (my1 - y0);
  const fillRatio = n / Math.max(1, area);
  if ((!cols.length && !bRgb) || fillRatio < 0.008) return bh < bw * 0.45 ? 'kpi' : 'text';
  const iw = maxX - minX + 1;
  const ih = maxY - minY + 1;
  const inBox = n / Math.max(1, iw * ih);
  const avgH = hRun / Math.max(1, hRuns);
  const avgV = vRun / Math.max(1, vRuns);
  // The biggest connected blob of series colour (a pie is one round blob; legend squares are separate small blobs).
  // (Inside a 5 % margin, so the panel border is out; a slice may share the border's colour, so it counts as ink.)
  const ix0 = b.x0 + Math.round(bw * 0.05);
  const ix1 = b.x1 - Math.round(bw * 0.05);
  const iy1 = b.y1 - Math.round(bh * 0.05);
  const borderRgb = style.border ? hexRgb(style.border) : null;
  const blobInk = (c: RGB) => isInk(c) || (borderRgb !== null && d2(c, borderRgb) < 40 ** 2);
  const step = Math.max(1, Math.round((ix1 - ix0) / 140));
  const gw = Math.max(1, Math.ceil((ix1 - ix0) / step));
  const gh = Math.max(1, Math.ceil((iy1 - y0) / step));
  const g = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) if (blobInk(at(px, w, Math.min(ix1 - 1, ix0 + gx * step), Math.min(iy1 - 1, y0 + gy * step)))) g[gy * gw + gx] = 1;
  const seen = new Uint8Array(gw * gh);
  let blob = { n: 0, x0: 0, y0: 0, x1: 0, y1: 0 };
  for (let i = 0; i < gw * gh; i++) {
    if (!g[i] || seen[i]) continue;
    const st = [i];
    seen[i] = 1;
    const cur = { n: 0, x0: gw, y0: gh, x1: 0, y1: 0 };
    while (st.length) {
      const k = st.pop()!;
      const kx = k % gw;
      const ky = (k - kx) / gw;
      cur.n++;
      cur.x0 = Math.min(cur.x0, kx);
      cur.x1 = Math.max(cur.x1, kx);
      cur.y0 = Math.min(cur.y0, ky);
      cur.y1 = Math.max(cur.y1, ky);
      for (const j of [kx > 0 ? k - 1 : -1, kx < gw - 1 ? k + 1 : -1, ky > 0 ? k - gw : -1, ky < gh - 1 ? k + gw : -1]) if (j >= 0 && g[j] && !seen[j]) (seen[j] = 1), st.push(j);
    }
    if (cur.n > blob.n) blob = cur;
  }
  const bwB = blob.x1 - blob.x0 + 1;
  const bhB = blob.y1 - blob.y0 + 1;
  const blobFill = blob.n / Math.max(1, bwB * bhB);
  // Round shape: the corners of its box are empty, the inscribed disc is well covered (slice gaps and very light
  // slices can leave holes: coverage, not a fixed fill ratio).
  let corner = 0;
  let cornerN = 0;
  let disc = 0;
  let discN = 0;
  {
    const cxB = (blob.x0 + blob.x1) / 2;
    const cyB = (blob.y0 + blob.y1) / 2;
    const R = Math.min(bwB, bhB) / 2;
    for (let yy = blob.y0; yy <= blob.y1; yy++)
      for (let xx = blob.x0; xx <= blob.x1; xx++) {
        const d = Math.hypot(xx - cxB, yy - cyB) / Math.max(1, R);
        const v = g[yy * gw + xx] ? 1 : 0;
        if (d > 1.12) {
          cornerN++;
          corner += v;
        } else if (d < 0.9) {
          discN++;
          disc += v;
        }
      }
  }
  const round = cornerN > 0 && corner / cornerN < 0.18 && disc / Math.max(1, discN) > 0.38;
  if (blob.n > 30 && bwB / bhB > 0.75 && bwB / bhB < 1.33 && bwB > gw * 0.2 && (round || (blobFill > 0.5 && blobFill < 0.86))) {
    const cx = Math.round((blob.x0 + blob.x1) / 2);
    const cy = Math.round((blob.y0 + blob.y1) / 2);
    const r = Math.max(1, Math.round(Math.min(bwB, bhB) * 0.12));
    let centre = 0;
    let probes = 0;
    for (let yy = cy - r; yy <= cy + r; yy++)
      for (let xx = cx - r; xx <= cx + r; xx++) {
        probes++;
        if (g[yy * gw + xx]) centre++;
      }
    return centre / Math.max(1, probes) < 0.3 ? 'donut' : 'pie';
  }
  const squareish = iw / ih > 0.7 && iw / ih < 1.4;
  if (squareish && inBox > 0.45 && inBox < 0.9) {
    // Ring or disc: is the centre of the shape ink?
    const cx = Math.round((minX + maxX) / 2);
    const cy = Math.round((minY + maxY) / 2);
    const r = Math.round(Math.min(iw, ih) * 0.12);
    let centre = 0;
    let probes = 0;
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++) {
        probes++;
        if (isInk(at(px, w, x, y))) centre++;
      }
    return centre / Math.max(1, probes) < 0.3 ? 'donut' : 'pie';
  }
  if (inBox < 0.12 && iw > bw * 0.5) return 'line';
  if (style.fill && fillRatio > 0.55) return 'kpi';
  if (avgH > avgV * 1.8) return 'hbar';
  if (avgV > avgH * 1.8) return 'bar';
  return inBox > 0.5 ? 'area' : 'bar';
}

// ── 3b. kind per panel: the vision model on the numbered boxes ──────────────────────────────────────────────────────
export const SOM_PROMPT = (n: number) => `This dashboard image has ${n} numbered RED boxes (1..${n}). For EACH number, say what the box contains. Answer ONLY JSON:
{"panels":[{"id":1,"kind":"kpi|bar|hbar|line|area|pie|donut|gauge|table|text|title|map|image|filter","tiles":1 (how many separate KPI cards inside the box),"title_align":"left|center","value_labels":true|false,"legend":"none|right|bottom"}],"font":"closest font family (Segoe UI, Calibri, Inter, Montserrat, Roboto, Arial, Georgia…)","title_align":"left|center"}
bar = vertical bars/columns, hbar = horizontal bars, gauge = half circle meter. Describe EVERY number once.`;

export interface SomAnswer {
  kinds: Record<number, Partial<Pick<Panel, 'kind' | 'tiles' | 'titleAlign' | 'valueLabels' | 'legend'>>>;
  font?: string;
  titleAlign?: 'left' | 'center';
}
export function parseSom(text: string): SomAnswer | null {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { panels?: Record<string, unknown>[]; font?: unknown; title_align?: unknown };
    const kinds: SomAnswer['kinds'] = {};
    for (const p of j.panels ?? []) {
      const id = Number(p.id);
      if (!Number.isFinite(id)) continue;
      const kind = String(p.kind ?? '').toLowerCase().replace(/[^a-z]/g, '') as PanelKind;
      kinds[id] = {
        kind: PANEL_KINDS.includes(kind) ? kind : undefined,
        tiles: Math.max(1, Math.min(8, Math.round(Number(p.tiles) || 1))),
        titleAlign: p.title_align === 'left' ? 'left' : 'center',
        valueLabels: p.value_labels === true,
        legend: p.legend === 'right' || p.legend === 'bottom' ? p.legend : 'none',
      };
    }
    return { kinds, font: typeof j.font === 'string' ? j.font.replace(/[^\w \-]/g, '').slice(0, 40) : undefined, titleAlign: j.title_align === 'left' ? 'left' : 'center' };
  } catch {
    return null;
  }
}

// ── 3c. when the pixels are ambiguous (photos, mock-ups, blurry thumbnails): the vision model gives the BOXES ─────────
export const BOXES_PROMPT = `This image shows a dashboard / report (it may be a photo, a mock-up or a screenshot). A light grid is drawn every 10 % to help you.
List EVERY visual panel — each card / tile / chart box separately: KPI cards, charts, tables, text blocks, photos, AND navigation sidebars, menus, slicers / filter button groups — plus the main title. Give each bounding box as [x0,y0,x1,y1] in thousandths of the image width / height (0–1000; x0,x1 horizontal from the LEFT edge, y0,y1 vertical from the TOP edge), tight on the card's visible edges. Answer ONLY JSON:
{"title":[x0,y0,x1,y1] or null,"panels":[{"box":[x0,y0,x1,y1],"kind":"kpi|bar|hbar|line|area|pie|donut|gauge|table|text|map|image|filter","tiles":1,"colors":["#RRGGBB"]}],"font":"closest font family","title_align":"left|center"}
kind: bar = vertical columns, hbar = horizontal bars (also funnels and pictogram bars), line, area, pie, donut (also rings / progress circles), gauge = half circle, kpi = big figure card, table, text, map, image = photo or illustration, filter = navigation menu / sidebar / slicer buttons / calendar buttons.
tiles = number of separate KPI cards inside the box. colors = the main colours of the chart's MARKS (bars, slices, lines), most used first (not the card background).
Boxes must not overlap; follow the reading order (rows top to bottom, left to right).`;
export interface VisionBoxes {
  title: Box | null;
  panels: { box: Box; kind?: PanelKind; tiles: number; colors?: string[] }[];
  font?: string;
  titleAlign?: 'left' | 'center';
}
export function parseBoxes(text: string): VisionBoxes | null {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { title?: unknown; panels?: { box?: unknown; kind?: unknown; tiles?: unknown; colors?: unknown }[]; font?: unknown; title_align?: unknown };
    const toBox = (v: unknown): Box | null => {
      if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
      const [x0, y0, x1, y1] = (v as number[]).map((n) => Math.max(0, Math.min(1000, n)) / 1000);
      return x1! - x0! > 0.02 && y1! - y0! > 0.02 ? { x: x0!, y: y0!, w: x1! - x0!, h: y1! - y0! } : null;
    };
    const panels = (j.panels ?? [])
      .map((p) => {
        const box = toBox(p.box);
        const kind = String(p.kind ?? '').toLowerCase().replace(/[^a-z]/g, '') as PanelKind;
        const colors = Array.isArray(p.colors) ? p.colors.filter((c): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c.trim())).map((c) => c.trim().toUpperCase()).slice(0, 6) : [];
        return box ? { box, kind: PANEL_KINDS.includes(kind) ? kind : undefined, tiles: Math.max(1, Math.min(8, Math.round(Number(p.tiles) || 1))), ...(colors.length ? { colors } : {}) } : null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
    if (!panels.length) return null;
    return { title: toBox(j.title), panels, font: typeof j.font === 'string' ? j.font.replace(/[^\w \-]/g, '').slice(0, 40) : undefined, titleAlign: j.title_align === 'left' ? 'left' : 'center' };
  } catch {
    return null;
  }
}
/** Snap each edge of a model's box to the strongest colour transition within ±2.5 % (the model is approximate). */
export function refineBox(px: ArrayLike<number>, w: number, h: number, b: Box): PxBox {
  const box = { x0: Math.round(b.x * w), y0: Math.round(b.y * h), x1: Math.round((b.x + b.w) * w), y1: Math.round((b.y + b.h) * h) };
  const rx = Math.max(3, Math.round(w * 0.025));
  const ry = Math.max(3, Math.round(h * 0.025));
  const k = Math.max(2, Math.round(Math.min(w, h) / 250));
  const clampX = (x: number) => Math.min(w - 1, Math.max(0, x));
  const clampY = (y: number) => Math.min(h - 1, Math.max(0, y));
  const strengthV = (x: number) => {
    let s = 0;
    const step = Math.max(1, Math.floor((box.y1 - box.y0) / 40));
    for (let y = box.y0; y < box.y1; y += step) s += Math.sqrt(d2(at(px, w, clampX(x - k), clampY(y)), at(px, w, clampX(x + k), clampY(y))));
    return s;
  };
  const strengthH = (y: number) => {
    let s = 0;
    const step = Math.max(1, Math.floor((box.x1 - box.x0) / 40));
    for (let x = box.x0; x < box.x1; x += step) s += Math.sqrt(d2(at(px, w, clampX(x), clampY(y - k)), at(px, w, clampX(x), clampY(y + k))));
    return s;
  };
  const snap = (v: number, r: number, f: (t: number) => number, lo: number, hi: number) => {
    let best = v;
    let bestS = f(v) * 1.15; // keep the model's edge unless something clearly stronger is near
    for (let t = Math.max(lo, v - r); t <= Math.min(hi, v + r); t++) {
      const st = f(t);
      if (st > bestS) {
        bestS = st;
        best = t;
      }
    }
    return best;
  };
  const x0 = snap(box.x0, rx, strengthV, 0, w - 1);
  const x1 = snap(box.x1, rx, strengthV, 0, w - 1);
  const y0 = snap(box.y0, ry, strengthH, 0, h - 1);
  const y1 = snap(box.y1, ry, strengthH, 0, h - 1);
  return x1 - x0 > 8 && y1 - y0 > 8 ? { x0, y0, x1, y1 } : box;
}
/** Replace the pixel segmentation by the model's boxes (refined on the pixels); kinds come with them. */
export function withVisionBoxes(px: ArrayLike<number>, w: number, h: number, det: Detection, vb: VisionBoxes): { det: Detection; som: SomAnswer } {
  const panels = vb.panels.map((p) => refineBox(px, w, h, p.box));
  const kinds: SomAnswer['kinds'] = {};
  vb.panels.forEach((p, i) => (kinds[i + 1] = { kind: p.kind, tiles: p.tiles, titleAlign: 'center', valueLabels: true, legend: p.kind === 'pie' || p.kind === 'donut' ? 'right' : 'none' }));
  const title = vb.title ? refineBox(px, w, h, vb.title) : det.title;
  return { det: { ...det, panels, title, score: Math.max(det.score, 0.6) }, som: { kinds, font: vb.font, titleAlign: vb.titleAlign } };
}

// ── spec ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const frac = (b: PxBox, w: number, h: number): Box => ({ x: b.x0 / w, y: b.y0 / h, w: (b.x1 - b.x0) / w, h: (b.y1 - b.y0) / h });

export function buildSpec(px: ArrayLike<number>, w: number, h: number, det: Detection, som: SomAnswer | null, source?: string): DashSpec {
  const page = det.page;
  const panels: Panel[] = det.panels.map((b, i) => {
    const st = panelStyle(px, w, b, page, [det.outer, ...(det.frame ? [det.frame.color] : [])]);
    const label = som?.kinds[i + 1];
    const pixelKind = classifyPanel(px, w, b, st);
    // The vision label wins, except when it contradicts what the pixels clearly show (round shape vs bars).
    let kind = label?.kind ?? pixelKind;
    if ((kind === 'pie' || kind === 'donut') && (pixelKind === 'hbar' || pixelKind === 'bar') && !st.colors.length) kind = pixelKind;
    const tiles = label?.tiles ?? 1;
    // A row of KPI cards: each card's own fill (pastel cards of different colours are common).
    let tileFills: string[] | undefined;
    if (kind === 'kpi' && tiles > 1) {
      const tw = (b.x1 - b.x0) / tiles;
      tileFills = Array.from({ length: tiles }, (_, t) => {
        const x0 = Math.round(b.x0 + t * tw + tw * 0.15);
        const x1 = Math.round(b.x0 + (t + 1) * tw - tw * 0.15);
        return rgbToHex(modeColor(px, w, grid(x0, Math.round(b.y0 + (b.y1 - b.y0) * 0.15), x1, Math.round(b.y1 - (b.y1 - b.y0) * 0.15), 2)));
      });
    }
    return { ...st, box: frac(b, w, h), kind, tiles, tileFills, titleAlign: label?.titleAlign ?? 'center', valueLabels: label?.valueLabels ?? false, legend: label?.legend ?? (kind === 'pie' || kind === 'donut' ? 'right' : 'none') };
  });
  // Consistency: the panels of a design share ONE border colour and ONE text colour — the darkest measured ones
  // (anti-aliasing and small crops make some measures lighter than the real ink).
  const bordered = panels.filter((p) => p.border);
  if (bordered.length >= Math.max(2, panels.length * 0.4)) {
    const darkestBorder = bordered.map((p) => p.border!).sort((a, b) => lum(hexRgb(a)) - lum(hexRgb(b)))[0]!;
    const widths = bordered.map((p) => p.borderWidth).sort((a, b) => a - b);
    for (const p of panels)
      if (!p.border || hueGap(hexRgb(p.border), hexRgb(darkestBorder)) < 40 || chroma(hexRgb(p.border)) < 0.15) {
        p.border = darkestBorder;
        p.borderWidth = Math.max(p.borderWidth, widths[Math.floor(widths.length / 2)]!);
      }
  }
  const inks = panels.map((p) => p.text).filter((t) => lum(hexRgb(t)) < 0.5);
  // Title colour: darkest ink of the title band.
  let title: DashSpec['title'] = null;
  if (det.title) {
    const tb = det.title;
    const fams = analyzeLogo(crop(px, w, tb), tb.x1 - tb.x0, tb.y1 - tb.y0, 4).filter((f) => d2(f.color, page) > 40 ** 2);
    const ink = fams.sort((a, b) => lum(a.color) - lum(b.color))[0]?.color ?? [30, 30, 30];
    const centre = (tb.x0 + tb.x1) / 2;
    const pageCentre = (det.pageBox.x0 + det.pageBox.x1) / 2;
    // A coloured title band (e.g. blue band, white title): its fill, and the ink that contrasts with it.
    const band = modeColor(px, w, grid(tb.x0, tb.y0, tb.x1, tb.y1, Math.max(1, Math.floor((tb.x1 - tb.x0) / 120))));
    const banded = d2(band, page) > 40 ** 2;
    const textInk = banded ? (fams.filter((f) => d2(f.color, band) > 60 ** 2).sort((a, b) => Math.abs(lum(b.color) - lum(band)) - Math.abs(lum(a.color) - lum(band)))[0]?.color ?? (lum(band) < 0.5 ? [255, 255, 255] : [20, 20, 20])) : ink;
    // Blur makes measured ink paler than it is: the title text must stay readable on its band (≥ 3:1).
    const ratio = (a: RGB, b: RGB) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x! + 0.05) / (y! + 0.05);
    };
    const titleInk: RGB = banded && ratio(textInk as RGB, band) < 3 ? (lum(band) < 0.5 ? [255, 255, 255] : [17, 24, 39]) : (textInk as RGB);
    title = { box: frac(tb, w, h), color: rgbToHex(titleInk), align: Math.abs(centre - pageCentre) < (det.pageBox.x1 - det.pageBox.x0) * 0.08 ? 'center' : som?.titleAlign ?? 'left', fill: banded ? rgbToHex(band) : null };
  }
  // Panel text: readable on its fill, else the design's ink (title colour / darkest panel ink).
  // (A title written on a coloured band is not the panels' ink.)
  const ink = [title && !title.fill ? title.color : null, ...inks].filter((c): c is string => Boolean(c) && lum(hexRgb(c!)) < 0.42).sort((a, b) => lum(hexRgb(a)) - lum(hexRgb(b)))[0] ?? '#1F2937';
  for (const p of panels) {
    const f = hexRgb(p.fill);
    if (lum(f) >= 0.45 && (lum(hexRgb(p.text)) > 0.42 || Math.abs(lum(hexRgb(p.text)) - lum(f)) < 0.45)) p.text = ink;
  }
  // Design palette: the most used series colour across panels, a distinct accent, the darkest ink.
  const votes = new Map<string, number>();
  for (const p of panels) p.colors.forEach((c, i) => votes.set(c, (votes.get(c) ?? 0) + (6 - Math.min(5, i)) * p.box.w * p.box.h));
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  // Primary = the brand colour of headers / bands: a strong (not pale) colour of the design.
  const primary = ranked.find((c) => lum(hexRgb(c)) < 0.55 && chroma(hexRgb(c)) >= 0.15) ?? ranked[0] ?? title?.color ?? '#1F4E79';
  // Accent: another hue when the design has one; in a one-hue (sequential) design, a clearly lighter shade.
  const accent = ranked.find((c) => hueGap(hexRgb(c), hexRgb(primary)) >= 30 && chroma(hexRgb(c)) >= 0.15) ?? ranked.find((c) => c !== primary && Math.abs(lum(hexRgb(c)) - lum(hexRgb(primary))) >= 0.18) ?? primary;
  const dark = [title?.color, ...panels.map((p) => p.border), ...ranked].filter((c): c is string => Boolean(c)).sort((a, b) => lum(hexRgb(a)) - lum(hexRgb(b)))[0] ?? '#1F2937';
  return {
    version: 1,
    aspect: w / h,
    outer: rgbToHex(det.outer),
    frame: det.frame ? { color: rgbToHex(det.frame.color), width: det.frame.width / w, radius: det.frame.radius / w } : null,
    page: rgbToHex(page),
    pageBox: frac(det.pageBox, w, h),
    title,
    panels,
    font: som?.font || 'Segoe UI',
    palette: { primary, accent, dark, series: ranked.slice(0, 6) },
    source,
  };
}

// ── 5. fidelity ──────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Visual similarity of two images of the same size (0–100): per cell of a 32×20 grid, the distance between mean colours,
 * on the cells where either image has content (the empty page would inflate the score).
 */
export function fidelityScore(a: ArrayLike<number>, b: ArrayLike<number>, w: number, h: number, page: string): number {
  const gx = 32;
  const gy = 20;
  const pg = hexRgb(page);
  let sum = 0;
  let n = 0;
  for (let cy = 0; cy < gy; cy++)
    for (let cx = 0; cx < gx; cx++) {
      const x0 = Math.floor((cx * w) / gx);
      const x1 = Math.floor(((cx + 1) * w) / gx);
      const y0 = Math.floor((cy * h) / gy);
      const y1 = Math.floor(((cy + 1) * h) / gy);
      const ma = [0, 0, 0];
      const mb = [0, 0, 0];
      let k = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const o = (y * w + x) * 4;
          for (let i = 0; i < 3; i++) {
            ma[i]! += a[o + i]!;
            mb[i]! += b[o + i]!;
          }
          k++;
        }
      if (!k) continue;
      const A = ma.map((v) => v / k) as RGB;
      const B = mb.map((v) => v / k) as RGB;
      if (d2(A, pg) < 12 ** 2 && d2(B, pg) < 12 ** 2) continue;
      sum += Math.sqrt(d2(A, B)) / 441.7;
      n++;
    }
  return n ? Math.max(0, Math.round((1 - (sum / n) * 2.2) * 100)) : 100;
}
