// THE COMMITTEE REPORT — a Dossier rendered as the owner's reference report (38 pages, A4): cover with the kicker,
// the title, the KPI strip and the thesis; native table of contents; « Ce qu'il faut retenir » (indicators and key
// messages); one chapter per subject with CONSTAT CHIFFRÉ / figure + Lecture / ANALYSE / CADRE RÉGLEMENTAIRE ET
// RECHERCHE / CAS EMBLÉMATIQUES / RECOMMANDATIONS (reference, priority, owner, deadline, indicator); the action plan and
// the decisions; annexes A–E (hypotheses, data quality, parameters, glossary, bibliography). Header and footer on every
// page. Colours and fonts from the active design.
import { strToU8, zipSync } from 'fflate';
import { activeDesign, liveColorProxy, setActiveTheme, type Design } from '../houseDesign';
import { emojiRelId, emojiRelsFor, fluentB64 } from '../../assets/fluentEmoji';
import { CAC_NEUTRALS, buttonEmoji, cacDesign, cacStates, flatFigure, tintOf } from './cacSkin';
import { CHART_CT, CHART_REL, docxChartRun } from '../officeChart';
import { orderPPr } from '../officeCore';
import { allRecos, type Dossier, type Kpi, type Reco, type Tone } from './dossier';
import { figureChartXml } from './dossierChart';

export interface ReportLogo {
  png: Uint8Array;
  width: number;
  height: number;
}
const C = liveColorProxy((c) => c) as Design['color'];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PAGE_W = 9638; // A4 text width in twips with 2 cm margins
/** CAC format (cacSkin.ts) while a report is written: its colours per chapter come from the palette. */
let CAC_ON = false;
let ST: string[] = [];
const cacD = () => CAC_ON;
const pad2 = (n: number) => String(n).padStart(2, '0');
// Harmonised tones (v62): theme colours carry the meaning; red only for a risk, the accent for « à surveiller ».
const toneColor = (t?: Tone): string => (t === 'risk' ? C.risk : t === 'warn' ? C.gold : t === 'ok' ? C.green : t === 'info' ? C.blue : C.navy);
const darken = (hex: string, f: number) => [0, 2, 4].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - f)).toString(16).padStart(2, '0')).join('').toUpperCase();
/** The tone as TEXT on a pale panel: the accent darkened so it stays readable. */
const toneInk = (t?: Tone): string => (t === 'warn' ? darken(C.gold, 0.45) : t === 'risk' ? C.risk : t === 'ok' ? darken(C.green, 0.25) : C.text2);

// ── primitives ────────────────────────────────────────────────────────────────
interface R {
  b?: boolean;
  i?: boolean;
  sz?: number; // half-points
  color?: string;
  mono?: boolean;
  caps?: boolean;
}
const run = (t: string, o: R = {}) =>
  `<w:r><w:rPr>${o.mono ? `<w:rFonts w:ascii="${activeDesign().font.mono}" w:hAnsi="${activeDesign().font.mono}"/>` : ''}${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.caps ? '<w:caps/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const para = (inner: string, o: { style?: string; pPr?: string } = {}) => `<w:p>${o.style || o.pPr ? `<w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.pPr ?? ''}</w:pPr>` : ''}${inner}</w:p>`;
const pageBreak = () => para('<w:r><w:br w:type="page"/></w:r>');
const spacing = (before: number, after: number) => `<w:spacing w:before="${before}" w:after="${after}"/>`;
const tc = (inner: string, o: { w: number; fill?: string; borders?: string; vAlign?: string; span?: number }) =>
  `<w:tc><w:tcPr><w:tcW w:w="${o.w}" w:type="dxa"/>${o.span ? `<w:gridSpan w:val="${o.span}"/>` : ''}${o.borders ? `<w:tcBorders>${o.borders}</w:tcBorders>` : ''}${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}${o.vAlign ? `<w:vAlign w:val="${o.vAlign}"/>` : ''}</w:tcPr>${inner || para('')}</w:tc>`;
const NO_BORDERS = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="nil"/>`).join('');
const tbl = (rows: string[], widths: number[], o: { borders?: string; extra?: string } = {}) =>
  `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${o.borders ?? NO_BORDERS}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar>${o.extra ?? ''}</w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;
const label = (t: string) =>
  cacD()
    ? para(run(t, { b: true, sz: 18, color: C.blue, caps: true }), { pPr: `<w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="${C.blue}"/></w:pBdr>${spacing(220, 80)}` })
    : para(run(t, { b: true, sz: 17, color: C.blue, caps: true }), { pPr: `<w:keepNext/><w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="${C.gold}"/></w:pBdr>${spacing(200, 60)}<w:ind w:left="120"/>` });
const bullet = (t: string, o: { color?: string; char?: string; sz?: number } = {}) =>
  para(`${run(`${o.char ?? '▪'}  `, { color: o.color ?? C.gold, b: true, sz: o.sz ?? 20 })}${run(t, { sz: o.sz ?? 20 })}`, { pPr: `<w:ind w:left="360" w:hanging="240"/>${spacing(0, 60)}` });
const body = (t: string, o: R = {}) => para(run(t, { sz: 20, ...o }), { pPr: spacing(0, 100) });
const isNum = (s: string) => /^[-+]?[\d\s\u202f.,]+(%|Mds?|M|k)?$/.test(s.trim()) && /\d/.test(s);

/** A styled data table: navy header with a filet, zebra rows, numbers right-aligned in the mono font. */
function dataTable(head: string[], rows: string[][], widths?: number[], o: { firstColTone?: (r: string[]) => string | null; sz?: number } = {}): string {
  const n = Math.max(1, head.length);
  const ws = widths && widths.length === n ? widths.map((p) => Math.floor(PAGE_W * p)) : Array.from({ length: n }, () => Math.floor(PAGE_W / n));
  const sz = o.sz ?? 17;
  const cell = (t: string, j: number, header: boolean, tone: string | null, zebra: boolean) =>
    tc(para(run(t, { sz, b: header || (j === 0 && Boolean(tone)), color: header ? (cacD() ? C.navy : C.white) : tone && j === 0 ? C.white : C.text, mono: !header && isNum(t) }), { pPr: `<w:jc w:val="${header ? 'center' : isNum(t) ? 'right' : 'left'}"/>${spacing(40, 40)}` }), {
      w: ws[j]!,
      // CAC: bold marine on the palette's pale tint with a marine rule; no zebra.
      fill: header ? (cacD() ? C.subtle : C.navy) : tone && j === 0 ? tone : zebra && !cacD() ? C.panel : undefined,
      borders: header ? `<w:bottom w:val="single" w:sz="${cacD() ? 8 : 12}" w:color="${cacD() ? C.navy : C.gold}"/>` : `<w:bottom w:val="single" w:sz="4" w:color="${C.line}"/>`,
      vAlign: 'center',
    });
  const rowsXml = [
    `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${head.map((h, j) => cell(h, j, true, null, false)).join('')}</w:tr>`,
    ...rows.map((r, i) => {
      const tone = o.firstColTone?.(r) ?? null;
      return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${Array.from({ length: n }, (_, j) => cell(r[j] ?? '', j, false, tone, i % 2 === 1)).join('')}</w:tr>`;
    }),
  ];
  return tbl(rowsXml, ws) + para('', { pPr: spacing(0, 80) });
}

