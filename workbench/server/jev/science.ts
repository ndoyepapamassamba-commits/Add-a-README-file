// JEV SCIENTIFIC VALIDATION — pure, deterministic analysis of the JEV_LOG.
//
// Rules enforced here (never relaxed by the UI):
//  - a saving is only computed from PAIRED runs: same task, same repetition,
//    same controlled variables (model, prompt, tools, context, limits), run
//    OFF / PRE / LIVE / FULL. Unpaired missions are OBSERVATIONAL only.
//  - the cost of a mission is never "the cost of JEV": JEV's own calls are
//    accounted separately (JEV_COST) from the LLM, correction and tool costs.
//  - every figure carries a label: MEASURED, CALCULATED, PROJECTED,
//    INSUFFICIENT_SAMPLE or NON_COMPARABLE. Nothing is extrapolated.
//  - a quality that was not measured is null ("NON MESURÉ"), never 0.
import type { JevLogEntry, Variant } from './metrics';

export type DataLabel = 'MEASURED' | 'CALCULATED' | 'PROJECTED' | 'INSUFFICIENT_SAMPLE' | 'NON_COMPARABLE';

/** Thresholds of the analysis (all visible in the dashboard). */
export const SCIENCE = {
  /** Minimum valid pairs before any conclusion ("n ≥ 5"). */
  minPairs: 5,
  /** A change of cost per successful mission below this is "neutral". */
  neutralBand: 0.05,
  /** Tolerated success-rate drop (points, 0..1) before a variant "worsens". */
  successTolerance: 0.05,
  /** Tolerated quality drop (points of 100). */
  qualityTolerance: 3,
  /** Weights of the COGNITIVE EFFICIENCY SCORE (visible in the UI, sum = 1). */
  ces: {
    success: 0.3,
    quality: 0.2,
    costPerSuccess: 0.25,
    tokensPerSuccess: 0.1,
    latency: 0.1,
    rework: 0.05,
  },
} as const;

export const VARIANTS: Variant[] = ['off', 'pre', 'live', 'full'];
export const VARIANT_LABEL: Record<Variant, string> = {
  off: 'OFF',
  pre: 'PRE',
  live: 'LIVE',
  full: 'FULL',
};

// ───────────────────────── accounting (separate ledgers) ─────────────────────────

export type CallKind =
  | 'main' // productive model call of the mission
  | 'delegate' // sub-agent model call
  | 'gate' // re-ask after a delivery gate (shadow / evidence), existing pipeline
  | 'continuation' // answer cut by max tokens, continued
  | 'correction' // targeted correction asked by JEV QA
  | 'tool' // an LLM call made inside a tool (e.g. web.search)
  | 'jev1' // TypeSafe Jev typed judgment (routing)
  | 'jev2' // small-LLM arbitration
  | 'jev3'; // live deep-control judgment

export interface CallRec {
  kind: CallKind;
  step: number;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  /**
   * measured = cost reported by the provider; calculated = measured tokens × listed price;
   * estimated = the tokens themselves were estimated.
   */
  costSource: 'measured' | 'calculated' | 'estimated';
  ms: number;
  /** Estimated split of the INPUT tokens of this call (chars / 3.8 of what was sent). */
  split?: { system: number; tools: number; history: number; toolResults: number };
}

export interface Accounting {
  calls: CallRec[];
  // costs (USD)
  llmCost: number;
  correctionCost: number;
  toolCost: number;
  jevCost: number;
  /** JEV QA is local and deterministic: no call, no cost (MEASURED 0). */
  qaCost: number;
  totalCost: number;
  /** Cost by origin (USD): reported by the provider / calculated from tokens × price / estimated. */
  costBySource: { measured: number; calculated: number; estimated: number };
  /** Share of the total cost NOT reported by the provider (calculated + estimated). */
  unmeasuredCostShare: number;
  // tokens
  llmIn: number;
  llmOut: number;
  llmTokens: number;
  retryTokens: number;
  correctionTokens: number;
  toolTokens: number;
  jevIn: number;
  jevOut: number;
  jevTokens: number;
  qaTokens: number;
  /** Tokens of the mission itself (everything except JEV's own calls). */
  missionTokens: number;
  /** missionTokens + JEV's own tokens. */
  totalTokens: number;
  /** Estimated composition of the input tokens re-sent at every call. */
  inputSplit: { system: number; tools: number; history: number; toolResults: number; unattributed: number };
  /** Number of model calls of the mission (not counting JEV). */
  modelCalls: number;
  firstPromptTokens: number;
  lastPromptTokens: number;
}

const n0 = (x: number) => (Number.isFinite(x) ? x : 0);

export function accountingOf(calls: CallRec[]): Accounting {
  const a: Accounting = {
    calls,
    llmCost: 0,
    correctionCost: 0,
    toolCost: 0,
    jevCost: 0,
    qaCost: 0,
    totalCost: 0,
    costBySource: { measured: 0, calculated: 0, estimated: 0 },
    unmeasuredCostShare: 0,
    llmIn: 0,
    llmOut: 0,
    llmTokens: 0,
    retryTokens: 0,
    correctionTokens: 0,
    toolTokens: 0,
    jevIn: 0,
    jevOut: 0,
    jevTokens: 0,
    qaTokens: 0,
    missionTokens: 0,
    totalTokens: 0,
    inputSplit: { system: 0, tools: 0, history: 0, toolResults: 0, unattributed: 0 },
    modelCalls: 0,
    firstPromptTokens: 0,
    lastPromptTokens: 0,
  };
  const modelCalls: CallRec[] = [];
  for (const c of calls) {
    const tk = n0(c.tokensIn) + n0(c.tokensOut);
    a.costBySource[c.costSource] += n0(c.cost);
    switch (c.kind) {
      case 'main':
      case 'delegate':
        a.llmCost += c.cost;
        a.llmIn += c.tokensIn;
        a.llmOut += c.tokensOut;
        a.llmTokens += tk;
        modelCalls.push(c);
        break;
      case 'gate':
      case 'continuation':
        a.llmCost += c.cost; // retries are part of the LLM cost…
        a.retryTokens += tk; // …and listed separately in the tokens
        a.llmIn += c.tokensIn;
        a.llmOut += c.tokensOut;
        modelCalls.push(c);
        break;
      case 'correction':
        a.correctionCost += c.cost;
        a.correctionTokens += tk;
        modelCalls.push(c);
        break;
      case 'tool':
        a.toolCost += c.cost;
        a.toolTokens += tk;
        break;
      case 'jev1':
      case 'jev2':
      case 'jev3':
        a.jevCost += c.cost;
        a.jevIn += c.tokensIn;
        a.jevOut += c.tokensOut;
        a.jevTokens += tk;
        break;
    }
  }
  for (const c of modelCalls) {
    if (!c.split) continue;
    a.inputSplit.system += c.split.system;
    a.inputSplit.tools += c.split.tools;
    a.inputSplit.history += c.split.history;
    a.inputSplit.toolResults += c.split.toolResults;
  }
  const inputMeasured = modelCalls.reduce((s, c) => s + c.tokensIn, 0);
  const attributed =
    a.inputSplit.system + a.inputSplit.tools + a.inputSplit.history + a.inputSplit.toolResults;
  a.inputSplit.unattributed = Math.max(0, inputMeasured - attributed);
  a.totalCost = a.llmCost + a.correctionCost + a.toolCost + a.jevCost + a.qaCost;
  a.unmeasuredCostShare =
    a.totalCost > 0 ? (a.costBySource.calculated + a.costBySource.estimated) / a.totalCost : 0;
  a.missionTokens = a.llmTokens + a.retryTokens + a.correctionTokens + a.toolTokens;
  a.totalTokens = a.missionTokens + a.jevTokens;
  a.modelCalls = modelCalls.length;
  a.firstPromptTokens = modelCalls[0]?.tokensIn ?? 0;
  a.lastPromptTokens = modelCalls.at(-1)?.tokensIn ?? 0;
  return a;
}

