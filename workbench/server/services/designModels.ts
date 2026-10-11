/**
 * MODÈLES ULTRA DESIGN — the built-in catalogue: 20 models for EACH format (Excel, Word, PowerPoint, PDF, Mail),
 * designed like the dashboards and documents found on the Internet (dark sidebars, coloured KPI tiles, editorial
 * covers, neon dark modes…). A model is a palette + a layout:
 *  - Excel: a dashboard design (DashSpec, the same structure the image reproduction measures on a picture). Choosing
 *    it is exactly like choosing an Internet image: live dashboard first (formulas, filters, native charts), then the
 *    model's colours on EVERY other sheet (band, KPI cards, charts, logo);
 *  - Word / PowerPoint / PDF / Mail: an Office skin with its own page layout (band, sidebar, boxed headings,
 *    editorial, dark…), applied to EVERY page / slide by the exporters' end-of-turn pass.
 * Thumbnails are drawn from the same tokens (Excel: the real renderer on sample data), so what you pick is what you get.
 */
import type { DashSpec, Panel } from './dashClone';

export type ModelFormat = 'excel' | 'word' | 'slides' | 'pdf' | 'mail';
export const MODEL_FORMATS: { id: ModelFormat; label: string }[] = [
  { id: 'excel', label: 'Excel' },
  { id: 'word', label: 'Word' },
  { id: 'slides', label: 'PowerPoint' },
  { id: 'pdf', label: 'PDF' },
  { id: 'mail', label: 'Mail' },
];
export interface ModelPalette {
  id: string;
  name: string;
  /** Darkest colour (bands, titles). */
  dark: string;
  primary: string;
  accent: string;
  /** Page / slide background. */
  page: string;
  /** Card / panel surface. */
  surface: string;
  /** Body text on the page. */
  text: string;
  series: string[];
  font: string;
  /** Dark-mode design (light text on dark pages). */
  night: boolean;
}
const pal = (id: string, name: string, dark: string, primary: string, accent: string, page: string, surface: string, text: string, series: string[], font: string, night = false): ModelPalette => ({ id, name, dark, primary, accent, page, surface, text, series, font, night });
/** 20 palettes, each tuned for contrast (WCAG AA for text on its page and on its tiles). */
export const MODEL_PALETTES: ModelPalette[] = [
  pal('midnight-neon', 'Midnight Neon', '#0B1020', '#7C3AED', '#22D3EE', '#0F172A', '#1E293B', '#E2E8F0', ['#7C3AED', '#22D3EE', '#F472B6', '#FBBF24', '#34D399'], 'Poppins', true),
  pal('sapphire-pro', 'Saphir Pro', '#0A1F44', '#1D4ED8', '#F59E0B', '#F1F5FB', '#FFFFFF', '#0F172A', ['#1D4ED8', '#60A5FA', '#F59E0B', '#0EA5E9', '#93C5FD'], 'Segoe UI'),
  pal('emerald-wealth', 'Émeraude Patrimoine', '#022C22', '#047857', '#C9A227', '#F3FAF6', '#FFFFFF', '#052E16', ['#047857', '#10B981', '#C9A227', '#6EE7B7', '#065F46'], 'Segoe UI'),
  pal('sunset-coral', 'Coucher de soleil', '#3B0D2C', '#E8505B', '#F9A826', '#FFF7F2', '#FFFFFF', '#2D1B1B', ['#E8505B', '#F9A826', '#7E3F8F', '#F6D365', '#FF8A65'], 'Montserrat'),
  pal('nordic-frost', 'Nordique', '#1F2A44', '#3E7CB1', '#81A4CD', '#F4F7FA', '#FFFFFF', '#1F2A44', ['#3E7CB1', '#81A4CD', '#DBE4EE', '#F17300', '#054A91'], 'Inter'),
  pal('onyx-gold', 'Onyx & Or', '#0B0B0F', '#1C1C24', '#D4AF37', '#111115', '#1C1C24', '#F5F1E6', ['#D4AF37', '#B08D57', '#F5E6B8', '#8C7853', '#E7C873'], 'Georgia', true),
  pal('sahel-terracotta', 'Sahel Terracotta', '#2B1406', '#B4532A', '#E0A526', '#FDF6EE', '#FFFFFF', '#2B1406', ['#B4532A', '#E0A526', '#1E5AA8', '#7A9E3B', '#D98B5F'], 'Segoe UI'),
  pal('ocean-teal', 'Océan', '#06283D', '#0F766E', '#14B8A6', '#F0FAF9', '#FFFFFF', '#06283D', ['#0F766E', '#14B8A6', '#5EEAD4', '#0369A1', '#F59E0B'], 'Inter'),
  pal('royal-plum', 'Prune royale', '#2E1065', '#6D28D9', '#EC4899', '#FAF7FF', '#FFFFFF', '#2E1065', ['#6D28D9', '#EC4899', '#A78BFA', '#F59E0B', '#22D3EE'], 'Poppins'),
  pal('graphite-lime', 'Graphite & Lime', '#0A0A0A', '#262626', '#A3E635', '#171717', '#262626', '#F5F5F5', ['#A3E635', '#22D3EE', '#FACC15', '#F472B6', '#A1A1AA'], 'Consolas', true),
  pal('ivory-editorial', 'Ivoire éditorial', '#1F1A17', '#7C5C3E', '#B08968', '#FBF8F3', '#FFFFFF', '#1F1A17', ['#7C5C3E', '#B08968', '#DDB892', '#3F3A36', '#A3A380'], 'Garamond'),
  pal('crimson-exec', 'Pourpre exécutif', '#3B0A16', '#9F1239', '#C8A951', '#FCF7F5', '#FFFFFF', '#3B0A16', ['#9F1239', '#C8A951', '#E11D48', '#FDA4AF', '#7F1D1D'], 'Georgia'),
  pal('mint-fresh', 'Menthe fraîche', '#064E3B', '#059669', '#F97316', '#F2FBF8', '#FFFFFF', '#064E3B', ['#059669', '#34D399', '#F97316', '#0EA5E9', '#A7F3D0'], 'Montserrat'),
  pal('desert-sand', 'Sable du désert', '#3D2C1E', '#A16207', '#0E7490', '#FBF6EC', '#FFFFFF', '#3D2C1E', ['#A16207', '#0E7490', '#D97706', '#65A30D', '#FCD34D'], 'Segoe UI'),
  pal('cyber-blue', 'Cyber bleu', '#020617', '#0EA5E9', '#22D3EE', '#020617', '#0F172A', '#E0F2FE', ['#0EA5E9', '#22D3EE', '#818CF8', '#F472B6', '#34D399'], 'Inter', true),
  pal('forest-moss', 'Forêt', '#1A2E05', '#3F6212', '#CA8A04', '#F7F9F1', '#FFFFFF', '#1A2E05', ['#3F6212', '#65A30D', '#CA8A04', '#84CC16', '#A16207'], 'Segoe UI'),
  pal('rose-quartz', 'Quartz rose', '#4A044E', '#BE185D', '#7C3AED', '#FFF5F8', '#FFFFFF', '#4A044E', ['#BE185D', '#F472B6', '#7C3AED', '#FBCFE8', '#A21CAF'], 'Poppins'),
  pal('slate-amber', 'Ardoise & ambre', '#1E293B', '#334155', '#F59E0B', '#F8FAFC', '#FFFFFF', '#0F172A', ['#334155', '#F59E0B', '#64748B', '#FBBF24', '#94A3B8'], 'Segoe UI'),
  pal('indigo-night', 'Nuit indigo', '#0C0A2A', '#4F46E5', '#F59E0B', '#0F0D33', '#1B1850', '#E0E7FF', ['#818CF8', '#F59E0B', '#22D3EE', '#F472B6', '#A5B4FC'], 'Montserrat', true),
  pal('kente', 'Kente', '#1B1B1B', '#D97706', '#15803D', '#FFFBF0', '#FFFFFF', '#1B1B1B', ['#D97706', '#15803D', '#B91C1C', '#FACC15', '#1D4ED8'], 'Segoe UI'),
];

