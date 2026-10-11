// ANALYSTE DU TABLEAU DE BORD — choisit ce qui mérite d'être montré, comme le ferait un analyste :
//  - chaque colonne texte est PROFILÉE : combien elle explique les montants (rapport de corrélation η²), équilibre de
//    ses catégories (entropie), lisibilité de ses valeurs ; les codes (« NP »), devises, drapeaux O/N et identifiants
//    sont écartés des graphiques et des filtres ;
//  - les FILTRES (segments) sont les axes que l'on veut vraiment découper : peu de valeurs lisibles, fort pouvoir
//    explicatif, une période (année / mois) quand il y a une date ;
//  - les TITRES sont écrits en langage clair (noms de colonnes humanisés) avec le fait saillant mesuré (concentration,
//    évolution). Rien n'est inventé : tout vient des lignes.
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export interface ColProfile {
  col: string;
  distinct: number;
  /** Share of the most frequent value (0..1). */
  topShare: number;
  /** η²: share of the main measure's variance explained by this column (0..1). */
  eta2: number;
  /** Normalised entropy of the row counts per value (0 = one value, 1 = perfectly balanced). */
  balance: number;
  readable: number;
  reasons: string[];
  score: number;
}

const CURRENCIES = new Set('XOF XAF EUR USD GBP JPY CHF CAD CNY NGN GHS MAD ZAR KES EGP TND DZD GNF CDF'.split(' '));
const CURRENCY_NAME = /devise|currency|\bccy\b|monnaie/i;
const ID_NAME = /\bid\b|identifiant|customer|client\s*(n|id|code)|compte|account|contrat|contract|r[ée]f[ée]rence|\bref\b|matricule|num[ée]ro|\bn°|code|isin|cusip|swift|iban/i;
const FLAG = /^(y|n|o|yes|no|oui|non|true|false|vrai|faux|0|1|x|-)$/i;
const ABBR = /^[A-Z0-9]{1,3}$/;

/** Correlation ratio η² of a numeric measure by the groups of a text column. */
export function eta2(rows: Record<string, unknown>[], col: string, measure: string | null): number {
  if (!measure) return 0;
  const groups = new Map<string, { n: number; s: number }>();
  let n = 0;
  let s = 0;
  let s2 = 0;
  for (const r of rows) {
    const v = r[measure];
    if (!isNum(v)) continue;
    const k = String(r[col] ?? '');
    const g = groups.get(k) ?? { n: 0, s: 0 };
    g.n++;
    g.s += v;
    groups.set(k, g);
    n++;
    s += v;
    s2 += v * v;
  }
  if (n < 3) return 0;
  const mean = s / n;
  const total = s2 - n * mean * mean;
  if (total <= 0) return 0;
  let between = 0;
  for (const g of groups.values()) between += g.n * (g.s / g.n - mean) ** 2;
  return Math.max(0, Math.min(1, between / total));
}

