// LA LECTURE D'UN CLASSEMENT, QUEL QU'IL SOIT (pur, sans modèle) — v62 : « l'analyste ne doit pas être figé ». Toute table
// « une entité par ligne » (clients, agences, produits, fournisseurs, collaborateurs, pays…) avec plusieurs mesures se lit
// de la même façon : la concentration de la mesure principale, puis chaque autre mesure RAPPORTÉE à elle (taux), les
// entités qui s'écartent nettement du taux d'ensemble, les plus gros contributeurs. Une LENTILLE MÉTIER reconnue par le
// vocabulaire des colonnes (aujourd'hui le crédit — compétence APEX) remplace cette lecture générale par la sienne.
import { toNumber, type Cell } from '../dataCore';
import { human } from '../dashInsight';
import { creditFacts, creditNarrative, creditNumbers, type CreditNarrative } from './creditFacts';
import { fmtDec, fmtMoney, fmtPct } from './dossier';

type Row = Record<string, unknown>;
const num = (v: unknown) => toNumber((v ?? null) as Cell);
// « Chiffre d’affaires (EUR) » → « chiffre d’affaires (EUR) » (units and acronyms keep their capitals).
const lowerFirst = (s: string) => s.replace(/^\p{Lu}(?=\p{Ll})/u, (c) => c.toLowerCase());
const list = (names: string[], max = 5) => (names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} et ${names.length - max} autre(s)`);
const ID = /\bid\b|identifiant|code|num[ée]ro|\bn°|matricule|compte|account|contrat|contract|r[ée]f|isin|iban|ann[ée]e|year|mois|month|date/i;
const RATE = /%|taux|rate|ratio|part\b|share|pourcent|marge %|score|note/i;

export interface RankingFacts {
  entityCol: string;
  entities: number;
  base: string;
  measures: string[];
  totals: Record<string, number>;
  ranking: { key: string; v: Record<string, number> }[];
  conc: { leader: string; leaderShare: number; top3: number; top5: number; n80: number; hhi: number };
  /** Each secondary measure against the base: overall rate and the entities far above it. */
  links: { measure: string; rate: number; high: string[]; low: string[] }[];
}

/** The generic facts of a ranking table; null when there is no entity or no measure. */
export function rankingFacts(columns: string[], rows: Row[], entityCol: string | null, baseHint: string | null): RankingFacts | null {
  if (!entityCol || rows.length < 3) return null;
  const measures = columns.filter((c) => {
    if (c === entityCol || ID.test(c) || RATE.test(c)) return false;
    let n = 0;
    let k = 0;
    for (const r of rows.slice(0, 200)) {
      const v = r[c];
      if (v === null || v === undefined || v === '') continue;
      n++;
      if (num(v) !== null) k++;
    }
    return n > 0 && k / n >= 0.8;
  });
  if (!measures.length) return null;
  const by = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const k = String(r[entityCol] ?? '').trim();
    if (!k) continue;
    const e = by.get(k) ?? {};
    for (const m of measures) {
      const x = num(r[m]);
      if (x !== null) e[m] = (e[m] ?? 0) + x;
    }
    by.set(k, e);
  }
  const totals: Record<string, number> = {};
  for (const e of by.values()) for (const m of measures) totals[m] = (totals[m] ?? 0) + (e[m] ?? 0);
  const base = baseHint && measures.includes(baseHint) ? baseHint : [...measures].sort((a, b) => Math.abs(totals[b] ?? 0) - Math.abs(totals[a] ?? 0))[0]!;
  const ranking = [...by.entries()].map(([key, v]) => ({ key, v })).sort((a, b) => (b.v[base] ?? 0) - (a.v[base] ?? 0));
  if (ranking.length < 3) return null;
  const T = totals[base] ?? 0;
  const shares = ranking.map((e) => (T ? (e.v[base] ?? 0) / T : 0));
  let acc = 0;
  let n80 = 0;
  shares.forEach((s, i) => {
    acc += s;
    if (!n80 && acc >= 0.8) n80 = i + 1;
  });
  const links = measures
    .filter((m) => m !== base && T && Math.abs(totals[m] ?? 0) > 0)
    .slice(0, 4)
    .map((m) => {
      const rate = (totals[m] ?? 0) / T;
      const per = ranking.filter((e) => (e.v[base] ?? 0) > 0).map((e) => ({ key: e.key, r: (e.v[m] ?? 0) / (e.v[base] ?? 1) }));
      // « Far » = at least 1,5 × the overall rate (and 5 points above it), or half of it at most.
      const high = per.filter((x) => x.r >= Math.max(rate * 1.5, rate + 0.05)).map((x) => x.key);
      const low = rate > 0 ? per.filter((x) => x.r <= rate * 0.5).map((x) => x.key) : [];
      return { measure: m, rate, high, low };
    });
  return {
    entityCol,
    entities: ranking.length,
    base,
    measures,
    totals,
    ranking,
    conc: { leader: ranking[0]!.key, leaderShare: shares[0] ?? 0, top3: shares.slice(0, 3).reduce((a, b) => a + b, 0), top5: shares.slice(0, 5).reduce((a, b) => a + b, 0), n80: n80 || ranking.length, hhi: shares.reduce((a, s) => a + s * s, 0) },
    links,
  };
}

const unitOf = (col: string) => /xof|fcfa/i.test(col) ? 'XOF' : /eur|€/i.test(col) ? 'EUR' : /usd|\$/i.test(col) ? 'USD' : '';
const amount = (n: number | undefined, col: string) => (n === undefined ? '—' : Math.abs(n) >= 1e4 ? fmtMoney(n, unitOf(col)) : fmtDec(n, Number.isInteger(n) ? 0 : 1));

/** The generic written reading of a ranking (any domain). */
export function rankingNarrative(f: RankingFacts): CreditNarrative {
  const B = human(f.base, 40);
  const b = lowerFirst(B);
  const T = f.totals[f.base] ?? 0;
  const top = f.ranking.slice(0, 10);
  const shareOf = (e: { v: Record<string, number> }) => (T ? (e.v[f.base] ?? 0) / T : 0);
  const chapters: Record<string, unknown>[] = [];
  const kpis: Record<string, unknown>[] = [];
  const messages: string[] = [];
  const decisions: string[] = [];
  const nums: number[] = [1.5, 0.5, 5, 0.05];
  const N = (v: number) => (nums.push(v), v);
  for (const l of f.links) for (const x of [l.high, l.low]) if (x.length > 5) N(x.length - 5);
  if (f.conc.n80 > 5) N(f.conc.n80 - 5);
  kpis.push({ label: `${B} total`, value: amount(T, f.base), sub: `${f.entities} ${human(f.entityCol).toLowerCase()}`, tone: 'neutral', method: `SOMME(${f.base})`, num: T });
  kpis.push({ label: 'Part du premier', value: fmtPct(f.conc.leaderShare), sub: f.conc.leader, tone: f.conc.leaderShare >= 0.25 ? 'risk' : 'warn', method: `${f.conc.leader} / total`, num: f.conc.leaderShare });
  kpis.push({ label: 'Part des 5 premiers', value: fmtPct(f.conc.top5), sub: `HHI ${fmtDec(f.conc.hhi, 2)}`, tone: f.conc.top5 >= 0.6 ? 'risk' : 'neutral', method: 'somme des 5 premiers / total', num: f.conc.top5 });
  for (const l of f.links) kpis.push({ label: `${human(l.measure, 30)} / ${b}`, value: fmtPct(l.rate), sub: `${l.high.length} au-dessus de la norme`, tone: l.high.length ? 'warn' : 'neutral', method: `SOMME(${l.measure}) / SOMME(${f.base})`, num: l.rate });
  let cum = 0;
  chapters.push({
    title: `Concentration — ${B}`,
    kpis: [
      { label: `${B} total`, value: amount(T, f.base), sub: `${f.entities} entités`, tone: 'neutral', num: T },
      { label: 'Part du premier', value: fmtPct(f.conc.leaderShare), sub: f.conc.leader, tone: f.conc.leaderShare >= 0.25 ? 'risk' : 'warn', num: f.conc.leaderShare },
      { label: 'Part des 5 premiers', value: fmtPct(f.conc.top5), sub: `${fmtPct(f.conc.top3)} pour les 3 premiers`, tone: f.conc.top5 >= 0.6 ? 'risk' : 'neutral', num: f.conc.top5 },
      { label: 'Entités pour 80 %', value: String(f.conc.n80), sub: `sur ${f.entities}`, tone: 'neutral', num: f.conc.n80 },
    ],
    headline: `${f.conc.leader} porte ${fmtPct(f.conc.leaderShare)} ; les 5 premiers ${fmtPct(f.conc.top5)}`,
    constats: [
      `${f.entities} entités pour ${amount(T, f.base)} de ${b} ; ${f.conc.leader} en porte ${fmtPct(f.conc.leaderShare)}.`,
      `Les 3 premiers portent ${fmtPct(f.conc.top3)}, les 5 premiers ${fmtPct(f.conc.top5)} ; ${f.conc.n80} entité(s) font les quatre cinquièmes du total.`,
      `Indice de Herfindahl ${fmtDec(f.conc.hhi, 3)} — l'ensemble se comporte comme ${fmtDec(N(f.conc.hhi ? 1 / f.conc.hhi : 0), 1)} entités de même poids.`,
    ],
    analyse: [f.conc.top5 >= 0.5 ? `Le résultat dépend d'une poignée d'entités : leur suivi doit être nominatif et leur perte éventuelle anticipée.` : `Le total est réparti : aucune entité ne déplace seule le résultat ; le pilotage peut rester global.`],
    cadre: [],
    cas: [],
    figures: [{ kind: 'bar3d', title: `${B} — ${top.length} premiers`, categories: top.map((e) => e.key.slice(0, 28)), series: [{ name: B, values: top.map((e) => Math.round(e.v[f.base] ?? 0)) }], lecture: `${f.conc.n80} entité(s) font les quatre cinquièmes du total.` }],
    tables: [{ title: `${top.length} premiers`, head: ['Rang', human(f.entityCol), B, 'Part', 'Cumul'], rows: top.map((e, i) => { cum = N(cum + shareOf(e)); return [String(i + 1), e.key, amount(e.v[f.base], f.base), fmtPct(shareOf(e)), fmtPct(cum)]; }) }],
    recommandations: [{ priority: f.conc.top5 >= 0.5 ? 'P1' : 'P2', title: `Suivi nominatif des ${f.conc.n80} premières entités`, action: `Fiche de suivi pour ${list(f.ranking.slice(0, Math.min(5, f.conc.n80)).map((e) => e.key))}${f.conc.n80 > 5 ? '…' : ''} : tendance, risques, plan d'action.`, owner: 'Responsable du périmètre', due: 'Sous 3 mois', kpi: `${f.conc.n80} fiches validées` }],
    lecture: `${f.conc.leader} et les premiers font l'essentiel : c'est là que la décision pèse.`,
  });
  messages.push(`${f.conc.leader} porte ${fmtPct(f.conc.leaderShare)} du ${b} et les 5 premiers ${fmtPct(f.conc.top5)}.`);
  for (const l of f.links) {
    const M = human(l.measure, 40);
    const byM = [...f.ranking].sort((a, c) => (c.v[l.measure] ?? 0) - (a.v[l.measure] ?? 0)).slice(0, 10);
    chapters.push({
      title: `${M} rapporté à ${b}`,
      kpis: [
        { label: M, value: amount(f.totals[l.measure], l.measure), sub: 'total', tone: 'neutral', num: f.totals[l.measure] },
        { label: `Norme (${lowerFirst(M)} / ${b})`, value: fmtPct(l.rate), sub: 'taux d’ensemble', tone: 'neutral', num: l.rate },
        { label: 'Au-dessus de la norme', value: String(l.high.length), sub: 'au moins 1,5 fois le taux', tone: l.high.length ? 'warn' : 'ok', num: l.high.length },
        { label: 'Sous la moitié', value: String(l.low.length), sub: 'du taux d’ensemble', tone: 'neutral', num: l.low.length },
      ],
      headline: `${M} : ${fmtPct(l.rate)} du ${b} ; ${l.high.length} entité(s) nettement au-dessus`,
      constats: [
        `${M} : ${amount(f.totals[l.measure], l.measure)}, soit ${fmtPct(l.rate)} du ${b} total.`,
        l.high.length ? `${l.high.length} entité(s) dépassent 1,5 fois ce taux : ${list(l.high)}.` : 'Aucune entité ne dépasse 1,5 fois ce taux.',
        l.low.length ? `${l.low.length} entité(s) sont à moins de la moitié du taux : ${list(l.low)}.` : '',
        byM.length ? `Plus gros contributeurs : ${list(byM.slice(0, 3).map((e) => `${e.key} (${amount(e.v[l.measure], l.measure)})`), 3)}.` : '',
      ].filter(Boolean),
      analyse: [`Le rapport ${lowerFirst(M)} / ${b} sépare les entités qui « consomment » plus que leur poids de celles qui consomment moins : les écarts à la norme sont la liste de travail.`],
      cadre: [],
      cas: [],
      figures: [{ kind: 'col3d', title: `${B} et ${lowerFirst(M)} — ${top.length} premiers`, categories: top.map((e) => e.key.slice(0, 22)), series: [{ name: B, values: top.map((e) => Math.round(e.v[f.base] ?? 0)) }, { name: M, values: top.map((e) => Math.round(e.v[l.measure] ?? 0)) }] }],
      tables: [],
      recommandations: l.high.length ? [{ priority: 'P2', title: `Expliquer les écarts de ${lowerFirst(M)}`, action: `Analyser ${list(l.high)} : cause de l'écart à la norme (${fmtPct(l.rate)}), mesure corrective.`, owner: 'Responsable du périmètre', due: 'Prochain point', kpi: `Écarts expliqués : ${l.high.length}/${l.high.length}` }] : [],
      lecture: `norme ${fmtPct(l.rate)} ; ${l.high.length} au-dessus.`,
    });
    messages.push(`${M} : ${fmtPct(l.rate)} du ${b} ; ${l.high.length} entité(s) nettement au-dessus de la norme.`);
    if (l.high.length) decisions.push(`Faire expliquer les écarts de ${lowerFirst(M)} des ${l.high.length} entité(s) au-dessus de la norme.`);
  }
  decisions.unshift(`Mettre sous suivi nominatif les ${f.conc.n80} entités qui font 80 % du ${b}.`);
  const thesis = `${f.entities} entités portent ${amount(T, f.base)} de ${b} ; ${f.conc.leader} en porte ${fmtPct(f.conc.leaderShare)} et les 5 premiers ${fmtPct(f.conc.top5)}.${f.links.length ? ` ${f.links.map((l) => `${human(l.measure, 30)} : ${fmtPct(l.rate)} du ${b} (${l.high.length} écart(s) marqué(s))`).join(' ; ')}.` : ''} Le suivi se joue sur les ${f.conc.n80} premiers noms.`;
  return {
    thesis,
    messages,
    chapters,
    kpis,
    decisions,
    hypotheses: [
      { title: 'Périmètre', text: `Les ${f.entities} entités du tableau, agrégées par « ${f.entityCol} » ; les parts portent sur ce total.` },
      { title: 'Mesure principale', text: `« ${f.base} » ; les autres mesures lui sont rapportées.` },
      { title: 'Écart à la norme', text: 'Au-dessus : au moins 1,5 fois le taux d’ensemble (et 5 points de plus) ; en dessous : la moitié au plus.' },
    ],
    glossary: [{ term: 'HHI', def: 'Somme des parts au carré : 1 = une seule entité.' }, { term: 'n80', def: 'Entités nécessaires pour 80 % du total.' }],
    numbers: nums,
  };
}
function rankingNumbers(f: RankingFacts): number[] {
  const out = [f.entities, f.conc.leaderShare, f.conc.top3, f.conc.top5, f.conc.n80, f.conc.hhi, ...Object.values(f.totals), ...f.links.flatMap((l) => [l.rate, l.high.length, l.low.length])];
  for (const e of f.ranking.slice(0, 20)) out.push(...Object.values(e.v));
  return out.filter((x) => Number.isFinite(x));
}

export interface Lens {
  kind: 'credit' | 'ranking';
  label: string;
  narrative: CreditNarrative;
  numbers: number[];
}
/** The best reading of a table: the business lens its vocabulary calls for (credit), else the generic ranking reading. */
export function lensOf(columns: string[], rows: Row[], entity: string | null, measure: string | null): Lens | null {
  const c = creditFacts(columns, rows, entity);
  if (c) {
    const unit = Object.values(c.roles).some((col) => /xof|fcfa|local currency/i.test(col ?? '')) ? 'XOF' : '';
    const n = creditNarrative(c, unit);
    return { kind: 'credit', label: 'lecture crédit (compétence APEX)', narrative: n, numbers: [...creditNumbers(c), ...n.numbers] };
  }
  const r = rankingFacts(columns, rows, entity, measure);
  if (r) {
    const n = rankingNarrative(r);
    return { kind: 'ranking', label: 'lecture d’un classement', narrative: n, numbers: [...rankingNumbers(r), ...n.numbers] };
  }
  return null;
}
