// CHAMPION SCIENCE LAB — read models for the UI: overview table, KPIs, expertise cube, chart points and cost intelligence.
// Pure functions over the lab state and the REAL log; every empty case says N/A / INSUFFICIENT SAMPLE.
import type { JevLogEntry } from '../metrics';
import type { FreeModel } from '../fabric/council';
import { familyOf, isFreeId } from './registry';
import {
  familyRecord,
  isApprenticeEvidence,
  premiumReference,
  validateRecord,
  type PremiumRef,
} from './supremacy';
import { armStats, confidenceOf, gatesFor, type ArmStats, type ConfidenceLabel } from './stats';
import { detectChampionDegradation, isReal, type Decision, type LabState, type LabFamily } from './lab';
import { strataOf } from './strata';
import { learningPayback, apprenticePayback } from './payback';
import { trueTotalCost } from './metrics';
import { DEFAULT_APPRENTICE, type ApprenticeSettings, type JevStatus, type Risk } from './types';

export type CellStatus = JevStatus | 'CHAMPION' | 'CHALLENGER' | 'ROLLED_BACK';

export interface LabRow {
  key: string;
  family: string;
  risk: Risk;
  contract: string | null;
  champion: string | null;
  championDegraded: boolean;
  challenger: string | null;
  n: number;
  quality: number | null;
  success: number | null;
  premium: PremiumRef | null;
  /** champion quality − premium quality (points); null when either is unknown. */
  delta: number | null;
  confidence: ConfidenceLabel;
  decision: Decision | 'CROWN' | 'NONE' | null;
  decisionReason: string;
  lastTest: number | null;
}
/** The overview table: one row per (family × risk [× contract]) — FAMILY / CHAMPION / CHALLENGER / N / QUALITY / SUCCESS / PREMIUM / DELTA / CONFIDENCE / DECISION / LAST TEST. */
export function labRows(state: LabState, log: JevLogEntry[], simulated = false): LabRow[] {
  const real = simulated ? log : log.filter(isReal);
  return Object.values(state.families).map((f: LabFamily) => {
    const runs = real.filter(
      (e) =>
        e.model === f.champion?.model &&
        isApprenticeEvidence(e) &&
        strataOf(e).family === f.family &&
        strataOf(e).risk === f.risk &&
        (f.contract === null || strataOf(e).contract === f.contract),
    );
    const st = armStats(runs);
    const prem = f.premiumReference;
    const best = f.statisticalEvidence;
    return {
      key: f.key,
      family: f.family,
      risk: f.risk,
      contract: f.contract,
      champion: f.champion?.model ?? null,
      championDegraded: Boolean(f.champion?.degraded),
      challenger: best?.challenger ?? f.challengers[0] ?? null,
      n: st.n,
      quality: st.qualityMean,
      success: st.successRate,
      premium: prem,
      delta: st.qualityMean !== null && prem?.quality != null ? st.qualityMean - prem.quality : null,
      confidence: confidenceOf(st.n, gatesFor(f.risk)),
      decision: f.currentDecision?.action ?? null,
      decisionReason: f.currentDecision?.reason ?? 'aucune décision',
      lastTest: f.experiments.at(-1)?.at ?? null,
    };
  });
}

