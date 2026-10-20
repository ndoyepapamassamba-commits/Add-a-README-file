/**
 * MAISON 2.0 ON EVERY SHEET of any workbook (the model's own openpyxl sheets included):
 *  - a band is inserted ABOVE the first table of each sheet, under its title rows: KPI cards (live SUBTOTAL formulas
 *    on the table's amount columns) then a chart zone;
 *  - the sheet's own charts move into that zone (side by side); a sheet without a chart gets native 3D charts of its
 *    table (category × first amount), fed by the table cells, so they follow any edit;
 *  - inserting rows shifts EVERYTHING that points at them: cells, formulas of every sheet, merges, filters,
 *    conditional formats, validations, hyperlinks, tables, defined names, chart ranges and drawing anchors.
 * Colours come from the given design (house palette or the chosen image's). Idempotent: a sheet that already has
 * charts above its header (data.export, a previous pass) is left as it is. Pure (zip in → zip out).
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { setActiveTheme, type Design } from './houseDesign';
import { chartXml, type ChartSpec } from './houseStyle';
import { ooxml } from './officeLogo';
import { MONEY, isTotalRow } from './tablePick';

const { addOverride, addRel, relsOf, ensureRootNs, NS_R } = ooxml;
type Zip = Record<string, Uint8Array>;
const rd = (z: Zip, p: string) => (z[p] ? strFromU8(z[p]!) : '');
const wr = (z: Zip, p: string, s: string) => {
  z[p] = strToU8(s);
};
const xesc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
export const colName = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const colIdx = (letters: string) => [...letters.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const resolve = (from: string, target: string) => {
  if (target.startsWith('/')) return target.slice(1);
  const parts = from.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
};
/** Amounts only: a rate, a share or a coverage is never summed in a card. */
const RATE = /taux|%|couverture|ratio|\bpart\b|pourcent|moyenne|average|rate/i;
/** First column of a listing (one row per indicator, check, source…), not of data. */
const LISTING = /^(indicateur|contr[oô]le|crit[eè]re|[ée]l[ée]ment|param[eè]tre|r[ée]f[ée]rence|source|m[ée]thode|hypoth[eè]se|question|libell[ée]|rubrique|poste|ligne|kpi|mesure|n°)/i;

// ── reference shifting (rows inserted at `from`, `n` of them) ────────────────────────────────────────────────────────
const shiftRow = (r: number, from: number, n: number) => (r >= from ? r + n : r);
/** A1 / $A$1 / A1:B9 / 3:7 — no sheet prefix. */
export function shiftRef(ref: string, from: number, n: number): string {
  return ref.replace(/(\$?[A-Z]{1,3})?(\$?)(\d+)/g, (m, c: string | undefined, d: string, r: string) => `${c ?? ''}${d}${shiftRow(+r, from, n)}`);
}
/**
 * Shifts the references of a formula that point at `sheet`: qualified ones always, unqualified ones when the formula
 * lives on that sheet (`own`). String literals, function names (LOG10() and whole columns are left alone.
 */
