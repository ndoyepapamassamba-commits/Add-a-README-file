/**
 * PORTE DE DESIGN — the strict gate every Excel deliverable passes before it is handed over, whoever wrote it (the
 * exporters, the model's own openpyxl code, a re-saved file). It does not describe defects: it REMOVES them, and what
 * it cannot remove fails the gate by name.
 *  1. PALETTE: every colour of the workbook (cell fills, fonts, borders, tab colours, chart series, drawn shapes) is a
 *     colour of the chosen design or a neutral (white, greys, black). A foreign colour — the green the model remembered,
 *     an orange series — is mapped to the design colour of its role (dark → navy, warm → gold, light → ice, else primary).
 *  2. FONT: the design's UI font everywhere (cells and charts); monospace fonts are left alone.
 *  3. MAISON 2 BAND: every sheet with a table of amounts carries, above its header, the KPI cards and the chart zone
 *     (maisonBand is run when one is missing).
 *  4. CHARTS: a flat 2D bar / column / pie chart on such a sheet is rebuilt as the house native 3D chart on the same
 *     cells (same title, same references, design colours); charts whose references cannot be read keep their shape and
 *     only take the design colours.
 * The live dashboard (« Tableau de bord » and its sheets) is the chosen image's own design: never touched here.
 * Pure (bytes in → bytes out), deterministic. A null result means the file is not a workbook.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { setActiveTheme, type Design } from './houseDesign';
import { chartXml, type ChartSpec } from './houseStyle';
import { drawingOf, findTable, maisonBand, readRows, sharedStrings, sheetsOf, type SheetInfo } from './maisonBand';
import { ooxml } from './officeLogo';

const { relsOf } = ooxml;
type Zip = Record<string, Uint8Array>;
const rd = (z: Zip, p: string) => (z[p] ? strFromU8(z[p]!) : '');
const wr = (z: Zip, p: string, s: string) => {
  z[p] = strToU8(s);
};
const LIVE = /-live[-.]/;
/** Sheets the live dashboard owns (the image's design): never restyled. */
export const LIVE_SHEETS = new Set(['Tableau de bord', 'Tableau de bord vivant', 'Tableau de bord (image)', 'Données du tableau de bord', 'Données filtrables']);

export interface GateResult {
  bytes: Uint8Array;
  /** 100 when every rule passed; −20 per rule failed. */
  score: number;
  fixed: string[];
  failed: string[];
  checked: string[];
}

