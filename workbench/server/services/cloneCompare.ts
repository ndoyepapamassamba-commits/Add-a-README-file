// COMPARATEUR DE REPRODUCTION — four criteria a reader understands (agencement, couleurs, types de graphiques, titres),
// each 0–100, measured on the PIXELS of the source image and of the reproduction, panel by panel; a 32×20 heat grid
// shows where the two differ. Pure (RGBA in → report out); no model call. The chart-type criterion confronts the
// vision label with the pixel reading of the image: a disagreement is « à confirmer » (a zoomed crop settles it).
import { classifyPanel, d2, hexRgb, lum, panelStyle, regionFidelity, type Box, type DashSpec, type PanelKind, type PxBox } from './dashClone';
import type { RGB } from './logoHarmony';

export const CHART_KINDS: PanelKind[] = ['bar', 'hbar', 'line', 'area', 'pie', 'donut', 'gauge', 'map'];
const family = (k: PanelKind) => (k === 'bar' || k === 'hbar' ? 'bars' : k === 'line' || k === 'area' ? 'lines' : k === 'pie' || k === 'donut' || k === 'gauge' ? 'round' : k);
/** Same family of marks (columns ~ bars, line ~ area, pie ~ donut ~ gauge): a reader would not call it a different chart. */
export const sameFamily = (a: PanelKind, b: PanelKind) => family(a) === family(b);

export interface PanelCheck {
  i: number;
  kind: PanelKind;
  /** The pixel classifier's reading of the image (null when unknown). */
  pixelKind: PanelKind | null;
  /** Vision label and pixel reading agree (or no second opinion). */
  agree: boolean;
  /** What the pixel classifier reads in the REPRODUCTION (informative: the renderer drew that family). */
  drawnKind: PanelKind | null;
  /** 0–100: the source's series colours (or fill) found in the reproduction. */
  colors: number;
  /** 0–100: same card at the same place, ink in the same area. */
  layout: number;
  /** Title drawn where the image had one, in its colour (null: the image had no title there). */
  title: boolean | null;
  /** Pixel fidelity of the region (informative, data included). */
  fidelity: number;
}
export interface CompareReport {
  layout: number;
  colors: number;
  charts: number;
  titles: number;
  overall: number;
  panels: PanelCheck[];
  /** Heat grid: per cell, 0 (identical) … 1 (opposite colours). */
  heat: { gx: number; gy: number; cells: number[] };
  notes: string[];
  /** Chart panels whose type is not settled (vision ≠ pixels): candidates for a zoomed confirmation. */
  unsure: number[];
}

const toPx = (b: Box, w: number, h: number): PxBox => ({
  x0: Math.max(0, Math.round(b.x * w)),
  y0: Math.max(0, Math.round(b.y * h)),
  x1: Math.min(w, Math.round((b.x + b.w) * w)),
  y1: Math.min(h, Math.round((b.y + b.h) * h)),
});
const pix = (px: ArrayLike<number>, w: number, x: number, y: number): RGB => {
  const o = (y * w + x) * 4;
  return [px[o]!, px[o + 1]!, px[o + 2]!];
};
/** Bounding box of the pixels far from `bg` inside the box (a margin ring left out), or null without any. */
function inkBox(px: ArrayLike<number>, w: number, b: PxBox, bg: RGB, tol = 40, margin = 0.04): PxBox | null {
  const mx = Math.round((b.x1 - b.x0) * margin);
  const my = Math.round((b.y1 - b.y0) * margin);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = b.y0 + my; y < b.y1 - my; y += 2)
    for (let x = b.x0 + mx; x < b.x1 - mx; x += 2)
      if (d2(pix(px, w, x, y), bg) > tol * tol) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}
