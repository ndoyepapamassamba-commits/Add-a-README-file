// Evidence-based routing: the decision layer above the tier router.
// TASK DNA → requirements → candidates (value ranking) → evidence fusion →
// weighted routing score → the CHEAPEST model that reaches the required
// quality wins → explanation (why this model, why not the premium one, what
// the fallback is, what would trigger escalation) → cascade (cheap first, QA,
// escalate only when needed, stop before wasting budget).
// The tier router (routeModel) stays the fallback when no evidence exists.
import type { ModelInfo } from '@shared/types';
import type { AutoTiers } from '../services/settings';
import {
  METRIC_LABEL,
  QUALITY_TIERS,
  TIER_LABEL,
  TIER_MIN_INTEL,
  estimateTaskCost,
  metricFor,
  rankByValue,
  reliability,
  routeModel,
  type HealthMap,
  type LeaderboardMap,
  type QualityTier,
  type RankedModel,
  type TaskProfile,
} from '../llm/routing';
import { intelMax } from '../llm/modelIntel';
import type { BenchResult, TaskDna } from '../agent/intelligence';
import { benchmarkVsReality, fuse, modelEvidence, type ExternalBenchmark } from './evidence';

export interface RoutingWeights {
  success: number;
  intelligence: number;
  tooling: number;
  agentic: number;
  reliability: number;
  latency: number;
  cost: number;
}
export const DEFAULT_WEIGHTS: RoutingWeights = {
  success: 0.35,
  intelligence: 0.2,
  tooling: 0.15,
  agentic: 0.1,
  reliability: 0.1,
  latency: 0.05,
  cost: 0.05,
};
export const WEIGHT_LABEL: Record<keyof RoutingWeights, string> = {
  success: 'Probabilité de réussite',
  intelligence: 'Raisonnement / intelligence',
  tooling: 'Outils / code',
  agentic: 'Capacité agentique',
  reliability: 'Fiabilité',
  latency: 'Latence',
  cost: 'Efficacité coût',
};

export interface EngineSettings {
  weights: RoutingWeights;
  /** QA score (0–100) under which the cascade escalates. */
  qaThreshold: number;
  /** Maximum number of model escalations per mission. */
  maxEscalations: number;
  /** Models above this blended price ($/M) are never chosen automatically (0 = no cap). */
  maxPricePerM: number;
}
export const DEFAULT_ENGINE: EngineSettings = {
  weights: DEFAULT_WEIGHTS,
  qaThreshold: 75,
  maxEscalations: 2,
  maxPricePerM: 0,
};

/** Minimum weighted quality (0–100) per tier — on top of the tier's benchmark threshold. */
export const QUALITY_FLOOR: Record<QualityTier, number> = {
  cheap: 50,
  balanced: 60,
  quality: 70,
  maximum: 78,
};

export interface Requirements {
  type: TaskProfile['type'];
  tier: QualityTier;
  complexity: number;
  risk: string[];
  criticality: TaskDna['criticality'];
  metric: ReturnType<typeof metricFor>;
  /** Minimum raw index on the task metric. */
  minIndex: number;
  qualityFloor: number;
  reasoning: boolean;
  coding: boolean;
  toolUse: boolean;
  agentic: boolean;
  vision: boolean;
  contextTokens: number;
  speed: 'normale' | 'rapide';
  budgetUsd: number | null;
}

export function requirements(p: TaskProfile, dna: TaskDna | null, budgetUsd: number | null): Requirements {
  const metric = metricFor(p.type);
  return {
    type: p.type,
    tier: p.tier,
    complexity: p.difficulty,
    risk: dna?.risks ?? [],
    criticality: dna?.criticality ?? 'normal',
    metric,
    minIndex: TIER_MIN_INTEL[p.tier] * intelMax(metric),
    qualityFloor: QUALITY_FLOOR[p.tier],
    reasoning: p.difficulty >= 0.55,
    coding: p.type === 'code',
    toolUse: p.type !== 'chat' && p.type !== 'writing',
    agentic: p.type === 'browser' || p.team.length > 1,
    vision: p.needsVision,
    contextTokens: p.contextTokens,
    speed: p.difficulty < 0.3 ? 'rapide' : 'normale',
    budgetUsd,
  };
}

