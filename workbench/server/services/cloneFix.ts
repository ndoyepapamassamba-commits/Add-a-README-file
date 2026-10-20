// CONTRÔLEUR DE REPRODUCTION — corrections mesurées sur les pixels (pures, sans modèle) :
//  1. ESPACES NON REMPLIS : zones où l'image a du contenu mais la reproduction n'affiche que le fond → nouveau panneau ;
//  2. COULEURS NON REMPLIES : graphiques sans couleur de série, cartes dont le fond diffère de l'image → couleurs mesurées ;
//  3. GRAPHIQUES : chaque nouveau panneau est essayé sous plusieurs formes, la forme que les pixels préfèrent est gardée.
// Chaque correction n'est GARDÉE que si la fidélité mesurée après rendu s'améliore (le contrôleur le vérifie).
import type { Box, DashSpec, Panel, PanelKind } from './dashClone';

type RGB = [number, number, number];
const d2 = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const hex = (c: RGB) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const chroma = (c: RGB) => (Math.max(...c) - Math.min(...c)) / 255;
const lum = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

/** Colour variance of a cell (content = texture: text, marks, lines). */
function busy(px: ArrayLike<number>, w: number, h: number, x0: number, y0: number, x1: number, y1: number): number {
  let s = 0;
  let s2 = 0;
  let k = 0;
  for (let y = y0; y < y1; y += 2)
    for (let x = x0; x < x1; x += 2) {
      const o = (y * w + x) * 4;
      const l = 0.2126 * px[o]! + 0.7152 * px[o + 1]! + 0.0722 * px[o + 2]!;
      s += l;
      s2 += l * l;
      k++;
    }
  if (!k) return 0;
  const m = s / k;
  return Math.sqrt(Math.max(0, s2 / k - m * m));
}
const inside = (cx: number, cy: number, b: Box) => cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;

/**
 * Zones where the IMAGE has content (texture) but the REPRODUCTION shows a flat area, outside every panel: the spaces
 * the reproduction left empty. Adjacent cells merge into rectangles; tiny zones (< 2 % of the image) are ignored.
 */
export function emptyZones(src: ArrayLike<number>, cur: ArrayLike<number>, w: number, h: number, spec: Pick<DashSpec, 'panels' | 'title'>, gx = 24, gy = 16): Box[] {
  const flag: boolean[] = [];
  for (let cy = 0; cy < gy; cy++)
    for (let cx = 0; cx < gx; cx++) {
      const fx = (cx + 0.5) / gx;
      const fy = (cy + 0.5) / gy;
      const covered = spec.panels.some((p) => inside(fx, fy, p.box)) || (spec.title ? inside(fx, fy, spec.title.box) : false);
      const x0 = Math.floor((cx * w) / gx);
      const x1 = Math.floor(((cx + 1) * w) / gx);
      const y0 = Math.floor((cy * h) / gy);
      const y1 = Math.floor(((cy + 1) * h) / gy);
      flag.push(!covered && busy(src, w, h, x0, y0, x1, y1) > 18 && busy(cur, w, h, x0, y0, x1, y1) < 6);
    }
  // Greedy rectangles: grow right then down over flagged cells.
  const used = new Array<boolean>(gx * gy).fill(false);
  const out: Box[] = [];
  for (let cy = 0; cy < gy; cy++)
    for (let cx = 0; cx < gx; cx++) {
      const i = cy * gx + cx;
      if (!flag[i] || used[i]) continue;
      let x1 = cx;
      while (x1 + 1 < gx && flag[cy * gx + x1 + 1] && !used[cy * gx + x1 + 1]) x1++;
      let y1 = cy;
      const rowOk = (y: number) => {
        for (let x = cx; x <= x1; x++) if (!flag[y * gx + x] || used[y * gx + x]) return false;
        return true;
      };
      while (y1 + 1 < gy && rowOk(y1 + 1)) y1++;
      for (let y = cy; y <= y1; y++) for (let x = cx; x <= x1; x++) used[y * gx + x] = true;
      const b = { x: cx / gx, y: cy / gy, w: (x1 - cx + 1) / gx, h: (y1 - cy + 1) / gy };
      if (b.w * b.h >= 0.02 && (x1 > cx || y1 > cy)) out.push(b);
    }
  return out.sort((a, b) => b.w * b.h - a.w * a.h);
}

