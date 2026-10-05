// JEV COGNITIVE FABRIC — runtime (browser side). Thin glue between the pure modules of
// server/jev/fabric/* and the app: the capability registry fed by the REAL tools, plugins,
// MCP servers, skills, models and GitHub client; the per-mission preparation (security,
// capability selection, skills, failure hints, learned policies, exploration); the model
// council; skill / policy actions. Nothing here simulates a connection or a result.
import { SKILL_REGISTRY } from '../../server/engine/skills';
import {
  CapabilityRegistry,
  GitHubCapabilityAdapter,
  ListAdapter,
  LocalToolsAdapter,
  explainSelection,
  requirementsOf,
  selectCapabilities,
  type Selection,
} from '../../server/jev/fabric/registry';
import { CognitiveCache } from '../../server/jev/fabric/cache';
import {
  capabilityStats,
  failureLibrary,
  strategiesFor,
  type StrategyHints,
} from '../../server/jev/fabric/memory';
import {
  MASSAMBA_MODEL_EXPERTISE_MATRIX,
  applyPolicies,
  chooseWithExploration,
  dimsOf,
  learnPolicies,
  mergePolicies,
  preferredModels,
  rankByDimension,
  type ExploreChoice,
} from '../../server/jev/fabric/learning';
import {
  classifyData,
  checkProvider,
  unknownPolicy,
  type Classification,
  type ProviderCheck,
} from '../../server/jev/fabric/security';
import {
  addVersion,
  clone,
  deprecate,
  mineCandidates,
  promote,
  recordTest,
  rollback,
  selectSkills,
  skillPrompt,
  type FabricSkill,
  type MineReport,
  type PromotionDecision,
  type SkillVersion,
} from '../../server/jev/fabric/skills';
import {
  ambiguityOf,
  evaluateAnswers,
  isFree,
  judgePrompt,
  parseJudge,
  planCouncil,
  type CouncilCandidate,
  type CouncilPlan,
  type Evaluation,
  type MemberAnswer,
} from '../../server/jev/fabric/council';
import { DEFAULT_FABRIC, type FabricSettings, type FabricTag } from '../../server/jev/fabric/types';
import { accountingOf, hashText, type CallRec } from '../../server/jev/science';
import type { JevLogEntry } from '../../server/jev/metrics';
import type { ModelInfo } from '../../shared/types';
import { redact } from '../../server/jev/provider';
import { analyzeTask } from '../../server/llm/routing';
import { BUILTIN_PLUGINS } from './builtinPlugins';
import { githubHttp, hasGithubToken } from './githubRegistry';
import { complete, friendlyError } from './llm';
import { connectedTools } from './mcp';
import { jevSettings } from './jev';
import { useStore } from './store';
import { TOOLS } from './tools';

export const fabricSettings = (): FabricSettings => ({
  ...DEFAULT_FABRIC,
  ...useStore.getState().settings.fabric,
});

// ───────────────────────── registry ─────────────────────────

export const registry = new CapabilityRegistry();
export const cognitiveCache = new CognitiveCache('1');
let wired = false;
let lastRefresh = 0;

