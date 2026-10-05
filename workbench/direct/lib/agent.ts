// The agent loop, running entirely in the browser: plan → tools → observe → verify.
import type { EffortSetting } from '@shared/types';
import { selectModel } from '../../server/llm/router';
import { FAMILY_TIER, TIER_LABEL, analyzeTask, routeModel } from '../../server/llm/routing';
import {
  ADVERSARIAL_TASK,
  ENGINE_DOCTRINE,
  ShadowMonitor,
  buildTwin,
  compressTrajectory,
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
  recordEntry,
  type LedgerEntry,
  type ShadowAlert,
  type Strategy,
  type TaskDna,
} from '../../server/agent/intelligence';
import { beginCheckpoint, endCheckpoint } from './timemachine';
import {
  DEFAULT_ENGINE,
  DEFAULT_WEIGHTS,
  cascadeNext,
  decideRoute,
  qaScore,
  type RoutingDecision,
} from '../../server/engine/decision';
import { selectSkills, skillsPrompt, type SkillMatch } from '../../server/engine/skills';
import { buildLoadout } from '../../server/engine/loadout';
import { isHumanCorrection } from '../../server/engine/telemetry';
import * as jevRt from './jev';
import {
  LiveController,
  pruneToolOutputs,
  wasteRate,
  type LiveCheckpoint,
  type MissionState,
} from '../../server/jev/live';
import { compilePrompt, compileSkill } from '../../server/jev/prompt';
import { packetPrompt, type PreResult } from '../../server/jev/packet';
import { REQUESTABLE, TOOL_FAMILIES, toolDefTokens } from '../../server/jev/tools';
import type { Checkpoint } from '../../server/jev/metrics';
import type { UsageEntry } from './types';
import {
  AI_DOCS,
  FINAL_REVIEW_TASK,
  MEMORY_INSTRUCTIONS,
  MISSION_PROTOCOL,
  aiDocPath,
  aiDocTemplate,
  changelogEntry,
  formatReport,
  memoryDigest,
  reviewApproved,
  testsEntry,
  type AiDoc,
  type MissionReport,
} from '../../server/agent/mission';
import { agentModelPreference } from '../../server/agent/roles';
import { DEFAULT_AUTO_TIERS } from '../../server/services/settings';
import { HOUSE_RULES } from '../../server/services/houseStyle';
import { isDataFile, profileToText, DataCore } from '../../server/services/dataCore';
import { isDocument, isImage } from '../../server/services/documentsCore';
import { LLMError, type ChatMessage, type ContentPart, type ToolCall } from '../../server/llm/types';
import { complete, friendlyError } from './llm';
import { connectedTools, ensureConnected, mcpState } from './mcp';
import { BUILTIN_PLUGINS, builtinToolNames, builtinTools } from './builtinPlugins';
import { findAgent, allAgents } from './roles';
import { matchSkills } from './skills';
import { uid, useStore } from './store';
import { TOOLS, llmName, mcpTool, toolDefs, type DirectTool, type ToolCtx } from './tools';
import type { AgentDef, AgentMode, Attachment, PlanStep, Session } from './types';
import { bytesOf, dataUrl, getFile, readAsText, tree, writeText } from './vfs';

const WRITE_TOOLS = new Set(['filesystem.write', 'filesystem.edit', 'filesystem.delete']);
/** Tools that create files: hidden in SAFE (read-only) mode. */
const SAFE_HIDDEN = new Set([
  ...WRITE_TOOLS,
  'memory.doc',
  'report.export',
  'data.export',
  'artifact.create',
  'apex.build_app',
]);
const MISSION_ONLY = new Set(['mission.stage', 'mission.report']);

/** Creates missing .ai/ memory documents (never overwrites). */
function ensureAiDocs(): void {
  for (const d of AI_DOCS)
    if (!getFile(aiDocPath(d))) writeText(aiDocPath(d), aiDocTemplate(d, 'Espace de travail'));
}
function aiDigest(): string {
  const docs: Partial<Record<AiDoc, string>> = {};
  for (const d of AI_DOCS) {
    const f = getFile(aiDocPath(d));
    if (f && !f.binary) docs[d] = f.data;
  }
  return memoryDigest(docs);
}
function recordMission(goal: string, r: MissionReport, meta: { model: string; cost: number }): void {
  ensureAiDocs();
  writeText(
    aiDocPath('CHANGELOG'),
    `${getFile(aiDocPath('CHANGELOG'))!.data.trimEnd()}\n${changelogEntry(goal, r, meta)}`,
  );
  writeText(aiDocPath('TESTS'), `${getFile(aiDocPath('TESTS'))!.data.trimEnd()}\n${testsEntry(r)}`);
}
const MAX_DEPTH = 1;

const PLAN_MODE = `# PLAN MODE (active)
Do not change anything yet. Inspect with read-only tools as needed, then call plan.propose with a short summary and concrete ordered steps. Execution starts only after the user approves the plan.`;

function systemPrompt(o: {
  agent: AgentDef;
  mode: Session['mode'];
  tools: DirectTool[];
  skills: { name: string; description: string }[];
  active: { name: string; body: string; files: string[] }[];
  agents: AgentDef[];
  plugins: { name: string; instructions?: string }[];
}): string {
  const has = (n: string) => o.tools.some((t) => t.name === n);
  const parts = [
    `You are an expert AI agent inside "MASSAMBA Workbench", a Claude-Code-like workspace that runs in the user's browser.`,
    `Role — ${o.agent.name}: ${o.agent.prompt}`,
    `# How you work
- Understand the goal, then act: use tools instead of guessing. For multi-step tasks keep a checklist with plan.update.
- The workspace is a virtual folder in the browser (uploaded and generated files). Use filesystem.list to see it.
- Read before editing; prefer filesystem.edit for small changes; write complete files (no placeholders).
- Verify your work (re-read, run code, check figures) before saying it is done.
- Deliverables (reports, pages, slides, dashboards) → artifact.create or files the user can download.
- Never invent numbers, sources or file contents. Say clearly what you could not do.
- Answer in the user's language (French by default), concisely, in Markdown.
- Never reveal hidden reasoning; give conclusions, steps taken and results.`,
    `# Permissions: ${o.mode.toUpperCase()}
${o.mode === 'safe' ? 'Read-only: you cannot modify files.' : o.mode === 'normal' ? 'Writes, deletions, code execution and plugin actions need user approval (the UI asks). If denied, adapt — do not retry the same action.' : 'Autonomous: actions run without asking. Stay careful and stay within the request.'}
Not available here: a real OS shell (npm, git, pip), the local disk outside the workspace, desktop apps. ${has('code.run') ? 'Use code.run (sandboxed JavaScript/Python) for computations.' : ''}${has('terminal.execute') ? ' terminal.execute gives an embedded terminal over the workspace (ls, grep, pipes, redirections, node, python, curl, data).' : ''}${has('browser.open') ? ' browser.* drives an embedded browser: workspace apps are fully interactive (click, type, upload a workspace file, exports captured in downloads/); web pages open read-only. To TEST a generated app: browser.open it, browser.upload the real data file, click every tab and export, then inspect the downloaded files (data.inspect / filesystem.read).' : ''}`,
  ];
  if (o.tools.some((t) => /^(report|data)\.export$|^apex\./.test(t.name)))
    parts.push(
      `# ${HOUSE_RULES}${has('apex.build_app') ? '\n- Any request for an application, dashboard, reporting tool or "like the APEX": follow the APEX method (apex.guide first), or delegate to the apex_studio agent.' : ''}`,
    );
  if (o.active.length)
    parts.push(
      `# ACTIVE SKILLS — MANDATORY\nThe following skills apply to this request. Follow their instructions exactly (workflow, format, rules); they override your defaults.\n\n${o.active
        .map(
          (s) =>
            `<skill name="${s.name}">\n${s.body}${s.files.length ? `\n\nBundled files (skill.read): ${s.files.join(', ')}` : ''}\n</skill>`,
        )
        .join('\n\n')}`,
    );
  const others = o.skills.filter((s) => !o.active.some((a) => a.name === s.name));
  if (others.length && has('skill.use'))
    parts.push(
      `# Skills catalog\nIf a request matches one of these, load it with skill.use BEFORE answering and follow it:\n${others.map((s) => `- ${s.name}: ${s.description.slice(0, 300)}`).join('\n')}`,
    );
  if (has('agent.delegate'))
    parts.push(
      `# Specialist agents (agent.delegate)\n${o.agents
        .filter((a) => a.id !== o.agent.id)
        .map((a) => `- ${a.id}: ${a.description}`)
        .join('\n')}`,
    );
  const ext = BUILTIN_PLUGINS.filter((p) => p.tools.some((t) => has(t.name)));
  if (ext.length)
    parts.push(
      `# Built-in plugins — use them automatically when relevant (real data, cite the source)\n${ext.map((p) => `- ${p.name} (${p.tools.map((t) => t.name).join(', ')}): ${p.description} Source: ${p.source}.`).join('\n')}`,
    );
  if (o.plugins.length)
    parts.push(
      `# Plugins (MCP) — use them automatically when relevant (tools named mcp.<plugin>.<tool>)\n${o.plugins.map((p) => `- ${p.name}${p.instructions ? `: ${p.instructions.slice(0, 1200)}` : ''}`).join('\n')}`,
    );
  return parts.join('\n\n');
}

const data = new DataCore();

async function userContent(
  text: string,
  attachments: Attachment[],
  vision: boolean,
  firstTurn: boolean,
): Promise<ContentPart[]> {
  const parts: ContentPart[] = [];
  const notes: string[] = [];
  for (const a of attachments) {
    const f = getFile(a.path);
    if (!f) continue;
    try {
      if (isImage(f.path)) {
        if (vision && f.mime !== 'image/svg+xml') {
          parts.push({ type: 'image_url', image_url: { url: dataUrl(f) } });
          notes.push(`Image attached: ${f.path}`);
        } else notes.push(`Image ${f.path} attached (this model cannot see images).`);
      } else if (isDataFile(f.path)) {
        const ds = data.parseBytes(f.path, bytesOf(f), null);
        notes.push(
          `Data file attached: ${f.path}\n${profileToText(data.profile(ds))}\n(Use data.query / data.chart for exact figures.)`,
        );
      } else if (isDocument(f.path) || !f.binary) {
        const { text: t, kind } = await readAsText(f.path);
        notes.push(
          `File attached: ${f.path} (${kind})\n<file path="${f.path}">\n${t.length > 60_000 ? `${t.slice(0, 60_000)}\n…[truncated — use filesystem.read with offset]` : t}\n</file>`,
        );
      } else notes.push(`Binary file attached: ${f.path} (${f.mime}, ${f.size} bytes).`);
    } catch (e) {
      notes.push(`Attachment ${f.path} could not be read: ${(e as Error).message}`);
    }
  }
  const ctx = firstTurn
    ? `<workspace>\n${tree().split('\n').slice(0, 200).join('\n')}\n</workspace>\n\n`
    : '';
  parts.unshift({ type: 'text', text: `${ctx}${notes.length ? `${notes.join('\n\n')}\n\n` : ''}${text}` });
  return parts;
}

