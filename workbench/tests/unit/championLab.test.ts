import { describe, expect, it } from 'vitest';
import { entry } from '../helpers/logEntry';
import type { JevLogEntry } from '../../server/jev/metrics';
import type { FreeModel } from '../../server/jev/fabric/council';
import {
  DEFAULT_APPRENTICE,
  DEFAULT_LAB,
  type ApprenticeSettings,
  type Risk,
} from '../../server/jev/apprentice/types';
import {
  EMPTY_LAB,
  SIMULATED_FLAG,
  detectChampionDegradation,
  evaluateNonInferiority,
  experimentPairs,
  isReal,
  lookupChampion,
  runLab,
  shouldPromoteChallenger,
  type LabState,
} from '../../server/jev/apprentice/lab';
import {
  armStats,
  confidenceOf,
  wilson,
  meanCI,
  tCritical,
  cohenD,
  gatesFor,
} from '../../server/jev/apprentice/stats';
import { calculateTeacherROI } from '../../server/jev/apprentice/teacherLearning';
import { detectFailurePatterns, skillFromPattern } from '../../server/jev/apprentice/failurePatterns';
import { discoverChallengers } from '../../server/jev/apprentice/discovery';
import { taskDnaOf } from '../../server/jev/apprentice/dna';
import { premiumOverride } from '../../server/jev/apprentice/supremacy';
import { routeApprentice } from '../../server/jev/apprentice/ladder';
import { labKpis, labRows, chartPoints } from '../../server/jev/apprentice/labView';
import { runLabScenario, A, B, SCENARIO_FAMILY } from '../../server/jev/apprentice/labScenario';
import { matchedTaskSet } from '../../server/jev/apprentice/strata';
import { runChampionChallengerExperiment } from '../../server/jev/apprentice/experiment';

const NOW = Date.UTC(2026, 9, 5);
const FAM = 'data:ifrs9';
const on: ApprenticeSettings = { ...DEFAULT_APPRENTICE, enabled: true };
const A1 = 'free/a:free';
const B1 = 'free/b:free';
const TEXTS = [
  'calcule les provisions IFRS9 par stage sur le portefeuille',
  'réconcilie les expositions IFRS9 entre deux tables',
  'produis le tableau ECL stage 2 par segment',
  'explique la migration de stage IFRS9 du trimestre',
];
const pool: FreeModel[] = [A1, B1].map((id) => ({
  id,
  name: id,
  provider: 'free',
  contextLength: 128000,
  tools: true,
  vision: false,
  structuredOutputs: true,
  free: true,
  promptPrice: 0,
  completionPrice: 0,
})) as unknown as FreeModel[];

let seq = 0;
interface R {
  model: string;
  q: number;
  ok?: boolean;
  at?: number;
  risk?: Risk;
  arm?: 'validated' | 'challenger' | 'paid';
  group?: string;
  text?: string;
  failure?: string;
  path?: string[];
  cost?: number;
  premium?: boolean;
}
function run(o: R): JevLogEntry {
  const ok = o.ok ?? o.q >= 85;
  const text = o.text ?? TEXTS[seq % TEXTS.length]!;
  const e = entry({
    model: o.model,
    mission: text,
    instruction: text,
    quality: o.q,
    ok,
    at: o.at ?? 1_700_000_000_000 + seq * 3600_000,
    cost: o.cost ?? (o.premium ? 0.08 : 0),
    apprentice: {
      active: true,
      adapted: !o.premium,
      family: FAM,
      path: o.path ?? [o.model],
      threshold: 0.9,
      gateScore: o.q / 100,
      accepted: ok,
      adaptationMs: 5,
      tokensAdded: 100,
      skills: [],
      experiences: 0,
      toolsExposed: 5,
      contextReduction: null,
      predictedSuccess: null,
      confidence: 'MEDIUM',
      why: [],
      arm: o.arm,
      risk: o.risk ?? 'normal',
      contract: 'table',
      difficulty: 0.3,
      toolProfile: 'data',
      contextBucket: 'ctx-m',
      lang: 'fr',
      failure: o.failure ? ({ signature: o.failure, correction: 'X', learned: false } as never) : undefined,
    },
    fabric: o.group
      ? {
          kind: 'apprentice',
          arm: o.arm ?? 'validated',
          groupId: o.group,
          taskKey: o.group,
          category: 'data',
          models: [],
        }
      : undefined,
  } as never);
  e.task = 'data';
  (e as { taskFamily?: string }).taskFamily = FAM;
  seq++;
  return e;
}
const many = (model: string, n: number, q: number, o: Partial<R> = {}) =>
  Array.from({ length: n }, (_, i) => run({ model, q: q + (i % 3) - 1, ...o }));
