// JEV COGNITIVE OS — COGNITIVE CACHE (L0 deterministic · L1 answer · L2 reasoning pattern · L3 skill · L4 strategy · L5 experience).
// Nothing is recomputed that can be reused — and nothing stale is reused: every entry stores the freshness stamp it was made under.
export type CacheLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
export interface Stamp {
  /** Version of the data the answer depended on (file hashes, dates…). */
  data: string;
  policy: number;
  /** Hash of the model capability set (catalogue). */
  capabilities: string;
  /** Normalised input (hash). A material change of the input is a different key anyway. */
  input: string;
}
interface Entry<T> {
  v: T;
  at: number;
  stamp: Stamp;
}
export const TTL: Record<CacheLevel, number> = {
  L0: Infinity,
  L1: 24 * 3600_000,
  L2: 7 * 86400_000,
  L3: 30 * 86400_000,
  L4: 30 * 86400_000,
  L5: 90 * 86400_000,
};
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
export const hashKey = (s: string) => {
  let h = 5381;
  for (const c of norm(s)) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
};
export class CognitiveCache {
  private m = new Map<string, Entry<unknown>>();
  readonly stats: Record<CacheLevel, { hits: number; misses: number; invalidated: number }> =
    Object.fromEntries(
      (Object.keys(TTL) as CacheLevel[]).map((l) => [l, { hits: 0, misses: 0, invalidated: 0 }]),
    ) as never;
  constructor(private now: () => number = () => Date.now()) {}
  private k(level: CacheLevel, key: string) {
    return `${level}:${hashKey(key)}`;
  }
  get<T>(
    level: CacheLevel,
    key: string,
    stamp: Stamp,
  ): { hit: true; value: T } | { hit: false; reason: string } {
    const e = this.m.get(this.k(level, key)) as Entry<T> | undefined;
    if (!e) {
      this.stats[level].misses++;
      return { hit: false, reason: 'absent' };
    }
    const why = this.staleReason(level, e, stamp);
    if (why) {
      this.m.delete(this.k(level, key));
      this.stats[level].invalidated++;
      this.stats[level].misses++;
      return { hit: false, reason: why };
    }
    this.stats[level].hits++;
    return { hit: true, value: e.v };
  }
  private staleReason(level: CacheLevel, e: Entry<unknown>, s: Stamp): string | null {
    if (this.now() - e.at > TTL[level]) return 'expiré';
    if (e.stamp.data !== s.data) return 'les données ont changé';
    if (e.stamp.policy !== s.policy) return 'la politique a changé';
    if (e.stamp.capabilities !== s.capabilities) return 'les capacités des modèles ont changé';
    if (e.stamp.input !== s.input) return 'l’entrée a changé de façon significative';
    return null;
  }
  put<T>(level: CacheLevel, key: string, value: T, stamp: Stamp) {
    this.m.set(this.k(level, key), { v: value, at: this.now(), stamp });
  }
  invalidateAll(level?: CacheLevel) {
    for (const k of [...this.m.keys()]) if (!level || k.startsWith(`${level}:`)) this.m.delete(k);
  }
  size = () => this.m.size;
}
