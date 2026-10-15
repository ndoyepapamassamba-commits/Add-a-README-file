import { describe, expect, it } from 'vitest';
import {
  CFA_PER_EUR,
  ecbRates,
  ecbText,
  frankfurterUrl,
  keepPreprints,
  parseExaFetch,
  parseJinaReader,
  parseParallelFetch,
  parseWikidata,
  preprintQueries,
  readableUrls,
  wikidataQuery,
} from '../../server/jev/web/freeTools';
import { carriesImages, carriesPrivateData, freeCanTakeOver, freePlan, FREE_CLOUD, restMsFor } from '../../server/llm/freeRoute';
import { compactRequest, forSmallModel, jevParts, parseQwenOutput, pickTools } from '../../server/llm/browserPrompt';
import {
  acceptTechnique,
  brainTopic,
  cacheable,
  cacheKey,
  computeAnswer,
  computeIntent,
  countResearch,
  EMPTY_BRAIN,
  extractJs,
  feedRequest,
  focusBlock,
  hasJev,
  langOfRequest,
  mayResearch,
  needsResearch,
  refreshQueue,
  RESEARCH_PER_DAY,
  streamWatch,
} from '../../server/jev/brain';
import { fxAnswer, parseReflex } from '../../server/jev/reflex';
import { abstractOf, domainsOf, LIBRARY, libraryText, pickSources } from '../../server/jev/library';
import { compileToolPack } from '../../server/jev/tools';
import { listProviderModels, noKeyNeeded, parseRoute, priceFromCatalog, PROVIDERS } from '../../server/llm/universal';
import type { KnowledgeEntry } from '../../server/jev/knowledge/learned';
import type { ChatMessage, ToolDefinition } from '../../server/llm/types';

const rpc = (text: string, isError = false) => ({ result: { isError, content: [{ type: 'text', text }] } });
const entry = (p: Partial<KnowledgeEntry>): KnowledgeEntry => ({
  id: 'k1',
  query: 'provisionnement IFRS 9 stage 2',
  domain: 'Réglementation bancaire',
  text: 'Règle…',
  sources: [],
  origin: 'learned',
  createdAt: Date.UTC(2026, 0, 1),
  expiresAt: Date.UTC(2027, 0, 1),
  hits: 0,
  ...p,
});

