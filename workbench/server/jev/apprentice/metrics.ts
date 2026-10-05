// TRUE TOTAL COST, intelligence-per-dollar indicators and the JEV APPRENTICE BENCHMARK analysis. Only measured values;
// a division by zero is never papered over: zero model cost gets its own indicator ("QUALITY AT ZERO MODEL COST").
import type { JevLogEntry } from '../metrics';
import { qualityOfEntry } from '../fabric/memory';
import { differences } from '../science';
import { compare, summarize, type ArmComparison, type ArmSummary } from '../fabric/cfbench';
import type { Arm } from '../fabric/cfbench';
import { APPRENTICE_ARMS, ARM_NAME, type ApprenticeArm } from './types';

export interface TrueCost {
  model: number;
  teacher: number;
  jev: number;
  tools: number;
  retries: number;
  total: number;
  /** Share of the total NOT reported by the provider (calculated or estimated). */
  unmeasuredShare: number | null;
}
/** TOTAL MISSION COST = model + teacher + JEV API + tools + retries (corrections). */
export function trueTotalCost(e: JevLogEntry): TrueCost {
  const a = e.acct;
  const teacher = e.apprentice?.teacherCost ?? 0;
  if (a) {
    const model = Math.max(0, a.llmCost - teacher);
    return {
      model,
      teacher,
      jev: a.jevCost,
      tools: a.toolCost,
      retries: a.correctionCost,
      total: a.totalCost,
      unmeasuredShare: a.unmeasuredCostShare,
    };
  }
  return {
    model: Math.max(0, e.cost - teacher),
    teacher,
    jev: e.jevCost,
    tools: 0,
    retries: 0,
    total: e.cost + e.jevCost,
    unmeasuredShare: null,
  };
}

export interface PerDollar {
  n: number;
  quality: number | null;
  successRate: number | null;
  totalCost: number;
  modelCost: number;
  /** quality points per $ — null when the total cost is 0 (never divided by zero). */
  qualityPerDollar: number | null;
  successPerDollar: number | null;
  costPerSuccess: number | null;
  /** Mean quality of runs whose MODEL cost was zero, with the JEV / teacher / tool cost they still carried. */
  qualityAtZeroModelCost: { n: number; quality: number | null; overheadCost: number } | null;
}
export function perDollar(es: JevLogEntry[]): PerDollar {
  const costs = es.map(trueCost);
  const total = costs.reduce((a, c) => a + c.total, 0);
  const model = costs.reduce((a, c) => a + c.model, 0);
  const q = es.map(qualityOfEntry).filter((x): x is number => x !== null);
  const judged = es.filter((e) => e.success !== null);
  const ok = judged.filter((e) => e.success).length;
  const quality = q.length ? q.reduce((a, b) => a + b, 0) / q.length : null;
  const zero = es.filter((_, i) => costs[i]!.model === 0);
  const zq = zero.map(qualityOfEntry).filter((x): x is number => x !== null);
  return {
    n: es.length,
    quality,
    successRate: judged.length ? ok / judged.length : null,
    totalCost: total,
    modelCost: model,
    qualityPerDollar: total > 0 && quality !== null ? quality / (total / es.length) : null,
    successPerDollar: total > 0 && judged.length ? ok / total : null,
    costPerSuccess: ok ? total / ok : null,
    qualityAtZeroModelCost: zero.length
      ? {
          n: zero.length,
          quality: zq.length ? zq.reduce((a, b) => a + b, 0) / zq.length : null,
          overheadCost: zero.reduce((a, e) => a + trueCost(e).total, 0),
        }
      : null,
  };
}
const trueCost = trueTotalCost;

// ───────────────────────── apprentice benchmark (5 arms) ─────────────────────────

export interface ApprenticeComparison extends ArmComparison {
  fromName: string;
  toName: string;
  qualityGain: number | null;
  successGain: number | null;
  costReduction: number | null;
  tokenReduction: number | null;
  latencyReduction: number | null;
  escalationReduction: number | null;
}
export interface ApprenticeReport {
  arms: (ArmSummary & {
    name: string;
    toolCalls: number | null;
    retries: number | null;
    escalationRate: number | null;
  })[];
  comparisons: ApprenticeComparison[];
  nonComparable: { groupId: string; arm: string; reasons: string[] }[];
  groups: number;
  complete: number;
  tasks: number;
  family: string[];
  models: string[];
  version: string;
  at: number | null;
}
export const APPRENTICE_BENCH_VERSION = 'apprentice-bench-1';

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const COMPARISONS: [ApprenticeArm, ApprenticeArm][] = [
  ['free', 'free_jev'],
  ['free_jev', 'free_skill'],
  ['free_skill', 'free_skill_exp'],
  ['free', 'free_skill_exp'],
  ['free_skill_exp', 'validated'],
  ['validated', 'paid'],
  ['free_skill_exp', 'paid'],
  ['free', 'validated'],
  ['free', 'paid'],
];

