// NATIVE CHARTS OF THE DOSSIER (Word and PowerPoint) — DrawingML charts from literal values, several series, Excel's
// own 3D columns / bars / pies (the committee deliverables: 35 of 43 workbook charts and 21 of 24 deck charts are 3D),
// doughnuts and lines. Colours and fonts are the active design's: a figure looks the same in the deck, the report and
// the printable page. Pure: a Figure in, the chartSpace XML out.
import { activeDesign } from '../houseDesign';
import { shortFormat } from '../officeChart';
import type { Figure } from './dossier';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fill = (rgb: string) => `<a:solidFill><a:srgbClr val="${rgb}"/></a:solidFill>`;
const noLine = '<a:ln><a:noFill/></a:ln>';

export function figureChartXml(f: Figure, o: { titleInside?: boolean; legend?: boolean } = {}): string {
  const D = activeDesign();
  const K = D.color;
  const palette = D.chartSeries;
  const txPr = (sz: number, color: string, bold = false, font?: string) =>
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}">${fill(color)}<a:latin typeface="${font ?? D.font.ui}"/></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>`;
  const n = Math.min(f.categories.length, ...f.series.map((s) => s.values.length));
  const cats = f.categories.slice(0, n);
  const series = f.series.map((s) => ({ name: s.name, values: s.values.slice(0, n).map((v) => (Number.isFinite(v) ? v : 0)) }));
  const max = Math.max(0, ...series.flatMap((s) => s.values.map((v) => Math.abs(v))));
  const fmt = f.fmt ?? (f.unit === '%' ? '0.0" %"' : shortFormat(max));
  const is3d = f.kind === 'col3d' || f.kind === 'bar3d';
  const pieLike = f.kind === 'pie' || f.kind === 'doughnut';
  const horizontal = f.kind === 'bar' || f.kind === 'bar3d';
  const title = o.titleInside === false ? '<c:autoTitleDeleted val="1"/>' : `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1">${fill(K.navy)}<a:latin typeface="${D.font.ui}"/></a:defRPr></a:pPr><a:r><a:rPr lang="fr-FR" sz="1100" b="1">${fill(K.navy)}<a:latin typeface="${D.font.ui}"/></a:rPr><a:t>${esc(f.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`;
  const cat = `<c:cat><c:strLit><c:ptCount val="${n}"/>${cats.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(String(v))}</c:v></c:pt>`).join('')}</c:strLit></c:cat>`;
  const val = (vals: number[]) => `<c:val><c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numLit></c:val>`;
  const labels = (pos: string | undefined, color: string, mono = true, pct = false) =>
    `<c:dLbls><c:numFmt formatCode="${esc(pct ? '0 %' : fmt)}" sourceLinked="0"/><c:spPr><a:noFill/>${noLine}</c:spPr>${txPr(850, color, true, mono ? D.font.mono : D.font.ui)}${pos ? `<c:dLblPos val="${pos}"/>` : ''}<c:showLegendKey val="0"/><c:showVal val="${pct ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${pct ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>`;
  const ser = (s: { name: string; values: number[] }, i: number, extra: string, lbl: string) =>
    `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx><c:spPr>${fill(palette[i % palette.length]!)}${noLine}</c:spPr>${extra}${lbl}${cat}${val(s.values)}</c:ser>`;
  const axes = () =>
    `<c:catAx><c:axId val="10"/><c:scaling><c:orientation val="${horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:spPr><a:ln w="9525">${fill(K.line)}</a:ln></c:spPr>${txPr(850, K.text2)}<c:crossAx val="20"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="20"/><c:scaling><c:orientation val="minMax"/>${f.kind === 'line' ? '' : '<c:min val="0"/>'}</c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'b' : 'l'}"/><c:majorGridlines><c:spPr><a:ln w="6350">${fill(K.line)}</a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${esc(fmt)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr>${noLine}</c:spPr>${txPr(800, K.text2, false, D.font.mono)}<c:crossAx val="10"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
  let plot: string;
  let view3d = '';
  let legend = o.legend ?? (series.length > 1 || pieLike) ? `<c:legend><c:legendPos val="${pieLike ? 'r' : 'b'}"/><c:overlay val="0"/>${txPr(850, K.text2)}</c:legend>` : '';
  if (pieLike) {
    const s0 = series[0]!;
    const pts = cats.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr>${fill(palette[i % palette.length]!)}<a:ln w="19050">${fill(K.white)}</a:ln></c:spPr></c:dPt>`).join('');
    const serXml = `<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${esc(s0.name)}</c:v></c:tx>${pts}${labels(f.kind === 'pie' ? 'bestFit' : undefined, f.kind === 'pie' ? K.white : K.text, true, f.unit === '%' ? false : true)}${cat}${val(s0.values)}</c:ser>`;
    plot = f.kind === 'doughnut' ? `<c:doughnutChart><c:varyColors val="1"/>${serXml}<c:firstSliceAng val="0"/><c:holeSize val="58"/></c:doughnutChart>` : `<c:pieChart><c:varyColors val="1"/>${serXml}<c:firstSliceAng val="0"/></c:pieChart>`;
  } else if (f.kind === 'line') {
    plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series
      .map(
        (s, i) =>
          `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx><c:spPr><a:ln w="28575" cap="rnd">${fill(palette[i % palette.length]!)}<a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr>${fill(palette[i % palette.length]!)}<a:ln w="9525">${fill(K.white)}</a:ln></c:spPr></c:marker>${i === 0 ? labels('t', K.text) : ''}${cat}${val(s.values)}<c:smooth val="0"/></c:ser>`,
      )
      .join('')}<c:marker val="1"/><c:axId val="10"/><c:axId val="20"/></c:lineChart>${axes()}`;
  } else if (is3d) {
    view3d = `<c:view3D><c:rotX val="15"/><c:rotY val="20"/><c:rAngAx val="1"/></c:view3D><c:floor><c:thickness val="0"/><c:spPr><a:noFill/>${noLine}</c:spPr></c:floor><c:sideWall><c:thickness val="0"/><c:spPr><a:noFill/>${noLine}</c:spPr></c:sideWall><c:backWall><c:thickness val="0"/><c:spPr><a:noFill/>${noLine}</c:spPr></c:backWall>`;
    // Single series: the leading bar in the accent colour (the eye goes to the first category), the others primary.
    const lead = series.length === 1 && n > 1 ? `<c:dPt><c:idx val="0"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr>${fill(K.gold)}${noLine}</c:spPr></c:dPt>` : '';
    plot = `<c:bar3DChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series.map((s, i) => ser(s, i, `<c:invertIfNegative val="0"/>${i === 0 ? lead : ''}`, labels(undefined, K.text))).join('')}<c:gapWidth val="${series.length > 1 ? 80 : 60}"/><c:shape val="box"/><c:axId val="10"/><c:axId val="20"/></c:bar3DChart>${axes()}`;
    if (series.length === 1) legend = '';
  } else {
    const lead = series.length === 1 && n > 1 ? `<c:dPt><c:idx val="0"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr>${fill(K.gold)}${noLine}</c:spPr></c:dPt>` : '';
    plot = `<c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series.map((s, i) => ser(s, i, `<c:invertIfNegative val="0"/>${i === 0 ? lead : ''}`, labels('outEnd', K.text))).join('')}<c:gapWidth val="${series.length > 1 ? 80 : 50}"/><c:overlap val="${series.length > 1 ? -10 : 0}"/><c:axId val="10"/><c:axId val="20"/></c:barChart>${axes()}`;
    if (series.length === 1) legend = '';
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>${title}${view3d}<c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/>${noLine}</c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:noFill/>${noLine}</c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr><a:latin typeface="${D.font.ui}"/></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr></c:chartSpace>`;
}
