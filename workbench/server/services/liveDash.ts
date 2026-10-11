/**
 * LIVE DASHBOARD — the chosen image's design rebuilt as a WORKING Excel dashboard, no fixed picture:
 *  - the sheet is a fine grid (cells) so every element sits exactly where the image had it; page, frame, title band,
 *    table and filter panels are cell fills; cards and KPI tiles are editable DrawingML shapes on that grid;
 *  - every figure is a FORMULA on the « Données du tableau de bord » sheet (the chat's rows are copied there):
 *    KPI tiles display their cell live (text-linked shapes), charts are native charts on formula ranges, tables are
 *    real cells (Top N by INDEX / MATCH / LARGE);
 *  - FILTERS: drop-down lists (data validation) on the dashboard; every figure, chart and table follows the choice;
 *  - NAVIGATION: menu items of the image become buttons that open the other sheets (hyperlinks).
 * Pure (zip in → zip out). Nothing invented: the cached values are the chat's own figures for « (Tous) ».
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { chartXml, type CloneChartKind } from './cloneXlsx';
import type { DashSpec, Panel } from './dashClone';
import { asDate, colorsFor, mixH, panelPlan, readableOn, type CloneData, type DataView } from './dashRender';
import { ooxml } from './officeLogo';

const { addOverride, addRel, relsOf, ensureRootNs, NS_R } = ooxml;
type Zip = Record<string, Uint8Array>;
const rd = (z: Zip, p: string) => (z[p] ? strFromU8(z[p]!) : '');
const wr = (z: Zip, p: string, s: string) => {
  z[p] = strToU8(s);
};
const DASH = 'Tableau de bord';
const DATA = 'Données du tableau de bord';
const Q = `'${DATA}'`;
const QD = `'${DASH}'`;
const ALL = '(Tous)';
const xesc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = (c: string) => c.replace('#', '').slice(0, 6).toUpperCase();
export const colL = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const AMOUNT_FMT = '[&gt;=1000000000]#,##0.0,,,&quot; Md&quot;;[&gt;=1000000]#,##0.0,,&quot; M&quot;;#,##0';

/** Grid of the dashboard sheet: G columns of ~15 px, rows of 11.25 pt (15 px). */
const G = 80;
const COL_W = 2.1;
const ROW_PT = 11.25;
const PX = 15;
const EMU_PX = 9525;

// ── styles (memoised cell formats appended to styles.xml) ───────────────────────────────────────────────────────────
class Styles {
  private st: string;
  private memo = new Map<string, number>();
  private fmtId = 0;
  constructor(private z: Zip) {
    this.st = rd(z, 'xl/styles.xml');
  }
  private append(tag: string, item: string): number {
    const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`);
    const m = re.exec(this.st);
    if (!m) {
      const self = new RegExp(`<${tag}\\b[^>]*/>`);
      this.st = self.test(this.st) ? this.st.replace(self, `<${tag} count="1">${item}</${tag}>`) : this.st.replace('</styleSheet>', `<${tag} count="1">${item}</${tag}></styleSheet>`);
      return 0;
    }
    const n = (m[2]!.match(new RegExp(`<${tag.slice(0, -1)}\\b`, 'g')) ?? []).length;
    this.st = this.st.replace(re, `<${tag}${/count="\d+"/.test(m[1]!) ? m[1]!.replace(/count="\d+"/, `count="${n + 1}"`) : `${m[1]} count="${n + 1}"`}>${m[2]}${item}</${tag}>`);
    return n;
  }
  private amountFmt(): number {
    if (this.fmtId) return this.fmtId;
    const fm = /<numFmts\b[^>]*>([\s\S]*?)<\/numFmts>/.exec(this.st);
    const ids = [...(fm?.[1] ?? '').matchAll(/numFmtId="(\d+)"/g)].map((m) => +m[1]!);
    this.fmtId = Math.max(190, ...ids) + 1;
    const item = `<numFmt numFmtId="${this.fmtId}" formatCode="${AMOUNT_FMT}"/>`;
    if (fm) this.st = this.st.replace(/<numFmts\b([^>]*)>([\s\S]*?)<\/numFmts>/, (_m, a: string, b: string) => `<numFmts${a.replace(/count="\d+"/, `count="${ids.length + 1}"`)}>${b}${item}</numFmts>`);
    else this.st = this.st.replace(/<styleSheet\b([^>]*)>/, `<styleSheet$1><numFmts count="1">${item}</numFmts>`);
    return this.fmtId;
  }
  /** A cell format: fill, font colour / size / bold, alignment, thin border colour, amount format. */
  get(o: { fill?: string | null; color?: string; size?: number; bold?: boolean; font?: string; align?: 'left' | 'center' | 'right'; border?: string | null; amount?: boolean; wrap?: boolean }): number {
    const key = JSON.stringify(o);
    const hit = this.memo.get(key);
    if (hit !== undefined) return hit;
    const font = this.append('fonts', `<font>${o.bold ? '<b/>' : ''}<sz val="${o.size ?? 9}"/><color rgb="FF${hex(o.color ?? '#1F2937')}"/><name val="${xesc(o.font ?? 'Segoe UI')}"/></font>`);
    const fill = o.fill ? this.append('fills', `<fill><patternFill patternType="solid"><fgColor rgb="FF${hex(o.fill)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const line = o.border ? `<color rgb="FF${hex(o.border)}"/>` : '';
    const border = o.border ? this.append('borders', `<border><left style="thin">${line}</left><right style="thin">${line}</right><top style="thin">${line}</top><bottom style="thin">${line}</bottom><diagonal/></border>`) : 0;
    const numFmt = o.amount ? this.amountFmt() : 0;
    const xfs = /<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/.exec(this.st)!;
    const n = (xfs[2]!.match(/<xf\b/g) ?? []).length;
    const xf = `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"${o.align ? ` horizontal="${o.align}"` : ''}${o.wrap ? ' wrapText="1"' : ''}/></xf>`;
    this.st = this.st.replace(/<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/, (_m, a: string, b: string) => `<cellXfs${a.replace(/count="\d+"/, `count="${n + 1}"`)}>${b}${xf}</cellXfs>`);
    this.memo.set(key, n);
    return n;
  }
  save() {
    // Font children in schema order (some writers put <name> first): 0 error for a strict reader.
    const ORDER = ['b', 'i', 'strike', 'condense', 'extend', 'outline', 'shadow', 'u', 'vertAlign', 'sz', 'color', 'name', 'family', 'charset', 'scheme'];
    this.st = this.st.replace(/<font>((?:<\w+\b[^>]*\/>)+)<\/font>/g, (_m, kids: string) => `<font>${[...kids.matchAll(/<(\w+)\b[^>]*\/>/g)].sort((a, b) => ORDER.indexOf(a[1]!) - ORDER.indexOf(b[1]!)).map((k) => k[0]).join('')}</font>`);
    wr(this.z, 'xl/styles.xml', this.st);
  }
}

