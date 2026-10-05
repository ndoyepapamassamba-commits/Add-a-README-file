// House style "GOD 3D · BLUE ECOBANK" (pure, shared by the server and the direct edition): one LOCKED visual identity
// for every deliverable — Excel, Word, PowerPoint, printable HTML / PDF and mail. All values come from houseDesign.ts
// (relevés sur le classeur de référence « Impayés 30-90j plan d'actions »); nothing here is configurable.
import XLSXS from 'xlsx-js-style';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { DESIGN, DESIGN_RULES } from './houseDesign';

const C = DESIGN.color;
/** Legacy token names kept for the Word / HTML / mail builders. `lime` is now the GOLD accent filet. */
export const HOUSE = Object.freeze({
  navy: C.navy,
  blue: C.blue,
  light: '2563EB',
  lime: C.gold,
  lime2: 'E9DDB0',
  green: C.green,
  text: C.text,
  text2: C.text2,
  bg: C.ice,
  zebra: C.panel,
  line: C.line,
  risk: C.risk,
  warn: C.warn,
  font: DESIGN.font.ui,
  mono: DESIGN.font.mono,
  gold: C.gold,
  cyan: C.cyan,
  ice: C.ice,
  panel: C.panel,
  input: C.input,
  subtle: C.subtle,
});

/** 2359078494 → "2 359 078 494" (ordinary spaces, as in the house reports). */
export function fmtXof(n: number, digits = 0): string {
  return n
    .toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    .replace(/[\u202f\u00a0]/g, ' ');
}
/** Date → jj/mm/aaaa. */
export function fmtDateFr(d: Date = new Date()): string {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** The rules every agent applies to any deliverable (injected in system prompts). The design is locked. */
export const HOUSE_RULES = DESIGN_RULES;

type Cell = { v: unknown; t?: string; s?: Record<string, unknown>; z?: string };

const border = (rgb: string, style = 'thin') => ({ style, color: { rgb } });
const box = (rgb: string = C.line) => ({
  top: border(rgb),
  bottom: border(rgb),
  left: border(rgb),
  right: border(rgb),
});
const solid = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });
const col = (i: number) => XLSXS.utils.encode_col(i);

/** Sheet view the writer cannot express: no gridlines, zoom 90 %, frozen header, tab colour (patched into the XML). */
export function lockSheetView(
  bytes: Uint8Array,
  o: { tab: string; freezeRows: number; zoom?: number; gridlines?: boolean },
): Uint8Array {
  const z = unzipSync(bytes);
  const name = Object.keys(z).find((k) => /^xl\/worksheets\/sheet1\.xml$/.test(k));
  if (!name) return bytes;
  let xml = strFromU8(z[name]!);
  const zoom = o.zoom ?? DESIGN.xlsx.zoom;
  const view = `<sheetViews><sheetView${o.gridlines ? '' : ' showGridLines="0"'} zoomScale="${zoom}" zoomScaleNormal="${zoom}" workbookViewId="0">${
    o.freezeRows > 0
      ? `<pane ySplit="${o.freezeRows}" topLeftCell="A${o.freezeRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${o.freezeRows + 1}" sqref="A${o.freezeRows + 1}"/>`
      : ''
  }</sheetView></sheetViews>`;
  xml = /<sheetViews>[\s\S]*?<\/sheetViews>/.test(xml)
    ? xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, view)
    : xml.replace(/(<dimension [^>]*\/>)/, `$1${view}`);
  const tab = `<tabColor rgb="FF${o.tab}"/>`;
  if (/<sheetPr[ >/]/.test(xml)) {
    xml = /<sheetPr[^>]*\/>/.test(xml)
      ? xml.replace(/<sheetPr([^>]*)\/>/, `<sheetPr$1>${tab}</sheetPr>`)
      : xml.replace(/(<sheetPr[^>]*>)/, `$1${tab}`);
  } else xml = xml.replace(/(<dimension )/, `<sheetPr>${tab}</sheetPr>$1`);
  return zipSync({ ...z, [name]: strToU8(xml) });
}

