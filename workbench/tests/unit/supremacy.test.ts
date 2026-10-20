import { describe, expect, it } from 'vitest';
import { entry, many } from '../helpers/logEntry';
import type { FreeModel } from '../../server/jev/fabric/council';
import {
  DEFAULT_APPRENTICE,
  DEFAULT_VALIDATION,
  type ApprenticeSettings,
  type ApprenticeTag,
} from '../../server/jev/apprentice/types';
import { taskDnaOf } from '../../server/jev/apprentice/dna';
import {
  familyRecord,
  validateRecord,
  rankApprentices,
  getValidatedApprentice,
  champions,
  premiumOverride,
  finalRule,
  supremacyScore,
  supremacyWeights,
  sampleLabelOf,
  apprenticeMatrix,
  distinctFormulations,
} from '../../server/jev/apprentice/supremacy';
import { routeApprentice, dedupeAttempts, LEVELS } from '../../server/jev/apprentice/ladder';
import { FallbackController } from '../../server/jev/apprentice/router';
import {
  CORRECTIONS,
  correctionFor,
  correctionMessage,
  failureSignatureOf,
  learningOf,
  failureStats,
} from '../../server/jev/apprentice/failure';
import {
  apprenticePayback,
  futureReuseValue,
  learningPayback,
  teacherROI,
} from '../../server/jev/apprentice/payback';
import { skillFromFailure } from '../../server/jev/apprentice/teacher';
import { CapsuleCache } from '../../server/jev/apprentice/cache';
import { compileCached, type Capsule } from '../../server/jev/apprentice/capsule';
import { decideVersion, newProfileVersion } from '../../server/jev/apprentice/versions';
import { runSupremacyDemo, SIMULATED_LABEL } from '../../server/jev/apprentice/demo';
import { buildApprenticeRegistry } from '../../server/jev/apprentice/registry';

