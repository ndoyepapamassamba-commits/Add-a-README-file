// JEV APPRENTICE SUPREMACY ENGINE — validation, recency weighting, ApprenticeSupremacyScore, champions, premium override
// and the final routing rule. Everything is derived from the JEV_LOG (real runs). No data → INSUFFICIENT SAMPLE / N/A:
// a validation is never invented and a single success is never a validation.
import type { JevLogEntry } from '../metrics';
import { qualityOfEntry } from '../fabric/memory';
import { meanCI, wilson } from './intervals';
import { checkProvider, unknownPolicy, type ProviderCheck, type ProviderPolicy } from '../fabric/security';
import type { DataClass } from '../fabric/types';
import type { FreeModel } from '../fabric/council';
import { dimsOf } from '../fabric/learning';
import { domainOf } from './dna';
import {
  detectDegradation,
  familyOf,
  freeOutcome,
  isFreeId,
  confidenceLevel,
  type Degradation,
} from './registry';
import type {
  ApprenticeSettings,
  Confidence,
  JevStatus,
  Risk,
  SupremacyWeights,
  TaskDNA,
  ValidationRules,
} from './types';
import { DEFAULT_APPRENTICE, DEFAULT_SUPREMACY, DEFAULT_VALIDATION } from './types';

const DAY = 86_400_000;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// ───────────────────────── sample size ─────────────────────────

export type SampleLabel = 'INSUFFICIENT' | 'INDICATIVE' | 'ROBUST' | 'HIGH CONFIDENCE';
/** n < 5 insufficient · 5–19 indicative · 20–49 robust · ≥ 50 high confidence. */
export const sampleLabelOf = (n: number): SampleLabel =>
  n < 5 ? 'INSUFFICIENT' : n < 20 ? 'INDICATIVE' : n < 50 ? 'ROBUST' : 'HIGH CONFIDENCE';

// ───────────────────────── evidence ─────────────────────────

/** A run that counts as evidence for an ADAPTED apprentice (the plain baseline arm and the paid reference do not). */
export const isApprenticeEvidence = (e: JevLogEntry): boolean =>
  Boolean(e.apprentice?.adapted) && e.apprentice?.arm !== 'free' && e.apprentice?.arm !== 'paid';

/** A critical error: a safety breach (secret, leak) — never a mere low score. */
export const isCriticalError = (e: JevLogEntry): boolean =>
  (typeof e.qualityVector?.safety === 'number' && e.qualityVector.safety < 0.5) ||
  Boolean(e.failureNote && /secret|credential|fuite|leak|cl[ée] api/i.test(e.failureNote)) ||
  e.apprentice?.failure?.signature === 'SECURITY_VIOLATION';

