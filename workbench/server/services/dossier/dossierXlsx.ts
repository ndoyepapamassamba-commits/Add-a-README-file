// THE COMMITTEE WORKBOOK — « nouveau concept », relevé sur le classeur de référence du comité (Covenant & Trigger
// Intelligence) : la même grille de 13 colonnes (marges A et M, contenu B→L), un bandeau marine avec plaque logo, date
// d'arrêté, public et pastille d'alerte vivante, deux rangées de BOUTONS STYLÉS (formes Excel natives en dégradé, pastille
// ronde avec flèche, ombre, lien vers la vue — le bouton de la vue courante en couleur d'accent), des sections numérotées
// « 01 · … » sur bandeau marine filet d'accent, des SÉLECTEURS (listes déroulantes) qui pilotent les indicateurs, les
// graphiques et le top 10 par des formules vivantes sur la feuille DONNÉES, des tuiles à liseré de ton, la thèse, les
// indicateurs du comité, la scorecard des chapitres (barres de données, échelle de couleurs, bouton « Ouvrir »), les
// visuels 2 × 2 avec leur « Lecture — », le top 10 trié dynamiquement, les messages clés et les décisions à voter, puis une
// vue par chapitre, le plan d'actions avec statut et avancement vivant, les décisions, les hypothèses, les paramètres
// nommés, la qualité des données, les sources, le glossaire, DATA_KPI, DONNÉES (tableau Excel), LISTES et CALC.
// Toutes les couleurs viennent du thème actif : toutes les feuilles changent ensemble.
import XLSXS from 'xlsx-js-style';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { activeDesign, liveColorProxy, type Design } from '../houseDesign';
import { chartXml, fixStylesXml, type ChartSpec } from '../houseStyle';
import { allRecos, type Chapter, type Dossier, type Figure, type Kpi, type Tone } from './dossier';
import { columnConcepts } from '../dataLexicon';

/** The rows behind the dossier: the selectors and the live indicators are computed on them. */
export interface DossierData {
  columns: string[];
  rows: Record<string, unknown>[];
  /** Numeric column measured (encours, montant…). */
  measure?: string | null;
  measureLabel?: string;
  /** Name / identifier column ranked in the top 10. */
  entity?: string | null;
  /** Up to four categorical columns offered as selectors (segment, agence, facteur…). */
  selectors?: string[];
  source?: string;
}
export interface XlsxOptions {
  data?: DossierData | null;
  logo?: { png: Uint8Array; width: number; height: number } | null;
}

type Cell = { v: unknown; t: 's' | 'n' | 'b'; s?: Record<string, unknown>; z?: string; f?: string; l?: { Target: string; Tooltip?: string } };
const C = liveColorProxy((c) => c) as Design['color'];
const ui = () => activeDesign().font.ui;
const monoFont = () => activeDesign().font.mono;
const solid = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });
const bd = (rgb: string, style = 'thin') => ({ style, color: { rgb } });
const box = (rgb?: string) => ({ top: bd(rgb ?? C.line), bottom: bd(rgb ?? C.line), left: bd(rgb ?? C.line), right: bd(rgb ?? C.line) });
const F = (extra: Record<string, unknown> = {}) => ({ name: ui(), sz: 9.5, color: { rgb: C.text }, ...extra });
const M = (extra: Record<string, unknown> = {}) => ({ name: monoFont(), sz: 9.5, color: { rgb: C.text }, ...extra });
// Harmonised tones (v62, « harmoniser la couleur des segments ») : the theme's own colours carry the meaning — navy /
// primary for neutral and information, the accent for « à surveiller », red ONLY for a risk, green for « conforme ».
const toneColor = (t?: Tone): string => (t === 'risk' ? C.risk : t === 'warn' ? C.gold : t === 'ok' ? C.green : t === 'info' ? C.blue : C.navy);
/** The same tone as TEXT on a light panel: the accent is darkened so it stays readable (contrast ≥ 4.5:1). */
const toneInk = (t?: Tone): string => (t === 'warn' ? mix(C.gold, -0.45) : t === 'risk' ? C.risk : t === 'ok' ? mix(C.green, -0.25) : C.text2);
const toneMark = (t?: Tone): string => (t === 'risk' ? '▲' : t === 'warn' ? '◆' : t === 'ok' ? '▼' : t === 'info' ? '●' : '■');
const xesc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
/** Lighten (t > 0) or darken (t < 0) a hex colour. */
export function mix(hex: string, t: number): string {
  const n = parseInt(hex.replace('#', '').slice(-6), 16);
  const f = (x: number) => (t >= 0 ? Math.round(x + (255 - x) * t) : Math.round(x * (1 + t)));
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => f(x).toString(16).padStart(2, '0')).join('').toUpperCase();
}
const colName = (i: number) => XLSXS.utils.encode_col(i);
const quote = (sheet: string) => `'${sheet.replace(/'/g, "''")}'`;
const safeName = (s: string) => s.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31);

// ── The reference grid: A and M are 1.6 margins, B → L carry the content. ──
const GRID = [1.6, 5.86, 14.43, 21, 10.14, 10.14, 8, 12.29, 21, 21, 21, 21, 1.6];
const FIRST = 1;
/** Four tiles / selectors per row, as in the reference (B–D, E–H, I–J, K–L). */
const QUARTERS: [number, number][] = [[1, 3], [4, 7], [8, 9], [10, 11]];
/** Two charts per row (B–G, H–L). */
const HALVES: [number, number][] = [[1, 6], [7, 11]];

const MDS_FMT = '[>=1000000000]#,##0.0,,," Mds";[>=1000000]#,##0.0,," M";#,##0';
const fmtFor = (k: Kpi): string => (k.value.includes('%') ? '0.0%' : k.num != null && Math.abs(k.num) >= 1e6 ? MDS_FMT : k.num != null && !Number.isInteger(k.num) ? '#,##0.0' : '#,##0');

interface Shape {
  kind: 'button' | 'plate' | 'picture';
  r: number;
  /** Absolute horizontal span in EMU (from the sheet's left edge). */
  x: number;
  w: number;
  /** Vertical inset (EMU) inside the row. */
  inset: number;
  label?: string;
  glyph?: string;
  target?: string;
  active?: boolean;
  small?: boolean;
  png?: Uint8Array;
}
interface Placed {
  spec: ChartSpec;
  r1: number;
  r2: number;
  c1: number;
  c2: number;
}

class Sheet {
  aoa: Cell[][] = [];
  heights: Record<number, number> = {};
  merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  shapes: Shape[] = [];
  charts: Placed[] = [];
  validations: { ref: string; formula: string }[] = [];
  cfs: string[] = [];
  section = 0;
  freezeRow?: number;
  table?: { r1: number; r2: number; c1: number; c2: number; names: string[]; name: string };
  landscape = true;
  constructor(public name: string, public tab: string, public cols: number[] = GRID) {}
  get last(): number {
    return this.cols.length - 2;
  }
  row(h = 15): number {
    const r = this.aoa.length;
    this.aoa.push(Array.from({ length: this.cols.length }, () => ({ v: '', t: 's' as const })));
    this.heights[r] = h;
    return r;
  }
  put(r: number, c: number, cell: Cell) {
    this.aoa[r]![c] = cell;
  }
  /** Same style on every cell of the range (so merged borders draw), the first cell keeps its value. */
  span(r1: number, c1: number, r2: number, c2: number, cell: Cell) {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) this.aoa[r]![c] = r === r1 && c === c1 ? cell : { v: '', t: 's', s: cell.s };
    if (r2 > r1 || c2 > c1) this.merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
  }
  gap(h = 6) {
    this.row(h);
  }
  colX(c: number): number {
    let x = 0;
    for (let i = 0; i < c; i++) x += colEmu(this.cols[i]!);
    return x;
  }
  ref(r: number, c: number, abs = true): string {
    return abs ? `$${colName(c)}$${r + 1}` : `${colName(c)}${r + 1}`;
  }
}
/** Excel column width (characters) → EMU (≈ 7 px per character + 5 px padding, 9 525 EMU per px). */
const colEmu = (w: number) => Math.floor(w * 7 + 5) * 9525;
const ptEmu = (pt: number) => Math.round(pt * 12700);
const estLines = (text: string, widthChars: number, sz = 9.5) => Math.max(1, Math.ceil((text.length * (sz / 9.5) * 1.12) / Math.max(10, widthChars)));
const widthOf = (s: Sheet, c1: number, c2: number) => s.cols.slice(c1, c2 + 1).reduce((a, b) => a + b, 0);

// ── Blocks ────────────────────────────────────────────────────────────────────
interface Ctx {
  d: Dossier;
  views: { name: string; label: string }[];
  logo?: XlsxOptions['logo'];
  alert: Cell;
}
/** Title band (2 rows): logo plate, title + subtitle, ARRÊTÉ / public, the live alert pill; then the accent filet. */
function header(s: Sheet, ctx: Ctx, title: string, subtitle: string) {
  const L = s.last;
  const r1 = s.row(30);
  const r2 = s.row(26);
  const navy = { fill: solid(C.navy) };
  s.span(r1, 0, r2, 0, { v: '', t: 's', s: navy });
  s.span(r1, L + 1, r2, L + 1, { v: '', t: 's', s: navy });
  s.span(r1, FIRST, r2, FIRST + 1, { v: '', t: 's', s: navy });
  const tEnd = Math.max(FIRST + 3, L - 2);
  s.span(r1, FIRST + 2, r1, tEnd, { v: title, t: 's', s: { font: F({ sz: 15, bold: true, color: { rgb: C.white } }), fill: solid(C.navy), alignment: { vertical: 'center', horizontal: 'left', indent: 1 } } });
  s.span(r2, FIRST + 2, r2, tEnd, { v: subtitle.length > 190 ? `${subtitle.slice(0, 187)}…` : subtitle, t: 's', s: { font: F({ sz: 8.5, color: { rgb: C.subtle } }), fill: solid(C.navy), alignment: { vertical: 'top', horizontal: 'left', indent: 1, wrapText: true } } });
  const asOf = ctx.d.asOf ?? ctx.d.date;
  const band = { font: F({ sz: 8.5, bold: true, color: { rgb: C.white } }), fill: solid(mix(C.navy, 0.12)), alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: { left: bd(C.navy, 'medium') } };
  s.put(r1, L - 1, { v: `ARRÊTÉ  ${asOf}`, t: 's', s: band });
  s.put(r1, L, { v: (ctx.d.audience ?? 'COMITÉ').toUpperCase().slice(0, 40), t: 's', s: band });
  s.span(r2, L - 1, r2, L, { ...ctx.alert, s: { font: F({ sz: 9, bold: true, color: { rgb: C.navy } }), fill: solid(C.gold), alignment: { horizontal: 'center', vertical: 'center' } } });
  // The logo plate (picture when the user chose a logo, else the organisation's name on a white plate).
  const x = s.colX(FIRST) + ptEmu(4);
  const w = colEmu(s.cols[FIRST]!) + colEmu(s.cols[FIRST + 1]!) - ptEmu(8);
  s.shapes.push(ctx.logo ? { kind: 'picture', r: r1, x, w, inset: ptEmu(4), png: ctx.logo.png } : { kind: 'plate', r: r1, x, w, inset: ptEmu(5), label: ctx.d.org || ctx.d.unit || 'Dossier' });
  const f = s.row(3);
  for (let c = 0; c <= L + 1; c++) s.put(f, c, { v: '', t: 's', s: { fill: solid(C.gold) } });
}
/** Two (or more) rows of styled buttons: ◀ PRÉCÉDENT, ⌂ COCKPIT, the views, SUIVANT ▶ — the current view in accent. */
function nav(s: Sheet, ctx: Ctx) {
  const i = ctx.views.findIndex((v) => v.name === s.name);
  const prev = ctx.views[(i - 1 + ctx.views.length) % ctx.views.length]!;
  const next = ctx.views[(i + 1) % ctx.views.length]!;
  const items: { label: string; glyph: string; target: string; active?: boolean }[] = [
    { label: 'PRÉCÉDENT', glyph: '◀', target: prev.name },
    { label: ctx.views[0]!.label, glyph: '⌂', target: ctx.views[0]!.name, active: i === 0 },
    ...ctx.views.slice(1).map((v) => ({ label: v.label, glyph: '›', target: v.name, active: v.name === s.name })),
  ];
  items.splice(Math.min(7, items.length), 0, { label: 'SUIVANT', glyph: '▶', target: next.name });
  const per = 8;
  const x0 = s.colX(FIRST);
  const total = s.colX(s.last + 1) - x0;
  const gapX = ptEmu(5);
  const w = Math.floor((total - gapX * (per - 1)) / per);
  s.gap(5);
  for (let k = 0; k < items.length; k += per) {
    const r = s.row(22);
    items.slice(k, k + per).forEach((b, j) => s.shapes.push({ kind: 'button', r, x: x0 + j * (w + gapX), w, inset: ptEmu(2), label: b.label, glyph: b.glyph, target: b.target, active: b.active }));
    s.gap(4);
  }
  s.gap(4);
}
/** « 01 · TITLE » on a navy band with the accent filet under it. */
function section(s: Sheet, title: string) {
  s.section++;
  const r = s.row(22);
  s.span(r, FIRST, r, s.last, { v: `${String(s.section).padStart(2, '0')}  ·  ${title.toUpperCase()}`, t: 's', s: { font: F({ sz: 10, bold: true, color: { rgb: C.white } }), fill: solid(C.navy), alignment: { vertical: 'center', horizontal: 'left', indent: 1 } } });
  const f = s.row(3);
  s.span(f, FIRST, f, s.last, { v: '', t: 's', s: { fill: solid(C.gold) } });
  s.gap(6);
}
/** A label in small caps (blue or red) on its own row. */
function label(s: Sheet, text: string, color = C.blue) {
  const r = s.row(18);
  s.span(r, FIRST, r, s.last, { v: text.toUpperCase(), t: 's', s: { font: F({ sz: 8.5, bold: true, color: { rgb: color } }), alignment: { vertical: 'bottom' }, border: { bottom: bd(color) } } });
}
/** A paragraph over B→L (or a span), height from its length. */
function para(s: Sheet, text: string, o: { italic?: boolean; fill?: string; accent?: string; color?: string; sz?: number; bold?: boolean; c1?: number; c2?: number } = {}) {
  const c1 = o.c1 ?? FIRST;
  const c2 = o.c2 ?? s.last;
  const sz = o.sz ?? 9.5;
  const lines = estLines(text, widthOf(s, c1, c2), sz);
  const r = s.row(Math.min(400, Math.max(18, lines * (sz * 1.45) + 8)));
  s.span(r, c1, r, c2, {
    v: text,
    t: 's',
    s: { font: F({ sz, italic: Boolean(o.italic), bold: Boolean(o.bold), color: { rgb: o.color ?? C.text } }), fill: o.fill ? solid(o.fill) : undefined, alignment: { wrapText: true, vertical: 'center', horizontal: 'left', indent: 1 }, border: o.accent ? { left: bd(o.accent, 'thick') } : undefined },
  });
  return r;
}
const lecture = (s: Sheet, text: string, c1?: number, c2?: number) => para(s, text.startsWith('Lecture') ? text : `Lecture — ${text}`, { italic: true, fill: C.ice, accent: C.gold, color: C.text2, sz: 9, c1, c2 });
const bullets = (s: Sheet, items: string[], mark = '▸') => items.forEach((t) => para(s, `${mark} ${t}`));

