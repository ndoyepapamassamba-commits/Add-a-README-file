import { describe, expect, it } from 'vitest';
import {
  SCIENCE,
  accountingOf,
  analyze,
  categoryOf,
  describe as desc,
  economicDrift,
  explainCost,
  explainTokens,
  hashText,
  pairUp,
  pairedStat,
  policyFor,
  reportOf,
  tCrit95,
  type CallRec,
  type ExperimentMeta,
} from '../../server/jev/science';
import type { JevLogEntry, Variant } from '../../server/jev/metrics';
import { eviGate } from '../../server/jev/live';

const call = (o: Partial<CallRec> & Pick<CallRec, 'kind'>): CallRec => ({
  step: 1,
  model: 'm/x',
  tokensIn: 0,
  tokensOut: 0,
  cost: 0,
  costSource: 'measured',
  ms: 10,
  ...o,
});

interface MkOpts {
  group: string;
  task?: string;
  category?: string;
  variant: Variant;
  rep?: number;
  model?: string;
  tokens?: number;
  cost?: number;
  jevCost?: number;
  jevTokens?: number;
  corrTokens?: number;
  ok?: boolean;
  quality?: number | null;
  latency?: number;
  prompt?: string;
}
let seq = 0;
function mk(o: MkOpts): JevLogEntry {
  const tokens = o.tokens ?? 10_000;
  const calls: CallRec[] = [
    call({
      kind: 'main',
      tokensIn: Math.round(tokens * 0.9),
      tokensOut: Math.round(tokens * 0.1),
      cost: o.cost ?? 0.01,
    }),
  ];
  if (o.corrTokens) calls.push(call({ kind: 'correction', tokensIn: o.corrTokens, cost: 0.001 }));
  if (o.jevCost || o.jevTokens)
    calls.push(
      call({
        kind: 'jev1',
        model: 'jev',
        tokensIn: o.jevTokens ?? 600,
        cost: o.jevCost ?? 0,
        costSource: 'calculated',
      }),
    );
  const acct = accountingOf(calls);
  const exp: ExperimentMeta = {
    experimentId: 'E1',
    groupId: o.group,
    taskId: o.task ?? 'TASK_001:data',
    category: o.category ?? 'data',
    protocol: 'fixed-model',
    variant: o.variant,
    rep: o.rep ?? 1,
    order: 0,
    timestamp: 0,
    model: o.model ?? 'm/x',
    modelVersion: null,
    modelsUsed: [o.model ?? 'm/x'],
    promptHash: hashText(o.prompt ?? 'p'),
    taskType: 'data',
    difficulty: 0.4,
    risk: 'low',
    toolsAvailable: 52,
    contextHash: 'c',
    temperature: null,
    maxTokens: 16000,
    jevMode: o.variant === 'off' ? 'off' : 'balanced',
  };
  return {
    id: `e${seq++}`,
    at: 0,
    session: 's',
    mission: 'm',
    task: 'data',
    mode: 'balanced',
    jev: o.variant !== 'off',
    level: 1,
    decisionBy: 'JEV-0',
    model: o.model ?? 'm/x',
    reason: '',
    tokensIn: acct.llmIn,
    tokensOut: acct.llmOut,
    cost: acct.llmCost + acct.correctionCost,
    jevCost: acct.jevCost,
    latencyMs: o.latency ?? 5000,
    decisionMs: 2,
    calls: 1,
    quality: null,
    success: o.ok ?? true,
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
    acct,
    experiment: exp,
    qualityMeasured: o.quality === undefined ? 90 : o.quality,
  } as JevLogEntry;
}

/** n groups of {off, variant}; `f` tunes the variant. */
function experiment(
  n: number,
  variant: Variant,
  f: (i: number) => Partial<MkOpts>,
  base: (i: number) => Partial<MkOpts> = () => ({}),
  cat = 'data',
) {
  const out: JevLogEntry[] = [];
  for (let i = 0; i < n; i++) {
    const g = `G-${cat}-${variant}-${i}`;
    out.push(mk({ group: g, category: cat, variant: 'off', rep: i + 1, ...base(i) }));
    out.push(mk({ group: g, category: cat, variant, rep: i + 1, ...f(i) }));
  }
  return out;
}