export function shiftFormula(f: string, sheet: string, own: boolean, from: number, n: number): string {
  let out = '';
  let i = 0;
  const re = /(?:('(?:[^']|'')+'|[A-Za-z_À-ɏ][\w.À-ɏ]*)!)?(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?|\$?\d+:\$?\d+)(?![\w(!])/gy;
  while (i < f.length) {
    const ch = f[i]!;
    if (ch === '"') {
      const j = f.indexOf('"', i + 1);
      const end = j < 0 ? f.length : j + 1;
      out += f.slice(i, end);
      i = end;
      continue;
    }
    const prev = i > 0 ? f[i - 1]! : '';
    if (!/[\w.$]/.test(prev)) {
      re.lastIndex = i;
      const m = re.exec(f);
      if (m) {
        const q = m[1];
        const name = q ? (q.startsWith("'") ? q.slice(1, -1).replace(/''/g, "'") : q) : null;
        const hit = name === null ? own : name === sheet;
        out += hit ? `${q ? `${q}!` : ''}${shiftRef(m[2]!, from, n)}` : m[0];
        i += m[0].length;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

export interface SheetInfo {
  name: string;
  part: string;
  index: number;
}
export function sheetsOf(z: Zip): SheetInfo[] {
  const wb = rd(z, 'xl/workbook.xml');
  const rels = rd(z, 'xl/_rels/workbook.xml.rels');
  const out: SheetInfo[] = [];
  [...wb.matchAll(/<sheet\b[^>]*\/?>/g)].forEach((m, index) => {
    const name = unesc(/name="([^"]*)"/.exec(m[0])?.[1] ?? '');
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    const rel = rid ? new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*/>`).exec(rels)?.[0] : undefined;
    const t = rel ? /Target="([^"]+)"/.exec(rel)?.[1] : undefined;
    if (t) out.push({ name, part: resolve('xl/workbook.xml', t), index });
  });
  return out;
}
/** Drawing part of a sheet (if any). */
export function drawingOf(z: Zip, part: string): string | null {
  const x = rd(z, part);
  const rid = /<drawing\b[^>]*\br:id="([^"]+)"/.exec(x)?.[1];
  if (!rid) return null;
  const rel = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*/>`).exec(rd(z, relsOf(part)))?.[0];
  const t = rel ? /Target="([^"]+)"/.exec(rel)?.[1] : undefined;
  return t ? resolve(part, t) : null;
}

/** Inserts `n` rows before row `from` on `sh`, everywhere in the workbook. */
export function insertRows(z: Zip, sh: SheetInfo, from: number, n: number): void {
  const sheets = sheetsOf(z);
  // 1. the sheet itself
  let x = rd(z, sh.part);
  x = x.replace(/<row\b([^>]*?)\br="(\d+)"/g, (_m, a: string, r: string) => `<row${a}r="${shiftRow(+r, from, n)}"`);
  x = x.replace(/<c\b([^>]*?)\br="([A-Z]+)(\d+)"/g, (_m, a: string, c: string, r: string) => `<c${a}r="${c}${shiftRow(+r, from, n)}"`);
  x = x.replace(/<f\b([^>]*?)(?<!\/)>([\s\S]*?)<\/f>/g, (_m, a: string, f: string) => `<f${a.replace(/\bref="([^"]+)"/, (_q, ref: string) => `ref="${shiftRef(ref, from, n)}"`)}>${xesc(shiftFormula(unesc(f), sh.name, true, from, n))}</f>`);
  x = x.replace(/<f\b([^>]*?)\/>/g, (_m, a: string) => `<f${a.replace(/\bref="([^"]+)"/, (_q, ref: string) => `ref="${shiftRef(ref, from, n)}"`)}/>`);
  x = x.replace(/<(mergeCell|autoFilter|hyperlink|dimension|sortState|sortCondition)\b([^>]*?)\bref="([^"]+)"/g, (_m, t: string, a: string, ref: string) => `<${t}${a}ref="${shiftRef(ref, from, n)}"`);
  x = x.replace(/\bsqref="([^"]+)"/g, (_m, ref: string) => `sqref="${shiftRef(ref, from, n)}"`);
  x = x.replace(/\bactiveCell="([^"]+)"/g, (_m, ref: string) => `activeCell="${shiftRef(ref, from, n)}"`);
  x = x.replace(/<(formula|formula1|formula2)>([\s\S]*?)<\/\1>/g, (_m, t: string, f: string) => `<${t}>${xesc(shiftFormula(unesc(f), sh.name, true, from, n))}</${t}>`);
  x = x.replace(/<brk\b([^>]*?)\bid="(\d+)"/g, (_m, a: string, r: string) => `<brk${a}id="${+r + 1 >= from ? +r + n : r}"`);
  // A frozen pane at the old header would freeze title + band + header: the band replaces it.
  if (/<pane\b/.test(x)) x = x.replace(/<pane\b[^>]*\/>/g, '').replace(/(<selection\b[^>]*\/>)+/, '<selection activeCell="A1" sqref="A1"/>');
  wr(z, sh.part, x);
  // 2. formulas of the other sheets, defined names, charts, tables
  for (const o of sheets) {
    if (o.part === sh.part) continue;
    const ox = rd(z, o.part);
    if (!ox.includes('<f')) continue;
    wr(z, o.part, ox.replace(/<f\b([^>]*?)(?<!\/)>([\s\S]*?)<\/f>/g, (_m, a: string, f: string) => `<f${a}>${xesc(shiftFormula(unesc(f), sh.name, false, from, n))}</f>`));
  }
  const wb = rd(z, 'xl/workbook.xml');
  wr(
    z,
    'xl/workbook.xml',
    wb.replace(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g, (_m, a: string, f: string) => {
      const local = /localSheetId="(\d+)"/.exec(a);
      return `<definedName${a}>${xesc(shiftFormula(unesc(f), sh.name, local ? +local[1]! === sh.index : false, from, n))}</definedName>`;
    }),
  );
  for (const p of Object.keys(z)) {
    if (/^xl\/charts\/chart[^/]*\.xml$/.test(p)) {
      const c = rd(z, p);
      // openpyxl writes its charts in the default namespace: <f>, not <c:f>.
      if (/<(c:)?f>/.test(c)) wr(z, p, c.replace(/<((?:c:)?)f>([\s\S]*?)<\/\1f>/g, (_m, pre: string, f: string) => `<${pre}f>${xesc(shiftFormula(unesc(f), sh.name, false, from, n))}</${pre}f>`));
    }
  }
  for (const t of [...rd(z, relsOf(sh.part)).matchAll(/Target="([^"]+)"/g)].map((m) => resolve(sh.part, m[1]!))) {
    if (/tables\/[^/]+\.xml$/.test(t) && z[t]) wr(z, t, rd(z, t).replace(/\bref="([^"]+)"/g, (_m, ref: string) => `ref="${shiftRef(ref, from, n)}"`));
  }
  // 3. drawing anchors at or below the insertion row (0-based rows)
  const dp = drawingOf(z, sh.part);
  if (dp) wr(z, dp, rd(z, dp).replace(/<((?:xdr:)?)row>(\d+)<\/\1row>/g, (_m, p: string, r: string) => `<${p}row>${+r >= from - 1 ? +r + n : r}</${p}row>`));
}

