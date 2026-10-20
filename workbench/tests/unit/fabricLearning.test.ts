import { describe, expect, it } from 'vitest';
import { entry, many } from '../helpers/logEntry';
import {
  bestConfigs,
  capabilityStats,
  classify,
  configStats,
  failureLibrary,
  findSimilar,
  intelligenceGraph,
  memories,
  reusableStrategies,
  signatureOf,
  strategiesFor,
  toExperience,
} from '../../server/jev/fabric/memory';
import {
  DIMENSIONS,
  GOVERNOR_RATIO,
  MASSAMBA_MODEL_EXPERTISE_MATRIX,
  activate,
  applyPolicies,
  chooseWithExploration,
  dimsOf,
  economicGovernor,
  jevHealth,
  learnPolicies,
  mergePolicies,
  preferredModels,
  rankByDimension,
  rollbackPolicy,
} from '../../server/jev/fabric/learning';
import { CACHE_LEVELS, CognitiveCache } from '../../server/jev/fabric/cache';
import {
  checkProvider,
  classifyData,
  containsSecret,
  scrubSecrets,
  unknownPolicy,
} from '../../server/jev/fabric/security';

describe('experience memory', () => {
  it('classifies success / failure / near-miss / correction without inventing', () => {
    expect(classify(entry({ ok: true, quality: 95 }))).toEqual(['success']);
    expect(classify(entry({ ok: false }))).toContain('failure');
    expect(classify(entry({ ok: true, corrections: 1 }))).toContain('correction');
    expect(classify(entry({ ok: true, retries: 1 }))).toContain('near-miss');
    expect(classify(entry({ ok: true, quality: 60 }))).toContain('near-miss');
    expect(classify(entry({ ok: null, quality: null }))).toEqual([]);
  });
  it('separates the eight memories', () => {
    const log = [
      entry({ ok: true }),
      entry({ ok: false, tools: ['web.search'], toolErrors: ['web.search: HTTP 500'] }),
      entry({ ok: true, corrections: 1 }),
      entry({ ok: true, retries: 1, skills: ['IFRS9'] }),
    ];
    const m = memories(log);
    expect(m.success).toHaveLength(1);
    expect(m.failure).toHaveLength(1);
    expect(m.correction).toHaveLength(1);
    expect(m.nearMiss).toHaveLength(1);
    expect(m.tool.find((t) => t.tool === 'web.search')!.failures).toBe(1);
    expect(m.skill[0]!.skill).toBe('IFRS9');
    expect(m.routing[0]!.taskType).toBe('data');
  });
  it('redacts secrets in the stored task signature', () => {
    const e = toExperience(entry({ mission: 'utilise la clé sk-or-v1-abcdef1234567890 pour appeler' }));
    expect(e.task).not.toContain('abcdef1234567890');
  });
  it('capability statistics are measured from the runs that used the capability', () => {
    const s = capabilityStats([
      entry({ tools: ['data.query'], ok: true }),
      entry({ tools: ['data.query'], ok: false }),
      entry({ tools: ['code.run'], ok: true }),
    ]);
    expect(s.get('data.query')!.samples).toBe(2);
    expect(s.get('data.query')!.successRate).toBe(0.5);
    expect(s.get('browser.open')).toBeUndefined();
  });
  it('« Ai-je déjà rencontré ce problème ? » answers from real experiences, and says no when there are none', () => {
    const log = [
      entry({
        mission: 'calcule le total des provisions IFRS9 du fichier portefeuille.xlsx',
        ok: true,
        quality: 96,
      }),
      entry({ mission: 'écris un poème sur la mer', task: 'writing' }),
      entry({
        mission: 'provisions IFRS9 stage 2 fichier excel',
        ok: false,
        toolErrors: ['data.query: colonne introuvable'],
      }),
    ];
    const a = findSimilar(log, 'calculer les provisions IFRS9 depuis un fichier Excel', { taskType: 'data' });
    expect(a.seen).toBe(true);
    expect(a.matches.length).toBeGreaterThanOrEqual(2);
    expect(a.successes).toBe(1);
    expect(a.failures).toBe(1);
    expect(a.advice.join(' ')).toContain('a fonctionné');
    const none = findSimilar(log, 'composer une symphonie quantique');
    expect(none.seen).toBe(false);
    expect(none.summary).toContain('rien n’est supposé');
  });
});

