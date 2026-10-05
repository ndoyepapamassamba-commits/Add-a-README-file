import { describe, expect, it } from 'vitest';
import {
  LiveController,
  efficiencyScore,
  factOf,
  handoffOf,
  pruneToolOutputs,
  similarity,
  wasteRate,
  type LiveInit,
} from '../../server/jev/live';
import { compilePrompt, compileSkill, contradictions } from '../../server/jev/prompt';
import { dist, savingsVs, variantStats, type JevLogEntry } from '../../server/jev/metrics';
import { qualityCheck } from '../../server/jev/qa';
import { outputSpec } from '../../server/jev/style';
import { jevErrorText, callJev3, JEV_RELAY_URL, DEFAULT_JEV_API } from '../../server/jev/provider';

const budgets = { tokens: 10_000, costUsd: 0.05, timeMs: 600_000, steps: 12, retries: 2, corrections: 1 };
const init = (o: Partial<LiveInit> = {}): LiveInit => ({
  goal: 'Analyse le fichier ventes.csv et calcule le total des montants par agence',
  budgets,
  mode: 'balanced',
  model: 'premium/model',
  strategy: 'tool-loop',
  effort: 'auto',
  ladder: [
    { id: 'cheap/model', inputPrice: 0.1, pSuccess: 0.8 },
    { id: 'premium/model', inputPrice: 3, pSuccess: 0.9 },
    { id: 'top/model', inputPrice: 10, pSuccess: 0.95 },
  ],
  critical: false,
  mission: false,
  difficulty: 0.4,
  offered: ['filesystem.read', 'data.query', 'web.search', 'browser.open', 'image.generate', 'fx.rates'],
  toolDefTokens: {},
  level: 1,
  ...o,
});
const call = (o: Partial<Parameters<LiveController['afterCall']>[0]> = {}) => ({
  tokensIn: 1000,
  tokensOut: 200,
  cost: 0.001,
  content: '',
  toolCalls: [] as { name: string; args: string }[],
  contextTokens: 2000,
  contextLimit: 100_000,
  model: 'premium/model',
  ...o,
});

