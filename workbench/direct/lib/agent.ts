// The agent loop, running entirely in the browser: plan → tools → observe → verify.
import type { EffortSetting } from '@shared/types';
import { selectModel } from '../../server/llm/router';
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
import type { AgentDef, Attachment, PlanStep, Session } from './types';
import { bytesOf, dataUrl, getFile, readAsText, tree } from './vfs';

const WRITE_TOOLS = new Set(['filesystem.write', 'filesystem.edit', 'filesystem.delete']);
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
    `You are an expert AI agent inside "OpenRouter AI Workbench", a Claude-Code-like workspace that runs in the user's browser.`,
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
}

interface LoopResult {
  ok: boolean;
  text: string;
  messages: ChatMessage[];
  cost: number;
  tokensIn: number;
  tokensOut: number;
}

function decide(mode: Session['mode'], t: DirectTool, granted: boolean): 'allow' | 'ask' | 'deny' {
  if (t.risk === 'read') return 'allow';
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
    if (inp.session.mode === 'safe' && WRITE_TOOLS.has(t.name)) return false;
    return true;
  });
  if (!st.skills.some((s) => s.enabled)) tools = tools.filter((t) => !t.name.startsWith('skill.'));
  const planTools = [...tools.filter((t) => t.readOnly), TOOLS.find((t) => t.name === 'plan.propose')!];

  // Model (AUTO router or explicit / agent preference)
  const pref = agentModelPreference(inp.agent.model);
  const requested = inp.model && inp.model !== 'auto' ? inp.model : (pref.id ?? 'auto');
  const tiers = pref.tier
    ? { ...DEFAULT_AUTO_TIERS, balanced: DEFAULT_AUTO_TIERS[pref.tier], fast: DEFAULT_AUTO_TIERS[pref.tier] }
    : DEFAULT_AUTO_TIERS;
  const hasImages = inp.attachments.some((a) => isImage(a.path));
  const sel = selectModel({
    requested,
    models,
    tiers,
    signals: { text: inp.text, hasImages, role: inp.agent.id, historyLength: inp.history.length },
    fallbackDefault: 'openai/gpt-4o-mini',
  });
  const info = models.find((m) => m.id === sel.model);
  const vision = info?.capabilities.vision ?? hasImages;
  const effort = (inp.effort && inp.effort !== 'auto' ? inp.effort : inp.agent.effort) ?? 'auto';
  if (!label) push(sid, { kind: 'model', id: uid(), model: sel.model, reason: sel.reason, auto: sel.auto });

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
  const firstTurn = !inp.history.some((m) => m.role === 'user');
  const user: ChatMessage = {
    role: 'user',
    content: await userContent(inp.text, inp.attachments, vision, firstTurn),
  };
  const messages: ChatMessage[] = [{ role: 'system', content: system }, ...inp.history, user];
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
    const compacted = compact(messages, contextBudget);
    messages.splice(0, messages.length, ...compacted);

    const offered = phase === 'planning' ? planTools : tools;
    const callMessages =
      phase === 'planning'
        ? [{ ...messages[0]!, content: `${system}\n\n${PLAN_MODE}` }, ...messages.slice(1)]
        : messages;
    const itemId = uid();
    let streamed = '';
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
        fallbacks: [ws.fallbackModel].filter(Boolean),
        effort,
        onText: (d) => {
          streamed += d;
          st.updateItem(sid, itemId, { text: streamed });
        },
        onReset: () => {
          streamed = '';
          st.updateItem(sid, itemId, { text: '' });
        },
        onStatus: (s) => useStore.setState({ status: { ...useStore.getState().status, [sid]: s } }),
        onFallback: (from, to, reason) => {
          model = to;
          push(sid, {
            kind: 'error',
            id: uid(),
            text: `${from} indisponible (${reason.slice(0, 120)}) → bascule sur ${to}`,
          });
        },
      },
    );
    st.updateItem(sid, itemId, { text: r.content, streaming: false });
    cost += r.cost;
    tokensIn += r.usage.promptTokens;
    tokensOut += r.usage.completionTokens;
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
    if (step === ws.maxSteps - 1)
      throw new Error(
        `Limite de ${ws.maxSteps} étapes atteinte. Augmentez-la dans Réglages ou répondez « continue ».`,
      );
  }
  return { ok: true, text: finalText, messages: persisted, cost, tokensIn, tokensOut };
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
export async function runAgent(sessionId: string, text: string, attachments: Attachment[]): Promise<void> {
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
      plan: st.agentMode === 'plan',
      depth: 0,
      signal: ac.signal,
      model: session.model,
      effort: session.effort,
    });
  } catch (e) {
    const cancelled = ac.signal.aborted || (e instanceof LLMError && e.code === 'cancelled');
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
      cost: cur.cost + cost,
      tokensIn: cur.tokensIn + tin,
      tokensOut: cur.tokensOut + tout,
      items: [
        ...cur.items,
        {
          kind: 'usage',
          id: uid(),
          cost,
          promptTokens: tin,
          completionTokens: tout,
          model: '',
          durationMs: Date.now() - started,
        },
      ],
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
