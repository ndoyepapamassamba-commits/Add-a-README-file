// Types shared by the local agent server and the web client.

export type PermissionMode = 'safe' | 'normal' | 'autonomous';
/** chat = direct agent loop, plan = plan → approval → execution. */
export type AgentMode = 'chat' | 'plan' | 'mission';
/** Built-in roles: general, coder, researcher, browser, data_analyst, reviewer, tester — plus custom agent ids. */
export type RoleId = string;
export const BUILTIN_ROLES = [
  'general',
  'coder',
  'researcher',
  'browser',
  'data_analyst',
  'reviewer',
  'tester',
] as const;
export type RunStatus =
  'queued' | 'running' | 'waiting_approval' | 'waiting_plan' | 'completed' | 'failed' | 'cancelled';

export interface ModelInfo {
  id: string;
  /** OpenRouter canonical slug (dated permaslug), used to match benchmark scores. */
  slug?: string;
  name: string;
  provider: string;
  created: number;
  contextLength: number;
  maxCompletionTokens: number | null;
  /** USD per 1M tokens (null when the provider does not publish it). */
  inputPrice: number | null;
  outputPrice: number | null;
  capabilities: {
    tools: boolean;
    reasoning: boolean;
    vision: boolean;
    structuredOutputs: boolean;
  };
  /** Reasoning effort levels the model accepts (empty = not configurable). */
  efforts: ReasoningEffort[];
  defaultEffort: ReasoningEffort | null;
  description: string;
}

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
/** 'auto' lets the model use its default effort. */
export type EffortSetting = 'auto' | ReasoningEffort;

export interface CreditsInfo {
  available: boolean;
  totalCredits: number | null;
  totalUsage: number | null;
  remaining: number | null;
  keyLimit: number | null;
  keyLimitRemaining: number | null;
  error?: string;
}

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

export interface PlanStep {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'done' | 'skipped';
}

export interface ApprovalRequest {
  approvalId: string;
  tool: string;
  summary: string;
  reason: string;
  /** Optional rich preview: unified diff for edits, command for terminal… */
  preview?:
    | { kind: 'diff'; path: string; before: string; after: string }
    | { kind: 'command'; command: string; risk: string }
    | { kind: 'text'; text: string };
}

export interface ToolResultPayload {
  ok: boolean;
  /** Short human summary shown in the transcript row. */
  summary: string;
  /** Structured data (redacted) returned to the client. */
  data?: unknown;
  error?: string;
  /** Artifacts or files produced, for rich rendering. */
  attachments?: Attachment[];
}

export type Attachment =
  | { kind: 'image'; artifactId: string; name: string }
  | { kind: 'chart'; artifactId: string; name: string }
  | { kind: 'artifact'; artifactId: string; name: string; type: string }
  | { kind: 'diff'; changeId: string; path: string; added: number; removed: number };

