// GÉNÉRATEUR DE MISES EN PAGE — chaque modèle de tableau de bord a SA structure, pas un recoloriage :
//  1. une ossature (barre latérale gauche / droite, bandeau, cadre, héros, bento, magazine, cartes flottantes…) ;
//  2. une façon de montrer les indicateurs (rangée, colonne, bloc héros, dans la barre, jauges, aucun) ;
//  3. le reste de la page découpé récursivement (proportions variées) ;
//  4. chaque case reçoit la forme de graphique qui lui va (large → tendance, haute → classement / tableau, carrée →
//     anneau, jauge, colonnes) ;
//  5. un habillage (arrondis, bordures, cartes teintées ou sombres, espacement, alignement du titre).
// Déterministe : une graine donne toujours le même modèle ; deux graines voisines ne se ressemblent pas.
import type { DashSpec, Panel } from './dashClone';

export interface GenPalette {
  dark: string;
  primary: string;
  accent: string;
  page: string;
  surface: string;
  text: string;
  series: string[];
  night?: boolean;
}
type B = Panel['box'];
type Kind = Panel['kind'];

/** Small, fast, deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const mix = (a: string, b: string, t: number) => {
  const A = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const C = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${A.map((x, i) => Math.round(x + (C[i]! - x) * t).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

export const CHROMES = ['sidebar-left', 'sidebar-right', 'topband', 'filters-top', 'framed', 'hero-left', 'bento', 'magazine', 'floating', 'split-dark', 'bottom-dock', 'rail'] as const;
export type Chrome = (typeof CHROMES)[number];
export const KPI_MODES = ['row', 'column', 'hero', 'gauges', 'strip', 'none'] as const;
export type KpiMode = (typeof KPI_MODES)[number];
const CHROME_NAME: Record<Chrome, string> = {
  'sidebar-left': 'Barre latérale',
  'sidebar-right': 'Panneau de droite',
  topband: 'Bandeau plein',
  'filters-top': 'Cockpit à segments',
  framed: 'Cadre galerie',
  'hero-left': 'Héros à gauche',
  bento: 'Bento',
  magazine: 'Magazine',
  floating: 'Cartes flottantes',
  'split-dark': 'Moitié sombre',
  'bottom-dock': 'Dock en bas',
  rail: 'Rail d’icônes',
};
const KPI_NAME: Record<KpiMode, string> = { row: 'tuiles en rangée', column: 'colonne de chiffres', hero: 'gros chiffres', gauges: 'jauges', strip: 'bande de chiffres', none: 'graphiques seuls' };

export interface GenLayout extends Pick<DashSpec, 'title' | 'panels' | 'outer' | 'frame' | 'pageBox'> {
  chrome: Chrome;
  kpi: KpiMode;
  name: string;
  /** Structure fingerprint (two models with the same one would look alike). */
  signature: string;
}

/** Recursive guillotine split of a rectangle into n cells, with varied proportions. */
function split(r: () => number, b: B, n: number): B[] {
  if (n <= 1) return [b];
  const vertical = b.w / b.h > 1.25 ? r() < 0.8 : b.h / b.w > 1.25 ? r() < 0.2 : r() < 0.5;
  const k = Math.max(1, Math.min(n - 1, Math.round(n * pick(r, [0.34, 0.4, 0.5, 0.6, 0.66]))));
  const t = Math.min(0.72, Math.max(0.28, (k / n) * (0.85 + r() * 0.3)));
  const [a, c] = vertical ? [{ ...b, w: b.w * t }, { x: b.x + b.w * t, y: b.y, w: b.w * (1 - t), h: b.h }] : [{ ...b, h: b.h * t }, { x: b.x, y: b.y + b.h * t, w: b.w, h: b.h * (1 - t) }];
  return [...split(r, a, k), ...split(r, c, n - k)];
}
/** The chart form a cell's shape calls for (aspect = w / h on a 16:9 page). */
function kindFor(r: () => number, b: B, used: Kind[]): Kind {
  const a = (b.w * 16) / (b.h * 9);
  const opts: Kind[] = a > 2.2 ? ['line', 'area', 'bar', 'table'] : a < 0.8 ? ['hbar', 'table', 'hbar', 'text'] : a < 1.4 ? ['donut', 'pie', 'bar', 'gauge', 'hbar'] : ['bar', 'line', 'area', 'hbar', 'donut', 'table'];
  // Prefer a form not used yet: a dashboard of six bar charts reads as one chart.
  const fresh = opts.filter((k) => !used.includes(k));
  return pick(r, fresh.length ? fresh : opts);
}
const inset = (b: B, g: number): B => ({ x: b.x + g / 2, y: b.y + g / 2, w: Math.max(0.02, b.w - g), h: Math.max(0.02, b.h - g) });