/**
 * Workbook in the locked reference design: navy title band, blue subtitle band, four KPI cards (live SUBTOTAL
 * formulas), blue table header, Consolas right-aligned numbers, thin #DBE6F7 borders, status colours, no gridlines,
 * zoom 90 %, frozen header, autofilter, cyan data tab.
 */
export function houseXlsx(
  columns: string[],
  rows: Record<string, unknown>[],
  opts: { title?: string; subtitle?: string; sheet?: string } = {},
): Uint8Array {
  const X = DESIGN.xlsx;
  const H = X.rowHeight;
  const title = opts.title || 'Export';
  const sub = `${opts.subtitle ? `${opts.subtitle} · ` : ''}Édité le ${fmtDateFr()}`;
  const n = Math.max(1, columns.length);
  const font = (extra: Record<string, unknown> = {}) => ({
    name: DESIGN.font.ui,
    sz: X.bodySize,
    color: { rgb: C.text },
    ...extra,
  });
  const HEADER_ROW = 5; // 0-based: title, subtitle, KPI labels, KPI values, spacer, header
  const first = HEADER_ROW + 1;
  const last = HEADER_ROW + rows.length;
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const numCol = columns.findIndex((c) => {
    const vs = rows.slice(0, 200).map((r) => r[c]);
    return vs.length > 0 && vs.filter(isNum).length / vs.length >= 0.6;
  });
  const nums = numCol >= 0 ? rows.map((r) => r[columns[numCol]!]).filter(isNum) : [];
  const sum = nums.reduce((a, b) => a + b, 0);
  const rng = (c: number) => `${col(c)}${first + 1}:${col(c)}${last + 1}`;
  type Card = { label: string; f: string; v: number; z: string };
  const cards: Card[] = [
    {
      label: 'LIGNES AFFICHÉES',
      f: `SUBTOTAL(103,${rng(0)})`,
      v: rows.filter((r) => r[columns[0]!] !== '' && r[columns[0]!] != null).length,
      z: X.numberFormat.integer,
    },
  ];
  if (numCol >= 0 && n >= 3) {
    const name = columns[numCol]!.toUpperCase().slice(0, 22);
    cards.push(
      { label: `Σ ${name}`, f: `SUBTOTAL(109,${rng(numCol)})`, v: sum, z: X.numberFormat.bigMoney },
      {
        label: 'MONTANT MOYEN',
        f: `IFERROR(SUBTOTAL(101,${rng(numCol)}),0)`,
        v: nums.length ? sum / nums.length : 0,
        z: X.numberFormat.integer,
      },
      {
        label: 'VALEUR MAX',
        f: `SUBTOTAL(104,${rng(numCol)})`,
        v: nums.length ? Math.max(...nums) : 0,
        z: X.numberFormat.integer,
      },
    );
  }
  const used = Math.min(cards.length, n);
  const aoa: Cell[][] = [];
  const band = (text: string, s: Record<string, unknown>): Cell[] =>
    columns.map((_, i) => ({ v: i === 0 ? text : '', t: 's', s }));
  aoa.push(
    band(title, {
      font: font({ sz: X.titleSize, bold: true, color: { rgb: C.white } }),
      fill: solid(C.navy),
      alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
      border: { bottom: border(C.gold, 'medium') },
    }),
  );
  aoa.push(
    band(sub, {
      font: font({ sz: X.subtitleSize, color: { rgb: C.subtle } }),
      fill: solid(C.blue),
      alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
    }),
  );
  aoa.push(
    columns.map((_, i) =>
      i < used
        ? {
            v: cards[i]!.label,
            t: 's',
            s: {
              font: font({ sz: X.kpiLabelSize, bold: true, color: { rgb: C.text2 } }),
              fill: solid(C.panel),
              alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
              border: box(),
            },
          }
        : { v: '', t: 's', s: { fill: solid(C.ice) } },
    ),
  );
  aoa.push(
    columns.map((_, i) =>
      i < used
        ? {
            v: cards[i]!.v,
            f: cards[i]!.f,
            t: 'n',
            z: cards[i]!.z,
            s: {
              font: font({ name: DESIGN.font.mono, sz: X.kpiValueSize, bold: true, color: { rgb: C.navy } }),
              fill: solid(C.white),
              alignment: { horizontal: 'center', vertical: 'center' },
              border: box(),
            },
          }
        : { v: '', t: 's', s: { fill: solid(C.ice) } },
    ),
  );
  aoa.push(columns.map(() => ({ v: '', t: 's', s: { fill: solid(C.ice) } })));
  aoa.push(
    columns.map((c) => ({
      v: c,
      t: 's',
      s: {
        font: font({ sz: X.headerSize, bold: true, color: { rgb: C.white } }),
        fill: solid(C.blue),
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: box(),
      },
    })),
  );
  const status = DESIGN.status as Record<string, { fill: string; text: string }>;
  for (const r of rows)
    aoa.push(
      columns.map((c) => {
        const v = r[c];
        const base = { border: box() };
        if (isNum(v))
          return {
            v,
            t: 'n',
            z: Number.isInteger(v) ? X.numberFormat.integer : X.numberFormat.decimal,
            s: {
              ...base,
              font: font({ name: DESIGN.font.mono }),
              alignment: { horizontal: 'right', vertical: 'center' },
            },
          };
        if (v instanceof Date)
          return {
            v,
            t: 'd',
            z: X.numberFormat.date,
            s: { ...base, font: font(), alignment: { horizontal: 'center', vertical: 'center' } },
          };
        const text =
          typeof v === 'boolean' ? (v ? 'Oui' : 'Non') : v === null || v === undefined ? '' : String(v);
        const st = Object.prototype.hasOwnProperty.call(status, text) ? status[text] : undefined;
        if (st)
          return {
            v: text,
            t: 's',
            s: {
              ...base,
              font: font({ bold: true, color: { rgb: st.text } }),
              fill: solid(st.fill),
              alignment: { horizontal: 'center', vertical: 'center' },
            },
          };
        return {
          v: text,
          t: 's',
          s: { ...base, font: font(), alignment: { horizontal: 'left', vertical: 'center' } },
        };
      }),
    );
  const ws = XLSXS.utils.aoa_to_sheet(aoa, { cellDates: true });
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: n - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: n - 1 } },
  ];
  ws['!rows'] = [
    { hpt: H.title },
    { hpt: H.subtitle },
    { hpt: H.kpiLabel },
    { hpt: H.kpiValue },
    { hpt: H.spacer },
    { hpt: H.header },
  ];
  ws['!cols'] = columns.map((c, i) => {
    let w = c.length;
    for (const r of rows.slice(0, 500)) {
      const v = r[c];
      const len = isNum(v) ? fmtXof(v as number, Number.isInteger(v) ? 0 : 2).length : String(v ?? '').length;
      if (len > w) w = len;
    }
    return { wch: Math.min(60, Math.max(i < used ? 16 : 8, w + 2)) };
  });
  if (rows.length)
    ws['!autofilter'] = {
      ref: XLSXS.utils.encode_range({ s: { r: HEADER_ROW, c: 0 }, e: { r: last, c: n - 1 } }),
    };
  const wb = XLSXS.utils.book_new();
  XLSXS.utils.book_append_sheet(wb, ws, (opts.sheet || 'Données').slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
  wb.Props = { Title: title, Subject: opts.subtitle ?? '', Author: 'MASSAMBA Workbench' };
  const raw = new Uint8Array(XLSXS.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
  return lockSheetView(raw, { tab: X.tabColor.data, freezeRows: HEADER_ROW + 1 });
}

/**
 * Colour mail in the house style: 680 px, table layout and inline styles only
 * (Outlook-safe), navy band with lime filet, navy table headers, zebra rows.
 */
export function houseMailHtml(title: string, bodyHtml: string): string {
  const H = HOUSE;
  const td = `padding:6px 9px;border-bottom:1px solid #${H.line};font:13px '${H.font}',Arial,sans-serif;color:#${H.text};white-space:nowrap`;
  let zebra = 0;
  const body = bodyHtml
    .replace(
      /<h1[^>]*>/g,
      `<h1 style="font:bold 20px '${H.font}',Arial;color:#${H.navy};border-bottom:3px solid #${H.lime};padding-bottom:4px;margin:18px 0 8px">`,
    )
    .replace(
      /<h2[^>]*>/g,
      `<h2 style="font:bold 17px '${H.font}',Arial;color:#${H.navy};border-bottom:3px solid #${H.lime};padding-bottom:3px;margin:18px 0 8px">`,
    )
    .replace(/<h3[^>]*>/g, `<h3 style="font:bold 15px '${H.font}',Arial;color:#${H.blue};margin:14px 0 6px">`)
    .replace(/<p>/g, `<p style="font:14px/1.5 '${H.font}',Arial;color:#${H.text};margin:0 0 10px">`)
    .replace(/<li>/g, `<li style="font:14px/1.5 '${H.font}',Arial;color:#${H.text};margin:0 0 4px">`)
    .replace(
      /<table>/g,
      `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin:8px 0 14px">`,
    )
    .replace(
      /<th[^>]*>/g,
      `<th align="left" style="background:#${H.blue};color:#fff;padding:7px 9px;border-bottom:3px solid #${H.lime};font:bold 12px '${H.font}',Arial">`,
    )
    .replace(/<tr>/g, () => `<tr style="background:#${zebra++ % 2 ? H.zebra : 'ffffff'}">`)
    .replace(/<td[^>]*>/g, `<td style="${td}">`)
    .replace(/<img /g, '<img style="max-width:640px;height:auto;display:block;margin:8px 0" ')
    .replace(
      /<blockquote>/g,
      `<blockquote style="border-left:4px solid #${H.lime};background:#${H.bg};margin:10px 0;padding:8px 12px;color:#${H.text2}">`,
    );
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title></head><body style="margin:0;background:#${H.bg}">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#${H.bg}"><tr><td align="center" style="padding:18px 8px">
<table width="680" cellpadding="0" cellspacing="0" border="0" style="width:680px;background:#ffffff;border:1px solid #${H.line}">
<tr><td style="background:#${H.navy};padding:18px 22px;border-bottom:3px solid #${H.lime}"><div style="font:bold 20px '${H.font}',Arial;color:#ffffff">${title.replace(/</g, '&lt;')}</div><div style="font:12px '${H.font}',Arial;color:#${H.subtle};margin-top:4px">${fmtDateFr()}</div></td></tr>
<tr><td style="padding:16px 22px">${body}</td></tr>
<tr><td style="background:#${H.bg};padding:10px 22px;font:11px '${H.font}',Arial;color:#${H.text2};border-top:1px solid #${H.line}">${title.replace(/</g, '&lt;')} · ${fmtDateFr()}</td></tr>
</table></td></tr></table></body></html>`;
}

/** .eml draft (multipart/related): data: images become cid: parts so Outlook shows them in colour. */
export function emlFromHtml(subject: string, html: string): string {
  const parts: { cid: string; type: string; b64: string }[] = [];
  const body = html.replace(
    /src="data:(image\/[a-z+]+);base64,([^"]+)"/g,
    (_m, type: string, b64: string) => {
      const cid = `img${parts.length + 1}@massamba`;
      parts.push({ cid, type, b64 });
      return `src="cid:${cid}"`;
    },
  );
  const b = `----=_massamba_${Math.random().toString(36).slice(2)}`;
  const wrap = (s: string) => s.replace(/.{1,76}/g, '$&\r\n');
  const utf8b64 = (s: string) => {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  return [
    'MIME-Version: 1.0',
    `Subject: =?UTF-8?B?${utf8b64(subject)}?=`,
    'X-Unsent: 1',
    `Content-Type: multipart/related; boundary="${b}"; type="text/html"`,
    '',
    `--${b}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(utf8b64(body)),
    ...parts.flatMap((p) => [
      `--${b}`,
      `Content-Type: ${p.type}`,
      'Content-Transfer-Encoding: base64',
      `Content-ID: <${p.cid}>`,
      'Content-Disposition: inline',
      '',
      wrap(p.b64),
    ]),
    `--${b}--`,
    '',
  ].join('\r\n');
}
