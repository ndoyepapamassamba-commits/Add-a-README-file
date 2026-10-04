import type {
  AgentEvent,
  ApprovalRequest,
  MissionReportPayload,
  PlanStep,
  RoleId,
  RunStatus,
  RunSummary,
  ToolResultPayload,
  UsageTotals,
} from '@shared/types';

export type ToolItem = {
  kind: 'tool';
  id: string;
  callId: string;
  tool: string;
  args: unknown;
  status: 'running' | 'ok' | 'error' | 'denied' | 'waiting';
  result?: ToolResultPayload;
  durationMs?: number;
  agentPath?: string;
};

export type Item =
  | { kind: 'user'; id: string; text: string; attachments: string[] }
  | { kind: 'text'; id: string; text: string; streaming: boolean; agentPath?: string }
  | ToolItem
  | {
      kind: 'approval';
      id: string;
      request: ApprovalRequest;
      resolved?: 'approve' | 'deny';
      agentPath?: string;
    }
  | { kind: 'plan'; id: string; steps: PlanStep[]; summary: string; resolved?: 'approve' | 'cancel' }
  | { kind: 'checklist'; id: string; steps: PlanStep[] }
  | {
      kind: 'subagent';
      id: string;
      childRunId: string;
      role: RoleId;
      task: string;
      summary?: string;
      ok?: boolean;
      children: Item[];
    }
  | {
      kind: 'model';
      id: string;
      model: string;
      reason: string;
      auto: boolean;
      effort?: string;
      tier?: string;
      fallbacks?: string[];
      estimate?: { low: number; high: number } | null;
    }
  | { kind: 'pipeline'; id: string; current: string; done: string[] }
  | {
      kind: 'mission';
      id: string;
      report: MissionReportPayload;
      round: number;
      review?: { approved: boolean; summary: string };
    }
  | { kind: 'fallback'; id: string; from: string; to: string; reason: string }
  | { kind: 'notice'; id: string; text: string }
  | { kind: 'skills'; id: string; skills: { name: string; reason: string; matched?: string[] }[] }
  | { kind: 'error'; id: string; message: string };

export interface RunView {
  run: RunSummary;
  items: Item[];
  status: RunStatus;
  usage: UsageTotals;
  contextTokens: number;
  contextLimit: number;
  statusText: string | null;
  thinking: boolean;
  plan: PlanStep[];
  model: string;
  skills: string[];
  durationMs: number | null;
  lastSeq: number;
  pendingApprovals: string[];
  pendingPlan: boolean;
  verdict: MissionReportPayload['status'] | null;
}

let uid = 0;
const nid = () => `i${++uid}`;

export function emptyRunView(run: RunSummary): RunView {
  return {
    run,
    items: [],
    status: run.status,
    usage: { promptTokens: run.tokensIn, completionTokens: run.tokensOut, cost: run.cost },
    contextTokens: 0,
    contextLimit: 0,
    statusText: null,
    thinking: false,
    plan: [],
    model: run.model,
    skills: [],
    durationMs: run.finishedAt ? run.finishedAt - run.startedAt : null,
    lastSeq: -1,
    pendingApprovals: [],
    pendingPlan: false,
    verdict: null,
  };
}

function openSubagent(items: Item[]): Extract<Item, { kind: 'subagent' }> | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!;
    if (it.kind === 'subagent' && it.summary === undefined) return it;
  }
  return undefined;
}

function updateTool(items: Item[], callId: string, fn: (t: ToolItem) => ToolItem): Item[] {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!;
    if (it.kind === 'tool' && it.callId === callId) {
      const next = items.slice();
      next[i] = fn(it);
      return next;
    }
    if (it.kind === 'subagent') {
      const children = updateTool(it.children, callId, fn);
      if (children !== it.children) {
        const next = items.slice();
        next[i] = { ...it, children };
        return next;
      }
    }
  }
  return items;
}

