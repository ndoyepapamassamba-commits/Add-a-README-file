/**
 * NATIVE REPRODUCTION — the chosen dashboard image rebuilt as a real Excel sheet, first in the workbook:
 *  - background, frame, page and title band, every card at its measured place with its measured fill / border /
 *    radius → DrawingML shapes;
 *  - KPI tiles → shapes with the label and the value (readable colours, like the picture);
 *  - charts → NATIVE Excel charts (bar / horizontal bar / line / area / pie / donut) in the panel's own colours,
 *    editable, fed by a « Données du tableau de bord » sheet; transparent, so the card shows through;
 *  - tables, texts, images, filters → the exact crop of the photo-faithful reproduction (when given), else text.
 * Same panel ↔ data assignment as the picture (panelPlan). Pure (zip in → zip out); works on any workbook, including
 * one the model wrote itself in Python. Nothing invented: every figure comes from the chat's data.
 */
import { unzipSync, zipSync } from 'fflate';
import type { DashSpec } from './dashClone';
import { colorsFor, fmt, mixH, panelPlan, readableOn, slotTexts, type CloneData, type DataView } from './dashRender';
import { ooxml, type LogoImage } from './officeLogo';

const { read, write, ensurePngType, addOverride, addRel, relsOf, ensureRootNs, NS_R, REL_IMAGE } = ooxml;
const EMU = 12700;
const DASH = 'Tableau de bord';
const DATA = 'Données du tableau de bord';
const xesc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = (c: string) => c.replace('#', '').slice(0, 6).toUpperCase();
const col = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s);

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
let shapeId = 9300;
const anchor = (r: Rect, body: string) =>
  `<xdr:absoluteAnchor><xdr:pos x="${Math.round(r.x * EMU)}" y="${Math.round(r.y * EMU)}"/><xdr:ext cx="${Math.max(1, Math.round(r.w * EMU))}" cy="${Math.max(1, Math.round(r.h * EMU))}"/>${body}<xdr:clientData/></xdr:absoluteAnchor>`;
