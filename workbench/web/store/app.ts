import { create } from 'zustand';
import type { ProjectInfo, RoleId } from '@shared/types';
import { api, setConnection, storage, type Connection } from '../lib/api';
import { ws, type WsStatus } from '../lib/ws';
import type {
  AgentInfo,
  AppSettings,
  ComposerPrefs,
  CreditsResponse,
  ModelInfo,
  SessionListItem,
  SkillInfo,
  StatusResponse,
  View,
} from '../lib/types';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  text: string;
}

interface Layout {
  sidebar: boolean;
  right: boolean;
  bottom: boolean;
  rightTab: 'agent' | 'plan' | 'changes' | 'artifacts' | 'context' | 'activity';
  bottomTab: 'terminal' | 'activity' | 'tasks' | 'problems';
}

export interface ComposerDraft {
  text?: string;
  attachments?: string[];
  role?: RoleId;
  send?: boolean;
  ui?: {
    openFile?: string;
    selection?: { text: string; startLine: number; endLine: number };
    dataset?: string;
  };
}

interface AppState {
  connState: 'disconnected' | 'connecting' | 'connected';
  connError: string | null;
  status: StatusResponse | null;
  wsStatus: WsStatus;
  theme: 'dark' | 'light';
  view: View;
  projects: ProjectInfo[];
  projectId: string | null;
  sessions: SessionListItem[];
  sessionId: string | null;
  models: ModelInfo[];
  modelsError: string | null;
  settings: AppSettings | null;
  agents: AgentInfo[];
  skills: SkillInfo[];
  credits: CreditsResponse | null;
  layout: Layout;
  prefs: ComposerPrefs;
  toasts: Toast[];
  paletteOpen: boolean;
  paletteMode: 'commands' | 'files';
  draft: ComposerDraft | null;
  isMobile: boolean;

  connect: (c: Connection) => Promise<boolean>;
  disconnect: () => void;
  setView: (v: View) => void;
  setTheme: (t: 'dark' | 'light') => void;
  setLayout: (patch: Partial<Layout>) => void;
  setPrefs: (patch: Partial<ComposerPrefs>) => void;
  toast: (kind: Toast['kind'], text: string) => void;
  dismissToast: (id: number) => void;
  loadProjects: () => Promise<void>;
  selectProject: (id: string | null) => Promise<void>;
  loadSessions: () => Promise<void>;
  selectSession: (id: string | null) => void;
  newSession: (opts?: { role?: RoleId }) => Promise<string | null>;
  loadModels: (refresh?: boolean) => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettings: (patch: Partial<AppSettings> | Record<string, unknown>) => Promise<void>;
  refreshCredits: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  loadAgents: () => Promise<void>;
  loadSkills: () => Promise<void>;
  openPalette: (mode?: 'commands' | 'files') => void;
  closePalette: () => void;
  setDraft: (d: ComposerDraft | null) => void;
}

const persisted = (() => {
  try {
    return JSON.parse(storage.get('wb.ui') ?? '{}') as Partial<
      Pick<AppState, 'theme' | 'view' | 'projectId' | 'sessionId' | 'layout' | 'prefs'>
    >;
  } catch {
    return {};
  }
})();

let toastId = 0;
let creditsTimer: number | undefined;

