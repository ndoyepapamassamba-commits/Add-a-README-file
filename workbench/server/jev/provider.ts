// JEV_PROVIDER: local (JEV-0 only), api (TypeSafe Jev System One — JEV-1),
// hybrid (JEV-0 first, JEV-1 only when its decision is worth more than the call).
// Every remote call goes through the ROI GATE, has a timeout and falls back to
// JEV-0 on any failure: JEV can never block the Workbench.
import type { TaskType } from '../llm/routing';
import type { JevMode } from './tools';

export type JevProviderKind = 'local' | 'api' | 'hybrid';
export interface JevApiConfig {
  provider: JevProviderKind;
  /** TypeSafe endpoint, or a relay (the browser cannot call TypeSafe directly: CORS). */
  endpoint: string;
  model: string;
  timeoutMs: number;
  /** Max USD per day spent on JEV calls. */
  budgetDaily: number;
}
export const DEFAULT_JEV_API: JevApiConfig = {
  provider: 'hybrid',
  endpoint: 'https://api.typesafe.ai/v1/systemone',
  model: 'jev-latest',
  timeoutMs: 1500,
  budgetDaily: 0.05,
};
/** Jev 1.13 price (docs.typesafe.ai/models): $0.042 per million input tokens, output free. */
export const JEV_PRICE_PER_MTOK = 0.042;

export interface Jev1Answer {
  type: TaskType;
  typeConfidence: number;
  difficulty: number;
  risk: number;
  needsTools: number;
  ambiguity: number;
  model: string;
  inputTokens: number;
  costUsd: number;
  ms: number;
}

export const JEV1_QUESTIONS = {
  type: {
    type: 'choice',
    instructions: 'What kind of work does `request` ask the assistant to do?',
    criteria: {
      code: 'write, fix, refactor or test software',
      data: 'analyse tables, spreadsheets, figures or statistics',
      research: 'search the web or compare external sources',
      browser: 'operate a website or a web application',
      document: 'read or extract information from documents (PDF, Word, contracts)',
      review: 'audit, verify or review work for quality or security',
      writing: 'draft or rewrite text (email, note, report)',
      vision: 'describe or read an image',
      chat: 'answer a simple question or converse',
    },
  },
  difficulty: {
    type: 'score',
    instructions: 'How much expertise and reasoning does `request` need?',
    criteria: [
      'trivial: one obvious step',
      'routine: a few known steps',
      'demanding: several steps, care needed',
      'expert: deep reasoning, many steps, high precision',
    ],
  },
  risk: {
    type: 'noul',
    instructions:
      'Would a mistake in answering `request` have serious consequences (money, regulation, governance, legal, production)?',
  },
  needs_tools: {
    type: 'noul',
    instructions:
      'Does `request` need files, data, code execution, the web or another tool to be answered correctly?',
  },
  ambiguity: {
    type: 'noul',
    instructions: 'Is `request` too ambiguous to act on without asking the user a clarifying question?',
  },
} as const;

/** Estimated input tokens of a JEV-1 call (state + questions). */
export const jev1Tokens = (text: string) => Math.ceil((Math.min(6000, text.length) + 1400) / 3.8);
export const jev1Cost = (text: string) => (jev1Tokens(text) * JEV_PRICE_PER_MTOK) / 1e6;

/**
 * ROI GATE: call JEV-1 only if the expected value of a better decision is larger
 * than the call. Expected value ≈ P(JEV-0 is wrong) × what a wrong routing costs
 * (half of the estimated mission cost: a wrong tier wastes or under-delivers).
 */
export function roiGate(o: {
  jev0Confidence: number;
  missionCostEstimate: number;
  callCost: number;
  mode: JevMode;
  spentToday: number;
  budgetDaily: number;
}): { call: boolean; expectedValue: number; reason: string } {
  const pWrong = 1 - o.jev0Confidence;
  const expectedValue = pWrong * o.missionCostEstimate * 0.5;
  const minConf = { eco: 0.5, balanced: 0.7, performance: 0.8, max: 0.9 }[o.mode];
  if (o.spentToday + o.callCost > o.budgetDaily)
    return { call: false, expectedValue, reason: 'budget JEV du jour atteint : JEV-0 seul' };
  if (o.jev0Confidence >= minConf)
    return {
      call: false,
      expectedValue,
      reason: `JEV-0 sûr de lui (${Math.round(o.jev0Confidence * 100)} %) : aucun appel distant`,
    };
  if (expectedValue <= o.callCost)
    return {
      call: false,
      expectedValue,
      reason: `valeur attendue $${expectedValue.toFixed(6)} ≤ coût $${o.callCost.toFixed(6)} : JEV-0 seul`,
    };
  return {
    call: true,
    expectedValue,
    reason: `valeur attendue $${expectedValue.toFixed(6)} > coût $${o.callCost.toFixed(6)}`,
  };
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

/** One JEV-1 call. Throws on any failure (the caller falls back to JEV-0). */
export async function callJev1(
  cfg: JevApiConfig,
  key: string | null,
  state: { request: string; attachments: string[]; previous?: string },
  fetchFn: FetchLike,
): Promise<Jev1Answer> {
  const ac = new AbortController();
  const t0 = Date.now();
  const timer = setTimeout(() => ac.abort(), cfg.timeoutMs);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetchFn(cfg.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        state: {
          request: state.request.slice(0, 6000),
          attachments: state.attachments,
          previous_message: state.previous?.slice(0, 1500),
        },
        model: cfg.model,
        questions: JEV1_QUESTIONS,
      }),
      signal: ac.signal,
    });
    if (!res.ok)
      throw new Error(`JEV API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    const r = (await res.json()) as {
      model: string;
      answers: Record<string, { choice?: string; confidence?: number; score?: number; noul?: number }>;
      usage?: { input_tokens: number };
    };
    const a = r.answers;
    if (!a?.type?.choice) throw new Error('JEV API : réponse mal formée');
    const tokens = r.usage?.input_tokens ?? jev1Tokens(state.request);
    return {
      type: a.type.choice as TaskType,
      typeConfidence: a.type.confidence ?? 0,
      difficulty: Math.max(0, Math.min(1, ((a.difficulty?.score ?? 1) + 0) / 3)),
      risk: a.risk?.noul ?? 0,
      needsTools: a.needs_tools?.noul ?? 0.5,
      ambiguity: a.ambiguity?.noul ?? 0,
      model: r.model,
      inputTokens: tokens,
      costUsd: (tokens * JEV_PRICE_PER_MTOK) / 1e6,
      ms: Date.now() - t0,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Never log or display a key: masked form only. */
export function maskSecret(s: string): string {
  if (!s) return '';
  return s.length <= 8 ? '••••' : `${s.slice(0, 4)}…${s.slice(-3)}`;
}
/** Redacts anything that looks like a credential before it reaches a log. */
export function redact(text: string): string {
  return text
    .replace(/\b(sk-or-v1-|sk-|ghp_|ts_|tsk_|xox[bp]-)[A-Za-z0-9_-]{8,}/g, '$1***')
    .replace(
      /(authorization|api[_-]?key|token|password|secret)(["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,
      '$1$2***',
    );
}
