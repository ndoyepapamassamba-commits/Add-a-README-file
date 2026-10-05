// APPRENTICE CAPSULE CACHE: family × model × profileVersion × skillHash × contextHash × toolHash → compiled capsule.
// CACHE HIT / CACHE MISS are counted for real; nothing is cached for a critical task that needs fresh data.
export const hashOf = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

export interface CacheKeyParts {
  family: string;
  model: string;
  profileVersion: string;
  skillHash: string;
  contextHash: string;
  toolHash: string;
}
export const cacheKey = (k: CacheKeyParts): string =>
  [k.family, k.model, k.profileVersion, k.skillHash, k.contextHash, k.toolHash].join('|');

export class CapsuleCache<T> {
  private m = new Map<string, { value: T; at: number; hits: number }>();
  hits = 0;
  misses = 0;
  constructor(
    private readonly ttlMs = 30 * 60_000,
    private readonly max = 120,
    private readonly now: () => number = Date.now,
  ) {}
  get(key: string): T | null {
    const e = this.m.get(key);
    if (e && this.now() - e.at <= this.ttlMs) {
      e.hits++;
      this.hits++;
      return e.value;
    }
    if (e) this.m.delete(key);
    this.misses++;
    return null;
  }
  set(key: string, value: T): void {
    if (this.m.size >= this.max) this.m.delete(this.m.keys().next().value as string);
    this.m.set(key, { value, at: this.now(), hits: 0 });
  }
  clear(): void {
    this.m.clear();
  }
  get size(): number {
    return this.m.size;
  }
  stats() {
    const n = this.hits + this.misses;
    return { entries: this.m.size, hits: this.hits, misses: this.misses, hitRate: n ? this.hits / n : null };
  }
}