describe('v63 — lot A : outils gratuits sans clé', () => {
  it('web.read : Exa (blocs « # Titre / URL / Published »), Parallel (JSON), Jina Reader', () => {
    const exa = parseExaFetch(rpc('# Page A\nURL: https://a.example/x\nPublished: 2025-04-30T00:00:00Z\n\nCorps A sur deux\n\nparagraphes.\n\n# Page B\nURL: https://b.example/y\n\nCorps B'));
    expect(exa).toHaveLength(2);
    expect(exa[0]).toMatchObject({ title: 'Page A', url: 'https://a.example/x', published: '2025-04-30' });
    expect(exa[0]!.text).toContain('paragraphes');
    expect(parseExaFetch(rpc('x', true))).toEqual([]);
    const par = parseParallelFetch(rpc(JSON.stringify({ results: [{ url: 'https://c.example', title: 'C', publish_date: '2025-04-30', excerpts: ['e1', 'e2'], full_content: null }, { url: 'https://d.example', title: 'D', excerpts: [] }] })));
    expect(par).toHaveLength(1);
    expect(par[0]!.text).toBe('e1\n\ne2');
    const jina = parseJinaReader('Title: BCEAO\nURL Source: https://bceao.int\nPublished Time: 2026-10-05T10:00:00Z\nMarkdown Content:\n# Présentation\nTexte.', 'https://bceao.int');
    expect(jina).toMatchObject({ title: 'BCEAO', published: '2026-10-05' });
    expect(parseJinaReader('{"code":422}', 'u')).toBeNull();
    expect(readableUrls(['https://a.example', 'ftp://x', 'https://a.example', 'javascript:alert(1)'])).toEqual(['https://a.example']);
  });
  it('prépublications : requêtes restreintes au site, seuls SSRN / arXiv gardés, miroirs dédoublonnés', () => {
    expect(preprintQueries('IFRS 9 site:x.com ECL', 'both')).toEqual(['site:papers.ssrn.com IFRS 9 ECL', 'site:arxiv.org IFRS 9 ECL']);
    const hits = [
      { url: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=123' },
      { url: 'https://ssrn.com/abstract=123' },
      { url: 'https://arxiv.org/abs/2202.03110' },
      { url: 'https://arxiv.org/pdf/2202.03110v2' },
      { url: 'https://blog.example/ssrn' },
    ];
    expect(keepPreprints(hits, 'both').map((h) => h.url)).toEqual(['https://papers.ssrn.com/sol3/papers.cfm?abstract_id=123', 'https://arxiv.org/abs/2202.03110']);
    expect(keepPreprints(hits, 'arxiv')).toHaveLength(1);
  });
  it('taux BCE : le franc CFA vient de la parité fixe 655,957, jamais inventé', () => {
    expect(frankfurterUrl('XOF', { symbols: ['USD', 'XOF'] })).toBe('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD');
    expect(frankfurterUrl('EUR', { date: '2026-01-02' })).toContain('/v1/2026-01-02?base=EUR');
    const j = { amount: 1, base: 'EUR', date: '2026-10-14', rates: { USD: 1.1195, GBP: 0.84385 } };
    const eur = ecbRates(j, 'EUR', ['USD', 'XOF'])!;
    expect(eur.rates).toEqual({ USD: 1.1195, XOF: CFA_PER_EUR });
    expect(eur.derived).toEqual(['XOF']);
    const xof = ecbRates(j, 'XOF', ['USD', 'EUR'])!;
    expect(xof.rates.EUR).toBeCloseTo(1 / 655.957, 6);
    expect(xof.rates.USD).toBeCloseTo(1.1195 / 655.957, 6);
    expect(ecbText(eur)).toContain('parité fixe');
    const series = { amount: 1, base: 'EUR', start_date: '2025-12-31', end_date: '2026-01-05', rates: { '2025-12-31': { USD: 1.175 }, '2026-01-05': { USD: 1.1664 } } };
    expect(ecbRates(series, 'EUR', ['USD'])).toMatchObject({ date: '2026-01-05', rates: { USD: 1.1664 } });
  });
  it('Wikidata : une entité par élément, chaque fait une fois, guillemets neutralisés', () => {
    expect(wikidataQuery('Eco"bank\\', 'fr')).toContain('mwapi:search "Eco bank"');
    const b = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));
    const json = {
      results: {
        bindings: [
          b({ item: 'http://www.wikidata.org/entity/Q930225', itemLabel: 'Ecobank', itemDescription: 'banque', countryLabel: 'Togo', hqLabel: 'Lomé', industryLabel: 'service financier', inception: '1985-01-01T00:00:00Z', num: '0' }),
          b({ item: 'http://www.wikidata.org/entity/Q930225', itemLabel: 'Ecobank', countryLabel: 'Togo', industryLabel: 'secteur financier', num: '0' }),
          b({ item: 'http://www.wikidata.org/entity/Q5333156', itemLabel: 'Ecobank Nigeria', parentLabel: 'Ecobank', num: '1' }),
        ],
      },
    };
    const list = parseWikidata(json);
    expect(list.map((e) => e.id)).toEqual(['Q930225', 'Q5333156']);
    expect(list[0]!.facts['Secteur']).toEqual(['service financier', 'secteur financier']);
    expect(list[0]!.facts['Création']).toEqual(['1985']);
    expect(list[1]!.facts['Maison mère']).toEqual(['Ecobank']);
  });
});

