import { create } from 'zustand';
import type { RunEventEnvelope } from '@shared/types';
import { api } from '../lib/api';
import { ws } from '../lib/ws';
import { useApp } from './app';
import { useCode } from './code';

// ── terminal ───────────────────────────────────────────────────────────
export interface ProcessInfo {
  id: string;
  projectId: string;
  command: string;
  origin: 'agent' | 'user';
  status: 'running' | 'exited' | 'killed' | 'timeout' | 'error';
  exitCode: number | null;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  background: boolean;
  ports: number[];
}

export interface TermLine {
  id: number;
  pid: string;
  stream: 'stdout' | 'stderr' | 'cmd' | 'info';
  text: string;
}

interface TerminalState {
  processes: ProcessInfo[];
  lines: TermLine[];
  history: string[];
  focusPid: string | null;
  load: () => Promise<void>;
  addLine: (l: Omit<TermLine, 'id'>) => void;
  clear: () => void;
  pushHistory: (cmd: string) => void;
  setFocus: (pid: string | null) => void;
}

let lineId = 0;
const MAX_LINES = 5000;

export const useTerminal = create<TerminalState>((set, get) => ({
  processes: [],
  lines: [],
  history: (() => {
    try {
      return JSON.parse(localStorage.getItem('wb.termHistory') ?? '[]') as string[];
    } catch {
      return [];
    }
  })(),
  focusPid: null,
  async load() {
    try {
      set({ processes: await api<ProcessInfo[]>('/api/terminal') });
    } catch {
      /* offline */
    }
  },
  addLine(l) {
    const lines = get().lines;
    const next = lines.length >= MAX_LINES ? lines.slice(-MAX_LINES + 500) : lines.slice();
    // split into individual lines for virtualised rendering
    const parts = l.text.replace(/\r\n/g, '\n').split('\n');
    const last = next[next.length - 1];
    parts.forEach((p, i) => {
      if (i === 0 && last && last.pid === l.pid && last.stream === l.stream && !last.text.endsWith('\n') && l.stream !== 'cmd') {
        next[next.length - 1] = { ...last, text: last.text + p };
      } else if (p !== '' || i < parts.length - 1) next.push({ ...l, id: ++lineId, text: p });
    });
    set({ lines: next });
  },
  clear() {
    set({ lines: [] });
  },
  pushHistory(cmd) {
    const history = [...get().history.filter((h) => h !== cmd), cmd].slice(-200);
    try {
      localStorage.setItem('wb.termHistory', JSON.stringify(history));
    } catch {
      /* ignore */
    }
    set({ history });
  },
  setFocus(focusPid) {
    set({ focusPid });
  },
}));

// ── browser ────────────────────────────────────────────────────────────
export interface BrowserActionItem {
  id: string;
  ts: number;
  type: string;
  detail: string;
  ok: boolean;
  origin: 'agent' | 'user';
  error?: string;
}
export interface BrowserLogs {
  actions: BrowserActionItem[];
  console: { ts: number; level: string; text: string; location?: string }[];
  network: { id: string; ts: number; method: string; url: string; resourceType: string; status: number | null; durationMs: number | null; failure?: string }[];
}
export interface BrowserStateInfo {
  url: string;
  title: string;
  loading: boolean;
  engine: string;
  viewport: { width: number; height: number };
}

interface BrowserStore {
  frame: string | null;
  frameKey: string | null;
  state: BrowserStateInfo | null;
  actions: BrowserActionItem[];
  setFrame: (key: string, data: string) => void;
  setState: (s: BrowserStateInfo | null) => void;
  addAction: (a: BrowserActionItem) => void;
  reset: (key: string | null) => void;
}

export const useBrowser = create<BrowserStore>((set, get) => ({
  frame: null,
  frameKey: null,
  state: null,
  actions: [],
  setFrame(key, data) {
    set({ frame: data, frameKey: key });
  },
  setState(state) {
    set({ state });
  },
  addAction(a) {
    set({ actions: [...get().actions.slice(-299), a] });
  },
  reset(key) {
    set({ frame: null, frameKey: key, state: null, actions: [] });
  },
}));

// ── activity (agent observability) ─────────────────────────────────────
export interface ActivityRow {
  id: string;
  ts: number;
  runId: string;
  tool: string;
  status: string;
  summary: string;
  durationMs: number | null;
}