export type Dim = keyof RoutingWeights;
export interface ScoredCandidate {
  id: string;
  name: string;
  provider: string;
  tier: QualityTier;
  price: number;
  estimate: { low: number; high: number } | null;
  dims: Record<Dim, number>;
  /** Which dimensions are measured (others are MASSAMBA estimates). */
  measured: Record<Dim, boolean>;
  quality: number;
  routing: number;
  pSuccess: number;
  costPerSuccess: number;
  evidenceConfidence: number;
  contradiction: string | null;
  raw: number;
  metric: string;
  ref: string;
  excluded?: string;
}

export interface Explanation {
  model: string;
  agent: string;
  skills: string;
  mcp: string;
  tools: string;
  notPremium: string;
  fallback: string;
  escalation: string[];
}

export interface RoutingDecision {
  at: number;
  mission: string;
  mode: 'evidence' | 'tiers' | 'default';
  requirements: Requirements;
  tier: QualityTier;
  chosen: ScoredCandidate | null;
  fallbacks: ScoredCandidate[];
  premium: ScoredCandidate | null;
  ladder: ScoredCandidate[];
  candidates: ScoredCandidate[];
  rejected: { id: string; reason: string }[];
  confidence: number;
  budget: { ok: boolean; left: number | null; note: string };
  why: Explanation;
  agent?: string;
  skills?: string[];
  mcp?: string[];
  tools?: string[];
  weights: RoutingWeights;
}

export interface DecideInput {
  models: ModelInfo[];
  tiers: AutoTiers;
  profile: TaskProfile;
  dna: TaskDna | null;
  text: string;
  health?: HealthMap;
  board?: LeaderboardMap;
  bench?: BenchResult[];
  external?: ExternalBenchmark[];
  /** Measured average latency per call, ms. */
  latency?: Record<string, number>;
  settings?: Partial<EngineSettings>;
  /** USD still available for this mission (min of per-task and daily budget left); null = no limit. */
  budgetLeft?: number | null;
  mission?: boolean;
  /** Loadout chosen around the model (for the explanation). */
  loadout?: {
    agent: string;
    agentWhy: string;
    skills: string[];
    skillsWhy: string;
    mcp: string[];
    mcpWhy: string;
    tools: string[];
  };
  now?: number;
}