/** Pure reducer: applies one agent event to a run view (immutable updates). */
export function applyEvent(view: RunView, e: AgentEvent, seq: number): RunView {
  if (seq <= view.lastSeq) return view;
  const v: RunView = { ...view, lastSeq: seq };
  const nested = 'agentPath' in e && e.agentPath ? openSubagent(v.items) : undefined;
  const pushItem = (item: Item) => {
    if (nested) {
      const idx = v.items.indexOf(nested);
      const items = v.items.slice();
      items[idx] = { ...nested, children: [...nested.children, item] };
      v.items = items;
    } else v.items = [...v.items, item];
  };

  switch (e.type) {
    case 'run_started':
      v.items = [
        { kind: 'user', id: nid(), text: e.userText, attachments: e.attachments },
        ...v.items.filter((i) => i.kind !== 'user'),
      ];
      v.status = 'running';
      break;
    case 'status':
      v.statusText = e.text;
      break;
    case 'thinking':
      v.thinking = e.active;
      if (e.active) v.statusText = null;
      break;
    case 'model_selected':
      v.model = e.model;
      pushItem({
        kind: 'model',
        id: nid(),
        model: e.model,
        reason: e.reason,
        auto: e.auto,
        effort: e.effort,
        tier: e.tier,
        fallbacks: e.fallbacks,
        estimate: e.estimate,
      });
      break;
    case 'mission_stage': {
      const idx = v.items.findIndex((i) => i.kind === 'pipeline');
      if (idx >= 0) {
        const p = v.items[idx] as Extract<Item, { kind: 'pipeline' }>;
        const items = [...v.items];
        items[idx] = {
          ...p,
          current: e.stage,
          done: p.current && p.current !== e.stage ? [...new Set([...p.done, p.current])] : p.done,
        };
        v.items = items;
      } else pushItem({ kind: 'pipeline', id: nid(), current: e.stage, done: [] });
      break;
    }
    case 'mission_report':
      v.verdict = e.report.status;
      pushItem({ kind: 'mission', id: nid(), report: e.report, round: e.round, review: e.review });
      break;
    case 'model_fallback':
      v.model = e.to;
      pushItem({ kind: 'fallback', id: nid(), from: e.from, to: e.to, reason: e.reason });
      break;
    case 'text_delta': {
      const last = v.items[v.items.length - 1];
      if (last && last.kind === 'text' && last.streaming) {
        const items = v.items.slice();
        items[items.length - 1] = { ...last, text: last.text + e.text };
        v.items = items;
      } else v.items = [...v.items, { kind: 'text', id: nid(), text: e.text, streaming: true }];
      break;
    }
    case 'stream_reset': {
      const last = v.items[v.items.length - 1];
      if (last && last.kind === 'text' && last.streaming) v.items = v.items.slice(0, -1);
      break;
    }
    case 'assistant_message': {
      if (e.agentPath) {
        pushItem({ kind: 'text', id: nid(), text: e.text, streaming: false, agentPath: e.agentPath });
        break;
      }
      const last = v.items[v.items.length - 1];
      if (last && last.kind === 'text' && last.streaming) {
        const items = v.items.slice();
        items[items.length - 1] = { ...last, text: e.text, streaming: false };
        v.items = items;
      } else v.items = [...v.items, { kind: 'text', id: nid(), text: e.text, streaming: false }];
      break;
    }
    case 'tool_call':
      // finalise any streaming text before the tool row
      v.items = v.items.map((i) => (i.kind === 'text' && i.streaming ? { ...i, streaming: false } : i));
      pushItem({
        kind: 'tool',
        id: nid(),
        callId: e.callId,
        tool: e.tool,
        args: e.args,
        status: 'running',
        agentPath: e.agentPath,
      });
      break;
    case 'tool_result':
      v.items = updateTool(v.items, e.callId, (t) => ({
        ...t,
        status: e.result.ok
          ? 'ok'
          : /refus|bloqu|denied|blocked|non disponible/i.test(e.result.summary)
            ? 'denied'
            : 'error',
        result: e.result,
        durationMs: e.durationMs,
      }));
      break;
    case 'approval_required': {
      v.pendingApprovals = [...v.pendingApprovals, e.request.approvalId];
      // mark the matching running tool row as waiting
      let marked = false;
      const mark = (items: Item[]): Item[] =>
        items
          .slice()
          .reverse()
          .map((it) => {
            if (!marked && it.kind === 'tool' && it.status === 'running' && it.tool === e.request.tool) {
              marked = true;
              return { ...it, status: 'waiting' as const };
            }
            if (it.kind === 'subagent') return { ...it, children: mark(it.children) };
            return it;
          })
          .reverse();
      v.items = mark(v.items);
      v.items = [
        ...v.items,
        {
          kind: 'approval',
          id: nid(),
          request: e.request,
          agentPath: 'agentPath' in e ? (e as { agentPath?: string }).agentPath : undefined,
        },
      ];
      v.status = 'waiting_approval';
      break;
    }
    case 'approval_resolved': {
      v.pendingApprovals = v.pendingApprovals.filter((id) => id !== e.approvalId);
      v.items = v.items.map((i) =>
        i.kind === 'approval' && i.request.approvalId === e.approvalId ? { ...i, resolved: e.decision } : i,
      );
      const restore = (items: Item[]): Item[] =>
        items.map((it) =>
          it.kind === 'tool' && it.status === 'waiting'
            ? { ...it, status: 'running' as const }
            : it.kind === 'subagent'
              ? { ...it, children: restore(it.children) }
              : it,
        );
      v.items = restore(v.items);
      if (!v.pendingApprovals.length && v.status === 'waiting_approval') v.status = 'running';
      break;
    }
    case 'plan_proposed':
      v.items = [...v.items, { kind: 'plan', id: nid(), steps: e.steps, summary: e.summary }];
      v.pendingPlan = true;
      v.status = 'waiting_plan';
      break;
    case 'plan_resolved':
      v.pendingPlan = false;
      v.items = v.items.map((i) => (i.kind === 'plan' && !i.resolved ? { ...i, resolved: e.decision } : i));
      if (v.status === 'waiting_plan') v.status = e.decision === 'approve' ? 'running' : v.status;
      break;
    case 'plan_updated': {
      v.plan = e.steps;
      const idx = v.items.findIndex((i) => i.kind === 'checklist');
      if (idx >= 0) {
        const items = v.items.slice();
        items[idx] = { ...(items[idx] as Extract<Item, { kind: 'checklist' }>), steps: e.steps };
        // keep the checklist close to the latest activity
        const [cl] = items.splice(idx, 1);
        items.push(cl!);
        v.items = items;
      } else v.items = [...v.items, { kind: 'checklist', id: nid(), steps: e.steps }];
      break;
    }
    case 'subagent_started':
      v.items = [
        ...v.items,
        { kind: 'subagent', id: nid(), childRunId: e.childRunId, role: e.role, task: e.task, children: [] },
      ];
      break;
    case 'subagent_finished':
      v.items = v.items.map((i) =>
        i.kind === 'subagent' && i.childRunId === e.childRunId ? { ...i, summary: e.summary, ok: e.ok } : i,
      );
      break;
    case 'file_changed':
      break;
    case 'usage':
      v.usage = {
        promptTokens: v.usage.promptTokens + e.promptTokens,
        completionTokens: v.usage.completionTokens + e.completionTokens,
        cost: v.usage.cost + e.cost,
      };
      if (!('agentPath' in e)) {
        v.contextTokens = e.contextTokens;
        v.contextLimit = e.contextLimit;
      }
      break;
    case 'skills_activated':
      v.skills = [...new Set([...v.skills, ...e.skills.map((x) => x.name)])];
      pushItem({ kind: 'skills', id: nid(), skills: e.skills });
      break;
    case 'compacted':
      pushItem({
        kind: 'notice',
        id: nid(),
        text: `Contexte compacté (${e.removedMessages} messages résumés)`,
      });
      break;
    case 'error':
      v.items = [
        ...v.items.map((i) => (i.kind === 'text' && i.streaming ? { ...i, streaming: false } : i)),
        { kind: 'error', id: nid(), message: e.message },
      ];
      break;
    case 'run_finished':
      v.status = e.status;
      v.usage = e.usage;
      v.durationMs = e.durationMs;
      v.thinking = false;
      v.statusText = null;
      v.pendingApprovals = [];
      v.pendingPlan = false;
      v.items = v.items.map((i) =>
        i.kind === 'text' && i.streaming
          ? { ...i, streaming: false }
          : i.kind === 'tool' && (i.status === 'running' || i.status === 'waiting')
            ? { ...i, status: 'error' as const }
            : i,
      );
      v.run = { ...v.run, status: e.status };
      break;
  }
  return v;
}

export function isActiveStatus(s: RunStatus): boolean {
  return s === 'queued' || s === 'running' || s === 'waiting_approval' || s === 'waiting_plan';
}