/** Dominant colours of a box: fill (the most frequent) + the saturated series colours (most used first, ≤ 6). */
export function boxColors(px: ArrayLike<number>, w: number, h: number, box: Box): { fill: string; series: string[]; text: string } {
  const x0 = Math.max(0, Math.floor(box.x * w));
  const y0 = Math.max(0, Math.floor(box.y * h));
  const x1 = Math.min(w, Math.ceil((box.x + box.w) * w));
  const y1 = Math.min(h, Math.ceil((box.y + box.h) * h));
  const buckets = new Map<number, { n: number; s: [number, number, number] }>();
  for (let y = y0; y < y1; y += 2)
    for (let x = x0; x < x1; x += 2) {
      const o = (y * w + x) * 4;
      const c: RGB = [px[o]!, px[o + 1]!, px[o + 2]!];
      const key = ((c[0] >> 4) << 8) | ((c[1] >> 4) << 4) | (c[2] >> 4);
      const b = buckets.get(key) ?? { n: 0, s: [0, 0, 0] };
      b.n++;
      b.s[0] += c[0];
      b.s[1] += c[1];
      b.s[2] += c[2];
      buckets.set(key, b);
    }
  const list = [...buckets.values()].map((b) => ({ n: b.n, c: b.s.map((v) => v / b.n) as RGB })).sort((a, b) => b.n - a.n);
  const total = list.reduce((a, b) => a + b.n, 0) || 1;
  const fill = list[0]?.c ?? ([255, 255, 255] as RGB);
  const series: RGB[] = [];
  for (const b of list) {
    if (b.n / total < 0.004) break;
    if (chroma(b.c) < 0.25 || d2(b.c, fill) < 60 ** 2) continue;
    if (series.some((s) => d2(s, b.c) < 45 ** 2)) continue;
    series.push(b.c);
    if (series.length >= 6) break;
  }
  return { fill: hex(fill), series: series.map(hex), text: lum(fill) > 0.5 ? '#1F2937' : '#FFFFFF' };
}

/** A new panel for an empty zone: colours measured on the image, shape to be decided by the pixels. */
export function panelFor(px: ArrayLike<number>, w: number, h: number, box: Box, kind: PanelKind): Panel {
  const c = boxColors(px, w, h, box);
  return {
    box,
    kind,
    tiles: 1,
    fill: c.fill,
    border: null,
    borderWidth: 0,
    radius: 6,
    colors: c.series,
    ramp: c.series,
    text: c.text,
    sequential: false,
    titleAlign: 'left',
    valueLabels: false,
    legend: kind === 'pie' || kind === 'donut' ? 'right' : 'none',
  };
}
/** Shapes tried for a new panel, simplest first. */
export const ZONE_KINDS: PanelKind[] = ['kpi', 'bar', 'hbar', 'line', 'area', 'donut', 'table'];
const CHARTS: PanelKind[] = ['bar', 'hbar', 'line', 'area', 'pie', 'donut', 'gauge', 'map'];

/** Colour patches for the panels whose colours were never filled (a chart with no series colour). */
export function colorPatches(px: ArrayLike<number>, w: number, h: number, spec: DashSpec): { i: number; patch: Partial<Panel>; note: string }[] {
  const out: { i: number; patch: Partial<Panel>; note: string }[] = [];
  spec.panels.forEach((p, i) => {
    if (!CHARTS.includes(p.kind) || p.colors.length) return;
    const c = boxColors(px, w, h, p.box);
    const series = c.series.length ? c.series : spec.palette.series.length ? spec.palette.series : [spec.palette.primary, spec.palette.accent];
    out.push({ i, patch: { colors: series, ramp: series, sequential: false }, note: `panneau ${i + 1} : ${series.length} couleur(s) de série ${c.series.length ? 'mesurée(s) sur l’image' : 'reprises de la palette de l’image'}` });
  });
  return out;
}

