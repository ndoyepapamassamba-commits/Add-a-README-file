import type { Accounting, ExperimentMeta } from './science';
import type { CognitiveConfig, DataClass, FabricTag } from './fabric/types';
import type { ApprenticeTag } from './apprentice/types';

// JEV telemetry: JEV_LOG entries (one per mission), measured KPIs and the
// WITHOUT JEV vs WITH JEV comparison. Only measured values are reported; an
// estimate is always labelled as such.
export interface Checkpoint {
  name:
    | 'JEV_PRE'
    | 'JEV_ROUTE'
    | 'JEV_CONTEXT'
    | 'JEV_TOOLS'
    | 'JEV_EXECUTION'
    | 'JEV_CHECKPOINT'
    | 'JEV_MODEL_SWITCH'
    | 'JEV_QA'
    | 'JEV_CORRECTION'
    | 'JEV_ESCALATION'
    | 'JEV_POST'
    | 'JEV_LEARNING'
    | 'STATISTICAL_EVALUATION'
    | 'CHAMPION_DECISION'
    | 'MEMORY_UPDATE'
    | 'PRODUCTION_CLASSIFICATION'
    | 'CAPABILITY_DISCOVERY'
    | 'MODEL_SELECTION'
    | 'PROMPT_COMPILATION'
    | 'ASSET_RETRIEVAL'
    | 'GENERATION'
    | 'QA'
    | 'CORRECTION'
    | 'FALLBACK'
    | 'FINALIZATION';
  ms: number;
  tokens: number;
  cost: number;
  decision: string;
}
export interface JevLogEntry {
  id: string;
  at: number;
  session: string;
  mission: string;
  task: string;
  mode: string;
  /** JEV enabled for this run (false = baseline run, for A/B). */
  jev: boolean;
  level: number;
  decisionBy: 'JEV-0' | 'JEV-1' | 'JEV-2' | 'cache' | 'direct';
  model: string;
  reason: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  /** Cost of remote JEV calls (JEV-1 / JEV-2). */
  jevCost: number;
  latencyMs: number;
  /** Time spent deciding (JEV-0 + JEV-1/2), ms. */
  decisionMs: number;
  calls: number;
  quality: number | null;
  success: boolean | null;
  retries: number;
  escalations: number;
  corrections: number;
  cacheHits: number;
  toolsOffered: number;
  toolsBaseline: number;
  /** Tool-definition tokens per call, with / without the pack (from the real serialized definitions). */
  toolTokens: number;
  toolTokensBaseline: number;
  contextBefore: number;
  contextAfter: number;
  checkpoints: Checkpoint[];
  /** Benchmark category when the run is part of an A/B benchmark. */
  bench?: string;
  /** Benchmark 2.0 variant: off (WITHOUT JEV) / pre / live (PRE + LIVE) / full. */
  variant?: 'off' | 'pre' | 'live' | 'full';
  /** Benchmark repetition index. */
  rep?: number;
  /** Measured waste (tokens paid for that brought nothing) and its share of the run. */
  wasted?: number;
  wasteRate?: number | null;
  /** Live control: decisions taken, model switches, tokens avoided, JEV overhead. */
  liveDecisions?: number;
  modelSwitches?: number;
  liveSavedTokens?: number;
  overheadPct?: number | null;
  promptWaste?: number;
  /** User feedback (👍 / 👎 or « parfait » / « c'est mauvais »). */
  feedback?: 'good' | 'bad';
  /** Scientific validation: separate ledgers of the run (LLM / JEV / correction / tools) and per-call records. */
  acct?: Accounting;
  /** Paired-experiment metadata (group id, controlled variables). Absent = observational run. */
  experiment?: ExperimentMeta;
  /** Quality measured by the same deterministic scorer in EVERY variant (null = not measured). */
  qualityMeasured?: number | null;
  qualityVector?: Record<string, number>;
  /** How the quality was obtained. */
  qualitySource?: 'local-qa' | 'local-qa+ground-truth';
  /** ECONOMIC_DRIFT events detected during the run, and why the run stopped. */
  driftEvents?: string[];
  stopReason?: string;
  /** Adaptive policy applied to this run (empty = none). */
  policy?: string;
  // ── Cognitive Fabric (additive; absent on older entries) ──
  /** Tools actually used, in order of first use; and the tool-call / tool-error counts. */
  toolsUsed?: string[];
  toolCallCount?: number;
  toolErrorCount?: number;
  /** Last tool errors (redacted, truncated). */
  toolErrors?: string[];
  skillsUsed?: string[];
  /** The cognitive configuration of the run (model + skills + capabilities + strategy…). */
  config?: CognitiveConfig;
  classification?: DataClass;
  /** Redacted instruction and answer, kept only when example capture is on (or for benchmarks). */
  instruction?: string;
  answer?: string;
  /** Why the run failed (redacted error message), when known. */
  failureNote?: string;
  /** Fabric experiment tag (tournament / council / skill test / cognitive benchmark…). */
  fabric?: FabricTag;
  /** JEV Apprentice (free-first) record of the mission; absent when the Apprentice did not take part. */
  apprentice?: ApprenticeTag;
  /** AI Visual Studio production record (media job); absent on every other entry. */
  studio?: import('./studio/types').StudioTag;
}

