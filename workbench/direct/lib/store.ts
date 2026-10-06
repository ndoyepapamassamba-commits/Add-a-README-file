import { create } from 'zustand';
import type { CreditsInfo, ModelInfo } from '@shared/types';
import { kv, saveLater } from './db';
import { intelData, setIntelData, type IntelData } from '../../server/llm/modelIntel';
import type { HouseKit } from '../../server/services/apexCore';
import type { BenchResult, Ledger, ManualRule } from '../../server/agent/intelligence';
import type { RoutingDecision } from '../../server/engine/decision';
import type { RegistryResource } from '../../server/engine/registry';
import type { ExternalBenchmark } from '../../server/engine/evidence';
import type { JevLogEntry } from '../../server/jev/metrics';
import type { LiveCheckpoint, MissionState } from '../../server/jev/live';
import type { FabricSkill } from '../../server/jev/fabric/skills';
import type { Policy } from '../../server/jev/fabric/learning';
import type { ProviderPolicy } from '../../server/jev/fabric/security';
import type { ProfileVersion } from '../../server/jev/apprentice/versions';

export interface CallLive {
  model: string;
  callStart: number;
  runStart: number;
  /** Output tokens of the call in progress (estimated from the streamed text until the provider reports usage). */
  liveOut: number;
  /** Tokens (in + out) and cost already reported by finished calls of this run. */
  baseTokens: number;
  baseCost: number;
  run: unknown;
}

/** Persistent state of the Cognitive Fabric (skills with their versions, learned policies, provider policies). */
export interface FabricState {
  skills: FabricSkill[];
  policies: Policy[];
  providerPolicies: ProviderPolicy[];
  /** JEV Apprentice adaptation profile versions (model × task family). */
  profileVersions: ProfileVersion[];
  /** Model routing memory: per task family, champion / fallback / premium reference (persistent). */
  routingMemory?: Record<string, import('./apprentice').RoutingMemoryEntry>;
  /** Champion Science: champions / challengers / histories per family × risk (persistent, REAL missions only). */
  lab?: import('../../server/jev/apprentice/lab').LabState;
  /** Challenger discovery pipeline: stage of every free model of the catalogue. */
  discovered?: Record<string, import('../../server/jev/apprentice/discovery').DiscoveredModel>;
  /** AI Visual Studio: media capability summary (add-only entry of the Capability Fabric). */
  media?: ReturnType<typeof import('../../server/jev/studio/capabilities').fabricEntry>;
}
export const EMPTY_FABRIC: FabricState = {
  skills: [],
  policies: [],
  providerPolicies: [],
  profileVersions: [],
};

/** Live JEV state of a session (Control Center + resume after an interruption). */
export interface JevLiveSnapshot {
  state: MissionState;
  checkpoints: LiveCheckpoint[];
  at: number;
}
import { embeddedKit, setHouseKit } from './apex';
import { noteBefore } from './timemachine';
import {
  recordHealth,
  recordOutcome,
  recordTypedOutcome,
  type HealthMap,
  type LeaderboardMap,
  type TaskType,
} from '../../server/llm/routing';
import type {
  AgentDef,
  AgentMode,
  ArtifactDef,
  Item,
  McpServerDef,
  Session,
  Settings,
  SkillDef,
  UsageEntry,
  VFile,
  View,
  Workflow,
} from './types';

export const DEFAULT_SETTINGS: Settings = {
  rememberKey: true,
  defaultModel: 'auto',
  fallbackModel: '',
  effort: 'auto',
  temperature: null,
  maxSteps: 40,
  budgetPerTask: 1,
  budgetDaily: 5,
  theme: 'dark',
  autoSkills: true,
  disabledPlugins: [],
};

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).slice(0, 18);
export const today = () => new Date().toISOString().slice(0, 10);

export interface Toast {
  id: string;
  tone: 'ok' | 'err' | 'info';
  text: string;
}

interface Pending {
  approvals: Map<string, (d: { decision: 'approve' | 'deny'; always?: boolean; note?: string }) => void>;
  plans: Map<string, (d: { decision: 'approve' | 'cancel'; steps?: string[] }) => void>;
}

