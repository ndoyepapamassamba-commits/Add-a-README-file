import { describe, expect, it } from 'vitest';
import { entry, many } from '../helpers/logEntry';
import type { JevLogEntry } from '../../server/jev/metrics';
import {
  SKILL_RULES,
  addVersion,
  clone,
  compareVersions,
  deprecate,
  mineCandidates,
  promote,
  promotionDecision,
  recordTest,
  rollback,
  selectSkills,
  skillPrompt,
  skillTestStats,
  type FabricSkill,
} from '../../server/jev/fabric/skills';
import {
  ambiguityOf,
  evaluateAnswers,
  freePool,
  freeStats,
  isFree,
  judgePrompt,
  parseJudge,
  pickMembers,
  planCouncil,
  tournament,
  wantedSize,
  FREE_LIMITATIONS,
  ranksOf,
} from '../../server/jev/fabric/council';
import {
  LEARNING_LEVELS,
  buildDataset,
  distillSkills,
  expertTrace,
  teacherTraces,
  toCsv,
  toJsonl,
} from '../../server/jev/fabric/distill';
import { ARMS, CF_CATEGORIES, analyzeArms, cfBenchTasks, numRx } from '../../server/jev/fabric/cfbench';
import { accountingOf, hashText, type ExperimentMeta } from '../../server/jev/science';
import type { ModelInfo } from '../../shared/types';

const ifrs = (i: number, over: Parameters<typeof entry>[0] = {}) =>
  entry({
    task: 'data',
    mission: `calcule les provisions IFRS9 du portefeuille agence ${i} fichier excel`,
    tools: ['filesystem.read', 'data.inspect', 'data.query'],
    ok: true,
    quality: 92,
    ...over,
  });

describe('skill factory: repetition + generalisation + validation', () => {
  it('a single success never becomes a skill', () => {
    const r = mineCandidates({ log: [ifrs(1)], existing: [] });
    expect(r.candidates).toHaveLength(0);
    expect(r.rejected[0]!.reason).toContain('répétitions requises');
  });
  it('one mission repeated is not a generalisation', () => {
    const r = mineCandidates({ log: many(4, () => ifrs(1)), existing: [] });
    expect(r.candidates).toHaveLength(0);
    expect(r.rejected[0]!.reason).toContain('généralisation');
  });
  it('a bad success rate is rejected even with many wins', () => {
    const log = [...many(3, (i) => ifrs(i)), ...many(3, (i) => ifrs(i + 10, { ok: false }))];
    expect(mineCandidates({ log, existing: [] }).candidates).toHaveLength(0);
  });
  it('mines a candidate with the full specification, from real runs only', () => {
    const log = many(5, (i) => ifrs(i));
    const { candidates } = mineCandidates({ log, existing: [], now: 1 });
    expect(candidates).toHaveLength(1);
    const s = candidates[0]!;
    const v = s.versions[0]!;
    expect(s.status).toBe('candidate');
    expect(s.activeVersion).toBeNull();
    for (const k of [
      'name',
      'version',
      'domain',
      'taskTypes',
      'triggerConditions',
      'prerequisites',
      'procedure',
      'promptTemplate',
      'toolRequirements',
      'expectedOutput',
      'evaluationCriteria',
      'examples',
      'counterExamples',
      'provenance',
      'confidence',
      'successRate',
      'usageCount',
      'createdAt',
      'updatedAt',
    ])
      expect(v).toHaveProperty(k);
    expect(v.triggerConditions).toEqual(expect.arrayContaining(['ifrs9']));
    expect(v.toolRequirements).toEqual(['filesystem.read', 'data.inspect', 'data.query']);
    expect(v.procedure[0]).toContain('Lire');
    expect(v.confidence).toBeCloseTo((5 / 10) * 1, 2);
    expect(v.provenance.experiences).toHaveLength(5);
    expect(v.examples.length).toBeLessThanOrEqual(SKILL_RULES.maxExamples);
    // no duplicate candidate for the same group
    expect(mineCandidates({ log, existing: candidates }).candidates).toHaveLength(0);
  });
  it('redacts secrets in examples', () => {
    const log = many(4, (i) =>
      ifrs(i, { mission: `provisions IFRS9 portefeuille ${i} clé sk-or-v1-abcdef1234567890 fichier excel` }),
    );
    const v = mineCandidates({ log, existing: [] }).candidates[0]!.versions[0]!;
    expect(JSON.stringify(v)).not.toContain('abcdef1234567890');
  });
});

