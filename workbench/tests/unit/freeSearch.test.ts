import { describe, expect, it } from 'vitest';
import { betterTitle, exaQuery, rankForPlan, searchPlan } from '../../server/jev/web/searchPlan';
import { ACADEMIC, COOL_MS, crossrefUrl, ddgUrl, firecrawlSearchRequest, fullSize, isQuota, keylessOrder, mcpRpc, mergeHits, parallelQueries, parseCrossref, parseDdg, parseFirecrawl, parseFirecrawlImages, parseExa, parseMcpBody, parseParallel, parseWiki, rankDesignImages, tavilyImagesRequest, tavilyRequest, wikiUrl } from '../../server/jev/web/search';

describe('v62 — free search without a key (alternative to the Tavily quota)', () => {
  it('Tavily keyless: no key → the « keyless » access header, never an empty Bearer', () => {
    const h = tavilyRequest(null, 'risque de concentration', 5).init.headers as Record<string, string>;
    expect(h['X-Tavily-Access-Mode']).toBe('keyless');
    expect(h.Authorization).toBeUndefined();
    const k = tavilyRequest('tvly-test', 'x', 5).init.headers as Record<string, string>;
    expect(k.Authorization).toBe('Bearer tvly-test');
    expect(k['X-Tavily-Access-Mode']).toBeUndefined();
    expect((tavilyImagesRequest(null, 'dashboard').init.headers as Record<string, string>)['X-Tavily-Access-Mode']).toBe('keyless');
  });
  it('DuckDuckGo Instant Answer: abstract first, then related topics (nested groups flattened)', () => {
    expect(ddgUrl('IFRS 9')).toMatch(/^https:\/\/api\.duckduckgo\.com\/\?q=IFRS%209&format=json/);
    const hits = parseDdg({ Heading: 'IFRS 9', AbstractText: 'IFRS 9 est une norme comptable…', AbstractURL: 'https://fr.wikipedia.org/wiki/IFRS_9', AbstractSource: 'Wikipedia', RelatedTopics: [{ Text: 'IAS 39 - ancienne norme', FirstURL: 'https://duckduckgo.com/IAS_39' }, { Topics: [{ Text: 'ECL - pertes attendues', FirstURL: 'https://duckduckgo.com/ECL' }] }] });
    expect(hits.map((h) => h.url)).toEqual(['https://fr.wikipedia.org/wiki/IFRS_9', 'https://duckduckgo.com/IAS_39', 'https://duckduckgo.com/ECL']);
    expect(hits[0]!.title).toBe('IFRS 9 — Wikipedia');
    expect(hits[1]!.title).toBe('IAS 39');
    expect(parseDdg({})).toEqual([]);
  });
  it('Wikipedia: page URL rebuilt from the title, snippet stripped of its HTML', () => {
    expect(wikiUrl('HHI')).toContain('origin=*');
    const hits = parseWiki({ query: { search: [{ title: 'Indice de Herfindahl-Hirschman', snippet: 'L&#039;<span class="searchmatch">indice</span> mesure la concentration &amp; …' }] } });
    expect(hits[0]).toMatchObject({ title: 'Indice de Herfindahl-Hirschman — Wikipédia', url: 'https://fr.wikipedia.org/wiki/Indice_de_Herfindahl-Hirschman', snippet: "L'indice mesure la concentration & …" });
  });
  it('Crossref: DOI link, authors, journal and year; only for academic requests', () => {
    expect(crossrefUrl('credit risk')).toContain('select=title,author');
    const hits = parseCrossref({ message: { items: [{ title: ['Credit risk concentration'], author: [{ family: 'Gordy' }, { family: 'Lütkebohmert' }, { family: 'A' }, { family: 'B' }], 'container-title': ['Journal of Banking'], issued: { 'date-parts': [[2013, 1]] }, DOI: '10.1/xyz' }, { title: ['no doi'] }] } });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ url: 'https://doi.org/10.1/xyz', age: '2013' });
    expect(hits[0]!.snippet).toMatch(/^Gordy, Lütkebohmert, A et al\. — Journal of Banking \(2013\)/);
    expect(ACADEMIC.test('une étude sur le risque de crédit')).toBe(true);
    expect(ACADEMIC.test('top 20 du segment')).toBe(false);
  });
  it('merge: round-robin across the sources, no duplicate URL, capped', () => {
    const a = [{ title: 'a1', url: 'u1', snippet: '' }, { title: 'a2', url: 'u2', snippet: '' }];
    const b = [{ title: 'b1', url: 'u1', snippet: '' }, { title: 'b2', url: 'u3', snippet: '' }];
    expect(mergeHits([a, b], 8).map((h) => h.title)).toEqual(['a1', 'a2', 'b2']);
    expect(mergeHits([a, b], 2)).toHaveLength(2);
  });
});