function wire(): void {
  if (wired) return;
  wired = true;
  registry.register(new LocalToolsAdapter('direct', () => TOOLS));
  registry.register(
    new LocalToolsAdapter('plugins', () => BUILTIN_PLUGINS.flatMap((p) => p.tools), undefined, 'plugin'),
  );
  registry.register(
    new ListAdapter('mcp', 'MCP', () =>
      connectedTools(useStore.getState().mcp).map((t) => ({
        id: `mcp:${t.server}:${t.name}`,
        name: t.name,
        type: 'mcp' as const,
        description: t.description ?? '',
        risk: 'medium' as const,
        tags: ['mcp', t.server.toLowerCase()],
        supportedTaskTypes: [],
        governance: {
          permissions: ['network'],
          scope: 'external' as const,
          approvalRequired: true,
          dataAccess: true,
          writeAccess: false,
          networkAccess: true,
        },
      })),
    ),
  );
  registry.register(
    new ListAdapter('skills', 'MASSAMBA', () => [
      ...SKILL_REGISTRY.map((s) => ({
        id: `skill:engine:${s.name}`,
        name: s.name,
        type: 'skill' as const,
        description: s.description ?? s.name,
        tags: s.triggers ?? [],
        supportedTaskTypes: [] as string[],
        risk: 'none' as const,
      })),
      ...useStore
        .getState()
        .skills.map((s) => ({
          id: `skill:user:${s.name}`,
          name: s.name,
          type: 'skill' as const,
          description: s.description,
          tags: s.triggers,
          supportedTaskTypes: [] as string[],
          risk: 'none' as const,
        })),
      ...useStore
        .getState()
        .fabric.skills.map((s) => ({
          id: `skill:fabric:${s.id}`,
          name: s.name,
          type: 'skill' as const,
          description: `skill ${s.status} v${s.currentVersion}`,
          tags: s.versions.at(-1)?.triggerConditions ?? [],
          supportedTaskTypes: s.versions.at(-1)?.taskTypes ?? [],
          risk: 'none' as const,
        })),
    ]),
  );
  registry.register(
    new ListAdapter('models', 'OpenRouter', () =>
      useStore.getState().models.map((m) => ({
        id: `model:${m.id}`,
        name: m.id,
        type: 'model' as const,
        description: `${m.name}${isFree(m) ? ' (prix 0 $ — pas de disponibilité garantie)' : ''}`,
        tags: [
          m.provider,
          ...(m.capabilities.tools ? ['tools'] : []),
          ...(m.capabilities.vision ? ['vision'] : []),
        ],
        supportedTaskTypes: [] as string[],
        cost: m.inputPrice === null ? null : (m.inputPrice * 2000) / 1e6,
        risk: 'low' as const,
      })),
    ),
  );
  registry.register(
    new ListAdapter('evaluators', 'MASSAMBA', () => [
      {
        id: 'evaluator:local-qa',
        name: 'local-qa',
        type: 'evaluator' as const,
        description:
          'QA locale déterministe : format, langue, syntaxe, secrets, chiffres sans preuve, cohérence (aucun appel, 0 $).',
        tags: ['evaluator', 'qa'],
        supportedTaskTypes: ['chat', 'writing', 'data', 'code', 'research', 'document'],
        risk: 'none' as const,
        cost: 0,
      },
    ]),
  );
  registry.register(
    new GitHubCapabilityAdapter({ json: (p) => githubHttp.json(p), hasToken: hasGithubToken }),
  );
}

/** Refreshes the registry (and, on request, checks every adapter's health: GitHub does a real network call). */
export async function refreshRegistry(checkHealth = false): Promise<void> {
  wire();
  await registry.refresh(checkHealth);
  registry.setStats(capabilityStats(useStore.getState().jevLog));
  lastRefresh = Date.now();
}
/** Cheap refresh before a mission (no network): at most once a minute. */
export async function ensureRegistry(): Promise<void> {
  if (Date.now() - lastRefresh > 60_000 || !registry.size) await refreshRegistry(false);
}

// ───────────────────────── per-mission preparation ─────────────────────────

export interface FabricPrep {
  classification: Classification;
  skills: { skill: FabricSkill; version: SkillVersion }[];
  hints: StrategyHints;
  selection: Selection | null;
  model: ExploreChoice | null;
  policiesApplied: string[];
  why: string[];
}

export interface PrepareInput {
  text: string;
  attachments: string[];
  taskType: string;
  difficulty: number;
  critical: boolean;
  risk: number;
  /** Tool names the agent / mode allows. */
  availableTools: string[];
  /** Candidate models, best first (the router's order); null = the model is imposed and must not change. */
  modelCandidates: { model: string; cost: number | null }[] | null;
  budgetLeft: number | null;
  estCost: number;
  /** Test injection: skill versions forced for a Skill Lab run. */
  injectSkills?: SkillVersion[];
  rand?: () => number;
}

