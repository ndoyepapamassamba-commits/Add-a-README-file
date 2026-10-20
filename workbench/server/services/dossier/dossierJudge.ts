// JEV IN EVERY DECISION OF THE DOSSIER — the typed judgments (TypeSafe System One: choice / score / noul) that decide
// what the pipeline would otherwise decide by rule: which dimensions deserve a chapter, the tone of each indicator,
// the priority of each recommendation, the figure that fits a series, whether the dossier is ready for the committee,
// and the quality of a prompt in the Prompt Studio. Pure: question builders and answer appliers; the caller makes the
// call (callJevQuestions) and keeps the rules when no key is configured or JEV is unreachable.
import type { JevQuestion } from '../../jev/provider';
import type { Brief } from '../reportBrief';
import type { Dossier, FigureKind, Tone } from './dossier';

type Answers = Record<string, { choice?: string; confidence?: number; score?: number; noul?: number }>;
const MIN_CONF = 0.55;

/** PLAN — which dimensions of the brief become chapters for this request. State: `request`, `dims[]`. */
export function planQuestions(b: Brief): Record<string, JevQuestion> {
  const q: Record<string, JevQuestion> = {};
  b.dims.slice(0, 8).forEach((d, i) => {
    q[`dim_${i}`] = {
      type: 'choice',
      instructions: 'For the `request`, does the dimension `dims[' + i + ']` (its label, its share explained η², its concentration) deserve a chapter of its own in the committee dossier?',
      criteria: { chapitre: 'it explains the measure or carries a decision: a chapter with findings, analysis and recommendations', mention: 'worth one line in another chapter, not a chapter', ignorer: 'noise or an identifier: leave it out' },
    };
  });
  q.lead = { type: 'choice', instructions: 'Which finding should open the dossier (the thesis) for this `request`, given `facts`?', criteria: { concentration: 'a few categories carry most of the measure', tendance: 'the last period moved sharply', anomalies: 'anomalies dominate', qualite: 'the data quality limits every reading', repartition: 'the distribution itself is the message' } };
  return q;
}
export function planState(b: Brief, request: string): Record<string, unknown> {
  return {
    request,
    dims: b.dims.slice(0, 8).map((d) => ({ label: d.label, categories: d.categories, top3Share: d.top3Share, eta2: d.eta2, n80: d.n80, top: d.top.slice(0, 3).map((t) => ({ key: t.key, share: t.share })) })),
    facts: { measure: b.measureLabel, rows: b.rows, trendDelta: b.trend?.delta ?? null, anomalies: b.anomalies.length, worstMissing: Math.max(0, ...b.quality.map((q) => q.missingPct)) },
  };
}
/** The dimensions JEV kept (by index), the rules otherwise (η² or concentration). */
export function chaptersFromPlan(b: Brief, a: Answers | null): number[] {
  const idx = b.dims.slice(0, 8).map((_, i) => i);
  if (a) {
    const kept = idx.filter((i) => (a[`dim_${i}`]?.choice ?? '') === 'chapitre' && (a[`dim_${i}`]?.confidence ?? 1) >= MIN_CONF);
    if (kept.length >= 2) return kept;
  }
  return idx.filter((i) => b.dims[i]!.dim !== b.entity && (b.dims[i]!.eta2 >= 0.1 || b.dims[i]!.top3Share >= 0.5)).slice(0, 5);
}

