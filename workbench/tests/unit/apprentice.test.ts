import { describe, expect, it } from 'vitest';
import { entry, many } from '../helpers/logEntry';
import type { FreeModel } from '../../server/jev/fabric/council';
import type { ApprenticeTag } from '../../server/jev/apprentice/types';
import { DEFAULT_APPRENTICE, type ApprenticeSettings } from '../../server/jev/apprentice/types';
import { freeEligibility, taskDnaOf } from '../../server/jev/apprentice/dna';
import {
  buildApprenticeRegistry,
  detectDegradation,
  freeOutcome,
} from '../../server/jev/apprentice/registry';
import {
  FallbackController,
  apprenticeAnswerScore,
  apprenticeScore,
  ladderFor,
  qualityGate,
  routeFreeFirst,
} from '../../server/jev/apprentice/router';
import { compileCapsule, compressionVerdict } from '../../server/jev/apprentice/capsule';
import {
  selectTeacher,
  skillStage,
  skillTransfers,
  teacherAllowance,
  teacherGate,
  teacherValue,
} from '../../server/jev/apprentice/teacher';
import { applyDecision, decideVersion, newProfileVersion } from '../../server/jev/apprentice/versions';
import {
  analyzeApprentice,
  perDollar,
  referenceStatement,
  trueTotalCost,
} from '../../server/jev/apprentice/metrics';
import { containsSecret } from '../../server/jev/fabric/security';
import type { FabricSkill } from '../../server/jev/fabric/skills';

const on: ApprenticeSettings = { ...DEFAULT_APPRENTICE, enabled: true };
const pool: FreeModel[] = [
  {
    id: 'g/gemma:free',
    name: 'Gemma',
    provider: 'g',
    contextLength: 128000,
    tools: true,
    vision: false,
    structuredOutputs: true,
    reasoning: false,
  },
  {
    id: 'n/nemo:free',
    name: 'Nemo',
    provider: 'n',
    contextLength: 128000,
    tools: true,
    vision: false,
    structuredOutputs: true,
    reasoning: true,
  },
  {
    id: 'x/notools:free',
    name: 'NoTools',
    provider: 'x',
    contextLength: 32000,
    tools: false,
    vision: false,
    structuredOutputs: false,
    reasoning: false,
  },
];
const tag = (o: Partial<ApprenticeTag> = {}): ApprenticeTag => ({
  active: true,
  adapted: true,
  family: 'data:excel',
  path: ['g/gemma:free'],
  threshold: 0.9,
  gateScore: 0.95,
  accepted: true,
  adaptationMs: 5,
  tokensAdded: 300,
  skills: [],
  experiences: 0,
  toolsExposed: 5,
  contextReduction: null,
  predictedSuccess: 0.9,
  confidence: 'HIGH',
  why: [],
  ...o,
});
const dna = (o: Partial<Parameters<typeof taskDnaOf>[0]> = {}) =>
  taskDnaOf(
    {
      text: 'analyse le fichier ventes.xlsx et calcule le total par mois',
      taskType: 'data',
      difficulty: 0.3,
      criticality: 'normal',
      ...o,
    },
    on,
  );
const goodGemma = () =>
  many(10, (i) =>
    entry({ model: 'g/gemma:free', ok: true, quality: 92, cost: 0, at: 100 + i, apprentice: tag() }),
  );