const words = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .replace(/[^a-zà-ÿ ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
const jac = (a: Set<string>, b: Set<string>) => {
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  return a.size + b.size - i === 0 ? 1 : i / (a.size + b.size - i);
};
/** Distinct formulations: greedy clustering of the mission texts (Jaccard ≥ 0.8 = same formulation). */
export function distinctFormulations(texts: string[]): number {
  const groups: Set<string>[] = [];
  for (const t of texts) {
    const w = words(t);
    if (!groups.some((g) => jac(g, w) >= 0.8)) groups.push(w);
  }
  return groups.length;
}

export interface FamilyRecord {
  model: string;
  family: string;
  n: number;
  success: number | null;
  /** Recency-weighted (half-life = rules.halfLifeDays). */
  weightedSuccess: number | null;
  quality: number | null;
  weightedQuality: number | null;
  recentN: number;
  recentSuccess: number | null;
  formulations: number;
  criticalErrors: number;
  confidence: Confidence;
  sample: SampleLabel;
  latencyMs: number | null;
  tokens: number | null;
  totalCost: number | null;
  /** Share of missions handed to another model. */
  fallbackRate: number | null;
  errorRate: number | null;
  lastAt: number | null;
  degradation: Degradation;
  /** The same figures on the history BEFORE the recent window (to tell "was validated, now degraded"). */
  hist: {
    n: number;
    success: number | null;
    quality: number | null;
    formulations: number;
    criticalErrors: number;
  };
}

/** `runs` = this model's runs on this family. Handed-over missions count as failures of the free model (freeOutcome). */
export function familyRecord(
  runsRaw: JevLogEntry[],
  model: string,
  family: string,
  rules: ValidationRules = DEFAULT_VALIDATION,
  now = Date.now(),
): FamilyRecord {
  const raw = runsRaw.filter(isApprenticeEvidence);
  const runs = raw.map(freeOutcome).sort((a, b) => a.at - b.at);
  const judged = runs.filter((e) => e.success !== null);
  const w = (e: JevLogEntry) => Math.pow(0.5, Math.max(0, now - e.at) / (rules.halfLifeDays * DAY));
  const wmean = (f: (e: JevLogEntry) => number | null, es: JevLogEntry[]) => {
    let sw = 0;
    let s = 0;
    for (const e of es) {
      const v = f(e);
      if (v === null) continue;
      sw += w(e);
      s += w(e) * v;
    }
    return sw > 0 ? s / sw : null;
  };
  const success = judged.length ? judged.filter((e) => e.success).length / judged.length : null;
  const q = runs.map(qualityOfEntry).filter((x): x is number => x !== null);
  const k = Math.max(3, Math.ceil(judged.length / 3));
  const recent = judged.slice(-k);
  const errs = runs.filter((e) => e.failureNote);
  return {
    model,
    family,
    n: runs.length,
    success,
    weightedSuccess: wmean((e) => (e.success === null ? null : e.success ? 1 : 0), judged),
    quality: mean(q),
    weightedQuality: wmean(qualityOfEntry, runs),
    recentN: recent.length,
    recentSuccess: recent.length ? recent.filter((e) => e.success).length / recent.length : null,
    formulations: distinctFormulations(runs.map((e) => e.instruction ?? e.mission)),
    criticalErrors: runs.filter(isCriticalError).length,
    confidence: confidenceLevel(runs.length, success),
    sample: sampleLabelOf(runs.length),
    latencyMs: mean(runs.map((e) => e.latencyMs)),
    tokens: mean(runs.map((e) => e.acct?.totalTokens ?? e.tokensIn + e.tokensOut)),
    totalCost: mean(runs.map((e) => e.acct?.totalCost ?? e.cost + e.jevCost)),
    fallbackRate: raw.length
      ? raw.filter((e) => (e.apprentice?.path.length ?? 1) > 1).length / raw.length
      : null,
    errorRate: runs.length ? errs.length / runs.length : null,
    lastAt: runs.length ? runs[runs.length - 1]!.at : null,
    degradation: detectDegradation(runs),
    hist: (() => {
      const h = runs.filter((e) => !recent.includes(e));
      const hj = h.filter((e) => e.success !== null);
      return {
        n: h.length,
        success: hj.length ? hj.filter((e) => e.success).length / hj.length : null,
        quality: mean(h.map(qualityOfEntry).filter((x): x is number => x !== null)),
        formulations: distinctFormulations(h.map((e) => e.instruction ?? e.mission)),
        criticalErrors: h.filter(isCriticalError).length,
      };
    })(),
  };
}

// ───────────────────────── validation ─────────────────────────

export interface ValidationCheck {
  key: string;
  label: string;
  ok: boolean;
  actual: string;
  required: string;
}
export interface Validation {
  status: JevStatus;
  checks: ValidationCheck[];
  /** True when the sample is too small to decide: the model can NOT become VALIDATED. */
  insufficient: boolean;
  reasons: string[];
  /** What a DEGRADED apprentice falls back to for routing purposes. */
  demotedTo: JevStatus | null;
}
const CONF_RANK: Record<Confidence, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const pct = (x: number | null) => (x === null ? 'N/A' : `${(x * 100).toFixed(1)} %`);

export function thresholdsFor(risk: Risk, r: ValidationRules): { success: number; quality: number } {
  return risk === 'critical'
    ? r.critical
    : risk === 'high'
      ? r.high
      : { success: r.minSuccess, quality: r.minQuality };
}

/** FREE → ADAPTED → SPECIALIST → VALIDATED (or DEGRADED). Pure; all thresholds configurable. */
export function validateRecord(
  rec: FamilyRecord,
  risk: Risk = 'normal',
  rules: ValidationRules = DEFAULT_VALIDATION,
): Validation {
  const th = thresholdsFor(risk, rules);
  const checks: ValidationCheck[] = [
    {
      key: 'n',
      label: 'missions',
      ok: rec.n >= rules.minMissions,
      actual: String(rec.n),
      required: `≥ ${rules.minMissions}`,
    },
    {
      key: 'formulations',
      label: 'formulations différentes',
      ok: rec.formulations >= rules.minFormulations,
      actual: String(rec.formulations),
      required: `≥ ${rules.minFormulations}`,
    },
    {
      key: 'success',
      label: 'réussite',
      ok: (rec.success ?? 0) >= th.success,
      actual: pct(rec.success),
      required: `≥ ${(th.success * 100).toFixed(0)} %`,
    },
    {
      key: 'quality',
      label: 'qualité',
      ok: (rec.quality ?? 0) >= th.quality,
      actual: rec.quality === null ? 'N/A' : rec.quality.toFixed(1),
      required: `≥ ${th.quality}`,
    },
    {
      key: 'critical',
      label: 'erreurs critiques',
      ok: rec.criticalErrors <= rules.maxCriticalErrors,
      actual: String(rec.criticalErrors),
      required: `≤ ${rules.maxCriticalErrors}`,
    },
    {
      key: 'recent',
      label: 'réussite récente',
      ok: (rec.recentSuccess ?? 0) >= rules.minRecentSuccess,
      actual: pct(rec.recentSuccess),
      required: `≥ ${(rules.minRecentSuccess * 100).toFixed(0)} %`,
    },
    {
      key: 'confidence',
      label: 'confiance',
      ok: CONF_RANK[rec.confidence] >= CONF_RANK[rules.minConfidence],
      actual: rec.confidence,
      required: `≥ ${rules.minConfidence}`,
    },
  ];
  const insufficient = rec.n < rules.minMissions || rec.formulations < rules.minFormulations;
  const allOk = checks.every((c) => c.ok);
  const specialist = rec.n >= 5 && (rec.success ?? 0) >= 0.8;
  const base: JevStatus = rec.n === 0 ? 'FREE' : specialist ? 'SPECIALIST' : 'ADAPTED';
  const reasons = checks.filter((c) => !c.ok).map((c) => `${c.label} ${c.actual} (requis ${c.required})`);
  if (insufficient)
    return {
      status: base,
      checks,
      insufficient: true,
      reasons: ['INSUFFICIENT SAMPLE', ...reasons],
      demotedTo: null,
    };
  // Recent behaviour decides DEGRADED: the apprentice qualified on its history but its recent runs (or the provider) got worse.
  const recentBad =
    rec.degradation.degraded || ((rec.recentSuccess ?? 1) < rules.minRecentSuccess && rec.recentN >= 3);
  const h = rec.hist;
  const histOk =
    h.n >= rules.minMissions &&
    h.formulations >= rules.minFormulations &&
    (h.success ?? 0) >= th.success &&
    (h.quality ?? 0) >= th.quality &&
    h.criticalErrors <= rules.maxCriticalErrors;
  if (recentBad && histOk) {
    const severe = (rec.recentSuccess ?? 1) < 0.6;
    return {
      status: 'DEGRADED',
      checks,
      insufficient: false,
      reasons: [...rec.degradation.reasons, ...reasons],
      demotedTo: severe ? 'ADAPTED' : 'SPECIALIST',
    };
  }
  if (allOk) return { status: 'VALIDATED', checks, insufficient: false, reasons: [], demotedTo: null };
  return { status: base, checks, insufficient: false, reasons, demotedTo: null };
}

/** Routing priority of a status (higher wins). */
export const STATUS_RANK: Record<JevStatus, number> = {
  VALIDATED: 4,
  SPECIALIST: 3,
  ADAPTED: 2,
  FREE: 1,
  DEGRADED: 0,
};

// ───────────────────────── supremacy score ─────────────────────────

export interface SupremacyFeatures {
  task: number;
  quality: number;
  success: number;
  confidence: number;
  reliability: number;
  tool: number;
  structured: number;
  latency: number;
  economic: number;
}
/** Weights normalised; for HIGH / CRITICAL tasks quality, success, reliability and confidence weigh 1.5×. */
export function supremacyWeights(w: SupremacyWeights, risk: Risk): SupremacyWeights {
  const b = risk === 'high' || risk === 'critical' ? 1.5 : 1;
  const raw = {
    ...w,
    quality: w.quality * b,
    success: w.success * b,
    reliability: w.reliability * b,
    confidence: w.confidence * b,
  };
  const sum = Object.values(raw).reduce((a, x) => a + x, 0) || 1;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v / sum])) as unknown as SupremacyWeights;
}
export const STATUS_FACTOR: Record<JevStatus, number> = {
  VALIDATED: 1,
  SPECIALIST: 0.9,
  ADAPTED: 0.75,
  FREE: 0.6,
  DEGRADED: 0.5,
};
export function supremacyScore(
  f: SupremacyFeatures,
  w: SupremacyWeights = DEFAULT_SUPREMACY,
  risk: Risk = 'normal',
  status: JevStatus = 'VALIDATED',
  degradation = 1,
): number {
  const e = supremacyWeights(w, risk);
  const s = (Object.keys(e) as (keyof SupremacyFeatures)[]).reduce((a, k) => a + e[k] * clamp01(f[k]), 0);
  return s * STATUS_FACTOR[status] * degradation;
}

