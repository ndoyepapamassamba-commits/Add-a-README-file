import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createTwoFilesPatch } from 'diff';
import { z } from 'zod';
import type {
  AgentEvent,
  AgentMode,
  ApprovalRequest,
  EffortSetting,
  PlanStep,
  RoleId,
  RunEventEnvelope,
  RunStatus,
  RunSummary,
  ToolResultPayload,
  UsageTotals,
} from '@shared/types';
import { LLMError, type ChatMessage, type ToolCall } from '../llm/types';
import { BudgetExceededError } from '../llm/service';
import { classifyWithJev, pickFromTier, selectModel } from '../llm/router';
import {
  ADVERSARIAL_TASK,
  ENGINE_DOCTRINE,
  ShadowMonitor,
  detectRules,
  manualPrompt,
  parseChallenge,
  planStrategy,
  regressionSuite,
  shadowMessage,
  similarMissions,
  strategyPrompt,
  taskDna,
  unsupportedNumbers,
  type LedgerEntry,
  type ShadowAlert,
  type TaskDna,
} from './intelligence';
import {
  FAMILY_TIER,
  TIER_LABEL,
  analyzeTask,
  recordHealth,
  recordTypedOutcome,
  routeModel,
  type HealthMap,
  type LeaderboardMap,
} from '../llm/routing';
import {
  FINAL_REVIEW_TASK,
  MEMORY_INSTRUCTIONS,
  MISSION_PROTOCOL,
  formatReport,
  reviewApproved,
  type MissionReport,
} from './mission';
import { setMissionHooks } from '../tools/mission';
import { cascadeNext, decideRoute, qaScore, type RoutingDecision } from '../engine/decision';
import { selectSkills, skillsPrompt } from '../engine/skills';
import { buildLoadout } from '../engine/loadout';
import { decide } from '../security/permissions';
import { redactDeep, redactSecrets } from '../security/redact';
import type { Services } from '../services/container';
import { ConflictError, NotFoundError } from '../services/workspace';
import {
  ALL_TOOLS,
  dynamicToolNames,
  getTool,
  setDynamicTools,
  toolDefinitions,
  toLlmName,
} from '../tools/registry';
import { mcpToolDef } from '../tools/mcp';
import type { ToolContext, ToolOutput } from '../tools/types';
import { ROLES, agentModelPreference, resolveRole } from './roles';
import {
  PLAN_MODE_INSTRUCTIONS,
  buildSystemPrompt,
  buildUserContent,
  elideOldToolOutputs,
  estimateTokens,
  repairHistory,
  transcriptForSummary,
  turnBoundaries,
  type UiContext,
} from './context';

export interface StartRunInput {
  sessionId: string;
  text: string;
  attachments?: string[];
  model?: string;
  effort?: EffortSetting;
  role?: RoleId;
  agentMode?: AgentMode;
  ui?: UiContext;
  title?: string;
  /** Skills explicitly selected for this request. */
  skills?: string[];
}

const KNOWN_TOOLS = new Set(ALL_TOOLS.map((t) => t.name));

interface Decision {
  decision: 'approve' | 'deny';
  note?: string;
  remember?: boolean;
}

interface RunState {
  id: string;
  sessionId: string;
  projectId: string;
  parentRunId: string | null;
  role: RoleId;
  depth: number;
  abort: AbortController;
  seq: number;
  startedAt: number;
  usage: UsageTotals;
  plan: PlanStep[];
  approvals: Map<string, (d: Decision) => void>;
  planDecision: ((d: { decision: 'approve' | 'cancel'; steps?: string[] }) => void) | null;
  proposed: { summary: string; steps: string[] } | null;
  forward?: (e: AgentEvent) => void;
  model: string;
  status: RunStatus;
}

const NOT_PERSISTED = new Set<AgentEvent['type']>(['text_delta', 'thinking', 'stream_reset']);
const MAX_TOOL_OUTPUT = 40_000;
const FORWARDED_FROM_CHILD = new Set<AgentEvent['type']>([
  'tool_call',
  'tool_result',
  'approval_required',
  'approval_resolved',
  'file_changed',
]);

function truncateForUi(value: unknown, max = 4000): unknown {
  if (typeof value === 'string')
    return value.length > max ? `${value.slice(0, max)}…[${value.length - max} more chars]` : value;
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => truncateForUi(v, max));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, truncateForUi(v, max)]));
  return value;
}

function clipForModel(text: string): string {
  if (text.length <= MAX_TOOL_OUTPUT) return text;
  return `${text.slice(0, MAX_TOOL_OUTPUT * 0.6)}\n…[${text.length - MAX_TOOL_OUTPUT} chars omitted]…\n${text.slice(-MAX_TOOL_OUTPUT * 0.4)}`;
}

function parseStepsFromText(text: string): string[] {
  const steps = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^(\d+[.)]|[-*•])\s+/.test(l))
    .map((l) => l.replace(/^(\d+[.)]|[-*•])\s+/, '').trim())
    .filter(Boolean);
  return steps.length ? steps.slice(0, 30) : ['Exécuter la demande'];
}

/**
 * Runs agents: model selection, the agent loop (plan → act → observe →
 * verify), tool execution with permissions/approvals, sub-agents, budgets,
 * context compaction and the persisted, replayable event stream.
 */
export class AgentOrchestrator extends EventEmitter {
  private active = new Map<string, RunState>();
  private approvalIndex = new Map<string, string>();
  /** Observed model reliability (drives AUTO routing away from failing models). */
  health: HealthMap = {};
  /** Personal leaderboard: missions won / lost per model (and per task type), persisted. */
  get board(): LeaderboardMap {
    return this.s.brain.board;
  }
  set board(b: LeaderboardMap) {
    this.s.brain.setBoard(b);
  }
  /** Specialists delegated to by each top-level run (learning). */
  private teams = new Map<string, Set<string>>();

  constructor(private readonly s: Services) {
    super();
    this.setMaxListeners(200);
  }

  // ── public API ────────────────────────────────────────────────────────
  activeRuns(): string[] {
    return [...this.active.keys()];
  }

  activeRunForSession(sessionId: string): string | null {
    for (const r of this.active.values()) if (r.sessionId === sessionId && !r.parentRunId) return r.id;
    return null;
  }

  async start(input: StartRunInput): Promise<RunSummary> {
    const session = this.s.repo.getSession(input.sessionId);
    if (!session) throw new NotFoundError('Session not found');
    if (this.activeRunForSession(session.id))
      throw new ConflictError('A task is already running in this session. Stop it or wait.');
    this.s.workspace.getProject(session.projectId);
    if (!input.text.trim()) throw new ConflictError('Empty request');
    const settings = this.s.repo.getSessionSettings(session.id);
    const role = input.role ?? settings.role ?? 'general';
    const requested = input.model || session.model || this.s.settings.get().defaultModel;
    if (input.model && input.model !== session.model)
      this.s.repo.updateSession(session.id, { model: input.model });
    const id = randomUUID();
    const title = (input.title ?? input.text).split('\n')[0]!.slice(0, 120);
    this.s.repo.createRun({
      id,
      sessionId: session.id,
      projectId: session.projectId,
      parentRunId: null,
      role,
      title,
      model: requested,
      mode: input.agentMode ?? 'chat',
    });
    const state = this.createState({
      id,
      sessionId: session.id,
      projectId: session.projectId,
      parentRunId: null,
      role,
      depth: 0,
      model: requested,
    });
    void this.execute(state, { ...input, role, model: requested }, { ephemeral: false }).catch((err) => {
      // execute() handles its own errors; this is a last-resort guard.
      console.error('run crashed', err);
    });
    return this.s.repo.getRun(id)!;
  }

  cancel(runId: string): boolean {
    const st = this.active.get(runId);
    if (!st) return false;
    st.abort.abort(new Error('Cancelled by user'));
    for (const resolve of st.approvals.values()) resolve({ decision: 'deny', note: 'cancelled' });
    st.planDecision?.({ decision: 'cancel' });
    return true;
  }