const xfrm = (r: Rect) => `<a:xfrm><a:off x="${Math.round(r.x * EMU)}" y="${Math.round(r.y * EMU)}"/><a:ext cx="${Math.max(1, Math.round(r.w * EMU))}" cy="${Math.max(1, Math.round(r.h * EMU))}"/></a:xfrm>`;
interface Para {
  text: string;
  size: number;
  color: string;
  bold?: boolean;
}
function shape(r: Rect, o: { fill?: string | null; line?: string | null; lineW?: number; radius?: number; paras?: Para[]; align?: 'l' | 'ctr' | 'r'; anchorV?: 't' | 'ctr'; font: string; name?: string; tight?: boolean }): string {
  const id = ++shapeId;
  const adj = o.radius ? Math.min(50000, Math.round((o.radius / Math.max(1, Math.min(r.w, r.h))) * 100000)) : 0;
  const geom = adj ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adj}"/></a:avLst></a:prstGeom>` : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  const fill = o.fill ? `<a:solidFill><a:srgbClr val="${hex(o.fill)}"/></a:solidFill>` : '<a:noFill/>';
  const line = o.line ? `<a:ln w="${Math.round(Math.max(0.5, o.lineW ?? 0.75) * EMU)}"><a:solidFill><a:srgbClr val="${hex(o.line)}"/></a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>';
  const paras = (o.paras?.length ? o.paras : [{ text: '', size: 10, color: '#000000' }])
    .map((p) => `<a:p><a:pPr algn="${o.align ?? 'ctr'}"/>${p.text ? `<a:r><a:rPr lang="fr-FR" sz="${Math.round(Math.max(6, Math.min(72, p.size)) * 100)}" b="${p.bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${hex(p.color)}"/></a:solidFill><a:latin typeface="${xesc(o.font)}"/></a:rPr><a:t>${xesc(p.text)}</a:t></a:r>` : ''}<a:endParaRPr lang="fr-FR" sz="${Math.round(Math.max(6, p.size) * 100)}"/></a:p>`)
    .join('');
  return anchor(
    r,
    `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="${xesc(o.name ?? `Forme ${id}`)}"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr>${xfrm(r)}${geom}${fill}${line}</xdr:spPr><xdr:txBody><a:bodyPr vertOverflow="overflow" horzOverflow="${o.tight ? 'overflow' : 'clip'}" wrap="${o.tight ? 'none' : 'square'}" lIns="${o.tight ? 0 : 45720}" tIns="${o.tight ? 0 : 22860}" rIns="${o.tight ? 0 : 45720}" bIns="${o.tight ? 0 : 22860}" anchor="${o.anchorV ?? 'ctr'}" rtlCol="0"/><a:lstStyle/>${paras}</xdr:txBody></xdr:sp>`,
  );
}
/** The crop of the reproduction picture that covers `box` (fractions of the image). */
function crop(r: Rect, box: Rect, rid: string): string {
  const id = ++shapeId;
  const k = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100000);
  return anchor(
    r,
    `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="Reproduction ${id}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="${NS_R}" r:embed="${rid}"/><a:srcRect l="${k(box.x)}" t="${k(box.y)}" r="${k(1 - box.x - box.w)}" b="${k(1 - box.y - box.h)}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr>${xfrm(r)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>`,
  );
}
const chartFrame = (r: Rect, rid: string, name: string) => {
  const id = ++shapeId;
  return anchor(
    r,
    `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${xesc(name)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="${NS_R}" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame>`,
  );
};

type ChartKind = 'bar' | 'hbar' | 'line' | 'area' | 'pie' | 'donut';
function chartXml(o: { kind: ChartKind; title: string | null; c0: number; cats: string[]; vals: number[]; valueName: string; colors: string[]; byPoint: boolean; text: string; muted: string; font: string; size: number; labels: boolean; legend: 'none' | 'right' | 'bottom' }): string {
  const q = `'${DATA.replace(/'/g, "''")}'`;
  const n = o.cats.length;
  const ref = (c: number) => `${q}!$${col(c)}$2:$${col(c)}$${n + 1}`;
  const max = Math.max(0, ...o.vals.map(Math.abs));
  const short = max >= 1e9 ? '#,##0.0,,," Md"' : max >= 1e6 ? '#,##0.0,," M"' : max >= 1e4 ? '#,##0' : '#,##0.##';
  const sz = Math.round(o.size * 100);
  const txt = (color: string, s = sz, bold = false) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${s}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${hex(color)}"/></a:solidFill><a:latin typeface="${xesc(o.font)}"/></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>`;
  const solid = (c: string) => `<a:solidFill><a:srgbClr val="${hex(c)}"/></a:solidFill>`;
  const pie = o.kind === 'pie' || o.kind === 'donut';
  const dpts = o.byPoint || pie ? o.colors.slice(0, n).map((c, k) => `<c:dPt><c:idx val="${k}"/>${pie ? '' : '<c:invertIfNegative val="0"/>'}<c:bubble3D val="0"/><c:spPr>${solid(c)}${pie ? `<a:ln w="12700">${solid('#FFFFFF')}</a:ln>` : ''}</c:spPr></c:dPt>`).join('') : '';
  const main = o.colors[0] ?? '#4472C4';
  const sp =
    o.kind === 'line'
      ? `<c:spPr><a:ln w="28575" cap="rnd">${solid(main)}</a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${solid(main)}</c:spPr></c:marker>`
      : o.kind === 'area'
        ? `<c:spPr><a:solidFill><a:srgbClr val="${hex(o.colors[1] ?? main)}"><a:alpha val="45000"/></a:srgbClr></a:solidFill><a:ln w="22225">${solid(main)}</a:ln></c:spPr>`
        : pie
          ? ''
          : `<c:spPr>${solid(main)}</c:spPr><c:invertIfNegative val="0"/>`;
  const dLbls = o.labels || pie
    ? `<c:dLbls><c:numFmt formatCode="${xesc(pie ? '0%' : short)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txt(pie ? '#FFFFFF' : o.muted, Math.round(sz * 0.9))}${pie ? '' : `<c:dLblPos val="${o.kind === 'line' || o.kind === 'area' ? 't' : 'outEnd'}"/>`}<c:showLegendKey val="0"/><c:showVal val="${pie ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${pie ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>`
    : '';
  const ser = `<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>${xesc(`${q}!$${col(o.c0 + 1)}$1`)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xesc(o.valueName)}</c:v></c:pt></c:strCache></c:strRef></c:tx>${sp}${dpts}${dLbls}<c:cat><c:strRef><c:f>${xesc(ref(o.c0))}</c:f><c:strCache><c:ptCount val="${n}"/>${o.cats.map((c, i) => `<c:pt idx="${i}"><c:v>${xesc(c)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${xesc(ref(o.c0 + 1))}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${o.vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val>${o.kind === 'line' ? '<c:smooth val="0"/>' : ''}</c:ser>`;
  const hidden = '<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>';
  const axes = `<c:catAx><c:axId val="711"/><c:scaling><c:orientation val="${o.kind === 'hbar' ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${o.kind === 'hbar' ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525">${solid(mixH(o.muted, '#FFFFFF', 0.5))}</a:ln></c:spPr>${txt(o.text, Math.round(sz * 0.9))}<c:crossAx val="712"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="712"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${o.labels ? 1 : 0}"/><c:axPos val="${o.kind === 'hbar' ? 'b' : 'l'}"/><c:numFmt formatCode="${xesc(short)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${hidden}${txt(o.muted, Math.round(sz * 0.85))}<c:crossAx val="711"/><c:crosses val="${o.kind === 'hbar' ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`;
  const plot =
    o.kind === 'pie'
      ? `<c:pieChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/></c:pieChart>`
      : o.kind === 'donut'
        ? `<c:doughnutChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/><c:holeSize val="58"/></c:doughnutChart>`
        : o.kind === 'line'
          ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}<c:marker val="1"/><c:axId val="711"/><c:axId val="712"/></c:lineChart>${axes}`
          : o.kind === 'area'
            ? `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}<c:axId val="711"/><c:axId val="712"/></c:areaChart>${axes}`
            : `<c:barChart><c:barDir val="${o.kind === 'hbar' ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${ser}<c:gapWidth val="55"/><c:axId val="711"/><c:axId val="712"/></c:barChart>${axes}`;
  const legend = pie && o.legend !== 'none' ? `<c:legend><c:legendPos val="${o.legend === 'bottom' ? 'b' : 'r'}"/><c:overlay val="0"/>${txt(o.text, Math.round(sz * 0.9))}</c:legend>` : '';
  const title = o.title === null ? '<c:autoTitleDeleted val="1"/>' : `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${Math.round(sz * 1.1)}" b="1"><a:solidFill><a:srgbClr val="${hex(o.text)}"/></a:solidFill><a:latin typeface="${xesc(o.font)}"/></a:defRPr></a:pPr><a:r><a:rPr lang="fr-FR" sz="${Math.round(sz * 1.1)}" b="1"><a:solidFill><a:srgbClr val="${hex(o.text)}"/></a:solidFill><a:latin typeface="${xesc(o.font)}"/></a:rPr><a:t>${xesc(o.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${NS_R}"><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:chartSpace>`;
}

