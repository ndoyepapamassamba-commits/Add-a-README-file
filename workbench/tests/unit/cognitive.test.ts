import { describe, it, expect } from 'vitest';
import { cognitiveRegression, regressionSummary } from '../../server/jev/cognitive/regression';
import { cognitiveDiagnosis } from '../../server/jev/cognitive/diagnosis';
import {
  selectProtocol,
  synthesizeProtocol,
  protocolCeiling,
  PROTOCOLS,
} from '../../server/jev/cognitive/protocols';
import { analyzeTokens, planTokenBudget, compressionRatio } from '../../server/jev/cognitive/tokens';
import { compileCognitiveCapsule } from '../../server/jev/cognitive/capsule';
import {
  conditionModel,
  conditioningEfficiency,
  outputContract,
  behaviorFor,
  predictFailures,
  preemptiveGuards,
} from '../../server/jev/cognitive/conditioning';
import { compileCognitivePlan, encodeJcb, decodeJcb, chooseTier } from '../../server/jev/cognitive/bytecode';
import { shouldStop, cognitiveRoi, rankByRoi, jevScore } from '../../server/jev/cognitive/stop';
import { localizeDisagreement, adaptiveCouncil } from '../../server/jev/cognitive/disagreement';
import { fingerprints, failureProfile } from '../../server/jev/cognitive/fingerprint';
import { leverage, zeroWaste } from '../../server/jev/cognitive/leverage';
import { selfAudit } from '../../server/jev/cognitive/audit';
import {
  strategyLibrary,
  buildMicroExpert,
  evaluateTransfer,
  rehabilitation,
} from '../../server/jev/cognitive/strategies';
import {
  BASE_POLICY,
  INITIAL_POLICIES,
  evaluatePolicy,
  resolvePolicy,
  decide,
} from '../../server/jev/cognitive/policy';
import { CognitiveCache } from '../../server/jev/cognitive/cache';
import { CognitiveKernel } from '../../server/jev/cognitive/kernel';
import {
  superBenchTasks,
  analyzeSuperBench,
  SB_CATEGORIES,
  NOT_DETERMINISTIC,
} from '../../server/jev/cognitive/superbench';
import { DEFAULT_COGNITIVE } from '../../server/jev/cognitive/types';
import type { JevLogEntry } from '../../server/jev/metrics';

const entry = (o: Partial<JevLogEntry> & Record<string, unknown>): JevLogEntry =>
  ({
    id: 'x',
    at: 1,
    session: 's',
    mission: 'm',
    task: 'data',
    mode: 'balanced',
    jev: true,
    level: 1,
    decisionBy: 'JEV-0',
    model: 'm1',
    reason: '',
    tokensIn: 1000,
    tokensOut: 400,
    cost: 0.002,
    jevCost: 0,
    latencyMs: 2000,
    decisionMs: 1,
    calls: 2,
    quality: 80,
    success: true,
    retries: 0,
    escalations: 0,
    corrections: 0,
    cacheHits: 0,
    toolsOffered: 0,
    toolsBaseline: 0,
    toolTokens: 0,
    toolTokensBaseline: 0,
    contextBefore: 0,
    contextAfter: 0,
    checkpoints: [],
    ...o,
  }) as JevLogEntry;

describe('Cognitive regression report', () => {
  const rows = cognitiveRegression([]);
  it('every self-check passes, and without data the data checks say INSUFFICIENT DATA (never a default pass)', () => {
    expect(
      rows.filter((r) => r.kind === 'self-check' && r.status !== 'PASS').map((r) => `${r.id}: ${r.detail}`),
    ).toEqual([]);
    const data = rows.filter((r) => r.kind === 'data');
    expect(data.length).toBeGreaterThanOrEqual(5);
    expect(data.every((r) => r.status === 'INSUFFICIENT DATA')).toBe(true);
    expect(regressionSummary(rows).fail).toBe(0);
  });
});

