// JEV EXPERIENCE MEMORY, FAILURE REPLAY, INTELLIGENCE GRAPH, COGNITIVE CONFIGURATIONS.
// Everything is derived from the JEV_LOG (real runs). Nothing is invented: a field that was
// not recorded is null / empty, and a statistic needs real samples.
import { keywords } from '../live';
import { redact } from '../provider';
import { scrubSecrets } from './security';
import type { JevLogEntry } from '../metrics';
import { hashText } from '../science';
import type { CapStats } from './registry';

/** Text of a run with secrets removed and long random-looking tokens dropped (safe for keywords, skills, memory). */
export const safeText = (e: { instruction?: string; mission: string }): string =>
  scrubSecrets(e.instruction ?? e.mission).replace(/\b[A-Za-z0-9_-]{20,}\b/g, ' ');

const num = (x: number | null | undefined) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);

/** Judged quality of a run: the scientific measure when present, else JEV's own (null = not measured). */
export const qualityOfEntry = (e: JevLogEntry): number | null => num(e.qualityMeasured) ?? num(e.quality);
const totalCost = (e: JevLogEntry) => e.acct?.totalCost ?? e.cost + e.jevCost;

// ───────────────────────── experiences ─────────────────────────

export type ExperienceClass = 'success' | 'failure' | 'near-miss' | 'correction';

export interface Experience {
  id: string;
  at: number;
  /** Redacted task signature (first characters of the mission). */
  task: string;
  taskType: string;
  difficulty: number | null;
  risk: string | null;
  model: string;
  tools: string[];
  skills: string[];
  strategy: string;
  configKey: string;
  success: boolean | null;
  quality: number | null;
  cost: number;
  latencyMs: number;
  errors: string[];
  corrections: number;
  retries: number;
  escalations: number;
  classes: ExperienceClass[];
  cause: string | null;
  solution: string | null;
  /** 0..1: how reusable this experience is (judged, has a configuration, has a clear outcome). */
  reusability: number;
}

export function configKeyOf(e: JevLogEntry): string {
  const c = e.config;
  const fams = [...new Set((c?.tools ?? e.toolsUsed ?? []).map((t) => t.split('.')[0]!))].sort();
  return [
    e.model || c?.model || '?',
    (c?.skills ?? e.skillsUsed ?? []).slice().sort().join('+') || '-',
    fams.join('+') || '-',
    c?.evaluator ?? '-',
    `c${c?.councilSize ?? 1}`,
  ].join('|');
}

export function classify(e: JevLogEntry): ExperienceClass[] {
  const out: ExperienceClass[] = [];
  const q = qualityOfEntry(e);
  const rough = e.retries > 0 || e.escalations > 0 || (q !== null && q < 75);
  if (e.success === false) out.push('failure');
  if (e.corrections > 0) out.push('correction');
  if (e.success !== false && rough) out.push('near-miss');
  // A clean success: judged successful, no correction, nothing rough.
  if (e.success === true && !e.corrections && !rough) out.push('success');
  return out;
}

/** Why a run failed or went badly — heuristic localisation from what was recorded (never from a model's claim). */
export function causeOf(e: JevLogEntry): { cause: string; stage: string } | null {
  const bad =
    e.success === false ||
    e.corrections > 0 ||
    e.retries > 0 ||
    e.escalations > 0 ||
    (qualityOfEntry(e) ?? 100) < 75;
  if (!bad) return null;
  if ((e.toolErrorCount ?? 0) > 0 || (e.toolErrors?.length ?? 0) > 0)
    return { cause: 'tool', stage: 'exécution des outils' };
  if (e.stopReason)
    return {
      cause: /budget|coût|temps/i.test(e.stopReason) ? 'routing' : 'reasoning',
      stage: `arrêt : ${e.stopReason.slice(0, 60)}`,
    };
  if (e.driftEvents?.length) return { cause: 'routing', stage: 'dérive économique en cours d’exécution' };
  if (e.retries > 0) return { cause: 'model', stage: 'indisponibilité / bascule de modèle' };
  if (e.failureNote && /429|rate|quota|limit/i.test(e.failureNote))
    return { cause: 'model', stage: 'limite de débit du fournisseur' };
  const v = e.qualityVector;
  if (v) {
    const dims = Object.entries(v)
      .filter(([k]) => k !== 'safety' || true)
      .sort((a, b) => a[1] - b[1]);
    const [dim, val] = dims[0] ?? ['correctness', 1];
    if (val < 0.9) {
      const map: Record<string, string> = {
        correctness: 'reasoning',
        completeness: 'context',
        instruction_following: 'instruction',
        style: 'format',
        safety: 'instruction',
        tool_accuracy: 'tool',
        code_quality: 'code',
        factuality: 'data',
        efficiency: 'routing',
        consistency: 'reasoning',
      };
      return { cause: map[dim] ?? 'reasoning', stage: `qualité : ${dim} ${(val * 100).toFixed(0)} %` };
    }
  }
  if (e.escalations > 0) return { cause: 'model', stage: 'escalade vers un modèle plus fort' };
  return { cause: 'reasoning', stage: 'réponse non conforme au contrôle de réussite' };
}

