// Benchmark Fusion Engine. Every piece of evidence about a model keeps its
// source, date, benchmark, score, confidence, URL and freshness; old evidence
// loses weight (half-life), sources are weighted, and disagreements between
// sources are flagged instead of averaged away. Four kinds are kept apart:
// FACTS (catalog), BENCHMARKS (external measurements), MASSAMBA (your own
// missions and auto-benchmarks) and INFERENCES (estimates made here).
import type { ModelInfo } from '@shared/types';
import { intelData, intelMax, intelligenceInfo, type IntelMetric } from '../llm/modelIntel';
import { blendedPrice, type LeaderboardMap, type TaskType } from '../llm/routing';
import type { BenchResult } from '../agent/intelligence';

export type EvidenceKind = 'fact' | 'benchmark' | 'massamba' | 'inference';
export type Dimension = IntelMetric | 'success' | 'price' | 'context' | 'reasoning' | 'tool_use';

export interface EvidenceRecord {
  kind: EvidenceKind;
  source: string;
  date: string;
  model: string;
  benchmark: string;
  dimension: Dimension;
  /** Raw value as published. */
  score: number;
  /** Normalised 0–100 (relative to the best known value) when comparable. */
  normalized: number | null;
  /** 0–1: how much the source is trusted for this measure. */
  confidence: number;
  url?: string;
  /** 0–1 freshness weight (1 = today). */
  freshness: number;
  /** Sample size for MASSAMBA measures. */
  n?: number;
  note?: string;
}

/** Imported external benchmark (user JSON): one score on a 0–100 scale. */
export interface ExternalBenchmark {
  source: string;
  date: string;
  model: string;
  benchmark: string;
  dimension: Dimension;
  score: number;
  scale?: number;
  url?: string;
  confidence?: number;
}

export const HALF_LIFE_DAYS = 180;
export function freshness(dateIso: string, now = Date.now(), halfLife = HALF_LIFE_DAYS): number {
  const t = Date.parse(dateIso);
  if (!Number.isFinite(t)) return 0.5;
  const days = Math.max(0, (now - t) / 86_400_000);
  return Math.pow(0.5, days / halfLife);
}

/** All evidence known about a model, from every source. */
export function modelEvidence(
  m: ModelInfo,
  o: {
    board?: LeaderboardMap;
    bench?: BenchResult[];
    external?: ExternalBenchmark[];
    type?: TaskType;
    now?: number;
  } = {},
): EvidenceRecord[] {
  const now = o.now ?? Date.now();
  const out: EvidenceRecord[] = [];
  const today = new Date(now).toISOString();
  // FACTS — OpenRouter catalog (live).
  const price = blendedPrice(m);
  if (price !== null)
    out.push({
      kind: 'fact',
      source: 'OpenRouter /api/v1/models',
      date: today,
      model: m.id,
      benchmark: 'prix mixte 12:1 ($/M)',
      dimension: 'price',
      score: price,
      normalized: null,
      confidence: 1,
      url: `https://openrouter.ai/${m.id}`,
      freshness: 1,
      note: `entrée ${m.inputPrice} $/M · sortie ${m.outputPrice} $/M`,
    });
  out.push({
    kind: 'fact',
    source: 'OpenRouter /api/v1/models',
    date: today,
    model: m.id,
    benchmark: 'contexte (tokens)',
    dimension: 'context',
    score: m.contextLength,
    normalized: null,
    confidence: 1,
    freshness: 1,
  });
  out.push({
    kind: 'fact',
    source: 'OpenRouter /api/v1/models',
    date: today,
    model: m.id,
    benchmark: 'appel d’outils',
    dimension: 'tool_use',
    score: m.capabilities.tools ? 1 : 0,
    normalized: m.capabilities.tools ? 100 : 0,
    confidence: 1,
    freshness: 1,
  });
  out.push({
    kind: 'fact',
    source: 'OpenRouter /api/v1/models',
    date: today,
    model: m.id,
    benchmark: 'raisonnement configurable',
    dimension: 'reasoning',
    score: m.capabilities.reasoning ? 1 : 0,
    normalized: null,
    confidence: 1,
    freshness: 1,
  });
  // BENCHMARKS — Artificial Analysis indices published on OpenRouter.
  const info = intelligenceInfo(m.id, m.slug);
  const d = intelData();
  if (info) {
    const f = freshness(d.fetchedAt, now);
    const conf = info.estimated ? 0.55 : 0.9;
    const push = (dim: IntelMetric, v: number | null, label: string) =>
      v !== null &&
      out.push({
        kind: info.estimated ? 'inference' : 'benchmark',
        source: d.source,
        date: d.fetchedAt,
        model: m.id,
        benchmark: `${label} (${info.name})`,
        dimension: dim,
        score: v,
        normalized: (v / intelMax(dim)) * 100,
        confidence: conf,
        url: d.url,
        freshness: f,
        note: info.estimated
          ? 'estimé depuis une variante proche du même modèle (−1,5)'
          : `effort ${info.effort}`,
      });
    push('intelligence', info.score, 'Intelligence Index');
    push('coding', info.coding, 'Coding Index');
    push('agentic', info.agentic, 'Agentic Index');
    if (info.agentic === null)
      out.push({
        kind: 'inference',
        source: 'MASSAMBA',
        date: d.fetchedAt,
        model: m.id,
        benchmark: 'Agentique estimé depuis l’intelligence',
        dimension: 'agentic',
        score: info.score,
        normalized: (info.score / intelMax('intelligence')) * 100,
        confidence: 0.35,
        freshness: f,
        note: 'indice agentique non mesuré',
      });
  }
  // EXTERNAL — imported public benchmarks.
  for (const e of o.external ?? [])
    if (e.model === m.id || e.model === m.slug)
      out.push({
        kind: 'benchmark',
        source: e.source,
        date: e.date,
        model: m.id,
        benchmark: e.benchmark,
        dimension: e.dimension,
        score: e.score,
        normalized: (e.score / (e.scale ?? 100)) * 100,
        confidence: e.confidence ?? 0.7,
        url: e.url,
        freshness: freshness(e.date, now),
      });
  // MASSAMBA — your missions (per task type when known) and auto-benchmarks.
  const board = o.board ?? {};
  const rec = (o.type && board[`${o.type}|${m.id}`]) || board[m.id];
  if (rec && rec.won + rec.lost > 0) {
    const n = rec.won + rec.lost;
    out.push({
      kind: 'massamba',
      source: 'Missions MASSAMBA',
      date: today,
      model: m.id,
      benchmark: `taux de réussite${o.type && board[`${o.type}|${m.id}`] ? ` (${o.type})` : ''}`,
      dimension: 'success',
      score: rec.won / n,
      normalized: (rec.won / n) * 100,
      confidence: n / (n + 5),
      freshness: 1,
      n,
    });
  }
  for (const b of (o.bench ?? []).filter((x) => x.model === m.id).slice(-3))
    out.push({
      kind: 'massamba',
      source: 'Auto-benchmark MASSAMBA',
      date: new Date(b.at).toISOString(),
      model: m.id,
      benchmark: `${b.passed}/${b.total} tâches`,
      dimension: 'success',
      score: b.passed / Math.max(1, b.total),
      normalized: (b.passed / Math.max(1, b.total)) * 100,
      confidence: Math.min(0.8, b.total / 10),
      freshness: freshness(new Date(b.at).toISOString(), now),
      n: b.total,
    });
  return out;
}