describe('Apprentice — Task DNA & eligibility', () => {
  it('TEST 01 free-first: a compatible free model is chosen first, V5 stays the fallback', () => {
    const plan = routeFreeFirst({
      dna: dna(),
      settings: on,
      profiles: buildApprenticeRegistry(goodGemma(), pool),
      pool,
    });
    expect(plan.use).toBe(true);
    expect(plan.chosen?.id).toBe('g/gemma:free');
    expect(plan.attempts.at(-1)!.kind).toBe('v5');
  });
  it('quality gates by risk: 0.85 / 0.90 / 0.93 / 0.97', () => {
    expect(dna({ difficulty: 0.1 }).quality_threshold).toBe(0.85);
    expect(dna({ difficulty: 0.4 }).quality_threshold).toBe(0.9);
    expect(dna({ difficulty: 0.8 }).quality_threshold).toBe(0.93);
    expect(dna({ criticality: 'critical' }).quality_threshold).toBe(0.97);
  });
  it('a model without tools is not eligible for a tool task; a $0 price is not enough', () => {
    const e = freeEligibility(dna({ tools: ['data.query'] }), pool[2]!);
    expect(e.eligible).toBe(false);
    expect(e.blockedBy).toBe('capability');
  });
  it('TEST 16 confidentiality: HIGHLY_CONFIDENTIAL data never goes to a free provider with unknown policy', () => {
    const e = freeEligibility(dna(), pool[0]!, { classification: 'HIGHLY_CONFIDENTIAL' });
    expect(e.eligible).toBe(false);
    expect(e.blockedBy).toBe('security');
    const plan = routeFreeFirst({
      dna: dna(),
      settings: on,
      profiles: [],
      pool,
      classification: 'HIGHLY_CONFIDENTIAL',
    });
    expect(plan.use).toBe(false);
    expect(plan.bypass).toBe('security');
  });
  it('declared no-training/no-retention policy re-opens the free route', () => {
    const e = freeEligibility(dna(), pool[0]!, {
      classification: 'HIGHLY_CONFIDENTIAL',
      policy: { provider: 'g', retention: 'none', training: 'no', source: 'user' },
    });
    expect(e.eligible).toBe(true);
  });
});

describe('Apprentice — registry, selection, degradation', () => {
  it('TEST 02 a JEV-adapted free model is selected over a plain one (tier 1 > tier 3)', () => {
    const log = [...goodGemma()];
    const plan = routeFreeFirst({
      dna: dna(),
      settings: on,
      profiles: buildApprenticeRegistry(log, pool),
      pool,
    });
    expect(plan.chosen!.id).toBe('g/gemma:free');
    expect(plan.chosen!.tier).toBe(1);
    expect(plan.candidates.find((c) => c.id === 'n/nemo:free')!.tier).toBe(3);
  });
  it('TEST 20 no fabricated metrics: unseen model → N/A, PROJECTED prior, INSUFFICIENT SAMPLE', () => {
    const reg = buildApprenticeRegistry([], pool);
    const g = reg.find((p) => p.model === 'g/gemma:free')!;
    expect(g.successRate).toBeNull();
    expect(g.quality).toBeNull();
    expect(g.sampleLabel).toBe('INSUFFICIENT SAMPLE');
    expect(g.health.score).toBeNull();
    const plan = routeFreeFirst({ dna: dna(), settings: on, profiles: reg, pool });
    expect(plan.chosen!.predictedBasis).toBe('PROJECTED');
    expect(plan.confidence).toBe('LOW');
    expect(plan.attempts.map((a) => a.kind)).toEqual(['free_jev', 'v5']);
  });
  it('JEV status: FREE → ADAPTED → SPECIALIST from real runs', () => {
    const plain = many(6, () => entry({ model: 'g/gemma:free', apprentice: tag({ adapted: false }) }));
    expect(buildApprenticeRegistry(plain, pool).find((p) => p.model === 'g/gemma:free')!.jevStatus).toBe(
      'FREE',
    );
    expect(
      buildApprenticeRegistry([entry({ model: 'g/gemma:free', apprentice: tag() })], pool).find(
        (p) => p.model === 'g/gemma:free',
      )!.jevStatus,
    ).toBe('ADAPTED');
    expect(
      buildApprenticeRegistry(goodGemma(), pool).find((p) => p.model === 'g/gemma:free')!.jevStatus,
    ).toBe('SPECIALIST');
  });
  it('TEST 15 critical task bypasses the free model without HIGH confidence', () => {
    const c = dna({ criticality: 'critical' });
    const weak = routeFreeFirst({
      dna: c,
      settings: on,
      profiles: buildApprenticeRegistry(
        many(3, () => entry({ model: 'g/gemma:free', apprentice: tag() })),
        pool,
      ),
      pool,
    });
    expect(weak.use).toBe(false);
    expect(weak.bypass).toBe('critical');
    const strong = routeFreeFirst({
      dna: c,
      settings: on,
      profiles: buildApprenticeRegistry(
        many(20, (i) => entry({ model: 'g/gemma:free', at: i, apprentice: tag() })),
        pool,
      ),
      pool,
    });
    expect(strong.use).toBe(true);
  });
  it('high risk without evidence is routed by V5 (expected failure risk above tolerance)', () => {
    const plan = routeFreeFirst({
      dna: dna({ criticality: 'high', difficulty: 0.8 }),
      settings: on,
      profiles: [],
      pool,
    });
    expect(plan.use).toBe(false);
    expect(plan.bypass).toBe('risk');
  });
  it('TEST 19 V5 fallback integrity: disabled → routing untouched', () => {
    const plan = routeFreeFirst({
      dna: dna(),
      settings: { ...on, enabled: false },
      profiles: buildApprenticeRegistry(goodGemma(), pool),
      pool,
    });
    expect(plan.use).toBe(false);
    expect(plan.bypass).toBe('disabled');
    expect(plan.attempts).toEqual([]);
  });
  it('TEST 17 rate-limit degradation lowers the rank', () => {
    const good = many(8, (i) => entry({ model: 'g/gemma:free', at: i, apprentice: tag() }));
    const limited = many(4, (i) =>
      entry({
        model: 'g/gemma:free',
        at: 100 + i,
        ok: false,
        failureNote: 'HTTP 429 rate limit',
        apprentice: tag({ accepted: false }),
      }),
    );
    const d = detectDegradation([...good, ...limited]);
    expect(d.degraded).toBe(true);
    expect(d.reasons.join(' ')).toMatch(/limites de débit|réussite/);
    const before = routeFreeFirst({
      dna: dna(),
      settings: on,
      profiles: buildApprenticeRegistry(good, pool),
      pool,
    }).candidates.find((c) => c.id === 'g/gemma:free')!;
    const after = routeFreeFirst({
      dna: dna(),
      settings: on,
      profiles: buildApprenticeRegistry([...good, ...limited], pool),
      pool,
    }).candidates.find((c) => c.id === 'g/gemma:free')!;
    expect(after.score).toBeLessThan(before.score);
  });
  it('TEST 18 model degradation (quality / latency) is detected and a stable model is not flagged', () => {
    const hist = many(8, (i) => entry({ model: 'g/gemma:free', at: i, quality: 92, latency: 2000 }));
    const bad = many(4, (i) => entry({ model: 'g/gemma:free', at: 100 + i, quality: 60, latency: 9000 }));
    expect(detectDegradation([...hist, ...bad]).degraded).toBe(true);
    expect(detectDegradation(hist).degraded).toBe(false);
  });
  it('ApprenticeScore uses the specified weights and is configurable; critical boosts quality/success/reliability', () => {
    const f = {
      success: 1,
      quality: 1,
      expertise: 1,
      tool: 1,
      structured: 1,
      reliability: 1,
      latency: 1,
      cost: 1,
    };
    expect(apprenticeScore(f, DEFAULT_APPRENTICE.weights)).toBeCloseTo(1, 6);
    const weakQuality = { ...f, quality: 0 };
    expect(apprenticeScore(weakQuality, DEFAULT_APPRENTICE.weights, 'critical')).toBeLessThan(
      apprenticeScore(weakQuality, DEFAULT_APPRENTICE.weights, 'normal'),
    );
    expect(DEFAULT_APPRENTICE.weights.success).toBe(0.3);
  });
});

