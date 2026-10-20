// Decision cache: memoises PURE derivations (task DNA, champion lookup, routing decision, benchmark result) with measured
// hit rate and latency. A key always includes every input that changes the answer (classification, risk, lab revision,
// log length, settings signature): the cache can therefore never bypass the security gate, the risk gate or a degradation.
export type CacheKind =
  | 'taskDNA'
  | 'retrievedSkills'
  | 'compiledCapsule'
  | 'routingDecision'
  | 'championLookup'
  | 'benchmarkResult';

export interface CacheStat {
  hits: number;
  misses: number;
  hitRate: number | null;
  /** Mean latency (ms) of a hit / of a miss (the computation itself), measured. */
  hitMs: number | null;
  missMs: number | null;
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class DecisionCache {
  private store = new Map<string, unknown>();
  private stat = new Map<CacheKind, { hits: number; misses: number; hitMs: number; missMs: number }>();
  constructor(private max = 400) {}

  get<T>(kind: CacheKind, key: string, compute: () => T): T {
    const k = `${kind}|${key}`;
    const st = this.stat.get(kind) ?? { hits: 0, misses: 0, hitMs: 0, missMs: 0 };
    const t0 = now();
    if (this.store.has(k)) {
      const v = this.store.get(k) as T;
      st.hits++;
      st.hitMs += now() - t0;
      this.stat.set(kind, st);
      return v;
    }
    const v = compute();
    st.misses++;
    st.missMs += now() - t0;
    this.stat.set(kind, st);
    if (this.store.size >= this.max) this.store.delete(this.store.keys().next().value as string);
    this.store.set(k, v);
    return v;
  }
  /** Records an externally measured hit / miss (e.g. the capsule cache) so every cache appears in one table. */
  note(kind: CacheKind, hit: boolean, ms: number): void {
    const st = this.stat.get(kind) ?? { hits: 0, misses: 0, hitMs: 0, missMs: 0 };
    if (hit) {
      st.hits++;
      st.hitMs += ms;
    } else {
      st.misses++;
      st.missMs += ms;
    }
    this.stat.set(kind, st);
  }
  stats(): Record<CacheKind, CacheStat> {
    const out = {} as Record<CacheKind, CacheStat>;
    for (const kind of [
      'taskDNA',
      'retrievedSkills',
      'compiledCapsule',
      'routingDecision',
      'championLookup',
      'benchmarkResult',
    ] as CacheKind[]) {
      const s = this.stat.get(kind);
      const n = s ? s.hits + s.misses : 0;
      out[kind] = {
        hits: s?.hits ?? 0,
        misses: s?.misses ?? 0,
        hitRate: n ? s!.hits / n : null,
        hitMs: s && s.hits ? s.hitMs / s.hits : null,
        missMs: s && s.misses ? s.missMs / s.misses : null,
      };
    }
    return out;
  }
  clear(): void {
    this.store.clear();
  }
  get size(): number {
    return this.store.size;
  }
}
