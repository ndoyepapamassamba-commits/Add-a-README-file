// CHARTE D'EXPORT VERROUILLÉE — « GOD 3D · BLUE ECOBANK ».
// Source de vérité unique du design de TOUS les exports (Excel, Word, PowerPoint, PDF/HTML imprimable, mail).
// Les valeurs ont été relevées sur le classeur de référence « Impayés 30-90j plan d'actions » (feuilles
// Sommaire APEX, Impayés, Débiteurs, Synthèse, CONSOLIDATION…) : polices, couleurs, hauteurs de lignes, cartes KPI,
// bandeaux, couleurs d'onglets, formats de nombres, couleurs de statuts.
//
// VERROU : l'objet est profondément figé (toute écriture lève une erreur), sa signature est recalculée à l'exécution
// et comparée à `DESIGN_LOCK` (littéral). Changer la charte exige de modifier ce fichier ET la signature : un test
// unitaire, le rapport de non-régression et l'onglet « Régression » détectent toute dérive. Aucun outil, agent ou
// paramètre d'export n'accepte de couleur ou de police : le style n'est pas surchargeable.

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
};

export const DESIGN = deepFreeze({
  name: 'GOD 3D · BLUE ECOBANK',
  reference: 'Impayes_30-90j_plan_actions_2026-10-04.xlsx',
  /** Palette (hex sans #). */
  color: {
    navy: '001B4D',
    blue: '003DA5',
    gold: 'C8A951',
    cyan: '06B6D4',
    /** Fond des zones de graphiques / bandes. */
    ice: 'EAF1F5',
    /** Fond des étiquettes de cartes KPI. */
    panel: 'F5F9FF',
    /** Filets de tableaux. */
    line: 'DBE6F7',
    /** Cellule de saisie. */
    input: 'FFF4CC',
    text: '0F172A',
    text2: '334155',
    /** Texte clair sur bandeau bleu. */
    subtle: 'DDEEF5',
    white: 'FFFFFF',
    /** Ligne retrouvée par la recherche. */
    hit: 'D9F0C0',
    hitText: '1E5E12',
    risk: 'DC2626',
    warn: 'F59E0B',
    orange: 'F97316',
    orange2: 'E08A3C',
    sky: '7FC7E8',
    green: '16A34A',
  },
  font: { ui: 'Segoe UI', mono: 'Consolas' },
  /** Excel : tailles (pt), hauteurs de lignes (pt), vue. */
  xlsx: {
    titleSize: 20,
    subtitleSize: 9.5,
    summarySubtitleSize: 11,
    kpiLabelSize: 8.5,
    kpiValueSize: 16,
    headerSize: 10,
    bodySize: 10,
    rowHeight: { title: 40, subtitle: 18, kpiLabel: 24, kpiValue: 50, spacer: 8, header: 24 },
    zoom: 90,
    gridlines: false,
    numberFormat: {
      integer: '#,##0',
      decimal: '#,##0.00',
      percent: '0.00%',
      bigMoney: '[>=1000000000]#,##0.0,,," Md";#,##0,," M"',
      date: 'dd/mm/yyyy',
    },
    tabColor: {
      summary: 'C8A951',
      data: '06B6D4',
      consolidation: '001B4D',
      detail: '003DA5',
      plan: '16A34A',
    },
  },
  /** Couleurs de statuts (fond / texte), reprises des mises en forme conditionnelles du classeur. */
  status: {
    'Stage 1': { fill: 'C8A951', text: 'FFFFFF' },
    'Stage 2': { fill: 'F59E0B', text: 'FFFFFF' },
    'Stage 3': { fill: 'F97316', text: 'FFFFFF' },
    I: { fill: '06B6D4', text: 'FFFFFF' },
    IA: { fill: '7FC7E8', text: 'FFFFFF' },
    II: { fill: 'C8A951', text: 'FFFFFF' },
    III: { fill: 'F59E0B', text: 'FFFFFF' },
    IV: { fill: 'E08A3C', text: 'FFFFFF' },
    V: { fill: 'DC2626', text: 'FFFFFF' },
    Oui: { fill: 'F97316', text: 'FFFFFF' },
    COMMERCIAL: { fill: 'C7DBE4', text: '002E42' },
    CONSUMER: { fill: 'D1EBF6', text: '17526B' },
    CORPORATE: { fill: 'E6F2D5', text: '466320' },
    'N/A': { fill: 'FCEFD2', text: '795B19' },
  },
  /** Séries de graphiques, dans l'ordre. */
  chartSeries: ['003DA5', '06B6D4', 'C8A951', 'F59E0B', 'F97316', '7FC7E8', '2563EB', '16A34A'],
  /** Filet d'accent sous les bandeaux. */
  filet: { color: 'C8A951', mm: 0.8 },
});