export function prepare(i: PrepareInput): FabricPrep {
  const st = useStore.getState();
  const s = fabricSettings();
  const log = st.jevLog;
  const classification = classifyData(i.text, i.attachments);
  const dims = dimsOf({
    task: i.taskType,
    mission: i.text,
    instruction: i.text,
    contextBefore: 0,
  } as JevLogEntry);
  const fx = applyPolicies(st.fabric.policies, { taskType: i.taskType, dims });
  const failures = cognitiveCache.memo('L5', `fail|${log.length}`, () => failureLibrary(log), {
    provenance: 'jev-log',
  }).value;
  const hints = strategiesFor(failures.strategies, { taskType: i.taskType, text: i.text });
  const why: string[] = [];
  // skills (validated only; policies may veto one)
  const picked = i.injectSkills
    ? i.injectSkills.map((v) => ({
        skill: {
          id: v.name,
          name: v.name,
          domain: v.domain,
          currentVersion: v.version,
          activeVersion: v.version,
          versions: [v],
          status: 'candidate',
          groupKey: v.name,
          createdAt: 0,
          updatedAt: 0,
        } as FabricSkill,
        version: v,
      }))
    : selectSkills(
        st.fabric.skills,
        { taskType: i.taskType, text: i.text },
        { skip: fx.skipSkills, max: 2 },
      ).map((x) => ({ skill: x.skill, version: x.version }));
  for (const p of picked)
    why.push(
      `skill ${p.version.name} v${p.version.version} : déclencheurs ${p.version.triggerConditions.slice(0, 3).join(', ')}`,
    );
  // capabilities
  const req = requirementsOf(i.taskType, i.text, i.attachments.length > 0);
  const allowed = new Set(i.availableTools);
  const excluded = new Set([...fx.excludedTools, ...hints.dropTools]);
  const selection = selectCapabilities(registry, req, {
    allowed,
    excluded,
    alwaysInclude: [
      'tools.request',
      'agent.delegate',
      'plan.propose',
      'mission.stage',
      'mission.report',
      'skill.use',
      'skill.read',
    ].filter((n) => allowed.has(n)),
    max: s.maxCapabilities,
    readOnlyTask:
      !/\b(cr[ée]e|[ée]cris|enregistre|modifie|supprime|efface)\b/i.test(i.text) && i.taskType !== 'code',
  });
  why.push(...explainSelection(selection));
  for (const a of fx.applied) why.push(`politique active : ${a}`);
  for (const m of hints.matched)
    why.push(`échec passé similaire (${m.occurrences}×) : ${m.actions.map((a) => a.kind).join(', ')}`);
  // model: learned preference + controlled exploration (never when the model is imposed)
  let model: ExploreChoice | null = null;
  if (i.modelCandidates?.length) {
    const avoid = new Set([...fx.avoid, ...hints.avoidModels]);
    const known = cognitiveCache.memo(
      'L6',
      `pref|${i.taskType}|${log.length}`,
      () => preferredModels(log, i.taskType),
      { provenance: 'jev-log' },
    ).value;
    const order = [
      ...fx.prefer,
      ...known.map((k) => k.model),
      ...i.modelCandidates.map((c) => c.model),
    ].filter(
      (m, idx, a) => a.indexOf(m) === idx && i.modelCandidates!.some((c) => c.model === m) && !avoid.has(m),
    );
    const cost = (m: string) => i.modelCandidates!.find((c) => c.model === m)?.cost ?? null;
    if (order.length) {
      model = chooseWithExploration({
        candidates: order.map((m) => ({ model: m, cost: cost(m) })),
        epsilon: s.epsilon,
        critical: i.critical,
        importance: Math.min(1, Math.max(i.difficulty, i.risk)),
        budgetLeft: i.budgetLeft,
        estCost: i.estCost,
        rand: i.rand ?? Math.random,
      });
      why.push(
        `modèle ${model.model} : ${model.reason}${known.length ? ` (mesures : ${known.length} modèle(s) évalué(s) sur ${i.taskType})` : ' (aucune mesure : ordre du routeur)'}`,
      );
    }
  }
  return { classification, skills: picked, hints, selection, model, policiesApplied: fx.applied, why };
}