// ───────────────────────── experiment metadata ─────────────────────────

export interface ExperimentMeta {
  experimentId: string;
  /** One group = one task × one repetition, run in every variant. */
  groupId: string;
  taskId: string;
  category: string;
  protocol: 'fixed-model' | 'free-routing';
  variant: Variant;
  rep: number;
  /** Execution order inside the group (variants are shuffled to cancel order effects). */
  order: number;
  timestamp: number;
  // controlled variables
  model: string;
  modelVersion: string | null;
  modelsUsed: string[];
  promptHash: string;
  taskType: string;
  difficulty: number;
  risk: string;
  toolsAvailable: number;
  contextHash: string;
  temperature: number | null;
  maxTokens: number;
  jevMode: string;
}

/** Variables that MUST be identical between OFF and a JEV variant for the pair to be comparable. */
const CONTROLLED: (keyof ExperimentMeta)[] = [
  'promptHash',
  'model',
  'taskType',
  'toolsAvailable',
  'contextHash',
  'temperature',
  'maxTokens',
];

export function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export interface Pair {
  groupId: string;
  taskId: string;
  category: string;
  rep: number;
  off: JevLogEntry;
  v: JevLogEntry;
  variant: Variant;
}
export interface NonComparable {
  groupId: string;
  taskId: string;
  variant: Variant;
  reasons: string[];
}

const variantOf = (e: JevLogEntry): Variant => e.experiment?.variant ?? e.variant ?? (e.jev ? 'full' : 'off');

/** Differences of controlled variables between two runs (empty = comparable). */
export function differences(a: ExperimentMeta, b: ExperimentMeta): string[] {
  const out: string[] = [];
  for (const k of CONTROLLED) if (a[k] !== b[k]) out.push(`${k} : ${String(a[k])} ≠ ${String(b[k])}`);
  return out;
}

export interface Paired {
  pairs: Pair[];
  nonComparable: NonComparable[];
  /** Entries that carry no experiment metadata, or whose group has no OFF run. */
  observational: JevLogEntry[];
  /** Pairs per variant. */
  byVariant: Record<Variant, Pair[]>;
  /** Groups run in every variant that appears in the data (the table population). */
  completeGroups: string[];
  variantsPresent: Variant[];
}

export function pairUp(log: JevLogEntry[]): Paired {
  const groups = new Map<string, JevLogEntry[]>();
  const observational: JevLogEntry[] = [];
  for (const e of log) {
    // Fabric experiments (tournament, council, skill test, cognitive benchmark) have their own analysis.
    if (e.fabric) continue;
    if (e.experiment && e.acct)
      groups.set(e.experiment.groupId, [...(groups.get(e.experiment.groupId) ?? []), e]);
    else observational.push(e);
  }
  const pairs: Pair[] = [];
  const nonComparable: NonComparable[] = [];
  for (const [groupId, es] of groups) {
    const off = es.find((e) => variantOf(e) === 'off');
    if (!off) {
      observational.push(...es);
      continue;
    }
    for (const e of es) {
      const v = variantOf(e);
      if (v === 'off') continue;
      const diff = differences(off.experiment!, e.experiment!);
      if (diff.length)
        nonComparable.push({ groupId, taskId: e.experiment!.taskId, variant: v, reasons: diff });
      else
        pairs.push({
          groupId,
          taskId: e.experiment!.taskId,
          category: e.experiment!.category,
          rep: e.experiment!.rep,
          off,
          v: e,
          variant: v,
        });
    }
  }
  const byVariant = { off: [], pre: [], live: [], full: [] } as Record<Variant, Pair[]>;
  for (const p of pairs) byVariant[p.variant].push(p);
  const variantsPresent = VARIANTS.filter((v) => v === 'off' || byVariant[v].length > 0);
  const complete = [...new Set(pairs.map((p) => p.groupId))].filter((g) =>
    variantsPresent.every((v) => v === 'off' || byVariant[v].some((p) => p.groupId === g)),
  );
  return { pairs, nonComparable, observational, byVariant, completeGroups: complete, variantsPresent };
}

// ───────────────────────── statistics ─────────────────────────

export interface Desc {
  n: number;
  mean: number | null;
  median: number | null;
  p95: number | null;
  min: number | null;
  max: number | null;
  sd: number | null;
}
export function describe(xs: number[]): Desc {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0, mean: null, median: null, p95: null, min: null, max: null, sd: null };
  const q = (p: number) => {
    const i = (v.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return v[lo]! + (v[hi]! - v[lo]!) * (i - lo);
  };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)) : null;
  return { n: v.length, mean, median: q(0.5), p95: q(0.95), min: v[0]!, max: v[v.length - 1]!, sd };
}

/** Two-sided 95 % Student t critical values (df 1..30), 1.96 beyond. */
const T95 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131,
  2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];
export const tCrit95 = (df: number) => (df < 1 ? NaN : df <= 30 ? T95[df - 1]! : 1.96);

export interface PairedStat {
  n: number;
  meanDelta: number | null;
  medianDelta: number | null;
  sd: number | null;
  /** 95 % confidence interval of the mean paired difference (needs n ≥ 3). */
  ci95: [number, number] | null;
  /** Pairs where the variant is lower / higher than OFF. */
  lower: number;
  higher: number;
  /** The CI excludes 0. */
  significant: boolean;
}
/** Paired differences d = variant − OFF. */
export function pairedStat(diffs: number[]): PairedStat {
  const d = diffs.filter((x) => Number.isFinite(x));
  const s = describe(d);
  let ci: [number, number] | null = null;
  if (d.length >= 3 && s.sd !== null && s.mean !== null) {
    const h = (tCrit95(d.length - 1) * s.sd) / Math.sqrt(d.length);
    ci = [s.mean - h, s.mean + h];
  }
  return {
    n: d.length,
    meanDelta: s.mean,
    medianDelta: s.median,
    sd: s.sd,
    ci95: ci,
    lower: d.filter((x) => x < 0).length,
    higher: d.filter((x) => x > 0).length,
    significant: ci !== null && (ci[0] > 0 || ci[1] < 0),
  };
}

// ───────────────────────── per-run metrics ─────────────────────────

/** Total tokens of a run including JEV's own (legacy runs without accounting fall back on the log). */
export const totalTokensOf = (e: JevLogEntry) => e.acct?.totalTokens ?? e.tokensIn + e.tokensOut;
export const totalCostOf = (e: JevLogEntry) => e.acct?.totalCost ?? e.cost + e.jevCost;
export const missionTokensOf = (e: JevLogEntry) => e.acct?.missionTokens ?? e.tokensIn + e.tokensOut;
export const missionCostOf = (e: JevLogEntry) => (e.acct ? e.acct.totalCost - e.acct.jevCost : e.cost);
/** Quality that was really measured, else null (NOT 0). */
export const qualityOf = (e: JevLogEntry): number | null => e.qualityMeasured ?? null;

// ───────────────────────── variant summaries ─────────────────────────