/** TONE of every indicator and PRIORITY of every recommendation, FIGURE kind of every figure. State: the dossier's items. */
export function dossierQuestions(d: Dossier): Record<string, JevQuestion> {
  const q: Record<string, JevQuestion> = {};
  d.kpis.forEach((k, i) => {
    q[`kpi_${i}`] = { type: 'choice', instructions: 'What tone does `kpis[' + i + ']` (label, value, sub, method) call for in a risk / performance committee?', criteria: { risk: 'a loss, a breach, a deterioration that calls for a decision', warn: 'a vigilance point, a threshold approached', ok: 'a good or improving figure', neutral: 'a descriptive figure (scope, count)', info: 'an operational reminder (deadline, count to process)' } };
  });
  let r = 0;
  d.chapters.forEach((c, ci) =>
    c.recommandations.forEach((_, ri) => {
      q[`reco_${ci}_${ri}`] = { type: 'choice', instructions: 'What priority should `recos[' + r++ + ']` (title, action, ground, the chapter\'s findings) get?', criteria: { P1: 'to engage within the month: a regulatory breach, an uncovered exposure, a deadline', P2: 'within the quarter: a process or policy change', P3: 'a programme or a nice-to-have' } };
    }),
  );
  let f = 0;
  d.chapters.forEach((c, ci) =>
    c.figures.forEach((_, fi) => {
      q[`fig_${ci}_${fi}`] = { type: 'choice', instructions: 'Which chart fits `figures[' + f++ + ']` (title, categories, number of series, unit)?', criteria: { col3d: 'compare a few categories (≤ 8) or series side by side', bar3d: 'rank many categories (> 6) or long labels', line: 'an evolution over periods', doughnut: 'a share of a whole, few categories' } };
    }),
  );
  q.ready = { type: 'score', instructions: 'Is this `dossier` (thesis, indicators, chapters, recommendations, decisions) ready to be presented to a committee?', criteria: ['not presentable: no thesis or no measured findings', 'thin: findings without analysis or without recommendations', 'presentable with reservations: some chapters lack a figure or a ground', 'committee-ready: every chapter has findings, analysis, figure and dated recommendations', 'reference quality: in addition, regulatory grounds, sources and decisions formulated for a vote'] };
  q.thesisDecisional = { type: 'noul', instructions: 'Does `dossier.thesis` state a measured finding AND the decision it calls for (not only a description)?' };
  return q;
}
export function dossierState(d: Dossier): Record<string, unknown> {
  return {
    dossier: { thesis: d.thesis, title: d.title, chapters: d.chapters.map((c) => ({ title: c.title, constats: c.constats.length, analyse: c.analyse.length, figures: c.figures.length, recos: c.recommandations.length, cadre: c.cadre.length })), decisions: d.decisions.length, sources: d.sources.length },
    kpis: d.kpis.map((k) => ({ label: k.label, value: k.value, sub: k.sub, method: k.method })),
    recos: d.chapters.flatMap((c) => c.recommandations.map((r) => ({ title: r.title, action: r.action.slice(0, 300), ground: r.ground, chapterFindings: c.constats.slice(0, 3) }))),
    figures: d.chapters.flatMap((c) => c.figures.map((f) => ({ title: f.title, categories: f.categories.length, series: f.series.length, unit: f.unit, kind: f.kind }))),
  };
}
export interface JudgeReport {
  tones: number;
  priorities: number;
  figures: number;
  ready?: { score: number; label: string; confidence: number };
  thesisDecisional?: number;
}
const READY_LABELS = ['non présentable', 'mince', 'présentable avec réserves', 'prêt pour le comité', 'qualité de référence'];
/** JEV's answers applied to the dossier (confident answers only); the report says what changed. */
export function applyJudgments(d: Dossier, a: Answers): JudgeReport {
  const rep: JudgeReport = { tones: 0, priorities: 0, figures: 0 };
  const TONES: Tone[] = ['risk', 'warn', 'ok', 'neutral', 'info'];
  d.kpis.forEach((k, i) => {
    const x = a[`kpi_${i}`];
    if (x?.choice && TONES.includes(x.choice as Tone) && (x.confidence ?? 0) >= MIN_CONF && k.tone !== x.choice) {
      k.tone = x.choice as Tone;
      rep.tones++;
    }
  });
  d.chapters.forEach((c, ci) =>
    c.recommandations.forEach((r, ri) => {
      const x = a[`reco_${ci}_${ri}`];
      if (x?.choice && /^P[123]$/.test(x.choice) && (x.confidence ?? 0) >= MIN_CONF && r.priority !== x.choice) {
        r.priority = x.choice as 'P1' | 'P2' | 'P3';
        rep.priorities++;
      }
    }),
  );
  const KINDS: FigureKind[] = ['col3d', 'bar3d', 'line', 'doughnut'];
  d.chapters.forEach((c, ci) =>
    c.figures.forEach((f, fi) => {
      const x = a[`fig_${ci}_${fi}`];
      // A line needs ordered periods; a doughnut needs one series: the rule guards what JEV proposes.
      if (x?.choice && KINDS.includes(x.choice as FigureKind) && (x.confidence ?? 0) >= MIN_CONF && f.kind !== x.choice && !(x.choice === 'doughnut' && f.series.length > 1)) {
        f.kind = x.choice as FigureKind;
        rep.figures++;
      }
    }),
  );
  if (a.ready && typeof a.ready.score === 'number') rep.ready = { score: a.ready.score, label: READY_LABELS[Math.max(0, Math.min(4, Math.round(a.ready.score)))]!, confidence: a.ready.confidence ?? 0 };
  if (a.thesisDecisional && typeof a.thesisDecisional.noul === 'number') rep.thesisDecisional = a.thesisDecisional.noul;
  return rep;
}

/** PROMPT STUDIO — the quality of a prompt before it runs. State: `prompt` (the compiled text), `goal`. */
export function promptQuestions(): Record<string, JevQuestion> {
  return {
    clarity: { type: 'score', instructions: 'How clear is `prompt` about the expected outcome?', criteria: ['no identifiable outcome', 'a vague wish', 'a clear outcome but an open format', 'a clear outcome with its format', 'outcome, format, success criteria and constraints all explicit'] },
    completeness: { type: 'score', instructions: 'Does `prompt` give the model what it needs (role, data or context, deliverable, constraints, depth)?', criteria: ['almost nothing', 'one or two of the five', 'three of the five', 'four of the five', 'all five, with examples or figures'] },
    inventionRisk: { type: 'noul', instructions: 'Does `prompt` let the model invent figures or facts (no data provided, no rule against invention)?' },
    secretRisk: { type: 'noul', instructions: 'Does `prompt` contain something that looks like a secret, a key, a password or personal data that should not be sent?' },
    bestLever: { type: 'choice', instructions: 'What single change would most improve `prompt` for its `goal`?', criteria: { data: 'attach or describe the data and figures', format: 'specify the deliverable and its structure', constraints: 'add the non-negotiable rules (no invention, language, formats)', role: 'give the model a precise role and audience', depth: 'ask for depth: hypotheses, sources, recommendations with owners', nothing: 'it is ready' } },
  };
}