const SOLUTION: Record<string, string> = {
  tool: 'vérifier les arguments des outils, retirer l’outil défaillant, exiger une vérification après usage',
  model: 'éviter ce modèle pour ce type de tâche ou prévoir un secours ; limiter la concurrence',
  reasoning: 'décomposer en étapes, exiger une vérification, envisager un second modèle',
  instruction: 'rappeler le contrat de sortie en tête de consigne et le vérifier avant de répondre',
  format: 'imposer le format de sortie et le valider localement',
  data: 'exiger des preuves pour chaque chiffre (lecture d’outil) avant de conclure',
  code: 'exécuter le code et tester avant de répondre',
  context: 'lire d’abord les fichiers pertinents ; enrichir le contexte utile',
  routing: 'relever le palier ou le budget, ou découper la mission',
};

export function toExperience(e: JevLogEntry): Experience {
  const c = causeOf(e);
  const classes = classify(e);
  const q = qualityOfEntry(e);
  const judged = e.success !== null;
  return {
    id: e.id,
    at: e.at,
    task: redact(e.instruction ?? e.mission).slice(0, 160),
    taskType: e.task,
    difficulty: num(e.experiment?.difficulty),
    risk: e.experiment?.risk ?? null,
    model: e.model,
    tools: e.toolsUsed ?? e.config?.tools ?? [],
    skills: e.skillsUsed ?? e.config?.skills ?? [],
    strategy: e.config?.strategy ?? e.decisionBy,
    configKey: configKeyOf(e),
    success: e.success,
    quality: q,
    cost: totalCost(e),
    latencyMs: e.latencyMs,
    errors: (e.toolErrors ?? []).slice(-3),
    corrections: e.corrections,
    retries: e.retries,
    escalations: e.escalations,
    classes,
    cause: c?.cause ?? null,
    solution: c ? (SOLUTION[c.cause] ?? null) : null,
    reusability:
      Math.round(
        ((judged ? 0.4 : 0) +
          (e.config ? 0.3 : 0) +
          (q !== null ? 0.2 : 0) +
          ((e.toolsUsed?.length ?? 0) > 0 ? 0.1 : 0)) *
          100,
      ) / 100,
  };
}

/** Real runs only: fabric experiments (tournament, council, skill tests…) count as experience too. */
export const experiencesOf = (log: JevLogEntry[]): Experience[] => log.map(toExperience);

export interface Memories {
  success: Experience[];
  failure: Experience[];
  nearMiss: Experience[];
  correction: Experience[];
  tool: { tool: string; uses: number; failures: number; successRate: number | null }[];
  model: {
    model: string;
    runs: number;
    successRate: number | null;
    quality: number | null;
    cost: number | null;
  }[];
  skill: { skill: string; runs: number; successRate: number | null }[];
  routing: {
    taskType: string;
    model: string;
    runs: number;
    successRate: number | null;
    escalations: number;
  }[];
}

