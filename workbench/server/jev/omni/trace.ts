// OMNIPOTENT V4.1 — TRACE (§79, §99, §100). A firewall is reported HARD only when the runtime really filtered the object
// before the model saw it; otherwise POLICY. Never claim physical isolation that did not happen.
import type { LanePolicy } from './lane';
import type { HistoryFirewall } from './mission';

export type Enforcement = 'HARD' | 'POLICY' | 'OFF';
export interface OmniSettings {
  /** Master switch: OFF = the V18 behaviour exactly. */
  enabled: boolean;
  fastLane: boolean;
  historyFirewall: boolean;
  memoryGovernor: boolean;
  toolFirewall: boolean;
  driftGuard: boolean;
  /** Ceilings on context and output per lane (a budget is never a target). */
  ceilings: boolean;
  /** Max hidden turns kept in the sidebar trace. */
  traceInChat: boolean;
}
export const DEFAULT_OMNI: OmniSettings = {
  enabled: true,
  fastLane: true,
  historyFirewall: true,
  memoryGovernor: true,
  toolFirewall: true,
  driftGuard: true,
  ceilings: true,
  traceInChat: true,
};
export interface OmniTag {
  missionId: string;
  fingerprint: string;
  initialDna: string;
  finalDna: string;
  reclassified: boolean;
  lane: string;
  verification: string;
  enforcement: Record<'MEMORY_GOVERNOR' | 'MISSION_FIREWALL' | 'HISTORY_FIREWALL' | 'TOOL_FIREWALL' | 'DRIFT_GUARD' | 'CONTEXT_CEILING' | 'FAST_LANE', Enforcement>;
  history: { raw: number; mission: number; foreign: number; rawTokens: number; keptTokens: number };
  memory: { candidates: number; allowed: number; optional: number; blocked: number; quarantined: number; rawChars: number; keptChars: number };
  tools: { available: number; exposed: number; blocked: number };
  contextCeiling: number;
  steps?: { used: number; cap: number | null };
  drift?: { objective: number; artifact: number | null; action: number | null; foreign: number; retries: number; verdict: string };
  /** Model calls that the lane avoided (gates not re-asked). */
  avoidedReasks: number;
  version: number;
}
export const OMNI_VERSION = 1;
export function traceLines(t: OmniTag): string[] {
  const e = t.enforcement;
  return [
    `MISSION ${t.missionId} · DNA ${t.initialDna} → ${t.finalDna}${t.reclassified ? ' (RECLASSIFIÉE)' : ''} · voie ${t.lane} · vérification ${t.verification}`,
    `HISTORIQUE ${t.history.mission}/${t.history.raw} tours conservés · ${t.history.foreign} bloqué(s) · ${t.history.rawTokens} → ${t.history.keptTokens} tok  [${e.HISTORY_FIREWALL}]`,
    `MÉMOIRE ${t.memory.allowed + t.memory.optional}/${t.memory.candidates} autorisées · ${t.memory.blocked} bloquées · ${t.memory.quarantined} en quarantaine  [${e.MEMORY_GOVERNOR}]`,
    `OUTILS ${t.tools.exposed}/${t.tools.available} exposés · ${t.tools.blocked} masqués  [${e.TOOL_FIREWALL}]`,
    `PLAFOND DE CONTEXTE ${t.contextCeiling} tok (plafond, jamais une cible)  [${e.CONTEXT_CEILING}]`,
    ...(t.drift ? [`DÉRIVE objectif ${Math.round(t.drift.objective * 100)} % · étranger ${Math.round(t.drift.foreign * 100)} % · relances ${t.drift.retries} · ${t.drift.verdict}  [${e.DRIFT_GUARD}]`] : []),
    ...(t.avoidedReasks ? [`${t.avoidedReasks} relance(s) payante(s) évitée(s) par la voie rapide`] : []),
  ];
}
export function enforcementOf(s: OmniSettings, hist: HistoryFirewall<{ role: string; content: unknown }> | null, lane: LanePolicy): OmniTag['enforcement'] {
  const on = (b: boolean): Enforcement => (s.enabled && b ? 'HARD' : 'OFF');
  return {
    MEMORY_GOVERNOR: on(s.memoryGovernor),
    MISSION_FIREWALL: on(s.historyFirewall && Boolean(hist)),
    HISTORY_FIREWALL: on(s.historyFirewall),
    TOOL_FIREWALL: on(s.toolFirewall),
    DRIFT_GUARD: on(s.driftGuard),
    CONTEXT_CEILING: on(s.ceilings),
    FAST_LANE: on(s.fastLane && lane.lane !== 'standard'),
  };
}
