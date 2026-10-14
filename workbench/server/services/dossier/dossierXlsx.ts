// THE COMMITTEE WORKBOOK — a Dossier rendered as the owner's « nouveau concept » workbook: a COCKPIT (ten indicators,
// thesis, the leading figures, key messages, navigation), one view per chapter (indicators, the figures' data with
// NATIVE Excel charts linked to the cells, the written analysis, the recommendations), the action plan with a follow-up
// column, the decisions, the register of hypotheses, the parameters, the data quality, the sources and the glossary,
// and the DATA_KPI sheet every tile reads with a live formula (the same figures everywhere). No gridlines, coloured
// tabs, the active design's colours and fonts on every sheet.
import XLSXS from 'xlsx-js-style';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { activeDesign, liveColorProxy, type Design } from '../houseDesign';
import { chartXml, fixStylesXml, type ChartSpec } from '../houseStyle';
import { allRecos, type Dossier, type Figure, type Kpi, type Tone } from './dossier';

type Cell = { v: unknown; t: 's' | 'n' | 'd' | 'b'; s?: Record<string, unknown>; z?: string; f?: string; l?: { Target: string; Tooltip?: string } };
const C = liveColorProxy((c) => c) as Design['color'];
const solid = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });
const border = (rgb: string, style = 'thin') => ({ style, color: { rgb } });
const box = (rgb?: string) => ({ top: border(rgb ?? C.line), bottom: border(rgb ?? C.line), left: border(rgb ?? C.line), right: border(rgb ?? C.line) });
const font = (extra: Record<string, unknown> = {}) => ({ name: activeDesign().font.ui, sz: 10, color: { rgb: C.text }, ...extra });
const mono = (extra: Record<string, unknown> = {}) => ({ name: activeDesign().font.mono, sz: 10, color: { rgb: C.text }, ...extra });
const toneColor = (t?: Tone): string => (t === 'risk' ? C.risk : t === 'warn' ? C.warn : t === 'ok' ? C.green : t === 'info' ? C.cyan : C.blue);
const E = (v = ''): Cell => ({ v, t: 's', s: { fill: solid(C.white) } });
const safeName = (s: string) => s.slice(0, 31).replace(/[\\/?*[\]:]/g, ' ').trim();
const colL = (i: number) => XLSXS.utils.encode_col(i);

interface SheetBuild {
  name: string;
  aoa: Cell[][];
  cols: number[];
  rows: Record<number, number>;
  merges: { s: { r: number; c: number }; e: { r: number; c: number } }[];
  tab: string;
  charts: ChartSpec[];
  validations?: { ref: string; list: string[] }[];
}