const estimate = (msgs: ChatMessage[]) => Math.ceil(JSON.stringify(msgs).length / 3.6);

/** Drops old tool outputs and images when the context gets too large. */
function compact(msgs: ChatMessage[], budget: number, goal = ''): ChatMessage[] {
  if (estimate(msgs) <= budget) return msgs;
  // Intelligent compression: the middle of a long trajectory becomes a structured
  // summary (facts, decisions, failures, files, current state) instead of being cut.
  if (msgs.length > 14) {
    const firstUser = msgs.findIndex((m, i) => i > 0 && m.role === 'user');
    let cut = Math.max(firstUser + 1, msgs.length - 8);
    // Never split an assistant tool call from its tool results.
    while (cut < msgs.length && msgs[cut]!.role === 'tool') cut++;
    const middle = msgs.slice(firstUser + 1, cut);
    if (middle.length > 4) {
      const summary: ChatMessage = { role: 'user', content: compressTrajectory(middle as never[], goal) };
      const out = [...msgs.slice(0, firstUser + 1), summary, ...msgs.slice(cut)];
      if (estimate(out) <= budget) return out;
      msgs = out;
    }
  }
  const keepFrom = Math.max(1, msgs.length - 8);
  return msgs.map((m, i) => {
    if (i === 0 || i >= keepFrom) return m;
    if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > 600)
      return { ...m, content: `${m.content.slice(0, 400)}\n…[older output elided]` };
    if (Array.isArray(m.content))
      return {
        ...m,
        content: m.content.map((p) =>
          p.type === 'image_url' ? { type: 'text' as const, text: '[image elided]' } : p,
        ),
      };
    return m;
  });
}

interface LoopInput {
  session: Session;
  agent: AgentDef;
  text: string;
  attachments: Attachment[];
  history: ChatMessage[];
  plan: boolean;
  depth: number;
  signal: AbortSignal;
  agentLabel?: string;
  model?: string;
  effort?: EffortSetting;
  mission?: boolean;
}

interface LoopResult {
  ok: boolean;
  text: string;
  messages: ChatMessage[];
  cost: number;
  tokensIn: number;
  tokensOut: number;
  report?: MissionReport | null;
  models: string[];
  fallbacks: number;
  dna?: TaskDna;
  strategy?: Strategy | null;
  tier?: string;
  shadow?: ShadowMonitor | null;
  steps?: number;
  challenged?: number;
  qa?: number;
  escalations?: number;
  decision?: RoutingDecision | null;
  toolsUsed?: string[];
  calls?: number;
  skills?: string[];
  mcp?: string[];
  jev?: {
    pre: PreResult;
    trace: Checkpoint[];
    jevCost: number;
    itemId: string;
    toolTokens: number;
    toolTokensBaseline: number;
    toolsOffered: number;
    contextBefore: number;
    contextAfter: number;
    quality: number | null;
    corrections: number;
    decisionMs: number;
  } | null;
  /** Without JEV (baseline run): what was sent, for the A/B comparison. */
  baselineTools?: { offered: number; tokens: number };
  /** Measured waste of the run (with or without JEV). */
  waste?: { wasted: number; rate: number | null; parts: Record<string, number> };
  /** JEV live control summary (null when live control is off). */
  live?: {
    state: MissionState;
    checkpoints: LiveCheckpoint[];
    switches: number;
    overhead: {
      pct: number | null;
      costUsd: number;
      savedUsd: number;
      roi: number | null;
      downgrade: boolean;
    };
    promptWaste: number;
    skillTokensSaved: number;
  } | null;
}

/** Packet of the current top-level run, handed to sub-agents (JEV strategy for agents). */
let currentPacket: PreResult | null = null;
/** Per-run JEV switch (A/B benchmark: baseline runs without JEV). */
/** Benchmark 2.0 variants: WITHOUT JEV / JEV PRE / JEV PRE + LIVE / JEV FULL (pre + live + post). */
export type JevVariant = 'off' | 'pre' | 'live' | 'full';
let jevOverride: JevVariant | null = null;
const jevVariant = (): JevVariant => jevOverride ?? (jevRt.jevSettings().enabled ? 'full' : 'off');
const jevEnabled = () => jevVariant() !== 'off';
const fmtTok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** Average latency per model call (ms), measured on the recent usage. */
function latencyMap(usage: UsageEntry[]): Record<string, number> {
  const acc: Record<string, { s: number; n: number }> = {};
  for (const u of usage.slice(-300)) {
    const a = (acc[u.model] ??= { s: 0, n: 0 });
    a.s += u.durationMs;
    a.n++;
  }
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v.s / v.n]));
}

/** Decision kept in the log / transcript (top candidates only). */
const slimDecision = (d: RoutingDecision): RoutingDecision => ({
  ...d,
  candidates: d.candidates.slice(0, 8),
});

/** USD still available for this run (per-task and daily budgets), null = unlimited. */
function budgetLeft(spentThisTask = 0): number | null {
  const st = useStore.getState();
  const ws = st.settings;
  const today = new Date().toISOString().slice(0, 10);
  const lefts = [
    ws.budgetPerTask > 0 ? ws.budgetPerTask - spentThisTask : null,
    ws.budgetDaily > 0 ? ws.budgetDaily - (st.spend[today] ?? 0) : null,
  ].filter((x): x is number => x !== null);
  return lefts.length ? Math.max(0, Math.min(...lefts)) : null;
}

/** Messages of the top-level run in progress (resume summary if it is interrupted). */
let liveTrace: { goal: string; messages: ChatMessage[] } | null = null;
const currentTrace = () => liveTrace;
/** Specialists delegated to during the current top-level run (learning). */
const runTeam = new Set<string>();

function decide(
  mode: Session['mode'],
  t: DirectTool,
  granted: boolean,
  args: Record<string, unknown> = {},
): 'allow' | 'ask' | 'deny' {
  const risk = t.assess ? t.assess(args) : t.risk;
  if (risk === 'read') return 'allow';
  // Deletions are always confirmed, even in autonomous mode.
  if (risk === 'delete') return mode === 'safe' ? 'deny' : 'ask';
  if (mode === 'safe' && (WRITE_TOOLS.has(t.name) || risk === 'write')) return 'deny';
  if (mode === 'auto') return 'allow';
  return granted ? 'allow' : 'ask';
}

