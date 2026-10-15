// La bibliothèque mondiale de JEV, côté page : les sources choisies pour la demande sont interrogées EN PARALLÈLE
// (6 s chacune au plus), les réponses lues par server/jev/library.ts. Gratuit, sans clé ; une source muette est signalée.
import { LIBRARY, libraryText, pickSources, type LibDomain, type LibHit, type LibSource } from '../../server/jev/library';

export interface LibGroup {
  source: LibSource;
  hits: LibHit[];
  error?: string;
  ms: number;
}
export async function runLibrary(q: string, o: { domains?: LibDomain[]; max?: number; n?: number; sources?: string[] } = {}, signal?: AbortSignal): Promise<{ groups: LibGroup[]; text: string }> {
  const lang: 'fr' | 'en' = /\b(the|of|and|what|how)\b/i.test(q) ? 'en' : 'fr';
  const srcs = o.sources?.length ? LIBRARY.filter((s) => o.sources!.includes(s.id)) : pickSources(q, { domains: o.domains, max: o.max ?? 4, lang });
  const n = Math.min(8, Math.max(1, o.n ?? 4));
  const groups = await Promise.all(
    srcs.map(async (source): Promise<LibGroup> => {
      const ac = new AbortController();
      const stop = () => ac.abort();
      signal?.addEventListener('abort', stop);
      const t = setTimeout(stop, 6000);
      const t0 = performance.now();
      try {
        const r = await fetch(source.url(q, n, lang), { headers: { Accept: 'application/json' }, signal: ac.signal });
        if (!r.ok) return { source, hits: [], error: r.status === 429 ? 'quota atteint (réessayer plus tard)' : `HTTP ${r.status}`, ms: Math.round(performance.now() - t0) };
        return { source, hits: source.parse(await r.json(), n).filter((h) => h.title && h.url), ms: Math.round(performance.now() - t0) };
      } catch (e) {
        return { source, hits: [], error: (e as Error).name === 'AbortError' ? 'délai dépassé' : 'injoignable (réseau ou CORS)', ms: Math.round(performance.now() - t0) };
      } finally {
        clearTimeout(t);
        signal?.removeEventListener('abort', stop);
      }
    }),
  );
  return { groups, text: libraryText(q, groups) };
}

/** Each library source called once from this page with a query of its domain (availability, latency, results). */
const PROBE_Q: Record<string, string> = {
  'wikipedia-fr': 'microfinance', 'wikipedia-en': 'microfinance', crossref: 'expected credit loss', doaj: 'microfinance', hal: 'risque de crédit',
  europepmc: 'paludisme', openalex: 'expected credit loss', openlibrary: 'gestion des risques', archive: 'microfinance', stackoverflow: 'openpyxl conditional formatting',
  npm: 'xlsx', huggingface: 'qwen3', pubchem: 'caffeine', gbif: 'baobab', inaturalist: 'baobab', openfoodfacts: 'riz', musicbrainz: 'youssou ndour', tvmaze: 'series', quran: 'patience',
};
export async function probeLibrary(signal?: AbortSignal): Promise<{ id: string; label: string; ok: boolean; ms: number; hits: number; note: string }[]> {
  const rows = await Promise.all(
    LIBRARY.map(async (s) => {
      const r = await runLibrary(PROBE_Q[s.id] ?? 'test', { sources: [s.id], n: 2 }, signal);
      const g = r.groups[0]!;
      return { id: `lib-${s.id}`, label: `Bibliothèque — ${s.label}`, ok: g.hits.length > 0, ms: g.ms, hits: g.hits.length, note: g.hits.length ? 'disponible' : (g.error ?? '0 résultat') };
    }),
  );
  return rows;
}
