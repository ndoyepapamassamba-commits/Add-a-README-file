import type { ChartData, EffortSetting, ModelInfo } from '@shared/types';
import type { ChatMessage } from '../../server/llm/types';

export type { ChatMessage, ModelInfo };
export type PermissionMode = 'safe' | 'normal' | 'auto';
export type AgentMode = 'chat' | 'plan';
export type View = 'chat' | 'files' | 'data' | 'agents' | 'skills' | 'plugins' | 'models' | 'settings';

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
  | { kind: 'model'; id: string; model: string; reason: string; auto: boolean }
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
      kind: 'usage';
      id: string;
      cost: number;
      promptTokens: number;
      completionTokens: number;
      model: string;
      durationMs: number;
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
}

export interface Settings {
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
