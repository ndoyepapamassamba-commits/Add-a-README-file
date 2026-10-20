// Production Blueprint: versioned JSON of a whole production (resumable after the browser is closed).
import type { Blueprint, CostMode, ProductionOptions, Stage, StageStatus, StyleDNA } from './types';
import { STAGES } from './types';
import { STYLE_PRESETS, type Dimension } from './style';
import { scanValue } from './secrets';

export const BLUEPRINT_VERSION = 1;
export const DEFAULT_CAP_USD = 1;

export function newBlueprint(o: {
  id: string;
  idea: string;
  now?: number;
  mode?: CostMode;
  cap?: number;
  style?: StyleDNA;
  dimension?: Dimension;
  options?: Partial<ProductionOptions> & {
    duration?: number;
    aspect?: string;
    language?: string;
    platform?: string;
  };
}): Blueprint {
  const now = o.now ?? Date.now();
  const stages: Record<string, StageStatus> = {};
  for (const s of STAGES) stages[s] = s === 'VIDEO' ? 'DISABLED' : 'QUEUED';
  return {
    version: BLUEPRINT_VERSION,
    project: { id: o.id, createdAt: now, updatedAt: now, idea: o.idea, status: 'DRAFT' },
    title: '',
    language: o.options?.language ?? 'fr',
    duration: o.options?.duration ?? 62,
    platform: o.options?.platform ?? 'TikTok',
    aspect: o.options?.aspect ?? '9:16',
    options: o.options
      ? {
          audience: o.options.audience ?? '',
          realism: o.options.realism ?? 20,
          dialogue: o.options.dialogue ?? true,
          music: o.options.music ?? true,
          sfx: o.options.sfx ?? true,
          subtitles: o.options.subtitles ?? true,
          preset: o.options.preset ?? 'TikTok',
        }
      : undefined,
    mode: o.mode ?? 'ECO',
    cap: o.cap ?? DEFAULT_CAP_USD,
    styleDNA: o.style ?? STYLE_PRESETS[o.dimension ?? '2D'],
    story: null,
    characters: [],
    worlds: [],
    voices: [],
    scenes: [],
    assets: [],
    prompts: [],
    models: [],
    generationJobs: [],
    audio: { sfx: [] },
    subtitles: { style: 'COMEDY', lines: [] },
    timeline: { clips: [], aspect: o.options?.aspect ?? '9:16' },
    stages,
    qa: null,
    costs: [],
    decisions: [],
    revisions: [{ at: now, note: 'création' }],
  };
}
export const touch = (bp: Blueprint, note: string, now = Date.now()): Blueprint => ({
  ...bp,
  project: { ...bp.project, updatedAt: now },
  revisions: [...bp.revisions, { at: now, note }].slice(-200),
});
export const setStage = (bp: Blueprint, st: Stage, status: StageStatus): Blueprint => ({
  ...bp,
  stages: { ...bp.stages, [st]: status },
});
export const addDecision = (bp: Blueprint, stage: string, text: string, now = Date.now()): Blueprint => ({
  ...bp,
  decisions: [...bp.decisions, { at: now, stage, text }].slice(-300),
});
export const spent = (bp: Blueprint): number => bp.costs.reduce((a, c) => a + c.amount, 0);
export const costIsCertain = (bp: Blueprint): boolean => bp.costs.every((c) => c.certain);
export const progress = (bp: Blueprint): number => {
  const active = STAGES.filter((s) => bp.stages[s] !== 'DISABLED');
  const done = active.filter((s) => bp.stages[s] === 'COMPLETED' || bp.stages[s] === 'WARNING').length;
  return active.length ? done / active.length : 0;
};
/** Blueprint safe to store / export: refuses anything containing a secret pattern. */
export function serialize(bp: Blueprint): { ok: true; json: string } | { ok: false; error: string } {
  const hits = scanValue(bp);
  if (hits.length)
    return {
      ok: false,
      error: `motif de secret détecté (${hits.map((h) => h.kind).join(', ')}) : export bloqué`,
    };
  return { ok: true, json: JSON.stringify(bp, null, 2) };
}
/** Migration-tolerant loader. */
export function loadBlueprint(raw: unknown): Blueprint | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Blueprint;
  if (typeof b.version !== 'number' || !b.project?.id || !Array.isArray(b.scenes)) return null;
  const base = newBlueprint({ id: b.project.id, idea: b.project.idea ?? '' });
  return { ...base, ...b, stages: { ...base.stages, ...b.stages } };
}