export type Design = typeof DESIGN;

/** Signature de la charte : somme de contrôle (FNV-1a 32 bits) du JSON canonique. */
export function designSignature(d: unknown = DESIGN): string {
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v as object)
              .sort()
              .map((k) => [k, canon((v as Record<string, unknown>)[k])]),
          )
        : v;
  const s = JSON.stringify(canon(d));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Signature attendue. Ne se modifie qu'avec une décision explicite de changer la charte. */
export const DESIGN_LOCK = '32c65512';

export interface DesignCheck {
  intact: boolean;
  expected: string;
  actual: string;
  frozen: boolean;
}
export function designCheck(): DesignCheck {
  const actual = designSignature();
  return {
    intact: actual === DESIGN_LOCK,
    expected: DESIGN_LOCK,
    actual,
    frozen:
      Object.isFrozen(DESIGN) && Object.isFrozen(DESIGN.color) && Object.isFrozen(DESIGN.xlsx.rowHeight),
  };
}

/** Règles injectées dans les prompts des agents : le style est imposé, jamais négociable. */
export const DESIGN_RULES = `HOUSE EXPORT DESIGN — THE DEFAULT (used for every deliverable unless the user asks for another look; then pass theme / colors to report.export or data.export: corporate, modern, minimal, executive, warm, nature, or custom colours):
- Reference: the "Impayés 30-90j — plan d'actions" workbook. Palette: navy #${DESIGN.color.navy} (title bands), Ecobank blue #${DESIGN.color.blue} (subtitle bands, table headers, links), gold #${DESIGN.color.gold} (accent filet, subtitle on navy), cyan #${DESIGN.color.cyan}, ice #${DESIGN.color.ice} (backgrounds), KPI label panel #${DESIGN.color.panel}, table lines #${DESIGN.color.line}, text #${DESIGN.color.text} / #${DESIGN.color.text2}, input #${DESIGN.color.input}.
- Fonts: ${DESIGN.font.ui} for text, ${DESIGN.font.mono} for numbers and KPI values. Excel: no gridlines, zoom ${DESIGN.xlsx.zoom} %.
- Excel layout: row 1 navy title band (${DESIGN.xlsx.titleSize} pt bold white, ${DESIGN.xlsx.rowHeight.title} pt); row 2 blue subtitle band (${DESIGN.xlsx.subtitleSize} pt, #${DESIGN.color.subtle}); row 3 KPI labels (${DESIGN.xlsx.kpiLabelSize} pt bold, caps, on #${DESIGN.color.panel}); row 4 KPI values (${DESIGN.xlsx.kpiValueSize} pt bold navy ${DESIGN.font.mono}, white, centered, live SUBTOTAL formulas); table header blue #${DESIGN.color.blue} white bold centered; numbers ${DESIGN.font.mono} right-aligned "${DESIGN.xlsx.numberFormat.integer}" with thin #${DESIGN.color.line} borders; header row frozen, autofilter; tab colors gold (summary) / cyan (data) / navy (consolidation) / blue (detail).
- Statuses keep the reference colors (Stage 1 gold, Stage 2 amber, Stage 3 orange; I cyan, IA sky, II gold, III amber, IV orange, V red). Never a black or dark background.
- Word / PowerPoint / PDF / mail: navy band with a ${DESIGN.filet.mm} mm gold filet, blue headings, blue table headers with white bold text, ice quote blocks, same fonts.
- Amounts in XOF, integers with a space as thousands separator (2 359 078 494); dates dd/mm/yyyy. Every synthesis comes with a written reading (numbered findings) reused in the mail, Word and PowerPoint; the filtered scope is recalled in each export.
- Charts are NATIVE Excel charts in the house palette (data.export chart option: bar / line / pie; series colours #003DA5, #06B6D4, #C8A951…), never images and never matplotlib.
- report.export and data.export apply this design automatically (theme "house"); another theme only on the user's request. For files you generate yourself (code.run), reuse the same values (or the requested theme).`;

