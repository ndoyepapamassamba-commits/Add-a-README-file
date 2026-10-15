// L'ANALYSE D'UN CLASSEMENT DE CONTREPARTIES (pur, sans modèle, 0 $) — v62 : le classeur « Top 20 Local Corporate » n'avait
// qu'un chapitre « qualité des données ». Un tableau « une contrepartie par ligne » (ou par code client) avec encours,
// impayés, provisions, garanties, limites se lit comme un analyste crédit le lit : concentration, impayés, couverture par
// les provisions, couverture par les garanties, utilisation des limites — chaque phrase portée par un chiffre exact du
// tableau, chaque seuil dit dans les hypothèses. Aucune conclusion d'insuffisance de provision (il faudrait PD / LGD /
// stage) : les écarts sont des points « à revoir ».
import { toNumber, type Cell } from '../dataCore';
import { columnConcepts } from '../dataLexicon';
import { fmtDec, fmtInt, fmtMoney, fmtPct } from './dossier';

export type CreditRole = 'outstanding' | 'exposure' | 'arrears' | 'provision' | 'regProvision' | 'collateral' | 'limit' | 'facilities';
export interface CreditEntity {
  key: string;
  v: Partial<Record<CreditRole, number>>;
}
export interface CreditFacts {
  entityCol: string;
  entities: number;
  roles: Partial<Record<CreditRole, string>>;
  totals: Partial<Record<CreditRole, number>>;
  /** Every entity, sorted by the base measure (outstanding, else exposure), descending. */
  ranking: CreditEntity[];
  base: 'outstanding' | 'exposure';
  conc: { leader: string; leaderShare: number; top3: number; top5: number; top10: number; n50: number; n80: number; hhi: number };
  ratios: { arrearsRate?: number; provToOut?: number; provToArrears?: number; collToOut?: number; collToArrears?: number; utilisation?: number };
  /** Entities flagged by the thresholds below (names, in ranking order). */
  flags: { withArrears: string[]; highArrears: string[]; lowCoverage: string[]; uncovered: string[]; noCollateral: string[]; overLimit: string[]; nearLimit: string[] };
  thresholds: typeof THRESHOLDS;
}
/** The thresholds the analysis applies (stated in the hypotheses, never hidden). */
export const THRESHOLDS = { highArrears: 0.5, lowCoverage: 0.2, nearLimit: 0.9 } as const;

type Row = Record<string, unknown>;
const num = (v: unknown) => toNumber((v ?? null) as Cell);