/** Pre-score label of an image in the gallery (≥ target = proposed first). */
export const scoreTone = (score: number | null | undefined, target: number): 'ok' | 'warn' | 'none' => (score === null || score === undefined ? 'none' : score >= target ? 'ok' : 'warn');
/** Gallery order: images reaching the target first, then by decreasing score, unscored last (original order kept). */
export function rankByScore<T extends { url: string }>(items: T[], scores: Record<string, number | null | undefined>): T[] {
  return items
    .map((it, k) => ({ it, k, s: scores[it.url] }))
    .sort((a, b) => {
      const sa = typeof a.s === 'number' ? a.s : -1;
      const sb = typeof b.s === 'number' ? b.s : -1;
      return sb - sa || a.k - b.k;
    })
    .map((x) => x.it);
}

/**
 * STRUCTURE LINES (morphological line extraction, as in table-structure recognition): thin, long, straight strokes of
 * one colour that contrasts with the page — card borders, separators, frames. The content cleaning erases them with
 * the panels; they are DESIGN, so they are copied back from the image into the clean background.
 * A stroke qualifies when its run is ≥ `minLen` of the image side and it is thin (≤ `maxThick` px across).
 */
export function restoreLines(src: ArrayLike<number>, bg: Uint8ClampedArray, w: number, h: number, page: string, o: { minLen?: number; maxThick?: number; contrast?: number; panels?: Box[] } = {}): number {
  // Inside a panel's DATA area (the box shrunk by 8 % per side) a thin long stroke is a chart mark (a thin bar, an
  // axis), not design: only the edges of the cards and the gaps between them are restored.
  const inner = (o.panels ?? []).map((b) => ({ x0: (b.x + b.w * 0.08) * w, x1: (b.x + b.w * 0.92) * w, y0: (b.y + b.h * 0.08) * h, y1: (b.y + b.h * 0.92) * h }));
  const inData = (i: number) => {
    const x = i % w;
    const y = (i - x) / w;
    return inner.some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1);
  };
  const minLen = o.minLen ?? 0.08;
  const maxThick = o.maxThick ?? 5;
  const pg = [0, 2, 4].map((i) => parseInt(page.replace('#', '').slice(i, i + 2), 16) || 0) as RGB;
  const contrast = (o.contrast ?? 70) ** 2;
  const c = (i: number): RGB => [src[i * 4]!, src[i * 4 + 1]!, src[i * 4 + 2]!];
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = d2(c(i), pg) > contrast ? 1 : 0;
  const same = (a: number, b: number) => d2(c(a), c(b)) < 40 ** 2;
  const keep = new Uint8Array(w * h);
  // thickness of the ink across a pixel (vertical extent for a horizontal stroke, and vice versa)
  const across = (x: number, y: number, dx: number, dy: number) => {
    let n = 1;
    const i0 = y * w + x;
    for (let k = 1; k <= maxThick + 1; k++) {
      const xx = x + dx * k;
      const yy = y + dy * k;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || !ink[yy * w + xx] || !same(i0, yy * w + xx)) break;
      n++;
    }
    for (let k = 1; k <= maxThick + 1; k++) {
      const xx = x - dx * k;
      const yy = y - dy * k;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || !ink[yy * w + xx] || !same(i0, yy * w + xx)) break;
      n++;
    }
    return n;
  };
  // horizontal strokes
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const i = y * w + x;
      if (!ink[i] || across(x, y, 0, 1) > maxThick) {
        x++;
        continue;
      }
      let e = x + 1;
      while (e < w && ink[y * w + e] && same(i, y * w + e) && across(e, y, 0, 1) <= maxThick) e++;
      if (e - x >= minLen * w) for (let k = x; k < e; k++) keep[y * w + k] = 1;
      x = e;
    }
  }
  // vertical strokes
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      const i = y * w + x;
      if (!ink[i] || across(x, y, 1, 0) > maxThick) {
        y++;
        continue;
      }
      let e = y + 1;
      while (e < h && ink[e * w + x] && same(i, e * w + x) && across(x, e, 1, 0) <= maxThick) e++;
      if (e - y >= minLen * h) for (let k = y; k < e; k++) keep[k * w + x] = 1;
      y = e;
    }
  }
  let n = 0;
  for (let i = 0; i < w * h; i++)
    if (keep[i] && !inData(i)) {
      bg[i * 4] = src[i * 4]!;
      bg[i * 4 + 1] = src[i * 4 + 1]!;
      bg[i * 4 + 2] = src[i * 4 + 2]!;
      n++;
    }
  return n;
}
