// JEV FREE-FIRST ROUTER, quality gate, fallback controller and APPRENTICE SCORE.
// Priority: 1 free model already adapted by JEV → 2 free model with the best expertise profile → 3 compatible free
// model not yet adapted → (then the existing V5 router: paid specialist → Model Council → frontier).
import type { FreeModel } from '../fabric/council';
import type { DataClass } from '../fabric/types';
import type { ProviderPolicy } from '../fabric/security';
import { dimsOf, type Dimension } from '../fabric/learning';
import type { JevLogEntry } from '../metrics';
import { freeEligibility } from './dna';
import { familyEvidence, confidenceLevel, type ApprenticeProfile } from './registry';
import type { ApprenticeSettings, ApprenticeWeights, Confidence, Risk, TaskDNA } from './types';
import { DEFAULT_APPRENTICE } from './types';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// ───────────────────────── APPRENTICE SELECTION SCORE ─────────────────────────

export interface Features {
  success: number;
  quality: number;
  expertise: number;
  tool: number;
  structured: number;
  reliability: number;
  latency: number;
  cost: number;
}
/** Weights are renormalised; for HIGH / CRITICAL tasks quality, success and reliability weigh 1.5×. */
export function effectiveWeights(w: ApprenticeWeights, risk: Risk): ApprenticeWeights {
  const boost = risk === 'high' || risk === 'critical' ? 1.5 : 1;
  const raw = {
    ...w,
    success: w.success * boost,
    quality: w.quality * boost,
    reliability: w.reliability * boost,
  };
  const sum = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v / sum]),
  ) as unknown as ApprenticeWeights;
}
export function apprenticeScore(f: Features, w: ApprenticeWeights, risk: Risk = 'normal'): number {
  const e = effectiveWeights(w, risk);
  return (Object.keys(e) as (keyof Features)[]).reduce((a, k) => a + e[k] * clamp01(f[k]), 0);
}

// ───────────────────────── candidates ─────────────────────────

export interface ScoredFree {
  id: string;
  provider: string;
  tier: 1 | 2 | 3;
  tierLabel: string;
  score: number;
  features: Features;
  /** Smoothed success probability: measured when n > 0, otherwise a neutral prior flagged PROJECTED. */
  predictedSuccess: number;
  predictedBasis: 'MEASURED' | 'PROJECTED';
  predictedQuality: number | null;
  n: number;
  confidence: Confidence;
  health: number | null;
  degraded: string[];
  jevStatus: ApprenticeProfile['jevStatus'];
  reasons: string[];
}

export interface RouteInput {
  dna: TaskDNA;
  settings?: ApprenticeSettings;
  profiles: ApprenticeProfile[];
  pool: FreeModel[];
  classification?: DataClass;
  policyOf?: (provider: string) => ProviderPolicy | undefined;
  hasImages?: boolean;
  /** Models the Fabric / V5 lessons say to avoid for this task. */
  avoid?: string[];
  /** The task text (to find the dimensions it exercises). */
  text?: string;
  /** Cache-less deterministic exploration: the tie-break seed (default none). */
}

const SMOOTH_K = 2;
const smooth = (succ: number | null, n: number) =>
  succ === null || n === 0 ? 0.5 : (succ * n + 0.5 * SMOOTH_K) / (n + SMOOTH_K);
const TIER_LABEL = {
  1: 'FREE déjà adapté par JEV',
  2: 'FREE au meilleur profil d’expertise',
  3: 'FREE compatible non encore adapté',
} as const;

