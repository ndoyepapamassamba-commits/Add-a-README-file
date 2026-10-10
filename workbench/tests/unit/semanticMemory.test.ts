import { describe, expect, it } from 'vitest';
import { extractFacts, lessonFrom, mergeFacts, recall, terms, type MemFact } from '../../server/jev/memory/semantic';

const f = (text: string, kind: MemFact['kind'] = 'fact', tag?: string): MemFact => ({ id: text, text, kind, at: 1, tag });
describe('semantic memory', () => {
  it('matches by meaning across inflections and FR/EN synonyms', () => {
    const facts = [f('Le tableau Excel des ventes par région est livré : outputs/ventes.xlsx'), f('Le logo doit rester en haut à gauche'), f('Budget marketing validé à 12 millions')];
    const r = recall(facts, 'modifie le classeur des vente', { now: 2 });
    expect(r[0]!.fact.text).toContain('ventes.xlsx');
    expect(recall(facts, 'quelle est la capitale du Japon', { now: 2 })).toHaveLength(0);
    expect(terms('Graphiques')).toEqual(['chart']);
  });
  it('extracts decisions, preferences and deliveries deterministically', () => {
    const x = extractFacts({ request: 'On garde la méthode B pour le calcul. Je préfère les titres en bleu.', delivered: ['outputs/a.xlsx'], now: 5 });
    expect(x.map((y) => y.kind)).toEqual(['decision', 'preference', 'delivery']);
  });
  it('a style alteration becomes a lesson; a one-off data edit does not', () => {
    expect(lessonFrom({ alteration: 'Mets les titres en gras et en bleu', originalRequest: 'Fais un rapport Word', tag: 'document' })!.kind).toBe('lesson');
    expect(lessonFrom({ alteration: 'remplace 1250 par 1300', originalRequest: 'x', tag: 'data' })).toBeNull();
  });
  it('lessons are only reused on the same task family; facts are deduplicated', () => {
    const ls = [f('titres en bleu sur le rapport', 'lesson', 'document'), f('titres en bleu sur le graphique', 'lesson', 'data')];
    expect(recall(ls, 'rapport titres', { tag: 'document', now: 2 }).every((r) => r.fact.tag === 'document')).toBe(true);
    expect(mergeFacts([f('A b c d')], [f('a b c d'), f('autre')], 10)).toHaveLength(2);
  });
});

import { braveText, braveUrl, parseBrave } from '../../server/jev/web/brave';
describe('Brave search', () => {
  it('parses results, strips HTML, builds a compact text for the model', () => {
    const hits = parseBrave({ web: { results: [{ title: 'BCEAO <strong>taux</strong>', url: 'https://bceao.int', description: 'Taux &amp; directeur', age: '2 jours' }, { title: '', url: '' }] } });
    expect(hits).toEqual([{ title: 'BCEAO taux', url: 'https://bceao.int', snippet: 'Taux & directeur', age: '2 jours' }]);
    expect(braveText('taux', hits)).toContain('https://bceao.int');
    expect(braveUrl('https://x.supabase.co/functions/v1/brave-relay/', 'taux BCEAO', 50)).toBe('https://x.supabase.co/functions/v1/brave-relay?q=taux+BCEAO&count=10&extra_snippets=true');
  });
});

import { seedHits, SEED_EXPERIENCE } from '../../server/jev/memory/seed';
describe('embedded experience', () => {
  it('only matching lessons are recalled', () => {
    expect(SEED_EXPERIENCE.length).toBeGreaterThan(15);
    expect(seedHits('corrige ce bug dans mon code python')[0]!.fact.text).toMatch(/Bug|Code|Python/);
    expect(seedHits('bonjour')).toHaveLength(0);
  });
});