async function loop(inp: LoopInput): Promise<LoopResult> {
  const st = useStore.getState();
  const sid = inp.session.id;
  const push = st.pushItem;
  const label = inp.agentLabel;
  const models = st.models;

  // Plugins
  await ensureConnected(st.mcp);
  const plugins = st.mcp.filter((d) => d.enabled && mcpState(d.name).status === 'connected');
  const mcpTools = connectedTools(st.mcp).map((t) =>
    mcpTool(t, st.mcp.find((d) => d.name === t.server)?.autoApprove ?? false),
  );

  // Tools allowed for this agent / mode / depth
  const extTools = builtinTools(st.settings.disabledPlugins ?? []);
  // Built-in plugins go to every agent that may look things up (all tools, or web.search).
  const extOk =
    !inp.agent.tools || inp.agent.tools.includes('web.search') || inp.agent.tools.includes('plugin.*');
  let tools = [...TOOLS.filter((t) => t.name !== 'plan.propose'), ...mcpTools, ...extTools].filter((t) => {
    if (builtinToolNames.has(t.name) && extOk && (!inp.agent.tools || !inp.agent.tools.includes(t.name))) {
      if (inp.session.mode === 'safe' && t.risk !== 'read') return false;
      return true;
    }
    if (
      inp.agent.tools &&
      !inp.agent.tools.includes(t.name) &&
      !(
        t.name.startsWith('mcp.') &&
        inp.agent.tools.some((p) => p === 'mcp.*' || t.name.startsWith(p.replace(/\*$/, '')))
      )
    )
      return false;
    if (t.name === 'agent.delegate' && inp.depth >= MAX_DEPTH) return false;
    if (inp.session.mode === 'safe' && SAFE_HIDDEN.has(t.name)) return false;
    if (MISSION_ONLY.has(t.name)) return false;
    return true;
  });
  if (inp.mission) {
    tools = [
      ...tools,
      ...TOOLS.filter((t) => MISSION_ONLY.has(t.name) || (t.name === 'plan.update' && !tools.includes(t))),
    ];
    const d = TOOLS.find((t) => t.name === 'agent.delegate')!;
    if (inp.depth < MAX_DEPTH && !tools.includes(d)) tools.push(d);
  }
  if (!st.skills.some((s) => s.enabled)) tools = tools.filter((t) => !t.name.startsWith('skill.'));
  const planTools = [...tools.filter((t) => t.readOnly), TOOLS.find((t) => t.name === 'plan.propose')!];

  // Model (AUTO router or explicit / agent preference)
  const pref = agentModelPreference(inp.agent.model);
  const requested = inp.model && inp.model !== 'auto' ? inp.model : (pref.id ?? 'auto');
  const tiers = pref.tier
    ? { ...DEFAULT_AUTO_TIERS, balanced: DEFAULT_AUTO_TIERS[pref.tier], fast: DEFAULT_AUTO_TIERS[pref.tier] }
    : DEFAULT_AUTO_TIERS;
  const prefTier = pref.tier ? FAMILY_TIER[pref.tier] : null;
  const hasImages = inp.attachments.some((a) => isImage(a.path));
  const profile = analyzeTask({
    text: inp.text,
    attachmentNames: inp.attachments.map((a) => a.name),
    hasImages,
    role: inp.agent.id,
    historyTokens: estimate(inp.history),
    mission: inp.mission,
  });
  // MASSAMBA Intelligence Engine: Task DNA → Strategy (learnt from the ledger).
  const top = inp.depth === 0 && !label;
  let dna = taskDna(
    inp.text,
    inp.attachments.map((a) => a.name),
    profile,
  );
  let strategy = top ? planStrategy(dna, profile, st.ledger, { mission: Boolean(inp.mission) }) : null;
  if (strategy && !prefTier) profile.tier = strategy.tier;
  // ── JEV Cognitive Companion (control plane): JEV_PRE → Execution Packet ──
  const jevOn = top && jevEnabled();
  let jp: Awaited<ReturnType<typeof jevRt.pre>> | null = null;
  const tJev = performance.now();
  if (jevOn) {
    const s0 = useStore.getState();
    const wsFiles = Object.values(s0.files)
      .filter((f) => !f.binary && f.data.length < 300_000 && !f.path.startsWith('.ai/'))
      .slice(-200)
      .map((f) => ({ path: f.path, text: f.data }));
    const userTexts = [
      ...inp.history
        .filter((m) => m.role === 'user' && typeof m.content === 'string')
        .map((m) => m.content as string),
      inp.text,
    ].slice(-12);
    try {
      jp = await jevRt.pre({
        taskId: uid(),
        text: inp.text,
        attachments: inp.attachments.map((a) => a.name),
        hasImages,
        mission: Boolean(inp.mission),
        role: inp.agent.id,
        agentLabel: inp.agent.name,
        models,
        tiers,
        health: s0.health,
        board: s0.board,
        bench: s0.bench,
        external: s0.externalBench,
        latency: latencyMap(s0.usage),
        engine: {
          ...DEFAULT_ENGINE,
          ...s0.settings.engine,
          weights: { ...DEFAULT_WEIGHTS, ...s0.settings.engine?.weights },
        },
        budgetLeft: budgetLeft(),
        perTaskUsd: s0.settings.budgetPerTask,
        maxSteps: s0.settings.maxSteps,
        historyTokens: estimate(inp.history),
        availableTools: [...tools.map((t) => t.name), 'tools.request'],
        mcpConnected: plugins.map((p) => p.name),
        mcpToolNames: mcpTools.map((t) => t.name),
        files: wsFiles,
        userTexts,
        manualRules: s0.manual.map((m) => m.rule),
        ledger: s0.ledger,
        preferredTier: prefTier,
        previousUserText: userTexts.at(-2),
      });
    } catch (e) {
      // JEV must never block the Workbench: the existing pipeline continues.
      push(sid, {
        kind: 'intel',
        id: uid(),
        title: 'JEV indisponible → pipeline standard',
        tone: 'warn',
        lines: [String((e as Error).message ?? e)],
      });
      jp = null;
    }
    if (jp) {
      Object.assign(profile, jp.pre.profile);
      dna = jp.pre.dna;
      strategy = jp.pre.strategy;
      currentPacket = jp.pre;
    }
  }
  const jevDecisionMs = performance.now() - tJev;
  if (top) {
    // Personal operating manual: explicit durable instructions are remembered.
    const rules = detectRules(inp.text).filter((r) => !st.manual.some((m) => m.rule === r.rule));
    if (rules.length) {
      st.setManual([
        ...st.manual,
        ...rules.map((r) => ({ ...r, id: uid(), at: Date.now(), source: 'auto' as const })),
      ]);
      push(sid, {
        kind: 'intel',
        id: uid(),
        title: 'Manuel personnel : règle mémorisée',
        tone: 'ok',
        lines: rules.map((r) => r.rule),
      });
    }
  }
  const sel = selectModel({
    requested,
    models,
    tiers,
    signals: { text: inp.text, hasImages, role: inp.agent.id, historyLength: inp.history.length },
    fallbackDefault: 'openai/gpt-4o-mini',
  });
  let routedFallbacks: string[] = [];
  let routed: ReturnType<typeof routeModel> = null;
  if (sel.auto) {
    const { health, board } = useStore.getState();
    routed = routeModel(models, tiers, prefTier ? { ...profile, tier: prefTier } : profile, health, board);
    if (routed) {
      sel.model = routed.model;
      sel.reason = routed.reason;
      routedFallbacks = routed.fallbacks;
    }
  }
  // MASSAMBA Intelligence Engine: evidence-based decision (model + agent + skills + MCP + tools), explained.
  const eng = {
    ...DEFAULT_ENGINE,
    ...st.settings.engine,
    weights: { ...DEFAULT_WEIGHTS, ...st.settings.engine?.weights },
  };
  let decision: RoutingDecision | null = null;
  let engineSkills: SkillMatch[] = [];
  if (top) {
    const s2 = useStore.getState();
    decision = jp
      ? jp.pre.decision
      : decideRoute({
          models,
          tiers,
          profile: prefTier ? { ...profile, tier: prefTier } : profile,
          dna,
          text: inp.text,
          health: s2.health,
          board: s2.board,
          bench: s2.bench,
          external: s2.externalBench,
          latency: latencyMap(s2.usage),
          settings: eng,
          budgetLeft: budgetLeft(),
          mission: inp.mission,
        });
    if (sel.auto && decision.mode === 'evidence' && decision.chosen) {
      sel.model = decision.chosen.id;
      sel.reason = decision.why.model;
      routedFallbacks = decision.fallbacks.map((f) => f.id);
    }
    const selection = jp
      ? jp.pre.selection
      : selectSkills(
          inp.text,
          inp.attachments.map((a) => a.name),
          { model: models.find((m) => m.id === sel.model), tools: tools.map((t) => t.name) },
        );
    engineSkills = selection.selected;
    const lo = jp
      ? jp.pre.loadout
      : buildLoadout({
          agentId: inp.agent.id,
          agentLabel: inp.agent.name,
          team: strategy?.team ?? profile.team,
          type: profile.type,
          selection,
          mcpConnected: plugins.map((p) => p.name),
          tools: tools.map((t) => t.name),
        });
    decision = {
      ...decision,
      agent: lo.agent,
      skills: lo.skills,
      mcp: lo.mcp,
      tools: lo.tools.slice(0, 60),
      why: {
        ...decision.why,
        model: sel.auto
          ? decision.why.model
          : `Modèle imposé par vous ou par l’agent (${sel.model}). Recommandation du moteur : ${decision.chosen?.name ?? '—'}.`,
        agent: lo.agentWhy,
        skills: `${lo.skillsWhy}${lo.incompatibleSkills.length ? ` — refusés : ${lo.incompatibleSkills.map((i) => `${i.name} (${i.reason})`).join(', ')}` : ''}`,
        mcp: lo.mcpWhy,
        tools: `${lo.tools.length} outils autorisés pour cet agent et ce mode ; contrôle qualité : ${lo.qa}`,
      },
    };
    st.logRouting(slimDecision(decision));
    push(sid, { kind: 'routing', id: uid(), decision: slimDecision(decision) });
  }
  // JEV live execution trace (updated at each checkpoint).
  const jevItemId = uid();
  const jevTrace: Checkpoint[] = jp ? [...jp.trace] : [];
  const traceAdd = (c: Checkpoint) => {
    if (!jp) return;
    jevTrace.push(c);
    st.updateItem(sid, jevItemId, { trace: [...jevTrace] });
  };
  if (jp)
    push(sid, {
      kind: 'jev',
      id: jevItemId,
      packet: jp.pre.packet as unknown as Record<string, unknown>,
      why: jevRt.explain(jp.pre),
      trace: [...jevTrace],
    });
  const fallbackChain = [
    ...new Set([st.settings.fallbackModel, ...routedFallbacks].filter((m) => m && m !== sel.model)),
  ];
  const info = models.find((m) => m.id === sel.model);
  const vision = info?.capabilities.vision ?? hasImages;
  let effort = (inp.effort && inp.effort !== 'auto' ? inp.effort : inp.agent.effort) ?? 'auto';
  // JEV reasoning level: ECO thinks less, MAX thinks more (only when left on auto).
  if (jp && effort === 'auto' && info?.efforts.length) {
    const m = jevRt.jevSettings().mode;
    if (m === 'eco') effort = 'low';
    else if (m === 'max') effort = 'high';
  }
  if (!label)
    push(sid, {
      kind: 'model',
      id: uid(),
      model: sel.model,
      reason: sel.reason,
      auto: sel.auto,
      tier: routed?.tier,
      fallbacks: fallbackChain,
      estimate: routed?.estimate ?? null,
    });

  if (strategy && top) {
    const simN = similarMissions(st.ledger, dna).length;
    push(sid, {
      kind: 'intel',
      id: uid(),
      title: `Stratégie — ${TIER_LABEL[strategy.tier]} · criticité ${dna.criticality}`,
      tone: strategy.explore ? 'warn' : 'info',
      lines: [
        `ADN : ${dna.type}, complexité ${Math.round(dna.complexity * 100)} %${dna.risks.length ? `, risques ${dna.risks.join(', ')}` : ''}${dna.outputs.length ? `, livrables ${dna.outputs.join(', ')}` : ''}`,
        `Palier : ${strategy.tierReason}`,
        `Vérifications : ${[strategy.verify.qa && 'QA', strategy.verify.evidence && 'preuves des chiffres', strategy.verify.adversarial && 'red team', strategy.verify.judge && 'juge final', 'shadow'].filter(Boolean).join(' · ')}`,
        ...(strategy.team.length ? [`Équipe : ${strategy.team.join(' → ')}`] : []),
        `Mémoire : ${simN} mission(s) similaire(s), ${strategy.pitfalls.length} piège(s) connu(s)`,
      ],
    });
  }

  // Skills: pinned + agent's + auto-detected
  const enabled = st.skills.filter((s) => s.enabled);
  const names = new Set<string>([...(label ? [] : inp.session.pinnedSkills), ...inp.agent.skills]);
  if (st.settings.autoSkills) for (const m of matchSkills(inp.text, enabled).slice(0, 3)) names.add(m.name);
  const active = enabled
    .filter((s) => names.has(s.name))
    .map((s) => ({ name: s.name, body: s.body, files: Object.keys(s.files) }));
  // JEV SKILL CONTEXT COMPILER: only the relevant sections of large skills.
  let skillTokensSaved = 0;
  if (jp)
    for (const a of active) {
      const c = compileSkill(a.body, inp.text, jevRt.jevSettings().mode === 'max' ? 4000 : 1800);
      if (c.after < c.before) {
        skillTokensSaved += c.before - c.after;
        a.body = c.text;
      }
    }
  if (active.length && !label) push(sid, { kind: 'skills', id: uid(), names: active.map((a) => a.name) });

  // JEV TOOL PACK: only the selected tools are exposed; tools.request / ADD TOOL extend it.
  const packTools: DirectTool[] = jp ? tools.filter((t) => jp!.pre.toolPack.names.includes(t.name)) : tools;
  if (jp) {
    const requestTool: DirectTool = {
      name: 'tools.request',
      description: `Ask JEV for another family of tools when the selected ones are not enough. Families: ${REQUESTABLE.join(', ')}.`,
      parameters: {
        type: 'object',
        properties: {
          family: { type: 'string', enum: REQUESTABLE },
          reason: { type: 'string', description: 'Why it is needed' },
        },
        required: ['family'],
      },
      risk: 'read',
      readOnly: true,
      label: (a) => `JEV : outils « ${String(a.family)} »`,
      async run(a) {
        const fam = TOOL_FAMILIES[String(a.family)] ?? [];
        const added = tools.filter((t) => fam.includes(t.name) && !packTools.includes(t));
        packTools.push(...added);
        traceAdd({
          name: 'JEV_EXECUTION',
          ms: 0,
          tokens: 0,
          cost: 0,
          decision: `ADD TOOL : ${added.map((t) => t.name).join(', ') || 'aucun nouvel outil'} (${String(a.family)})`,
        });
        return {
          ok: true,
          summary: `${added.length} outil(s) ajouté(s)`,
          forModel: added.length
            ? `Added tools: ${added.map((t) => llmName(t.name)).join(', ')}. They are available from your next step.`
            : `No new tool in family ${String(a.family)} for this agent / mode (already available or not allowed).`,
        };
      },
    };
    packTools.push(requestTool);
  }
  const toolTokens = toolDefTokens(toolDefs(packTools));
  const toolTokensBaseline = toolDefTokens(toolDefs(tools));
  const system = systemPrompt({
    agent: inp.agent,
    mode: inp.session.mode,
    tools: packTools,
    skills: enabled,
    active,
    agents: allAgents(st.agents),
    plugins: plugins.map((p) => ({ name: p.name, instructions: mcpState(p.name).instructions })),
  });
  const promptSections = [
    { name: 'system', text: system, pinned: true },
    { name: 'doctrine', text: ENGINE_DOCTRINE },
    { name: 'manual', text: manualPrompt(useStore.getState().manual), pinned: true },
    { name: 'strategy', text: strategy ? strategyPrompt(dna, strategy) : '' },
    { name: 'skills', text: skillsPrompt(engineSkills) },
    { name: 'packet', text: jp ? packetPrompt(jp.pre) : '' },
    { name: 'memory', text: MEMORY_INSTRUCTIONS },
    {
      name: 'mission',
      text: inp.mission
        ? `${MISSION_PROTOCOL}\n\nTask profile: ${profile.reasons.join(', ')}.${profile.team.length ? ` Recommended specialists, in order: ${profile.team.join(' → ')}.` : ''}`
        : '',
    },
  ];
  // JEV PROMPT COMPILER 2.0: duplicates removed, contradictions reported, waste measured.
  const compiledPrompt = jp ? compilePrompt(promptSections) : null;
  const fullSystem =
    compiledPrompt?.text ??
    promptSections
      .map((x) => x.text)
      .filter(Boolean)
      .join('\n\n');
  const firstTurn = !inp.history.some((m) => m.role === 'user');
  const content = await userContent(inp.text, inp.attachments, vision, firstTurn);
  if (firstTurn && !label) {
    if (inp.session.mode !== 'safe') ensureAiDocs();
    const digest = aiDigest();
    if (digest && content[0]?.type === 'text')
      content[0].text = `<project_memory>\n${digest}\n</project_memory>\n\n${content[0].text}`;
  }
  if (
    top &&
    inp.session.resume &&
    /\b(contin|repren|resume|poursui|termine)/i.test(inp.text) &&
    content[0]?.type === 'text'
  ) {
    content[0].text = `<resume_summary>\n${inp.session.resume}\n</resume_summary>\n\n${content[0].text}`;
    st.patchSession(sid, { resume: undefined });
  }
  const user: ChatMessage = { role: 'user', content };
  // JEV CONTEXT COMPILER: long histories keep only the relevant exchanges.
  const ctxHist = jp
    ? jevRt.context(inp.text, inp.history, Math.round(jp.pre.budgets.tokens * 0.4))
    : { history: inp.history, before: estimate(inp.history), after: estimate(inp.history) };
  if (compiledPrompt)
    traceAdd({
      name: 'JEV_CONTEXT',
      ms: 0,
      tokens: compiledPrompt.tokensAfter,
      cost: 0,
      decision: `prompt système ${compiledPrompt.tokensBefore} → ${compiledPrompt.tokensAfter} tokens (PROMPT WASTE ${Math.round(compiledPrompt.wasteScore * 100)} %, ${compiledPrompt.removedLines} ligne(s) dupliquée(s))${skillTokensSaved ? ` · skills −${skillTokensSaved} tokens` : ''}${compiledPrompt.contradictions.length ? ` · contradiction(s) : ${compiledPrompt.contradictions.join(' ; ')}` : ''}`,
    });
  if (jp)
    traceAdd({
      name: 'JEV_CONTEXT',
      ms: 0,
      tokens: ctxHist.after,
      cost: 0,
      decision: `historique ${ctxHist.before} → ${ctxHist.after} tokens · définitions d’outils ${toolTokensBaseline} → ${toolTokens} tokens par appel`,
    });
  const messages: ChatMessage[] = [{ role: 'system', content: fullSystem }, ...ctxHist.history, user];
  const persisted: ChatMessage[] = [user];
  const contextBudget = Math.min(Math.floor((info?.contextLength || 128_000) * 0.7), 400_000);
  if (top) liveTrace = { goal: inp.text, messages };
  // Shadow monitor (deterministic, free) + evidence corpus of the run.
  let shadow: ShadowMonitor | null = null;
  if (top && inp.session.mode !== 'safe') {
    const files = useStore.getState().files;
    const twin = buildTwin(
      Object.values(files)
        .filter((f) => !f.binary && f.data.length < 500_000)
        .map((f) => ({ path: f.path, text: f.data })),
    );
    const reg = new Set(regressionSuite(st.ledger).flatMap((c) => c.files));
    shadow = new ShadowMonitor(inp.text, {
      writeTask: profile.type !== 'chat' && profile.type !== 'research',
      dependents: (p) => twin.dependents[p] ?? [],
      regressionPaths: reg,
    });
  }
  const evidence: string[] = [
    inp.text,
    ...inp.history
      .filter((m) => m.role === 'user' || m.role === 'tool')
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))),
  ];
  let gates = 0;
  let challenged = 0;
  let stepsDone = 0;
  const showAlerts = (alerts: ShadowAlert[]) => {
    if (!alerts.length) return;
    push(sid, {
      kind: 'intel',
      id: uid(),
      title: 'Shadow agent',
      tone: alerts.some((a) => a.severity === 'critical')
        ? 'err'
        : alerts.some((a) => a.severity === 'warn')
          ? 'warn'
          : 'info',
      lines: alerts.map((a) => a.message),
    });
  };

  let model = sel.model;
  let cost = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let finalText = '';
  let phase: 'planning' | 'executing' = inp.plan ? 'planning' : 'executing';
  let proposed: { summary: string; steps: string[] } | null = null;
  let checklistId: string | null = null;
  const pendingImages: ToolCtx['pendingImages'] = [];
  const ctx: ToolCtx = {
    sessionId: sid,
    signal: inp.signal,
    depth: inp.depth,
    models,
    vision,
    pendingImages,
    setPlan: (steps: PlanStep[]) => {
      if (checklistId) st.updateItem(sid, checklistId, { steps });
      else {
        checklistId = uid();
        push(sid, { kind: 'checklist', id: checklistId, steps });
      }
    },
    proposePlan: (summary, steps) => (proposed = { summary, steps }),
    delegate: inp.depth < MAX_DEPTH ? (role, task) => delegate(inp, role, task) : undefined,
    mission: inp.mission
      ? {
          stage: (stage) => {
            const cur = useStore
              .getState()
              .sessions.find((x) => x.id === sid)
              ?.items.find((i) => i.kind === 'pipeline' && i.id === pipelineId);
            if (cur && cur.kind === 'pipeline')
              st.updateItem(sid, pipelineId, {
                current: stage,
                done: cur.current !== stage ? [...new Set([...cur.done, cur.current])] : cur.done,
              });
            else push(sid, { kind: 'pipeline', id: pipelineId, current: stage, done: [] });
          },
          report: (r) => (pendingReport = r),
        }
      : undefined,
  };
  const pipelineId = uid();
  let pendingReport: MissionReport | null = null;
  let lastReport: MissionReport | null = null;
  let missionRound = 0;
  let missionNudges = 0;
  let reviews = 0;
  const usedModels = new Set<string>();
  let fallbackCount = 0;
  // Cascade: cheap first → QA → escalate only when needed.
  let escalations = 0;
  let lastQa: number | undefined;
  // ── JEV LIVE CONTROL LOOP (variants PRE + LIVE and FULL) ──
  const variant = jevVariant();
  const priceOf = (id: string) => models.find((m) => m.id === id)?.inputPrice ?? 0;
  const live =
    jp && (variant === 'live' || variant === 'full')
      ? new LiveController({
          goal: inp.text,
          budgets: jp.pre.budgets,
          mode: jevRt.jevSettings().mode,
          model,
          strategy: jp.pre.packet.agent_strategy,
          effort,
          ladder: [
            ...new Map(
              [
                jp.pre.decision.chosen,
                ...jp.pre.decision.fallbacks,
                ...jp.pre.decision.ladder,
                ...jp.pre.decision.candidates.slice(0, 12),
              ]
                .filter((c): c is NonNullable<typeof c> => Boolean(c))
                .map((c) => [c.id, { id: c.id, inputPrice: priceOf(c.id), pSuccess: c.pSuccess }]),
            ).values(),
          ].sort((a, b) => a.inputPrice - b.inputPrice),
          critical: jp.pre.dna.criticality === 'critical',
          mission: Boolean(inp.mission),
          difficulty: jp.pre.packet.difficulty,
          offered: packTools.map((t) => t.name),
          toolDefTokens: Object.fromEntries(packTools.map((t) => [t.name, toolDefTokens(toolDefs([t]))])),
          level:
            jp.pre.packet.level >= 4 || jp.pre.dna.criticality === 'critical'
              ? 3
              : jp.pre.packet.level >= 2
                ? 1
                : 0,
        })
      : null;
  const pendingNotes: string[] = [];
  let prunedTokens = 0;
  let removedToolTokens = 0;
  let switches = 0;
  // Waste accounting (all top-level runs, with or without JEV — measured token counts).
  const toolSigs = new Map<string, number>();
  let failedToolTokens = 0;
  let repeatedToolTokens = 0;
  let discardedTokens = 0;
  let toolTokensSent = 0;
  const offeredCount = new Map<DirectTool, number>();
  const liveSync = () => {
    if (!live || !top) return;
    useStore
      .getState()
      .setJevLive(sid, { state: live.state(), checkpoints: live.checkpoints.slice(-30), at: Date.now() });
  };
  const applyLive = (cp: LiveCheckpoint | null, stepNo: number): 'stop' | null => {
    if (!cp || !live) return null;
    let stop: 'stop' | null = null;
    for (const d of cp.decisions) {
      traceAdd({
        name:
          d.action === 'SWITCH_MODEL'
            ? 'JEV_MODEL_SWITCH'
            : d.action === 'ESCALATE'
              ? 'JEV_ESCALATION'
              : 'JEV_CHECKPOINT',
        ms: cp.ms,
        tokens: 0,
        cost: 0,
        decision: `${cp.kind} · ${d.action}${d.tool ? ` ${d.tool}` : ''}${d.model ? ` → ${d.model}` : ''} : ${d.reason}`,
      });
      if (d.action === 'STOP') stop = 'stop';
      else if (d.action === 'COMPRESS')
        messages.splice(0, messages.length, ...compact(messages, Math.floor(contextBudget * 0.6), inp.text));
      else if (d.action === 'REMOVE_TOOL' && d.tool) {
        const i = packTools.findIndex((t) => t.name === d.tool);
        if (i >= 0) {
          removedToolTokens += toolDefTokens(toolDefs([packTools[i]!]));
          packTools.splice(i, 1);
        }
      } else if (d.action === 'REPLAN')
        pendingNotes.push(
          `[JEV REPLAN] ${d.reason}. Re-plan briefly, then take a different approach.\n${live.handoff()}`,
        );
      else if (d.action === 'RETRY_TARGETED') pendingNotes.push(`[JEV] ${d.reason}.`);
      else if (
        (d.action === 'LOWER_REASONING' || d.action === 'RAISE_REASONING') &&
        d.effort &&
        info?.efforts.length
      ) {
        effort = d.effort;
        live.setEffort(d.effort);
      } else if (d.action === 'SWITCH_MODEL' && d.model && d.model !== model) {
        const from = model;
        model = d.model;
        live.setModel(d.model);
        switches++;
        // Hand over the mission state, not the whole history.
        const before = estimate(messages);
        messages.splice(0, messages.length, ...compact(messages, Math.floor(contextBudget * 0.35), inp.text));
        pendingNotes.push(live.handoff());
        push(sid, {
          kind: 'intel',
          id: uid(),
          title: 'JEV LIVE : changement de modèle',
          tone: 'info',
          lines: [
            `${from} → ${d.model} (étape ${stepNo})`,
            d.reason,
            `historique ${before} → ${estimate(messages)} tokens + état de mission`,
          ],
        });
      }
    }
    liveSync();
    return stop;
  };
  let jevQuality: number | null = null;
  let corrections = 0;
  let modelCalls = 0;
  const toolsUsed = new Set<string>();
  const escalate = (qa: number, why: string): void => {
    if (!decision) return;
    lastQa = qa;
    const step = cascadeNext({
      qa,
      threshold: eng.qaThreshold,
      escalations,
      maxEscalations: eng.maxEscalations,
      rounds: missionRound,
      maxRounds: 3,
      current: model,
      ladder: decision.ladder.slice(escalations),
      budgetLeft: budgetLeft(cost),
    });
    push(sid, {
      kind: 'intel',
      id: uid(),
      title:
        step.action === 'escalate'
          ? `Cascade — escalade (${why})`
          : `Cascade — ${step.action === 'retry' ? 'correction sans escalade' : step.action === 'stop' ? 'arrêt' : 'accepté'}`,
      tone: step.action === 'escalate' ? 'warn' : step.action === 'stop' ? 'err' : 'info',
      lines: [step.reason, ...(step.model ? [`${model} → ${step.model}`] : [])],
    });
    if (step.action === 'escalate' && step.model) {
      // JEV: escalate only when the marginal quality gain is worth its cost.
      const mg = jp ? jevRt.escalateWorth(qa, eng.qaThreshold, cost, decision.ladder[escalations]) : null;
      if (live) {
        const nx = decision.ladder[escalations];
        const cp = live.beforePremium({
          model: step.model,
          quality: qa,
          target: eng.qaThreshold,
          nextCost: nx?.estimate ? (nx.estimate.low + nx.estimate.high) / 2 : cost * 4,
          nextSuccess: nx?.pSuccess ?? 0.5,
        });
        liveSync();
        void cp;
      }
      if (mg && !mg.worth) {
        traceAdd({
          name: 'JEV_ESCALATION',
          ms: 0,
          tokens: 0,
          cost: 0,
          decision: `pas d’escalade : ${mg.reason}`,
        });
        return;
      }
      escalations++;
      model = step.model;
      traceAdd({
        name: 'JEV_ESCALATION',
        ms: 0,
        tokens: 0,
        cost: 0,
        decision: `${why} → ${step.model}${mg ? ` (${mg.reason})` : ''}`,
      });
    }
  };
  const ws = useStore.getState().settings;
  let nudged = false;
  let continuations = 0;

  for (let step = 0; step < ws.maxSteps; step++) {
    if (inp.signal.aborted) throw new LLMError('Cancelled', 499, false, 'cancelled');
    const spentToday = useStore.getState().spend[new Date().toISOString().slice(0, 10)] ?? 0;
    if (ws.budgetDaily > 0 && spentToday >= ws.budgetDaily)
      throw new Error(
        `Budget journalier atteint ($${spentToday.toFixed(4)} / $${ws.budgetDaily}). Modifiez-le dans Réglages.`,
      );
    if (ws.budgetPerTask > 0 && cost >= ws.budgetPerTask)
      throw new Error(
        `Budget par tâche atteint ($${cost.toFixed(4)} / $${ws.budgetPerTask}). Modifiez-le dans Réglages.`,
      );

    if (pendingImages.length && vision) {
      const imgs = pendingImages.splice(0, 4);
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: imgs.map((i) => i.caption).join('; ') },
          ...imgs.map((i) => ({ type: 'image_url' as const, image_url: { url: i.dataUrl } })),
        ],
      });
    }
    stepsDone = step + 1;
    if (pendingNotes.length) {
      messages.push({ role: 'user', content: pendingNotes.splice(0).join('\n\n') });
    }
    const compacted = compact(messages, contextBudget, inp.text);
    messages.splice(0, messages.length, ...compacted);
    // JEV LIVE CONTEXT PRUNING: old, large tool outputs → short stubs (REMOVE_CONTEXT).
    if (live && step >= 2) {
      const mode = jevRt.jevSettings().mode;
      const cut = pruneToolOutputs(messages, mode === 'max' ? 8 : mode === 'eco' ? 2 : 4);
      if (cut > 0) {
        prunedTokens += cut;
        live.checkpoints.push({
          kind: 'budget_threshold',
          step,
          at: Date.now(),
          ms: 0,
          decisions: [
            {
              action: 'REMOVE_CONTEXT',
              reason: `sorties d’outils anciennes élaguées (−${cut} tokens à chaque appel suivant)`,
            },
          ],
        });
        traceAdd({
          name: 'JEV_CHECKPOINT',
          ms: 0,
          tokens: 0,
          cost: 0,
          decision: `REMOVE_CONTEXT : −${cut} tokens (sorties anciennes)`,
        });
      }
    }
    if (live) live.addSaved(prunedTokens + removedToolTokens);

    const offered = phase === 'planning' ? planTools : packTools;
    if (top) {
      toolTokensSent += toolDefTokens(toolDefs(offered));
      for (const t of offered) offeredCount.set(t, (offeredCount.get(t) ?? 0) + 1);
    }
    const callMessages =
      phase === 'planning'
        ? [{ ...messages[0]!, content: `${fullSystem}\n\n${PLAN_MODE}` }, ...messages.slice(1)]
        : messages;
    const itemId = uid();
    let streamed = '';
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const started = Date.now();
    push(sid, { kind: 'assistant', id: itemId, text: '', agent: label, streaming: true });
    useStore.setState({
      status: { ...useStore.getState().status, [sid]: label ? `${label} réfléchit…` : 'Réflexion…' },
    });
    const r = await complete(
      {
        model,
        messages: callMessages,
        tools: toolDefs(offered),
        temperature: ws.temperature ?? undefined,
        maxTokens: 16_000,
        signal: inp.signal,
      },
      {
        models,
        fallbacks: fallbackChain.filter((m) => m !== model),
        effort,
        onText: (d) => {
          streamed += d;
          // Batch UI updates (one render per ~50 ms instead of one per token).
          flushTimer ??= setTimeout(() => {
            flushTimer = null;
            st.updateItem(sid, itemId, { text: streamed });
          }, 50);
        },
        onReset: () => {
          streamed = '';
          st.updateItem(sid, itemId, { text: '' });
        },
        onStatus: (s) => useStore.setState({ status: { ...useStore.getState().status, [sid]: s } }),
        onFallback: (from, to, reason) => {
          useStore.getState().recordModel(from, false);
          fallbackCount++;
          model = to;
          push(sid, {
            kind: 'error',
            id: uid(),
            text: `${from} indisponible (${reason.slice(0, 120)}) → bascule sur ${to}`,
          });
        },
      },
    );
    if (flushTimer) clearTimeout(flushTimer);
    st.updateItem(sid, itemId, { text: r.content, streaming: false });
    useStore.getState().recordModel(r.model || model, true);
    usedModels.add(r.model || model);
    useStore.getState().addUsage({
      ts: Date.now(),
      sessionId: sid,
      model: r.model || model,
      agent: inp.agent.id,
      cost: r.cost,
      tokensIn: r.usage.promptTokens,
      tokensOut: r.usage.completionTokens,
      durationMs: Date.now() - started,
      fallback: (r.model || model) !== sel.model,
      tools: r.toolCalls.map((c) => c.function.name.replace(/__/g, '.')),
    });
    cost += r.cost;
    tokensIn += r.usage.promptTokens;
    tokensOut += r.usage.completionTokens;
    // Live totals (Mission Control, header) — sub-agents add to the same session.
    useStore.getState().patchSession(sid, (cur) => ({
      cost: cur.cost + r.cost,
      tokensIn: cur.tokensIn + r.usage.promptTokens,
      tokensOut: cur.tokensOut + r.usage.completionTokens,
    }));
    useStore.getState().addSpend(r.cost);
    if (r.content.trim()) finalText = r.content;
    modelCalls++;
    if (live) {
      const cp = live.afterCall({
        tokensIn: r.usage.promptTokens,
        tokensOut: r.usage.completionTokens,
        cost: r.cost,
        content: r.content,
        toolCalls: r.toolCalls.map((c) => ({
          name: c.function.name.replace(/__/g, '.'),
          args: c.function.arguments ?? '',
        })),
        contextTokens: estimate(messages),
        contextLimit: contextBudget,
        model: r.model || model,
      });
      const ov = live.overhead(priceOf(r.model || model) || 1);
      if (ov.downgrade)
        traceAdd({
          name: 'JEV_CHECKPOINT',
          ms: 0,
          tokens: 0,
          cost: 0,
          decision: 'AUTO-DOWNGRADE → JEV-0 : JEV coûtait plus qu’il n’économisait',
        });
      // JEV-3 deep control (critical / multi-agent only): remote judgment at stagnation / drift.
      if (cp && (cp.kind === 'stagnation' || cp.kind === 'drift') && live.state().level >= 3) {
        const j = await jevRt.liveJudge(inp.text, r.content, live.state());
        if (j) {
          live.addJevCost(j.costUsd, j.ms);
          traceAdd({
            name: 'JEV_CHECKPOINT',
            ms: j.ms,
            tokens: j.tokens,
            cost: j.costUsd,
            decision: `JEV-3 : objectif atteint ${Math.round(j.done * 100)} %, sur la bonne voie ${Math.round(j.onTrack * 100)} %`,
          });
          if (j.done >= 0.85 && r.content.trim().length > 80) {
            cp.decisions = [
              {
                action: 'STOP',
                reason: `JEV-3 : objectif atteint (${Math.round(j.done * 100)} %) — arrêt anticipé`,
              },
            ];
          }
        }
      }
      if (applyLive(cp, step + 1) === 'stop') {
        push(sid, {
          kind: 'intel',
          id: uid(),
          title: 'JEV LIVE : arrêt',
          tone: 'warn',
          lines: cp!.decisions.filter((d) => d.action === 'STOP').map((d) => d.reason),
        });
        if (r.content.trim()) finalText = r.content;
        break;
      }
      liveSync();
    }
    for (const c of r.toolCalls) toolsUsed.add(c.function.name.replace(/__/g, '.'));

    const calls: ToolCall[] = r.toolCalls.map((c, i) => ({ ...c, id: c.id || `call_${step}_${i}` }));
    const assistant: ChatMessage = { role: 'assistant', content: r.content || null };
    if (calls.length) assistant.tool_calls = calls;
    if (r.reasoningDetails?.length) assistant.reasoning_details = r.reasoningDetails;
    messages.push(assistant);
    persisted.push(assistant);
    if (!r.content.trim())
      useStore.getState().patchSession(sid, (s) => ({ items: s.items.filter((i) => i.id !== itemId) }));

    if (!calls.length) {
      if (r.finishReason === 'length' && continuations < 2) {
        continuations++;
        const c: ChatMessage = {
          role: 'user',
          content: 'Your previous answer was cut off. Continue exactly where you stopped.',
        };
        messages.push(c);
        persisted.push(c);
        continue;
      }
      if (phase === 'planning') {
        if (!nudged) {
          nudged = true;
          messages.push({
            role: 'user',
            content: 'Submit your plan now by calling plan.propose (summary + steps).',
          });
          continue;
        }
        proposed = {
          summary: r.content || 'Plan',
          steps: r.content
            .split('\n')
            .filter((l) => /^\s*(\d+[.)]|[-*])\s+/.test(l))
            .map((l) => l.replace(/^\s*(\d+[.)]|[-*])\s+/, '')),
        };
      } else if (top && !inp.mission && gates < 2 && (shadow || strategy?.verify.evidence || jp)) {
        // Delivery gates: unverified claims (shadow) and figures without evidence.
        gates++;
        shadow?.observeFinal(r.content);
        const alerts = shadow?.take() ?? [];
        const unsupported = strategy?.verify.evidence ? unsupportedNumbers(r.content, evidence) : [];
        const notes: string[] = [];
        if (alerts.length) {
          showAlerts(alerts);
          notes.push(shadowMessage(alerts));
        }
        if (unsupported.length) {
          push(sid, {
            kind: 'intel',
            id: uid(),
            title: 'Contrôle des preuves : chiffres sans source',
            tone: 'warn',
            lines: [`${unsupported.join(' · ')} — n’apparaissent dans aucun résultat d’outil`],
          });
          notes.push(
            `[EVIDENCE CHECK] These figures in your answer appear in no tool result or user message: ${unsupported.join(', ')}. Verify them with a tool (data.query, code.run…) and correct them, or mark them explicitly as estimates — then give the final answer again.`,
          );
        }
        // JEV OUTPUT QA → targeted correction only when it pays.
        if (jp) {
          const tq = performance.now();
          const q = jevRt.qa({
            answer: r.content,
            spec: jp.pre.spec,
            evidence,
            usedTools: toolsUsed.size > 0,
            toolErrors: shadow?.toolErrors.length ?? 0,
            toolCalls: toolsUsed.size,
            tokens: tokensIn + tokensOut,
            tokenBudget: jp.pre.budgets.tokens,
            mode: jevRt.jevSettings().mode,
            corrections,
            budgetLeft: budgetLeft(cost),
            estCost: r.cost,
          });
          jevQuality = q.result.score;
          traceAdd({
            name: 'JEV_QA',
            ms: performance.now() - tq,
            tokens: 0,
            cost: 0,
            decision: `QA ${q.result.levels.join('+')} : qualité ${q.result.score}/100${q.result.failures.length ? ` · ${q.result.failures.map((f) => `${f.what} [${f.locus}]`).join(' ; ')}` : ''} · ${q.why}`,
          });
          const retryCp = live?.beforeRetry({
            quality: q.result.score,
            corrections,
            maxCorrections: jp.pre.budgets.corrections,
            blocking: q.result.failures.filter((f) => f.blocking).length,
          });
          if (retryCp) liveSync();
          live?.setQuality(q.result.score);
          if (q.correct && !unsupported.length && variant === 'full') {
            corrections++;
            discardedTokens += r.usage.completionTokens;
            notes.push(q.correct);
            traceAdd({ name: 'JEV_CORRECTION', ms: 0, tokens: 0, cost: 0, decision: q.why });
          }
        }
        if (!notes.length) break;
        const g: ChatMessage = { role: 'user', content: notes.join('\n\n') };
        messages.push(g);
        persisted.push(g);
        continue;
      } else if (inp.mission && missionNudges < 3) {
        missionNudges++;
        const nudge: ChatMessage = {
          role: 'user',
          content:
            'The mission is not finished: continue the pipeline (test, review, correct, validate). When everything is verified, call mission.report with an honest verdict.',
        };
        messages.push(nudge);
        persisted.push(nudge);
        continue;
      } else break;
    }

    // Tool execution. JEV PARALLELISM: independent sub-agent delegations of one turn run together.
    const poolOf = () =>
      phase === 'planning' ? planTools : [...packTools, ...tools.filter((t) => !packTools.includes(t))];
    const parallel =
      live &&
      calls.length >= 2 &&
      calls.length <= 4 &&
      calls.every((c) => c.function.name.replace(/__/g, '.') === 'agent.delegate');
    const preRun = parallel ? await Promise.all(calls.map((c) => runTool(c, poolOf(), ctx, inp))) : null;
    if (parallel)
      traceAdd({
        name: 'JEV_CHECKPOINT',
        ms: 0,
        tokens: 0,
        cost: 0,
        decision: `${calls.length} délégations indépendantes exécutées en parallèle`,
      });
    for (const [ci, call] of calls.entries()) {
      const pool = poolOf();
      const res = preRun ? preRun[ci]! : await runTool(call, pool, ctx, inp);
      if (jp && phase !== 'planning') {
        const used = tools.find(
          (t) => llmName(t.name) === call.function.name || t.name === call.function.name,
        );
        if (used && !packTools.includes(used)) {
          packTools.push(used);
          traceAdd({
            name: 'JEV_EXECUTION',
            ms: 0,
            tokens: 0,
            cost: 0,
            decision: `ADD TOOL : ${used.name} (appelé hors du pack)`,
          });
        }
        if (live) {
          const cp = live.afterTool({
            name: call.function.name.replace(/__/g, '.'),
            args: call.function.arguments ?? '',
            ok: !/^(Error|Denied)/.test(res),
            output: res.slice(0, 2000),
          });
          applyLive(cp, step + 1);
        }
      }
      if (top) {
        const sig = `${call.function.name}:${call.function.arguments ?? ''}`;
        const tk = estimate([{ role: 'tool', content: `${call.function.arguments ?? ''}${res}` }]);
        if (/^(Error|Denied)/.test(res)) failedToolTokens += tk;
        else if (toolSigs.has(sig)) repeatedToolTokens += tk;
        toolSigs.set(sig, (toolSigs.get(sig) ?? 0) + 1);
      }
      const m: ChatMessage = { role: 'tool', tool_call_id: call.id, content: res };
      messages.push(m);
      persisted.push(m);
      evidence.push(res.slice(0, 40_000));
      if (shadow) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          /* invalid args already reported */
        }
        shadow.observeTool(call.function.name.replace(/__/g, '.'), args, !/^(Error|Denied)/.test(res), res);
      }
    }
    // Shadow alerts go to the agent at once (high value only) and to the user.
    if (shadow) {
      const alerts = shadow.take();
      showAlerts(alerts);
      if (alerts.some((a) => a.severity !== 'info') || alerts.length >= 2) {
        const note: ChatMessage = { role: 'user', content: shadowMessage(alerts) };
        messages.push(note);
      }
    }

    // Plan approval gate
    if (phase === 'planning' && proposed) {
      const p = proposed as { summary: string; steps: string[] };
      proposed = null;
      const planId = uid();
      const decision = await new Promise<{ decision: 'approve' | 'cancel'; steps?: string[] }>((resolve) => {
        useStore.getState().pending.plans.set(planId, resolve);
        push(sid, { kind: 'plan', id: planId, summary: p.summary, steps: p.steps });
      });
      useStore.getState().pending.plans.delete(planId);
      st.updateItem(sid, planId, { resolved: decision.decision });
      if (decision.decision === 'cancel') {
        finalText = finalText || 'Plan annulé.';
        break;
      }
      const steps = decision.steps?.length ? decision.steps : p.steps;
      ctx.setPlan(steps.map((t, i) => ({ title: t, status: i === 0 ? 'in_progress' : 'pending' })));
      const go: ChatMessage = {
        role: 'user',
        content: `Plan approved:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nExecute it now step by step, keep the checklist current with plan.update, and verify each step.`,
      };
      messages.push(go);
      persisted.push(go);
      phase = 'executing';
    }

    // Mission: verdict → correction rounds → independent final review.
    if (inp.mission && pendingReport) {
      const report: MissionReport = pendingReport;
      pendingReport = null;
      lastReport = report;
      missionRound++;
      recordMission(inp.text, report, { model, cost });
      if (report.status !== 'PARTIAL')
        useStore.getState().recordOutcome(model, report.status === 'PASSED', profile.type);
      if (report.status !== 'PASSED' && missionRound < 3) {
        escalate(qaScore({ status: report.status, checks: report.checks }), `verdict ${report.status}`);
        push(sid, { kind: 'mission', id: uid(), report, round: missionRound });
        const fix: ChatMessage = {
          role: 'user',
          content: `Correction round ${missionRound + 1}: the verdict is ${report.status}. Fix the failing checks and remaining issues (${report.issues.join('; ').slice(0, 1500) || 'see your report'}), re-test everything, then call mission.report again.`,
        };
        messages.push(fix);
        persisted.push(fix);
        continue;
      }
      // Evidence check + red team before the final judge.
      if (report.status === 'PASSED' && strategy && inp.depth < MAX_DEPTH && challenged < 2) {
        const unsupported = strategy.verify.evidence
          ? unsupportedNumbers(`${finalText}\n${report.summary}`, evidence)
          : [];
        if (strategy.verify.adversarial || unsupported.length) {
          challenged++;
          ctx.mission!.stage('review', 'red team');
          const ch = await delegate(inp, 'adversarial', ADVERSARIAL_TASK(inp.text, report, unsupported));
          const c = parseChallenge(ch.summary);
          push(sid, {
            kind: 'intel',
            id: uid(),
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
              qaScore({
                status: report.status,
                checks: report.checks,
                blocking: c.blocking.length,
                unsupportedNumbers: unsupported.length,
              }),
              'red team bloquante',
            );
            const fix: ChatMessage = {
              role: 'user',
              content: `The red team found blocking problems:\n${c.blocking.map((b) => `- ${b}`).join('\n')}\n\nFix them, re-verify with tools, then call mission.report again.`,
            };
            messages.push(fix);
            persisted.push(fix);
            continue;
          }
        }
      }
      if (report.status === 'PASSED' && reviews < 2 && inp.depth < MAX_DEPTH) {
        reviews++;
        ctx.mission!.stage('validation');
        const rev = await delegate(inp, 'final_reviewer', FINAL_REVIEW_TASK(inp.text, report));
        const approved = rev.ok && reviewApproved(rev.summary);
        push(sid, {
          kind: 'mission',
          id: uid(),
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
          persisted.push(fix);
          continue;
        }
      } else push(sid, { kind: 'mission', id: uid(), report, round: missionRound });
      ctx.mission!.stage('delivery');
      lastQa = qaScore({ status: report.status, checks: report.checks });
      finalText = `${finalText ? `${finalText}\n\n` : ''}${formatReport(report)}`;
      break;
    }
    if (step === ws.maxSteps - 1)
      throw new Error(
        `Limite de ${ws.maxSteps} étapes atteinte. Augmentez-la dans Réglages ou répondez « continue ».`,
      );
  }
  return {
    ok: true,
    text: finalText,
    messages: persisted,
    cost,
    tokensIn,
    tokensOut,
    report: lastReport,
    models: [...usedModels],
    fallbacks: fallbackCount,
    dna,
    strategy,
    tier: routed?.tier ?? profile.tier,
    shadow,
    steps: stepsDone,
    challenged,
    qa: lastQa,
    escalations,
    decision,
    toolsUsed: [...toolsUsed],
    calls: modelCalls,
    skills: engineSkills.map((m) => m.skill.name),
    mcp: decision?.mcp ?? [],
    jev: jp
      ? {
          pre: jp.pre,
          trace: jevTrace,
          jevCost: jp.jevCost,
          itemId: jevItemId,
          toolTokens: toolDefTokens(toolDefs(packTools)),
          toolTokensBaseline,
          toolsOffered: packTools.length,
          contextBefore: ctxHist.before + toolTokensBaseline,
          contextAfter: ctxHist.after + toolTokens,
          quality: lastQa ?? jevQuality,
          corrections,
          decisionMs: jevDecisionMs,
        }
      : null,
    baselineTools: top ? { offered: tools.length, tokens: toolTokensBaseline } : undefined,
    waste: top
      ? wasteRate({
          toolTokensSent,
          unusedToolTokens: [...offeredCount].reduce(
            (acc, [t, n]) => (toolsUsed.has(t.name) ? acc : acc + toolDefTokens(toolDefs([t])) * n),
            0,
          ),
          failedToolTokens,
          repeatedToolTokens,
          discardedTokens,
          totalTokens: tokensIn + tokensOut,
        })
      : undefined,
    live: live
      ? {
          state: (liveSync(), live.finish(inp.signal.aborted ? 'paused' : 'done')),
          checkpoints: live.checkpoints,
          switches,
          overhead: live.overhead(priceOf(model) || 1),
          promptWaste: compiledPrompt?.wasteScore ?? 0,
          skillTokensSaved,
        }
      : null,
  };
}