describe('diagnosis and protocols', () => {
  it('trivial requests get no protocol, hard ones a proportional one', () => {
    const t = cognitiveDiagnosis({ text: 'Quelle est la capitale du Sénégal ?' });
    expect(t.trivial).toBe(true);
    expect(selectProtocol(t).protocol.tokens).toBe(0);
    const h = cognitiveDiagnosis({
      text: 'Calcule le total des provisions IFRS9 du fichier et vérifie les chiffres pour le COMEX',
      attachments: ['p.xlsx'],
      hasTools: true,
    });
    const c = selectProtocol(h);
    expect(c.protocol.tokens).toBeGreaterThan(0);
    expect(c.protocol.tokens).toBeLessThanOrEqual(protocolCeiling(h));
    expect(h.risk).toBe('high');
    expect(h.reasons.length).toBeGreaterThan(1);
  });
  it('a synthesized protocol is a CANDIDATE, built only from known atoms', () => {
    expect(synthesizeProtocol(['plan', 'verify'])?.status).toBe('candidate');
    expect(synthesizeProtocol(['nope'])).toBeNull();
    expect(Object.keys(PROTOCOLS)).toHaveLength(20);
  });
  it('code tasks require running the code', () => {
    const d = cognitiveDiagnosis({
      text: 'Corrige ce bug dans la fonction React et ajoute un test',
      hasTools: true,
    });
    expect(selectProtocol(d).protocol.text).toMatch(/exécute|teste/i);
  });
});

describe('token intelligence and semantic capsule', () => {
  it('detects repeated and obsolete context and reports a useful-token ratio', () => {
    const dup = 'Le comité a validé la méthode de calcul des provisions pour le portefeuille retail.';
    const r = analyzeTokens('provisions retail', [
      {
        id: 'h1',
        kind: 'history',
        text: 'Bonjour, voici un sujet complètement différent sur le football et les transferts de joueurs.',
        turn: 0,
      },
      { id: 'h2', kind: 'history', text: dup, turn: 8 },
      { id: 'h3', kind: 'history', text: dup, turn: 9 },
      { id: 'h4', kind: 'history', text: 'ok', turn: 10 },
      { id: 'h5', kind: 'history', text: 'merci', turn: 11 },
      { id: 'h6', kind: 'history', text: 'continue', turn: 12 },
      { id: 'h7', kind: 'history', text: 'oui', turn: 13 },
    ]);
    expect(r.repeated).toBeGreaterThan(0);
    expect(r.obsolete).toBeGreaterThan(0);
    expect(r.usefulTokenRatio).toBeLessThan(1);
    expect(compressionRatio(1000, 250).reduction).toBeCloseTo(0.75);
  });
  it('budget is a ceiling derived from the diagnosis; context stays minimal', () => {
    const d = cognitiveDiagnosis({ text: 'Analyse ce portefeuille et compare les segments', hasTools: true });
    const b = planTokenBudget(d, { contextTokens: 40000, modelContext: 32000 });
    expect(b.maxInput).toBeLessThan(40000);
    expect(b.maxInput).toBeLessThanOrEqual(32000);
    expect(b.rationale.length).toBeGreaterThan(1);
  });
  it('the capsule keeps critical items, recovers lost ones and never exceeds the raw size', () => {
    const noise = Array.from(
      { length: 60 },
      (_, i) => `Compte rendu ${i} : discussion générale sans décision sur l'organisation du planning.`,
    );
    const raw = [
      ...noise,
      'Décision : on utilise le fichier encours_2026.xlsx avec un plafond de 1 250 000 000 XOF.',
      'Il faut toujours arrondir à une décimale.',
      'Reste à vérifier : le taux de couverture ?',
    ].join('\n');
    const c = compileCognitiveCapsule({
      goal: 'quel plafond pour encours_2026.xlsx et quelle règle d’arrondi',
      raw,
      budgetTokens: 150,
    });
    expect(c.text).toContain('encours_2026.xlsx');
    expect(c.text).toMatch(/1 250 000 000/);
    expect(c.text).toMatch(/arrondir/);
    expect(c.capsuleTokens).toBeLessThan(c.rawTokens / 3);
    expect(c.complete).toBe(true);
    expect(c.sections.map((s) => s.key)).toContain('MISSION');
  });
});