describe('separate ledgers: the cost of a mission is not the cost of JEV', () => {
  it('splits LLM / correction / tool / JEV costs and tokens', () => {
    const a = accountingOf([
      call({ kind: 'main', tokensIn: 9000, tokensOut: 1000, cost: 0.17 }),
      call({ kind: 'delegate', tokensIn: 3000, tokensOut: 500, cost: 0.01 }),
      call({ kind: 'gate', tokensIn: 2000, tokensOut: 100, cost: 0.002 }),
      call({ kind: 'correction', tokensIn: 2500, tokensOut: 300, cost: 0.004 }),
      call({ kind: 'tool', tokensIn: 500, tokensOut: 800, cost: 0.003 }),
      call({ kind: 'jev1', tokensIn: 658, cost: 0.000028, costSource: 'calculated' }),
      call({ kind: 'jev3', tokensIn: 900, cost: 0.00004, costSource: 'estimated' }),
    ]);
    expect(a.llmCost).toBeCloseTo(0.182);
    expect(a.correctionCost).toBeCloseTo(0.004);
    expect(a.toolCost).toBeCloseTo(0.003);
    expect(a.jevCost).toBeCloseTo(0.000068);
    expect(a.qaCost).toBe(0);
    expect(a.totalCost).toBeCloseTo(0.182 + 0.004 + 0.003 + 0.000068);
    // JEV is a tiny part of a 0.19 $ mission: it must not be blamed for the whole cost.
    expect(a.jevCost / a.totalCost).toBeLessThan(0.001);
    expect(a.jevTokens).toBe(1558);
    expect(a.correctionTokens).toBe(2800);
    expect(a.retryTokens).toBe(2100);
    expect(a.toolTokens).toBe(1300);
    expect(a.missionTokens).toBe(10_000 + 3500 + 2100 + 2800 + 1300);
    expect(a.totalTokens).toBe(a.missionTokens + a.jevTokens);
    expect(a.costBySource.calculated).toBeCloseTo(0.000028);
    expect(a.costBySource.estimated).toBeCloseTo(0.00004);
    expect(a.unmeasuredCostShare).toBeGreaterThan(0);
  });
  it('decomposes the input and flags what is not attributed', () => {
    const a = accountingOf([
      call({
        kind: 'main',
        tokensIn: 1000,
        split: { system: 300, tools: 400, history: 100, toolResults: 50 },
      }),
      call({
        kind: 'main',
        tokensIn: 2000,
        split: { system: 300, tools: 400, history: 600, toolResults: 500 },
      }),
    ]);
    expect(a.inputSplit.system).toBe(600);
    expect(a.inputSplit.tools).toBe(800);
    expect(a.inputSplit.unattributed).toBe(3000 - (600 + 800 + 700 + 550));
    expect(a.firstPromptTokens).toBe(1000);
    expect(a.lastPromptTokens).toBe(2000);
  });
});

describe('pairing and comparability', () => {
  it('pairs OFF with each variant of the same group; unpaired runs stay observational', () => {
    const log = [
      ...experiment(2, 'pre', () => ({})),
      mk({ group: 'lonely', variant: 'full' }), // no OFF in its group
      { ...mk({ group: 'x', variant: 'off' }), experiment: undefined, acct: undefined } as JevLogEntry, // legacy
    ];
    const p = pairUp(log);
    expect(p.pairs).toHaveLength(2);
    expect(p.observational).toHaveLength(2);
    expect(p.byVariant.pre).toHaveLength(2);
  });
  it('marks a pair NON COMPARABLE when a controlled variable changed, with the reason', () => {
    const log = [
      mk({ group: 'g', variant: 'off', model: 'a/one' }),
      mk({ group: 'g', variant: 'pre', model: 'b/two' }),
      mk({ group: 'g', variant: 'live', prompt: 'other prompt' }),
    ];
    const p = pairUp(log);
    expect(p.pairs).toHaveLength(0);
    expect(p.nonComparable).toHaveLength(2);
    expect(p.nonComparable[0]!.reasons.join()).toContain('model');
    expect(p.nonComparable[1]!.reasons.join()).toContain('promptHash');
    // and no conclusion is drawn from them
    const s = analyze(log);
    expect(s.verdict).toBe('E');
    expect(s.anomalies.join()).toContain('NON COMPARABLE');
  });
});