export function scoreFree(i: RouteInput, m: FreeModel): ScoredFree | null {
  const s = i.settings ?? DEFAULT_APPRENTICE;
  const p = i.profiles.find((x) => x.model === m.id);
  const elig = freeEligibility(i.dna, m, {
    classification: i.classification,
    policy: i.policyOf?.(m.provider),
    hasImages: i.hasImages,
  });
  if (!elig.eligible) return null;
  const dims = dimsOf({
    mission: i.text ?? '',
    task: i.dna.task_type,
    toolsUsed: [],
    contextBefore: 0,
  } as unknown as JevLogEntry) as Dimension[];
  const ev = p
    ? familyEvidence(p, i.dna.task_family, dims)
    : { n: 0, success: null, quality: null, source: 'none' as const };
  const degr = p?.degradation ?? { degraded: false, factor: 1, reasons: [] };
  const pred = clamp01(smooth(ev.success, ev.n) * degr.factor);
  const toolAcc =
    (dims.length && p
      ? dims.map((d) => p.expertise[d]?.toolAccuracy).find((x) => typeof x === 'number')
      : null) ?? null;
  const f: Features = {
    success: pred,
    quality: ev.quality === null ? 0.5 : ev.quality / 100,
    expertise: ev.success ?? 0.5,
    tool: i.dna.tool_requirements.length ? (m.tools ? (toolAcc ?? 0.6) : 0) : 1,
    structured: m.structuredOutputs ? 1 : i.dna.structured_output_requirement ? 0.5 : 0.8,
    reliability: clamp01(
      (p?.failureRate === null || p?.failureRate === undefined ? 0.5 : 1 - p.failureRate) * degr.factor,
    ),
    latency: p?.latencyMs == null ? 0.5 : clamp01(1 - p.latencyMs / 30_000),
    cost: 1,
  };
  const healthFactor = p?.health.score == null ? 1 : 0.5 + 0.5 * (p.health.score / 100);
  const tier: 1 | 2 | 3 =
    p && p.jevStatus !== 'FREE' && ev.n >= 3 && (ev.success ?? 0) >= 0.6 ? 1 : ev.n > 0 ? 2 : 3;
  return {
    id: m.id,
    provider: m.provider,
    tier,
    tierLabel: TIER_LABEL[tier],
    score: apprenticeScore(f, s.weights, i.dna.risk) * degr.factor * healthFactor,
    features: f,
    predictedSuccess: pred,
    predictedBasis: ev.n > 0 ? 'MEASURED' : 'PROJECTED',
    predictedQuality: ev.quality,
    n: ev.n,
    confidence: confidenceLevel(ev.n, ev.success),
    health: p?.health.score ?? null,
    degraded: degr.reasons,
    jevStatus: p?.jevStatus ?? 'FREE',
    reasons: [
      ...elig.reasons.slice(0, 2),
      ev.n
        ? `${ev.n} mission(s) sur « ${i.dna.task_family} » (${ev.source}) : réussite ${ev.success === null ? 'N/A' : `${Math.round(ev.success * 100)} %`}`
        : 'aucune expérience sur cette famille : probabilité a priori 50 % (PROJECTED)',
      ...(degr.degraded ? [`dégradation détectée : ${degr.reasons.join(' ; ')}`] : []),
    ],
  };
}

// ───────────────────────── attempts, gate, fallback ─────────────────────────

export type AttemptKind = 'free_jev' | 'free_correction' | 'free_other' | 'v5';
export interface Attempt {
  n: number;
  kind: AttemptKind;
  model: string | null;
  label: string;
}
export interface FreePlan {
  use: boolean;
  reason: string;
  chosen: ScoredFree | null;
  second: ScoredFree | null;
  candidates: ScoredFree[];
  confidence: Confidence;
  predictedSuccess: number | null;
  threshold: number;
  attempts: Attempt[];
  /** Why the free route was not used, when `use` is false. */
  bypass?: 'disabled' | 'no-candidate' | 'critical' | 'risk' | 'security';
  why: string[];
}

