/**
 * LEARNED KNOWLEDGE — what the app found on the Internet or read in a procedure becomes a reusable skill:
 *  - every web search result is kept (query, synthesis, sources), so the same question never costs a search again;
 *  - the model can file a distilled rule / procedure (a regulation grid, a code fix recipe) under a topic;
 *  - before any search, and at the start of every turn, the closest entries are recalled.
 * Time-sensitive questions (news, prices, today, exchange rates) expire quickly; regulations, procedures and
 * code recipes are kept for months. Pure functions; the app persists the list.
 */
export type KnowledgeDomain = 'Réglementation bancaire' | 'Finance & comptabilité' | 'Code & outils' | 'Procédure' | 'Création & studio' | 'Actualité' | 'Général';
export interface KnowledgeEntry {
  id: string;
  /** The question as asked (search query) or the rule's title. */
  query: string;
  domain: KnowledgeDomain;
  /** The synthesis / rule text (kept short enough to be injected). */
  text: string;
  sources: { url: string; title?: string }[];
  origin: 'search' | 'learned';
  createdAt: number;
  /** Not reused after this date (ms). */
  expiresAt: number;
  hits: number;
  lastUsed?: number;
}

const DAY = 86_400_000;
const STOP = new Set('a au aux avec ce ces dans de des du en et la le les leur leurs l d un une ou par pour sur que qui quoi quel quelle quels quelles est sont the of and to in for on with is are what how which by from at as an or vs plus moins comment'.split(' '));
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
export const tokens = (s: string) => [...new Set(normalize(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w)))];
/** Similarity of two questions: shared meaningful words (numbers and acronyms count double). */
export function similarity(a: string, b: string): number {
  const A = tokens(a);
  const B = new Set(tokens(b));
  if (!A.length || !B.size) return 0;
  const w = (t: string) => (/\d/.test(t) || t.length <= 5 ? 2 : 1);
  let inter = 0;
  let total = 0;
  for (const t of A) {
    total += w(t);
    if (B.has(t)) inter += w(t);
  }
  for (const t of B) if (!A.includes(t)) total += w(t);
  return total ? inter / total : 0;
}

const FRESH = /actualit|news|aujourd|today|hier|yesterday|cette semaine|this week|dernier|latest|cours (du|de l)|taux de change|exchange rate|prix|price|m[ée]t[ée]o|weather|bourse|stock|score|r[ée]sultat du match/i;
export function domainOf(q: string): KnowledgeDomain {
  if (FRESH.test(q)) return 'Actualité';
  if (/bceao|umoa|uemoa|commission bancaire|b[âa]le|basel|prudenti|cr[ée]ances? (douteuses|en souffrance)|provision|ifrs ?9|ecl|npl|kyc|lcb|blanchiment|cobac|banque centrale|instruction n|circulaire|r[ée]glement(ation)?/i.test(q)) return 'Réglementation bancaire';
  if (/ifrs|ohada|syscohada|comptab|bilan|audit|impot|fiscal|tva|is au|taux d.imposition|finance/i.test(q)) return 'Finance & comptabilité';
  if (/python|javascript|typescript|node|openpyxl|pandas|sql|regex|api|erreur|error|exception|bug|code|librairie|library|npm|pip|excel vba|formule excel/i.test(q)) return 'Code & outils';
  if (/proc[ée]dure|process|[ée]tapes?|checklist|guide|comment faire|how to|mode op[ée]ratoire|politique/i.test(q)) return 'Procédure';
  if (/anim|vid[ée]o|sc[èe]ne|dessin|cartoon|afrikatoon|prompt|image|personnage|lip.?sync|humou?r|blague|sketch/i.test(q)) return 'Création & studio';
  return 'Général';
}
const TTL: Record<KnowledgeDomain, number> = {
  'Réglementation bancaire': 365 * DAY,
  'Finance & comptabilité': 180 * DAY,
  'Code & outils': 180 * DAY,
  Procédure: 365 * DAY,
  'Création & studio': 180 * DAY,
  Actualité: 1 * DAY,
  Général: 60 * DAY,
};