// ── Excel: dashboard layouts (a designer's grid, in fractions of the page) ─────────────────────────────────────────
type B = Panel['box'];
const box = (x: number, y: number, w: number, h: number): B => ({ x, y, w, h });
function panel(p: ModelPalette, kind: Panel['kind'], b: B, o: Partial<Panel> = {}): Panel {
  return {
    box: b,
    kind,
    tiles: 1,
    titleAlign: 'left',
    valueLabels: kind === 'bar' || kind === 'hbar',
    legend: kind === 'pie' || kind === 'donut' ? 'bottom' : 'none',
    fill: p.surface,
    border: p.night ? null : mixHex(p.surface, p.primary, 0.14),
    borderWidth: 0.75,
    radius: 10,
    colors: p.series,
    ramp: [p.dark, p.primary, p.accent],
    text: p.text,
    sequential: false,
    ...o,
  };
}
const mixHex = (a: string, b: string, t: number) => {
  const A = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const Bc = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${A.map((x, i) => Math.round(x + (Bc[i]! - x) * t).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};
type Layout = { id: string; name: string; build: (p: ModelPalette) => Pick<DashSpec, 'title' | 'panels' | 'outer' | 'frame' | 'pageBox'> };
const tiles4 = (p: ModelPalette) => [p.primary, p.accent, p.series[2] ?? p.primary, p.series[3] ?? p.accent];
const LAYOUTS: Layout[] = [
  {
    id: 'sidebar',
    name: 'Barre latérale + tuiles',
    build: (p) => ({
      outer: p.dark,
      frame: null,
      pageBox: box(0, 0, 1, 1),
      title: { box: box(0.2, 0.025, 0.55, 0.075), color: p.text, align: 'left', fill: null },
      panels: [
        panel(p, 'filter', box(0, 0, 0.17, 1), { fill: p.dark, border: null, radius: 0, text: '#FFFFFF' }),
        panel(p, 'kpi', box(0.2, 0.12, 0.78, 0.15), { tiles: 4, tileFills: tiles4(p), border: null }),
        panel(p, 'bar', box(0.2, 0.3, 0.47, 0.36)),
        panel(p, 'donut', box(0.69, 0.3, 0.29, 0.36)),
        panel(p, 'area', box(0.2, 0.69, 0.47, 0.28)),
        panel(p, 'table', box(0.69, 0.69, 0.29, 0.28)),
      ],
    }),
  },
  {
    id: 'topband',
    name: 'Bandeau + cartes blanches',
    build: (p) => ({
      outer: p.page,
      frame: null,
      pageBox: box(0, 0, 1, 1),
      title: { box: box(0, 0, 1, 0.11), color: '#FFFFFF', align: 'left', fill: p.dark },
      panels: [
        panel(p, 'kpi', box(0.02, 0.14, 0.96, 0.15), { tiles: 4, tileFills: [p.surface, p.surface, p.surface, p.surface] }),
        panel(p, 'area', box(0.02, 0.32, 0.6, 0.34)),
        panel(p, 'donut', box(0.64, 0.32, 0.34, 0.34)),
        panel(p, 'hbar', box(0.02, 0.69, 0.47, 0.28)),
        panel(p, 'table', box(0.51, 0.69, 0.47, 0.28)),
      ],
    }),
  },
  {
    id: 'grid3',
    name: 'Grille trois colonnes',
    build: (p) => ({
      outer: p.page,
      frame: null,
      pageBox: box(0, 0, 1, 1),
      title: { box: box(0.02, 0.025, 0.6, 0.075), color: p.dark === p.page ? p.text : p.night ? p.text : p.dark, align: 'left', fill: null },
      panels: [
        panel(p, 'kpi', box(0.02, 0.12, 0.96, 0.16), { tiles: 3, tileFills: [p.primary, p.dark, p.accent], border: null }),
        panel(p, 'bar', box(0.02, 0.31, 0.31, 0.33), { sequential: true, colors: [p.primary, p.accent], ramp: [p.dark, p.primary, p.accent] }),
        panel(p, 'line', box(0.345, 0.31, 0.31, 0.33)),
        panel(p, 'pie', box(0.67, 0.31, 0.31, 0.33)),
        panel(p, 'table', box(0.02, 0.67, 0.96, 0.3)),
      ],
    }),
  },
  {
    id: 'executive',
    name: 'Exécutif — gros chiffres',
    build: (p) => ({
      outer: p.dark,
      frame: { color: p.accent, width: 0.004, radius: 0.01 },
      pageBox: box(0.015, 0.025, 0.97, 0.95),
      title: { box: box(0.04, 0.05, 0.6, 0.08), color: p.night ? p.text : p.dark, align: 'left', fill: null },
      panels: [
        panel(p, 'kpi', box(0.04, 0.16, 0.28, 0.36), { tiles: 2, tileFills: [p.primary, p.accent], border: null }),
        panel(p, 'line', box(0.34, 0.16, 0.62, 0.36)),
        panel(p, 'donut', box(0.04, 0.55, 0.28, 0.38)),
        panel(p, 'hbar', box(0.34, 0.55, 0.3, 0.38)),
        panel(p, 'table', box(0.66, 0.55, 0.3, 0.38)),
      ],
    }),
  },
  {
    id: 'cockpit',
    name: 'Cockpit — filtres en haut',
    build: (p) => ({
      outer: p.page,
      frame: null,
      pageBox: box(0, 0, 1, 1),
      title: { box: box(0.02, 0.02, 0.45, 0.08), color: p.night ? p.text : p.dark, align: 'left', fill: null },
      panels: [
        panel(p, 'filter', box(0.5, 0.02, 0.48, 0.09), { fill: mixHex(p.surface, p.primary, 0.08), radius: 8 }),
        panel(p, 'kpi', box(0.02, 0.13, 0.96, 0.15), { tiles: 4, tileFills: [p.dark, p.primary, p.accent, p.series[2] ?? p.primary], border: null }),
        panel(p, 'bar', box(0.02, 0.31, 0.64, 0.36)),
        panel(p, 'hbar', box(0.68, 0.31, 0.3, 0.66)),
        panel(p, 'area', box(0.02, 0.7, 0.64, 0.27)),
      ],
    }),
  },
];
/** The dashboard design of an Excel model (the same structure the image reproduction produces). */
export function modelSpec(p: ModelPalette, layout: string): DashSpec {
  const l = LAYOUTS.find((x) => x.id === layout) ?? LAYOUTS[0]!;
  const b = l.build(p);
  return {
    version: 1,
    aspect: 16 / 9,
    page: p.page,
    font: p.font,
    palette: { primary: p.primary, accent: p.accent, dark: p.night ? p.surface : p.dark, series: p.series },
    subtitle: null,
    ...b,
  };
}

// ── Word / PowerPoint / PDF / Mail layouts ─────────────────────────────────────────────────────────────────────────
export type DocLayout = 'band' | 'sidebar' | 'boxed' | 'editorial' | 'minimal';
export type SlideLayout = 'strips' | 'sidebar' | 'night' | 'corner' | 'minimal';
export const DOC_LAYOUTS: { id: DocLayout; name: string }[] = [
  { id: 'band', name: 'Bandeau' },
  { id: 'sidebar', name: 'Liseré latéral' },
  { id: 'boxed', name: 'Titres en cartouche' },
  { id: 'editorial', name: 'Éditorial' },
  { id: 'minimal', name: 'Minimal' },
];
export const SLIDE_LAYOUTS: { id: SlideLayout; name: string }[] = [
  { id: 'strips', name: 'Bandes' },
  { id: 'sidebar', name: 'Barre latérale' },
  { id: 'night', name: 'Mode sombre' },
  { id: 'corner', name: 'Angle accent' },
  { id: 'minimal', name: 'Minimal' },
];

/**
 * Printed documents (Word, PDF, mail) of a dark-mode palette: a white page, the palette's surface as the dark band
 * (a black A4 page is unreadable once printed and wastes ink).
 */
export function printPalette(p: ModelPalette): ModelPalette {
  return p.night ? { ...p, page: '#FFFFFF', surface: '#FFFFFF', text: '#1F2937', dark: p.surface === p.page ? p.dark : p.surface } : p;
}
/** Mail: Outlook ignores page layouts; the models differ by their header (filled band or minimal) and palette. */
const MAIL_LAYOUTS: { id: string; name: string }[] = [
  { id: 'band', name: 'En-tête plein' },
  { id: 'minimal', name: 'En-tête minimal' },
];

export interface DesignModel {
  id: string;
  format: ModelFormat;
  name: string;
  /** What the model looks like, in a few words. */
  tagline: string;
  palette: ModelPalette;
  /** Layout id (Excel: dashboard layout; others: page layout). */
  layout: string;
}
/** 20 models per format: each palette once, the layouts in turn (no two neighbours look alike). */
export const DESIGN_MODELS: DesignModel[] = MODEL_FORMATS.flatMap(({ id: format }) =>
  MODEL_PALETTES.map((p, i) => {
    const list: { id: string; name: string }[] = format === 'excel' ? LAYOUTS : format === 'slides' ? SLIDE_LAYOUTS : format === 'mail' ? MAIL_LAYOUTS : DOC_LAYOUTS;
    // Dark palettes get the dark slide layout; the others turn through the layouts.
    const l = format === 'slides' && p.night ? SLIDE_LAYOUTS[2]! : list[(i + MODEL_FORMATS.findIndex((f) => f.id === format)) % list.length]!;
    const lay = format === 'slides' && !p.night && l.id === 'night' ? SLIDE_LAYOUTS[0]! : l;
    return { id: `${format}-${p.id}`, format, name: p.name, tagline: `${lay.name} · ${p.font}`, palette: format === 'word' || format === 'pdf' || format === 'mail' ? printPalette(p) : p, layout: lay.id };
  }),
);
export const modelsFor = (f: ModelFormat) => DESIGN_MODELS.filter((m) => m.format === f);
export const modelById = (id: string | undefined): DesignModel | undefined => DESIGN_MODELS.find((m) => m.id === id) ?? generatedById(id);

// ── « GÉNÉRER 20 MODÈLES DE PLUS » — without end: palettes spread by the golden angle over the colour wheel, a colour
// harmony each, every 4th one in dark mode, the layouts in turn. Deterministic (an id always gives the same model).
const hslHex = (h: number, s: number, l: number): string => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
};
const lumOf = (hex: string) =>
  [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i]!, 0);
