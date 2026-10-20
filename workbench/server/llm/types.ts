import type { CreditsInfo, ModelInfo, ReasoningEffort } from '@shared/types';

export type ContentPart =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  /** Opaque provider reasoning blocks, passed back verbatim (never shown). */
  reasoning_details?: unknown[];
}

export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
  temperature?: number;
  maxTokens?: number;
  plugins?: unknown[];
  responseFormat?: unknown;
  reasoningEffort?: ReasoningEffort;
  signal?: AbortSignal;
}

export interface StreamHandlers {
  onText?: (delta: string) => void;
  onReasoning?: () => void;
  onToolCallStart?: (name: string) => void;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  /** USD, as reported by the provider (null if not reported). */
  cost: number | null;
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  finishReason: string;
  usage: ChatUsage;
  model: string;
  reasoningDetails?: unknown[];
  annotations?: unknown[];
}

export interface KeyStatus {
  configured: boolean;
  connected: boolean;
  label?: string;
  limit?: number | null;
  limitRemaining?: number | null;
  usage?: number;
  isFreeTier?: boolean;
  error?: string;
}

export interface LLMProvider {
  readonly name: string;
  chat(req: ChatRequest, handlers?: StreamHandlers): Promise<ChatResult>;
  listModels(): Promise<ModelInfo[]>;
  keyStatus(): Promise<KeyStatus>;
  credits(): Promise<CreditsInfo>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'LLMError';
  }
  get isContextLength(): boolean {
    return /context|too long|maximum.*tokens|token limit/i.test(this.message) && this.status === 400;
  }
}
