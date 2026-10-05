// JEV APPRENTICE REGISTRY — one dynamic profile per free model, built ONLY from observed runs (JEV_LOG).
// Nothing is invented: a figure without data is null ("N/A"), a small sample is flagged INSUFFICIENT SAMPLE.
import type { JevLogEntry } from '../metrics';
import { qualityOfEntry } from '../fabric/memory';
import {
  MASSAMBA_MODEL_EXPERTISE_MATRIX,
  dimsOf,
  type Dimension,
  type ExpertiseCell,
} from '../fabric/learning';
import type { FreeModel } from '../fabric/council';
import { domainOf } from './dna';
import type { Confidence, JevStatus } from './types';

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const rate = (es: JevLogEntry[]) => {
  const j = es.filter((e) => e.success !== null);
  return j.length ? j.filter((e) => e.success).length / j.length : null;
};
const totalCost = (e: JevLogEntry) => e.acct?.totalCost ?? e.cost + e.jevCost;
const RL = /429|rate.?limit|quota|too many|surcharg/i;

export const isFreeId = (id: string) => /:free$/.test(id);
export const SAMPLE_MIN = 5;

/**
 * What the FREE model itself achieved. When the mission was handed to another model (quality gate failed, rate limit…),
 * the final success belongs to that other model: the free model counts as a failure and its quality is not credited.
 */
export function freeOutcome(e: JevLogEntry): JevLogEntry {
  const a = e.apprentice;
  if (!a || !a.active || a.path.length < 2 || a.arm) return e;
  return { ...e, success: false, quality: null, qualityMeasured: null };
}
export const confidenceLevel = (n: number, successRate: number | null): Confidence =>
  n < 3 || successRate === null ? 'LOW' : n < 8 || successRate < 0.8 ? 'MEDIUM' : 'HIGH';

export interface FamilyStat {
  family: string;
  n: number;
  successRate: number | null;
  quality: number | null;
  /** Mean TOTAL mission cost (model + JEV + teacher + tools). */
  totalCost: number | null;
  latencyMs: number | null;
  tokens: number | null;
  adaptedN: number;
  adaptedSuccess: number | null;
  /** Success of the NON-adapted runs, to see what the adaptation brought. */
  plainSuccess: number | null;
}

export interface Degradation {
  degraded: boolean;
  /** Multiplier applied to the model's rank (1 = none). */
  factor: number;
  reasons: string[];
}

export interface FreeHealth {
  /** 0–100 or null when under SAMPLE_MIN. */
  score: number | null;
  parts: { key: string; label: string; value: number | null }[];
}

export interface ApprenticeProfile {
  model: string;
  provider: string;
  free: true;
  jevStatus: JevStatus;
  n: number;
  successRate: number | null;
  quality: number | null;
  modelCost: number;
  totalCost: number | null;
  latencyMs: number | null;
  tokens: number | null;
  failureRate: number | null;
  confidence: Confidence;
  sampleLabel: 'MEASURED' | 'INSUFFICIENT SAMPLE';
  lastValidated: number | null;
  expertise: Partial<Record<Dimension, ExpertiseCell>>;
  families: FamilyStat[];
  rateLimited: number;
  degradation: Degradation;
  health: FreeHealth;
  /** Teacher → Apprentice transfers recorded (skill names). */
  transferred: string[];
}

export function familyOf(e: JevLogEntry): string {
  return e.apprentice?.family ?? `${e.task}:${domainOf(e.instruction ?? e.mission, e.task)}`;
}

function familyStats(es: JevLogEntry[]): FamilyStat[] {
  const by = new Map<string, JevLogEntry[]>();
  for (const e of es) by.set(familyOf(e), [...(by.get(familyOf(e)) ?? []), e]);
  return [...by].map(([family, xs]) => {
    const ad = xs.filter((e) => e.apprentice?.adapted);
    const plain = xs.filter((e) => !e.apprentice?.adapted);
    return {
      family,
      n: xs.length,
      successRate: rate(xs),
      quality: mean(xs.map(qualityOfEntry).filter((x): x is number => x !== null)),
      totalCost: mean(xs.map(totalCost)),
      latencyMs: mean(xs.map((e) => e.latencyMs)),
      tokens: mean(xs.map((e) => e.acct?.totalTokens ?? e.tokensIn + e.tokensOut)),
      adaptedN: ad.length,
      adaptedSuccess: rate(ad),
      plainSuccess: rate(plain),
    };
  });
}