export function routeFreeFirst(i: RouteInput): FreePlan {
  const s = i.settings ?? DEFAULT_APPRENTICE;
  const base = {
    chosen: null,
    second: null,
    candidates: [],
    confidence: 'LOW' as Confidence,
    predictedSuccess: null,
    threshold: i.dna.quality_threshold,
    attempts: [] as Attempt[],
  };
  if (!s.enabled)
    return {
      ...base,
      use: false,
      bypass: 'disabled',
      reason: 'JEV Apprentice désactivé : routage V5 inchangé',
      why: [],
    };
  const avoid = new Set(i.avoid ?? []);
  const all = i.pool
    .map((m) => scoreFree(i, m))
    .filter((x): x is ScoredFree => x !== null && !avoid.has(x.id));
  const cands = all.sort((a, b) => a.tier - b.tier || b.score - a.score);
  if (!cands.length) {
    const blocked = i.classification && i.classification !== 'PUBLIC' && i.pool.length > 0;
    return {
      ...base,
      use: false,
      bypass: blocked ? 'security' : 'no-candidate',
      reason: blocked
        ? `route gratuite bloquée : aucune politique de fournisseur gratuit n’autorise des données ${i.classification}`
        : 'aucun modèle gratuit compatible avec la tâche',
      why: [],
    };
  }
  const chosen = cands[0]!;
  const second =
    cands.find((c) => c.id !== chosen.id && c.provider !== chosen.provider) ??
    cands.find((c) => c.id !== chosen.id) ??
    null;
  const risk = 1 - chosen.predictedSuccess;
  const out = {
    ...base,
    chosen,
    second,
    candidates: cands,
    confidence: chosen.confidence,
    predictedSuccess: chosen.predictedSuccess,
  };
  if (
    i.dna.risk === 'critical' &&
    (chosen.confidence !== 'HIGH' || chosen.predictedSuccess < s.criticalConfidence)
  )
    return {
      ...out,
      use: false,
      bypass: 'critical',
      reason: `tâche CRITIQUE et confiance ${chosen.confidence} (${Math.round(chosen.predictedSuccess * 100)} % < ${Math.round(s.criticalConfidence * 100)} %) : modèle premium directement`,
      why: [],
    };
  if (risk > s.maxFailureRisk[i.dna.risk])
    return {
      ...out,
      use: false,
      bypass: 'risk',
      reason: `risque d’échec attendu ${Math.round(risk * 100)} % > ${Math.round(s.maxFailureRisk[i.dna.risk] * 100)} % toléré pour une tâche ${i.dna.risk} : routage V5`,
      why: [],
    };
  // Confidence gate: LOW → one free attempt only (no time wasted), HIGH → free + correction + another free model.
  const attempts: Attempt[] = [{ n: 1, kind: 'free_jev', model: chosen.id, label: 'FREE + JEV' }];
  if (chosen.confidence !== 'LOW')
    attempts.push({ n: 2, kind: 'free_correction', model: chosen.id, label: 'FREE + correction ciblée' });
  if (chosen.confidence === 'HIGH' && second && s.maxFreeAttempts >= 3)
    attempts.push({ n: 3, kind: 'free_other', model: second.id, label: 'meilleur autre modèle gratuit' });
  attempts.push({
    n: attempts.length + 1,
    kind: 'v5',
    model: null,
    label: 'routage V5 (spécialiste payant → conseil → frontier)',
  });
  return {
    ...out,
    use: true,
    attempts,
    reason: `${chosen.tierLabel} : ${chosen.id} — réussite prévue ${Math.round(chosen.predictedSuccess * 100)} % (${chosen.predictedBasis}), confiance ${chosen.confidence}`,
    why: [
      `FREE-FIRST : ${cands.length} modèle(s) gratuit(s) compatible(s), ${chosen.id} classé 1er (score ${chosen.score.toFixed(3)})`,
      ...chosen.reasons,
      `confiance ${chosen.confidence} → ${attempts.length - 1} tentative(s) gratuite(s) puis V5`,
    ],
  };
}

/** The escalation ladder the existing cascade follows: other free model first, then the V5 ladder. */
export const ladderFor = (plan: FreePlan, v5Ladder: string[]): string[] => [
  ...new Set([
    ...(plan.use && plan.second && plan.attempts.some((a) => a.kind === 'free_other')
      ? [plan.second.id]
      : []),
    ...v5Ladder,
  ]),
];