describe('Apprentice — capsule & micro-adaptation', () => {
  const skill = (): FabricSkill => ({
    id: 's1',
    name: 'excel-total-par-mois',
    domain: 'data',
    currentVersion: '1',
    activeVersion: '1',
    status: 'validated',
    groupKey: 'k',
    createdAt: 1,
    updatedAt: 1,
    versions: [
      {
        version: '1',
        name: 'excel-total-par-mois',
        domain: 'data',
        taskTypes: ['data'],
        triggerConditions: ['analyse', 'fichier', 'total', 'mois', 'ventes'],
        prerequisites: [],
        procedure: ['Lis le fichier', 'Groupe par mois', 'Somme'],
        promptTemplate: '',
        toolRequirements: ['data.query'],
        expectedOutput: 'tableau',
        evaluationCriteria: ['totaux exacts'],
        examples: [],
        counterExamples: [],
        provenance: { experiences: [], models: [], teacher: 'big/premium', note: '' },
        confidence: 0.8,
        successRate: 1,
        usageCount: 3,
        createdAt: 1,
        updatedAt: 1,
        reason: '',
        benchmark: { n: 6, deltaSuccess: 0.1, deltaQuality: 3, deltaCostPerSuccess: 0, at: 1, source: 't' },
        regressions: [],
        status: 'validated',
      },
    ],
  });
  const base = () => ({
    log: [
      ...goodGemma().map((e, i) => ({ ...e, instruction: `analyse le fichier ventes ${i} total par mois` })),
    ],
    skills: [skill()],
    strategies: [],
    dna: dna(),
    text: 'analyse le fichier ventes.xlsx et calcule le total par mois',
    tools: ['data.query'],
    use: { skills: true, experience: true },
    budgetTokens: 700,
  });
  it('TEST 03 skill capsule generation: DNA, contract, criteria, skill, tools — and nothing secret', () => {
    const c = compileCapsule({
      ...base(),
      text: `${base().text} clé sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789`,
    });
    expect(c.text).toContain('jev_capsule');
    expect(c.text).toContain('Contrat de sortie');
    expect(c.skills).toEqual(['excel-total-par-mois@1']);
    expect(c.sections.map((s) => s.key)).toEqual(
      expect.arrayContaining([
        'output_contract',
        'quality_criteria',
        'task_dna',
        'validated_skills',
        'tools',
      ]),
    );
    expect(containsSecret(c.text)).toBe(false);
  });
  it('TEST 04 micro-adaptation: measured time, tokens added, experiences used, tools exposed', () => {
    const c = compileCapsule(base());
    expect(c.adaptationMs).toBeGreaterThanOrEqual(0);
    expect(c.tokensAdded).toBeGreaterThan(0);
    expect(c.toolsExposed).toBe(1);
    expect(c.experiences).toBeGreaterThan(0);
  });
  it('ablation arms: JEV only has no skill / experience; compression keeps contract and criteria and reports the reduction', () => {
    const jev = compileCapsule({ ...base(), use: { skills: false, experience: false } });
    expect(jev.skills).toEqual([]);
    expect(jev.experiences).toBe(0);
    const tiny = compileCapsule({ ...base(), budgetTokens: 60 });
    expect(tiny.dropped.length).toBeGreaterThan(0);
    expect(tiny.contextReduction).toBeGreaterThan(0);
    expect(tiny.sections.map((s) => s.key)).toEqual(
      expect.arrayContaining(['output_contract', 'quality_criteria']),
    );
  });
  it('compression rolls back when it costs quality', () => {
    expect(compressionVerdict({ compressedQuality: 80, fullQuality: 90, n: 8 })).toBe('ROLLBACK');
    expect(compressionVerdict({ compressedQuality: 90, fullQuality: 90, n: 8 })).toBe('KEEP');
    expect(compressionVerdict({ compressedQuality: 90, fullQuality: 90, n: 2 })).toBe('INSUFFICIENT SAMPLE');
  });
});

