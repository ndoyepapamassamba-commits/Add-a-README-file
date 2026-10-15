// LE DOSSIER — the one structured object behind every committee-grade deliverable (deck, report, workbook, printable
// page, mail). Its grammar is the one read on the owner's reference deliverables (ECOBANK Covenant & Trigger
// Intelligence, 30/09/2026): a thesis, ten indicators carried identically by every file, key messages, a method,
// chapters that each hold the measured findings, the written analysis, the regulatory / research frame, the emblematic
// cases, the figures with their reading, the recommendations (reference, priority, owner, deadline, indicator), the
// decisions put to the vote, the register of hypotheses, the data quality, the glossary and the bibliography.
// Pure: no DOM, no network, no store. The renderers (dossierPptx / dossierDocx / dossierXlsx / dossierHtml) read it;
// the model writes it (dossierCompose) under the depth rules checked here (checkDepth).

export type Tone = 'risk' | 'warn' | 'ok' | 'neutral' | 'info';

export interface Kpi {
  /** « K01 » … « K10 ». */
  code: string;
  label: string;
  /** Formatted value (« 104,9 Mds », « 42,0 % », « 274 »). */
  value: string;
  /** One line under the value (scope, comparison). */
  sub?: string;
  tone?: Tone;
  /** How the figure was computed (never a guess). */
  method?: string;
  /** Numeric value when known (checks, charts). */
  num?: number;
}

export type FigureKind = 'col3d' | 'bar3d' | 'col' | 'bar' | 'doughnut' | 'pie' | 'line';
export interface Figure {
  kind: FigureKind;
  title: string;
  categories: string[];
  series: { name: string; values: number[] }[];
  /** « Lecture — … » under the figure. */
  lecture?: string;
  /** Excel number format of the labels (chosen from the magnitude when omitted). */
  fmt?: string;
  /** Unit shown in the title or axis (« Mds XOF », « % »). */
  unit?: string;
}

export interface Reco {
  /** « R-01 ». */
  ref: string;
  priority: 'P1' | 'P2' | 'P3';
  title: string;
  action: string;
  owner: string;
  due: string;
  /** The indicator that proves it is done. */
  kpi: string;
  /** Axis / family (chapter name by default). */
  axis?: string;
  /** Regulatory or research ground (« AUS OHADA art. 97 [R5-02] »). */
  ground?: string;
}

export interface Table {
  title?: string;
  head: string[];
  rows: string[][];
  lecture?: string;
}

export interface Chapter {
  n: number;
  title: string;
  /** Small caps line above the title (« CHAPITRE 3 · ASSURANCES »). */
  kicker?: string;
  /** Action title of the slide (the conclusion first). */
  headline?: string;
  constats: string[];
  analyse: string[];
  cadre: string[];
  cas: string[];
  figures: Figure[];
  tables: Table[];
  recommandations: Reco[];
  lecture?: string;
  /** Indicators proper to the chapter (slide tiles). */
  kpis?: Kpi[];
}

export interface Decision {
  code: string;
  text: string;
}
export interface Hypothesis {
  code: string;
  title: string;
  text: string;
  /** Parameter name when the hypothesis is a tunable figure. */
  param?: string;
}
export interface Source {
  /** « R1-01 »: axis R1 … R9, then the number. */
  id: string;
  title: string;
  author?: string;
  date?: string;
  url?: string;
  lesson: string;
  application?: string;
  axis?: string;
}
export interface MethodStep {
  n: number;
  label: string;
  detail?: string;
}

export interface Dossier {
  title: string;
  /** Line under the title (what the dossier says). */
  subtitle?: string;
  /** Small caps above the title (« COMITÉ WATCHLIST · ARRÊTÉ DU 30/09/2026 »). */
  kicker?: string;
  org?: string;
  unit?: string;
  author?: string;
  audience?: string;
  /** jj/mm/aaaa. */
  date: string;
  /** Cut-off / reference date of the figures. */
  asOf?: string;
  confidentiality?: string;
  dataSource?: string;
  thesis: string;
  kpis: Kpi[];
  messages: string[];
  method?: { steps: MethodStep[]; rules: string[]; research?: string[] };
  chapters: Chapter[];
  decisions: Decision[];
  hypotheses: Hypothesis[];
  dataQuality?: { score?: number; items: { item: string; note: string; score?: number }[] };
  glossary: { term: string; def: string }[];
  sources: Source[];
  /** Speaker notes timing of the deck (minutes). */
  minutes?: number;
  /** Where the figures come from (the brief, the model, the rules). */
  provenance?: string;
  /** The data file behind the dossier: the workbook's selectors, live indicators and top 10 are computed on it. */
  data?: { path: string; sheet?: string; measure?: string; entity?: string; selectors?: string[] };
}