const vsWhite = (hex: string) => 1.05 / (lumOf(hex) + 0.05);
const HUE_NAMES: [number, string][] = [[0, 'Rubis'], [20, 'Corail'], [35, 'Mandarine'], [48, 'Ambre'], [60, 'Safran'], [85, 'Citron'], [120, 'Jade'], [150, 'Émeraude'], [175, 'Lagon'], [195, 'Turquoise'], [210, 'Azur'], [228, 'Cobalt'], [250, 'Indigo'], [275, 'Améthyste'], [300, 'Orchidée'], [325, 'Framboise']];
const hueName = (h: number) => HUE_NAMES.reduce((b, x) => (Math.abs(((x[0] - h + 540) % 360) - 180) < Math.abs(((b[0] - h + 540) % 360) - 180) ? x : b))[1];
const FONTS = ['Segoe UI', 'Inter', 'Montserrat', 'Poppins', 'Georgia', 'Garamond'];
const HARM: [string, number, number][] = [['analogue', 30, -30], ['complémentaire', 180, 160], ['triadique', 120, 240], ['tétradique', 90, 180], ['split', 150, 210]];
function generatedPalette(n: number): ModelPalette {
  const h = Math.round((n * 137.508) % 360);
  const [hn, o1, o2] = HARM[n % HARM.length]!;
  const night = n % 4 === 3;
  let l = 38;
  while (l > 18 && vsWhite(hslHex(h, 65, l)) < 4.6) l--;
  const primary = hslHex(h, 65, l);
  const accent = hslHex((h + o1 + 360) % 360, 80, night ? 60 : 50);
  const second = hslHex((h + o2 + 360) % 360, 70, night ? 62 : 46);
  const dark = hslHex(h, 55, 13);
  return {
    id: `gen-${n}`,
    name: `${hueName(h)} ${hn}${night ? ' nuit' : ''}`,
    dark,
    primary: night ? hslHex(h, 75, 60) : primary,
    accent,
    page: night ? hslHex(h, 45, 9) : hslHex(h, 35, 97),
    surface: night ? hslHex(h, 40, 15) : '#FFFFFF',
    text: night ? hslHex(h, 25, 92) : hslHex(h, 40, 12),
    series: [night ? hslHex(h, 75, 60) : primary, accent, second, hslHex(h, 55, 70), hslHex((h + o1 + 360) % 360, 60, 75)],
    font: FONTS[n % FONTS.length]!,
    night,
  };
}
/** Page `page` (0, 1, 2…) of the generated models of a format: 20 new ones per page, never ending. */
export function generatedModels(format: ModelFormat, page: number): DesignModel[] {
  return Array.from({ length: 20 }, (_, i) => generatedById(`${format}-gen-${page * 20 + i}`)!);
}
function generatedById(id: string | undefined): DesignModel | undefined {
  const m = id ? /^(excel|word|slides|pdf|mail)-gen-(\d+)$/.exec(id) : null;
  if (!m) return undefined;
  const format = m[1] as ModelFormat;
  const n = +m[2]!;
  const raw = generatedPalette(n);
  const p = format === 'word' || format === 'pdf' || format === 'mail' ? printPalette(raw) : raw;
  const list: { id: string; name: string }[] = format === 'excel' ? LAYOUTS : format === 'slides' ? SLIDE_LAYOUTS : format === 'mail' ? MAIL_LAYOUTS : DOC_LAYOUTS;
  let lay = list[(n * 3 + 1) % list.length]!;
  if (format === 'slides') lay = raw.night ? SLIDE_LAYOUTS[2]! : lay.id === 'night' ? SLIDE_LAYOUTS[0]! : lay;
  return { id: id!, format, name: raw.name, tagline: `${lay.name} · ${raw.font}`, palette: p, layout: lay.id };
}

