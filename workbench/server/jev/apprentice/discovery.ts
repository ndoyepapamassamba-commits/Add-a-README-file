// CHALLENGER DISCOVERY. DISCOVERY ≠ PROMOTION. A new free model walks a pipeline:
// DISCOVERED → SECURITY CHECK → CAPABILITY CHECK → HEALTH CHECK → CHALLENGER → BENCHMARK → VALIDATION → PROMOTION (only via the lab).
// A discovered model is never a champion and is never used for sensitive data without a compatible declared policy.
import type { JevLogEntry } from '../metrics';
import type { FreeModel } from '../fabric/council';
import type { ProviderPolicy } from '../fabric/security';
import { isFreeId } from './registry';

export type Stage =
  | 'DISCOVERED'
  | 'SECURITY_CHECKED'
  | 'CAPABILITY_CHECKED'
  | 'HEALTH_CHECKED'
  | 'CHALLENGER'
  | 'BENCHMARKED'
  | 'VALIDATED'
  | 'PROMOTED'
  | 'REJECTED_CAPABILITY'
  | 'REJECTED_HEALTH';
export interface DiscoveredModel {
  id: string;
  provider: string;
  stage: Stage;
  discoveredAt: number;
  /** Which data classes the model may receive: PUBLIC only unless the provider policy is declared compatible. */
  securityScope: 'PUBLIC_ONLY' | 'INTERNAL' | 'SENSITIVE';
  capability: 'FULL' | 'LIMITED' | 'INSUFFICIENT';
  health: 'UNMEASURED' | 'HEALTHY' | 'UNHEALTHY';
  history: { at: number; stage: Stage; note: string }[];
}

export const securityScopeOf = (policy: ProviderPolicy | undefined): DiscoveredModel['securityScope'] => {
  if (!policy || policy.source !== 'user' || policy.training === 'yes')
    return policy?.training === 'no' ? 'INTERNAL' : 'PUBLIC_ONLY';
  if (policy.training === 'no' && policy.retention === 'none') return 'SENSITIVE';
  if (policy.training === 'no') return 'INTERNAL';
  return 'PUBLIC_ONLY';
};
export const capabilityOf = (m: FreeModel): DiscoveredModel['capability'] =>
  m.contextLength < 8_000
    ? 'INSUFFICIENT'
    : m.tools && m.structuredOutputs && m.contextLength >= 32_000
      ? 'FULL'
      : 'LIMITED';

/** Availability measured on real runs (no runs ⇒ UNMEASURED, accepted provisionally — it will be measured by the tests). */
export function healthOf(runs: JevLogEntry[]): DiscoveredModel['health'] {
  if (runs.length < 5) return 'UNMEASURED';
  const errs = runs.filter((e) => e.failureNote).length / runs.length;
  return errs > 0.3 ? 'UNHEALTHY' : 'HEALTHY';
}

export interface DiscoveryInput {
  pool: FreeModel[];
  known: Record<string, DiscoveredModel>;
  log: JevLogEntry[];
  policyOf?: (provider: string) => ProviderPolicy | undefined;
  /** Model → champion in at least one family. */
  champions?: Set<string>;
  /** Model → VALIDATED status in at least one family. */
  validated?: Set<string>;
  now?: number;
}
/** Advances every free model one deterministic step through the pipeline and records the transitions. */
export function discoverChallengers(i: DiscoveryInput): {
  known: Record<string, DiscoveredModel>;
  discovered: string[];
} {
  const now = i.now ?? Date.now();
  const known = { ...i.known };
  const discovered: string[] = [];
  for (const m of i.pool) {
    const runs = i.log.filter((e) => e.model === m.id && e.apprentice);
    let cur = known[m.id];
    const move = (stage: Stage, note: string) => {
      cur = { ...cur!, stage, history: [...cur!.history, { at: now, stage, note }].slice(-30) };
    };
    if (!cur) {
      cur = {
        id: m.id,
        provider: m.provider,
        stage: 'DISCOVERED',
        discoveredAt: now,
        securityScope: 'PUBLIC_ONLY',
        capability: 'LIMITED',
        health: 'UNMEASURED',
        history: [{ at: now, stage: 'DISCOVERED', note: 'découvert dans le catalogue' }],
      };
      discovered.push(m.id);
    }
    const scope = securityScopeOf(i.policyOf?.(m.provider));
    const cap = capabilityOf(m);
    const health = healthOf(runs);
    cur = { ...cur, securityScope: scope, capability: cap, health };
    if (cur.stage === 'DISCOVERED')
      move(
        'SECURITY_CHECKED',
        `périmètre de données : ${scope}${scope === 'PUBLIC_ONLY' ? ' (politique non renseignée : jamais de données confidentielles)' : ''}`,
      );
    if (cur.stage === 'SECURITY_CHECKED')
      move(cap === 'INSUFFICIENT' ? 'REJECTED_CAPABILITY' : 'CAPABILITY_CHECKED', `capacités : ${cap}`);
    if (cur.stage === 'CAPABILITY_CHECKED')
      move(health === 'UNHEALTHY' ? 'REJECTED_HEALTH' : 'HEALTH_CHECKED', `santé : ${health}`);
    if (cur.stage === 'HEALTH_CHECKED')
      move('CHALLENGER', 'éligible aux tests contrôlés — jamais champion directement');
    // progression driven by REAL results only
    if (cur.stage === 'CHALLENGER' && runs.filter((e) => e.fabric?.kind === 'apprentice').length >= 5)
      move('BENCHMARKED', 'au moins 5 missions de benchmark contrôlé');
    if ((cur.stage === 'CHALLENGER' || cur.stage === 'BENCHMARKED') && i.validated?.has(m.id))
      move('VALIDATED', 'critères de validation remplis');
    if (cur.stage === 'VALIDATED' && i.champions?.has(m.id))
      move('PROMOTED', 'champion d’au moins une famille (décision du lab)');
    if (cur.stage === 'PROMOTED' && !i.champions?.has(m.id)) move('VALIDATED', 'n’est plus champion');
    // a model with prior runs but never discovered still goes through the same stages (never straight to champion)
    known[m.id] = cur;
  }
  return { known, discovered };
}
export const isSensitiveCapable = (d: DiscoveredModel | undefined) => d?.securityScope === 'SENSITIVE';
export { isFreeId };