describe('failure replay', () => {
  const failing = (i: number) =>
    entry({
      ok: false,
      model: 'm/weak',
      task: 'data',
      mission: `analyse excel ventes agence ${i} anomalies`,
      tools: ['data.query'],
      toolErrors: ['data.query: colonne introuvable'],
      toolCalls: 3,
    });
  it('builds a signature with the stage, the cause and the decision trail', () => {
    const e = failing(1);
    e.checkpoints = [
      { name: 'JEV_EXECUTION', ms: 0, tokens: 0, cost: 0, decision: 'RETRY_TARGETED: échec de data.query' },
    ];
    const s = signatureOf(e)!;
    expect(s.cause).toBe('tool');
    expect(s.stage).toContain('outils');
    expect(s.dominantTool).toBe('data.query');
    expect(s.decisionTrail[0]).toContain('RETRY_TARGETED');
    expect(signatureOf(entry({ ok: true, quality: 95 }))).toBeNull();
  });
  it('derives corrective strategies that grow with repetition, and a single failure never blames a model', () => {
    const one = failureLibrary([
      entry({
        ok: false,
        model: 'm/x',
        vector: {
          correctness: 0.3,
          completeness: 1,
          instruction_following: 1,
          style: 1,
          safety: 1,
          tool_accuracy: 1,
          code_quality: 1,
          factuality: 1,
          efficiency: 1,
          consistency: 1,
        },
      }),
    ]);
    expect(one.strategies[0]!.confidence).toBeLessThan(0.3);
    const lib = failureLibrary(many(4, failing));
    expect(lib.signatures).toHaveLength(1);
    const s = lib.strategies[0]!;
    expect(s.occurrences).toBe(4);
    expect(s.confidence).toBeCloseTo(4 / 7, 2);
    expect(s.actions.map((a) => a.kind)).toContain('require_verification');
    const model = failureLibrary(
      many(3, (i) => entry({ ok: false, model: 'm/flaky', retries: 1, mission: `x${i}` })),
    );
    expect(model.strategies[0]!.actions.some((a) => a.kind === 'avoid_model' && a.value === 'm/flaky')).toBe(
      true,
    );
  });
  it('the next similar mission exploits the strategy; an unrelated one does not', () => {
    const lib = failureLibrary(many(4, failing));
    const hit = strategiesFor(lib.strategies, {
      taskType: 'data',
      text: 'analyse excel ventes agence 9 anomalies',
    });
    expect(hit.requireVerification).toBe(true);
    expect(hit.promptHints.join(' ')).toContain('data.query');
    expect(hit.dropTools).toContain('data.query');
    expect(
      strategiesFor(lib.strategies, { taskType: 'writing', text: 'analyse excel ventes agence 9 anomalies' })
        .matched,
    ).toHaveLength(0);
    expect(
      strategiesFor(lib.strategies, { taskType: 'data', text: 'météo de Dakar demain' }).matched,
    ).toHaveLength(0);
  });
});

describe('configurations and intelligence graph', () => {
  it('compares cognitive configurations on measured quality / cost / success', () => {
    const log = [
      ...many(5, () =>
        entry({ model: 'm/a', skills: ['S1'], tools: ['data.query'], ok: true, quality: 95, cost: 0.002 }),
      ),
      ...many(5, (i) =>
        entry({ model: 'm/b', tools: ['data.query', 'code.run'], ok: i < 2, quality: 70, cost: 0.02 }),
      ),
    ];
    const st = configStats(log);
    expect(st).toHaveLength(2);
    const best = bestConfigs(st, 'data', 3);
    expect(best[0]!.configKey).toContain('m/a');
    expect(best[0]!.successRate).toBe(1);
    expect(reusableStrategies(st).map((s) => s.configKey)).toEqual([best[0]!.configKey]);
  });
  it('relates task, model, skill, tool, result and error with measured weights', () => {
    const g = intelligenceGraph([
      entry({ skills: ['IFRS9-v2'], ok: true, cost: 0.002 }),
      entry({ ok: false, toolErrors: ['data.query: x'] }),
    ]);
    const rel = (to: string) => g.edges.find((e) => e.from === 'task:data' && e.to === to);
    expect(rel('model:m/a')!.runs).toBe(2);
    expect(rel('skill:IFRS9-v2')!.successRate).toBe(1);
    expect(rel('result:échec')).toBeDefined();
    expect(rel('error:tool')).toBeDefined();
  });
});