/** Compact prompt addition: skills (procedure only) and failure hints. Empty string when there is nothing. */
export function promptAddition(p: FabricPrep): string {
  const parts = [...p.skills.map((x) => skillPrompt(x.version))];
  const hints = [
    ...p.hints.promptHints,
    ...(p.hints.requireVerification ? ['Vérifie ton résultat par un outil avant de conclure.'] : []),
  ];
  if (hints.length)
    parts.push(`<fabric_lessons>\n${hints.map((h) => `- ${h}`).join('\n')}\n</fabric_lessons>`);
  return parts.join('\n');
}

/** Skills only (Skill Lab runs inject the tested skill without enabling anything else). */
export const skillsAddition = (p: FabricPrep): string =>
  p.skills.map((x) => skillPrompt(x.version)).join('\n');

/** Provider check for a model against the data class (provider policies are entered by the user; unknown is never "safe"). */
export function providerCheck(
  model: ModelInfo | undefined,
  modelId: string,
  c: Classification,
): ProviderCheck {
  const provider = model?.provider ?? modelId.split('/')[0] ?? 'inconnu';
  const pol =
    useStore.getState().fabric.providerPolicies.find((p) => p.provider === provider) ??
    unknownPolicy(provider);
  return checkProvider(c.level, pol, { free: model ? isFree(model) : modelId.endsWith(':free') });
}

// ───────────────────────── log entries written by the Fabric itself ─────────────────────────

/** A complete JEV_LOG entry for runs executed by the Fabric (council members, summaries). */
export function logEntry(
  p: Partial<JevLogEntry> & Pick<JevLogEntry, 'mission' | 'task' | 'model'>,
): JevLogEntry {
  const base: JevLogEntry = {
    id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
    session: '',
    mission: '',
    task: 'chat',
    mode: jevSettings().mode,
    jev: true,
    level: 0,
    decisionBy: 'JEV-0',
    model: '',
    reason: '',
    tokensIn: 0,
    tokensOut: 0,
    cost: 0,
    jevCost: 0,
    latencyMs: 0,
    decisionMs: 0,
    calls: 1,
    quality: null,
    success: null,
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
  };
  return { ...base, ...p, mission: redact(p.mission).slice(0, 200) };
}

// ───────────────────────── model council (real calls) ─────────────────────────

export interface CouncilRun {
  plan: CouncilPlan;
  evaluation: Evaluation;
  judge: { model: string; pick: number | null; cost: number } | null;
  totalCost: number;
  winner: MemberAnswer | null;
  why: string;
  groupId: string;
}
export interface CouncilOptions {
  /** Explicit models (manual council) — else JEV chooses the size and the members. */
  models?: string[];
  mode?: 'eco' | 'balanced' | 'performance' | 'max';
  expect?: RegExp;
  signal?: AbortSignal;
  tag?: Partial<FabricTag>;
  category?: string;
}