export interface VariantSci {
  variant: Variant;
  /** Missions in the table population. */
  n: number;
  successes: number;
  judged: number;
  tokens: Desc;
  cost: Desc;
  latency: Desc;
  quality: Desc;
  successRate: number | null;
  costPerSuccess: number | null;
  tokensPerSuccess: number | null;
  qualityPerUsd: number | null;
  qualityPer1kTokens: number | null;
  // accounting totals over the missions
  llmCost: number;
  correctionCost: number;
  toolCost: number;
  jevCost: number;
  totalCost: number;
  jevTokens: number;
  correctionTokens: number;
  retryTokens: number;
  missionTokens: number;
  totalTokens: number;
  /** JEV's own share of the total cost / tokens. */
  jevCostShare: number | null;
  retries: number;
  escalations: number;
  decisionMs: number;
}

function summarize(entries: JevLogEntry[], variant: Variant): VariantSci {
  const tok = entries.map(totalTokensOf);
  const cost = entries.map(totalCostOf);
  const judged = entries.filter((e) => e.success !== null);
  const ok = judged.filter((e) => e.success).length;
  const totalCost = cost.reduce((a, b) => a + b, 0);
  const totalTokens = tok.reduce((a, b) => a + b, 0);
  const q = entries.map(qualityOf).filter((x): x is number => x !== null);
  const sum = (f: (e: JevLogEntry) => number) => entries.reduce((a, e) => a + f(e), 0);
  const jevCost = sum((e) => e.acct?.jevCost ?? e.jevCost);
  return {
    variant,
    n: entries.length,
    successes: ok,
    judged: judged.length,
    tokens: describe(tok),
    cost: describe(cost),
    latency: describe(entries.map((e) => e.latencyMs)),
    quality: describe(q),
    successRate: judged.length ? ok / judged.length : null,
    costPerSuccess: ok ? totalCost / ok : null,
    tokensPerSuccess: ok ? totalTokens / ok : null,
    qualityPerUsd: q.length && totalCost > 0 ? q.reduce((a, b) => a + b, 0) / totalCost : null,
    qualityPer1kTokens:
      q.length && totalTokens > 0 ? q.reduce((a, b) => a + b, 0) / (totalTokens / 1000) : null,
    llmCost: sum((e) => e.acct?.llmCost ?? e.cost),
    correctionCost: sum((e) => e.acct?.correctionCost ?? 0),
    toolCost: sum((e) => e.acct?.toolCost ?? 0),
    jevCost,
    totalCost,
    jevTokens: sum((e) => e.acct?.jevTokens ?? 0),
    correctionTokens: sum((e) => e.acct?.correctionTokens ?? 0),
    retryTokens: sum((e) => e.acct?.retryTokens ?? 0),
    missionTokens: sum(missionTokensOf),
    totalTokens,
    jevCostShare: totalCost > 0 ? jevCost / totalCost : null,
    retries: sum((e) => e.retries),
    escalations: sum((e) => e.escalations),
    decisionMs: sum((e) => e.decisionMs),
  };
}

// ───────────────────────── economics ─────────────────────────

export interface Economics {
  /** Mean per mission, paired (OFF vs variant). */
  tokensBaseline: number | null;
  /** Mission tokens of the variant (JEV's own calls excluded). */
  tokensActual: number | null;
  tokensJevOverhead: number;
  tokensCorrectionAdded: number;
  tokensRoutingAdded: number;
  /** TOKENS_BASELINE − TOKENS_ACTUAL (mission level). */
  netTokenSaving: number | null;
  /** NET_TOKEN_SAVING − tokens consumed by JEV itself. */
  jevNetTokenImpact: number | null;
  // estimated components of the saving (paired difference of the estimated input split)
  contextSaved: number | null;
  toolSaved: number | null;
  // money (per mission means)
  costBaseline: number | null;
  /** Mission cost of the variant, JEV's own calls excluded. */
  costActual: number | null;
  jevGrossCost: number;
  /** COST_BASELINE − COST_ACTUAL: what the variant saved on the mission itself. */
  jevSavingsValue: number | null;
  /** SAVINGS − JEV cost (per mission). */
  jevNetValue: number | null;
  /** SAVINGS / JEV cost; null when JEV cost is 0 (JEV-0 is free) or savings unknown. */
  jevRoi: number | null;
  roiNote: string;
  /** JEV costs more than it saves. */
  negative: boolean;
}

export function economics(pairs: Pair[]): Economics | null {
  if (!pairs.length) return null;
  const mean = (f: (p: Pair) => number) => pairs.reduce((a, p) => a + f(p), 0) / pairs.length;
  const tokB = mean((p) => missionTokensOf(p.off));
  const tokA = mean((p) => missionTokensOf(p.v));
  const jevTok = mean((p) => p.v.acct?.jevTokens ?? 0);
  const costB = mean((p) => missionCostOf(p.off));
  const costA = mean((p) => missionCostOf(p.v));
  const jevCost = mean((p) => p.v.acct?.jevCost ?? p.v.jevCost);
  const savings = costB - costA;
  const net = savings - jevCost;
  const split = (e: JevLogEntry) => e.acct?.inputSplit;
  const diff = (f: (s: NonNullable<ReturnType<typeof split>>) => number) =>
    pairs.every((p) => split(p.off) && split(p.v)) ? mean((p) => f(split(p.off)!) - f(split(p.v)!)) : null;
  let roiNote: string;
  let roi: number | null = null;
  if (jevCost <= 0)
    roiNote = 'coût JEV nul (JEV-0 local, aucun appel distant) : ROI non défini, valeur nette = économie';
  else {
    roi = savings / jevCost;
    roiNote =
      roi < 1
        ? `ROI ${roi.toFixed(2)} < 1 : JEV ${savings <= 0 ? 'ne fait pas économiser' : 'coûte plus qu’il n’économise'}`
        : `ROI ${roi.toFixed(1)}`;
  }
  return {
    tokensBaseline: tokB,
    tokensActual: tokA,
    tokensJevOverhead: jevTok + mean((p) => p.v.acct?.correctionTokens ?? 0),
    tokensCorrectionAdded: mean((p) => p.v.acct?.correctionTokens ?? 0),
    tokensRoutingAdded: jevTok,
    netTokenSaving: tokB - tokA,
    jevNetTokenImpact: tokB - tokA - jevTok,
    contextSaved: diff((s) => s.history + s.toolResults + s.system),
    toolSaved: diff((s) => s.tools),
    costBaseline: costB,
    costActual: costA,
    jevGrossCost: jevCost,
    jevSavingsValue: savings,
    jevNetValue: net,
    jevRoi: roi,
    roiNote,
    negative: net < 0,
  };
}

// ───────────────────────── paired deltas & judgement ─────────────────────────

export type Judgement = 'improves' | 'neutral' | 'worsens' | 'insufficient';

export interface DeltaSci {
  variant: Variant;
  /** Valid pairs (n) behind every figure of this column. */
  pairs: number;
  label: DataLabel;
  dTokens: PairedStat;
  dCost: PairedStat;
  dLatency: PairedStat;
  /** Only pairs where quality was measured in BOTH runs. */
  dQuality: PairedStat;
  /** −1 / 0 / +1 per pair (success difference). */
  dSuccess: PairedStat;
  /** Relative change of the cost per successful mission vs OFF. */
  costPerSuccessChange: number | null;
  tokensPerSuccessChange: number | null;
  economics: Economics | null;
  ces: Ces | null;
  judgement: Judgement;
  reasons: string[];
}

