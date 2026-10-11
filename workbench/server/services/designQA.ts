/**
 * CONTRÔLE DESIGN AVANT LIVRAISON — the last pass on every Excel, Word, PowerPoint and HTML deliverable, whoever wrote
 * it (exporters, the model's own code, a re-saved file). It finds and FIXES what makes a file hard to read or badly
 * framed, without touching its content or its design choices:
 *  - contrast (WCAG): text on a fill it cannot be read on (cells, table cells, shapes, slides) gets white or near-black;
 *  - framing: numbers shown as ##### and text cut by the next cell (columns widened), sheets printed on many pages
 *    (fit to width), tables and pictures wider than the page (Word), shapes off the slide and text overflowing its
 *    box (PowerPoint), pages without print / responsive rules (HTML → PDF);
 *  - formulas Excel evaluates differently from LibreOffice (N(+range) inside SUMPRODUCT) are reported.
 * Pure: bytes in → bytes out + the list of fixes (French, for the chat). Null when there is nothing to fix.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { contrastH } from './dashRender';

type Zip = Record<string, Uint8Array>;
export interface QAResult {
  bytes: Uint8Array;
  fixes: string[];
  /** Problems found but not fixable automatically. */
  warnings: string[];
}
const rd = (z: Zip, p: string) => (z[p] ? strFromU8(z[p]!) : '');
const wr = (z: Zip, p: string, s: string) => {
  z[p] = strToU8(s);
};
const DARK = '111827';
const LIGHT = 'FFFFFF';
/** The colour text needs on this fill: white or near-black, whichever reads best. */
export const textOn = (fill: string) => (contrastH(`#${LIGHT}`, `#${fill}`) >= contrastH(`#${DARK}`, `#${fill}`) ? LIGHT : DARK);
/** WCAG AA: 4.5:1, 3:1 for large text (≥ 18 pt) and bold headings / headers (a design's white-on-colour header stays). */
export const minContrast = (pt: number, bold: boolean) => (pt >= 18 || bold ? 3 : 4.5);
const hex6 = (v: string) => v.replace(/^#/, '').slice(-6).toUpperCase();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

// ── EXCEL ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const THEME_ORDER = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
function themeColors(z: Zip): string[] {
  const t = rd(z, 'xl/theme/theme1.xml');
  return THEME_ORDER.map((k) => {
    const m = new RegExp(`<a:${k}>[\\s\\S]*?(?:srgbClr val="([0-9A-Fa-f]{6})"|lastClr="([0-9A-Fa-f]{6})")`).exec(t);
    return (m?.[1] ?? m?.[2] ?? (k === 'lt1' ? 'FFFFFF' : k === 'dk1' ? '000000' : '808080')).toUpperCase();
  });
}
const tinted = (h: string, tint: number) =>
  [0, 2, 4]
    .map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16);
      return Math.round(tint >= 0 ? c + (255 - c) * tint : c * (1 + tint))
        .toString(16)
        .padStart(2, '0');
    })
    .join('')
    .toUpperCase();