// ───────────────────────── candidates ─────────────────────────

export interface PremiumRef {
  model: string;
  n: number;
  quality: number | null;
  success: number | null;
  /** Total mission cost (USD, measured). */
  cost: number | null;
  latencyMs: number | null;
  sample: SampleLabel;
  /** Last time this reference was measured (ms epoch). */
  lastMeasured: number | null;
  /** Success rate Wilson interval and quality mean interval (95 %), when computable. */
  successCI: { lo: number; hi: number } | null;
  qualityCI: { lo: number; hi: number } | null;
  /** Label of the sample size (INSUFFICIENT / INDICATIVE / ROBUST / HIGH CONFIDENCE). */
  confidence: SampleLabel;
  /** Always "REFERENCE PREMIUM MESURÉE": a measured reference, not ground truth. */
  kind: 'REFERENCE PREMIUM MESURÉE';
}

export interface SupremacyInput {
  dna: TaskDNA;
  settings?: ApprenticeSettings;
  log: JevLogEntry[];
  pool: FreeModel[];
  classification?: DataClass;
  policyOf?: (provider: string) => ProviderPolicy | undefined;
  hasImages?: boolean;
  avoid?: string[];
  /** The latest profile version status per "model|family" (rolled_back versions disqualify). */
  rolledBack?: Set<string>;
  now?: number;
}
export interface ApprenticeCandidate {
  model: string;
  provider: string;
  family: string;
  record: FamilyRecord;
  validation: Validation;
  status: JevStatus;
  score: number;
  features: SupremacyFeatures;
  security: ProviderCheck;
  caps: { tools: boolean; vision: boolean; structured: boolean; context: boolean };
  match: 'family' | 'domain' | 'type';
  reasons: string[];
}

