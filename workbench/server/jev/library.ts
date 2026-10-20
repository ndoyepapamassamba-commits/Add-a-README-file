// LA BIBLIOTHÈQUE MONDIALE DE JEV (v63 — « il doit disposer d'une bibliothèque mondiale sur tous les domaines de la vie
// afin de répondre aux exigences du chat et de l'app »). Sources publiques, GRATUITES et SANS CLÉ, appelables depuis la
// page de l'app (CORS ouvert, mesurées le 15/10/2026 avec Origin: null) ; chaque domaine de la vie a ses sources, la
// demande est classée puis envoyée aux 2 à 4 sources les plus fortes de son domaine, en parallèle.
// Partie pure (testée en Node) : classement, adresses, lecture des réponses. Rien n'est inventé : une source qui ne
// répond pas est signalée, jamais remplacée par un texte fabriqué.

export type LibDomain =
  | 'savoirs'
  | 'sciences'
  | 'santé'
  | 'finance & droit'
  | 'livres & archives'
  | 'code & technologie'
  | 'nature'
  | 'alimentation'
  | 'culture & loisirs'
  | 'spiritualité'
  | 'pays & données';

export interface LibHit {
  title: string;
  url: string;
  snippet: string;
  source: string;
  year?: number;
}
export interface LibSource {
  id: string;
  label: string;
  domains: LibDomain[];
  /** Licence / terms of the data, shown with the results. */
  terms: string;
  url: (q: string, n: number, lang: 'fr' | 'en') => string;
  parse: (json: unknown, n: number) => LibHit[];
}

const clip = (s: unknown, n = 400) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const enc = encodeURIComponent;
const yearOf = (v: unknown) => {
  const y = Number(String(v ?? '').slice(0, 4));
  return y > 1000 && y < 3000 ? y : undefined;
};
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const wiki = (lang: 'fr' | 'en'): LibSource => ({
  id: `wikipedia-${lang}`,
  label: `Wikipédia (${lang})`,
  domains: ['savoirs', 'pays & données', 'culture & loisirs', 'sciences', 'santé', 'finance & droit', 'spiritualité', 'nature'],
  terms: 'CC BY-SA',
  url: (q, n) => `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${enc(q)}&gsrlimit=${Math.min(n, 5)}&prop=extracts|info&exintro=1&explaintext=1&exchars=600&inprop=url&format=json&origin=*`,
  parse: (j, n) =>
    Object.values(((j as J)?.query?.pages ?? {}) as Record<string, J>)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .slice(0, n)
      .map((p) => ({ title: clip(p.title, 200), url: p.fullurl ?? `https://${lang}.wikipedia.org/wiki/${enc(p.title)}`, snippet: clip(p.extract, 600), source: `Wikipédia (${lang})` })),
});

