// NATIVE CHARTS FOR WORD AND POWERPOINT — DrawingML charts built from literal values (no embedded workbook): the figures
// are those of the brief, the look is the active design (series in the palette, no border, light gridlines, big value
// labels, Segoe UI / Consolas). One chart part per call; the caller embeds it (w:drawing in Word, p:graphicFrame in
// PowerPoint) and declares the part + relationship. Pure: strings in, string out.
import { activeDesign } from './houseDesign';

export interface LiteralChart {
  kind: 'bar' | 'hbar' | 'doughnut' | 'line';
  title: string;
  categories: string[];
  values: number[];
  /** Series name (the legend is hidden for single-series bars, shown for doughnuts). */
  name?: string;
  /** Excel number format of the value labels; chosen from the magnitude when omitted (k / M / Mds). */
  fmt?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const CHART_CT = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';
export const CHART_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';

/** Short value format in the house manner: « 1,8 Mds », « 469 M », « 12 k », « 1 234 ». */
export function shortFormat(max: number): string {
  return max >= 1e9 ? '#,##0.0,,," Mds"' : max >= 1e6 ? '#,##0.0,," M"' : max >= 1e5 ? '#,##0," k"' : max >= 100 ? '#,##0' : '0.0';
}

const fill = (rgb: string) => `<a:solidFill><a:srgbClr val="${rgb}"/></a:solidFill>`;
const noLine = '<a:ln><a:noFill/></a:ln>';
const txPr = (sz: number, color: string, bold = false, font?: string) =>
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}">${fill(color)}<a:latin typeface="${font ?? activeDesign().font.ui}"/></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>`;

/** The chartSpace XML of a literal chart (the content of word/charts/chartN.xml or ppt/charts/chartN.xml). */
export function literalChartXml(c: LiteralChart): string {
  const D = activeDesign();
  const K = D.color;
  const n = Math.min(c.categories.length, c.values.length);
  const cats = c.categories.slice(0, n);
  const vals = c.values.slice(0, n).map((v) => (Number.isFinite(v) ? v : 0));
  const max = Math.max(0, ...vals.map((v) => Math.abs(v)));
  const fmt = c.fmt ?? shortFormat(max);
  const series = [K.blue, K.gold, K.cyan, K.navy, K.sky, K.orange, K.green, K.warn];
  const title = `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1">${fill(K.navy)}<a:latin typeface="${D.font.ui}"/></a:defRPr></a:pPr><a:r><a:rPr lang="fr-FR" sz="1200" b="1">${fill(K.navy)}<a:latin typeface="${D.font.ui}"/></a:rPr><a:t>${esc(c.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`;
  const cat = `<c:cat><c:strLit><c:ptCount val="${n}"/>${cats.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(String(v))}</c:v></c:pt>`).join('')}</c:strLit></c:cat>`;
  const val = `<c:val><c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numLit></c:val>`;
  const tx = `<c:tx><c:v>${esc(c.name ?? c.title)}</c:v></c:tx>`;
  const labels = (pos?: string, color = K.text, mono = true) =>
    `<c:dLbls><c:numFmt formatCode="${esc(fmt)}" sourceLinked="0"/><c:spPr><a:noFill/>${noLine}</c:spPr>${txPr(900, color, true, mono ? D.font.mono : D.font.ui)}${pos ? `<c:dLblPos val="${pos}"/>` : ''}<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`;
  const axes = (horizontal: boolean) =>
    `<c:catAx><c:axId val="10"/><c:scaling><c:orientation val="${horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525">${fill(K.line)}</a:ln></c:spPr>${txPr(900, K.text2)}<c:crossAx val="20"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="20"/><c:scaling><c:orientation val="minMax"/>${c.kind === 'line' ? '' : '<c:min val="0"/>'}</c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'b' : 'l'}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="${K.line}"><a:alpha val="55000"/></a:srgbClr></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${esc(fmt)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr>${noLine}</c:spPr>${txPr(800, K.text2, false, D.font.mono)}<c:crossAx val="10"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
  let plot: string;
  let legend = '';
  if (c.kind === 'doughnut') {
    const pts = cats.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr>${fill(series[i % series.length]!)}<a:ln w="19050">${fill(K.white)}</a:ln></c:spPr></c:dPt>`).join('');
    plot = `<c:doughnutChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>${tx}${pts}${labels(undefined, K.white)}${cat}${val}</c:ser><c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls><c:firstSliceAng val="0"/><c:holeSize val="58"/></c:doughnutChart>`;
    legend = `<c:legend><c:legendPos val="r"/><c:overlay val="0"/>${txPr(900, K.text2)}</c:legend>`;
  } else if (c.kind === 'line') {
    plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/>${tx}<c:spPr><a:ln w="28575" cap="rnd">${fill(K.blue)}<a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr>${fill(K.white)}<a:ln w="19050">${fill(K.blue)}</a:ln></c:spPr></c:marker>${labels('t')}${cat}${val}<c:smooth val="0"/></c:ser><c:marker val="1"/><c:axId val="10"/><c:axId val="20"/></c:lineChart>${axes(false)}`;
  } else {
    const horizontal = c.kind === 'hbar';
    // The leading bar in gold, the others in blue: the eye goes to the first category.
    const pts = n > 1 ? `<c:dPt><c:idx val="0"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr>${fill(K.gold)}${noLine}</c:spPr></c:dPt>` : '';
    plot = `<c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/>${tx}<c:spPr>${fill(K.blue)}${noLine}</c:spPr><c:invertIfNegative val="0"/>${pts}${labels('outEnd')}${cat}${val}</c:ser><c:gapWidth val="${horizontal ? 45 : 60}"/><c:axId val="10"/><c:axId val="20"/></c:barChart>${axes(horizontal)}`;
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/>${noLine}</c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:noFill/>${noLine}</c:spPr>${txPr(900, K.text)}</c:chartSpace>`;
}

/** The w:drawing run embedding a chart part in Word (the paragraph is the caller's). */
export function docxChartRun(rid: string, id: number, name: string, cx: number, cy: number): string {
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${esc(name)}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${rid}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

/** The p:graphicFrame embedding a chart part in a PowerPoint slide. */
export function pptxChartFrame(rid: string, id: number, name: string, x: number, y: number, cx: number, cy: number): string {
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${rid}"/></a:graphicData></a:graphic></p:graphicFrame>`;
}
