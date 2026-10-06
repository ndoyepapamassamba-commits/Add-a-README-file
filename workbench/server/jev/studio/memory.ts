// Production Memory + audiovisual Champion/Challenger. Same principles as the existing CHAMPION SCIENCE LAB:
// a single success never becomes a rule, and « best » is never claimed on an insufficient sample.
import { wilson, meanCI, mean, type Interval } from '../apprentice/intervals';
import { confidenceOf, type ConfidenceLabel } from '../apprentice/stats';

export type MemKind = 'image' | 'video' | 'speech' | 'music' | 'text';
export interface ProdRecord {
  id: string;
  at: number;
  projectId: string;
  sceneId?: string;
  kind: MemKind;
  /** Free-form task family: 2D-REDRAW, CHARACTER-CONSISTENCY, FRENCH, WOLOF, I2V-TALKING… */
  task: string;
  style: string;
  /** Output contract / aspect: 9:16, mp3… */
  contract: string;
  risk: 'low' | 'normal' | 'high';
  model: string;
  success: boolean;
  /** 0–100 from a judge, or null when nobody measured it. */
  quality: number | null;
  cost: number | null;
  latencyMs: number | null;
  regenerated: boolean;
  fallback: boolean;
  errorClass?: string;
  /** Prompt pattern (Prompt Genome version) used. */
  prompt?: string;
  /** Spend that taught a durable strategy (Teacher). */
  learning?: boolean;
  /** Simulated records are NEVER stored here (kept for the type guard). */
  simulated?: false;
}
export const comboKey = (r: Pick<ProdRecord, 'kind' | 'task' | 'style' | 'risk' | 'contract'>) =>
  `${r.kind.toUpperCase()} / ${r.task} / ${r.style} / ${r.risk} / ${r.contract}`;

export interface ModelRow {
  model: string;
  n: number;
  success: Interval | null;
  quality: Interval | null;
  qualityN: number;
  cost: number | null;
  latencyMs: number | null;
  recentSuccess: number | null;
  confidence: ConfidenceLabel;
}
export interface ComboTable {
  key: string;
  rows: ModelRow[];
  champion: string | null;
  challenger: string | null;
  decision: string;
}
export const MIN_CHAMPION_N = 20;
export const MIN_CHALLENGER_N = 5;

export function modelRow(rs: ProdRecord[], model: string): ModelRow {
  const n = rs.length;
  const q = rs.map((r) => r.quality).filter((x): x is number => typeof x === 'number');
  const sorted = [...rs].sort((a, b) => a.at - b.at);
  const recent = sorted.slice(-10);
  return {
    model,
    n,
    success: wilson(rs.filter((r) => r.success).length, n),
    quality: q.length >= 3 ? meanCI(q) : null,
    qualityN: q.length,
    cost: mean(rs.map((r) => r.cost).filter((x): x is number => typeof x === 'number')),
    latencyMs: mean(rs.map((r) => r.latencyMs).filter((x): x is number => typeof x === 'number')),
    recentSuccess: recent.length >= 5 ? recent.filter((r) => r.success).length / recent.length : null,
    confidence: confidenceOf(n),
  };
}
/** Champion only after a sufficient sample AND a success interval whose LOWER bound is high; otherwise « données insuffisantes ». */
export function championTable(records: ProdRecord[]): ComboTable[] {
  const by = new Map<string, ProdRecord[]>();
  for (const r of records) by.set(comboKey(r), [...(by.get(comboKey(r)) ?? []), r]);
  return [...by].map(([key, rs]) => {
    const models = [...new Set(rs.map((r) => r.model))];
    const rows = models
      .map((m) =>
        modelRow(
          rs.filter((r) => r.model === m),
          m,
        ),
      )
      .sort((a, b) => b.n - a.n);
    const eligible = rows.filter(
      (r) => r.n >= MIN_CHAMPION_N && (r.success?.lo ?? 0) >= 0.7 && (r.recentSuccess ?? 1) >= 0.6,
    );
    const champ =
      [...eligible].sort(
        (a, b) => b.success!.lo - a.success!.lo || (a.cost ?? Infinity) - (b.cost ?? Infinity),
      )[0] ?? null;
    const chall =
      rows
        .filter((r) => r.n >= MIN_CHALLENGER_N && r !== champ)
        .sort((a, b) => (b.success?.lo ?? 0) - (a.success?.lo ?? 0))[0] ?? null;
    const decision = champ
      ? `CHAMPION ${champ.model} (n=${champ.n}, réussite ≥ ${(champ.success!.lo * 100).toFixed(0)} % à 95 %)`
      : rows.some((r) => r.n >= MIN_CHALLENGER_N)
        ? `pas de champion : échantillon insuffisant (n < ${MIN_CHAMPION_N}) ou réussite non démontrée`
        : 'INSUFFICIENT SAMPLE';
    return { key, rows, champion: champ?.model ?? null, challenger: chall?.model ?? null, decision };
  });
}