export const LIBRARY: LibSource[] = [
  wiki('fr'),
  wiki('en'),
  {
    id: 'crossref',
    label: 'Crossref (articles et revues)',
    domains: ['sciences', 'finance & droit', 'santé', 'code & technologie'],
    terms: 'métadonnées ouvertes (CC0)',
    url: (q, n) => `https://api.crossref.org/works?rows=${n}&query=${enc(q)}&select=DOI,title,author,issued,container-title,abstract`,
    parse: (j, n) =>
      (((j as J)?.message?.items ?? []) as J[]).slice(0, n).map((w) => ({
        title: clip(w.title?.[0], 200) || '(sans titre)',
        url: `https://doi.org/${w.DOI}`,
        snippet: clip(`${(w.author ?? []).slice(0, 3).map((a: J) => a.family).join(', ')} — ${w['container-title']?.[0] ?? ''}. ${w.abstract ?? ''}`),
        source: 'Crossref',
        year: w.issued?.['date-parts']?.[0]?.[0],
      })),
  },
  {
    id: 'doaj',
    label: 'DOAJ (revues en libre accès)',
    domains: ['sciences', 'finance & droit', 'santé'],
    terms: 'libre accès (métadonnées CC0)',
    url: (q, n) => `https://doaj.org/api/search/articles/${enc(q)}?pageSize=${n}`,
    parse: (j, n) =>
      (((j as J)?.results ?? []) as J[]).slice(0, n).map((r) => {
        const b = r.bibjson ?? {};
        const link = (b.link ?? []).find((l: J) => l.url)?.url;
        const doi = (b.identifier ?? []).find((i: J) => i.type === 'doi')?.id;
        return { title: clip(b.title, 200), url: link ?? (doi ? `https://doi.org/${doi}` : `https://doaj.org/article/${r.id}`), snippet: clip(b.abstract), source: 'DOAJ', year: yearOf(b.year) };
      }),
  },
  {
    id: 'hal',
    label: 'HAL (archive ouverte française)',
    domains: ['sciences', 'finance & droit', 'santé', 'savoirs'],
    terms: 'archive ouverte (CCSD)',
    url: (q, n) => `https://api.archives-ouvertes.fr/search/?q=${enc(q)}&wt=json&rows=${n}&fl=title_s,uri_s,producedDateY_i,abstract_s,authFullName_s`,
    parse: (j, n) =>
      (((j as J)?.response?.docs ?? []) as J[]).slice(0, n).map((d) => ({
        title: clip(Array.isArray(d.title_s) ? d.title_s[0] : d.title_s, 200),
        url: d.uri_s,
        snippet: clip(`${(d.authFullName_s ?? []).slice(0, 3).join(', ')}. ${Array.isArray(d.abstract_s) ? d.abstract_s[0] : (d.abstract_s ?? '')}`),
        source: 'HAL',
        year: d.producedDateY_i,
      })),
  },
  {
    id: 'europepmc',
    label: 'Europe PMC (santé, biomédecine)',
    domains: ['santé', 'sciences', 'nature', 'alimentation'],
    terms: 'métadonnées ouvertes',
    url: (q, n) => `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${enc(q)}&format=json&pageSize=${n}&resultType=core`,
    parse: (j, n) =>
      (((j as J)?.resultList?.result ?? []) as J[]).slice(0, n).map((r) => ({
        title: clip(r.title, 200),
        url: r.doi ? `https://doi.org/${r.doi}` : `https://europepmc.org/article/${r.source}/${r.id}`,
        snippet: clip(`${r.authorString ?? ''} — ${r.journalInfo?.journal?.title ?? r.journalTitle ?? ''}. ${r.abstractText ?? ''}`),
        source: 'Europe PMC',
        year: yearOf(r.pubYear),
      })),
  },
  {
    id: 'openalex',
    label: 'OpenAlex (250 M de travaux)',
    domains: ['sciences', 'finance & droit', 'santé', 'code & technologie'],
    terms: 'CC0 (budget anonyme quotidien par adresse IP)',
    url: (q, n) => `https://api.openalex.org/works?search=${enc(q)}&per-page=${n}&select=id,doi,display_name,publication_year,primary_location,abstract_inverted_index,cited_by_count`,
    parse: (j, n) =>
      (((j as J)?.results ?? []) as J[]).slice(0, n).map((w) => ({
        title: clip(w.display_name, 200),
        url: w.doi ?? w.primary_location?.landing_page_url ?? w.id,
        snippet: clip(`${w.cited_by_count ?? 0} citation(s). ${abstractOf(w.abstract_inverted_index)}`),
        source: 'OpenAlex',
        year: w.publication_year,
      })),
  },
  {
    id: 'openlibrary',
    label: 'Open Library (livres)',
    domains: ['livres & archives', 'savoirs', 'culture & loisirs', 'spiritualité'],
    terms: 'données ouvertes (Internet Archive)',
    url: (q, n) => `https://openlibrary.org/search.json?q=${enc(q)}&limit=${n}&fields=title,author_name,first_publish_year,key,subject`,
    parse: (j, n) =>
      (((j as J)?.docs ?? []) as J[]).slice(0, n).map((d) => ({
        title: clip(d.title, 200),
        url: `https://openlibrary.org${d.key}`,
        snippet: clip(`${(d.author_name ?? []).slice(0, 3).join(', ')}${d.subject ? ` — ${d.subject.slice(0, 6).join(', ')}` : ''}`),
        source: 'Open Library',
        year: d.first_publish_year,
      })),
  },
  {
    id: 'archive',
    label: 'Internet Archive (documents, livres, médias)',
    domains: ['livres & archives', 'culture & loisirs', 'savoirs'],
    terms: 'selon chaque document',
    url: (q, n) => `https://archive.org/advancedsearch.php?q=${enc(q)}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=description&fl%5B%5D=year&fl%5B%5D=mediatype&rows=${n}&output=json`,
    parse: (j, n) =>
      (((j as J)?.response?.docs ?? []) as J[]).slice(0, n).map((d) => ({
        title: clip(d.title, 200),
        url: `https://archive.org/details/${d.identifier}`,
        snippet: clip(`${d.mediatype ?? ''}. ${Array.isArray(d.description) ? d.description[0] : (d.description ?? '')}`),
        source: 'Internet Archive',
        year: yearOf(d.year),
      })),
  },
  {
    id: 'stackoverflow',
    label: 'Stack Overflow (questions de code résolues)',
    domains: ['code & technologie'],
    terms: 'CC BY-SA (300 requêtes/jour par adresse IP sans clé)',
    url: (q, n) => `https://api.stackexchange.com/2.3/search/advanced?q=${enc(q)}&site=stackoverflow&pagesize=${n}&order=desc&sort=relevance&filter=withbody`,
    parse: (j, n) =>
      (((j as J)?.items ?? []) as J[]).slice(0, n).map((i) => ({
        title: clip(decode(i.title), 200),
        url: i.link,
        snippet: clip(`${i.is_answered ? 'résolue' : 'ouverte'} · score ${i.score} · ${(i.tags ?? []).join(', ')}. ${decode(i.body ?? '')}`),
        source: 'Stack Overflow',
        year: i.creation_date ? new Date(i.creation_date * 1000).getUTCFullYear() : undefined,
      })),
  },
  {
    id: 'npm',
    label: 'npm (bibliothèques JavaScript)',
    domains: ['code & technologie'],
    terms: 'registre public',
    url: (q, n) => `https://registry.npmjs.org/-/v1/search?text=${enc(q)}&size=${n}`,
    parse: (j, n) =>
      (((j as J)?.objects ?? []) as J[]).slice(0, n).map((o) => ({
        title: `${o.package?.name} ${o.package?.version ?? ''}`.trim(),
        url: o.package?.links?.npm ?? `https://www.npmjs.com/package/${o.package?.name}`,
        snippet: clip(`${o.package?.description ?? ''} · ${o.downloads?.monthly ?? '?'} téléchargements/mois · licence ${o.package?.license ?? '?'}`),
        source: 'npm',
        year: yearOf(o.package?.date),
      })),
  },
  {
    id: 'huggingface',
    label: 'Hugging Face (modèles d’IA ouverts)',
    domains: ['code & technologie'],
    terms: 'licence propre à chaque modèle (à vérifier)',
    url: (q, n) => `https://huggingface.co/api/models?search=${enc(q)}&limit=${n}&sort=downloads&full=false&cardData=true`,
    parse: (j, n) =>
      ((Array.isArray(j) ? j : []) as J[]).slice(0, n).map((m) => ({
        title: m.id,
        url: `https://huggingface.co/${m.id}`,
        snippet: clip(`${m.pipeline_tag ?? ''} · ${m.downloads ?? 0} téléchargements · licence ${m.cardData?.license ?? '?'}`),
        source: 'Hugging Face',
        year: yearOf(m.createdAt),
      })),
  },
  {
    id: 'pubchem',
    label: 'PubChem (chimie, médicaments)',
    domains: ['santé', 'sciences', 'alimentation'],
    terms: 'domaine public (NIH)',
    url: (q) => `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${enc(q.split(/\s+/).slice(0, 3).join(' '))}/property/Title,MolecularFormula,MolecularWeight,IUPACName/JSON`,
    parse: (j, n) =>
      (((j as J)?.PropertyTable?.Properties ?? []) as J[]).slice(0, n).map((p) => ({
        title: clip(p.Title ?? p.IUPACName, 200),
        url: `https://pubchem.ncbi.nlm.nih.gov/compound/${p.CID}`,
        snippet: clip(`Formule ${p.MolecularFormula} · masse molaire ${p.MolecularWeight} g/mol · ${p.IUPACName ?? ''}`),
        source: 'PubChem',
      })),
  },
  {
    id: 'gbif',
    label: 'GBIF (espèces vivantes)',
    domains: ['nature'],
    terms: 'CC0 / CC BY',
    url: (q, n) => `https://api.gbif.org/v1/species/search?q=${enc(q)}&limit=${n}`,
    parse: (j, n) =>
      (((j as J)?.results ?? []) as J[]).slice(0, n).map((s) => ({
        title: clip(`${s.scientificName}${s.vernacularNames?.[0]?.vernacularName ? ` (${s.vernacularNames[0].vernacularName})` : ''}`, 200),
        url: `https://www.gbif.org/species/${s.key}`,
        snippet: clip(`${s.rank ?? ''} · ${[s.kingdom, s.family, s.genus].filter(Boolean).join(' › ')}${s.descriptions?.[0]?.description ? `. ${s.descriptions[0].description}` : ''}`),
        source: 'GBIF',
      })),
  },
  {
    id: 'inaturalist',
    label: 'iNaturalist (faune et flore, noms courants)',
    domains: ['nature'],
    terms: 'CC BY-NC (données d’observation)',
    url: (q, n) => `https://api.inaturalist.org/v1/taxa?q=${enc(q)}&per_page=${n}&locale=fr`,
    parse: (j, n) =>
      (((j as J)?.results ?? []) as J[]).slice(0, n).map((t) => ({
        title: clip(`${t.preferred_common_name ?? t.name} (${t.name})`, 200),
        url: `https://www.inaturalist.org/taxa/${t.id}`,
        snippet: clip(`${t.rank} · ${t.observations_count ?? 0} observations${t.wikipedia_url ? ` · ${t.wikipedia_url}` : ''}`),
        source: 'iNaturalist',
      })),
  },
  {
    id: 'openfoodfacts',
    label: 'Open Food Facts (aliments, nutrition)',
    domains: ['alimentation', 'santé'],
    terms: 'ODbL',
    url: (q, n) => `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${enc(q)}&json=1&page_size=${n}&fields=code,product_name,brands,nutriscore_grade,nova_group,energy-kcal_100g,nutriments,countries`,
    parse: (j, n) =>
      (((j as J)?.products ?? []) as J[]).slice(0, n).map((p) => ({
        title: clip(`${p.product_name ?? '(sans nom)'}${p.brands ? ` — ${p.brands}` : ''}`, 200),
        url: `https://world.openfoodfacts.org/product/${p.code}`,
        snippet: clip(`Nutri-Score ${String(p.nutriscore_grade ?? '?').toUpperCase()} · NOVA ${p.nova_group ?? '?'} · ${p.nutriments?.['energy-kcal_100g'] ?? '?'} kcal/100 g · ${p.countries ?? ''}`),
        source: 'Open Food Facts',
      })),
  },
  {
    id: 'musicbrainz',
    label: 'MusicBrainz (musique)',
    domains: ['culture & loisirs'],
    terms: 'CC0',
    url: (q, n) => `https://musicbrainz.org/ws/2/artist?query=${enc(q)}&fmt=json&limit=${n}`,
    parse: (j, n) =>
      (((j as J)?.artists ?? []) as J[]).slice(0, n).map((a) => ({
        title: clip(a.name, 200),
        url: `https://musicbrainz.org/artist/${a.id}`,
        snippet: clip(`${a.type ?? ''} · ${a.country ?? a.area?.name ?? ''} · ${a['life-span']?.begin ?? ''}${a.disambiguation ? ` · ${a.disambiguation}` : ''} · ${(a.tags ?? []).slice(0, 5).map((t: J) => t.name).join(', ')}`),
        source: 'MusicBrainz',
        year: yearOf(a['life-span']?.begin),
      })),
  },
  {
    id: 'tvmaze',
    label: 'TVmaze (séries, émissions)',
    domains: ['culture & loisirs'],
    terms: 'CC BY-SA',
    url: (q) => `https://api.tvmaze.com/search/shows?q=${enc(q)}`,
    parse: (j, n) =>
      ((Array.isArray(j) ? j : []) as J[]).slice(0, n).map((r) => ({
        title: clip(r.show?.name, 200),
        url: r.show?.url,
        snippet: clip(`${(r.show?.genres ?? []).join(', ')} · ${r.show?.language ?? ''} · ${r.show?.network?.name ?? r.show?.webChannel?.name ?? ''}. ${r.show?.summary ?? ''}`),
        source: 'TVmaze',
        year: yearOf(r.show?.premiered),
      })),
  },
  {
    id: 'quran',
    label: 'Al-Quran Cloud (Coran, recherche par mot)',
    domains: ['spiritualité'],
    terms: 'usage libre',
    url: (q, _n, lang) => `https://api.alquran.cloud/v1/search/${enc(q.split(/\s+/)[0] ?? q)}/all/${lang === 'fr' ? 'fr.hamidullah' : 'en.sahih'}`,
    parse: (j, n) =>
      (((j as J)?.data?.matches ?? []) as J[]).slice(0, n).map((m) => ({
        title: `Sourate ${m.surah?.englishName ?? m.surah?.number}, verset ${m.numberInSurah}`,
        url: `https://quran.com/${m.surah?.number}/${m.numberInSurah}`,
        snippet: clip(m.text),
        source: 'Al-Quran Cloud',
      })),
  },
];

