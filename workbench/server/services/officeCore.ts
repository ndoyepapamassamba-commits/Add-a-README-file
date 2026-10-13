import { HOUSE, fmtDateFr } from './houseStyle';
import { CHART_CT, CHART_REL, docxChartRun, literalChartXml } from './officeChart';
import { fmtFact, type Brief } from './reportBrief';
// Office deliverables without dependencies (pure): Markdown → Word (.docx),
// Markdown → standalone printable HTML. Shared by the server and the browser.
// PREMIUM (report.export): cover page with the user's logo, table of contents, header / footer with page numbers,
// KPI cards + native charts computed from the brief, a page per chapter, a method note. Everything in the active
// design (palette, fonts), nothing invented: the cards and charts only carry the brief's figures.
import { strToU8, zipSync } from 'fflate';

export interface DocxLogo {
  png: Uint8Array;
  width: number;
  height: number;
}
export interface DocxExtras {
  /** Cover page, table of contents, header / footer with page numbers, a page per chapter. */
  premium?: boolean;
  /** Sub-title on the cover and in the header (e.g. the audience or the source). */
  subtitle?: string;
  /** Brief of report.analyse: KPI cards + native charts open the document, the methods close it. */
  brief?: Brief | null;
  /** The user's logo, already recoloured to the palette (cover + header). Same media name as officeLogo (idempotent). */
  logo?: DocxLogo | null;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Inline Markdown (bold, italic, code, links) → WordprocessingML runs. */
function runs(text: string, base: { bold?: boolean; size?: number; color?: string } = {}): string {
  const out: string[] = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  const run = (t: string, o: { b?: boolean; i?: boolean; code?: boolean; link?: boolean } = {}) => {
    if (!t) return;
    const props = [
      o.b || base.bold ? '<w:b/>' : '',
      o.i ? '<w:i/>' : '',
      o.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : '',
      o.link
        ? `<w:color w:val="${HOUSE.light}"/><w:u w:val="single"/>`
        : base.color
          ? `<w:color w:val="${base.color}"/>`
          : '',
      base.size ? `<w:sz w:val="${base.size}"/>` : '',
    ].join('');
    out.push(`<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`);
  };
  for (const m of text.matchAll(re)) {
    run(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**') || t.startsWith('__')) run(t.slice(2, -2), { b: true });
    else if (t.startsWith('`')) run(t.slice(1, -1), { code: true });
    else if (t.startsWith('[')) run(/\[([^\]]+)\]/.exec(t)![1]!, { link: true });
    else run(t.slice(1, -1), { i: true });
    last = m.index! + t.length;
  }
  run(text.slice(last));
  return out.join('');
}

export interface DocxImage {
  data: Uint8Array;
  type: 'png' | 'jpeg';
}

/** Pixel size of a PNG or JPEG (null if unknown). */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b.length > 24) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      const len = (b[i + 2]! << 8) + b[i + 3]!;
      if (marker >= 0xc0 && marker <= 0xc3)
        return { height: (b[i + 5]! << 8) + b[i + 6]!, width: (b[i + 7]! << 8) + b[i + 8]! };
      i += 2 + len;
    }
  }
  return null;
}

