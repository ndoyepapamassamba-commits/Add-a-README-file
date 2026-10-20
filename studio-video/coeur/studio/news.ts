/**
 * ACTUALITÉ GRATUITE, SANS CLÉ — sources lisibles directement depuis le navigateur (en-tête CORS ouvert) :
 *  1. GDELT DOC 2.0 : articles de presse en français publiés en Côte d'Ivoire ces 2 derniers jours ;
 *  2. Wikipédia FR « Portail:Actualité » : les brèves datées de la semaine (monde).
 * Les clés Tavily / Serper / Brave de l'utilisateur restent un complément facultatif. Rien n'est inventé : si aucune
 * source ne répond, la liste est vide et l'app le dit.
 */
export interface Headline {
  title: string;
  source: string;
  date?: string;
}

/** GDELT: French-language articles from Ivorian outlets (FIPS « IV »), most recent first. One call / 5 s max. */
export function gdeltUrl(extra = '', hours = 48, max = 25): string {
  const q = `sourcecountry:IV sourcelang:french${extra ? ` ${extra}` : ''}`;
  return `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&format=json&sort=datedesc&maxrecords=${max}&timespan=${Math.round(hours)}h`;
}
export function parseGdelt(j: unknown): Headline[] {
  const arts = (j as { articles?: { title?: string; domain?: string; seendate?: string }[] })?.articles ?? [];
  return arts
    .filter((a) => typeof a.title === 'string' && a.title.trim().length > 15)
    .map((a) => ({ title: a.title!.trim(), source: a.domain ?? 'GDELT', date: a.seendate ? `${a.seendate.slice(0, 4)}-${a.seendate.slice(4, 6)}-${a.seendate.slice(6, 8)}` : undefined }));
}

export const WIKI_NEWS_URL = 'https://fr.wikipedia.org/w/api.php?action=parse&page=Portail:Actualit%C3%A9&prop=text&format=json&origin=*&formatversion=2';
const ENT: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&#160;': ' ' };
const strip = (h: string) =>
  h
    .replace(/<[^>]+>/g, '')
    .replace(/&[#a-z0-9]+;/gi, (e) => ENT[e] ?? (e.startsWith('&#') ? String.fromCharCode(Number(e.slice(2, -1))) : ' '))
    .replace(/\s+/g, ' ')
    .trim();
/** Only the DATED news items (« 7 octobre : … »), never the « on this day » history (« 1428 : … »). */
export function parseWikiNews(j: unknown): Headline[] {
  const html = (j as { parse?: { text?: string | { '*': string } } })?.parse?.text;
  const t = typeof html === 'string' ? html : (html?.['*'] ?? '');
  const out: Headline[] = [];
  for (const m of t.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const s = strip(m[1]!);
    const d = /^(\d{1,2}(?:er)? [a-zéû]+)(?: \d{4})? ?[:–-] ?(.{20,})$/i.exec(s);
    if (d) out.push({ title: d[2]!.slice(0, 220), source: 'Wikipédia', date: d[1] });
  }
  return out;
}

/** Tragedies are never a sketch subject: dropped before the writer sees them (the prompt says it again). */
const TRAGIC = /\b(mort|morts|décès|décéd|tué|tués|meurtre|assassin|attentat|viol|noyé|accident|crash|incendie|victime|deuil|funéraill|guerre|massacre|otage|enlèvement|suicide|cancer|épidémie|choléra|inondation|séisme)/i;
export function laughable(h: Headline[]): Headline[] {
  const seen = new Set<string>();
  return h.filter((x) => {
    const k = x.title.toLowerCase().replace(/[^a-zà-ÿ0-9]+/g, ' ').trim().slice(0, 60);
    if (TRAGIC.test(x.title) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Refresh rule of the automatic prompter: at most every `hours` (default 6 h). */
export const isStale = (lastAt: number | undefined, now: number, hours = 6) => lastAt === undefined || now - lastAt > hours * 3600_000;

/** The library ideas « of the day »: a deterministic rotation (same day → same picks, next day → others). */
export function dailyPicks<T>(items: T[], date: string, n: number): T[] {
  if (!items.length) return [];
  let seed = [...date].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const pool = [...items];
  const out: T[] = [];
  while (out.length < Math.min(n, items.length)) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    out.push(pool.splice(seed % pool.length, 1)[0]!);
  }
  return out;
}