interface Tile {
  label: string;
  value: Cell;
  sub: Cell;
  tone?: Tone;
}
/** Tiles four per row: label (small caps), value (big, live formula), sub (tone mark). Left liseré in the tone. */
function tiles(s: Sheet, list: Tile[]) {
  for (let k = 0; k < list.length; k += 4) {
    const r = [s.row(17), s.row(34), s.row(17)];
    const part = list.slice(k, k + 4);
    const slots: [number, number][] = part.length === 4 ? QUARTERS : part.length === 3 ? [[1, 4], [5, 8], [9, 11]] : part.length === 2 ? [[1, 6], [7, 11]] : [[1, 11]];
    part.forEach((t, j) => {
      const [c1, c2] = slots[j]!;
      const tone = toneColor(t.tone);
      const edge = { left: bd(tone, 'thick'), top: bd(C.line), bottom: bd(C.line), right: bd(C.line) };
      s.span(r[0]!, c1, r[0]!, c2, { v: t.label.toUpperCase(), t: 's', s: { font: F({ sz: 7.5, bold: true, color: { rgb: C.text2 } }), fill: solid(C.panel), alignment: { vertical: 'bottom', horizontal: 'left', indent: 2, wrapText: true }, border: { ...edge, bottom: undefined } } });
      s.span(r[1]!, c1, r[1]!, c2, { ...t.value, s: { font: F({ sz: 19, bold: true, color: { rgb: C.navy } }), fill: solid(C.panel), alignment: { vertical: 'center', horizontal: 'left', indent: 2, shrinkToFit: true }, border: { left: edge.left, right: edge.right } } });
      s.span(r[2]!, c1, r[2]!, c2, { ...t.sub, s: { font: F({ sz: 7.5, italic: true, color: { rgb: toneInk(t.tone) } }), fill: solid(C.panel), alignment: { vertical: 'top', horizontal: 'left', indent: 2, wrapText: true }, border: { ...edge, top: undefined } } });
    });
    s.gap(5);
  }
}
const kpiTile = (k: Kpi, f?: string): Tile => ({
  label: k.code ? `${k.code} · ${k.label}` : k.label,
  value: k.num != null ? { v: k.num, t: 'n', f, z: fmtFor(k) } : { v: k.value, t: 's' },
  sub: { v: `${toneMark(k.tone)} ${k.sub ?? k.method ?? ''}`.trim(), t: 's' },
  tone: k.tone,
});
interface Col {
  head: string;
  c1: number;
  c2?: number;
  align?: 'left' | 'right' | 'center';
  mono?: boolean;
  wrap?: boolean;
}
/** A table over column spans: navy header, zebra rows, wrapped text, row height from the longest cell. */
function table(s: Sheet, cols: Col[], rows: (Cell | string | number)[][], o: { minH?: number } = {}): { hr: number; r0: number } {
  const hr = s.row(26);
  cols.forEach((c) => s.span(hr, c.c1, hr, c.c2 ?? c.c1, { v: c.head, t: 's', s: { font: F({ sz: 8.5, bold: true, color: { rgb: C.white } }), fill: solid(C.navy), alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: box(C.navy) } }));
  const r0 = hr + 1;
  rows.forEach((row, i) => {
    const fill = i % 2 ? C.panel : C.white;
    let h = o.minH ?? 19;
    cols.forEach((c, j) => {
      const raw = row[j];
      const cell: Cell = raw && typeof raw === 'object' ? (raw as Cell) : typeof raw === 'number' ? { v: raw, t: 'n', z: Number.isInteger(raw) ? '#,##0' : '#,##0.0' } : { v: String(raw ?? ''), t: 's' };
      if (cell.t === 's' && !cell.f) h = Math.max(h, estLines(String(cell.v), widthOf(s, c.c1, c.c2 ?? c.c1), 9) * 13 + 6);
      const isNum = cell.t === 'n';
      const base = { font: (c.mono || isNum ? M : F)({ sz: 9 }), fill: solid(fill), alignment: { horizontal: c.align ?? (isNum ? 'right' : 'left'), vertical: 'center', wrapText: c.wrap !== false, indent: isNum ? 0 : 1 }, border: box() };
      const r = hr + 1 + i;
      if (r >= s.aoa.length) s.row(19);
      s.span(r, c.c1, r, c.c2 ?? c.c1, { ...cell, s: { ...base, ...(cell.s ?? {}), font: { ...base.font, ...((cell.s?.font as object) ?? {}) }, alignment: { ...base.alignment, ...((cell.s?.alignment as object) ?? {}) } } });
    });
    s.heights[hr + 1 + i] = Math.min(160, h);
  });
  return { hr, r0 };
}

// ── CALC: the data blocks the charts read (figures of the dossier, live aggregations) ──
class Calc {
  sheet = new Sheet('CALC', 'A6A6A6', [3, 34, 16, 16, 16, 16, 16, 16, 16, 16, 16, 3]);
  constructor() {
    const r = this.sheet.row(24);
    this.sheet.span(r, 1, r, 6, { v: 'CALC — blocs de données des graphiques et du top 10 (ne pas modifier : alimentés par les formules)', t: 's', s: { font: F({ bold: true, color: { rgb: C.white } }), fill: solid(C.navy), alignment: { vertical: 'center', indent: 1 } } });
    this.sheet.gap(6);
  }
  /** A block: title, header (categories + series names), rows (values or live formulas). Returns the chart range. */
  block(title: string, categories: string[], series: { name: string; values: number[]; f?: (i: number) => string; z?: string }[]): { first: number; last: number; catCol: number; cols: number[] } {
    const s = this.sheet;
    const t = s.row(18);
    s.span(t, 1, t, 6, { v: title, t: 's', s: { font: F({ bold: true, color: { rgb: C.navy } }), border: { bottom: bd(C.navy) } } });
    const h = s.row(18);
    s.put(h, 1, { v: 'Catégorie', t: 's', s: { font: F({ bold: true, color: { rgb: C.white } }), fill: solid(C.blue) } });
    series.forEach((se, j) => s.put(h, 2 + j, { v: se.name, t: 's', s: { font: F({ bold: true, color: { rgb: C.white } }), fill: solid(C.blue), alignment: { horizontal: 'center' } } }));
    categories.forEach((cat, i) => {
      const r = s.row(15);
      s.put(r, 1, { v: cat, t: 's', s: { font: F(), border: box() } });
      series.forEach((se, j) => s.put(r, 2 + j, { v: se.values[i] ?? 0, t: 'n', f: se.f?.(i), z: se.z ?? '#,##0.##', s: { font: M(), border: box() } }));
    });
    s.gap(8);
    return { first: h + 2, last: h + 1 + categories.length, catCol: 1, cols: series.map((_, j) => 2 + j) };
  }
}
/** A figure of the dossier → its block in CALC and a native chart placed on the sheet over [c1, c2] for `rows` rows. */
function placeFigure(s: Sheet, calc: Calc, f: Figure, c1: number, c2: number, rows = 16, startRow?: number): void {
  const b = calc.block(f.title, f.categories, f.series.map((se) => ({ name: se.name, values: se.values })));
  // More than 6 categories in columns → their names are cut once rotated: horizontal bars keep every name readable.
  const kind: ChartSpec['kind'] = f.kind === 'col3d' ? (f.categories.length > 6 ? 'hbar3d' : 'bar3d') : f.kind === 'bar3d' ? 'hbar3d' : f.kind === 'pie' || f.kind === 'doughnut' ? 'pie3d' : f.kind === 'line' ? 'line' : f.kind === 'bar' ? 'bar' : 'bar';
  placeChart(s, { kind, title: f.title, sheet: 'CALC', first: b.first, last: b.last, anchorCol: c1, anchorRow: 0, cat: { col: b.catCol, name: 'Catégorie', values: f.categories }, series: f.series.map((se, j) => ({ col: b.cols[j]!, name: se.name, values: se.values })) }, c1, c2, rows, startRow);
}
/** Reserve `rows` rows of 15 pt and anchor the chart over them. */
function placeChart(s: Sheet, spec: ChartSpec, c1: number, c2: number, rows: number, startRow?: number) {
  const r1 = startRow ?? s.aoa.length;
  while (s.aoa.length < r1 + rows) s.row(15);
  s.charts.push({ spec: { ...spec, anchorCol: c1, anchorRow: r1 }, r1, r2: r1 + rows - 1, c1, c2 });
}