describe('JEV LIVE CONTROL LOOP', () => {
  it('dynamic token budget: B0 → B1 when progress justifies it, STOP when it does not', () => {
    const lc = new LiveController(init());
    // B0 = 50 % of 10k = 5k. Step 1 makes progress and crosses B0.
    const cp = lc.afterCall(
      call({ tokensIn: 5200, toolCalls: [{ name: 'data.query', args: '{"q":"sum"}' }] }),
    );
    expect(lc.state().budgetStage).toBe(1);
    expect(cp?.decisions.some((d) => /B0 atteint/.test(d.reason))).toBe(true);
    // No progress at all then crossing B1 (10k) → extension refused or final.
    const lc2 = new LiveController(init({ hardStops: true }));
    lc2.afterCall(call({ tokensIn: 5200, toolCalls: [{ name: 'data.query', args: '{"q":"a"}' }] }));
    lc2.afterCall(call({ tokensIn: 100, toolCalls: [{ name: 'data.query', args: '{"q":"a"}' }] }));
    const stop = lc2.afterCall(
      call({ tokensIn: 5000, toolCalls: [{ name: 'data.query', args: '{"q":"a"}' }] }),
    );
    expect(stop?.decisions.some((d) => d.action === 'STOP')).toBe(true);
  });

  it('by default the token budget never stops a run: compress and continue', () => {
    const lc = new LiveController(init());
    lc.afterCall(call({ tokensIn: 5200, toolCalls: [{ name: 'data.query', args: '{"q":"a"}' }] }));
    lc.afterCall(call({ tokensIn: 100, toolCalls: [{ name: 'data.query', args: '{"q":"a"}' }] }));
    const cp = lc.afterCall(call({ tokensIn: 5000, toolCalls: [{ name: 'data.query', args: '{"q":"b"}' }] }));
    expect(cp?.decisions.some((d) => d.action === 'STOP')).toBe(false);
    for (let i = 0; i < 10; i++) {
      const c = lc.afterCall(
        call({ tokensIn: 30_000, toolCalls: [{ name: 'data.query', args: `{"q":${i}}` }] }),
      );
      expect(c?.decisions.some((d) => d.action === 'STOP') ?? false).toBe(false);
    }
  });

  it('hard STOP on the cost budget', () => {
    const lc = new LiveController(init());
    const cp = lc.afterCall(call({ cost: 0.06 }));
    expect(cp?.decisions[0]!.action).toBe('STOP');
    expect(cp?.kind).toBe('budget_threshold');
  });

  it('stagnation → REPLAN first, then SWITCH_MODEL up, then STOP', () => {
    const lc = new LiveController(init());
    const same = { toolCalls: [{ name: 'filesystem.read', args: '{"path":"a"}' }] };
    lc.afterCall(call(same)); // fresh (first time)
    lc.afterCall(call(same));
    lc.afterCall(call(same));
    const r1 = lc.afterCall(call(same));
    expect(r1?.kind).toBe('stagnation');
    expect(r1?.decisions.some((d) => d.action === 'REPLAN')).toBe(true);
    lc.afterCall(call(same));
    lc.afterCall(call(same));
    const r2 = lc.afterCall(call(same));
    const sw = r2?.decisions.find((d) => d.action === 'SWITCH_MODEL');
    expect(sw?.model).toBe('top/model');
  });

  it('early stop when the model repeats the same answer', () => {
    const lc = new LiveController(init());
    const text =
      'Le total pour Dakar est de 1650 et pour Thiès de 300, soit un total général de 2030 sur la période.';
    lc.afterCall(call({ content: text }));
    const cp = lc.afterCall(call({ content: text }));
    expect(cp?.decisions[0]).toMatchObject({ action: 'STOP' });
  });

  it('switches DOWN to a cheaper model after clean mechanical tool steps (balanced, non-critical)', () => {
    const lc = new LiveController(init());
    for (let i = 0; i < 3; i++)
      lc.afterTool({ name: 'data.query', args: `{"i":${i}}`, ok: true, output: 'ok' });
    const cp = lc.afterCall(call({ toolCalls: [{ name: 'data.query', args: '{"x":1}' }] }));
    expect(cp?.decisions.find((d) => d.action === 'SWITCH_MODEL')?.model).toBe('cheap/model');
    // Never for a critical task.
    const crit = new LiveController(init({ critical: true }));
    for (let i = 0; i < 3; i++)
      crit.afterTool({ name: 'data.query', args: `{"i":${i}}`, ok: true, output: 'ok' });
    const c2 = crit.afterCall(call({ toolCalls: [{ name: 'data.query', args: '{"x":1}' }] }));
    expect(c2?.decisions.find((d) => d.action === 'SWITCH_MODEL')).toBeUndefined();
  });

  it('TOOL ROI: never-used, non-core tools are removed after 3 steps; core tools stay', () => {
    const lc = new LiveController(init());
    lc.afterCall(call({ toolCalls: [{ name: 'data.query', args: '1' }] }));
    lc.afterTool({ name: 'data.query', args: '1', ok: true, output: 'x' });
    lc.afterCall(call({ toolCalls: [{ name: 'data.query', args: '2' }] }));
    const cp = lc.afterCall(call({ toolCalls: [{ name: 'data.query', args: '3' }] }));
    const removed = cp!.decisions.filter((d) => d.action === 'REMOVE_TOOL').map((d) => d.tool);
    expect(removed).toEqual(expect.arrayContaining(['web.search', 'browser.open', 'image.generate']));
    expect(removed).not.toContain('filesystem.read');
    expect(removed).not.toContain('data.query');
    // MAX mode keeps every tool.
    const max = new LiveController(init({ mode: 'max' }));
    for (let i = 0; i < 3; i++) max.afterCall(call({ toolCalls: [{ name: 'data.query', args: String(i) }] }));
    expect(max.state().toolsOffered).toHaveLength(6);
  });

  it('tool errors: targeted retry, then REMOVE_TOOL after 3 failures of the same tool', () => {
    const lc = new LiveController(init());
    const a = lc.afterTool({ name: 'data.query', args: 'x', ok: false, output: 'Error: bad SQL' });
    expect(a?.decisions[0]!.action).toBe('RETRY_TARGETED');
    lc.afterTool({ name: 'data.query', args: 'y', ok: false, output: 'Error' });
    const c = lc.afterTool({ name: 'data.query', args: 'z', ok: false, output: 'Error' });
    expect(c?.decisions.some((d) => d.action === 'REMOVE_TOOL' && d.tool === 'data.query')).toBe(true);
    expect(lc.state().toolsOffered).not.toContain('data.query');
  });

  it('critical tool whose output contains an error → RETRY_TARGETED; facts feed the handoff', () => {
    const lc = new LiveController(init());
    const cp = lc.afterTool({
      name: 'code.run',
      args: '{}',
      ok: true,
      output: 'Traceback: ZeroDivisionError',
    });
    expect(cp?.kind).toBe('critical_tool');
    expect(cp?.decisions[0]!.action).toBe('RETRY_TARGETED');
    lc.afterTool({ name: 'filesystem.write', args: '{"path":"out.csv"}', ok: true, output: 'ok' });
    const h = lc.handoff();
    expect(h).toContain('wrote out.csv');
    expect(h).toContain('<jev_mission_state>');
    expect(handoffOf(lc.state())).toBe(h);
  });

  it('before premium / before retry checkpoints follow the marginal gain rule', () => {
    const lc = new LiveController(init());
    expect(
      lc.beforePremium({ model: 'top/model', quality: 96, target: 75, nextCost: 0.01, nextSuccess: 0.9 })
        .decisions[0]!.action,
    ).toBe('STOP');
    expect(
      lc.beforePremium({ model: 'top/model', quality: 40, target: 75, nextCost: 0.01, nextSuccess: 0.9 })
        .decisions[0]!.action,
    ).toBe('ESCALATE');
    expect(
      lc.beforeRetry({ quality: 60, corrections: 1, maxCorrections: 1, blocking: 2 }).decisions[0]!.action,
    ).toBe('STOP');
    expect(
      lc.beforeRetry({ quality: 60, corrections: 0, maxCorrections: 1, blocking: 1 }).decisions[0]!.action,
    ).toBe('RETRY_TARGETED');
  });

  it('JEV overhead: AUTO-DOWNGRADE to JEV-0 when JEV costs more than it saves', () => {
    const lc = new LiveController(init({ level: 3 }));
    for (let i = 0; i < 3; i++) lc.afterCall(call({ toolCalls: [{ name: 'data.query', args: String(i) }] }));
    lc.addJevCost(0.001, 300);
    const ov = lc.overhead(0.1);
    expect(ov.downgrade).toBe(true);
    // Step-wise: JEV-3 → JEV-2 now, then one more level every 2 steps while JEV does not pay for itself.
    expect(lc.state().level).toBe(2);
    expect(lc.overhead(0.1).downgrade).toBe(false);
    for (let i = 3; i < 5; i++) lc.afterCall(call({ toolCalls: [{ name: 'data.query', args: `x${i}` }] }));
    expect(lc.overhead(0.1).downgrade).toBe(true);
    expect(lc.state().level).toBe(1);
    for (let i = 5; i < 7; i++) lc.afterCall(call({ toolCalls: [{ name: 'data.query', args: `x${i}` }] }));
    lc.overhead(0.1);
    expect(lc.state().level).toBe(0);
    // Pays for itself → kept.
    const ok = new LiveController(init({ level: 3 }));
    for (let i = 0; i < 3; i++) ok.afterCall(call({ toolCalls: [{ name: 'data.query', args: String(i) }] }));
    ok.addJevCost(0.000001, 10);
    ok.addSaved(100_000);
    expect(ok.overhead(1).downgrade).toBe(false);
  });

  it('LOWER_REASONING on a long first answer to a simple task', () => {
    const lc = new LiveController(init({ difficulty: 0.2 }));
    const cp = lc.afterCall(call({ tokensOut: 5000, content: 'x '.repeat(50) }));
    expect(cp?.decisions.find((d) => d.action === 'LOWER_REASONING')?.effort).toBe('low');
  });

  it('ECONOMIC_DRIFT: more input per call without progress is detected, recorded and acted on', () => {
    const lc = new LiveController(init({ budgets: { ...budgets, tokens: 5_000_000 } }));
    const same = [{ name: 'filesystem.read', args: '{"path":"a"}' }];
    let hit: ReturnType<LiveController['afterCall']> = null;
    for (const t of [4000, 5000, 6500, 8500, 11_000])
      hit = lc.afterCall(call({ tokensIn: t, toolCalls: same, contextTokens: 60_000 })) ?? hit;
    expect(lc.driftEvents.length).toBeGreaterThan(0);
    expect(lc.driftEvents[0]).toContain('entrée ×');
    const all = lc.checkpoints.flatMap((c) => c.decisions);
    expect(
      all.some(
        (d) =>
          d.reason.includes('ECONOMIC_DRIFT') && ['COMPRESS', 'LOWER_REASONING', 'REPLAN'].includes(d.action),
      ),
    ).toBe(true);
    expect(hit).not.toBeNull();
    // Healthy growth with real progress is not a drift.
    const ok = new LiveController(init({ budgets: { ...budgets, tokens: 5_000_000 } }));
    for (const [i, t] of [4000, 5000, 6500, 8500, 11_000].entries())
      ok.afterCall(call({ tokensIn: t, toolCalls: [{ name: 'data.query', args: `{"q":${i}}` }] }));
    expect(ok.driftEvents).toEqual([]);
  });

  it('live context pruning replaces old large tool outputs, never mutates the originals', () => {
    const big = 'ligne de données '.repeat(400);
    const orig = { role: 'tool', content: big };
    const msgs = [
      orig,
      { role: 'tool', content: big },
      { role: 'tool', content: 'petit' },
      { role: 'tool', content: big },
    ];
    const cut = pruneToolOutputs(msgs, 2);
    expect(cut).toBeGreaterThan(1000);
    expect(String(msgs[0]!.content)).toMatch(/^\[JEV: sortie ancienne élaguée/);
    expect(orig.content).toBe(big);
    expect(msgs[3]!.content).toBe(big);
  });

  it('helpers: similarity, factOf', () => {
    expect(similarity('a b c d e f', 'a b c d e f')).toBe(1);
    expect(similarity('le chat dort sur le tapis', 'une voiture roule vite sur la route')).toBeLessThan(0.2);
    expect(factOf('web.search', '{"query":"BCEAO taux"}', '')).toContain('BCEAO');
  });
});

describe('WASTE RATE, efficiency score', () => {
  it('waste = unused tool defs + failed + repeated + discarded, over total', () => {
    const w = wasteRate({
      toolTokensSent: 10_000,
      unusedToolTokens: 6000,
      failedToolTokens: 500,
      repeatedToolTokens: 300,
      discardedTokens: 200,
      totalTokens: 40_000,
    });
    expect(w.wasted).toBe(7000);
    expect(w.rate).toBeCloseTo(0.175);
    expect(
      wasteRate({
        toolTokensSent: 0,
        unusedToolTokens: 0,
        failedToolTokens: 0,
        repeatedToolTokens: 0,
        discardedTokens: 0,
        totalTokens: 0,
      }).rate,
    ).toBeNull();
  });
  it('efficiency score: 50 = baseline, higher = better, null without data', () => {
    expect(
      efficiencyScore({ quality: 80, tokens: 1000, cost: 1, baseQuality: 80, baseTokens: 1000, baseCost: 1 }),
    ).toBe(50);
    expect(
      efficiencyScore({
        quality: 80,
        tokens: 500,
        cost: 0.5,
        baseQuality: 80,
        baseTokens: 1000,
        baseCost: 1,
      }),
    ).toBe(100);
    expect(
      efficiencyScore({ quality: 80, tokens: 0, cost: 0, baseQuality: 80, baseTokens: 1000, baseCost: 1 }),
    ).toBeNull();
  });
});

describe('PROMPT COMPILER 2.0 / SKILL CONTEXT COMPILER', () => {
  it('removes duplicated substantial lines, keeps pinned sections, measures the waste', () => {
    const rule = 'Never expose an API key, a token or a password in an answer or a log.';
    const c = compilePrompt([
      { name: 'system', text: `You are an agent.\n${rule}`, pinned: true },
      { name: 'doctrine', text: `${rule}\nPrefer measured facts over estimates in every report you write.` },
      { name: 'empty', text: '' },
      { name: 'memory', text: 'Prefer measured facts over estimates in every report you write.' },
    ]);
    expect(c.text.split(rule).length - 1).toBe(1);
    expect(c.removedLines).toBe(2);
    expect(c.wasteScore).toBeGreaterThan(0);
  });
  it('reports contradictions instead of resolving them', () => {
    expect(contradictions('Always answer in French please.\nNever answer in French please.')).toHaveLength(1);
  });
  it('injects only relevant sections of a large skill', () => {
    const body = `# Skill\nIntro.\n\n## Exports Excel\n${'Excel export details. '.repeat(300)}\n\n## Mail Outlook\n${'Outlook mail colours. '.repeat(300)}\n\n## Règles\nToujours le logo.`;
    const r = compileSkill(body, 'Génère un export Excel du portefeuille', 800);
    expect(r.after).toBeLessThan(r.before);
    expect(r.text).toContain('Exports Excel');
    expect(r.text).not.toContain('Outlook mail colours');
    expect(r.text).toContain('Règles');
    expect(compileSkill('petit skill', 'x').text).toBe('petit skill');
  });
});

describe('Benchmark 2.0 statistics', () => {
  const e = (
    variant: JevLogEntry['variant'],
    tokens: number,
    cost: number,
    ok: boolean,
    wasted: number,
  ): JevLogEntry =>
    ({
      id: 'x',
      at: 0,
      session: 's',
      mission: 'm',
      task: 'data',
      mode: 'balanced',
      jev: variant !== 'off',
      level: 1,
      decisionBy: 'JEV-0',
      model: 'm',
      reason: '',
      tokensIn: tokens,
      tokensOut: 0,
      cost,
      jevCost: 0,
      latencyMs: 1000,
      decisionMs: 1,
      calls: 1,
      quality: 80,
      success: ok,
      retries: 0,
      escalations: 0,
      corrections: 0,
      cacheHits: 0,
      toolsOffered: 1,
      toolsBaseline: 1,
      toolTokens: 1,
      toolTokensBaseline: 1,
      contextBefore: 0,
      contextAfter: 0,
      checkpoints: [],
      bench: 'data',
      variant,
      wasted,
    }) as JevLogEntry;
  it('mean / median / p95', () => {
    const d = dist([1, 2, 3, 4, 100]);
    expect(d.mean).toBe(22);
    expect(d.median).toBe(3);
    expect(d.p95).toBeCloseTo(80.8);
    expect(dist([]).mean).toBeNull();
  });
  it('variant stats and measured savings vs the baseline', () => {
    const log = [
      e('off', 1000, 0.01, true, 400),
      e('off', 1200, 0.012, true, 600),
      e('live', 600, 0.006, true, 50),
      e('live', 700, 0.007, true, 50),
    ];
    const base = variantStats(log, 'off');
    const live = variantStats(log, 'live');
    expect(base.runs).toBe(2);
    expect(live.successRate).toBe(1);
    const s = savingsVs(base, live);
    expect(s.tokenSavings).toBeCloseTo(1 - 650 / 1100);
    expect(s.wasteReduction).toBeCloseTo(0.9);
    expect(variantStats(log, 'pre').runs).toBe(0);
    expect(savingsVs(base, variantStats(log, 'pre')).tokenSavings).toBeNull();
  });
});

describe('QA failure vector, consistency, error localization', () => {
  it('detects contradictory figures and localizes failures', () => {
    const q = qualityCheck({
      answer: 'Total : 1650\nDétail…\nTotal : 1700',
      spec: outputSpec('Calcule le total'),
      evidence: ['1650', '1700'],
      usedTools: true,
      toolErrors: 0,
      toolCalls: 1,
      tokens: 100,
      tokenBudget: 1000,
    });
    expect(q.failures.some((f) => f.kind === 'consistency' && f.locus === 'reasoning')).toBe(true);
    expect(q.failureVector.reasoning).toBe(1);
    expect(q.levels).toEqual(['L0', 'L1']);
    expect(q.vector.consistency).toBeLessThan(1);
  });
});

describe('JEV API through the relay (CORS fix)', () => {
  it('defaults to the Supabase relay and explains CORS failures clearly', () => {
    expect(DEFAULT_JEV_API.endpoint).toBe(JEV_RELAY_URL);
    expect(jevErrorText(new TypeError('Failed to fetch'), 1000)).toMatch(/CORS/);
    const ab = new Error('x');
    ab.name = 'AbortError';
    expect(jevErrorText(ab, 2500)).toMatch(/2500 ms/);
  });
  it('JEV-3 typed judgment parses Noul answers and prices the input tokens', async () => {
    let sent: { headers: Record<string, string>; body: string } | null = null;
    const r = await callJev3(
      DEFAULT_JEV_API,
      'test-key-123456',
      { goal: 'g', latest_answer: 'a', mission: {} },
      async (_u, init) => {
        sent = init;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            answers: { done: { noul: 0.91 }, on_track: { noul: 0.7 } },
            usage: { input_tokens: 1000 },
          }),
          text: async () => '',
        };
      },
    );
    expect(r.done).toBe(0.91);
    expect(r.costUsd).toBeCloseTo(0.000042);
    expect(sent!.headers.Authorization).toBe('Bearer test-key-123456');
    expect(sent!.body).not.toContain('test-key');
  });
});