const succ = (e: JevLogEntry) => (e.success === null ? null : e.success ? 1 : 0);

export function judge(
  ps: Pair[],
  off: VariantSci,
  v: VariantSci,
  d: { dQuality: PairedStat; dSuccess: PairedStat },
): { judgement: Judgement; reasons: string[]; change: number | null } {
  if (ps.length < SCIENCE.minPairs)
    return {
      judgement: 'insufficient',
      reasons: [`n = ${ps.length} < ${SCIENCE.minPairs} paires valides`],
      change: null,
    };
  const change =
    off.costPerSuccess !== null && v.costPerSuccess !== null && off.costPerSuccess > 0
      ? (v.costPerSuccess - off.costPerSuccess) / off.costPerSuccess
      : null;
  const reasons: string[] = [];
  let bad = false;
  const dS = d.dSuccess.meanDelta;
  if (dS !== null && dS < -SCIENCE.successTolerance) {
    bad = true;
    reasons.push(`réussite −${Math.abs(Math.round(dS * 100))} pts`);
  }
  const dQ = d.dQuality.meanDelta;
  if (dQ !== null && d.dQuality.n >= 3 && dQ < -SCIENCE.qualityTolerance) {
    bad = true;
    reasons.push(`qualité −${Math.abs(dQ).toFixed(1)} pts`);
  }
  if (change === null) {
    return {
      judgement: bad ? 'worsens' : 'neutral',
      reasons: [...reasons, 'coût / mission réussie non calculable'],
      change,
    };
  }
  if (change >= SCIENCE.neutralBand) {
    bad = true;
    reasons.push(`coût / mission réussie +${Math.round(change * 100)} %`);
  }
  if (bad) return { judgement: 'worsens', reasons, change };
  if (change <= -SCIENCE.neutralBand) {
    reasons.push(`coût / mission réussie ${Math.round(change * 100)} %`);
    return { judgement: 'improves', reasons, change };
  }
  return {
    judgement: 'neutral',
    reasons: [`variation du coût / mission réussie dans ±${SCIENCE.neutralBand * 100} %`],
    change,
  };
}

// COGNITIVE EFFICIENCY SCORE ------------------------------------------------

export interface CesPart {
  key: string;
  label: string;
  weight: number;
  /** variant / OFF ratio, oriented so that > 1 is better; null = not measurable. */
  ratio: number | null;
  used: boolean;
}
export interface Ces {
  /** 100 = same efficiency as OFF; > 100 = better. */
  score: number | null;
  parts: CesPart[];
  formula: string;
}
export const CES_FORMULA =
  'CES = 100 × Π ratioᵢ^(wᵢ / Σwᵤ), ratio > 1 = meilleur que OFF : réussite = V/OFF ; qualité = V/OFF ; coût / réussite = OFF/V ; tokens / réussite = OFF/V ; latence = OFF/V ; retouches (retries + escalades + corrections) = (1+OFF)/(1+V). Les composantes non mesurées sont retirées et les poids renormalisés.';

export function cesOf(off: VariantSci, v: VariantSci, offE: JevLogEntry[], vE: JevLogEntry[]): Ces {
  const rw = (es: JevLogEntry[]) =>
    es.reduce((a, e) => a + e.retries + e.escalations + e.corrections, 0) / Math.max(1, es.length);
  const ratio = (a: number | null, b: number | null, invert: boolean) =>
    a === null || b === null || a <= 0 || b <= 0 ? null : invert ? a / b : b / a;
  const w = SCIENCE.ces;
  const parts: CesPart[] = [
    {
      key: 'success',
      label: 'Taux de réussite',
      weight: w.success,
      ratio: ratio(off.successRate, v.successRate, false),
      used: false,
    },
    {
      key: 'quality',
      label: 'Qualité',
      weight: w.quality,
      ratio: ratio(off.quality.mean, v.quality.mean, false),
      used: false,
    },
    {
      key: 'costPerSuccess',
      label: 'Coût / mission réussie',
      weight: w.costPerSuccess,
      ratio: ratio(off.costPerSuccess, v.costPerSuccess, true),
      used: false,
    },
    {
      key: 'tokensPerSuccess',
      label: 'Tokens / mission réussie',
      weight: w.tokensPerSuccess,
      ratio: ratio(off.tokensPerSuccess, v.tokensPerSuccess, true),
      used: false,
    },
    {
      key: 'latency',
      label: 'Latence moyenne',
      weight: w.latency,
      ratio: ratio(off.latency.mean, v.latency.mean, true),
      used: false,
    },
    {
      key: 'rework',
      label: 'Retouches (retries, escalades, corrections)',
      weight: w.rework,
      ratio: (1 + rw(offE)) / (1 + rw(vE)),
      used: false,
    },
  ];
  const usable = parts.filter((p) => p.ratio !== null);
  const wsum = usable.reduce((a, p) => a + p.weight, 0);
  for (const p of usable) p.used = true;
  const score =
    usable.length >= 3 && wsum > 0
      ? 100 * Math.exp(usable.reduce((a, p) => a + (p.weight / wsum) * Math.log(p.ratio!), 0))
      : null;
  return { score: score === null ? null : Math.round(score), parts, formula: CES_FORMULA };
}

// ───────────────────────── category analysis ─────────────────────────

export interface CategorySci {
  category: string;
  groups: number;
  label: DataLabel;
  byVariant: Partial<Record<Variant, VariantSci>>;
  deltas: Partial<
    Record<
      Variant,
      {
        judgement: Judgement;
        change: number | null;
        roi: number | null;
        netValue: number | null;
        pairs: number;
      }
    >
  >;
  /** Cheapest variant that keeps success and quality (data-driven, null when insufficient). */
  best: Variant | null;
  bestReason: string;
}

function populations(paired: Paired, groupIds: string[]) {
  const set = new Set(groupIds);
  const offByGroup = new Map<string, JevLogEntry>();
  for (const p of paired.pairs) if (set.has(p.groupId)) offByGroup.set(p.groupId, p.off);
  const entries: Record<Variant, JevLogEntry[]> = {
    off: [...offByGroup.values()],
    pre: [],
    live: [],
    full: [],
  };
  const pairsBy: Record<Variant, Pair[]> = { off: [], pre: [], live: [], full: [] };
  for (const p of paired.pairs)
    if (set.has(p.groupId)) {
      entries[p.variant].push(p.v);
      pairsBy[p.variant].push(p);
    }
  return { entries, pairsBy };
}

function deltaOf(
  variant: Variant,
  ps: Pair[],
  off: VariantSci,
  v: VariantSci,
  offE: JevLogEntry[],
  vE: JevLogEntry[],
): DeltaSci {
  const both = (f: (e: JevLogEntry) => number | null) =>
    ps.flatMap((p) => {
      const a = f(p.off);
      const b = f(p.v);
      return a === null || b === null ? [] : [b - a];
    });
  const dQuality = pairedStat(both(qualityOf));
  const dSuccess = pairedStat(both(succ));
  const j = judge(ps, off, v, { dQuality, dSuccess });
  const tps =
    off.tokensPerSuccess !== null && v.tokensPerSuccess !== null && off.tokensPerSuccess > 0
      ? (v.tokensPerSuccess - off.tokensPerSuccess) / off.tokensPerSuccess
      : null;
  return {
    variant,
    pairs: ps.length,
    label: ps.length < SCIENCE.minPairs ? 'INSUFFICIENT_SAMPLE' : 'MEASURED',
    dTokens: pairedStat(ps.map((p) => totalTokensOf(p.v) - totalTokensOf(p.off))),
    dCost: pairedStat(ps.map((p) => totalCostOf(p.v) - totalCostOf(p.off))),
    dLatency: pairedStat(ps.map((p) => p.v.latencyMs - p.off.latencyMs)),
    dQuality,
    dSuccess,
    costPerSuccessChange: j.change,
    tokensPerSuccessChange: tps,
    economics: economics(ps),
    ces: cesOf(off, v, offE, vE),
    judgement: j.judgement,
    reasons: j.reasons,
  };
}

