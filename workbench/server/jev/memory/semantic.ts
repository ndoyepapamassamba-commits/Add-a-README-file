// JEV SEMANTIC MEMORY — per-chat facts and cross-chat LESSONS, retrieved by meaning at zero cost (no embedding API):
// BM25 over normalised stems + character-trigram similarity (robust to inflections, typos, FR/EN variants) + a light
// synonym map. Only the few facts relevant to the CURRENT request are injected (≤ 3, ~40 tokens each), so the model
// remembers the chat without re-reading it.

export type MemKind = 'fact' | 'decision' | 'delivery' | 'preference' | 'lesson';
export interface MemFact {
  id: string;
  text: string;
  kind: MemKind;
  at: number;
  /** Task family the fact was learnt on (lessons are only reused on the same family). */
  tag?: string;
  hits?: number;
}

const STOP = new Set(
  'le la les un une des du de d l à au aux et ou en dans sur pour par avec sans ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs qui que quoi dont où est sont été être avoir a ai as ont fait faire plus moins très tout tous toute toutes il elle ils elles je tu nous vous on se ne pas y the a an of to in on for with and or is are be it this that these those from by as at was were'.split(
    ' ',
  ),
);
const SYN: Record<string, string> = {
  tableau: 'table', table: 'table', excel: 'xlsx', xlsx: 'xlsx', classeur: 'xlsx', feuille: 'xlsx',
  rapport: 'report', report: 'report', compte: 'report', mail: 'email', courriel: 'email', email: 'email',
  graphique: 'chart', graphe: 'chart', chart: 'chart', diagramme: 'chart', couleur: 'color', color: 'color', colour: 'color',
  titre: 'title', title: 'title', police: 'font', font: 'font', logo: 'logo', page: 'page', diapo: 'slide', slide: 'slide',
  presentation: 'slide', pptx: 'slide', word: 'docx', docx: 'docx', pdf: 'pdf', client: 'client', clients: 'client',
  montant: 'amount', somme: 'amount', total: 'total', ventes: 'sales', vente: 'sales', sales: 'sales',
  rouge: 'red', red: 'red', bleu: 'blue', blue: 'blue', vert: 'green', green: 'green',
};
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ');
/** Light FR/EN stemming: plural, -ment, -tion(s), -ing, -ed, -er/-ez/-é verb endings. */
const stem = (w: string) =>
  w.length <= 4 ? w : w.replace(/(ements?|ations?|ments?|ings?|ees?|es|er|ez|ed|s|x)$/, '').slice(0, 12) || w;
export function terms(s: string): string[] {
  return norm(s)
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => SYN[w] ?? SYN[w.replace(/[sx]$/, '')] ?? SYN[stem(w)] ?? stem(w));
}
const grams = (s: string) => {
  const t = ` ${norm(s).replace(/\s+/g, ' ').trim()} `;
  const g = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) g.add(t.slice(i, i + 3));
  return g;
};
const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
};

