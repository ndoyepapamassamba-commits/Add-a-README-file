// THE ROUTING LADDER of the Supremacy engine and its explanation (WHY THIS MODEL?).
//   L0 JEV-0 local · L1 VALIDATED free apprentice · L2 free specialist · L3 free + micro-adaptation ·
//   L4 free + targeted correction · L5 premium specialist · L6 model council · L7 frontier.
// A higher level is used only when the lower one fails the quality gate or is not allowed. The same attempt is never
// repeated: after a failure the controller corrects, then switches model, then goes up.
import { economicGovernor } from '../fabric/learning';
import type { JevLogEntry } from '../metrics';
import {
  FallbackController,
  routeFreeFirst,
  type Attempt,
  type FreePlan,
  type RouteInput,
  type ScoredFree,
} from './router';
import {
  champions as championsOf,
  finalRule,
  getValidatedApprentice,
  premiumOverride,
  premiumReference,
  type ApprenticeCandidate,
  type FinalRule,
  type PremiumRef,
} from './supremacy';
import { DEFAULT_APPRENTICE } from './types';

export const LEVELS = [
  { level: 0, name: 'JEV-0 / local déterministe' },
  { level: 1, name: 'VALIDATED FREE APPRENTICE' },
  { level: 2, name: 'FREE SPECIALIST / FREE + JEV' },
  { level: 3, name: 'FREE MODEL + MICRO-ADAPTATION' },
  { level: 4, name: 'FREE MODEL + TARGETED CORRECTION' },
  { level: 5, name: 'PREMIUM SPECIALIST (routage V5)' },
  { level: 6, name: 'MODEL COUNCIL' },
  { level: 7, name: 'FRONTIER MODEL' },
] as const;

export type Route = 'validated' | 'specialist' | 'adapt' | 'v5';
export interface SupremacyPlan extends FreePlan {
  route: Route;
  /** Level of the first attempt (1 / 2 / 3), or 5 when the free route is not used. */
  level: number;
  champion: ApprenticeCandidate | null;
  premium: PremiumRef | null;
  final: FinalRule | null;
  overridden: { model: string; reasons: string[] }[];
  /** WHY THIS MODEL? — auditable explanation. */
  explain: string[];
}

export interface SupremacyRouteInput extends RouteInput {
  log: JevLogEntry[];
  rolledBack?: Set<string>;
  now?: number;
}

const bypass = (
  base: FreePlan,
  why: FreePlan['bypass'],
  reason: string,
  extra: Partial<SupremacyPlan> = {},
): SupremacyPlan => ({
  ...base,
  use: false,
  bypass: why,
  reason,
  route: 'v5',
  level: 5,
  champion: null,
  premium: null,
  final: null,
  overridden: [],
  explain: [`ROUTAGE V5 — ${reason}`],
  ...extra,
});

const lblOf = (kind: Attempt['kind'], model: string) =>
  kind === 'champion'
    ? `Apprenti VALIDATED ${model}`
    : kind === 'secondary'
      ? `autre apprenti ${model}`
      : kind === 'free_correction'
        ? 'correction ciblée (même modèle)'
        : kind === 'free_adapt'
          ? `FREE + adaptation ${model}`
          : kind === 'free_jev'
            ? `FREE + JEV ${model}`
            : kind === 'free_other'
              ? `autre modèle gratuit ${model}`
              : 'routage V5';

