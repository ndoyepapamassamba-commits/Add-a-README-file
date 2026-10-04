import { z } from 'zod';
import type { Repo } from '../db/repo';

export const AutoTiersSchema = z.object({
  fast: z.array(z.string()),
  balanced: z.array(z.string()),
  powerful: z.array(z.string()),
  reasoning: z.array(z.string()),
  vision: z.array(z.string()),
});
export type AutoTiers = z.infer<typeof AutoTiersSchema>;

// Model *families* (regex on the OpenRouter id), resolved against the live
// catalog at run time: the newest available model of the first matching
// family wins, so this list does not go stale when new versions ship.
export const DEFAULT_AUTO_TIERS: AutoTiers = {
  fast: [
    '^anthropic/claude-haiku',
    '^google/gemini-[0-9.]+-flash(?!-lite)',
    '^openai/gpt-[0-9.]+-mini',
    '^deepseek/deepseek-chat',
  ],
  balanced: ['^anthropic/claude-sonnet', '^openai/gpt-[0-9.]+$', '^google/gemini-[0-9.]+-pro'],
  powerful: ['^anthropic/claude-opus', '^openai/gpt-[0-9.]+$', '^google/gemini-[0-9.]+-pro'],
  reasoning: [
    '^anthropic/claude-opus',
    '^openai/gpt-[0-9.]+$',
    '^deepseek/deepseek-r',
    '^google/gemini-[0-9.]+-pro',
  ],
  vision: ['^anthropic/claude-sonnet', '^google/gemini-[0-9.]+-(pro|flash)', '^openai/gpt-[0-9.]+$'],
};

export const AppSettingsSchema = z.object({
  defaultModel: z.string().min(1).default('auto'),
  fallbackModel: z.string().default(''),
  secondFallbackModel: z.string().default(''),
  reviewModel: z.string().default(''),
  temperature: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().int().min(256).max(256_000).default(16_000),
  defaultPermissionMode: z.enum(['safe', 'normal', 'autonomous']).default('normal'),
  budget: z
    .object({
      daily: z.number().min(0).default(5),
      monthly: z.number().min(0).default(50),
      perTask: z.number().min(0).default(2),
      warnAt: z.number().min(0).max(1).default(0.8),
    })
    .default({ daily: 5, monthly: 50, perTask: 2, warnAt: 0.8 }),
  agent: z
    .object({
      maxSteps: z.number().int().min(1).max(300).default(60),
      maxRetries: z.number().int().min(0).max(10).default(3),
      toolTimeoutSec: z.number().int().min(5).max(1800).default(180),
      maxSubagentDepth: z.number().int().min(0).max(3).default(2),
      parallelReads: z.boolean().default(true),
    })
    .default({ maxSteps: 60, maxRetries: 3, toolTimeoutSec: 180, maxSubagentDepth: 2, parallelReads: true }),
  autoTiers: AutoTiersSchema.default(DEFAULT_AUTO_TIERS),
  skills: z
    .object({
      autoActivate: z.boolean().default(true),
      maxAuto: z.number().int().min(0).max(5).default(2),
      disabled: z.array(z.string()).default([]),
      showCatalog: z.boolean().default(true),
    })
    .default({ autoActivate: true, maxAuto: 2, disabled: [], showCatalog: true }),
  jev: z
    .object({
      enabled: z.boolean().default(true),
      routing: z.boolean().default(true),
      skills: z.boolean().default(true),
      threshold: z.number().min(0.5).max(0.99).default(0.75),
    })
    .default({ enabled: true, routing: true, skills: true, threshold: 0.75 }),
  mcp: z
    .object({
      autoConnect: z.boolean().default(true),
      connectTimeoutSec: z.number().int().min(2).max(120).default(20),
    })
    .default({ autoConnect: true, connectTimeoutSec: 20 }),
  webSearchProvider: z.enum(['auto', 'openrouter', 'brave']).default('auto'),
  webSearchModel: z.string().default(''),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      base[k] &&
      typeof base[k] === 'object' &&
      !Array.isArray(base[k])
    ) {
      out[k] = deepMerge(base[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else if (v !== undefined) out[k] = v;
  }
  return out;
}

export class SettingsService {
  private cache: AppSettings | null = null;
  constructor(private readonly repo: Repo) {}

  get(): AppSettings {
    if (!this.cache) {
      const stored = this.repo.getSetting<Record<string, unknown>>('app', {});
      const parsed = AppSettingsSchema.safeParse(stored);
      this.cache = parsed.success ? parsed.data : AppSettingsSchema.parse({});
    }
    return this.cache;
  }

  update(patch: unknown): AppSettings {
    if (!patch || typeof patch !== 'object') throw new Error('Invalid settings patch');
    const merged = deepMerge(
      this.get() as unknown as Record<string, unknown>,
      patch as Record<string, unknown>,
    );
    const next = AppSettingsSchema.parse(merged);
    for (const tier of Object.values(next.autoTiers)) {
      for (const pattern of tier) new RegExp(pattern); // throws on invalid regex
    }
    this.repo.setSetting('app', next);
    this.cache = next;
    return next;
  }
}
