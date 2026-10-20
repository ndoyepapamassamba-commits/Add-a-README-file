import type { z } from 'zod';
import type {
  AgentEvent,
  ApprovalRequest,
  Attachment,
  PermissionMode,
  PlanStep,
  RoleId,
} from '@shared/types';
import type { CommandLevel } from '../security/commandPolicy';
import type { ToolRisk } from '../security/permissions';
import type { Services } from '../services/container';

export interface ToolContext {
  projectId: string;
  sessionId: string;
  runId: string;
  role: RoleId;
  permissionMode: PermissionMode;
  signal: AbortSignal;
  services: Services;
  depth: number;
  modelSupportsVision: boolean;
  emit: (event: AgentEvent) => void;
  /** Images to show the model on its next step (vision models only). */
  pendingImages: { dataUrl: string; caption: string }[];
  /** Provided by the agent loop. */
  delegate?: (role: RoleId, task: string) => Promise<{ ok: boolean; summary: string; childRunId: string }>;
  setPlan?: (steps: PlanStep[]) => void;
  proposePlan?: (summary: string, steps: string[]) => void;
}

export interface ToolOutput {
  ok: boolean;
  summary: string;
  /** Structured data sent to the UI (redacted). */
  data?: unknown;
  /** Text given to the model. Defaults to a JSON rendering of `data`. */
  forModel?: string;
  attachments?: Attachment[];
  error?: string;
}

export interface RiskAssessment {
  risk: ToolRisk;
  commandLevel?: CommandLevel;
  reasons?: string[];
}

export interface ToolDef<A = unknown> {
  /** Dotted public name, e.g. "filesystem.read". */
  name: string;
  description: string;
  schema: z.ZodType<A>;
  /** JSON schema sent to the LLM instead of the zod conversion (MCP tools). */
  jsonSchema?: Record<string, unknown>;
  /** Read-only tools may run in parallel within one agent step. */
  readOnly: boolean;
  assess: (args: A, ctx: ToolContext) => RiskAssessment;
  /** One-line label for the transcript, e.g. "Read src/app.ts". */
  label: (args: A) => string;
  /** Key for "always allow this session" grants. */
  grantKey?: (args: A) => string;
  /** Rich preview shown in approval prompts. */
  preview?: (args: A, ctx: ToolContext) => Promise<ApprovalRequest['preview'] | undefined>;
  execute: (args: A, ctx: ToolContext) => Promise<ToolOutput>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = ToolDef<any>;

export function defineTool<A>(def: ToolDef<A>): ToolDef<A> {
  return def;
}

export class ToolError extends Error {}

export function ok(summary: string, data?: unknown, extra: Partial<ToolOutput> = {}): ToolOutput {
  return { ok: true, summary, data, ...extra };
}
