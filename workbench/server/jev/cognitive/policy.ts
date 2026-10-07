// JEV COGNITIVE OS — META-LEARNING POLICY (versioned) and POLICY EVOLUTION (challenger).
// A policy is a small set of thresholds that decide how JEV behaves (when to verify, to use a council, to stop, to compress…).
// A change is NEVER applied because it "feels" better: a candidate policy is replayed offline on the history, compared
// statistically, and only then PROMOTED or REJECTED. The replay is a counterfactual ESTIMATE and is labelled so.
import type { CognitiveDiagnosis } from './diagnosis';
import type { JevLogEntry } from '../metrics';
import { qualityOfEntry } from '../fabric/memory';
import { welchDiff, confidenceOf } from '../apprentice/stats';
import { mean } from '../apprentice/intervals';

export interface MetaPolicy {
  version: number;
  /** Difficulty from which a protocol heavier than minimal reasoning is used. */
  protocolDifficulty: number;
  /** Risk-high missions are verified before delivery. */
  verifyHighRisk: boolean;
  /** Context larger than this many tokens is compressed into a capsule. */
  capsuleThreshold: number;
  /** A second model is consulted from this ambiguity. */
  councilAmbiguity: number;
  /** Stop when the last gain ≤ minGain points and the next call costs ≥ costShare of the work so far. */
  minGain: number;
  costShare: number;
  /** Teacher (stronger model) is called only above this difficulty. */
  teacherDifficulty: number;
}
export const BASE_POLICY: MetaPolicy = {
  version: 1,
  protocolDifficulty: 0.3,
  verifyHighRisk: true,
  capsuleThreshold: 6000,
  councilAmbiguity: 0.6,
  minGain: 1,
  costShare: 0.4,
  teacherDifficulty: 0.7,
};

export type PolicyStatus = 'active' | 'candidate' | 'promoted' | 'rejected';
export interface PolicyRecord {
  policy: MetaPolicy;
  status: PolicyStatus;
  createdAt: number;
  parent: number | null;
  note: string;
  evidence?: PolicyEvaluation;
}
/** What a policy would DO on a diagnosed request (the decision side of the policy). */
export function decide(p: MetaPolicy, d: CognitiveDiagnosis, o: { contextTokens: number }) {
  return {
    heavyProtocol: d.difficulty >= p.protocolDifficulty && !d.trivial,
    verify: p.verifyHighRisk && d.risk === 'high',
    capsule: o.contextTokens > p.capsuleThreshold,
    council: d.ambiguity >= p.councilAmbiguity && d.risk !== 'low',
    teacher: d.difficulty >= p.teacherDifficulty,
  };
}
export const policyCostProxy = (x: ReturnType<typeof decide>) =>
  (x.heavyProtocol ? 1 : 0) * 80 +
  (x.verify ? 1 : 0) * 600 +
  (x.capsule ? -900 : 0) +
  (x.council ? 1 : 0) * 2500 +
  (x.teacher ? 1 : 0) * 1800;

export interface PolicyEvaluation {
  n: number;
  confidence: ReturnType<typeof confidenceOf>;
  /** Observed quality of the missions where candidate and active policy take the SAME decision (replayable) — and of those where they differ. */
  agree: number;
  differ: number;
  qualityWhenDiffer: number | null;
  qualityWhenAgree: number | null;
  /** Estimated token proxy change (candidate − active) over the differing missions. */
  tokenProxyDelta: number;
  verdict: 'PROMOTE' | 'REJECT' | 'INSUFFICIENT DATA';
  why: string;
  label: 'OFFLINE ESTIMATE';
}
/**
 * Offline replay. For every logged mission that carries a cognitive diagnosis, compare the decisions of both policies.
 * Where they differ, the observed outcome of the mission is the only evidence about the alternative that exists, so the
 * verdict is conservative: promote only when n is sufficient, the candidate lowers the token proxy and the quality of the
 * differing missions is not significantly worse than the others.
 */
export function evaluatePolicy(
  active: MetaPolicy,
  candidate: MetaPolicy,
  runs: { entry: JevLogEntry; d: CognitiveDiagnosis; contextTokens: number }[],
): PolicyEvaluation {
  const rows = runs.map((r) => {
    const a = decide(active, r.d, r);
    const c = decide(candidate, r.d, r);
    return {
      q: qualityOfEntry(r.entry),
      same: JSON.stringify(a) === JSON.stringify(c),
      dp: policyCostProxy(c) - policyCostProxy(a),
    };
  });
  const n = rows.length;
  const differ = rows.filter((r) => !r.same);
  const agree = rows.filter((r) => r.same);
  const qd = differ.map((r) => r.q).filter((x): x is number => x !== null);
  const qa = agree.map((r) => r.q).filter((x): x is number => x !== null);
  const delta = differ.reduce((s, r) => s + r.dp, 0);
  const base = {
    n,
    confidence: confidenceOf(n),
    agree: agree.length,
    differ: differ.length,
    qualityWhenDiffer: mean(qd),
    qualityWhenAgree: mean(qa),
    tokenProxyDelta: delta,
    label: 'OFFLINE ESTIMATE' as const,
  };
  if (n < 20 || qd.length < 5 || qa.length < 5)
    return {
      ...base,
      verdict: 'INSUFFICIENT DATA',
      why: `échantillon insuffisant (n ${n}, différences mesurées ${qd.length}, accords mesurés ${qa.length}) : minimum 20 / 5 / 5`,
    };
  const d = welchDiff(qa, qd); // differing missions − agreeing missions
  const worse = d !== null && d.hi < -3;
  if (delta < 0 && !worse)
    return {
      ...base,
      verdict: 'PROMOTE',
      why: `proxy de tokens ${delta} sur les cas qui diffèrent, sans baisse significative de qualité`,
    };
  return {
    ...base,
    verdict: 'REJECT',
    why: worse
      ? 'les cas qui diffèrent ont une qualité significativement plus basse'
      : 'la politique candidate n’économise rien d’estimable',
  };
}
/** Applies the verdict; a policy is never promoted without a PROMOTE verdict. */
export function resolvePolicy(
  history: PolicyRecord[],
  candidate: MetaPolicy,
  ev: PolicyEvaluation,
  now = Date.now(),
): PolicyRecord[] {
  const active = history.find((p) => p.status === 'active')!;
  const rec: PolicyRecord = {
    policy: { ...candidate, version: Math.max(...history.map((h) => h.policy.version)) + 1 },
    status: ev.verdict === 'PROMOTE' ? 'promoted' : ev.verdict === 'REJECT' ? 'rejected' : 'candidate',
    createdAt: now,
    parent: active.policy.version,
    note: ev.why,
    evidence: ev,
  };
  return ev.verdict === 'PROMOTE'
    ? [
        ...history.map((h) => (h.status === 'active' ? { ...h, status: 'promoted' as const } : h)),
        { ...rec, status: 'active' },
      ]
    : [...history, rec];
}
export const INITIAL_POLICIES: PolicyRecord[] = [
  {
    policy: BASE_POLICY,
    status: 'active',
    createdAt: 0,
    parent: null,
    note: 'politique de départ (réglée à la main, non prouvée)',
  },
];