// ───────────────────────── quality gate & fast validator ─────────────────────────

export type GateVerdict = 'ACCEPT' | 'CORRECT' | 'UNJUDGED';
export function qualityGate(score01: number | null, threshold: number): GateVerdict {
  if (score01 === null) return 'UNJUDGED';
  return score01 >= threshold ? 'ACCEPT' : 'CORRECT';
}

/** APPRENTICE SCORE of an answer from the measured quality vector (0–1). Missing dimensions are not invented. */
export const SCORE_WEIGHTS: Record<string, number> = {
  correctness: 0.25,
  completeness: 0.15,
  instruction_following: 0.15,
  factuality: 0.15,
  style: 0.05,
  tool_accuracy: 0.08,
  consistency: 0.07,
  efficiency: 0.1,
};
export function apprenticeAnswerScore(v: Record<string, number> | undefined | null): {
  score: number | null;
  parts: Record<string, number>;
} {
  if (!v) return { score: null, parts: {} };
  const parts: Record<string, number> = {};
  let w = 0;
  let a = 0;
  for (const [k, wk] of Object.entries(SCORE_WEIGHTS)) {
    const x = v[k];
    if (typeof x !== 'number' || !Number.isFinite(x)) continue;
    parts[k] = x;
    w += wk;
    a += wk * clamp01(x);
  }
  return { score: w ? a / w : null, parts };
}

/**
 * FALLBACK CONTROLLER: FREE → FREE + targeted correction → best other FREE → (V5: paid specialist → council → frontier).
 * Pure state machine: the runtime asks `next()` after each gate verdict.
 */
export class FallbackController {
  private i = 0;
  readonly history: { attempt: Attempt; verdict: GateVerdict; score: number | null }[] = [];
  constructor(readonly plan: FreePlan) {}
  get current(): Attempt | null {
    return this.plan.attempts[this.i] ?? null;
  }
  next(verdict: GateVerdict, score: number | null): Attempt {
    const at = this.current ?? { n: 0, kind: 'v5' as const, model: null, label: 'routage V5' };
    this.history.push({ attempt: at, verdict, score });
    if (verdict === 'ACCEPT') return at;
    // An unjudged answer is not a reason to burn more attempts: accept the free answer only if nothing contradicts it.
    if (verdict === 'UNJUDGED') return at;
    this.i = Math.min(this.i + 1, this.plan.attempts.length - 1);
    return this.current!;
  }
  get escalatedToV5(): boolean {
    return this.current?.kind === 'v5';
  }
}

/** A failure is not just a failure: the record that feeds FAILURE → PATTERN → CORRECTION → NEW SKILL → APPRENTICE UPDATE. */
export interface FailureRecord {
  task: string;
  family: string;
  model: string;
  prompt_strategy: string;
  skills: string[];
  tools: string[];
  failure_signature: string;
  validator_feedback: string;
  correction: string | null;
  fallback_model: string | null;
  final_success: boolean | null;
}
export function failureRecordOf(e: JevLogEntry): FailureRecord | null {
  const a = e.apprentice;
  if (!a || a.accepted || a.path.length < 2) return null;
  return {
    task: (e.instruction ?? e.mission).slice(0, 160),
    family: a.family,
    model: a.path[0]!,
    prompt_strategy: a.adapted ? 'capsule' : 'plain',
    skills: a.skills,
    tools: e.toolsUsed ?? [],
    failure_signature:
      e.failureNote?.slice(0, 80) ||
      `gate ${a.gateScore === null ? 'n/a' : a.gateScore.toFixed(2)} < ${a.threshold}`,
    validator_feedback: `qualité ${e.quality ?? 'N/A'}`,
    correction: e.corrections > 0 ? `${e.corrections} correction(s) ciblée(s)` : null,
    fallback_model: a.path.at(-1) ?? null,
    final_success: e.success,
  };
}