/** The best stored answer to a search query (null when nothing close enough is still valid). */
export function recall(entries: readonly KnowledgeEntry[], query: string, now = Date.now(), min = 0.72): { entry: KnowledgeEntry; score: number } | null {
  if (domainOf(query) === 'Actualité') min = Math.max(min, 0.9);
  let best: { entry: KnowledgeEntry; score: number } | null = null;
  for (const e of entries) {
    if (e.expiresAt < now) continue;
    const s = normalize(e.query) === normalize(query) ? 1 : similarity(query, e.query);
    if (s >= min && (!best || s > best.score)) best = { entry: e, score: s };
  }
  return best;
}
/** Entries relevant to a whole request (lower bar, several of them), for the turn's context. */
export function related(entries: readonly KnowledgeEntry[], text: string, k = 4, now = Date.now()): KnowledgeEntry[] {
  const words = new Set(tokens(text));
  return entries
    .filter((e) => e.expiresAt >= now)
    .map((e) => {
      const t = tokens(`${e.query} ${e.domain}`);
      const shared = t.filter((w) => words.has(w)).length;
      return { e, s: t.length ? shared / Math.min(t.length, 6) : 0, shared };
    })
    .filter((x) => x.shared >= 2 && x.s >= 0.34)
    .sort((a, b) => b.s - a.s || (b.e.hits ?? 0) - (a.e.hits ?? 0))
    .slice(0, k)
    .map((x) => x.e);
}
export function remember(entries: readonly KnowledgeEntry[], e: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'expiresAt' | 'hits' | 'domain'> & { domain?: KnowledgeDomain; id?: string }, now = Date.now(), cap = 600): KnowledgeEntry[] {
  const domain = e.domain ?? domainOf(e.query);
  const text = e.text.length > 6000 ? `${e.text.slice(0, 5990)}…` : e.text;
  const entry: KnowledgeEntry = { id: e.id ?? `k${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, query: e.query.slice(0, 300), domain, text, sources: e.sources.slice(0, 12), origin: e.origin, createdAt: now, expiresAt: now + TTL[domain], hits: 0 };
  // Same question (or near-identical) → replaced by the fresher answer.
  const rest = entries.filter((x) => !(x.origin === entry.origin && (normalize(x.query) === normalize(entry.query) || similarity(x.query, entry.query) >= 0.9)));
  return [entry, ...rest].filter((x) => x.expiresAt >= now).slice(0, cap);
}
export const touch = (entries: readonly KnowledgeEntry[], id: string, now = Date.now()): KnowledgeEntry[] => entries.map((e) => (e.id === id ? { ...e, hits: e.hits + 1, lastUsed: now } : e));
/** Context block for the model (learned skills first, then past searches). */
export function knowledgeBlock(list: readonly KnowledgeEntry[]): string {
  if (!list.length) return '';
  const body = list
    .map((e) => `### ${e.origin === 'learned' ? 'Compétence apprise' : 'Recherche déjà faite'} — ${e.domain} — « ${e.query} » (${new Date(e.createdAt).toLocaleDateString('fr-FR')})\n${e.text.slice(0, 1500)}${e.sources.length ? `\nSources : ${e.sources.slice(0, 4).map((s) => s.url).join(' ; ')}` : ''}`)
    .join('\n\n');
  return `<LEARNED_KNOWLEDGE>\nThe app already learned this (from earlier searches and documents). Use it directly: do NOT search the web again for what it covers; search only for what is missing or explicitly current (news, today's rates).\n\n${body}\n</LEARNED_KNOWLEDGE>`;
}
/** Sources out of a search answer (markdown links or bare URLs). */
export function sourcesOf(text: string): { url: string; title?: string }[] {
  const out = new Map<string, string | undefined>();
  for (const m of text.matchAll(/\[([^\]]{1,200})\]\((https?:\/\/[^)\s]+)\)/g)) out.set(m[2]!, m[1]);
  for (const m of text.matchAll(/(?<![(\w])(https?:\/\/[^\s)<>\]]+)/g)) if (!out.has(m[1]!)) out.set(m[1]!, undefined);
  return [...out].slice(0, 12).map(([url, title]) => ({ url, title }));
}
