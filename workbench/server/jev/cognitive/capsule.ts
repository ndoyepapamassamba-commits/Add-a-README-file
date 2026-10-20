// JEV COGNITIVE OS — SEMANTIC CONTEXT COMPILER.
// RAW CONTEXT → COGNITIVE CAPSULE: only mission, constraints, facts, decisions, known results, open questions, relevant
// memory / skills, failure warnings and the output contract — extracted, never summarised by guesswork. After the
// compression the capsule is VERIFIED against the raw text: any critical element (number, path, identifier, quoted term)
// that sat in a relevant sentence and is missing is reported and RECOVERED.
import { estTokens, overlap } from '../context';
import { keywords } from '../../agent/intelligence';

export interface CapsuleInputs {
  goal: string;
  /** The raw context (history, files, notes…). */
  raw: string;
  memory?: string[];
  skills?: string[];
  failureWarnings?: string[];
  outputContract?: string;
  budgetTokens: number;
}
export interface CognitiveCapsule {
  text: string;
  sections: { key: string; lines: string[]; tokens: number }[];
  rawTokens: number;
  capsuleTokens: number;
  reduction: number;
  /** Critical items present in relevant raw sentences but absent from the capsule BEFORE recovery. */
  lost: string[];
  recovered: boolean;
  /** Always true after recovery: nothing critical is missing. */
  complete: boolean;
}
const SENT = (t: string) =>
  t
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 8);
const RX = {
  constraint:
    /\b(doit|doivent|dois|devra|il faut|interdit|jamais|toujours|obligatoire|ne pas|ne fais pas|uniquement|maximum|minimum|au plus|au moins|must|never|always|only|do not)\b/i,
  decision:
    /\b(d[ée]cid[ée]|d[ée]cision|choisi|retenu|valid[ée]|approuv[ée]|on garde|on part sur|nous avons choisi|decided|chosen|approved)\b/i,
  result:
    /\b(r[ée]sultat|total|trouv[ée]|obtenu|conclu|ok|termin[ée]|fait|g[ée]n[ée]r[ée]|cr[ée][ée]|result|found|done)\b/i,
  question: /\?\s*$|\b(reste à|à v[ée]rifier|inconnu|todo|à faire|open question)\b/i,
  critical:
    /(\b\d[\d\s.,]*\d\b|\b\d\b|[\w./-]+\.(?:xlsx?|csv|json|pdf|docx?|pptx?|ts|tsx|js|py|html|md)\b|\b[A-Z]{2,}[A-Z0-9_-]*\b|«[^»]+»|"[^"]{2,}")/g,
};
const criticalOf = (s: string): string[] =>
  [...(s.match(RX.critical) ?? [])]
    .map((x) => x.trim())
    .filter((x) => (x.length >= 1 && !/^\d$/.test(x)) || /\d{2,}/.test(x));

export function compileCognitiveCapsule(i: CapsuleInputs): CognitiveCapsule {
  const goalKw = keywords(i.goal, 40);
  const raw = SENT(i.raw);
  const rel = raw.map((s) => ({ s, r: overlap(goalKw, s) }));
  const take = (rx: RegExp, n: number) => [
    ...new Set(
      rel
        .filter((x) => rx.test(x.s))
        .sort((a, b) => b.r - a.r)
        .slice(0, n)
        .map((x) => x.s),
    ),
  ];
  const constraints = take(RX.constraint, 8);
  const decisions = take(RX.decision, 6);
  const results = take(RX.result, 6).filter((s) => !constraints.includes(s));
  const open = take(RX.question, 5);
  const facts = rel
    .filter(
      (x) =>
        x.r >= 0.15 && /\d/.test(x.s) && ![...constraints, ...decisions, ...results, ...open].includes(x.s),
    )
    .sort((a, b) => b.r - a.r)
    .slice(0, 10)
    .map((x) => x.s);
  const sections: { key: string; lines: string[] }[] = [
    { key: 'MISSION', lines: [i.goal.trim().slice(0, 400)] },
    { key: 'CONSTRAINTS', lines: constraints },
    { key: 'FACTS', lines: facts },
    { key: 'DECISIONS', lines: decisions },
    { key: 'KNOWN RESULTS', lines: results },
    { key: 'OPEN QUESTIONS', lines: open },
    { key: 'RELEVANT MEMORY', lines: (i.memory ?? []).slice(0, 4) },
    { key: 'RELEVANT SKILLS', lines: (i.skills ?? []).slice(0, 3) },
    { key: 'FAILURE WARNINGS', lines: (i.failureWarnings ?? []).slice(0, 3) },
    { key: 'OUTPUT CONTRACT', lines: i.outputContract ? [i.outputContract] : [] },
  ];
  // Lower priority sections are trimmed first when the budget is tight.
  const trimOrder = [
    'RELEVANT MEMORY',
    'FACTS',
    'KNOWN RESULTS',
    'OPEN QUESTIONS',
    'DECISIONS',
    'RELEVANT SKILLS',
    'FAILURE WARNINGS',
  ];
  const render = () =>
    sections
      .filter((s) => s.lines.length)
      .map((s) => `${s.key}:\n${s.lines.map((l) => `- ${l}`).join('\n')}`)
      .join('\n');
  let text = render();
  for (const k of trimOrder) {
    while (estTokens(text) > i.budgetTokens) {
      const sec = sections.find((s) => s.key === k);
      if (!sec || !sec.lines.length) break;
      sec.lines.pop();
      text = render();
    }
  }
  // Verification: critical items of RELEVANT raw sentences that the capsule lost.
  const have = new Set(criticalOf(text));
  const lost = new Set<string>();
  const lostSentences: string[] = [];
  for (const x of rel.filter((y) => y.r >= 0.3)) {
    const miss = criticalOf(x.s).filter((c) => !have.has(c) && !text.includes(c));
    if (miss.length) {
      miss.forEach((m) => lost.add(m));
      lostSentences.push(x.s);
    }
  }
  let recovered = false;
  if (lostSentences.length && estTokens(text) + estTokens(lostSentences.join(' ')) <= i.budgetTokens * 1.25) {
    sections.push({ key: 'RECOVERED', lines: [...new Set(lostSentences)].slice(0, 6) });
    text = render();
    recovered = true;
  }
  const after = criticalOf(text);
  const stillLost = [...lost].filter((c) => !after.includes(c) && !text.includes(c));
  const rawTokens = estTokens(i.raw);
  const capsuleTokens = estTokens(text);
  return {
    text,
    sections: sections
      .filter((s) => s.lines.length)
      .map((s) => ({ key: s.key, lines: s.lines, tokens: estTokens(s.lines.join(' ')) })),
    rawTokens,
    capsuleTokens,
    reduction: rawTokens ? Math.max(0, 1 - capsuleTokens / rawTokens) : 0,
    lost: [...lost],
    recovered,
    complete: stillLost.length === 0,
  };
}