/** Profiles the text columns of a table against its main measure (most useful first). */
export function profileColumns(rows: Record<string, unknown>[], textCols: string[], measure: string | null): ColProfile[] {
  return textCols
    .map((col) => {
      const counts = new Map<string, number>();
      let filled = 0;
      for (const r of rows) {
        const v = r[col];
        if (v === null || v === undefined || String(v).trim() === '') continue;
        filled++;
        const k = String(v).trim();
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const vals = [...counts.keys()];
      const distinct = vals.length;
      const top = Math.max(0, ...counts.values());
      const topShare = filled ? top / filled : 1;
      let ent = 0;
      for (const c of counts.values()) {
        const p = c / Math.max(1, filled);
        ent -= p * Math.log(p);
      }
      const balance = distinct > 1 ? ent / Math.log(distinct) : 0;
      const reasons: string[] = [];
      const abbr = vals.filter((v) => ABBR.test(v)).length / Math.max(1, distinct);
      const flags = vals.every((v) => FLAG.test(v));
      const currency = CURRENCY_NAME.test(col) || (distinct > 0 && vals.filter((v) => CURRENCIES.has(v.toUpperCase())).length / distinct >= 0.6);
      const idLike = ID_NAME.test(col) || distinct > Math.max(40, rows.length * 0.5);
      const meanLen = vals.reduce((a, v) => a + v.length, 0) / Math.max(1, distinct);
      let readable = Math.min(1, meanLen / 6);
      if (abbr >= 0.7) {
        readable *= 0.3;
        reasons.push('valeurs en codes abrégés');
      }
      if (flags) reasons.push('simple drapeau oui / non');
      if (currency) reasons.push('devise (peu d’intérêt analytique)');
      if (idLike) reasons.push('identifiant / trop de valeurs');
      if (distinct < 2) reasons.push('une seule valeur');
      if (topShare > 0.95) reasons.push('une valeur écrase les autres');
      const e = eta2(rows, col, measure);
      let score = 0.5 * e + 0.3 * balance + 0.2 * readable;
      if (abbr >= 0.7) score *= 0.4;
      if (flags) score *= 0.3;
      if (currency) score *= 0.15;
      if (idLike || distinct < 2 || topShare > 0.95) score = 0;
      return { col, distinct, topShare, eta2: e, balance, readable, reasons, score: Math.round(score * 1000) / 1000 };
    })
    .sort((a, b) => b.score - a.score);
}

/** Dimensions for the charts: useful, 2–40 values. */
export const chartDims = (p: ColProfile[]): string[] => p.filter((x) => x.score >= 0.12 && x.distinct >= 2 && x.distinct <= 40).map((x) => x.col);
/** Dimensions for the SEGMENTS (slicers): 2–12 readable values, real explanatory power, no code / currency / flag. */
/** Entities (a client, a counterparty, a debtor): read as a ranking, never as a segment. */
const ENTITY = /client|customer|nom\b|name|relation|d[ée]biteur|tiers|soci[ée]t[ée]|raison sociale|contrepartie|counterparty|fournisseur|supplier/i;
export const filterDims = (p: ColProfile[], max = 2): string[] =>
  p.filter((x) => x.score >= 0.15 && x.distinct >= 2 && x.distinct <= 12 && x.readable >= 0.3 && !ENTITY.test(x.col) && !x.reasons.some((r) => /devise|drapeau|codes/.test(r))).slice(0, max).map((x) => x.col);

// ── clear names ──────────────────────────────────────────────────────────────────────────────────────────────────
const WORDS: Record<string, string> = {
  mt: 'montant', mnt: 'montant', amt: 'montant', amount: 'montant', nb: 'nombre', nbr: 'nombre', qte: 'quantité', qty: 'quantité',
  ccy: 'devise', currency: 'devise', cpt: 'compte', cli: 'client', prod: 'produit', region: 'région', branch: 'agence',
  dt: 'date', val: 'valeur', value: 'valeur', tot: 'total', total: 'total', pct: '%', sales: 'ventes', revenue: 'chiffre d’affaires',
  balance: 'solde', outstanding: 'encours', relationship: 'relation client', group: 'groupe', name: 'nom', country: 'pays',
  sector: 'secteur', status: 'statut', security: 'titre', provisions: 'provisions', provision: 'provision', regulatory: 'réglementaires',
  date: 'date', customer: 'client', product: 'produit', count: 'nombre', average: 'moyenne', rate: 'taux', type: 'type',
};
const DROP = new Set(['in', 'per', 'of', 'the']);
/** English word order once translated (« titre devise » → « devise du titre »). */
const PHRASES: [RegExp, string][] = [
  [/^groupe nom$/, 'groupe'],
  [/^(\S+) nom$/, 'nom $1'],
  [/^titre devise$/, 'devise du titre'],
  [/^client nom$/, 'client'],
];
/**
 * A column name as a reader would say it: « Ftotal In Local Currency » → « Total (devise locale) »,
 * « PDO Amount In Local Currency » → « Montant PDO (devise locale) », « CProvisions Per Local Regulatory… » →
 * « Provisions réglementaires (devise locale) ». Acronyms (PDO, NPL) are kept as they are.
 */
export function human(col: string, max = 32): string {
  let s = col
    // a stray letter glued to a word by the source (« Ftotal », « CProvisions », « GRelationship »)
    .replace(/^[A-Z](?=[A-Z][a-z]{3,})/, '')
    .replace(/^[A-Za-z](?=total\b)/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\((\w)\/(\w+)\)/g, '')
    .replace(/[_.\-/]+/g, ' ');
  let local = false;
  s = s.replace(/\b(in\s+)?local\s+currency\b/i, () => {
    local = true;
    return ' ';
  });
  const including = /\bincluding\b\s+(\S+)/i.exec(s);
  s = s.replace(/\bincluding\b\s+\S+/i, ' ');
  const words = s.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    if (/^[A-Z0-9]{2,5}$/.test(w)) out.push(w);
    else if (DROP.has(w.toLowerCase())) continue;
    else if (w.toLowerCase() === 'local') out.push('locales');
    else out.push(WORDS[w.toLowerCase()] ?? w.toLowerCase());
  }
  // « PDO montant » → « montant PDO » (English puts the qualifier first).
  for (let i = 0; i + 1 < out.length; i++)
    if (/^[A-Z0-9]{2,5}$/.test(out[i]!) && /^(montant|total|nombre|taux|solde|encours)$/.test(out[i + 1]!)) [out[i], out[i + 1]] = [out[i + 1]!, out[i]!];
  if (out[0] === 'provisions' && out.includes('réglementaires')) {
    const k = out.indexOf('locales');
    if (k >= 0) out.splice(k, 1);
  }
  let r = out.join(' ');
  for (const [rx, to] of PHRASES) r = r.replace(rx, to);
  if (including) r += ` y compris ${including[1]}`;
  if (local && r.length + 17 <= max) r += ' (devise locale)';
  r = r.charAt(0).toUpperCase() + r.slice(1);
  return r.length > max ? `${r.slice(0, max - 1).trim()}…` : r || col;
}
const lc = (s: string) => (/^[A-ZÀ-Ý]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Clear, informative chart titles with the measured highlight. */
export function viewTitle(o: { measure: string | null; by?: string; month?: boolean; categories: string[]; values: number[]; pie?: boolean }): { title: string; insight: string } {
  const m = o.measure ? human(o.measure, 22) : 'Nombre';
  const total = o.values.reduce((a, b) => a + b, 0);
  if (o.month) {
    // Last 12 months against the 12 before (or the two halves of a shorter window): a sum, never a single tiny month.
    const k = Math.min(12, Math.floor(o.values.length / 2));
    const recent = o.values.slice(-k).reduce((a, b) => a + b, 0);
    const before = o.values.slice(-2 * k, -k).reduce((a, b) => a + b, 0);
    const ch = before ? (recent - before) / Math.abs(before) : 0;
    const ok = k >= 2 && before && Math.abs(ch) < 10;
    return { title: `Évolution mensuelle — ${lc(m)}`, insight: ok ? `${ch >= 0 ? '+' : ''}${pct(ch)} sur ${k} mois vs ${k} mois précédents` : '' };
  }
  const by = o.by ? lc(human(o.by, 26)) : 'catégorie';
  const top3 = total ? o.values.slice(0, 3).reduce((a, b) => a + b, 0) / total : 0;
  const lead = total && o.categories[0] ? `${o.categories[0]} : ${pct((o.values[0] ?? 0) / total)}` : '';
  return o.pie
    ? { title: `Répartition — ${lc(m)} par ${by}`, insight: lead }
    : { title: `${m} par ${by}`, insight: o.categories.length > 4 && top3 ? `top 3 = ${pct(top3)} du total` : lead };
}
/** Rate / ratio columns are averaged, never summed. */
export const isRate = (col: string) => /taux|rate|ratio|%|pourcent|percent|marge|margin|score|note\b/i.test(col);