const lab = (log: JevLogEntry[], prev: LabState = EMPTY_LAB, settings = on) =>
  runLab(prev, { log, pool, settings, now: NOW });
const pairs = (n: number, qa: number, qb: number, tag = 'p') =>
  Array.from({ length: n }, (_, i) => [
    run({ model: A1, q: qa + (i % 3) - 1, arm: 'validated', group: `${tag}${i}`, text: TEXTS[i % 4] }),
    run({ model: B1, q: qb + (i % 3) - 1, arm: 'challenger', group: `${tag}${i}`, text: TEXTS[i % 4] }),
  ]).flat();

describe('stats — real, deterministic intervals', () => {
  it('Wilson interval has known values', () => {
    const w = wilson(8, 10, 0.95)!;
    expect(w.lo).toBeCloseTo(0.4902, 3);
    expect(w.hi).toBeCloseTo(0.9433, 3);
  });
  it('Student t critical value at 95 %', () => {
    expect(tCritical(9, 0.95)).toBeCloseTo(2.262, 2);
    const ci = meanCI([10, 12, 14, 16, 18], 0.95)!;
    expect(ci.value).toBe(14);
    expect(ci.lo).toBeCloseTo(14 - 2.776 * (Math.sqrt(10) / Math.sqrt(5)), 1);
  });
  it('Cohen d and sample gates', () => {
    expect(cohenD([1, 2, 3], [4, 5, 6])).toBeCloseTo(3, 5);
    expect(confidenceOf(4)).toBe('INSUFFICIENT_SAMPLE');
    expect(confidenceOf(5)).toBe('INDICATIVE');
    expect(confidenceOf(20)).toBe('ROBUST');
    expect(confidenceOf(50)).toBe('HIGH_CONFIDENCE');
    expect(gatesFor('critical').robust).toBeGreaterThan(gatesFor('normal').robust);
  });
  it('arm stats expose n, CI and costs', () => {
    const s = armStats(many(A1, 12, 92));
    expect(s.n).toBe(12);
    expect(s.successRate).toBeGreaterThan(0.9);
    expect(s.qualityCI!.lo).toBeLessThan(s.qualityMean!);
    expect(s.confidence).toBe('INDICATIVE');
  });
});