async function runTool(call: ToolCall, offered: DirectTool[], ctx: ToolCtx, inp: LoopInput): Promise<string> {
  const st = useStore.getState();
  const sid = inp.session.id;
  const tool = offered.find((t) => llmName(t.name) === call.function.name || t.name === call.function.name);
  const name = tool?.name ?? call.function.name.replace(/__/g, '.');
  let args: Record<string, unknown> = {};
  try {
    args = call.function.arguments?.trim()
      ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
      : {};
  } catch {
    return `Error: arguments are not valid JSON: ${call.function.arguments?.slice(0, 300)}`;
  }
  const itemId = uid();
  const lbl = tool?.label(args) ?? name;
  st.pushItem(sid, {
    kind: 'tool',
    id: itemId,
    tool: name,
    label: lbl,
    args,
    status: 'running',
    agent: inp.agentLabel,
  });
  const fail = (status: 'error' | 'denied', summary: string, msg: string) => {
    st.updateItem(sid, itemId, { status, summary });
    return msg;
  };
  if (!tool)
    return fail(
      'error',
      'outil indisponible',
      `Error: tool "${name}" is not available${inp.plan ? ' in PLAN MODE (read-only until the plan is approved)' : ''}. Use only the provided tools.`,
    );

  const grants = st.grants[sid] ?? [];
  const decision = decide(inp.session.mode, tool, grants.includes(tool.name), args);
  if (decision === 'deny')
    return fail(
      'denied',
      `bloqué (${inp.session.mode})`,
      `Denied: not allowed in ${inp.session.mode.toUpperCase()} mode.`,
    );
  if (decision === 'ask') {
    let preview: Awaited<ReturnType<NonNullable<DirectTool['preview']>>> | undefined;
    try {
      preview = await tool.preview?.(args);
    } catch (e) {
      return fail('error', 'erreur', `Error: ${(e as Error).message}`);
    }
    const approvalId = uid();
    useStore.setState({
      status: { ...useStore.getState().status, [sid]: 'En attente de votre validation…' },
    });
    const d = await new Promise<{ decision: 'approve' | 'deny'; always?: boolean; note?: string }>(
      (resolve) => {
        st.pending.approvals.set(approvalId, resolve);
        const onAbort = () => resolve({ decision: 'deny', note: 'annulé' });
        inp.signal.addEventListener('abort', onAbort, { once: true });
        st.pushItem(sid, {
          kind: 'approval',
          id: approvalId,
          tool: tool.name,
          label: lbl,
          preview: preview?.text ?? JSON.stringify(args, null, 2).slice(0, 3000),
          diff: preview?.diff,
          agent: inp.agentLabel,
        });
      },
    );
    st.pending.approvals.delete(approvalId);
    st.updateItem(sid, approvalId, { resolved: d.decision });
    if (d.decision === 'deny')
      return fail(
        'denied',
        'refusé',
        `The user denied this action.${d.note ? ` Feedback: ${d.note}` : ''} Do not retry it as-is.`,
      );
    if (d.always)
      useStore.setState({ grants: { ...useStore.getState().grants, [sid]: [...grants, tool.name] } });
  }
  try {
    const out = await tool.run(args, ctx);
    st.updateItem(sid, itemId, {
      status: out.ok ? 'ok' : 'error',
      summary: out.summary,
      output: out.output,
      chart: out.chart,
      artifact: out.artifact,
    });
    return out.ok ? out.forModel : `Error: ${out.forModel}`;
  } catch (e) {
    if (inp.signal.aborted) throw new LLMError('Cancelled', 499, false, 'cancelled');
    const msg = (e as Error).message ?? String(e);
    return fail('error', msg.slice(0, 160), `Error: ${msg}`);
  }
}

