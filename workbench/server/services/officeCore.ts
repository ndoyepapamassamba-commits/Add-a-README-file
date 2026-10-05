import { HOUSE, fmtDateFr } from './houseStyle';
// Office deliverables without dependencies (pure): Markdown → Word (.docx),
// Markdown → standalone printable HTML. Shared by the server and the browser.
import { strToU8, zipSync } from 'fflate';

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

function pictureXml(rid: string, id: number, name: string, w: number, h: number): string {
  // Fit within ~16 cm wide, keep aspect ratio (EMU: 9525 per px at 96 dpi).
  const maxW = 6_000_000;
  let cx = w * 9525;
  let cy = h * 9525;
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
  return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders></w:tblPr>${rows
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
): Uint8Array {
  const body: string[] = [];
  const media: { rid: string; file: string; data: Uint8Array }[] = [];
  if (title) {
    // Cover band: navy title with lime filet, then the edition date (dd/mm/yyyy).
    body.push(para(runs(title, { color: 'FFFFFF' }), 'Title'));
    body.push(para(runs(`Édité le ${fmtDateFr()}`, { size: 18, color: HOUSE.text2 })));
  }
  const lines = md.replace(/\r/g, '').split('\n');
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
      body.push(para(runs(h[2]!), `Heading${Math.min(3, h[1]!.length)}`));
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
  const W =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const style = (id: string, name: string, size: number, color: string, extra = '') =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/>${extra}</w:pPr><w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  const lime = `<w:pBdr><w:bottom w:val="single" w:sz="18" w:space="4" w:color="${HOUSE.lime}"/></w:pBdr>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${HOUSE.font}" w:hAnsi="${HOUSE.font}" w:eastAsia="${HOUSE.font}" w:cs="${HOUSE.font}"/><w:color w:val="${HOUSE.text}"/><w:sz w:val="21"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${style('Title', 'Title', 40, 'FFFFFF', `<w:shd w:val="clear" w:color="auto" w:fill="${HOUSE.navy}"/><w:ind w:left="0"/>${lime}`)}${style('Heading1', 'heading 1', 30, HOUSE.navy, lime)}${style('Heading2', 'heading 2', 25, HOUSE.blue)}${style('Heading3', 'heading 3', 22, HOUSE.light)}</w:styles>`;
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
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
        .join('')}</Relationships>`,
    ),
    ...Object.fromEntries(media.map((m) => [`word/media/${m.file}`, m.data])),
    'word/document.xml': strToU8(doc),
    'word/styles.xml': strToU8(styles),
  });
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