describe('v63 — lot B : modèles gratuits sans clé', () => {
  it('routes « llm7:gpt-oss:20b » / « pollinations:openai » / « browser:qwen3-0.6b » : sans clé, prix 0, liste vérifiée', async () => {
    expect(parseRoute('llm7:gpt-oss:20b')).toEqual({ provider: 'llm7', model: 'gpt-oss:20b' });
    expect(parseRoute('openai/gpt-oss-20b:free')).toBeNull();
    expect(noKeyNeeded('llm7') && noKeyNeeded('pollinations') && noKeyNeeded('browser')).toBe(true);
    expect(noKeyNeeded('anthropic')).toBe(false);
    expect(priceFromCatalog('llm7', 'gpt-oss:20b', [])).toMatchObject({ input: 0, output: 0 });
    expect(PROVIDERS.pollinations.chatPath).toBe('/openai');
    // No network: keyless providers list only the models verified free (with tools).
    expect(await listProviderModels('llm7', { key: '', fetch: () => Promise.reject(new Error('no network')) })).toEqual(['gpt-oss:20b', 'nemotron-3-nano:30b', 'codestral-latest']);
  });
  it('confidentialité : une conversation avec fichier ou résultat de données ne part pas vers un service anonyme', () => {
    const web: ChatMessage[] = [
      { role: 'user', content: 'Quelles sont les règles BCEAO ?' },
      { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'web__search', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 't1', content: 'résultats publics' },
    ];
    expect(carriesPrivateData(web)).toBe(false);
    const data: ChatMessage[] = [
      { role: 'user', content: 'Top 20' },
      { role: 'assistant', content: null, tool_calls: [{ id: 't2', type: 'function', function: { name: 'data__query', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 't2', content: 'CLIENT A 1 200 000' },
    ];
    expect(carriesPrivateData(data)).toBe(true);
    expect(carriesPrivateData([{ role: 'user', content: 'Analyse\n\nData file attached: /uploads/esn.xlsx' }])).toBe(true);
    const now = 1_000;
    expect(freePlan({ privateData: true, allowCloudOnPrivate: false, browser: null, cooled: {}, now }).chain).toEqual([]);
    expect(freePlan({ privateData: true, allowCloudOnPrivate: false, browser: 'browser:qwen3-0.6b', cooled: {}, now }).chain).toEqual(['browser:qwen3-0.6b']);
    expect(freePlan({ privateData: false, allowCloudOnPrivate: false, browser: null, cooled: { llm7: now + 5 }, now }).chain).toEqual(['pollinations:openai']);
    expect(freePlan({ privateData: false, allowCloudOnPrivate: false, browser: null, cooled: {}, now }).chain).toEqual([...FREE_CLOUD]);
  });
  it('repos d’un service saturé : le délai annoncé (en-tête ou message), borné entre 1 min et 12 h', () => {
    expect(restMsFor(null, '{"error":{"message":"Daily token quota exceeded. Retry after 65523 seconds.","retry_after":65523}}')).toBe(12 * 3_600_000);
    expect(restMsFor(10, 'quota')).toBe(60_000);
    expect(restMsFor(null, 'Retry after 900 seconds')).toBe(900_000);
    expect(restMsFor(null, '')).toBe(10 * 60_000);
  });
  it('requête compacte vers un service gratuit : blocs JEV gardés, structure des outils intacte, 14 outils au plus', () => {
    const tools: ToolDefinition[] = Array.from({ length: 40 }, (_, i) => ({ type: 'function', function: { name: `tool_${i}`, description: `outil ${i} ${'x'.repeat(200)}`, parameters: { type: 'object', properties: {} } } }));
    const msgs: ChatMessage[] = [
      { role: 'system', content: `Doctrine ${'d'.repeat(20000)}\n<jev_packet decided_by="JEV-0">task: chat</jev_packet>` },
      ...Array.from({ length: 30 }, (_, i): ChatMessage => ({ role: i % 2 ? 'assistant' : 'user', content: `message ${i}` })),
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'tool_3', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: 'r'.repeat(20000) },
    ];
    const c = compactRequest(msgs, tools);
    expect(c.tools).toHaveLength(14);
    expect(c.tools.map((t) => t.function.name)).toContain('tool_3');
    expect(String(c.messages[0]!.content)).toContain('<jev_packet');
    expect(String(c.messages[0]!.content).length).toBeLessThan(15000);
    const tool = c.messages.find((m) => m.role === 'tool')!;
    expect(tool.tool_call_id).toBe('c1');
    expect(String(tool.content).length).toBeLessThan(6100);
    expect(c.messages.filter((m) => m.role !== 'system').length).toBeLessThanOrEqual(14);
    expect(c.messages[1]!.role).not.toBe('tool');
    expect(c.saved).toBeGreaterThan(30000);
  });
  it('relais gratuit : clé, crédit, quota, réseau — jamais une annulation', () => {
    expect(freeCanTakeOver({ status: 402, message: 'Insufficient credits' })).toBe(true);
    expect(freeCanTakeOver({ status: 401 })).toBe(true);
    expect(freeCanTakeOver({ status: 0, message: 'Failed to fetch' })).toBe(true);
    expect(freeCanTakeOver({ status: 499, code: 'cancelled' })).toBe(false);
    expect(freeCanTakeOver({ status: 400, message: 'bad request' })).toBe(false);
    // A model refusing this request is not a key problem: the caller (next vision model, blocked list) handles it.
    expect(freeCanTakeOver({ status: 403, message: 'x/inkling-small:free is only available on agentic harnesses.' })).toBe(false);
    expect(freeCanTakeOver({ status: 403, message: 'Key limit exceeded' })).toBe(true);
    expect(carriesImages([{ role: 'user', content: [{ type: 'text', text: 'décris' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } }] }])).toBe(true);
    expect(carriesImages([{ role: 'user', content: 'texte seul' }])).toBe(false);
  });
});

describe('v63 — lot C : modèle intégré nourri par JEV', () => {
  const tools: ToolDefinition[] = ['filesystem.read', 'web.search', 'fx.ecb', 'data.query', 'diagram.render', 'entity.lookup', 'papers.preprints', 'library.search'].map((n) => ({
    type: 'function',
    function: { name: n.replace('.', '__'), description: `${n} tool`, parameters: { type: 'object', properties: {} } },
  }));
  it('les blocs JEV passent avant les consignes ; 6 outils au plus, ceux que JEV cite favorisés', () => {
    const system = `Consignes générales ${'x'.repeat(5000)}\n<jev_capsule adapted="inference-time">utilise fx__ecb pour les taux</jev_capsule>\n<LEARNED_KNOWLEDGE>BCE : référence</LEARNED_KNOWLEDGE>\n<jev_packet decided_by="JEV-0" confidence="0.9">task: chat</jev_packet>`;
    const parts = jevParts(system);
    expect(parts.blocks.map((b) => b.name)).toEqual(['capsule JEV', 'connaissances apprises', 'paquet JEV']);
    expect(parts.rest).not.toContain('<jev_capsule');
    const small = forSmallModel([{ role: 'system', content: system }, { role: 'user', content: 'taux du dollar en franc CFA' }], tools);
    expect(small.messages[0]!.content).toContain('Ce que JEV a préparé');
    expect(small.messages[0]!.content).toContain('utilise fx__ecb');
    expect(small.tools).toHaveLength(6);
    expect(small.tools.map((t) => t.function.name)).toContain('fx__ecb');
    expect(small.jev).toEqual(['capsule JEV', 'connaissances apprises', 'paquet JEV']);
    expect(small.trimmed.join(' ')).toContain('consignes résumées');
    expect(pickTools(tools.slice(0, 3), 'x')).toHaveLength(3);
  });
  it('sortie Qwen3 : réflexion retirée, appels d’outils au format Hermes, JSON imbriqué', () => {
    const out = parseQwenOutput('<think>je réfléchis</think>Voici.<tool_call>\n{"name": "fx__ecb", "arguments": {"base": "EUR", "symbols": ["USD"], "o": {"a": "}"}}}\n</tool_call><|im_end|>');
    expect(out.content).toBe('Voici.');
    expect(out.toolCalls).toHaveLength(1);
    expect(JSON.parse(out.toolCalls[0]!.function.arguments)).toEqual({ base: 'EUR', symbols: ['USD'], o: { a: '}' } });
    expect(parseQwenOutput('Réponse simple.').toolCalls).toEqual([]);
  });
});

describe('v63 — le cerveau JEV', () => {
  const ask = (t: string): ChatMessage[] => [{ role: 'user', content: t }];
  it('comprend la demande et tient le modèle sur le sujet (cadre d’objectif)', () => {
    const f = focusBlock(ask('Rédige une note JSON sur le provisionnement IFRS 9 des créances en stage 2.'), 'dossier');
    expect(f).toContain('<jev_focus purpose="dossier">');
    expect(f).toContain('objet JSON valide');
    expect(f).toContain('Interdit : sortir du sujet');
    expect(focusBlock(ask('   '))).toBe('');
  });
  it('nourrit chaque contexte (techniques + leçons), sans doubler ce que l’agent a déjà compilé', () => {
    const k = [entry({ id: 'k9', query: 'provisionnement IFRS 9 stage 2 créances', hits: 3 })];
    const fed = feedRequest(ask('Comment calculer le provisionnement IFRS 9 des créances en stage 2 ?'), { knowledge: k, lessons: ['Toujours citer la source'], purpose: 'dossier' });
    expect(fed.added).toEqual(['cadre d’objectif', '1 technique(s) apprise(s)', '1 leçon(s)']);
    expect(fed.knowledgeIds).toEqual(['k9']);
    expect(fed.messages[0]!.role).toBe('system');
    const agent: ChatMessage[] = [{ role: 'system', content: '<jev_packet decided_by="x">…</jev_packet>' }, ...ask('Bonjour')];
    expect(hasJev(agent)).toBe(true);
    expect(feedRequest(agent, { knowledge: k }).added).toEqual([]);
  });
  it('cache : seulement les appels déterministes sans outils hors chat ; clé stable, modèle exclu', () => {
    const r = { messages: ask('Idée'), temperature: 0.2, maxTokens: 100 };
    expect(cacheable(r, 'prompt-improve')).toBe(true);
    expect(cacheable(r, 'chat')).toBe(false);
    expect(cacheable({ ...r, temperature: 0.9 }, 'x')).toBe(false);
    expect(cacheable({ ...r, temperature: undefined }, 'x')).toBe(false);
    expect(cacheKey(r, 'p')).toBe(cacheKey({ ...r }, 'p'));
    expect(cacheKey(r, 'p')).not.toBe(cacheKey({ ...r, messages: ask('Idée 2') }, 'p'));
  });
  it('veille : seul le sujet technique part en recherche — ni chiffres, ni noms propres, ni adresses', () => {
    const t = brainTopic('Analyse le provisionnement IFRS 9 de la Société Ivoirienne de Banque pour 1 250 000 000 FCFA, voir jean@x.ci')!;
    expect(t).toContain('ifrs');
    expect(t).not.toMatch(/ivoirienne|banque|1 250|jean|\d/);
    expect(brainTopic('Bonjour')).toBeNull();
    expect(needsResearch([], 'Quelle est la règle de provisionnement des créances douteuses BCEAO ?')).toBe(true);
    expect(needsResearch([entry({ query: 'règle provisionnement créances douteuses BCEAO' })], 'Quelle est la règle de provisionnement des créances douteuses BCEAO ?')).toBe(false);
    expect(needsResearch([], 'Raconte une blague')).toBe(false);
  });
  it('plafond DUR de recherches automatiques par jour, appliqué par le code', () => {
    let s = { ...EMPTY_BRAIN };
    const now = Date.UTC(2026, 9, 15, 12);
    for (let i = 0; i < RESEARCH_PER_DAY; i++) {
      expect(mayResearch(s, now)).toBe(true);
      s = countResearch(s, now);
    }
    expect(mayResearch(s, now)).toBe(false);
    expect(mayResearch(s, now + 86_400_000)).toBe(true);
  });
  it('fiche apprise : gardée seulement si elle est sourcée ([n]) et réelle', () => {
    expect(acceptTechnique('AUCUNE TECHNIQUE')).toBeNull();
    expect(acceptTechnique('- règle A\n- règle B\n- règle C')).toBeNull();
    expect(acceptTechnique('- règle A [1]\n- règle B [2]\n- règle C')).toContain('règle A [1]');
  });
  it('mise à jour perpétuelle : les techniques utilisées et anciennes ou proches de l’échéance, les plus utilisées d’abord', () => {
    const now = Date.UTC(2026, 9, 15);
    const k = [
      entry({ id: 'old-used', createdAt: now - 40 * 86_400_000, hits: 5 }),
      entry({ id: 'old-unused', createdAt: now - 40 * 86_400_000, hits: 0 }),
      entry({ id: 'fresh', createdAt: now - 2 * 86_400_000, hits: 9 }),
      entry({ id: 'expiring', domain: 'Actualité', createdAt: now - 3_600_000, expiresAt: now + 3 * 86_400_000, hits: 1 }),
    ];
    expect(refreshQueue(k, now).map((e) => e.id)).toEqual(['old-used', 'expiring']);
  });
  it('pendant la requête : boucle de répétition et changement de langue détectés', () => {
    const loop = `Introduction de la note. ${'Le ratio de créances douteuses augmente fortement. '.repeat(8)}`;
    expect(streamWatch({ text: loop, lang: 'fr' })?.kind).toBe('boucle');
    const en = `Voici. ${Array.from({ length: 14 }, (_, i) => `Item ${i}: the bank should ensure that the exposure number ${i * 7} is reviewed with the controls of team ${String.fromCharCode(65 + i)} and that it is reported.`).join(' ')}`;
    expect(streamWatch({ text: en, lang: 'fr' })?.kind).toBe('langue');
    expect(streamWatch({ text: 'Réponse normale et variée, sans répétition aucune, sur le sujet demandé par l’utilisateur. '.repeat(1), lang: 'fr' })).toBeNull();
    // No false alarm: tables, code, CSV and lists repeat their patterns legitimately; a translation asked is not a drift.
    const table = `| Client | Encours | Statut |\n|---|---|---|\n${Array.from({ length: 30 }, (_, i) => `| CLIENT ${i} | 1 000 000 | sain et performant sans impayé |`).join('\n')}`;
    expect(streamWatch({ text: table, lang: 'fr' })).toBeNull();
    const code = `Voici le code :\n\`\`\`js\n${'console.log("le portefeuille reste exposé au secteur agricole");\n'.repeat(20)}\`\`\``;
    expect(streamWatch({ text: code, lang: 'fr' })).toBeNull();
    const list = `Points :\n${Array.from({ length: 12 }, () => '- Le dossier doit être revu par le comité de crédit.').join('\n')}`;
    expect(streamWatch({ text: list, lang: 'fr' })).toBeNull();
    expect(langOfRequest('Rédige cet email en anglais pour le client')).toBeNull();
    expect(streamWatch({ text: en, lang: null })).toBeNull();
    expect(langOfRequest('Write the summary of the report')).toBe('en');
    expect(langOfRequest('Rédige la synthèse du rapport')).toBe('fr');
  });
  it('JEV code et interprète : calcul reconnu, code sûr exigé, résultat lu de l’exécution', () => {
    expect(computeIntent('Calcule la mensualité d’un prêt de 10 000 000 FCFA à 8 % sur 5 ans')).toBe(true);
    expect(computeIntent('Combien de clients ont plus de 2 impayés dans le fichier ?')).toBe(false);
    expect(computeIntent('Bonjour, comment vas-tu ?')).toBe(false);
    expect(extractJs('```js\nconst a = 1;\nreturn { resultat: a, unite: "", detail: "x" };\n```')).toContain('return');
    expect(extractJs('```js\nfetch("http://x"); return {resultat:1}\n```')).toBeNull();
    expect(extractJs('pas de code')).toBeNull();
    const ans = computeAnswer(JSON.stringify({ resultat: 202763.94, unite: 'FCFA/mois', detail: 'M = C·t/(1-(1+t)^-n)' }), 'return {}', 'llm7:codestral-latest')!;
    expect(ans).toContain('202');
    expect(ans).toContain('FCFA/mois');
    expect(ans).toContain('exécuté dans le bac à sable');
    expect(computeAnswer('not json', '', 'm')).toBeNull();
  });
});

describe('v63 — réflexes JEV (réponses sans modèle)', () => {
  it('reconnaît strictement conversions, taux, fiches, définitions ; le reste va au modèle', () => {
    expect(parseReflex('convertis 1 500 euros en FCFA')).toEqual({ kind: 'fx', amount: 1500, from: 'EUR', to: 'XOF' });
    expect(parseReflex('100 USD en XOF ?')).toEqual({ kind: 'fx', amount: 100, from: 'USD', to: 'XOF' });
    expect(parseReflex('taux de change euro dollar')).toEqual({ kind: 'fx', amount: null, from: 'EUR', to: 'USD' });
    expect(parseReflex('Où est le siège de Sonatel ?')).toEqual({ kind: 'entity', name: 'Sonatel', facet: 'siège' });
    expect(parseReflex('maison mère de Coris Bank')).toEqual({ kind: 'entity', name: 'Coris Bank', facet: 'maison mère' });
    expect(parseReflex('fiche de la BOAD')).toEqual({ kind: 'entity', name: 'BOAD', facet: 'fiche' });
    expect(parseReflex('définition de la liquidité')).toEqual({ kind: 'definition', term: 'liquidité' });
    expect(parseReflex('Analyse le taux de change et rédige une note de trois pages sur son impact sur le portefeuille')).toBeNull();
    expect(parseReflex('100 XYZ en ABC')).toBeNull();
  });
  it('mise en forme : montant converti, taux inverse, source BCE, 0 modèle', () => {
    const a = fxAnswer({ from: 'EUR', to: 'XOF', amount: 1500, rate: 655.957, date: '2026-10-14', derived: true });
    expect(a).toContain('983');
    expect(a).toContain('parité fixe');
    expect(a).toContain('aucun modèle appelé');
  });
});

describe('v63 — bibliothèque mondiale de JEV', () => {
  it('classe la demande par domaine de la vie et choisit 2 à 4 sources sans doublon', () => {
    expect(domainsOf('traitement du paludisme chez l’enfant')).toContain('santé');
    expect(domainsOf('erreur openpyxl mise en forme conditionnelle')).toContain('code & technologie');
    expect(domainsOf('baobab espèce')).toContain('nature');
    expect(domainsOf('quelque chose de vague')).toEqual(['savoirs', 'sciences']);
    const s = pickSources('traitement du paludisme', { lang: 'fr' });
    expect(s.length).toBeGreaterThanOrEqual(2);
    expect(s.length).toBeLessThanOrEqual(4);
    expect(new Set(s.map((x) => x.id)).size).toBe(s.length);
    expect(s[0]!.id).toBe('wikipedia-fr');
    expect(LIBRARY.length).toBeGreaterThanOrEqual(19);
  });
  it('lit les réponses réelles (formes publiées) et dit quelles sources n’ont pas répondu', () => {
    const src = (id: string) => LIBRARY.find((x) => x.id === id)!;
    expect(src('hal').parse({ response: { docs: [{ title_s: ['Risque de crédit'], uri_s: 'https://hal.science/x', producedDateY_i: 2021 }] } }, 3)[0]).toMatchObject({ title: 'Risque de crédit', year: 2021 });
    expect(src('openalex').parse({ results: [{ display_name: 'ECL', doi: 'https://doi.org/1', publication_year: 2024, abstract_inverted_index: { loss: [1], Expected: [0] }, cited_by_count: 3 }] }, 3)[0]!.snippet).toContain('Expected loss');
    expect(abstractOf({ b: [1], a: [0] })).toBe('a b');
    expect(src('stackoverflow').parse({ items: [{ title: 'A &amp; B', link: 'https://so/1', is_answered: true, score: 5, tags: ['python'] }] }, 2)[0]!.title).toBe('A & B');
    const text = libraryText('x', [
      { source: src('hal'), hits: [{ title: 'T', url: 'https://u', snippet: 's', source: 'HAL' }] },
      { source: src('doaj'), hits: [], error: 'HTTP 429' },
    ]);
    expect(text).toContain('1/2 source(s)');
    expect(text).toContain('DOAJ (revues en libre accès) : HTTP 429');
  });
  it('JEV équipe chaque type de tâche de sa bibliothèque', () => {
    const available = ['filesystem.read', 'library.search', 'web.read', 'web.search', 'fx.ecb', 'entity.lookup'];
    for (const type of ['chat', 'data', 'code', 'research'] as const) expect(compileToolPack({ type, text: 'x', available, mode: 'balanced' }).names).toContain('library.search');
    expect(compileToolPack({ type: 'chat', text: 'taux BCE du dollar', available, mode: 'balanced' }).names).toContain('fx.ecb');
  });
});