// ── French formatting ─────────────────────────────────────────────────────────
const NBSP = '\u202f';
export const fmtInt = (n: number): string => Math.round(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ');
export const fmtDec = (n: number, d = 1): string => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[\u202f\u00a0]/g, ' ');
export const fmtPct = (x: number, d = 1): string => `${fmtDec(x * 100, d)}${NBSP}%`;
/** Money in the house manner: 1 234 → « 1 234 », 1,8e9 → « 1,8 Mds », 4,69e8 → « 469 M ». */
export function fmtMoney(n: number, unit = ''): string {
  const a = Math.abs(n);
  const s = a >= 1e9 ? `${fmtDec(n / 1e9, 1)} Mds` : a >= 1e6 ? `${fmtDec(n / 1e6, a >= 1e8 ? 0 : 1)} M` : a >= 1e4 ? `${fmtInt(n / 1e3)} k` : fmtInt(n);
  return unit ? `${s} ${unit}` : s;
}
export const todayFr = (d = new Date()): string => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

// ── Normalisation: whatever the model (or a markdown adapter) hands over becomes a complete, numbered dossier ──
const str = (v: unknown, max = 4000): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, max);
const arr = <T>(v: unknown, f: (x: unknown, i: number) => T | null, max = 60): T[] => (Array.isArray(v) ? v.map((x, i) => f(x, i)).filter((x): x is T => x !== null).slice(0, max) : []);
// A single text where a list is expected (« findings": "…" ») is a one-item list.
const strs = (v: unknown, max = 40): string[] => arr(typeof v === 'string' && v.trim() ? [v] : v, (x) => (str(x) ? str(x) : null), max);
/** The first key present (French, English and the usual model variants of the same field). */
const pick = (o: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
};
const num = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const x = Number(v.replace(/[\s\u202f]/g, '').replace(',', '.'));
    return Number.isFinite(x) ? x : undefined;
  }
  return undefined;
};
const TONES: Tone[] = ['risk', 'warn', 'ok', 'neutral', 'info'];
const KINDS: FigureKind[] = ['col3d', 'bar3d', 'col', 'bar', 'doughnut', 'pie', 'line'];

