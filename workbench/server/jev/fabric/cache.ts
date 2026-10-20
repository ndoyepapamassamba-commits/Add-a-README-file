// COGNITIVE CACHE: seven invalidable levels, each entry with TTL, version, provenance and confidence.
//  L0 exact answer · L1 task classification · L2 routing decision · L3 tool selection ·
//  L4 skill selection · L5 strategy · L6 model expertise
export type CacheLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
export const CACHE_LEVELS: Record<CacheLevel, { label: string; ttlMs: number }> = {
  L0: { label: 'réponse exacte', ttlMs: 60 * 60_000 },
  L1: { label: 'classification de la tâche', ttlMs: 24 * 3600_000 },
  L2: { label: 'décision de routage', ttlMs: 30 * 60_000 },
  L3: { label: 'sélection d’outils', ttlMs: 30 * 60_000 },
  L4: { label: 'sélection de skills', ttlMs: 30 * 60_000 },
  L5: { label: 'stratégie', ttlMs: 6 * 3600_000 },
  L6: { label: 'expertise des modèles', ttlMs: 10 * 60_000 },
};
interface Entry<T> {
  value: T;
  expires: number;
  version: string;
  provenance: string;
  confidence: number;
  hits: number;
}
export class CognitiveCache {
  private m = new Map<string, Entry<unknown>>();
  private stats = new Map<CacheLevel, { hits: number; misses: number }>();
  constructor(
    private version = '1',
    private now: () => number = Date.now,
  ) {}
  private k = (l: CacheLevel, key: string) => `${l}|${key}`;
  private st(l: CacheLevel) {
    const s = this.stats.get(l) ?? { hits: 0, misses: 0 };
    this.stats.set(l, s);
    return s;
  }
  get<T>(l: CacheLevel, key: string): { value: T; provenance: string; confidence: number } | null {
    const e = this.m.get(this.k(l, key)) as Entry<T> | undefined;
    if (!e || e.expires <= this.now() || e.version !== this.version) {
      if (e) this.m.delete(this.k(l, key));
      this.st(l).misses++;
      return null;
    }
    e.hits++;
    this.st(l).hits++;
    return { value: e.value, provenance: e.provenance, confidence: e.confidence };
  }
  set<T>(
    l: CacheLevel,
    key: string,
    value: T,
    o: { provenance: string; confidence?: number; ttlMs?: number },
  ): T {
    this.m.set(this.k(l, key), {
      value,
      expires: this.now() + (o.ttlMs ?? CACHE_LEVELS[l].ttlMs),
      version: this.version,
      provenance: o.provenance,
      confidence: o.confidence ?? 1,
      hits: 0,
    });
    return value;
  }
  /** A cached decision with low confidence is not reused. */
  memo<T>(
    l: CacheLevel,
    key: string,
    fn: () => T,
    o: { provenance: string; confidence?: number; minConfidence?: number },
  ): { value: T; hit: boolean } {
    const c = this.get<T>(l, key);
    if (c && c.confidence >= (o.minConfidence ?? 0)) return { value: c.value, hit: true };
    return { value: this.set(l, key, fn(), o), hit: false };
  }
  /** Bumping the version invalidates everything (new skills, new policies, new catalog). */
  setVersion(v: string): void {
    this.version = v;
  }
  invalidate(l?: CacheLevel): number {
    let n = 0;
    for (const k of [...this.m.keys()])
      if (!l || k.startsWith(`${l}|`)) {
        this.m.delete(k);
        n++;
      }
    return n;
  }
  report(): {
    level: CacheLevel;
    label: string;
    entries: number;
    hits: number;
    misses: number;
    hitRate: number | null;
    ttlMin: number;
  }[] {
    return (Object.keys(CACHE_LEVELS) as CacheLevel[]).map((l) => {
      const s = this.stats.get(l) ?? { hits: 0, misses: 0 };
      const entries = [...this.m.keys()].filter((k) => k.startsWith(`${l}|`)).length;
      return {
        level: l,
        label: CACHE_LEVELS[l].label,
        entries,
        hits: s.hits,
        misses: s.misses,
        hitRate: s.hits + s.misses ? s.hits / (s.hits + s.misses) : null,
        ttlMin: CACHE_LEVELS[l].ttlMs / 60_000,
      };
    });
  }
}