/** Inline-string worksheet (data blocks for the charts). */
function dataSheetXml(blocks: { c0: number; head: [string, string]; cats: string[]; vals: number[] }[]): string {
  const rows = new Map<number, string[]>();
  const put = (r: number, c: number, cell: string) => {
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r)!.push(cell);
  };
  const str = (r: number, c: number, v: string) => put(r, c, `<c r="${col(c)}${r}" t="inlineStr"><is><t>${xesc(v)}</t></is></c>`);
  const num = (r: number, c: number, v: number) => put(r, c, `<c r="${col(c)}${r}"><v>${Number.isFinite(v) ? v : 0}</v></c>`);
  for (const b of blocks) {
    str(1, b.c0, b.head[0]);
    str(1, b.c0 + 1, b.head[1]);
    b.cats.forEach((c, i) => {
      str(i + 2, b.c0, c);
      num(i + 2, b.c0 + 1, b.vals[i] ?? 0);
    });
  }
  const body = [...rows.keys()].sort((a, b) => a - b).map((r) => `<row r="${r}">${rows.get(r)!.join('')}</row>`).join('');
  const cols = blocks.map((b) => `<col min="${b.c0 + 1}" max="${b.c0 + 1}" width="28" customWidth="1"/><col min="${b.c0 + 2}" max="${b.c0 + 2}" width="16" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_R}"><sheetPr><tabColor rgb="FF94A3B8"/></sheetPr>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${body}</sheetData></worksheet>`;
}