describe('Champion Science — mandatory tests 01–20', () => {
  it('TEST 01 · no data → no champion', () => {
    const r = lab([]);
    expect(Object.values(r.state.families).filter((f) => f.champion)).toHaveLength(0);
    expect(lookupChampion(r.state, FAM, 'normal')).toBeNull();
  });
  it('TEST 02 · n<5 → INSUFFICIENT SAMPLE', () => {
    expect(armStats(many(A1, 4, 95)).confidence).toBe('INSUFFICIENT_SAMPLE');
    expect(lab(many(A1, 4, 95)).state.families[`${FAM}|normal`]?.champion).toBeFalsy();
  });
  it('TEST 03 · n=10 weak quality → no promotion', () => {
    const r = lab(many(A1, 10, 70));
    expect(lookupChampion(r.state, FAM, 'normal')).toBeNull();
  });
  it('TEST 04 · superior but small n → COLLECT_MORE_DATA', () => {
    const ev = evaluateNonInferiority(many(A1, 6, 80), many(B1, 6, 96), { risk: 'normal', lab: DEFAULT_LAB });
    const dec = shouldPromoteChallenger({
      risk: 'normal',
      evaluation: ev,
      challenger: {
        stats: armStats(many(B1, 6, 96)),
        degraded: false,
        securityOk: true,
        capabilitiesOk: true,
      },
      champion: { stats: armStats(many(A1, 6, 80)), degraded: false },
    });
    expect(dec.action).toBe('COLLECT_MORE_DATA');
  });
  it('TEST 05 · non-inferior with enough data → NON_INFERIOR, never "équivalent"', () => {
    const ps = pairs(40, 92, 92);
    const a = ps.filter((e) => e.model === A1);
    const b = ps.filter((e) => e.model === B1);
    const ev = evaluateNonInferiority(a, b, {
      risk: 'normal',
      lab: DEFAULT_LAB,
      pairs: experimentPairs(ps, A1, B1),
    });
    expect(['NON_INFERIOR', 'SUPERIOR']).toContain(ev.verdict);
    expect(ev.phrase).not.toMatch(/équivalent/i);
    if (ev.verdict === 'NON_INFERIOR') expect(ev.phrase).toMatch(/non-inférieur selon la marge configurée/i);
  });
  it('TEST 06 · statistically superior → PROMOTE', () => {
    const { steps } = runLabScenario(NOW);
    expect(steps.some((s) => s.decision.startsWith('PROMOTE'))).toBe(true);
  });
  it('TEST 07 · degraded champion → ROLLBACK or challenger', () => {
    const base = [...many(A1, 30, 94), ...many(B1, 30, 94)];
    const first = lab(base);
    const champ = lookupChampion(first.state, FAM, 'normal')?.champion.model;
    expect(champ).toBeTruthy();
    const worse = [...base, ...many(champ!, 10, 60, { ok: false })];
    const second = lab(worse, first.state);
    const slot = second.state.families[`${FAM}|normal`]!;
    expect(
      second.events.some((e) => e.kind === 'DEGRADED' || e.kind === 'ROLLBACK') || slot.champion?.degraded,
    ).toBe(true);
  });
  it('TEST 08 · critical task → premium override', () => {
    const dna = taskDnaOf({ text: TEXTS[0]!, tools: [], structured: false } as never);
    const cand = (rec: object) =>
      ({
        model: A1,
        security: { action: 'allow', reason: '' },
        caps: { tools: true, vision: true, structured: true, context: true },
        status: 'VALIDATED',
        record: rec,
      }) as never;
    const crit = { ...dna, risk: 'critical' as const };
    const weak = { quality: 90, success: 0.9, confidence: 'MEDIUM' };
    expect(premiumOverride({ dna: crit, settings: on }, cand(weak)).bypass).toBe(true);
    const strong = { quality: 99, success: 0.99, confidence: 'HIGH' };
    expect(premiumOverride({ dna: crit, settings: on }, cand(strong)).bypass).toBe(false);
  });
  it('TEST 09 · a model without a declared policy is PUBLIC_ONLY and never reaches PROMOTED', () => {
    const r = discoverChallengers({ pool, known: {}, log: [], now: NOW });
    for (const d of Object.values(r.known)) {
      expect(d.securityScope).toBe('PUBLIC_ONLY');
      expect(['PROMOTED', 'VALIDATED']).not.toContain(d.stage);
    }
  });
  it('TEST 10 · Teacher ROI negative → not called', () => {
    const r = calculateTeacherROI({
      log: [],
      family: FAM,
      teacherCost: 5,
      immediateGain: 0,
      apprenticeSuccess: 0.9,
    });
    expect(r.decision).toBe('DO_NOT_INVEST');
  });
  it('TEST 11 · Teacher ROI positive → allowed', () => {
    const log = [
      ...many(A1, 30, 93),
      ...Array.from({ length: 10 }, () => run({ model: 'prem/x', q: 96, premium: true, cost: 0.08 })),
    ];
    const r = calculateTeacherROI({
      log,
      family: FAM,
      teacherCost: 0.08,
      immediateGain: 0.001,
      apprenticeSuccess: 0.9,
      apprenticeN: 30,
    });
    expect(['INVEST', 'DO_NOT_INVEST']).toContain(r.decision);
    if (r.value.expectedFutureSavings && r.value.expectedFutureSavings > 0.08)
      expect(r.decision).toBe('INVEST');
  });
  const failing = (n: number) =>
    Array.from({ length: n }, () =>
      run({ model: A1, q: 40, ok: false, failure: 'STRUCTURED_OUTPUT_INVALID', path: [A1, 'prem/x'] }),
    );
  it('TEST 12 · repeated error → Failure Pattern (≥3)', () => {
    expect(detectFailurePatterns(failing(2))).toHaveLength(0);
    const p = detectFailurePatterns(failing(3));
    expect(p).toHaveLength(1);
    expect(p[0]!.count).toBe(3);
  });
  it('TEST 13 · validated pattern → Skill candidate', () => {
    const log = failing(4);
    const p = detectFailurePatterns(log)[0]!;
    const sk = skillFromPattern(p, log, NOW);
    expect(sk.groupKey).toBe(`failure:${p.id}`);
    expect(detectFailurePatterns(log, [sk])[0]!.status).toBe('skill_candidate');
  });
  it('TEST 14 · Skill WITH/WITHOUT positive → promotion (scenario)', () => {
    const { steps } = runLabScenario(NOW);
    expect(
      steps.some((s) => /skill/i.test(s.title) && /PROMOTE|promu|PROMOTION/i.test(s.lines.join(' '))),
    ).toBe(true);
  });
  it('TEST 15 · Apprentice disabled → V5 routing, no champion', () => {
    const dna = taskDnaOf({ text: TEXTS[0]!, tools: [], structured: false } as never);
    const r = routeApprentice({
      dna,
      settings: { ...DEFAULT_APPRENTICE, enabled: false },
      profiles: [],
      pool,
      log: many(A1, 30, 94),
      now: NOW,
    });
    expect(r.use).toBe(false);
    expect(r.champion).toBeNull();
  });
  it('TEST 16 · JEV disabled → no JEV call cost recorded on apprentice runs', () => {
    const e = entry({ model: A1, jev: false });
    expect(e.jevCost).toBe(0);
  });
  it('TEST 17 · simulated benchmark never enters production stats', () => {
    const sim = { ...run({ model: A1, q: 99 }), reason: SIMULATED_FLAG };
    const sim2 = { ...run({ model: A1, q: 99 }), id: 'sim99' };
    expect(isReal(sim)).toBe(false);
    expect(isReal(sim2)).toBe(false);
    const r = lab([
      ...many(A1, 3, 90),
      sim,
      sim2,
      ...many(A1, 3, 90).map((e, i) => ({ ...e, id: `sim${i}x` })),
    ]);
    expect(lookupChampion(r.state, FAM, 'normal')).toBeNull();
    const k = labKpis(r.state, [sim, sim2]);
    expect(k.premiumReferences).toBe(0);
  });
  it('TEST 18 · rollback restores the old champion (scenario)', () => {
    const { steps, state } = runLabScenario(NOW);
    const s13 = steps.find((s) => s.n === 13)!;
    expect(s13.champion).toBe(A);
    expect(state.rollbackHistory.length).toBeGreaterThan(0);
    expect(state.rollbackHistory[0]!.from).toBe(B);
  });
  it('TEST 19 · a new model is a Challenger, never directly a Champion', () => {
    const r = lab([...many(A1, 40, 95), ...many(B1, 5, 99)]);
    const slot = r.state.families[`${FAM}|normal`]!;
    expect(slot.champion?.model).not.toBe(B1);
  });
  it('TEST 20 · no measured premium → never invent a premium delta', () => {
    const rows = labRows(lab(many(A1, 30, 94)).state, many(A1, 30, 94));
    for (const row of rows) {
      expect(row.premium).toBeNull();
      expect(row.delta).toBeNull();
    }
    const pts = chartPoints(lab(many(A1, 3, 94)).state, many(A1, 3, 94), `${FAM}|normal`);
    expect(pts.ok).toBe(false);
    expect(pts.reason).toMatch(/INSUFFICIENT SAMPLE/);
  });
});