interface ActivityState {
  rows: ActivityRow[];
  pendingApprovals: { runId: string; approvalId: string; summary: string }[];
  tasksVersion: number;
  load: () => Promise<void>;
}

export const useActivity = create<ActivityState>((set) => ({
  rows: [],
  pendingApprovals: [],
  tasksVersion: 0,
  async load() {
    try {
      const rows = await api<{ id: string; runId: string; tool: string; status: string; summary: string | null; startedAt: number; durationMs: number | null }[]>('/api/activity', { query: { limit: 300 } });
      set({ rows: rows.map((r) => ({ id: r.id, ts: r.startedAt, runId: r.runId, tool: r.tool, status: r.status, summary: r.summary ?? '', durationMs: r.durationMs })) });
    } catch {
      /* offline */
    }
  },
}));

// ── WebSocket routing ──────────────────────────────────────────────────
ws.on((msg) => {
  switch (msg.type) {
    case 'terminal_output': {
      const m = msg as unknown as { id: string; stream: 'stdout' | 'stderr'; text: string };
      useTerminal.getState().addLine({ pid: m.id, stream: m.stream, text: m.text });
      break;
    }
    case 'terminal_process': {
      const p = (msg as unknown as { process: ProcessInfo }).process;
      const st = useTerminal.getState();
      const exists = st.processes.some((x) => x.id === p.id);
      useTerminal.setState({ processes: exists ? st.processes.map((x) => (x.id === p.id ? p : x)) : [p, ...st.processes].slice(0, 300) });
      if (!exists) st.addLine({ pid: p.id, stream: 'cmd', text: `${p.origin === 'agent' ? '🤖 ' : ''}$ ${p.command}` });
      else if (p.status !== 'running') st.addLine({ pid: p.id, stream: 'info', text: `[${p.status}${p.exitCode !== null ? ` · code ${p.exitCode}` : ''} · ${p.durationMs ?? 0} ms]` });
      break;
    }
    case 'browser_frame': {
      const m = msg as unknown as { key: string; data: string };
      useBrowser.getState().setFrame(m.key, m.data);
      break;
    }
    case 'browser_state': {
      const m = msg as unknown as { key: string; state: BrowserStateInfo };
      if (useBrowser.getState().frameKey === m.key || !useBrowser.getState().frameKey) useBrowser.getState().setState(m.state);
      break;
    }
    case 'browser_action': {
      const m = msg as unknown as { key: string; action: BrowserActionItem };
      if (useBrowser.getState().frameKey === m.key) useBrowser.getState().addAction(m.action);
      break;
    }
    case 'activity': {
      const env = msg as unknown as RunEventEnvelope;
      const e = env.event;
      const act = useActivity.getState();
      if (e.type === 'tool_result') {
        useActivity.setState({
          rows: [{ id: `${env.runId}-${env.seq}`, ts: env.ts, runId: env.runId, tool: e.tool, status: e.result.ok ? 'success' : 'error', summary: e.result.summary, durationMs: e.durationMs }, ...act.rows].slice(0, 500),
        });
      } else if (e.type === 'approval_required') {
        useActivity.setState({ pendingApprovals: [...act.pendingApprovals, { runId: env.runId, approvalId: e.request.approvalId, summary: e.request.summary }] });
      } else if (e.type === 'approval_resolved') {
        useActivity.setState({ pendingApprovals: act.pendingApprovals.filter((a) => a.approvalId !== e.approvalId) });
      } else if (e.type === 'run_started' || e.type === 'run_finished') {
        useActivity.setState({ tasksVersion: act.tasksVersion + 1 });
        if (e.type === 'run_finished') useActivity.setState({ pendingApprovals: act.pendingApprovals.filter((a) => a.runId !== env.runId) });
      } else if (e.type === 'file_changed') {
        // Reload editors showing a file the agent just changed (unless dirty).
        const code = useCode.getState();
        const f = code.files.find((x) => x.path === e.path);
        if (f && f.content === f.saved) void code.reload(e.path);
        code.bumpTree();
      }
      break;
    }
    case 'error': {
      const m = msg as unknown as { message: string };
      useApp.getState().toast('error', m.message);
      break;
    }
  }
});
