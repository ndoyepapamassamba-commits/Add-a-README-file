// JEV COGNITIVE FABRIC — shared types. Additive layer on top of the V5 JEV engine:
// everything here is derived from, or written next to, the JEV_LOG and the scientific
// validation. No score in this layer is invented: a value is either measured from real
// runs, calculated from measured values (formula shown), or null ("NON MESURÉ").

export type CapabilityType =
  | 'tool'
  | 'plugin'
  | 'connector'
  | 'mcp'
  | 'github'
  | 'filesystem'
  | 'browser'
  | 'web'
  | 'code'
  | 'terminal'
  | 'data'
  | 'document'
  | 'spreadsheet'
  | 'image'
  | 'memory'
  | 'skill'
  | 'agent'
  | 'model'
  | 'evaluator';

/** Honest availability: never present a missing connector as connected. */
export type CapStatus = 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' | 'SIMULATED_TEST_ONLY';
export type CapRisk = 'none' | 'low' | 'medium' | 'high' | 'destructive';

export interface CapabilityGovernance {
  /** Short permission names (read, write, network, exec, delete, publish…). */
  permissions: string[];
  scope: 'workspace' | 'browser' | 'network' | 'external' | 'local';
  approvalRequired: boolean;
  dataAccess: boolean;
  writeAccess: boolean;
  networkAccess: boolean;
}

export interface Capability extends CapabilityGovernance {
  id: string;
  name: string;
  type: CapabilityType;
  description: string;
  provider: string;
  version: string;
  status: CapStatus;
  statusDetail?: string;
  risk: CapRisk;
  /** USD per call when known (null = not measured). */
  cost: number | null;
  /** Mean latency in ms when known (null = not measured). */
  latency: number | null;
  supportedTaskTypes: string[];
  requiredSkills: string[];
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  /** 0..1, from real runs only; null until measured. */
  reliability: number | null;
  lastUsed: number | null;
  successRate: number | null;
  failureRate: number | null;
  averageLatency: number | null;
  averageCost: number | null;
  /** Number of real runs behind the statistics. */
  samples: number;
  securityPolicy: string;
  provenance: string;
  /** Matching tags used by discovery (spreadsheet, filereader, statistics…). */
  tags: string[];
  /** Missions (agents / skills) that used it. */
  usedBy: string[];
}

export interface FabricTag {
  kind: 'tournament' | 'council' | 'skilltest' | 'cfbench' | 'freebench' | 'distill';
  /** cfbench: baseline / v5 / fabric. skilltest: with_skill / without_skill. */
  arm?: string;
  groupId: string;
  taskKey?: string;
  category?: string;
  skillId?: string;
  skillVersion?: string;
  models?: string[];
}

export interface CognitiveConfig {
  model: string;
  skills: string[];
  /** Capability ids offered to the model (the minimal set). */
  capabilities: string[];
  /** Tools actually used, in order of first use. */
  tools: string[];
  memory: string[];
  evaluator: string;
  councilSize: number;
  strategy: string;
  /** off / pre / live / full. */
  jev: string;
  fabric: boolean;
  /** The model was chosen by controlled exploration, not by the best-known policy. */
  explored: boolean;
  /** Human-readable reasons (why this model / skill / tool). */
  why: string[];
}

export type DataClass = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'HIGHLY_CONFIDENTIAL';

/** Settings of the Cognitive Fabric (stored apart from the V5 JEV settings; every active behaviour is opt-in). */
export interface FabricSettings {
  /** Apply the Fabric to normal missions: capability selection, validated skills, learned policies, failure hints. Off by default until measured. */
  enabled: boolean;
  /** Model council for single-turn tasks (extra calls, gated by the economic governor). */
  council: boolean;
  /** Block / warn before sending sensitive data to a provider whose policy is incompatible or unknown. */
  securityEnforce: boolean;
  /** Keep a redacted copy of instruction and answer in the JEV_LOG (needed for datasets and skill examples). Benchmarks always keep it. */
  captureExamples: boolean;
  /** Exploration share (0.1 = 10 %), bounded by risk, budget and importance. */
  epsilon: number;
  /** USD value of one quality point: a policy parameter of the economic governor, NOT a measurement. */
  valuePerPoint: number;
  /** Maximum capabilities exposed to the model. */
  maxCapabilities: number;
}
export const DEFAULT_FABRIC: FabricSettings = {
  enabled: false,
  council: false,
  securityEnforce: true,
  captureExamples: false,
  epsilon: 0.1,
  valuePerPoint: 0.002,
  maxCapabilities: 8,
};