// ── colours ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const hx = (c: string) => c.replace('#', '').slice(-6).toUpperCase();
const rgb = (h: string): [number, number, number] => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const hsl = (h: string): [number, number, number] => {
  const [r, g, b] = rgb(h).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-6) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  return [hue, s, l];
};
const dist = (a: string, b: string) => {
  const A = rgb(a);
  const B = rgb(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};
/** Neutral: white, black, greys (no colour to replace). */
const neutral = (h: string) => hsl(h)[1] < 0.12 || hsl(h)[2] > 0.96 || hsl(h)[2] < 0.06;

/** The colours a design allows: its own (text, status and surface colours included), the chart series, neutrals. */
export function designColours(d: Design): string[] {
  const c = d.color as Record<string, string>;
  const own = Object.values(c).filter((x): x is string => typeof x === 'string' && /^#?[0-9A-Fa-f]{6}$/.test(x));
  return [...new Set([...own, ...d.chartSeries].map(hx))];
}

/**
 * The design's strong colours (its hues): the ones whose tints and shades count as the design's. The theme's own
 * colours only — the fixed extra chart series (orange, sky, green…) are allowed near their value, but a whole hue is
 * not the design's because one series colour shares it.
 */
export function designHues(d: Design): string[] {
  const c = d.color as Record<string, string>;
  const own = ['navy', 'blue', 'gold', 'cyan', 'sky'].map((k) => c[k]).filter((x): x is string => !!x);
  return [...new Set(own.map(hx))].filter((h) => {
    const [, s, l] = hsl(h);
    return s >= 0.25 && l >= 0.12 && l <= 0.8;
  });
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** HSL → hex (upper case, 6 digits). */
export function hexOf(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
/** The same relief (lightness offset from its base) on another colour. */
export function retint(stop: string, base: string, to: string): string {
  const lS = hsl(stop)[2];
  const lB = hsl(base)[2];
  const [hT, sT, lT] = hsl(to);
  return hexOf(hT, sT, clamp01(lT + (lS - lB)));
}

/**
 * A tint or a shade of a strong design colour (same hue, still coloured) belongs to the design: the relief of the
 * house 3D charts is made of lighter and darker stops of the palette, and a gate that flattened them would undo its
 * own charts. A pale surface colour (ice, panel, line) never defines a family: every blue is not a design blue.
 */
export function sameFamily(h: string, a: string): boolean {
  const [h1, s1] = hsl(h);
  const [h2, s2, l2] = hsl(a);
  if (s1 < 0.12 || s2 < 0.25 || l2 < 0.12 || l2 > 0.8) return false;
  const dh = Math.abs(((h1 - h2 + 540) % 360) - 180);
  return dh <= 14;
}

/** Where a foreign colour goes in the design: by its lightness and warmth. */
export function roleOf(h: string, d: Design): string {
  const c = d.color;
  const [hue, s, l] = hsl(h);
  if (l > 0.85) return c.ice;
  if (l < 0.3) return c.navy;
  const warm = hue >= 15 && hue <= 75 && s > 0.3;
  return warm ? c.gold : c.blue;
}

/**
 * Maps every foreign colour of one XML text to the design (memoised per colour). Returns the text and the count.
 * A gradient (the relief of a 3D chart or a shape) is handled as one object: its base colour (the stop of median
 * lightness) decides — a base that belongs to the design keeps its stops, a foreign base is re-tinted stop by stop
 * onto the role colour, so the relief survives instead of being flattened.
 */
export function mapColours(xml: string, d: Design, memo: Map<string, string>): { xml: string; n: number } {
  const allowed = designColours(d);
  const hues = designHues(d);
  const ofDesign = (h: string) => neutral(h) || allowed.some((a) => dist(a, h) < 28) || hues.some((a) => sameFamily(h, a));
  const role = (h: string) => {
    let to = memo.get(h);
    if (!to) {
      to = roleOf(h, d);
      memo.set(h, to);
    }
    return to;
  };
  let n = 0;
  // Gradients first, as whole objects; each one is then kept out of the colour-by-colour pass (a placeholder).
  const kept: string[] = [];
  const grads = xml.replace(/<a:gradFill\b[\s\S]*?<\/a:gradFill>/g, (block) => {
    const stops = [...block.matchAll(/<a:srgbClr val="([0-9A-Fa-f]{6})"/g)].map((m) => m[1]!.toUpperCase());
    const coloured = stops.filter((h) => !neutral(h));
    let out = block;
    if (coloured.length) {
      const byL = [...coloured].sort((a, b) => hsl(a)[2] - hsl(b)[2]);
      const base = byL[Math.floor(byL.length / 2)]!;
      if (!ofDesign(base)) {
        const to = role(base);
        out = block.replace(/(<a:srgbClr val=")([0-9A-Fa-f]{6})(")/g, (m, pre: string, hex: string, post: string) => {
          const h = hex.toUpperCase();
          if (neutral(h)) return m;
          n++;
          return `${pre}${retint(h, base, to)}${post}`;
        });
      }
    }
    kept.push(out);
    return `\uE000${kept.length - 1}\uE000`;
  });
  const out = grads
    .replace(/((?:rgb|val|color|fill|w:fill|w:color|w:val)=")(FF)?([0-9A-Fa-f]{6})(")/g, (m, pre: string, alpha: string | undefined, hex: string, post: string) => {
      const h = hex.toUpperCase();
      if (ofDesign(h)) return m;
      const to = role(h);
      if (to === h) return m;
      n++;
      return `${pre}${alpha ?? ''}${to}${post}`;
    })
    .replace(/\uE000(\d+)\uE000/g, (_m, i: string) => kept[+i]!);
  return { xml: out, n };
}

// ── charts ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const colIdx = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const unq = (s: string) => s.replace(/^'(.*)'$/, '$1').replace(/''/g, "'");
/** `'Sheet'!$A$5:$A$9` → sheet, column, rows. */
function parseRef(f: string): { sheet: string; col: number; r0: number; r1: number } | null {
  const m = /^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/.exec(f.replace(/&amp;/g, '&').replace(/&apos;/g, "'").trim());
  if (!m) return null;
  const col = colIdx(m[3]!);
  if (m[5] && colIdx(m[5]) !== col) return null;
  return { sheet: unq(m[1] ?? m[2]!), col, r0: +m[4]!, r1: +(m[6] ?? m[4]!) };
}
const chartKindOf = (x: string): 'bar' | 'hbar' | 'pie' | 'line' | null => {
  if (/<(?:c:)?barChart>/.test(x)) return /<(?:c:)?barDir val="bar"/.test(x) ? 'hbar' : 'bar';
  if (/<(?:c:)?pieChart>/.test(x) || /<(?:c:)?doughnutChart>/.test(x)) return 'pie';
  if (/<(?:c:)?lineChart>/.test(x)) return 'line';
  return null;
};
const already3d = (x: string) => /<(?:c:)?(bar3DChart|pie3DChart|line3DChart|area3DChart)>/.test(x);

/**
 * Rebuilds a flat chart as the house native chart on the same cells. Returns the new chart XML, or null when its
 * references cannot be read (another sheet, literals, several columns).
 */
export function rebuildChart(z: Zip, chart: string, sheets: SheetInfo[], d: Design): string | null {
  const kind = chartKindOf(chart);
  if (!kind || already3d(chart)) return null;
  const title = /<(?:c:)?title>[\s\S]*?<a:t>([^<]*)<\/a:t>/.exec(chart)?.[1]?.replace(/&amp;/g, '&') ?? '';
  const sers = [...chart.matchAll(/<(?:c:)?ser>([\s\S]*?)<\/(?:c:)?ser>/g)].map((m) => m[1]!);
  if (!sers.length || sers.length > 2) return null;
  const catF = /<(?:c:)?cat>[\s\S]*?<(?:c:)?f>([^<]+)<\/(?:c:)?f>/.exec(sers[0]!)?.[1];
  const cat = catF ? parseRef(catF) : null;
  if (!cat) return null;
  const sh = sheets.find((s) => s.name === cat.sheet);
  if (!sh) return null;
  const rows = readRows(rd(z, sh.part), sharedStrings(z));
  const at = (col: number, r: number) => rows.get(r)?.find((c) => c.col === col)?.v ?? null;
  const series: ChartSpec['series'] = [];
  for (const s of sers) {
    const valF = /<(?:c:)?val>[\s\S]*?<(?:c:)?f>([^<]+)<\/(?:c:)?f>/.exec(s)?.[1];
    const val = valF ? parseRef(valF) : null;
    if (!val || val.sheet !== cat.sheet || val.r0 !== cat.r0 || val.r1 !== cat.r1) return null;
    const txF = /<(?:c:)?tx>[\s\S]*?<(?:c:)?f>([^<]+)<\/(?:c:)?f>/.exec(s)?.[1];
    const tx = txF ? parseRef(txF) : null;
    const name = (tx ? at(tx.col, tx.r0) : null) ?? (/<(?:c:)?tx>[\s\S]*?<(?:c:)?v>([^<]*)<\/(?:c:)?v>/.exec(s)?.[1] ?? '');
    const values: number[] = [];
    for (let r = val.r0; r <= val.r1; r++) {
      const v = at(val.col, r);
      values.push(typeof v === 'number' ? v : 0);
    }
    series.push({ col: val.col, name: String(name).slice(0, 80), values });
  }
  const cats: string[] = [];
  for (let r = cat.r0; r <= cat.r1; r++) cats.push(String(at(cat.col, r) ?? ''));
  const spec: ChartSpec = {
    kind: kind === 'pie' ? 'pie3d' : kind === 'hbar' ? 'hbar3d' : kind === 'line' ? 'line' : 'bar3d',
    title: (title || `${series[0]!.name} par ${String(at(cat.col, cat.r0 - 1) ?? '')}`).slice(0, 90),
    sheet: cat.sheet,
    first: cat.r0,
    last: cat.r1,
    anchorCol: 0,
    anchorRow: 0,
    cat: { col: cat.col, name: String(at(cat.col, cat.r0 - 1) ?? ''), values: cats },
    series,
  };
  const prev = setActiveTheme(d);
  try {
    return chartXml(spec);
  } finally {
    setActiveTheme(prev);
  }
}

/** Chart parts drawn by a sheet (through its drawing's relationships). */
function chartsOf(z: Zip, part: string): string[] {
  const dp = drawingOf(z, part);
  if (!dp) return [];
  const rels = rd(z, relsOf(dp));
  return [...rels.matchAll(/<Relationship\b[^>]*Target="([^"]+)"[^>]*\/>/g)].map((m) => m[1]!).filter((t) => /charts\//.test(t)).map((t) => (t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\.\//, '')}`));
}

// ── the gate ────────────────────────────────────────────────────────────────────────────────────────────────────────
export function designGate(bytes: Uint8Array, d: Design, o: { skip?: ReadonlySet<string> } = {}): GateResult | null {
  let z: Zip;
  try {
    z = unzipSync(bytes);
  } catch {
    return null;
  }
  if (!z['xl/workbook.xml'] || !z['xl/styles.xml']) return null;
  const skip = new Set([...LIVE_SHEETS, ...(o.skip ?? [])]);
  const fixed: string[] = [];
  const failed: string[] = [];
  const checked: string[] = [];
  const font = d.font.ui;
  // 1 + 2. Palette and font on the style parts, the charts, the drawings, the tab colours (live parts excepted).
  const memo = new Map<string, string>();
  let colours = 0;
  let fonts = 0;
  const liveSheetParts = new Set(sheetsOf(z).filter((s) => skip.has(s.name)).map((s) => s.part));
  const liveCharts = new Set(sheetsOf(z).filter((s) => skip.has(s.name)).flatMap((s) => chartsOf(z, s.part)));
  const liveDrawings = new Set(sheetsOf(z).filter((s) => skip.has(s.name)).map((s) => drawingOf(z, s.part)).filter((x): x is string => !!x));
  for (const p of Object.keys(z)) {
    if (LIVE.test(p) || liveSheetParts.has(p) || liveCharts.has(p) || liveDrawings.has(p)) continue;
    const isStyle = p === 'xl/styles.xml';
    const isChart = /^xl\/charts\/[^/]+\.xml$/.test(p);
    const isDrawing = /^xl\/drawings\/[^/]+\.xml$/.test(p);
    const isSheet = /^xl\/worksheets\/[^/]+\.xml$/.test(p);
    if (!isStyle && !isChart && !isDrawing && !isSheet) continue;
    let x = rd(z, p);
    let changed = false;
    if (isSheet) {
      // Only the tab colour of a sheet (cell colours live in styles.xml).
      const r = mapColours(x.replace(/[\s\S]*?(<sheetPr>[\s\S]*?<\/sheetPr>)?/, (m) => m), d, memo);
      const tab = /<tabColor\b[^>]*rgb="(?:FF)?([0-9A-Fa-f]{6})"/.exec(x)?.[1];
      if (tab && r.n) {
        x = mapColours(x.slice(0, x.indexOf('<sheetData')), d, memo).xml + x.slice(x.indexOf('<sheetData'));
        colours++;
        changed = true;
      }
    } else {
      const r = mapColours(x, d, memo);
      if (r.n) {
        x = r.xml;
        colours += r.n;
        changed = true;
      }
    }
    if (isStyle) {
      x = x.replace(/<name val="([^"]+)"\/>/g, (m, v: string) => {
        if (v === font || /consolas|courier|mono/i.test(v)) return m;
        fonts++;
        changed = true;
        return `<name val="${font}"/>`;
      });
    }
    if (isChart) {
      x = x.replace(/<a:latin typeface="([^"]+)"/g, (m, v: string) => {
        if (v === font || /consolas|courier|mono/i.test(v)) return m;
        fonts++;
        changed = true;
        return `<a:latin typeface="${font}"`;
      });
    }
    if (changed) wr(z, p, x);
  }
  checked.push('palette du design sur chaque fond, texte, bordure, série de graphique, forme et onglet');
  if (colours) fixed.push(`${colours} couleur(s) étrangère(s) au design remplacée(s) par la couleur du rôle (foncé → navy, chaud → or, clair → ice, sinon primaire)`);
  checked.push(`police ${font} sur les cellules et les graphiques`);
  if (fonts) fixed.push(`${fonts} police(s) remplacée(s) par ${font}`);
  // 3. The Maison 2 band on every sheet with a table of amounts.
  let bytesNow: Uint8Array = zipSync(z, { level: 6 });
  const missing = (): string[] => {
    const zz = unzipSync(bytesNow);
    const sst = sharedStrings(zz);
    const out: string[] = [];
    for (const sh of sheetsOf(zz)) {
      if (skip.has(sh.name) || !zz[sh.part]) continue;
      const x = rd(zz, sh.part);
      const rows = readRows(x, sst);
      const t = findTable(rows);
      if (!t || !t.measures.length) continue;
      const above = [...x.matchAll(/<row\b[^>]*?\br="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)].some((m) => +m[1]! < t.header && /SUBTOTAL\(/.test(m[2] ?? ''));
      if (!above) out.push(sh.name);
    }
    return out;
  };
  let lacking = missing();
  checked.push('bande Maison 2 (indicateurs + zone de graphiques) au-dessus de chaque table de montants');
  if (lacking.length) {
    const r = maisonBand(bytesNow, d, skip);
    if (r) {
      bytesNow = r.bytes;
      fixed.push(`bande Maison 2 ajoutée sur ${r.banded.map((x) => `« ${x} »`).join(', ')} (${r.moved} graphique(s) déplacé(s), ${r.created} créé(s))`);
    }
    lacking = missing();
    if (lacking.length) failed.push(`bande Maison 2 absente sur ${lacking.map((x) => `« ${x} »`).join(', ')} (table sans montant lisible)`);
  }
  // 4. Flat charts rebuilt as the house native 3D charts on the same cells.
  z = unzipSync(bytesNow);
  const sheets = sheetsOf(z);
  let rebuilt = 0;
  let kept = 0;
  for (const sh of sheets) {
    if (skip.has(sh.name)) continue;
    for (const cp of chartsOf(z, sh.part)) {
      if (LIVE.test(cp) || !z[cp]) continue;
      const x = rd(z, cp);
      if (already3d(x) || !chartKindOf(x)) continue;
      const nx = rebuildChart(z, x, sheets, d);
      if (nx) {
        wr(z, cp, nx);
        rebuilt++;
      } else kept++;
    }
  }
  checked.push('graphiques natifs au style maison (3D, couleurs du design, police) sur les feuilles d’analyse');
  if (rebuilt) fixed.push(`${rebuilt} graphique(s) plat(s) reconstruit(s) en graphique maison 3D sur les mêmes cellules`);
  if (kept) fixed.push(`${kept} graphique(s) conservé(s) tel(s) quel(s) (références non lisibles) — couleurs du design appliquées`);
  return { bytes: zipSync(z, { level: 6 }), score: Math.max(0, 100 - 20 * failed.length), fixed, failed, checked };
}
