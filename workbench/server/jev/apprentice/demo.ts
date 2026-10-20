// APPRENTICE SUPREMACY — reproducible DEMONSTRATION of the whole cycle on the family IFRS9_ANALYSIS.
// ⚠ SIMULATED TEST ONLY: the runs below are SYNTHETIC records generated here, run through the REAL engine functions
// (registry, validation, champions, routing, ladder, failure learning, Teacher ROI, payback). They are never written to
// the real JEV_LOG and never presented as measurements of a real model.
import type { JevLogEntry } from '../metrics';
import { accountingOf, type CallRec } from '../science';
import { freePool, type FreeModel } from '../fabric/council';
import type { ModelInfo } from '../../../shared/types';
import { DEFAULT_APPRENTICE, type ApprenticeSettings, type ApprenticeTag } from './types';
import { taskDnaOf } from './dna';
import { FallbackController } from './router';
import { routeApprentice, type SupremacyPlan } from './ladder';
import {
  champions as championsOf,
  familyRecord,
  validateRecord,
  premiumReference,
  rankApprentices,
} from './supremacy';
import { failureSignatureOf, learningOf, correctionFor } from './failure';
import { apprenticePayback, futureReuseValue, teacherROI } from './payback';

export const SIMULATED_LABEL = 'SIMULATED TEST ONLY';
export const DEMO_FAMILY = 'data:ifrs9';
const GEMMA = 'google/gemma-demo:free';
const NEMO = 'nvidia/nemotron-demo:free';
const PREMIUM = 'premium/astra-demo';

const free = (id: string, provider: string): FreeModel => ({
  id,
  name: id,
  provider,
  contextLength: 128_000,
  tools: true,
  vision: false,
  structuredOutputs: true,
  reasoning: true,
});
export const DEMO_POOL: FreeModel[] = [free(GEMMA, 'google'), free(NEMO, 'nvidia')];

const TEXTS = [
  'Calcule la provision ECL IFRS9 du portefeuille corporate par stage',
  'Analyse la migration de Stage 1 vers Stage 2 sur le trimestre et ses provisions',
  'Quel est le taux de couverture IFRS9 par segment ? détaille les écarts',
  'Réconcilie les provisions IFRS9 avec le grand livre et signale les écarts',
  'Prépare le tableau des expositions Stage 3 et de la perte attendue',
  'Évalue l impact du changement de PD sur les provisions ECL du portefeuille',
];

let seq = 0;
function synth(o: {
  model: string;
  at: number;
  ok: boolean;
  quality: number;
  text: string;
  adapted: boolean;
  arm?: ApprenticeTag['arm'];
  path?: string[];
  cost?: number;
  failure?: ApprenticeTag['failure'];
  teacherCost?: number;
  champion?: boolean;
}): JevLogEntry {
  const calls: CallRec[] = [
    {
      kind: 'main',
      step: 1,
      model: o.model,
      tokensIn: 9000,
      tokensOut: 800,
      cost: o.cost ?? 0,
      costSource: 'measured',
      ms: 10,
    },
  ];
  const acct = accountingOf(calls);
  const tag: ApprenticeTag = {
    active: true,
    adapted: o.adapted,
    family: DEMO_FAMILY,
    path: o.path ?? [o.model],
    threshold: 0.9,
    gateScore: o.quality / 100,
    accepted: o.ok && o.quality >= 90,
    adaptationMs: 6,
    tokensAdded: 320,
    skills: [],
    experiences: 0,
    toolsExposed: 6,
    contextReduction: null,
    predictedSuccess: null,
    confidence: 'MEDIUM',
    why: [SIMULATED_LABEL],
    arm: o.arm,
    failure: o.failure,
    teacher: o.teacherCost ? o.path?.at(-1) : undefined,
    teacherCost: o.teacherCost,
    champion: o.champion,
  };
  return {
    id: `demo${seq++}`,
    at: o.at,
    session: 'demo',
    mission: o.text,
    instruction: o.text,
    task: 'data',
    mode: 'balanced',
    jev: true,
    level: 1,
    decisionBy: 'JEV-0',
    model: o.model,
    reason: SIMULATED_LABEL,
    tokensIn: 9000,
    tokensOut: 800,
    cost: o.cost ?? 0,
    jevCost: 0,
    latencyMs: o.model === PREMIUM ? 4200 : 1900,
    decisionMs: 2,
    calls: 1,
    quality: o.quality,
    success: o.ok,
    retries: 0,
    escalations: 0,
    corrections: 0,
    cacheHits: 0,
    toolsOffered: 6,
    toolsBaseline: 40,
    toolTokens: 1,
    toolTokensBaseline: 1,
    contextBefore: 0,
    contextAfter: 0,
    checkpoints: [],
    acct,
    qualityMeasured: o.quality,
    toolsUsed: ['data.query'],
    toolCallCount: 2,
    apprentice: tag,
  } as JevLogEntry;
}