/** OpenAlex keeps abstracts as an inverted index: word → positions. */
export function abstractOf(inv: unknown, max = 60): string {
  if (!inv || typeof inv !== 'object') return '';
  const pos: [number, string][] = [];
  for (const [w, ps] of Object.entries(inv as Record<string, number[]>)) for (const p of ps) pos.push([p, w]);
  return pos
    .sort((a, b) => a[0] - b[0])
    .slice(0, max)
    .map((x) => x[1])
    .join(' ');
}
const decode = (s: string) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// ── classer une demande par domaine de la vie ─────────────────────────────────────────────────────────────────────────
const RULES: [RegExp, LibDomain][] = [
  [/\b(sant[ée]|maladie|m[ée]dic|traitement|sympt[ôo]m|paludisme|diab[èe]te|vaccin|pharma|h[ôo]pital|virus|cancer|nutrition|grossesse|epid[ée]mi|health|disease|drug)/i, 'santé'],
  [/\b(code|python|javascript|typescript|node|npm|react|sql|api|bug|erreur|exception|librairie|biblioth[èe]que logicielle|framework|mod[èe]le d.ia|llm|machine learning|excel vba|openpyxl|pandas|git|docker)/i, 'code & technologie'],
  [/\b(banque|bancaire|cr[ée]dit|ifrs|b[âa]le|basel|bceao|umoa|uemoa|ohada|syscohada|comptab|fiscal|imp[ôo]t|droit|loi|juridique|contrat|r[ée]glement|finance|march[ée]|bourse|brvm|investiss|[ée]conomi|inflation|monnaie|provision|risque)/i, 'finance & droit'],
  [/\b(livre|roman|auteur|biblioth[èe]que|archive|manuscrit|[ée]dition|po[ée]sie|litt[ée]rature|book|novel)/i, 'livres & archives'],
  [/\b(esp[èe]ce|animal|animaux|plante|arbre|oiseau|insecte|poisson|faune|flore|baobab|biodiversit|botan|zoolog|species)/i, 'nature'],
  [/\b(aliment|recette|cuisine|calorie|ingr[ée]dient|riz|mil|manioc|nutri-?score|produit alimentaire|food)/i, 'alimentation'],
  [/\b(musique|chanson|chanteur|artiste|album|film|s[ée]rie|cin[ée]ma|t[ée]l[ée]|sport|football|jeu vid[ée]o|music|movie)/i, 'culture & loisirs'],
  [/\b(coran|sourate|verset|bible|[ée]vangile|pri[èe]re|islam|chr[ée]tien|religion|spiritu|foi|proph[èe]te)/i, 'spiritualité'],
  [/\b(pays|population|capitale|pib|gdp|statistique|indicateur|r[ée]gion|ville|g[ée]ograph|d[ée]mograph)/i, 'pays & données'],
  [/\b(recherche scientifique|[ée]tude|article|publication|th[èe]se|physique|chimie|math[ée]matique|biologie|science|research|paper)/i, 'sciences'],
];
export function domainsOf(q: string): LibDomain[] {
  const out: LibDomain[] = [];
  for (const [rx, d] of RULES) if (rx.test(q) && !out.includes(d)) out.push(d);
  return out.length ? out.slice(0, 2) : ['savoirs', 'sciences'];
}
/** The sources to ask for a request: the strongest of each detected domain, 2–4 in all, never twice the same. */
export function pickSources(q: string, o: { domains?: LibDomain[]; max?: number; lang?: 'fr' | 'en' } = {}): LibSource[] {
  const doms = o.domains?.length ? o.domains : domainsOf(q);
  const max = o.max ?? 4;
  const lang = o.lang ?? (/\b(the|of|and|what|how)\b/i.test(q) ? 'en' : 'fr');
  const out: LibSource[] = [];
  const add = (s: LibSource | undefined) => s && !out.includes(s) && out.length < max && out.push(s);
  // Round-robin over the domains, the first sources of each domain first; Wikipédia in the asker's language first.
  const lists = doms.map((d) => LIBRARY.filter((s) => s.domains.includes(d)).sort((a, b) => rank(a, lang) - rank(b, lang)));
  for (let i = 0; out.length < max && i < 6; i++) for (const l of lists) add(l[i]);
  return out;
}
const rank = (s: LibSource, lang: 'fr' | 'en') => (s.id === `wikipedia-${lang}` ? -1 : s.id.startsWith('wikipedia') ? 5 : 0);
export const DOMAINS: LibDomain[] = ['savoirs', 'sciences', 'santé', 'finance & droit', 'livres & archives', 'code & technologie', 'nature', 'alimentation', 'culture & loisirs', 'spiritualité', 'pays & données'];

/** What the model reads: results grouped by source, with the terms of use. */
export function libraryText(q: string, groups: { source: LibSource; hits: LibHit[]; error?: string }[]): string {
  const ok = groups.filter((g) => g.hits.length);
  const head = `Bibliothèque JEV — « ${q} » — ${ok.length}/${groups.length} source(s) ont répondu (${groups.map((g) => g.source.label).join(', ')}).`;
  const body = ok
    .map((g) => `## ${g.source.label} (${g.source.terms})\n${g.hits.map((h) => `- ${h.title}${h.year ? ` (${h.year})` : ''} — ${h.url}${h.snippet ? `\n  ${h.snippet}` : ''}`).join('\n')}`)
    .join('\n\n');
  const fails = groups.filter((g) => !g.hits.length).map((g) => `${g.source.label} : ${g.error ?? '0 résultat'}`);
  return `${head}\n\n${body || 'Aucun résultat.'}${fails.length ? `\n\n(Sans réponse : ${fails.join(' ; ')})` : ''}\n\n(web.read lit une page en entier ; papers.preprints cherche SSRN / arXiv.)`;
}