/** Cheapest variant (per successful mission) among those that keep success and quality vs OFF. */
export function bestVariant(
  byVariant: Partial<Record<Variant, VariantSci>>,
  pairsN: Partial<Record<Variant, number>>,
): { best: Variant | null; reason: string } {
  const off = byVariant.off;
  if (!off || off.n < SCIENCE.minPairs)
    return { best: null, reason: `n = ${off?.n ?? 0} < ${SCIENCE.minPairs} : échantillon insuffisant` };
  const ok = VARIANTS.filter((v) => {
    const s = byVariant[v];
    if (!s || s.costPerSuccess === null) return false;
    if (v !== 'off' && (pairsN[v] ?? 0) < SCIENCE.minPairs) return false;
    if (
      off.successRate !== null &&
      s.successRate !== null &&
      s.successRate < off.successRate - SCIENCE.successTolerance
    )
      return false;
    if (
      off.quality.mean !== null &&
      s.quality.mean !== null &&
      s.quality.mean < off.quality.mean - SCIENCE.qualityTolerance
    )
      return false;
    return true;
  });
  if (!ok.length) return { best: null, reason: 'aucune variante ne conserve réussite et qualité' };
  const b = ok.reduce(
    (a, c) =>
      byVariant[c]!.costPerSuccess! < byVariant[a]!.costPerSuccess! * (1 - SCIENCE.neutralBand) ? c : a,
    ok.includes('off') ? 'off' : ok[0]!,
  );
  return {
    best: b,
    reason:
      b === 'off'
        ? 'aucune variante JEV n’abaisse le coût / mission réussie de plus de 5 % en conservant réussite et qualité'
        : `coût / mission réussie le plus bas (${byVariant[b]!.costPerSuccess!.toFixed(5)} $) à réussite et qualité conservées`,
  };
}

// ───────────────────────── economic drift ─────────────────────────

export interface Drift {
  kind: 'tokens_no_quality' | 'cost_no_success';
  variant: Variant;
  detail: string;
}
/** ECONOMIC_DRIFT across missions: more tokens / cost without a better quality / success. */
export function economicDrift(d: Partial<Record<Variant, DeltaSci>>): Drift[] {
  const out: Drift[] = [];
  for (const v of VARIANTS) {
    const x = d[v];
    if (!x || v === 'off' || x.pairs < SCIENCE.minPairs) continue;
    const dq = x.dQuality.meanDelta;
    if ((x.dTokens.meanDelta ?? 0) > 0 && (dq === null || dq <= 0))
      out.push({
        kind: 'tokens_no_quality',
        variant: v,
        detail: `+${Math.round(x.dTokens.meanDelta!)} tokens / mission sans gain de qualité (${dq === null ? 'NON MESURÉE' : `${dq.toFixed(1)} pts`})`,
      });
    const ds = x.dSuccess.meanDelta;
    if ((x.dCost.meanDelta ?? 0) > 0 && (ds === null || ds <= 0))
      out.push({
        kind: 'cost_no_success',
        variant: v,
        detail: `+${(x.dCost.meanDelta! * 1000).toFixed(3)} m$ / mission sans gain de réussite (${ds === null ? 'NON MESURÉE' : `${Math.round(ds * 100)} pts`})`,
      });
  }
  return out;
}

// ───────────────────────── the whole analysis ─────────────────────────

export type Verdict = 'A' | 'B' | 'C' | 'D' | 'E';
export const VERDICT_TEXT: Record<Verdict, string> = {
  A: 'A — JEV est rentable',
  B: 'B — JEV est rentable uniquement pour certaines catégories',
  C: 'C — JEV est neutre',
  D: 'D — JEV est actuellement contre-productif',
  E: 'E — Données insuffisantes (ÉCHANTILLON INSUFFISANT)',
};

export interface Science {
  experiments: number;
  groups: number;
  completeGroups: number;
  validPairs: number;
  nonComparable: NonComparable[];
  observational: JevLogEntry[];
  variantsPresent: Variant[];
  repetitions: number;
  models: string[];
  tasks: number;
  byVariant: Partial<Record<Variant, VariantSci>>;
  deltas: Partial<Record<Variant, DeltaSci>>;
  categories: CategorySci[];
  drift: Drift[];
  verdict: Verdict;
  verdictWhy: string[];
  bestVariant: Variant | null;
  worstVariant: Variant | null;
  recommendation: string;
  anomalies: string[];
  limitations: string[];
  benchmarkCost: number;
  jevCost: number;
  jevTokens: number;
}