export interface DemoStep {
  n: number;
  title: string;
  /** What the engine decided at this step (real engine output on synthetic data). */
  lines: string[];
  status: string;
  champion: string | null;
}

/** Runs the 15-step cycle. `now` is injectable for reproducibility. */
export function runSupremacyDemo(now = Date.UTC(2026, 9, 5)): DemoStep[] {
  seq = 0;
  const day = 86_400_000;
  const s: ApprenticeSettings = { ...DEFAULT_APPRENTICE, enabled: true };
  const log: JevLogEntry[] = [];
  const dna = taskDnaOf(
    { text: TEXTS[0]!, taskType: 'data', difficulty: 0.3, criticality: 'normal', tools: ['tools'] },
    s,
  );
  const pool = DEMO_POOL;
  const out: DemoStep[] = [];
  const statusOf = (m = GEMMA) => {
    const runs = log.filter((e) => e.model === m && e.apprentice);
    return validateRecord(familyRecord(runs, m, DEMO_FAMILY, s.validation, now), 'normal', s.validation);
  };
  const plan = (): SupremacyPlan =>
    routeApprentice({
      dna: { ...dna, task_family: DEMO_FAMILY, domain: 'ifrs9' },
      settings: s,
      profiles: [],
      pool,
      log,
      now,
    });
  const push = (title: string, lines: string[]) => {
    const ch = championsOf(log, pool, { settings: s, now })[0];
    out.push({
      n: out.length + 1,
      title,
      lines: [SIMULATED_LABEL, ...lines],
      status: statusOf().status,
      champion: ch?.supremacy ? ch.model : null,
    });
  };
  const premiumRuns = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      synth({
        model: PREMIUM,
        at: now - 40 * day + i * day,
        ok: true,
        quality: 97,
        text: TEXTS[i % TEXTS.length]!,
        adapted: false,
        cost: 0.08,
      }),
    );

  // 1. No apprentice
  let p = plan();
  push('1 · Aucun Apprentice', [
    `Aucune expérience : route = ${p.route.toUpperCase()} (niveau ${p.level}).`,
    `Statut Gemma : ${statusOf().status} — ${statusOf().reasons[0] ?? ''}`,
  ]);
  // 2. Free model, no JEV
  log.push(
    synth({
      model: GEMMA,
      at: now - 35 * day,
      ok: true,
      quality: 74,
      text: TEXTS[0]!,
      adapted: false,
      arm: 'free',
    }),
  );
  push('2 · Modèle gratuit seul (sans JEV)', [
    `1 mission sans adaptation : le bras de référence ne compte pas comme preuve d'apprenti.`,
    `Statut : ${statusOf().status}.`,
  ]);
  // 3-4. JEV adaptation → success
  for (let i = 0; i < 3; i++)
    log.push(
      synth({
        model: GEMMA,
        at: now - (33 - i) * day,
        ok: true,
        quality: 92,
        text: TEXTS[i]!,
        adapted: true,
      }),
    );
  p = plan();
  push('3-4 · Adaptation JEV et réussite', [
    `3 missions adaptées réussies (qualité 92).`,
    `Statut : ${statusOf().status} ; route = ${p.route.toUpperCase()} (niveau ${p.level}).`,
  ]);
  // 5. repeat missions (3 formulations min)
  for (let i = 0; i < 3; i++)
    log.push(
      synth({
        model: GEMMA,
        at: now - (28 - i * 2) * day,
        ok: i !== 1,
        quality: i === 1 ? 82 : 94,
        text: TEXTS[(i + 3) % TEXTS.length]!,
        adapted: true,
      }),
    );
  const rec = familyRecord(
    log.filter((e) => e.model === GEMMA && e.apprentice),
    GEMMA,
    DEMO_FAMILY,
    s.validation,
    now,
  );
  push('5 · Missions répétées', [
    `n = ${rec.n} (${rec.sample}), formulations = ${rec.formulations}, réussite ${((rec.success ?? 0) * 100).toFixed(1)} %, qualité ${rec.quality?.toFixed(1)}.`,
    `Statut : ${statusOf().status} — ${statusOf().reasons.join(' ; ') || 'critères remplis'}.`,
  ]);
  // 6. skill accumulation
  push('6 · Accumulation de skills', [
    'Skill candidate « ifrs9-reconciliation » extraite des réussites répétées (provenance : missions adaptées) ; sa promotion exige le test AVEC/SANS du Skill Lab.',
  ]);
  // 7-8. validation → champion
  for (let i = 0; i < 7; i++)
    log.push(
      synth({
        model: GEMMA,
        at: now - (14 - i) * day,
        ok: true,
        quality: 95,
        text: TEXTS[(i + 2) % TEXTS.length]!,
        adapted: true,
      }),
    );
  log.push(...premiumRuns(5));
  const v = statusOf();
  push('7 · Validation', [
    ...v.checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.label} : ${c.actual} (requis ${c.required})`),
    `Statut : ${v.status}.`,
  ]);
  const ch = championsOf(log, pool, { settings: s, now })[0];
  push('8 · Promotion CHAMPION', [
    ch
      ? `CURRENT CHAMPION FOR ${ch.family} : ${ch.model} — ${ch.status}, qualité ${ch.quality?.toFixed(1)}, réussite ${((ch.success ?? 0) * 100).toFixed(1)} %, n = ${ch.n} (${ch.sample}), confiance ${ch.confidence}.`
      : 'Aucun champion.',
    ch?.premiumDelta != null
      ? `Référence premium ${ch.premium?.model} : ${ch.quality?.toFixed(1)} % mesuré vs ${ch.premium?.quality?.toFixed(1)} % (${ch.premiumDelta.toFixed(1)} points).`
      : 'Référence premium : N/A.',
  ]);
  // 9-11. future mission → champion selected, premium not called
  p = plan();
  push('9-10 · Nouvelle mission de la même famille', [
    `Route = ${p.route.toUpperCase()}, niveau ${p.level}, modèle ${p.chosen?.id}.`,
    ...p.explain.slice(0, 3),
    `Échelle : ${p.attempts.map((a) => a.label).join(' → ')}`,
  ]);
  log.push(
    synth({
      model: GEMMA,
      at: now - 1 * day,
      ok: true,
      quality: 95,
      text: TEXTS[5]!,
      adapted: true,
      champion: true,
    }),
  );
  const pay = apprenticePayback(log, DEMO_FAMILY, GEMMA);
  push('11 · Aucune dépense premium', [
    `Mission acceptée par le champion : le modèle premium n'est pas appelé.`,
    `Appels premium évités : ${pay.premiumCallsAvoided} ; coût évité estimé ${pay.avoidedCost === null ? 'N/A' : `${pay.avoidedCost.toFixed(4)} $`} (${pay.note}).`,
  ]);
  // 12-13. failure injection → ladder → learning
  const sig = failureSignatureOf([
    { kind: 'format', what: 'JSON demandé mais invalide', dimension: 'instruction_following' },
  ]);
  const fc = new FallbackController(p);
  const steps = [fc.current!.label];
  for (let k = 0; k < 4 && !fc.escalatedToV5; k++) steps.push(fc.next('CORRECT', 0.6).label);
  push('12 · Échec injecté et repli intelligent', [
    `APPRENTICE FAILED — ${sig} → correction ${correctionFor(sig).name}.`,
    `Échelle suivie (sans répéter la même tentative) : ${steps.join(' → ')}.`,
  ]);
  const fl = learningOf({ signature: sig, path: [GEMMA, PREMIUM], success: true, teacher: PREMIUM });
  const roi = teacherROI({
    family: DEMO_FAMILY,
    immediateGain: 0.0006,
    teacherCost: 0.08,
    futureReuseValue: futureReuseValue(log, DEMO_FAMILY, s.horizonDays, now).value,
  });
  push("13 · Apprentissage de l'échec", [
    `Signature ${fl.signature}, correction ${fl.correction}, fallback ${fl.fallbackModel}, issue ${fl.outcome}.`,
    `Teacher ROI : ${roi.reason} ${roi.roi === null ? '' : `(ROI ${roi.roi.toFixed(1)}x)`}`,
    'Le succès premium devient une skill candidate (pattern de correction), testée avant promotion.',
  ]);
  // 14-15. degradation → revalidation
  for (let i = 0; i < 4; i++)
    log.push(
      synth({
        model: GEMMA,
        at: now + i * 1000,
        ok: false,
        quality: 55,
        text: TEXTS[i]!,
        adapted: true,
        path: [GEMMA, PREMIUM],
      }),
    );
  const d = statusOf();
  p = plan();
  push('14 · Dégradation détectée', [
    `Statut : ${d.status} (${d.reasons.slice(0, 2).join(' ; ')}).`,
    `Il perd la priorité : route = ${p.route.toUpperCase()}, niveau ${p.level}.`,
  ]);
  for (let i = 0; i < 40; i++)
    log.push(
      synth({
        model: GEMMA,
        at: now + 10_000 + i * 1000,
        ok: true,
        quality: 95,
        text: TEXTS[i % TEXTS.length]!,
        adapted: true,
      }),
    );
  const r2 = statusOf();
  p = plan();
  push('15 · Revalidation', [
    `Après 40 missions réussies : statut ${r2.status}${r2.reasons.length ? ` (${r2.reasons.slice(0, 3).join(' ; ')})` : ''}.`,
    `Route = ${p.route.toUpperCase()}, niveau ${p.level}.`,
    `Candidats classés : ${rankApprentices({
      dna: { ...dna, task_family: DEMO_FAMILY, domain: 'ifrs9' },
      settings: s,
      log,
      pool,
      now,
    })
      .map((c) => `${c.model}=${c.status}`)
      .join(', ')}`,
  ]);
  void premiumReference;
  void freePool;
  void ({} as ModelInfo);
  return out;
}