/** A view: the title band (merged), the subtitle band, then the blocks the caller appends. */
function newSheet(name: string, width: number, title: string, subtitle: string, tab: string): SheetBuild {
  const X = activeDesign().xlsx;
  const s: SheetBuild = { name: safeName(name), aoa: [], cols: Array.from({ length: width }, () => 14), rows: {}, merges: [], tab, charts: [] };
  s.aoa.push(Array.from({ length: width }, (_, i) => ({ v: i === 0 ? title : '', t: 's', s: { font: font({ sz: X.titleSize - 2, bold: true, color: { rgb: C.white } }), fill: solid(C.navy), alignment: { horizontal: 'left', vertical: 'center', indent: 1 }, border: { bottom: border(C.gold, 'medium') } } })));
  s.aoa.push(Array.from({ length: width }, (_, i) => ({ v: i === 0 ? subtitle : '', t: 's', s: { font: font({ sz: X.subtitleSize, color: { rgb: C.subtle } }), fill: solid(C.blue), alignment: { horizontal: 'left', vertical: 'center', indent: 1 } } })));
  s.merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: width - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: width - 1 } });
  s.rows[0] = X.rowHeight.title - 4;
  s.rows[1] = X.rowHeight.subtitle;
  s.aoa.push(Array.from({ length: width }, () => E()));
  s.rows[2] = 6;
  return s;
}
const blank = (s: SheetBuild, h = 6) => {
  s.aoa.push(Array.from({ length: s.cols.length }, () => E()));
  s.rows[s.aoa.length - 1] = h;
};
/** Section label (small caps, blue) spanning the sheet. */
const section = (s: SheetBuild, text: string) => {
  const r = s.aoa.length;
  s.aoa.push(Array.from({ length: s.cols.length }, (_, i) => ({ v: i === 0 ? text.toUpperCase() : '', t: 's', s: { font: font({ sz: 9, bold: true, color: { rgb: C.blue } }), fill: solid(C.white), alignment: { vertical: 'center' }, border: { bottom: border(C.line) } } })));
  s.merges.push({ s: { r, c: 0 }, e: { r, c: s.cols.length - 1 } });
  s.rows[r] = 18;
};
/** Wrapped text block spanning the sheet (several lines → several rows, one merged row each). */
const textRows = (s: SheetBuild, lines: string[], o: { italic?: boolean; bullet?: string; color?: string; fill?: string } = {}) => {
  for (const line of lines) {
    const r = s.aoa.length;
    const width = s.cols.reduce((a, b) => a + b, 0);
    const est = Math.max(1, Math.ceil((line.length + 4) / Math.max(20, width * 1.05)));
    s.aoa.push(Array.from({ length: s.cols.length }, (_, i) => ({ v: i === 0 ? `${o.bullet ? `${o.bullet} ` : ''}${line}` : '', t: 's', s: { font: font({ italic: Boolean(o.italic), color: { rgb: o.color ?? C.text } }), fill: solid(o.fill ?? C.white), alignment: { wrapText: true, vertical: 'top', indent: 1 } } })));
    s.merges.push({ s: { r, c: 0 }, e: { r, c: s.cols.length - 1 } });
    s.rows[r] = 15 * est + 2;
  }
};
/** KPI tiles over the width: label row (small caps) + value row (mono, live formula when given) + sub row (tone). */
function tiles(s: SheetBuild, kpis: { k: Kpi; f?: string }[], perTile = 2) {
  const X = activeDesign().xlsx;
  const w = s.cols.length;
  const gap = 1;
  const n = Math.min(kpis.length, Math.floor((w + gap) / (perTile + gap)));
  const rows = [s.aoa.length, s.aoa.length + 1, s.aoa.length + 2];
  const mk = (): Cell[] => Array.from({ length: w }, () => E());
  const label = mk();
  const value = mk();
  const sub = mk();
  for (let i = 0; i < n; i++) {
    const c0 = i * (perTile + gap);
    const { k, f } = kpis[i]!;
    const tone = toneColor(k.tone);
    label[c0] = { v: `${k.code} · ${k.label}`.toUpperCase(), t: 's', s: { font: font({ sz: X.kpiLabelSize - 0.5, bold: true, color: { rgb: C.text2 } }), fill: solid(C.panel), alignment: { horizontal: 'left', vertical: 'center', wrapText: true, indent: 1 }, border: { top: border(C.line), left: border(C.line), right: border(C.line) } } };
    const numeric = k.num != null && (f || Number.isFinite(k.num));
    value[c0] = numeric
      ? { v: k.num!, t: 'n', ...(f ? { f } : {}), z: k.value.includes('%') ? '0.0%' : Math.abs(k.num!) >= 1e6 ? '[>=1000000000]#,##0.0,,," Mds";[>=1000000]#,##0.0,," M";#,##0' : Number.isInteger(k.num) ? '#,##0' : '#,##0.00', s: { font: mono({ sz: X.kpiValueSize, bold: true, color: { rgb: C.navy } }), fill: solid(C.white), alignment: { horizontal: 'left', vertical: 'center', indent: 1 }, border: { left: border(C.line), right: border(C.line) } } }
      : { v: k.value, t: 's', s: { font: mono({ sz: X.kpiValueSize, bold: true, color: { rgb: C.navy } }), fill: solid(C.white), alignment: { horizontal: 'left', vertical: 'center', indent: 1 }, border: { left: border(C.line), right: border(C.line) } } };
    sub[c0] = { v: k.sub ?? k.method ?? '', t: 's', s: { font: font({ sz: 8, italic: true, color: { rgb: tone } }), fill: solid(C.white), alignment: { horizontal: 'left', vertical: 'center', wrapText: true, indent: 1 }, border: { left: border(C.line), right: border(C.line), bottom: border(tone, 'medium') } } };
    for (let j = 1; j < perTile; j++) {
      label[c0 + j] = { v: '', t: 's', s: label[c0]!.s };
      value[c0 + j] = { v: '', t: 's', s: value[c0]!.s };
      sub[c0 + j] = { v: '', t: 's', s: sub[c0]!.s };
    }
    if (perTile > 1) rows.forEach((r) => s.merges.push({ s: { r, c: c0 }, e: { r, c: c0 + perTile - 1 } }));
  }
  s.aoa.push(label, value, sub);
  s.rows[rows[0]!] = X.rowHeight.kpiLabel;
  s.rows[rows[1]!] = X.rowHeight.kpiValue - 10;
  s.rows[rows[2]!] = 26;
}
/** A styled table: navy header, zebra rows, numbers mono right-aligned; returns the 0-based header row. */
function tableRows(s: SheetBuild, head: string[], rows: (string | number)[][], o: { startCol?: number; widths?: number[]; tone?: (r: (string | number)[]) => string | null; status?: boolean } = {}): number {
  const X = activeDesign().xlsx;
  const c0 = o.startCol ?? 0;
  const hr = s.aoa.length;
  const mk = (): Cell[] => Array.from({ length: s.cols.length }, () => E());
  const h = mk();
  head.forEach((t, j) => (h[c0 + j] = { v: t, t: 's', s: { font: font({ sz: X.headerSize, bold: true, color: { rgb: C.white } }), fill: solid(C.navy), alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: { ...box(C.navy), bottom: border(C.gold, 'medium') } } }));
  s.aoa.push(h);
  s.rows[hr] = X.rowHeight.header;
  rows.forEach((r, i) => {
    const row = mk();
    const tone = o.tone?.(r) ?? null;
    r.forEach((v, j) => {
      const isN = typeof v === 'number';
      row[c0 + j] =
        j === 0 && tone
          ? { v: String(v), t: 's', s: { font: mono({ bold: true, color: { rgb: C.white } }), fill: solid(tone), alignment: { horizontal: 'center', vertical: 'center' }, border: box() } }
          : isN
            ? { v, t: 'n', z: Number.isInteger(v) ? X.numberFormat.integer : X.numberFormat.decimal, s: { font: mono(), fill: solid(i % 2 ? C.panel : C.white), alignment: { horizontal: 'right', vertical: 'center' }, border: box() } }
            : { v: String(v), t: 's', s: { font: font(), fill: solid(i % 2 ? C.panel : C.white), alignment: { horizontal: 'left', vertical: 'top', wrapText: true, indent: 0 }, border: box() } };
    });
    s.aoa.push(row);
    const longest = Math.max(...r.map((v, j) => (typeof v === 'string' ? v.length / Math.max(8, (o.widths?.[j] ?? s.cols[c0 + j] ?? 14) * 1.1) : 1)));
    s.rows[hr + 1 + i] = Math.max(16, Math.min(150, 15 * Math.ceil(longest) + 2));
  });
  if (o.widths) o.widths.forEach((w, j) => (s.cols[c0 + j] = Math.max(s.cols[c0 + j] ?? 0, w)));
  return hr;
}
/** The figure's data block (categories + series) at the right of the sheet, with its native chart anchored on the left. */
function figureBlock(s: SheetBuild, f: Figure, dataCol: number, chartCols: number): void {
  const X = activeDesign().xlsx;
  const r0 = s.aoa.length;
  const mk = (): Cell[] => Array.from({ length: s.cols.length }, () => E());
  const h = mk();
  h[dataCol] = { v: f.title.slice(0, 40), t: 's', s: { font: font({ bold: true, color: { rgb: C.white } }), fill: solid(C.blue), alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: box() } };
  f.series.forEach((se, j) => (h[dataCol + 1 + j] = { v: se.name, t: 's', s: { font: font({ bold: true, color: { rgb: C.white } }), fill: solid(C.blue), alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: box() } }));
  s.aoa.push(h);
  s.rows[r0] = 24;
  f.categories.forEach((cat, i) => {
    const row = mk();
    row[dataCol] = { v: cat, t: 's', s: { font: font(), fill: solid(i % 2 ? C.panel : C.white), border: box(), alignment: { vertical: 'center' } } };
    f.series.forEach((se, j) => (row[dataCol + 1 + j] = { v: se.values[i] ?? 0, t: 'n', z: f.unit === '%' ? '0.0' : Number.isInteger(se.values[i]) ? X.numberFormat.integer : X.numberFormat.decimal, s: { font: mono(), fill: solid(i % 2 ? C.panel : C.white), alignment: { horizontal: 'right', vertical: 'center' }, border: box() } }));
    s.aoa.push(row);
    s.rows[r0 + 1 + i] = 16;
  });
  const minRows = 14;
  while (s.aoa.length < r0 + 1 + minRows) blank(s, 16);
  if (f.lecture) textRows(s, [`Lecture — ${f.lecture}`], { italic: true, color: C.text2, fill: C.ice });
  const kind: ChartSpec['kind'] = f.kind === 'col3d' ? 'bar3d' : f.kind === 'bar3d' ? 'hbar3d' : f.kind === 'pie' || f.kind === 'doughnut' ? 'pie3d' : f.kind === 'line' ? 'line' : 'bar';
  s.charts.push({
    kind,
    title: f.title,
    sheet: s.name,
    first: r0 + 2,
    last: r0 + 1 + f.categories.length,
    anchorCol: 0,
    anchorRow: r0,
    abs: undefined,
    cat: { col: dataCol, name: 'Catégorie', values: f.categories },
    series: f.series.map((se, j) => ({ col: dataCol + 1 + j, name: se.name, values: se.values })),
  });
  // The chart spans the left columns over the block's height (set through the two-cell anchor below).
  (s.charts[s.charts.length - 1] as ChartSpec & { _span?: { cols: number; rows: number } })._span = { cols: chartCols, rows: Math.max(minRows, f.categories.length) + 1 };
}

