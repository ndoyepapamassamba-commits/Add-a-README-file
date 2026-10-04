import type { ChangeRecord, CreditsInfo, EffortSetting, ModelInfo, PermissionMode, RoleId, RunEventEnvelope, RunSummary, ServerStatus, SessionSummary } from '@shared/types';

export type View = 'projects' | 'chat' | 'code' | 'terminal' | 'browser' | 'data' | 'agents' | 'tasks' | 'models' | 'settings';

export interface StatusResponse extends ServerStatus {
  models: { count: number; fetchedAt: number; error: string | null };
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
  todayByModel: { model: string; cost: number; promptTokens: number; completionTokens: number; calls: number }[];
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
  agent: { maxSteps: number; maxRetries: number; toolTimeoutSec: number; maxSubagentDepth: number; parallelReads: boolean };
  autoTiers: Record<'fast' | 'balanced' | 'powerful' | 'reasoning' | 'vision', string[]>;
  webSearchProvider: 'auto' | 'openrouter' | 'brave';
  webSearchModel: string;
}

export interface AgentInfo {
  id: RoleId;
  label: string;
  description: string;
  tier: string;
  tools: string[];
}

export interface SessionSettings {
  autoApproveEdits?: boolean;
  grants?: string[];
  role?: RoleId;
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
  agentMode: 'chat' | 'plan';
}

export type { ModelInfo };