export function generateLayout(seed: number, p: GenPalette, o: { chrome?: Chrome; kpi?: KpiMode } = {}): GenLayout {
  const r = rng(seed * 7919 + 17);
  const chrome = o.chrome ?? CHROMES[seed % CHROMES.length]!;
  const kpi = o.kpi ?? KPI_MODES[Math.floor(seed / CHROMES.length + seed * 5) % KPI_MODES.length]!;
  // ── habillage
  const radius = pick(r, [0, 3, 6, 10, 16, 24]);
  const gap = pick(r, [0.008, 0.012, 0.018, 0.026]);
  const cardStyle = pick(r, ['line', 'none', 'tint', 'shadowless', 'dark'] as const);
  const night = Boolean(p.night);
  const cardFill = cardStyle === 'tint' ? mix(p.surface, p.primary, night ? 0.12 : 0.06) : cardStyle === 'dark' && !night ? p.surface : p.surface;
  const border = cardStyle === 'line' ? mix(p.surface, p.primary, 0.22) : cardStyle === 'shadowless' ? mix(p.surface, p.text, 0.12) : null;
  const titleAlign = r() < 0.3 ? 'center' : 'left';
  const card = (kind: Kind, b: B, x: Partial<Panel> = {}): Panel => ({
    box: inset(b, gap),
    kind,
    tiles: 1,
    titleAlign,
    valueLabels: kind === 'bar' || kind === 'hbar' ? r() < 0.75 : r() < 0.25,
    legend: kind === 'pie' || kind === 'donut' ? pick(r, ['right', 'bottom'] as const) : 'none',
    fill: cardFill,
    border,
    borderWidth: cardStyle === 'line' ? pick(r, [0.75, 1.25]) : 0.75,
    radius,
    colors: r() < 0.5 ? p.series : [p.primary, ...p.series.slice(1)],
    ramp: [p.dark, p.primary, p.accent],
    text: p.text,
    sequential: r() < 0.35,
    ...x,
  });
  const tiles = (n: number) => Array.from({ length: n }, (_, i) => [p.primary, p.accent, p.series[2] ?? p.dark, p.dark, p.series[3] ?? p.primary][(i + seed) % 5]!);
  const panels: Panel[] = [];
  let outer = p.page;
  let frame: DashSpec['frame'] = null;
  let pageBox: B = { x: 0, y: 0, w: 1, h: 1 };
  let title: DashSpec['title'] = { box: { x: 0.03, y: 0.025, w: 0.6, h: 0.075 }, color: night ? p.text : p.dark, align: titleAlign, fill: null };
  // content rectangle
  let C: B = { x: 0.02, y: 0.11, w: 0.96, h: 0.87 };
  switch (chrome) {
    case 'sidebar-left':
    case 'rail': {
      const w = chrome === 'rail' ? 0.1 : pick(r, [0.15, 0.18, 0.21]);
      panels.push(card('filter', { x: 0, y: 0, w, h: 1 }, { box: { x: 0, y: 0, w, h: 1 }, fill: p.dark, border: null, radius: 0, text: '#FFFFFF' }));
      title = { ...title, box: { x: w + 0.03, y: 0.025, w: 0.55, h: 0.075 } };
      C = { x: w + 0.01, y: 0.11, w: 0.98 - w, h: 0.87 };
      break;
    }
    case 'sidebar-right': {
      const w = pick(r, [0.2, 0.24]);
      panels.push(card('filter', { x: 1 - w, y: 0, w, h: 1 }, { box: { x: 1 - w, y: 0, w, h: 1 }, fill: mix(p.page, p.primary, night ? 0.25 : 0.1), border: null, radius: 0 }));
      C = { x: 0.02, y: 0.11, w: 0.96 - w, h: 0.87 };
      title = { ...title, box: { x: 0.03, y: 0.025, w: 0.5, h: 0.075 } };
      break;
    }
    case 'topband': {
      const h = pick(r, [0.1, 0.13]);
      title = { box: { x: 0, y: 0, w: 1, h }, color: '#FFFFFF', align: titleAlign, fill: p.dark };
      C = { x: 0.02, y: h + 0.02, w: 0.96, h: 0.97 - h - 0.02 };
      break;
    }
    case 'filters-top':
      panels.push(card('filter', { x: 0.5, y: 0.015, w: 0.48, h: 0.095 }, { fill: mix(p.surface, p.primary, 0.08), radius: Math.min(radius, 10) }));
      title = { ...title, box: { x: 0.03, y: 0.025, w: 0.45, h: 0.075 } };
      break;
    case 'framed':
      outer = p.dark;
      frame = { color: p.accent, width: pick(r, [0.003, 0.006]), radius: pick(r, [0, 0.012, 0.02]) };
      pageBox = { x: 0.02, y: 0.03, w: 0.96, h: 0.94 };
      title = { ...title, box: { x: 0.05, y: 0.05, w: 0.55, h: 0.07 } };
      C = { x: 0.04, y: 0.14, w: 0.92, h: 0.81 };
      break;
    case 'hero-left': {
      const w = pick(r, [0.3, 0.34]);
      panels.push(card('kpi', { x: 0.02, y: 0.11, w, h: 0.87 }, { tiles: 3, tileFills: tiles(3), border: null }));
      C = { x: 0.02 + w, y: 0.11, w: 0.96 - w, h: 0.87 };
      break;
    }
    case 'bento':
      title = { ...title, align: 'center', box: { x: 0.2, y: 0.02, w: 0.6, h: 0.07 } };
      C = { x: 0.03, y: 0.1, w: 0.94, h: 0.88 };
      break;
    case 'magazine':
      title = { box: { x: 0.03, y: 0.02, w: 0.94, h: 0.12 }, color: night ? p.text : p.dark, align: 'left', fill: null };
      panels.push(card('text', { x: 0.02, y: 0.15, w: 0.26, h: 0.83 }, { fill: mix(p.surface, p.accent, 0.08), border: null }));
      C = { x: 0.28, y: 0.15, w: 0.7, h: 0.83 };
      break;
    case 'floating':
      outer = mix(p.page, p.primary, night ? 0.2 : 0.12);
      C = { x: 0.04, y: 0.12, w: 0.92, h: 0.84 };
      break;
    case 'split-dark':
      panels.push(card('kpi', { x: 0, y: 0, w: 0.42, h: 0.42 }, { box: { x: 0, y: 0, w: 0.42, h: 0.45 }, tiles: 2, tileFills: [p.dark, p.dark], fill: p.dark, border: null, radius: 0, text: '#FFFFFF' }));
      title = { box: { x: 0.45, y: 0.03, w: 0.5, h: 0.08 }, color: night ? p.text : p.dark, align: 'left', fill: null };
      C = { x: 0.43, y: 0.12, w: 0.55, h: 0.86 };
      panels.push(card('donut', { x: 0.02, y: 0.47, w: 0.4, h: 0.51 }));
      break;
    case 'bottom-dock':
      panels.push(card('filter', { x: 0.02, y: 0.88, w: 0.96, h: 0.1 }, { fill: p.dark, text: '#FFFFFF', border: null, radius: Math.min(radius, 12) }));
      C = { x: 0.02, y: 0.11, w: 0.96, h: 0.76 };
      break;
  }
  // ── indicators
  const kMode: KpiMode = chrome === 'hero-left' || chrome === 'split-dark' ? 'none' : kpi;
  if (kMode === 'row' || kMode === 'strip') {
    const h = kMode === 'strip' ? 0.09 : pick(r, [0.14, 0.17]);
    const n = pick(r, [3, 4, 5]);
    panels.push(card('kpi', { ...C, h }, { tiles: n, tileFills: kMode === 'strip' ? Array(n).fill(cardFill) : tiles(n), border: kMode === 'strip' ? border : null }));
    C = { ...C, y: C.y + h, h: C.h - h };
  } else if (kMode === 'column') {
    const w = pick(r, [0.17, 0.2]);
    panels.push(card('kpi', { x: C.x, y: C.y, w, h: C.h / 2 }, { tiles: 1, tileFills: [p.primary], border: null }));
    panels.push(card('kpi', { x: C.x, y: C.y + C.h / 2, w, h: C.h / 2 }, { tiles: 1, tileFills: [p.accent], border: null }));
    C = { ...C, x: C.x + w, w: C.w - w };
  } else if (kMode === 'hero') {
    const h = pick(r, [0.22, 0.26]);
    panels.push(card('kpi', { ...C, w: C.w * 0.55, h }, { tiles: 2, tileFills: [p.primary, p.dark], border: null }));
    panels.push(card('line', { x: C.x + C.w * 0.55, y: C.y, w: C.w * 0.45, h }));
    C = { ...C, y: C.y + h, h: C.h - h };
  } else if (kMode === 'gauges') {
    const h = pick(r, [0.2, 0.24]);
    const n = pick(r, [2, 3]);
    for (let i = 0; i < n; i++) panels.push(card('gauge', { x: C.x + (C.w / n) * i, y: C.y, w: C.w / n, h }));
    C = { ...C, y: C.y + h, h: C.h - h };
  }
  // ── the rest of the page, cut and given forms
  const nCells = chrome === 'bento' ? pick(r, [5, 6, 7]) : pick(r, [3, 4, 5]);
  const used: Kind[] = panels.map((x) => x.kind);
  const cells = split(r, C, nCells);
  let hasTable = used.includes('table');
  for (const b of cells) {
    let k = kindFor(r, b, used);
    if (!hasTable && b === cells[cells.length - 1] && (b.w * 16) / (b.h * 9) > 0.9) k = 'table';
    if (k === 'table') hasTable = true;
    used.push(k);
    panels.push(card(k, b, chrome === 'floating' ? { border: null } : {}));
  }
  const signature = `${chrome}|${kMode}|${panels.map((x) => `${x.kind}@${Math.round(x.box.x * 10)},${Math.round(x.box.y * 10)},${Math.round(x.box.w * 10)},${Math.round(x.box.h * 10)}`).join(';')}`;
  return { outer, frame, pageBox, title, panels, chrome, kpi: kMode, name: `${CHROME_NAME[chrome]} · ${KPI_NAME[kMode]}`, signature };
}