describe('Apprentice — execution, gate, fallback', () => {
  it('TEST 05/06 quality gate: accept above threshold, correct below, unjudged is not invented', () => {
    expect(qualityGate(0.95, 0.9)).toBe('ACCEPT');
    expect(qualityGate(0.8, 0.9)).toBe('CORRECT');
    expect(qualityGate(null, 0.9)).toBe('UNJUDGED');
    expect(apprenticeAnswerScore(undefined).score).toBeNull();
    expect(apprenticeAnswerScore({ correctness: 1, completeness: 1 }).score).toBe(1);
  });
  it('TEST 07/08/09 FREE → FREE+correction → other FREE → V5, automatically', () => {
    const plan = routeFreeFirst({
      dna: dna(),
      settings: on,
      profiles: buildApprenticeRegistry(
        [
          ...goodGemma(),
          ...many(10, (i) =>
            entry({ model: 'n/nemo:free', at: i, apprentice: tag({ path: ['n/nemo:free'] }) }),
          ),
        ],
        pool,
      ),
      pool,
    });
    expect(plan.attempts.map((a) => a.kind)).toEqual(['free_jev', 'free_correction', 'free_other', 'v5']);
    const fc = new FallbackController(plan);
    expect(fc.current!.kind).toBe('free_jev');
    expect(fc.next('CORRECT', 0.7).kind).toBe('free_correction');
    expect(fc.next('CORRECT', 0.8).kind).toBe('free_other');
    expect(fc.next('CORRECT', 0.85).kind).toBe('v5');
    expect(fc.escalatedToV5).toBe(true);
    expect(ladderFor(plan, ['paid/a', 'paid/b'])[0]).toBe(plan.second!.id);
  });
  it('LOW confidence: one free attempt only, then V5 (no time wasted)', () => {
    const plan = routeFreeFirst({ dna: dna(), settings: on, profiles: [], pool });
    expect(plan.attempts.length).toBe(2);
    const fc = new FallbackController(plan);
    expect(fc.next('CORRECT', 0.5).kind).toBe('v5');
  });
  it('ACCEPT stops the chain', () => {
    const fc = new FallbackController(
      routeFreeFirst({
        dna: dna(),
        settings: on,
        profiles: buildApprenticeRegistry(goodGemma(), pool),
        pool,
      }),
    );
    expect(fc.next('ACCEPT', 0.95).kind).toBe('free_jev');
    expect(fc.escalatedToV5).toBe(false);
  });
});