export interface Pattern {
  prompt: string;
  n: number;
  success: Interval | null;
  /** A pattern becomes a RULE only after repeated, measured successes. */
  isRule: boolean;
}
export function promptPatterns(records: ProdRecord[], minN = 5): Pattern[] {
  const by = new Map<string, ProdRecord[]>();
  for (const r of records) if (r.prompt) by.set(r.prompt, [...(by.get(r.prompt) ?? []), r]);
  return [...by].map(([prompt, rs]) => {
    const s = wilson(rs.filter((r) => r.success).length, rs.length);
    return { prompt, n: rs.length, success: s, isRule: rs.length >= minN && (s?.lo ?? 0) >= 0.5 };
  });
}
/** Learning hints for the next story / prompts: only rules, never isolated successes. */
export function hints(records: ProdRecord[]): string[] {
  const out: string[] = [];
  for (const t of championTable(records)) if (t.champion) out.push(`${t.key} : ${t.champion}`);
  for (const p of promptPatterns(records))
    if (p.isRule) out.push(`motif de prompt ${p.prompt} : fiable (n=${p.n})`);
  return out.slice(0, 8);
}

// ───────── analytics (real data only) ─────────
export interface Analytics {
  n: number;
  videos: number;
  images: number;
  totalCost: number;
  costPerVideo: number | null;
  costPerScene: number | null;
  qualityMean: number | null;
  successRate: number | null;
  regenerationRate: number | null;
  fallbackRate: number | null;
  learningSpend: number;
  topModel: { model: string; n: number } | null;
  topError: { cls: string; n: number } | null;
}
export function analytics(
  records: ProdRecord[],
  o: { projects?: number; scenes?: number } = {},
): Analytics | null {
  if (!records.length) return null;
  const n = records.length;
  const cost = records.reduce((a, r) => a + (r.cost ?? 0), 0);
  const q = records.map((r) => r.quality).filter((x): x is number => typeof x === 'number');
  const count = <T>(xs: T[]) => {
    const m = new Map<T, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1])[0] ?? null;
  };
  const tm = count(records.map((r) => r.model));
  const te = count(records.filter((r) => r.errorClass).map((r) => r.errorClass!));
  return {
    n,
    videos: o.projects ?? 0,
    images: records.filter((r) => r.kind === 'image').length,
    totalCost: cost,
    costPerVideo: o.projects ? cost / o.projects : null,
    costPerScene: o.scenes ? cost / o.scenes : null,
    qualityMean: q.length ? mean(q) : null,
    successRate: records.filter((r) => r.success).length / n,
    regenerationRate: records.filter((r) => r.regenerated).length / n,
    fallbackRate: records.filter((r) => r.fallback).length / n,
    learningSpend: records.filter((r) => r.learning).reduce((a, r) => a + (r.cost ?? 0), 0),
    topModel: tm ? { model: tm[0], n: tm[1] } : null,
    topError: te ? { cls: te[0], n: te[1] } : null,
  };
}
