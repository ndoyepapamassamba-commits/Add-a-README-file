// COCKPIT — pure statistics for the Cockpit IA views (catalogue, orchestration, observabilité), computed from the
// application's own stores (usage entries, sessions). Nothing is estimated: a model never called shows « — ».
import type { UsageEntry } from './types';

export interface ModelStat {
  model: string;
  calls: number;
  cost: number;
  tokens: number;
  /** Median and 95th percentile of the call durations (ms). */
  p50: number;
  p95: number;
  fallbacks: number;
  /** 1 − fallback share (0..1). */
  reliability: number;
  lastTs: number;
}
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const k = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[k]!;
}
/** Per-model measurements over the usage entries since `since` (most costly first). */
export function modelStats(usage: UsageEntry[], since = 0): ModelStat[] {
  const m = new Map<string, { calls: number; cost: number; tokens: number; ms: number[]; fallbacks: number; lastTs: number }>();
  for (const u of usage) {
    if (u.ts < since) continue;
    const r = m.get(u.model) ?? { calls: 0, cost: 0, tokens: 0, ms: [], fallbacks: 0, lastTs: 0 };
    r.calls++;
    r.cost += u.cost;
    r.tokens += u.tokensIn + u.tokensOut;
    r.ms.push(u.durationMs);
    if (u.fallback) r.fallbacks++;
    r.lastTs = Math.max(r.lastTs, u.ts);
    m.set(u.model, r);
  }
  return [...m.entries()]
    .map(([model, r]) => ({ model, calls: r.calls, cost: r.cost, tokens: r.tokens, p50: percentile(r.ms, 50), p95: percentile(r.ms, 95), fallbacks: r.fallbacks, reliability: r.calls ? 1 - r.fallbacks / r.calls : 1, lastTs: r.lastTs }))
    .sort((a, b) => b.cost - a.cost || b.calls - a.calls);
}
export interface DayPoint {
  day: string;
  calls: number;
  cost: number;
  tokens: number;
}
/** One point per day over the last `days` days (today last), zeros on quiet days. */
export function dailySeries(usage: UsageEntry[], days = 14, now = Date.now()): DayPoint[] {
  const out: DayPoint[] = [];
  const key = (ts: number) => new Date(ts).toISOString().slice(0, 10);
  const idx = new Map<string, DayPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const d = key(now - i * 86400_000);
    const p = { day: d, calls: 0, cost: 0, tokens: 0 };
    out.push(p);
    idx.set(d, p);
  }
  for (const u of usage) {
    const p = idx.get(key(u.ts));
    if (!p) continue;
    p.calls++;
    p.cost += u.cost;
    p.tokens += u.tokensIn + u.tokensOut;
  }
  return out;
}
/** Per-agent totals (most used first). */
export function agentStats(usage: UsageEntry[], since = 0): { agent: string; calls: number; cost: number; p50: number }[] {
  const m = new Map<string, { calls: number; cost: number; ms: number[] }>();
  for (const u of usage) {
    if (u.ts < since) continue;
    const r = m.get(u.agent) ?? { calls: 0, cost: 0, ms: [] };
    r.calls++;
    r.cost += u.cost;
    r.ms.push(u.durationMs);
    m.set(u.agent, r);
  }
  return [...m.entries()].map(([agent, r]) => ({ agent, calls: r.calls, cost: r.cost, p50: percentile(r.ms, 50) })).sort((a, b) => b.calls - a.calls);
}

export interface HourPoint {
  /** Start of the hour (ms). */
  ts: number;
  calls: number;
  cost: number;
  /** Median call duration in the hour (ms, 0 when there was no call). */
  p50: number;
}
/** One point per hour over the last `hours` hours (current hour last), zeros on quiet hours. Measured only. */
export function hourlySeries(usage: UsageEntry[], hours = 24, now = Date.now()): HourPoint[] {
  const H = 3600_000;
  const first = Math.floor(now / H) * H - (hours - 1) * H;
  const buckets = Array.from({ length: hours }, (_, i) => ({ ts: first + i * H, calls: 0, cost: 0, ms: [] as number[] }));
  for (const u of usage) {
    const i = Math.floor((u.ts - first) / H);
    if (i < 0 || i >= hours) continue;
    const b = buckets[i]!;
    b.calls++;
    b.cost += u.cost;
    b.ms.push(u.durationMs);
  }
  return buckets.map((b) => ({ ts: b.ts, calls: b.calls, cost: b.cost, p50: percentile(b.ms, 50) }));
}

export interface Pulse {
  calls: number;
  cost: number;
  /** Median duration of the calls of the window (ms), null without call. */
  p50: number | null;
  /** Share of calls served without fallback (0..1), null without call. */
  success: number | null;
}
/** Totals of a window [since, now] of the usage log. */
export function pulse(usage: UsageEntry[], since: number): Pulse {
  const w = usage.filter((u) => u.ts >= since);
  return {
    calls: w.length,
    cost: w.reduce((a, u) => a + u.cost, 0),
    p50: w.length ? percentile(w.map((u) => u.durationMs), 50) : null,
    success: w.length ? 1 - w.filter((u) => u.fallback).length / w.length : null,
  };
}
