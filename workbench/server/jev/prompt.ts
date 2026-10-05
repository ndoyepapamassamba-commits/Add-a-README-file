// PROMPT COMPILER 2.0 and SKILL CONTEXT COMPILER.
// The system prompt is assembled from many sections (agent, doctrine, manual,
// strategy, skills, packet, memory, mission protocol). The compiler removes
// what is sent twice, drops empty sections, flags contradictions and measures
// the PROMPT WASTE SCORE (share of the raw prompt that was useless).
import { estTokens } from './context';
import { keywords } from './live';

export interface PromptSection {
  name: string;
  text: string;
  /** Pinned sections are never trimmed (agent identity, safety rules). */
  pinned?: boolean;
}
export interface CompiledPrompt {
  text: string;
  tokensBefore: number;
  tokensAfter: number;
  /** 0..1 — share of the raw prompt removed as duplicate / empty. */
  wasteScore: number;
  removedLines: number;
  contradictions: string[];
}

const norm = (l: string) =>
  l
    .toLowerCase()
    .replace(/[`*_>#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function compilePrompt(sections: PromptSection[]): CompiledPrompt {
  const raw = sections
    .map((s) => s.text)
    .filter(Boolean)
    .join('\n\n');
  const seen = new Set<string>();
  let removed = 0;
  const out: string[] = [];
  for (const s of sections) {
    if (!s.text?.trim()) continue;
    const kept: string[] = [];
    for (const line of s.text.split('\n')) {
      const n = norm(line);
      // Only substantial lines count as duplicates (short lines are structure).
      if (n.length >= 40 && seen.has(n) && !s.pinned) {
        removed++;
        continue;
      }
      if (n.length >= 40) seen.add(n);
      kept.push(line);
    }
    const t = kept
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (t) out.push(t);
  }
  const text = out.join('\n\n');
  const before = estTokens(raw);
  const after = estTokens(text);
  return {
    text,
    tokensBefore: before,
    tokensAfter: after,
    wasteScore: before ? Math.max(0, 1 - after / before) : 0,
    removedLines: removed,
    contradictions: contradictions(text),
  };
}

/** "always X" vs "never X" (fr / en) on the same subject → reported, never silently resolved. */
export function contradictions(text: string): string[] {
  const pos = new Map<string, string>();
  const neg = new Map<string, string>();
  for (const line of text.split('\n')) {
    for (const m of line.matchAll(/\b(always|toujours)\s+([a-zà-ÿ' ]{6,40})/gi))
      pos.set(norm(m[2]!).split(' ').slice(0, 3).join(' '), line.trim().slice(0, 120));
    for (const m of line.matchAll(/\b(never|jamais|ne jamais|do not|don't)\s+([a-zà-ÿ' ]{6,40})/gi))
      neg.set(norm(m[2]!).split(' ').slice(0, 3).join(' '), line.trim().slice(0, 120));
  }
  return [...pos.keys()].filter((k) => neg.has(k)).map((k) => `« ${pos.get(k)} » ↔ « ${neg.get(k)} »`);
}

/**
 * SKILL CONTEXT COMPILER: a large skill body is cut into its markdown sections;
 * the intro and the sections relevant to the goal are kept under a token budget.
 * Small skills are injected whole.
 */
export function compileSkill(
  body: string,
  goal: string,
  budgetTokens = 1500,
): { text: string; before: number; after: number; sections: number; kept: number } {
  const before = estTokens(body);
  if (before <= budgetTokens) return { text: body, before, after: before, sections: 1, kept: 1 };
  const parts = body.split(/\n(?=#{1,3} )/);
  const intro = parts.shift() ?? '';
  const g = keywords(goal);
  const scored = parts.map((p, i) => {
    const kw = keywords(p.slice(0, 3000));
    const hit = [...kw].filter((w) => g.has(w)).length;
    const head = /^#{1,3} .*(r[èe]gle|rule|important|s[ée]curit|must|toujours|never|jamais)/i.test(p) ? 2 : 0;
    return { p, i, score: hit + head, rule: head > 0 };
  });
  let used = estTokens(intro);
  const keep = new Set<number>();
  // Rule sections first (short, binding), then by relevance.
  for (const s of [...scored].sort((a, b) => Number(b.rule) - Number(a.rule) || b.score - a.score)) {
    if (s.score <= 0) break;
    const t = estTokens(s.p);
    const room = budgetTokens - used;
    if (t > room) {
      // A relevant section that does not fit is truncated (its head carries the rules), not dropped.
      if (room < 150) continue;
      s.p = `${s.p.slice(0, Math.floor(room * 3.8))}\n…(section tronquée par JEV)`;
    }
    used += estTokens(s.p);
    keep.add(s.i);
  }
  const kept = scored.filter((s) => keep.has(s.i)).map((s) => s.p);
  const omitted = parts.length - kept.length;
  const text = [
    intro.trim(),
    ...kept,
    omitted
      ? `_(JEV : ${omitted} section(s) de ce skill non pertinente(s) pour cette tâche omise(s) ; lisez le skill complet via skill.read si nécessaire.)_`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { text, before, after: estTokens(text), sections: parts.length + 1, kept: kept.length + 1 };
}