export function analyze(log: JevLogEntry[]): Science {
  const paired = pairUp(log);
  const pop = populations(paired, paired.completeGroups);
  const byVariant: Partial<Record<Variant, VariantSci>> = {};
  for (const v of paired.variantsPresent) byVariant[v] = summarize(pop.entries[v], v);
  const deltas: Partial<Record<Variant, DeltaSci>> = {};
  const off = byVariant.off;
  if (off)
    for (const v of paired.variantsPresent)
      if (v !== 'off')
        deltas[v] = deltaOf(v, pop.pairsBy[v], off, byVariant[v]!, pop.entries.off, pop.entries[v]);

  // categories
  const cats = [...new Set(paired.pairs.map((p) => p.category))].sort();
  const categories: CategorySci[] = cats.map((category) => {
    const gids = paired.completeGroups.filter(
      (g) => paired.pairs.find((p) => p.groupId === g)?.category === category,
    );
    const cp = populations(paired, gids);
    const bv: Partial<Record<Variant, VariantSci>> = {};
    for (const v of paired.variantsPresent) if (cp.entries[v].length) bv[v] = summarize(cp.entries[v], v);
    const dl: CategorySci['deltas'] = {};
    const pairsN: Partial<Record<Variant, number>> = {};
    for (const v of paired.variantsPresent) {
      if (v === 'off' || !bv.off || !bv[v]) continue;
      const d = deltaOf(v, cp.pairsBy[v], bv.off, bv[v]!, cp.entries.off, cp.entries[v]);
      pairsN[v] = d.pairs;
      dl[v] = {
        judgement: d.judgement,
        change: d.costPerSuccessChange,
        roi: d.economics?.jevRoi ?? null,
        netValue: d.economics?.jevNetValue ?? null,
        pairs: d.pairs,
      };
    }
    const b = bestVariant(bv, pairsN);
    return {
      category,
      groups: gids.length,
      label: gids.length < SCIENCE.minPairs ? 'INSUFFICIENT_SAMPLE' : 'MEASURED',
      byVariant: bv,
      deltas: dl,
      best: b.best,
      bestReason: b.reason,
    };
  });

  // verdict
  const dv = VARIANTS.filter((v) => v !== 'off' && deltas[v]).map((v) => deltas[v]!);
  const sufficient = dv.filter((d) => d.judgement !== 'insufficient');
  const improving = sufficient.filter((d) => d.judgement === 'improves');
  const worsening = sufficient.filter((d) => d.judgement === 'worsens');
  const catGood = categories.filter((c) => c.best && c.best !== 'off');
  const catBad = categories.filter(
    (c) => Object.values(c.deltas).some((d) => d.judgement === 'worsens') && !c.best,
  );
  const catSuff = categories.filter((c) => c.label === 'MEASURED');
  let verdict: Verdict;
  const why: string[] = [];
  if (!sufficient.length && !catGood.length) {
    verdict = 'E';
    why.push(
      dv.length
        ? `moins de ${SCIENCE.minPairs} paires valides par variante (max ${Math.max(...dv.map((d) => d.pairs))})`
        : 'aucune expérience appariée enregistrée',
    );
  } else if (
    improving.length &&
    !catBad.length &&
    (catSuff.length === 0 || catGood.length >= catSuff.length / 2)
  ) {
    verdict = 'A';
    why.push(
      `${improving.map((d) => VARIANT_LABEL[d.variant]).join(', ')} abaisse(nt) le coût / mission réussie sans perte de réussite ni de qualité`,
    );
  } else if (catGood.length || improving.length) {
    verdict = 'B';
    why.push(
      catGood.length
        ? `rentable pour : ${catGood.map((c) => `${c.category} (${VARIANT_LABEL[c.best!]})`).join(', ')}`
        : 'rentable globalement mais pas pour toutes les catégories',
    );
    if (catBad.length) why.push(`pas rentable pour : ${catBad.map((c) => c.category).join(', ')}`);
  } else if (worsening.length === sufficient.length && sufficient.length) {
    verdict = 'D';
    why.push(
      `toutes les variantes évaluées détériorent le coût / mission réussie, la réussite ou la qualité (${worsening.map((d) => `${VARIANT_LABEL[d.variant]} : ${d.reasons.join(', ')}`).join(' ; ')})`,
    );
  } else {
    verdict = 'C';
    why.push('aucune différence au-delà des seuils entre OFF et les variantes JEV');
  }

  // best / worst on cost per successful mission (sufficient data only)
  const ranked = paired.variantsPresent
    .filter(
      (v) =>
        byVariant[v]?.costPerSuccess != null && (v === 'off' || (deltas[v]?.pairs ?? 0) >= SCIENCE.minPairs),
    )
    .sort((a, b) => byVariant[a]!.costPerSuccess! - byVariant[b]!.costPerSuccess!);
  const bestV = ranked.length >= 2 ? ranked[0]! : null;
  const worstV = ranked.length >= 2 ? ranked.at(-1)! : null;

  const all = paired.pairs.map((p) => [p.off, p.v]).flat();
  const uniq = new Map(all.map((e) => [e.id, e]));
  const anomalies: string[] = [];
  const entries = [...uniq.values()];
  const failed = entries.filter((e) => e.success === false);
  if (failed.length)
    anomalies.push(
      `${failed.length} exécution(s) en échec : ${failed
        .slice(0, 6)
        .map((e) => `${e.experiment!.taskId} ${VARIANT_LABEL[variantOf(e)]}`)
        .join(', ')}`,
    );
  const fb = entries.filter((e) => e.retries > 0);
  if (fb.length)
    anomalies.push(`${fb.length} exécution(s) avec bascule de modèle (fallback) : variable non contrôlée`);
  const est = entries.filter((e) => (e.acct?.costBySource.estimated ?? 0) > 0);
  if (est.length) anomalies.push(`${est.length} exécution(s) dont le coût repose sur des tokens estimés`);
  const calc = entries.filter((e) => (e.acct?.unmeasuredCostShare ?? 0) > 0.01);
  if (calc.length)
    anomalies.push(
      `${calc.length} exécution(s) dont plus de 1 % du coût est calculé (tokens × prix) faute de coût renvoyé par le fournisseur`,
    );
  if (paired.nonComparable.length)
    anomalies.push(
      `${paired.nonComparable.length} paire(s) NON COMPARABLE(S) exclue(s) (${[...new Set(paired.nonComparable.flatMap((n) => n.reasons.map((r) => r.split(' :')[0]!)))].join(', ')})`,
    );
  const heavyJev = entries.filter(
    (e) => e.acct && e.acct.totalCost > 0 && e.acct.jevCost / e.acct.totalCost > 0.1,
  );
  if (heavyJev.length) anomalies.push(`${heavyJev.length} exécution(s) où JEV représente > 10 % du coût`);
  const cds = describe(entries.map(totalCostOf));
  const outl = entries.filter((e) => cds.p95 !== null && cds.n >= 20 && totalCostOf(e) > cds.p95 * 2);
  if (outl.length) anomalies.push(`${outl.length} valeur(s) aberrante(s) de coût (> 2 × p95)`);
  const drift = economicDrift(deltas);
  for (const d of drift) anomalies.push(`ECONOMIC_DRIFT ${VARIANT_LABEL[d.variant]} : ${d.detail}`);

  const limitations: string[] = [
    `Seuil de conclusion : n ≥ ${SCIENCE.minPairs} paires valides ; en dessous, « ÉCHANTILLON INSUFFISANT ».`,
    'La qualité est un score local déterministe (format, langue, éléments demandés, syntaxe, secrets, chiffres sans preuve, cohérence) ; en benchmark, la correction est celle du contrôle de réussite. Elle ne mesure pas la pertinence d’une réponse libre.',
    'Les tokens sont ceux facturés par le fournisseur ; la répartition de l’entrée (système, outils, historique, résultats d’outils) est une estimation (caractères / 3,8) et reste « CALCULATED ».',
    'Un coût peut être estimé quand le fournisseur ne le renvoie pas : la part estimée est signalée.',
    'Le cache de prompts du fournisseur peut favoriser les exécutions suivantes : l’ordre des variantes est mélangé dans chaque groupe.',
  ];
  if (categories.some((c) => c.label === 'INSUFFICIENT_SAMPLE'))
    limitations.push(
      `Catégories avec moins de ${SCIENCE.minPairs} répétitions : pas de recommandation par catégorie.`,
    );

  const rec =
    verdict === 'E'
      ? 'Aucune recommandation : lancez un benchmark apparié avec au moins ' +
        `${SCIENCE.minPairs} répétitions.`
      : catGood.length
        ? `Politique fondée sur les mesures : ${categories
            .filter((c) => c.best)
            .map((c) => `${c.category} → ${c.best === 'off' ? 'OFF' : VARIANT_LABEL[c.best!]}`)
            .join(' · ')}`
        : bestV
          ? `Niveau global : ${VARIANT_LABEL[bestV]} (coût / mission réussie le plus bas).`
          : 'Aucune variante n’est meilleure que OFF.';

  const jevAll = entries.filter((e) => variantOf(e) !== 'off');
  return {
    experiments: new Set(entries.map((e) => e.experiment!.experimentId)).size,
    groups: new Set(entries.map((e) => e.experiment!.groupId)).size,
    completeGroups: paired.completeGroups.length,
    validPairs: paired.pairs.length,
    nonComparable: paired.nonComparable,
    observational: paired.observational,
    variantsPresent: paired.variantsPresent,
    repetitions: Math.max(0, ...entries.map((e) => e.experiment!.rep)),
    models: [...new Set(entries.flatMap((e) => e.experiment!.modelsUsed))],
    tasks: new Set(entries.map((e) => e.experiment!.taskId)).size,
    byVariant,
    deltas,
    categories,
    drift,
    verdict,
    verdictWhy: why,
    bestVariant: bestV,
    worstVariant: worstV,
    recommendation: rec,
    anomalies,
    limitations,
    benchmarkCost: entries.reduce((a, e) => a + totalCostOf(e), 0),
    jevCost: jevAll.reduce((a, e) => a + (e.acct?.jevCost ?? e.jevCost), 0),
    jevTokens: jevAll.reduce((a, e) => a + (e.acct?.jevTokens ?? 0), 0),
  };
}