describe('conditioning, guards, bytecode', () => {
  const hard = cognitiveDiagnosis({
    text: 'Calcule les totaux du fichier et réponds en JSON',
    attachments: ['a.xlsx'],
    hasTools: true,
  });
  it('guards are added only with evidence (or for high-impact failures), never blindly', () => {
    const preds = predictFailures(hard, { text: 'réponds en JSON' });
    expect(
      preemptiveGuards(preds, 'm', { m: { 'wrong-format': { n: 30, failed: 0 } } }).map((g) => g.mode),
    ).not.toContain('wrong-format');
    expect(
      preemptiveGuards(preds, 'm', { m: { 'wrong-format': { n: 30, failed: 12 } } }).map((g) => g.mode),
    ).toContain('wrong-format');
    expect(preemptiveGuards(preds, 'm', {}).map((g) => g.mode)).not.toContain('wrong-format');
  });
  it('conditioning respects its token ceiling by dropping low-priority sections', () => {
    const plan = compileCognitivePlan(hard, { text: 'x', contextTokens: 5000 });
    const full = conditionModel({
      behavior: plan.behavior,
      protocol: plan.protocol,
      contract: plan.contract,
      guards: [],
      skills: ['skill une très longue description '.repeat(10)],
      memory: ['mémoire '.repeat(40)],
      budget: plan.budget,
      maxTokens: 500,
    });
    const tight = conditionModel({
      behavior: plan.behavior,
      protocol: plan.protocol,
      contract: plan.contract,
      guards: [],
      skills: ['skill une très longue description '.repeat(10)],
      memory: ['mémoire '.repeat(40)],
      budget: plan.budget,
      maxTokens: 60,
    });
    expect(tight.tokens).toBeLessThan(full.tokens);
    expect(tight.sections.map((s) => s.key)).toContain('CONTRACT');
  });
  it('conditioning efficiency needs paired evidence', () => {
    expect(conditioningEfficiency([])).toBeNull();
    expect(
      conditioningEfficiency(
        Array.from({ length: 6 }, () => ({ qualityWith: 90, qualityWithout: 80, addedTokens: 100 })),
      ),
    ).toBeCloseTo(10);
  });
  it('behaviour follows the diagnosis; the output contract is minimal', () => {
    expect(behaviorFor(cognitiveDiagnosis({ text: 'bonjour' })).mode).toBe('FAST');
    expect(behaviorFor(hard).mode).toBeDefined();
    expect(outputContract(cognitiveDiagnosis({ text: 'bonjour' }), { maxOutput: 400 }).length).toMatch(
      /3 phrases/,
    );
  });
  it('JCB round-trips and tiering is cheapest-sufficient', () => {
    expect(decodeJcb(encodeJcb({ task: 'data', risk: 'high' }))).toEqual({ TASK: 'data', RISK: 'high' });
    expect(chooseTier(cognitiveDiagnosis({ text: 'bonjour' }), {}).tier).toBe('L1-free-validated');
    expect(chooseTier(hard, { deterministic: true }).tier).toBe('L0-deterministic');
    expect(
      chooseTier(
        cognitiveDiagnosis({
          text: 'Vérifie les provisions IFRS9 du portefeuille pour le comité',
          hasTools: true,
        }),
        { economy: 'max' },
      ).tier,
    ).toMatch(/L5|L6/);
  });
});