describe('Apprentice — teacher, distillation, versions', () => {
  it('TEST 10 teacher is gated by the governor: EXECUTE when worth it, SKIP when not', () => {
    const t = { id: 'big/premium', reason: '', basis: 'PROJECTED' as const, estCost: 0.0005, quality: 95 };
    const worth = teacherGate({
      family: 'data:excel',
      teacher: t,
      apprenticeSuccess: 0.4,
      apprenticeQuality: 55,
      apprenticeN: 2,
      mode: 'balanced',
      valuePerPoint: 0.002,
      risk: 0.3,
    });
    expect(worth.execute).toBe(true);
    const no = teacherGate({
      family: 'data:excel',
      teacher: { ...t, estCost: 5 },
      apprenticeSuccess: 0.9,
      apprenticeQuality: 90,
      apprenticeN: 20,
      mode: 'eco',
      valuePerPoint: 0.002,
      risk: 0.1,
    });
    expect(no.execute).toBe(false);
    expect(no.reason).toMatch(/SKIP TEACHER/);
    expect(
      teacherGate({
        family: 'f',
        teacher: t,
        apprenticeSuccess: 0.4,
        apprenticeQuality: 55,
        apprenticeN: 2,
        mode: 'balanced',
        valuePerPoint: 0.002,
        risk: 0.3,
        allowed: false,
      }).execute,
    ).toBe(false);
  });
  it('teacher selection: best historical model on the family, else the router’s specialist', () => {
    const log = many(4, (i) =>
      entry({ model: 'big/premium', at: i, apprentice: tag({ family: 'data:excel' }), quality: 95 }),
    );
    expect(
      selectTeacher('data:excel', log, [
        { id: 'cheap/x', estCost: 0.01 },
        { id: 'big/premium', estCost: 0.05 },
      ])!.basis,
    ).toBe('MEASURED');
    expect(
      selectTeacher('data:excel', log, [
        { id: 'cheap/x', estCost: 0.01 },
        { id: 'spec/y', estCost: 0.02, specialist: true },
      ])!.id,
    ).toBe('spec/y');
    expect(
      selectTeacher(
        'other:family',
        [],
        [
          { id: 'cheap/x', estCost: 0.01 },
          { id: 'spec/y', estCost: 0.02, specialist: true },
        ],
      )!.id,
    ).toBe('spec/y');
  });
  it('TEST 11/12 distillation: teacher skills are transferred to a free apprentice and shown as such', () => {
    const sk = {
      id: 's1',
      name: 'excel-total',
      domain: 'd',
      currentVersion: '1',
      activeVersion: '1',
      status: 'validated',
      groupKey: 'k',
      createdAt: 1,
      updatedAt: 1,
      versions: [
        {
          version: '1',
          provenance: { experiences: [], models: [], teacher: 'big/premium', note: '' },
          benchmark: { n: 6, deltaSuccess: 0.1, deltaQuality: 2, deltaCostPerSuccess: 0, at: 1, source: 't' },
          status: 'validated',
        },
      ],
    } as unknown as FabricSkill;
    const log = many(3, (i) =>
      entry({
        model: 'g/gemma:free',
        at: i,
        ok: true,
        skills: ['excel-total'],
        apprentice: tag({ skills: ['excel-total'], teacher: 'big/premium' }),
      }),
    );
    const t = skillTransfers(log, [sk]);
    expect(t[0]!.message).toMatch(/transférée d’un Teacher/);
    expect(buildApprenticeRegistry(log, pool).find((p) => p.model === 'g/gemma:free')!.transferred).toEqual([
      'excel-total',
    ]);
  });
  it('TEST 13 skill stages: CANDIDATE → VALIDATED → PRODUCTION', () => {
    const mk = (
      active: string | null,
      bench: { n: number; deltaSuccess: number; deltaQuality: number } | null,
    ) =>
      ({
        id: 's',
        name: 's',
        domain: 'd',
        currentVersion: '1',
        activeVersion: active,
        status: active ? 'validated' : 'candidate',
        groupKey: '',
        createdAt: 1,
        updatedAt: 1,
        versions: [{ version: '1', benchmark: bench, provenance: { experiences: [], models: [], note: '' } }],
      }) as unknown as FabricSkill;
    expect(skillStage(mk(null, null))).toBe('CANDIDATE');
    expect(skillStage(mk('1', null))).toBe('VALIDATED');
    expect(skillStage(mk('1', { n: 6, deltaSuccess: 0.1, deltaQuality: 1 }))).toBe('PRODUCTION');
    expect(skillStage(mk('1', { n: 6, deltaSuccess: -0.2, deltaQuality: 1 }))).toBe('VALIDATED');
  });
  it('TEST 14 profile versions: promote, then ROLLBACK on regression', () => {
    const v1 = {
      ...newProfileVersion([], 'g/gemma:free', 'data:excel', ['s@1'], 700),
      benchmark: { n: 8, success: 0.9, quality: 90, at: 1 },
    };
    expect(decideVersion(null, v1).action).toBe('promote');
    const p1 = applyDecision(v1, decideVersion(null, v1));
    expect(p1.status).toBe('production');
    expect(p1.id).toBe('gemma-excel-v1');
    const v2 = {
      ...newProfileVersion([p1], 'g/gemma:free', 'data:excel', ['s@2'], 700),
      benchmark: { n: 8, success: 0.82, quality: 78, at: 2 },
    };
    const d = decideVersion(p1, v2);
    expect(d.action).toBe('rollback');
    expect(applyDecision(v2, d).status).toBe('rolled_back');
    expect(decideVersion(p1, { ...v2, benchmark: { n: 2, success: 1, quality: 99, at: 3 } }).action).toBe(
      'keep_candidate',
    );
  });
  it('teacher value: calls that bring nothing are made less often', () => {
    const calls = many(4, (i) =>
      entry({
        model: 'big/premium',
        at: 50 + i * 10,
        apprentice: tag({
          family: 'data:excel',
          teacher: 'big/premium',
          path: ['g/gemma:free', 'big/premium'],
        }),
      }),
    );
    const before = many(3, (i) => entry({ model: 'g/gemma:free', at: i, ok: i < 2, apprentice: tag() }));
    const after = many(3, (i) => entry({ model: 'g/gemma:free', at: 200 + i, ok: i < 2, apprentice: tag() }));
    const v = teacherValue([...before, ...calls, ...after]).find((x) => x.teacher === 'big/premium');
    expect(v!.value).toBeCloseTo(0, 6);
    expect(teacherAllowance(v).ratio).toBe(0.25);
    expect(teacherAllowance(undefined).allowed).toBe(true);
  });
});