export interface CouncilPreview {
  plan: CouncilPlan;
  type: string;
  usable: ModelInfo[];
  est: (m: ModelInfo) => number;
}
/** Plans the council WITHOUT calling any model: how many, which ones, and what the governor decided. */
export function previewCouncil(
  task: string,
  o: Pick<CouncilOptions, 'models' | 'mode'> = {},
): CouncilPreview {
  const st = useStore.getState();
  const models = st.models;
  if (!models.length) throw new Error('Catalogue de modèles vide : ouvrez Réglages.');
  const s = fabricSettings();
  const profile = analyzeTask({ text: task });
  const type = profile.type;
  const mode = o.mode ?? jevSettings().mode;
  const log = st.jevLog;
  const rank = new Map(
    rankByDimension(
      MASSAMBA_MODEL_EXPERTISE_MATRIX(log),
      type === 'code' ? 'CODING' : type === 'data' ? 'DATA_ANALYSIS' : 'REASONING',
    ).map((r) => [r.model, r.rank]),
  );
  const usable = models.filter(
    (m) => m.capabilities.tools && (m.inputPrice ?? 0) > 0 && !/:(free|batch)$/.test(m.id),
  );
  const est = (m: ModelInfo) =>
    ((m.inputPrice ?? 0) * Math.ceil(task.length / 3.8) + (m.outputPrice ?? 0) * 400) / 1e6 || 0.001;
  const picked = o.models?.length
    ? o.models.map((id) => models.find((m) => m.id === id)).filter((m): m is ModelInfo => Boolean(m))
    : [...usable]
        .sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99) || est(a) - est(b))
        .slice(0, 12);
  const cands: CouncilCandidate[] = picked.map((m) => ({
    id: m.id,
    provider: m.provider,
    estCost: est(m),
    rank: rank.get(m.id),
    free: isFree(m),
  }));
  const gain = learnPolicies({ log }).find((p) => p.kind === 'council_gate');
  const plan: CouncilPlan = o.models?.length
    ? {
        wanted: cands.length,
        size: cands.length,
        members: cands,
        decisions: [],
        evaluator: cands.length >= 3 ? 'local+judge' : 'local',
        reason: 'conseil manuel : modèles choisis par l’utilisateur',
      }
    : planCouncil({
        difficulty: profile.difficulty,
        ambiguity: ambiguityOf(task),
        risk: 0.3,
        critical: false,
        mode,
        candidates: cands,
        budgetLeft: null,
        measuredGain: gain ? Number(gain.params.gain) : null,
        valuePerPoint: s.valuePerPoint,
      });
  return { plan, type, usable, est };
}