/** Font size (half-points) that keeps a monospaced value on ONE line in a tile of `w` twips (v62: « 1 119 083,1 M XOF »
 *  broke over two lines in the 5-tile strip). A digit of a monospaced face is ≈ 0.6 em wide. */
export function fitValueSz(text: string, w: number, max: number, min = 16): number {
  const fit = Math.floor((2 * tileAvail(w)) / (0.62 * Math.max(1, [...text].length)));
  return Math.max(min, Math.min(max, fit));
}
/** Usable width of a tile in points: its width minus the cell margins (≈ 108 twips each side) and the 100-twip indent. */
const tileAvail = (w: number) => (w - 330) / 20;
/**
 * The same quantity in the next unit when it cannot fit even at the smallest size: « 1 119 083,1 M XOF » →
 * « 1 119,1 Md XOF », « 34 500 k » → « 34,5 M ». Only the display changes; the indicator keeps its exact value elsewhere.
 */
export function compactValue(text: string, w: number, min = 16): string {
  if ((0.62 * [...text].length * min) / 2 <= tileAvail(w)) return text;
  const m = /^(-?[\d\s\u00a0\u202f]+(?:,\d+)?)\s*(k|M|Mds?|Md)\b\s*(.*)$/.exec(text.trim());
  if (!m) return text;
  const n = Number(m[1]!.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || Math.abs(n) < 1000) return text;
  const next = m[2] === 'k' ? 'M' : m[2] === 'M' ? 'Md' : null;
  if (!next) return text;
  const v = (n / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace(/\u202f/g, ' ');
  return `${v} ${next}${m[3] ? ` ${m[3]}` : ''}`;
}
function kpiStrip(kpis: Kpi[], cols: number, cover = false): string {
  const out: string[] = [];
  // Balanced rows (8 → 4 + 4, 7 → 4 + 3) and a last row whose tiles share the full width: no empty cell.
  const rowsN = Math.ceil(kpis.length / cols);
  cols = Math.ceil(kpis.length / rowsN);
  for (let r0 = 0; r0 < kpis.length; r0 += cols) {
    const slice = kpis.slice(r0, r0 + cols);
    const gap = 120;
    const cw = Math.floor((PAGE_W - gap * (slice.length - 1)) / slice.length);
    const widths: number[] = [];
    const cells: string[] = [];
    slice.forEach((k, i) => {
      if (i) {
        widths.push(gap);
        cells.push(tc('', { w: gap }));
      }
      widths.push(cw);
      if (cacD()) {
        // CAC card: white, a thick top rule in the card's colour (red for a risk), caps label, 24 pt figure, warm sub-line.
        const top = k.tone === 'risk' ? CAC_NEUTRALS.alert : ST[(r0 + i) % Math.max(1, ST.length)] ?? C.navy;
        const v = compactValue(k.value, cw);
        const inner =
          para(run(k.code && !cover ? `${k.code} · ${k.label}` : k.label, { b: true, sz: 15, color: C.text2, caps: true }), { pPr: `${spacing(80, 20)}<w:ind w:left="100" w:right="60"/>` }) +
          para(run(v, { b: true, sz: fitValueSz(v, cw, 44), color: C.navy }), { pPr: `${spacing(0, 20)}<w:ind w:left="100"/>` }) +
          para(run(k.sub ?? k.method ?? '', { sz: 16, color: C.text2 }), { pPr: `${spacing(0, 80)}<w:ind w:left="100" w:right="60"/>` });
        const thin = (side: string) => `<w:${side} w:val="single" w:sz="4" w:color="${C.line}"/>`;
        cells.push(tc(inner, { w: cw, fill: tintOf(top, 0.93), borders: `<w:top w:val="single" w:sz="24" w:color="${top}"/>${thin('left')}${thin('bottom')}${thin('right')}` }));
        return;
      }
      const tone = toneColor(k.tone);
      const inner = cover
        ? para(run(compactValue(k.value, cw), { b: true, sz: fitValueSz(compactValue(k.value, cw), cw, 36), color: C.navy, mono: true }), { pPr: `${spacing(100, 20)}<w:ind w:left="100"/>` }) +
          para(run(k.label, { sz: 15, color: C.text2 }), { pPr: `${spacing(0, 100)}<w:ind w:left="100" w:right="60"/>` })
        : para(run(k.code ? `${k.code} · ${k.label}` : k.label, { b: true, sz: 13, color: C.text2, caps: true }), { pPr: `${spacing(80, 40)}<w:ind w:left="100" w:right="60"/>` }) +
          para(run(compactValue(k.value, cw), { b: true, sz: fitValueSz(compactValue(k.value, cw), cw, 32), color: C.navy, mono: true }), { pPr: `${spacing(0, 40)}<w:ind w:left="100"/>` }) +
          para(run(k.sub ?? k.method ?? '', { i: true, sz: 13, color: toneInk(k.tone) }), { pPr: `${spacing(0, 80)}<w:ind w:left="100" w:right="60"/><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="2" w:color="${tone}"/></w:pBdr>` });
      // The reference's tiles: no frame, a pale panel, the tone as a rule (on top for the cover strip).
      cells.push(tc(inner, { w: cw, fill: C.panel, borders: cover ? `<w:top w:val="single" w:sz="24" w:color="${tone}"/>` : '' }));
    });
    out.push(tbl([`<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells.join('')}</w:tr>`], widths), para('', { pPr: spacing(0, 100) }));
  }
  return out.join('');
}

function recoTable(recos: Reco[], withAxis = false): string {
  const head = withAxis ? ['Réf.', 'Recommandation et action', 'Axe', 'Responsable', 'Échéance', 'Indicateur'] : ['Réf.', 'Recommandation et action', 'Responsable', 'Échéance', 'Indicateur'];
  const widths = withAxis ? [0.08, 0.4, 0.1, 0.15, 0.1, 0.17] : [0.08, 0.45, 0.17, 0.11, 0.19];
  const ws = widths.map((p) => Math.floor(PAGE_W * p));
  const cell = (inner: string, j: number, fill?: string, header = false) =>
    tc(inner, { w: ws[j]!, fill, borders: header ? `<w:bottom w:val="single" w:sz="12" w:color="${C.gold}"/>` : `<w:bottom w:val="single" w:sz="4" w:color="${C.line}"/>`, vAlign: 'top' });
  const rows = [
    `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${head.map((h, j) => cell(para(run(h, { b: true, sz: 16, color: C.white }), { pPr: `<w:jc w:val="center"/>${spacing(40, 40)}` }), j, C.navy, true)).join('')}</w:tr>`,
    ...recos.map((r, i) => {
      const tone = r.priority === 'P1' ? C.risk : r.priority === 'P2' ? C.gold : C.blue;
      const zebra = i % 2 ? C.panel : undefined;
      const ref = para(`${run(r.ref, { b: true, sz: 15, color: tone, mono: true })}${run(` ${r.priority}`, { b: true, sz: 12, color: tone })}`, { pPr: `<w:jc w:val="left"/>${spacing(60, 60)}` });
      const act = para(run(r.title, { b: true, sz: 16, color: C.navy }), { pPr: spacing(40, 20) }) + para(run(r.action, { sz: 15 }), { pPr: spacing(0, 20) }) + (r.ground ? para(run(`Fondement : ${r.ground}`, { i: true, sz: 13, color: C.text2 }), { pPr: spacing(0, 40) }) : '');
      const cells = withAxis
        ? [cell(ref, 0, zebra), cell(act, 1, zebra), cell(para(run(r.axis ?? '', { sz: 14 }), { pPr: spacing(40, 40) }), 2, zebra), cell(para(run(r.owner, { sz: 14 }), { pPr: spacing(40, 40) }), 3, zebra), cell(para(run(r.due, { sz: 14, mono: true }), { pPr: spacing(40, 40) }), 4, zebra), cell(para(run(r.kpi, { sz: 14, i: true }), { pPr: spacing(40, 40) }), 5, zebra)]
        : [cell(ref, 0, zebra), cell(act, 1, zebra), cell(para(run(r.owner, { sz: 14 }), { pPr: spacing(40, 40) }), 2, zebra), cell(para(run(r.due, { sz: 14, mono: true }), { pPr: spacing(40, 40) }), 3, zebra), cell(para(run(r.kpi, { sz: 14, i: true }), { pPr: spacing(40, 40) }), 4, zebra)];
      return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells.join('')}</w:tr>`;
    }),
  ];
  return tbl(rows, ws) + para('', { pPr: spacing(0, 80) });
}

const callout = (title: string, text: string, color = C.gold) =>
  tbl([`<w:tr>${tc(para(run(title, { b: true, sz: 17, color: C.navy }), { pPr: spacing(80, 40) }) + para(run(text, { i: true, sz: 19, color: C.text }), { pPr: spacing(0, 100) }), { w: PAGE_W, fill: C.ice, borders: `<w:left w:val="single" w:sz="24" w:color="${color}"/>` })}</w:tr>`], [PAGE_W]) + para('', { pPr: spacing(0, 80) });

export function dossierDocx(d: Dossier, opts: { logo?: ReportLogo | null; brand?: string; skin?: 'comite' | 'cac' } = {}): Uint8Array {
  if (opts.skin !== 'cac') return dossierDocxCore(d, opts);
  const base = activeDesign();
  ST = cacStates(base.color, base.chartSeries);
  const prev = setActiveTheme(cacDesign(base));
  CAC_ON = true;
  try {
    return dossierDocxCore(d, opts);
  } finally {
    CAC_ON = false;
    ST = [];
    setActiveTheme(prev);
  }
}
function dossierDocxCore(d: Dossier, opts: { logo?: ReportLogo | null; brand?: string }): Uint8Array {
  const logo = opts.logo && opts.logo.png.length ? opts.logo : null;
  const charts: { rid: string; file: string; xml: string }[] = [];
  const b: string[] = [];
  let figN = 0;
  const addFigure = (f: Parameters<typeof figureChartXml>[0]) => {
    const n = charts.length + 1;
    const rid = `rIdChart${n}`;
    // The report's figures are flat (print): the deck and the workbook keep the 3D.
    const flat = cacD() ? flatFigure(f) : ({ ...f, kind: f.kind === 'col3d' ? 'col' : f.kind === 'bar3d' ? 'bar' : f.kind } as typeof f);
    charts.push({ rid, file: `chart${n}.xml`, xml: figureChartXml(flat, { titleInside: true }) });
    figN++;
    b.push(para(docxChartRun(rid, 7000 + n, f.title, 6_000_000, 2_900_000), { pPr: `<w:jc w:val="center"/><w:keepNext/>${spacing(80, 40)}` }));
    b.push(para(run(`Figure ${figN} — ${f.title}`, { b: true, sz: 16, color: C.navy }), { pPr: `<w:keepNext/>${spacing(0, 20)}` }));
    b.push(para(`${f.lecture ? run(`Lecture — ${f.lecture}`, { i: true, sz: 15, color: C.text2 }) : ''}${d.dataSource ? run(`${f.lecture ? '  ' : ''}Source : ${d.dataSource.slice(0, 90)}`, { sz: 13, color: C.text2 }) : ''}`, { pPr: spacing(0, 160) }));
  };

  // ── Cover — the reference: a full navy block (logo plate, kicker, title in white, subtitle), the accent filet ──
  const brand = d.org ?? opts.brand ?? 'MASSAMBA Workbench';
  const plate = logo
    ? para(pictureXml('rIdLogo', 9002, 'Logo', logo.width, logo.height, 46 * 12700), { pPr: spacing(160, 200) })
    : tbl([`<w:tr>${tc(para(run(brand.slice(0, 26), { b: true, sz: 22, color: C.navy }), { pPr: `<w:jc w:val="center"/>${spacing(120, 120)}` }), { w: 3000, fill: C.white, vAlign: 'center', borders: `<w:top w:val="single" w:sz="8" w:color="${C.line}"/><w:left w:val="single" w:sz="8" w:color="${C.line}"/><w:bottom w:val="single" w:sz="8" w:color="${C.line}"/><w:right w:val="single" w:sz="8" w:color="${C.line}"/>` })}</w:tr>`], [3000]) + para('', { pPr: spacing(0, 160) });
  const block =
    plate +
    para(run(d.kicker ?? `${brand} · ${d.date}`, { b: true, sz: 17, color: C.gold, caps: true }), { pPr: spacing(120, 60) }) +
    para(run(d.title, { b: true, sz: d.title.length > 48 ? 46 : 54, color: C.white }), { pPr: spacing(0, 80) }) +
    (d.subtitle ? para(run(d.subtitle, { sz: 21, color: C.subtle }), { pPr: spacing(0, 120) }) : '') +
    para(run([d.org, d.unit].filter(Boolean).join(' · ') || brand, { sz: 16, color: C.subtle }), { pPr: spacing(0, 240) });
  if (cacD()) {
    // CAC cover: marine 5 pt band, breadcrumb, 20 pt title and warm subtitle beside the logo, CONFIDENTIEL, the alert pill,
    // the warm 2 pt rule, the key-figure cards, then « Le message clé ».
    const lead = d.kpis.find((k) => k.tone === 'risk') ?? d.kpis[0];
    const left =
      para(run(`🏠  01  ·  RAPPORT   —   Arrêté du ${d.asOf ?? d.date}${d.audience ? ` · ${d.audience}` : ''}`, { b: true, sz: 18, color: C.navy }), { pPr: spacing(60, 60) }) +
      para(run(d.title, { b: true, sz: d.title.length > 60 ? 36 : 40, color: C.navy }), { pPr: spacing(0, 60) }) +
      para(run(d.subtitle ?? [d.org, d.unit].filter(Boolean).join(' · '), { sz: 20, color: C.text2 }), { pPr: spacing(0, 60) });
    const right =
      (logo ? para(pictureXml('rIdLogo', 9002, 'Logo', logo.width, logo.height, 40 * 12700), { pPr: `<w:jc w:val="right"/>${spacing(60, 60)}` }) : para(run(brand.slice(0, 26), { b: true, sz: 22, color: C.navy }), { pPr: `<w:jc w:val="right"/>${spacing(60, 60)}` })) +
      para(run(`🔒 ${(d.confidentiality ?? 'CONFIDENTIEL').toUpperCase().slice(0, 30)}`, { b: true, sz: 16, color: CAC_NEUTRALS.alert }), { pPr: `<w:jc w:val="right"/>${spacing(0, 0)}` });
    b.push(
      para('', { pPr: `<w:pBdr><w:top w:val="single" w:sz="40" w:space="1" w:color="${C.navy}"/></w:pBdr>${spacing(0, 60)}` }),
      tbl([`<w:tr><w:trPr><w:cantSplit/></w:trPr>${tc(left, { w: 6900, vAlign: 'top' })}${tc(right, { w: PAGE_W - 6900, vAlign: 'top' })}</w:tr>`], [6900, PAGE_W - 6900]),
      lead ? para(run(`⚠  ${lead.value} · ${lead.label}`, { b: true, sz: 21, color: CAC_NEUTRALS.alert }), { pPr: `<w:shd w:val="clear" w:color="auto" w:fill="${CAC_NEUTRALS.alertBg}"/>${spacing(80, 80)}<w:ind w:left="60"/>` }) : '',
      para('', { pPr: `<w:pBdr><w:bottom w:val="single" w:sz="16" w:space="1" w:color="${C.line}"/></w:pBdr>${spacing(0, 240)}` }),
      kpiStrip(d.kpis.slice(0, 8), 4, true),
      para(emojiRun('📣', 13) + run('  01    Le message clé', { b: true, sz: 26, color: C.navy }), { pPr: `<w:shd w:val="clear" w:color="auto" w:fill="${C.panel}"/><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="2" w:color="${C.navy}"/></w:pBdr>${spacing(200, 120)}` }),
      para(emojiRun('💡', 14) + run(`  ${d.thesis}`, { b: true, sz: 28, color: C.navy }), { pPr: spacing(0, 120) }),
      d.messages[0] ? body(d.messages[0]) : '',
      para(`${run('Émetteur : ', { b: true, sz: 18, color: C.navy })}${run(d.author ?? brand, { sz: 18 })}`, { pPr: spacing(200, 40) }),
      d.dataSource ? para(`${run('Sources : ', { b: true, sz: 18, color: C.navy })}${run(`${d.dataSource}${d.asOf ? ` (arrêté du ${d.asOf})` : ''}${d.sources.length ? `, ${d.sources.length} sources documentaires` : ''}`, { sz: 18 })}`, { pPr: spacing(0, 40) }) : '',
      pageBreak(),
    );
  } else b.push(
    tbl([`<w:tr><w:trPr><w:cantSplit/></w:trPr>${tc(block, { w: PAGE_W, fill: C.navy, vAlign: 'top' })}</w:tr>`], [PAGE_W], { extra: '' }),
    para('', { pPr: `<w:pBdr><w:bottom w:val="single" w:sz="24" w:space="1" w:color="${C.gold}"/></w:pBdr>${spacing(0, 360)}` }),
    kpiStrip(d.kpis.slice(0, 4), 4, true),
    callout('La thèse', d.thesis),
    para(`${run('Émetteur : ', { b: true, sz: 18, color: C.navy })}${run(d.author ?? brand, { sz: 18 })}`, { pPr: spacing(200, 40) }),
    d.audience ? para(`${run('Destinataires : ', { b: true, sz: 18, color: C.navy })}${run(d.audience, { sz: 18 })}`, { pPr: spacing(0, 40) }) : '',
    d.dataSource ? para(`${run('Sources : ', { b: true, sz: 18, color: C.navy })}${run(`${d.dataSource}${d.asOf ? ` (arrêté du ${d.asOf})` : ''}${d.sources.length ? `, ${d.sources.length} sources documentaires` : ''}`, { sz: 18 })}`, { pPr: spacing(0, 40) }) : '',
    para(`${run('Diffusion : ', { b: true, sz: 18, color: C.navy })}${run(d.confidentiality ?? 'Usage interne', { b: true, sz: 18, color: C.risk })}${run(` — édité le ${d.date}`, { sz: 18, color: C.text2 })}`, { pPr: spacing(0, 40) }),
    pageBreak(),
  );

  // ── Table of contents (native field, pre-filled with the chapters; no page numbers → no update prompt) ──
  const tocEntries: { style: string; text: string }[] = [{ style: 'TOC1', text: 'Ce qu’il faut retenir' }, ...d.chapters.map((c) => ({ style: 'TOC1', text: `${c.n}. ${c.title}` })), { style: 'TOC1', text: `${d.chapters.length + 1}. Plan d’actions et décisions soumises au comité` }];
  const annexes: string[] = [];
  if (d.hypotheses.length) annexes.push('Annexe A — Registre des hypothèses');
  if (d.dataQuality?.items.length) annexes.push('Annexe B — Qualité des données');
  if (d.method) annexes.push('Annexe C — Méthode et paramètres');
  if (d.glossary.length) annexes.push('Annexe D — Glossaire');
  if (d.sources.length) annexes.push('Annexe E — Bibliographie');
  annexes.forEach((a) => tocEntries.push({ style: 'TOC1', text: a }));
  b.push(para(run('Sommaire', { b: true, sz: 32, color: C.navy }), { pPr: `<w:pBdr><w:bottom w:val="single" w:sz="18" w:space="4" w:color="${C.gold}"/></w:pBdr>${spacing(0, 200)}` }));
  const begin = '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-1" \\h \\z \\u \\n </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
  const end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
  tocEntries.forEach((e, i) => b.push(para(`${i === 0 ? begin : ''}${run(e.text, { sz: 20 })}<w:r><w:tab/></w:r>${i === tocEntries.length - 1 ? end : ''}`, { style: e.style })));
  b.push(pageBreak());

  // ── Ce qu'il faut retenir ──
  b.push(para(run('Ce qu’il faut retenir', { b: true, sz: 32, color: C.navy }), { style: 'Heading1' }));
  b.push(body(d.thesis, { i: true, color: C.text }));
  b.push(kpiStrip(d.kpis.slice(0, 10), 5));
  if (d.provenance) b.push(para(run(d.provenance, { i: true, sz: 15, color: C.text2 }), { pPr: spacing(0, 160) }));
  if (d.messages.length) {
    b.push(label(`${d.messages.length} messages clés`));
    d.messages.forEach((m, i) => b.push(para(`${run(`${i + 1}.  `, { b: true, sz: 20, color: C.gold, mono: true })}${run(m, { sz: 20 })}`, { pPr: `<w:ind w:left="400" w:hanging="400"/>${spacing(0, 80)}` })));
  }
  if (d.method?.steps.length) {
    b.push(label('Méthode'));
    b.push(dataTable(['Étape', 'Ce qui est fait'], d.method.steps.map((s) => [`${s.n}. ${s.label}`, s.detail ?? '']), [0.3, 0.7]));
    if (d.method.rules.length) d.method.rules.forEach((r) => b.push(bullet(r)));
  }
  if (d.method?.research?.length) {
    b.push(label('Ce que la recherche change dans notre lecture'));
    d.method.research.forEach((r) => b.push(bullet(r)));
  }

  // ── Chapters ──
  for (const ch of d.chapters) {
    if (cacD()) {
      // CAC: « 01    Titre » on the pale panel with its marine rule, then « Analyse de la feuille » in the chapter's colour.
      const col = ST[(ch.n - 1) % Math.max(1, ST.length)] ?? C.navy;
      b.push(para(`${run('▌ ', { b: true, sz: 30, color: col })}${emojiRun(buttonEmoji(ch.title, ch.n - 1), 15)}${run(`  ${pad2(ch.n)}    ${ch.title}`, { b: true, sz: 30, color: C.navy })}`, { style: 'Heading1', pPr: '<w:pageBreakBefore/>' }));
      const lead = ch.headline ?? ch.lecture;
      if (lead) {
        b.push(label('Analyse de la feuille'));
        b.push(tbl([`<w:tr>${tc(para(run(lead, { sz: 19, color: C.text }), { pPr: spacing(60, 60) }), { w: PAGE_W, fill: C.ice, borders: `<w:left w:val="single" w:sz="24" w:color="${col}"/>` })}</w:tr>`], [PAGE_W]) + para('', { pPr: spacing(0, 80) }));
      }
    } else b.push(para(run(`${ch.n}. ${ch.title}${ch.headline ? ` : ${ch.headline}` : ''}`, { b: true, sz: 30, color: C.navy }), { style: 'Heading1', pPr: '<w:pageBreakBefore/>' }));
    if (ch.kpis?.length) b.push(kpiStrip(ch.kpis.slice(0, 4).map((k) => ({ ...k, code: '' })), Math.min(4, ch.kpis.length)));
    if (ch.constats.length) {
      b.push(label('Constat chiffré'));
      ch.constats.forEach((c) => b.push(bullet(c)));
    }
    ch.figures.slice(0, 2).forEach((f) => addFigure(f));
    if (ch.analyse.length) {
      b.push(label('Analyse'));
      ch.analyse.forEach((a) => b.push(body(a)));
    }
    ch.figures.slice(2).forEach((f) => addFigure(f));
    for (const t of ch.tables) {
      if (t.title) b.push(label(t.title));
      b.push(dataTable(t.head, t.rows));
      if (t.lecture) b.push(para(run(`Lecture — ${t.lecture}`, { i: true, sz: 16, color: C.text2 }), { pPr: spacing(0, 120) }));
    }
    if (ch.cadre.length) {
      b.push(label('Cadre réglementaire et recherche'));
      ch.cadre.forEach((c) => b.push(bullet(c, { color: C.blue })));
    }
    if (ch.cas.length) {
      b.push(label('Cas emblématiques'));
      ch.cas.forEach((c) => b.push(bullet(c, { color: C.gold, char: '◆' })));
    }
    if (ch.recommandations.length) {
      b.push(label('Recommandations'));
      b.push(recoTable(ch.recommandations));
    }
    if (ch.lecture) b.push(callout('Lecture', ch.lecture, C.blue));
  }

  // ── Action plan and decisions ──
  const recos = allRecos(d);
  b.push(para(run(`${d.chapters.length + 1}. Plan d’actions et décisions soumises au comité`, { b: true, sz: 30, color: C.navy }), { style: 'Heading1', pPr: '<w:pageBreakBefore/>' }));
  if (recos.length) {
    const p1 = recos.filter((r) => r.priority === 'P1').length;
    b.push(body(`${recos.length} recommandations, dont ${p1} priorité P1 à engager en premier. Chaque action a un responsable, une échéance et un indicateur de clôture.`));
    b.push(recoTable(recos, true));
  }
  if (d.decisions.length) {
    b.push(label('Décisions soumises au vote'));
    d.decisions.forEach((x) => b.push(para(`${run(x.code, { b: true, sz: 19, color: C.risk, mono: true })}${run(`   ${x.text}`, { sz: 20 })}${run('      ☐ Pour   ☐ Contre', { sz: 16, color: C.text2 })}`, { pPr: `<w:ind w:left="500" w:hanging="500"/>${spacing(40, 100)}<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="2" w:color="${C.line}"/></w:pBdr>` })));
  }

  // ── Annexes ──
  let ax = 0;
  const annex = (title: string) => {
    ax++;
    b.push(para(run(`Annexe ${String.fromCharCode(64 + ax)} — ${title}`, { b: true, sz: 28, color: C.navy }), { style: 'Heading1', pPr: '<w:pageBreakBefore/>' }));
  };
  if (d.hypotheses.length) {
    annex('Registre des hypothèses');
    b.push(body('Chaque hypothèse est numérotée et motivée ; lorsqu’elle change un chiffre, elle est reliée à un paramètre. Aucune question bloquante n’a été posée : l’hypothèse la plus raisonnable a été retenue et documentée.', { i: true, color: C.text2 }));
    d.hypotheses.forEach((h) => b.push(para(`${run(`${h.code} — ${h.title}. `, { b: true, sz: 19, color: C.navy })}${run(h.text, { sz: 19 })}${h.param ? run(`  [paramètre : ${h.param}]`, { i: true, sz: 15, color: C.text2 }) : ''}`, { pPr: spacing(0, 100) })));
  }
  if (d.dataQuality?.items.length) {
    annex('Qualité des données');
    if (d.dataQuality.score != null) b.push(body(`Indice de qualité global : ${d.dataQuality.score}/100.`, { b: true, color: C.navy }));
    b.push(dataTable(['Source', 'Constat', 'Indice'], d.dataQuality.items.map((it) => [it.item, it.note, it.score != null ? String(it.score) : '—']), [0.25, 0.6, 0.15]));
  }
  if (d.method) {
    annex('Méthode et paramètres');
    if (d.method.steps.length) b.push(dataTable(['Étape', 'Détail'], d.method.steps.map((s) => [`${s.n}. ${s.label}`, s.detail ?? '']), [0.3, 0.7]));
    d.method.rules.forEach((r) => b.push(bullet(r)));
    const params = d.hypotheses.filter((h) => h.param);
    if (params.length) b.push(dataTable(['Paramètre', 'Hypothèse'], params.map((h) => [h.param!, `${h.code} — ${h.title}`]), [0.3, 0.7]));
  }
  if (d.glossary.length) {
    annex('Glossaire');
    b.push(dataTable(['Terme', 'Définition'], d.glossary.map((g) => [g.term, g.def]), [0.25, 0.75]));
  }
  if (d.sources.length) {
    annex('Bibliographie');
    const axes = [...new Set(d.sources.map((s) => s.axis ?? 'R1'))].sort();
    for (const a of axes) {
      const list = d.sources.filter((s) => (s.axis ?? 'R1') === a);
      b.push(label(`${a} — ${list.length} source${list.length > 1 ? 's' : ''}`));
      for (const s of list) {
        b.push(para(`${run(`[${s.id}] `, { b: true, sz: 17, color: C.blue, mono: true })}${run(s.title, { b: true, sz: 18 })}${s.author ? run(` — ${s.author}`, { sz: 18 }) : ''}${s.date ? run(` — ${s.date}`, { sz: 18, color: C.text2 }) : ''}${s.url ? run(` — ${s.url}`, { sz: 15, color: C.blue }) : ''}`, { pPr: spacing(80, 20) }));
        b.push(para(`${run('Enseignement : ', { i: true, b: true, sz: 16, color: C.text2 })}${run(s.lesson, { i: true, sz: 16 })}`, { pPr: `<w:ind w:left="300"/>${spacing(0, 20)}` }));
        if (s.application) b.push(para(`${run('Application à nos données : ', { i: true, b: true, sz: 16, color: C.text2 })}${run(s.application, { i: true, sz: 16 })}`, { pPr: `<w:ind w:left="300"/>${spacing(0, 60)}` }));
      }
    }
  }

  return pack(d, b.join(''), charts, logo);
}

let EMO_ID = 9100;
/** A Fluent 3D emoji as an inline picture (size in points), or the emoji font when the pack lacks it. */
function emojiRun(e: string, pt: number): string {
  return fluentB64(e) ? pictureXml(emojiRelId(e), EMO_ID++, 'Émoji', 64, 64, Math.round(pt * 12700)) : `<w:r><w:rPr><w:rFonts w:ascii="Segoe UI Emoji" w:hAnsi="Segoe UI Emoji"/><w:sz w:val="${Math.round(pt * 2)}"/></w:rPr><w:t xml:space="preserve">${esc(e)}</w:t></w:r>`;
}
function pictureXml(rid: string, id: number, name: string, w: number, h: number, fitH: number): string {
  let cx = w * 9525;
  let cy = h * 9525;
  cx = Math.round((cx * fitH) / Math.max(1, cy));
  cy = fitH;
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${esc(name)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function pack(d: Dossier, bodyXml: string, charts: { rid: string; file: string; xml: string }[], logo: ReportLogo | null): Uint8Array {
  const D = activeDesign();
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"';
  const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const fld = (instr: string, cached: string) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:color w:val="${C.blue}"/><w:sz w:val="16"/></w:rPr><w:t>${cached}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  const hdr = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}>${para(`${run(`${d.org ? `${d.org} — ` : ''}${d.title}${d.asOf ? ` · arrêté du ${d.asOf}` : ''}`, { sz: 15, color: C.text2 })}<w:r><w:tab/></w:r>${run(d.confidentiality?.toUpperCase() ?? 'USAGE INTERNE', { b: true, sz: 15, color: C.risk })}`, { pPr: `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="${C.gold}"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="${PAGE_W}"/></w:tabs>${spacing(0, 0)}` })}</w:hdr>`;
  const ftr = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}>${para(`${run([d.unit, d.audience].filter(Boolean).join(' · ') || 'MASSAMBA Workbench', { sz: 15, color: C.text2 })}<w:r><w:tab/></w:r>${run('page ', { sz: 15, color: C.text2 })}${fld('PAGE', '1')}${run(' / ', { sz: 15, color: C.text2 })}${fld('NUMPAGES', '1')}`, { pPr: `<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="${C.line}"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="${PAGE_W}"/></w:tabs>${spacing(0, 0)}` })}</w:ftr>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${bodyXml}<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/><w:titlePg/></w:sectPr></w:body></w:document>`;
  const style = (id: string, name: string, size: number, color: string, extra = '', basedOn = 'Normal') =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="${basedOn}"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/>${extra}</w:pPr><w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${D.font.ui}" w:hAnsi="${D.font.ui}" w:eastAsia="${D.font.ui}" w:cs="${D.font.ui}"/><w:color w:val="${C.text}"/><w:sz w:val="20"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${style('Heading1', 'heading 1', cacD() ? 26 : 30, C.navy, cacD() ? `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="${C.navy}"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="${C.panel}"/><w:outlineLvl w:val="0"/>` : `<w:pBdr><w:bottom w:val="single" w:sz="18" w:space="4" w:color="${C.gold}"/></w:pBdr><w:outlineLvl w:val="0"/>`)}${style('Heading2', 'heading 2', 24, C.blue, '<w:outlineLvl w:val="1"/>')}${style('Heading3', 'heading 3', 21, C.navy, '<w:outlineLvl w:val="2"/>')}<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${PAGE_W}"/></w:tabs><w:spacing w:after="60"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:pPr><w:ind w:left="300"/><w:spacing w:after="40"/></w:pPr></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ${W}><w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
  // Fluent 3D emoji pictures used in the body: one rel + one media file each.
  const emoFiles: Record<string, Uint8Array> = {};
  const emoRels = emojiRelsFor(doc, emoFiles, 'word/media', 'media');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>${charts.map((c) => `<Override PartName="/word/charts/${c.file}" ContentType="${CHART_CT}"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RELS}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(d.title)}</dc:title><dc:subject>${esc(d.subtitle ?? '')}</dc:subject><dc:creator>${esc(d.author || 'MASSAMBA Workbench')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`),
    'word/_rels/document.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RELS}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${RELS}/settings" Target="settings.xml"/><Relationship Id="rIdHdr" Type="${RELS}/header" Target="header1.xml"/><Relationship Id="rIdFtr" Type="${RELS}/footer" Target="footer1.xml"/>${logo ? `<Relationship Id="rIdLogo" Type="${RELS}/image" Target="media/dossier-logo.png"/>` : ''}${emoRels}${charts.map((c) => `<Relationship Id="${c.rid}" Type="${CHART_REL}" Target="charts/${c.file}"/>`).join('')}</Relationships>`,
    ),
    'word/document.xml': strToU8(orderPPr(doc)),
    'word/styles.xml': strToU8(orderPPr(styles)),
    'word/settings.xml': strToU8(settings),
    'word/header1.xml': strToU8(orderPPr(hdr)),
    'word/footer1.xml': strToU8(orderPPr(ftr)),
  };
  if (logo) files['word/media/dossier-logo.png'] = logo.png;
  Object.assign(files, emoFiles);
  for (const c of charts) files[`word/charts/${c.file}`] = strToU8(c.xml);
  return zipSync(files);
}
