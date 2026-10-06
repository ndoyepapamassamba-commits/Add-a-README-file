// DETERMINISTIC STATISTICS for the Champion / Challenger lab: descriptive statistics, binomial (Wilson) and mean
// (Student t) confidence intervals, Welch / paired differences, Newcombe difference of proportions and Cohen's d.
// Pure JavaScript, no randomness: the same data always gives the same intervals. No artificial confidence: below the
// sample gates the label is INSUFFICIENT_SAMPLE, never HIGH / MEDIUM.
import type { JevLogEntry } from '../metrics';
import { qualityOfEntry } from '../fabric/memory';
import { freeOutcome } from './registry';
import { isCriticalError } from './supremacy';
import { trueTotalCost } from './metrics';

export { mean, median, stdDev, percentile, zOf, tCritical, wilson, meanCI, type Interval } from './intervals';
import { mean, median, stdDev, percentile, wilson, meanCI, tCritical, type Interval } from './intervals';

export function welchDiff(a: number[], b: number[], conf = 0.95): Interval | null {
  if (a.length < 2 || b.length < 2) return null;
  const va = stdDev(a)! ** 2 / a.length;
  const vb = stdDev(b)! ** 2 / b.length;
  const se = Math.sqrt(va + vb);
  const diff = mean(b)! - mean(a)!;
  if (se === 0) return { value: diff, lo: diff, hi: diff, n: Math.min(a.length, b.length) };
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  const h = tCritical(df, conf) * se;
  return { value: diff, lo: diff - h, hi: diff + h, n: Math.min(a.length, b.length) };
}
/** Paired difference (b − a per pair) with its Student t interval. */
export function pairedDiff(pairs: { a: number; b: number }[], conf = 0.95): Interval | null {
  return meanCI(
    pairs.map((p) => p.b - p.a),
    conf,
  );
}
/** Newcombe hybrid-score interval for the difference of two independent proportions p2 − p1. */
export function newcombeDiff(k1: number, n1: number, k2: number, n2: number, conf = 0.95): Interval | null {
  const w1 = wilson(k1, n1, conf);
  const w2 = wilson(k2, n2, conf);
  if (!w1 || !w2) return null;
  const d = w2.value - w1.value;
  return {
    value: d,
    lo: d - Math.sqrt((w2.value - w2.lo) ** 2 + (w1.hi - w1.value) ** 2),
    hi: d + Math.sqrt((w2.hi - w2.value) ** 2 + (w1.value - w1.lo) ** 2),
    n: Math.min(n1, n2),
  };
}
/** Cohen's d (pooled sd) of b relative to a. */
export function cohenD(a: number[], b: number[]): number | null {
  if (a.length < 2 || b.length < 2) return null;
  const sa = stdDev(a)!;
  const sb = stdDev(b)!;
  const sp = Math.sqrt(((a.length - 1) * sa ** 2 + (b.length - 1) * sb ** 2) / (a.length + b.length - 2));
  return sp === 0 ? 0 : (mean(b)! - mean(a)!) / sp;
}
export const effectLabel = (d: number | null): 'N/A' | 'negligible' | 'small' | 'medium' | 'large' =>
  d === null
    ? 'N/A'
    : Math.abs(d) < 0.2
      ? 'negligible'
      : Math.abs(d) < 0.5
        ? 'small'
        : Math.abs(d) < 0.8
          ? 'medium'
          : 'large';

// ───────────────────────── sample gates ─────────────────────────

export type ConfidenceLabel = 'INSUFFICIENT_SAMPLE' | 'INDICATIVE' | 'ROBUST' | 'HIGH_CONFIDENCE';
export interface SampleGates {
  /** n below this: INSUFFICIENT. */
  insufficient: number;
  indicative: number;
  robust: number;
}
export const DEFAULT_GATES: SampleGates = { insufficient: 5, indicative: 20, robust: 50 };
/** HIGH tasks need 1.5× the data, CRITICAL 2×. */
export const gatesFor = (
  risk: 'low' | 'normal' | 'high' | 'critical',
  g: SampleGates = DEFAULT_GATES,
): SampleGates => {
  const k = risk === 'critical' ? 2 : risk === 'high' ? 1.5 : 1;
  return {
    insufficient: Math.ceil(g.insufficient * k),
    indicative: Math.ceil(g.indicative * k),
    robust: Math.ceil(g.robust * k),
  };
};
/** n < 5 INSUFFICIENT · 5–19 INDICATIVE · 20–49 ROBUST · ≥ 50 HIGH CONFIDENCE (scaled for HIGH / CRITICAL). */
export const confidenceOf = (n: number, g: SampleGates = DEFAULT_GATES): ConfidenceLabel =>
  n < g.insufficient
    ? 'INSUFFICIENT_SAMPLE'
    : n < g.indicative
      ? 'INDICATIVE'
      : n < g.robust
        ? 'ROBUST'
        : 'HIGH_CONFIDENCE';

// ───────────────────────── arm statistics ─────────────────────────

export interface ArmStats {
  n: number;
  successRate: number | null;
  successCI: Interval | null;
  qualityMean: number | null;
  qualityMedian: number | null;
  qualityStdDev: number | null;
  qualityP25: number | null;
  qualityP75: number | null;
  qualityCI: Interval | null;
  criticalErrorRate: number | null;
  fallbackRate: number | null;
  latencyMean: number | null;
  latencyP95: number | null;
  modelCost: number | null;
  totalMissionCost: number | null;
  teacherCost: number | null;
  jevCost: number | null;
  toolCost: number | null;
  retryCost: number | null;
  retryRate: number | null;
  confidence: ConfidenceLabel;
}

/** All the figures of an arm from its real runs. Handed-over missions count as failures of the free model. */
export function armStats(runsRaw: JevLogEntry[], o: { conf?: number; gates?: SampleGates } = {}): ArmStats {
  const conf = o.conf ?? 0.95;
  const runs = runsRaw.map(freeOutcome);
  const n = runs.length;
  const judged = runs.filter((e) => e.success !== null);
  const ok = judged.filter((e) => e.success).length;
  const q = runs.map(qualityOfEntry).filter((x): x is number => x !== null);
  const lat = runs.map((e) => e.latencyMs);
  const costs = runsRaw.map(trueTotalCost);
  const m = (f: (c: ReturnType<typeof trueTotalCost>) => number) => mean(costs.map(f));
  return {
    n,
    successRate: judged.length ? ok / judged.length : null,
    successCI: wilson(ok, judged.length, conf),
    qualityMean: mean(q),
    qualityMedian: median(q),
    qualityStdDev: stdDev(q),
    qualityP25: percentile(q, 0.25),
    qualityP75: percentile(q, 0.75),
    qualityCI: meanCI(q, conf),
    criticalErrorRate: n ? runs.filter(isCriticalError).length / n : null,
    fallbackRate: n ? runsRaw.filter((e) => (e.apprentice?.path.length ?? 1) > 1).length / n : null,
    latencyMean: mean(lat),
    latencyP95: percentile(lat, 0.95),
    modelCost: m((c) => c.model),
    totalMissionCost: m((c) => c.total),
    teacherCost: m((c) => c.teacher),
    jevCost: m((c) => c.jev),
    toolCost: m((c) => c.tools),
    retryCost: m((c) => c.retries),
    retryRate: n ? runsRaw.filter((e) => e.retries > 0 || e.corrections > 0).length / n : null,
    confidence: confidenceOf(n, o.gates),
  };
}
