// LE CORPUS DE SOURCES DE L'ANALYSTE (pur) — v62 : « cet analyste doit avoir un corpus de sources et pouvoir effectuer des
// recherches sur le sujet du chat ». Trois étages, du moins cher au plus frais :
//   1. ce corpus embarqué : des références publiques, vérifiables, avec ce qu'elles enseignent (aucune n'est inventée :
//      titre, auteur, date et adresse de publication réels) ;
//   2. la base de connaissances de l'app (ce que les recherches précédentes ont appris, 0 recherche) ;
//   3. une recherche Internet sur le sujet du chat (moteurs gratuits configurés, sinon Wikipédia, sans clé).
// Chaque source garde son axe (R1 réglementation … R9 autres) pour être citée [Rx-nn] dans les livrables.
import type { ResearchNote } from './dossierCompose';

export interface CorpusEntry extends ResearchNote {
  /** Domains / words the source serves (accents removed, lower case). */
  tags: string[];
}

export const CORPUS: CorpusEntry[] = [
  { title: 'IFRS 9 — Instruments financiers', author: 'IASB', date: '2014', url: 'https://www.ifrs.org/issued-standards/list-of-standards/ifrs-9-financial-instruments/', axis: 'R2', lesson: 'Dépréciation fondée sur les pertes de crédit attendues, en trois stades : pertes à 12 mois (stade 1), pertes à maturité après dégradation significative du risque (stade 2) ou défaut (stade 3).', tags: ['credit', 'provision', 'ifrs', 'ecl', 'stage', 'banque', 'impaye', 'deprecation'] },
  { title: 'Principles for the Management of Credit Risk', author: 'Comité de Bâle sur le contrôle bancaire (BCBS)', date: 'septembre 2000', url: 'https://www.bis.org/publ/bcbs75.htm', axis: 'R3', lesson: "Dix-sept principes : environnement de risque approprié, processus d'octroi sain, administration, mesure et suivi du crédit, contrôles adéquats — dont la surveillance des concentrations.", tags: ['credit', 'banque', 'risque', 'engagement', 'contrepartie', 'concentration', 'octroi'] },
  { title: 'Principles for the Management of Credit Risk (révision)', author: 'Comité de Bâle sur le contrôle bancaire (BCBS)', date: '30 avril 2025', url: 'https://www.bis.org/bcbs/publ/d595.htm', axis: 'R3', lesson: "Version révisée et finale des principes de 2000 : environnement du risque, octroi, administration et suivi, contrôles ; les crédits qui se dégradent sont suivis sur une liste de surveillance revue régulièrement par la direction.", tags: ['credit', 'banque', 'risque', 'surveillance', 'watchlist', 'contrepartie', 'suivi', 'degradation'] },
  { title: 'Dispositif prudentiel applicable aux établissements de crédit et aux compagnies financières de l’UMOA', author: 'Conseil des Ministres de l’UMOA / BCEAO (décision n° 013/24/2016/CM/UMOA)', date: '24 juin 2016', url: 'https://www.bceao.int/sites/default/files/2017-11/_annexe_decision_013_24_06_2016-_bceao-dispositif_prudentiel_de_l_umoa-2016-1.pdf', axis: 'R1', lesson: "§ 451-452 : un client ou groupe de clients liés est un « grand risque » dès 10 % des fonds propres de base (T1) ; coefficient maximum de division des risques 25 % du T1 (risques pondérés), atteint en 2022 après 65 % en 2018 (tableau 25).", tags: ['credit', 'bceao', 'umoa', 'uemoa', 'concentration', 'grand risque', 'division des risques', 'fonds propres', 'banque', 'senegal', 'prudentiel'] },
  { title: 'Supervisory framework for measuring and controlling large exposures', author: 'Comité de Bâle sur le contrôle bancaire (BCBS)', date: 'avril 2014', url: 'https://www.bis.org/publ/bcbs283.htm', axis: 'R3', lesson: "L'exposition sur une contrepartie ou un groupe de contreparties liées est plafonnée à 25 % des fonds propres de base (Tier 1) ; elle est déclarée dès 10 %.", tags: ['credit', 'banque', 'concentration', 'grand risque', 'contrepartie', 'groupe', 'limite'] },
  { title: 'Guidance on credit risk and accounting for expected credit losses', author: 'Comité de Bâle sur le contrôle bancaire (BCBS)', date: 'décembre 2015', url: 'https://www.bis.org/bcbs/publ/d350.htm', axis: 'R3', lesson: 'Onze principes de mise en œuvre des pertes attendues : gouvernance, méthodologie, regroupement des expositions, jugement d’expert, information prospective, informations à publier.', tags: ['credit', 'provision', 'ecl', 'ifrs', 'banque', 'supervision'] },
  { title: 'Guidelines on management of non-performing and forborne exposures (EBA/GL/2018/06)', author: 'Autorité bancaire européenne (EBA)', date: 'octobre 2018', url: 'https://www.eba.europa.eu', axis: 'R3', lesson: "Une banque dont le ratio brut de prêts non performants atteint 5 % doit se doter d'une stratégie de réduction des NPE, avec plan opérationnel, gouvernance et suivi.", tags: ['credit', 'npl', 'impaye', 'douteux', 'recouvrement', 'restructuration', 'banque'] },
  { title: 'Instruction n° 026-11-2016 relative à la comptabilisation et à l’évaluation des engagements en souffrance', author: 'BCEAO', date: 'novembre 2016', url: 'https://www.bceao.int', axis: 'R1', lesson: 'Les engagements impayés au-delà de 90 jours (180 jours pour certaines contreparties publiques) sont déclassés en créances douteuses et provisionnés selon leur ancienneté et les garanties.', tags: ['credit', 'bceao', 'umoa', 'douteux', 'impaye', 'provision', 'banque', 'senegal', 'uemoa'] },
  { title: 'Acte uniforme portant organisation des sûretés (révisé)', author: 'OHADA', date: '15 décembre 2010', url: 'https://www.ohada.org', axis: 'R5', lesson: 'Régime des sûretés personnelles et réelles : constitution, rang, opposabilité et réalisation — ce qui fixe la valeur effective d’une garantie.', tags: ['garantie', 'surete', 'hypotheque', 'nantissement', 'credit', 'ohada', 'juridique'] },
  { title: 'Horizontal Merger Guidelines', author: 'U.S. Department of Justice & Federal Trade Commission', date: '19 août 2010', url: 'https://www.justice.gov/atr/horizontal-merger-guidelines-08192010', axis: 'R6', lesson: "Indice de Herfindahl-Hirschman : en dessous de 1 500 (0,15) marché peu concentré, de 1 500 à 2 500 modérément, au-delà de 2 500 (0,25) fortement concentré (seuils abaissés à 1 000 / 1 800 dans les Merger Guidelines de 2023).", tags: ['concentration', 'hhi', 'marche', 'part', 'classement', 'client', 'fournisseur'] },
  { title: 'Quality Control Handbook', author: 'J. M. Juran', date: '1951', axis: 'R4', lesson: 'Principe de Pareto : « peu de causes vitales, beaucoup de causes triviales » — concentrer l’action sur les quelques éléments qui font l’essentiel du total.', tags: ['pareto', 'concentration', 'classement', 'qualite', 'client', 'produit', 'vente', 'stock', 'cause'] },
  { title: 'The Pyramid Principle — Logic in Writing and Thinking', author: 'Barbara Minto', date: '1987', axis: 'R9', lesson: 'Une note de décision commence par sa conclusion, puis groupe les arguments qui la soutiennent, du plus important au plus détaillé.', tags: ['redaction', 'synthese', 'comite', 'note', 'rapport', 'decision'] },
  { title: 'International Business Communication Standards (IBCS)', author: 'IBCS Association', url: 'https://www.ibcs.com', axis: 'R9', lesson: 'Règles « SUCCESS » des rapports de gestion : un message par page, notation unifiée (réel / budget / prévision), échelles cohérentes, pas de décoration inutile.', tags: ['tableau de bord', 'rapport', 'graphique', 'presentation', 'reporting', 'dashboard'] },
  { title: 'The Balanced Scorecard — Measures That Drive Performance', author: 'R. S. Kaplan & D. P. Norton', date: 'Harvard Business Review, janvier–février 1992', axis: 'R4', lesson: 'Piloter par quatre perspectives liées — financière, clients, processus internes, apprentissage — plutôt que par les seuls indicateurs financiers.', tags: ['pilotage', 'performance', 'indicateur', 'kpi', 'strategie', 'management', 'vente', 'rh'] },
  { title: 'ISO/IEC 25012 — Modèle de qualité des données', author: 'ISO / IEC', date: '2008', axis: 'R8', lesson: 'Caractéristiques de qualité d’une donnée : exactitude, complétude, cohérence, crédibilité, actualité — à mesurer avant d’en tirer une conclusion.', tags: ['qualite', 'donnees', 'manquant', 'completude', 'fiabilite'] },
];

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The corpus entries that serve a subject (and the lens in use), best first. */
export function corpusFor(subject: string, lens: 'credit' | 'ranking' | null, max = 8): ResearchNote[] {
  const s = fold(subject);
  const scored = CORPUS.map((e) => {
    let score = e.tags.reduce((a, t) => a + (s.includes(t) ? 2 : 0), 0);
    if (lens === 'credit' && e.tags.includes('credit')) score += 3;
    if (lens && (e.tags.includes('concentration') || e.tags.includes('redaction'))) score += 1;
    if (e.tags.includes('qualite') || e.tags.includes('redaction')) score += 0.5;
    return { e, score };
  })
    .filter((x) => x.score > 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
  return scored.map(({ e }) => ({ title: e.title, author: e.author, date: e.date, url: e.url, lesson: e.lesson, axis: e.axis }));
}

/** What the request is about, for the web search: the request without its delivery words. */
export function researchSubject(request: string, extra: string[] = []): string {
  const t = request
    .replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, ' ')
    .replace(/\b(donne[sz]?|fais|cr[ée]e|g[ée]n[èe]re|produis|pr[ée]pare)[- ]?(moi|nous)?\b/gi, ' ')
    .replace(/\b(un|une|le|la|les|des|du|de|d['’]|dans|le fichier|fichier|attach[ée]e?|excel|word|powerpoint|pptx|docx|xlsx|xlsb|pdf|ultra|design|premium|classeur|rapport|tableau de bord|analysant|analyse[rz]?)\b/gi, ' ')
    .replace(/\S+\.(xlsx|xlsb|xls|csv|pdf|docx|pptx)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [t, ...extra].filter(Boolean).join(' ').slice(0, 160);
}

/** Wikipedia search answer → research notes (title, page, the snippet as lesson — the source's own words). */
export function parseWikipedia(json: unknown, lang = 'fr', max = 4): ResearchNote[] {
  const hits = ((json as { query?: { search?: { title: string; snippet: string }[] } })?.query?.search ?? []).slice(0, max);
  return hits.map((h) => ({
    title: `${h.title} — Wikipédia`,
    author: 'Wikipédia',
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`,
    lesson: h.snippet.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').trim(),
    axis: 'R9',
  }));
}
export const wikipediaSearchUrl = (q: string, lang = 'fr', n = 4) =>
  `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=${n}&srsearch=${encodeURIComponent(q)}`;
