// TEACHER AS A COGNITIVE INVESTMENT: TeacherLearningValue and calculateTeacherROI. "Is paying this premium now going to
// reduce future costs?" — answered with MEASURED frequencies and MEASURED premium costs; no data ⇒ N/A (never invented).
import type { JevLogEntry } from '../metrics';
import { familyOf } from './registry';
import { premiumReference } from './supremacy';
import { apprenticePayback } from './payback';
import type { FailureSignature } from './failure';

export interface TeacherLearningValue {
  /** $ value of the immediate quality / success gain (governor units). */
  immediateGain: number;
  /** Expected number of future reuses (measured missions / day × horizon), or null. */
  futureReuse: number | null;
  /** 0–1 : how serious the error is (signature + risk). */
  errorSeverity: number;
  teacherCost: number;
  /** $ expected saved on future premium calls = reuse × measured premium cost × measured apprentice success. Null = N/A. */
  expectedFutureSavings: number | null;
  /** $ value of what the apprentice would learn when it has little evidence (policy prior, labelled). */
  informationValue: number;
  /** Days until the Teacher investment is repaid at the measured frequency; null = N/A. */
  paybackDays: number | null;
}
export type LearningValue = 'HIGH' | 'MEDIUM' | 'LOW' | 'N/A';
export interface TeacherROIResult {
  decision: 'INVEST' | 'DO_NOT_INVEST';
  learningValue: LearningValue;
  /** (future savings + immediate + information) / cost, or null. */
  roi: number | null;
  value: TeacherLearningValue;
  basis: 'MEASURED' | 'IMMEDIATE_ONLY';
  reason: string;
}

const SEVERITY: Record<FailureSignature, number> = {
  SECURITY_VIOLATION: 1,
  NUMERIC_REASONING_ERROR: 0.8,
  MISSING_TABLE_RECONCILIATION: 0.7,
  TOOL_SELECTION_ERROR: 0.6,
  CONTEXT_OVERFLOW: 0.5,
  STRUCTURED_OUTPUT_INVALID: 0.4,
  INCOMPLETE_ANSWER: 0.4,
  LANGUAGE_MISMATCH: 0.3,
  GENERIC_QUALITY_GAP: 0.3,
};
export const severityOf = (sig: FailureSignature, risk: 'low' | 'normal' | 'high' | 'critical' = 'normal') =>
  Math.min(1, SEVERITY[sig] * (risk === 'critical' ? 1.3 : risk === 'high' ? 1.15 : 1));

/** Measured reuse: missions of the family per day over the observed span × the horizon. */
export function measuredReuse(
  log: JevLogEntry[],
  family: string,
  horizonDays: number,
  now = Date.now(),
): { perDay: number; calls: number } | null {
  const fam = log.filter((e) => familyOf(e) === family && e.model !== 'JEV-0');
  if (fam.length < 3) return null;
  const span = Math.max(1, (now - Math.min(...fam.map((e) => e.at))) / 86_400_000);
  const perDay = fam.length / span;
  return { perDay, calls: perDay * horizonDays };
}

export interface TeacherROIInput {
  log: JevLogEntry[];
  family: string;
  teacherCost: number;
  /** $ value of the immediate gain (from the governor). */
  immediateGain: number;
  signature?: FailureSignature;
  risk?: 'low' | 'normal' | 'high' | 'critical';
  horizonDays?: number;
  /** Measured success rate of the apprentice on this family (0–1); null = unknown. */
  apprenticeSuccess?: number | null;
  /** Value of one quality point ($), policy parameter. */
  valuePerPoint?: number;
  /** n of the apprentice on the family (information value only when little evidence). */
  apprenticeN?: number;
  now?: number;
}
/** calculateTeacherROI: INVEST when expected future savings (+ immediate + information) exceed the Teacher cost. */
export function calculateTeacherROI(i: TeacherROIInput): TeacherROIResult {
  const horizon = i.horizonDays ?? 30;
  const reuse = measuredReuse(i.log, i.family, horizon, i.now);
  const prem = premiumReference(i.log, i.family);
  const p = i.apprenticeSuccess ?? null;
  const pb = apprenticePayback(i.log, i.family);
  const successAfter = p ?? (pb.premiumCallsAvoided > 0 ? 1 : null);
  const savings =
    reuse && prem?.cost != null && successAfter !== null ? reuse.calls * prem.cost * successAfter : null;
  const info = (i.apprenticeN ?? 0) < 5 ? (i.valuePerPoint ?? 0.002) * 5 : 0;
  const severity = severityOf(i.signature ?? 'GENERIC_QUALITY_GAP', i.risk);
  const value: TeacherLearningValue = {
    immediateGain: i.immediateGain,
    futureReuse: reuse?.calls ?? null,
    errorSeverity: severity,
    teacherCost: i.teacherCost,
    expectedFutureSavings: savings,
    informationValue: info,
    paybackDays:
      savings !== null && reuse && reuse.perDay > 0 && prem?.cost != null && successAfter
        ? i.teacherCost / (reuse.perDay * prem.cost * successAfter)
        : null,
  };
  const total = (savings ?? 0) + i.immediateGain + info;
  const roi = i.teacherCost > 0 ? (savings === null ? null : total / i.teacherCost) : null;
  const invest = savings !== null ? total > i.teacherCost : i.immediateGain + info > i.teacherCost;
  const lv: LearningValue = savings === null ? 'N/A' : roi! >= 3 ? 'HIGH' : roi! >= 1 ? 'MEDIUM' : 'LOW';
  return {
    decision: invest ? 'INVEST' : 'DO_NOT_INVEST',
    learningValue: lv,
    roi,
    value,
    basis: savings === null ? 'IMMEDIATE_ONLY' : 'MEASURED',
    reason: `${invest ? 'INVEST' : 'DO NOT INVEST'} : coût Teacher ${i.teacherCost.toFixed(5)} $ ${invest ? '<' : '≥'} économies futures attendues ${savings === null ? 'N/A (aucune fréquence / coût premium mesurés)' : `${savings.toFixed(5)} $`} + gain immédiat ${i.immediateGain.toFixed(5)} $${info ? ` + valeur d’information ${info.toFixed(5)} $` : ''} — valeur d’apprentissage ${lv}${value.paybackDays !== null ? `, remboursé en ~${value.paybackDays.toFixed(1)} jour(s)` : ''}`,
  };
}