// ── THEMES (non-figés) ───────────────────────────────────────────────────────────────────────────────────────────────
// The house charter above stays the DEFAULT and stays locked (its signature protects it). Any export can now use another
// professional theme, or a custom one built from the user's request (primary / accent colour, font). Exporters read the
// ACTIVE design through activeDesign(); withTheme() / setActiveTheme() switch it for one export.
export type ThemeId = 'house' | 'corporate' | 'modern' | 'minimal' | 'executive' | 'warm' | 'nature';
export interface CustomTheme {
  primary?: string;
  accent?: string;
  dark?: string;
  font?: string;
}
type Col = Design['color'];
const P = (navy: string, blue: string, gold: string, cyan: string, ice: string, line: string, panel = 'F8FAFC'): Partial<Col> => ({
  navy,
  blue,
  gold,
  cyan,
  ice,
  line,
  panel,
  sky: cyan,
});
export const THEMES: Record<ThemeId, { label: string; color: Partial<Col>; font?: string }> = {
  house: { label: 'Maison — GOD 3D · BLUE ECOBANK', color: {} },
  corporate: { label: 'Corporate gris-bleu', color: P('1F2937', '334155', '0EA5E9', '64748B', 'F1F5F9', 'E2E8F0'), font: 'Calibri' },
  modern: { label: 'Moderne violet', color: P('1E1B4B', '4F46E5', 'F59E0B', '06B6D4', 'EEF2FF', 'E0E7FF', 'F5F7FF'), font: 'Segoe UI' },
  minimal: { label: 'Minimal noir & blanc', color: P('111111', '333333', '999999', '666666', 'F5F5F5', 'E5E5E5', 'FAFAFA'), font: 'Arial' },
  executive: { label: 'Exécutif bordeaux & or', color: P('3B0A16', '7F1D1D', 'C8A951', 'B45309', 'FBF5EF', 'EADBC8', 'FDF8F3'), font: 'Georgia' },
  warm: { label: 'Chaleureux orange', color: P('431407', 'C2410C', 'FACC15', 'FB923C', 'FFF7ED', 'FED7AA', 'FFFBF5'), font: 'Segoe UI' },
  nature: { label: 'Nature vert', color: P('052E16', '15803D', 'CA8A04', '0D9488', 'F0FDF4', 'BBF7D0', 'F7FEF9'), font: 'Segoe UI' },
};
const HEX = /^#?[0-9a-f]{6}$/i;
const clean = (h?: string) => (h && HEX.test(h) ? h.replace('#', '').toUpperCase() : undefined);
/** Darken a hex colour by a factor (0-1). */
const shade = (h: string, f: number) =>
  [0, 2, 4]
    .map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - f)).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