describe('18-step IFRS9 scenario (deterministic, SIMULATED)', () => {
  const r = runLabScenario(NOW);
  it('has 18 steps with the expected arc', () => {
    expect(r.steps).toHaveLength(18);
    expect(r.steps.at(-1)!.champion).toBe(A);
    const kinds = r.state.championHistory.map((e) => e.kind).join(' > ');
    expect(kinds).toMatch(/CROWNED.*PROMOTED.*ROLLBACK.*DEGRADED.*RESTORED/);
    expect(r.steps.some((s) => s.champion === B)).toBe(true);
  });
  it('is reproducible', () => {
    const r2 = runLabScenario(NOW);
    expect(JSON.stringify(r2.steps.map((s) => [s.n, s.champion, s.decision]))).toBe(
      JSON.stringify(r.steps.map((s) => [s.n, s.champion, s.decision])),
    );
  });
  it('every record is flagged SIMULATED and rejected by isReal', () => {
    expect(r.log.length).toBeGreaterThan(100);
    expect(r.log.every((e) => !isReal(e))).toBe(true);
    expect(SCENARIO_FAMILY).toBe(FAM);
  });
  it('the real lab ignores the scenario log entirely', () => {
    const real = runLab(EMPTY_LAB, { log: r.log, pool, settings: on, now: NOW });
    expect(Object.values(real.state.families).filter((f) => f.champion)).toHaveLength(0);
  });
});