export interface Recall {
  fact: MemFact;
  score: number;
}
/** Top facts for a query: BM25 (k1=1.2, b=0.75) + 0.6 × trigram similarity + small recency boost. */
export function recall(facts: MemFact[], query: string, o: { k?: number; min?: number; tag?: string; now?: number } = {}): Recall[] {
  const pool = o.tag ? facts.filter((f) => !f.tag || f.tag === o.tag) : facts;
  if (!pool.length) return [];
  const q = [...new Set(terms(query))];
  const docs = pool.map((f) => terms(f.text));
  const avg = docs.reduce((a, d) => a + d.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docs.length;
  const qg = grams(query);
  const now = o.now ?? Date.now();
  const out = pool.map((fact, i) => {
    const d = docs[i]!;
    let bm = 0;
    for (const t of q) {
      const tf = d.filter((x) => x === t).length;
      if (!tf) continue;
      const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      bm += (idf * tf * 2.2) / (tf + 1.2 * (1 - 0.75 + (0.75 * d.length) / avg));
    }
    const ageDays = Math.max(0, (now - fact.at) / 86_400_000);
    const score = bm / (bm + 2) + 0.6 * jaccard(qg, grams(fact.text)) + 0.05 * Math.exp(-ageDays / 30);
    return { fact, score };
  });
  return out
    .filter((r) => r.score >= (o.min ?? 0.22))
    .sort((a, b) => b.score - a.score)
    .slice(0, o.k ?? 3);
}

let seq = 0;
const id = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;
/** Deterministic extraction at the end of a turn: decisions / preferences said by the user, and what was delivered. */
export function extractFacts(i: { request: string; delivered: string[]; now?: number }): MemFact[] {
  const at = i.now ?? Date.now();
  const out: MemFact[] = [];
  for (const raw of i.request.split(/(?<=[.!?\n])\s*/)) {
    const s = raw.trim();
    if (s.length < 12 || s.length > 280) continue;
    if (/\b(on garde|on part sur|j['’]ai d[ée]cid[ée]|c['’]est valid[ée]|retiens|garde en t[êe]te|n['’]oublie pas|souviens-toi|note que)\b/i.test(s))
      out.push({ id: id(), text: s, kind: 'decision', at });
    else if (/\b(je pr[ée]f[èe]re|je veux (?:toujours|que)|toujours|jamais|always|never)\b/i.test(s)) out.push({ id: id(), text: s, kind: 'preference', at });
  }
  if (i.delivered.length)
    out.push({ id: id(), text: `Livré : ${i.delivered.slice(0, 6).join(', ')} — pour « ${i.request.replace(/\s+/g, ' ').slice(0, 160)} »`, kind: 'delivery', at });
  return out;
}

/** A LESSON learnt from an alteration: what the user had to ask AFTER a delivery is applied up-front next time. */
export function lessonFrom(i: { alteration: string; originalRequest: string; tag: string; now?: number }): MemFact | null {
  const a = i.alteration.replace(/\s+/g, ' ').trim();
  if (a.length < 6 || a.length > 240) return null;
  // Only reusable corrections (style, format, content rules), not one-off data edits (« remplace 1250 par 1300 »).
  if (/\b\d{3,}\b/.test(a) && !/\b(px|pt|%|colonnes?|lignes?)\b/i.test(a)) return null;
  return {
    id: id(),
    kind: 'lesson',
    tag: i.tag,
    at: i.now ?? Date.now(),
    text: `Sur une demande « ${i.originalRequest.replace(/\s+/g, ' ').slice(0, 90)} », l'utilisateur a ensuite demandé : « ${a} ». Appliquer d'emblée si pertinent.`,
  };
}

/**
 * EXPERIENCE FIREWALL: what comes from OUTSIDE the chat (lessons, vault, similar missions) is a METHOD, never data.
 * Figures are masked (amounts, rates, counts, dates…) so another chat's numbers can never be reused as facts.
 */
export function methodOnly(text: string): string {
  return text
    .replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, '#date')
    .replace(/[-+]?\d[\d\s\u00a0\u202f.,]*\d\s*%|[-+]?\d+(?:[.,]\d+)?\s*%/g, '#%')
    // (not inside an identifier such as a model name « gpt-5.3 » or « IFRS 9 »)
    .replace(/(?<![\w-])[-+]?\d{1,3}(?:[\s\u00a0\u202f.,]\d{3})+(?:[.,]\d+)?|(?<![\w-])[-+]?\d+[.,]\d+|\b\d{3,}\b/g, '#');
}
export const EXPERIENCE_RULE =
  'EXPERIENCE from other chats = methods and quality bar only, to go faster. It is NEVER a source of facts, figures, names or files: every fact of the answer comes from THIS chat (its messages, attachments, files, tool results).';

export function memoryBlock(chat: Recall[], lessons: Recall[]): string {
  const parts: string[] = [];
  if (chat.length) parts.push(`<CHAT_MEMORY>\nRelevant facts from THIS chat (the source of truth):\n${chat.map((r) => `- ${r.fact.text}`).join('\n')}\n</CHAT_MEMORY>`);
  if (lessons.length) parts.push(`<LESSONS>\nLearnt from the user's past corrections (apply when relevant, the request wins). ${EXPERIENCE_RULE}\n${lessons.map((r) => `- ${methodOnly(r.fact.text)}`).join('\n')}\n</LESSONS>`);
  return parts.join('\n');
}

/** Dedup + cap (a chat keeps its 200 most recent facts; lessons 300). */
export function mergeFacts(old: MemFact[], add: MemFact[], cap: number): MemFact[] {
  const seen = new Set(old.map((f) => norm(f.text).slice(0, 120)));
  const fresh = add.filter((f) => !seen.has(norm(f.text).slice(0, 120)));
  return [...old, ...fresh].slice(-cap);
}
