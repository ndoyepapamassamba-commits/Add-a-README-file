// TEACHER ROI and APPRENTICE PAYBACK. Real data only: premium calls avoided are COUNTED from accepted free missions;
// their avoided cost is ESTIMATED from the MEASURED cost of the premium reference on the same family. No reference or no
// investment → N/A (never a projection without data).
import type { JevLogEntry } from '../metrics';
import { familyOf, isFreeId, freeOutcome } from './registry';
import { premiumReference } from './supremacy';
import { trueTotalCost } from './metrics';

export interface TeacherROIInput {
  family: string;
  /** Immediate $-value of the expected quality / success gain of this Teacher call (governor units). */
  immediateGain: number;
  teacherCost: number;
  /** Future reuse value ($) — only from measured family frequency and measured premium cost, else null. */
  futureReuseValue: number | null;
}
export interface TeacherROI {
  teach: boolean;
  immediateGain: number;
  futureReuseValue: number | null;
  teacherCost: number;
  /** (future + immediate) / cost; null when the cost is 0 or the future value is unknown. */
  roi: number | null;
  basis: 'MEASURED' | 'PROJECTED' | 'N/A';
  reason: string;
}
/** future_reuse_value + immediate_gain > teacher_cost ⇒ TEACH, else SKIP. */
export function teacherROI(i: TeacherROIInput): TeacherROI {
  const fut = i.futureReuseValue;
  const total = i.immediateGain + (fut ?? 0);
  const teach = total > i.teacherCost;
  return {
    teach,
    immediateGain: i.immediateGain,
    futureReuseValue: fut,
    teacherCost: i.teacherCost,
    roi: i.teacherCost > 0 && fut !== null ? total / i.teacherCost : null,
    basis: fut === null ? 'N/A' : 'PROJECTED',
    reason: `${teach ? 'TEACH' : 'SKIP'} : gain immédiat ${i.immediateGain.toFixed(5)} $ + valeur de réutilisation ${fut === null ? 'N/A (aucune donnée de fréquence / de coût premium)' : `${fut.toFixed(5)} $ (projection)`} ${teach ? '>' : '≤'} coût du Teacher ${i.teacherCost.toFixed(5)} $`,
  };
}

/** Reuse value from MEASURED frequency of the family (missions / day over the observed span) × measured premium cost. */
export function futureReuseValue(
  log: JevLogEntry[],
  family: string,
  horizonDays: number,
  now = Date.now(),
): { value: number | null; calls: number | null; perDay: number | null } {
  const fam = log.filter((e) => familyOf(e) === family && e.model !== 'JEV-0');
  const prem = premiumReference(log, family);
  if (fam.length < 3 || !prem?.cost) return { value: null, calls: null, perDay: null };
  const first = Math.min(...fam.map((e) => e.at));
  const spanDays = Math.max(1, (now - first) / 86_400_000);
  const perDay = fam.length / spanDays;
  const calls = perDay * horizonDays;
  return { value: calls * prem.cost, calls, perDay };
}

export interface Payback {
  family: string;
  model: string | null;
  teacherInvestment: number;
  jevCost: number;
  benchmarkCost: number;
  invested: number;
  premiumCallsAvoided: number;
  premiumCostPerCall: number | null;
  avoidedCost: number | null;
  netBenefit: number | null;
  /** avoided / invested; null when nothing was invested or there is no premium reference. */
  roi: number | null;
  premiumRef: string | null;
  note: string;
}

const servedFree = (e: JevLogEntry) =>
  Boolean(
    e.apprentice?.active &&
    !e.apprentice.arm &&
    isFreeId(e.model) &&
    e.apprentice.accepted &&
    e.apprentice.path.length <= 1 &&
    e.success,
  );