// ── the calculation sheet ──────────────────────────────────────────────────────────────────────────────────────────
interface Cell {
  v?: string | number;
  f?: string;
  s?: number;
}
class SheetCells {
  rows = new Map<number, Map<number, Cell>>();
  set(r: number, c: number, cell: Cell) {
    if (!this.rows.has(r)) this.rows.set(r, new Map());
    this.rows.get(r)!.set(c, cell);
  }
  xml(): string {
    return [...this.rows.keys()]
      .sort((a, b) => a - b)
      .map((r) => {
        const cells = [...this.rows.get(r)!.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([c, x]) => {
            const ref = `${colL(c)}${r}`;
            const s = x.s !== undefined ? ` s="${x.s}"` : '';
            if (x.f !== undefined) {
              const isText = typeof x.v === 'string';
              return `<c r="${ref}"${s}${isText ? ' t="str"' : ''}><f>${xesc(x.f)}</f>${x.v !== undefined ? `<v>${isText ? xesc(String(x.v)) : x.v}</v>` : ''}</c>`;
            }
            if (typeof x.v === 'number') return `<c r="${ref}"${s}><v>${x.v}</v></c>`;
            if (typeof x.v === 'string') return `<c r="${ref}"${s} t="inlineStr"><is><t>${xesc(x.v)}</t></is></c>`;
            return `<c r="${ref}"${s}/>`;
          })
          .join('');
        return `<row r="${r}">${cells}</row>`;
      })
      .join('');
  }
}