export function normalizeKpi(x: unknown, i: number): Kpi | null {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const label = str(pick(o, 'label', 'name', 'title', 'libelle', 'indicator', 'indicateur', 'kpi'), 80);
  if (!label) return null;
  const n = num(o.num ?? o.value);
  return {
    code: str(o.code, 8) || `K${String(i + 1).padStart(2, '0')}`,
    label,
    value: str(o.value, 40) || (n !== undefined ? fmtMoney(n) : '—'),
    sub: str(pick(o, 'sub', 'note', 'comment', 'commentaire', 'context', 'detail'), 120) || undefined,
    tone: TONES.includes(o.tone as Tone) ? (o.tone as Tone) : undefined,
    method: str(pick(o, 'method', 'methode', 'formula', 'formule', 'source'), 300) || undefined,
    num: n,
  };
}
export function normalizeFigure(x: unknown): Figure | null {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const categories = strs(o.categories, 40);
  let series = arr(
    o.series,
    (s) => {
      const so = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
      const values = arr(so.values, (v) => num(v) ?? null, 40);
      return values.length ? { name: str(so.name, 60) || 'Valeur', values } : null;
    },
    6,
  );
  if (!series.length && Array.isArray(o.values)) series = [{ name: str(o.name, 60) || 'Valeur', values: arr(o.values, (v) => num(v) ?? null, 40) }];
  if (!categories.length || !series.length) return null;
  const n = Math.min(categories.length, ...series.map((s) => s.values.length));
  if (n < 1) return null;
  return {
    kind: KINDS.includes(o.kind as FigureKind) ? (o.kind as FigureKind) : 'col3d',
    title: str(o.title, 120) || 'Figure',
    categories: categories.slice(0, n),
    series: series.map((s) => ({ name: s.name, values: s.values.slice(0, n) })),
    lecture: str(o.lecture, 400) || undefined,
    fmt: str(o.fmt, 40) || undefined,
    unit: str(o.unit, 20) || undefined,
  };
}
export function normalizeReco(x: unknown, i: number, axis?: string): Reco | null {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  if (typeof x === 'string' && x.trim()) return normalizeReco({ title: x }, i, axis);
  const title = str(pick(o, 'title', 'titre', 'recommendation', 'recommandation', 'text', 'action'), 160);
  if (!title) return null;
  const p = str(o.priority ?? o.priorite, 2).toUpperCase();
  return {
    ref: str(o.ref, 8) || `R-${String(i + 1).padStart(2, '0')}`,
    priority: p === 'P2' || p === 'P3' ? p : 'P1',
    title,
    action: str(pick(o, 'action', 'detail', 'description'), 1200) || title,
    owner: str(pick(o, 'owner', 'responsable', 'responsible', 'porteur', 'who'), 120) || 'À désigner',
    due: str(pick(o, 'due', 'echeance', 'échéance', 'deadline', 'when', 'date'), 40) || 'À fixer',
    kpi: str(pick(o, 'kpi', 'indicateur', 'indicator', 'metric', 'measure'), 200) || 'Indicateur à définir',
    axis: str(o.axis, 60) || axis,
    ground: str(o.ground, 300) || undefined,
  };
}
export function normalizeTable(x: unknown): Table | null {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const head = strs(o.head, 12);
  const rows = arr(o.rows, (r) => (Array.isArray(r) ? r.map((c) => str(c, 400)) : null), 60);
  if (!head.length || !rows.length) return null;
  return { title: str(o.title, 120) || undefined, head, rows, lecture: str(o.lecture, 400) || undefined };
}
export function normalizeChapter(x: unknown, i: number): Chapter | null {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const title = str(pick(o, 'title', 'titre', 'name', 'heading', 'nom'), 140);
  if (!title) return null;
  const n = i + 1;
  const recos = arr(pick(o, 'recommandations', 'recommendations', 'recos', 'actions', 'plan_action', 'action_plan'), (r, k) => normalizeReco(r, k, title), 12);
  return {
    n,
    title,
    kicker: str(o.kicker, 80) || `CHAPITRE ${n} · ${title.toUpperCase().slice(0, 48)}`,
    headline: str(o.headline, 160) || undefined,
    constats: strs(pick(o, 'constats', 'findings', 'key_findings', 'observations', 'facts', 'points'), 12),
    analyse: strs(pick(o, 'analyse', 'analysis', 'discussion', 'insights', 'body', 'content', 'text'), 12),
    cadre: strs(pick(o, 'cadre', 'frame', 'framework', 'regulation', 'reglementation'), 10),
    cas: strs(pick(o, 'cas', 'cases', 'examples', 'exemples'), 10),
    figures: arr(o.figures, normalizeFigure, 6),
    tables: arr(o.tables, normalizeTable, 4),
    recommandations: recos,
    lecture: str(o.lecture, 400) || undefined,
    kpis: arr(o.kpis, normalizeKpi, 5),
  };
}