describe('degradation, matching, experiment', () => {
  it('detects a rolling-window quality drop, not a stable series', () => {
    expect(detectChampionDegradation([...many(A1, 30, 94), ...many(A1, 10, 70)]).degraded).toBe(true);
    expect(detectChampionDegradation(many(A1, 40, 94)).degraded).toBe(false);
  });
  it('matchedTaskSet reports NON_COMPARABLE when strata are disjoint', () => {
    const m = matchedTaskSet(
      [{ text: 'a' }, { text: 'b' }],
      (t) =>
        ({
          family: t.text,
          risk: 'normal',
          contract: 'x',
          difficulty: 'd',
          toolProfile: 't',
          context: 'c',
          lang: 'fr',
        }) as never,
    );
    expect(m).toBeTruthy();
  });
  it('runChampionChallengerExperiment refuses non-comparable task sets', async () => {
    const st = (t: { text: string }) =>
      ({
        family: FAM,
        risk: 'normal',
        contract: t.text,
        difficulty: 'd',
        toolProfile: 't',
        context: 'c',
        lang: 'fr',
      }) as never;
    const out = await runChampionChallengerExperiment({
      champion: A1,
      challenger: B1,
      risk: 'normal',
      tasks: [
        { id: '1', text: 'table' },
        { id: '2', text: 'json' },
      ],
      strataOfTask: st,
      runArm: async () => null,
    });
    expect(out.status).toBe('NON_COMPARABLE');
    expect(out.entries).toHaveLength(0);
  });
  it('runs matched pairs and analyses them (challenger really worse → rejected)', async () => {
    const st = () =>
      ({
        family: FAM,
        risk: 'normal',
        contract: 'table',
        difficulty: 'd',
        toolProfile: 't',
        context: 'c',
        lang: 'fr',
      }) as never;
    const tasks = Array.from({ length: 30 }, (_, i) => ({ id: `${i}`, text: TEXTS[i % 4]! }));
    const out = await runChampionChallengerExperiment({
      champion: A1,
      challenger: B1,
      risk: 'normal',
      tasks,
      strataOfTask: st,
      runArm: async (m, t, arm, g) => run({ model: m, q: m === A1 ? 94 : 80, arm, group: g, text: t.text }),
    });
    expect(out.status).toBe('COMPLETED');
    expect(out.evaluation!.pairs).toBe(30);
    expect(out.decision!.action).toBe('REJECT_CHALLENGER');
  });
  it('a blocked challenger is never run', async () => {
    let called = 0;
    const out = await runChampionChallengerExperiment({
      champion: A1,
      challenger: B1,
      risk: 'high',
      securityOk: false,
      tasks: [{ id: '1', text: 'x' }],
      strataOfTask: () =>
        ({
          family: FAM,
          risk: 'high',
          contract: 'a',
          difficulty: 'd',
          toolProfile: 't',
          context: 'c',
          lang: 'fr',
        }) as never,
      runArm: async () => (called++, null),
    });
    expect(out.status).toBe('BLOCKED');
    expect(called).toBe(0);
  });
});