/** Recent behaviour vs history: a free model can silently get worse (rate limits, slower, less accurate). */
export function detectDegradation(es: JevLogEntry[]): Degradation {
  const xs = [...es].sort((a, b) => a.at - b.at);
  if (xs.length < 8) return { degraded: false, factor: 1, reasons: [] };
  const k = Math.max(3, Math.floor(xs.length / 3));
  const recent = xs.slice(-k);
  const hist = xs.slice(0, -k);
  const reasons: string[] = [];
  const rs = rate(recent);
  const hs = rate(hist);
  if (rs !== null && hs !== null && rs < hs - 0.2)
    reasons.push(`réussite récente ${Math.round(rs * 100)} % < historique ${Math.round(hs * 100)} %`);
  const rq = mean(recent.map(qualityOfEntry).filter((x): x is number => x !== null));
  const hq = mean(hist.map(qualityOfEntry).filter((x): x is number => x !== null));
  if (rq !== null && hq !== null && rq < hq - 10)
    reasons.push(`qualité récente ${rq.toFixed(0)} < historique ${hq.toFixed(0)}`);
  const rl = (a: JevLogEntry[]) => a.filter((e) => e.failureNote && RL.test(e.failureNote)).length / a.length;
  if (rl(recent) > 0.3 && rl(recent) > rl(hist) + 0.15)
    reasons.push(`limites de débit récentes ${Math.round(rl(recent) * 100)} %`);
  const rlat = mean(recent.map((e) => e.latencyMs));
  const hlat = mean(hist.map((e) => e.latencyMs));
  if (rlat !== null && hlat !== null && hlat > 0 && rlat > hlat * 2)
    reasons.push(`latence récente ×${(rlat / hlat).toFixed(1)}`);
  return {
    degraded: reasons.length > 0,
    factor: reasons.length ? Math.max(0.4, 1 - 0.2 * reasons.length) : 1,
    reasons,
  };
}

export function freeHealth(es: JevLogEntry[]): FreeHealth {
  const n = es.length;
  if (n < SAMPLE_MIN)
    return {
      score: null,
      parts: [
        'availability',
        'latency',
        'success',
        'quality',
        'rate-limit stability',
        'tool reliability',
        'structured output',
      ].map((k) => ({ key: k, label: k, value: null })),
    };
  const errs = es.filter((e) => e.failureNote);
  const toolCalls = es.reduce((a, e) => a + (e.toolCallCount ?? 0), 0);
  const toolErr = es.reduce((a, e) => a + (e.toolErrorCount ?? 0), 0);
  const fmt = es
    .map((e) => e.qualityVector?.instruction_following)
    .filter((x): x is number => typeof x === 'number');
  const q = es.map(qualityOfEntry).filter((x): x is number => x !== null);
  const lat = mean(es.map((e) => e.latencyMs));
  const parts = [
    { key: 'availability', label: 'Availability', value: 1 - errs.length / n },
    { key: 'latency', label: 'Latency', value: lat === null ? null : Math.max(0, 1 - lat / 60_000) },
    { key: 'success', label: 'Success', value: rate(es) },
    { key: 'quality', label: 'Quality', value: q.length ? (mean(q) ?? 0) / 100 : null },
    {
      key: 'ratelimit',
      label: 'Rate-limit stability',
      value: 1 - errs.filter((e) => RL.test(e.failureNote!)).length / n,
    },
    { key: 'tools', label: 'Tool reliability', value: toolCalls ? 1 - toolErr / toolCalls : null },
    { key: 'structured', label: 'Structured output', value: fmt.length ? (mean(fmt) ?? 0) : null },
  ];
  const have = parts.filter((p) => p.value !== null) as { value: number }[];
  return { score: Math.round((mean(have.map((p) => p.value)) ?? 0) * 100), parts };
}

export function statusOf(
  es: JevLogEntry[],
  families: FamilyStat[],
  validated: Set<string>,
  model: string,
): JevStatus {
  if ([...validated].some((v) => v.startsWith(`${model}|`))) return 'VALIDATED';
  const spec = families.some((f) => f.adaptedN >= 5 && (f.adaptedSuccess ?? 0) >= 0.8);
  if (spec) return 'SPECIALIST';
  return es.some((e) => e.apprentice?.adapted) ? 'ADAPTED' : 'FREE';
}