const area = (b: PxBox) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
function iou(a: PxBox, b: PxBox): number {
  const i = { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) };
  const inter = area(i);
  const u = area(a) + area(b) - inter;
  return u > 0 ? inter / u : 1;
}
/** Share of sampled pixels that are « fill-coloured » in both images or in neither (the card exists at the same place). */
function fillAgreement(a: ArrayLike<number>, b: ArrayLike<number>, w: number, box: PxBox, fill: RGB): number {
  let same = 0;
  let n = 0;
  for (let y = box.y0; y < box.y1; y += 3)
    for (let x = box.x0; x < box.x1; x += 3) {
      const fa = d2(pix(a, w, x, y), fill) < 30 ** 2;
      const fb = d2(pix(b, w, x, y), fill) < 30 ** 2;
      if (fa === fb) same++;
      n++;
    }
  return n ? same / n : 1;
}
/** Mean colour of the ink (pixels far from `bg`) in a box, or null. */
function inkColor(px: ArrayLike<number>, w: number, b: PxBox, bg: RGB, tol = 60): RGB | null {
  const s: [number, number, number] = [0, 0, 0];
  let n = 0;
  for (let y = b.y0; y < b.y1; y++)
    for (let x = b.x0; x < b.x1; x++) {
      const c = pix(px, w, x, y);
      if (d2(c, bg) > tol * tol) {
        s[0] += c[0];
        s[1] += c[1];
        s[2] += c[2];
        n++;
      }
    }
  return n ? [s[0] / n, s[1] / n, s[2] / n] : null;
}
const pad = (b: PxBox, k: number, w: number, h: number): PxBox => ({ x0: Math.max(0, b.x0 - k), y0: Math.max(0, b.y0 - k), x1: Math.min(w, b.x1 + k), y1: Math.min(h, b.y1 + k) });