async function delegate(
  parent: LoopInput,
  role: string,
  task: string,
): Promise<{ ok: boolean; summary: string }> {
  const st = useStore.getState();
  const agent = allAgents(st.agents).find((a) => a.id === role);
  if (!agent)
    return {
      ok: false,
      summary: `Unknown agent "${role}". Available: ${allAgents(st.agents)
        .map((a) => a.id)
        .join(', ')}`,
    };
  const itemId = uid();
  if (parent.depth === 0) runTeam.add(agent.id);
  st.pushItem(parent.session.id, { kind: 'subagent', id: itemId, role: agent.name, task, status: 'running' });
  // JEV strategy for the agent: budget, success criteria and the relevant context of the mission.
  const pk = currentPacket?.packet;
  const jevTask = pk
    ? `${task}\n\n<jev_subpacket agent="${agent.id}">\nbudget: ≤ ${Math.max(4, Math.round(pk.max_steps / 2))} steps; stop when done.\nsuccess: ${pk.success_criteria.join('; ')}\n${pk.context_required.length ? `relevant files: ${pk.context_required.slice(0, 8).join(', ')}\n` : ''}${currentPacket!.contract ? `${currentPacket!.contract}\n` : ''}</jev_subpacket>`
    : task;
  try {
    const r = await loop({
      ...parent,
      agent,
      text: jevTask,
      attachments: [],
      history: [],
      plan: false,
      mission: false,
      depth: parent.depth + 1,
      agentLabel: agent.name,
      model: agent.model?.includes('/') ? agent.model : parent.model,
    });
    st.updateItem(parent.session.id, itemId, { status: 'done', summary: r.text.slice(0, 4000) });
    sub.cost += r.cost;
    sub.tokensIn += r.tokensIn;
    sub.tokensOut += r.tokensOut;
    return { ok: true, summary: r.text || '(no answer)' };
  } catch (e) {
    if (parent.signal.aborted) throw e;
    st.updateItem(parent.session.id, itemId, { status: 'error', summary: friendlyError(e) });
    return { ok: false, summary: `Sub-agent failed: ${friendlyError(e)}` };
  }
}
const sub = { cost: 0, tokensIn: 0, tokensOut: 0 };