export function memories(log: JevLogEntry[]): Memories {
  const ex = experiencesOf(log);
  const byClass = (c: ExperienceClass) => ex.filter((x) => x.classes.includes(c));
  const group = <T>(keys: (e: JevLogEntry) => T[]) => {
    const m = new Map<T, JevLogEntry[]>();
    for (const e of log) for (const k of keys(e)) m.set(k, [...(m.get(k) ?? []), e]);
    return m;
  };
  const rate = (es: JevLogEntry[]) => {
    const j = es.filter((e) => e.success !== null);
    return j.length ? j.filter((e) => e.success).length / j.length : null;
  };
  const tool = [...group((e) => e.toolsUsed ?? [])].map(([t, es]) => {
    const failed = es.filter(
      (e) =>
        (e.toolErrors ?? []).some((x) => x.startsWith(`${t}:`)) ||
        (e.success === false && (e.toolErrorCount ?? 0) > 0),
    );
    return { tool: t, uses: es.length, failures: failed.length, successRate: rate(es) };
  });
  const model = [...group((e) => [e.model])].map(([m, es]) => ({
    model: m,
    runs: es.length,
    successRate: rate(es),
    quality: mean(es.map(qualityOfEntry).filter((x): x is number => x !== null)),
    cost: mean(es.map(totalCost)),
  }));
  const skill = [...group((e) => e.skillsUsed ?? [])].map(([s, es]) => ({
    skill: s,
    runs: es.length,
    successRate: rate(es),
  }));
  const rk = group((e) => [`${e.task}|${e.model}`]);
  const routing = [...rk].map(([k, es]) => ({
    taskType: k.split('|')[0]!,
    model: k.split('|')[1]!,
    runs: es.length,
    successRate: rate(es),
    escalations: sum(es.map((e) => e.escalations)),
  }));
  return {
    success: byClass('success'),
    failure: byClass('failure'),
    nearMiss: byClass('near-miss'),
    correction: byClass('correction'),
    tool,
    model,
    skill,
    routing,
  };
}

/** Per-capability measured statistics (mission-level: latency and cost are those of the missions that used it). */
export function capabilityStats(log: JevLogEntry[]): Map<string, CapStats> {
  const m = new Map<string, JevLogEntry[]>();
  for (const e of log) for (const t of e.toolsUsed ?? []) m.set(t, [...(m.get(t) ?? []), e]);
  const out = new Map<string, CapStats>();
  for (const [t, es] of m) {
    const judged = es.filter((e) => e.success !== null);
    const sr = judged.length ? judged.filter((e) => e.success).length / judged.length : null;
    out.set(t, {
      samples: es.length,
      successRate: sr,
      failureRate: sr === null ? null : 1 - sr,
      averageLatency: mean(es.map((e) => e.latencyMs)),
      averageCost: mean(es.map(totalCost)),
      lastUsed: Math.max(...es.map((e) => e.at)),
      usedBy: [...new Set(es.map((e) => e.task))].slice(0, 6),
    });
  }
  return out;
}

// ───────────────────────── "Ai-je déjà rencontré ce problème ?" ─────────────────────────

export interface SimilarMatch {
  exp: Experience;
  similarity: number;
}
export interface SeenAnswer {
  seen: boolean;
  matches: SimilarMatch[];
  failures: number;
  successes: number;
  summary: string;
  /** Solutions that worked (successes) and corrective actions (failures), deduplicated. */
  advice: string[];
}

const jac = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  return i / (a.size + b.size - i);
};

export function findSimilar(
  log: JevLogEntry[],
  query: string,
  o: { taskType?: string; k?: number; minSimilarity?: number } = {},
): SeenAnswer {
  const q = keywords(query);
  const k = o.k ?? 5;
  const min = o.minSimilarity ?? 0.2;
  const scored = log
    .map((e) => {
      const x = toExperience(e);
      const sim =
        jac(q, keywords(`${safeText(e)} ${e.task}`)) + (o.taskType && e.task === o.taskType ? 0.1 : 0);
      return { exp: x, similarity: Math.min(1, sim) };
    })
    .filter((m) => m.similarity >= min)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
  const failures = scored.filter((m) => m.exp.classes.includes('failure')).length;
  const successes = scored.filter((m) => m.exp.classes.includes('success')).length;
  const advice = [
    ...new Set(scored.flatMap((m) => (m.exp.solution ? [`${m.exp.cause} : ${m.exp.solution}`] : []))),
  ];
  const best = scored
    .filter((m) => m.exp.success)
    .sort((a, b) => (b.exp.quality ?? 0) - (a.exp.quality ?? 0))[0];
  if (best)
    advice.unshift(
      `a fonctionné : ${best.exp.model}${best.exp.tools.length ? ` + ${best.exp.tools.slice(0, 4).join(', ')}` : ''} (qualité ${best.exp.quality ?? 'NON MESURÉE'}, ${best.exp.cost.toFixed(4)} $)`,
    );
  return {
    seen: scored.length > 0,
    matches: scored,
    failures,
    successes,
    advice,
    summary: scored.length
      ? `Oui : ${scored.length} expérience(s) similaire(s) — ${successes} réussite(s), ${failures} échec(s).`
      : 'Non : aucune expérience similaire enregistrée (rien n’est supposé).',
  };
}

