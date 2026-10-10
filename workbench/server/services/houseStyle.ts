// House style "GOD 3D · BLUE ECOBANK" (pure, shared by the server and the direct edition): one LOCKED visual identity
// for every deliverable — Excel, Word, PowerPoint, printable HTML / PDF and mail. All values come from houseDesign.ts
// (relevés sur le classeur de référence « Impayés 30-90j plan d'actions »); nothing here is configurable.
import XLSXS from 'xlsx-js-style';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { DESIGN_RULES, activeDesign, liveColorProxy, type Design } from './houseDesign';
import { analyse3d, shade } from './chart3d';

const C = liveColorProxy((c) => c) as Design['color'];
/** Legacy token names kept for the Word / HTML / mail builders. `lime` is now the GOLD accent filet. */
export const HOUSE = liveColorProxy((C, D) => ({
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
  font: D.font.ui,
  mono: D.font.mono,
  gold: C.gold,
  cyan: C.cyan,
  ice: C.ice,
  panel: C.panel,
  input: C.input,
  subtle: C.subtle,
}));

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
  const zoom = o.zoom ?? activeDesign().xlsx.zoom;
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

export type ChartKind = 'bar' | 'line' | 'pie' | 'none';
/** Native kinds: flat (bar / line / pie) and Excel's own 3D charts (columns, horizontal bars, pie) — editable in Excel. */
export type NativeKind = Exclude<ChartKind, 'none'> | 'bar3d' | 'hbar3d' | 'pie3d';
interface ChartSpec {
  kind: NativeKind;
  title: string;
  sheet: string;
  /** 1-based first / last data row. */
  first: number;
  last: number;
  /** 0-based anchor column / row (top-left). */
  anchorCol: number;
  anchorRow: number;
  /** Absolute placement in points (Maison 2.0 chart zone above the table); overrides the cell anchor. */
  abs?: { x: number; y: number; w: number; h: number };
  cat: { col: number; name: string; values: string[] };
  series: { col: number; name: string; values: number[] }[];
}
const xesc = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Native Excel chart in the locked palette (series colours from activeDesign().chartSeries, Segoe UI, ice grid). */
export function addNativeChart(bytes: Uint8Array, c: ChartSpec): Uint8Array {
  return addNativeCharts(bytes, [c]);
}
/** Several native charts on the first sheet (one drawing, one chart part each). */
export function addNativeCharts(bytes: Uint8Array, specs: ChartSpec[]): Uint8Array {
  const z = unzipSync(bytes);
  const sheetKey = 'xl/worksheets/sheet1.xml';
  if (!z[sheetKey] || !specs.length) return bytes;
  const parts = specs.map((c, i) => ({ xml: chartXml(c), anchor: chartAnchor(c, i) }));
  const drawing = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${parts.map((p) => p.anchor).join('')}</xdr:wsDr>`;
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const drawingRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${specs.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/chart" Target="../charts/chart${i + 1}.xml"/>`).join('')}</Relationships>`;
  let sheet = strFromU8(z[sheetKey]!);
  sheet = sheet.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>');
  let ct = strFromU8(z['[Content_Types].xml']!);
  ct = ct.replace(
    '</Types>',
    `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>${specs.map((_, i) => `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')}</Types>`,
  );
  const out: Record<string, Uint8Array> = {
    ...z,
    [sheetKey]: strToU8(sheet),
    '[Content_Types].xml': strToU8(ct),
    'xl/worksheets/_rels/sheet1.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`),
    'xl/drawings/drawing1.xml': strToU8(drawing),
    'xl/drawings/_rels/drawing1.xml.rels': strToU8(drawingRels),
  };
  parts.forEach((p, i) => (out[`xl/charts/chart${i + 1}.xml`] = strToU8(p.xml)));
  return zipSync(out);
}
const EMU_PT = 12700;
function chartAnchor(c: ChartSpec, i: number): string {
  const frame = `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Graphique ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/>`;
  if (c.abs)
    return `<xdr:absoluteAnchor><xdr:pos x="${Math.round(c.abs.x * EMU_PT)}" y="${Math.round(c.abs.y * EMU_PT)}"/><xdr:ext cx="${Math.round(c.abs.w * EMU_PT)}" cy="${Math.round(c.abs.h * EMU_PT)}"/>${frame}</xdr:absoluteAnchor>`;
  return `<xdr:twoCellAnchor><xdr:from><xdr:col>${c.anchorCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.anchorRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c.anchorCol + 9}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.anchorRow + 20}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>${frame}</xdr:twoCellAnchor>`;
}
function chartXml(c: ChartSpec): string {
  const q = `'${c.sheet.replace(/'/g, "''")}'`;
  const is3d = c.kind === 'bar3d' || c.kind === 'hbar3d' || c.kind === 'pie3d';
  const pieLike = c.kind === 'pie' || c.kind === 'pie3d';
  const max = Math.max(0, ...c.series.flatMap((s) => s.values.map((v) => Math.abs(v))));
  // Value labels in the reference's short form: « 1,8 Mds », « 469 M ».
  const shortFmt = max >= 1e9 ? '#,##0.0,,," Mds"' : max >= 1e6 ? '#,##0,," M"' : '#,##0';
  const rngOf = (col: number) =>
    `${q}!$${XLSXS.utils.encode_col(col)}$${c.first}:$${XLSXS.utils.encode_col(col)}$${c.last}`;
  const txt = (sz: number, color: string, bold = false) =>
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${activeDesign().font.ui}"/></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>`;
  const catXml = `<c:cat><c:strRef><c:f>${xesc(rngOf(c.cat.col))}</c:f><c:strCache><c:ptCount val="${c.cat.values.length}"/>${c.cat.values.map((v, i) => `<c:pt idx="${i}"><c:v>${xesc(v)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`;
  const ser = c.series
    .map((s, i) => {
      const color = activeDesign().chartSeries[i % activeDesign().chartSeries.length]!;
      // 3D faces lit like the reference: a light reflection on the left, the colour, a darker right edge.
      const grad = (base: string) =>
        `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${shade(`#${base}`, -0.05).slice(1).toUpperCase()}"/></a:gs><a:gs pos="25000"><a:srgbClr val="${shade(`#${base}`, 0.35).slice(1).toUpperCase()}"/></a:gs><a:gs pos="55000"><a:srgbClr val="${base}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${shade(`#${base}`, -0.25).slice(1).toUpperCase()}"/></a:gs></a:gsLst><a:lin ang="${c.kind === 'hbar3d' ? 5400000 : 0}" scaled="1"/></a:gradFill>`;
      const sp =
        c.kind === 'bar3d' || c.kind === 'hbar3d'
          ? `<c:spPr>${grad(color)}</c:spPr><c:invertIfNegative val="0"/>`
          : c.kind === 'line'
          ? `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr></c:marker>`
          : `<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>`;
      const single = c.series.length === 1;
      const dpts =
        (c.kind === 'bar3d' || c.kind === 'hbar3d') && single
          ? c.cat.values
              .map((_, k) => {
                // one colour per column (reference « montant par plage »); horizontal bars: the leader in gold, others navy.
                const base = c.kind === 'hbar3d' ? (k === 0 ? activeDesign().color.gold : activeDesign().color.navy) : activeDesign().chartSeries[k % activeDesign().chartSeries.length]!;
                return `<c:dPt><c:idx val="${k}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr>${grad(base)}</c:spPr></c:dPt>`;
              })
              .join('')
          : pieLike
          ? c.cat.values
              .map(
                (_, k) =>
                  `<c:dPt><c:idx val="${k}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${activeDesign().chartSeries[k % activeDesign().chartSeries.length]}"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="${activeDesign().color.white}"/></a:solidFill></a:ln></c:spPr></c:dPt>`,
              )
              .join('')
          : '';
      return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>${xesc(`${q}!$${XLSXS.utils.encode_col(s.col)}$${c.first - 1}`)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xesc(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>${pieLike ? '' : sp}${dpts}${pieLike ? '<c:dLbls><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:spPr><a:noFill/></c:spPr>' + txt(900, activeDesign().color.text) + '<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/></c:dLbls>' : is3d ? `<c:dLbls><c:numFmt formatCode="${xesc(shortFmt)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txt(900, activeDesign().color.text, true).replace('<a:latin typeface="' + activeDesign().font.ui + '"/>', '<a:latin typeface="' + activeDesign().font.mono + '"/>')}<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>` : ''}${catXml}<c:val><c:numRef><c:f>${xesc(rngOf(s.col))}</c:f><c:numCache><c:formatCode>#,##0</c:formatCode><c:ptCount val="${s.values.length}"/>${s.values.map((v, k) => `<c:pt idx="${k}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val>${c.kind === 'line' ? '<c:smooth val="0"/>' : ''}</c:ser>`;
    })
    .join('');
  const axes = `<c:catAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="${activeDesign().color.line}"/></a:solidFill></a:ln></c:spPr>${txt(900, activeDesign().color.text2)}<c:crossAx val="222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="${activeDesign().color.line}"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${xesc(shortFmt)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txt(900, activeDesign().color.text2)}<c:crossAx val="111"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
  // Horizontal bars: categories on the left, top item first (reversed order), values at the bottom.
  const [catAxXml, valAxXml] = axes.split('<c:valAx>') as [string, string];
  const axes3d =
    c.kind === 'hbar3d'
      ? `${catAxXml.replace('<c:orientation val="minMax"/>', '<c:orientation val="maxMin"/>').replace('<c:axPos val="b"/>', '<c:axPos val="l"/>')}<c:valAx>${valAxXml.replace('<c:axPos val="l"/>', '<c:axPos val="b"/>').replace('<c:crosses val="autoZero"/>', '<c:crosses val="max"/>')}`
      : axes;
  const plot =
    c.kind === 'pie3d'
      ? `<c:pie3DChart><c:varyColors val="1"/>${ser}</c:pie3DChart>`
      : c.kind === 'bar3d' || c.kind === 'hbar3d'
        ? `<c:bar3DChart><c:barDir val="${c.kind === 'hbar3d' ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${ser}<c:gapWidth val="70"/><c:shape val="box"/><c:axId val="111"/><c:axId val="222"/><c:axId val="0"/></c:bar3DChart>${axes3d}`
      : c.kind === 'pie'
      ? `<c:pieChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/></c:pieChart>`
      : c.kind === 'line'
        ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}<c:marker val="1"/><c:axId val="111"/><c:axId val="222"/></c:lineChart>${axes}`
        : `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${ser}<c:gapWidth val="60"/><c:axId val="111"/><c:axId val="222"/></c:barChart>${axes}`;
  const noFill = '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>';
  const view3d =
    c.kind === 'pie3d'
      ? '<c:view3D><c:rotX val="30"/><c:rotY val="0"/><c:rAngAx val="0"/></c:view3D>'
      : is3d
        ? `<c:view3D><c:rotX val="15"/><c:rotY val="20"/><c:depthPercent val="100"/><c:rAngAx val="1"/></c:view3D><c:floor><c:thickness val="0"/>${noFill}</c:floor><c:sideWall><c:thickness val="0"/>${noFill}</c:sideWall><c:backWall><c:thickness val="0"/>${noFill}</c:backWall>`
        : '';
  const chart = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"><a:solidFill><a:srgbClr val="${activeDesign().color.navy}"/></a:solidFill><a:latin typeface="${activeDesign().font.ui}"/></a:defRPr></a:pPr><a:r><a:rPr lang="fr-FR" sz="1200" b="1"><a:solidFill><a:srgbClr val="${activeDesign().color.navy}"/></a:solidFill><a:latin typeface="${activeDesign().font.ui}"/></a:rPr><a:t>${xesc(c.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>${view3d}<c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/></c:spPr></c:plotArea>${(c.kind === 'bar3d' || c.kind === 'hbar3d') && c.series.length === 1 ? '' : `<c:legend><c:legendPos val="${c.kind === 'pie3d' ? 'r' : 'b'}"/><c:overlay val="0"/>${txt(900, activeDesign().color.text2)}</c:legend>`}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="${activeDesign().color.white}"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="${activeDesign().color.line}"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`;
  return chart;
}

