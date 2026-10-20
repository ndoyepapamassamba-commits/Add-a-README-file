// WHAT TO SAY FIRST — the reporting agent adapts to the situation instead of filling a fixed template: the domain of the
// data, the audience of the request and the fact that should open the narrative are judged quickly (JEV typed
// judgments when a key is configured, local heuristics otherwise), then the sections are proposed from them. The
// model receives a few lines, not a method to re-derive: fewer tokens, no drift.
import type { Brief } from './reportBrief';
import type { JevQuestion } from '../jev/provider';

export type Domain = 'finance' | 'risque' | 'ventes' | 'rh' | 'operations' | 'autre';
export type Audience = 'direction' | 'comite' | 'operationnel' | 'externe';
export type Lead = 'concentration' | 'tendance' | 'anomalies' | 'qualite' | 'repartition';
export interface ReportHints {
  domain: Domain;
  audience: Audience;
  lead: Lead;
  sections: string[];
  source: 'jev' | 'heuristique';
}

const DOMAIN_RX: [Domain, RegExp][] = [
  ['risque', /impay|pdo|npl|ecl|provision|douteu|stage|classe|frr|bceao|ifrs|garantie|s[uû]ret/i],
  ['finance', /encours|solde|balance|bilan|compte|tr[ée]sorerie|budget|charge|produit net|marge|cr[ée]dit|pr[eê]t|d[ée]p[oô]t/i],
  ['ventes', /vente|sales|chiffre|\bca\b|commande|order|client|customer|produit|product|prix|price|panier/i],
  ['rh', /salari|employ|effectif|poste|recrut|absence|cong[ée]|formation|matricule|anciennet/i],
  ['operations', /ticket|incident|d[ée]lai|stock|livraison|sla|panne|maintenance|production|qualit/i],
];
export function domainOf(columns: string[]): Domain {
  const text = columns.join(' ');
  let best: Domain = 'autre';
  let bestN = 0;
  for (const [d, rx] of DOMAIN_RX) {
    const n = columns.filter((c) => rx.test(c)).length;
    if (n > bestN) {
      best = d;
      bestN = n;
    }
  }
  return bestN || /xof|eur|usd/i.test(text) ? best : 'autre';
}
export function audienceOf(focus: string): Audience {
  if (/comit[ée]|board|conseil/i.test(focus)) return 'comite';
  if (/direction|comex|dg\b|executive|dirigeant|pr[ée]sident/i.test(focus)) return 'direction';
  if (/client|externe|partenaire|r[ée]gulateur|bceao|audit/i.test(focus)) return 'externe';
  return 'operationnel';
}
/** The fact that should open the story, from the brief itself. */
export function leadOf(b: Brief): Lead {
  const d0 = b.dims[0];
  if (b.anomalies.length >= 3) return 'anomalies';
  if (b.trend?.delta !== null && b.trend?.delta !== undefined && Math.abs(b.trend.delta) >= 0.15) return 'tendance';
  if (d0 && d0.top3Share >= 0.6) return 'concentration';
  if (b.quality.some((q) => q.missingPct >= 0.3)) return 'qualite';
  return 'repartition';
}
const SECTIONS: Record<Audience, string[]> = {
  direction: ['Synthèse (3 constats chiffrés)', 'Fait saillant', 'Analyse par dimension', 'Risques et anomalies', 'Décisions proposées (datées, responsables)'],
  comite: ['Chiffres clés', 'Constats', 'Analyse', 'Points de vigilance', 'Recommandations et suivi'],
  operationnel: ['Chiffres clés', 'Détail par dimension', 'Anomalies à traiter (liste)', 'Qualité des données', 'Actions'],
  externe: ['Périmètre et méthode', 'Chiffres clés', 'Constats', 'Limites', 'Annexes'],
};
const LEAD_TEXT: Record<Lead, string> = {
  concentration: 'ouvrir sur la concentration (qui porte le total)',
  tendance: 'ouvrir sur la variation de la dernière période',
  anomalies: 'ouvrir sur les anomalies détectées',
  qualite: 'ouvrir sur la qualité des données (chiffres à prendre avec réserve)',
  repartition: 'ouvrir sur la répartition de la mesure principale',
};
export function hintsLocal(b: Brief, columns: string[], focus = ''): ReportHints {
  const domain = domainOf(columns);
  const audience = audienceOf(focus);
  const lead = leadOf(b);
  return { domain, audience, lead, sections: SECTIONS[audience], source: 'heuristique' };
}
/** The JEV questions (typed, cheap) that replace a long reasoning turn of the model. */
export function hintQuestions(): Record<string, JevQuestion> {
  return {
    domain: { type: 'choice', instructions: 'What business domain do the `columns` of this table belong to?', criteria: { finance: 'balances, accounts, treasury, budget, loans', risque: 'arrears, provisions, doubtful loans, IFRS 9 stages, guarantees', ventes: 'sales, orders, customers, products, prices', rh: 'employees, positions, payroll, absences', operations: 'tickets, incidents, delays, stock, deliveries', autre: 'none of these' } },
    audience: { type: 'choice', instructions: 'Who is the `request` written for?', criteria: { direction: 'top management, executive committee', comite: 'a committee or a board', operationnel: 'the operational team doing the work', externe: 'a client, a regulator, an auditor, a partner' } },
    lead: { type: 'choice', instructions: 'Given `facts`, which finding should open the narrative for this `request`?', criteria: { concentration: 'a few categories carry most of the measure', tendance: 'the last period moved a lot', anomalies: 'several anomalies were detected', qualite: 'missing or unreliable data limits the reading', repartition: 'the plain distribution of the measure' } },
  };
}
export function hintsFromAnswers(a: Record<string, { choice?: string; confidence?: number }>, local: ReportHints): ReportHints {
  const pick = <T extends string>(k: string, allowed: T[], fallback: T): T => {
    const c = a[k];
    return c?.choice && (c.confidence ?? 0) >= 0.45 && allowed.includes(c.choice as T) ? (c.choice as T) : fallback;
  };
  const domain = pick<Domain>('domain', ['finance', 'risque', 'ventes', 'rh', 'operations', 'autre'], local.domain);
  const audience = pick<Audience>('audience', ['direction', 'comite', 'operationnel', 'externe'], local.audience);
  const lead = pick<Lead>('lead', ['concentration', 'tendance', 'anomalies', 'qualite', 'repartition'], local.lead);
  return { domain, audience, lead, sections: SECTIONS[audience], source: 'jev' };
}
export function hintsText(h: ReportHints): string {
  return `Lecture conseillée (${h.source === 'jev' ? 'JEV' : 'heuristique locale'}) : domaine ${h.domain}, audience ${h.audience} → ${LEAD_TEXT[h.lead]}. Sections : ${h.sections.join(' · ')}. Adaptez : si la demande vise autre chose, changez de mesure, de dimensions ou de filtres (report.analyse à nouveau) plutôt que de remplir ce plan.`;
}
