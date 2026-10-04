import type {
  ChangeRecord,
  CreditsInfo,
  EffortSetting,
  ModelInfo,
  PermissionMode,
  RoleId,
  RunEventEnvelope,
  RunSummary,
  ServerStatus,
  SessionSummary,
} from '@shared/types';

export type View =
  | 'projects'
  | 'chat'
  | 'code'
  | 'terminal'
  | 'browser'
  | 'data'
  | 'agents'
  | 'skills'
  | 'plugins'
  | 'tasks'
  | 'models'
  | 'settings';

export interface StatusResponse extends ServerStatus {
  models: { count: number; fetchedAt: number; error: string | null };
  jev: { keyConfigured: boolean; available: boolean };
  plugins: { name: string; status: string; tools: number }[];
  budget: BudgetState;
}

export interface BudgetState {
  daily: { spent: number; limit: number; tokens: number };
  monthly: { spent: number; limit: number; tokens: number };
  perTask: number;
  warnAt: number;
}

export interface UsageSummary {
  promptTokens: number;
  completionTokens: number;
  cost: number;
  calls: number;
}

export interface CreditsResponse {
  credits: CreditsInfo;
  today: UsageSummary;
  month: UsageSummary;
  todayByModel: {
    model: string;
    cost: number;
    promptTokens: number;
    completionTokens: number;
    calls: number;
  }[];
  session: { cost: number; tokensIn: number; tokensOut: number } | null;
  budget: BudgetState;
}

export interface AppSettings {
  defaultModel: string;
  fallbackModel: string;
  secondFallbackModel: string;
  reviewModel: string;
  temperature: number;
  maxTokens: number;
  defaultPermissionMode: PermissionMode;
  budget: { daily: number; monthly: number; perTask: number; warnAt: number };
  agent: {
    maxSteps: number;
    maxRetries: number;
    toolTimeoutSec: number;
    maxSubagentDepth: number;
    parallelReads: boolean;
  };
  autoTiers: Record<'fast' | 'balanced' | 'powerful' | 'reasoning' | 'vision', string[]>;
  skills: { autoActivate: boolean; maxAuto: number; disabled: string[]; showCatalog: boolean };
  jev: { enabled: boolean; routing: boolean; skills: boolean; threshold: number };
  mcp: { autoConnect: boolean; connectTimeoutSec: number };
  webSearchProvider: 'auto' | 'openrouter' | 'brave';
  webSearchModel: string;
}

export interface AgentInfo {
  id: RoleId;
  label: string;
  description: string;
  tier: string;
  tools: string[];
  custom: boolean;
  source: string;
  editable: boolean;
  skills: string[];
  model: string | null;
}

export interface SkillInfo {
  name: string;
  description: string;
  source: string;
  files: string[];
  triggers: string[];
  size: number;
  disabled: boolean;
}

export interface McpServerInfo {
  name: string;
  status: 'disabled' | 'disconnected' | 'connecting' | 'connected' | 'needs_auth' | 'error';
  error?: string;
  authUrl?: string;
  serverName?: string;
  instructions?: string;
  toolCount: number;
  tools: { name: string; description: string; readOnly: boolean; destructive: boolean }[];
  config: {
    type?: string;
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    headers?: Record<string, string>;
    enabled: boolean;
    autoApprove?: boolean | string[];
    description?: string;
    preset?: string;
  };
}

export interface McpPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  requires?: string;
  free: boolean;
  config: McpServerInfo['config'];
  secrets?: string[];
}

export interface SessionSettings {
  autoApproveEdits?: boolean;
  grants?: string[];
  role?: RoleId;
  skills?: string[];
}

export interface ArtifactRecord {
  id: string;
  projectId: string;
  sessionId: string | null;
  runId: string | null;
  name: string;
  type: string;
  path: string;
  size: number;
  createdAt: number;
  meta: Record<string, unknown>;
}

export interface SessionDetail {
  session: SessionSummary;
  settings: SessionSettings;
  runs: RunSummary[];
  events: Record<string, RunEventEnvelope[]>;
  activeRunId: string | null;
  changes: ChangeRecord[];
  artifacts: ArtifactRecord[];
}

export interface SessionListItem extends SessionSummary {
  active: boolean;
}

export interface ComposerPrefs {
  effort: EffortSetting;
  agentMode: 'chat' | 'plan' | 'mission';
}

export type { ModelInfo };
