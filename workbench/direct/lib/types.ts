import type { ChartData, EffortSetting, MissionReportPayload, ModelInfo } from '@shared/types';
import type { ChatMessage } from '../../server/llm/types';
import type { EngineSettings, RoutingDecision } from '../../server/engine/decision';
import type { JevSettings } from './jev';
import type { Checkpoint } from '../../server/jev/metrics';

export type { ChatMessage, ModelInfo };
export type PermissionMode = 'safe' | 'normal' | 'auto';
export type AgentMode = 'chat' | 'plan' | 'mission';
export type View =
  | 'home'
  | 'chat'
  | 'files'
  | 'data'
  | 'terminal'
  | 'browser'
  | 'workflows'
  | 'agents'
  | 'skills'
  | 'plugins'
  | 'models'
  | 'intelligence'
  | 'jev'
  | 'studio'
  | 'cognitive'
  | 'settings';

export interface VFile {
  path: string;
  /** Text content, or base64 for binary files. */
  data: string;
  binary: boolean;
  mime: string;
  size: number;
  updatedAt: number;
}

export interface Attachment {
  path: string;
  name: string;
  mime: string;
  size: number;
}

export interface PlanStep {
  title: string;
  status: 'pending' | 'in_progress' | 'done';
}

export type Item =
  | { kind: 'user'; id: string; text: string; attachments: Attachment[]; ts: number }
  | { kind: 'assistant'; id: string; text: string; agent?: string; streaming?: boolean }
  | {
      kind: 'tool';
      id: string;
      tool: string;
      label: string;
      args: unknown;
      status: 'running' | 'ok' | 'error' | 'denied';
      summary?: string;
      output?: string;
      agent?: string;
      chart?: ChartData;
      artifact?: string;
    }
  | {
      kind: 'approval';
      id: string;
      tool: string;
      label: string;
      preview: string;
      diff?: { path: string; before: string; after: string };
      resolved?: 'approve' | 'deny';
      agent?: string;
    }
  | { kind: 'plan'; id: string; summary: string; steps: string[]; resolved?: 'approve' | 'cancel' }
  | { kind: 'checklist'; id: string; steps: PlanStep[] }
  | {
      kind: 'model';
      id: string;
      model: string;
      reason: string;
      auto: boolean;
      tier?: string;
      fallbacks?: string[];
      estimate?: { low: number; high: number } | null;
    }
  | { kind: 'pipeline'; id: string; current: string; done: string[] }
  | {
      kind: 'mission';
      id: string;
      report: MissionReportPayload;
      round: number;
      review?: { approved: boolean; summary: string };
    }
  | { kind: 'skills'; id: string; names: string[] }
  | {
      kind: 'subagent';
      id: string;
      role: string;
      task: string;
      status: 'running' | 'done' | 'error';
      summary?: string;
    }
  | { kind: 'error'; id: string; text: string }
  | {
      /** Explained routing decision (model, agent, skills, MCP, tools, scores, fallback, escalation). */
      kind: 'routing';
      id: string;
      decision: RoutingDecision;
    }
  | {
      /** JEV live execution trace (checkpoints with duration, tokens, cost, decision). */
      kind: 'jev';
      id: string;
      packet: Record<string, unknown>;
      why: string[];
      trace: Checkpoint[];
      done?: boolean;
      summary?: string;
      /** Final live control snapshot of the run. */
      live?: import('./store').JevLiveSnapshot;
    }
  | {
      /** Intelligence Engine events: strategy, shadow alerts, evidence check, red team, learning. */
      kind: 'intel';
      id: string;
      title: string;
      tone: 'info' | 'warn' | 'ok' | 'err';
      lines: string[];
      detail?: string;
    }
  | {
      kind: 'usage';
      id: string;
      cost: number;
      promptTokens: number;
      completionTokens: number;
      model: string;
      durationMs: number;
      models?: string[];
      fallbacks?: number;
      verdict?: MissionReportPayload['status'];
    };

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  effort: EffortSetting;
  agent: string;
  mode: PermissionMode;
  pinnedSkills: string[];
  /** Conversation sent to the model (system prompt excluded). */
  history: ChatMessage[];
  items: Item[];
  cost: number;
  tokensIn: number;
  tokensOut: number;
  /** Last mission verdict / run outcome (Mission Control). */
  verdict?: MissionReportPayload['status'] | 'ERROR' | null;
  lastMode?: AgentMode;
  /** Resume summary saved when a run is interrupted (intelligent compression). */
  resume?: string;
  /** Where each user request (mission) starts in `history`: exact boundaries for the OMNIPOTENT history firewall. */
  turns?: { start: number; text: string; at: number }[];
  /** Files the last run of this chat delivered (chat-relative paths): the default target of « modifie / change … ». */
  lastDelivery?: { start: number; paths: string[]; request: string; at: number };
  /** Model chosen once for this chat when the session is on « auto » (model lock). */
  pinnedModel?: string;
  /** JEV semantic memory of THIS chat (decisions, preferences, deliveries). */
  memory?: import('../../server/jev/memory/semantic').MemFact[];
  /** Archived chats leave the list (restorable; nothing is deleted). */
  archived?: boolean;
}