const exp = (group: string): ExperimentMeta => ({
  experimentId: 'E',
  groupId: group,
  taskId: 't',
  category: 'data',
  protocol: 'fixed-model',
  variant: 'full',
  rep: 1,
  order: 0,
  timestamp: 0,
  model: 'm/a',
  modelVersion: null,
  modelsUsed: ['m/a'],
  promptHash: 'p',
  taskType: 'data',
  difficulty: 0.4,
  risk: 'low',
  toolsAvailable: 5,
  contextHash: 'c',
  temperature: null,
  maxTokens: 16000,
  jevMode: 'balanced',
});
function skillTests(
  skill: FabricSkill,
  n: number,
  w: { ok: (i: number) => boolean; q: number; cost: number },
  wo: { ok: (i: number) => boolean; q: number; cost: number },
): JevLogEntry[] {
  const out: JevLogEntry[] = [];
  for (let i = 0; i < n; i++)
    for (const [arm, s] of [
      ['with_skill', w],
      ['without_skill', wo],
    ] as const) {
      const e = entry({
        ok: s.ok(i),
        quality: s.q,
        cost: s.cost,
        fabric: { kind: 'skilltest', arm, groupId: `g${i}`, skillId: skill.id, skillVersion: '1.0' },
      });
      e.experiment = exp(`g${i}`);
      e.acct = accountingOf([
        {
          kind: 'main',
          step: 1,
          model: 'm/a',
          tokensIn: 100,
          tokensOut: 10,
          cost: s.cost,
          costSource: 'measured',
          ms: 1,
        },
      ]);
      out.push(e);
    }
  return out;
}