export interface RegistryOptions {
  /** Profile versions currently VALIDATED, as "model|family". */
  validated?: Set<string>;
  /** Extra free ids (e.g. a model the user declared free). */
  extraFree?: string[];
}

/** Profiles of every free model seen in the catalog or in the log. */
export function buildApprenticeRegistry(
  log: JevLogEntry[],
  pool: FreeModel[],
  o: RegistryOptions = {},
): ApprenticeProfile[] {
  const ids = new Set([...pool.map((p) => p.id), ...(o.extraFree ?? [])]);
  const runs = log
    .filter(
      (e) =>
        e.model &&
        e.model !== 'JEV-0' &&
        (ids.has(e.model) || isFreeId(e.model)) &&
        e.apprentice?.arm !== 'paid',
    )
    .map(freeOutcome);
  const matrix = MASSAMBA_MODEL_EXPERTISE_MATRIX(runs);
  const all = new Set([...ids, ...runs.map((e) => e.model)]);
  return [...all].map((model) => {
    const es = runs.filter((e) => e.model === model);
    const fam = familyStats(es);
    const successRate = rate(es);
    const q = es.map(qualityOfEntry).filter((x): x is number => x !== null);
    const errs = es.filter((e) => e.failureNote);
    const meta = pool.find((p) => p.id === model);
    return {
      model,
      provider: meta?.provider ?? model.split('/')[0] ?? '?',
      free: true as const,
      jevStatus: statusOf(es, fam, o.validated ?? new Set(), model),
      n: es.length,
      successRate,
      quality: mean(q),
      modelCost: 0,
      totalCost: mean(es.map(totalCost)),
      latencyMs: mean(es.map((e) => e.latencyMs)),
      tokens: mean(es.map((e) => e.acct?.totalTokens ?? e.tokensIn + e.tokensOut)),
      failureRate: es.length ? errs.length / es.length : null,
      confidence: confidenceLevel(es.length, successRate),
      sampleLabel: es.length >= SAMPLE_MIN ? ('MEASURED' as const) : ('INSUFFICIENT SAMPLE' as const),
      lastValidated: es.length ? Math.max(...es.map((e) => e.at)) : null,
      expertise: matrix[model] ?? {},
      families: fam,
      rateLimited: errs.filter((e) => RL.test(e.failureNote!)).length,
      degradation: detectDegradation(es),
      health: freeHealth(es),
      transferred: [
        ...new Set(es.flatMap((e) => (e.apprentice?.teacher && e.success ? e.apprentice.skills : []))),
      ],
    };
  });
}

/** What a model is worth on THIS task family (family stats first, then the dominant dimension). */
export function familyEvidence(p: ApprenticeProfile, family: string, dims: Dimension[]) {
  const f = p.families.find((x) => x.family === family);
  if (f && f.n > 0) return { n: f.n, success: f.successRate, quality: f.quality, source: 'family' as const };
  const cells = dims.map((d) => p.expertise[d]).filter((c): c is ExpertiseCell => Boolean(c && c.n > 0));
  if (cells.length) {
    const n = cells.reduce((a, c) => a + c.n, 0);
    const w = (g: (c: ExpertiseCell) => number | null) => {
      const v = cells.filter((c) => g(c) !== null);
      return v.length ? v.reduce((a, c) => a + g(c)! * c.n, 0) / v.reduce((a, c) => a + c.n, 0) : null;
    };
    return {
      n,
      success: w((c) => c.successRate),
      quality: w((c) => c.quality),
      source: 'dimension' as const,
    };
  }
  return { n: 0, success: null, quality: null, source: 'none' as const };
}

/** "Cette expertise est-elle mesurée ?" — dimension matrix of a profile as display rows. */
export const expertiseRows = (p: ApprenticeProfile) =>
  (Object.entries(p.expertise) as [Dimension, ExpertiseCell][])
    .filter(([, c]) => c.n > 0)
    .sort((a, b) => b[1].n - a[1].n)
    .map(([d, c]) => ({
      dimension: d,
      n: c.n,
      successRate: c.successRate,
      quality: c.quality,
      label: c.n >= SAMPLE_MIN ? 'MEASURED' : 'INSUFFICIENT SAMPLE',
    }));

export { dimsOf };
