/**
 * OFFICE LOGO — the logo the user chose (already harmonised with the palette) is placed in every deliverable,
 * whatever produced it (native exporter or the model's own Python / JS):
 *  - Excel: top-right of the title band of the first sheet (a drawing next to the existing charts);
 *  - Word: in the page header (every page), right-aligned;
 *  - PowerPoint: top-right corner of every slide;
 *  - HTML (dashboards, reports, mails, sites): in the header band, or at the top of the page.
 * Pure (zip bytes in → zip bytes out). A file that already carries the logo is left untouched (idempotent).
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export interface LogoImage {
  png: Uint8Array;
  width: number;
  height: number;
}
const MEDIA = 'massamba-logo.png';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const EMU_PT = 12700;

type Zip = Record<string, Uint8Array>;
const read = (z: Zip, p: string) => (z[p] ? strFromU8(z[p]!) : '');
const write = (z: Zip, p: string, s: string) => {
  z[p] = strToU8(s);
};
function ensurePngType(z: Zip): void {
  let ct = read(z, '[Content_Types].xml');
  if (!/Extension="png"/i.test(ct)) ct = ct.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
  write(z, '[Content_Types].xml', ct);
}
function addOverride(z: Zip, part: string, type: string): void {
  let ct = read(z, '[Content_Types].xml');
  if (!ct.includes(`PartName="${part}"`)) ct = ct.replace('</Types>', `<Override PartName="${part}" ContentType="${type}"/></Types>`);
  write(z, '[Content_Types].xml', ct);
}
/** Adds a relationship (creating the .rels file if needed); returns its id. */
function addRel(z: Zip, relsPath: string, type: string, target: string, id: string): string {
  let rels = read(z, relsPath) || `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  const existing = new RegExp(`Id="([^"]+)"[^>]*Target="${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).exec(rels);
  if (existing) return existing[1]!;
  let rid = id;
  for (let i = 2; rels.includes(`Id="${rid}"`); i++) rid = `${id}${i}`;
  rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="${type}" Target="${target}"/></Relationships>`);
  write(z, relsPath, rels);
  return rid;
}
const relsOf = (part: string) => {
  const i = part.lastIndexOf('/');
  return `${part.slice(0, i)}/_rels/${part.slice(i + 1)}.rels`;
};
/**
 * Declares a namespace prefix on the ROOT element when the root itself lacks it. A declaration on a child element
 * (openpyxl writes xmlns:r on each <sheet>) does not cover a new element inserted next to it.
 */
export function ensureRootNs(xml: string, prefix: string, uri: string): string {
  const m = /<([A-Za-z_][\w:.-]*)([^>]*)>/.exec(xml);
  if (!m || new RegExp(`\\sxmlns:${prefix}=`).test(m[2]!)) return xml;
  return `${xml.slice(0, m.index)}<${m[1]} xmlns:${prefix}="${uri}"${m[2]}>${xml.slice(m.index + m[0].length)}`;
}
/** Zip-part helpers shared with the native dashboard builder (cloneXlsx). */
export const ooxml = { read, write, ensurePngType, addOverride, addRel, relsOf, ensureRootNs, NS_R, REL_IMAGE };
const resolveTarget = (from: string, target: string) => {
  if (target.startsWith('/')) return target.slice(1); // absolute part name (openpyxl writes « /xl/drawings/… »)
  const parts = from.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
};
const colIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const size = (logo: LogoImage, heightPt: number) => {
  const cy = Math.round(heightPt * EMU_PT);
  return { cx: Math.round((cy * logo.width) / Math.max(1, logo.height)), cy };
};

// ── Excel ────────────────────────────────────────────────────────────────────────────────────────────────────────────
function xlsxLogo(z: Zip, logo: LogoImage): boolean {
  const sheet = 'xl/worksheets/sheet1.xml';
  let xml = read(z, sheet);
  if (!xml) return false;
  z[`xl/media/${MEDIA}`] = logo.png;
  ensurePngType(z);
  const { cx, cy } = size(logo, 30);
  // Right part of the title band: two columns before the last used one.
  const dim = /<dimension ref="[A-Z]+\d+:([A-Z]+)\d+"/.exec(xml);
  const col = Math.max(3, (dim ? colIndex(dim[1]!) : 6) - 1);
  const anchor = `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>50800</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="9001" name="Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="${NS_R}" r:embed="RID"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
  const sheetRels = relsOf(sheet);
  const drawingId = /<drawing r:id="([^"]+)"/.exec(xml)?.[1];
  let drawing: string;
  if (drawingId) {
    const target = new RegExp(`Id="${drawingId}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${drawingId}"`).exec(read(z, sheetRels));
    drawing = resolveTarget(sheet, (target?.[1] ?? target?.[2])!);
  } else {
    drawing = 'xl/drawings/drawing-logo.xml';
    write(z, drawing, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"></xdr:wsDr>`);
    addOverride(z, `/${drawing}`, 'application/vnd.openxmlformats-officedocument.drawing+xml');
    const rid = addRel(z, sheetRels, `${NS_R}/drawing`, '../drawings/drawing-logo.xml', 'rIdLogoDrawing');
    xml = ensureRootNs(xml, 'r', NS_R);
    const tag = `<drawing r:id="${rid}"/>`;
    const before = /<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/.exec(xml);
    xml = before ? xml.slice(0, before.index) + tag + xml.slice(before.index) : xml.replace('</worksheet>', `${tag}</worksheet>`);
    write(z, sheet, xml);
  }
  const imgRid = addRel(z, relsOf(drawing), REL_IMAGE, `../media/${MEDIA}`, 'rIdLogoImg');
  let dx = ensureRootNs(ensureRootNs(read(z, drawing), 'xdr', 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'), 'a', 'http://schemas.openxmlformats.org/drawingml/2006/main');
  dx = dx.replace(/<\/((?:xdr:)?wsDr)>\s*$/, (_m, tag: string) => `${anchor.replace('RID', imgRid)}</${tag}>`);
  write(z, drawing, dx);
  return true;
}

// ── Word ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
function docxLogo(z: Zip, logo: LogoImage): boolean {
  const doc = 'word/document.xml';
  let xml = read(z, doc);
  if (!xml) return false;
  z[`word/media/${MEDIA}`] = logo.png;
  ensurePngType(z);
  const { cx, cy } = size(logo, 30);
  const para = `<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:after="0"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="9001" name="Logo"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="9001" name="${MEDIA}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="RID"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  const docRels = relsOf(doc);
  const sect = /<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/g;
  const lastSect = [...xml.matchAll(sect)].pop();
  const existingHeader = lastSect && /<w:headerReference\b[^>]*w:type="default"[^>]*r:id="([^"]+)"/.exec(lastSect[0]);
  let header: string;
  if (existingHeader) {
    const t = new RegExp(`Id="${existingHeader[1]}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${existingHeader[1]}"`).exec(read(z, docRels));
    header = resolveTarget(doc, (t?.[1] ?? t?.[2])!);
    const imgRid = addRel(z, relsOf(header), REL_IMAGE, `media/${MEDIA}`, 'rIdLogoImg');
    let h = read(z, header);
    h = ensureRootNs(ensureRootNs(h, 'wp', 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'), 'r', NS_R);
    write(z, header, h.replace(/(<w:hdr\b[^>]*>)/, `$1${para.replace('RID', imgRid)}`));
    return true;
  }
  header = 'word/header-logo.xml';
  const imgRid = addRel(z, relsOf(header), REL_IMAGE, `media/${MEDIA}`, 'rIdLogoImg');
  write(z, header, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${NS_R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">${para.replace('RID', imgRid)}</w:hdr>`);
  addOverride(z, `/${header}`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml');
  const hRid = addRel(z, docRels, `${NS_R}/header`, 'header-logo.xml', 'rIdLogoHeader');
  const ref = `<w:headerReference w:type="default" r:id="${hRid}"/>`;
  xml = ensureRootNs(xml, 'r', NS_R);
  if (lastSect) {
    const s = lastSect[0];
    const withRef = s.endsWith('/>') ? s.replace(/\/>$/, `>${ref}</w:sectPr>`) : s.replace(/(<w:sectPr\b[^>]*>)/, `$1${ref}`);
    xml = xml.slice(0, lastSect.index) + withRef + xml.slice(lastSect.index! + s.length);
  } else xml = xml.replace('</w:body>', `<w:sectPr>${ref}</w:sectPr></w:body>`);
  write(z, doc, xml);
  return true;
}

// ── PowerPoint ───────────────────────────────────────────────────────────────────────────────────────────────────────
function pptxLogo(z: Zip, logo: LogoImage): boolean {
  const slides = Object.keys(z).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k));
  if (!slides.length) return false;
  z[`ppt/media/${MEDIA}`] = logo.png;
  ensurePngType(z);
  const sz = /<p:sldSz\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(read(z, 'ppt/presentation.xml'));
  const [W, H] = sz ? [+sz[1]!, +sz[2]!] : [12192000, 6858000];
  const cy = Math.round(H * 0.075);
  const cx = Math.round((cy * logo.width) / Math.max(1, logo.height));
  const x = W - cx - 274320;
  const y = 164592;
  for (const s of slides) {
    const rid = addRel(z, relsOf(s), REL_IMAGE, `../media/${MEDIA}`, 'rIdLogoImg');
    let xml = read(z, s);
    xml = ensureRootNs(xml, 'r', NS_R);
    const pic = `<p:pic><p:nvPicPr><p:cNvPr id="9001" name="Logo"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    write(z, s, xml.replace(/<\/p:spTree>/, `${pic}</p:spTree>`));
  }
  return true;
}

/** Put the logo in an Office file. Returns null when it is not an Office file or already carries the logo. */
export function addLogoToOffice(path: string, bytes: Uint8Array, logo: LogoImage): Uint8Array | null {
  let z: Zip;
  try {
    z = unzipSync(bytes);
  } catch {
    return null;
  }
  if (Object.keys(z).some((k) => k.endsWith(`/media/${MEDIA}`))) return null;
  const ok = /\.xlsx$|\.xlsm$/i.test(path) ? xlsxLogo(z, logo) : /\.docx$/i.test(path) ? docxLogo(z, logo) : /\.pptx$/i.test(path) ? pptxLogo(z, logo) : false;
  return ok ? zipSync(z, { level: 6 }) : null;
}

/** Put the logo in an HTML page: inside its header band when there is one, else at the top of the page. */
export function addLogoToHtml(html: string, dataUrl: string): string {
  if (/data-brand-logo/.test(html)) return html;
  const img = `<img data-brand-logo src="${dataUrl}" alt="logo" style="height:42px;width:auto;float:right;margin:0 0 6px 16px">`;
  const header = /<header\b[^>]*>/i.exec(html);
  if (header) return html.slice(0, header.index + header[0].length) + img + html.slice(header.index + header[0].length);
  const body = /<body\b[^>]*>/i.exec(html);
  const block = `<div data-brand-logo-wrap style="text-align:right;padding:10px 16px 0">${img.replace('float:right;', '')}</div>`;
  if (body) return html.slice(0, body.index + body[0].length) + block + html.slice(body.index + body[0].length);
  return block + html;
}

/**
 * A FIRST sheet « Tableau de bord » holding a picture (the dashboard reproduction with the real data). Sheet-scoped
 * defined names (filters, print areas) are shifted so they keep pointing at their own sheet.
 */
export function addImageSheet(bytes: Uint8Array, img: LogoImage, name = 'Tableau de bord', widthPx = 1200): Uint8Array | null {
  let z: Zip;
  try {
    z = unzipSync(bytes);
  } catch {
    return null;
  }
  let wb = read(z, 'xl/workbook.xml');
  if (!wb || wb.includes(`name="${name}"`)) return null;
  const media = 'massamba-dashboard.png';
  z[`xl/media/${media}`] = img.png;
  ensurePngType(z);
  const sheet = 'xl/worksheets/sheet-dashboard.xml';
  const drawing = 'xl/drawings/drawing-dashboard.xml';
  const cx = Math.round(widthPx * 9525);
  const cy = Math.round(((widthPx * img.height) / Math.max(1, img.width)) * 9525);
  write(z, sheet, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_R}"><sheetPr><tabColor rgb="FF1F4E79"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="90"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData/><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="1"/><drawing r:id="rIdDashDrawing"/></worksheet>`);
  write(z, relsOf(sheet), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDashDrawing" Type="${NS_R}/drawing" Target="../drawings/drawing-dashboard.xml"/></Relationships>`);
  write(z, drawing, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>95250</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>95250</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="9101" name="Tableau de bord"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="${NS_R}" r:embed="rIdDashImg"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
  addRel(z, relsOf(drawing), REL_IMAGE, `../media/${media}`, 'rIdDashImg');
  addOverride(z, `/${sheet}`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');
  addOverride(z, `/${drawing}`, 'application/vnd.openxmlformats-officedocument.drawing+xml');
  const rid = addRel(z, 'xl/_rels/workbook.xml.rels', `${NS_R}/worksheet`, 'worksheets/sheet-dashboard.xml', 'rIdDashSheet');
  const ids = [...wb.matchAll(/sheetId="(\d+)"/g)].map((m) => +m[1]!);
  const sheetId = (ids.length ? Math.max(...ids) : 0) + 1;
  wb = ensureRootNs(wb, 'r', NS_R);
  wb = wb.replace(/<sheets>/, `<sheets><sheet name="${name}" sheetId="${sheetId}" r:id="${rid}"/>`);
  // The new sheet is first: sheet-scoped names move by one.
  wb = wb.replace(/localSheetId="(\d+)"/g, (_m, n: string) => `localSheetId="${+n + 1}"`);
  wb = wb.replace(/activeTab="\d+"/, 'activeTab="0"');
  write(z, 'xl/workbook.xml', wb);
  return zipSync(z, { level: 6 });
}

/** Word: the picture as the FIRST page (full width), followed by a page break. */
export function addImagePageDocx(bytes: Uint8Array, img: LogoImage): Uint8Array | null {
  let z: Zip;
  try {
    z = unzipSync(bytes);
  } catch {
    return null;
  }
  const doc = 'word/document.xml';
  let xml = read(z, doc);
  if (!xml || xml.includes('massamba-dashboard.png')) return null;
  z['word/media/massamba-dashboard.png'] = img.png;
  ensurePngType(z);
  const rid = addRel(z, relsOf(doc), REL_IMAGE, 'media/massamba-dashboard.png', 'rIdDashImg');
  // 17 cm wide max (A4 portrait text width), height in proportion, capped to the page.
  let cx = Math.round(17 * 360000);
  let cy = Math.round((cx * img.height) / Math.max(1, img.width));
  const maxCy = Math.round(24 * 360000);
  if (cy > maxCy) {
    cx = Math.round((cx * maxCy) / cy);
    cy = maxCy;
  }
  const para = `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="9201" name="Tableau de bord"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="9201" name="massamba-dashboard.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  xml = ensureRootNs(ensureRootNs(xml, 'wp', 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'), 'r', NS_R);
  write(z, doc, xml.replace(/<w:body>/, `<w:body>${para}`));
  return zipSync(z, { level: 6 });
}

/** PowerPoint: a NEW first slide holding the picture (fitted to the slide, centred). */
export function addImageSlidePptx(bytes: Uint8Array, img: LogoImage): Uint8Array | null {
  let z: Zip;
  try {
    z = unzipSync(bytes);
  } catch {
    return null;
  }
  const pres = read(z, 'ppt/presentation.xml');
  if (!pres || z['ppt/slides/slide-dashboard.xml']) return null;
  const sz = /<p:sldSz\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(pres);
  const [W, H] = sz ? [+sz[1]!, +sz[2]!] : [12192000, 6858000];
  // Slide layout: the one used by the first existing slide.
  const firstRels = read(z, 'ppt/slides/_rels/slide1.xml.rels');
  const layout = /Target="(\.\.\/slideLayouts\/[^"]+)"/.exec(firstRels)?.[1] ?? '../slideLayouts/slideLayout1.xml';
  const k = Math.min((W * 0.94) / img.width, (H * 0.92) / img.height);
  const cx = Math.round(img.width * k);
  const cy = Math.round(img.height * k);
  const slide = 'ppt/slides/slide-dashboard.xml';
  write(z, slide, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${NS_R}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:pic><p:nvPicPr><p:cNvPr id="9301" name="Tableau de bord"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdDashImg"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${Math.round((W - cx) / 2)}" y="${Math.round((H - cy) / 2)}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
  write(z, relsOf(slide), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="${NS_R}/slideLayout" Target="${layout}"/><Relationship Id="rIdDashImg" Type="${REL_IMAGE}" Target="../media/massamba-dashboard.png"/></Relationships>`);
  z['ppt/media/massamba-dashboard.png'] = img.png;
  ensurePngType(z);
  addOverride(z, `/${slide}`, 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml');
  const rid = addRel(z, 'ppt/_rels/presentation.xml.rels', `${NS_R}/slide`, 'slides/slide-dashboard.xml', 'rIdDashSlide');
  const ids = [...pres.matchAll(/<p:sldId\b[^>]*id="(\d+)"/g)].map((m) => +m[1]!);
  const id = Math.max(255, ...ids) + 1;
  write(z, 'ppt/presentation.xml', pres.replace(/<p:sldIdLst>/, `<p:sldIdLst><p:sldId id="${id}" r:id="${rid}"/>`));
  return zipSync(z, { level: 6 });
}

/** HTML (report, printable PDF, mail): the reproduction at the top of the page. */
export function addImageToHtml(html: string, dataUrl: string): string {
  if (/data-dash-reproduction/.test(html)) return html;
  const block = `<div data-dash-reproduction style="margin:0 0 18px"><img src="${dataUrl}" alt="tableau de bord" style="width:100%;max-width:1100px;height:auto;display:block;margin:0 auto"></div>`;
  const body = /<body\b[^>]*>/i.exec(html);
  return body ? html.slice(0, body.index + body[0].length) + block + html.slice(body.index + body[0].length) : block + html;
}