export interface LabKpis {
  activeChampions: number;
  challengers: number;
  promotions: number;
  rollbacks: number;
  degradedChampions: number;
  premiumReferences: number;
  premiumCallsAvoided: number;
  estimatedCostAvoided: number | null;
  teacherInvestments: number;
  teacherROI: number | null;
  statisticalConfidence: ConfidenceLabel;
  nonInferiorityDecisions: number;
}
export function labKpis(state: LabState, log: JevLogEntry[], simulated = false): LabKpis {
  const fams = Object.values(state.families);
  const real = simulated ? log : log.filter(isReal);
  const lp = learningPayback(real);
  const rows = labRows(state, real, simulated);
  const order: ConfidenceLabel[] = ['INSUFFICIENT_SAMPLE', 'INDICATIVE', 'ROBUST', 'HIGH_CONFIDENCE'];
  const best =
    rows.map((r) => r.confidence).sort((a, b) => order.indexOf(b) - order.indexOf(a))[0] ??
    'INSUFFICIENT_SAMPLE';
  return {
    activeChampions: fams.filter((f) => f.champion && !f.champion.degraded).length,
    challengers: new Set(fams.flatMap((f) => f.challengers)).size,
    promotions: state.promotionHistory.length,
    rollbacks: state.rollbackHistory.length,
    degradedChampions: fams.filter((f) => f.champion?.degraded).length,
    premiumReferences: fams.filter((f) => f.premiumReference).length,
    premiumCallsAvoided: lp.total.premiumCallsAvoided,
    estimatedCostAvoided: lp.total.avoidedCost,
    teacherInvestments: lp.total.teacherInvestment,
    teacherROI: lp.total.roi,
    statisticalConfidence: best,
    nonInferiorityDecisions: fams.reduce(
      (a, f) =>
        a + f.experiments.filter((x) => x.verdict === 'NON_INFERIOR' || x.verdict === 'SUPERIOR').length,
      0,
    ),
  };
}

export interface CubeRow {
  model: string;
  family: string;
  risk: Risk;
  contract: string;
  n: number;
  quality: number | null;
  success: number | null;
  confidence: ConfidenceLabel;
  latencyMs: number | null;
  totalCost: number | null;
  status: CellStatus;
  degradation: string;
}
/** EXPERTISE CUBE: MODEL × TASK FAMILY × RISK × OUTPUT CONTRACT with CHAMPION / CHALLENGER / ROLLED BACK statuses. */
export function expertiseCube(
  log: JevLogEntry[],
  state: LabState,
  pool: FreeModel[],
  settings: ApprenticeSettings = DEFAULT_APPRENTICE,
  now = Date.now(),
): CubeRow[] {
  void pool;
  const runs = log.filter((e) => isReal(e) && isFreeId(e.model) && isApprenticeEvidence(e));
  const by = new Map<string, JevLogEntry[]>();
  for (const e of runs) {
    const s = strataOf(e);
    const k = [e.model, s.family, s.risk, s.contract].join('|');
    by.set(k, [...(by.get(k) ?? []), e]);
  }
  return [...by]
    .map(([k, es]) => {
      const [model, family, risk, contract] = k.split('|') as [string, string, Risk, string];
      const st = armStats(es);
      const rec = familyRecord(es, model, family, settings.validation, now);
      const v = validateRecord(rec, risk, settings.validation);
      const fam = state.families[`${family}|${risk}`];
      const deg = detectChampionDegradation(es, settings.lab);
      const status: CellStatus = fam?.rolledBack.includes(model)
        ? 'ROLLED_BACK'
        : fam?.champion?.model === model
          ? fam.champion.degraded
            ? 'DEGRADED'
            : 'CHAMPION'
          : fam?.challengers.includes(model) && v.status !== 'VALIDATED'
            ? 'CHALLENGER'
            : v.status;
      return {
        model,
        family,
        risk,
        contract,
        n: st.n,
        quality: st.qualityMean,
        success: st.successRate,
        confidence: confidenceOf(st.n, gatesFor(risk)),
        latencyMs: st.latencyMean,
        totalCost: st.totalMissionCost,
        status,
        degradation: deg.degraded ? deg.signals.join(' ; ') : 'non détectée',
      };
    })
    .sort((a, b) => b.n - a.n);
}