// ───────────────────────── failure replay ─────────────────────────

export interface FailureSignature {
  id: string;
  taskType: string;
  stage: string;
  cause: string;
  model: string;
  dominantTool: string | null;
  skills: string[];
  /** The JEV decisions (checkpoints) recorded during the failing run. */
  decisionTrail: string[];
  /** The hypothesis, as a plain statement (a heuristic, not a verdict). */
  hypothesis: string;
}
export interface StrategyAction {
  kind:
    | 'avoid_model'
    | 'add_prompt_hint'
    | 'require_verification'
    | 'council'
    | 'raise_tier'
    | 'read_first'
    | 'run_tests'
    | 'decompose'
    | 'drop_tool';
  value?: string;
}
export interface CorrectiveStrategy {
  id: string;
  signatureId: string;
  taskType: string;
  actions: StrategyAction[];
  rationale: string;
  /** Number of failing runs with this signature. */
  occurrences: number;
  lastSeen: number;
  /** n / (n + 3): grows with repetition; a single failure gives a low confidence. */
  confidence: number;
  /** Keywords of the failing missions (to recognise a similar next mission). */
  keywords: string[];
  examples: string[];
}

const ACTIONS: Record<string, (s: FailureSignature) => StrategyAction[]> = {
  tool: (s) => [
    { kind: 'require_verification' },
    {
      kind: 'add_prompt_hint',
      value: `Vérifie les arguments avant d'appeler ${s.dominantTool ?? 'les outils'} et contrôle son résultat.`,
    },
    ...(s.dominantTool ? [{ kind: 'drop_tool' as const, value: s.dominantTool }] : []),
  ],
  model: (s) => [{ kind: 'avoid_model', value: s.model }],
  reasoning: () => [
    { kind: 'decompose' },
    { kind: 'council' },
    { kind: 'add_prompt_hint', value: 'Décompose en étapes et vérifie chaque résultat intermédiaire.' },
  ],
  instruction: () => [
    {
      kind: 'add_prompt_hint',
      value: 'Respecte strictement le format et les contraintes demandés ; relis-les avant de répondre.',
    },
  ],
  format: () => [{ kind: 'add_prompt_hint', value: 'Produis exactement le format de sortie demandé.' }],
  data: () => [
    { kind: 'require_verification' },
    { kind: 'add_prompt_hint', value: 'Chaque chiffre doit provenir d’un résultat d’outil ; sinon dis-le.' },
  ],
  code: () => [
    { kind: 'run_tests' },
    { kind: 'add_prompt_hint', value: 'Exécute le code et vérifie le résultat avant de répondre.' },
  ],
  context: () => [
    { kind: 'read_first' },
    { kind: 'add_prompt_hint', value: 'Lis d’abord les fichiers pertinents avant de répondre.' },
  ],
  routing: () => [{ kind: 'raise_tier' }, { kind: 'decompose' }],
};

export function signatureOf(e: JevLogEntry): FailureSignature | null {
  const c = causeOf(e);
  if (!c) return null;
  // Only real problems become failure signatures (a clean success with slightly low quality does not).
  if (e.success !== false && e.corrections === 0 && e.retries === 0 && e.escalations === 0) return null;
  const tools = e.toolsUsed ?? [];
  const errTool = (e.toolErrors ?? []).map((x) => x.split(':')[0]!).find(Boolean) ?? null;
  const dominantTool = errTool ?? tools[tools.length - 1] ?? null;
  const trail = e.checkpoints
    .map((k) => `${k.name}: ${k.decision}`)
    .filter((d) => /STOP|REPLAN|ESCALAT|CORRECT|DRIFT|SWITCH|REMOVE|RETRY|QA/i.test(d))
    .slice(0, 12);
  return {
    id: hashText(`${e.task}|${c.cause}|${c.stage.split(':')[0]}|${e.model}|${dominantTool ?? ''}`),
    taskType: e.task,
    stage: c.stage,
    cause: c.cause,
    model: e.model,
    dominantTool,
    skills: e.skillsUsed ?? [],
    decisionTrail: trail,
    hypothesis: `Hypothèse (heuristique) : cause « ${c.cause} » à l'étape « ${c.stage} » avec ${e.model}${dominantTool ? ` et ${dominantTool}` : ''}.`,
  };
}

