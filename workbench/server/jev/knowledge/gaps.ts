// RECHERCHE CANALISÉE PAR CE QUE JEV NE SAIT PAS (v64, consignes du 15/10/2026 : « analyses ultra pertinentes basées
// sur des recherches approfondies » ; « JEV devra enregistrer le résultat de ces recherches et garder en mémoire comme
// appris, JEV devra canaliser les recherches par rapport à ce qu'il ne sait pas »).
// Un sujet est découpé en FACETTES (cadre réglementaire, normes, pratique de place, chiffres récents, méthodes) ; chaque
// facette déjà apprise est reprise de la mémoire (0 recherche) ; seules les LACUNES sont cherchées, en parallèle ; JEV
// juge la pertinence de chaque résultat (Noul) ; ce qui est retenu est mémorisé facette par facette. Pur.
import type { JevQuestion } from '../provider';

export interface ResearchFacet {
  id: string;
  /** What the facet covers, in the report's words. */
  label: string;
  /** The search query (the subject + the facet's angle). */
  query: string;
}
export interface Hit {
  title: string;
  url: string;
  snippet?: string;
}

const YEAR = new Date().getFullYear();
/** The angles of a deep research on a subject: a credit / banking subject gets its regulatory and accounting angles. */
export function researchFacets(subject: string, lens: 'credit' | 'ranking' | null): ResearchFacet[] {
  const s = subject.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!s) return [];
  const credit = lens === 'credit' || /cr[ée]dit|banque|impay|provision|ifrs|bceao|umoa|engagement|covenant|garantie|risque/i.test(s);
  const base: ResearchFacet[] = credit
    ? [
        { id: 'regle', label: 'cadre réglementaire (BCEAO, UMOA, Bâle)', query: `${s} réglementation BCEAO UMOA Bâle` },
        { id: 'norme', label: 'normes comptables (IFRS 9, pertes attendues)', query: `${s} IFRS 9 pertes de crédit attendues` },
        { id: 'place', label: 'pratique de place et repères chiffrés', query: `${s} pratiques bancaires Afrique de l'Ouest ratios` },
        { id: 'recent', label: `évolutions ${YEAR - 1}-${YEAR}`, query: `${s} ${YEAR - 1} ${YEAR}` },
        { id: 'methode', label: 'méthodes et indicateurs de suivi', query: `${s} indicateurs méthode suivi` },
      ]
    : [
        { id: 'cadre', label: 'définitions et cadre', query: `${s} définition cadre` },
        { id: 'chiffres', label: 'chiffres et repères récents', query: `${s} chiffres clés ${YEAR}` },
        { id: 'pratiques', label: 'bonnes pratiques', query: `${s} bonnes pratiques` },
        { id: 'risques', label: 'risques et limites', query: `${s} risques limites` },
        { id: 'tendances', label: `tendances ${YEAR - 1}-${YEAR}`, query: `${s} tendances ${YEAR - 1} ${YEAR}` },
      ];
  if (lens === 'ranking') base.push({ id: 'concentration', label: 'concentration et classement', query: `${s} concentration indice Herfindahl` });
  return base;
}

/** Splits the facets into the ones the memory already answers and the GAPS (the only ones worth a search). */
export function splitKnown<E>(facets: ResearchFacet[], recall: (q: string) => E | null): { known: { facet: ResearchFacet; entry: E }[]; gaps: ResearchFacet[] } {
  const known: { facet: ResearchFacet; entry: E }[] = [];
  const gaps: ResearchFacet[] = [];
  for (const f of facets) {
    const e = recall(f.query);
    if (e) known.push({ facet: f, entry: e });
    else gaps.push(f);
  }
  return { known, gaps };
}

/** JEV's relevance questions: one Noul per hit (does it help answer its facet?). Keys `f{facet}_{hit}`. */
export function relevanceQuestions(groups: { facet: ResearchFacet; hits: Hit[] }[], perFacet = 4): Record<string, JevQuestion> {
  const q: Record<string, JevQuestion> = {};
  groups.forEach((g, i) =>
    g.hits.slice(0, perFacet).forEach((_, j) => {
      q[`f${i}_${j}`] = { type: 'noul', instructions: `Does \`facets[${i}].hits[${j}]\` contain substantive, specific information that helps answer \`facets[${i}].question\` (not an unrelated page, an advert or a mere title)?` };
    }),
  );
  return q;
}
/** The state JEV reads for those questions (titles + snippets only: no client data is ever in a research query). */
export const relevanceState = (groups: { facet: ResearchFacet; hits: Hit[] }[], perFacet = 4) => ({
  facets: groups.map((g) => ({ question: g.facet.label, hits: g.hits.slice(0, perFacet).map((h) => ({ title: h.title, snippet: (h.snippet ?? '').slice(0, 300) })) })),
});
/** Keeps the hits JEV judged relevant (p ≥ min); without JEV, the first `fallback` of each facet. */
export function keepRelevant(groups: { facet: ResearchFacet; hits: Hit[] }[], answers: Record<string, { noul?: number }> | null, min = 0.5, fallback = 3): { facet: ResearchFacet; hits: Hit[] }[] {
  return groups.map((g, i) => ({
    facet: g.facet,
    hits: answers ? g.hits.filter((_, j) => (answers[`f${i}_${j}`]?.noul ?? 0) >= min) : g.hits.slice(0, fallback),
  }));
}
/** One sentence on what JEV knew and what it searched (shown in the trace and kept with the sources). */
export function coverageNote(total: number, known: number, searched: number, kept: number, judged: boolean): string {
  return `JEV savait ${known}/${total} facette(s) ; ${searched} cherchée(s)${searched ? `, ${kept} source(s) retenue(s)${judged ? ' après tri de pertinence par JEV' : ''} et mémorisée(s)` : ' — rien à chercher'}.`;
}