export interface State {
  ready: boolean;
  view: View;
  settings: Settings;
  models: ModelInfo[];
  modelsError: string | null;
  credits: CreditsInfo | null;
  sessions: Session[];
  currentId: string | null;
  files: Record<string, VFile>;
  skills: SkillDef[];
  agents: AgentDef[];
  mcp: McpServerDef[];
  artifacts: ArtifactDef[];
  spend: Record<string, number>;
  running: Record<string, AbortController>;
  status: Record<string, string>;
  /** Live view of the model call in progress (model, timing, tokens) — display only. */
  callLive: Record<string, CallLive>;
  grants: Record<string, string[]>;
  agentMode: AgentMode;
  usage: UsageEntry[];
  workflows: Workflow[];
  health: HealthMap;
  /** Personal model leaderboard (missions won / lost). */
  board: LeaderboardMap;
  /** Intelligence Engine memory: every mission (DNA, strategy, outcome, cost, errors). */
  ledger: Ledger;
  /** Personal operating manual (user rules). */
  manual: ManualRule[];
  /** Auto-benchmark runs. */
  bench: BenchResult[];
  /** Intelligence Engine: last routing decisions (explained). */
  routingLog: RoutingDecision[];
  /** GitHub Intelligence Registry (discovered / reviewed / approved / installed resources). */
  registry: RegistryResource[];
  /** Imported public benchmarks (fused with the other evidence). */
  externalBench: ExternalBenchmark[];
  /** JEV_LOG: one entry per run (redacted). */
  jevLog: JevLogEntry[];
  /** USD spent on remote JEV calls per day. */
  jevSpend: Record<string, number>;
  /** JEV live mission state per session (persisted: PAUSE / RESUME without losing state). */
  jevLive: Record<string, JevLiveSnapshot>;
  /** Cognitive Fabric state (persisted). */
  fabric: FabricState;
  draft: string;
  toasts: Toast[];
  openFile: string | null;
  openArtifact: string | null;
  pending: Pending;

  setView: (v: View) => void;
  patchSettings: (p: Partial<Settings>) => void;
  toast: (tone: Toast['tone'], text: string) => void;
  current: () => Session | null;
  /** focus = false: create it in the background (benchmark) without switching view. */
  newSession: (focus?: boolean) => Session;
  selectSession: (id: string) => void;
  patchSession: (id: string, p: Partial<Session> | ((s: Session) => Partial<Session>)) => void;
  deleteSession: (id: string) => void;
  pushItem: (sessionId: string, item: Item) => void;
  updateItem: (sessionId: string, id: string, p: Partial<Item> | ((i: Item) => Partial<Item>)) => void;
  writeFile: (f: Omit<VFile, 'updatedAt' | 'size'> & { size?: number }) => void;
  deleteFile: (path: string) => void;
  setSkills: (s: SkillDef[]) => void;
  setAgents: (a: AgentDef[]) => void;
  setMcp: (m: McpServerDef[]) => void;
  addArtifact: (a: ArtifactDef) => void;
  addSpend: (usd: number) => void;
  addUsage: (u: UsageEntry) => void;
  setWorkflows: (w: Workflow[]) => void;
  recordModel: (model: string, ok: boolean) => void;
  recordOutcome: (model: string, won: boolean, type?: TaskType) => void;
  setLedger: (l: Ledger) => void;
  setManual: (m: ManualRule[]) => void;
  setBench: (b: BenchResult[]) => void;
  logRouting: (d: RoutingDecision) => void;
  setRegistry: (r: RegistryResource[]) => void;
  setExternalBench: (b: ExternalBenchmark[]) => void;
  addJevLog: (e: JevLogEntry) => void;
  setJevLog: (l: JevLogEntry[]) => void;
  setJevSpend: (s: Record<string, number>) => void;
  setJevLive: (sessionId: string, snap: JevLiveSnapshot | null) => void;
  setFabric: (p: Partial<FabricState>) => void;
}