/**
 * Workbook in the locked reference design: navy title band, blue subtitle band, four KPI cards (live SUBTOTAL
 * formulas), blue table header, Consolas right-aligned numbers, thin #DBE6F7 borders, status colours, no gridlines,
 * zoom 90 %, frozen header, autofilter, cyan data tab.
 */
export function houseXlsx(
  columns: string[],
  rows: Record<string, unknown>[],
  opts: { title?: string; subtitle?: string; sheet?: string; chart?: ChartKind } = {},
): Uint8Array {
  const X = activeDesign().xlsx;
  const H = X.rowHeight;
  const title = opts.title || 'Export';
  const sub = `${opts.subtitle ? `${opts.subtitle} · ` : ''}Édité le ${fmtDateFr()}`;
  const n = Math.max(1, columns.length);
  const font = (extra: Record<string, unknown> = {}) => ({
    name: activeDesign().font.ui,
    sz: X.bodySize,
    color: { rgb: C.text },
    ...extra,
  });
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  let numColPick = columns.findIndex((c) => {
    const vs = rows.slice(0, 200).map((r) => r[c]);
    return vs.length > 0 && vs.filter(isNum).length / vs.length >= 0.6;
  });
  // MAISON 2.0 — KPIs and CHARTS come BEFORE the table header: title band, scope line, KPI cards, a chart zone with
  // THREE native Excel 3D charts side by side (3D columns, 3D pie, trend or top-10 3D bars), then the table. The
  // charts read an « Agrégats » sheet whose sums are live SUMIF formulas over the table. Automatic whenever the data
  // has a category and a measure; opts.chart = 'none' removes them, 'bar' / 'pie' / 'line' puts that kind first.
  const an = opts.chart === 'none' || columns.length < 2 || !rows.length ? null : analyse3d(columns, rows);
  type Agg = { kind: NativeKind; title: string; cats: string[]; vals: number[]; groupCol?: number; live: boolean };
  const aggs: Agg[] = [];
  if (an) {
    const g0 = an.groups[0];
    const g1 = an.groups[1] && an.groups[1].categories.length <= 8 ? an.groups[1] : g0 && g0.categories.length <= 8 ? g0 : null;
    const ci = (c?: string) => (c ? columns.indexOf(c) : -1);
    if (g0) aggs.push({ kind: 'bar3d', title: g0.title, cats: g0.categories.slice(0, 12), vals: g0.values.slice(0, 12), groupCol: ci(g0.col), live: true });
    if (g1) aggs.push({ kind: 'pie3d', title: `Répartition — ${g1.title}`, cats: g1.categories, vals: g1.values, groupCol: ci(g1.col), live: true });
    if (an.trend) aggs.push({ kind: 'line', title: `Évolution — ${an.trend.title}`, cats: an.trend.categories, vals: an.trend.values, live: false });
    else if (an.top && an.top !== g0 && an.top.col !== g0?.col) aggs.push({ kind: 'hbar3d', title: an.top.title, cats: an.top.categories, vals: an.top.values, live: false });
    if (!g0 && an.top) aggs.unshift({ kind: 'bar3d', title: an.top.title, cats: an.top.categories, vals: an.top.values, live: false });
    // A kind asked for explicitly goes first.
    const want = opts.chart === 'pie' ? 'pie3d' : opts.chart === 'line' ? 'line' : opts.chart === 'bar' ? 'bar3d' : null;
    const at = want ? aggs.findIndex((a) => a.kind === want) : -1;
    if (at > 0) aggs.unshift(...aggs.splice(at, 1));
    else if (want && at < 0 && aggs[0]) aggs[0].kind = want; // e.g. a line across the categories when there is no date
    aggs.splice(3);
  }
  const plan = aggs.map((a) => a.kind);
  if (an?.measure && columns.includes(an.measure)) numColPick = columns.indexOf(an.measure);
  const CHART_ROWS = 16;
  const HEADER_ROW = plan.length ? 5 + CHART_ROWS + 1 : 5; // 0-based: title, subtitle, KPI labels, KPI values, spacer, [charts], header
  const first = HEADER_ROW + 1;
  const last = HEADER_ROW + rows.length;
  const numCol = numColPick;
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
              font: font({ name: activeDesign().font.mono, sz: X.kpiValueSize, bold: true, color: { rgb: C.navy } }),
              fill: solid(C.white),
              alignment: { horizontal: 'center', vertical: 'center' },
              border: box(),
            },
          }
        : { v: '', t: 's', s: { fill: solid(C.ice) } },
    ),
  );
  aoa.push(columns.map(() => ({ v: '', t: 's', s: { fill: solid(C.ice) } })));
  // Chart zone (white), then a thin ice spacer before the table header.
  if (plan.length) {
    for (let i = 0; i < CHART_ROWS; i++) aoa.push(columns.map(() => ({ v: '', t: 's', s: { fill: solid(C.white) } })));
    aoa.push(columns.map(() => ({ v: '', t: 's', s: { fill: solid(C.ice) } })));
  }
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
  const status = activeDesign().status as Record<string, { fill: string; text: string }>;
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
              font: font({ name: activeDesign().font.mono }),
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
    ...(plan.length ? [...Array.from({ length: CHART_ROWS }, () => ({ hpt: 15 })), { hpt: H.spacer }] : []),
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
  // « Agrégats »: one block of two columns per chart (category, value). Group sums are live SUMIF formulas over the
  // table; the top 10 and the monthly trend are values computed from the same rows.
  const dataName = (opts.sheet || 'Données').slice(0, 31).replace(/[\\/?*[\]:]/g, ' ');
  const AGG = 'Agrégats';
  if (aggs.length) {
    const height = Math.max(...aggs.map((a) => a.cats.length)) + 1;
    const grid: Cell[][] = Array.from({ length: height }, () => Array.from({ length: aggs.length * 3 - 1 }, () => ({ v: '', t: 's' }) as Cell));
    const q = `'${dataName.replace(/'/g, "''")}'`;
    const head = { font: font({ bold: true, color: { rgb: C.white } }), fill: solid(C.blue), alignment: { horizontal: 'center', vertical: 'center' }, border: box() };
    aggs.forEach((a, k) => {
      const c0 = k * 3;
      grid[0]![c0] = { v: a.title.split(' par ')[1] ?? 'Catégorie', t: 's', s: head };
      grid[0]![c0 + 1] = { v: an?.measure ?? 'Nombre', t: 's', s: head };
      a.cats.forEach((cat, i) => {
        grid[i + 1]![c0] = { v: cat, t: 's', s: { font: font(), border: box() } };
        const live = a.live && a.groupCol !== undefined && a.groupCol >= 0;
        const f = live
          ? an?.measure
            ? `SUMIF(${q}!$${col(a.groupCol!)}$${first + 1}:$${col(a.groupCol!)}$${last + 1},${col(c0)}${i + 2},${q}!$${col(columns.indexOf(an.measure))}$${first + 1}:$${col(columns.indexOf(an.measure))}$${last + 1})`
            : `COUNTIF(${q}!$${col(a.groupCol!)}$${first + 1}:$${col(a.groupCol!)}$${last + 1},${col(c0)}${i + 2})`
          : undefined;
        grid[i + 1]![c0 + 1] = { v: a.vals[i] ?? 0, t: 'n', ...(f ? { f } : {}), z: X.numberFormat.integer, s: { font: font({ name: activeDesign().font.mono }), alignment: { horizontal: 'right' }, border: box() } };
      });
    });
    const aws = XLSXS.utils.aoa_to_sheet(grid);
    aws['!cols'] = aggs.flatMap((a, k) => [{ wch: Math.min(40, Math.max(14, ...a.cats.map((c) => c.length + 2))) }, { wch: 18 }, ...(k < aggs.length - 1 ? [{ wch: 3 }] : [])]);
    XLSXS.utils.book_append_sheet(wb, aws, AGG);
  }
  wb.Props = { Title: title, Subject: opts.subtitle ?? '', Author: 'MASSAMBA Workbench' };
  const raw = new Uint8Array(XLSXS.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
  // With a chart zone the header is not frozen (22 frozen rows would hide the table); the autofilter stays on it.
  const locked = lockSheetView(raw, { tab: X.tabColor.data, freezeRows: plan.length ? 0 : HEADER_ROW + 1 });
  if (!aggs.length) return locked;
  const top = H.title + H.subtitle + H.kpiLabel + H.kpiValue + H.spacer + 4;
  const h = CHART_ROWS * 15 - 8;
  // Three charts across (~930 pt): 3D columns 330 pt, 3D pie 250 pt, trend / top-10 bars 330 pt.
  const slots = aggs.length === 3 ? [[6, 330], [342, 250], [598, 330]] : aggs.length === 2 ? [[6, 470], [482, 330]] : [[6, 620]];
  const specs: ChartSpec[] = aggs.map((a, k) => ({
    kind: a.kind,
    title: a.title,
    sheet: AGG,
    first: 2,
    last: a.cats.length + 1,
    anchorCol: 0,
    anchorRow: 5,
    abs: { x: slots[k]![0]!, y: top, w: slots[k]![1]!, h },
    cat: { col: k * 3, name: 'Catégorie', values: a.cats },
    series: [{ col: k * 3 + 1, name: an?.measure ?? 'Nombre', values: a.vals }],
  }));
  return addNativeCharts(locked, specs);
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
