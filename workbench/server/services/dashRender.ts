/**
 * DASHBOARD CLONE — rendering. One SVG at the source image's aspect ratio: outer background, frame, page, title band and
 * every panel at its measured place, with its measured fill / border / radius / series colours, filled with the user's
 * processed data (each chart panel gets its own view of the data: grouped sums per category column, trend by month when
 * a date column exists, KPI tiles). Nothing is invented: every figure comes from the rows.
 */
import type { DashSpec, Panel } from './dashClone';
import { rankMeasures, withoutTotals } from './tablePick';
import { chartDims, filterDims, human, isRate, profileColumns, viewTitle } from './dashInsight';

export interface DataView {
  title: string;
  categories: string[];
  values: number[];
  valueName: string;
  /** Natural order (dates): keep it, do not sort by value. */
  ordered: boolean;
  /** The measured highlight (« top 3 = 64 % du total », « +12 % sur la période »), shown next to the title. */
  insight?: string;
  /** Where the figures come from (live Excel formulas): grouped by a text column or by month of a date column. */
  src?: { by?: string; month?: string; measure: string | null; keys?: string[] };
}
/**
 * Is a LIVE dashboard worth building on these rows? (v48: a 5-colour palette got a sales-like dashboard as first
 * sheet.) At least 12 rows, one additive measure, and one axis that groups rows (2 to 40 values, not one per row).
 */