// ───────────────────────── "why did this mission cost that much?" ─────────────────────────

export interface Diagnosis {
  title: string;
  lines: string[];
  rows: { label: string; value: number; share: number; tag: DataLabel }[];
  available: boolean;
}
const pctOf = (x: number, t: number) => (t > 0 ? x / t : 0);

/** Token decomposition of one mission, with the main sources (from the measured accounting). */
export function explainTokens(e: JevLogEntry): Diagnosis {
  const a = e.acct;
  const total = e.tokensIn + e.tokensOut;
  if (!a)
    return {
      title: `Pourquoi cette mission a-t-elle consommé ${total.toLocaleString('fr-FR')} tokens ?`,
      available: false,
      lines: [
        'Mission enregistrée avant l’instrumentation économique : seuls les totaux (entrée / sortie) existent, pas la décomposition. Relancez-la pour la diagnostiquer.',
      ],
      rows: [
        { label: 'Entrée (mesurée)', value: e.tokensIn, share: pctOf(e.tokensIn, total), tag: 'MEASURED' },
        { label: 'Sortie (mesurée)', value: e.tokensOut, share: pctOf(e.tokensOut, total), tag: 'MEASURED' },
      ],
    };
  const t = a.totalTokens;
  const rows: Diagnosis['rows'] = [
    { label: 'Entrée LLM (mesurée)', value: a.llmIn, share: pctOf(a.llmIn, t), tag: 'MEASURED' },
    { label: 'Sortie LLM (mesurée)', value: a.llmOut, share: pctOf(a.llmOut, t), tag: 'MEASURED' },
    {
      label: '  dont contexte système (estimé, renvoyé à chaque appel)',
      value: a.inputSplit.system,
      share: pctOf(a.inputSplit.system, t),
      tag: 'CALCULATED',
    },
    {
      label: '  dont définitions d’outils (estimé, à chaque appel)',
      value: a.inputSplit.tools,
      share: pctOf(a.inputSplit.tools, t),
      tag: 'CALCULATED',
    },
    {
      label: '  dont historique / échanges (estimé)',
      value: a.inputSplit.history,
      share: pctOf(a.inputSplit.history, t),
      tag: 'CALCULATED',
    },
    {
      label: '  dont résultats d’outils (estimé)',
      value: a.inputSplit.toolResults,
      share: pctOf(a.inputSplit.toolResults, t),
      tag: 'CALCULATED',
    },
    {
      label: 'Relances / continuations (mesurées)',
      value: a.retryTokens,
      share: pctOf(a.retryTokens, t),
      tag: 'MEASURED',
    },
    {
      label: 'Corrections JEV (mesurées)',
      value: a.correctionTokens,
      share: pctOf(a.correctionTokens, t),
      tag: 'MEASURED',
    },
    {
      label: 'Appels LLM dans les outils (mesurés)',
      value: a.toolTokens,
      share: pctOf(a.toolTokens, t),
      tag: 'MEASURED',
    },
    {
      label: 'JEV (appels distants, mesurés)',
      value: a.jevTokens,
      share: pctOf(a.jevTokens, t),
      tag: 'MEASURED',
    },
    { label: 'QA JEV (local, aucun appel)', value: a.qaTokens, share: 0, tag: 'MEASURED' },
  ];
  const lines: string[] = [];
  lines.push(
    `${a.modelCalls} appel(s) de modèle ; chaque appel renvoie tout le contexte : l’entrée moyenne est de ${Math.round(a.llmIn / Math.max(1, a.modelCalls)).toLocaleString('fr-FR')} tokens par appel.`,
  );
  if (a.modelCalls > 1 && a.firstPromptTokens > 0)
    lines.push(
      `L’entrée est passée de ${a.firstPromptTokens.toLocaleString('fr-FR')} (premier appel) à ${a.lastPromptTokens.toLocaleString('fr-FR')} tokens (dernier appel) : ×${(a.lastPromptTokens / a.firstPromptTokens).toFixed(1)}.`,
    );
  const comp = [
    ['les définitions d’outils', a.inputSplit.tools],
    ['le contexte système', a.inputSplit.system],
    ['l’historique', a.inputSplit.history],
    ['les résultats d’outils', a.inputSplit.toolResults],
    ['la sortie du modèle', a.llmOut],
  ].sort((x, y) => (y[1] as number) - (x[1] as number));
  lines.push(
    `Première source : ${comp[0]![0]} (${Math.round(pctOf(comp[0]![1] as number, t) * 100)} % du total, estimation).`,
  );
  if (a.jevTokens > 0)
    lines.push(
      `JEV lui-même : ${a.jevTokens.toLocaleString('fr-FR')} tokens (${(pctOf(a.jevTokens, t) * 100).toFixed(2)} % du total).`,
    );
  else lines.push('JEV lui-même : 0 token distant (JEV-0 local) — il n’est pas responsable de ce volume.');
  if (a.correctionTokens)
    lines.push(`Corrections demandées par JEV : ${a.correctionTokens.toLocaleString('fr-FR')} tokens.`);
  return {
    title: `Pourquoi cette mission a-t-elle consommé ${t.toLocaleString('fr-FR')} tokens ?`,
    available: true,
    lines,
    rows,
  };
}

/** Cost decomposition of one mission and the answer to "is JEV responsible?". */
export function explainCost(e: JevLogEntry): Diagnosis {
  const a = e.acct;
  const total = a?.totalCost ?? e.cost + e.jevCost;
  if (!a)
    return {
      title: `Décomposition du coût de ${total.toFixed(4)} $`,
      available: false,
      lines: [
        'Mission antérieure à l’instrumentation : coût LLM et coût JEV connus séparément, mais pas la correction ni les outils. Le « coût de la mission » n’est pas « le coût de JEV ».',
      ],
      rows: [
        {
          label: 'Coût LLM (mesuré ou estimé, non distingué)',
          value: e.cost,
          share: pctOf(e.cost, total),
          tag: 'MEASURED',
        },
        {
          label: 'Coût JEV (appels distants)',
          value: e.jevCost,
          share: pctOf(e.jevCost, total),
          tag: 'MEASURED',
        },
      ],
    };
  const rows: Diagnosis['rows'] = [
    {
      label: 'LLM_COST',
      value: a.llmCost,
      share: pctOf(a.llmCost, total),
      tag: a.unmeasuredCostShare > 0.01 ? 'CALCULATED' : 'MEASURED',
    },
    { label: 'JEV_COST', value: a.jevCost, share: pctOf(a.jevCost, total), tag: 'MEASURED' },
    { label: 'QA_COST (QA locale, aucun appel)', value: a.qaCost, share: 0, tag: 'MEASURED' },
    {
      label: 'CORRECTION_COST',
      value: a.correctionCost,
      share: pctOf(a.correctionCost, total),
      tag: 'MEASURED',
    },
    {
      label: 'TOOL_COST (appels LLM dans les outils)',
      value: a.toolCost,
      share: pctOf(a.toolCost, total),
      tag: 'MEASURED',
    },
  ];
  const jevShare = pctOf(a.jevCost + a.correctionCost, total);
  const lines = [
    `TOTAL ${total.toFixed(4)} $ = LLM ${a.llmCost.toFixed(4)} + JEV ${a.jevCost.toFixed(6)} + correction ${a.correctionCost.toFixed(4)} + outils ${a.toolCost.toFixed(4)} + QA 0.`,
    e.jev
      ? a.jevCost + a.correctionCost <= 0
        ? 'JEV est-il responsable de ce coût ? Non : JEV n’a ajouté aucun appel payant (JEV-0 local, aucune correction).'
        : `JEV est-il responsable de ce coût ? Pour ${(jevShare * 100).toFixed(2)} % seulement (appels JEV + corrections qu’il a demandées) ; le reste (${((1 - jevShare) * 100).toFixed(1)} %) est le travail du modèle.`
      : 'Cette mission a été exécutée sans JEV : aucun coût JEV.',
  ];
  if (a.unmeasuredCostShare > 0)
    lines.push(
      `Origine du coût : ${a.costBySource.measured.toFixed(5)} $ renvoyé par le fournisseur, ${a.costBySource.calculated.toFixed(5)} $ calculé (tokens × prix), ${a.costBySource.estimated.toFixed(5)} $ estimé.`,
    );
  lines.push(
    'Une économie ou un surcoût de JEV ne se déduit que d’une comparaison appariée (même tâche, onglet Validation scientifique).',
  );
  return { title: `Décomposition du coût de ${total.toFixed(4)} $`, available: true, lines, rows };
}

