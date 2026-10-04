import { create } from 'zustand';
import type {
  AgentEvent,
  ChangeRecord,
  EffortSetting,
  RoleId,
  RunEventEnvelope,
  RunSummary,
} from '@shared/types';
import { api } from '../lib/api';
import { applyEvent, emptyRunView, isActiveStatus, type RunView } from '../lib/transcript';
import type { ArtifactRecord, SessionDetail, SessionSettings } from '../lib/types';
import { ws } from '../lib/ws';
import { useApp } from './app';

export interface SendInput {
  text: string;
  attachments?: string[];
  model?: string;
  effort?: EffortSetting;
  role?: RoleId;
  agentMode?: 'chat' | 'plan' | 'mission';
  ui?: {
    openFile?: string;
    selection?: { text: string; startLine: number; endLine: number };
    dataset?: string;
    browserUrl?: string;
  };
}

interface SessionState {
  sessionId: string | null;
  detail: Omit<SessionDetail, 'runs' | 'events'> | null;
  runs: Record<string, RunView>;
  order: string[];
  activeRunId: string | null;
  loading: boolean;
  changes: ChangeRecord[];
  artifacts: ArtifactRecord[];

  load: (sessionId: string | null) => Promise<void>;
  onRunEvent: (env: RunEventEnvelope) => void;
  send: (input: SendInput) => Promise<boolean>;
  cancel: () => Promise<void>;
  approve: (
    approvalId: string,
    decision: 'approve' | 'deny',
    opts?: { note?: string; remember?: boolean },
  ) => Promise<void>;
  resolvePlan: (runId: string, decision: 'approve' | 'cancel', steps?: string[]) => Promise<void>;
  patchSession: (patch: {
    title?: string;
    model?: string;
    permissionMode?: string;
    autoApproveEdits?: boolean;
    role?: RoleId;
    resetGrants?: boolean;
    skills?: string[];
  }) => Promise<void>;
  refreshSide: () => Promise<void>;
  review: (focus?: string) => Promise<void>;
  compact: () => Promise<void>;
}

let loadToken = 0;