  resolveApproval(approvalId: string, d: Decision): boolean {
    const runId = this.approvalIndex.get(approvalId);
    const st = runId ? this.active.get(runId) : undefined;
    const resolve = st?.approvals.get(approvalId);
    if (!resolve) return false;
    resolve(d);
    return true;
  }

  resolvePlan(runId: string, decision: 'approve' | 'cancel', steps?: string[]): boolean {
    const st = this.active.get(runId);
    if (!st?.planDecision) return false;
    st.planDecision({ decision, steps });
    return true;
  }

  /** Replays persisted events after `afterSeq`, then streams live ones. */
  subscribe(runId: string, afterSeq: number, listener: (e: RunEventEnvelope) => void): () => void {
    const buffer: RunEventEnvelope[] = [];
    let replaying = true;
    let last = afterSeq;
    const live = (e: RunEventEnvelope) => {
      if (replaying) buffer.push(e);
      else if (e.seq > last) {
        last = e.seq;
        listener(e);
      }
    };
    this.on(`run:${runId}`, live);
    for (const e of this.s.repo.listRunEvents(runId, afterSeq)) {
      last = Math.max(last, e.seq);
      listener(e);
    }
    replaying = false;
    for (const e of buffer)
      if (e.seq > last) {
        last = e.seq;
        listener(e);
      }
    return () => this.off(`run:${runId}`, live);
  }

  isActive(runId: string): boolean {
    return this.active.has(runId);
  }

  /** "Review my work": a reviewer agent (ideally another model) checks the session's changes. */
  async review(sessionId: string, opts: { model?: string; focus?: string } = {}): Promise<RunSummary> {
    const session = this.s.repo.getSession(sessionId);
    if (!session) throw new NotFoundError('Session not found');
    const changes = this.s.repo.listChanges({ sessionId }).filter((c) => c.status !== 'reverted');
    const root = this.s.workspace.projectRoot(session.projectId);
    let diff = '';
    if (changes.length) {
      diff = changes
        .map((c) =>
          c.op === 'move'
            ? `rename ${c.before} → ${c.after}\n`
            : createTwoFilesPatch(`a/${c.path}`, `b/${c.path}`, c.before ?? '', c.after ?? '', '', '', {
                context: 3,
              }),
        )
        .join('\n');
    } else if (this.s.git.isRepo(root)) diff = await this.s.git.diff(root);
    diff = redactSecrets(diff);
    const files = [...new Set(changes.map((c) => `${c.op} ${c.path} (+${c.added} −${c.removed})`))];
    const text = [
      'Review the work done in this session as an independent reviewer.',
      opts.focus ? `Focus: ${opts.focus}` : '',
      files.length
        ? `Changed files:\n${files.join('\n')}`
        : 'No changes were recorded by the agent in this session; review the current working tree.',
      diff ? `Diff:\n\`\`\`diff\n${diff.slice(0, 60_000)}\n\`\`\`` : '',
      'Check: correctness and errors, regressions, consistency with the rest of the code, tests (run them if possible), security issues. Report findings by severity with file:line and concrete fixes. Do not modify files.',
    ]
      .filter(Boolean)
      .join('\n\n');
    let model = opts.model || this.s.settings.get().reviewModel;
    if (!model) {
      const models = await this.s.catalog.list().catch(() => []);
      const other = models.filter((m) => m.id !== session.model);
      model = pickFromTier(other, this.s.settings.get().autoTiers.reasoning, { tools: true })?.id ?? 'auto';
    }
    return this.start({
      sessionId,
      text,
      role: 'reviewer',
      model,
      agentMode: 'chat',
      title: 'Review my work',
    });
  }

  /** Summarises older conversation turns to free context (also used by /compact). */
  async compactSession(sessionId: string): Promise<{ before: number; after: number }> {
    if (this.activeRunForSession(sessionId))
      throw new ConflictError('Cannot compact while a task is running');
    const stored = this.s.repo.listMessages(sessionId);
    const messages = stored.map((m) => m.content as ChatMessage);
    const before = estimateTokens(messages);
    const compacted = await this.summarizeOldTurns(messages, sessionId, null, 1);
    this.s.repo.replaceMessages(
      sessionId,
      compacted.map((m) => ({ runId: null, role: m.role, content: m })),
    );
    return { before, after: estimateTokens(compacted) };
  }

  // ── internals ─────────────────────────────────────────────────────────
  private createState(p: {
    id: string;
    sessionId: string;
    projectId: string;
    parentRunId: string | null;
    role: RoleId;
    depth: number;
    model: string;
  }): RunState {
    const st: RunState = {
      ...p,
      abort: new AbortController(),
      seq: Math.max(0, this.s.repo.maxRunEventSeq(p.id) + 1),
      startedAt: Date.now(),
      usage: { promptTokens: 0, completionTokens: 0, cost: 0 },
      plan: [],
      approvals: new Map(),
      planDecision: null,
      proposed: null,
      status: 'running',
    };
    this.active.set(p.id, st);
    return st;
  }

  private emitEvent(st: RunState, event: AgentEvent): void {
    const seq = st.seq++;
    const ts = Date.now();
    const safe = redactDeep(event);
    if (!NOT_PERSISTED.has(safe.type)) this.s.repo.addRunEvent(st.id, seq, ts, safe);
    const env: RunEventEnvelope = { seq, runId: st.id, ts, event: safe };
    this.emit(`run:${st.id}`, env);
    this.emit('event', env);
    st.forward?.(safe);
  }

  private setStatus(st: RunState, status: RunStatus): void {
    st.status = status;
    this.s.repo.updateRun(st.id, { status });
  }

  private async summarizeOldTurns(
    messages: ChatMessage[],
    sessionId: string,
    runId: string | null,
    keepTurns: number,
  ): Promise<ChatMessage[]> {
    const system = messages[0]?.role === 'system' ? [messages[0]] : [];
    const body = system.length ? messages.slice(1) : messages;
    const bounds = turnBoundaries(body);
    if (bounds.length <= keepTurns) return messages;
    const cut = bounds[bounds.length - keepTurns]!;
    const old = body.slice(0, cut);
    const recent = body.slice(cut);
    const models = await this.s.catalog.list().catch(() => []);
    const model =
      pickFromTier(models, this.s.settings.get().autoTiers.fast)?.id ??
      this.s.settings.get().fallbackModel ??
      'openai/gpt-4o-mini';
    const res = await this.s.llm.complete(
      {
        model,
        messages: [
          {
            role: 'user',
            content: `Summarise this agent conversation so the work can continue seamlessly. Keep: user goals and instructions, decisions, files created/modified (paths), commands run and their outcomes, open problems and next steps, important facts. Be dense and factual (max ~800 words).\n\n${transcriptForSummary(old)}`,
          },
        ],
        maxTokens: 2000,
        temperature: 0,
      },
      { runId, sessionId },
    );
    return [
      ...(system as ChatMessage[]),
      { role: 'user', content: `[Summary of the earlier conversation]\n${res.content}` },
      { role: 'assistant', content: 'Understood — continuing from this summary.' },
      ...recent,
    ];
  }

