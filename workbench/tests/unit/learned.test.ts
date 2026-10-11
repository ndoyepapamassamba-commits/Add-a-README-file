import { describe, expect, it } from 'vitest';
import { domainOf, knowledgeBlock, recall, related, remember, similarity, sourcesOf } from '../../server/jev/knowledge/learned';

const T0 = Date.UTC(2026, 9, 11);
describe('research becomes a skill: the same question never costs a search again', () => {
  const kb = remember([], { query: 'BCEAO instruction 026-11-2016 taux de dépréciation créances en souffrance', text: 'Grille : 20 % puis 50 % puis 100 %. [BCEAO](https://www.bceao.int/x.pdf)', sources: [{ url: 'https://www.bceao.int/x.pdf' }], origin: 'search' }, T0);
  it('the domain is recognised and kept for a year', () => {
    expect(kb[0]!.domain).toBe('Réglementation bancaire');
    expect(kb[0]!.expiresAt - T0).toBe(365 * 86_400_000);
  });
  it('a reformulated question finds the stored answer; an unrelated one does not', () => {
    expect(recall(kb, 'taux de dépréciation des créances en souffrance instruction BCEAO 026-11-2016', T0 + 1000)?.entry.id).toBe(kb[0]!.id);
    expect(recall(kb, 'IFRS 9 stage 3 lifetime ECL', T0 + 1000)).toBeNull();
  });
  it('news expire after a day and need a near-identical question', () => {
    const k2 = remember([], { query: "taux de change euro franc CFA aujourd'hui", text: '655,957', sources: [], origin: 'search' }, T0);
    expect(k2[0]!.domain).toBe('Actualité');
    expect(recall(k2, "taux de change euro franc CFA aujourd'hui", T0 + 3600_000)).not.toBeNull();
    expect(recall(k2, "taux de change euro franc CFA aujourd'hui", T0 + 2 * 86_400_000)).toBeNull();
  });
  it('the same question is replaced, not duplicated', () => {
    const k3 = remember(kb, { query: 'BCEAO instruction 026-11-2016 taux de dépréciation créances en souffrance', text: 'v2', sources: [], origin: 'search' }, T0 + 5);
    expect(k3).toHaveLength(1);
    expect(k3[0]!.text).toBe('v2');
  });
  it('relevant skills are injected for a whole request', () => {
    const learned = remember(kb, { query: 'Correction openpyxl : écrire dans une cellule fusionnée', text: 'Écrire dans la cellule en haut à gauche de la fusion uniquement.', sources: [], origin: 'learned' }, T0);
    const r = related(learned, 'calcule le complément de provisions selon la grille BCEAO des créances en souffrance', 4, T0);
    expect(r.map((e) => e.domain)).toContain('Réglementation bancaire');
    expect(knowledgeBlock(r)).toContain('do NOT search the web again');
  });
  it('helpers', () => {
    expect(similarity('Python KeyError pandas', 'pandas KeyError Python')).toBe(1);
    expect(domainOf('openpyxl merged cell error')).toBe('Code & outils');
    expect(sourcesOf('voir [Guide](https://a.org/g) et https://b.org/x').map((s) => s.url)).toEqual(['https://a.org/g', 'https://b.org/x']);
  });
});
