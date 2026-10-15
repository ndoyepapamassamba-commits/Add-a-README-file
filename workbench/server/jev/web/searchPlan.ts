// LA RECHERCHE AFFINÉE SELON LE CAS DU CHAT (pur, sans modèle) — v62 : « affine l'information de recherche pour ces
// moteurs selon le cas dans le chat ». Une demande n'est pas cherchée de la même façon selon ce qu'elle vise :
//   • l'INTENTION (actualité, réglementation, étude, entreprise, données chiffrées, design, mode d'emploi, général) ;
//   • la ZONE et la LANGUE tirées du chat (XOF / FCFA / BCEAO / Dakar… → UMOA, en français) ;
//   • pour chaque moteur la forme qu'il comprend le mieux : mots-clés courts (Tavily, Firecrawl), objectif en phrase +
//     2-3 requêtes de 3 à 6 mots (Parallel), description riche de la page idéale avec catégorie (Exa) ;
//   • l'ORDRE des moteurs (le plus fort pour ce cas en premier) et les sources officielles à faire remonter.
import type { BraveHit } from './brave';
import { ACADEMIC, KEYLESS_ENGINES, type KeylessEngine } from './search';

export type SearchIntent = 'actualite' | 'reglementation' | 'etude' | 'entreprise' | 'donnees' | 'design' | 'methode' | 'general';
export interface SearchPlan {
  intent: SearchIntent;
  /** Short keywords (Tavily, Firecrawl, Wikipédia, Crossref). */
  keywords: string;
  /** One sentence: what the ideal page says (Parallel's objective, Exa's query). */
  objective: string;
  /** Parallel's keyword queries (3-6 words each). */
  queries: string[];
  lang: 'fr' | 'en';
  region: 'UMOA' | 'CEMAC' | 'Europe' | null;
  /** Engines best suited to this case, strongest first (the others follow, in rotation). */
  prefer: KeylessEngine[];
  firecrawlSources: ('web' | 'news')[];
  exaCategory: 'news' | 'research paper' | 'company' | 'pdf' | null;
  /** Official sources raised in the ranking. */
  domains: string[];
}