describe('stop, ROI, disagreement', () => {
  it('stops on target, redundancy and low marginal gain; never on an unmeasured quality', () => {
    const b = {
      quality: 96,
      previousQuality: 90,
      target: 95,
      nextCost: 0.05,
      valueLeft: null,
      redundant: false,
      newFacts: null,
      taskSolved: false,
      confidence: null,
      costSoFar: 0.1,
    };
    expect(shouldStop(b).reason).toBe('QUALITY_TARGET_REACHED');
    expect(shouldStop({ ...b, redundant: true }).reason).toBe('REDUNDANT_CALL');
    expect(shouldStop({ ...b, quality: 90.5, previousQuality: 90 }).reason).toBe('MARGINAL_GAIN_TOO_LOW');
    expect(shouldStop({ ...b, quality: null, previousQuality: null }).stop).toBe(false);
    expect(
      shouldStop({ ...b, quality: 80, previousQuality: 60, verifiedRequired: true, verified: false }).stop,
    ).toBe(false);
  });
  it('ROI is unknown without both numbers and ranking never uses a guess', () => {
    expect(cognitiveRoi(5, null)).toBeNull();
    expect(
      rankByRoi([
        { gain: null, cost: 0.01 },
        { gain: 4, cost: 2 },
        { gain: 6, cost: 1 },
      ]).map((x) => x.roi),
    ).toEqual([6, 2, null]);
    expect(
      jevScore({
        quality: 80,
        reliability: 1,
        taskFit: 1,
        infoGain: 1,
        cost: 0.1,
        tokenCost: 1,
        latencyPenalty: 1,
        risk: 1,
      }),
    ).toBeGreaterThan(0);
  });
  it('disagreement is localised to the differing number, then the council stays small unless stakes justify more', () => {
    const r = localizeDisagreement(
      'Le ratio est de 8,5 pour cent. Les provisions couvrent 120 millions. La liste est complète.',
      'Le ratio est de 8,5 pour cent. Les provisions couvrent 210 millions. La liste est complète.',
    );
    expect(r.points).toHaveLength(1);
    expect(r.verifyPrompt).toMatch(/UNIQUEMENT/);
    expect(
      adaptiveCouncil({ risk: 'high', ambiguity: 0.2, difficulty: 0.8, historicalVariance: 15 }).size,
    ).toBe(3);
    expect(
      adaptiveCouncil({ risk: 'low', ambiguity: 0.9, difficulty: 0.2, historicalVariance: 30 }).size,
    ).toBe(1);
  });
});