export interface NativeCloneResult {
  bytes: Uint8Array;
  charts: number;
  shapes: number;
  crops: number;
}
/**
 * Adds the native reproduction as the FIRST sheet (« Tableau de bord ») and its data as the LAST sheet. `picture` is
 * the photo-faithful rendering (renderCloneSvg rasterised at the same aspect) used for the panels Excel cannot draw.
 * Null when the file is not a workbook or already has the reproduction.
 */
export function addNativeClone(bytes: Uint8Array, spec: DashSpec, d: CloneData, picture?: LogoImage, widthPt = 960): NativeCloneResult | null {
  let z: Record<string, Uint8Array>;
  try {
    z = unzipSync(bytes);
  } catch {
    return null;
  }
  let wb = read(z, 'xl/workbook.xml');
  if (!wb || wb.includes(`name="${DASH}"`) || !/<sheets>/.test(wb)) return null;
  shapeId = 9300;
  const W = widthPt;
  const H = W / spec.aspect;
  const s = W / 1200; // the spec's px values (radius, borders) are given for a 1200 px rendering
  const P = (b: { x: number; y: number; w: number; h: number }): Rect => ({ x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H });
  const font = spec.font.replace(/[<>"]/g, '') || 'Segoe UI';
  const fallback = spec.palette.series.length ? spec.palette.series : [spec.palette.primary, spec.palette.accent];
  const plan = panelPlan(spec, d);
  const parts: string[] = [];
  let shapes = 0;
  let crops = 0;
  // Picture of the reproduction (crops for tables / texts / images).
  let picRid = '';
  const drawing = 'xl/drawings/drawing-dash.xml';
  if (picture) {
    z['xl/media/massamba-dashboard.png'] = picture.png;
    ensurePngType(z);
    picRid = addRel(z, relsOf(drawing), REL_IMAGE, '../media/massamba-dashboard.png', 'rIdDashImg');
  }
  // ON THE IMAGE'S OWN DESIGN: its clean background (content removed) as the sheet's backdrop; only the texts and the
  // data (native charts) are added on it, at the measured places.
  const bgm = /^data:image\/(png|jpeg);base64,(.+)$/.exec(spec.background ?? '');
  const onBg = !!bgm;
  const txt = (r: Rect, text: string, size: number, color: string, o: { bold?: boolean; align?: 'l' | 'ctr' | 'r'; name?: string } = {}) => {
    shapes++;
    return shape(r, { font, tight: true, align: o.align ?? 'l', anchorV: 'ctr', paras: [{ text, size: Math.max(6, size), color, bold: o.bold }], name: o.name });
  };
  if (bgm) {
    const bin = typeof atob === 'function' ? atob(bgm[2]!) : Buffer.from(bgm[2]!, 'base64').toString('binary');
    const bytesBg = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytesBg[k] = bin.charCodeAt(k);
    const ext = bgm[1] === 'png' ? 'png' : 'jpeg';
    z[`xl/media/massamba-design.${ext}`] = bytesBg;
    let ct = read(z, '[Content_Types].xml');
    if (!new RegExp(`Extension="${ext}"`, 'i').test(ct)) ct = ct.replace('</Types>', `<Default Extension="${ext}" ContentType="image/${ext}"/></Types>`);
    write(z, '[Content_Types].xml', ct);
    const rid = addRel(z, relsOf(drawing), REL_IMAGE, `../media/massamba-design.${ext}`, 'rIdDashDesign');
    parts.push(crop({ x: 0, y: 0, w: W, h: H }, { x: 0, y: 0, w: 1, h: 1 }, rid).replace('name="Reproduction', 'name="Design'));
    if (spec.title) {
      const t = P(spec.title.box);
      parts.push(txt({ x: t.x, y: t.y, w: Math.max(t.w, W - t.x - 8), h: t.h }, d.title, t.h * 0.92, spec.title.color, { bold: true, name: 'Titre' }));
    }
    if (spec.subtitle && d.subtitle) {
      const t = P(spec.subtitle.box);
      parts.push(txt({ x: t.x, y: t.y, w: Math.max(t.w, W * 0.4), h: t.h }, d.subtitle, t.h * 0.92, spec.subtitle.color, { name: 'Sous-titre' }));
    }
  }
  const pb = P(spec.pageBox);
  if (onBg) {
    /* frame, page, title band and cards are in the design picture */
  } else {
  parts.push(shape({ x: 0, y: 0, w: W, h: H }, { fill: spec.outer, font, name: 'Fond' }));
  if (spec.frame) {
    const fw = spec.frame.width * W;
    parts.push(shape({ x: Math.max(0, pb.x - fw), y: Math.max(0, pb.y - fw), w: Math.min(W, pb.w + fw * 2), h: Math.min(H, pb.h + fw * 2) }, { fill: spec.frame.color, radius: spec.frame.radius * W, font, name: 'Cadre' }));
  }
  parts.push(shape(pb, { fill: spec.page, radius: spec.frame ? Math.max(0, spec.frame.radius * W - spec.frame.width * W) : 0, font, name: 'Page' }));
  shapes += spec.frame ? 3 : 2;
  if (spec.title) {
    const t = P(spec.title.box);
    parts.push(shape(t, { fill: spec.title.fill, font, align: spec.title.align === 'center' ? 'ctr' : 'l', paras: [{ text: d.title, size: Math.max(10, t.h * 0.62), color: spec.title.color, bold: true }], name: 'Titre' }));
    shapes++;
  }
  }
  // Panels.
  const blocks: { c0: number; head: [string, string]; cats: string[]; vals: number[] }[] = [];
  const charts: { xml: string; rid: string }[] = [];
  spec.panels.forEach((p, i) => {
    const r = P(p.box);
    const fs = Math.max(7, Math.min(13, Math.min(r.h * 0.075, r.w * 0.045) * (W / 960)));
    const { kind, view, kpis } = plan[i]!;
    const tiles = kind === 'kpi' ? Math.max(1, p.tiles) : 1;
    const multiTiles = kind === 'kpi' && tiles > 1 && p.tileFills?.length;
    if (onBg) {
      // Menus / slicers: their buttons are in the picture — their labels become the user's.
      if ((kind === 'filter' || kind === 'title') && p.slots?.length) {
        for (const t of slotTexts(p, d, P, r)) parts.push(txt({ x: t.x, y: t.y, w: Math.max(t.w, t.size * t.text.length * 0.6), h: t.h }, t.text, t.size, t.color, { bold: t.bold }));
        return;
      }
      const tb = p.titleBox ? P(p.titleBox) : null;
      // KPI on its measured figure and title.
      if (kind === 'kpi' && kpis && p.valueBox && tiles === 1) {
        const k = kpis[0]!;
        const vb = P(p.valueBox);
        const centred = Math.abs(vb.x + vb.w / 2 - (r.x + r.w / 2)) < r.w * 0.12;
        parts.push(txt(centred ? { x: r.x, y: vb.y, w: r.w, h: vb.h } : { x: r.x, y: vb.y, w: vb.x + vb.w - r.x, h: vb.h }, k.value, vb.h * 0.92, p.valueColor ?? p.text, { bold: true, align: centred ? 'ctr' : 'r', name: `Indicateur ${i + 1}` }));
        if (tb) parts.push(txt(p.titleAlign === 'center' ? { x: r.x, y: tb.y, w: r.w, h: tb.h } : { x: tb.x, y: tb.y, w: r.x + r.w - tb.x, h: tb.h }, trunc(k.label, 40), tb.h * 0.92, p.titleColor ?? p.text, { align: p.titleAlign === 'center' ? 'ctr' : 'l' }));
        return;
      }
      if (tb && view && ['bar', 'hbar', 'line', 'area', 'pie', 'donut'].includes(kind))
        parts.push(txt(p.titleAlign === 'center' ? { x: r.x, y: tb.y, w: r.w, h: tb.h } : { x: tb.x, y: tb.y, w: r.x + r.w - tb.x, h: tb.h }, trunc((view as DataView).title, Math.round((r.w - (tb.x - r.x)) / (tb.h * 0.5))), tb.h * 0.92, p.titleColor ?? p.text, { bold: true, align: p.titleAlign === 'center' ? 'ctr' : 'l', name: `Titre ${i + 1}` }));
    } else if (!multiTiles) {
      parts.push(shape(r, { fill: p.fill, line: p.border, lineW: Math.max(0.5, p.borderWidth * s), radius: p.radius * s, font, name: `Carte ${i + 1}` }));
      shapes++;
    }
    const pad = Math.max(4, fs * 0.6);
    const tbx = onBg && p.titleBox ? P(p.titleBox) : null;
    const top = tbx ? Math.max(r.y + pad, tbx.y + tbx.h + pad * 0.5) : r.y + pad;
    const inner: Rect = { x: r.x + pad, y: top, w: r.w - pad * 2, h: r.y + r.h - pad - top };
    if (inner.w < 8 || inner.h < 8) return;
    if (kind === 'kpi' && kpis) {
      const gap = tiles > 1 ? inner.w * 0.02 : 0;
      const tw = (inner.w - gap * (tiles - 1)) / tiles;
      kpis.slice(0, tiles).forEach((k, j) => {
        const fill = p.tileFills?.[j] ?? p.fill;
        const valueC = readableOn(fill, [p.colors[0] ?? '', p.text, p.border ?? '']);
        const labelC = readableOn(fill, [mixH(p.text, fill, 0.3), p.text]);
        const vs = Math.min(inner.h * 0.38, tw / Math.max(4, k.value.length * 0.62));
        parts.push(
          shape(
            { x: inner.x + j * (tw + gap), y: inner.y, w: tw, h: inner.h },
            { fill: tiles > 1 && !onBg ? fill : null, radius: tiles > 1 ? Math.max(3, p.radius * s * 0.6) : 0, font, paras: [{ text: trunc(k.label, 30), size: Math.min(fs, inner.h * 0.16), color: labelC }, { text: k.value, size: Math.max(9, vs), color: valueC, bold: true }], name: `Indicateur ${i + 1}.${j + 1}` },
          ),
        );
        shapes++;
      });
      return;
    }
    if (view && ['bar', 'hbar', 'line', 'area', 'pie', 'donut'].includes(kind)) {
      const v = view as DataView;
      const limit = kind === 'pie' || kind === 'donut' ? 6 : kind === 'hbar' ? 8 : kind === 'bar' ? 7 : 12;
      let cats = v.categories.slice(0, limit);
      let vals = v.values.slice(0, limit);
      if ((kind === 'pie' || kind === 'donut') && v.categories.length > limit) {
        const rest = v.values.slice(limit - 1).reduce((a, b) => a + b, 0);
        cats = [...v.categories.slice(0, limit - 1), 'Autres'];
        vals = [...v.values.slice(0, limit - 1), rest];
      }
      if (kind === 'line' || kind === 'area') {
        cats = v.categories.slice(-limit);
        vals = v.values.slice(-limit);
      }
      const c0 = blocks.length * 3;
      blocks.push({ c0, head: [v.title.split(' par ')[1] ?? 'Catégorie', v.valueName], cats, vals });
      const shades = colorsFor(p, cats.length, fallback);
      // Sequential designs: the biggest value takes the darkest shade (as on the picture).
      const order = [...vals.keys()].sort((a, b) => vals[b]! - vals[a]!);
      const colors = kind === 'pie' || kind === 'donut' ? shades : p.sequential ? vals.map((_, k) => shades[order.indexOf(k)]!) : [shades[0]!, p.colors[1] ?? shades[0]!];
      const rid = `rIdDashChart${charts.length + 1}`;
      charts.push({
        rid,
        xml: chartXml({ kind: kind as ChartKind, title: onBg && tbx ? null : trunc(v.title, Math.round(r.w / (fs * 0.55))), c0, cats, vals, valueName: v.valueName, colors, byPoint: p.sequential && kind !== 'line' && kind !== 'area', text: p.text, muted: mixH(p.text, p.fill, 0.4), font, size: fs, labels: p.valueLabels || kind === 'hbar', legend: p.legend }),
      });
      parts.push(chartFrame(inner, rid, `Graphique ${i + 1}`));
      return;
    }
    if (picture && kind !== 'title') {
      parts.push(crop(inner, { x: inner.x / W, y: inner.y / H, w: inner.w / W, h: inner.h / H }, picRid));
      crops++;
      return;
    }
    if (kind === 'text' || kind === 'table') {
      const lines = kind === 'table' ? d.table.rows.slice(0, Math.max(1, Math.floor(inner.h / (fs * 1.6)) - 1)).map((row) => row.slice(0, 4).map((x) => (typeof x === 'number' ? fmt(x) : String(x))).join('   ')) : d.kpis.slice(0, 4).map((k) => `• ${k.label} : ${k.value}`);
      parts.push(shape(inner, { font, align: 'l', anchorV: 't', paras: lines.map((t) => ({ text: trunc(t, Math.round(inner.w / (fs * 0.5))), size: fs, color: p.text })), name: `Texte ${i + 1}` }));
      shapes++;
    }
  });
  // Parts: drawing, chart parts, the two sheets, workbook entries.
  const chartRels: string[] = [];
  charts.forEach((c, k) => {
    const part = `xl/charts/chart-dash-${k + 1}.xml`;
    write(z, part, c.xml);
    addOverride(z, `/${part}`, 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml');
    chartRels.push(`<Relationship Id="${c.rid}" Type="${NS_R}/chart" Target="../charts/chart-dash-${k + 1}.xml"/>`);
  });
  const dRels = relsOf(drawing);
  let rels = read(z, dRels) || `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  rels = rels.replace('</Relationships>', `${chartRels.join('')}</Relationships>`);
  write(z, dRels, rels);
  write(z, drawing, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${parts.join('')}</xdr:wsDr>`);
  addOverride(z, `/${drawing}`, 'application/vnd.openxmlformats-officedocument.drawing+xml');
  const sheet = 'xl/worksheets/sheet-dash.xml';
  write(z, sheet, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_R}"><sheetPr><tabColor rgb="FF${hex(spec.palette.primary)}"/><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0" showRowColHeaders="0" zoomScale="100"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData/><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup orientation="${spec.aspect >= 1 ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="1"/><drawing r:id="rIdDashDrawing"/></worksheet>`);
  write(z, relsOf(sheet), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDashDrawing" Type="${NS_R}/drawing" Target="../drawings/drawing-dash.xml"/></Relationships>`);
  addOverride(z, `/${sheet}`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');
  const dataPart = 'xl/worksheets/sheet-dash-data.xml';
  write(z, dataPart, dataSheetXml(blocks));
  addOverride(z, `/${dataPart}`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');
  const rid = addRel(z, 'xl/_rels/workbook.xml.rels', `${NS_R}/worksheet`, 'worksheets/sheet-dash.xml', 'rIdDashSheet');
  const ridData = addRel(z, 'xl/_rels/workbook.xml.rels', `${NS_R}/worksheet`, 'worksheets/sheet-dash-data.xml', 'rIdDashData');
  const ids = [...wb.matchAll(/sheetId="(\d+)"/g)].map((m) => +m[1]!);
  const sheetId = (ids.length ? Math.max(...ids) : 0) + 1;
  wb = ensureRootNs(wb, 'r', NS_R);
  wb = wb.replace(/<sheets>/, `<sheets><sheet name="${DASH}" sheetId="${sheetId}" r:id="${rid}"/>`).replace('</sheets>', `<sheet name="${xesc(DATA)}" sheetId="${sheetId + 1}" r:id="${ridData}"/></sheets>`);
  // The new sheet is first: sheet-scoped names move by one; the workbook opens on it.
  wb = wb.replace(/localSheetId="(\d+)"/g, (_m, n: string) => `localSheetId="${+n + 1}"`);
  wb = /activeTab="\d+"/.test(wb) ? wb.replace(/activeTab="\d+"/, 'activeTab="0"') : wb;
  wb = wb.replace(/firstSheet="\d+"/, 'firstSheet="0"');
  write(z, 'xl/workbook.xml', wb);
  // Only one sheet may be selected (tabSelected) — the reproduction.
  for (const k of Object.keys(z)) if (/^xl\/worksheets\/sheet[^/]*\.xml$/.test(k) && k !== sheet) {
    const x = read(z, k);
    if (x.includes('tabSelected="1"')) write(z, k, x.replace(/\s?tabSelected="1"/g, ''));
  }
  write(z, sheet, read(z, sheet).replace('<sheetView workbookViewId="0"', '<sheetView tabSelected="1" workbookViewId="0"'));
  return { bytes: zipSync(z, { level: 6 }), charts: charts.length, shapes, crops };
}