/** The council of models on a single-turn task. Real calls: every member and the judge are billed and logged. */
export async function runCouncil(
  task: string,
  o: CouncilOptions & { preview?: CouncilPreview } = {},
): Promise<CouncilRun> {
  const st = useStore.getState();
  const models = st.models;
  const { plan, type, usable, est } = o.preview ?? previewCouncil(task, o);
  const groupId = `council-${hashText(task + Date.now())}`;
  const calls: CallRec[] = [];
  const t0 = Date.now();
  const settled = await Promise.allSettled(
    plan.members.map(async (m) => {
      const t = Date.now();
      const r = await complete(
        { model: m.id, messages: [{ role: 'user', content: task }], maxTokens: 1500, signal: o.signal },
        { models, fallbacks: [], effort: 'auto', maxRetries: 1 },
      );
      return { r, ms: Date.now() - t };
    }),
  );
  const answers: MemberAnswer[] = settled.map((x, i) => {
    const m = plan.members[i]!;
    if (x.status === 'fulfilled') {
      st.addSpend(x.value.r.cost);
      calls.push({
        kind: i === 0 ? 'main' : 'jev2',
        step: 1,
        model: m.id,
        tokensIn: x.value.r.usage.promptTokens,
        tokensOut: x.value.r.usage.completionTokens,
        cost: x.value.r.cost,
        costSource: x.value.r.costSource,
        ms: x.value.ms,
      });
      return {
        model: m.id,
        answer: x.value.r.content,
        ok: true,
        tokens: x.value.r.usage.promptTokens + x.value.r.usage.completionTokens,
        cost: x.value.r.cost,
        ms: x.value.ms,
      };
    }
    return {
      model: m.id,
      answer: '',
      ok: false,
      error: friendlyError(x.reason),
      tokens: 0,
      cost: 0,
      ms: Date.now() - t0,
    };
  });
  let evaluation = evaluateAnswers(task, answers, { expect: o.expect });
  // a paid judge only on the disputed point, only when the plan allows it and the governor agrees
  let judge: CouncilRun['judge'] = null;
  if (
    !evaluation.consensus &&
    evaluation.disputes.length &&
    plan.evaluator === 'local+judge' &&
    evaluation.members.filter((m) => m.ok).length >= 2
  ) {
    const jm = usable.sort((a, b) => est(a) - est(b))[0];
    if (jm) {
      try {
        const r = await complete(
          {
            model: jm.id,
            messages: [{ role: 'user', content: judgePrompt(task, evaluation) }],
            maxTokens: 10,
            signal: o.signal,
          },
          { models, fallbacks: [], effort: 'auto', maxRetries: 0 },
        );
        st.addSpend(r.cost);
        calls.push({
          kind: 'jev2',
          step: 2,
          model: jm.id,
          tokensIn: r.usage.promptTokens,
          tokensOut: r.usage.completionTokens,
          cost: r.cost,
          costSource: r.costSource,
          ms: 0,
        });
        const okMembers = evaluation.members.filter((m) => m.ok);
        const pick = parseJudge(r.content, okMembers.length);
        judge = { model: jm.id, pick, cost: r.cost };
        if (pick !== null && !o.expect)
          evaluation = {
            ...evaluation,
            winner: okMembers[pick]!,
            why: `${evaluation.why} ; juge ${jm.id} (point contesté seulement) : réponse ${String.fromCharCode(65 + pick)}`,
          };
      } catch {
        judge = null;
      }
    }
  }
  const total = calls.reduce((a, c) => a + c.cost, 0);
  const tag = (arm: string): FabricTag => ({
    kind: 'council',
    arm,
    groupId,
    category: o.category ?? type,
    models: plan.members.map((m) => m.id),
    ...o.tag,
  });
  const exp = (e: MemberAnswer) => (o.expect ? o.expect.test(e.answer) : null);
  // one entry per member (so each model's expertise is learnt from real answers)…
  const entries: JevLogEntry[] = evaluation.members.map((m) =>
    logEntry({
      mission: task,
      task: type,
      model: m.model,
      success: m.ok ? (exp(m) ?? (m.qa ? m.qa.score >= 75 : null)) : false,
      qualityMeasured: m.qa?.score ?? null,
      qualityVector: m.qa ? { ...m.qa.vector } : undefined,
      qualitySource: 'local-qa',
      tokensIn: m.tokens,
      cost: m.cost,
      latencyMs: m.ms,
      acct: accountingOf([
        {
          kind: 'main',
          step: 1,
          model: m.model,
          tokensIn: m.tokens,
          tokensOut: 0,
          cost: m.cost,
          costSource: 'measured',
          ms: m.ms,
        },
      ]),
      instruction: redact(task).slice(0, 4000),
      answer: redact(m.answer).slice(0, 4000),
      failureNote: m.error ? redact(m.error).slice(0, 200) : undefined,
      config: {
        model: m.model,
        skills: [],
        capabilities: [],
        tools: [],
        memory: [],
        evaluator: 'local-qa',
        councilSize: 1,
        strategy: 'council-member',
        jev: 'off',
        fabric: true,
        explored: false,
        why: [],
      },
      fabric: tag('member'),
    }),
  );
  // …and one for the council itself (its true total cost, extra members and judge counted as JEV overhead)
  if (evaluation.winner) {
    const w = evaluation.winner;
    entries.push(
      logEntry({
        mission: task,
        task: type,
        model: w.model,
        success: o.expect ? o.expect.test(w.answer) : w.qa ? w.qa.score >= 75 : null,
        qualityMeasured: w.qa?.score ?? null,
        qualityVector: w.qa ? { ...w.qa.vector } : undefined,
        qualitySource: 'local-qa',
        tokensIn: calls.filter((c) => c.kind === 'main').reduce((a, c) => a + c.tokensIn, 0),
        cost: calls.filter((c) => c.kind === 'main').reduce((a, c) => a + c.cost, 0),
        jevCost: calls.filter((c) => c.kind === 'jev2').reduce((a, c) => a + c.cost, 0),
        latencyMs: Date.now() - t0,
        acct: accountingOf(calls),
        instruction: redact(task).slice(0, 4000),
        answer: redact(w.answer).slice(0, 4000),
        config: {
          model: w.model,
          skills: [],
          capabilities: [],
          tools: [],
          memory: [],
          evaluator: judge ? 'local-qa+judge' : 'local-qa',
          councilSize: plan.size,
          strategy: 'model-council',
          jev: 'full',
          fabric: true,
          explored: false,
          why: [plan.reason, evaluation.why],
        },
        fabric: tag('council'),
      }),
    );
  }
  for (const e of entries) st.addJevLog(e);
  return {
    plan,
    evaluation,
    judge,
    totalCost: total,
    winner: evaluation.winner,
    why: evaluation.why,
    groupId,
  };
}