export interface LiveResult {
  bytes: Uint8Array;
  charts: number;
  shapes: number;
  filters: string[];
  links: number;
  kpis: number;
  tables: number;
}
interface GBox {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

/**
 * Adds the live dashboard FIRST and its calculation sheet LAST. Null when the file is not a workbook, already has
 * the dashboard, or the chat's rows are not available.
 */
export function addLiveDashboard(bytes: Uint8Array, spec: DashSpec, d: CloneData, o: { font?: string } = {}): LiveResult | null {
  let z: Zip;
  try {
    z = unzipSync(bytes);
  } catch {
    return null;
  }
  let wb = rd(z, 'xl/workbook.xml');
  if (!wb || wb.includes(`name="${DASH}"`) || !/<sheets>/.test(wb) || !d.source || !d.source.rows.length) return null;
  const src = d.source;
  const font = (o.font ?? spec.font).replace(/[<>"]/g, '') || 'Segoe UI';
  const S = new Styles(z);
  const R = Math.max(24, Math.round(G / Math.max(0.4, spec.aspect)));
  // fractions → grid
  const gb = (b: { x: number; y: number; w: number; h: number }): GBox => {
    const c0 = Math.max(0, Math.min(G - 1, Math.round(b.x * G)));
    const r0 = Math.max(0, Math.min(R - 1, Math.round(b.y * R)));
    return { c0, r0, c1: Math.max(c0, Math.min(G - 1, Math.round((b.x + b.w) * G) - 1)), r1: Math.max(r0, Math.min(R - 1, Math.round((b.y + b.h) * R) - 1)) };
  };
  const plan = panelPlan(spec, d);
  const fallback = spec.palette.series.length ? spec.palette.series : [spec.palette.primary, spec.palette.accent];

  // ── 1. raw rows on the calculation sheet (columns from RAW0) ────────────────────────────────────────────────────
  const calc = new SheetCells();
  const head = S.get({ fill: spec.palette.primary, color: readableOn(spec.palette.primary, ['#FFFFFF', '#0F172A']), bold: true, font });
  const rows = src.rows.slice(0, 5000);
  const n = rows.length;
  const used = new Set<string>();
  for (const v of d.views) {
    if (v.src?.by) used.add(v.src.by);
    if (v.src?.measure) used.add(v.src.measure);
  }
  for (const k of d.kpis) if (k.src?.col) used.add(k.src.col);
  for (const c of d.table.columns) used.add(c);
  // Filters: text columns with a handful of values (2–25), the most useful first.
  const distinct = (c: string) => [...new Set(rows.map((r) => r[c]).filter((v) => v !== null && v !== undefined && String(v).trim() !== '').map((v) => String(v)))];
  // Categories people filter on (segment, band, agency…), never identifiers or names; fewest values first.
  const IDLIKE = /customer|client|compte|account|contrat|contract|r[ée]f|\bid\b|code|matricule|num[ée]ro|nom\b|name|libell|raison sociale/i;
  const filters = src.textCols
    .filter((c) => !IDLIKE.test(c))
    .map((c) => ({ c, vals: distinct(c) }))
    .filter((x) => x.vals.length >= 2 && x.vals.length <= 25)
    .sort((a, b) => a.vals.length - b.vals.length)
    .slice(0, 2);
  for (const f of filters) used.add(f.c);
  const RAW0 = 40;
  const rawCols = [...used].filter((c) => src.columns.includes(c));
  const rawIdx = new Map<string, number>();
  rawCols.forEach((c, i) => rawIdx.set(c, RAW0 + i));
  const monthCol = src.dateCol ? RAW0 + rawCols.length : -1;
  const helperCol = RAW0 + rawCols.length + (monthCol >= 0 ? 1 : 0);
  rawCols.forEach((c) => calc.set(1, rawIdx.get(c)!, { v: c, s: head }));
  if (monthCol >= 0) calc.set(1, monthCol, { v: 'Mois', s: head });
  calc.set(1, helperCol, { v: 'Classement (calcul)', s: head });
  const ym = (v: unknown) => {
    const x = asDate(v);
    return x ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}` : '';
  };
  rows.forEach((r, i) => {
    for (const c of rawCols) {
      const v = r[c];
      calc.set(i + 2, rawIdx.get(c)!, isNum(v) ? { v } : v === null || v === undefined || v === '' ? {} : { v: v instanceof Date ? v.toISOString().slice(0, 10) : String(v) });
    }
    if (monthCol >= 0) calc.set(i + 2, monthCol, { v: ym(r[src.dateCol!]) });
  });
  const rng = (c: number) => `${Q}!$${colL(c)}$2:$${colL(c)}$${n + 1}`;

  // ── 2. filter lists + the dashboard cells that hold the choice ─────────────────────────────────────────────────
  // Where the drop-downs go: the image's first filter / slicer panel, else the right of the title row.
  const filterPanel = spec.panels.findIndex((p, i) => plan[i]?.kind === 'filter');
  const titleBox = spec.title ? gb(spec.title.box) : { c0: 2, r0: 1, c1: G - 3, r1: 3 };
  const fBoxes: GBox[] = [];
  if (filterPanel >= 0) {
    const b = gb(spec.panels[filterPanel]!.box);
    const tall = b.r1 - b.r0 > b.c1 - b.c0;
    filters.forEach((_, i) => {
      if (tall) fBoxes.push({ c0: b.c0 + 1, r0: b.r0 + 1 + i * 4, c1: b.c1 - 1, r1: b.r0 + 3 + i * 4 });
      else {
        const w = Math.floor((b.c1 - b.c0 + 1) / Math.max(1, filters.length));
        fBoxes.push({ c0: b.c0 + i * w + 1, r0: b.r0 + 1, c1: b.c0 + (i + 1) * w - 1, r1: Math.min(b.r1 - 1, b.r0 + 3) });
      }
    });
  } else {
    const right = G - 3;
    filters.forEach((_, i) => fBoxes.push({ c0: right - (filters.length - i) * 14 + 1, r0: Math.max(0, titleBox.r0), c1: right - (filters.length - 1 - i) * 14 - 1, r1: Math.max(0, titleBox.r0) + 2 }));
  }
  // The title stops before the drop-downs (a shape over a drop-down would catch the clicks).
  const titleRight = filterPanel < 0 && filters.length ? Math.min(titleBox.c1, (fBoxes[0]?.c0 ?? G) - 2) : titleBox.c1;
  const selCell = fBoxes.map((b) => ({ c: b.c0, r: b.r1 + 1 })); // the value cell is the box's last row
  const sel = selCell.map((x) => `${QD}!$${colL(x.c)}$${x.r}`);
  const LIST0 = 34;
  filters.forEach((f, i) => {
    const col = LIST0 + i;
    calc.set(1, col, { v: f.c, s: head });
    [ALL, ...f.vals.sort((a, b) => a.localeCompare(b, 'fr'))].forEach((v, k) => calc.set(k + 2, col, { v }));
  });
  const mask = filters.length ? filters.map((f, i) => `(((${sel[i]}="${ALL}")+(${rng(rawIdx.get(f.c)!)}=${sel[i]}))>0)`).join('*') : '';
  const sumIf = (cond: string, measure: string | null) => (measure && rawIdx.has(measure) ? `SUMPRODUCT(${[cond, mask, rng(rawIdx.get(measure)!)].filter(Boolean).join('*')})` : `SUMPRODUCT(${[cond, mask].filter(Boolean).join('*') || '1'}*1)`);

  // ── 3. KPI cells ─────────────────────────────────────────────────────────────────────────────────────────────────
  const KPI0 = 30; // label col, value col 31
  const amount = S.get({ amount: true, font });
  const kpiCell: { label: string; ref: string; v: number }[] = [];
  d.kpis.slice(0, 12).forEach((k, i) => {
    const r = i + 2;
    const c = k.src?.col && rawIdx.has(k.src.col) ? rng(rawIdx.get(k.src.col)!) : null;
    const vals = k.src?.col ? rows.map((x) => x[k.src!.col!]).filter(isNum) : [];
    let f = '';
    let v = 0;
    if (k.src?.fn === 'count') {
      f = mask ? `SUMPRODUCT(${mask}*1)` : `ROWS(${rng(rawIdx.get(rawCols[0]!) ?? RAW0)})`;
      v = n;
    } else if (c && k.src?.fn === 'sum') {
      f = mask ? `SUMPRODUCT(${mask}*${c})` : `SUM(${c})`;
      v = vals.reduce((a, b) => a + b, 0);
    } else if (c && k.src?.fn === 'avg') {
      f = mask ? `IFERROR(SUMPRODUCT(${mask}*${c})/SUMPRODUCT(${mask}*ISNUMBER(${c})),0)` : `IFERROR(AVERAGE(${c}),0)`;
      v = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    } else if (c && k.src?.fn === 'max') {
      f = mask ? `SUMPRODUCT(MAX((${mask})*N(+${c})))` : `MAX(${c})`;
      v = vals.length ? Math.max(...vals) : 0;
    } else return;
    calc.set(1, KPI0, { v: 'Indicateur', s: head });
    calc.set(1, KPI0 + 1, { v: 'Valeur', s: head });
    calc.set(r, KPI0, { v: k.label });
    calc.set(r, KPI0 + 1, { f, v, s: amount });
    kpiCell.push({ label: k.label, ref: `${Q}!$${colL(KPI0 + 1)}$${r}`, v });
  });

  // ── 4. view blocks (3 columns each: category, value formula, key) for the charts ───────────────────────────────
  const viewBlock = new Map<DataView, { c0: number; cats: string[]; vals: number[] }>();
  const blockFor = (v: DataView, kind: string): { c0: number; cats: string[]; vals: number[] } => {
    const hit = viewBlock.get(v);
    if (hit) return hit;
    const limit = kind === 'pie' || kind === 'donut' ? 6 : kind === 'hbar' ? 8 : kind === 'bar' ? 7 : 12;
    const c0 = viewBlock.size * 3;
    let cats = v.categories.slice(0, limit);
    let vals = v.values.slice(0, limit);
    let keys = cats;
    let other = false;
    if (v.src?.month) {
      cats = v.categories.slice(-limit);
      vals = v.values.slice(-limit);
      keys = (v.src.keys ?? []).slice(-limit);
    } else if ((kind === 'pie' || kind === 'donut') && v.categories.length > limit) {
      cats = [...v.categories.slice(0, limit - 1), 'Autres'];
      vals = [...v.values.slice(0, limit - 1), v.values.slice(limit - 1).reduce((a, b) => a + b, 0)];
      keys = cats;
      other = true;
    }
    calc.set(1, c0, { v: v.src?.month ? 'Mois' : (v.src?.by ?? 'Catégorie'), s: head });
    calc.set(1, c0 + 1, { v: v.valueName, s: head });
    cats.forEach((cat, i) => {
      const r = i + 2;
      calc.set(r, c0, { v: cat });
      let f: string;
      if (other && i === cats.length - 1) f = `${sumIf('1', v.src?.measure ?? null)}-SUM(${colL(c0 + 1)}2:${colL(c0 + 1)}${r - 1})`;
      else if (v.src?.month && monthCol >= 0) {
        calc.set(r, c0 + 2, { v: keys[i]! });
        f = sumIf(`(${rng(monthCol)}=${colL(c0 + 2)}${r})`, v.src.measure);
      } else if (v.src?.by && rawIdx.has(v.src.by)) f = sumIf(`(${rng(rawIdx.get(v.src.by)!)}=${colL(c0)}${r})`, v.src.measure);
      else f = '';
      calc.set(r, c0 + 1, f ? { f, v: vals[i] ?? 0, s: amount } : { v: vals[i] ?? 0, s: amount });
    });
    const b = { c0, cats, vals };
    viewBlock.set(v, b);
    return b;
  };

  // ── 5. Top-N table: helper column (masked measure, unique), then INDEX / MATCH / LARGE ─────────────────────────
  const tMeasure = d.table.columns.find((c) => src.numCols.includes(c) && rawIdx.has(c)) ?? null;
  const TOP0 = 20;
  const topRows = 15;
  if (tMeasure) {
    const mc = rawIdx.get(tMeasure)!;
    rows.forEach((r, i) => {
      const row = i + 2;
      const m = isNum(r[tMeasure]) ? (r[tMeasure] as number) : 0;
      const cond = filters.map((f, k) => `OR(${sel[k]}="${ALL}",${colL(rawIdx.get(f.c)!)}${row}=${sel[k]})`).join(',');
      calc.set(row, helperCol, { f: `IF(${cond ? `AND(${cond})` : 'TRUE'},N(${colL(mc)}${row}),-1E+300)+ROW()/1E+9`, v: m + row / 1e9 });
    });
    const helper = rng(helperCol);
    d.table.columns.forEach((c, j) => {
      calc.set(1, TOP0 + j, { v: c, s: head });
      for (let k = 1; k <= topRows; k++) {
        const r = k + 1;
        const cached = d.table.rows[k - 1]?.[j];
        const f = rawIdx.has(c) ? `IFERROR(IF(LARGE(${helper},${k})<-1E+299,"",INDEX(${rng(rawIdx.get(c)!)},MATCH(LARGE(${helper},${k}),${helper},0))),"")` : '""';
        calc.set(r, TOP0 + j, { f, v: cached === undefined ? '' : cached, s: typeof cached === 'number' ? amount : undefined });
      }
    });
  }

  // ── 6. the dashboard sheet: grid cells (fills), shapes, charts, filters, links ────────────────────────────────────
  const grid = new Map<string, number>(); // "r,c" → style (cells drawn with a fill)
  const values = new Map<string, Cell>(); // "r,c" → content
  const merges: string[] = [];
  const paint = (b: GBox, s: number) => {
    for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) grid.set(`${r},${c}`, s);
  };
  const outer = S.get({ fill: spec.outer, font });
  const page = S.get({ fill: spec.page, font });
  paint({ c0: 0, r0: 0, c1: G - 1, r1: R - 1 }, outer);
  const pb = gb(spec.pageBox);
  if (spec.frame) paint({ c0: Math.max(0, pb.c0 - 1), r0: Math.max(0, pb.r0 - 1), c1: Math.min(G - 1, pb.c1 + 1), r1: Math.min(R - 1, pb.r1 + 1) }, S.get({ fill: spec.frame.color, font }));
  paint(pb, page);
  if (spec.title?.fill) paint(titleBox, S.get({ fill: spec.title.fill, font }));

  const parts: string[] = [];
  let sid = 9500;
  let shapes = 0;
  const anchorG = (b: GBox, body: string, inset = 0) => {
    const off = Math.round(inset * PX * EMU_PX);
    return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${b.c0}</xdr:col><xdr:colOff>${off}</xdr:colOff><xdr:row>${b.r0}</xdr:row><xdr:rowOff>${off}</xdr:rowOff></xdr:from><xdr:to><xdr:col>${b.c1 + 1}</xdr:col><xdr:colOff>${-off < 0 ? 0 : 0}</xdr:colOff><xdr:row>${b.r1 + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>${body}<xdr:clientData/></xdr:twoCellAnchor>`;
  };
  const shapeXml = (b: GBox, so: { fill?: string | null; line?: string | null; lineW?: number; radius?: number; paras?: { text: string; size: number; color: string; bold?: boolean }[]; link?: { ref: string; size: number; color: string }; align?: 'l' | 'ctr' | 'r'; anchorV?: 't' | 'ctr' | 'b'; name: string; hlink?: string; shadow?: boolean }) => {
    const id = ++sid;
    shapes++;
    const wPx = (b.c1 - b.c0 + 1) * PX;
    const hPx = (b.r1 - b.r0 + 1) * PX;
    const adj = so.radius ? Math.min(50000, Math.round((so.radius / Math.max(1, Math.min(wPx, hPx))) * 100000)) : 0;
    const geom = adj ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adj}"/></a:avLst></a:prstGeom>` : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
    const fill = so.fill ? `<a:solidFill><a:srgbClr val="${hex(so.fill)}"/></a:solidFill>` : '<a:noFill/>';
    const line = so.line ? `<a:ln w="${Math.round(Math.max(0.5, so.lineW ?? 0.75) * 12700)}"><a:solidFill><a:srgbClr val="${hex(so.line)}"/></a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>';
    const effect = so.shadow ? '<a:effectLst><a:outerShdw blurRad="76200" dist="19050" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="18000"/></a:srgbClr></a:outerShdw></a:effectLst>' : '';
    const run = (p: { text: string; size: number; color: string; bold?: boolean }) => `<a:rPr lang="fr-FR" sz="${Math.round(Math.max(6, Math.min(60, p.size)) * 100)}" b="${p.bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${hex(p.color)}"/></a:solidFill><a:latin typeface="${xesc(font)}"/></a:rPr>`;
    const align = `<a:pPr algn="${so.align ?? 'ctr'}"/>`;
    const paras = so.link
      ? `<a:p>${align}<a:fld id="{${uuid(id)}}" type="TxLink">${run({ text: '', size: so.link.size, color: so.link.color, bold: true })}${align}<a:t>${xesc(fmtAmount(kpiCell.find((k) => k.ref === so.link!.ref)?.v ?? 0))}</a:t></a:fld><a:endParaRPr lang="fr-FR" sz="${Math.round(so.link.size * 100)}"/></a:p>`
      : (so.paras?.length ? so.paras : [{ text: '', size: 9, color: '#000000' }]).map((p) => `<a:p>${align}${p.text ? `<a:r>${run(p)}<a:t>${xesc(p.text)}</a:t></a:r>` : ''}<a:endParaRPr lang="fr-FR" sz="${Math.round(Math.max(6, p.size) * 100)}"/></a:p>`).join('');
    const hl = so.hlink ? `<a:hlinkClick xmlns:r="${NS_R}" r:id="${so.hlink}"/>` : '';
    return anchorG(
      b,
      `<xdr:sp macro="" textlink="${so.link ? xesc(so.link.ref) : ''}"><xdr:nvSpPr><xdr:cNvPr id="${id}" name="${xesc(so.name)}">${hl}</xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${wPx * EMU_PX}" cy="${hPx * EMU_PX}"/></a:xfrm>${geom}${fill}${line}${effect}</xdr:spPr><xdr:txBody><a:bodyPr vertOverflow="overflow" horzOverflow="overflow" wrap="square" lIns="45720" tIns="22860" rIns="45720" bIns="22860" anchor="${so.anchorV ?? 'ctr'}" rtlCol="0"/><a:lstStyle/>${paras}</xdr:txBody></xdr:sp>`,
    );
  };
  // Title (and subtitle) — text shapes on the measured place.
  if (spec.title) {
    const tb = { ...titleBox, c1: Math.max(titleBox.c0, titleRight) };
    parts.push(shapeXml(tb, { name: 'Titre', align: spec.title.align === 'center' ? 'ctr' : 'l', paras: [{ text: d.title, size: Math.max(11, (tb.r1 - tb.r0 + 1) * PX * 0.42), color: spec.title.color, bold: true }] }));
  }
  if (spec.subtitle && d.subtitle) parts.push(shapeXml(gb(spec.subtitle.box), { name: 'Sous-titre', align: 'l', paras: [{ text: d.subtitle, size: 8, color: spec.subtitle.color }] }));