describe('statistics', () => {
  it('describe: mean, median, p95, min, max, sd', () => {
    const d = desc([1, 2, 3, 4, 100]);
    expect(d).toMatchObject({ n: 5, mean: 22, median: 3, min: 1, max: 100 });
    expect(d.p95).toBeCloseTo(80.8);
    expect(d.sd).toBeCloseTo(43.9, 0);
    expect(desc([]).mean).toBeNull();
    expect(desc([5]).sd).toBeNull();
  });
  it('paired difference: mean, Student 95 % CI, significance, and no CI under n = 3', () => {
    const s = pairedStat([1, 2, 3, 4, 5]);
    expect(s.meanDelta).toBe(3);
    const h = (tCrit95(4) * Math.sqrt(2.5)) / Math.sqrt(5);
    expect(s.ci95![0]).toBeCloseTo(3 - h);
    expect(s.ci95![1]).toBeCloseTo(3 + h);
    expect(s.significant).toBe(true);
    expect(pairedStat([-1, 2, -2, 1, 0]).significant).toBe(false);
    expect(pairedStat([1, 2]).ci95).toBeNull();
    expect(pairedStat([1, 2, 3]).lower).toBe(0);
    expect(pairedStat([-1, -2, 3]).lower).toBe(2);
  });
});

describe('verdicts: the data decide, in every direction', () => {
  it('E — insufficient sample: no saving is stated under n pairs', () => {
    const s = analyze(experiment(SCIENCE.minPairs - 1, 'pre', () => ({ tokens: 5000, cost: 0.005 })));
    expect(s.verdict).toBe('E');
    expect(s.deltas.pre!.label).toBe('INSUFFICIENT_SAMPLE');
    expect(s.deltas.pre!.judgement).toBe('insufficient');
    expect(reportOf(s).join('\n')).toContain('ÉCHANTILLON INSUFFISANT');
    expect(analyze([]).verdict).toBe('E');
  });
  it('A — JEV improves: cheaper per successful mission, same success and quality', () => {
    const s = analyze(experiment(6, 'pre', () => ({ tokens: 5000, cost: 0.005, jevCost: 0.00003 })));
    expect(s.deltas.pre!.judgement).toBe('improves');
    expect(s.verdict).toBe('A');
    const e = s.deltas.pre!.economics!;
    expect(e.jevSavingsValue).toBeCloseTo(0.005, 6);
    expect(e.jevGrossCost).toBeCloseTo(0.00003, 7);
    expect(e.jevNetValue).toBeCloseTo(0.005 - 0.00003, 6);
    expect(e.jevRoi).toBeGreaterThan(100);
    expect(e.negative).toBe(false);
    expect(s.bestVariant).toBe('pre');
    expect(s.worstVariant).toBe('off');
  });
  it('D — JEV is counter-productive: more expensive per success, ROI < 1, drift flagged, said plainly', () => {
    const s = analyze(
      experiment(6, 'full', () => ({
        tokens: 30_000,
        cost: 0.03,
        jevCost: 0.004,
        corrTokens: 2000,
        latency: 12_000,
      })),
    );
    expect(s.deltas.full!.judgement).toBe('worsens');
    expect(s.verdict).toBe('D');
    const e = s.deltas.full!.economics!;
    expect(e.negative).toBe(true);
    expect(e.jevRoi!).toBeLessThan(1);
    expect(e.roiNote).toContain('< 1');
    expect(s.drift.some((d) => d.kind === 'tokens_no_quality')).toBe(true);
    expect(s.drift.some((d) => d.kind === 'cost_no_success')).toBe(true);
    expect(s.worstVariant).toBe('full');
  });
  it('D — cheaper but worse quality / success is NOT an improvement', () => {
    const s = analyze(experiment(6, 'pre', () => ({ tokens: 4000, cost: 0.004, ok: false, quality: 40 })));
    expect(s.deltas.pre!.judgement).toBe('worsens');
    expect(s.deltas.pre!.reasons.join()).toMatch(/réussite|qualité/);
    expect(s.verdict).not.toBe('A');
  });
  it('C — neutral inside the ±5 % band', () => {
    const s = analyze(experiment(6, 'live', () => ({ cost: 0.0102, tokens: 10_100 })));
    expect(s.deltas.live!.judgement).toBe('neutral');
    expect(s.verdict).toBe('C');
  });
  it('B — profitable for some categories only', () => {
    const log = [
      ...experiment(
        6,
        'pre',
        () => ({ cost: 0.004, tokens: 4000 }),
        () => ({}),
        'code',
      ),
      ...experiment(
        6,
        'pre',
        () => ({ cost: 0.02, tokens: 20_000 }),
        () => ({ cost: 0.01 }),
        'research',
      ),
    ];
    const s = analyze(log);
    const code = s.categories.find((c) => c.category === 'code')!;
    const research = s.categories.find((c) => c.category === 'research')!;
    expect(code.best).toBe('pre');
    expect(research.best).toBe('off');
    expect(s.verdict).toBe('B');
    expect(s.recommendation).toContain('code → PRE');
    expect(s.recommendation).toContain('research → OFF');
    expect(policyFor(s, 'code')!.variant).toBe('pre');
    expect(policyFor(s, 'chat')).toBeNull();
  });
  it('a category with fewer than n groups gets no recommendation', () => {
    const s = analyze(
      experiment(
        3,
        'pre',
        () => ({ cost: 0.001 }),
        () => ({}),
        'browser',
      ),
    );
    const c = s.categories[0]!;
    expect(c.label).toBe('INSUFFICIENT_SAMPLE');
    expect(c.best).toBeNull();
    expect(policyFor(s, 'browser')).toBeNull();
  });
});