export const useSession = create<SessionState>((set, get) => ({
  sessionId: null,
  detail: null,
  runs: {},
  order: [],
  activeRunId: null,
  loading: false,
  changes: [],
  artifacts: [],

  async load(sessionId) {
    const token = ++loadToken;
    for (const id of Object.keys(get().runs)) ws.unsubscribeRun(id);
    if (!sessionId) {
      set({
        sessionId: null,
        detail: null,
        runs: {},
        order: [],
        activeRunId: null,
        changes: [],
        artifacts: [],
      });
      return;
    }
    set({ loading: true, sessionId });
    try {
      const d = await api<SessionDetail>(`/api/sessions/${sessionId}`);
      if (token !== loadToken) return;
      const runs: Record<string, RunView> = {};
      for (const r of d.runs) {
        let v = emptyRunView(r);
        for (const env of d.events[r.id] ?? []) v = applyEvent(v, env.event, env.seq);
        if (!isActiveStatus(r.status)) v = { ...v, status: r.status };
        runs[r.id] = v;
      }
      const order = d.runs.filter((r) => !r.parentRunId).map((r) => r.id);
      set({
        detail: {
          session: d.session,
          settings: d.settings,
          activeRunId: d.activeRunId,
          changes: d.changes,
          artifacts: d.artifacts,
        },
        runs,
        order,
        activeRunId: d.activeRunId,
        changes: d.changes,
        artifacts: d.artifacts,
        loading: false,
      });
      if (d.activeRunId) ws.subscribeRun(d.activeRunId, runs[d.activeRunId]?.lastSeq ?? -1);
    } catch (err) {
      if (token === loadToken) {
        set({ loading: false, detail: null, runs: {}, order: [] });
        useApp.getState().toast('error', (err as Error).message);
      }
    }
  },

  onRunEvent(env) {
    const st = get();
    const e = env.event as AgentEvent;
    let view = st.runs[env.runId];
    if (!view) {
      if (e.type !== 'run_started' || e.sessionId !== st.sessionId) return;
      const run: RunSummary = {
        id: env.runId,
        sessionId: e.sessionId,
        projectId: st.detail?.session.projectId ?? '',
        parentRunId: e.parentRunId ?? null,
        role: e.role,
        title: e.title,
        status: 'running',
        model: '',
        mode: e.mode,
        startedAt: env.ts,
        finishedAt: null,
        tokensIn: 0,
        tokensOut: 0,
        cost: 0,
        filesChanged: 0,
        error: null,
      };
      view = emptyRunView(run);
      if (!e.parentRunId) set({ order: [...st.order, env.runId], activeRunId: env.runId });
    }
    const next = applyEvent(view, e, env.seq);
    if (next === view) return;
    const patch: Partial<SessionState> = { runs: { ...get().runs, [env.runId]: next } };
    if (e.type === 'run_finished' && get().activeRunId === env.runId) {
      patch.activeRunId = null;
      ws.unsubscribeRun(env.runId);
      void get().refreshSide();
      void useApp.getState().refreshCredits();
      void useApp.getState().loadSessions();
    }
    if (e.type === 'file_changed' || (e.type === 'tool_result' && e.result.attachments?.length))
      void get().refreshSide();
    if (e.type === 'usage') void useApp.getState().refreshCredits();
    set(patch);
  },

  async send(input) {
    const { sessionId } = get();
    if (!sessionId) return false;
    try {
      const run = await api<RunSummary>(`/api/sessions/${sessionId}/runs`, { body: input });
      const view = emptyRunView(run);
      set({ runs: { ...get().runs, [run.id]: view }, order: [...get().order, run.id], activeRunId: run.id });
      ws.subscribeRun(run.id, -1);
      void useApp.getState().loadSessions();
      return true;
    } catch (err) {
      useApp.getState().toast('error', (err as Error).message);
      return false;
    }
  },

  async cancel() {
    const id = get().activeRunId;
    if (id) await api(`/api/runs/${id}/cancel`, { method: 'POST' }).catch(() => undefined);
  },

  async approve(approvalId, decision, opts) {
    try {
      await api(`/api/approvals/${approvalId}`, {
        body: { decision, note: opts?.note, remember: opts?.remember ?? false },
      });
    } catch (err) {
      useApp.getState().toast('error', (err as Error).message);
    }
  },

  async resolvePlan(runId, decision, steps) {
    try {
      await api(`/api/runs/${runId}/plan`, { body: { decision, steps } });
    } catch (err) {
      useApp.getState().toast('error', (err as Error).message);
    }
  },

  async patchSession(patch) {
    const { sessionId } = get();
    if (!sessionId) return;
    try {
      const r = await api<{ session: SessionDetail['session']; settings: SessionSettings }>(
        `/api/sessions/${sessionId}`,
        { method: 'PATCH', body: patch },
      );
      const d = get().detail;
      if (d) set({ detail: { ...d, session: r.session, settings: r.settings } });
      void useApp.getState().loadSessions();
    } catch (err) {
      useApp.getState().toast('error', (err as Error).message);
    }
  },

  async refreshSide() {
    const { sessionId, detail } = get();
    if (!sessionId || !detail) return;
    const [changes, artifacts] = await Promise.all([
      api<ChangeRecord[]>(`/api/sessions/${sessionId}/changes`).catch(() => get().changes),
      api<ArtifactRecord[]>(`/api/projects/${detail.session.projectId}/artifacts`, {
        query: { sessionId },
      }).catch(() => get().artifacts),
    ]);
    set({ changes, artifacts });
  },

  async review(focus) {
    const { sessionId } = get();
    if (!sessionId) return;
    try {
      const run = await api<RunSummary>(`/api/sessions/${sessionId}/review`, { body: { focus } });
      set({
        runs: { ...get().runs, [run.id]: emptyRunView(run) },
        order: [...get().order, run.id],
        activeRunId: run.id,
      });
      ws.subscribeRun(run.id, -1);
      useApp.getState().toast('info', 'Revue lancée avec un second modèle');
    } catch (err) {
      useApp.getState().toast('error', (err as Error).message);
    }
  },

  async compact() {
    const { sessionId } = get();
    if (!sessionId) return;
    try {
      const r = await api<{ before: number; after: number }>(`/api/sessions/${sessionId}/compact`, {
        method: 'POST',
      });
      useApp
        .getState()
        .toast(
          'success',
          `Contexte compacté : ~${Math.round(r.before / 1000)}k → ~${Math.round(r.after / 1000)}k tokens`,
        );
    } catch (err) {
      useApp.getState().toast('error', (err as Error).message);
    }
  },
}));

// Route WebSocket run events into the session store.
ws.on((msg) => {
  if (msg.type === 'run_event') useSession.getState().onRunEvent(msg as unknown as RunEventEnvelope);
});

// Keep the session store in sync with the selected session.
useApp.subscribe((s, prev) => {
  if (s.sessionId !== prev.sessionId) void useSession.getState().load(s.sessionId);
});