describe('log-based engines never invent', () => {
  const runs = (n: number, o: Record<string, unknown> = {}) =>
    Array.from({ length: n }, (_, i) => entry({ id: `e${i}`, mission: `m${i}`, ...o }));
  it('fingerprints need ≥ 5 missions per model', () => {
    expect(fingerprints(runs(3))[0]!.note).toMatch(/INSUFFICIENT DATA/);
    const f = fingerprints(runs(8))[0]!;
    expect(f.n).toBe(8);
    expect(f.quality).toBeCloseTo(80);
    expect(f.tokenEfficiency).not.toBeNull();
  });
  it('failure profile feeds the guards', () => {
    const p = failureProfile(runs(10, { failureNote: 'invalid JSON schema', success: false }));
    expect(p.m1!['wrong-format']).toEqual({ n: 10, failed: 10 });
  });
  it('leverage is INSUFFICIENT DATA without paired runs; zero-waste reads recorded savings only', () => {
    expect(leverage(runs(5)).note).toMatch(/INSUFFICIENT DATA/);
    expect(leverage(runs(5)).cognitive).toBeNull();
    const z = zeroWaste(
      runs(4, { liveSavedTokens: 100, contextBefore: 1000, contextAfter: 400, cacheHits: 1 }),
    );
    expect(z.tokensSaved).toBe(400);
    expect(z.contextCompressedTokens).toBe(2400);
    expect(z.callsAvoided).toBe(4);
  });
  it('self-audit says INSUFFICIENT DATA on a thin log and flags real waste on a thick one', () => {
    expect(selfAudit(runs(3)).filter((a) => a.id === 'tokens')[0]!.status).toBe('INSUFFICIENT DATA');
    expect(selfAudit(runs(12, { wasteRate: 0.4 })).filter((a) => a.id === 'tokens')[0]!.status).toBe(
      'PROBLEM',
    );
  });
  it('a strategy is not "validated" by a few successes', () => {
    const tag = {
      jcb: 'TASK=data CTX=minimal',
      taskDNA: 'data/analyze/high',
      protocol: 'DATA-VERIFY',
      protocolStatus: 'built-in',
      behavior: 'PRECISE',
      budget: { maxInput: 1, maxOutput: 1, expected: 1 },
      conditioningTokens: 10,
      guards: [],
      applied: [],
      version: 1,
    };
    const few = strategyLibrary(runs(4, { cognitive: tag }) as never);
    expect(few[0]!.status).toBe('candidate');
    const many = strategyLibrary(
      Array.from({ length: 12 }, (_, i) =>
        entry({
          id: `s${i}`,
          mission: `Analyse ${'x'.repeat(i)} du portefeuille ${['A', 'B', 'C', 'D'][i % 4]}`,
          cognitive: tag,
        }),
      ) as never,
      { regressionOk: true },
    );
    expect(many[0]!.status).toBe('validated');
    expect(
      strategyLibrary(
        Array.from({ length: 12 }, (_, i) =>
          entry({ id: `t${i}`, mission: `Analyse ${i} ${['A', 'B', 'C', 'D'][i % 4]}`, cognitive: tag }),
        ) as never,
      )[0]!.status,
    ).toBe('candidate'); // no regression check
  });
  it('micro-experts expire unless every skill is validated', () => {
    const base = {
      domain: 'ifrs9',
      model: 'm',
      memory: [],
      protocol: 'VERIFY',
      policy: 'v1',
      qualityGate: 90,
    };
    expect(buildMicroExpert({ ...base, skills: [{ id: 'a', status: 'validated' }] }).persistent).toBe(true);
    expect(
      buildMicroExpert({
        ...base,
        skills: [
          { id: 'a', status: 'validated' },
          { id: 'b', status: 'candidate' },
        ],
      }).persistent,
    ).toBe(false);
  });
  it('transfer is GENERALIZED only if the skill helps on two OTHER models', () => {
    const good = (m: string) => ({
      model: m,
      withSkill: [88, 90, 85, 92, 89, 91],
      without: [70, 72, 68, 75, 71, 69],
    });
    expect(evaluateTransfer([good('a'), good('b'), good('c')], 'a').status).toBe('GENERALIZED');
    expect(evaluateTransfer([good('a'), good('b')], 'a').status).toBe('INSUFFICIENT DATA');
    expect(
      evaluateTransfer(
        [
          good('a'),
          good('b'),
          { model: 'c', withSkill: [70, 71, 69, 70, 72], without: [70, 71, 69, 70, 72] },
        ],
        'a',
      ).status,
    ).toBe('MODEL-SPECIFIC');
  });
  it('rehabilitation needs a significant gain that crosses the threshold', () => {
    const r = rehabilitation({
      model: 'm',
      threshold: 75,
      arms: { alone: [55, 60, 58, 62, 57, 59], protocol: [80, 82, 79, 85, 81, 83] },
    });
    expect(r.verdict).toBe('REHABILITATED');
    expect(
      rehabilitation({
        model: 'm',
        threshold: 75,
        arms: { alone: [55, 60, 58, 62, 57, 59], protocol: [60, 61, 59, 63, 58, 60] },
      }).verdict,
    ).toBe('STILL WEAK');
    expect(rehabilitation({ model: 'm', threshold: 75, arms: { alone: [55] } }).verdict).toBe(
      'INSUFFICIENT DATA',
    );
  });
});

