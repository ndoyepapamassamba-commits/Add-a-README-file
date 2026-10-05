// JEV caches: one TTL cache per kind (task, routing, model, context, memory,
// tool, skill, prompt, result, QA) with hit / miss statistics. Keys are
// normalised so that near-identical requests reuse the same decision.
export type CacheKind =
  | 'task'
  | 'routing'
  | 'model'
  | 'context'
  | 'memory'
  | 'tool'
  | 'skill'
  | 'prompt'
  | 'result'
  | 'qa'
  | 'jev1';

export const CACHE_TTL_MS: Record<CacheKind, number> = {
  task: 30 * 60_000,
  routing: 10 * 60_000,
  model: 60 * 60_000,
  context: 2 * 60_000,
  memory: 5 * 60_000,
  tool: 30 * 60_000,
  skill: 30 * 60_000,
  prompt: 2 * 60_000,
  result: 24 * 3_600_000,
  qa: 60 * 60_000,
  jev1: 24 * 3_600_000,
};

interface Entry<T> {
  v: T;
  at: number;
  /** Version stamp: an entry stored under another version is invalid (catalog / settings changed). */
  ver: string;
}

/** Lower-case, accents removed, digits and punctuation collapsed: « Analyse ce fichier ! » ≈ « analyse ce fichier ». */
export function normalizeKey(...parts: unknown[]): string {
  return parts
    .map((p) => (typeof p === 'string' ? p : JSON.stringify(p ?? '')))
    .join('|')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}|.]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

export class JevCache {
  private maps = new Map<CacheKind, Map<string, Entry<unknown>>>();
  readonly stats: Record<CacheKind, { hits: number; misses: number }> = Object.fromEntries(
    (Object.keys(CACHE_TTL_MS) as CacheKind[]).map((k) => [k, { hits: 0, misses: 0 }]),
  ) as Record<CacheKind, { hits: number; misses: number }>;
  constructor(
    private version = '',
    private max = 300,
    private now = () => Date.now(),
  ) {}

  /** Invalidates every entry made under a different version (catalog, settings, mode…). */
  setVersion(v: string): void {
    this.version = v;
  }

  get<T>(kind: CacheKind, key: string): T | undefined {
    const m = this.maps.get(kind);
    const e = m?.get(key);
    if (e && e.ver === this.version && this.now() - e.at < CACHE_TTL_MS[kind]) {
      this.stats[kind].hits++;
      return e.v as T;
    }
    if (e) m!.delete(key);
    this.stats[kind].misses++;
    return undefined;
  }

  set<T>(kind: CacheKind, key: string, v: T): T {
    let m = this.maps.get(kind);
    if (!m) this.maps.set(kind, (m = new Map()));
    if (m.size >= this.max) m.delete(m.keys().next().value!);
    m.set(key, { v, at: this.now(), ver: this.version });
    return v;
  }

  /** get-or-compute, recording whether the decision came from the cache. */
  memo<T>(kind: CacheKind, key: string, fn: () => T): { value: T; hit: boolean } {
    const c = this.get<T>(kind, key);
    if (c !== undefined) return { value: c, hit: true };
    return { value: this.set(kind, key, fn()), hit: false };
  }

  invalidate(kind?: CacheKind): void {
    if (kind) this.maps.delete(kind);
    else this.maps.clear();
  }

  hitRate(): number {
    let h = 0;
    let t = 0;
    for (const s of Object.values(this.stats)) {
      h += s.hits;
      t += s.hits + s.misses;
    }
    return t ? h / t : 0;
  }
}