/** APPRENTICE PAYBACK for one (family, model) or the whole family: investment vs premium calls avoided. */
export function apprenticePayback(log: JevLogEntry[], family: string, model: string | null = null): Payback {
  const fam = log.filter((e) => familyOf(e) === family);
  const mine = model ? fam.filter((e) => e.model === model || e.apprentice?.path[0] === model) : fam;
  const teacherInvestment = fam.reduce((a, e) => a + (e.apprentice?.teacherCost ?? 0), 0);
  const jevCost = mine.reduce((a, e) => a + (e.acct?.jevCost ?? e.jevCost), 0);
  const benchmarkCost = mine
    .filter((e) => e.fabric?.kind === 'apprentice')
    .reduce((a, e) => a + trueTotalCost(e).total, 0);
  const avoided = mine.filter(servedFree).length;
  const prem = premiumReference(log, family);
  const invested = teacherInvestment + jevCost + benchmarkCost;
  const avoidedCost = prem?.cost != null ? avoided * prem.cost : null;
  return {
    family,
    model,
    teacherInvestment,
    jevCost,
    benchmarkCost,
    invested,
    premiumCallsAvoided: avoided,
    premiumCostPerCall: prem?.cost ?? null,
    avoidedCost,
    netBenefit: avoidedCost === null ? null : avoidedCost - invested,
    roi: avoidedCost !== null && invested > 0 ? avoidedCost / invested : null,
    premiumRef: prem?.model ?? null,
    note: prem
      ? `coût évité ESTIMÉ à partir du coût mesuré de ${prem.model} sur cette famille (n = ${prem.n})`
      : 'N/A : aucune mission premium mesurée sur cette famille',
  };
}

/** LEARNING PAYBACK across all families (Teacher spend vs premium calls avoided afterwards). */
export function learningPayback(log: JevLogEntry[]): { total: Payback; byFamily: Payback[] } {
  const fams = [...new Set(log.filter((e) => e.apprentice).map(familyOf))];
  const byFamily = fams.map((f) => apprenticePayback(log, f));
  const sum = (f: (p: Payback) => number) => byFamily.reduce((a, p) => a + f(p), 0);
  const withRef = byFamily.filter((p) => p.avoidedCost !== null);
  const invested = sum((p) => p.invested);
  const avoidedCost = withRef.length ? withRef.reduce((a, p) => a + (p.avoidedCost ?? 0), 0) : null;
  return {
    total: {
      family: '(toutes les familles)',
      model: null,
      teacherInvestment: sum((p) => p.teacherInvestment),
      jevCost: sum((p) => p.jevCost),
      benchmarkCost: sum((p) => p.benchmarkCost),
      invested,
      premiumCallsAvoided: sum((p) => p.premiumCallsAvoided),
      premiumCostPerCall: null,
      avoidedCost,
      netBenefit: avoidedCost === null ? null : avoidedCost - invested,
      roi: avoidedCost !== null && invested > 0 ? avoidedCost / invested : null,
      premiumRef: null,
      note:
        avoidedCost === null
          ? 'N/A : aucune référence premium mesurée'
          : 'somme des familles disposant d’une référence premium mesurée',
    },
    byFamily,
  };
}

/** Apprentice learning graph counters (TEACHER → EXPERIENCE → SKILL → APPRENTICE → VALIDATION → CHAMPION → PREMIUM AVOIDED). */
export function learningGraph(
  log: JevLogEntry[],
  skills: { provenance?: unknown; versions?: { provenance: { teacher?: string } }[] }[],
  champions: number,
) {
  const missions = log.filter((e) => e.apprentice?.active && !e.apprentice.arm).length;
  const taught = log.filter((e) => e.apprentice?.teacher).length;
  const learnedSkills = skills.filter((s) => s.versions?.some((v) => v.provenance.teacher)).length;
  const lb = learningPayback(log);
  const freeQ = log
    .filter((e) => servedFree(e))
    .map((e) => e.qualityMeasured ?? e.quality)
    .filter((x): x is number => typeof x === 'number');
  return {
    teacherCalls: taught,
    missionsLearned: missions,
    skillsLearned: learnedSkills,
    champions,
    premiumCallsAvoided: lb.total.premiumCallsAvoided,
    estimatedCostAvoided: lb.total.avoidedCost,
    qualityMaintained: freeQ.length ? freeQ.reduce((a, b) => a + b, 0) / freeQ.length : null,
    qualityN: freeQ.length,
  };
}
export { freeOutcome };