describe('MASSAMBA_MODEL_EXPERTISE_MATRIX', () => {
  it('maps runs to dimensions and leaves unmeasured cells empty', () => {
    expect(
      dimsOf(entry({ mission: 'provisions IFRS9 du portefeuille au Sénégal, fichier excel', task: 'data' })),
    ).toEqual(expect.arrayContaining(['DATA_ANALYSIS', 'EXCEL', 'IFRS9', 'FINANCE', 'SENEGAL']));
    expect(dimsOf(entry({ mission: 'write a function', task: 'code' }))).toContain('CODING');
    const m = MASSAMBA_MODEL_EXPERTISE_MATRIX([
      entry({ model: 'm/a', task: 'code', mission: 'écris une fonction' }),
    ]);
    expect(m['m/a']!.CODING!.n).toBe(1);
    expect(m['m/a']!.IFRS9).toBeUndefined();
    expect(Object.keys(MASSAMBA_MODEL_EXPERTISE_MATRIX([]))).toHaveLength(0);
    expect(DIMENSIONS).toHaveLength(20);
  });
  it('ranks per dimension on measured data only, with a minimum sample', () => {
    const log = [
      ...many(4, () =>
        entry({
          model: 'm/a',
          task: 'code',
          mission: 'écris une fonction',
          ok: true,
          quality: 90,
          cost: 0.01,
        }),
      ),
      ...many(4, (i) =>
        entry({
          model: 'm/b',
          task: 'code',
          mission: 'écris une fonction',
          ok: i < 2,
          quality: 60,
          cost: 0.001,
        }),
      ),
      ...many(2, () => entry({ model: 'm/c', task: 'code', mission: 'écris une fonction', ok: true })),
    ];
    const r = rankByDimension(MASSAMBA_MODEL_EXPERTISE_MATRIX(log), 'CODING', 3);
    expect(r.map((x) => x.model)).toEqual(['m/a', 'm/b']);
    expect(r[0]!.cell.confidence).toBeCloseTo(4 / 14, 2);
  });
  it('preferredModels: within 5 points of the best success, the cheapest first', () => {
    const log = [
      ...many(6, () => entry({ model: 'm/a', cost: 0.01 })),
      ...many(6, () => entry({ model: 'm/b', cost: 0.001 })),
      ...many(6, (i) => entry({ model: 'm/c', ok: i < 2, cost: 0.0001 })),
    ];
    expect(preferredModels(log, 'data').map((x) => x.model)).toEqual(['m/b', 'm/a', 'm/c']);
  });
});

describe('policy store', () => {
  const log = [
    ...many(8, () => entry({ model: 'm/strong', task: 'data', ok: true, cost: 0.01 })),
    ...many(8, (i) => entry({ model: 'm/weak', task: 'data', ok: i < 3, cost: 0.002 })),
    ...many(12, (i) =>
      entry({
        task: 'research',
        capabilities: ['web.search', 'browser.open'],
        tools: i < 1 ? ['web.search', 'browser.open'] : ['web.search'],
        model: 'm/s',
      }),
    ),
  ];
  it('learns model preference, useless tools — with evidence, sample size and confidence', () => {
    const ps = learnPolicies({ log, now: 1 });
    const mp = ps.find((p) => p.kind === 'model_preference' && p.params.taskType === 'data')!;
    expect(mp.params.prefer).toBe('m/strong');
    expect(mp.evidence.successPreferred).toBe(1);
    expect(mp.sampleSize).toBe(16);
    expect(mp.confidence).toBeCloseTo(8 / 18, 2);
    const tu = ps.find((p) => p.kind === 'tool_useless')!;
    expect(tu.params.tool).toBe('browser.open');
    expect(tu.policy).toContain('inutile');
    expect(ps.every((p) => p.status === 'proposed')).toBe(true);
  });
  it('learns nothing without enough samples', () => {
    expect(learnPolicies({ log: many(3, () => entry()), now: 1 })).toEqual([]);
  });
  it('active policies change routing; rollback restores; re-learning keeps decisions and marks stale', () => {
    const ps = learnPolicies({ log, now: 1 });
    const mp = ps.find((p) => p.kind === 'model_preference')!;
    expect(applyPolicies(ps, { taskType: 'data' }).prefer).toEqual([]); // proposed ≠ active
    const act = ps.map((p) => (p.id === mp.id ? activate(p) : p));
    expect(applyPolicies(act, { taskType: 'data' })).toMatchObject({
      prefer: ['m/strong'],
      avoid: ['m/weak'],
    });
    const rb = act.map((p) => (p.id === mp.id ? rollbackPolicy(p, 'régression observée', 9) : p));
    expect(applyPolicies(rb, { taskType: 'data' }).prefer).toEqual([]);
    expect(rb.find((p) => p.id === mp.id)!.rollback).toMatchObject({
      previous: 'active',
      reason: 'régression observée',
    });
    const merged = mergePolicies(
      act,
      learnPolicies({ log: log.filter((e) => e.task !== 'data'), now: 2 }),
      2,
    );
    expect(merged.find((p) => p.id === mp.id)!.status).toBe('stale');
    const again = mergePolicies(act, ps, 3);
    expect(again.find((p) => p.id === mp.id)!.status).toBe('active');
  });
  it('model weakness: good overall, weak in one dimension', () => {
    const l = [
      ...many(14, () =>
        entry({ model: 'm/fast', task: 'writing', mission: 'écris un mail', ok: true, latency: 2000 }),
      ),
      ...many(6, (i) =>
        entry({
          model: 'm/fast',
          task: 'data',
          mission: 'analyse ce fichier excel',
          ok: i < 2,
          latency: 2000,
        }),
      ),
    ];
    const w = learnPolicies({ log: l, now: 1 }).find(
      (p) => p.kind === 'model_weakness' && p.scope === 'EXCEL',
    );
    expect(w).toBeDefined();
    expect(w!.policy).toContain('rapide');
  });
});