/** Whatever the model handed over → a complete dossier: numbered, formatted, every list bounded. */
function dataRef(x: unknown): Dossier['data'] | undefined {
  const o = (x && typeof x === 'object' ? x : null) as Record<string, unknown> | null;
  const path = o ? str(o.path, 300) : '';
  if (!path) return undefined;
  return { path, sheet: str(o!.sheet, 80) || undefined, measure: str(o!.measure, 120) || undefined, entity: str(o!.entity, 120) || undefined, selectors: strs(o!.selectors, 4) };
}
export function normalizeDossier(raw: unknown, base: Partial<Dossier> = {}): Dossier {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const chapters = arr(pick(o, 'chapters', 'chapitres', 'sections', 'parts', 'parties'), normalizeChapter, 14);
  // Recommendations written at the TOP of the dossier (v62: « 0 recommandations » twice in the ESN chat) go to the
  // chapter they name (axis / chapter title), else to the last chapter, else to a « Plan d'action » chapter.
  const loose = arr(pick(o, 'recommandations', 'recommendations', 'recos', 'actions', 'action_plan', 'plan_action'), (x, k) => normalizeReco(x, k), 30);
  if (loose.length) {
    if (!chapters.length) chapters.push({ ...normalizeChapter({ title: "Plan d'action" }, 0)! });
    for (const rec of loose) {
      const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\W+/g, ' ').trim();
      const target = chapters.find((c) => rec.axis && fold(c.title) === fold(rec.axis)) ?? chapters[chapters.length - 1]!;
      if (target.recommandations.length < 12) target.recommandations.push({ ...rec, axis: rec.axis ?? target.title });
    }
  }
  // Recommendation references are unique across the dossier (R-01 … in reading order).
  let r = 0;
  for (const c of chapters) for (const rec of c.recommandations) rec.ref = `R-${String(++r).padStart(2, '0')}`;
  const kpis = arr(pick(o, 'kpis', 'indicators', 'indicateurs', 'metrics', 'key_figures', 'chiffres_cles'), normalizeKpi, 10).map((k, i) => ({ ...k, code: `K${String(i + 1).padStart(2, '0')}` }));
  const decisions = arr(pick(o, 'decisions', 'décisions', 'decisions_requested', 'asks', 'decisions_attendues'), (d, i) => {
    const text = typeof d === 'string' ? str(d, 400) : str(pick((d ?? {}) as Record<string, unknown>, 'text', 'decision', 'title', 'label'), 400);
    return text ? { code: `D${i + 1}`, text } : null;
  }, 9);
  const hypotheses = arr(o.hypotheses ?? o.hypotheses_register, (h, i) => {
    const ho = (h && typeof h === 'object' ? h : { text: h }) as Record<string, unknown>;
    const text = str(ho.text, 800);
    return text ? { code: `H${String(i + 1).padStart(2, '0')}`, title: str(ho.title, 80) || `Hypothèse ${i + 1}`, text, param: str(ho.param, 60) || undefined } : null;
  }, 30);
  const sources = arr(o.sources, (s, i) => {
    const so = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    const title = str(so.title, 200);
    if (!title) return null;
    const axis = str(so.axis, 4).toUpperCase().match(/^R\d$/) ? str(so.axis, 4).toUpperCase() : 'R1';
    return { id: str(so.id, 8) || `${axis}-${String(i + 1).padStart(2, '0')}`, title, author: str(so.author, 120) || undefined, date: str(so.date, 24) || undefined, url: str(so.url, 400) || undefined, lesson: str(so.lesson, 600) || '—', application: str(so.application, 600) || undefined, axis };
  }, 80);
  const dq = (o.dataQuality && typeof o.dataQuality === 'object' ? o.dataQuality : null) as Record<string, unknown> | null;
  const glossary = arr(o.glossary, (g) => {
    const go = (g && typeof g === 'object' ? g : {}) as Record<string, unknown>;
    return str(go.term) ? { term: str(go.term, 60), def: str(go.def, 400) } : null;
  }, 40);
  const method = (o.method && typeof o.method === 'object' ? o.method : null) as Record<string, unknown> | null;
  return {
    title: str(o.title, 140) || base.title || 'Dossier',
    subtitle: str(o.subtitle, 240) || base.subtitle,
    kicker: str(o.kicker, 90) || base.kicker,
    org: str(o.org, 80) || base.org,
    unit: str(o.unit, 120) || base.unit,
    author: str(o.author, 120) || base.author,
    audience: str(o.audience, 200) || base.audience,
    date: str(o.date, 10) || base.date || todayFr(),
    asOf: str(o.asOf, 10) || base.asOf,
    confidentiality: str(o.confidentiality, 80) || base.confidentiality,
    dataSource: str(o.dataSource, 240) || base.dataSource,
    thesis: str(pick(o, 'thesis', 'these', 'thèse', 'summary', 'executive_summary', 'synthese', 'synthèse'), 1500) || base.thesis || '',
    kpis,
    messages: strs(pick(o, 'messages', 'key_messages', 'messages_cles', 'highlights', 'takeaways'), 10),
    method: method
      ? {
          steps: arr(method.steps, (s, i) => {
            const so = (s && typeof s === 'object' ? s : { label: s }) as Record<string, unknown>;
            return str(so.label) ? { n: i + 1, label: str(so.label, 60), detail: str(so.detail, 200) || undefined } : null;
          }, 7),
          rules: strs(method.rules, 8),
          research: strs(method.research, 6),
        }
      : base.method,
    chapters,
    decisions,
    hypotheses,
    dataQuality: dq ? { score: num(dq.score), items: arr(dq.items, (it) => { const io = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>; return str(io.item) ? { item: str(io.item, 80), note: str(io.note, 300), score: num(io.score) } : null; }, 20) } : base.dataQuality,
    glossary,
    sources,
    minutes: num(o.minutes) ?? base.minutes,
    provenance: str(o.provenance, 200) || base.provenance,
    data: dataRef(o.data) ?? base.data,
  };
}