describe('skill test lab: WITH vs WITHOUT, promotion only on measured improvement', () => {
  const base = () => mineCandidates({ log: many(5, (i) => ifrs(i)), existing: [], now: 1 }).candidates[0]!;
  it('insufficient pairs: no decision, never promoted', () => {
    const s = base();
    const d = promotionDecision(
      skillTestStats(
        skillTests(s, 3, { ok: () => true, q: 95, cost: 0.002 }, { ok: () => true, q: 80, cost: 0.004 }),
        s.id,
        '1.0',
      ),
    );
    expect(d.verdict).toBe('keep_candidate');
    expect(d.reasons[0]).toContain('ÉCHANTILLON INSUFFISANT');
    expect(() => promote(s, '1.0')).toThrow('non testée'.replace('non testée', 'pas été testée'));
  });
  it('promotes a skill that improves quality and cost without regression, then supports versions, compare, rollback, deprecate, clone', () => {
    let s = base();
    const st = skillTestStats(
      skillTests(s, 6, { ok: () => true, q: 96, cost: 0.002 }, { ok: () => true, q: 85, cost: 0.004 }),
      s.id,
      '1.0',
    );
    expect(st.pairs).toBe(6);
    const d = promotionDecision(st, 5);
    expect(d.verdict).toBe('promote');
    expect(d.benchmark!.deltaQuality).toBeCloseTo(11, 0);
    s = promote(recordTest(s, '1.0', d, 5), '1.0', 6);
    expect(s.status).toBe('validated');
    expect(s.activeVersion).toBe('1.0');
    // v1.1 : a new version starts as a candidate and keeps the history
    s = addVersion(
      s,
      { procedure: [...s.versions[0]!.procedure, '5. Vérifier les totaux'] },
      'ajout d’une vérification des totaux',
      { now: 7 },
    );
    expect(s.currentVersion).toBe('1.1');
    expect(s.activeVersion).toBe('1.0');
    expect(s.versions.map((v) => v.version)).toEqual(['1.0', '1.1']);
    expect(compareVersions(s, '1.0', '1.1').map((c) => c.field)).toEqual(
      expect.arrayContaining(['procedure', 'status']),
    );
    s = {
      ...s,
      versions: s.versions.map((v) => (v.version === '1.1' ? { ...v, benchmark: d.benchmark } : v)),
    };
    s = promote(s, '1.1', 8);
    expect(s.activeVersion).toBe('1.1');
    s = rollback(s, 9);
    expect(s.activeVersion).toBe('1.0');
    expect(s.versions.find((v) => v.version === '1.1')!.status).toBe('deprecated');
    expect(deprecate(s).activeVersion).toBeNull();
    const c = clone(s, 'IFRS9_COPIE');
    expect(c.versions).toHaveLength(1);
    expect(c.status).toBe('candidate');
    expect(c.versions[0]!.reason).toContain('copie');
  });
  it('a skill that degrades results fails and records the regression', () => {
    const s = base();
    const d = promotionDecision(
      skillTestStats(
        skillTests(s, 6, { ok: (i) => i < 2, q: 60, cost: 0.003 }, { ok: () => true, q: 85, cost: 0.003 }),
        s.id,
        '1.0',
      ),
    );
    expect(d.verdict).toBe('fail');
    const r = recordTest(s, '1.0', d);
    expect(r.status).toBe('failed');
    expect(r.versions[0]!.regressions[0]).toContain('détérioration');
  });
  it('no measurable gain keeps the candidate (no promotion for nothing)', () => {
    const s = base();
    const d = promotionDecision(
      skillTestStats(
        skillTests(s, 6, { ok: () => true, q: 90, cost: 0.003 }, { ok: () => true, q: 90, cost: 0.003 }),
        s.id,
        '1.0',
      ),
    );
    expect(d.verdict).toBe('keep_candidate');
  });
  it('runtime selection: validated skills only, matching triggers, compact injection, never everything', () => {
    let s = base();
    const d = promotionDecision(
      skillTestStats(
        skillTests(s, 6, { ok: () => true, q: 96, cost: 0.002 }, { ok: () => true, q: 85, cost: 0.004 }),
        s.id,
        '1.0',
      ),
    );
    expect(
      selectSkills([s], { taskType: 'data', text: 'provisions IFRS9 du portefeuille excel' }),
    ).toHaveLength(0); // candidate
    s = promote(recordTest(s, '1.0', d), '1.0');
    const sel = selectSkills([s], {
      taskType: 'data',
      text: 'calcule les provisions IFRS9 du portefeuille depuis ce fichier excel',
    });
    expect(sel).toHaveLength(1);
    expect(
      selectSkills([s], { taskType: 'writing', text: 'provisions IFRS9 portefeuille excel' }),
    ).toHaveLength(0);
    expect(selectSkills([s], { taskType: 'data', text: 'météo demain' })).toHaveLength(0);
    expect(
      selectSkills(
        [s],
        { taskType: 'data', text: 'provisions IFRS9 portefeuille excel' },
        { skip: new Set([s.name]) },
      ),
    ).toHaveLength(0);
    const p = skillPrompt(sel[0]!.version);
    expect(p.length).toBeLessThan(1200);
    expect(p).not.toContain('examples');
  });
});