describe('policy evolution, cache, kernel, super benchmark', () => {
  it('a candidate policy is never promoted without data', () => {
    const ev = evaluatePolicy(BASE_POLICY, { ...BASE_POLICY, capsuleThreshold: 3000 }, []);
    expect(ev.verdict).toBe('INSUFFICIENT DATA');
    const hist = resolvePolicy(INITIAL_POLICIES, { ...BASE_POLICY, capsuleThreshold: 3000 }, ev);
    expect(hist.filter((h) => h.status === 'active')).toHaveLength(1);
    expect(hist.at(-1)!.status).toBe('candidate');
    expect(
      decide(BASE_POLICY, cognitiveDiagnosis({ text: 'bonjour' }), { contextTokens: 100 }).heavyProtocol,
    ).toBe(false);
  });
  it('policy replay: no differing decision → INSUFFICIENT DATA; cheaper and not worse → PROMOTE; cheaper but worse → REJECT', () => {
    const d = cognitiveDiagnosis({
      text: 'Analyse ce portefeuille et compare les segments de manière détaillée',
      attachments: ['x.xlsx'],
      hasTools: true,
    });
    const mk = (qDiffer: number) =>
      Array.from({ length: 40 }, (_, i) => ({
        entry: entry({ id: `p${i}`, quality: i % 2 ? qDiffer : 80 }),
        d,
        contextTokens: i % 2 ? 5000 : 100,
      }));
    const cand = { ...BASE_POLICY, capsuleThreshold: 4000 };
    const none = evaluatePolicy(BASE_POLICY, BASE_POLICY, mk(80));
    expect(none.verdict).toBe('INSUFFICIENT DATA');
    expect(none.label).toBe('OFFLINE ESTIMATE');
    const ok = evaluatePolicy(BASE_POLICY, cand, mk(80));
    expect(ok.differ).toBe(20);
    expect(ok.verdict).toBe('PROMOTE');
    const bad = evaluatePolicy(BASE_POLICY, cand, mk(55));
    expect(bad.verdict).toBe('REJECT');
  });
  it('cache invalidates on data / policy / capability change and expires', () => {
    let now = 0;
    const c = new CognitiveCache(() => now);
    const st = { data: 'a', policy: 1, capabilities: 'x', input: 'i' };
    c.put('L1', 'Quelle est la capitale ?', 'Dakar', st);
    expect(c.get('L1', 'quelle est la capitale', st)).toEqual({ hit: true, value: 'Dakar' });
    c.put('L1', 'q2', 1, st);
    expect(c.get('L1', 'q2', { ...st, policy: 2 })).toMatchObject({
      hit: false,
      reason: 'la politique a changé',
    });
    c.put('L1', 'q3', 1, st);
    now = 25 * 3600_000;
    expect(c.get('L1', 'q3', st)).toMatchObject({ hit: false, reason: 'expiré' });
    c.put('L0', 'k', 1, st);
    expect(c.get('L0', 'k', st).hit).toBe(true);
  });
  it('kernel: engines set to off do not run; a disabled layer plans nothing extra', () => {
    const off = new CognitiveKernel({ ...DEFAULT_COGNITIVE, enabled: false });
    const run = off.plan({
      text: 'Analyse ce fichier',
      attachments: ['a.xlsx'],
      hasImages: false,
      mission: false,
      historyTokens: 500,
      mode: 'balanced',
      hasTools: true,
      rawContext: '',
      parts: [],
    });
    expect(run.tokens).toBeNull();
    expect(run.capsule).toBeNull();
    expect(run.guards).toEqual([]);
    expect(run.conditioning.sections.every((s) => s.key !== 'PROTOCOL')).toBe(true);
    const tag = off.tag(run, { applied: [] });
    expect(tag.jcb).toBe(run.plan.jcb);
  });
  it('super benchmark: 200+ reproducible deterministic tasks whose checkers accept the truth and reject a wrong answer', () => {
    const t = superBenchTasks();
    expect(t.length).toBeGreaterThanOrEqual(200);
    expect(new Set(t.map((x) => x.key)).size).toBe(t.length);
    for (const c of SB_CATEGORIES)
      expect(t.filter((x) => x.category === c).length).toBeGreaterThanOrEqual(20);
    const shortTask = t.find((x) => x.category === 'shortcontext')!;
    expect(shortTask.check(`Le résultat est ${shortTask.truth}.`)).toBe(true);
    expect(shortTask.check('Le résultat est 7.')).toBe(false);
    const long = t.find((x) => x.category === 'longcontext')!;
    expect(long.check(long.truth)).toBe(true);
    expect(long.check('KORA-000')).toBe(false);
    const st = t.find((x) => x.category === 'structured')!;
    expect(st.check(st.truth)).toBe(true);
    const hr = t.find((x) => x.category === 'highrisk')!;
    expect(hr.check(hr.truth.replace('.', ','))).toBe(true);
    expect(NOT_DETERMINISTIC.length).toBeGreaterThan(2);
  });
  it('super benchmark analysis is empty (not invented) when nothing ran', () => {
    const a = analyzeSuperBench([]);
    expect(a.rows.every((r) => r.n === 0 && r.quality === null)).toBe(true);
    expect(a.note).toMatch(/INSUFFICIENT DATA/);
  });
});