export function dashFit(d: CloneData): { ok: boolean; why: string } {
  const src = d.source;
  const n = src?.rows.length ?? d.table.rows.length;
  if (n < 12) return { ok: false, why: `${n} ligne(s) de données seulement — un tableau de bord n'apporterait rien` };
  const measures = src ? src.numCols : [];
  if (src && !measures.length && n < 30) return { ok: false, why: 'aucune grandeur additionnable (montant, effectif) dans les données' };
  const grouping = d.views.some((v) => !v.src?.month && v.categories.length >= 2 && v.categories.length <= 40 && v.categories.length < n * 0.8);
  if (!grouping && !d.views.some((v) => v.src?.month)) return { ok: false, why: 'aucun axe qui regroupe les lignes (chaque valeur est unique)' };
  return { ok: true, why: '' };
}
export interface CloneData {
  title: string;
  /** Source and date (shown where the image had a subtitle / brand strip). */
  subtitle?: string;
  kpis: { label: string; value: string; src?: { fn: 'count' | 'sum' | 'avg' | 'max'; col?: string } }[];
  views: DataView[];
  table: { columns: string[]; rows: (string | number)[][] };
  /** SEGMENTS (slicers): the axes worth cutting the data by, chosen by the analysis — period first. */
  filters?: { col: string; label: string; values: string[] }[];
  /** The rows behind every figure (TOTAL rows removed), for a workbook that recomputes them. */
  source?: { columns: string[]; rows: Record<string, unknown>[]; numCols: string[]; textCols: string[]; dateCol?: string };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const fmt = (n: number) =>
  Math.abs(n) >= 1e9 ? `${(n / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Md` : Math.abs(n) >= 1e6 ? `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ') : (Math.round(n * 100) / 100).toLocaleString('fr-FR');
const esc = (s: unknown) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const asDate = (v: unknown): Date | null => {
  if (v instanceof Date) return v;
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)); // Excel serial
  if (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)) return new Date(+v.slice(0, 4), +v.slice(5) - 1, 1);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}|^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(v)) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(v);
    const d = m ? new Date(+m[3]! < 100 ? 2000 + +m[3]! : +m[3]!, +m[2]! - 1, +m[1]!) : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

/** Nice round thresholds (1-2-5 × 10^k) for the amount bands. */
const nice = (x: number) => {
  const k = 10 ** Math.floor(Math.log10(Math.max(1, x)));
  const m = x / k;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * k;
};
const sameValues = (rows: Record<string, unknown>[], a: string, b: string) => {
  const s = rows.slice(0, 500);
  return s.filter((r) => String(r[a] ?? '') === String(r[b] ?? '')).length >= s.length * 0.98;
};
/** Two text columns that cut the rows the same way (« Relationship » / « GRelationship »): one is enough. */
const samePartition = (rows: Record<string, unknown>[], a: string, b: string) => {
  // Both ways (a one-to-one mapping): a client → its rate is a function, but the rate does not name the client.
  const oneWay = (x: string, y: string) => {
    const m = new Map<string, string>();
    let clash = 0;
    const part = rows.slice(0, 2000);
    for (const r of part) {
      const k = String(r[x] ?? '');
      const v = String(r[y] ?? '');
      const was = m.get(k);
      if (was === undefined) m.set(k, v);
      else if (was !== v) clash++;
    }
    return clash <= part.length * 0.02;
  };
  return oneWay(a, b) && oneWay(b, a);
};

/**
 * Every view of the data a dashboard can show — exact figures from the rows, CHOSEN BY AN ANALYSIS (dashInsight): the
 * columns that explain the amounts, never codes / currencies / flags; duplicate columns merged; a Top-N ranking for
 * the names (clients, counterparties); segments = period + amount bands + the best readable axes; clear titles.
 */
export function cloneData(title: string, columns0: string[], allRows: Record<string, unknown>[]): CloneData {
  const rows0 = withoutTotals(allRows);
  const sample0 = rows0.slice(0, 300);
  const dateCols = columns0.filter((c) => sample0.filter((r) => asDate(r[c])).length >= sample0.length * 0.6 && !/^(id|n°|num)/i.test(c));
  // Real measures only (amounts first): a customer number or a stage is never summed; a copy of a measure is dropped.
  const numericCols = columns0.filter((c) => !dateCols.includes(c) && sample0.filter((r) => isNum(r[c])).length >= sample0.length * 0.6);
  const numCols = rankMeasures(numericCols, rows0).filter((c, i, all) => !all.slice(0, i).some((o) => sameValues(rows0, o, c)));
  const m1 = numCols[0] ?? null;
  // DERIVED SEGMENTS (computed, never invented): the year of the date, the amount band of the main measure.
  const derived: string[] = [];
  let rows = rows0;
  const YEAR = 'Année';
  const BAND = m1 ? 'Tranche de montant' : '';
  const years = dateCols[0] ? new Set(rows0.map((r) => asDate(r[dateCols[0]!])?.getFullYear()).filter(Boolean)) : new Set();
  const bandOf = (() => {
    if (!m1) return null;
    const v = rows0.map((r) => r[m1]).filter(isNum).map(Math.abs).filter((x) => x > 0).sort((a, b) => a - b);
    if (v.length < 20) return null;
    const cuts = [...new Set([0.5, 0.8, 0.95].map((q) => nice(v[Math.floor(q * (v.length - 1))]!)))].sort((a, b) => a - b);
    if (cuts.length < 2) return null;
    const labels = [`< ${fmt(cuts[0]!)}`, ...cuts.slice(1).map((c, i) => `${fmt(cuts[i]!)} – ${fmt(c)}`), `≥ ${fmt(cuts[cuts.length - 1]!)}`];
    return { labels, of: (x: unknown) => (isNum(x) ? labels[cuts.filter((c) => Math.abs(x) >= c).length]! : null) };
  })();
  // The last 5 years one by one, the older ones together (a segment of 16 years is unreadable).
  const lastYears = [...years].map(Number).sort((a, b) => a - b).slice(-5);
  const oldest = lastYears[0] ?? 0;
  const yearOf = (v: unknown) => {
    const y = asDate(v)?.getFullYear();
    return y === undefined ? '' : years.size > 5 && y < oldest ? `≤ ${oldest - 1}` : String(y);
  };
  if ((years.size >= 2 && !columns0.includes(YEAR)) || bandOf) {
    rows = rows0.map((r) => {
      const o = { ...r };
      if (years.size >= 2 && !columns0.includes(YEAR)) o[YEAR] = yearOf(r[dateCols[0]!]);
      if (bandOf) o[BAND] = bandOf.of(r[m1!]) ?? '';
      return o;
    });
    if (years.size >= 2 && !columns0.includes(YEAR)) derived.push(YEAR);
    if (bandOf) derived.push(BAND);
  }
  const columns = [...columns0, ...derived];
  const sample = rows.slice(0, 300);
  // Categories are labels: a numeric column (months of age, a stage, a customer number) is never a category.
  const IDLIKE = /customer|compte|account|contrat|contract|r[ée]f|\bid\b|code|matricule|num[ée]ro/i;
  // A number with a handful of values that is not an amount (a provisioning rate 25 / 50 / 100 %, a stage) is an axis.
  const catNums = numericCols.filter((c) => (isRate(c) || !numCols.includes(c)) && !IDLIKE.test(c) && (() => {
    const k = new Set(rows.map((r) => r[c]).filter(isNum)).size;
    return k >= 2 && k <= 8;
  })());
  const textAll = columns.filter((c) => (!numericCols.includes(c) || catNums.includes(c)) && !dateCols.includes(c) && new Set(sample.map((r) => String(r[c] ?? ''))).size >= 2);
  // One column per way of cutting the rows (the copies of a relationship column go).
  // When two columns are copies, the one people read stays (« ALPHA SA » rather than « C1000 »).
  const wordy = (c: string) => (IDLIKE.test(c) ? 0 : 1) + sample.filter((r) => /\p{L}{3,}/u.test(String(r[c] ?? ''))).length / Math.max(1, sample.length);
  const byReadable = [...textAll].sort((a, b) => wordy(b) - wordy(a));
  const textCols0 = textAll.filter((c) => !byReadable.slice(0, byReadable.indexOf(c)).some((o) => samePartition(rows, o, c)));
  const profile = profileColumns(rows, textCols0, m1);
  const dims = chartDims(profile).filter((c) => !derived.includes(c) || c === YEAR);
  // Names (clients, counterparties): too many for a chart axis, perfect for a Top-N ranking.
  const names = profile.filter((x) => x.distinct > 40 && x.readable >= 0.5 && !IDLIKE.test(x.col) && !x.reasons.some((r) => /codes|devise|drapeau/.test(r))).map((x) => x.col);
  const textCols = [...dims, ...names, ...textCols0.filter((c) => !dims.includes(c) && !names.includes(c))];

  const kpis: CloneData['kpis'] = [];
  for (const c of numCols.slice(0, 3)) {
    const v = rows.map((r) => r[c]).filter(isNum);
    if (!v.length) continue;
    const sum = v.reduce((a, b) => a + b, 0);
    const h = human(c, 30);
    if (isRate(c)) kpis.push({ label: `Moyenne — ${lcFirst(h)}`, value: fmt(sum / v.length), src: { fn: 'avg', col: c } });
    else kpis.push({ label: /^total\b/i.test(h) ? h : `Total ${lcFirst(h)}`, value: fmt(sum), src: { fn: 'sum', col: c } });
  }
  kpis.push({ label: names[0] ? `Lignes (${lcFirst(human(names[0], 18))})` : 'Nombre de lignes', value: fmt(rows.length), src: { fn: 'count' } });
  if (m1 && !isRate(m1)) {
    const v = rows.map((r) => r[m1]).filter(isNum);
    kpis.push({ label: `Moyenne — ${lcFirst(human(m1, 24))}`, value: fmt(v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)), src: { fn: 'avg', col: m1 } });
    kpis.push({ label: `Plus grand — ${lcFirst(human(m1, 22))}`, value: fmt(Math.max(...v)), src: { fn: 'max', col: m1 } });
  }
  const views: DataView[] = [];
  const group = (key: (r: Record<string, unknown>) => string | null, num: string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = key(r);
      if (k === null || k === '') continue;
      m.set(k, (m.get(k) ?? 0) + (num ? (isNum(r[num]) ? (r[num] as number) : 0) : 1));
    }
    return m;
  };
  const measures = numCols.filter((c) => !isRate(c)).slice(0, 2);
  // Trends by month first (they feed line / area panels).
  for (const d of dateCols.slice(0, 1))
    for (const n of measures) {
      const m = group((r) => {
        const x = asDate(r[d]);
        return x ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}` : null;
      }, n);
      // The recent window (24 months): a 15-year history drawn month by month is unreadable and its « change » absurd.
      const keys = [...m.keys()].sort().slice(-24);
      if (keys.length >= 2) {
        const values = keys.map((k) => m.get(k)!);
        const t = viewTitle({ measure: n, month: true, categories: keys, values });
        views.push({ title: t.title, insight: t.insight, categories: keys.map((k) => `${MONTHS[+k.slice(5) - 1]} ${k.slice(2, 4)}`), values, valueName: human(n, 24), ordered: true, src: { month: d, measure: n, keys } });
      }
    }
  const byView = (t: string, n: string | null) => {
    const m = group((r) => String(r[t] ?? '—'), n);
    // Years and amount bands keep their natural order (the last 8 years); everything else is ranked by value.
    const natural = t === YEAR || t === BAND;
    const yearKey = (k: string) => (k.startsWith('≤') ? -1 : Number(k));
    const top = natural ? [...m].sort((a, b) => (t === BAND && bandOf ? bandOf.labels.indexOf(a[0]) - bandOf.labels.indexOf(b[0]) : yearKey(a[0]) - yearKey(b[0]))) : [...m].sort((a, b) => b[1] - a[1]);
    const categories = top.map(([k]) => k);
    const values = top.map(([, v]) => v);
    const tt = t === BAND ? { title: 'Nombre de lignes par tranche de montant', insight: '' } : viewTitle({ measure: n, by: t, categories, values });
    if (t === YEAR) {
      const a = values[values.length - 2] ?? 0;
      const b = values[values.length - 1] ?? 0;
      tt.title = `${n ? human(n, 22) : 'Nombre'} par année`;
      tt.insight = a ? `${categories[categories.length - 1]} : ${b >= a ? '+' : ''}${Math.round(((b - a) / Math.abs(a)) * 100)} % vs ${categories[categories.length - 2]}` : '';
    }
    if (t === BAND) {
      const tot = values.reduce((a, b) => a + b, 0);
      const big = values[values.length - 1] ?? 0;
      tt.insight = tot ? `${Math.round((big / tot) * 100)} % des lignes ${categories[categories.length - 1]}` : '';
    }
    views.push({ title: tt.title, insight: tt.insight, categories, values, valueName: n ? human(n, 24) : 'Nombre', ordered: false, src: { by: t, measure: n } });
  };
  // The ranking of the names (Top 10 counterparties…) — the most read chart of a risk / sales dashboard.
  if (names[0]) {
    const before = views.length;
    byView(names[0], m1);
    const v = views[before];
    if (v) {
      const total = v.values.reduce((a, b) => a + b, 0);
      const top10 = v.values.slice(0, 10).reduce((a, b) => a + b, 0);
      v.title = `Classement — ${lcFirst(human(names[0], 20))}`;
      v.insight = total ? `top 10 = ${Math.round((top10 / total) * 100)} % du total` : '';
    }
  }
  for (const t of dims.slice(0, 3)) for (const n of measures.length ? measures : [null]) byView(t, n);
  if (bandOf && m1) byView(BAND, null);
  if (!views.length && numCols.length) {
    const n = numCols[0]!;
    views.push({ title: human(n), categories: rows.slice(0, 12).map((_, i) => `#${i + 1}`), values: rows.slice(0, 12).map((r) => (isNum(r[n]) ? (r[n] as number) : 0)), valueName: human(n, 24), ordered: true });
  }
  // SEGMENTS: the period, then the axes worth cutting by (readable, explanatory), then the amount bands.
  const segCols = [...(derived.includes(YEAR) ? [YEAR] : []), ...filterDims(profile.filter((x) => x.col !== YEAR && x.col !== BAND), 2), ...(bandOf ? [BAND] : [])].slice(0, 3);
  const filters = segCols.map((c) => ({ col: c, label: c === YEAR || c === BAND ? c : human(c, 24), values: c === BAND && bandOf ? bandOf.labels : [...new Set(rows.map((r) => String(r[c] ?? '')).filter(Boolean))].sort((a, b) => (a.startsWith('≤') ? -1 : b.startsWith('≤') ? 1 : a.localeCompare(b, 'fr', { numeric: true }))) }));
  // Detail table: who (a name, not a code) and the amounts, biggest first.
  const NAME = /client|nom|name|soci[ée]t[ée]|raison|libell|relation|d[ée]biteur|agence|produit|tiers|partenaire/i;
  const CODEY = /code|^id\b|n°|r[ée]f|num[ée]ro|matricule|contrat|compte/i;
  const noisy = new Set(profile.filter((x) => x.reasons.some((r) => /codes|devise|drapeau/.test(r))).map((x) => x.col));
  const labelCols = [...names, ...columns.filter((c) => !names.includes(c) && !noisy.has(c) && !derived.includes(c) && !numericCols.includes(c) && !dateCols.includes(c) && textCols0.includes(c) && sample.some((r) => typeof r[c] === 'string' && /\p{L}{2,}/u.test(r[c] as string)))]
    .sort((a, b) => (NAME.test(b) ? 2 : 0) - (CODEY.test(b) ? 1 : 0) - ((NAME.test(a) ? 2 : 0) - (CODEY.test(a) ? 1 : 0)));
  const tcols = labelCols.length || numCols.length ? [...labelCols.slice(0, 2), ...numCols.slice(0, 3)] : columns.slice(0, 5);
  const ranked = m1 ? [...rows].sort((a, b) => (isNum(b[m1]) ? (b[m1] as number) : 0) - (isNum(a[m1]) ? (a[m1] as number) : 0)) : rows;
  return { source: { columns, rows, numCols, textCols, dateCol: dateCols[0] }, title, subtitle: `${rows.length.toLocaleString('fr-FR').replace(/[  ]/g, ' ')} lignes · édité le ${new Date().toLocaleDateString('fr-FR')}`, kpis, views, filters, table: { columns: tcols, rows: ranked.slice(0, 60).map((r) => tcols.map((c) => (isNum(r[c]) ? (r[c] as number) : String(r[c] ?? '')))) } };
}
const lcFirst = (s: string) => (/^[A-ZÀ-Ý]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

// ── colour helpers ───────────────────────────────────────────────────────────────────────────────────────────────────
const rgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16));
const lumH = (h: string) => {
  const [r, g, b] = rgb(h);
  return (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;
};
export const mixH = (a: string, b: string, t: number) => {
  const A = rgb(a);
  const B = rgb(b);
  return `#${A.map((x, i) => Math.round(x + (B[i]! - x) * t).toString(16).padStart(2, '0')).join('')}`;
};
/** n colours following the panel's own palette: a dark→light ramp for sequential designs, else its colours in turn. */
export function colorsFor(p: Panel, n: number, fallback: string[]): string[] {
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
  // The latest months (a trend reads up to now).
  const cats = v.categories.slice(-n);
  const vals = v.values.slice(-n);
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
  // Crowded panel: every k-th label only (the last one always), so labels never overlap.
  const every = Math.max(1, Math.ceil((fs * 4.2) / Math.max(1, (r.w - fs * 2) / Math.max(1, n - 1))));
  vals.forEach((val, i) => {
    const show = (n - 1 - i) % every === 0;
    out += `<circle cx="${X(i)}" cy="${Y(val)}" r="${Math.max(2, fs * 0.28)}" fill="${color}"/>`;
    if (show) out += `<text x="${X(i)}" y="${Y(val) - fs * 0.6}" text-anchor="middle" font-size="${fs * 0.85}" fill="${muted}">${esc(fmt(val))}</text>`;
    if (show) out += `<text x="${X(i)}" y="${r.y + r.h - bottom * 0.3}" text-anchor="middle" font-size="${fs * 0.85}" fill="${p.text}">${esc(trunc(cats[i]!, 8))}</text>`;
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
export function contrastH(a: string, b: string): number {
  const L = (h: string) =>
    rgb(h)
      .map((v) => v! / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
  const [x, y] = [L(a), L(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}
/** The first readable colour on a fill (the design's own colours first). */
export const readableOn = (fill: string, prefs: string[], min = 3.2) =>
  prefs.find((c) => c && contrastH(c, fill) >= min) ?? (contrastH('#FFFFFF', fill) >= contrastH('#111827', fill) ? '#FFFFFF' : '#111827');
function kpiTiles(r: R, kpis: CloneData['kpis'], p: Panel, fs: number, onBg = false): string {
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
      return `${n > 1 && !onBg ? `<rect x="${x}" y="${r.y}" width="${tw}" height="${r.h}" rx="${Math.max(4, p.radius * 0.6)}" fill="${fill}"/>` : ''}<text x="${x + tw / 2}" y="${r.y + r.h * 0.34}" text-anchor="middle" font-size="${Math.min(fs, r.h * 0.18)}" fill="${labelC}">${esc(trunc(k.label, 26))}</text><text x="${x + tw / 2}" y="${r.y + r.h * 0.34 + vs * 1.15}" text-anchor="middle" font-size="${vs}" font-weight="700" fill="${valueC}">${esc(k.value)}</text>`;
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
  const fit = Math.max(4, Math.floor((cw - 10) / (fs * 0.58)));
  cols.forEach((c, j) => (out += `<text x="${r.x + j * cw + 6}" y="${r.y + rowH * 0.68}" font-size="${fs}" font-weight="700" fill="${lumH(head) < 0.5 ? '#fff' : p.text}">${esc(trunc(human(c), fit))}</text>`));
  for (let i = 0; i < n; i++) {
    const y = r.y + rowH * (i + 1);
    if (i % 2) out += `<rect x="${r.x}" y="${y}" width="${r.w}" height="${rowH}" fill="${zebra}"/>`;
    cols.forEach((_, j) => {
      const val = t.rows[i]![t.columns.indexOf(cols[j]!)];
      out += `<text x="${r.x + j * cw + 6}" y="${y + rowH * 0.68}" font-size="${fs * 0.95}" fill="${p.text}">${esc(trunc(typeof val === 'number' ? fmt(val) : String(val ?? ''), fit))}</text>`;
    });
  }
  return out;
}

/**
 * SEGMENT (slicer, as in Excel / Power BI): the axis name, then its values as a list with check boxes — « Tout » ticked
 * (the dashboard shows every row). Never a row of buttons.
 */
export function slicerBlock(r: R, f: NonNullable<CloneData['filters']>[number], p: Panel, fs: number, accent: string): string {
  const head = fs * 1.15;
  const rowH = fs * 1.75;
  let out = `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${Math.min(8, fs * 0.6)}" fill="${p.fill}" stroke="${mixH(p.text, p.fill, 0.18)}" stroke-width="1"/>`;
  out += `<text x="${r.x + fs * 0.7}" y="${r.y + head * 1.25}" font-size="${head}" font-weight="700" fill="${p.text}">${esc(trunc(f.label, Math.round(r.w / (head * 0.58)) - 3))}</text>`;
  // funnel icon (the slicer's « clear filter » corner)
  const ix = r.x + r.w - fs * 1.6;
  const iy = r.y + head * 0.45;
  out += `<path d="M${ix} ${iy} h${fs} l${-fs * 0.38} ${fs * 0.5} v${fs * 0.45} l${-fs * 0.24} ${fs * 0.15} v${-fs * 0.6} z" fill="none" stroke="${mixH(p.text, p.fill, 0.5)}" stroke-width="1"/>`;
  const items = ['Tout', ...f.values];
  const n = Math.max(1, Math.min(items.length, Math.floor((r.h - head * 1.9) / rowH)));
  const box = fs * 0.85;
  items.slice(0, n).forEach((it, i) => {
    const y = r.y + head * 1.9 + i * rowH;
    const on = i === 0;
    out += `<rect x="${r.x + fs * 0.7}" y="${y + (rowH - box) / 2 - fs * 0.2}" width="${box}" height="${box}" rx="2" fill="${on ? accent : p.fill}" stroke="${on ? accent : mixH(p.text, p.fill, 0.45)}" stroke-width="1"/>`;
    if (on) out += `<path d="M${r.x + fs * 0.88} ${y + rowH / 2 - fs * 0.2} l${box * 0.28} ${box * 0.28} l${box * 0.45} ${-box * 0.5}" fill="none" stroke="#fff" stroke-width="${Math.max(1, fs * 0.12)}"/>`;
    out += `<text x="${r.x + fs * 0.7 + box + fs * 0.5}" y="${y + rowH / 2 + fs * 0.15}" font-size="${fs}" font-weight="${on ? 700 : 400}" fill="${p.text}">${esc(trunc(it, Math.round((r.w - box - fs * 2) / (fs * 0.56))))}</text>`;
  });
  if (items.length > n) out += `<text x="${r.x + r.w - fs * 0.7}" y="${r.y + r.h - fs * 0.5}" text-anchor="end" font-size="${fs * 0.85}" fill="${mixH(p.text, p.fill, 0.55)}">+${items.length - n} ▾</text>`;
  return out;
}
/** Where each segment of a filter panel goes: stacked in a tall panel, side by side in a wide one. */
export function slicerBoxes(r: R, n: number, gap: number): R[] {
  const tall = r.h > r.w;
  return Array.from({ length: n }, (_, i) =>
    tall ? { x: r.x, y: r.y + (i * (r.h + gap)) / n, w: r.w, h: r.h / n - gap } : { x: r.x + (i * (r.w + gap)) / n, y: r.y, w: r.w / n - gap, h: r.h },
  );
}

/** The full reproduction. `W` = width in px of the SVG coordinate system. */
/**
 * Menus, slicers, button grids: the image's text slots filled with the user's own labels — the dashboard title over the
 * first stacked lines (a logo block), a column of items gets the analysis axes, a grid of buttons gets months /
 * categories. Shared by the picture and the native Excel sheet.
 */
export function slotTexts(p: Panel, d: CloneData, P: (b: { x: number; y: number; w: number; h: number }) => { x: number; y: number; w: number; h: number }, r: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number; text: string; size: number; color: string; bold: boolean }[] {
  if (!p.slots?.length) return [];
  const axes = [...new Set(d.views.map((x) => (x.ordered ? 'Évolution mensuelle' : x.title.split(' par ')[1] ?? x.title)))];
  const cats = [...new Set(d.views.filter((x) => !x.ordered).flatMap((x) => x.categories))];
  const months = d.views.find((x) => x.ordered)?.categories ?? [];
  const slots = p.slots.map((sl) => ({ ...sl, r: P(sl.box) })).sort((a, b) => a.r.y - b.r.y || a.r.x - b.r.x);
  const rowOf = (k: number) => slots.filter((o) => Math.abs(o.r.y - slots[k]!.r.y) < Math.max(4, slots[k]!.r.h * 0.6));
  let ai = 0;
  let ci = 0;
  let mi = 0;
  let head = 1;
  while (head < Math.min(3, slots.length) && Math.abs(slots[head]!.r.x - slots[0]!.r.x) < 6 && slots[head]!.r.y - (slots[head - 1]!.r.y + slots[head - 1]!.r.h) < slots[0]!.r.h * 0.9 && rowOf(head).length < 3) head++;
  const words = d.title.split(/\s+/);
  const per = Math.ceil(words.length / head);
  const heights = slots.map((o) => o.r.h).sort((a, b) => a - b);
  const typical = heights[Math.floor(heights.length / 2)] ?? 10;
  return slots.map((sl, k) => {
    const inGrid = rowOf(k).length >= 3;
    const label = k < head ? words.slice(k * per, (k + 1) * per).join(' ') : inGrid ? (months.length > mi ? months[mi++]! : cats[ci++ % Math.max(1, cats.length)] ?? '') : axes[ai++ % Math.max(1, axes.length)] ?? '';
    // A highlighted button measures taller than its text: never bigger than the typical slot.
    const size = Math.max(7, Math.min(sl.r.h, typical * 1.25) * 0.92);
    const maxCh = Math.max(3, Math.round((inGrid ? sl.r.w * 1.6 : r.x + r.w - sl.r.x - 4) / (size * 0.55)));
    return { ...sl.r, text: trunc(String(label), maxCh), size, color: sl.color, bold: k < head };
  });
}

/**
 * What each panel shows — the same assignment for the picture and for the native Excel version: chart panels take the
 * data views in turn (trends for line / area), KPI panels the KPIs in turn.
 */
export type PlanKind = 'kpi' | 'bar' | 'hbar' | 'line' | 'area' | 'pie' | 'donut' | 'table' | 'text' | 'title' | 'image' | 'filter';
export function panelPlan(spec: DashSpec, d: CloneData): { kind: PlanKind; view?: DataView; kpis?: CloneData['kpis'] }[] {
  let viewIdx = 0;
  let kpiIdx = 0;
  const trend = d.views.filter((v) => v.ordered);
  const shown = new Set<DataView>();
  const cats = d.views.filter((v) => !v.ordered);
  // How well a view suits a chart form: a ring for a few parts of a whole, horizontal bars for a ranking, columns or a
  // line for time — never a ring of years nor a ranking of 2 600 names in a pie.
  const suit = (kind: PlanKind, v: DataView): number => {
    const n = v.categories.length;
    const time = v.ordered || v.src?.by === 'Année';
    const ranking = !v.ordered && n > 8;
    if (kind === 'line' || kind === 'area') return v.ordered ? 10 : time ? 6 : 0;
    if (kind === 'pie' || kind === 'donut') return time || ranking ? 0 : n <= 6 ? 9 : 2;
    if (kind === 'hbar') return ranking ? 10 : time ? 2 : 6;
    return time ? 8 : ranking ? 4 : 7; // bar
  };
  void cats;
  void trend;
  return spec.panels.map((p) => {
    const kind = (p.kind === 'map' ? 'hbar' : p.kind === 'gauge' ? 'donut' : p.kind) as PlanKind;
    if (['bar', 'hbar', 'line', 'area', 'pie', 'donut'].includes(kind)) {
      // Never the same view twice while another one is still unused (two identical charts read as a bug); the best
      // suited unused view first.
      const ranked = [...d.views].sort((a, b) => suit(kind, b) - suit(kind, a));
      const fresh = ranked.find((v) => !shown.has(v) && suit(kind, v) > 0);
      const view = fresh ?? ranked[viewIdx % Math.max(1, ranked.length)];
      viewIdx++;
      if (view) shown.add(view);
      return { kind, view };
    }
    if (kind === 'kpi') {
      const ks = d.kpis.slice(kpiIdx, kpiIdx + Math.max(1, p.tiles));
      kpiIdx += ks.length;
      return { kind, kpis: ks.length ? ks : d.kpis.slice(0, 1) };
    }
    return { kind };
  });
}

export function renderCloneSvg(spec: DashSpec, d: CloneData, W = 1200): string {
  const H = Math.round(W / spec.aspect);
  const P = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H });
  const font = spec.font.replace(/[<>"]/g, '');
  const fallback = spec.palette.series.length ? spec.palette.series : [spec.palette.primary, spec.palette.accent];
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'${font}', 'Segoe UI', Calibri, Arial, sans-serif" data-dash-clone="1">`;
  // ON THE IMAGE'S OWN DESIGN: its clean background (content removed) — only the texts and the data are drawn.
  const onBg = !!spec.background;
  if (onBg) s += `<image href="${esc(spec.background!)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`;
  else s += `<rect width="${W}" height="${H}" fill="${spec.outer}"/>`;
  const pb = P(spec.pageBox);
  if (onBg) {
    /* frame, page and cards are in the background */
  } else if (spec.frame) {
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
    if (spec.title.fill && !onBg) s += `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" fill="${spec.title.fill}"/>`;
    const fs = Math.max(10, t.h * (onBg ? 0.95 : 0.78));
    const x = spec.title.align === 'center' ? t.x + t.w / 2 : t.x;
    s += `<text x="${x}" y="${t.y + t.h * 0.82}" text-anchor="${spec.title.align === 'center' ? 'middle' : 'start'}" font-size="${fs}" font-weight="800" fill="${spec.title.color}">${esc(d.title)}</text>`;
  }
  if (onBg && spec.subtitle && d.subtitle) {
    const sb = P(spec.subtitle.box);
    const sfs = Math.max(8, sb.h * 0.92);
    s += `<text x="${sb.x}" y="${sb.y + sb.h * 0.8}" font-size="${sfs}" fill="${spec.subtitle.color}">${esc(trunc(d.subtitle, Math.round((W - sb.x) / (sfs * 0.55))))}</text>`;
  }
  const plan = panelPlan(spec, d);
  for (const [pi, p] of spec.panels.entries()) {
    const r = P(p.box);
    const fs = Math.max(8, Math.min(15, Math.min(r.h * 0.075, r.w * 0.045)));
    if (!onBg && !(p.kind === 'kpi' && p.tileFills?.length)) s += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${p.radius}" fill="${p.fill}"${p.border ? ` stroke="${p.border}" stroke-width="${Math.max(1, p.borderWidth)}"` : ''}/>`;
    const pad = Math.max(6, fs * 0.6);
    // The image's title line, measured: the new title takes its place, size and colour; the chart starts below it.
    const tb = p.titleBox ? P(p.titleBox) : null;
    const titleH = p.kind === 'kpi' || p.kind === 'title' || p.kind === 'image' || p.kind === 'filter' ? 0 : tb ? Math.max(0, tb.y + tb.h - r.y - pad) + fs * 0.5 : fs * 1.9;
    const inner = { x: r.x + pad, y: r.y + pad + titleH, w: r.w - pad * 2, h: r.h - pad * 2 - titleH };
    const { kind, view: v } = plan[pi]!;
    // Menus, slicers, button grids: the image's text slots filled with the user's own labels — the dashboard title
    // first, a column of items gets the analysis axes, a grid of buttons gets categories / months.
    // FILTERS → SEGMENTS (slicers) on the axes the analysis chose; the image's buttons are not copied.
    if (kind === 'filter' && d.filters?.length) {
      const fi = plan.slice(0, pi).filter((x) => x.kind === 'filter').length;
      const per = Math.max(1, Math.ceil(d.filters.length / Math.max(1, plan.filter((x) => x.kind === 'filter').length)));
      const mine = d.filters.slice(fi * per, fi * per + per);
      const accent = p.colors[0] ?? spec.palette.primary;
      const area = { x: r.x + pad * 0.5, y: r.y + pad * 0.5, w: r.w - pad, h: r.h - pad };
      slicerBoxes(area, mine.length, pad * 0.6).forEach((b, k) => (s += slicerBlock(b, mine[k]!, p, Math.max(7, Math.min(12, fs)), accent)));
      continue;
    }
    if (onBg && p.slots?.length && (kind === 'filter' || kind === 'title')) {
      for (const t of slotTexts(p, d, P, r)) s += `<text x="${t.x}" y="${t.y + t.h / 2 + t.size * 0.36}" font-size="${t.size}" font-weight="${t.bold ? 800 : 600}" fill="${t.color}">${esc(t.text)}</text>`;
      continue;
    }
    if (titleH && (v || kind === 'table' || kind === 'text')) {
      const label = v ? (v.insight ? `${v.title} · ${v.insight}` : v.title) : kind === 'table' ? 'Détail' : 'Points clés';
      if (tb) {
        const tfs = Math.max(8, tb.h * 0.92);
        const tx = p.titleAlign === 'center' ? r.x + r.w / 2 : tb.x;
        s += `<text x="${tx}" y="${tb.y + tb.h * 0.8}" text-anchor="${p.titleAlign === 'center' ? 'middle' : 'start'}" font-size="${tfs}" font-weight="700" fill="${p.titleColor ?? p.text}">${esc(trunc(label, Math.round((r.x + r.w - tx) / (tfs * 0.55))))}</text>`;
      } else s += `<text x="${p.titleAlign === 'center' ? r.x + r.w / 2 : r.x + pad}" y="${r.y + pad + fs * 1.05}" text-anchor="${p.titleAlign === 'center' ? 'middle' : 'start'}" font-size="${fs * 1.08}" font-weight="700" fill="${p.text}">${esc(trunc(label, Math.round(r.w / (fs * 0.6))))}</text>`;
    }
    if (inner.w < 10 || inner.h < 10) continue;
    if (v && (kind === 'bar' || kind === 'hbar')) s += barChart(inner, v, p, kind === 'hbar', fs, fallback);
    else if (v && (kind === 'line' || kind === 'area')) s += lineChart(inner, v, p, kind === 'area', fs, fallback);
    else if (v && (kind === 'pie' || kind === 'donut')) s += pieChart(inner, v, p, kind === 'donut', fs, fallback);
    else if (kind === 'kpi' && onBg && p.valueBox && Math.max(1, p.tiles) === 1) {
      // The KPI exactly where the image had its figure (same size, colour), its label where the image had its title.
      const k = plan[pi]!.kpis![0]!;
      const vb = P(p.valueBox);
      const vfs = Math.max(10, vb.h * 0.95);
      const vx = vb.x + vb.w; // figures are right-aligned on their measured box…
      const centred = Math.abs(vb.x + vb.w / 2 - (r.x + r.w / 2)) < r.w * 0.12;
      s += `<text x="${centred ? r.x + r.w / 2 : vx}" y="${vb.y + vb.h * 0.82}" text-anchor="${centred ? 'middle' : 'end'}" font-size="${vfs}" font-weight="700" fill="${p.valueColor ?? p.text}">${esc(k.value)}</text>`;
      if (tb) s += `<text x="${p.titleAlign === 'center' ? r.x + r.w / 2 : tb.x}" y="${tb.y + tb.h * 0.8}" text-anchor="${p.titleAlign === 'center' ? 'middle' : 'start'}" font-size="${Math.max(8, tb.h * 0.92)}" fill="${p.titleColor ?? p.text}">${esc(trunc(k.label, Math.round(r.w / (tb.h * 0.5))))}</text>`;
    } else if (kind === 'kpi') s += kpiTiles({ x: r.x + pad, y: r.y + pad, w: r.w - pad * 2, h: r.h - pad * 2 }, plan[pi]!.kpis!, p, fs, onBg);
    else if (kind === 'table') s += tableBlock(inner, d.table, p, fs);
    else if (kind === 'text') {
      const v0 = d.views.find((v) => !v.ordered) ?? d.views[0];
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