// ───────────────────────── technical report ─────────────────────────

export function reportOf(s: Science): string[] {
  const f = (x: number | null | undefined, d = 4) =>
    x === null || x === undefined ? 'NON MESURÉ' : x.toFixed(d);
  const out: string[] = [];
  out.push(`Verdict : ${VERDICT_TEXT[s.verdict]} — ${s.verdictWhy.join(' ; ')}`);
  out.push(
    `Tâches benchmarkées : ${s.tasks} · groupes appariés : ${s.groups} (complets : ${s.completeGroups}) · paires valides : ${s.validPairs} · répétitions : ${s.repetitions}`,
  );
  out.push(`Modèles utilisés : ${s.models.join(', ') || '—'}`);
  out.push(
    `Coût total du benchmark : ${f(s.benchmarkCost)} $ · coût JEV : ${f(s.jevCost, 6)} $ · tokens JEV : ${s.jevTokens}`,
  );
  for (const v of VARIANTS) {
    const d = s.deltas[v];
    const e = d?.economics;
    if (!d || !e) continue;
    out.push(
      `${VARIANT_LABEL[v]} vs OFF (n = ${d.pairs}, ${d.label}) : tokens nets ${e.netTokenSaving === null ? '—' : Math.round(e.netTokenSaving)} / mission, impact net JEV ${e.jevNetTokenImpact === null ? '—' : Math.round(e.jevNetTokenImpact)} ; économie ${f(e.jevSavingsValue, 5)} $ / mission, coût JEV ${f(e.jevGrossCost, 6)} $, valeur nette ${f(e.jevNetValue, 5)} $ ; ${e.roiNote} ; coût / mission réussie ${d.costPerSuccessChange === null ? '—' : `${d.costPerSuccessChange > 0 ? '+' : ''}${Math.round(d.costPerSuccessChange * 100)} %`} ; verdict ${d.judgement}${d.reasons.length ? ` (${d.reasons.join(', ')})` : ''}`,
    );
  }
  for (const v of s.variantsPresent) {
    const x = s.byVariant[v];
    if (!x) continue;
    out.push(
      `${VARIANT_LABEL[v]} : qualité ${x.quality.mean === null ? 'NON MESURÉE' : x.quality.mean.toFixed(1)} · réussite ${x.successRate === null ? '—' : `${Math.round(x.successRate * 100)} %`} · latence moy. ${x.latency.mean === null ? '—' : `${Math.round(x.latency.mean)} ms`} · coût / mission réussie ${f(x.costPerSuccess, 5)} $`,
    );
  }
  out.push(
    `Meilleure stratégie : ${s.bestVariant ? VARIANT_LABEL[s.bestVariant] : 'indéterminée'} · pire : ${s.worstVariant ? VARIANT_LABEL[s.worstVariant] : 'indéterminée'}`,
  );
  const good = s.categories.filter((c) => c.best && c.best !== 'off').map((c) => c.category);
  const bad = s.categories.filter((c) => c.best === 'off').map((c) => c.category);
  out.push(
    `Catégories où JEV est rentable : ${good.join(', ') || 'aucune démontrée'} · où il est contre-productif ou inutile : ${bad.join(', ') || 'aucune démontrée'}`,
  );
  const overheadParts: string[] = [];
  const full = s.byVariant.full ?? s.byVariant.live ?? s.byVariant.pre;
  if (full) {
    overheadParts.push(
      `appels JEV ${f(full.jevCost, 6)} $`,
      `corrections ${full.correctionTokens} tokens`,
      `relances ${full.retryTokens} tokens`,
      `décision JEV ${Math.round(full.decisionMs)} ms cumulées`,
    );
  }
  out.push(`Principales sources d’overhead : ${overheadParts.join(' · ') || '—'}`);
  out.push(`Anomalies : ${s.anomalies.join(' | ') || 'aucune'}`);
  out.push(`Recommandation : ${s.recommendation}`);
  out.push(`Limitations : ${s.limitations.join(' | ')}`);
  return out;
}

// ───────────────────────── task categories & adaptive policy ─────────────────────────

export const CATEGORY_LABEL: Record<string, string> = {
  chat: 'chat simple',
  writing: 'writing',
  code: 'code',
  data: 'data analysis',
  research: 'research',
  browser: 'browser',
  document: 'document',
  excel: 'Excel',
  reasoning: 'reasoning',
  agent: 'complex agent task',
  long_context: 'long context',
  tool_heavy: 'tool-heavy',
};

/** Category of a request (deterministic). `tool_heavy` is only assigned by the benchmark, never guessed. */
export function categoryOf(o: {
  type: string;
  text: string;
  attachments: string[];
  difficulty: number;
  mission: boolean;
  contextChars?: number;
}): string {
  if (o.text.length > 8000 || (o.contextChars ?? 0) > 30_000) return 'long_context';
  if (o.mission) return 'agent';
  const sheet = /\.(xlsx?|csv)\b|\bexcel\b/i.test(`${o.text} ${o.attachments.join(' ')}`);
  switch (o.type) {
    case 'browser':
      return 'browser';
    case 'research':
      return 'research';
    case 'document':
    case 'vision':
      return sheet ? 'excel' : 'document';
    case 'data':
      return sheet ? 'excel' : 'data';
    case 'code':
    case 'review':
      return 'code';
    case 'writing':
      return 'writing';
    default:
      return o.difficulty >= 0.5 ? 'reasoning' : 'chat';
  }
}

/**
 * Adaptive policy from the measurements: the JEV level to use for a category, or null when the
 * data are insufficient (the caller then keeps its default). Never based on an assumption.
 */
export function policyFor(sci: Science, category: string): { variant: Variant; why: string } | null {
  const c = sci.categories.find((x) => x.category === category);
  if (!c || c.label !== 'MEASURED' || !c.best) return null;
  return {
    variant: c.best,
    why: `${CATEGORY_LABEL[category] ?? category} → ${VARIANT_LABEL[c.best]} (${c.bestReason})`,
  };
}