const persistSession = (s: Session) => saveLater(`session:${s.id}`, () => s);
const persistIndex = (sessions: Session[]) => saveLater('sessions', () => sessions.map((s) => s.id));

export const useStore = create<State>((set, get) => ({
  ready: false,
  view: 'home',
  settings: DEFAULT_SETTINGS,
  models: [],
  modelsError: null,
  credits: null,
  sessions: [],
  currentId: null,
  files: {},
  skills: [],
  agents: [],
  mcp: [],
  artifacts: [],
  spend: {},
  running: {},
  status: {},
  callLive: {},
  grants: {},
  agentMode: 'chat',
  usage: [],
  workflows: [],
  health: {},
  board: {},
  ledger: { entries: [] },
  manual: [],
  bench: [],
  routingLog: [],
  registry: [],
  externalBench: [],
  jevLog: [],
  jevSpend: {},
  jevLive: {},
  fabric: EMPTY_FABRIC,
  draft: '',
  toasts: [],
  openFile: null,
  openArtifact: null,
  pending: { approvals: new Map(), plans: new Map() },

  setView: (view) => set({ view }),
  patchSettings: (p) => {
    const settings = { ...get().settings, ...p };
    set({ settings });
    document.documentElement.dataset.theme = settings.theme;
    saveLater('settings', () => get().settings);
  },
  toast: (tone, text) => {
    const t = { id: uid(), tone, text };
    set({ toasts: [...get().toasts, t] });
    setTimeout(
      () => set({ toasts: get().toasts.filter((x) => x.id !== t.id) }),
      tone === 'err' ? 7000 : 3500,
    );
  },
  current: () => get().sessions.find((s) => s.id === get().currentId) ?? null,
  newSession: (focus = true) => {
    const st = get().settings;
    const s: Session = {
      id: uid(),
      title: 'Nouvelle session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: st.defaultModel,
      effort: st.effort,
      agent: 'general',
      mode: 'normal',
      pinnedSkills: [],
      history: [],
      items: [],
      cost: 0,
      tokensIn: 0,
      tokensOut: 0,
    };
    const sessions = [s, ...get().sessions];
    set(focus ? { sessions, currentId: s.id, view: 'chat' } : { sessions });
    persistSession(s);
    persistIndex(sessions);
    saveLater('current', () => s.id);
    return s;
  },
  selectSession: (id) => {
    set({ currentId: id, view: 'chat' });
    saveLater('current', () => id);
  },
  patchSession: (id, p) => {
    let changed: Session | null = null;
    const sessions = get().sessions.map((s) => {
      if (s.id !== id) return s;
      changed = { ...s, ...(typeof p === 'function' ? p(s) : p), updatedAt: Date.now() };
      return changed;
    });
    set({ sessions });
    if (changed) persistSession(changed);
  },
  deleteSession: (id) => {
    get().running[id]?.abort();
    const sessions = get().sessions.filter((s) => s.id !== id);
    set({ sessions, currentId: get().currentId === id ? (sessions[0]?.id ?? null) : get().currentId });
    persistIndex(sessions);
    void kv.del(`session:${id}`);
  },
  pushItem: (sessionId, item) => get().patchSession(sessionId, (s) => ({ items: [...s.items, item] })),
  updateItem: (sessionId, id, p) =>
    get().patchSession(sessionId, (s) => ({
      items: s.items.map((i) =>
        i.id === id ? ({ ...i, ...(typeof p === 'function' ? p(i) : p) } as Item) : i,
      ),
    })),
  writeFile: (f) => {
    noteBefore(f.path, get().files[f.path]);
    const file: VFile = {
      ...f,
      size: f.size ?? (f.binary ? Math.floor((f.data.length * 3) / 4) : new Blob([f.data]).size),
      updatedAt: Date.now(),
    };
    set({ files: { ...get().files, [f.path]: file } });
    saveLater('files', () => get().files);
  },
  deleteFile: (path) => {
    const files = { ...get().files };
    for (const p of Object.keys(files))
      if (p === path || p.startsWith(`${path}/`)) {
        noteBefore(p, files[p]);
        delete files[p];
      }
    set({ files });
    saveLater('files', () => get().files);
  },
  setSkills: (skills) => {
    set({ skills });
    saveLater('skills', () => get().skills);
  },
  setAgents: (agents) => {
    set({ agents });
    saveLater('agents', () => get().agents);
  },
  setMcp: (mcp) => {
    set({ mcp });
    saveLater('mcp', () => get().mcp);
  },
  addArtifact: (a) => {
    set({ artifacts: [a, ...get().artifacts].slice(0, 300) });
    saveLater('artifacts', () => get().artifacts);
  },
  addSpend: (usd) => {
    const d = today();
    const before = get().spend[d] ?? 0;
    const after = before + usd;
    set({ spend: { ...get().spend, [d]: after } });
    saveLater('spend', () => get().spend);
    // Budget alerts at 50 %, 80 % and 100 % of the daily budget.
    const b = get().settings.budgetDaily;
    if (b > 0)
      for (const pct of [0.5, 0.8, 1])
        if (before < b * pct && after >= b * pct)
          get().toast(
            pct >= 1 ? 'err' : 'info',
            `Budget du jour : ${Math.round(pct * 100)} % atteint ($${after.toFixed(3)} / $${b}).`,
          );
  },
  addUsage: (u) => {
    set({ usage: [...get().usage.slice(-4999), u] });
    saveLater('usage', () => get().usage, 1000);
  },
  setWorkflows: (workflows) => {
    set({ workflows });
    saveLater('workflows', () => get().workflows);
  },
  recordModel: (model, ok) => {
    set({ health: recordHealth(get().health, model, ok) });
    saveLater('health', () => get().health, 1000);
  },
  recordOutcome: (model, won, type) => {
    set({
      board: type
        ? recordTypedOutcome(get().board, model, type, won)
        : recordOutcome(get().board, model, won),
    });
    saveLater('board', () => get().board, 1000);
  },
  setLedger: (ledger) => {
    set({ ledger });
    saveLater('ledger', () => get().ledger, 1000);
  },
  setManual: (manual) => {
    set({ manual });
    saveLater('manual', () => get().manual, 300);
  },
  setBench: (bench) => {
    set({ bench });
    saveLater('bench', () => get().bench, 300);
  },
  logRouting: (d) => {
    set({ routingLog: [...get().routingLog, d].slice(-150) });
    saveLater('routingLog', () => get().routingLog, 1000);
  },
  setRegistry: (registry) => {
    set({ registry });
    saveLater('registry', () => get().registry, 300);
  },
  setExternalBench: (externalBench) => {
    set({ externalBench });
    saveLater('externalBench', () => get().externalBench, 300);
  },
  addJevLog: (e) => {
    set({ jevLog: [...get().jevLog, e].slice(-1000) });
    saveLater('jevLog', () => get().jevLog, 800);
  },
  setJevLog: (jevLog) => {
    set({ jevLog });
    saveLater('jevLog', () => get().jevLog, 300);
  },
  setJevSpend: (jevSpend) => {
    set({ jevSpend });
    saveLater('jevSpend', () => get().jevSpend, 800);
  },
  setFabric: (p) => {
    set({ fabric: { ...get().fabric, ...p } });
    saveLater('fabric', () => get().fabric, 600);
  },
  setJevLive: (sessionId, snap) => {
    const { [sessionId]: _old, ...rest } = get().jevLive;
    const jevLive = snap ? { ...rest, [sessionId]: snap } : rest;
    // Keep the 30 most recent sessions only.
    const keys = Object.keys(jevLive).sort((a, b) => jevLive[b]!.at - jevLive[a]!.at);
    for (const k of keys.slice(30)) delete jevLive[k];
    set({ jevLive });
    saveLater('jevLive', () => get().jevLive, 1000);
  },
}));