const matchOf = (dna: TaskDNA, fam: string): { m: ApprenticeCandidate['match']; v: number } | null => {
  if (fam === dna.task_family) return { m: 'family', v: 1 };
  const [t, d] = fam.split(':');
  if (d && d === dna.domain && d !== t) return { m: 'domain', v: 0.6 };
  return null;
};

function ci(
  es: JevLogEntry[],
  q: number[],
): { successCI: { lo: number; hi: number } | null; qualityCI: { lo: number; hi: number } | null } {
  const w = wilson(es.filter((e) => e.success).length, es.length);
  const m = meanCI(q);
  return { successCI: w ? { lo: w.lo, hi: w.hi } : null, qualityCI: m ? { lo: m.lo, hi: m.hi } : null };
}

/** Premium reference of a family: the paid model with the best measured quality on it (n ≥ 1, sample labelled). */
export function premiumReference(log: JevLogEntry[], family: string): PremiumRef | null {
  const by = new Map<string, JevLogEntry[]>();
  for (const e of log)
    if (
      e.model &&
      e.model !== 'JEV-0' &&
      !isFreeId(e.model) &&
      e.success !== null &&
      familyOf(e) === family &&
      (e.apprentice?.path.length ?? 1) <= 1
    )
      by.set(e.model, [...(by.get(e.model) ?? []), e]);
  const rows = [...by].map(([model, es]) => {
    const q = es.map(qualityOfEntry).filter((x): x is number => x !== null);
    return {
      model,
      n: es.length,
      quality: mean(q),
      success: es.filter((e) => e.success).length / es.length,
      cost: mean(es.map((e) => e.acct?.totalCost ?? e.cost + e.jevCost)),
      latencyMs: mean(es.map((e) => e.latencyMs)),
      sample: sampleLabelOf(es.length),
      lastMeasured: Math.max(...es.map((e) => e.at)),
      ...ci(es, q),
      confidence: sampleLabelOf(es.length),
      kind: 'REFERENCE PREMIUM MESURÉE' as const,
    };
  });
  return rows.sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0) || b.n - a.n)[0] ?? null;
}

