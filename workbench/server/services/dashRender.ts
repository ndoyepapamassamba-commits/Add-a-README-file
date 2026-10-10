/**
 * DASHBOARD CLONE — rendering. One SVG at the source image's aspect ratio: outer background, frame, page, title band and
 * every panel at its measured place, with its measured fill / border / radius / series colours, filled with the user's
 * processed data (each chart panel gets its own view of the data: grouped sums per category column, trend by month when
 * a date column exists, KPI tiles). Nothing is invented: every figure comes from the rows.
 */
import type { DashSpec, Panel } from './dashClone';

export interface DataView {
  title: string;
  categories: string[];
  values: number[];
  valueName: string;
  /** Natural order (dates): keep it, do not sort by value. */
  ordered: boolean;
}
export interface CloneData {
  title: string;
  kpis: { label: string; value: string }[];
  views: DataView[];
  table: { columns: string[]; rows: (string | number)[][] };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const fmt = (n: number) =>
  Math.abs(n) >= 1e9 ? `${(n / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Md` : Math.abs(n) >= 1e6 ? `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ') : (Math.round(n * 100) / 100).toLocaleString('fr-FR');
const esc = (s: unknown) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const asDate = (v: unknown): Date | null => {
  if (v instanceof Date) return v;
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)); // Excel serial
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}|^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(v)) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(v);
    const d = m ? new Date(+m[3]! < 100 ? 2000 + +m[3]! : +m[3]!, +m[2]! - 1, +m[1]!) : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

/** Every view of the data a dashboard can show — exact figures from the rows. */
export function cloneData(title: string, columns: string[], rows: Record<string, unknown>[]): CloneData {
  const sample = rows.slice(0, 300);
  const dateCols = columns.filter((c) => sample.filter((r) => asDate(r[c])).length >= sample.length * 0.6 && !/^(id|n°|num)/i.test(c));
  const numCols = columns.filter((c) => !dateCols.includes(c) && sample.filter((r) => isNum(r[c])).length >= sample.length * 0.6);
  const textCols = columns.filter((c) => !numCols.includes(c) && !dateCols.includes(c)).filter((c) => {
    const distinct = new Set(sample.map((r) => String(r[c] ?? ''))).size;
    return distinct >= 2 && distinct <= Math.max(40, sample.length * 0.5);
  });
  const kpis: CloneData['kpis'] = [{ label: 'Lignes', value: fmt(rows.length) }];
  for (const c of numCols.slice(0, 4)) {
    const v = rows.map((r) => r[c]).filter(isNum);
    const sum = v.reduce((a, b) => a + b, 0);
    kpis.push({ label: `Total ${c}`, value: fmt(sum) });
    kpis.push({ label: `Moyenne ${c}`, value: fmt(sum / Math.max(1, v.length)) });
    kpis.push({ label: `Max ${c}`, value: fmt(Math.max(...v)) });
  }
  const views: DataView[] = [];
  const group = (key: (r: Record<string, unknown>) => string | null, num: string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = key(r);
      if (k === null) continue;
      m.set(k, (m.get(k) ?? 0) + (num ? (isNum(r[num]) ? (r[num] as number) : 0) : 1));
    }
    return m;
  };
  // Trends by month first (they feed line / area panels).
  for (const d of dateCols.slice(0, 1))
    for (const n of numCols.slice(0, 2)) {
      const m = group((r) => {
        const x = asDate(r[d]);
        return x ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}` : null;
      }, n);
      const keys = [...m.keys()].sort();
      if (keys.length >= 2)
        views.push({ title: `${n} par mois`, categories: keys.map((k) => `${MONTHS[+k.slice(5) - 1]} ${k.slice(2, 4)}`), values: keys.map((k) => m.get(k)!), valueName: n, ordered: true });
    }
  for (const t of textCols.slice(0, 3)) {
    for (const n of numCols.slice(0, 2)) {
      const m = group((r) => String(r[t] ?? '—'), n);
      const top = [...m].sort((a, b) => b[1] - a[1]);
      views.push({ title: `${n} par ${t}`, categories: top.map(([k]) => k), values: top.map(([, v]) => v), valueName: n, ordered: false });
    }
    if (!numCols.length) {
      const m = group((r) => String(r[t] ?? '—'), null);
      const top = [...m].sort((a, b) => b[1] - a[1]);
      views.push({ title: `Nombre par ${t}`, categories: top.map(([k]) => k), values: top.map(([, v]) => v), valueName: 'Nombre', ordered: false });
    }
  }
  if (!views.length && numCols.length) {
    const n = numCols[0]!;
    views.push({ title: n, categories: rows.slice(0, 12).map((_, i) => `#${i + 1}`), values: rows.slice(0, 12).map((r) => (isNum(r[n]) ? (r[n] as number) : 0)), valueName: n, ordered: true });
  }
  return { title, kpis, views, table: { columns, rows: rows.slice(0, 60).map((r) => columns.map((c) => (isNum(r[c]) ? (r[c] as number) : String(r[c] ?? '')))) } };
}