describe('Apprentice — cost, benchmark, honesty', () => {
  it('true total cost includes model, teacher, JEV and retries; per-dollar never divides by zero', () => {
    const e = entry({ model: 'g/gemma:free', cost: 0, jevCost: 0.002, apprentice: tag({ teacherCost: 0 }) });
    expect(trueTotalCost(e).total).toBeCloseTo(0.002, 6);
    const free = perDollar([
      entry({ model: 'g/gemma:free', cost: 0, quality: 92 }),
      entry({ model: 'g/gemma:free', cost: 0, quality: 90 }),
    ]);
    expect(free.qualityPerDollar).toBeNull();
    expect(free.qualityAtZeroModelCost!.quality).toBeCloseTo(91, 6);
    const paid = perDollar([entry({ cost: 0.01, quality: 95 })]);
    expect(paid.qualityPerDollar).not.toBeNull();
  });
  const group = (g: number, arms: Record<string, { ok: boolean; q: number; cost: number }>) =>
    Object.entries(arms).map(([arm, r], k) => {
      const e = entry({
        model: arm === 'paid' ? 'big/premium' : 'g/gemma:free',
        ok: r.ok,
        quality: r.q,
        cost: r.cost,
        at: g * 10 + k,
        apprentice: tag({ arm: arm as never, family: 'data:excel' }),
        fabric: { kind: 'apprentice', arm, groupId: `g${g}`, taskKey: `t${g}`, category: 'data', models: [] },
      });
      e.experiment = {
        experimentId: 'E',
        groupId: `g${g}`,
        taskId: `t${g}`,
        category: 'data',
        protocol: 'fixed-model',
        variant: 'full',
        rep: 1,
        order: k,
        timestamp: 1,
        model: e.model,
        modelVersion: null,
        modelsUsed: [e.model],
        promptHash: 'p',
        taskType: 'data',
        difficulty: 0.3,
        risk: 'low',
        toolsAvailable: arm === 'free' ? 20 : 5,
        contextHash: 'c',
        temperature: null,
        maxTokens: 4000,
        jevMode: 'balanced',
      };
      return e;
    });
  it('TEST 20b benchmark: without data → insufficient sample, no statement of equivalence', () => {
    const r = analyzeApprentice([]);
    expect(r.groups).toBe(0);
    expect(referenceStatement(r)).toMatch(/INSUFFICIENT SAMPLE/);
  });
  it('benchmark with real paired groups: gains measured, tool difference is not a confounder, statement carries n / family / version', () => {
    const log = Array.from({ length: 6 }, (_, g) =>
      group(g, {
        free: { ok: g % 2 === 0, q: 60, cost: 0 },
        free_jev: { ok: true, q: 80, cost: 0.0002 },
        free_skill: { ok: true, q: 88, cost: 0.0002 },
        free_skill_exp: { ok: true, q: 92, cost: 0.0002 },
        paid: { ok: true, q: 96, cost: 0.02 },
      }),
    ).flat();
    const r = analyzeApprentice(log);
    expect(r.complete).toBe(6);
    expect(r.nonComparable).toEqual([]);
    const c = r.comparisons.find((x) => (x.from as string) === 'free' && (x.to as string) === 'free_jev')!;
    expect(c.qualityGain).toBeGreaterThan(0);
    expect(c.label).toBe('MEASURED');
    const st = referenceStatement(r);
    expect(st).toMatch(/95\.8 %/);
    expect(st).toMatch(/n = 6/);
    expect(st).toMatch(/apprentice-bench-1/);
    expect(st).not.toMatch(/=\s*GPT/);
  });
  it('failed demo: 3 paired groups only → INSUFFICIENT SAMPLE', () => {
    const log = Array.from({ length: 3 }, (_, g) =>
      group(g, {
        free: { ok: false, q: 40, cost: 0 },
        free_jev: { ok: true, q: 80, cost: 0 },
        free_skill: { ok: true, q: 80, cost: 0 },
        free_skill_exp: { ok: true, q: 90, cost: 0 },
        paid: { ok: true, q: 95, cost: 0.02 },
      }),
    ).flat();
    expect(referenceStatement(analyzeApprentice(log))).toMatch(/INSUFFICIENT SAMPLE/);
  });
});

describe('Apprentice — honest attribution', () => {
  it('a mission handed to another model counts as a FAILURE of the free model (its quality is not credited)', () => {
    const e = entry({
      model: 'g/gemma:free',
      ok: true,
      quality: 95,
      apprentice: tag({ path: ['g/gemma:free', 'big/premium'], accepted: false }),
    });
    const adj = freeOutcome(e);
    expect(adj.success).toBe(false);
    expect(adj.qualityMeasured).toBeNull();
    const reg = buildApprenticeRegistry(
      many(6, () =>
        entry({
          model: 'g/gemma:free',
          ok: true,
          quality: 95,
          apprentice: tag({ path: ['g/gemma:free', 'big/premium'], accepted: false }),
        }),
      ),
      pool,
    );
    expect(reg.find((p) => p.model === 'g/gemma:free')!.successRate).toBe(0);
    expect(reg.find((p) => p.model === 'g/gemma:free')!.quality).toBeNull();
  });
  it('benchmark arms are never rewritten', () => {
    const e = entry({
      model: 'g/gemma:free',
      ok: true,
      apprentice: tag({ arm: 'free_jev', path: ['g/gemma:free', 'x'] }),
    });
    expect(freeOutcome(e)).toBe(e);
  });
});
