// House style "BLUE ECOBANK" (pure, shared by the server and the direct
// edition): one visual identity for every deliverable — Excel, Word, printable
// HTML / PDF and mail. Colours and rules only; the proprietary kit (logo, 3D
// visuals, app shell) is injected at build time from the user's own skill.
import XLSXS from 'xlsx-js-style';

export const HOUSE = {
  navy: '00415E',
  blue: '005C83',
  light: '1A86B3',
  lime: '8CC63F',
  lime2: 'A6D867',
  green: '6BA23A',
  text: '12333F',
  text2: '3E5C6B',
  bg: 'EEF4F7',
  zebra: 'F6FAFC',
  line: 'CFE0E7',
  risk: 'C0392B',
  warn: 'B67D1C',
  font: 'Segoe UI',
};

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

/** The rules every agent applies to any deliverable (injected in system prompts). */
export const HOUSE_RULES = `HOUSE EXPORT STYLE (mandatory for every deliverable — Excel, Word, PowerPoint, PDF/HTML, mail):
- Palette: navy #00415E (bands, table headers, titles), Ecobank blue #005C83 (primary), light blue #1A86B3 (links/actions), lime #8CC63F / #A6D867 (filets, accents, success), text #12333F / #3E5C6B, light backgrounds #EEF4F7 / #F6FAFC, risk #C0392B, vigilance #B67D1C.
- A 3 px lime filet under every navy band; table headers navy with white bold text; zebra rows #F6FAFC; total row light green.
- Never a dark or black background in exports. Font Segoe UI; numbers tabular (Consolas in exports).
- Amounts in XOF, integers with a space as thousands separator (2 359 078 494); dates dd/mm/yyyy.
- Every synthesis comes with a written reading (numbered findings in sentences) reused in the mail, Word and PowerPoint; the filtered scope is recalled in each export.
- report.export and data.export apply this style automatically; for an application with its own exports use the APEX Studio tools (apex.guide → apex.build_app → apex.qa).`;

type Cell = { v: unknown; t?: string; s?: Record<string, unknown>; z?: string };

const border = (rgb: string, style = 'thin') => ({ style, color: { rgb } });

/**
 * Styled workbook: navy title band + lime filet, scope/date line, navy header,
 * zebra rows, XOF number formats, auto widths, autofilter.
 */
export function houseXlsx(
  columns: string[],
  rows: Record<string, unknown>[],
  opts: { title?: string; subtitle?: string; sheet?: string } = {},
): Uint8Array {
  const title = opts.title || 'Export';
  const sub = `${opts.subtitle ? `${opts.subtitle} · ` : ''}Édité le ${fmtDateFr()}`;
  const n = Math.max(1, columns.length);
  const font = (extra: Record<string, unknown> = {}) => ({
    name: HOUSE.font,
    sz: 10,
    color: { rgb: HOUSE.text },
    ...extra,
  });
  const aoa: Cell[][] = [];
  aoa.push(
    columns.map((_, i) => ({
      v: i === 0 ? title : '',
      t: 's',
      s: {
        font: font({ sz: 15, bold: true, color: { rgb: 'FFFFFF' } }),
        fill: { patternType: 'solid', fgColor: { rgb: HOUSE.navy } },
        alignment: { vertical: 'center' },
        border: { bottom: border(HOUSE.lime, 'thick') },
      },
    })),
  );
  aoa.push(
    columns.map((_, i) => ({
      v: i === 0 ? sub : '',
      t: 's',
      s: { font: font({ sz: 9, italic: true, color: { rgb: HOUSE.text2 } }) },
    })),
  );
  aoa.push(
    columns.map((c) => ({
      v: c,
      t: 's',
      s: {
        font: font({ bold: true, color: { rgb: 'FFFFFF' } }),
        fill: { patternType: 'solid', fgColor: { rgb: HOUSE.navy } },
        alignment: { vertical: 'center', wrapText: true },
        border: { bottom: border(HOUSE.lime, 'medium') },
      },
    })),
  );
  rows.forEach((r, ri) => {
    aoa.push(
      columns.map((c) => {
        const v = r[c];
        const zebra = ri % 2 === 1 ? { fill: { patternType: 'solid', fgColor: { rgb: HOUSE.zebra } } } : {};
        const base = { ...zebra, border: { bottom: border(HOUSE.line) } };
        if (typeof v === 'number' && Number.isFinite(v))
          return {
            v,
            t: 'n',
            z: Number.isInteger(v) ? '# ##0' : '# ##0.00',
            s: { ...base, font: font({ name: 'Consolas' }), alignment: { horizontal: 'right' } },
          };
        if (v instanceof Date) return { v, t: 'd', z: 'dd/mm/yyyy', s: { ...base, font: font() } };
        if (typeof v === 'boolean') return { v: v ? 'Oui' : 'Non', t: 's', s: { ...base, font: font() } };
        return { v: v === null || v === undefined ? '' : String(v), t: 's', s: { ...base, font: font() } };
      }),
    );
  });
  const ws = XLSXS.utils.aoa_to_sheet(aoa, { cellDates: true });
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: n - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: n - 1 } },
  ];
  ws['!rows'] = [{ hpt: 28 }, { hpt: 16 }, { hpt: 22 }];
  ws['!cols'] = columns.map((c) => {
    let w = c.length;
    for (const r of rows.slice(0, 500)) {
      const v = r[c];
      const len =
        typeof v === 'number' ? fmtXof(v, Number.isInteger(v) ? 0 : 2).length : String(v ?? '').length;
      if (len > w) w = len;
    }
    return { wch: Math.min(60, Math.max(8, w + 2)) };
  });
  if (rows.length)
    ws['!autofilter'] = {
      ref: XLSXS.utils.encode_range({ s: { r: 2, c: 0 }, e: { r: rows.length + 2, c: n - 1 } }),
    };
  const wb = XLSXS.utils.book_new();
  XLSXS.utils.book_append_sheet(wb, ws, (opts.sheet || 'Données').slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
  wb.Props = { Title: title, Subject: opts.subtitle ?? '', Author: 'MASSAMBA Workbench' };
  return new Uint8Array(XLSXS.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
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
      `<th align="left" style="background:#${H.navy};color:#fff;padding:7px 9px;border-bottom:3px solid #${H.lime};font:bold 12px '${H.font}',Arial">`,
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
<tr><td style="background:#${H.navy};padding:18px 22px;border-bottom:3px solid #${H.lime}"><div style="font:bold 20px '${H.font}',Arial;color:#ffffff">${title.replace(/</g, '&lt;')}</div><div style="font:12px '${H.font}',Arial;color:#cfe0e7;margin-top:4px">${fmtDateFr()}</div></td></tr>
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