// ── colour helpers ───────────────────────────────────────────────────────────────────────────────────────────────────
const rgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16));
const lumH = (h: string) => {
  const [r, g, b] = rgb(h);
  return (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;
};
const mixH = (a: string, b: string, t: number) => {
  const A = rgb(a);
  const B = rgb(b);
  return `#${A.map((x, i) => Math.round(x + (B[i]! - x) * t).toString(16).padStart(2, '0')).join('')}`;
};
/** n colours following the panel's own palette: a dark→light ramp for sequential designs, else its colours in turn. */
function colorsFor(p: Panel, n: number, fallback: string[]): string[] {
  const base = p.colors.length ? p.colors : fallback;
  if (p.sequential && p.ramp.length >= 2) {
    const ramp = p.ramp;
    return Array.from({ length: n }, (_, i) => {
      const t = n === 1 ? 0 : (i / (n - 1)) * (ramp.length - 1);
      const k = Math.min(ramp.length - 2, Math.floor(t));
      return mixH(ramp[k]!, ramp[k + 1]!, t - k);
    });
  }
  return Array.from({ length: n }, (_, i) => base[i % base.length]!);
}
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s);

// ── panel renderers (absolute coordinates) ──────────────────────────────────────────────────────────────────────────
interface R {
  x: number;
  y: number;
  w: number;
  h: number;
}
function barChart(r: R, v: DataView, p: Panel, horizontal: boolean, fs: number, fallback: string[]): string {
  const n = Math.max(1, Math.min(horizontal ? 8 : 7, v.categories.length));
  const cats = v.categories.slice(0, n);
  const vals = v.values.slice(0, n);
  const max = Math.max(...vals.map(Math.abs), 1);
  // Sequential designs: the biggest value takes the darkest shade.
  const order = [...vals.keys()].sort((a, b) => vals[b]! - vals[a]!);
  const shades = colorsFor(p, n, fallback);
  const col = (i: number) => (p.sequential ? shades[order.indexOf(i)]! : shades[0]!);
  const muted = mixH(p.text, p.fill, 0.45);
  let out = '';
  if (horizontal) {
    const labelW = Math.min(r.w * 0.32, fs * 9);
    const valW = fs * 4.2;
    const bw = r.w - labelW - valW;
    const step = r.h / n;
    cats.forEach((c, i) => {
      const y = r.y + i * step + step * 0.18;
      const bh = step * 0.64;
      const len = Math.max(1, (Math.abs(vals[i]!) / max) * bw);
      out += `<text x="${r.x + labelW - 6}" y="${y + bh * 0.72}" text-anchor="end" font-size="${fs}" fill="${p.text}">${esc(trunc(c, 18))}</text>`;
      out += `<rect x="${r.x + labelW}" y="${y}" width="${len}" height="${bh}" fill="${col(i)}"/>`;
      out += `<text x="${r.x + labelW + len + 4}" y="${y + bh * 0.72}" font-size="${fs * 0.95}" fill="${muted}">${esc(fmt(vals[i]!))}</text>`;
    });
    return out;
  }
  const bottom = fs * 2.2;
  const top = fs * 1.4;
  const ph = r.h - bottom - top;
  const step = r.w / n;
  cats.forEach((c, i) => {
    const bh = Math.max(1, (Math.abs(vals[i]!) / max) * ph);
    const x = r.x + i * step + step * 0.18;
    const bw = step * 0.64;
    const y = r.y + top + ph - bh;
    out += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${col(i)}"/>`;
    out += `<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" font-size="${fs * 0.95}" fill="${muted}">${esc(fmt(vals[i]!))}</text>`;
    out += `<text x="${x + bw / 2}" y="${r.y + r.h - bottom * 0.35}" text-anchor="middle" font-size="${fs * 0.9}" fill="${p.text}">${esc(trunc(c, Math.max(4, Math.round(step / (fs * 0.55)))))}</text>`;
  });
  return out;
}
function lineChart(r: R, v: DataView, p: Panel, area: boolean, fs: number, fallback: string[]): string {
  const n = Math.min(12, v.categories.length);
  if (n < 2) return barChart(r, v, p, false, fs, fallback);
  const cats = v.categories.slice(0, n);
  const vals = v.values.slice(0, n);
  const max = Math.max(...vals);
  const min = Math.min(0, ...vals);
  const bottom = fs * 2;
  const top = fs * 1.6;
  const ph = r.h - bottom - top;
  const X = (i: number) => r.x + fs + (i / (n - 1)) * (r.w - fs * 2);
  const Y = (val: number) => r.y + top + ph - ((val - min) / Math.max(1e-9, max - min)) * ph;
  const color = p.ramp[0] ?? p.colors[0] ?? fallback[0]!;
  const pts = vals.map((val, i) => `${X(i).toFixed(1)},${Y(val).toFixed(1)}`).join(' ');
  const muted = mixH(p.text, p.fill, 0.45);
  let out = '';
  if (area) out += `<polygon points="${X(0)},${r.y + top + ph} ${pts} ${X(n - 1)},${r.y + top + ph}" fill="${p.colors[1] ?? color}" fill-opacity=".35"/>`;
  out += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${Math.max(1.5, fs * 0.2)}" ${p.valueLabels ? '' : ''}stroke-linejoin="round"/>`;
  vals.forEach((val, i) => {
    out += `<circle cx="${X(i)}" cy="${Y(val)}" r="${Math.max(2, fs * 0.28)}" fill="${color}"/>`;
    out += `<text x="${X(i)}" y="${Y(val) - fs * 0.6}" text-anchor="middle" font-size="${fs * 0.85}" fill="${muted}">${esc(fmt(val))}</text>`;
    out += `<text x="${X(i)}" y="${r.y + r.h - bottom * 0.3}" text-anchor="middle" font-size="${fs * 0.85}" fill="${p.text}">${esc(trunc(cats[i]!, 8))}</text>`;
  });
  return out;
}
function pieChart(r: R, v: DataView, p: Panel, donut: boolean, fs: number, fallback: string[]): string {
  const n = Math.min(6, v.categories.length);
  const top = v.values.slice(0, n);
  const rest = v.values.slice(n).reduce((a, b) => a + b, 0);
  const vals = rest > 0 ? [...top.slice(0, n - 1), top[n - 1]! + rest] : top;
  const cats = rest > 0 ? [...v.categories.slice(0, n - 1), 'Autres'] : v.categories.slice(0, n);
  const tot = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const legendW = p.legend === 'none' ? 0 : r.w * 0.38;
  const R0 = Math.min((r.w - legendW) / 2, r.h / 2) * 0.86;
  const cx = r.x + (r.w - legendW) / 2;
  const cy = r.y + r.h / 2;
  const cols = colorsFor(p, vals.length, fallback);
  let a = -Math.PI / 2;
  let out = '';
  vals.forEach((val, i) => {
    const da = (Math.max(0, val) / tot) * Math.PI * 2;
    const x1 = cx + R0 * Math.cos(a);
    const y1 = cy + R0 * Math.sin(a);
    const x2 = cx + R0 * Math.cos(a + da);
    const y2 = cy + R0 * Math.sin(a + da);
    out += da >= Math.PI * 2 - 1e-6 ? `<circle cx="${cx}" cy="${cy}" r="${R0}" fill="${cols[i]}"/>` : `<path d="M${cx},${cy} L${x1},${y1} A${R0},${R0} 0 ${da > Math.PI ? 1 : 0} 1 ${x2},${y2} Z" fill="${cols[i]}" stroke="${p.fill}" stroke-width="1"/>`;
    a += da;
  });
  if (donut) out += `<circle cx="${cx}" cy="${cy}" r="${R0 * 0.58}" fill="${p.fill}"/><text x="${cx}" y="${cy + fs * 0.4}" text-anchor="middle" font-size="${fs * 1.3}" font-weight="700" fill="${p.text}">${esc(fmt(tot))}</text>`;
  if (legendW)
    cats.forEach((c, i) => {
      const y = r.y + r.h / 2 - (cats.length * fs * 1.5) / 2 + i * fs * 1.5;
      const x = r.x + r.w - legendW + fs * 0.6;
      out += `<rect x="${x}" y="${y}" width="${fs * 0.8}" height="${fs * 0.8}" fill="${cols[i]}"/><text x="${x + fs * 1.2}" y="${y + fs * 0.75}" font-size="${fs * 0.9}" fill="${p.text}">${esc(trunc(c, 14))} · ${Math.round((Math.max(0, vals[i]!) / tot) * 100)} %</text>`;
    });
  return out;
}
/** WCAG-like contrast ratio of two hex colours. */
function contrastH(a: string, b: string): number {
  const L = (h: string) =>
    rgb(h)
      .map((v) => v! / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
  const [x, y] = [L(a), L(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}
/** The first readable colour on a fill (the design's own colours first). */
const readableOn = (fill: string, prefs: string[]) => prefs.find((c) => c && contrastH(c, fill) >= 3.2) ?? (lumH(fill) < 0.5 ? '#FFFFFF' : '#111827');
function kpiTiles(r: R, kpis: CloneData['kpis'], p: Panel, fs: number): string {
  const n = Math.max(1, p.tiles);
  const gap = n > 1 ? r.w * 0.02 : 0;
  const tw = (r.w - gap * (n - 1)) / n;
  return kpis
    .slice(0, n)
    .map((k, i) => {
      const fill = p.tileFills?.[i] ?? p.fill;
      // Values in a design colour when it is readable on the card, labels a softer readable ink.
      const valueC = readableOn(fill, [p.colors[0] ?? '', p.text, p.border ?? '']);
      const labelC = readableOn(fill, [mixH(p.text, fill, 0.3), p.text]);
      const x = r.x + i * (tw + gap);
      const vs = Math.min(r.h * 0.42, tw / Math.max(4, k.value.length * 0.62));
      return `${n > 1 ? `<rect x="${x}" y="${r.y}" width="${tw}" height="${r.h}" rx="${Math.max(4, p.radius * 0.6)}" fill="${fill}"/>` : ''}<text x="${x + tw / 2}" y="${r.y + r.h * 0.34}" text-anchor="middle" font-size="${Math.min(fs, r.h * 0.18)}" fill="${labelC}">${esc(trunc(k.label, 26))}</text><text x="${x + tw / 2}" y="${r.y + r.h * 0.34 + vs * 1.15}" text-anchor="middle" font-size="${vs}" font-weight="700" fill="${valueC}">${esc(k.value)}</text>`;
    })
    .join('');
}
function tableBlock(r: R, t: CloneData['table'], p: Panel, fs: number): string {
  const cols = t.columns.slice(0, 5);
  const rowH = fs * 1.7;
  const n = Math.max(1, Math.min(t.rows.length, Math.floor(r.h / rowH) - 1));
  const cw = r.w / cols.length;
  const head = p.colors[0] ?? p.border ?? p.text;
  const zebra = mixH(p.ramp[p.ramp.length - 1] ?? p.fill, p.fill, 0.6);
  let out = `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${rowH}" fill="${head}"/>`;
  cols.forEach((c, j) => (out += `<text x="${r.x + j * cw + 6}" y="${r.y + rowH * 0.68}" font-size="${fs}" font-weight="700" fill="${lumH(head) < 0.5 ? '#fff' : p.text}">${esc(trunc(c, 14))}</text>`));
  for (let i = 0; i < n; i++) {
    const y = r.y + rowH * (i + 1);
    if (i % 2) out += `<rect x="${r.x}" y="${y}" width="${r.w}" height="${rowH}" fill="${zebra}"/>`;
    cols.forEach((_, j) => {
      const val = t.rows[i]![t.columns.indexOf(cols[j]!)];
      out += `<text x="${r.x + j * cw + 6}" y="${y + rowH * 0.68}" font-size="${fs * 0.95}" fill="${p.text}">${esc(trunc(typeof val === 'number' ? fmt(val) : String(val ?? ''), 14))}</text>`;
    });
  }
  return out;
}

/** The full reproduction. `W` = width in px of the SVG coordinate system. */
export function renderCloneSvg(spec: DashSpec, d: CloneData, W = 1200): string {
  const H = Math.round(W / spec.aspect);
  const P = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H });
  const font = spec.font.replace(/[<>"]/g, '');
  const fallback = spec.palette.series.length ? spec.palette.series : [spec.palette.primary, spec.palette.accent];
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'${font}', 'Segoe UI', Calibri, Arial, sans-serif" data-dash-clone="1">`;
  s += `<rect width="${W}" height="${H}" fill="${spec.outer}"/>`;
  const pb = P(spec.pageBox);
  if (spec.frame) {
    const fw = spec.frame.width * W;
    const fr = spec.frame.radius * W;
    // A side where the page touches the image edge has no frame (cropped image): extend the frame beyond the canvas.
    const ex = W * 0.01;
    const ey = H * 0.01;
    const fx0 = pb.x > ex ? Math.max(0, pb.x - fw) : -fw * 3;
    const fy0 = pb.y > ey ? Math.max(0, pb.y - fw) : -fw * 3;
    const fx1 = pb.x + pb.w < W - ex ? Math.min(W, pb.x + pb.w + fw) : W + fw * 3;
    const fy1 = pb.y + pb.h < H - ey ? Math.min(H, pb.y + pb.h + fw) : H + fw * 3;
    s += `<rect x="${fx0}" y="${fy0}" width="${fx1 - fx0}" height="${fy1 - fy0}" rx="${fr}" fill="${spec.frame.color}"/>`;
    const px0 = pb.x > ex ? pb.x : -fr;
    const px1 = pb.x + pb.w < W - ex ? pb.x + pb.w : W + fr;
    s += `<rect x="${px0}" y="${pb.y}" width="${px1 - px0}" height="${pb.h}" rx="${Math.max(0, fr - fw)}" fill="${spec.page}"/>`;
  } else s += `<rect x="${pb.x}" y="${pb.y}" width="${pb.w}" height="${pb.h}" fill="${spec.page}"/>`;
  if (spec.title) {
    const t = P(spec.title.box);
    if (spec.title.fill) s += `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" fill="${spec.title.fill}"/>`;
    const fs = Math.max(10, t.h * 0.78);
    const x = spec.title.align === 'center' ? t.x + t.w / 2 : t.x;
    s += `<text x="${x}" y="${t.y + t.h * 0.82}" text-anchor="${spec.title.align === 'center' ? 'middle' : 'start'}" font-size="${fs}" font-weight="800" fill="${spec.title.color}">${esc(d.title)}</text>`;
  }
  let viewIdx = 0;
  let kpiIdx = 0;
  const trend = d.views.filter((v) => v.ordered);
  const cats = d.views.filter((v) => !v.ordered);
  const nextView = (kind: string) => {
    const pool = (kind === 'line' || kind === 'area') && trend.length ? trend : cats.length ? cats : d.views;
    const v = pool[viewIdx % Math.max(1, pool.length)];
    viewIdx++;
    return v;
  };
  for (const p of spec.panels) {
    const r = P(p.box);
    const fs = Math.max(8, Math.min(15, Math.min(r.h * 0.075, r.w * 0.045)));
    if (!(p.kind === 'kpi' && p.tileFills?.length)) s += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${p.radius}" fill="${p.fill}"${p.border ? ` stroke="${p.border}" stroke-width="${Math.max(1, p.borderWidth)}"` : ''}/>`;
    const pad = Math.max(6, fs * 0.6);
    const titleH = p.kind === 'kpi' || p.kind === 'title' || p.kind === 'image' || p.kind === 'filter' ? 0 : fs * 1.9;
    const inner = { x: r.x + pad, y: r.y + pad + titleH, w: r.w - pad * 2, h: r.h - pad * 2 - titleH };
    const kind = p.kind === 'map' ? 'hbar' : p.kind === 'gauge' ? 'donut' : p.kind;
    const v = ['bar', 'hbar', 'line', 'area', 'pie', 'donut'].includes(kind) ? nextView(kind) : undefined;
    if (titleH && (v || kind === 'table' || kind === 'text')) {
      const label = v ? v.title : kind === 'table' ? 'Détail' : 'Points clés';
      s += `<text x="${p.titleAlign === 'center' ? r.x + r.w / 2 : r.x + pad}" y="${r.y + pad + fs * 1.05}" text-anchor="${p.titleAlign === 'center' ? 'middle' : 'start'}" font-size="${fs * 1.08}" font-weight="700" fill="${p.text}">${esc(trunc(label, Math.round(r.w / (fs * 0.6))))}</text>`;
    }
    if (inner.w < 10 || inner.h < 10) continue;
    if (v && (kind === 'bar' || kind === 'hbar')) s += barChart(inner, v, p, kind === 'hbar', fs, fallback);
    else if (v && (kind === 'line' || kind === 'area')) s += lineChart(inner, v, p, kind === 'area', fs, fallback);
    else if (v && (kind === 'pie' || kind === 'donut')) s += pieChart(inner, v, p, kind === 'donut', fs, fallback);
    else if (kind === 'kpi') {
      const ks = d.kpis.slice(kpiIdx, kpiIdx + Math.max(1, p.tiles));
      kpiIdx += ks.length;
      s += kpiTiles({ x: r.x + pad, y: r.y + pad, w: r.w - pad * 2, h: r.h - pad * 2 }, ks.length ? ks : d.kpis.slice(0, 1), p, fs);
    } else if (kind === 'table') s += tableBlock(inner, d.table, p, fs);
    else if (kind === 'text') {
      const v0 = d.views[0];
      const lines = v0 ? [`${v0.categories[0]} : ${fmt(v0.values[0]!)} (${v0.valueName})`, `${v0.categories.length} ${v0.title.split(' par ')[1] ?? 'catégories'}`, ...d.kpis.slice(0, 2).map((k) => `${k.label} : ${k.value}`)] : d.kpis.map((k) => `${k.label} : ${k.value}`);
      lines.slice(0, Math.floor(inner.h / (fs * 1.6))).forEach((l, i) => (s += `<text x="${inner.x}" y="${inner.y + fs * 1.2 + i * fs * 1.6}" font-size="${fs}" fill="${p.text}">• ${esc(trunc(l, Math.round(inner.w / (fs * 0.55))))}</text>`));
    }
  }
  return `${s}</svg>`;
}

/** Self-contained HTML page: the reproduction, then the detailed table. */
export function renderCloneHtml(spec: DashSpec, d: CloneData, source?: string): string {
  const svg = renderCloneSvg(spec, d);
  const rows = d.table.rows
    .slice(0, 60)
    .map((r) => `<tr>${r.map((v) => `<td${typeof v === 'number' ? ' class="n"' : ''}>${esc(typeof v === 'number' ? fmt(v) : v)}</td>`).join('')}</tr>`)
    .join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.title)}</title>
<style data-premium-theme="clone">body{margin:0;background:${spec.outer};font-family:'${spec.font.replace(/[<>'"]/g, '')}','Segoe UI',Calibri,Arial,sans-serif;color:${spec.palette.dark}}
.wrap{max-width:1400px;margin:0 auto;padding:16px}.wrap>svg{width:100%;height:auto;display:block;border-radius:6px}
table{border-collapse:collapse;width:100%;margin-top:18px;background:${spec.page};font-size:13px}th{background:${spec.palette.primary};color:#fff;text-align:left;padding:7px 9px}td{padding:6px 9px;border-bottom:1px solid #e5e7eb}td.n{text-align:right;font-variant-numeric:tabular-nums}tr:nth-child(even) td{background:#f6f8fa}
.src{font-size:11px;color:#94a3b8;margin-top:10px}</style></head><body><div class="wrap">${svg}
<table><thead><tr>${d.table.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
<div class="src">Mise en page, couleurs et proportions reproduites d’après le design choisi${source ? ` (${esc(source.slice(0, 120))})` : ''} — logos, photos et textes d’origine non copiés ; chiffres calculés sur vos données.</div></div></body></html>`;
}