const clamp = (x: number, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const pct = (x: number) => `${Math.round(x * 100)} %`;
const usd = (x: number) => (x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(3)}`);

function score(
  r: RankedModel,
  tier: QualityTier,
  inp: DecideInput,
  w: RoutingWeights,
  cheapest: number,
): ScoredCandidate {
  const m = r.m;
  const ev = modelEvidence(m, {
    board: inp.board,
    bench: inp.bench,
    external: inp.external,
    type: inp.profile.type,
    now: inp.now,
  });
  const fi = fuse(ev, 'intelligence');
  const fc = fuse(ev, 'coding');
  const fa = fuse(ev, 'agentic');
  const intel = fi.value ?? r.score;
  const tooling = fc.value ?? intel * 0.9;
  const agentic = fa.value ?? intel * 0.85;
  // Prior success probability from the task metric, updated by your own missions (Beta, strength 4).
  const rel = inp.profile.type === 'code' ? tooling : inp.profile.type === 'browser' ? agentic : intel;
  const p0 = clamp(0.35 + (0.6 * (rel - 50)) / 50, 0.3, 0.95);
  const board = inp.board ?? {};
  const rec = board[`${inp.profile.type}|${m.id}`] ?? board[m.id];
  const n = rec ? rec.won + rec.lost : 0;
  const pSuccess = rec ? (rec.won + 4 * p0) / (n + 4) : p0;
  const lat = inp.latency?.[m.id];
  const dims: Record<Dim, number> = {
    success: pSuccess * 100,
    intelligence: intel,
    tooling,
    agentic,
    reliability: reliability(inp.health ?? {}, m.id) * 100,
    latency: lat === undefined ? 50 : clamp(100 - (lat - 3000) / 300),
    cost: clamp((cheapest / r.price) * 100, 1),
  };
  const measured: Record<Dim, boolean> = {
    success: n > 0,
    intelligence: fi.value !== null && !r.estimated,
    tooling: fc.value !== null,
    agentic: fa.value !== null && ev.some((e) => e.kind === 'benchmark' && e.dimension === 'agentic'),
    reliability: Boolean(inp.health?.[m.id]),
    latency: lat !== undefined,
    cost: true,
  };
  const keys = Object.keys(w) as Dim[];
  const sumW = keys.reduce((s, k) => s + w[k], 0) || 1;
  const qW = keys.filter((k) => k !== 'cost').reduce((s, k) => s + w[k], 0) || 1;
  const routing = keys.reduce((s, k) => s + w[k] * dims[k], 0) / sumW;
  const quality = keys.filter((k) => k !== 'cost').reduce((s, k) => s + w[k] * dims[k], 0) / qW;
  const estimate = estimateTaskCost(m, inp.profile, Boolean(inp.mission));
  const mid = estimate ? (estimate.low + estimate.high) / 2 : r.price;
  const contradiction =
    benchmarkVsReality(ev) ??
    (fi.contradictory ? `sources en désaccord (${fi.spread.toFixed(0)} points)` : null);
  const evidenceConfidence = clamp(
    (fi.confidence || 0.3) *
      (r.estimated ? 0.8 : 1) *
      (contradiction ? 0.75 : 1) *
      (0.85 + 0.15 * Math.min(1, n / 5)),
    0,
    1,
  );
  return {
    id: m.id,
    name: m.name,
    provider: m.provider,
    tier,
    price: r.price,
    estimate,
    dims,
    measured,
    quality,
    routing,
    pSuccess,
    costPerSuccess: mid / Math.max(0.05, pSuccess),
    evidenceConfidence,
    contradiction,
    raw: r.raw,
    metric: METRIC_LABEL[r.metric],
    ref: r.ref,
  };
}

/** The routing decision for a mission, fully explained. */
export function decideRoute(inp: DecideInput): RoutingDecision {
  const s = { ...DEFAULT_ENGINE, ...inp.settings, weights: { ...DEFAULT_WEIGHTS, ...inp.settings?.weights } };
  const req = requirements(inp.profile, inp.dna, inp.budgetLeft ?? null);
  const health = inp.health ?? {};
  const board = inp.board ?? {};
  const base: RoutingDecision = {
    at: inp.now ?? Date.now(),
    mission: inp.text.slice(0, 300),
    mode: 'evidence',
    requirements: req,
    tier: inp.profile.tier,
    chosen: null,
    fallbacks: [],
    premium: null,
    ladder: [],
    candidates: [],
    rejected: [],
    confidence: 0,
    budget: {
      ok: true,
      left: inp.budgetLeft ?? null,
      note: inp.budgetLeft == null ? 'pas de limite' : `${usd(inp.budgetLeft)} disponibles`,
    },
    why: {
      model: '',
      agent: inp.loadout?.agentWhy ?? '',
      skills: inp.loadout?.skillsWhy ?? '',
      mcp: inp.loadout?.mcpWhy ?? '',
      tools: inp.loadout?.tools.length ? `outils : ${inp.loadout.tools.slice(0, 12).join(', ')}` : '',
      notPremium: '',
      fallback: '',
      escalation: [],
    },
    agent: inp.loadout?.agent,
    skills: inp.loadout?.skills,
    mcp: inp.loadout?.mcp,
    tools: inp.loadout?.tools,
    weights: s.weights,
  };

  // Candidates at the required tier (relaxed downward then upward when nothing qualifies, like routeModel).
  let tier = inp.profile.tier;
  let ranked = rankByValue(inp.models, inp.profile, health, board);
  for (const t of [...QUALITY_TIERS].reverse()) {
    if (ranked.length) break;
    if (t === inp.profile.tier) continue;
    ranked = rankByValue(inp.models, { ...inp.profile, tier: t }, health, board);
    if (ranked.length) tier = t;
  }
  if (!ranked.length) {
    // FAIL-SAFE: no evidence (offline catalog, unknown models) → legacy tier routing.
    const legacy = routeModel(inp.models, inp.tiers, inp.profile, health, board);
    return {
      ...base,
      mode: legacy ? 'tiers' : 'default',
      tier: legacy?.tier ?? tier,
      why: {
        ...base.why,
        model: legacy
          ? `Aucune preuve de benchmark disponible : routage par paliers (${legacy.reason}).`
          : 'Catalogue de modèles indisponible : le modèle par défaut est utilisé.',
        fallback: legacy?.fallbacks.join(' → ') ?? '',
      },
    };
  }
  const cheapest = Math.min(...ranked.map((r) => r.price));
  let cands = ranked.slice(0, 15).map((r) => score(r, tier, inp, s.weights, cheapest));
  const rejected: RoutingDecision['rejected'] = [];
  const keep = (c: ScoredCandidate, why: string | null) => {
    if (why) {
      c.excluded = why;
      rejected.push({ id: c.id, reason: why });
      return false;
    }
    return true;
  };
  const floor = req.qualityFloor;
  let pool = cands.filter((c) =>
    keep(
      c,
      s.maxPricePerM > 0 && c.price > s.maxPricePerM
        ? `trop cher : ${c.price.toFixed(2)} $/M > plafond ${s.maxPricePerM} $/M`
        : c.quality < floor
          ? `qualité pondérée ${c.quality.toFixed(0)} < ${floor} requis`
          : c.dims.reliability < 30
            ? 'indisponible récemment (échecs < 2 min)'
            : null,
    ),
  );
  // Budget: a model whose cheapest estimate exceeds what is left cannot finish the mission.
  let budgetOk = true;
  if (inp.budgetLeft != null) {
    const affordable = pool.filter((c) => !c.estimate || c.estimate.low <= inp.budgetLeft!);
    for (const c of pool)
      if (!affordable.includes(c))
        keep(c, `budget : estimation ${usd(c.estimate!.low)} > ${usd(inp.budgetLeft)} disponibles`);
    if (!affordable.length) {
      budgetOk = false;
      pool = [...pool]
        .sort((a, b) => (a.estimate?.low ?? a.price) - (b.estimate?.low ?? b.price))
        .slice(0, 1);
    } else pool = affordable;
  }
  // Price cap excludes the whole tier: step down to the best tier that fits under the cap.
  if (!pool.length && s.maxPricePerM > 0)
    for (const t of QUALITY_TIERS.slice(0, QUALITY_TIERS.indexOf(tier)).reverse()) {
      const lower = rankByValue(inp.models, { ...inp.profile, tier: t }, health, board)
        .filter((r) => r.price <= s.maxPricePerM)
        .slice(0, 15)
        .map((r) => score(r, t, inp, s.weights, cheapest));
      if (lower.length) {
        rejected.push({
          id: '*',
          reason: `palier ${TIER_LABEL[tier]} entièrement au-dessus du plafond de prix : palier ${TIER_LABEL[t]} retenu`,
        });
        tier = t;
        pool = lower;
        cands = [...lower, ...cands];
        break;
      }
    }
  // Every gate failed (quality floor too strict for the catalog): keep the value ranking.
  if (!pool.length) pool = cands.filter((c) => !c.excluded || c.excluded.startsWith('qualité')).slice(0, 3);
  if (!pool.length) pool = cands.slice(0, 3);
  const chosen = pool[0]!;
  const fallbacks = pool.slice(1, 3);

  // Premium reference: the most intelligent model of the MAXIMUM tier.
  const top = rankByValue(inp.models, { ...inp.profile, tier: 'maximum' }, health, board).sort(
    (a, b) => b.score - a.score,
  )[0];
  const premium = top ? score(top, 'maximum', inp, s.weights, cheapest) : null;
  // Escalation ladder: the cheapest qualifying model of each higher tier.
  const ladder: ScoredCandidate[] = [];
  for (const t of QUALITY_TIERS.slice(QUALITY_TIERS.indexOf(tier) + 1)) {
    const r = rankByValue(inp.models, { ...inp.profile, tier: t }, health, board).find(
      (x) =>
        x.m.id !== chosen.id &&
        !ladder.some((l) => l.id === x.m.id) &&
        (s.maxPricePerM <= 0 || x.price <= s.maxPricePerM),
    );
    if (r) ladder.push(score(r, t, inp, s.weights, cheapest));
  }
  cands = cands.map((c) => (c.id === chosen.id ? chosen : c));

  const nQual = cands.filter((c) => !c.excluded).length;
  const why: Explanation = {
    ...base.why,
    model: `${chosen.name} est le moins cher des ${nQual} modèle(s) qui atteignent le niveau ${TIER_LABEL[tier]} : ${chosen.metric} ${chosen.raw.toFixed(1)} (seuil ${req.minIndex.toFixed(1)}), qualité pondérée ${chosen.quality.toFixed(0)}/100 (≥ ${floor}), réussite ${pct(chosen.pSuccess)} ${chosen.measured.success ? 'mesurée sur vos missions' : 'estimée'}${chosen.estimate ? `, coût estimé ${usd(chosen.estimate.low)}–${usd(chosen.estimate.high)}` : ''}.${chosen.contradiction ? ` Attention : ${chosen.contradiction}.` : ''}`,
    notPremium:
      !premium || premium.id === chosen.id
        ? 'Le modèle choisi est déjà le plus intelligent disponible pour ce niveau.'
        : `${premium.name} coûterait ${(premium.price / chosen.price).toFixed(1)}× plus (${premium.price.toFixed(2)} vs ${chosen.price.toFixed(2)} $/M) pour +${(premium.dims.intelligence - chosen.dims.intelligence).toFixed(0)} points d’intelligence que le niveau ${TIER_LABEL[tier]} ne demande pas${req.criticality === 'critical' ? ' — il reste dans l’échelle d’escalade (mission critique)' : ''}.`,
    fallback: fallbacks.length
      ? `En cas d’indisponibilité : ${fallbacks.map((f) => f.name).join(' → ')} (suivants de la même liste).`
      : 'Aucun modèle de secours à ce niveau.',
    escalation: [
      `score QA < ${s.qaThreshold} %`,
      'verdict FAILED / PARTIAL après correction',
      'problème bloquant de la red team ou refus du relecteur',
      '3 erreurs d’outils consécutives',
      ladder[0]
        ? `→ escalade vers ${ladder[0].name} (${TIER_LABEL[ladder[0].tier]}), au plus ${s.maxEscalations} fois, si le budget le permet`
        : '→ aucun palier supérieur disponible',
    ],
  };
  const left = inp.budgetLeft ?? null;
  return {
    ...base,
    tier,
    chosen,
    fallbacks,
    premium,
    ladder,
    candidates: cands,
    rejected,
    confidence: chosen.evidenceConfidence,
    budget: {
      ok: budgetOk,
      left,
      note: budgetOk
        ? left == null
          ? 'pas de limite de budget'
          : `${usd(left)} disponibles, estimation ${chosen.estimate ? usd(chosen.estimate.high) : '?'} au plus`
        : `budget insuffisant (${usd(left ?? 0)}) : modèle le moins cher retenu, la mission peut s’arrêter avant la fin`,
    },
    why,
  };
}

// ── Cascade routing ────────────────────────────────────────────────────────
export interface QaInput {
  status: 'PASSED' | 'PARTIAL' | 'FAILED';
  checks: { status: 'pass' | 'fail' | 'skip' }[];
  unsupportedNumbers?: number;
  blocking?: number;
  reviewerRejected?: boolean;
}
/** Measured QA score 0–100 from the mission verdict and its checks. */
export function qaScore(q: QaInput): number {
  const run = q.checks.filter((c) => c.status !== 'skip');
  const ratio = run.length
    ? run.filter((c) => c.status === 'pass').length / run.length
    : q.status === 'PASSED'
      ? 0.8
      : 0.4;
  let s = ratio * 100;
  s -= Math.min(30, (q.unsupportedNumbers ?? 0) * 10);
  if (q.blocking) s -= 25;
  if (q.reviewerRejected) s -= 20;
  if (q.status === 'PARTIAL') s = Math.min(s, 70);
  if (q.status === 'FAILED') s = Math.min(s, 40);
  return Math.round(clamp(s));
}

export interface CascadeStep {
  action: 'accept' | 'retry' | 'escalate' | 'stop';
  model?: string;
  reason: string;
}
/** Cheap first → QA → escalate only when needed; stop before wasting budget. */
export function cascadeNext(o: {
  qa: number;
  threshold: number;
  escalations: number;
  maxEscalations: number;
  rounds: number;
  maxRounds: number;
  current: string;
  ladder: { id: string; name: string; estimate: { low: number; high: number } | null }[];
  budgetLeft: number | null;
}): CascadeStep {
  if (o.qa >= o.threshold)
    return { action: 'accept', reason: `QA ${o.qa} % ≥ ${o.threshold} % : résultat accepté, pas d’escalade` };
  const next = o.ladder.find((l) => l.id !== o.current);
  const affordable = next && (o.budgetLeft == null || !next.estimate || next.estimate.low <= o.budgetLeft);
  if (next && o.escalations < o.maxEscalations && affordable)
    return {
      action: 'escalate',
      model: next.id,
      reason: `QA ${o.qa} % < ${o.threshold} % : escalade vers ${next.name}`,
    };
  if (o.rounds < o.maxRounds)
    return {
      action: 'retry',
      reason: `QA ${o.qa} % < ${o.threshold} % : nouvelle correction avec le même modèle${!next ? ' (aucun palier supérieur)' : !affordable ? ' (budget insuffisant pour escalader)' : ' (escalades épuisées)'}`,
    };
  return {
    action: 'stop',
    reason: `QA ${o.qa} % : arrêt de la cascade (tours et escalades épuisés) pour ne pas gaspiller le budget`,
  };
}
