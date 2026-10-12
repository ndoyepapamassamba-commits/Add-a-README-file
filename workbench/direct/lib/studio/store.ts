// Studio state (zustand). Persistence uses the Workbench's IndexedDB `kv` with keys prefixed `vs.` ONLY; existing keys
// are never rewritten. While the studio is disabled nothing is read from or written to IndexedDB.
import { create } from 'zustand';
import { kv, saveLater } from '../db';
import type { Registry } from '../../../server/jev/studio/capabilities';
import type { AssetMeta, Blueprint, CostMode, Job } from '../../../server/jev/studio/types';
import type { ProdRecord } from '../../../server/jev/studio/memory';
import type { ActorLibrary, ActorLook3D } from '../../../server/jev/studio/actor/cast3d';
import { loadBlueprint, newBlueprint, touch, DEFAULT_CAP_USD } from '../../../server/jev/studio/blueprint';

export const VS_KEYS = [
  'vs.settings',
  'vs.projects',
  'vs.assets.meta',
  'vs.jobs',
  'vs.memory',
  'vs.registry',
  'vs.actors',
  'vs.decors',
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
  /** Circuit Grok (ON by default): real generative motion on the key shots with the OpenRouter key, HARD cap 0,30 $ / min. */
  circuit: boolean;
  /** Captions FR + EN (OFF by default: v44 showed the English line over the faces). */
  bilingualCaptions?: boolean;
  /** ACTEURS 3D (OFF by default): scenes without a clip are played by the reusable 3D actors instead of the Marionnette. */
  actors3d?: boolean;
  /** With the owner's troupe the film is played by the engine for free; Grok animates the punchline ONLY when this is on (paid). */
  grokKeyShots?: boolean;
  /** Paid adapted sets (vertical, empty) made by the image model; off = the owner's set pictures completed in mirror (0 $). */
  adaptedDecors?: boolean;
  /** Width of the rendered film (9:16: 540 → 540×960, 720 → 720×1280, 1080 → 1080×1920 TikTok HD). Default 720. */
  renderWidth?: 540 | 720 | 1080;
  /** Version of the owner's embedded troupe (sheets, galleries, sets) already installed in the library. */
  troupeKit?: string;
  /** Last « Budget du film » typed in the creation form (null = automatic). */
  filmBudget?: number | null;
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
  circuit: true,
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
  /** The reusable 3D actors (rigged once, reused in every film), key = speakerKey(name). */
  actors: ActorLibrary;
  /** The owner's EMPTY SETS (their own décor images), by set name: the background of the scenes played by the actors. */
  decors: Record<string, { name: string; assetId: string; at: number; fit?: DecorFit } & DecorLayers>;
  /** Transient (never persisted): discovery in progress, last error. */
  busy: string | null;
  hydrate: () => Promise<void>;
  setSettings: (p: Partial<StudioSettings>) => void;
  upsertProject: (bp: Blueprint, note?: string) => void;
  patchProject: (id: string, f: (bp: Blueprint) => Blueprint, note?: string) => void;
  createProject: (idea: string, o?: WizardOpts) => Blueprint;
  deleteProject: (id: string) => void;
  addAsset: (a: AssetMeta) => void;
  removeAsset: (id: string) => void;
  setJobs: (f: (jobs: Job[]) => Job[]) => void;
  addMemory: (r: ProdRecord) => void;
  setRegistry: (r: Registry) => void;
  upsertActors: (looks: ActorLook3D[]) => void;
  removeActor: (key: string) => void;
  upsertDecor: (name: string, assetId: string, fit?: DecorFit, layers?: DecorLayers) => void;
  removeDecor: (name: string) => void;
  setBusy: (b: string | null) => void;
}

/** Wizard options accepted at creation. */
export interface WizardOpts {
  dimension?: '2D' | '3D';
  duration?: number;
  aspect?: string;
  language?: string;
  platform?: string;
  audience?: string;
  realism?: number;
  dialogue?: boolean;
  music?: boolean;
  sfx?: boolean;
  subtitles?: boolean;
  preset?: string;
}
const uid = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * How the owner's set picture stands behind the actors at the RIGHT SCALE: the real height (m) its picture covers at
 * the depth of the set, where its floor is (fraction of the height, from the top; > 1 = under the picture), the part
 * (fraction of the width) that goes behind the actors (the part without people), an extra depth blur.
 */
/** Measured layers of a set picture: its depth map (relief) and the soft mask of the people painted in it (they sway). */
export interface DecorLayers {
  depthAssetId?: string;
  peopleAssetId?: string;
}
export interface DecorFit {
  mH: number;
  floor: number;
  cx: number;
  blur?: number;
}
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
    actors: {},
    decors: {},
    busy: null,
    hydrate: async () => {
      if (get().hydrated) return;
      const [s, p, a, j, m, r, act, dec] = await Promise.all([
        kv.get<StudioSettings>('vs.settings').catch(() => undefined),
        kv.get<Record<string, Blueprint>>('vs.projects').catch(() => undefined),
        kv.get<Record<string, AssetMeta>>('vs.assets.meta').catch(() => undefined),
        kv.get<Job[]>('vs.jobs').catch(() => undefined),
        kv.get<ProdRecord[]>('vs.memory').catch(() => undefined),
        kv.get<Registry>('vs.registry').catch(() => undefined),
        kv.get<ActorLibrary>('vs.actors').catch(() => undefined),
        kv.get<StudioState['decors']>('vs.decors').catch(() => undefined),
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
        actors: act ?? {},
        decors: dec ?? {},
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
    createProject: (idea, o) => {
      const s = get().settings;
      const bp = newBlueprint({
        id: uid(),
        idea,
        mode: s.mode,
        cap: s.cap,
        dimension: o?.dimension,
        options: o,
      });
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
    upsertActors: (looks) => {
      if (!looks.length) return;
      const actors = { ...get().actors };
      for (const l of looks) actors[l.key] = { ...actors[l.key], ...l };
      set({ actors });
      persist('vs.actors', () => get().actors);
    },
    upsertDecor: (name, assetId, fit, layers) => {
      set({ decors: { ...get().decors, [name.toLowerCase()]: { name, assetId, at: Date.now(), ...(fit ? { fit } : {}), ...(layers ?? {}) } } });
      persist('vs.decors', () => get().decors);
    },
    removeDecor: (name) => {
      const { [name.toLowerCase()]: _gone, ...decors } = get().decors;
      set({ decors });
      persist('vs.decors', () => get().decors);
    },
    removeActor: (key) => {
      const { [key]: _gone, ...actors } = get().actors;
      set({ actors });
      persist('vs.actors', () => get().actors);
    },
    setBusy: (b) => set({ busy: b }),
  };
});