describe('model council', () => {
  const cands = [
    { id: 'a/strong', provider: 'a', estCost: 0.01, rank: 1 },
    { id: 'b/mid', provider: 'b', estCost: 0.004, rank: 2 },
    { id: 'a/other', provider: 'a', estCost: 0.002, rank: 3 },
    { id: 'c/cheap', provider: 'c', estCost: 0.001, rank: 4 },
  ];
  const base = {
    difficulty: 0.3,
    ambiguity: 0.1,
    risk: 0.1,
    critical: false,
    mode: 'balanced' as const,
    candidates: cands,
    budgetLeft: null,
    measuredGain: null,
    valuePerPoint: 0.01,
  };
  it('decides how many models: 1 simple, 2 ambiguous, 3+ critical — and caps by mode', () => {
    expect(wantedSize(base)).toBe(1);
    expect(wantedSize({ ...base, ambiguity: 0.7 })).toBe(2);
    expect(wantedSize({ ...base, critical: true })).toBe(3);
    expect(wantedSize({ ...base, critical: true, mode: 'eco' })).toBe(2);
    expect(wantedSize({ ...base, critical: true, risk: 0.9, mode: 'max' })).toBe(4);
    expect(planCouncil(base).size).toBe(1);
  });
  it('diversifies providers and lets the economic governor refuse extra models', () => {
    expect(pickMembers(cands, 3).map((m) => m.provider)).toEqual(['a', 'b', 'c']);
    const worth = planCouncil({ ...base, ambiguity: 0.8, risk: 0.8, critical: true });
    expect(worth.size).toBeGreaterThanOrEqual(2);
    expect(worth.decisions.every((d) => d.gainSource === 'PROJECTED')).toBe(true);
    const dear = planCouncil({
      ...base,
      ambiguity: 0.8,
      candidates: cands.map((c) => ({ ...c, estCost: 5 })),
      valuePerPoint: 0.001,
    });
    expect(dear.size).toBe(1);
    expect(dear.reason).toContain('évaluation économique');
    expect(dear.decisions[0]!.reason).toContain('ne vaut pas économiquement la peine');
    const tight = planCouncil({ ...base, ambiguity: 0.8, budgetLeft: 0.005 });
    expect(tight.size).toBe(1);
  });
  it('uses a measured gain when real council runs exist', () => {
    const p = planCouncil({ ...base, ambiguity: 0.8, measuredGain: 12 });
    expect(p.decisions[0]!.gainSource).toBe('MEASURED');
  });
  it('ambiguity heuristic', () => {
    expect(ambiguityOf('fais ça comme avant ?')).toBeGreaterThan(0.5);
    expect(ambiguityOf('Dans bench/ventes.csv, calcule le total des montants pour "Dakar".')).toBeLessThan(
      0.3,
    );
  });
  it('evaluator: deterministic first, consensus needs no judge, disputes name the point', () => {
    const mk = (model: string, answer: string, cost = 0.01) => ({
      model,
      answer,
      ok: true,
      tokens: 100,
      cost,
      ms: 10,
    });
    const agree = evaluateAnswers('Combien font 17 × 23 ?', [
      mk('a', 'Le résultat est 391.'),
      mk('b', '17 × 23 = 391', 0.001),
    ]);
    expect(agree.consensus).toBe(true);
    expect(agree.winner!.model).toBe('b');
    const dispute = evaluateAnswers('Combien font 17 × 23 ?', [
      mk('a', 'Le résultat est 391.'),
      mk('b', 'Je trouve 401.'),
      mk('c', 'Réponse : 391'),
    ]);
    expect(dispute.consensus).toBe(false);
    expect(dispute.disputes[0]).toContain('401');
    const truth = evaluateAnswers('Combien font 17 × 23 ?', [mk('a', 'Je trouve 401.'), mk('b', '391')], {
      expect: numRx(391),
    });
    expect(truth.winner!.model).toBe('b');
    expect(truth.why).toContain('contrôle de réussite');
    const broken = evaluateAnswers('x', [
      { model: 'a', answer: '', ok: false, error: '429', tokens: 0, cost: 0, ms: 0 },
    ]);
    expect(broken.winner).toBeNull();
  });
  it('the judge sees only the disputed point and returns a letter', () => {
    const ev = evaluateAnswers('Combien font 17 × 23 ?', [
      { model: 'a', answer: 'Je trouve 391.', ok: true, tokens: 1, cost: 0, ms: 1 },
      { model: 'b', answer: 'Je trouve 401.', ok: true, tokens: 1, cost: 0, ms: 1 },
    ]);
    const p = judgePrompt('Combien font 17 × 23 ?', ev);
    expect(p).toContain('Point en désaccord');
    expect(p.length).toBeLessThan(900);
    expect(parseJudge('Réponse : B', 2)).toBe(1);
    expect(parseJudge('rien', 2)).toBeNull();
  });
});