/** Is a request suitable for the in-mission council (single turn, no tool, no attachment)? */
export function councilEligible(text: string, attachments: string[]): boolean {
  if (attachments.length) return false;
  const t = analyzeTask({ text }).type;
  return (
    (t === 'chat' || t === 'writing') &&
    !/\b(fichier|dossier|ouvre|lis|cr[ée]e|[ée]cris dans|ex[ée]cute|web|internet|recherche)\b/i.test(text)
  );
}

// ───────────────────────── skills & policies: actions ─────────────────────────

const fab = () => useStore.getState().fabric;
const setSkills = (skills: FabricSkill[]) => useStore.getState().setFabric({ skills });

/** Mines candidate skills from the real runs; only new groups are added (as candidates, never active). */
export function mineSkillsNow(): MineReport {
  const r = mineCandidates({ log: useStore.getState().jevLog, existing: fab().skills });
  if (r.candidates.length) setSkills([...fab().skills, ...r.candidates]);
  cognitiveCache.invalidate('L4');
  return r;
}
export function addDistilled(skills: FabricSkill[]): number {
  const fresh = skills.filter((s) => !fab().skills.some((x) => x.groupKey === s.groupKey));
  if (fresh.length) setSkills([...fab().skills, ...fresh]);
  cognitiveCache.invalidate('L4');
  return fresh.length;
}
const update = (id: string, f: (s: FabricSkill) => FabricSkill) => {
  setSkills(fab().skills.map((s) => (s.id === id ? f(s) : s)));
  cognitiveCache.invalidate('L4');
};
export const skillActions = {
  promote: (id: string, version: string) => update(id, (s) => promote(s, version)),
  rollback: (id: string) => update(id, (s) => rollback(s)),
  deprecate: (id: string) => update(id, (s) => deprecate(s)),
  recordTest: (id: string, version: string, d: PromotionDecision) =>
    update(id, (s) => recordTest(s, version, d)),
  newVersion: (id: string, patch: Partial<SkillVersion>, reason: string) =>
    update(id, (s) => addVersion(s, patch, reason)),
  clone: (id: string, name: string) => {
    const s = fab().skills.find((x) => x.id === id);
    if (s) setSkills([...fab().skills, clone(s, name)]);
  },
};

/** Re-learns the policies from the JEV_LOG, keeping the user's decisions (activation, rollback). */
export function relearnPolicies(): number {
  const learned = learnPolicies({ log: useStore.getState().jevLog });
  useStore.getState().setFabric({ policies: mergePolicies(fab().policies, learned) });
  cognitiveCache.invalidate();
  return learned.length;
}
let sinceLearn = 0;
/** After every run: re-learn every 10 runs when the Fabric is on (cheap, local). */
export function afterRun(): void {
  if (!fabricSettings().enabled) return;
  if (++sinceLearn >= 10) {
    sinceLearn = 0;
    relearnPolicies();
  }
}