// ── Data mode: DONNÉES (Excel table + SEL / CLÉ columns), LISTES, live CALC blocks ──
interface Live {
  n: number;
  total: number;
  divisor: number;
  unit: string;
  sel: string[];
  names: { Name: string; Ref: string }[];
  dimBlocks: { dim: string; cats: string[]; sums: number[]; first: number; last: number; catCol: number; sumCol: number; countCol: number }[];
  top: { first: number; last: number; rows: { ent: string; val: number; dims: string[] }[] };
  sheet: Sheet;
  lists: Sheet;
  selectorCells: string[];
}
const toNum = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const x = Number(v.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
    return Number.isFinite(x) ? x : 0;
  }
  return 0;
};
function buildLive(d: DossierData, calc: Calc, selCellRefs: string[]): Live | null {
  const measure = d.measure && d.columns.includes(d.measure) ? d.measure : d.columns.find((c) => d.rows.slice(0, 200).every((r) => r[c] == null || r[c] === '' || Number.isFinite(toNum(r[c]))) && d.rows.some((r) => toNum(r[c]) !== 0));
  if (!measure || !d.rows.length) return null;
  const MAXR = 30000;
  const rows = d.rows.slice(0, MAXR);
  const cols = d.columns.slice(0, 40);
  const sel = (d.selectors ?? []).filter((c) => cols.includes(c) && c !== measure).slice(0, 4);
  const entity = d.entity && cols.includes(d.entity) ? d.entity : cols.find((c) => c !== measure && !sel.includes(c) && typeof rows[0]?.[c] === 'string');
  // DONNÉES: the rows as an Excel table + SÉLECTION (selectors) + CLÉ_TRI (top 10 key).
  const widths = [1.6, ...cols.map((c) => Math.max(10, Math.min(28, c.length + 4))), 11, 14, 1.6];
  const s = new Sheet('DONNÉES', 'A6A6A6', widths);
  const names: { Name: string; Ref: string }[] = [];
  const q = quote(s.name);
  const r0 = 5; // header row (0-based), filled after header/nav by the caller → we reserve rows now
  void r0;
  const lists = new Sheet('LISTES', 'A6A6A6', [3, 30, 30, 30, 30, 3]);
  const lt = lists.row(22);
  lists.span(lt, 1, lt, 4, { v: 'LISTES — valeurs des sélecteurs du COCKPIT', t: 's', s: { font: F({ bold: true, color: { rgb: C.white } }), fill: solid(C.navy), alignment: { vertical: 'center', indent: 1 } } });
  const lh = lists.row(18);
  const catsBy: string[][] = sel.map((dim, j) => {
    const totals = new Map<string, number>();
    for (const r of rows) totals.set(String(r[dim] ?? '(vide)'), (totals.get(String(r[dim] ?? '(vide)')) ?? 0) + toNum(r[measure]));
    const cats = [...totals.keys()].sort((a, b) => a.localeCompare(b, 'fr')).slice(0, 400);
    lists.put(lh, 1 + j, { v: dim, t: 's', s: { font: F({ bold: true, color: { rgb: C.white } }), fill: solid(C.blue) } });
    return cats;
  });
  const maxLen = Math.max(0, ...catsBy.map((c) => c.length + 1));
  for (let i = 0; i < maxLen; i++) {
    const r = lists.row(15);
    catsBy.forEach((cats, j) => {
      const v = i === 0 ? '(Tous)' : cats[i - 1];
      if (v != null) lists.put(r, 1 + j, { v, t: 's', s: { font: F() } });
    });
  }
  catsBy.forEach((cats, j) => names.push({ Name: `LISTE_${j + 1}`, Ref: `${quote('LISTES')}!$${colName(1 + j)}$${lh + 2}:$${colName(1 + j)}$${lh + 2 + cats.length}` }));
  selCellRefs.slice(0, sel.length).forEach((ref, j) => names.push({ Name: `SEL_${j + 1}`, Ref: ref }));
  // Rows are written by the caller after header + nav (it knows where the table starts).
  const total = rows.reduce((a, r) => a + toNum(r[measure]), 0);
  const divisor = Math.abs(total) >= 1e9 ? 1e9 : Math.abs(total) >= 1e6 ? 1e6 : 1;
  const unit = divisor === 1e9 ? ' Mds' : divisor === 1e6 ? ' M' : '';
  const live: Live = { n: rows.length, total, divisor, unit, sel, names, dimBlocks: [], top: { first: 0, last: 0, rows: [] }, sheet: s, lists, selectorCells: selCellRefs };
  // The other measures of the file (impayés, provisions, garanties…), largest first: the top 10 shows them beside the
  // main one so its row runs the full width of the cockpit (v62 — no empty half).
  const ID = /\bid\b|identifiant|code|num[ée]ro|matricule|compte|account|contrat|r[ée]f|ann[ée]e|year|mois|month|date|rang|rank/i;
  const ORDER = ['arrears', 'provision', 'collateral', 'limit', 'regulatory', 'exposure'];
  const rankOf = (c: string) => {
    const k = columnConcepts(c);
    const i = ORDER.findIndex((o) => k.has(o));
    return i < 0 ? ORDER.length : i;
  };
  const extras = cols
    .filter((c) => c !== measure && c !== entity && !sel.includes(c) && !ID.test(c))
    .map((c) => {
      let n = 0;
      let k = 0;
      let tot = 0;
      for (const r of rows.slice(0, 500)) {
        const v = r[c];
        if (v === null || v === undefined || v === '') continue;
        n++;
        if (typeof v === 'number' || (typeof v === 'string' && /^-?[\d\s\u00a0\u202f.,]+$/.test(v))) k++;
      }
      for (const r of rows) tot += Math.abs(toNum(r[c]));
      return { c, ok: n > 0 && k / n >= 0.9 && tot > 0, tot };
    })
    .filter((x) => x.ok)
    // The business order first (arrears, provisions, collateral, limits…), then the size.
    .sort((a, b) => rankOf(a.c) - rankOf(b.c) || b.tot - a.tot)
    .map((x) => x.c);
  Object.assign(live, { _rows: rows, _cols: cols, _measure: measure, _entity: entity, _q: q, _extras: extras });
  return live;
}
type LiveX = Live & { _rows: Record<string, unknown>[]; _cols: string[]; _measure: string; _entity?: string; _q: string; _extras: string[] };
/** Writes DONNÉES (table + helper columns) from row `start`, defines D_* names, then the live CALC blocks. */
function writeData(live: LiveX, calc: Calc): void {
  const s = live.sheet;
  const cols = live._cols;
  const rows = live._rows;
  const hr = s.aoa.length;
  const head = s.row(26);
  const all = [...cols, 'SÉLECTION', 'CLÉ_TRI'];
  const uniq = new Set<string>();
  const names = all.map((c) => {
    let n = String(c).trim() || 'Colonne';
    while (uniq.has(n.toLowerCase())) n = `${n}_`;
    uniq.add(n.toLowerCase());
    return n;
  });
  names.forEach((n, j) => s.put(head, 1 + j, { v: n, t: 's', s: { font: F({ sz: 8.5, bold: true, color: { rgb: C.white } }), fill: solid(j >= cols.length ? C.text2 : C.navy), alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: box(C.navy) } }));
  const mCol = 1 + cols.indexOf(live._measure);
  const selCol = 1 + cols.length;
  const keyCol = selCol + 1;
  const dimCols = live.sel.map((dim) => 1 + cols.indexOf(dim));
  rows.forEach((row, i) => {
    const r = s.row(15);
    const xr = r + 1;
    cols.forEach((c, j) => {
      const v = row[c];
      const isNum = typeof v === 'number' && Number.isFinite(v);
      s.put(r, 1 + j, isNum ? { v, t: 'n', z: Number.isInteger(v) ? '#,##0' : '#,##0.00', s: { font: M({ sz: 9 }) } } : { v: v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v), t: 's', s: { font: F({ sz: 9 }) } });
    });
    const cond = dimCols.map((dc, j) => `OR(SEL_${j + 1}="(Tous)",${colName(dc)}${xr}=SEL_${j + 1})`);
    s.put(r, selCol, { v: 1, t: 'n', f: cond.length ? `IF(AND(${cond.join(',')}),1,0)` : '1', s: { font: M({ sz: 9, color: { rgb: C.text2 } }), alignment: { horizontal: 'center' } } });
    const m = toNum(row[live._measure]);
    s.put(r, keyCol, { v: m * (1 + 1e-12 * xr) + 1e-9 * xr, t: 'n', f: `IF(${colName(selCol)}${xr}=1,${colName(mCol)}${xr}*(1+1E-12*ROW())+1E-9*ROW(),"")`, z: '#,##0', s: { font: M({ sz: 9, color: { rgb: C.text2 } }) } });
    void i;
  });
  const first = head + 2;
  const lastRow = head + 1 + rows.length;
  const q = live._q;
  const rng = (c: number) => `${q}!$${colName(c)}$${first}:$${colName(c)}$${lastRow}`;
  live.names.push({ Name: 'D_SEL', Ref: rng(selCol) }, { Name: 'D_KEY', Ref: rng(keyCol) }, { Name: 'D_MES', Ref: rng(mCol) });
  if (live._entity) live.names.push({ Name: 'D_ENT', Ref: rng(1 + cols.indexOf(live._entity)) });
  dimCols.forEach((dc, j) => live.names.push({ Name: `D_S${j + 1}`, Ref: rng(dc) }));
  const extraN = Math.max(0, 4 - Math.min(3, live.sel.length));
  live._extras = live._extras.slice(0, extraN);
  live._extras.forEach((c, j) => live.names.push({ Name: `D_N${j + 1}`, Ref: rng(1 + cols.indexOf(c)) }));
  s.table = { r1: head, r2: lastRow - 1, c1: 1, c2: keyCol, names, name: 'T_DONNEES' };
  s.freezeRow = head + 1;
  void hr;
  // Live blocks: the measure by selector dimension (top 12 categories by total), and the top 10.
  live.sel.forEach((dim, j) => {
    const totals = new Map<string, { s: number; n: number }>();
    for (const r of rows) {
      const k = String(r[dim] ?? '(vide)');
      const t = totals.get(k) ?? { s: 0, n: 0 };
      t.s += toNum(r[live._measure]);
      t.n++;
      totals.set(k, t);
    }
    const cats = [...totals.entries()].sort((a, b) => b[1].s - a[1].s).slice(0, 12).map(([k]) => k);
    const esc = (t: string) => t.replace(/"/g, '""');
    const b = calc.block(`${live._measure} par ${dim} (sélection courante)`, cats, [
      { name: `${live._measure}`, values: cats.map((c) => totals.get(c)!.s), f: (i) => `SUMIFS(D_MES,D_S${j + 1},"${esc(cats[i]!)}",D_SEL,1)`, z: '#,##0' },
      { name: 'Lignes', values: cats.map((c) => totals.get(c)!.n), f: (i) => `COUNTIFS(D_S${j + 1},"${esc(cats[i]!)}",D_SEL,1)`, z: '#,##0' },
    ]);
    live.dimBlocks.push({ dim, cats, sums: cats.map((c) => totals.get(c)!.s), first: b.first, last: b.last, catCol: b.catCol, sumCol: b.cols[0]!, countCol: b.cols[1]! });
  });
  // Top 10: k-th largest key among the selected rows → its row → entity, measure, dimensions.
  const keyed = rows.map((r, i) => ({ r, k: toNum(r[live._measure]) * (1 + 1e-12 * (first + i)) + 1e-9 * (first + i) })).sort((a, b) => b.k - a.k).slice(0, 10);
  const cs = calc.sheet;
  const t = cs.row(18);
  cs.span(t, 1, t, 6, { v: 'Top 10 de la sélection (rang → ligne → valeurs)', t: 's', s: { font: F({ bold: true, color: { rgb: C.navy } }), border: { bottom: bd(C.navy) } } });
  const h = cs.row(18);
  ['Entité', live._measure, 'Ligne', ...live.sel.slice(0, 3)].forEach((x, j) => cs.put(h, 1 + j, { v: x, t: 's', s: { font: F({ bold: true, color: { rgb: C.white } }), fill: solid(C.blue) } }));
  live._extras.forEach((x, j) => cs.put(h, 7 + j, { v: x, t: 's', s: { font: F({ bold: true, color: { rgb: C.white } }), fill: solid(C.blue) } }));
  const topRows: (Live['top']['rows'][number] & { extra: number[] })[] = [];
  for (let k = 1; k <= 10; k++) {
    const r = cs.row(15);
    const hit = keyed[k - 1];
    const lineF = `IFERROR(MATCH(LARGE(D_KEY,${k}),D_KEY,0),"")`;
    const lineRef = `$${colName(3)}$${r + 1}`;
    const ent = hit ? String(hit.r[live._entity ?? ''] ?? `Ligne ${k}`) : '';
    const val = hit ? toNum(hit.r[live._measure]) : 0;
    const dims = live.sel.slice(0, 3).map((dm) => (hit ? String(hit.r[dm] ?? '') : ''));
    cs.put(r, 1, { v: ent, t: 's', f: live._entity ? `IF(${lineRef}="","",INDEX(D_ENT,${lineRef}))` : `IF(${lineRef}="","","Ligne "&${lineRef})`, s: { font: F(), border: box() } });
    cs.put(r, 2, { v: val, t: 'n', f: `IF(${lineRef}="","",INDEX(D_MES,${lineRef}))`, z: '#,##0', s: { font: M(), border: box() } });
    cs.put(r, 3, { v: hit ? rows.indexOf(hit.r) + 1 : 0, t: 'n', f: lineF, s: { font: M(), border: box() } });
    dims.forEach((dv, j) => cs.put(r, 4 + j, { v: dv, t: 's', f: `IF(${lineRef}="","",INDEX(D_S${j + 1},${lineRef}))`, s: { font: F(), border: box() } }));
    const extra = live._extras.map((c) => (hit ? toNum(hit.r[c]) : 0));
    extra.forEach((xv, j) => cs.put(r, 7 + j, { v: xv, t: 'n', f: `IF(${lineRef}="","",INDEX(D_N${j + 1},${lineRef}))`, z: '#,##0', s: { font: M(), border: box() } }));
    topRows.push({ ent, val, dims, extra });
  }
  cs.gap(8);
  live.top = { first: h + 2, last: h + 11, rows: topRows };
  (live as LiveX & { _topExtra?: number[][] })._topExtra = topRows.map((t) => t.extra);
}

