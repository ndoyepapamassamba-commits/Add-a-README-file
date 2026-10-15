// Recherche canalisée par les lacunes : facettes du sujet, mémoire d'abord, seules les lacunes sont cherchées, JEV trie.
import { describe, expect, it } from 'vitest';
import { coverageNote, keepRelevant, relevanceQuestions, relevanceState, researchFacets, splitKnown } from '../../server/jev/knowledge/gaps';
import { recall, remember, type KnowledgeEntry } from '../../server/jev/knowledge/learned';

describe('JEV cherche seulement ce qu’il ne sait pas', () => {
  it('un sujet de crédit a ses facettes réglementaire, comptable, de place, récentes et de méthode', () => {
    const f = researchFacets('impayés et provisions du portefeuille PME', 'credit');
    expect(f.map((x) => x.id)).toEqual(['regle', 'norme', 'place', 'recent', 'methode']);
    expect(f[0]!.query).toMatch(/BCEAO/);
    expect(researchFacets('ventes en ligne', null).map((x) => x.id)).toContain('tendances');
    expect(researchFacets('', null)).toEqual([]);
  });
  it('ce qui est appris n’est plus cherché ; une nouvelle recherche est mémorisée et sert la fois suivante', () => {
    const f = researchFacets('impayés et provisions du portefeuille PME', 'credit');
    let kb: KnowledgeEntry[] = [];
    let s = splitKnown(f, (q) => recall(kb, q));
    expect(s.gaps).toHaveLength(5);
    kb = remember(kb, { query: f[0]!.query, text: 'Instruction BCEAO 026-11-2016 : classement des créances en souffrance.', sources: [{ url: 'https://www.bceao.int' }], origin: 'search' });
    s = splitKnown(f, (q) => recall(kb, q));
    expect(s.known.map((k) => k.facet.id)).toEqual(['regle']);
    expect(s.gaps).toHaveLength(4);
  });
  it('JEV juge chaque résultat (Noul) ; sans JEV, les premiers de chaque facette', () => {
    const groups = [{ facet: { id: 'a', label: 'cadre', query: 'q' }, hits: [{ title: 'Bon', url: 'u1' }, { title: 'Pub', url: 'u2' }] }];
    const q = relevanceQuestions(groups);
    expect(Object.keys(q)).toEqual(['f0_0', 'f0_1']);
    expect(relevanceState(groups).facets[0]!.hits).toHaveLength(2);
    expect(keepRelevant(groups, { f0_0: { noul: 0.9 }, f0_1: { noul: 0.1 } })[0]!.hits.map((h) => h.url)).toEqual(['u1']);
    expect(keepRelevant(groups, null, 0.5, 1)[0]!.hits).toHaveLength(1);
    expect(coverageNote(5, 1, 4, 9, true)).toMatch(/1\/5.*4 cherchée.*9 source.*JEV/);
  });
});