/** Loads everything saved in this browser. */
export async function hydrate(): Promise<void> {
  const [ledger, manual, bench, routingLog, registry, externalBench] = await Promise.all([
    kv.get<Ledger>('ledger').catch(() => undefined),
    kv.get<ManualRule[]>('manual').catch(() => undefined),
    kv.get<BenchResult[]>('bench').catch(() => undefined),
    kv.get<RoutingDecision[]>('routingLog').catch(() => undefined),
    kv.get<RegistryResource[]>('registry').catch(() => undefined),
    kv.get<ExternalBenchmark[]>('externalBench').catch(() => undefined),
  ]);
  const fabricSaved = await kv.get<FabricState>('fabric').catch(() => undefined);
  const [jevLog, jevSpend, jevLive] = await Promise.all([
    kv.get<JevLogEntry[]>('jevLog').catch(() => undefined),
    kv.get<Record<string, number>>('jevSpend').catch(() => undefined),
    kv.get<Record<string, JevLiveSnapshot>>('jevLive').catch(() => undefined),
  ]);
  const [usage, workflows, health, board, intel] = await Promise.all([
    kv.get<UsageEntry[]>('usage').catch(() => undefined),
    kv.get<Workflow[]>('workflows').catch(() => undefined),
    kv.get<HealthMap>('health').catch(() => undefined),
    kv.get<LeaderboardMap>('board').catch(() => undefined),
    kv.get<IntelData>('intel').catch(() => undefined),
  ]);
  // Scores imported / refreshed earlier replace the built-in snapshot when newer.
  if (intel && intel.fetchedAt > intelData().fetchedAt) setIntelData(intel);
  // House kit imported by the user (when this build does not embed one).
  const kitImported = await kv.get<HouseKit>('houseKit').catch(() => undefined);
  if (kitImported && !embeddedKit()) setHouseKit(kitImported);
  const [settings, ids, current, files, skills, agents, mcp, artifacts, spend] = await Promise.all([
    kv.get<Partial<Settings>>('settings'),
    kv.get<string[]>('sessions'),
    kv.get<string>('current'),
    kv.get<Record<string, VFile>>('files'),
    kv.get<SkillDef[]>('skills'),
    kv.get<AgentDef[]>('agents'),
    kv.get<McpServerDef[]>('mcp'),
    kv.get<ArtifactDef[]>('artifacts'),
    kv.get<Record<string, number>>('spend'),
  ]).catch(
    () =>
      [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      ] as const,
  );
  const sessions = (
    await Promise.all((ids ?? []).map((id) => kv.get<Session>(`session:${id}`).catch(() => undefined)))
  ).filter((s): s is Session => Boolean(s));
  // Items left "running" by a closed tab are marked as interrupted.
  for (const s of sessions)
    s.items = s.items.map((i) =>
      i.kind === 'tool' && i.status === 'running'
        ? { ...i, status: 'error', summary: 'interrompu' }
        : i.kind === 'assistant' && i.streaming
          ? { ...i, streaming: false }
          : i.kind === 'approval' && !i.resolved
            ? { ...i, resolved: 'deny' }
            : i.kind === 'plan' && !i.resolved
              ? { ...i, resolved: 'cancel' }
              : i.kind === 'subagent' && i.status === 'running'
                ? { ...i, status: 'error' }
                : i,
    );
  const merged = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
  document.documentElement.dataset.theme = merged.theme;
  useStore.setState({
    ready: true,
    settings: merged,
    sessions,
    currentId: current && sessions.some((s) => s.id === current) ? current : (sessions[0]?.id ?? null),
    files: files ?? {},
    skills: skills ?? [],
    agents: agents ?? [],
    mcp: mcp ?? [],
    artifacts: artifacts ?? [],
    spend: spend ?? {},
    usage: usage ?? [],
    workflows: workflows ?? [],
    health: health ?? {},
    board: board ?? {},
    ledger: ledger ?? { entries: [] },
    manual: manual ?? [],
    bench: bench ?? [],
    routingLog: routingLog ?? [],
    registry: registry ?? [],
    externalBench: externalBench ?? [],
    jevLog: jevLog ?? [],
    jevSpend: jevSpend ?? {},
    jevLive: jevLive ?? {},
    fabric: { ...EMPTY_FABRIC, ...(fabricSaved ?? {}) },
  });
}