/** Aggregates failing runs into signatures and corrective strategies. */
export function failureLibrary(log: JevLogEntry[]): {
  signatures: FailureSignature[];
  strategies: CorrectiveStrategy[];
} {
  const bySig = new Map<string, { sig: FailureSignature; runs: JevLogEntry[] }>();
  for (const e of log) {
    const s = signatureOf(e);
    if (!s) continue;
    const cur = bySig.get(s.id);
    if (cur) cur.runs.push(e);
    else bySig.set(s.id, { sig: s, runs: [e] });
  }
  const strategies: CorrectiveStrategy[] = [];
  for (const { sig, runs } of bySig.values()) {
    const kw = new Map<string, number>();
    for (const r of runs) for (const w of keywords(safeText(r))) kw.set(w, (kw.get(w) ?? 0) + 1);
    const top = [...kw]
      .filter(([, n]) => n >= Math.max(1, Math.ceil(runs.length * 0.5)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([w]) => w);
    // A model-level rule needs repetition: one bad run is not a verdict on a model.
    const actions = (ACTIONS[sig.cause] ?? ACTIONS.reasoning!)(sig).filter(
      (a) => a.kind !== 'avoid_model' || runs.length >= 2,
    );
    strategies.push({
      id: `cs-${sig.id}`,
      signatureId: sig.id,
      taskType: sig.taskType,
      actions: actions.length
        ? actions
        : [
            {
              kind: 'add_prompt_hint',
              value: 'Vérifie ta réponse par rapport au contrôle de réussite avant de la donner.',
            },
          ],
      rationale: `${runs.length} échec(s) / correction(s) de type « ${sig.cause} » (${sig.stage}) : ${SOLUTION[sig.cause] ?? 'vérification renforcée'}.`,
      occurrences: runs.length,
      lastSeen: Math.max(...runs.map((r) => r.at)),
      confidence: Math.round((runs.length / (runs.length + 3)) * 100) / 100,
      keywords: top,
      examples: runs.slice(-2).map((r) => redact(r.instruction ?? r.mission).slice(0, 100)),
    });
  }
  return { signatures: [...bySig.values()].map((x) => x.sig), strategies };
}

export interface StrategyHints {
  matched: CorrectiveStrategy[];
  avoidModels: string[];
  promptHints: string[];
  requireVerification: boolean;
  councilBoost: boolean;
  raiseTier: boolean;
  dropTools: string[];
}
/** What the next similar mission should do differently (exploited by the runtime when the Fabric is on). */
export function strategiesFor(
  strategies: CorrectiveStrategy[],
  task: { taskType: string; text: string },
  o: { minConfidence?: number } = {},
): StrategyHints {
  const q = keywords(task.text);
  const matched = strategies
    .filter(
      (s) =>
        s.taskType === task.taskType &&
        s.confidence >= (o.minConfidence ?? 0.25) &&
        (s.keywords.length === 0 ||
          s.keywords.filter((k) => q.has(k)).length >= Math.min(2, s.keywords.length)),
    )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
  const acts = matched.flatMap((s) => s.actions);
  return {
    matched,
    avoidModels: [...new Set(acts.filter((a) => a.kind === 'avoid_model').map((a) => a.value!))],
    promptHints: [...new Set(acts.filter((a) => a.kind === 'add_prompt_hint').map((a) => a.value!))].slice(
      0,
      3,
    ),
    requireVerification: acts.some((a) => a.kind === 'require_verification' || a.kind === 'run_tests'),
    councilBoost: acts.some((a) => a.kind === 'council'),
    raiseTier: acts.some((a) => a.kind === 'raise_tier'),
    dropTools: [...new Set(acts.filter((a) => a.kind === 'drop_tool').map((a) => a.value!))],
  };
}

// ───────────────────────── cognitive configurations & graph ─────────────────────────

export interface ConfigStat {
  taskType: string;
  configKey: string;
  runs: number;
  successRate: number | null;
  quality: number | null;
  cost: number | null;
  latencyMs: number | null;
  /** quality-weighted success per dollar, only when everything is measured. */
  valuePerDollar: number | null;
}

export function configStats(log: JevLogEntry[]): ConfigStat[] {
  const m = new Map<string, JevLogEntry[]>();
  for (const e of log)
    m.set(`${e.task}§${configKeyOf(e)}`, [...(m.get(`${e.task}§${configKeyOf(e)}`) ?? []), e]);
  return [...m].map(([k, es]) => {
    const j = es.filter((e) => e.success !== null);
    const sr = j.length ? j.filter((e) => e.success).length / j.length : null;
    const q = mean(es.map(qualityOfEntry).filter((x): x is number => x !== null));
    const c = mean(es.map(totalCost));
    return {
      taskType: k.split('§')[0]!,
      configKey: k.split('§')[1]!,
      runs: es.length,
      successRate: sr,
      quality: q,
      cost: c,
      latencyMs: mean(es.map((e) => e.latencyMs)),
      valuePerDollar: sr !== null && q !== null && c && c > 0 ? (sr * q) / c : null,
    };
  });
}

export function bestConfigs(stats: ConfigStat[], taskType: string, minRuns = 3): ConfigStat[] {
  return stats
    .filter((s) => s.taskType === taskType && s.runs >= minRuns && s.successRate !== null)
    .sort(
      (a, b) =>
        b.successRate! - a.successRate! ||
        (b.quality ?? 0) - (a.quality ?? 0) ||
        (a.cost ?? 9) - (b.cost ?? 9),
    );
}

/** A configuration that worked at least `minSuccess` times with a success rate ≥ `minRate` becomes a reusable strategy. */
export function reusableStrategies(
  stats: ConfigStat[],
  o: { minRuns?: number; minRate?: number } = {},
): ConfigStat[] {
  return stats.filter((s) => s.runs >= (o.minRuns ?? 3) && (s.successRate ?? 0) >= (o.minRate ?? 0.8));
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: string;
  runs: number;
  successRate: number | null;
  cost: number | null;
  quality: number | null;
}
/** TASK ↔ MODEL ↔ SKILL ↔ TOOL ↔ STRATEGY ↔ RESULT ↔ ERROR ↔ CORRECTION, with the measured weight of each edge. */
export function intelligenceGraph(
  log: JevLogEntry[],
  strategies: CorrectiveStrategy[] = [],
): { nodes: string[]; edges: GraphEdge[] } {
  const acc = new Map<string, { from: string; to: string; relation: string; es: JevLogEntry[] }>();
  const add = (from: string, to: string, relation: string, e: JevLogEntry) => {
    const k = `${from}→${to}|${relation}`;
    const cur = acc.get(k);
    if (cur) cur.es.push(e);
    else acc.set(k, { from, to, relation, es: [e] });
  };
  for (const e of log) {
    const t = `task:${e.task}`;
    add(t, `model:${e.model}`, 'résolu par', e);
    for (const s of e.skillsUsed ?? []) add(t, `skill:${s}`, 'aidé par', e);
    for (const x of new Set(e.toolsUsed ?? [])) add(t, `tool:${x}`, 'utilise', e);
    if (e.config?.strategy) add(t, `strategy:${e.config.strategy}`, 'stratégie', e);
    add(
      t,
      e.success === null ? 'result:non jugé' : e.success ? 'result:succès' : 'result:échec',
      'résultat',
      e,
    );
    const c = causeOf(e);
    if (c && e.success === false) add(t, `error:${c.cause}`, 'erreur', e);
  }
  const edges: GraphEdge[] = [...acc.values()].map(({ from, to, relation, es }) => {
    const j = es.filter((e) => e.success !== null);
    return {
      from,
      to,
      relation,
      runs: es.length,
      successRate: j.length ? j.filter((e) => e.success).length / j.length : null,
      cost: mean(es.map(totalCost)),
      quality: mean(es.map(qualityOfEntry).filter((x): x is number => x !== null)),
    };
  });
  for (const s of strategies)
    edges.push({
      from: `error:${s.actions.length ? s.signatureId : ''}`,
      to: `correction:${s.actions.map((a) => a.kind).join('+')}`,
      relation: 'corrigé par',
      runs: s.occurrences,
      successRate: null,
      cost: null,
      quality: null,
    });
  return { nodes: [...new Set(edges.flatMap((e) => [e.from, e.to]))], edges };
}

/** Best (model, skill, tool) combinations measured for a task type — the data behind « quelle configuration cognitive ? ». */
export function bestCombos(log: JevLogEntry[], taskType: string, minRuns = 3): ConfigStat[] {
  return bestConfigs(configStats(log), taskType, minRuns).slice(0, 5);
}