export function analyzeApprentice(log: JevLogEntry[]): ApprenticeReport {
  const es = log.filter((e) => e.fabric?.kind === 'apprentice' && e.experiment && e.apprentice?.arm);
  const groups = new Map<string, Partial<Record<ApprenticeArm, JevLogEntry>>>();
  for (const e of es)
    groups.set(e.fabric!.groupId, { ...(groups.get(e.fabric!.groupId) ?? {}), [e.apprentice!.arm!]: e });
  const nonComparable: ApprenticeReport['nonComparable'] = [];
  const pairsOf = (from: ApprenticeArm, to: ApprenticeArm) => {
    const out: { a: JevLogEntry; b: JevLogEntry }[] = [];
    for (const [gid, g] of groups) {
      const a = g[from];
      const b = g[to];
      if (!a || !b) continue;
      // Arms differ by model and offered tools on purpose: the prompt, task, context and sampling must be identical.
      const d = differences(a.experiment!, b.experiment!).filter((x) => !/^(model|toolsAvailable) /.test(x));
      if (d.length) {
        if (!nonComparable.some((n) => n.groupId === gid && n.arm === to))
          nonComparable.push({ groupId: gid, arm: to, reasons: d });
        continue;
      }
      out.push({ a, b });
    }
    return out;
  };
  // The arms actually run (the VALIDATED arm exists only when a champion existed for the family).
  const present = APPRENTICE_ARMS.filter((a) => es.some((e) => e.apprentice!.arm === a));
  const complete = [...groups.values()].filter((g) => present.every((a) => g[a]));
  const arms = present.map((arm) => {
    const xs = complete.map((g) => g[arm]!);
    return {
      ...summarize(arm as unknown as Arm, xs),
      arm: arm as unknown as Arm,
      name: ARM_NAME[arm],
      toolCalls: mean(xs.map((e) => e.toolCallCount ?? 0)),
      retries: mean(xs.map((e) => e.retries)),
      escalationRate: xs.length
        ? xs.filter((e) => e.escalations > 0 || (e.apprentice?.path.length ?? 1) > 1).length / xs.length
        : null,
    };
  });
  const comparisons = COMPARISONS.filter(([f, t]) => present.includes(f) && present.includes(t)).map(
    ([f, t]) => {
      const p = pairsOf(f, t);
      const c = compare(f as unknown as Arm, t as unknown as Arm, p);
      const sa = summarize(
        f as unknown as Arm,
        p.map((x) => x.a),
      );
      const sb = summarize(
        t as unknown as Arm,
        p.map((x) => x.b),
      );
      const rel = (x: number | null, y: number | null) =>
        x !== null && y !== null && x > 0 ? (x - y) / x : null;
      const esc = (a: JevLogEntry[]) =>
        a.length
          ? a.filter((e) => e.escalations > 0 || (e.apprentice?.path.length ?? 1) > 1).length / a.length
          : null;
      const ea = esc(p.map((x) => x.a));
      const eb = esc(p.map((x) => x.b));
      return {
        ...c,
        fromName: ARM_NAME[f],
        toName: ARM_NAME[t],
        qualityGain: c.dQuality.n ? c.dQuality.meanDelta : null,
        successGain: c.dSuccess.n ? c.dSuccess.meanDelta : null,
        costReduction: rel(sa.cost, sb.cost),
        tokenReduction: rel(sa.tokens, sb.tokens),
        latencyReduction: rel(sa.latencyMs, sb.latencyMs),
        escalationReduction: ea !== null && eb !== null ? ea - eb : null,
      } as ApprenticeComparison;
    },
  );
  const times = es.map((e) => e.at);
  return {
    arms,
    comparisons,
    nonComparable,
    groups: groups.size,
    complete: complete.length,
    tasks: new Set(es.map((e) => e.fabric!.taskKey)).size,
    family: [...new Set(es.map((e) => e.apprentice!.family))],
    models: [...new Set(es.map((e) => e.model))],
    version: APPRENTICE_BENCH_VERSION,
    at: times.length ? Math.max(...times) : null,
  };
}

/**
 * The only way a free model may be compared to a reference: "Free + JEV achieved X % of the reference quality on this
 * task family", with n, confidence, family, benchmark version and date — or INSUFFICIENT SAMPLE.
 */
export function referenceStatement(
  r: ApprenticeReport,
  from: ApprenticeArm = 'free_skill_exp',
  to: ApprenticeArm = 'paid',
  minPairs = 5,
): string {
  const a = r.arms.find((x) => (x.arm as unknown as string) === from);
  const b = r.arms.find((x) => (x.arm as unknown as string) === to);
  const c = r.comparisons.find(
    (x) => (x.from as unknown as string) === from && (x.to as unknown as string) === to,
  );
  if (!a || !b || !c || c.pairs < minPairs || a.quality === null || b.quality === null || b.quality <= 0)
    return `INSUFFICIENT SAMPLE${c ? ` (n = ${c.pairs} paires < ${minPairs})` : ''} — aucune équivalence affirmée.`;
  const pct = (a.quality / b.quality) * 100;
  const conf = c.pairs >= 20 ? 'élevée' : c.pairs >= 10 ? 'moyenne' : 'faible';
  return `${ARM_NAME[from]} a atteint ${pct.toFixed(1)} % de la qualité de référence (${ARM_NAME[to]}) sur la/les famille(s) ${r.family.join(', ') || 'N/A'} — n = ${c.pairs}, confiance ${conf}, benchmark ${r.version}, ${r.at ? new Date(r.at).toISOString().slice(0, 10) : 'N/A'}.`;
}