describe('quality: not measured is not zero', () => {
  it('null quality stays null (NON MESURÉ) and is excluded from the quality delta', () => {
    const s = analyze(
      experiment(
        6,
        'pre',
        () => ({ quality: null }),
        () => ({ quality: null }),
      ),
    );
    expect(s.byVariant.off!.quality.n).toBe(0);
    expect(s.byVariant.off!.quality.mean).toBeNull();
    expect(s.deltas.pre!.dQuality.n).toBe(0);
    expect(s.byVariant.pre!.qualityPerUsd).toBeNull();
    expect(reportOf(s).join('\n')).toContain('NON MESURÉE');
    // a quality drop is only used when measured in both runs of the pair
    const t = analyze(
      experiment(
        6,
        'pre',
        () => ({ quality: 50 }),
        () => ({ quality: null }),
      ),
    );
    expect(t.deltas.pre!.dQuality.n).toBe(0);
  });
});

describe('economics', () => {
  it('JEV-0 (no paid call) has no ROI: the value is the saving itself', () => {
    const s = analyze(experiment(6, 'pre', () => ({ cost: 0.006, tokens: 6000 })));
    const e = s.deltas.pre!.economics!;
    expect(e.jevGrossCost).toBe(0);
    expect(e.jevRoi).toBeNull();
    expect(e.roiNote).toContain('ROI non défini');
    expect(e.jevNetValue).toBeCloseTo(0.004, 6);
  });
  it('NET_TOKEN_SAVING and JEV_NET_TOKEN_IMPACT differ by what JEV consumed', () => {
    const s = analyze(experiment(6, 'pre', () => ({ tokens: 6000, jevTokens: 700, jevCost: 0.00003 })));
    const e = s.deltas.pre!.economics!;
    expect(e.tokensBaseline).toBe(10_000);
    expect(e.tokensActual).toBe(6000);
    expect(e.netTokenSaving).toBe(4000);
    expect(e.tokensRoutingAdded).toBe(700);
    expect(e.jevNetTokenImpact).toBe(3300);
  });
});