/** Dedupe (model, kind) and renumber: the same attempt is never repeated. */
export function dedupeAttempts(xs: Omit<Attempt, 'n'>[]): Attempt[] {
  const seen = new Set<string>();
  const out: Attempt[] = [];
  for (const a of xs) {
    const k = `${a.kind}|${a.model ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...a, n: out.length + 1 });
  }
  return out;
}

export function routeApprentice(i: SupremacyRouteInput): SupremacyPlan {
  const s = i.settings ?? DEFAULT_APPRENTICE;
  const base = routeFreeFirst(i); // level-3 plan (free + micro-adaptation) and the disabled / bypass reasons
  if (!s.enabled) return bypass(base, 'disabled', 'JEV Apprentice désactivé : routage V5 inchangé');
  const prem = premiumReference(i.log, i.dna.task_family);
  if (i.dna.freshness_requirement)
    return bypass(
      base,
      'freshness',
      'exigence de fraîcheur : un modèle gratuit sans navigation web ne garantit pas des faits récents',
      { premium: prem },
    );
  const ga = getValidatedApprentice(i);
  const others = (exclude: Set<string>) =>
    ga.ranked.filter(
      (c) =>
        !exclude.has(c.model) &&
        (c.status === 'VALIDATED' || c.status === 'SPECIALIST') &&
        c.security.action !== 'block',
    );
  const mk = (champion: ApprenticeCandidate, route: Route, level: number): SupremacyPlan => {
    const used = new Set([champion.model]);
    const second = others(used)[0];
    const adaptPool = base.candidates.filter((c: ScoredFree) => !used.has(c.id) && c.id !== second?.model);
    const steps = (
      [
        {
          kind: route === 'validated' ? 'champion' : 'free_jev',
          model: champion.model,
          label: lblOf(route === 'validated' ? 'champion' : 'free_jev', champion.model),
          level,
        },
        {
          kind: 'free_correction',
          model: champion.model,
          label: lblOf('free_correction', champion.model),
          level: 4,
        },
        ...(second
          ? [
              {
                kind: 'secondary' as const,
                model: second.model,
                label: lblOf('secondary', second.model),
                level: 2,
              },
            ]
          : []),
        ...(adaptPool[0] && s.maxFreeAttempts >= 4
          ? [
              {
                kind: 'free_adapt' as const,
                model: adaptPool[0].id,
                label: lblOf('free_adapt', adaptPool[0].id),
                level: 3,
              },
            ]
          : []),
      ] as Omit<Attempt, 'n'>[]
    ).slice(0, Math.max(1, s.maxFreeAttempts));
    const attempts = dedupeAttempts([
      ...steps,
      { kind: 'v5', model: null, label: lblOf('v5', ''), level: 5 },
    ]);
    const fr = finalRule(i, champion);
    const q = champion.record;
    const gov =
      prem?.quality != null && q.quality !== null
        ? economicGovernor({
            action: `escalader vers ${prem.model}`,
            mode: 'balanced',
            expectedQualityGain: Math.max(0, prem.quality - q.quality),
            gainSource: 'MEASURED',
            expectedCost: Math.max(0, (prem.cost ?? 0) - (q.totalCost ?? 0)),
            risk: i.dna.risk === 'critical' ? 0.9 : i.dna.risk === 'high' ? 0.6 : 0.2,
            valuePerPoint: s.valuePerPoint,
          })
        : null;
    const explain =
      route === 'validated'
        ? [
            'FREE APPRENTICE SELECTED',
            `Validated Apprentice for ${i.dna.task_family}. n=${q.n}. Quality=${q.quality?.toFixed(1) ?? 'N/A'}%. Success=${q.success === null ? 'N/A' : `${(q.success * 100).toFixed(1)}%`}. Confidence=${q.confidence} (${q.sample}). Quality threshold=${Math.round(i.dna.quality_threshold * 100)}%.`,
            `Security policy=${champion.security.action.toUpperCase()}${i.classification && i.classification !== 'PUBLIC' ? ` (${i.classification})` : ''}. Health=${champion.record.degradation.degraded ? 'DEGRADED' : 'healthy'}. Supremacy score=${champion.score.toFixed(3)}.`,
            prem
              ? `Premium reference ${prem.model}: ${prem.quality === null ? 'quality N/A' : `quality ${prem.quality.toFixed(1)}`} (n=${prem.n}, ${prem.sample}); ${q.quality !== null && prem.quality !== null ? `${q.quality.toFixed(1)}% measured quality vs ${prem.quality.toFixed(1)}% premium reference (${(q.quality - prem.quality).toFixed(1)} points).` : 'comparaison N/A.'}`
              : 'Premium reference: N/A (aucune mission premium mesurée sur cette famille).',
            gov
              ? gov.use
                ? `Premium benefit above escalation threshold: ${gov.reason}`
                : 'Expected premium benefit below escalation threshold.'
              : 'Expected premium benefit: N/A.',
            `Final rule: ${fr.checks.map((c) => `${c.label} ${c.ok ? '✓' : '✗'}`).join(' · ')}`,
          ]
        : [
            route === 'specialist' ? 'FREE SPECIALIST SELECTED' : 'FREE + JEV ADAPTATION',
            `${champion.model} — ${i.dna.task_family}: n=${q.n}, quality=${q.quality?.toFixed(1) ?? 'N/A'}%, success=${q.success === null ? 'N/A' : `${(q.success * 100).toFixed(1)}%`}, status=${champion.status} (pas VALIDATED : ${champion.validation.reasons.slice(0, 3).join(' ; ') || 'N/A'}).`,
          ];
    return {
      ...base,
      use: true,
      route,
      level,
      reason: `${route === 'validated' ? 'VALIDATED apprentice' : 'free specialist'} : ${champion.model} (${i.dna.task_family}, n=${q.n}, qualité ${q.quality?.toFixed(1) ?? 'N/A'}, réussite ${q.success === null ? 'N/A' : `${(q.success * 100).toFixed(0)} %`})`,
      chosen:
        base.candidates.find((c) => c.id === champion.model) ??
        ({
          id: champion.model,
          provider: champion.provider,
          tier: 1,
          tierLabel: route === 'validated' ? 'VALIDATED apprentice' : 'free specialist',
          score: champion.score,
          features: {
            success: champion.features.success,
            quality: champion.features.quality,
            expertise: champion.features.success,
            tool: champion.features.tool,
            structured: champion.features.structured,
            reliability: champion.features.reliability,
            latency: champion.features.latency,
            cost: 1,
          },
          predictedSuccess: champion.record.weightedSuccess ?? 0.5,
          predictedBasis: 'MEASURED',
          predictedQuality: champion.record.quality,
          n: q.n,
          confidence: q.confidence,
          health: null,
          degraded: champion.record.degradation.reasons,
          jevStatus:
            champion.status === 'VALIDATED'
              ? 'SPECIALIST'
              : champion.status === 'DEGRADED'
                ? 'ADAPTED'
                : champion.status,
          reasons: [],
        } as ScoredFree),
      second: base.candidates.find((c) => c.id === (second?.model ?? '')) ?? null,
      confidence: q.confidence,
      predictedSuccess: champion.record.weightedSuccess,
      attempts,
      champion,
      premium: prem,
      final: fr,
      overridden: ga.overridden,
      explain,
      why: explain,
      bypass: undefined,
    };
  };
  // ── L1: VALIDATED free apprentice (final routing rule) ──
  if (ga.champion) return mk(ga.champion, 'validated', 1);
  // A hard override (critical threshold not guaranteed, capability, security) sends the task to V5 — no free level either.
  if (ga.hard.length)
    return bypass(
      base,
      i.dna.risk === 'critical' ? 'critical' : 'capability',
      `premium override : ${[...new Set(ga.hard)].join(' ; ')}`,
      { overridden: ga.overridden, premium: prem },
    );
  // ── L2: free specialist (measured expertise, not yet validated) ──
  const spec = ga.ranked.find(
    (c) =>
      c.status === 'SPECIALIST' &&
      c.security.action !== 'block' &&
      c.caps.tools &&
      c.caps.vision &&
      c.caps.structured &&
      c.caps.context &&
      !premiumOverride(i, c).bypass,
  );
  if (
    spec &&
    i.dna.risk !== 'critical' &&
    (spec.record.weightedSuccess ?? 0) >= 1 - s.maxFailureRisk[i.dna.risk]
  )
    return mk(spec, 'specialist', 2);
  // ── L3: free model + micro-adaptation (existing free-first plan), L5 otherwise ──
  if (base.use) {
    const sp: SupremacyPlan = {
      ...base,
      route: 'adapt',
      level: 3,
      champion: null,
      premium: prem,
      final: null,
      overridden: ga.overridden,
      explain: ['FREE + JEV ADAPTATION', ...base.why],
    };
    return sp;
  }
  return bypass(base, base.bypass, base.reason, { overridden: ga.overridden, premium: prem });
}

export { FallbackController, championsOf };