describe('exploration vs exploitation, bounded', () => {
  const base = {
    candidates: [
      { model: 'best', cost: 0.01 },
      { model: 'alt', cost: 0.012 },
      { model: 'dear', cost: 0.5 },
    ],
    epsilon: 0.1,
    critical: false,
    importance: 0.2,
    budgetLeft: null,
    estCost: 0.01,
  };
  it('never explores on critical / important missions or with a tight budget', () => {
    expect(chooseWithExploration({ ...base, critical: true, rand: () => 0 }).explored).toBe(false);
    expect(chooseWithExploration({ ...base, importance: 0.8, rand: () => 0 }).explored).toBe(false);
    expect(chooseWithExploration({ ...base, budgetLeft: 0.015, rand: () => 0 }).explored).toBe(false);
  });
  it('explores about ε of the time, never toward a much dearer model', () => {
    let n = 0;
    let seed = 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2000; i++) {
      const c = chooseWithExploration({ ...base, rand });
      if (c.explored) {
        n++;
        expect(c.model).toBe('alt');
      }
    }
    expect(n / 2000).toBeGreaterThan(0.05);
    expect(n / 2000).toBeLessThan(0.12);
  });
});

describe('economic governor', () => {
  const g = (mode: 'eco' | 'balanced' | 'performance' | 'max', gain: number, cost: number) =>
    economicGovernor({
      action: 'consulter 3 modèles',
      mode,
      expectedQualityGain: gain,
      gainSource: 'PROJECTED',
      expectedCost: cost,
      risk: 0.3,
      valuePerPoint: 0.002,
    });
  it('says plainly when more models are not worth it, and MAX is not « use everything »', () => {
    const skip = g('balanced', 0.5, 0.05);
    expect(skip.use).toBe(false);
    expect(skip.reason).toContain('ne vaut pas économiquement la peine');
    expect(g('balanced', 10, 0.01).use).toBe(true);
    expect(g('max', 0.5, 0.5).use).toBe(false);
    expect(GOVERNOR_RATIO.eco).toBeGreaterThan(GOVERNOR_RATIO.performance);
    expect(g('eco', 3, 0.02).use).toBe(false);
    expect(g('max', 3, 0.02).use).toBe(true);
  });
  it('labels the source of the gain and respects a latency cap', () => {
    expect(g('balanced', 10, 0.01).reason).toContain('projeté');
    expect(
      economicGovernor({
        action: 'x',
        mode: 'max',
        expectedQualityGain: 50,
        gainSource: 'MEASURED',
        expectedCost: 0.001,
        extraLatencyMs: 9000,
        maxExtraLatencyMs: 3000,
        risk: 0,
        valuePerPoint: 0.01,
      }).use,
    ).toBe(false);
  });
});