describe('v62 — three complete free web engines without key, in rotation (Tavily, Parallel, Firecrawl)', () => {
  it('Firecrawl keyless: no Authorization header; web, news and images with their size', () => {
    const rq = firecrawlSearchRequest(null, 'risque de concentration', 5, ['web', 'news']);
    expect(rq.url).toBe('https://api.firecrawl.dev/v2/search');
    expect((rq.init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(String(rq.init.body))).toEqual({ query: 'risque de concentration', limit: 5, sources: ['web', 'news'] });
    const hits = parseFirecrawl({ success: true, data: { web: [{ url: 'https://fr.wikipedia.org/wiki/Risque_de_concentration', title: 'Risque de concentration - Wikipédia', description: 'En banque…', position: 1 }], news: [{ url: 'https://www.togofirst.com/x', title: 'Togo : créances restructurées', snippet: 'Les banques…', date: '1 month ago' }] } });
    expect(hits.map((h) => h.url)).toEqual(['https://fr.wikipedia.org/wiki/Risque_de_concentration', 'https://www.togofirst.com/x']);
    expect(hits[1]!.age).toBe('1 month ago');
    const imgs = parseFirecrawlImages({ data: { images: [{ title: 'Finance Dashboard Design', imageUrl: 'https://cdn.dribbble.com/userupload/1/file/a.jpg', imageWidth: 3200, imageHeight: 2400, url: 'https://dribbble.com/shots/1-Finance' }, { imageUrl: 'http://insecure/x.png' }] } });
    expect(imgs).toEqual([{ url: 'https://cdn.dribbble.com/userupload/1/file/a.jpg', description: 'Finance Dashboard Design', width: 3200, height: 2400, page: 'https://dribbble.com/shots/1-Finance' }]);
  });
  it('Parallel Search (anonymous MCP): JSON-RPC bodies, SSE or JSON answers, long dated excerpts', () => {
    expect(JSON.parse(mcpRpc(null, 'notifications/initialized'))).toEqual({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(JSON.parse(mcpRpc(2, 'tools/list'))).toEqual({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const payload = { jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: JSON.stringify({ results: [{ url: 'https://www.financialafrik.com/umoa', title: 'UMOA : normes prudentielles', publish_date: '2019-11-26', excerpts: ['Fonds propres de base T1…', 'Division des risques…'] }] }) }] } };
    expect(parseMcpBody(`event: message\ndata: ${JSON.stringify(payload)}\n\n`)).toEqual(payload);
    expect(parseMcpBody(JSON.stringify(payload))).toEqual(payload);
    const hits = parseParallel(payload);
    expect(hits[0]).toMatchObject({ url: 'https://www.financialafrik.com/umoa', age: '2019-11-26', snippet: 'Fonds propres de base T1… … Division des risques…' });
    expect(parseParallel({ result: { isError: true, content: [] } })).toEqual([]);
    expect(parallelQueries('Seuils de concentration des risques bancaires dans l’UMOA selon la BCEAO')).toEqual(['Seuils de concentration des risques bancaires', 'bancaires dans l’UMOA selon la BCEAO']);
  });
  it('rotation: a different first engine at each search; an engine out of quota rests 15 minutes, tried last', () => {
    expect(keylessOrder(0, {}, 0)).toEqual(['tavily', 'parallel', 'exa', 'firecrawl']);
    expect(keylessOrder(1, {}, 0)).toEqual(['parallel', 'exa', 'firecrawl', 'tavily']);
    expect(keylessOrder(3, {}, 0)).toEqual(['firecrawl', 'tavily', 'parallel', 'exa']);
    const now = 1_000_000;
    expect(keylessOrder(0, { tavily: now + COOL_MS }, now)).toEqual(['parallel', 'exa', 'firecrawl', 'tavily']);
    // A case-specific order: its two strongest engines alternate, the resting one goes last.
    expect(keylessOrder(0, {}, 0, ['exa', 'parallel', 'tavily', 'firecrawl'])).toEqual(['exa', 'parallel', 'tavily', 'firecrawl']);
    expect(keylessOrder(1, {}, 0, ['exa', 'parallel', 'tavily', 'firecrawl'])).toEqual(['parallel', 'exa', 'tavily', 'firecrawl']);
    expect(keylessOrder(0, { exa: now + 1 }, now, ['exa', 'parallel', 'tavily', 'firecrawl'])).toEqual(['parallel', 'tavily', 'firecrawl', 'exa']);
    expect(keylessOrder(0, { tavily: now - 1 }, now)[0]).toBe('tavily');
    expect([402, 429, 432, 433].every(isQuota)).toBe(true);
    expect(isQuota(500)).toBe(false);
  });
});

describe('v62 — « ultra » design images: thumbnails, logos and listings out, full-size shots first', () => {
  it('Dribbble thumbnails are upgraded to the original, Behance small renditions to max_1200', () => {
    expect(fullSize('https://cdn.dribbble.com/userupload/45840136/file/85f.png?resize=400x0')).toBe('https://cdn.dribbble.com/userupload/45840136/file/85f.png');
    expect(fullSize('https://mir-s3-cdn-cf.behance.net/project_modules/disp/abc.jpg')).toBe('https://mir-s3-cdn-cf.behance.net/project_modules/max_1200/abc.jpg');
    expect(fullSize('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
  });
  it('ranking: premium full-size first, small and junk dropped, duplicates merged', () => {
    const r = rankDesignImages([
      { url: 'https://img.example.com/small.jpg', description: 'dashboard', width: 300, height: 200 },
      { url: 'https://img.example.com/logo-brand.png', description: 'logo' },
      { url: 'https://img.example.com/plain.jpg', description: 'a photo', width: 900, height: 700 },
      { url: 'https://cdn.dribbble.com/userupload/2/file/b.jpg', description: 'Finance Dashboard UI', width: 3200, height: 2400, page: 'https://dribbble.com/shots/2-Finance' },
      { url: 'https://cdn.dribbble.com/userupload/2/file/b.jpg?resize=420x', description: 'same shot thumbnail', width: 420, height: 315, page: 'https://dribbble.com/tags/finance' },
    ]);
    expect(r.map((x) => x.url)).toEqual(['https://cdn.dribbble.com/userupload/2/file/b.jpg', 'https://img.example.com/plain.jpg']);
  });
});

describe('v62 — Exa without key (public MCP) and the search refined for the case of the chat', () => {
  it('Exa: text blocks « Title / URL / Published / Highlights » → hits', () => {
    const text = 'Title: Télécharger le guide du banquier de l’UMOA\nURL: https://www.bceao.int/sites/default/files/Guide.pdf\nPublished: N/A\nAuthor: SaFALL\nHighlights:\n3.6 - REGLEMENTATION PRUDENTIELLE …\n\nTitle: beQ Dashboard\nURL: https://ux-design-awards.com/winners/2026-1-beq\nPublished: 2026-03-02T00:00:00.000Z\nHighlights:\nThe beQ Dashboard is a digital control platform';
    const hits = parseExa({ result: { content: [{ type: 'text', text }] } });
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ url: 'https://www.bceao.int/sites/default/files/Guide.pdf', age: undefined });
    expect(hits[0]!.snippet).toMatch(/^3\.6 - REGLEMENTATION PRUDENTIELLE/);
    expect(hits[1]!.age).toBe('2026-03-02');
  });
  it('a rule question in a UMOA chat: regulation intent, French, BCEAO keywords, Exa first, official texts ranked first', () => {
    const p = searchPlan('seuil de division des risques', 'Top 20 Local Corporate encours en XOF, segment 8200');
    expect(p).toMatchObject({ intent: 'reglementation', region: 'UMOA', lang: 'fr', exaCategory: null });
    expect(p.keywords).toBe('seuil division risques BCEAO UMOA');
    expect(p.prefer[0]).toBe('exa');
    expect(p.objective).toMatch(/zone UMOA.*PDF du régulateur/);
    expect(p.domains).toContain('bceao.int');
    const ranked = rankForPlan([
      { title: 'Blog', url: 'https://blog.example.com/risques', snippet: '' },
      { title: 'Dispositif prudentiel', url: 'https://www.bceao.int/fr/reglementations/dispositif.pdf', snippet: '' },
      { title: 'Blog (doublon)', url: 'https://blog.example.com/risques/', snippet: '' },
    ], p);
    expect(ranked.map((h) => h.title)).toEqual(['Dispositif prudentiel', 'Blog']);
  });
  it('news, study, company, design: each case its engines and its form', () => {
    const news = searchPlan('actualité des banques au Togo cette semaine');
    expect(news).toMatchObject({ intent: 'actualite', firecrawlSources: ['news', 'web'], exaCategory: 'news' });
    expect(news.prefer[0]).toBe('firecrawl');
    expect(news.keywords).toMatch(/20\d\d$/);
    const study = searchPlan('une étude sur la concentration du risque de crédit');
    expect(study).toMatchObject({ intent: 'etude', exaCategory: 'research paper' });
    expect(exaQuery(study)).toMatch(/^category:research paper Étude, article scientifique/);
    expect(searchPlan('profil de la société JAH OIL SARL')).toMatchObject({ intent: 'entreprise', exaCategory: 'company' });
    const design = searchPlan('award winning finance dashboard design');
    expect(design).toMatchObject({ intent: 'design', lang: 'en' });
    expect(design.prefer.slice(0, 2)).toEqual(['exa', 'firecrawl']);
    // Delivery words never reach the engines.
    expect(searchPlan('donnes moi un fichier excel ultra design analysant le top 20 du segment 8200').keywords).not.toMatch(/excel|donnes|fichier/);
  });
});

describe('v62 — refined results: meaningful PDF titles, social videos lowered for serious cases', () => {
  it('a PDF titled by its template takes its file name', () => {
    expect(betterTitle('Modèle de lettre extérieur - couleurs', 'https://www.bceao.int/sites/default/files/2018-03/CIRCULAIRE%20N%C2%B004-2017-CB-C%20RELATIVE.pdf')).toBe('CIRCULAIRE N°04-2017-CB-C RELATIVE');
    expect(betterTitle('SAMBANI', 'https://www.bceao.int/files/Guide_du_Banquier_0.pdf')).toBe('Guide du Banquier 0');
    expect(betterTitle('Dispositif prudentiel', 'https://x.org/a.pdf')).toBe('Dispositif prudentiel');
    expect(betterTitle('Modèle de page', 'https://x.org/page.html')).toBe('Modèle de page');
  });
  it('news: a YouTube or Facebook post comes after the press', () => {
    const p = searchPlan('actualité des banques au Sénégal cette semaine');
    const r = rankForPlan([{ title: 'Vidéo', url: 'https://www.youtube.com/watch?v=1', snippet: '' }, { title: 'Presse', url: 'https://mondafrique.com/a', snippet: '' }], p);
    expect(r.map((h) => h.title)).toEqual(['Presse', 'Vidéo']);
  });
});
