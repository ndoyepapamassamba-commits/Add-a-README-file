import type { JevLogEntry } from '../../server/jev/metrics';
import { accountingOf, type CallRec } from '../../server/jev/science';

let seq = 0;
export interface E {
  task?: string;
  model?: string;
  mission?: string;
  ok?: boolean | null;
  quality?: number | null;
  cost?: number;
  jevCost?: number;
  latency?: number;
  tools?: string[];
  skills?: string[];
  capabilities?: string[];
  corrections?: number;
  retries?: number;
  escalations?: number;
  toolErrors?: string[];
  toolCalls?: number;
  stopReason?: string;
  vector?: Record<string, number>;
  fabric?: JevLogEntry['fabric'];
  bench?: string;
  strategy?: string;
  councilSize?: number;
  at?: number;
  contextBefore?: number;
  jev?: boolean;
  apprentice?: JevLogEntry['apprentice'];
  failureNote?: string;
  experiment?: JevLogEntry['experiment'];
  instruction?: string;
}
export function entry(o: E = {}): JevLogEntry {
  const calls: CallRec[] = [
    {
      kind: 'main',
      step: 1,
      model: o.model ?? 'm/a',
      tokensIn: 9000,
      tokensOut: 1000,
      cost: o.cost ?? 0.01,
      costSource: 'measured',
      ms: 10,
    },
  ];
  if (o.jevCost)
    calls.push({
      kind: 'jev1',
      step: 0,
      model: 'jev',
      tokensIn: 600,
      tokensOut: 0,
      cost: o.jevCost,
      costSource: 'calculated',
      ms: 5,
    });
  const acct = accountingOf(calls);
  return {
    id: `x${seq++}`,
    at: o.at ?? seq,
    session: 's',
    mission: o.mission ?? 'analyse le fichier ventes.csv et calcule le total',
    task: o.task ?? 'data',
    mode: 'balanced',
    jev: o.jev ?? true,
    level: 1,
    decisionBy: 'JEV-0',
    model: o.model ?? 'm/a',
    reason: '',
    tokensIn: 9000,
    tokensOut: 1000,
    cost: o.cost ?? 0.01,
    jevCost: o.jevCost ?? 0,
    latencyMs: o.latency ?? 5000,
    decisionMs: 2,
    calls: 1,
    quality: null,
    success: o.ok === undefined ? true : o.ok,
    retries: o.retries ?? 0,
    escalations: o.escalations ?? 0,
    corrections: o.corrections ?? 0,
    cacheHits: 0,
    toolsOffered: 5,
    toolsBaseline: 50,
    toolTokens: 1,
    toolTokensBaseline: 1,
    contextBefore: o.contextBefore ?? 0,
    contextAfter: 0,
    checkpoints: [],
    acct,
    qualityMeasured: o.quality === undefined ? 90 : o.quality,
    qualityVector: o.vector,
    toolsUsed: o.tools ?? ['data.query'],
    toolCallCount: o.toolCalls ?? (o.tools ?? ['data.query']).length,
    toolErrorCount: (o.toolErrors ?? []).length,
    toolErrors: o.toolErrors,
    skillsUsed: o.skills,
    stopReason: o.stopReason,
    bench: o.bench,
    fabric: o.fabric,
    apprentice: o.apprentice,
    failureNote: o.failureNote,
    experiment: o.experiment,
    instruction: o.instruction,
    config: {
      model: o.model ?? 'm/a',
      skills: o.skills ?? [],
      capabilities: o.capabilities ?? [],
      tools: o.tools ?? ['data.query'],
      memory: [],
      evaluator: 'local-qa',
      councilSize: o.councilSize ?? 1,
      strategy: o.strategy ?? 'single-agent',
      jev: 'full',
      fabric: false,
      explored: false,
      why: [],
    },
  } as JevLogEntry;
}
/** n entries; `f` returns the options, or an already built entry. */
export const many = (n: number, f: (i: number) => E | JevLogEntry): JevLogEntry[] =>
  Array.from({ length: n }, (_, i) => {
    const r = f(i);
    return 'checkpoints' in r ? (r as JevLogEntry) : entry(r as E);
  });