/** Every free model with measured evidence on this family (or its domain), ranked by status then supremacy score. */
export function rankApprentices(i: SupremacyInput): ApprenticeCandidate[] {
  const s = i.settings ?? DEFAULT_APPRENTICE;
  const rules = s.validation ?? DEFAULT_VALIDATION;
  const now = i.now ?? Date.now();
  const avoid = new Set(i.avoid ?? []);
  const level = i.classification ?? 'PUBLIC';
  const premium = premiumReference(i.log, i.dna.task_family);
  const out: ApprenticeCandidate[] = [];
  for (const m of i.pool) {
    if (avoid.has(m.id)) continue;
    const runs = i.log.filter((e) => e.model === m.id && e.apprentice && familyOf(e));
    const fams = new Set(runs.map(familyOf));
    for (const fam of fams) {
      const mt = matchOf(i.dna, fam);
      if (!mt) continue;
      const rec = familyRecord(
        runs.filter((e) => familyOf(e) === fam),
        m.id,
        fam,
        rules,
        now,
      );
      let val = validateRecord(rec, i.dna.risk, rules);
      if (val.status === 'VALIDATED' && i.rolledBack?.has(`${m.id}|${fam}`))
        val = { ...val, status: 'SPECIALIST', reasons: ['version de profil annulée (ROLLBACK)'] };
      const needsTools = i.dna.tool_requirements.length > 0;
      const caps = {
        tools: !needsTools || m.tools,
        vision: !i.hasImages || m.vision,
        structured: !i.dna.structured_output_requirement || m.structuredOutputs,
        context: m.contextLength >= i.dna.context_size * 2 + 2000,
      };
      const security = checkProvider(level, i.policyOf?.(m.provider) ?? unknownPolicy(m.provider), {
        free: true,
      });
      const f: SupremacyFeatures = {
        task: mt.v,
        quality: (rec.weightedQuality ?? 0) / 100,
        success: rec.weightedSuccess ?? 0,
        confidence: rec.n / (rec.n + 10),
        reliability: clamp01(
          (1 - (rec.errorRate ?? 0.5)) * (1 - 0.5 * (rec.fallbackRate ?? 0.5)) * rec.degradation.factor,
        ),
        tool: needsTools ? (m.tools ? 0.8 : 0) : 1,
        structured: m.structuredOutputs ? 1 : i.dna.structured_output_requirement ? 0.5 : 0.8,
        latency: rec.latencyMs === null ? 0.5 : clamp01(1 - rec.latencyMs / 30_000),
        economic:
          premium?.cost && rec.totalCost !== null && premium.cost > 0
            ? clamp01(1 - rec.totalCost / premium.cost)
            : 1,
      };
      out.push({
        model: m.id,
        provider: m.provider,
        family: fam,
        record: rec,
        validation: val,
        status: val.status,
        score: supremacyScore(
          f,
          s.supremacy ?? DEFAULT_SUPREMACY,
          i.dna.risk,
          val.status,
          rec.degradation.factor,
        ),
        features: f,
        security,
        caps,
        match: mt.m,
        reasons: val.reasons,
      });
    }
  }
  // One entry per model: its best family match.
  const best = new Map<string, ApprenticeCandidate>();
  for (const c of out) {
    const cur = best.get(c.model);
    if (
      !cur ||
      (c.match === 'family' && cur.match !== 'family') ||
      (c.match === cur.match && c.score > cur.score)
    )
      best.set(c.model, c);
  }
  return [...best.values()].sort(
    (a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status] || b.score - a.score,
  );
}

