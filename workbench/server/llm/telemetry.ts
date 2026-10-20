// TÉLÉMÉTRIE & COÛTS — every model call (OpenRouter or a direct provider) is recorded: cost (measured by the provider,
// calculated from public prices, or UNKNOWN — never invented), Time To First Token, tokens / second, tokens, errors.
// The finance dashboard reads the summaries: per model, per provider, per day, and the live series of the last calls.
// Pure (storage injected).
import type { StoreLike } from './keyVault';

export interface CallRecord {
  at: number;
  provider: string;
  model: string;
  /** What the call served (chat, 3D generation, auto-correction…). */
  purpose: string;
  ok: boolean;
  tokensIn: number;
  tokensOut: number;
  /** USD; null = no price known (shown as « inconnu », never as 0). */
  costUsd: number | null;
  costSource: 'measured' | 'calculated' | 'local' | 'unknown';
  ttftMs: number | null;
  tokensPerS: number | null;
  totalMs: number;
  error?: string;
}
export interface ModelSummary {
  key: string;
  provider: string;
  model: string;
  calls: number;
  errors: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  /** Calls whose cost is unknown (the total does not include them). */
  unknownCost: number;
  ttftP50: number | null;
  ttftP95: number | null;
  tpsMedian: number | null;
}
const KEY = 'wbd.telemetry.v1';
const MAX = 5000;
const pct = (xs: number[], p: number): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
};

export class Telemetry {
  private calls: CallRecord[];
  private listeners = new Set<() => void>();
  constructor(private store: StoreLike | null) {
    try {
      this.calls = JSON.parse(store?.getItem(KEY) ?? '[]') as CallRecord[];
    } catch {
      this.calls = [];
    }
  }
  record(c: CallRecord): void {
    this.calls.push(c);
    if (this.calls.length > MAX) this.calls.splice(0, this.calls.length - MAX);
    try {
      this.store?.setItem(KEY, JSON.stringify(this.calls));
    } catch {
      /* quota */
    }
    this.listeners.forEach((f) => f());
  }
  subscribe(f: () => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
  all(since = 0): CallRecord[] {
    return this.calls.filter((c) => c.at >= since);
  }
  clear(): void {
    this.calls = [];
    this.store?.removeItem(KEY);
    this.listeners.forEach((f) => f());
  }
  byModel(since = 0): ModelSummary[] {
    const m = new Map<string, CallRecord[]>();
    for (const c of this.all(since)) {
      const k = `${c.provider}|${c.model}`;
      (m.get(k) ?? m.set(k, []).get(k)!).push(c);
    }
    return [...m.entries()]
      .map(([key, cs]) => {
        const ttft = cs.map((c) => c.ttftMs).filter((v): v is number => v !== null);
        const tps = cs.map((c) => c.tokensPerS).filter((v): v is number => v !== null);
        return {
          key,
          provider: cs[0]!.provider,
          model: cs[0]!.model,
          calls: cs.length,
          errors: cs.filter((c) => !c.ok).length,
          tokensIn: cs.reduce((a, c) => a + c.tokensIn, 0),
          tokensOut: cs.reduce((a, c) => a + c.tokensOut, 0),
          costUsd: Math.round(cs.reduce((a, c) => a + (c.costUsd ?? 0), 0) * 1e6) / 1e6,
          unknownCost: cs.filter((c) => c.ok && c.costUsd === null).length,
          ttftP50: pct(ttft, 50),
          ttftP95: pct(ttft, 95),
          tpsMedian: pct(tps, 50),
        };
      })
      .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);
  }
  byDay(since = 0): { day: string; costUsd: number; calls: number }[] {
    const m = new Map<string, { costUsd: number; calls: number }>();
    for (const c of this.all(since)) {
      const d = new Date(c.at).toISOString().slice(0, 10);
      const v = m.get(d) ?? { costUsd: 0, calls: 0 };
      v.costUsd += c.costUsd ?? 0;
      v.calls++;
      m.set(d, v);
    }
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, v]) => ({ day, costUsd: Math.round(v.costUsd * 1e6) / 1e6, calls: v.calls }));
  }
  totals(since = 0): {
    calls: number;
    costUsd: number;
    unknownCost: number;
    purposes: Record<string, number>;
  } {
    const cs = this.all(since);
    const purposes: Record<string, number> = {};
    for (const c of cs)
      purposes[c.purpose] = Math.round(((purposes[c.purpose] ?? 0) + (c.costUsd ?? 0)) * 1e6) / 1e6;
    return {
      calls: cs.length,
      costUsd: Math.round(cs.reduce((a, c) => a + (c.costUsd ?? 0), 0) * 1e6) / 1e6,
      unknownCost: cs.filter((c) => c.ok && c.costUsd === null).length,
      purposes,
    };
  }
}