/** Starts a run in a session (UI entry point). */
export async function runAgent(
  sessionId: string,
  text: string,
  attachments: Attachment[],
  opts: { mode?: AgentMode; jev?: boolean | JevVariant; bench?: string; rep?: number } = {},
): Promise<void> {
  const st = useStore.getState();
  const benchTag = opts.bench ?? null;
  jevOverride =
    opts.jev === undefined ? null : opts.jev === true ? 'full' : opts.jev === false ? 'off' : opts.jev;
  const session = st.sessions.find((s) => s.id === sessionId);
  if (!session || st.running[sessionId]) return;
  const ac = new AbortController();
  useStore.setState({ running: { ...st.running, [sessionId]: ac } });
  st.pushItem(sessionId, { kind: 'user', id: uid(), text, attachments, ts: Date.now() });
  // JEV USER FEEDBACK LOOP: « parfait » / « c'est mauvais » judge the previous answer.
  const fb = jevRt.feedbackOf(text);
  if (fb) jevRt.feedback(sessionId, fb);
  // Telemetry: a correction of the previous answer counts against that mission's model.
  if (fb === 'bad' || isHumanCorrection(text)) {
    const prev = [...st.ledger.entries].reverse().find((e) => e.session === sessionId);
    if (prev && !prev.humanCorrection) {
      st.setLedger({
        entries: st.ledger.entries.map((e) => (e.id === prev.id ? { ...e, humanCorrection: true } : e)),
      });
      if (!fb) st.recordOutcome(prev.model, false, prev.dna.type);
    }
  }
  if (session.title === 'Nouvelle session')
    st.patchSession(sessionId, { title: text.split('\n')[0]!.slice(0, 70) || 'Session' });
  const started = Date.now();
  // JEV L0: requests answered without any model (pure arithmetic, date / time).
  const direct =
    jevEnabled() && !attachments.length && (opts.mode ?? st.agentMode) !== 'plan'
      ? jevRt.directAnswer(text)
      : null;
  if (direct) {
    const t0 = performance.now();
    st.pushItem(sessionId, { kind: 'assistant', id: uid(), text: direct });
    st.pushItem(sessionId, {
      kind: 'usage',
      id: uid(),
      cost: 0,
      promptTokens: 0,
      completionTokens: 0,
      model: 'JEV-0',
      durationMs: Date.now() - started,
    });
    st.patchSession(sessionId, (cur) => ({
      history: [...cur.history, { role: 'user', content: text }, { role: 'assistant', content: direct }],
    }));
    jevRt.learn({
      id: uid(),
      at: started,
      session: sessionId,
      mission: text.slice(0, 200),
      task: 'chat',
      mode: jevRt.jevSettings().mode,
      jev: true,
      level: 0,
      decisionBy: 'direct',
      model: 'JEV-0',
      reason: 'réponse déterministe sans LLM',
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
      jevCost: 0,
      latencyMs: Date.now() - started,
      decisionMs: performance.now() - t0,
      calls: 0,
      quality: 100,
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
      checkpoints: [
        {
          name: 'JEV_PRE',
          ms: performance.now() - t0,
          tokens: 0,
          cost: 0,
          decision: 'L0 : réponse calculée, aucun appel LLM',
        },
      ],
    });
    const { [sessionId]: _r, ...running } = useStore.getState().running;
    useStore.setState({ running });
    return;
  }
  sub.cost = sub.tokensIn = sub.tokensOut = 0;
  runTeam.clear();
  liveTrace = null;
  currentPacket = null;
  beginCheckpoint(sessionId, text);
  let result: LoopResult | null = null;
  let errored = false;
  const mode = opts.mode ?? st.agentMode;
  try {
    if (!st.models.length) {
      const { loadCatalog } = await import('./llm');
      useStore.setState({ models: await loadCatalog() });
    }
    result = await loop({
      session,
      agent: findAgent(session.agent, st.agents),
      text,
      attachments,
      history: session.history,
      plan: mode === 'plan',
      mission: mode === 'mission',
      depth: 0,
      signal: ac.signal,
      model: session.model,
      effort: session.effort,
    });
  } catch (e) {
    const cancelled = ac.signal.aborted || (e instanceof LLMError && e.code === 'cancelled');
    errored = !cancelled;
    st.pushItem(sessionId, { kind: 'error', id: uid(), text: cancelled ? 'Interrompu.' : friendlyError(e) });
    // Resume summary: an interrupted run can be continued with « continue ».
    const trace = currentTrace();
    if (trace && trace.messages.length > 3) {
      const resume = compressTrajectory(trace.messages as never[], trace.goal);
      st.patchSession(sessionId, { resume });
      st.pushItem(sessionId, {
        kind: 'intel',
        id: uid(),
        title: 'Résumé de reprise enregistré',
        tone: 'info',
        lines: ['Écrivez « continue » pour reprendre là où la mission s’est arrêtée.'],
        detail: resume,
      });
    }
  } finally {
    void endCheckpoint();
    const s = useStore.getState();
    const { [sessionId]: _done, ...running } = s.running;
    const { [sessionId]: _st, ...status } = s.status;
    useStore.setState({ running, status });
    const cost = (result?.cost ?? 0) + sub.cost;
    const tin = (result?.tokensIn ?? 0) + sub.tokensIn;
    const tout = (result?.tokensOut ?? 0) + sub.tokensOut;
    s.patchSession(sessionId, (cur) => ({
      // Keep images out of the stored history (they were sent once).
      history: result
        ? [
            ...cur.history,
            ...result.messages.map((m) =>
              Array.isArray(m.content)
                ? {
                    ...m,
                    content: m.content.map((p) =>
                      p.type === 'image_url' ? { type: 'text' as const, text: '[image envoyée]' } : p,
                    ),
                  }
                : m,
            ),
          ]
        : cur.history,
      items: [
        ...cur.items,
        {
          kind: 'usage',
          id: uid(),
          cost,
          promptTokens: tin,
          completionTokens: tout,
          model: result?.models.join(', ') ?? '',
          models: result?.models,
          fallbacks: result?.fallbacks,
          verdict: result?.report?.status,
          durationMs: Date.now() - started,
        },
      ],
      verdict: result?.report?.status ?? (errored ? 'ERROR' : (cur.verdict ?? null)),
      lastMode: mode,
    }));
    // LEARNING: every run feeds the mission ledger (strategy evolution, failure memory,
    // knowledge graph, regression suite).
    if (result?.dna || errored) {
      const sh = result?.shadow;
      const verdict: LedgerEntry['verdict'] = result?.report?.status
        ? result.report.status
        : errored
          ? 'ERROR'
          : sh && !sh.didVerify && sh.didWrite
            ? 'PARTIAL'
            : 'PASSED';
      const dnaE =
        result?.dna ??
        taskDna(
          text,
          attachments.map((a) => a.name),
          analyzeTask({ text, attachmentNames: attachments.map((a) => a.name) }),
        );
      const entry: LedgerEntry = {
        id: uid(),
        at: started,
        goal: text.slice(0, 400),
        dna: dnaE,
        tier: (result?.tier as LedgerEntry['tier']) ?? 'balanced',
        model: result?.models[0] ?? session.model,
        team: [...runTeam],
        verdict,
        challenged: result?.challenged,
        cost,
        durationMs: Date.now() - started,
        steps: result?.steps ?? 0,
        toolErrors: sh?.toolErrors.slice(-10) ?? [],
        rounds: result?.report
          ? (s.sessions.find((x) => x.id === sessionId)?.items.filter((i) => i.kind === 'mission').length ??
            0)
          : 0,
        files: {
          read: [...new Set(sh?.read ?? [])].slice(0, 40),
          written: [...new Set(sh?.written ?? [])].slice(0, 40),
        },
        checks: result?.report?.checks ?? [],
        session: sessionId,
        agent: session.agent,
        skills: result?.skills ?? [],
        mcp: result?.mcp ?? [],
        tools: result?.toolsUsed ?? [],
        tokensIn: tin,
        tokensOut: tout,
        calls: result?.calls,
        retries: result?.fallbacks ?? 0,
        qa: result?.qa,
        escalations: result?.escalations ?? 0,
        decision: result?.decision
          ? {
              chosen: result.decision.chosen?.id ?? null,
              tier: result.decision.tier,
              confidence: result.decision.confidence,
              mode: result.decision.mode,
            }
          : undefined,
        lessons: [
          ...(result?.report?.issues ?? []).slice(0, 3),
          ...(sh?.toolErrors.slice(-2).map((t) => `${t.tool}: ${t.error.slice(0, 100)}`) ?? []),
        ],
      };
      useStore.getState().setLedger(recordEntry(useStore.getState().ledger, entry));
    }
    // JEV_POST + JEV_LEARNING: measured telemetry of the run (JEV on, or baseline when off).
    if (result || errored) {
      const j = result?.jev ?? null;
      const success = result?.report?.status
        ? result.report.status === 'PASSED'
        : errored
          ? false
          : j?.quality != null
            ? j.quality >= 75
            : null;
      const trace: Checkpoint[] = j ? [...j.trace] : [];
      if (j) {
        trace.push({
          name: 'JEV_EXECUTION',
          ms: Date.now() - started,
          tokens: tin + tout,
          cost,
          decision: `${result?.calls ?? 0} appel(s) LLM · ${result?.models.join(', ') || '—'}`,
        });
        trace.push({
          name: 'JEV_POST',
          ms: 0,
          tokens: 0,
          cost: 0,
          decision: `qualité ${j.quality ?? '—'} · ${success === null ? 'non jugé' : success ? 'réussi' : 'échec'}`,
        });
        trace.push({
          name: 'JEV_LEARNING',
          ms: 0,
          tokens: 0,
          cost: 0,
          decision: 'profils modèles, ledger et JEV_LOG mis à jour',
        });
        s.updateItem(sessionId, j.itemId, {
          trace,
          done: true,
          live: result?.live
            ? { state: result.live.state, checkpoints: result.live.checkpoints.slice(-40), at: Date.now() }
            : undefined,
          summary: `${fmtTok(tin + tout)} tokens · $${(cost + j.jevCost).toFixed(4)} · qualité ${j.quality ?? '—'}`,
        });
      }
      const pk = j?.pre.packet;
      jevRt.learn({
        id: uid(),
        at: started,
        session: sessionId,
        mission: text.slice(0, 200),
        task: pk?.task_type ?? result?.dna?.type ?? 'chat',
        mode: jevRt.jevSettings().mode,
        jev: Boolean(j),
        level: pk?.level ?? 0,
        decisionBy: pk?.decided_by ?? 'JEV-0',
        model: result?.models[0] ?? session.model,
        reason: j?.pre.decision.why.model ?? '',
        tokensIn: tin,
        tokensOut: tout,
        cost,
        jevCost: j?.jevCost ?? 0,
        latencyMs: Date.now() - started,
        decisionMs: j?.decisionMs ?? 0,
        calls: result?.calls ?? 0,
        quality: j?.quality ?? result?.qa ?? null,
        success,
        retries: result?.fallbacks ?? 0,
        escalations: result?.escalations ?? 0,
        corrections: j?.corrections ?? 0,
        cacheHits: j?.pre.cacheHits ?? 0,
        toolsOffered: j?.toolsOffered ?? result?.baselineTools?.offered ?? 0,
        toolsBaseline: result?.baselineTools?.offered ?? 0,
        toolTokens: j?.toolTokens ?? result?.baselineTools?.tokens ?? 0,
        toolTokensBaseline: result?.baselineTools?.tokens ?? 0,
        contextBefore: j?.contextBefore ?? 0,
        contextAfter: j?.contextAfter ?? 0,
        checkpoints: trace,
        bench: benchTag ?? undefined,
        variant: jevVariant(),
        rep: opts.rep,
        wasted: result?.waste?.wasted,
        wasteRate: result?.waste?.rate ?? null,
        liveDecisions:
          result?.live?.checkpoints.reduce(
            (n, c) => n + c.decisions.filter((d) => d.action !== 'CONTINUE').length,
            0,
          ) ?? 0,
        modelSwitches: result?.live?.switches ?? 0,
        liveSavedTokens: result?.live?.state.savedTokens ?? 0,
        overheadPct: result?.live?.overhead.pct ?? null,
        promptWaste: result?.live?.promptWaste ?? 0,
      });
    }
  }
}

export function stopAgent(sessionId: string): void {
  useStore.getState().running[sessionId]?.abort(new Error('Arrêté par l’utilisateur'));
}

export function resolveApproval(
  id: string,
  decision: 'approve' | 'deny',
  opts: { always?: boolean; note?: string } = {},
): void {
  useStore.getState().pending.approvals.get(id)?.({ decision, ...opts });
}

export function resolvePlan(id: string, decision: 'approve' | 'cancel', steps?: string[]): void {
  useStore.getState().pending.plans.get(id)?.({ decision, steps });
}