// ───────────────────────── premium override & final rule ─────────────────────────

export interface OverrideResult {
  bypass: boolean;
  /** A hard stop (security, capability, critical, freshness): no free level may be tried at all. */
  hard: boolean;
  reasons: string[];
}
/** PREMIUM OVERRIDE: even a VALIDATED apprentice is bypassed when the free route can't guarantee the task. */
export function premiumOverride(
  i: { dna: TaskDNA; settings?: ApprenticeSettings; classification?: DataClass },
  c: ApprenticeCandidate,
): OverrideResult {
  const s = i.settings ?? DEFAULT_APPRENTICE;
  const rules = s.validation ?? DEFAULT_VALIDATION;
  const reasons: string[] = [];
  let hard = false;
  const level = i.classification ?? 'PUBLIC';
  if (level !== 'PUBLIC' && c.security.action !== 'allow') {
    reasons.push(`politique de sécurité : ${c.security.reason}`);
    hard = true;
  }
  if (!c.caps.tools || !c.caps.vision || !c.caps.structured || !c.caps.context) {
    reasons.push(
      `capacité manquante (${[!c.caps.tools && 'outils', !c.caps.vision && 'vision', !c.caps.structured && 'sortie structurée', !c.caps.context && 'contexte'].filter(Boolean).join(', ')})`,
    );
    hard = true;
  }
  if (i.dna.freshness_requirement) {
    reasons.push(
      'exigence de fraîcheur : un modèle gratuit sans navigation web ne garantit pas des faits récents',
    );
    hard = true;
  }
  if (i.dna.risk === 'critical') {
    const th = rules.critical;
    if ((c.record.quality ?? 0) < th.quality || (c.record.success ?? 0) < th.success) {
      reasons.push(
        `tâche critique : seuil de qualité non garanti (${c.record.quality?.toFixed(1) ?? 'N/A'} / ${th.quality}, réussite ${pct(c.record.success)} / ${(th.success * 100).toFixed(0)} %)`,
      );
      hard = true;
    }
    if (c.record.confidence !== 'HIGH') {
      reasons.push(`tâche critique : confiance ${c.record.confidence} < HIGH`);
      hard = true;
    }
  }
  if (c.status === 'DEGRADED')
    reasons.push(
      `modèle dégradé : ${c.record.degradation.reasons.join(' ; ') || 'performances récentes en baisse'}`,
    );
  return { bypass: reasons.length > 0, hard, reasons };
}