function pictureXml(rid: string, id: number, name: string, w: number, h: number, fitH?: number): string {
  // Fit within ~16 cm wide, keep aspect ratio (EMU: 9525 per px at 96 dpi); fitH = exact height (logo).
  const maxW = 6_000_000;
  let cx = w * 9525;
  let cy = h * 9525;
  if (fitH) {
    cx = Math.round((cx * fitH) / Math.max(1, cy));
    cy = fitH;
  }
  if (cx > maxW) {
    cy = Math.round((cy * maxW) / cx);
    cx = maxW;
  }
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${esc(name)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

const para = (inner: string, style?: string, extra = '') =>
  `<w:p>${style || extra ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>` : ''}${inner}</w:p>`;

function table(rows: string[][]): string {
  const cols = Math.max(...rows.map((r) => r.length));
  // House style (locked): blue header with white bold text and a gold filet, panel-tinted banding.
  const cell = (t: string, i: number) => {
    const header = i === 0;
    const fill = header ? HOUSE.blue : i % 2 === 0 ? HOUSE.zebra : '';
    const numeric = !header && /^[-+]?[\d\s.,]+%?$/.test(t.trim());
    return `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(9000 / cols)}" w:type="dxa"/>${header ? `<w:tcBorders><w:bottom w:val="single" w:sz="18" w:color="${HOUSE.lime}"/></w:tcBorders>` : ''}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}</w:tcPr>${para(runs(t, { bold: header, size: 18, color: header ? 'FFFFFF' : undefined }), undefined, numeric ? '<w:jc w:val="right"/>' : '')}</w:tc>`;
  };
  const b = (side: string) => `<w:${side} w:val="single" w:sz="4" w:color="${HOUSE.line}"/>`;
  const border = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b).join('');
  // tblGrid is required by the schema (Word repairs a table without it).
  const grid = `<w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${Math.floor(9000 / cols)}"/>`).join('')}</w:tblGrid>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders></w:tblPr>${grid}${rows
    .map(
      (r, i) =>
        `<w:tr>${i === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${Array.from({ length: cols }, (_, j) => cell(r[j] ?? '', i)).join('')}</w:tr>`,
    )
    .join('')}</w:tbl>${para('')}`;
}

/** Converts Markdown (headings, lists, tables, code, quotes, bold/italic) into a .docx file. */
export function markdownToDocx(
  md: string,
  title?: string,
  resolveImage?: (src: string) => DocxImage | null,
  extras: DocxExtras = {},
): Uint8Array {
  const body: string[] = [];
  const media: { rid: string; file: string; data: Uint8Array }[] = [];
  const charts: { rid: string; file: string; xml: string }[] = [];
  const premium = Boolean(extras.premium && title);
  const headings: { level: number; text: string }[] = [];
  const logo = extras.logo && extras.logo.png.length ? extras.logo : null;
  const logoRid = logo ? 'rIdLogo' : '';
  if (premium) body.push(...coverXml(title!, extras, logo, logoRid));
  else if (title) {
    // Cover band: navy title with lime filet, then the edition date (dd/mm/yyyy).
    body.push(para(runs(title, { color: 'FFFFFF' }), 'Title'));
    body.push(para(runs(`Édité le ${fmtDateFr()}`, { size: 18, color: HOUSE.text2 })));
  }
  const lines = md.replace(/\r/g, '').split('\n');
  if (premium) {
    for (const l of lines) {
      const h = /^(#{1,2})\s+(.*)$/.exec(l);
      if (h && !(h[1]!.length === 1 && clean(h[2]!).toLowerCase() === title!.trim().toLowerCase())) headings.push({ level: h[1]!.length, text: clean(h[2]!) });
    }
    if (headings.length >= 2) body.push(...tocXml(headings));
    if (extras.brief) body.push(...briefOpeningXml(extras.brief, charts));
  }
  let chapters = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^```/.test(l)) {
      const code: string[] = [];
      while (++i < lines.length && !/^```/.test(lines[i]!)) code.push(lines[i]!);
      for (const c of code)
        body.push(
          para(
            `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${esc(c)}</w:t></w:r>`,
            undefined,
            '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="0"/>',
          ),
        );
      continue;
    }
    if (/^\|.*\|\s*$/.test(l)) {
      const rows: string[][] = [];
      for (; i < lines.length && /^\|.*\|\s*$/.test(lines[i]!); i++) {
        if (/^\|[\s:|-]+\|\s*$/.test(lines[i]!)) continue;
        rows.push(
          lines[i]!.trim()
            .slice(1, -1)
            .split('|')
            .map((c) => c.trim()),
        );
      }
      i--;
      if (rows.length) body.push(table(rows));
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) {
      if (premium && h[1]!.length === 1 && clean(h[2]!).toLowerCase() === title!.trim().toLowerCase()) continue;
      // Premium: every chapter (#) opens a new page, the first one follows the opening without a blank page.
      const brk = premium && h[1]!.length === 1 && chapters++ > 0 ? '<w:pageBreakBefore/>' : '';
      body.push(para(runs(h[2]!), `Heading${Math.min(3, h[1]!.length)}`, brk));
      continue;
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l);
    if (li) {
      const level = Math.min(2, Math.floor(li[1]!.length / 2));
      const bullet = /\d/.test(li[2]!) ? `${li[2]} ` : '• ';
      body.push(
        para(
          `<w:r><w:t xml:space="preserve">${esc(bullet)}</w:t></w:r>${runs(li[3]!.replace(/^\[( |x)\]\s*/i, (m) => (m.includes('x') ? '☑ ' : '☐ ')))}`,
          undefined,
          `<w:ind w:left="${360 + level * 360}" w:hanging="240"/><w:spacing w:after="60"/>`,
        ),
      );
      continue;
    }
    const img = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(l.trim());
    if (img) {
      const found = resolveImage?.(img[2]!);
      const size = found ? imageSize(found.data) : null;
      if (found && size) {
        const n = media.length + 1;
        const rid = `rIdImg${n}`;
        media.push({ rid, file: `image${n}.${found.type === 'jpeg' ? 'jpg' : 'png'}`, data: found.data });
        body.push(
          para(
            pictureXml(rid, n, img[1] || `image${n}`, size.width, size.height),
            undefined,
            '<w:jc w:val="center"/>',
          ),
        );
        if (img[1]) body.push(para(runs(img[1], { size: 18 }), undefined, '<w:jc w:val="center"/>'));
      } else body.push(para(runs(`[Image : ${img[1] || img[2]}]`)));
      continue;
    }
    if (/^>\s?/.test(l)) {
      body.push(
        para(
          runs(l.replace(/^>\s?/, '')),
          undefined,
          '<w:ind w:left="360"/><w:pBdr><w:left w:val="single" w:sz="12" w:color="BFBFBF"/></w:pBdr>',
        ),
      );
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(l.trim())) {
      body.push(para('', undefined, '<w:pBdr><w:bottom w:val="single" w:sz="6" w:color="BFBFBF"/></w:pBdr>'));
      continue;
    }
    if (!l.trim()) continue;
    body.push(para(runs(l)));
  }
  if (premium && extras.brief) body.push(...methodNoteXml(extras.brief));
  const W =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
  // Premium: header (title · subtitle, gold filet, logo) and footer (edition · Page X / Y) on every page but the cover.
  const sectRefs = premium ? '<w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/>' : '';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body.join('')}<w:sectPr>${sectRefs}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>${premium ? '<w:titlePg/>' : ''}</w:sectPr></w:body></w:document>`;
  const style = (id: string, name: string, size: number, color: string, extra = '') =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/>${extra}</w:pPr><w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  const lime = `<w:pBdr><w:bottom w:val="single" w:sz="18" w:space="4" w:color="${HOUSE.lime}"/></w:pBdr>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${HOUSE.font}" w:hAnsi="${HOUSE.font}" w:eastAsia="${HOUSE.font}" w:cs="${HOUSE.font}"/><w:color w:val="${HOUSE.text}"/><w:sz w:val="21"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${style('Title', 'Title', 40, 'FFFFFF', `<w:shd w:val="clear" w:color="auto" w:fill="${HOUSE.navy}"/><w:ind w:left="0"/>${lime}`)}${style('Heading1', 'heading 1', 30, HOUSE.navy, lime)}${style('Heading2', 'heading 2', 25, HOUSE.blue)}${style('Heading3', 'heading 3', 22, HOUSE.light)}<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:before="120" w:after="40"/></w:pPr><w:rPr><w:b/><w:color w:val="${HOUSE.navy}"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="40"/><w:ind w:left="360"/></w:pPr><w:rPr><w:color w:val="${HOUSE.text2}"/><w:sz w:val="20"/></w:rPr></w:style></w:styles>`;
  const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const extraParts: Record<string, Uint8Array> = {};
  let overrides = '';
  let rels = '';
  if (premium) {
    const hdr = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}>${para(
      `${runs(title!, { bold: true, size: 18, color: HOUSE.navy })}<w:r><w:tab/></w:r>${logo ? pictureXml(logoRid, 9001, 'Logo', logo.width, logo.height, 26 * 12700) : runs(extras.subtitle || 'MASSAMBA Workbench', { size: 16, color: HOUSE.text2 })}`,
      undefined,
      `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="${HOUSE.lime}"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs><w:spacing w:after="0"/>`,
    )}</w:hdr>`;
    const fld = (instr: string, cached: string) =>
      `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:color w:val="${HOUSE.blue}"/><w:sz w:val="16"/></w:rPr><w:t>${cached}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
    const ftr = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}>${para(
      `${runs(`${extras.subtitle ? `${extras.subtitle} · ` : ''}Édité le ${fmtDateFr()} · MASSAMBA Workbench`, { size: 16, color: HOUSE.text2 })}<w:r><w:tab/></w:r>${runs('Page ', { size: 16, color: HOUSE.text2 })}${fld('PAGE', '1')}${runs(' / ', { size: 16, color: HOUSE.text2 })}${fld('NUMPAGES', '1')}`,
      undefined,
      `<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="${HOUSE.line}"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs><w:spacing w:after="0"/>`,
    )}</w:ftr>`;
    extraParts['word/header1.xml'] = strToU8(orderPPr(hdr));
    extraParts['word/footer1.xml'] = strToU8(orderPPr(ftr));
    overrides += '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>';
    rels += `<Relationship Id="rIdHdr" Type="${RELS}/header" Target="header1.xml"/><Relationship Id="rIdFtr" Type="${RELS}/footer" Target="footer1.xml"/>`;
    if (logo) {
      extraParts['word/media/massamba-logo.png'] = logo.png;
      extraParts['word/_rels/header1.xml.rels'] = strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="${logoRid}" Type="${RELS}/image" Target="media/massamba-logo.png"/></Relationships>`,
      );
      rels += `<Relationship Id="${logoRid}" Type="${RELS}/image" Target="media/massamba-logo.png"/>`;
    }
    for (const c of charts) {
      extraParts[`word/charts/${c.file}`] = strToU8(c.xml);
      overrides += `<Override PartName="/word/charts/${c.file}" ContentType="${CHART_CT}"/>`;
      rels += `<Relationship Id="${c.rid}" Type="${CHART_REL}" Target="charts/${c.file}"/>`;
    }
  }
  return zipSync({
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${overrides}</Types>`,
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/_rels/document.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${media
        .map(
          (m) =>
            `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.file}"/>`,
        )
        .join('')}${rels}</Relationships>`,
    ),
    ...Object.fromEntries(media.map((m) => [`word/media/${m.file}`, m.data])),
    ...extraParts,
    'word/document.xml': strToU8(orderPPr(doc)),
    'word/styles.xml': strToU8(orderPPr(styles)),
  });
}

// ── premium blocks ──────────────────────────────────────────────────────────────────────────────────────────────────
const clean = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
const PAGE_W = 9638;
const pageBreak = () => para('<w:r><w:br w:type="page"/></w:r>');
/** A cell: shading, borders (sides → xml), width, vertical alignment. */
const tc = (inner: string, o: { w: number; fill?: string; borders?: string; vAlign?: string }) =>
  `<w:tc><w:tcPr><w:tcW w:w="${o.w}" w:type="dxa"/>${o.borders ? `<w:tcBorders>${o.borders}</w:tcBorders>` : ''}${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}${o.vAlign ? `<w:vAlign w:val="${o.vAlign}"/>` : ''}</w:tcPr>${inner || para('')}</w:tc>`;
const NO_BORDERS = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="nil"/>`).join('');
const tbl = (rows: string[], widths: number[], extra = '') =>
  `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${NO_BORDERS}</w:tblBorders><w:tblLayout w:type="fixed"/>${extra}</w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;

/** Cover: the logo top-right, a navy block (title, gold filet, subtitle), then the edition line; page break. */
function coverXml(title: string, extras: DocxExtras, logo: DocxLogo | null, logoRid: string): string[] {
  const out: string[] = [];
  if (logo) out.push(para(pictureXml(logoRid, 9002, 'Logo', logo.width, logo.height, 46 * 12700), undefined, '<w:jc w:val="right"/><w:spacing w:before="0" w:after="600"/>'));
  else out.push(para(runs('MASSAMBA Workbench', { bold: true, size: 18, color: HOUSE.text2 }), undefined, '<w:jc w:val="right"/><w:spacing w:after="600"/>'));
  const inner =
    para('', undefined, '<w:spacing w:before="1200" w:after="0"/>') +
    para(runs(title, { bold: true, size: 56, color: 'FFFFFF' }), undefined, '<w:ind w:left="567" w:right="567"/><w:spacing w:after="240"/>') +
    para('', undefined, `<w:ind w:left="567" w:right="6000"/><w:pBdr><w:bottom w:val="single" w:sz="24" w:space="1" w:color="${HOUSE.lime}"/></w:pBdr><w:spacing w:after="240"/>`) +
    (extras.subtitle ? para(runs(extras.subtitle, { size: 28, color: HOUSE.subtle }), undefined, '<w:ind w:left="567" w:right="567"/><w:spacing w:after="120"/>') : '') +
    (extras.brief ? para(runs(`${extras.brief.rows.toLocaleString('fr-FR')} lignes analysées · ${extras.brief.source}`, { size: 20, color: HOUSE.subtle }), undefined, '<w:ind w:left="567" w:right="567"/><w:spacing w:after="1200"/>') : para('', undefined, '<w:spacing w:after="1200"/>'));
  out.push(tbl([`<w:tr><w:trPr><w:trHeight w:val="6800" w:hRule="atLeast"/></w:trPr>${tc(inner, { w: PAGE_W, fill: HOUSE.navy, vAlign: 'center' })}</w:tr>`], [PAGE_W]));
  out.push(para(runs(`Édité le ${fmtDateFr()}`, { size: 20, color: HOUSE.text2 }), undefined, '<w:spacing w:before="360" w:after="0"/>'));
  out.push(para(runs('Chiffres calculés sur le fichier source, récit vérifié contre le brief d’analyse.', { size: 18, color: HOUSE.text2 }), undefined, '<w:spacing w:after="0"/>'));
  out.push(pageBreak());
  return out;
}

/** Table of contents: a « Sommaire » title then one TOC field whose cached result lists the chapters (no page numbers). */
function tocXml(headings: { level: number; text: string }[]): string[] {
  const out: string[] = [];
  out.push(para(runs('Sommaire', { bold: true, size: 30, color: HOUSE.navy }), undefined, `<w:pBdr><w:bottom w:val="single" w:sz="18" w:space="4" w:color="${HOUSE.lime}"/></w:pBdr><w:spacing w:after="240"/>`));
  const entries = headings.map((h, i) => {
    const num = h.level === 1 ? `${headings.slice(0, i + 1).filter((x) => x.level === 1).length}. ` : '';
    return { style: `TOC${h.level}`, text: `${num}${h.text}` };
  });
  const begin = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u \\n </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
  const end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
  entries.forEach((e, i) => out.push(para(`${i === 0 ? begin : ''}${runs(e.text)}${i === entries.length - 1 ? end : ''}`, e.style)));
  out.push(pageBreak());
  return out;
}

/** Value size (half-points) that keeps a card value on one line: 4 cards ≈ 4 cm each in Consolas. */
const kpiSize = (v: string, cards: number) => {
  const room = cards <= 2 ? 24 : cards === 3 ? 16 : 11;
  return v.length <= room * 0.6 ? 34 : v.length <= room * 0.8 ? 28 : v.length <= room ? 24 : 20;
};
/** « L'essentiel en chiffres »: KPI cards (label, big value, method) and native charts from the brief. */
function briefOpeningXml(b: Brief, charts: { rid: string; file: string; xml: string }[]): string[] {
  const out: string[] = [];
  out.push(para(runs('L’essentiel en chiffres', { bold: true, size: 30, color: HOUSE.navy }), undefined, `<w:pBdr><w:bottom w:val="single" w:sz="18" w:space="4" w:color="${HOUSE.lime}"/></w:pBdr><w:spacing w:after="240"/>`));
  const kpis = b.kpis.slice(0, 4);
  if (kpis.length) {
    const gap = 160;
    const cw = Math.floor((PAGE_W - gap * (kpis.length - 1)) / kpis.length);
    const widths: number[] = [];
    const cells: string[] = [];
    kpis.forEach((k, i) => {
      if (i) {
        widths.push(gap);
        cells.push(tc('', { w: gap }));
      }
      widths.push(cw);
      const inner =
        para(runs(k.label.toUpperCase(), { bold: true, size: 15, color: HOUSE.text2 }), undefined, '<w:spacing w:before="120" w:after="60"/><w:ind w:left="120" w:right="80"/>') +
        para(`<w:r><w:rPr><w:rFonts w:ascii="${HOUSE.mono}" w:hAnsi="${HOUSE.mono}"/><w:b/><w:color w:val="${HOUSE.navy}"/><w:sz w:val="${kpiSize(fmtFact(k), kpis.length)}"/></w:rPr><w:t xml:space="preserve">${esc(fmtFact(k))}</w:t></w:r>`, undefined, '<w:spacing w:after="60"/><w:ind w:left="120" w:right="80"/>') +
        para(runs(k.method, { size: 14, color: HOUSE.text2 }), undefined, '<w:spacing w:after="120"/><w:ind w:left="120" w:right="80"/>');
      cells.push(tc(inner, { w: cw, fill: HOUSE.zebra, borders: `<w:top w:val="single" w:sz="4" w:color="${HOUSE.line}"/><w:left w:val="single" w:sz="24" w:color="${i === 0 ? HOUSE.lime : HOUSE.blue}"/><w:bottom w:val="single" w:sz="12" w:color="${HOUSE.blue}"/><w:right w:val="single" w:sz="4" w:color="${HOUSE.line}"/>` }));
    });
    out.push(tbl([`<w:tr>${cells.join('')}</w:tr>`], widths));
    out.push(para('', undefined, '<w:spacing w:after="120"/>'));
  }
  const addChart = (xml: string, name: string, cy: number) => {
    const n = charts.length + 1;
    const rid = `rIdChart${n}`;
    charts.push({ rid, file: `chart${n}.xml`, xml });
    out.push(para(docxChartRun(rid, 7000 + n, name, 6_120_000, cy), undefined, '<w:jc w:val="center"/><w:spacing w:after="120"/>'));
  };
  const dim = b.dims.find((d) => d.dim !== b.entity) ?? b.dims[0];
  if (dim && dim.top.length >= 2) addChart(literalChartXml({ kind: 'hbar', title: `${b.measureLabel} par ${dim.label}`, name: b.measureLabel, categories: dim.top.map((t) => t.key), values: dim.top.map((t) => t.sum) }), 'Répartition', 2_700_000);
  if (b.trend && b.trend.points.length >= 3) addChart(literalChartXml({ kind: 'line', title: `Évolution ${b.trend.by === 'month' ? 'mensuelle' : 'annuelle'} — ${b.measureLabel}`, name: b.measureLabel, categories: b.trend.points.map((p) => p.period), values: b.trend.points.map((p) => p.sum) }), 'Évolution', 2_500_000);
  if (dim && dim.top.length >= 2) {
    const reading = [`${dim.label} : les 3 premières catégories portent ${Math.round(dim.top3Share * 100)} % du total`, `${dim.n80} catégorie(s) suffisent pour atteindre 80 %`, b.trend?.delta != null ? `dernière période ${b.trend.last} : ${b.trend.delta >= 0 ? '+' : ''}${Math.round(b.trend.delta * 100)} % vs la précédente` : '', b.anomalies.length ? `${b.anomalies.length} anomalie(s) relevée(s) dans les données` : ''].filter(Boolean);
    out.push(para(runs(`Lecture : ${reading.join(' ; ')}.`, { size: 18, color: HOUSE.text2 }), undefined, `<w:ind w:left="360"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="${HOUSE.lime}"/></w:pBdr><w:spacing w:after="240"/>`));
  }
  out.push(pageBreak());
  return out;
}

/** Closing note: how each figure of the opening was computed (small type, grey). */
function methodNoteXml(b: Brief): string[] {
  const out: string[] = [];
  out.push(para('', undefined, `<w:pBdr><w:bottom w:val="single" w:sz="6" w:color="${HOUSE.line}"/></w:pBdr><w:spacing w:before="360"/>`));
  out.push(para(runs('Note méthodologique', { bold: true, size: 18, color: HOUSE.navy }), undefined, '<w:spacing w:after="60"/>'));
  out.push(para(runs(`Source : ${b.source} — ${b.rows.toLocaleString('fr-FR')} lignes, ${b.columns} colonnes. Chiffres calculés localement sur les lignes du fichier ; le récit a été vérifié contre ce brief.`, { size: 16, color: HOUSE.text2 }), undefined, '<w:spacing w:after="60"/>'));
  for (const k of b.kpis.slice(0, 8)) out.push(para(runs(`${k.label} = ${fmtFact(k)} — ${k.method}`, { size: 15, color: HOUSE.text2 }), undefined, '<w:spacing w:after="20"/><w:ind w:left="240"/>'));
  return out;
}

/** Wraps rendered HTML in a printable page in the house style (A4, print-to-PDF friendly). */
export function printableHtml(title: string, bodyHtml: string): string {
  const H = HOUSE;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:A4;margin:16mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font:10.5pt/1.5 '${H.font}',Calibri,Arial,sans-serif;color:#${H.text};background:#fff;max-width:840px;margin:0 auto;padding:0 16px 24px}
.band{background:linear-gradient(120deg,#${H.navy},#${H.blue});color:#fff;padding:18px 22px;margin:0 -16px 18px;border-bottom:3px solid #${H.lime}}
.band h1{margin:0;font-size:20pt;border:0;color:#fff}.band .d{opacity:.85;font-size:9pt;margin-top:4px}
h1,h2,h3{line-height:1.25}h1{color:#${H.navy};font-size:18pt;border-bottom:3px solid #${H.lime};padding-bottom:4px}
h2{color:#${H.navy};font-size:14pt;margin-top:22px;border-bottom:3px solid #${H.lime};padding-bottom:3px}h3{color:#${H.blue};font-size:12pt}
a{color:#${H.light}}table{border-collapse:collapse;width:100%;margin:10px 0;font-size:9.5pt}
th{background:#${H.blue};color:#fff;text-align:left;padding:6px 8px;border-bottom:3px solid #${H.lime}}
td{padding:5px 8px;border-bottom:1px solid #${H.line};font-variant-numeric:tabular-nums}tr:nth-child(even) td{background:#${H.zebra}}
code,pre{font-family:Consolas,monospace;background:#${H.bg}}pre{padding:8px;overflow:auto}
blockquote{border-left:4px solid #${H.lime};margin-left:0;padding:6px 12px;background:#${H.bg};color:#${H.text2}}
img{max-width:100%}.foot{margin-top:28px;border-top:1px solid #${H.line};padding-top:6px;color:#${H.text2};font-size:8pt}
@media print{body{max-width:none}}
</style></head><body><div class="band"><h1>${esc(title)}</h1><div class="d">Édité le ${fmtDateFr()}</div></div>${bodyHtml}<div class="foot">${esc(title)} · ${fmtDateFr()}</div></body></html>`;
}

/** Paragraph properties in the order the schema imposes (Word is strict about it). */
const PPR_ORDER = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'];
export function orderPPr(xml: string): string {
  return xml.replace(/<w:pPr>([\s\S]*?)<\/w:pPr>/g, (m, body: string) => {
    const kids = [...body.matchAll(/<w:(\w+)\b[^>]*?(?:\/>|>[\s\S]*?<\/w:\1>)/g)];
    if (kids.map((k) => k[0]).join('') !== body) return m; // unusual content: left as it is
    const rank = (t: string) => {
      const i = PPR_ORDER.indexOf(t);
      return i < 0 ? 999 : i;
    };
    return `<w:pPr>${[...kids].sort((a, b) => rank(a[1]!) - rank(b[1]!)).map((k) => k[0]).join('')}</w:pPr>`;
  });
}
