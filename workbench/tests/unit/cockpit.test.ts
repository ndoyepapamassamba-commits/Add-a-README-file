import { describe, expect, it } from 'vitest';
import { agentStats, dailySeries, modelStats, percentile } from '../../direct/lib/cockpit';
import type { UsageEntry } from '../../direct/lib/types';

const now = Date.UTC(2026, 9, 13, 12);
const u = (over: Partial<UsageEntry>): UsageEntry => ({ ts: now, sessionId: 's', model: 'a/x', agent: 'omnipotent', cost: 0.01, tokensIn: 100, tokensOut: 50, durationMs: 1000, ...over });

describe('cockpit statistics (measured, never estimated)', () => {
  it('percentiles and per-model measures (p50 / p95, reliability = 1 − fallback share)', () => {
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([], 95)).toBe(0);
    const usage = [u({ durationMs: 500 }), u({ durationMs: 1500 }), u({ durationMs: 9000, fallback: true }), u({ model: 'b/y', cost: 0.2, durationMs: 200 }), u({ ts: now - 40 * 86400_000, model: 'old/z' })];
    const s = modelStats(usage, now - 30 * 86400_000);
    expect(s.map((x) => x.model)).toEqual(['b/y', 'a/x']); // most costly first; the 40-day-old call is out
    const ax = s.find((x) => x.model === 'a/x')!;
    expect(ax.calls).toBe(3);
    expect(ax.p50).toBe(1500);
    expect(ax.p95).toBe(9000);
    expect(ax.reliability).toBeCloseTo(2 / 3, 5);
    expect(ax.tokens).toBe(450);
  });
  it('daily series: one point per day, today last, zeros on quiet days', () => {
    const d = dailySeries([u({}), u({ ts: now - 86400_000, cost: 0.5 })], 5, now);
    expect(d.length).toBe(5);
    expect(d[4]!.day).toBe('2026-10-13');
    expect(d[4]!.calls).toBe(1);
    expect(d[3]!.cost).toBeCloseTo(0.5, 6);
    expect(d[0]!.calls).toBe(0);
  });
  it('agent totals, most used first', () => {
    const a = agentStats([u({}), u({}), u({ agent: 'reporting', cost: 1 })]);
    expect(a[0]!.agent).toBe('omnipotent');
    expect(a[0]!.calls).toBe(2);
    expect(a[1]!.cost).toBe(1);
  });
});