// ── The workbook ──────────────────────────────────────────────────────────────
export function dossierXlsx(d: Dossier, o: XlsxOptions = {}): Uint8Array {
  const X = activeDesign().xlsx;
  const sub = `${[d.org, d.unit].filter(Boolean).join(' · ')}${d.subtitle ? ` — ${d.subtitle}` : ''}`;
  const calc = new Calc();
  const KPI = 'DATA_KPI';
  const kpiRef = (i: number) => `${quote(KPI)}!$D$${i + 3}`;
  const recos = allRecos(d);

  // Views and their short button labels (the reference: CAPS, a word or two).
  // A button says one whole word or two (never a cut word): the subject of the title, not its generic head
  // (« Utilisation des limites » → LIMITES, « Lecture de l'analyste » → ANALYSTE).
  const STOP = /^(de|des|du|la|le|les|l|et|d|en|à|a|par|sur|au|aux|pour|un|une)$/i;
  const GENERIC = /^(utilisation|lecture|analyse|part|niveau|suivi|revue|taux|évolution|evolution|synthèse|synthese|point|état|etat)$/i;
  const short = (t: string) => {
    const words = t.replace(/^[\d.\s·-]+/, '').split(/[—:,(]/)[0]!.split(/[\s'’]+/).filter((w) => w && !STOP.test(w));
    let pick = words.length > 1 && GENERIC.test(words[0]!) ? words[words.length - 1]! : words[0] ?? t;
    if (pick.length <= 7 && words[1] && words[1] !== pick && `${pick} ${words[1]}`.length <= 14) pick = `${pick} ${words[1]}`;
    const up = pick.toUpperCase();
    return up.length > 14 ? `${up.slice(0, 13)}.` : up;
  };
  const views: { name: string; label: string }[] = [{ name: '⌂ COCKPIT', label: 'COCKPIT' }];
  const chapterNames = d.chapters.map((c) => safeName(`${c.n}. ${c.title}`.toUpperCase()));
  const used = new Set<string>();
  d.chapters.forEach((c, i) => {
    let lb = short(c.title);
    if (used.has(lb)) lb = `${lb.slice(0, 11)} ${c.n}`;
    used.add(lb);
    views.push({ name: chapterNames[i]!, label: lb });
  });
  if (recos.length) views.push({ name: "PLAN D'ACTIONS", label: 'PLAN D’ACTIONS' });
  if (d.decisions.length) views.push({ name: 'DÉCISIONS', label: 'DÉCISIONS' });
  if (d.hypotheses.length) views.push({ name: 'HYPOTHÈSES', label: 'HYPOTHÈSES' });
  views.push({ name: 'PARAMÈTRES', label: 'PARAMÈTRES' });
  if (d.dataQuality?.items.length) views.push({ name: 'QUALITÉ DONNÉES', label: 'QUALITÉ' });
  if (d.sources.length) views.push({ name: 'SOURCES', label: 'SOURCES' });
  if (d.glossary.length) views.push({ name: 'GLOSSAIRE', label: 'GLOSSAIRE' });
  const data = o.data && o.data.rows.length ? o.data : null;
  if (data) views.push({ name: 'DONNÉES', label: 'DONNÉES' });

  // The cockpit's selector cells are at fixed places (row 13 of the section « 01 · SÉLECTEURS »): computed below.
  const ck = new Sheet('⌂ COCKPIT', X.tabColor.summary);
  const lead = d.kpis.find((k) => k.tone === 'risk') ?? d.kpis[0];
  const ctx: Ctx = { d, views, logo: o.logo ?? null, alert: { v: lead ? `⚠ ${lead.value} · ${lead.label}`.slice(0, 60) : `⚠ ${d.kpis.length} indicateurs`, t: 's' } };

  // Header + nav first (row positions are needed for the selector cells).
  let live: LiveX | null = null;
  header(ck, ctx, d.title, sub);
  nav(ck, ctx);
  if (data) {
    const dims = (data.selectors ?? []).filter((c) => data.columns.includes(c) && c !== data.measure).slice(0, 4);
    // No category to select → no « Sélecteurs » band at all (an empty band is a hole in the design).
    if (dims.length) section(ck, 'Sélecteurs — pilotent les indicateurs, les graphiques et le top 10');
    const lr = dims.length ? ck.row(15) : 0;
    const vr = dims.length ? ck.row(22) : 0;
    const refs = dims.map((_, j) => `${quote(ck.name)}!$${colName(QUARTERS[j]![0])}$${vr + 1}`);
    live = buildLive({ ...data, selectors: dims }, calc, refs) as LiveX | null;
    (live?.sel ?? []).forEach((dim, j) => {
      const [c1, c2] = QUARTERS[j]!;
      ck.span(lr, c1, lr, c2, { v: `▾ ${dim}`.toUpperCase(), t: 's', s: { font: F({ sz: 7.5, bold: true, color: { rgb: C.text2 } }), alignment: { vertical: 'bottom' } } });
      ck.span(vr, c1, vr, c2, { v: '(Tous)', t: 's', s: { font: F({ sz: 10, bold: true, color: { rgb: C.navy } }), fill: solid(C.white), alignment: { vertical: 'center', indent: 1 }, border: { left: bd(C.gold, 'thick'), top: bd(C.line), bottom: bd(C.line), right: bd(C.line) } } });
      ck.validations.push({ ref: `${colName(c1)}${vr + 1}`, formula: `LISTE_${j + 1}` });
    });
    if (dims.length) ck.gap(8);
  }
  // DONNÉES + live CALC blocks (needs the sheet's header first).
  if (live) {
    header(live.sheet, ctx, `Données — ${live.n.toLocaleString('fr-FR')} lignes`, `${data!.source ?? d.dataSource ?? ''} · colonnes SÉLECTION et CLÉ_TRI calculées par les sélecteurs du cockpit`);
    nav(live.sheet, ctx);
    writeData(live, calc);
    const tot = `SUMIFS(D_MES,D_SEL,1)`;
    ctx.alert = { v: `⚠ ${live.n.toLocaleString('fr-FR')} lignes · ${(live.total / live.divisor).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}${live.unit}`, t: 's', f: `"⚠ "&SUM(D_SEL)&" lignes · "&FIXED(${tot}/${live.divisor},1)&"${live.unit}"` };
    // The cockpit's alert pill becomes live (it was written by header() with the static text).
    const pill = ck.aoa[1]![ck.last - 1]!;
    ck.aoa[1]![ck.last - 1] = { ...ctx.alert, s: pill.s };
  }

  // 02 · Indicators: live tiles in data mode, else the dossier's indicators (DATA_KPI).
  if (live) {
    section(ck, 'Indicateurs clés (formules vivantes)');
    const tot = 'SUMIFS(D_MES,D_SEL,1)';
    const fx = (expr: string) => `FIXED(${expr},1)`;
    const lt: Tile[] = [
      { label: 'Lignes sélectionnées', value: { v: live.n, t: 'n', f: 'SUM(D_SEL)', z: '#,##0' }, sub: { v: `sur ${live.n} lignes du fichier`, t: 's', f: `"sur "&ROWS(D_SEL)&" lignes du fichier"` }, tone: 'neutral' },
      { label: `${data!.measureLabel ?? live._measure} — sélection`, value: { v: live.total, t: 'n', f: tot, z: MDS_FMT }, sub: { v: '▲ 100,0 % du total du fichier', t: 's', f: `"▲ "&${fx(`100*${tot}/SUM(D_MES)`)}&" % du total du fichier"` }, tone: 'info' },
      { label: 'Moyenne par ligne', value: { v: live.total / Math.max(1, live.n), t: 'n', f: `IFERROR(AVERAGEIFS(D_MES,D_SEL,1),0)`, z: MDS_FMT }, sub: { v: '● sur les lignes sélectionnées', t: 's' }, tone: 'neutral' },
      { label: 'Part du top 10', value: { v: live.top.rows.reduce((a, r) => a + r.val, 0) / (live.total || 1), t: 'n', f: `IFERROR(SUM(${quote('CALC')}!$C$${live.top.first}:$C$${live.top.last})/${tot},0)`, z: '0.0%' }, sub: { v: '◆ concentration de la sélection', t: 's' }, tone: 'warn' },
    ];
    live.dimBlocks.slice(0, 4).forEach((b) => {
      const cat = `${quote('CALC')}!$B$${b.first}:$B$${b.last}`;
      const sums = `${quote('CALC')}!$C$${b.first}:$C$${b.last}`;
      const topI = b.sums.indexOf(Math.max(...b.sums));
      lt.push({ label: `${b.dim} en tête`, value: { v: b.cats[topI] ?? '', t: 's', f: `IFERROR(INDEX(${cat},MATCH(MAX(${sums}),${sums},0)),"")` }, sub: { v: `▲ ${((100 * (b.sums[topI] ?? 0)) / (live!.total || 1)).toFixed(1).replace('.', ',')} % de la sélection`, t: 's', f: `"▲ "&FIXED(IFERROR(100*MAX(${sums})/${tot},0),1)&" % de la sélection"` }, tone: 'warn' });
    });
    tiles(ck, lt.slice(0, 8));
  } else {
    section(ck, 'Indicateurs clés');
    tiles(ck, d.kpis.slice(0, 8).map((k, i) => kpiTile(k, k.num != null ? kpiRef(i) : undefined)));
  }
  // 03 · Thesis.
  section(ck, 'La thèse — en une phrase pour le comité');
  para(ck, d.thesis, { italic: true, fill: C.ice, accent: C.gold, sz: 10 });
  ck.gap(6);
  // 04 · The committee indicators (same as the deck and the report).
  if (d.kpis.length) {
    section(ck, `Les ${d.kpis.length} indicateurs du comité — identiques dans le deck et le rapport`);
    table(
      ck,
      [{ head: 'Code', c1: 1, c2: 2, align: 'center' }, { head: 'Indicateur', c1: 3, c2: 7 }, { head: 'Valeur', c1: 8, align: 'right' }, { head: 'Définition / méthode', c1: 9, c2: 10 }, { head: 'Lecture', c1: 11 }],
      d.kpis.map((k, i) => [
        { v: k.code, t: 's', s: { font: M({ bold: true, color: { rgb: C.blue } }) } },
        k.label,
        k.num != null ? { v: k.num, t: 'n', f: kpiRef(i), z: fmtFor(k), s: { font: M({ bold: true, color: { rgb: C.navy } }) } } : { v: k.value, t: 's', s: { font: M({ bold: true, color: { rgb: C.navy } }), alignment: { horizontal: 'right' } } },
        { v: k.method ?? '', t: 's', s: { font: F({ italic: true, color: { rgb: C.text2 } }) } },
        { v: k.sub ?? '', t: 's', s: { font: F({ sz: 8.5, color: { rgb: toneInk(k.tone) } }) } },
      ]),
    );
    ck.gap(8);
  }
  // 05 · Scorecard of the chapters (data bar on the key figure, colour scale on the P1 count, an « Ouvrir » button).
  if (d.chapters.length) {
    section(ck, `Scorecard des ${d.chapters.length} chapitres`);
    const keyOf = (c: Chapter): Kpi | null => c.kpis?.find((k) => k.num != null) ?? null;
    const { r0 } = table(
      ck,
      [{ head: 'N°', c1: 1, align: 'center' }, { head: 'Chapitre', c1: 2, c2: 3 }, { head: 'Chiffre clé', c1: 4, c2: 5, align: 'right' }, { head: 'Constats', c1: 6, align: 'center' }, { head: 'Recos', c1: 7, align: 'center' }, { head: 'P1', c1: 8, align: 'center' }, { head: 'Lecture', c1: 9, c2: 10 }, { head: 'Vue', c1: 11, align: 'center' }],
      d.chapters.map((c) => {
        const k = keyOf(c);
        return [
          { v: c.n, t: 'n', s: { font: M({ bold: true }), alignment: { horizontal: 'center' } } },
          { v: c.title, t: 's', s: { font: F({ bold: true, color: { rgb: C.navy } }) } },
          k ? { v: k.num, t: 'n', z: fmtFor(k), s: { font: M({ bold: true, color: { rgb: k.tone === 'risk' ? C.risk : C.navy } }) } } : { v: '—', t: 's', s: { font: M({ color: { rgb: C.text2 } }), alignment: { horizontal: 'right' } } },
          { v: c.constats.length, t: 'n', s: { alignment: { horizontal: 'center' } } },
          { v: c.recommandations.length, t: 'n', s: { alignment: { horizontal: 'center' } } },
          { v: c.recommandations.filter((r) => r.priority === 'P1').length, t: 'n', s: { alignment: { horizontal: 'center' } } },
          { v: c.lecture ?? c.headline ?? '', t: 's', s: { font: F({ sz: 8.5, italic: true, color: { rgb: C.text2 } }) } },
          '',
        ];
      }),
      { minH: 24 },
    );
    const n = d.chapters.length;
    ck.cfs.push(colorScale(`${colName(8)}${r0 + 1}:${colName(8)}${r0 + n}`, C.white, mix(C.risk, 0.7)));
    d.chapters.forEach((_, i) => ck.shapes.push({ kind: 'button', r: r0 + i, x: ck.colX(11) + ptEmu(6), w: colEmu(ck.cols[11]!) - ptEmu(12), inset: ptEmu(3), label: 'OUVRIR', glyph: '›', target: chapterNames[i]!, small: true }));
    if (d.chapters[0]?.lecture || d.messages[0]) lecture(ck, d.messages[0] ?? d.chapters[0]!.lecture!);
    ck.gap(8);
  }
  // 06 · Visuals 2 × 2 with their « Lecture — ».
  {
    const visuals: { place: (c1: number, c2: number, r: number) => void; lect: Cell }[] = [];
    if (live) {
      live.dimBlocks.slice(0, 2).forEach((b, j) => {
        const kind: ChartSpec['kind'] = j === 1 && b.cats.length <= 8 ? 'pie3d' : 'hbar3d';
        const cat = `${quote('CALC')}!$B$${b.first}:$B$${b.last}`;
        const sums = `${quote('CALC')}!$C$${b.first}:$C$${b.last}`;
        const topI = b.sums.indexOf(Math.max(...b.sums));
        visuals.push({
          place: (c1, c2, r) => placeChart(ck, { kind, title: `${live!._measure} par ${b.dim} (sélection)`, sheet: 'CALC', first: b.first, last: b.last, anchorCol: c1, anchorRow: r, cat: { col: b.catCol, name: b.dim, values: b.cats }, series: [{ col: b.sumCol, name: live!._measure, values: b.sums }] }, c1, c2, 16, r),
          lect: { v: `Lecture — ${b.cats[topI]} porte la plus grande part de ${live!._measure.toLowerCase()} (${((100 * (b.sums[topI] ?? 0)) / (live!.total || 1)).toFixed(1).replace('.', ',')} % de la sélection).`, t: 's', f: `"Lecture — "&IFERROR(INDEX(${cat},MATCH(MAX(${sums}),${sums},0)),"")&" porte la plus grande part ("&FIXED(IFERROR(100*MAX(${sums})/SUMIFS(D_MES,D_SEL,1),0),1)&" % de la sélection)."` },
        });
      });
      visuals.push({
        place: (c1, c2, r) => placeChart(ck, { kind: 'hbar3d', title: 'Top 10 de la sélection', sheet: 'CALC', first: live!.top.first, last: live!.top.last, anchorCol: c1, anchorRow: r, cat: { col: 1, name: 'Entité', values: live!.top.rows.map((t) => t.ent) }, series: [{ col: 2, name: live!._measure, values: live!.top.rows.map((t) => t.val) }] }, c1, c2, 16, r),
        lect: { v: 'Lecture — classement dynamique : il suit les sélecteurs du cockpit.', t: 's' },
      });
    }
    const topNames = live ? live.top.rows.slice(0, 5).map((t) => t.ent.slice(0, 22)) : [];
    const repeatsTop = (f: Figure) => topNames.length > 0 && f.series.length === 1 && f.categories.slice(0, 5).every((c, i) => c.slice(0, 22) === topNames[i]);
    for (const f of d.chapters.flatMap((c) => c.figures.slice(0, 2)).filter((f) => !repeatsTop(f))) {
      if (visuals.length >= 4) break;
      visuals.push({ place: (c1, c2, r) => placeFigure(ck, calc, f, c1, c2, 16, r), lect: { v: `Lecture — ${(f.lecture ?? f.title).replace(/^Lecture — /, '')}`, t: 's' } });
    }
    if (visuals.length) {
      section(ck, 'Visuels de synthèse');
      for (let k = 0; k < visuals.length; k += 2) {
        const r = ck.aoa.length;
        // An odd last visual takes the full width (no empty half).
        const halves: [number, number][] = visuals.slice(k, k + 2).length === 1 ? [[1, 11]] : HALVES;
        visuals.slice(k, k + 2).forEach((v, j) => v.place(halves[j]![0], halves[j]![1], r));
        const lr = ck.row(40);
        visuals.slice(k, k + 2).forEach((v, j) => ck.span(lr, halves[j]![0], lr, halves[j]![1], { ...v.lect, s: { font: F({ sz: 8.5, italic: true, color: { rgb: C.text2 } }), fill: solid(C.ice), alignment: { wrapText: true, vertical: 'center', indent: 1 }, border: { left: bd(C.gold, 'thick') } } }));
        ck.gap(8);
      }
    }
  }
  // 07 · Top 10 (data mode).
  if (live) {
    section(ck, 'Top 10 — tri dynamique (suit les sélecteurs)');
    const q = quote('CALC');
    const { r0 } = table(
      ck,
      [
        { head: 'Rang', c1: 1, align: 'center' },
        { head: live._entity ?? 'Entité', c1: 2, c2: 3 },
        { head: live._measure, c1: 4, c2: 5, align: 'right' },
        { head: '% sélection', c1: 6, align: 'right' },
        { head: '% cumulé', c1: 7, align: 'right' },
        ...live.sel.slice(0, 3).map((dm, j) => ({ head: dm, c1: 8 + j })),
        ...live._extras.map((x, j) => ({ head: x, c1: 8 + Math.min(3, live!.sel.length) + j, align: 'right' as const })),
      ],
      live.top.rows.map((t, i) => {
        const r = live!.top.first + i;
        const cum = live!.top.rows.slice(0, i + 1).reduce((a, x) => a + x.val, 0);
        const ex = (live as LiveX & { _topExtra?: number[][] })._topExtra?.[i] ?? [];
        return [
          { v: i + 1, t: 'n', s: { font: M({ bold: true }), alignment: { horizontal: 'center' } } },
          { v: t.ent, t: 's', f: `${q}!$B$${r}`, s: { font: F({ bold: true, color: { rgb: C.navy } }) } },
          { v: t.val, t: 'n', f: `${q}!$C$${r}`, z: MDS_FMT },
          { v: t.val / (live!.total || 1), t: 'n', f: `IFERROR(${q}!$C$${r}/SUMIFS(D_MES,D_SEL,1),"")`, z: '0.0%' },
          { v: cum / (live!.total || 1), t: 'n', f: `IFERROR(SUM(${q}!$C$${live!.top.first}:$C$${r})/SUMIFS(D_MES,D_SEL,1),"")`, z: '0.0%', s: { font: M({ color: { rgb: C.text2 } }) } },
          ...t.dims.map((dv, j) => ({ v: dv, t: 's' as const, f: `${q}!$${colName(4 + j)}$${r}` })),
          ...live!._extras.map((_, j) => ({ v: ex[j] ?? 0, t: 'n' as const, f: `${q}!$${colName(7 + j)}$${r}`, z: MDS_FMT })),
        ];
      }),
      { minH: 20 },
    );
    ck.cfs.push(dataBar(`${colName(4)}${r0 + 1}:${colName(4)}${r0 + 10}`, C.blue));
    ck.gap(8);
  }
  // 08 · Written analysis: key messages and the decisions to vote.
  if (d.messages.length || d.decisions.length) {
    section(ck, 'Analyse rédigée — messages clés et décisions à voter');
    if (d.messages.length) {
      label(ck, `${d.messages.length} messages clés`);
      d.messages.forEach((m, i) => {
        const r = para(ck, m, { c1: 3, fill: i % 2 ? C.panel : C.white });
        ck.span(r, 1, r, 2, { v: String(i + 1).padStart(2, '0'), t: 's', s: { font: M({ sz: 11, bold: true, color: { rgb: C.gold } }), fill: solid(C.navy), alignment: { horizontal: 'center', vertical: 'center' } } });
      });
      ck.gap(8);
    }
    if (d.decisions.length) {
      label(ck, 'Décisions soumises au vote du comité', C.navy);
      d.decisions.forEach((x, i) => {
        const r = para(ck, x.text, { c1: 3, c2: 10, bold: true, color: C.navy, fill: i % 2 ? mix(C.gold, 0.88) : mix(C.gold, 0.8) });
        ck.span(r, 1, r, 2, { v: x.code, t: 's', s: { font: M({ sz: 11, bold: true, color: { rgb: C.gold } }), fill: solid(C.navy), alignment: { horizontal: 'center', vertical: 'center' } } });
        ck.put(r, 11, { v: '☐ Pour   ☐ Contre', t: 's', s: { font: F({ sz: 9, bold: true, color: { rgb: C.navy } }), fill: solid(C.white), alignment: { horizontal: 'center', vertical: 'center' }, border: box(mix(C.gold, 0.2)) } });
      });
      ck.gap(8);
    }
  }
  const research = d.method?.research?.length ? d.method.research : d.sources.slice(0, 3).map((x) => `${x.lesson} [${x.id}]`);
  if (research.length) {
    const r = ck.row(22);
    ck.span(r, FIRST, r, ck.last, { v: '⚖  Ce que dit la recherche', t: 's', s: { font: F({ bold: true, color: { rgb: C.navy } }), fill: solid(C.ice), alignment: { vertical: 'center', indent: 1 }, border: { left: bd(C.gold, 'thick') } } });
    research.slice(0, 4).forEach((t) => para(ck, `▸ ${t}`, { fill: C.ice, sz: 9, accent: C.gold }));
  }
  const sheets: Sheet[] = [ck];

  // ── One view per chapter ──
  d.chapters.forEach((ch, i) => {
    const s = new Sheet(chapterNames[i]!, X.tabColor.detail);
    header(s, ctx, `${ch.n}. ${ch.title}${ch.headline ? ` — ${ch.headline}` : ''}`, `${ch.kicker ?? `CHAPITRE ${ch.n}`} · ${sub}`);
    nav(s, ctx);
    if (ch.kpis?.length || ch.constats.length) {
      section(s, 'Le constat chiffré');
      if (ch.kpis?.length) tiles(s, ch.kpis.slice(0, 4).map((k) => kpiTile({ ...k, code: '' })));
      bullets(s, ch.constats, '▪');
      s.gap(6);
    }
    if (ch.figures.length) {
      section(s, 'Visuels');
      for (let k = 0; k < ch.figures.length; k += 2) {
        const r = s.aoa.length;
        // A single (or odd last) figure takes the full width: no empty half beside it.
        const halves: [number, number][] = ch.figures.slice(k, k + 2).length === 1 ? [[1, 11]] : HALVES;
        ch.figures.slice(k, k + 2).forEach((f, j) => placeFigure(s, calc, f, halves[j]![0], halves[j]![1], 16, r));
        const lr = s.row(40);
        ch.figures.slice(k, k + 2).forEach((f, j) => s.span(lr, halves[j]![0], lr, halves[j]![1], { v: `Figure ${k + j + 1} — ${f.title}.${f.lecture ? ` Lecture — ${f.lecture.replace(/^Lecture — /, '')}` : ''}`, t: 's', s: { font: F({ sz: 8.5, italic: true, color: { rgb: C.text2 } }), fill: solid(C.ice), alignment: { wrapText: true, vertical: 'center', indent: 1 }, border: { left: bd(C.gold, 'thick') } } }));
        s.gap(8);
      }
    }
    if (ch.analyse.length) {
      section(s, 'Analyse');
      ch.analyse.forEach((t) => para(s, t));
      s.gap(6);
    }
    if (ch.cadre.length) {
      section(s, 'Ce que disent la réglementation et la recherche');
      bullets(s, ch.cadre);
      s.gap(6);
    }
    if (ch.cas.length) {
      section(s, 'Cas emblématiques');
      bullets(s, ch.cas, '◆');
      s.gap(6);
    }
    for (const t of ch.tables) {
      section(s, t.title ?? 'Tableau');
      const n = Math.min(t.head.length, 11);
      const spans: Col[] = [];
      let c = FIRST;
      const per = Math.max(1, Math.floor(11 / n));
      for (let j = 0; j < n; j++) {
        const c2 = j === n - 1 ? s.last : Math.min(s.last, c + per - 1);
        spans.push({ head: t.head[j]!, c1: c, c2 });
        c = c2 + 1;
      }
      table(s, spans, t.rows.map((r) => r.slice(0, n)));
      if (t.lecture) lecture(s, t.lecture);
      s.gap(6);
    }
    if (ch.recommandations.length) {
      section(s, 'Recommandations');
      recoTable(s, ch.recommandations);
      s.gap(6);
    }
    if (ch.lecture) lecture(s, ch.lecture);
    sheets.push(s);
  });

  // ── Action plan: status (dropdown, colours) and a live progress ──
  if (recos.length) {
    const s = new Sheet("PLAN D'ACTIONS", X.tabColor.plan);
    header(s, ctx, `Plan d’actions — ${recos.length} recommandations, ${recos.filter((r) => r.priority === 'P1').length} P1`, sub);
    nav(s, ctx);
    section(s, 'Avancement (formules vivantes sur la colonne Statut)');
    const tr = s.aoa.length;
    tiles(s, [
      { label: 'Recommandations', value: { v: recos.length, t: 'n', z: '#,##0' }, sub: { v: `● ${recos.filter((r) => r.priority === 'P1').length} en priorité P1`, t: 's' }, tone: 'info' },
      { label: 'Faites', value: { v: 0, t: 'n', z: '0%' }, sub: { v: '▼ part des recommandations « Fait »', t: 's' }, tone: 'ok' },
      { label: 'En cours', value: { v: 0, t: 'n', z: '#,##0' }, sub: { v: '◆ statut « En cours »', t: 's' }, tone: 'warn' },
      { label: 'À faire', value: { v: recos.length, t: 'n', z: '#,##0' }, sub: { v: '▲ statut « À faire » ou vide', t: 's' }, tone: 'risk' },
    ]);
    section(s, 'Plan d’actions');
    const { r0 } = recoTable(s, recos, true);
    const st = `$L$${r0 + 1}:$L$${r0 + recos.length}`;
    s.aoa[tr + 1]![QUARTERS[1]![0]]!.f = `IFERROR(COUNTIF(${st},"Fait")/${recos.length},0)`;
    s.aoa[tr + 1]![QUARTERS[2]![0]]!.f = `COUNTIF(${st},"En cours")`;
    s.aoa[tr + 1]![QUARTERS[3]![0]]!.f = `${recos.length}-COUNTIF(${st},"Fait")-COUNTIF(${st},"En cours")-COUNTIF(${st},"Abandonné")`;
    s.validations.push({ ref: `L${r0 + 1}:L${r0 + recos.length}`, formula: '"À faire,En cours,Fait,Abandonné"' });
    s.cfs.push(statusRules(`L${r0 + 1}:L${r0 + recos.length}`, `$L${r0 + 1}`));
    sheets.push(s);
  }
  if (d.decisions.length) {
    const s = new Sheet('DÉCISIONS', X.tabColor.plan);
    header(s, ctx, `${d.decisions.length} décisions soumises au vote du comité`, sub);
    nav(s, ctx);
    section(s, 'Décisions et vote');
    const { r0 } = table(
      s,
      [{ head: 'Code', c1: 1, align: 'center' }, { head: 'Décision', c1: 2, c2: 8 }, { head: 'Vote', c1: 9, align: 'center' }, { head: 'Commentaire', c1: 10, c2: 11 }],
      d.decisions.map((x) => [{ v: x.code, t: 's', s: { font: M({ bold: true, color: { rgb: C.white } }), fill: solid(C.risk), alignment: { horizontal: 'center' } } }, { v: x.text, t: 's', s: { font: F({ bold: true, color: { rgb: C.navy } }) } }, { v: '', t: 's', s: { fill: solid(C.input) } }, { v: '', t: 's', s: { fill: solid(C.input) } }]),
      { minH: 26 },
    );
    s.validations.push({ ref: `J${r0 + 1}:J${r0 + d.decisions.length}`, formula: '"Adoptée,Rejetée,Reportée"' });
    s.cfs.push(voteRules(`J${r0 + 1}:J${r0 + d.decisions.length}`, `$J${r0 + 1}`));
    sheets.push(s);
  }
  if (d.hypotheses.length) {
    const s = new Sheet('HYPOTHÈSES', X.tabColor.consolidation);
    header(s, ctx, 'Registre des hypothèses — numérotées, motivées, reliées aux paramètres', sub);
    nav(s, ctx);
    section(s, `${d.hypotheses.length} hypothèses`);
    table(s, [{ head: 'Code', c1: 1, align: 'center' }, { head: 'Hypothèse', c1: 2, c2: 3 }, { head: 'Motivation', c1: 4, c2: 10 }, { head: 'Paramètre', c1: 11 }], d.hypotheses.map((h) => [{ v: h.code, t: 's', s: { font: M({ bold: true, color: { rgb: C.white } }), fill: solid(C.navy), alignment: { horizontal: 'center' } } }, { v: h.title, t: 's', s: { font: F({ bold: true, color: { rgb: C.navy } }) } }, h.text, h.param ?? '']));
    sheets.push(s);
  }
  // PARAMÈTRES: named cells (the reference's ARRETE, seuils…): the date, and every parameter of the hypotheses.
  const names: { Name: string; Ref: string }[] = [];
  {
    const s = new Sheet('PARAMÈTRES', X.tabColor.data);
    header(s, ctx, 'Paramètres — cellules nommées, à ajuster puis recalcul', sub);
    nav(s, ctx);
    section(s, 'Paramètres du dossier');
    const params: { name: string; label: string; value: string; note: string }[] = [
      { name: 'ARRETE', label: 'Date d’arrêté', value: d.asOf ?? d.date, note: 'date de référence des chiffres' },
      { name: 'EDITION', label: 'Date d’édition', value: d.date, note: 'date de génération du classeur' },
      ...d.hypotheses.filter((h) => h.param).map((h) => ({ name: `P_${h.param!.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1').slice(0, 40).toUpperCase()}`, label: `${h.code} — ${h.title}`, value: '', note: 'saisir la valeur retenue (hypothèse ' + h.code + ')' })),
    ];
    const { r0 } = table(s, [{ head: 'Nom', c1: 1, c2: 2, mono: true }, { head: 'Paramètre', c1: 3, c2: 7 }, { head: 'Valeur', c1: 8, align: 'center' }, { head: 'Note', c1: 9, c2: 11 }], params.map((p) => [{ v: p.name, t: 's', s: { font: M({ bold: true, color: { rgb: C.blue } }) } }, p.label, { v: p.value, t: 's', s: { fill: solid(C.input), font: M({ bold: true, color: { rgb: C.navy } }), alignment: { horizontal: 'center' } } }, { v: p.note, t: 's', s: { font: F({ italic: true, color: { rgb: C.text2 } }) } }]));
    const seen = new Set<string>();
    params.forEach((p, i) => {
      if (seen.has(p.name)) return;
      seen.add(p.name);
      names.push({ Name: p.name, Ref: `${quote(s.name)}!$I$${r0 + 1 + i}` });
    });
    sheets.push(s);
  }
  if (d.dataQuality?.items.length) {
    const s = new Sheet('QUALITÉ DONNÉES', X.tabColor.consolidation);
    const dq = d.dataQuality;
    header(s, ctx, `Qualité des données${dq.score != null ? ` — indice global ${dq.score}/100` : ''}`, sub);
    nav(s, ctx);
    section(s, 'Indice de qualité par source');
    if (dq.score != null) tiles(s, [{ label: 'Indice global', value: { v: dq.score / 100, t: 'n', z: '0%' }, sub: { v: `● ${dq.items.length} sources contrôlées`, t: 's' }, tone: dq.score >= 80 ? 'ok' : dq.score >= 60 ? 'warn' : 'risk' }]);
    const items = dq.items;
    const { r0 } = table(s, [{ head: 'Source', c1: 1, c2: 3 }, { head: 'Indice /100', c1: 4, c2: 5, align: 'right' }, { head: 'Constat', c1: 6, c2: 11 }], items.map((it) => [{ v: it.item, t: 's', s: { font: F({ bold: true, color: { rgb: C.navy } }) } }, it.score ?? 0, it.note]));
    s.cfs.push(dataBar(`E${r0 + 1}:E${r0 + items.length}`, C.green));
    s.gap(8);
    placeFigure(s, calc, { kind: 'col3d', title: 'Indice de qualité par source (/100)', categories: items.map((it) => it.item), series: [{ name: 'Indice', values: items.map((it) => it.score ?? 0) }] }, 1, 8, 16);
    sheets.push(s);
  }
  if (d.sources.length) {
    const s = new Sheet('SOURCES', C.text2);
    header(s, ctx, `${d.sources.length} sources — bibliographie datée, enseignement et application`, sub);
    nav(s, ctx);
    section(s, 'Sources par axe');
    table(
      s,
      [{ head: 'Id', c1: 1, align: 'center' }, { head: 'Source', c1: 2, c2: 3 }, { head: 'Auteur · date', c1: 4, c2: 6 }, { head: 'Ce que la source enseigne', c1: 7, c2: 9 }, { head: 'Application à nos données', c1: 10 }, { head: 'Lien', c1: 11 }],
      d.sources.map((x) => [{ v: x.id, t: 's', s: { font: M({ bold: true, color: { rgb: C.blue } }) } }, { v: x.title, t: 's', s: { font: F({ bold: true, color: { rgb: C.navy } }) } }, [x.author, x.date].filter(Boolean).join(' · '), x.lesson, x.application ?? '', x.url ? { v: 'ouvrir ↗', t: 's', l: { Target: x.url, Tooltip: x.url }, s: { font: F({ underline: true, color: { rgb: C.blue } }) } } : '']),
    );
    sheets.push(s);
  }
  if (d.glossary.length) {
    const s = new Sheet('GLOSSAIRE', C.text2);
    header(s, ctx, 'Glossaire', sub);
    nav(s, ctx);
    section(s, `${d.glossary.length} termes`);
    table(s, [{ head: 'Terme', c1: 1, c2: 3 }, { head: 'Définition', c1: 4, c2: 11 }], d.glossary.map((g) => [{ v: g.term, t: 's', s: { font: F({ bold: true, color: { rgb: C.navy } }) } }, g.def]));
    sheets.push(s);
  }
  // DATA_KPI: the indicators every tile reads (one value, read everywhere).
  {
    const s = new Sheet(KPI, 'A6A6A6', [3, 8, 44, 18, 22, 70, 3]);
    const t = s.row(24);
    s.span(t, 1, t, 5, { v: 'DATA_KPI — les indicateurs, calculés une fois, lus par toutes les vues', t: 's', s: { font: F({ bold: true, color: { rgb: C.white } }), fill: solid(C.navy), alignment: { vertical: 'center', indent: 1 } } });
    table(s, [{ head: 'Code', c1: 1, align: 'center' }, { head: 'Indicateur', c1: 2 }, { head: 'Valeur', c1: 3, align: 'right' }, { head: 'Affichage', c1: 4 }, { head: 'Méthode', c1: 5 }], d.kpis.map((k) => [{ v: k.code, t: 's', s: { font: M({ bold: true, color: { rgb: C.blue } }) } }, k.label, k.num != null ? { v: k.num, t: 'n', z: fmtFor(k) } : k.value, k.value, k.method ?? '']));
    d.kpis.forEach((k, i) => names.push({ Name: `KPI_${k.code}`, Ref: kpiRef(i) }));
    sheets.push(s);
  }
  if (live) {
    sheets.push(live.sheet, live.lists);
    names.push(...live.names);
  }
  sheets.push(calc.sheet);

  // ── Build ──
  const wb = XLSXS.utils.book_new();
  for (const s of sheets) {
    const ws = XLSXS.utils.aoa_to_sheet(s.aoa.map((r) => r.map((c) => ({ v: c.v, t: c.t, s: c.s, z: c.z, f: c.f, l: c.l }))));
    ws['!merges'] = s.merges;
    ws['!cols'] = s.cols.map((w) => ({ wch: w }));
    ws['!rows'] = Array.from({ length: s.aoa.length }, (_, i) => ({ hpt: s.heights[i] ?? 15 }));
    ws['!margins'] = { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 };
    XLSXS.utils.book_append_sheet(wb, ws, s.name);
  }
  wb.Workbook = { Names: names.map((n) => ({ Name: n.Name, Ref: n.Ref })) } as unknown as typeof wb.Workbook;
  wb.Props = { Title: d.title, Subject: d.subtitle ?? '', Author: d.author || 'MASSAMBA Workbench' };
  const raw = new Uint8Array(XLSXS.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
  return finishWorkbook(raw, sheets, d);
}

/** The recommendations table (Réf · priority chip · title · action · owner · deadline · indicator [· status]). */
function recoTable(s: Sheet, recos: Dossier['chapters'][number]['recommandations'], status = false) {
  const prio = (p: string) => (p === 'P1' ? C.risk : p === 'P2' ? C.gold : C.blue);
  const cols: Col[] = status
    ? [{ head: 'Réf.', c1: 1, align: 'center' }, { head: 'Prio.', c1: 2, align: 'center' }, { head: 'Recommandation', c1: 3 }, { head: 'Action', c1: 4, c2: 7 }, { head: 'Responsable', c1: 8 }, { head: 'Échéance', c1: 9, align: 'center' }, { head: 'Indicateur de clôture', c1: 10 }, { head: 'Statut', c1: 11, align: 'center' }]
    : [{ head: 'Réf.', c1: 1, align: 'center' }, { head: 'Prio.', c1: 2, align: 'center' }, { head: 'Recommandation', c1: 3 }, { head: 'Action', c1: 4, c2: 8 }, { head: 'Responsable', c1: 9 }, { head: 'Échéance', c1: 10, align: 'center' }, { head: 'Indicateur de clôture', c1: 11 }];
  return table(
    s,
    cols,
    recos.map((r) => [
      { v: r.ref, t: 's', s: { font: M({ bold: true, color: { rgb: C.blue } }) } },
      { v: r.priority, t: 's', s: { font: M({ bold: true, color: { rgb: C.white } }), fill: solid(prio(r.priority)), alignment: { horizontal: 'center' } } },
      { v: r.title, t: 's', s: { font: F({ bold: true, color: { rgb: C.navy } }) } },
      r.ground ? `${r.action} (${r.ground})` : r.action,
      r.owner,
      { v: r.due, t: 's', s: { font: M(), alignment: { horizontal: 'center' } } },
      { v: r.kpi, t: 's', s: { font: F({ italic: true, color: { rgb: C.text2 } }) } },
      ...(status ? [{ v: 'À faire', t: 's' as const, s: { fill: solid(C.input), font: F({ bold: true }) } }] : []),
    ]),
    { minH: 24 },
  );
}

// ── Conditional formatting (data bars, colour scales, status colours) ──
let dxfs: string[] = [];
const dxf = (fill: string, color: string) => {
  dxfs.push(`<dxf><font><b/><color rgb="FF${color}"/></font><fill><patternFill patternType="solid"><fgColor rgb="FF${fill}"/><bgColor rgb="FF${fill}"/></patternFill></fill></dxf>`);
  return dxfs.length - 1;
};
let prio = 1;
const dataBar = (ref: string, color: string) => `<conditionalFormatting sqref="${ref}"><cfRule type="dataBar" priority="${prio++}"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="FF${color}"/></dataBar></cfRule></conditionalFormatting>`;
const colorScale = (ref: string, lo: string, hi: string) => `<conditionalFormatting sqref="${ref}"><cfRule type="colorScale" priority="${prio++}"><colorScale><cfvo type="min"/><cfvo type="max"/><color rgb="FF${lo}"/><color rgb="FF${hi}"/></colorScale></cfRule></conditionalFormatting>`;
const statusRules = (ref: string, first: string) =>
  `<conditionalFormatting sqref="${ref}">${[
    ['Fait', mix(C.green, 0.75), C.green],
    ['En cours', mix(C.warn, 0.75), mix(C.warn, -0.2)],
    ['Abandonné', 'E7E7E7', '7F7F7F'],
  ]
    .map(([v, f, c]) => `<cfRule type="expression" dxfId="${dxf(f!, c!)}" priority="${prio++}"><formula>${xesc(`${first}="${v}"`)}</formula></cfRule>`)
    .join('')}</conditionalFormatting>`;
const voteRules = (ref: string, first: string) =>
  `<conditionalFormatting sqref="${ref}">${[
    ['Adoptée', mix(C.green, 0.75), C.green],
    ['Rejetée', mix(C.risk, 0.8), C.risk],
    ['Reportée', mix(C.warn, 0.75), mix(C.warn, -0.2)],
  ]
    .map(([v, f, c]) => `<cfRule type="expression" dxfId="${dxf(f!, c!)}" priority="${prio++}"><formula>${xesc(`${first}="${v}"`)}</formula></cfRule>`)
    .join('')}</conditionalFormatting>`;

// ── Drawings: buttons, plates, pictures, charts ──
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
/** EMU position → (column, offset) / (row, offset) for a two-cell anchor. */
function locate(sizes: number[], pos: number): { i: number; off: number } {
  let acc = 0;
  for (let i = 0; i < sizes.length; i++) {
    if (pos < acc + sizes[i]!) return { i, off: Math.max(0, Math.round(pos - acc)) };
    acc += sizes[i]!;
  }
  return { i: Math.max(0, sizes.length - 1), off: Math.max(0, sizes[sizes.length - 1]! - 1) };
}
function anchorXml(s: Sheet, x: number, w: number, r: number, inset: number, body: string): string {
  const cw = s.cols.map(colEmu);
  const rh = Array.from({ length: s.aoa.length + 2 }, (_, i) => ptEmu(s.heights[i] ?? 15));
  const top = rh.slice(0, r).reduce((a, b) => a + b, 0) + inset;
  const bottom = rh.slice(0, r + 1).reduce((a, b) => a + b, 0) - inset;
  const f = locate(cw, x);
  const t = locate(cw, x + w);
  const fr = locate(rh, top);
  const tr = locate(rh, bottom);
  return `<xdr:twoCellAnchor editAs="absolute"><xdr:from><xdr:col>${f.i}</xdr:col><xdr:colOff>${f.off}</xdr:colOff><xdr:row>${fr.i}</xdr:row><xdr:rowOff>${fr.off}</xdr:rowOff></xdr:from><xdr:to><xdr:col>${t.i}</xdr:col><xdr:colOff>${t.off}</xdr:colOff><xdr:row>${tr.i}</xdr:row><xdr:rowOff>${tr.off}</xdr:rowOff></xdr:to>${body}<xdr:clientData/></xdr:twoCellAnchor>`;
}
function shapesXml(s: Sheet, links: string[], pics: Uint8Array[], idBase: number): string {
  let id = idBase;
  const out: string[] = [];
  for (const sh of s.shapes) {
    const rh = ptEmu(s.heights[sh.r] ?? 15);
    // A button keeps its height whatever the row (a tall scorecard row must not inflate it).
    if (sh.kind === 'button') sh.inset = Math.max(sh.inset, Math.round((rh - ptEmu(sh.small ? 16 : 18)) / 2));
    const h = rh - 2 * sh.inset;
    if (sh.kind === 'picture' && sh.png) {
      pics.push(sh.png);
      const rid = `rIdP${pics.length}`;
      out.push(anchorXml(s, sh.x, sh.w, sh.r, sh.inset, `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id++}" name="Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="${REL}" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>`).replace(/<xdr:row>(\d+)<\/xdr:row><xdr:rowOff>(\d+)<\/xdr:rowOff><\/xdr:to>/, (m) => m));
      continue;
    }
    if (sh.kind === 'plate') {
      out.push(
        anchorXml(
          s,
          sh.x,
          sh.w,
          sh.r,
          sh.inset,
          `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id++}" name="Plaque"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 12000"/></a:avLst></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="${mix(C.navy, 0.6)}"/></a:solidFill></a:ln></xdr:spPr><xdr:txBody><a:bodyPr wrap="square" lIns="36000" rIns="36000" tIns="0" bIns="0" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="fr-FR" sz="1000" b="1"><a:solidFill><a:srgbClr val="${C.navy}"/></a:solidFill><a:latin typeface="${xesc(ui())}"/></a:rPr><a:t>${xesc(sh.label ?? '')}</a:t></a:r></a:p></xdr:txBody></xdr:sp>`,
        ),
      );
      // The plate spans the two header rows.
      out[out.length - 1] = out[out.length - 1]!.replace(/<xdr:to>([\s\S]*?)<xdr:row>(\d+)<\/xdr:row><xdr:rowOff>(\d+)<\/xdr:rowOff><\/xdr:to>/, (_m, pre: string, row: string) => `<xdr:to>${pre}<xdr:row>${Number(row) + 1}</xdr:row><xdr:rowOff>${ptEmu(13)}</xdr:rowOff></xdr:to>`);
      continue;
    }
    // A styled button: pill in a vertical gradient with a darker lip, a round white badge with the glyph, white caps text.
    links.push(sh.target!);
    const rid = `rIdL${links.length}`;
    const base = sh.active ? C.gold : C.blue;
    const txt = sh.active ? C.navy : 'FFFFFF';
    const link = `<a:hlinkClick xmlns:r="${REL}" r:id="${rid}" tooltip="${xesc(`Ouvrir ${sh.label}`)}"/>`;
    const grad = `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${mix(base, 0.45)}"/></a:gs><a:gs pos="48000"><a:srgbClr val="${mix(base, 0.08)}"/></a:gs><a:gs pos="52000"><a:srgbClr val="${base}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${mix(base, -0.28)}"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>`;
    const sz = sh.small ? 700 : 750;
    const badge = h;
    out.push(
      anchorXml(
        s,
        sh.x,
        sh.w,
        sh.r,
        sh.inset,
        `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id++}" name="Bouton ${xesc(sh.label ?? '')}">${link}</xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst></a:prstGeom>${grad}<a:ln w="9525"><a:solidFill><a:srgbClr val="${mix(base, -0.4)}"/></a:solidFill></a:ln><a:effectLst><a:outerShdw blurRad="25400" dist="19050" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="38000"/></a:srgbClr></a:outerShdw></a:effectLst></xdr:spPr><xdr:txBody><a:bodyPr wrap="none" lIns="${Math.round(badge * 0.9)}" rIns="18000" tIns="0" bIns="0" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="fr-FR" sz="${sz}" b="1"><a:solidFill><a:srgbClr val="${txt}"/></a:solidFill><a:effectLst><a:outerShdw blurRad="12700" dist="6350" dir="5400000" algn="t"><a:srgbClr val="000000"><a:alpha val="${sh.active ? 0 : 35000}"/></a:srgbClr></a:outerShdw></a:effectLst><a:latin typeface="${xesc(ui())}"/></a:rPr><a:t>${xesc(sh.label ?? '')}</a:t></a:r></a:p></xdr:txBody></xdr:sp>`,
      ),
    );
    const bInset = Math.round(h * 0.14);
    out.push(
      anchorXml(
        s,
        sh.x + Math.round(h * 0.2),
        badge - 2 * bInset,
        sh.r,
        sh.inset + bInset,
        `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id++}" name="Pastille">${link}</xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${sh.active ? C.navy : 'FFFFFF'}"/></a:solidFill><a:ln><a:noFill/></a:ln></xdr:spPr><xdr:txBody><a:bodyPr wrap="none" lIns="0" rIns="0" tIns="0" bIns="0" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="fr-FR" sz="${sz}" b="1"><a:solidFill><a:srgbClr val="${sh.active ? 'FFFFFF' : mix(base, -0.25)}"/></a:solidFill><a:latin typeface="Segoe UI Symbol"/></a:rPr><a:t>${xesc(sh.glyph ?? '›')}</a:t></a:r></a:p></xdr:txBody></xdr:sp>`,
      ),
    );
  }
  return out.join('');
}

/** Sheet views, page setup, footer, conditional formatting, validations, drawings (charts, buttons, logo), tables, dxfs. */
function finishWorkbook(bytes: Uint8Array, sheets: Sheet[], d: Dossier): Uint8Array {
  const z = unzipSync(bytes);
  let ct = strFromU8(z['[Content_Types].xml']!);
  let chartNo = 0;
  let picNo = 0;
  let tableNo = 0;
  const zoom = activeDesign().xlsx.zoom;
  const foot = (t: string) => t.replace(/&/g, '&&');
  sheets.forEach((s, i) => {
    const key = `xl/worksheets/sheet${i + 1}.xml`;
    if (!z[key]) return;
    let xml = strFromU8(z[key]!);
    const pane = s.freezeRow ? `<pane ySplit="${s.freezeRow}" topLeftCell="A${s.freezeRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="B${s.freezeRow + 1}" sqref="B${s.freezeRow + 1}"/>` : '';
    const view = `<sheetViews><sheetView showGridLines="0" zoomScale="${s.name === 'DONNÉES' ? 85 : zoom}" zoomScaleNormal="${zoom}" workbookViewId="0"${i === 0 ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews>`;
    xml = /<sheetViews>[\s\S]*?<\/sheetViews>/.test(xml) ? xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, view) : xml.replace(/(<dimension [^>]*\/>)/, `$1${view}`);
    const sp = `<sheetPr><tabColor rgb="FF${s.tab}"/><pageSetUpPr fitToPage="1"/></sheetPr>`;
    xml = /<sheetPr[\s\S]*?(\/>|<\/sheetPr>)/.test(xml) ? xml.replace(/<sheetPr[^>]*\/>|<sheetPr[\s\S]*?<\/sheetPr>/, sp) : xml.replace(/(<dimension )/, `${sp}$1`);
    // Conditional formatting, then validations (schema order: mergeCells, conditionalFormatting, dataValidations, hyperlinks, …).
    const after = (tags: string[]) => tags.find((t) => xml.includes(t)) ?? '</worksheet>';
    if (s.cfs.length) xml = xml.replace(after(['<dataValidations', '<hyperlinks', '<printOptions', '<pageMargins', '<pageSetup', '<headerFooter', '<drawing', '<tableParts', '</worksheet>']), (m) => `${s.cfs.join('')}${m}`);
    if (s.validations.length) {
      const dv = `<dataValidations count="${s.validations.length}">${s.validations.map((v) => `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="${v.ref}"><formula1>${xesc(v.formula).replace(/&quot;/g, '"').replace(/&apos;/g, "'")}</formula1></dataValidation>`).join('')}</dataValidations>`;
      xml = xml.replace(after(['<hyperlinks', '<printOptions', '<pageMargins', '<pageSetup', '<headerFooter', '<drawing', '<tableParts', '</worksheet>']), (m) => `${dv}${m}`);
    }
    // Page setup: landscape A4, one page wide; footer « org · unit | CONFIDENTIEL | page n / N ».
    const ps = `<pageSetup paperSize="9" orientation="${s.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/><headerFooter><oddHeader>${xesc(`&L&8 ${foot(d.org ?? '')} — ${foot(d.title.slice(0, 80))}&R&8 ${foot(s.name)}`)}</oddHeader><oddFooter>${xesc(`&L&8 ${foot([d.org, d.unit].filter(Boolean).join(' · '))}&C&8&B ${foot((d.confidentiality ?? 'CONFIDENTIEL').toUpperCase().slice(0, 40))}&R&8 page &P / &N`)}</oddFooter></headerFooter>`;
    xml = /<pageMargins[^>]*\/>/.test(xml) ? xml.replace(/(<pageMargins[^>]*\/>)/, `$1${ps}`) : xml.replace(after(['<drawing', '<tableParts', '</worksheet>']), (m) => `${ps}${m}`);
    // Drawing: charts + shapes + pictures, with their relationships.
    const links: string[] = [];
    const pics: Uint8Array[] = [];
    const anchors = s.charts.map((p, k) => {
      chartNo++;
      const cw = s.cols.map(colEmu);
      const x1 = s.colX(p.c1) + ptEmu(2);
      const x2 = s.colX(p.c2 + 1) - ptEmu(2);
      const rh = Array.from({ length: s.aoa.length + 2 }, (_, j) => ptEmu(s.heights[j] ?? 15));
      const y1 = rh.slice(0, p.r1).reduce((a, b) => a + b, 0) + ptEmu(2);
      const y2 = rh.slice(0, p.r2 + 1).reduce((a, b) => a + b, 0) - ptEmu(2);
      const f = locate(cw, x1);
      const t = locate(cw, x2);
      const fr = locate(rh, y1);
      const tr = locate(rh, y2);
      return {
        no: chartNo,
        xml: chartXml(p.spec),
        anchor: `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${f.i}</xdr:col><xdr:colOff>${f.off}</xdr:colOff><xdr:row>${fr.i}</xdr:row><xdr:rowOff>${fr.off}</xdr:rowOff></xdr:from><xdr:to><xdr:col>${t.i}</xdr:col><xdr:colOff>${t.off}</xdr:colOff><xdr:row>${tr.i}</xdr:row><xdr:rowOff>${tr.off}</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${k + 2}" name="Graphique ${chartNo}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="${REL}" r:id="rIdC${k + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`,
      };
    });
    const shapes = shapesXml(s, links, pics, s.charts.length + 2);
    if (anchors.length || shapes) {
      const dn = i + 1;
      z[`xl/drawings/drawing${dn}.xml`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${A}">${anchors.map((a) => a.anchor).join('')}${shapes}</xdr:wsDr>`);
      const rels = [
        ...anchors.map((a, k) => `<Relationship Id="rIdC${k + 1}" Type="${REL}/chart" Target="../charts/chart${a.no}.xml"/>`),
        ...links.map((t, k) => `<Relationship Id="rIdL${k + 1}" Type="${REL}/hyperlink" Target="${xesc(`#${quote(t)}!A1`)}"/>`),
        ...pics.map((_, k) => {
          picNo++;
          z[`xl/media/logo${picNo}.png`] = new Uint8Array(pics[k]!);
          return `<Relationship Id="rIdP${k + 1}" Type="${REL}/image" Target="../media/logo${picNo}.png"/>`;
        }),
      ];
      z[`xl/drawings/_rels/drawing${dn}.xml.rels`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
      anchors.forEach((a) => (z[`xl/charts/chart${a.no}.xml`] = strToU8(a.xml)));
      ct = ct.replace('</Types>', `<Override PartName="/xl/drawings/drawing${dn}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>${anchors.map((a) => `<Override PartName="/xl/charts/chart${a.no}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')}</Types>`);
      addRel(z, i + 1, `<Relationship Id="rIdDrawing" Type="${REL}/drawing" Target="../drawings/drawing${dn}.xml"/>`);
      xml = xml.replace(after(['<legacyDrawing', '<tableParts', '<extLst', '</worksheet>']), (m) => `<drawing r:id="rIdDrawing"/>${m}`);
    }
    if (s.table) {
      tableNo++;
      const t = s.table;
      const ref = `${colName(t.c1)}${t.r1 + 1}:${colName(t.c2)}${t.r2 + 1}`;
      z[`xl/tables/table${tableNo}.xml`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${tableNo}" name="${t.name}" displayName="${t.name}" ref="${ref}" totalsRowShown="0"><autoFilter ref="${ref}"/><tableColumns count="${t.names.length}">${t.names.map((n, k) => `<tableColumn id="${k + 1}" name="${xesc(n)}"/>`).join('')}</tableColumns><tableStyleInfo name="TableStyleLight1" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`);
      ct = ct.replace('</Types>', `<Override PartName="/xl/tables/table${tableNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>`);
      addRel(z, i + 1, `<Relationship Id="rIdT1" Type="${REL}/table" Target="../tables/table${tableNo}.xml"/>`);
      xml = xml.replace(after(['<extLst', '</worksheet>']), (m) => `<tableParts count="1"><tablePart r:id="rIdT1"/></tableParts>${m}`);
    }
    if (!/xmlns:r=/.test(xml)) xml = xml.replace('<worksheet ', `<worksheet xmlns:r="${REL}" `);
    z[key] = strToU8(xml);
  });
  if (picNo && !/Extension="png"/.test(ct)) ct = ct.replace('<Default ', '<Default Extension="png" ContentType="image/png"/><Default ');
  if (z['xl/styles.xml']) {
    let st = fixStylesXml(strFromU8(z['xl/styles.xml']));
    if (dxfs.length) {
      const block = `<dxfs count="${dxfs.length}">${dxfs.join('')}</dxfs>`;
      st = /<dxfs[^>]*\/>/.test(st) ? st.replace(/<dxfs[^>]*\/>/, block) : /<dxfs[\s\S]*?<\/dxfs>/.test(st) ? st.replace(/<dxfs[\s\S]*?<\/dxfs>/, block) : st.replace(/(<tableStyles|<colors|<extLst|<\/styleSheet>)/, `${block}$1`);
    }
    z['xl/styles.xml'] = strToU8(st);
  }
  // The workbook's own palette (Excel's colour picker, charts the user adds, hyperlinks) and fonts follow the theme.
  if (z['xl/theme/theme1.xml']) {
    const D = activeDesign();
    const hex = (v: string) => v.replace(/^#/, '').toUpperCase();
    const six = [...D.chartSeries, C.blue, C.gold, C.cyan, C.navy, C.text2, C.green].map(hex).slice(0, 6);
    const slot = (tag: string, v: string) => `<a:${tag}><a:srgbClr val="${hex(v)}"/></a:${tag}>`;
    const font = D.font.ui.replace(/[^\w -]/g, '');
    let th = strFromU8(z['xl/theme/theme1.xml']);
    th = th
      .replace(/<a:clrScheme name="[^"]*">/, `<a:clrScheme name="${D.name.replace(/[^\p{L}\p{N} \-—]/gu, '')}">`)
      .replace(/<a:dk2>[\s\S]*?<\/a:dk2>/, slot('dk2', C.navy))
      .replace(/<a:lt2>[\s\S]*?<\/a:lt2>/, slot('lt2', C.ice))
      .replace(/<a:hlink>[\s\S]*?<\/a:hlink>/, slot('hlink', C.blue))
      .replace(/<a:folHlink>[\s\S]*?<\/a:folHlink>/, slot('folHlink', C.navy))
      .replace(/(<a:(?:major|minor)Font><a:latin typeface=")[^"]*/g, `$1${font}`);
    six.forEach((v, i) => (th = th.replace(new RegExp(`<a:accent${i + 1}>[\\s\\S]*?</a:accent${i + 1}>`), slot(`accent${i + 1}`, v))));
    z['xl/theme/theme1.xml'] = strToU8(th);
  }
  // Recalculate everything when Excel opens the file (the cached values are those of « (Tous) »).
  if (z['xl/workbook.xml']) {
    let wbx = strFromU8(z['xl/workbook.xml']);
    wbx = /<calcPr[^>]*\/>/.test(wbx) ? wbx.replace(/<calcPr[^>]*\/>/, '<calcPr calcId="191029" fullCalcOnLoad="1"/>') : wbx.replace(/(<\/workbook>)/, '<calcPr calcId="191029" fullCalcOnLoad="1"/>$1');
    z['xl/workbook.xml'] = strToU8(wbx);
  }
  z['[Content_Types].xml'] = strToU8(ct);
  dxfs = [];
  prio = 1;
  return zipSync(z);
}
function addRel(z: Record<string, Uint8Array>, sheetNo: number, rel: string) {
  const key = `xl/worksheets/_rels/sheet${sheetNo}.xml.rels`;
  const xml = z[key] ? strFromU8(z[key]!) : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  z[key] = strToU8(xml.replace('</Relationships>', `${rel}</Relationships>`));
}