/** Which numeric column plays which credit role (business words of the APEX credit-risk skill). */
export function creditRoles(columns: string[], rows: Row[]): Partial<Record<CreditRole, string>> {
  const numeric = columns.filter((c) => {
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
  const roles: Partial<Record<CreditRole, string>> = {};
  const pick = (role: CreditRole, test: (c: Set<string>, col: string) => boolean, prefer?: RegExp) => {
    const cands = numeric.filter((col) => !Object.values(roles).includes(col) && test(columnConcepts(col), col));
    if (!cands.length) return;
    roles[role] = (prefer && cands.find((c) => prefer.test(c))) || cands[0]!;
  };
  const isCode = (c: Set<string>) => c.has('code') && !c.has('amount');
  pick('arrears', (c) => c.has('arrears') && !c.has('date') && !c.has('outstanding') && !isCode(c), /amount|montant|pdo/i);
  pick('outstanding', (c) => c.has('outstanding') && !c.has('date') && !isCode(c), /total|including|brut|gross/i);
  pick('exposure', (c) => c.has('exposure') && !c.has('date'), /net/i);
  pick('regProvision', (c) => c.has('provision') && c.has('regulatory'));
  pick('provision', (c) => c.has('provision') && !c.has('regulatory'), /ifrs/i);
  pick('collateral', (c) => c.has('collateral') && !isCode(c), /valu|valeur|montant|amount/i);
  pick('limit', (c) => c.has('limit') && !c.has('date'));
  pick('facilities', (c, col) => c.has('count') || /^nb\b|nombre/i.test(col));
  return roles;
}

/** The credit facts of a table, aggregated by entity; null when the table is not a counterparty table. */
export function creditFacts(columns: string[], rows: Row[], entityCol: string | null): CreditFacts | null {
  if (!entityCol || rows.length < 3) return null;
  const roles = creditRoles(columns, rows);
  const base: 'outstanding' | 'exposure' | null = roles.outstanding ? 'outstanding' : roles.exposure ? 'exposure' : null;
  if (!base) return null;
  const others = (['arrears', 'provision', 'collateral', 'limit'] as CreditRole[]).filter((r) => roles[r]);
  if (!others.length) return null;
  const by = new Map<string, CreditEntity>();
  for (const r of rows) {
    const k = String(r[entityCol] ?? '').trim();
    if (!k) continue;
    const e = by.get(k) ?? { key: k, v: {} };
    for (const [role, col] of Object.entries(roles) as [CreditRole, string][]) {
      const x = num(r[col]);
      if (x !== null) e.v[role] = (e.v[role] ?? 0) + x;
    }
    by.set(k, e);
  }
  const ranking = [...by.values()].sort((a, b) => (b.v[base] ?? 0) - (a.v[base] ?? 0));
  if (ranking.length < 3) return null;
  const totals: Partial<Record<CreditRole, number>> = {};
  for (const e of ranking) for (const [role, x] of Object.entries(e.v) as [CreditRole, number][]) totals[role] = (totals[role] ?? 0) + x;
  const T = totals[base] ?? 0;
  const shares = ranking.map((e) => (T ? (e.v[base] ?? 0) / T : 0));
  const cum = (n: number) => shares.slice(0, n).reduce((a, b) => a + b, 0);
  let acc = 0;
  let n50 = 0;
  let n80 = 0;
  shares.forEach((s, i) => {
    acc += s;
    if (!n50 && acc >= 0.5) n50 = i + 1;
    if (!n80 && acc >= 0.8) n80 = i + 1;
  });
  const ratio = (a?: number, b?: number) => (a !== undefined && b ? a / b : undefined);
  const out = totals[base];
  const ratios = {
    arrearsRate: ratio(totals.arrears, out),
    provToOut: ratio(totals.provision, out),
    provToArrears: ratio(totals.provision, totals.arrears),
    collToOut: ratio(totals.collateral, out),
    collToArrears: ratio(totals.collateral, totals.arrears),
    utilisation: ratio(out, totals.limit),
  };
  const flags = { withArrears: [] as string[], highArrears: [] as string[], lowCoverage: [] as string[], uncovered: [] as string[], noCollateral: [] as string[], overLimit: [] as string[], nearLimit: [] as string[] };
  for (const e of ranking) {
    const o = e.v[base] ?? 0;
    const a = e.v.arrears ?? 0;
    if (roles.arrears && a > 0) {
      flags.withArrears.push(e.key);
      if (o > 0 && a / o >= THRESHOLDS.highArrears) flags.highArrears.push(e.key);
      if (roles.provision && (e.v.provision ?? 0) / a < THRESHOLDS.lowCoverage) flags.lowCoverage.push(e.key);
      if (roles.collateral && (e.v.collateral ?? 0) < a) flags.uncovered.push(e.key);
    }
    if (roles.collateral && (e.v.collateral ?? 0) <= 0 && o > 0) flags.noCollateral.push(e.key);
    if (roles.limit && (e.v.limit ?? 0) > 0) {
      const u = o / (e.v.limit ?? 1);
      if (u > 1.0001) flags.overLimit.push(e.key);
      else if (u >= THRESHOLDS.nearLimit) flags.nearLimit.push(e.key);
    }
  }
  return {
    entityCol,
    entities: ranking.length,
    roles,
    totals,
    ranking,
    base,
    conc: { leader: ranking[0]!.key, leaderShare: shares[0] ?? 0, top3: cum(3), top5: cum(5), top10: cum(10), n50: n50 || ranking.length, n80: n80 || ranking.length, hhi: shares.reduce((a, s) => a + s * s, 0) },
    ratios,
    flags,
    thresholds: THRESHOLDS,
  };
}

/** Every number the credit facts state (for the narrative check). */
export function creditNumbers(f: CreditFacts): number[] {
  const out: number[] = [f.entities, f.conc.leaderShare, f.conc.top3, f.conc.top5, f.conc.top10, f.conc.n50, f.conc.n80, f.conc.hhi];
  for (const v of Object.values(f.totals)) if (v !== undefined) out.push(v);
  for (const v of Object.values(f.ratios)) if (v !== undefined) out.push(v);
  for (const e of f.ranking.slice(0, 20)) for (const v of Object.values(e.v)) if (v !== undefined) out.push(v);
  for (const l of Object.values(f.flags)) out.push(l.length);
  return out.filter((x) => Number.isFinite(x));
}

// ── the written analysis (French, every sentence carries its figure) ───────────────────────────────────────────────
const money = (n: number | undefined, unit: string) => (n === undefined ? '—' : fmtMoney(n, unit));
const list = (names: string[], max = 5) => (names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} et ${names.length - max} autre(s)`);
const sumOf = (f: CreditFacts, names: string[], role: CreditRole) => f.ranking.filter((e) => names.includes(e.key)).reduce((a, e) => a + (e.v[role] ?? 0), 0);
const hhiReading = (h: number) => (h >= 0.25 ? 'concentration forte (HHI ≥ 0,25)' : h >= 0.15 ? 'concentration modérée (HHI entre 0,15 et 0,25)' : 'concentration faible (HHI < 0,15)');

export interface CreditNarrative {
  thesis: string;
  messages: string[];
  chapters: Record<string, unknown>[];
  kpis: Record<string, unknown>[];
  decisions: string[];
  hypotheses: { title: string; text: string }[];
  glossary: { term: string; def: string }[];
  /** Every figure the text derives (sums of a list, ratios, thresholds): the anti-invention check knows them. */
  numbers: number[];
}

/** The committee narrative of the credit facts: chapters, KPIs, messages, decisions, hypotheses — all from the table. */
export function creditNarrative(f: CreditFacts, unit = 'XOF'): CreditNarrative {
  const B = f.base === 'outstanding' ? 'encours' : 'exposition';
  const T = f.totals[f.base] ?? 0;
  const top = f.ranking.slice(0, 10);
  const share = (e: CreditEntity) => (T ? (e.v[f.base] ?? 0) / T : 0);
  const chapters: Record<string, unknown>[] = [];
  const kpis: Record<string, unknown>[] = [];
  const messages: string[] = [];
  const decisions: string[] = [];
  const K = (label: string, value: string, sub: string, tone: string, method: string, n?: number) => kpis.push({ label, value, sub, tone, method, num: n });
  // The thresholds quoted in the text are analysis rules (documented in the hypotheses), not data.
  const nums: number[] = [...Object.values(THRESHOLDS), 0.15, 0.25, 1];
  const N = (v: number) => (nums.push(v), v);
  // « … et 13 autre(s) » : the remainder of a long list is a figure of the text too.
  for (const l of Object.values(f.flags)) if (l.length > 5) N(l.length - 5);

  // KPIs — the same in the cockpit, the deck and the report.
  K(`${B[0]!.toUpperCase()}${B.slice(1)} total`, money(T, unit), `${f.entities} contreparties`, 'neutral', `SOMME(${f.roles[f.base]})`, T);
  K('Part du premier', fmtPct(f.conc.leaderShare), f.conc.leader, f.conc.leaderShare >= 0.25 ? 'risk' : f.conc.leaderShare >= 0.1 ? 'warn' : 'ok', `${f.conc.leader} / total`, f.conc.leaderShare);
  K('Part des 5 premiers', fmtPct(f.conc.top5), `HHI ${fmtDec(f.conc.hhi, 2)}`, f.conc.top5 >= 0.6 ? 'risk' : 'warn', 'somme des 5 premiers / total', f.conc.top5);
  if (f.ratios.arrearsRate !== undefined) K("Taux d'impayés", fmtPct(f.ratios.arrearsRate), money(f.totals.arrears, unit), f.ratios.arrearsRate >= 0.1 ? 'risk' : f.ratios.arrearsRate >= 0.03 ? 'warn' : 'ok', `SOMME(${f.roles.arrears}) / SOMME(${f.roles[f.base]})`, f.ratios.arrearsRate);
  if (f.ratios.provToArrears !== undefined) K('Couverture des impayés', fmtPct(f.ratios.provToArrears), 'par les provisions', f.ratios.provToArrears < 0.5 ? 'warn' : 'ok', `SOMME(${f.roles.provision}) / SOMME(${f.roles.arrears})`, f.ratios.provToArrears);
  else if (f.ratios.provToOut !== undefined) K('Taux de provisionnement', fmtPct(f.ratios.provToOut), money(f.totals.provision, unit), 'neutral', `SOMME(${f.roles.provision}) / SOMME(${f.roles[f.base]})`, f.ratios.provToOut);
  if (f.ratios.collToOut !== undefined) K('Couverture par garanties', fmtPct(f.ratios.collToOut), money(f.totals.collateral, unit), f.ratios.collToOut < 0.5 ? 'warn' : 'ok', `SOMME(${f.roles.collateral}) / SOMME(${f.roles[f.base]})`, f.ratios.collToOut);
  if (f.ratios.utilisation !== undefined) K('Utilisation des limites', fmtPct(f.ratios.utilisation), `${f.flags.overLimit.length} dépassement(s)`, f.flags.overLimit.length ? 'warn' : 'ok', `SOMME(${f.roles[f.base]}) / SOMME(${f.roles.limit})`, f.ratios.utilisation);
  if (f.totals.facilities !== undefined) K('Facilités', fmtInt(f.totals.facilities), `${fmtDec(N(f.totals.facilities / f.entities), 1)} par contrepartie`, 'neutral', `SOMME(${f.roles.facilities})`, f.totals.facilities);

  // 1. CONCENTRATION.
  let cum = 0;
  const concRows = top.map((e, i) => {
    cum = N(cum + share(e));
    return [String(i + 1), e.key, money(e.v[f.base], unit), fmtPct(share(e)), fmtPct(cum)];
  });
  chapters.push({
    title: `Concentration de l'${B}`,
    headline: `${f.conc.leader} porte ${fmtPct(f.conc.leaderShare)} de l'${B} ; les 5 premiers ${fmtPct(f.conc.top5)}`,
    constats: [
      `${f.entities} contreparties portent ${money(T, unit)} d'${B} ; la première, ${f.conc.leader}, en porte ${money(f.ranking[0]!.v[f.base], unit)} soit ${fmtPct(f.conc.leaderShare)}.`,
      `Les 3 premières portent ${fmtPct(f.conc.top3)}, les 5 premières ${fmtPct(f.conc.top5)}${f.entities > 10 ? `, les 10 premières ${fmtPct(f.conc.top10)}` : ''}.`,
      `${f.conc.n50} contrepartie(s) suffisent pour la moitié de l'${B} et ${f.conc.n80} pour les quatre cinquièmes ; indice de Herfindahl ${fmtDec(f.conc.hhi, 3)} : ${hhiReading(f.conc.hhi)}.`,
    ],
    analyse: [
      f.conc.top5 >= 0.5
        ? `Le risque de ce périmètre se joue sur une poignée de noms : la défaillance d'une seule des ${Math.min(5, f.entities)} premières contreparties déplacerait l'${B} de ${fmtPct(N(Math.min(...f.ranking.slice(0, 5).map(share))))} à ${fmtPct(f.conc.leaderShare)} d'un coup. Le suivi doit être nominatif, contrepartie par contrepartie.`
        : `L'${B} est réparti sur un nombre suffisant de contreparties pour qu'aucune ne déplace seule le profil de risque ; le suivi peut rester statistique.`,
      `Lecture du HHI : 1 / HHI = ${fmtDec(N(f.conc.hhi ? 1 / f.conc.hhi : 0), 1)} contreparties « équivalentes » — le portefeuille se comporte comme s'il en comptait ce nombre, de même poids.`,
    ],
    cadre: ['Division des risques (dispositif prudentiel UMOA) : le suivi des grands risques porte sur les expositions rapportées aux fonds propres — à rapprocher de ces montants.'],
    cas: [],
    figures: [{ kind: 'bar3d', title: `${B[0]!.toUpperCase()}${B.slice(1)} par contrepartie — ${Math.min(10, f.entities)} premières`, categories: top.map((e) => e.key.slice(0, 28)), series: [{ name: B, values: top.map((e) => Math.round(e.v[f.base] ?? 0)) }], unit, lecture: `${f.conc.leader} porte ${fmtPct(f.conc.leaderShare)} ; ${f.conc.n80} contrepartie(s) font les quatre cinquièmes.` }],
    tables: [{ title: `Les ${top.length} premières contreparties`, head: ['Rang', 'Contrepartie', B, 'Part', 'Part cumulée'], rows: concRows, lecture: `la part cumulée atteint ${fmtPct(cum)} avec ${top.length} noms.` }],
    recommandations: [
      { priority: f.conc.top5 >= 0.5 ? 'P1' : 'P2', title: 'Fixer une limite de concentration par contrepartie', action: `Proposer au comité un plafond de part d'${B} par contrepartie et par groupe, appliqué d'abord aux ${Math.min(5, f.entities)} premières (${list(f.ranking.slice(0, 5).map((e) => e.key))}).`, owner: 'Direction des risques', due: 'Prochain comité', kpi: `Part du premier ≤ plafond voté (aujourd'hui ${fmtPct(f.conc.leaderShare)})` },
      { priority: 'P2', title: `Revue nominative des ${f.conc.n80} contreparties qui font 80 % de l'${B}`, action: 'Fiche de revue par contrepartie : situation financière, impayés, garanties, perspective ; décision maintien / plan d’actions / sortie.', owner: 'Engagements', due: 'Sous 3 mois', kpi: `${f.conc.n80} fiches de revue validées` },
    ],
    lecture: `${f.conc.n80} contrepartie(s) sur ${f.entities} font les quatre cinquièmes de l'${B} : c'est là que se décide le risque.`,
  });
  messages.push(`${f.conc.leader} porte ${fmtPct(f.conc.leaderShare)} de l'${B} et les 5 premiers ${fmtPct(f.conc.top5)} (${money(T, unit)} au total).`);
  decisions.push(`Fixer un plafond de concentration par contrepartie (le premier porte aujourd'hui ${fmtPct(f.conc.leaderShare)} de l'${B}).`);

  // 2. IMPAYÉS.
  if (f.roles.arrears && f.totals.arrears !== undefined) {
    const A = f.totals.arrears;
    const byArrears = [...f.ranking].filter((e) => (e.v.arrears ?? 0) > 0).sort((a, b) => (b.v.arrears ?? 0) - (a.v.arrears ?? 0));
    const top3A = N(byArrears.slice(0, 3).reduce((s, e) => s + (e.v.arrears ?? 0), 0));
    N(A ? top3A / A : 0);
    const highOut = N(sumOf(f, f.flags.highArrears, f.base));
    const highA = N(sumOf(f, f.flags.highArrears, 'arrears'));
    chapters.push({
      title: 'Impayés et dégradation',
      headline: `${money(A, unit)} d'impayés, soit ${fmtPct(f.ratios.arrearsRate ?? 0)} de l'${B} ; ${f.flags.highArrears.length} contrepartie(s) en impayé sur plus de la moitié de leur ${B}`,
      constats: [
        `${f.flags.withArrears.length} contrepartie(s) sur ${f.entities} présentent des impayés, pour ${money(A, unit)} — ${fmtPct(f.ratios.arrearsRate ?? 0)} de l'${B}.`,
        byArrears.length ? `Les 3 plus gros impayés (${list(byArrears.slice(0, 3).map((e) => e.key), 3)}) font ${money(top3A, unit)}, soit ${fmtPct(A ? top3A / A : 0)} des impayés.` : '',
        f.flags.highArrears.length ? `${f.flags.highArrears.length} contrepartie(s) ont des impayés égaux à au moins ${fmtPct(THRESHOLDS.highArrears, 0)} de leur ${B} : ${list(f.flags.highArrears)} — ${money(highA, unit)} d'impayés sur ${money(highOut, unit)} d'${B}.` : `Aucune contrepartie n'a des impayés au-delà de ${fmtPct(THRESHOLDS.highArrears, 0)} de son ${B}.`,
      ].filter(Boolean),
      analyse: [
        (f.ratios.arrearsRate ?? 0) >= 0.1
          ? `Un taux d'impayés de ${fmtPct(f.ratios.arrearsRate ?? 0)} signale un portefeuille déjà dégradé : à ce niveau, les impayés ne sont plus des retards ponctuels mais des créances en difficulté qu'il faut traiter dossier par dossier (protocole, restructuration ou recouvrement).`
          : `Un taux d'impayés de ${fmtPct(f.ratios.arrearsRate ?? 0)} reste contenu ; le point d'attention est la concentration des impayés sur quelques noms.`,
        f.flags.highArrears.length ? `Les contreparties dont les impayés dépassent la moitié de l'${B} sont, en lecture prudentielle, à examiner pour un déclassement (classes douteuses BCEAO, stage 3 IFRS 9) si ce n'est déjà fait — le fichier ne donne pas leur classe ici.` : '',
      ].filter(Boolean),
      cadre: ['Instruction BCEAO 026-11-2016 : une créance impayée depuis plus de 90 jours (180 pour certaines contreparties publiques) est déclassée en douteuse ; IFRS 9 : présomption réfutable de stage 3 à 90 jours.'],
      cas: [],
      figures: byArrears.length >= 2 ? [{ kind: 'bar3d', title: "Impayés par contrepartie — les plus élevés", categories: byArrears.slice(0, 10).map((e) => e.key.slice(0, 28)), series: [{ name: 'Impayés', values: byArrears.slice(0, 10).map((e) => Math.round(e.v.arrears ?? 0)) }], unit, lecture: `${byArrears[0]!.key} porte ${money(byArrears[0]!.v.arrears, unit)} d'impayés.` }] : [],
      tables: byArrears.length ? [{ title: 'Contreparties en impayé', head: ['Contrepartie', B, 'Impayés', `Impayés / ${B}`], rows: byArrears.slice(0, 12).map((e) => [e.key, money(e.v[f.base], unit), money(e.v.arrears, unit), fmtPct((e.v[f.base] ?? 0) ? (e.v.arrears ?? 0) / (e.v[f.base] ?? 1) : 0)]) }] : [],
      recommandations: f.flags.highArrears.length
        ? [{ priority: 'P1', title: `Plan de recouvrement des ${f.flags.highArrears.length} contreparties les plus dégradées`, action: `Pour ${list(f.flags.highArrears)} : point de situation sous 15 jours, protocole d'apurement ou mise en recouvrement, vérification de la classe (douteux / stage 3).`, owner: 'Recouvrement / Engagements', due: 'Sous 30 jours', kpi: `Impayés de ces contreparties (aujourd'hui ${money(highA, unit)})` }]
        : [{ priority: 'P2', title: 'Suivi mensuel des impayés par contrepartie', action: 'Publier chaque mois les impayés par contrepartie avec leur ancienneté.', owner: 'Engagements', due: 'Prochain arrêté', kpi: 'Tableau publié chaque mois' }],
      lecture: `${fmtPct(f.ratios.arrearsRate ?? 0)} de l'${B} est en impayé ; ${f.flags.highArrears.length} nom(s) concentrent la dégradation.`,
    });
    messages.push(`Impayés : ${money(A, unit)}, soit ${fmtPct(f.ratios.arrearsRate ?? 0)} de l'${B} ; ${f.flags.highArrears.length} contrepartie(s) en impayé sur plus de la moitié de leur ${B}.`);
    if (f.flags.highArrears.length) decisions.push(`Lancer le plan de recouvrement des ${f.flags.highArrears.length} contreparties les plus dégradées (${list(f.flags.highArrears, 3)}).`);
  }

  // 3. COUVERTURE PAR LES PROVISIONS.
  if (f.roles.provision && f.totals.provision !== undefined) {
    const P = f.totals.provision;
    const lowA = N(sumOf(f, f.flags.lowCoverage, 'arrears'));
    const lowP = N(sumOf(f, f.flags.lowCoverage, 'provision'));
    const provNoArrears = N(f.ranking.filter((e) => (e.v.provision ?? 0) > 0 && !(e.v.arrears ?? 0)).length);
    chapters.push({
      title: 'Provisions et couverture',
      headline: f.ratios.provToArrears !== undefined ? `Les provisions (${money(P, unit)}) couvrent ${fmtPct(f.ratios.provToArrears)} des impayés` : `Provisions : ${money(P, unit)}, soit ${fmtPct(f.ratios.provToOut ?? 0)} de l'${B}`,
      constats: [
        `Provisions : ${money(P, unit)}, soit ${fmtPct(f.ratios.provToOut ?? 0)} de l'${B}${f.ratios.provToArrears !== undefined ? ` et ${fmtPct(f.ratios.provToArrears)} des impayés` : ''}.`,
        f.flags.lowCoverage.length ? `${f.flags.lowCoverage.length} contrepartie(s) en impayé ont des provisions inférieures à ${fmtPct(THRESHOLDS.lowCoverage, 0)} de leurs impayés : ${list(f.flags.lowCoverage)} — ${money(lowP, unit)} de provisions pour ${money(lowA, unit)} d'impayés.` : f.roles.arrears ? `Toutes les contreparties en impayé ont des provisions d'au moins ${fmtPct(THRESHOLDS.lowCoverage, 0)} de leurs impayés.` : '',
        provNoArrears ? `${provNoArrears} contrepartie(s) sans impayé portent des provisions (provisionnement prospectif IFRS 9 — stages 1 et 2).` : '',
      ].filter(Boolean),
      analyse: [
        `La couverture des impayés par les provisions ne suffit pas à juger le niveau de provisionnement : il dépend aussi des garanties, de l'ancienneté de l'impayé, du stage IFRS 9 et des paramètres PD / LGD, absents de ce tableau. Les écarts relevés ici sont donc des dossiers à revoir, pas une insuffisance établie.`,
        f.flags.lowCoverage.length ? `Les ${f.flags.lowCoverage.length} contrepartie(s) faiblement provisionnées au regard de leurs impayés sont la première liste à confronter aux garanties détenues et au stage retenu.` : '',
      ].filter(Boolean),
      cadre: ['IFRS 9 (§5.5) : dépréciation sur les pertes attendues à 12 mois (stage 1) ou à maturité (stages 2 et 3) ; BCEAO : provisionnement des créances douteuses selon l’ancienneté et les garanties.'],
      cas: [],
      figures: [{ kind: 'col3d', title: 'Impayés et provisions — 10 premières contreparties', categories: top.map((e) => e.key.slice(0, 22)), series: [...(f.roles.arrears ? [{ name: 'Impayés', values: top.map((e) => Math.round(e.v.arrears ?? 0)) }] : []), { name: 'Provisions', values: top.map((e) => Math.round(e.v.provision ?? 0)) }], unit, lecture: 'l’écart entre les deux barres d’une même contrepartie est la part d’impayé non provisionnée, à rapprocher des garanties.' }],
      tables: f.flags.lowCoverage.length ? [{ title: 'Impayés faiblement provisionnés', head: ['Contrepartie', 'Impayés', 'Provisions', 'Couverture'], rows: f.ranking.filter((e) => f.flags.lowCoverage.includes(e.key)).slice(0, 12).map((e) => [e.key, money(e.v.arrears, unit), money(e.v.provision, unit), fmtPct((e.v.arrears ?? 0) ? (e.v.provision ?? 0) / (e.v.arrears ?? 1) : 0)]) }] : [],
      recommandations: [{ priority: f.flags.lowCoverage.length ? 'P1' : 'P3', title: f.flags.lowCoverage.length ? `Revue de couverture des ${f.flags.lowCoverage.length} contreparties faiblement provisionnées` : 'Rapprocher provisions, stages et garanties', action: f.flags.lowCoverage.length ? `Pour ${list(f.flags.lowCoverage)} : confronter impayés, garanties valorisées, stage IFRS 9 et classe BCEAO ; documenter le niveau de provision retenu.` : 'Rapprochement trimestriel provisions / stage / garanties par contrepartie.', owner: 'Provisionnement / Risques', due: 'Avant le prochain arrêté', kpi: 'Couverture documentée pour chaque contrepartie en impayé' }],
      lecture: f.ratios.provToArrears !== undefined ? `${fmtPct(f.ratios.provToArrears)} des impayés sont couverts par les provisions ; le reste se lit avec les garanties.` : undefined,
    });
    if (f.ratios.provToArrears !== undefined) messages.push(`Les provisions couvrent ${fmtPct(f.ratios.provToArrears)} des impayés (${money(P, unit)} pour ${money(f.totals.arrears, unit)}) — couverture à revoir avec les garanties et le stage, pas une insuffisance établie.`);
    if (f.flags.lowCoverage.length) decisions.push(`Faire revoir la couverture des ${f.flags.lowCoverage.length} contreparties en impayé faiblement provisionnées avant le prochain arrêté.`);
  }

  // 4. GARANTIES.
  if (f.roles.collateral && f.totals.collateral !== undefined) {
    const C = f.totals.collateral;
    const uncA = N(sumOf(f, f.flags.uncovered, 'arrears'));
    chapters.push({
      title: 'Garanties',
      headline: `Les garanties (${money(C, unit)}) représentent ${fmtPct(f.ratios.collToOut ?? 0)} de l'${B}`,
      constats: [
        `Garanties déclarées : ${money(C, unit)}, soit ${fmtPct(f.ratios.collToOut ?? 0)} de l'${B}${f.ratios.collToArrears !== undefined ? ` et ${fmtPct(f.ratios.collToArrears)} des impayés` : ''}.`,
        f.flags.noCollateral.length ? `${f.flags.noCollateral.length} contrepartie(s) n'ont aucune garantie déclarée : ${list(f.flags.noCollateral)} — ${money(N(sumOf(f, f.flags.noCollateral, f.base)), unit)} d'${B} en blanc.` : 'Toutes les contreparties ont au moins une garantie déclarée.',
        f.flags.uncovered.length ? `${f.flags.uncovered.length} contrepartie(s) en impayé ont des garanties inférieures à leurs impayés : ${list(f.flags.uncovered)} (${money(uncA, unit)} d'impayés).` : '',
      ].filter(Boolean),
      analyse: [`Une garantie ne vaut que sa valeur de réalisation : les montants déclarés sont à décoter (nature, rang, ancienneté de l'évaluation) avant d'en déduire une couverture effective. L'${B} sans garantie déclarée est le premier risque de perte en cas de défaut.`],
      cadre: ['Acte uniforme OHADA portant organisation des sûretés : rang et opposabilité des sûretés ; IFRS 9 : la garantie réduit la perte en cas de défaut (LGD), pas la probabilité de défaut.'],
      cas: [],
      figures: [{ kind: 'col3d', title: `${B[0]!.toUpperCase()}${B.slice(1)} et garanties — 10 premières contreparties`, categories: top.map((e) => e.key.slice(0, 22)), series: [{ name: B, values: top.map((e) => Math.round(e.v[f.base] ?? 0)) }, { name: 'Garanties', values: top.map((e) => Math.round(e.v.collateral ?? 0)) }], unit, lecture: `une barre « garanties » plus basse que l'${B} signale une part en blanc.` }],
      tables: [],
      recommandations: [{ priority: f.flags.noCollateral.length ? 'P2' : 'P3', title: 'Mettre à jour et décoter les garanties', action: `Revaloriser les garanties des ${Math.min(10, f.entities)} premières contreparties et appliquer une décote par nature ; ${f.flags.noCollateral.length ? `rechercher une sûreté pour ${list(f.flags.noCollateral, 3)}.` : 'documenter la valeur de réalisation.'}`, owner: 'Juridique / Engagements', due: 'Sous 3 mois', kpi: 'Garanties revalorisées depuis moins de 12 mois : 100 %' }],
      lecture: `${fmtPct(f.ratios.collToOut ?? 0)} de l'${B} est adossé à des garanties déclarées, avant décote.`,
    });
    messages.push(`Garanties déclarées : ${fmtPct(f.ratios.collToOut ?? 0)} de l'${B} ; ${f.flags.noCollateral.length} contrepartie(s) sans aucune garantie.`);
  }

  // 5. LIMITES.
  if (f.roles.limit && f.totals.limit !== undefined) {
    const L = f.totals.limit;
    chapters.push({
      title: 'Utilisation des limites',
      headline: `${fmtPct(f.ratios.utilisation ?? 0)} des limites utilisées ; ${f.flags.overLimit.length} dépassement(s)`,
      constats: [
        `Limites autorisées : ${money(L, unit)} pour ${money(T, unit)} d'${B}, soit ${fmtPct(f.ratios.utilisation ?? 0)} d'utilisation et ${money(N(Math.max(0, L - T)), unit)} de marge non tirée.`,
        f.flags.overLimit.length ? `${f.flags.overLimit.length} contrepartie(s) dépassent leur limite : ${list(f.flags.overLimit)}.` : 'Aucune contrepartie ne dépasse sa limite.',
        f.flags.nearLimit.length ? `${f.flags.nearLimit.length} contrepartie(s) utilisent au moins ${fmtPct(THRESHOLDS.nearLimit, 0)} de leur limite : ${list(f.flags.nearLimit)}.` : '',
      ].filter(Boolean),
      analyse: [f.flags.overLimit.length ? 'Un dépassement de limite est un engagement non autorisé : il appelle une régularisation (autorisation ou remboursement) et la recherche de sa cause.' : `Les limites encadrent l'${B} ; la marge non tirée est un engagement potentiel à suivre (hors bilan).`],
      cadre: [],
      cas: [],
      figures: [],
      tables: f.flags.overLimit.length || f.flags.nearLimit.length ? [{ title: 'Limites saturées ou dépassées', head: ['Contrepartie', B, 'Limite', 'Utilisation'], rows: f.ranking.filter((e) => f.flags.overLimit.includes(e.key) || f.flags.nearLimit.includes(e.key)).slice(0, 12).map((e) => [e.key, money(e.v[f.base], unit), money(e.v.limit, unit), fmtPct((e.v.limit ?? 0) ? (e.v[f.base] ?? 0) / (e.v.limit ?? 1) : 0)]) }] : [],
      recommandations: [{ priority: f.flags.overLimit.length ? 'P1' : 'P3', title: f.flags.overLimit.length ? `Régulariser les ${f.flags.overLimit.length} dépassement(s) de limite` : 'Suivre la marge non tirée', action: f.flags.overLimit.length ? `Pour ${list(f.flags.overLimit)} : autorisation complémentaire ou plan de réduction, cause du dépassement documentée.` : 'Suivi mensuel de la marge non tirée par contrepartie.', owner: 'Engagements', due: f.flags.overLimit.length ? 'Sous 15 jours' : 'Prochain arrêté', kpi: f.flags.overLimit.length ? 'Nombre de dépassements : 0' : 'Marge non tirée publiée' }],
      lecture: `utilisation ${fmtPct(f.ratios.utilisation ?? 0)} ; ${f.flags.overLimit.length} dépassement(s).`,
    });
    messages.push(`Limites utilisées à ${fmtPct(f.ratios.utilisation ?? 0)} ; ${f.flags.overLimit.length} dépassement(s), ${f.flags.nearLimit.length} limite(s) saturée(s) à ${fmtPct(THRESHOLDS.nearLimit, 0)} ou plus.`);
    if (f.flags.overLimit.length) decisions.push(`Régulariser sous 15 jours les ${f.flags.overLimit.length} dépassement(s) de limite.`);
  }

  const thesis = [
    `${f.entities} contreparties portent ${money(T, unit)} d'${B} ; la première, ${f.conc.leader}, en porte ${fmtPct(f.conc.leaderShare)} et les 5 premières ${fmtPct(f.conc.top5)}.`,
    f.ratios.arrearsRate !== undefined ? `Les impayés atteignent ${money(f.totals.arrears, unit)} (${fmtPct(f.ratios.arrearsRate)} de l'${B})${f.flags.highArrears.length ? `, concentrés sur ${f.flags.highArrears.length} contrepartie(s) en impayé sur plus de la moitié de leur ${B}` : ''}.` : '',
    f.ratios.provToArrears !== undefined ? `Ils sont couverts à ${fmtPct(f.ratios.provToArrears)} par les provisions${f.ratios.collToArrears !== undefined ? ` et à ${fmtPct(f.ratios.collToArrears)} par les garanties déclarées` : ''}.` : '',
    `Le comité est appelé à ${decisions.length > 1 ? 'voter le plafond de concentration et le traitement nominatif des contreparties dégradées' : 'voter un plafond de concentration'}.`,
  ]
    .filter(Boolean)
    .join(' ');
  const hypotheses = [
    { title: 'Périmètre', text: `Les chiffres portent sur les ${f.entities} contreparties du tableau exporté, agrégées par « ${f.entityCol} » ; les parts sont calculées sur ce total, pas sur le portefeuille entier.` },
    { title: 'Mesure de base', text: `L'${B} est la colonne « ${f.roles[f.base]} ».${f.roles.limit ? ` Les limites (« ${f.roles.limit} ») ne servent qu'au taux d'utilisation.` : ''}` },
    ...(f.roles.arrears ? [{ title: 'Impayés élevés', text: `Une contrepartie est « dégradée » quand ses impayés (« ${f.roles.arrears} ») atteignent ${fmtPct(THRESHOLDS.highArrears, 0)} de son ${B} (seuil d'analyse, ajustable).` }] : []),
    ...(f.roles.provision ? [{ title: 'Couverture faible', text: `Couverture = provisions (« ${f.roles.provision} ») / impayés ; « faible » sous ${fmtPct(THRESHOLDS.lowCoverage, 0)}. Sans PD, LGD, stage ni ancienneté, aucune insuffisance de provision n'est conclue.` }] : []),
    ...(f.roles.collateral ? [{ title: 'Garanties', text: `Montants déclarés (« ${f.roles.collateral} »), avant décote : la couverture effective est inférieure.` }] : []),
    ...(f.roles.limit ? [{ title: 'Limites', text: `Utilisation = ${B} / limite ; saturée à partir de ${fmtPct(THRESHOLDS.nearLimit, 0)}, dépassée au-delà de 100 %.` }] : []),
    { title: 'Concentration', text: 'HHI = somme des parts au carré ; lecture usuelle : < 0,15 faible, 0,15–0,25 modérée, ≥ 0,25 forte.' },
  ];
  const glossary = [
    { term: 'Encours', def: 'Montant dû par la contrepartie (impayés inclus quand la colonne les comprend).' },
    { term: "Taux d'impayés", def: "Impayés / encours du périmètre." },
    { term: 'Couverture', def: 'Provisions / impayés : part des impayés déjà dépréciée.' },
    { term: 'HHI', def: 'Indice de Herfindahl-Hirschman : somme des parts au carré (1 = une seule contrepartie).' },
    { term: 'n80', def: 'Nombre de contreparties qui font 80 % de l’encours.' },
    { term: 'Stage IFRS 9', def: '1 sain, 2 dégradation significative, 3 défaut — horizon de la perte attendue.' },
  ];
  return { thesis, messages, chapters, kpis, decisions, hypotheses, glossary, numbers: nums.filter((x) => Number.isFinite(x)) };
}

/** A short Markdown of the facts (for the model's brief: it writes from these figures, never others). */
export function creditToMarkdown(f: CreditFacts, unit = 'XOF'): string {
  const n = creditNarrative(f, unit);
  return [`### Lecture crédit (${f.entities} contreparties, base « ${f.roles[f.base]} »)`, ...n.kpis.map((k) => `- ${String(k.label)} : ${String(k.value)} (${String(k.sub)})`), ...n.messages.map((m) => `- ${m}`)].join('\n');
}
