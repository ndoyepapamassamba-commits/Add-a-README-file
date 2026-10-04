// The agent loop, running entirely in the browser: plan → tools → observe → verify.
import type { EffortSetting } from '@shared/types';
import { selectModel } from '../../server/llm/router';
import { analyzeTask, routeModel } from '../../server/llm/routing';
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
import { isDataFile, profileToText, DataCore } from '../../server/services/dataCore';
import { isDocument, isImage } from '../../server/services/documentsCore';
import { LLMError, type ChatMessage, type ContentPart, type ToolCall } from '../../server/llm/types';
import { complete, friendlyError } from './llm';
import { connectedTools, ensureConnected, mcpState } from './mcp';
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
Not available here: shell/terminal, local disk outside the workspace, desktop apps. ${has('code.run') ? 'Use code.run (sandboxed JavaScript/Python) for computations.' : ''}`,
  ];
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
function compact(msgs: ChatMessage[], budget: number): ChatMessage[] {
  if (estimate(msgs) <= budget) return msgs;
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
}

function decide(mode: Session['mode'], t: DirectTool, granted: boolean): 'allow' | 'ask' | 'deny' {
  if (t.risk === 'read') return 'allow';
  // Deletions are always confirmed, even in autonomous mode.
  if (t.risk === 'delete') return mode === 'safe' ? 'deny' : 'ask';
  if (mode === 'auto') return 'allow';
  if (mode === 'safe' && WRITE_TOOLS.has(t.name)) return 'deny';
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
  let tools = [...TOOLS.filter((t) => t.name !== 'plan.propose'), ...mcpTools].filter((t) => {
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
  const hasImages = inp.attachments.some((a) => isImage(a.path));
  const profile = analyzeTask({
    text: inp.text,
    attachmentNames: inp.attachments.map((a) => a.name),
    hasImages,
    role: inp.agent.id,
    historyTokens: estimate(inp.history),
    mission: inp.mission,
  });
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
    routed = routeModel(models, tiers, profile, useStore.getState().health);
    if (routed) {
      sel.model = routed.model;
      sel.reason = routed.reason;
      routedFallbacks = routed.fallbacks;
    }
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
  const user: ChatMessage = { role: 'user', content };
  const messages: ChatMessage[] = [{ role: 'system', content: fullSystem }, ...inp.history, user];
  const persisted: ChatMessage[] = [user];
  const contextBudget = Math.min(Math.floor((info?.contextLength || 128_000) * 0.7), 400_000);

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
    const compacted = compact(messages, contextBudget);
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
      if (report.status !== 'PASSED' && missionRound < 3) {
        push(sid, { kind: 'mission', id: uid(), report, round: missionRound });
        const fix: ChatMessage = {
          role: 'user',
          content: `Correction round ${missionRound + 1}: the verdict is ${report.status}. Fix the failing checks and remaining issues (${report.issues.join('; ').slice(0, 1500) || 'see your report'}), re-test everything, then call mission.report again.`,
        };
        messages.push(fix);
        persisted.push(fix);
        continue;
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
  const decision = decide(inp.session.mode, tool, grants.includes(tool.name));
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
  if (session.title === 'Nouvelle session')
    st.patchSession(sessionId, { title: text.split('\n')[0]!.slice(0, 70) || 'Session' });
  const started = Date.now();
  sub.cost = sub.tokensIn = sub.tokensOut = 0;
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
  } finally {
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
