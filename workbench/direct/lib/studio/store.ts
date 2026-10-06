// Studio state (zustand). Persistence uses the Workbench's IndexedDB `kv` with keys prefixed `vs.` ONLY; existing keys
// are never rewritten. While the studio is disabled nothing is read from or written to IndexedDB.
import { create } from 'zustand';
import { kv, saveLater } from '../db';
import type { Registry } from '../../../server/jev/studio/capabilities';
import type { AssetMeta, Blueprint, CostMode, Job } from '../../../server/jev/studio/types';
import type { ProdRecord } from '../../../server/jev/studio/memory';
import { loadBlueprint, newBlueprint, touch, DEFAULT_CAP_USD } from '../../../server/jev/studio/blueprint';

export const VS_KEYS = [
  'vs.settings',
  'vs.projects',
  'vs.assets.meta',
  'vs.jobs',
  'vs.memory',
  'vs.registry',
] as const;

export interface StudioSettings {
  /** Master switch (on by default). Off → the Workbench behaves exactly like before. */
  enabled: boolean;
  mode: CostMode;
  /** Hard cap per production, USD (default 1 $). Only the owner changes it. */
  cap: number;
  /** Video Factory: OFF by default; activation needs an explicit budget typed by the owner. */
  videoEnabled: boolean;
  videoBudget: number;
  activeProjectId: string | null;
  /** Music generation probe result: unknown until the owner authorises a test call. */
  musicProbe: 'unknown' | 'works' | 'unavailable';
}
export const DEFAULT_STUDIO: StudioSettings = {
  enabled: true,
  mode: 'ECO',
  cap: DEFAULT_CAP_USD,
  videoEnabled: false,
  videoBudget: 0,
  activeProjectId: null,
  musicProbe: 'unknown',
};

interface StudioState {
  hydrated: boolean;
  settings: StudioSettings;
  projects: Record<string, Blueprint>;
  assets: Record<string, AssetMeta>;
  jobs: Job[];
  memory: ProdRecord[];
  registry: Registry | null;
  /** Transient (never persisted): discovery in progress, last error. */
  busy: string | null;
  hydrate: () => Promise<void>;
  setSettings: (p: Partial<StudioSettings>) => void;
  upsertProject: (bp: Blueprint, note?: string) => void;
  patchProject: (id: string, f: (bp: Blueprint) => Blueprint, note?: string) => void;
  createProject: (idea: string) => Blueprint;
  deleteProject: (id: string) => void;
  addAsset: (a: AssetMeta) => void;
  removeAsset: (id: string) => void;
  setJobs: (f: (jobs: Job[]) => Job[]) => void;
  addMemory: (r: ProdRecord) => void;
  setRegistry: (r: Registry) => void;
  setBusy: (b: string | null) => void;
}

const uid = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const useStudio = create<StudioState>((set, get) => {
  /** Writes only once the studio is enabled AND hydrated (so a disabled studio never writes). */
  const persist = (key: (typeof VS_KEYS)[number], value: () => unknown) => {
    if (!get().settings.enabled || !get().hydrated) return;
    saveLater(key, value, 400);
  };
  return {
    hydrated: false,
    settings: DEFAULT_STUDIO,
    projects: {},
    assets: {},
    jobs: [],
    memory: [],
    registry: null,
    busy: null,
    hydrate: async () => {
      if (get().hydrated) return;
      const [s, p, a, j, m, r] = await Promise.all([
        kv.get<StudioSettings>('vs.settings').catch(() => undefined),
        kv.get<Record<string, Blueprint>>('vs.projects').catch(() => undefined),
        kv.get<Record<string, AssetMeta>>('vs.assets.meta').catch(() => undefined),
        kv.get<Job[]>('vs.jobs').catch(() => undefined),
        kv.get<ProdRecord[]>('vs.memory').catch(() => undefined),
        kv.get<Registry>('vs.registry').catch(() => undefined),
      ]);
      const projects: Record<string, Blueprint> = {};
      for (const [id, raw] of Object.entries(p ?? {})) {
        const bp = loadBlueprint(raw);
        if (bp) projects[id] = bp;
      }
      set({
        hydrated: true,
        settings: { ...DEFAULT_STUDIO, ...s },
        projects,
        assets: a ?? {},
        jobs: j ?? [],
        memory: m ?? [],
        registry: r ?? null,
      });
    },
    setSettings: (p) => {
      // The very first write of settings is the owner's action (a toggle): allow it even before hydration.
      set({ settings: { ...get().settings, ...p } });
      if (get().hydrated || p.enabled !== undefined) saveLater('vs.settings', () => get().settings, 200);
    },
    upsertProject: (bp, note) => {
      const next = note ? touch(bp, note) : bp;
      set({ projects: { ...get().projects, [bp.project.id]: next } });
      persist('vs.projects', () => get().projects);
    },
    patchProject: (id, f, note) => {
      const cur = get().projects[id];
      if (cur) get().upsertProject(f(cur), note);
    },
    createProject: (idea) => {
      const s = get().settings;
      const bp = newBlueprint({ id: uid(), idea, mode: s.mode, cap: s.cap });
      set({
        projects: { ...get().projects, [bp.project.id]: bp },
        settings: { ...s, activeProjectId: bp.project.id },
      });
      persist('vs.projects', () => get().projects);
      saveLater('vs.settings', () => get().settings, 200);
      return bp;
    },
    deleteProject: (id) => {
      const { [id]: _drop, ...rest } = get().projects;
      void _drop;
      set({ projects: rest });
      persist('vs.projects', () => get().projects);
    },
    addAsset: (a) => {
      set({ assets: { ...get().assets, [a.id]: a } });
      persist('vs.assets.meta', () => get().assets);
    },
    removeAsset: (id) => {
      const { [id]: _d, ...rest } = get().assets;
      void _d;
      set({ assets: rest });
      persist('vs.assets.meta', () => get().assets);
    },
    setJobs: (f) => {
      set({ jobs: f(get().jobs).slice(-500) });
      persist('vs.jobs', () => get().jobs);
    },
    addMemory: (r) => {
      set({ memory: [...get().memory, r].slice(-3000) });
      persist('vs.memory', () => get().memory);
    },
    setRegistry: (r) => {
      set({ registry: r });
      persist('vs.registry', () => get().registry);
    },
    setBusy: (b) => set({ busy: b }),
  };
});