export function buildTheme(t: ThemeId | CustomTheme | undefined | null): Design {
  if (!t || t === 'house') return DESIGN;
  if (typeof t === 'string') {
    const th = THEMES[t] ?? THEMES.house;
    return {
      ...DESIGN,
      name: th.label,
      color: { ...DESIGN.color, ...th.color },
      font: { ...DESIGN.font, ui: th.font ?? DESIGN.font.ui },
      chartSeries: [th.color.blue ?? DESIGN.color.blue, th.color.cyan ?? DESIGN.color.cyan, th.color.gold ?? DESIGN.color.gold, ...DESIGN.chartSeries.slice(3)],
      filet: { ...DESIGN.filet, color: th.color.gold ?? DESIGN.filet.color },
    } as Design;
  }
  const primary = clean(t.primary) ?? DESIGN.color.blue;
  const accent = clean(t.accent) ?? DESIGN.color.gold;
  const dark = clean(t.dark) ?? shade(primary, 0.55);
  return {
    ...DESIGN,
    name: 'Thème personnalisé',
    color: { ...DESIGN.color, navy: dark, blue: primary, gold: accent, cyan: accent, sky: accent },
    font: { ...DESIGN.font, ui: (t.font ?? DESIGN.font.ui).replace(/[^\w \-]/g, '').slice(0, 40) || DESIGN.font.ui },
    chartSeries: [primary, accent, dark, ...DESIGN.chartSeries.slice(3)],
    filet: { ...DESIGN.filet, color: accent },
  } as Design;
}
let ACTIVE: Design = DESIGN;
export const activeDesign = (): Design => ACTIVE;
/** Switch the theme for the next export(s); returns the previous one (restore it in a finally). */
export function setActiveTheme(t: ThemeId | CustomTheme | Design | undefined | null): Design {
  const prev = ACTIVE;
  ACTIVE = t && typeof t === 'object' && 'xlsx' in t ? (t as Design) : buildTheme(t as ThemeId | CustomTheme);
  return prev;
}
export function withTheme<T>(t: ThemeId | CustomTheme | undefined | null, fn: () => T): T {
  const prev = setActiveTheme(t);
  try {
    return fn();
  } finally {
    setActiveTheme(prev);
  }
}
/** Read live colours of the active theme (used by the exporters instead of the frozen house values). */
export const liveColors = (): Col => ACTIVE.color;
export const liveColorProxy = <T extends object>(map: (c: Col, d: Design) => T): T =>
  new Proxy({} as T, { get: (_, k) => (map(ACTIVE.color, ACTIVE) as Record<string | symbol, unknown>)[k], set: () => false, defineProperty: () => false });

/** Theme requested in a tool call (theme id, or custom colours / font), else the user's default. */
export function themeOf(a: Record<string, unknown>, fallback?: string): ThemeId | CustomTheme {
  const c = (a.colors ?? {}) as Record<string, unknown>;
  const custom: CustomTheme = {
    primary: typeof c.primary === 'string' ? c.primary : undefined,
    accent: typeof c.accent === 'string' ? c.accent : undefined,
    dark: typeof c.dark === 'string' ? c.dark : undefined,
    font: typeof c.font === 'string' ? c.font : undefined,
  };
  if (a.theme === 'custom' || ((custom.primary || custom.accent || custom.font) && !a.theme)) return custom;
  const t = (typeof a.theme === 'string' ? a.theme : fallback) as ThemeId | undefined;
  return t && t in THEMES ? t : 'house';
}
export const THEME_PARAMS = {
  theme: {
    type: 'string',
    enum: ['house', 'corporate', 'modern', 'minimal', 'executive', 'warm', 'nature', 'custom'],
    description:
      'Visual theme. Default "house" (GOD 3D · BLUE ECOBANK). Use another one ONLY when the user asks for a different look; "custom" with colors.',
  },
  colors: {
    type: 'object',
    description: 'Custom theme (theme "custom"): primary, accent, dark as hex like "#7C3AED", and font.',
    properties: { primary: { type: 'string' }, accent: { type: 'string' }, dark: { type: 'string' }, font: { type: 'string' } },
  },
} as const;