// ── Depth: a committee dossier is never thin. The rules are code, the verdict is shown, never silently repaired ──
export interface DepthIssue {
  where: string;
  issue: string;
}
export const DEPTH = { chapters: 3, kpis: 6, messages: 5, recos: 6, constatsPerChapter: 2, hypotheses: 5, sources: 4, decisions: 3, glossary: 6 } as const;
export function checkDepth(d: Dossier): DepthIssue[] {
  const out: DepthIssue[] = [];
  if (!d.thesis || d.thesis.length < 120) out.push({ where: 'thèse', issue: 'une thèse d’au moins deux phrases (le chiffre qui change la lecture, puis la décision qu’il appelle)' });
  if (d.kpis.length < DEPTH.kpis) out.push({ where: 'indicateurs', issue: `${DEPTH.kpis} indicateurs au moins (${d.kpis.length} fournis), les mêmes dans tous les livrables` });
  if (d.messages.length < DEPTH.messages) out.push({ where: 'messages clés', issue: `${DEPTH.messages} messages chiffrés au moins (${d.messages.length})` });
  if (d.chapters.length < DEPTH.chapters) out.push({ where: 'chapitres', issue: `${DEPTH.chapters} chapitres au moins (${d.chapters.length})` });
  d.chapters.forEach((c) => {
    if (c.constats.length < DEPTH.constatsPerChapter) out.push({ where: `chapitre ${c.n}`, issue: 'au moins deux constats chiffrés' });
    if (!c.analyse.length) out.push({ where: `chapitre ${c.n}`, issue: 'une analyse rédigée (pourquoi, et alors)' });
    if (!c.figures.length && !c.tables.length) out.push({ where: `chapitre ${c.n}`, issue: 'une figure ou un tableau' });
    if (!c.recommandations.length) out.push({ where: `chapitre ${c.n}`, issue: 'au moins une recommandation (responsable, échéance, indicateur)' });
  });
  const recos = d.chapters.reduce((a, c) => a + c.recommandations.length, 0);
  if (recos < DEPTH.recos) out.push({ where: 'recommandations', issue: `${DEPTH.recos} recommandations au moins (${recos})` });
  if (d.hypotheses.length < DEPTH.hypotheses) out.push({ where: 'hypothèses', issue: `${DEPTH.hypotheses} hypothèses motivées au moins (${d.hypotheses.length})` });
  if (d.sources.length < DEPTH.sources) out.push({ where: 'sources', issue: `${DEPTH.sources} sources au moins, avec leur enseignement (${d.sources.length})` });
  if (d.decisions.length < DEPTH.decisions) out.push({ where: 'décisions', issue: `${DEPTH.decisions} décisions soumises au moins (${d.decisions.length})` });
  if (d.glossary.length < DEPTH.glossary) out.push({ where: 'glossaire', issue: `${DEPTH.glossary} termes au moins (${d.glossary.length})` });
  return out;
}

/** Every recommendation of the dossier, in reading order. */
export const allRecos = (d: Dossier): Reco[] => d.chapters.flatMap((c) => c.recommandations);
/** Every figure with its chapter. */
export const allFigures = (d: Dossier): { chapter: Chapter; figure: Figure; n: number }[] => {
  let n = 0;
  return d.chapters.flatMap((chapter) => chapter.figures.map((figure) => ({ chapter, figure, n: ++n })));
};
/** Numbers written in the dossier (for the brief check): every figure that looks like a number in the texts. */
export function dossierNumbers(d: Dossier): string[] {
  const texts = [d.thesis, ...d.messages, ...d.chapters.flatMap((c) => [...c.constats, ...c.analyse, c.lecture ?? '', ...c.figures.map((f) => f.lecture ?? '')])];
  const out: string[] = [];
  for (const t of texts) for (const m of t.matchAll(/\d[\d\s\u202f]*(?:[.,]\d+)?/g)) out.push(m[0].replace(/[\s\u202f]/g, ''));
  return out;
}