  private async execute(
    st: RunState,
    input: StartRunInput,
    opts: { ephemeral: boolean },
  ): Promise<{ status: RunStatus; summary: string }> {
    const s = this.s;
    const repo = s.repo;
    const appSettings = s.settings.get();
    const session = repo.getSession(st.sessionId)!;
    const project = s.workspace.getProject(st.projectId);
    const role = await resolveRole(st.role, s.skills, KNOWN_TOOLS);
    const agentMode: AgentMode = input.agentMode ?? 'chat';
    let finalText = '';
    let status: RunStatus = 'completed';
    let errorMessage: string | null = null;
    let shadowRef: ShadowMonitor | null = null;
    let stepsDone = 0;
    let learning: { dna: TaskDna; tier: string; mission: boolean; report: MissionReport | null } | null =
      null;

    this.emitEvent(st, {
      type: 'run_started',
      runId: st.id,
      sessionId: st.sessionId,
      role: st.role,
      mode: agentMode,
      parentRunId: st.parentRunId ?? undefined,
      title: (input.title ?? input.text).split('\n')[0]!.slice(0, 120),
      userText: input.text,
      attachments: input.attachments ?? [],
      permissionMode: session.permissionMode,
    });
    this.setStatus(st, 'running');

    try {
      // 1. Model selection (AUTO router or explicit choice)
      const models = await s.catalog.list().catch(() => s.catalog.all);
      const history = opts.ephemeral
        ? []
        : repairHistory(repo.listMessages(st.sessionId).map((m) => m.content as ChatMessage));
      const hasImages = (input.attachments ?? []).some((p) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(p));
      // Plugins (MCP): connect enabled servers (bounded wait) and expose their tools.
      if (appSettings.mcp.autoConnect) {
        await Promise.race([
          s.mcp.ensureConnected(),
          new Promise((r) => setTimeout(r, appSettings.mcp.connectTimeoutSec * 1000)),
        ]);
      }
      setDynamicTools(
        s.mcp.tools().map((t) => mcpToolDef(t, (srv, tool) => s.mcp.isAutoApproved(srv, tool))),
      );
      const jevOn = appSettings.jev.enabled && (await s.jev.check()).ok;

      const pref = agentModelPreference(role.model);
      const requestedModel = input.model && input.model !== 'auto' ? input.model : (pref.id ?? 'auto');
      const tiers = pref.tier
        ? {
            ...appSettings.autoTiers,
            balanced: appSettings.autoTiers[pref.tier],
            fast: appSettings.autoTiers[pref.tier],
          }
        : appSettings.autoTiers;
      const classified =
        requestedModel === 'auto' && jevOn && appSettings.jev.routing && !pref.tier
          ? await classifyWithJev(s.jev, {
              text: input.text,
              hasImages,
              role: st.role,
              historyLength: history.length,
            })
          : null;
      const sel = selectModel({
        classified: classified && classified.confidence >= 0.35 ? classified : null,
        requested: requestedModel,
        models,
        tiers,
        signals: {
          text: input.text,
          hasImages,
          role: role.custom ? 'general' : st.role,
          historyLength: history.length,
        },
        fallbackDefault: appSettings.fallbackModel || 'openai/gpt-4o-mini',
      });
      if (pref.id && requestedModel === pref.id) sel.reason = `modèle défini par l'agent ${role.label}`;
      const mission = agentMode === 'mission';
      const profile = analyzeTask({
        text: input.text,
        attachmentNames: input.attachments ?? [],
        hasImages,
        role: st.role,
        historyTokens: estimateTokens(history),
        mission,
      });
      // MASSAMBA Intelligence Engine: Task DNA → Strategy (learnt from the ledger).
      const top = st.depth === 0 && !opts.ephemeral;
      const dna = taskDna(input.text, input.attachments ?? [], profile);
      const strategy = top ? planStrategy(dna, profile, s.brain.ledger, { mission }) : null;
      const learnt = Boolean(strategy && /appris|critique|exploration/.test(strategy.tierReason));
      if (strategy && !pref.tier) profile.tier = strategy.tier;
      if (top) learning = { dna, tier: profile.tier, mission, report: null };
      if (top) {
        const added = s.brain.addRules(
          detectRules(input.text).map((r) => ({ ...r, source: 'auto' as const })),
        );
        if (added.length)
          this.emitEvent(st, {
            type: 'intel',
            title: 'Manuel personnel : règle mémorisée',
            tone: 'ok',
            lines: added.map((r) => r.rule),
          });
      }
      if (strategy)
        this.emitEvent(st, {
          type: 'intel',
          title: `Stratégie — ${TIER_LABEL[strategy.tier]} · criticité ${dna.criticality}`,
          tone: strategy.explore ? 'warn' : 'info',
          lines: [
            `ADN : ${dna.type}, complexité ${Math.round(dna.complexity * 100)} %${dna.risks.length ? `, risques ${dna.risks.join(', ')}` : ''}${dna.outputs.length ? `, livrables ${dna.outputs.join(', ')}` : ''}`,
            `Palier : ${strategy.tierReason}`,
            `Vérifications : ${[strategy.verify.qa && 'QA', strategy.verify.evidence && 'preuves des chiffres', strategy.verify.adversarial && 'red team', strategy.verify.judge && 'juge final', 'shadow'].filter(Boolean).join(' · ')}`,
            ...(strategy.team.length ? [`Équipe : ${strategy.team.join(' → ')}`] : []),
            `Mémoire : ${similarMissions(s.brain.ledger, dna).length} mission(s) similaire(s), ${strategy.pitfalls.length} piège(s) connu(s)`,
          ],
        });
      if (top) this.teams.set(st.id, new Set());
      let routedFallbacks: string[] = [];
      let routed: ReturnType<typeof routeModel> = null;
      if (sel.auto) {
        const useJev = classified && classified.confidence >= 0.35 && classified.tier !== 'vision';
        routed = routeModel(
          models,
          tiers,
          pref.tier
            ? { ...profile, tier: FAMILY_TIER[pref.tier] }
            : useJev && !learnt
              ? { ...profile, tier: FAMILY_TIER[classified.tier] }
              : profile,
          this.health,
          this.board,
        );
        if (routed) {
          sel.model = routed.model;
          sel.reason = `${routed.reason}${useJev ? ' (Jev)' : ''}`;
          routedFallbacks = routed.fallbacks;
        }
      }
      let model = sel.model;
      st.model = model;
      repo.updateRun(st.id, { model });
      const info = s.catalog.get(model);
      const effort =
        (input.effort && input.effort !== 'auto' ? input.effort : (role.effort as EffortSetting | null)) ??
        'auto';
      this.emitEvent(st, {
        type: 'model_selected',
        model,
        reason: sel.reason,
        auto: sel.auto,
        effort: effort === 'auto' ? undefined : effort,
        tier: routed?.tier,
        fallbacks: [...new Set([...s.llm.fallbackChain(sel.model).slice(1), ...routedFallbacks])].filter(
          (m) => m !== sel.model,
        ),
        estimate: routed?.estimate ?? null,
      });
      const vision = info?.capabilities.vision ?? hasImages;
      const contextLimit = info?.contextLength || 128_000;
      const contextBudget = Math.min(Math.floor(contextLimit * 0.7), 400_000);

      // 2. Tools for this role / mode / depth
      const maxDepth = appSettings.agent.maxSubagentDepth;
      let fullTools = role.tools.filter((t) => t !== 'agent.delegate' || st.depth < maxDepth);
      if (session.permissionMode === 'safe') {
        fullTools = fullTools.filter(
          (t) =>
            ![
              'filesystem.write',
              'filesystem.edit',
              'filesystem.multi_edit',
              'filesystem.delete',
              'filesystem.move',
              'git.commit',
              'data.transform',
              'memory.add',
              'memory.doc',
              'report.export',
              'memory.remove',
              'artifact.create',
              'code.run',
              'terminal.kill',
            ].includes(t),
        );
      }
      if (!jevOn) fullTools = fullTools.filter((t) => t !== 'jev.judge');
      const mcpNames = dynamicToolNames();
      if (mcpNames.length && session.permissionMode !== 'safe') {
        const patterns = role.toolPatterns;
        const allowed =
          patterns === null
            ? mcpNames
            : mcpNames.filter((n) =>
                patterns.some(
                  (p) => p === n || p === 'mcp.*' || (p.endsWith('.*') && n.startsWith(p.slice(0, -1))),
                ),
              );
        fullTools = [...fullTools, ...allowed];
      }
      if (mission) {
        fullTools = [
          ...new Set([
            ...fullTools,
            'mission.stage',
            'mission.report',
            'plan.update',
            ...(session.permissionMode === 'safe' ? [] : ['memory.doc']),
          ]),
        ];
        if (st.depth < maxDepth && !fullTools.includes('agent.delegate')) fullTools.push('agent.delegate');
      }
      const planningTools = [
        ...fullTools.filter((t) => getTool(t)?.readOnly || t === 'project.analyze'),
        'plan.propose',
      ];
      let phase: 'planning' | 'executing' = agentMode === 'plan' ? 'planning' : 'executing';

      // 3. Skills: pinned (session) + selected (request) + agent's + auto-detected
      const skillCfg = appSettings.skills;
      const sessionSkills = opts.ephemeral ? [] : (repo.getSessionSettings(st.sessionId).skills ?? []);
      const activation = new Map<
        string,
        { reason: 'pinned' | 'manual' | 'agent' | 'auto'; matched?: string[] }
      >();
      for (const n of input.skills ?? []) activation.set(n, { reason: 'manual' });
      for (const n of sessionSkills) if (!activation.has(n)) activation.set(n, { reason: 'pinned' });
      for (const n of role.skills) if (!activation.has(n)) activation.set(n, { reason: 'agent' });
      if (skillCfg.autoActivate && skillCfg.maxAuto > 0) {
        const matches = await s.skills.match(input.text, skillCfg.disabled).catch(() => []);
        for (const m of matches.slice(0, skillCfg.maxAuto))
          if (!activation.has(m.name))
            activation.set(m.name, { reason: 'auto', matched: m.matched.slice(0, 3) });
      }
      if (skillCfg.autoActivate && skillCfg.maxAuto > 0 && jevOn && appSettings.jev.skills) {
        const autoCount = [...activation.values()].filter((a) => a.reason === 'auto').length;
        const candidates = (await s.skills.list().catch(() => []))
          .filter((k) => !skillCfg.disabled.includes(k.name) && !activation.has(k.name) && k.description)
          .slice(0, 60);
        if (candidates.length && autoCount < skillCfg.maxAuto) {
          const questions = Object.fromEntries(
            candidates.map((k, i) => [
              `s${i}`,
              {
                type: 'noul' as const,
                instructions: {
                  skill: { name: k.name, description: k.description.slice(0, 700) },
                  question:
                    "Does the user's `request` fall within the scope of `skill`, so that following this skill's instructions is needed to answer it well?",
                },
              },
            ]),
          );
          try {
            const r = await s.jev.evaluate({ request: input.text.slice(0, 6000) }, questions);
            const ranked = candidates
              .map((k, i) => ({
                name: k.name,
                p: (r.answers[`s${i}`] as { noul?: number } | undefined)?.noul ?? 0,
              }))
              .filter((x) => x.p >= appSettings.jev.threshold)
              .sort((a, b) => b.p - a.p)
              .slice(0, skillCfg.maxAuto - autoCount);
            for (const x of ranked)
              activation.set(x.name, { reason: 'auto', matched: [`Jev ${Math.round(x.p * 100)} %`] });
          } catch {
            /* keyword detection already applied */
          }
        }
      }
      const activeSkills: { name: string; body: string; files: string[] }[] = [];
      for (const name of activation.keys()) {
        try {
          const sk = await s.skills.get(name);
          activeSkills.push({ name: sk.name, body: await s.skills.body(name), files: sk.files });
        } catch {
          activation.delete(name);
        }
      }
      if (activation.size)
        this.emitEvent(st, {
          type: 'skills_activated',
          skills: [...activation.entries()].map(([name, a]) => ({ name, ...a })),
        });
      const allSkills = skillCfg.showCatalog
        ? (await s.skills.list().catch(() => [])).filter((x) => !skillCfg.disabled.includes(x.name))
        : [];
      const customAgents = fullTools.includes('agent.delegate')
        ? await s.skills.listAgents().catch(() => [])
        : [];

      // 4. Messages
      const contextMd = await s.memory.contextMarkdown(st.projectId);
      const system = buildSystemPrompt({
        role,
        permissionMode: session.permissionMode,
        projectName: project.name,
        contextMd,
        python: s.capabilities.python,
        maxRetries: appSettings.agent.maxRetries,
        toolNames: fullTools,
        skillsCatalog: allSkills.map((x) => ({ name: x.name, description: x.description })),
        activeSkills,
        customAgents: customAgents.map((a) => ({ id: a.id, description: a.description })),
        plugins: fullTools.some((t) => t.startsWith('mcp.')) ? s.mcp.connectedServers() : [],
        jev: fullTools.includes('jev.judge'),
      });
      // MASSAMBA Intelligence Engine: explained decision (model, agent, skills, MCP, tools) + cascade ladder.
      let decision: RoutingDecision | null = null;
      let engineSkillsPrompt = '';
      if (top) {
        decision = decideRoute({
          models,
          tiers,
          profile: pref.tier ? { ...profile, tier: FAMILY_TIER[pref.tier] } : profile,
          dna,
          text: input.text,
          health: this.health,
          board: this.board,
          mission,
        });
        const selection = selectSkills(input.text, input.attachments ?? [], {
          model: s.catalog.get(model) ?? null,
          tools: fullTools,
        });
        engineSkillsPrompt = skillsPrompt(selection.selected);
        const lo = buildLoadout({
          agentId: st.role,
          team: strategy?.team ?? profile.team,
          type: profile.type,
          selection,
          mcpConnected: s.mcp.connectedServers().map((x) => x.name),
          tools: fullTools,
        });
        this.emitEvent(st, {
          type: 'intel',
          title: `Décision de routage — ${model}${decision.chosen && decision.chosen.id !== model ? ` (moteur : ${decision.chosen.id})` : ''}`,
          tone: decision.budget.ok ? 'info' : 'warn',
          lines: [
            `Pourquoi ce modèle : ${sel.auto && routed ? sel.reason : `imposé (${model})`}`,
            `Moteur de preuves : ${decision.why.model}`,
            `Pourquoi pas le premium : ${decision.why.notPremium}`,
            `Secours : ${decision.why.fallback}`,
            `Escalade si : ${decision.why.escalation.join(' · ')}`,
            `Agent : ${lo.agentWhy}`,
            `Skills : ${lo.skillsWhy}${lo.incompatibleSkills.length ? ` — refusés : ${lo.incompatibleSkills.map((i) => `${i.name} (${i.reason})`).join(', ')}` : ''}`,
            `MCP : ${lo.mcpWhy}`,
            `Budget : ${decision.budget.note} · confiance ${Math.round(decision.confidence * 100)} %`,
          ],
        });
      }
      let escalations = 0;
      const escalate = (qa: number, why: string) => {
        if (!decision) return;
        const step = cascadeNext({
          qa,
          threshold: 75,
          escalations,
          maxEscalations: 2,
          rounds: missionRound,
          maxRounds: 3,
          current: model,
          ladder: decision.ladder.slice(escalations),
          budgetLeft: null,
        });
        this.emitEvent(st, {
          type: 'intel',
          title: step.action === 'escalate' ? `Cascade — escalade (${why})` : `Cascade — ${step.action}`,
          tone: step.action === 'escalate' ? 'warn' : 'info',
          lines: [step.reason, ...(step.model ? [`${model} → ${step.model}`] : [])],
        });
        if (step.action === 'escalate' && step.model) {
          escalations++;
          model = step.model;
          st.model = model;
        }
      };
      const systemPrompt = [
        system,
        ENGINE_DOCTRINE,
        manualPrompt(s.brain.manual),
        strategy ? strategyPrompt(dna, strategy) : '',
        engineSkillsPrompt,
        MEMORY_INSTRUCTIONS,
        mission
          ? `${MISSION_PROTOCOL}\n\nTask profile: ${profile.reasons.join(', ')}.${profile.team.length ? ` Recommended specialists, in order: ${profile.team.join(' → ')}.` : ''}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      const userContent = await buildUserContent({
        services: s,
        projectId: st.projectId,
        text: input.text,
        attachments: input.attachments ?? [],
        ui: input.ui,
        vision,
        isFirstRun: history.filter((m) => m.role === 'user').length === 0,
        agentMode,
      });
      const firstRun = history.filter((m) => m.role === 'user').length === 0;
      if (firstRun && !opts.ephemeral) {
        // Project memory: create the .ai/ documents if missing and give the agent a digest.
        if (session.permissionMode !== 'safe')
          await s.memory.ensureAiDocs(st.projectId).catch(() => undefined);
        const digest = await s.memory.aiDigest(st.projectId).catch(() => '');
        if (digest) {
          const note = `<project_memory>\n${digest}\n</project_memory>\n\n`;
          if (typeof userContent.content === 'string') userContent.content = note + userContent.content;
          else {
            const first = userContent.content[0];
            if (first?.type === 'text') first.text = note + first.text;
          }
        }
      }
      const userMsg: ChatMessage = { role: 'user', content: userContent.content };
      const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...history, userMsg];
      const shadow =
        top && session.permissionMode !== 'safe'
          ? new ShadowMonitor(input.text, {
              writeTask: profile.type !== 'chat' && profile.type !== 'research',
              regressionPaths: new Set(regressionSuite(s.brain.ledger).flatMap((c) => c.files)),
            })
          : null;
      shadowRef = shadow;
      const evidence: string[] = [
        input.text,
        ...history
          .filter((m) => m.role === 'user' || m.role === 'tool')
          .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))),
      ];
      let gates = 0;
      let challenged = 0;
      const intelAlerts = (alerts: ShadowAlert[]) => {
        if (alerts.length)
          this.emitEvent(st, {
            type: 'intel',
            title: 'Shadow agent',
            tone: alerts.some((a) => a.severity === 'critical')
              ? 'err'
              : alerts.some((a) => a.severity === 'warn')
                ? 'warn'
                : 'info',
            lines: alerts.map((a) => a.message),
          });
      };
      const persist = (m: ChatMessage) => {
        if (!opts.ephemeral) repo.addMessage(st.sessionId, st.id, m.role, m);
      };
      persist(userMsg);
      if (!opts.ephemeral && session.title === 'Nouvelle session')
        repo.updateSession(session.id, { title: input.text.split('\n')[0]!.slice(0, 80) });

      const pendingImages: ToolContext['pendingImages'] = [];
      const ctx: ToolContext = {
        projectId: st.projectId,
        sessionId: st.sessionId,
        runId: st.id,
        role: st.role,
        permissionMode: session.permissionMode,
        signal: st.abort.signal,
        services: s,
        depth: st.depth,
        modelSupportsVision: vision,
        emit: (e) => this.emitEvent(st, e),
        pendingImages,
        setPlan: (steps) => {
          st.plan = steps;
          this.emitEvent(st, { type: 'plan_updated', steps });
        },
        proposePlan: (summary, steps) => {
          st.proposed = { summary, steps };
        },
        delegate: st.depth < maxDepth ? (r, task) => this.delegate(st, r, task, input.effort) : undefined,
      };

      let pendingReport: MissionReport | null = null;
      let missionRound = 0;
      let missionNudges = 0;
      let reviews = 0;
      let missionDone = false;
      if (mission)
        setMissionHooks(ctx, {
          stage: (stage, note) => this.emitEvent(st, { type: 'mission_stage', stage, note }),
          report: (r) => (pendingReport = r),
        });
      let continuations = 0;
      let nudgedPlan = false;
      const maxSteps = appSettings.agent.maxSteps;
      let step = 0;
      for (; step < maxSteps; step++) {
        stepsDone = step + 1;
        if (st.abort.signal.aborted) throw new LLMError('Cancelled', 499, false, 'cancelled');
        s.llm.checkBudget(st.usage.cost);

        // Vision: show screenshots/images produced by tools on the next step.
        if (pendingImages.length && vision) {
          const imgs = pendingImages.splice(0, 4);
          const m: ChatMessage = {
            role: 'user',
            content: [
              { type: 'text', text: imgs.map((i) => i.caption).join('; ') },
              ...imgs.map((i) => ({ type: 'image_url' as const, image_url: { url: i.dataUrl } })),
            ],
          };
          messages.push(m);
        } else pendingImages.length = 0;

        // Context management
        if (estimateTokens(messages) > contextBudget) {
          const elided = elideOldToolOutputs(messages);
          messages.splice(0, messages.length, ...elided.messages);
          if (estimateTokens(messages) > contextBudget) {
            this.emitEvent(st, { type: 'status', text: 'Compactage du contexte…' });
            const compacted = await this.summarizeOldTurns(messages, st.sessionId, st.id, 1);
            const removed = messages.length - compacted.length;
            messages.splice(0, messages.length, ...compacted);
            if (!opts.ephemeral)
              repo.replaceMessages(
                st.sessionId,
                messages.slice(1).map((m) => ({ runId: st.id, role: m.role, content: m })),
              );
            this.emitEvent(st, { type: 'compacted', removedMessages: removed });
          }
        }

        const toolNames = phase === 'planning' ? planningTools : fullTools;
        const callMessages =
          phase === 'planning'
            ? [
                { ...messages[0]!, content: `${systemPrompt}\n\n${PLAN_MODE_INSTRUCTIONS}` },
                ...messages.slice(1),
              ]
            : messages;
        this.emitEvent(st, { type: 'thinking', active: true });
        const result = await s.llm.complete(
          {
            model,
            fallbacks: [...new Set([...s.llm.fallbackChain(model).slice(1), ...routedFallbacks])].filter(
              (m) => m !== model,
            ),
            messages: callMessages,
            tools: toolDefinitions(toolNames),
            temperature: appSettings.temperature,
            maxTokens: appSettings.maxTokens,
            effort,
            signal: st.abort.signal,
          },
          {
            runId: st.id,
            sessionId: st.sessionId,
            onText: (d) => this.emitEvent(st, { type: 'text_delta', text: d }),
            onReasoning: () => this.emitEvent(st, { type: 'status', text: 'Réflexion…' }),
            onStreamReset: () => this.emitEvent(st, { type: 'stream_reset' }),
            onFallback: (from, to, reason) => {
              this.health = recordHealth(this.health, from, false);
              model = to;
              st.model = to;
              repo.updateRun(st.id, { model: to });
              this.emitEvent(st, { type: 'model_fallback', from, to, reason: reason.slice(0, 300) });
            },
            onRetry: (m, attempt, reason) =>
              this.emitEvent(st, {
                type: 'status',
                text: `Nouvelle tentative ${attempt} (${m}) : ${reason.slice(0, 160)}`,
              }),
          },
        );
        this.emitEvent(st, { type: 'thinking', active: false });

        this.health = recordHealth(this.health, model, true);
        // Usage & cost
        const u = {
          tokensIn: result.usage.promptTokens,
          tokensOut: result.usage.completionTokens,
          cost: result.cost,
        };
        st.usage.promptTokens += u.tokensIn;
        st.usage.completionTokens += u.tokensOut;
        st.usage.cost += u.cost;
        repo.addRunUsage(st.id, u);
        repo.touchSession(st.sessionId, u);
        this.emitEvent(st, {
          type: 'usage',
          model: result.model || model,
          promptTokens: u.tokensIn,
          completionTokens: u.tokensOut,
          cost: u.cost,
          contextTokens: result.usage.promptTokens,
          contextLimit,
        });

        const toolCalls: ToolCall[] = result.toolCalls.map((tc, i) => ({
          ...tc,
          id: tc.id || `call_${st.id.slice(0, 6)}_${step}_${i}`,
        }));
        const assistant: ChatMessage = { role: 'assistant', content: result.content || null };
        if (toolCalls.length) assistant.tool_calls = toolCalls;
        if (result.reasoningDetails?.length) assistant.reasoning_details = result.reasoningDetails;
        messages.push(assistant);
        persist(assistant);
        if (result.content.trim()) {
          finalText = result.content;
          this.emitEvent(st, { type: 'assistant_message', text: result.content });
        }

        if (!toolCalls.length) {
          if (result.finishReason === 'length' && continuations < 2) {
            continuations++;
            const cont: ChatMessage = {
              role: 'user',
              content:
                'Your previous answer was cut off by the output limit. Continue exactly where you stopped.',
            };
            messages.push(cont);
            persist(cont);
            continue;
          }
          if (phase === 'planning') {
            if (!nudgedPlan) {
              nudgedPlan = true;
              const nudge: ChatMessage = {
                role: 'user',
                content: 'Submit your plan now by calling plan.propose (summary + steps).',
              };
              messages.push(nudge);
              continue;
            }
            st.proposed = { summary: result.content || 'Plan', steps: parseStepsFromText(result.content) };
          } else if (top && !mission && gates < 2 && (shadow || strategy?.verify.evidence)) {
            gates++;
            shadow?.observeFinal(result.content);
            const alerts = shadow?.take() ?? [];
            const unsupported = strategy?.verify.evidence ? unsupportedNumbers(result.content, evidence) : [];
            const notes: string[] = [];
            if (alerts.length) {
              intelAlerts(alerts);
              notes.push(shadowMessage(alerts));
            }
            if (unsupported.length) {
              this.emitEvent(st, {
                type: 'intel',
                title: 'Contrôle des preuves : chiffres sans source',
                tone: 'warn',
                lines: [`${unsupported.join(' · ')} — n’apparaissent dans aucun résultat d’outil`],
              });
              notes.push(
                `[EVIDENCE CHECK] These figures in your answer appear in no tool result or user message: ${unsupported.join(', ')}. Verify them with a tool and correct them, or mark them explicitly as estimates — then give the final answer again.`,
              );
            }
            if (!notes.length) break;
            const g: ChatMessage = { role: 'user', content: notes.join('\n\n') };
            messages.push(g);
            persist(g);
            continue;
          } else if (mission && !missionDone && missionNudges < 3) {
            missionNudges++;
            const nudge: ChatMessage = {
              role: 'user',
              content:
                'The mission is not finished: continue the pipeline (test, review, correct, validate). When everything is verified, call mission.report with an honest verdict.',
            };
            messages.push(nudge);
            persist(nudge);
            continue;
          } else break;
        }

        // Tool execution: read-only batches in parallel, others sequentially.
        const results = await this.executeToolCalls(
          st,
          ctx,
          toolCalls,
          appSettings.agent.parallelReads,
          appSettings.agent.toolTimeoutSec,
          new Set(toolNames),
        );
        results.forEach((r, k) => {
          messages.push(r.message);
          persist(r.message);
          const out =
            typeof r.message.content === 'string' ? r.message.content : JSON.stringify(r.message.content);
          evidence.push(out.slice(0, 40_000));
          if (shadow) {
            const c = toolCalls[k]!;
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(c.function.arguments || '{}') as Record<string, unknown>;
            } catch {
              /* invalid arguments already reported */
            }
            shadow.observeTool(
              c.function.name.replace(/__/g, '.'),
              args,
              !/^(Error|Denied|Tool error|Permission denied)/i.test(out),
              out,
            );
          }
        });
        if (shadow) {
          const alerts = shadow.take();
          intelAlerts(alerts);
          if (alerts.some((a) => a.severity !== 'info') || alerts.length >= 2)
            messages.push({ role: 'user', content: shadowMessage(alerts) });
        }

        // Plan approval gate
        if (phase === 'planning' && st.proposed) {
          const proposal = st.proposed;
          st.proposed = null;
          const steps = proposal.steps.map((t, i) => ({
            id: String(i + 1),
            title: t,
            status: 'pending' as const,
          }));
          // Register the resolver before announcing the plan, so a client that
          // answers synchronously (scripts, tests) is never lost.
          const decision = await new Promise<{ decision: 'approve' | 'cancel'; steps?: string[] }>(
            (resolve) => {
              st.planDecision = resolve;
              this.setStatus(st, 'waiting_plan');
              this.emitEvent(st, { type: 'plan_proposed', steps, summary: proposal.summary });
            },
          );
          st.planDecision = null;
          this.emitEvent(st, { type: 'plan_resolved', decision: decision.decision });
          if (decision.decision === 'cancel') {
            status = 'cancelled';
            finalText = finalText || 'Plan annulé.';
            break;
          }
          this.setStatus(st, 'running');
          const finalSteps = (decision.steps?.length ? decision.steps : proposal.steps).map((t, i) => ({
            id: String(i + 1),
            title: t,
            status: (i === 0 ? 'in_progress' : 'pending') as PlanStep['status'],
          }));
          st.plan = finalSteps;
          this.emitEvent(st, { type: 'plan_updated', steps: finalSteps });
          const go: ChatMessage = {
            role: 'user',
            content: `Plan approved. Final plan:\n${finalSteps.map((p, i) => `${i + 1}. ${p.title}`).join('\n')}\n\nExecute it now, step by step. Keep the checklist current with plan.update and verify each step.`,
          };
          messages.push(go);
          persist(go);
          phase = 'executing';
        }

        // Mission: verdict → correction rounds → independent final review.
        if (mission && pendingReport) {
          const report: MissionReport = pendingReport;
          pendingReport = null;
          missionRound++;
          if (learning) learning.report = report;
          await s.memory
            .recordMission(st.projectId, input.text, report, { model, cost: st.usage.cost })
            .catch(() => undefined);
          if (report.status !== 'PARTIAL')
            this.board = recordTypedOutcome(this.board, model, profile.type, report.status === 'PASSED');
          if (report.status !== 'PASSED' && missionRound < 3) {
            this.emitEvent(st, { type: 'mission_report', report, round: missionRound });
            escalate(qaScore({ status: report.status, checks: report.checks }), `verdict ${report.status}`);
            const fix: ChatMessage = {
              role: 'user',
              content: `Correction round ${missionRound + 1}: the verdict is ${report.status}. Fix the failing checks and remaining issues (${report.issues.join('; ').slice(0, 1500) || 'see your report'}), re-test everything, then call mission.report again.`,
            };
            messages.push(fix);
            persist(fix);
            continue;
          }
          if (report.status === 'PASSED' && strategy && st.depth < maxDepth && challenged < 2) {
            const unsupported = strategy.verify.evidence
              ? unsupportedNumbers(`${finalText}\n${report.summary}`, evidence)
              : [];
            if (strategy.verify.adversarial || unsupported.length) {
              challenged++;
              this.emitEvent(st, { type: 'mission_stage', stage: 'review', note: 'red team' });
              const ch = await this.delegate(
                st,
                'adversarial',
                ADVERSARIAL_TASK(input.text, report, unsupported),
                input.effort,
              );
              const c = parseChallenge(ch.summary);
              this.emitEvent(st, {
                type: 'intel',
                title: `Red team — confiance ${c.confidence ?? '?'} %`,
                tone: c.blocking.length ? 'err' : 'ok',
                lines: [
                  ...c.blocking.map((b) => `Bloquant : ${b}`),
                  ...c.minor.slice(0, 4).map((b) => `Mineur : ${b}`),
                  ...(unsupported.length ? [`Chiffres sans preuve : ${unsupported.join(', ')}`] : []),
                ],
                detail: ch.summary.slice(0, 6000),
              });
              if (c.blocking.length && missionRound < strategy.maxRounds) {
                escalate(
                  qaScore({ status: report.status, checks: report.checks, blocking: c.blocking.length }),
                  'red team bloquante',
                );
                const fix: ChatMessage = {
                  role: 'user',
                  content: `The red team found blocking problems:\n${c.blocking.map((b) => `- ${b}`).join('\n')}\n\nFix them, re-verify with tools, then call mission.report again.`,
                };
                messages.push(fix);
                persist(fix);
                continue;
              }
            }
          }
          if (
            report.status === 'PASSED' &&
            reviews < 2 &&
            st.depth < maxDepth &&
            appSettings.agent.maxSubagentDepth > 0
          ) {
            reviews++;
            this.emitEvent(st, {
              type: 'mission_stage',
              stage: 'validation',
              note: 'revue finale indépendante',
            });
            const rev = await this.delegate(
              st,
              'final_reviewer',
              FINAL_REVIEW_TASK(input.text, report),
              input.effort,
            );
            const approved = rev.ok && reviewApproved(rev.summary);
            this.emitEvent(st, {
              type: 'mission_report',
              report,
              round: missionRound,
              review: { approved, summary: rev.summary.slice(0, 3000) },
            });
            if (!approved && missionRound < 3) {
              escalate(
                qaScore({ status: report.status, checks: report.checks, reviewerRejected: true }),
                'refus du relecteur',
              );
              const fix: ChatMessage = {
                role: 'user',
                content: `The final reviewer requested changes:\n${rev.summary.slice(0, 4000)}\n\nFix the blocking problems, re-test, then call mission.report again.`,
              };
              messages.push(fix);
              persist(fix);
              continue;
            }
          } else this.emitEvent(st, { type: 'mission_report', report, round: missionRound });
          this.emitEvent(st, { type: 'mission_stage', stage: 'delivery' });
          finalText = `${finalText ? `${finalText}\n\n` : ''}${formatReport(report)}`;
          missionDone = true;
          break;
        }
      }
      if (step >= maxSteps && status === 'completed') {
        status = 'failed';
        errorMessage = `Limite de ${maxSteps} étapes atteinte. Augmentez-la dans Réglages › Agent ou relancez avec « continue ».`;
        this.emitEvent(st, { type: 'error', message: errorMessage, recoverable: true });
      }
    } catch (err) {
      const e = err as Error;
      if (st.abort.signal.aborted || (err instanceof LLMError && err.code === 'cancelled')) {
        status = 'cancelled';
      } else {
        status = 'failed';
        errorMessage =
          err instanceof BudgetExceededError
            ? e.message
            : err instanceof LLMError && err.status === 401
              ? 'OpenRouter refuse la requête (401) : configurez OPENROUTER_API_KEY (Réglages › Fournisseurs IA).'
              : err instanceof LLMError && err.status === 402
                ? `Crédits OpenRouter insuffisants : ${e.message}`
                : redactSecrets(e.message);
        this.emitEvent(st, { type: 'error', message: errorMessage, recoverable: false });
      }
    } finally {
      for (const id of st.approvals.keys()) this.approvalIndex.delete(id);
      const durationMs = Date.now() - st.startedAt;
      repo.updateRun(st.id, { status, error: errorMessage, finishedAt: Date.now() });
      this.emitEvent(st, {
        type: 'run_finished',
        status,
        summary: finalText.slice(0, 4000) || undefined,
        usage: st.usage,
        durationMs,
      });
      // LEARNING: every top-level run feeds the mission ledger.
      if (learning) {
        const sh = shadowRef as ShadowMonitor | null;
        const lr = learning as { dna: TaskDna; tier: string; mission: boolean; report: MissionReport | null };
        const verdict: LedgerEntry['verdict'] = lr.report
          ? lr.report.status
          : status === 'failed'
            ? 'ERROR'
            : sh && !sh.didVerify && sh.didWrite
              ? 'PARTIAL'
              : 'PASSED';
        if (status !== 'cancelled')
          s.brain.record({
            id: st.id,
            at: st.startedAt,
            goal: input.text.slice(0, 400),
            dna: lr.dna,
            tier: lr.tier as LedgerEntry['tier'],
            model: st.model,
            team: [...(this.teams.get(st.id) ?? [])],
            verdict,
            cost: st.usage.cost,
            durationMs,
            steps: stepsDone,
            toolErrors: sh?.toolErrors.slice(-10) ?? [],
            rounds: 0,
            files: {
              read: [...new Set(sh?.read ?? [])].slice(0, 40),
              written: [...new Set(sh?.written ?? [])].slice(0, 40),
            },
            checks: lr.report?.checks ?? [],
            lessons: [
              ...(lr.report?.issues ?? []).slice(0, 3),
              ...(sh?.toolErrors.slice(-2).map((t) => `${t.tool}: ${t.error.slice(0, 100)}`) ?? []),
            ],
          });
        this.teams.delete(st.id);
      }
      this.active.delete(st.id);
      repo.audit({
        actor: 'agent',
        action: 'run.finish',
        target: st.id,
        decision: status,
        details: { role: st.role, model: st.model, cost: st.usage.cost },
      });
    }
    return { status, summary: finalText || errorMessage || '' };
  }

  private async delegate(
    parent: RunState,
    role: RoleId,
    task: string,
    effort?: EffortSetting,
  ): Promise<{ ok: boolean; summary: string; childRunId: string }> {
    const id = randomUUID();
    this.teams.get(parent.id)?.add(role);
    if (!ROLES[role] && !(await this.s.skills.getAgent(role))) {
      return {
        ok: false,
        summary: `Unknown agent "${role}". Available: ${[...Object.keys(ROLES), ...(await this.s.skills.listAgents()).map((a) => a.id)].join(', ')}`,
        childRunId: '',
      };
    }
    const profile = await resolveRole(role, this.s.skills, KNOWN_TOOLS);
    const pref = agentModelPreference(profile.model);
    const tierModel =
      pref.id ??
      pickFromTier(
        await this.s.catalog.list().catch(() => []),
        this.s.settings.get().autoTiers[pref.tier ?? profile.tier],
        { tools: true },
      )?.id;
    const model = tierModel ?? parent.model;
    this.s.repo.createRun({
      id,
      sessionId: parent.sessionId,
      projectId: parent.projectId,
      parentRunId: parent.id,
      role,
      title: task.split('\n')[0]!.slice(0, 120),
      model,
      mode: 'chat',
    });
    const child = this.createState({
      id,
      sessionId: parent.sessionId,
      projectId: parent.projectId,
      parentRunId: parent.id,
      role,
      depth: parent.depth + 1,
      model,
    });
    const onParentAbort = () => child.abort.abort(new Error('Parent cancelled'));
    parent.abort.signal.addEventListener('abort', onParentAbort, { once: true });
    child.forward = (e) => {
      if (FORWARDED_FROM_CHILD.has(e.type))
        this.emitEvent(parent, { ...e, agentPath: profile.label } as AgentEvent);
      if (e.type === 'usage') {
        parent.usage.cost += e.cost;
      }
    };
    this.emitEvent(parent, { type: 'subagent_started', childRunId: id, role, task: task.slice(0, 2000) });
    const res = await this.execute(
      child,
      { sessionId: parent.sessionId, text: task, role, model, effort, agentMode: 'chat' },
      { ephemeral: true },
    );
    parent.abort.signal.removeEventListener('abort', onParentAbort);
    const ok = res.status === 'completed';
    this.emitEvent(parent, {
      type: 'subagent_finished',
      childRunId: id,
      role,
      summary: res.summary.slice(0, 4000),
      ok,
    });
    return { ok, summary: res.summary || `(sub-agent ended with status ${res.status})`, childRunId: id };
  }

  private async executeToolCalls(
    st: RunState,
    ctx: ToolContext,
    calls: ToolCall[],
    parallelReads: boolean,
    timeoutSec: number,
    allowed: Set<string>,
  ): Promise<{ message: ChatMessage }[]> {
    const out: { message: ChatMessage }[] = new Array(calls.length);
    let i = 0;
    while (i < calls.length) {
      const tool = getTool(calls[i]!.function.name);
      if (parallelReads && tool?.readOnly) {
        let j = i;
        while (j < calls.length && getTool(calls[j]!.function.name)?.readOnly) j++;
        const batch = calls.slice(i, j);
        const res = await Promise.all(batch.map((c) => this.runTool(st, ctx, c, timeoutSec, allowed)));
        res.forEach((r, k) => (out[i + k] = r));
        i = j;
      } else {
        out[i] = await this.runTool(st, ctx, calls[i]!, timeoutSec, allowed);
        i++;
      }
    }
    return out;
  }

  private async runTool(
    st: RunState,
    ctx: ToolContext,
    call: ToolCall,
    timeoutSec: number,
    allowed: Set<string>,
  ): Promise<{ message: ChatMessage }> {
    const started = Date.now();
    const reply = (content: string) => ({
      message: { role: 'tool' as const, tool_call_id: call.id, content: clipForModel(content) },
    });
    const tool = getTool(call.function.name);
    const toolName = tool?.name ?? call.function.name.replace(/__/g, '.');
    const finish = (result: ToolResultPayload, status: 'success' | 'error' | 'denied') => {
      this.emitEvent(st, {
        type: 'tool_result',
        callId: call.id,
        tool: toolName,
        result,
        durationMs: Date.now() - started,
      });
      this.s.repo.finishToolCall(call.id + st.id.slice(0, 8), status, result.summary, Date.now() - started);
    };

    let rawArgs: unknown;
    try {
      rawArgs = call.function.arguments?.trim() ? JSON.parse(call.function.arguments) : {};
    } catch {
      this.emitEvent(st, {
        type: 'tool_call',
        callId: call.id,
        tool: toolName,
        args: { raw: call.function.arguments?.slice(0, 500) },
      });
      this.s.repo.startToolCall({
        id: call.id + st.id.slice(0, 8),
        runId: st.id,
        sessionId: st.sessionId,
        tool: toolName,
        args: {},
      });
      finish({ ok: false, summary: 'Invalid JSON arguments', error: 'Invalid JSON arguments' }, 'error');
      return reply(
        `Error: arguments are not valid JSON. Received: ${call.function.arguments?.slice(0, 300)}`,
      );
    }
    this.emitEvent(st, {
      type: 'tool_call',
      callId: call.id,
      tool: toolName,
      args: truncateForUi(redactDeep(rawArgs)),
    });
    this.s.repo.startToolCall({
      id: call.id + st.id.slice(0, 8),
      runId: st.id,
      sessionId: st.sessionId,
      tool: toolName,
      args: redactDeep(rawArgs),
    });

    if (!tool) {
      finish({ ok: false, summary: 'Unknown tool', error: `Unknown tool ${call.function.name}` }, 'error');
      return reply(`Error: unknown tool "${call.function.name}".`);
    }
    if (!allowed.has(tool.name)) {
      finish(
        {
          ok: false,
          summary: 'Outil non disponible ici',
          error: `${tool.name} is not available in this phase/role/mode`,
        },
        'denied',
      );
      const planning = allowed.has('plan.propose');
      return reply(
        planning
          ? `Error: ${tool.name} is not available in PLAN MODE. Inspect with read-only tools, then call plan.propose. Changes happen only after the user approves the plan.`
          : `Error: ${tool.name} is not available to you (role/permission mode). Use only the tools provided.`,
      );
    }
    const parsed = tool.schema.safeParse(rawArgs);
    if (!parsed.success) {
      const msg = z.prettifyError(parsed.error);
      finish({ ok: false, summary: 'Invalid arguments', error: msg }, 'error');
      return reply(`Error: invalid arguments for ${tool.name}:\n${msg}`);
    }
    const args = parsed.data;

    // Permission check
    const session = this.s.repo.getSession(st.sessionId)!;
    const sessionSettings = this.s.repo.getSessionSettings(st.sessionId);
    const assessment = tool.assess(args, ctx);
    const grantKey = tool.grantKey?.(args) ?? tool.name;
    const decision = decide({
      mode: session.permissionMode,
      risk: assessment.risk,
      commandLevel: assessment.commandLevel,
      autoApproveEdits: sessionSettings.autoApproveEdits,
      granted: sessionSettings.grants?.includes(grantKey),
    });
    const reason = [assessment.risk, assessment.commandLevel, ...(assessment.reasons ?? [])]
      .filter(Boolean)
      .join(' · ');
    if (decision === 'deny') {
      this.s.repo.audit({
        actor: 'agent',
        action: tool.name,
        target: tool.label(args),
        decision: 'deny',
        details: { mode: session.permissionMode, reason },
      });
      finish(
        {
          ok: false,
          summary: `Bloqué (${session.permissionMode})`,
          error: `Blocked by permission mode ${session.permissionMode}: ${reason}`,
        },
        'denied',
      );
      return reply(
        `Denied: this action is not allowed in ${session.permissionMode.toUpperCase()} mode (${reason}). Do not retry it; continue with what is allowed or explain to the user what they need to enable.`,
      );
    }
    if (decision === 'ask') {
      const approvalId = randomUUID();
      const preview = await tool.preview?.(args, ctx).catch(() => undefined);
      const request: ApprovalRequest = {
        approvalId,
        tool: tool.name,
        summary: tool.label(args),
        reason,
        preview: preview ? (redactDeep(preview) as ApprovalRequest['preview']) : undefined,
      };
      this.approvalIndex.set(approvalId, st.id);
      // Approvals of sub-agents are surfaced in the top-level run too (forwarded).
      const d = await new Promise<Decision>((resolve) => {
        st.approvals.set(approvalId, resolve);
        this.setStatus(st, 'waiting_approval');
        this.emitEvent(st, { type: 'approval_required', request });
      });
      st.approvals.delete(approvalId);
      this.approvalIndex.delete(approvalId);
      if (!st.abort.signal.aborted) this.setStatus(st, 'running');
      this.emitEvent(st, { type: 'approval_resolved', approvalId, decision: d.decision, note: d.note });
      this.s.repo.audit({
        actor: 'user',
        action: `approve:${tool.name}`,
        target: tool.label(args),
        decision: d.decision,
        details: d.note,
      });
      if (d.decision === 'deny') {
        finish({ ok: false, summary: 'Refusé par l’utilisateur', error: d.note }, 'denied');
        return reply(
          `The user denied this action.${d.note ? ` User feedback: ${d.note}` : ''} Do not retry it as-is; adjust your approach or ask the user.`,
        );
      }
      if (d.remember && assessment.commandLevel !== 'dangerous') {
        const grants = new Set(sessionSettings.grants ?? []);
        grants.add(grantKey);
        this.s.repo.setSessionSettings(st.sessionId, {
          ...this.s.repo.getSessionSettings(st.sessionId),
          grants: [...grants],
        });
      }
    }

    // Execute with timeout
    let output: ToolOutput;
    try {
      const timeoutMs = (timeoutSec + 60) * 1000;
      let timer: NodeJS.Timeout | undefined;
      output = await Promise.race([
        tool.execute(args, ctx),
        new Promise<ToolOutput>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Tool timed out after ${timeoutMs / 1000}s`)), timeoutMs);
        }),
      ]).finally(() => clearTimeout(timer));
    } catch (err) {
      const root = this.s.workspace.projectRoot(st.projectId);
      const msg = redactSecrets((err as Error).message ?? String(err))
        .split(root)
        .join('.');
      output = { ok: false, summary: msg.slice(0, 200), error: msg };
    }
    const payload: ToolResultPayload = {
      ok: output.ok,
      summary: redactSecrets(output.summary),
      data: output.data === undefined ? undefined : truncateForUi(redactDeep(output.data), 20_000),
      error: output.error ? redactSecrets(output.error) : undefined,
      attachments: output.attachments,
    };
    finish(payload, output.ok ? 'success' : 'error');
    if (!['read', 'network'].includes(assessment.risk)) {
      this.s.repo.audit({
        actor: 'agent',
        action: tool.name,
        target: tool.label(args),
        decision: output.ok ? 'ok' : 'error',
        details: reason,
      });
    }
    const forModel =
      output.forModel ?? (output.data !== undefined ? JSON.stringify(output.data) : output.summary);
    const text = output.ok
      ? forModel
      : `Error: ${output.error ?? output.summary}${output.forModel ? `\n${output.forModel}` : ''}`;
    return reply(redactSecrets(text));
  }
}

export { toLlmName };
