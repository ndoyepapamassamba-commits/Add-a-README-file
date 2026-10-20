// OUTILS GRATUITS SANS CLÉ POUR LES AGENTS (v63 — « propose moi des MCP et API gratuits », « tout en gratuit sans que
// je ne mette de clé »). Partie pure, testée en Node : la forme des requêtes et la lecture des réponses de
//   • la lecture de pages entières : Exa `web_fetch_exa`, Parallel `web_fetch` (MCP publics anonymes), Jina Reader ;
//   • les prépublications SSRN / arXiv : recherche Exa restreinte au site (Jina `search_ssrn` exige une clé : écarté) ;
//   • les taux de référence officiels de la BCE (Frankfurter), avec le franc CFA par la parité fixe ;
//   • la fiche d'une entité (banque, groupe, pays…) dans Wikidata (SPARQL, CORS ouvert).
// Tout a été mesuré en direct le 15/10/2026 depuis l'origine de l'app (Origin: null) ; voir le journal de veille.
/** Clip to n characters: titles on one line, bodies keep their paragraphs. */
const clip = (v: unknown, n: number) => {
  const s = String(v ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const one = n <= 300 ? s.replace(/\s+/g, ' ') : s;
  return one.length > n ? `${one.slice(0, n).trimEnd()}…` : one;
};

export interface ReadPage {
  url: string;
  title: string;
  /** Text of the page (Markdown), clipped. */
  text: string;
  published?: string;
}

const isUrl = (u: string) => /^https?:\/\/[^\s]+$/i.test(u);
/** The URLs worth reading: http(s) only, no duplicates, at most `max`. */
export function readableUrls(urls: unknown, max = 5): string[] {
  const list = (Array.isArray(urls) ? urls : [urls]).map((u) => String(u ?? '').trim()).filter(isUrl);
  return [...new Set(list)].slice(0, max);
}

const textOf = (rpc: unknown): string | null => {
  const r = rpc as { result?: { isError?: boolean; content?: { text?: string }[] } };
  if (!r?.result || r.result.isError) return null;
  return (r.result.content ?? []).map((c) => c.text ?? '').join('\n');
};

/** Exa `web_fetch_exa`: one block per page « # Title\nURL: …\nPublished: …\n\n<markdown> ». */
export function parseExaFetch(rpc: unknown, maxChars = 6000): ReadPage[] {
  const text = textOf(rpc);
  if (!text) return [];
  const out: ReadPage[] = [];
  for (const block of text.split(/\n(?=# [^\n]+\nURL: )/)) {
    const m = /^# ([^\n]+)\nURL: (\S+)\n(?:Published: ([^\n]+)\n)?/.exec(block.trimStart());
    if (!m) continue;
    const body = block.trimStart().slice(m[0].length).trim();
    if (!body) continue;
    out.push({ title: clip(m[1]!.trim(), 200), url: m[2]!, text: clip(body, maxChars), published: m[3] && m[3] !== 'N/A' ? m[3].slice(0, 10) : undefined });
  }
  return out;
}

/** Parallel `web_fetch`: JSON { results: [{ url, title, publish_date, excerpts[], full_content }] }. */
export function parseParallelFetch(rpc: unknown, maxChars = 6000): ReadPage[] {
  const text = textOf(rpc);
  if (!text) return [];
  let j: { results?: { url?: string; title?: string; publish_date?: string | null; excerpts?: string[] | null; full_content?: string | null }[] };
  try {
    j = JSON.parse(text);
  } catch {
    return [];
  }
  return (j.results ?? [])
    .filter((r) => r.url && (r.full_content || r.excerpts?.length))
    .map((r) => ({
      url: r.url!,
      title: clip(r.title || r.url!, 200),
      text: clip((r.full_content || (r.excerpts ?? []).join('\n\n')).trim(), maxChars),
      published: r.publish_date ? r.publish_date.slice(0, 10) : undefined,
    }));
}

/** Jina Reader (`https://r.jina.ai/<url>`): « Title: …\nURL Source: …\nPublished Time: …\nMarkdown Content:\n… ». */
export function parseJinaReader(raw: string, url: string, maxChars = 6000): ReadPage | null {
  const t = raw.trim();
  if (!t || /^\s*\{"(code|error)"/.test(t)) return null;
  const title = /^Title: (.*)$/m.exec(t)?.[1]?.trim() || url;
  const published = /^Published Time: (.*)$/m.exec(t)?.[1]?.trim();
  const body = (t.split(/^Markdown Content:\s*$/m)[1] ?? t).trim();
  if (!body) return null;
  return { url, title: clip(title, 200), text: clip(body, maxChars), published: published ? published.slice(0, 10) : undefined };
}
export const jinaReaderUrl = (url: string) => `https://r.jina.ai/${url}`;

/** What the model reads: one section per page, with its source and date. */
export function pagesText(pages: ReadPage[], via: string): string {
  return pages
    .map((p) => `## ${p.title}\nSource : ${p.url}${p.published ? ` · publié le ${p.published}` : ''} · lu par ${via}\n\n${p.text}`)
    .join('\n\n---\n\n');
}

// ── prépublications (working papers) ─────────────────────────────────────────────────────────────────────────────────
export type PreprintSource = 'ssrn' | 'arxiv' | 'both';
const SITE: Record<Exclude<PreprintSource, 'both'>, string> = { ssrn: 'papers.ssrn.com', arxiv: 'arxiv.org' };
/** The site-restricted queries for the free engines (Exa honours « site: »; Parallel takes it in its keyword queries). */
export function preprintQueries(query: string, source: PreprintSource = 'both'): string[] {
  const q = query.replace(/\bsite:\S+/gi, '').replace(/\s+/g, ' ').trim();
  const sites = source === 'both' ? (['ssrn', 'arxiv'] as const) : [source];
  return sites.map((s) => `site:${SITE[s]} ${q}`);
}
/** Keeps only the hits that are really on SSRN / arXiv (an engine may ignore « site: »), with a clean abstract link. */
export function keepPreprints<T extends { url: string }>(hits: T[], source: PreprintSource = 'both'): T[] {
  const ok = source === 'both' ? /(^|\.)(ssrn\.com|arxiv\.org)$/i : source === 'ssrn' ? /(^|\.)ssrn\.com$/i : /(^|\.)arxiv\.org$/i;
  const seen = new Set<string>();
  const out: T[] = [];
  for (const h of hits) {
    let host: string;
    try {
      host = new URL(h.url).hostname;
    } catch {
      continue;
    }
    if (!ok.test(host)) continue;
    // ar5iv / html / pdf mirrors of one arXiv paper, abstract_id of one SSRN paper: one entry each.
    const id = /arxiv\.org\/(?:abs|html|pdf)\/(\d{4}\.\d{4,5})/i.exec(h.url)?.[1] ?? /abstract_?id=(\d+)/i.exec(h.url)?.[1] ?? /ssrn\.com\/abstract=(\d+)/i.exec(h.url)?.[1] ?? h.url;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(h);
  }
  return out;
}

// ── taux de référence de la BCE (Frankfurter) + franc CFA ─────────────────────────────────────────────────────────────
/** Parité fixe et légale : 1 EUR = 655,957 XOF = 655,957 XAF (accords de coopération monétaire). */
export const CFA_PER_EUR = 655.957;
export function frankfurterUrl(base: string, opts: { date?: string; symbols?: string[] } = {}): string {
  const b = base.toUpperCase();
  // The ECB does not publish the CFA franc: the request goes in EUR and the CFA side comes from the fixed parity.
  const apiBase = b === 'XOF' || b === 'XAF' ? 'EUR' : b;
  const syms = (opts.symbols ?? []).map((s) => s.toUpperCase()).filter((s) => s !== 'XOF' && s !== 'XAF' && s !== apiBase);
  const path = opts.date && /^\d{4}-\d{2}-\d{2}(\.\.(\d{4}-\d{2}-\d{2})?)?$/.test(opts.date) ? opts.date : 'latest';
  return `https://api.frankfurter.dev/v1/${path}?base=${apiBase}${syms.length ? `&symbols=${syms.join(',')}` : ''}`;
}
export interface EcbRates {
  base: string;
  date: string;
  rates: Record<string, number>;
  derived: string[];
}
/** The ECB answer re-expressed for the asked base, with XOF / XAF from the fixed parity (never invented). */
export function ecbRates(json: unknown, base: string, symbols: string[] = []): EcbRates | null {
  const j = json as { base?: string; date?: string; rates?: Record<string, number | Record<string, number>> };
  if (!j?.rates || !j.base) return null;
  const want = base.toUpperCase();
  // Time series (« 2026-01-01..2026-01-05 »): the last day only, the date says which.
  const entries = Object.entries(j.rates);
  const series = entries.length && typeof entries[0]![1] === 'object';
  const day = series ? entries.sort((a, b) => a[0].localeCompare(b[0])).at(-1)! : null;
  const raw = (series ? day![1] : j.rates) as Record<string, number>;
  const inEur: Record<string, number> = j.base === 'EUR' ? { ...raw, EUR: 1 } : {};
  if (j.base !== 'EUR') {
    // Base other than EUR and other than CFA: the answer is already in that base.
    const out: Record<string, number> = { ...raw };
    const eur = raw.EUR;
    const derived: string[] = [];
    if (eur) {
      for (const c of ['XOF', 'XAF']) {
        out[c] = round(eur * CFA_PER_EUR);
        derived.push(c);
      }
    }
    const keep = symbols.length ? Object.fromEntries(Object.entries(out).filter(([k]) => symbols.map((s) => s.toUpperCase()).includes(k))) : out;
    return { base: j.base, date: (series ? day![0] : j.date) ?? '', rates: keep, derived: derived.filter((d) => d in keep) };
  }
  inEur.XOF = CFA_PER_EUR;
  inEur.XAF = CFA_PER_EUR;
  const per = inEur[want];
  if (!per) return null;
  const rates: Record<string, number> = {};
  for (const [k, v] of Object.entries(inEur)) if (k !== want) rates[k] = round(v / per);
  const keep = symbols.length ? Object.fromEntries(Object.entries(rates).filter(([k]) => symbols.map((s) => s.toUpperCase()).includes(k))) : rates;
  const derived = want === 'XOF' || want === 'XAF' ? Object.keys(keep) : ['XOF', 'XAF'].filter((c) => c in keep);
  return { base: want, date: (series ? day![0] : j.date) ?? '', rates: keep, derived };
}
const round = (x: number) => (Math.abs(x) >= 100 ? Math.round(x * 1000) / 1000 : Math.round(x * 1e6) / 1e6);
export function ecbText(r: EcbRates): string {
  const lines = Object.entries(r.rates)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}: ${v}${r.derived.includes(k) ? ' (parité fixe 1 EUR = 655,957 F CFA)' : ''}`);
  return `Taux de référence BCE pour 1 ${r.base} au ${r.date} (source : Banque centrale européenne via Frankfurter${r.derived.length ? ' ; franc CFA calculé par la parité fixe, la BCE ne le publie pas' : ''}) :\n${lines.join('\n')}`;
}

// ── fiche d'entité Wikidata ───────────────────────────────────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
/** One SPARQL query: entity search (MediaWiki API service) + the facts a credit analyst needs. */
export function wikidataQuery(name: string, lang = 'fr', max = 2): string {
  const l = /^[a-z]{2}$/.test(lang) ? lang : 'fr';
  return `SELECT ?item ?itemLabel ?itemDescription ?countryLabel ?hqLabel ?parentLabel ?industryLabel ?inception ?website ?employees ?isin ?exchangeLabel ?legalLabel ?num WHERE {
  SERVICE wikibase:mwapi { bd:serviceParam wikibase:endpoint "www.wikidata.org"; wikibase:api "EntitySearch"; mwapi:search "${esc(name)}"; mwapi:language "${l}". ?item wikibase:apiOutputItem mwapi:item. ?num wikibase:apiOrdinal true. }
  OPTIONAL { ?item wdt:P17 ?country. } OPTIONAL { ?item wdt:P159 ?hq. } OPTIONAL { ?item wdt:P749 ?parent. } OPTIONAL { ?item wdt:P452 ?industry. }
  OPTIONAL { ?item wdt:P571 ?inception. } OPTIONAL { ?item wdt:P856 ?website. } OPTIONAL { ?item wdt:P1128 ?employees. } OPTIONAL { ?item wdt:P946 ?isin. }
  OPTIONAL { ?item wdt:P414 ?exchange. } OPTIONAL { ?item wdt:P1454 ?legal. }
  FILTER(?num < ${Math.max(1, Math.min(5, max))})
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${l},en". }
} ORDER BY ?num LIMIT 60`;
}
export const wikidataUrl = (query: string) => `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
export interface Entity {
  id: string;
  label: string;
  description: string;
  facts: Record<string, string[]>;
}
const FACT: Record<string, string> = {
  countryLabel: 'Pays',
  hqLabel: 'Siège',
  parentLabel: 'Maison mère',
  industryLabel: 'Secteur',
  legalLabel: 'Forme juridique',
  inception: 'Création',
  website: 'Site officiel',
  employees: 'Effectif',
  isin: 'ISIN',
  exchangeLabel: 'Cotation',
};
/** SPARQL rows (one per combination of values) → one entity per item, each fact listed once. */
export function parseWikidata(json: unknown): Entity[] {
  const rows = (json as { results?: { bindings?: Record<string, { value: string }>[] } })?.results?.bindings ?? [];
  const byId = new Map<string, Entity & { num: number }>();
  for (const b of rows) {
    const id = b.item?.value?.split('/').pop();
    if (!id) continue;
    const e = byId.get(id) ?? { id, label: b.itemLabel?.value ?? id, description: b.itemDescription?.value ?? '', facts: {}, num: Number(b.num?.value ?? 0) };
    for (const [k, name] of Object.entries(FACT)) {
      let v = b[k]?.value;
      if (!v || /^Q\d+$/.test(v) || /^https?:\/\/www\.wikidata\.org\/\.well-known\/genid/.test(v)) continue;
      if (k === 'inception') v = v.slice(0, 4);
      const list = (e.facts[name] ??= []);
      if (!list.includes(v)) list.push(v);
    }
    byId.set(id, e);
  }
  return [...byId.values()].sort((a, b) => a.num - b.num).map(({ num: _n, ...e }) => e);
}
export function entitiesText(list: Entity[], name: string): string {
  if (!list.length) return `Aucune entité Wikidata trouvée pour « ${name} ».`;
  return list
    .map(
      (e) =>
        `## ${e.label}${e.description ? ` — ${e.description}` : ''}\nhttps://www.wikidata.org/wiki/${e.id}\n${Object.entries(e.facts)
          .map(([k, v]) => `- ${k} : ${v.slice(0, 4).join(', ')}`)
          .join('\n')}`,
    )
    .join('\n\n')
    .concat('\n\n(Source : Wikidata, base libre CC0 — données déclaratives, à recouper avec les états financiers pour une décision de crédit.)');
}