export interface FinalRule {
  use: boolean;
  checks: { key: string; ok: boolean; label: string }[];
}
/** The production rule: use the VALIDATED free apprentice only when every gate passes, else current V5 routing. */
export function finalRule(
  i: { dna: TaskDNA; settings?: ApprenticeSettings; classification?: DataClass },
  c: ApprenticeCandidate | null,
): FinalRule {
  const s = i.settings ?? DEFAULT_APPRENTICE;
  const o = c ? premiumOverride(i, c) : null;
  const need: Confidence = i.dna.risk === 'critical' ? 'HIGH' : s.validation.minConfidence;
  const checks = [
    { key: 'exists', ok: Boolean(c && c.status === 'VALIDATED'), label: 'validatedApprentice.exists' },
    {
      key: 'confidence',
      ok: Boolean(c && CONF_RANK[c.record.confidence] >= CONF_RANK[need]),
      label: `confidence ≥ ${need}`,
    },
    {
      key: 'quality',
      ok: Boolean(c && (c.record.quality ?? 0) >= i.dna.quality_threshold * 100),
      label: `quality ≥ ${Math.round(i.dna.quality_threshold * 100)}`,
    },
    {
      key: 'health',
      ok: Boolean(c && !c.record.degradation.degraded && c.status !== 'DEGRADED'),
      label: 'health = healthy',
    },
    {
      key: 'security',
      ok: Boolean(
        c &&
        (i.classification === undefined || i.classification === 'PUBLIC' || c.security.action === 'allow'),
      ),
      label: 'security = allowed',
    },
    {
      key: 'capabilities',
      ok: Boolean(c && c.caps.tools && c.caps.vision && c.caps.structured && c.caps.context),
      label: 'capabilities = sufficient',
    },
    { key: 'risk', ok: Boolean(c && o && !o.bypass), label: 'riskGate = PASS' },
  ];
  return { use: checks.every((x) => x.ok), checks };
}

/** getValidatedApprentice(taskDNA): the best candidate that passes the final rule, plus the others in order. */
export function getValidatedApprentice(i: SupremacyInput): {
  champion: ApprenticeCandidate | null;
  ranked: ApprenticeCandidate[];
  overridden: { model: string; reasons: string[] }[];
  hard: string[];
} {
  const ranked = rankApprentices(i);
  const overridden: { model: string; reasons: string[] }[] = [];
  const hard: string[] = [];
  let champion: ApprenticeCandidate | null = null;
  for (const c of ranked.filter((x) => x.status === 'VALIDATED')) {
    const fr = finalRule(i, c);
    if (fr.use) {
      champion = c;
      break;
    }
    const o = premiumOverride(i, c);
    overridden.push({
      model: c.model,
      reasons: o.reasons.length ? o.reasons : fr.checks.filter((x) => !x.ok).map((x) => x.label),
    });
    if (o.hard) hard.push(...o.reasons);
  }
  return { champion, ranked, overridden, hard };
}

// ───────────────────────── champions (per family) ─────────────────────────