// ── thumbnails (Word / PowerPoint / PDF / Mail; Excel uses the dashboard renderer) ──────────────────────────────────
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
export function modelThumbnail(m: DesignModel): string {
  const p = m.palette;
  const W = 240;
  const H = 150;
  const f = esc(p.font);
  const s: string[] = [];
  const lines = (x: number, y: number, n: number, w: number, c: string, gap = 7) => {
    for (let i = 0; i < n; i++) s.push(`<rect x="${x}" y="${y + i * gap}" width="${w - (i % 3) * 18}" height="3" rx="1.5" fill="${c}" opacity=".45"/>`);
  };
  const bars = (x: number, y: number, h: number, cols: string[]) => [0.55, 0.85, 0.4, 1, 0.7].forEach((v, i) => s.push(`<rect x="${x + i * 12}" y="${y + h * (1 - v)}" width="8" height="${h * v}" rx="1.5" fill="${cols[i % cols.length]}"/>`));
  if (m.format === 'slides') {
    const night = m.layout === 'night';
    s.push(`<rect width="${W}" height="${H}" rx="8" fill="${night ? p.dark : p.page}"/>`);
    const tc = night ? '#FFFFFF' : p.dark;
    if (m.layout === 'strips') s.push(`<rect width="${W}" height="10" fill="${p.dark}"/><rect y="10" width="${W}" height="2.5" fill="${p.accent}"/><rect y="${H - 8}" width="${W}" height="8" fill="${p.primary}"/>`);
    if (m.layout === 'sidebar') s.push(`<rect width="26" height="${H}" fill="${p.dark}"/><rect x="26" width="3" height="${H}" fill="${p.accent}"/>`);
    if (m.layout === 'corner') s.push(`<polygon points="${W - 70},0 ${W},0 ${W},70" fill="${p.accent}"/><polygon points="${W - 40},0 ${W},0 ${W},40" fill="${p.primary}"/>`);
    if (m.layout === 'night') s.push(`<rect x="0" y="${H - 4}" width="${W}" height="4" fill="${p.accent}"/>`);
    const x0 = m.layout === 'sidebar' ? 40 : 18;
    s.push(`<text x="${x0}" y="40" font-family="${f}" font-size="15" font-weight="700" fill="${tc}">Titre d’action</text>`);
    s.push(`<rect x="${x0}" y="47" width="${m.layout === 'minimal' ? 40 : 70}" height="${m.layout === 'minimal' ? 2 : 3}" fill="${p.accent}"/>`);
    lines(x0, 62, 4, 90, tc);
    bars(140, 60, 70, p.series);
  } else if (m.format === 'mail') {
    s.push(`<rect width="${W}" height="${H}" rx="8" fill="${mixHex(p.page, '#000000', 0.04)}"/>`);
    s.push(`<rect x="30" y="8" width="180" height="138" rx="4" fill="#FFFFFF" stroke="${mixHex('#FFFFFF', p.primary, 0.2)}"/>`);
    s.push(`<rect x="30" y="8" width="180" height="26" rx="4" fill="${m.layout === 'minimal' ? '#FFFFFF' : p.dark}"/><rect x="30" y="34" width="180" height="2.5" fill="${p.accent}"/>`);
    s.push(`<text x="40" y="25" font-family="${f}" font-size="9.5" font-weight="700" fill="${m.layout === 'minimal' ? p.dark : '#FFFFFF'}">Point quotidien</text>`);
    [0, 1, 2].forEach((i) => s.push(`<rect x="${40 + i * 57}" y="44" width="51" height="24" rx="3" fill="${i === 0 ? p.primary : mixHex('#FFFFFF', p.primary, 0.1)}"/><rect x="${45 + i * 57}" y="57" width="30" height="5" rx="1" fill="${i === 0 ? '#FFFFFF' : p.dark}"/>`));
    lines(40, 76, 3, 150, p.text);
    bars(40, 98, 38, p.series);
    s.push(`<rect x="110" y="104" width="90" height="8" fill="${p.primary}"/><rect x="110" y="112" width="90" height="8" fill="${mixHex('#FFFFFF', p.primary, 0.08)}"/><rect x="110" y="120" width="90" height="8" fill="#FFFFFF" stroke="${mixHex('#FFFFFF', p.primary, 0.15)}" stroke-width=".5"/>`);
  } else {
    // Word and PDF: an A4 page with the layout.
    const pdf = m.format === 'pdf';
    s.push(`<rect width="${W}" height="${H}" rx="8" fill="${mixHex(p.page, '#000000', 0.05)}"/>`);
    s.push(`<rect x="55" y="6" width="130" height="144" fill="${p.page}" stroke="${mixHex(p.page, p.dark, 0.12)}"/>`);
    const x0 = m.layout === 'sidebar' ? 74 : 64;
    if (m.layout === 'band') s.push(`<rect x="55" y="6" width="130" height="18" fill="${p.dark}"/><rect x="55" y="24" width="130" height="2" fill="${p.accent}"/>`);
    if (m.layout === 'sidebar') s.push(`<rect x="55" y="6" width="10" height="144" fill="${p.dark}"/><rect x="65" y="6" width="2" height="144" fill="${p.accent}"/>`);
    if (m.layout === 'minimal') s.push(`<rect x="64" y="12" width="112" height="1" fill="${p.accent}"/>`);
    if (m.layout === 'editorial') s.push(`<rect x="64" y="14" width="112" height="1" fill="${p.dark}"/><rect x="64" y="17" width="112" height=".6" fill="${p.dark}"/>`);
    const titleY = m.layout === 'band' ? 38 : 32;
    if (m.layout === 'boxed') s.push(`<rect x="${x0 - 3}" y="${titleY - 9}" width="100" height="13" rx="2" fill="${p.primary}"/>`);
    s.push(`<text x="${m.layout === 'editorial' ? 120 : x0}" y="${titleY}" text-anchor="${m.layout === 'editorial' ? 'middle' : 'start'}" font-family="${f}" font-size="9" font-weight="700" fill="${m.layout === 'boxed' ? '#FFFFFF' : p.dark}">${pdf ? 'Rapport PDF' : 'Rapport'}</text>`);
    lines(x0, titleY + 8, 4, 100, p.text, 6);
    s.push(`<rect x="${x0}" y="${titleY + 34}" width="${m.layout === 'sidebar' ? 100 : 108}" height="7" fill="${m.layout === 'minimal' ? mixHex('#FFFFFF', p.primary, 0.18) : p.primary}"/>`);
    for (let r = 0; r < 4; r++) s.push(`<rect x="${x0}" y="${titleY + 41 + r * 6}" width="${m.layout === 'sidebar' ? 100 : 108}" height="6" fill="${r % 2 ? mixHex('#FFFFFF', p.primary, 0.07) : '#FFFFFF'}" stroke="${mixHex('#FFFFFF', p.primary, 0.15)}" stroke-width=".4"/>`);
    bars(x0, titleY + 70, 34, p.series);
    if (pdf) s.push(`<rect x="160" y="128" width="22" height="16" rx="2" fill="${p.accent}"/><text x="171" y="139" text-anchor="middle" font-family="Arial" font-size="7" font-weight="700" fill="#FFFFFF">PDF</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${s.join('')}</svg>`;
}