/** The four-criteria comparison of a reproduction with its source image (same size). */
export function compareClone(src: ArrayLike<number>, out: ArrayLike<number>, w: number, h: number, spec: DashSpec): CompareReport {
  const page = hexRgb(spec.page);
  const notes: string[] = [];
  const panels: PanelCheck[] = spec.panels.map((p, i) => {
    const b = toPx(p.box, w, h);
    const fill = hexRgb(p.fill);
    const chart = CHART_KINDS.includes(p.kind);
    // AGENCEMENT: the card at the same place (fill agreement) and the ink in the same area (padded bounding boxes).
    const ia = inkBox(src, w, b, fill);
    const ib = inkBox(out, w, b, fill);
    const k = Math.round(Math.min(b.x1 - b.x0, b.y1 - b.y0) * 0.08);
    const boxes = ia && ib ? iou(pad(ia, k, w, h), pad(ib, k, w, h)) : ia || ib ? 0 : 1;
    const layout = Math.round(100 * (0.5 * fillAgreement(src, out, w, b, fill) + 0.5 * boxes));
    // COULEURS: the series colours measured in the image are found in the reproduction (charts); the fill for the rest.
    const stOut = b.x1 - b.x0 > 8 && b.y1 - b.y0 > 8 ? panelStyle(out, w, b, page) : null;
    const want = (chart ? p.colors.slice(0, 3) : []).map(hexRgb);
    const have = (stOut?.colors ?? []).map(hexRgb);
    const fillOk = stOut ? d2(hexRgb(stOut.fill), fill) < 30 ** 2 : true;
    const colors = want.length ? Math.round((100 * want.filter((c) => have.some((d) => d2(c, d) < 48 ** 2)).length) / want.length) : fillOk ? 100 : 0;
    // TYPES: the vision label against the pixel reading of the image; what the reproduction actually shows.
    const pixelKind = p.pixelKind ?? null;
    const agree = !chart || !pixelKind || sameFamily(p.kind, pixelKind) || !CHART_KINDS.includes(pixelKind);
    const drawnKind = chart && stOut ? classifyPanel(out, w, b, { ...p, colors: stOut.colors.length ? stOut.colors : p.colors }) : null;
    // TITRES: ink where the image's title was, in its colour.
    let title: boolean | null = null;
    if (p.titleBox && p.titleBox.w > 0.01 && p.titleBox.h > 0.005) {
      const tb = pad(toPx(p.titleBox, w, h), 2, w, h);
      const ink = inkColor(out, w, tb, fill);
      const wantC = p.titleColor ? hexRgb(p.titleColor) : null;
      // Same ink as the IMAGE shows at that place (an outlined or anti-aliased title mixes colours on both sides).
      const inkSrc = inkColor(src, w, tb, fill);
      title = Boolean(ink) && ((inkSrc !== null && d2(ink!, inkSrc) < 110 ** 2) || !wantC || d2(ink!, wantC) < 110 ** 2 || Math.abs(lum(ink!) - lum(wantC)) < 0.3);
    }
    if (chart && !agree) notes.push(`panneau ${i + 1} : type « ${p.kind} » lu par le modèle, « ${pixelKind} » par les pixels — à confirmer`);
    if (chart && want.length && colors < 100) notes.push(`panneau ${i + 1} : ${colors} % des couleurs de l’image retrouvées`);
    if (title === false) notes.push(`panneau ${i + 1} : titre absent ou d’une autre couleur`);
    return { i, kind: p.kind, pixelKind, agree, drawnKind, colors, layout, title, fidelity: regionFidelity(src, out, w, h, p.box) };
  });
  // Main title: ink in its box, in its colour.
  let mainTitle: boolean | null = null;
  if (spec.title) {
    const tb = pad(toPx(spec.title.box, w, h), 2, w, h);
    const bg = spec.title.fill ? hexRgb(spec.title.fill) : page;
    const ink = inkColor(out, w, tb, bg);
    const inkSrc = inkColor(src, w, tb, bg);
    mainTitle = Boolean(ink) && ((inkSrc !== null && d2(ink!, inkSrc) < 120 ** 2) || d2(ink!, hexRgb(spec.title.color)) < 120 ** 2);
    if (mainTitle === false) notes.push('titre principal absent ou d’une autre couleur');
  }
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 100);
  const chartPanels = panels.filter((p) => CHART_KINDS.includes(p.kind));
  const titled = [...panels.map((p) => p.title), mainTitle].filter((t): t is boolean => t !== null);
  const layout = mean(panels.map((p) => p.layout));
  const colors = mean(panels.map((p) => p.colors));
  const charts = chartPanels.length ? Math.round((100 * chartPanels.filter((p) => p.agree).length) / chartPanels.length) : 100;
  const titles = titled.length ? Math.round((100 * titled.filter(Boolean).length) / titled.length) : 100;
  // Heat grid: where the reproduction differs from the image (data areas differ by nature: the user's figures).
  const gx = 32;
  const gy = 20;
  const cells: number[] = [];
  for (let cy = 0; cy < gy; cy++)
    for (let cx = 0; cx < gx; cx++) {
      const x0 = Math.floor((cx * w) / gx);
      const x1 = Math.floor(((cx + 1) * w) / gx);
      const y0 = Math.floor((cy * h) / gy);
      const y1 = Math.floor(((cy + 1) * h) / gy);
      const ma = [0, 0, 0];
      const mb = [0, 0, 0];
      let n = 0;
      for (let y = y0; y < y1; y += 2)
        for (let x = x0; x < x1; x += 2) {
          const o = (y * w + x) * 4;
          for (let c = 0; c < 3; c++) {
            ma[c]! += src[o + c]!;
            mb[c]! += out[o + c]!;
          }
          n++;
        }
      cells.push(n ? Math.min(1, Math.sqrt(d2(ma.map((v) => v / n) as RGB, mb.map((v) => v / n) as RGB)) / 441.7) : 0);
    }
  return { layout, colors, charts, titles, overall: Math.round((layout + colors + charts + titles) / 4), panels, heat: { gx, gy, cells }, notes, unsure: chartPanels.filter((p) => !p.agree).map((p) => p.i) };
}

/** Parses the one-word answer of a zoomed confirmation (« What does this panel contain? »). */
export function parseKindWord(text: string): PanelKind | null {
  const t = text.toLowerCase();
  const order: PanelKind[] = ['hbar', 'bar', 'line', 'area', 'donut', 'pie', 'gauge', 'table', 'kpi', 'text', 'map', 'image', 'filter', 'title'];
  const hits = order.map((k) => ({ k, at: t.search(new RegExp(`\\b${k}\\b`)) })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at);
  return hits[0]?.k ?? null;
}
export const ZOOM_PROMPT = 'This is ONE panel cut out of a dashboard image. What does it contain? Answer with ONE word only among: kpi, bar, hbar, line, area, pie, donut, gauge, table, text, map, image, filter. (bar = vertical columns, hbar = horizontal bars, gauge = half-circle meter, kpi = big figure cards.)';