const NOW = Date.UTC(2026, 9, 5);
const DAY = 86_400_000;
const on: ApprenticeSettings = { ...DEFAULT_APPRENTICE, enabled: true };
const FAM = 'data:ifrs9';
const pool: FreeModel[] = [
  {
    id: 'g/gemma:free',
    name: 'Gemma',
    provider: 'g',
    contextLength: 128000,
    tools: true,
    vision: false,
    structuredOutputs: true,
    reasoning: true,
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
];
const tag = (o: Partial<ApprenticeTag> = {}): ApprenticeTag => ({
  active: true,
  adapted: true,
  family: FAM,
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
const TEXTS = [
  'Calcule la provision ECL IFRS9 du portefeuille corporate',
  'Analyse la migration Stage 1 vers Stage 2 des expositions',
  'Quel est le taux de couverture IFRS9 par segment',
  'Réconcilie les provisions IFRS9 avec le grand livre',
  'Prépare le tableau des expositions Stage 3 et perte attendue',
];
const runs = (
  model: string,
  n: number,
  o: { ok?: (i: number) => boolean; q?: number; start?: number; family?: string; cost?: number } = {},
) =>
  many(n, (i) =>
    entry({
      model,
      ok: o.ok ? o.ok(i) : true,
      quality: o.q ?? 95,
      cost: o.cost ?? 0,
      at: NOW - (o.start ?? 20) * DAY + i * 1000,
      instruction: TEXTS[i % TEXTS.length],
      mission: TEXTS[i % TEXTS.length],
      apprentice: tag({ family: o.family ?? FAM, path: [model] }),
    }),
  );
const dna = (o: Partial<Parameters<typeof taskDnaOf>[0]> = {}) => ({
  ...taskDnaOf(
    { text: TEXTS[0]!, taskType: 'data', difficulty: 0.3, criticality: 'normal', tools: ['tools'], ...o },
    on,
  ),
  task_family: FAM,
  domain: 'ifrs9',
});
const route = (log: ReturnType<typeof runs>, o: Partial<Parameters<typeof routeApprentice>[0]> = {}) =>
  routeApprentice({ dna: dna(), settings: on, profiles: [], pool, log, now: NOW, ...o });
const premium = (n = 5, q = 97, cost = 0.08) =>
  many(n, (i) =>
    entry({
      model: 'premium/astra',
      ok: true,
      quality: q,
      cost,
      at: NOW - 30 * DAY + i,
      instruction: TEXTS[i % 5],
      apprentice: tag({ family: FAM, path: ['premium/astra'], adapted: false }),
    }),
  );

describe('Supremacy — validation (TEST G, E, F)', () => {
  it('TEST G insufficient sample can NEVER become VALIDATED, even with perfect results', () => {
    const rec = familyRecord(runs('g/gemma:free', 4), 'g/gemma:free', FAM, DEFAULT_VALIDATION, NOW);
    const v = validateRecord(rec);
    expect(v.status).not.toBe('VALIDATED');
    expect(v.insufficient).toBe(true);
    expect(v.reasons[0]).toBe('INSUFFICIENT SAMPLE');
    expect(sampleLabelOf(4)).toBe('INSUFFICIENT');
    expect(sampleLabelOf(5)).toBe('INDICATIVE');
    expect(sampleLabelOf(20)).toBe('ROBUST');
    expect(sampleLabelOf(50)).toBe('HIGH CONFIDENCE');
  });
  it('one success is not a validation; 3 formulations are required', () => {
    const same = many(12, (i) =>
      entry({
        model: 'g/gemma:free',
        quality: 95,
        at: NOW - i * 1000,
        instruction: TEXTS[0],
        mission: TEXTS[0],
        apprentice: tag(),
      }),
    );
    const rec = familyRecord(same, 'g/gemma:free', FAM, DEFAULT_VALIDATION, NOW);
    expect(rec.formulations).toBe(1);
    expect(validateRecord(rec).status).not.toBe('VALIDATED');
    expect(distinctFormulations(TEXTS)).toBe(5);
  });
  it('TEST F a new apprentice becomes VALIDATED then CHAMPION once the criteria are met', () => {
    const log = runs('g/gemma:free', 12);
    const rec = familyRecord(log, 'g/gemma:free', FAM, DEFAULT_VALIDATION, NOW);
    const v = validateRecord(rec);
    expect(v.status).toBe('VALIDATED');
    expect(v.checks.every((c) => c.ok)).toBe(true);
    const ch = champions(log, pool, { settings: on, now: NOW });
    expect(ch[0]!.model).toBe('g/gemma:free');
    expect(ch[0]!.supremacy).toBe(true);
    expect(ch[0]!.family).toBe(FAM);
  });
  it('HIGH / CRITICAL families need stricter success and quality', () => {
    const rec = familyRecord(
      runs('g/gemma:free', 12, { q: 92 }),
      'g/gemma:free',
      FAM,
      DEFAULT_VALIDATION,
      NOW,
    );
    expect(validateRecord(rec, 'normal').status).toBe('VALIDATED');
    expect(validateRecord(rec, 'high').status).not.toBe('VALIDATED'); // quality 92 < 93
    expect(validateRecord(rec, 'critical').status).not.toBe('VALIDATED');
  });
  it('a critical error (secret leak) blocks validation', () => {
    const log = runs('g/gemma:free', 12);
    log[3] = { ...log[3]!, failureNote: 'secret exposé dans la réponse' };
    expect(validateRecord(familyRecord(log, 'g/gemma:free', FAM, DEFAULT_VALIDATION, NOW)).status).not.toBe(
      'VALIDATED',
    );
  });
  it('TEST E a degraded apprentice loses its Champion status and its priority', () => {
    const good = runs('g/gemma:free', 14, { start: 20 });
    const bad = many(5, (i) =>
      entry({
        model: 'g/gemma:free',
        ok: false,
        quality: 50,
        at: NOW - 100 + i,
        instruction: TEXTS[i],
        apprentice: tag({ accepted: false }),
      }),
    );
    const log = [...good, ...bad];
    const v = validateRecord(familyRecord(log, 'g/gemma:free', FAM, DEFAULT_VALIDATION, NOW));
    expect(v.status).toBe('DEGRADED');
    expect(champions(log, pool, { settings: on, now: NOW }).some((c) => c.supremacy)).toBe(false);
    const p = route(log);
    expect(p.route).not.toBe('validated');
    expect(p.level).toBeGreaterThan(1);
  });
  it('a ROLLED-BACK profile version disqualifies the validated status (TEST H)', () => {
    const log = runs('g/gemma:free', 12);
    const ok = rankApprentices({ dna: dna(), settings: on, log, pool, now: NOW });
    expect(ok[0]!.status).toBe('VALIDATED');
    const rb = rankApprentices({
      dna: dna(),
      settings: on,
      log,
      pool,
      now: NOW,
      rolledBack: new Set([`g/gemma:free|${FAM}`]),
    });
    expect(rb[0]!.status).toBe('SPECIALIST');
    const v1 = {
      ...newProfileVersion([], 'g/gemma:free', FAM, [], 700),
      benchmark: { n: 8, success: 0.95, quality: 94, at: 1 },
    };
    const v2 = {
      ...newProfileVersion([{ ...v1, status: 'production' as const }], 'g/gemma:free', FAM, [], 700),
      benchmark: { n: 8, success: 0.8, quality: 80, at: 2 },
    };
    expect(decideVersion({ ...v1, status: 'production' }, v2).action).toBe('rollback');
  });
});

describe('Supremacy — routing hierarchy (TEST A, B, C, D, P, Q)', () => {
  it('TEST A a VALIDATED apprentice wins over an unvalidated free model', () => {
    const log = [...runs('g/gemma:free', 12), ...runs('n/nemo:free', 4)];
    const p = route(log);
    expect(p.route).toBe('validated');
    expect(p.level).toBe(1);
    expect(p.chosen!.id).toBe('g/gemma:free');
    expect(p.champion!.status).toBe('VALIDATED');
  });
  it('TEST B a VALIDATED apprentice wins over the premium model when the quality threshold is met (premium is only the last rung)', () => {
    const log = [...runs('g/gemma:free', 12), ...premium()];
    const p = route(log);
    expect(p.use).toBe(true);
    expect(p.attempts[0]!.kind).toBe('champion');
    expect(p.attempts.at(-1)!.kind).toBe('v5');
    expect(p.attempts.filter((a) => a.kind === 'v5')).toHaveLength(1);
    const text = p.explain.join('\n');
    expect(text).toContain('FREE APPRENTICE SELECTED');
    expect(text).toMatch(/measured quality vs 97\.0% premium reference/);
    expect(text).not.toMatch(/équivalent|equivalent to/i);
    expect(p.final!.use).toBe(true);
  });
  it('TEST C a critical task bypasses the apprentice when its confidence / thresholds are insufficient', () => {
    const log = runs('g/gemma:free', 12, { q: 92 });
    const p = route(log, { dna: dna({ criticality: 'critical' }) });
    expect(p.use).toBe(false);
    expect(p.route).toBe('v5');
    expect(p.explain[0]).toMatch(/CRITIQUE|premium override/);
    const strong = runs('g/gemma:free', 60, { q: 99 });
    expect(route(strong, { dna: dna({ criticality: 'critical' }) }).route).toBe('validated');
  });
  it('TEST D security blocks a free apprentice for CONFIDENTIAL data without a declared provider policy', () => {
    const log = runs('g/gemma:free', 12);
    expect(route(log, { classification: 'CONFIDENTIAL' }).use).toBe(false);
    const hc = route(log, { classification: 'HIGHLY_CONFIDENTIAL' });
    expect(hc.use).toBe(false);
    expect(hc.route).toBe('v5');
    const allowed = route(log, {
      classification: 'HIGHLY_CONFIDENTIAL',
      policyOf: () => ({ provider: 'g', retention: 'none', training: 'no', source: 'user' }),
    });
    expect(allowed.route).toBe('validated');
  });
  it('capability gaps and freshness requirements force V5', () => {
    const log = runs('g/gemma:free', 12);
    expect(
      route(log, { dna: dna({ text: 'Donne les dernières nouvelles du cours de la bourse' }) }).bypass,
    ).toBe('freshness');
    expect(route(log, { hasImages: true }).use).toBe(false);
  });
  it('TEST P V5 fallback remains intact: the ladder always ends with V5, and nothing is removed from the 8 levels', () => {
    const log = [...runs('g/gemma:free', 12), ...runs('n/nemo:free', 12)];
    const p = route(log);
    expect(p.attempts.at(-1)!.kind).toBe('v5');
    expect(LEVELS.map((l) => l.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
  it('TEST Q disabled = exact V5 behaviour (no free route, no capsule, no ladder)', () => {
    const p = route(runs('g/gemma:free', 12), { settings: { ...on, enabled: false } });
    expect(p.use).toBe(false);
    expect(p.bypass).toBe('disabled');
    expect(p.route).toBe('v5');
    expect(p.attempts).toEqual([]);
  });
  it('no evidence → free + micro-adaptation (level 3) or V5; never a champion', () => {
    const p = route([]);
    expect(p.champion).toBeNull();
    expect([3, 5]).toContain(p.level);
  });
  it('a free specialist (not validated) is level 2', () => {
    const p = route(runs('g/gemma:free', 7));
    expect(p.route).toBe('specialist');
    expect(p.level).toBe(2);
  });
});

describe('Supremacy — score, final rule, matrix', () => {
  it('weights default to the specified formula and boost quality/success/reliability/confidence for high risk', () => {
    const w = supremacyWeights(
      {
        task: 0.25,
        quality: 0.2,
        success: 0.15,
        confidence: 0.1,
        reliability: 0.1,
        tool: 0.05,
        structured: 0.05,
        latency: 0.05,
        economic: 0.05,
      },
      'normal',
    );
    expect(w.task).toBeCloseTo(0.25, 6);
    const h = supremacyWeights(DEFAULT_APPRENTICE.supremacy, 'critical');
    expect(h.quality).toBeGreaterThan(w.quality);
    expect(h.latency).toBeLessThan(w.latency);
    const f = {
      task: 1,
      quality: 1,
      success: 1,
      confidence: 1,
      reliability: 1,
      tool: 1,
      structured: 1,
      latency: 1,
      economic: 1,
    };
    expect(supremacyScore(f)).toBeCloseTo(1, 6);
    expect(supremacyScore(f, DEFAULT_APPRENTICE.supremacy, 'normal', 'DEGRADED')).toBeLessThan(
      supremacyScore(f),
    );
  });
  it('final rule fails on any gate and premiumOverride lists why', () => {
    const [c] = rankApprentices({ dna: dna(), settings: on, log: runs('g/gemma:free', 12), pool, now: NOW });
    expect(finalRule({ dna: dna(), settings: on }, c!).use).toBe(true);
    expect(finalRule({ dna: dna(), settings: on }, null).use).toBe(false);
    expect(premiumOverride({ dna: dna({ criticality: 'critical' }), settings: on }, c!).bypass).toBe(true);
  });
  it('expertise matrix: quality, success, n, confidence, status per model × domain', () => {
    const m = apprenticeMatrix(
      [...runs('g/gemma:free', 12), ...runs('n/nemo:free', 3)],
      pool,
      DEFAULT_VALIDATION,
      NOW,
    );
    expect(m.domains).toContain('ifrs9');
    const cell = m.cells['g/gemma:free']!['ifrs9']!;
    expect(cell).toMatchObject({ n: 12, status: 'VALIDATED' });
    expect(m.cells['n/nemo:free']!['ifrs9']!.status).not.toBe('VALIDATED');
  });
  it('getValidatedApprentice reports overridden candidates with their reasons (security)', () => {
    const r = getValidatedApprentice({
      dna: dna(),
      settings: on,
      log: runs('g/gemma:free', 12),
      pool,
      classification: 'CONFIDENTIAL',
      now: NOW,
    });
    expect(r.champion).toBeNull();
    expect(r.overridden[0]!.reasons.join(' ')).toMatch(/politique de sécurité/);
    expect(r.hard.length).toBeGreaterThan(0);
  });
});

describe('Supremacy — intelligent fallback & failure learning (TEST I, J, K)', () => {
  it('TEST I a failed apprentice triggers a NAMED targeted correction (no blind retry)', () => {
    const sig = failureSignatureOf([
      { kind: 'format', what: 'JSON demandé mais invalide', dimension: 'instruction_following' },
    ]);
    expect(sig).toBe('STRUCTURED_OUTPUT_INVALID');
    expect(correctionFor(sig).name).toBe('FORMAT_REPAIR_V2');
    expect(correctionMessage(sig, [{ what: 'JSON demandé mais invalide' }], 60, 0.9)).toContain(
      'FORMAT_REPAIR_V2',
    );
    const log = [...runs('g/gemma:free', 12), ...runs('n/nemo:free', 12)];
    const fc = new FallbackController(route(log));
    expect(fc.next('CORRECT', 0.6).kind).toBe('free_correction');
  });
  it('TEST J repeated failure goes to the ALTERNATIVE apprentice, never the same attempt three times, then V5', () => {
    const log = [...runs('g/gemma:free', 12), ...runs('n/nemo:free', 12)];
    const p = route(log);
    const kinds = p.attempts.map((a) => `${a.kind}:${a.model}`);
    expect(new Set(kinds).size).toBe(kinds.length);
    const fc = new FallbackController(p);
    const seq = [fc.current!];
    for (let i = 0; i < 5 && !fc.escalatedToV5; i++) seq.push(fc.next('CORRECT', 0.5));
    expect(seq.map((a) => a.kind)).toEqual(['champion', 'free_correction', 'secondary', 'v5']);
    expect(seq[2]!.model).toBe('n/nemo:free');
    expect(seq[0]!.model).toBe('g/gemma:free');
    expect(
      dedupeAttempts([
        { kind: 'champion', model: 'a', label: '', level: 1 },
        { kind: 'champion', model: 'a', label: '', level: 1 },
      ]),
    ).toHaveLength(1);
  });
  it('signatures cover structured output, table reconciliation, tool selection, numeric reasoning, context overflow', () => {
    const f = (kind: string, what: string) => [{ kind, what, dimension: 'correctness' }] as never;
    expect(failureSignatureOf(f('missing', 'tableau demandé mais absent'))).toBe(
      'MISSING_TABLE_RECONCILIATION',
    );
    expect(failureSignatureOf(f('tool', '2/5 appels d’outils en erreur'))).toBe('TOOL_SELECTION_ERROR');
    expect(failureSignatureOf(f('factual', 'chiffre(s) sans preuve : 12'))).toBe('NUMERIC_REASONING_ERROR');
    expect(failureSignatureOf([], 'maximum context length exceeded')).toBe('CONTEXT_OVERFLOW');
    expect(Object.keys(CORRECTIONS).length).toBeGreaterThanOrEqual(8);
  });
  it('a failure is recorded with model, family, correction, fallback, teacher and outcome', () => {
    const fl = learningOf({
      signature: 'STRUCTURED_OUTPUT_INVALID',
      path: ['g/gemma:free', 'premium/astra'],
      success: true,
      teacher: 'premium/astra',
    });
    expect(fl).toMatchObject({
      retryModel: 'g/gemma:free',
      fallbackModel: 'premium/astra',
      teacher: 'premium/astra',
      outcome: 'escalated',
      correction: 'FORMAT_REPAIR_V2',
    });
    const e = entry({ model: 'g/gemma:free', apprentice: tag({ failure: fl }) });
    expect(failureStats([e])[0]).toMatchObject({
      signature: 'STRUCTURED_OUTPUT_INVALID',
      family: FAM,
      escalated: 1,
    });
  });
  it('TEST K a premium success after an apprentice failure creates a reusable SKILL CANDIDATE (never validated)', () => {
    const teacherRun = entry({
      model: 'premium/astra',
      ok: true,
      quality: 96,
      tools: ['data.query', 'code.run'],
      at: NOW,
      instruction: 'Réconcilie les provisions IFRS9 avec le grand livre',
      apprentice: tag({
        path: ['g/gemma:free', 'premium/astra'],
        teacher: 'premium/astra',
        teacherCost: 0.08,
      }),
    });
    const r = skillFromFailure([teacherRun], [], teacherRun, NOW);
    expect(r.candidates.length).toBeGreaterThan(0);
    const sk = r.candidates[0]!;
    expect(sk.status).toBe('candidate');
    expect(sk.activeVersion).toBeNull();
    expect(sk.versions[0]!.provenance.teacher).toBe('premium/astra');
  });
});

describe('Supremacy — Teacher ROI & payback (TEST L, M, O)', () => {
  it('TEST L Teacher ROI is measured from real family frequency × measured premium cost, else N/A', () => {
    const log = [...runs('g/gemma:free', 12, { start: 10 }), ...premium()];
    const fut = futureReuseValue(log, FAM, 30, NOW);
    expect(fut.value).not.toBeNull();
    expect(fut.value!).toBeGreaterThan(0);
    const roi = teacherROI({
      family: FAM,
      immediateGain: 0.001,
      teacherCost: 0.08,
      futureReuseValue: fut.value,
    });
    expect(roi.teach).toBe(true);
    expect(roi.roi).toBeGreaterThan(1);
    expect(
      teacherROI({ family: FAM, immediateGain: 0.001, teacherCost: 0.08, futureReuseValue: 0 }).teach,
    ).toBe(false);
    const none = futureReuseValue([], FAM, 30, NOW);
    expect(none.value).toBeNull();
    const na = teacherROI({ family: FAM, immediateGain: 0.0001, teacherCost: 0.08, futureReuseValue: null });
    expect(na.roi).toBeNull();
    expect(na.basis).toBe('N/A');
  });
  it('TEST M apprentice payback: investment vs premium calls avoided, estimated from the MEASURED premium cost', () => {
    const served = runs('g/gemma:free', 10, { start: 5 });
    const taught = entry({
      model: 'premium/astra',
      ok: true,
      quality: 96,
      cost: 0.08,
      at: NOW - 20 * DAY,
      apprentice: tag({
        path: ['g/gemma:free', 'premium/astra'],
        teacher: 'premium/astra',
        teacherCost: 0.08,
        accepted: false,
      }),
    });
    const log = [...served, taught, ...premium(5, 97, 0.08)];
    const p = apprenticePayback(log, FAM, 'g/gemma:free');
    expect(p.premiumCallsAvoided).toBe(10);
    expect(p.teacherInvestment).toBeCloseTo(0.08, 6);
    expect(p.avoidedCost).toBeCloseTo(0.8, 6);
    expect(p.netBenefit).toBeCloseTo(0.72, 6);
    expect(p.roi).toBeCloseTo(10, 5);
    expect(learningPayback(log).total.premiumCallsAvoided).toBeGreaterThanOrEqual(10);
  });
  it('TEST O no fabricated metrics: no data → null / N/A / no champion', () => {
    expect(apprenticePayback([], FAM).avoidedCost).toBeNull();
    expect(apprenticePayback(runs('g/gemma:free', 5), FAM).netBenefit).toBeNull(); // no premium reference
    expect(champions([], pool, { settings: on })).toEqual([]);
    expect(buildApprenticeRegistry([], pool)[0]!.successRate).toBeNull();
    expect(validateRecord(familyRecord([], 'x', FAM, DEFAULT_VALIDATION, NOW)).status).toBe('FREE');
    expect(champions(runs('g/gemma:free', 12), pool, { settings: on, now: NOW })[0]!.premium).toBeNull();
    expect(champions(runs('g/gemma:free', 12), pool, { settings: on, now: NOW })[0]!.premiumDelta).toBeNull();
  });
});

describe('Supremacy — capsule cache (TEST N)', () => {
  it('TEST N a cached capsule is reused: CACHE MISS then CACHE HIT, with measured timings', () => {
    const cache = new CapsuleCache<Capsule>();
    const input = {
      log: runs('g/gemma:free', 6),
      skills: [],
      strategies: [],
      dna: dna(),
      text: TEXTS[0]!,
      tools: ['data.query'],
      use: { skills: true, experience: true },
      budgetTokens: 700,
    };
    const a = compileCached(input, { cache, model: 'g/gemma:free', profileVersion: 'gemma-ifrs9-v1' });
    expect(a.cacheHit).toBe(false);
    const b = compileCached(input, { cache, model: 'g/gemma:free', profileVersion: 'gemma-ifrs9-v1' });
    expect(b.cacheHit).toBe(true);
    expect(b.text).toBe(a.text);
    expect(b.compilationMs).toBe(0);
    expect(cache.stats()).toMatchObject({ hits: 1, misses: 1, hitRate: 0.5 });
    expect(a.retrievalMs).toBeGreaterThanOrEqual(0);
    expect(a.contextAfter).toBeLessThanOrEqual(a.contextBefore);
    // another model or profile version = another key
    expect(compileCached(input, { cache, model: 'n/nemo:free', profileVersion: 'x' }).cacheHit).toBe(false);
    // a fresh-data task is never cached
    const fresh = { ...input, dna: { ...dna(), freshness_requirement: true } };
    compileCached(fresh, { cache, model: 'g/gemma:free', profileVersion: 'v1' });
    expect(compileCached(fresh, { cache, model: 'g/gemma:free', profileVersion: 'v1' }).cacheHit).toBe(false);
  });
});

describe('Supremacy — demonstration (labelled SIMULATED TEST ONLY)', () => {
  const steps = runSupremacyDemo(NOW);
  it('runs the 14-step cycle and every step is labelled as a simulation', () => {
    expect(steps.length).toBeGreaterThanOrEqual(13);
    expect(steps.every((s) => s.lines[0] === SIMULATED_LABEL)).toBe(true);
  });
  it('FREE → ADAPTED → SPECIALIST → VALIDATED → CHAMPION → selected before premium → DEGRADED → revalidated', () => {
    const st = steps.map((s) => s.status);
    expect(st[0]).toBe('FREE');
    expect(st).toContain('ADAPTED');
    expect(st).toContain('SPECIALIST');
    expect(st).toContain('VALIDATED');
    expect(st).toContain('DEGRADED');
    expect(st.at(-1)).toBe('VALIDATED');
    const sel = steps.find((s) => s.title.startsWith('9-10'))!;
    expect(sel.lines.join('\n')).toContain('Route = VALIDATED, niveau 1');
    expect(steps.find((s) => s.title.startsWith('11'))!.lines.join('\n')).toMatch(/premium n'est pas appelé/);
    expect(steps.find((s) => s.title.startsWith('13'))!.lines.join('\n')).toMatch(/Teacher ROI/);
  });
});