export const useApp = create<AppState>((set, get) => ({
  connState: 'disconnected',
  connError: null,
  status: null,
  wsStatus: 'idle',
  theme: persisted.theme ?? 'dark',
  view: persisted.view ?? 'chat',
  projects: [],
  projectId: persisted.projectId ?? null,
  sessions: [],
  sessionId: persisted.sessionId ?? null,
  models: [],
  modelsError: null,
  settings: null,
  agents: [],
  skills: [],
  credits: null,
  layout: {
    sidebar: true,
    right: true,
    bottom: false,
    rightTab: 'plan',
    bottomTab: 'terminal',
    ...persisted.layout,
  },
  prefs: { effort: 'auto', agentMode: 'chat', ...persisted.prefs },
  toasts: [],
  paletteOpen: false,
  paletteMode: 'commands',
  draft: null,
  isMobile: typeof window !== 'undefined' && window.innerWidth < 900,

  async connect(c) {
    set({ connState: 'connecting', connError: null });
    setConnection(c);
    try {
      const status = await api<StatusResponse>('/api/status');
      set({ status, connState: 'connected' });
      ws.connect();
      ws.subscribeActivity();
      ws.subscribeTerminal();
      await Promise.all([get().loadProjects(), get().loadSettings(), get().loadAgents(), get().loadSkills()]);
      void get().loadModels();
      void get().refreshCredits();
      return true;
    } catch (err) {
      set({ connState: 'disconnected', connError: (err as Error).message });
      return false;
    }
  },

  disconnect() {
    ws.disconnect();
    setConnection(null);
    set({ connState: 'disconnected', status: null });
  },

  setView(view) {
    set({ view });
  },
  setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
  setLayout(patch) {
    set({ layout: { ...get().layout, ...patch } });
  },
  setPrefs(patch) {
    set({ prefs: { ...get().prefs, ...patch } });
  },
  toast(kind, text) {
    const id = ++toastId;
    set({ toasts: [...get().toasts.slice(-4), { id, kind, text }] });
    window.setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 3500);
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },

  async loadProjects() {
    const projects = await api<ProjectInfo[]>('/api/projects');
    set({ projects });
    const { projectId } = get();
    if (!projectId || !projects.some((p) => p.id === projectId))
      await get().selectProject(projects[0]?.id ?? null);
    else await get().loadSessions();
  },

  async selectProject(id) {
    const changed = id !== get().projectId;
    set({ projectId: id, ...(changed ? { sessionId: null } : {}) });
    await get().loadSessions();
    if (changed) get().selectSession(get().sessions[0]?.id ?? null);
  },

  async loadSessions() {
    const { projectId } = get();
    if (!projectId) {
      set({ sessions: [] });
      return;
    }
    const sessions = await api<SessionListItem[]>('/api/sessions', { query: { projectId } });
    set({ sessions });
    const { sessionId } = get();
    if (sessionId && !sessions.some((s) => s.id === sessionId)) set({ sessionId: sessions[0]?.id ?? null });
  },

  selectSession(id) {
    set({ sessionId: id });
  },

  async newSession(opts) {
    const { projectId } = get();
    if (!projectId) {
      get().toast('error', "Créez ou sélectionnez d'abord un projet.");
      return null;
    }
    const s = await api<SessionListItem>('/api/sessions', { body: { projectId, role: opts?.role } });
    await get().loadSessions();
    set({ sessionId: s.id });
    return s.id;
  },

  async loadModels(refresh) {
    try {
      const r = await api<{ models: ModelInfo[] }>('/api/models', {
        query: { refresh: refresh ? 1 : undefined },
      });
      set({ models: r.models, modelsError: null });
    } catch (err) {
      set({ modelsError: (err as Error).message });
    }
  },

  async loadSettings() {
    set({ settings: await api<AppSettings>('/api/settings') });
  },
  async saveSettings(patch) {
    try {
      set({ settings: await api<AppSettings>('/api/settings', { method: 'PUT', body: patch }) });
      get().toast('success', 'Réglages enregistrés');
    } catch (err) {
      get().toast('error', (err as Error).message);
    }
  },

  async refreshCredits() {
    window.clearTimeout(creditsTimer);
    creditsTimer = window.setTimeout(async () => {
      try {
        set({
          credits: await api<CreditsResponse>('/api/credits', {
            query: { sessionId: get().sessionId ?? undefined },
          }),
        });
      } catch {
        /* offline */
      }
    }, 250);
  },
  async refreshStatus() {
    try {
      set({ status: await api<StatusResponse>('/api/status') });
    } catch {
      /* offline */
    }
  },

  async loadAgents() {
    try {
      set({ agents: await api<AgentInfo[]>('/api/agents') });
    } catch {
      /* offline */
    }
  },
  async loadSkills() {
    try {
      set({ skills: await api<SkillInfo[]>('/api/skills') });
    } catch {
      /* offline */
    }
  },

  openPalette(mode = 'commands') {
    set({ paletteOpen: true, paletteMode: mode });
  },
  closePalette() {
    set({ paletteOpen: false });
  },
  setDraft(draft) {
    set({ draft });
  },
}));

ws.onStatus((wsStatus) => useApp.setState({ wsStatus }));

// Persist UI preferences.
useApp.subscribe((s) => {
  storage.set(
    'wb.ui',
    JSON.stringify({
      theme: s.theme,
      view: s.view,
      projectId: s.projectId,
      sessionId: s.sessionId,
      layout: s.layout,
      prefs: s.prefs,
    }),
  );
});

if (typeof window !== 'undefined') {
  document.documentElement.dataset.theme = useApp.getState().theme;
  window.addEventListener('resize', () => {
    const isMobile = window.innerWidth < 900;
    if (isMobile !== useApp.getState().isMobile) useApp.setState({ isMobile });
  });
}