export interface Kpi {
  missions: number;
  tokensPerMission: number | null;
  costPerMission: number | null;
  costPerSuccess: number | null;
  successRate: number | null;
  qualityAvg: number | null;
  retryRate: number | null;
  escalationRate: number | null;
  latencyAvg: number | null;
  cacheHitRate: number | null;
  /** Tool-definition tokens avoided by the tool pack (estimated from the definitions really sent). */
  toolTokensSaved: number;
  contextCompression: number | null;
  jevCost: number;
  decisionMsAvg: number | null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function kpi(entries: JevLogEntry[]): Kpi {
  const n = entries.length;
  const ok = entries.filter((e) => e.success === true);
  const judged = entries.filter((e) => e.success !== null);
  const cost = entries.reduce((s, e) => s + e.cost + e.jevCost, 0);
  const ctx = entries.filter((e) => e.contextBefore > 0);
  return {
    missions: n,
    tokensPerMission: avg(entries.map((e) => e.tokensIn + e.tokensOut)),
    costPerMission: n ? cost / n : null,
    costPerSuccess: ok.length ? cost / ok.length : null,
    successRate: judged.length ? ok.length / judged.length : null,
    qualityAvg: avg(entries.filter((e) => e.quality !== null).map((e) => e.quality!)),
    retryRate: n ? entries.filter((e) => e.retries > 0).length / n : null,
    escalationRate: n ? entries.filter((e) => e.escalations > 0).length / n : null,
    latencyAvg: avg(entries.map((e) => e.latencyMs)),
    cacheHitRate: n ? entries.filter((e) => e.cacheHits > 0).length / n : null,
    toolTokensSaved: entries.reduce(
      (s, e) => s + Math.max(0, e.toolTokensBaseline - e.toolTokens) * e.calls,
      0,
    ),
    contextCompression: ctx.length ? avg(ctx.map((e) => 1 - e.contextAfter / e.contextBefore)) : null,
    jevCost: entries.reduce((s, e) => s + e.jevCost, 0),
    decisionMsAvg: avg(entries.map((e) => e.decisionMs)),
  };
}

export interface Comparison {
  metric: string;
  without: number | null;
  with: number | null;
  /** Relative change (with − without) / without; negative = reduction. */
  change: number | null;
  better: 'lower' | 'higher';
}
/** WITHOUT JEV vs WITH JEV on the same benchmark missions (measured runs only). */
export function compare(baseline: JevLogEntry[], jev: JevLogEntry[]): Comparison[] {
  const a = kpi(baseline);
  const b = kpi(jev);
  const row = (
    metric: string,
    x: number | null,
    y: number | null,
    better: 'lower' | 'higher',
  ): Comparison => ({
    metric,
    without: x,
    with: y,
    change: x !== null && y !== null && x !== 0 ? (y - x) / Math.abs(x) : null,
    better,
  });
  return [
    row('Tokens / mission', a.tokensPerMission, b.tokensPerMission, 'lower'),
    row('Coût / mission ($)', a.costPerMission, b.costPerMission, 'lower'),
    row('Coût / mission réussie ($)', a.costPerSuccess, b.costPerSuccess, 'lower'),
    row('Latence moyenne (ms)', a.latencyAvg, b.latencyAvg, 'lower'),
    row('Taux de réussite', a.successRate, b.successRate, 'higher'),
    row('Qualité moyenne', a.qualityAvg, b.qualityAvg, 'higher'),
    row('Taux de retry', a.retryRate, b.retryRate, 'lower'),
    row('Taux d’escalade', a.escalationRate, b.escalationRate, 'lower'),
  ];
}

export function toCsv(entries: JevLogEntry[]): string {
  const cols: (keyof JevLogEntry)[] = [
    'at',
    'session',
    'mission',
    'task',
    'mode',
    'jev',
    'level',
    'decisionBy',
    'model',
    'reason',
    'tokensIn',
    'tokensOut',
    'cost',
    'jevCost',
    'latencyMs',
    'decisionMs',
    'calls',
    'quality',
    'success',
    'retries',
    'escalations',
    'corrections',
    'cacheHits',
    'toolsOffered',
    'toolsBaseline',
    'toolTokens',
    'toolTokensBaseline',
    'contextBefore',
    'contextAfter',
    'bench',
    'variant',
    'rep',
    'wasted',
    'wasteRate',
    'liveDecisions',
    'modelSwitches',
    'liveSavedTokens',
    'overheadPct',
    'promptWaste',
    'feedback',
  ];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [
    cols.join(';'),
    ...entries.map((e) => cols.map((c) => esc(c === 'at' ? new Date(e.at).toISOString() : e[c])).join(';')),
  ].join('\n');
}

/** Model performance profile learnt from the JEV log (real runs only). */
export interface ModelProfile {
  model: string;
  runs: number;
  successRate: number | null;
  quality: number | null;
  avgTokens: number;
  avgCost: number;
  avgLatencyMs: number;
  retryRate: number;
  strengths: string[];
  weaknesses: string[];
}
export function modelProfiles(entries: JevLogEntry[]): ModelProfile[] {
  const by = new Map<string, JevLogEntry[]>();
  for (const e of entries) if (e.model) by.set(e.model, [...(by.get(e.model) ?? []), e]);
  return [...by.entries()].map(([model, es]) => {
    const perTask = new Map<string, { ok: number; n: number }>();
    for (const e of es) {
      const t = perTask.get(e.task) ?? { ok: 0, n: 0 };
      t.n++;
      if (e.success) t.ok++;
      perTask.set(e.task, t);
    }
    const judged = es.filter((e) => e.success !== null);
    return {
      model,
      runs: es.length,
      successRate: judged.length ? judged.filter((e) => e.success).length / judged.length : null,
      quality: avg(es.filter((e) => e.quality !== null).map((e) => e.quality!)),
      avgTokens: avg(es.map((e) => e.tokensIn + e.tokensOut)) ?? 0,
      avgCost: avg(es.map((e) => e.cost)) ?? 0,
      avgLatencyMs: avg(es.map((e) => e.latencyMs)) ?? 0,
      retryRate: es.filter((e) => e.retries > 0).length / es.length,
      strengths: [...perTask].filter(([, v]) => v.n >= 1 && v.ok / v.n >= 0.8).map(([k]) => k),
      weaknesses: [...perTask].filter(([, v]) => v.n >= 2 && v.ok / v.n < 0.5).map(([k]) => k),
    };
  });
}

// ── Benchmark 2.0: variants, repetitions, distributions ──
export type Variant = 'off' | 'pre' | 'live' | 'full';
export const variantOf = (e: JevLogEntry): Variant => e.variant ?? (e.jev ? 'full' : 'off');

export interface Dist {
  n: number;
  mean: number | null;
  median: number | null;
  p95: number | null;
}
export function dist(xs: number[]): Dist {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0, mean: null, median: null, p95: null };
  const q = (p: number) => {
    const i = (v.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return v[lo]! + (v[hi]! - v[lo]!) * (i - lo);
  };
  return { n: v.length, mean: v.reduce((a, b) => a + b, 0) / v.length, median: q(0.5), p95: q(0.95) };
}

export interface VariantStats {
  variant: Variant;
  runs: number;
  tokens: Dist;
  cost: Dist;
  latency: Dist;
  quality: Dist;
  waste: Dist;
  successRate: number | null;
  costPerSuccess: number | null;
  /** Quality points per dollar / per 1k tokens; successes per dollar / per 1k tokens. */
  qualityPerUsd: number | null;
  qualityPer1kTokens: number | null;
  successPerUsd: number | null;
  successPer1kTokens: number | null;
  jevCost: number;
  /** JEV cost / LLM cost (measured). */
  overheadPct: number | null;
  liveDecisions: number;
  modelSwitches: number;
}

export function variantStats(entries: JevLogEntry[], variant: Variant): VariantStats {
  const es = entries.filter((e) => variantOf(e) === variant);
  const tok = es.map((e) => e.tokensIn + e.tokensOut);
  const cost = es.map((e) => e.cost + e.jevCost);
  const judged = es.filter((e) => e.success !== null);
  const ok = judged.filter((e) => e.success).length;
  const totalCost = cost.reduce((a, b) => a + b, 0);
  const totalTok = tok.reduce((a, b) => a + b, 0);
  const q = es.filter((e) => e.quality !== null).map((e) => e.quality!);
  const qSum = q.reduce((a, b) => a + b, 0);
  const llm = es.reduce((a, e) => a + e.cost, 0);
  const jevCost = es.reduce((a, e) => a + e.jevCost, 0);
  return {
    variant,
    runs: es.length,
    tokens: dist(tok),
    cost: dist(cost),
    latency: dist(es.map((e) => e.latencyMs)),
    quality: dist(q),
    waste: dist(es.filter((e) => e.wasted !== undefined).map((e) => e.wasted!)),
    successRate: judged.length ? ok / judged.length : null,
    costPerSuccess: ok ? totalCost / ok : null,
    qualityPerUsd: totalCost > 0 && q.length ? qSum / totalCost : null,
    qualityPer1kTokens: totalTok > 0 && q.length ? qSum / (totalTok / 1000) : null,
    successPerUsd: totalCost > 0 && judged.length ? ok / totalCost : null,
    successPer1kTokens: totalTok > 0 && judged.length ? ok / (totalTok / 1000) : null,
    jevCost,
    overheadPct: llm > 0 ? jevCost / llm : null,
    liveDecisions: es.reduce((a, e) => a + (e.liveDecisions ?? 0), 0),
    modelSwitches: es.reduce((a, e) => a + (e.modelSwitches ?? 0), 0),
  };
}

/** Δ of a value vs the WITHOUT JEV baseline (negative = reduction). */
export const delta = (base: number | null | undefined, x: number | null | undefined): number | null =>
  base === null || base === undefined || x === null || x === undefined || base === 0
    ? null
    : (x - base) / Math.abs(base);

/**
 * Savings report of a variant vs the baseline on the same benchmark (means):
 * MEASURED SAVINGS (tokens, cost) and AVOIDABLE WASTE REDUCTION.
 */
export function savingsVs(base: VariantStats, v: VariantStats) {
  const tokenSavings = delta(base.tokens.mean, v.tokens.mean);
  const costSavings = delta(base.cost.mean, v.cost.mean);
  const wasteReduction =
    base.waste.mean !== null && v.waste.mean !== null && base.waste.mean > 0
      ? 1 - v.waste.mean / base.waste.mean
      : null;
  return {
    tokenSavings: tokenSavings === null ? null : -tokenSavings,
    costSavings: costSavings === null ? null : -costSavings,
    wasteReduction,
    latencyDelta: delta(base.latency.mean, v.latency.mean),
    qualityDelta: delta(base.quality.mean, v.quality.mean),
    successDelta:
      base.successRate !== null && v.successRate !== null ? v.successRate - base.successRate : null,
    // Gross LLM savings per JEV dollar (JEV cost excluded from the variant cost).
    jevRoi:
      v.jevCost > 0 && base.cost.mean !== null && v.cost.mean !== null && v.runs
        ? ((base.cost.mean - (v.cost.mean - v.jevCost / v.runs)) * v.runs) / v.jevCost
        : null,
  };
}
