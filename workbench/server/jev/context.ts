// JEV Context Compiler + Memory Selector: instead of sending everything to the
// LLM, every candidate element (history turn, file, memory, rule, lesson…) gets
// a RELEVANCE SCORE (semantic overlap + task relevance + recency + importance)
// and a level HIGH / MEDIUM / LOW / IGNORE. Only HIGH and the best MEDIUM items,
// within a token budget, reach the prompt.
import { keywords } from '../agent/intelligence';

export type Relevance = 'HIGH' | 'MEDIUM' | 'LOW' | 'IGNORE';
export interface ContextItem {
  id: string;
  kind: 'history' | 'file' | 'memory' | 'rule' | 'lesson' | 'skill' | 'tool' | 'doc';
  text: string;
  /** 0 (old) → 1 (latest). */
  recency?: number;
  /** 0–1, e.g. user rules and failures are important. */
  importance?: number;
  /** Mandatory items (current request, user rules) are always kept. */
  pinned?: boolean;
}
export interface ScoredItem extends ContextItem {
  score: number;
  level: Relevance;
  tokens: number;
}

export const estTokens = (s: string) => Math.ceil(s.length / 3.8);

/** Semantic overlap (keyword Jaccard, weighted towards the query) between a goal and a text. */
export function overlap(goal: string[], text: string): number {
  if (!goal.length) return 0;
  const k = new Set(keywords(text, 200));
  let hit = 0;
  for (const g of goal) if (k.has(g)) hit++;
  return hit / goal.length;
}

export function scoreItems(goal: string, items: ContextItem[]): ScoredItem[] {
  const g = keywords(goal, 40);
  return items.map((it) => {
    const sem = overlap(g, it.text);
    const rec = it.recency ?? 0.5;
    const imp = it.importance ?? 0.3;
    const score = it.pinned ? 1 : Math.min(1, 0.55 * sem + 0.25 * rec + 0.2 * imp);
    const level: Relevance = it.pinned
      ? 'HIGH'
      : score >= 0.5
        ? 'HIGH'
        : score >= 0.3
          ? 'MEDIUM'
          : score >= 0.15
            ? 'LOW'
            : 'IGNORE';
    return { ...it, score, level, tokens: estTokens(it.text) };
  });
}

export interface ContextPack {
  kept: ScoredItem[];
  dropped: ScoredItem[];
  tokensBefore: number;
  tokensAfter: number;
  /** 0–1 share of candidate tokens removed. */
  compression: number;
  levels: Record<Relevance, number>;
}

/** HIGH items first (all), then MEDIUM by score while the budget allows; LOW / IGNORE dropped. */
export function compileContext(goal: string, items: ContextItem[], budgetTokens: number): ContextPack {
  const scored = scoreItems(goal, items);
  const levels = { HIGH: 0, MEDIUM: 0, LOW: 0, IGNORE: 0 } as Record<Relevance, number>;
  for (const s of scored) levels[s.level]++;
  const order = [...scored].sort(
    (a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.score - a.score,
  );
  const kept: ScoredItem[] = [];
  let used = 0;
  for (const s of order) {
    if (s.level === 'LOW' || s.level === 'IGNORE') continue;
    if (!s.pinned && s.level === 'MEDIUM' && used + s.tokens > budgetTokens) continue;
    if (!s.pinned && s.level === 'HIGH' && used + s.tokens > budgetTokens * 1.2) continue;
    kept.push(s);
    used += s.tokens;
  }
  const keptIds = new Set(kept.map((k) => k.id));
  const tokensBefore = scored.reduce((a, s) => a + s.tokens, 0);
  return {
    kept,
    dropped: scored.filter((s) => !keptIds.has(s.id)),
    tokensBefore,
    tokensAfter: used,
    compression: tokensBefore ? 1 - used / tokensBefore : 0,
    levels,
  };
}

/** Memory Selector: which remembered items (rules, lessons, past missions) are worth injecting. */
export function selectMemory(
  goal: string,
  memory: { id: string; text: string; at: number; importance: number; kind: ContextItem['kind'] }[],
  budgetTokens: number,
  now = Date.now(),
): ContextPack {
  const newest = Math.max(now, ...memory.map((m) => m.at));
  const oldest = Math.min(newest, ...memory.map((m) => m.at));
  const span = Math.max(1, newest - oldest);
  return compileContext(
    goal,
    memory.map((m) => ({
      id: m.id,
      kind: m.kind,
      text: m.text,
      recency: (m.at - oldest) / span,
      importance: m.importance,
      pinned: m.kind === 'rule',
    })),
    budgetTokens,
  );
}
