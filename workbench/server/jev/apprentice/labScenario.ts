// CHAMPION / CHALLENGER — reproducible 18-step scenario on IFRS9 (free model A becomes champion, B challenges it, B is
// rejected, then promoted, then rolled back, A fails, a premium Teacher teaches a skill, A recovers).
// ⚠ SIMULATED TEST ONLY: records are SYNTHETIC (deterministic seed), run through the REAL lab engine in a throw-away state.
// They carry the SIMULATED flag, are rejected by every production code path (isReal) and are never persisted.
import type { JevLogEntry } from '../metrics';
import { accountingOf, type CallRec } from '../science';
import type { FreeModel } from '../fabric/council';
import { promotionDecision, promote, recordTest, skillTestStats, type FabricSkill } from '../fabric/skills';
import { DEFAULT_APPRENTICE, type ApprenticeSettings, type ApprenticeTag, type Risk } from './types';
import {
  EMPTY_LAB,
  SIMULATED_FLAG,
  evaluateNonInferiority,
  experimentPairs,
  labKey,
  runLab,
  type LabState,
} from './lab';
import { discoverChallengers, type DiscoveredModel } from './discovery';
import { calculateTeacherROI } from './teacherLearning';
import { detectFailurePatterns, skillFromPattern } from './failurePatterns';
import { failureSignatureOf, learningOf } from './failure';
import { familyRecord, validateRecord } from './supremacy';
import { labRows } from './labView';

export const SCENARIO_FAMILY = 'data:ifrs9';
export const A = 'free/model-a:free';
export const B = 'free/model-b:free';
export const PREMIUM = 'premium/model-x';
const RISK: Risk = 'normal';
const KEY = labKey(SCENARIO_FAMILY, RISK);
const DAY = 86_400_000;

const pool = (ids: string[]): FreeModel[] =>
  ids.map((id) => ({
    id,
    name: id,
    provider: id.split('/')[0]!,
    contextLength: 128_000,
    tools: true,
    vision: false,
    structuredOutputs: true,
    reasoning: true,
  }));
const TEXTS = [
  'Calcule la provision ECL IFRS9 du portefeuille corporate par stage',
  'Analyse la migration Stage 1 vers Stage 2 des expositions du trimestre',
  'Quel est le taux de couverture IFRS9 par segment de clientèle',
  'Réconcilie les provisions IFRS9 avec le grand livre et signale les écarts',
  'Prépare le tableau des expositions Stage 3 et de la perte attendue',
  'Évalue l impact du changement de PD sur les provisions ECL du portefeuille',
];

