// JEV orchestration of the studio: the extended trace and the JEV_LOG entry of every production call.
import { useStore } from '../store';
import type { JevLogEntry, Checkpoint } from '../../../server/jev/metrics';
import type { StudioTag } from '../../../server/jev/studio/types';
const today = () => new Date().toISOString().slice(0, 10);

export type StudioStage = Extract<
  Checkpoint['name'],
  | 'JEV_PRE'
  | 'PRODUCTION_CLASSIFICATION'
  | 'CAPABILITY_DISCOVERY'
  | 'MODEL_SELECTION'
  | 'PROMPT_COMPILATION'
  | 'ASSET_RETRIEVAL'
  | 'GENERATION'
  | 'QA'
  | 'CORRECTION'
  | 'FALLBACK'
  | 'FINALIZATION'
  | 'JEV_LEARNING'
>;
/** A trace being built for one production call: every stage records its REAL duration. */
export class Trace {
  readonly steps: Checkpoint[] = [];
  private t = performance.now();
  stage(name: StudioStage, decision: string, o: { tokens?: number; cost?: number } = {}) {
    const now = performance.now();
    this.steps.push({
      name,
      ms: Math.round(now - this.t),
      tokens: o.tokens ?? 0,
      cost: o.cost ?? 0,
      decision,
    });
    this.t = now;
  }
}
export interface LogInput {
  tag: StudioTag;
  mission: string;
  trace: Trace;
  reason: string;
  tokensIn?: number;
  tokensOut?: number;
  failureNote?: string;
}
/** Writes the JEV_LOG entry (same structure as every other entry, plus the `studio` tag). Failures are logged too. */
export function logStudio(i: LogInput): void {
  const st = useStore.getState();
  const e = {
    id: `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: Date.now(),
    session: `studio:${i.tag.project_id}`,
    mission: i.mission.slice(0, 200),
    task: i.tag.media_type === 'text' ? 'writing' : 'media',
    mode: 'studio',
    jev: true,
    level: 1,
    decisionBy: 'direct',
    model: i.tag.model,
    reason: i.reason,
    tokensIn: i.tokensIn ?? 0,
    tokensOut: i.tokensOut ?? 0,
    cost: i.tag.cost ?? 0,
    jevCost: i.tag.JEV_cost,
    latencyMs: i.tag.latency,
    decisionMs: i.trace.steps
      .filter((s) =>
        [
          'MODEL_SELECTION',
          'PRODUCTION_CLASSIFICATION',
          'CAPABILITY_DISCOVERY',
          'PROMPT_COMPILATION',
        ].includes(s.name),
      )
      .reduce((a, s) => a + s.ms, 0),
    calls: 1,
    quality: i.tag.quality,
    success: i.tag.success,
    retries: i.tag.retry,
    escalations: i.tag.fallback ? 1 : 0,
    corrections: i.tag.correction ? 1 : 0,
    cacheHits: 0,
    toolsOffered: 0,
    toolsBaseline: 0,
    toolTokens: 0,
    toolTokensBaseline: 0,
    contextBefore: 0,
    contextAfter: 0,
    checkpoints: i.trace.steps,
    qualityMeasured: i.tag.quality,
    failureNote: i.failureNote,
    studio: i.tag,
  } as JevLogEntry;
  st.addJevLog(e);
  // LEARNING INVESTMENT (Teacher spend) is part of the JEV spend of the day.
  if (i.tag.teacher && i.tag.total_cost)
    st.setJevSpend({ ...st.jevSpend, [today()]: (st.jevSpend[today()] ?? 0) + i.tag.total_cost });
}
