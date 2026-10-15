// BIBLIOTHÈQUE D'IDÉES — mise à jour par l'actualité (GDELT + Wikipédia sans clé ; Tavily / Serper en complément)
// et PRODUCTION EN MASSE : chaque idée choisie devient une production complète lancée par l'autopilote, l'une après
// l'autre (chaque film génère déjà ses images, squelettes, plaques et voix en parallèle).
import { useStore } from '../store';
import { useStudio } from './store';
import { runText } from './textModel';
import { runFilm, type FilmResult } from './filmAutopilot';
import { createProductionFromWizard } from './film';
import { NEWS_QUERIES, ideaBrief, newsIdeasPrompt, parseIdeas, type Idea } from '../../../server/jev/studio/ideas';
import { gdeltUrl, laughable, parseGdelt, parseWikiNews, WIKI_NEWS_URL, type Headline } from '../../../server/jev/studio/news';
import { parseSerper, parseTavily, serperRequest, tavilyRequest } from '../../../server/jev/web/search';

const KEY = 'massamba-idees-actualite';
export const loadNewsIdeas = (): Idea[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Idea[];
  } catch {
    return [];
  }
};
export interface NewsMeta {
  at: number;
  sources: string[];
  headlines: number;
  error?: string;
}
const META = 'massamba-idees-actualite.meta';
export const loadNewsMeta = (): NewsMeta | null => {
  try {
    return JSON.parse(localStorage.getItem(META) ?? 'null') as NewsMeta | null;
  } catch {
    return null;
  }
};
const saveMeta = (m: NewsMeta) => {
  try {
    localStorage.setItem(META, JSON.stringify(m));
  } catch {
    /* private mode */
  }
};
async function getJson(url: string, init?: RequestInit, ms = 15000): Promise<unknown> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}
/**
 * Today's headlines, FREE first: GDELT (Ivorian French-language press, no key) → Wikipédia FR (dated briefs, no key)
 * → the owner's Tavily / Serper key if one is set. Each source that fails is skipped; the sources that answered are
 * returned with the headlines (never invented).
 */
export async function fetchHeadlines(): Promise<{ headlines: Headline[]; sources: string[]; errors: string[] }> {
  const out: Headline[] = [];
  const sources: string[] = [];
  const errors: string[] = [];
  const tryOne = async (name: string, f: () => Promise<Headline[]>) => {
    try {
      const h = await f();
      if (h.length) {
        out.push(...h);
        sources.push(`${name} (${h.length})`);
      } else errors.push(`${name} : aucune brève`);
    } catch (e) {
      errors.push(`${name} : ${(e as Error).message.slice(0, 60)}`);
    }
  };
  await tryOne('GDELT · presse ivoirienne', async () => parseGdelt(await getJson(gdeltUrl())));
  await tryOne('Wikipédia · actualité', async () => parseWikiNews(await getJson(WIKI_NEWS_URL)).slice(0, 10));
  const s = useStore.getState().settings;
  // Tavily with the user's key, else its free keyless access (v62); Serper when only its key is set.
  if (out.length < 8) {
    const provider = s.tavilyKey || !s.serperKey ? 'tavily' : 'serper';
    await tryOne(provider === 'tavily' ? (s.tavilyKey ? 'Tavily' : 'Tavily sans clé') : 'Serper', async () => {
      const h: Headline[] = [];
      for (const q of NEWS_QUERIES.slice(0, 2)) {
        const rq = provider === 'tavily' ? tavilyRequest(s.tavilyKey || null, q, 6) : serperRequest(s.serperKey!, q, 6);
        const j = await getJson(rq.url, rq.init);
        for (const x of provider === 'tavily' ? parseTavily(j, 6) : parseSerper(j, 6)) h.push({ title: `${x.title} — ${x.snippet}`, source: provider });
      }
      return h;
    });
  }
  return { headlines: laughable(out), sources, errors };
}
/** Today's headlines → new sketch ideas (kept in this browser). Throws a clear message when no source answered. */
export async function refreshNewsIdeas(): Promise<Idea[]> {
  const { headlines, sources, errors } = await fetchHeadlines();
  if (!headlines.length) {
    saveMeta({ at: Date.now(), sources: [], headlines: 0, error: errors.join(' · ') });
    throw new Error(`Aucune actualité récupérée (${errors.join(' · ') || 'hors ligne'}). La bibliothèque reste disponible.`);
  }
  const projectId = Object.keys(useStudio.getState().projects)[0] ?? 'bibliotheque-idees';
  const r = await runText({ projectId, purpose: 'idées de sketchs (actualité)', maxTokens: 1500, temperature: 0.9, messages: [{ role: 'user', content: newsIdeasPrompt(headlines.map((h) => h.title)) }] });
  const fresh = parseIdeas(r.text);
  const all = [...fresh, ...loadNewsIdeas()].slice(0, 60);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode */
  }
  saveMeta({ at: Date.now(), sources, headlines: headlines.length, ...(fresh.length ? {} : { error: 'le modèle n’a pas rendu d’idée lisible' }) });
  return fresh;
}
export interface BatchItem {
  idea: Idea;
  projectId?: string;
  status: 'en attente' | 'en cours' | 'terminé' | 'échec';
  note?: string;
  result?: FilmResult | null;
}
/** Produces the ideas one after the other (no human validation between stages: mass production). */
export async function produceBatch(ideas: Idea[], onUpdate: (items: BatchItem[]) => void, signal?: { stop: boolean }): Promise<BatchItem[]> {
  const items: BatchItem[] = ideas.map((idea) => ({ idea, status: 'en attente' }));
  for (const it of items) {
    if (signal?.stop) break;
    it.status = 'en cours';
    onUpdate([...items]);
    try {
      const bp = createProductionFromWizard({ idea: ideaBrief(it.idea), dimension: '3D', duration: it.idea.format === 'court' ? 8 : 60, aspect: '9:16', language: 'fr', platform: 'tiktok' });
      it.projectId = bp.project.id;
      it.result = await runFilm(bp.project.id, {
        get stop() {
          return Boolean(signal?.stop);
        },
        chosen: {},
        confirmEach: false,
        onStage: (s, st, note) => {
          it.note = `${s} : ${note ?? st}`;
          onUpdate([...items]);
        },
        validate: async () => undefined,
      });
      it.status = it.result ? 'terminé' : 'échec';
    } catch (e) {
      it.status = 'échec';
      it.note = (e as Error).message.slice(0, 160);
    }
    onUpdate([...items]);
  }
  return items;
}
