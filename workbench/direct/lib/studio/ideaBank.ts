// BIBLIOTHÈQUE D'IDÉES — mise à jour par l'actualité (recherche web gratuite Tavily / Serper, clés de l'utilisateur)
// et PRODUCTION EN MASSE : chaque idée choisie devient une production complète lancée par l'autopilote, l'une après
// l'autre (chaque film génère déjà ses images, squelettes, plaques et voix en parallèle).
import { useStore } from '../store';
import { useStudio } from './store';
import { runText } from './textModel';
import { runFilm, type FilmResult } from './filmAutopilot';
import { createProductionFromWizard } from './film';
import { NEWS_QUERIES, ideaBrief, newsIdeasPrompt, parseIdeas, type Idea } from '../../../server/jev/studio/ideas';
import { parseSerper, parseTavily, serperRequest, tavilyRequest } from '../../../server/jev/web/search';

const KEY = 'massamba-idees-actualite';
export const loadNewsIdeas = (): Idea[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Idea[];
  } catch {
    return [];
  }
};
/** Today's headlines → new sketch ideas (kept in this browser). Throws a clear message without a search key. */
export async function refreshNewsIdeas(): Promise<Idea[]> {
  const s = useStore.getState().settings;
  const provider = s.tavilyKey ? 'tavily' : s.serperKey ? 'serper' : null;
  if (!provider) throw new Error('Clé de recherche absente : Réglages → Internet → clé Tavily ou Serper (gratuites).');
  const headlines: string[] = [];
  for (const q of NEWS_QUERIES.slice(0, 3)) {
    const rq = provider === 'tavily' ? tavilyRequest(s.tavilyKey!, q, 6) : serperRequest(s.serperKey!, q, 6);
    const r = await fetch(rq.url, rq.init);
    if (!r.ok) continue;
    const j = await r.json();
    for (const h of provider === 'tavily' ? parseTavily(j, 6) : parseSerper(j, 6)) headlines.push(`${h.title} — ${h.snippet}`);
  }
  if (!headlines.length) throw new Error('Aucune actualité récupérée (vérifiez la clé de recherche).');
  const projectId = Object.keys(useStudio.getState().projects)[0] ?? 'bibliotheque-idees';
  const r = await runText({ projectId, purpose: 'idées de sketchs (actualité)', maxTokens: 1500, temperature: 0.9, messages: [{ role: 'user', content: newsIdeasPrompt(headlines) }] });
  const fresh = parseIdeas(r.text);
  const all = [...fresh, ...loadNewsIdeas()].slice(0, 60);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode */
  }
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