export interface ChartPoint {
  label: 'Champion' | 'Challenger' | 'Premium';
  model: string;
  n: number;
  cost: number | null;
  quality: number | null;
  success: number | null;
  latencyMs: number | null;
}
/** Points of the QUALITY vs COST (and SUCCESS vs COST, LATENCY vs QUALITY) charts. Null when any group has n < 5. */
export function chartPoints(
  state: LabState,
  log: JevLogEntry[],
  key: string,
  minN = 5,
): { points: ChartPoint[]; ok: boolean; reason: string } {
  const f = state.families[key];
  const real = log.filter(isReal);
  if (!f?.champion)
    return { points: [], ok: false, reason: 'INSUFFICIENT SAMPLE : aucun champion pour cette clé' };
  const runsOf = (m: string) =>
    real.filter(
      (e) =>
        e.model === m &&
        isApprenticeEvidence(e) &&
        strataOf(e).family === f.family &&
        strataOf(e).risk === f.risk &&
        (f.contract === null || strataOf(e).contract === f.contract),
    );
  const mk = (label: ChartPoint['label'], model: string, runs: JevLogEntry[]): ChartPoint => {
    const st = armStats(runs);
    return {
      label,
      model,
      n: st.n,
      cost: st.totalMissionCost,
      quality: st.qualityMean,
      success: st.successRate,
      latencyMs: st.latencyMean,
    };
  };
  const pts: ChartPoint[] = [mk('Champion', f.champion.model, runsOf(f.champion.model))];
  const ch = f.statisticalEvidence?.challenger ?? f.challengers[0];
  if (ch) pts.push(mk('Challenger', ch, runsOf(ch)));
  const prem = premiumReference(real, f.family);
  if (prem) {
    const pr = real.filter((e) => e.model === prem.model && familyOf(e) === f.family);
    pts.push(mk('Premium', prem.model, pr));
  }
  const small = pts.filter((p) => p.n < minN);
  if (pts.length < 2)
    return {
      points: pts,
      ok: false,
      reason:
        'INSUFFICIENT SAMPLE : au moins deux groupes (champion + challenger ou premium) sont nécessaires',
    };
  if (small.length)
    return {
      points: pts,
      ok: false,
      reason: `INSUFFICIENT SAMPLE : ${small.map((p) => `${p.label} n=${p.n}`).join(', ')} (< ${minN})`,
    };
  return { points: pts, ok: true, reason: '' };
}

export interface CostIntel {
  n: number;
  modelCost: number;
  jevCost: number;
  toolCost: number;
  teacherCost: number;
  retryCost: number;
  totalMissionCost: number;
  costPerSuccess: number | null;
  /** Total cost per quality point (cost ÷ mean quality), null when no quality was measured. */
  costPerQualityPoint: number | null;
  premiumCostAvoided: number | null;
  teacherInvestment: number;
  expectedFutureSavings: number | null;
}
/** MODEL / JEV / TOOL / TEACHER / RETRY / TOTAL — never "$0 mission" just because the model is free. */
export function costIntelligence(
  log: JevLogEntry[],
  family: string | null = null,
  simulated = false,
): CostIntel {
  const runs = log.filter(
    (e) => (simulated || isReal(e)) && e.apprentice && (family === null || familyOf(e) === family),
  );
  const cs = runs.map(trueTotalCost);
  const sum = (f: (c: ReturnType<typeof trueTotalCost>) => number) => cs.reduce((a, c) => a + f(c), 0);
  const ok = runs.filter((e) => e.success).length;
  const qs = runs
    .map((e) => e.qualityMeasured ?? e.quality)
    .filter((x): x is number => typeof x === 'number');
  const total = sum((c) => c.total);
  const pb = family ? apprenticePayback(runs, family) : learningPayback(runs).total;
  return {
    n: runs.length,
    modelCost: sum((c) => c.model),
    jevCost: sum((c) => c.jev),
    toolCost: sum((c) => c.tools),
    teacherCost: sum((c) => c.teacher),
    retryCost: sum((c) => c.retries),
    totalMissionCost: total,
    costPerSuccess: ok ? total / ok : null,
    costPerQualityPoint:
      qs.length && total > 0 ? total / runs.length / (qs.reduce((a, b) => a + b, 0) / qs.length) : null,
    premiumCostAvoided: pb.avoidedCost,
    teacherInvestment: pb.teacherInvestment,
    expectedFutureSavings: null,
  };
}
export type { ArmStats };