/** Seeded generator (mulberry32) so that the scenario is exactly reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, next()))) * Math.cos(2 * Math.PI * next());
  return { next, gauss };
}

interface Gen {
  model: string;
  at: number;
  quality: number;
  ok: boolean;
  text: string;
  arm?: ApprenticeTag['arm'];
  group?: string;
  path?: string[];
  failure?: ApprenticeTag['failure'];
  teacherCost?: number;
  cost?: number;
  latency?: number;
  skills?: string[];
}
let seq = 0;
function synth(g: Gen): JevLogEntry {
  const cost = g.cost ?? (g.model === PREMIUM ? 0.08 : 0);
  const calls: CallRec[] = [
    {
      kind: 'main',
      step: 1,
      model: g.model,
      tokensIn: 9000,
      tokensOut: 800,
      cost,
      costSource: 'measured',
      ms: 10,
    },
  ];
  const tag: ApprenticeTag = {
    active: true,
    adapted: g.model !== PREMIUM,
    family: SCENARIO_FAMILY,
    path: g.path ?? [g.model],
    threshold: 0.9,
    gateScore: g.quality / 100,
    accepted: g.ok && g.quality >= 90,
    adaptationMs: 6,
    tokensAdded: 320,
    skills: g.skills ?? [],
    experiences: 0,
    toolsExposed: 6,
    contextReduction: null,
    predictedSuccess: null,
    confidence: 'MEDIUM',
    why: [SIMULATED_FLAG],
    arm: g.arm,
    failure: g.failure,
    teacher: g.teacherCost ? g.path?.at(-1) : undefined,
    teacherCost: g.teacherCost,
    risk: RISK,
    contract: 'table',
    difficulty: 0.3,
    toolProfile: 'data',
    contextBucket: 'ctx-m',
    lang: 'fr',
  };
  return {
    id: `sim${seq++}`,
    at: g.at,
    session: 'sim',
    mission: g.text,
    instruction: g.text,
    task: 'data',
    mode: 'balanced',
    jev: true,
    level: 1,
    decisionBy: 'JEV-0',
    model: g.model,
    reason: SIMULATED_FLAG,
    tokensIn: 9000,
    tokensOut: 800,
    cost,
    jevCost: 0,
    latencyMs: g.latency ?? (g.model === PREMIUM ? 4200 : 1900),
    decisionMs: 2,
    calls: 1,
    quality: g.quality,
    success: g.ok,
    retries: 0,
    escalations: 0,
    corrections: 0,
    cacheHits: 0,
    toolsOffered: 6,
    toolsBaseline: 40,
    toolTokens: 1,
    toolTokensBaseline: 1,
    contextBefore: 5000,
    contextAfter: 0,
    checkpoints: [],
    acct: accountingOf(calls),
    qualityMeasured: g.quality,
    toolsUsed: ['data.query'],
    toolCallCount: 2,
    skillsUsed: g.skills,
    apprentice: tag,
    fabric: g.group
      ? { kind: 'apprentice', arm: g.arm, groupId: g.group, taskKey: g.group, category: 'data', models: [] }
      : undefined,
    experiment: g.group
      ? ({
          experimentId: 'SIM',
          groupId: g.group,
          taskId: g.group,
          category: 'data',
          protocol: 'fixed-model',
          variant: 'full',
          rep: 1,
          order: 0,
          timestamp: g.at,
          model: g.model,
          modelVersion: null,
          modelsUsed: [g.model],
          promptHash: g.group,
          taskType: 'data',
          difficulty: 0.3,
          risk: 'normal',
          toolsAvailable: 6,
          contextHash: 'c',
          temperature: null,
          maxTokens: 4000,
          jevMode: 'balanced',
        } as never)
      : undefined,
  } as JevLogEntry;
}

export interface ScenarioStep {
  n: number;
  title: string;
  lines: string[];
  champion: string | null;
  previousChampion: string | null;
  challengers: string[];
  decision: string;
  /** What the routing memory holds after this step. */
  routingMemory: { champion: string | null; fallback: string | null; premium: string | null } | null;
  /** The engine stages that really ran at this step (measured on the simulated data). */
  trace: string[];
  discovery: { id: string; stage: string }[];
}