/** Events streamed for an agent run (persisted, replayable). */
export type AgentEvent =
  | {
      type: 'run_started';
      runId: string;
      sessionId: string;
      role: RoleId;
      mode: AgentMode;
      parentRunId?: string;
      title: string;
      userText: string;
      attachments: string[];
      permissionMode: PermissionMode;
    }
  | { type: 'status'; text: string }
  | {
      type: 'model_selected';
      model: string;
      reason: string;
      auto: boolean;
      effort?: string;
      tier?: string;
      fallbacks?: string[];
      estimate?: { low: number; high: number } | null;
    }
  | { type: 'mission_stage'; stage: string; note?: string }
  /** Intelligence Engine: strategy, shadow alert, evidence check, red team, learning. */
  | { type: 'intel'; title: string; tone: 'info' | 'warn' | 'ok' | 'err'; lines: string[]; detail?: string }
  | {
      type: 'mission_report';
      report: MissionReportPayload;
      round: number;
      review?: { approved: boolean; summary: string };
    }
  | { type: 'stream_reset' }
  | {
      type: 'skills_activated';
      skills: {
        name: string;
        reason: 'pinned' | 'manual' | 'agent' | 'auto' | 'model';
        matched?: string[];
      }[];
    }
  | { type: 'model_fallback'; from: string; to: string; reason: string }
  | { type: 'text_delta'; text: string; agentPath?: string }
  | { type: 'assistant_message'; text: string; agentPath?: string }
  | { type: 'thinking'; active: boolean }
  | { type: 'tool_call'; callId: string; tool: string; args: unknown; agentPath?: string }
  | {
      type: 'tool_result';
      callId: string;
      tool: string;
      result: ToolResultPayload;
      durationMs: number;
      agentPath?: string;
    }
  | { type: 'approval_required'; request: ApprovalRequest }
  | { type: 'approval_resolved'; approvalId: string; decision: 'approve' | 'deny'; note?: string }
  | { type: 'plan_proposed'; steps: PlanStep[]; summary: string }
  | { type: 'plan_updated'; steps: PlanStep[] }
  | { type: 'plan_resolved'; decision: 'approve' | 'cancel' }
  | {
      type: 'file_changed';
      changeId: string;
      path: string;
      op: 'write' | 'edit' | 'delete' | 'move';
      added: number;
      removed: number;
    }
  | {
      type: 'usage';
      model: string;
      promptTokens: number;
      completionTokens: number;
      cost: number;
      contextTokens: number;
      contextLimit: number;
    }
  | { type: 'subagent_started'; childRunId: string; role: RoleId; task: string }
  | { type: 'subagent_finished'; childRunId: string; role: RoleId; summary: string; ok: boolean }
  | { type: 'compacted'; removedMessages: number }
  | { type: 'error'; message: string; recoverable: boolean }
  | { type: 'run_finished'; status: RunStatus; summary?: string; usage: UsageTotals; durationMs: number };

export interface RunEventEnvelope {
  seq: number;
  runId: string;
  ts: number;
  event: AgentEvent;
}

export interface SessionSummary {
  id: string;
  projectId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  permissionMode: PermissionMode;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

export interface RunSummary {
  id: string;
  sessionId: string;
  projectId: string;
  parentRunId: string | null;
  role: RoleId;
  title: string;
  status: RunStatus;
  model: string;
  mode: AgentMode;
  startedAt: number;
  finishedAt: number | null;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  filesChanged: number;
  error: string | null;
}

export interface ChangeRecord {
  id: string;
  runId: string | null;
  sessionId: string | null;
  projectId: string;
  path: string;
  op: 'write' | 'edit' | 'delete' | 'move';
  before: string | null;
  after: string | null;
  status: 'applied' | 'accepted' | 'reverted';
  createdAt: number;
  added: number;
  removed: number;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  mtime: number;
  children?: FileEntry[];
}

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  isGit: boolean;
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'area' | 'scatter' | 'pie' | 'histogram' | 'heatmap' | 'table' | 'kpi';
  title: string;
  source: { path: string; sheet?: string };
  x?: { column: string; bucket?: 'day' | 'week' | 'month' | 'quarter' | 'year' };
  y?: { column: string; agg: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'median' | 'count_distinct' }[];
  series?: string;
  filters?: DataFilter[];
  bins?: number;
  limit?: number;
  sort?: 'x' | 'y_desc' | 'y_asc';
}

export interface DataFilter {
  column: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'is_null' | 'not_null';
  value?: unknown;
}

export interface ChartData {
  spec: ChartSpec;
  /** Category labels (x axis) */
  categories: (string | number)[];
  series: { name: string; data: (number | null)[] }[];
  /** For heatmap: [xIndex, yIndex, value] */
  matrix?: { xLabels: string[]; yLabels: string[]; values: [number, number, number][] };
  /** For scatter: pairs */
  points?: [number, number][];
  /** For table / kpi */
  rows?: Record<string, unknown>[];
  kpis?: { label: string; value: number | null }[];
  rowCount: number;
}

export interface ServerStatus {
  version: string;
  provider: { name: string; keyConfigured: boolean };
  workspaceRoot: string;
  browser: { engine: string; available: boolean };
  python: boolean;
  ripgrep: boolean;
  previewPort: number;
}

export interface MissionReportPayload {
  status: 'PASSED' | 'PARTIAL' | 'FAILED';
  summary: string;
  checks: { name: string; status: 'pass' | 'fail' | 'skip'; details?: string }[];
  issues: string[];
  deliverables: string[];
}