const f = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const has = (t: string, rx: RegExp) => rx.test(f(t));
const NEWS = /\b(actualite|actu|recent|recemment|aujourd'?hui|hier|cette semaine|ce mois|derniere?s? (nouvelles|informations|annonces)|news|breaking|vient d|annonce|communique)\b/;
const REG = /\b(reglement\w*|instruction|circulaire|norme|prudentiel\w*|bale|basel|ifrs|ias \d|loi|decret|arrete|acte uniforme|ohada|bceao|cobac|beac|commission bancaire|directive|conformite|kyc|lcb|ft|division des risques|grands risques|ratio de solvabilite|fonds propres|creances? (douteuses?|en souffrance|litigieuses?)|declassement|seuils? (reglementaires?|prudentiels?))\b/;
const COMPANY = /\b(sarl|sa|sas|sasu|gie|societe|entreprise|groupe|holding|filiale|company|inc|ltd|plc|actionnaires?|dirigeants?|profil de la societe)\b/;
const DATA = /\b(statistiques?|taux|pib|inflation|croissance|chiffres?|donnees|series?|indicateurs?|population|budget|dette|encours du secteur|evolution)\b/;
const DESIGN = /\b(design|dashboard|tableau de bord|maquette|ui|ux|template|modele de (diapo|rapport|presentation)|charte graphique|palette|inspiration)\b/;
const HOWTO = /\b(comment|tutoriel|tuto|how to|etapes|procedure|methode|guide pratique|formule excel|vba|python)\b/;
const FR = /\b(le|la|les|des|du|une?|est|sont|dans|pour|avec|sur|quels?|quelles?|comment)\b/;
const UMOA = /\b(xof|fcfa|f cfa|bceao|umoa|uemoa|senegal|dakar|abidjan|cote d'?ivoire|mali|burkina|niger|togo|benin|guinee-bissau|ecobank)\b/;
const CEMAC = /\b(xaf|cemac|beac|cobac|cameroun|gabon|congo|tchad|centrafrique|guinee equatoriale)\b/;
const EUROPE = /\b(eur|euro|bce|ecb|eba|abe|union europeenne|france|acpr)\b/;

const OFFICIAL: Record<string, string[]> = {
  UMOA: ['bceao.int', 'umoatitres.org', 'uemoa.int', 'ohada.org', 'ohada.com'],
  CEMAC: ['beac.int', 'sgcobac.org', 'cemac.int', 'ohada.org'],
  Europe: ['eba.europa.eu', 'ecb.europa.eu', 'bankingsupervision.europa.eu', 'acpr.banque-france.fr', 'eur-lex.europa.eu'],
  any: ['bis.org', 'ifrs.org', 'imf.org', 'worldbank.org', 'data.worldbank.org', 'oecd.org'],
};

/** Delivery words removed: « donne-moi un fichier excel ultra design analysant… » → what is actually looked for. */
export function cleanSubject(text: string): string {
  return text
    .replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, ' ')
    .replace(/\S+\.(xlsx|xlsb|xls|csv|pdf|docx|pptx)\b/gi, ' ')
    .replace(/\b(donne[sz]?|fais|cr[ée]e|g[ée]n[èe]re|produis|pr[ée]pare|cherche|recherche|trouve)[- ]?(moi|nous)?\b/gi, ' ')
    .replace(/\b(un|une|le|la|les|des|du|de|d['’]|dans|stp|svp|merci|s'il te pla[iî]t|fichier|attach[ée]e?s?|excel|word|powerpoint|pptx|docx|xlsx|pdf|ultra|premium|classeur|rapport|livrable)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The search plan of a query, refined by the chat (the user's request and what the session is about). */
export function searchPlan(query: string, chat = ''): SearchPlan {
  const q = cleanSubject(query) || query.trim();
  const all = `${q} ${chat}`;
  // The intention is read on the sentence as typed (« division des risques » loses its « des » once cleaned).
  const raw = query;
  const intent: SearchIntent = has(raw, NEWS)
    ? 'actualite'
    : has(raw, REG)
      ? 'reglementation'
      : ACADEMIC.test(raw)
        ? 'etude'
        : has(raw, DESIGN) && !/\b(fichier|excel|word|powerpoint|classeur)\b/i.test(raw)
          ? 'design'
          : has(raw, HOWTO)
            ? 'methode'
            : has(raw, DATA)
              ? 'donnees'
              : has(raw, COMPANY)
                ? 'entreprise'
                : 'general';
  const region = has(all, UMOA) ? 'UMOA' : has(all, CEMAC) ? 'CEMAC' : has(all, EUROPE) ? 'Europe' : null;
  const lang: 'fr' | 'en' = intent === 'design' || intent === 'methode' ? (has(raw, FR) ? 'fr' : 'en') : has(all, FR) || region === 'UMOA' || region === 'CEMAC' ? 'fr' : 'en';
  // The zone is added to the keywords when the subject is local and the query does not say it already.
  const zoneWord = region === 'UMOA' && !has(q, UMOA) ? (intent === 'reglementation' ? 'BCEAO UMOA' : 'UEMOA') : region === 'CEMAC' && !has(q, CEMAC) ? 'CEMAC' : '';
  const year = new Date().getFullYear();
  const keywords = [q, ['reglementation', 'donnees', 'actualite', 'general', 'entreprise'].includes(intent) ? zoneWord : '', intent === 'actualite' && !/\b20\d\d\b/.test(q) ? String(year) : '']
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 300);
  const objectiveBy: Record<SearchIntent, string> = {
    actualite: `Articles de presse récents (${year}) sur : ${keywords}`,
    reglementation: `Texte officiel ou analyse fiable de la réglementation sur : ${keywords}${region ? ` (zone ${region})` : ''} — idéalement le texte source (PDF du régulateur)`,
    etude: `Étude, article scientifique ou rapport de recherche sur : ${keywords}`,
    entreprise: `Page de présentation fiable de l’entreprise (activité, dirigeants, chiffres) : ${keywords}`,
    donnees: `Source statistique officielle avec chiffres datés sur : ${keywords}`,
    design: `Exemple de design primé ou très soigné (dashboard, rapport ou présentation) : ${keywords}`,
    methode: `Guide pratique pas à pas, avec exemple, sur : ${keywords}`,
    general: keywords,
  };
  const words = keywords.split(/\s+/).filter((w) => w.length > 1);
  const queries = [...new Set([words.slice(0, 6).join(' '), words.length > 6 ? words.slice(-6).join(' ') : '', zoneWord && intent === 'reglementation' ? `${words.slice(0, 3).join(' ')} ${zoneWord}` : ''].filter(Boolean))].slice(0, 3);
  const prefer: Record<SearchIntent, KeylessEngine[]> = {
    actualite: ['firecrawl', 'tavily', 'parallel', 'exa'],
    reglementation: ['exa', 'parallel', 'tavily', 'firecrawl'],
    etude: ['exa', 'parallel', 'tavily', 'firecrawl'],
    entreprise: ['exa', 'parallel', 'firecrawl', 'tavily'],
    donnees: ['parallel', 'exa', 'tavily', 'firecrawl'],
    design: ['exa', 'firecrawl', 'tavily', 'parallel'],
    methode: ['tavily', 'parallel', 'firecrawl', 'exa'],
    general: [...KEYLESS_ENGINES],
  };
  const domains = intent === 'reglementation' || intent === 'donnees' ? [...(region ? OFFICIAL[region]! : []), ...OFFICIAL.any!] : [];
  return {
    intent,
    keywords,
    objective: objectiveBy[intent].slice(0, 400),
    queries,
    lang,
    region,
    prefer: prefer[intent],
    firecrawlSources: intent === 'actualite' ? ['news', 'web'] : ['web'],
    exaCategory: intent === 'actualite' ? 'news' : intent === 'etude' ? 'research paper' : intent === 'entreprise' ? 'company' : null,
    domains,
  };
}

/** Exa reads a rich description of the ideal page; a category narrows it (« category:company … »). */
export const exaQuery = (p: SearchPlan) => `${p.exaCategory ? `category:${p.exaCategory} ` : ''}${p.objective}`.slice(0, 450);

// A PDF often carries its template's metadata as title (« Modèle de page de garde portrait », « Microsoft Word - … »,
// an author's name): the file name says more (« CIRCULAIRE N°04-2017-CB-C RELATIVE À… »).
const JUNK_TITLE = /^(mod[eè]le de|page de garde|microsoft (word|powerpoint)|untitled|sans titre|document\d*$|diapositive|slide \d|[A-Z]{3,}$)/i;
export function betterTitle(title: string, url: string): string {
  if (!/\.pdf($|\?)/i.test(url) || !JUNK_TITLE.test(title.trim())) return title;
  try {
    const file = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '').replace(/\.pdf$/i, '').replace(/[_+]+/g, ' ').replace(/\s+/g, ' ').trim();
    return file.length >= 6 ? file.slice(0, 160) : title;
  } catch {
    return title;
  }
}
const SOCIAL = /(youtube\.com|youtu\.be|facebook\.com|tiktok\.com|instagram\.com|x\.com|twitter\.com)\//i;

/** Results re-ranked for the case: official sources and source texts (PDF) first for rules and data; dated items first
 *  for news; duplicates removed. Stable otherwise (each engine's own order is kept). */
export function rankForPlan(hits: BraveHit[], p: SearchPlan): BraveHit[] {
  const seen = new Set<string>();
  const host = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };
  return hits
    .filter((h) => {
      const k = h.url.replace(/[#?].*$/, '').replace(/\/$/, '');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((h0, i) => {
      const h = { ...h0, title: betterTitle(h0.title, h0.url) };
      let s = -i * 0.01;
      if (p.intent !== 'design' && p.intent !== 'methode' && SOCIAL.test(h.url)) s -= 2;
      const d = host(h.url);
      if (p.domains.some((x) => d === x || d.endsWith(`.${x}`))) s += 3;
      if ((p.intent === 'reglementation' || p.intent === 'etude') && /\.pdf($|\?)/i.test(h.url)) s += 1;
      if (p.intent === 'actualite' && h.age) s += 1;
      if (p.intent === 'etude' && /doi\.org|arxiv|ssrn|researchgate|\.edu|hal\./i.test(h.url)) s += 2;
      return { h, s };
    })
    .sort((a, b) => b.s - a.s)
    .map((x) => x.h);
}

/** One line for the trace: how the request was understood. */
export const planLabel = (p: SearchPlan) => `${p.intent}${p.region ? ` · ${p.region}` : ''} · ${p.lang}`;