const mi = (id: string, free: boolean): ModelInfo => ({
  id,
  slug: id,
  name: id,
  provider: id.split('/')[0]!,
  created: 0,
  contextLength: 32000,
  maxCompletionTokens: null,
  inputPrice: free ? 0 : 1,
  outputPrice: free ? 0 : 2,
  capabilities: { tools: true, reasoning: false, vision: false, structuredOutputs: true },
  efforts: [],
  defaultEffort: null,
  description: '',
});

describe('free model lab', () => {
  it('free = $0 price only; availability is measured, rate limits observed, policy never assumed', () => {
    const models = [
      mi('x/one:free', true),
      mi('y/two', false),
      { ...mi('z/zero', false), inputPrice: 0, outputPrice: 0 },
    ];
    expect(models.map(isFree)).toEqual([true, false, true]);
    const pool = freePool(models);
    expect(pool.map((p) => p.id).sort()).toEqual(['x/one:free', 'z/zero']);
    expect(FREE_LIMITATIONS.join(' ')).toMatch(/illimitée/);
    const log = [
      entry({ model: 'x/one:free', ok: true }),
      entry({ model: 'x/one:free', ok: false, ...{} }),
      entry({ model: 'y/two' }),
    ];
    log[1]!.failureNote = 'HTTP 429 Too Many Requests';
    const st = freeStats(log, pool);
    expect(st).toHaveLength(1);
    expect(st[0]).toMatchObject({ runs: 2, rateLimited: 1, errors: 1 });
    expect(st[0]!.availability).toBe(0.5);
  });
});

describe('model tournament', () => {
  it('ranks per domain from tournament runs only; a model can be #1 in one domain and #2 in another', () => {
    const t = (model: string, cat: string, ok: boolean, cost = 0.01) =>
      entry({ model, ok, cost, fabric: { kind: 'tournament', groupId: 'g', category: cat } });
    const log = [
      t('a', 'coding', true),
      t('a', 'coding', true),
      t('b', 'coding', false),
      t('b', 'coding', true),
      t('a', 'reasoning', false),
      t('a', 'reasoning', false),
      t('b', 'reasoning', true),
      t('b', 'reasoning', true),
      entry({ model: 'c', ok: true }),
    ];
    const r = tournament(log);
    expect(r.coding![0]!.model).toBe('a');
    expect(r.reasoning![0]!.model).toBe('b');
    expect(ranksOf(r, 'a')).toEqual({ coding: 1, reasoning: 2 });
    expect(
      Object.values(r)
        .flat()
        .find((x) => x.model === 'c'),
    ).toBeUndefined();
  });
});

