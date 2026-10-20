// Time Machine: before a run modifies the workspace, the original version of
// every file it touches is kept (copy-on-write). A checkpoint can be compared
// (functional diff) and restored. Stored in IndexedDB (last 20 runs).
import { buildTwin, functionalDiff } from '../../server/agent/intelligence';
import { kv } from './db';
import type { VFile } from './types';

export interface Checkpoint {
  id: string;
  sessionId: string;
  goal: string;
  at: number;
  /** Original file (null = did not exist before the run). */
  before: Record<string, VFile | null>;
}

const MAX = 20;
const MAX_FILE = 5_000_000;
let active: Checkpoint | null = null;

export function beginCheckpoint(sessionId: string, goal: string): void {
  active = {
    id: `cp_${Date.now().toString(36)}`,
    sessionId,
    goal: goal.slice(0, 200),
    at: Date.now(),
    before: {},
  };
}
/** Called by the store right before a file is written or deleted. */
export function noteBefore(path: string, prev: VFile | undefined): void {
  if (!active || path in active.before) return;
  active.before[path] = prev && prev.data.length <= MAX_FILE ? { ...prev } : prev ? null : null;
}
export async function endCheckpoint(): Promise<Checkpoint | null> {
  const cp = active;
  active = null;
  if (!cp || !Object.keys(cp.before).length) return null;
  const list = (await kv.get<Checkpoint[]>('checkpoints').catch(() => undefined)) ?? [];
  await kv.set('checkpoints', [...list, cp].slice(-MAX));
  return cp;
}
export async function listCheckpoints(): Promise<Checkpoint[]> {
  return ((await kv.get<Checkpoint[]>('checkpoints').catch(() => undefined)) ?? []).slice().reverse();
}

const text = (f: VFile | null | undefined) =>
  f ? (f.binary ? `[binaire ${f.size ?? f.data.length} o]` : f.data) : null;

/** Functional diff between the state before a run and now. */
export async function diffCheckpoint(id: string): Promise<string> {
  const cp = (await listCheckpoints()).find((c) => c.id === id);
  if (!cp) throw new Error(`Point de restauration inconnu : ${id}`);
  const { useStore } = await import('./store');
  const files = useStore.getState().files;
  const before = Object.fromEntries(Object.entries(cp.before).map(([p, f]) => [p, text(f)]));
  const after = Object.fromEntries(Object.keys(cp.before).map((p) => [p, text(files[p])]));
  const twin = buildTwin(Object.values(files).map((f) => ({ path: f.path, text: f.binary ? null : f.data })));
  return `Mission du ${new Date(cp.at).toLocaleString('fr-FR')} — « ${cp.goal} »\n${functionalDiff(before, after, twin).summary}`;
}

/** Puts every file touched by the run back as it was before (files created by the run are removed). */
export async function restoreCheckpoint(id: string): Promise<string[]> {
  const cp = (await listCheckpoints()).find((c) => c.id === id);
  if (!cp) throw new Error(`Point de restauration inconnu : ${id}`);
  const { useStore } = await import('./store');
  const st = useStore.getState();
  const restored: string[] = [];
  for (const [p, f] of Object.entries(cp.before)) {
    if (f) st.writeFile({ path: f.path, data: f.data, binary: f.binary, mime: f.mime, size: f.size });
    else if (st.files[p]) st.deleteFile(p);
    restored.push(p);
  }
  return restored;
}