// ── reading a sheet ──────────────────────────────────────────────────────────────────────────────────────────────────
export interface Cell {
  col: number;
  row: number;
  v: string | number | null;
  formula: boolean;
}
export function sharedStrings(z: Zip): string[] {
  const x = rd(z, 'xl/sharedStrings.xml');
  return [...x.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unesc([...m[1]!.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
}
export function readRows(x: string, sst: string[]): Map<number, Cell[]> {
  const rows = new Map<number, Cell[]>();
  for (const rm of x.matchAll(/<row\b[^>]*?\br="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = +rm[1]!;
    const cells: Cell[] = [];
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+)(\d+)"/.exec(cm[1]!);
      if (!ref) continue;
      const t = /\bt="(\w+)"/.exec(cm[1]!)?.[1];
      const body = cm[2] ?? '';
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let v: string | number | null = null;
      if (t === 's') v = raw != null ? (sst[+raw] ?? '') : null;
      else if (t === 'inlineStr') v = unesc([...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((k) => k[1]).join(''));
      else if (t === 'str' || t === 'e') v = raw != null ? unesc(raw) : null;
      else if (t === 'b') v = raw != null ? +raw : null;
      else if (raw != null && raw !== '') v = Number(raw);
      if (typeof v === 'string' && !v.trim()) v = null;
      cells.push({ col: colIdx(ref[1]!), row: r, v, formula: body.includes('<f') });
    }
    rows.set(r, cells);
  }
  return rows;
}
export interface Table {
  header: number;
  first: number;
  last: number;
  cols: { col: number; name: string; num: boolean }[];
  catCol: number | null;
  measures: { col: number; name: string }[];
  lastCol: number;
}
/** First table of the sheet: a header of texts followed by rows holding numbers; the TOTAL row is left out. */
export function findTable(rows: Map<number, Cell[]>): Table | null {
  const keys = [...rows.keys()].sort((a, b) => a - b);
  for (let k = 0; k < Math.min(keys.length - 2, 40); k++) {
    const head = rows.get(keys[k]!)!.filter((c) => c.v !== null);
    const texts = head.filter((c) => typeof c.v === 'string');
    const next = rows.get(keys[k + 1]!)!;
    if (texts.length < 2 || texts.length < head.length * 0.6 || keys[k + 1] !== keys[k]! + 1 || !next.some((c) => typeof c.v === 'number' && !c.formula)) continue;
    const header = keys[k]!;
    let last = header;
    for (let r = header + 1; rows.has(r) && rows.get(r)!.some((c) => c.v !== null); r++) last = r;
    const body = Array.from({ length: last - header }, (_, i) => rows.get(header + 1 + i)!);
    const asObj = (cells: Cell[]) => Object.fromEntries(cells.map((c) => [String(c.col), c.v]));
    while (last > header && isTotalRow(asObj(rows.get(last)!))) last--;
    const data = body.slice(0, last - header).filter((cells) => !isTotalRow(asObj(cells)));
    if (data.length < 2) return null;
    const cols = texts.map((c) => {
      const vals = data.map((cells) => cells.find((x) => x.col === c.col)?.v ?? null).filter((v) => v !== null);
      return { col: c.col, name: String(c.v).trim(), num: vals.length > 0 && vals.filter((v) => typeof v === 'number').length >= vals.length * 0.6 };
    });
    const measures = cols.filter((c) => c.num && MONEY.test(c.name) && !RATE.test(c.name)).map(({ col, name }) => ({ col, name }));
    const cat = cols.find((c) => !c.num && new Set(data.map((cells) => cells.find((x) => x.col === c.col)?.v ?? null).filter((v) => v !== null)).size >= 2);
    const lastCol = Math.max(...[...rows.values()].flat().map((c) => c.col), ...cols.map((c) => c.col));
    return { header, first: header + 1, last, cols, catCol: cat?.col ?? null, measures, lastCol };
  }
  return null;
}

// ── styles for the band ──────────────────────────────────────────────────────────────────────────────────────────
export interface BandStyles {
  label: number[];
  /** Big value, Md / M format (amounts ≥ 1 Md). */
  value: number[];
  /** Big value, M / k format (the usual case: « 865,1 k », « 2,2 M »). */
  valueK: number[];
  spacer: number;
  /** Sommaire sheet: navy band, title on it, subtitle, hyperlink, number (k / M), header. */
  band: number;
  title: number;
  sub: number;
  link: number;
  num: number;
}
function bandStyles(z: Zip, d: Design): BandStyles {
  let st = rd(z, 'xl/styles.xml');
  const append = (tag: string, item: string): number => {
    const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`);
    const m = re.exec(st);
    if (!m) {
      const self = new RegExp(`<${tag}\\b[^>]*/>`);
      st = self.test(st) ? st.replace(self, `<${tag} count="1">${item}</${tag}>`) : st.replace('</styleSheet>', `<${tag} count="1">${item}</${tag}></styleSheet>`);
      return 0;
    }
    const n = (m[2]!.match(new RegExp(`<${tag.slice(0, -1)}\\b`, 'g')) ?? []).length;
    st = st.replace(re, `<${tag}${/count="\d+"/.test(m[1]!) ? m[1]!.replace(/count="\d+"/, `count="${n + 1}"`) : `${m[1]} count="${n + 1}"`}>${m[2]}${item}</${tag}>`);
    return n;
  };
  const c = d.color;
  const font = (color: string, bold: boolean, size: number, face: string) => `<font>${bold ? '<b/>' : ''}<sz val="${size}"/><color rgb="FF${color}"/><name val="${xesc(face)}"/></font>`;
  const fill = (color: string) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`;
  const line = `<color rgb="FF${c.line}"/>`;
  // CARD LOOK (the best dashboards: white cards on a soft canvas, one accent edge, a soft base line, big number).
  const border = (accent: string) => `<border><left style="thick"><color rgb="FF${accent}"/></left><right style="thin">${line}</right><top style="thin">${line}</top><bottom/><diagonal/></border>`;
  const box = `<border><left style="thick"><color rgb="FF${c.line}"/></left><right style="thin">${line}</right><top/><bottom style="medium">${line}</bottom><diagonal/></border>`;
  // numFmts for amounts: Md / M (≥ 1 Md) and M / k (the ExcelDemy card format — Excel allows two conditions).
  const fm = /<numFmts\b[^>]*>([\s\S]*?)<\/numFmts>/.exec(st);
  const code = '[&gt;=1000000000]#,##0.0,,,&quot; Md&quot;;[&gt;=1000000]#,##0.0,,&quot; M&quot;;#,##0';
  const codeK = '[&gt;=1000000]#,##0.0,,&quot; M&quot;;[&gt;=1000]#,##0.0,&quot; k&quot;;#,##0';
  const ids = [...(fm?.[1] ?? '').matchAll(/numFmtId="(\d+)"/g)].map((m) => +m[1]!);
  const fmtId = Math.max(175, ...ids) + 1;
  const fmtK = fmtId + 1;
  const item = `<numFmt numFmtId="${fmtId}" formatCode="${code}"/><numFmt numFmtId="${fmtK}" formatCode="${codeK}"/>`;
  if (fm) st = st.replace(/<numFmts\b([^>]*)>([\s\S]*?)<\/numFmts>/, (_m, a: string, b: string) => `<numFmts${a.replace(/count="\d+"/, `count="${ids.length + 2}"`)}>${b}${item}</numFmts>`);
  else st = st.replace(/<styleSheet\b([^>]*)>/, `<styleSheet$1><numFmts count="2">${item}</numFmts>`);
  const accents = [c.blue, c.gold, c.navy, c.cyan];
  const xfs: string[] = [];
  const xf = (fontId: number, fillId: number, borderId: number, numFmt = 0, extra = '<alignment horizontal="center" vertical="center" wrapText="1"/>') =>
    `<xf numFmtId="${numFmt}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${extra}</xf>`;
  const fLabel = append('fonts', font(c.text2, true, 8.5, d.font.ui));
  const fValue = append('fonts', font(c.navy, true, 18, d.font.mono));
  const fTitle = append('fonts', font('FFFFFF', true, 16, d.font.ui));
  const fSub = append('fonts', font(c.text2, false, 9, d.font.ui));
  const fLink = append('fonts', `<font><u/><sz val="11"/><color rgb="FF${c.blue}"/><name val="${xesc(d.font.ui)}"/></font>`);
  const fNum = append('fonts', font(c.navy, true, 11, d.font.mono));
  const fPanel = append('fills', fill(c.panel));
  const fWhite = append('fills', fill('FFFFFF'));
  const fNavy = append('fills', fill(c.navy));
  const label: number[] = [];
  const value: number[] = [];
  const valueK: number[] = [];
  const base = (/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(st)?.[1]!.match(/<xf\b/g) ?? []).length;
  for (const a of accents) {
    const bTop = append('borders', border(a));
    label.push(base + xfs.length);
    xfs.push(xf(fLabel, fWhite, bTop, 0, '<alignment horizontal="left" vertical="center" indent="1" wrapText="1"/>'));
    // The accent edge continues on the value cell: one card, not two cells.
    const bVal = append('borders', box.replace(`<left style="thick"><color rgb="FF${c.line}"/></left>`, `<left style="thick"><color rgb="FF${a}"/></left>`));
    value.push(base + xfs.length);
    xfs.push(xf(fValue, fWhite, bVal, fmtId, '<alignment horizontal="left" vertical="center" indent="1"/>'));
    valueK.push(base + xfs.length);
    xfs.push(xf(fValue, fWhite, bVal, fmtK, '<alignment horizontal="left" vertical="center" indent="1"/>'));
  }
  const spacer = base + xfs.length;
  // The canvas: the soft panel colour around the cards and under the charts (the cards and charts read as objects).
  xfs.push(xf(0, fPanel, 0, 0, ''));
  const band = base + xfs.length;
  xfs.push(xf(0, fNavy, 0, 0, ''));
  const title = base + xfs.length;
  xfs.push(xf(fTitle, fNavy, 0, 0, '<alignment horizontal="left" vertical="center" indent="1"/>'));
  const sub = base + xfs.length;
  xfs.push(xf(fSub, fWhite, 0, 0, '<alignment horizontal="left" vertical="center" indent="1" wrapText="1"/>'));
  const link = base + xfs.length;
  xfs.push(xf(fLink, fWhite, 0, 0, '<alignment horizontal="left" vertical="center" indent="1"/>'));
  const num = base + xfs.length;
  xfs.push(xf(fNum, fWhite, 0, fmtK, '<alignment horizontal="right" vertical="center" indent="1"/>'));
  st = st.replace(/<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/, (_m, a: string, b: string) => `<cellXfs${a.replace(/count="\d+"/, `count="${base + xfs.length}"`)}>${b}${xfs.join('')}</cellXfs>`);
  // Font children in schema order (openpyxl writes <name> first): a strict reader opens the file without repair.
  const ORDER = ['b', 'i', 'strike', 'condense', 'extend', 'outline', 'shadow', 'u', 'vertAlign', 'sz', 'color', 'name', 'family', 'charset', 'scheme'];
  st = st.replace(/<font>((?:<\w+\b[^>]*\/>)+)<\/font>/g, (_m, kids: string) => `<font>${[...kids.matchAll(/<(\w+)\b[^>]*\/>/g)].sort((a, b) => ORDER.indexOf(a[1]!) - ORDER.indexOf(b[1]!)).map((k) => k[0]).join('')}</font>`);
  wr(z, 'xl/styles.xml', st);
  return { label, value, valueK, spacer, band, title, sub, link, num };
}

// ── geometry ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const EMU_PX = 9525;
function colWidthsPx(x: string, upto: number): number[] {
  const def = Number(/<sheetFormatPr\b[^>]*defaultColWidth="([\d.]+)"/.exec(x)?.[1] ?? 8.43);
  const w = Array.from({ length: upto + 1 }, () => def);
  for (const m of x.matchAll(/<col\b([^>]*)\/>/g)) {
    const a = m[1]!;
    const min = +(/min="(\d+)"/.exec(a)?.[1] ?? 0);
    const max = +(/max="(\d+)"/.exec(a)?.[1] ?? 0);
    const width = Number(/width="([\d.]+)"/.exec(a)?.[1] ?? def);
    const hidden = /hidden="(1|true)"/.test(a);
    for (let c = min; c <= Math.min(max, upto + 1); c++) w[c - 1] = hidden ? 0 : width;
  }
  return w.map((ch) => Math.round(ch * 7 + 5));
}
/** Column + offset (EMU) of a horizontal position in px. */
function atX(widths: number[], xPx: number): { col: number; off: number } {
  let acc = 0;
  for (let c = 0; c < widths.length; c++) {
    if (xPx < acc + widths[c]!) return { col: c, off: Math.round((xPx - acc) * EMU_PX) };
    acc += widths[c]!;
  }
  return { col: widths.length - 1, off: Math.round(widths[widths.length - 1]! * EMU_PX) };
}
const anchorXml = (p: string, from: { col: number; off: number; row: number }, to: { col: number; off: number; row: number }, body: string) =>
  `<${p}twoCellAnchor editAs="oneCell"><${p}from><${p}col>${from.col}</${p}col><${p}colOff>${from.off}</${p}colOff><${p}row>${from.row}</${p}row><${p}rowOff>0</${p}rowOff></${p}from><${p}to><${p}col>${to.col}</${p}col><${p}colOff>${to.off}</${p}colOff><${p}row>${to.row}</${p}row><${p}rowOff>0</${p}rowOff></${p}to>${body}<${p}clientData/></${p}twoCellAnchor>`;

export interface MaisonResult {
  bytes: Uint8Array;
  /** Sheets that received the band (KPI cards + charts above their table). */
  banded: string[];
  /** Charts moved above a table / created. */
  moved: number;
  created: number;
  /** Native sparklines placed in « PROFIL » cards. */
  sparklines: number;
  /** A Sommaire sheet (links, live counts and totals) was (re)built first. */
  sommaire: boolean;
}
const CHART_ROWS = 15;
const CHART_ROW_PT = 18;

/** The band on every eligible sheet; `skip` = sheets left untouched (the app's own). */
export function maisonBand(bytes: Uint8Array, design: Design, skip: ReadonlySet<string> = new Set()): MaisonResult | null {
  let z: Zip;
  try {
    z = unzipSync(bytes);
  } catch {
    return null;
  }
  if (!z['xl/workbook.xml'] || !z['xl/styles.xml']) return null;
  const sst = sharedStrings(z);
  const banded: string[] = [];
  let moved = 0;
  let created = 0;
  let sparklines = 0;
  let styles: BandStyles | null = null;
  for (const sh of sheetsOf(z)) {
    if (skip.has(sh.name) || isSommaire(sh.name) || !z[sh.part]) continue;
    const x0 = rd(z, sh.part);
    if (!/<sheetData>/.test(x0)) continue;
    const rows = readRows(x0, sst);
    const t = findTable(rows);
    // A band needs amounts. A list of indicators / checks / sources mixes units: summing it would mean nothing.
    if (!t || !t.measures.length || LISTING.test(t.cols[0]?.name ?? '')) continue;
    // Charts already above the header (data.export, a previous pass): this sheet is already Maison 2.0.
    const dp0 = drawingOf(z, sh.part);
    const d0 = dp0 ? rd(z, dp0) : '';
    const frames = [...d0.matchAll(/<((?:xdr:)?)(oneCellAnchor|twoCellAnchor|absoluteAnchor)\b[^>]*>([\s\S]*?)<\/\1\2>/g)].filter((m) => /graphicFrame/.test(m[3]!));
    const rowOf = (a: string) => +(/<(?:xdr:)?row>(\d+)</.exec(a)?.[1] ?? 1e9);
    const aboveHeader = [...x0.matchAll(/<row\b[^>]*?\br="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)].some((m) => +m[1]! < t.header && /SUBTOTAL\(/.test(m[2] ?? ''));
    if (frames.some((m) => rowOf(m[3]!) < t.header - 1) || aboveHeader) continue;
    // Title rows: leading rows with one value at most (title, subtitle, a band filler).
    let T = 0;
    for (let r = 1; r < t.header && r <= 3; r++) {
      const vals = (rows.get(r) ?? []).filter((c) => c.v !== null);
      if (vals.length <= 1) T = r;
      else break;
    }
    const at = T + 1;
    const cards = t.measures.slice(0, 3);
    const canChart = t.catCol !== null && t.measures.length > 0;
    const keep = frames.slice(0, 3);
    const chartZone = canChart || keep.length > 0;
    const n = 4 + (chartZone ? CHART_ROWS + 1 : 0);
    insertRows(z, sh, at, n);
    const first = t.first + n;
    const last = t.last + n;
    styles ??= bandStyles(z, design);
    // KPI cards: row count + up to three amounts, each card spanning an equal share of the used columns.
    const used = Math.max(t.lastCol, ...t.cols.map((c) => c.col)) + 1;
    const kpis: { label: string; f: string; v: number }[] = [];
    const vals = (col: number) => {
      let s = 0;
      for (let r = t.first; r <= t.last; r++) {
        const v = rows.get(r)?.find((c) => c.col === col)?.v;
        if (typeof v === 'number') s += v;
      }
      return s;
    };
    const countCol = t.catCol ?? t.cols[0]!.col;
    kpis.push({ label: 'LIGNES', f: `SUBTOTAL(3,${colName(countCol)}${first}:${colName(countCol)}${last})`, v: t.last - t.first + 1 });
    for (const m of cards) kpis.push({ label: m.name.toUpperCase(), f: `SUBTOTAL(9,${colName(m.col)}${first}:${colName(m.col)}${last})`, v: vals(m.col) });
    // PROFILE card: a native column sparkline over the first amount (the shape of the table at a glance).
    const sparkable = cards[0] && t.last - t.first + 1 >= 3 && t.last - t.first + 1 <= 500 && used >= kpis.length + 1;
    if (sparkable) kpis.push({ label: `PROFIL · ${cards[0]!.name.toUpperCase()}`, f: '', v: 0 });
    const k = Math.min(kpis.length, Math.max(1, used));
    let sparkRef = '';
    const span = Math.max(1, Math.floor(used / k));
    let x = rd(z, sh.part);
    const rowLabel = at + 1;
    const rowValue = at + 2;
    const cellsL: string[] = [];
    const cellsV: string[] = [];
    const merges: string[] = [];
    for (let i = 0; i < k; i++) {
      const c0 = i * span;
      const c1 = i === k - 1 ? Math.max(c0, used - 1) : c0 + span - 1;
      // Md / M for amounts of a billion or more, M / k otherwise (« 865,1 k », « 2,2 M » — the exact value stays in the cell).
      const vs = (kpis[i]!.v >= 1e9 ? styles.value : styles.valueK)[i % 4]!;
      if (!kpis[i]!.f) sparkRef = `${colName(c0)}${rowValue}`;
      for (let c = c0; c <= c1; c++) {
        cellsL.push(c === c0 ? `<c r="${colName(c)}${rowLabel}" s="${styles.label[i % 4]}" t="inlineStr"><is><t>${xesc(kpis[i]!.label.slice(0, 60))}</t></is></c>` : `<c r="${colName(c)}${rowLabel}" s="${styles.label[i % 4]}"/>`);
        cellsV.push(c === c0 && kpis[i]!.f ? `<c r="${colName(c)}${rowValue}" s="${vs}"><f>${xesc(kpis[i]!.f)}</f><v>${kpis[i]!.v}</v></c>` : `<c r="${colName(c)}${rowValue}" s="${vs}"/>`);
      }
      if (c1 > c0) merges.push(`<mergeCell ref="${colName(c0)}${rowLabel}:${colName(c1)}${rowLabel}"/>`, `<mergeCell ref="${colName(c0)}${rowValue}:${colName(c1)}${rowValue}"/>`);
    }
    const canvas = (r: number) => Array.from({ length: used }, (_, cc) => `<c r="${colName(cc)}${r}" s="${styles!.spacer}"/>`).join('');
    // Between the cards: a canvas gutter (the cards stay separate objects, like the best dashboards' 12-column grid).
    const gutter = new Set<number>();
    for (let i = 1; i < k; i++) gutter.add(i * span - 1);
    const withGutter = (cells: string[]) => cells.map((cell, idx) => (gutter.has(idx) && !/t="inlineStr"|<f>/.test(cell) ? cell.replace(/ s="\d+"/, ` s="${styles!.spacer}"`) : cell));
    const bandRows = [`<row r="${at}" ht="10" customHeight="1">${canvas(at)}</row>`, `<row r="${rowLabel}" ht="22" customHeight="1">${withGutter(cellsL).join('')}</row>`, `<row r="${rowValue}" ht="44" customHeight="1">${withGutter(cellsV).join('')}</row>`, `<row r="${at + 3}" ht="12" customHeight="1">${canvas(at + 3)}</row>`];
    if (chartZone) for (let r = at + 4; r < at + 4 + CHART_ROWS; r++) bandRows.push(`<row r="${r}" ht="${CHART_ROW_PT}" customHeight="1">${canvas(r)}</row>`);
    if (chartZone) bandRows.push(`<row r="${at + 4 + CHART_ROWS}" ht="12" customHeight="1">${canvas(at + 4 + CHART_ROWS)}</row>`);
    // Rows are kept in order: the band goes right before the first row at or after `at + n`.
    x = x.replace(/<sheetData>([\s\S]*?)<\/sheetData>/, (_m, body: string) => {
      const parts = [...body.matchAll(/<row\b[^>]*?\br="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)].map((m) => ({ r: +m[1]!, xml: m[0] }));
      const before = parts.filter((p) => p.r < at).map((p) => p.xml);
      const after = parts.filter((p) => p.r >= at).map((p) => p.xml);
      return `<sheetData>${before.join('')}${bandRows.join('')}${after.join('')}</sheetData>`;
    });
    if (merges.length) x = /<mergeCells\b/.test(x) ? x.replace(/<mergeCells\b([^>]*)>/, (_m, a: string) => `<mergeCells${a.replace(/count="\d+"/, '')}>${merges.join('')}`) : x.replace(/(<\/sheetData>)/, `$1<mergeCells>${merges.join('')}</mergeCells>`);
    x = x.replace(/<mergeCells\b([^>]*)>([\s\S]*?)<\/mergeCells>/, (_m, a: string, b: string) => `<mergeCells${a.replace(/\s*count="\d+"/, '')} count="${(b.match(/<mergeCell\b/g) ?? []).length}">${b}</mergeCells>`);
    // mergeCells must follow sheetData / sheetProtection… and come before conditionalFormatting etc. — it was placed
    // right after sheetData when absent, which is a valid position unless sheetCalcPr / protection follow: move them.
    x = x.replace(/(<\/sheetData>)(<mergeCells\b[\s\S]*?<\/mergeCells>)((?:<sheetCalcPr\b[^>]*\/>)?(?:<sheetProtection\b[^>]*\/>)?(?:<protectedRanges>[\s\S]*?<\/protectedRanges>)?(?:<scenarios\b[\s\S]*?<\/scenarios>)?(?:<autoFilter\b[\s\S]*?(?:\/>|<\/autoFilter>))?(?:<sortState\b[\s\S]*?(?:\/>|<\/sortState>))?(?:<dataConsolidate\b[\s\S]*?(?:\/>|<\/dataConsolidate>))?(?:<customSheetViews>[\s\S]*?<\/customSheetViews>)?)/, '$1$3$2');
    // DATA BARS on the first amount column (a glance shows the weight of each row), in the theme's primary colour.
    if (cards[0]) {
      const col = colName(cards[0].col);
      const cf = `<conditionalFormatting sqref="${col}${first}:${col}${last}"><cfRule type="dataBar" priority="1"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="FF${design.color.blue}"/></dataBar></cfRule></conditionalFormatting>`;
      if (!/<conditionalFormatting\b/.test(x)) {
        const before = /<(dataValidations|hyperlinks|printOptions|pageMargins|pageSetup|headerFooter|rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/.exec(x);
        x = before ? x.slice(0, before.index) + cf + x.slice(before.index) : x.replace('</worksheet>', `${cf}</worksheet>`);
      }
    }
    if (sparkRef && cards[0]) {
      // Sparkline (x14 extension, last child of the worksheet): series in the primary colour, peak in gold, low in red.
      const col = colName(cards[0].col);
      const q = `'${sh.name.replace(/'/g, "''")}'`;
      const ext = `<ext uri="{05C60535-1F16-4fd2-B633-F4F36F0B64E0}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:sparklineGroups xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"><x14:sparklineGroup type="column" displayEmptyCellsAs="gap" high="1" low="1"><x14:colorSeries rgb="FF${design.color.blue}"/><x14:colorNegative rgb="FF${design.color.risk}"/><x14:colorAxis rgb="FF${design.color.line}"/><x14:colorMarkers rgb="FF${design.color.blue}"/><x14:colorFirst rgb="FF${design.color.blue}"/><x14:colorLast rgb="FF${design.color.blue}"/><x14:colorHigh rgb="FF${design.color.gold}"/><x14:colorLow rgb="FF${design.color.risk}"/><x14:sparklines><x14:sparkline><xm:f>${xesc(`${q}!$${col}$${first}:$${col}$${last}`)}</xm:f><xm:sqref>${sparkRef}</xm:sqref></x14:sparkline></x14:sparklines></x14:sparklineGroup></x14:sparklineGroups></ext>`;
      x = /<extLst>/.test(x) ? x.replace(/<\/extLst>\s*<\/worksheet>/, `${ext}</extLst></worksheet>`) : x.replace(/<\/worksheet>\s*$/, `<extLst>${ext}</extLst></worksheet>`);
      sparklines++;
    }
    wr(z, sh.part, x);
    banded.push(sh.name);
    if (!chartZone) continue;
    // Chart zone: the sheet's own charts move there; without any, native 3D charts of its table are created.
    const widths = colWidthsPx(x, used);
    const totalW = widths.slice(0, used).reduce((a, b) => a + b, 0);
    const z0 = at + 3; // 0-based first row of the zone (row at+4)
    let dp = drawingOf(z, sh.part);
    const place = (i: number, count: number) => {
      const gap = 12;
      const w = (totalW - gap * (count - 1)) / count;
      const fx = atX(widths, i * (w + gap));
      const tx = atX(widths, i * (w + gap) + w);
      return { from: { ...fx, row: z0 }, to: { ...tx, row: z0 + CHART_ROWS } };
    };
    if (keep.length && dp) {
      let dx = rd(z, dp);
      keep.forEach((m, i) => {
        const p = m[1]!;
        const frame = new RegExp(`<${p.replace(':', '\\:')}graphicFrame\\b[\\s\\S]*?<\\/${p.replace(':', '\\:')}graphicFrame>`).exec(m[3]!)?.[0];
        if (!frame) return;
        const g = place(i, keep.length);
        // The anchor text was shifted with the rows: find it again by its graphic frame.
        const cur = [...dx.matchAll(/<((?:xdr:)?)(oneCellAnchor|twoCellAnchor|absoluteAnchor)\b[^>]*>([\s\S]*?)<\/\1\2>/g)].find((a) => a[3]!.includes(frame));
        if (!cur) return;
        dx = dx.replace(cur[0], anchorXml(p, g.from, g.to, frame));
        moved++;
      });
      wr(z, dp, dx);
    } else if (canChart) {
      const catVals: string[] = [];
      const serVals: number[] = [];
      for (let r = t.first; r <= t.last; r++) {
        const cells = rows.get(r) ?? [];
        catVals.push(String(cells.find((c) => c.col === t.catCol)?.v ?? ''));
        const v = cells.find((c) => c.col === t.measures[0]!.col)?.v;
        serVals.push(typeof v === 'number' ? v : 0);
      }
      const specs: ChartSpec[] = [];
      const base = { sheet: sh.name, first, last, anchorCol: 0, anchorRow: z0, cat: { col: t.catCol!, name: t.cols.find((c) => c.col === t.catCol)?.name ?? '', values: catVals }, series: [{ col: t.measures[0]!.col, name: t.measures[0]!.name, values: serVals }] };
      specs.push({ ...base, kind: catVals.length > 10 ? 'hbar3d' : 'bar3d', title: `${t.measures[0]!.name} par ${base.cat.name}`.slice(0, 80) });
      if (catVals.length <= 8 && serVals.every((v) => v >= 0) && serVals.some((v) => v > 0)) specs.push({ ...base, kind: 'pie3d', title: `Répartition — ${t.measures[0]!.name}`.slice(0, 80) });
      if (t.measures[1]) {
        const v2: number[] = [];
        for (let r = t.first; r <= t.last; r++) {
          const v = rows.get(r)?.find((c) => c.col === t.measures[1]!.col)?.v;
          v2.push(typeof v === 'number' ? v : 0);
        }
        specs.push({ ...base, kind: 'bar3d', title: `${t.measures[1]!.name} par ${base.cat.name}`.slice(0, 80), series: [{ col: t.measures[1]!.col, name: t.measures[1]!.name, values: v2 }] });
      }
      const use = specs.slice(0, 3);
      if (!dp) {
        dp = `xl/drawings/drawing-band-${sh.index + 1}.xml`;
        wr(z, dp, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"></xdr:wsDr>`);
        addOverride(z, `/${dp}`, 'application/vnd.openxmlformats-officedocument.drawing+xml');
        const rid = addRel(z, relsOf(sh.part), `${NS_R}/drawing`, `../drawings/drawing-band-${sh.index + 1}.xml`, 'rIdBandDrawing');
        let sx = ensureRootNs(rd(z, sh.part), 'r', NS_R);
        const tag = `<drawing r:id="${rid}"/>`;
        const before = /<(legacyDrawing|legacyDrawingHF|drawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/.exec(sx);
        sx = before ? sx.slice(0, before.index) + tag + sx.slice(before.index) : sx.replace('</worksheet>', `${tag}</worksheet>`);
        wr(z, sh.part, sx);
      }
      let dx = ensureRootNs(ensureRootNs(rd(z, dp), 'xdr', 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'), 'a', 'http://schemas.openxmlformats.org/drawingml/2006/main');
      const prev = setActiveTheme(design);
      try {
        use.forEach((c, i) => {
          const part = `xl/charts/chart-band-${sh.index + 1}-${i + 1}.xml`;
          wr(z, part, chartXml(c));
          addOverride(z, `/${part}`, 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml');
          const rid = addRel(z, relsOf(dp!), `${NS_R}/chart`, `../charts/chart-band-${sh.index + 1}-${i + 1}.xml`, `rIdBandChart${i + 1}`);
          const g = place(i, use.length);
          const frame = `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${8800 + sh.index * 10 + i}" name="Graphique ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="${NS_R}" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame>`;
          dx = dx.replace(/<\/((?:xdr:)?wsDr)>\s*$/, (_m, tag: string) => `${anchorXml('xdr:', g.from, g.to, frame)}</${tag}>`);
          created++;
        });
      } finally {
        setActiveTheme(prev);
      }
      wr(z, dp, dx);
    }
  }
  if (!banded.length) return null;
  // The Sommaire sheet lists every sheet (links, live row counts and totals) — rebuilt so it never goes stale.
  const sommaire = sommaireSheet(z, design, styles ?? bandStyles(z, design));
  return { bytes: zipSync(z, { level: 6 }), banded, moved, created, sparklines, sommaire };
}

// ── Sommaire ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const SOMMAIRE = 'Sommaire';
const SOMMAIRE_PART = 'xl/worksheets/sheet-sommaire.xml';
export const isSommaire = (name: string) => name.trim().toLocaleLowerCase('fr') === 'sommaire';
const DASHBOARDS = /tableau de bord|dashboard|synth[eè]se/i;

/** Removes the Sommaire sheet (ours) so it can be rebuilt; sheet-scoped names are re-indexed. */
export function dropSommaire(z: Zip): boolean {
  let wb = rd(z, 'xl/workbook.xml');
  const sheets = sheetsOf(z);
  const own = sheets.find((s) => s.part === SOMMAIRE_PART);
  if (!own) return false;
  const rels = rd(z, 'xl/_rels/workbook.xml.rels');
  const rid = new RegExp(`<Relationship\\b[^>]*Id="([^"]+)"[^>]*Target="(?:/xl/)?worksheets/sheet-sommaire\\.xml"`).exec(rels)?.[1] ?? new RegExp(`<Relationship\\b[^>]*Target="(?:/xl/)?worksheets/sheet-sommaire\\.xml"[^>]*Id="([^"]+)"`).exec(rels)?.[1];
  wr(z, 'xl/_rels/workbook.xml.rels', rels.replace(/<Relationship\b[^>]*sheet-sommaire\.xml"[^>]*\/>/, ''));
  wb = wb.replace(new RegExp(`<sheet\\b[^>]*r:id="${rid}"[^>]*\\/>`), '');
  wb = wb.replace(/localSheetId="(\d+)"/g, (_m, n: string) => `localSheetId="${+n > own.index ? +n - 1 : +n}"`);
  wr(z, 'xl/workbook.xml', wb);
  delete z[SOMMAIRE_PART];
  delete z[relsOf(SOMMAIRE_PART)];
  wr(z, '[Content_Types].xml', rd(z, '[Content_Types].xml').replace(/<Override\b[^>]*sheet-sommaire\.xml"[^>]*\/>/, ''));
  return true;
}

/**
 * The Sommaire sheet, first in the workbook: a navy title band, then one line per sheet — its name as a hyperlink,
 * a live row count and the total of its first amount (formulas), what it holds. Rebuilt on every pass.
 */
function sommaireSheet(z: Zip, design: Design, st: BandStyles): boolean {
  dropSommaire(z);
  const sst = sharedStrings(z);
  const sheets = sheetsOf(z).filter((s) => !isSommaire(s.name) && z[s.part]);
  if (sheets.length < 2) return false;
  const q = (n: string) => `'${n.replace(/'/g, "''")}'`;
  const lines: { name: string; rows: number | null; cnt: string; sum: string; total: number | null; measure: string; what: string }[] = [];
  for (const sh of sheets) {
    const x = rd(z, sh.part);
    const t = /<sheetData>/.test(x) ? findTable(readRows(x, sst)) : null;
    if (!t) {
      lines.push({ name: sh.name, rows: null, cnt: '', sum: '', total: null, measure: '', what: DASHBOARDS.test(sh.name) ? 'Tableau de bord' : 'Feuille' });
      continue;
    }
    const m = t.measures[0];
    const rows = readRows(x, sst);
    let total = 0;
    if (m) for (let r = t.first; r <= t.last; r++) {
      const v = rows.get(r)?.find((c) => c.col === m.col)?.v;
      if (typeof v === 'number') total += v;
    }
    const cc = colName(t.catCol ?? t.cols[0]!.col);
    lines.push({
      name: sh.name,
      rows: t.last - t.first + 1,
      cnt: `SUBTOTAL(3,${q(sh.name)}!$${cc}$${t.first}:$${cc}$${t.last})`,
      sum: m ? `SUM(${q(sh.name)}!$${colName(m.col)}$${t.first}:$${colName(m.col)}$${t.last})` : '',
      total: m ? total : null,
      measure: m?.name ?? '',
      what: `${t.cols.length} colonnes${t.measures.length ? ` · ${t.measures.slice(0, 3).map((x) => x.name).join(', ')}` : ''}`,
    });
  }
  // A dashboard opens the workbook (the reproduction, the 3D board): the Sommaire comes right after it.
  let pos = 0;
  while (pos < sheets.length && DASHBOARDS.test(sheets[pos]!.name)) pos++;
  const is = (ref: string, s: number, text: string) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t>${xesc(text)}</t></is></c>`;
  const rowsXml: string[] = [];
  rowsXml.push(`<row r="1" ht="36" customHeight="1">${['A', 'B', 'C', 'D', 'E'].map((c) => (c === 'B' ? is('B1', st.title, SOMMAIRE) : `<c r="${c}1" s="${st.band}"/>`)).join('')}</row>`);
  rowsXml.push(`<row r="2" ht="20" customHeight="1">${is('B2', st.sub, `${sheets.length} feuilles · édité le ${new Date().toLocaleDateString('fr-FR')} · cliquez sur un nom pour ouvrir la feuille`)}</row>`);
  rowsXml.push(`<row r="3" ht="8" customHeight="1"/>`);
  rowsXml.push(`<row r="4" ht="22" customHeight="1">${is('B4', st.label[0]!, 'FEUILLE')}${is('C4', st.label[1]!, 'LIGNES')}${is('D4', st.label[2]!, 'TOTAL (1RE MESURE)')}${is('E4', st.label[3]!, 'CONTENU')}</row>`);
  const links: string[] = [];
  lines.forEach((l, i) => {
    const r = 5 + i;
    const cells = [is(`B${r}`, st.link, l.name)];
    if (l.rows !== null) cells.push(`<c r="C${r}" s="${st.num}"><f>${xesc(l.cnt)}</f><v>${l.rows}</v></c>`);
    if (l.total !== null) cells.push(`<c r="D${r}" s="${st.num}"><f>${xesc(l.sum)}</f><v>${l.total}</v></c>`);
    cells.push(is(`E${r}`, st.sub, l.measure ? `${l.what}` : l.what));
    rowsXml.push(`<row r="${r}" ht="20" customHeight="1">${cells.join('')}</row>`);
    links.push(`<hyperlink ref="B${r}" location="${xesc(`${q(l.name)}!A1`)}" display="${xesc(l.name)}" tooltip="${xesc(`Ouvrir ${l.name}`)}"/>`);
  });
  const last = 4 + lines.length;
  wr(
    z,
    SOMMAIRE_PART,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_R}"><sheetPr><tabColor rgb="FF${design.color.gold}"/></sheetPr><dimension ref="A1:E${last}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="110"${pos === 0 ? ' tabSelected="1"' : ''}/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="2.5" customWidth="1"/><col min="2" max="2" width="36" customWidth="1"/><col min="3" max="3" width="12" customWidth="1"/><col min="4" max="4" width="20" customWidth="1"/><col min="5" max="5" width="60" customWidth="1"/></cols><sheetData>${rowsXml.join('')}</sheetData><mergeCells count="2"><mergeCell ref="B1:E1"/><mergeCell ref="B2:E2"/></mergeCells>${links.length ? `<hyperlinks>${links.join('')}</hyperlinks>` : ''}<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/></worksheet>`,
  );
  addOverride(z, `/${SOMMAIRE_PART}`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');
  const rid = addRel(z, 'xl/_rels/workbook.xml.rels', `${NS_R}/worksheet`, 'worksheets/sheet-sommaire.xml', 'rIdSommaire');
  let wb = ensureRootNs(rd(z, 'xl/workbook.xml'), 'r', NS_R);
  const ids = [...wb.matchAll(/sheetId="(\d+)"/g)].map((m) => +m[1]!);
  const entry = `<sheet name="${SOMMAIRE}" sheetId="${(ids.length ? Math.max(...ids) : 0) + 1}" r:id="${rid}"/>`;
  const tags = [...wb.matchAll(/<sheet\b[^>]*\/>/g)];
  const anchor = tags[pos];
  wb = anchor ? wb.slice(0, anchor.index) + entry + wb.slice(anchor.index) : wb.replace(/<\/sheets>/, `${entry}</sheets>`);
  // Sheet-scoped names at or after the insertion point move by one; first in the book, it is the only selected tab.
  wb = wb.replace(/localSheetId="(\d+)"/g, (_m, n: string) => `localSheetId="${+n >= pos ? +n + 1 : +n}"`);
  if (pos === 0) {
    wb = /activeTab="\d+"/.test(wb) ? wb.replace(/activeTab="\d+"/, 'activeTab="0"') : wb;
    for (const sh of sheets) {
      const x = rd(z, sh.part);
      if (/ tabSelected="(1|true)"/.test(x)) wr(z, sh.part, x.replace(/ tabSelected="(1|true)"/g, ''));
    }
  }
  wr(z, 'xl/workbook.xml', wb);
  return true;
}

/** Standalone pass: (re)builds the Sommaire sheet of a workbook (after other sheets were added). */
export function refreshSommaire(bytes: Uint8Array, design: Design): Uint8Array | null {
  let z: Zip;
  try {
    z = unzipSync(bytes);
  } catch {
    return null;
  }
  if (!z['xl/workbook.xml'] || !z['xl/styles.xml']) return null;
  if (!sommaireSheet(z, design, bandStyles(z, design))) return null;
  return zipSync(z, { level: 6 });
}
