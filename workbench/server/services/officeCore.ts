// Office deliverables without dependencies (pure): Markdown → Word (.docx),
// Markdown → standalone printable HTML. Shared by the server and the browser.
import { strToU8, zipSync } from 'fflate';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Inline Markdown (bold, italic, code, links) → WordprocessingML runs. */
function runs(text: string, base: { bold?: boolean; size?: number } = {}): string {
  const out: string[] = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  const run = (t: string, o: { b?: boolean; i?: boolean; code?: boolean; link?: boolean } = {}) => {
    if (!t) return;
    const props = [
      o.b || base.bold ? '<w:b/>' : '',
      o.i ? '<w:i/>' : '',
      o.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : '',
      o.link ? '<w:color w:val="1F5FBF"/><w:u w:val="single"/>' : '',
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
  const cell = (t: string, header: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(9000 / cols)}" w:type="dxa"/>${header ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EEF7"/>' : ''}</w:tcPr>${para(runs(t, { bold: header, size: 18 }))}</w:tc>`;
  const border =
    '<w:top w:val="single" w:sz="4" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:color="BFBFBF"/>';
  return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders></w:tblPr>${rows
    .map(
      (r, i) => `<w:tr>${Array.from({ length: cols }, (_, j) => cell(r[j] ?? '', i === 0)).join('')}</w:tr>`,
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
  if (title) body.push(para(runs(title), 'Title'));
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
  const style = (id: string, name: string, size: number, extra = '') =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/>${extra}</w:pPr><w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${style('Title', 'Title', 40)}${style('Heading1', 'heading 1', 32)}${style('Heading2', 'heading 2', 26)}${style('Heading3', 'heading 3', 23)}</w:styles>`;
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

/** Wraps rendered HTML in a clean, printable page (A4, print-to-PDF friendly). */
export function printableHtml(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:A4;margin:18mm}body{font:11pt/1.5 Calibri,'Segoe UI',Arial,sans-serif;color:#1d1d1d;max-width:820px;margin:24px auto;padding:0 16px}
h1,h2,h3{color:#1F3864;line-height:1.25}h1{font-size:22pt;border-bottom:2px solid #1F3864;padding-bottom:6px}h2{font-size:15pt;margin-top:22px}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:10pt}th,td{border:1px solid #bfbfbf;padding:5px 8px;text-align:left}th{background:#e8eef7}
code,pre{font-family:Consolas,monospace;background:#f2f2f2}pre{padding:8px;overflow:auto}blockquote{border-left:3px solid #bfbfbf;margin-left:0;padding-left:12px;color:#555}
@media print{body{margin:0;max-width:none}}
</style></head><body>${bodyHtml}</body></html>`;
}