describe('COGNITIVE EFFICIENCY SCORE', () => {
  it('is 100 when identical to OFF, > 100 when better, and drops unmeasured components', () => {
    const same = analyze(experiment(6, 'pre', () => ({})));
    expect(same.deltas.pre!.ces!.score).toBe(100);
    const better = analyze(experiment(6, 'pre', () => ({ cost: 0.005, tokens: 5000 })));
    expect(better.deltas.pre!.ces!.score).toBeGreaterThan(100);
    const noQ = analyze(
      experiment(
        6,
        'pre',
        () => ({ quality: null }),
        () => ({ quality: null }),
      ),
    );
    const q = noQ.deltas.pre!.ces!.parts.find((p) => p.key === 'quality')!;
    expect(q.ratio).toBeNull();
    expect(q.used).toBe(false);
    expect(Object.values(SCIENCE.ces).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
});

describe('diagnostics of a heavy mission', () => {
  it('explains where 300k tokens come from, from the measured ledger', () => {
    const calls: CallRec[] = [];
    for (let i = 0; i < 12; i++)
      calls.push(
        call({
          kind: 'main',
          step: i + 1,
          tokensIn: 20_000 + i * 1500,
          tokensOut: 800,
          cost: 0.012,
          split: { system: 3000, tools: 9000, history: 2000 + i * 600, toolResults: 1000 + i * 800 },
        }),
      );
    const e = {
      ...mk({ group: 'd', variant: 'off' }),
      tokensIn: 300_000,
      tokensOut: 9600,
      acct: accountingOf(calls),
    } as JevLogEntry;
    const d = explainTokens(e);
    expect(d.available).toBe(true);
    expect(d.lines.join(' ')).toMatch(/12 appel/);
    expect(d.lines.join(' ')).toContain('JEV lui-même : 0 token distant');
    expect(d.rows.find((r) => r.label.startsWith('Entrée LLM'))!.tag).toBe('MEASURED');
    expect(d.rows.find((r) => r.label.includes('définitions d’outils'))!.tag).toBe('CALCULATED');
    const c = explainCost({ ...e, jev: false });
    expect(c.lines.join(' ')).toContain('sans JEV');
  });
  it('answers "is JEV responsible?" without ambiguity, and says when a mission predates the instrumentation', () => {
    const e = { ...mk({ group: 'd', variant: 'full', cost: 0.17, jevCost: 0.000028 }) } as JevLogEntry;
    const c = explainCost(e);
    expect(c.lines.join(' ')).toContain('JEV est-il responsable de ce coût ?');
    expect(c.rows.find((r) => r.label === 'JEV_COST')!.share).toBeLessThan(0.001);
    const legacy = explainTokens({ ...e, acct: undefined });
    expect(legacy.available).toBe(false);
    expect(legacy.lines[0]).toContain('avant l’instrumentation');
  });
});

describe('rules of the control plane', () => {
  it('EVI gate: skip when the expected benefit is below the cost, use when above', () => {
    expect(eviGate({ pUseful: 0.2, avoidableCostUsd: 0.001, callCostUsd: 0.00005 }).call).toBe(true);
    const skip = eviGate({ pUseful: 0.2, avoidableCostUsd: 0.0001, callCostUsd: 0.00005 });
    expect(skip.call).toBe(false);
    expect(skip.reason).toContain('SKIP');
    expect(skip.reason).toContain('projetée');
  });
  it('economicDrift is empty when nothing is worse', () => {
    expect(
      economicDrift(analyze(experiment(6, 'pre', () => ({ cost: 0.005, tokens: 5000 }))).deltas),
    ).toEqual([]);
  });
  it('categoryOf is deterministic', () => {
    const b = { text: 'x', attachments: [] as string[], difficulty: 0.2, mission: false };
    expect(categoryOf({ ...b, type: 'chat' })).toBe('chat');
    expect(categoryOf({ ...b, type: 'chat', difficulty: 0.7 })).toBe('reasoning');
    expect(categoryOf({ ...b, type: 'data', attachments: ['ventes.xlsx'] })).toBe('excel');
    expect(categoryOf({ ...b, type: 'code', mission: true })).toBe('agent');
    expect(categoryOf({ ...b, type: 'code', text: 'x'.repeat(9000) })).toBe('long_context');
  });
});

describe('technical report', () => {
  it('lists the required items and never fabricates', () => {
    const s = analyze(experiment(6, 'pre', () => ({ cost: 0.005, tokens: 5000, jevCost: 0.00003 })));
    const r = reportOf(s).join('\n');
    for (const k of [
      'Tâches benchmarkées',
      'paires valides',
      'Modèles utilisés',
      'Coût total du benchmark',
      'coût JEV',
      'tokens JEV',
      'ROI',
      'coût / mission réussie',
      'Meilleure stratégie',
      'Catégories où JEV est rentable',
      'overhead',
      'Anomalies',
      'Limitations',
    ])
      expect(r).toContain(k);
    expect(s.jevTokens).toBe(6 * 600);
    expect(s.models).toEqual(['m/x']);
    expect(s.repetitions).toBe(6);
  });
});