describe('JEV health score', () => {
  it('uses only what is measurable; empty log gives no score', () => {
    const h0 = jevHealth({ log: [], skills: [], policies: [], failureSignatures: 0 });
    expect(h0.overall).toBeNull();
    expect(h0.parts.every((p) => p.score === null)).toBe(true);
    const log = many(12, (i) =>
      entry({ ok: i !== 3, retries: i === 5 ? 1 : 0, tools: ['data.query'], toolCalls: 2 }),
    );
    const h = jevHealth({
      log,
      skills: [{ status: 'validated' }, { status: 'failed' }, { status: 'candidate' }],
      policies: [],
      failureSignatures: 1,
    });
    expect(h.parts.find((p) => p.key === 'routing')!.score).toBe(Math.round((10 / 12) * 100));
    expect(h.parts.find((p) => p.key === 'skill')!.score).toBe(50);
    expect(h.parts.find((p) => p.key === 'learning')!.score).toBeNull();
    expect(h.overall).not.toBeNull();
    expect(h.formula).toContain('jamais remplacée');
  });
});

describe('security', () => {
  it('classifies data and never reads an unknown provider policy as safe', () => {
    expect(classifyData('quelle est la capitale du Sénégal ?').level).toBe('PUBLIC');
    expect(classifyData('résume ce fichier', ['ventes.xlsx']).level).toBe('INTERNAL');
    expect(classifyData('ces données clients sont confidentielles').level).toBe('CONFIDENTIAL');
    expect(classifyData('provisions IFRS9 du portefeuille', ['pdo.xlsx']).level).toBe('CONFIDENTIAL');
    expect(classifyData('compte SN08SN0100152000048500003035').level).toBe('HIGHLY_CONFIDENTIAL');
    expect(classifyData('ma clé est sk-or-v1-abcdefabcdef1234').level).toBe('HIGHLY_CONFIDENTIAL');
    const u = unknownPolicy('Acme');
    expect(checkProvider('PUBLIC', u).action).toBe('allow');
    expect(checkProvider('CONFIDENTIAL', u).action).toBe('warn');
    expect(checkProvider('HIGHLY_CONFIDENTIAL', u).action).toBe('block');
    expect(
      checkProvider('HIGHLY_CONFIDENTIAL', {
        provider: 'P',
        retention: 'none',
        training: 'no',
        source: 'user',
      }).action,
    ).toBe('allow');
    expect(
      checkProvider('CONFIDENTIAL', { provider: 'P', retention: 'long', training: 'yes', source: 'user' })
        .action,
    ).toBe('block');
    expect(checkProvider('CONFIDENTIAL', u, { free: true }).reason).toContain('gratuit');
  });
  it('scrubs secrets', () => {
    expect(containsSecret('Authorization: Bearer abcdefghijklmnop1234567890')).toBe(true);
    expect(scrubSecrets('clé sk-or-v1-abcdef1234567890 et password=hunter22')).not.toMatch(
      /abcdef1234567890|hunter22/,
    );
    expect(scrubSecrets('-----BEGIN PRIVATE KEY-----\nAAA\n-----END PRIVATE KEY-----')).toContain(
      'supprimée',
    );
  });
});

describe('cognitive cache L0–L6', () => {
  it('has TTL, versions, provenance, confidence and invalidation', () => {
    let t = 0;
    const c = new CognitiveCache('v1', () => t);
    expect(Object.keys(CACHE_LEVELS)).toHaveLength(7);
    c.set('L2', 'k', 'route', { provenance: 'jev-0', confidence: 0.9, ttlMs: 1000 });
    expect(c.get('L2', 'k')!.provenance).toBe('jev-0');
    t = 2000;
    expect(c.get('L2', 'k')).toBeNull();
    c.set('L3', 'a', 1, { provenance: 'x' });
    c.set('L4', 'a', 1, { provenance: 'x' });
    expect(c.invalidate('L3')).toBe(1);
    c.setVersion('v2');
    expect(c.get('L4', 'a')).toBeNull();
    const m1 = c.memo('L1', 'q', () => 'type', { provenance: 'p', confidence: 0.4, minConfidence: 0.7 });
    const m2 = c.memo('L1', 'q', () => 'type2', { provenance: 'p', confidence: 0.4, minConfidence: 0.7 });
    expect(m1.hit).toBe(false);
    expect(m2.hit).toBe(false);
    expect(c.report().find((r) => r.level === 'L1')!.misses).toBeGreaterThan(0);
  });
});
