import { z } from 'zod';
import { httpFetch } from '../llm/http';

// TypeSafe System One (Jev): fast typed judgments — Noul (yes/no probability),
// Choice (one of N with distribution) and Score (position on ordered levels).
// API key is server-side only (TYPESAFE_API_KEY).

const Instructions = z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())]);
export const JevQuestionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('noul'),
    instructions: Instructions,
    criteria: z.object({ true: Instructions.optional(), false: Instructions.optional() }).optional(),
  }),
  z.object({
    type: z.literal('choice'),
    instructions: Instructions,
    criteria: z.record(z.string(), z.union([Instructions, z.null()])),
  }),
  z.object({
    type: z.literal('score'),
    instructions: Instructions,
    criteria: z.array(Instructions).min(2).max(10),
  }),
]);
export type JevQuestion = z.infer<typeof JevQuestionSchema>;

export type JevAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | {
      type: 'score';
      score: number;
      legend: Record<string, string>;
      probabilities: Record<string, number>;
      confidence: number;
    };

export interface JevResult {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { input_tokens: number; output_tokens: number };
}

export class JevService {
  private status: { ok: boolean; checkedAt: number; error?: string; model?: string } | null = null;

  constructor(private readonly baseUrl = 'https://api.typesafe.ai/v1') {}

  get keyConfigured(): boolean {
    return Boolean(process.env.TYPESAFE_API_KEY);
  }

  async evaluate(
    state: unknown,
    questions: Record<string, JevQuestion>,
    opts: { model?: string; signal?: AbortSignal } = {},
  ): Promise<JevResult> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.TYPESAFE_API_KEY) headers.Authorization = `Bearer ${process.env.TYPESAFE_API_KEY}`;
    const body = JSON.stringify({ state, model: opts.model ?? 'jev-latest', questions });
    for (let attempt = 0; ; attempt++) {
      const res = await httpFetch(`${this.baseUrl}/systemone`, {
        method: 'POST',
        headers,
        body,
        signal: opts.signal,
      });
      if (res.ok) return (await res.json()) as JevResult;
      const text = await res.text().catch(() => '');
      if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      throw new Error(`Jev ${res.status}: ${text.slice(0, 400) || res.statusText}`);
    }
  }

  /** Cached availability probe (one tiny Noul). */
  async check(force = false): Promise<{ ok: boolean; error?: string; model?: string }> {
    if (!force && this.status && Date.now() - this.status.checkedAt < 10 * 60_000) return this.status;
    try {
      const r = await this.evaluate('ping', {
        ok: { type: 'noul', instructions: 'Is this text the word "ping"?' },
      });
      this.status = { ok: true, checkedAt: Date.now(), model: r.model };
    } catch (err) {
      this.status = { ok: false, checkedAt: Date.now(), error: (err as Error).message };
    }
    return this.status;
  }

  get available(): boolean {
    return this.status?.ok === true;
  }
}