export interface Fused {
  dimension: Dimension;
  /** Weighted value 0–100, null when nothing comparable is known. */
  value: number | null;
  /** 0–1 overall confidence (weights, freshness, agreement). */
  confidence: number;
  sources: number;
  contradictory: boolean;
  spread: number;
}

/** Fuses the comparable records of one dimension (weights = confidence × freshness). */
export function fuse(records: EvidenceRecord[], dimension: Dimension): Fused {
  const rs = records.filter((r) => r.dimension === dimension && r.normalized !== null);
  if (!rs.length)
    return { dimension, value: null, confidence: 0, sources: 0, contradictory: false, spread: 0 };
  let w = 0;
  let s = 0;
  for (const r of rs) {
    const wi = r.confidence * r.freshness;
    w += wi;
    s += wi * r.normalized!;
  }
  const value = w > 0 ? s / w : rs[0]!.normalized!;
  // Disagreement between strong sources (≥ 20 points) is reported, not hidden.
  const strong = rs.filter((r) => r.confidence * r.freshness >= 0.3).map((r) => r.normalized!);
  const spread = strong.length > 1 ? Math.max(...strong) - Math.min(...strong) : 0;
  const contradictory = spread >= 20;
  const confidence = Math.min(1, w / rs.length) * (contradictory ? 0.7 : 1);
  return { dimension, value, confidence, sources: rs.length, contradictory, spread };
}

/**
 * Contradiction between what benchmarks say and what your missions show:
 * a model rated in the top tier that keeps failing your missions (or the opposite).
 */
export function benchmarkVsReality(records: EvidenceRecord[]): string | null {
  const bench = records.find((r) => r.kind === 'benchmark' && r.dimension === 'intelligence');
  const real = records.find((r) => r.kind === 'massamba' && r.dimension === 'success' && (r.n ?? 0) >= 3);
  if (!bench || !real || bench.normalized === null || real.normalized === null) return null;
  if (bench.normalized >= 85 && real.normalized < 50)
    return `benchmarks élevés (${bench.normalized.toFixed(0)}/100) mais ${real.normalized.toFixed(0)} % de réussite sur vos ${real.n} missions`;
  if (bench.normalized < 65 && real.normalized >= 85)
    return `benchmarks modestes (${bench.normalized.toFixed(0)}/100) mais ${real.normalized.toFixed(0)} % de réussite sur vos ${real.n} missions`;
  return null;
}

export const KIND_LABEL: Record<EvidenceKind, string> = {
  fact: 'FAIT',
  benchmark: 'BENCHMARK',
  massamba: 'MASSAMBA',
  inference: 'INFÉRENCE',
};