describe('distillation lab and training dataset factory', () => {
  const ex = (i: number, o: Parameters<typeof entry>[0] = {}) => {
    const e = ifrs(i, { model: 'teacher/strong', quality: 95, ...o });
    e.instruction = `provisions IFRS9 portefeuille agence ${i} fichier excel`;
    e.answer = `Total des provisions : ${i * 1000}.`;
    return e;
  };
  it('states honestly what is and is not possible (levels 6–7 unavailable)', () => {
    expect(LEARNING_LEVELS).toHaveLength(7);
    expect(LEARNING_LEVELS.filter((l) => l.status === 'AVAILABLE').map((l) => l.level)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(LEARNING_LEVELS.find((l) => l.level === 7)!.detail).toMatch(/poids/);
  });
  it('expert trace is structured and holds no reasoning chain', () => {
    const e = ex(1, { corrections: 1 });
    e.checkpoints = [
      { name: 'JEV_EXECUTION', ms: 0, tokens: 0, cost: 0, decision: 'REPLAN : nouvelle approche' },
    ];
    const t = expertTrace(e)!;
    expect(t.plan[0]).toContain('filesystem.read');
    expect(t.decisions[0]).toContain('REPLAN');
    expect(t.errorsAvoided).toContain('erreur corrigée avant livraison');
    expect(Object.keys(t)).not.toContain('reasoning');
    expect(expertTrace(ex(1, { ok: false }))).toBeNull();
    expect(teacherTraces([ex(1), ex(2, { model: 'weak' })], { teachers: ['teacher/strong'] })).toHaveLength(
      1,
    );
  });
  it('strategy distillation: a teacher skill from 2 repetitions, still a candidate until tested', () => {
    const r = distillSkills([ex(1), ex(2), ex(3, { model: 'other' })], [], 'teacher/strong');
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]!.versions[0]!.provenance.teacher).toBe('teacher/strong');
    expect(r.candidates[0]!.status).toBe('candidate');
  });
  it('dataset: only captured examples, secrets scrubbed, validation status honest, nothing silently dropped', () => {
    const good = ex(1);
    good.qualitySource = 'local-qa+ground-truth';
    const noEx = ifrs(2);
    const secret = ex(3);
    secret.instruction = 'utilise sk-or-v1-abcdef1234567890 pour agence 3';
    const bad = ex(4, { ok: false });
    const low = ex(5, { quality: 40 });
    const r = buildDataset([good, noEx, secret, bad, low], { student: 'free/student' });
    expect(r.rows).toHaveLength(2);
    expect(r.skipped).toMatchObject({ noExample: 1, rejected: 1, lowQuality: 1 });
    expect(r.rows[0]).toMatchObject({
      validation_status: 'validated',
      teacher_model: 'teacher/strong',
      student_model: 'free/student',
      task_type: 'data',
    });
    expect(r.rows[1]!.validation_status).toBe('unvalidated');
    expect(JSON.stringify(r.rows)).not.toContain('abcdef1234567890');
    for (const k of [
      'instruction',
      'input',
      'expected_output',
      'evaluation_criteria',
      'task_type',
      'difficulty',
      'source',
      'quality',
      'teacher_model',
      'student_model',
      'validation_status',
    ])
      expect(r.rows[0]).toHaveProperty(k);
    expect(toJsonl(r.rows).split('\n')).toHaveLength(2);
    expect(JSON.parse(toJsonl(r.rows).split('\n')[0]!).instruction).toContain('provisions');
    expect(toCsv(r.rows).split('\n')[0]).toContain('validation_status');
    expect(buildDataset([bad], { includeRejected: true }).rows[0]!.validation_status).toBe('rejected');
  });
});

