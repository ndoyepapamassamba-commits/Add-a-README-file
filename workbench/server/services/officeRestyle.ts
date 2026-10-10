/**
 * MAISON 2.0 IN THE IMAGE'S COLOURS for every other sheet of a workbook (the model's own sheets, the data sheet):
 * title band (dark), header row (primary, white bold), zebra body rows (light tint of the primary), thin borders,
 * the design font, no gridlines, coloured tab. Number formats, formulas, merges, charts and widths are kept: only the
 * cell styles are re-pointed to new styles. Pure (zip in → zip out); sheets named in `skip` are left untouched.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export interface RestyleTheme {
  /** Title band fill. */
  dark: string;
  /** Header fill, tab colour. */
  primary: string;
  /** Thin accent (title band bottom border). */
  accent: string;
  font: string;
}
const hx = (c: string) => c.replace('#', '').slice(0, 6).toUpperCase();
const mix = (a: string, b: string, t: number) => {
  const A = [0, 2, 4].map((i) => parseInt(hx(a).slice(i, i + 2), 16));
  const B = [0, 2, 4].map((i) => parseInt(hx(b).slice(i, i + 2), 16));
  return A.map((x, i) => Math.round(x + (B[i]! - x) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
};
const lum = (c: string) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hx(c).slice(i, i + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

type Role = 'title' | 'header' | 'even' | 'odd';
const FONT_ORDER = ['b', 'i', 'strike', 'condense', 'extend', 'outline', 'shadow', 'u', 'vertAlign', 'sz', 'color', 'name', 'family', 'charset', 'scheme'];

export function restyleWorkbook(bytes: Uint8Array, theme: RestyleTheme, skip: ReadonlySet<string> = new Set()): { bytes: Uint8Array; sheets: string[] } | null {
  let z: Record<string, Uint8Array>;
  try {
    z = unzipSync(bytes);
  } catch {
    return null;
  }
  const rd = (p: string) => (z[p] ? strFromU8(z[p]!) : '');
  const wb = rd('xl/workbook.xml');
  let st = rd('xl/styles.xml');
  if (!wb || !st || !/<cellXfs[^>]*>/.test(st)) return null;
  // Sheet name → part.
  const rels = rd('xl/_rels/workbook.xml.rels');
  const sheets: { name: string; part: string }[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(m[0])?.[1] ?? '';
    const rid = /r:id="([^"]*)"/.exec(m[0])?.[1] ?? /\bid="([^"]*)"/.exec(m[0])?.[1];
    const target = rid ? new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"|<Relationship[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels) : null;
    const t = target?.[1] ?? target?.[2];
    if (!t) continue;
    const part = t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`;
    if (z[part]) sheets.push({ name: name.replace(/&amp;/g, '&'), part });
  }
  // ── styles: fonts, fills, borders for the four roles ─────────────────────────────────────────────────────────────
  const append = (tag: string, item: string): number => {
    const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`);
    const m = re.exec(st);
    if (!m) {
      st = st.replace('</styleSheet>', `<${tag} count="1">${item}</${tag}></styleSheet>`);
      return 0;
    }
    const n = (m[2]!.match(new RegExp(`<${tag.slice(0, -1)}\\b`, 'g')) ?? []).length;
    st = st.replace(re, `<${tag}${m[1]!.replace(/count="\d+"/, `count="${n + 1}"`)}>${m[2]}${item}</${tag}>`);
    return n;
  };
  const font = (color: string, bold: boolean, size: number) => `<font>${bold ? '<b/>' : ''}<sz val="${size}"/><color rgb="FF${color}"/><name val="${esc(theme.font)}"/></font>`;
  const fill = (color: string) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`;
  const line = mix(theme.primary, 'FFFFFF', 0.72);
  const border = (bottom?: string) => `<border><left style="thin"><color rgb="FF${line}"/></left><right style="thin"><color rgb="FF${line}"/></right><top style="thin"><color rgb="FF${line}"/></top><bottom style="${bottom ? 'medium' : 'thin'}"><color rgb="FF${bottom ?? line}"/></bottom><diagonal/></border>`;
  const onDark = (c: string) => (lum(c) < 0.55 ? 'FFFFFF' : '0F172A');
  const dark = hx(theme.dark);
  const primary = hx(theme.primary);
  const ids: Record<Role, { font: number; fill: number; border: number }> = {
    title: { font: append('fonts', font(onDark(dark), true, 14)), fill: append('fills', fill(dark)), border: append('borders', border(hx(theme.accent))) },
    header: { font: append('fonts', font(onDark(primary), true, 11)), fill: append('fills', fill(primary)), border: append('borders', border()) },
    even: { font: append('fonts', font('0F172A', false, 10)), fill: append('fills', fill(mix(theme.primary, 'FFFFFF', 0.9))), border: 0 },
    odd: { font: 0, fill: append('fills', fill('FFFFFF')), border: 0 },
  };
  ids.even.border = append('borders', border());
  ids.odd.border = ids.even.border;
  ids.odd.font = ids.even.font;
  // cellXfs: one new xf per (old xf, role), keeping number format, alignment and protection.
  const xfsM = /<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/.exec(st)!;
  const xfs = [...xfsM[2]!.matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => m[0]);
  const added: string[] = [];
  const memo = new Map<string, number>();
  const xfFor = (old: number, role: Role): number => {
    const key = `${old}:${role}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const base = xfs[old] ?? xfs[0] ?? '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
    const r = ids[role];
    let x = base
      .replace(/\sfontId="\d+"/, ` fontId="${r.font}"`)
      .replace(/\sfillId="\d+"/, ` fillId="${r.fill}"`)
      .replace(/\sborderId="\d+"/, ` borderId="${r.border}"`);
    if (!/fontId=/.test(x)) x = x.replace('<xf', `<xf fontId="${r.font}"`);
    if (!/fillId=/.test(x)) x = x.replace('<xf', `<xf fillId="${r.fill}"`);
    if (!/borderId=/.test(x)) x = x.replace('<xf', `<xf borderId="${r.border}"`);
    x = x.replace(/\sapply(Font|Fill|Border)="\d"/g, '').replace('<xf', '<xf applyFont="1" applyFill="1" applyBorder="1"');
    if (role === 'title' || role === 'header') {
      // <alignment> is the first child of <xf> (before <protection>).
      const align = `<alignment vertical="center"${role === 'header' ? ' horizontal="center" wrapText="1"' : ''}/>`;
      x = x.replace(/<alignment\b[^>]*\/>/, '');
      if (x.endsWith('/>')) x = `${x.slice(0, -2)}></xf>`;
      x = x.replace(/<xf\b([^>]*)>/, (_m, a: string) => `<xf${a.replace(/\sapplyAlignment="\d"/, '')} applyAlignment="1">${align}`);
    }
    const id = xfs.length + added.length;
    added.push(x);
    memo.set(key, id);
    return id;
  };
  // ── sheets ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const done: string[] = [];
  for (const sh of sheets) {
    if (skip.has(sh.name)) continue;
    let xml = rd(sh.part);
    const data = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml);
    if (!data || !data[1]!.trim()) continue;
    const rows = [...data[1]!.matchAll(/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)].map((m) => m[0]);
    const cellsOf = (row: string) => [...row.matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)].map((m) => m[0]);
    const isText = (c: string) => /\st="(s|inlineStr|str)"/.test(c) && /<(v|is)>/.test(c);
    const isNum = (c: string) => !/\st="(s|inlineStr|str|b|e)"/.test(c) && /<v>/.test(c);
    // Header: the first row with ≥ 2 texts whose next row holds a number (or ≥ as many cells); rows above it with one
    // text are the title band.
    let header = -1;
    for (let k = 0; k < Math.min(rows.length - 1, 30); k++) {
      const cs = cellsOf(rows[k]!);
      const texts = cs.filter(isText).length;
      const next = cellsOf(rows[k + 1]!);
      if (texts >= 2 && texts >= cs.length * 0.6 && (next.some(isNum) || next.length >= cs.length)) {
        header = k;
        break;
      }
    }
    if (header < 0) continue;
    const roleOf = (k: number): Role | null => {
      if (k === header) return 'header';
      if (k < header) {
        const cs = cellsOf(rows[k]!);
        return cs.filter(isText).length === 1 && k <= 2 ? 'title' : null;
      }
      return (k - header) % 2 === 0 ? 'even' : 'odd';
    };
    const newRows = rows.map((row, k) => {
      const role = roleOf(k);
      if (!role) return row;
      return row.replace(/<c\b([^>]*?)(\/>|>)/g, (m, attrs: string, end: string) => {
        const old = Number(/\ss="(\d+)"/.exec(attrs)?.[1] ?? 0);
        const s = xfFor(old, role);
        const a = /\ss="\d+"/.test(attrs) ? attrs.replace(/\ss="\d+"/, ` s="${s}"`) : `${attrs} s="${s}"`;
        return `<c${a}${end}`;
      });
    });
    xml = xml.replace(data[1]!, newRows.join(''));
    // Title band: the whole used width carries the band colour (empty cells of the title row styled too) — only when
    // the row is a single text cell; header row height a bit taller.
    xml = xml.replace(/<sheetView\b([^>]*?)(\/?)>/, (m, attrs: string, sl: string) => `<sheetView${attrs.replace(/\sshowGridLines="\d"/, '')} showGridLines="0"${sl}>`);
    if (/<sheetPr\b[^>]*\/>/.test(xml)) xml = xml.replace(/<sheetPr\b([^>]*)\/>/, `<sheetPr$1><tabColor rgb="FF${primary}"/></sheetPr>`);
    else if (/<sheetPr\b[^>]*>/.test(xml)) xml = /<tabColor\b/.test(xml) ? xml.replace(/<tabColor\b[^>]*\/>/, `<tabColor rgb="FF${primary}"/>`) : xml.replace(/<sheetPr\b([^>]*)>/, `<sheetPr$1><tabColor rgb="FF${primary}"/>`);
    else xml = xml.replace(/(<worksheet\b[^>]*>)/, `$1<sheetPr><tabColor rgb="FF${primary}"/></sheetPr>`);
    z[sh.part] = strToU8(xml);
    done.push(sh.name);
  }
  if (!done.length) return null;
  st = st.replace(/<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/, (_m, attrs: string, body: string) => `<cellXfs${attrs.replace(/count="\d+"/, `count="${xfs.length + added.length}"`)}>${body}${added.join('')}</cellXfs>`);
  // Font children in schema order (openpyxl writes <name> first): a strict reader accepts the file without repair.
  st = st.replace(/<font>((?:<\w+\b[^>]*\/>)+)<\/font>/g, (_m, kids: string) => {
    const list = [...kids.matchAll(/<(\w+)\b[^>]*\/>/g)].map((k) => ({ tag: k[1]!, xml: k[0] }));
    list.sort((a, b) => FONT_ORDER.indexOf(a.tag) - FONT_ORDER.indexOf(b.tag));
    return `<font>${list.map((k) => k.xml).join('')}</font>`;
  });
  z['xl/styles.xml'] = strToU8(st);
  return { bytes: zipSync(z, { level: 6 }), sheets: done };
}