export function dossierXlsx(d: Dossier): Uint8Array {
  const X = activeDesign().xlsx;
  const sub = `${[d.org, d.unit].filter(Boolean).join(' · ')}${d.asOf ? ` · arrêté du ${d.asOf}` : ''} · édité le ${d.date}${d.confidentiality ? ` · ${d.confidentiality}` : ''}`;
  const sheets: SheetBuild[] = [];
  const KPI = 'DATA_KPI';
  const kpiRef = (i: number) => `'${KPI}'!$C$${i + 2}`;

  // ── COCKPIT ──
  const ck = newSheet('COCKPIT', 15, d.title, sub, X.tabColor.summary);
  ck.cols = [3, 11, 11, 3, 11, 11, 3, 11, 11, 3, 11, 11, 3, 11, 11];
  blank(ck, 4);
  section(ck, 'Ce qu’il faut retenir — les mêmes indicateurs dans le classeur, le deck et le rapport');
  tiles(ck, d.kpis.slice(0, 5).map((k, i) => ({ k, f: k.num != null ? kpiRef(i) : undefined })), 2);
  blank(ck, 4);
  if (d.kpis.length > 5) {
    tiles(ck, d.kpis.slice(5, 10).map((k, i) => ({ k, f: k.num != null ? kpiRef(i + 5) : undefined })), 2);
    blank(ck, 4);
  }
  section(ck, 'La thèse');
  textRows(ck, [d.thesis], { italic: true, fill: C.ice });
  blank(ck, 4);
  // Navigation: one styled « button » per view.
  section(ck, 'Vues du classeur — cliquez pour ouvrir');
  const nav: { name: string; label: string }[] = [];
  const navRow = (): Cell[] => Array.from({ length: ck.cols.length }, () => E());
  // (filled after the sheets are known — placeholder row index)
  const navAt = ck.aoa.length;
  ck.aoa.push(navRow(), navRow());
  ck.rows[navAt] = 22;
  ck.rows[navAt + 1] = 22;
  blank(ck, 4);
  if (d.messages.length) {
    section(ck, `${d.messages.length} messages clés`);
    textRows(ck, d.messages.map((m, i) => `${i + 1}. ${m}`));
    blank(ck, 4);
  }
  // Leading figures of the cockpit: the first figure of the first three chapters.
  const lead = d.chapters.flatMap((c) => c.figures.slice(0, 1)).slice(0, 3);
  if (lead.length) {
    section(ck, 'Les figures qui portent la thèse');
    lead.forEach((f) => {
      figureBlock(ck, f, 10, 9);
      blank(ck, 6);
    });
  }
  sheets.push(ck);

  // ── Chapters ──
  d.chapters.forEach((ch) => {
    const s = newSheet(`${ch.n}·${ch.title}`, 15, `${ch.n}. ${ch.title}${ch.headline ? ` — ${ch.headline}` : ''}`, `${ch.kicker ?? ''} · ${sub}`, X.tabColor.detail);
    s.cols = [3, 11, 11, 3, 11, 11, 3, 11, 11, 3, 14, 11, 11, 11, 11];
    blank(s, 4);
    if (ch.kpis?.length) {
      tiles(s, ch.kpis.slice(0, 5).map((k) => ({ k })), 2);
      blank(s, 4);
    }
    if (ch.constats.length) {
      section(s, 'Constat chiffré');
      textRows(s, ch.constats, { bullet: '▪' });
      blank(s, 4);
    }
    ch.figures.forEach((f, i) => {
      section(s, `Figure ${i + 1} — ${f.title}`);
      figureBlock(s, f, 10, 9);
      blank(s, 6);
    });
    if (ch.analyse.length) {
      section(s, 'Analyse');
      textRows(s, ch.analyse);
      blank(s, 4);
    }
    if (ch.cadre.length) {
      section(s, 'Cadre réglementaire et recherche');
      textRows(s, ch.cadre, { bullet: '▪', color: C.text });
      blank(s, 4);
    }
    if (ch.cas.length) {
      section(s, 'Cas emblématiques');
      textRows(s, ch.cas, { bullet: '◆' });
      blank(s, 4);
    }
    for (const t of ch.tables) {
      section(s, t.title ?? 'Tableau');
      tableRows(s, t.head, t.rows, { startCol: 1, widths: t.head.map((_, j) => (j === 0 ? 22 : 14)) });
      if (t.lecture) textRows(s, [`Lecture — ${t.lecture}`], { italic: true, color: C.text2, fill: C.ice });
      blank(s, 4);
    }
    if (ch.recommandations.length) {
      section(s, 'Recommandations');
      tableRows(s, ['Réf.', 'Priorité', 'Recommandation', 'Action', 'Responsable', 'Échéance', 'Indicateur'], ch.recommandations.map((r) => [r.ref, r.priority, r.title, r.action, r.owner, r.due, r.kpi]), { startCol: 1, widths: [7, 8, 30, 50, 22, 11, 26], tone: (r) => (r[1] === 'P1' ? C.risk : r[1] === 'P2' ? C.warn : C.blue) });
      blank(s, 4);
    }
    if (ch.lecture) textRows(s, [`Lecture — ${ch.lecture}`], { italic: true, color: C.navy, fill: C.ice });
    sheets.push(s);
    nav.push({ name: s.name, label: `${ch.n}. ${ch.title}` });
  });

  // ── Action plan with a follow-up column ──
  const recos = allRecos(d);
  if (recos.length) {
    const s = newSheet("PLAN D'ACTIONS", 10, `Plan d’actions — ${recos.length} recommandations, ${recos.filter((r) => r.priority === 'P1').length} P1`, sub, X.tabColor.plan);
    s.cols = [7, 8, 32, 56, 14, 24, 12, 30, 12, 24];
    blank(s, 4);
    const hr = tableRows(s, ['Réf.', 'Priorité', 'Recommandation', 'Action', 'Axe', 'Responsable', 'Échéance', 'Indicateur', 'Statut', 'Commentaire'], recos.map((r) => [r.ref, r.priority, r.title, r.action, r.axis ?? '', r.owner, r.due, r.kpi, 'À faire', '']), { tone: (r) => (r[1] === 'P1' ? C.risk : r[1] === 'P2' ? C.warn : C.blue) });
    s.validations = [{ ref: `I${hr + 2}:I${hr + 1 + recos.length}`, list: ['À faire', 'En cours', 'Fait', 'Abandonné'] }];
    // Status and comment cells are input cells.
    for (let i = 0; i < recos.length; i++) {
      const row = s.aoa[hr + 1 + i]!;
      row[8] = { ...row[8]!, s: { ...(row[8]!.s as object), fill: solid(C.input) } };
      row[9] = { ...row[9]!, s: { ...(row[9]!.s as object), fill: solid(C.input) } };
    }
    sheets.push(s);
    nav.push({ name: s.name, label: 'Plan d’actions' });
  }
  if (d.decisions.length) {
    const s = newSheet('DÉCISIONS', 6, `${d.decisions.length} décisions soumises au vote du comité`, sub, X.tabColor.plan);
    s.cols = [7, 90, 10, 10, 12, 30];
    blank(s, 4);
    tableRows(s, ['Code', 'Décision', 'Pour', 'Contre', 'Vote', 'Commentaire'], d.decisions.map((x) => [x.code, x.text, '', '', '', '']), { tone: () => C.risk });
    s.validations = [{ ref: `E6:E${5 + d.decisions.length}`, list: ['Adoptée', 'Rejetée', 'Reportée'] }];
    sheets.push(s);
    nav.push({ name: s.name, label: 'Décisions' });
  }
  if (d.hypotheses.length) {
    const s = newSheet('HYPOTHÈSES', 4, 'Registre des hypothèses — numérotées, motivées, reliées aux paramètres', sub, X.tabColor.consolidation);
    s.cols = [7, 28, 110, 18];
    blank(s, 4);
    tableRows(s, ['Code', 'Hypothèse', 'Motivation', 'Paramètre'], d.hypotheses.map((h) => [h.code, h.title, h.text, h.param ?? '']), { tone: () => C.navy });
    sheets.push(s);
    nav.push({ name: s.name, label: 'Hypothèses' });
  }
  const params = d.hypotheses.filter((h) => h.param);
  if (params.length) {
    const s = newSheet('PARAMÈTRES', 4, 'Paramètres — cellules nommées, à ajuster puis recalcul', sub, X.tabColor.consolidation);
    s.cols = [24, 60, 18, 40];
    blank(s, 4);
    const hr = tableRows(s, ['Paramètre', 'Hypothèse', 'Valeur', 'Note'], params.map((h) => [h.param!, `${h.code} — ${h.title}`, '', 'saisir la valeur retenue']));
    for (let i = 0; i < params.length; i++) {
      const row = s.aoa[hr + 1 + i]!;
      row[2] = { ...row[2]!, s: { ...(row[2]!.s as object), fill: solid(C.input) } };
    }
    sheets.push(s);
    nav.push({ name: s.name, label: 'Paramètres' });
  }
  if (d.dataQuality?.items.length) {
    const s = newSheet('QUALITÉ', 12, `Qualité des données${d.dataQuality.score != null ? ` — indice global ${d.dataQuality.score}/100` : ''}`, sub, X.tabColor.consolidation);
    s.cols = [3, 11, 11, 3, 11, 11, 3, 11, 11, 3, 24, 60];
    blank(s, 4);
    section(s, 'Indice de qualité par source');
    const items = d.dataQuality.items;
    figureBlock(s, { kind: 'col3d', title: 'Indice de qualité par source (/100)', categories: items.map((it) => it.item), series: [{ name: 'Indice', values: items.map((it) => it.score ?? 0) }], fmt: '0' }, 10, 9);
    blank(s, 6);
    section(s, 'Constats par source');
    tableRows(s, ['Source', 'Constat'], items.map((it) => [it.item, it.note]), { startCol: 10 });
    sheets.push(s);
    nav.push({ name: s.name, label: 'Qualité' });
  }
  if (d.sources.length) {
    const s = newSheet('SOURCES', 8, `${d.sources.length} sources — bibliographie datée, enseignement et application`, sub, X.tabColor.data);
    s.cols = [8, 6, 50, 24, 12, 60, 60, 40];
    blank(s, 4);
    tableRows(s, ['Id', 'Axe', 'Source', 'Auteur', 'Date', 'Enseignement', 'Application à nos données', 'Lien'], d.sources.map((x) => [x.id, x.axis ?? '', x.title, x.author ?? '', x.date ?? '', x.lesson, x.application ?? '', x.url ?? '']), { tone: () => C.blue });
    sheets.push(s);
    nav.push({ name: s.name, label: 'Sources' });
  }
  if (d.glossary.length) {
    const s = newSheet('GLOSSAIRE', 2, 'Glossaire', sub, X.tabColor.data);
    s.cols = [24, 110];
    blank(s, 4);
    tableRows(s, ['Terme', 'Définition'], d.glossary.map((g) => [g.term, g.def]));
    sheets.push(s);
    nav.push({ name: s.name, label: 'Glossaire' });
  }
  // DATA_KPI: the figures every tile reads.
  {
    const s = newSheet(KPI, 5, 'DATA_KPI — les indicateurs, calculés une fois, lus par toutes les vues', sub, X.tabColor.data);
    s.cols = [8, 40, 18, 20, 70];
    s.aoa.length = 0;
    const hr = tableRows(s, ['Code', 'Indicateur', 'Valeur', 'Affichage', 'Méthode'], d.kpis.map((k) => [k.code, k.label, k.num ?? k.value, k.value, k.method ?? '']), { tone: () => C.navy });
    for (let i = 0; i < d.kpis.length; i++) {
      const row = s.aoa[hr + 1 + i]!;
      const k = d.kpis[i]!;
      if (k.num != null) row[2] = { ...row[2]!, z: k.value.includes('%') ? '0.00%' : Math.abs(k.num) >= 1e6 ? '#,##0' : Number.isInteger(k.num) ? '#,##0' : '#,##0.00' };
    }
    sheets.push(s);
    nav.push({ name: s.name, label: 'DATA_KPI' });
  }
  // Fill the cockpit navigation « buttons » (hyperlinks to the sheets).
  {
    const btn = (name: string, label: string, c0: number, r: number) => {
      const cells = ck.aoa[r]!;
      cells[c0] = { v: `▶ ${label}`, t: 's', l: { Target: `#'${name}'!A1`, Tooltip: `Ouvrir ${label}` }, s: { font: font({ bold: true, color: { rgb: C.white } }), fill: solid(C.blue), alignment: { horizontal: 'center', vertical: 'center' }, border: box(C.navy) } };
      cells[c0 + 1] = { v: '', t: 's', s: cells[c0]!.s };
      ck.merges.push({ s: { r, c: c0 }, e: { r, c: c0 + 1 } });
    };
    nav.forEach((n, i) => btn(n.name, n.label, 1 + (i % 5) * 3, navAt + Math.floor(i / 5)));
  }

  // ── Build the workbook ──
  const wb = XLSXS.utils.book_new();
  for (const s of sheets) {
    const ws = XLSXS.utils.aoa_to_sheet(s.aoa.map((r) => r.map((c) => ({ v: c.v, t: c.t, s: c.s, z: c.z, f: c.f, l: c.l }))));
    ws['!merges'] = s.merges;
    ws['!cols'] = s.cols.map((w) => ({ wch: w }));
    ws['!rows'] = Array.from({ length: s.aoa.length }, (_, i) => ({ hpt: s.rows[i] ?? 15 }));
    XLSXS.utils.book_append_sheet(wb, ws, s.name);
  }
  wb.Props = { Title: d.title, Subject: d.subtitle ?? '', Author: d.author || 'MASSAMBA Workbench' };
  const raw = new Uint8Array(XLSXS.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
  return finishWorkbook(raw, sheets);
}

/** Sheet views (no gridlines, zoom, tab colour), data validations and native charts on EVERY sheet. */
function finishWorkbook(bytes: Uint8Array, sheets: SheetBuild[]): Uint8Array {
  const z = unzipSync(bytes);
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  let ct = strFromU8(z['[Content_Types].xml']!);
  let chartNo = 0;
  const zoom = activeDesign().xlsx.zoom;
  sheets.forEach((s, i) => {
    const key = `xl/worksheets/sheet${i + 1}.xml`;
    if (!z[key]) return;
    let xml = strFromU8(z[key]!);
    const view = `<sheetViews><sheetView showGridLines="0" zoomScale="${zoom}" zoomScaleNormal="${zoom}" workbookViewId="0"${i === 0 ? ' tabSelected="1"' : ''}/></sheetViews>`;
    xml = /<sheetViews>[\s\S]*?<\/sheetViews>/.test(xml) ? xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, view) : xml.replace(/(<dimension [^>]*\/>)/, `$1${view}`);
    const tab = `<tabColor rgb="FF${s.tab}"/>`;
    xml = /<sheetPr[ >/]/.test(xml) ? (/<sheetPr[^>]*\/>/.test(xml) ? xml.replace(/<sheetPr([^>]*)\/>/, `<sheetPr$1>${tab}</sheetPr>`) : xml.replace(/(<sheetPr[^>]*>)/, `$1${tab}`)) : xml.replace(/(<dimension )/, `<sheetPr>${tab}</sheetPr>$1`);
    if (s.validations?.length) {
      const dv = `<dataValidations count="${s.validations.length}">${s.validations.map((v) => `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="${v.ref}"><formula1>"${v.list.join(',')}"</formula1></dataValidation>`).join('')}</dataValidations>`;
      // Schema order: … hyperlinks? no — dataValidations comes BEFORE hyperlinks and pageMargins.
      // Schema order: … conditionalFormatting, dataValidations, hyperlinks, …, pageMargins, …, ignoredErrors, drawing.
      const before = ['<hyperlinks', '<printOptions', '<pageMargins', '<pageSetup', '<headerFooter', '<ignoredErrors', '<drawing', '<tableParts', '</worksheet>'].find((tag) => xml.includes(tag))!;
      xml = xml.replace(before, `${dv}${before}`);
    }
    if (s.charts.length) {
      const dn = i + 1;
      const anchors = s.charts.map((c, k) => {
        chartNo++;
        const span = (c as ChartSpec & { _span?: { cols: number; rows: number } })._span ?? { cols: 9, rows: 15 };
        const frame = `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${k + 2}" name="Graphique ${chartNo}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="${REL}" r:id="rId${k + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame>`;
        return { no: chartNo, xml: chartXml(c), anchor: `<xdr:twoCellAnchor><xdr:from><xdr:col>${c.anchorCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.anchorRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c.anchorCol + span.cols}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.anchorRow + span.rows}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>${frame}<xdr:clientData/></xdr:twoCellAnchor>` };
      });
      const drawing = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors.map((a) => a.anchor).join('')}</xdr:wsDr>`;
      z[`xl/drawings/drawing${dn}.xml`] = strToU8(drawing);
      z[`xl/drawings/_rels/drawing${dn}.xml.rels`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${anchors.map((a, k) => `<Relationship Id="rId${k + 1}" Type="${REL}/chart" Target="../charts/chart${a.no}.xml"/>`).join('')}</Relationships>`);
      anchors.forEach((a) => (z[`xl/charts/chart${a.no}.xml`] = strToU8(a.xml)));
      ct = ct.replace('</Types>', `<Override PartName="/xl/drawings/drawing${dn}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>${anchors.map((a) => `<Override PartName="/xl/charts/chart${a.no}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')}</Types>`);
      // The sheet's rels may already exist (hyperlinks): append the drawing relationship.
      const relKey = `xl/worksheets/_rels/sheet${i + 1}.xml.rels`;
      const relXml = z[relKey] ? strFromU8(z[relKey]!) : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
      z[relKey] = strToU8(relXml.replace('</Relationships>', `<Relationship Id="rIdDrawing" Type="${REL}/drawing" Target="../drawings/drawing${dn}.xml"/></Relationships>`));
      // <drawing> goes after pageMargins / pageSetup and before <tableParts> / </worksheet>.
      xml = /<tableParts/.test(xml) ? xml.replace('<tableParts', '<drawing r:id="rIdDrawing"/><tableParts') : xml.replace('</worksheet>', '<drawing r:id="rIdDrawing"/></worksheet>');
      if (!/xmlns:r=/.test(xml)) xml = xml.replace('<worksheet ', `<worksheet xmlns:r="${REL}" `);
    }
    z[key] = strToU8(xml);
  });
  if (z['xl/styles.xml']) z['xl/styles.xml'] = strToU8(fixStylesXml(strFromU8(z['xl/styles.xml'])));
  z['[Content_Types].xml'] = strToU8(ct);
  return zipSync(z);
}
