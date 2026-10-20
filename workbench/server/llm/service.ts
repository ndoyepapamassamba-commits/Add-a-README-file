import type { ReasoningEffort } from '@shared/types';
import type { Repo } from '../db/repo';
import type { SettingsService } from '../services/settings';
import type { ModelCatalog } from './catalog';
import { resolveEffort } from './openrouterCore';
import { LLMError, type ChatMessage, type ChatRequest, type ChatResult, type LLMProvider } from './types';

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export interface CompleteContext {
  runId: string | null;
  sessionId: string | null;
  onText?: (delta: string) => void;
  onReasoning?: () => void;
  /** Called when a partially streamed answer is discarded before a retry. */
  onStreamReset?: () => void;
  onFallback?: (from: string, to: string, reason: string) => void;
  onRetry?: (model: string, attempt: number, reason: string) => void;
}

export interface CompleteResult extends ChatResult {
  cost: number;
  requestedModel: string;
}

const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const startOfMonth = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
};

/** Adds cache breakpoints for providers that need explicit prompt caching. */
export function applyPromptCaching(model: string, messages: ChatMessage[]): ChatMessage[] {
  if (!/^(anthropic\/|google\/gemini)/.test(model)) return messages;
  const out = messages.map((m) => ({ ...m }));
  const mark = (m: ChatMessage | undefined) => {
    if (!m || m.content === null) return;
    if (typeof m.content === 'string') {
      if (!m.content) return;
      m.content = [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }];
    } else {
      const parts = m.content.map((p) => ({ ...p }));
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]!;
        if (p.type === 'text') {
          parts[i] = { ...p, cache_control: { type: 'ephemeral' } };
          break;
        }
      }
      m.content = parts;
    }
  };
  // Breakpoint 1: the (large, stable) system prompt. Breakpoint 2: the latest
  // message, so the conversation prefix is reused on the next agent step.
  mark(out.find((m) => m.role === 'system'));
  const last = out[out.length - 1];
  if (last && last.role !== 'system' && last.role !== 'assistant') mark(last);
  return out;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new LLMError('Cancelled', 499, false, 'cancelled'));
      },
      { once: true },
    );
  });

export class LLMService {
  constructor(
    readonly provider: LLMProvider,
    readonly catalog: ModelCatalog,
    private readonly repo: Repo,
    private readonly settings: SettingsService,
  ) {}

  budgetState() {
    const b = this.settings.get().budget;
    const day = this.repo.usageSince(startOfDay());
    const month = this.repo.usageSince(startOfMonth());
    return {
      daily: { spent: day.cost, limit: b.daily, tokens: day.promptTokens + day.completionTokens },
      monthly: { spent: month.cost, limit: b.monthly, tokens: month.promptTokens + month.completionTokens },
      perTask: b.perTask,
      warnAt: b.warnAt,
    };
  }

  /** Throws when a configured budget (0 = unlimited) is exhausted. */
  checkBudget(runCost = 0): void {
    const s = this.budgetState();
    if (s.daily.limit > 0 && s.daily.spent >= s.daily.limit)
      throw new BudgetExceededError(
        `Budget journalier atteint ($${s.daily.spent.toFixed(4)} / $${s.daily.limit}). Modifiez-le dans Réglages › Budget.`,
      );
    if (s.monthly.limit > 0 && s.monthly.spent >= s.monthly.limit)
      throw new BudgetExceededError(
        `Budget mensuel atteint ($${s.monthly.spent.toFixed(4)} / $${s.monthly.limit}).`,
      );
    if (s.perTask > 0 && runCost >= s.perTask)
      throw new BudgetExceededError(`Budget par tâche atteint ($${runCost.toFixed(4)} / $${s.perTask}).`);
  }

  fallbackChain(primary: string): string[] {
    const s = this.settings.get();
    return [...new Set([primary, s.fallbackModel, s.secondFallbackModel].filter((m) => m && m !== 'auto'))];
  }

  async complete(
    req: ChatRequest & { fallbacks?: string[]; effort?: ReasoningEffort | 'auto' },
    ctx: CompleteContext,
  ): Promise<CompleteResult> {
    const maxRetries = this.settings.get().agent.maxRetries;
    const chain = [...new Set([req.model, ...(req.fallbacks ?? [])].filter(Boolean))];
    let lastError: unknown = null;

    for (let i = 0; i < chain.length; i++) {
      const model = chain[i]!;
      if (i > 0) ctx.onFallback?.(chain[i - 1]!, model, (lastError as Error)?.message ?? 'échec');
      const info = this.catalog.get(model);
      const effort =
        req.effort && req.effort !== 'auto' && info ? resolveEffort(req.effort, info.efforts) : null;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        let streamed = false;
        try {
          const result = await this.provider.chat(
            {
              ...req,
              model,
              messages: applyPromptCaching(model, req.messages),
              reasoningEffort: effort ?? undefined,
              maxTokens:
                req.maxTokens && info?.maxCompletionTokens
                  ? Math.min(req.maxTokens, info.maxCompletionTokens)
                  : req.maxTokens,
            },
            {
              onText: (d) => {
                streamed = true;
                ctx.onText?.(d);
              },
              onReasoning: ctx.onReasoning,
            },
          );
          const cost =
            result.usage.cost ??
            this.catalog.estimateCost(
              result.model,
              result.usage.promptTokens,
              result.usage.completionTokens,
            ) ??
            this.catalog.estimateCost(model, result.usage.promptTokens, result.usage.completionTokens) ??
            0;
          this.repo.addUsage({
            runId: ctx.runId,
            sessionId: ctx.sessionId,
            model: result.model || model,
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            cost,
          });
          return { ...result, cost, requestedModel: model };
        } catch (err) {
          lastError = err;
          if (streamed) ctx.onStreamReset?.();
          const e = err instanceof LLMError ? err : new LLMError((err as Error).message, 0, true);
          if (e.code === 'cancelled' || req.signal?.aborted)
            throw new LLMError('Cancelled', 499, false, 'cancelled');
          if (e.retryable && attempt < maxRetries) {
            const delay = Math.min(8000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 300);
            ctx.onRetry?.(model, attempt + 1, e.message);
            await sleep(delay, req.signal);
            continue;
          }
          // Non-retryable client errors (except "model unavailable") abort the chain.
          const modelProblem =
            e.status === 404 || /model|provider|unavailable|not found|no endpoints/i.test(e.message);
          if (!e.retryable && !modelProblem) throw e;
          break;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error('All models failed');
  }
}