/** One LLM call (cost tracking, Mission Control). */
export interface UsageEntry {
  ts: number;
  sessionId: string;
  model: string;
  agent: string;
  cost: number;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  fallback?: boolean;
  tools?: string[];
}

/** Saved procedure run in one click. */
export interface Workflow {
  id: string;
  name: string;
  description: string;
  agent: string;
  steps: string[];
  createdAt: number;
  lastRunAt?: number;
  builtin?: boolean;
}

export interface SkillDef {
  name: string;
  description: string;
  body: string;
  /** Bundled files (references, scripts…) as text. */
  files: Record<string, string>;
  triggers: string[];
  enabled: boolean;
}

export interface AgentDef {
  id: string;
  name: string;
  description: string;
  prompt: string;
  /** null = all tools */
  tools: string[] | null;
  model: string | null;
  effort: EffortSetting | null;
  skills: string[];
  builtin?: boolean;
}

export interface McpServerDef {
  name: string;
  url: string;
  headers?: Record<string, string>;
  enabled: boolean;
  autoApprove: boolean;
  description?: string;
  /** Preset that needs a personal token, sent as "Authorization: Bearer <token>". */
  needsToken?: string;
}

export interface Settings {
  /** A chat keeps the same model for the whole conversation (default true). */
  pinModel?: boolean;
  /** JEV vision bridge: a text-only model gets an exact description + OCR of images (default true). */
  visionBridge?: boolean;
  /** Vision model used by the bridge (empty = cheapest / free). */
  visionModel?: string;
  /** Tavily API key (free monthly credits; callable from the browser, no relay). */
  tavilyKey?: string;
  /** Serper API key (Google results; free queries on signup; callable from the browser). */
  serperKey?: string;
  /** Brave Search API key (stored locally, sent only to Brave / your relay). */
  braveKey?: string;
  /** URL of your brave-relay (Supabase Edge Function) — needed because Brave blocks browser calls (CORS). */
  braveRelay?: string;
  /** If Brave fails, fall back to OpenRouter web search (paid per result). */
  braveFallback?: boolean;
  /** Default export theme (house = GOD 3D · BLUE ECOBANK). */
  exportTheme?: string;
  rememberKey: boolean;
  defaultModel: string;
  fallbackModel: string;
  effort: EffortSetting;
  temperature: number | null;
  maxSteps: number;
  budgetPerTask: number;
  budgetDaily: number;
  theme: 'dark' | 'light';
  autoSkills: boolean;
  /** Built-in plugins switched off by the user. */
  disabledPlugins: string[];
  /** Intelligence Engine: routing weights, QA threshold, escalations, price cap. */
  engine?: Partial<EngineSettings>;
  /** JEV Cognitive Companion (mode, provider, endpoint…). The API key is stored apart. */
  jev?: Partial<JevSettings>;
  /** JEV Cognitive Fabric (additive layer): see server/jev/fabric. */
  fabric?: Partial<import('../../server/jev/fabric/types').FabricSettings>;
  /** JEV Apprentice (free-first). Off by default: the V5 router decides exactly as before. */
  apprentice?: Partial<import('../../server/jev/apprentice/types').ApprenticeSettings>;
  /** OMNIPOTENT V4.1 governor (history / memory / tool firewall, fast lane, drift guard). Absent = defaults (ON). */
  omni?: Partial<import('../../server/jev/omni/trace').OmniSettings>;
}

export interface ArtifactDef {
  id: string;
  name: string;
  type: 'html' | 'markdown' | 'svg' | 'chart' | 'text' | 'json' | 'csv';
  content: string;
  chart?: ChartData;
  createdAt: number;
  sessionId: string;
}

/** EXPERIENCE VAULT: answers, files and code the user judged well written / well executed, reused as experience. */
export interface VaultEntry {
  id: string;
  at: number;
  title: string;
  /** Request that produced it (retrieval key). */
  request: string;
  text: string;
  files: { path: string; data: string; binary: boolean; mime: string }[];
  tags: string[];
  source: string;
}