describe('cognitive fabric benchmark: 80 deterministic tasks with computed ground truth', () => {
  const tasks = cfBenchTasks();
  it('has 10 tasks per category, unique keys, and is reproducible', () => {
    expect(tasks).toHaveLength(80);
    for (const c of CF_CATEGORIES) expect(tasks.filter((t) => t.category === c)).toHaveLength(10);
    expect(new Set(tasks.map((t) => t.key)).size).toBe(80);
    expect(cfBenchTasks().map((t) => [t.key, t.text, String(t.expect)])).toEqual(
      tasks.map((t) => [t.key, t.text, String(t.expect)]),
    );
  });
  it('the expected answers are right: recomputed independently from the generated files', () => {
    const csv = (p: string) =>
      tasks
        .find((t) => t.files?.[p])!
        .files![p]!.trim()
        .split('\n')
        .slice(1)
        .map((l) => l.split(','));
    const d1 = tasks.find((t) => t.key === 'd01')!;
    const path = Object.keys(d1.files!)[0]!;
    const rows = csv(path);
    const dakar = rows.filter((r) => r[0] === 'Dakar').reduce((a, r) => a + Number(r[2]), 0);
    expect(d1.expect.test(String(dakar))).toBe(true);
    expect(d1.expect.test(String(dakar + 10))).toBe(false);
    const d3 = tasks.find((t) => t.key === 'd03')!;
    expect(d3.expect.test(String(csv(Object.keys(d3.files!)[0]!).length))).toBe(true);
    const doc = tasks.find((t) => t.key === 'm01')!;
    const text = Object.values(doc.files!)[0]!;
    const dur = Number(/pour (\d+) mois/.exec(text)![1]);
    expect(doc.expect.test(String(dur))).toBe(true);
    expect(tasks.find((t) => t.key === 'k05')!.expect.test('fib(20) = 6765')).toBe(true);
    expect(tasks.find((t) => t.key === 'k05')!.expect.test('6764')).toBe(false);
    expect(tasks.find((t) => t.key === 'c01')!.expect.test('1 157 625 XOF')).toBe(true);
    expect(tasks.find((t) => t.key === 'c06')!.expect.test('180000')).toBe(true);
    expect(tasks.find((t) => t.key === 'r08')!.expect.test('samedi')).toBe(true);
    expect(tasks.find((t) => t.key === 'r09')!.expect.test('8 550')).toBe(true);
    expect(tasks.find((t) => t.key === 't05')!.expect.test('55')).toBe(true);
    expect(tasks.find((t) => t.key === 'i03')!.expect.test('mercredi')).toBe(true);
  });
  it('numRx matches thousand separators but not substrings of bigger numbers', () => {
    expect(numRx(1157625).test('1 157 625')).toBe(true);
    expect(numRx(1157625).test('1.157.625')).toBe(true);
    expect(numRx(1157625).test('21157625')).toBe(false);
    expect(numRx(55).test('155')).toBe(false);
  });
  const cf = (
    group: string,
    arm: string,
    over: Parameters<typeof entry>[0],
    model = 'm/a',
    cat = 'code',
  ): JevLogEntry => {
    const e = entry({
      ...over,
      model,
      fabric: { kind: 'cfbench', arm, groupId: group, taskKey: group.split(':')[0], category: cat },
    });
    e.experiment = { ...exp(group), model, promptHash: hashText(group) };
    return e;
  };
  it('compares BASELINE vs V5 vs FABRIC on paired groups; small samples say so; non-comparable pairs are excluded', () => {
    const log: JevLogEntry[] = [];
    for (let i = 0; i < 6; i++) {
      const g = `k${i}:1`;
      log.push(
        cf(g, 'baseline', { cost: 0.01, quality: 80, ok: i < 4 }),
        cf(g, 'v5', { cost: 0.008, quality: 82, ok: i < 4 }),
        cf(g, 'fabric', { cost: 0.004, quality: 92, ok: true }),
      );
    }
    log.push(cf('z:1', 'baseline', {}, 'm/a'), cf('z:1', 'fabric', {}, 'm/other'));
    const r = analyzeArms(log);
    expect(ARMS.map((a) => r.arms.find((x) => x.arm === a)!.n)).toEqual([6, 6, 6]);
    const fab = r.comparisons.find((c) => c.from === 'baseline' && c.to === 'fabric')!;
    expect(fab.label).toBe('MEASURED');
    expect(fab.verdict).toBe('improves');
    expect(fab.dSuccess.meanDelta).toBeCloseTo(2 / 6, 5);
    expect(r.nonComparable[0]!.reasons.join()).toContain('model');
    expect(r.byCategory.code!.comparisons).toHaveLength(3);
    const small = analyzeArms(log.slice(0, 6));
    expect(small.comparisons.every((c) => c.verdict === 'insufficient')).toBe(true);
    expect(analyzeArms([]).arms.every((a) => a.n === 0 && a.successRate === null)).toBe(true);
  });
});