  const charts: { xml: string; rid: string }[] = [];
  const links: { rid: string; target: string }[] = [];
  const otherSheets = [...wb.matchAll(/<sheet\b[^>]*name="([^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&')).filter((x) => x !== DASH && x !== DATA);
  let tables = 0;
  let navUsed = 0;
  spec.panels.forEach((p: Panel, i) => {
    const b = gb(p.box);
    const { kind, view, kpis } = plan[i]!;
    const wPx = (b.c1 - b.c0 + 1) * PX;
    const hPx = (b.r1 - b.r0 + 1) * PX;
    const fs = Math.max(7, Math.min(12, Math.min(hPx * 0.075, wPx * 0.045)));
    const card = () => parts.push(shapeXml(b, { name: `Carte ${i + 1}`, fill: p.fill, line: p.border, lineW: p.borderWidth, radius: p.radius, shadow: true }));
    if (kind === 'table') {
      // Real cells: header + Top N, the panel's colours; a rounded outline only (cells stay clickable).
      tables++;
      paint(b, S.get({ fill: p.fill, font }));
      const cols = d.table.columns.slice(0, 5);
      const inner = { c0: b.c0 + 1, c1: b.c1 - 1, r0: b.r0 + 1, r1: b.r1 - 1 };
      const width = inner.c1 - inner.c0 + 1;
      const share = cols.map((c, j) => (j === 0 ? 2.2 : 1));
      const total = share.reduce((a, x) => a + x, 0);
      let c = inner.c0;
      const spans = cols.map((_, j) => {
        const w = j === cols.length - 1 ? inner.c1 - c + 1 : Math.max(1, Math.round((share[j]! / total) * width));
        const s = { c0: c, c1: Math.min(inner.c1, c + w - 1) };
        c += w;
        return s;
      });
      const hd = S.get({ fill: p.colors[0] ?? spec.palette.primary, color: readableOn(p.colors[0] ?? spec.palette.primary, ['#FFFFFF', '#0F172A']), bold: true, size: 8, font, align: 'center' });
      const zebra = [S.get({ fill: p.fill, color: p.text, size: 8, font }), S.get({ fill: mixH(p.fill, p.colors[0] ?? spec.palette.primary, 0.08), color: p.text, size: 8, font })];
      const zebraN = [S.get({ fill: p.fill, color: p.text, size: 8, font, amount: true, align: 'right' }), S.get({ fill: mixH(p.fill, p.colors[0] ?? spec.palette.primary, 0.08), color: p.text, size: 8, font, amount: true, align: 'right' })];
      const rowsAvail = Math.floor((inner.r1 - inner.r0 + 1) / 2) - 1;
      spans.forEach((sp, j) => {
        for (let cc = sp.c0; cc <= sp.c1; cc++) grid.set(`${inner.r0},${cc}`, hd), grid.set(`${inner.r0 + 1},${cc}`, hd);
        values.set(`${inner.r0},${sp.c0}`, { v: cols[j]!, s: hd });
        merges.push(`${colL(sp.c0)}${inner.r0 + 1}:${colL(sp.c1)}${inner.r0 + 2}`);
        for (let k = 0; k < Math.min(topRows, rowsAvail); k++) {
          const r0 = inner.r0 + 2 + k * 2;
          const num = d.table.rows.some((row) => typeof row[j] === 'number');
          const s = (num ? zebraN : zebra)[k % 2]!;
          for (let rr = r0; rr <= r0 + 1; rr++) for (let cc = sp.c0; cc <= sp.c1; cc++) grid.set(`${rr},${cc}`, s);
          const cached = d.table.rows[k]?.[j];
          values.set(`${r0},${sp.c0}`, { f: tMeasure ? `${Q}!${colL(TOP0 + j)}${k + 2}` : undefined, v: cached === undefined ? '' : cached, s });
          merges.push(`${colL(sp.c0)}${r0 + 1}:${colL(sp.c1)}${r0 + 2}`);
        }
      });
      parts.push(shapeXml(b, { name: `Cadre ${i + 1}`, fill: null, line: p.border ?? mixH(p.fill, p.text, 0.2), lineW: Math.max(0.75, p.borderWidth), radius: p.radius }));
      return;
    }
    if (kind === 'filter' && i === filterPanel) {
      paint(b, S.get({ fill: p.fill, font }));
      parts.push(shapeXml(b, { name: `Filtres`, fill: null, line: p.border ?? mixH(p.fill, p.text, 0.2), lineW: Math.max(0.75, p.borderWidth), radius: p.radius }));
      return;
    }
    if ((kind === 'filter' || kind === 'title') && p.slots?.length && otherSheets.length) {
      // Menu items → buttons that open the other sheets.
      card();
      p.slots.slice(0, otherSheets.length).forEach((slot) => {
        const target = otherSheets[navUsed++ % otherSheets.length]!;
        const rid = `rIdLiveLink${links.length + 1}`;
        links.push({ rid, target: `#'${target.replace(/'/g, "''")}'!A1` });
        parts.push(shapeXml(gb(slot.box), { name: `Bouton ${target}`, hlink: rid, fill: mixH(p.fill, slot.color, 0.12), radius: 4, paras: [{ text: target, size: Math.max(7, fs * 0.9), color: slot.color, bold: true }] }));
      });
      return;
    }
    if (kind === 'kpi' && kpis) {
      const tiles = Math.max(1, Math.min(p.tiles, kpis.length));
      const w = (b.c1 - b.c0 + 1) / tiles;
      if (tiles === 1 || !p.tileFills?.length) card();
      kpis.slice(0, tiles).forEach((k, j) => {
        const tb: GBox = { c0: Math.round(b.c0 + j * w), c1: Math.round(b.c0 + (j + 1) * w) - 1, r0: b.r0, r1: b.r1 };
        const fill = p.tileFills?.[j] ?? p.fill;
        if (tiles > 1 && p.tileFills?.length) parts.push(shapeXml(tb, { name: `Tuile ${i + 1}.${j + 1}`, fill, radius: Math.max(3, p.radius * 0.6), shadow: true }));
        const labelC = readableOn(fill, [mixH(p.text, fill, 0.3), p.text]);
        const valueC = readableOn(fill, [p.colors[0] ?? '', p.text]);
        const hh = tb.r1 - tb.r0 + 1;
        const lab: GBox = { ...tb, r1: tb.r0 + Math.max(0, Math.round(hh * 0.38) - 1) };
        const val: GBox = { ...tb, r0: lab.r1 + 1 };
        parts.push(shapeXml(lab, { name: `Libellé ${i + 1}.${j + 1}`, anchorV: 'b', paras: [{ text: k.label.slice(0, 40), size: Math.max(7, Math.min(11, (lab.r1 - lab.r0 + 1) * PX * 0.45)), color: labelC }] }));
        const cell = kpiCell.find((x) => x.label === k.label);
        const size = Math.max(10, Math.min(28, (val.r1 - val.r0 + 1) * PX * 0.45, ((val.c1 - val.c0 + 1) * PX) / 6));
        parts.push(cell ? shapeXml(val, { name: `Indicateur ${i + 1}.${j + 1}`, anchorV: 't', link: { ref: cell.ref, size, color: valueC } }) : shapeXml(val, { name: `Indicateur ${i + 1}.${j + 1}`, anchorV: 't', paras: [{ text: k.value, size, color: valueC, bold: true }] }));
      });
      return;
    }
    if (view && ['bar', 'hbar', 'line', 'area', 'pie', 'donut'].includes(kind)) {
      card();
      const blk = blockFor(view as DataView, kind);
      const shades = colorsFor(p, blk.cats.length, fallback);
      const order = [...blk.vals.keys()].sort((a, c) => blk.vals[c]! - blk.vals[a]!);
      const colors = kind === 'pie' || kind === 'donut' ? shades : p.sequential ? blk.vals.map((_, k) => shades[order.indexOf(k)]!) : [shades[0]!, p.colors[1] ?? shades[0]!];
      const rid = `rIdLiveChart${charts.length + 1}`;
      charts.push({ rid, xml: chartXml({ kind: kind as CloneChartKind, title: (view as DataView).title.slice(0, 70), c0: blk.c0, cats: blk.cats, vals: blk.vals, valueName: (view as DataView).valueName, colors, byPoint: p.sequential && (kind === 'bar' || kind === 'hbar'), text: p.text, muted: mixH(p.text, p.fill, 0.4), font, size: fs, labels: p.valueLabels || kind === 'hbar', legend: p.legend }) });
      const inner = { c0: b.c0, c1: b.c1, r0: b.r0, r1: b.r1 };
      parts.push(anchorG(inner, `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${++sid}" name="Graphique ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="${NS_R}" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame>`, 0.6));
      return;
    }
    if (kind === 'text') {
      card();
      parts.push(shapeXml(b, { name: `Texte ${i + 1}`, align: 'l', anchorV: 't', paras: d.kpis.slice(0, 4).map((k) => ({ text: `• ${k.label} : ${k.value}`, size: fs, color: p.text })) }));
      return;
    }
    if (kind !== 'title') card();
  });
  // Filter drop-downs: a label row, then the value cell (data validation list).
  const dv: string[] = [];
  filters.forEach((f, i) => {
    const b = fBoxes[i]!;
    const lab = S.get({ color: spec.palette.dark, bold: true, size: 8, font, fill: null });
    const pill = S.get({ fill: '#FFFFFF', color: spec.palette.dark, bold: true, size: 9, font, border: spec.palette.primary, align: 'center' });
    values.set(`${b.r0},${b.c0}`, { v: f.c, s: lab });
    merges.push(`${colL(b.c0)}${b.r0 + 1}:${colL(b.c1)}${b.r0 + 1}`);
    const vr = selCell[i]!.r - 1; // 0-based row of the value cell
    for (let cc = b.c0; cc <= b.c1; cc++) grid.set(`${vr},${cc}`, pill);
    values.set(`${vr},${b.c0}`, { v: ALL, s: pill });
    merges.push(`${colL(b.c0)}${vr + 1}:${colL(b.c1)}${vr + 1}`);
    const list = `${Q}!$${colL(LIST0 + i)}$2:$${colL(LIST0 + i)}$${f.vals.length + 2}`;
    dv.push(`<dataValidation type="list" allowBlank="1" showInputMessage="1" promptTitle="${xesc(f.c.slice(0, 32))}" prompt="Choisissez une valeur : tout le tableau de bord se met à jour" sqref="${colL(b.c0)}${vr + 1}:${colL(b.c1)}${vr + 1}"><formula1>${xesc(list)}</formula1></dataValidation>`);
  });

  // ── 7. write the sheets ──────────────────────────────────────────────────────────────────────────────────────────
  const dashRows: string[] = [];
  for (let r = 0; r < R; r++) {
    const cells: string[] = [];
    for (let c = 0; c < G; c++) {
      const s = grid.get(`${r},${c}`) ?? outer;
      const v = values.get(`${r},${c}`);
      const ref = `${colL(c)}${r + 1}`;
      if (v?.f) cells.push(`<c r="${ref}" s="${v.s ?? s}"${typeof v.v === 'string' ? ' t="str"' : ''}><f>${xesc(v.f)}</f><v>${typeof v.v === 'string' ? xesc(v.v) : (v.v ?? '')}</v></c>`);
      else if (typeof v?.v === 'number') cells.push(`<c r="${ref}" s="${v.s ?? s}"><v>${v.v}</v></c>`);
      else if (typeof v?.v === 'string' && v.v) cells.push(`<c r="${ref}" s="${v.s ?? s}" t="inlineStr"><is><t>${xesc(v.v)}</t></is></c>`);
      else cells.push(`<c r="${ref}" s="${s}"/>`);
    }
    dashRows.push(`<row r="${r + 1}" ht="${ROW_PT}" customHeight="1">${cells.join('')}</row>`);
  }
  S.save();
  const dashPart = 'xl/worksheets/sheet-live-dash.xml';
  const drawing = 'xl/drawings/drawing-live-dash.xml';
  const mergeXml = merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  const dvXml = dv.length ? `<dataValidations count="${dv.length}">${dv.join('')}</dataValidations>` : '';
  wr(z, dashPart, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_R}"><sheetPr><tabColor rgb="FF${hex(spec.palette.primary)}"/><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${colL(G - 1)}${R}"/><sheetViews><sheetView showGridLines="0" showRowColHeaders="0" tabSelected="1" zoomScale="100" workbookViewId="0"><selection activeCell="${fBoxes[0] ? `${colL(fBoxes[0].c0)}${selCell[0]!.r}` : 'A1'}" sqref="${fBoxes[0] ? `${colL(fBoxes[0].c0)}${selCell[0]!.r}` : 'A1'}"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="${ROW_PT}" customHeight="1"/><cols><col min="1" max="${G}" width="${COL_W}" customWidth="1"/></cols><sheetData>${dashRows.join('')}</sheetData>${mergeXml}${dvXml}<pageMargins left="0.2" right="0.2" top="0.2" bottom="0.2" header="0.1" footer="0.1"/><pageSetup orientation="${spec.aspect >= 1 ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="1"/><drawing r:id="rIdLiveDrawing"/></worksheet>`);
  wr(z, relsOf(dashPart), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLiveDrawing" Type="${NS_R}/drawing" Target="../drawings/drawing-live-dash.xml"/></Relationships>`);
  addOverride(z, `/${dashPart}`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');
  const chartRels = charts.map((c, k) => {
    const part = `xl/charts/chart-live-${k + 1}.xml`;
    wr(z, part, c.xml);
    addOverride(z, `/${part}`, 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml');
    return `<Relationship Id="${c.rid}" Type="${NS_R}/chart" Target="../charts/chart-live-${k + 1}.xml"/>`;
  });
  const linkRels = links.map((l) => `<Relationship Id="${l.rid}" Type="${NS_R}/hyperlink" Target="${xesc(l.target)}"/>`);
  wr(z, relsOf(drawing), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${chartRels.join('')}${linkRels.join('')}</Relationships>`);
  wr(z, drawing, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${parts.join('')}</xdr:wsDr>`);
  addOverride(z, `/${drawing}`, 'application/vnd.openxmlformats-officedocument.drawing+xml');
  const dataPart = 'xl/worksheets/sheet-live-data.xml';
  const dataCols = `<cols><col min="1" max="${RAW0}" width="16" customWidth="1"/><col min="${RAW0 + 1}" max="${helperCol + 1}" width="18" customWidth="1"/></cols>`;
  wr(z, dataPart, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_R}"><sheetPr><tabColor rgb="FF94A3B8"/></sheetPr><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>${dataCols}<sheetData>${calc.xml()}</sheetData><pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.3" footer="0.3"/></worksheet>`);
  addOverride(z, `/${dataPart}`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');
  const rid = addRel(z, 'xl/_rels/workbook.xml.rels', `${NS_R}/worksheet`, 'worksheets/sheet-live-dash.xml', 'rIdLiveSheet');
  const ridData = addRel(z, 'xl/_rels/workbook.xml.rels', `${NS_R}/worksheet`, 'worksheets/sheet-live-data.xml', 'rIdLiveData');
  const ids = [...wb.matchAll(/sheetId="(\d+)"/g)].map((m) => +m[1]!);
  const sheetId = (ids.length ? Math.max(...ids) : 0) + 1;
  wb = ensureRootNs(wb, 'r', NS_R);
  wb = wb.replace(/<sheets>/, `<sheets><sheet name="${DASH}" sheetId="${sheetId}" r:id="${rid}"/>`).replace('</sheets>', `<sheet name="${xesc(DATA)}" sheetId="${sheetId + 1}" r:id="${ridData}"/></sheets>`);
  wb = wb.replace(/localSheetId="(\d+)"/g, (_m, k: string) => `localSheetId="${+k + 1}"`);
  wb = wb.replace(/activeTab="\d+"/, 'activeTab="0"').replace(/firstSheet="\d+"/, 'firstSheet="0"');
  // Formulas recomputed when the file opens (filters, SUMPRODUCT, LARGE).
  wb = /<calcPr\b/.test(wb) ? wb.replace(/<calcPr\b([^>]*?)\/>/, (_m, a: string) => `<calcPr${a.replace(/\sfullCalcOnLoad="\w+"/, '')} fullCalcOnLoad="1"/>`) : wb.replace('</workbook>', '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
  wr(z, 'xl/workbook.xml', wb);
  for (const k of Object.keys(z))
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(k) && k !== dashPart) {
      const x = rd(z, k);
      if (x.includes('tabSelected="1"')) wr(z, k, x.replace(/\s?tabSelected="1"/g, ''));
    }
  return { bytes: zipSync(z, { level: 6 }), charts: charts.length, shapes, filters: filters.map((f) => f.c), links: links.length, kpis: kpiCell.length, tables };
}

const fmtAmount = (v: number) => (Math.abs(v) >= 1e9 ? `${(v / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Md` : Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : Math.round(v).toLocaleString('fr-FR'));
const uuid = (n: number) => {
  const h = (n * 2654435761 >>> 0).toString(16).padStart(8, '0').toUpperCase();
  return `${h}-0000-4000-8000-${h}${h.slice(0, 4)}`;
};