/** Runs the scenario; deterministic for a given `now`. */
export function runLabScenario(now = Date.UTC(2026, 9, 5)): {
  steps: ScenarioStep[];
  state: LabState;
  log: JevLogEntry[];
} {
  seq = 0;
  const r = rng(20261005);
  const s: ApprenticeSettings = { ...DEFAULT_APPRENTICE, enabled: true };
  const log: JevLogEntry[] = [];
  let state: LabState = EMPTY_LAB;
  let known: Record<string, DiscoveredModel> = {};
  let skills: FabricSkill[] = [];
  let t = now - 120 * DAY;
  const tick = () => (t += DAY / 3);
  const q = (mean: number, sd: number) => Math.max(0, Math.min(100, mean + sd * r.gauss()));
  const adapted = (model: string, n: number, mean: number, sd: number, p: number, o: Partial<Gen> = {}) => {
    for (let i = 0; i < n; i++) {
      const quality = q(mean, sd);
      log.push(
        synth({
          model,
          at: tick(),
          quality,
          ok: quality >= 85 && r.next() < p,
          text: TEXTS[(i + (o.text ? 0 : 0)) % TEXTS.length]!,
          ...o,
        }),
      );
    }
  };
  const pairs = (
    tag: string,
    n: number,
    champ: string,
    chall: string,
    qc: number,
    qb: number,
    sd: number,
    prem = false,
  ) => {
    for (let i = 0; i < n; i++) {
      const g = `${tag}-${i}`;
      const at = tick();
      const text = TEXTS[i % TEXTS.length]!;
      const a = q(qc, sd);
      const b = q(qb, sd);
      log.push(synth({ model: champ, at, quality: a, ok: a >= 85, text, arm: 'validated', group: g }));
      log.push(synth({ model: chall, at, quality: b, ok: b >= 85, text, arm: 'challenger', group: g }));
      if (prem)
        log.push(synth({ model: PREMIUM, at, quality: q(96, sd), ok: true, text, arm: 'paid', group: g }));
    }
  };
  const premiumRuns = (n: number) => {
    for (let i = 0; i < n; i++)
      log.push(
        synth({
          model: PREMIUM,
          at: tick(),
          quality: q(96, 1.5),
          ok: true,
          text: TEXTS[i % TEXTS.length]!,
          path: [PREMIUM],
        }),
      );
  };
  const steps: ScenarioStep[] = [];
  const apply = (poolIds: string[]) => {
    const out = runLab(state, { log, pool: pool(poolIds), settings: s, now, source: 'SIMULATED' });
    state = out.state;
    return out;
  };
  const snap = (title: string, lines: string[], decisionOverride?: string, trace: string[] = []) => {
    const f = state.families[KEY];
    const champion = f?.champion?.model ?? null;
    steps.push({
      n: steps.length + 1,
      title,
      lines: [SIMULATED_FLAG, ...lines],
      champion,
      previousChampion: f?.previousChampion?.model ?? null,
      challengers: f?.challengers ?? [],
      decision:
        decisionOverride ??
        (f?.currentDecision
          ? `${f.currentDecision.action} — ${f.currentDecision.reason}`
          : 'aucune décision'),
      routingMemory: f
        ? {
            champion,
            fallback: f.previousChampion?.model ?? f.challengers[0] ?? null,
            premium: f.premiumReference?.model ?? null,
          }
        : null,
      trace,
      discovery: Object.values(known).map((d) => ({ id: d.id, stage: d.stage })),
    });
  };
  const disc = (ids: string[]) => {
    const d = discoverChallengers({ pool: pool(ids), known, log, now });
    known = d.known;
    return d.discovered;
  };

  // 1-2. Free model A discovered → CHALLENGER (never champion directly)
  const d1 = disc([A]);
  snap(
    '1 · Free Model A découvert',
    [`${d1.join(', ')} découvert : sécurité, capacités et santé vérifiées pas à pas.`],
    'DISCOVERED',
    ['DISCOVERED', 'SECURITY_CHECKED', 'CAPABILITY_CHECKED', 'HEALTH_CHECKED'],
  );
  snap(
    '2 · A devient Challenger',
    [
      `Étape atteinte : ${known[A]!.stage}. Aucun champion n'existe : un nouveau modèle n'est jamais champion directement.`,
    ],
    'CHALLENGER',
  );
  // 3-4. 10+ adapted missions with sufficient quality and success
  premiumRuns(8);
  adapted(A, 12, 94, 1.5, 1);
  const recA = familyRecord(
    log.filter((e) => e.model === A && e.apprentice),
    A,
    SCENARIO_FAMILY,
    s.validation,
    now,
  );
  snap('3 · 12 missions adaptées', [
    `n = ${recA.n}, formulations = ${recA.formulations}, qualité ${recA.quality?.toFixed(1)}, réussite ${((recA.success ?? 0) * 100).toFixed(0)} %.`,
  ]);
  snap('4 · Qualité et réussite suffisantes', [
    `Seuils : 10 missions, 3 formulations, 90 % / 90, 0 erreur critique.`,
    `Intervalle de confiance de la réussite : ${recA.success === null ? 'N/A' : 'calculé par Wilson'}.`,
  ]);
  // 5-6. validation → champion
  const v = validateRecord(recA, RISK, s.validation);
  snap(
    '5 · Validation',
    v.checks
      .map((c) => `${c.ok ? '✓' : '✗'} ${c.label} : ${c.actual} (requis ${c.required})`)
      .concat([`Statut : ${v.status}`]),
    v.status,
  );
  const o6 = apply([A]);
  snap(
    '6 · A devient Champion',
    [o6.events.map((e) => `${e.kind} ${e.model} : ${e.reason}`).join(' ; ') || 'aucun événement'],
    undefined,
    o6.steps.map((x) => x.name),
  );
  // 7-8. Free model B arrives → challenger
  const d7 = disc([A, B]);
  snap('7 · Free Model B arrive', [`${d7.join(', ')} découvert.`], 'DISCOVERED');
  snap(
    '8 · B devient Challenger',
    [`Étape atteinte : ${known[B]!.stage}. Champion inchangé : ${state.families[KEY]?.champion?.model}.`],
    'CHALLENGER',
  );
  // 9-10. B tested against A: B fails validation → A stays champion
  pairs('x1', 24, A, B, 94, 87, 2, true);
  adapted(B, 6, 87, 3, 0.8);
  const o9 = apply([A, B]);
  const f9 = state.families[KEY]!;
  snap(
    '9 · B testé contre A (24 paires appariées)',
    [
      f9.statisticalEvidence ? f9.statisticalEvidence.evaluation.phrase : 'aucune évidence',
      `Premium de référence : ${f9.premiumReference?.model} (qualité ${f9.premiumReference?.quality?.toFixed(1)}, n=${f9.premiumReference?.n}, ${f9.premiumReference?.sample}).`,
    ],
    undefined,
    o9.steps.map((x) => x.name),
  );
  snap('10 · B échoue à la validation → A reste Champion', [
    `Décision : ${f9.currentDecision?.action}. Champion : ${f9.champion?.model}.`,
    `Événements : ${o9.events.map((e) => `${e.kind} ${e.model}`).join(' ; ') || 'aucun'}`,
  ]);
  // 11-12. new experiment: B statistically superior → champion
  pairs('x2', 40, A, B, 93, 98, 1.5, true);
  adapted(B, 12, 98, 1.2, 1);
  const o11 = apply([A, B]);
  const f11 = state.families[KEY]!;
  snap(
    '11 · Nouvelle expérience (40 paires)',
    [
      f11.statisticalEvidence ? f11.statisticalEvidence.evaluation.phrase : 'aucune évidence',
      `Taille d'effet : ${f11.statisticalEvidence?.evaluation.effectLabel}.`,
    ],
    undefined,
    o11.steps.map((x) => x.name),
  );
  snap('12 · B statistiquement supérieur → Champion', [
    `Événements : ${o11.events.map((e) => `${e.kind} ${e.model}`).join(' ; ') || 'aucun'}`,
    `Champion : ${f11.champion?.model} ; précédent : ${f11.previousChampion?.model}.`,
  ]);
  // 13. B degrades → rollback to A
  adapted(B, 10, 78, 2, 0.5);
  const o13 = apply([A, B]);
  const f13 = state.families[KEY]!;
  snap('13 · B se dégrade → rollback vers A', [
    `Événements : ${o13.events.map((e) => `${e.kind} ${e.model} → ${e.to ?? ''}`).join(' ; ') || 'aucun'}`,
    `Champion : ${f13.champion?.model} ; modèles annulés : ${f13.rolledBack.join(', ') || '—'}.`,
  ]);
  // 14. A fails afterwards → Premium Teacher
  const sig = failureSignatureOf([
    { kind: 'format', what: 'JSON demandé mais invalide', dimension: 'instruction_following' },
  ]);
  for (let i = 0; i < 10; i++) {
    const fl = learningOf({ signature: sig, path: [A, PREMIUM], success: true, teacher: PREMIUM });
    log.push(
      synth({
        model: A,
        at: tick(),
        quality: q(70, 3),
        ok: false,
        text: TEXTS[i % TEXTS.length]!,
        path: [A, PREMIUM],
        failure: fl,
        teacherCost: i < 3 ? 0.08 : undefined,
      }),
    );
  }
  const o14 = apply([A, B]);
  const roi = calculateTeacherROI({
    log: log.filter((e) => e.fabric?.kind !== 'apprentice'),
    family: SCENARIO_FAMILY,
    teacherCost: 0.08,
    immediateGain: 0.0006,
    signature: sig,
    apprenticeSuccess: 0.9,
    apprenticeN: 30,
    now,
  });
  snap('14 · A échoue ensuite → Premium Teacher', [
    `Événements : ${o14.events.map((e) => `${e.kind} ${e.model}`).join(' ; ') || 'aucun'}`,
    roi.reason,
    `Valeur d'apprentissage : ${roi.learningValue}${roi.roi === null ? '' : `, ROI ${roi.roi.toFixed(1)}x`}.`,
  ]);
  // 15. Teacher creates a skill via the failure pattern
  const patterns = detectFailurePatterns(log, skills);
  const skill = patterns[0] ? skillFromPattern(patterns[0], log, now) : null;
  if (skill) skills = [...skills, skill];
  snap('15 · Le Teacher crée une Skill', [
    patterns[0]
      ? `Pattern ${patterns[0].errorType} ×${patterns[0].count} sur ${patterns[0].family} → skill candidate « ${skill!.name} » (statut ${skill!.status}).`
      : 'aucun pattern',
  ]);
  // 16. Skill validated WITH / WITHOUT
  if (skill) {
    for (let i = 0; i < 10; i++) {
      const g = `sk-${i}`;
      const base = (arm: string, qv: number) => ({
        ...synth({ model: A, at: tick(), quality: qv, ok: qv >= 85, text: TEXTS[i % TEXTS.length]! }),
        fabric: {
          kind: 'skilltest' as const,
          arm,
          groupId: g,
          taskKey: g,
          skillId: skill.id,
          skillVersion: '1.0',
        },
      });
      log.push(base('with_skill', q(95, 1.5)));
      log.push(base('without_skill', q(80, 3)));
    }
    const st = skillTestStats(log, skill.id, '1.0');
    const d = promotionDecision(st, now);
    skills = skills.map((x) =>
      x.id === skill.id
        ? d.verdict === 'promote'
          ? promote(recordTest(x, '1.0', d, now), '1.0', now)
          : recordTest(x, '1.0', d, now)
        : x,
    );
    snap('16 · Skill validée (WITH / WITHOUT)', [
      `${st.pairs} paires : qualité ${st.quality.meanDelta?.toFixed(1)} pts ; décision ${d.verdict.toUpperCase()} (${d.reasons.join(' ; ')}). Statut : ${skills.find((x) => x.id === skill.id)?.status}.`,
    ]);
  } else snap('16 · Skill validée (WITH / WITHOUT)', ['aucune skill à tester']);
  // 17-18. A improved with the skill → champion restored
  adapted(A, 14, 95, 1.2, 1, { skills: skill ? [skill.name] : [] });
  const o17 = apply([A, B]);
  const f17 = state.families[KEY]!;
  snap('17 · A amélioré par la skill', [
    `Qualité récente de A rétablie (${o17.events.map((e) => e.kind).join(', ') || 'aucun événement'}).`,
  ]);
  snap('18 · A redevient Champion', [
    `Champion : ${f17.champion?.model} (dégradé : ${f17.champion?.degraded ? 'oui' : 'non'}). Historique : ${state.championHistory.map((e) => e.kind).join(' → ')}.`,
  ]);
  void evaluateNonInferiority;
  void experimentPairs;
  void labRows;
  return { steps, state, log };
}