export interface Champion {
  family: string;
  model: string;
  provider: string;
  status: JevStatus;
  quality: number | null;
  success: number | null;
  n: number;
  confidence: Confidence;
  sample: SampleLabel;
  latencyMs: number | null;
  /** Model cost is $0; this is the total mission cost incl. JEV / Teacher / tools. */
  totalCost: number | null;
  fallback: string | null;
  premium: PremiumRef | null;
  /** champion quality − premium quality (points), null if either is unknown. */
  premiumDelta: number | null;
  lastValidation: number | null;
  version: string | null;
  supremacy: boolean;
}
/** CURRENT CHAMPION FOR THIS TASK FAMILY — only with its evidence (n, quality, success, confidence, date). */
export function champions(
  log: JevLogEntry[],
  pool: FreeModel[],
  o: {
    settings?: ApprenticeSettings;
    versions?: { model: string; family: string; id: string; status: string }[];
    now?: number;
  } = {},
): Champion[] {
  const s = o.settings ?? DEFAULT_APPRENTICE;
  const fams = new Set(log.filter((e) => isFreeId(e.model) && isApprenticeEvidence(e)).map(familyOf));
  const out: Champion[] = [];
  for (const family of fams) {
    const [task, domain] = family.split(':');
    const dna = {
      task_type: task ?? 'chat',
      task_family: family,
      domain: domain ?? 'chat',
      risk: 'normal',
      tool_requirements: [],
      structured_output_requirement: false,
      context_size: 0,
      freshness_requirement: false,
      quality_threshold: 0.9,
    } as unknown as TaskDNA;
    const rb = new Set(
      (o.versions ?? []).filter((v) => v.status === 'rolled_back').map((v) => `${v.model}|${v.family}`),
    );
    const ranked = rankApprentices({ dna, settings: s, log, pool, rolledBack: rb, now: o.now }).filter(
      (c) => c.family === family && c.status !== 'FREE',
    );
    const top = ranked[0];
    if (!top) continue;
    const second = ranked.find((c) => c.model !== top.model);
    const prem = premiumReference(log, family);
    out.push({
      family,
      model: top.model,
      provider: top.provider,
      status: top.status,
      quality: top.record.quality,
      success: top.record.success,
      n: top.record.n,
      confidence: top.record.confidence,
      sample: top.record.sample,
      latencyMs: top.record.latencyMs,
      totalCost: top.record.totalCost,
      fallback: second?.model ?? null,
      premium: prem,
      premiumDelta:
        top.record.quality !== null && prem?.quality != null ? top.record.quality - prem.quality : null,
      lastValidation: top.record.lastAt,
      version:
        (o.versions ?? [])
          .filter((v) => v.model === top.model && v.family === family)
          .map((v) => v.id)
          .at(-1) ?? null,
      supremacy: top.status === 'VALIDATED',
    });
  }
  return out.sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status] || b.n - a.n);
}

/** Free model × task domain matrix (quality, success, n, confidence, status). */
export interface MatrixCell {
  quality: number | null;
  success: number | null;
  n: number;
  confidence: Confidence;
  status: JevStatus;
}
export function apprenticeMatrix(
  log: JevLogEntry[],
  pool: FreeModel[],
  rules: ValidationRules = DEFAULT_VALIDATION,
  now = Date.now(),
): { domains: string[]; models: string[]; cells: Record<string, Record<string, MatrixCell>> } {
  const runs = log.filter((e) => e.model && isFreeId(e.model) && e.apprentice && isApprenticeEvidence(e));
  const ids = new Set([...pool.map((p) => p.id), ...runs.map((e) => e.model)]);
  const doms = new Set<string>();
  const cells: Record<string, Record<string, MatrixCell>> = {};
  for (const m of ids) {
    const mr = runs.filter((e) => e.model === m);
    if (!mr.length) continue;
    cells[m] = {};
    for (const d of new Set(mr.map((e) => familyOf(e).split(':')[1] ?? 'chat'))) {
      const dr = mr.filter((e) => (familyOf(e).split(':')[1] ?? 'chat') === d);
      const rec = familyRecord(dr, m, d, rules, now);
      const v = validateRecord(rec, 'normal', rules);
      doms.add(d);
      cells[m]![d] = {
        quality: rec.quality,
        success: rec.success,
        n: rec.n,
        confidence: rec.confidence,
        status: v.status,
      };
    }
  }
  return { domains: [...doms].sort(), models: Object.keys(cells), cells };
}

export { domainOf, dimsOf };
