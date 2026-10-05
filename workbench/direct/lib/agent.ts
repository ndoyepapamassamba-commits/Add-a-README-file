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
}

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
  const dna = taskDna(
    inp.text,
    inp.attachments.map((a) => a.name),
    profile,
  );
  const strategy = top ? planStrategy(dna, profile, st.ledger, { mission: Boolean(inp.mission) }) : null;
  if (strategy && !prefTier) profile.tier = strategy.tier;
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
    decision = decideRoute({
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
    const selection = selectSkills(
      inp.text,
      inp.attachments.map((a) => a.name),
      { model: models.find((m) => m.id === sel.model), tools: tools.map((t) => t.name) },
    );
    engineSkills = selection.selected;
    const lo = buildLoadout({
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
  const fallbackChain = [
    ...new Set([st.settings.fallbackModel, ...routedFallbacks].filter((m) => m && m !== sel.model)),
  ];
  const info = models.find((m) => m.id === sel.model);
  const vision = info?.capabilities.vision ?? hasImages;
  const effort = (inp.effort && inp.effort !== 'auto' ? inp.effort : inp.agent.effort) ?? 'auto';
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
  if (active.length && !label) push(sid, { kind: 'skills', id: uid(), names: active.map((a) => a.name) });

  const system = systemPrompt({
    agent: inp.agent,
    mode: inp.session.mode,
    tools,
    skills: enabled,
    active,
    agents: allAgents(st.agents),
    plugins: plugins.map((p) => ({ name: p.name, instructions: mcpState(p.name).instructions })),
  });
  const fullSystem = [
    system,
    ENGINE_DOCTRINE,
    manualPrompt(useStore.getState().manual),
    strategy ? strategyPrompt(dna, strategy) : '',
    skillsPrompt(engineSkills),
    MEMORY_INSTRUCTIONS,
    inp.mission
      ? `${MISSION_PROTOCOL}\n\nTask profile: ${profile.reasons.join(', ')}.${profile.team.length ? ` Recommended specialists, in order: ${profile.team.join(' → ')}.` : ''}`
      : '',
  ]
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
  const messages: ChatMessage[] = [{ role: 'system', content: fullSystem }, ...inp.history, user];
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
      escalations++;
      model = step.model;
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
    const compacted = compact(messages, contextBudget, inp.text);
    messages.splice(0, messages.length, ...compacted);

    const offered = phase === 'planning' ? planTools : tools;
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
      } else if (top && !inp.mission && gates < 2 && (shadow || strategy?.verify.evidence)) {
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

    // Tool execution
    for (const call of calls) {
      const res = await runTool(call, offered, ctx, inp);
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
  try {
    const r = await loop({
      ...parent,
      agent,
      text: task,
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
  opts: { mode?: AgentMode } = {},
): Promise<void> {
  const st = useStore.getState();
  const session = st.sessions.find((s) => s.id === sessionId);
  if (!session || st.running[sessionId]) return;
  const ac = new AbortController();
  useStore.setState({ running: { ...st.running, [sessionId]: ac } });
  st.pushItem(sessionId, { kind: 'user', id: uid(), text, attachments, ts: Date.now() });
  // Telemetry: a correction of the previous answer counts against that mission's model.
  if (isHumanCorrection(text)) {
    const prev = [...st.ledger.entries].reverse().find((e) => e.session === sessionId);
    if (prev && !prev.humanCorrection) {
      st.setLedger({
        entries: st.ledger.entries.map((e) => (e.id === prev.id ? { ...e, humanCorrection: true } : e)),
      });
      st.recordOutcome(prev.model, false, prev.dna.type);
    }
  }
  if (session.title === 'Nouvelle session')
    st.patchSession(sessionId, { title: text.split('\n')[0]!.slice(0, 70) || 'Session' });
  const started = Date.now();
  sub.cost = sub.tokensIn = sub.tokensOut = 0;
  runTeam.clear();
  liveTrace = null;
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