/** A spreadsheet colour element (<color …/>, <fgColor …/>) → RRGGBB, null when automatic / indexed. */
function colorOf(attrs: string | undefined, theme: string[]): string | null {
  if (!attrs) return null;
  const rgb = /\brgb="([0-9A-Fa-f]{6,8})"/.exec(attrs);
  if (rgb) return hex6(rgb[1]!);
  const th = /\btheme="(\d+)"/.exec(attrs);
  if (th) {
    const base = theme[+th[1]!] ?? null;
    const tint = /\btint="(-?[\d.]+)"/.exec(attrs);
    return base && tint ? tinted(base, +tint[1]!) : base;
  }
  const ix = /\bindexed="(\d+)"/.exec(attrs);
  if (ix) return +ix[1]! === 9 || +ix[1]! === 1 ? 'FFFFFF' : +ix[1]! === 8 || +ix[1]! === 0 ? '000000' : null;
  return null;
}
const block = (xml: string, tag: string) => new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml);
const items = (inner: string, tag: string) => inner.match(new RegExp(`<${tag}\\b[^>]*/>|<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'g')) ?? [];
const attr = (el: string, a: string) => new RegExp(`\\b${a}="([^"]*)"`).exec(el)?.[1];
const colNum = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)![0];
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n; // 1-based
};
const rowNum = (ref: string) => +/\d+$/.exec(ref)![0];
const BUILTIN_FMT: Record<number, string> = { 0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 14: 'dd/mm/yyyy', 22: 'dd/mm/yyyy hh:mm' };
/** Characters Excel needs to show a number in this format (a column narrower than that shows #####). */
export function shownLength(v: number, fmt: string): number | null {
  if (/^General$/i.test(fmt)) return null; // General never shows ##### (it rounds or switches to 1E+10)
  const f = fmt.replace(/"[^"]*"/g, (m) => 'x'.repeat(m.length - 2)).replace(/\[[^\]]*\]/g, '');
  const sec = f.split(';')[0]!;
  if (/[dmyhs]{2}/i.test(sec) && !/[#0]/.test(sec)) return sec.length;
  const pct = sec.includes('%');
  const scale = (sec.match(/,+(?=[^#0]*$)/)?.[0].length ?? 0) * 3; // trailing commas divide by 1000 each
  const dec = /\.(0+)/.exec(sec)?.[1]?.length ?? 0;
  const x = Math.abs(v) * (pct ? 100 : 1) / 10 ** scale;
  const int = Math.max(1, Math.floor(x).toString().length);
  const groups = /#,##0|0,000/.test(sec) ? Math.floor((int - 1) / 3) : 0;
  const literal = (sec.match(/x/g)?.length ?? 0) + (pct ? 1 : 0);
  return int + groups + (dec ? dec + 1 : 0) + literal + (v < 0 ? 1 : 0);
}

interface Xf {
  el: string;
  fontId: number;
  fillId: number;
  numFmtId: number;
  wrap: boolean;
}
export function qaXlsx(bytes: Uint8Array): QAResult | null {
  let z: Zip;
  try {
    z = unzipSync(bytes);
  } catch {
    return null;
  }
  let st = rd(z, 'xl/styles.xml');
  if (!st || !z['xl/workbook.xml']) return null;
  const theme = themeColors(z);
  const fontsB = block(st, 'fonts');
  const fillsB = block(st, 'fills');
  const xfsB = block(st, 'cellXfs');
  if (!fontsB || !fillsB || !xfsB) return null;
  const fonts = items(fontsB[1]!, 'font');
  const fills = items(fillsB[1]!, 'fill');
  const xfEls = items(xfsB[1]!, 'xf');
  const numFmts = new Map<number, string>();
  for (const m of (block(st, 'numFmts')?.[1] ?? '').matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) numFmts.set(+m[1]!, m[2]!.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  const xfs: Xf[] = xfEls.map((el) => ({ el, fontId: +(attr(el, 'fontId') ?? 0), fillId: +(attr(el, 'fillId') ?? 0), numFmtId: +(attr(el, 'numFmtId') ?? 0), wrap: /wrapText="(1|true)"/.test(el) }));
  const fontInfo = fonts.map((f) => ({ color: colorOf(/<color\b([^>]*)\/>/.exec(f)?.[1], theme) ?? '000000', size: +(/<sz val="([\d.]+)"/.exec(f)?.[1] ?? 11), bold: /<b\/>|<b val="(1|true)"\/>/.test(f) }));
  const fillOf = (id: number): string | null => {
    const f = fills[id] ?? '';
    if (!/patternType="solid"/.test(f)) return null;
    return colorOf(/<fgColor\b([^>]*)\/>/.exec(f)?.[1], theme);
  };
  // Contrast: new font (same, readable colour) + new xf, memoised per style.
  const newFonts: string[] = [];
  const newXfs: string[] = [];
  const remap = new Map<number, number>();
  const fixedStyle = (s: number): number | null => {
    if (remap.has(s)) return remap.get(s)!;
    const xf = xfs[s];
    if (!xf) return null;
    const bg = fillOf(xf.fillId);
    const fi = fontInfo[xf.fontId];
    if (!bg || !fi || contrastH(`#${fi.color}`, `#${bg}`) >= minContrast(fi.size, fi.bold)) return null;
    const color = `<color rgb="FF${textOn(bg)}"/>`;
    const f = fonts[xf.fontId]!;
    // <color> sits after <sz> and before <name> / <family> / <charset> / <scheme> (schema order).
    const nf = /<color\b[^>]*\/>/.test(f)
      ? f.replace(/<color\b[^>]*\/>/, color)
      : /\/>$/.test(f) && !/<\/font>$/.test(f)
        ? `<font>${color}</font>`
        : /<sz\b[^>]*\/>/.test(f)
          ? f.replace(/(<sz\b[^>]*\/>)/, `$1${color}`)
          : /<(name|family|charset|scheme)\b/.test(f)
            ? f.replace(/<(name|family|charset|scheme)\b/, (m) => `${color}${m}`)
            : f.replace('</font>', `${color}</font>`);
    const fontId = fonts.length + newFonts.length;
    newFonts.push(nf);
    const el = xf.el.replace(/\bfontId="\d+"/, `fontId="${fontId}"`).replace(/^<xf\b(?![^>]*applyFont)/, '<xf applyFont="1"');
    const id = xfs.length + newXfs.length;
    newXfs.push(el);
    remap.set(s, id);
    return id;
  };
  // Shared strings: lengths only.
  const sst = items(block(rd(z, 'xl/sharedStrings.xml'), 'sst')?.[0] ?? '', 'si').map((si) => [...si.matchAll(/<t\b[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]).join('').length);
  const wbRels = rd(z, 'xl/_rels/workbook.xml.rels');
  const sheets = [...rd(z, 'xl/workbook.xml').matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)].map((m) => ({ name: m[1]!, path: `xl/${(new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`).exec(wbRels) ?? new RegExp(`Target="([^"]+)"[^>]*Id="${m[2]}"`).exec(wbRels))?.[1]?.replace(/^\/?xl\//, '') ?? ''}` }));
  let contrast = 0;
  let widened = 0;
  let fitted = 0;
  const warnings: string[] = [];
  for (const sh of sheets) {
    let x = rd(z, sh.path);
    if (!x) continue;
    // ── contrast on every cell that shows something
    x = x.replace(/<c\b([^>]*?)\bs="(\d+)"([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g, (m, a: string, s: string, b: string, _end: string, body: string | undefined) => {
      if (!body || !/<v>|<is>/.test(body)) return m;
      const ns = fixedStyle(+s);
      if (ns === null) return m;
      contrast++;
      return m.replace(`s="${s}"`, `s="${ns}"`);
    });
    if (/\bN\(\+/.test(x)) warnings.push(`« ${sh.name} » : formule N(+plage) — Excel n'en garde que la première valeur.`);
    // ── column widths: ##### and text cut by the next cell
    const cols = new Map<number, { width: number; rest: string }>();
    const colsB = block(x, 'cols');
    for (const c of items(colsB?.[1] ?? '', 'col')) {
      const min = +(attr(c, 'min') ?? 0);
      const max = +(attr(c, 'max') ?? min);
      const width = +(attr(c, 'width') ?? 8.43);
      const rest = c.replace(/^<col\b|\/>$/g, '').replace(/\s(min|max|width|customWidth)="[^"]*"/g, '').trim();
      for (let k = min; k <= Math.min(max, min + 400); k++) cols.set(k, { width, rest });
    }
    const defW = +(attr(/<sheetFormatPr\b[^>]*>/.exec(x)?.[0] ?? '', 'defaultColWidth') ?? (attr(/<sheetFormatPr\b[^>]*>/.exec(x)?.[0] ?? '', 'baseColWidth') ? +attr(/<sheetFormatPr\b[^>]*>/.exec(x)![0], 'baseColWidth')! + 0.71 : 8.43));
    const widthOf = (c: number) => cols.get(c)?.width ?? defW;
    // A fine layout grid (dashboard sheets) is framed by design: leave it.
    const grid = [...cols.values()].length > 20 && [...cols.values()].every((c) => c.width <= 3.5);
    if (!grid) {
      const merged = new Set<string>();
      for (const m of x.matchAll(/<mergeCell ref="([A-Z]+\d+):([A-Z]+\d+)"/g)) {
        const [c0, r0, c1, r1] = [colNum(m[1]!), rowNum(m[1]!), colNum(m[2]!), rowNum(m[2]!)];
        if ((c1 - c0 + 1) * (r1 - r0 + 1) > 4000) continue;
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) merged.add(`${r},${c}`);
      }
      const filled = new Set<string>();
      const cells: { r: number; c: number; len: number; num: boolean; s: number }[] = [];
      let scanned = 0;
      for (const m of x.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        if (++scanned > 60000) break;
        const ref = attr(m[1]!, 'r');
        const body = m[2] ?? '';
        if (!ref || !/<v>|<is>/.test(body)) continue;
        const r = rowNum(ref);
        const c = colNum(ref);
        filled.add(`${r},${c}`);
        if (merged.has(`${r},${c}`)) continue;
        const t = attr(m[1]!, 't');
        const s = +(attr(m[1]!, 's') ?? 0);
        const v = /<v>([^<]*)<\/v>/.exec(body)?.[1] ?? '';
        if (t === 's') cells.push({ r, c, len: sst[+v] ?? 0, num: false, s });
        else if (t === 'inlineStr') cells.push({ r, c, len: [...body.matchAll(/<t\b[^>]*>([^<]*)<\/t>/g)].map((k) => k[1]).join('').length, num: false, s });
        else if (t === 'str') cells.push({ r, c, len: v.length, num: false, s });
        else if (!t || t === 'n') {
          const xf = xfs[s];
          const fmt = xf ? (numFmts.get(xf.numFmtId) ?? BUILTIN_FMT[xf.numFmtId] ?? 'General') : 'General';
          const n = Number(v);
          const len = Number.isFinite(n) ? shownLength(n, fmt) : null;
          if (len !== null) cells.push({ r, c, len, num: true, s });
        }
      }
      const need = new Map<number, number>();
      for (const k of cells) {
        const xf = xfs[k.s];
        const fi = fontInfo[xf?.fontId ?? 0] ?? { size: 11, bold: false };
        const chars = k.len * (fi.size / 11) * (fi.bold ? 1.08 : 1) + (k.num ? 1.6 : 1.2);
        if (chars <= widthOf(k.c)) continue;
        // Text overflows into an EMPTY neighbour (that is fine); it is cut only when the next cell is filled.
        if (!k.num && (xf?.wrap || !filled.has(`${k.r},${k.c + 1}`))) continue;
        need.set(k.c, Math.max(need.get(k.c) ?? 0, Math.min(k.num ? 30 : 48, Math.ceil(chars))));
      }
      for (const [c, w] of need)
        if (w > widthOf(c)) {
          cols.set(c, { width: w, rest: cols.get(c)?.rest ?? '' });
          widened++;
        }
      if (need.size) {
        const keys = [...cols.keys()].sort((a, b) => a - b);
        const out: string[] = [];
        for (let i = 0; i < keys.length; ) {
          const k0 = keys[i]!;
          const cur = cols.get(k0)!;
          let j = i;
          while (j + 1 < keys.length && keys[j + 1] === keys[j]! + 1 && cols.get(keys[j + 1]!)!.width === cur.width && cols.get(keys[j + 1]!)!.rest === cur.rest) j++;
          out.push(`<col min="${k0}" max="${keys[j]}" width="${+cur.width.toFixed(2)}" customWidth="1"${cur.rest ? ` ${cur.rest}` : ''}/>`);
          i = j + 1;
        }
        const colsXml = `<cols>${out.join('')}</cols>`;
        x = colsB ? x.replace(colsB[0], colsXml) : x.replace(/<sheetData\b/, `${colsXml}<sheetData`);
      }
      // ── printing: a wide sheet fits the page width (instead of being cut over several pages)
      const used = [...new Set([...filled].map((k) => +k.split(',')[1]!))];
      const totalW = used.reduce((a, c) => a + widthOf(c), 0);
      const ps = /<pageSetup\b[^>]*\/>/.exec(x)?.[0];
      const fitAlready = /<pageSetUpPr\b[^>]*fitToPage="(1|true)"/.test(x);
      if (totalW > 95 && !fitAlready) {
        const setup = `<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>`;
        if (ps) x = x.replace(ps, ps.replace(/\s(fitToWidth|fitToHeight|orientation)="[^"]*"/g, '').replace(/\/>$/, ' orientation="landscape" fitToWidth="1" fitToHeight="0"/>'));
        else if (/<pageMargins\b[^>]*\/>/.test(x)) x = x.replace(/(<pageMargins\b[^>]*\/>)/, `$1${setup}`);
        else {
          const after = /<(headerFooter|rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|legacyDrawingHF|drawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/.exec(x);
          const ins = `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>${setup}`;
          x = after ? x.slice(0, after.index) + ins + x.slice(after.index) : x.replace('</worksheet>', `${ins}</worksheet>`);
        }
        if (/<pageSetUpPr\b/.test(x)) x = x.replace(/<pageSetUpPr\b([^>]*?)\/>/, (_m, a: string) => `<pageSetUpPr${a.replace(/\sfitToPage="[^"]*"/, '')} fitToPage="1"/>`);
        else if (/<sheetPr\b[^>]*\/>/.test(x)) x = x.replace(/<sheetPr\b([^>]*)\/>/, '<sheetPr$1><pageSetUpPr fitToPage="1"/></sheetPr>');
        else if (/<sheetPr\b/.test(x)) x = x.replace('</sheetPr>', '<pageSetUpPr fitToPage="1"/></sheetPr>');
        else x = x.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
        fitted++;
      }
    }
    wr(z, sh.path, x);
  }
  // ── shapes of the drawings (KPI tiles, cards): text readable on the shape's own fill
  let shapes = 0;
  for (const p of Object.keys(z).filter((k) => /^xl\/drawings\/[^/]+\.xml$/.test(k))) {
    const d = rd(z, p);
    const out = fixShapeText(d, 'xdr', null);
    if (out.n) {
      wr(z, p, out.xml);
      shapes += out.n;
    }
  }
  if (newXfs.length) {
    st = st.replace(fontsB[0], fontsB[0].replace(/<\/fonts>$/, `${newFonts.join('')}</fonts>`).replace(/<fonts\b([^>]*?)count="\d+"/, `<fonts$1count="${fonts.length + newFonts.length}"`));
    const xb = block(st, 'cellXfs')!;
    st = st.replace(xb[0], xb[0].replace(/<\/cellXfs>$/, `${newXfs.join('')}</cellXfs>`).replace(/<cellXfs\b([^>]*?)count="\d+"/, `<cellXfs$1count="${xfs.length + newXfs.length}"`));
    wr(z, 'xl/styles.xml', st);
  }
  const fixes: string[] = [];
  if (contrast) fixes.push(`${plural(contrast, 'cellule')} au texte illisible sur son fond (contraste corrigé)`);
  if (shapes) fixes.push(`${plural(shapes, 'texte')} de carte / tuile rendu${shapes > 1 ? 's' : ''} lisible${shapes > 1 ? 's' : ''}`);
  if (widened) fixes.push(`${plural(widened, 'colonne')} élargie${widened > 1 ? 's' : ''} (##### ou texte coupé)`);
  if (fitted) fixes.push(`${plural(fitted, 'feuille')} ajustée${fitted > 1 ? 's' : ''} à la largeur de la page à l'impression`);
  if (!fixes.length && !warnings.length) return null;
  return { bytes: fixes.length ? zipSync(z, { level: 6 }) : bytes, fixes, warnings };
}

/**
 * DrawingML shapes (Excel drawings, PowerPoint slides): each run's colour against the shape's fill (or the slide
 * background when the shape has none). Returns the new XML and how many runs changed.
 */
export function fixShapeText(xml: string, ns: 'xdr' | 'p', background: string | null): { xml: string; n: number } {
  let n = 0;
  // Shapes drawn so far (z-order): a text without fill sits on the topmost filled shape under its centre (a title on
  // its band), not on the page background.
  const under: { x: number; y: number; cx: number; cy: number; fill: string }[] = [];
  const out = xml.replace(new RegExp(`<${ns}:sp\\b[\\s\\S]*?</${ns}:sp>`, 'g'), (sp) => {
    const spPr = new RegExp(`<${ns}:spPr\\b[\\s\\S]*?</${ns}:spPr>`).exec(sp)?.[0] ?? '';
    // The shape's own fill (before its outline), else what lies behind it.
    const own = /^[\s\S]*?(?=<a:ln\b|$)/.exec(spPr)?.[0] ?? '';
    const ownFill = /<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(own)?.[1] ?? null;
    const box = /<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(spPr);
    let behind = background;
    if (box) {
      const [cx0, cy0] = [+box[1]! + +box[3]! / 2, +box[2]! + +box[4]! / 2];
      for (let k = under.length - 1; k >= 0; k--) {
        const u = under[k]!;
        if (cx0 >= u.x && cx0 <= u.x + u.cx && cy0 >= u.y && cy0 <= u.y + u.cy) {
          behind = u.fill;
          break;
        }
      }
      if (ownFill) under.push({ x: +box[1]!, y: +box[2]!, cx: +box[3]!, cy: +box[4]!, fill: ownFill });
    } else if (ns === 'p' && !ownFill) return sp; // placeholder without position: its place is in the layout, unknown here
    const fill = ownFill ?? behind;
    if (!fill || !/<(?:\w+:)?txBody>/.test(sp)) return sp;
    return sp.replace(/<a:rPr\b([^>]*?)(\/>|>([\s\S]*?)<\/a:rPr>)/g, (m, a: string, _e: string, inner: string | undefined) => {
      const size = +(attr(a, 'sz') ?? 1800) / 100;
      const bold = /\bb="1"/.test(a);
      const col = /<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(inner ?? '')?.[1];
      if (!col) return m; // inherited colour: leave it
      if (contrastH(`#${col}`, `#${fill}`) >= minContrast(size, bold)) return m;
      n++;
      return m.replace(`val="${col}"`, `val="${textOn(fill)}"`);
    });
  });
  return { xml: out, n };
}

// ── WORD ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const RPR_AFTER_COLOR = ['spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'];
/** Sets the run colour inside a <w:rPr> at its schema place. */
export function withRunColor(rPr: string, color: string): string {
  const c = `<w:color w:val="${color}"/>`;
  if (/<w:color\b[^>]*\/>/.test(rPr)) return rPr.replace(/<w:color\b[^>]*\/>/, c);
  if (/^<w:rPr\/>$/.test(rPr)) return `<w:rPr>${c}</w:rPr>`;
  const next = new RegExp(`<w:(${RPR_AFTER_COLOR.join('|')})\\b`).exec(rPr);
  return next ? rPr.slice(0, next.index) + c + rPr.slice(next.index) : rPr.replace('</w:rPr>', `${c}</w:rPr>`);
}
export function qaDocx(bytes: Uint8Array): QAResult | null {
  let z: Zip;
  try {
    z = unzipSync(bytes);
  } catch {
    return null;
  }
  let doc = rd(z, 'word/document.xml');
  if (!doc) return null;
  let contrast = 0;
  let tables = 0;
  let pictures = 0;
  // Text width of the page (twips), from the last section.
  const sect = /<w:sectPr\b[\s\S]*?<\/w:sectPr>(?![\s\S]*<w:sectPr\b)/.exec(doc)?.[0] ?? '';
  const pgW = +(/<w:pgSz\b[^>]*w:w="(\d+)"/.exec(sect)?.[1] ?? 11906);
  const left = +(/<w:pgMar\b[^>]*w:left="(\d+)"/.exec(sect)?.[1] ?? 1134);
  const right = +(/<w:pgMar\b[^>]*w:right="(\d+)"/.exec(sect)?.[1] ?? 1134);
  const avail = Math.max(3000, pgW - left - right);
  // ── text readable on shaded table cells
  doc = doc.replace(/<w:tc>[\s\S]*?<\/w:tc>|<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g, (tc) => {
    const fill = /<w:tcPr>[\s\S]*?<w:shd\b[^>]*w:fill="([0-9A-Fa-f]{6})"/.exec(tc)?.[1];
    if (!fill) return tc;
    return tc.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g, (m) => {
      if (!/<w:t\b/.test(m)) return m;
      const rPr = /<w:rPr\/>|<w:rPr>[\s\S]*?<\/w:rPr>/.exec(m)?.[0];
      const col = rPr ? /<w:color w:val="([0-9A-Fa-f]{6}|auto)"/.exec(rPr)?.[1] : undefined;
      const size = rPr ? +(/<w:sz w:val="(\d+)"/.exec(rPr)?.[1] ?? 20) / 2 : 10;
      const bold = rPr ? /<w:b\/>|<w:b w:val="(1|true)"\/>/.test(rPr) : false;
      const actual = !col || col === 'auto' ? '000000' : col;
      if (contrastH(`#${actual}`, `#${fill}`) >= minContrast(size, bold)) return m;
      contrast++;
      const want = textOn(fill);
      return rPr ? m.replace(rPr, withRunColor(rPr, want)) : m.replace(/^(<w:r(?:\s[^>]*)?>)/, `$1<w:rPr><w:color w:val="${want}"/></w:rPr>`);
    });
  });
  // ── tables wider than the page: full text width, columns scaled
  doc = doc.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
    const tw = /<w:tblW w:w="(\d+)" w:type="dxa"\/>/.exec(tbl);
    const grid = [...tbl.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => +m[1]!);
    const sum = grid.reduce((a, b) => a + b, 0);
    const width = Math.max(tw ? +tw[1]! : 0, sum);
    if (width <= avail * 1.02) return tbl;
    tables++;
    const k = avail / width;
    return tbl
      .replace(/<w:tblW w:w="\d+" w:type="dxa"\/>/, '<w:tblW w:w="5000" w:type="pct"/>')
      .replace(/<w:gridCol w:w="(\d+)"\/>/g, (_m, w: string) => `<w:gridCol w:w="${Math.max(200, Math.round(+w * k))}"/>`)
      .replace(/<w:tcW w:w="(\d+)" w:type="dxa"\/>/g, (_m, w: string) => `<w:tcW w:w="${Math.max(200, Math.round(+w * k))}" w:type="dxa"/>`);
  });
  // ── pictures wider than the page (scaled, proportions kept)
  const maxEmu = avail * 635;
  doc = doc.replace(/<w:drawing>[\s\S]*?<\/w:drawing>/g, (dr) => {
    const ext = /<wp:extent cx="(\d+)" cy="(\d+)"\/>/.exec(dr);
    if (!ext || +ext[1]! <= maxEmu * 1.01) return dr;
    pictures++;
    const k = maxEmu / +ext[1]!;
    const cx = Math.round(+ext[1]! * k);
    const cy = Math.round(+ext[2]! * k);
    return dr.replace(ext[0], `<wp:extent cx="${cx}" cy="${cy}"/>`).replace(/<a:ext cx="\d+" cy="\d+"\/>/, `<a:ext cx="${cx}" cy="${cy}"/>`);
  });
  const fixes: string[] = [];
  if (contrast) fixes.push(`${plural(contrast, 'texte')} illisible${contrast > 1 ? 's' : ''} dans des cellules colorées (contraste corrigé)`);
  if (tables) fixes.push(`${plural(tables, 'tableau', 'tableaux')} plus large${tables > 1 ? 's' : ''} que la page ramené${tables > 1 ? 's' : ''} à la largeur du texte`);
  if (pictures) fixes.push(`${plural(pictures, 'image')} plus large${pictures > 1 ? 's' : ''} que la page réduite${pictures > 1 ? 's' : ''}`);
  if (!fixes.length) return null;
  wr(z, 'word/document.xml', doc);
  return { bytes: zipSync(z, { level: 6 }), fixes, warnings: [] };
}

// ── POWERPOINT ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Lines a text needs in a box (rough metrics: average glyph 0.5 em, line 1.2 em). */
function linesNeeded(paras: { len: number; size: number }[], widthPt: number, scale: number): number {
  return paras.reduce((a, p) => a + Math.max(1, Math.ceil((p.len * p.size * scale * 0.5) / Math.max(1, widthPt))) * p.size * scale * 1.2, 0);
}
export function qaPptx(bytes: Uint8Array): QAResult | null {
  let z: Zip;
  try {
    z = unzipSync(bytes);
  } catch {
    return null;
  }
  const pres = rd(z, 'ppt/presentation.xml');
  if (!pres) return null;
  const W = +(/<p:sldSz cx="(\d+)"/.exec(pres)?.[1] ?? 12192000);
  const H = +(/<p:sldSz[^>]*cy="(\d+)"/.exec(pres)?.[1] ?? 6858000);
  let moved = 0;
  let shrunk = 0;
  let contrast = 0;
  for (const p of Object.keys(z).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))) {
    let x = rd(z, p);
    const bg = /<p:bg>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(x)?.[1] ?? 'FFFFFF';
    // Groups keep their own coordinates: leave their children alone.
    const groups: string[] = [];
    x = x.replace(/<p:grpSp>[\s\S]*?<\/p:grpSp>/g, (g) => `<!--grp${groups.push(g) - 1}-->`);
    // ── shapes and pictures inside the slide
    x = x.replace(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g, (m, xs: string, ys: string, cxs: string, cys: string) => {
      let [ox, oy, cx, cy] = [+xs, +ys, +cxs, +cys];
      const tol = 0.01;
      if (ox >= -W * tol && oy >= -H * tol && ox + cx <= W * (1 + tol) && oy + cy <= H * (1 + tol)) return m;
      if (cx > W) {
        cy = Math.round(cy * ((W * 0.96) / cx));
        cx = Math.round(W * 0.96);
      }
      if (cy > H) {
        cx = Math.round(cx * ((H * 0.96) / cy));
        cy = Math.round(H * 0.96);
      }
      ox = Math.min(Math.max(0, ox), W - cx);
      oy = Math.min(Math.max(0, oy), H - cy);
      moved++;
      return `<a:off x="${ox}" y="${oy}"/><a:ext cx="${cx}" cy="${cy}"/>`;
    });
    // ── text that overflows its box: shrink (normAutofit with the scale PowerPoint would compute)
    x = x.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (sp) => {
      const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(sp);
      const body = /<a:bodyPr\b[^>]*\/>|<a:bodyPr\b[^>]*>[\s\S]*?<\/a:bodyPr>/.exec(sp)?.[0];
      if (!ext || !body || /<a:(normAutofit|spAutoFit)\b/.test(body)) return sp;
      const wPt = +ext[1]! / 12700 - 14;
      const hPt = +ext[2]! / 12700 - 7;
      const paras = [...sp.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((m) => ({
        len: [...m[1]!.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join('').length,
        size: +(/<a:rPr\b[^>]*\bsz="(\d+)"/.exec(m[1]!)?.[1] ?? 1800) / 100,
      })).filter((q) => q.len > 0);
      if (!paras.length || linesNeeded(paras, wPt, 1) <= hPt) return sp;
      let s = 1;
      while (s > 0.4 && linesNeeded(paras, wPt, s) > hPt) s -= 0.05;
      shrunk++;
      const fit = `<a:normAutofit fontScale="${Math.round(Math.max(0.4, s) * 100) * 1000}" lnSpcReduction="10000"/>`;
      const nb = /\/>$/.test(body) ? body.replace(/\/>$/, `>${fit}</a:bodyPr>`) : body.replace(/<a:noAutofit\/>/, '').replace(/(<a:bodyPr\b[^>]*>(?:<a:prstTxWarp\b[\s\S]*?<\/a:prstTxWarp>)?)/, `$1${fit}`);
      return sp.replace(body, nb);
    });
    const c = fixShapeText(x, 'p', bg);
    x = c.xml;
    contrast += c.n;
    x = x.replace(/<!--grp(\d+)-->/g, (_m, i: string) => groups[+i]!);
    wr(z, p, x);
  }
  const fixes: string[] = [];
  if (moved) fixes.push(`${plural(moved, 'élément')} qui sortai${moved > 1 ? 'ent' : 't'} de la diapositive replacé${moved > 1 ? 's' : ''}`);
  if (shrunk) fixes.push(`${plural(shrunk, 'zone')} de texte qui débordai${shrunk > 1 ? 'ent' : 't'} ajustée${shrunk > 1 ? 's' : ''}`);
  if (contrast) fixes.push(`${plural(contrast, 'texte')} illisible${contrast > 1 ? 's' : ''} sur son fond (contraste corrigé)`);
  if (!fixes.length) return null;
  return { bytes: zipSync(z, { level: 6 }), fixes, warnings: [] };
}

// ── HTML (and the PDF printed from it) ─────────────────────────────────────────────────────────────────────────────
const QA_CSS = `<style data-design-qa>
img,svg,video,canvas{max-width:100%;height:auto}
table{max-width:100%;border-collapse:collapse}
.table-wrap,.tbl-scroll{overflow-x:auto}
@page{size:A4;margin:12mm}
@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}h1,h2,h3{break-after:avoid}tr,img,svg,figure,.card,.kpi{break-inside:avoid}table{font-size:10pt}}
</style>`;
export function qaHtml(html: string): { html: string; fixes: string[] } {
  const fixes: string[] = [];
  let out = html;
  if (!/data-design-qa/.test(out)) {
    out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${QA_CSS}\n</head>`) : `${QA_CSS}\n${out}`;
    fixes.push('règles de cadrage ajoutées (images et tableaux dans la page, impression PDF A4 sans coupure)');
  }
  if (/<head\b/i.test(out) && !/name=["']viewport["']/i.test(out)) {
    out = out.replace(/<head\b[^>]*>/i, (m) => `${m}\n<meta name="viewport" content="width=device-width, initial-scale=1">`);
    fixes.push('affichage mobile activé (viewport)');
  }
  // Inline styles that put a colour on a background it cannot be read on.
  let contrast = 0;
  out = out.replace(/style="([^"]*)"/gi, (m, s: string) => {
    const fg = /(?:^|;)\s*color\s*:\s*#([0-9a-f]{6})\b/i.exec(s)?.[1];
    const bg = /background(?:-color)?\s*:\s*#([0-9a-f]{6})\b/i.exec(s)?.[1];
    if (!fg || !bg || contrastH(`#${fg}`, `#${bg}`) >= 4.5) return m;
    contrast++;
    return m.replace(new RegExp(`(color\\s*:\\s*)#${fg}`, 'i'), `$1#${textOn(bg.toUpperCase())}`);
  });
  if (contrast) fixes.push(`${plural(contrast, 'texte')} illisible${contrast > 1 ? 's' : ''} sur son fond (contraste corrigé)`);
  return { html: out, fixes };
}

/** The whole pass on one file (by extension). */
export function designQA(path: string, data: Uint8Array | string): { data: Uint8Array | string; fixes: string[]; warnings: string[] } | null {
  if (typeof data === 'string') {
    if (!/\.html?$/i.test(path)) return null;
    const r = qaHtml(data);
    return r.fixes.length ? { data: r.html, fixes: r.fixes, warnings: [] } : null;
  }
  const r = /\.xlsx$/i.test(path) ? qaXlsx(data) : /\.docx$/i.test(path) ? qaDocx(data) : /\.pptx$/i.test(path) ? qaPptx(data) : null;
  return r ? { data: r.bytes, fixes: r.fixes, warnings: r.warnings } : null;
}
